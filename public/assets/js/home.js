import { el, formatDate, languageBar, loadProjects } from './common.js';
import { mountGlobe } from './globe.js';
import { mountSuloon } from './suloon.js';

mountGlobe(document.querySelector('.globe'), {
  marker: { lat: -33.87, lon: 151.21, label: 'Sydney, NSW · 3 servers' },
});

mountSuloon(document.querySelector('.suloon'));

const list = document.querySelector('[data-project-list]');
loadProjects()
  .then(({ projects }) => {
    list.replaceChildren(...projects.map((p) =>
      el('li', {},
        el('a', { href: `/projects?repo=${p.owner}/${p.name}` },
          el('div', {}, el('span', { class: 'project-name' }, p.name), el('span', { class: 'project-owner' }, p.owner)),
          el('p', { class: 'project-desc' }, p.description || 'No description.'),
          el('div', { class: 'project-langs' }, languageBar(p.languages)),
          el('time', { class: 'project-date', datetime: p.pushedAt }, formatDate(p.pushedAt)),
        ),
      )));
  })
  .catch(() => {
    list.replaceChildren(el('li', { class: 'empty' }, 'Projects couldn’t be loaded right now.'));
  });
