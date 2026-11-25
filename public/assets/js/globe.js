// Orthographic dot globe on a 2D canvas. Land points are a precomputed
// lat/lon grid (data/land.json); drag to rotate, buttons or pinch to zoom.

const RAD = Math.PI / 180;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function mountGlobe(root, { marker }) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const color = {
    sphere: css.getPropertyValue('--surface').trim(),
    edge: css.getPropertyValue('--line-strong').trim(),
    land: css.getPropertyValue('--text').trim(),
    accent: css.getPropertyValue('--accent').trim(),
    label: css.getPropertyValue('--text').trim(),
  };

  const raw = await fetch('/data/land.json').then((r) => r.json());
  const count = raw.length / 2;
  const sinLat = new Float32Array(count);
  const cosLat = new Float32Array(count);
  const sinLon = new Float32Array(count);
  const cosLon = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const lat = raw[i * 2] * RAD;
    const lon = raw[i * 2 + 1] * RAD;
    sinLat[i] = Math.sin(lat);
    cosLat[i] = Math.cos(lat);
    sinLon[i] = Math.sin(lon);
    cosLon[i] = Math.cos(lon);
  }

  // View state: centre of the globe (lon, lat in degrees) and zoom factor.
  const view = { lon: reduceMotion ? marker.lon : 95, lat: -22, zoom: 1 };
  const target = { lon: marker.lon, lat: -22, zoom: 1 };
  let velocity = { lon: 0, lat: 0 };
  let size = 0;
  let dpr = 1;
  let frame = 0;
  let visible = true;
  let t0 = performance.now();

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 7;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = rect.width;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    request();
  }

  function project(sLat, cLat, sLon, cLon, l0s, l0c, p0s, p0c) {
    const cosDl = cLon * l0c + sLon * l0s;
    const sinDl = sLon * l0c - cLon * l0s;
    const z = p0s * sLat + p0c * cLat * cosDl;
    const x = cLat * sinDl;
    const y = p0c * sLat - p0s * cLat * cosDl;
    return [x, y, z];
  }

  function draw(now) {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    // Zooming happens inside a fixed circular lens the size of the unzoomed globe.
    const lens = Math.min(w, h) / 2 - 2 * dpr;
    const R = lens * view.zoom;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, lens, 0, Math.PI * 2);
    ctx.clip();

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = color.sphere;
    ctx.fill();
    ctx.lineWidth = dpr;
    ctx.strokeStyle = color.edge;
    ctx.stroke();

    const l0 = view.lon * RAD;
    const p0 = view.lat * RAD;
    const l0s = Math.sin(l0);
    const l0c = Math.cos(l0);
    const p0s = Math.sin(p0);
    const p0c = Math.cos(p0);

    // Dot size follows the grid spacing (1 degree) so land stays solid when zoomed.
    const dot = Math.max(1.1 * dpr, Math.min(R * RAD * 0.6, 12 * dpr));
    const half = dot / 2;

    // Bucket by facing angle so the limb fades without per-dot alpha changes.
    const buckets = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    for (let i = 0; i < count; i++) {
      const [x, y, z] = project(sinLat[i], cosLat[i], sinLon[i], cosLon[i], l0s, l0c, p0s, p0c);
      if (z <= 0) continue;
      const sx = cx + x * R;
      const sy = cy - y * R;
      if (sx < -dot || sy < -dot || sx > w + dot || sy > h + dot) continue;
      const b = z > 0.6 ? 3 : z > 0.35 ? 2 : z > 0.15 ? 1 : 0;
      buckets[b].rect(sx - half, sy - half, dot, dot);
    }
    const alphas = [0.16, 0.3, 0.48, 0.66];
    ctx.fillStyle = color.land;
    buckets.forEach((path, i) => {
      ctx.globalAlpha = alphas[i];
      ctx.fill(path);
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    if (view.zoom > 1.01) {
      ctx.beginPath();
      ctx.arc(cx, cy, lens, 0, Math.PI * 2);
      ctx.lineWidth = dpr;
      ctx.strokeStyle = color.edge;
      ctx.stroke();
    }

    // Server marker (drawn outside the clip so its label isn't cut off at the edge)
    const m = project(
      Math.sin(marker.lat * RAD), Math.cos(marker.lat * RAD),
      Math.sin(marker.lon * RAD), Math.cos(marker.lon * RAD),
      l0s, l0c, p0s, p0c,
    );
    const mx = cx + m[0] * R;
    const my = cy - m[1] * R;
    if (m[2] > 0 && Math.hypot(mx - cx, my - cy) < lens) {
      const fade = Math.min(1, m[2] * 4);
      ctx.globalAlpha = fade;

      if (!reduceMotion) {
        const phase = ((now - t0) % 2400) / 2400;
        ctx.beginPath();
        ctx.arc(mx, my, (5 + phase * 16) * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = color.accent;
        ctx.globalAlpha = fade * (1 - phase) * 0.8;
        ctx.lineWidth = 1.25 * dpr;
        ctx.stroke();
        ctx.globalAlpha = fade;
      }

      ctx.beginPath();
      ctx.arc(mx, my, 4.5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = color.accent;
      ctx.fill();

      ctx.font = `${12.5 * dpr}px Lexend, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color.label;
      const text = marker.label;
      const tw = ctx.measureText(text).width;
      const leftSide = mx + 14 * dpr + tw > w - 4 * dpr;
      ctx.textAlign = leftSide ? 'right' : 'left';
      ctx.fillText(text, mx + (leftSide ? -14 : 14) * dpr, my);
      ctx.globalAlpha = 1;
    }
  }

  let dragging = false;
  let settling = !reduceMotion;

  function tick(now) {
    frame = 0;
    if (!visible) return;

    let moving = false;
    if (!dragging) {
      if (Math.abs(velocity.lon) > 0.01 || Math.abs(velocity.lat) > 0.01) {
        view.lon += velocity.lon;
        view.lat = clampLat(view.lat + velocity.lat);
        velocity.lon *= 0.92;
        velocity.lat *= 0.92;
        moving = true;
      } else if (settling) {
        const dl = wrap(target.lon - view.lon);
        const dp = target.lat - view.lat;
        const dz = target.zoom - view.zoom;
        if (Math.abs(dl) + Math.abs(dp) + Math.abs(dz) * 20 < 0.02) {
          view.lon = target.lon;
          view.lat = target.lat;
          view.zoom = target.zoom;
          settling = false;
        } else {
          view.lon += dl * 0.06;
          view.lat += dp * 0.06;
          view.zoom += dz * 0.12;
          moving = true;
        }
      }
    }

    draw(now);
    // Keep animating for the marker pulse while on screen.
    if (moving || dragging || !reduceMotion) request();
  }

  function request() {
    if (!frame && visible) frame = requestAnimationFrame(tick);
  }

  const clampLat = (v) => Math.max(-80, Math.min(80, v));
  const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

  // ---- Pointer input: one pointer rotates, two pointers pinch-zoom ----
  const pointers = new Map();
  let pinchStart = null;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragging = true;
    settling = false;
    velocity = { lon: 0, lat: 0 };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
    request();
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);

    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(pinchStart.zoom * (dist / pinchStart.dist), true);
      return;
    }

    // Convert pixels to degrees at the current radius so dragging feels attached.
    const R = (size / 2) * view.zoom;
    const k = 1 / (R * RAD);
    const dLon = -(cur.x - prev.x) * k;
    const dLat = (cur.y - prev.y) * k;
    view.lon += dLon;
    view.lat = clampLat(view.lat + dLat);
    velocity = { lon: dLon, lat: dLat };
  });

  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) {
      dragging = false;
      if (reduceMotion) velocity = { lon: 0, lat: 0 };
    }
    request();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('dblclick', () => setZoom(view.zoom * 1.6));

  canvas.addEventListener('keydown', (e) => {
    const step = 6 / view.zoom;
    const keys = {
      ArrowLeft: () => (view.lon -= step),
      ArrowRight: () => (view.lon += step),
      ArrowUp: () => (view.lat = clampLat(view.lat + step)),
      ArrowDown: () => (view.lat = clampLat(view.lat - step)),
      '+': () => setZoom(view.zoom * 1.4),
      '=': () => setZoom(view.zoom * 1.4),
      '-': () => setZoom(view.zoom / 1.4),
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    settling = false;
    keys[e.key]();
    request();
  });

  function setZoom(z, immediate = false) {
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    if (immediate || reduceMotion) {
      view.zoom = zoom;
      target.zoom = zoom;
    } else {
      target.lon = view.lon;
      target.lat = view.lat;
      target.zoom = zoom;
      settling = true;
    }
    request();
  }

  root.querySelector('[data-globe="in"]')?.addEventListener('click', () => setZoom(view.zoom * 1.6));
  root.querySelector('[data-globe="out"]')?.addEventListener('click', () => setZoom(view.zoom / 1.6));
  root.querySelector('[data-globe="home"]')?.addEventListener('click', () => {
    target.lon = marker.lon;
    target.lat = marker.lat;
    target.zoom = 3;
    velocity = { lon: 0, lat: 0 };
    if (reduceMotion) Object.assign(view, target);
    settling = !reduceMotion;
    request();
  });

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) request();
  }).observe(canvas);

  // Redraw once the web font is ready so the marker label uses Lexend.
  document.fonts?.ready.then(request);
  resize();
}
