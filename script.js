let semesterData = {};
let allSubjects = [];
let currentSemester = null;
let selectedPapers = [];

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
        if (item.downloads) {
            optionDiv.setAttribute('data-full', JSON.stringify(item));
        }
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
            if (option.getAttribute('data-full')) {
                selectElement.setAttribute('data-full', option.getAttribute('data-full'));
            } else {
                selectElement.removeAttribute('data-full');
            }
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
                    currentSemester = selectedSemesterKey;
                    const subjects = semesterData[selectedSemesterKey];
                    const subjectOptions = subjects.map(subj => ({
                        name: subj.name,
                        code: subj.code,
                        downloads: subj.downloads
                    }));
                    populateOptions(subjectSelect, subjectOptions, 'code', 'name', 'Select Subject');
                    const subjectTrigger = subjectSelect.querySelector('.select-trigger .selected-text');
                    subjectTrigger.textContent = 'Select Subject';
                    subjectSelect.setAttribute('data-selected-value', '');
                    subjectSelect.removeAttribute('data-full');
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
                    subjectSelect.removeAttribute('data-full');
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
                    downloads: s.downloads 
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

        const semesterKeys = ["Semester 1", "Semester 2"]; 
        const semesterOptions = semesterKeys.map(key => ({ key: key, label: key }));
        populateOptions(semesterSelect, semesterOptions, 'key', 'label', 'Select Semester');

        initCustomSelect(semesterSelect);
        initCustomSelect(subjectSelect);
        
        await fetchNotifications();

        serverStatusText.textContent = "Server Is Online";
        serverStatusIcon.src = "/assets/server-status/online.svg";
        serverStatusIcon.style.animation = "rotate-icon 4s linear infinite";
    } catch (error) {
        showToast('Failed to connect to database.');
        serverStatusText.textContent = "Server Is Offline";
        serverStatusIcon.src = "/assets/server-status/offline.svg";
        serverStatusIcon.style.animation = "none";
    }
}

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
}

function updateDownloadButton() {
    if (selectedPapers.length > 0) {
        searchButtonText.textContent = `DOWNLOAD (${selectedPapers.length})`;
    } else {
        searchButtonText.textContent = "SEARCH";
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
            
            const subjects = semesterData[selectedSem];
            if (subjects) {
                const subjectOptions = subjects.map(subj => ({
                    name: subj.name,
                    code: subj.code
                }));
                populateOptions(subjectSelect, subjectOptions, 'code', 'name', 'Select Subject');
            }
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
                                    ${item.subject_name} <span class="paper-code">(${item.subject_code})</span>
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
                    <div class="paper-item" onclick="togglePaperSelection('${item.url}', this)">
                        <div class="paper-item-left">
                            <div class="paper-checkbox"></div>
                            <div class="paper-title">
                                ${item.subject_name} <span class="paper-code">(${item.subject_code})</span>
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
                    }
                    
                    selectedPapers = [];
                    updateDownloadButton();
                }, 2000); 
            }
        }, PREP_TIME + (i * 800));
    });
}

window.togglePaperSelection = togglePaperSelection;

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
                downloadSelectedPapers();
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
const bmcLogoHeader = document.getElementById('bmc-logo');

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    if (theme === 'dark') {
        if (themeIcon) themeIcon.src = '/assets/buttons/light-mode.svg';
        if (notifIcon) notifIcon.src = '/assets/buttons/bell-dark.svg';
        if (githubIcon) githubIcon.src = '/assets/github/GitHub-dark.svg';
        if (bmcLogoHeader) bmcLogoHeader.src = '/assets/bmc/bmc-logo-dark.svg';
    } else {
        if (themeIcon) themeIcon.src = '/assets/buttons/dark-mode.svg';
        if (notifIcon) notifIcon.src = '/assets/buttons/bell-light.svg';
        if (githubIcon) githubIcon.src = '/assets/github/GitHub-light.svg';
        if (bmcLogoHeader) bmcLogoHeader.src = '/assets/bmc/bmc-logo-light.svg';
    }
}

const savedTheme = localStorage.getItem('theme') || 'light';
setTheme(savedTheme);

if (themeToggleBtn) {
    function toggleTheme(event) {
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
            document.documentElement.style.overflow = 'hidden';
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
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/notifications?select=*&order=posted_at.desc`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        const allNotifs = await response.json();
        
        const now = new Date();
        const activeNotifs = allNotifs.filter(n => {
            if (n.expires_after_days === null) return true;
            const expiry = new Date(n.posted_at);
            expiry.setDate(expiry.getDate() + n.expires_after_days);
            return now < expiry;
        });

        renderNotifications(activeNotifs);
    } catch (error) {
        console.error('Error fetching notifications:', error);
    }
}

function renderNotifications(notifications) {
    if (notifications.length === 0) {
        if (notifFeed) notifFeed.style.display = 'none';
        return;
    }

    if (notifFeed) notifFeed.style.display = 'block';

    notifList.innerHTML = '';
    notifications.forEach(n => {
        const date = new Date(n.posted_at).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
        });

        const notifItem = document.createElement('div');
        notifItem.className = 'notif-item';
        notifItem.innerHTML = `
            <div class="notif-item-top">
                <span class="notif-title">${n.title}</span>
            </div>
            <div class="notif-body">${n.body}</div>
            <div class="notif-bottom">
                <div class="notif-date">${date}</div>
                ${n.url ? `<a href="${n.url}" target="_blank" class="notif-link">${n.url_title || 'View Link'} ↗</a>` : ''}
            </div>
        `;
        
        notifList.appendChild(notifItem);
    });
}