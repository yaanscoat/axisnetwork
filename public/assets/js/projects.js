import { el, formatDate, languageBar, loadProjects } from './common.js';

const side = document.querySelector('[data-repos]');
const main = document.querySelector('[data-repo]');

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i;
const AUDIO = /\.(mp3|m4a|wav|ogg|flac|aac)$/i;
const VIDEO = /\.(mp4|webm|mov)$/i;
const BINARY = /\.(wasm|zip|gz|tar|7z|rar|woff2?|ttf|otf|eot|pdf|exe|dll|so|dylib|bin|jar|class|psd|lockb)$/i;
const MAX_TEXT = 400 * 1024;

let projects = [];

loadProjects()
  .then((data) => {
    projects = data.projects;
    renderSidebar();
    const params = new URLSearchParams(location.search);
    const wanted = params.get('repo');
    const project = projects.find((p) => `${p.owner}/${p.name}` === wanted) || projects[0];
    if (project) open(project, { file: params.get('file') });
    else main.replaceChildren(el('p', { class: 'empty' }, 'No projects to show yet.'));
  })
  .catch(() => {
    main.replaceChildren(el('p', { class: 'empty' }, 'Projects couldn’t be loaded right now.'));
  });

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search);
  const project = projects.find((p) => `${p.owner}/${p.name}` === params.get('repo'));
  if (project) open(project, { file: params.get('file'), push: false });
});

function renderSidebar() {
  const owners = [...new Set(projects.map((p) => p.owner))];
  side.replaceChildren(...owners.map((owner) =>
    el('div', {},
      el('h2', { class: 'label' }, owner),
      el('ul', { class: 'repo-links' },
        projects.filter((p) => p.owner === owner).map((p) =>
          el('li', {}, el('a', {
            href: `/projects?repo=${p.owner}/${p.name}`,
            'data-key': `${p.owner}/${p.name}`,
            'data-spot': true,
            onclick: (e) => {
              e.preventDefault();
              open(p);
              main.scrollIntoView({ block: 'start' });
            },
          }, p.name)))),
    )));
}

function setUrl(project, file, push) {
  const encode = (v) => encodeURIComponent(v).replace(/%2F/g, '/');
  let url = `/projects?repo=${encode(`${project.owner}/${project.name}`)}`;
  if (file) url += `&file=${encode(file)}`;
  if (url === location.pathname + location.search) return;
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}

function open(project, { file = null, push = true } = {}) {
  setUrl(project, file, push);
  document.title = `${project.name} · AxisNet.work`;
  side.querySelectorAll('a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.key === `${project.owner}/${project.name}`)));

  const fileCount = project.tree.filter((e) => e.length === 2).length;
  const head = el('header', { class: 'repo-head' },
    el('div', {},
      el('h1', {}, el('span', {}, `${project.owner} / `), project.name),
      project.description && el('p', {}, project.description)),
    el('div', { class: 'repo-actions' },
      project.homepage && el('a', { class: 'btn btn--solid', href: project.homepage, rel: 'noopener' }, 'Visit live site'),
      el('a', { class: 'btn', href: project.url, rel: 'noopener' }, 'GitHub')),
  );

  const meta = el('dl', { class: 'repo-meta' },
    metaItem('Updated', formatDate(project.pushedAt)),
    metaItem('Created', formatDate(project.createdAt)),
    metaItem('Files', String(fileCount)),
    project.license && metaItem('Licence', project.license),
  );

  const langs = el('section', { class: 'repo-langs', 'aria-label': 'Languages' },
    el('h2', { class: 'label', style: 'margin-bottom:12px' }, 'Languages'),
    Object.keys(project.languages).length ? languageBar(project.languages) : el('p', { class: 'muted' }, 'No language data.'));

  const panel = el('div', { class: 'tab-panel', role: 'tabpanel', id: 'repo-panel' });
  const tabButtons = ['README', 'Files'].map((name) =>
    el('button', {
      type: 'button',
      role: 'tab',
      'aria-controls': 'repo-panel',
      onclick: () => showTab(name),
    }, name));
  const tabs = el('div', { class: 'tabs', role: 'tablist' }, tabButtons);

  function showTab(name, path) {
    tabButtons.forEach((b) => b.setAttribute('aria-selected', String(b.textContent === name)));
    if (name === 'README') {
      setUrl(project, null, false);
      panel.replaceChildren(project.readme ? readme(project.readme.html) : el('p', { class: 'empty' }, 'This project doesn’t have a README.'));
    } else {
      panel.replaceChildren(files(project, path));
    }
  }

  main.replaceChildren(head, meta, langs, tabs, panel);
  showTab(file || !project.readme ? 'Files' : 'README', file);
}

function metaItem(label, value) {
  return el('div', {}, el('dt', {}, label), el('dd', {}, value));
}

// GitHub already sanitises rendered READMEs; this strips anything active as a second layer.
function readme(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, form, link, meta').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((node) => {
    for (const attr of [...node.attributes]) {
      const value = attr.value.trim().toLowerCase();
      if (attr.name.startsWith('on') || ((attr.name === 'href' || attr.name === 'src') && value.startsWith('javascript:'))) {
        node.removeAttribute(attr.name);
      }
    }
    if (node.tagName === 'A' && /^https?:/.test(node.getAttribute('href') || '')) node.setAttribute('rel', 'noopener');
    if (node.tagName === 'IMG') node.setAttribute('loading', 'lazy');
  });
  const body = doc.querySelector('.markdown-body') || doc.body;
  const wrapper = el('div', { class: 'markdown-body' });
  wrapper.append(...body.childNodes);
  return wrapper;
}

// ---------- Files ----------

function buildTree(entries) {
  const root = { dirs: new Map(), files: [] };
  for (const [path, size] of entries) {
    const parts = path.split('/');
    let node = root;
    if (size === undefined) {
      for (const part of parts) {
        if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: [] });
        node = node.dirs.get(part);
      }
    } else {
      for (const part of parts.slice(0, -1)) {
        if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: [] });
        node = node.dirs.get(part);
      }
      node.files.push({ name: parts.at(-1), path, size });
    }
  }
  return root;
}

function files(project, initialPath) {
  const tree = el('nav', { class: 'tree', 'aria-label': 'Files' });
  const barPath = el('span', {}, 'Select a file');
  const barLink = el('a', { href: project.url, rel: 'noopener' }, 'Open on GitHub');
  const body = el('div', { class: 'viewer-body' }, el('p', { class: 'empty' }, 'Pick a file to read it here.'));
  const viewer = el('div', { class: 'viewer' }, el('div', { class: 'viewer-bar' }, barPath, barLink), body);
  const buttons = new Map();
  let loadToken = 0;

  const openDirs = new Set();
  if (initialPath) {
    const parts = initialPath.split('/');
    for (let i = 1; i < parts.length; i++) openDirs.add(parts.slice(0, i).join('/'));
  }

  function renderDir(node, prefix, depth) {
    const list = el('ul', { role: depth ? 'group' : 'tree' });
    const dirs = [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, child] of dirs) {
      const path = prefix + name;
      const expanded = openDirs.has(path);
      const sub = renderDir(child, `${path}/`, depth + 1);
      sub.hidden = !expanded;
      const btn = el('button', {
        type: 'button',
        class: 'dir',
        style: `--depth:${depth}`,
        'aria-expanded': String(expanded),
        onclick: () => {
          const open = btn.getAttribute('aria-expanded') !== 'true';
          btn.setAttribute('aria-expanded', String(open));
          sub.hidden = !open;
        },
      }, name);
      list.append(el('li', {}, btn, sub));
    }
    const fileList = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
    for (const file of fileList) {
      const btn = el('button', {
        type: 'button',
        class: 'file',
        style: `--depth:${depth}`,
        onclick: () => show(file),
      }, file.name);
      buttons.set(file.path, btn);
      list.append(el('li', {}, btn));
    }
    return list;
  }

  async function show(file) {
    const token = ++loadToken;
    buttons.forEach((b, path) => b.setAttribute('aria-current', String(path === file.path)));
    setUrl(project, file.path, false);
    barPath.textContent = `${file.path} · ${formatSize(file.size)}`;
    barLink.href = `${project.url}/blob/${project.sha}/${encodePath(file.path)}`;
    const raw = `https://raw.githubusercontent.com/${project.owner}/${project.name}/${project.sha}/${encodePath(file.path)}`;

    if (IMAGE.test(file.path)) {
      return body.replaceChildren(el('div', { class: 'viewer-media' }, el('img', { src: raw, alt: file.name })));
    }
    if (AUDIO.test(file.path)) {
      return body.replaceChildren(el('div', { class: 'viewer-media' }, el('audio', { src: raw, controls: true, preload: 'none' })));
    }
    if (VIDEO.test(file.path)) {
      return body.replaceChildren(el('div', { class: 'viewer-media' }, el('video', { src: raw, controls: true, preload: 'metadata', style: 'max-width:100%' })));
    }
    if (BINARY.test(file.path)) {
      return body.replaceChildren(notice('This is a binary file, so there’s nothing to read here.', raw));
    }
    if (file.size > MAX_TEXT) {
      return body.replaceChildren(notice(`This file is ${formatSize(file.size)}, too large to show here.`, raw));
    }

    body.replaceChildren(el('p', { class: 'empty' }, 'Loading…'));
    try {
      const res = await fetch(raw);
      if (!res.ok) throw new Error(res.statusText);
      const text = await res.text();
      if (token !== loadToken) return;
      if (text.slice(0, 2000).includes('\0')) {
        return body.replaceChildren(notice('This is a binary file, so there’s nothing to read here.', raw));
      }
      body.replaceChildren(code(text));
      body.scrollTop = 0;
    } catch {
      if (token === loadToken) body.replaceChildren(notice('This file couldn’t be loaded.', raw));
    }
  }

  tree.append(renderDir(buildTree(project.tree), '', 0));
  if (project.truncated) tree.append(el('p', { class: 'empty', style: 'padding:12px' }, 'Some files are hidden because the repository is very large.'));

  const start = project.tree.find((e) => e[0] === initialPath && e.length === 2);
  if (start) {
    queueMicrotask(() => {
      show({ name: start[0].split('/').at(-1), path: start[0], size: start[1] });
      buttons.get(start[0])?.scrollIntoView({ block: 'nearest' });
    });
  }

  return el('div', { class: 'files' }, tree, viewer);
}

function code(text) {
  const lines = text.replace(/\n$/, '').split('\n');
  const gutter = lines.map((_, i) => i + 1).join('\n');
  const codeEl = el('code');
  codeEl.textContent = lines.join('\n');
  return el('pre', { class: 'code' }, el('span', { class: 'gutter', 'aria-hidden': 'true' }, gutter), codeEl);
}

function notice(message, raw) {
  return el('div', { class: 'viewer-media' },
    el('p', { class: 'muted' }, message),
    el('a', { class: 'btn', href: raw, rel: 'noopener' }, 'Download raw file'));
}

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
