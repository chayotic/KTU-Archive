import JSZip from 'jszip';
import { SUPABASE_URL, SUPABASE_KEY, NOTIF_CACHE_TTL } from './constants.js';
import { showToast } from './utils.js';
import { populateOptions, attachOptionClickHandlers, initCustomSelect } from './ui.js';
import { fetchNotifications } from './notifications.js';

let semesterData = {};
let allSubjects = [];
let selectedPapers = [];
let zipEnabled = false;
let lastSearchKey = null;
let pyqSuggestionIndex = -1;

const semesterSelect = document.getElementById('semester-select');
const subjectSelect = document.getElementById('subject-select');
const inputBox = document.querySelector('.input-box');
const suggestionsList = document.getElementById('suggestions-list');
const resultsContainer = document.getElementById('results-container');
const searchButton = document.querySelector('.search-button');
const searchButtonText = searchButton.querySelector('.button-text');
const clearSearchBtn = document.getElementById('clear-search-btn');

function pyqOnSelect(id, value) {
    if (id === 'subject-select' && value) {
        inputBox.value = '';
    }
    if (!id.startsWith('notes-')) {
        resultsContainer.innerHTML = '';
        selectedPapers = [];
        searchButtonText.textContent = 'SEARCH';
    }
    if (id === 'semester-select') {
        if (value && semesterData[value]) {
            const subjects = semesterData[value].sort((a, b) => a.name.localeCompare(b.name));
            const subjectOptions = subjects.map(subj => ({ name: subj.name, code: subj.code }));
            populateOptions(subjectSelect, subjectOptions, 'code', 'name', 'Select Subject');
            attachOptionClickHandlers(subjectSelect, pyqOnSelect);
            subjectSelect.querySelector('.selected-text').textContent = 'Select Subject';
            subjectSelect.setAttribute('data-selected-value', '');
        } else {
            populateOptions(subjectSelect, [], 'code', 'name', 'Select Subject');
            attachOptionClickHandlers(subjectSelect, pyqOnSelect);
        }
    }
}

export async function initializeApp() {
    try {
        const statusResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/public/papers/app_status.json?t=${Date.now()}`);
        if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.maintenance === true) {
                throw new Error('MAINTENANCE_MODE');
            }
        }

        const response = await fetch(`${SUPABASE_URL}/rest/v1/papers?select=subject_code,subject_name,semester`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const data = await response.json();

        data.forEach(item => {
            if (!semesterData[item.semester]) semesterData[item.semester] = [];
            if (!semesterData[item.semester].find(s => s.code === item.subject_code)) {
                semesterData[item.semester].push({ code: item.subject_code, name: item.subject_name });
                allSubjects.push({ code: item.subject_code, name: item.subject_name, semester: item.semester });
            }
        });

        const semesterKeys = Object.keys(semesterData).sort();
        const semesterOptions = semesterKeys.map(key => ({ key, label: key }));
        populateOptions(semesterSelect, semesterOptions, 'key', 'label', 'Select Semester');
        attachOptionClickHandlers(semesterSelect, pyqOnSelect);
        initCustomSelect(semesterSelect);
        const subjTrigger = subjectSelect.querySelector('.select-trigger');
        subjTrigger?.addEventListener('click', function (e) {
            if (!semesterSelect.getAttribute('data-selected-value')) {
                e.stopImmediatePropagation();
                showToast('Select a semester first');
            }
        });
        initCustomSelect(subjectSelect);

        fetchNotifications();
        setInterval(fetchNotifications, NOTIF_CACHE_TTL);

        document.getElementById('status-text').textContent = "Server Is Online";
        document.getElementById('status-icon').src = "/assets/server-status/online.svg";
        document.getElementById('status-icon').style.animation = "rotate-icon 4s linear infinite";
    } catch (error) {
        if (error.message === 'MAINTENANCE_MODE') {
            showToast('Server is currently under maintenance.');
            document.getElementById('status-text').textContent = "Server Under Maintenance";
        } else {
            showToast('Failed to connect to database.');
            document.getElementById('status-text').textContent = "Server Is Offline";
        }
        document.getElementById('status-icon').src = "/assets/server-status/offline.svg";
        document.getElementById('status-icon').style.animation = "none";
    }
}

function updateActiveSuggestion(list) {
    const items = list.querySelectorAll('.suggestion-item');
    items.forEach((item, i) => {
        item.classList.toggle('active', i === pyqSuggestionIndex);
    });
}

function updateSuggestions(query) {
    if (!query || query.length < 1) {
        suggestionsList.classList.remove('show');
        pyqSuggestionIndex = -1;
        return;
    }

    const filtered = allSubjects.filter(subject =>
        subject.code.toLowerCase().includes(query.toLowerCase()) ||
        subject.name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5);

    pyqSuggestionIndex = -1;
    if (filtered.length > 0) {
        suggestionsList.innerHTML = '';
        filtered.forEach(subject => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `
                <span class="suggestion-code">${subject.code}</span>
                <span class="suggestion-name">${subject.name}</span>
            `;
            div.addEventListener('click', () => {
                inputBox.value = subject.code;
                suggestionsList.classList.remove('show');

                const targetSem = subject.semester;
                if (!targetSem) return;

                document.querySelector('#semester-select .selected-text').textContent = targetSem;
                semesterSelect.setAttribute('data-selected-value', targetSem);
                const subjectsForTargetSem = semesterData[targetSem];
                const subjectOptions = subjectsForTargetSem.map(s => ({ code: s.code, name: s.name }));
                populateOptions(subjectSelect, subjectOptions, 'code', 'name', 'Select Subject');
                attachOptionClickHandlers(subjectSelect, pyqOnSelect);

                document.querySelector('#subject-select .selected-text').textContent = subject.name;
                subjectSelect.setAttribute('data-selected-value', subject.code);

                resultsContainer.innerHTML = '';
                selectedPapers = [];
                searchButtonText.textContent = "SEARCH";
            });
            suggestionsList.appendChild(div);
        });
        suggestionsList.classList.add('show');
    } else {
        suggestionsList.classList.remove('show');
    }
}

inputBox.placeholder = 'Enter Subject Code / Subject Name';

inputBox.addEventListener('keydown', (e) => {
    const items = suggestionsList.querySelectorAll('.suggestion-item');
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (items.length === 0) return;
        pyqSuggestionIndex = (pyqSuggestionIndex + 1) % items.length;
        updateActiveSuggestion(suggestionsList);
        items[pyqSuggestionIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length === 0) return;
        pyqSuggestionIndex = (pyqSuggestionIndex - 1 + items.length) % items.length;
        updateActiveSuggestion(suggestionsList);
        items[pyqSuggestionIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Escape') {
        suggestionsList.classList.remove('show');
        pyqSuggestionIndex = -1;
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const activeItem = suggestionsList.querySelector('.suggestion-item.active');
        if (activeItem) {
            activeItem.click();
        } else if (items.length > 0) {
            items[0].click();
        }
        searchButton.click();
    }
});

inputBox.addEventListener('input', (e) => {
    const value = e.target.value;
    updateSuggestions(value);

    if (value.trim().length > 0) {
        clearSearchBtn.classList.add('show');
        if (subjectSelect.getAttribute('data-selected-value')) {
            subjectSelect.setAttribute('data-selected-value', '');
            const trigger = subjectSelect.querySelector('.selected-text');
            if (trigger) trigger.textContent = 'Select Subject';
            subjectSelect.querySelectorAll('.select-options div').forEach(opt => opt.classList.remove('selected'));
        }
    } else {
        clearSearchBtn.classList.remove('show');
    }

    resultsContainer.innerHTML = '';
    selectedPapers = [];
    updateDownloadButton();
});

clearSearchBtn.addEventListener('click', () => {
    inputBox.value = '';
    clearSearchBtn.classList.remove('show');
    suggestionsList.classList.remove('show');
    pyqSuggestionIndex = -1;
    resultsContainer.innerHTML = '';
    selectedPapers = [];
    updateDownloadButton();

    subjectSelect.setAttribute('data-selected-value', '');
    const subjTrigger = subjectSelect.querySelector('.selected-text');
    if (subjTrigger) subjTrigger.textContent = 'Select Subject';
    subjectSelect.querySelectorAll('.select-options div').forEach(opt => opt.classList.remove('selected'));

    inputBox.focus();
});

document.addEventListener('click', (e) => {
    if (!inputBox.contains(e.target) && !suggestionsList.contains(e.target)) {
        suggestionsList.classList.remove('show');
        pyqSuggestionIndex = -1;
    }
});

function updateDownloadButton() {
    if (selectedPapers.length > 0) {
        searchButtonText.textContent = zipEnabled
            ? `DOWNLOAD AS ZIP (${selectedPapers.length})`
            : `DOWNLOAD (${selectedPapers.length})`;
    } else {
        searchButtonText.textContent = "SEARCH";
    }
}

function togglePaperSelection(paperUrl, element) {
    const index = selectedPapers.indexOf(paperUrl);
    if (index > -1) {
        selectedPapers.splice(index, 1);
        element.classList.remove('selected');
    } else {
        selectedPapers.push(paperUrl);
        element.classList.add('selected');
    }
    updateDownloadButton();
    updateSelectAllButton();
}

function toggleSelectAll() {
    const paperItems = Array.from(resultsContainer.querySelectorAll('.paper-item'));
    const paperUrls = paperItems.map(el => el.dataset.url).filter(Boolean);
    const allSelected = paperUrls.length > 0 && selectedPapers.length === paperUrls.length;

    if (allSelected) {
        paperItems.forEach(el => el.classList.remove('selected'));
        selectedPapers = [];
    } else {
        paperItems.forEach(el => el.classList.add('selected'));
        selectedPapers = [...paperUrls];
    }

    updateSelectAllButton();
    updateDownloadButton();
}

function updateSelectAllButton() {
    const selectAllBtn = document.getElementById('select-all-btn');
    if (!selectAllBtn) return;

    const paperItems = resultsContainer.querySelectorAll('.paper-item');
    const allSelected = paperItems.length > 0 && selectedPapers.length === paperItems.length;

    if (allSelected) selectAllBtn.classList.add('selected');
    else selectAllBtn.classList.remove('selected');
}

function toggleZipMode() {
    zipEnabled = !zipEnabled;
    const zipBtn = document.getElementById('download-zip-btn');
    if (zipBtn) zipBtn.classList.toggle('selected', zipEnabled);
    updateZipButton();
    updateDownloadButton();
}

function updateZipButton() {
}

export async function performSearch() {
    let subjectToSearch = null;
    let selectedCode = inputBox.value.trim().toUpperCase();
    let selectedDropdownCode = subjectSelect.getAttribute('data-selected-value');
    let selectedSem = semesterSelect.getAttribute('data-selected-value');

    if (selectedCode) {
        subjectToSearch = allSubjects.find(s => s.code.toUpperCase() === selectedCode);
    } else if (selectedDropdownCode) {
        subjectToSearch = allSubjects.find(s => s.code === selectedDropdownCode);
    }

    if (!subjectToSearch) {
        showToast('Please enter or select a valid subject');
        return;
    }

    if (!selectedSem || selectedSem === '' || selectedSem === 'Select Semester' || (selectedCode && selectedSem !== subjectToSearch.semester)) {
        selectedSem = subjectToSearch.semester;
        if (selectedSem) {
            semesterSelect.setAttribute('data-selected-value', selectedSem);
            const semesterTrigger = semesterSelect.querySelector('.selected-text');
            if (semesterTrigger) semesterTrigger.textContent = selectedSem;

            const subjects = semesterData[selectedSem].sort((a, b) => a.name.localeCompare(b.name));
            const subjectOptions = subjects.map(subj => ({ name: subj.name, code: subj.code }));
            populateOptions(subjectSelect, subjectOptions, 'code', 'name', 'Select Subject');
            attachOptionClickHandlers(subjectSelect, pyqOnSelect);
        }
    }

    if (subjectSelect.getAttribute('data-selected-value') !== subjectToSearch.code) {
        subjectSelect.setAttribute('data-selected-value', subjectToSearch.code);
        const subjectTrigger = subjectSelect.querySelector('.selected-text');
        if (subjectTrigger) subjectTrigger.textContent = subjectToSearch.name;

        subjectSelect.querySelectorAll('.select-options div').forEach(opt => {
            if (opt.getAttribute('data-value') === subjectToSearch.code) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
    }

    const currentKey = `${selectedSem}-${subjectToSearch.code}`;

    if (resultsContainer.children.length > 0 && lastSearchKey === currentKey) {
        return;
    }

    resultsContainer.innerHTML = '';
    selectedPapers = [];
    zipEnabled = false;
    updateDownloadButton();

    inputBox.value = '';
    clearSearchBtn.classList.remove('show');
    suggestionsList.classList.remove('show');

    resultsContainer.innerHTML = `
        <div class="results-card loading-container" style="display: flex;">
            <div class="loading-text">FETCHING PAPERS FROM CLOUD</div>
            <div class="progress-bar-container">
                <div class="progress-bar"></div>
            </div>
        </div>
    `;

    const initialLoader = resultsContainer.querySelector('.loading-container');
    if (initialLoader) {
        initialLoader.style.height = `${initialLoader.offsetHeight}px`;
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'paper-actions';
    actionsDiv.innerHTML = `
        <div class="action-btn" id="select-all-btn">
            <span id="select-all-text">Select All</span>
        </div>
        <div class="action-btn" id="download-zip-btn">
            <span class="zip-btn-text">Convert to ZIP</span>
        </div>
    `;
    resultsContainer.appendChild(actionsDiv);
    document.getElementById('select-all-btn').addEventListener('click', toggleSelectAll);
    document.getElementById('download-zip-btn').addEventListener('click', toggleZipMode);

    const startTime = Date.now();

    try {
        const queryParams = new URLSearchParams({
            subject_code: `eq.${subjectToSearch.code}`,
            semester: `eq.${selectedSem}`,
            select: '*'
        });

        const response = await fetch(`${SUPABASE_URL}/rest/v1/papers?${queryParams.toString()}`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        let papers = await response.json();

        const seenTitles = new Set();
        papers = papers.filter(item => {
            const isDuplicate = seenTitles.has(item.title);
            seenTitles.add(item.title);
            return !isDuplicate;
        });

        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 1000 - elapsed);
        await new Promise(resolve => setTimeout(resolve, remaining));

        if (papers.length === 0) {
            resultsContainer.innerHTML = `
                <div class="results-card no-results-card">
                    <div class="no-results-text">No papers found for this subject yet.</div>
                </div>
            `;
            return;
        }

        const loaderContainer = resultsContainer.querySelector('.loading-container');
        const loadingText = resultsContainer.querySelector('.loading-text');
        const progressBar = resultsContainer.querySelector('.progress-bar-container');

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
                    ${papers.map(item => `
                        <div class="paper-item">
                            <div class="paper-item-left">
                                <div class="paper-checkbox"></div>
                                <div class="paper-title">${item.subject_name}</div>
                            </div>
                            <div class="paper-date">${item.title}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            resultsContainer.appendChild(ghost);
            const paperListHeight = ghost.getBoundingClientRect().height;
            resultsContainer.removeChild(ghost);

            loaderContainer.style.height = `${paperListHeight}px`;

            await new Promise(resolve => setTimeout(resolve, 600));
        }

        loaderContainer.innerHTML = `
            <div class="fade-wrapper">
                ${papers.map(item => `
                    <div class="paper-item" onclick="window.__togglePaperSelection('${item.url}', this)" data-url="${item.url}" data-subject-code="${item.subject_code}">
                        <div class="paper-item-left">
                            <div class="paper-checkbox"></div>
                            <div class="paper-title">${item.subject_name}</div>
                        </div>
                        <div class="paper-date">${item.title}</div>
                    </div>
                `).join('')}
            </div>
        `;

        loaderContainer.className = 'results-card paper-list';
        loaderContainer.setAttribute('data-paper-html', loaderContainer.innerHTML);

        lastSearchKey = currentKey;
    } catch (e) {
        console.error(e);
        showToast('Failed to fetch from Supabase');
    }
}

window.__togglePaperSelection = togglePaperSelection;

function downloadSelectedPapers() {
    if (selectedPapers.length === 0) return;

    const statusText = document.getElementById('status-text');
    if (statusText.textContent !== "Server Is Online") {
        showToast("Server is currently offline. Please try again later.");
        return;
    }

    const paperCard = resultsContainer.querySelector('.results-card.paper-list');
    const savedHtml = paperCard ? paperCard.getAttribute('data-paper-html') : null;

    if (paperCard) {
        paperCard.style.height = '72px';
        paperCard.innerHTML = `
            <div class="loading-text">PREPARING YOUR PAPERS</div>
            <div class="progress-bar-container">
                <div class="progress-bar"></div>
            </div>
        `;
        paperCard.classList.add('loading-container');
    }

    const PREP_TIME = 2000;
    const papersToDownload = [...selectedPapers];
    papersToDownload.forEach((url, i) => {
        setTimeout(async () => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                const blob = await response.blob();
                const blobUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = blobUrl;
                const filename = url.split('/').pop().split('?')[0] || 'KTU-Paper.pdf';
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(blobUrl);
                document.body.removeChild(a);
            } catch (err) {
                window.open(url, '_blank');
            }

            if (i === papersToDownload.length - 1) {
                setTimeout(() => {
                    if (paperCard && savedHtml) {
                        paperCard.style.height = paperCard.offsetHeight + 'px';
                        paperCard.innerHTML = savedHtml;
                        paperCard.classList.remove('loading-container');
                        requestAnimationFrame(() => {
                            paperCard.style.height = paperCard.scrollHeight + 'px';
                        });
                        paperCard.addEventListener('transitionend', function handler() {
                            paperCard.style.height = '';
                            paperCard.removeEventListener('transitionend', handler);
                        });
                        paperCard.querySelectorAll('.paper-item.selected').forEach(el => el.classList.remove('selected'));
                    }
                    selectedPapers = [];
                    updateDownloadButton();
                    updateSelectAllButton();
                }, 2000);
            }
        }, PREP_TIME + (i * 800));
    });
}

async function downloadAsZip() {
    if (selectedPapers.length === 0) {
        showToast('Select papers first');
        return;
    }

    const statusText = document.getElementById('status-text');
    if (statusText.textContent !== "Server Is Online") {
        showToast("Server is currently offline. Please try again later.");
        return;
    }

    const paperCard = resultsContainer.querySelector('.results-card.paper-list');
    const savedHtml = paperCard ? paperCard.getAttribute('data-paper-html') : null;
    const firstPaper = paperCard ? paperCard.querySelector('.paper-item[data-subject-code]') : null;
    const subjectCode = firstPaper ? firstPaper.dataset.subjectCode : 'KTU-Papers';

    if (paperCard) {
        paperCard.style.height = '72px';
        paperCard.innerHTML = `
            <div class="loading-text">ZIPPING PAPERS</div>
            <div class="progress-bar-container">
                <div class="progress-bar"></div>
            </div>
        `;
        paperCard.classList.add('loading-container');
    }

    try {
        const zip = new JSZip();

        for (let i = 0; i < selectedPapers.length; i++) {
            const url = selectedPapers[i];
            const response = await fetch(url);
            const blob = await response.blob();
            const filename = url.split('/').pop().split('?')[0] || 'KTU-Paper.pdf';
            zip.file(filename, blob);

            if (paperCard) {
                const loadingText = paperCard.querySelector('.loading-text');
                if (loadingText) loadingText.textContent = `ZIPPING ${i + 1}/${selectedPapers.length} PAPERS`;
            }
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const blobUrl = window.URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${subjectCode}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);

        if (paperCard && savedHtml) {
            paperCard.style.height = paperCard.offsetHeight + 'px';
            paperCard.innerHTML = savedHtml;
            paperCard.classList.remove('loading-container');
            requestAnimationFrame(() => {
                paperCard.style.height = paperCard.scrollHeight + 'px';
            });
            paperCard.addEventListener('transitionend', function handler() {
                paperCard.style.height = '';
                paperCard.removeEventListener('transitionend', handler);
            });
        }

        zipEnabled = false;
        selectedPapers = [];
        updateDownloadButton();
        updateSelectAllButton();
        updateZipButton();
    } catch (err) {
        console.error(err);
        showToast('Failed to create ZIP');
        if (paperCard && savedHtml) {
            paperCard.style.height = paperCard.offsetHeight + 'px';
            paperCard.innerHTML = savedHtml;
            paperCard.classList.remove('loading-container');
            requestAnimationFrame(() => {
                paperCard.style.height = paperCard.scrollHeight + 'px';
            });
            paperCard.addEventListener('transitionend', function handler() {
                paperCard.style.height = '';
                paperCard.removeEventListener('transitionend', handler);
            });
        }
    }
}

let animationActive = false;

searchButton.addEventListener('click', function (e) {
    if (animationActive) return;
    animationActive = true;

    const rect = searchButton.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const size = Math.max(searchButton.offsetWidth, searchButton.offsetHeight);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (x - size / 2) + 'px';
    ripple.style.top = (y - size / 2) + 'px';

    const existing = searchButton.querySelector('.ripple');
    if (existing) existing.remove();

    searchButton.appendChild(ripple);

    setTimeout(() => {
        animationActive = false;

        if (selectedPapers.length > 0) {
            if (zipEnabled) {
                downloadAsZip();
            } else {
                downloadSelectedPapers();
            }
        } else {
            performSearch();
        }
    }, 100);

    ripple.addEventListener('animationend', () => {
        ripple.remove();
    });
});
