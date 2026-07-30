import { populateOptions, attachOptionClickHandlers, initCustomSelect } from './ui.js';

const frUsername = document.getElementById('fr-username');
const frPassword = document.getElementById('fr-password');
const frSemesterSelect = document.getElementById('fr-semester-select');

const frFetchBtn = document.getElementById('fr-fetch-btn');
const frLoading = document.getElementById('fr-loading');
const frLog = document.getElementById('fr-log');
const frError = document.getElementById('fr-error');
const frResults = document.getElementById('fr-results');
const frGrid = document.getElementById('fr-grid');
const frSummary = document.getElementById('fr-summary');
const frSgpa = document.getElementById('fr-sgpa');
const frCgpa = document.getElementById('fr-cgpa');
const frCredits = document.getElementById('fr-credits');
const frTotalCredits = document.getElementById('fr-total-credits');
const frSaveBtn = document.getElementById('fr-save-btn');
const frSaveCheck = frSaveBtn?.querySelector('.fr-save-check');
const frLoginView = document.getElementById('fr-login-view');
const frBackBtn = document.getElementById('fr-back-btn');
const frPrintBtn = document.getElementById('fr-print-btn');

const semesters = [
    { key: '1', label: 'Semester 1' },
    { key: '2', label: 'Semester 2' },
    { key: '3', label: 'Semester 3' },
    { key: '4', label: 'Semester 4' },
    { key: '5', label: 'Semester 5' },
    { key: '6', label: 'Semester 6' },
    { key: '7', label: 'Semester 7' },
    { key: '8', label: 'Semester 8' },
];

populateOptions(frSemesterSelect, semesters, 'key', 'label', 'Select Semester');
attachOptionClickHandlers(frSemesterSelect, () => {});
initCustomSelect(frSemesterSelect);

let savedCredentials = JSON.parse(sessionStorage.getItem('ktu_credentials') || 'null');

function applySavedCredentials() {
    if (savedCredentials) {
        frUsername.value = savedCredentials.username || '';
        frPassword.value = savedCredentials.password || '';
        frSaveBtn.classList.add('saved');
        if (frSaveCheck) frSaveCheck.style.display = 'block';
    }
}

function toggleSaveCredentials() {
    const isSaved = frSaveBtn.classList.toggle('saved');
    if (frSaveCheck) frSaveCheck.style.display = isSaved ? 'block' : 'none';

    if (isSaved) {
        savedCredentials = {
            username: frUsername.value.trim(),
            password: frPassword.value.trim()
        };
        sessionStorage.setItem('ktu_credentials', JSON.stringify(savedCredentials));
    } else {
        savedCredentials = null;
        sessionStorage.removeItem('ktu_credentials');
    }
}

frSaveBtn?.addEventListener('click', toggleSaveCredentials);

function setLoading(loading) {
    frLoading.style.display = loading ? 'flex' : 'none';
    frLoading.style.flexDirection = 'column';
    frFetchBtn.disabled = loading;
    frFetchBtn.querySelector('.button-text').textContent = loading ? 'FETCHING...' : 'FETCH RESULTS';
}

function addLogEntry(msg) {
    const entries = frLog.querySelectorAll('.fr-log-entry');
    entries.forEach(e => e.classList.remove('active'));
    const div = document.createElement('div');
    div.className = 'fr-log-entry active';
    div.textContent = msg;
    frLog.appendChild(div);
    frLog.scrollTop = frLog.scrollHeight;
}

function clearLog() {
    frLog.innerHTML = '';
}

function showError(msg) {
    frError.textContent = msg;
    frError.style.display = 'block';
    frResults.style.display = 'none';
}

function reorderHeaders(headers) {
    const patterns = [/course code/i, /subject code/i, /^code$/i, /subject name/i, /^subject$/i, /course name/i];
    const scored = headers.map((h, i) => {
        const score = patterns.findIndex(p => p.test(h.trim()));
        return { index: i, score: score !== -1 ? score : 999 };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored.map(s => headers[s.index]);
}

function showResultsView(data) {
    frLoginView.style.display = 'none';
    frResults.style.display = 'block';
    frError.style.display = 'none';

    const { headers, rows, summary: backendSummary } = data;
    if (!headers || !rows || rows.length === 0) {
        frError.textContent = 'No results found for this semester.';
        frError.style.display = 'block';
        frResults.style.display = 'none';
        return;
    }

    const orderedHeaders = reorderHeaders(headers);
    const gradeHeader = headers.find(h => /^grade$/i.test(h.trim()));

    function isPass(grade) {
        const g = (grade || '').trim().toUpperCase();
        return g !== 'F' && g !== 'FE' && g !== '';
    }

    let html = '<div class="fr-grid-header">';
    orderedHeaders.forEach(h => {
        html += `<span>${h}</span>`;
    });
    html += '<span>Status</span>';
    html += '</div>';

    html += '<div class="fr-grid-body">';
    rows.forEach(row => {
        html += '<div class="fr-grid-row">';
        orderedHeaders.forEach(h => {
            let val = row[h] || '';
            if (h === gradeHeader && val) {
                val = `<span class="fr-grade">${val}</span>`;
            }
            html += `<span>${val}</span>`;
        });
        const gradeVal = gradeHeader ? (row[gradeHeader] || '') : '';
        html += `<span class="fr-status">${isPass(gradeVal) ? 'PASS' : 'FAIL'}</span>`;
        html += '</div>';
    });

    html += '</div>';

    frGrid.innerHTML = html;

    if (backendSummary && (backendSummary.sgpa || backendSummary.cgpa || backendSummary.credits)) {
        frSummary.style.display = 'flex';
        if (backendSummary.sgpa) frSgpa.textContent = parseFloat(backendSummary.sgpa).toFixed(2);
        if (backendSummary.cgpa) frCgpa.textContent = parseFloat(backendSummary.cgpa).toFixed(2);
        if (backendSummary.credits) frCredits.textContent = parseInt(backendSummary.credits, 10);
        if (backendSummary.totalCredits) frTotalCredits.textContent = parseInt(backendSummary.totalCredits, 10);
    } else {
        frSummary.style.display = 'none';
    }
}

function backToLogin() {
    frResults.style.display = 'none';
    frLoginView.style.display = '';
    frError.style.display = 'none';

    if (!frSaveBtn.classList.contains('saved')) {
        frUsername.value = '';
        frPassword.value = '';
    }
}

frBackBtn?.addEventListener('click', backToLogin);
frPrintBtn?.addEventListener('click', () => {
    const grid = frGrid.innerHTML;
    if (!grid.trim()) return;
    const summaryHtml = frSummary.style.display !== 'none' ? frSummary.outerHTML : '';
    const headerCells = document.querySelector('.fr-grid-header');
    const colCount = headerCells ? headerCells.children.length : 6;
    const colTemplate = colCount < 4
        ? Array(colCount).fill('1fr').join(' ')
        : '80px 1fr ' + Array(colCount - 2).fill('1fr').join(' ');
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Grade Card - KTU Archive</title><style>' +
        '@page{size:A4 portrait;margin:0.5in}' +
        '*{margin:0;padding:0;box-sizing:border-box}' +
        'body{font-family:\'Google Sans Code\',\'Courier New\',monospace;color:#000;font-size:10px;line-height:1.5}' +
        '.print-hdr{text-align:center;margin-bottom:6px}' +
        '.print-hdr h1{font-size:18px;font-weight:700;letter-spacing:0.3px}' +
        '.print-hdr .sub{font-size:9px;margin-top:1px}' +
        '.print-hdr hr{border:none;border-top:2px solid #000;margin:8px 0 14px}' +
        '.fr-stats{display:flex;justify-content:space-around;border:1.5px solid #000;padding:10px 6px;margin-bottom:14px}' +
        '.fr-stat{text-align:center;flex:1}' +
        '.fr-stat+.fr-stat{border-left:1px solid #000}' +
        '.fr-stat-value{font-size:16px;font-weight:700}' +
        '.fr-stat-label{font-size:7px;text-transform:uppercase;letter-spacing:0.1em;margin-top:1px}' +
        '.grid-wrap{border:1.5px solid #000}' +
        '.fr-grid{width:100%}' +
        '.fr-grid-header,.fr-grid-row{display:grid;grid-template-columns:' + colTemplate + ';gap:4px;align-items:center;padding:5px 10px}' +
        '.fr-grid-header{border-bottom:2px solid #000;font-size:8px;font-weight:600;text-transform:uppercase}' +
        '.fr-grid-row{border-bottom:1px solid #ccc;font-size:10px;padding:6px 10px}' +
        '.fr-grid-row:last-child{border-bottom:none}' +
        '.fr-grid-header span,.fr-grid-row span{text-align:center}' +
        '.fr-grid-header span:first-child,.fr-grid-header span:nth-child(2),' +
        '.fr-grid-row span:first-child,.fr-grid-row span:nth-child(2){text-align:left}' +
        '.fr-grade,.fr-status{font-weight:600}' +
        '.print-ftr{margin-top:10px;text-align:center;font-size:7px;border-top:1px solid #ccc;padding-top:6px}' +
        '</style></head><body>' +
        '<div class="print-hdr"><h1>KTU Grade Card</h1><div class="sub">APJ Abdul Kalam Technological University</div><hr></div>' +
        summaryHtml +
        '<div class="grid-wrap"><div class="fr-grid">' + grid + '</div></div>' +
        '<div class="print-ftr">Generated by KTU Archive &mdash; ' + new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) + '</div>' +
        '</body></html>');
    doc.close();
    setTimeout(function() {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(function() { iframe.remove(); }, 500);
    }, 200);
});

let fetchCooldown = false;
document.getElementById('fr-fetch-btn')?.addEventListener('click', async () => {
    if (fetchCooldown) return;
    const username = frUsername.value.trim();
    const password = frPassword.value.trim();
    const semesterId = frSemesterSelect.getAttribute('data-selected-value');

    if (!username || !password || !semesterId) {
        showError('Please fill in all fields.');
        return;
    }

    setLoading(true);
    frError.style.display = 'none';
    frResults.style.display = 'none';
    frLoading.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
        clearLog();
        addLogEntry('Requesting token...');
        const tokenRes = await fetch('/api/fetch_results');
        const tokenData = await tokenRes.json();
        if (!tokenData.success) {
            showError(tokenData.error || 'Failed to get request token.');
            return;
        }
        addLogEntry('Token acquired. Connecting to KTU portal...');

        const response = await fetch('/api/fetch_results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, semesterId, token: tokenData.token })
        });

        const result = await response.json();

        if (result.logs && result.logs.length > 0) {
            clearLog();
            result.logs.forEach((msg, i) => {
                setTimeout(() => addLogEntry(msg), i * 150);
            });
            await new Promise(resolve => setTimeout(resolve, result.logs.length * 150 + 300));
        }

        if (result.success) {
            showResultsView(result.data);
        } else {
            showError(result.error || 'Failed to fetch results.');
        }
    } catch (err) {
        showError('Network error — please try again.');
    } finally {
        setLoading(false);
        fetchCooldown = true;
        frFetchBtn.disabled = true;
        setTimeout(() => {
            fetchCooldown = false;
            if (!frLoading.style.display || frLoading.style.display === 'none') {
                frFetchBtn.disabled = false;
            }
        }, 3000);
    }
});

applySavedCredentials();
