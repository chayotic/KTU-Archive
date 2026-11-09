import { buildCatalog } from '../archive/catalog.js';
import { selectionPath } from '../archive/paths.js';
import { fetchCatalog, fetchNotes, fetchPapers } from '../../services/archive.js';
import { readPapersPrefetch } from './cache.js';
import { createZip } from './zip.js';

const MONTH_PATTERN =
  /\b(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s*(\d{4})\b/i;

function paperMeta(title) {
  const value = (title ?? '').trim();
  if (!value) return { primary: 'Question Paper', tags: [] };

  const tags = [];
  const remainder = value
    .replace(/\(([^)]*)\)/g, (_, tag) => {
      const cleaned = tag.trim();
      if (cleaned) tags.push(`(${cleaned})`);
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .replace(/^[,;:\-–—\s]+|[,;:\-–—\s]+$/g, '')
    .trim();

  if (!remainder && tags.length === 1 && tags[0].toUpperCase() === '(MOD)') {
    return { primary: 'MODEL PAPER', tags: [] };
  }

  const match = remainder.match(MONTH_PATTERN);
  const primary = match ? `${match[1].toUpperCase()} ${match[2]}` : remainder;

  return {
    primary: primary || (tags.length === 0 ? 'Question Paper' : ''),
    tags,
  };
}

function createPaper(paper, kind, code, index) {
  const notes = kind === 'notes';
  const meta = notes
    ? {
        primary: cleanNotesTitle(paper.title, paper.module_number, code),
        tags: [],
      }
    : paperMeta(paper.title);
  const described = [meta.primary, ...meta.tags].filter(Boolean).join(' ') || 'item';

  const item = document.createElement('li');
  item.className = 'md3-paper';

  if (notes) item.classList.add('md3-paper--notes');

  const check = document.createElement('div');
  check.className = 'beer md3-paper__check';

  const labelElement = document.createElement('label');
  labelElement.className = 'checkbox';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = paper.url;
  input.dataset.paperSelect = '';
  input.dataset.downloadName = notes
    ? `${safeFileName(`${code}-${meta.primary || `Module ${paper.module_number}`}`)}.pdf`
    : fileName(paper.url, index);
  input.setAttribute('aria-label', `Select ${described}`);

  const mark = document.createElement('span');
  labelElement.append(input, mark);
  check.append(labelElement);

  const info = document.createElement('span');
  info.className = 'md3-paper__meta';

  if (meta.primary) {
    const date = document.createElement('span');
    date.className = 'md3-paper__date';
    date.textContent = meta.primary;
    info.append(date);
  }

  if (meta.tags.length > 0) {
    const tags = document.createElement('span');
    tags.className = 'md3-paper__tags';

    meta.tags.forEach((tag) => {
      const tagElement = document.createElement('span');
      tagElement.className = 'md3-paper__tag';
      tagElement.textContent = tag;
      tags.append(tagElement);
    });

    info.append(tags);
  }

  item.append(check, info);

  const moduleNumber = notes
    ? String(paper.module_number ?? '').match(/\d+/)?.[0]
    : null;

  if (moduleNumber) {
    const moduleLabel = document.createElement('span');
    moduleLabel.className = 'md3-paper__module';
    moduleLabel.textContent = `M${moduleNumber}`;
    item.append(moduleLabel);
  } else if (!notes) {
    const icon = document.createElement('span');
    icon.className = 'material-symbols-rounded md3-paper__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'description';
    item.append(icon);
  }

  item.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('input, label, a, button')) return;
    input.click();
  });

  return item;
}

function createEmpty(message) {
  const empty = document.createElement('div');
  empty.className = 'md3-paper-empty';
  empty.textContent = message;
  return empty;
}

function cleanNotesTitle(title, moduleNumber, code) {
  const value = (title ?? '').replace(/^M\d+[\s-]*/i, '').trim();
  return value || (moduleNumber != null ? `Module ${moduleNumber}` : '') || code || '';
}

function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || 'notes';
}

function fileName(url, index) {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (segment) return decodeURIComponent(segment);
  } catch {}
  return `paper-${index + 1}.pdf`;
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchBlob(url, onProgress) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(String(response.status));
  if (!response.body || !onProgress) return response.blob();

  const lengthHeader = Number(response.headers.get('content-length'));
  const total = Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(received, total);
  }

  return new Blob(chunks, { type: response.headers.get('content-type') || '' });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

export function mountPapers(root = document) {
  const view = root.querySelector('[data-papers]');
  if (!view) return null;

  const back = view.querySelector('.md3-page__back');
  const eyebrow = view.querySelector('[data-papers-eyebrow]');
  const title = view.querySelector('[data-papers-title]');
  const code = view.querySelector('[data-papers-code]');
  const card = view.querySelector('[data-papers-card]');
  const sectionTitle = view.querySelector('.md3-page__section-title');
  const actions = view.querySelector('[data-paper-actions]');
  const selectAllButton = view.querySelector('[data-paper-select-all]');
  const zipButton = view.querySelector('[data-paper-zip]');
  const download = view.querySelector('[data-paper-download]');
  const downloadLabel = view.querySelector('[data-paper-download-label]');
  const progressWrap = view.querySelector('[data-paper-progress]');
  const progressBar = view.querySelector('[data-paper-progress-bar]');
  const progressLabel = view.querySelector('[data-paper-progress-label]');
  const progressBeer = progressWrap?.querySelector('.beer');

  if (
    !back ||
    !eyebrow ||
    !title ||
    !code ||
    !card ||
    !actions ||
    !selectAllButton ||
    !zipButton ||
    !download ||
    !downloadLabel ||
    !progressWrap ||
    !progressBar ||
    !progressLabel
  ) {
    return null;
  }

  let zipMode = false;
  let busy = false;
  let activeCode = '';
  let activeSemester = '';
  let activeKind = 'pyq';
  let openToken = 0;
  let progressFrame = 0;
  let progressHideTimer = 0;

  function trackDownload(zip, count) {
    if (typeof window.gtag !== 'function' || count <= 0) return;
    window.gtag('event', 'paper_download', {
      subject_code: activeCode,
      semester: activeSemester,
      kind: activeKind,
      zip_mode: zip,
      file_count: count,
    });
  }

  function syncProgressTheme() {
    progressBeer?.classList.toggle(
      'dark',
      document.documentElement.dataset.theme === 'dark',
    );
  }

  syncProgressTheme();
  window.addEventListener('themechange', syncProgressTheme);

  function animateProgress(target) {
    cancelAnimationFrame(progressFrame);
    const from = Number(progressBar.value) || 0;
    const delta = target - from;
    const start = performance.now();
    const duration = 300;

    function frame(now) {
      const t = Math.min((now - start) / duration, 1);
      progressBar.value = from + delta * easeOutCubic(t);
      if (t < 1) progressFrame = requestAnimationFrame(frame);
    }

    progressFrame = requestAnimationFrame(frame);
  }

  function paperInputs() {
    return [...card.querySelectorAll('[data-paper-select]')];
  }

  function selectedInputs() {
    return paperInputs().filter((input) => input.checked);
  }

  function updateDownloadLabel() {
    const total = selectedInputs().length;
    if (total === 0) {
      downloadLabel.textContent = 'Download';
      return;
    }
    downloadLabel.textContent = zipMode ? `Download as ZIP (${total})` : `Download (${total})`;
  }

  function updateSelection() {
    const inputs = paperInputs();
    const total = inputs.length;
    const selected = inputs.filter((input) => input.checked);

    inputs.forEach((input) => {
      input.closest('.md3-paper')?.classList.toggle('is-selected', input.checked);
    });

    selectAllButton.setAttribute(
      'aria-pressed',
      String(total > 0 && selected.length === total),
    );
    download.disabled = selected.length === 0 || busy;
    updateDownloadLabel();
  }

  function showActions(canSelect, canDownload) {
    actions.hidden = !canSelect;
    download.hidden = !canDownload;
  }

  card.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof Element && target.matches('[data-paper-select]')) {
      updateSelection();
    }
  });

  selectAllButton.addEventListener('click', () => {
    const inputs = paperInputs();
    const allSelected = inputs.length > 0 && inputs.every((input) => input.checked);
    inputs.forEach((input) => {
      input.checked = !allSelected;
    });
    updateSelection();
  });

  zipButton.addEventListener('click', () => {
    zipMode = !zipMode;
    zipButton.setAttribute('aria-pressed', String(zipMode));
    updateDownloadLabel();
  });

  download.addEventListener('click', async () => {
    const selected = selectedInputs();
    if (selected.length === 0 || busy) return;

    busy = true;
    download.classList.add('is-loading');
    download.disabled = true;
    const asZip = zipMode;
    downloadLabel.textContent = asZip
      ? 'Preparing ZIP'
      : activeKind === 'notes'
        ? 'Preparing notes'
        : 'Preparing papers';

    const total = selected.length;
    let saved = 0;
    let completedBytes = 0;
    let totalBytes = 0;

    const sizes = await Promise.allSettled(
      selected.map(async (input) => {
        const head = await fetch(input.value, { method: 'HEAD' });
        const length = Number(head.headers.get('content-length'));
        return Number.isFinite(length) && length > 0 ? length : 0;
      }),
    );
    if (sizes.every((size) => size.status === 'fulfilled' && size.value > 0)) {
      totalBytes = sizes.reduce((sum, size) => sum + size.value, 0);
    }

    function report(currentBytes, currentTotal) {
      const received = completedBytes + currentBytes;
      if (totalBytes > 0) {
        animateProgress(Math.min((received / totalBytes) * 100, 100));
        progressLabel.textContent = `Downloading ${formatBytes(received)} of ${formatBytes(totalBytes)}`;
      } else if (currentTotal) {
        animateProgress(Math.min((currentBytes / currentTotal) * 100, 100));
        progressLabel.textContent = `Downloading ${formatBytes(received)}`;
      } else {
        progressLabel.textContent = `Downloading ${formatBytes(received)}`;
      }
    }

    progressWrap.hidden = false;
    cancelAnimationFrame(progressFrame);
    clearTimeout(progressHideTimer);
    progressBar.value = 0;
    progressLabel.textContent = 'Downloading 0 B';

    try {
      if (asZip) {
        const files = [];
        for (const [index, input] of selected.entries()) {
          try {
            const blob = await fetchBlob(input.value, report);
            completedBytes += blob.size;
            files.push({
              name: input.dataset.downloadName || fileName(input.value, index),
              data: new Uint8Array(await blob.arrayBuffer()),
            });
            saved += 1;
          } catch {}
          report(0, null);
        }
        if (files.length > 0) {
          const zipName = activeKind === 'notes' ? `${activeCode}-Notes.zip` : `${activeCode}.zip`;
          triggerDownload(createZip(files), zipName);
          animateProgress(100);
          progressLabel.textContent = `Downloaded ${formatBytes(completedBytes)}`;
        } else {
          progressLabel.textContent = 'Download failed';
        }
      } else {
        for (const [index, input] of selected.entries()) {
          try {
            const blob = await fetchBlob(input.value, report);
            completedBytes += blob.size;
            triggerDownload(blob, input.dataset.downloadName || fileName(input.value, index));
            saved += 1;
          } catch {}
          report(0, null);
          if (index < total - 1) await delay(400);
        }
        animateProgress(100);
        progressLabel.textContent = `Downloaded ${formatBytes(completedBytes)}`;
      }
    } finally {
      if (saved > 0) trackDownload(asZip, saved);
      busy = false;
      download.classList.remove('is-loading');
      updateSelection();
      clearTimeout(progressHideTimer);
      progressHideTimer = setTimeout(() => {
        progressWrap.hidden = true;
        progressBar.value = 0;
        progressLabel.textContent = '';
      }, 1200);
    }
  });

  back.addEventListener('click', (event) => {
    event.preventDefault();
    close();
  });

  function render(subjectName, items, kind) {
    const notes = kind === 'notes';
    const label = notes ? 'KTU Notes' : 'KTU Previous Year Question Papers';

    title.textContent = subjectName;
    if (sectionTitle) sectionTitle.textContent = notes ? 'Notes' : 'Question Papers';
    document.title =
      subjectName === activeCode
        ? `${activeCode} · ${label}`
        : `${subjectName} (${activeCode}) · ${label}`;

    const seen = new Set();
    const uniqueItems = (Array.isArray(items) ? items : []).filter((item) => {
      if (!item?.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });

    if (!items) {
      showActions(false, false);
      card.replaceChildren(createEmpty(notes ? 'Failed to fetch notes' : 'Failed to fetch papers'));
      return;
    }

    if (uniqueItems.length === 0) {
      showActions(false, false);
      card.replaceChildren(createEmpty(notes ? 'No notes found' : 'No papers found'));
      return;
    }

    const list = document.createElement('ul');
    list.className = 'md3-paper-list';
    uniqueItems.forEach((item, index) =>
      list.append(createPaper(item, kind, activeCode, index)),
    );
    card.replaceChildren(list);
    showActions(true, true);
    updateSelection();
  }

  function show(route) {
    const { semester, code: subjectCode, subjectName: routeName } = route;
    const notes = route.kind === 'notes';

    activeCode = subjectCode;
    activeSemester = semester;
    activeKind = notes ? 'notes' : 'pyq';
    const token = ++openToken;

    back.href = selectionPath(semester, subjectCode, activeKind);
    eyebrow.textContent = `Semester ${semester}`;
    code.textContent = subjectCode;
    if (sectionTitle) sectionTitle.textContent = notes ? 'Notes' : 'Question Papers';
    zipMode = false;
    busy = false;
    zipButton.setAttribute('aria-pressed', 'false');
    download.classList.remove('is-loading');
    progressWrap.hidden = true;
    cancelAnimationFrame(progressFrame);
    clearTimeout(progressHideTimer);
    progressBar.value = 0;
    progressLabel.textContent = '';

    document.documentElement.dataset.view = 'papers';
    window.scrollTo({ top: 0, left: 0 });

    const prefetched = readPapersPrefetch(semester, subjectCode);
    if (prefetched && prefetched.kind === activeKind) {
      render(prefetched.subjectName ?? routeName ?? subjectCode, prefetched.items, activeKind);
      return;
    }

    showActions(false, false);
    card.replaceChildren(createEmpty(notes ? 'Loading notes' : 'Loading papers'));

    if (notes) {
      fetchNotes(subjectCode, semester)
        .then((rows) => {
          if (token !== openToken) return;
          render(routeName || rows?.[0]?.subject_name || subjectCode, rows, 'notes');
        })
        .catch(() => {
          if (token !== openToken) return;
          render(routeName || subjectCode, null, 'notes');
        });
      return;
    }

    Promise.allSettled([
      fetchCatalog(),
      fetchPapers(subjectCode, semester),
    ]).then(([catalogResult, papersResult]) => {
      if (token !== openToken) return;

      let catalog = [];
      if (catalogResult.status === 'fulfilled' && catalogResult.value) {
        try {
          catalog = buildCatalog(catalogResult.value);
        } catch {
          catalog = [];
        }
      }

      const semesterEntry = catalog.find((entry) => entry.value === semester) ?? null;
      const subjectEntry =
        semesterEntry?.subjects.find((entry) => entry.value === subjectCode) ?? null;

      const papers = papersResult.status === 'fulfilled' ? papersResult.value : null;
      const subjectName =
        subjectEntry?.label ?? papers?.[0]?.subject_name ?? routeName ?? subjectCode;

      render(subjectName, papers, 'pyq');
    });
  }

  function hide() {
    openToken += 1;
    document.documentElement.dataset.view = '';
    document.title = 'KTU Archive';
    window.scrollTo({ top: 0, left: 0 });
  }

  function open(route) {
    if (!route) return;
    window.history.pushState({ ktuView: 'papers', route }, '', window.location.href);
    show(route);
  }

  function close() {
    if (window.history.state?.ktuView === 'papers') {
      window.history.back();
      return;
    }
    hide();
  }

  window.addEventListener('popstate', (event) => {
    if (event.state?.ktuView === 'papers') {
      show(event.state.route);
    } else if (!event.state?.ktuView) {
      hide();
    }
  });

  return { open };
}
