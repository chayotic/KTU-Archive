import { navigateTo } from '../navigation/views.js';

const STORAGE_KEY = 'ktu-results';
const RESULT_EVENT = 'resultstored';
const IGNORED_HEADERS = /^(s\.?\s*l\.?\s*no\.?|s\.?\s*no\.?|serial\s*no\.?|no\.?|#|index)$/i;
const FAIL_GRADES = new Set(['F', 'FE', 'FAIL', 'ABSENT']);

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

function findHeader(headers, patterns) {
  for (const pattern of patterns) {
    const match = headers.find((header) => pattern.test(String(header).trim()));
    if (match) return match;
  }
  return '';
}

function formatDecimal(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : String(value);
}

function formatInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? String(parsed) : String(value);
}

function isFailed(grade, status) {
  const gradeValue = String(grade ?? '').trim().toUpperCase();
  const statusValue = String(status ?? '').trim().toUpperCase();

  if (statusValue) {
    return (
      FAIL_GRADES.has(statusValue) ||
      statusValue.includes('FAIL') ||
      statusValue.includes('ABSENT') ||
      statusValue.includes('NOT PASS')
    );
  }

  return gradeValue ? FAIL_GRADES.has(gradeValue) : false;
}

function statusLabel(status, failed) {
  const value = String(status ?? '').trim();
  if (!value) return failed ? 'Failed' : 'Passed';

  const upper = value.toUpperCase();
  if (['P', 'PASS', 'PASSED'].includes(upper)) return 'Passed';
  if (['F', 'FE', 'FAIL', 'FAILED'].includes(upper)) return 'Failed';
  return value;
}

function buildStats(summary) {
  if (!summary) return [];

  return [
    { key: 'sgpa', label: 'SGPA', format: formatDecimal },
    { key: 'cgpa', label: 'CGPA', format: formatDecimal },
    { key: 'credits', label: 'Credits earned', format: formatInteger },
    { key: 'totalCredits', label: 'Total credits', format: formatInteger },
  ]
    .filter(({ key }) => {
      const value = summary[key];
      return value !== undefined && value !== null && String(value).trim() !== '';
    })
    .map(({ key, label, format }) => ({
      label,
      value: format(summary[key]),
    }));
}

function buildEmpty() {
  const empty = node('div', 'md3-result-view__empty');
  empty.append(node('p', 'md3-result-view__empty-title', 'No grade card loaded'));
  empty.append(
    node(
      'p',
      'md3-result-view__empty-text',
      'Fetch your results to see your grades here.',
    ),
  );

  const action = node('button', 'md3-result-view__empty-action', 'Fetch results');
  action.type = 'button';
  action.addEventListener('click', () => navigateTo('results'));
  empty.append(action);

  return empty;
}

function rowState(row, keys) {
  const grade = String(row[keys.grade] ?? '').trim();
  const status = String(row[keys.status] ?? '').trim();

  return {
    grade,
    credits: String(row[keys.credits] ?? '').trim(),
    status,
    failed: isFailed(grade, status),
  };
}

function buildCourseCell(row, keys) {
  const cell = node('th', 'md3-result-table__course');
  cell.setAttribute('scope', 'row');

  const code = String(row[keys.code] ?? '').trim();
  const name = String(row[keys.name] ?? '').trim();

  if (code) cell.append(node('span', 'md3-result-table__code', code));
  if (name) cell.append(node('span', 'md3-result-table__name', name));
  return cell;
}

function buildGradeCell(state) {
  const cell = node('td', 'md3-result-table__center');

  if (!state.grade) return cell;

  cell.append(
    node(
      'span',
      `md3-result-table__grade${state.failed ? ' is-fail' : ''}`,
      state.grade,
    ),
  );

  return cell;
}

function buildCreditsCell(state) {
  const cell = node('td', 'md3-result-table__center md3-result-table__credits');
  cell.textContent = state.credits || '';
  return cell;
}

function buildStatusCell(state) {
  const cell = node('td', 'md3-result-table__center');

  if (!state.grade && !state.status) return cell;

  cell.append(
    node(
      'span',
      `md3-result-table__status${state.failed ? ' is-fail' : ' is-pass'}`,
      statusLabel(state.status, state.failed),
    ),
  );

  return cell;
}

function buildTable(rows, keys, extraKeys) {
  const columns = [];

  if (keys.code || keys.name) {
    columns.push({ id: 'course', label: 'Course', align: 'start', width: '12.5rem' });
  }
  if (keys.grade) {
    columns.push({ id: 'grade', label: 'Grade', align: 'center', width: '3.75rem' });
  }
  if (keys.credits) {
    columns.push({ id: 'credits', label: 'Credits', align: 'center', width: '4.25rem' });
  }
  if (keys.grade || keys.status) {
    columns.push({ id: 'status', label: 'Status', align: 'center', width: '5rem' });
  }

  extraKeys.forEach((header) => {
    columns.push({
      id: `extra:${header}`,
      label: header,
      align: 'center',
      header,
      width: '6.5rem',
    });
  });

  if (!columns.length) {
    columns.push({ id: 'course', label: 'Course', align: 'start', width: '12.5rem' });
  }

  const block = node('div', 'md3-result-table__block');
  const scroll = node('div', 'md3-result-table__scroll');
  const table = node('table', 'md3-result-table');
  const caption = node('caption', 'md3-visually-hidden', 'Course grades');
  table.append(caption);

  const colgroup = node('colgroup');
  columns.forEach((column) => {
    const col = document.createElement('col');
    if (column.width) col.style.inlineSize = column.width;
    colgroup.append(col);
  });
  table.append(colgroup);

  const totalWidth = columns.reduce((sum, column) => {
    const width = Number.parseFloat(column.width);
    return sum + (Number.isFinite(width) ? width : 8);
  }, 0);
  table.style.minInlineSize = `${totalWidth}rem`;

  const thead = node('thead');
  const headRow = node('tr');

  columns.forEach((column) => {
    const classes = [];
    if (column.align === 'center') classes.push('md3-result-table__center');
    if (column.id.startsWith('extra:')) classes.push('md3-result-table__extra-head');
    const cell = node('th', classes.join(' '));
    cell.setAttribute('scope', 'col');
    cell.textContent = column.label;
    headRow.append(cell);
  });

  thead.append(headRow);
  table.append(thead);

  const tbody = node('tbody');

  rows.forEach((row) => {
    const tr = node('tr');
    const state = rowState(row, keys);

    columns.forEach((column) => {
      if (column.id === 'course') {
        tr.append(buildCourseCell(row, keys));
        return;
      }
      if (column.id === 'grade') {
        tr.append(buildGradeCell(state));
        return;
      }
      if (column.id === 'credits') {
        tr.append(buildCreditsCell(state));
        return;
      }
      if (column.id === 'status') {
        tr.append(buildStatusCell(state));
        return;
      }

      const cell = node('td', 'md3-result-table__center md3-result-table__extra');
      const value = String(row[column.header] ?? '').trim();
      cell.textContent = value || '';
      tr.append(cell);
    });

    tbody.append(tr);
  });

  table.append(tbody);
  scroll.append(table);
  block.append(scroll);

  return block;
}

function renderResult(root, payload) {
  const canvas = root.querySelector('[data-result-view-canvas]');
  const printButton = root.querySelector('[data-result-view-print]');
  if (!canvas) return;

  const data = payload?.data;
  const headers = Array.isArray(data?.headers) ? data.headers : [];
  const rows = Array.isArray(data?.rows) ? data.rows : [];

  canvas.replaceChildren();

  if (!headers.length || !rows.length) {
    if (printButton) printButton.hidden = true;
    canvas.append(buildEmpty());
    return;
  }

  if (printButton) printButton.hidden = false;

  const semester = payload?.semester ? `Semester ${payload.semester}` : 'KTU Archive';
  const hero = node('section', 'md3-result-view__hero');
  hero.append(node('p', 'md3-result-view__eyebrow', semester));
  hero.append(node('h2', 'md3-result-view__title', 'Grade Card'));
  canvas.append(hero);

  const stats = buildStats(data.summary);
  if (stats.length) {
    const summary = node('div', 'md3-result-view__stats');
    summary.setAttribute('role', 'list');
    summary.setAttribute('aria-label', 'Grade summary');

    stats.forEach(({ label, value }) => {
      const stat = node('div', 'md3-result-view__stat');
      stat.setAttribute('role', 'listitem');
      stat.append(node('span', 'md3-result-view__stat-value', value));
      stat.append(node('span', 'md3-result-view__stat-label', label));
      summary.append(stat);
    });

    canvas.append(summary);
  }

  const keys = {
    code: findHeader(headers, [/course\s*code/i, /subject\s*code/i, /^code$/i]),
    name: findHeader(headers, [
      /course\s*name/i,
      /subject\s*name/i,
      /^subject$/i,
      /^course$/i,
    ]),
    grade: findHeader(headers, [/^grade$/i, /grade/i]),
    credits: findHeader(headers, [/credit/i]),
    status: findHeader(headers, [/^status$/i, /^result$/i, /result/i]),
  };

  const used = new Set(Object.values(keys).filter(Boolean));
  const extraKeys = headers.filter(
    (header) => header && !used.has(header) && !IGNORED_HEADERS.test(String(header).trim()),
  );

  const section = node('section', 'md3-page__section');
  const sectionHeader = node('div', 'md3-page__section-header');
  sectionHeader.append(node('h3', 'md3-page__section-title', 'Courses'));
  section.append(sectionHeader);
  section.append(buildTable(rows, keys, extraKeys));
  canvas.append(section);
}

export function storeResult(payload) {
  const stored = { ...payload, storedAt: Date.now() };

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {}

  document.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: stored }));
}

function readStoredResult() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function mountResultView() {
  const root = document.querySelector('[data-result-view]');
  if (!root) return;

  const printButton = root.querySelector('[data-result-view-print]');
  printButton?.addEventListener('click', () => window.print());

  document.addEventListener(RESULT_EVENT, (event) => {
    renderResult(root, event.detail);
  });

  renderResult(root, readStoredResult());
}
