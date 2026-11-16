let pdfjsPromise = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/build/pdf.mjs'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ])
      .then(([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      })
      .catch((error) => {
        pdfjsPromise = null;
        throw error;
      });
  }
  return pdfjsPromise;
}

function fileName(url) {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (segment) return decodeURIComponent(segment);
  } catch {}
  return 'paper.pdf';
}

export function mountPreview(root = document) {
  const view = root.querySelector('[data-preview]');
  if (!view) return null;

  const back = view.querySelector('[data-preview-back]');
  const card = view.querySelector('[data-preview-card]');
  const loader = view.querySelector('[data-preview-loader]');
  const status = view.querySelector('[data-preview-status]');
  const pages = view.querySelector('[data-preview-pages]');
  const download = view.querySelector('[data-preview-download]');
  const downloadLabel = view.querySelector('[data-preview-download-label]');

  if (!back || !card || !loader || !status || !pages || !download || !downloadLabel) {
    return null;
  }

  let token = 0;
  let task = null;
  let observer = null;
  let activeRoute = null;
  let entries = [];
  let firstPageDrawn = false;

  function teardown() {
    token += 1;
    observer?.disconnect();
    observer = null;
    entries = [];
    firstPageDrawn = false;
    pages.replaceChildren();
    pages.hidden = true;
    loader.hidden = false;
    status.textContent = '';
    status.hidden = true;
    card.setAttribute('aria-busy', 'true');
    download.disabled = true;
    downloadLabel.textContent = 'Download';
    if (task) {
      task.destroy();
      task = null;
    }
  }

  function fail(message) {
    loader.hidden = true;
    status.textContent = message;
    status.hidden = false;
    card.setAttribute('aria-busy', 'false');
    pages.hidden = true;
  }

  async function drawPage(entry, pdf, current) {
    if (entry.done) return;
    entry.done = true;

    const page = await pdf.getPage(entry.number);
    if (current !== token) return;

    const base = page.getViewport({ scale: 1 });
    const width = entry.element.clientWidth || pages.clientWidth;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({
      scale: Math.max(width, 1) / base.width * ratio,
    });

    const canvas = document.createElement('canvas');
    canvas.className = 'md3-preview__canvas';
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Page ${entry.number}`);

    const context = canvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: context, viewport }).promise;
    if (current !== token) return;

    entry.element.replaceChildren(canvas);
    await page.cleanup();
    if (current !== token) return;

    if (!firstPageDrawn) {
      firstPageDrawn = true;
      loader.hidden = true;
    }
  }

  function watch(element, number, pdf, current) {
    const entry = { element, number, done: false };
    entries.push(entry);

    observer ??= new IntersectionObserver(
      (items) => {
        items.forEach((item) => {
          if (!item.isIntersecting) return;
          const target = entries.find((row) => row.element === item.target);
          if (!target) return;
          observer.unobserve(item.target);
          drawPage(target, pdf, current).catch(() => {
            if (current !== token) return;
            target.done = false;
            fail('Failed to load preview');
          });
        });
      },
      { root: card, rootMargin: '400px 0px' },
    );

    observer.observe(element);
  }

  async function show(route) {
    teardown();
    const current = token;

    activeRoute = route;
    document.documentElement.dataset.view = 'preview';
    window.scrollTo({ top: 0, left: 0 });
    card.scrollTop = 0;

    document.title = `PDF Preview · KTU ${route.kind === 'notes' ? 'Notes' : 'Archive'}`;

    try {
      const pdfjs = await loadPdfjs();
      if (current !== token) return;

      const loadingTask = pdfjs.getDocument({ url: route.url });
      task = loadingTask;
      const pdf = await loadingTask.promise;
      if (current !== token) {
        task = null;
        pdf.destroy();
        return;
      }

      pages.hidden = false;
      card.setAttribute('aria-busy', 'false');

      for (let number = 1; number <= pdf.numPages; number += 1) {
        if (current !== token) return;
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        const element = document.createElement('div');
        element.className = 'md3-preview__page';
        element.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
        pages.append(element);
        watch(element, number, pdf, current);
      }

      if (current !== token) return;
      download.disabled = false;
      if (pdf.numPages === 0) {
        loader.hidden = true;
        status.textContent = 'No pages found';
        status.hidden = false;
      }
    } catch {
      if (current !== token) return;
      fail('Failed to load preview');
    }
  }

  function hide() {
    teardown();
    activeRoute = null;
    if (document.documentElement.dataset.view === 'preview') {
      document.documentElement.dataset.view = '';
      document.title = 'KTU Archive';
      window.scrollTo({ top: 0, left: 0 });
    }
  }

  function open(route) {
    if (!route?.url) return;
    window.history.pushState({ ktuView: 'preview', route }, '', window.location.href);
    show(route);
  }

  back.addEventListener('click', (event) => {
    event.preventDefault();
    if (window.history.state?.ktuView === 'preview') {
      window.history.back();
      return;
    }
    hide();
  });

  download.addEventListener('click', async () => {
    if (!activeRoute?.url) return;
    download.disabled = true;
    downloadLabel.textContent = 'Preparing download';
    try {
      const response = await fetch(activeRoute.url);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName(activeRoute.url);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'paper_download', {
          subject_code: activeRoute.code,
          semester: activeRoute.semester,
          kind: activeRoute.kind || 'pyq',
          zip_mode: false,
          file_count: 1,
        });
      }
      downloadLabel.textContent = 'Downloaded';
    } catch {
      downloadLabel.textContent = 'Download failed';
    } finally {
      window.setTimeout(() => {
        download.disabled = false;
        downloadLabel.textContent = 'Download';
      }, 1600);
    }
  });

  window.addEventListener('popstate', (event) => {
    if (event.state?.ktuView === 'preview') {
      show(event.state.route);
      return;
    }
    hide();
  });

  return { open };
}
