/* =========================================================
 * 前景特效层（Canvas 2D）
 * - 环境粒子：本体 = 上升余烬；纯烬 = 飘落灰羽与星屑
 * - 鼠标拖尾、点击爆点、形态切换冲击波
 * - 六个技能的施放演出
 * ========================================================= */
window.FX = (() => {
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = { out: (k) => 1 - Math.pow(1 - k, 3), inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2), back: (k) => 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2) };
  const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let cv, ctx, W = 0, H = 0, dpr = 1, form = 'base', last = performance.now(), app = null;
  const P = [], E = [], T = [];
  const S = {};
  const pointer = { x: -999, y: -999, lx: -999, ly: -999 };
  const shake = { t: 0, dur: 0, amp: 0 };
  let ambientTimer = 0;

  /* ---------------- 精灵预渲染 ---------------- */
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function mk(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    return c;
  }
  const glow = (c, hot = true) => mk(64, (g, s) => {
    const r = s / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, hot ? 'rgba(255,255,255,1)' : rgba(c, 1));
    gr.addColorStop(0.18, rgba(c, 0.95));
    gr.addColorStop(0.45, rgba(c, 0.32));
    gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  const soft = (c, a = 0.9) => mk(64, (g, s) => {
    const r = s / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.5, rgba(c, a * 0.45)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  const star = (c) => mk(48, (g, s) => {
    const r = s / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r * 0.6);
    gr.addColorStop(0, rgba(c, 0.55)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.fillStyle = rgba(c, 1);
    g.beginPath();
    g.moveTo(r, 2); g.quadraticCurveTo(r, r, s - 2, r); g.quadraticCurveTo(r, r, r, s - 2); g.quadraticCurveTo(r, r, 2, r); g.quadraticCurveTo(r, r, r, 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.beginPath(); g.arc(r, r, 2.2, 0, TAU); g.fill();
  });
  const feather = (c, edge) => mk(64, (g, s) => {
    g.translate(s / 2, s / 2);
    g.rotate(-0.5);
    g.fillStyle = rgba(c, 0.95);
    g.strokeStyle = rgba(edge, 0.7);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-26, 2);
    g.bezierCurveTo(-12, -12, 14, -12, 27, -1);
    g.bezierCurveTo(14, 8, -10, 10, -26, 2);
    g.fill(); g.stroke();
    g.strokeStyle = rgba(edge, 0.9);
    g.beginPath(); g.moveTo(-29, 3); g.quadraticCurveTo(0, -1, 27, -1); g.stroke();
    g.strokeStyle = rgba(edge, 0.35);
    for (let i = -18; i < 22; i += 5) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 5, -7); g.moveTo(i, 1); g.lineTo(i + 4, 6); g.stroke(); }
  });
  const hexBit = (c) => mk(32, (g, s) => {
    g.translate(s / 2, s / 2);
    g.strokeStyle = rgba(c, 1); g.fillStyle = rgba(c, 0.35); g.lineWidth = 2;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6; g.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); }
    g.closePath(); g.fill(); g.stroke();
  });

  const C = {
    ember: [255, 118, 38], gold: [255, 190, 90], red: [255, 64, 32], crimson: [227, 38, 75], hot: [255, 232, 196], smoke: [38, 28, 28],
    sky: [96, 168, 232], pink: [240, 140, 176], lilac: [160, 132, 222], silver: [160, 170, 196], white: [255, 255, 255], mint: [96, 200, 150], cream: [255, 210, 150], ribbon: [212, 50, 79],
  };
  function buildSprites() {
    S.ember = glow(C.ember); S.gold = glow(C.gold); S.red = glow(C.red); S.hot = glow(C.hot); S.crimson = glow(C.crimson);
    S.smoke = soft(C.smoke, 0.55); S.bokehE = soft(C.ember, 0.35);
    S.sky = soft(C.sky, 0.85); S.pink = soft(C.pink, 0.8); S.lilac = soft(C.lilac, 0.8); S.white = soft(C.white, 0.95); S.mint = soft(C.mint, 0.85); S.cream = soft(C.cream, 0.85);
    S.starSky = star(C.sky); S.starPink = star(C.pink); S.starLilac = star(C.lilac); S.starGold = star([255, 196, 96]); S.starMint = star(C.mint);
    S.featherW = feather([250, 250, 252], [150, 158, 182]); S.featherP = feather([255, 226, 236], [214, 140, 170]); S.featherB = feather([232, 243, 255], [120, 160, 210]);
    S.hexSky = hexBit(C.sky); S.hexWhite = hexBit([220, 236, 255]);
    S.glowSky = glow(C.sky); S.glowPink = glow(C.pink); S.glowLilac = glow(C.lilac); S.glowMint = glow(C.mint); S.glowWhite = glow([235, 245, 255]);
  }
  const stars = () => pick([S.starSky, S.starPink, S.starLilac, S.starGold, S.starMint]);
  const feathers = () => pick([S.featherW, S.featherW, S.featherP, S.featherB]);

  /* ---------------- 粒子 ---------------- */
  function add(o) {
    const p = Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 1, life: 0, max: 1, s0: 8, s1: 8, a: 1,
      spr: S.ember, add: true, rot: 0, vr: 0, sway: 0, swf: 2, ph: Math.random() * TAU, fl: 0, kind: 'spr', ambient: false, fadeIn: 0.12,
    }, o);
    P.push(p);
    return p;
  }

  function updateParticles(dt) {
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life += dt;
      if (p.life >= p.max || p.y < -120 || p.y > H + 160 || p.x < -160 || p.x > W + 160) { P.splice(i, 1); continue; }
      p.vx += p.ax * dt; p.vy += p.ay * dt;
      if (p.drag !== 1) { const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d; }
      p.px = p.x; p.py = p.y;
      p.x += (p.vx + (p.sway ? Math.cos(p.life * p.swf + p.ph) * p.sway : 0)) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  function drawParticles(addPass) {
    ctx.globalCompositeOperation = addPass ? 'lighter' : 'source-over';
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (p.add !== addPass) continue;
      const k = p.life / p.max;
      let a = p.a * Math.min(1, p.life / p.fadeIn) * (1 - k * k);
      if (p.fl) a *= 0.65 + 0.35 * Math.sin(p.life * p.fl + p.ph);
      if (a <= 0.004) continue;
      const s = p.s0 + (p.s1 - p.s0) * k;
      ctx.globalAlpha = clamp(a, 0, 1);
      if (p.kind === 'streak') {
        ctx.strokeStyle = p.col;
        ctx.lineWidth = p.w || 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x - p.vx * (p.len || 0.03), p.y - p.vy * (p.len || 0.03));
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else if (p.kind === 'rot') {
        const c = Math.cos(p.rot), sn = Math.sin(p.rot);
        ctx.setTransform(c * dpr, sn * dpr, -sn * dpr, c * dpr, p.x * dpr, p.y * dpr);
        ctx.drawImage(p.spr, -s / 2, -s / 2, s, s);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else if (p.kind === 'plus') {
        ctx.fillStyle = p.col;
        const w = s * 0.28;
        ctx.fillRect(p.x - s / 2, p.y - w / 2, s, w);
        ctx.fillRect(p.x - w / 2, p.y - s / 2, w, s);
      } else {
        ctx.drawImage(p.spr, p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- 环境粒子 ---------------- */
  // 整体强度：数值越小越温和（1 = 原始的华丽版本）
  const GENTLE = 0.32;
  const cnt = (v) => Math.max(1, Math.round(v * GENTLE));

  function ambientTarget() {
    if (reduce) return 6;
    return Math.round(clamp((W * H) / 110000, 8, 20));
  }
  function spawnAmbient(initial) {
    if (form === 'base') {
      const big = Math.random() < 0.05;
      if (big) {
        add({ ambient: true, x: rand(0, W), y: initial ? rand(0, H) : H + 40, vx: rand(-4, 4), vy: rand(-16, -6), max: rand(9, 15), s0: rand(36, 64), s1: rand(44, 72), a: rand(0.025, 0.05), spr: S.bokehE, add: true, fadeIn: 3 });
      } else {
        add({ ambient: true, x: rand(0, W), y: initial ? rand(H * 0.3, H) : H + 10, vx: rand(-6, 6), vy: rand(-55, -18), max: rand(5, 10), s0: rand(2, 5), s1: rand(1, 2), a: rand(0.25, 0.6), spr: pick([S.ember, S.gold, S.gold]), add: true, sway: rand(6, 18), swf: rand(0.8, 2), fl: rand(3, 8), fadeIn: 1.2 });
      }
    } else {
      const r = Math.random();
      if (r < 0.55) {
        add({ ambient: true, kind: 'rot', x: rand(-40, W), y: initial ? rand(0, H) : -30, vx: rand(6, 18), vy: rand(10, 28), max: rand(12, 22), s0: rand(10, 18), s1: rand(8, 16), a: rand(0.3, 0.55), spr: feathers(), add: false, rot: rand(0, TAU), vr: rand(-0.8, 0.8), sway: rand(8, 22), swf: rand(0.5, 1.2), fadeIn: 1.5 });
      } else if (r < 0.8) {
        add({ ambient: true, x: rand(0, W), y: rand(0, H), vx: rand(-4, 4), vy: rand(-6, 3), max: rand(2, 4), s0: rand(6, 11), s1: rand(3, 7), a: rand(0.35, 0.65), spr: stars(), add: false, fl: rand(2, 5), fadeIn: 0.8 });
      } else {
        add({ ambient: true, x: rand(0, W), y: initial ? rand(0, H) : -40, vx: rand(3, 10), vy: rand(4, 12), max: rand(10, 18), s0: rand(30, 60), s1: rand(40, 70), a: rand(0.1, 0.2), spr: pick([S.white, S.pink, S.sky, S.lilac]), add: false, sway: rand(5, 12), swf: rand(0.3, 0.7), fadeIn: 3 });
      }
    }
  }
  function tickAmbient(dt) {
    let count = 0;
    for (const p of P) if (p.ambient) count++;
    const target = ambientTarget();
    ambientTimer += dt;
    const rate = form === 'base' ? 0.16 : 0.2;
    while (count < target && ambientTimer > rate) { spawnAmbient(false); count++; ambientTimer -= rate; }
    if (ambientTimer > 1) ambientTimer = 0;
  }

  /* ---------------- 效果（非粒子绘制） ---------------- */
  function effect(dur, draw, opts = {}) {
    const e = Object.assign({ t: 0, dur, draw }, opts);
    E.push(e);
    return e;
  }
  const after = (sec, fn) => effect(sec, null, { onEnd: fn });

  function ring(x, y, o = {}) {
    const r0 = o.r0 ?? 0, r1 = o.r1 ?? 160, w0 = (o.w0 ?? 6) * 0.6, col = o.col || 'rgba(255,140,60,1)';
    effect(o.dur ?? 0.6, (e, k) => {
      const kk = ease.out(k);
      ctx.globalCompositeOperation = o.add === false ? 'source-over' : 'lighter';
      ctx.globalAlpha = (1 - k) * (o.a ?? 0.6);
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(0.5, w0 * (1 - k));
      ctx.beginPath(); ctx.arc(x, y, r0 + (r1 - r0) * kk, 0, TAU); ctx.stroke();
      if (o.double) { ctx.lineWidth *= 0.4; ctx.beginPath(); ctx.arc(x, y, (r0 + (r1 - r0) * kk) * 0.86, 0, TAU); ctx.stroke(); }
    });
  }
  function flash(x, y, spr, size, dur = 0.35, addMode = true) {
    size *= 0.7;
    effect(dur, (e, k) => {
      ctx.globalCompositeOperation = addMode ? 'lighter' : 'source-over';
      ctx.globalAlpha = (1 - ease.out(k)) * 0.5;
      const s = size * (0.6 + 0.6 * ease.out(k));
      ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
    });
  }
  function screenTint(col, dur, peak = 0.3) {
    peak *= 0.45;
    effect(dur, (e, k) => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = peak * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });
  }
  function whiteFlash(dur = 0.45, peak = 0.35, col = '255,255,255') {
    peak *= 0.4;
    effect(dur, (e, k) => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = peak * (1 - k);
      ctx.fillStyle = `rgb(${col})`; ctx.fillRect(0, 0, W, H);
    });
  }

  function text(x, y, str, col, o = {}) {
    T.push({ x, y, str, col, life: 0, max: o.max || 1.1, size: o.size || 26, vy: o.vy ?? -60, vx: o.vx ?? rand(-20, 20), outline: o.outline || 'rgba(20,6,10,.85)' });
  }
  function drawTexts(dt) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = T.length - 1; i >= 0; i--) {
      const t = T[i];
      t.life += dt;
      if (t.life > t.max) { T.splice(i, 1); continue; }
      const k = t.life / t.max;
      t.x += t.vx * dt; t.y += t.vy * dt * (1 - k);
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.7 : 1.3 - Math.min(0.3, (k - 0.15) * 1.2);
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.font = `800 ${Math.round(t.size * pop)}px "JetBrains Mono", "Noto Sans SC", monospace`;
      ctx.lineWidth = 4; ctx.strokeStyle = t.outline; ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.col; ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- 法阵绘制 ---------------- */
  function drawRuneCircle(x, y, r, rot, a, col, addMode = true) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = addMode ? 'lighter' : 'source-over';
    ctx.globalAlpha = a;
    ctx.strokeStyle = col; ctx.fillStyle = col;
    for (const [lw, al] of [[6, 0.18], [1.6, 1]]) {
      ctx.globalAlpha = a * al;
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = a;
    ctx.rotate(rot);
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU); ctx.stroke();
    for (let tri = 0; tri < 2; tri++) {
      ctx.beginPath();
      for (let k = 0; k <= 3; k++) {
        const ang = -Math.PI / 2 + tri * Math.PI + (k * TAU) / 3;
        const px = Math.cos(ang) * r * 0.76, py = Math.sin(ang) * r * 0.76;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.font = `${Math.max(9, Math.round(r * 0.13))}px "Noto Sans Runic", "Segoe UI Historic", serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const n = 18;
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.rotate((i / n) * TAU);
      ctx.fillText(RUNES[i % RUNES.length], 0, -r * 0.89);
      ctx.restore();
    }
    for (let i = 0; i < 36; i++) {
      const ang = (i / 36) * TAU;
      const r1 = r * 1.04, r2 = r * (i % 3 ? 1.08 : 1.13);
      ctx.beginPath(); ctx.moveTo(Math.cos(ang) * r1, Math.sin(ang) * r1); ctx.lineTo(Math.cos(ang) * r2, Math.sin(ang) * r2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawHexShield(x, y, R, t, a) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.clip();
    const g = ctx.createRadialGradient(x, y, R * 0.2, x, y, R);
    g.addColorStop(0, 'rgba(210,232,255,0.06)'); g.addColorStop(1, 'rgba(150,200,250,0.32)');
    ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2);
    const s = 17, hh = Math.sqrt(3) * s;
    const cols = Math.ceil(R / (1.5 * s)) + 1, rows = Math.ceil(R / hh) + 1;
    ctx.lineWidth = 1.2;
    for (let c = -cols; c <= cols; c++) {
      for (let r = -rows; r <= rows; r++) {
        const cx = x + c * 1.5 * s, cy = y + r * hh + (c & 1 ? hh / 2 : 0);
        const d = Math.hypot(cx - x, cy - y);
        if (d > R + s) continue;
        const wave = Math.max(0, Math.sin(d * 0.045 - t * 7));
        ctx.globalAlpha = a * (0.12 + 0.55 * wave * wave);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const an = (k * TAU) / 6; ctx.lineTo(cx + Math.cos(an) * (s - 1.5), cy + Math.sin(an) * (s - 1.5)); }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(90,160,230,1)'; ctx.stroke();
        if (wave > 0.85) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); }
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    for (const [lw, al, col] of [[10, 0.18, 'rgba(120,190,255,1)'], [3, 0.9, 'rgba(255,255,255,1)'], [1.4, 1, 'rgba(90,150,225,1)']]) {
      ctx.globalAlpha = a * al; ctx.lineWidth = lw; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    }
  }

  function rainbowRing(x, y, r, lw, a, t) {
    const seg = 48;
    ctx.lineWidth = lw;
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1.15) / seg) * TAU;
      ctx.globalAlpha = a;
      ctx.strokeStyle = `hsl(${(i / seg) * 360 + t * 120},85%,70%)`;
      ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke();
    }
  }

  /* ---------------- 常用粒子爆发 ---------------- */
  function emberBurst(x, y, n = 60, sp = [120, 520], o = {}) {
    n = cnt(n);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(sp[0], sp[1]) * 0.65;
      add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.lift ?? 40), ay: o.g ?? 120, drag: 0.93, max: rand(0.6, 1.3), s0: rand(4, 9), s1: 1, a: 0.7, spr: pick([S.ember, S.gold, S.gold]), add: true, fl: rand(6, 12), fadeIn: 0.04 });
    }
  }
  function sparkStreaks(x, y, n = 20, col = 'rgba(255,200,120,1)', sp = [300, 800]) {
    n = cnt(n * 0.6);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(sp[0], sp[1]) * 0.6;
      add({ kind: 'streak', col, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.9, ay: 300, max: rand(0.3, 0.6), w: rand(0.8, 1.6), len: 0.04, a: 0.6, add: true, fadeIn: 0.01 });
    }
  }
  function smokePuffs(x, y, n = 10) {
    n = cnt(n);
    for (let i = 0; i < n; i++) {
      add({ x: x + rand(-20, 20), y: y + rand(-20, 20), vx: rand(-30, 30), vy: rand(-60, -15), drag: 0.97, max: rand(1, 1.8), s0: rand(24, 40), s1: rand(60, 100), a: 0.35, spr: S.smoke, add: false, fadeIn: 0.15 });
    }
  }
  function ashBurst(x, y, n = 60, sp = [120, 520]) {
    n = cnt(n);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(sp[0], sp[1]) * 0.65;
      if (Math.random() < 0.5) add({ kind: 'rot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.94, ay: 25, max: rand(1, 2), s0: rand(10, 20), s1: rand(8, 16), a: 0.7, spr: feathers(), add: false, rot: rand(0, TAU), vr: rand(-3, 3), sway: 14, fadeIn: 0.04 });
      else add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.92, max: rand(0.6, 1.2), s0: rand(7, 14), s1: 2, a: 0.7, spr: stars(), add: false, fl: 6, fadeIn: 0.04 });
    }
  }

  /* ---------------- 交互入口 ---------------- */
  function onPointer(x, y) {
    pointer.x = x; pointer.y = y;
    const d = Math.hypot(x - pointer.lx, y - pointer.ly);
    if (d < 70 || reduce) return;
    wake();
    pointer.lx = x; pointer.ly = y;
    if (form === 'base') {
      add({ x: x + rand(-3, 3), y: y + rand(-3, 3), vx: rand(-12, 12), vy: rand(-40, -12), max: rand(0.5, 0.9), s0: rand(3, 6), s1: 1, a: 0.55, spr: S.gold, add: true, fl: 8, fadeIn: 0.05 });
    } else {
      add({ x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-8, 8), vy: rand(-6, 16), max: rand(0.6, 1), s0: rand(6, 10), s1: 2, a: 0.55, spr: stars(), add: false, fadeIn: 0.05, rot: 0 });
    }
  }
  function onClick(x, y) {
    if (form === 'base') {
      ring(x, y, { r1: 28, w0: 2, dur: 0.45, a: 0.4, col: 'rgba(255,170,200,1)' });
      emberBurst(x, y, 8, [40, 140], { g: 80 });
    } else {
      ring(x, y, { r1: 28, w0: 2, dur: 0.5, a: 0.4, col: 'rgba(120,170,230,1)', add: false });
      ashBurst(x, y, 8, [40, 130]);
    }
  }

  /** 形态切换冲击波：光环与页面的圆形揭开同半径、同时长、同缓动（ease-out cubic，1.2 秒），正好描在揭开的边缘上 */
  function formBurst(x, y, to) {
    const R = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 8;
    if (to === 'base') {
      ring(x, y, { r1: R, w0: 7, dur: 1.2, a: 0.55, col: 'rgba(255,120,170,1)' });
      ring(x, y, { r1: R * 0.985, w0: 3, dur: 1.2, a: 0.5, col: 'rgba(255,190,120,1)' });
      emberBurst(x, y, reduce ? 20 : 90, [160, 700], { g: 40, lift: 0 });
    } else {
      ring(x, y, { r1: R, w0: 7, dur: 1.2, a: 0.6, col: 'rgba(255,255,255,1)', add: false });
      effect(1.2, (e, k) => rainbowRing(x, y, R * 0.97 * ease.out(k), 3 * (1 - k), 0.35 * (1 - k), k));
      ashBurst(x, y, reduce ? 20 : 90, [160, 700]);
    }
    shakeIt(2, 0.35);
  }

  function shakeIt(amp, dur) {
    if (reduce) return;
    amp *= 0.35;
    shake.amp = Math.max(shake.amp * (1 - shake.t / (shake.dur || 1)), amp);
    shake.dur = dur; shake.t = 0;
  }

  /* ---------------- 技能施放 ---------------- */
  const DMG = 'rgb(235,110,235)';
  const HEAL = 'rgb(100,225,130)';
  const casts = {
    /* 二重咏唱：两层符文法阵先后展开 */
    chant(x, y) {
      const col = 'rgba(255,170,80,1)';
      effect(2.4, (e, k) => {
        const tt = e.t;
        const inK = clamp(tt / 0.4, 0, 1), outK = clamp((tt - 1.9) / 0.5, 0, 1);
        drawRuneCircle(x, y, 150 * ease.back(inK), tt * 0.8, (1 - outK) * 0.9, col);
      });
      after(0.45, () => {
        ring(x, y, { r1: 190, w0: 8, dur: 0.6, col: 'rgba(255,220,150,1)' });
        effect(1.95, (e, k) => {
          const inK = clamp(e.t / 0.3, 0, 1), outK = clamp((e.t - 1.45) / 0.5, 0, 1);
          drawRuneCircle(x, y, 96 * ease.back(inK), -e.t * 1.6, (1 - outK), 'rgba(255,120,60,1)');
        });
        text(x, y - 150, '攻速 +60', 'rgb(255,200,120)', { size: 22, vx: 0 });
      });
      after(0.9, () => { text(x + 60, y - 110, 'ATK +60%', 'rgb(255,150,80)', { size: 20, vx: 0 }); BG.pulse(0.6); });
      for (let i = 0; i < cnt(70); i++) {
        const a0 = rand(0, TAU), r = rand(40, 170);
        add({ x: x + Math.cos(a0) * r, y: y + Math.sin(a0) * r, vx: -Math.sin(a0) * 120, vy: Math.cos(a0) * 120 - 40, drag: 0.97, max: rand(0.8, 1.8), s0: rand(5, 10), s1: 1, spr: pick([S.gold, S.ember]), add: true, fadeIn: rand(0.05, 0.6) });
      }
    },

    /* 点燃：蓄能 → 火球 → 爆炸（主目标两段伤害） */
    ignite(x, y) {
      const tx = clamp(x + rand(-260, 260), 80, W - 80), ty = clamp(y - rand(220, 360), 80, H - 80);
      effect(0.42, (e, k) => {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9;
        const s = 40 + 90 * k;
        ctx.drawImage(S.ember, x - s / 2, y - s / 2, s, s);
        ctx.drawImage(S.hot, x - s / 4, y - s / 4, s / 2, s / 2);
      });
      for (let i = 0; i < cnt(26); i++) {
        const a = rand(0, TAU), r = rand(70, 130);
        add({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.4, vy: -Math.sin(a) * r * 2.4, max: 0.42, s0: 8, s1: 2, spr: S.gold, add: true, fadeIn: 0.02 });
      }
      after(0.42, () => {
        const dur = 0.34;
        effect(dur, (e, k) => {
          const kk = ease.inOut(k);
          const px = x + (tx - x) * kk, py = y + (ty - y) * kk - Math.sin(Math.PI * k) * 60;
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
          ctx.drawImage(S.ember, px - 40, py - 40, 80, 80);
          ctx.drawImage(S.hot, px - 16, py - 16, 32, 32);
          for (let i = 0; i < 3; i++) add({ x: px, y: py, vx: rand(-40, 40), vy: rand(-40, 40), max: rand(0.25, 0.5), s0: rand(14, 24), s1: 2, spr: pick([S.ember, S.gold, S.red]), add: true, fadeIn: 0.01 });
        }, {
          onEnd() {
            flash(tx, ty, S.hot, 360, 0.35);
            flash(tx, ty, S.ember, 520, 0.6);
            ring(tx, ty, { r1: 200, w0: 10, dur: 0.55, col: 'rgba(255,160,80,1)', double: true });
            emberBurst(tx, ty, 90, [150, 560]);
            sparkStreaks(tx, ty, 24);
            smokePuffs(tx, ty, 10);
            shakeIt(9, 0.35);
            BG.pulse(1);
            const n = 1193 + ((Math.random() * 200) | 0);
            text(tx - 22, ty - 30, n.toLocaleString(), DMG, { size: 28, vx: -20 });
            setTimeout(() => text(tx + 22, ty - 10, n.toLocaleString(), DMG, { size: 28, vx: 20 }), 90);
            text(tx, ty + 40, '法抗 −25%', 'rgb(255,190,120)', { size: 18, vx: 0, vy: 30 });
          },
        });
      });
    },

    /* 火山：全屏熔岩弹雨 */
    volcano(x, y) {
      shakeIt(5, 2.2);
      screenTint('rgba(255,60,10,1)', 2.6, 0.38);
      BG.pulse(1);
      flash(x, y, S.ember, 380, 0.8);
      const n = reduce ? 5 : 12;
      for (let i = 0; i < n; i++) {
        after(0.1 + i * 0.1, () => {
          const sx = x + rand(-30, 30), sy = y;
          const ex = rand(W * 0.06, W * 0.94), ey = rand(H * 0.12, H * 0.88);
          const apex = Math.min(sy, ey) - rand(160, 360);
          const dur = rand(0.55, 0.8);
          effect(dur, (e, k) => {
            const px = sx + (ex - sx) * k;
            const py = (1 - k) * (1 - k) * sy + 2 * (1 - k) * k * apex + k * k * ey;
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
            ctx.drawImage(S.red, px - 34, py - 34, 68, 68);
            ctx.drawImage(S.hot, px - 11, py - 11, 22, 22);
            add({ x: px, y: py, vx: rand(-30, 30), vy: rand(-30, 10), max: rand(0.35, 0.7), s0: rand(14, 26), s1: 2, spr: pick([S.ember, S.red, S.gold]), add: true, fadeIn: 0.01 });
            if (Math.random() < 0.3) add({ x: px, y: py, vx: rand(-20, 20), vy: rand(-60, -20), max: 1, s0: 20, s1: 60, a: 0.4, spr: S.smoke, add: false });
          }, {
            onEnd() {
              flash(ex, ey, S.hot, 200, 0.3);
              flash(ex, ey, S.ember, 300, 0.5);
              ring(ex, ey, { r1: 110, w0: 6, dur: 0.5, col: 'rgba(255,150,70,1)' });
              emberBurst(ex, ey, 34, [100, 380]);
              smokePuffs(ex, ey, 4);
              shakeIt(7, 0.2);
              text(ex, ey - 24, (800 + ((Math.random() * 900) | 0)).toLocaleString(), DMG, { size: 24 });
            },
          });
        });
      }
    },

    /* 无声润物：细雨与涟漪 */
    rain(x, y) {
      whiteFlash(0.5, 0.18, '220,236,255');
      const n = reduce ? 12 : cnt(110);
      for (let i = 0; i < n; i++) {
        after(rand(0, 2.2), () => {
          const px = rand(0, W), ly = rand(H * 0.25, H * 0.96);
          const speed = rand(700, 1000);
          const dur = (ly + 30) / speed;
          effect(dur, (e, k) => {
            const py = -30 + (ly + 30) * k;
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 0.75;
            ctx.strokeStyle = 'rgba(90,160,230,1)'; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(px - 3, py - 22); ctx.lineTo(px, py); ctx.stroke();
            ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff'; ctx.fillRect(px - 1, py - 2, 2, 2);
          }, {
            onEnd() {
              effect(0.9, (e, k) => {
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 0.7 * (1 - k);
                ctx.strokeStyle = 'rgba(80,150,220,1)'; ctx.lineWidth = 1.4;
                ctx.beginPath(); ctx.ellipse(px, ly, 4 + 34 * ease.out(k), 1.5 + 9 * ease.out(k), 0, 0, TAU); ctx.stroke();
                ctx.globalAlpha = 0.4 * (1 - k);
                ctx.beginPath(); ctx.ellipse(px, ly, 2 + 18 * ease.out(k), 1 + 5 * ease.out(k), 0, 0, TAU); ctx.stroke();
              });
              if (Math.random() < 0.35) add({ x: px, y: ly - 6, vx: rand(-10, 10), vy: rand(-50, -20), max: 1, s0: 12, s1: 3, spr: stars(), add: false });
            },
          });
        });
      }
      for (let i = 0; i < cnt(34); i++) {
        after(rand(0, 1.8), () => add({ kind: 'plus', col: pick(['rgba(110,215,150,1)', 'rgba(150,235,190,1)', 'rgba(255,255,255,1)']), x: x + rand(-120, 120), y: y + rand(-40, 60), vx: rand(-10, 10), vy: rand(-110, -50), max: rand(0.9, 1.5), s0: rand(10, 18), s1: 4, add: false, fadeIn: 0.1 }));
      }
      after(0.4, () => text(x - 50, y - 90, '+339', HEAL, { size: 24, outline: 'rgba(255,255,255,.9)' }));
      after(0.9, () => text(x + 50, y - 70, '+339', HEAL, { size: 24, outline: 'rgba(255,255,255,.9)' }));
      after(1.4, () => text(x, y - 120, '元素 +34/s', 'rgb(90,160,230)', { size: 18, vx: 0, outline: 'rgba(255,255,255,.9)' }));
    },

    /* 云霭荫佑：六边形损伤屏障 */
    shield(x, y) {
      const R = Math.min(190, W * 0.3);
      const hold = 2.3;
      effect(hold + 0.5, (e, k) => {
        const tt = e.t;
        const inK = clamp(tt / 0.45, 0, 1);
        const a = tt > hold ? 1 - (tt - hold) / 0.5 : 1;
        drawHexShield(x, y, R * ease.back(inK), tt, a);
        for (let i = 0; i < 12; i++) {
          const an = (i / 12) * TAU + tt * 0.6;
          const s = 60 + 20 * Math.sin(tt * 2 + i);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.55 * a * inK;
          ctx.drawImage(S.white, x + Math.cos(an) * R * ease.back(inK) - s / 2, y + Math.sin(an) * R * 0.95 * ease.back(inK) - s / 2, s, s);
        }
      }, {
        onEnd() {
          for (let i = 0; i < cnt(46); i++) {
            const an = rand(0, TAU), v = rand(160, 460);
            add({ kind: 'rot', x: x + Math.cos(an) * R, y: y + Math.sin(an) * R, vx: Math.cos(an) * v, vy: Math.sin(an) * v, drag: 0.93, ay: 200, max: rand(0.6, 1.1), s0: rand(10, 18), s1: 4, spr: pick([S.hexSky, S.hexWhite]), add: false, rot: rand(0, TAU), vr: rand(-8, 8), fadeIn: 0.01 });
          }
        },
      });
      ring(x, y, { r1: R * 1.25, w0: 10, dur: 0.7, col: 'rgba(120,180,240,1)', add: false });
      after(0.35, () => text(x, y - R - 20, '屏障 2,756', 'rgb(80,150,225)', { size: 24, vx: 0, outline: 'rgba(255,255,255,.95)', max: 1.6 }));
      after(0.5, () => text(x, y + 10, '+339', HEAL, { size: 26, vx: 0, outline: 'rgba(255,255,255,.9)' }));
    },

    /* 火山回响：五连发，彩虹回声遍及全场 */
    echo(x, y) {
      whiteFlash(0.6, 0.45);
      BG.pulse(1);
      const R = Math.hypot(W, H);
      for (let i = 0; i < 5; i++) {
        after(i * 0.26, () => {
          effect(1.7, (e, k) => {
            const kk = ease.out(k);
            rainbowRing(x, y, 20 + R * kk, 4 * (1 - k) + 1, 0.5 * (1 - k), e.t + i);
            ctx.globalAlpha = 0.3 * (1 - k); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, 20 + R * kk * 0.94, 0, TAU); ctx.stroke();
          });
          ashBurst(x, y, 18, [200, 600]);
          const hx = rand(W * 0.1, W * 0.9), hy = rand(H * 0.15, H * 0.85);
          after(0.35, () => {
            ring(hx, hy, { r1: 60, w0: 4, dur: 0.6, col: 'rgba(100,210,150,1)', add: false });
            for (let j = 0; j < 8; j++) add({ kind: 'plus', col: 'rgba(110,215,150,1)', x: hx + rand(-30, 30), y: hy + rand(-20, 20), vx: rand(-10, 10), vy: rand(-90, -40), max: rand(0.8, 1.2), s0: 14, s1: 4, add: false });
            text(hx, hy - 20, '+' + (180 + ((Math.random() * 80) | 0)), HEAL, { size: 24, outline: 'rgba(255,255,255,.9)' });
          });
        });
      }
      shakeIt(4, 1.2);
    },
  };

  function cast(id, rect) {
    const x = rect.left + rect.width / 2, y = rect.top + rect.height * 0.4;
    (casts[id] || casts.chant)(x, y);
  }

  /* ---------------- 职业演示（sim.js）的特效 ----------------
   * 画在全屏特效层上：熔岩从战术地图的画框上方砸下来，爆开的火星、冲击波可以飞出画框。
   * 坐标都是视口坐标，由 sim.js 按地图格子换算好传进来；时长是真实秒数（已除以演示倍速）。 */
  // 粒子预算：特效层已经很满时（职业演示开到高倍速），新爆发按比例减量
  const room = (q = 1) => clamp(1 - P.length / 900, 0.12, 1) * q;
  let simGloom = null;
  const SIM = {
    /** 特效层的负载（职业演示据此决定大数字 / 熔岩要不要交给地图画布） */
    load() { return { p: P.length, e: E.length, t: T.length }; },
    /** 熔岩弹：从画框上方加速砸下，拖着火尾，落地爆开；特效层太满时返回 false（由地图画布自己画） */
    lava(x0, y0, x1, y1, dur, o = {}) {
      if (E.length > 170) return false;
      wake();
      const sz = o.size || 1, q = o.q ?? 1;
      effect(dur, (e, k) => {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 6; i >= 0; i--) {
          const kq = Math.max(0, k - i * 0.035), qq = kq * kq;
          const tx = x0 + (x1 - x0) * qq, ty = y0 + (y1 - y0) * qq, s = (56 - i * 6.5) * sz;
          ctx.globalAlpha = 0.95 - i * 0.12;
          ctx.drawImage(i ? (i > 3 ? S.red : S.ember) : S.gold, tx - s / 2, ty - s / 2, s, s);
        }
        const kk = k * k, px = x0 + (x1 - x0) * kk, py = y0 + (y1 - y0) * kk;
        ctx.globalAlpha = 1;
        ctx.drawImage(S.hot, px - 11 * sz, py - 11 * sz, 22 * sz, 22 * sz);
        if (Math.random() < 0.7 * q) add({ x: px, y: py, vx: rand(-50, 50), vy: rand(-90, -20), max: rand(0.25, 0.55), s0: rand(8, 16) * sz, s1: 1, spr: pick([S.ember, S.gold, S.red]), add: true, fadeIn: 0.01 });
        if (Math.random() < 0.12 * q) add({ x: px, y: py, vx: rand(-15, 15), vy: rand(-30, -5), drag: 0.97, max: rand(0.6, 1), s0: 14 * sz, s1: 44 * sz, a: 0.28, spr: S.smoke, add: false, fadeIn: 0.05 });
      }, { onEnd() { SIM.impact(x1, y1, sz, 16, q); if (o.onEnd) o.onEnd(); } });
      return true;
    },
    /** 熔岩落地：闪光 + 贴地的冲击波 + 向上迸溅的火星（带重力，会越过画框落下）+ 一缕烟 */
    impact(x, y, sz = 1, n = 16, q = 1) {
      wake();
      const k0 = room(q);
      flash(x, y, S.hot, 160 * sz, 0.28);
      flash(x, y, S.ember, 300 * sz, 0.5);
      effect(0.34, (e, k) => {
        const kk = ease.out(k), r = 8 + 62 * sz * kk;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - k) * (1 - k) * 0.6;
        ctx.strokeStyle = 'rgba(255,170,90,1)';
        ctx.lineWidth = Math.max(0.5, 4 * sz * (1 - k));
        ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, r), Math.max(0.1, r * 0.42), 0, 0, TAU); ctx.stroke();
      });
      for (let i = 0, m = Math.round(n * k0); i < m; i++) {
        const a = rand(-Math.PI * 0.96, -Math.PI * 0.04), v = rand(160, 640) * sz;
        add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.965, ay: 950, max: rand(0.5, 1.15), s0: rand(6, 13), s1: 1, a: 0.95, spr: pick([S.ember, S.gold, S.gold, S.hot]), add: true, fadeIn: 0.01 });
      }
      for (let i = 0, m = Math.round(5 * k0); i < m; i++) {
        const a = rand(-Math.PI, 0), v = rand(420, 950);
        add({ kind: 'streak', col: 'rgba(255,205,130,1)', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.9, ay: 700, max: rand(0.22, 0.42), w: rand(1, 2.2), len: 0.035, a: 0.85, add: true, fadeIn: 0.01 });
      }
      if (Math.random() < k0) add({ x, y: y - 8, vx: rand(-15, 15), vy: rand(-45, -20), drag: 0.97, max: rand(1, 1.6), s0: 26 * sz, s1: 70 * sz, a: 0.32, spr: S.smoke, add: false, fadeIn: 0.1 });
    },
    /** 「火山」发动：火柱冲天，冲击波扫出画框 */
    erupt(x, y, o = {}) {
      wake();
      const sz = clamp(o.size || 1, 0.6, 1.3);
      shakeIt(4, 0.5);
      if (window.BG && BG.pulse) BG.pulse(1);
      flash(x, y, S.hot, 320 * sz, 0.5);
      flash(x, y, S.ember, 760 * sz, 1.1);
      ring(x, y, { r1: 560 * sz, w0: 14, dur: 1, col: 'rgba(255,120,50,1)', double: true });
      ring(x, y, { r1: 300 * sz, w0: 6, dur: 0.7, col: 'rgba(255,220,160,1)' });
      effect(1.1, (e, k) => {
        // 一道从脚下冲上天的火柱（越过画框的上沿）
        ctx.globalCompositeOperation = 'lighter';
        const hgt = 620 * sz * ease.out(Math.min(1, k * 2.2)), a = 1 - k;
        for (let i = 0; i < 11; i++) {
          const f = i / 10, s = (130 - f * 76) * sz * (0.8 + 0.4 * Math.sin(e.t * 30 + i));
          ctx.globalAlpha = a * (0.8 - f * 0.45);
          ctx.drawImage(i % 3 ? S.ember : S.red, x - s / 2, y - hgt * f - s / 2, s, s);
        }
        ctx.globalAlpha = a; ctx.drawImage(S.hot, x - 44 * sz, y - 64 * sz, 88 * sz, 88 * sz);
      });
      for (let i = 0, m = Math.round(120 * room()); i < m; i++) {
        const a = -Math.PI / 2 + rand(-0.62, 0.62), v = rand(380, 1200) * sz;
        add({ x: x + rand(-12, 12), y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.975, ay: 720, max: rand(0.9, 1.9), s0: rand(8, 18), s1: 2, a: 0.95, spr: pick([S.ember, S.gold, S.red, S.hot]), add: true, fadeIn: 0.01, fl: rand(6, 14) });
      }
      for (let i = 0; i < 16; i++) add({ x: x + rand(-24, 24), y: y - rand(0, 50), vx: rand(-40, 40), vy: rand(-190, -70), drag: 0.97, max: rand(1.4, 2.6), s0: rand(40, 60) * sz, s1: rand(120, 190) * sz, a: 0.38, spr: S.smoke, add: false, fadeIn: 0.2 });
    },
    /** 火山期间：灰烬与火星从战术地图上方飘落，越过画框落到页面上（el：画框；sec = 0 立即停止） */
    gloom(el, sec) {
      if (simGloom) { simGloom.stop = true; simGloom = null; }
      if (!sec || reduce || !el) return;
      if (!S.ashF) {
        // 灰烬：灰色的薄片带一道还没熄的橙边（深色页面上也看得见）
        S.ashF = mk(24, (g, s) => { g.translate(s / 2, s / 2); g.rotate(0.6); g.fillStyle = 'rgba(150,132,132,.95)'; g.beginPath(); g.ellipse(0, 0, s * 0.42, s * 0.2, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,140,70,.85)'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(0, 0, s * 0.42, s * 0.2, 0, Math.PI * 0.9, Math.PI * 1.9); g.stroke(); });
      }
      wake();
      const me = (simGloom = { stop: false, last: 0, rt: -1, r: null });
      effect(sec, (e) => {
        if (me.stop) { e.t = e.dur; return; }
        if (e.t - me.rt > 0.5) { me.r = el.getBoundingClientRect(); me.rt = e.t; }
        const r = me.r;
        if (!r || r.bottom < 0 || r.top > H || e.t - me.last < 0.07 || P.length > 650) return;
        me.last = e.t;
        const x = rand(r.left - r.width * 0.12, r.right + r.width * 0.12);
        if (Math.random() < 0.72) add({ kind: 'rot', x, y: r.top - rand(10, 60), vx: rand(-8, 30), vy: rand(45, 95), max: rand(2.6, 4.4), s0: rand(7, 13), s1: rand(5, 9), a: 0.85, spr: S.ashF, add: false, rot: rand(0, TAU), vr: rand(-2.5, 2.5), sway: rand(10, 26), swf: rand(1, 2), fadeIn: 0.3 });
        else add({ x, y: rand(r.top + r.height * 0.3, r.bottom), vx: rand(-12, 12), vy: rand(-70, -25), max: rand(1, 2), s0: rand(3, 6), s1: 1, a: 0.85, spr: pick([S.ember, S.gold]), add: true, fl: rand(6, 12), fadeIn: 0.1 });
      });
    },
    /** 部署：一道光柱落下、脚下一圈光（light：纯烬的浅色主题） */
    deploy(x, y, size, light) {
      wake();
      const g1 = light ? S.glowSky : S.glowPink;
      effect(0.8, (e, k) => {
        ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
        const a = (1 - k) * (light ? 0.55 : 0.8), w = size * 0.42 * (1 - k * 0.5), h = size * 3.2 * ease.out(Math.min(1, k * 4));
        ctx.globalAlpha = a;
        ctx.drawImage(g1, x - w, y - h, w * 2, h + w * 0.4);
        ctx.drawImage(S.glowWhite, x - w * 0.4, y - h, w * 0.8, h);
        const r = Math.max(0.1, size * (0.2 + 0.7 * ease.out(clamp(k, 0, 1))));
        ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = light ? 'rgba(90,150,230,1)' : 'rgba(255,150,200,1)'; ctx.lineWidth = 3 * (1 - k) + 0.6;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.38, 0, 0, TAU); ctx.stroke();
      });
      for (let i = 0; i < 16; i++) add({ x: x + rand(-size * 0.3, size * 0.3), y: y - rand(0, size * 0.4), vx: rand(-14, 14), vy: rand(-140, -50), drag: 0.97, max: rand(0.6, 1.2), s0: rand(4, 8), s1: 1, a: 0.85, spr: light ? S.glowSky : S.gold, add: !light, fadeIn: 0.05 });
    },
    /** 无声润物发动：一阵细雨落在她的攻击范围上（x, y：雨区上沿中心；w, h：雨区大小） */
    drizzle(x, y, w, h) {
      wake();
      for (let i = 0; i < 34; i++) {
        after(rand(0, 1.2), () => {
          const px = x + rand(-w / 2, w / 2), ly = y + rand(h * 0.25, h), sy = ly - rand(160, 260), dur = rand(0.25, 0.4);
          effect(dur, (e, k) => {
            const py = sy + (ly - sy) * k;
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.7;
            ctx.strokeStyle = 'rgba(90,160,230,1)'; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.moveTo(px - 2, py - 18); ctx.lineTo(px, py); ctx.stroke();
          }, { onEnd() {
            effect(0.7, (e, k) => {
              ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.6 * (1 - k);
              ctx.strokeStyle = 'rgba(80,150,220,1)'; ctx.lineWidth = 1.2;
              const kq = ease.out(clamp(k, 0, 1)); ctx.beginPath(); ctx.ellipse(px, ly, 3 + 22 * kq, 1 + 6 * kq, 0, 0, TAU); ctx.stroke();
            });
          } });
        });
      }
    },
    /** 火球（点燃 / 法术弹）：抛物线飞行，落点回调 */
    bolt(x0, y0, x1, y1, dur, o = {}) {
      wake();
      const sz = o.size || 1, arc = o.arc ?? 80;
      effect(dur, (e, k) => {
        const kk = ease.inOut(k);
        const px = x0 + (x1 - x0) * kk, py = y0 + (y1 - y0) * kk - Math.sin(Math.PI * k) * arc;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
        ctx.drawImage(o.spr || S.ember, px - 36 * sz, py - 36 * sz, 72 * sz, 72 * sz);
        ctx.drawImage(S.hot, px - 13 * sz, py - 13 * sz, 26 * sz, 26 * sz);
        for (let i = 0; i < 2; i++) add({ x: px, y: py, vx: rand(-40, 40), vy: rand(-40, 30), max: rand(0.25, 0.5), s0: rand(12, 22) * sz, s1: 2, spr: pick([S.ember, S.gold, S.red]), add: true, fadeIn: 0.01 });
      }, { onEnd: o.onEnd });
    },
    /** 点燃爆炸：半径 R 的火环（范围 1.5 格） */
    burst(x, y, R) {
      wake();
      flash(x, y, S.hot, R * 2.2, 0.35);
      flash(x, y, S.ember, R * 3.4, 0.6);
      ring(x, y, { r1: R, w0: 10, dur: 0.55, col: 'rgba(255,160,80,1)', double: true });
      ring(x, y, { r1: R * 2.4, w0: 4, dur: 0.8, a: 0.35, col: 'rgba(255,110,50,1)' });
      for (let i = 0; i < 46; i++) {
        const a = rand(0, TAU), v = rand(140, 640);
        add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, drag: 0.93, ay: 500, max: rand(0.5, 1.1), s0: rand(7, 14), s1: 1, spr: pick([S.ember, S.gold, S.red]), add: true, fadeIn: 0.01 });
      }
      sparkStreaks(x, y, 22);
      smokePuffs(x, y, 8);
      shakeIt(5, 0.25);
    },
    /** 二重咏唱：脚下展开两层符文法阵 */
    runes(x, y, r, second) {
      wake();
      const col = 'rgba(255,170,80,1)';
      effect(1.8, (e) => {
        const inK = clamp(e.t / 0.35, 0, 1), outK = clamp((e.t - 1.3) / 0.5, 0, 1);
        drawRuneCircle(x, y, r * ease.back(inK), e.t * 0.9, (1 - outK) * 0.9, col);
        if (e.t > 0.3) drawRuneCircle(x, y, r * 0.62 * ease.back(clamp((e.t - 0.3) / 0.3, 0, 1)), -e.t * 1.7, (1 - outK), second ? 'rgba(255,90,60,1)' : 'rgba(255,210,140,1)');
      });
      ring(x, y, { r1: r * 1.7, w0: 7, dur: 0.6, col: 'rgba(255,220,150,1)' });
      for (let i = 0; i < 40; i++) {
        const a0 = rand(0, TAU), rr = rand(r * 0.3, r * 1.2);
        add({ x: x + Math.cos(a0) * rr, y: y + Math.sin(a0) * rr * 0.5, vx: -Math.sin(a0) * 110, vy: Math.cos(a0) * 55 - 60, drag: 0.97, max: rand(0.7, 1.4), s0: rand(5, 10), s1: 1, spr: pick([S.gold, S.ember]), add: true, fadeIn: rand(0.05, 0.4) });
      }
    },
    /** 云霭荫佑：六边形屏障在我方头顶展开 */
    shield(x, y, R, hold = 1.6) {
      wake();
      effect(hold + 0.5, (e) => {
        const inK = clamp(e.t / 0.4, 0, 1), a = e.t > hold ? 1 - (e.t - hold) / 0.5 : 1;
        drawHexShield(x, y, R * ease.back(inK), e.t, a * 0.9);
      }, {
        onEnd() {
          for (let i = 0; i < 30; i++) {
            const an = rand(0, TAU), v = rand(160, 420);
            add({ kind: 'rot', x: x + Math.cos(an) * R, y: y + Math.sin(an) * R, vx: Math.cos(an) * v, vy: Math.sin(an) * v, drag: 0.93, ay: 200, max: rand(0.6, 1.1), s0: rand(10, 16), s1: 4, spr: pick([S.hexSky, S.hexWhite]), add: false, rot: rand(0, TAU), vr: rand(-8, 8), fadeIn: 0.01 });
          }
        },
      });
      ring(x, y, { r1: R * 1.4, w0: 9, dur: 0.7, col: 'rgba(120,180,240,1)', add: false });
    },
    /** 火山回响：彩虹回声一圈圈扫过整个屏幕 */
    echo(x, y, n = 3) {
      wake();
      whiteFlash(0.5, 0.35);
      if (window.BG && BG.pulse) BG.pulse(1);
      const R = Math.hypot(W, H);
      for (let i = 0; i < n; i++) {
        after(i * 0.22, () => {
          effect(1.6, (e, k) => {
            const kk = ease.out(k);
            rainbowRing(x, y, 20 + R * kk, 4 * (1 - k) + 1, 0.5 * (1 - k), e.t + i);
          });
          ashBurst(x, y, 16, [200, 600]);
        });
      }
      shakeIt(3, 0.8);
    },
    /** 每一轮 5 连发时的小回声 */
    ping(x, y, r) {
      wake();
      effect(0.8, (e, k) => rainbowRing(x, y, 10 + r * ease.out(k), 3 * (1 - k) + 0.6, 0.45 * (1 - k), e.t));
    },
    /** 治疗落点：绿色十字与光点向上飘 */
    heal(x, y, big) {
      wake();
      ring(x, y, { r1: big ? 46 : 30, w0: 3, dur: 0.5, col: 'rgba(100,210,150,1)', add: false });
      for (let j = 0; j < (big ? 8 : 4); j++) add({ kind: 'plus', col: pick(['rgba(110,215,150,1)', 'rgba(150,235,190,1)', 'rgba(255,255,255,1)']), x: x + rand(-18, 18), y: y + rand(-10, 10), vx: rand(-10, 10), vy: rand(-90, -40), max: rand(0.7, 1.1), s0: rand(9, 14), s1: 3, add: false, fadeIn: 0.05 });
    },
    /** 灼燃爆发：火柱 + 火星 */
    flame(x, y) {
      wake();
      flash(x, y, S.hot, 160, 0.3);
      flash(x, y, S.red, 320, 0.6);
      for (let i = 0; i < 36; i++) {
        const a = -Math.PI / 2 + rand(-0.5, 0.5), v = rand(200, 620);
        add({ x: x + rand(-10, 10), y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.95, ay: 500, max: rand(0.5, 1), s0: rand(10, 20), s1: 2, spr: pick([S.ember, S.red, S.gold]), add: true, fadeIn: 0.01 });
      }
      smokePuffs(x, y, 5);
      shakeIt(4, 0.2);
    },
    text,
  };

  /* ---------------- 主循环 ---------------- */
  function resize() {
    // 粒子都是柔光精灵，1.25 倍清晰度足够；全屏 2D 画布的像素量随 DPR 平方增长
    dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    W = innerWidth; H = innerHeight;
    cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawn = true;
  }

  // 60 帧封顶（高刷显示器上不跟着 144/165 Hz 空转）；画面为空时不重绘
  const FRAME = 1000 / 60 - 1.5;
  let lastFrame = 0, drawn = true, raf = 0;
  function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  // 只剩环境粒子（缓慢飘动的余烬 / 灰羽）时 30 帧就够，全屏画布少画一半；有特效、文字、拖尾时回到 60 帧
  const ambientOnly = () => {
    if (E.length || T.length || (app && shake.t < shake.dur)) return false;
    for (let i = 0; i < P.length; i++) if (!P[i].ambient) return false;
    return true;
  };
  /** 暂停 / 恢复整个前景特效层（例如 MV 全屏放映时，页面根本看不见） */
  let held = false;
  function hold(on) {
    held = !!on;
    if (held) { if (raf) cancelAnimationFrame(raf); raf = 0; }
    else wake();
  }
  function loop(now) {
    raf = 0;
    if (document.hidden || held) return;
    raf = requestAnimationFrame(loop);
    if (now - lastFrame < (ambientOnly() ? 1000 / 30 - 1.5 : FRAME)) return;
    lastFrame = now;
    const dt = clamp((now - last) / 1000, 0, 0.05); // rAF 的时间戳可能早于 wake() 里记下的 performance.now()：别让 dt 变成负数（负的 k 会让圆弧半径为负而报错）
    last = now;
    const busy = P.length || E.length || T.length || (app && shake.t < shake.dur);
    if (!busy) {
      if (drawn) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); drawn = false; }
      tickAmbient(dt);
      return;
    }
    drawn = true;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    tickAmbient(dt);
    updateParticles(dt);
    drawParticles(false);
    drawParticles(true);
    for (let i = E.length - 1; i >= 0; i--) {
      const e = E[i];
      e.t += dt;
      const k = Math.min(1, e.t / e.dur);
      if (e.draw) { ctx.save(); e.draw(e, k); ctx.restore(); }
      if (e.t >= e.dur) { E.splice(i, 1); if (e.onEnd) e.onEnd(); }
    }
    ctx.globalAlpha = 1;
    drawTexts(dt);
    if (app) {
      if (shake.t < shake.dur) {
        shake.t += dt;
        const k = 1 - shake.t / shake.dur;
        const a = shake.amp * k;
        app.style.transform = `translate3d(${rand(-a, a).toFixed(1)}px, ${rand(-a, a).toFixed(1)}px, 0)`;
        if (shake.t >= shake.dur) { app.style.transform = ''; shake.amp = 0; }
      }
    }
  }

  function init(canvas, f, appEl) {
    cv = canvas; ctx = cv.getContext('2d'); form = f; app = appEl;
    buildSprites();
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    for (let i = 0; i < ambientTarget() * 0.8; i++) spawnAmbient(true);
    wake();
  }

  function setForm(f) {
    form = f;
    for (const p of P) if (p.ambient) p.max = Math.min(p.max, p.life + rand(0.3, 1.2));
    setTimeout(() => { for (let i = 0; i < ambientTarget() * 0.6; i++) spawnAmbient(true); }, 500);
  }

  return { init, setForm, pointer: onPointer, click: onClick, formBurst, cast, shake: shakeIt, text, ring, emberBurst, ashBurst, sim: SIM, hold };
})();
