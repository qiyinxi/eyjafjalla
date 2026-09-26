/* =========================================================
 * MV 后期工具箱 · MVE.finish
 * 官方 MV（Miss You / 纯烬 PV / 火山旅梦 PV）的"精致度"来自：景深、辉光与胶片光晕、分段调色、
 * 纸 / 水彩 / 水纹纹理与细颗粒、漏光 / 镜头脏污 / 眩光、空气透视、讲究的标题字。这里把它们做成一套
 * "t 的纯函数 + 预渲染精灵"的工具，影片声明 needs: ['finish'] 后即可用（实验页：lab/finish.html）。
 *
 * 一行成片（放在影片的 overlay 里，字幕之前）：
 *   const F = MVE.finish;
 *   overlay(g, s) { F.frame(g, s, 'rain-cool'); }
 *   overlay(g, s) { F.frame(g, s, F.look(s.t, [[0, 'rain-cool'], [136, 'duotone-magenta'], [168, 'rain-cool']], 1.5)); }
 *
 * 分项（g 为设计坐标 1920×1080 的上下文；"整帧"类效果在设备像素里做，与当前镜头变换无关）：
 *   F.frame(g, s, look | { bloom, grade, amount, texture, leak, vignette, grain, letterbox, lights })
 *   F.bloom(g, s, { strength, threshold, radius, tint, halation, dirt, lights })   整帧辉光（缩小图金字塔，GPU 上完成）
 *   F.grade(g, s, preset | ops | { mix: [[preset, w], ...] }, amount)                合成模式调色；'accent' 保留红色、其余去色
 *   F.texture(g, s, kind, { a, mode, scale, drift, seed })   paper / watercolor / ripple / ripple-field / grain-fine /
 *                                                            dust / scratches / halftone / topo-lines
 *   F.lens(g, s, { leak, dirt, flare, streak, chroma })     漏光 / 脏污 / 眩光 / 横向拉丝 / 边缘色散
 *   F.bokeh(g, s, { n, seed, colors, depth, shape, size, a, drift, cam })
 *   F.haze(g, s, { rgb, from, to, density, mode })  ·  F.rays(g, s, { x, y, angle, spread, n, len, rgb, a })
 *   F.dofLayer(s, key, w, h, drawFn, radius) → 预模糊的缓存画布；F.dof(g, s, key, drawFn, { radius, depth, cam, live })
 *   F.title(g, s, { text, sub, style: 'bold'|'serif'|'display'|'vertical', reveal, t0, dur, out, x, y, size })
 *   F.look(t, cues, fade) → 分段调色的时间线（段间交叉淡化）；F.LOOKS / F.GRADES 为预设表
 *   F.quality = 'high' | 'low' | 'auto'（auto：触屏 / 低内存 / 少核设备用 low）；F.enabled = false 可整体关闭
 *   F.warm(kinds) 预先生成纹理（放进影片 prepare 或空闲时），避免首次使用时卡一帧
 *
 * 性能规则：不读回像素（不用 getImageData）；运行时不用 shadowBlur / CSS filter（ctx.filter 只在建缓存时用）；
 * 每个精灵 / 纹理只生成一次；整帧效果都是少量 drawImage / fillRect + 合成模式，交给 GPU。
 * 成本见 js/mv/FINISH.md。
 * ========================================================= */
(() => {
  'use strict';
  const E = window.MVE;
  if (!E || E.finish) return;
  const { VW, VH, TAU, clamp, lerp, hash, rng, noise1, wobble, mk } = E;
  // lowFrameRead：低档是否也读回整帧做辉光 / 对比曲线（默认否：手机上最贵的就是这一次读画面）
  const F = { quality: 'auto', enabled: true, profile: false, lowFrameRead: false, stats: { frame: 0, n: 0, sum: 0, fx: {} } };

  /* ---------------- 质量档 ---------------- */
  let AUTO = 'high';
  try {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
    if (coarse || mem < 4 || cores < 4) AUTO = 'low';
  } catch (e) { /* 没有 matchMedia 时按桌面处理 */ }
  const level = () => (F.quality === 'high' || F.quality === 'low' ? F.quality : AUTO);
  const HI = () => level() === 'high';
  F.level = level;

  /* ---------------- 小工具 ---------------- */
  const HAS_FILTER = (() => { try { return typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype; } catch (e) { return false; } })();
  /** 'r,g,b' 或任意 CSS 颜色 → CSS 颜色 */
  const col = (c) => (c == null ? '#000' : typeof c !== 'string' ? c : /^\d/.test(c) ? `rgb(${c})` : c);
  const rgba = (rgb, a) => `rgba(${rgb},${+a.toFixed(4)})`;
  const grey = (v) => { const n = Math.round(clamp(v) * 255); return `rgb(${n},${n},${n})`; };
  const ctx = (c) => c.getContext('2d');
  const g255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const sm = (k) => k * k * (3 - 2 * k);
  function op(x, mode, a) { x.globalCompositeOperation = mode || 'source-over'; x.globalAlpha = a == null ? 1 : a; }
  function fillAll(x, w, h, color, mode, a) { op(x, mode, a); x.fillStyle = color; x.fillRect(0, 0, w, h); }
  function blit(x, src, sw, sh, dw, dh, mode, a) { op(x, mode, a); x.drawImage(src, 0, 0, sw, sh, 0, 0, dw, dh); }
  function done(x) { x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; }
  /** 进入设备像素坐标（整帧效果在这里做）；返回 [W, H]，用完 g.restore() */
  function dev(g) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = true; return [g.canvas.width, g.canvas.height]; }

  /** 暂存画布池：按 名字 + 尺寸 复用（每帧都要用的缩小图、遮罩），不在帧内新建画布 */
  const POOL = new Map();
  function pool(name, w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const key = name + ':' + w + 'x' + h;
    let c = POOL.get(key);
    if (c) return c;
    c = mk(w, h);
    const x = ctx(c); x.imageSmoothingEnabled = true; try { x.imageSmoothingQuality = 'low'; } catch (e) {}
    POOL.set(key, c);
    if (POOL.size > 64) POOL.delete(POOL.keys().next().value);
    return c;
  }
  /** 与分辨率无关的精灵 / 纹理缓存（一次生成） */
  const SPR = new Map();
  const spr = (key, fn) => { let c = SPR.get(key); if (!c) { c = fn(); SPR.set(key, c); } return c; };
  /** 平铺图案：按上下文缓存 */
  const PATS = new WeakMap();
  function pattern(g, img) {
    let m = PATS.get(g); if (!m) PATS.set(g, (m = new Map()));
    let p = m.get(img); if (!p) { p = g.createPattern(img, 'repeat'); m.set(img, p); }
    return p;
  }
  /** 按像素生成一张画布（只在建缓存时用：createImageData + putImageData，不读回） */
  function fromPixels(w, h, fn) { const c = mk(w, h), x = ctx(c), im = x.createImageData(w, h); fn(im.data, w, h); x.putImageData(im, 0, 0); return c; }

  /* ---------------- 可平铺噪声（建纹理时用） ---------------- */
  function lattice(seed, P) { const L = new Float32Array(P * P), R = rng(seed); for (let i = 0; i < L.length; i++) L[i] = R(); return L; }
  /** size×size 的可平铺 fBm，最低八度 base 个格点；结果归一化为均值 0.5、标准差 0.18 */
  function fbm(seed, size, base, oct, gain = 0.5) {
    const out = new Float32Array(size * size);
    let amp = 1;
    for (let o = 0; o < oct; o++) {
      const P = base << o, L = lattice(seed + o * 131, P), sc = P / size;
      for (let y = 0; y < size; y++) {
        const fy = y * sc, yi = Math.floor(fy), ty = fy - yi, v = ty * ty * (3 - 2 * ty), y0 = (yi % P) * P, y1 = ((yi + 1) % P) * P;
        for (let x = 0; x < size; x++) {
          const fx = x * sc, xi = Math.floor(fx), tx = fx - xi, u = tx * tx * (3 - 2 * tx), x0 = xi % P, x1 = (xi + 1) % P;
          const a = L[y0 + x0], b = L[y0 + x1], c = L[y1 + x0], d = L[y1 + x1];
          out[y * size + x] += (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * amp;
        }
      }
      amp *= gain;
    }
    let m = 0; for (let i = 0; i < out.length; i++) m += out[i]; m /= out.length;
    let vv = 0; for (let i = 0; i < out.length; i++) { const d = out[i] - m; vv += d * d; }
    const sd = Math.sqrt(vv / out.length) || 1;
    for (let i = 0; i < out.length; i++) out[i] = 0.5 + ((out[i] - m) / sd) * 0.18;
    return out;
  }
  /** 双线性取样（环绕） */
  function samp(A, n, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
    const x0 = ((xi % n) + n) % n, y0 = ((yi % n) + n) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    const a = A[y0 * n + x0], b = A[y0 * n + x1], c = A[y1 * n + x0], d = A[y1 * n + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }

  /* ---------------- 建缓存时的模糊（运行时从不调用） ---------------- */
  /** 把画布就地模糊 r 像素：支持 ctx.filter 就用高斯；否则用逐级缩小再放大（不读回像素） */
  function blurInPlace(c, r) {
    if (!(r >= 0.5)) return c;
    const w = c.width, h = c.height, t = mk(w, h);
    ctx(t).drawImage(c, 0, 0);
    const x = ctx(c);
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'copy';
    if (HAS_FILTER) { x.filter = `blur(${r.toFixed(2)}px)`; x.drawImage(t, 0, 0); x.filter = 'none'; }
    else pyramidBlur(t, x, w, h, r);
    x.restore();
    return c;
  }
  function pyramidBlur(src, x, w, h, r) {
    const n = clamp(Math.round(Math.log2(Math.max(2, r * 1.3))), 1, 7), lv = [];
    let cur = src, cw = w, ch = h;
    for (let i = 0; i < n; i++) {
      const nw = Math.max(1, cw >> 1), nh = Math.max(1, ch >> 1), c2 = mk(nw, nh);
      ctx(c2).drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh); lv.push(c2); cur = c2; cw = nw; ch = nh;
    }
    for (let i = n - 2; i >= 0; i--) { const d = lv[i], q = ctx(d); q.globalCompositeOperation = 'copy'; q.drawImage(cur, 0, 0, cur.width, cur.height, 0, 0, d.width, d.height); cur = d; }
    x.drawImage(cur, 0, 0, cur.width, cur.height, 0, 0, w, h);
  }
  F.blurCanvas = blurInPlace;

  /* ---------------- 细颗粒（设备像素，1 纹素 ≈ 1 像素，24 fps 换一张） ---------------- */
  function grainTiles(chroma) {
    return spr('grain:' + (chroma ? 'c' : 'm'), () => {
      const out = [], N = 256;
      for (let v = 0; v < 4; v++) {
        const R = rng(501 + v * 17), n = new Float32Array(N * N), m = new Float32Array(N * N);
        for (let i = 0; i < n.length; i++) n[i] = R() + R() + R() - 1.5;
        // 相邻像素轻微相关：颗粒成团，像胶片而不像数码噪点
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const i = y * N + x;
          m[i] = n[i] * 0.62 + (n[y * N + ((x + 1) & 255)] + n[((y + 1) & 255) * N + x]) * 0.31;
        }
        out.push(fromPixels(N, N, (d) => {
          for (let i = 0, p = 0; i < m.length; i++, p += 4) {
            const l = m[i] * 118;
            if (chroma) { d[p] = g255(128 + l + (R() - 0.5) * 34); d[p + 1] = g255(128 + l + (R() - 0.5) * 30); d[p + 2] = g255(128 + l + (R() - 0.5) * 40); }
            else d[p] = d[p + 1] = d[p + 2] = g255(128 + l);
            d[p + 3] = 255;
          }
        }));
      }
      return out;
    });
  }
  /**
   * 细颗粒：grain(g, s, 0.08) 或 { a, fps, chroma, mode: 'overlay', scale }
   * overlay 叠中灰噪声：中间调有颗粒，纯黑纯白不受影响（胶片的样子）
   */
  F.grain = function (g, s, o) {
    if (o == null || o === true) o = {}; else if (typeof o === 'number') o = { a: o };
    const a = o.a ?? 0.08; if (a <= 0.003) return;
    const fps = o.fps ?? (HI() ? 24 : 12), f = Math.floor((s.t || 0) * (s.reduced ? Math.min(fps, 8) : fps)) + (o.seed || 0) * 7;
    const tile = grainTiles(!!o.chroma)[((f % 4) + 4) % 4];
    const [W, H] = dev(g);
    const sc = o.scale ?? Math.max(1, Math.round(W / 1500));
    const ox = Math.floor(hash(71, f) * 256), oy = Math.floor(hash(73, f) * 256);
    g.globalCompositeOperation = o.mode || 'overlay'; g.globalAlpha = clamp(a);
    g.translate(-ox * sc, -oy * sc); if (sc !== 1) g.scale(sc, sc);
    g.fillStyle = pattern(g, tile); g.fillRect(0, 0, W / sc + 256, H / sc + 256);
    g.restore();
  };

  /* ---------------- 暗角 ---------------- */
  /** vignette(g, s, 0.45) 或 { a, rgb, inner: 0.42, pow: 1.6, mode }；mode 'multiply' + 有色 rgb 做染色暗角 */
  F.vignette = function (g, s, o) {
    if (typeof o === 'number') o = { a: o }; else if (!o || o === true) o = {};
    const a = o.a ?? 0.45; if (a <= 0.003) return;
    const rgb = o.rgb || '0,0,0', inner = o.inner ?? 0.42, pow = o.pow ?? 1.6;
    const c = spr(`vig:${rgb}:${inner}:${pow}`, () => {
      const w = 320, h = 180, c = mk(w, h), x = ctx(c);
      x.translate(w / 2, h / 2); x.scale(1, h / w);
      const R = Math.hypot(w / 2, w / 2) * 1.02, gr = x.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, rgba(rgb, 0));
      for (let i = 0; i <= 12; i++) { const k = i / 12; gr.addColorStop(inner + (1 - inner) * k, rgba(rgb, Math.pow(k, pow))); }
      x.fillStyle = gr; x.fillRect(-w, -w, 2 * w, 2 * w);
      return c;
    });
    const [W, H] = dev(g);
    g.globalCompositeOperation = o.mode || 'source-over'; g.globalAlpha = clamp(a);
    g.drawImage(c, 0, 0, W, H);
    g.restore();
  };

  /* ---------------- 帧金字塔：整帧的 1/2、1/4 缩小图（辉光与色彩隔离共用，每帧只读一次画面） ---------------- */
  function pyramid(g) {
    const W = g.canvas.width, H = g.canvas.height;
    const w1 = Math.max(2, W >> 1), h1 = Math.max(2, H >> 1), w2 = Math.max(1, W >> 2), h2 = Math.max(1, H >> 2);
    const P1 = pool('p1', w1, h1), P2 = pool('p2', w2, h2), x1 = ctx(P1), x2 = ctx(P2);
    blit(x1, g.canvas, W, H, w1, h1, 'copy'); done(x1);
    blit(x2, P1, w1, h1, w2, h2, 'copy'); done(x2);
    return { W, H, w1, h1, w2, h2, P1, P2 };
  }
  const lazyPyr = (g) => { let p = null; return () => p || (p = pyramid(g)); };

  /* ---------------- 辉光（bloom / halation） ----------------
   * 1) 缩小到 1/2（高档）或 1/4（低档）；2) 'color-burn' 常数灰 = 亮部提取：max(0, (x - 阈值) / (1 - 阈值))；
   * 3) 逐级再缩小 2 倍 N 次，再逐级放大相加（双滤波金字塔：窄核心 + 宽光晕）；4) 'screen' 叠回画面。
   * 全程只有 drawImage / fillRect，GPU 完成；CPU 上约 20 次调用。
   * 选项：strength 0.5、threshold 0.66、radius 4（级数，越大越宽）、spread 0.85（外圈权重）、tint 'r,g,b'、
   *       halation 0..1（红橙色胶片光晕）、dirt 0..1（亮处显出镜头脏污）、mode 'screen'|'lighter'、
   *       lights: [[x, y, r, 'r,g,b', a], ...]（精灵辉光，设计坐标；低档或只想给几个光源加光时用）、frame: false（不做整帧）
   */
  F.bloom = function (g, s, o, P) {
    if (o == null || o === true) o = {}; else if (typeof o === 'number') o = { strength: o };
    const hi = HI();
    if (o.lights) lightBloom(g, o.lights, o);
    if (o.frame === false || (!hi && !F.lowFrameRead)) return; // 低档默认不读画面（只剩精灵辉光）
    const str = o.strength ?? 0.5; if (str <= 0.003) return;
    const p = P ? P() : pyramid(g), { W, H } = p;
    const thr = clamp(o.threshold ?? 0.66, 0, 0.97);
    const src = hi ? p.P1 : p.P2, sw = hi ? p.w1 : p.w2, sh = hi ? p.h1 : p.h2;
    const B0 = pool('bb0', sw, sh), x0 = ctx(B0);
    blit(x0, src, sw, sh, sw, sh, 'copy');
    if (o.key === 'rgb') fillAll(x0, sw, sh, grey(1 - thr), 'color-burn'); // 逐通道阈值：饱和的灯（红灯笼、熔岩）也会发光（夜景用）
    else { // 亮度阈值（默认）：只有真正亮的地方发光，蓝天不会整片泛光
      const Lm = pool('bbL', sw, sh), xl = ctx(Lm);
      blit(xl, src, sw, sh, sw, sh, 'copy'); fillAll(xl, sw, sh, '#808080', 'saturation'); fillAll(xl, sw, sh, grey(1 - thr), 'color-burn'); done(xl);
      blit(x0, Lm, sw, sh, sw, sh, 'multiply');
    }
    if (o.tint) fillAll(x0, sw, sh, col(o.tint), 'multiply');
    done(x0);
    const lv = [[B0, sw, sh]];
    const n = clamp(Math.round(o.radius ?? 4) - (hi ? 0 : 1), 1, 6);
    let cur = B0, cw = sw, ch = sh;
    for (let i = 1; i <= n; i++) {
      const nw = Math.max(1, cw >> 1), nh = Math.max(1, ch >> 1), c = pool('bb' + i, nw, nh), x = ctx(c);
      blit(x, cur, cw, ch, nw, nh, 'copy'); done(x);
      lv.push([c, nw, nh]); cur = c; cw = nw; ch = nh;
    }
    const spread = o.spread ?? 0.85;
    for (let i = lv.length - 1; i >= 1; i--) {
      const [c, w, h] = lv[i - 1], [c2, w2, h2] = lv[i], x = ctx(c);
      blit(x, c2, w2, h2, w, h, 'lighter', spread); done(x);
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true;
    blit(g, B0, sw, sh, W, H, o.mode || 'screen', clamp(str));
    if (hi && o.dirt > 0 && lv[1]) {
      const [c, w, h] = lv[1], D = pool('bdirt', w, h), xd = ctx(D);
      blit(xd, c, w, h, w, h, 'copy'); op(xd, 'multiply', 1); xd.drawImage(dirtTex(), 0, 0, w, h); done(xd);
      blit(g, D, w, h, W, H, 'lighter', clamp(o.dirt));
    }
    if (hi && o.halation > 0 && lv[2]) {
      const [c, w, h] = lv[2], x = ctx(c);
      fillAll(x, w, h, col(o.halColor || '255,78,36'), 'multiply'); done(x);
      blit(g, c, w, h, W, H, 'screen', clamp(o.halation));
    }
    done(g); g.restore();
  };
  /** 精灵辉光：给出光源位置（设计坐标，跟随当前变换），不读画面，最便宜 */
  function lightBloom(g, lights, o) {
    for (const L of lights) {
      const [x, y, r = 140, rgb = '255,240,220', a = 0.6] = L;
      E.glow(g, x, y, r, rgb, a * 0.8, 'screen', false);
      E.glow(g, x, y, r * 2.6, rgb, a * 0.28, 'screen', false);
      if (o.halation) E.glow(g, x, y, r * 1.4, o.halColor || '255,78,36', a * o.halation * 0.5, 'screen', false);
    }
  }

  /* ---------------- 调色 ----------------
   * 预设是一串"操作"，每个操作是一次整帧 fill / 合成（GPU 上几乎免费，CPU 上每个约 5µs）：
   *   ['fill', mode, color, a]        任意合成模式铺色（soft-light / overlay / multiply / screen / color …）
   *   ['lift', color, a]              screen：抬起暗部并染色（胶片的"灰黑"）
   *   ['gain', color, a]              multiply：压暗并染色高光
   *   ['mono', color, a]              color：保留亮度、换成单色（棕褐 / 洋红单色）
   *   ['sat', ±a]                     正：提饱和（saturation 叠纯色）；负：去饱和
   *   ['fade', a]                     哑光：抬黑、压白
   *   ['vgrad', mode, [[pos, color], ...], a]   纵向渐变铺色（天空冷、地面暖 之类的分区调色）
   *   ['rgrad', mode, inner, outer, a, cx, cy]  径向渐变铺色（中心亮暖、四周冷）
   *   ['duo', shadow, highlight, a]   双色调（渐变映射）：去色 → multiply 高光色 → screen 暗部色
   *   ['curve', mode, a]              画面自身（帧金字塔的半分辨率副本）soft-light / overlay 叠加：S 形对比 + 一点"通透感"；放在最前面
   *   ['accent', { key: 'red'|'warm'|'pink'|'blue'|'cyan'|'green', lo, hi, desat, tint, amount }]
   *                                    色彩隔离：只保留 key 颜色，其余去色（并染成 tint）
   */
  // 注意：'curve' 用帧金字塔里的原图（半分辨率）做 soft-light，所以一律放在最前面（在 accent 等改色操作之前）
  const GRADES = {
    film: [['curve', 'soft-light', 0.3], ['fill', 'soft-light', '#a08870', 0.18], ['lift', '#141018', 0.3], ['fade', 0.02]],
    'rain-cool': [
      ['curve', 'soft-light', 0.35],
      ['accent', { key: 'red', lo: 0.13, hi: 0.4, desat: 0.88, tint: '112,124,142' }],
      ['fill', 'soft-light', '#56708f', 0.35], ['lift', '#141c28', 0.32],
      ['vgrad', 'soft-light', [[0, '#8c9cb4'], [1, '#34404f']], 0.28]],
    'duotone-magenta': [['curve', 'soft-light', 0.32], ['mono', '#e8246e', 0.9], ['lift', '#2c0a2e', 0.45], ['fill', 'soft-light', '#d86a9a', 0.2]],
    'siesta-sunset': [
      ['curve', 'soft-light', 0.3],
      ['vgrad', 'soft-light', [[0, '#4a3aa8'], [0.45, '#c8608c'], [0.75, '#e89070'], [1, '#6a4a78']], 0.55],
      ['lift', '#082a3c', 0.35], ['sat', 0.12]],
    'summer-noon': [
      ['curve', 'soft-light', 0.25], ['sat', 0.2],
      ['vgrad', 'soft-light', [[0, '#3a8ee8'], [0.5, '#9a9a9a'], [1, '#c8a070']], 0.3],
      ['fill', 'soft-light', '#b8a080', 0.15], ['lift', '#051828', 0.18]],
    'dream-pink': [['curve', 'soft-light', 0.2], ['fill', 'soft-light', '#c07aa8', 0.35], ['lift', '#301040', 0.32], ['sat', -0.1], ['vgrad', 'soft-light', [[0, '#6a58c0'], [1, '#d890b0']], 0.3]],
    'memory-sepia': [['curve', 'soft-light', 0.15], ['mono', '#94623a', 0.82], ['lift', '#2e1c10', 0.45], ['gain', '#fff1dc', 0.25], ['fade', 0.05]],
    dawn: [['curve', 'soft-light', 0.25], ['vgrad', 'soft-light', [[0, '#4a58b8'], [0.55, '#d88c90'], [1, '#e8b088']], 0.45], ['lift', '#0e1636', 0.32], ['sat', -0.05]],
    // 夜：暗部和中间调压成冷蓝，亮的灯（窗、灯笼）仍然暖 —— soft-light 对高光影响小
    'night-blue': [['curve', 'soft-light', 0.28], ['fill', 'soft-light', '#34488e', 0.45], ['sat', -0.15], ['lift', '#060c24', 0.4], ['vgrad', 'soft-light', [[0, '#4a5aa0'], [1, '#202848']], 0.3]],
    'golden-hour': [['curve', 'soft-light', 0.25], ['fill', 'soft-light', '#d08a40', 0.35], ['vgrad', 'soft-light', [[0, '#e0b070'], [1, '#8a4a30']], 0.3], ['lift', '#241008', 0.28], ['sat', 0.08]],
    ember: [['curve', 'soft-light', 0.35], ['accent', { key: 'warm', lo: 0.2, hi: 0.55, desat: 0.6, tint: '92,72,84' }], ['fill', 'soft-light', '#c05a30', 0.25], ['lift', '#160606', 0.35]],
  };
  F.GRADES = GRADES;

  /**
   * grade(g, s, spec, amount = 1)
   *   spec：预设名 | 操作数组 | { mix: [[预设名或操作数组, 权重], ...] }（F.look 生成，用于两段之间交叉淡化）
   */
  F.grade = function (g, s, spec, amount = 1, P) {
    if (!spec || amount <= 0.003) return;
    const [W, H] = dev(g);
    try {
      const pp = P || lazyPyr(g);
      if (spec.mix) { for (const [sp, w] of spec.mix) if (w * amount > 0.003) applyOps(g, opsOf(sp), w * amount, W, H, pp); }
      else applyOps(g, opsOf(spec), amount, W, H, pp);
    } finally { done(g); g.restore(); }
  };
  const opsOf = (sp) => (typeof sp === 'string' ? GRADES[sp] || [] : Array.isArray(sp) ? sp : sp && sp.ops ? sp.ops : []);
  /**
   * graded(g, s, spec, drawFn, { amount })：只给一层调色 —— 例如背景做洋红双色调、人物保持原色（Miss You 副歌那样）。
   * drawFn(q) 在当前变换（设计坐标）里画这一层；先画到全分辨率暂存画布（背后垫中灰，避免透明像素参与混合），
   * 调色后按这一层原来的透明度裁回来，再贴回画面。成本：两张全分辨率暂存 + 调色操作（桌面约 0.1–0.2 ms CPU）。
   */
  F.graded = function (g, s, spec, drawFn, o = {}) {
    const W = g.canvas.width, H = g.canvas.height, M0 = g.getTransform();
    const A = pool('grA', W, H), xa = ctx(A), M = pool('grM', W, H), xm = ctx(M);
    xa.setTransform(1, 0, 0, 1, 0, 0); done(xa); xa.clearRect(0, 0, W, H);
    xa.setTransform(M0); xa.save(); try { drawFn(xa); } finally { xa.restore(); } xa.setTransform(1, 0, 0, 1, 0, 0); done(xa);
    blit(xm, A, W, H, W, H, 'copy'); done(xm);
    op(xa, 'destination-over', 1); xa.fillStyle = '#808080'; xa.fillRect(0, 0, W, H); done(xa);
    if (F.enabled) applyOps(xa, opsOf(spec), o.amount ?? 1, W, H, lazyPyr(xa));
    blit(xa, M, W, H, W, H, 'destination-in'); done(xa);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(A, 0, 0); g.restore();
  };
  function applyOps(g, ops, amt, W, H, P) {
    for (const o of ops) {
      switch (o[0]) {
        case 'fill': fillAll(g, W, H, col(o[2]), o[1], clamp(o[3] * amt)); break;
        case 'lift': fillAll(g, W, H, col(o[1]), 'screen', clamp(o[2] * amt)); break;
        case 'gain': fillAll(g, W, H, col(o[1]), 'multiply', clamp(o[2] * amt)); break;
        case 'mono': fillAll(g, W, H, col(o[1]), 'color', clamp(o[2] * amt)); break;
        case 'sat': if (o[1] < 0) fillAll(g, W, H, '#808080', 'saturation', clamp(-o[1] * amt)); else fillAll(g, W, H, '#ff0000', 'saturation', clamp(o[1] * amt)); break;
        case 'fade': { const f = clamp(o[1] * amt); fillAll(g, W, H, grey(f), 'screen'); fillAll(g, W, H, grey(1 - f * 0.6), 'multiply'); break; }
        case 'vgrad': { const gr = g.createLinearGradient(0, 0, 0, H); for (const [p, c] of o[2]) gr.addColorStop(p, col(c)); fillAll(g, W, H, gr, o[1], clamp(o[3] * amt)); break; }
        case 'rgrad': {
          const cx = (o[5] ?? 0.5) * W, cy = (o[6] ?? 0.45) * H, gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.6);
          gr.addColorStop(0, col(o[2])); gr.addColorStop(1, col(o[3])); fillAll(g, W, H, gr, o[1], clamp(o[4] * amt)); break;
        }
        case 'duo': { const a = clamp(o[3] * amt); fillAll(g, W, H, '#808080', 'saturation', a); fillAll(g, W, H, col(o[2]), 'multiply', a); fillAll(g, W, H, col(o[1]), 'screen', a); break; }
        case 'curve': { if (!HI() && !F.lowFrameRead) break; const p = P();op(g, o[1] || 'soft-light', clamp(o[2] * amt)); g.drawImage(p.P1, 0, 0, p.w1, p.h1, 0, 0, W, H); break; }
        case 'accent': accent(g, W, H, P, o[1] || {}, amt); break;
      }
    }
    done(g);
  }

  /* ---------------- 色彩隔离（只留红色，其余去色），不读像素 ----------------
   * 1/4 分辨率上用合成模式算遮罩：乘纯色取出通道 → 'saturation' 变成亮度灰（R、G、B 都缩放到 0.3×）→
   *   key = max(0, 正通道 − 负通道)（'darken' 求 min，再 'difference'）→ 'color-dodge' / 'color-burn' 拉成 0..1 遮罩；
   * 1/2 分辨率上合成色度图 S = 原图·m + 去色染色图·(1−m)；最后整帧 'color' 合成：
   *   亮度来自全分辨率原图（清晰），色相 / 饱和度来自 S（和 JPEG 的 4:2:0 色度下采样同理，肉眼看不出）。
   */
  const CH = { R: ['#ff0000', 0], G: ['rgb(0,130,0)', 0], B: ['#0000ff', 1 - 0.11 / 0.3] };
  const KEYS = { red: [['R'], ['G', 'B']], warm: [['R'], ['B']], pink: [['R', 'B'], ['G']], blue: [['B'], ['R']], cyan: [['G', 'B'], ['R']], green: [['G'], ['R', 'B']] };
  function chanGrey(x, src, w, h, ch) {
    const [c, dodge] = CH[ch];
    blit(x, src, w, h, w, h, 'copy');
    fillAll(x, w, h, c, 'multiply');
    fillAll(x, w, h, '#808080', 'saturation');
    if (dodge) fillAll(x, w, h, grey(dodge), 'color-dodge');
  }
  function accent(g, W, H, P, o, amt) {
    const a = clamp((o.amount ?? 1) * amt); if (a <= 0.003) return;
    if (!HI()) { // 低档：整体降饱和（红色也会淡一些，但仍然看得出）
      fillAll(g, W, H, '#808080', 'saturation', clamp((o.desat ?? 0.86) * 0.7 * a));
      done(g); return;
    }
    const p = P(), { w1, h1, w2, h2 } = p;
    const [pos, neg] = KEYS[o.key || 'red'] || KEYS.red;
    const A = pool('akA', w2, h2), B = pool('akB', w2, h2), C = pool('akC', w2, h2), xa = ctx(A), xb = ctx(B), xc = ctx(C);
    chanGrey(xa, p.P2, w2, h2, pos[0]);
    if (pos[1]) { chanGrey(xc, p.P2, w2, h2, pos[1]); blit(xa, C, w2, h2, w2, h2, 'darken'); }
    chanGrey(xb, p.P2, w2, h2, neg[0]);
    if (neg[1]) { chanGrey(xc, p.P2, w2, h2, neg[1]); blit(xb, C, w2, h2, w2, h2, 'lighten'); }
    blit(xc, A, w2, h2, w2, h2, 'copy'); blit(xc, B, w2, h2, w2, h2, 'darken');
    blit(xa, C, w2, h2, w2, h2, 'difference');
    const lo = o.lo ?? 0.12, hk = Math.max(lo + 0.02, o.hi ?? 0.4);
    fillAll(xa, w2, h2, grey(0.7), 'color-dodge');
    fillAll(xa, w2, h2, grey(1 - lo), 'color-burn');
    fillAll(xa, w2, h2, grey(1 - (hk - lo) / (1 - lo)), 'color-dodge');
    blit(xb, A, w2, h2, w2, h2, 'copy'); fillAll(xb, w2, h2, '#ffffff', 'difference');
    done(xa); done(xb); done(xc);
    const S = pool('akS', w1, h1), T = pool('akT', w1, h1), xs = ctx(S), xt = ctx(T);
    blit(xs, p.P1, w1, h1, w1, h1, 'copy'); blit(xs, A, w2, h2, w1, h1, 'multiply');
    blit(xt, p.P1, w1, h1, w1, h1, 'copy'); fillAll(xt, w1, h1, col(o.tint || '128,128,128'), 'source-over', clamp(o.desat ?? 0.86)); blit(xt, B, w2, h2, w1, h1, 'multiply');
    blit(xs, T, w1, h1, w1, h1, 'lighter');
    done(xs); done(xt);
    blit(g, S, w1, h1, W, H, 'color', a);
    done(g);
  }
  /** 调试：返回当前帧的色彩隔离遮罩（1/4 分辨率画布），实验页用 */
  F._accentMask = function (g, o = {}) { const [W, H] = dev(g); try { accent(g, W, H, lazyPyr(g), o, 1); } finally { g.restore(); } return POOL.get('akA:' + (W >> 2) + 'x' + (H >> 2)); };

  /* ---------------- 程序纹理（一次生成、缓存、图案平铺 + 慢漂移） ---------------- */
  const TEXDEF = {
    paper: { a: 0.35, mode: 'soft-light', scale: 1 },
    watercolor: { a: 0.45, mode: 'soft-light', scale: 2 },
    'ripple-field': { a: 0.3, mode: 'overlay', scale: 2.4 },
    halftone: { a: 0.14, mode: 'overlay', scale: 1 },
    ripple: { a: 0.4, mode: 'overlay' },
    'grain-fine': { a: 0.08 },
    dust: { a: 0.55 },
    scratches: { a: 0.35 },
    'topo-lines': { a: 0.9, mode: 'multiply' },
  };
  const BUILD = {
    /** 纸：大块起伏 + 细密纤维（中灰为中性，soft-light / overlay 叠加时有亮有暗） */
    paper(seed) {
      const N = 512, B = fbm(seed, 128, 4, 5), D = fbm(seed + 9, 256, 16, 3), R = rng(seed + 3);
      const c = fromPixels(N, N, (d) => {
        for (let y = 0, i = 0; y < N; y++) for (let x = 0; x < N; x++, i += 4) {
          const v = 128 + (samp(B, 128, x / 4, y / 4) - 0.5) * 70 + (samp(D, 256, x / 2, y / 2) - 0.5) * 44 + (R() + R() + R() - 1.5) * 16;
          d[i] = d[i + 1] = d[i + 2] = g255(v); d[i + 3] = 255;
        }
      });
      const x = ctx(c); x.lineCap = 'round';
      for (let i = 0; i < 1100; i++) {
        const px = R() * N, py = R() * N, len = 5 + R() * 24, an = R() * TAU, bend = (R() - 0.5) * 8, light = R() < 0.6, al = light ? 0.1 + R() * 0.18 : 0.05 + R() * 0.1;
        x.strokeStyle = light ? `rgba(255,255,255,${al.toFixed(3)})` : `rgba(40,30,20,${al.toFixed(3)})`; x.lineWidth = 0.4 + R() * 0.9;
        const ex = Math.cos(an) * len, ey = Math.sin(an) * len, cx = -Math.sin(an) * bend, cy = Math.cos(an) * bend;
        for (const ox of [0, -N, N]) for (const oy of [0, -N, N]) {
          const X = px + ox, Y = py + oy;
          if (X + len < 0 || X - len > N || Y + len < 0 || Y - len > N) continue;
          x.beginPath(); x.moveTo(X, Y); x.quadraticCurveTo(X + ex / 2 + cx, Y + ey / 2 + cy, X + ex, Y + ey); x.stroke();
        }
      }
      return c;
    },
    /** 水彩：扭曲的颜料团 + 水痕边（颜料在边缘沉积变深）+ 颗粒 */
    watercolor(seed) {
      const N = 512, A = fbm(seed, 256, 3, 6, 0.55), Wp = fbm(seed + 5, 128, 4, 3), R = rng(seed + 11);
      return fromPixels(N, N, (d) => {
        for (let y = 0, i = 0; y < N; y++) for (let x = 0; x < N; x++, i += 4) {
          const w = (samp(Wp, 128, x / 4, y / 4) - 0.5) * 40, v = samp(A, 256, x / 2 + w, y / 2 - w * 0.6);
          let e = 0; for (const th of [0.36, 0.5, 0.63]) { const q = (v - th) / 0.018; if (q > -4 && q < 4) e += Math.exp(-q * q); }
          d[i] = d[i + 1] = d[i + 2] = g255(128 + (v - 0.5) * 120 - e * 34 + (R() - 0.5) * (14 + 26 * (1 - v))); d[i + 3] = 255;
        }
      });
    },
    /** 水纹场：许多同心水波（静态，可平铺；配合慢漂移 / 缩放） */
    'ripple-field'(seed) {
      const N = 256, R = rng(seed), rings = [];
      for (let i = 0; i < 22; i++) rings.push([R() * N, R() * N, 12 + R() * 70, 3.5 + R() * 4, 0.4 + R() * 0.6]);
      return fromPixels(N, N, (d) => {
        for (let y = 0, i = 0; y < N; y++) for (let x = 0; x < N; x++, i += 4) {
          let v = 0;
          for (const [cx, cy, r0, lam, amp] of rings) {
            let dx = Math.abs(x - cx), dy = Math.abs(y - cy); if (dx > N / 2) dx = N - dx; if (dy > N / 2) dy = N - dy;
            const r = Math.sqrt(dx * dx + dy * dy), q = (r - r0) / (lam * 2.4);
            if (q > -3 && q < 3) v += Math.sin(((r - r0) / lam) * TAU) * Math.exp(-q * q) * amp;
          }
          d[i] = d[i + 1] = d[i + 2] = g255(128 + v * 44); d[i + 3] = 255;
        }
      });
    },
    /** 网点（印刷感）：中灰底 + 深色圆点，按 45° 旋转平铺 */
    halftone() {
      const N = 12, c = mk(N, N), x = ctx(c);
      x.fillStyle = '#8c8c8c'; x.fillRect(0, 0, N, N);
      x.fillStyle = '#383838'; x.beginPath(); x.arc(N / 2, N / 2, N * 0.3, 0, TAU); x.fill();
      return c;
    },
  };
  const tile = (kind, seed) => spr(`tex:${kind}:${seed}`, () => BUILD[kind](seed));

  /**
   * texture(g, s, kind, { a, mode, scale, drift: [vx, vy], rot, rect: [x, y, w, h], seed })
   * kind：'paper' | 'watercolor' | 'ripple-field' | 'halftone'（平铺）；'ripple'（雨滴涟漪，随 t 扩散）；
   *       'grain-fine'（同 F.grain）；'dust'（胶片灰尘）；'scratches'（划痕）；'topo-lines'（红色等高线地图）
   */
  F.texture = function (g, s, kind, o) {
    if (kind && typeof kind === 'object') { o = kind; kind = o.kind; }
    o = o || {};
    const D = TEXDEF[kind]; if (!D) return;
    const a = o.a ?? D.a; if (a <= 0.003) return;
    switch (kind) {
      case 'grain-fine': return F.grain(g, s, Object.assign({}, o, { a }));
      case 'dust': return dust(g, s, o, a);
      case 'scratches': return scratches(g, s, o, a);
      case 'ripple': return ripples(g, s, o, a);
      case 'topo-lines': return topo(g, s, o, a);
    }
    const img = tile(kind, o.seed ?? 1), sc = o.scale ?? D.scale, t = s.t || 0;
    const tw = img.width * sc, th = img.height * sc;
    const dx = ((((o.drift ? o.drift[0] : 0) * t) % tw) + tw) % tw - tw, dy = ((((o.drift ? o.drift[1] : 0) * t) % th) + th) % th - th;
    const rot = o.rot ?? (kind === 'halftone' ? Math.PI / 4 : 0);
    g.save();
    if (o.rect) { g.beginPath(); g.rect(o.rect[0], o.rect[1], o.rect[2], o.rect[3]); g.clip(); }
    g.globalCompositeOperation = o.mode || D.mode; g.globalAlpha *= clamp(a);
    if (rot) { g.translate(VW / 2, VH / 2); g.rotate(rot); g.translate(-VW / 2, -VH / 2); }
    g.translate(dx, dy); g.scale(sc, sc);
    g.fillStyle = pattern(g, img);
    if (rot) g.fillRect((VW / 2 - 1110 - dx) / sc, (VH / 2 - 1110 - dy) / sc, 2220 / sc + img.width, 2220 / sc + img.height);
    else g.fillRect(-dx / sc, -dy / sc, VW / sc + img.width, VH / sc + img.height);
    g.restore();
  };

  /* 雨滴涟漪：n 个同心波包，按 life 秒循环，从出生点扩散、变淡（t 的纯函数） */
  function rippleSprite() {
    return spr('ripple', () => fromPixels(256, 256, (d) => {
      for (let y = 0, i = 0; y < 256; y++) for (let x = 0; x < 256; x++, i += 4) {
        const r = Math.hypot(x - 127.5, y - 127.5) / 128, q = (r - 0.72) / 0.12, env = r < 1 ? Math.exp(-q * q) : 0;
        const w = Math.sin(((r - 0.72) / 0.11) * TAU), lit = 1 + 0.35 * ((127.5 - x - (y - 127.5)) / 181) * (r > 0.01 ? 1 / Math.max(r, 0.2) : 0) * 0.2;
        d[i] = d[i + 1] = d[i + 2] = g255(128 + 127 * w * Math.min(1.2, lit)); d[i + 3] = g255(255 * env);
      }
    }));
  }
  function ripples(g, s, o, a) {
    const n = o.n ?? 14, life = o.life ?? 2.6, seed = o.seed ?? 5, rect = o.rect || [0, 0, VW, VH], sz = o.size || [60, 220], sq = o.squash ?? 1, t = s.t || 0;
    const sp = rippleSprite();
    g.save(); g.globalCompositeOperation = o.mode || 'overlay';
    const base = g.globalAlpha * clamp(a);
    for (let i = 0; i < n; i++) {
      const rel = t + hash(seed, i, 1) * life, cyc = Math.floor(rel / life), k = (rel - cyc * life) / life, j = i * 131 + cyc;
      const x = rect[0] + hash(seed, j, 2) * rect[2], y = rect[1] + hash(seed, j, 3) * rect[3];
      const r = lerp(sz[0], sz[1], hash(seed, j, 4)) * Math.pow(k, 0.6), al = base * Math.pow(1 - k, 1.6) * Math.min(1, k * 10);
      if (al <= 0.003 || r < 2) continue;
      const R = r / 0.72;
      g.globalAlpha = al; g.drawImage(sp, x - R, y - R * sq, R * 2, R * 2 * sq);
    }
    g.restore();
  }

  /* 胶片灰尘：每 1/24 秒换一批（0–3 个斑点 / 发丝），大多为暗色 */
  function dustSheets() {
    return spr('dust', () => {
      const c = mk(512, 64), x = ctx(c), R = rng(77);
      for (let i = 0; i < 8; i++) {
        x.save(); x.translate(i * 64 + 32, 32);
        if (i < 4) { x.fillStyle = '#fff'; const n = 3 + ((R() * 5) | 0); for (let j = 0; j < n; j++) { x.beginPath(); x.arc((R() - 0.5) * 9, (R() - 0.5) * 9, 0.8 + R() * 3, 0, TAU); x.fill(); } }
        else {
          x.strokeStyle = '#fff'; x.lineWidth = 0.9 + R() * 0.9; x.lineCap = 'round'; x.beginPath();
          let px = -26 + R() * 8, py = (R() - 0.5) * 18; x.moveTo(px, py);
          for (let j = 0; j < 4; j++) { const nx = px + 10 + R() * 6, ny = py + (R() - 0.5) * 16; x.quadraticCurveTo((px + nx) / 2 + (R() - 0.5) * 12, (py + ny) / 2 + (R() - 0.5) * 12, nx, ny); px = nx; py = ny; }
          x.stroke();
        }
        x.restore();
      }
      const k = mk(512, 64), xk = ctx(k); xk.drawImage(c, 0, 0); xk.globalCompositeOperation = 'source-in'; xk.fillStyle = '#1a1410'; xk.fillRect(0, 0, 512, 64);
      return { light: c, dark: k };
    });
  }
  function dust(g, s, o, a) {
    const fps = o.fps ?? 24, f = Math.floor((s.t || 0) * fps), seed = o.seed ?? 9, n = o.n ?? 3, sh = dustSheets();
    const cnt = Math.floor(hash(seed, f, 1) * (n + 1) * hash(seed, f, 2) * 1.6);
    g.save();
    const base = g.globalAlpha * clamp(a);
    for (let i = 0; i < cnt; i++) {
      const idx = Math.floor(hash(seed, f * 8 + i, 3) * 8), x = hash(seed, f * 8 + i, 4) * VW, y = hash(seed, f * 8 + i, 5) * VH;
      const sz = 22 + hash(seed, f * 8 + i, 6) * 46, light = hash(seed, f * 8 + i, 7) < (o.light ?? 0.3);
      g.globalCompositeOperation = light ? 'screen' : 'source-over'; g.globalAlpha = base * (0.45 + 0.55 * hash(seed, f * 8 + i, 8));
      g.save(); g.translate(x, y); g.rotate(hash(seed, f * 8 + i, 9) * TAU);
      g.drawImage(light ? sh.light : sh.dark, idx * 64, 0, 64, 64, -sz / 2, -sz / 2, sz, sz);
      g.restore();
    }
    g.restore();
  }
  /* 划痕：竖直细线，位置保持几帧、带抖动与闪烁 */
  function scratches(g, s, o, a) {
    const fps = o.fps ?? 24, f = Math.floor((s.t || 0) * fps), seed = o.seed ?? 13, n = o.n ?? 2;
    g.save();
    const base = g.globalAlpha * clamp(a);
    for (let j = 0; j < n; j++) {
      const seg = Math.floor((f + j * 3) / 7);
      if (hash(seed, seg, j) > (o.p ?? 0.55)) continue;
      const x = hash(seed, seg, j + 10) * VW + (hash(seed, f, j + 20) - 0.5) * 5, w = 1 + hash(seed, seg, j + 30) * 1.6;
      const y0 = hash(seed, seg, j + 40) < 0.5 ? 0 : hash(seed, seg, j + 41) * VH * 0.6, y1 = y0 + VH * (0.4 + hash(seed, seg, j + 42) * 0.8);
      const light = hash(seed, seg, j + 50) < 0.5;
      g.globalCompositeOperation = light ? 'screen' : 'multiply'; g.globalAlpha = base * (0.5 + 0.5 * hash(seed, f, j + 60));
      g.fillStyle = light ? '#f4efe6' : '#3a3028'; g.fillRect(x, y0, w, Math.min(VH, y1) - y0);
    }
    g.restore();
  }

  /* 红色等高线地图（纯烬 PV 里的勘测图）：非平铺的整幅图，高度场 + marching squares，按分辨率缓存 */
  function vnoise(seed, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
    const a = hash(seed, xi * 7919 + yi, 1), b = hash(seed, (xi + 1) * 7919 + yi, 1), c = hash(seed, xi * 7919 + yi + 1, 1), d = hash(seed, (xi + 1) * 7919 + yi + 1, 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function topoData(seed) {
    return spr('topo:' + seed, () => {
      const cell = 8, gw = VW / cell + 1, gh = Math.ceil(VH / cell) + 1, Fh = new Float32Array(gw * gh), R = rng(seed);
      const hills = [];
      for (let i = 0; i < 5; i++) hills.push([R() * VW, R() * VH * 0.8, 140 + R() * 220, 0.35 + R() * 0.35]);
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        const px = x * cell, py = y * cell;
        let h = 0, amp = 0.5, f = 1 / 420;
        for (let o2 = 0; o2 < 5; o2++) { h += (vnoise(seed + o2 * 17, px * f, py * f) - 0.5) * amp; amp *= 0.5; f *= 2; }
        for (const [hx, hy, hr, ha] of hills) { const q = Math.hypot(px - hx, py - hy) / hr; h += ha * Math.exp(-q * q); }
        h += (vnoise(seed + 99, px / 11, py / 11) - 0.5) * 0.035;
        Fh[y * gw + x] = h;
      }
      const levels = []; for (let L = 0.02; L < 0.8; L += 0.045) levels.push(L);
      return { cell, segs: contours(Fh, gw, gh, levels), levels };
    });
  }
  function contours(Fh, gw, gh, levels) {
    const out = [];
    for (const L of levels) {
      const seg = [];
      for (let y = 0; y < gh - 1; y++) for (let x = 0; x < gw - 1; x++) {
        const a = Fh[y * gw + x], b = Fh[y * gw + x + 1], c = Fh[(y + 1) * gw + x + 1], d = Fh[(y + 1) * gw + x];
        const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const T = [x + (L - a) / (b - a), y], Rr = [x + 1, y + (L - b) / (c - b)], Bm = [x + (L - d) / (c - d), y + 1], Lf = [x, y + (L - a) / (d - a)];
        switch (idx) {
          case 1: case 14: seg.push(...Lf, ...Bm); break;
          case 2: case 13: seg.push(...Bm, ...Rr); break;
          case 3: case 12: seg.push(...Lf, ...Rr); break;
          case 4: case 11: seg.push(...T, ...Rr); break;
          case 5: seg.push(...Lf, ...T, ...Bm, ...Rr); break;
          case 6: case 9: seg.push(...T, ...Bm); break;
          case 7: case 8: seg.push(...Lf, ...T); break;
          case 10: seg.push(...Lf, ...Bm, ...T, ...Rr); break;
        }
      }
      out.push(seg);
    }
    return out;
  }
  /** topo-lines：{ a, mode: 'multiply', rgb: '196,38,40', grid: true, seed, reveal: 0..1, origin: [x, y], drift, zoom } */
  function topo(g, s, o, a) {
    if (!s.cache) return;
    const seed = o.seed ?? 3, rgb = o.rgb || '196,38,40', grid = o.grid !== false;
    const c = s.cache(`fin:topo:${seed}:${rgb}:${grid}`, (q) => {
      const D = topoData(seed);
      q.lineCap = 'round'; q.lineJoin = 'round';
      D.segs.forEach((seg, li) => {
        const bold = li % 5 === 2;
        q.strokeStyle = rgba(rgb, bold ? 0.95 : 0.78); q.lineWidth = bold ? 2.6 : 1.15;
        q.beginPath();
        for (let i = 0; i < seg.length; i += 4) { q.moveTo(seg[i] * D.cell, seg[i + 1] * D.cell); q.lineTo(seg[i + 2] * D.cell, seg[i + 3] * D.cell); }
        q.stroke();
      });
      if (grid) {
        const R = rng(seed + 5);
        q.strokeStyle = 'rgba(46,34,34,0.55)'; q.lineWidth = 1.1; q.beginPath();
        for (let x = 120; x < VW; x += 300) { q.moveTo(x, 0); q.lineTo(x, VH); }
        for (let y = 90; y < VH; y += 300) { q.moveTo(0, y); q.lineTo(VW, y); }
        q.stroke();
        q.fillStyle = 'rgba(40,30,30,0.8)';
        for (let x = 120; x < VW; x += 300) for (let y = 90; y < VH; y += 300) { q.fillRect(x - 5, y - 0.8, 10, 1.6); q.fillRect(x - 0.8, y - 5, 1.6, 10); }
        for (let k = 0; k < 7; k++) { // 小段注记（看不清的"文字"）
          const bx = 60 + R() * (VW - 300), by = 60 + R() * (VH - 200), rows = 2 + ((R() * 4) | 0);
          for (let r = 0; r < rows; r++) { let x = bx; const n = 3 + ((R() * 6) | 0); for (let i = 0; i < n; i++) { const w = 6 + R() * 26; q.fillRect(x, by + r * 12, w, 2.2); x += w + 5 + R() * 6; } }
        }
      }
    }, VW, VH);
    g.save();
    g.globalCompositeOperation = o.mode || 'multiply'; g.globalAlpha *= clamp(a);
    if (o.reveal != null && o.reveal < 1) {
      const [ox, oy] = o.origin || [VW * 0.3, VH * 0.35];
      g.beginPath(); g.arc(ox, oy, Math.max(0.1, sm(clamp(o.reveal)) * 2300), 0, TAU); g.clip();
    }
    const z = 1 + (o.zoom || 0) * (s.t || 0), dx = (o.drift ? o.drift[0] : 0) * (s.t || 0), dy = (o.drift ? o.drift[1] : 0) * (s.t || 0);
    if (z !== 1 || dx || dy) { g.translate(VW / 2 + dx, VH / 2 + dy); g.scale(z, z); g.translate(-VW / 2, -VH / 2); }
    g.drawImage(c, 0, 0, VW, VH);
    g.restore();
  }

  /* ---------------- 镜头：漏光 / 脏污 / 眩光 / 横向拉丝 / 边缘色散 ---------------- */
  const LEAKS = {
    warm: ['255,246,220', '255,176,86', '255,92,52', '255,60,110'],
    pink: ['255,240,246', '255,150,190', '255,90,150', '190,110,255'],
    gold: ['255,250,228', '255,214,120', '255,160,60', '255,110,40'],
    cool: ['240,250,255', '150,210,255', '90,150,255', '150,110,255'],
    red: ['255,235,220', '255,120,90', '230,40,50', '150,20,60'],
    peach: ['255,248,236', '255,206,170', '255,160,150', '240,130,190'],
  };
  function leakSprite(pal, seed) {
    return spr(`leak:${pal}:${seed}`, () => {
      const P = LEAKS[pal] || LEAKS.warm, c = mk(512, 512), x = ctx(c), R = rng(seed * 31 + 7);
      x.globalCompositeOperation = 'lighter';
      const blob = (spread, r0, r1, rgb, a) => {
        const ox = (R() - 0.5) * spread, oy = (R() - 0.5) * spread, cx = 256 + ox, cy = 256 + oy;
        const r = Math.min(r0 + R() * (r1 - r0), 252 - Math.max(Math.abs(ox), Math.abs(oy)));
        const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, rgba(rgb, a)); gr.addColorStop(0.4, rgba(rgb, a * 0.5)); gr.addColorStop(0.75, rgba(rgb, a * 0.14)); gr.addColorStop(1, rgba(rgb, 0));
        x.fillStyle = gr; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      };
      for (let i = 0; i < 4; i++) blob(150, 150, 220, P[3], 0.32);
      for (let i = 0; i < 3; i++) blob(110, 120, 180, P[2], 0.42);
      for (let i = 0; i < 2; i++) blob(70, 90, 140, P[1], 0.52);
      blob(20, 60, 80, P[0], 0.75);
      return c;
    });
  }
  /**
   * 漏光：leak(g, s, { a: 0.35, palette: 'warm'|'pink'|'gold'|'cool'|'red'|'peach', side: 'right'|'left'|'top'|'bottom'|'tr'|'tl'|'br'|'bl'|[x, y],
   *                     r: 900, speed: 1, burst: 0..1（随重音闪一下）, mode: 'screen', seed })
   */
  F.leak = function (g, s, o) {
    if (o == null || o === true) o = {}; else if (typeof o === 'number') o = { a: o };
    const a = o.a ?? 0.35; if (a <= 0.003) return;
    const t = s.t || 0, seed = o.seed ?? 21, pal = o.palette || 'warm', r = o.r ?? 900, spd = (o.speed ?? 1) * (s.reduced ? 0.3 : 1);
    const burst = o.burst && s.acc ? o.burst * s.acc(0.6) : 0;
    const A = { right: [VW * 0.98, VH * 0.3], left: [VW * 0.02, VH * 0.35], top: [VW * 0.62, -VH * 0.06], bottom: [VW * 0.38, VH * 1.06], tr: [VW, 0], tl: [0, 0], br: [VW, VH], bl: [0, VH] };
    const [ax, ay] = Array.isArray(o.side) ? o.side : A[o.side || 'right'] || A.right;
    g.save(); g.globalCompositeOperation = o.mode || 'screen';
    const base = g.globalAlpha, n = HI() ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const w1 = wobble(seed + i * 5, t * 0.07 * spd), w2 = wobble(seed + i * 5 + 1, t * 0.05 * spd), br = 0.55 + 0.45 * (0.5 + 0.5 * wobble(seed + i * 5 + 2, t * 0.23 * spd));
      const x = ax + w1 * VW * 0.16, y = ay + w2 * VH * 0.26, rr = r * (i ? 0.62 : 1) * (0.86 + 0.14 * br);
      g.globalAlpha = base * clamp((a * br + burst) * (i ? 0.55 : 1));
      g.drawImage(leakSprite(pal, seed + i), x - rr, y - rr, rr * 2, rr * 2);
    }
    g.restore();
  };

  /** 镜头脏污纹理（黑底上的柔软污迹、灰点、小圆环、擦痕；本身就是失焦的） */
  function dirtTex() {
    return spr('dirt', () => {
      const w = 480, h = 270, c = mk(w, h), x = ctx(c), R = rng(404);
      x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'lighter';
      const disc = (cx, cy, r, a) => { const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.7, `rgba(255,255,255,${a * 0.6})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); };
      for (let i = 0; i < 16; i++) disc(R() * w, R() * h, 24 + R() * 70, 0.08 + R() * 0.16);
      for (let i = 0; i < 110; i++) disc(R() * w, R() * h, 0.8 + R() * 3.6, 0.2 + R() * 0.5);
      x.lineWidth = 1.1;
      for (let i = 0; i < 12; i++) { x.strokeStyle = `rgba(255,255,255,${0.1 + R() * 0.14})`; x.beginPath(); x.arc(R() * w, R() * h, 3 + R() * 9, 0, TAU); x.stroke(); }
      x.lineCap = 'round';
      for (let i = 0; i < 6; i++) { x.strokeStyle = `rgba(255,255,255,${0.04 + R() * 0.05})`; x.lineWidth = 6 + R() * 16; x.beginPath(); const cx = R() * w, cy = R() * h, rr = 60 + R() * 160, a0 = R() * TAU; x.arc(cx, cy, rr, a0, a0 + 0.4 + R() * 0.8); x.stroke(); }
      blurInPlace(c, 1.2);
      return c;
    });
  }
  /** 脏污（不读画面）：只在给出的光源附近显出来。dirt(g, s, { lights: [[x, y, r, 'r,g,b', a]], a: 0.5 }) */
  F.dirt = function (g, s, o = {}) {
    const a = o.a ?? 0.5, L = o.lights || []; if (a <= 0.003 || !L.length) return;
    const dt = dirtTex(), w = dt.width, h = dt.height, T = pool('dirtL', w, h), x = ctx(T);
    blit(x, dt, w, h, w, h, 'copy');
    if (L[0][3]) fillAll(x, w, h, col(L[0][3]), 'multiply', 0.6); // 先染色（此时画布不透明），再按光源裁剪
    const glow = E.glowSprite('255,255,255', false);
    const M = pool('dirtM', w, h), xm = ctx(M); done(xm); xm.clearRect(0, 0, w, h); op(xm, 'lighter', 1);
    for (const [lx, ly, lr = 500, , la = 1] of L) { xm.globalAlpha = clamp(la); const r = (lr * w) / VW; xm.drawImage(glow, (lx * w) / VW - r, (ly * h) / VH - r, r * 2, r * 2); }
    done(xm);
    blit(x, M, w, h, w, h, 'destination-in');
    done(x);
    const [W, H] = dev(g);
    blit(g, T, w, h, W, H, 'lighter', clamp(a));
    g.restore();
  };

  function starSprite() {
    return spr('star', () => {
      const c = mk(256, 256), x = ctx(c); x.translate(128, 128); x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        const an = (i / 12) * TAU + (i % 2 ? 0.07 : 0), L = i % 3 === 0 ? 126 : 62 + ((i * 37) % 44);
        x.save(); x.rotate(an);
        const gr = x.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr; x.beginPath(); x.moveTo(0, -2.4); x.lineTo(L, 0); x.lineTo(0, 2.4); x.closePath(); x.fill();
        x.restore();
      }
      return c;
    });
  }
  function ringSprite() {
    return spr('ring', () => {
      const c = mk(256, 256), x = ctx(c), gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.78, 'rgba(90,130,255,0)'); gr.addColorStop(0.83, 'rgba(90,140,255,0.32)');
      gr.addColorStop(0.87, 'rgba(120,255,170,0.28)'); gr.addColorStop(0.91, 'rgba(255,200,120,0.3)'); gr.addColorStop(0.95, 'rgba(255,90,90,0.2)'); gr.addColorStop(1, 'rgba(255,60,60,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
      return c;
    });
  }
  function streakSprite(rgb) {
    return spr('streak:' + rgb, () => {
      const w = 512, h = 48, c = mk(w, h), x = ctx(c), gx = x.createLinearGradient(0, 0, w, 0);
      gx.addColorStop(0, rgba(rgb, 0)); gx.addColorStop(0.3, rgba(rgb, 0.25)); gx.addColorStop(0.46, rgba(rgb, 0.7)); gx.addColorStop(0.5, 'rgba(255,255,255,1)');
      gx.addColorStop(0.54, rgba(rgb, 0.7)); gx.addColorStop(0.7, rgba(rgb, 0.25)); gx.addColorStop(1, rgba(rgb, 0));
      x.fillStyle = gx; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'destination-in';
      const gy = x.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.5, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gy; x.fillRect(0, 0, w, h);
      return c;
    });
  }
  /** 横向拉丝（变形宽银幕镜头的蓝色光条）：streak(g, s, { x, y, len: 1700, thick: 26, a: 0.5, rgb: '130,180,255' }) */
  F.streak = function (g, s, o = {}) {
    const a = o.a ?? 0.5; if (a <= 0.003) return;
    const x = o.x ?? VW / 2, y = o.y ?? VH / 2, len = o.len ?? 1700, th = o.thick ?? 26, rgb = o.rgb || '130,180,255';
    g.save(); g.globalCompositeOperation = 'lighter';
    const base = g.globalAlpha;
    g.globalAlpha = base * clamp(a); g.drawImage(streakSprite(rgb), x - len / 2, y - th / 2, len, th);
    g.globalAlpha = base * clamp(a * 0.8); g.drawImage(streakSprite('255,255,255'), x - len * 0.28, y - th * 0.1, len * 0.56, th * 0.2);
    g.restore();
  };
  /* 眩光鬼影：沿"光源 → 画面中心"的直线排开（f=1 在中心，f=2 在对称点） */
  const GHOSTS = [[0.28, 34, '255,210,160', 0.22, 'disc'], [0.5, 80, '150,210,255', 0.1, 'hex'], [0.72, 22, '255,255,230', 0.25, 'disc'], [1.12, 58, '255,150,200', 0.12, 'hex'],
    [1.38, 150, '140,255,210', 0.06, 'disc'], [1.62, 40, '255,220,170', 0.16, 'hex'], [1.95, 260, '120,160,255', 0.05, 'ring']];
  /** 眩光：flare(g, s, { x, y, a: 0.6, rgb, size: 1, star, ring, ghosts, streak: 0..1, rot }) */
  F.flare = function (g, s, o = {}) {
    const a = o.a ?? 0.6; if (a <= 0.003) return;
    const x = o.x ?? VW * 0.75, y = o.y ?? VH * 0.25, rgb = o.rgb || '255,236,210', k = o.size ?? 1, t = s.t || 0;
    E.glow(g, x, y, 240 * k, rgb, a * 0.55, 'lighter', true);
    E.glow(g, x, y, 640 * k, rgb, a * 0.16, 'screen', false);
    g.save(); g.globalCompositeOperation = 'lighter';
    const base = g.globalAlpha;
    if (o.star !== false) { const R = 300 * k; g.globalAlpha = base * clamp(a * 0.7); g.save(); g.translate(x, y); g.rotate((o.rot ?? 0.15) + t * 0.02); g.drawImage(starSprite(), -R, -R, 2 * R, 2 * R); g.restore(); }
    if (o.ring !== false) { const R = 380 * k; g.globalAlpha = base * clamp(a * 0.35); g.drawImage(ringSprite(), x - R, y - R, 2 * R, 2 * R); }
    if (o.ghosts !== false) {
      const cx = VW / 2, cy = VH / 2, n = HI() ? GHOSTS.length : 4;
      for (let i = 0; i < n; i++) {
        const [f, sz, c, ga, sh] = GHOSTS[i], px = x + (cx - x) * f, py = y + (cy - y) * f, R = sz * k;
        g.globalAlpha = base * clamp(a * ga);
        g.drawImage(sh === 'ring' ? ringSprite() : bokehSprite(sh, c, 0.6), px - R, py - R, 2 * R, 2 * R);
      }
    }
    g.restore();
    if (o.streak) F.streak(g, s, { x, y, a: a * (o.streak === true ? 0.6 : o.streak), rgb: o.streakRgb });
  };
  /** 边缘色散（横向色差）：红通道放大、蓝通道缩小（中心为 0，越靠边越明显）。只在高档做，约 8 次整帧绘制 */
  F.chroma = function (g, s, o) {
    if (typeof o === 'number') o = { a: o }; else if (!o || o === true) o = {};
    const amt = o.a ?? 0.5; if (amt <= 0.01 || !HI()) return;
    const [W, H] = dev(g);
    const c = 0.0032 * amt, T = pool('ca1', W, H), U = pool('ca2', W, H), xt = ctx(T), xu = ctx(U);
    op(xt, 'copy'); xt.drawImage(g.canvas, (-W * c) / 2, (-H * c) / 2, W * (1 + c), H * (1 + c));
    fillAll(xt, W, H, '#ff0000', 'multiply');
    op(xu, 'copy'); xu.drawImage(g.canvas, 0, 0); op(xu, 'source-over'); xu.drawImage(g.canvas, (W * c) / 2, (H * c) / 2, W * (1 - c), H * (1 - c));
    fillAll(xu, W, H, '#0000ff', 'multiply');
    blit(xt, U, W, H, W, H, 'lighter'); done(xt); done(xu);
    fillAll(g, W, H, '#00ff00', 'multiply', clamp(o.mix ?? 1));
    blit(g, T, W, H, W, H, 'lighter', clamp(o.mix ?? 1));
    done(g); g.restore();
  };
  /** lens(g, s, { leak, dirt, flare, streak, chroma })：flare / streak 可给数组 */
  F.lens = function (g, s, o = {}) {
    if (o.leak) F.leak(g, s, o.leak);
    if (o.flare) for (const f of [].concat(o.flare)) F.flare(g, s, f);
    if (o.streak) for (const f of [].concat(o.streak)) F.streak(g, s, f);
    if (o.dirt) F.dirt(g, s, o.dirt);
    if (o.chroma) F.chroma(g, s, o.chroma);
  };

  /* ---------------- 焦外光斑（bokeh） ---------------- */
  function bokehSprite(shape, rgb, rim = 1) {
    return spr(`bok:${shape}:${rgb}:${rim}`, () => {
      const c = mk(128, 128), x = ctx(c), R = 56;
      x.translate(64, 64);
      const gr = x.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, rgba(rgb, 0.5)); gr.addColorStop(0.68, rgba(rgb, 0.53)); gr.addColorStop(0.9, rgba(rgb, 0.6 + 0.16 * rim));
      gr.addColorStop(0.97, rgba(rgb, 0.64 + 0.22 * rim)); gr.addColorStop(1, rgba(rgb, 0.5));
      x.fillStyle = gr; x.beginPath();
      if (shape === 'hex') { for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU + Math.PI / 6; x.lineTo(Math.cos(an) * R, Math.sin(an) * R); } x.closePath(); }
      else x.arc(0, 0, R, 0, TAU);
      x.fill();
      blurInPlace(c, 2.2);
      return c;
    });
  }
  /**
   * bokeh(g, s, { n: 24, seed, colors: ['r,g,b', ...], shape: 'disc'|'hex', depth: [0, 1], size: [26, 120], a: 0.5,
   *               drift: [vx, vy], rect: [x, y, w, h], cam, parallax: 0.6, twinkle: 0.35, rim: 1, mode: 'screen' })
   * depth 0 = 远（小、实、慢），1 = 近（大、虚、快）。位置由 t 解析算出（循环漂移），可跟镜头视差。
   */
  F.bokeh = function (g, s, o = {}) {
    const n = o.n ?? 24, seed = o.seed ?? 1, cols = o.colors || ['255,222,186', '255,186,206', '206,222,255'], shape = o.shape || 'disc';
    const [d0, d1] = o.depth || [0, 1], [s0, s1] = o.size || [26, 120], a = o.a ?? 0.5, t = s.t || 0, dr = o.drift || [10, -6];
    const rect = o.rect || [0, 0, VW, VH], cam = o.cam, par = o.parallax ?? 0.6, tw = o.twinkle ?? 0.35, rim = o.rim ?? 1;
    const N = HI() ? n : Math.ceil(n * 0.6);
    g.save(); g.globalCompositeOperation = o.mode || 'screen';
    const base = g.globalAlpha;
    for (let i = 0; i < N; i++) {
      const d = lerp(d0, d1, hash(seed, i, 1)), r = lerp(s0, s1, d) * (0.75 + 0.5 * hash(seed, i, 2));
      const spW = rect[2] + 2 * r, spH = rect[3] + 2 * r;
      let x = hash(seed, i, 3) * spW + t * dr[0] * (0.3 + d), y = hash(seed, i, 4) * spH + t * dr[1] * (0.3 + d) + Math.sin(t * 0.3 + i) * 8 * d;
      if (cam) { x -= ((cam.x ?? VW / 2) - VW / 2) * d * par; y -= ((cam.y ?? VH / 2) - VH / 2) * d * par; }
      x = rect[0] - r + (((x % spW) + spW) % spW); y = rect[1] - r + (((y % spH) + spH) % spH);
      const al = a * (0.4 + 0.6 * hash(seed, i, 5)) * (1 - tw + tw * (0.5 + 0.5 * Math.sin(t * (0.6 + hash(seed, i, 6) * 1.4) + i * 2.1))) * (1 - 0.45 * d);
      if (al <= 0.003) continue;
      g.globalAlpha = base * al;
      g.drawImage(bokehSprite(shape, cols[i % cols.length], rim), x - r, y - r, 2 * r, 2 * r);
    }
    g.restore();
  };

  /* ---------------- 空气透视（雾霭）与光束 ---------------- */
  /**
   * haze(g, s, { rgb, from, to, density, band, wisps, mode })：在 y=from 最浓、到 y=to 消失的一层雾（设计坐标）。
   * 放在远景层之后、近景层之前，就是空气透视。band: true 时 from 两侧对称变淡（地平线上的一条雾带）。
   */
  F.haze = function (g, s, o = {}) {
    const rgb = o.rgb || o.color || '226,232,242', from = o.from ?? VH, to = o.to ?? VH * 0.35, d = clamp(o.density ?? 0.5);
    if (d <= 0.003) return;
    g.save(); g.globalCompositeOperation = o.mode || 'source-over';
    const x0 = o.x ?? -40, w = o.w ?? VW + 80;
    const band = (y0, y1) => {
      const gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, rgba(rgb, d)); gr.addColorStop(0.35, rgba(rgb, d * 0.55)); gr.addColorStop(0.7, rgba(rgb, d * 0.18)); gr.addColorStop(1, rgba(rgb, 0));
      g.fillStyle = gr; g.fillRect(x0, Math.min(y0, y1), w, Math.abs(y1 - y0));
    };
    band(from, to);
    if (o.band) band(from, from + (from - to));
    else if (o.solid !== false) { g.fillStyle = rgba(rgb, d); if (from > to) g.fillRect(x0, from, w, VH * 2); else g.fillRect(x0, -VH, w, from + VH); }
    g.restore();
    if (o.wisps) E.kit.fog(g, s.t || 0, { rgb, alpha: d * 0.6 * o.wisps, y0: Math.min(from, to), y1: Math.max(from, to), n: HI() ? 10 : 6, seed: o.seed ?? 3, speed: o.speed ?? 14 });
  };
  function raySprite(rgb) {
    return spr('ray:' + rgb, () => {
      const w = 512, h = 128, c = fromPixels(w, h, (d) => {
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
          const u = x / w, v = (y - h / 2 + 0.5) / (h / 2), q = v / (0.18 + 0.82 * u), along = Math.pow(1 - u, 1.4) * sm(clamp(u / 0.06));
          d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = g255(255 * Math.exp(-q * q * 2.2) * along);
        }
      });
      const x = ctx(c); x.globalCompositeOperation = 'source-in'; x.fillStyle = col(rgb); x.fillRect(0, 0, w, h);
      return c;
    });
  }
  /** 柔边光束：rays(g, s, { x, y, angle, spread, n: 6, len: 1500, width: [90, 260], rgb, a: 0.22, speed, dust, mode: 'screen' }) */
  F.rays = function (g, s, o = {}) {
    const a = o.a ?? 0.22; if (a <= 0.003) return;
    const x = o.x ?? VW * 0.72, y = o.y ?? -80, n = o.n ?? 6, ang = o.angle ?? Math.PI / 2 + 0.3, spread = o.spread ?? 0.7, len = o.len ?? 1500;
    const wd = o.width || [90, 260], rgb = o.rgb || '255,236,200', seed = o.seed ?? 9, t = s.t || 0, spd = (o.speed ?? 1) * (s.reduced ? 0.3 : 1);
    const sp = raySprite(rgb);
    g.save(); g.globalCompositeOperation = o.mode || 'screen';
    const base = g.globalAlpha;
    for (let i = 0; i < n; i++) {
      const an = ang + (hash(seed, i, 1) - 0.5) * spread + wobble(seed + i, t * 0.05 * spd) * 0.03, w = lerp(wd[0], wd[1], hash(seed, i, 2));
      const fl = 0.55 + 0.45 * noise1(seed * 7 + i, t * 0.35 * spd + i * 3.1);
      g.globalAlpha = base * clamp(a * fl * (0.6 + 0.4 * hash(seed, i, 3)));
      g.save(); g.translate(x, y); g.rotate(an); g.drawImage(sp, 0, -w, len * (0.75 + 0.35 * hash(seed, i, 4)), w * 2); g.restore();
    }
    g.restore();
    if (o.dust) E.kit.particles(g, t, 'dust', { n: o.dust === true ? 40 : o.dust, rgb });
  };

  /* ---------------- 景深（DOF） ---------------- */
  /** 把边缘像素向外延伸 p 像素（满幅背景模糊后边上不会发暗） */
  function clampEdges(c, px) {
    const p = Math.round(px), w = c.width, h = c.height; if (p < 1 || w < 2 * p + 3 || h < 2 * p + 3) return;
    const x = ctx(c); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    let t = mk(w, h); ctx(t).drawImage(c, 0, 0);
    x.drawImage(t, p + 1, 0, 1, h, 0, 0, p + 1, h); x.drawImage(t, w - p - 2, 0, 1, h, w - p - 1, 0, p + 1, h);
    t = mk(w, h); ctx(t).drawImage(c, 0, 0);
    x.drawImage(t, 0, p + 1, w, 1, 0, 0, w, p + 1); x.drawImage(t, 0, h - p - 2, w, 1, 0, h - p - 1, w, p + 1);
    x.restore();
  }
  /**
   * dofLayer(s, key, w, h, drawFn, radius = 10, { opaque, scale })
   *   把 drawFn(q)（设计坐标，内容在 0..w × 0..h）预渲染并预模糊一次（按分辨率缓存，s.cache），返回画布。
   *   画布四周带 m = ceil(radius × 2.5) 设计像素的外边：贴回去用 g.drawImage(c, x - m, y - m, w + 2m, h + 2m)（m 也在 c.__m）。
   *   opaque: true —— 满幅不透明背景：先把边缘像素外延再模糊，画面边上不发暗。越糊存得越小（scale 默认 radius / 4，最多 4 倍）。
   */
  F.dofLayer = function (s, key, w, h, drawFn, radius = 10, o = {}) {
    const m = Math.ceil(radius * 2.5), f = clamp(o.scale ?? radius / 4, 1, 4);
    const c = s.cache(`fin:dof:${key}:${radius}:${f.toFixed(2)}`, (q, info) => {
      q.save(); q.scale(1 / f, 1 / f); q.translate(m, m); drawFn(q); q.restore();
      if (o.opaque) clampEdges(q.canvas, (m * info.k) / f);
      blurInPlace(q.canvas, (radius * info.k) / f);
    }, (w + 2 * m) / f, (h + 2 * m) / f);
    c.__m = m;
    return c;
  };
  /**
   * dof(g, s, key, drawFn, { radius, x, y, w, h, cam, depth, alpha, opaque, live })
   *   缓存版：静态的前景 / 背景平面（预模糊），可跟 s.layer 视差（cam + depth）。
   *   live: true：每帧把 drawFn 画到 1/f 分辨率的暂存画布再放大（动的东西也能虚化；CPU 成本 ≈ drawFn 本身 + 4 次贴图）。
   */
  F.dof = function (g, s, key, drawFn, o = {}) {
    if (o.live) return dofLive(g, s, drawFn, o);
    const r = o.radius ?? 10, w = o.w ?? VW, h = o.h ?? VH, x = o.x ?? 0, y = o.y ?? 0;
    const c = F.dofLayer(s, key, w, h, drawFn, r, o), m = c.__m;
    const put = (q) => { const pa = q.globalAlpha; q.globalAlpha = pa * (o.alpha ?? 1); q.drawImage(c, x - m, y - m, w + 2 * m, h + 2 * m); q.globalAlpha = pa; };
    if (o.cam) E.layer(g, o.cam, o.depth ?? 1, put); else put(g);
  };
  function dofLive(g, s, drawFn, o) {
    const W = g.canvas.width, H = g.canvas.height, r = Math.max(1, (o.radius ?? 10) * (s.k || W / VW));
    const f = clamp(r / 1.5, 2, 8), w = Math.ceil(W / f), h = Math.ceil(H / f);
    const A = pool('dofA', w, h), xa = ctx(A);
    xa.setTransform(1, 0, 0, 1, 0, 0); done(xa); xa.clearRect(0, 0, w, h);
    const M = g.getTransform(); xa.setTransform(M.a / f, M.b / f, M.c / f, M.d / f, M.e / f, M.f / f);
    xa.save(); if (o.cam) E.layer(xa, o.cam, o.depth ?? 1, drawFn); else drawFn(xa); xa.restore();
    xa.setTransform(1, 0, 0, 1, 0, 0); done(xa);
    const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1), B = pool('dofB', w2, h2), xb = ctx(B);
    blit(xb, A, w, h, w2, h2, 'copy'); done(xb);
    blit(xa, B, w2, h2, w, h, 'copy'); done(xa);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha *= o.alpha ?? 1;
    g.drawImage(A, 0, 0, w, h, 0, 0, w * f, h * f);
    g.restore();
  }

  /* ---------------- 标题字 ---------------- */
  /*
   * 样式：
   *   bold     —— 官方「MISS YOU」那种：粗黑无衬线（Noto Sans SC 700 + 描边加粗 + 略拉宽），白到冷灰的渐变 + 水彩肌理 + 轻微做旧；
   *               上方细线 + 右端小标签（label），下方小号宽字距副标题 + 短细线；可加 ghost（淡灰的回声字）
   *   serif    —— 中文衬线（Noto Serif SC 900，宽字距），纸纹肌理；居中的发丝线 + Cinzel 宽字距英文副标题 + 小红印章（seal）
   *   display  —— Cinzel 大写宽字距，两侧细线，JetBrains Mono 小字
   *   vertical —— 中文竖排（衬线），旁边一条竖线 + 竖排的英文小字，底部印章
   * 动画：anim = 'letters'（逐字浮现）| 'wipe'（柔边遮罩擦出）| 'fade' | 'ink'（逐字自上而下"写"出来）
   */
  const TSTYLE = {
    bold: { font: '"Noto Sans SC", "Microsoft YaHei", sans-serif', weight: 700, size: 150, fat: 0.06, track: 0.02, stretch: 1.06, fill: ['#ffffff', '#eef2f8', '#c9d5e4'],
      tex: 'watercolor', texA: 0.55, distress: 0.55, shadow: 'rgba(22,30,48,0.62)', align: 'left', anim: 'letters',
      sub: { font: '"Noto Sans SC", "Microsoft YaHei", sans-serif', weight: 500, size: 0.17, track: 0.28, color: 'rgba(255,255,255,0.94)' }, rules: 'frame', rule: 'rgba(255,255,255,0.92)' },
    serif: { font: '"Noto Serif SC", "Songti SC", SimSun, serif', weight: 900, size: 120, fat: 0, track: 0.22, stretch: 1, fill: ['#fffaf3', '#f1e4d2'],
      tex: 'paper', texA: 0.45, distress: 0.3, shadow: 'rgba(20,10,14,0.38)', align: 'center', anim: 'ink',
      sub: { font: 'Cinzel, "Times New Roman", serif', weight: 500, size: 0.2, track: 0.55, color: 'rgba(255,248,240,0.9)' }, rules: 'hair', rule: 'rgba(255,248,240,0.7)', seal: '#b3262b' },
    display: { font: 'Cinzel, "Times New Roman", serif', weight: 700, size: 110, fat: 0, track: 0.3, stretch: 1, fill: ['#ffffff', '#efe6d8'],
      tex: 'paper', texA: 0.35, distress: 0.2, shadow: 'rgba(0,0,0,0.32)', align: 'center', anim: 'wipe',
      sub: { font: '"JetBrains Mono", Consolas, monospace', weight: 400, size: 0.15, track: 0.6, color: 'rgba(255,255,255,0.86)' }, rules: 'side', rule: 'rgba(255,255,255,0.75)' },
  };
  TSTYLE.vertical = Object.assign({}, TSTYLE.serif, { vertical: true, size: 110, track: 0.18 });
  // 墨色版：亮背景（纸、晴天、雪）上用深色字 + 浅色光晕
  TSTYLE['serif-ink'] = Object.assign({}, TSTYLE.serif, { fill: ['#2a2230', '#3d2b33'], shadow: 'rgba(255,250,244,0.75)', texA: 0.55, rule: 'rgba(42,34,48,0.7)', subShadow: 'rgba(255,250,244,0.7)',
    sub: Object.assign({}, TSTYLE.serif.sub, { color: 'rgba(42,34,48,0.9)' }) });
  TSTYLE['vertical-ink'] = Object.assign({}, TSTYLE['serif-ink'], { vertical: true, size: 110, track: 0.18 });
  F.TITLES = TSTYLE;
  const MEAS = mk(8, 8).getContext('2d');
  let TV = 0;
  const pendingFonts = new Set();
  function ensureFont(font, text) {
    try {
      if (!document.fonts || document.fonts.check(font, text) || pendingFonts.has(font)) return;
      pendingFonts.add(font);
      document.fonts.load(font, text).then(() => { pendingFonts.delete(font); TV++; }, () => pendingFonts.delete(font));
    } catch (e) { /* 旧浏览器：直接用后备字体 */ }
  }
  const LAYOUT = new Map();
  function titleLayout(text, st, size) {
    const key = [text, st.font, st.weight, size, st.track, st.stretch, st.vertical ? 1 : 0].join('|');
    let L = LAYOUT.get(key); if (L) return L;
    MEAS.font = `${st.weight} ${size}px ${st.font}`; if ('letterSpacing' in MEAS) MEAS.letterSpacing = '0px';
    const chars = [...text], track = st.track * size, pad = Math.round(size * 0.3);
    if (st.vertical) {
      const step = size * (1 + st.track), w = size + 2 * pad, h = chars.length * step - st.track * size + 2 * pad;
      const pos = chars.map((c, i) => [pad + size / 2, pad + i * step + size / 2]);
      const slices = chars.map((c, i) => [pad + i * step - track / 2, pad + i * step + size + track / 2]);
      L = { chars, pos, slices, w, h, pad, tw: size, th: h - 2 * pad, size, vertical: true };
    } else {
      let x = 0, asc = 0, desc = 0; const xs = [], ws = [];
      for (const c of chars) {
        const m = MEAS.measureText(c), cw = m.width * st.stretch;
        xs.push(x); ws.push(cw); x += cw + track;
        asc = Math.max(asc, m.actualBoundingBoxAscent || size * 0.75); desc = Math.max(desc, m.actualBoundingBoxDescent || size * 0.05);
      }
      const tw = x - track, w = tw + 2 * pad, h = asc + desc + 2 * pad;
      const slices = chars.map((c, i) => [pad + xs[i] - (i ? track / 2 : pad), pad + xs[i] + ws[i] + (i < chars.length - 1 ? track / 2 : pad)]);
      L = { chars, xs, ws, asc, desc, w, h, pad, tw, th: asc + desc, size, slices, base: pad + asc };
    }
    LAYOUT.set(key, L);
    return L;
  }
  function drawGlyphs(x, L, st, color) {
    x.font = `${st.weight} ${L.size}px ${st.font}`; if ('letterSpacing' in x) x.letterSpacing = '0px';
    x.fillStyle = color; x.strokeStyle = color; x.lineJoin = 'round'; x.lineWidth = (st.fat || 0) * L.size;
    L.chars.forEach((c, i) => {
      x.save();
      if (L.vertical) { x.textAlign = 'center'; x.textBaseline = 'middle'; x.translate(L.pos[i][0], L.pos[i][1]); }
      else { x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.translate(L.pad + L.xs[i], L.base); x.scale(st.stretch || 1, 1); }
      if (st.fat) x.strokeText(c, 0, 0);
      x.fillText(c, 0, 0);
      x.restore();
    });
  }
  /** 标题主字的成品位图（按分辨率缓存）：投影 + 渐变填色 + 纹理 + 做旧 */
  function titleArt(s, text, st, L, fillOverride) {
    const fills = fillOverride || st.fill;
    return s.cache(`fin:title:${text}:${st.font}:${st.weight}:${L.size}:${st.vertical ? 'v' : 'h'}:${fills.join(',')}:${TV}`, (q) => {
      const cw = q.canvas.width, ch = q.canvas.height, T = q.getTransform(), k = T.a;
      const M = mk(cw, ch), xm = ctx(M); xm.setTransform(T); drawGlyphs(xm, L, st, '#fff');
      q.save(); q.setTransform(1, 0, 0, 1, 0, 0);
      if (st.shadow) { // 两层投影（建缓存时模糊）：宽而淡的一层托住亮背景，窄的一层勾出字形
        const S = mk(cw, ch), xs = ctx(S); xs.drawImage(M, 0, 0); xs.globalCompositeOperation = 'source-in'; xs.fillStyle = st.shadow; xs.fillRect(0, 0, cw, ch);
        const S2 = mk(cw, ch); ctx(S2).drawImage(S, 0, 0);
        blurInPlace(S, L.size * k * 0.11); q.globalAlpha = 0.9; q.drawImage(S, 0, L.size * k * 0.03);
        blurInPlace(S2, L.size * k * 0.022); q.globalAlpha = 0.75; q.drawImage(S2, 0, L.size * k * 0.012); q.globalAlpha = 1;
      }
      const C = mk(cw, ch), xc = ctx(C);
      xc.drawImage(M, 0, 0); xc.globalCompositeOperation = 'source-in';
      const gr = xc.createLinearGradient(0, L.pad * k, 0, (L.h - L.pad) * k);
      fills.forEach((c, i) => gr.addColorStop(fills.length > 1 ? i / (fills.length - 1) : 0, col(c)));
      xc.fillStyle = gr; xc.fillRect(0, 0, cw, ch);
      if (st.tex) {
        xc.globalCompositeOperation = 'soft-light'; xc.globalAlpha = st.texA ?? 0.4;
        xc.save(); xc.scale(k, k); xc.fillStyle = pattern(xc, tile(st.tex, 3)); xc.fillRect(0, 0, cw / k, ch / k); xc.restore();
        xc.globalAlpha = 1; xc.globalCompositeOperation = 'destination-in'; xc.drawImage(M, 0, 0);
      }
      if (st.distress) {
        const R = rng(7 + text.length * 131 + (text.charCodeAt(0) || 0)), n = Math.round(st.distress * (L.w * L.h) / 700), u = L.size / 150;
        xc.globalCompositeOperation = 'destination-out'; xc.save(); xc.scale(k, k);
        for (let i = 0; i < n; i++) { xc.globalAlpha = 0.35 + R() * 0.65; xc.beginPath(); xc.arc(R() * L.w, R() * L.h, (0.4 + R() * R() * 2.4) * u, 0, TAU); xc.fill(); }
        xc.lineCap = 'round';
        for (let i = 0; i < 5; i++) { xc.globalAlpha = 0.5 + R() * 0.4; xc.lineWidth = (0.5 + R() * 0.8) * u; const y0 = L.pad + R() * L.th, an = (R() - 0.5) * 0.5, len = L.size * (0.6 + R() * 1.6), x0 = R() * L.w; xc.beginPath(); xc.moveTo(x0, y0); xc.lineTo(x0 + Math.cos(an) * len, y0 + Math.sin(an) * len); xc.stroke(); }
        xc.restore();
      }
      q.drawImage(C, 0, 0);
      q.restore();
    }, L.w, L.h);
  }
  /**
   * title(g, s, { text, sub, label, seal, style: 'bold'|'serif'|'display'|'vertical', x, y, size, align,
   *               anim: 'letters'|'wipe'|'fade'|'ink', reveal (0..1，给了就不看时间) | t0 + dur, out, outDur,
   *               fill: [颜色...], subColor, ghost: true, alpha })
   * (x, y)：标题块的锚点（align 'left' 时为左缘，'center' 时为中心；y 为主字的垂直中心）
   */
  F.title = function (g, s, o) {
    if (!o || !o.text) return;
    const st = Object.assign({}, TSTYLE[o.style || 'bold'] || TSTYLE.bold, o.st || {});
    const size = o.size ?? st.size, t = s.t || 0;
    ensureFont(`${st.weight} ${size}px ${st.font}`, o.text);
    if (o.sub) ensureFont(`${st.sub.weight} ${Math.round(size * st.sub.size)}px ${st.sub.font}`, o.sub);
    const k = o.reveal != null ? clamp(o.reveal) : clamp((t - (o.t0 ?? 0)) / (o.dur ?? 1.6));
    const e = o.out != null ? 1 - clamp((t - o.out) / (o.outDur ?? 0.8)) : 1;
    if (k <= 0 || e <= 0) return;
    const L = titleLayout(o.text, st, size), art = titleArt(s, o.text, st, L, o.fill);
    const align = o.align || st.align, ax = o.x ?? VW / 2, ay = o.y ?? VH / 2;
    const bx = L.vertical ? ax - L.w / 2 : align === 'left' ? ax - L.pad : align === 'right' ? ax - L.w + L.pad : ax - L.w / 2;
    const by = L.vertical ? ay - L.h / 2 : ay - L.pad - L.th / 2;
    g.save();
    g.globalAlpha *= clamp(o.alpha ?? 1) * sm(e);
    if (e < 1) g.translate(0, -(1 - sm(e)) * size * 0.06);
    const base = g.globalAlpha, kx = art.width / L.w, ky = art.height / L.h, anim = o.anim || st.anim;
    if (o.ghost && !L.vertical) { g.globalAlpha = base * 0.13 * sm(clamp(k * 1.5 - 0.3)); g.drawImage(art, bx + size * 0.05, by + size * 0.66, L.w, L.h); g.globalAlpha = base; }
    if (k >= 1 || anim === 'fade') {
      const f = anim === 'fade' ? sm(k) : 1, z = 1 + (1 - f) * 0.04;
      g.globalAlpha = base * f;
      g.translate(bx + L.w / 2, by + L.h / 2); g.scale(z, z); g.drawImage(art, -L.w / 2, -L.h / 2, L.w, L.h); g.scale(1 / z, 1 / z); g.translate(-bx - L.w / 2, -by - L.h / 2);
      g.globalAlpha = base;
    } else if (anim === 'wipe') {
      const T = pool('tw', art.width, art.height), xt = ctx(T), edge = 0.22, p = k * (1 + edge);
      blit(xt, art, art.width, art.height, art.width, art.height, 'copy');
      const gr = L.vertical ? xt.createLinearGradient(0, 0, 0, T.height) : xt.createLinearGradient(0, 0, T.width, 0);
      gr.addColorStop(clamp(p - edge), 'rgba(0,0,0,1)'); gr.addColorStop(clamp(p), 'rgba(0,0,0,0)');
      op(xt, 'destination-in'); xt.fillStyle = gr; xt.fillRect(0, 0, T.width, T.height); done(xt);
      g.drawImage(T, 0, 0, art.width, art.height, bx, by, L.w, L.h);
    } else {
      const n = L.slices.length, spread = anim === 'ink' ? 1.6 : 3.2;
      for (let i = 0; i < n; i++) {
        const ki = clamp((k * (n + spread) - i) / spread); if (ki <= 0) continue;
        const [a0, a1] = L.slices[i], e2 = E.ease.out(ki);
        g.globalAlpha = base * sm(ki);
        if (L.vertical) {
          const hh = anim === 'ink' ? (a1 - a0) * e2 : a1 - a0, dy = anim === 'ink' ? 0 : -(1 - e2) * size * 0.2;
          if (hh > 0.5) g.drawImage(art, 0, a0 * ky, art.width, hh * ky, bx, by + a0 + dy, L.w, hh);
        } else if (anim === 'ink') {
          const hh = L.h * e2; if (hh > 0.5) g.drawImage(art, a0 * kx, 0, (a1 - a0) * kx, hh * ky, bx + a0, by, a1 - a0, hh);
        } else g.drawImage(art, a0 * kx, 0, (a1 - a0) * kx, art.height, bx + a0, by + (1 - e2) * size * 0.22, a1 - a0, L.h);
      }
      g.globalAlpha = base;
    }
    titleDeco(g, s, o, st, L, bx, by, k, size, base);
    g.restore();
  };
  /** 小字精灵（副标题 / 标签）：宽字距 + 建缓存时模糊的柔和投影；按分辨率缓存，每帧只贴图 */
  const TXT = new Map();
  function textSprite(s, str, font, track, color, shadow) {
    const key = [str, font, track, color, shadow, TV].join('|');
    let T = TXT.get(key);
    if (!T) {
      MEAS.font = font; if ('letterSpacing' in MEAS) MEAS.letterSpacing = track + 'px';
      const sz = parseFloat((font.match(/([\d.]+)px/) || [0, 30])[1]), tw = MEAS.measureText(str).width - (('letterSpacing' in MEAS) ? track : 0);
      if ('letterSpacing' in MEAS) MEAS.letterSpacing = '0px';
      const pad = Math.ceil(sz * 0.7);
      T = { w: Math.ceil(tw + 2 * pad), h: Math.ceil(sz * 1.6 + 2 * pad), pad, tw, sz };
      TXT.set(key, T);
      if (TXT.size > 200) TXT.delete(TXT.keys().next().value);
    }
    const c = s.cache('fin:txt:' + key, (q) => {
      const draw = (x, fill) => { x.font = font; if ('letterSpacing' in x) x.letterSpacing = track + 'px'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = fill; x.fillText(str, T.pad, T.h / 2); };
      if (shadow) {
        const M = q.getTransform(), S = mk(q.canvas.width, q.canvas.height), xs = ctx(S); xs.setTransform(M); draw(xs, shadow);
        blurInPlace(S, T.sz * M.a * 0.2);
        q.save(); q.setTransform(1, 0, 0, 1, 0, 0); q.drawImage(S, 0, 0); q.drawImage(S, 0, 0); q.restore();
      }
      draw(q, color);
    }, T.w, T.h);
    return { c, ...T };
  }
  /** 细线（带 1px 暗边，亮背景上也看得见） */
  function ruleLine(g, x, y, w, h, color, a) {
    if (w <= 0.5 || h <= 0.5 || a <= 0.003) return;
    const pa = g.globalAlpha;
    g.globalAlpha = pa * a * 0.35; g.fillStyle = 'rgba(10,14,24,1)';
    if (w >= h) g.fillRect(x, y + h, w, Math.max(1, h * 0.8)); else g.fillRect(x + w, y, Math.max(1, w * 0.8), h);
    g.globalAlpha = pa * a; g.fillStyle = color; g.fillRect(x, y, w, h);
    g.globalAlpha = pa;
  }
  function titleDeco(g, s, o, st, L, bx, by, k, size, base) {
    const grow = E.ease.inOut(clamp(k * 1.25)), late = sm(clamp((k - 0.45) / 0.55)), sub = st.sub;
    const subSize = Math.round(size * sub.size), rule = o.ruleColor || st.rule, shadow = st.subShadow ?? 'rgba(8,12,24,0.55)';
    const subSpr = o.sub ? textSprite(s, o.sub, `${sub.weight} ${subSize}px ${sub.font}`, +(sub.track * subSize).toFixed(1), o.subColor || sub.color, shadow) : null;
    const putSub = (x, y, align) => { // (x, y)：文字左缘（或中心）与垂直中心
      const dx = align === 'center' ? x - subSpr.tw / 2 - subSpr.pad : x - subSpr.pad;
      g.drawImage(subSpr.c, dx, y - subSpr.h / 2, subSpr.w, subSpr.h);
    };
    g.save();
    if (L.vertical) {
      const x = bx + L.w + size * 0.12, y0 = by + L.pad;
      ruleLine(g, x, y0, 1.6, L.th * grow, rule, 1);
      if (subSpr) { g.globalAlpha = base * late; g.translate(x + subSize * 1.1, y0); g.rotate(Math.PI / 2); putSub(0, 0, 'left'); }
      g.restore();
      if (o.seal !== false && st.seal) seal(g, o.seal || L.chars[0], bx + L.w / 2, by + L.h + size * 0.1, size * 0.36, st.seal, base * sm(clamp((k - 0.7) / 0.3)));
      return;
    }
    const x0 = bx + L.pad, x1 = x0 + L.tw, cx = (x0 + x1) / 2, top = by + L.pad, bot = by + L.pad + L.th;
    if (st.rules === 'frame') {
      const rh = Math.max(1.6, size * 0.014);
      ruleLine(g, x0, top - size * 0.17, L.tw * grow, rh, rule, 1);
      if (o.label) { g.globalAlpha = base * late; const T = textSprite(s, o.label, `400 ${Math.round(size * 0.1)}px "JetBrains Mono", Consolas, monospace`, 1, rule, shadow); g.drawImage(T.c, x1 - T.tw - T.pad, top - size * 0.26 - T.h / 2, T.w, T.h); }
      if (subSpr) {
        g.globalAlpha = base * late; putSub(x0 + (1 - late) * -12, bot + size * 0.2 + subSize * 0.6, 'left');
        g.globalAlpha = base; ruleLine(g, x0, bot + size * 0.26 + subSize * 1.3, L.tw * 0.5 * grow, Math.max(1.3, size * 0.01), rule, 1);
      }
    } else if (st.rules === 'hair') {
      const w = L.tw * 0.62 * grow;
      ruleLine(g, cx - w / 2, bot + size * 0.26, w, 1.4, rule, 0.9);
      if (subSpr) { g.globalAlpha = base * late; putSub(cx + (sub.track * subSize) / 2, bot + size * 0.4 + subSize * 0.6, 'center'); }
      if (o.seal !== false && st.seal && o.seal) seal(g, o.seal, x1 + size * 0.34, top + size * 0.16, size * 0.3, st.seal, base * sm(clamp((k - 0.7) / 0.3)));
    } else if (st.rules === 'side') {
      const len = size * 1.3 * grow, gap = size * 0.35, ym = top + L.th * 0.52;
      ruleLine(g, x0 - gap - len, ym, len, 1.5, rule, 1); ruleLine(g, x1 + gap, ym, len, 1.5, rule, 1);
      if (subSpr) { g.globalAlpha = base * late; putSub(cx + (sub.track * subSize) / 2, bot + size * 0.3 + subSize * 0.6, 'center'); }
    }
    g.restore();
  }
  function seal(g, ch, x, y, sz, color, a) {
    if (a <= 0.003) return;
    g.save(); g.globalAlpha *= a; g.translate(x, y); g.rotate(-0.04);
    g.fillStyle = color; g.fillRect(-sz / 2, -sz / 2, sz, sz);
    g.strokeStyle = 'rgba(255,240,236,0.85)'; g.lineWidth = Math.max(1, sz * 0.04); g.strokeRect(-sz / 2 + sz * 0.1, -sz / 2 + sz * 0.1, sz * 0.8, sz * 0.8);
    g.fillStyle = '#fff4ef'; g.font = `900 ${Math.round(sz * 0.56)}px "Noto Serif SC", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.fillText(ch, 0, sz * 0.03);
    g.restore();
  }

  /* ---------------- 成片：一次调用的整套后期 ---------------- */
  /*
   * LOOKS：每个"成片风格"打包了 辉光 + 调色 + 纹理 + 漏光 + 暗角 + 颗粒（对应官方 MV 里的几种分段调色）
   *   rain-cool        冷灰去饱和、只留红色（Miss You 的雨天街道）
   *   duotone-magenta  洋红双色调（Miss You 副歌的粉色城市）
   *   siesta-sunset    紫粉晚霞 + 青色暗部（火山旅梦 PV 的黄昏）
   *   summer-noon      正午盛夏：饱和、通透、暖高光（火山旅梦 PV 的码头）
   *   dream-pink       粉紫梦境：抬起的暗部、柔光
   *   memory-sepia     回忆：棕褐单色 + 纸纹 + 灰尘划痕
   *   dawn / night-blue / golden-hour / ember / film
   */
  const LOOKS = {
    film: { bloom: { strength: 0.3, threshold: 0.72 }, grade: 'film', vignette: 0.32, grain: 0.07 },
    'rain-cool': { bloom: { strength: 0.32, threshold: 0.7, tint: '215,228,255', radius: 5 }, grade: 'rain-cool', texture: [{ kind: 'paper', a: 0.22 }], vignette: { a: 0.4, rgb: '10,16,28' }, grain: 0.09 },
    'duotone-magenta': { bloom: { strength: 0.35, threshold: 0.66, tint: '255,190,215' }, grade: 'duotone-magenta', texture: [{ kind: 'watercolor', a: 0.35 }], vignette: { a: 0.35, rgb: '40,6,30' }, grain: 0.08 },
    'siesta-sunset': { bloom: { strength: 0.5, threshold: 0.6, tint: '255,196,170', halation: 0.25 }, grade: 'siesta-sunset', leak: { palette: 'pink', a: 0.28, side: 'tr' }, vignette: { a: 0.35, rgb: '30,10,40' }, grain: 0.06 },
    'summer-noon': { bloom: { strength: 0.35, threshold: 0.78, tint: '255,248,230' }, grade: 'summer-noon', leak: { palette: 'gold', a: 0.18, side: 'tr' }, vignette: 0.22, grain: 0.05 },
    'dream-pink': { bloom: { strength: 0.42, threshold: 0.68, tint: '255,200,230', radius: 5, key: 'rgb' }, grade: 'dream-pink', leak: { palette: 'pink', a: 0.2, side: 'left' }, vignette: { a: 0.42, rgb: '26,8,34' }, grain: 0.07 },
    'memory-sepia': { bloom: { strength: 0.3, threshold: 0.7 }, grade: 'memory-sepia', texture: [{ kind: 'paper', a: 0.5 }, { kind: 'dust', a: 0.6 }, { kind: 'scratches', a: 0.3 }], vignette: { a: 0.55, rgb: '30,18,8' }, grain: 0.12 },
    dawn: { bloom: { strength: 0.4, threshold: 0.66, tint: '255,214,190', halation: 0.2 }, grade: 'dawn', leak: { palette: 'peach', a: 0.22, side: 'right' }, vignette: 0.3, grain: 0.06 },
    'night-blue': { bloom: { strength: 0.5, threshold: 0.55, radius: 5, key: 'rgb' }, grade: 'night-blue', vignette: { a: 0.5, rgb: '2,4,16' }, grain: 0.08 },
    'golden-hour': { bloom: { strength: 0.42, threshold: 0.74, tint: '255,214,160', halation: 0.2 }, grade: 'golden-hour', leak: { palette: 'warm', a: 0.25, side: 'tr' }, vignette: { a: 0.36, rgb: '30,14,4' }, grain: 0.06 },
    ember: { bloom: { strength: 0.55, threshold: 0.55, halation: 0.35, radius: 5, key: 'rgb' }, grade: 'ember', vignette: { a: 0.5, rgb: '10,2,2' }, grain: 0.08 },
  };
  F.LOOKS = LOOKS;
  const warned = new Set();
  function warn(name, e) { if (!warned.has(name)) { warned.add(name); console.warn('[finish]', name, e); } }
  /**
   * frame(g, s, look | { bloom, grade, amount, texture, leak, lens, vignette, grain, letterbox })
   * 顺序：辉光（先于调色，像镜头 / 胶片那样）→ 调色 → 纹理 → 漏光 / 镜头 → 暗角 → 颗粒 → 黑边。
   * 每项出错只会跳过该项（控制台警告一次），不影响影片。F.profile = true 时按项累计耗时到 F.stats.fx。
   */
  F.frame = function (g, s, o) {
    if (!F.enabled || !o) return;
    if (typeof o === 'string') o = LOOKS[o] || { grade: o };
    const prof = F.profile, T0 = performance.now(), P = lazyPyr(g);
    const run = (name, fn) => {
      const t0 = prof ? performance.now() : 0;
      try { fn(); } catch (e) { warn(name, e); }
      if (prof) { const r = F.stats.fx[name] || (F.stats.fx[name] = { n: 0, sum: 0, max: 0 }), d = performance.now() - t0; r.n++; r.sum += d; r.max = Math.max(r.max, d); }
    };
    if (o.bloom) run('bloom', () => F.bloom(g, s, o.bloom, P));
    if (o.grade) run('grade', () => F.grade(g, s, o.grade, o.amount ?? 1, P));
    if (o.texture) run('texture', () => { for (const tx of [].concat(o.texture)) F.texture(g, s, tx); });
    if (o.leak) run('leak', () => F.leak(g, s, o.leak));
    if (o.lens) run('lens', () => F.lens(g, s, o.lens));
    if (o.vignette) run('vignette', () => F.vignette(g, s, o.vignette));
    if (o.grain) run('grain', () => F.grain(g, s, o.grain));
    if (o.letterbox) run('letterbox', () => E.post.letterbox(g, o.letterbox));
    const d = performance.now() - T0; F.stats.frame = d; F.stats.n++; F.stats.sum += d;
  };

  /* ---------------- 分段调色时间线 ---------------- */
  const resolve = (L) => (typeof L === 'string' ? LOOKS[L] || { grade: L } : L || {});
  const AMOUNT = new Set(['strength', 'a', 'halation', 'dirt', 'burst', 'density']);
  const NUMKEY = { bloom: 'strength', vignette: 'a', grain: 'a', leak: 'a' };
  function norm(key, v) {
    if (v === true) return {};
    if (typeof v === 'number' && NUMKEY[key]) return { [NUMKEY[key]]: v };
    return v;
  }
  const isRgb = (v) => typeof v === 'string' && /^\d+\s*,\s*\d+\s*,\s*\d+$/.test(v);
  function lerpRgb(a, b, k) { const A = a.split(',').map(Number), B = b.split(',').map(Number); return A.map((x, i) => Math.round(lerp(x, B[i], k))).join(','); }
  function mixObj(a, b, k) {
    const out = {};
    for (const f of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
      const x = a ? a[f] : undefined, y = b ? b[f] : undefined;
      if (typeof x === 'number' && typeof y === 'number') out[f] = lerp(x, y, k);
      else if (isRgb(x) && isRgb(y)) out[f] = lerpRgb(x, y, k);
      else if (y === undefined) out[f] = AMOUNT.has(f) && typeof x === 'number' ? x * (1 - k) : x;
      else if (x === undefined) out[f] = AMOUNT.has(f) && typeof y === 'number' ? y * k : y;
      else out[f] = k < 0.5 ? x : y;
    }
    // 只有一边有这一项：整体淡入 / 淡出
    if (!a) for (const f of AMOUNT) if (typeof out[f] === 'number' && b && b[f] != null) out[f] = b[f] * k;
    if (!b) for (const f of AMOUNT) if (typeof out[f] === 'number' && a && a[f] != null) out[f] = a[f] * (1 - k);
    return out;
  }
  function pushMix(mix, gr, w) { if (gr && gr.mix) for (const [sp, ww] of gr.mix) mix.push([sp, ww * w]); else if (gr) mix.push([gr, w]); }
  function mixLook(A, B, k) {
    const out = {};
    for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const a = A[key], b = B[key];
      if (key === 'grade') { const mix = []; pushMix(mix, a, 1 - k); pushMix(mix, b, k); out.grade = { mix }; continue; }
      if (key === 'amount') { out.amount = lerp(a ?? 1, b ?? 1, k); continue; }
      if (key === 'texture') {
        const list = [];
        for (const [v, w] of [[a, 1 - k], [b, k]]) if (v) for (const tx of [].concat(v)) { const o2 = typeof tx === 'string' ? { kind: tx } : Object.assign({}, tx); o2.a = (o2.a ?? (TEXDEF[o2.kind] ? TEXDEF[o2.kind].a : 0.3)) * w; list.push(o2); }
        out.texture = list; continue;
      }
      if (key === 'letterbox') { out.letterbox = lerp(+a || 0, +b || 0, k); continue; }
      const na = a == null || a === false ? null : norm(key, a), nb = b == null || b === false ? null : norm(key, b);
      if (na && typeof na === 'object' && (!nb || typeof nb === 'object') || nb && typeof nb === 'object' && !na) out[key] = mixObj(na, nb, k);
      else out[key] = k < 0.5 ? a : b;
    }
    return out;
  }
  /**
   * look(t, cues, fade = 1)：cues = [[t0, look], [t1, look2], ...]（look 为预设名或选项对象，按时间排好）。
   * 返回 t 时刻的 frame 选项；进入新一段后的 fade 秒内与上一段交叉淡化（数值插值，调色按权重混合）。
   */
  F.look = function (t, cues, fade = 1) {
    if (!cues || !cues.length) return null;
    let i = 0; while (i + 1 < cues.length && cues[i + 1][0] <= t) i++;
    const cur = resolve(cues[i][1]);
    if (i === 0 || fade <= 0) return cur;
    const k = clamp((t - cues[i][0]) / fade);
    return k >= 1 ? cur : mixLook(resolve(cues[i - 1][1]), cur, sm(k));
  };
  F.mixLook = (a, b, k) => mixLook(resolve(a), resolve(b), clamp(k));

  /** 预先生成纹理 / 精灵（放进影片 prepare 或空闲时）：warm(['paper', 'watercolor', 'grain', 'dirt', 'ripple', 'dust', 'topo']) */
  F.warm = function (kinds) {
    const list = kinds || ['paper', 'grain', 'dirt'];
    for (const k of list) {
      try {
        if (BUILD[k]) tile(k, 1);
        else if (k === 'grain') { grainTiles(false); grainTiles(true); }
        else if (k === 'dirt') dirtTex();
        else if (k === 'ripple') rippleSprite();
        else if (k === 'dust') dustSheets();
        else if (k === 'topo') topoData(3);
        else if (LOOKS[k]) { const L = LOOKS[k]; if (L.texture) for (const tx of [].concat(L.texture)) { const kind = tx.kind || tx; if (BUILD[kind]) tile(kind, tx.seed ?? 1); } grainTiles(false); }
      } catch (e) { warn('warm ' + k, e); }
    }
  };
  /** 预建标题位图（字体已加载时），避免第一次出现时卡一帧 */
  F.warmTitle = function (s, o) {
    const st = Object.assign({}, TSTYLE[o.style || 'bold'] || TSTYLE.bold, o.st || {}), size = o.size ?? st.size;
    titleArt(s, o.text, st, titleLayout(o.text, st, size), o.fill);
  };
  F.resetStats = () => { F.stats = { frame: 0, n: 0, sum: 0, fx: {} }; };
  F._pool = POOL; F._pyramid = pyramid;

  E.finish = F;
})();
