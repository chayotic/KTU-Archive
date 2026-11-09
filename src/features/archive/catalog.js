const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'into',
  'nor',
  'of',
  'on',
  'onto',
  'or',
  'per',
  'the',
  'to',
  'via',
  'vs',
  'with',
]);

const ACRONYMS = new Map([
  ['AI', 'AI'],
  ['CPS', 'CPS'],
  ['DC', 'DC'],
  ['GIS', 'GIS'],
  ['II', 'II'],
  ['III', 'III'],
  ['IOT', 'IoT'],
  ['IPR', 'IPR'],
  ['IV', 'IV'],
  ['ML', 'ML'],
  ['PLC', 'PLC'],
  ['UML', 'UML'],
  ['VI', 'VI'],
  ['VII', 'VII'],
  ['VIII', 'VIII'],
  ['VLSI', 'VLSI'],
]);

function formatWord(word) {
  const letters = word.replace(/[^a-z]/gi, '');
  if (!letters) return word;

  const acronym = ACRONYMS.get(letters.toUpperCase());
  if (acronym) return word.replace(new RegExp(letters, 'i'), acronym);

  const mixed = /[a-z]/.test(letters) && /[A-Z]/.test(letters.slice(1));
  if (mixed) return word;

  return word
    .toLowerCase()
    .replace(/(^|[-/(])[a-z]/g, (match, prefix) => prefix + match.slice(-1).toUpperCase());
}

function titleCase(text) {
  return text
    .split(/(\s+)/)
    .map((word, index) => {
      if (!word.trim()) return word;
      if (index > 0 && SMALL_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, ''))) {
        return word.toLowerCase();
      }
      return formatWord(word);
    })
    .join('');
}

function toSubject(subject) {
  return {
    value: subject.code.trim().toUpperCase(),
    label: titleCase(subject.name.trim()),
  };
}

function byLabel(a, b) {
  return a.label.localeCompare(b.label);
}

function unique(subjects) {
  const seen = new Set();
  return subjects.filter((subject) => {
    if (seen.has(subject.value)) return false;
    seen.add(subject.value);
    return true;
  });
}

export function buildCatalog(catalog) {
  return Object.entries(catalog)
    .map(([semester, branches]) => {
      const entries = Object.entries(branches);
      const shared = entries.length === 1;
      const built = entries.map(([name, subjects]) => ({
        value: name,
        label: shared ? 'All branches' : titleCase(name),
        subjects: unique(subjects.map(toSubject)).sort(byLabel),
      }));

      return {
        value: semester,
        label: `Semester ${semester}`,
        branches: built.sort(byLabel),
        subjects: unique(built.flatMap((branch) => branch.subjects)).sort(byLabel),
      };
    })
    .sort((a, b) => Number(a.value) - Number(b.value));
}

function notesSemester(value) {
  const match = String(value ?? '').match(/(\d+)/);
  return match ? match[1] : '';
}

export function buildNotesCatalog(rows) {
  const bySemester = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const code = row?.subject_code?.trim().toUpperCase();
    const name = row?.subject_name?.trim();
    const semester = notesSemester(row?.semester);
    if (!code || !name || !semester) return;

    if (!bySemester.has(semester)) bySemester.set(semester, new Map());
    const subjects = bySemester.get(semester);
    if (!subjects.has(code)) {
      subjects.set(code, { value: code, label: titleCase(name) });
    }
  });

  return [...bySemester.entries()]
    .map(([semester, subjects]) => {
      const list = [...subjects.values()].sort(byLabel);
      return {
        value: semester,
        label: `Semester ${semester}`,
        branches: [{ value: `semester-${semester}`, label: 'All notes', subjects: list }],
        subjects: list,
      };
    })
    .sort((a, b) => Number(a.value) - Number(b.value));
}
