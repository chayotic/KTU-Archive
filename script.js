import JSZip from 'jszip';

let semesterData = {};
let allSubjects = [];
let selectedPapers = [];
let zipEnabled = false;

const semesterSelect = document.getElementById('semester-select');
const subjectSelect = document.getElementById('subject-select');
const toast = document.getElementById('toast');
const inputBox = document.querySelector('.input-box');
const suggestionsList = document.getElementById('suggestions-list');
const serverStatusText = document.getElementById('status-text');
const serverStatusIcon = document.getElementById('status-icon');
const resultsContainer = document.getElementById('results-container');
const searchButton = document.querySelector('.search-button');
const searchButtonText = searchButton.querySelector('.button-text');
const clearSearchBtn = document.getElementById('clear-search-btn');
const notifFeed = document.getElementById('notif-feed');
const notifList = document.getElementById('notif-list');

const SUPABASE_URL = "https://jotiuetuvhikqvqinfxa.supabase.co";
const SUPABASE_KEY = "sb_publishable_2EFUAz5EIdnRohDdi3NLlQ_2qmAA_x5";

let animationActive = false;

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}



function populateOptions(selectElement, optionsArray, valueKey, labelKey, defaultText = 'Select') {
    const optionsContainer = selectElement.querySelector('.select-options');
    optionsContainer.innerHTML = '';

    const defaultOption = document.createElement('div');
    defaultOption.textContent = defaultText;
    defaultOption.setAttribute('data-value', '');
    defaultOption.classList.add('placeholder');
    optionsContainer.appendChild(defaultOption);

    optionsArray.forEach(item => {
        const optionDiv = document.createElement('div');
        optionDiv.textContent = item[labelKey];
        optionDiv.setAttribute('data-value', item[valueKey]);
        optionsContainer.appendChild(optionDiv);
    });

    attachOptionClickHandlers(selectElement);
}

function attachOptionClickHandlers(selectElement) {
    const trigger = selectElement.querySelector('.select-trigger');
    const selectedTextSpan = trigger.querySelector('.selected-text');
    const options = selectElement.querySelectorAll('.select-options div');

    options.forEach(option => {
        option.removeEventListener('click', option.clickHandler);
        const handler = (e) => {
            e.stopPropagation();
            const value = option.getAttribute('data-value');
            const text = option.textContent;
            selectedTextSpan.textContent = text;
            selectElement.setAttribute('data-selected-value', value);
            selectElement.querySelectorAll('.select-options div').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectElement.classList.remove('open');

            if (selectElement.id === 'subject-select' && value) {
                inputBox.value = '';
            }

            if (selectElement.id.startsWith('notes-')) {
                notesResultsContainer.innerHTML = '';
                selectedNotesModules = [];
                currentNotesSubject = null;
            } else {
                resultsContainer.innerHTML = '';
                selectedPapers = [];
                searchButtonText.textContent = "SEARCH";
            }

            if (selectElement.id === 'semester-select') {
                const selectedSemesterKey = value;
                if (selectedSemesterKey && semesterData[selectedSemesterKey]) {
                    const subjects = semesterData[selectedSemesterKey].sort((a, b) => a.name.localeCompare(b.name));
                    const subjectOptions = subjects.map(subj => ({
                        name: subj.name,
                        code: subj.code,
                    }));
                    populateOptions(subjectSelect, subjectOptions, 'code', 'name', 'Select Subject');
                    const subjectTrigger = subjectSelect.querySelector('.select-trigger .selected-text');
                    subjectTrigger.textContent = 'Select Subject';
                    subjectSelect.setAttribute('data-selected-value', '');
                } else {
                    const subjectOptionsContainer = subjectSelect.querySelector('.select-options');
                    subjectOptionsContainer.innerHTML = '';
                    const defaultSubjOption = document.createElement('div');
                    defaultSubjOption.textContent = 'Select Subject';
                    defaultSubjOption.setAttribute('data-value', '');
                    subjectOptionsContainer.appendChild(defaultSubjOption);
                    attachOptionClickHandlers(subjectSelect);
                    const subjectTrigger = subjectSelect.querySelector('.select-trigger .selected-text');
                    subjectTrigger.textContent = 'Select Subject';
                    subjectSelect.setAttribute('data-selected-value', '');
                }
            }

            if (selectElement.id === 'notes-semester-select') {
                const selectedSem = value;
                if (selectedSem) {
                    const subjects = notesSubjects
                        .filter(s => s.semester === selectedSem)
                        .sort((a, b) => a.code.localeCompare(b.code));
                    const opts = subjects.map(s => ({ code: s.code, name: s.name }));
                    populateOptions(notesSubjectSelect, opts, 'code', 'name', 'Select Subject');
                    const subTrigger = notesSubjectSelect.querySelector('.select-trigger .selected-text');
                    subTrigger.textContent = 'Select Subject';
                    notesSubjectSelect.setAttribute('data-selected-value', '');
                }
            }
        };
        option.clickHandler = handler;
        option.addEventListener('click', handler);
    });
}

function initCustomSelect(selectElement) {
    const trigger = selectElement.querySelector('.select-trigger');
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectElement.id === 'subject-select' || selectElement.id === 'notes-subject-select') {
            const semSelect = selectElement.id === 'subject-select' ? semesterSelect : notesSemesterSelect;
            const semesterSelected = semSelect.getAttribute('data-selected-value');
            if (!semesterSelected || semesterSelected === '') {
                showToast('Please select a semester first');
                return;
            }
        }
        document.querySelectorAll('.custom-select.open').forEach(other => {
            if (other !== selectElement) other.classList.remove('open');
        });
        selectElement.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!selectElement.contains(e.target)) {
            selectElement.classList.remove('open');
        }
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

                const semesterTrigger = semesterSelect.querySelector('.selected-text');
                semesterTrigger.textContent = targetSem;
                semesterSelect.setAttribute('data-selected-value', targetSem);
                const subjectsForTargetSem = semesterData[targetSem];
                const subjectOptions = subjectsForTargetSem.map(s => ({ 
                    code: s.code, 
                    name: s.name, 
                }));
                populateOptions(subjectSelect, subjectOptions, 'code', 'name', 'Select Subject');
                
                const subjectTrigger = subjectSelect.querySelector('.selected-text');
                subjectTrigger.textContent = subject.name;
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

async function initializeApp() {
    try {
        try {
            const statusResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/public/papers/app_status.json?t=${Date.now()}`);
            if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                if (statusData.maintenance === true) {
                    throw new Error('MAINTENANCE_MODE');
                }
            }
        } catch (statusError) {
            if (statusError.message === 'MAINTENANCE_MODE') throw statusError;
        }

        const response = await fetch(`${SUPABASE_URL}/rest/v1/papers?select=subject_code,subject_name,semester`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        const data = await response.json();

        data.forEach(item => {
            if (!semesterData[item.semester]) semesterData[item.semester] = [];
            
            if (!semesterData[item.semester].find(s => s.code === item.subject_code)) {
                semesterData[item.semester].push({
                    code: item.subject_code,
                    name: item.subject_name
                });
                allSubjects.push({
                    code: item.subject_code,
                    name: item.subject_name,
                    semester: item.semester
                });
            }
        });

        const semesterKeys = Object.keys(semesterData).sort();
        const semesterOptions = semesterKeys.map(key => ({ key: key, label: key }));
        populateOptions(semesterSelect, semesterOptions, 'key', 'label', 'Select Semester');

        initCustomSelect(semesterSelect);
        initCustomSelect(subjectSelect);
        
        fetchNotifications();
        setInterval(fetchNotifications, NOTIF_CACHE_TTL);

        serverStatusText.textContent = "Server Is Online";
        serverStatusIcon.src = "/assets/server-status/online.svg";
        serverStatusIcon.style.animation = "rotate-icon 4s linear infinite";
    } catch (error) {
        if (error.message === 'MAINTENANCE_MODE') {
            showToast('Server is currently under maintenance.');
            serverStatusText.textContent = "Server Under Maintenance";
        } else {
            showToast('Failed to connect to database.');
            serverStatusText.textContent = "Server Is Offline";
        }
        serverStatusIcon.src = "/assets/server-status/offline.svg";
        serverStatusIcon.style.animation = "none";
    }
}

let pyqSuggestionIndex = -1;

function updateActiveSuggestion(list) {
    const items = list.querySelectorAll('.suggestion-item');
    items.forEach((item, i) => {
        item.classList.toggle('active', i === pyqSuggestionIndex);
    });
}

inputBox.placeholder = 'Enter Subject Code / Subject Name';

initializeApp();

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
    if (notesInput && !notesInput.contains(e.target) && !notesSuggestions.contains(e.target)) {
        notesSuggestions.classList.remove('show');
        notesSuggestionIndex = -1;
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (document.getElementById('pyq-section').style.display !== 'none') {
            const sem = semesterSelect.getAttribute('data-selected-value');
            const subj = subjectSelect.getAttribute('data-selected-value');
            if (sem && subj) {
                e.preventDefault();
                performSearch();
            }
        } else {
            const sem = notesSemesterSelect.getAttribute('data-selected-value');
            const subj = notesSubjectSelect.getAttribute('data-selected-value');
            if (sem && subj) {
                e.preventDefault();
                searchNotes();
            }
        }
    }
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.dataset.tab;
        document.getElementById('pyq-section').style.display = tab === 'pyq' ? '' : 'none';
        document.getElementById('notes-section').style.display = tab === 'notes' ? '' : 'none';

        if (tab === 'notes' && notesSubjects.length === 0) {
            fetchNotesSubjects();
        }

        const desc = document.getElementById('contribute-desc');
        if (desc) {
            if (tab === 'notes') {
                desc.innerHTML = 'If you are a student or faculty member, you can share the 2024 scheme module-wise notes through the <a href="https://docs.google.com/forms/d/e/1FAIpQLSc9AAAjFNZ8jirITkUbKA8-qFUyqfGsm-JsELzIBz9q_neGLg/viewform?usp=publish-editor" target="_blank">Google Form</a>';
            } else {
                desc.innerHTML = 'If you are a student or faculty member, you can share the 2024 scheme question papers through the <a href="https://docs.google.com/forms/d/e/1FAIpQLSfa9GLIEIGP3MsFCTOvrmSlgO33ebS7zhPnbwgBmE9_g6YWWg/viewform?usp=header" target="_blank">Google Form</a>';
            }
        }
    });
});

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

function updateDownloadButton() {
    if (selectedPapers.length > 0) {
        searchButtonText.textContent = zipEnabled
            ? `DOWNLOAD AS ZIP (${selectedPapers.length})`
            : `DOWNLOAD (${selectedPapers.length})`;
    } else {
        searchButtonText.textContent = "SEARCH";
    }
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

    const textEl = document.getElementById('select-all-text');
    if (textEl) {
        textEl.textContent = allSelected ? 'Deselect All' : 'Select All';
    }
    if (allSelected) {
        selectAllBtn.classList.add('selected');
    } else {
        selectAllBtn.classList.remove('selected');
    }
}

function toggleZipMode() {
    zipEnabled = !zipEnabled;
    updateZipButton();
    updateDownloadButton();
}

function updateZipButton() {
    const zipBtn = document.getElementById('download-zip-btn');
    if (!zipBtn) return;

    const checkbox = zipBtn.querySelector('.btn-checkbox');
    const text = zipBtn.querySelector('.zip-btn-text');
    if (checkbox) {
        checkbox.style.backgroundColor = zipEnabled ? 'var(--color-dark)' : 'transparent';
    }
    if (text) {
        text.textContent = 'Convert to ZIP';
    }
}

let lastSearchKey = null;

async function performSearch() {
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
                const subjectOptions = subjects.map(subj => ({
                    name: subj.name,
                    code: subj.code
                }));
                populateOptions(subjectSelect, subjectOptions, 'code', 'name', 'Select Subject');
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
            <div class="btn-checkbox" id="select-all-checkbox"></div>
            <span id="select-all-text">Select All</span>
        </div>
        <div class="action-btn" id="download-zip-btn">
            <div class="btn-checkbox"></div>
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
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
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
                                <div class="paper-title">
                                    ${item.subject_name}
                                </div>
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
                    <div class="paper-item" onclick="togglePaperSelection('${item.url}', this)" data-url="${item.url}" data-subject-code="${item.subject_code}">
                        <div class="paper-item-left">
                            <div class="paper-checkbox"></div>
                            <div class="paper-title">
                                ${item.subject_name}
                            </div>
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

function downloadSelectedPapers() {
    if (selectedPapers.length === 0) return;
    
    if (serverStatusText.textContent !== "Server Is Online") {
        showToast("Server is currently offline. Please try again later.");
        return;
    }
    
    const paperCard = resultsContainer.querySelector('.results-card.paper-list');
    const savedHtml = paperCard ? paperCard.getAttribute('data-paper-html') : null;

    if (paperCard) {
        paperCard.innerHTML = `
            <div class="loading-text" style="margin-bottom: 24px;">PREPARING YOUR PAPERS</div>
            <div class="progress-bar-container" style="width: 80%;">
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
            paperCard.innerHTML = savedHtml;
            paperCard.classList.remove('loading-container');
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

    if (serverStatusText.textContent !== "Server Is Online") {
        showToast("Server is currently offline. Please try again later.");
        return;
    }

    const paperCard = resultsContainer.querySelector('.results-card.paper-list');
    const savedHtml = paperCard ? paperCard.getAttribute('data-paper-html') : null;
    const firstPaper = paperCard ? paperCard.querySelector('.paper-item[data-subject-code]') : null;
    const subjectCode = firstPaper ? firstPaper.dataset.subjectCode : 'KTU-Papers';

    if (paperCard) {
        paperCard.innerHTML = `
            <div class="loading-text" style="margin-bottom: 24px;">ZIPPING PAPERS</div>
            <div class="progress-bar-container" style="width: 80%;">
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
                if (loadingText) {
                    loadingText.textContent = `ZIPPING ${i + 1}/${selectedPapers.length} PAPERS`;
                }
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
            paperCard.innerHTML = savedHtml;
            paperCard.classList.remove('loading-container');
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
            paperCard.innerHTML = savedHtml;
            paperCard.classList.remove('loading-container');
        }
    }
}

window.togglePaperSelection = togglePaperSelection;
window.toggleSelectAll = toggleSelectAll;

if (searchButton) {
    searchButton.addEventListener('click', function(e) {
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
}

const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIcon = document.getElementById('theme-icon');
const notifBtn = document.getElementById('notif-btn');
const notifIcon = notifBtn ? notifBtn.querySelector('.action-icon') : null;
const githubIcon = document.getElementById('github-icon');
const donateLogoHeader = document.getElementById('donate-logo');
const upiCopyIcon = document.getElementById('upi-copy-icon');

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    if (theme === 'dark') {
        if (themeIcon) themeIcon.src = '/assets/buttons/light-mode.svg';
        if (notifIcon) notifIcon.src = '/assets/buttons/bell-dark.svg';
        if (githubIcon) githubIcon.src = '/assets/github/GitHub-dark.svg';
        if (donateLogoHeader) donateLogoHeader.src = '/assets/donate/heart-light.svg';
        if (upiCopyIcon) upiCopyIcon.src = '/assets/donate/copy-light.svg';
    } else {
        if (themeIcon) themeIcon.src = '/assets/buttons/dark-mode.svg';
        if (notifIcon) notifIcon.src = '/assets/buttons/bell-light.svg';
        if (githubIcon) githubIcon.src = '/assets/github/GitHub-light.svg';
        if (donateLogoHeader) donateLogoHeader.src = '/assets/donate/heart-dark.svg';
        if (upiCopyIcon) upiCopyIcon.src = '/assets/donate/copy-dark.svg';
    }
}

const savedTheme = localStorage.getItem('theme') || 'light';
setTheme(savedTheme);

if (themeToggleBtn) {
    function toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';

        if (!document.startViewTransition) {
            setTheme(newTheme);
            return;
        }

        const isMobile = window.innerWidth <= 768;
        
        if (isMobile) {
            document.startViewTransition(() => {
                setTheme(newTheme);
            });
            return;
        }

        const rect = themeToggleBtn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
        );

        const transition = document.startViewTransition(() => {
            setTheme(newTheme);
        });

        transition.ready.then(() => {
            document.documentElement.animate(
                {
                    clipPath: [
                        `circle(0px at ${x}px ${y}px)`,
                        `circle(${endRadius}px at ${x}px ${y}px)`,
                    ],
                },
                {
                    duration: 450,
                    easing: 'ease-in-out',
                    pseudoElement: '::view-transition-new(root)',
                }
            );
        });

        transition.finished.then(() => {
            document.documentElement.style.overflow = '';
        });
    }

    themeToggleBtn.addEventListener('click', toggleTheme);
}

if (notifBtn) {
    notifBtn.addEventListener('click', () => {
        if (notifFeed && notifFeed.style.display !== 'none') {
            notifFeed.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
}

const NOTIF_CACHE_KEY = 'ktu_notifications';
const NOTIF_CACHE_TTL = 5 * 60 * 1000;

async function fetchNotifications() {
    const cached = localStorage.getItem(NOTIF_CACHE_KEY);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (parsed && Array.isArray(parsed.data) && parsed.timestamp) {
                const age = Date.now() - parsed.timestamp;
                if (age < NOTIF_CACHE_TTL) {
                    const sorted = parsed.data.sort((a, b) => new Date(b.date) - new Date(a.date));
                    renderNotifications(sorted);
                }
            }
        } catch (_) {}
    }

    try {
        const response = await fetch('https://ktu-announcements-api-wxk8.onrender.com/announcements?scheme=2024');
        if (!response.ok) throw new Error('API server returned error status');
        
        const result = await response.json();
        if (result && result.success && Array.isArray(result.data)) {
            const sorted = result.data.sort((a, b) => new Date(b.date) - new Date(a.date));
            localStorage.setItem(NOTIF_CACHE_KEY, JSON.stringify({ data: sorted, timestamp: Date.now() }));
            renderNotifications(sorted);
            return;
        }
        throw new Error('API response format invalid');
    } catch (error) {
        if (!cached) {
            console.error('Failed to fetch notifications and no cache available:', error);
            if (notifFeed) notifFeed.style.display = 'none';
            if (notifBtn) notifBtn.style.display = 'none';
        } else {
            console.warn('Failed to fetch fresh notifications, using cached data:', error);
        }
    }
}

function renderNotifications(notifications) {
    if (!notifications || notifications.length === 0) {
        if (notifFeed) notifFeed.style.display = 'none';
        if (notifBtn) notifBtn.style.display = 'none';
        return;
    }

    if (notifFeed) notifFeed.style.display = 'block';
    if (notifBtn) notifBtn.style.display = 'flex-start';

    notifList.innerHTML = '';
    notifications.forEach(n => {
        const date = new Date(n.date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
        });
        
        const bodyContent = n.description_html || `<p>${escapeHtml(n.description_text || n.title)}</p>`;
        
        let attachmentsHtml = '';
        if (Array.isArray(n.attachments) && n.attachments.length > 0) {
            const attachmentLinks = n.attachments.map(att => {
                const downloadUrl = `https://ktu-announcements-api-wxk8.onrender.com/download/${att.encrypt_id}`;
                const fileName = att.filename || 'Attachment';
                const shortName = fileName.length > 20 ? fileName.substring(0, 17) + '...' : fileName;
                return `<a href="${downloadUrl}" target="_self" class="notif-attachment-link">
                            ${escapeHtml(shortName)}
                            <img class="notif-download-icon" alt="">
                        </a>`;
            }).join('');
            attachmentsHtml = `<div class="notif-attachments">${attachmentLinks}</div>`;
        }
        
        const notifItem = document.createElement('div');
        notifItem.className = 'notif-item';
        notifItem.innerHTML = `
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-body">${bodyContent}</div>
            <div class="notif-row">
                <span class="notif-date">${date}</span>
                ${attachmentsHtml}
            </div>
        `;
        
        notifList.appendChild(notifItem);
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const donateBtn = document.getElementById('donate-btn');
const donateModal = document.getElementById('donate-modal');
const copyUpiBtn = document.getElementById('copy-upi-btn');

if (donateBtn && donateModal) {
    donateBtn.addEventListener('click', () => {
        donateModal.classList.add('active');
    });
}

if (donateModal) {
    donateModal.addEventListener('click', (e) => {
        if (e.target === donateModal) {
            donateModal.classList.remove('active');
        }
    });
}

let notesSubjects = [];
let currentNotesSubject = null;
let selectedNotesModules = [];
let notesZipEnabled = false;
let notesModulesData = [];

const notesSemesterSelect = document.getElementById('notes-semester-select');
const notesSubjectSelect = document.getElementById('notes-subject-select');
const notesResultsContainer = document.getElementById('notes-results-container');
const notesSearchBtn = document.getElementById('notes-search-btn');

initCustomSelect(notesSemesterSelect);
attachOptionClickHandlers(notesSemesterSelect);

async function fetchNotesSubjects() {
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
}

function populateNotesSubjectSelect(semester) {
    const filtered = notesSubjects
        .filter(s => s.semester === semester)
        .sort((a, b) => a.code.localeCompare(b.code));

    if (filtered.length === 0) {
        notesResultsContainer.innerHTML = `
            <div class="results-card" style="display: flex; align-items: center; justify-content: center; min-height: 72px;">
                <span class="no-results-text">No notes available for ${semester}</span>
            </div>
        `;
        return;
    }

    const options = filtered.map(s => ({ code: s.code, name: s.name }));
    populateOptions(notesSubjectSelect, options, 'code', 'name', 'Select Subject');
}

initCustomSelect(notesSubjectSelect);

let notesSuggestionIndex = -1;

function updateNotesActiveSuggestion() {
    const items = notesSuggestions.querySelectorAll('.suggestion-item');
    items.forEach((item, i) => {
        item.classList.toggle('active', i === notesSuggestionIndex);
    });
}

const notesInput = document.querySelector('.notes-input');
const notesClearBtn = document.getElementById('clear-notes-search-btn');
const notesSuggestions = document.getElementById('notes-suggestions-list');

new MutationObserver(() => {
    if (document.getElementById('notes-section').style.display !== 'none') {
        const sem = notesSemesterSelect.getAttribute('data-selected-value');
        if (sem && notesSubjects.length > 0) {
            populateNotesSubjectSelect(sem);
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
                notesSuggestions.classList.remove('show');
            }
        } else {
            notesClearBtn.classList.remove('show');
            notesSuggestions.classList.remove('show');
        }
    });

    notesSuggestions.addEventListener('click', (e) => {
        const item = e.target.closest('.suggestion-item');
        if (!item) return;

        const code = item.dataset.code;
        const name = item.dataset.name;
        const semester = item.dataset.semester;

        notesInput.value = code;
        notesClearBtn.classList.remove('show');
        notesSuggestions.classList.remove('show');
        notesSuggestionIndex = -1;

        const semTrigger = notesSemesterSelect.querySelector('.selected-text');
        semTrigger.textContent = semester;
        notesSemesterSelect.setAttribute('data-selected-value', semester);

        const filtered = notesSubjects
            .filter(s => s.semester === semester)
            .sort((a, b) => a.code.localeCompare(b.code));
        const opts = filtered.map(s => ({ code: s.code, name: s.name }));
        populateOptions(notesSubjectSelect, opts, 'code', 'name', 'Select Subject');

        const subTrigger = notesSubjectSelect.querySelector('.selected-text');
        subTrigger.textContent = name;
        notesSubjectSelect.setAttribute('data-selected-value', code);
    });

    if (notesClearBtn) {
        notesClearBtn.addEventListener('click', () => {
            notesInput.value = '';
            notesClearBtn.classList.remove('show');
            notesSuggestions.classList.remove('show');
            notesSuggestionIndex = -1;
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
            notesSuggestions.classList.remove('show');
            notesSuggestionIndex = -1;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const activeItem = notesSuggestions.querySelector('.suggestion-item.active');
            if (activeItem) {
                activeItem.click();
            } else if (items.length > 0) {
                items[0].click();
            }
            notesSearchBtn.click();
        }
    });

    notesInput.placeholder = 'Enter Subject Code / Subject Name';
}

notesSearchBtn.addEventListener('click', () => {
    if (selectedNotesModules.length > 0) {
        handleNotesDownload();
    } else {
        searchNotes();
    }
});

async function searchNotes() {
    let subjectToSearch = null;
    let inputCode = notesInput.value.trim().toUpperCase();
    let selectedCode = notesSubjectSelect.getAttribute('data-selected-value');

    if (inputCode) {
        subjectToSearch = notesSubjects.find(s => s.code.toUpperCase() === inputCode);
    } else if (selectedCode) {
        subjectToSearch = notesSubjects.find(s => s.code === selectedCode);
    }

    if (!subjectToSearch) {
        showToast('Please enter or select a valid subject');
        return;
    }

    notesInput.value = '';
    notesClearBtn.classList.remove('show');
    notesSuggestions.classList.remove('show');
    notesSuggestionIndex = -1;

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
            <div class="fade-wrapper" style="opacity: 0; transition: opacity 0.3s ease;">
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
        loaderContainer.style.height = '';

        requestAnimationFrame(() => {
            const fw = loaderContainer.querySelector('.fade-wrapper');
            if (fw) fw.style.opacity = '1';
        });
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

        requestAnimationFrame(() => {
            const fw = card.querySelector('.fade-wrapper');
            if (fw) fw.style.opacity = '1';
        });
    }

    let actionsDiv = notesResultsContainer.querySelector('.paper-actions');
    if (!actionsDiv) {
        actionsDiv = document.createElement('div');
        actionsDiv.className = 'paper-actions';
        actionsDiv.innerHTML = `
            <div class="action-btn" id="notes-select-all-btn">
                <div class="btn-checkbox"></div>
                <span id="notes-select-all-text">Select All</span>
            </div>
            <div class="action-btn" id="notes-download-zip-btn">
                <div class="btn-checkbox"></div>
                <span class="zip-btn-text">Convert to ZIP</span>
            </div>
        `;
        notesResultsContainer.appendChild(actionsDiv);
    }

    notesResultsContainer.querySelectorAll('[data-notes-module]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleNotesModule(el);
        });
    });

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
        const checkbox = btn ? btn.querySelector('.btn-checkbox') : null;
        if (checkbox) checkbox.style.backgroundColor = notesZipEnabled ? 'var(--color-dark)' : 'transparent';
        updateNotesDownloadButton();
    });

    updateNotesDownloadButton();
    updateNotesSelectAllButton();
}

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
    const textEl = document.getElementById('notes-select-all-text');
    if (textEl) textEl.textContent = allSelected ? 'Deselect All' : 'Select All';
    if (allSelected) btn.classList.add('selected');
    else btn.classList.remove('selected');
}

function toggleNotesModule(el) {
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

    notesResultsContainer.innerHTML = `
        <div class="results-card loading-container" style="display: flex;">
            <div class="loading-text">${isZip ? 'ZIPPING' : 'PREPARING'} YOUR NOTES</div>
            <div class="progress-bar-container" style="width: 80%;">
                <div class="progress-bar"></div>
            </div>
        </div>
    `;

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
            notesResultsContainer.innerHTML = '';
            selectedNotesModules = [];
            notesZipEnabled = false;
            currentNotesSubject = null;
            updateNotesDownloadButton();
        }, 2000);
    };

    setTimeout(downloadAll, PREP_TIME);
}

function cleanNotesTitle(title, moduleNum) {
    const cleaned = title.replace(/^M\d+[\s-]*/, '').trim();
    return cleaned || currentNotesSubject?.code || `Module ${moduleNum}`;
}

if (copyUpiBtn) {
    copyUpiBtn.addEventListener('click', () => {
        const upiId = 'rohithpai@sib';
        navigator.clipboard.writeText(upiId).then(() => {
            showToast('UPI ID Copied');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = upiId;
            textarea.style.position = 'fixed';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                showToast('UPI ID Copied');
            } catch (err) {
                showToast('Failed to copy UPI ID');
            }
            document.body.removeChild(textarea);
        });
    });
}