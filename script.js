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

            resultsContainer.innerHTML = '';
            selectedPapers = [];
            searchButtonText.textContent = "SEARCH";

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
        };
        option.clickHandler = handler;
        option.addEventListener('click', handler);
    });
}

function initCustomSelect(selectElement) {
    const trigger = selectElement.querySelector('.select-trigger');
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectElement.id === 'subject-select') {
            const semesterSelected = semesterSelect.getAttribute('data-selected-value');
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
        return;
    }

    const filtered = allSubjects.filter(subject => 
        subject.code.toLowerCase().includes(query.toLowerCase()) ||
        subject.name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5);

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

function updateInputPlaceholder() {
    if (window.innerWidth <= 768) {
        inputBox.placeholder = 'Enter Subject Code';
    } else {
        inputBox.placeholder = 'Enter Subject Code / Subject Name';
    }
}

updateInputPlaceholder();
window.addEventListener('resize', updateInputPlaceholder);

initializeApp();

inputBox.addEventListener('input', (e) => {
    const value = e.target.value;
    
    if (window.innerWidth > 768) {
        updateSuggestions(value);
    }
    
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
    }
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

        const existingActions = resultsContainer.querySelector('.paper-actions');
        if (existingActions) existingActions.remove();

        zipEnabled = false;

        if (papers.length > 1) {
            const actions = document.createElement('div');
            actions.className = 'paper-actions';
            actions.innerHTML = `
                <div class="action-btn" id="select-all-btn">
                    <div class="btn-checkbox" id="select-all-checkbox"></div>
                    <span id="select-all-text">Select All</span>
                </div>
                <div class="action-btn" id="download-zip-btn">
                    <div class="btn-checkbox"></div>
                    <span class="zip-btn-text">Convert to ZIP</span>
                </div>
            `;
            resultsContainer.appendChild(actions);
            document.getElementById('select-all-btn').addEventListener('click', toggleSelectAll);
            document.getElementById('download-zip-btn').addEventListener('click', toggleZipMode);
        }

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

async function fetchNotifications() {
    const cached = localStorage.getItem('ktu_notifications');
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (parsed && Array.isArray(parsed.data)) {
                const sorted = parsed.data.sort((a, b) => new Date(b.date) - new Date(a.date));
                renderNotifications(sorted);
            }
        } catch (_) {}
    }

    try {
        const response = await fetch('https://ktu-announcements-api-wxk8.onrender.com/announcements?scheme=2024');
        if (!response.ok) throw new Error('API server returned error status');
        
        const result = await response.json();
        if (result && result.success && Array.isArray(result.data)) {
            const sorted = result.data.sort((a, b) => new Date(b.date) - new Date(a.date));
            localStorage.setItem('ktu_notifications', JSON.stringify({ data: sorted }));
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