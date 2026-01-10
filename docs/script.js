let data = {};
let selectedPaperUrls = [];
let activeMode = null;

const codeInput = document.getElementById("codeInput");
const semesterDropdown = document.getElementById("semesterDropdown");
const subjectDropdown = document.getElementById("subjectDropdown");
const subjectMenu = subjectDropdown.querySelector(".dropdown-menu");
const subjectLabel = subjectDropdown.querySelector("span");

const papersBox = document.getElementById("papers");
const searchBtn = document.getElementById("searchBtn");
const errorMsg = document.getElementById("errorMsg");
const loadingBox = document.getElementById("loading");
const loadingText = document.getElementById("loadingText");

/* ---------- SERVER STATUS ---------- */
const SERVER_BASE = "https://ktu-archive-backend.onrender.com";
const serverStatus = document.getElementById("serverStatus");

async function checkServerStatus() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const res = await fetch(`${SERVER_BASE}/health`, {
            cache: "no-store",
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error();
        
        serverStatus.className = "server-status online";
        serverStatus.querySelector(".status-text").textContent = "Server online";
        return true;
    } catch (error) {
        serverStatus.className = "server-status offline";
        serverStatus.querySelector(".status-text").textContent = "Server offline";
        return false;
    }
}

checkServerStatus();
setInterval(checkServerStatus, 5000);

/* ---------- LOAD JSON ---------- */
fetch("data.json")
    .then(r => r.json())
    .then(j => data = j)
    .catch(err => console.error("JSON load error", err));

/* ---------- STATE HELPERS ---------- */

function clearDropdownState() {
    semesterDropdown.querySelector("span").textContent = "Select Semester";
    subjectLabel.textContent = "Select Subject";
    subjectMenu.innerHTML = "";
    subjectDropdown.classList.add("disabled");
    subjectDropdown.querySelector("button").disabled = true;
    hidePapers();
}

function clearCodeInput() {
    codeInput.value = "";
    hidePapers();
}

/* ---------- INPUT MODE ---------- */

codeInput.addEventListener("input", () => {
    if (codeInput.value.trim()) {
        activeMode = "code";
        clearDropdownState();
    }
});

/* ---------- DROPDOWNS ---------- */

document.querySelectorAll(".dropdown").forEach(dropdown => {
    const btn = dropdown.querySelector(".dropdown-btn");
    const menu = dropdown.querySelector(".dropdown-menu");
    const label = btn.querySelector("span");

    btn.addEventListener("click", e => {
        if (btn.disabled) return;
        e.stopPropagation();
        
        // Close any other open dropdowns
        document.querySelectorAll(".dropdown").forEach(d => {
            if (d !== dropdown) {
                d.classList.remove("open");
                d.querySelector(".dropdown-menu").classList.remove("open");
            }
        });
        
        dropdown.classList.toggle("open");
        menu.classList.toggle("open");
    });

    menu.addEventListener("click", e => {
        if (!e.target.classList.contains("option")) return;

        activeMode = "dropdown";
        clearCodeInput();
        label.textContent = e.target.textContent;

        dropdown.classList.remove("open");
        menu.classList.remove("open");

        if (dropdown.id === "semesterDropdown") {
            prepareSubjects(label.textContent);
        }
    });
});

// Close dropdowns when clicking outside
document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown")) {
        document.querySelectorAll(".dropdown").forEach(d => {
            d.classList.remove("open");
            d.querySelector(".dropdown-menu").classList.remove("open");
        });
    }
});

// Close dropdown on escape key
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        document.querySelectorAll(".dropdown").forEach(d => {
            d.classList.remove("open");
            d.querySelector(".dropdown-menu").classList.remove("open");
        });
    }
});

/* ---------- SUBJECT POPULATION ---------- */

function prepareSubjects(semester) {
    subjectMenu.innerHTML = "";
    subjectLabel.textContent = "Select Subject";
    subjectDropdown.classList.remove("disabled");
    subjectDropdown.querySelector("button").disabled = false;
    hidePapers();

    data[semester]?.forEach(sub => {
        const div = document.createElement("div");
        div.className = "option";
        div.textContent = sub.name;
        subjectMenu.appendChild(div);
    });
}

/* ---------- SEARCH ---------- */

searchBtn.addEventListener("click", () => {
    errorMsg.classList.add("hidden");

    if (selectedPaperUrls.length && !papersBox.classList.contains("hidden")) {
        downloadSelectedFiles();
        return;
    }

    let subject = null;

    if (activeMode === "code") {
        const code = codeInput.value.trim().toUpperCase();
        for (const sem in data) {
            const found = data[sem].find(s => s.code === code);
            if (found) {
                subject = found;
                semesterDropdown.querySelector("span").textContent = sem;
                prepareSubjects(sem);
                subjectLabel.textContent = found.name;
                break;
            }
        }
    }

    if (activeMode === "dropdown") {
        const sem = semesterDropdown.querySelector("span").textContent;
        const name = subjectLabel.textContent;
        subject = data[sem]?.find(s => s.name === name);
    }

    if (!subject) return showError();
    renderPapers(subject);
});

/* ---------- PAPERS ---------- */

function renderPapers(subject) {
    selectedPaperUrls = [];
    papersBox.innerHTML = "";
    papersBox.classList.remove("hidden");
    searchBtn.textContent = "DOWNLOAD";

    subject.downloads.forEach((p, index) => {
        const row = document.createElement("div");
        row.className = "paper-item";
        row.dataset.paperId = `paper-${index}`;
        
        row.innerHTML = `
            <div class="paper-left">
                <span class="custom-checkbox"></span>
                <span class="paper-text">${subject.name} (${subject.code})</span>
            </div>
            <div class="paper-year">${p.title}</div>
        `;

        const checkboxArea = row.querySelector(".paper-left");
        const customCheckbox = row.querySelector(".custom-checkbox");
        
        // Handle click on the entire paper-left area
        checkboxArea.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const isSelected = row.classList.toggle("selected");
            
            if (isSelected) {
                selectedPaperUrls.push({
                    url: p.url,
                    title: p.title,
                    subjectName: subject.name,
                    subjectCode: subject.code,
                    index: index
                });
            } else {
                const urlIndex = selectedPaperUrls.findIndex(item => item.url === p.url);
                if (urlIndex > -1) {
                    selectedPaperUrls.splice(urlIndex, 1);
                }
            }

            searchBtn.textContent = selectedPaperUrls.length
                ? `DOWNLOAD (${selectedPaperUrls.length})`
                : "DOWNLOAD";
        });
        
        // Handle direct click on checkbox
        customCheckbox.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            checkboxArea.click();
        });

        papersBox.appendChild(row);
    });
}

/* ---------- DOWNLOAD ---------- */

async function downloadSelectedFiles() {
    if (!selectedPaperUrls.length) return;

    if (!serverStatus.classList.contains("online")) {
        showLoading("Server offline");
        setTimeout(() => loadingBox.classList.add("hidden"), 1500);
        return;
    }

    searchBtn.textContent = "DOWNLOADING...";
    searchBtn.disabled = true;
    
    loadingBox.classList.remove("hidden");

    try {
        // Get file info first
        const fileInfos = [];
        for (let i = 0; i < selectedPaperUrls.length; i++) {
            const paper = selectedPaperUrls[i];
            showLoading(`Getting info ${i + 1}/${selectedPaperUrls.length}`);
            
            const fileId = extractFileId(paper.url);
            if (fileId) {
                try {
                    const info = await getFileInfo(fileId);
                    fileInfos.push({
                        filename: info.name,
                        paper: paper
                    });
                } catch (error) {
                    // Fallback to generated name
                    fileInfos.push({
                        filename: generateFilename(paper),
                        paper: paper
                    });
                }
            } else {
                // Fallback to generated name
                fileInfos.push({
                    filename: generateFilename(paper),
                    paper: paper
                });
            }
            
            await sleep(200);
        }
        
        // Download files with proper names
        for (let i = 0; i < fileInfos.length; i++) {
            const { filename, paper } = fileInfos[i];
            showLoading(`Downloading: ${filename}`);
            
            await downloadFileWithName(paper.url, filename);
            
            if (i < fileInfos.length - 1) {
                await sleep(300);
            }
        }
        
        showLoading("Download complete ✓");
        await sleep(800);
        
    } catch (error) {
        console.error("Download error:", error);
        showLoading("Download failed ✗");
        await sleep(1500);
    } finally {
        resetDownloadUI();
    }
}

function extractFileId(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get('id');
    } catch {
        return null;
    }
}

async function getFileInfo(fileId) {
    const response = await fetch(`${SERVER_BASE}/file-info?id=${fileId}`);
    if (!response.ok) throw new Error("Failed to get file info");
    return await response.json();
}

function generateFilename(paper) {
    // Clean special characters for filename
    const cleanSubject = paper.subjectName.replace(/[\/\\:*?"<>|]/g, '_');
    const cleanCode = paper.subjectCode.replace(/[\/\\:*?"<>|]/g, '_');
    const cleanYear = paper.title.replace(/[\/\\:*?"<>|]/g, '_');
    
    return `${cleanCode}_${cleanSubject}_${cleanYear}.pdf`
        .replace(/\s+/g, '_')
        .substring(0, 100); // Limit length
}

async function downloadFileWithName(url, filename) {
    try {
        const serverUrl = `${SERVER_BASE}/download?url=${encodeURIComponent(url)}`;
        const response = await fetch(serverUrl);
        
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        }, 100);
        
        return true;
    } catch (error) {
        throw error;
    }
}

function showLoading(text) {
    loadingText.textContent = text;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function resetDownloadUI() {
    loadingBox.classList.add("hidden");
    searchBtn.textContent = "SEARCH";
    searchBtn.disabled = false;
    
    // Clear all selected papers
    const paperItems = papersBox.querySelectorAll('.paper-item');
    paperItems.forEach(item => {
        item.classList.remove('selected');
    });
    
    // Clear selected papers array
    selectedPaperUrls = [];
}

/* ---------- HELPERS ---------- */

function hidePapers() {
    papersBox.classList.add("hidden");
    papersBox.innerHTML = "";
    selectedPaperUrls = [];
    searchBtn.textContent = "SEARCH";
}

function showError() {
    hidePapers();
    errorMsg.classList.remove("hidden");
}

/* ---------- ENTER KEY ---------- */

codeInput.addEventListener("keypress", e => {
    if (e.key === "Enter") searchBtn.click();
});

/* ---------- TOUCH OPTIMIZATIONS ---------- */

// Prevent double-tap zoom on mobile
let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// Better touch handling for checkboxes
document.addEventListener('touchstart', function(e) {
    if (e.target.closest('.paper-left')) {
        // Add visual feedback for touch
        const paperLeft = e.target.closest('.paper-left');
        if (paperLeft) {
            paperLeft.style.opacity = '0.8';
            setTimeout(() => {
                if (paperLeft.style) paperLeft.style.opacity = '';
            }, 200);
        }
    }
}, { passive: true });

/* ---------- INIT ---------- */

clearDropdownState();
clearCodeInput();