import { showToast } from '../../components/toast.js';
import { mountSelect } from '../../components/select.js';
import { uploadFile } from '../../services/upload.js';

const MAX_SIZE_PYQ = 3 * 1024 * 1024;
const MAX_SIZE_NOTES = 10 * 1024 * 1024;
const MAX_FILES_PYQ = 10;
const MAX_FILES_NOTES = 8;

export function mountUpload(root = document) {
  const title = root.querySelector('[data-upload-title]');
  const dropZone = root.querySelector('[data-upload-drop-zone]');
  const dropSub = root.querySelector('[data-upload-drop-sub]');
  const input = root.querySelector('[data-upload-input]');
  const filesList = root.querySelector('[data-upload-files]');
  const submit = root.querySelector('[data-upload-submit]');
  const submitLabel = root.querySelector('[data-upload-submit-label]');
  const failed = root.querySelector('[data-upload-failed]');
  const notesExtra = root.querySelector('[data-upload-notes-extra]');
  const semesterWrap = root.querySelector('[data-upload-semester]');
  const progressWrap = root.querySelector('[data-upload-progress]');
  const progressBar = root.querySelector('[data-upload-progress-bar]');
  const progressLabel = root.querySelector('[data-upload-progress-label]');

  if (
    !title ||
    !dropZone ||
    !dropSub ||
    !input ||
    !filesList ||
    !submit ||
    !submitLabel ||
    !failed ||
    !notesExtra ||
    !progressWrap ||
    !progressBar ||
    !progressLabel
  ) {
    return null;
  }

  let uploadType = 'pyq';
  let files = [];
  let isUploading = false;
  let semesterSelect = null;
  let progressFrame = 0;
  let progressHideTimer = 0;

  const SEMESTERS = Array.from({ length: 8 }, (_, index) => ({
    value: String(index + 1),
    label: `Semester ${index + 1}`,
  }));

  const semesterRoot = semesterWrap?.querySelector('[data-select]') ?? null;

  if (semesterRoot) {
    semesterSelect = mountSelect(semesterRoot, {
      onChange: () => {
        updateSubmit();
      },
    });
    semesterSelect.setOptions(SEMESTERS);
  }

  function getMaxSize() {
    return uploadType === 'pyq' ? MAX_SIZE_PYQ : MAX_SIZE_NOTES;
  }

  function getSizeLabel() {
    return uploadType === 'pyq' ? '3 MB' : '10 MB';
  }

  function getMaxFiles() {
    return uploadType === 'pyq' ? MAX_FILES_PYQ : MAX_FILES_NOTES;
  }

  function updateLimits() {
    const maxFiles = getMaxFiles();
    dropSub.textContent = `PDF files only · Max ${getSizeLabel()} each · ${maxFiles} file limit`;
  }

  function toggleNotesExtra() {
    const isNotes = uploadType === 'notes';
    semesterWrap.hidden = !isNotes;
    notesExtra.hidden = !isNotes;
    updateLimits();
  }

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderFiles() {
    filesList.hidden = files.length === 0;
    filesList.replaceChildren();

    files.forEach((file, index) => {
      const item = document.createElement('li');
      item.className = 'md3-upload__file';

      const name = document.createElement('span');
      name.className = 'md3-upload__file-name';
      name.textContent = file.name;

      const size = document.createElement('span');
      size.className = 'md3-upload__file-size';
      size.textContent = formatSize(file.size);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'md3-upload__remove';
      remove.setAttribute('aria-label', `Remove ${file.name}`);

      const removeIcon = document.createElement('span');
      removeIcon.className = 'material-symbols-rounded';
      removeIcon.setAttribute('aria-hidden', 'true');
      removeIcon.textContent = 'close';
      remove.append(removeIcon);

      remove.addEventListener('click', () => {
        if (isUploading) return;
        files.splice(index, 1);
        renderFiles();
        updateSubmit();
      });

      item.append(name, size, remove);
      filesList.append(item);
    });

    updateSubmit();
  }

  function addFiles(fileList) {
    const maxSize = getMaxSize();
    const sizeLabel = getSizeLabel();
    const maxFiles = getMaxFiles();
    const valid = [];

    for (const file of fileList) {
      const isPdf =
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        showToast(`${file.name}: Only PDF files allowed`, { variant: 'warning' });
        continue;
      }
      if (file.size > maxSize) {
        showToast(`${file.name}: File too large (max ${sizeLabel})`, { variant: 'warning' });
        continue;
      }
      valid.push(file);
    }

    if (files.length + valid.length > maxFiles) {
      showToast(`Maximum ${maxFiles} files allowed`, { variant: 'warning' });
      return;
    }

    files = [...files, ...valid];
    renderFiles();
  }

  function updateSubmit() {
    const semesterReady =
      uploadType === 'pyq' || Boolean(semesterSelect?.getValue());
    const ready = files.length > 0 && semesterReady && !isUploading;
    submit.disabled = isUploading;
    submit.setAttribute('aria-disabled', String(!isUploading && !ready));
    submitLabel.textContent = files.length > 0 ? `Upload (${files.length})` : 'Upload';
  }

  function renderFailed(list) {
    failed.replaceChildren();

    if (list.length === 0) {
      failed.hidden = true;
      return;
    }

    const header = document.createElement('p');
    header.className = 'md3-upload__failed-header';
    header.textContent = `${list.length} file${list.length === 1 ? '' : 's'} failed to upload`;
    failed.append(header);

    list.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'md3-upload__failed-item';

      const info = document.createElement('div');
      info.className = 'md3-upload__failed-info';

      const name = document.createElement('span');
      name.className = 'md3-upload__failed-name';
      name.textContent = entry.name;

      const error = document.createElement('span');
      error.className = 'md3-upload__failed-error';
      error.textContent = entry.error;

      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'md3-upload__failed-dismiss';
      dismiss.setAttribute('aria-label', `Dismiss ${entry.name}`);
      const dismissIcon = document.createElement('span');
      dismissIcon.className = 'material-symbols-rounded';
      dismissIcon.setAttribute('aria-hidden', 'true');
      dismissIcon.textContent = 'close';
      dismiss.append(dismissIcon);

      dismiss.addEventListener('click', () => {
        item.remove();
        if (!failed.querySelector('.md3-upload__failed-item')) {
          failed.hidden = true;
        }
      });

      info.append(name, error);
      item.append(info, dismiss);
      failed.append(item);
    });

    failed.hidden = false;
  }

  function animateProgress(target) {
    cancelAnimationFrame(progressFrame);
    const from = Number(progressBar.value) || 0;
    const delta = target - from;
    const start = performance.now();
    const duration = 300;

    function frame(now) {
      const t = Math.min((now - start) / duration, 1);
      progressBar.value = from + delta * (1 - (1 - t) ** 3);
      if (t < 1) progressFrame = requestAnimationFrame(frame);
    }

    progressFrame = requestAnimationFrame(frame);
  }

  document.addEventListener('buttongroupchange', (event) => {
    if (isUploading) return;
    if (!event.target.closest?.('.md3-upload__modes')) return;
    if (event.detail.value !== 'pyq' && event.detail.value !== 'notes') return;
    uploadType = event.detail.value;
    toggleNotesExtra();
    updateSubmit();
  });

  input.addEventListener('change', () => {
    if (isUploading) return;
    addFiles(input.files);
    input.value = '';
  });

  document.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  document.addEventListener('drop', (event) => {
    event.preventDefault();
  });

  submit.addEventListener('click', async () => {
    if (isUploading) return;

    if (files.length === 0) {
      showToast('Add at least one PDF file.', { variant: 'warning' });
      return;
    }

    if (uploadType === 'notes' && !semesterSelect?.getValue()) {
      showToast('Select a semester.', { variant: 'warning' });
      return;
    }

    const totalFiles = files.length;
    const semester = uploadType === 'notes' ? semesterSelect?.getValue() || '' : '';
    let completedCount = 0;
    let successCount = 0;
    const failedFiles = [];

    isUploading = true;
    submit.disabled = true;
    submit.classList.add('is-loading');

    submitLabel.textContent = 'Uploading';

    progressWrap.hidden = false;
    cancelAnimationFrame(progressFrame);
    clearTimeout(progressHideTimer);
    progressBar.value = 0;
    progressLabel.textContent = `Uploading 0 of ${totalFiles}`;

    try {
      for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        completedCount = i + 1;
        submitLabel.textContent = `Uploading (${completedCount}/${totalFiles})`;
        progressLabel.textContent = `Uploading ${completedCount} of ${totalFiles}`;
        animateProgress((completedCount / totalFiles) * 100);

        try {
          await uploadFile(file, { type: uploadType, semester });
          successCount += 1;
        } catch (error) {
          failedFiles.push({ name: file.name, error: error.message || 'Upload failed' });
        }
      }
    } finally {
      isUploading = false;
      submit.classList.remove('is-loading');
      submitLabel.textContent = files.length > 0 ? `Upload (${files.length})` : 'Upload';
    }

    files = [];
    renderFiles();
    renderFailed(failedFiles);

    clearTimeout(progressHideTimer);
    progressHideTimer = setTimeout(() => {
      progressWrap.hidden = true;
      progressBar.value = 0;
      progressLabel.textContent = '';
    }, 1200);

    if (successCount === totalFiles) {
      showToast('All files uploaded successfully!', { variant: 'success' });
    } else if (successCount > 0) {
      showToast(`${successCount}/${totalFiles} files uploaded`, { variant: 'warning' });
    } else if (failedFiles.length > 0) {
      showToast(failedFiles[0]?.error || 'Upload failed');
    }
  });

  toggleNotesExtra();
  updateLimits();
  renderFiles();

  return { title };
}
