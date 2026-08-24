import JSZip from 'jszip';
import { SUPABASE_URL, SUPABASE_KEY } from './constants.js';
import { showToast } from './utils.js';
import { populateOptions, attachOptionClickHandlers, initCustomSelect } from './ui.js';

let notesSubjects = [];
let currentNotesSubject = null;
let selectedNotesModules = [];
let notesZipEnabled = false;
let notesModulesData = [];
let notesSuggestionIndex = -1;
let busy = false;

export function isNotesBusy() {
    return busy;
}

function blockWhenBusy() {
    if (!busy) return false;
    showToast('Please wait for the current operation to finish');
    return true;
}

const notesSemesterSelect = document.getElementById('notes-semester-select');
const notesSubjectSelect = document.getElementById('notes-subject-select');
const notesResultsContainer = document.getElementById('notes-results-container');
const notesSearchBtn = document.getElementById('notes-search-btn');
const notesInput = document.querySelector('.notes-input');
const notesClearBtn = document.getElementById('clear-notes-search-btn');
const notesSuggestions = document.getElementById('notes-suggestions-list');

function notesOnSelect(id, value) {
    if (blockWhenBusy()) return;
    if (id.startsWith('notes-')) {
        notesResultsContainer.innerHTML = '';
        selectedNotesModules = [];
        currentNotesSubject = null;
    }
    if (id === 'notes-semester-select') {
        if (value) {
            const filtered = notesSubjects
                .filter(s => s.semester === value)
                .sort((a, b) => a.code.localeCompare(b.code));
            const opts = filtered.map(s => ({ code: s.code, name: s.name }));
            populateOptions(notesSubjectSelect, opts, 'code', 'name', 'Select Subject');
            attachOptionClickHandlers(notesSubjectSelect, notesOnSelect);
            notesSubjectSelect.querySelector('.selected-text').textContent = 'Select Subject';
            notesSubjectSelect.setAttribute('data-selected-value', '');
        } else {
            populateOptions(notesSubjectSelect, [], 'code', 'name', 'Select Subject');
            attachOptionClickHandlers(notesSubjectSelect, notesOnSelect);
        }
    }
}

initCustomSelect(notesSemesterSelect);
attachOptionClickHandlers(notesSemesterSelect, notesOnSelect);
const notesSubjTrigger = notesSubjectSelect.querySelector('.select-trigger');
notesSubjTrigger?.addEventListener('click', function (e) {
    if (!notesSemesterSelect.getAttribute('data-selected-value')) {
        e.stopImmediatePropagation();
        showToast('Select a semester first');
    }
});
initCustomSelect(notesSubjectSelect);
notesSubjectSelect.classList.add('disabled');

let _notesFetched = false;

export async function fetchNotesSubjects() {
    if (_notesFetched && notesSubjects.length > 0) return;
    _notesFetched = true;
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/notes?select=subject_code,subject_name,semester`,
            { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        const data = await response.json();
        const seen = new Set();
        notesSubjects = [];
        data.forEach(item => {
            const key = `${item.subject_code}-${item.semester}`;
            if (!seen.has(key)) {
                seen.add(key);
                notesSubjects.push({
                    code: item.subject_code,
                    name: item.subject_name,
                    semester: item.semester
                });
            }
        });
        populateNotesSemesterSelect();
    } catch (e) {
        console.error('Failed to fetch notes subjects:', e);
    }
}

function populateNotesSemesterSelect() {
    const semesters = [...new Set(notesSubjects.map(s => s.semester))].sort();
    const options = semesters.map(s => ({ key: s, label: s }));
    populateOptions(notesSemesterSelect, options, 'key', 'label', 'Select Semester');
    attachOptionClickHandlers(notesSemesterSelect, notesOnSelect);
}

function updateNotesActiveSuggestion() {
    const items = notesSuggestions.querySelectorAll('.suggestion-item');
    items.forEach((item, i) => {
        item.classList.toggle('active', i === notesSuggestionIndex);
    });
}

function hideNotesSuggestions() {
    notesSuggestions.classList.remove('show');
    notesSuggestions.innerHTML = '';
    notesSuggestionIndex = -1;
}

new MutationObserver(() => {
    if (document.getElementById('notes-section').style.display !== 'none') {
        const sem = notesSemesterSelect.getAttribute('data-selected-value');
        if (sem && notesSubjects.length > 0) {
            const filtered = notesSubjects
                .filter(s => s.semester === sem)
                .sort((a, b) => a.code.localeCompare(b.code));
            const opts = filtered.map(s => ({ code: s.code, name: s.name }));
            populateOptions(notesSubjectSelect, opts, 'code', 'name', 'Select Subject');
            attachOptionClickHandlers(notesSubjectSelect, notesOnSelect);
            notesSubjectSelect.classList.remove('disabled');
        }
    }
}).observe(notesSemesterSelect, { attributes: true, attributeFilter: ['data-selected-value'] });

if (notesInput) {
    notesInput.addEventListener('input', () => {
        notesInput.value = notesInput.value.toUpperCase();
        const value = notesInput.value.trim().toLowerCase();
        notesSuggestionIndex = -1;
        if (value.length > 0) {
            notesClearBtn.classList.add('show');
            const filtered = notesSubjects
                .filter(s => s.code.toLowerCase().includes(value) || s.name.toLowerCase().includes(value))
                .sort((a, b) => a.code.localeCompare(b.code))
                .slice(0, 5);
            if (filtered.length > 0) {
                notesSuggestions.innerHTML = filtered.map(s =>
                    `<div class="suggestion-item" data-code="${s.code}" data-name="${s.name}" data-semester="${s.semester}">
                        <span class="suggestion-code">${s.code}</span>
                        <span class="suggestion-name">${s.name}</span>
                    </div>`
                ).join('');
                notesSuggestions.classList.add('show');
            } else {
                hideNotesSuggestions();
            }
        } else {
            notesClearBtn.classList.remove('show');
            hideNotesSuggestions();
        }
    });

    notesSuggestions.addEventListener('click', (e) => {
        const item = e.target.closest('.suggestion-item');
        if (!item) return;
        if (blockWhenBusy()) return;

        const code = item.dataset.code;
        const name = item.dataset.name;
        const semester = item.dataset.semester;

        notesInput.value = code;
        notesClearBtn.classList.remove('show');
        hideNotesSuggestions();

        const semTrigger = notesSemesterSelect.querySelector('.selected-text');
        semTrigger.textContent = semester;
        notesSemesterSelect.setAttribute('data-selected-value', semester);

        const filtered = notesSubjects
            .filter(s => s.semester === semester)
            .sort((a, b) => a.code.localeCompare(b.code));
        const opts = filtered.map(s => ({ code: s.code, name: s.name }));
        populateOptions(notesSubjectSelect, opts, 'code', 'name', 'Select Subject');
        attachOptionClickHandlers(notesSubjectSelect, notesOnSelect);

        setTimeout(() => {
            const subTrigger = notesSubjectSelect.querySelector('.selected-text');
            subTrigger.textContent = name;
            notesSubjectSelect.setAttribute('data-selected-value', code);
        }, 0);
    });

    if (notesClearBtn) {
        notesClearBtn.addEventListener('click', () => {
            if (blockWhenBusy()) return;
            notesInput.value = '';
            notesClearBtn.classList.remove('show');
            hideNotesSuggestions();
            notesInput.focus();
            notesResultsContainer.innerHTML = '';
            selectedNotesModules = [];
            currentNotesSubject = null;
        });
    }

    notesInput.addEventListener('keydown', (e) => {
        const items = notesSuggestions.querySelectorAll('.suggestion-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (items.length === 0) return;
            notesSuggestionIndex = (notesSuggestionIndex + 1) % items.length;
            updateNotesActiveSuggestion();
            items[notesSuggestionIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (items.length === 0) return;
            notesSuggestionIndex = (notesSuggestionIndex - 1 + items.length) % items.length;
            updateNotesActiveSuggestion();
            items[notesSuggestionIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Escape') {
            hideNotesSuggestions();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const query = notesInput.value.trim().toLowerCase();
            const exactMatch = query && notesSubjects.some(s =>
                s.code.toLowerCase() === query || s.name.toLowerCase() === query);
            const isVisible = notesSuggestions.classList.contains('show');
            const activeItem = isVisible ? notesSuggestions.querySelector('.suggestion-item.active') : null;
            if (!exactMatch) {
                if (activeItem) {
                    activeItem.click();
                } else if (isVisible && items.length > 0) {
                    items[0].click();
                }
            }
            notesSearchBtn.click();
        }
    });

    notesInput.placeholder = 'Enter Subject Code / Subject Name';
}

document.addEventListener('click', (e) => {
    if (notesInput && !notesInput.contains(e.target) && notesSuggestions && !notesSuggestions.contains(e.target)) {
        hideNotesSuggestions();
    }
});

notesSearchBtn.addEventListener('click', () => {
    if (blockWhenBusy()) return;
    if (selectedNotesModules.length > 0) {
        handleNotesDownload();
    } else {
        searchNotes();
    }
});

function updateNotesDownloadButton() {
    const text = notesSearchBtn ? notesSearchBtn.querySelector('.button-text') : null;
    if (!text) return;
    if (selectedNotesModules.length > 0) {
        text.textContent = notesZipEnabled
            ? `DOWNLOAD AS ZIP (${selectedNotesModules.length})`
            : `DOWNLOAD (${selectedNotesModules.length})`;
    } else {
        text.textContent = 'SEARCH';
    }
}

function updateNotesSelectAllButton() {
    const btn = document.getElementById('notes-select-all-btn');
    if (!btn) return;
    const items = notesResultsContainer.querySelectorAll('[data-notes-module]');
    const allSelected = items.length > 0 && selectedNotesModules.length === items.length;
    if (allSelected) btn.classList.add('selected');
    else btn.classList.remove('selected');
}

function toggleNotesModule(el) {
    if (blockWhenBusy()) return;
    const index = selectedNotesModules.indexOf(el.dataset.notesModule);
    if (index > -1) {
        selectedNotesModules.splice(index, 1);
        el.classList.remove('selected');
    } else {
        selectedNotesModules.push(el.dataset.notesModule);
        el.classList.add('selected');
    }
    updateNotesDownloadButton();
    updateNotesSelectAllButton();
}

export async function searchNotes() {
    if (blockWhenBusy()) return;
    let subjectToSearch = null;
    let inputCode = notesInput.value.trim().toUpperCase();
    let selectedCode = notesSubjectSelect.getAttribute('data-selected-value');

    if (inputCode) {
        const normalizedInput = inputCode.replace(/[\s\-_]/g, '');
        subjectToSearch =
            notesSubjects.find(s => s.code.toUpperCase() === inputCode) ||
            notesSubjects.find(s => s.name.toUpperCase() === inputCode) ||
            notesSubjects.find(s => s.code.toUpperCase().replace(/[\s\-_]/g, '') === normalizedInput);
    } else if (selectedCode) {
        subjectToSearch = notesSubjects.find(s => s.code === selectedCode);
    }

    if (!subjectToSearch) {
        showToast('Please enter or select a valid subject');
        return;
    }

    notesInput.value = '';
    notesClearBtn.classList.remove('show');
    hideNotesSuggestions();

    busy = true;
    try {
        notesResultsContainer.innerHTML = `
        <div class="results-card loading-container" style="display: flex;">
            <div class="loading-text">FETCHING NOTES FROM CLOUD</div>
            <div class="progress-bar-container">
                <div class="progress-bar"></div>
            </div>
        </div>
    `;

    currentNotesSubject = { code: subjectToSearch.code, name: subjectToSearch.name };
    selectedNotesModules = [];
    notesZipEnabled = false;

    const initialLoader = notesResultsContainer.querySelector('.loading-container');
    if (initialLoader) {
        initialLoader.style.height = `${initialLoader.offsetHeight}px`;
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'paper-actions';
    actionsDiv.innerHTML = `
        <div class="action-btn" id="notes-select-all-btn">
            <span id="notes-select-all-text">Select All</span>
        </div>
        <div class="action-btn" id="notes-download-zip-btn">
            <span class="zip-btn-text">Convert to ZIP</span>
        </div>
    `;
    notesResultsContainer.appendChild(actionsDiv);

    document.getElementById('notes-select-all-btn').addEventListener('click', () => {
        const items = notesResultsContainer.querySelectorAll('[data-notes-module]');
        const allSelected = items.length > 0 && selectedNotesModules.length === items.length;
        if (allSelected) {
            items.forEach(el => { el.classList.remove('selected'); });
            selectedNotesModules = [];
        } else {
            items.forEach(el => { el.classList.add('selected'); });
            selectedNotesModules = Array.from(items).map(el => el.dataset.notesModule);
        }
        updateNotesSelectAllButton();
        updateNotesDownloadButton();
    });

    document.getElementById('notes-download-zip-btn').addEventListener('click', () => {
        notesZipEnabled = !notesZipEnabled;
        const btn = document.getElementById('notes-download-zip-btn');
        if (btn) btn.classList.toggle('selected', notesZipEnabled);
        updateNotesDownloadButton();
    });

    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/notes?subject_code=eq.${subjectToSearch.code}&semester=eq.${encodeURIComponent(subjectToSearch.semester)}&select=*&order=module_number.asc`,
            { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        notesModulesData = await response.json();
    } catch (e) {
        showToast('Failed to load modules');
        notesModulesData = [];
    }

    if (notesModulesData.length === 0) {
        renderNotesResults();
        return;
    }

    const loaderContainer = notesResultsContainer.querySelector('.loading-container');
    const loadingText = notesResultsContainer.querySelector('.loading-text');
    const progressBar = notesResultsContainer.querySelector('.progress-bar-container');

    if (loaderContainer && loadingText) {
        loadingText.style.opacity = '0';
        loadingText.style.transition = 'opacity 0.3s ease';
        if (progressBar) {
            progressBar.style.opacity = '0';
            progressBar.style.transition = 'opacity 0.3s ease';
        }

        await new Promise(resolve => setTimeout(resolve, 300));

        const ghost = document.createElement('div');
        ghost.style.visibility = 'hidden';
        ghost.style.position = 'absolute';
        ghost.style.left = '-9999px';
        ghost.style.width = `${loaderContainer.offsetWidth}px`;
        ghost.className = 'results-card paper-list';
        ghost.innerHTML = `
            <div class="fade-wrapper">
                ${notesModulesData.map(mod => `
                    <div class="paper-item">
                        <div class="paper-item-left">
                            <div class="paper-checkbox"></div>
                            <div class="paper-title">
                                <span>${cleanNotesTitle(mod.title, mod.module_number)}</span>
                            </div>
                        </div>
                        <div class="paper-title" style="padding-right: 24px;">Module ${mod.module_number}</div>
                    </div>
                `).join('')}
            </div>
        `;
        notesResultsContainer.appendChild(ghost);
        const listHeight = ghost.getBoundingClientRect().height;
        notesResultsContainer.removeChild(ghost);

        loaderContainer.style.height = `${listHeight}px`;

        await new Promise(resolve => setTimeout(resolve, 600));
    }

    renderNotesResults();
    } finally {
        busy = false;
    }
}

function renderNotesResults() {
    if (notesModulesData.length === 0) {
        notesResultsContainer.innerHTML = `
            <div class="results-card" style="display: flex; align-items: center; justify-content: center; min-height: 72px;">
                <span class="no-results-text">No modules found for this subject</span>
            </div>
        `;
        return;
    }

    const loaderContainer = notesResultsContainer.querySelector('.loading-container');
    if (loaderContainer) {
        loaderContainer.innerHTML = `
            <div class="fade-wrapper">
                ${notesModulesData.map(mod => `
                    <div class="paper-item" data-notes-module="${mod.module_number}" data-notes-url="${mod.url}">
                        <div class="paper-item-left">
                            <div class="paper-checkbox"></div>
                            <div class="paper-title">
                                <span>${cleanNotesTitle(mod.title, mod.module_number)}</span>
                            </div>
                        </div>
                        <div class="paper-title" style="padding-right: 24px;">Module ${mod.module_number}</div>
                    </div>
                `).join('')}
            </div>
        `;
        loaderContainer.className = 'results-card paper-list';
        loaderContainer.setAttribute('data-paper-html', loaderContainer.innerHTML);
    } else {
        notesResultsContainer.innerHTML = '';
        const card = document.createElement('div');
        card.className = 'results-card paper-list';
        card.innerHTML = `
            <div class="fade-wrapper">
                ${notesModulesData.map(mod => `
                    <div class="paper-item" data-notes-module="${mod.module_number}" data-notes-url="${mod.url}">
                        <div class="paper-item-left">
                            <div class="paper-checkbox"></div>
                            <div class="paper-title">
                                <span>${cleanNotesTitle(mod.title, mod.module_number)}</span>
                            </div>
                        </div>
                        <div class="paper-title" style="padding-right: 24px;">Module ${mod.module_number}</div>
                    </div>
                `).join('')}
            </div>
        `;
        notesResultsContainer.appendChild(card);
        card.setAttribute('data-paper-html', card.innerHTML);

        requestAnimationFrame(() => {
            const fw = card.querySelector('.fade-wrapper');
            if (fw) fw.style.opacity = '1';
        });
    }

    notesResultsContainer.querySelectorAll('[data-notes-module]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleNotesModule(el);
        });
    });

    updateNotesDownloadButton();
    updateNotesSelectAllButton();
}

async function handleNotesDownload() {
    if (selectedNotesModules.length === 0) {
        showToast('Select modules first');
        return;
    }

    const selectedModules = notesModulesData.filter(mod =>
        selectedNotesModules.includes(String(mod.module_number))
    );

    if (selectedModules.length === 0) {
        showToast('No modules to download');
        return;
    }

    const subjectCode = currentNotesSubject?.code || 'Notes';
    const isZip = notesZipEnabled;

    busy = true;

    const notesCard = notesResultsContainer.querySelector('.results-card.paper-list');
    const savedHtml = notesCard ? notesCard.getAttribute('data-paper-html') : null;

    if (notesCard) {
        notesCard.style.height = '72px';
        notesCard.innerHTML = `
            <div class="loading-text">${isZip ? 'ZIPPING' : 'PREPARING'} YOUR NOTES</div>
            <div class="progress-bar-container" style="width: 80%;">
                <div class="progress-bar"></div>
            </div>
        `;
        notesCard.classList.add('loading-container');
    }

    const PREP_TIME = 2000;

    const downloadAll = async () => {
        try {
            if (isZip) {
                const zip = new JSZip();
                for (let i = 0; i < selectedModules.length; i++) {
                    const mod = selectedModules[i];
                    const lt = notesResultsContainer.querySelector('.loading-text');
                    if (lt) lt.textContent = `ZIPPING ${i + 1}/${selectedModules.length} NOTES`;
                    const resp = await fetch(mod.url);
                    const blob = await resp.blob();
                    zip.file(`${subjectCode}-${mod.title}.pdf`, blob);
                }
                const content = await zip.generateAsync({ type: 'blob' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = `${subjectCode}-Notes.zip`;
                document.body.appendChild(link);
                link.click();
                URL.revokeObjectURL(link.href);
                document.body.removeChild(link);
            } else {
                for (let i = 0; i < selectedModules.length; i++) {
                    const mod = selectedModules[i];
                    const lt = notesResultsContainer.querySelector('.loading-text');
                    if (lt) lt.textContent = `DOWNLOADING ${i + 1}/${selectedModules.length}`;
                    const resp = await fetch(mod.url);
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const blob = await resp.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = `${subjectCode}-${mod.title}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    URL.revokeObjectURL(blobUrl);
                    document.body.removeChild(a);
                }
            }
            showToast(isZip ? 'ZIP downloaded successfully' : 'Downloaded successfully');
        } catch (e) {
            showToast('Download failed');
        }

        setTimeout(() => {
            busy = false;
            if (notesCard && savedHtml) {
                notesCard.style.height = notesCard.offsetHeight + 'px';
                notesCard.innerHTML = savedHtml;
                notesCard.classList.remove('loading-container');
                requestAnimationFrame(() => {
                    notesCard.style.height = notesCard.scrollHeight + 'px';
                });
                notesCard.addEventListener('transitionend', function handler() {
                    notesCard.style.height = '';
                    notesCard.removeEventListener('transitionend', handler);
                });

                notesResultsContainer.querySelectorAll('[data-notes-module]').forEach(el => {
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggleNotesModule(el);
                    });
                });
            }
            selectedNotesModules = [];
            notesZipEnabled = false;
            const zipBtn = document.getElementById('notes-download-zip-btn');
            if (zipBtn) zipBtn.classList.remove('selected');
            updateNotesDownloadButton();
            updateNotesSelectAllButton();
        }, 2000);
    };

    setTimeout(downloadAll, PREP_TIME);
}

function cleanNotesTitle(title, moduleNum) {
    const cleaned = title.replace(/^M\d+[\s-]*/, '').trim();
    return cleaned || currentNotesSubject?.code || `Module ${moduleNum}`;
}
