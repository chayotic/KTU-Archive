import { showToast } from './utils.js';
import { populateOptions, attachOptionClickHandlers, initCustomSelect } from './ui.js';

function getMaxSize(type) {
    return (type === 'pyq' ? 3 : 10) * 1024 * 1024;
}

function getSizeLabel(type) {
    return type === 'pyq' ? '3MB' : '10MB';
}

function getMaxFiles(type) {
    return type === 'pyq' ? 10 : 8;
}

let uploadType = 'pyq';
let pendingFiles = [];
let isUploading = false;

const uploadFile = document.getElementById('upload-file');
const uploadTrigger = document.getElementById('upload-trigger');
const uploadBtn = document.getElementById('upload-btn');
const uploadFileList = document.getElementById('upload-file-list');
const uploadNotesExtra = document.getElementById('upload-notes-extra');
const uploadNotesRequest = document.getElementById('upload-notes-request');
const uploadSemesterSelect = document.getElementById('upload-semester-select');
const uploadLimitCard = document.getElementById('upload-limit-card');
const uploadTriggerSub = document.getElementById('upload-trigger-sub');
const uploadFailedList = document.getElementById('upload-failed-list');

const semesters = Array.from({ length: 8 }, (_, i) => ({ key: String(i + 1), label: `Semester ${i + 1}` }));
populateOptions(uploadSemesterSelect, semesters, 'key', 'label', 'Select Semester');
attachOptionClickHandlers(uploadSemesterSelect, () => {});
initCustomSelect(uploadSemesterSelect);
updateLimits();

function updateLimits() {
    const maxFiles = getMaxFiles(uploadType);
    uploadLimitCard.textContent = `Max file size: ${getSizeLabel(uploadType)} · PDF only · Max ${maxFiles} files`;
    uploadTriggerSub.textContent = `PDF files only · Max ${getSizeLabel(uploadType)} each · ${maxFiles} file limit`;
}

function toggleNotesExtra(show) {
    uploadNotesExtra.style.display = show ? 'flex' : 'none';
    uploadNotesRequest.style.display = show ? 'block' : 'none';
}

document.querySelectorAll('[data-upload-tab]').forEach(btn => {
    const activate = () => {
        if (isUploading) return;
        if (btn.classList.contains('active')) return;
        document.querySelectorAll('[data-upload-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        uploadType = btn.dataset.uploadTab;
        toggleNotesExtra(uploadType === 'notes');
        updateLimits();
    };
    btn.addEventListener('pointerdown', activate);
    btn.addEventListener('click', activate);
});

function formatSize(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderFileList() {
    uploadFileList.innerHTML = pendingFiles.map((f, i) => `
        <div class="upload-file-item">
            <span class="upload-file-item-name">${f.name}</span>
            <span class="upload-file-item-size">${formatSize(f.size)}</span>
            <span class="upload-file-item-remove" data-index="${i}">✕</span>
        </div>
    `).join('');

    uploadFileList.querySelectorAll('.upload-file-item-remove').forEach(el => {
        el.addEventListener('click', () => {
            pendingFiles.splice(parseInt(el.dataset.index), 1);
            renderFileList();
        });
    });

    const hasFiles = pendingFiles.length > 0;
    uploadBtn.classList.toggle('has-files', hasFiles);
    uploadBtn.classList.toggle('ripple', !hasFiles);
}

function addFiles(files) {
    const maxSize = getMaxSize(uploadType);
    const sizeLabel = getSizeLabel(uploadType);
    const maxFiles = getMaxFiles(uploadType);
    files.forEach(file => {
        if (file.type !== 'application/pdf') {
            showToast(`${file.name}: Only PDF files allowed`);
            return;
        }
        if (file.size > maxSize) {
            showToast(`${file.name}: File too large — max ${sizeLabel}`);
            return;
        }
        if (pendingFiles.length >= maxFiles) {
            showToast(`Maximum ${maxFiles} files allowed`);
            return;
        }
        if (!pendingFiles.some(f => f.name === file.name && f.size === file.size)) {
            pendingFiles.push(file);
        }
    });
    renderFileList();
}

function renderFailedFiles(failed) {
    if (failed.length === 0) { uploadFailedList.innerHTML = ''; return; }
    uploadFailedList.innerHTML = `
        <div class="upload-failed-header">${failed.length} file${failed.length > 1 ? 's' : ''} failed to upload</div>
        ${failed.map(f => `
            <div class="upload-failed-item">
                <div class="upload-failed-item-info">
                    <span class="upload-failed-item-name">${f.name}</span>
                    <span class="upload-failed-item-error">${f.error}</span>
                </div>
                <span class="upload-failed-item-dismiss" data-dismiss>✕</span>
            </div>
        `).join('')}
    `;
    uploadFailedList.querySelectorAll('[data-dismiss]').forEach(el => {
        el.addEventListener('click', () => {
            el.closest('.upload-failed-item').remove();
            if (!uploadFailedList.querySelector('.upload-failed-item')) uploadFailedList.innerHTML = '';
        });
    });
}

uploadTrigger.addEventListener('click', () => {
    if (isUploading) return;
    uploadFile.click();
});

uploadFile.addEventListener('change', () => {
    if (isUploading) return;
    addFiles(Array.from(uploadFile.files));
    uploadFile.value = '';
});

uploadTrigger.addEventListener('dragover', e => {
    if (isUploading) return;
    e.preventDefault();
    uploadTrigger.classList.add('drag-over');
});

uploadTrigger.addEventListener('dragenter', e => {
    if (isUploading) return;
    e.preventDefault();
    uploadTrigger.classList.add('drag-over');
});

uploadTrigger.addEventListener('dragleave', e => {
    if (isUploading) return;
    e.preventDefault();
    uploadTrigger.classList.remove('drag-over');
});

uploadTrigger.addEventListener('drop', e => {
    if (isUploading) return;
    e.preventDefault();
    uploadTrigger.classList.remove('drag-over');
    addFiles(Array.from(e.dataTransfer.files));
});

document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

function uploadFiles(url, file, headers) {
    return fetch(url, { method: 'POST', headers, body: file }).then(async r => {
        let data;
        try { data = await r.json(); } catch { throw new Error('Server error — try again'); }
        if (!r.ok) throw new Error(data.error || 'Upload failed');
        return data;
    });
}

uploadBtn.addEventListener('click', async () => {
    if (pendingFiles.length === 0) { showToast('Select files first'); return; }
    if (uploadType === 'notes' && !uploadSemesterSelect.dataset.selectedValue) {
        showToast('Please select a semester');
        return;
    }

    const totalFiles = pendingFiles.length;
    let completedCount = 0;
    let successCount = 0;
    let failedFiles = [];

    isUploading = true;
    uploadFile.disabled = true;
    uploadTrigger.classList.add('uploading');

    uploadBtn.innerHTML = `
        <div class="upload-progress-wrap" id="upload-progress-wrap">
            <div class="upload-progress-row">
                <span class="upload-progress-label">Uploading Files</span>
            </div>
            <div class="progress-bar-container" style="flex:none;width:100%;max-width:none;height:3px;background-color:rgba(255,255,255,0.15);">
                <div class="progress-bar determinate" style="width:0%;background-color:var(--color-light);"></div>
            </div>
        </div>
    `;
    uploadBtn.disabled = true;

    const progBar = uploadBtn.querySelector('.progress-bar.determinate');
    const progLabel = uploadBtn.querySelector('.upload-progress-label');

    function setProgress() {
        const pct = Math.min((completedCount / totalFiles) * 100, 100);
        if (progBar) progBar.style.width = `${pct}%`;
    }

    for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        completedCount = i + 1;
        setProgress();
        if (progLabel) progLabel.textContent = `Uploading (${i + 1}/${pendingFiles.length})`;
        try {
            const headers = {
                'X-Upload-Type': uploadType,
                'X-Filename': file.name,
                'Content-Type': 'application/pdf',
                ...(uploadType === 'notes' && uploadSemesterSelect.dataset.selectedValue ? { 'X-Semester': uploadSemesterSelect.dataset.selectedValue } : {}),
            };
            await uploadFiles('/api/upload', file, headers);
            successCount++;
            if (i < pendingFiles.length - 1) {
                if (progLabel) progLabel.textContent = 'Processing...';
            }
        } catch (e) {
            failedFiles.push({ name: file.name, error: e.message });
        }
        setProgress();
    }

    setProgress();
    if (progBar) progBar.style.width = '100%';

    if (successCount === pendingFiles.length) {
        showToast('All files uploaded successfully!');
    } else if (successCount > 0) {
        showToast(`${successCount}/${pendingFiles.length} files uploaded`);
    }

    pendingFiles = [];
    renderFileList();
    renderFailedFiles(failedFiles);
    isUploading = false;
    uploadFile.disabled = false;
    uploadTrigger.classList.remove('uploading');
    uploadBtn.innerHTML = '<span class="button-text">UPLOAD</span>';
    uploadBtn.disabled = false;
});
