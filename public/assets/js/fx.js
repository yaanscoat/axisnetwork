// Page-wide motion: a spotlight that follows the pointer, smaller spotlights
// inside [data-spot] elements, reveal-on-scroll for [data-reveal], a scroll
// progress line in the header, the section rail, words that light up as you
// read ([data-words]) and a timeline that fills as you scroll ([data-timeline]).
// Reduced motion skips the movement and shows everything.

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------- Spotlight ----------

const light = document.createElement('div');
light.className = 'spotlight';
light.setAttribute('aria-hidden', 'true');
document.body.prepend(light);

let pending = null;
let spotTarget = null;

function applyPointer() {
  const { x, y, target } = pending;
  pending = null;
  root.style.setProperty('--mx', `${x}px`);
  root.style.setProperty('--my', `${y}px`);

  const spot = target instanceof Element ? target.closest('[data-spot]') : null;
  if (spotTarget && spotTarget !== spot) spotTarget.classList.remove('is-spot');
  spotTarget = spot;
  if (spot) {
    const rect = spot.getBoundingClientRect();
    spot.style.setProperty('--x', `${x - rect.left}px`);
    spot.style.setProperty('--y', `${y - rect.top}px`);
    spot.classList.add('is-spot');
  }
}

if (finePointer && !reduceMotion) {
  root.classList.add('has-spotlight');
  window.addEventListener('pointermove', (e) => {
    if (!pending) requestAnimationFrame(applyPointer);
    pending = { x: e.clientX, y: e.clientY, target: e.target };
  }, { passive: true });
  document.addEventListener('pointerleave', () => {
    root.classList.add('spot-away');
    spotTarget?.classList.remove('is-spot');
    spotTarget = null;
  });
  document.addEventListener('pointerenter', () => root.classList.remove('spot-away'));
}

// ---------- Reveal on scroll ----------

const revealer = reduceMotion ? null : new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add('is-in');
    revealer.unobserve(entry.target);
  }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

// Children of a [data-reveal-group] come in one after another.
export function reveal(scope = document) {
  scope.querySelectorAll('[data-reveal-group]').forEach((group) => {
    [...group.children].forEach((child, i) => {
      if (child.hasAttribute('data-reveal')) return;
      child.setAttribute('data-reveal', '');
      child.style.setProperty('--i', Math.min(i, 8));
    });
  });
  scope.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => {
    if (revealer) revealer.observe(el);
    else el.classList.add('is-in');
  });
}

reveal();

// ---------- Words that light up as you read ----------

const wordBlocks = [...document.querySelectorAll('[data-words]')].map((el) => {
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  const spans = words.map((word, i) => {
    const span = document.createElement('span');
    span.className = 'w';
    span.textContent = word;
    el.append(span, i < words.length - 1 ? ' ' : '');
    return span;
  });
  return { el, spans, lit: -1 };
});

// 0 when the element's top reaches `start` of the viewport, 1 when its bottom reaches `end`.
function progressThrough(el, start, end) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  return clamp01((vh * start - r.top) / (r.height + vh * (start - end)));
}

// ---------- Scroll-driven pieces ----------

const header = document.querySelector('.site-header');
const bar = document.createElement('div');
bar.className = 'scroll-progress';
bar.setAttribute('aria-hidden', 'true');
header?.append(bar);

const timelines = [...document.querySelectorAll('[data-timeline]')];
const railLinks = [...document.querySelectorAll('[data-axis]')];
const railSections = railLinks.map((a) => document.getElementById(a.dataset.axis));

let ticking = false;

function onScroll() {
  ticking = false;
  const max = root.scrollHeight - window.innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
  header?.classList.toggle('is-scrolled', window.scrollY > 8);

  for (const block of wordBlocks) {
    const p = reduceMotion ? 1 : progressThrough(block.el, 0.85, 0.45);
    const lit = Math.round(p * block.spans.length);
    if (lit === block.lit) continue;
    block.lit = lit;
    block.spans.forEach((s, i) => s.classList.toggle('on', i < lit));
  }

  for (const tl of timelines) {
    const p = reduceMotion ? 1 : progressThrough(tl, 0.8, 0.5);
    tl.style.setProperty('--tp', p.toFixed(3));
    const steps = tl.children;
    const vertical = getComputedStyle(tl).gridTemplateColumns.split(' ').length === 1;
    [...steps].forEach((step, i) => {
      // Horizontal: dots sit at the start of each column. Vertical: at the top of each step.
      const at = vertical ? step.offsetTop / tl.offsetHeight : i / steps.length;
      step.classList.toggle('is-on', p >= at + 0.01 || p === 1);
    });
  }

  if (railLinks.length) {
    let current = 0;
    railSections.forEach((section, i) => {
      if (section && section.getBoundingClientRect().top <= window.innerHeight * 0.4) current = i;
    });
    railLinks.forEach((a, i) => a.setAttribute('aria-current', String(i === current)));
  }
}

window.addEventListener('scroll', () => {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(onScroll);
  }
}, { passive: true });
window.addEventListener('resize', onScroll, { passive: true });
onScroll();
