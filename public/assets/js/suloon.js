// Project Suloon reveal.
//
// 1. Load-in: the first time the section comes on screen, a terminal boot
//    sequence types out over a black screen, then splits open like doors.
// 2. Declassification: on large screens the section pins in place and
//    scrolling moves it from "classified" (scattered particles, scrambled
//    codename) to revealed (the tree formed, the details shown). On small or
//    short screens the same sequence plays over time after the boot.
// 3. Once revealed, rockets and fireworks go off around the section and the
//    tree keeps moving: it sways in the wind, bobs, shimmers and sheds leaves.

import { mountFireworks } from './fireworks.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>';
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Particle colour moves from off-white to Suloon green as the tree forms.
const FROM = [232, 230, 225];
const TO = [159, 216, 164];

const BOOT_LINES = [
  'SULOON // secure link established',
  '> mounting game library ........ 8,000+',
  '> starting proxy ............... ok',
  '> opening chatroom ............. ok',
  '> loading music, movies, tools . ok',
  '> decrypting codename',
];

export function mountSuloon(section) {
  const pin = section.querySelector('.suloon-pin');
  const stage = section.querySelector('.suloon-stage');
  const canvas = stage.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const title = section.querySelector('[data-decrypt]');
  const finalTitle = title.textContent.trim();
  const state = section.querySelector('[data-state]');
  const meter = section.querySelector('[data-meter]');
  const meterBar = section.querySelector('.suloon-meter');

  const pinQuery = window.matchMedia('(min-width: 901px) and (min-height: 700px)');
  let pinned = false;
  let introStart = null;

  let particles = [];
  let tree = { top: 0, height: 1 };
  let w = 0;
  let h = 0;
  let dpr = 1;
  let frame = 0;
  let visible = false;
  let lastTitle = '';
  let lastPhase = -1;
  let glyphTick = 0;
  let booted = reduceMotion;
  const pointer = { x: 0, y: 0, active: false, strength: 0 };

  // Fireworks sit behind the copy, across the whole section.
  const fxCanvas = document.createElement('canvas');
  fxCanvas.className = 'suloon-fx';
  fxCanvas.setAttribute('aria-hidden', 'true');
  pin.prepend(fxCanvas);
  const fireworks = reduceMotion ? null : mountFireworks(fxCanvas);

  function setPinned() {
    pinned = !reduceMotion && pinQuery.matches;
    section.classList.toggle('is-pinned', pinned);
  }
  setPinned();
  pinQuery.addEventListener('change', () => {
    setPinned();
    resize();
  });

  const img = new Image();
  img.src = stage.dataset.src;
  img.decode().then(() => {
    resize();
    new ResizeObserver(resize).observe(stage);
  }).catch(() => {});

  function resize() {
    if (!stage.clientWidth || !img.complete) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = stage.clientWidth;
    h = stage.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    sample();
    request();
  }

  // Sample the image's alpha channel on a grid to place particles. The tree
  // is drawn a little smaller than the stage to leave room for it to sway.
  function sample() {
    const scale = Math.min((h * 0.84) / img.height, (w * 0.84) / img.width);
    const iw = Math.round(img.width * scale);
    const ih = Math.round(img.height * scale);
    const off = document.createElement('canvas');
    off.width = iw;
    off.height = ih;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(img, 0, 0, iw, ih);
    const data = octx.getImageData(0, 0, iw, ih).data;

    const gap = w < 500 ? 3 : 4;
    const ox = (w - iw) / 2;
    const oy = (h - ih) / 2;
    tree = { top: oy, height: ih };
    particles = [];
    for (let y = 0; y < ih; y += gap) {
      for (let x = 0; x < iw; x += gap) {
        if (data[(y * iw + x) * 4 + 3] < 128) continue;
        particles.push({
          hx: ox + x,
          hy: oy + y,
          seed: Math.random() * 1000,
          drift: 0.4 + Math.random() * 0.6,
          size: Math.random() < 0.08 ? 2.2 : 1.5,
          // A few canopy particles break off and drift away like leaves.
          leaf: y < ih * 0.62 && Math.random() < 0.035,
        });
      }
    }
  }

  // ---------- Load-in: boot sequence ----------

  function boot() {
    if (booted) return;
    booted = true;

    const overlay = document.createElement('div');
    overlay.className = 'suloon-boot';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <i class="boot-door boot-door--top"></i>
      <i class="boot-door boot-door--bottom"></i>
      <i class="boot-flash"></i>
      <div class="boot-term"><pre></pre><span class="boot-bar"><b></b></span><small>Click to skip</small></div>`;
    pin.append(overlay);
    const pre = overlay.querySelector('pre');
    const bar = overlay.querySelector('.boot-bar b');

    const full = BOOT_LINES.join('\n');
    const start = performance.now();
    const typeTime = 1900;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      pre.textContent = full;
      bar.style.transform = 'scaleX(1)';
      overlay.classList.add('is-open');
      if (!pinned) introStart = performance.now() + 300;
      setTimeout(() => overlay.remove(), 1200);
      request();
    };

    const type = (now) => {
      if (done) return;
      const t = clamp01((now - start) / typeTime);
      pre.textContent = full.slice(0, Math.round(full.length * t)) + (t < 1 ? '▍' : '');
      bar.style.transform = `scaleX(${t})`;
      if (t < 1) requestAnimationFrame(type);
      else setTimeout(finish, 280);
    };
    requestAnimationFrame(type);
    overlay.addEventListener('click', finish);
  }

  // ---------- Reveal progress ----------

  // How far through the reveal we are, from 0 (classified) to 1 (revealed).
  function progress(now) {
    if (reduceMotion) return 1;
    if (pinned) {
      const r = section.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      // Finish before the end of the pinned run so the full reveal holds for a while.
      return span > 0 ? clamp01(-r.top / (span * 0.78)) : 1;
    }
    if (introStart === null || now < introStart) return 0;
    return clamp01((now - introStart) / 3200);
  }

  function updateCopy(p) {
    // Each letter settles in turn between 18% and 48%; before that it flickers.
    glyphTick++;
    let text = '';
    for (let i = 0; i < finalTitle.length; i++) {
      const settleAt = 0.18 + 0.3 * (i / finalTitle.length);
      if (p >= settleAt) text += finalTitle[i];
      else if (glyphTick % 4 === 0 || !lastTitle[i]) text += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      else text += lastTitle[i];
    }
    if (text !== lastTitle) {
      title.textContent = text;
      lastTitle = text;
    }

    const phase = p >= 0.8 ? 3 : p >= 0.66 ? 2 : p >= 0.5 ? 1 : 0;
    if (phase !== lastPhase) {
      // Celebrate the moment it's declassified, and keep the show going after.
      if (fireworks && phase >= 1 && lastPhase < 1) fireworks.salvo(6);
      fireworks?.setActive(phase >= 1);
      lastPhase = phase;
      section.classList.toggle('p1', phase >= 1);
      section.classList.toggle('p2', phase >= 2);
      section.classList.toggle('p3', phase >= 3);
      state.textContent = phase >= 1 ? 'Declassified' : 'Classified';
    }

    const decrypt = clamp01(p / 0.5);
    meter.textContent = decrypt < 1 ? `Decrypting ${Math.round(decrypt * 100)}%` : 'Declassified · Full launch mid 2027';
    meterBar.style.setProperty('--meter', decrypt.toFixed(3));
  }

  // ---------- Tree ----------

  function draw(now, p) {
    const t = now / 1000;
    const formed = reduceMotion ? 1 : smooth(0.08, 0.5, p);
    const alive = reduceMotion ? 0 : formed;
    section.style.setProperty('--glow', formed.toFixed(3));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const scanY = formed < 0.6 ? ((t % 6) / 6) * (h + 120) - 60 : -999;
    pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * 0.08;
    const radius = Math.min(w, h) * 0.4;
    const scatter = reduceMotion ? 0 : Math.min(w, h) * (0.17 * (1 - formed) + 0.008);

    // Wind: a steady sway with slow gusts on top. The canopy moves, the base stays put.
    const gust = 0.65 + 0.35 * Math.sin(t * 0.31) * Math.sin(t * 0.17 + 1);
    const sway = Math.min(w, h) * 0.035 * gust * alive;
    const bob = Math.sin(t * 0.9) * 5 * alive;
    const bottom = tree.top + tree.height;

    const c = FROM.map((v, i) => Math.round(v + (TO[i] - v) * formed));
    ctx.fillStyle = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

    for (const q of particles) {
      let local = 0;
      if (pointer.strength > 0.01) {
        const d = Math.hypot(q.hx - pointer.x, q.hy - pointer.y);
        local = Math.max(0, 1 - d / radius) * pointer.strength;
      }
      local = Math.min(1, local + Math.max(0, 1 - Math.abs(q.hy - scanY) / 46) * (1 - formed));
      local = local * local * (3 - 2 * local);

      const bend = ((bottom - q.hy) / tree.height) ** 1.6;
      const a = scatter * q.drift * (1 - local * (1 - formed));
      let x = q.hx + Math.sin(t * 0.35 + q.seed) * a + Math.sin(t * 0.13 + q.hy * 0.02) * a * 0.6
        + Math.sin(t * 1.1 + q.hy * 0.012) * sway * bend;
      let y = q.hy + Math.cos(t * 0.29 + q.seed * 1.3) * a * 0.7 + bob * bend;

      let alpha = Math.min(0.95, 0.08 + formed * 0.62 + local * 0.6);
      alpha *= 1 - 0.18 * alive * (0.5 + 0.5 * Math.sin(t * 2.4 + q.seed)); // shimmer

      if (q.leaf && alive > 0.5) {
        // Drift off with the wind, falling and fading, then grow back on the branch.
        const phase = (t * 0.12 + q.seed) % 1;
        x += phase * 90 + Math.sin(phase * 12 + q.seed) * 8;
        y += phase * phase * 120;
        alpha *= 1 - phase;
      }

      ctx.globalAlpha = alpha;
      ctx.fillRect(x, y, q.size, q.size);
    }

    if (scanY > -60 && scanY < h + 60) {
      ctx.globalAlpha = 0.14 * (1 - formed) * (1 - pointer.strength);
      ctx.fillRect(0, scanY, w, 1);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Loop ----------

  function tick(now) {
    frame = 0;

    // Boot as the section scrolls into view, so the doors open as it arrives.
    if (!booted && visible && section.getBoundingClientRect().top < window.innerHeight * 0.55) boot();

    const p = progress(now);
    updateCopy(p);
    if (w) draw(now, p);
    fireworks?.frame(now);
    if (visible && !reduceMotion) request();
  }

  function request() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  if (!reduceMotion) {
    const move = (e) => {
      const rect = stage.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    };
    section.addEventListener('pointermove', move);
    section.addEventListener('pointerdown', move);
    section.addEventListener('pointerleave', () => (pointer.active = false));
    section.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') pointer.active = false;
    });
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) request();
  }).observe(section);

  request();
}
