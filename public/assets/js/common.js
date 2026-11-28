// Shared by every page: page motion, mobile nav toggle, plus helpers for project data.

export { reveal } from './fx.js';

const toggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      toggle.setAttribute('aria-expanded', 'false');
      nav.classList.remove('is-open');
    }
  });
}

// Colours GitHub uses for each language, so the bars read the same as there.
const LANG_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  HTML: '#e34c26',
  CSS: '#663399',
  SCSS: '#c6538c',
  Shell: '#89e051',
  Python: '#3572a5',
  Go: '#00add8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Lua: '#000080',
  PHP: '#4f5d95',
  Dockerfile: '#384d54',
  Svelte: '#ff3e00',
  Vue: '#41b883',
  Astro: '#ff5a03',
};

export const langColor = (name) => LANG_COLORS[name] || '#8b8b86';

export function languageShares(languages) {
  const total = Object.values(languages).reduce((a, b) => a + b, 0);
  return Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .map(([name, bytes]) => ({ name, bytes, pct: total ? (bytes / total) * 100 : 0 }));
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

export function languageBar(languages) {
  const shares = languageShares(languages);
  const bar = el('div', { class: 'lang-bar', role: 'img', 'aria-label': shares.map((s) => `${s.name} ${s.pct.toFixed(1)}%`).join(', ') },
    shares.map((s) => el('span', { style: `width:${s.pct}%;background:${langColor(s.name)}` })));
  const legend = el('ul', { class: 'lang-legend' },
    shares.map((s) => el('li', {}, el('i', { style: `background:${langColor(s.name)}` }), s.name, ' ', el('b', {}, `${s.pct.toFixed(1)}%`))));
  return [bar, legend];
}

const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
export const formatDate = (iso) => dateFmt.format(new Date(iso));

let dataPromise;
export function loadProjects() {
  dataPromise ??= fetch('/data/projects.json').then((r) => {
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  });
  return dataPromise;
}
