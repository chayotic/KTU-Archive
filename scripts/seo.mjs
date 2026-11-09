import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = 'https://ktu-archive.vercel.app';
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || 'https://jotiuetuvhikqvqinfxa.supabase.co';
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_KEY || 'sb_publishable_2EFUAz5EIdnRohDdi3NLlQ_2qmAA_x5';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const templatePath = path.join(dist, 'index.html');
const template = await readFile(templatePath, 'utf8');

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function titleCase(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
}

const routes = [
  {
    path: '/',
    title: 'KTU PYQ Download, Notes & Results | KTU Archive',
    description:
      'Download KTU PYQs, previous year question papers and B.Tech notes for the 2024 scheme. Semester wise KTU question papers PDF, class notes and KTU results. Free, no ads.',
    priority: '1.0',
    changefreq: 'weekly',
  },
  {
    path: '/result',
    title: 'KTU Results Download | KTU Archive',
    description:
      'Fetch your KTU semester results and grade card online. Enter your KTU registration number and password to get SGPA, CGPA and subject wise grades.',
    priority: '0.8',
    changefreq: 'monthly',
  },
  {
    path: '/notifications',
    title: 'KTU Notifications | KTU Archive',
    description:
      'Latest KTU announcements and notifications for APJ Abdul Kalam Technological University students, in one place.',
    priority: '0.6',
    changefreq: 'daily',
  },
  {
    path: '/upload',
    title: 'Upload KTU PYQ and Notes | KTU Archive',
    description:
      'Contribute KTU previous year question papers and B.Tech notes for other students. Upload PDF files for KTU Archive.',
    priority: '0.5',
    changefreq: 'monthly',
  },
  {
    path: '/donate',
    title: 'Donate | KTU Archive',
    description:
      'Support KTU Archive. Donations fund the site domain and support the developers who build and maintain free KTU PYQs, notes and results.',
    priority: '0.4',
    changefreq: 'monthly',
  },
  {
    path: '/notes',
    title: 'KTU Notes Download | KTU Archive',
    description:
      'Download KTU B.Tech class notes module wise for the 2024 scheme. Semester wise KTU notes PDF, free on KTU Archive.',
    priority: '0.9',
    changefreq: 'weekly',
  },
];

let catalog = null;
let notesRows = [];

try {
  catalog = await fetchJson(
    `${SUPABASE_URL}/storage/v1/object/public/papers/subject-codes.json`,
  );
} catch (error) {
  console.warn(`SEO prerender: catalog fetch failed (${error.message}); semester pages only`);
}

try {
  const rows = await fetchJson(
    `${SUPABASE_URL}/rest/v1/notes?select=subject_code,subject_name,semester`,
    { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  );
  notesRows = Array.isArray(rows) ? rows : [];
} catch (error) {
  console.warn(`SEO prerender: notes fetch failed (${error.message}); notes pages skipped`);
}

const semesters = new Set(['1', '2', '3', '4', '5']);
const semesterSubjects = new Map();

if (catalog && typeof catalog === 'object') {
  for (const [semester, branches] of Object.entries(catalog)) {
    semesters.add(semester);
    const seen = new Map();
    for (const subjects of Object.values(branches || {})) {
      for (const subject of subjects || []) {
        const code = String(subject.code || '').trim().toUpperCase();
        if (!code || seen.has(code)) continue;
        seen.set(code, { code, name: titleCase(subject.name || code) });
      }
    }
    semesterSubjects.set(semester, [...seen.values()]);
  }
}

for (const semester of [...semesters].sort()) {
  routes.push({
    path: `/semester/${semester}`,
    title: `KTU Semester ${semester} PYQ Download | KTU Archive`,
    description: `Download KTU semester ${semester} previous year question papers (PYQ) for the 2024 scheme. Subject wise KTU question papers PDF, free on KTU Archive.`,
    priority: '0.9',
    changefreq: 'weekly',
    kind: 'semester',
    semester,
    subjects: semesterSubjects.get(semester) || [],
  });

  for (const subject of semesterSubjects.get(semester) || []) {
    routes.push({
      path: `/semester/${semester}/${subject.code}`,
      title: `${subject.code} ${subject.name} KTU PYQ Download | KTU Archive`,
      description: `Download ${subject.name} (${subject.code}) KTU previous year question papers for semester ${semester}. ${subject.code} PYQ PDF, 2024 scheme, free on KTU Archive.`,
      priority: '0.8',
      changefreq: 'monthly',
      kind: 'subject',
      semester,
      subject,
    });
  }
}

const notesSemesters = new Set();
const notesSubjects = new Map();

for (const row of notesRows) {
  const match = String(row.semester || '').match(/(\d+)/);
  const code = String(row.subject_code || '').trim().toUpperCase();
  if (!match || !code) continue;
  const semester = match[1];
  notesSemesters.add(semester);
  if (!notesSubjects.has(semester)) notesSubjects.set(semester, new Map());
  const byCode = notesSubjects.get(semester);
  if (!byCode.has(code)) byCode.set(code, { code, name: titleCase(row.subject_name || code) });
}

for (const semester of [...notesSemesters].sort()) {
  routes.push({
    path: `/notes/semester/${semester}`,
    title: `KTU Semester ${semester} Notes Download | KTU Archive`,
    description: `Download KTU semester ${semester} B.Tech class notes module wise for the 2024 scheme. Semester wise KTU notes PDF, free on KTU Archive.`,
    priority: '0.8',
    changefreq: 'weekly',
    kind: 'notes-semester',
    semester,
    subjects: [...(notesSubjects.get(semester)?.values() || [])],
  });

  for (const subject of notesSubjects.get(semester)?.values() || []) {
    routes.push({
      path: `/notes/semester/${semester}/${subject.code}`,
      title: `${subject.code} ${subject.name} KTU Notes Download | KTU Archive`,
      description: `Download ${subject.name} (${subject.code}) KTU class notes for semester ${semester}, module wise. ${subject.code} notes PDF, free on KTU Archive.`,
      priority: '0.7',
      changefreq: 'monthly',
      kind: 'notes-subject',
      semester,
      subject,
    });
  }
}

function jsonLd(route) {
  const url = `${ORIGIN}${route.path === '/' ? '/' : route.path}`;
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${ORIGIN}/#organization`,
      name: 'KTU Archive',
      url: `${ORIGIN}/`,
      logo: `${ORIGIN}/favicon.png`,
      sameAs: ['https://github.com/chayotic/KTU-Archive'],
    },
    {
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      url: `${ORIGIN}/`,
      name: 'KTU Archive',
      publisher: { '@id': `${ORIGIN}/#organization` },
      inLanguage: 'en-IN',
    },
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: route.title,
      description: route.description,
      isPartOf: { '@id': `${ORIGIN}/#website` },
      inLanguage: 'en-IN',
    },
  ];

  const isSemester = route.kind === 'semester' || route.kind === 'notes-semester';
  const isSubject = route.kind === 'subject' || route.kind === 'notes-subject';

  if (isSemester && route.subjects?.length) {
    const base = route.kind === 'semester' ? '/semester' : '/notes/semester';
    graph.push({
      '@type': 'ItemList',
      name: route.title,
      itemListElement: route.subjects.map((subject, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: `${subject.code} ${subject.name}`,
        url: `${ORIGIN}${base}/${route.semester}/${subject.code}`,
      })),
    });
  }

  if (isSubject) {
    const semesterPath =
      route.kind === 'subject' ? `/semester/${route.semester}` : `/notes/semester/${route.semester}`;
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        {
          '@type': 'ListItem',
          position: 2,
          name: `KTU Semester ${route.semester} ${route.kind === 'subject' ? 'PYQ' : 'Notes'}`,
          item: `${ORIGIN}${semesterPath}`,
        },
        { '@type': 'ListItem', position: 3, name: route.subject.name, item: url },
      ],
    });
  }

  return `<script type="application/ld+json" id="seo-jsonld">\n${JSON.stringify(
    { '@context': 'https://schema.org', '@graph': graph },
    null,
    2,
  )}\n    </script>`;
}

function seoSection(route) {
  const isSemester = route.kind === 'semester' || route.kind === 'notes-semester';
  const isSubject = route.kind === 'subject' || route.kind === 'notes-subject';
  if (!isSemester && !isSubject) return '';

  if (isSemester) {
    const notes = route.kind === 'notes-semester';
    const base = notes ? '/notes/semester' : '/semester';
    const word = notes ? 'notes' : 'PYQ';
    const items = route.subjects
      .map(
        (subject) =>
          `              <li><a href="${base}/${route.semester}/${subject.code}">${esc(subject.code)} ${esc(subject.name)}</a></li>`,
      )
      .join('\n');
    return `          <section class="md3-browse md3-seo" aria-labelledby="seo-title">
            <h2 class="md3-browse__title" id="seo-title">KTU Semester ${route.semester} ${word} by subject</h2>
            <p class="md3-browse__body">
              Download KTU semester ${route.semester} previous year question papers and class notes
              subject by subject for the 2024 scheme. Pick a subject below to open its ${word} PDF
              list on KTU Archive.
            </p>
            <ul class="md3-browse__list">
${items}
            </ul>
          </section>
`;
  }

  const notes = route.kind === 'notes-subject';
  const semesterPath = notes ? `/notes/semester/${route.semester}` : `/semester/${route.semester}`;
  const word = notes ? 'notes' : 'previous year question papers';
  return `          <section class="md3-browse md3-seo" aria-labelledby="seo-title">
            <h2 class="md3-browse__title" id="seo-title">${esc(route.subject.code)} ${esc(route.subject.name)} KTU ${notes ? 'notes' : 'PYQ'} download</h2>
            <p class="md3-browse__body">
              Download ${esc(route.subject.name)} (${esc(route.subject.code)}) KTU ${word} for
              semester ${route.semester} of the 2024 scheme. Every ${esc(route.subject.code)} paper
              and note on KTU Archive is free, with no ads.
            </p>
            <ul class="md3-browse__list">
              <li><a href="${semesterPath}">All KTU Semester ${route.semester} ${notes ? 'notes' : 'PYQ'}</a></li>
              <li><a href="/">KTU PYQ download home</a></li>
            </ul>
          </section>
`;
}

function render(route) {
  const url = `${ORIGIN}${route.path}`;
  let html = template;

  html = html.replace(/<title>.*?<\/title>/s, `<title>${esc(route.title)}</title>`);
  html = html.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${esc(route.description)}" />`,
  );
  html = html.replace(
    /<link rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${url}" />`,
  );
  html = html.replace(
    /<meta property="og:url"[^>]*>/,
    `<meta property="og:url" content="${url}" />`,
  );
  html = html.replace(
    /<meta property="og:title"[^>]*>/,
    `<meta property="og:title" content="${esc(route.title)}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:description"[\s\S]*?\/>/,
    `<meta property="og:description" content="${esc(route.description)}" />`,
  );
  html = html.replace(
    /<meta property="twitter:url"[^>]*>/,
    `<meta property="twitter:url" content="${url}" />`,
  );
  html = html.replace(
    /<meta property="twitter:title"[^>]*>/,
    `<meta property="twitter:title" content="${esc(route.title)}" />`,
  );
  html = html.replace(
    /<meta\s+property="twitter:description"[\s\S]*?\/>/,
    `<meta property="twitter:description" content="${esc(route.description)}" />`,
  );
  html = html.replace(
    /<script type="application\/ld\+json" id="seo-jsonld">[\s\S]*?<\/script>/,
    jsonLd(route),
  );

  const section = seoSection(route);
  if (section) {
    html = html.replace(
      '</ul>\n          </div>\n        </div>\n        <div class="md3-page" data-papers>',
      `</ul>\n          </div>\n${section}        </div>\n        <div class="md3-page" data-papers>`,
    );
  }

  return html;
}

const lastmod = new Date().toISOString().slice(0, 10);
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...routes.map(
    (route) =>
      `  <url><loc>${ORIGIN}${route.path}</loc><lastmod>${lastmod}</lastmod><changefreq>${route.changefreq}</changefreq><priority>${route.priority}</priority></url>`,
  ),
  '</urlset>',
  '',
].join('\n');

await writeFile(path.join(dist, 'sitemap.xml'), sitemap, 'utf8');
await writeFile(
  path.join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
  'utf8',
);

for (const route of routes) {
  if (route.path === '/') {
    await writeFile(templatePath, render(route), 'utf8');
    continue;
  }
  const file = path.join(dist, route.path, 'index.html');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, render(route), 'utf8');
}

console.log(`SEO prerender: wrote ${routes.length} routes, sitemap.xml and robots.txt`);
