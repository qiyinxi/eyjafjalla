/* =========================================================
 * 影像 V · 汽水 —— Effervescence（番外 · 汐斯塔的下午）
 * 本页原创的同人 MV（Canvas 2D 实时渲染；画面是时间 t 的纯函数），与官方无关。
 *
 * 故事（「雾中之忆」的前传；与「晴日之约」是同一天的两个视角）
 *   汐斯塔最热的那个下午。海边的汽水摊老板在遮阳篷下打盹，冰柜里的汽水瓶在太阳下冒汗。
 *   热浪里浮出一个粉色的小鼻子——一群谁也看不见的粉色小羊（多利的化身）盯上了汽水。
 *   它们踮着脚溜过打盹的老板，叠成一座“羊塔”够到工坊的门把手，拉下了灌装机的红色拉杆：
 *   流水线轰隆隆转起来，一拍一个瓶盖；小羊们偷喝、打嗝、把瓶子排成队运走——老板只看见汽水自己飘走。
 *   压力表一格格爬进红区，工坊安静了一瞬——然后“砰”：一道粉色的汽水喷泉冲破屋顶。
 *   小羊们踩着泡沫冲浪，骑着摇过的汽水瓶飞上天；在最高处，时间停了一下，整个汐斯塔在脚下冒泡。
 *   它们掠过港口和集市，在白色的屋顶上开了一场汽水喷泉派对；老板追到屋顶，对着空气举起瓶子——“叮”。
 *   天黑了。它们把剩下的汽水装进 7 号货箱，顶着它穿过挂满灯笼的街道，爬上岬角，敲响火山博物馆的门，
 *   一溜烟钻进箱子。门开了：纯烬时期的阿黛尔看见门口只有一只嗡嗡冒泡的货箱，挑了挑眉，笑着把它拖了进去
 *   ——那天深夜，它在博物馆里翻倒了（片 II 的开头）。彩蛋：台阶上的瓶盖上，有一枚粉色的小蹄印。
 *
 * 结构：镜头边界对齐小节线（D[i] = 第 i 小节的起点，≈112.87 BPM，一小节 ≈2.12s），
 *   满段（36.6–70.6、85.5–102.5、113.1–155.6）多用 1–2 小节的硬切；间奏与断拍处用长镜头和慢动作。
 * 技术：静态大图层走自带的 LRU 位图缓存（按分辨率区分、总量有上限，release() 全部释放）+ 切镜头前预热；
 *   小羊用角色库画好的精灵图（特写时直接画矢量）；气泡、泡沫、水滴都是缓存的小精灵，由 t 解析地算出位置。
 * ========================================================= */
(() => {
  'use strict';
  const E = window.MVE;
  if (!E) return;
  const { VW, VH, TAU, clamp, lerp, ease, hash, wobble } = E;
  const PI = Math.PI;
  const { sin, cos, abs, min, max, floor, pow, sqrt, exp, hypot, atan2 } = Math;
  const fract = (x) => x - floor(x);
  const sst = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  /** 梯形窗：a→b 升起，c→d 落下 */
  const win = (x, a, b, c, d) => min(sst(a, b, x), 1 - sst(c, d, x));
  const pick = (arr, r) => arr[min(arr.length - 1, floor(r * arr.length))];

  /* 小节线（assets/music/effervescence.json 的 downbeats；≈112.87 BPM，一小节 ≈2.12s） */
  const D = [0.555, 2.656, 4.779, 6.901, 9.035, 11.147, 13.269, 15.392, 17.525, 19.648, 21.771, 23.883, 26.016, 28.139, 30.261, 32.384, 34.517, 36.64, 38.763, 40.885,
    43.008, 45.131, 47.253, 49.376, 51.509, 53.632, 55.744, 57.877, 60, 62.123, 64.245, 66.368, 68.491, 70.613, 72.736, 74.859, 76.981, 79.115, 81.237, 83.36,
    85.483, 87.605, 89.728, 91.851, 93.973, 96.107, 98.229, 100.352, 102.475, 104.608, 106.731, 108.843, 110.965, 113.099, 115.211, 117.344, 119.467, 121.589, 123.712, 125.835,
    127.957, 130.091, 132.213, 134.336, 136.459, 138.581, 140.704, 142.827, 144.949, 147.083, 149.205, 151.328, 153.451, 155.573, 157.696, 159.819, 161.941, 164.064, 166.187, 168.32,
    170.453, 172.576, 174.699, 176.832, 178.955];
  const BEAT = 60 / 112.87;
  const DUR = 179.70;

  const cast = (g, who, o) => { if (E.cast && E.cast.draw) E.cast.draw(g, who, o); };
  function anchor(who, o, key, fb) {
    try { if (E.cast && E.cast.anchors) { const A = E.cast.anchors(who, o); if (A && A[key]) return A[key]; } } catch (e) { /* 用估计值 */ }
    return fb;
  }

  /* =========================================================
   * 缓存（与片 II 同一套思路）
   * ========================================================= */
  // 大图层：按分辨率 k 区分，最近最少使用的先丢（上限约 14 个整屏；切走时 release() 全部释放）
  const LRU = new Map();
  let lruPx = 0, maxK = 0;
  function lcBuild(ck, w, h, fn, k, sk) {
    const c = E.mk(w * k, h * k);
    const q = c.getContext('2d');
    q.setTransform(k, 0, 0, k, 0, 0);
    fn(q, k);
    LRU.set(ck, c);
    lruPx += c.width * c.height;
    if (sk > maxK) maxK = sk;
    const cap = 14 * VW * VH * maxK * maxK;
    for (const [kk, cc] of LRU) {
      if (lruPx <= cap || kk === ck) break;
      LRU.delete(kk); lruPx -= cc.width * cc.height; cc.width = cc.height = 1;
    }
    return c;
  }
  // 预热：切镜头前约 2.6 秒，把下一个镜头“空跑”一遍（画到 2×2 的假画布上），记下缺的图层，之后每帧花几毫秒建好
  const DUMMY = E.mk(1, 1);
  let warmMode = false;
  const warmQ = [];
  function LC(s, key, w, h, fn, res = 1) {
    const k = s.k * res, ck = key + '@' + k.toFixed(3);
    const c = LRU.get(ck);
    if (c) { LRU.delete(ck); LRU.set(ck, c); return c; }
    if (warmMode) { if (!warmQ.some((it) => it.ck === ck)) warmQ.push({ ck, w, h, fn, k, sk: s.k }); return DUMMY; }
    return lcBuild(ck, w, h, fn, k, s.k);
  }
  function release() {
    for (const c of LRU.values()) c.width = c.height = 1;
    LRU.clear(); lruPx = 0; maxK = 0; warmQ.length = 0; warmedAt.clear();
    for (const c of SPM.values()) c.width = c.height = 1;
    SPM.clear();
    if (NBUF) { NBUF.width = NBUF.height = 1; NBUF = null; }
  }
  function warmStep(ms, sk) {
    const t0 = performance.now();
    while (warmQ.length && performance.now() - t0 < ms) { const it = warmQ.shift(); if (it.sk === sk && !LRU.has(it.ck)) lcBuild(it.ck, it.w, it.h, it.fn, it.k, it.sk); }
  }
  const warmedAt = new Map(), dummyCtx = E.mk(2, 2).getContext('2d');
  function fakeState(s, shot, t) {
    const T = s.T, lt = t - shot.t0, dur = (Number.isFinite(shot.t1) ? shot.t1 : T.duration) - shot.t0;
    const beat = T.beatAt(t), bar = T.barAt(t), bp = beat - floor(beat), barp = bar - floor(bar);
    return Object.assign({}, s, {
      t, lt, dur, p: clamp(lt / dur), shot, beat, bar, bp, barp,
      pulse: (sh = 6) => exp(-bp * sh), barPulse: (sh = 4) => exp(-barp * sh),
      e: T.env('rms', t), lo: T.env('low', t), mid: T.env('mid', t), hi: T.env('high', t),
      raw: (key) => T.raw(key, t), acc: (d) => T.accent(t, d),
      at: (a, b, e) => E.span(lt, a, b, e), abs: (a, b, e) => E.span(t, a, b, e),
    });
  }
  function warmAhead(s) {
    if (s.k < 0.45) return; // 海报、缩略图：只画一帧，不必预热
    warmStep(4, s.k);
    const S = s.film.shots, i = S.indexOf(s.shot), nx = S[i + 1];
    if (!nx || nx.t0 - s.t > 2.6 || nx.t0 <= s.t) return;
    const wk = nx.id + '@' + s.k.toFixed(3), now = performance.now();
    if (warmedAt.has(wk) && now - warmedAt.get(wk) < 20000) return;
    warmedAt.set(wk, now);
    warmMode = true;
    try { dummyCtx.setTransform(s.k, 0, 0, s.k, 0, 0); nx.draw(dummyCtx, fakeState(s, nx, nx.t0 + 0.05)); } catch (e) { /* 空跑失败不影响正片 */ }
    warmMode = false;
  }
  // 小精灵：固定像素尺寸
  const SPM = new Map();
  function spr(key, w, h, fn) { let c = SPM.get(key); if (!c) { c = E.mk(w, h); fn(c.getContext('2d'), w, h); SPM.set(key, c); } return c; }

  /* =========================================================
   * 相机：与引擎 s.layer 相同的视差变换；baked() 把静态层按“基准机位”烘焙
   * ========================================================= */
  function camT(q, c, d) {
    const z = 1 + ((c.z ?? 1) - 1) * d;
    q.translate(960 + (c.sx || 0) * d, 540 + (c.sy || 0) * d);
    if (c.r) q.rotate(c.r * min(1, d));
    q.scale(z, z);
    q.translate(-960 - ((c.x ?? 960) - 960) * d, -540 - ((c.y ?? 540) - 540) * d);
  }
  function inCam(g, c, d, fn) { g.save(); camT(g, c, d); fn(g); g.restore(); }
  const BM = 0.1;
  function baked(g, s, key, base, cam, d, fn, res = 1, crop = null) {
    const W = VW * (1 + 2 * BM), H = VH * (1 + 2 * BM);
    const zb = 1 + ((base.z ?? 1) - 1) * d, zc = 1 + ((cam.z ?? 1) - 1) * d;
    const dbx = ((base.x ?? 960) - 960) * d, dby = ((base.y ?? 540) - 540) * d;
    const dcx = ((cam.x ?? 960) - 960) * d, dcy = ((cam.y ?? 540) - 540) * d;
    let u0 = 0, v0 = 0, u1 = W, v1 = H;
    if (crop) {
      const sx = (x) => 960 + zb * (x - 960 - dbx) + VW * BM, sy = (y) => 540 + zb * (y - 540 - dby) + VH * BM;
      u0 = max(0, floor(sx(crop[0]))); v0 = max(0, floor(sy(crop[1]))); u1 = min(W, Math.ceil(sx(crop[2]))); v1 = min(H, Math.ceil(sy(crop[3])));
      if (u1 <= u0 || v1 <= v0) return;
    }
    const cw = u1 - u0, ch = v1 - v0;
    // 开发检查：当前机位看得见、而且这一层有内容的那块，是否都在烘焙图里（window.__effCover 存在时记下缺口）
    if (window.__effCover) {
      const X = (u) => 960 + dbx + (u - VW * BM - 960) / zb, Y = (v) => 540 + dby + (v - VH * BM - 540) / zb;
      const sr = abs(sin((cam.r || 0) * min(1, d))), hw0 = (960 + abs(cam.sx || 0) * d) / zc, hh0 = (540 + abs(cam.sy || 0) * d) / zc, hw = hw0 + hh0 * sr, hh = hh0 + hw0 * sr;
      let nx0 = 960 + dcx - hw, nx1 = 960 + dcx + hw, ny0 = 540 + dcy - hh, ny1 = 540 + dcy + hh;
      if (crop) { nx0 = max(nx0, crop[0]); nx1 = min(nx1, crop[2]); ny0 = max(ny0, crop[1]); ny1 = min(ny1, crop[3]); }
      const def = max(X(u0) - nx0, nx1 - X(u1), Y(v0) - ny0, ny1 - Y(v1));
      if (nx1 > nx0 && ny1 > ny0 && def * zc > 1.5) window.__effCover.push([+s.t.toFixed(2), s.shot.id, key, +(def * zc).toFixed(1)]);
    }
    const c = LC(s, key, cw, ch, (q) => { q.translate(-u0, -v0); q.translate(VW * BM, VH * BM); camT(q, base, d); fn(q); }, res);
    g.save();
    g.translate(960 + (cam.sx || 0) * d, 540 + (cam.sy || 0) * d);
    if (cam.r) g.rotate(cam.r * min(1, d));
    g.translate(zc * (dbx - dcx), zc * (dby - dcy));
    g.scale(zc / zb, zc / zb);
    g.translate(-960 - VW * BM, -540 - VH * BM);
    const kk = s.k * res;
    g.drawImage(c, 0, 0, min(c.width, cw * kk), min(c.height, ch * kk), u0, v0, cw, ch);
    g.restore();
  }
  /**
   * 一组机位（不含手持抖动）在视差层 d 上的并集视野 → 烘焙用的基准机位与分辨率：
   * 保证整个镜头运动过程中烘焙图层都盖满画面（不会在推拉摇移的尽头露出边）
   */
  function unionBase(cams, d = 1, pad = 60) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, zmax = 0;
    for (const c of cams) {
      const z = 1 + ((c.z ?? 1) - 1) * d, cx = 960 + ((c.x ?? 960) - 960) * d, cy = 540 + ((c.y ?? 540) - 540) * d;
      const hw = 960 / z + pad, hh = 540 / z + pad;
      x0 = min(x0, cx - hw); x1 = max(x1, cx + hw); y0 = min(y0, cy - hh); y1 = max(y1, cy + hh); zmax = max(zmax, z);
    }
    const zb = min(VW * (1 + 2 * BM) / (x1 - x0), VH * (1 + 2 * BM) / (y1 - y0));
    const bx = 960 + ((x0 + x1) / 2 - 960) / d, by = 540 + ((y0 + y1) / 2 - 540) / d;
    return { x: bx, y: by, z: 1 + (zb - 1) / d, res: clamp(zmax / zb * 1.02, 0.6, 2.4) };
  }
  const BASEC = new Map();
  /** 镜头路径 path(lt) 的烘焙基准（按镜头缓存；只与镜头定义有关，不是动画状态） */
  function pathBase(s, path, d = 1, pad = 60, a = 0, bEnd = null, tag = '') {
    const key = s.shot.id + ':' + d + ':' + pad + ':' + tag;
    let b = BASEC.get(key);
    if (!b) { const e = bEnd == null ? s.dur : bEnd, cams = []; for (let i = 0; i <= 12; i++) cams.push(path(a + ((e - a) * i) / 12)); b = unionBase(cams, d, pad); BASEC.set(key, b); }
    return b;
  }
  /** 在像素数组上做一次可分离的盒式模糊（横、竖各 r 像素；做两遍≈高斯），只在建缓存时跑一次 */
  function boxBlurRGBA(d, w, h, r) {
    if (r < 1) return;
    const tmp = new Float32Array(w * h * 4), win = r * 2 + 1;
    for (let pass = 0; pass < 2; pass++) {
      // 横向：d → tmp
      for (let y = 0; y < h; y++) {
        const row = y * w * 4;
        for (let c = 0; c < 4; c++) {
          let acc = 0;
          for (let k = -r; k <= r; k++) acc += d[row + clamp(k, 0, w - 1) * 4 + c];
          for (let x = 0; x < w; x++) {
            tmp[row + x * 4 + c] = acc / win;
            acc += d[row + min(w - 1, x + r + 1) * 4 + c] - d[row + max(0, x - r) * 4 + c];
          }
        }
      }
      // 纵向：tmp → d
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 4; c++) {
          let acc = 0;
          for (let k = -r; k <= r; k++) acc += tmp[clamp(k, 0, h - 1) * w * 4 + x * 4 + c];
          for (let y = 0; y < h; y++) {
            d[y * w * 4 + x * 4 + c] = acc / win;
            acc += tmp[min(h - 1, y + r + 1) * w * 4 + x * 4 + c] - tmp[max(0, y - r) * w * 4 + x * 4 + c];
          }
        }
      }
    }
  }
  /** 预先糊好的图层（景深）：画到小画布上 → 盒式模糊两遍 → 放大。只建一次（进 LRU）。amount：模糊半径（设计像素，≈高斯的 σ×2） */
  function blurred(s, key, w, h, fn, scale = 0.1, amount = null) {
    return LC(s, 'blur:' + key, w, h, (q) => {
      const sc = min(0.25, max(scale * 2.2, 0.08));
      const sw = max(8, Math.round(w * sc)), sh = max(8, Math.round(h * sc));
      const a = E.mk(sw, sh), qa = a.getContext('2d', { willReadFrequently: true }); qa.scale(sw / w, sh / h); fn(qa);
      const im = qa.getImageData(0, 0, sw, sh), px = im.data;
      const r = Math.round((amount != null ? amount : 1 / scale) * sc);
      // 预乘 alpha 再模糊（透明边缘不会糊出黑边），模糊完再除回去
      for (let i = 0; i < px.length; i += 4) { const a = px[i + 3] / 255; px[i] *= a; px[i + 1] *= a; px[i + 2] *= a; }
      boxBlurRGBA(px, sw, sh, clamp(r, 1, 40));
      for (let i = 0; i < px.length; i += 4) { const a = px[i + 3]; if (a > 0) { const k = 255 / a; px[i] = min(255, px[i] * k); px[i + 1] = min(255, px[i + 1] * k); px[i + 2] = min(255, px[i + 2] * k); } }
      qa.setTransform(1, 0, 0, 1, 0, 0); qa.putImageData(im, 0, 0);
      q.imageSmoothingEnabled = true; q.imageSmoothingQuality = 'high'; q.drawImage(a, 0, 0, w, h);
    }, 0.5);
  }
  /** 视差层 d 在相机 cam 下可见的世界 x 范围 */
  function visRange(cam, d) { const z = 1 + ((cam.z ?? 1) - 1) * d, cx = 960 + ((cam.x ?? 960) - 960) * d; return [cx - 960 / z - 80, cx + 960 / z + 80]; }
  const flashK = (s) => (s.reduced ? 0.35 : 1);
  const shake = (s, amp, seed = 3, sp = 18) => (s.reduced ? { sx: 0, sy: 0 } : { sx: wobble(seed, s.t * sp) * amp, sy: wobble(seed + 5, s.t * sp) * amp * 0.8 });
  const hand = (s, seed, amp = 5, sp = 0.35) => (s.reduced ? { sx: 0, sy: 0 } : s.handheld(seed, s.t, amp, sp));
  /** 镜头开始以来的拍数（第一拍 = 0） */
  const bt0 = (s) => s.beat - s.T.beatAt(s.shot.t0);
  /** 某一拍（从镜头开头数）之后的秒数 */
  const sinceBeat = (s, b) => s.t - (s.shot.t0 + b * BEAT);

  /* =========================================================
   * 常用画法
   * ========================================================= */
  function vg(q, y0, y1, stops) { const gr = q.createLinearGradient(0, y0, 0, y1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function hg(q, x0, x1, stops) { const gr = q.createLinearGradient(x0, 0, x1, 0); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function lg(q, x0, y0, x1, y1, stops) { const gr = q.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function rg(q, x, y, r0, r1, stops) { const gr = q.createRadialGradient(x, y, r0, x, y, r1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function rrect(q, x, y, w, h, r) { q.beginPath(); q.moveTo(x + r, y); q.arcTo(x + w, y, x + w, y + h, r); q.arcTo(x + w, y + h, x, y + h, r); q.arcTo(x, y + h, x, y, r); q.arcTo(x, y, x + w, y, r); q.closePath(); }
  function blob(q, pts, close = true) {
    const n = pts.length;
    q.beginPath(); q.moveTo(pts[0][0], pts[0][1]);
    const N = close ? n : n - 1;
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const a = close || i > 0 ? p0 : p1, d = close || i < n - 2 ? p3 : p2;
      q.bezierCurveTo(p1[0] + (p2[0] - a[0]) / 6, p1[1] + (p2[1] - a[1]) / 6, p2[0] - (d[0] - p1[0]) / 6, p2[1] - (d[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (close) q.closePath();
  }
  function rockPts(cx, cy, rx, ry, seed, n = 9, j = 0.22) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = 1 - j + hash(seed, i, 7) * j * 2; pts.push([cx + cos(a) * rx * r, cy + sin(a) * ry * r]); }
    return pts;
  }
  function withAlpha(g, a, fn) { if (a <= 0.003) return; const A = g.globalAlpha; g.globalAlpha = A * min(1, a); fn(g); g.globalAlpha = A; }
  function additive(g, fn) { const m = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter'; fn(g); g.globalCompositeOperation = m; }
  function hexRgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const MIXC = new Map();
  function mixC(a, b, k) {
    const key = a + b + k.toFixed(3);
    let v = MIXC.get(key); if (v) return v;
    const A = hexRgb(a), B = hexRgb(b);
    v = `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
    if (MIXC.size > 4000) MIXC.clear();
    MIXC.set(key, v); return v;
  }
  /** 连环画风格的拟声字：粗描边 + 彩色填充 + 一点旋转与弹出 */
  function sfx(g, str, x, y, size, pop, o = {}) {
    if (pop <= 0.01) return;
    const k = pop < 1 ? ease.back(clamp(pop)) : 1;
    g.save(); g.translate(x, y); g.rotate(o.rot || 0); g.scale(k, k);
    if (o.alpha != null) g.globalAlpha *= clamp(o.alpha);
    E.text(g, str, 4, 6, { font: 'sans', size, weight: 700, color: 'rgba(40,20,50,0.35)', spacing: o.spacing || 2 });
    E.text(g, str, 0, 0, { font: 'sans', size, weight: 700, color: o.color || '#fff6fb', stroke: o.stroke || '#3a1f40', strokeW: o.strokeW || size * 0.16, spacing: o.spacing || 2 });
    g.restore();
  }

  /* =========================================================
   * 光、气泡、泡沫、水滴、星芒
   * ========================================================= */
  const puffSpr = (i, rgb) => {
    const v = ((i % 4) + 4) % 4;
    return spr('puff' + v + rgb, 256, 128, (q) => {
      const R = E.rng(71 + v * 31);
      for (let j = 0; j < 11; j++) {
        const cx = 64 + R() * 128, cy = 54 + R() * 20, r = 26 + R() * 28;
        q.fillStyle = rg(q, cx, cy, 0, r, [[0, `rgba(${rgb},0.26)`], [0.5, `rgba(${rgb},0.13)`], [1, `rgba(${rgb},0)`]]);
        q.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    });
  };
  /** 横向漂移的雾带 / 热气 */
  function fogBand(g, t, o) {
    const n = o.n || 8, w = o.w || 900, h = o.h || 300, seed = o.seed || 1, x0 = (o.x0 ?? 0) - w * 0.7, span = (o.x1 ?? VW) - (o.x0 ?? 0) + w * 1.4;
    const A = g.globalAlpha, rgb = o.rgb || '255,255,255';
    for (let i = 0; i < n; i++) {
      const sp = (o.speed ?? 20) * (0.6 + 0.8 * hash(seed, i, 1));
      const x = x0 + ((((hash(seed, i, 2) * span + t * sp) % span) + span) % span);
      const y = lerp(o.y0, o.y1, hash(seed, i, 3)) + sin(t * 0.25 + i * 1.7) * (o.bob ?? 10);
      const sc = 0.7 + 0.6 * hash(seed, i, 4);
      g.globalAlpha = A * (o.a ?? 0.5) * (0.5 + 0.5 * hash(seed, i, 5));
      g.drawImage(puffSpr(i + seed, rgb), x - (w * sc) / 2, y - (h * sc) / 2, w * sc, h * sc);
    }
    g.globalAlpha = A;
  }
  const hazeSpr = (rgb) => spr('haze' + rgb, 4, 256, (q) => { q.fillStyle = vg(q, 0, 256, [[0, `rgba(${rgb},0)`], [1, `rgba(${rgb},1)`]]); q.fillRect(0, 0, 4, 256); });
  /** 高度雾：从 y0（透明）到 y1（a）的竖直渐变 */
  function haze(g, rgb, x, y0, w, y1, a) { withAlpha(g, a, (q) => q.drawImage(hazeSpr(rgb), x, y0, w, y1 - y0)); }
  const sparkSpr = (rgb) => spr('spk' + rgb, 96, 96, (q) => {
    q.fillStyle = rg(q, 48, 48, 0, 48, [[0, `rgba(${rgb},0.6)`], [0.28, `rgba(${rgb},0.16)`], [1, `rgba(${rgb},0)`]]);
    q.fillRect(0, 0, 96, 96);
    q.fillStyle = '#fff'; q.beginPath();
    for (let j = 0; j < 4; j++) { const a = j * PI / 2 - PI / 2, b = a + PI / 4; q.lineTo(48 + cos(a) * 45, 48 + sin(a) * 45); q.lineTo(48 + cos(b) * 6.5, 48 + sin(b) * 6.5); }
    q.closePath(); q.fill();
  });
  function sparkle(g, x, y, r, a, rot = 0, rgb = '255,244,214') {
    if (a <= 0.01 || r <= 0.5) return;
    const A = g.globalAlpha, m = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = A * min(1, a);
    if (rot) { g.translate(x, y); g.rotate(rot); g.drawImage(sparkSpr(rgb), -r, -r, 2 * r, 2 * r); g.rotate(-rot); g.translate(-x, -y); }
    else g.drawImage(sparkSpr(rgb), x - r, y - r, 2 * r, 2 * r);
    g.globalAlpha = A; g.globalCompositeOperation = m;
  }
  /** 满屏零星的闪光（位置每个周期换一次） */
  function sparkles(g, t, n, seed, rgb, o = {}) {
    for (let i = 0; i < n; i++) {
      const life = 1.2 + hash(seed, i, 1) * 1.4, ph = fract(t / life + hash(seed, i, 2));
      const cyc = floor(t / life + hash(seed, i, 2));
      const x = (o.x ?? 0) + hash(seed, i * 7 + cyc, 3) * (o.w ?? VW), y = (o.y ?? 0) + hash(seed, i * 7 + cyc, 4) * (o.h ?? VH * 0.9);
      sparkle(g, x, y, (o.r ?? 12) * (0.6 + hash(seed, i, 5)), sin(PI * ph) * (o.a ?? 0.8), ph * 1.5, rgb);
    }
  }
  // 气泡：'soap' 透明的彩虹肥皂泡 / 'fizz' 汽水里的小白泡
  const bubbleSpr = (kind) => spr('bub:' + kind, 64, 64, (q) => {
    if (kind === 'soap') {
      q.fillStyle = rg(q, 32, 32, 16, 31, [[0, 'rgba(255,255,255,0.03)'], [0.62, 'rgba(210,244,255,0.14)'], [0.84, 'rgba(255,214,240,0.42)'], [0.95, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
      q.beginPath(); q.arc(32, 32, 31, 0, TAU); q.fill();
      q.lineWidth = 2.2;
      for (const [a0, a1, c] of [[0.1, 1.5, 'rgba(110,226,255,0.6)'], [2.0, 3.1, 'rgba(255,230,110,0.55)'], [3.5, 4.7, 'rgba(255,140,205,0.55)'], [5.0, 5.9, 'rgba(160,255,200,0.5)']]) { q.strokeStyle = c; q.beginPath(); q.arc(32, 32, 27.6, a0, a1); q.stroke(); }
      q.fillStyle = 'rgba(255,255,255,0.96)'; q.beginPath(); q.ellipse(21, 19, 7.5, 4.2, -0.7, 0, TAU); q.fill();
      q.fillStyle = 'rgba(255,255,255,0.7)'; q.beginPath(); q.arc(43, 44, 2.8, 0, TAU); q.fill();
    } else {
      q.fillStyle = rg(q, 32, 32, 12, 30, [[0, 'rgba(255,255,255,0.06)'], [0.72, 'rgba(255,255,255,0.42)'], [0.9, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]);
      q.beginPath(); q.arc(32, 32, 30, 0, TAU); q.fill();
      q.fillStyle = 'rgba(255,255,255,0.97)'; q.beginPath(); q.ellipse(22, 21, 6.5, 4, -0.65, 0, TAU); q.fill();
    }
  });
  function bubble(g, x, y, r, a, kind = 'soap') { if (a <= 0.01 || r < 0.6) return; const A = g.globalAlpha; g.globalAlpha = A * min(1, a); g.drawImage(bubbleSpr(kind), x - r, y - r, r * 2, r * 2); g.globalAlpha = A; }
  /** 一股气泡（汽水）：从 (x, y) 沿 ang 方向喷出后上浮；t0 起喷，持续 dur，n 颗 */
  function fizz(g, t, o) {
    const n = o.n || 30, rel0 = t - o.t0, seed = o.seed || 5;
    if (rel0 < 0) return;
    for (let i = 0; i < n; i++) {
      const birth = (i / n) * (o.dur || 2) + hash(seed, i, 1) * 0.08;
      const age = rel0 - birth;
      const life = (o.life || 1.6) * (0.6 + 0.6 * hash(seed, i, 2));
      if (age < 0 || age > life) continue;
      const k = age / life;
      const sp = (o.speed || 420) * (0.5 + hash(seed, i, 3)), ang = (o.ang ?? -PI / 2) + (hash(seed, i, 4) - 0.5) * (o.spread ?? 0.7);
      const damp = 1 - exp(-age * 3.2);
      const x = o.x + cos(ang) * sp * damp / 3.2 + sin(age * 7 + i) * 6;
      const y = o.y + sin(ang) * sp * damp / 3.2 - age * age * (o.rise ?? 90);
      bubble(g, x, y, (o.r || 7) * (0.5 + hash(seed, i, 5)) * (0.6 + k * 0.7), (o.a ?? 0.9) * sin(PI * min(1, k * 1.1 + 0.05)), o.kind || 'fizz');
    }
  }
  /** 从下往上冒的气泡（循环） */
  function risingBubbles(q, t, o) {
    for (let i = 0; i < o.n; i++) {
      const life = (o.life || 3) * (0.7 + 0.6 * hash(o.seed, i, 2));
      const ph = o.loop === false ? (t - (o.t0 || 0) - hash(o.seed, i, 1) * (o.spread ?? 2.4)) / life : fract((t - (o.t0 || 0)) / life + hash(o.seed, i, 1));
      if (ph < 0 || ph > 1) continue;
      const x = o.x + hash(o.seed, i, 3) * o.w + sin(t * 2 + i) * (o.wob ?? 14), y = o.y0 - ph * o.h * (0.7 + hash(o.seed, i, 4) * 0.5);
      bubble(q, x, y, ((o.r ?? 6) + ph * (o.grow ?? 12)) * (0.5 + hash(o.seed, i, 5)), (o.a ?? 0.8) * sin(PI * min(1, ph * 1.05)), o.kind || 'soap');
    }
  }
  // 泡沫团（不透明的白 / 粉奶油泡沫，外描一圈淡线）
  const foamSpr = (v, pink) => spr('foam' + (v & 3) + (pink ? 'p' : 'w'), 256, 200, (q) => {
    const R = E.rng(191 + (v & 3) * 37);
    const cs = [];
    for (let j = 0; j < 8; j++) { const a = (j / 8) * TAU + R() * 0.6, d = 30 + R() * 34; cs.push([128 + cos(a) * d * 1.2, 104 + sin(a) * d * 0.8, 30 + R() * 26]); }
    cs.push([128, 100, 58]);
    q.beginPath(); for (const [x, y, r] of cs) { q.moveTo(x + r, y); q.arc(x, y, r, 0, TAU); }
    q.lineWidth = 7; q.strokeStyle = pink ? 'rgba(226,110,166,0.85)' : 'rgba(120,176,206,0.8)'; q.stroke();
    q.fillStyle = rg(q, 104, 70, 6, 150, pink ? [[0, '#ffffff'], [0.45, '#ffeaf3'], [1, '#ffbcd8']] : [[0, '#ffffff'], [0.5, '#f2fbff'], [1, '#c6e6f4']]); q.fill();
    q.fillStyle = 'rgba(255,255,255,0.9)';
    for (let j = 0; j < 5; j++) { const [x, y, r] = cs[j]; q.beginPath(); q.ellipse(x - r * 0.35, y - r * 0.4, r * 0.22, r * 0.13, -0.6, 0, TAU); q.fill(); }
    // 泡沫里的小孔
    q.fillStyle = pink ? 'rgba(230,140,180,0.35)' : 'rgba(140,190,215,0.35)';
    for (let j = 0; j < 9; j++) { q.beginPath(); q.arc(70 + R() * 116, 70 + R() * 70, 2 + R() * 4, 0, TAU); q.fill(); }
  });
  function foam(g, x, y, r, a, v = 0, pink = true, rot = 0) {
    if (a <= 0.01 || r < 1) return;
    const A = g.globalAlpha; g.globalAlpha = A * min(1, a);
    if (rot) { g.save(); g.translate(x, y); g.rotate(rot); g.drawImage(foamSpr(v, pink), -r * 1.28, -r, r * 2.56, r * 2); g.restore(); }
    else g.drawImage(foamSpr(v, pink), x - r * 1.28, y - r, r * 2.56, r * 2);
    g.globalAlpha = A;
  }
  // 水滴（汽水色的小泪滴，尖头朝运动方向的反方向）
  const DROP_RGB = { pink: '255,120,180', mint: '90,220,180', lemon: '255,214,80', cyan: '70,200,240', white: '240,250,255' };
  const dropSpr = (c) => spr('drop' + c, 32, 48, (q) => {
    const rgb = DROP_RGB[c] || c;
    q.beginPath(); q.moveTo(16, 2); q.bezierCurveTo(22, 16, 29, 24, 29, 32); q.arc(16, 32, 13, 0, PI); q.bezierCurveTo(3, 24, 10, 16, 16, 2); q.closePath();
    q.fillStyle = rg(q, 12, 28, 1, 18, [[0, 'rgba(255,255,255,0.95)'], [0.35, `rgba(${rgb},0.85)`], [1, `rgba(${rgb},0.95)`]]); q.fill();
    q.lineWidth = 1.6; q.strokeStyle = 'rgba(40,30,60,0.35)'; q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.95)'; q.beginPath(); q.ellipse(11, 30, 3, 5, 0.3, 0, TAU); q.fill();
  });
  function drop(g, x, y, r, ang, a, c = 'pink') {
    if (a <= 0.01) return;
    const A = g.globalAlpha; g.globalAlpha = A * min(1, a);
    g.save(); g.translate(x, y); g.rotate(ang - PI / 2); g.drawImage(dropSpr(c), -r * 1.23, -r * 2.46, r * 2.46, r * 3.7); g.restore();
    g.globalAlpha = A;
  }
  /** 抛物线水滴群：从 (x, y) 以 (vx, vy) 散开；t0 起 dur 秒内陆续出生 */
  function spray(g, t, o) {
    const n = o.n || 30, seed = o.seed || 7, grav = o.grav ?? 1500;
    for (let i = 0; i < n; i++) {
      const birth = (o.t0 || 0) + (o.loop ? 0 : (i / n) * (o.dur || 0.5));
      let age = t - birth;
      const life = (o.life || 1.2) * (0.7 + 0.6 * hash(seed, i, 1));
      if (o.loop) age = fract(age / life + hash(seed, i, 9)) * life;
      if (age < 0 || age > life) continue;
      const ang = (o.ang ?? -PI / 2) + (hash(seed, i, 2) - 0.5) * (o.spread ?? 1.2), sp = (o.speed || 700) * (0.45 + 0.8 * hash(seed, i, 3));
      const vx = cos(ang) * sp, vy = sin(ang) * sp;
      const x = o.x + (hash(seed, i, 6) - 0.5) * (o.w || 0) + vx * age, y = o.y + vy * age + 0.5 * grav * age * age;
      const dir = atan2(vy + grav * age, vx);
      drop(g, x, y, (o.r || 7) * (0.5 + hash(seed, i, 4)), dir, (o.a ?? 1) * min(1, (life - age) * 4), o.color || pick(['pink', 'pink', 'white', 'cyan'], hash(seed, i, 5)));
    }
  }

  /* ---------- 棕榈（白天：带颜色的叶子；也可以画成剪影） ---------- */
  function frond(g, x, y, a, L, droop) {
    const N = 16, ca = cos(a), sa = sin(a), dr = droop * 0.6;
    g.beginPath();
    const ex = x + ca * L, ey = y + sa * L + dr * L;
    const w0 = L * 0.018;
    g.moveTo(x - sa * w0, y + ca * w0); g.quadraticCurveTo(x + ca * L * 0.5, y + sa * L * 0.5, ex, ey); g.quadraticCurveTo(x + ca * L * 0.5, y + sa * L * 0.5, x + sa * w0, y - ca * w0);
    for (let i = 1; i <= N; i++) {
      const u = i / (N + 1);
      const px = x + ca * L * u, py = y + sa * L * u + dr * L * u * u;
      let tx = ca, ty = sa + 2 * dr * u; const tl = hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const len = L * 0.32 * pow(sin(PI * min(1, u * 0.92 + 0.08)), 0.7) * (1 - u * 0.35);
      const bw = L * 0.02 * (1 - u * 0.5);
      for (const sd of [-1, 1]) {
        let dx = tx * 0.55 + -ty * sd * 0.84, dy = ty * 0.55 + tx * sd * 0.84 + 0.75;
        const dl = hypot(dx, dy); dx /= dl; dy /= dl;
        const tipx = px + dx * len, tipy = py + dy * len;
        g.moveTo(px - tx * bw, py - ty * bw);
        g.quadraticCurveTo(px + dx * len * 0.5 + tx * bw * 2, py + dy * len * 0.5 + ty * bw * 2 - len * 0.08, tipx, tipy);
        g.lineTo(px + tx * bw, py + ty * bw);
      }
    }
    g.fill();
  }
  /** 棕榈：(x, y) 树根，h 树高；o: { lean, bend, seed, col, trunk, n, wind, hi } */
  function palm(g, x, y, h, t, o = {}) {
    const lean = o.lean ?? 0.12, seed = o.seed || 1;
    const sway = wobble(seed * 13, t * 0.35) * 0.04 + (o.wind || 0) * 0.05;
    const cx = x + (lean + sway * 0.5) * h, cy = y - h;
    const mx = x + lean * h * 0.3 + (o.bend ?? 0.1) * h, my = y - h * 0.5;
    const w0 = h * 0.042, w1 = h * 0.022;
    g.fillStyle = o.trunk || o.col || '#8a6a4a';
    g.beginPath(); g.moveTo(x - w0, y); g.quadraticCurveTo(mx - w0 * 0.8, my, cx - w1, cy + 4); g.lineTo(cx + w1, cy + 4); g.quadraticCurveTo(mx + w0 * 0.8, my, x + w0, y); g.closePath(); g.fill();
    if (!o.flat) {
      // 树干上的环纹
      g.strokeStyle = 'rgba(60,40,30,0.35)'; g.lineWidth = max(1, h * 0.006);
      for (let i = 1; i < 14; i++) { const u = i / 14, px = lerp(x, cx, u) + sin(u * PI) * (mx - (x + cx) / 2) * 0.9, py = lerp(y, cy, u), w = lerp(w0, w1, u); g.beginPath(); g.moveTo(px - w, py); g.quadraticCurveTo(px, py + w * 0.5, px + w, py - w * 0.3); g.stroke(); }
    }
    const n = o.n || 9;
    for (let i = 0; i < n; i++) {
      const side = i / (n - 1) - 0.5;
      const a0 = -PI / 2 + side * PI * 1.55 + (hash(seed, i, 1) - 0.5) * 0.3;
      const sw = wobble(seed * 7 + i, t * 0.5) * 0.08 + sway * 1.4;
      g.fillStyle = o.col ? o.col : (i % 2 ? '#3f9a5e' : '#2f7e4c');
      frond(g, cx, cy, a0 + sw, h * (0.4 + hash(seed, i, 2) * 0.18), 0.7 + abs(side) * 0.9 + hash(seed, i, 3) * 0.4);
    }
    g.fillStyle = o.col || '#6a4a2a';
    g.beginPath(); g.arc(cx - h * 0.012, cy + h * 0.02, h * 0.022, 0, TAU); g.arc(cx + h * 0.02, cy + h * 0.025, h * 0.02, 0, TAU); g.fill();
  }

  /* =========================================================
   * 小羊：角色库（MVE.cast）画进精灵图；特写时直接画矢量
   * 片 II 里小羊相对人物很小（身长 ≈ 人高的 1/6），这里沿用同样的比例：
   *   以老板身高 400 为基准：小羊可见高度 V ≈ 44，汽水瓶 ≈ 75，货箱 ≈ 160 高
   * ========================================================= */
  const LAMB = {
    pink: ['sheep-pink', {}],
    boss: ['sheep-pink', { bow: '#ff4f8f' }],   // 带头的：系蝴蝶结
    bell: ['sheep-pink', { bell: true }],       // 一走就响的铃铛
    geek: ['sheep-pink', { glasses: true }],    // 会看压力表的“工程师”
  };
  /** 七只小羊的小队（第 7 只是最小的那只） */
  const GANG = [
    { k: 'boss', sc: 1.05 }, { k: 'bell', sc: 1 }, { k: 'geek', sc: 1 }, { k: 'pink', sc: 1.04 }, { k: 'pink', sc: 0.96 }, { k: 'pink', sc: 1 }, { k: 'pink', sc: 0.74 },
  ];
  const BOX = new Map();
  function castBox(who, o) {
    const key = who + '|' + JSON.stringify(o);
    let b = BOX.get(key);
    if (b) return b;
    b = { x0: -70, y0: -100, x1: 70, y1: 8 };
    try {
      const c = E.mk(900, 700), q = c.getContext('2d', { willReadFrequently: true });
      cast(q, who, Object.assign({ x: 450, y: 520, h: 100, t: 0 }, o));
      const d = q.getImageData(0, 0, 900, 700).data;
      let x0 = 900, y0 = 700, x1 = -1, y1 = -1;
      for (let y = 0; y < 700; y += 2) for (let x = 0; x < 900; x += 2) if (d[(y * 900 + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 > x0) b = { x0: x0 - 450 - 6, y0: y0 - 520 - 6, x1: x1 - 450 + 6, y1: y1 - 520 + 6 };
    } catch (e) { /* 角色库不可用：用默认框 */ }
    BOX.set(key, b);
    return b;
  }
  // 走 / 跑的循环：每种预先画 NF 帧（角色库里 walk 一个周期 0.625s，run 0.4167s）
  const NF = 6, CYC = { walk: 1 / 1.6, run: 1 / 2.4 };
  function lambSpr(s, kind, pose, expr, fr = 0) {
    const L = LAMB[kind] || LAMB.pink;
    const po = Object.assign({ pose }, L[1]);
    const b = castBox(L[0], po);
    const tt = CYC[pose] ? (fr / NF) * CYC[pose] : 0;
    const c = LC(s, `lamb:${kind}:${pose}:${expr}:${fr}`, b.x1 - b.x0, b.y1 - b.y0, (q) => cast(q, L[0], Object.assign({ x: -b.x0, y: -b.y0, h: 100, t: tt, expr, blink: false }, po)), 2);
    return { c, b };
  }
  /** 可见高度 V 的小羊，走 / 跑时脚底不打滑的横向速度（世界像素 / 秒，步频 1 倍） */
  function gaitV(pose, V) {
    try { if (E.cast && E.cast.gait) return E.cast.gait('sheep-pink', { h: sheepH('pink', pose, V), pose }).speed; } catch (e) { /* 估计值 */ }
    return (pose === 'run' ? 40 : 16.6) * V / 42;
  }
  /** 可见高度 V 对应的角色库 h 参数 */
  function sheepH(kind, pose, V) { const L = LAMB[kind] || LAMB.pink; const b = castBox(L[0], Object.assign({ pose }, L[1])); return (100 * V) / max(10, b.y1 - b.y0); }
  const EXPR_OK = { neutral: 'open', open: 'open', happy: 'happy', laugh: 'happy', smile: 'happy', closed: 'closed', sleepy: 'closed', surprise: 'surprise', sad: 'sad' };

  /* =========================================================
   * 官方 Q 版小人（MVE.sd，游戏里的 Spine 模型）：
   *   粉色小羊 = 「火山旅梦」的敌人：带头的 = 巫师帽的“星术师”（1350），工程师 = 竹蜻蜓 + 护目镜的“飞空员”（1347，飘在半空），
   *   其余 = 头顶交通锥的“淘气包”（1344）；汽水摊的店主 = 雪雉（char_383_snsant）；门口的她 = 纯烬艾雅法拉（基建小人）。
   *   一共 5 个模型。模型没加载好 / 设备不支持时，退回手绘版。
   * ========================================================= */
  const SDK = () => { const S = window.MVE && window.MVE.sd; return S && S.draw && S.enabled !== false ? S : null; };
  const SD_LAMB = { boss: 'enemy_1350_mgcshp', geek: 'enemy_1347_fyshp', bell: 'enemy_1344_ddlamb', pink: 'enemy_1344_ddlamb' };
  // 客串的路人（「火山旅梦」里汐斯塔的活动干员）：琳琅诗怀雅、苍苔、锡兰（夏装）——一共 8 个模型
  const CAMEO = ['swire2', 'bryota', 'char_348_ceylon_summer_13/build'];
  const SD_KEYS = ['enemy_1344_ddlamb', 'enemy_1347_fyshp', 'enemy_1350_mgcshp', 'snowsant', 'alter'].concat(CAMEO);
  /** 一个客串路人（官方小人）；模型不可用时画成柔和的剪影（o.fb 为角色库 crowd 的参数） */
  function extra(q, s, key, o) {
    if (sdReady(key)) { if (warmMode) return; const ok = SDK().draw(q, key, Object.assign({ t: s.t }, o)); if (ok) return; }
    if (o.fb) cast(q, 'crowd', Object.assign({ t: s.t }, o.fb));
  }
  // 每个模型那一团“毛”的高度（骨骼单位）：按它缩放，三种小羊的身子一样大（头饰另算）
  const SD_FLUFF = { enemy_1344_ddlamb: 262, enemy_1350_mgcshp: 290, enemy_1347_fyshp: 170 };
  // 背上的位置（放汽水瓶）、身子中心（骨骼单位，脚底为原点，y 向下，面朝右）
  const SD_BACK = { enemy_1344_ddlamb: [-24, -250], enemy_1350_mgcshp: [-40, -262], enemy_1347_fyshp: [-14, -290] };
  const LAMB_ANIM = { walk: 'Move', run: 'Move', gallop: 'Move', bound: 'Move', push: 'Attack', eat: 'Attack' };
  function sdReady(key) { const S = SDK(); try { return !!(S && S.ready(key)); } catch (e) { return false; } }
  function sdOK(key) { return !warmMode && sdReady(key); }
  /** 小羊的动画帧缓存：画面上小于 SPR_MAX（设计像素）的小羊用预渲染帧，每个动作 SPR_NF 帧 */
  const SPR_MAX = 120, SPR_NF = 10;
  // 各模型的绘制框（骨骼单位，脚底为原点，y 向下）：留足 Attack / Move 的动作幅度
  const SD_BOX = { enemy_1344_ddlamb: [-230, -380, 330, 40], enemy_1350_mgcshp: [-260, -440, 270, 40], enemy_1347_fyshp: [-200, -440, 190, 40] };
  const SDDUR = new Map();
  function sdDur(key, anim) {
    const k = key + ':' + anim; let d = SDDUR.get(k);
    if (d == null) { d = 1; try { const I = SDK().info(key); const a = I && I.anims && I.anims.find((x) => x[0] === anim); if (a) d = a[1]; } catch (e) { /* 默认 1 秒 */ } SDDUR.set(k, d); }
    return d;
  }
  /** 一帧（fr）小羊精灵：按屏幕尺寸分三档分辨率；返回 { c, box（design 坐标）, sc（绘制时的骨骼缩放） } */
  function sdLambFrame(s, key, anim, fr, px) {
    const tier = px < 45 ? 45 : px < 80 ? 80 : SPR_MAX, V = tier, sc = sdScale(key, V), B = SD_BOX[key] || [-260, -440, 330, 40];
    const box = [B[0] * sc, B[1] * sc, B[2] * sc, B[3] * sc], w = box[2] - box[0], h = box[3] - box[1];
    const dur = sdDur(key, anim), tt = ((fr + 0.5) / SPR_NF) * dur;
    const c = LC(s, `sdl:${key}:${anim}:${fr}:${tier}`, w, h, (q) => { try { SDK().draw(q, key, { x: -box[0], y: -box[1], scale: sc, anim, t: tt, speed: 1 }); } catch (e) { /* 空帧 */ } }, 1.25);
    return c === DUMMY ? null : { c, box, sc };
  }
  const sdScale = (key, V) => (V * 1.18) / (SD_FLUFF[key] || 262);
  const sdPhase = (V, o) => fract((o.seed ?? 0) * 0.37 + V * 0.113 + (o.flip ? 0.5 : 0) + (o.phaseK || 0));
  const SDGEO = new Map();
  /** 官方小羊静止姿势下脸 / 头顶的位置（骨骼单位；只量一次） */
  function sdGeo(key) {
    let v = SDGEO.get(key);
    if (v !== undefined) return v;
    v = null;
    try { const A = SDK().anchors(key, { x: 0, y: 0, scale: 1, anim: 'Idle', t: 0 }); if (A && A.face && A.top) v = { face: A.face, top: A.top, head: A.head || A.face }; } catch (e) { v = null; }
    if (v) SDGEO.set(key, v);
    return v;
  }
  /**
   * 画一只小羊：(x, y) 脚底，V 可见高度
   * o: { kind, pose, expr, flip, sq(挤压 -1..1), spin(绕身体中心转), rot(绕脚底转), alpha, glow, t(矢量模式的动作时间), fx:[眼睛特效] }
   */
  function lamb(g, s, x, y, V, o = {}) {
    const kind = o.kind || 'pink', pose = o.pose || 'stand', expr = EXPR_OK[o.expr || 'neutral'] || 'open', sq = o.sq || 0;
    if (o.alpha != null && o.alpha <= 0.01) return;
    if (o.glow) E.glow(g, x, y - V * 0.45, V * 1.25, o.glowRgb || '255,160,210', 0.34 * o.glow);
    const m = g.getTransform(), zs = sqrt(abs(m.a * m.d - m.b * m.c)) / s.k;
    g.save();
    g.translate(x, y);
    if (o.rot) g.rotate(o.rot);
    if (o.spin) { g.translate(0, -V * 0.45); g.rotate(o.spin); g.translate(0, V * 0.45); }
    if (o.alpha != null && o.alpha < 1) g.globalAlpha *= clamp(o.alpha);
    const tt = (o.t ?? s.t) * (o.wspd || 1);
    const sk = SD_LAMB[kind] || SD_LAMB.pink;
    const sdR = o.sd !== false && sdReady(sk);
    if (sdR && warmMode) {
      // 预热：只把要用到的小精灵帧排进队列
      if (V * zs < SPR_MAX && !o.tint && !o.rim) sdLambFrame(s, sk, LAMB_ANIM[pose] || 'Idle', 0, V * zs);
      g.restore(); return;
    }
    if (sdR) {
      // 官方小羊：Idle / Move / Attack；走跑时按实际前进速度反推 Move 的播放速度（脚不打滑）
      const S = SDK(), sc = sdScale(sk, V), anim = LAMB_ANIM[pose] || 'Idle';
      let speed = pose === 'sleep' || pose === 'sit' ? 0.35 : 1;
      if (anim === 'Move') { const G = S.gait(sk, { scale: sc }); if (G && G.speed > 1) speed = clamp(((o.wspd || 1) * gaitV(pose === 'run' ? 'run' : 'walk', V)) / G.speed, 0.3, 3.5); }
      g.scale(1 + sq * 0.2, 1 - sq * 0.2);
      if (V * zs < SPR_MAX && !o.tint && !o.rim) {
        // 画面上不大的小羊：用预先渲染好的动画帧（每个动作 10 帧），一帧一次 drawImage
        const dur = sdDur(sk, anim), at = ((o.t ?? s.t) + sdPhase(V, o) * 1.3) * speed, fr = dur > 0 ? floor(fract(at / dur) * SPR_NF) : 0;
        const F = sdLambFrame(s, sk, anim, fr, V * zs);
        if (F) {
          const k = sc / F.sc;
          g.scale((o.flip ? -1 : 1) * k, k);
          g.drawImage(F.c, F.box[0], F.box[1], F.box[2] - F.box[0], F.box[3] - F.box[1]);
          g.restore();
          if (o.fx) lambFx(g, s, x, y, V, o);
          return;
        }
      }
      const ok = S.draw(g, sk, { x: 0, y: 0, scale: sc, anim, t: o.t ?? s.t, speed, phase: sdPhase(V, o) * 1.3, flip: !!o.flip, tint: o.tint, rim: o.rim });
      g.restore();
      if (ok) { if (o.fx) lambFx(g, s, x, y, V, o); return; }
      g.save(); g.translate(x, y); if (o.rot) g.rotate(o.rot); if (o.spin) { g.translate(0, -V * 0.45); g.rotate(o.spin); g.translate(0, V * 0.45); } if (o.alpha != null && o.alpha < 1) g.globalAlpha *= clamp(o.alpha);
    }
    if (V * zs > 150 && !warmMode) {
      // 特写：矢量（清晰，还会眨眼、呼吸）
      g.scale(1 + sq * 0.2, 1 - sq * 0.2);
      const L = LAMB[kind] || LAMB.pink;
      cast(g, L[0], Object.assign({ x: 0, y: 0, h: sheepH(kind, pose, V), t: tt, pose, expr, flip: !!o.flip, seed: o.seed }, L[1]));
    } else {
      const fr = CYC[pose] ? floor(fract(tt / CYC[pose]) * NF) : 0;
      const S = lambSpr(s, kind, pose, expr, fr), b = S.b, bh = b.y1 - b.y0, sc = V / bh;
      g.scale((o.flip ? -1 : 1) * sc * (1 + sq * 0.2), sc * (1 - sq * 0.2));
      g.drawImage(S.c, b.x0, b.y0, b.x1 - b.x0, bh);
    }
    g.restore();
    if (o.fx) lambFx(g, s, x, y, V, o);
  }
  /** 小羊脸上的关键点（世界坐标）：u = 每个“羊局部单位”的长度 */
  function lambGeo(kind, pose, V, x, y, flip, sq = 0) {
    const sk = SD_LAMB[kind] || SD_LAMB.pink, Gs = sdOK(sk) ? sdGeo(sk) : null;
    if (Gs) {
      // 官方小羊：脸、头顶来自骨骼锚点；背（放瓶子）按模型量好的位置
      const sc = sdScale(sk, V), f = flip ? -1 : 1, sx = 1 + sq * 0.2, sy = 1 - sq * 0.2, u = V / 32;
      const P = (lx, ly) => [x + f * sx * sc * lx, y + sy * sc * ly];
      const fc = Gs.face, tp = Gs.top, bk = SD_BACK[sk] || [-20, -250];
      return { u, f, sd: true, face: P(fc[0], fc[1]), eyeA: P(fc[0] + 14, fc[1] - 8), eyeB: P(fc[0] - 10, fc[1] - 8), mouth: P(fc[0] + 12, fc[1] + 26), top: P(tp[0], tp[1]), back: P(bk[0], bk[1]), body: P(bk[0] + 8, bk[1] * 0.5), cheek: P(fc[0] + 4, fc[1] + 14) };
    }
    const L = LAMB[kind] || LAMB.pink, b = castBox(L[0], Object.assign({ pose }, L[1]));
    const u = (V / (b.y1 - b.y0)) * (100 / 54), f = flip ? -1 : 1, sx = 1 + sq * 0.2, sy = 1 - sq * 0.2;
    const dy = pose === 'sit' ? 3 : pose === 'sleep' ? 5.5 : 0;
    const P = (lx, ly) => [x + f * sx * u * lx, y + sy * u * (ly + dy)];
    return { u, f, face: P(17, -23), eyeA: P(21.3, -22.6), eyeB: P(14.8, -22.8), mouth: P(18.6, -17.2), top: P(16.6, -37), body: P(-5, -21 + (pose === 'sit' ? 2 : 0)), cheek: P(20, -19) };
  }
  /** 小羊的表情特效：'stars'（眼冒星星）| 'drool'（流口水）| 'sweat'（冒汗）| 'cheeks'（鼓腮）| '!' | '?' | 'zzz' | 'hearts' */
  function lambFx(g, s, x, y, V, o) {
    const G = lambGeo(o.kind || 'pink', o.pose || 'stand', V, x, y, o.flip, o.sq || 0), u = G.u, t = s.t;
    for (const fx of [].concat(o.fx)) {
      if (fx === 'stars') { for (const [ex, ey] of [G.eyeA, G.eyeB]) { sparkle(g, ex, ey, u * 5.5 * (0.85 + 0.15 * sin(t * 12)), 1, t * 2, '255,236,160'); } }
      else if (fx === 'drool') { const ph = fract(t * 0.8 + x * 0.01); g.fillStyle = 'rgba(150,230,255,0.9)'; g.beginPath(); g.ellipse(G.mouth[0], G.mouth[1] + u * (1.5 + ph * 3), u * 0.9, u * (1.4 + ph * 1.6), 0, 0, TAU); g.fill(); }
      else if (fx === 'sweat') { const ph = fract(t * 1.3); g.save(); g.globalAlpha *= 1 - ph; drop(g, G.top[0] - G.f * u * 8, G.top[1] + u * 6 + ph * u * 8, u * 1.8, PI / 2, 1, 'cyan'); g.restore(); }
      else if (fx === 'cheeks') { g.fillStyle = 'rgba(255,120,170,0.55)'; g.beginPath(); g.arc(G.cheek[0], G.cheek[1], u * 3.2, 0, TAU); g.fill(); }
      else if (fx === '!' || fx === '?') { const pop = o.fxPop ?? 1; sfx(g, fx === '!' ? '！' : '？', G.top[0] + G.f * u * 4, G.top[1] - u * 10, u * 14, pop, { color: fx === '!' ? '#fff27a' : '#bdf6ff', rot: G.f * 0.15 }); }
      else if (fx === 'zzz') { for (let i = 0; i < 3; i++) { const ph = fract(t * 0.6 + i / 3); withAlpha(g, sin(PI * ph) * 0.9, (q) => E.text(q, 'z', G.top[0] - G.f * u * (2 - ph * 10) + i * u * 2, G.top[1] - ph * u * 16, { font: 'hand', size: u * (5 + ph * 5), color: '#ffffff', stroke: 'rgba(90,40,90,0.5)', strokeW: u * 1.4 })); } }
      else if (fx === 'hearts') { for (let i = 0; i < 2; i++) { const ph = fract(t * 0.9 + i * 0.5); withAlpha(g, sin(PI * ph), (q) => heart(q, G.top[0] + G.f * u * (i * 8 - 2), G.top[1] - ph * u * 14, u * 3.2, '#ff5f9e')); } }
    }
  }
  function heart(g, x, y, r, c) {
    g.fillStyle = c; g.beginPath(); g.moveTo(x, y + r * 0.9);
    g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.8, y - r * 1.4, x, y - r * 0.5);
    g.bezierCurveTo(x + r * 0.8, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9); g.fill();
  }
  /** 一拍一跳：ph ∈ [0,1) → [离地高度 0..1, 挤压] */
  function hop(ph) {
    const y = 4 * ph * (1 - ph);
    const sq = ph < 0.1 ? 0.7 * (1 - ph / 0.1) : ph > 0.92 ? 0.5 * ((ph - 0.92) / 0.08) : -0.28 * sin(PI * ((ph - 0.1) / 0.82));
    return [y, sq];
  }
  /** 抛物线 + 落地弹跳（解析算）：返回 { x, y, vy, n(第几段), sq } */
  function bounce(age, x0, y0, vx, vy, floorY, grav = 2600, e = 0.52, fr = 0.7) {
    let x = x0, y = y0, v = vy, u = vx, tt = age, n = 0;
    for (; n < 6; n++) {
      const disc = v * v + 2 * grav * (floorY - y);
      const tl = disc > 0 ? (-v + sqrt(disc)) / grav : 0;
      if (tt < tl || tl <= 0.02) {
        const yy = min(floorY, y + v * tt + 0.5 * grav * tt * tt);
        return { x: x + u * tt, y: yy, vy: v + grav * tt, n, sq: 0 };
      }
      tt -= tl; x += u * tl; y = floorY; v = -(v + grav * tl) * e; u *= fr;
      if (tt < 0.09) return { x: x + u * tt, y: floorY, vy: 0, n: n + 1, sq: (1 - tt / 0.09) * min(1, abs(v) / 500) };
    }
    return { x: x + u * min(tt, 0.3), y: floorY, vy: 0, n, sq: 0 };
  }
  /** 小羊的接触阴影（扁椭圆） */
  const shadowSpr = () => spr('shadow', 64, 32, (q) => { q.fillStyle = rg(q, 32, 16, 0, 32, [[0, 'rgba(40,20,50,0.55)'], [0.6, 'rgba(40,20,50,0.25)'], [1, 'rgba(40,20,50,0)']]); q.save(); q.scale(1, 0.5); q.beginPath(); q.arc(32, 32, 32, 0, TAU); q.restore(); q.fill(); });
  function shadow(g, x, y, w, a = 1) { if (a <= 0.01) return; withAlpha(g, a, (q) => q.drawImage(shadowSpr(), x - w / 2, y - w * 0.13, w, w * 0.26)); }

  /* =========================================================
   * 汽水摊老板（本片原创）：用角色库的人物骨架登记一个新角色（草帽、薄荷色背心、红领巾），
   * 角色库没有这个接口时退回成普通路人。另外画一撇小胡子。
   * ========================================================= */
  let VK = undefined;
  function vendorKey() {
    if (VK !== undefined) return VK;
    VK = null;
    try {
      const C = E.cast, CH = C && C._internal && C._internal.CH;
      if (CH && CH.katia) {
        if (!CH['eff-vendor']) {
          const K = CH.katia;
          CH['eff-vendor'] = {
            body: 'man', skin: K.skin, eye: K.eye, eyeS: [0.9, 0.86], horn: null, ear: 'human', animal: 'human', sheepEar: 0.9,
            feather: { c: '#5a3a28', tip: '#8a5a3a' }, halo: null, glasses: null, wrinkles: false,
            hair: { pal: { c: '#5a3a2a', sh: '#3a2418', lt: '#8a6048', tip: '#6a4a36', ink: '#24140c' }, cap: 1.12, side: 0.62, sideW: 0.13, part: 0.2, curly: 1, messy: 1,
              bangs: [[-1.1, 0.24, 0.3], [-0.72, 0.1, 0.5], [-0.32, 0.18, 0.55], [0.08, 0.06, 0.55], [0.46, 0.2, 0.45], [0.84, 0.12, 0.35], [1.12, 0.24, 0.2]],
              back: { len: 1.0, w: 1.06, n: 5, wave: 0.06, top: -0.15 }, locks: null, ahoge: { psi: 0.15, len: 0.34, curl: 1.2 }, pony: null, braid: null },
            def: 'default',
            outfits: { default: {
              top: '#fbfbf6', vest: { c: '#5fcfb4' }, sleeve: ['#fbfbf6', '#fbfbf6'], cuff: '#ffffff', collar: { type: 'shirt', c: '#ffffff' }, neck: { kerchief: '#e0424e', pat: '#fff4e0' },
              pants: { c: '#3f5f86', w: [5.8, 5.2] }, shoes: { c: '#8a5a3a', sole: '#4a2e1e', type: 'sandal' },
              hat: { type: 'straw', c: '#f0d58c', band: '#e0424e' },
            } },
            seed: 23,
          };
        }
        if (C.meta && !C.meta['eff-vendor']) C.meta['eff-vendor'] = { name: '汽水摊老板', species: '本片原创', scale: 0.98, original: true, desc: '海边汽水摊的老板，午后总在遮阳篷下打盹。他看不见小羊，只看见汽水自己飘走。' };
        // 草帽被吹飞时用的“没戴帽子”版本
        if (!CH['eff-vendor-nohat']) { const V0 = CH['eff-vendor']; CH['eff-vendor-nohat'] = Object.assign({}, V0, { outfits: { default: Object.assign({}, V0.outfits.default, { hat: null }) } }); }
        VK = 'eff-vendor';
      }
    } catch (e) { VK = null; }
    return VK;
  }
  /** o 与角色库相同；o.stache === false 不画胡子 */
  function vendor(g, o) {
    const k = vendorKey();
    if (k) cast(g, o.nohat ? 'eff-vendor-nohat' : k, o); else cast(g, 'crowd', Object.assign({ seed: 42, color: '#5fcfb4' }, o));
    if (o.stache === false || o.sil || (o.view && /back/.test(o.view))) return;
    // 小胡子（八字、两头往上翘）：在嘴和两眼中点之间，宽度跟两眼的距离走；低头睡觉时不画
    if (o.headPose === 'sleep') return;
    try {
      const A = E.cast.anchors(k || 'crowd', o);
      if (!A || !A.mouth || !A.eyeN || !A.eyeF) return;
      const ex = (A.eyeN[0] + A.eyeF[0]) / 2, ey = (A.eyeN[1] + A.eyeF[1]) / 2;
      const cx = lerp(A.mouth[0], ex, 0.24), cy = lerp(A.mouth[1], ey, 0.24);
      const ed = hypot(A.eyeN[0] - A.eyeF[0], A.eyeN[1] - A.eyeF[1]);
      const w = ed * 0.62, ang = atan2(A.eyeN[1] - A.eyeF[1], A.eyeN[0] - A.eyeF[0]);
      g.save(); g.translate(cx, cy); g.rotate(abs(ang) > PI / 2 ? ang - PI : ang);
      if (o.alpha != null) g.globalAlpha *= clamp(o.alpha);
      g.fillStyle = '#6a4030'; g.strokeStyle = '#2a160c'; g.lineWidth = max(0.8, w * 0.07); g.lineJoin = 'round';
      g.beginPath();
      for (const sd of [-1, 1]) {
        g.moveTo(0, -w * 0.06);
        g.bezierCurveTo(sd * w * 0.3, -w * 0.28, sd * w * 0.72, -w * 0.2, sd * w * 0.86, -w * 0.02);
        g.quadraticCurveTo(sd * w * 1.02, w * 0.1, sd * w * 1.06, -w * 0.18);
        g.quadraticCurveTo(sd * w * 1.0, w * 0.26, sd * w * 0.7, w * 0.16);
        g.bezierCurveTo(sd * w * 0.45, w * 0.1, sd * w * 0.2, w * 0.12, 0, w * 0.06);
      }
      g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,220,190,0.35)'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * w * 0.45, -w * 0.09, w * 0.18, w * 0.04, sd * 0.25, 0, TAU); g.fill(); }
      g.restore();
    } catch (e) { /* 没有关键点就不画 */ }
  }

  /* ---------- 汽水摊的店主：雪雉（官方基建小人 Relax / Move / Sit / Sleep / Interact；特写用她的夏装剧情立绘） ---------- */
  const SNOW = 'snowsant';
  /** 画雪雉：o 直接交给 MVE.sd.draw（x, y 脚底；h 身高；anim；flip = 面朝左；rot；from / to / k 交叉淡化）；o.fb = 模型不可用时手绘老板的参数 */
  function snow(q, s, o) {
    if (sdReady(SNOW)) { if (warmMode) return true; const ok = SDK().draw(q, SNOW, Object.assign({ t: s.t }, o)); if (ok) return true; }
    if (o.fb) vendor(q, Object.assign({ t: s.t }, o.fb));
    return false;
  }
  /** 雪雉的锚点（head / face / top / chest / handN / handF / bounds …）；不可用时 null */
  function snowA(s, o) { try { return sdOK(SNOW) ? SDK().anchors(SNOW, Object.assign({ t: s.t }, o)) : null; } catch (e) { return null; } }
  /** 在长凳上午睡：Sleep（侧躺，头朝左，枕着小枕头）；o.stir 0..1 被吵醒时一抖；返回头的位置（放 zzz / 泡泡） */
  function snowDoze(q, s, o = {}) {
    const t = s.t, h = o.h || 370, stir = o.stir || 0;
    const x = BENCH.x + 4, y = BENCH.top - 4 - stir * 10;
    snow(q, s, { x, y, h, anim: 'Sleep', t: t * (o.speed || 1), rot: stir * 0.04 * sin(t * 38), tint: o.tint, fb: { x: BENCH.x - 60, y: SG, h: 400, pose: 'sit', seat: 64, arms: 'cross', expr: 'closed', headPose: 'sleep', look: [0.4, 0.3] } });
    const head = [x - h * 0.3, y - h * 0.3];
    if (!o.noZ && stir < 0.2) for (let i = 0; i < 3; i++) { const ph = fract(t * 0.55 + i / 3); withAlpha(q, sin(PI * ph) * 0.9, (qq) => E.text(qq, 'z', head[0] - 20 - ph * 50 - i * 8, head[1] - 40 - ph * 70, { font: 'hand', size: 18 + ph * 22, color: '#ffffff', stroke: 'rgba(60,40,90,0.55)', strokeW: 5 })); }
    return head;
  }
  /** 雪雉头上 / 身上的泡沫（屋顶那几场）：按锚点摆；没有锚点时按身高估 */
  function snowFoam(q, s, o) {
    const A = snowA(s, o), x = o.x, y = o.y, h = o.h || 400, fl = o.flip ? -1 : 1;
    const top = A && A.top ? A.top : [x - fl * h * 0.05, y - h];
    const ch = A && A.chest ? A.chest : [x, y - h * 0.5];
    for (let i = 0; i < 5; i++) foam(q, top[0] - 46 + i * 23, top[1] + 16 + sin(i * 2) * 8, 20 + (i % 2) * 7, 0.95, i, true, i);
    for (let i = 0; i < 3; i++) foam(q, ch[0] - 40 + i * 40, ch[1] - 10 + (i % 2) * 18, 17, 0.9, i + 3, true, i);
  }
  /** 特写：雪雉的夏装剧情立绘（crop 'face' | 'bust' | 'upper'；expr 表情编号或关键帧）；立绘没加载好时返回 false */
  /*
   * [v3] 首选：雪雉夏装剧情立绘的分层绑定（MVE.keyart 'snowsant'：眨眼、转头、头发随风、官方差分表情与嘴型），
   * 与立绘剪纸同一块构图；每个镜头开头决定一次用不用（没准备好 → 立绘剪纸 → 手绘替代）
   */
  const SNOW_CROP = { bust: [346, -20, 332, 369], upper: [226, -20, 572, 635], face: [390, 0, 244, 184] };
  const RIGDEC = new Map();
  function rigOn(s, key) {
    const K = KA();
    if (!K || !K.ready || warmMode) return false;
    const id = ((s.shot && s.shot.id) || '') + '|rig|' + key, now = performance.now();
    let d = RIGDEC.get(id);
    if (!d || now - d.at > 1500) { d = { on: !!K.ready(key) }; if (!d.on && K.load) K.load(key, 0); }
    d.at = now; RIGDEC.set(id, d);
    return d.on;
  }
  function snowCard(q, s, o) {
    if (rigOn(s, SNOW)) {
      const K = KA();
      if (K.draw(q, SNOW, { t: s.t, crop: SNOW_CROP[o.crop] || SNOW_CROP.bust, x: o.x, y: o.y, h: o.h, ax: 0.5, ay: 1, flip: !!o.flip, alpha: o.alpha, expr: o.expr, xfade: o.xfade ?? 0.2, look: o.look, mouth: o.mouth, tilt: o.tilt, nod: o.nod, blink: o.blink, wind: o.wind ?? 0.25, breath: o.breath ?? 1, tint: o.light ? [o.light.color, o.light.amount ?? 0.3] : undefined })) return true;
    }
    const S = SDK();
    if (!S || !S.card) return false;
    // 预热时也“画”一次（画到 2×2 的假画布上）：按真实的屏幕尺寸，提前开始下载该用的那一档清晰度
    try { const ok = !!S.card(q, 'snowsant', Object.assign({ t: s.t }, o)); return warmMode ? false : ok; } catch (e) { return false; }
  }

  /* =========================================================
   * 道具：汽水瓶（与片 II 同款：玻璃瓶、羊标签、红色皇冠盖；四种口味）、货箱（片 II 的 7 号货箱）
   * ========================================================= */
  const FLAVOR = {
    pink: { top: 'rgba(255,140,190,0.85)', bot: 'rgba(236,80,150,0.95)', foam: 'rgba(255,220,236,0.9)', band: '#ff7eb0', ink: '#e46a9c', rgb: '255,140,190' },
    mint: { top: 'rgba(140,240,200,0.85)', bot: 'rgba(40,190,150,0.95)', foam: 'rgba(220,255,240,0.9)', band: '#3fcf9e', ink: '#2aa87e', rgb: '120,230,190' },
    lemon: { top: 'rgba(255,236,120,0.88)', bot: 'rgba(240,184,40,0.95)', foam: 'rgba(255,250,214,0.9)', band: '#f5c230', ink: '#d49a1a', rgb: '255,220,90' },
    cyan: { top: 'rgba(120,222,248,0.85)', bot: 'rgba(30,160,220,0.95)', foam: 'rgba(214,246,255,0.9)', band: '#3fb8e8', ink: '#2a90c0', rgb: '90,200,245' },
    rainbow: { top: 'rgba(120,222,248,0.85)', bot: 'rgba(236,80,150,0.95)', foam: 'rgba(240,250,255,0.9)', band: '#b48ae0', ink: '#8a60c0', rgb: '200,170,255' },
  };
  const FLAVORS = ['pink', 'mint', 'lemon', 'cyan'];
  /** 汽水瓶精灵：设计尺寸 60×150，瓶底中心 (30,146)；fill 0..1 液面高度，cap 是否有盖 */
  function bottleArt(q, fl = 'pink', cap = true, fill = 1) {
    const F = FLAVOR[fl] || FLAVOR.pink;
    q.save();
    const ink = '#1f3a44';
    const body = () => { q.beginPath(); q.moveTo(22, 10); q.lineTo(38, 10); q.lineTo(38, 36); q.bezierCurveTo(38, 52, 52, 56, 52, 72); q.lineTo(52, 136); q.quadraticCurveTo(52, 146, 42, 146); q.lineTo(18, 146); q.quadraticCurveTo(8, 146, 8, 136); q.lineTo(8, 72); q.bezierCurveTo(8, 56, 22, 52, 22, 36); q.closePath(); };
    body(); q.fillStyle = 'rgba(170,236,232,0.55)'; q.fill();
    q.save(); body(); q.clip();
    if (fill > 0.01) {
      const ly = lerp(146, 64, fill);
      if (fl === 'rainbow') {
        // 彩虹汽水：从下往上一层粉、一层薄荷、一层柠檬、一层青（小羊们把四个灌装嘴都打开了）
        for (let k = 0; k < 4; k++) {
          const a = k * 0.25, b = min(fill, a + 0.25); if (b <= a) break;
          const F2 = FLAVOR[FLAVORS[k]], y0 = lerp(146, 64, b), y1 = lerp(146, 64, a);
          q.fillStyle = vg(q, y0, y1, [[0, F2.top], [1, F2.bot]]); q.fillRect(0, y0, 60, y1 - y0 + 0.6);
        }
      } else { q.fillStyle = vg(q, ly, 146, [[0, F.top], [1, F.bot]]); q.fillRect(0, ly, 60, 150 - ly); }
      q.fillStyle = F.foam; q.fillRect(0, ly - 2, 60, 4);
      q.fillStyle = 'rgba(255,255,255,0.75)'; for (let i = 0; i < 9; i++) { const by = 74 + hash(9, i, 2) * 64; if (by > ly + 4) { q.beginPath(); q.arc(14 + hash(9, i, 1) * 32, by, 1 + hash(9, i, 3) * 1.6, 0, TAU); q.fill(); } }
    }
    // 标签（羊）
    q.fillStyle = '#fff4f8'; q.fillRect(0, 92, 60, 30);
    q.fillStyle = F.band; q.fillRect(0, 92, 60, 4); q.fillRect(0, 118, 60, 4);
    q.fillStyle = '#ffffff'; for (const [x, y, r] of [[26, 107, 6], [32, 104, 6.5], [37, 108, 5.5], [30, 111, 6]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); }
    q.strokeStyle = F.ink; q.lineWidth = 1.2; for (const [x, y, r] of [[26, 107, 6], [32, 104, 6.5], [37, 108, 5.5], [30, 111, 6]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.stroke(); }
    q.fillStyle = '#fff4f8'; for (const [x, y, r] of [[26, 107, 5], [32, 104, 5.5], [37, 108, 4.5], [30, 111, 5]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); }
    q.fillStyle = '#3a2430'; q.beginPath(); q.ellipse(21, 106, 3.4, 4, -0.3, 0, TAU); q.fill();
    // 高光
    q.fillStyle = 'rgba(255,255,255,0.7)'; q.fillRect(12, 70, 4, 60); q.fillRect(24, 14, 3, 30);
    q.fillStyle = 'rgba(255,255,255,0.35)'; q.fillRect(44, 76, 3, 50);
    q.restore();
    body(); q.strokeStyle = ink; q.lineWidth = 2.2; q.stroke();
    if (cap) {
      q.fillStyle = '#e0424e'; rrect(q, 19, 3, 22, 10, 3); q.fill(); q.strokeStyle = '#6a1a22'; q.lineWidth = 1.6; q.stroke();
      q.fillStyle = 'rgba(255,255,255,0.5)'; q.fillRect(22, 5, 6, 2);
    } else {
      q.fillStyle = 'rgba(180,240,236,0.9)'; q.beginPath(); q.ellipse(30, 10, 8, 2.4, 0, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = 1.6; q.stroke();
    }
    q.restore();
  }
  /** 特写用的汽水瓶（同一个设计，细节更多：玻璃厚度、液体体积与液面、弧面的标签、更细的羊、带齿的皇冠盖） */
  const BODY_PATH = (q) => { q.beginPath(); q.moveTo(22, 10); q.lineTo(38, 10); q.lineTo(38, 36); q.bezierCurveTo(38, 52, 52, 56, 52, 72); q.lineTo(52, 136); q.quadraticCurveTo(52, 146, 42, 146); q.lineTo(18, 146); q.quadraticCurveTo(8, 146, 8, 136); q.lineTo(8, 72); q.bezierCurveTo(8, 56, 22, 52, 22, 36); q.closePath(); };
  function heroBottleArt(q, fl = 'pink', cap = true, fill = 1) {
    const F = FLAVOR[fl] || FLAVOR.pink, ink = '#1a3440';
    q.save();
    BODY_PATH(q); q.fillStyle = 'rgba(190,240,236,0.4)'; q.fill();
    q.save(); BODY_PATH(q); q.clip();
    if (fill > 0.01) {
      const ly = lerp(146, 64, fill);
      if (fl === 'rainbow') { for (let k = 0; k < 4; k++) { const a = k * 0.25, b = min(fill, a + 0.25); if (b <= a) break; const F2 = FLAVOR[FLAVORS[k]], y0 = lerp(146, 64, b), y1 = lerp(146, 64, a); q.fillStyle = vg(q, y0, y1, [[0, F2.top], [1, F2.bot]]); q.fillRect(0, y0, 60, y1 - y0 + 0.6); } }
      else { q.fillStyle = vg(q, ly, 146, [[0, F.top], [1, F.bot]]); q.fillRect(0, ly, 60, 150 - ly); }
      // 体积：左亮右暗
      q.fillStyle = hg(q, 8, 52, [[0, 'rgba(255,255,255,0.22)'], [0.35, 'rgba(255,255,255,0)'], [0.8, 'rgba(60,0,40,0.12)'], [1, 'rgba(60,0,40,0.3)']]); q.fillRect(0, ly, 60, 150 - ly);
      // 液面（略微从上往下看的一道椭圆）
      q.fillStyle = F.foam; q.beginPath(); q.ellipse(30, ly, 22, 2.2, 0, 0, TAU); q.fill();
      q.fillStyle = 'rgba(255,255,255,0.5)'; q.beginPath(); q.ellipse(26, ly - 0.4, 12, 0.9, 0, 0, TAU); q.fill();
    }
    // 标签：弧面（中间亮两边暗），粉色边带 + 细白线
    q.fillStyle = hg(q, 8, 52, [[0, '#f0dce4'], [0.3, '#fff8fb'], [0.7, '#fff4f8'], [1, '#e2c8d4']]); q.fillRect(0, 92, 60, 30);
    q.fillStyle = F.band; q.fillRect(0, 92, 60, 4.5); q.fillRect(0, 117.5, 60, 4.5);
    q.fillStyle = 'rgba(255,255,255,0.8)'; q.fillRect(0, 96.8, 60, 0.6); q.fillRect(0, 116.6, 60, 0.6);
    // 羊（与片 II 同样的构图：四团白毛 + 深色的脸；特写里多了小腿、耳朵、闭着的眼睛和腮红）
    const FL = [[26, 105.8, 5.4], [31.5, 103.2, 5.9], [36.6, 106.6, 5], [30, 109.4, 5.4]];
    q.fillStyle = '#3a2430'; for (const lx of [25.4, 28.6, 33.2, 36.2]) { rrect(q, lx - 0.9, 110, 1.8, 5.4, 0.9); q.fill(); }
    for (const [x, y, r] of FL) { q.fillStyle = '#ffffff'; q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); }
    q.strokeStyle = F.ink; q.lineWidth = 0.7; for (const [x, y, r] of FL) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.stroke(); }
    for (const [x, y, r] of FL) { q.fillStyle = '#ffffff'; q.beginPath(); q.arc(x, y, r - 0.7, 0, TAU); q.fill(); }
    q.save(); q.beginPath(); for (const [x, y, r] of FL) { q.moveTo(x + r - 0.7, y); q.arc(x, y, r - 0.7, 0, TAU); } q.clip();
    q.fillStyle = vg(q, 104, 115, [[0, 'rgba(255,214,230,0)'], [1, 'rgba(240,170,200,0.45)']]); q.fillRect(18, 104, 26, 12); q.restore();
    q.fillStyle = '#3a2430'; q.beginPath(); q.ellipse(23.6, 101.6, 1.2, 2.6, 0.9, 0, TAU); q.fill();
    q.beginPath(); q.ellipse(21, 105.4, 3.2, 3.9, -0.3, 0, TAU); q.fill();
    q.strokeStyle = '#ffffff'; q.lineWidth = 0.55; q.lineCap = 'round'; q.beginPath(); q.arc(20.2, 104.6, 0.9, PI * 1.1, PI * 1.9); q.stroke(); q.lineCap = 'butt';
    q.fillStyle = 'rgba(255,140,180,0.85)'; q.beginPath(); q.arc(21.6, 106.6, 0.7, 0, TAU); q.fill();
    E.text(q, 'SIESTA', 30, 120.2, { font: 'display', size: 3.4, weight: 700, color: '#ffffff', spacing: 0.8 });
    // 玻璃的厚度：右边一道暗、左边一道亮，瓶底一块厚玻璃
    q.fillStyle = hg(q, 8, 52, [[0, 'rgba(255,255,255,0.35)'], [0.12, 'rgba(255,255,255,0)'], [0.86, 'rgba(20,80,90,0)'], [1, 'rgba(20,80,90,0.35)']]); q.fillRect(0, 0, 60, 150);
    q.fillStyle = 'rgba(40,110,120,0.25)'; q.beginPath(); q.ellipse(30, 143, 20, 3.5, 0, 0, TAU); q.fill();
    // 高光
    q.fillStyle = vg(q, 60, 140, [[0, 'rgba(255,255,255,0.1)'], [0.2, 'rgba(255,255,255,0.8)'], [0.85, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0.1)']]); q.fillRect(12.2, 64, 3.6, 72);
    q.fillStyle = 'rgba(255,255,255,0.4)'; q.fillRect(17.4, 70, 1.2, 60);
    q.fillStyle = 'rgba(255,255,255,0.35)'; q.fillRect(45, 76, 2.4, 52);
    q.strokeStyle = 'rgba(255,255,255,0.75)'; q.lineWidth = 1.6; q.beginPath(); q.moveTo(24.2, 40); q.bezierCurveTo(24, 50, 14, 55, 12.6, 66); q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.75)'; q.fillRect(24.6, 13, 2.4, 26);
    q.restore();
    BODY_PATH(q); q.strokeStyle = ink; q.lineWidth = 1.8; q.stroke();
    q.strokeStyle = 'rgba(255,255,255,0.35)'; q.lineWidth = 0.6; q.save(); q.translate(0.9, 0.4); BODY_PATH(q); q.stroke(); q.restore();
    if (cap) {
      // 皇冠盖：一圈小齿 + 渐变 + 高光
      q.fillStyle = '#b8242e'; q.beginPath(); q.moveTo(18.5, 12.5); for (let i = 0; i <= 10; i++) { const x = 18.5 + i * 2.3; q.lineTo(x, 12.5 + (i % 2 ? 1.6 : 0)); } q.lineTo(41.5, 12.5); q.lineTo(41, 4.5); q.lineTo(19, 4.5); q.closePath(); q.fill();
      q.fillStyle = hg(q, 19, 41, [[0, '#ff7a7e'], [0.4, '#e8424e'], [1, '#a8202a']]); rrect(q, 19, 2.6, 22, 9.6, 2.5); q.fill();
      q.strokeStyle = '#5a1016'; q.lineWidth = 1.2; rrect(q, 19, 2.6, 22, 9.6, 2.5); q.stroke();
      q.fillStyle = 'rgba(255,255,255,0.6)'; q.fillRect(21.5, 4.2, 6, 1.6);
    } else {
      q.fillStyle = 'rgba(190,245,240,0.9)'; q.beginPath(); q.ellipse(30, 10, 8, 2.4, 0, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = 1.2; q.stroke();
    }
    q.restore();
  }
  /** 瓶子：(x, y) 瓶底中心，h 高，rot 旋转；o: { fl, cap, fill, a, sq }。屏幕上超过约 240 像素高时自动换成特写版 */
  function bottle(g, s, x, y, h, rot = 0, o = {}) {
    const fl = o.fl || 'pink', cap = o.cap !== false, fill = o.fill == null ? 1 : Math.round(clamp(o.fill) * 8) / 8;
    const m = g.getTransform(), zs = sqrt(abs(m.a * m.d - m.b * m.c)) / s.k, px = h * zs;
    let c;
    if (px > 240) { const res = px > 900 ? 12 : px > 500 ? 7 : 4; c = LC(s, `hbottle:${fl}:${cap ? 1 : 0}:${fill}:${res}`, 60, 150, (q) => heroBottleArt(q, fl, cap, fill), res); }
    else c = LC(s, `bottle:${fl}:${cap ? 1 : 0}:${fill}`, 60, 150, (q) => bottleArt(q, fl, cap, fill), 2.4);
    const sc = h / 150;
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(sc * (1 + (o.sq || 0) * 0.15), sc * (1 - (o.sq || 0) * 0.15)); if (o.a != null && o.a < 1) g.globalAlpha *= o.a; g.drawImage(c, -30, -146, 60, 150); g.restore();
  }
  /** 瓶口在世界坐标里的位置（瓶底 (x,y)，旋转 rot，高 h） */
  const bottleMouth = (x, y, h, rot) => [x + sin(rot) * h * 0.92, y - cos(rot) * h * 0.92];
  /** 皇冠瓶盖（飞在空中的那种）：(x,y) 中心，r 半径，tilt 0..1 侧看的扁度 */
  function capArt(q, hoof) {
    // 64×64，中心 (32,32)
    q.fillStyle = '#b8242e'; q.beginPath();
    for (let i = 0; i < 21; i++) { const a = (i / 21) * TAU, r = i % 2 ? 29 : 31.5; q.lineTo(32 + cos(a) * r, 32 + sin(a) * r); }
    q.closePath(); q.fill(); q.strokeStyle = '#5a1016'; q.lineWidth = 2; q.stroke();
    q.fillStyle = rg(q, 26, 24, 2, 26, [[0, '#ff7a7e'], [0.6, '#e0424e'], [1, '#b8242e']]); q.beginPath(); q.arc(32, 32, 24, 0, TAU); q.fill();
    q.strokeStyle = 'rgba(90,16,22,0.55)'; q.lineWidth = 1.5; q.beginPath(); q.arc(32, 32, 24, 0, TAU); q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.55)'; q.beginPath(); q.ellipse(24, 21, 9, 4, -0.6, 0, TAU); q.fill();
    // 瓶盖上印的小羊（白云 + 深色脸）
    q.fillStyle = '#fff4f8'; for (const [x, y, r] of [[30, 34, 6], [36, 31, 6.5], [41, 35, 5.5], [34, 38, 6]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); }
    q.fillStyle = '#3a2430'; q.beginPath(); q.ellipse(25, 33, 3.2, 3.8, -0.3, 0, TAU); q.fill();
    if (hoof) { q.fillStyle = '#ff7fb0'; q.beginPath(); q.ellipse(24, 26, 5.5, 7.5, -0.25, 0, TAU); q.ellipse(36, 25, 5.5, 7.5, 0.25, 0, TAU); q.fill(); q.strokeStyle = 'rgba(160,40,90,0.6)'; q.lineWidth = 1; q.stroke(); }
  }
  function bottleCap(g, s, x, y, r, rot = 0, tilt = 1, o = {}) {
    const c = LC(s, 'cap' + (o.hoof ? 'h' : ''), 64, 64, (q) => capArt(q, o.hoof), max(1.2, r / 22));
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, max(0.08, tilt)); if (o.a != null) g.globalAlpha *= o.a;
    g.drawImage(c, -r * 1.05, -r * 1.05, r * 2.1, r * 2.1); g.restore();
  }

  // ---- 货箱（与片 II 同款：设计尺寸 300×230，箱底中心 (150,226)；盖子单独画）；no = 箱号，hoof = 粉色小蹄印
  function crateArt(q, no = 7, hoof = true) {
    const planks = ['#c08a58', '#b47e4e', '#c6915f', '#b98452'];
    for (let i = 0; i < 4; i++) {
      q.fillStyle = planks[i]; q.fillRect(6, 8 + i * 54, 288, 54);
      q.strokeStyle = 'rgba(90,50,24,0.35)'; q.lineWidth = 1.2;
      for (let j = 0; j < 3; j++) { q.beginPath(); const yy = 20 + i * 54 + j * 13 + hash(4, i, j) * 6; q.moveTo(20, yy); q.bezierCurveTo(90, yy - 4, 180, yy + 5, 280, yy - 2); q.stroke(); }
      q.fillStyle = 'rgba(60,30,14,0.55)'; q.fillRect(6, 8 + i * 54 + 51, 288, 3);
    }
    q.fillStyle = '#8a5a34'; q.fillRect(0, 0, 30, 230); q.fillRect(270, 0, 30, 230); q.fillRect(0, 0, 300, 18); q.fillRect(0, 212, 300, 18);
    q.fillStyle = 'rgba(255,220,170,0.25)'; q.fillRect(0, 0, 300, 4); q.fillRect(0, 0, 4, 230);
    q.save(); q.beginPath(); q.rect(30, 18, 240, 194); q.clip();
    q.strokeStyle = '#94643c'; q.lineWidth = 20; q.beginPath(); q.moveTo(30, 212); q.lineTo(270, 18); q.stroke();
    q.strokeStyle = 'rgba(60,30,14,0.4)'; q.lineWidth = 2; q.beginPath(); q.moveTo(24, 204); q.lineTo(264, 10); q.stroke();
    q.restore();
    q.fillStyle = '#3a2a24'; for (const [x, y] of [[15, 10], [285, 10], [15, 220], [285, 220], [15, 115], [285, 115]]) { q.beginPath(); q.arc(x, y, 3, 0, TAU); q.fill(); }
    q.save(); q.globalAlpha = 0.78;
    E.text(q, 'SIESTA', 150, 88, { font: 'sans', size: 44, weight: 700, color: '#4a2616', spacing: 6 });
    E.text(q, '易碎 · FRAGILE', 150, 150, { font: 'sans', size: 24, weight: 700, color: '#6a2a20', spacing: 3 });
    E.text(q, 'No.' + no, 244, 196, { font: 'mono', size: 18, weight: 700, color: '#4a2616' });
    q.restore();
    q.strokeStyle = '#6a2a20'; q.lineWidth = 3; q.beginPath(); q.moveTo(58, 170); q.lineTo(62, 190); q.lineTo(74, 190); q.lineTo(78, 170); q.stroke(); q.beginPath(); q.moveTo(68, 190); q.lineTo(68, 202); q.moveTo(60, 202); q.lineTo(76, 202); q.stroke();
    if (hoof) hoofPrint(q, 1);
    q.strokeStyle = '#4a2616'; q.lineWidth = 3; q.strokeRect(1.5, 1.5, 297, 227);
  }
  /** 片 II 货箱上的那枚粉色小蹄印（箱子坐标）；k 0..1 盖上去的弹出 */
  function hoofPrint(q, k) {
    if (k <= 0) return;
    q.save(); q.translate(221, 175); q.scale(k, k); q.translate(-221, -175);
    q.fillStyle = '#ff8fbf'; q.beginPath(); q.ellipse(214, 176, 7, 9, -0.2, 0, TAU); q.ellipse(228, 174, 7, 9, 0.2, 0, TAU); q.fill();
    q.restore();
  }
  function lidArt(q) {
    q.fillStyle = '#b98452'; q.fillRect(0, 4, 308, 22); q.fillStyle = '#8a5a34'; q.fillRect(0, 0, 308, 6); q.fillRect(0, 22, 308, 6);
    q.strokeStyle = '#4a2616'; q.lineWidth = 3; q.strokeRect(1.5, 1.5, 305, 25);
  }
  /**
   * 货箱：(x, y) 箱底中心，sc 缩放（1 = 300 宽）；o: { no, hoof(0..1), lid(0..1 掀开), lidFly:[dx,dy,rot], wob, peek(q), inner(q), glow }
   */
  function crate(g, s, x, y, sc, o = {}) {
    const no = o.no || 7, hk = o.hoof == null ? 1 : o.hoof;
    const res = clamp(sc * 1.6, 0.6, 3.2);
    const body = LC(s, 'crate' + no + (hk >= 1 ? 'h' : ''), 300, 230, (q) => crateArt(q, no, hk >= 1), res);
    const lid = LC(s, 'crate-lid', 308, 28, lidArt, res);
    g.save(); g.translate(x, y);
    if (o.wob) g.rotate(o.wob);
    g.scale(sc * (1 + (o.sq || 0) * 0.12), sc * (1 - (o.sq || 0) * 0.12));
    if (o.inner) o.inner(g);
    g.drawImage(body, -150, -230, 300, 230);
    if (hk > 0 && hk < 1) { g.save(); g.translate(-150, -230); hoofPrint(g, ease.back(hk)); g.restore(); }
    if (o.leak) additive(g, (q) => { q.globalAlpha = o.leak; q.fillStyle = hg(q, -150, 150, [[0, 'rgba(255,150,210,0)'], [0.5, 'rgba(255,170,220,0.9)'], [1, 'rgba(255,150,210,0)']]); q.fillRect(-150, -236 - (o.lid || 0) * 16, 300, 8 + (o.lid || 0) * 10); q.globalAlpha = 1; });
    if (o.lid !== -1) {
      const lift = o.lid || 0;
      g.save(); g.translate(-154, -230 - lift * 16); g.rotate(-lift * 0.12);
      if (o.lidFly) { g.translate(o.lidFly[0], o.lidFly[1]); g.rotate(o.lidFly[2]); }
      g.drawImage(lid, 0, -24, 308, 28); g.restore();
    }
    if (o.front) o.front(g);
    g.restore();
  }

  /* =========================================================
   * 标题 / 片尾字幕
   * ========================================================= */
  function titleArt(q) {
    // 设计尺寸 1400×560，中心 (700, 260)
    q.save();
    // 一枚巨大的皇冠瓶盖垫在字后面
    q.save(); q.translate(700, 212); q.globalAlpha = 0.95;
    q.fillStyle = 'rgba(40,20,60,0.18)'; q.beginPath(); q.arc(10, 14, 196, 0, TAU); q.fill();
    q.fillStyle = '#ffffff'; q.beginPath();
    for (let i = 0; i < 42; i++) { const a = (i / 42) * TAU, r = i % 2 ? 184 : 198; q.lineTo(cos(a) * r, sin(a) * r); }
    q.closePath(); q.fill(); q.strokeStyle = '#ff8fbf'; q.lineWidth = 6; q.stroke();
    q.fillStyle = rg(q, -50, -60, 10, 190, [[0, '#fff6fb'], [0.55, '#ffe0ee'], [1, '#ffc2dc']]); q.beginPath(); q.arc(0, 0, 170, 0, TAU); q.fill();
    q.strokeStyle = 'rgba(255,143,191,0.6)'; q.lineWidth = 3; q.setLineDash([10, 9]); q.beginPath(); q.arc(0, 0, 152, 0, TAU); q.stroke(); q.setLineDash([]);
    q.restore();
    E.text(q, '汽水', 700, 282, { size: 190, weight: 900, spacing: 30, color: 'rgba(120,30,80,0.35)', stroke: 'rgba(90,20,60,0.25)', strokeW: 22 });
    const gr = vg(q, 110, 290, [[0, '#ffffff'], [0.45, '#ffe4f0'], [1, '#ff9cc8']]);
    E.text(q, '汽水', 700, 276, { size: 190, weight: 900, spacing: 30, color: gr, stroke: '#d9477f', strokeW: 10 });
    E.text(q, '汽水', 700, 276, { size: 190, weight: 900, spacing: 30, color: gr });
    E.text(q, 'EFFERVESCENCE', 700, 452, { font: 'display', size: 54, weight: 700, spacing: 18, color: '#ffffff', stroke: 'rgba(30,110,150,0.85)', strokeW: 9 });
    q.strokeStyle = 'rgba(255,255,255,0.85)'; q.lineWidth = 3;
    q.beginPath(); q.moveTo(430, 488); q.lineTo(620, 488); q.moveTo(780, 488); q.lineTo(970, 488); q.stroke();
    q.fillStyle = '#ffffff'; q.beginPath(); q.arc(700, 488, 6, 0, TAU); q.fill();
    E.text(q, 'MV · 本页原创', 700, 534, { font: 'sans', size: 26, weight: 700, spacing: 8, color: '#ffffff', stroke: 'rgba(30,110,150,0.7)', strokeW: 6 });
    // 字边的小气泡
    for (const [x, y, r] of [[418, 150, 16], [446, 96, 9], [980, 120, 13], [1010, 190, 8], [960, 262, 6], [392, 232, 7]]) {
      q.fillStyle = 'rgba(255,255,255,0.25)'; q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill();
      q.strokeStyle = 'rgba(255,255,255,0.95)'; q.lineWidth = 2.5; q.stroke();
      q.fillStyle = '#fff'; q.beginPath(); q.ellipse(x - r * 0.35, y - r * 0.35, r * 0.3, r * 0.18, -0.7, 0, TAU); q.fill();
    }
    q.restore();
  }
  function creditsCard(g, a) {
    if (a <= 0.01) return;
    g.save(); g.globalAlpha = a;
    g.fillStyle = 'rgba(28,20,52,0.66)'; rrect(g, 430, 650, 1060, 318, 26); g.fill();
    g.strokeStyle = 'rgba(255,214,236,0.4)'; g.lineWidth = 2; rrect(g, 442, 662, 1036, 294, 20); g.stroke();
    E.text(g, '歌曲　Effervescence', 960, 716, { size: 34, weight: 700, color: '#fff6f0', spacing: 2 });
    E.text(g, '塞壬唱片-MSR / Kirara Magic（《火山旅梦》OST）', 960, 766, { font: 'sans', size: 24, weight: 500, color: '#ffe6ee', maxW: 980 });
    E.text(g, 'MV：本页原创同人影像，与官方无关', 960, 828, { font: 'sans', size: 25, weight: 700, color: '#fff0c8', spacing: 2 });
    E.text(g, '角色与世界观 © Hypergryph', 960, 874, { font: 'sans', size: 22, weight: 500, color: '#ffe6ee', spacing: 2 });
    E.text(g, '角色立绘 © Hypergryph（官方原画，本页分层绑定）', 960, 908, { font: 'sans', size: 20, weight: 500, color: '#ffe6ee', spacing: 1 });
    E.text(g, 'Q版小人 © Hypergryph（官方 Spine 模型）', 960, 938, { font: 'sans', size: 20, weight: 500, color: '#ffe6ee', spacing: 1 });
    g.restore();
  }

  /* =========================================================
   * 白天的天空、云、太阳、远处的小镇与火山
   * ========================================================= */
  const SKY_DAY = [[0, '#2784da'], [0.3, '#45a6ea'], [0.58, '#82cbf3'], [0.8, '#c2ebf9'], [1, '#effaf7']];
  function skyFill(q, y0, y1, stops = SKY_DAY) { q.fillStyle = vg(q, y0, y1, stops); q.fillRect(-600, y0 - 600, VW + 1200, y1 - y0 + 600); q.fillStyle = stops[stops.length - 1][1]; q.fillRect(-600, y1 - 1, VW + 1200, 800); }
  /** 夏天的积云（设计 w×h，底边平；上亮下带一点蓝灰） */
  function cumulusArt(q, w, h, seed, o = {}) {
    const R = E.rng(seed), cs = [];
    // 一座“山”形的积云：中间高、两边低；团块大、互相压着（底边是一条平的云底）
    const base = h * 0.86, n = 22 + floor(R() * 6);
    for (let i = 0; i < n; i++) {
      const dx = (R() - 0.5) * 0.84, peak = 1 - pow(abs(dx) / 0.42, 1.6);
      const r = h * (0.14 + 0.14 * R()) * (0.5 + 0.7 * max(0, peak));
      const cy = base - r * 0.35 - max(0, peak) * h * (0.28 + 0.3 * R());
      cs.push([w * (0.5 + dx), cy, r]);
    }
    // 最高的一团不能顶出画布（否则云顶会被切成一条直线）：整体往下压
    const top = min(...cs.map(([, y, r]) => y - r)), lim = h * 0.03;
    if (top < lim) { const f = (base - lim) / (base - top); for (const c of cs) { c[1] = base - (base - c[1]) * f; c[2] *= f; } }
    // 云底：几团扁的大椭圆把底部连起来（不会露出一颗颗珠子）
    const path = () => { q.beginPath(); for (const [x, y, r] of cs) { q.moveTo(x + r, y); q.arc(x, y, r, 0, TAU); } q.moveTo(w * 0.92, base - h * 0.08); q.ellipse(w * 0.5, base - h * 0.08, w * 0.42, h * 0.12, 0, 0, TAU); };
    q.save();
    q.beginPath(); q.rect(0, 0, w, base); q.clip();
    path(); q.clip();
    q.fillStyle = vg(q, 0, base, [[0, o.top || '#ffffff'], [0.55, o.mid || '#f6fbff'], [1, o.bot || '#bcd8ee']]); q.fillRect(0, 0, w, h);
    // 团块的阴影（往右下偏）+ 左上的高光
    q.fillStyle = o.shade || 'rgba(120,160,210,0.24)';
    for (const [x, y, r] of cs) { q.beginPath(); q.arc(x + r * 0.3, y + r * 0.42, r * 0.9, 0, TAU); q.fill(); }
    q.fillStyle = 'rgba(255,255,255,0.92)';
    for (const [x, y, r] of cs) { q.beginPath(); q.arc(x - r * 0.2, y - r * 0.24, r * 0.7, 0, TAU); q.fill(); }
    // 云底一道蓝灰
    q.fillStyle = vg(q, base - h * 0.14, base, [[0, 'rgba(150,180,215,0)'], [1, 'rgba(150,180,215,0.55)']]); q.fillRect(0, base - h * 0.14, w, h * 0.14);
    q.restore();
  }
  function cumulus(g, s, key, x, y, w, h, seed, a = 1, o) {
    const c = LC(s, 'cu:' + key, w, h, (q) => cumulusArt(q, w, h, seed, o), o && o.res ? o.res : 0.6);
    withAlpha(g, a, (q) => q.drawImage(c, x - w / 2, y - h, w, h));
  }
  /** 太阳：白芯 + 大光晕 + 一串镜头光斑（沿太阳→画面中心的连线） */
  function sun(g, x, y, r, a = 1, flare = 1) {
    E.glow(g, x, y, r * 9, '255,246,214', 0.45 * a, 'lighter', false);
    E.glow(g, x, y, r * 3.2, '255,255,240', 0.9 * a);
    g.fillStyle = `rgba(255,255,250,${a})`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    if (flare > 0.01) {
      const dx = 960 - x, dy = 540 - y;
      for (const [k, rr, c, aa] of [[0.35, 26, '255,220,160', 0.25], [0.62, 60, '170,230,255', 0.14], [0.9, 18, '255,200,230', 0.3], [1.25, 90, '200,255,230', 0.1], [1.6, 34, '255,236,180', 0.18]]) {
        E.glow(g, x + dx * k, y + dy * k, rr, c, aa * flare * a, 'lighter', false);
      }
    }
  }
  /** 远处的火山（白天：灰蓝紫，山顶一缕白烟） */
  function volcanoFar(q, cx, top, base, w, o = {}) {
    q.fillStyle = vg(q, top, base, [[0, o.c0 || '#8f9cc4'], [0.6, o.c1 || '#9fb2d2'], [1, o.c2 || '#bcd4e6']]);
    q.beginPath(); q.moveTo(cx - w, base + 6);
    q.quadraticCurveTo(cx - w * 0.4, base - (base - top) * 0.3, cx - w * 0.07, top);
    q.lineTo(cx - w * 0.035, top - 4); q.lineTo(cx, top + 5); q.lineTo(cx + w * 0.04, top - 2); q.lineTo(cx + w * 0.075, top + 1);
    q.quadraticCurveTo(cx + w * 0.45, base - (base - top) * 0.32, cx + w, base + 6);
    q.closePath(); q.fill();
    // 阳面 / 阴面
    q.save(); q.clip();
    q.fillStyle = 'rgba(255,255,255,0.18)'; q.beginPath(); q.moveTo(cx - w * 0.07, top); q.quadraticCurveTo(cx - w * 0.4, base - (base - top) * 0.3, cx - w, base + 6); q.lineTo(cx - w * 0.2, base + 6); q.closePath(); q.fill();
    q.strokeStyle = 'rgba(90,100,150,0.18)'; q.lineWidth = 3;
    for (let i = 0; i < 7; i++) { const u = (i + 0.5) / 7 - 0.5; q.beginPath(); q.moveTo(cx + u * w * 0.1, top + 8); q.quadraticCurveTo(cx + u * w * 0.8, lerp(top, base, 0.5), cx + u * w * 1.7, base); q.stroke(); }
    q.restore();
  }
  /** 火山口飘出的一缕白烟（活的） */
  function plume(g, t, cx, cy, sc, a = 0.5, rgb = '255,255,255') {
    const A = g.globalAlpha;
    for (let i = 0; i < 16; i++) {
      const u = fract(t * 0.02 + i / 16);
      const px = cx - u * 260 * sc - u * u * 200 * sc + sin(u * 6 + i) * 12 * sc, py = cy - u * 240 * sc + u * u * 60 * sc;
      const r = (16 + u * 120) * sc;
      g.globalAlpha = A * a * sin(PI * min(1, u * 1.1 + 0.03)) * (0.7 + 0.3 * hash(3, i));
      g.drawImage(puffSpr(i, rgb), px - r, py - r * 0.6, r * 2, r * 1.2);
    }
    g.globalAlpha = A;
  }
  // ---- 白天的小房子（立面）：白墙 / 粉彩墙，阳面亮、背阴面带蓝紫，窗与百叶、花箱、拱门
  const PASTEL = ['#fbf7ef', '#fbf7ef', '#fff2e0', '#ffe0ea', '#e2f4ff', '#fff4c8', '#e6f6e6', '#f3e6ff', '#fbf7ef'];
  const SHUTTER = ['#3fa6b8', '#4a78c8', '#7a5ab0', '#e0507a', '#3e9a6a', '#f0a030'];
  const ROOF = ['#e07a5a', '#d8684e', '#e8906a', '#c8584a'];
  /** 一栋房子：{ x, w, top, base, col, roof, style, seed }；detail 0..1 */
  function dayHouse(q, h, detail, o = {}) {
    const { x, w, top, base } = h, H = base - top, R = E.rng(h.seed);
    const ink = o.ink || 'rgba(60,50,80,0.7)', lw = o.lw || 2.2;
    const shadeK = o.shade ?? 0.18;
    // 屋顶
    if (h.roof < 0.3) {
      q.fillStyle = pick(ROOF, h.style); q.beginPath(); q.moveTo(x - 8, top + 2); q.lineTo(x + w / 2, top - w * 0.24); q.lineTo(x + w + 8, top + 2); q.closePath(); q.fill();
      if (detail > 0.4) { q.strokeStyle = 'rgba(120,40,30,0.35)'; q.lineWidth = 1.4; for (let i = 1; i < 5; i++) { const yy = top - w * 0.24 * (1 - i / 5); q.beginPath(); q.moveTo(x + w / 2 - (w / 2 + 8) * (i / 5), yy + 2); q.lineTo(x + w / 2 + (w / 2 + 8) * (i / 5), yy + 2); q.stroke(); } }
      q.fillStyle = 'rgba(255,255,255,0.3)'; q.beginPath(); q.moveTo(x - 8, top + 2); q.lineTo(x + w / 2, top - w * 0.24); q.lineTo(x + w / 2, top - w * 0.24 + 6); q.lineTo(x - 2, top + 2); q.closePath(); q.fill();
      q.strokeStyle = ink; q.lineWidth = lw; q.beginPath(); q.moveTo(x - 8, top + 2); q.lineTo(x + w / 2, top - w * 0.24); q.lineTo(x + w + 8, top + 2); q.stroke();
    } else if (h.roof < 0.42) {
      q.fillStyle = h.style < 0.5 ? '#3f8fd8' : '#58b0e8';
      q.beginPath(); q.arc(x + w / 2, top - 8, w * 0.32, PI, 0); q.fill(); q.strokeStyle = ink; q.lineWidth = lw; q.stroke();
      q.fillStyle = 'rgba(255,255,255,0.45)'; q.beginPath(); q.arc(x + w / 2 - w * 0.08, top - 8, w * 0.22, PI * 1.1, PI * 1.5); q.lineTo(x + w / 2 - w * 0.08, top - 8); q.fill();
      q.fillStyle = '#fbf7ef'; q.fillRect(x + w / 2 - 2, top - 8 - w * 0.32 - 12, 4, 12);
    }
    // 墙（左边阳面，右侧一条背阴）
    const wallTop = h.roof >= 0.42 ? top - 10 : top;
    q.fillStyle = h.col; q.fillRect(x, wallTop, w, base - wallTop);
    q.fillStyle = `rgba(90,110,190,${shadeK})`; q.fillRect(x + w * 0.82, wallTop, w * 0.18, base - wallTop);
    if (h.roof >= 0.42) { q.fillStyle = '#ffffff'; q.fillRect(x - 5, wallTop - 6, w + 10, 7); q.strokeStyle = ink; q.lineWidth = lw * 0.8; q.strokeRect(x - 5, wallTop - 6, w + 10, 7); }
    if (detail > 0.5) { q.fillStyle = 'rgba(120,100,90,0.05)'; for (let i = 0; i < 12; i++) q.fillRect(x + R() * w, top + R() * H, 3 + R() * 10, 2 + R() * 3); }
    // 窗
    const fh = o.floorH || 96, floors = max(1, floor((H - (detail > 0.7 ? 130 : 30)) / fh)), cols = max(1, Math.round(w / 90));
    const shut = pick(SHUTTER, h.style);
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const wx = x + ((c + 0.5) * w) / cols, wy = top + 30 + f * fh, ww = min(40, (w / cols) * 0.46), wh = min(58, fh * 0.6);
      const arch = h.style > 0.45;
      q.beginPath();
      if (arch) { q.moveTo(wx - ww / 2, wy + wh); q.lineTo(wx - ww / 2, wy + ww / 2); q.arc(wx, wy + ww / 2, ww / 2, PI, 0); q.lineTo(wx + ww / 2, wy + wh); q.closePath(); }
      else q.rect(wx - ww / 2, wy, ww, wh);
      q.fillStyle = '#2f5a78'; q.fill();
      if (detail > 0.35) { q.fillStyle = 'rgba(190,235,255,0.55)'; q.beginPath(); q.moveTo(wx - ww / 2, wy + wh * 0.7); q.lineTo(wx + ww * 0.1, wy + wh * 0.1); q.lineTo(wx + ww / 2, wy + wh * 0.1); q.lineTo(wx - ww / 2, wy + wh); q.closePath(); q.fill(); }
      q.strokeStyle = '#ffffff'; q.lineWidth = lw * 1.2; q.stroke();
      if (detail > 0.55) {
        q.strokeStyle = ink; q.lineWidth = lw * 0.6; q.stroke();
        if (R() < 0.7) { q.fillStyle = shut; q.fillRect(wx - ww / 2 - 11, wy + 2, 9, wh - 2); q.fillRect(wx + ww / 2 + 2, wy + 2, 9, wh - 2); q.strokeStyle = ink; q.lineWidth = lw * 0.5; q.strokeRect(wx - ww / 2 - 11, wy + 2, 9, wh - 2); q.strokeRect(wx + ww / 2 + 2, wy + 2, 9, wh - 2); }
        if (R() < 0.5) { q.fillStyle = '#8a5a3a'; q.fillRect(wx - ww / 2 - 3, wy + wh, ww + 6, 7); for (let i = 0; i < 5; i++) { q.fillStyle = R() < 0.35 ? '#3e9a5a' : R() < 0.7 ? '#ff5f9a' : '#ffb0c8'; q.beginPath(); q.arc(wx - ww / 2 + 3 + i * (ww / 4), wy + wh - 1 - R() * 4, 3.5 + R() * 2.5, 0, TAU); q.fill(); } }
      }
    }
    if (detail > 0.7) {
      const dx = x + w * (0.25 + R() * 0.5);
      q.beginPath(); q.moveTo(dx - 26, base); q.lineTo(dx - 26, base - 76); q.arc(dx, base - 76, 26, PI, 0); q.lineTo(dx + 26, base); q.closePath();
      q.fillStyle = pick(['#3fa6b8', '#4a78c8', '#e0507a', '#3e9a6a', '#8a5a3a'], R()); q.fill(); q.strokeStyle = ink; q.lineWidth = lw; q.stroke();
      q.fillStyle = '#ffd070'; q.beginPath(); q.arc(dx + 14, base - 48, 3, 0, TAU); q.fill();
    }
    q.strokeStyle = ink; q.lineWidth = lw; q.beginPath(); q.moveTo(x, base); q.lineTo(x, wallTop); q.lineTo(x + w, wallTop); q.lineTo(x + w, base); q.stroke();
  }
  /** 一排房子（确定性） */
  function houseRow(seed, x0, x1, base, hmin, hmax, wmin, wmax, gapP = 0.3) {
    const R = E.rng(seed), out = [];
    let x = x0;
    while (x < x1) {
      const w = wmin + R() * (wmax - wmin), h = hmin + R() * (hmax - hmin);
      out.push({ x, w, top: base - h, base: base + R() * 6, col: pick(PASTEL, R()), roof: R(), style: R(), seed: (R() * 1e6) | 0 });
      x += w + (R() < gapP ? 6 + R() * 26 : -R() * 10);
    }
    return out;
  }
  /* ---------- 汐斯塔的度假风建筑（参照活动 PV：圆塔、带状窗、檐片、霓虹招牌、糖果色） ---------- */
  const RETRO = ['#f39ab4', '#f7b09a', '#f8ecd8', '#7fd0c8', '#fbf6ee', '#f6d98a', '#c9b6ec', '#9fdcf0', '#fbf6ee', '#f8ecd8'];
  const RTRIM = ['#fbf8f2', '#2f8f98', '#e8607a', '#f0a030', '#5a8ae0'];
  const NEON = ['255,110,170', '90,230,255', '255,220,110', '160,255,190'];
  /** 一栋度假风建筑：b = { x, w, top, base, kind, col, trim, seed }；o: { detail, ink, lw, night(0..1), shade } */
  function retroBuilding(q, b, o = {}) {
    const { x, w, top, base } = b, H = base - top, R = E.rng(b.seed);
    const ink = o.ink || 'rgba(60,40,80,0.75)', lw = o.lw || 2.4, det = o.detail ?? 1, night = o.night || 0;
    const col = night ? mixC(b.col, '#241a44', night * 0.72) : b.col, trim = night ? mixC(b.trim, '#241a44', night * 0.6) : b.trim;
    // 夜里：带状窗是暗的（偶尔几格亮着），单独的窗一半亮一半暗
    const nt = night > 0.35, winC = nt ? '#2a2046' : '#2d5a74', winHi = nt ? 'rgba(120,100,170,0.35)' : 'rgba(170,230,255,0.55)';
    if (b.kind === 'tower') {
      // 圆塔：左亮右暗的圆柱 + 一圈圈带状窗 + 顶上的圆盘檐
      q.fillStyle = hg(q, x, x + w, [[0, mixC(col, '#ffffff', 0.25)], [0.35, col], [1, mixC(col, '#3a2a60', 0.35 + night * 0.2)]]); q.fillRect(x, top, w, H);
      const bands = max(2, floor(H / 58));
      for (let i = 0; i < bands; i++) {
        const by = top + 30 + i * 58;
        if (by + 24 > base - 20) break;
        q.fillStyle = winC; q.fillRect(x + 4, by, w - 8, 24);
        if (det > 0.4) { q.fillStyle = winHi; q.fillRect(x + 4, by, w * 0.35, 8); q.strokeStyle = trim; q.lineWidth = 2; for (let mx = x + 10; mx < x + w - 6; mx += 16) { q.beginPath(); q.moveTo(mx, by); q.lineTo(mx, by + 24); q.stroke(); } }
        if (nt && R() < 0.35) { q.fillStyle = 'rgba(255,220,160,0.9)'; q.fillRect(x + 6 + R() * (w - 30), by + 3, 14, 18); }
      }
      q.fillStyle = trim; q.beginPath(); q.ellipse(x + w / 2, top, w / 2 + 14, 12, 0, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = lw; q.stroke();
      q.fillStyle = mixC(trim, '#000000', 0.15); q.fillRect(x - 14, top, w + 28, 8);
      if (det > 0.5) { q.strokeStyle = trim; q.lineWidth = 3; q.beginPath(); q.moveTo(x + w / 2, top - 10); q.lineTo(x + w / 2, top - 60); q.stroke(); q.fillStyle = '#e8607a'; q.beginPath(); q.moveTo(x + w / 2, top - 60); q.lineTo(x + w / 2 + 24, top - 52); q.lineTo(x + w / 2, top - 44); q.closePath(); q.fill(); }
      q.strokeStyle = ink; q.lineWidth = lw; q.beginPath(); q.moveTo(x, top); q.lineTo(x, base); q.moveTo(x + w, top); q.lineTo(x + w, base); q.stroke();
      return;
    }
    const rr = b.kind === 'box' ? min(60, w * 0.25) : 0;
    // 主体（右上角圆角）
    q.beginPath(); q.moveTo(x, base); q.lineTo(x, top); q.lineTo(x + w - rr, top); if (rr) q.arc(x + w - rr, top + rr, rr, -PI / 2, 0); q.lineTo(x + w, base); q.closePath();
    q.fillStyle = col; q.fill();
    q.save(); q.clip();
    q.fillStyle = `rgba(80,90,190,${0.16 + night * 0.1})`; q.fillRect(x + w * 0.8, top, w * 0.2, H);
    if (rr) { q.fillStyle = hg(q, x + w - rr * 1.6, x + w, [[0, 'rgba(80,90,190,0)'], [1, `rgba(80,90,190,${0.28 + night * 0.1})`]]); q.fillRect(x + w - rr * 1.6, top, rr * 1.6, H); }
    // 横向的彩带（楼层线）
    const fh = b.kind === 'stack' ? 64 : 76, floors = max(1, floor((H - 40) / fh));
    for (let f = 0; f < floors; f++) {
      const fy = top + 34 + f * fh;
      // 檐片（eyebrow）：一道突出的白板，下面一条影子
      q.fillStyle = trim; q.fillRect(x - 6, fy - 10, w + 12, 7);
      q.fillStyle = 'rgba(40,30,70,0.2)'; q.fillRect(x, fy - 3, w, 6);
      // 窗
      if (b.style < 0.5) {
        q.fillStyle = winC; q.fillRect(x + 12, fy + 8, w - 24, 30);
        if (nt) for (let mx = x + 12; mx < x + w - 38; mx += 26) if (R() < 0.38) { q.fillStyle = R() < 0.3 ? 'rgba(255,236,190,0.95)' : 'rgba(255,200,130,0.9)'; q.fillRect(mx + 2, fy + 10, 22, 26); }
        if (det > 0.4) { q.fillStyle = winHi; q.fillRect(x + 12, fy + 8, (w - 24) * 0.3, 10); q.strokeStyle = trim; q.lineWidth = 2; for (let mx = x + 30; mx < x + w - 14; mx += 26) { q.beginPath(); q.moveTo(mx, fy + 8); q.lineTo(mx, fy + 38); q.stroke(); } }
      } else {
        for (let wx = x + 22; wx < x + w - 30; wx += 44) {
          if (b.kind === 'stack' || R() < 0.3) { q.fillStyle = winC; q.beginPath(); q.arc(wx + 10, fy + 24, 11, 0, TAU); q.fill(); q.strokeStyle = trim; q.lineWidth = 3; q.stroke(); }
          else { q.fillStyle = winC; q.fillRect(wx, fy + 8, 24, 32); if (det > 0.4) { q.fillStyle = winHi; q.fillRect(wx, fy + 8, 8, 32); } q.strokeStyle = trim; q.lineWidth = 2.5; q.strokeRect(wx, fy + 8, 24, 32); }
          if (nt && R() < 0.4) { q.fillStyle = R() < 0.3 ? 'rgba(255,236,190,0.95)' : 'rgba(255,200,130,0.92)'; q.fillRect(wx + 3, fy + 11, 18, 26); q.fillStyle = 'rgba(200,120,70,0.5)'; q.fillRect(wx + 3, fy + 26, 18, 11); }
        }
      }
    }
    if (det > 0.5) { q.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 10; i++) q.fillRect(x + R() * w, top + R() * H, 3 + R() * 12, 2 + R() * 3); }
    q.restore();
    q.strokeStyle = ink; q.lineWidth = lw; q.beginPath(); q.moveTo(x, base); q.lineTo(x, top); q.lineTo(x + w - rr, top); if (rr) q.arc(x + w - rr, top + rr, rr, -PI / 2, 0); q.lineTo(x + w, base); q.stroke();
    // 屋顶：女儿墙 + 霓虹招牌 / 水塔 / 天线
    q.fillStyle = trim; q.fillRect(x - 4, top - 8, w - rr + 8, 9);
    if (det > 0.3 && b.sign) {
      const sx = x + w * 0.2, sw = w * 0.55, sy = top - 56;
      q.strokeStyle = '#4a4a5a'; q.lineWidth = 3; q.beginPath(); q.moveTo(sx + 8, top - 8); q.lineTo(sx + 8, sy + 36); q.moveTo(sx + sw - 8, top - 8); q.lineTo(sx + sw - 8, sy + 36); q.stroke();
      rrect(q, sx, sy, sw, 38, 10); q.fillStyle = nt ? '#2a1a3a' : '#fbf8f2'; q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke();
      const nc = NEON[b.seed % NEON.length];
      q.strokeStyle = nt ? `rgb(${nc})` : `rgba(${nc},0.9)`; q.lineWidth = 4; q.lineCap = 'round';
      q.beginPath(); for (let i = 0; i < 4; i++) { const cx = sx + 16 + i * (sw - 32) / 3.2; q.moveTo(cx, sy + 28); q.quadraticCurveTo(cx + 6, sy + 6, cx + 12, sy + 28); } q.stroke(); q.lineCap = 'butt';
    } else if (det > 0.3 && b.style > 0.7) {
      q.fillStyle = '#c8b8a8'; q.fillRect(x + w * 0.6, top - 44, 34, 36); q.strokeStyle = ink; q.lineWidth = 1.6; q.strokeRect(x + w * 0.6, top - 44, 34, 36);
      q.beginPath(); q.moveTo(x + w * 0.6 - 2, top - 44); q.lineTo(x + w * 0.6 + 17, top - 58); q.lineTo(x + w * 0.6 + 36, top - 44); q.closePath(); q.fillStyle = '#e8607a'; q.fill(); q.stroke();
    }
    // 底层：遮阳篷 / 店门
    if (det > 0.6 && b.awn) {
      const ay = base - 110, ac = pick(['#ff86b8', '#46b8c8', '#f6c040', '#e8607a'], R());
      for (let i = 0; i < 8; i++) { q.fillStyle = i % 2 ? '#fff8fc' : ac; q.beginPath(); q.moveTo(x + 10 + (i * (w - 20)) / 8, ay); q.lineTo(x + 10 + ((i + 1) * (w - 20)) / 8, ay); q.lineTo(x + 14 + ((i + 1) * (w - 20)) / 8, ay + 30); q.lineTo(x + 14 + (i * (w - 20)) / 8, ay + 30); q.closePath(); q.fill(); }
      q.strokeStyle = ink; q.lineWidth = 2; q.strokeRect(x + 10, ay, w - 16, 30);
    }
  }
  /** 一排度假风建筑（确定性）：返回 [{…}]，高度 hmin..hmax，宽 wmin..wmax */
  function resortRow(seed, x0, x1, base, hmin, hmax, wmin, wmax) {
    const R = E.rng(seed), out = [];
    let x = x0;
    while (x < x1) {
      const r = R(), kind = r < 0.22 ? 'tower' : r < 0.62 ? 'box' : 'stack';
      const w = kind === 'tower' ? wmin * 0.8 + R() * (wmax - wmin) * 0.5 : wmin + R() * (wmax - wmin), h = hmin + R() * (hmax - hmin) * (kind === 'tower' ? 1.2 : 1);
      out.push({ x, w, top: base - h, base, kind, col: pick(RETRO, R()), trim: pick(RTRIM, R()), style: R(), sign: R() < 0.3, awn: R() < 0.5, seed: (R() * 1e6) | 0 });
      x += w + (R() < 0.45 ? 16 + R() * 60 : 4);
    }
    return out;
  }
  /** 灌木 / 三角梅（一团团） */
  function bush(q, x, y, r, seed, flowers = true, o = {}) {
    const R = E.rng(seed);
    for (let j = 0; j < 14; j++) { const a = R() * TAU, d = sqrt(R()) * r; q.fillStyle = j % 3 ? (o.leaf || '#3f8a52') : (o.leaf2 || '#2f7044'); q.beginPath(); q.ellipse(x + cos(a) * d, y + sin(a) * d * 0.7, r * 0.36, r * 0.26, a, 0, TAU); q.fill(); }
    q.fillStyle = 'rgba(255,255,255,0.12)'; q.beginPath(); q.ellipse(x - r * 0.3, y - r * 0.35, r * 0.5, r * 0.25, -0.3, 0, TAU); q.fill();
    if (flowers) for (let j = 0; j < 18; j++) { const a = R() * TAU, d = pow(R(), 0.7) * r; q.fillStyle = R() < 0.5 ? (o.f1 || '#ff4f94') : (o.f2 || '#ff8ab8'); q.beginPath(); q.arc(x + cos(a) * d, y + sin(a) * d * 0.7, r * (0.07 + R() * 0.06), 0, TAU); q.fill(); }
  }

  /* =========================================================
   * 世界 1 · 汽水摊（正立面）：地面 y = 880；世界 x -300..2200
   *   左：棕榈、路灯、黑板、送货三轮、老板的凳子；中：汽水亭（粉白条纹遮阳篷、冰柜）；右：灌装工坊（屋顶上的铜罐）
   * ========================================================= */
  const SG = 880;
  const ST = { x0: 720, x1: 1240, counterY: 694, hatch: [472, 694], cooler: [1256, 1374, 560], annex: [1392, 1990, 330], door: [1706, 1862, 486], knob: [1840, 690], gauge: [1570, 252, 30], tankX: [1480, 1660], stool: 676, trike: 470 };
  /** 远景：海湾与岬角上的博物馆、火山、山坡上远远的一片度假楼 */
  const ST_FAR = resortRow(5, 380, 2320, 0, 60, 150, 50, 110);
  const ST_MID = resortRow(9, 300, 2300, 800, 170, 380, 110, 240);
  function standFar(q) {
    // 海湾（左边）+ 远处岬角上的火山博物馆（小小的圆顶）
    q.fillStyle = vg(q, 600, 760, [[0, '#62d0e2'], [1, '#2ea8cc']]); q.fillRect(-600, 598, 1700, 200);
    q.fillStyle = 'rgba(255,255,255,0.55)'; for (let i = 0; i < 50; i++) q.fillRect(-500 + hash(11, i) * 1500, 604 + hash(12, i) * 80, 10 + hash(13, i) * 40, 1.5);
    q.fillStyle = '#86b4a4'; q.beginPath(); q.moveTo(-600, 608); q.bezierCurveTo(-360, 590, -200, 556, 20, 566); q.bezierCurveTo(140, 572, 220, 596, 360, 606); q.lineTo(-600, 612); q.closePath(); q.fill();
    q.fillStyle = '#ece6f4'; q.fillRect(-60, 546, 50, 24); q.beginPath(); q.arc(-72, 554, 14, PI, 0); q.fill(); q.fillRect(-86, 554, 28, 16);
    q.fillStyle = '#7a9aaa'; q.fillRect(-44, 551, 5, 8); q.fillRect(-28, 551, 5, 8);
    // 火山
    volcanoFar(q, 1760, 250, 640, 700);
    // 山坡
    q.fillStyle = vg(q, 380, 760, [[0, '#a8d0b0'], [1, '#78b08c']]);
    q.beginPath(); q.moveTo(360, 780); q.bezierCurveTo(640, 560, 1000, 470, 1400, 440); q.bezierCurveTo(1700, 420, 2000, 450, 2400, 480); q.lineTo(2400, 800); q.closePath(); q.fill();
    for (const b of ST_FAR) { const gy = hillY(b.x + b.w / 2) + 36, hh = (b.base - b.top); retroBuilding(q, Object.assign({}, b, { top: gy - hh, base: gy + 30, sign: false, awn: false }), { detail: 0.3, lw: 1.4 }); }
    for (let i = 0; i < 26; i++) { const x = 420 + hash(21, i) * 1900; bush(q, x, hillY(x) + 50 + hash(22, i) * 30, 16 + hash(23, i) * 14, 300 + i, hash(24, i) < 0.4); }
    for (let i = 0; i < 9; i++) { const x = 480 + hash(25, i) * 1800; palm(q, x, hillY(x) + 60, 90 + hash(26, i) * 50, 0, { seed: 90 + i, col: '#5f9a78', trunk: '#8a7a6a', flat: true, n: 7 }); }
    // 空气透视
    q.fillStyle = vg(q, 380, 780, [[0, 'rgba(214,238,252,0)'], [0.4, 'rgba(214,238,252,0.4)'], [1, 'rgba(230,246,252,0.2)']]); q.fillRect(-600, 380, VW + 1200, 420);
  }
  const hillY = (x) => { const u = clamp((x - 360) / 2040); return lerp(700, 440, pow(sin(u * PI * 0.62), 0.9)) + (x > 1500 ? (x - 1500) * 0.05 : 0); };
  /** 中景（视差 0.62）：汽水摊后面的一排度假楼、棕榈 */
  function standMid(q) {
    for (const b of ST_MID) retroBuilding(q, b, { detail: 0.75, lw: 2 });
    for (let i = 0; i < 8; i++) { const x = 340 + i * 270 + hash(27, i) * 90; palm(q, x, 812, 300 + hash(28, i) * 140, 0, { seed: 120 + i, lean: (hash(29, i) - 0.5) * 0.3 }); }
    for (let i = 0; i < 14; i++) bush(q, 320 + i * 150 + hash(30, i) * 60, 790, 40 + hash(31, i) * 20, 500 + i, true);
    q.fillStyle = vg(q, 200, 820, [[0, 'rgba(214,238,252,0)'], [0.3, 'rgba(214,238,252,0.18)'], [1, 'rgba(230,246,252,0.28)']]); q.fillRect(-600, 200, VW + 1200, 640);
  }
  /** 火山的大烟柱（参照 PV：一柱白烟直上，顶上散开，底部带一点粉）：活的 */
  function bigPlume(g, t, cx, cy, sc, a = 0.8) {
    const A = g.globalAlpha;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 22; i++) {
      const u = fract(t * 0.012 + i / 22);
      const rise = u * 520 * sc, spread = u * u * 260 * sc;
      const px = cx - u * 90 * sc - spread * (0.5 + 0.5 * hash(12, i)) + sin(u * 5 + i) * 16 * sc, py = cy - rise;
      const r = (26 + u * 150) * sc * (0.8 + 0.4 * hash(13, i)) * (pass ? 0.7 : 1);
      g.globalAlpha = A * a * sin(PI * min(1, u * 1.15 + 0.04)) * (pass ? 0.6 : 0.85);
      g.drawImage(puffSpr(i + pass, pass ? '255,214,230' : '255,255,255'), px - r, py - r * 0.62 + (pass ? r * 0.3 : 0), r * 2, r * 1.24);
    }
    g.globalAlpha = A;
  }
  /** 远处货架上的小汽水瓶（简化的瓶形：肩、瓶颈、红盖、液色、标签、高光） */
  function miniBottle(q, x, y, h, fl) {
    const F = FLAVOR[fl] || FLAVOR.pink, w = h * 0.32;
    q.beginPath(); q.moveTo(x - w * 0.22, y - h); q.lineTo(x + w * 0.22, y - h); q.lineTo(x + w * 0.22, y - h * 0.72); q.quadraticCurveTo(x + w * 0.5, y - h * 0.62, x + w * 0.5, y - h * 0.5);
    q.lineTo(x + w * 0.5, y - 2); q.quadraticCurveTo(x + w * 0.5, y, x + w * 0.3, y); q.lineTo(x - w * 0.3, y); q.quadraticCurveTo(x - w * 0.5, y, x - w * 0.5, y - 2); q.lineTo(x - w * 0.5, y - h * 0.5); q.quadraticCurveTo(x - w * 0.5, y - h * 0.62, x - w * 0.22, y - h * 0.72); q.closePath();
    q.fillStyle = 'rgba(170,230,230,0.55)'; q.fill();
    q.fillStyle = F.bot; q.fillRect(x - w * 0.5, y - h * 0.5, w, h * 0.5);
    q.fillStyle = '#fff4f8'; q.fillRect(x - w * 0.5, y - h * 0.36, w, h * 0.14);
    q.fillStyle = 'rgba(255,255,255,0.7)'; q.fillRect(x - w * 0.34, y - h * 0.46, w * 0.12, h * 0.4);
    q.strokeStyle = 'rgba(20,40,50,0.6)'; q.lineWidth = 1; q.stroke();
    q.fillStyle = '#e0424e'; q.fillRect(x - w * 0.26, y - h - 3, w * 0.52, 4);
  }
  /** 汽水的商标：一张正面的小羊脸（白毛团、奶白脸、淡紫卷角、粉耳朵） */
  function sheepLogo(q, x, y, r, o = {}) {
    const ink = o.ink || '#6a3a52';
    // 耳朵
    q.fillStyle = '#ffb6cf'; q.strokeStyle = ink; q.lineWidth = max(1, r * 0.05);
    for (const sd of [-1, 1]) { q.beginPath(); q.ellipse(x + sd * r * 0.78, y + r * 0.02, r * 0.3, r * 0.14, sd * 0.35, 0, TAU); q.fill(); q.stroke(); }
    // 毛团（一圈小云）
    q.fillStyle = '#ffffff'; q.beginPath();
    for (let i = 0; i < 9; i++) { const a = -PI / 2 + (i - 4) * 0.36, cx = x + cos(a) * r * 0.5, cy = y - r * 0.12 + sin(a) * r * 0.46; q.moveTo(cx + r * 0.24, cy); q.arc(cx, cy, r * 0.24, 0, TAU); }
    q.fill(); q.stroke();
    q.fill();
    // 卷角
    q.strokeStyle = o.horn || '#a98ce0'; q.lineWidth = r * 0.13; q.lineCap = 'round';
    for (const sd of [-1, 1]) { q.beginPath(); q.arc(x + sd * r * 0.56, y - r * 0.32, r * 0.2, sd > 0 ? PI * 1.1 : -PI * 0.1, sd > 0 ? PI * 2.6 : PI * 1.4, sd < 0); q.stroke(); }
    q.lineCap = 'butt';
    // 脸
    q.fillStyle = '#fff4ea'; q.beginPath(); q.ellipse(x, y + r * 0.1, r * 0.42, r * 0.48, 0, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = max(1, r * 0.05); q.stroke();
    q.fillStyle = '#3a2430';
    for (const sd of [-1, 1]) { q.beginPath(); q.ellipse(x + sd * r * 0.17, y + r * 0.06, r * 0.06, r * 0.09, 0, 0, TAU); q.fill(); }
    q.fillStyle = 'rgba(255,128,168,0.55)'; for (const sd of [-1, 1]) { q.beginPath(); q.ellipse(x + sd * r * 0.26, y + r * 0.26, r * 0.09, r * 0.055, 0, 0, TAU); q.fill(); }
    q.strokeStyle = '#3a2430'; q.lineWidth = max(1, r * 0.045); q.beginPath(); q.moveTo(x - r * 0.1, y + r * 0.3); q.quadraticCurveTo(x - r * 0.05, y + r * 0.37, x, y + r * 0.3); q.quadraticCurveTo(x + r * 0.05, y + r * 0.37, x + r * 0.1, y + r * 0.3); q.stroke();
    // 头顶的一小撮
    q.fillStyle = '#ffffff'; q.beginPath(); q.arc(x - r * 0.1, y - r * 0.5, r * 0.14, 0, TAU); q.arc(x + r * 0.08, y - r * 0.54, r * 0.15, 0, TAU); q.fill();
  }
  /** 汽水亭 */
  function kiosk(q) {
    const { x0, x1 } = ST, ink = '#4a2a3a';
    // 后墙（从窗口看进去是阴凉的室内）
    q.fillStyle = '#c8f2e2'; q.fillRect(x0, 360, x1 - x0, SG - 360);
    const [hy0, hy1] = ST.hatch;
    q.fillStyle = vg(q, hy0, hy1, [[0, '#24485a'], [0.5, '#2f6070'], [1, '#467f8c']]); q.fillRect(x0 + 34, hy0, x1 - x0 - 68, hy1 - hy0);
    // 室内：货架与一排排汽水、挂着的灯泡、彩旗
    for (let r = 0; r < 3; r++) {
      const sy = 540 + r * 52;
      q.fillStyle = '#d8b88a'; q.fillRect(x0 + 44, sy, x1 - x0 - 88, 6); q.fillStyle = 'rgba(0,0,0,0.25)'; q.fillRect(x0 + 44, sy + 6, x1 - x0 - 88, 4);
      for (let i = 0; i < 17; i++) miniBottle(q, x0 + 60 + i * 24.5, sy, 38, FLAVORS[(i + r) % 4]);
    }
    q.strokeStyle = 'rgba(255,255,255,0.35)'; q.lineWidth = 1.5; q.beginPath(); q.moveTo(x0 + 40, hy0 + 14); q.quadraticCurveTo((x0 + x1) / 2, hy0 + 40, x1 - 40, hy0 + 14); q.stroke();
    for (let i = 0; i < 12; i++) { const u = (i + 0.5) / 12, bx = lerp(x0 + 40, x1 - 40, u), by = hy0 + 14 + sin(u * PI) * 26; q.fillStyle = pick(['#ff8fbf', '#8ff0c8', '#ffe66b', '#4fd6e8'], hash(5, i)); q.beginPath(); q.moveTo(bx - 8, by); q.lineTo(bx + 8, by); q.lineTo(bx, by + 14); q.closePath(); q.fill(); }
    q.strokeStyle = '#2a3a44'; q.lineWidth = 2; q.beginPath(); q.moveTo(980, hy0); q.lineTo(980, hy0 + 30); q.stroke();
    q.fillStyle = '#fff6d0'; q.beginPath(); q.arc(980, hy0 + 38, 9, 0, TAU); q.fill();
    // 门柱（白）
    for (const px of [x0, x1 - 34]) { q.fillStyle = '#fbfbf6'; q.fillRect(px, 360, 34, SG - 360); q.fillStyle = 'rgba(120,140,190,0.2)'; q.fillRect(px + 24, 360, 10, SG - 360); q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(px, 360, 34, SG - 360); }
    // 柜台：台面 + 薄荷色前板（白色波浪 + 羊徽章）
    const cy = ST.counterY;
    q.fillStyle = '#f2c894'; q.fillRect(x0 - 16, cy - 4, x1 - x0 + 32, 16); q.fillStyle = '#c9965e'; q.fillRect(x0 - 16, cy + 8, x1 - x0 + 32, 6);
    q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(x0 - 16, cy - 4, x1 - x0 + 32, 18);
    q.fillStyle = vg(q, cy + 14, SG, [[0, '#7fdcc6'], [1, '#62c8b0']]); q.fillRect(x0 + 34, cy + 14, x1 - x0 - 68, SG - cy - 14);
    q.strokeStyle = 'rgba(255,255,255,0.85)'; q.lineWidth = 7; q.beginPath();
    for (let x = x0 + 34; x <= x1 - 34; x += 6) { const yy = cy + 64 + sin((x - x0) * 0.045) * 7; x === x0 + 34 ? q.moveTo(x, yy) : q.lineTo(x, yy); } q.stroke();
    q.fillStyle = '#4fb8a0'; q.fillRect(x0 + 34, SG - 22, x1 - x0 - 68, 22);
    // 徽章：小羊脸（汽水的商标）
    const bx = 980, by = cy + 106;
    q.fillStyle = '#fff6fa'; q.beginPath(); q.arc(bx, by, 52, 0, TAU); q.fill(); q.strokeStyle = '#ff7eb0'; q.lineWidth = 6; q.stroke(); q.strokeStyle = ink; q.lineWidth = 2; q.beginPath(); q.arc(bx, by, 55, 0, TAU); q.stroke();
    sheepLogo(q, bx, by + 2, 40);
    // 屋顶 + 招牌 + 一只大汽水瓶
    q.fillStyle = '#fbfbf6'; q.fillRect(x0 - 24, 344, x1 - x0 + 48, 22); q.fillStyle = '#ff8fbf'; q.fillRect(x0 - 24, 358, x1 - x0 + 48, 4);
    q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(x0 - 24, 344, x1 - x0 + 48, 22);
    q.fillStyle = '#e8e2d8'; q.fillRect(x0 - 10, 336, x1 - x0 + 20, 8);
    rrect(q, 770, 238, 380, 96, 20); q.fillStyle = '#4fd0e4'; q.fill(); q.lineWidth = 8; q.strokeStyle = '#ffffff'; q.stroke(); q.lineWidth = 3; q.strokeStyle = ink; rrect(q, 764, 232, 392, 108, 24); q.stroke();
    q.fillStyle = '#6a5a6a'; q.fillRect(820, 334, 8, 12); q.fillRect(1090, 334, 8, 12);
    E.text(q, '汐斯塔汽水', 960, 305, { font: 'sans', size: 56, weight: 700, color: '#ffffff', stroke: '#1f6f86', strokeW: 10, spacing: 6 });
    E.text(q, 'SIESTA · SODA', 960, 326, { font: 'display', size: 15, weight: 700, color: '#1f6f86', spacing: 6 });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, bx2 = 960 + cos(a) * 204, by2 = 286 + sin(a) * 58; q.fillStyle = '#fff6c8'; q.beginPath(); q.arc(bx2, by2, 4, 0, TAU); q.fill(); }
    q.save(); q.translate(1196, 346); q.rotate(0.1); q.scale(1.75, 1.75); q.translate(-30, -146); bottleArt(q, 'pink', true, 1); q.restore();
  }
  /** 粉白条纹的遮阳篷（扇贝边），与它投在亭子上的影子 */
  function awning(q) {
    const L = 612, Rr = 1286, top = 368, bot = 446, ink = '#5a2a40';
    q.save();
    q.beginPath(); q.moveTo(L + 26, top); q.lineTo(Rr - 26, top); q.lineTo(Rr, bot);
    const n = 17, sw = (Rr - L) / n;
    for (let i = n - 1; i >= 0; i--) { const cx = L + (i + 0.5) * sw; q.arc(cx, bot, sw / 2, 0, PI); }
    q.closePath();
    q.save(); q.clip();
    for (let i = 0; i < n; i++) { const xa = L + i * sw; q.fillStyle = i % 2 ? '#fff8fc' : '#ff86b8'; q.beginPath(); q.moveTo(lerp(L + 26, Rr - 26, i / n), top); q.lineTo(lerp(L + 26, Rr - 26, (i + 1) / n), top); q.lineTo(xa + sw, bot + sw); q.lineTo(xa, bot + sw); q.closePath(); q.fill(); }
    q.fillStyle = vg(q, top, bot + 20, [[0, 'rgba(90,30,70,0.28)'], [0.35, 'rgba(90,30,70,0)'], [0.75, 'rgba(255,255,255,0.12)'], [1, 'rgba(90,30,70,0.12)']]); q.fillRect(L, top, Rr - L, bot - top + 30);
    q.restore();
    q.strokeStyle = ink; q.lineWidth = 3; q.lineJoin = 'round'; q.stroke();
    q.fillStyle = '#fbfbf6'; q.fillRect(L + 20, top - 6, Rr - L - 40, 8); q.strokeRect(L + 20, top - 6, Rr - L - 40, 8);
    q.restore();
  }
  function awningShadow(q) {
    q.fillStyle = 'rgba(40,40,120,0.2)';
    q.beginPath(); q.moveTo(ST.x0, 466); const n = 12, sw = (ST.x1 - ST.x0) / n;
    for (let i = 0; i < n; i++) q.arc(ST.x0 + (i + 0.5) * sw, 520, sw / 2, PI, 0, true);
    q.lineTo(ST.x1, 466); q.closePath(); q.fill();
  }
  /** 冰柜（玻璃门，四种口味的汽水排排站） */
  function cooler(q) {
    const [a, b, top] = ST.cooler, ink = '#3a3a4a';
    rrect(q, a, top, b - a, SG - top, 14); q.fillStyle = '#f7fbff'; q.fill(); q.strokeStyle = ink; q.lineWidth = 2.5; q.stroke();
    q.fillStyle = 'rgba(120,150,200,0.22)'; q.fillRect(b - 18, top + 10, 12, SG - top - 16);
    const gx0 = a + 12, gx1 = b - 12, gy0 = top + 36, gy1 = SG - 34;
    rrect(q, gx0, gy0, gx1 - gx0, gy1 - gy0, 8); q.fillStyle = vg(q, gy0, gy1, [[0, '#a8e4f4'], [1, '#6cc6e0']]); q.fill();
    q.save(); rrect(q, gx0, gy0, gx1 - gx0, gy1 - gy0, 8); q.clip();
    for (let r = 0; r < 4; r++) {
      const sy = gy0 + 66 + r * 64;
      q.fillStyle = '#e6f4fa'; q.fillRect(gx0, sy, gx1 - gx0, 4);
      for (let i = 0; i < 4; i++) { q.save(); q.translate(gx0 + 14 + i * 24, sy); q.scale(0.36, 0.38); q.translate(-30, -146); bottleArt(q, FLAVORS[(i + r) % 4], true, 1); q.restore(); }
    }
    q.fillStyle = 'rgba(255,255,255,0.35)'; q.beginPath(); q.moveTo(gx0, gy0 + 40); q.lineTo(gx0 + 40, gy0); q.lineTo(gx0 + 60, gy0); q.lineTo(gx0, gy0 + 60); q.closePath(); q.fill();
    q.fillStyle = vg(q, gy0, gy1, [[0, 'rgba(255,255,255,0.45)'], [0.15, 'rgba(255,255,255,0)'], [0.85, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.5)']]); q.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    q.restore();
    q.strokeStyle = ink; q.lineWidth = 2; rrect(q, gx0, gy0, gx1 - gx0, gy1 - gy0, 8); q.stroke();
    q.fillStyle = '#c8d4e0'; rrect(q, b - 26, gy0 + 90, 8, 80, 4); q.fill(); q.stroke();
    q.fillStyle = '#3fa6d8'; q.beginPath(); q.arc((a + b) / 2, top + 18, 13, 0, TAU); q.fill();
    E.text(q, '冰', (a + b) / 2, top + 26, { font: 'sans', size: 18, weight: 700, color: '#ffffff' });
    q.fillStyle = '#4a4a5a'; q.fillRect(a + 8, SG - 8, 14, 8); q.fillRect(b - 22, SG - 8, 14, 8);
  }
  /** 灌装工坊（亭子右边的小楼；屋顶伸出一只铜罐） */
  function annex(q, o = {}) {
    const [a, b, top] = ST.annex, ink = '#4a3a3a';
    // 铜罐（在屋顶后面）
    const [t0, t1] = ST.tankX, tc = (t0 + t1) / 2;
    q.fillStyle = hg(q, t0, t1, [[0, '#b8683a'], [0.3, '#f0a868'], [0.55, '#d88048'], [1, '#8a4a28']]);
    q.fillRect(t0, 176, t1 - t0, top - 170);
    q.beginPath(); q.ellipse(tc, 176, (t1 - t0) / 2, 44, 0, PI, 0); q.fill();
    q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.moveTo(t0, top); q.lineTo(t0, 176); q.ellipse(tc, 176, (t1 - t0) / 2, 44, 0, PI, 0); q.lineTo(t1, top); q.stroke();
    q.fillStyle = '#6a3418'; for (const yy of [190, 240, 290]) { q.fillRect(t0, yy, t1 - t0, 5); for (let x = t0 + 10; x < t1; x += 18) { q.beginPath(); q.arc(x, yy - 5, 2.4, 0, TAU); q.fill(); } }
    q.fillStyle = 'rgba(255,240,200,0.5)'; q.fillRect(t0 + 30, 150, 10, top - 150);
    // 汽笛 + 弯管
    q.fillStyle = '#c8a050'; q.fillRect(tc + 22, 98, 16, 40); q.beginPath(); q.ellipse(tc + 30, 98, 14, 6, 0, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(tc + 22, 98, 16, 40);
    q.strokeStyle = '#8a5a3a'; q.lineWidth = 14; q.lineCap = 'round'; q.beginPath(); q.moveTo(t1 - 10, 210); q.lineTo(t1 + 60, 210); q.quadraticCurveTo(t1 + 90, 210, t1 + 90, 250); q.lineTo(t1 + 90, top + 4); q.stroke(); q.lineCap = 'butt';
    // 墙
    q.fillStyle = vg(q, top, SG, [[0, '#fbf0dc'], [1, '#f3e2c6']]); q.fillRect(a, top, b - a, SG - top);
    q.fillStyle = 'rgba(120,90,70,0.06)'; for (let i = 0; i < 160; i++) q.fillRect(a + hash(71, i) * (b - a), top + hash(72, i) * (SG - top), 3 + hash(73, i) * 12, 2 + hash(74, i) * 3);
    q.fillStyle = 'rgba(90,110,190,0.14)'; q.fillRect(b - 60, top, 60, SG - top);
    // 墙脚的花砖
    for (let i = 0; i < 30; i++) for (let j = 0; j < 4; j++) { const tx = a + i * 20, ty = SG - 80 + j * 20; if (tx >= b) continue; q.fillStyle = (i + j) % 2 ? '#bfeef4' : '#ffffff'; q.fillRect(tx, ty, 20, 20); }
    q.strokeStyle = 'rgba(60,120,140,0.35)'; q.lineWidth = 1; for (let i = 0; i <= 30; i++) { q.beginPath(); q.moveTo(a + i * 20, SG - 80); q.lineTo(a + i * 20, SG); q.stroke(); }
    q.fillStyle = '#3fa6b8'; q.fillRect(a, SG - 84, b - a, 5);
    // 女儿墙
    q.fillStyle = '#ffffff'; q.fillRect(a - 8, top - 14, b - a + 16, 18); q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(a - 8, top - 14, b - a + 16, 18);
    // 圆形舷窗（里面看得见管子）
    const [px, py, pr] = [1540, 540, 56];
    q.fillStyle = vg(q, py - pr, py + pr, [[0, '#2a5a6a'], [1, '#1a3a48']]); q.beginPath(); q.arc(px, py, pr, 0, TAU); q.fill();
    q.save(); q.beginPath(); q.arc(px, py, pr, 0, TAU); q.clip();
    q.strokeStyle = '#c87a44'; q.lineWidth = 12; q.beginPath(); q.moveTo(px - 70, py + 20); q.lineTo(px + 10, py + 20); q.quadraticCurveTo(px + 30, py + 20, px + 30, py - 10); q.lineTo(px + 30, py - 70); q.stroke();
    q.fillStyle = '#e8e0d0'; q.beginPath(); q.arc(px - 20, py - 18, 16, 0, TAU); q.fill(); q.strokeStyle = '#3a3030'; q.lineWidth = 2; q.stroke();
    q.fillStyle = 'rgba(200,240,255,0.35)'; q.beginPath(); q.moveTo(px - 50, py + 10); q.lineTo(px + 10, py - 50); q.lineTo(px + 30, py - 50); q.lineTo(px - 50, py + 30); q.closePath(); q.fill();
    q.restore();
    q.strokeStyle = '#c8a050'; q.lineWidth = 10; q.beginPath(); q.arc(px, py, pr + 2, 0, TAU); q.stroke(); q.strokeStyle = ink; q.lineWidth = 2; q.beginPath(); q.arc(px, py, pr + 7, 0, TAU); q.stroke();
    q.fillStyle = '#8a6a30'; for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU; q.beginPath(); q.arc(px + cos(an) * (pr + 2), py + sin(an) * (pr + 2), 2.5, 0, TAU); q.fill(); }
    // 门（青绿）+ 门牌
    const [d0, d1, dt] = ST.door;
    q.fillStyle = '#d8c8b0'; q.fillRect(d0 - 12, dt - 12, d1 - d0 + 24, SG - dt + 12);
    q.fillStyle = vg(q, dt, SG, [[0, '#46aebc'], [1, '#3a96a4']]); q.fillRect(d0, dt, d1 - d0, SG - dt);
    q.strokeStyle = 'rgba(20,60,70,0.45)'; q.lineWidth = 3; q.strokeRect(d0 + 16, dt + 130, d1 - d0 - 32, 110); q.strokeRect(d0 + 16, dt + 262, d1 - d0 - 32, 110);
    q.fillStyle = '#9fdcec'; rrect(q, d0 + 30, dt + 24, d1 - d0 - 60, 80, 10); q.fill(); q.strokeStyle = ink; q.lineWidth = 2.5; q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.5)'; q.beginPath(); q.moveTo(d0 + 36, dt + 80); q.lineTo(d0 + 70, dt + 30); q.lineTo(d0 + 86, dt + 30); q.lineTo(d0 + 40, dt + 96); q.closePath(); q.fill();
    q.strokeStyle = ink; q.lineWidth = 3; q.strokeRect(d0, dt, d1 - d0, SG - dt);
    q.fillStyle = '#fff4e0'; rrect(q, d0 + 30, dt + 150, d1 - d0 - 60, 30, 5); q.fill(); q.lineWidth = 1.5; q.stroke();
    E.text(q, '闲人免进', (d0 + d1) / 2, dt + 172, { font: 'sans', size: 17, weight: 700, color: '#a0303a', spacing: 2 });
    rrect(q, d0 + 6, dt - 62, d1 - d0 - 12, 40, 6); q.fillStyle = '#2f7f8e'; q.fill(); q.strokeStyle = '#ffffff'; q.lineWidth = 3; q.stroke();
    E.text(q, '汽水工坊', (d0 + d1) / 2, dt - 32, { font: 'sans', size: 24, weight: 700, color: '#ffffff', spacing: 4 });
    if (!o.noKnob) { const [kx, ky] = ST.knob; q.fillStyle = '#e8c060'; q.beginPath(); q.arc(kx, ky, 9, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke(); q.fillStyle = 'rgba(255,255,255,0.7)'; q.beginPath(); q.arc(kx - 3, ky - 3, 3, 0, TAU); q.fill(); }
    // 门边的盆栽、墙边叠着的 SIESTA 货箱
    for (const [x, sc] of [[d0 - 50, 1], [d1 + 38, 0.8]]) { q.fillStyle = '#d8784a'; q.beginPath(); q.moveTo(x - 22 * sc, SG); q.lineTo(x - 28 * sc, SG - 44 * sc); q.lineTo(x + 28 * sc, SG - 44 * sc); q.lineTo(x + 22 * sc, SG); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke(); bush(q, x, SG - 70 * sc, 34 * sc, 700 + x | 0, true); }
  }
  /** 汽水亭左边：棕榈、路灯、送货三轮、黑板 */
  function streetProps(q, t = 0) {
    const ink = '#3a2a3a';
    // 路灯
    const lx = 280;
    q.fillStyle = '#2f7f8e'; q.fillRect(lx - 6, 380, 12, SG - 380); q.fillRect(lx - 16, SG - 30, 32, 30); q.fillRect(lx - 11, SG - 60, 22, 30);
    q.strokeStyle = ink; q.lineWidth = 2; q.strokeRect(lx - 6, 380, 12, SG - 380);
    q.fillStyle = '#fff6d8'; q.beginPath(); q.moveTo(lx - 22, 380); q.lineTo(lx + 22, 380); q.lineTo(lx + 16, 330); q.lineTo(lx - 16, 330); q.closePath(); q.fill(); q.strokeStyle = '#2f7f8e'; q.lineWidth = 4; q.stroke();
    q.fillStyle = '#2f7f8e'; q.beginPath(); q.moveTo(lx - 26, 332); q.lineTo(lx, 310); q.lineTo(lx + 26, 332); q.closePath(); q.fill();
    // 路灯上挂的小旗
    q.fillStyle = '#ff86b8'; q.beginPath(); q.moveTo(lx + 6, 420); q.lineTo(lx + 70, 430); q.lineTo(lx + 56, 470); q.lineTo(lx + 6, 480); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke();
    E.text(q, '夏', lx + 36, 462, { font: 'sans', size: 26, weight: 700, color: '#ffffff' });
    // 送货三轮（前面是一只薄荷色货斗，印着小羊）
    const tx = ST.trike, ty = SG;
    q.strokeStyle = '#2a2a34'; q.lineWidth = 6;
    for (const wx of [tx - 60, tx + 96]) { q.beginPath(); q.arc(wx, ty - 34, 32, 0, TAU); q.stroke(); q.lineWidth = 2; for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU; q.beginPath(); q.moveTo(wx, ty - 34); q.lineTo(wx + cos(an) * 30, ty - 34 + sin(an) * 30); q.stroke(); } q.lineWidth = 6; }
    q.strokeStyle = '#e0424e'; q.lineWidth = 7; q.beginPath(); q.moveTo(tx - 60, ty - 34); q.lineTo(tx + 10, ty - 90); q.lineTo(tx + 96, ty - 34); q.moveTo(tx + 10, ty - 90); q.lineTo(tx + 20, ty - 140); q.moveTo(tx + 70, ty - 90); q.lineTo(tx + 96, ty - 34); q.stroke();
    q.fillStyle = '#2a2a34'; q.fillRect(tx - 4, ty - 150, 34, 10); q.fillRect(tx + 62, ty - 128, 10, 30);
    rrect(q, tx - 150, ty - 150, 120, 96, 8); q.fillStyle = '#7fdcc6'; q.fill(); q.strokeStyle = ink; q.lineWidth = 2.5; q.stroke();
    q.fillStyle = '#fff6fa'; q.beginPath(); q.arc(tx - 90, ty - 102, 34, 0, TAU); q.fill(); q.strokeStyle = '#ff7eb0'; q.lineWidth = 4; q.stroke();
    sheepLogo(q, tx - 90, ty - 100, 25);
    // 黑板（今天的汽水）
    const bx = 590;
    q.fillStyle = '#8a5a3a'; q.beginPath(); q.moveTo(bx - 50, SG); q.lineTo(bx - 30, SG - 170); q.lineTo(bx + 30, SG - 170); q.lineTo(bx + 50, SG); q.lineTo(bx + 40, SG); q.lineTo(bx + 22, SG - 150); q.lineTo(bx - 22, SG - 150); q.lineTo(bx - 40, SG); q.closePath(); q.fill();
    rrect(q, bx - 44, SG - 164, 88, 120, 6); q.fillStyle = '#2f4a44'; q.fill(); q.strokeStyle = '#8a5a3a'; q.lineWidth = 5; q.stroke();
    E.text(q, '今日', bx, SG - 132, { font: 'hand', size: 18, color: '#fff6e0' });
    E.text(q, '粉红汽水', bx, SG - 104, { font: 'sans', size: 17, weight: 700, color: '#ffb0d0' });
    q.strokeStyle = '#fff6e0'; q.lineWidth = 2; q.beginPath(); q.moveTo(bx - 8, SG - 60); q.lineTo(bx - 8, SG - 80); q.lineTo(bx - 4, SG - 88); q.lineTo(bx + 4, SG - 88); q.lineTo(bx + 8, SG - 80); q.lineTo(bx + 8, SG - 60); q.closePath(); q.stroke();
    q.fillStyle = '#ff8fbf'; q.beginPath(); q.arc(bx + 24, SG - 70, 5, 0, TAU); q.arc(bx - 26, SG - 76, 3, 0, TAU); q.fill();
  }
  /** 遮阳篷下的长凳（店主在上面午睡）：木条凳面 + 粉白条纹的垫子 + 一只小枕头（左端） */
  const BENCH = { x: 900, w: 440, top: SG - 62 };
  function stool(q) {
    const ink = '#3a2a2a', x0 = BENCH.x - BENCH.w / 2, x1 = BENCH.x + BENCH.w / 2, T = BENCH.top;
    q.lineWidth = 2.5; q.strokeStyle = ink;
    for (const lx of [x0 + 26, x1 - 26]) { q.fillStyle = '#b07a48'; q.beginPath(); q.moveTo(lx - 9, SG); q.lineTo(lx - 7, T + 14); q.lineTo(lx + 7, T + 14); q.lineTo(lx + 9, SG); q.closePath(); q.fill(); q.stroke(); }
    q.fillStyle = 'rgba(40,20,20,0.18)'; q.beginPath(); q.ellipse(BENCH.x, SG + 2, BENCH.w * 0.5, 10, 0, 0, TAU); q.fill();
    q.fillStyle = '#c8905a'; rrect(q, x0, T + 8, BENCH.w, 16, 5); q.fill(); q.stroke();
    q.strokeStyle = 'rgba(90,50,24,0.45)'; q.lineWidth = 1.5; for (let x = x0 + 40; x < x1; x += 40) { q.beginPath(); q.moveTo(x, T + 10); q.lineTo(x, T + 22); q.stroke(); }
    // 垫子（粉白条纹）
    q.save(); rrect(q, x0 + 6, T - 6, BENCH.w - 12, 16, 7); q.clip();
    for (let i = 0; i * 26 < BENCH.w; i++) { q.fillStyle = i % 2 ? '#fff4f8' : '#ff9cc4'; q.fillRect(x0 + 6 + i * 26, T - 6, 26, 16); }
    q.fillStyle = 'rgba(160,60,100,0.18)'; q.fillRect(x0, T + 4, BENCH.w, 6);
    q.restore();
    q.strokeStyle = ink; q.lineWidth = 2; rrect(q, x0 + 6, T - 6, BENCH.w - 12, 16, 7); q.stroke();
    // 小枕头
    q.fillStyle = '#fff6e8'; q.beginPath(); q.ellipse(x0 + 84, T - 14, 50, 17, -0.06, 0, TAU); q.fill(); q.stroke();
    q.strokeStyle = 'rgba(200,120,150,0.5)'; q.lineWidth = 2; q.beginPath(); q.moveTo(x0 + 50, T - 14); q.lineTo(x0 + 116, T - 17); q.stroke();
  }
  /** 海滨木栈道（木板横着铺，越近越宽；错开的接缝与钉子，阳光下的高光） */
  function promenade(q, x0 = -400, x1 = 2400, y0 = SG, y1 = VH + 60) {
    q.fillStyle = vg(q, y0, y1, [[0, '#d69c6c'], [1, '#e8b486']]); q.fillRect(x0, y0, x1 - x0, y1 - y0);
    const rows = [];
    for (let k = 0, y = y0; y < y1 + 40; k++) { const hgt = 11 + k * 3.2; rows.push([y, hgt]); y += hgt; }
    rows.forEach(([y, hgt], k) => {
      q.fillStyle = k % 3 === 0 ? 'rgba(255,230,190,0.16)' : k % 3 === 1 ? 'rgba(120,60,30,0.06)' : 'rgba(255,240,210,0.07)'; q.fillRect(x0, y, x1 - x0, hgt);
      q.fillStyle = 'rgba(110,56,30,0.45)'; q.fillRect(x0, y + hgt - 2, x1 - x0, 2);
      q.fillStyle = 'rgba(255,236,200,0.35)'; q.fillRect(x0, y, x1 - x0, 1.5);
      const L = 180 + k * 40;
      for (let x = x0 - ((k * 97) % L); x < x1; x += L) { q.fillStyle = 'rgba(110,56,30,0.4)'; q.fillRect(x, y, 2, hgt - 2); if (hgt > 16) { q.fillStyle = 'rgba(70,40,30,0.6)'; q.fillRect(x + 6, y + hgt * 0.3, 2.4, 2.4); q.fillRect(x - 8, y + hgt * 0.3, 2.4, 2.4); } }
      if (k % 2 === 0) { q.strokeStyle = 'rgba(120,64,34,0.12)'; q.lineWidth = 1; q.beginPath(); for (let x = x0; x < x1; x += 60) q.lineTo(x, y + hgt * 0.5 + sin(x * 0.02 + k) * hgt * 0.15); q.stroke(); }
    });
    // 墙根的阴影
    q.fillStyle = vg(q, y0, y0 + 26, [[0, 'rgba(60,40,110,0.3)'], [1, 'rgba(60,40,110,0)']]); q.fillRect(x0, y0, x1 - x0, 26);
  }
  /** 整个汽水摊的静态中景（亭子、工坊、道具、地面） */
  function standMain(q, o = {}) {
    promenade(q);
    palm(q, 110, SG + 4, 560, 0, { seed: 31, lean: 0.1 });
    streetProps(q);
    annex(q, o);
    cooler(q);
    kiosk(q);
    awningShadow(q);
    awning(q);
    if (!o.noStool) stool(q);
    // 墙边叠着的三只 SIESTA 货箱（No.1–3）
    for (const [i, x, y] of [[1, 1430, SG], [2, 1500, SG], [3, 1466, SG - 104]]) { q.save(); q.translate(x, y); q.scale(0.46, 0.46); q.translate(-150, -230); crateArt(q, i, false); lidArt2(q); q.restore(); }
    palm(q, 2090, SG + 4, 520, 0, { seed: 33, lean: -0.12 });
  }
  function lidArt2(q) { q.save(); q.translate(-4, -24); lidArt(q); q.restore(); }
  /** 近景：海滨步道靠海一侧的矮墙（小羊从这后面探头；靠近镜头，所以在背光的阴影里） */
  function seawallArt(q) {
    const y = 40, H = 520;
    q.fillStyle = vg(q, y, y + H, [[0, '#d9bf9c'], [0.5, '#c8a882'], [1, '#b89470']]); q.fillRect(0, y, VW + 400, H);
    // 石块
    const R = E.rng(77);
    for (let r = 0; r < 5; r++) {
      const yy = y + 26 + r * 96; let x = -R() * 120;
      while (x < VW + 400) { const w = 150 + R() * 110; q.fillStyle = `rgba(${R() < 0.5 ? '255,240,220' : '90,60,40'},${0.06 + R() * 0.08})`; rrect(q, x + 4, yy + 4, w - 8, 88, 12); q.fill(); q.strokeStyle = 'rgba(90,60,40,0.35)'; q.lineWidth = 3; rrect(q, x + 2, yy + 2, w - 4, 92, 12); q.stroke(); x += w; }
    }
    // 压顶（白色，被阳光照亮的顶面）
    q.fillStyle = '#fff8ee'; q.fillRect(0, 0, VW + 400, 30); q.fillStyle = '#e8d8c0'; q.fillRect(0, 30, VW + 400, 16);
    q.strokeStyle = 'rgba(90,60,40,0.6)'; q.lineWidth = 3; q.beginPath(); q.moveTo(0, 1.5); q.lineTo(VW + 400, 1.5); q.stroke();
    q.fillStyle = 'rgba(90,60,40,0.3)'; q.fillRect(0, 46, VW + 400, 12);
    // 墙面上的湿印与贝壳
    for (let i = 0; i < 9; i++) { q.fillStyle = 'rgba(255,255,255,0.5)'; q.beginPath(); q.ellipse(hash(78, i) * (VW + 400), y + 80 + hash(79, i) * 380, 8, 5, hash(80, i) * 3, 0, TAU); q.fill(); }
    q.fillStyle = vg(q, y, y + H, [[0, 'rgba(60,40,80,0)'], [1, 'rgba(60,40,80,0.25)']]); q.fillRect(0, y, VW + 400, H);
  }
  function seawall(q, y = WALL_Y, s) {
    if (s) { q.drawImage(LC(s, 'seawall', VW + 400, 560, seawallArt, 0.8), -200, y - 16, VW + 400, 560); return; }
    q.fillStyle = '#c8a882'; q.fillRect(-600, y, VW + 1200, 400); q.fillStyle = '#fff8ee'; q.fillRect(-600, y - 16, VW + 1200, 30);
  }

  /** 天上的积云（汽水摊方向的天空，缓慢漂移） */
  function standClouds(g, s, t, o = {}) {
    for (let i = 0; i < 5; i++) {
      const w = 520 + hash(41, i) * 520, h = w * (0.34 + hash(42, i) * 0.12);
      const x = ((hash(43, i) * 3200 + t * (6 + 5 * hash(44, i))) % 3200) - 640, y = 180 + hash(45, i) * 190;
      cumulus(g, s, 'st' + (i % 3), x, y, w, h, 60 + (i % 3), 0.95);
    }
    if (o.sheep !== false) withAlpha(g, 0.85, (q) => q.drawImage(LC(s, 'sheepcloud', 320, 200, sheepCloudArt, 0.5), 1320 + t * 5, 110, 300, 188));
  }
  /** 羊形的云（片 II 的同款；多利在天上看着） */
  function sheepCloudArt(q) {
    q.fillStyle = vg(q, 30, 190, [[0, '#ffffff'], [1, '#e4f0fb']]);
    q.beginPath();
    for (const [x, y, r] of [[92, 104, 44], [138, 80, 50], [190, 84, 46], [228, 110, 40], [196, 132, 44], [140, 134, 46], [96, 136, 38], [60, 118, 30]]) { q.moveTo(x + r, y); q.arc(x, y, r, 0, TAU); }
    q.moveTo(290, 92); q.ellipse(262, 92, 28, 30, 0.2, 0, TAU);
    for (const x of [92, 124, 182, 214]) { q.moveTo(x + 13, 176); q.ellipse(x, 168, 13, 20, 0, 0, TAU); }
    q.fill();
    q.fillStyle = 'rgba(110,130,170,0.55)'; q.beginPath(); q.arc(270, 88, 4.5, 0, TAU); q.fill();
  }
  /**
   * 汽水摊的一个机位：天空 → 远景 → 中景（烘焙）→ o.mid(q)（动的东西）→ o.near(q)（近景，视差 1.3）
   * base：烘焙用的基准机位；res：烘焙分辨率
   */
  function standScene(g, s, cam, o = {}) {
    const t = s.t, base = o.base || { x: 960, y: 540, z: 1 };
    inCam(g, cam, 0.04, (q) => { skyFill(q, -300, 720); standClouds(q, s, t, o); });
    baked(g, s, 'st-far', { x: 960, y: 480, z: 0.8 }, cam, 0.3, standFar, 1.0, [-620, 120, 2540, 810]);
    inCam(g, cam, 0.3, (q) => bigPlume(q, t, 1752, 252, 0.95, 0.85));
    baked(g, s, 'st-mid', { x: 1000, y: 520, z: 0.8 }, cam, 0.62, standMid, 1.1, [-640, 60, 2560, 860]);
    baked(g, s, 'st-main:' + (o.key || 'w') + (o.variant || ''), base, cam, 1, (q) => standMain(q, o), o.res || 1, [-320, 60, 2240, 1150]);
    inCam(g, cam, 1, (q) => {
      tankGauge(q, s, o.gauge ?? 0.12);
      if (o.mid) o.mid(q);
    });
    // 近景：屏幕空间（只跟着手持抖动走一点，另加一点横向视差）
    if (o.near) { g.save(); g.translate((cam.sx || 0) * 1.3 - ((cam.x ?? 960) - (o.nearX ?? cam.x ?? 960)) * 0.35, (cam.sy || 0) * 1.3); o.near(g); g.restore(); }
    if (o.after) o.after(g);
  }
  /** 铜罐上的压力表（活的指针）；k 0..1 */
  function tankGauge(q, s, k) {
    const [gx, gy, gr] = ST.gauge;
    q.fillStyle = '#fffaf0'; q.beginPath(); q.arc(gx, gy, gr, 0, TAU); q.fill();
    q.fillStyle = 'rgba(224,66,78,0.8)'; q.beginPath(); q.moveTo(gx, gy); q.arc(gx, gy, gr * 0.86, -0.25, 0.75); q.closePath(); q.fill();
    q.fillStyle = '#fffaf0'; q.beginPath(); q.arc(gx, gy, gr * 0.6, 0, TAU); q.fill();
    q.strokeStyle = '#3a2a2a'; q.lineWidth = 3; q.beginPath(); q.arc(gx, gy, gr, 0, TAU); q.stroke();
    const a = lerp(PI * 0.75, PI * 2.25, clamp(k)) + (k > 0.8 ? sin(s.t * 60) * 0.06 * (k - 0.8) * 5 : 0);
    q.strokeStyle = '#2a2a3a'; q.lineWidth = 3; q.lineCap = 'round'; q.beginPath(); q.moveTo(gx, gy); q.lineTo(gx + cos(a) * gr * 0.8, gy + sin(a) * gr * 0.8); q.stroke(); q.lineCap = 'butt';
    q.fillStyle = '#2a2a3a'; q.beginPath(); q.arc(gx, gy, 4, 0, TAU); q.fill();
  }
  /** 热浪：一团团往上飘、带点粉色的透明气流（小羊来了的暗示用 pink） */
  function heatWisps(g, t, o) {
    const A = g.globalAlpha;
    for (let i = 0; i < (o.n || 10); i++) {
      const ph = fract(t * (o.speed || 0.25) + hash(o.seed || 3, i));
      const x = o.x + hash(o.seed || 3, i, 2) * o.w + sin(t * 1.5 + i) * 20, y = o.y - ph * (o.h || 200);
      const r = (o.r || 90) * (0.6 + ph);
      g.globalAlpha = A * (o.a ?? 0.12) * sin(PI * ph);
      g.drawImage(puffSpr(i, o.rgb || '255,255,255'), x - r, y - r * 0.4, r * 2, r * 0.8);
    }
    g.globalAlpha = A;
  }
  /** 小羊“显形”时的一圈星星与粉色小烟 */
  function popBurst(g, x, y, r, k, seed = 1) {
    if (k <= 0 || k >= 1) return;
    const e = ease.out(k), a = 1 - k;
    for (let i = 0; i < 7; i++) { const an = (i / 7) * TAU + hash(seed, i) * 0.6, d = r * (0.4 + 0.9 * e); sparkle(g, x + cos(an) * d, y + sin(an) * d * 0.8, r * 0.28 * (1 - k * 0.5), a * 1.2, an, '255,214,236'); }
    for (let i = 0; i < 5; i++) { const an = (i / 5) * TAU + 0.4, d = r * 0.6 * e; withAlpha(g, a * 0.7, (q) => q.drawImage(puffSpr(i, '255,190,220'), x + cos(an) * d - r * 0.5, y + sin(an) * d * 0.6 - r * 0.25, r, r * 0.5)); }
  }
  /** 老板坐在凳子上打盹：o.nod 0..1 低头程度，o.wake 0..1 抬头 / 睁眼 */
  function vendorDoze(q, s, x, o = {}) {
    const t = s.t, nod = o.nod ?? (0.75 + 0.25 * sin(t * 1.1));
    const h = o.h || 400;
    vendor(q, { x, y: SG, h, pose: 'sit', seat: 100, arms: o.arms || 'cross', t, expr: o.expr || (o.wake > 0.5 ? 'neutral' : 'closed'), headPose: o.headPose || (o.wake > 0.5 ? null : 'sleep'), look: o.look || [0.4, 0.3], flip: !!o.flip });
  }

  /* =========================================================
   * 世界 0 · 海滩全景（片头）：海平线 y = 520；左边是海和岬角上的博物馆，右边是小镇与火山，前景是沙滩
   * ========================================================= */
  const HZN = 520;
  const BW_TOWN = resortRow(14, 980, 2200, 690, 90, 230, 60, 140);
  const BW_FAR = resortRow(15, 1180, 2300, 600, 40, 110, 30, 70);
  function beachFar(q) {
    // 右边的山与火山
    volcanoFar(q, 1640, 230, 575, 560, { c0: '#8f98c4', c1: '#a4b4d8', c2: '#c6dcee' });
    q.fillStyle = vg(q, 420, 700, [[0, '#9cc8b0'], [1, '#86b89c']]);
    q.beginPath(); q.moveTo(980, 640); q.bezierCurveTo(1200, 560, 1500, 520, 1800, 500); q.bezierCurveTo(1950, 492, 2100, 500, 2300, 510); q.lineTo(2300, 700); q.lineTo(980, 700); q.closePath(); q.fill();
    for (const b of BW_FAR) { const gy = lerp(610, 520, clamp((b.x - 1180) / 1000)); retroBuilding(q, Object.assign({}, b, { top: gy - (b.base - b.top), base: gy + 20, sign: false, awn: false }), { detail: 0.2, lw: 1.1 }); }
    // 左边海平线上的岬角 + 火山博物馆（与片 II 的夜景同一处）
    q.fillStyle = '#8ab8a8'; q.beginPath(); q.moveTo(-300, HZN + 4); q.bezierCurveTo(-120, HZN - 8, 20, HZN - 40, 160, HZN - 34); q.bezierCurveTo(260, HZN - 30, 320, HZN - 6, 420, HZN + 4); q.closePath(); q.fill();
    q.fillStyle = '#eee8f4'; q.fillRect(118, HZN - 58, 44, 22); q.beginPath(); q.arc(108, HZN - 50, 13, PI, 0); q.fill(); q.fillRect(95, HZN - 50, 26, 14);
    q.fillStyle = '#8a9aaa'; q.fillRect(132, HZN - 54, 4, 7); q.fillRect(146, HZN - 54, 4, 7);
    q.fillStyle = vg(q, 300, 720, [[0, 'rgba(220,240,252,0)'], [0.55, 'rgba(220,240,252,0.42)'], [1, 'rgba(230,246,252,0.25)']]); q.fillRect(-400, 300, VW + 800, 420);
  }
  function beachSea(q) {
    q.fillStyle = vg(q, HZN, 900, [[0, '#7fd8e8'], [0.12, '#44c0d8'], [0.5, '#2aa8c8'], [0.8, '#40c8d0'], [1, '#7ae6dc']]);
    q.fillRect(-400, HZN, VW + 800, 420);
    const R = E.rng(21);
    for (let i = 0; i < 380; i++) { const y = HZN + 3 + pow(R(), 1.7) * 330, near = (y - HZN) / 330, x = R() * (VW + 600) - 300; q.fillStyle = `rgba(255,255,255,${(0.1 + R() * 0.25) * (1 - near * 0.5)})`; q.fillRect(x, y, 8 + R() * 50 * (0.4 + near), 1 + near * 2); }
    q.fillStyle = 'rgba(255,255,255,0.6)'; q.fillRect(-400, HZN, VW + 800, 2);
  }
  function beachTown(q) {
    // 海边的木栈道（右边沿岸）+ 度假楼 + 棕榈 + 汽水摊（小小的）
    q.fillStyle = '#c89a70'; q.beginPath(); q.moveTo(900, 700); q.lineTo(2300, 690); q.lineTo(2300, 716); q.lineTo(900, 718); q.closePath(); q.fill();
    q.fillStyle = '#e8c49a'; q.fillRect(900, 694, 1400, 6);
    for (let x = 920; x < 2300; x += 40) { q.fillStyle = '#9a6a4a'; q.fillRect(x, 716, 4, 22); }
    for (const b of BW_TOWN) retroBuilding(q, b, { detail: 0.55, lw: 1.6 });
    for (let i = 0; i < 9; i++) { const x = 1000 + i * 150 + hash(33, i) * 60; palm(q, x, 698, 120 + hash(34, i) * 90, 0, { seed: 140 + i, lean: (hash(35, i) - 0.5) * 0.3, n: 8 }); }
    // 汐斯塔汽水（远远的一小个：粉白条纹的遮阳篷很好认）
    q.save(); q.translate(1420 - 1100 * 0.17, 700 - SG * 0.17); q.scale(0.17, 0.17);
    annex(q); cooler(q); kiosk(q); awning(q);
    q.restore();
    // 木栈道伸进海里的一段（栈桥）
    q.fillStyle = '#c89a70'; q.beginPath(); q.moveTo(960, 704); q.lineTo(820, 760); q.lineTo(800, 752); q.lineTo(940, 700); q.closePath(); q.fill();
    q.strokeStyle = '#8a5a3a'; q.lineWidth = 3; for (let i = 0; i < 7; i++) { const u = i / 6, x = lerp(950, 812, u), y = lerp(704, 758, u); q.beginPath(); q.moveTo(x, y); q.lineTo(x, y + 26); q.stroke(); }
  }
  // 前景沙滩：阳伞（粉 / 青 / 柠檬黄条纹）、毛巾、脚印、沙堡
  const UMB = [[260, 900, 1.0, '#ff86b8'], [620, 940, 1.2, '#46c0d0'], [980, 880, 0.85, '#f6c040'], [1260, 960, 1.35, '#ff86b8'], [1640, 900, 0.9, '#9a7ae0']];
  function umbrella(q, x, y, sc, c, t = 0) {
    q.save(); q.translate(x, y); q.scale(sc, sc);
    q.fillStyle = 'rgba(80,100,190,0.2)'; q.beginPath(); q.ellipse(40, 6, 130, 22, 0, 0, TAU); q.fill();
    q.strokeStyle = '#f4f0ea'; q.lineWidth = 6; q.beginPath(); q.moveTo(0, 0); q.lineTo(-6, -190); q.stroke();
    const tilt = 0.12 + sin(t * 1.3 + x) * 0.02;
    q.translate(-6, -190); q.rotate(tilt);
    for (let i = 0; i < 8; i++) { const a0 = PI + (i / 8) * PI, a1 = PI + ((i + 1) / 8) * PI; q.fillStyle = i % 2 ? '#fff8f4' : c; q.beginPath(); q.moveTo(0, 0); q.lineTo(cos(a0) * 130, sin(a0) * 46); q.quadraticCurveTo(cos((a0 + a1) / 2) * 118, sin((a0 + a1) / 2) * 40 + 12, cos(a1) * 130, sin(a1) * 46); q.closePath(); q.fill(); }
    q.strokeStyle = 'rgba(80,40,70,0.6)'; q.lineWidth = 2.5; q.beginPath(); q.ellipse(0, 0, 130, 46, 0, PI, TAU); q.stroke();
    q.fillStyle = '#fbf6ee'; q.beginPath(); q.arc(0, -46, 7, 0, TAU); q.fill();
    q.restore();
  }
  function beachSand(q) {
    q.fillStyle = vg(q, 780, 1100, [[0, '#f4dcaa'], [0.4, '#f8e6c0'], [1, '#fcefd4']]); q.fillRect(-400, 780, VW + 800, 400);
    // 湿沙带
    q.fillStyle = 'rgba(200,160,110,0.35)'; q.beginPath(); q.moveTo(-400, 800); for (let x = -400; x <= VW + 400; x += 40) q.lineTo(x, 808 + sin(x * 0.006) * 14); q.lineTo(VW + 400, 850); for (let x = VW + 400; x >= -400; x -= 40) q.lineTo(x, 838 + sin(x * 0.006 + 1) * 12); q.closePath(); q.fill();
    const R = E.rng(41);
    for (let i = 0; i < 260; i++) { q.fillStyle = `rgba(${R() < 0.5 ? '190,150,100' : '255,255,255'},${0.12 + R() * 0.2})`; q.fillRect(-300 + R() * (VW + 600), 850 + R() * 240, 2 + R() * 3, 2); }
    // 毛巾
    for (const [x, y, c] of [[420, 1000, '#ffb0c8'], [820, 985, '#8fe0d0'], [1480, 1010, '#ffe08a']]) { q.save(); q.translate(x, y); q.rotate(-0.08); q.fillStyle = c; q.fillRect(-70, -20, 140, 40); q.fillStyle = 'rgba(255,255,255,0.6)'; for (let k = -60; k < 70; k += 24) q.fillRect(k, -20, 10, 40); q.restore(); }
    // 沙堡
    q.fillStyle = '#e8c890'; q.fillRect(1100, 1010, 70, 34); q.fillRect(1116, 986, 38, 28); q.beginPath(); q.moveTo(1112, 988); q.lineTo(1135, 960); q.lineTo(1158, 988); q.closePath(); q.fill();
    q.fillStyle = '#ff5f9a'; q.beginPath(); q.moveTo(1135, 960); q.lineTo(1135, 936); q.lineTo(1152, 944); q.lineTo(1135, 950); q.fill();
    // 脚印
    q.fillStyle = 'rgba(170,130,90,0.3)'; for (let i = 0; i < 16; i++) { const x = 300 + i * 70, y = 930 + sin(i * 0.7) * 30 + (i % 2) * 14; q.beginPath(); q.ellipse(x, y, 8, 5, 0.3, 0, TAU); q.fill(); }
  }
  function beachFore(q) {
    // 最前面的一道沙丘和几丛海草（左下 / 右下）
    q.fillStyle = vg(q, 960, 1100, [[0, '#e8c890'], [1, '#d8b070']]);
    q.beginPath(); q.moveTo(-400, 1100); q.lineTo(-400, 1000); q.bezierCurveTo(-100, 960, 200, 990, 420, 1040); q.bezierCurveTo(520, 1070, 560, 1090, 600, 1100); q.closePath(); q.fill();
    q.beginPath(); q.moveTo(2320, 1100); q.lineTo(2320, 990); q.bezierCurveTo(2100, 970, 1900, 1010, 1760, 1060); q.lineTo(1700, 1100); q.closePath(); q.fill();
    // 海草：细长的尖叶（填充成形），两种绿，一丛一丛
    for (let cl = 0; cl < 7; cl++) {
      const cx = cl < 4 ? -260 + cl * 170 : 1780 + (cl - 4) * 190, cy = 1040 + hash(57, cl) * 30;
      for (let i = 0; i < 9; i++) {
        const a = -PI / 2 + (i - 4) * 0.2 + (hash(51, cl * 10 + i) - 0.5) * 0.2, L = 70 + hash(52, cl * 10 + i) * 90, bend = (hash(53, cl * 10 + i) - 0.5) * 0.9;
        const bx = cx + (i - 4) * 5, tx = bx + cos(a) * L + bend * 30, ty = cy + sin(a) * L;
        q.fillStyle = i % 2 ? '#5f9a4e' : '#7ab85e'; q.beginPath(); q.moveTo(bx - 4, cy); q.quadraticCurveTo(bx + cos(a) * L * 0.5 + bend * 24 - 3, cy + sin(a) * L * 0.5, tx, ty); q.quadraticCurveTo(bx + cos(a) * L * 0.5 + bend * 24 + 3, cy + sin(a) * L * 0.5, bx + 4, cy); q.closePath(); q.fill();
      }
    }
  }
  /** 海面的碎光（太阳在左上：一条亮闪闪的光路）+ 一道道推上沙滩的浪 */
  function seaLive(q, t) {
    for (let i = 0; i < 90; i++) {
      const y = HZN + 4 + pow(hash(61, i, 1), 1.5) * 300, near = (y - HZN) / 300;
      const cx = 380 + (y - HZN) * 0.35, x = cx + (hash(61, i, 2) - 0.5) * (120 + near * 520) + sin(t * 0.7 + i) * 8;
      const a = max(0, sin(t * (2 + hash(61, i, 3) * 3) + i * 1.9)) * (0.9 - near * 0.4);
      if (a < 0.05) continue;
      q.globalAlpha = a; q.fillStyle = '#ffffff'; q.fillRect(x, y, 6 + near * 30, 1.5 + near * 2.5);
      if (a > 0.8 && hash(61, i, 4) < 0.25) sparkle(q, x, y, 10 + near * 16, a * 0.8, 0, '255,250,230');
    }
    q.globalAlpha = 1;
    // 浪：三道白色的浪花线，一涨一退
    for (let k = 0; k < 3; k++) {
      const ph = fract(t * 0.16 + k / 3), push = sin(ph * PI);
      const y0 = 770 + k * 14 + push * 26;
      q.strokeStyle = `rgba(255,255,255,${0.75 * sin(PI * ph)})`; q.lineWidth = 3 + k;
      q.beginPath(); for (let x = -400; x <= VW + 400; x += 30) { const y = y0 + sin(x * 0.012 + k * 2 + t * 0.6) * 6 + sin(x * 0.004) * 12; x === -400 ? q.moveTo(x, y) : q.lineTo(x, y); } q.stroke();
    }
  }
  /** 远处的海鸥（M 形小线条，翅膀一扇一扇） */
  function gullsFar(q, t, n, seed, o = {}) {
    q.strokeStyle = o.c || 'rgba(60,60,80,0.8)'; q.lineWidth = o.lw || 2.2; q.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const sp = 30 + hash(seed, i) * 40, x = ((hash(seed, i, 2) * 2400 + t * sp) % 2400) - 240, y = (o.y ?? 200) + hash(seed, i, 3) * (o.h ?? 200) + sin(t * 0.8 + i) * 10;
      const s = (o.s || 10) * (0.7 + 0.6 * hash(seed, i, 4)), f = sin(t * (5 + hash(seed, i, 5) * 3) + i) * 0.5;
      q.beginPath(); q.moveTo(x - s, y - s * (0.3 + f)); q.quadraticCurveTo(x - s * 0.5, y - s * 0.5, x, y); q.quadraticCurveTo(x + s * 0.5, y - s * 0.5, x + s, y - s * (0.3 + f)); q.stroke();
    }
    q.lineCap = 'butt';
  }
  /** 热浪：把一段已缓存的图层按水平细条错开重画（不用滤镜的“空气在抖”） */
  function hazeStrips(g, c, x, y, w, h, y0, y1, n, t, amp) {
    const sh = (y1 - y0) / n, kx = c.width / w, ky = c.height / h;
    for (let i = 0; i < n; i++) {
      const yy = y0 + i * sh, dx = sin(yy * 0.09 + t * 7.5) * amp * sin(PI * (i + 0.5) / n) + sin(yy * 0.23 - t * 5.1) * amp * 0.4;
      const sy = (yy - y) * ky; if (sy < 0 || sy + sh * ky > c.height) continue;
      g.drawImage(c, 0, sy, c.width, sh * ky, x + dx, yy, w, sh);
    }
  }
  /* ---------- 镜头 1 · 汐斯塔的午后（0 → 6.90）：海滩全景，热浪，标题 ---------- */
  function shotHeat(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp(lt / 6.9));
    const cam = { x: lerp(930, 1010, k), y: lerp(560, 575, k), z: lerp(1.0, 1.08, k), ...hand(s, 1, 3, 0.25) };
    inCam(g, cam, 0.02, (q) => {
      skyFill(q, -200, HZN + 10, [[0, '#1f78d4'], [0.35, '#3d9ae6'], [0.7, '#86ccf2'], [1, '#d8f2fa']]);
      sun(q, 330, 140, 46, 1, 0.9);
      cumulus(q, s, 'bw0', 1500, 470, 900, 420, 71, 1, { res: 0.55 });
      cumulus(q, s, 'bw1', 700 + t * 4, 400, 560, 230, 72, 0.9);
      cumulus(q, s, 'bw2', -60 + t * 3, 330, 460, 190, 73, 0.85);
      withAlpha(q, 0.9, (qq) => qq.drawImage(LC(s, 'sheepcloud', 320, 200, sheepCloudArt, 0.5), 1060 + t * 6, 170, 240, 150));
    });
    baked(g, s, 'bw-far', { x: 960, y: 540, z: 1 }, cam, 0.15, beachFar, 0.9, [-420, 160, 2340, 720]);
    inCam(g, cam, 0.15, (q) => bigPlume(q, t, 1638, 232, 0.8, 0.85));
    baked(g, s, 'bw-sea', { x: 960, y: 540, z: 1 }, cam, 0.3, beachSea, 0.8, [-420, HZN - 4, 2340, 900]);
    inCam(g, cam, 0.3, (q) => seaLive(q, t));
    // 小镇这一层带热浪（把缓存的图层切成细条左右抖）
    const townC = LC(s, 'bw-town', VW + 600, 420, (q) => { q.translate(300, -380); beachTown(q); }, 1.1);
    inCam(g, cam, 0.45, (q) => { q.drawImage(townC, -300, 380, VW + 600, 420); hazeStrips(q, townC, -300, 380, VW + 600, 420, 600, 730, 26, t, 2.2); });
    baked(g, s, 'bw-sand', { x: 960, y: 540, z: 1 }, cam, 0.7, beachSand, 0.9, [-420, 760, 2340, 1200]);
    inCam(g, cam, 0.7, (q) => {
      for (const [x, y, sc, c] of UMB) umbrella(q, x, y, sc, c, t);
      // 沙滩上的人（很小）
      for (let i = 0; i < 6; i++) { const x = 160 + i * 300 + hash(71, i) * 80, y = 900 + hash(72, i) * 80, walk = hash(73, i) < 0.4; cast(q, 'crowd', { x: x + (walk ? ((t * 22 + i * 60) % 240) - 120 : 0), y, h: 74 + (y - 900) * 0.3, pose: walk ? 'walk' : 'stand', t: t + i, seed: 60 + i, simple: true, flip: hash(74, i) < 0.5, color: pick(['#ff6fa8', '#3fc0d8', '#ffc83a', '#7fd8a0', '#b48ae0', '#ff8a5a'], hash(75, i)) }); }
      heatWisps(q, t, { x: -200, y: 900, w: VW + 400, h: 240, n: 12, r: 120, rgb: '255,250,235', a: 0.16, seed: 3, speed: 0.22 });
      // 粉色的一丝热浪（小羊们快来了）
      if (lt > 4.2) heatWisps(q, t, { x: 1250, y: 760, w: 260, h: 120, n: 4, r: 60, rgb: '255,160,210', a: 0.35 * sst(4.2, 6, lt), seed: 8, speed: 0.5 });
    });
    inCam(g, cam, 0.25, (q) => gullsFar(q, t, 5, 3, { y: 250, h: 180, s: 12 }));
    baked(g, s, 'bw-fore', { x: 960, y: 540, z: 1 }, cam, 1.2, beachFore, 0.8, [-420, 900, 2340, 1200]);
    s.post.leak(g, t, { x: 260, y: 90, r: 900, rgb: '255,236,190', a: 0.35 });
    // 景深：左上角探进来几片虚掉的棕榈叶（深色剪影，叶片还认得出来）；太阳从叶缝里闪一下
    g.save(); g.translate(-40, -50); g.rotate(sin(t * 0.6) * 0.012 + sin(t * 1.7) * 0.004);
    g.drawImage(blurred(s, 'fg-palm3', 640, 440, (q) => {
      q.fillStyle = '#12342a'; for (const [a, L, dr] of [[0.1, 560, 0.3], [0.44, 500, 0.42], [0.8, 400, 0.5]]) frond(q, 10, 10, a, L, dr);
      q.fillStyle = '#1d4a38'; frond(q, 10, 10, 0.27, 520, 0.36);
    }, 0.12, 8), 0, 0, 640, 440);
    g.restore();
    sparkle(g, 336, 142, 110 + 20 * sin(t * 1.3), 0.75, t * 0.15, '255,250,228');
    s.post.vignette(g, 0.28);
  }

  /* ---------- 镜头 2 · 冒汗的汽水（6.90 → 11.15）：台面上的一瓶汽水，水珠滑下来 ---------- */
  function sweatBg(q) {
    // （会被糊掉的）背景：遮阳篷、亭子里的货架、明晃晃的天和海
    q.fillStyle = '#9ad8f0'; q.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 14; i++) { q.fillStyle = i % 2 ? '#fff4f8' : '#ff8cbc'; q.fillRect(i * 150 - 60, 0, 150, 200); }
    q.fillStyle = '#2f6070'; q.fillRect(0, 230, 1300, 420);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 26; i++) { q.fillStyle = pick(['#ff8fbf', '#7fe8c0', '#ffe066', '#4fd0f0'], hash(19, i, r)); q.fillRect(30 + i * 50, 280 + r * 120, 26, 80); }
    q.fillStyle = '#fbfbf6'; q.fillRect(1300, 200, 60, 560);
    q.fillStyle = '#bfefff'; q.fillRect(1360, 200, 560, 330); q.fillStyle = '#46c0d8'; q.fillRect(1360, 530, 560, 140);
    q.fillStyle = '#7fdcc6'; q.fillRect(0, 650, VW, 430);
    for (let i = 0; i < 30; i++) { q.fillStyle = `rgba(255,255,255,${0.4 + hash(20, i) * 0.5})`; q.beginPath(); q.arc(hash(21, i) * VW, hash(22, i) * 600, 20 + hash(23, i) * 50, 0, TAU); q.fill(); }
  }
  function counterTop(q) {
    q.fillStyle = vg(q, 760, 1080, [[0, '#e8b47e'], [0.2, '#f2c894'], [1, '#d8a066']]); q.fillRect(-200, 760, VW + 400, 400);
    q.strokeStyle = 'rgba(140,80,40,0.25)'; q.lineWidth = 2;
    for (let i = 0; i < 22; i++) { const y = 780 + i * 14 + hash(24, i) * 8; q.beginPath(); q.moveTo(-200, y); for (let x = -200; x <= VW + 200; x += 80) q.lineTo(x, y + sin(x * 0.004 + i) * 6 + (x / VW) * 10); q.stroke(); }
    q.fillStyle = 'rgba(255,240,210,0.6)'; q.fillRect(-200, 760, VW + 400, 5);
  }
  /** 瓶子在台面上的影子（760×170，左上角 = 世界 (700,780)；瓶底中心在 (120,148)）：光从左前方来，影子往右后方拖 */
  function sweatShadowArt(q) {
    q.fillStyle = 'rgba(70,30,20,0.42)'; q.beginPath(); q.ellipse(120, 148, 130, 15, 0, 0, TAU); q.fill();
    const P = (u) => [lerp(120, 700, u), lerp(146, 70, u)];
    const th = (u) => (u < 0.5 ? 16 - u * 6 : u < 0.66 ? lerp(13, 5, (u - 0.5) / 0.16) : u < 0.93 ? 5 : 6.5);
    const gr = q.createLinearGradient(120, 148, 700, 70); gr.addColorStop(0, 'rgba(90,40,30,0.36)'); gr.addColorStop(0.6, 'rgba(90,40,30,0.22)'); gr.addColorStop(1, 'rgba(90,40,30,0.1)');
    q.fillStyle = gr; q.beginPath();
    for (let i = 0; i <= 40; i++) { const u = i / 40, [x, y] = P(u); q.lineTo(x, y - th(u)); }
    for (let i = 40; i >= 0; i--) { const u = i / 40, [x, y] = P(u); q.lineTo(x, y + th(u)); }
    q.closePath(); q.fill();
  }
  /** 焦散：一张粉白色的光网（压扁的小圈连成一片，椭圆形渐隐），叠两张错开慢慢动就会“闪” */
  function causticSpr() {
    return spr('caustic2', 512, 128, (q, w, h) => {
      const R = E.rng(77), cells = [];
      for (let i = 0; i < 46; i++) cells.push([R() * w, h * 0.14 + R() * h * 0.72, 12 + R() * 20]);
      const loop = (x, y, r, sd) => { q.beginPath(); const n = 5 + floor(hash(sd, 1) * 3); for (let k = 0; k <= n; k++) { const a = (k / n) * TAU + hash(sd, 2) * 3, rr = r * (0.75 + 0.5 * hash(sd, (k % n) + 3)); const px = x + cos(a) * rr, py = y + sin(a) * rr * 0.5; k ? q.lineTo(px, py) : q.moveTo(px, py); } q.closePath(); };
      q.lineJoin = 'round';
      q.strokeStyle = 'rgba(255,140,196,0.9)'; q.lineWidth = 5;
      cells.forEach(([x, y, r], i) => { loop(x, y, r, 800 + i); q.stroke(); });
      const im = q.getImageData(0, 0, w, h); boxBlurRGBA(im.data, w, h, 2); q.putImageData(im, 0, 0);
      q.strokeStyle = 'rgba(255,246,250,0.8)'; q.lineWidth = 1.3;
      cells.forEach(([x, y, r], i) => { loop(x, y, r, 800 + i); q.stroke(); });
      q.globalCompositeOperation = 'destination-in';
      q.save(); q.translate(w / 2, h / 2); q.scale(1, h / w);
      const gr = q.createRadialGradient(0, 0, 0, 0, 0, w / 2); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      q.fillStyle = gr; q.fillRect(-w / 2, -w / 2, w, w); q.restore();
      q.globalCompositeOperation = 'source-over';
    });
  }
  /** 瓶身上的水珠（静态的一层，和瓶子同一个坐标系：60×150） */
  function condensationArt(q) {
    const R = E.rng(55);
    q.save();
    q.beginPath(); q.moveTo(22, 10); q.lineTo(38, 10); q.lineTo(38, 36); q.bezierCurveTo(38, 52, 52, 56, 52, 72); q.lineTo(52, 136); q.quadraticCurveTo(52, 146, 42, 146); q.lineTo(18, 146); q.quadraticCurveTo(8, 146, 8, 136); q.lineTo(8, 72); q.bezierCurveTo(8, 56, 22, 52, 22, 36); q.closePath(); q.clip();
    for (let i = 0; i < 150; i++) {
      const x = 8 + R() * 44, y = 20 + R() * 124, r = 0.3 + R() * R() * 1.6;
      if (y > 92 && y < 122 && R() < 0.7) continue;
      q.fillStyle = 'rgba(40,70,90,0.3)'; q.beginPath(); q.ellipse(x + 0.15, y + 0.2, r, r * 1.15, 0, 0, TAU); q.fill();
      q.fillStyle = 'rgba(255,255,255,0.75)'; q.beginPath(); q.ellipse(x, y, r * 0.85, r, 0, 0, TAU); q.fill();
      q.fillStyle = '#ffffff'; q.beginPath(); q.arc(x - r * 0.3, y - r * 0.35, r * 0.3, 0, TAU); q.fill();
    }
    q.restore();
  }
  function shotSweat(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp(lt / 4.25));
    const cam = { x: lerp(900, 930, k), y: lerp(560, 540, k), z: lerp(1.0, 1.09, k), r: lerp(-0.012, 0.004, k), ...hand(s, 2, 2, 0.3) };
    // 背景（预先糊好）
    inCam(g, cam, 0.35, (q) => q.drawImage(blurred(s, 'sweat-bg', VW, VH, sweatBg, 0.045), -80, -60, VW + 160, VH + 120));
    inCam(g, cam, 0.35, (q) => { for (let i = 0; i < 14; i++) { const x = hash(91, i) * VW, y = hash(92, i) * 700, r = 30 + hash(93, i) * 60; additive(q, (qq) => { qq.globalAlpha = 0.18 + 0.12 * sin(t * 0.8 + i); qq.drawImage(bubbleSpr('soap'), x - r, y - r, r * 2, r * 2); qq.globalAlpha = 1; }); } });
    inCam(g, cam, 1, (q) => {
      // 台面和瓶子在同一个深度（瓶底不会在台面上“滑”）
      q.drawImage(blurred(s, 'counter', VW + 400, 400, (qq) => { qq.translate(200, -760); counterTop(qq); }, 0.3), -200, 760, VW + 400, 400);
      // 阳光从左后方来：影子往右前方拖出去；影子里是瓶子聚出来的粉色焦散
      q.drawImage(blurred(s, 'sweat-shadow2', 760, 170, sweatShadowArt, 0.2, 14), 700, 780, 760, 170);
      const cx = 1090, cy = 884;
      additive(q, (qq) => {
        qq.save(); qq.translate(cx, cy); qq.rotate(-0.13);
        qq.save(); qq.scale(1, 0.2);
        qq.fillStyle = rg(qq, 0, 0, 6, 230, [[0, 'rgba(255,150,196,0.5)'], [0.45, 'rgba(255,120,180,0.2)'], [1, 'rgba(255,120,180,0)']]);
        qq.beginPath(); qq.arc(0, 0, 230, 0, TAU); qq.fill(); qq.restore();
        const C = causticSpr();
        qq.globalAlpha = 0.5 + 0.2 * sin(t * 1.7); qq.drawImage(C, -230 + sin(t * 0.9) * 10, -40 + sin(t * 1.3) * 3, 460, 80);
        qq.scale(-1, 1); qq.globalAlpha = 0.4 + 0.2 * sin(t * 1.3 + 2); qq.drawImage(C, -220 - cos(t * 0.7) * 12, -36, 440, 72);
        qq.globalAlpha = 1; qq.restore();
        E.glow(qq, cx - 50, cy + 4, 64, '255,236,246', 0.3 + 0.1 * sin(t * 2.1), 'lighter', false);
      });
    });
    inCam(g, cam, 1, (q) => {
      const bx = 820, by = 928, bh = 860, sc = bh / 150;
      bottle(q, s, bx, by, bh, 0, { fl: 'pink' });
      // 瓶子里慢慢上浮的气泡（只在液体里）
      q.save(); q.translate(bx, by); q.scale(sc, sc); q.translate(-30, -146);
      q.beginPath(); q.moveTo(8, 72); q.bezierCurveTo(8, 60, 18, 56, 20, 64); q.lineTo(40, 64); q.bezierCurveTo(42, 56, 52, 60, 52, 72); q.lineTo(52, 136); q.quadraticCurveTo(52, 146, 42, 146); q.lineTo(18, 146); q.quadraticCurveTo(8, 146, 8, 136); q.closePath(); q.clip();
      for (let i = 0; i < 26; i++) { const ph = fract(t * (0.16 + hash(95, i) * 0.2) + hash(96, i)); const x = 12 + hash(97, i) * 36 + sin(t * 2 + i) * 1.2, y = 144 - ph * 80; bubble(q, x, y, 0.5 + hash(98, i) * 1.4, 0.9 * sin(PI * ph), 'fizz'); }
      q.restore();
      // 水珠层
      q.save(); q.translate(bx, by); q.scale(sc, sc); q.drawImage(LC(s, 'condense', 60, 150, condensationArt, 6), -30, -146, 60, 150); q.restore();
      // 三颗大水珠，踩着 6.9–8.5 的几下重音滑下来
      for (const [t0, x0, y0, len] of [[7.03, 44, 70, 60], [7.83, 16, 60, 70], [8.49, 38, 30, 40]]) {
        const a = t - t0; if (a < -1) continue;
        const u = a < 0 ? 0 : ease.in(clamp(a / 0.9)) * 0.7 + clamp(a / 3) * 0.3;
        const px = bx + (x0 - 30) * sc, py = by + (y0 - 146) * sc + u * len * sc;
        if (a > 0) { q.strokeStyle = 'rgba(255,255,255,0.35)'; q.lineWidth = 5; q.beginPath(); q.moveTo(px, by + (y0 - 146) * sc); q.lineTo(px, py - 8); q.stroke(); }
        q.fillStyle = 'rgba(60,90,110,0.25)'; q.beginPath(); q.ellipse(px + 2, py + 3, 9, 12, 0, 0, TAU); q.fill();
        q.fillStyle = 'rgba(255,255,255,0.8)'; q.beginPath(); q.ellipse(px, py, 8, 11, 0, 0, TAU); q.fill();
        q.fillStyle = '#ffffff'; q.beginPath(); q.arc(px - 3, py - 4, 2.6, 0, TAU); q.fill();
      }
      // 瓶肩上“叮”地一闪
      const gl = t - 10.3; if (gl > 0 && gl < 0.9) sparkle(q, bx + 12 * sc - 30 * sc + 30 * sc, by - 100 * sc, 120 * (1 - gl / 0.9) + 20, 1.5 * (1 - gl / 0.9), gl * 2, '255,250,240');
      // 玻璃上一闪而过的粉色倒影（有谁在看……）
      const rf = t - 10.2; if (rf > 0) withAlpha(q, 0.5 * sin(PI * clamp(rf / 0.9)), (qq) => { qq.save(); qq.translate(bx + (40 - 30) * sc + rf * 60, by - 70 * sc); qq.scale(0.5, 1); qq.drawImage(puffSpr(1, '255,150,200'), -60, -40, 120, 80); qq.restore(); });
    });
    s.post.leak(g, t, { x: 220, y: 40, r: 1000, rgb: '255,230,190', a: 0.3 });
    s.post.vignette(g, 0.4);
  }

  /* =========================================================
   * 镜头 · 探头（11.15 → 13.27）：矮墙后面冒出一个粉色的小鼻子
   * ========================================================= */
  const WALL_Y = 800;   // 近景矮墙的顶（屏幕坐标）
  /** 从墙后探出头的一只小羊（屏幕坐标）：up 0..1 露出的程度 */
  function peeker(q, s, x, V, up, o = {}) {
    const y = WALL_Y + V * 0.9 - up * V * (o.rise ?? 0.62);
    const f = o.flip ? -1 : 1, tilt = -(o.tilt ?? 0.34) * clamp(up) * f;
    q.save(); q.beginPath(); q.rect(-400, -400, VW + 800, WALL_Y - 14 + 400); q.clip();
    lamb(q, s, x - f * V * 0.12 * up, y, V, Object.assign({}, o, { rot: tilt }));
    q.restore();
    if (up > 0.55 && o.hooves !== false) {
      // 两只前蹄搭在墙沿上（在脸的下方）
      const hx0 = x + f * V * 0.28;
      q.fillStyle = '#ec93b4'; q.strokeStyle = '#b95c82'; q.lineWidth = max(2, V * 0.012);
      for (const d of [-0.12, 0.12]) { const hx = hx0 + d * V; q.beginPath(); q.ellipse(hx, WALL_Y - 14, V * 0.065, V * 0.042, 0, 0, TAU); q.fill(); q.stroke(); q.fillStyle = '#b95c82'; q.fillRect(hx - V * 0.05, WALL_Y - 12, V * 0.1, V * 0.012); q.fillStyle = '#ec93b4'; }
    }
  }
  function shotPeek(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp(lt / 2.1));
    const cam = { x: lerp(900, 930, k), y: 690, z: lerp(1.2, 1.26, k), ...hand(s, 3, 3, 0.4) };
    const popT = 11.68 - s.shot.t0, pk = clamp((lt - popT) / 0.35);
    standScene(g, s, cam, {
      key: 'peek', base: { x: 915, y: 690, z: 1.23 }, res: 1.03, gauge: 0.1,
      mid: (q) => { snowDoze(q, s); heatWisps(q, t, { x: 200, y: 900, w: 1300, h: 260, n: 9, rgb: '255,255,255', a: 0.1, seed: 5 }); },
      near: (q) => {
        const x = 520;
        if (lt < popT + 0.1) heatWisps(q, t, { x: x - 130, y: WALL_Y + 10, w: 260, h: 240, n: 7, r: 95, rgb: '255,150,205', a: 0.45 * sst(0, popT, lt), seed: 9, speed: 0.7 });
        if (lt >= popT) {
          const pop = ease.back(clamp((lt - popT) / 0.3));
          const sn0 = 12.21 - s.shot.t0, sniff = lt > sn0 && lt < sn0 + 0.75 ? abs(sin((lt - sn0) * 16)) * 0.04 : 0;
          const wide = lt > 13.0 - s.shot.t0;
          const look = lt > sn0 && lt < 12.85 - s.shot.t0 ? (fract((lt - sn0) * 1.6) < 0.5) : false;
          peeker(q, s, x, 430, pop - sniff, { kind: 'boss', expr: wide ? 'surprise' : 'neutral', flip: look, fx: wide ? ['stars', 'drool'] : null, t, tilt: 0.42, rise: 0.66 });
        }
        seawall(q, WALL_Y, s);
        popBurst(q, x + 40, WALL_Y - 120, 170, pk, 3);
        if (lt > 13.0 - s.shot.t0) sfx(q, '！', x + 200, WALL_Y - 330, 96, clamp((lt - 13.0 + s.shot.t0) / 0.25), { color: '#fff27a', rot: 0.15 });
      },
    });
    s.post.vignette(g, 0.32);
  }

  /* ---------- 小羊的视角（13.27 → 15.39）：冰柜里的汽水，一拍一闪 ---------- */
  function shotGlint(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp(lt / 2.12));
    const cam = { x: lerp(1080, 1150, k), y: lerp(700, 690, k), z: lerp(1.9, 2.15, k), ...hand(s, 5, 2, 0.4) };
    const hits = [13.27, 13.80, 14.07, 14.34, 14.87, 15.12].map((x) => x - s.shot.t0);
    standScene(g, s, cam, {
      key: 'glint', base: { x: 1110, y: 695, z: 2.02 }, res: 1.08, gauge: 0.1,
      mid: (q) => {
        snowDoze(q, s);
        // 冰柜里的瓶子：随重音一格格闪过去
        const [a, b, top] = ST.cooler;
        hits.forEach((ht, i) => {
          const a2 = lt - ht; if (a2 < 0 || a2 > 0.6) return;
          const r = i % 4, c = (i * 3) % 4, x = a + 26 + c * 24, y = top + 36 + 30 + r * 64;
          sparkle(q, x, y, 34 * (1 - a2 / 0.6) + 10, 1.2 * (1 - a2 / 0.6), a2 * 3, '255,250,230');
        });
        // 台面上的那瓶汽水（开场特写里的那一瓶）
        bottle(q, s, 1010, ST.counterY - 2, 76, 0, { fl: 'pink' });
        const a3 = lt - hits[5];
        if (a3 > 0 && a3 < 0.7) sparkle(q, 1014, ST.counterY - 62, 60 * (1 - a3 / 0.7) + 12, 1.4 * (1 - a3 / 0.7), 0.3, '255,250,235');
        heatWisps(q, t, { x: 700, y: 900, w: 900, h: 300, n: 8, rgb: '255,255,255', a: 0.12, seed: 7 });
      },
    });
    // 近处的墙沿（画面最底下，虚）+ 两只粉色的耳朵尖
    g.fillStyle = vg(g, 1010, VH, [[0, 'rgba(236,214,190,0.85)'], [1, 'rgba(220,196,170,0.95)']]); g.fillRect(0, 1010, VW, 80);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, 1008, VW, 6);
    const fgk = sdOK('enemy_1350_mgcshp') ? 'fg-lamb-sd' : 'fg-lamb';
    g.drawImage(blurred(s, fgk, 900, 560, (q) => { if (!(fgk === 'fg-lamb-sd' && SDK().draw(q, 'enemy_1350_mgcshp', { x: 430, y: 800, scale: 2.1, anim: 'Idle', t: 0 }))) cast(q, 'sheep-pink', { x: 470, y: 760, h: 700, pose: 'stand', t: 0, expr: 'surprise', flip: false, bow: '#ff4f8f' }); }, 0.07), -260, 700, 900, 560);
    s.post.vignette(g, 0.38);
  }

  /* ---------- 一排小羊（15.39 → 17.53）：啵、啵、啵……整个小队从墙后冒出来 ---------- */
  function shotRow(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 960, y: 700, z: 1.08, ...hand(s, 7, 3, 0.4) };
    const eighth = BEAT / 2;
    const order = [3, 1, 5, 2, 4, 0, 6]; // 带头的倒数第二个冒出来，最小的最后
    const popAt = (j) => j * eighth + (j === 6 ? eighth * 0.8 : 0);
    standScene(g, s, cam, {
      key: 'row', base: { x: 960, y: 700, z: 1.08 }, res: 1, gauge: 0.1,
      mid: (q) => { snowDoze(q, s); heatWisps(q, t, { x: 200, y: 900, w: 1500, h: 260, n: 9, rgb: '255,255,255', a: 0.1, seed: 5 }); },
      near: (q) => {
        for (let j = 0; j < 7; j++) {
          const i = order[j], L = GANG[i], a = lt - popAt(j);
          if (a < 0) continue;
          const pop = ease.back(clamp(a / 0.26));
          const x = 170 + i * 262 + (i === 6 ? 20 : 0), V = 300 * L.sc;
          const tiny = i === 6, jump = tiny ? abs(sin(max(0, a - 0.25) * 9)) * 0.3 : 0;
          peeker(q, s, x, V, pop * (tiny ? 0.5 : 1) + jump, { kind: L.k, expr: a > 0.45 ? 'surprise' : 'neutral', flip: i === 2 || i === 5, fx: a > 0.45 ? (i % 2 ? ['stars', 'drool'] : ['stars']) : null, hooves: !tiny, t: t + i, tilt: 0.4, rise: 0.64 });
        }
        seawall(q, WALL_Y, s);
        for (let j = 0; j < 7; j++) { const i = order[j]; popBurst(q, 170 + i * 262 + 40, WALL_Y - 130, 140, clamp((lt - popAt(j)) / 0.5), 10 + i); }
      },
    });
    s.post.vignette(g, 0.3);
  }

  /* ---------- 步道上的小道具（画在小羊前面，给它们当掩护） ---------- */
  function potPlant(q, x, y, sc = 1) {
    const ink = '#4a2a2a';
    q.save(); q.translate(x, y); q.scale(sc, sc);
    for (let i = 0; i < 7; i++) { const a = -PI / 2 + (i - 3) * 0.32; q.fillStyle = i % 2 ? '#4a9a5a' : '#3a824a'; q.beginPath(); q.moveTo(-6, -60); q.quadraticCurveTo(cos(a) * 60 - 6, -60 + sin(a) * 70, cos(a) * 90, -60 + sin(a) * 80 + 20); q.quadraticCurveTo(cos(a) * 50 + 6, -60 + sin(a) * 50, 6, -60); q.closePath(); q.fill(); }
    q.fillStyle = '#e07a4a'; q.beginPath(); q.moveTo(-44, -66); q.lineTo(44, -66); q.lineTo(34, 0); q.lineTo(-34, 0); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 2.5; q.stroke();
    q.fillStyle = '#f0925a'; q.fillRect(-48, -72, 96, 12); q.strokeRect(-48, -72, 96, 12);
    q.fillStyle = 'rgba(255,255,255,0.25)'; q.fillRect(-36, -58, 8, 52);
    q.restore();
  }
  function bollard(q, x, y, sc = 1) {
    q.save(); q.translate(x, y); q.scale(sc, sc);
    q.fillStyle = '#2f7f8e'; rrect(q, -18, -76, 36, 76, 10); q.fill(); q.strokeStyle = '#1a3a44'; q.lineWidth = 2.5; q.stroke();
    q.fillStyle = '#ffffff'; q.fillRect(-18, -56, 36, 8); q.fillStyle = 'rgba(255,255,255,0.3)'; q.fillRect(-12, -70, 6, 64);
    q.fillStyle = '#2f7f8e'; q.beginPath(); q.ellipse(0, -76, 22, 8, 0, 0, TAU); q.fill(); q.stroke();
    q.restore();
  }
  /** 老板手里的蒲扇（纸扇）：(x, y) 扇柄，ang 方向 */
  function paperFan(q, x, y, ang, sc = 1) {
    q.save(); q.translate(x, y); q.rotate(ang); q.scale(sc, sc);
    q.strokeStyle = '#8a5a3a'; q.lineWidth = 4; q.beginPath(); q.moveTo(0, 0); q.lineTo(0, -34); q.stroke();
    q.fillStyle = '#fff4e0'; q.beginPath(); q.moveTo(0, -30); q.arc(0, -30, 46, -PI / 2 - 0.9, -PI / 2 + 0.9); q.closePath(); q.fill();
    q.strokeStyle = '#4a3a3a'; q.lineWidth = 2; q.stroke();
    q.strokeStyle = 'rgba(224,66,78,0.7)'; q.lineWidth = 1.5; for (let i = -3; i <= 3; i++) { const a = -PI / 2 + i * 0.26; q.beginPath(); q.moveTo(0, -30); q.lineTo(cos(a) * 46, -30 + sin(a) * 46); q.stroke(); }
    q.restore();
  }
  /** 小羊们的“潜行”：踮脚一拍一小步（前 40% 的拍子移动，后面定住） */
  function sneakX(b, i, stepLen, x0, gap) {
    const bb = b - i * 0.1, step = floor(bb), u = fract(bb);
    const dart = bb < 0 ? 0 : u < 0.42 ? ease.inOut(u / 0.42) : 1;
    return { x: x0 + (max(0, step) + dart) * stepLen - i * gap, moving: bb > 0 && u < 0.42, u };
  }

  /* ---------- 潜入（17.53 → 21.77）：侧面跟拍，小羊们一拍一小步地踮脚过去 ---------- */
  function shotSneak(g, s) {
    const t = s.t, lt = s.lt, b = bt0(s);
    const gullT = 4; // 第 5 拍：海鸥落在黑板上“嘎？”一声，全体定住
    const freeze = b > gullT && b < gullT + 1.3;
    const bbOf = (bb) => (bb > gullT && bb < gullT + 1.3 ? gullT + 0.02 : bb >= gullT + 1.3 ? bb - 1.28 : bb);
    const camAt = (u) => { const bu = s.T.beatAt(s.shot.t0 + u) - s.T.beatAt(s.shot.t0), ld = sneakX(bbOf(bu), 0, 82, 40, 58).x; return { x: lerp(250, 610, ease.inOut(clamp(u / 4.25))) * 0.4 + (ld - 40) * 0.6, y: 880, z: 2.75 }; };
    const B = pathBase(s, camAt);
    const cam = Object.assign(camAt(lt), hand(s, 11, 3, 0.35));
    standScene(g, s, cam, {
      key: 'sneak', base: B, res: B.res,
      mid: (q) => {
        snowDoze(q, s);
        // 黑板上的海鸥（第 4 拍滑翔进来，第 5 拍“嘎？”）
        gull(q, s, 598, SG - 172, 0.85, b - gullT + 0.2);
        for (let i = 6; i >= 0; i--) {
          const L = GANG[i];
          const P = sneakX(bbOf(b), i, 82, 40, 58);
          const V = 46 * L.sc, y = SG + 58 + (i % 2) * 10;
          const hy = P.moving ? sin(PI * P.u / 0.42) * 10 : 0;
          const scared = freeze && i === 1, glare = i === 0 && b > 6.1 && b < 7.4;
          if (P.moving) for (let k = 1; k <= 3; k++) { q.strokeStyle = `rgba(255,255,255,${0.5 - k * 0.12})`; q.lineWidth = 2.5; q.beginPath(); q.moveTo(P.x - V * 0.6 - k * 14, y - hy - V * (0.2 + k * 0.15)); q.lineTo(P.x - V * 0.6 - k * 14 - 30, y - hy - V * (0.2 + k * 0.15)); q.stroke(); }
          lamb(q, s, P.x, y - hy, V, { kind: L.k, pose: P.moving ? 'run' : 'stand', t: 0.1, sq: P.moving ? -0.25 : 0.05 * sin(fract(b) * PI * 6) * (1 - fract(b)), rot: P.moving ? 0.1 : 0, expr: freeze ? 'surprise' : glare ? 'sad' : 'neutral', fx: scared || (i === 1 && b > 6.3 && b < 7.4) ? ['sweat'] : null, flip: glare });
          shadow(q, P.x - 4, y + 2, V * 1.1, 0.5);
        }
        if (b > gullT) sfx(q, '嘎？', 660, SG - 250, 40, clamp((b - gullT) / 0.3), { color: '#ffffff', rot: -0.12, alpha: 1 - clamp((b - gullT - 1.2) / 0.3) });
        potPlant(q, 300, SG + 128, 1.05); bollard(q, 560, SG + 122, 1.1); potPlant(q, 880, SG + 140, 1.15); bollard(q, 1150, SG + 124, 1.1);
      },
    });
    s.post.vignette(g, 0.3);
  }
  /** 海鸥（侧面，站着 / 落下）：a < 0 在天上滑翔进来，a ≥ 0 落定 */
  function gull(q, s, x, y, sc, a) {
    const t = s.t;
    let gx = x, gy = y, flap = 0, stand = true;
    if (a < 0) { const u = clamp(1 + a / 1.2); gx = lerp(x + 500, x, ease.out(u)); gy = lerp(y - 220, y, ease.inOut(u)); flap = sin(t * 14) * 0.6; stand = false; if (a < -1.2) return; }
    q.save(); q.translate(gx, gy); q.scale(-sc, sc);
    const ink = '#3a3a4a';
    q.fillStyle = '#ffffff'; q.strokeStyle = ink; q.lineWidth = 2.5;
    q.beginPath(); q.ellipse(0, -26, 30, 17, -0.1, 0, TAU); q.fill(); q.stroke();
    q.beginPath(); q.arc(24, -44, 13, 0, TAU); q.fill(); q.stroke();
    q.fillStyle = '#f2b640'; q.beginPath(); q.moveTo(35, -46); q.lineTo(54, -42); q.lineTo(35, -38); q.closePath(); q.fill(); q.stroke();
    q.fillStyle = '#2a2a3a'; q.beginPath(); q.arc(28, -47, 2.6, 0, TAU); q.fill();
    q.fillStyle = '#9aa6b8'; q.beginPath(); q.moveTo(-18, -34); q.quadraticCurveTo(-4, -44 - flap * 40, 14, -30); q.quadraticCurveTo(0, -18, -30, -20); q.closePath(); q.fill(); q.stroke();
    if (stand) { q.strokeStyle = '#f2b640'; q.lineWidth = 3; q.beginPath(); q.moveTo(-4, -10); q.lineTo(-6, 4); q.moveTo(6, -10); q.lineTo(6, 4); q.stroke(); }
    q.restore();
  }

  /* ---------- 打盹（21.77 → 23.88）：小羊们从老板垂着的脚下溜过去；铃铛“叮铃”一声 ---------- */
  function shotDoze(g, s) {
    const t = s.t, lt = s.lt, b = bt0(s);
    const cam = { x: 690, y: 720, z: 2.55, ...hand(s, 13, 2, 0.35) };
    const ring = 23.36 - s.shot.t0, rk = lt - ring;
    standScene(g, s, cam, {
      key: 'doze', base: { x: 690, y: 720, z: 2.55 }, res: 1.02, noStool: false,
      mid: (q) => {
        // 店主在长凳上睡午觉（“叮铃”一声时身子一抖，呼噜停了）
        const stir = rk > 0 && rk < 0.7 ? 1 - rk / 0.7 : 0;
        snowDoze(q, s, { stir, noZ: rk > 0 && rk < 0.7 });
        // 小羊们从长凳前面踮脚溜过；第二只的交通锥碰倒了脚边的空瓶——“叮铃”，全体定住
        const P1 = sneakX(ring / BEAT + 0.02, 1, 64, 520, 52), bx0 = P1.x + 58, by0 = SG + 42 + 2;
        const wob = rk > 0 ? sin(rk * 34) * 0.32 * exp(-rk * 3.5) : 0;
        bottle(q, s, bx0, by0, 64, wob, { fl: 'mint', cap: false, fill: 0 });
        const freeze = rk > 0 && rk < 0.55;
        for (let i = 6; i >= 0; i--) {
          const L = GANG[i];
          const bb = freeze ? ring / BEAT + 0.02 : rk > 0.55 ? b - 1.03 : b;
          const P = sneakX(bb, i, 64, 520, 52);
          const V = 46 * L.sc, y = SG + 34 + (i % 2) * 8;
          const hy = P.moving ? sin(PI * P.u / 0.42) * 9 : 0;
          lamb(q, s, P.x, y - hy, V, { kind: L.k, pose: P.moving ? 'walk' : 'stand', sq: P.moving ? -0.22 : 0.04, rot: P.moving ? 0.08 : 0, expr: freeze ? 'surprise' : 'neutral', fx: freeze ? (i === 1 ? ['sweat'] : null) : null });
          shadow(q, P.x - 4, y + 2, V * 1.1, 0.5);
          if (i === 1 && rk > 0 && rk < 0.7) sparkle(q, bx0, by0 - 40, 26 * (1 - rk / 0.7) + 6, 1.2 * (1 - rk / 0.7), rk * 4, '255,236,160');
        }
        if (rk > 0) sfx(q, '叮铃', bx0 + 40, SG - 110, 30, clamp(rk / 0.2), { color: '#fff27a', rot: -0.1, alpha: 1 - clamp((rk - 0.5) / 0.3) });
      },
    });
    s.post.vignette(g, 0.34);
  }

  /* ---------- 眼睛（23.88 → 24.95）：老板的一只眼睛睁开一条缝，左看右看 ---------- */
  function shotEye(g, s) {
    const t = s.t, lt = s.lt;
    // 背景：虚化的遮阳篷条纹 + 亭子
    g.drawImage(LC(s, 'eye-bg', VW, VH, (q) => {
      for (let i = 0; i < 12; i++) { q.fillStyle = i % 2 ? '#fff4f8' : '#ff9cc4'; q.fillRect(i * 160 - 40, 0, 160, 360); }
      q.fillStyle = vg(q, 300, 420, [[0, 'rgba(255,255,255,0)'], [1, '#bfeee0']]); q.fillRect(0, 300, VW, 120);
      q.fillStyle = '#bfeee0'; q.fillRect(0, 420, VW, 660);
      q.fillStyle = '#2f6070'; q.fillRect(200, 470, 1500, 260);
      for (let i = 0; i < 30; i++) { q.fillStyle = pick(['#ff8fbf', '#8ff0c8', '#ffe66b', '#4fd6e8'], hash(9, i)); q.fillRect(220 + i * 50, 560, 24, 60); }
      q.fillStyle = '#7fdcc6'; q.fillRect(0, 760, VW, 320);
    }, 0.06), -60, -40, VW + 120, VH + 80);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, VW, VH);
    const open = lt > 0.2, look = lt < 0.2 ? [0, 0.2] : lt < 0.62 ? [-0.9, 0.35] : [0.9, 0.35];
    const cam = { x: 960, y: 540, z: 1, ...shake(s, open ? 2 : 0, 17, 10) };
    inCam(g, cam, 1, (q) => {
      // 店主的脸（官方剧情立绘）：闭着眼 → 睁开一只眼 → 眯着眼左看右看
      const t0 = s.shot.t0, pan = lt < 0.2 ? 0 : lt < 0.62 ? -1 : 1;
      const ok = snowCard(q, s, { x: 960 + pan * 26, y: 1240, h: 1320, crop: 'bust', expr: [[t0 - 1, 11], [t0 + 0.2, 2], [t0 + 0.62, 9]], xfade: 0.12, breath: 1.2, look: (tt) => [tt < t0 + 0.62 ? 0 : tt < t0 + 1.2 ? -0.7 : 0.7, 0.1], blink: 0, tilt: (tt) => (tt < t0 + 0.62 ? 0 : tt < t0 + 1.2 ? -0.4 : 0.4) });
      if (!ok) vendor(q, { x: 960, y: 610, h: 700, crop: 'face', pose: 'stand', t, expr: open ? 'sleepy' : 'closed', look, blink: false });
      if (open) sfx(q, '……？', 1480, 280, 70, clamp((lt - 0.2) / 0.2), { color: '#ffffff', rot: 0.08 });
    });
    s.post.vignette(g, 0.5);
  }

  /* ---------- 老板的视角（24.95 → 26.02）：步道上空无一“羊”，只有一只瓶盖在打转 ---------- */
  function shotPov(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: lerp(860, 900, lt), y: 820, z: 1.9, ...hand(s, 15, 5, 0.8) };
    standScene(g, s, cam, {
      key: 'pov', base: { x: 880, y: 820, z: 1.9 }, res: 1.02, noStool: true,
      mid: (q) => {
        // 看不见的小羊：只剩一点粉色的热浪和亮晶晶的轮廓（定格在半空的一步）
        for (let i = 0; i < 7; i++) {
          const L = GANG[i], x = 700 + i * 52 + (i === 6 ? 20 : 0), y = SG + 40 + (i % 2) * 8, V = 46 * L.sc;
          lamb(q, s, x, y, V, { kind: L.k, pose: 'run', t: 0.1, alpha: 0.16 + 0.06 * sin(t * 9 + i), sq: -0.15 });
          if (hash(31, i) < 0.6) sparkle(q, x + (hash(32, i) - 0.5) * V, y - V * (0.3 + 0.5 * hash(33, i)), 8 + 4 * sin(t * 7 + i), 0.7, t, '255,190,225');
        }
        heatWisps(q, t, { x: 650, y: SG + 60, w: 420, h: 140, n: 8, r: 60, rgb: '255,160,210', a: 0.45, seed: 21, speed: 0.8 });
        // 在地上打转的瓶盖
        const sp = t * 9;
        bottleCap(q, s, 1010 - lt * 16, SG + 70, 24, sp, 0.4 + 0.3 * abs(sin(sp * 0.5)));
      },
    });
    // 视角的前景：老板自己的膝盖（蓝裤子）
    g.fillStyle = '#3f5f86'; g.strokeStyle = '#1f2f46'; g.lineWidth = 5;
    g.beginPath(); g.ellipse(560, 1130, 300, 170, 0.2, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(1400, 1150, 300, 170, -0.2, 0, TAU); g.fill(); g.stroke();
    s.post.vignette(g, 0.62);
  }

  /* ---------- 工坊门口（26.02 → 28.14）：门把手太高了 → 带头的小羊有了主意 ---------- */
  function shotDoor(g, s) {
    const t = s.t, lt = s.lt, b = bt0(s);
    const cam = { x: 1760, y: 770, z: 2.9, ...hand(s, 17, 3, 0.4) };
    const idea = 2.6;
    standScene(g, s, cam, {
      key: 'door', base: { x: 1760, y: 770, z: 2.9 }, res: 1.02,
      mid: (q) => {
        const [kx, ky] = ST.knob;
        sparkle(q, kx - 2, ky - 4, 14 + 6 * s.pulse(4), 0.8, t, '255,244,200');
        for (let i = 6; i >= 0; i--) {
          const L = GANG[i], V = 46 * L.sc;
          const arrive = clamp((b - i * 0.3) / 1.6), [hy, sq] = hop(fract(b * 2 + i * 0.2));
          const x = lerp(1540, i === 0 ? 1668 : 1740 + i * 17, ease.out(arrive)), y = SG - 4 + (i % 2) * 6;
          const moving = arrive < 1;
          const isBoss = i === 0;
          const lookUp = b > 1.2 && b < idea;
          lamb(q, s, x, y - (moving ? hy * 16 : 0), V, { kind: L.k, pose: lookUp ? 'look-up' : moving ? 'jump' : 'stand', sq: moving ? sq * 0.6 : 0, flip: isBoss && b > idea, expr: isBoss && b > idea ? 'happy' : lookUp ? 'neutral' : 'neutral', fx: isBoss && b > idea ? ['!'] : null, fxPop: clamp((b - idea) / 0.4) });
          shadow(q, x - 4, y + 2, V * 1.1, 0.45);
        }
        if (b > idea) { const a = (b - idea) * BEAT; sparkle(q, 1760, SG - 110, 40 * (1 - clamp(a / 0.8)) + 10, 1.3 * (1 - clamp(a / 0.8)), a * 3, '255,240,170'); }
      },
    });
    s.post.vignette(g, 0.34);
  }

  /* ---------- 羊塔（28.14 → 32.38）：一拍一只跳上去，晃、晃、差点倒——够到门把手了 ---------- */
  const TOWER = [3, 1, 5, 2, 4, 6, 0]; // 从下到上（带头的在最上面）
  function towerState(s, t) {
    const b = s.T.beatAt(t) - s.T.beatAt(D[13]);
    const lv = [];
    let h = 0, sway = 0;
    // 整座塔的晃动：越高越晃；29.73 那一下重音差点倒
    const big = t > 29.73 ? exp(-(t - 29.73) * 2.2) * sin((t - 29.73) * 8) : 0;
    for (let j = 0; j < 7; j++) {
      const L = GANG[TOWER[j]], V = 46 * L.sc;
      const land = j === 0 ? -1 : j; // 第 j 只在第 j 拍落上去
      const a = b - land;
      if (a < 0) { lv.push({ j, V, L, wait: true }); continue; }
      const theta = (0.03 * sin(t * 5.2) + 0.02 * sin(t * 8.3 + 1)) * min(1, h / 120) + big * 0.16;
      sway += theta;
      const air = a < 0.55 && j > 0 ? 1 - a / 0.55 : 0;
      lv.push({ j, V, L, h, theta: sway, air, a });
      h += V * 0.7;
    }
    return { lv, top: h, b };
  }
  function drawTower(q, s, x0, gy, st, o = {}) {
    const t = s.t;
    let px = x0, py = gy;
    for (const L of st.lv) {
      if (L.wait) {
        // 还没跳上去的：在旁边排队、按拍子小跳
        const [hy, sq] = hop(fract(st.b * 2 + L.j * 0.3));
        const qx = x0 - 60 - L.j * 44, qy = gy + 6;
        lamb(q, s, qx, qy - hy * 10, L.V, { kind: L.L.k, pose: 'stand', sq: sq * 0.5, expr: 'neutral' });
        continue;
      }
      const lx = x0 + sin(L.theta) * L.h, ly = gy - L.h * cos(L.theta);
      let x = lx, y = ly;
      if (L.air > 0) {
        // 从队伍里跳上来：抛物线
        const fx = x0 - 60 - L.j * 44, u = 1 - L.air;
        x = lerp(fx, lx, u); y = lerp(gy, ly, u) - sin(PI * u) * 120;
      }
      const land = L.air === 0 && L.a < 0.8 ? (1 - L.a / 0.8) : 0;
      const bottom = L.j === 0 && st.lv.filter((z) => !z.wait).length > 4;
      lamb(q, s, x, y, L.V, { kind: L.L.k, pose: L.air > 0 ? 'jump' : 'stand', rot: L.theta, sq: land * 0.6 * sin(L.a * 20) + (bottom ? 0.18 : 0), expr: L.air > 0 ? 'happy' : bottom ? 'sad' : (L.j === 6 ? 'happy' : 'neutral'), fx: bottom ? ['sweat'] : null, flip: false });
      px = x; py = y;
    }
    return [px, py];
  }
  function shotTower(g, s) {
    const t = s.t, lt = s.lt;
    const st = towerState(s, t);
    const path = (u) => { const k = ease.inOut(clamp(u / 3.6)); return { x: lerp(1716, 1745, k), y: lerp(790, 690, k), z: lerp(3.0, 2.75, k) }; };
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 19, 3, 0.4), t > 29.73 && t < 30.6 ? shake(s, 6 * exp(-(t - 29.73) * 4), 7, 20) : {});
    const turn = clamp((t - 31.75) / 0.45), click = t - 32.2;
    standScene(g, s, cam, {
      key: 'tower', base: B, res: B.res, noKnob: true,
      mid: (q) => {
        const x0 = 1760, [tx, ty] = drawTower(q, s, x0, SG - 2, st);
        shadow(q, x0 - 4, SG, 60, 0.5);
        // 门把手（转一下）
        const [kx, ky] = ST.knob;
        q.save(); q.translate(kx, ky); q.rotate(-turn * 1.2);
        q.fillStyle = '#e8c060'; q.beginPath(); q.arc(0, 0, 9, 0, TAU); q.fill(); q.strokeStyle = '#4a3a3a'; q.lineWidth = 2; q.stroke();
        q.fillStyle = '#b08a30'; q.fillRect(-2, -9, 4, 18); q.restore();
        if (click > 0) { sfx(q, '咔嗒', kx + 40, ky - 60, 30, clamp(click / 0.15), { color: '#fff27a', rot: 0.1 }); sparkle(q, kx, ky, 30 * (1 - clamp(click / 0.4)) + 6, 1.2 * (1 - clamp(click / 0.4)), 0, '255,240,190'); }
        if (t > 29.73 && t < 30.4) sfx(q, '哇——', x0 - 120, SG - 320, 34, clamp((t - 29.73) / 0.15), { color: '#bdf6ff', rot: -0.15, alpha: 1 - clamp((t - 30.1) / 0.3) });
        // 门开了一条缝
        if (click > 0) { const w = 10 * clamp(click / 0.18); q.fillStyle = '#1a2a30'; q.fillRect(ST.door[0], ST.door[2], w, SG - ST.door[2]); }
        void tx; void ty;
      },
    });
    s.post.vignette(g, 0.34);
  }

  /* =========================================================
   * 世界 2 · 灌装工坊（室内，面朝南墙）：地面 y = 900；世界 x -200..2500
   *   左：门；门右边：控制盘（红色拉杆「启动」）；铜罐（大压力表）；四只糖浆罐 → 灌装嘴；
   *   传送带横穿画面；压盖机（带飞轮）；右端出口 → 地上的货箱；右墙上的圆窗
   * ========================================================= */
  const FL = 900;
  const WS = { door: [96, 262, 400], lever: [306, 640], tank: [360, 660, 330], gauge: [510, 470, 62], syrup: [790, 900, 1010, 1120], nozzleY: 590, beltY: 668, belt: [640, 2160], capX: 1340, fly: [1500, 470, 70], port: [2250, 470, 66], win: [1560, 1980, 150, 330] };
  const SYRUP = ['pink', 'mint', 'lemon', 'cyan'];
  function shopBack(q) {
    const ink = '#3a2a2a';
    // 墙
    q.fillStyle = vg(q, 0, 650, [[0, '#f6e4c8'], [1, '#fbefdc']]); q.fillRect(-400, -300, 3300, 950);
    q.fillStyle = 'rgba(120,90,60,0.05)'; for (let i = 0; i < 260; i++) q.fillRect(-300 + hash(91, i) * 3000, hash(92, i) * 640, 4 + hash(93, i) * 16, 2 + hash(94, i) * 4);
    // 墙裙：薄荷色与白色的花砖
    for (let i = -20; i < 140; i++) for (let j = 0; j < 12; j++) { const tx = i * 22, ty = 646 + j * 22; q.fillStyle = (i + j) % 2 ? '#bff0e6' : '#ffffff'; q.fillRect(tx, ty, 22, 22); }
    q.strokeStyle = 'rgba(60,130,120,0.3)'; q.lineWidth = 1; for (let i = -20; i < 140; i++) { q.beginPath(); q.moveTo(i * 22, 646); q.lineTo(i * 22, FL); q.stroke(); }
    q.fillStyle = '#b8835a'; q.fillRect(-400, 632, 3300, 16); q.fillStyle = 'rgba(255,240,210,0.4)'; q.fillRect(-400, 632, 3300, 3);
    // 天花板木梁
    q.fillStyle = '#9a6a44'; q.fillRect(-400, -300, 3300, 330); q.fillStyle = '#b8845a'; for (let x = -380; x < 2900; x += 260) { q.fillRect(x, -300, 60, 350); q.fillStyle = 'rgba(0,0,0,0.2)'; q.fillRect(x + 50, 30, 10, 20); q.fillStyle = '#b8845a'; }
    q.fillStyle = '#7a5234'; q.fillRect(-400, 26, 3300, 18);
    // 高窗（天空 + 小镇的屋顶）
    const [w0, w1, wy0, wy1] = WS.win;
    q.fillStyle = vg(q, wy0, wy1, [[0, '#5fb4ec'], [1, '#c8ecf8']]); q.fillRect(w0, wy0, w1 - w0, wy1 - wy0);
    q.fillStyle = '#fbf7ef'; q.fillRect(w0 + 20, wy1 - 60, 90, 60); q.fillRect(w0 + 140, wy1 - 90, 120, 90); q.fillStyle = '#3f8fd8'; q.beginPath(); q.arc(w0 + 200, wy1 - 90, 40, PI, 0); q.fill(); q.fillStyle = '#e07a5a'; q.beginPath(); q.moveTo(w0 + 290, wy1 - 50); q.lineTo(w0 + 340, wy1 - 80); q.lineTo(w0 + 400, wy1 - 50); q.closePath(); q.fill(); q.fillStyle = '#fff2e0'; q.fillRect(w0 + 300, wy1 - 50, 90, 50);
    q.strokeStyle = '#8a5a3a'; q.lineWidth = 12; q.strokeRect(w0, wy0, w1 - w0, wy1 - wy0); q.lineWidth = 7; for (let i = 1; i < 4; i++) { q.beginPath(); q.moveTo(lerp(w0, w1, i / 4), wy0); q.lineTo(lerp(w0, w1, i / 4), wy1); q.stroke(); } q.beginPath(); q.moveTo(w0, (wy0 + wy1) / 2); q.lineTo(w1, (wy0 + wy1) / 2); q.stroke();
    // 海报：汐斯塔汽水（小羊）
    q.save(); q.translate(1230, 290); q.rotate(-0.03);
    q.fillStyle = '#fff4e6'; q.fillRect(-80, -120, 160, 220); q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(-80, -120, 160, 220);
    q.fillStyle = '#ff9cc4'; q.fillRect(-70, -110, 140, 140); q.fillStyle = '#ffe66b'; q.beginPath(); q.arc(40, -80, 22, 0, TAU); q.fill();
    q.save(); q.translate(-10, 30); q.scale(0.62, 0.62); q.translate(-30, -146); bottleArt(q, 'pink', true, 1); q.restore();
    for (const [x, y, r] of [[26, -30, 16], [40, -40, 17], [52, -28, 14], [38, -18, 15]]) { q.fillStyle = '#ffffff'; q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); }
    q.fillStyle = '#3a2430'; q.beginPath(); q.ellipse(12, -30, 7, 9, -0.3, 0, TAU); q.fill();
    E.text(q, '汐斯塔汽水', 0, 62, { font: 'sans', size: 22, weight: 700, color: '#d9477f', spacing: 2 });
    E.text(q, '冒泡的夏天', 0, 88, { font: 'hand', size: 18, color: '#3a8aa0' });
    q.restore();
    // 挂钟
    q.fillStyle = '#ffffff'; q.beginPath(); q.arc(880, 220, 44, 0, TAU); q.fill(); q.strokeStyle = '#8a5a3a'; q.lineWidth = 8; q.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; q.fillStyle = ink; q.fillRect(880 + cos(a) * 34 - 2, 220 + sin(a) * 34 - 2, 4, 4); }
    // 右墙：圆窗（海）
    const [px, py, pr] = WS.port;
    q.fillStyle = vg(q, py - pr, py + pr, [[0, '#7fd0f4'], [0.55, '#bfeefa'], [0.56, '#3fb8d8'], [1, '#2a9ac0']]); q.beginPath(); q.arc(px, py, pr, 0, TAU); q.fill();
    q.fillStyle = 'rgba(255,255,255,0.4)'; q.beginPath(); q.moveTo(px - 40, py + 20); q.lineTo(px + 10, py - 40); q.lineTo(px + 26, py - 40); q.lineTo(px - 40, py + 40); q.closePath(); q.fill();
    q.strokeStyle = '#c8a050'; q.lineWidth = 12; q.beginPath(); q.arc(px, py, pr + 3, 0, TAU); q.stroke();
    // 墙上的管子
    q.strokeStyle = '#c87a44'; q.lineWidth = 16; q.lineCap = 'round';
    q.beginPath(); q.moveTo(560, 330); q.lineTo(560, 120); q.lineTo(1100, 120); q.lineTo(1100, 70); q.lineTo(2600, 70); q.stroke();
    q.strokeStyle = 'rgba(255,220,180,0.5)'; q.lineWidth = 4; q.beginPath(); q.moveTo(556, 330); q.lineTo(556, 116); q.lineTo(1100, 116); q.stroke();
    q.lineCap = 'butt';
    q.fillStyle = '#a05a2a'; for (const x of [560, 800, 1100, 1500, 2000]) q.fillRect(x - 12, x === 560 ? 200 : x === 800 ? 110 : 60, 24, 20);
    // 地板（陶砖，透视）
    q.fillStyle = vg(q, FL, 1100, [[0, '#d8906a'], [1, '#eaa47c']]); q.fillRect(-400, FL, 3300, 400);
    q.strokeStyle = 'rgba(120,50,30,0.3)'; q.lineWidth = 2;
    for (let k = 0; k < 7; k++) { const y = FL + pow(k / 6, 1.5) * 200; q.beginPath(); q.moveTo(-400, y); q.lineTo(2900, y); q.stroke(); }
    for (let x = -1600; x < 4200; x += 120) { q.beginPath(); q.moveTo(x, FL); q.lineTo(x + (x - 1100) * 0.5, 1100); q.stroke(); }
    q.fillStyle = vg(q, FL, FL + 30, [[0, 'rgba(60,20,20,0.3)'], [1, 'rgba(60,20,20,0)']]); q.fillRect(-400, FL, 3300, 30);
    // 门框 + 关着的门
    const [d0, d1, dt] = WS.door;
    q.fillStyle = '#c8a888'; q.fillRect(d0 - 16, dt - 16, d1 - d0 + 32, FL - dt + 16);
    q.fillStyle = '#2a1a14'; q.fillRect(d0, dt, d1 - d0, FL - dt);
  }
  /** 关着的门（室内看）；open 0..1：门扇向镜头这边转开，门外是白亮的步道 */
  function shopDoor(q, open, t) {
    const [d0, d1, dt] = WS.door, ink = '#1a3a44', w = d1 - d0, h = FL - dt;
    if (open > 0) {
      // 门外：阳光下的步道 + 大海
      q.fillStyle = vg(q, dt, FL, [[0, '#bfefff'], [0.55, '#e8fbff'], [0.56, '#f4e6d0'], [1, '#fff4e4']]); q.fillRect(d0, dt, w, h);
      q.fillStyle = '#56c6dc'; q.fillRect(d0, dt + h * 0.42, w, h * 0.12);
    }
    const k = ease.inOut(clamp(open));
    // 门扇：以左边为轴，向屋里转过来（越开越宽、越靠下——透视）
    const ex = d0 + w * cos(k * PI * 0.55) - k * 30, grow = 1 + k * 0.25;
    q.fillStyle = vg(q, dt, FL, [[0, '#46aebc'], [1, '#3a96a4']]);
    q.beginPath(); q.moveTo(d0, dt); q.lineTo(ex, dt - (grow - 1) * 40); q.lineTo(ex, FL + (grow - 1) * 60); q.lineTo(d0, FL); q.closePath(); q.fill();
    q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
    if (ex - d0 > 30) {
      q.fillStyle = '#9fdcec'; const wx0 = lerp(d0, ex, 0.2), wx1 = lerp(d0, ex, 0.8); q.beginPath(); q.moveTo(wx0, dt + 26); q.lineTo(wx1, dt + 26 - (grow - 1) * 30); q.lineTo(wx1, dt + 104 - (grow - 1) * 20); q.lineTo(wx0, dt + 104); q.closePath(); q.fill(); q.stroke();
      q.fillStyle = '#e8c060'; q.beginPath(); q.arc(lerp(d0, ex, 0.86), dt + h * 0.6, 8, 0, TAU); q.fill(); q.stroke();
    }
    if (open > 0) { E.glow(q, (d0 + d1) / 2, dt + h * 0.5, 320, '255,246,220', 0.55 * k); }
  }
  /** 铜罐（大压力表单独画） */
  function shopTank(q) {
    const [x0, x1, top] = WS.tank, cx = (x0 + x1) / 2, ink = '#3a2418';
    q.fillStyle = hg(q, x0, x1, [[0, '#9a5430'], [0.22, '#e8a066'], [0.4, '#ffd09a'], [0.55, '#d88048'], [1, '#7a3a1c']]);
    q.fillRect(x0, top, x1 - x0, FL - top - 40);
    q.beginPath(); q.ellipse(cx, top, (x1 - x0) / 2, 60, 0, PI, 0); q.fill();
    q.strokeStyle = ink; q.lineWidth = 3.5; q.beginPath(); q.moveTo(x0, FL - 40); q.lineTo(x0, top); q.ellipse(cx, top, (x1 - x0) / 2, 60, 0, PI, 0); q.lineTo(x1, FL - 40); q.stroke();
    q.fillStyle = '#6a3418'; for (const yy of [360, 560, 780]) { q.fillRect(x0, yy, x1 - x0, 7); q.fillStyle = '#4a2410'; for (let x = x0 + 12; x < x1; x += 22) { q.beginPath(); q.arc(x, yy - 6, 3, 0, TAU); q.fill(); } q.fillStyle = '#6a3418'; }
    // 支脚
    q.fillStyle = '#3a3a44'; q.fillRect(x0 + 20, FL - 44, 30, 44); q.fillRect(x1 - 50, FL - 44, 30, 44); q.fillRect(x0 + 10, FL - 50, x1 - x0 - 20, 12);
    // 观察管（粉色液位）
    q.fillStyle = 'rgba(210,240,250,0.8)'; q.fillRect(x0 + 24, 400, 16, 340); q.fillStyle = '#ff7eb0'; q.fillRect(x0 + 26, 560, 12, 178);
    q.strokeStyle = ink; q.lineWidth = 2; q.strokeRect(x0 + 24, 400, 16, 340);
    // 手轮阀门
    q.strokeStyle = '#c8303a'; q.lineWidth = 7; q.beginPath(); q.arc(x1 - 30, 640, 34, 0, TAU); q.stroke();
    q.lineWidth = 4; for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; q.beginPath(); q.moveTo(x1 - 30, 640); q.lineTo(x1 - 30 + cos(a) * 32, 640 + sin(a) * 32); q.stroke(); }
    // 顶上的安全阀（后面会飞出去的那个）底座
    q.fillStyle = '#c8a050'; q.fillRect(cx - 18, top - 84, 36, 26); q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(cx - 18, top - 84, 36, 26);
    // 高光
    q.fillStyle = 'rgba(255,240,210,0.45)'; q.fillRect(x0 + 72, top - 30, 14, FL - top - 20);
    // 名牌
    q.fillStyle = '#fff4e0'; rrect(q, cx - 60, 700, 120, 40, 6); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke();
    E.text(q, 'CO₂ · No.1', cx, 728, { font: 'mono', size: 18, weight: 700, color: '#6a3418' });
  }
  /** 大压力表（活的）：k 0..1 */
  function bigGauge(q, s, k, o = {}) {
    const [gx, gy, gr] = WS.gauge;
    q.fillStyle = '#c8a050'; q.beginPath(); q.arc(gx, gy, gr + 10, 0, TAU); q.fill(); q.strokeStyle = '#3a2418'; q.lineWidth = 3; q.stroke();
    q.fillStyle = '#fffaf0'; q.beginPath(); q.arc(gx, gy, gr, 0, TAU); q.fill();
    q.fillStyle = 'rgba(80,200,140,0.35)'; q.beginPath(); q.moveTo(gx, gy); q.arc(gx, gy, gr * 0.9, PI * 0.75, PI * 1.5); q.closePath(); q.fill();
    q.fillStyle = 'rgba(255,200,60,0.45)'; q.beginPath(); q.moveTo(gx, gy); q.arc(gx, gy, gr * 0.9, PI * 1.5, PI * 1.85); q.closePath(); q.fill();
    q.fillStyle = 'rgba(224,50,60,0.75)'; q.beginPath(); q.moveTo(gx, gy); q.arc(gx, gy, gr * 0.9, PI * 1.85, PI * 2.25); q.closePath(); q.fill();
    q.fillStyle = '#fffaf0'; q.beginPath(); q.arc(gx, gy, gr * 0.62, 0, TAU); q.fill();
    q.strokeStyle = '#3a2a2a'; q.lineWidth = 2;
    for (let i = 0; i <= 10; i++) { const a = lerp(PI * 0.75, PI * 2.25, i / 10); q.beginPath(); q.moveTo(gx + cos(a) * gr * 0.9, gy + sin(a) * gr * 0.9); q.lineTo(gx + cos(a) * gr * (i % 5 ? 0.8 : 0.72), gy + sin(a) * gr * (i % 5 ? 0.8 : 0.72)); q.stroke(); }
    E.text(q, 'PSI', gx, gy + gr * 0.45, { font: 'mono', size: 13, weight: 700, color: '#6a4a3a' });
    const jit = o.jit ?? (k > 0.8 ? sin(s.t * 70) * 0.05 * (k - 0.8) * 5 : 0);
    const a = lerp(PI * 0.75, PI * 2.25, clamp(k)) + jit;
    q.strokeStyle = '#c8303a'; q.lineWidth = 4; q.lineCap = 'round'; q.beginPath(); q.moveTo(gx - cos(a) * 10, gy - sin(a) * 10); q.lineTo(gx + cos(a) * gr * 0.84, gy + sin(a) * gr * 0.84); q.stroke(); q.lineCap = 'butt';
    q.fillStyle = '#2a2a3a'; q.beginPath(); q.arc(gx, gy, 7, 0, TAU); q.fill();
    q.fillStyle = 'rgba(255,255,255,0.4)'; q.beginPath(); q.ellipse(gx - gr * 0.35, gy - gr * 0.45, gr * 0.4, gr * 0.16, -0.6, 0, TAU); q.fill();
  }
  /** 控制盘 + 红色拉杆「启动」：on 0..1（0 = 抬起，1 = 拉下） */
  function leverPanel(q, s, on, o = {}) {
    const [lx, ly] = WS.lever, ink = '#1a2a30';
    q.fillStyle = '#5a8a94'; rrect(q, lx - 40, ly - 150, 80, 220, 8); q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
    q.fillStyle = '#fff4e0'; rrect(q, lx - 32, ly - 140, 64, 30, 5); q.fill(); q.lineWidth = 1.5; q.stroke();
    E.text(q, '启动', lx, ly - 117, { font: 'sans', size: 20, weight: 700, color: '#c8303a', spacing: 2 });
    for (let i = 0; i < 3; i++) { const lit = o.lights != null ? o.lights > i / 3 : false; q.fillStyle = lit ? ['#7fff9a', '#ffe66b', '#ff6a6a'][i] : '#3a4a50'; q.beginPath(); q.arc(lx - 20 + i * 20, ly + 50, 7, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = 1.5; q.stroke(); if (lit) E.glow(q, lx - 20 + i * 20, ly + 50, 18, i === 0 ? '120,255,150' : i === 1 ? '255,230,110' : '255,110,110', 0.6); }
    q.fillStyle = '#3a4a50'; q.fillRect(lx - 6, ly - 90, 12, 110);
    const ang = lerp(-PI / 2 - 0.55, -PI / 2 + 1.25, on);
    const hx = lx + cos(ang) * 96, hy = ly + sin(ang) * 96;
    q.strokeStyle = '#c8c8d0'; q.lineWidth = 11; q.lineCap = 'round'; q.beginPath(); q.moveTo(lx, ly); q.lineTo(hx, hy); q.stroke(); q.lineCap = 'butt';
    q.strokeStyle = ink; q.lineWidth = 2; q.beginPath(); q.moveTo(lx, ly); q.lineTo(hx, hy); q.stroke();
    q.fillStyle = '#e0303a'; q.beginPath(); q.arc(hx, hy, 17, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = 2.5; q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.6)'; q.beginPath(); q.arc(hx - 5, hy - 5, 5, 0, TAU); q.fill();
    q.fillStyle = '#8a9aa0'; q.beginPath(); q.arc(lx, ly, 12, 0, TAU); q.fill(); q.stroke();
    return [hx, hy];
  }
  /** 糖浆罐 + 灌装嘴（静态部分） */
  function shopSyrup(q) {
    const ink = '#2a2a3a';
    q.fillStyle = '#8a6a4a'; q.fillRect(744, 540, 422, 14); q.fillRect(748, 552, 12, 110); q.fillRect(1150, 552, 12, 110);
    WS.syrup.forEach((x, i) => {
      const F = FLAVOR[SYRUP[i]];
      q.fillStyle = 'rgba(220,245,250,0.55)'; rrect(q, x - 36, 360, 72, 180, 14); q.fill();
      q.save(); rrect(q, x - 36, 360, 72, 180, 14); q.clip(); q.fillStyle = vg(q, 400, 540, [[0, F.top], [1, F.bot]]); q.fillRect(x - 36, 400 + i * 8, 72, 160); q.fillStyle = F.foam; q.fillRect(x - 36, 398 + i * 8, 72, 5); q.restore();
      q.strokeStyle = ink; q.lineWidth = 2.5; rrect(q, x - 36, 360, 72, 180, 14); q.stroke();
      q.fillStyle = 'rgba(255,255,255,0.55)'; q.fillRect(x - 26, 372, 7, 150);
      q.fillStyle = '#c8a050'; q.fillRect(x - 40, 348, 80, 14); q.strokeRect(x - 40, 348, 80, 14);
      q.strokeStyle = '#c87a44'; q.lineWidth = 8; q.beginPath(); q.moveTo(x, 348); q.lineTo(x, 300); q.lineTo(x + 30, 300); q.stroke();
    });
    // 汇流管
    q.fillStyle = '#9aa6ac'; q.fillRect(744, 560, 422, 18); q.strokeStyle = ink; q.lineWidth = 2; q.strokeRect(744, 560, 422, 18);
  }
  /** 灌装嘴（活的）：drop 0..1 下降量 */
  function nozzles(q, drop) {
    WS.syrup.forEach((x) => {
      const y = WS.nozzleY + drop * 22;
      q.fillStyle = '#b8c4ca'; q.fillRect(x - 7, 578, 14, y - 578); q.strokeStyle = '#2a2a3a'; q.lineWidth = 2; q.strokeRect(x - 7, 578, 14, y - 578);
      q.fillStyle = '#6a7a80'; q.beginPath(); q.moveTo(x - 10, y); q.lineTo(x + 10, y); q.lineTo(x + 4, y + 12); q.lineTo(x - 4, y + 12); q.closePath(); q.fill(); q.stroke();
    });
  }
  /** 传送带（静态框架） */
  function shopBelt(q) {
    const [b0, b1] = WS.belt, y = WS.beltY, ink = '#1f2a30';
    for (let x = b0 + 40; x < b1; x += 220) { q.fillStyle = '#4a5a60'; q.fillRect(x - 8, y + 26, 16, FL - y - 26); q.fillRect(x - 22, FL - 8, 44, 8); }
    q.fillStyle = '#6a7a80'; q.fillRect(b0 - 20, y + 20, b1 - b0 + 40, 12); q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(b0 - 20, y + 20, b1 - b0 + 40, 12);
    q.fillStyle = '#e0e6e8'; q.fillRect(b0 - 20, y - 12, b1 - b0 + 40, 8); q.strokeRect(b0 - 20, y - 12, b1 - b0 + 40, 8);
    // 压盖机（框架）
    const cx = WS.capX, ink2 = '#14303a';
    q.fillStyle = '#2f6a78'; q.fillRect(cx - 90, 380, 22, y - 380 + 30); q.fillRect(cx + 68, 380, 22, y - 380 + 30); q.fillRect(cx - 100, 360, 200, 40);
    q.strokeStyle = ink2; q.lineWidth = 3; q.strokeRect(cx - 90, 380, 22, y - 350); q.strokeRect(cx + 68, 380, 22, y - 350); q.strokeRect(cx - 100, 360, 200, 40);
    q.fillStyle = 'rgba(255,255,255,0.25)'; q.fillRect(cx - 86, 390, 5, y - 380);
    // 瓶盖漏斗（满满的红瓶盖）
    q.fillStyle = 'rgba(210,240,250,0.7)'; q.beginPath(); q.moveTo(cx - 70, 250); q.lineTo(cx + 70, 250); q.lineTo(cx + 16, 350); q.lineTo(cx - 16, 350); q.closePath(); q.fill();
    q.save(); q.clip(); for (let i = 0; i < 40; i++) { q.fillStyle = i % 5 ? '#e0424e' : '#b8242e'; q.beginPath(); q.ellipse(cx - 60 + hash(61, i) * 120, 262 + hash(62, i) * 80, 10, 5, hash(63, i) * 3, 0, TAU); q.fill(); } q.restore();
    q.strokeStyle = ink2; q.lineWidth = 3; q.beginPath(); q.moveTo(cx - 70, 250); q.lineTo(cx + 70, 250); q.lineTo(cx + 16, 350); q.lineTo(cx - 16, 350); q.closePath(); q.stroke();
    // 出口滑槽 + 地上的货箱
    q.fillStyle = '#9aa6ac'; q.beginPath(); q.moveTo(b1 + 10, y - 4); q.lineTo(b1 + 150, y + 150); q.lineTo(b1 + 150, y + 170); q.lineTo(b1 + 10, y + 20); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke();
  }
  /** 压盖机的压头（活的）：p 0..1 下压 */
  function capPress(q, p, run) {
    const cx = WS.capX, y = WS.beltY, ink = '#14303a';
    const hy = 470 + p * 42;
    q.fillStyle = '#9aa6ac'; q.fillRect(cx - 10, 400, 20, hy - 400); q.strokeStyle = ink; q.lineWidth = 2; q.strokeRect(cx - 10, 400, 20, hy - 400);
    q.fillStyle = '#2f6a78'; rrect(q, cx - 38, hy, 76, 40, 6); q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
    q.fillStyle = '#e0424e'; q.fillRect(cx - 14, hy + 40, 28, 8);
    void y; void run;
  }
  function flywheel(q, ang) {
    const [fx, fy, fr] = WS.fly, ink = '#14303a';
    q.save(); q.translate(fx, fy); q.rotate(ang);
    q.strokeStyle = '#2f6a78'; q.lineWidth = 14; q.beginPath(); q.arc(0, 0, fr, 0, TAU); q.stroke();
    q.lineWidth = 7; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; q.beginPath(); q.moveTo(0, 0); q.lineTo(cos(a) * fr, sin(a) * fr); q.stroke(); }
    q.strokeStyle = ink; q.lineWidth = 2; q.beginPath(); q.arc(0, 0, fr + 7, 0, TAU); q.stroke(); q.beginPath(); q.arc(0, 0, fr - 7, 0, TAU); q.stroke();
    q.fillStyle = '#e0424e'; q.beginPath(); q.arc(fr * 0.62, 0, 9, 0, TAU); q.fill();
    q.restore();
    q.fillStyle = '#c8a050'; q.beginPath(); q.arc(fx, fy, 14, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke();
    q.strokeStyle = '#4a5a60'; q.lineWidth = 10; q.beginPath(); q.moveTo(fx, fy); q.lineTo(WS.capX + 90, 420); q.stroke();
  }
  /** 地上一排货箱 No.4–7（出口下面） */
  function shopCrates(q, s, o = {}) {
    const [, b1] = WS.belt;
    for (const [no, x, y, sc] of [[4, b1 - 260, FL, 0.5], [5, b1 - 100, FL, 0.5], [6, b1 + 60, FL, 0.5], [7, b1 + 230, FL, 0.56]]) {
      if (o.skip === no) continue;
      crate(q, s, x, y, sc, { no, hoof: 0, lid: o.lids ? o.lids(no) : -1 });
    }
  }
  /** 阳光：高窗斜射进来的几道光柱 + 灰尘 */
  function shopBeams(q, t, a = 1) {
    const [w0, w1, wy0, wy1] = WS.win;
    q.save(); q.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const f = 0.09 + 0.03 * sin(t * 0.5 + i * 1.3);
      q.fillStyle = `rgba(255,236,190,${f * a})`;
      const x0 = lerp(w0, w1, i / 4) + 10, x1 = x0 + (w1 - w0) / 4 - 20;
      q.beginPath(); q.moveTo(x0, wy0 + 20); q.lineTo(x1, wy0 + 20); q.lineTo(x1 - 520, FL); q.lineTo(x0 - 620, FL); q.closePath(); q.fill();
    }
    q.restore();
    for (let i = 0; i < 40; i++) {
      const x = 900 + fract(hash(66, i) + t * 0.006 * (hash(67, i) - 0.5)) * 1100 + sin(t * 0.4 + i) * 12;
      const y = 200 + fract(hash(68, i) - t * 0.01 * (0.3 + hash(69, i))) * 650;
      q.globalAlpha = (0.3 + 0.3 * sin(t * 1.7 + i * 2.3)) * a; q.fillStyle = '#fff4d8'; q.fillRect(x, y, 2.4, 2.4);
    }
    q.globalAlpha = 1;
  }
  /** 室内光照（正片叠底的暖色 + 角落暗一点） */
  function shopLight(q) {
    q.fillStyle = '#e8d8c8'; q.fillRect(-500, -300, 3400, 1700);
    q.globalCompositeOperation = 'lighter';
    q.fillStyle = rg(q, 1300, 600, 0, 1400, [[0, 'rgba(40,36,30,1)'], [1, 'rgba(0,0,0,0)']]); q.fillRect(-500, -300, 3400, 1700);
    q.globalCompositeOperation = 'source-over';
  }
  /**
   * 传送带上的瓶子：步进式——每拍的前 45% 停住（灌装嘴下压、压盖机压下），后 55% 往前走一格
   * run 0..1（0 = 停机），speed 倍速（后段加速），返回每只瓶子的 { x, fill, cap, fl, i }
   */
  const PITCH = 110;
  function beltBottles(s, run, speed = 1, t0beat = 0) {
    const b = (s.beat - t0beat) * speed;
    const step = floor(b), u = fract(b);
    const mv = run > 0 ? (u < 0.45 ? 0 : ease.inOut((u - 0.45) / 0.55)) : 0;
    const off = run > 0 ? (step + mv) * PITCH : 0;
    const [b0, b1] = WS.belt, n0x = WS.syrup[0], capX = WS.capX;
    const out = [];
    const n0 = floor((b0 - off) / PITCH) - 1, n1 = floor((b1 - off) / PITCH) + 1;
    const hold = run > 0 && u < 0.45;
    for (let n = n0; n <= n1; n++) {
      const x = n * PITCH + off + 20;
      if (x < b0 + 10 || x > b1 - 10) continue;
      const i = ((n % 97) + 97) % 97;
      // 四个灌装站：每经过一站灌进去 1/4（一层颜色）；正停在站下时按这一拍的进度灌
      const p = (x - n0x) / PITCH, kk = floor(p + 0.5);
      let fill, station = -1;
      if (run <= 0) fill = p > 3.2 ? 1 : 0;
      else if (kk < 0) fill = 0;
      else if (kk > 3) fill = 1;
      else if (hold && abs(p - kk) < 0.01) { fill = kk * 0.25 + 0.25 * clamp(u / 0.4); station = kk; }
      else fill = (p >= kk ? kk + 1 : kk) * 0.25;
      const pc = (x - capX) / PITCH;
      const cap = run <= 0 ? pc > 0.2 : pc > 0.01 || (abs(pc) < 0.01 && u > 0.1);
      out.push({ x, fill, cap, fl: 'rainbow', i, station, capping: abs(pc) < 0.01 && hold });
    }
    return { list: out, u, mv, b };
  }
  /**
   * 工坊的一个机位
   * o: { run(0..1), speed, lever(0..1), door(0..1), gauge(0..1), lights, mid(q), front(q), beams }
   */
  function shopScene(g, s, cam, o = {}) {
    const t = s.t, base = o.base || { x: 960, y: 540, z: 1 };
    g.fillStyle = '#6a4a3a'; g.fillRect(0, 0, VW, VH);
    baked(g, s, 'sh-back:' + (o.key || 'w'), base, cam, 1, (q) => { shopBack(q); shopTank(q); shopSyrup(q); shopBelt(q); }, o.res || 1, [-420, -320, 2920, 1120]);
    const run = o.run || 0, bb = beltBottles(s, run, o.speed || 1, o.t0beat || 0);
    inCam(g, cam, 1, (q) => {
      shopDoor(q, o.door || 0, t);
      shopCrates(q, s, o.crates || {});
      bigGauge(q, s, o.gauge ?? (run > 0 ? 0.35 + 0.05 * sin(t * 3) : 0.12));
      leverPanel(q, s, o.lever ?? (run > 0 ? 1 : 0), { lights: run > 0 ? 1 : o.lights || 0 });
      flywheel(q, run > 0 ? s.beat * PI * 0.5 * (o.speed || 1) : 0.3);
      // 传送带表面（条纹随步进移动）
      const [b0, b1] = WS.belt, y = WS.beltY, off = run > 0 ? ((bb.b >= 0 ? floor(bb.b) + bb.mv : 0) * PITCH) % 40 : 0;
      q.fillStyle = '#4f6a70'; q.fillRect(b0 - 20, y - 4, b1 - b0 + 40, 24);
      q.fillStyle = 'rgba(255,255,255,0.14)'; for (let x = b0 - 20 + off; x < b1 + 20; x += 40) q.fillRect(x, y - 4, 4, 24);
      q.strokeStyle = '#1f2a30'; q.lineWidth = 2; q.strokeRect(b0 - 20, y - 4, b1 - b0 + 40, 24);
      if (o.mid) o.mid(q, bb);
      // 瓶子
      if (o.bottles !== false) for (const B of bb.list) { if (o.skipBottle && o.skipBottle(B)) continue; bottle(q, s, B.x, y - 4, 76, 0, { fl: B.fl, cap: B.cap, fill: B.fill }); }
      // 灌装嘴与液柱
      const drop = run > 0 ? (bb.u < 0.45 ? sin(PI * clamp(bb.u / 0.45)) : 0) : 0;
      if (run > 0 && drop > 0.3) for (const B of bb.list) if (B.station >= 0) {
        const F = FLAVOR[FLAVORS[B.station]], ny = WS.nozzleY + drop * 22 + 12, by = y - 4 - 76 * lerp(0.03, 0.57, B.fill);
        q.fillStyle = F.bot; q.fillRect(B.x - 3.5, ny, 7, by - ny); q.fillStyle = 'rgba(255,255,255,0.5)'; q.fillRect(B.x - 1.5, ny, 2, by - ny);
        bubble(q, B.x + sin(s.t * 20 + B.i) * 4, by - 4, 5, 0.8, 'fizz');
      }
      nozzles(q, drop);
      capPress(q, run > 0 ? (bb.u < 0.12 ? sin(PI * bb.u / 0.24) : bb.u < 0.3 ? 1 - (bb.u - 0.12) / 0.18 : 0) : 0, run);
      if (o.front) o.front(q, bb);
    });
    const lit = LC(s, 'sh-light', 3400, 1700, (q) => { q.translate(500, 300); shopLight(q); }, 0.2);
    inCam(g, cam, 1, (q) => { const m = q.globalCompositeOperation; q.globalCompositeOperation = 'multiply'; q.drawImage(lit, 0, 0, min(lit.width, 3400 * s.k * 0.2), min(lit.height, 1700 * s.k * 0.2), -500, -300, 3400, 1700); q.globalCompositeOperation = m; });
    inCam(g, cam, 1, (q) => { if (o.beams !== false) shopBeams(q, t, o.beamA ?? 1); if (o.after) o.after(q, bb); });
  }

  /* ---------- 门开了（32.38 → 34.52）：羊塔一头栽进来 → 抬头：一整台灌装机 ---------- */
  function shotInside(g, s) {
    const t = s.t, lt = s.lt;
    const open = clamp(lt / 0.42);
    const path = (u) => { const pan = ease.inOut(clamp((u - 1.05) / 1.05)); return { x: lerp(470, 1060, pan), y: lerp(700, 585, pan), z: lerp(1.8, 1.12, pan) }; };
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 21, 3, 0.4));
    const tip = clamp((lt - 0.46) / 0.42), th = ease.in(tip) * PI * 0.47, impact = lt - 0.88;
    const x0 = (WS.door[0] + WS.door[1]) / 2 + 10;
    shopScene(g, s, cam, {
      key: 'in', base: B, res: B.res, door: open, run: 0, beamA: 1.25,
      front: (q) => {
        // 门口的羊塔（逆光剪影 + 轮廓光）→ 整座塔往屋里倒 → 摔散
        let hAcc = 0;
        for (let j = 0; j < 7; j++) {
          const L = GANG[TOWER[j]], V = 46 * L.sc, h = hAcc; hAcc += V * 0.7;
          if (impact < 0) {
            const wob = (1 - tip) * sin(t * 9) * 0.04 * (j / 6);
            const x = x0 + sin(th + wob) * h, y = FL - cos(th + wob) * h;
            const back = open > 0.2 && tip < 0.5;
            const sk = SD_LAMB[L.k];
            if (back && sdOK(sk)) SDK().draw(q, sk, { x, y, scale: sdScale(sk, V), anim: 'Idle', rot: th + wob, t, sil: '#7a4a6a', rim: { color: '255,244,220', amount: 1 } });
            else if (back) cast(q, 'sheep-pink', Object.assign({ x, y, h: sheepH(L.k, 'stand', V), pose: 'stand', rot: th + wob, t, expr: 'surprise', sil: '#7a4a6a', rim: '255,244,220', rimW: 1.6 }, LAMB[L.k][1]));
            else lamb(q, s, x, y, V, { kind: L.k, pose: 'jump', rot: th + wob, expr: 'surprise' });
            continue;
          }
          // 摔在地上：从倒下的位置弹开
          const lx = x0 + sin(th) * h, ly = FL - cos(th) * h;
          const b = bounce(impact, lx, min(FL + 10, ly), 60 + j * 70 + hash(6, j) * 60, -320 - hash(5, j) * 240, FL + 16 + (j % 3) * 16, 2600, 0.38, 0.55);
          const look = lt > 1.15;
          lamb(q, s, b.x, b.y, V, { kind: L.k, pose: look ? 'look-up' : b.n === 0 ? 'jump' : 'stand', spin: look || b.n > 0 ? 0 : impact * (5 + j), sq: b.sq, expr: look ? 'surprise' : 'happy', fx: look && j % 2 === 0 ? ['stars'] : null, flip: false });
          shadow(q, b.x, FL + 18 + (j % 3) * 16, V, 0.45);
        }
        if (impact > 0 && impact < 0.6) { const k = impact / 0.6; for (let i = 0; i < 6; i++) withAlpha(q, (1 - k) * 0.6, (qq) => qq.drawImage(puffSpr(i, '240,210,190'), x0 + 60 + i * 50 - k * 40, FL - 30 - k * 40, 120 + k * 80, 50 + k * 30)); sfx(q, '咚！', x0 + 260, FL - 190, 56, clamp(impact / 0.12), { color: '#ffffff', rot: -0.1, alpha: 1 - clamp((impact - 0.4) / 0.2) }); }
        if (lt > 1.15) sparkles(q, t, 12, 44, '255,246,210', { x: 600, y: 250, w: 1300, h: 460, r: 18 });
      },
    });
    s.post.vignette(g, 0.36);
  }

  /* ---------- 拉杆（34.52 → 36.64）：带头的跳上管子、吊在拉杆上，一只抓一只……“咔嚓”！ ---------- */
  function shotLever(g, s) {
    const t = s.t, lt = s.lt, b = bt0(s);
    const clunk = 36.1 - s.shot.t0, ck = lt - clunk;
    const cam = { x: 360, y: 700, z: 2.7, ...hand(s, 23, 3, 0.4), ...(ck > 0 ? shake(s, 10 * exp(-ck * 5), 9, 22) : {}) };
    const [lx, ly] = WS.lever;
    // 拉杆慢慢被坠下来，36.1 一下拉到底
    const pull = ck > 0 ? 1 : clamp((b - 3) / 4) * 0.28;
    shopScene(g, s, cam, {
      key: 'lever', base: { x: 360, y: 700, z: 2.7 }, res: 1.03, door: 1, run: 0, lever: ck > 0 ? ease.back(clamp(ck / 0.12)) : pull, lights: ck > 0 ? clamp(ck / 0.3) : 0, gauge: ck > 0 ? 0.12 + 0.3 * ease.out(clamp(ck / 0.4)) : 0.12,
      front: (q) => {
        const ang = lerp(-PI / 2 - 0.55, -PI / 2 + 1.25, ck > 0 ? 1 : pull);
        const hx = lx + cos(ang) * 96, hy = ly + sin(ang) * 96;
        // 一串吊着的小羊（带头的在最上面，一拍多一只）
        const n = ck > 0 ? 0 : min(7, 1 + max(0, floor(b - 1.2)));
        for (let j = 0; j < 7; j++) {
          const L = GANG[TOWER[6 - j]], V = 46 * L.sc;
          if (ck > 0) {
            // 掉下来，摔成一堆
            const a = ck, b2 = bounce(a, hx + j * 6, hy + 30 + j * V * 0.75, (j - 3) * 60, 0, FL - 6 - (j % 2) * 8, 2600, 0.35, 0.6);
            lamb(q, s, b2.x, b2.y, V, { kind: L.k, pose: b2.n === 0 ? 'jump' : 'stand', spin: b2.n === 0 ? a * (4 + j) : 0, sq: b2.sq, expr: 'surprise' });
            continue;
          }
          if (j >= n) {
            // 还在地上的：按拍子往上蹦，想抓住上一只的脚
            const [hh, sq] = hop(fract(b * 2 + j * 0.3));
            lamb(q, s, lx + 60 + j * 34, FL - 4 - hh * 40, V, { kind: L.k, pose: 'jump', sq, expr: 'happy', flip: true });
            continue;
          }
          const swing = sin(t * 4 + j * 0.6) * 0.18 * (j + 1) / 7;
          const x = hx + sin(swing) * j * V * 0.8, y = hy + 42 + j * V * 0.72;
          lamb(q, s, x, y, V, { kind: L.k, pose: 'jump', rot: swing, expr: j === 0 ? 'determined' : 'surprise', fx: j === 0 ? ['sweat'] : null, flip: false });
        }
        if (ck > 0) { sfx(q, '咔嚓！', lx + 150, ly - 170, 64, clamp(ck / 0.15), { color: '#fff27a', rot: -0.12 }); sparkle(q, hx, hy, 80 * (1 - clamp(ck / 0.5)) + 10, 1.4 * (1 - clamp(ck / 0.5)), 0, '255,240,190'); }
      },
    });
    if (ck > 0) s.post.fill(g, '#fff4e0', 0.5 * exp(-ck * 6) * flashK(s), 'lighter');
    s.post.vignette(g, 0.4);
  }

  /* =========================================================
   * 流水线（满段 36.64 → 70.61）
   * ========================================================= */
  /** 蒸汽：births = 出生时刻（秒），每团往上飘、变大、变淡 */
  function steam(q, t, x, y, births, o = {}) {
    for (let i = 0; i < births.length; i++) {
      const a = t - births[i]; if (a < 0 || a > (o.life || 1.3)) continue;
      const k = a / (o.life || 1.3);
      for (let j = 0; j < 4; j++) {
        const r = (o.r || 40) * (0.6 + k * 1.6) * (0.8 + 0.3 * hash(i, j)), dx = (hash(i, j, 2) - 0.5) * 60 * k + (o.drift || 0) * a;
        withAlpha(q, (1 - k) * 0.75, (qq) => qq.drawImage(puffSpr(i + j, '255,255,255'), x + dx - r, y - a * (o.rise || 160) - j * 14 - r * 0.5, r * 2, r));
      }
    }
  }
  const beatTimes = (s, from, to, step = 1) => { const out = []; const b0 = floor(s.T.beatAt(from)); for (let b = b0; ; b += step) { const tt = s.T.beatTime(b); if (tt > to) break; if (tt >= from - 1.5) out.push(tt); } return out; };
  /** 骑在瓶子上的小羊（瓶盖顶上）：B = 传送带上的瓶子 */
  const BOTTLE_TOP = WS.beltY - 4 - 76 * 0.97;
  /** 小羊头上顶着的红瓶盖（被压盖机压的） */
  function capHat(q, s, G, r, t) { bottleCap(q, s, G.top[0] - G.f * r * 0.1, G.top[1] + r * 0.2, r, -G.f * 0.25 + sin(t * 3) * 0.05, 0.55); }

  /* ---------- 流水线启动（36.64 → 38.76）：整台机器活过来了 ---------- */
  function shotMachine(g, s) {
    const t = s.t, lt = s.lt, b = bt0(s);
    const hit = 37.70 - s.shot.t0, hk = lt - hit;
    const path = (u) => ({ x: lerp(1120, 1160, u / 2.12), y: lerp(575, 560, u / 2.12), z: lerp(1.0, 1.1, ease.out(clamp(u / 2.12))) });
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 25, 3, 0.4), hk > 0 ? shake(s, 8 * exp(-hk * 5), 13, 24) : {});
    shopScene(g, s, cam, {
      key: 'mach', base: B, res: B.res, door: 1, run: 1, gauge: 0.34 + 0.04 * sin(t * 3),
      front: (q, bb) => {
        // 骑在瓶子上的小羊
        let j = 0;
        for (const Bt of bb.list) {
          if (Bt.i % 3 !== 0 || j > 2) continue;
          const L = GANG[[3, 5, 1][j++]], duck = Bt.capping ? 0.5 : 0, [hy, sq] = hop(fract(s.beat + j * 0.33));
          lamb(q, s, Bt.x, BOTTLE_TOP - hy * 16, 40 * L.sc, { kind: L.k, pose: hy > 0.3 ? 'jump' : 'stand', sq: sq * 0.6 + duck, expr: 'happy' });
        }
        // 站在糖浆罐顶上欢呼的两只
        for (const [x, k, ph] of [[790, 'boss', 0], [1120, 'geek', 0.5]]) { const [hy, sq] = hop(fract(s.beat + ph)); lamb(q, s, x, 346 - hy * 40, 44, { kind: k, pose: hy > 0.3 ? 'jump' : 'stand', sq, expr: 'happy', flip: x > 1000 }); }
        // 地上转圈的两只
        for (const [x, k, ph] of [[1640, 'bell', 0.25], [1760, 'pink', 0.75]]) { const [hy, sq] = hop(fract(s.beat * 2 + ph)); lamb(q, s, x + sin(t * 3 + ph * 6) * 30, FL + 6 - hy * 30, 44, { kind: k, pose: hy > 0.3 ? 'jump' : 'stand', sq, expr: 'happy', flip: cos(t * 3 + ph * 6) < 0 }); shadow(q, x + sin(t * 3 + ph * 6) * 30, FL + 8, 50, 0.4); }
        steam(q, t, 510, 240, beatTimes(s, s.shot.t0 - 1, t), { r: 36, rise: 150 });
        if (hk > 0) { steam(q, t, 510, 240, [s.shot.t0 + hit, s.shot.t0 + hit + 0.05], { r: 90, rise: 260, life: 1.6 }); sfx(q, '噗——', 640, 150, 58, clamp(hk / 0.15), { color: '#ffffff', rot: -0.1, alpha: 1 - clamp((hk - 0.6) / 0.3) }); }
        risingBubbles(q, t, { n: 24, seed: 71, x: 700, w: 520, y0: 580, h: 420, r: 4, grow: 8, a: 0.8 });
      },
    });
    if (hk > 0) s.post.fill(g, '#fff6ea', 0.35 * exp(-hk * 6) * flashK(s), 'lighter');
    s.post.vignette(g, 0.34);
  }

  /* ---------- 灌装（38.76 → 40.89）：四个灌装嘴一拍一灌，灌出彩虹汽水 ---------- */
  function shotFill(g, s) {
    const t = s.t, lt = s.lt;
    const path = (u) => ({ x: lerp(935, 985, u / 2.12), y: 600, z: 2.75, r: -0.03 });
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 27, 3, 0.4));
    shopScene(g, s, cam, {
      key: 'fill', base: B, res: B.res, door: 1, run: 1, gauge: 0.38,
      mid: (q) => {
        // 管子上的四个小阀门轮（“工程师”在上面拧）
        WS.syrup.forEach((x, i) => { q.save(); q.translate(x + 30, 300); q.rotate(s.beat * PI * (i % 2 ? -0.5 : 0.5)); q.strokeStyle = '#e0303a'; q.lineWidth = 5; q.beginPath(); q.arc(0, 0, 14, 0, TAU); q.stroke(); q.lineWidth = 3; q.beginPath(); q.moveTo(-14, 0); q.lineTo(14, 0); q.moveTo(0, -14); q.lineTo(0, 14); q.stroke(); q.restore(); });
      },
      front: (q, bb) => {
        const k = floor(s.beat) % 4, x = WS.syrup[k] + 30, [hy, sq] = hop(fract(s.beat));
        lamb(q, s, x - 30 + sin(fract(s.beat) * PI) * 10, 346 - hy * 26, 46, { kind: 'geek', pose: hy > 0.3 ? 'jump' : 'push', sq, expr: 'happy', flip: k % 2 === 1 });
        // 骑瓶子的小羊经过，被溅了一身
        for (const Bt of bb.list) if (Bt.i % 4 === 1) {
          const [hh, sq2] = hop(fract(s.beat * 2 + Bt.i * 0.3));
          lamb(q, s, Bt.x, BOTTLE_TOP - hh * 10, 40, { kind: Bt.i % 8 === 1 ? 'bell' : 'pink', pose: 'stand', sq: sq2 * 0.5, expr: Bt.station >= 0 ? 'closed' : 'happy', fx: Bt.station >= 0 ? ['sweat'] : null });
        }
        sparkles(q, t, 8, 72, '255,246,220', { x: 700, y: 360, w: 500, h: 300, r: 12 });
      },
    });
    s.post.vignette(g, 0.36);
  }

  /* ---------- 压盖（40.89 → 43.01）：压盖机一拍一“咔嚓”；带头的骑在压头上，一只在飞轮里跑 ---------- */
  function shotCap(g, s) {
    const t = s.t, lt = s.lt;
    const path = (u) => ({ x: lerp(1400, 1430, u / 2.12), y: 540, z: 2.95, r: 0.04 });
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 29, 3, 0.4), shake(s, 3 * s.pulse(8), 31, 30));
    shopScene(g, s, cam, {
      key: 'cap', base: B, res: B.res, door: 1, run: 1, gauge: 0.42,
      front: (q, bb) => {
        const u = bb.u, p = u < 0.12 ? sin(PI * u / 0.24) : u < 0.3 ? 1 - (u - 0.12) / 0.18 : 0, hy = 470 + p * 42;
        // 骑在压头上的带头小羊（压下时被挤扁）
        lamb(q, s, WS.capX + 4, hy, 50, { kind: 'boss', pose: 'stand', sq: p * 0.7, expr: p > 0.5 ? 'closed' : 'happy', t });
        // 飞轮里的仓鼠……小羊
        const [fx, fy, fr] = WS.fly;
        lamb(q, s, fx, fy + fr - 12, 42, { kind: 'pink', pose: 'run', wspd: 3, expr: 'happy', flip: false, t });
        for (const acc of [40.88, 41.94, 42.35, 42.74]) { const a = t - acc; if (a > 0 && a < 0.45) { sfx(q, '咔嚓', WS.capX + 120, 420, 34, clamp(a / 0.1), { color: '#fff27a', rot: 0.12, alpha: 1 - clamp((a - 0.3) / 0.15) }); sparkle(q, WS.capX, 590, 40 * (1 - a / 0.45), 1.2 * (1 - a / 0.45), 0, '255,240,190'); } }
      },
    });
    s.post.vignette(g, 0.36);
  }

  /* ---------- 坐传送带（43.01 → 45.13）：小羊们排成一列坐在瓶子上“开火车”；经过压盖机的那只头上多了个瓶盖 ---------- */
  function shotRide(g, s) {
    const t = s.t, lt = s.lt;
    // 跟着第 n0 号附近的那列瓶子走（相机平滑跟随平均速度）
    const lead = (u) => { const tt = s.shot.t0 + u; return 900 + (s.T.beatAt(tt) - s.T.beatAt(s.shot.t0)) * PITCH; };
    const path = (u) => ({ x: lead(u) + 40, y: 610, z: 3.2, r: -0.035 });
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 33, 3, 0.5));
    shopScene(g, s, cam, {
      key: 'ride', base: B, res: B.res, door: 1, run: 1, gauge: 0.45,
      front: (q, bb) => {
        const vr = visRange(cam, 1);
        let j = 0;
        for (const Bt of bb.list) {
          if (Bt.x < vr[0] - 60 || Bt.x > vr[1] + 60) continue;
          const L = GANG[j % 7]; j++;
          const pc = (Bt.x - WS.capX) / PITCH, capped = pc > 0.02 || (abs(pc) < 0.02 && bb.u > 0.1);
          const duck = Bt.capping ? 0.6 : 0;
          const V = 40 * L.sc, y = BOTTLE_TOP;
          lamb(q, s, Bt.x, y, V, { kind: L.k, pose: 'stand', sq: duck + (bb.mv > 0 && bb.mv < 1 ? -0.1 : 0), expr: Bt.station >= 0 ? 'closed' : duck ? 'surprise' : 'happy', rot: bb.mv > 0 && bb.mv < 1 ? -0.08 : 0 });
          if (capped) { const Gc = lambGeo(L.k, 'stand', V, Bt.x, y, false, duck); if (!Gc.sd) capHat(q, s, Gc, V * 0.22, t); }
        }
      },
    });
    s.post.vignette(g, 0.36);
  }

  /* ---------- 开瓶合唱（45.13 → 47.25）：一排小羊抱着瓶子，八分音符一个接一个“啵” ---------- */
  function shotPopline(g, s) {
    const t = s.t, lt = s.lt;
    const path = (u) => ({ x: lerp(1880, 1960, u / 2.12), y: 880, z: 3.2 });
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 35, 3, 0.4));
    shopScene(g, s, cam, {
      key: 'popl', base: B, res: B.res, door: 1, run: 1, gauge: 0.48, bottles: true,
      front: (q) => {
        for (let j = 0; j < 7; j++) {
          const L = GANG[j], V = 46 * L.sc, x = 1560 + j * 122, y = FL + 24 + (j % 2) * 12;
          const pt = j * BEAT / 2 + 0.02, a = lt - pt, popped = a > 0;
          const bump = a > 0 && a < 0.2 ? sin(PI * a / 0.2) : 0;
          // 瓶子立在小羊前面（瓶子比小羊还高）
          lamb(q, s, x - 26, y, V, { kind: L.k, pose: 'stand', sq: bump * 0.5, rot: -bump * 0.2, expr: popped ? 'happy' : 'neutral', fx: !popped && a > -0.6 ? ['stars'] : null });
          const fl = FLAVORS[j % 4];
          bottle(q, s, x + 14, y + 4, 80, 0.05, { fl, cap: !popped });
          shadow(q, x - 10, y + 4, 70, 0.4);
          if (popped) {
            const [mx, my] = bottleMouth(x + 14, y + 4, 80, 0.05);
            // 瓶盖飞上天（打着转）
            const cy = my - a * 700 + a * a * 900, cx = mx + a * (j % 2 ? 120 : -90);
            if (a < 1.2) bottleCap(q, s, cx, cy, 13, a * 14, 0.4 + 0.5 * abs(sin(a * 9)));
            fizz(q, t, { t0: s.shot.t0 + pt, x: mx, y: my, n: 18, dur: 1.2, speed: 380, r: 8, rise: 120, life: 1.2, spread: 0.5, seed: 200 + j, kind: 'soap' });
            spray(q, t, { t0: s.shot.t0 + pt, x: mx, y: my, n: 14, dur: 0.25, speed: 420, spread: 0.9, life: 0.9, r: 5, color: fl, seed: 300 + j });
            if (a < 0.4) sfx(q, '啵', mx + 10, my - 60 - a * 80, 30, clamp(a / 0.08), { color: '#ffffff', rot: (j % 2 ? 0.2 : -0.2), alpha: 1 - clamp((a - 0.25) / 0.15) });
          }
        }
      },
    });
    s.post.vignette(g, 0.36);
  }

  /* ---------- 咕嘟咕嘟 → 嗝！（47.25 → 49.91）：一口气喝光，整齐地打了个嗝，泡泡圈冲出去 ---------- */
  function bubbleRing(q, x, y, R, a, n = 16, seed = 1) {
    for (let i = 0; i < n; i++) { const an = (i / n) * TAU + hash(seed, i) * 0.3; bubble(q, x + cos(an) * R, y + sin(an) * R * 0.85, R * 0.12 * (0.6 + 0.8 * hash(seed, i, 2)), a, 'soap'); }
  }
  function shotBurp(g, s) {
    const t = s.t, lt = s.lt;
    const burp = 49.376, bk = t - burp;
    const cam = { x: 1905 + (bk > 0 ? 0 : lt * 8), y: 890, z: 4.0, ...hand(s, 37, 2, 0.4), ...(bk > 0 ? shake(s, 14 * exp(-bk * 5), 39, 26) : {}) };
    shopScene(g, s, cam, {
      key: 'burp', base: { x: 1910, y: 890, z: 4.0 }, res: 1.03, door: 1, run: 1, gauge: 0.5,
      front: (q) => {
        const drink = clamp((t - 47.4) / 1.8);
        for (let j = 0; j < 4; j++) {
          const L = GANG[[0, 1, 3, 6][j]], V = 50 * L.sc, x = 1740 + j * 108, y = FL + 20 + (j % 2) * 10;
          const G = lambGeo(L.k, 'stand', V, x, y, false);
          const puffUp = bk > 0 ? max(0, 1 - bk * 2.5) : sst(0.6, 1, drink) * 0.2;
          lamb(q, s, x, y, V, { kind: L.k, pose: bk > 0 ? 'jump' : 'look-up', sq: -puffUp, expr: bk > 0 ? 'happy' : 'closed', fx: bk < 0 && drink > 0.7 ? ['cheeks'] : null, t });
          if (bk < 0) {
            // 抱着瓶子仰头喝：瓶口对着嘴
            const rot = -2.2 + sin(t * 3 + j) * 0.05, bh = 70;
            const mx = G.mouth[0] + 4, my = G.mouth[1] - 4, bx2 = mx - sin(rot) * bh * 0.92, by2 = my + cos(rot) * bh * 0.92;
            bottle(q, s, bx2, by2, bh, rot, { fl: FLAVORS[j], fill: 1 - drink * 0.95 });
            if (drink > 0.1 && drink < 0.95) for (let k = 0; k < 2; k++) { const ph = fract(t * 2 + k * 0.5 + j * 0.2); bubble(q, mx - 6 + ph * 10, my - ph * 30, 3 + ph * 3, sin(PI * ph) * 0.8, 'fizz'); }
          } else if (bk < 1.2) bottle(q, s, x + 50, y + 2, 64, PI / 2 * 0.9, { fl: FLAVORS[j], fill: 0.05 });
          shadow(q, x, y + 4, V * 1.2, 0.4);
          if (bk > 0) for (let r = 0; r < 3; r++) { const a = bk - r * 0.08; if (a > 0 && a < 1.2) bubbleRing(q, G.mouth[0] + 20 + a * 260, G.mouth[1] - a * 40, 16 + a * 120, (1 - a / 1.2) * 0.9, 14, 40 + j * 3 + r); }
        }
        if (bk < 0 && lt > 0.3) for (let i = 0; i < 2; i++) { const ph = fract(t * 1.9 + i * 0.5); sfx(q, '咕嘟', 1790 + i * 190, 800 - ph * 20, 22, 1, { color: '#bdf6ff', rot: -0.1, alpha: sin(PI * ph) }); }
        if (bk > 0) sfx(q, '嗝——！', 1915, 792, 48, clamp(bk / 0.12), { color: '#fff27a', rot: -0.06, alpha: 1 - clamp((bk - 0.45) / 0.1) });
      },
    });
    if (bk > 0) s.post.fill(g, '#fff2fa', 0.3 * exp(-bk * 7) * flashK(s), 'lighter');
    s.post.vignette(g, 0.36);
  }

  /** 飞起来的草帽（自己画的；角色库里的草帽是长在头上的） */
  function strawHat(q, x, y, w, rot, tilt = 0.32) {
    q.save(); q.translate(x, y); q.rotate(rot);
    q.fillStyle = '#f0d58c'; q.strokeStyle = '#8a6a30'; q.lineWidth = max(1.5, w * 0.018);
    q.beginPath(); q.ellipse(0, 0, w / 2, (w / 2) * tilt, 0, 0, TAU); q.fill(); q.stroke();
    q.fillStyle = '#f6e2a4'; q.beginPath(); q.moveTo(-w * 0.26, 0); q.bezierCurveTo(-w * 0.27, -w * 0.32, w * 0.27, -w * 0.32, w * 0.26, 0); q.quadraticCurveTo(0, w * 0.08, -w * 0.26, 0); q.fill(); q.stroke();
    q.fillStyle = '#e0424e'; q.beginPath(); q.moveTo(-w * 0.262, -w * 0.02); q.quadraticCurveTo(0, w * 0.06, w * 0.262, -w * 0.02); q.lineTo(w * 0.266, -w * 0.085); q.quadraticCurveTo(0, -0.005 * w, -w * 0.266, -w * 0.085); q.closePath(); q.fill();
    q.strokeStyle = 'rgba(138,106,48,0.45)'; q.lineWidth = max(1, w * 0.008); for (let k = -3; k <= 3; k++) { q.beginPath(); q.moveTo(k * w * 0.07, -w * 0.2 + abs(k) * w * 0.012); q.quadraticCurveTo(k * w * 0.08, -w * 0.1, k * w * 0.09, -w * 0.06); q.stroke(); }
    q.restore();
  }
  /* ---------- 帽子（49.91 → 51.51）：泡泡圈飘到老板鼻尖上，“啵”——草帽飞了 ---------- */
  function shotHat(g, s) {
    const t = s.t, lt = s.lt;
    const pop = 0.62, pk = lt - pop;
    const cam = { x: 760, y: 640, z: 2.45, ...hand(s, 41, 3, 0.4), ...(pk > 0 ? shake(s, 5 * exp(-pk * 6), 43, 22) : {}) };
    const vo = { x: ST.stool, y: SG, h: 400, pose: 'sit', seat: 100, arms: pk > 0 ? 'cover' : 'lap', t, expr: pk > 0 ? 'surprise' : 'closed', headPose: pk > 0 ? null : 'sleep', look: pk > 0 ? [1, -0.2] : [0.4, 0.3] };
    standScene(g, s, cam, {
      key: 'hat', base: { x: 760, y: 640, z: 2.45 }, res: 1.03,
      mid: (q) => {
        // 店主在长凳上睡着；泡泡圈在她鼻尖上“啵”地破了——她一骨碌坐起来（Sleep → Relax 交叉淡化，站到长凳前）
        let face;
        if (sdOK(SNOW)) {
          const k = pk > 0 ? ease.out(clamp(pk / 0.32)) : 0, h = 370;
          const x0 = BENCH.x + 4, y0 = BENCH.top - 4, x1 = BENCH.x - 150, y1 = SG + 8;
          const hop = pk > 0 && pk < 0.5 ? sin(PI * pk / 0.5) * 50 : 0;
          const so = { x: lerp(x0, x1, k), y: lerp(y0, y1, k) - hop, h, from: 'Sleep', to: 'Relax', k, flip: false, t };
          snow(q, s, so);
          const A = snowA(s, so); face = A && A.face ? A.face : [x0 - h * 0.2, y0 - h * 0.12];
          if (pk < 0) for (let i = 0; i < 3; i++) { const ph = fract(t * 0.55 + i / 3); withAlpha(q, sin(PI * ph) * 0.9, (qq) => E.text(qq, 'z', face[0] - 30 - ph * 50 - i * 8, face[1] - 60 - ph * 70, { font: 'hand', size: 18 + ph * 22, color: '#ffffff', stroke: 'rgba(60,40,90,0.55)', strokeW: 5 })); }
        } else {
          vendor(q, Object.assign({ nohat: pk > 0 && pk < 1.0 }, vo));
          face = anchor(vendorKey() || 'crowd', vo, 'face', [ST.stool + 30, SG - 300]);
        }
        // 从右边（工坊）飘过来的泡泡圈
        for (let r = 0; r < 4; r++) {
          const a = lt + 0.9 - r * 0.28, u = clamp(a / 1.5);
          if (a < 0) continue;
          const x = lerp(1400, face[0] + 10, u) + sin(a * 5 + r) * 12, y = lerp(560, face[1] + 8, u) + sin(a * 3) * 16;
          if (r === 0 && pk > 0) { popBurst(q, face[0] + 10, face[1] + 8, 90, clamp(pk / 0.5), 51); continue; }
          if (r > 0 && pk > r * 0.1) continue;
          bubbleRing(q, x, y, 38 - r * 4, 0.9, 12, 60 + r);
        }
        if (pk > 0) { sfx(q, '啵！', face[0] + 110, face[1] - 120, 44, clamp(pk / 0.1), { color: '#ffffff', rot: 0.15, alpha: 1 - clamp((pk - 0.5) / 0.2) }); sfx(q, '？！', face[0] + 150, face[1] - 40, 56, clamp((pk - 0.2) / 0.15), { color: '#fff27a', rot: -0.1 }); }
      },
    });
    s.post.vignette(g, 0.34);
  }

  /* ---------- 老板的视角（51.51 → 53.63）：一排汽水瓶自己从工坊里飘出来，排着队走 ---------- */
  function carryLine(s, t, t0, o = {}) {
    // 队伍：从工坊门口（x≈1780）出来，沿木栈道往左走；返回每只的 { x, y, V, L, bob, frame }
    const out = [], v = o.v || 110, V0 = 46;
    for (let j = 0; j < 7; j++) {
      const L = GANG[j], V = V0 * L.sc, a = t - t0 - j * BEAT;
      const x = 1784 - max(0, a) * v - (a < 0 ? 0 : 0), y = SG + 26 + (j % 2) * 8;
      if (a < -0.2) continue;
      const bob = abs(sin((t - t0) * PI / BEAT + j * 0.7));
      out.push({ j, L, V, x, y, a, bob, wspd: v / gaitV('run', V) });
    }
    return out;
  }
  function shotPovFloat(g, s) {
    const t = s.t, lt = s.lt;
    const path = (u) => ({ x: lerp(1600, 1520, u / 2.12), y: 720, z: 1.85 });
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 45, 5, 0.7));
    standScene(g, s, cam, {
      key: 'povf', base: B, res: B.res,
      mid: (q) => {
        // 门开着（门缝里黑）
        q.fillStyle = '#1a2a30'; q.fillRect(ST.door[0], ST.door[2], 26, SG - ST.door[2]);
        for (const P of carryLine(s, t, s.shot.t0 - 0.6)) {
          const G = lambGeo(P.L.k, 'run', P.V, P.x, P.y, true);
          const bk = G.back || G.top, bx = bk[0] + 6, by = bk[1] + 6 - P.bob * 8;
          // 看不见的小羊：一丝粉色热浪
          lamb(q, s, P.x, P.y - P.bob * 6, P.V, { kind: P.L.k, pose: 'run', flip: true, alpha: 0.1, wspd: P.wspd });
          bottle(q, s, bx, by, 72, sin(t * 4 + P.j) * 0.12, { fl: FLAVORS[P.j % 4] });
          if (hash(47, P.j) < 0.6) sparkle(q, P.x, P.y - P.V * 0.5, 10, 0.5 + 0.3 * sin(t * 8 + P.j), t, '255,190,225');
        }
      },
    });
    s.post.vignette(g, 0.62);
  }

  /* ---------- 我们看见的（53.63 → 55.74）：小羊们头顶着汽水排成一列，一颠一颠地走 ---------- */
  function shotCarry(g, s) {
    const t = s.t, lt = s.lt;
    const t0 = D[24] - 0.6;
    const path = (u) => ({ x: lerp(1400, 1250, u / 2.12), y: 700, z: 2.2 });
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 47, 3, 0.4));
    const vo = { x: 1080, y: SG - 6, h: 400, pose: 'wipe', t, expr: 'surprise', look: [1, 0.2] };
    standScene(g, s, cam, {
      key: 'carry', base: B, res: B.res, noStool: true,
      mid: (q) => {
        stool(q);
        // 店主（醒了）站在柜台边，揉着眼睛朝右边看——看见的只是一排自己往外飘的汽水
        snow(q, s, { x: 1178, y: SG - 2, h: 390, anim: 'Relax', flip: false, fb: vo });
        for (const P of carryLine(s, t, t0)) {
          const y = P.y - P.bob * 6;
          lamb(q, s, P.x, y, P.V, { kind: P.L.k, pose: 'run', flip: true, wspd: P.wspd, expr: 'happy', sq: -P.bob * 0.08 });
          const G = lambGeo(P.L.k, 'run', P.V, P.x, y, true);
          const bk = G.back || G.top; bottle(q, s, bk[0] + 6, bk[1] + 8, 72, sin(t * 4 + P.j) * 0.12, { fl: FLAVORS[P.j % 4] });
          shadow(q, P.x, P.y + 2, P.V * 1.1, 0.45);
        }
      },
    });
    s.post.vignette(g, 0.34);
  }

  /* ---------- 抢不到（55.74 → 60.00）：老板去抓“飘着的”汽水，小羊们隔着他的头扔来扔去 ---------- */
  function shotKeepaway(g, s) {
    const t = s.t, lt = s.lt, b = bt0(s);
    const path = (u) => ({ x: lerp(900, 930, u / 4.25), y: 680, z: 2.1 });
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 49, 4, 0.5));
    const LX = 640, RX = 1180, VX = 905;
    // 每拍一次抛接：[从, 到, 高度]
    const throws = [[LX, RX, 330], [RX, LX, 60], [LX, RX, 280], [RX, LX, 300], [LX, RX, 200], [RX, LX, 200], [LX, VX + 40, 120], [VX + 40, LX - 80, 160]];
    const bi = clamp(floor(b), 0, 7), u = clamp(fract(b)), T = throws[bi];
    const bxp = lerp(T[0], T[1], u), byp = SG - 70 - sin(PI * u) * T[2];
    // 老板：跟着瓶子转身、伸手、原地转圈、扑空、一屁股坐下
    let vpose = 'reach-up', vflip = bxp < VX, vexpr = 'determined', vlook = [bxp < VX ? -0.8 : 0.8, -0.6];
    if (bi === 1) { vpose = 'crouch'; vlook = [bxp < VX ? -1 : 1, 0.8]; }
    if (bi === 4 || bi === 5) { vpose = 'twirl'; vexpr = 'surprise'; }
    if (bi === 6) { vpose = 'reach'; vexpr = 'laugh'; vlook = [-1, 0]; vflip = true; }
    if (bi === 7) { vpose = 'sit-ground'; vexpr = 'sad'; vlook = [0, -0.5]; }
    standScene(g, s, cam, {
      key: 'keep', base: B, res: B.res,
      mid: (q) => {
        // 店主：跟着瓶子转身（Relax）→ 原地转圈（Move，左右翻面）→ 伸手（Interact）→ 扑了个空，一下子躺平（Sleep）
        const fbo = { x: VX, y: SG + 20, h: 400, pose: vpose, t, expr: vexpr, look: vlook, flip: vflip, aim: 0.3 };
        const H = 390;
        if (bi === 7) snow(q, s, { x: VX + 40, y: SG + 26, h: H, anim: 'Sleep', flip: true, fb: fbo });
        else if (bi === 4 || bi === 5) snow(q, s, { x: VX, y: SG + 20, h: H, anim: 'Move', speed: 1.6, flip: floor(t * 9) % 2 === 0, fb: fbo });
        else snow(q, s, { x: VX, y: SG + 20, h: H, anim: bi === 6 ? 'Interact' : 'Relax', flip: vflip, fb: fbo });
        const hx = sdOK(SNOW) ? VX + 40 + H * 0.3 : VX, hy = sdOK(SNOW) ? SG - H * 0.28 : SG - 330;
        if (bi === 7) for (let i = 0; i < 4; i++) { const an = t * 4 + i * PI / 2; sparkle(q, hx + cos(an) * 60, hy + sin(an) * 18, 16, 0.9, an, '255,240,160'); }
        // 两边的小羊（接住时挤一下）
        const catchL = bi % 2 === 1 && u > 0.85, catchR = bi % 2 === 0 && u > 0.85;
        const cheer = bi === 7;
        for (const [x, k, fl, c] of [[LX, 'boss', false, catchL], [RX, 'bell', true, catchR], [LX - 90, 'pink', false, false], [RX + 90, 'geek', true, false], [VX + 40, 'pink', false, bi === 6]]) {
          if (x === VX + 40 && bi < 6) continue;
          const [hy, sq] = cheer ? hop(fract(b * 2)) : [0, 0];
          lamb(q, s, x, SG + 40 - hy * 30, 46, { kind: k, flip: fl, pose: hy > 0.3 ? 'jump' : 'stand', sq: c ? 0.5 : sq, expr: cheer ? 'happy' : 'neutral', t });
          shadow(q, x, SG + 42, 50, 0.4);
        }
        // 飞着的瓶子（打着转）
        bottle(q, s, bxp, byp + 36, 70, u * TAU * (bi % 2 ? -1 : 1), { fl: 'pink' });
        if (bi === 4 || bi === 5) bottle(q, s, lerp(T[1], T[0], u), SG - 70 - sin(PI * u) * 120 + 36, 70, -u * TAU, { fl: 'mint' });
        if (bi === 7) sfx(q, '哎哟', VX - 120, SG - 240, 40, clamp(u / 0.2), { color: '#ffffff', rot: -0.1 });
      },
    });
    s.post.vignette(g, 0.32);
  }

  /* ---------- 装箱（60.00 → 64.25）：一拍一瓶，扔进 No.4–7 号货箱；最小的那只抱着一瓶使劲摇 ---------- */
  function shotCrates(g, s) {
    const t = s.t, lt = s.lt, b = bt0(s);
    const path = (u) => ({ x: lerp(2100, 2160, u / 4.25), y: 820, z: 3.0 });
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 51, 3, 0.4));
    shopScene(g, s, cam, {
      key: 'crates', base: B, res: B.res, door: 1, run: 1, gauge: 0.52 + lt * 0.02,
      front: (q) => {
        const cx = [WS.belt[1] - 260, WS.belt[1] - 100, WS.belt[1] + 60, WS.belt[1] + 230];
        // 投手（站在传送带尽头）+ 接应的
        const [hy0, sq0] = hop(fract(b));
        lamb(q, s, WS.belt[1] - 30, BOTTLE_TOP - hy0 * 20, 46, { kind: 'boss', pose: hy0 > 0.3 ? 'jump' : 'stand', sq: sq0, expr: 'happy', flip: false });
        for (let k = 0; k < 8; k++) {
          const a = b - k; if (a < 0 || a > 1.2) continue;
          const tx = cx[k % 4], u = clamp(a / 0.8), x = lerp(WS.belt[1] - 10, tx, u), y = lerp(BOTTLE_TOP - 30, FL - 90, u) - sin(PI * u) * 180;
          if (u < 1) bottle(q, s, x, y + 40, 64, u * TAU * 1.2, { fl: FLAVORS[k % 4] });
          else sparkle(q, tx, FL - 110, 50 * (1.2 - a) / 0.4, 1.2 * (1.2 - a) / 0.4, 0, '255,244,210');
          if (u >= 1 && a < 1.0) sfx(q, '叮', tx + 30, FL - 170, 30, clamp((a - 0.8) / 0.08), { color: '#bdf6ff', rot: 0.12 });
        }
        // 箱子里探出头的小羊
        for (let i = 0; i < 3; i++) { const [hh, sq] = hop(fract(b + i * 0.33)); lamb(q, s, cx[i + 1] + (i - 1) * 10, FL - 104 - hh * 14, 42, { kind: ['pink', 'geek', 'bell'][i], pose: 'stand', sq, expr: 'happy', flip: i % 2 === 0 }); }
        // 最小的那只：抱着一瓶使劲摇（伏笔）
        const shakeA = sin(t * 38) * 0.25, sx0 = WS.belt[1] + 380;
        lamb(q, s, sx0, FL + 24, 36, { kind: 'pink', pose: 'stand', rot: shakeA * 0.4, expr: 'happy', flip: true, t });
        bottle(q, s, sx0 - 30, FL + 22, 60, shakeA, { fl: 'pink' });
        for (let i = 0; i < 6; i++) { const ph = fract(t * 3 + i / 6); bubble(q, sx0 - 30 + sin(shakeA * 6 + i) * 6, FL - 30 - ph * 30, 2 + ph * 3, 0.7 * (1 - ph), 'fizz'); }
        shadow(q, sx0 - 10, FL + 26, 70, 0.4);
      },
    });
    s.post.vignette(g, 0.34);
  }

  /* ---------- 漏气（64.25 → 68.49）：机器越转越快，压力表往上爬；一拍冒一处蒸汽，小羊们扑上去堵 ---------- */
  const LEAKS = [[430, 400], [600, 300], [700, 620], [380, 700], [560, 520], [800, 420], [660, 760], [470, 260]];
  function shotLeaks(g, s) {
    const t = s.t, lt = s.lt, b = bt0(s);
    const gk = 0.52 + (lt / 4.25) * 0.3;
    const path = (u) => ({ x: lerp(600, 640, u / 4.25), y: lerp(540, 520, u / 4.25), z: lerp(2.1, 2.3, u / 4.25) });
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 53, 3, 0.5), shake(s, 2 + lt * 0.8, 55, 30));
    shopScene(g, s, cam, {
      key: 'leaks', base: B, res: B.res, door: 1, run: 1, speed: 2, gauge: gk,
      front: (q) => {
        for (let k = 0; k < 8; k++) {
          const a = b - k; if (a < 0) continue;
          const [lx, ly] = LEAKS[k], plugged = a > 0.55;
          if (!plugged) { steam(q, t, lx, ly, [s.shot.t0 + k * BEAT, s.shot.t0 + k * BEAT + 0.12, s.shot.t0 + k * BEAT + 0.25], { r: 28, rise: 90, life: 0.8, drift: (k % 2 ? 60 : -60) }); sfx(q, '嘶——', lx + 50, ly - 50, 26, clamp(a / 0.1), { color: '#ffffff', rot: 0.1, alpha: 1 - clamp((a - 0.4) / 0.15) }); }
          // 扑上去的小羊：从地上跳过去贴住漏洞
          const L = GANG[k % 7], u = clamp((a - 0.2) / 0.35), sx = 360 + k * 110, sy = FL + 20;
          const x = lerp(sx, lx, ease.out(u)), y = lerp(sy, ly + 30, ease.out(u)) - sin(PI * u) * 80;
          lamb(q, s, x, y, 44 * L.sc, { kind: L.k, pose: u < 1 ? 'jump' : 'push', rot: u < 1 ? 0 : (k % 2 ? 0.3 : -0.3), sq: u >= 1 ? 0.3 + 0.1 * sin(t * 20 + k) : 0, expr: u >= 1 ? 'closed' : 'determined', fx: u >= 1 ? ['sweat'] : null, flip: lx < sx });
        }
      },
    });
    s.post.vignette(g, 0.36);
  }

  /* ---------- 过载（68.49 → 70.61）：一切都在抖，指针砸进红区，铆钉崩飞 ---------- */
  function shotOverload(g, s) {
    const t = s.t, lt = s.lt;
    const hit = 69.0 - s.shot.t0, hk = lt - hit;
    const cam = { x: 520, y: 470, z: lerp(2.6, 3.4, ease.in(clamp(lt / 2.1))), ...shake(s, 6 + (hk > 0 ? 18 * exp(-hk * 3) : 0), 57, 34) };
    const gk = hk > 0 ? 0.97 : 0.82 + lt * 0.1;
    shopScene(g, s, cam, {
      key: 'over', base: { x: 520, y: 470, z: 3.0 }, res: 1.15, door: 1, run: 1, speed: 3, gauge: gk,
      front: (q) => {
        // 警报灯
        const al = 0.5 + 0.5 * sin(t * 18);
        E.glow(q, 610, 240, 160, '255,60,70', 0.5 * al);
        // 崩飞的铆钉（朝镜头飞来）
        if (hk > 0) for (let i = 0; i < 6; i++) { const a = hk - i * 0.05; if (a < 0) continue; const an = (i / 6) * TAU + 0.4, d = a * (400 + i * 60); q.fillStyle = '#4a2410'; q.beginPath(); q.arc(510 + cos(an) * d, 360 + sin(an) * d * 0.7 - a * 60, 5 + a * 20, 0, TAU); q.fill(); }
        // 抱着管子发抖的小羊
        for (let j = 0; j < 3; j++) lamb(q, s, 380 + j * 170, [560, 700, 330][j], 46, { kind: GANG[j].k, pose: 'push', rot: sin(t * 30 + j) * 0.08, expr: 'surprise', fx: ['sweat'], flip: j === 2 });
        if (hk > 0) sfx(q, '砰！', 640, 380, 64, clamp(hk / 0.1), { color: '#ff8a7a', rot: -0.12, alpha: 1 - clamp((hk - 0.9) / 0.3) });
      },
    });
    if (hk > 0) s.post.fill(g, '#ffffff', 0.4 * exp(-hk * 5) * flashK(s), 'lighter');
    s.post.fill(g, '#ff3040', 0.08 * (0.5 + 0.5 * sin(t * 18)), 'soft-light');
    s.post.vignette(g, 0.5);
  }

  /* =========================================================
   * 间奏（70.61 → 85.48）：嘘——
   * ========================================================= */
  const STABS = [71.68, 72.08, 72.61, 72.74, 73.14, 74.34];
  /** 在 t 之前发生了几下“刺”（旋律的重音）→ 眼珠往哪边转 */
  const stabN = (t) => STABS.filter((x) => t >= x).length;
  /* ---------- 嘘——（70.61 → 74.86）：机器停了，所有小羊定在原地；老板从门口探进头来 ---------- */
  function shotHush(g, s) {
    const t = s.t, lt = s.lt;
    const n = stabN(t), side = n % 2 ? -1 : 1;
    const CUT = 1.62, close = lt >= CUT;
    const path = close ? (u) => ({ x: lerp(950, 965, (u - CUT) / 2.6), y: 330, z: lerp(3.05, 3.3, (u - CUT) / 2.6) }) : (u) => ({ x: lerp(760, 790, u / CUT), y: lerp(590, 582, u / CUT), z: lerp(1.4, 1.45, u / CUT) });
    const B = close ? pathBase(s, path, 1, 60, CUT, s.dur, 'c') : pathBase(s, path, 1, 60, 0, CUT, 'w');
    const cam = Object.assign(path(lt), hand(s, 61, 2, 0.25));
    const peek = sst(0.5, 1.6, lt);
    shopScene(g, s, cam, {
      key: close ? 'hush-c' : 'hush', base: B, res: B.res, door: 1, run: 0, lever: 1, gauge: 0.8, lights: 0, beamA: 0.8,
      mid: (q) => {
        // 门口：老板探进半个身子（只在门洞里看得见）
        const [d0, d1, dt] = WS.door;
        q.save(); q.beginPath(); q.rect(d0, dt, d1 - d0, FL - dt); q.clip();
        snow(q, s, { x: lerp(20, 120, peek), y: FL + 6, h: 410, anim: 'Relax', rot: 0.18 * peek, flip: false, fb: { x: lerp(20, 120, peek), y: FL + 6, h: 420, pose: 'stand', rot: 0.18 * peek, expr: 'sleepy', look: [side * 0.9, 0.2], blink: false } });
        q.restore();
      },
      front: (q) => {
        // 定格的小羊们：屏住呼吸（鼓着腮），眼珠跟着“刺”一起左右转
        const spots = [[330, 600, 'boss', 0.3], [505, 268, 'geek', 0], [860, 346, 'pink', 0], [975, 346, 'bell', 0], [1090, 346, 'pink', 0], [1340, 470, 'pink', 0], [700, FL + 10, 'pink', 0]];
        spots.forEach(([x, y, k, rot], i) => {
          const fl = (i % 2 === 0) !== (side < 0);
          lamb(q, s, x, y, i === 6 ? 34 : 44, { kind: k, pose: 'stand', rot, expr: 'surprise', fx: ['cheeks'], flip: fl, t: 0 });
        });
        for (const x of STABS) { const a = t - x; if (a > 0 && a < 0.3) sparkle(q, 900, 300, 30 * (1 - a / 0.3), 0.6, 0, '255,255,255'); }
      },
    });
    // 安静：冷一点、暗一点
    s.post.fill(g, '#2a3a6a', 0.12, 'multiply');
    s.post.letterbox(g, sst(0, 0.5, lt));
    s.post.vignette(g, 0.5);
  }

  /* ---------- 冒泡的特写（74.86 → 79.12）：瓶子里慢慢上浮的气泡；瓶子后面，一只小羊憋着气 ---------- */
  function shotFizzMacro(g, s) {
    const t = s.t, lt = s.lt;
    const pop = 75.92 - s.shot.t0, pk = lt - pop;
    const k = ease.inOut(clamp(lt / 4.25));
    const cam = { x: lerp(940, 990, k), y: 540, z: lerp(1.0, 1.06, k), ...hand(s, 63, 2, 0.25) };
    // 背景：糊掉的工坊（压力表是一个红色的小圆，在右上）
    inCam(g, cam, 0.3, (q) => q.drawImage(blurred(s, 'fizz-bg', VW, VH, (qq) => { qq.save(); qq.translate(960, 540); qq.scale(2.2, 2.2); qq.translate(-560, -480); shopBack(qq); shopTank(qq); shopSyrup(qq); qq.restore(); }, 0.05), -60, -40, VW + 120, VH + 80));
    inCam(g, cam, 0.3, (q) => { const gk = 0.82 + 0.03 * sin(t * 5) + lt * 0.01; q.save(); q.translate(1500, 250); q.scale(1.6, 1.6); q.translate(-WS.gauge[0], -WS.gauge[1]); withAlpha(q, 0.55, (qq) => bigGauge(qq, s, gk)); q.restore(); });
    g.fillStyle = 'rgba(40,30,60,0.25)'; g.fillRect(0, 0, VW, VH);
    inCam(g, cam, 1, (q) => {
      const bx = 900, by = 1180, bh = 1500, sc = bh / 150;
      bottle(q, s, bx, by, bh, 0, { fl: 'pink', fill: 0.62 });
      // 瓶子后面的小羊（隔着汽水看：被放大、横向拉宽、染成粉色；憋着气鼓着腮）
      q.save(); q.translate(bx, by); q.scale(sc, sc); q.translate(-30, -146);
      q.beginPath(); q.moveTo(9, 96); q.lineTo(51, 96); q.lineTo(51, 136); q.quadraticCurveTo(51, 145, 42, 145); q.lineTo(18, 145); q.quadraticCurveTo(9, 145, 9, 136); q.closePath(); q.clip();
      q.globalAlpha = 0.5;
      q.save(); q.translate(30, 150); q.scale(1.45, 1.1); q.translate(-30, -150);
      const wob = sin(t * 1.3) * 1.5;
      if (!(sdOK('enemy_1350_mgcshp') && SDK().draw(q, 'enemy_1350_mgcshp', { x: 22 + wob, y: 160, scale: 58 / 290, anim: pk > 0 && pk < 0.7 ? 'Attack' : 'Idle', t, speed: 0.5 }))) {
        cast(q, 'sheep-pink', { x: 26 + wob, y: 158, h: 64, pose: 'stand', t, expr: pk > 0 && pk < 0.7 ? 'surprise' : 'closed', flip: false, bow: '#ff4f8f' });
        if (!(pk > 0 && pk < 0.7)) { q.fillStyle = 'rgba(255,90,150,0.8)'; q.beginPath(); q.arc(44 + wob, 138, 3.2, 0, TAU); q.fill(); }
      }
      q.restore();
      q.globalAlpha = 1;
      q.globalCompositeOperation = 'multiply'; q.fillStyle = 'rgba(255,150,200,0.5)'; q.fillRect(0, 90, 60, 60); q.globalCompositeOperation = 'source-over';
      q.restore();
      // 慢慢上浮的气泡（慢动作）
      q.save(); q.translate(bx, by); q.scale(sc, sc); q.translate(-30, -146);
      q.beginPath(); q.moveTo(8, 96); q.lineTo(52, 96); q.lineTo(52, 136); q.quadraticCurveTo(52, 146, 42, 146); q.lineTo(18, 146); q.quadraticCurveTo(8, 146, 8, 136); q.closePath(); q.clip();
      for (let i = 0; i < 16; i++) { const ph = fract(t * (0.05 + hash(64, i) * 0.06) + hash(65, i)); bubble(q, 12 + hash(66, i) * 36 + sin(t * 0.8 + i) * 0.8, 144 - ph * 50, 0.5 + hash(67, i) * 1.3, 0.9 * sin(PI * ph), 'fizz'); }
      q.restore();
      // 液面上那一颗：75.92 “啵”
      const sx = bx + 4 * sc, sy = by - (146 - 96) * sc - 6;
      if (pk < 0) bubble(q, sx, sy - 10 - pk * 0, 22 + sin(t * 2) * 1.5, 0.95, 'soap');
      else if (pk < 0.5) { popBurst(q, sx, sy - 10, 90, pk / 0.5, 77); sfx(q, '啵', sx + 90, sy - 110, 40, clamp(pk / 0.08), { color: '#ffffff', rot: 0.15, alpha: 1 - clamp((pk - 0.35) / 0.15) }); }
    });
    // 玻璃的反光 + 柔光
    additive(g, (q) => { q.fillStyle = hg(q, 700, 1100, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]); q.fillRect(700, 0, 400, VH); });
    s.post.letterbox(g, 1);
    s.post.vignette(g, 0.55);
  }

  /* ---------- 轰隆（79.12 → 83.36）：铜罐一拍一鼓；老板走进来，和他看不见的小羊并排，慢慢转头 ---------- */
  function shotRumble(g, s) {
    const t = s.t, lt = s.lt, b = bt0(s);
    const path = (u) => ({ x: lerp(760, 720, u / 4.25), y: lerp(700, 690, u / 4.25), z: lerp(1.45, 1.55, ease.in(clamp(u / 4.25))) });
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 65, 2, 0.3), shake(s, 1.5 + 2.5 * s.pulse(5), 67, 20));
    const turn = clamp((b - 4) / 2);   // 第 5 拍起一起慢慢转头
    shopScene(g, s, cam, {
      key: 'rumble', base: B, res: B.res, door: 1, run: 0, lever: 1, gauge: 0.84 + lt * 0.025, lights: 0.4, beamA: 0.7,
      front: (q) => {
        // 罐子一拍一鼓（在罐身上叠一层高光 + 喷出的细蒸汽）
        const pulse = s.pulse(5);
        additive(q, (qq) => { qq.globalAlpha = 0.25 * pulse; qq.fillStyle = '#ffcc99'; qq.fillRect(WS.tank[0], WS.tank[2], WS.tank[1] - WS.tank[0], FL - WS.tank[2] - 40); qq.globalAlpha = 1; });
        steam(q, t, WS.tank[1] - 10, 560, beatTimes(s, s.shot.t0 - 1, t), { r: 18, rise: 60, life: 0.7, drift: 40 });
        steam(q, t, WS.tank[0] + 20, 780, beatTimes(s, s.shot.t0 - 0.5, t, 2), { r: 16, rise: 50, life: 0.6, drift: -40 });
        // 老板（站在罐子前面，背对我们一点）+ 身边一排小羊：一起慢慢转头看罐子
        snow(q, s, { x: 800, y: FL + 16, h: 420, anim: 'Relax', flip: turn > 0.5, fb: { x: 800, y: FL + 16, h: 430, pose: 'stand', expr: 'surprise', look: [lerp(0.8, -1, turn), -0.3], flip: turn > 0.5 } });
        for (let j = 0; j < 5; j++) { const L = GANG[j + 1], x = 900 + j * 64; lamb(q, s, x, FL + 18, 44 * L.sc, { kind: L.k, pose: turn > 0.5 ? 'look-up' : 'stand', flip: turn > 0.5 + j * 0.05, expr: turn > 0.5 ? 'surprise' : 'neutral', fx: turn > 0.8 ? ['sweat'] : null, t: 0 }); shadow(q, x, FL + 20, 50, 0.4); }
        if (b > 6.5) sfx(q, '咕噜噜……', 520, 300, 34, clamp((b - 6.5) / 0.4), { color: '#ffffff', rot: 0.08 });
      },
    });
    s.post.fill(g, '#3a2a5a', 0.1, 'multiply');
    s.post.letterbox(g, 1 - sst(3.6, 4.2, lt));
    s.post.vignette(g, 0.45);
  }

  /* ---------- 糟了（83.36 → 85.48）：老板的脸、小羊们的脸、罐顶的安全阀越转越快 ---------- */
  function shotUhoh(g, s) {
    const t = s.t, lt = s.lt;
    if (lt < BEAT) {
      // 老板的大脸：眼睛瞪圆，一滴汗
      g.drawImage(blurred(s, 'uh-bg', VW, VH, (q) => { shopBack(q); shopTank(q); }, 0.05), -60, -40, VW + 120, VH + 80);
      inCam(g, { x: 960, y: 540, z: 1 + lt * 0.2, ...shake(s, 3, 71, 20) }, 1, (q) => {
        // 店主的大脸（剧情立绘，惊得张开嘴）+ 一滴冷汗
        const ok = snowCard(q, s, { x: 960, y: 1280, h: 1380, crop: 'bust', expr: 3, breath: 0, look: [0.15, -0.45], nod: -0.3, blink: 0, wind: 0.6 });
        if (!ok) vendor(q, { x: 960, y: 640, h: 760, crop: 'face', pose: 'stand', t, expr: 'surprise', look: [0.2, -0.4], blink: false });
        drop(q, ok ? 1180 : 1260, 380 + lt * 200, 22, PI / 2, 0.9, 'cyan');
      });
      s.post.vignette(g, 0.5);
      return;
    }
    if (lt < BEAT * 2) {
      // 一排小羊的脸（同时瞪大眼睛）
      g.fillStyle = '#f6e4c8'; g.fillRect(0, 0, VW, VH);
      g.drawImage(blurred(s, 'uh-bg', VW, VH, (q) => { shopBack(q); shopTank(q); }, 0.05), -60, -40, VW + 120, VH + 80);
      inCam(g, { x: 960, y: 540, z: 1 + (lt - BEAT) * 0.2, ...shake(s, 3, 73, 20) }, 1, (q) => {
        for (let j = 0; j < 4; j++) lamb(q, s, 360 + j * 420, 900, 360, { kind: GANG[j].k, pose: 'look-up', expr: 'surprise', fx: ['sweat'], t, flip: j % 2 === 1 });
      });
      s.post.vignette(g, 0.5);
      return;
    }
    // 罐顶：安全阀越转越快，罐子鼓起来
    const a = lt - BEAT * 2;
    const cam = { x: 510, y: 250, z: 3.2 + a * 0.4, ...shake(s, 4 + a * 10, 75, 30) };
    shopScene(g, s, cam, {
      key: 'uhoh', base: { x: 510, y: 250, z: 3.2 }, res: 1.2, door: 1, run: 0, lever: 1, gauge: 0.97, lights: 1, beams: false,
      front: (q) => {
        const cx = (WS.tank[0] + WS.tank[1]) / 2, top = WS.tank[2] - 84;
        q.save(); q.translate(cx, top - 6); q.rotate(a * a * 40);
        q.fillStyle = '#c8a050'; q.fillRect(-26, -12, 52, 14); q.fillStyle = '#e0303a'; q.beginPath(); q.arc(0, -16, 14, 0, TAU); q.fill(); q.strokeStyle = '#3a2418'; q.lineWidth = 2.5; q.stroke();
        q.restore();
        steam(q, t, cx, top - 20, [s.shot.t0 + BEAT * 2, s.shot.t0 + BEAT * 2.3, s.shot.t0 + BEAT * 2.6, s.shot.t0 + BEAT * 2.9, s.shot.t0 + BEAT * 3.2], { r: 26, rise: 180, life: 0.8 });
        sfx(q, '呜——', cx + 90, top - 80, 30, clamp(a / 0.2), { color: '#ffffff', rot: 0.1 });
      },
    });
    s.post.fill(g, '#ff3040', 0.1 * (0.5 + 0.5 * sin(t * 20)), 'soft-light');
    s.post.vignette(g, 0.5);
  }

  /* =========================================================
   * 汽水喷泉（满段 85.48 → 102.48）
   * ========================================================= */
  /**
   * 一道汽水喷泉：(x, y) 喷口，a = 喷发后的秒数，H 最大高度，w 喷口宽；
   * o: { pink, crown(0..1), lean(顶上往哪边歪), seed, a0(整体透明度), rain }
   */
  function geyser(g, t, x, y, a, H, w, o = {}) {
    if (a < 0) return;
    const seed = o.seed || 1, pink = o.pink !== false;
    const grow = ease.out(clamp(a / 0.45)), hh = H * grow * (0.94 + 0.06 * sin(t * 7 + seed)) * (o.fade != null ? 1 - o.fade * 0.6 : 1);
    const lean = (o.lean || 0) * hh;
    const top = y - hh, A = (o.a0 ?? 1);
    // 柔光
    E.glow(g, x + lean * 0.5, y - hh * 0.5, hh * 0.55 + w, pink ? '255,150,200' : '200,240,255', 0.35 * A);
    // 水柱：往上略微变宽，边缘抖动；粉 → 白
    const edge = (side, u) => x + lean * u * u + side * (w * (0.5 + u * 0.55)) + wobble(seed + (side > 0 ? 7 : 3), t * 4 + u * 6) * w * 0.18;
    g.save(); g.globalAlpha *= A;
    g.beginPath();
    for (let i = 0; i <= 16; i++) { const u = i / 16; g.lineTo(edge(-1, u), y - u * hh); }
    for (let i = 16; i >= 0; i--) { const u = i / 16; g.lineTo(edge(1, u), y - u * hh); }
    g.closePath();
    g.fillStyle = vg(g, top, y, pink ? [[0, '#ffffff'], [0.35, '#ffe2ef'], [0.8, '#ff9cc6'], [1, '#ff78b0']] : [[0, '#ffffff'], [1, '#bfeaff']]);
    g.fill();
    // 体积：左边亮、右边一道粉紫的阴影
    g.save(); g.clip();
    g.fillStyle = hg(g, x - w * 1.2, x + w * 1.2, [[0, 'rgba(255,255,255,0.35)'], [0.45, 'rgba(255,255,255,0)'], [0.75, 'rgba(200,70,150,0.12)'], [1, 'rgba(160,60,150,0.35)']]); g.fillRect(x - w * 1.3 + lean * 0.5, top - 20, w * 2.6 + abs(lean), hh + 40);
    g.restore();
    g.strokeStyle = pink ? 'rgba(220,90,150,0.7)' : 'rgba(90,160,200,0.7)'; g.lineWidth = max(2, w * 0.05); g.stroke();
    // 中间一道亮芯
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); for (let i = 0; i <= 12; i++) { const u = i / 12; g.lineTo(x + lean * u * u - w * 0.12 + sin(t * 9 + u * 7) * w * 0.05, y - u * hh); } for (let i = 12; i >= 0; i--) { const u = i / 12; g.lineTo(x + lean * u * u + w * 0.08 + sin(t * 9 + u * 7) * w * 0.05, y - u * hh); } g.closePath(); g.fill();
    g.restore();
    // 沿着水柱往上跑的泡沫团（表现“在喷”）
    for (let i = 0; i < 14; i++) {
      const u = fract(t * 1.4 + i / 14), side = i % 2 ? 1 : -1;
      const px = edge(side, u) - side * w * 0.2, py = y - u * hh;
      foam(g, px, py, w * (0.28 + u * 0.35), A * 0.95 * min(1, u * 5), i + seed, pink, t * 2 + i);
    }
    // 顶上的“蘑菇”：一圈泡沫往外翻、往下落
    const cr = o.crown ?? 1;
    if (cr > 0.01) for (let i = 0; i < 12; i++) {
      const ph = fract(t * 0.9 + i / 12), an = -PI / 2 + (i / 11 - 0.5) * PI * 1.5;
      const r = w * (0.9 + ph * 1.6) * cr;
      const px = x + lean + cos(an) * r * 1.2, py = top + sin(an) * r * 0.45 + ph * ph * w * 2.2;
      foam(g, px, py, w * (0.45 + 0.35 * sin(PI * ph)) * cr, A * sin(PI * min(1, ph * 1.3)), i + 3, pink, i);
    }
    // 水滴：从顶上往四周洒
    if (o.rain !== false) spray(g, t, { x: x + lean, y: top + w * 0.3, n: o.drops || 40, loop: true, life: 1.4, speed: 520 + w * 1.5, spread: 2.6, ang: -PI / 2, grav: 900, r: max(4, w * 0.07), seed: seed + 50, color: pink ? 'pink' : 'white', a: A });
    // 往外飘的肥皂泡
    for (let i = 0; i < 12; i++) { const ph = fract(t * 0.35 + hash(seed, i, 7)); bubble(g, x + (hash(seed, i, 8) - 0.5) * w * 6 * ph + lean, y - ph * hh * 1.1, (6 + hash(seed, i, 9) * 14) * (0.5 + ph) * (w / 80), A * 0.85 * sin(PI * ph)); }
  }
  /** 一道彩虹（半透明的彩色弧带） */
  function rainbow(q, cx, cy, R, a, w = 40) {
    if (a <= 0.01) return;
    const cols = ['255,90,110', '255,170,80', '255,236,110', '120,230,140', '90,200,255', '160,120,255'];
    q.save(); q.globalCompositeOperation = 'lighter';
    cols.forEach((c, i) => { q.strokeStyle = `rgba(${c},${0.22 * a})`; q.lineWidth = w / cols.length + 1; q.beginPath(); q.arc(cx, cy, R - (i * w) / cols.length, PI * 1.08, PI * 1.92); q.stroke(); });
    q.restore();
  }
  /* ---------- 砰！（85.48 → 87.61）：铜罐冲破屋顶，一道粉色的汽水喷泉直冲上天 ---------- */
  const GEY = { x: 1570, y: 176 };   // 汽水摊世界里喷泉的喷口（铜罐顶）
  function shotBoom(g, s) {
    const t = s.t, lt = s.lt, a = lt;
    const path = (u) => { const k = ease.inOut(clamp(u / 2.0)); return { x: lerp(1520, 1320, k), y: lerp(430, 120, k), z: lerp(1.35, 0.9, k) }; };
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), shake(s, 22 * exp(-a * 2.5) + 3, 81, 26));
    standScene(g, s, cam, {
      key: 'boom', base: B, res: B.res,
      mid: (q) => {
        // 罐顶的铜盖飞出去
        const u = clamp(a / 1.6); q.save(); q.translate(GEY.x + a * 260, GEY.y - 40 - a * 900 + a * a * 700); q.rotate(a * 7);
        q.fillStyle = '#e8a066'; q.beginPath(); q.ellipse(0, 0, 90, 34, 0, PI, TAU); q.fill(); q.strokeStyle = '#3a2418'; q.lineWidth = 3; q.stroke(); q.restore(); void u;
        geyser(q, t, GEY.x, GEY.y, a, 1500, 110, { seed: 3, lean: -0.08, drops: 50 });
        // 被冲飞的汽水瓶
        for (let i = 0; i < 8; i++) { const b2 = a - i * 0.05; if (b2 < 0) continue; const bx = GEY.x + (hash(83, i) - 0.5) * 1200 * b2, by = GEY.y - 600 * b2 + 900 * b2 * b2; bottle(q, s, bx, by, 70, b2 * (6 + i), { fl: FLAVORS[i % 4] }); }
        // 老板从工坊门里被冲出来，一屁股坐在地上
        const va = a - 0.3;
        if (va > 0) {
          // 店主被冲出工坊门：在空中翻了一圈（绕身子中心转），落地躺平
          const vx = lerp(ST.door[0] + 60, 1300, ease.out(clamp(va / 0.6))), fbo = { x: vx, y: SG + 30, h: 400, pose: va < 0.6 ? 'jump' : 'sit-ground', air: va < 0.6 ? sin(PI * va / 0.6) * 0.6 : 0, expr: 'surprise', look: [0.4, -1], flip: true };
          if (va < 0.6) { const cy = SG + 30 - 190 - sin(PI * va / 0.6) * 230; q.save(); q.translate(vx, cy); q.rotate(-(va / 0.6) * TAU); snow(q, s, { x: 0, y: 190, h: 390, anim: 'Relax', flip: true, fb: Object.assign({}, fbo, { x: 0, y: 190 }) }); q.restore(); }
          else snow(q, s, { x: vx, y: SG + 32, h: 390, anim: 'Sleep', flip: true, fb: fbo });
        }
        sfx(q, '砰——！', GEY.x - 420, GEY.y + 60, 110, clamp(a / 0.12), { color: '#ff8fbf', stroke: '#ffffff', rot: -0.1, alpha: 1 - clamp((a - 1.2) / 0.4) });
      },
    });
    s.post.fill(g, '#fff0f6', 0.9 * exp(-a * 5) * flashK(s), 'lighter');
    s.post.vignette(g, 0.3);
  }

  /* ---------- 喷泉（87.61 → 89.73）：从海滩上看，小镇上空立起一根粉色的“喷发柱”，和远处火山的烟遥遥相望 ---------- */
  function shotSpout(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp(lt / 2.12));
    const cam = { x: lerp(1240, 1300, k), y: lerp(430, 400, k), z: lerp(1.25, 1.34, k), ...hand(s, 85, 3, 0.35) };
    const a = t - D[40];
    inCam(g, cam, 0.02, (q) => {
      skyFill(q, -300, HZN + 10, [[0, '#1f78d4'], [0.35, '#3d9ae6'], [0.7, '#86ccf2'], [1, '#d8f2fa']]);
      sun(q, 330, 140, 46, 1, 0.6);
      cumulus(q, s, 'bw0', 1500, 470, 900, 420, 71, 1, { res: 0.55 });
      cumulus(q, s, 'bw1', 700 + t * 4, 400, 560, 230, 72, 0.9);
    });
    baked(g, s, 'bw-far', { x: 960, y: 540, z: 1 }, cam, 0.15, beachFar, 0.9, [-420, 160, 2340, 720]);
    inCam(g, cam, 0.15, (q) => bigPlume(q, t, 1638, 232, 0.8, 0.85));
    baked(g, s, 'bw-sea', { x: 960, y: 540, z: 1 }, cam, 0.3, beachSea, 0.8, [-420, HZN - 4, 2340, 900]);
    inCam(g, cam, 0.3, (q) => seaLive(q, t));
    inCam(g, cam, 0.45, (q) => {
      q.drawImage(LC(s, 'bw-town', VW + 600, 420, (qq) => { qq.translate(300, -380); beachTown(qq); }, 1.1), -300, 380, VW + 600, 420);
      const gx = 1420 + (GEY.x - 1100) * 0.17, gy = 700 - (SG - GEY.y) * 0.17;
      geyser(q, t, gx, gy, a, 600, 40, { seed: 7, lean: -0.1, drops: 36 });
      rainbow(q, gx - 60, gy + 60, 330, sst(0.2, 1.2, lt), 70);
      // 骑在喷泉顶上的小羊（小小的粉点）
      for (let i = 0; i < 5; i++) { const ph = t * 2 + i * 1.3; lamb(q, s, gx - 56 + cos(ph) * 40 + i * 6, gy - 540 + sin(ph) * 14, 14, { kind: GANG[i].k, pose: 'jump', flip: cos(ph) < 0 }); }
    });
    baked(g, s, 'bw-sand', { x: 960, y: 540, z: 1 }, cam, 0.7, beachSand, 0.9, [-420, 760, 2340, 1200]);
    inCam(g, cam, 0.7, (q) => {
      for (const [x, y, sc, c] of UMB) umbrella(q, x, y, sc, c, t);
      // 抬头看、指着天的游客
      for (let i = 0; i < 7; i++) { const x = 300 + i * 220 + hash(88, i) * 60, y = 880 + hash(89, i) * 70; const hh = 120 + (y - 880) * 0.4; extra(q, s, CAMEO[i % 3], { x, y, h: hh, anim: i % 3 === 0 ? 'Interact' : 'Relax', phase: i * 0.53, flip: x > 1300, shadow: 0.5, fb: { x, y, h: hh, pose: i % 3 === 0 ? 'point' : 'look-up', aim: -1.1, t: t + i, seed: 80 + i, flip: x > 1300, simple: true, color: pick(['#ff6fa8', '#3fc0d8', '#ffc83a', '#7fd8a0', '#b48ae0', '#ff8a5a'], hash(90, i)) } }); }
    });
    baked(g, s, 'bw-fore', { x: 960, y: 540, z: 1 }, cam, 1.2, beachFore, 0.8, [-420, 900, 2340, 1200]);
    sparkles(g, t, 18, 87, '255,220,240', { x: 600, y: 0, w: 1300, h: 600, r: 16 });
    s.post.vignette(g, 0.28);
  }

  /* =========================================================
   * 世界 3 · 面朝大海的木栈道（横向很长：x 600..4600）：海平线 y = 360，沙滩 600–720，栏杆 700–790，栈道 790 以下
   * ========================================================= */
  const BK = { hz: 360, rail: 790 };
  function bkFar(q) {
    // 海 + 沙滩（视差 0.5）
    q.fillStyle = vg(q, BK.hz, 640, [[0, '#86dcea'], [0.3, '#40bcd6'], [1, '#56d4d8']]); q.fillRect(0, BK.hz, 3400, 300);
    const R = E.rng(301);
    for (let i = 0; i < 300; i++) { const y = BK.hz + 3 + pow(R(), 1.6) * 240, near = (y - BK.hz) / 240; q.fillStyle = `rgba(255,255,255,${(0.12 + R() * 0.25)})`; q.fillRect(R() * 3400, y, 10 + R() * 40 * (0.4 + near), 1 + near * 2); }
    q.fillStyle = '#86b4a4'; q.beginPath(); q.moveTo(2500, BK.hz + 2); q.bezierCurveTo(2700, BK.hz - 10, 2900, BK.hz - 40, 3100, BK.hz - 36); q.bezierCurveTo(3250, BK.hz - 30, 3350, BK.hz - 6, 3400, BK.hz + 2); q.closePath(); q.fill();
    q.fillStyle = '#eee8f4'; q.fillRect(2960, BK.hz - 60, 40, 20); q.beginPath(); q.arc(2950, BK.hz - 52, 12, PI, 0); q.fill();
    q.fillStyle = vg(q, 590, 760, [[0, '#f6e0b2'], [1, '#fbecc8']]); q.beginPath(); q.moveTo(0, 610); for (let x = 0; x <= 3400; x += 50) q.lineTo(x, 604 + sin(x * 0.004) * 10); q.lineTo(3400, 800); q.lineTo(0, 800); q.closePath(); q.fill();
    q.strokeStyle = 'rgba(255,255,255,0.85)'; q.lineWidth = 3; q.beginPath(); for (let x = 0; x <= 3400; x += 40) q.lineTo(x, 606 + sin(x * 0.004) * 10 + sin(x * 0.03) * 2); q.stroke();
    for (let i = 0; i < 16; i++) { const x = 100 + i * 210 + hash(302, i) * 80; umbrella(q, x, 700 + hash(303, i) * 30, 0.42, pick(['#ff86b8', '#46c0d0', '#f6c040', '#9a7ae0'], hash(304, i))); }
  }
  function bkNear(q) {
    // 栏杆 + 路灯 + 棕榈 + 栈道（视差 1）
    promenade(q, 1000, 5400, BK.rail, 1180);
    for (let i = 0; i < 7; i++) { const x = 1100 + i * 680 + hash(311, i) * 120; palm(q, x, BK.rail - 6, 520 + hash(312, i) * 160, 0, { seed: 320 + i, lean: (hash(313, i) - 0.5) * 0.3 }); }
    q.fillStyle = '#fbfbf6'; q.strokeStyle = 'rgba(60,60,80,0.6)'; q.lineWidth = 2;
    q.fillRect(1000, BK.rail - 92, 4400, 12); q.strokeRect(1000, BK.rail - 92, 4400, 12);
    q.fillRect(1000, BK.rail - 50, 4400, 8); q.strokeRect(1000, BK.rail - 50, 4400, 8);
    for (let x = 1010; x < 5400; x += 70) { q.fillRect(x, BK.rail - 92, 10, 92); q.strokeRect(x, BK.rail - 92, 10, 92); }
    for (let i = 0; i < 9; i++) { const lx = 1300 + i * 470; q.fillStyle = '#2f7f8e'; q.fillRect(lx - 6, BK.rail - 420, 12, 420); q.fillStyle = '#fff6d8'; q.beginPath(); q.moveTo(lx - 20, BK.rail - 420); q.lineTo(lx + 20, BK.rail - 420); q.lineTo(lx + 14, BK.rail - 466); q.lineTo(lx - 14, BK.rail - 466); q.closePath(); q.fill(); q.fillStyle = '#2f7f8e'; q.beginPath(); q.moveTo(lx - 24, BK.rail - 464); q.lineTo(lx, BK.rail - 486); q.lineTo(lx + 24, BK.rail - 464); q.closePath(); q.fill(); q.fillStyle = pick(['#ff86b8', '#46c0d0', '#f6c040'], hash(314, i)); q.beginPath(); q.moveTo(lx + 6, BK.rail - 380); q.lineTo(lx + 60, BK.rail - 372); q.lineTo(lx + 48, BK.rail - 340); q.lineTo(lx + 6, BK.rail - 332); q.closePath(); q.fill(); }
  }
  function bkScene(g, s, cam, o = {}) {
    const t = s.t;
    inCam(g, cam, 0.03, (q) => { skyFill(q, -300, BK.hz + 6, [[0, '#2380d8'], [0.5, '#5ab4ee'], [1, '#d6f2fa']]); for (let i = 0; i < 4; i++) cumulus(q, s, 'bk' + i, ((i * 700 - t * 8) % 2800 + 2800) % 2800 - 400, 330 - (i % 2) * 40, 520, 230, 90 + i, 0.95); });
    inCam(g, cam, 0.5, (q) => { q.drawImage(LC(s, 'bk-far', 3400, 480, (qq) => { qq.translate(0, -320); bkFar(qq); }, 0.8), 0, 320, 3400, 480); seaLiveBK(q, t); });
    inCam(g, cam, 1, (q) => { q.drawImage(LC(s, 'bk-near', 4400, 900, (qq) => { qq.translate(-1000, -300); bkNear(qq); }, 0.9), 1000, 300, 4400, 900); if (o.mid) o.mid(q); });
    if (o.after) o.after(g);
  }
  function seaLiveBK(q, t) {
    for (let i = 0; i < 70; i++) { const y = BK.hz + 4 + pow(hash(331, i), 1.5) * 220, x = hash(332, i) * 3400 + sin(t * 0.6 + i) * 8, a = max(0, sin(t * (2 + hash(333, i) * 3) + i * 1.9)) * 0.8; if (a < 0.05) continue; q.globalAlpha = a; q.fillStyle = '#fff'; q.fillRect(x, y, 8 + (y - BK.hz) * 0.1, 2); }
    q.globalAlpha = 1;
  }
  /** 一道泡沫大浪（从右往左滚）：前沿 xf，高 H；返回浪顶的高度函数 */
  function foamWave(q, s, t, xf, gy, H, seed = 1) {
    const topY = (x) => { const d = x - xf; if (d < 0) return gy; const k = d / 520; return gy - H * (k < 0.25 ? sin((k / 0.25) * PI / 2) : max(0.25, 1 - (k - 0.25) * 0.5)); };
    // 浪身：一层层泡沫团（后面矮、前面高，前沿卷起来）
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 18; i++) {
        const x = xf + 30 + i * 70 + layer * 24 + sin(t * 3 + i) * 10, y = topY(x) + layer * 60 + 40;
        if (y > gy + 40) continue;
        foam(q, x, y, 70 - layer * 10 + sin(t * 4 + i * 1.3) * 6, 1, i + layer * 5 + seed, true, sin(t + i) * 0.3);
      }
    }
    // 卷起来的浪头
    for (let i = 0; i < 7; i++) { const an = -PI * 0.2 - i * 0.32 + sin(t * 5) * 0.08, r = H * 0.42; foam(q, xf + 90 + cos(an) * r * 0.6, gy - H * 0.62 + sin(an) * r * 0.55, 46 - i * 3, 1, i + 9, true, an); }
    spray(q, t, { x: xf + 60, y: gy - H * 0.9, n: 30, loop: true, life: 1.1, speed: 520, spread: 1.4, ang: -PI * 0.75, grav: 1200, r: 7, seed: seed + 9, color: 'pink' });
    for (let i = 0; i < 16; i++) { const ph = fract(t * 0.6 + hash(341, i)); bubble(q, xf + hash(342, i) * 700 + ph * 80, gy - H * 0.5 - ph * 380, 8 + hash(343, i) * 20, 0.85 * sin(PI * ph)); }
    return topY;
  }
  /* ---------- 冲浪（89.73 → 93.97）：泡沫大浪沿着木栈道滚过去，小羊们踩着汽水瓶冲浪，老板被卷在浪里 ---------- */
  function shotSurf(g, s) {
    const t = s.t, lt = s.lt;
    const xf = 3900 - lt * 420;
    const path = (u) => ({ x: 3900 - u * 420 + 330, y: 760, z: 1.62 });
    const cam = Object.assign(path(lt), hand(s, 91, 4, 0.6));
    bkScene(g, s, cam, {
      mid: (q) => {
        const topY = foamWave(q, s, t, xf, BK.rail + 210, 300, 3);
        // 冲浪的小羊：踩在横着的汽水瓶上，随浪起伏；一拍一个小动作
        for (let j = 0; j < 6; j++) {
          const L = GANG[j], x = xf + 150 + j * 115, y = topY(x) + 8 + sin(t * 4 + j) * 8;
          const [hy, sq] = hop(fract(s.beat + j * 0.2));
          const trick = floor(s.beat + j) % 4 === 0;
          bottle(q, s, x + 20, y + 6, 70, -PI / 2 + 0.1 + sin(t * 3 + j) * 0.08, { fl: FLAVORS[j % 4] });
          lamb(q, s, x, y - hy * (trick ? 60 : 16), 46 * L.sc, { kind: L.k, pose: hy > 0.3 ? 'jump' : 'stand', flip: true, sq, spin: trick ? -fract(s.beat + j) * TAU : 0, expr: 'happy' });
        }
        // 被卷在浪里的店主：躺在泡沫上一起一伏地漂（Sleep，身子随浪倾斜）
        const vx = xf + 780, vy = topY(vx) + 40;
        snow(q, s, { x: vx, y: vy, h: 390, anim: 'Sleep', speed: 1.8, rot: -0.12 + sin(t * 3) * 0.08, flip: true, fb: { x: vx, y: vy + 50, h: 400, pose: 'lie', expr: 'surprise', rot: -0.15 + sin(t * 3) * 0.08, look: [0, -1] } });
        for (let i = 0; i < 4; i++) foam(q, vx - 180 + i * 110, topY(vx - 180 + i * 110) + 70 + sin(t * 4 + i) * 6, 46, 0.95, i + 30, true, t + i);
        // 前景：浪花打在镜头前
        for (let i = 0; i < 5; i++) foam(q, xf - 60 + i * 130, BK.rail + 330 + sin(t * 5 + i) * 10, 90, 0.9, i + 20, true, t + i);
      },
    });
    sparkles(g, t, 14, 93, '255,240,250', { r: 14 });
    s.post.vignette(g, 0.3);
  }

  /* =========================================================
   * 世界 4 · 沙滩低机位（火箭）：沙面 y ≈ 820，海平线 y = 470；远处右边是汐斯塔汽水（还在喷）
   * ========================================================= */
  const BL = { hz: 470, sand: 820 };
  function blFar(q) {
    q.fillStyle = vg(q, BL.hz, 760, [[0, '#86dcea'], [0.3, '#3ebad4'], [1, '#62d8d4']]); q.fillRect(-400, BL.hz, 2800, 320);
    const R = E.rng(401);
    for (let i = 0; i < 260; i++) { const y = BL.hz + 3 + pow(R(), 1.6) * 260; q.fillStyle = `rgba(255,255,255,${0.12 + R() * 0.25})`; q.fillRect(R() * 2800 - 400, y, 10 + R() * 50, 1.5 + (y - BL.hz) * 0.008); }
    // 右边远处的海岸：小镇 + 汽水摊（喷泉单独画）
    q.fillStyle = '#9cc8b0'; q.beginPath(); q.moveTo(1150, 720); q.bezierCurveTo(1400, 640, 1700, 600, 2400, 590); q.lineTo(2400, 760); q.lineTo(1150, 760); q.closePath(); q.fill();
    for (const b of resortRow(402, 1300, 2400, 680, 60, 160, 50, 110)) retroBuilding(q, b, { detail: 0.35, lw: 1.3 });
    q.save(); q.translate(1560 - 1100 * 0.12, 700 - SG * 0.12); q.scale(0.12, 0.12); annex(q); cooler(q); kiosk(q); awning(q); q.restore();
    q.fillStyle = vg(q, 520, 780, [[0, 'rgba(220,242,252,0)'], [0.35, 'rgba(220,242,252,0.4)'], [1, 'rgba(230,246,252,0.1)']]); q.fillRect(-400, 520, 2800, 260);
  }
  function blSand(q) {
    q.fillStyle = vg(q, 740, 1180, [[0, '#efd6a2'], [0.3, '#f6e2b6'], [1, '#fcefd0']]); q.beginPath(); q.moveTo(-400, 760); for (let x = -400; x <= 2400; x += 60) q.lineTo(x, 752 + sin(x * 0.005) * 12); q.lineTo(2400, 1200); q.lineTo(-400, 1200); q.closePath(); q.fill();
    q.strokeStyle = 'rgba(255,255,255,0.9)'; q.lineWidth = 4; q.beginPath(); for (let x = -400; x <= 2400; x += 40) q.lineTo(x, 756 + sin(x * 0.005) * 12 + sin(x * 0.05) * 2); q.stroke();
    const R = E.rng(403);
    for (let i = 0; i < 500; i++) { const y = 780 + pow(R(), 0.8) * 400; q.fillStyle = `rgba(${R() < 0.5 ? '180,140,90' : '255,255,255'},${0.12 + R() * 0.2})`; q.fillRect(R() * 2800 - 400, y, 2 + (y - 780) * 0.012, 2 + (y - 780) * 0.006); }
    // 贝壳和海星
    for (let i = 0; i < 9; i++) { const x = hash(404, i) * 2400 - 200, y = 880 + hash(405, i) * 260, r = 8 + (y - 880) * 0.04; q.fillStyle = i % 3 ? '#ffd8e0' : '#ffb070'; q.beginPath(); if (i % 3) { q.ellipse(x, y, r, r * 0.7, 0, PI, TAU); q.lineTo(x - r, y); } else { for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU - PI / 2, rr = k % 2 ? r * 0.45 : r; q.lineTo(x + cos(a) * rr, y + sin(a) * rr); } } q.closePath(); q.fill(); }
  }
  function blScene(g, s, cam, o = {}) {
    const t = s.t;
    inCam(g, cam, 0.03, (q) => { skyFill(q, -900, BL.hz + 6, [[0, '#1e72d0'], [0.45, '#4aa8ec'], [1, '#d4f0fa']]); sun(q, 420, 160, 40, 1, 0.7); for (let i = 0; i < 3; i++) cumulus(q, s, 'bl' + i, 300 + i * 700 + t * 4, 420 - (i % 2) * 50, 600, 260, 110 + i, 0.95); withAlpha(q, 0.9, (qq) => qq.drawImage(LC(s, 'sheepcloud', 320, 200, sheepCloudArt, 0.5), 1300 + t * 5, 100, 260, 162)); });
    inCam(g, cam, 0.35, (q) => {
      q.drawImage(LC(s, 'bl-far', 2800, 420, (qq) => { qq.translate(400, -400); blFar(qq); }, 0.8), -400, 400, 2800, 420);
      const a = t - D[40];
      geyser(q, t, 1560 + (GEY.x - 1100) * 0.12, 700 - (SG - GEY.y) * 0.12, a, 460 * (o.gFade != null ? 1 - o.gFade * 0.5 : 1), 30, { seed: 9, lean: -0.12, drops: 20, fade: o.gFade || 0 });
    });
    inCam(g, cam, 1, (q) => { q.drawImage(LC(s, 'bl-sand', 2800, 460, (qq) => { qq.translate(400, -740); blSand(qq); }, 0.9), -400, 740, 2800, 460); if (o.mid) o.mid(q); });
    if (o.after) o.after(g);
  }
  /* ---------- 火箭（93.97 → 98.23）：把汽水瓶倒插进沙里、使劲摇；带头的倒数 3、2、1 ---------- */
  const RK = [520, 660, 800, 940, 1080, 1220, 1360];
  function shotRockets(g, s) {
    const t = s.t, lt = s.lt, b = bt0(s);
    const path = (u) => ({ x: lerp(930, 950, u / 4.25), y: 770, z: lerp(2.9, 3.05, u / 4.25) });
    const cam = Object.assign(path(lt), hand(s, 95, 3, 0.4));
    blScene(g, s, cam, {
      mid: (q) => {
        for (let j = 0; j < 7; j++) {
          const L = GANG[j], V = 46 * L.sc, x = RK[j], y = BL.sand + 10;
          const plant = clamp((b - j * 0.5) / 0.5), shaking = b > 4 && b < 8;
          const sh = shaking ? sin(t * 40 + j) * 0.14 : 0;
          // 倒插在沙里的瓶子（瓶盖朝下）
          if (plant > 0) { const drop = (1 - ease.out(plant)) * 160; bottle(q, s, x, y - 70 - drop + 6, 76, PI + sh, { fl: FLAVORS[j % 4], cap: true }); if (plant < 1 && plant > 0.8) sparkle(q, x, y, 20, 0.8, 0); }
          // 小羊抱着瓶子（在瓶子后面一点）
          const [hy, sq] = shaking ? [0, 0.15 * sin(t * 40)] : hop(fract(b * 2 + j * 0.3));
          lamb(q, s, x - 34, y + 4 - hy * 18, V, { kind: L.k, pose: shaking ? 'push' : hy > 0.3 ? 'jump' : 'stand', sq, rot: sh * 0.6, expr: shaking ? 'determined' : 'happy', t });
          shadow(q, x - 20, y + 6, 90, 0.4);
          if (shaking) for (let i = 0; i < 3; i++) { const ph = fract(t * 2.5 + i / 3 + j * 0.1); bubble(q, x + sin(t * 40 + i) * 6, y - 80 - ph * 50, 3 + ph * 4, 0.8 * (1 - ph), 'fizz'); }
        }
        // 倒数
        for (const [bb, str] of [[5, '3'], [6, '2'], [7, '1']]) { const a = b - bb; if (a > 0 && a < 1) sfx(q, str, RK[3] - 60, BL.sand - 170, 80, clamp(a / 0.15), { color: '#fff27a', rot: -0.1, alpha: 1 - clamp((a - 0.7) / 0.3) }); }
      },
    });
    s.post.vignette(g, 0.3);
  }
  /* ---------- 升空（98.23 → 102.48）：一个接一个点火——汽水火箭拖着泡沫尾巴冲上天 ---------- */
  const LAUNCH = [98.23, 99.28, 99.69, 99.82, 100.35, 100.75, 101.41];
  function rocketY(a) { return a < 0 ? 0 : 170 * a + 400 * a * a; }
  function shotLaunch(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp((lt - 0.8) / 3.4));
    const cam = { x: 940, y: lerp(770, 60, k), z: lerp(2.9, 1.15, k), ...hand(s, 97, 3, 0.4), ...shake(s, 4 * s.acc(0.15), 99, 26) };
    blScene(g, s, cam, {
      gFade: k,
      mid: (q) => {
        for (let j = 0; j < 7; j++) {
          const L = GANG[j], V = 46 * L.sc, x0 = RK[j], y0 = BL.sand + 10, a = t - LAUNCH[j];
          const ry = rocketY(a), drift = a > 0 ? sin(a * 3 + j) * 40 * a : 0;
          const bx = x0 + drift, by = y0 - 64 - ry;
          // 尾迹：从沙面到瓶口的一串泡沫团
          if (a > 0) {
            const n = 14;
            for (let i = 0; i < n; i++) { const u = i / n, ay = lerp(y0, by + 70, u), ax = lerp(x0, bx, u) + sin(u * 9 + t * 6) * 10, age = a * (1 - u); foam(q, ax, ay, 26 + age * 40, max(0, 1 - age * 0.45) * 0.9, i + j, true, u * 3); }
            if (a < 0.35) { popBurst(q, x0, y0 - 10, 90, a / 0.35, 100 + j); sfx(q, '咻——', x0 + 40, y0 - 120, 34, clamp(a / 0.1), { color: '#ffffff', rot: -0.2, alpha: 1 - clamp((a - 0.25) / 0.1) }); }
          }
          bottle(q, s, bx, by, 76, PI + (a > 0 ? sin(a * 8 + j) * 0.12 : 0), { fl: FLAVORS[j % 4], cap: a < 0 });
          const Lx = bx - 30, Ly = by + (a > 0 ? -10 : 74);
          lamb(q, s, Lx, Ly, V, { kind: L.k, pose: a > 0 ? 'jump' : 'push', rot: a > 0 ? -0.3 : 0, expr: a > 0 ? 'happy' : 'determined', t });
          if (a > 0) spray(q, t, { t0: LAUNCH[j], x: bx, y: by + 70, n: 16, dur: 1.5, speed: 380, spread: 1.0, ang: PI / 2, grav: 600, r: 6, seed: 150 + j, color: FLAVORS[j % 4] });
        }
      },
    });
    const fin = t - 101.94; if (fin > 0) s.post.fill(g, '#ffffff', 0.35 * exp(-fin * 5) * flashK(s), 'lighter');
    s.post.vignette(g, 0.28);
  }

  /* =========================================================
   * 悬停（断拍 102.48 → 113.10）：最高处，时间停了一下
   * ========================================================= */
  /** 高空的天：上深下浅，底下是一片云海 */
  function highSky(q) {
    q.fillStyle = vg(q, -400, VH + 300, [[0, '#0f5ec8'], [0.4, '#3a98e8'], [0.75, '#9ad8f6'], [1, '#e8f8fc']]); q.fillRect(-600, -400, VW + 1200, VH + 700);
  }
  function cloudSea(q, s, t, y, o = {}) {
    for (let i = 0; i < 9; i++) { const w = 700 + hash(501, i) * 500, x = ((hash(502, i) * 3200 + t * (o.v ?? 10)) % 3200) - 700; cumulus(q, s, 'cs' + (i % 4), x, y + hash(503, i) * 160 + w * 0.2, w, w * 0.42, 130 + (i % 4), 0.95); }
  }
  /* ---------- 悬停（102.48 → 106.73）：慢动作——水滴像玻璃珠一样停在空中，瓶盖慢慢转 ---------- */
  function shotApex(g, s) {
    const t = s.t, lt = s.lt, slow = t * 0.12;
    const cam = { x: 960, y: 540, z: 1 + lt * 0.03, r: lerp(-0.06, 0.04, ease.inOut(clamp(lt / 4.25))) };
    g.drawImage(LC(s, 'highsky', VW, VH, (q) => { q.translate(0, 0); highSky(q); }, 0.4), 0, 0, VW, VH);
    inCam(g, cam, 0.2, (q) => { sun(q, 1480, 250, 60, 1, 1.1); s.kit.rays(q, t, { x: 1480, y: 250, n: 9, len: 1800, spread: 2.6, angle: PI * 0.85, rgb: '255,246,220', alpha: 0.12, seed: 5 }); });
    inCam(g, cam, 0.35, (q) => cloudSea(q, s, t, 980, { v: 6 }));
    inCam(g, cam, 0.7, (q) => {
      // 远一点的小羊们（慢慢转）
      for (let j = 0; j < 5; j++) {
        const L = GANG[j + 1], x = 300 + j * 330 + sin(slow + j) * 30, y = 360 + (j % 2) * 170 + cos(slow * 1.3 + j) * 20, V = 70 + (j % 3) * 20;
        bottle(q, s, x + 6, y + 8, V * 1.6, PI + sin(slow + j) * 0.3, { fl: FLAVORS[j % 4], cap: false });
        lamb(q, s, x, y, V, { kind: L.k, pose: 'jump', spin: sin(slow * 2 + j) * 0.5, expr: 'happy', flip: j % 2 === 1 });
        for (let i = 0; i < 4; i++) foam(q, x + 6 + sin(i * 2 + j) * 8, y + V * 1.6 + 30 + i * 40, 30 - i * 4, 0.7 - i * 0.14, i + j, true, i);
      }
    });
    inCam(g, cam, 1, (q) => {
      // 停在空中的水滴（每颗带一点彩虹色的闪光）
      for (let i = 0; i < 46; i++) {
        const x = hash(511, i) * 2100 - 90 + sin(slow * 3 + i) * 10, y = hash(512, i) * 1100 - 20 + cos(slow * 2 + i) * 8, r = 6 + hash(513, i) * 16;
        drop(q, x, y, r, PI / 2 + sin(slow + i) * 0.3, 0.9, pick(['pink', 'cyan', 'white', 'lemon', 'mint'], hash(514, i)));
        if (hash(515, i) < 0.4) sparkle(q, x - r * 0.3, y - r * 0.4, r * 1.2, 0.5 + 0.5 * sin(t * 2 + i), t * 0.2, pick(['255,200,230', '200,240,255', '255,250,200'], hash(516, i)));
      }
      // 带头的那只（近景，大）
      const bx = 700 + sin(slow) * 20, by = 640 + cos(slow * 1.2) * 16;
      bottle(q, s, bx + 12, by + 16, 380, PI - 0.25 + sin(slow) * 0.05, { fl: 'pink', cap: false });
      lamb(q, s, bx, by, 250, { kind: 'boss', pose: 'jump', rot: -0.25 + sin(slow) * 0.05, expr: 'happy', t });
      // 飞出去的瓶盖：画面中间，慢慢转
      bottleCap(q, s, 1240 + lt * 10, 470 - lt * 14, 92, slow * 5, 0.3 + 0.7 * abs(sin(t * 0.9)));
      sparkle(q, 1240 + lt * 10 - 40, 440 - lt * 14, 60, 0.6 + 0.4 * sin(t * 3), t * 0.4, '255,250,235');
    });
    // 景深：最前面几颗虚掉的大泡泡
    for (let i = 0; i < 5; i++) { const x = hash(517, i) * VW, y = hash(518, i) * VH, r = 120 + hash(519, i) * 120; additive(g, (q) => { q.globalAlpha = 0.28; q.drawImage(bubbleSpr('soap'), x - r + sin(slow + i) * 20, y - r, r * 2, r * 2); q.globalAlpha = 1; }); }
    s.post.letterbox(g, 1);
    s.post.vignette(g, 0.38);
  }

  /* ---------- 从天上往下看（106.73 → 110.97）：整个汐斯塔在脚下，像一瓶刚摇过的汽水 ---------- */
  function siestaMap(q) {
    // 世界 2400×1500 的“斜俯视地图”：上面是海平线，下面是近处
    q.fillStyle = vg(q, 0, 1500, [[0, '#9adff0'], [0.25, '#46c2da'], [1, '#2a9cc4']]); q.fillRect(0, 0, 2400, 1500);
    const R = E.rng(601);
    for (let i = 0; i < 700; i++) { const y = 40 + R() * 1460; q.fillStyle = `rgba(255,255,255,${0.08 + R() * 0.2})`; q.fillRect(R() * 2400, y, 6 + (y / 1500) * 40, 1 + y / 900); }
    // 陆地（右边一大片 + 左边的岬角）
    q.fillStyle = '#f2dcae'; q.beginPath(); q.moveTo(900, 1500); q.bezierCurveTo(950, 1100, 1100, 800, 1350, 560); q.bezierCurveTo(1500, 420, 1750, 300, 2400, 240); q.lineTo(2400, 1500); q.closePath(); q.fill();
    q.fillStyle = '#9cc8a6'; q.beginPath(); q.moveTo(1000, 1500); q.bezierCurveTo(1060, 1120, 1200, 830, 1420, 610); q.bezierCurveTo(1580, 470, 1800, 360, 2400, 300); q.lineTo(2400, 1500); q.closePath(); q.fill();
    // 木栈道（沿岸一条）
    q.strokeStyle = '#c8905a'; q.lineWidth = 14; q.beginPath(); q.moveTo(975, 1500); q.bezierCurveTo(1030, 1120, 1170, 820, 1400, 590); q.bezierCurveTo(1560, 450, 1780, 336, 2400, 272); q.stroke();
    // 小镇：一格格彩色屋顶（带影子）
    for (let i = 0; i < 260; i++) {
      const u = R(), v = R(), x = lerp(1100, 2380, u) + (1 - v) * 0, y = lerp(330, 1480, v);
      if (x < 1060 + (1500 - y) * 0.2 + 120) continue;
      const w = 30 + R() * 50, h = 20 + R() * 34;
      q.fillStyle = 'rgba(40,60,90,0.25)'; q.fillRect(x + 6, y + 6, w, h);
      q.fillStyle = pick(['#fbf6ee', '#f39ab4', '#f7b09a', '#7fd0c8', '#f6d98a', '#c9b6ec', '#fbf6ee', '#e07a5a'], R()); q.fillRect(x, y, w, h);
      if (R() < 0.3) { q.fillStyle = '#3f8fd8'; q.beginPath(); q.arc(x + w / 2, y + h / 2, min(w, h) * 0.35, 0, TAU); q.fill(); }
    }
    for (let i = 0; i < 60; i++) { const x = 1150 + R() * 1250, y = 360 + R() * 1100; q.fillStyle = '#3f8a52'; q.beginPath(); q.arc(x, y, 10 + R() * 12, 0, TAU); q.fill(); }
    // 港口：防波堤 + 小船
    q.fillStyle = '#d8d0c8'; q.fillRect(1180, 700, 260, 16); q.fillRect(1430, 560, 16, 156);
    for (let i = 0; i < 10; i++) { const x = 1200 + (i % 5) * 46, y = 610 + floor(i / 5) * 50; q.fillStyle = '#fbfbf6'; q.beginPath(); q.ellipse(x, y, 16, 6, -0.3, 0, TAU); q.fill(); q.fillStyle = pick(['#e0424e', '#3fa6d8', '#f6c040'], hash(602, i)); q.fillRect(x - 4, y - 2, 8, 3); }
    // 岬角 + 博物馆（左上）
    q.fillStyle = '#9cc8a6'; q.beginPath(); q.ellipse(430, 250, 300, 110, -0.2, 0, TAU); q.fill();
    q.fillStyle = '#ece6f4'; q.fillRect(390, 220, 80, 44); q.fillStyle = '#4a5a7a'; q.beginPath(); q.arc(370, 242, 20, 0, TAU); q.fill();
    // 火山（右上，远）
    q.fillStyle = '#8f98c4'; q.beginPath(); q.ellipse(2150, 140, 260, 110, 0, 0, TAU); q.fill(); q.fillStyle = '#6a6aa0'; q.beginPath(); q.ellipse(2150, 120, 60, 24, 0, 0, TAU); q.fill();
    // 远处的雾
    q.fillStyle = vg(q, 0, 500, [[0, 'rgba(230,246,252,0.85)'], [1, 'rgba(230,246,252,0)']]); q.fillRect(0, 0, 2400, 500);
  }
  function shotAbove(g, s) {
    const t = s.t, lt = s.lt, slow = t * 0.3;
    const k = ease.inOut(clamp(lt / 4.25));
    g.fillStyle = '#9adff0'; g.fillRect(0, 0, VW, VH);
    // 地图（斜俯视，慢慢往后退）
    inCam(g, { x: lerp(1300, 1240, k), y: lerp(760, 700, k), z: lerp(1.06, 1.0, k), r: 0.05 }, 0.25, (q) => {
      q.save(); q.translate(-240, -40); q.drawImage(LC(s, 'siesta-map', 2400, 1500, siestaMap, 0.55), 0, 0, 2400, 1500);
      // 汽水喷泉：从上往下看是一团粉色的泡沫 + 一圈圈往外散的波纹
      const gx = 1290, gy = 900;
      for (let i = 0; i < 3; i++) { const ph = fract(t * 0.5 + i / 3); q.strokeStyle = `rgba(255,150,200,${0.6 * (1 - ph)})`; q.lineWidth = 4; q.beginPath(); q.ellipse(gx, gy, 30 + ph * 140, (30 + ph * 140) * 0.6, 0, 0, TAU); q.stroke(); }
      for (let i = 0; i < 6; i++) foam(q, gx + cos(i + t) * 22, gy + sin(i + t) * 12, 34, 0.95, i, true, t + i);
      bigPlume(q, t, 2150, 110, 0.5, 0.7);
      q.restore();
    });
    // 空气：薄薄一层云从镜头前飘过
    inCam(g, { x: 960, y: 540, z: 1 }, 0.5, (q) => { for (let i = 0; i < 4; i++) cumulus(q, s, 'ab' + i, ((i * 800 + t * 40) % 3000) - 600, 300 + i * 220, 700, 260, 140 + i, 0.55); });
    // 近景：躺在空中的小羊们
    inCam(g, { x: 960, y: 540, z: 1 + lt * 0.02 }, 1, (q) => {
      const pose = [[420, 360, 'bell', 'float', 0], [1500, 300, 'geek', 'float', 1], [760, 820, 'pink', 'sleep', 2], [1340, 760, 'pink', 'float', 3]];
      for (const [x, y, kk, p, j] of pose) { const yy = y + sin(slow * 2 + j) * 14; lamb(q, s, x + sin(slow + j) * 20, yy, 150, { kind: kk, pose: p, rot: sin(slow + j) * 0.2, expr: j === 1 ? 'surprise' : 'happy', flip: j % 2 === 1, t, fx: j === 2 ? ['zzz'] : null }); }
      // 一只张嘴接住飘过来的水滴
      const dx = lerp(1700, 1560, clamp(lt / 2.5)), dy = lerp(200, 250, clamp(lt / 2.5));
      if (lt < 2.5) drop(q, dx, dy, 16, PI / 2, 1, 'cyan'); else { popBurst(q, 1560, 250, 80, clamp((lt - 2.5) / 0.5), 61); if (lt < 3.2) sfx(q, '咕嘟', 1640, 170, 40, clamp((lt - 2.5) / 0.1), { color: '#bdf6ff', rot: 0.1 }); }
      for (let i = 0; i < 10; i++) { const ph = fract(t * 0.18 + hash(621, i)); bubble(q, hash(622, i) * VW, VH + 80 - ph * (VH + 200), 30 + hash(623, i) * 40, 0.7 * sin(PI * ph)); }
    });
    s.post.letterbox(g, 1);
    s.post.vignette(g, 0.35);
  }

  /* ---------- 坏笑（110.97 → 113.10）：带头的冲镜头一笑——“再来！”——火箭重新点火，往下冲 ---------- */
  function shotGrin(g, s) {
    const t = s.t, lt = s.lt;
    const fire = 112.5 - s.shot.t0, fk = lt - fire;
    g.drawImage(LC(s, 'highsky', VW, VH, highSky, 0.4), 0, 0, VW, VH);
    inCam(g, { x: 960, y: 540, z: 1 }, 0.3, (q) => cloudSea(q, s, t, 1020, { v: 20 }));
    const cam = { x: 960, y: 540 + (fk > 0 ? -fk * fk * 1600 : 0), z: 1 + lt * 0.05, ...(fk > 0 ? shake(s, 10, 103, 30) : hand(s, 101, 2, 0.3)) };
    inCam(g, cam, 1, (q) => {
      const x = 900, y = 720 + (fk > 0 ? fk * fk * 2600 : 0);
      bottle(q, s, x + 20, y + 20, 560, PI - 0.2, { fl: 'pink', cap: false });
      lamb(q, s, x, y, 420, { kind: 'boss', pose: 'stand', rot: -0.15, expr: lt > 0.3 ? 'happy' : 'neutral', t, fx: lt > 0.45 && lt < 1.3 ? ['stars'] : null });
      const bp = lt - 1.0;
      if (bp < 0) bubble(q, lerp(1500, 1180, clamp(lt / 1.0)), lerp(300, 560, clamp(lt / 1.0)), 40, 0.9);
      else if (bp < 0.4) popBurst(q, 1180, 560, 110, bp / 0.4, 107);
      if (fk > 0) { for (let i = 0; i < 10; i++) foam(q, x + 20 + (hash(108, i) - 0.5) * 120, y + 560 + i * 40, 80 + i * 10, 0.9, i, true, i); sfx(q, '冲呀——！', 1320, 360, 80, clamp(fk / 0.12), { color: '#fff27a', rot: -0.1 }); }
    });
    s.post.letterbox(g, 1 - clamp(fk / 0.3));
    s.post.vignette(g, 0.35);
  }

  /* =========================================================
   * 世界 5 · 港口（横向：x 0..4200）：海平线 y = 420；小镇 470–600；港湾水面 600–900；码头 900 以下
   * ========================================================= */
  const HB = { hz: 420, water: 610, quay: 900 };
  const HB_TOWN = resortRow(701, -200, 4400, 600, 110, 260, 70, 150);
  function hbFar(q) {
    volcanoFar(q, 3000, 150, HB.hz + 4, 800, { c0: '#8f98c4', c1: '#a4b4d8', c2: '#cfe2f0' });
    q.fillStyle = '#9cc8b0'; q.beginPath(); q.moveTo(-400, HB.hz + 30); q.bezierCurveTo(600, HB.hz - 40, 1600, HB.hz - 90, 2600, HB.hz - 60); q.bezierCurveTo(3400, HB.hz - 40, 4000, HB.hz, 4600, HB.hz + 20); q.lineTo(4600, 700); q.lineTo(-400, 700); q.closePath(); q.fill();
    for (const b of HB_TOWN) retroBuilding(q, b, { detail: 0.5, lw: 1.6 });
    for (let i = 0; i < 16; i++) { const x = hash(702, i) * 4400 - 200; palm(q, x, 604, 110 + hash(703, i) * 80, 0, { seed: 710 + i, n: 7 }); }
    q.fillStyle = vg(q, 300, 620, [[0, 'rgba(220,242,252,0)'], [0.45, 'rgba(220,242,252,0.36)'], [1, 'rgba(230,246,252,0.15)']]); q.fillRect(-400, 300, 5000, 320);
  }
  function hbWater(q) {
    q.fillStyle = vg(q, HB.water - 10, HB.quay + 40, [[0, '#4cc4d8'], [0.4, '#2aa6c6'], [1, '#1f86b0']]); q.fillRect(-400, HB.water - 10, 5000, HB.quay - HB.water + 60);
    const R = E.rng(721);
    for (let i = 0; i < 400; i++) { const y = HB.water + R() * (HB.quay - HB.water); q.fillStyle = `rgba(255,255,255,${0.1 + R() * 0.2})`; q.fillRect(R() * 4800 - 400, y, 10 + R() * 60, 1.5 + (y - HB.water) * 0.006); }
    // 防波堤 + 灯塔（右边）
    q.fillStyle = '#d8d0c8'; q.fillRect(3300, HB.water - 20, 900, 36); q.fillStyle = 'rgba(0,0,0,0.12)'; q.fillRect(3300, HB.water + 10, 900, 8);
    const lx = 3600; q.fillStyle = '#fbfbf6'; q.beginPath(); q.moveTo(lx - 40, HB.water - 20); q.lineTo(lx - 26, HB.water - 300); q.lineTo(lx + 26, HB.water - 300); q.lineTo(lx + 40, HB.water - 20); q.closePath(); q.fill();
    q.fillStyle = '#e0424e'; for (let i = 0; i < 3; i++) { const y0 = HB.water - 60 - i * 80; q.beginPath(); q.moveTo(lx - 38 + i * 5, y0); q.lineTo(lx - 34 + i * 5, y0 - 36); q.lineTo(lx + 34 - i * 5, y0 - 36); q.lineTo(lx + 38 - i * 5, y0); q.closePath(); q.fill(); }
    q.fillStyle = '#2a3a4a'; q.fillRect(lx - 30, HB.water - 346, 60, 46); q.fillStyle = '#fff6d0'; q.fillRect(lx - 22, HB.water - 340, 44, 32); q.fillStyle = '#e0424e'; q.beginPath(); q.moveTo(lx - 36, HB.water - 346); q.lineTo(lx, HB.water - 378); q.lineTo(lx + 36, HB.water - 346); q.closePath(); q.fill();
  }
  /** 一条船（帆船 / 小渔船），(x, y) 吃水线中点；rock 摇晃角 */
  function boat(q, x, y, sc, kind, rock, col) {
    q.save(); q.translate(x, y); q.rotate(rock); q.scale(sc, sc);
    const ink = '#2a3a4a';
    if (kind === 'sail') {
      q.strokeStyle = '#6a5a4a'; q.lineWidth = 6; q.beginPath(); q.moveTo(0, -20); q.lineTo(0, -340); q.stroke();
      q.fillStyle = '#fbfbf6'; q.beginPath(); q.moveTo(6, -330); q.quadraticCurveTo(120, -200, 110, -40); q.lineTo(6, -40); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke();
      q.fillStyle = col; q.beginPath(); q.moveTo(-6, -300); q.lineTo(-90, -46); q.lineTo(-6, -46); q.closePath(); q.fill(); q.stroke();
      q.strokeStyle = ink; q.lineWidth = 1.2; q.beginPath(); q.moveTo(0, -340); q.lineTo(150, -10); q.moveTo(0, -340); q.lineTo(-140, -10); q.stroke();
      for (let i = 0; i < 6; i++) { q.fillStyle = pick(['#ff86b8', '#46c0d0', '#f6c040'], hash(731, i)); q.beginPath(); const u = (i + 1) / 7; q.moveTo(u * 150, -340 + u * 330); q.lineTo(u * 150 + 10, -330 + u * 330); q.lineTo(u * 150 - 4, -326 + u * 330); q.closePath(); q.fill(); }
    } else {
      q.fillStyle = '#fbfbf6'; rrect(q, -50, -86, 90, 60, 8); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke();
      q.fillStyle = '#3fa6d8'; q.fillRect(-40, -76, 26, 20); q.fillRect(-6, -76, 26, 20);
      q.strokeStyle = '#6a5a4a'; q.lineWidth = 4; q.beginPath(); q.moveTo(20, -86); q.lineTo(20, -190); q.lineTo(90, -120); q.stroke();
    }
    q.fillStyle = col; q.beginPath(); q.moveTo(-130, -30); q.lineTo(140, -30); q.quadraticCurveTo(130, 20, 90, 22); q.lineTo(-100, 22); q.quadraticCurveTo(-130, 10, -130, -30); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 2.5; q.stroke();
    q.fillStyle = '#fbfbf6'; q.fillRect(-128, -30, 268, 8);
    q.restore();
    // 倒影
    q.save(); q.globalAlpha *= 0.25; q.fillStyle = col; q.fillRect(x - 110 * sc, y + 14 * sc, 220 * sc, 10 * sc); q.restore();
  }
  const HB_BOATS = [[400, 'sail', 1.0, '#e0424e'], [900, 'fish', 1.1, '#3fa6d8'], [1400, 'sail', 1.2, '#f6c040'], [1950, 'fish', 1.0, '#e8607a'], [2450, 'sail', 1.1, '#46c0d0'], [2950, 'fish', 1.2, '#f0a030'], [3350, 'sail', 0.9, '#9a7ae0']];
  function hbQuay(q) {
    q.fillStyle = vg(q, HB.quay, 1200, [[0, '#d9cbb8'], [1, '#c8b8a2']]); q.fillRect(-400, HB.quay, 5000, 300);
    q.fillStyle = '#b8a890'; q.fillRect(-400, HB.quay, 5000, 18);
    q.strokeStyle = 'rgba(90,70,50,0.3)'; q.lineWidth = 2; for (let r = 0; r < 5; r++) { const y = HB.quay + 18 + r * 36; q.beginPath(); q.moveTo(-400, y); q.lineTo(4600, y); q.stroke(); for (let x = -400 + (r % 2) * 60; x < 4600; x += 120) { q.beginPath(); q.moveTo(x, y); q.lineTo(x, y + 36); q.stroke(); } }
    for (let x = 200; x < 4400; x += 520) { q.fillStyle = '#4a4a54'; rrect(q, x - 16, HB.quay - 34, 32, 40, 8); q.fill(); q.fillStyle = '#6a6a74'; q.beginPath(); q.ellipse(x, HB.quay - 34, 22, 8, 0, 0, TAU); q.fill(); q.strokeStyle = '#c8a870'; q.lineWidth = 5; q.beginPath(); q.moveTo(x, HB.quay - 26); q.quadraticCurveTo(x - 80, HB.quay - 10, x - 170, HB.quay - 60); q.stroke(); }
    for (let x = 500; x < 4400; x += 900) { q.save(); q.translate(x, HB.quay + 30); q.scale(0.34, 0.34); q.translate(-150, -230); crateArt(q, 1 + (x % 5), false); q.restore(); }
  }
  function hbScene(g, s, cam, o = {}) {
    const t = s.t;
    inCam(g, cam, 0.03, (q) => { skyFill(q, -600, HB.hz + 6, [[0, '#2380d8'], [0.5, '#5ab4ee'], [1, '#d6f2fa']]); for (let i = 0; i < 5; i++) cumulus(q, s, 'hb' + i, ((i * 760 - t * 6) % 3600 + 3600) % 3600 - 500, 300 - (i % 2) * 40, 600, 260, 150 + i, 0.95); });
    inCam(g, cam, 0.35, (q) => { q.drawImage(LC(s, 'hb-far', 4800, 560, (qq) => { qq.translate(400, -100); hbFar(qq); }, 0.7), -400, 100, 4800, 560); bigPlume(q, t, 3000, 150, 1.1, 0.7); });
    inCam(g, cam, 0.7, (q) => {
      q.drawImage(LC(s, 'hb-water', 4800, 380, (qq) => { qq.translate(400, -560); hbWater(qq); }, 0.7), -400, 560, 4800, 380);
      for (let i = 0; i < 60; i++) { const y = HB.water + hash(741, i) * 280, x = hash(742, i) * 4400, a = max(0, sin(t * 2.4 + i * 2.1)) * 0.7; if (a > 0.05) { q.globalAlpha = a; q.fillStyle = '#fff'; q.fillRect(x, y, 14, 2); } } q.globalAlpha = 1;
      for (const [x, k, sc, col] of HB_BOATS) boat(q, x, HB.water + 150 + (sc - 1) * 200, sc, k, sin(t * 1.3 + x) * 0.03, col);
      if (o.water) o.water(q);
    });
    inCam(g, cam, 1, (q) => { q.drawImage(LC(s, 'hb-quay', 4800, 320, (qq) => { qq.translate(400, -860); hbQuay(qq); }, 0.8), -400, 860, 4800, 320); if (o.mid) o.mid(q); });
    if (o.after) o.after(g);
  }
  /** 汽水火箭小队（从右往左飞）：x 前沿，y 基准高度；每只上下绕着桅杆穿 */
  function rocketSquad(q, s, t, xl, y0, o = {}) {
    for (let j = 0; j < 7; j++) {
      const L = GANG[j], V = (o.V || 50) * L.sc, x = xl + j * (o.gap || 150) + (j % 2) * 40, y = y0 + sin(t * 3 + j * 1.2) * (o.wave || 70) + (j % 3) * 40;
      const tilt = cos(t * 3 + j * 1.2) * 0.25;
      for (let i = 1; i < 10; i++) foam(q, x + 40 + i * 34, y + 30 + sin(t * 3 + j * 1.2 - i * 0.2) * (o.wave || 70) * 0.2, 12 + i * 3, 0.8 - i * 0.075, i + j, true, i);
      bottle(q, s, x + 40, y + 20, V * 1.5, -PI / 2 - tilt, { fl: FLAVORS[j % 4], cap: false });
      lamb(q, s, x + 26, y - 4, V, { kind: L.k, pose: 'jump', rot: -tilt * 0.6, flip: true, expr: 'happy', t });
    }
  }
  /* ---------- 港口（113.10 → 117.34）：汽水火箭小队贴着桅杆掠过港口，海鸥吓得乱飞 ---------- */
  function shotHarbor(g, s) {
    const t = s.t, lt = s.lt;
    const xl = 3500 - lt * 640;
    const cam = { x: xl + 560 + sin(lt * 1.5) * 40, y: 500, z: 1.5, r: sin(lt * 1.2) * 0.03, ...hand(s, 111, 5, 0.8) };
    hbScene(g, s, cam, {
      water: (q) => {
        rocketSquad(q, s, t, xl, 440, { V: 78, gap: 175, wave: 80 });
        // 被惊起的海鸥
        for (let i = 0; i < 9; i++) { const bx = 3200 - i * 300, a = (3500 - bx) / 640 - lt; const f = clamp(-a * 1.2); if (f <= 0) continue; const gx = bx + f * 200 * (i % 2 ? 1 : -1), gy = 300 - f * 260; q.strokeStyle = '#3a3a4a'; q.lineWidth = 4; q.lineCap = 'round'; const w = sin(t * 12 + i) * 10; q.beginPath(); q.moveTo(gx - 26, gy - 8 - w); q.quadraticCurveTo(gx - 12, gy - 14, gx, gy); q.quadraticCurveTo(gx + 12, gy - 14, gx + 26, gy - 8 - w); q.stroke(); q.lineCap = 'butt'; }
      },
    });
    sparkles(g, t, 12, 113, '255,240,250', { r: 12 });
    s.post.vignette(g, 0.28);
  }
  /** 送货三轮（大一点的版本，给老板骑）：(x, y) 后轮着地的中点，面朝左，wheel 轮子转角 */
  function trikeBig(q, x, y, sc, wheel) {
    q.save(); q.translate(x, y); q.scale(sc, sc);
    const ink = '#2a2a34';
    for (const wx of [-170, 60]) { q.save(); q.translate(wx, -40); q.rotate(wheel); q.strokeStyle = ink; q.lineWidth = 7; q.beginPath(); q.arc(0, 0, 38, 0, TAU); q.stroke(); q.lineWidth = 2; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; q.beginPath(); q.moveTo(0, 0); q.lineTo(cos(a) * 36, sin(a) * 36); q.stroke(); } q.restore(); }
    q.strokeStyle = '#e0424e'; q.lineWidth = 8; q.beginPath(); q.moveTo(60, -40); q.lineTo(-20, -100); q.lineTo(-100, -100); q.moveTo(-20, -100); q.lineTo(-10, -150); q.stroke();
    q.fillStyle = ink; q.fillRect(-26, -160, 44, 10);
    rrect(q, -250, -170, 150, 120, 10); q.fillStyle = '#7fdcc6'; q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
    q.fillStyle = '#fff6fa'; q.beginPath(); q.arc(-175, -110, 40, 0, TAU); q.fill(); q.strokeStyle = '#ff7eb0'; q.lineWidth = 5; q.stroke();
    sheepLogo(q, -175, -108, 30);
    q.restore();
  }
  /* ---------- 三轮车（117.34 → 119.47）：老板骑着送货三轮沿码头猛追，头顶上汽水瓶一只只飞过去 ---------- */
  function shotTrike(g, s) {
    const t = s.t, lt = s.lt;
    const vx = 2700 - lt * 380;
    const cam = { x: vx - 120, y: 760, z: 1.7, ...hand(s, 117, 4, 0.9), ...shake(s, 2, 119, 30) };
    hbScene(g, s, cam, {
      water: (q) => rocketSquad(q, s, t + 0.4, vx - 600 - lt * 200, 420, { V: 44, gap: 130, wave: 40 }),
      mid: (q) => {
        const bob = abs(sin(t * 12)) * 4, wheel = -t * 10;
        // 老板（上半身在货斗后面露出来，身子往前探，一边骑一边指着天）
        // 店主骑在送货三轮的车座上（Sit：坐在座面上，小腿垂向脚蹬），面朝左猛追
        snow(q, s, { x: vx - 2, y: HB.quay + 60 - bob * 0.3 - 152, h: 380, anim: 'Sit', t: t * 3, flip: true, fb: { x: vx + 10, y: HB.quay + 36 - bob, h: 400, pose: 'sit', seat: 120, arms: 'point', aim: 0.9, expr: 'determined', look: [-0.5, -1], flip: true, wind: 0.8, windDir: 1 } });
        trikeBig(q, vx, HB.quay + 60 - bob * 0.3, 1.0, wheel);
        for (let i = 0; i < 3; i++) { q.strokeStyle = `rgba(255,255,255,${0.5 - i * 0.15})`; q.lineWidth = 4; q.beginPath(); q.moveTo(vx + 120 + i * 40, HB.quay - 60 - i * 30); q.lineTo(vx + 200 + i * 40, HB.quay - 60 - i * 30); q.stroke(); }
        sfx(q, '站住——！', vx - 300, HB.quay - 420, 44, clamp(lt / 0.2), { color: '#ffffff', rot: -0.08 });
      },
    });
    s.post.vignette(g, 0.3);
  }

  /* =========================================================
   * 世界 6 · 集市街（横向：x 0..4000）：一排带条纹遮阳篷的店，小羊把遮阳篷当蹦床
   * ========================================================= */
  const MK = { street: 900, awnY: 560 };
  const MK_SHOPS = (() => { const R = E.rng(801), out = []; let x = 0; for (let i = 0; i < 11; i++) { const w = 330 + R() * 90; out.push({ x, w, col: pick(RETRO, R()), trim: pick(RTRIM, R()), awn: pick(['#ff86b8', '#46c0d0', '#f6c040', '#e8607a', '#9a7ae0'], R()), h: 520 + R() * 200, seed: (R() * 1e6) | 0, kind: R() < 0.3 ? 'fruit' : R() < 0.6 ? 'flower' : 'goods' }); x += w + 20; } return out; })();
  function mkBack(q) {
    // 天 → 远处的楼 → 近处一排店（遮阳篷另画，因为要弹）
    q.fillStyle = vg(q, 0, 500, [[0, '#3a9ae6'], [1, '#bfe8f8']]); q.fillRect(-200, -200, 4800, 760);
    for (const b of resortRow(802, -200, 4600, 440, 120, 260, 70, 140)) retroBuilding(q, b, { detail: 0.4, lw: 1.5 });
    for (const S of MK_SHOPS) {
      const b = { x: S.x, w: S.w, top: MK.street - S.h, base: MK.street, kind: 'box', col: S.col, trim: S.trim, style: 0.7, sign: false, awn: false, seed: S.seed };
      retroBuilding(q, b, { detail: 0.9, lw: 2.2 });
      // 店门 + 橱窗
      q.fillStyle = '#2d5a74'; q.fillRect(S.x + 30, MK.street - 250, S.w - 60, 250); q.fillStyle = 'rgba(170,230,255,0.4)'; q.fillRect(S.x + 30, MK.street - 250, (S.w - 60) * 0.3, 250);
      q.strokeStyle = S.trim; q.lineWidth = 6; q.strokeRect(S.x + 30, MK.street - 250, S.w - 60, 250);
      // 摊子
      const sx = S.x + S.w / 2;
      q.fillStyle = '#c8905a'; q.fillRect(sx - 120, MK.street - 90, 240, 16); q.fillRect(sx - 110, MK.street - 74, 12, 74); q.fillRect(sx + 98, MK.street - 74, 12, 74);
      const R = E.rng(S.seed);
      for (let i = 0; i < 9; i++) { const fx = sx - 100 + i * 25, fy = MK.street - 104; if (S.kind === 'fruit') { q.fillStyle = i % 3 ? '#f0a030' : '#3f8a3a'; q.beginPath(); q.arc(fx, fy, i % 3 ? 11 : 15, 0, TAU); q.fill(); if (i % 3 === 0) { q.fillStyle = '#e0424e'; q.beginPath(); q.arc(fx, fy - 2, 9, PI, TAU); q.fill(); } } else if (S.kind === 'flower') { q.fillStyle = '#3e8a4a'; q.fillRect(fx - 2, fy - 20, 4, 24); q.fillStyle = pick(['#ff5f9a', '#ffd070', '#ffffff', '#b48ae0'], R()); q.beginPath(); q.arc(fx, fy - 24, 9, 0, TAU); q.fill(); } else { q.fillStyle = pick(['#46c0d0', '#ff86b8', '#f6c040'], R()); q.fillRect(fx - 9, fy - 16, 18, 22); } }
    }
    // 街面（石板）
    q.fillStyle = vg(q, MK.street, 1200, [[0, '#e8d8c0'], [1, '#f4e6d2']]); q.fillRect(-200, MK.street, 4800, 300);
    q.strokeStyle = 'rgba(120,90,60,0.25)'; q.lineWidth = 2; for (let r = 0; r < 6; r++) { const y = MK.street + 10 + r * r * 8; q.beginPath(); q.moveTo(-200, y); q.lineTo(4600, y); q.stroke(); }
    // 彩旗
    q.strokeStyle = 'rgba(60,40,60,0.6)'; q.lineWidth = 2;
    for (let k = 0; k < 6; k++) { const x0 = k * 760 - 100, x1 = x0 + 760; q.beginPath(); q.moveTo(x0, 330); q.quadraticCurveTo((x0 + x1) / 2, 400, x1, 330); q.stroke(); for (let i = 1; i < 14; i++) { const u = i / 14, x = lerp(x0, x1, u), y = 330 + sin(u * PI) * 35; q.fillStyle = pick(['#ff86b8', '#46c0d0', '#f6c040', '#8fe0c0', '#ffffff'], hash(803, k * 20 + i)); q.beginPath(); q.moveTo(x - 10, y); q.lineTo(x + 10, y); q.lineTo(x, y + 22); q.closePath(); q.fill(); } }
  }
  /** 一块遮阳篷（可以被踩下去：dip 0..1） */
  function mkAwning(q, S, dip) {
    const x0 = S.x + 20, x1 = S.x + S.w - 20, y0 = MK.awnY, n = 8, sw = (x1 - x0) / n, sag = 26 + dip * 60;
    q.save();
    for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 1) / n; q.fillStyle = i % 2 ? '#fff8fc' : S.awn; q.beginPath(); q.moveTo(lerp(x0, x1, u0), y0); q.lineTo(lerp(x0, x1, u1), y0); q.lineTo(lerp(x0, x1, u1) + 10, y0 + 60 + sin(u1 * PI) * sag); q.lineTo(lerp(x0, x1, u0) + 10, y0 + 60 + sin(u0 * PI) * sag); q.closePath(); q.fill(); }
    q.strokeStyle = '#5a2a40'; q.lineWidth = 2.5; q.beginPath(); q.moveTo(x0, y0); q.lineTo(x1, y0); q.lineTo(x1 + 10, y0 + 60); for (let i = n; i >= 0; i--) { const u = i / n; q.lineTo(lerp(x0, x1, u) + 10, y0 + 60 + sin(u * PI) * sag); } q.closePath(); q.stroke();
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; q.fillStyle = i % 2 ? '#fff8fc' : S.awn; q.beginPath(); q.arc(lerp(x0, x1, u) + 10, y0 + 60 + sin(u * PI) * sag, sw / 2, 0, PI); q.fill(); }
    q.restore();
    void sw;
  }
  /* ---------- 集市（119.47 → 123.71）：一拍一个遮阳篷——小羊们一路弹过去；底下的人抬头看，手里的东西都笑掉了 ---------- */
  function shotMarket(g, s) {
    const t = s.t, lt = s.lt, b = bt0(s);
    const lead = (bb) => { const i = max(-1, floor(bb)), u = bb < -1 ? 0 : fract(bb); const A = MK_SHOPS[clamp(1 + i, 0, 10)], Bn = MK_SHOPS[clamp(2 + i, 0, 10)]; const ax = A.x + A.w / 2, bx = Bn.x + Bn.w / 2; return { x: lerp(ax, bx, u), y: MK.awnY - 10 - sin(PI * u) * 260, u, i }; };
    const cam = { x: lead(b - 0.8).x + 60, y: 560, z: 1.9, ...hand(s, 121, 4, 0.7) };
    g.fillStyle = '#bfe8f8'; g.fillRect(0, 0, VW, VH);
    inCam(g, cam, 1, (q) => {
      q.drawImage(LC(s, 'mk-back', 4800, 1400, (qq) => { qq.translate(200, 200); mkBack(qq); }, 0.75), -200, -200, 4800, 1400);
      // 路人（抬头看）
      for (let i = 0; i < 12; i++) { const x = 200 + i * 320 + hash(811, i) * 120; const y = MK.street + 20 + (i % 3) * 10, fl = hash(812, i) < 0.5; extra(q, s, CAMEO[i % 3], { x, y, h: 230, anim: i % 4 === 1 ? 'Interact' : 'Relax', phase: i * 0.61, flip: fl, shadow: 0.5, fb: { x, y, h: 230, pose: i % 3 === 0 ? 'point' : 'look-up', aim: -1.0, t: t + i, seed: 200 + i, flip: fl, expr: 'surprise', look: [0.3, -1], sil: pick(['#5a6fa8', '#6a5a9a', '#4f7f9a', '#7a6090'], hash(813, i)), rim: '255,250,235', rimGlow: 0 } }); }
      // 遮阳篷：被踩下去的那块凹一下
      for (let k = 0; k < MK_SHOPS.length; k++) {
        let dip = 0;
        for (let j = 0; j < 7; j++) { const P = lead(b - j * 0.25); if (P.i + 1 === k - 1 && P.u < 0.2) dip = max(dip, 1 - P.u / 0.2); }
        mkAwning(q, MK_SHOPS[k], dip);
      }
      // 弹跳的小羊（排成一串，一只跟一只）
      for (let j = 0; j < 7; j++) {
        const bb = b - j * 0.25; if (bb < 0) continue;
        const P = lead(bb), L = GANG[j];
        lamb(q, s, P.x, P.y, 62 * L.sc, { kind: L.k, pose: 'jump', sq: P.u < 0.12 ? 0.6 * (1 - P.u / 0.12) : P.u > 0.9 ? 0.3 : -0.15, spin: j === 0 ? -P.u * TAU * (P.i % 2) : 0, expr: 'happy', t });
        if (P.u < 0.1) sfx(q, '嘣', P.x + 40, P.y - 80, 28, 1 - P.u / 0.1, { color: '#fff27a', rot: 0.1, alpha: 1 - P.u / 0.1 });
      }
    });
    s.post.vignette(g, 0.28);
  }

  /* ---------- 晾衣服的小巷（123.71 → 125.84）：从巷子深处骑着汽水火箭冲出来，穿过一排排晾着的衣服 ---------- */
  function shotAlley(g, s) {
    const t = s.t, lt = s.lt;
    const VPX = 960, VPY = 430;
    g.drawImage(LC(s, 'alley', VW, VH, (q) => {
      q.fillStyle = vg(q, 0, VPY + 60, [[0, '#4aa8ec'], [1, '#d4f0fa']]); q.fillRect(0, 0, VW, VH);
      // 远处巷口的海
      q.fillStyle = '#46c0d8'; q.fillRect(VPX - 90, VPY - 10, 180, 50);
      // 两边的墙（透视）
      for (const sd of [-1, 1]) {
        const col = sd < 0 ? '#fbf0e0' : '#f7c8d0';
        q.fillStyle = col; q.beginPath(); q.moveTo(VPX + sd * 90, VPY - 260); q.lineTo(VPX + sd * 90, VPY + 60); q.lineTo(VPX + sd * 1100, VH + 80); q.lineTo(VPX + sd * 1100, -200); q.closePath(); q.fill();
        q.fillStyle = sd < 0 ? 'rgba(90,110,190,0.08)' : 'rgba(90,110,190,0.2)'; q.fill();
        // 窗、门、花盆（按深度排）
        for (let k = 0; k < 6; k++) {
          const d = pow(k / 6, 1.6), x = lerp(VPX + sd * 110, VPX + sd * 900, d), y = lerp(VPY - 150, 200, d), w = lerp(20, 160, d), h = lerp(30, 230, d);
          q.fillStyle = '#2d5a74'; q.beginPath(); q.moveTo(x, y); q.lineTo(x + sd * w, y - sd * w * 0.12 * sd); q.lineTo(x + sd * w, y + h); q.lineTo(x, y + h); q.closePath(); q.fill();
          q.fillStyle = pick(SHUTTER, hash(901, k + (sd > 0 ? 10 : 0))); q.fillRect(x - sd * w * 0.18, y, sd * w * 0.14 || 1, h);
          q.fillStyle = '#ff5f9a'; q.beginPath(); q.arc(x + sd * w * 0.5, y + h + lerp(4, 24, d), lerp(4, 26, d), 0, TAU); q.fill();
        }
      }
      // 台阶
      for (let k = 0; k < 14; k++) { const d0 = pow(k / 14, 1.7), d1 = pow((k + 1) / 14, 1.7); const y0 = lerp(VPY + 60, VH + 40, d0), y1 = lerp(VPY + 60, VH + 40, d1); const hw0 = lerp(90, 1100, d0), hw1 = lerp(90, 1100, d1); q.fillStyle = k % 2 ? '#e8d8c0' : '#f4e6d2'; q.beginPath(); q.moveTo(VPX - hw0, y0); q.lineTo(VPX + hw0, y0); q.lineTo(VPX + hw1, y1); q.lineTo(VPX - hw1, y1); q.closePath(); q.fill(); q.fillStyle = 'rgba(120,90,60,0.25)'; q.fillRect(VPX - hw1, y1 - 3, hw1 * 2, 3); }
    }, 0.8), 0, 0, VW, VH);
    // 晾衣绳（一排排，越近越大）
    const lines = 5;
    const flyD = (j) => clamp((lt - j * 0.14) / 1.9);   // 小羊的深度 0（远）→ 1（冲出画面）
    for (let k = 0; k < lines; k++) {
      const d = pow((k + 1) / (lines + 1), 1.3), y = lerp(VPY - 120, -60, d), hw = lerp(90, 1100, d), sc = lerp(0.15, 1.3, d);
      g.strokeStyle = 'rgba(80,60,60,0.7)'; g.lineWidth = max(1, 3 * sc); g.beginPath(); g.moveTo(VPX - hw, y); g.quadraticCurveTo(VPX, y + 60 * sc, VPX + hw, y); g.stroke();
      for (let i = 0; i < 6; i++) { const u = (i + 0.5) / 6, x = lerp(VPX - hw, VPX + hw, u), yy = y + sin(u * PI) * 60 * sc * 0.9, sw = sin(t * 3 + i + k) * 0.15; g.save(); g.translate(x, yy); g.rotate(sw); g.fillStyle = pick(['#ff86b8', '#46c0d0', '#f6c040', '#ffffff', '#9a7ae0', '#8fe0c0'], hash(911, k * 10 + i)); if ((i + k) % 3 === 0) { g.fillRect(-40 * sc, 0, 80 * sc, 90 * sc); g.fillRect(-60 * sc, 0, 120 * sc, 30 * sc); } else if ((i + k) % 3 === 1) { g.fillRect(-14 * sc, 0, 28 * sc, 70 * sc); g.fillRect(-14 * sc, 56 * sc, 40 * sc, 20 * sc); } else g.fillRect(-50 * sc, 0, 100 * sc, 60 * sc); g.restore(); }
    }
    // 冲过来的小羊（越来越大）
    for (let j = 6; j >= 0; j--) {
      const d = flyD(j); if (d <= 0 || d >= 1) continue;
      const e = pow(d, 2.2), x = VPX + sin(t * 3 + j * 1.7) * 300 * e + (j - 3) * 40 * e, y = lerp(VPY - 40, 700, e) + cos(t * 2.4 + j) * 80 * e, V = lerp(8, 420, e);
      bottle(g, s, x + V * 0.3, y + V * 0.2, V * 1.5, -PI / 2 + 0.3, { fl: FLAVORS[j % 4], cap: false });
      lamb(g, s, x, y, V, { kind: GANG[j].k, pose: 'jump', expr: 'happy', flip: false, t });
      if (j === 2 && e > 0.3) { g.fillStyle = '#ffffff'; g.save(); g.translate(x + V * 0.2, y - V * 0.8); g.rotate(0.4); g.fillRect(-V * 0.08, 0, V * 0.16, V * 0.34); g.fillRect(-V * 0.08, V * 0.26, V * 0.24, V * 0.1); g.restore(); }
    }
    s.post.vignette(g, 0.34);
  }

  /* =========================================================
   * 世界 7 · 屋顶（看向海湾）：海平线 y = 440；山下的小镇 480–720；邻居家的屋顶 620–820；主屋顶的女儿墙 y = 800，屋顶面 800 以下
   *   gold 0..1：下午 → 黄昏（天色、光、阴影随之变）
   * ========================================================= */
  const RF = { hz: 440, wall: 800 };
  const RF_TOWN = resortRow(1001, -400, 2800, 690, 60, 170, 50, 120);
  const RF_NEAR = [[-380, 250, 640, 'tank'], [-120, 330, 700, 'pergola'], [1880, 300, 660, 'antenna'], [2200, 360, 610, 'tank'], [2480, 300, 690, 'line']];
  function roofSkyStops(gk) {
    return [[0, mixC('#2380d8', '#4a4aa8', gk)], [0.45, mixC('#5ab4ee', '#e48ab8', gk)], [0.8, mixC('#bfeaf8', '#ffc2a0', gk)], [1, mixC('#e2f6fa', '#ffe0b0', gk)]];
  }
  function roofFar(q, gk) {
    // 海湾 + 岬角上的博物馆（左）+ 火山（右）
    q.fillStyle = vg(q, RF.hz, 720, [[0, mixC('#7fd8e8', '#f0b0c0', gk * 0.8)], [0.4, mixC('#3ab8d4', '#9a7ac0', gk * 0.7)], [1, mixC('#2aa0c4', '#6a5aa8', gk * 0.7)]]); q.fillRect(-500, RF.hz, 3400, 300);
    const R = E.rng(1002);
    for (let i = 0; i < 300; i++) { const y = RF.hz + 3 + pow(R(), 1.6) * 230; q.fillStyle = gk > 0.5 ? `rgba(255,220,180,${0.15 + R() * 0.3})` : `rgba(255,255,255,${0.12 + R() * 0.25})`; q.fillRect(R() * 3400 - 500, y, 10 + R() * 50, 1.5 + (y - RF.hz) * 0.01); }
    q.fillStyle = mixC('#86b4a4', '#6a5a8a', gk * 0.7); q.beginPath(); q.moveTo(-500, RF.hz + 6); q.bezierCurveTo(-200, RF.hz - 6, 0, RF.hz - 46, 260, RF.hz - 40); q.bezierCurveTo(420, RF.hz - 34, 520, RF.hz - 10, 660, RF.hz + 6); q.closePath(); q.fill();
    q.fillStyle = mixC('#eee8f4', '#e8c0c8', gk * 0.6); q.fillRect(210, RF.hz - 72, 58, 28); q.beginPath(); q.arc(198, RF.hz - 62, 17, PI, 0); q.fill(); q.fillRect(181, RF.hz - 62, 34, 18);
    volcanoFar(q, 2150, 220, RF.hz + 4, 620, { c0: mixC('#8f98c4', '#7a5a9a', gk), c1: mixC('#a4b4d8', '#b07aa8', gk), c2: mixC('#cfe2f0', '#f0a8a8', gk) });
  }
  function roofMid(q, gk) {
    const night = gk * 0.25;
    q.fillStyle = mixC('#9cc8a6', '#8a7aa0', gk * 0.6); q.beginPath(); q.moveTo(-500, 760); q.bezierCurveTo(200, 640, 900, 600, 1500, 610); q.bezierCurveTo(2100, 620, 2600, 660, 3000, 700); q.lineTo(3000, 900); q.lineTo(-500, 900); q.closePath(); q.fill();
    for (const b of RF_TOWN) { const dy = 60 + abs(b.x - 1100) * 0.06; retroBuilding(q, Object.assign({}, b, { top: b.top + dy, base: b.base + dy + 40 }), { detail: 0.45, lw: 1.5, night }); }
    for (let i = 0; i < 12; i++) { const x = hash(1003, i) * 3000 - 400; palm(q, x, 760 + hash(1004, i) * 40, 130 + hash(1005, i) * 90, 0, { seed: 1010 + i, n: 8 }); }
    q.fillStyle = vg(q, 450, 820, [[0, gk > 0.4 ? 'rgba(255,200,180,0)' : 'rgba(220,242,252,0)'], [0.3, gk > 0.4 ? 'rgba(255,200,180,0.32)' : 'rgba(220,242,252,0.32)'], [1, 'rgba(230,246,252,0)']]); q.fillRect(-500, 450, 3500, 370);
  }
  /** 邻居家的屋顶（视差 0.85）：水塔、葡萄架、天线、晾衣绳 */
  function roofNear(q, gk) {
    const ink = 'rgba(60,40,80,0.8)', wall = mixC('#fbf6ee', '#f6c8b8', gk * 0.6), sh = mixC('#d8d0e8', '#b890b0', gk * 0.6);
    for (const [x, w, top, kind] of RF_NEAR) {
      q.fillStyle = wall; q.fillRect(x, top, w, 900 - top); q.fillStyle = sh; q.fillRect(x + w * 0.82, top, w * 0.18, 900 - top);
      q.fillStyle = '#ffffff'; q.fillRect(x - 6, top - 12, w + 12, 14); q.strokeStyle = ink; q.lineWidth = 2; q.strokeRect(x - 6, top - 12, w + 12, 14);
      if (kind === 'tank') { const tx = x + w * 0.5; q.fillStyle = '#6a6a7a'; q.fillRect(tx - 50, top - 60, 8, 60); q.fillRect(tx + 42, top - 60, 8, 60); q.fillStyle = mixC('#c8d4e0', '#d8a8b8', gk * 0.5); rrect(q, tx - 60, top - 170, 120, 110, 14); q.fill(); q.stroke(); q.fillStyle = 'rgba(255,255,255,0.4)'; q.fillRect(tx - 48, top - 160, 12, 90); }
      else if (kind === 'pergola') { q.strokeStyle = '#8a5a3a'; q.lineWidth = 8; for (let i = 0; i < 4; i++) { q.beginPath(); q.moveTo(x + 20 + i * 90, top); q.lineTo(x + 20 + i * 90, top - 150); q.stroke(); } q.lineWidth = 10; q.beginPath(); q.moveTo(x, top - 150); q.lineTo(x + w, top - 150); q.stroke(); for (let i = 0; i < 10; i++) bush(q, x + 20 + i * 32, top - 150 + sin(i) * 6, 22, 1020 + i, true); }
      else if (kind === 'antenna') { q.strokeStyle = '#4a4a5a'; q.lineWidth = 4; q.beginPath(); q.moveTo(x + 150, top); q.lineTo(x + 150, top - 200); for (let i = 0; i < 4; i++) { q.moveTo(x + 110 + i * 5, top - 180 + i * 30); q.lineTo(x + 190 - i * 5, top - 180 + i * 30); } q.stroke(); }
      else { q.strokeStyle = 'rgba(80,60,60,0.7)'; q.lineWidth = 2; q.beginPath(); q.moveTo(x + 20, top - 100); q.quadraticCurveTo(x + w / 2, top - 70, x + w - 20, top - 100); q.stroke(); for (let i = 0; i < 5; i++) { q.fillStyle = pick(['#ff86b8', '#46c0d0', '#f6c040', '#ffffff'], hash(1021, i)); q.fillRect(x + 40 + i * 50, top - 92 + sin(i) * 4, 34, 44); } }
      for (let i = 0; i < 3; i++) { const px = x + 30 + i * (w / 3); q.fillStyle = '#d8784a'; q.fillRect(px - 14, top - 30, 28, 30); bush(q, px, top - 40, 22, 1030 + i + (x | 0), true); }
    }
  }
  /** 主屋顶（视差 1）：女儿墙 + 楼梯间的小屋（门）+ 屋顶面 */
  function roofMain(q, gk) {
    const ink = 'rgba(60,40,80,0.85)', wall = mixC('#fbf6ee', '#f8d0c0', gk * 0.6);
    // 女儿墙（远边）
    q.fillStyle = wall; q.fillRect(-500, RF.wall - 60, 3400, 70); q.fillStyle = '#ffffff'; q.fillRect(-500, RF.wall - 72, 3400, 16);
    q.strokeStyle = ink; q.lineWidth = 2; q.beginPath(); q.moveTo(-500, RF.wall - 72); q.lineTo(2900, RF.wall - 72); q.stroke();
    q.fillStyle = 'rgba(90,110,190,0.12)'; for (let x = -480; x < 2900; x += 160) q.fillRect(x, RF.wall - 56, 8, 56);
    // 屋顶面（陶砖）
    q.fillStyle = vg(q, RF.wall, 1200, [[0, mixC('#e8a47c', '#e89080', gk * 0.4)], [1, mixC('#f0b890', '#f0a890', gk * 0.4)]]); q.fillRect(-500, RF.wall, 3400, 420);
    q.strokeStyle = 'rgba(120,50,30,0.25)'; q.lineWidth = 2;
    for (let k = 0; k < 7; k++) { const y = RF.wall + pow(k / 6, 1.5) * 300; q.beginPath(); q.moveTo(-500, y); q.lineTo(2900, y); q.stroke(); }
    for (let x = -2000; x < 4400; x += 130) { q.beginPath(); q.moveTo(x, RF.wall); q.lineTo(x + (x - 960) * 0.55, 1120); q.stroke(); }
    // 楼梯间小屋（右）：门会被推开
    const hx = 1640;
    q.fillStyle = wall; q.fillRect(hx - 130, RF.wall - 330, 260, 330 + 40); q.fillStyle = '#ffffff'; q.fillRect(hx - 142, RF.wall - 344, 284, 18);
    q.fillStyle = 'rgba(90,110,190,0.18)'; q.fillRect(hx + 80, RF.wall - 330, 50, 370);
    q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(hx - 130, RF.wall - 330, 260, 370);
    q.fillStyle = '#2a1a18'; q.fillRect(hx - 60, RF.wall - 250, 120, 290);
    // 小盆栽 + 一串三角彩旗
    for (const px of [300, 620, 1100, 2100]) { q.fillStyle = '#d8784a'; q.beginPath(); q.moveTo(px - 30, RF.wall + 70); q.lineTo(px + 30, RF.wall + 70); q.lineTo(px + 22, RF.wall + 120); q.lineTo(px - 22, RF.wall + 120); q.closePath(); q.fill(); bush(q, px, RF.wall + 50, 40, 1040 + px, true); }
    q.strokeStyle = 'rgba(60,40,60,0.6)'; q.lineWidth = 2; q.beginPath(); q.moveTo(-200, RF.wall - 260); q.quadraticCurveTo(700, RF.wall - 180, hx - 130, RF.wall - 300); q.stroke();
    for (let i = 1; i < 20; i++) { const u = i / 20, x = lerp(-200, hx - 130, u), y = lerp(RF.wall - 260, RF.wall - 300, u) + sin(u * PI) * 60; q.fillStyle = pick(['#ff86b8', '#46c0d0', '#f6c040', '#8fe0c0'], hash(1050, i)); q.beginPath(); q.moveTo(x - 12, y); q.lineTo(x + 12, y); q.lineTo(x, y + 26); q.closePath(); q.fill(); }
  }
  /** 屋顶世界的一个机位；o: { gold, door(0..1), mid(q), far(q), sky(q), after(g) } */
  function roofScene(g, s, cam, o = {}) {
    const t = s.t, gk = o.gold || 0, gq = Math.round(gk * 4) / 4;
    inCam(g, cam, 0.03, (q) => {
      skyFill(q, -700, RF.hz + 8, roofSkyStops(gk));
      if (gk > 0.2) sun(q, 520, lerp(-100, RF.hz - 40, gk), 70, sst(0.2, 0.7, gk), 0.5);
      for (let i = 0; i < 5; i++) cumulus(q, s, 'rf' + i + ':' + gq, ((i * 720 + t * 5) % 3600) - 700, 330 - (i % 2) * 60, 640, 280, 160 + i, 0.95, { top: mixC('#ffffff', '#fff0e0', gk), mid: mixC('#f6fbff', '#ffd8d0', gk), bot: mixC('#bcd8ee', '#d890b8', gk), res: 0.5 });
      if (o.sky) o.sky(q);
    });
    inCam(g, cam, 0.2, (q) => { q.drawImage(LC(s, 'rf-far:' + gq, 3400, 400, (qq) => { qq.translate(500, -360); roofFar(qq, gq); }, 0.7), -500, 360, 3400, 400); bigPlume(q, t, 2150, 220, 0.9, 0.75); if (o.far) o.far(q); });
    inCam(g, cam, 0.5, (q) => q.drawImage(LC(s, 'rf-mid:' + gq, 3500, 520, (qq) => { qq.translate(500, -400); roofMid(qq, gq); }, 0.75), -500, 400, 3500, 520));
    inCam(g, cam, 0.85, (q) => { q.drawImage(LC(s, 'rf-near:' + gq, 3400, 560, (qq) => { qq.translate(500, -380); roofNear(qq, gq); }, 0.85), -500, 380, 3400, 560); if (o.near) o.near(q); });
    inCam(g, cam, 1, (q) => {
      q.drawImage(LC(s, 'rf-main:' + gq, 3400, 820, (qq) => { qq.translate(500, -400); roofMain(qq, gq); }, 0.9), -500, 400, 3400, 820);
      // 楼梯间的门（被推开：往外转）
      const d = o.door || 0, hx = 1640;
      if (d > 0) { q.fillStyle = '#ffe8c0'; q.fillRect(hx - 60, RF.wall - 250, 120, 290); E.glow(q, hx, RF.wall - 110, 200, '255,230,190', 0.5 * d); }
      q.fillStyle = '#46aebc'; q.beginPath(); q.moveTo(hx - 60, RF.wall - 250); q.lineTo(hx - 60 + 120 * cos(d * 1.4), RF.wall - 250 - d * 20); q.lineTo(hx - 60 + 120 * cos(d * 1.4), RF.wall + 40 + d * 24); q.lineTo(hx - 60, RF.wall + 40); q.closePath(); q.fill(); q.strokeStyle = 'rgba(20,40,50,0.8)'; q.lineWidth = 2.5; q.stroke();
      if (o.mid) o.mid(q);
    });
    // 黄昏的暖光
    if (gk > 0) { s.post.fill(g, mixC('#ffffff', '#ffb080', 1), 0.16 * gk, 'soft-light'); s.post.leak(g, t, { x: 300, y: 500, r: 1100, rgb: '255,170,120', a: 0.35 * gk }); }
    if (o.after) o.after(g);
  }
  /** 立在女儿墙 / 屋顶上的一排汽水瓶（喷泉的“喷口”）：[x, y, 视差层, 瓶高] */
  const RF_JETS = [[180, RF.wall - 72, 1, 70], [520, RF.wall - 72, 1, 70], [860, RF.wall - 72, 1, 70], [-200, 628, 0.85, 50], [2050, 648, 0.85, 50], [2380, 598, 0.85, 50], [300, 690, 0.5, 30], [1500, 700, 0.5, 30], [2300, 720, 0.5, 30]];
  /** 喷泉 k 的开喷时刻（秒） */
  const JET_T = (k) => D[60] + k * BEAT * 0.98;
  function roofJets(q, s, t, depth, o = {}) {
    RF_JETS.forEach(([x, y, d, bh], k) => {
      if (d !== depth) return;
      const a = t - JET_T(k) + (o.shift || 0);
      bottle(q, s, x, y, bh, 0, { fl: FLAVORS[k % 4], cap: a < 0 });
      if (a > 0) geyser(q, t, x, y - bh * 0.92, a, (o.H || 1) * bh * (d === 1 ? 6.5 : 8), bh * 0.42, { seed: 20 + k, lean: (k % 2 ? -0.08 : 0.06), pink: k % 3 !== 2, drops: d === 1 ? 26 : 12, crown: 1, rain: d !== 0.5, fade: o.fade || 0 });
    });
  }
  /** 泡泡烟花：t0 炸开，一圈（两圈）泡泡往外扩散，边飞边闪、最后化成星尘 */
  function bubbleFirework(q, t, x, y, R, t0, hue) {
    const a = t - t0; if (a < 0 || a > 2.2) return;
    const k = 1 - exp(-a * 3.6), fade = pow(1 - a / 2.2, 1.2), drop = 30 * a * a;
    const col = ['255,150,200', '120,220,255', '255,230,120', '170,255,200', '210,170,255'][hue % 5];
    if (a < 0.25) E.glow(q, x, y, R * (1 - a / 0.25) * 0.8, '255,255,255', 0.9);
    E.glow(q, x, y + drop, R * 1.4 * k, col, 0.25 * fade);
    for (let ring = 0; ring < 2; ring++) {
      const n = ring ? 10 : 16, rr = R * k * (ring ? 0.55 : 1);
      for (let i = 0; i < n; i++) { const an = (i / n) * TAU + ring * 0.3 + hue; const bx = x + cos(an) * rr, by = y + sin(an) * rr * 0.9 + drop; bubble(q, bx, by, (ring ? 18 : 26) * (0.6 + 0.6 * (1 - a / 2.2)), fade, 'soap'); E.glow(q, bx, by, 34 * fade, col, 0.35 * fade); if (a > 0.9 && hash(hue, i, ring) < 0.6) sparkle(q, bx, by, 24 * fade + 6, fade, a * 2, col); }
    }
  }
  /** 多利：一大朵粉色的羊形云（闭着眼睛在笑） */
  function dollyCloudArt(q) {
    sheepCloudArt(q);
    q.globalCompositeOperation = 'source-atop'; q.fillStyle = vg(q, 30, 190, [[0, 'rgba(255,214,232,0.55)'], [1, 'rgba(255,140,190,0.55)']]); q.fillRect(0, 0, 320, 200); q.globalCompositeOperation = 'source-over';
    q.strokeStyle = 'rgba(120,60,100,0.8)'; q.lineWidth = 3; q.lineCap = 'round';
    q.beginPath(); q.moveTo(258, 84); q.quadraticCurveTo(266, 76, 274, 84); q.stroke();
    q.beginPath(); q.moveTo(262, 100); q.quadraticCurveTo(270, 108, 280, 98); q.stroke();
    q.fillStyle = 'rgba(255,110,160,0.6)'; q.beginPath(); q.ellipse(250, 98, 8, 5, 0, 0, TAU); q.fill();
  }
  /* ---------- 落地（125.84 → 127.96）：一只只“噗”地降落在屋顶上，眼前是整片海湾 ---------- */
  function shotLand(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.out(clamp(lt / 2.12));
    const cam = { x: lerp(700, 760, k), y: lerp(700, 720, k), z: lerp(1.85, 1.95, k), ...hand(s, 125, 3, 0.4) };
    roofScene(g, s, cam, {
      mid: (q) => {
        for (let j = 0; j < 7; j++) {
          const L = GANG[j], V = 50 * L.sc, tl = j * BEAT / 2 + 0.05, a = lt - tl;
          const lx = 300 + j * 150, ly = RF.wall + 70 + (j % 2) * 30;
          if (a < 0) { const u = 1 + a / 0.8; if (u > 0) { const x = lerp(lx + 600, lx, u), y = lerp(-100, ly, u) - sin(PI * u) * 40; bottle(q, s, x + 30, y + 10, V * 1.5, -PI / 2 + 0.6, { fl: FLAVORS[j % 4], cap: false }); lamb(q, s, x, y, V, { kind: L.k, pose: 'jump', expr: 'happy', flip: true }); } continue; }
          const b = bounce(a, lx, ly - 10, -40, -300, ly, 2600, 0.4, 0.6);
          lamb(q, s, b.x, b.y, V, { kind: L.k, pose: b.n === 0 ? 'jump' : 'stand', sq: b.sq, expr: a > 0.5 ? 'happy' : 'surprise', flip: false, fx: a > 0.6 && j % 3 === 0 ? ['stars'] : null });
          shadow(q, b.x, ly + 2, V * 1.1, 0.4);
          if (a < 0.3) sfx(q, '噗', lx + 30, ly - 90, 30, clamp(a / 0.08), { color: '#ffffff', rot: -0.1, alpha: 1 - clamp((a - 0.2) / 0.1) });
          bottle(q, s, lx + 50 + (j % 2) * 8, ly - 4, V * 1.5, 0, { fl: FLAVORS[j % 4], cap: true });
        }
      },
    });
    sparkles(g, t, 10, 125, '255,250,235', { r: 12 });
    s.post.vignette(g, 0.25);
  }
  /* ---------- 屋顶派对（127.96 → 132.21）：一拍一根汽水喷泉，从近到远在屋顶上一路喷开 ---------- */
  function shotGeysers(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp(lt / 4.25));
    const cam = { x: lerp(820, 1150, k), y: lerp(520, 470, k), z: lerp(1.12, 1.0, k), ...hand(s, 127, 3, 0.4) };
    roofScene(g, s, cam, {
      gold: 0.05,
      far: (q) => roofJets(q, s, t, 0.5),
      near: (q) => roofJets(q, s, t, 0.85),
      mid: (q) => {
        roofJets(q, s, t, 1);
        for (let j = 0; j < 7; j++) { const L = GANG[j], x = 260 + j * 170, [hy, sq] = hop(fract(s.beat + j * 0.14)); lamb(q, s, x, RF.wall + 90 - hy * 50, 50 * L.sc, { kind: L.k, pose: hy > 0.3 ? 'jump' : 'stand', sq, expr: 'happy', flip: j % 2 === 1 }); shadow(q, x, RF.wall + 92, 56, 0.35); }
      },
    });
    s.post.vignette(g, 0.25);
  }
  /* ---------- 踢踏舞（132.21 → 136.46）：一排小羊在女儿墙上跳整齐的踢腿舞，身后的喷泉此起彼伏 ---------- */
  function shotDance(g, s) {
    const t = s.t, lt = s.lt, b = bt0(s);
    const cam = { x: 700 + sin(lt * 0.8) * 30, y: 650, z: 2.6, r: -0.02, ...hand(s, 131, 3, 0.5) };
    roofScene(g, s, cam, {
      gold: 0.12,
      far: (q) => roofJets(q, s, t, 0.5),
      near: (q) => roofJets(q, s, t, 0.85),
      mid: (q) => {
        roofJets(q, s, t, 1);
        // 女儿墙上的一排：同步踢腿、转身
        for (let j = 0; j < 7; j++) {
          const L = GANG[j], x = 380 + j * 105, y = RF.wall - 72;
          const ph = fract(b), bi = floor(b);
          const kick = bi % 4 === 3, spin = bi % 8 === 7;
          const [hy, sq] = hop(ph);
          lamb(q, s, x + (bi % 2 ? 10 : -10), y - hy * (kick ? 70 : 34), 52 * L.sc, { kind: L.k, pose: hy > 0.3 ? 'jump' : 'stand', sq, rot: kick ? (bi % 8 < 4 ? -0.35 : 0.35) * sin(PI * ph) : 0, spin: spin ? ph * TAU : 0, flip: (bi % 4) >= 2, expr: 'happy', t });
        }
        if (floor(b) % 4 === 3) sfx(q, '嘿！', 1120, RF.wall - 260, 44, clamp(fract(b) / 0.1), { color: '#fff27a', rot: 0.12, alpha: 1 - clamp((fract(b) - 0.6) / 0.3) });
        sparkles(q, t, 10, 133, '255,240,250', { x: 300, y: 300, w: 900, h: 400, r: 14 });
      },
    });
    s.post.vignette(g, 0.28);
  }
  /* ---------- 泡泡烟花（136.46 → 140.70）：喷泉顶上炸开一朵朵泡泡烟花，天上那朵粉色的羊形云笑了 ---------- */
  function shotBubbleFw(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp(lt / 4.25));
    const cam = { x: lerp(960, 1040, k), y: lerp(430, 400, k), z: lerp(1.0, 1.06, k), r: lerp(0.02, -0.01, k), ...hand(s, 137, 3, 0.4) };
    roofScene(g, s, cam, {
      gold: 0.3,
      sky: (q) => {
        const dk = sst(0.3, 1.6, lt);
        withAlpha(q, dk, (qq) => { qq.save(); qq.translate(1500, 250 - (1 - dk) * 40); qq.scale(1.9, 1.9); qq.drawImage(LC(s, 'dollycloud', 320, 200, dollyCloudArt, 1.2), -160, -100, 320, 200); qq.restore(); });
        rainbow(q, 900, 780, 760, sst(0.5, 2.5, lt), 110);
      },
      far: (q) => roofJets(q, s, t, 0.5),
      near: (q) => roofJets(q, s, t, 0.85),
      mid: (q) => {
        roofJets(q, s, t, 1);
        // 泡泡烟花：一拍一朵
        for (let i = 0; i < 12; i++) { const t0 = s.shot.t0 + i * BEAT * 0.5 - 0.4; bubbleFirework(q, t, 200 + hash(141, i) * 1500, 170 + hash(142, i) * 240, 240 + hash(143, i) * 140, t0, i); }
        for (let j = 0; j < 7; j++) { const L = GANG[j], x = 260 + j * 170, [hy, sq] = hop(fract(s.beat * 2 + j * 0.14)); lamb(q, s, x, RF.wall + 90 - hy * 60, 50 * L.sc, { kind: L.k, pose: 'jump', sq, expr: 'happy', flip: j % 2 === 1, fx: j === 0 ? ['hearts'] : null }); }
      },
    });
    sparkles(g, t, 26, 139, '255,236,250', { r: 16 });
    s.post.vignette(g, 0.24);
  }
  /* ---------- 老板上屋顶（140.70 → 142.83）：楼梯间的门被推开，一身泡沫的老板喘着气——看呆了，然后笑了 ---------- */
  /** 一身泡沫的店主：o.anim 为官方小人的动画；o.fb 为手绘老板的参数（模型不可用时） */
  function foamyVendor(q, s, o) {
    if (o.anim && snow(q, s, Object.assign({}, o, { fb: null }))) { snowFoam(q, s, o); return; }
    const v = o.fb || o;
    vendor(q, v);
    const top = anchor(vendorKey() || 'crowd', v, 'top', [v.x, v.y - v.h]);
    for (let i = 0; i < 5; i++) foam(q, top[0] - 50 + i * 26, top[1] + 20 + sin(i * 2) * 10, 24 + (i % 2) * 8, 0.95, i, true, i);
    const ch = anchor(vendorKey() || 'crowd', v, 'chest', [v.x, v.y - v.h * 0.55]);
    for (let i = 0; i < 3; i++) foam(q, ch[0] - 50 + i * 50, ch[1] - 40 + (i % 2) * 20, 20, 0.9, i + 3, true, i);
  }
  function shotVendorRoof(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 1600, y: 600, z: 2.1, ...hand(s, 141, 3, 0.4) };
    const door = clamp(lt / 0.3), step = ease.out(clamp((lt - 0.2) / 0.6));
    roofScene(g, s, cam, {
      gold: 0.4, door,
      far: (q) => roofJets(q, s, t, 0.5),
      near: (q) => roofJets(q, s, t, 0.85),
      mid: (q) => {
        { const vx = lerp(1640, 1560, step); foamyVendor(q, s, { x: vx, y: RF.wall + 60, h: 410, anim: lt < 0.8 ? 'Move' : lt < 1.1 ? 'Relax' : 'Interact', speed: 0.8, flip: true, fb: { x: vx, y: RF.wall + 60, h: 420, pose: lt < 1.1 ? 'stand' : 'hips', t, expr: lt < 1.1 ? 'surprise' : 'laugh', look: [-1, -0.5], flip: true, nohat: false } }); }
        for (let i = 0; i < 8; i++) { const ph = fract(t * 0.5 + i / 8); drop(q, 1520 + hash(145, i) * 160, RF.wall - 320 + ph * 360, 7, PI / 2, (1 - ph) * 0.8, 'pink'); }
        if (lt > 1.1) sfx(q, '哈哈哈！', 1400, RF.wall - 420, 44, clamp((lt - 1.1) / 0.15), { color: '#fff27a', rot: -0.1 });
      },
    });
    s.post.vignette(g, 0.3);
  }
  /* ---------- 干杯（142.83 → 144.95）：老板举起汽水——一只（他看不见的）小羊也举起瓶子，“叮！” ---------- */
  function shotToast(g, s) {
    const t = s.t, lt = s.lt;
    const ck = lt;
    const Sd = SDK(), cardReady = !warmMode && !!(Sd && Sd.card && Sd.card.info && (Sd.card.info('snowsant') || {}).ready);
    if (cardReady) {
      // 特写：店主（夏装剧情立绘）举着汽水笑；带头的小羊从右边跳上来，瓶口对瓶口——“叮！”
      const cam = { x: 1420, y: 470, z: 1.5 + lt * 0.03, ...hand(s, 143, 2, 0.3) };
      roofScene(g, s, cam, { gold: 0.5, far: (q) => roofJets(q, s, t, 0.5), near: (q) => roofJets(q, s, t, 0.85), mid: (q) => roofJets(q, s, t, 1) });
      g.fillStyle = 'rgba(255,236,220,0.12)'; g.fillRect(0, 0, VW, VH);
      const dr = sin(t * 0.8) * 6, bump = ck > 0 && ck < 0.25 ? sin(PI * ck / 0.25) * 14 : 0;
      const cx = 1000 + dr, cy = 420;   // 瓶口相碰的点
      snowCard(g, s, { x: 640 + dr, y: 1150, h: 1150, crop: 'bust', expr: [[s.shot.t0 - 1, 10], [s.shot.t0 + 0.06, 11]], xfade: 0.12, look: [0.55, -0.1], tilt: 0.5 });
      // 她的瓶子：画在立绘前面，瓶身下半截正好压在她抬起的那只手上（像握着）
      const r = 0.6, bh = 400, bx = cx - sin(r) * bh * 0.92, by = cy + cos(r) * bh * 0.92;
      bottle(g, s, bx, by, bh, r, { fl: 'pink', cap: false, fill: 0.7 });
      // 小羊和它的瓶子
      const lr = -0.62, lh = 330, lbx = cx - sin(lr) * lh * 0.92 + bump, lby = cy + cos(lr) * lh * 0.92;
      bottle(g, s, lbx, lby, lh, lr, { fl: 'mint', cap: false, fill: 0.7 });
      lamb(g, s, lbx + 120 + bump, lby + 150, 170, { kind: 'boss', pose: 'jump', rot: 0.18, flip: true, expr: 'happy', t, fx: ck > 0.3 ? ['hearts'] : null });
      if (ck > 0 && ck < 1.2) { sparkle(g, cx, cy, 120 * (1 - ck / 1.2) + 24, 1.2 * (1 - ck / 1.2), ck, '255,250,230'); popBurst(g, cx, cy, 150, ck / 1.2, 147); sfx(g, '叮！', cx + 40, cy - 190, 96, clamp(ck / 0.1), { color: '#fff27a', rot: -0.08, alpha: 1 - clamp((ck - 0.9) / 0.3) }); }
      for (let i = 0; i < 10; i++) { const ph = fract(t * 0.8 + i / 10); bubble(g, cx + sin(i * 2.3) * 60, cy - ph * 260, 8 + ph * 12, 0.8 * (1 - ph), 'fizz'); }
      const ck3 = t - 142.83; if (ck3 > 0) s.post.fill(g, '#fff6e0', 0.18 * exp(-ck3 * 6) * flashK(s), 'lighter');
      s.post.vignette(g, 0.3);
      return;
    }
    const vo = { x: 1560, y: RF.wall + 60, h: 420, pose: 'reach', aim: 0.55, t, expr: 'laugh', look: [-1, -0.3], flip: true };
    // 立绘还没到：官方小人（Interact，举起手）；手的位置来自骨骼锚点
    const so = { x: 1560, y: RF.wall + 60, h: 410, anim: 'Interact', t: 0.45, speed: 0, flip: true };
    const SA = snowA(s, so);
    const hnd = SA && SA.handN ? [SA.handN[0] + 6, SA.handN[1] - 30] : anchor(vendorKey() || 'crowd', vo, 'handN', [1470, RF.wall - 250]);
    // 两只瓶子碰在一起的那一点（瓶口在他手的左上方）
    const vRot = -0.75, vbx = hnd[0] + 12, vby = hnd[1] + 44, [cx, cy] = bottleMouth(vbx, vby, 90, vRot);
    const cam = { x: cx + 40, y: cy + 60, z: 2.9 + lt * 0.05, ...hand(s, 143, 2, 0.3) };
    roofScene(g, s, cam, {
      gold: 0.5,
      far: (q) => roofJets(q, s, t, 0.5),
      near: (q) => roofJets(q, s, t, 0.85),
      mid: (q) => {
        foamyVendor(q, s, SA ? so : { fb: vo });
        bottle(q, s, vbx, vby, 90, vRot, { fl: 'pink', cap: false });
        // 带头的小羊跳起来，用它的瓶子迎上去：瓶口对瓶口
        const lRot = 0.9, lbh = 84, lbx = cx - sin(lRot) * lbh * 0.92 - 6, lby = cy + cos(lRot) * lbh * 0.92 + 2;
        const bump = ck > 0 && ck < 0.25 ? sin(PI * ck / 0.25) * 8 : 0;
        lamb(q, s, lbx - 60 - bump, lby + 58, 86, { kind: 'boss', pose: 'jump', rot: -0.25, expr: 'happy', t, fx: ck > 0.3 ? ['hearts'] : null });
        bottle(q, s, lbx - bump, lby, lbh, lRot, { fl: 'mint', cap: false });
        if (ck > 0 && ck < 1.2) { sparkle(q, cx, cy, 70 * (1 - ck / 1.2) + 18, 1.2 * (1 - ck / 1.2), ck, '255,250,230'); popBurst(q, cx, cy, 90, ck / 1.2, 147); sfx(q, '叮！', cx + 20, cy - 150, 72, clamp(ck / 0.1), { color: '#fff27a', rot: -0.08, alpha: 1 - clamp((ck - 0.9) / 0.3) }); }
        for (let i = 0; i < 8; i++) { const ph = fract(t * 0.8 + i / 8); bubble(q, cx + sin(i * 2.3) * 40, cy - ph * 160, 5 + ph * 8, 0.8 * (1 - ph), 'fizz'); }
      },
    });
    const ck2 = t - 142.83; if (ck2 > 0) s.post.fill(g, '#fff6e0', 0.18 * exp(-ck2 * 6) * flashK(s), 'lighter');
    s.post.vignette(g, 0.3);
  }
  /* ---------- 高潮（144.95 → 149.21）：所有喷泉一起喷，泡泡像一个大圆顶罩住屋顶；镜头一路往后拉 ---------- */
  function shotFinale(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp(lt / 4.25));
    const cam = { x: lerp(900, 1000, k), y: lerp(560, 420, k), z: lerp(1.3, 0.92, k), ...hand(s, 145, 3, 0.4) };
    roofScene(g, s, cam, {
      gold: 0.62,
      sky: (q) => { withAlpha(q, 0.9, (qq) => { qq.save(); qq.translate(1500, 240); qq.scale(1.9, 1.9); qq.drawImage(LC(s, 'dollycloud', 320, 200, dollyCloudArt, 1.2), -160, -100, 320, 200); qq.restore(); }); rainbow(q, 900, 780, 760, 1, 110); },
      far: (q) => roofJets(q, s, t, 0.5, { H: 1.2 }),
      near: (q) => roofJets(q, s, t, 0.85, { H: 1.3 }),
      mid: (q) => {
        roofJets(q, s, t, 1, { H: 1.3 });
        // 泡泡圆顶
        for (let i = 0; i < 40; i++) { const an = PI + (i / 39) * PI, r = 900 + sin(t * 2 + i) * 20; bubble(q, 800 + cos(an) * r, RF.wall - 40 + sin(an) * r * 0.7, 18 + hash(151, i) * 20, 0.7 * sst(0, 1.2, lt)); }
        for (let i = 0; i < 8; i++) bubbleFirework(q, t, 200 + hash(152, i) * 1400, 150 + hash(153, i) * 250, 260, s.shot.t0 + i * BEAT - 0.3, i + 3);
        // 穿过水雾跳来跳去的小羊 + 跟着一起蹦的老板
        for (let j = 0; j < 7; j++) { const L = GANG[j], ph = fract(s.beat + j * 0.14), x = 240 + j * 180 + sin(t + j) * 30, [hy, sq] = hop(ph); lamb(q, s, x, RF.wall + 90 - hy * 90, 50 * L.sc, { kind: L.k, pose: 'jump', sq, spin: j % 3 === 0 ? -ph * TAU : 0, expr: 'happy' }); }
        const [vh] = hop(fract(s.beat * 0.5));
        foamyVendor(q, s, { x: 1500, y: RF.wall + 70 - vh * 40, h: 410, anim: 'Interact', speed: 1.4, flip: true, fb: { x: 1500, y: RF.wall + 70 - vh * 40, h: 420, pose: 'cheer', t, expr: 'laugh', flip: true, look: [-0.5, -0.8] } });
      },
    });
    sparkles(g, t, 30, 149, '255,236,220', { r: 16 });
    s.post.vignette(g, 0.24);
  }
  /* ---------- 打嗝（149.21 → 155.57）：黄昏。肚子圆滚滚的小羊们躺在屋顶上，一个接一个打小嗝；喷泉只剩细细的一点 ---------- */
  function shotHiccup(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp(lt / 6.37));
    const cam = { x: lerp(820, 860, k), y: lerp(640, 660, k), z: lerp(1.45, 1.6, k), ...hand(s, 151, 2, 0.25) };
    const fade = sst(0, 3, lt);
    roofScene(g, s, cam, {
      gold: 0.85 + 0.15 * k,
      far: (q) => roofJets(q, s, t, 0.5, { fade }),
      near: (q) => roofJets(q, s, t, 0.85, { fade }),
      mid: (q) => {
        roofJets(q, s, t, 1, { fade: fade * 0.9, H: 1 - fade * 0.6 });
        // 靠着女儿墙坐着的老板，帽子盖在脸上
        // 店主坐在倒扣的货箱上歇口气（Sit），身上还挂着泡沫
        if (sdOK(SNOW)) crate(q, s, 1180, RF.wall + 70, 0.6, { no: 3, hoof: 0, lid: 0 });
        foamyVendor(q, s, { x: 1178, y: RF.wall + 70 - 230 * 0.6 + 4, h: 400, anim: 'Sit', flip: true, fb: { x: 1180, y: RF.wall + 64, h: 420, pose: 'sit-ground', t, expr: 'content', look: [0, 0.4], flip: true } });
        // 躺成一排的小羊：一个接一个打嗝（冒出一个小泡泡）
        for (let j = 0; j < 7; j++) {
          const L = GANG[j], x = 360 + j * 110, y = RF.wall + 110 + (j % 2) * 14;
          const hb = 149.6 + j * 0.53 + (j > 3 ? 1.2 : 0), ha = t - hb;
          lamb(q, s, x, y, 52 * L.sc, { kind: L.k, pose: 'sleep', rot: (j % 2 ? 0.1 : -0.1), sq: ha > 0 && ha < 0.2 ? -0.25 : 0.12, expr: ha > 0 && ha < 0.4 ? 'surprise' : 'closed', t, fx: j === 6 ? ['zzz'] : null });
          if (ha > 0 && ha < 2.4) { const G = lambGeo(L.k, 'sleep', 52 * L.sc, x, y, false); bubble(q, G.mouth[0] + ha * 20, G.mouth[1] - ha * 90, 10 + ha * 4, 0.9 * (1 - ha / 2.4)); if (ha < 0.4) sfx(q, '嗝', G.top[0] + 20, G.top[1] - 40, 24, clamp(ha / 0.1), { color: '#ffffff', rot: 0.1, alpha: 1 - clamp((ha - 0.3) / 0.1) }); }
        }
        // 最后一个大一点的泡泡（153.45）往上飘
        const la = t - 153.45; if (la > 0) { bubble(q, 700 + la * 30, RF.wall + 20 - la * 240, 34 + la * 6, 0.95); if (la > 1.6) popBurst(q, 700 + 1.6 * 30, RF.wall + 20 - 1.6 * 240, 80, clamp((la - 1.6) / 0.4), 155); }
      },
    });
    s.post.vignette(g, 0.3);
  }

  /* =========================================================
   * 尾声（155.57 → ）：黄昏 → 夜
   * ========================================================= */
  const SKY_DUSK = [[0, '#3a3a8a'], [0.4, '#8a5aa8'], [0.7, '#e888a8'], [0.88, '#ffb89a'], [1, '#ffd8b0']];
  /** 小羊们扛着的货箱：箱子底下露出一排小腿（走路），旁边再跟两只推着；(x, y) 箱底中心 */
  function walkingCrate(q, s, t, x, y, sc, o = {}) {
    const V = o.V || 34, legs = 4, sleepy = o.sleepy ?? 0.5, v = o.v || 0, legF = v > 0 ? v / (V * 0.55) : 5;
    if (sdOK(SD_LAMB.pink)) {
      // 官方小羊：三只驮着箱子一起走（箱子压在它们背上，只露出脸和腿）
      const n = 3, VV = V * 0.95, lift = VV * 0.78, wsp = v > 0 ? v / gaitV('run', VV) : 1;
      for (let i = 0; i < n; i++) { const lx = x - 95 * sc + i * (190 * sc / (n - 1)); lamb(q, s, lx, y, VV, { kind: 'pink', pose: v > 0 ? 'run' : 'stand', t: t + i * 0.23, wspd: wsp, flip: !!o.flip, seed: i }); shadow(q, lx, y + 2, VV * 1.1, 0.3); }
      const bob = abs(sin(t * 5)) * 2;
      crate(q, s, x, y - lift - bob, sc, { no: 7, hoof: 1, lid: o.lid ?? 0, wob: sin(t * 2.5) * 0.02 });
      const fs = o.flip ? -1 : 1;
      if (o.pushers !== false) for (let j = 0; j < 2; j++) { const L = GANG[[0, 2][j]], VV2 = V * L.sc, px = x - fs * (175 * sc + j * V * 1.3); const ws = v > 0 ? v / gaitV('run', VV2) : 1.5; lamb(q, s, px, y, VV2, { kind: L.k, pose: j === 0 ? 'push' : 'run', t, wspd: ws, flip: !!o.flip, fx: j === 1 && sleepy > 0.5 ? ['zzz'] : null }); shadow(q, px, y + 2, VV2 * 1.1, 0.35); }
      return;
    }
    // 箱子底下的小羊（只看得见脚和一点毛）
    for (let i = 0; i < legs; i++) {
      const lx = x - 110 * sc + i * (220 * sc / (legs - 1)), ph = t * legF + i * 1.7;
      q.fillStyle = '#ffd2e2'; q.beginPath(); q.ellipse(lx, y - 6, V * 0.45, V * 0.22, 0, 0, TAU); q.fill();
      q.strokeStyle = '#ec93b4'; q.lineWidth = V * 0.1; q.lineCap = 'round';
      for (const d of [-0.18, 0.18]) { const sw = sin(ph + (d > 0 ? PI : 0)) * V * 0.12; q.beginPath(); q.moveTo(lx + d * V, y - 4); q.lineTo(lx + d * V + sw, y + V * 0.3); q.stroke(); }
      q.lineCap = 'butt';
    }
    const bob = abs(sin(t * 5)) * 3;
    crate(q, s, x, y - bob, sc, { no: 7, hoof: 1, lid: o.lid ?? 0, wob: sin(t * 2.5) * 0.02 });
    // 旁边推着 / 跟着的（o.flip：往左走，推的在右边）
    const fs = o.flip ? -1 : 1;
    if (o.pushers !== false) for (let j = 0; j < 3; j++) { const L = GANG[[0, 1, 6][j]], VV = V * L.sc, px = x - fs * (170 * sc + j * V * 1.2); const wsp = v > 0 ? v / gaitV('run', VV) : 1.5; lamb(q, s, px, y, VV, { kind: L.k, pose: j === 0 ? 'push' : 'run', t, wspd: wsp, expr: sleepy > 0.5 ? 'sleepy' : 'happy', flip: !!o.flip, fx: j === 2 && sleepy > 0.5 ? ['zzz'] : null }); shadow(q, px, y + 2, VV * 1.1, 0.35); }
  }
  /* ---------- 装箱（155.57 → 159.82）：黄昏的汽水摊，一身泡沫；小羊们把剩下的汽水装进 7 号货箱，最小的那只在箱子上按了一个粉色的蹄印 ---------- */
  function shotPack(g, s) {
    const t = s.t, lt = s.lt, b = bt0(s);
    const path = (u) => ({ x: lerp(1040, 1080, u / 4.25), y: lerp(760, 770, u / 4.25), z: lerp(2.0, 2.12, u / 4.25) });
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 157, 2, 0.25));
    const stamp = 158.76, sk = t - stamp;
    // 天：黄昏
    inCam(g, cam, 0.04, (q) => { skyFill(q, -300, 720, SKY_DUSK); sun(q, 300, 560, 70, 0.9, 0.4); for (let i = 0; i < 4; i++) cumulus(q, s, 'dusk' + i, 200 + i * 520 + t * 3, 300 + (i % 2) * 80, 560, 240, 170 + i, 0.9, { top: '#ffd8e0', mid: '#f0a8c0', bot: '#9a70b0', res: 0.5 }); });
    baked(g, s, 'st-far', { x: 960, y: 480, z: 0.8 }, cam, 0.3, standFar, 1.0, [-620, 120, 2540, 810]);
    baked(g, s, 'st-mid', { x: 1000, y: 520, z: 0.8 }, cam, 0.62, standMid, 1.1, [-640, 60, 2560, 860]);
    baked(g, s, 'st-main:pack', B, cam, 1, (q) => standMain(q, {}), B.res, [-320, 60, 2240, 1150]);
    // 黄昏的调色：压暗、偏紫粉
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#c890b8'; g.globalAlpha = 0.55; g.fillRect(0, 0, VW, VH); g.restore();
    s.post.fill(g, '#ff9a70', 0.18, 'soft-light');
    inCam(g, cam, 1, (q) => {
      // 亮起来的招牌灯泡、亭子里的灯
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, bx = 960 + cos(a) * 204, by = 286 + sin(a) * 58; E.glow(q, bx, by, 22, '255,220,150', 0.8); }
      E.glow(q, 980, ST.hatch[0] + 38, 140, '255,210,140', 0.7); E.glow(q, 980, ST.hatch[0] + 38, 30, '255,250,220', 0.9);
      E.glow(q, 280, 350, 90, '255,220,160', 0.8);
      // 到处都是泡沫
      for (let i = 0; i < 14; i++) foam(q, 700 + hash(161, i) * 1300, SG + 20 + hash(162, i) * 60, 34 + hash(163, i) * 30, 0.9, i, true, i);
      for (let i = 0; i < 8; i++) foam(q, 640 + i * 90, 452 + sin(i) * 10, 30, 0.95, i + 5, true, i);
      // 老板又在凳子上睡着了（草帽上还顶着泡沫）
      snowDoze(q, s);
      // 7 号货箱（盖子开着）+ 小羊们一拍一瓶往里放
      const cx = 1180, cy = SG + 50;
      crate(q, s, cx, cy, 0.62, { no: 7, hoof: sk < 0 ? 0 : clamp(sk / 0.4), lid: 0.9, lidFly: [-40, 30, -0.5] });
      for (let k = 0; k < 6; k++) { const a = b - k * 0.9 - 0.3; if (a < 0 || a > 0.7) continue; const u = a / 0.7; bottle(q, s, lerp(cx - 260, cx - 20 + k * 12, u), lerp(cy - 10, cy - 150, u) - sin(PI * u) * 120 + 60, 60, u * 2, { fl: FLAVORS[k % 4] }); }
      for (let j = 0; j < 5; j++) { const L = GANG[j + 1], x = cx - 290 - j * 70, [hy, sq] = hop(fract(b * 0.5 + j * 0.2)); lamb(q, s, x, cy + 6 - hy * 10, 46 * L.sc, { kind: L.k, pose: hy > 0.3 ? 'jump' : 'stand', sq: sq * 0.4, expr: j % 2 ? 'sleepy' : 'happy', flip: false, t, fx: j === 3 ? ['zzz'] : null }); shadow(q, x, cy + 8, 50, 0.4); }
      // 最小的那只：跳上箱子，“啪”地按下一个蹄印
      const tx = cx + 90, ty = cy - 150;
      const jump = clamp((t - (stamp - 0.6)) / 0.6);
      const lx = lerp(cx + 260, tx, ease.out(jump)), ly = lerp(cy + 6, ty, ease.out(jump)) - sin(PI * jump) * 60;
      lamb(q, s, lx, ly, 34, { kind: 'pink', pose: sk > 0 ? 'stand' : 'jump', sq: sk > 0 && sk < 0.2 ? 0.5 : 0, expr: sk > 0 ? 'happy' : 'neutral', flip: true, t });
      if (sk > 0 && sk < 0.6) { sfx(q, '啪', tx + 60, ty - 70, 34, clamp(sk / 0.1), { color: '#ffb0d0', rot: 0.12, alpha: 1 - clamp((sk - 0.45) / 0.15) }); sparkle(q, cx + (221 - 150) * 0.62, cy - (230 - 175) * 0.62, 40 * (1 - sk / 0.6) + 8, 1.2 * (1 - sk / 0.6), 0, '255,200,230'); }
    });
    s.post.vignette(g, 0.42);
  }

  /* =========================================================
   * 世界 8 · 灯笼街（夜）：两边是亮着窗的度假楼，头顶一串串纸灯笼；楼顶上方是海湾那边的烟花
   * ========================================================= */
  const LN = { street: 880 };
  const LN_ROW = resortRow(1201, -300, 4200, LN.street - 10, 250, 420, 160, 280);
  const LANTERN_COL = [['#ff6a5a', '#b82a3a', '255,150,90'], ['#ffb0cc', '#d0507a', '255,160,200'], ['#ffd27a', '#c8842a', '255,210,130'], ['#9fe8f0', '#3a9ab0', '160,230,255']];
  function lanternArt(q, ci) {
    const [c1, c2] = LANTERN_COL[ci];
    q.strokeStyle = '#3a1a22'; q.lineWidth = 2; q.beginPath(); q.moveTo(32, 0); q.lineTo(32, 16); q.stroke();
    q.fillStyle = '#3a1a22'; q.fillRect(20, 14, 24, 7); q.fillRect(22, 72, 20, 6);
    q.fillStyle = rg(q, 27, 40, 2, 34, [[0, '#fff6d8'], [0.4, c1], [1, c2]]); q.beginPath(); q.ellipse(32, 46, 26, 28, 0, 0, TAU); q.fill();
    q.strokeStyle = 'rgba(90,30,30,0.55)'; q.lineWidth = 1.6; for (const k of [0.4, 0.75]) { q.beginPath(); q.ellipse(32, 46, 26 * k, 28, 0, 0, TAU); q.stroke(); } q.beginPath(); q.moveTo(32, 18); q.lineTo(32, 74); q.stroke();
    q.strokeStyle = '#3a1a22'; q.lineWidth = 2; q.beginPath(); q.ellipse(32, 46, 26, 28, 0, 0, TAU); q.stroke();
    q.strokeStyle = '#e0404a'; q.lineWidth = 3; q.beginPath(); q.moveTo(32, 78); q.lineTo(32, 90); q.stroke();
  }
  function lantern(q, s, x, y, h, ci, swing) {
    const sc = h / 92;
    q.save(); q.translate(x, y); q.rotate(swing); q.scale(sc, sc); q.drawImage(LC(s, 'lantern' + ci, 64, 92, (qq) => lanternArt(qq, ci), 2), -32, 0, 64, 92); q.restore();
    const gx = x - sin(swing) * h * 0.5, gy = y + cos(swing) * h * 0.5;
    E.glow(q, gx, gy, h * 1.6, LANTERN_COL[ci][2], 0.55); E.glow(q, gx, gy, h * 0.45, '255,245,220', 0.5);
  }
  function lanternString(q, s, t, x0, y0, x1, y1, sag, n, seed, size = 40) {
    const wob = wobble(seed, t * 0.4) * 8, mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag + wob;
    q.strokeStyle = 'rgba(40,20,40,0.85)'; q.lineWidth = 2; q.beginPath(); q.moveTo(x0, y0); q.quadraticCurveTo(mx, my, x1, y1); q.stroke();
    for (let i = 1; i <= n; i++) { const u = i / (n + 1), x = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * mx + u * u * x1, y = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * my + u * u * y1; lantern(q, s, x, y, size * (0.85 + 0.3 * hash(seed, i, 1)), (seed + i) % 4, sin(t * 1.3 + i * 0.9 + seed) * 0.08); }
  }
  /** 夜空里的烟花（海湾那边）：t0 起每 step 秒一朵 */
  function firework(q, x, y, R, a, hue) {
    if (a < -0.5 || a > 2.2) return;
    const col = ['255,150,200', '255,220,140', '160,230,255', '200,170,255', '170,255,200'][hue % 5];
    if (a < 0) { const u = 1 + a / 0.5; q.strokeStyle = `rgba(${col},0.5)`; q.lineWidth = 3; q.beginPath(); q.moveTo(x, lerp(y + 400, y, u)); q.lineTo(x, lerp(y + 400, y, u) + 50); q.stroke(); E.glow(q, x, lerp(y + 400, y, u), 14, '255,244,220', 0.9); return; }
    const k = 1 - exp(-a * 4), fade = pow(1 - a / 2.2, 1.3), drop = 40 * a * a;
    if (a < 0.3) E.glow(q, x, y, R * (1 - a / 0.3), '255,250,240', 0.8);
    E.glow(q, x, y + drop * 0.4, R * 1.6 * k, col, 0.22 * fade);
    q.save(); q.globalCompositeOperation = 'lighter'; q.strokeStyle = `rgba(${col},${0.8 * fade})`; q.lineWidth = 3; q.lineCap = 'round'; q.beginPath();
    for (let i = 0; i < 18; i++) { const an = (i / 18) * TAU; q.moveTo(x + cos(an) * R * k * 0.7, y + sin(an) * R * k * 0.7 + drop * 0.8); q.lineTo(x + cos(an) * R * k, y + sin(an) * R * k + drop); } q.stroke(); q.restore();
    for (let i = 0; i < 18; i += 2) { const an = (i / 18) * TAU; E.glow(q, x + cos(an) * R * k, y + sin(an) * R * k + drop, 10, col, fade); }
  }
  function fireworkShow(q, t, t0, n, step, seed, o = {}) {
    for (let i = 0; i < n; i++) { const bt = t0 + i * step, a = t - bt; if (a < -0.5 || a > 2.2) continue; firework(q, (o.x0 ?? 200) + hash(seed, i, 1) * (o.w ?? 1500), (o.y0 ?? 120) + hash(seed, i, 2) * (o.h ?? 200), (o.r ?? 110) * (0.75 + 0.6 * hash(seed, i, 3)), a, i + seed); }
  }
  const SKY_NIGHT = [[0, '#0a0a2a'], [0.35, '#1c1848'], [0.7, '#3a2460'], [0.9, '#7a3a78'], [1, '#c0607e']];
  function lnBack(q) {
    for (const b of LN_ROW) retroBuilding(q, b, { detail: 0.9, lw: 2.2, night: 0.8 });
    // 街面
    q.fillStyle = vg(q, LN.street, 1200, [[0, '#3a2a48'], [1, '#4a3656']]); q.fillRect(-400, LN.street, 4800, 320);
    q.strokeStyle = 'rgba(255,200,160,0.12)'; q.lineWidth = 2; for (let r = 0; r < 6; r++) { const y = LN.street + 10 + r * r * 8; q.beginPath(); q.moveTo(-400, y); q.lineTo(4400, y); q.stroke(); }
    // 窗口洒在街上的暖光
    q.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) { const x = hash(1202, i) * 4400 - 300; q.fillStyle = rg(q, x, LN.street + 40, 0, 220, [[0, 'rgba(255,180,110,0.22)'], [1, 'rgba(255,180,110,0)']]); q.fillRect(x - 220, LN.street - 180, 440, 400); }
    q.globalCompositeOperation = 'source-over';
  }
  /* ---------- 灯笼街（159.82 → 164.06）：天黑了，灯笼一串串亮着；小羊们扛着 7 号货箱穿过热闹的街 ---------- */
  function shotLanterns(g, s) {
    const t = s.t, lt = s.lt;
    const cx = 900 + lt * 100;
    const cam = { x: cx + 60, y: 745, z: 1.8, ...hand(s, 161, 3, 0.35) };
    inCam(g, cam, 0.04, (q) => { skyFill(q, -400, 760, SKY_NIGHT); s.kit.stars(q, t, { n: 90, seed: 31, y: -200, h: 700, size: 2.4 }); fireworkShow(q, t, s.shot.t0 - 1.5, 12, BEAT * 0.9, 1203, { x0: 200, w: 1500, y0: 60, h: 160, r: 120 }); });
    inCam(g, cam, 1, (q) => {
      q.drawImage(LC(s, 'ln-back', 4800, 1320, (qq) => { qq.translate(400, 0); lnBack(qq); }, 0.75), -400, 0, 4800, 1320);
      // 路人（剪影 + 暖色轮廓光）
      // 街对面慢慢走的路人（剪影 + 暖色轮廓光）
      const gs = E.cast && E.cast.gait ? E.cast.gait('crowd', { h: 250, pose: 'walk' }).speed : 120;
      const gs2 = E.cast && E.cast.gait ? E.cast.gait('crowd', { h: 190, pose: 'walk' }).speed : 90;
      // 远一点的一排（小一点、暗一点，在店门口停停走走）
      // 路人都是客串干员的官方小人，画成剪影 + 暖色轮廓光（看不见的就不画）；走路的播放速度按步速反推，脚不打滑
      const [vx0, vx1] = visRange(cam, 1);
      const walker = (i, key, x, y, h, sp, dir, sil, rim, fb) => {
        if (x < vx0 - 150 || x > vx1 + 150) return;
        if (sdReady(key)) { if (warmMode) return; const G = sp > 0 ? SDK().gait(key, { h }) : null; if (SDK().draw(q, key, { x, y, h, anim: sp > 0 ? 'Move' : 'Relax', t, phase: i * 0.37, speed: G && G.speed > 1 ? sp / G.speed : 1, flip: dir < 0, tint: [sil, 0.55], rim: { color: rim, amount: 0.9 } })) return; }
        cast(q, 'crowd', fb);
      };
      for (let i = 0; i < 8; i++) { const dir = i % 2 ? 1 : -1, walk = hash(1206, i) < 0.6, sp = walk ? 30 + hash(1207, i) * 20 : 0, x = ((hash(1208, i) * 3600 + t * sp * dir) % 3600 + 3600) % 3600 - 300; walker(i, CAMEO[(i + 1) % 3], x, LN.street - 16, 190, sp, dir, '#3a2e58', '255,190,140', { x, y: LN.street - 16, h: 190, pose: walk ? 'walk' : 'stand', t: t + i * 0.7, speed: walk ? sp / gs2 : 1, seed: 320 + i, flip: dir < 0, sil: '#3a2e58', rim: '255,190,140', rimGlow: 0 }); }
      // 屋檐下一串串小灯泡
      for (let i = 0; i < 40; i++) { const x = -300 + i * 110, y = LN.street - 150 + sin(i * 0.9) * 8; E.glow(q, x, y, 16, '255,210,150', 0.7 + 0.2 * sin(t * 3 + i)); }
      for (let i = 0; i < 9; i++) { const dir = i % 2 ? 1 : -1, sp = 40 + hash(1205, i) * 30, x = ((hash(1204, i) * 3600 + t * sp * dir) % 3600 + 3600) % 3600 - 300; walker(i + 8, CAMEO[i % 3], x, LN.street + 6 + (i % 3) * 5, 250, sp, dir, '#4a3a68', '255,200,150', { x, y: LN.street + 6 + (i % 3) * 5, h: 250, pose: 'walk', t: t + i, speed: sp / gs, seed: 300 + i, flip: dir < 0, sil: '#4a3a68', rim: '255,200,150', rimGlow: 0 }); }
    });
    // 货箱和小羊：压进夜色里一点（暖色的灯笼光从上面照着）
    tintedLayer(g, s, (q) => inCam(q, cam, 1, (qq) => walkingCrate(qq, s, t, cx, LN.street + 30, 0.5, { V: 40, sleepy: 0.8, v: 100 })), '#3a2250', 0.26);
    inCam(g, cam, 1, (q) => E.glow(q, cx, LN.street - 60, 190, '255,190,130', 0.18, 'lighter', false));
    // 头顶的灯笼（前景，视差 1.25）
    inCam(g, cam, 1, (q) => { for (let k = 0; k < 7; k++) lanternString(q, s, t, -300 + k * 700, 600 + (k % 2) * 30, 400 + k * 700, 615 + ((k + 1) % 2) * 30, 70, 6, 1220 + k, 36); });
    inCam(g, cam, 1.4, (q) => { for (let k = 0; k < 6; k++) lanternString(q, s, t, -300 + k * 800, 650 + (k % 2) * 40, 500 + k * 800, 670 + ((k + 1) % 2) * 40, 90, 7, 1210 + k, 52); });
    s.post.vignette(g, 0.5);
  }

  /* =========================================================
   * 世界 9 · 岬角（夜）：月亮挂在博物馆的圆顶后面；之字形的小路一路亮着小灯爬上去；
   * 右边是海湾：对岸小镇的一线灯火、海湾上空的烟花（水里有倒影）；左边远处是火山
   * ========================================================= */
  const PT = [[1500, 1110], [1040, 1010], [1380, 900], [900, 800], [1120, 718], [820, 628], [674, 556]];   // 之字形小路的拐点（从下往上，终点是博物馆的门）
  const PT_LEN = [0];
  for (let i = 1; i < PT.length; i++) PT_LEN.push(PT_LEN[i - 1] + hypot(PT[i][0] - PT[i - 1][0], PT[i][1] - PT[i - 1][1]));
  /** 小路上弧长 d 处的点：[x, y, 这一段（从左往右看）的坡度角] */
  function ptAt(d) {
    d = clamp(d, 0, PT_LEN[PT_LEN.length - 1]);
    let i = 1; while (i < PT.length - 1 && PT_LEN[i] < d) i++;
    const a = PT[i - 1], b = PT[i], k = (d - PT_LEN[i - 1]) / (PT_LEN[i] - PT_LEN[i - 1]);
    const ang = a[0] < b[0] ? atan2(b[1] - a[1], b[0] - a[0]) : atan2(a[1] - b[1], a[0] - b[0]);
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), ang];
  }
  /** 路灯：沿小路每 140 像素一盏，左右交替 */
  const PT_LAMPS = [];
  for (let d = 60; d < PT_LEN[PT_LEN.length - 1] - 30; d += 140) { const [x, y] = ptAt(d), [x2, y2] = ptAt(d + 4), nx = -(y2 - y), ny = x2 - x, nl = hypot(nx, ny) || 1, sd = PT_LAMPS.length % 2 ? 1 : -1; PT_LAMPS.push([x + (nx / nl) * 22 * sd, y + (ny / nl) * 22 * sd + 4]); }
  /** 山脊线（海那一侧的边），博物馆所在的平台在左边 */
  function ptRidge(q) { q.moveTo(-600, 470); q.bezierCurveTo(-200, 450, 300, 530, 700, 546); q.bezierCurveTo(1000, 562, 1300, 760, 1700, 920); q.bezierCurveTo(1900, 1000, 2050, 1080, 2250, 1180); }
  /** 远景（视差 0.3）：海、对岸的矮山和一线灯火 */
  function ptBay(q) {
    q.fillStyle = vg(q, 548, 1200, [[0, '#5a3a7e'], [0.08, '#3e2a6a'], [0.4, '#261c50'], [1, '#140f32']]); q.fillRect(-700, 548, 3400, 700);
    // 对岸：矮矮的一道山，山脚一线灯火
    q.fillStyle = '#1e1740'; q.beginPath(); q.moveTo(760, 562);
    for (let x = 760; x <= 2700; x += 40) q.lineTo(x, 540 - 16 * sin(x * 0.004) - 10 * sin(x * 0.011 + 1) - (x > 1500 ? (x - 1500) * 0.02 : 0));
    q.lineTo(2700, 562); q.closePath(); q.fill();
    q.fillStyle = 'rgba(160,140,220,0.25)'; q.fillRect(760, 560, 1940, 2);
    const R = E.rng(1331);
    for (let i = 0; i < 320; i++) { const x = 800 + R() * 1880, row = R(), y = 558 - pow(row, 2) * 18 - R() * 3; q.fillStyle = R() < 0.25 ? 'rgba(255,236,200,0.95)' : R() < 0.5 ? 'rgba(255,190,120,0.9)' : 'rgba(255,160,190,0.8)'; q.fillRect(x, y, 2.2, 2.2); }
    // 灯火在水里的倒影（静态的一层，闪烁另画）
    for (let i = 0; i < 90; i++) { const x = 820 + R() * 1860, h = 10 + R() * 40; q.fillStyle = vg(q, 562, 562 + h, [[0, 'rgba(255,190,130,0.35)'], [1, 'rgba(255,190,130,0)']]); q.fillRect(x, 562, 2, h); }
  }
  /** 远景（视差 0.15）：火山的剪影，火口一点红光 */
  function ptVolcano(q) {
    q.fillStyle = vg(q, 280, 700, [[0, '#2c2152'], [1, '#221a44']]);
    q.beginPath(); q.moveTo(-600, 700); q.quadraticCurveTo(-60, 520, 150, 300); q.lineTo(175, 292); q.lineTo(196, 302); q.lineTo(220, 294); q.lineTo(242, 300); q.quadraticCurveTo(440, 520, 1000, 700); q.closePath(); q.fill();
    q.strokeStyle = 'rgba(190,170,255,0.2)'; q.lineWidth = 3; q.beginPath(); q.moveTo(-200, 600); q.quadraticCurveTo(-60, 520, 150, 300); q.stroke();
    q.globalCompositeOperation = 'lighter'; q.fillStyle = rg(q, 196, 300, 0, 60, [[0, 'rgba(255,120,120,0.35)'], [1, 'rgba(255,120,120,0)']]); q.fillRect(130, 240, 132, 120); q.globalCompositeOperation = 'source-over';
  }
  /** 一丛灌木：几团叠起来的圆，左上被月光描一道边 */
  function ptBush(q, x, y, r, seed) {
    const n = 4 + floor(hash(seed, 1) * 3), P = [];
    for (let i = 0; i < n; i++) { const a = PI + (i / (n - 1)) * PI, d = r * (0.45 + 0.3 * hash(seed, i, 2)); P.push([x + cos(a) * d * 1.3, y + sin(a) * d * 0.7, r * (0.45 + 0.25 * hash(seed, i, 3))]); }
    q.fillStyle = '#171029'; q.beginPath(); for (const [px, py, pr] of P) { q.moveTo(px + pr, py); q.arc(px, py, pr, 0, TAU); } q.moveTo(x + r * 1.1, y); q.ellipse(x, y, r * 1.1, r * 0.4, 0, 0, TAU); q.fill();
    q.strokeStyle = 'rgba(120,104,190,0.55)'; q.lineWidth = 2; for (const [px, py, pr] of P) { q.beginPath(); q.arc(px, py, pr, PI * 1.1, PI * 1.55); q.stroke(); }
  }
  /** 岬角（视差 1）：博物馆剪影（与片 II 立面同样的比例：左边圆顶观测台、招牌带、四扇拱窗/门）、山体、小路、灌木、棕榈 */
  function ptHill(q) {
    // 博物馆：先画，山脊会盖住它的墙脚
    const ink = '#150f28', wall = '#221a3e';
    q.fillStyle = wall; q.fillRect(400, 386, 80, 180); q.fillRect(478, 366, 284, 200);
    q.fillStyle = '#2a2350'; q.beginPath(); q.arc(439, 386, 42, PI, 0); q.fill();
    q.fillStyle = ink; q.fillRect(435, 344, 8, 42);
    q.strokeStyle = 'rgba(190,180,255,0.45)'; q.lineWidth = 2.5; q.beginPath(); q.arc(439, 386, 42, PI * 1.08, PI * 1.5); q.stroke();
    q.fillStyle = '#2e2650'; q.fillRect(474, 360, 292, 10); q.fillStyle = 'rgba(190,180,255,0.35)'; q.fillRect(474, 360, 292, 2);
    q.fillStyle = '#2a2248'; q.fillRect(478, 370, 284, 16);
    for (const x of [482, 563, 755]) { q.fillStyle = 'rgba(190,180,255,0.1)'; q.fillRect(x, 386, 3, 170); }
    for (const [cx, w, h, cy] of [[522, 42, 76, 442], [716, 42, 76, 442]]) { archPath(q, cx, cy, w, h); q.fillStyle = '#120c22'; q.fill(); }
    archPath(q, 618, 442, 46, 81); q.fillStyle = '#ffcf86'; q.fill();
    q.fillStyle = 'rgba(120,60,30,0.6)'; q.fillRect(596, 452, 12, 30); q.fillStyle = '#6a4a6a'; q.fillRect(615, 402, 3, 81); q.fillRect(596, 442, 46, 3);
    archPath(q, 674, 526, 37, 61); q.fillStyle = '#0e0a1a'; q.fill();
    q.fillStyle = 'rgba(190,180,255,0.18)'; q.fillRect(400, 386, 3, 170);
    // 山体
    q.fillStyle = vg(q, 460, 1200, [[0, '#2c2254'], [0.35, '#221a44'], [1, '#120d26']]);
    q.beginPath(); ptRidge(q); q.lineTo(2250, 1300); q.lineTo(-600, 1300); q.closePath(); q.fill();
    // 月光：山脊下面一层淡淡的亮
    q.save(); q.beginPath(); ptRidge(q); q.lineTo(2250, 1300); q.lineTo(-600, 1300); q.closePath(); q.clip();
    q.strokeStyle = 'rgba(150,130,220,0.14)'; q.lineWidth = 60; q.beginPath(); ptRidge(q); q.stroke();
    q.strokeStyle = 'rgba(170,150,240,0.16)'; q.lineWidth = 16; q.beginPath(); ptRidge(q); q.stroke();
    // 山坡上一片片深浅不一的草地（大块的斑）+ 一簇簇小草（三片叶的小丛，不是一道道斜线）
    const R = E.rng(1340);
    for (let i = 0; i < 26; i++) { const x = -300 + R() * 2000, y = 560 + R() * 620, rx = 90 + R() * 160; q.fillStyle = R() < 0.5 ? 'rgba(12,8,28,0.14)' : 'rgba(120,100,200,0.035)'; q.beginPath(); q.ellipse(x, y, rx, rx * 0.28, -0.08, 0, TAU); q.fill(); }
    q.strokeStyle = 'rgba(120,104,190,0.3)'; q.lineWidth = 1.6; q.lineCap = 'round';
    for (let i = 0; i < 170; i++) { const x = -300 + R() * 2000, y = 520 + R() * 680, l = 7 + R() * 9; q.beginPath(); for (const a of [-0.5, 0, 0.45]) { q.moveTo(x, y); q.quadraticCurveTo(x + a * l * 0.4, y - l * 0.6, x + a * l, y - l); } q.stroke(); }
    q.lineCap = 'butt';
    // 左下的龙舌兰（尖叶剪影，叶尖被月光描亮）
    for (const [ax, ay, as] of [[120, 980, 1.3], [430, 760, 0.9], [-120, 700, 1.1], [760, 1060, 1.1]]) {
      for (let k = 0; k < 9; k++) { const a = -PI / 2 + (k - 4) * 0.28, L = (60 + hash(1351, ax, k) * 30) * as * (1 - abs(k - 4) * 0.08); q.fillStyle = k % 2 ? '#1a1230' : '#150e28'; q.beginPath(); q.moveTo(ax - 7 * as, ay); q.quadraticCurveTo(ax + cos(a) * L * 0.5 - 4, ay + sin(a) * L * 0.5, ax + cos(a) * L, ay + sin(a) * L); q.quadraticCurveTo(ax + cos(a) * L * 0.5 + 4, ay + sin(a) * L * 0.5, ax + 7 * as, ay); q.fill(); q.fillStyle = 'rgba(160,140,230,0.4)'; q.beginPath(); q.arc(ax + cos(a) * L, ay + sin(a) * L, 1.6, 0, TAU); q.fill(); }
    }
    // 看海的长椅（在路边的一块平地上）
    q.fillStyle = '#140e26'; q.fillRect(210, 842, 120, 8); q.fillRect(214, 820, 112, 6); q.fillRect(218, 850, 5, 20); q.fillRect(317, 850, 5, 20);
    q.fillStyle = 'rgba(160,140,230,0.35)'; q.fillRect(214, 820, 112, 1.5);
    // 石头
    for (let i = 0; i < 40; i++) { const x = -300 + R() * 2300, y = 520 + R() * 660, r = 4 + R() * 9; q.fillStyle = '#1a1432'; q.beginPath(); q.ellipse(x, y, r * 1.4, r, 0, 0, TAU); q.fill(); q.fillStyle = 'rgba(150,130,220,0.35)'; q.beginPath(); q.ellipse(x - r * 0.3, y - r * 0.5, r * 0.8, r * 0.3, 0, 0, TAU); q.fill(); }
    q.restore();
    // 山脊边上一排草（映着海）
    q.strokeStyle = '#150f2a'; q.lineWidth = 2.2; q.lineCap = 'round';
    for (let i = 0; i < 90; i++) { const u = i / 89, x = lerp(740, 1900, u), y = 546 + pow(u, 1.35) * 400; if (hash(1341, i) < 0.3) continue; for (let b = 0; b < 4; b++) { const a = -PI / 2 + (b - 1.5) * 0.3 + (hash(1342, i, b) - 0.5) * 0.3, L = 8 + hash(1343, i, b) * 14; q.beginPath(); q.moveTo(x + b * 3, y + 4); q.quadraticCurveTo(x + b * 3 + cos(a) * L * 0.5, y + 4 + sin(a) * L * 0.6, x + b * 3 + cos(a) * L, y + 4 + sin(a) * L); q.stroke(); } }
    q.lineCap = 'butt';
    // 小路：越往上越窄（远），浅色土路 + 中间更亮 + 两边的碎石
    for (const [col, wk] of [['#342a50', 1.25], ['#46395f', 0.85], ['rgba(140,120,190,0.22)', 0.3]]) {
      q.strokeStyle = col; q.lineJoin = 'round'; q.lineCap = 'round';
      for (let i = 1; i < PT.length; i++) { const w = lerp(24, 11, clamp((1110 - (PT[i - 1][1] + PT[i][1]) / 2) / 560)) * wk; q.lineWidth = w; q.beginPath(); q.moveTo(PT[i - 1][0], PT[i - 1][1]); q.lineTo(PT[i][0], PT[i][1]); q.stroke(); }
    }
    q.lineCap = 'butt';
    for (let d = 0; d < PT_LEN[PT_LEN.length - 1]; d += 9) { const [x, y] = ptAt(d), w = lerp(15, 7, clamp((1110 - y) / 560)); for (const sd of [-1, 1]) { q.fillStyle = hash(1344, d, sd) < 0.5 ? '#2a2046' : 'rgba(170,150,230,0.3)'; q.fillRect(x + (hash(1345, d, sd) - 0.5) * 4, y + sd * w * 0.9 + (hash(1346, d, sd) - 0.5) * 3, 3, 2); } }
    // 路灯脚下的暖光（静态部分）
    q.globalCompositeOperation = 'lighter';
    for (const [x, y] of PT_LAMPS) { q.fillStyle = rg(q, x, y + 6, 0, 70, [[0, 'rgba(255,180,110,0.28)'], [1, 'rgba(255,180,110,0)']]); q.save(); q.translate(x, y + 6); q.scale(1, 0.45); q.translate(-x, -y - 6); q.fillRect(x - 70, y + 6 - 70, 140, 140); q.restore(); }
    q.globalCompositeOperation = 'source-over';
    // 路灯杆
    for (const [x, y] of PT_LAMPS) { q.strokeStyle = '#120c20'; q.lineWidth = 3; q.beginPath(); q.moveTo(x, y); q.lineTo(x, y - 30); q.stroke(); q.fillStyle = '#120c20'; q.fillRect(x - 5, y - 38, 10, 4); q.fillStyle = '#ffe0a8'; q.fillRect(x - 3.5, y - 34, 7, 6); }
    // 灌木：沿着小路两边、山脊上
    let n = 0;
    for (let d = 40; d < PT_LEN[PT_LEN.length - 1] - 60; d += 95) { const [x, y] = ptAt(d), sd = hash(1347, n) < 0.5 ? -1 : 1, off = 30 + hash(1348, n) * 26, r = 16 + hash(1349, n) * 16; ptBush(q, x + (hash(1350, n) - 0.5) * 40, y + sd * off, r, 1360 + n); n++; }
    for (const [x, y, r] of [[980, 598, 26], [1230, 700, 22], [1480, 818, 30], [1700, 925, 34], [320, 560, 30], [860, 570, 20], [60, 820, 44], [520, 900, 36], [300, 1080, 50], [-160, 960, 40], [640, 700, 28]]) ptBush(q, x, y + 8, r, 1400 + x);
    // 棕榈（剪影，树冠映着海和天）
    palm(q, 1262, 742, 250, 0, { seed: 1371, col: '#120c22', trunk: '#120c22', flat: true, n: 9, lean: 0.14 });
    palm(q, 890, 604, 230, 0, { seed: 1372, col: '#120c22', trunk: '#120c22', flat: true, n: 9, lean: -0.1 });
    palm(q, 300, 572, 200, 0, { seed: 1373, col: '#120c22', trunk: '#120c22', flat: true, n: 8, lean: 0.06 });
  }
  /** 近景（屏幕空间，预先糊好）：左下的草和龙舌兰，右下一丛三角梅 */
  function ptFore(q) {
    q.fillStyle = '#0a0714';
    for (let i = 0; i < 14; i++) { const x = -40 + i * 26, a = -PI / 2 + (i - 7) * 0.12, L = 180 + hash(1380, i) * 160; q.beginPath(); q.moveTo(x - 10, 400); q.quadraticCurveTo(x + cos(a) * L * 0.5, 400 + sin(a) * L * 0.6, x + cos(a) * L, 400 + sin(a) * L); q.quadraticCurveTo(x + cos(a) * L * 0.5 + 10, 400 + sin(a) * L * 0.55, x + 10, 400); q.fill(); }
    q.beginPath(); q.ellipse(160, 420, 260, 90, 0, 0, TAU); q.fill();
    q.beginPath(); q.ellipse(2000, 400, 300, 150, 0, 0, TAU); q.fill();
    for (let i = 0; i < 70; i++) { const a = hash(1381, i) * TAU, d = sqrt(hash(1382, i)) * 240; q.fillStyle = i % 3 ? '#160c20' : '#1e1028'; q.beginPath(); q.arc(1960 + cos(a) * d * 1.3, 300 + sin(a) * d * 0.6, 26, 0, TAU); q.fill(); }
    for (let i = 0; i < 40; i++) { const a = hash(1383, i) * TAU, d = sqrt(hash(1384, i)) * 230; q.fillStyle = hash(1385, i) < 0.5 ? '#5a1c3e' : '#7a2a50'; q.beginPath(); q.arc(1960 + cos(a) * d * 1.3, 290 + sin(a) * d * 0.6, 12, 0, TAU); q.fill(); }
  }
  /** 把一组东西画进一张整帧的暂存画布，整体往夜色里调一下（只调这组东西），再贴回来 */
  let NBUF = null;
  function tintedLayer(g, s, fn, color, a) {
    if (warmMode || a <= 0.01) { fn(g); return; }
    const w = Math.round(VW * s.k), h = Math.round(VH * s.k);
    if (!NBUF || NBUF.width !== w || NBUF.height !== h) NBUF = E.mk(w, h);
    const q = NBUF.getContext('2d');
    q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-over'; q.globalAlpha = 1; q.clearRect(0, 0, w, h);
    q.setTransform(s.k, 0, 0, s.k, 0, 0);
    fn(q);
    q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-atop'; q.globalAlpha = a; q.fillStyle = color; q.fillRect(0, 0, w, h);
    q.globalCompositeOperation = 'source-over'; q.globalAlpha = 1;
    g.drawImage(NBUF, 0, 0, VW, VH);
  }
  /* ---------- 上岬角（164.06 → 168.32）：夜里的之字形小路；货箱一步一步往上爬，镜头跟着往上摇，博物馆慢慢挡住月亮 ---------- */
  function shotPath(g, s) {
    const t = s.t, lt = s.lt;
    const V = 108, d0 = PT_LEN[2] + 12, [px, py, ang] = ptAt(d0 + lt * V);
    const path = (u) => { const e = ease.inOut(clamp(u / 4.26)); return { x: lerp(1000, 729, e), y: lerp(760, 614, e), z: lerp(1.3, 1.34, e) }; };
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 165, 2, 0.25));
    const HZ = 548;
    // 天、星星、月亮
    inCam(g, cam, 0.06, (q) => {
      skyFill(q, -700, 600, SKY_NIGHT);
      s.kit.stars(q, t, { n: 140, seed: 41, x: -400, w: 2800, y: -400, h: 900, size: 2.4 });
      E.glow(q, 1093, 133, 420, '200,190,255', 0.22); E.glow(q, 1093, 133, 170, '255,244,230', 0.35);
      q.drawImage(LC(s, 'pt-moon', 200, 200, (qq) => {
        qq.fillStyle = rg(qq, 88, 88, 4, 82, [[0, '#fffaf0'], [0.7, '#fff0dc'], [1, '#f4dcc8']]); qq.beginPath(); qq.arc(100, 100, 80, 0, TAU); qq.fill();
        for (const [x, y, r] of [[76, 84, 16], [122, 70, 10], [118, 124, 18], [80, 132, 8], [140, 100, 7]]) { qq.fillStyle = 'rgba(210,180,170,0.28)'; qq.beginPath(); qq.arc(x, y, r, 0, TAU); qq.fill(); }
      }, 1.5), 993, 33, 200, 200);
    });
    // 左边远处的火山
    baked(g, s, 'pt-volc', { x: 960, y: 540, z: 1 }, cam, 0.15, ptVolcano, 0.6, [-620, 280, 1020, 720]);
    inCam(g, cam, 0.15, (q) => plume(q, t, 196, 296, 1.1, 0.22, '255,170,210'));
    // 海湾：海、对岸、烟花和它们的倒影
    baked(g, s, 'pt-bay', { x: 960, y: 540, z: 1 }, cam, 0.3, ptBay, 0.8, [-700, 500, 2700, 1250]);
    inCam(g, cam, 0.3, (q) => {
      const fw = { x0: 1260, w: 560, y0: 150, h: 220, r: 95 };
      fireworkShow(q, t, s.shot.t0 - 2, 12, BEAT, 1320, fw);
      q.save(); q.beginPath(); q.rect(-700, HZ + 2, 3400, 800); q.clip();
      q.translate(0, HZ); q.scale(1, -0.42); q.translate(0, -HZ);
      q.globalAlpha = 0.4; fireworkShow(q, t, s.shot.t0 - 2, 12, BEAT, 1320, fw); q.globalAlpha = 1;
      q.restore();
      // 倒影在水面上一闪一闪
      additive(q, (qq) => { for (let i = 0; i < 40; i++) { const x = 800 + hash(1333, i) * 1800, y = HZ + 8 + pow(hash(1334, i), 1.5) * 200, a = max(0, sin(t * (2 + hash(1335, i) * 2) + i * 2.3)); if (a < 0.1) continue; qq.fillStyle = `rgba(255,200,170,${0.35 * a})`; qq.fillRect(x, y, 8 + hash(1336, i) * 26, 1.6); } });
    });
    // 岬角
    baked(g, s, 'pt-hill2', B, cam, 1, ptHill, B.res, [-400, 300, 2100, 1250]);
    inCam(g, cam, 1, (q) => {
      // 窗里的灯、门灯、路灯（一闪一闪）
      E.glow(q, 618, 450, 70, '255,200,120', 0.55); E.glow(q, 618, 450, 180, '255,170,110', 0.22); E.glow(q, 640, 501, 26, '255,220,160', 0.8);
      PT_LAMPS.forEach(([x, y], i) => { const f = 0.8 + 0.12 * sin(t * 3 + i * 1.7) + 0.05 * sin(t * 11 + i); E.glow(q, x, y - 31, 34, '255,200,130', 0.7 * f); E.glow(q, x, y - 31, 10, '255,245,220', 0.9 * f); });
    });
    // 小羊和货箱：往夜色里压一点，离路灯近的时候被照亮
    let lit = 0; for (const [x, y] of PT_LAMPS) lit = max(lit, exp(-((x - px) ** 2 + (y - py) ** 2) / (110 * 110)));
    tintedLayer(g, s, (q) => inCam(q, cam, 1, (qq) => {
      qq.save(); qq.translate(px, py + 6); qq.rotate(ang * 0.7); qq.translate(-px, -py - 6);
      walkingCrate(qq, s, t, px, py + 6, 0.32, { V: 26, sleepy: 0.8, v: V, flip: true });
      qq.restore();
    }), '#1c1640', 0.46 - 0.26 * lit);
    inCam(g, cam, 1, (q) => {
      if (lit > 0.05) E.glow(q, px, py - 30, 120, '255,190,120', 0.28 * lit, 'lighter', false);
      // 萤火虫
      for (let i = 0; i < 14; i++) { const x = 500 + hash(1321, i) * 1200 + sin(t * 0.7 + i) * 30, y = 560 + hash(1322, i) * 460 + cos(t * 0.5 + i) * 20; E.glow(q, x, y, 8, '255,230,150', 0.3 + 0.4 * sin(t * 3 + i)); }
    });
    // 近景（虚）：跟着镜头多挪一点
    const fx = (cam.x - 860) * -0.35, fy = (cam.y - 690) * -0.3;
    g.drawImage(blurred(s, 'pt-fore', VW + 200, 440, ptFore, 0.12, 12), -100 + fx, VH - 400 + fy, VW + 200, 440);
    s.post.vignette(g, 0.5);
  }

  /* =========================================================
   * 世界 10 · 火山博物馆（夜，正立面；与片 II 的立面同一设计：圆顶观测台、招牌带、壁柱、拱窗、拱门、门牌、台阶、壁灯、三角梅）
   * ========================================================= */
  const MZ = { win: { x: 1020, y: 560, w: 190, h: 330 }, door: { x: 1250, y: 900, w: 150, h: 250 }, lamp: [1110, 800], step: 1020 };
  function archPath(q, cx, cy, w, h) { const r = w / 2, top = cy - h / 2 + r; q.beginPath(); q.moveTo(cx - r, cy + h / 2); q.lineTo(cx - r, top); q.arc(cx, top, r, PI, 0); q.lineTo(cx + r, cy + h / 2); q.closePath(); }
  function mzSky(q) {
    q.fillStyle = vg(q, 0, 1080, [[0, '#080722'], [0.45, '#1e1648'], [0.75, '#40225e'], [1, '#6e2c6c']]); q.fillRect(-300, -300, VW + 600, VH + 600);
    const R = E.rng(9); for (let i = 0; i < 300; i++) { q.fillStyle = `rgba(255,240,250,${0.1 + R() * 0.4})`; q.fillRect(R() * VW, R() * 700, 1.5, 1.5); }
  }
  function mzVolcano(q) {
    const cx = 1690, top = 330;
    q.fillStyle = vg(q, top, 1080, [[0, '#3a2356'], [1, '#221434']]);
    q.beginPath(); q.moveTo(1200, 1100); q.quadraticCurveTo(1560, 700, cx - 50, top); q.lineTo(cx - 26, top - 5); q.lineTo(cx - 6, top + 8); q.lineTo(cx + 18, top + 3); q.lineTo(cx + 44, top - 3); q.quadraticCurveTo(1860, 640, 2200, 900); q.lineTo(2200, 1100); q.closePath(); q.fill();
    q.strokeStyle = 'rgba(255,160,200,0.35)'; q.lineWidth = 3; q.beginPath(); q.moveTo(1400, 860); q.quadraticCurveTo(1560, 700, cx - 50, top); q.stroke();
  }
  function mzFacade(q) {
    const ink = '#120a1c';
    q.fillStyle = vg(q, 250, 1000, [[0, '#3a3058'], [1, '#221a38']]); q.fillRect(130, 330, 320, 700);
    q.fillStyle = vg(q, 100, 330, [[0, '#4a5a7a'], [1, '#26304a']]); q.beginPath(); q.arc(290, 330, 170, PI, 0); q.fill();
    q.strokeStyle = 'rgba(200,210,255,0.45)'; q.lineWidth = 4; q.beginPath(); q.arc(290, 330, 170, PI * 1.08, PI * 1.55); q.stroke();
    q.fillStyle = '#141024'; q.beginPath(); q.moveTo(270, 164); q.lineTo(310, 164); q.lineTo(316, 330); q.lineTo(264, 330); q.closePath(); q.fill();
    q.strokeStyle = ink; q.lineWidth = 4; q.beginPath(); q.arc(290, 330, 170, PI, 0); q.stroke();
    q.fillStyle = '#2a2244'; q.fillRect(120, 322, 340, 18);
    q.fillStyle = vg(q, 250, 1040, [[0, '#4a3a66'], [0.5, '#3a2c56'], [1, '#2a2042']]); q.fillRect(450, 280, 1150, 760);
    const R = E.rng(4);
    for (let i = 0; i < 900; i++) { q.fillStyle = `rgba(${R() < 0.5 ? '255,230,255' : '20,10,30'},${0.02 + R() * 0.04})`; q.fillRect(450 + R() * 1150, 280 + R() * 760, 2 + R() * 6, 1 + R() * 3); }
    q.fillStyle = '#2a2044'; q.fillRect(430, 250, 1190, 34); q.fillStyle = '#5a4a7e'; q.fillRect(430, 250, 1190, 5);
    q.fillStyle = '#34284e'; q.fillRect(450, 284, 1150, 60);
    E.text(q, 'SIESTA  VOLCANO  MUSEUM', 1025, 328, { font: 'display', size: 36, weight: 700, spacing: 10, color: '#b9a8d8' });
    for (const x of [470, 800, 1570]) { q.fillStyle = '#3e3260'; q.fillRect(x - 14, 344, 28, 700); q.fillStyle = 'rgba(210,200,255,0.12)'; q.fillRect(x - 14, 344, 5, 700); }
    for (const cx of [630, 1420]) {
      archPath(q, cx, 560, 170, 310); q.fillStyle = '#1a1432'; q.fill();
      q.save(); archPath(q, cx, 560, 170, 310); q.clip(); q.fillStyle = 'rgba(160,140,220,0.18)'; q.beginPath(); q.moveTo(cx - 85, 420); q.lineTo(cx - 20, 420); q.lineTo(cx - 85, 560); q.closePath(); q.fill(); q.restore();
      q.strokeStyle = '#4a3c6a'; q.lineWidth = 10; archPath(q, cx, 560, 170, 310); q.stroke();
      q.lineWidth = 5; q.beginPath(); q.moveTo(cx, 420); q.lineTo(cx, 715); q.moveTo(cx - 85, 560); q.lineTo(cx + 85, 560); q.stroke();
      q.fillStyle = '#2e2448'; q.fillRect(cx - 100, 712, 200, 16);
    }
    q.fillStyle = '#2e2448'; q.fillRect(MZ.win.x - 118, MZ.win.y + MZ.win.h / 2 - 4, 236, 20);
    // 门洞 + 门框（门扇另画）
    q.fillStyle = '#120c1e'; archPath(q, MZ.door.x, MZ.door.y, MZ.door.w, MZ.door.h); q.fill();
    q.strokeStyle = '#4a3c6a'; q.lineWidth = 8; archPath(q, MZ.door.x, MZ.door.y, MZ.door.w, MZ.door.h); q.stroke();
    q.fillStyle = '#d8c8a8'; rrect(q, 1340, 820, 150, 60, 6); q.fill(); q.strokeStyle = '#6a5040'; q.lineWidth = 3; q.stroke();
    E.text(q, '汐斯塔火山博物馆', 1415, 858, { font: 'serif', size: 17, weight: 700, color: '#4a3020', spacing: 1 });
    // 门前的石头平台（人和货箱站在平台面上 y≈1020）+ 门口往下的三级台阶 + 平台前的小广场（近景推近时画面底下不会露出天空）
    q.fillStyle = vg(q, 1080, 1500, [[0, '#2c2242'], [0.3, '#231a38'], [1, '#150f24']]); q.fillRect(-400, 1080, 2800, 420);
    q.strokeStyle = 'rgba(160,140,220,0.1)'; q.lineWidth = 2;
    for (let r = 0; r < 7; r++) { const y = 1100 + r * r * 9 + r * 14; q.beginPath(); q.moveTo(-400, y); q.lineTo(2400, y); q.stroke(); for (let x = -400 + (r % 2) * 70; x < 2400; x += 140 + r * 20) { q.beginPath(); q.moveTo(x, y); q.lineTo(x + (x - 1250) * 0.06, y + 14 + r * 4); q.stroke(); } }
    q.fillStyle = '#2a2144'; q.fillRect(116, 1016, 1498, 64);
    q.fillStyle = '#3a2e58'; q.fillRect(116, 1014, 1498, 20); q.fillStyle = 'rgba(200,180,255,0.22)'; q.fillRect(116, 1014, 1498, 2);
    q.strokeStyle = 'rgba(10,6,20,0.35)'; q.lineWidth = 2; for (let x = 150; x < 1610; x += 96) { q.beginPath(); q.moveTo(x, 1036); q.lineTo(x, 1080); q.stroke(); }
    q.fillStyle = 'rgba(10,6,20,0.45)'; q.fillRect(116, 1034, 1498, 3);
    for (const [y0, w, h] of [[1034, 270, 23], [1057, 310, 23], [1080, 350, 22]]) { q.fillStyle = '#2e2448'; q.fillRect(1250 - w / 2, y0, w, h); q.fillStyle = '#40345e'; q.fillRect(1250 - w / 2, y0, w, 6); q.fillStyle = 'rgba(200,180,255,0.2)'; q.fillRect(1250 - w / 2, y0, w, 1.5); q.fillStyle = 'rgba(10,6,20,0.4)'; q.fillRect(1250 - w / 2, y0 + h - 2, w, 2); }
    q.strokeStyle = 'rgba(20,10,40,0.18)'; q.lineWidth = 2;
    for (let y = 380; y < 1040; y += 44) { q.beginPath(); q.moveTo(450, y); q.lineTo(1600, y); q.stroke(); for (let x = 450 + ((y / 44) % 2) * 60; x < 1600; x += 120) { if (x > 1170 && x < 1330 && y > 770) continue; q.beginPath(); q.moveTo(x, y); q.lineTo(x, y + 44); q.stroke(); } }
    q.fillStyle = vg(q, 280, 1080, [[0, 'rgba(200,190,255,0.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(10,4,20,0.35)']]); q.fillRect(450, 280, 1150, 800);
    q.fillStyle = vg(q, 344, 400, [[0, 'rgba(10,4,20,0.45)'], [1, 'rgba(10,4,20,0)']]); q.fillRect(450, 344, 1150, 56);
    q.globalCompositeOperation = 'lighter';
    q.fillStyle = rg(q, MZ.win.x, MZ.win.y + 60, 0, 380, [[0, 'rgba(255,170,100,0.32)'], [1, 'rgba(255,170,100,0)']]); q.fillRect(MZ.win.x - 380, MZ.win.y - 320, 760, 760);
    q.fillStyle = rg(q, 1110, 800, 0, 260, [[0, 'rgba(255,190,120,0.35)'], [1, 'rgba(255,190,120,0)']]); q.fillRect(850, 540, 520, 520);
    q.globalCompositeOperation = 'source-over';
    const clusters = [[480, 760, 90], [560, 860, 110], [470, 960, 100], [640, 990, 90], [760, 1020, 80], [1560, 420, 70], [1580, 540, 80], [1545, 660, 70], [1585, 780, 85], [1560, 900, 80], [1590, 1010, 80]];
    for (const [cx, cy, r] of clusters) {
      for (let j = 0; j < 22; j++) { const a = hash(cx, j, 1) * TAU, d = sqrt(hash(cx, j, 2)) * r; q.fillStyle = j % 3 ? '#243832' : '#2e4a3e'; q.beginPath(); q.ellipse(cx + cos(a) * d, cy + sin(a) * d * 0.8, 12, 7, a, 0, TAU); q.fill(); }
      for (let j = 0; j < 34; j++) { const a = hash(cy, j, 3) * TAU, d = pow(hash(cy, j, 4), 0.7) * r * 0.9; const px = cx + cos(a) * d, py = cy + sin(a) * d * 0.8; const warm = max(0, 1 - hypot(px - MZ.win.x, py - MZ.win.y) / 700); q.fillStyle = hash(cx, j, 5) < 0.5 ? mixC('#b8456e', '#ff9a6a', warm * 0.4) : mixC('#e0709e', '#ffc080', warm * 0.4); for (let k = 0; k < 3; k++) { const b = a + k * 2.1; q.beginPath(); q.ellipse(px + cos(b) * 4, py + sin(b) * 4, 5, 3.5, b, 0, TAU); q.fill(); } }
    }
    q.strokeStyle = ink; q.lineWidth = 4; q.beginPath(); q.moveTo(450, 1014); q.lineTo(450, 280); q.lineTo(1600, 280); q.lineTo(1600, 1014); q.stroke();
  }
  /** 亮着的大拱窗（里面：暖光、标本架的剪影） */
  function mzWindow(q, s, t, lit = 1) {
    const W = MZ.win;
    q.save(); archPath(q, W.x, W.y, W.w, W.h); q.clip();
    q.drawImage(LC(s, 'mz-inside', 200, 340, (qq) => {
      qq.fillStyle = vg(qq, 0, 340, [[0, '#6a3a2a'], [0.5, '#c07840'], [1, '#e8a860']]); qq.fillRect(0, 0, 200, 340);
      qq.fillStyle = 'rgba(60,24,16,0.85)'; qq.fillRect(0, 40, 60, 300);
      for (let y = 70; y < 340; y += 60) { qq.fillStyle = '#3a1a10'; qq.fillRect(0, y, 70, 6); for (let i = 0; i < 4; i++) { qq.beginPath(); qq.ellipse(10 + i * 15, y - 8, 6, 8, 0, 0, TAU); qq.fill(); } }
      qq.fillStyle = rg(qq, 150, 230, 0, 120, [[0, 'rgba(255,240,200,0.9)'], [1, 'rgba(255,200,120,0)']]); qq.fillRect(0, 0, 200, 340);
      qq.fillStyle = '#4a2414'; qq.fillRect(40, 270, 170, 14); qq.fillRect(50, 284, 10, 60);
    }, 1), W.x - 100, W.y - 170, 200, 340);
    if (lit < 1) { q.fillStyle = `rgba(26,20,50,${1 - lit})`; q.fillRect(W.x - 100, W.y - 170, 200, 340); }
    q.restore();
    q.strokeStyle = '#4a3c6a'; q.lineWidth = 12; archPath(q, W.x, W.y, W.w, W.h); q.stroke();
    q.lineWidth = 6; q.beginPath(); q.moveTo(W.x, W.y - W.h / 2 + 10); q.lineTo(W.x, W.y + W.h / 2); q.moveTo(W.x - W.w / 2, W.y); q.lineTo(W.x + W.w / 2, W.y); q.stroke();
    if (lit > 0) E.glow(q, W.x, W.y + 40, 260, '255,180,110', 0.28 * lit);
  }
  /** 拱门的两扇门：open 0..1（向屋里开），门里是暖黄的灯光 */
  function mzDoor(q, s, t, open, inside) {
    const { x, y, w, h } = MZ.door, top = y - h / 2, bot = y + h / 2 - 5;
    const k = ease.inOut(clamp(open));
    if (k > 0) {
      q.save(); archPath(q, x, y, w, h); q.clip();
      q.fillStyle = vg(q, top, bot, [[0, '#ffcf8a'], [1, '#f0a060']]); q.fillRect(x - w / 2, top, w, h);
      q.fillStyle = 'rgba(90,50,30,0.5)'; q.fillRect(x - w / 2, bot - 30, w, 30);
      q.fillStyle = 'rgba(120,70,40,0.55)'; q.fillRect(x - w / 2 + 6, top + 60, 26, bot - top - 90); q.fillRect(x + w / 2 - 32, top + 60, 26, bot - top - 90);
      q.restore();
      if (inside) inside(q);
    }
    // 门扇：各自绕外侧的轴往里转（越开越窄）；门扇就是拱形门洞里、合页那一侧的一条（上沿自然跟着拱）
    for (const sd of [-1, 1]) {
      const hx = x + sd * (w / 2 - 3), ww = (w / 2 - 6) * cos(k * PI * 0.45), ex = hx - sd * ww, x0 = min(hx, ex), x1 = max(hx, ex);
      q.save(); archPath(q, x, y, w - 6, h - 6); q.clip();
      q.fillStyle = mixC('#2a1e3c', '#4a3450', k * 0.5); q.fillRect(x0, top, x1 - x0, bot - top);
      // 两块凹下去的门板
      if (ww > 20) { q.strokeStyle = 'rgba(10,6,20,0.45)'; q.lineWidth = 2; const px0 = x0 + (x1 - x0) * 0.18, pw = (x1 - x0) * 0.64; q.strokeRect(px0, top + 40, pw, (bot - top) * 0.36); q.strokeRect(px0, top + 50 + (bot - top) * 0.4, pw, (bot - top) * 0.36); }
      q.strokeStyle = '#120a1c'; q.lineWidth = 2.5; q.beginPath(); q.moveTo(ex, top); q.lineTo(ex, bot); q.stroke();
      q.restore();
      if (k < 0.6) { q.fillStyle = '#6a5a8a'; q.beginPath(); q.arc(x + sd * 12, y + 30, 5, 0, TAU); q.fill(); }
    }
    if (k > 0) { E.glow(q, x, y + 20, 220 * k + 40, '255,200,130', 0.55 * k); }
  }
  function mzScene(g, s, cam, o = {}) {
    const t = s.t;
    g.drawImage(LC(s, 'mz-sky', VW, VH, mzSky, 0.5), 0, 0, VW, VH);
    inCam(g, cam, 0.1, (q) => { s.kit.stars(q, t, { n: 70, seed: 33, x: 0, y: 0, w: VW, h: 620, size: 2.6 }); if (o.fireworks) fireworkShow(q, t, 150, 30, BEAT * 1.4, 1401, { x0: 1300, w: 700, y0: 60, h: 180, r: 90 }); });
    baked(g, s, 'mz-volc', { x: 960, y: 540, z: 1 }, cam, 0.3, mzVolcano, 0.8, [1190, 318, 2210, 1110]);
    inCam(g, cam, 0.3, (q) => plume(q, t, 1690, 330, 1.5, 0.35, '255,176,210'));
    baked(g, s, 'mz-facade2:' + (o.key || 'w'), o.base || { x: 960, y: 540, z: 1 }, cam, 1, mzFacade, o.res || 1.25, [-400, 140, 2400, 1500]);
    inCam(g, cam, 1, (q) => {
      mzWindow(q, s, t, o.winLit ?? 1);
      mzDoor(q, s, t, o.door || 0, o.inside);
      E.glow(q, MZ.lamp[0], MZ.lamp[1], 90, '255,196,120', 0.55); E.glow(q, MZ.lamp[0], MZ.lamp[1], 22, '255,236,200', 0.9);
      for (let i = 0; i < 10; i++) { const x = 1040 + hash(1402, i) * 160 + sin(t * 0.7 + i) * 30, y = 700 + hash(1403, i) * 180 + cos(t * 0.5 + i) * 20; E.glow(q, x, y, 5, '255,236,200', 0.3 + 0.5 * sin(t * 3 + i)); }
      if (o.mid) o.mid(q);
    });
    if (o.after) o.after(g);
  }
  /** 门口的货箱：落在台阶左边一点（门开了以后被拖进去） */
  const MZC = { x: 1200, y: MZ.step + 2, sc: 0.26 };
  /* ---------- 敲门（168.32 → 170.45）：放下货箱，带头的用角“咚、咚”地敲门，大家一溜烟钻进箱子 ---------- */
  function shotKnock(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 1226, y: 900, z: 2.6, ...hand(s, 169, 2, 0.25) };
    const k1 = BEAT * 0.5, k2 = BEAT * 1.5, dive = BEAT * 2.2, shut = BEAT * 3.4;
    const kx = MZ.door.x + 24, ky = MZ.step + 2;   // 带头的站在右半扇门前（不挡货箱）
    const bump = (kt) => (lt > kt - 0.18 && lt < kt + 0.3 ? (lt < kt ? 1 - (kt - lt) / 0.18 : 1 - (lt - kt) / 0.3) : 0);
    const bumpA = max(bump(k1), bump(k2));
    mzScene(g, s, cam, {
      key: 'k', base: { x: 1226, y: 900, z: 2.6 }, res: 1.02,
      after: (gg) => {
        // 货箱和小羊：夜色里压一点（门灯的暖光另外加）
        tintedLayer(gg, s, (q0) => inCam(q0, cam, 1, (q) => {
          crate(q, s, MZC.x, MZC.y, MZC.sc, { no: 7, hoof: 1, lid: lt < shut ? 0.9 : 0, lidFly: lt < shut ? [-50, 20, -0.4] : null, wob: lt > shut ? sin(t * 30) * 0.01 * exp(-(lt - shut) * 5) : 0 });
          // 小羊们：先围在箱子左边，带头的在门前一蹦一撞；然后一个接一个跳进箱子
          for (let j = 0; j < 7; j++) {
            const L = GANG[j], V = 24 * L.sc, sx = j === 0 ? kx : MZC.x - 70 - (j - 1) * 22, sy = MZ.step + 2;
            const dj = lt - dive - j * 0.1;
            if (dj > 0.35) continue;
            if (dj > 0) { const u = dj / 0.35, x = lerp(sx, MZC.x, u), y = lerp(sy, MZC.y - 50, u) - sin(PI * u) * 40; lamb(q, s, x, y, V, { kind: L.k, pose: 'jump', spin: u * 3, expr: 'happy' }); continue; }
            if (j === 0) { lamb(q, s, sx, sy - bumpA * 16, V, { kind: L.k, pose: bumpA > 0.05 ? 'jump' : 'stand', rot: -bumpA * 0.35, expr: 'determined', flip: true, t }); shadow(q, sx, sy + 1, V * 1.1, 0.4 * (1 - bumpA * 0.5)); continue; }
            lamb(q, s, sx, sy, V, { kind: L.k, pose: 'stand', expr: 'happy', flip: false, t });
          }
        }), '#2a1c40', 0.22);
        inCam(gg, cam, 1, (q) => {
          E.glow(q, MZC.x - 20, MZC.y - 40, 170, '255,190,120', 0.14, 'lighter', false);
          for (const kt of [k1, k2]) { const a = lt - kt; if (a > 0 && a < 0.4) sfx(q, '咚', kx - 6, ky - 118 + (kt === k2 ? -26 : 0), 30, clamp(a / 0.08), { color: '#fff4e0', rot: -0.12, alpha: 1 - clamp((a - 0.3) / 0.1) }); }
          if (lt > shut) { const a = lt - shut; for (let i = 0; i < 4; i++) withAlpha(q, (1 - clamp(a / 0.6)) * 0.6, (qq) => qq.drawImage(puffSpr(i, '255,230,240'), MZC.x - 60 + i * 30 - a * 20, MZC.y - 80 - a * 30, 60, 30)); }
        });
      },
    });
    s.post.vignette(g, 0.5);
  }
  /** 门口的她（纯烬，穿着母亲的外套）：门里的逆光 + 暖色轮廓光 */
  function doorAdele(q, s, t, o) {
    const ao = { x: o.x ?? MZ.door.x + 4, y: MZ.step - 2, h: 192, pose: o.pose || 'stand', outfit: 'coat', t, expr: o.expr || 'neutral', look: o.look, flip: !!o.flip, rim: '255,210,150', rimW: 1.2 };
    withAlpha(q, o.a ?? 1, (qq) => cast(qq, 'adele-alter', ao));
  }
  /** 嗡嗡冒泡的货箱（在门外的平台上；压进夜色一点） */
  function doorCrate(g, s, cam, t, o = {}) {
    const x = o.x ?? MZC.x, y = o.y ?? MZC.y;
    tintedLayer(g, s, (q0) => inCam(q0, cam, 1, (q) => crate(q, s, x, y, MZC.sc, { no: 7, hoof: 1, lid: 0, wob: sin(t * 38) * 0.012 * (o.hum ?? 1) })), '#2a1c40', o.tint ?? 0.2);
    inCam(g, cam, 1, (q) => E.glow(q, x, y - 30, 30, '255,160,210', (0.25 + 0.15 * sin(t * 9)) * (o.hum ?? 1)));
  }
  /* ---------- 门开了（170.45 → 172.58）：她站在暖光里，左看看、右看看——没人；箱子“嗝”了一声，她低头 ---------- */
  function shotDoorOpen(g, s) {
    const t = s.t, lt = s.lt;
    const open = clamp(lt / 0.7), hic = lt - 1.12;
    const path = (u) => { const e = ease.inOut(clamp(u / 2.13)); return { x: lerp(1240, 1236, e), y: lerp(882, 870, e), z: lerp(2.5, 2.9, e) }; };
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 171, 2, 0.2));
    mzScene(g, s, cam, {
      key: 'd', base: B, res: B.res, door: open,
      mid: (q) => {
        if (open > 0.3) {
          const lk = lt < 0.95 ? [-1, 0.2] : lt < 1.4 ? [1, 0.2] : [-0.3, 1];
          doorAdele(q, s, t, { look: lk, flip: lt < 0.95, expr: lt < 1.45 ? 'neutral' : 'surprise', a: clamp((open - 0.3) / 0.3) });
        }
      },
      after: (gg) => {
        doorCrate(gg, s, cam, t);
        inCam(gg, cam, 1, (q) => {
          if (hic > 0 && hic < 1.0) { bubble(q, MZC.x + 10 + hic * 10, MZC.y - 60 - hic * 60, 5 + hic * 4, 0.9 * (1 - hic)); if (hic < 0.45) sfx(q, '嗝', MZC.x - 58, MZC.y - 92, 18, clamp(hic / 0.1), { color: '#ffd0e8', rot: -0.1, alpha: 1 - clamp((hic - 0.35) / 0.1) }); }
        });
      },
    });
    s.post.vignette(g, 0.5);
  }
  /* ---------- 她笑了（172.58 → 174.70）：官方立绘的脸部特写——看着脚边嗡嗡冒泡的货箱，歪一下头，然后眯着眼笑起来 ---------- */
  const KA = () => window.MVE && window.MVE.keyart;
  const KA_CREDIT = '角色立绘 © Hypergryph（官方原画，本页分层绑定）';   // 与 MVE.keyart.credit 相同
  /** 特写的背景：左边是门里的暖光，右边是夜；门灯、窗、三角梅的散景 */
  function smileBg(g, s) {
    const t = s.t;
    g.fillStyle = hg(g, 0, VW, [[0, '#8a5438'], [0.3, '#5a3448'], [0.62, '#2a1e4c'], [1, '#120e2a']]); g.fillRect(-10, -10, VW + 20, VH + 20);
    g.fillStyle = vg(g, 0, VH, [[0, 'rgba(10,6,24,0.35)'], [0.5, 'rgba(10,6,24,0)'], [1, 'rgba(10,6,24,0.45)']]); g.fillRect(-10, -10, VW + 20, VH + 20);
    E.glow(g, 240, 330, 760, '255,186,112', 0.42, 'lighter', false);
    E.glow(g, 300, 260, 160, '255,236,196', 0.5, 'lighter', false);
    for (let i = 0; i < 12; i++) { const x = 1340 + hash(1501, i) * 620 + sin(t * 0.3 + i) * 10, y = 120 + hash(1502, i) * 860, r = 40 + hash(1503, i) * 80; E.glow(g, x, y, r, i % 3 ? '255,120,180' : '255,180,210', 0.14 + 0.06 * sin(t * 1.3 + i), 'lighter', false); }
    for (let i = 0; i < 7; i++) { const x = 60 + hash(1504, i) * 700, y = 80 + hash(1505, i) * 900, r = 30 + hash(1506, i) * 70; E.glow(g, x, y, r, '255,214,160', 0.12 + 0.05 * sin(t * 1.1 + i * 2), 'lighter', false); }
  }
  /** 立绘不可用时：Q 版的她，门口的近景（表情从惊讶变成笑） */
  function smileFallback(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 1236, y: 862, z: 4.6 + lt * 0.12, ...hand(s, 173, 1.5, 0.2) };
    mzScene(g, s, cam, { key: 'f', base: { x: 1236, y: 862, z: 4.7 }, res: 1.0, door: 1, mid: (q) => doorAdele(q, s, t, { look: [-0.3, 1], expr: lt < 0.85 ? 'surprise' : 'smile' }) });
    s.post.vignette(g, 0.5);
  }
  function shotSmile(g, s) {
    const K = KA(), lt = s.lt, t = s.t;
    if (!K) { smileFallback(g, s); return; }
    const sm = s.at(0.8, 1.45, 'sine');
    K.shot(g, s, {
      key: 'alter-e0', crop: 'face',
      from: { crop: 'face', z: 1.0, x: 0.014, y: 0.004, look: [-0.55, 0.5], gaze: [-0.9, 0.8], tilt: 0 },
      to: { crop: 'face', z: 1.08, x: -0.004, y: -0.004, look: [-0.3, 0.32], gaze: [-0.5, 0.5], tilt: 0.26 },
      ease: 'sine',
      eyes: sm > 0.98 ? 'smile' : 'open', smile: sm, mouth: 0.16 * (1 - sm), blush: 0.4 * sm, blink: lt < 0.6 ? 0 : 'auto',
      wind: 0.12, windDir: 1, seed: 7,
      grade: { base: 'night', tint: ['#ffe2c6', 0.22], sat: 0.96, light: { color: '#b4c6ff', dir: [0.8, -0.55], rim: 0.95, wash: 0.05 }, overlay: ['#ff9a5a', 0.1, 'soft-light'], leak: '255,180,120', bokeh: '255,190,150' },
      bg: (q, s2) => smileBg(q, s2),
      leak: { x: 160, y: 280, r: 1000, rgb: '255,176,110', a: 0.32 },
      particles: [{ type: 'fireflies', n: 10 }], dof: 0.5, bloom: 0.3,
      fallback: () => smileFallback(g, s),
    });
    // 货箱在画外冒上来的汽水泡泡（左下角往上飘）
    for (let i = 0; i < 9; i++) { const ph = fract(t * (0.28 + hash(1510, i) * 0.2) + hash(1511, i)); bubble(g, 140 + hash(1512, i) * 380 + sin(t * 2 + i) * 12, 1120 - ph * 700, 8 + hash(1513, i) * 14, 0.8 * sin(PI * ph)); }
  }
  /* ---------- 片尾（174.70 → 179.70）：远景——她蹲下把货箱拖进门，门关上；窗里的灯亮着；片名与字幕；平台上的瓶盖上有一枚粉色的小蹄印 ---------- */
  function shotEnd(g, s) {
    const t = s.t, lt = s.lt;
    const path = (u) => { const kk = ease.inOut(clamp(u / 5)); return { x: lerp(1080, 1170, kk), y: lerp(730, 820, kk), z: lerp(1.0, 1.42, kk) }; };
    const B = pathBase(s, path);
    const cam = Object.assign(path(lt), hand(s, 175, 2, 0.2));
    const drag = clamp(lt / 1.3), close = clamp((lt - 1.3) / 0.5);
    const cx = lerp(MZC.x, MZ.door.x - 4, ease.inOut(drag)), cy = MZC.y - drag * 4;
    mzScene(g, s, cam, {
      key: 'e', base: B, res: B.res, door: 1 - close, fireworks: true,
      // 门里（门扇之后画）：她蹲着往里拖；拖到门口以后箱子也归到门里，关门时被门扇挡住
      inside: (q) => {
        if (close < 1) {
          // 面朝货箱倒着往屋里退（Move 倒放，脚不打滑），把箱子拖进门
          const ax = lerp(MZ.door.x - 6, MZ.door.x + 30, ease.inOut(drag)), mv = drag > 0 && drag < 1;
          const ok = sdOK('alter') && SDK().draw(q, 'alter', { x: ax, y: MZ.step - 2, h: 192, anim: mv ? 'Move' : 'Relax', speed: mv ? -0.35 : 1, t, flip: true, rim: { color: '255,210,150', amount: 0.8 } });
          if (!ok) doorAdele(q, s, t, { x: ax, pose: 'crouch', expr: 'smile', look: [-0.4, 0.6], flip: true });
        }
        if (drag >= 1 && close < 1) crate(q, s, cx, cy, MZC.sc, { no: 7, hoof: 1, lid: 0 });
      },
      mid: (q) => {
        // 台阶上的瓶盖（彩蛋）：一枚粉色的小蹄印；最后冒一个泡泡、“啵”
        bottleCap(q, s, 1300, MZ.step + 14, 16, 0.2, 0.42, { hoof: true });
        E.glow(q, 1300, MZ.step + 12, 40, '255,170,210', 0.3);
        const bp = t - 178.35;
        if (bp > -1.0 && bp < 0) bubble(q, 1300 + (bp + 1) * 4, MZ.step + 4 - (bp + 1) * 56, 5 + (bp + 1) * 5, 0.9);
        else if (bp >= 0 && bp < 0.5) popBurst(q, 1304, MZ.step - 52, 34, bp / 0.5, 177);
      },
      after: (gg) => { if (drag < 1) doorCrate(gg, s, cam, t, { x: cx, y: cy, hum: 1 - drag, tint: 0.2 * (1 - drag) }); },
    });
    // 片名与字幕卡在叠加层里画（在调色之后，不被调色）
    s.post.vignette(g, 0.45);
  }

  /* =========================================================
   * 叠加层：成片风格（MVE.finish：分段调色 + 辉光 + 漏光 + 颗粒）→ 片头 / 片尾标题（不被调色）
   * ========================================================= */
  const FIN = () => { const F = window.MVE && window.MVE.finish; return F && F.enabled !== false ? F : null; };
  let CUES = null;
  /** 分段风格：白天 summer-noon；工坊里 golden-hour；汽水喷发的几段加逐通道辉光；傍晚 siesta-sunset；夜里 night-blue（暗角由各镜头自己控制） */
  function lookCues(F) {
    if (CUES) return CUES;
    const T0 = {}; for (const sh of shots) T0[sh.id] = sh.t0;
    const L = (n, o) => Object.assign({}, F.LOOKS[n] || { grade: n }, { vignette: null }, o || {});
    const noon = L('summer-noon'), gold = L('golden-hour'), dusk = L('siesta-sunset'), night = L('night-blue');
    const fizz = L('summer-noon', { bloom: { strength: 0.5, threshold: 0.7, key: 'rgb', tint: '255,244,250' } });
    CUES = [[0, noon], [T0.inside, gold], [T0.hat, noon], [T0.crates, gold], [T0.boom, fizz], [T0.surf, noon], [T0.launch, fizz], [T0.apex, noon], [T0.bubblefw, fizz], [T0['vendor-roof'], noon], [T0.hiccup, dusk], [T0.lanterns, night]];
    return CUES;
  }
  const BURST = new Set(['boom', 'spout', 'launch', 'bubblefw', 'finale']);
  function overlay(g, s) {
    const t = s.t, F = FIN();
    warmAhead(s);
    if (F) {
      try {
        // 汽水喷发的几段：前景里虚掉的白色气泡
        if (BURST.has(s.shot.id)) F.bokeh(g, s, { n: 16, seed: 5, colors: ['255,255,255', '232,246,255', '255,234,246'], a: 0.26, size: [18, 84], depth: [0.3, 1] });
        const K = KA(), kaShot = s.shot.id === 'smile' && K && K.ready && K.ready('alter-e0');   // 立绘特写自带调色与颗粒
        if (!kaShot) F.frame(g, s, F.look(t, lookCues(F), 0.35));
      } catch (e) { s.post.grain(g, t, 0.035); }
    } else s.post.grain(g, t, 0.035);
    // 片头标题：2.1s 第一下重音时出来，6.6s 前收走
    if (t > 0.1 && t < 2.1 && !F) LC(s, 'title', 1400, 560, titleArt, 1);
    const ta = win(t, 2.05, 2.5, 6.0, 6.75);
    if (ta > 0) {
      if (F && F.title) {
        F.title(g, s, { text: '汽水', sub: 'EFFERVESCENCE', label: 'MV · 本页原创', style: 'bold', align: 'center', x: 960, y: 330, size: 190, t0: 2.05, dur: 1.2, out: 6.0, outDur: 0.7, fill: ['#ffffff', '#fff2f8', '#ffc2dc'] });
        // 标题旁边转着的一枚皇冠瓶盖
        const cp = clamp((t - 2.3) / 0.5);
        if (cp > 0) bottleCap(g, s, 1236, 262 + sin(t * 2.2) * 6, 30 * ease.back(cp), 0.25 + sin(t * 1.3) * 0.12, 0.3 + 0.7 * abs(cos(t * 2.4)), { a: ta });
      } else {
        const c = LC(s, 'title', 1400, 560, titleArt, 1);
        const pop = ease.back(clamp((t - 2.05) / 0.5)), bob = sin((t - 2.05) * TAU / (BEAT * 2)) * 4;
        g.save(); g.globalAlpha = ta; g.translate(900, 330 + bob); g.scale(0.74 * pop, 0.74 * pop); g.rotate(-0.04 + 0.04 * ease.out(clamp((t - 2.05) / 0.8)));
        E.glow(g, 0, -40, 560, '255,255,255', 0.32 * ta);
        g.drawImage(c, -700, -260, 1400, 560);
        g.restore();
      }
      // 从标题下面冒上来的气泡
      for (let i = 0; i < 14; i++) { const ph = fract((t - 2.05) * 0.45 + hash(84, i)); bubble(g, 960 + (hash(85, i) - 0.5) * 760, 540 - ph * 420, 6 + hash(86, i) * 16, ta * sin(PI * ph) * 0.9); }
      for (let i = 0; i < 8; i++) { const a = ta * max(0, sin(t * 1.8 + i * 1.3)); sparkle(g, 960 + (hash(81, i) - 0.5) * 1000, 300 + (hash(82, i) - 0.5) * 320, 14 + hash(83, i) * 16, a, t * 0.3, '255,250,235'); }
    }
    // 片尾：片名 + 字幕卡
    if (t > 175) {
      const te = win(t, 175.2, 176.0, 178.9, 179.6);
      if (te > 0) {
        if (F && F.title) F.title(g, s, { text: '汽水', sub: 'EFFERVESCENCE', style: 'bold', align: 'center', x: 960, y: 250, size: 96, t0: 175.2, dur: 1.0, out: 178.9, outDur: 0.7, fill: ['#ffffff', '#fff2f8', '#ffc2dc'] });
        else { const c = LC(s, 'title', 1400, 560, titleArt, 1); g.save(); g.globalAlpha = te; g.translate(960, 230); g.scale(0.36, 0.36); E.glow(g, 0, -40, 700, '255,200,230', 0.22); g.drawImage(c, -700, -260, 1400, 560); g.restore(); }
      }
      g.save(); g.translate(0, -300); creditsCard(g, win(t, 175.6, 176.3, 178.9, 179.6)); g.restore();
    }
  }

  /* =========================================================
   * 镜头表
   * ========================================================= */
  const shots = [
    { id: 'heat', t0: 0, title: '汐斯塔的午后', draw: shotHeat },
    { id: 'sweat', t0: D[3], in: { type: 'fade', dur: 0.6 }, draw: shotSweat },
    { id: 'peek', t0: D[5], draw: shotPeek },
    { id: 'glint', t0: D[6], draw: shotGlint },
    { id: 'row', t0: D[7], draw: shotRow },
    { id: 'sneak', t0: D[8], title: '潜入', draw: shotSneak },
    { id: 'doze', t0: D[10], draw: shotDoze },
    { id: 'eye', t0: D[11], draw: shotEye },
    { id: 'pov', t0: D[11] + 2 * BEAT, draw: shotPov },
    { id: 'door', t0: D[12], draw: shotDoor },
    { id: 'tower', t0: D[13], draw: shotTower },
    { id: 'inside', t0: D[15], draw: shotInside },
    { id: 'lever', t0: D[16], draw: shotLever },
    { id: 'machine', t0: D[17], title: '流水线', in: { type: 'flash', dur: 0.3, color: '#fff2e0' }, draw: shotMachine },
    { id: 'fill', t0: D[18], draw: shotFill },
    { id: 'cap', t0: D[19], draw: shotCap },
    { id: 'ride', t0: D[20], draw: shotRide },
    { id: 'popline', t0: D[21], draw: shotPopline },
    { id: 'burp', t0: D[22], draw: shotBurp },
    { id: 'hat', t0: D[23] + BEAT, draw: shotHat },
    { id: 'pov-float', t0: D[24], draw: shotPovFloat },
    { id: 'carry', t0: D[25], draw: shotCarry },
    { id: 'keepaway', t0: D[26], draw: shotKeepaway },
    { id: 'crates', t0: D[28], draw: shotCrates },
    { id: 'leaks', t0: D[30], draw: shotLeaks },
    { id: 'overload', t0: D[32], draw: shotOverload },
    { id: 'hush', t0: D[33], draw: shotHush },
    { id: 'fizz', t0: D[35], in: { type: 'fade', dur: 0.8 }, draw: shotFizzMacro },
    { id: 'rumble', t0: D[37], draw: shotRumble },
    { id: 'uhoh', t0: D[39], draw: shotUhoh },
    { id: 'boom', t0: D[40], title: '汽水喷泉', draw: shotBoom },
    { id: 'spout', t0: D[41], draw: shotSpout },
    { id: 'surf', t0: D[42], draw: shotSurf },
    { id: 'rockets', t0: D[44], draw: shotRockets },
    { id: 'launch', t0: D[46], draw: shotLaunch },
    { id: 'apex', t0: D[48], in: { type: 'white', dur: 0.7 }, draw: shotApex },
    { id: 'above', t0: D[50], in: { type: 'fade', dur: 1.0 }, draw: shotAbove },
    { id: 'grin', t0: D[52], draw: shotGrin },
    { id: 'harbor', t0: D[53], title: '汽水火箭', in: { type: 'slide', dir: 'left', dur: 0.4 }, draw: shotHarbor },
    { id: 'trike', t0: D[55], draw: shotTrike },
    { id: 'market', t0: D[56], draw: shotMarket },
    { id: 'alley', t0: D[58], draw: shotAlley },
    { id: 'land', t0: D[59], draw: shotLand },
    { id: 'geysers', t0: D[60], title: '屋顶派对', draw: shotGeysers },
    { id: 'dance', t0: D[62], draw: shotDance },
    { id: 'bubblefw', t0: D[64], in: { type: 'flash', dur: 0.35, color: '#fff4fa', a: 0.45 }, draw: shotBubbleFw },
    { id: 'vendor-roof', t0: D[66], draw: shotVendorRoof },
    { id: 'toast', t0: D[67], draw: shotToast },
    { id: 'finale', t0: D[68], draw: shotFinale },
    { id: 'hiccup', t0: D[70], in: { type: 'fade', dur: 1.0 }, draw: shotHiccup },
    { id: 'pack', t0: D[73], title: '回家', in: { type: 'fade', dur: 1.2 }, draw: shotPack },
    { id: 'lanterns', t0: D[75], in: { type: 'fade', dur: 1.0 }, draw: shotLanterns },
    { id: 'path', t0: D[77], in: { type: 'black', dur: 0.7, color: '#0c0820' }, draw: shotPath },
    { id: 'knock', t0: D[79], in: { type: 'fade', dur: 0.6 }, draw: shotKnock },
    { id: 'door-open', t0: D[80], title: '敲门', draw: shotDoorOpen },
    { id: 'smile', t0: D[81], draw: shotSmile },
    { id: 'end', t0: D[82], t1: DUR, in: { type: 'fade', dur: 0.5 }, draw: shotEnd },
  ];

  /* =========================================================
   * 旁白（本页原创；不是歌词）
   * ========================================================= */
  const captions = [
    [7.3, 10.7, '下午两点。汐斯塔热得冒泡。'],
    [18.3, 21.5, '谁也看不见它们——除了你。'],
    [51.9, 55.5, '雪雉只看见：汽水自己飘走了。'],
    [106.9, 110.7, '从天上看，汐斯塔像一瓶刚摇过的汽水。'],
    [143.3, 147.1, '那天下午，雪雉对着空气干了一杯。'],
    [160.3, 163.9, '剩下的汽水，要送给一个人。'],
  ];

  E.film({
    id: 'effervescence',
    title: 'Effervescence',
    audio: 'assets/music/effervescence.mp3',
    fadeOut: 1.2,
    meta: {
      no: 'V', cn: '汽水', en: 'Effervescence',
      artists: '塞壬唱片-MSR / Kirara Magic',
      form: 'alter', era: '番外 · 汐斯塔的下午',
      logline: '汐斯塔最热的那个下午，一群谁也看不见的粉色小羊，盯上了海边的汽水摊。',
      synopsis: [
        '汐斯塔最热的那个下午。在海边看汽水摊的雪雉在遮阳篷下的长凳上午睡，冰柜里的汽水瓶在太阳下冒汗——热浪里，浮出一个粉色的小鼻子。',
        '一群谁也看不见的粉色小羊踮着脚溜过睡着的店主，叠成一座“羊塔”打开工坊的门，拉下了灌装机的拉杆。流水线一拍一个瓶盖，小羊们偷喝、打嗝、把瓶子排成队运走；雪雉只看见汽水自己飘走。',
        '压力表爬进红区，“砰”——粉色的汽水喷泉冲破屋顶。它们踩着泡沫冲浪，骑着摇过的汽水瓶飞上天，掠过港口和集市，在白色的屋顶上开了一场汽水派对。',
        '天黑了。它们顶着装满剩下汽水的 7 号货箱穿过灯笼街，敲响火山博物馆的门，一溜烟钻进箱子。门开了，她只看见一只嗡嗡冒泡的货箱——那天深夜，它在博物馆里翻倒了。',
      ],
      cast: [
        { who: 'sheep-pink', o: { sd: true, variant: 'enemy_1350_mgcshp', bow: '#ff4f8f' }, role: '带头的小羊（巫师帽的“星术师”）' },
        { who: 'sheep-pink', o: { sd: true, variant: 'enemy_1347_fyshp', glasses: true }, role: '会看压力表的“工程师”（竹蜻蜓 + 护目镜）' },
        { who: 'sheep-pink', o: { sd: true, variant: 'enemy_1344_ddlamb' }, role: '顶着交通锥的小羊们' },
        { who: 'snowsant', role: '汽水摊的店主（雪雉）' },
        { who: 'adele-alter', o: { outfit: 'coat' }, role: '收到一箱会冒泡的货' },
      ],
      poster: 128.9, thumbs: [37.5, 88.4, 140.2, 171.8], accent: '#ff7fb6',
    },
    needs: ['keyart', 'finish', 'sd'],
    sd: SD_KEYS,
    prepare: async (ctx) => {
      // 官方立绘（门口那一下的脸部特写）：预载；不可用时特写退回 Q 版
      const ka = ctx && ctx.keyart ? ctx.keyart(['alter-e0', 'snowsant']) : Promise.resolve(false);
      // 官方 Q 版小人（小羊 × 3、雪雉、纯烬）+ 雪雉的剧情立绘（特写用的几个表情）：预载，最多等 8 秒
      const Sd = SDK();
      const sdp = Sd ? Promise.race([Promise.all([Sd.load ? Sd.load(SD_KEYS, 8000) : true, Sd.card && Sd.card.load ? Sd.card.load('snowsant', [1, 2, 3, 9, 10, 11]) : true]), new Promise((r) => setTimeout(r, 8000))]) : Promise.resolve(false);
      const F = FIN(); if (F && F.warm) F.warm(['grain', 'summer-noon', 'golden-hour', 'siesta-sunset', 'night-blue']);
      if (document.fonts) {
        try { await Promise.race([Promise.all(['900 190px "Noto Serif SC"', '700 54px Cinzel', '700 26px "Noto Sans SC"', '500 24px "Noto Sans SC"', '700 44px "Noto Sans SC"'].map((f) => document.fonts.load(f, '汽水汐斯塔易碎本页原创启动工坊砰嗝叮咚咔嚓啵EFFERVESCENCESIESTA'))), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* 字体没到也能画 */ }
      }
      vendorKey();
      // 小羊精灵的包围盒提前量好（避免第一次出场时卡一下）
      for (const k of Object.keys(LAMB)) for (const pose of ['stand', 'jump', 'walk', 'run', 'sit', 'sleep', 'push', 'look-up', 'eat', 'float']) castBox(LAMB[k][0], Object.assign({ pose }, LAMB[k][1]));
      await Promise.all([ka, sdp.catch(() => false)]);
    },
    captions,
    overlay,
    release() { release(); CUES = null; const K = KA(); if (K && K.release) K.release(); },
    shots,
  });
})();