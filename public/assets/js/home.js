import { el, languageShares, languageBar, loadProjects, reveal } from './common.js';
import { mountGlobe } from './globe.js';
import { mountSuloon } from './suloon.js';

// ---------- Globe + crosshair ----------

const hero = document.querySelector('.hero');
const globe = hero.querySelector('.globe');

mountGlobe(globe, {
  marker: { lat: -33.87, lon: 151.21, label: 'Sydney, NSW · 3 servers' },
  // Keep the hero's crosshair pinned to the marker as the globe turns.
  onMarker(x, y, visible) {
    const g = globe.getBoundingClientRect();
    const h = hero.getBoundingClientRect();
    hero.style.setProperty('--cx', `${(g.left - h.left + x).toFixed(1)}px`);
    hero.style.setProperty('--cy', `${(g.top - h.top + y).toFixed(1)}px`);
    hero.classList.toggle('has-cross', visible);
  },
});

mountSuloon(document.querySelector('.suloon'));

// ---------- Projects ----------

const list = document.querySelector('[data-project-list]');
loadProjects()
  .then(({ projects }) => {
    if (!projects.length) {
      list.replaceChildren(el('li', { class: 'empty' }, 'Nothing public yet.'));
      return;
    }
    list.replaceChildren(...projects.map((p) => {
      const langs = languageShares(p.languages).slice(0, 3).map((l) => l.name).join(' · ');
      return el('li', {},
        el('a', { href: `/projects?repo=${p.owner}/${p.name}`, 'data-spot': true },
          el('span', { class: 'ix-name' }, p.name),
          el('span', { class: 'ix-meta' },
            el('span', {}, p.description || 'No description.'),
            Object.keys(p.languages).length ? languageBar(p.languages)[0] : null,
            langs && el('span', { class: 'ix-langs' }, langs)),
          el('span', { class: 'ix-go' }, 'Browse code'),
        ),
      );
    }));
    reveal(list.parentElement);
  })
  .catch(() => {
    list.replaceChildren(el('li', { class: 'empty' }, 'Projects couldn’t be loaded right now.'));
  });

// ---------- Members: avatar follows the cursor ----------

const people = document.querySelector('.people');
const float = document.querySelector('.people-float');
if (window.matchMedia('(pointer: fine)').matches) {
  people.addEventListener('pointermove', (e) => {
    const row = e.target.closest('li[data-avatar]');
    if (!row) return;
    if (float.dataset.src !== row.dataset.avatar) {
      float.src = row.dataset.avatar;
      float.dataset.src = row.dataset.avatar;
    }
    float.style.transform = `translate(${e.clientX + 28}px, ${e.clientY - 84}px) rotate(-3deg)`;
    float.classList.add('is-on');
  });
  people.addEventListener('pointerleave', () => float.classList.remove('is-on'));
}
