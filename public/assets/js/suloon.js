// Project Suloon: the tree image is broken into particles that drift apart.
// They only pull back into shape near the cursor, or where a slow scan line
// passes when nobody is pointing at it.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>';

export function mountSuloon(section) {
  const stage = section.querySelector('.suloon-stage');
  const canvas = stage.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const title = section.querySelector('.suloon-title');

  let particles = [];
  let w = 0;
  let h = 0;
  let dpr = 1;
  let frame = 0;
  let visible = false;
  const pointer = { x: 0, y: 0, active: false, strength: 0 };

  const img = new Image();
  img.src = stage.dataset.src;
  img.decode().then(() => {
    resize();
    new ResizeObserver(resize).observe(stage);
  }).catch(() => {});

  function resize() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    sample();
    request();
  }

  // Sample the image's alpha channel on a grid to place particles.
  function sample() {
    const scale = Math.min((h * 0.86) / img.height, (w * 0.9) / img.width);
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
        });
      }
    }
  }

  function draw(now) {
    const t = now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Scan line sweeps top to bottom, pausing between passes.
    const cycle = (t % 9) / 9;
    const scanY = cycle < 0.75 ? (cycle / 0.75) * (h + 120) - 60 : -999;

    pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * 0.08;
    const radius = Math.min(w, h) * 0.4;
    const scatter = Math.min(w, h) * 0.1;

    ctx.fillStyle = '#e8e6e1';
    for (const p of particles) {
      let reveal = 0;
      if (pointer.strength > 0.01) {
        const d = Math.hypot(p.hx - pointer.x, p.hy - pointer.y);
        reveal = Math.max(0, 1 - d / radius) * pointer.strength;
      }
      const scanReveal = Math.max(0, 1 - Math.abs(p.hy - scanY) / 46) * (1 - pointer.strength);
      reveal = Math.min(1, reveal + scanReveal);
      reveal = reveal * reveal * (3 - 2 * reveal);

      const a = scatter * p.drift * (1 - reveal);
      const x = p.hx + Math.sin(t * 0.35 + p.seed) * a + Math.sin(t * 0.13 + p.hy * 0.02) * a * 0.6;
      const y = p.hy + Math.cos(t * 0.29 + p.seed * 1.3) * a * 0.7;

      ctx.globalAlpha = 0.1 + reveal * 0.8;
      ctx.fillRect(x, y, p.size, p.size);
    }

    if (scanY > -60 && scanY < h + 60) {
      ctx.globalAlpha = 0.12 * (1 - pointer.strength);
      ctx.fillRect(0, scanY, w, 1);
    }
    ctx.globalAlpha = 1;
  }

  // Static frame: a faint, partly formed tree.
  function drawStill() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#e8e6e1';
    const scatter = Math.min(w, h) * 0.05;
    for (const p of particles) {
      ctx.globalAlpha = 0.28;
      ctx.fillRect(p.hx + Math.sin(p.seed) * scatter * p.drift, p.hy + Math.cos(p.seed) * scatter * p.drift, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    frame = 0;
    if (reduceMotion) return drawStill();
    if (!visible) return;
    draw(now);
    request();
  }

  function request() {
    if (!frame && (visible || reduceMotion)) frame = requestAnimationFrame(tick);
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
    if (visible) {
      request();
      scramble(title);
    }
  }, { threshold: 0.25 }).observe(section);

  title.addEventListener('pointerenter', () => scramble(title));
}

// Cycles each letter through random glyphs before it settles, left to right.
function scramble(el) {
  if (reduceMotion || el.dataset.busy) return;
  const final = el.dataset.text || el.textContent;
  el.dataset.text = final;
  el.dataset.busy = '1';
  const start = performance.now();
  const step = (now) => {
    const progress = (now - start) / 900;
    let out = '';
    for (let i = 0; i < final.length; i++) {
      const settleAt = i / final.length;
      if (final[i] === ' ' || progress > settleAt + 0.25) out += final[i];
      else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (progress < 1.25) requestAnimationFrame(step);
    else {
      el.textContent = final;
      delete el.dataset.busy;
    }
  };
  requestAnimationFrame(step);
}
