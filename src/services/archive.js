import { publicObjectUrl, selectRows } from './supabase.js';

const PAPER_FIELDS = 'subject_code,subject_name,semester,title,url';
const NOTE_FIELDS = 'subject_code,subject_name,semester,module_number,title,url';

export async function fetchCatalog() {
  const response = await fetch(
    `${publicObjectUrl('papers', 'subject-codes.json')}?t=${Date.now()}`,
  );

  if (!response.ok) {
    throw new Error(`Catalog request failed with ${response.status}`);
  }

  return response.json();
}

export async function fetchMaintenance() {
  try {
    const response = await fetch(
      `${publicObjectUrl('papers', 'app_status.json')}?t=${Date.now()}`,
    );

    if (!response.ok) return false;

    const status = await response.json();
    return Boolean(status?.maintenance);
  } catch {
    return false;
  }
}

export function fetchPapers(subjectCode, semester) {
  return selectRows('papers', {
    subject_code: `eq.${subjectCode}`,
    semester: `eq.${semester}`,
    select: PAPER_FIELDS,
  });
}

export function fetchNotesSubjects() {
  return selectRows('notes', {
    select: 'subject_code,subject_name,semester',
  });
}

export function fetchNotes(subjectCode, semester) {
  return selectRows('notes', {
    subject_code: `eq.${subjectCode}`,
    semester: `eq.Semester ${semester}`,
    select: NOTE_FIELDS,
    order: 'module_number.asc',
  });
}
