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

const uploadFile = document.getElementById('upload-file');
const uploadTrigger = document.getElementById('upload-trigger');
const uploadBtn = document.getElementById('upload-btn');
const uploadBtnText = uploadBtn?.querySelector('.button-text');
const uploadFileList = document.getElementById('upload-file-list');
const uploadNotesExtra = document.getElementById('upload-notes-extra');
const uploadNotesRequest = document.getElementById('upload-notes-request');
const uploadSemesterSelect = document.getElementById('upload-semester-select');
const uploadLimitCard = document.getElementById('upload-limit-card');
const uploadTriggerSub = document.getElementById('upload-trigger-sub');

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
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-upload-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        uploadType = btn.dataset.uploadTab;
        toggleNotesExtra(uploadType === 'notes');
        updateLimits();
    });
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

    uploadBtn.classList.toggle('has-files', pendingFiles.length > 0);
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

uploadTrigger.addEventListener('click', () => uploadFile.click());

uploadFile.addEventListener('change', () => {
    addFiles(Array.from(uploadFile.files));
    uploadFile.value = '';
});

uploadTrigger.addEventListener('dragover', e => {
    e.preventDefault();
    uploadTrigger.classList.add('drag-over');
});

uploadTrigger.addEventListener('dragenter', e => {
    e.preventDefault();
    uploadTrigger.classList.add('drag-over');
});

uploadTrigger.addEventListener('dragleave', e => {
    e.preventDefault();
    uploadTrigger.classList.remove('drag-over');
});

uploadTrigger.addEventListener('drop', e => {
    e.preventDefault();
    uploadTrigger.classList.remove('drag-over');
    addFiles(Array.from(e.dataTransfer.files));
});

document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

uploadBtn.addEventListener('click', async () => {
    if (pendingFiles.length === 0) { showToast('Select files first'); return; }
    if (uploadType === 'notes' && !uploadSemesterSelect.dataset.selectedValue) {
        showToast('Please select a semester');
        return;
    }

    uploadBtnText.textContent = `UPLOADING (0/${pendingFiles.length})`;
    uploadBtn.disabled = true;

    let successCount = 0;
    for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        uploadBtnText.textContent = `UPLOADING (${i + 1}/${pendingFiles.length})`;
        try {
            const resp = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'X-Upload-Type': uploadType,
                    'X-Filename': file.name,
                    'Content-Type': 'application/pdf',
                    ...(uploadType === 'notes' && uploadSemesterSelect.dataset.selectedValue ? { 'X-Semester': uploadSemesterSelect.dataset.selectedValue } : {}),
                },
                body: file,
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Upload failed');
            successCount++;
        } catch (e) {
            showToast(`${file.name}: ${e.message}`);
        }
    }

    if (successCount === pendingFiles.length) {
        showToast('All files uploaded successfully!');
    } else if (successCount > 0) {
        showToast(`${successCount}/${pendingFiles.length} files uploaded`);
    }

    pendingFiles = [];
    renderFileList();
    uploadBtnText.textContent = 'UPLOAD';
    uploadBtn.disabled = false;
});
