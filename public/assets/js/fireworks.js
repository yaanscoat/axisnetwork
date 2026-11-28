// Rockets and fireworks on a canvas. Rockets launch from the bottom edge with a
// flame trail, then burst into sparks that fall with gravity and fade.
// Call setActive(true) to start launching, salvo(n) for a burst of rockets.

const COLORS = ['#9fd8a4', '#c3ecc6', '#eea23b', '#f6c77a', '#e8e6e1'];
const MAX_SPARKS = 1400;

export function mountFireworks(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let dpr = 1;
  let rockets = [];
  let sparks = [];
  let flashes = [];
  let active = false;
  let nextLaunch = 0;
  let last = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[(Math.random() * list.length) | 0];

  function launch(x = rand(0.04, 0.96) * w) {
    if (!w) return;
    // Aim for the upper part of the stage, drifting slightly towards the middle.
    const apex = rand(0.12, 0.5) * h;
    const vy = -Math.sqrt(2 * 900 * (h - apex)) * rand(0.95, 1.05);
    rockets.push({
      x,
      y: h + 10,
      vx: (w / 2 - x) * rand(0.02, 0.1) + rand(-30, 30),
      vy,
      color: pick(COLORS),
      wobble: rand(0, Math.PI * 2),
      trail: [],
    });
  }

  function burst(r) {
    const count = Math.min(MAX_SPARKS - sparks.length, (rand(80, 130)) | 0);
    flashes.push({ x: r.x, y: r.y, age: 0, color: r.color });
    const ring = Math.random() < 0.35;
    const second = Math.random() < 0.4 ? pick(COLORS) : r.color;
    const speed = rand(190, 320);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rand(-0.08, 0.08);
      const v = ring ? speed : speed * Math.sqrt(Math.random());
      sparks.push({
        x: r.x,
        y: r.y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: rand(1.1, 1.8),
        age: 0,
        color: i % 3 === 0 ? second : r.color,
        size: rand(1.6, 2.8),
        twinkle: Math.random() < 0.3,
      });
    }
  }

  function step(now) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;

    if (active && now >= nextLaunch) {
      launch();
      if (Math.random() < 0.25) launch();
      nextLaunch = now + rand(420, 1100);
    }

    for (const r of rockets) {
      r.wobble += dt * 9;
      r.vy += 900 * dt;
      r.x += (r.vx + Math.sin(r.wobble) * 24) * dt;
      r.y += r.vy * dt;
      r.trail.push([r.x, r.y]);
      if (r.trail.length > 14) r.trail.shift();
      if (r.vy >= -40) {
        burst(r);
        r.done = true;
      }
    }
    rockets = rockets.filter((r) => !r.done);

    for (const s of sparks) {
      s.age += dt;
      s.vx *= 1 - 1.6 * dt;
      s.vy = s.vy * (1 - 1.6 * dt) + 140 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    sparks = sparks.filter((s) => s.age < s.life);

    for (const f of flashes) f.age += dt;
    flashes = flashes.filter((f) => f.age < 0.35);
  }

  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    // Rockets: a fading trail, a short body along the direction of travel, and a flame.
    for (const r of rockets) {
      for (let i = 1; i < r.trail.length; i++) {
        const [x0, y0] = r.trail[i - 1];
        const [x1, y1] = r.trail[i];
        ctx.globalAlpha = (i / r.trail.length) * 0.5;
        ctx.strokeStyle = '#f6c77a';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      const angle = Math.atan2(r.vy, r.vx + Math.sin(r.wobble) * 24);
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = r.color;
      ctx.fillRect(-7, -1.5, 9, 3);
      ctx.fillStyle = '#f6c77a';
      ctx.globalAlpha = 0.5 + Math.random() * 0.5;
      ctx.beginPath();
      ctx.moveTo(-7, -1.5);
      ctx.lineTo(-13 - Math.random() * 6, 0);
      ctx.lineTo(-7, 1.5);
      ctx.fill();
      ctx.restore();
    }

    // A brief bloom where each shell bursts.
    for (const f of flashes) {
      const k = 1 - f.age / 0.35;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 90);
      g.addColorStop(0, f.color);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = k * 0.35;
      ctx.fillStyle = g;
      ctx.fillRect(f.x - 90, f.y - 90, 180, 180);
    }

    for (const s of sparks) {
      const fade = 1 - s.age / s.life;
      let alpha = fade * fade;
      if (s.twinkle) alpha *= 0.5 + 0.5 * Math.sin(now / 40 + s.x);
      ctx.fillStyle = s.color;
      // Soft halo, then the bright core.
      ctx.globalAlpha = alpha * 0.18;
      ctx.fillRect(s.x - s.size, s.y - s.size, s.size * 3, s.size * 3);
      ctx.globalAlpha = alpha;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  return {
    // Advance and render one frame; the caller drives the animation loop.
    frame(now) {
      step(now);
      draw(now);
    },
    setActive(value) {
      if (value && !active) nextLaunch = 0;
      active = value;
    },
    salvo(n = 5) {
      for (let i = 0; i < n; i++) setTimeout(() => launch(((i + 0.5) / n) * w), i * 140);
    },
    get busy() {
      return active || rockets.length > 0 || sparks.length > 0 || flashes.length > 0;
    },
  };
}
