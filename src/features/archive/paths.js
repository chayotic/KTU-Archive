export function selectionPath(semester, code, mode = 'pyq') {
  const root = mode === 'notes' ? '/notes' : '';
  if (!semester) return root || '/';

  const base = `${root}/semester/${encodeURIComponent(semester)}`;
  return code ? `${base}/${encodeURIComponent(code.toLowerCase())}` : base;
}

export function readSelection(pathname = window.location.pathname) {
  if (/^\/notes\/?$/.test(pathname)) {
    return { semester: '', subject: '', mode: 'notes' };
  }

  const match = pathname.match(/^\/(notes\/)?semester\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!match) return null;

  try {
    return {
      semester: decodeURIComponent(match[2]),
      subject: match[3] ? decodeURIComponent(match[3]).toUpperCase() : '',
      mode: match[1] ? 'notes' : 'pyq',
    };
  } catch {
    return null;
  }
}
