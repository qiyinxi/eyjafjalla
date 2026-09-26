/* =========================================================
 * MV 引擎（本页原创的实时渲染 MV）
 *
 * 设计原则
 *  - 画面是时间的纯函数：render(t) 只由 t 决定（粒子、镜头、字幕都从 t 推出来），
 *    所以可以任意拖动进度、在实验页里单独渲染任意一帧、离线测每个镜头的开销
 *  - 所有镜头都画在 1920×1080 的“设计坐标”里，引擎按实际分辨率缩放
 *  - 静态的大图层（天空、远山、建筑）用 s.cache() 预渲染成位图，每帧只贴图
 *  - 不用 shadowBlur / filter；发光用预渲染的柔光精灵 + 'lighter' 叠加
 *
 * 用法（影片脚本，见 js/mv/films/*.js 与 js/mv/BIBLE.md）
 *   MVE.film({ id, title, audio, analysis, shots: [{ id, t0, t1, title, in, draw(g, s) }], captions: [...] })
 *   const r = MVE.renderer(canvas, film, analysis);  await r.prepare();  r.render(t);
 * ========================================================= */
window.MVE = (() => {
  'use strict';
  const VW = 1920, VH = 1080;
  const TAU = Math.PI * 2;

  /* ---------------- 数学与缓动 ---------------- */
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (e0, e1, x) => { const k = clamp((x - e0) / (e1 - e0)); return k * k * (3 - 2 * k); };
  const ease = {
    lin: (k) => k,
    in: (k) => k * k * k,
    out: (k) => 1 - Math.pow(1 - k, 3),
    inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    sine: (k) => 0.5 - 0.5 * Math.cos(Math.PI * k),
    expo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    back: (k) => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2),
    elastic: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (TAU / 3)) + 1),
    bounce: (k) => { const n = 7.5625, d = 2.75; if (k < 1 / d) return n * k * k; if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75; if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375; return n * (k -= 2.625 / d) * k + 0.984375; },
  };
  /** 区间 [a, b] 内的进度（0..1），可选缓动 */
  const span = (x, a, b, e) => { const k = clamp((x - a) / (b - a)); return e ? (ease[e] || e)(k) : k; };
  /** 进入 → 保持 → 退出：在 [a, b] 里先用 fi 秒淡入、最后 fo 秒淡出 */
  const window01 = (x, a, b, fi = 0.4, fo = fi) => Math.min(span(x, a, a + fi), 1 - span(x, b - fo, b));

  /* ---------------- 确定性随机 ---------------- */
  function hashInt(n) {
    n |= 0; n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15;
    return (n >>> 0) / 4294967296;
  }
  /** hash(seed, i, k)：同样的参数永远得到同样的 0..1 */
  const hash = (seed, i = 0, k = 0) => hashInt(Math.imul(seed | 0, 73856093) ^ Math.imul(i | 0, 19349663) ^ Math.imul(k | 0, 83492791));
  /** 可连续取值的伪随机序列（mulberry32），只在预渲染里用 */
  function rng(seed) {
    let a = (seed | 0) || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** 平滑的一维噪声（值噪声 + 余弦插值），用于摆动、风、手持镜头 */
  function noise1(seed, x) { const i = Math.floor(x), f = x - i; const a = hash(seed, i), b = hash(seed, i + 1); const u = 0.5 - 0.5 * Math.cos(Math.PI * f); return a + (b - a) * u; }
  /** 多层噪声：-1..1 */
  const wobble = (seed, x, oct = 3) => { let v = 0, amp = 1, sum = 0; for (let o = 0; o < oct; o++) { v += (noise1(seed + o * 131, x * (1 << o)) * 2 - 1) * amp; sum += amp; amp *= 0.5; } return v / sum; };

  /* ---------------- 歌曲时间轴（来自 lab/audio-analyze.html 的分析结果） ---------------- */
  function timing(an) {
    const B = an.beats, D = an.downbeats, P = 60 / an.tempo;
    const env = an.env, R = env.rate;
    const find = (arr, t) => { let lo = 0, hi = arr.length - 1; if (t < arr[0]) return -1; if (t >= arr[hi]) return hi; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m; else hi = m; } return lo; };
    const idxAt = (arr, t, per) => {
      if (!arr.length) return t / per;
      const i = find(arr, t);
      if (i < 0) return (t - arr[0]) / per;
      if (i >= arr.length - 1) return i + (t - arr[i]) / per;
      return i + (t - arr[i]) / (arr[i + 1] - arr[i]);
    };
    // 平滑后的包络（0.6 秒窗）：画面联动不要跟着每一下抖
    const sm = {};
    for (const k of Object.keys(env)) {
      if (!Array.isArray(env[k])) continue;
      const a = env[k], w = Math.round(R * 0.3), out = new Float32Array(a.length);
      let s = 0; const q = [];
      for (let i = 0; i < a.length + w; i++) {
        if (i < a.length) { s += a[i]; q.push(a[i]); }
        if (q.length > 2 * w + 1) s -= q.shift();
        const j = i - w; if (j >= 0 && j < a.length) out[j] = s / q.length / 255;
      }
      sm[k] = out;
    }
    const sample = (arr, t, div = 255) => { if (!arr) return 0; const x = t * R, i = Math.floor(x); if (i < 0) return arr[0] / div; if (i >= arr.length - 1) return arr[arr.length - 1] / div; const f = x - i; return (arr[i] + (arr[i + 1] - arr[i]) * f) / div; };
    const acc = an.accents || [];
    const accTimes = acc.map((a) => a[0]);
    const accMax = acc.reduce((m, a) => Math.max(m, a[1]), 1);
    return {
      tempo: an.tempo, period: P, duration: an.duration, beats: B, downbeats: D,
      beatAt: (t) => idxAt(B, t, P),
      barAt: (t) => idxAt(D, t, P * 4),
      beatTime: (i) => (i < 0 ? B[0] + i * P : i >= B.length ? B[B.length - 1] + (i - B.length + 1) * P : B[i]),
      barTime: (i) => (i < 0 ? D[0] + i * P * 4 : i >= D.length ? D[D.length - 1] + (i - D.length + 1) * P * 4 : D[i]),
      /** 原始包络（0..1）：rms / low / mid / high / onset */
      raw: (key, t) => sample(env[key], t),
      /** 平滑包络（0..1） */
      env: (key, t) => sample(sm[key], t, 1),
      /** 重音脉冲：最近一次重音按 decay 秒衰减（0..1） */
      accent(t, decay = 0.25) {
        let i = find(accTimes, t), v = 0;
        for (let k = i; k >= 0 && t - accTimes[k] < decay * 5; k--) v = Math.max(v, (acc[k][1] / accMax) * Math.exp(-(t - accTimes[k]) / decay));
        return v;
      },
    };
  }

  /* ---------------- 精灵：柔光点、噪点、暗角 ---------------- */
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  const glowCache = new Map();
  /** 柔光精灵（128px，中心白 → color → 透明），color 用 'r,g,b' */
  function glowSprite(rgb, hot = true) {
    const key = rgb + (hot ? '*' : '');
    let c = glowCache.get(key);
    if (c) return c;
    c = mk(128, 128);
    const q = c.getContext('2d'), gr = q.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, hot ? 'rgba(255,255,255,1)' : `rgba(${rgb},1)`);
    gr.addColorStop(0.2, `rgba(${rgb},0.85)`);
    gr.addColorStop(0.5, `rgba(${rgb},0.28)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    q.fillStyle = gr; q.fillRect(0, 0, 128, 128);
    glowCache.set(key, c);
    return c;
  }
  /** 在 (x, y) 画一个半径 r 的柔光（默认叠加模式） */
  function glow(g, x, y, r, rgb, a = 1, mode = 'lighter', hot = true) {
    if (a <= 0.003 || r <= 0) return;
    const pm = g.globalCompositeOperation, pa = g.globalAlpha;
    g.globalCompositeOperation = mode; g.globalAlpha = pa * clamp(a);
    g.drawImage(glowSprite(rgb, hot), x - r, y - r, r * 2, r * 2);
    g.globalCompositeOperation = pm; g.globalAlpha = pa;
  }
  let grainTiles = null;
  function grainTilesGet() {
    if (grainTiles) return grainTiles;
    grainTiles = [];
    for (let v = 0; v < 4; v++) {
      const c = mk(256, 256), q = c.getContext('2d'), im = q.createImageData(256, 256), R = rng(97 + v * 13);
      for (let i = 0; i < im.data.length; i += 4) { const n = R(); const l = n < 0.5 ? 0 : 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = l; im.data[i + 3] = Math.abs(n - 0.5) * 2 * 255 * (R() < 0.6 ? 1 : 0.3); }
      q.putImageData(im, 0, 0);
      grainTiles.push(c);
    }
    return grainTiles;
  }

  /* ---------------- 文字 ---------------- */
  const FONT = {
    serif: '"Noto Serif SC", "Songti SC", "SimSun", serif',
    sans: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
    display: 'Cinzel, "Times New Roman", serif',
    mono: '"JetBrains Mono", Consolas, monospace',
    hand: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
  };
  /**
   * text(g, str, x, y, { size, font, weight, color, align, base, alpha, spacing, stroke, strokeW, italic, maxW })
   * spacing 为字距（px），stroke 为描边色（先描边后填充）
   */
  function text(g, str, x, y, o = {}) {
    const size = o.size || 40;
    g.save();
    g.font = `${o.italic ? 'italic ' : ''}${o.weight || 400} ${size}px ${FONT[o.font] || o.font || FONT.serif}`;
    g.textAlign = o.align || 'center';
    g.textBaseline = o.base || 'alphabetic';
    if ('letterSpacing' in g) g.letterSpacing = (o.spacing || 0) + 'px';
    if (o.alpha != null) g.globalAlpha *= clamp(o.alpha);
    if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.strokeW || size * 0.12; g.strokeStyle = o.stroke; g.strokeText(str, x, y, o.maxW); }
    g.fillStyle = o.color || '#fff';
    g.fillText(str, x, y, o.maxW);
    g.restore();
  }
  function measure(g, str, o = {}) {
    g.save();
    g.font = `${o.italic ? 'italic ' : ''}${o.weight || 400} ${o.size || 40}px ${FONT[o.font] || o.font || FONT.serif}`;
    if ('letterSpacing' in g) g.letterSpacing = (o.spacing || 0) + 'px';
    const w = g.measureText(str).width;
    g.restore();
    return w;
  }

  /* ---------------- 确定性粒子场 ----------------
   * field(g, t, {
   *   n: 数量, seed, every: 相邻两颗的出生间隔（秒）, life: 寿命（秒，或 (r) => 秒）, t0: 开始时间, t1: 停止出生的时间,
   *   loop: true（循环出生）, jitter: 出生时间抖动（0..1）,
   *   make(r, i, cycle) → 粒子初值对象 p（r(k) 给出这一颗的第 k 个随机数）,
   *   draw(g, p, age, k, i)  k = age / life
   * })
   * 位置请在 draw 里按 age 解析地算（x = p.x + p.vx * age + ...），不要累加状态
   */
  function field(g, t, o) {
    const n = o.n | 0, every = o.every || 0.1, t0 = o.t0 || 0, cyc = Math.max(n * every, 1e-6), seed = o.seed || 1;
    for (let i = 0; i < n; i++) {
      const off = i * every + hash(seed, i, 99) * every * (o.jitter ?? 1);
      let rel = t - t0 - off;
      // prewarm：循环粒子场在 t0 之前就已经“下了一阵”（开场不会从空白开始）
      if (rel < 0 && (o.loop === false || !o.prewarm)) continue;
      let cycle = 0;
      if (o.loop !== false) { cycle = Math.floor(rel / cyc); rel -= cycle * cyc; }
      const birth = t - rel;
      if (o.t1 != null && birth > o.t1) continue;
      const r = (k) => hash(seed, i * 64 + k, cycle);
      const life = typeof o.life === 'function' ? o.life(r) : o.life || 2;
      if (rel > life) continue;
      const p = o.make ? o.make(r, i, cycle) : {};
      o.draw(g, p, rel, rel / life, i);
    }
  }

  /* ---------------- 镜头（相机）与视差 ----------------
   * cam = { x, y, z, r, sx, sy }：看向设计坐标 (x, y)，缩放 z，旋转 r（弧度），抖动 sx/sy（像素）
   * layer(g, cam, depth, fn)：depth=0 固定不动（天空），1 为焦平面，>1 为前景（移动更快）
   */
  const CAM0 = { x: VW / 2, y: VH / 2, z: 1, r: 0, sx: 0, sy: 0 };
  function layer(g, cam, depth, fn) {
    const c = cam || CAM0;
    const z = 1 + ((c.z ?? 1) - 1) * depth;
    g.save();
    g.translate(VW / 2 + (c.sx || 0) * depth, VH / 2 + (c.sy || 0) * depth);
    if (c.r) g.rotate(c.r * Math.min(1, depth));
    g.scale(z, z);
    g.translate(-VW / 2 - ((c.x ?? VW / 2) - VW / 2) * depth, -VH / 2 - ((c.y ?? VH / 2) - VH / 2) * depth);
    fn(g);
    g.restore();
  }
  /** 手持感：给镜头加一点慢漂移（amp 像素） */
  const handheld = (seed, t, amp = 6, speed = 0.35) => ({ sx: wobble(seed, t * speed) * amp, sy: wobble(seed + 7, t * speed) * amp * 0.7 });

  /* ---------------- 常用场景件（kit） ---------------- */
  const kit = {
    /** 竖直渐变天空（stops: [[0,'#123'],[1,'#456']]） */
    sky(g, stops, x = 0, y = 0, w = VW, h = VH) {
      const gr = g.createLinearGradient(0, y, 0, y + h);
      for (const [o, c] of stops) gr.addColorStop(o, c);
      g.fillStyle = gr; g.fillRect(x, y, w, h);
    },
    /** 星空：n 颗，确定性位置，带闪烁 */
    stars(g, t, { n = 180, seed = 5, x = 0, y = 0, w = VW, h = VH * 0.6, size = 2.2, color = '255,255,255', tw = 1 } = {}) {
      for (let i = 0; i < n; i++) {
        const sx = x + hash(seed, i, 1) * w, sy = y + Math.pow(hash(seed, i, 2), 1.4) * h, s = size * (0.35 + hash(seed, i, 3) * 0.9);
        const a = (0.35 + 0.65 * hash(seed, i, 4)) * (1 - tw * 0.5 * (1 + Math.sin(t * (1 + hash(seed, i, 5) * 3) + i)));
        if (s > 1.6) glow(g, sx, sy, s * 3.2, color, a * 0.6);
        g.globalAlpha = clamp(a); g.fillStyle = `rgb(${color})`; g.fillRect(sx - s / 2, sy - s / 2, s, s); g.globalAlpha = 1;
      }
    },
    /** 一朵柔软的云（预渲染精灵）：返回画布，按需缓存 */
    cloudSprite(seed, w = 520, h = 220, top = '#ffffff', bottom = '#d9e2f2') {
      const key = `cloud:${seed}:${w}:${h}:${top}:${bottom}`;
      let c = spriteCache.get(key);
      if (c) return c;
      c = mk(w, h);
      const q = c.getContext('2d'), R = rng(seed);
      const gr = q.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, bottom);
      q.fillStyle = gr;
      const n = 9 + Math.floor(R() * 6);
      for (let i = 0; i < n; i++) {
        const cx = w * (0.14 + 0.72 * R()), cy = h * (0.46 + 0.22 * R()), rr = h * (0.18 + 0.2 * R()) * (1 - Math.abs(cx / w - 0.5));
        q.beginPath(); q.arc(cx, cy - rr * 0.2, rr * 1.3, 0, TAU); q.fill();
      }
      q.fillRect(w * 0.1, h * 0.62, w * 0.8, h * 0.18);
      // 底边压平、边缘柔化
      q.globalCompositeOperation = 'destination-in';
      const fade = q.createLinearGradient(0, h * 0.55, 0, h * 0.86); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
      q.fillStyle = fade; q.fillRect(0, 0, w, h);
      spriteCache.set(key, c);
      return c;
    },
    /** 一团雾（预渲染精灵，径向柔边） */
    fogSprite(rgb = '255,255,255') {
      const key = 'fog:' + rgb;
      let c = spriteCache.get(key);
      if (c) return c;
      c = mk(256, 128);
      const q = c.getContext('2d');
      q.scale(1, 0.5);
      const gr = q.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, `rgba(${rgb},0.55)`); gr.addColorStop(0.55, `rgba(${rgb},0.22)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      q.fillStyle = gr; q.fillRect(0, 0, 256, 256);
      spriteCache.set(key, c);
      return c;
    },
    /** 漂移的雾带：n 团，y 在 [y0, y1]，横向循环漂移 */
    fog(g, t, { n = 14, seed = 3, y0 = VH * 0.55, y1 = VH, w = 900, h = 360, speed = 18, rgb = '255,255,255', alpha = 0.6 } = {}) {
      const spr = kit.fogSprite(rgb);
      const span = VW + w * 2;
      for (let i = 0; i < n; i++) {
        const sp = speed * (0.5 + hash(seed, i, 1));
        const x = ((hash(seed, i, 2) * span + t * sp) % span) - w;
        const y = y0 + (y1 - y0) * hash(seed, i, 3) + Math.sin(t * 0.2 + i) * 12;
        const s = 0.6 + hash(seed, i, 4) * 0.9;
        g.globalAlpha = alpha * (0.5 + 0.5 * hash(seed, i, 5));
        g.drawImage(spr, x, y - (h * s) / 2, w * s, h * s);
      }
      g.globalAlpha = 1;
    },
    /** 丁达尔光：从 (x, y) 向下散开的几道光束 */
    rays(g, t, { x = VW * 0.7, y = -60, n = 7, len = 1400, spread = 0.9, angle = Math.PI / 2 + 0.25, rgb = '255,236,200', alpha = 0.18, seed = 9 } = {}) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const a = angle + (hash(seed, i, 1) - 0.5) * spread, wdt = 0.02 + hash(seed, i, 2) * 0.05;
        const flick = 0.55 + 0.45 * Math.sin(t * (0.3 + hash(seed, i, 3)) + i * 1.7);
        const gr = g.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
        gr.addColorStop(0, `rgba(${rgb},${alpha * flick})`); gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(x, y);
        g.lineTo(x + Math.cos(a - wdt) * len, y + Math.sin(a - wdt) * len);
        g.lineTo(x + Math.cos(a + wdt) * len, y + Math.sin(a + wdt) * len);
        g.closePath(); g.fill();
      }
      g.restore();
    },
    /** 常用粒子预设：'snow' | 'ash' | 'embers' | 'petals' | 'fireflies' | 'bubbles' | 'dust' | 'rain' | 'sparkle' */
    particles(g, t, type, o = {}) {
      const P = PRESETS[type];
      if (!P) return;
      field(g, t, Object.assign({}, P, o, { make: o.make || P.make, draw: o.draw || P.draw }));
    },
  };
  const spriteCache = new Map();
  /** 花瓣精灵 */
  function petalSprite(rgb) {
    const key = 'petal:' + rgb;
    let c = spriteCache.get(key); if (c) return c;
    c = mk(48, 48); const q = c.getContext('2d');
    q.translate(24, 24); q.fillStyle = `rgb(${rgb})`;
    q.beginPath(); q.moveTo(0, -20); q.bezierCurveTo(14, -12, 12, 12, 0, 20); q.bezierCurveTo(-12, 12, -14, -12, 0, -20); q.fill();
    q.globalAlpha = 0.35; q.fillStyle = '#fff'; q.beginPath(); q.ellipse(-3, -6, 3, 9, 0.3, 0, TAU); q.fill();
    spriteCache.set(key, c); return c;
  }
  const PRESETS = {
    snow: { n: 160, every: 0.04, life: 7, seed: 11,
      make: (r) => ({ x: r(1) * (VW + 200) - 100, y: -30, vy: 90 + r(2) * 120, drift: 30 + r(3) * 60, s: 2 + r(4) * 5, ph: r(5) * TAU }),
      draw: (g, p, age, k) => { const x = p.x + Math.sin(age * 1.3 + p.ph) * p.drift, y = p.y + p.vy * age; g.globalAlpha = 0.8 * Math.min(1, age * 2) * (1 - k * k); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, p.s, 0, TAU); g.fill(); g.globalAlpha = 1; } },
    ash: { n: 140, every: 0.05, life: 8, seed: 12,
      make: (r) => ({ x: r(1) * (VW + 300) - 150, y: -40, vy: 40 + r(2) * 70, vx: 20 + r(3) * 50, s: 3 + r(4) * 6, rot: r(5) * TAU, spin: (r(6) - 0.5) * 2, g: 0.75 + r(7) * 0.25 }),
      draw: (g, p, age, k) => { const x = p.x + p.vx * age + Math.sin(age + p.rot) * 20, y = p.y + p.vy * age; g.save(); g.translate(x, y); g.rotate(p.rot + p.spin * age); g.globalAlpha = 0.75 * Math.min(1, age) * (1 - k * k); const l = Math.round(255 * p.g); g.fillStyle = `rgb(${l},${l},${l})`; g.fillRect(-p.s / 2, -p.s * 0.3, p.s, p.s * 0.6); g.restore(); } },
    embers: { n: 90, every: 0.05, life: 3.2, seed: 13,
      make: (r) => ({ x: r(1) * VW, y: VH + 20, vy: -(160 + r(2) * 260), vx: (r(3) - 0.5) * 80, s: 5 + r(4) * 12, ph: r(5) * TAU }),
      draw: (g, p, age, k) => { const x = p.x + p.vx * age + Math.sin(age * 3 + p.ph) * 18, y = p.y + p.vy * age; glow(g, x, y, p.s * (1 - k * 0.6), '255,140,60', (1 - k) * 0.9); } },
    petals: { n: 70, every: 0.08, life: 8, seed: 14, rgb: '255,170,190',
      make: (r) => ({ x: r(1) * (VW + 400) - 200, y: -40, vy: 70 + r(2) * 90, vx: 60 + r(3) * 90, s: 14 + r(4) * 14, rot: r(5) * TAU, spin: 1 + r(6) * 2.5, ph: r(7) * TAU }),
      draw(g, p, age, k) { const x = p.x + p.vx * age + Math.sin(age * 1.6 + p.ph) * 40, y = p.y + p.vy * age; g.save(); g.translate(x, y); g.rotate(p.rot + p.spin * age); g.scale(1, Math.abs(Math.sin(age * p.spin + p.ph)) * 0.8 + 0.2); g.globalAlpha = Math.min(1, age * 2) * (1 - k * k); g.drawImage(petalSprite(this.rgb || '255,170,190'), -p.s / 2, -p.s / 2, p.s, p.s); g.restore(); } },
    fireflies: { n: 50, every: 0.12, life: 6, seed: 15, rgb: '255,230,150',
      make: (r) => ({ x: r(1) * VW, y: VH * (0.3 + r(2) * 0.6), ax: 60 + r(3) * 90, ay: 30 + r(4) * 60, f: 0.2 + r(5) * 0.4, ph: r(6) * TAU, s: 8 + r(7) * 10 }),
      draw(g, p, age, k) { const x = p.x + Math.sin(age * p.f * TAU + p.ph) * p.ax, y = p.y + Math.cos(age * p.f * 1.3 * TAU + p.ph) * p.ay - age * 10; const a = Math.sin(Math.PI * k) * (0.5 + 0.5 * Math.sin(age * 4 + p.ph)); glow(g, x, y, p.s, this.rgb || '255,230,150', a); } },
    bubbles: { n: 60, every: 0.07, life: 4, seed: 16,
      make: (r) => ({ x: r(1) * VW, y: VH + 20, vy: -(90 + r(2) * 160), s: 4 + r(3) * 14, ph: r(4) * TAU }),
      draw: (g, p, age, k) => { const x = p.x + Math.sin(age * 3 + p.ph) * 10, y = p.y + p.vy * age; g.globalAlpha = 0.7 * Math.sin(Math.PI * k); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, p.s, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(x - p.s * 0.35, y - p.s * 0.35, p.s * 0.22, 0, TAU); g.fill(); g.globalAlpha = 1; } },
    dust: { n: 80, every: 0.1, life: 8, seed: 17, rgb: '255,240,210',
      make: (r) => ({ x: r(1) * VW, y: r(2) * VH, vx: (r(3) - 0.5) * 20, vy: -5 - r(4) * 12, s: 1.5 + r(5) * 3.5, ph: r(6) * TAU }),
      draw(g, p, age, k) { const x = p.x + p.vx * age + Math.sin(age * 0.7 + p.ph) * 14, y = p.y + p.vy * age; glow(g, x, y, p.s * 3, this.rgb || '255,240,210', Math.sin(Math.PI * k) * 0.8); } },
    rain: { n: 220, every: 0.006, life: 0.8, seed: 18,
      make: (r) => ({ x: r(1) * (VW + 300), y: -80 + r(2) * 200, v: 1500 + r(3) * 700, l: 26 + r(4) * 30 }),
      draw: (g, p, age) => { const x = p.x - age * 260, y = p.y + p.v * age; g.strokeStyle = 'rgba(200,220,255,.55)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + p.l * 0.17, y - p.l); g.stroke(); } },
    sparkle: { n: 40, every: 0.09, life: 1.6, seed: 19, rgb: '255,250,220',
      make: (r) => ({ x: r(1) * VW, y: r(2) * VH, s: 10 + r(3) * 24, rot: r(4) * TAU }),
      draw(g, p, age, k) { const a = Math.sin(Math.PI * k); const s = p.s * (0.5 + 0.5 * a); glow(g, p.x, p.y, s * 1.4, this.rgb || '255,250,220', a * 0.8); g.save(); g.translate(p.x, p.y); g.rotate(p.rot + age); g.globalAlpha = a; g.fillStyle = '#fff'; g.beginPath(); for (let j = 0; j < 4; j++) { const an = (j * TAU) / 4; g.lineTo(Math.cos(an) * s, Math.sin(an) * s); g.lineTo(Math.cos(an + Math.PI / 4) * s * 0.18, Math.sin(an + Math.PI / 4) * s * 0.18); } g.closePath(); g.fill(); g.restore(); } },
  };

  /* ---------------- 后期：暗角、胶片颗粒、黑边、闪白、调色 ---------------- */
  const post = {
    vignette(g, a = 0.55, rgb = '0,0,0') {
      const key = 'vig:' + rgb;
      let c = spriteCache.get(key);
      if (!c) {
        c = mk(480, 270); const q = c.getContext('2d');
        const gr = q.createRadialGradient(240, 135, 60, 240, 135, 290);
        gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.6, `rgba(${rgb},0.25)`); gr.addColorStop(1, `rgba(${rgb},1)`);
        q.fillStyle = gr; q.fillRect(0, 0, 480, 270); spriteCache.set(key, c);
      }
      g.save(); g.globalAlpha = a; g.drawImage(c, 0, 0, VW, VH); g.restore();
    },
    grain(g, t, a = 0.06, fps = 24) {
      const tiles = grainTilesGet(), f = Math.floor(t * fps), tile = tiles[f % 4];
      const ox = (hash(3, f) * 256) | 0, oy = (hash(4, f) * 256) | 0;
      g.save(); g.globalAlpha = a; g.globalCompositeOperation = 'overlay';
      for (let y = -oy; y < VH; y += 256) for (let x = -ox; x < VW; x += 256) g.drawImage(tile, x, y, 256, 256);
      g.restore();
    },
    /** 电影黑边：k=1 时为 2.35:1 */
    letterbox(g, k = 1, color = '#000') {
      if (k <= 0) return;
      const h = ((VH - VW / 2.35) / 2) * clamp(k);
      g.fillStyle = color; g.fillRect(0, 0, VW, h); g.fillRect(0, VH - h, VW, h);
    },
    fill(g, color, a = 1, mode = 'source-over') {
      if (a <= 0.003) return;
      g.save(); g.globalAlpha = clamp(a); g.globalCompositeOperation = mode; g.fillStyle = color; g.fillRect(0, 0, VW, VH); g.restore();
    },
    /** 调色：用柔光 / 叠加 / 正片叠底铺一层颜色 */
    grade(g, color, a = 0.25, mode = 'soft-light') { post.fill(g, color, a, mode); },
    /** 漏光：边缘一团暖光 */
    leak(g, t, { x = VW * 0.9, y = VH * 0.1, r = 900, rgb = '255,170,90', a = 0.35, seed = 21 } = {}) {
      const k = 0.6 + 0.4 * wobble(seed, t * 0.3);
      glow(g, x + wobble(seed + 1, t * 0.2) * 120, y + wobble(seed + 2, t * 0.2) * 80, r * (0.8 + 0.2 * k), rgb, a * k, 'screen', false);
    },
  };

  /* ---------------- 转场 ---------------- */
  // 每种转场：(g, A, B, k, o) → 把两张帧缓冲 A（旧镜头）与 B（新镜头）按进度 k 合成到 g（设计坐标）
  function jagged(seed, n, amp) { const pts = []; for (let i = 0; i <= n; i++) pts.push((hash(seed, i) - 0.5) * amp); return pts; }
  const TRANS = {
    fade(g, A, B, k) { g.drawImage(A, 0, 0, VW, VH); g.globalAlpha = ease.sine(k); g.drawImage(B, 0, 0, VW, VH); g.globalAlpha = 1; },
    black(g, A, B, k, o) { const c = o.color || '#000'; if (k < 0.5) { g.drawImage(A, 0, 0, VW, VH); post.fill(g, c, ease.sine(k * 2)); } else { g.drawImage(B, 0, 0, VW, VH); post.fill(g, c, 1 - ease.sine((k - 0.5) * 2)); } },
    white(g, A, B, k, o) { TRANS.black(g, A, B, k, { color: o.color || '#fff' }); },
    flash(g, A, B, k, o) { g.drawImage(k < 0.25 ? A : B, 0, 0, VW, VH); const a = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75; post.fill(g, o.color || '#fff', ease.out(a) * (o.a ?? 0.9), 'lighter'); },
    /** 推镜：dir = 'left'|'right'|'up'|'down' */
    slide(g, A, B, k, o) {
      const e = ease.inOut(k), d = o.dir || 'left';
      const [dx, dy] = d === 'left' ? [-VW, 0] : d === 'right' ? [VW, 0] : d === 'up' ? [0, -VH] : [0, VH];
      g.drawImage(A, dx * e, dy * e, VW, VH); g.drawImage(B, dx * (e - 1), dy * (e - 1), VW, VH);
    },
    /** 擦除：一道发光的边线扫过 */
    wipe(g, A, B, k, o) {
      const e = ease.inOut(k), dir = o.dir || 'right', edge = o.edge || '255,255,255';
      g.drawImage(A, 0, 0, VW, VH);
      g.save(); g.beginPath();
      const x = dir === 'right' ? VW * e : VW * (1 - e);
      if (dir === 'right') g.rect(0, 0, x, VH); else g.rect(x, 0, VW - x, VH);
      g.clip(); g.drawImage(B, 0, 0, VW, VH); g.restore();
      for (let y = 0; y < VH; y += 120) glow(g, x, y + 60, 140, edge, 0.5 * Math.sin(Math.PI * k));
    },
    /** 圆形揭开：从 (o.x, o.y) 扩散 */
    iris(g, A, B, k, o) {
      const e = ease.inOut(k), cx = o.x ?? VW / 2, cy = o.y ?? VH / 2, R = Math.hypot(Math.max(cx, VW - cx), Math.max(cy, VH - cy)) * e;
      g.drawImage(A, 0, 0, VW, VH);
      g.save(); g.beginPath(); g.arc(cx, cy, Math.max(0.1, R), 0, TAU); g.clip(); g.drawImage(B, 0, 0, VW, VH); g.restore();
      if (o.ring !== false) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.sin(Math.PI * k) * 0.7; g.strokeStyle = `rgba(${o.edge || '255,255,255'},1)`; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, Math.max(0.1, R), 0, TAU); g.stroke(); g.restore(); }
    },
    /** 穿越：旧画面放大淡出，新画面从略小放大到位 */
    zoom(g, A, B, k) {
      const e = ease.inOut(k);
      g.save(); const za = 1 + e * 0.5; g.translate(VW / 2, VH / 2); g.scale(za, za); g.globalAlpha = 1 - e; g.drawImage(A, -VW / 2, -VH / 2, VW, VH); g.restore();
      g.save(); const zb = 0.85 + 0.15 * e; g.translate(VW / 2, VH / 2); g.scale(zb, zb); g.globalAlpha = e; g.drawImage(B, -VW / 2, -VH / 2, VW, VH); g.restore();
    },
    /** 撕纸：一道锯齿形的纸边从左向右（或 o.dir）撕开，露出新画面 */
    tear(g, A, B, k, o) {
      const e = ease.inOut(k), pts = jagged(o.seed || 7, 24, 70), dir = o.dir || 'right';
      g.drawImage(B, 0, 0, VW, VH);
      const x0 = dir === 'right' ? VW * e * 1.15 - 80 : VW * (1 - e * 1.15) + 80;
      g.save(); g.beginPath();
      if (dir === 'right') { g.moveTo(x0 + pts[0], -10); pts.forEach((p, i) => g.lineTo(x0 + p + (i % 2 ? 18 : -18), (i / (pts.length - 1)) * (VH + 20) - 10)); g.lineTo(VW + 10, VH + 10); g.lineTo(VW + 10, -10); }
      else { g.moveTo(x0 + pts[0], -10); pts.forEach((p, i) => g.lineTo(x0 + p + (i % 2 ? 18 : -18), (i / (pts.length - 1)) * (VH + 20) - 10)); g.lineTo(-10, VH + 10); g.lineTo(-10, -10); }
      g.closePath(); g.clip(); g.drawImage(A, 0, 0, VW, VH);
      g.restore();
      // 纸边：白色毛边 + 一点阴影
      g.save(); g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 10; g.beginPath();
      pts.forEach((p, i) => { const x = x0 + p + (i % 2 ? 18 : -18), y = (i / (pts.length - 1)) * (VH + 20) - 10; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      g.restore();
    },
    /** 溶解（灰 / 火星）：交叉淡化，同时从边界升起粒子 */
    ash(g, A, B, k, o) {
      TRANS.fade(g, A, B, k);
      field(g, k * 3, { n: 90, every: 0.01, life: 2.2, seed: o.seed || 31, loop: false,
        make: (r) => ({ x: r(1) * VW, y: VH * (0.3 + r(2) * 0.8), vy: -(80 + r(3) * 200), vx: (r(4) - 0.5) * 90, s: 3 + r(5) * 6 }),
        draw: (q, p, age, kk) => { const a = Math.sin(Math.PI * k) * (1 - kk); if (o.embers) glow(q, p.x + p.vx * age, p.y + p.vy * age, p.s * 3, '255,140,60', a); else { q.globalAlpha = a; q.fillStyle = o.color || '#f4f1f6'; q.fillRect(p.x + p.vx * age, p.y + p.vy * age, p.s, p.s * 0.6); q.globalAlpha = 1; } } });
    },
  };

  /* ---------------- 影片注册 ---------------- */
  const films = {};
  function film(def) {
    def.shots.sort((a, b) => a.t0 - b.t0);
    // 相邻镜头首尾相接：t1 默认为下一个镜头的 t0
    def.shots.forEach((s, i) => { if (s.t1 == null) s.t1 = def.shots[i + 1] ? def.shots[i + 1].t0 : Infinity; });
    films[def.id] = def;
    return def;
  }

  /* ---------------- 渲染器 ---------------- */
  /**
   * renderer(canvas, film, analysis, { quality })
   *   .resize(w, h)         设置内部分辨率（像素）
   *   .prepare()            等待字体与影片的 prepare()
   *   .render(t)            画 t 秒时的一帧
   *   .shotAt(t) / .chapters / .captions (开关)
   */
  function renderer(canvas, def, an, opts = {}) {
    const g = canvas.getContext('2d', { alpha: false });
    const T = timing(an);
    let W = canvas.width, H = canvas.height, k = W / VW;
    let bufA = null, bufB = null;
    const caches = new Map();
    const R = {
      film: def, timing: T, captions: true, debug: !!opts.debug, lastMs: 0, stats: { frames: 0, ms: 0, max: 0 },
      /** 减少动态效果：影片应据此减弱镜头抖动、闪白、频闪（s.reduced） */
      reduced: opts.reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches,
      get size() { return { W, H, k }; },
    };
    function resize(w, h) {
      canvas.width = W = Math.max(2, Math.round(w)); canvas.height = H = Math.max(2, Math.round(h));
      k = W / VW;
      caches.clear(); bufA = bufB = null;
    }
    /** 静态图层缓存：key 不变、分辨率不变就不重画。fn(q, s) 在设计坐标里画（w×h） */
    function cache(key, fn, w = VW, h = VH) {
      const ck = key + '@' + k.toFixed(4);
      let c = caches.get(ck);
      if (c) return c;
      // 位图尺寸取整后，按“整张位图恰好对应 w×h 设计单位”来缩放内容：
      // 这样用 drawImage(c, x, y, w, h) 贴回去时像素一一对应，拼接的瓦片之间不会因为取整留下细缝
      const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      c = mk(cw, ch);
      const q = c.getContext('2d');
      q.setTransform(cw / w, 0, 0, ch / h, 0, 0);
      fn(q, { w, h, k });
      caches.set(ck, c);
      return c;
    }
    const buf = () => { const c = mk(W, H); return c; };
    function shotIndexAt(t) { const S = def.shots; let lo = 0, hi = S.length - 1; if (t < S[0].t0) return 0; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m].t0 <= t) lo = m; else hi = m - 1; } return lo; }
    function state(shot, t) {
      const lt = t - shot.t0, dur = (Number.isFinite(shot.t1) ? shot.t1 : T.duration) - shot.t0;
      const beat = T.beatAt(t), bar = T.barAt(t);
      const bp = beat - Math.floor(beat), barp = bar - Math.floor(bar);
      return {
        t, lt, dur, p: clamp(lt / dur), shot, W: VW, H: VH, k, film: def, T, reduced: R.reduced,
        beat, bar, bp, barp,
        /** 拍点脉冲：拍上为 1，按 sharp 衰减 */
        pulse: (sharp = 6) => Math.exp(-bp * sharp),
        /** 小节脉冲 */
        barPulse: (sharp = 4) => Math.exp(-barp * sharp),
        e: T.env('rms', t), lo: T.env('low', t), mid: T.env('mid', t), hi: T.env('high', t),
        raw: (key) => T.raw(key, t), acc: (decay) => T.accent(t, decay),
        /** 当前镜头内 [a, b] 秒（局部时间）的进度 */
        at: (a, b, e) => span(lt, a, b, e),
        /** 绝对时间 [a, b] 的进度 */
        abs: (a, b, e) => span(t, a, b, e),
        /** 第 i 小节（绝对编号）开始的时间 */
        barT: (i) => T.barTime(i), beatT: (i) => T.beatTime(i),
        cache, glow, text, field, layer, kit, post, ease, clamp, lerp, smooth, hash, wobble, noise1, span, window01, handheld,
      };
    }
    function drawShot(q, shot, t) {
      q.save();
      q.setTransform(k, 0, 0, k, 0, 0);
      try { shot.draw(q, state(shot, t)); } catch (e) { if (!R._warned) { R._warned = true; console.warn('[MV]', shot.id, e); } }
      q.restore();
      q.globalAlpha = 1; q.globalCompositeOperation = 'source-over';
    }
    function drawCaptions(t) {
      if (!R.captions || !def.captions) return;
      for (const c of def.captions) {
        const [t0, t1, str, o = {}] = c;
        if (t < t0 - 0.01 || t > t1) continue;
        const a = window01(t, t0, t1, o.fade ?? 0.6, o.fadeOut ?? o.fade ?? 0.6);
        if (a <= 0) continue;
        const style = CAP[o.style || def.captionStyle || 'narration'] || CAP.narration;
        style(g, str, a, t - t0, o, def);
      }
    }
    // 字幕样式（设计坐标）
    const CAP = {
      narration(q, str, a, lt, o) {
        const y = o.y ?? VH - 92, size = o.size || 40;
        const w = measure(q, str, { size, spacing: 4 }) + 120;
        const band = q.createLinearGradient(0, y - 70, 0, y + 30);
        band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(0.5, 'rgba(0,0,0,0.38)'); band.addColorStop(1, 'rgba(0,0,0,0)');
        q.globalAlpha = a * 0.9; q.fillStyle = band; q.fillRect(VW / 2 - w / 2 - 80, y - 70, w + 160, 100); q.globalAlpha = 1;
        text(q, str, VW / 2, y + (1 - ease.out(Math.min(1, lt / 0.8))) * 10, { size, spacing: 4, color: o.color || '#fff8f0', alpha: a, weight: 600 });
      },
      quote(q, str, a, lt, o) {
        text(q, str, o.x ?? VW / 2, o.y ?? VH / 2, { size: o.size || 58, spacing: 8, color: o.color || '#fff', alpha: a, weight: 700, stroke: o.stroke || 'rgba(0,0,0,.35)', strokeW: 10 });
      },
      hand(q, str, a, lt, o) {
        text(q, str, o.x ?? VW / 2, o.y ?? VH - 100, { size: o.size || 46, font: 'hand', color: o.color || '#fffaf0', alpha: a, stroke: o.stroke || 'rgba(60,40,30,.45)', strokeW: 8 });
      },
      side(q, str, a, lt, o) {
        text(q, str, o.x ?? 120, o.y ?? VH - 120, { size: o.size || 36, align: 'left', spacing: 3, color: o.color || '#fff', alpha: a, weight: 600, stroke: 'rgba(0,0,0,.3)', strokeW: 8 });
      },
    };
    R.captionStyles = CAP;

    function render(t) {
      const t0 = performance.now();
      const S = def.shots, i = shotIndexAt(t), shot = S[i];
      // 官方 Q 版小人（js/mv/sd.js）：告诉它现在是哪个镜头——播放中才加载好的模型等到下一个镜头再换上，不在镜头中间跳变
      if (window.MVE.sd && window.MVE.sd.frame) window.MVE.sd.frame(def.id + ':' + shot.id);
      const tr = shot.in && shot.in.type !== 'cut' && i > 0 ? shot.in : null;
      const tk = tr ? (t - shot.t0) / (tr.dur || 0.6) : 1;
      if (tr && tk >= 0 && tk < 1) {
        if (!bufA) { bufA = buf(); bufB = buf(); }
        const ga = bufA.getContext('2d'), gb = bufB.getContext('2d');
        drawShot(ga, S[i - 1], t);
        drawShot(gb, shot, t);
        g.save(); g.setTransform(k, 0, 0, k, 0, 0);
        (TRANS[tr.type] || TRANS.fade)(g, bufA, bufB, clamp(tk), tr);
        g.restore();
      } else {
        drawShot(g, shot, t);
      }
      // 影片级后期（每个镜头之上）
      if (def.overlay) { g.save(); g.setTransform(k, 0, 0, k, 0, 0); try { def.overlay(g, state(shot, t)); } catch (e) {} g.restore(); }
      g.save(); g.setTransform(k, 0, 0, k, 0, 0);
      drawCaptions(t);
      // 开头淡入、结尾淡出
      const fi = def.fadeIn ?? 1.2, fo = def.fadeOut ?? 2.5;
      if (t < fi) post.fill(g, '#000', 1 - ease.sine(clamp(t / fi)));
      if (t > T.duration - fo) post.fill(g, '#000', ease.sine(clamp((t - (T.duration - fo)) / fo)));
      if (R.debug) {
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(16, 16, 620, 44);
        text(g, `${t.toFixed(2)}s · ${shot.id} · bar ${T.barAt(t).toFixed(2)} · beat ${T.beatAt(t).toFixed(2)} · ${R.lastMs.toFixed(1)}ms`, 28, 46, { size: 24, font: 'mono', align: 'left', color: '#fff' });
      }
      g.restore();
      const ms = performance.now() - t0;
      R.lastMs = ms; R.stats.frames++; R.stats.ms += ms; R.stats.max = Math.max(R.stats.max, ms);
    }
    async function prepare() {
      if (document.fonts) {
        try { await Promise.race([Promise.all(['700 40px "Noto Serif SC"', '600 40px "Noto Serif SC"', '700 40px Cinzel', '400 20px "JetBrains Mono"'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}
      }
      // ctx.keyart(key)：预载官方立绘的分层绑定（js/mv/keyart.js，影片 needs: ['keyart']）；只会 resolve（true / false），不会 reject
      // ctx.sd(key | [keys])：预载官方 Q 版小人（js/mv/sd.js，needs: ['sd']）；影片声明了 needs: ['sd'] 时，引擎还会自动预载
      // 本片用到的模型（def.sd 列表，没有时按影片脚本里的角色调用推断），与影片自己的 prepare 并行，最多等 8 秒
      const sdOn = Array.isArray(def.needs) && def.needs.includes('sd') && window.MVE && MVE.sd && MVE.sd.prepareFilm;
      const sdP = sdOn ? Promise.resolve(MVE.sd.prepareFilm(def, 8000)).catch(() => false) : null;
      if (def.prepare) await def.prepare({ svg: svgSprite, img: loadImg, timing: T, keyart: (key) => (window.MVE && MVE.keyart ? MVE.keyart.load(key) : Promise.resolve(false)), sd: (key, ms) => (window.MVE && MVE.sd ? MVE.sd.load(key, ms ?? 8000) : Promise.resolve(false)) });
      if (sdP) await sdP;
    }
    R.resize = resize; R.render = render; R.prepare = prepare; R.cache = cache;
    R.shotAt = (t) => S0()[shotIndexAt(t)];
    const S0 = () => def.shots;
    R.chapters = def.shots.filter((s) => s.title).map((s) => ({ t: s.t0, title: s.title, id: s.id }));
    resize(W, H);
    return R;
  }

  /* ---------------- 资源 ---------------- */
  function loadImg(url) {
    return new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
  }
  /** 把一段 SVG 字符串栅格化成画布（颜色必须是字面值，SVG 图片里读不到页面的 CSS 变量） */
  async function svgSprite(svg, w, h) {
    if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const im = await loadImg(url);
    URL.revokeObjectURL(url);
    const c = mk(w, h);
    if (im) c.getContext('2d').drawImage(im, 0, 0, w, h);
    return c;
  }

  /* ---------------- 按需加载影片脚本 ---------------- */
  const loading = {}, needP = {};
  /**
   * 影片声明的依赖模块：MVE.film({ ..., needs: ['keyart', 'finish'] })。
   * 每个名字 n 对应 js/mv/<n>.js（影片目录 films/ 的上一级，按 load() 的 base 解析），脚本应注册 MVE[n]。
   * 已有 MVE[n] 的跳过；同一模块只加载一次。失败或 12 秒没载完都不报错、照样放行：影片自己判断 MVE[n] 在不在
   */
  function needs(def, base) {
    const list = Array.isArray(def.needs) ? def.needs.filter((n) => typeof n === 'string' && /^[\w-]+$/.test(n)) : [];
    if (!list.length) return Promise.resolve(def);
    let dir = base + '../';
    try { dir = new URL('../', new URL(base, document.baseURI)).href; } catch (e) { /* 用相对路径 */ }
    return Promise.all(list.map((n) => {
      if (window.MVE && window.MVE[n]) return null;
      if (!needP[n]) {
        needP[n] = Promise.race([
          new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = `${dir}${n}.js`; s.async = true;
            s.onload = res; s.onerror = () => { s.remove(); rej(new Error('need ' + n)); };
            document.head.appendChild(s);
          }),
          new Promise((res) => setTimeout(res, 12000)),
        ]).catch(() => { delete needP[n]; }); // 失败：下次 load() 再试
      }
      return needP[n];
    })).then(() => def);
  }
  function load(id, base = 'js/mv/films/') {
    if (films[id]) return needs(films[id], base);
    if (!loading[id]) loading[id] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = `${base}${id}.js`; s.async = true;
      s.onload = () => (films[id] ? res(needs(films[id], base)) : rej(new Error('film not registered: ' + id)));
      s.onerror = () => { delete loading[id]; rej(new Error('load failed: ' + id)); };
      document.head.appendChild(s);
    });
    return loading[id];
  }
  async function analysis(url) { const r = await fetch(url); if (!r.ok) throw new Error('analysis ' + r.status); return r.json(); }

  return {
    VW, VH, TAU, clamp, lerp, smooth, ease, span, window01, hash, rng, noise1, wobble,
    timing, glow, glowSprite, text, measure, field, layer, handheld, kit, post, TRANS, FONT, mk,
    film, films, renderer, load, analysis, svgSprite, loadImg,
  };
})();
