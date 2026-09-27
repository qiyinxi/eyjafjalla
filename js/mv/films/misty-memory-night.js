/* =========================================================
 * 影像 II · 雾中之忆 —— Misty Memory (Night Version)
 * 本页原创的同人 MV（Canvas 2D 实时渲染；画面是时间 t 的纯函数），与官方无关。
 *
 * 故事（三部曲「她的三个夏天」之二）
 *   多年后的汐斯塔，夏夜。火山博物馆里，纯烬时期的阿黛尔给标本写标签，写到第 27 号时趴在桌上睡着了。
 *   窗下的货箱一歪，一群粉色小羊和汽水瓶滚了出来，气泡冒成了粉色的雾；小羊们叼走了挂在椅背上的母亲的外套，
 *   她追着它们走进一场粉色的夜雾之梦：灯笼街、踩着拍子跳过屋顶的小羊、会数羊的集市、多利的羊形云。
 *   雾最浓的时候，雾里的餐桌边坐着两只小黑羊——一只系着小红领带，一只围着外套布料做的白围巾。
 *   它们陪她坐汽水瓶船、看水母灯、坐羊群旋转木马；在起雾的山坡上，把一块温热的小石头推到她手心。
 *   梦里的旧火山亮了，小羊们被卷成粉色的“羊卷风”，外套从天而降——她穿上它（刚好合身），拿起开花的法杖，
 *   踩着小羊一路跑上山。火山口的光里，两只黑羊有一瞬变回两个人的剪影，向她挥手，被雾温柔地收走。
 *   天亮了：云海上的日出、像鸟一样飞的小羊、一张张发光的回忆卡片。醒来是博物馆的早晨，
 *   凯勒馆长给她盖上毯子；汽水还在冒泡，第 27 号标签上多了一个粉色的小蹄印，手心里握着那块浮石。
 *
 * 结构：镜头边界对齐小节线（D[i] = 第 i 小节的起点），各段能量见 assets/music/misty-memory-night.json。
 * 性能：静态大图层走自带的 LRU 位图缓存（按分辨率区分、总量有上限）；小羊群用角色库画好的精灵图；
 *       所有粒子 / 摆动 / 跳跃都由 t 解析地算出来。
 * ========================================================= */
(() => {
  'use strict';
  const E = window.MVE;
  if (!E) return;
  const { VW, VH, TAU, clamp, lerp, ease, hash, wobble } = E;
  const PI = Math.PI;
  const fract = (x) => x - Math.floor(x);
  const sst = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  /** 梯形窗：a→b 升起，c→d 落下 */
  const win = (x, a, b, c, d) => Math.min(sst(a, b, x), 1 - sst(c, d, x));
  const pick = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

  /* 小节线（assets/music/misty-memory-night.json 的 downbeats；≈114.93 BPM，一小节 ≈2.09s） */
  const D = [1.6, 3.691, 5.749, 7.84, 9.92, 12.011, 14.101, 16.192, 18.272, 20.363, 22.443, 24.523, 26.613, 28.704, 30.784, 32.875, 34.965, 37.045, 39.136, 41.227, 43.317, 45.397, 47.488, 49.568, 51.659, 53.749, 55.84, 57.92, 60, 62.091, 64.181, 66.272, 68.352, 70.443, 72.533, 74.624, 76.715, 78.805, 80.885, 82.976, 85.056, 87.136, 89.227, 91.307, 93.397, 95.488, 97.568, 99.659, 101.749, 103.829, 105.92, 108.011, 110.091, 112.181, 114.261, 116.352, 118.443, 120.533, 122.613, 124.704, 126.795, 128.875, 130.965, 133.056, 135.136, 137.227, 139.307, 141.387, 143.488, 145.568, 147.659, 149.749, 151.829, 153.92, 156.011, 158.101, 160.181, 162.261, 164.352, 166.443, 168.533, 170.603, 172.704, 174.795, 176.885, 178.965, 181.056, 183.147, 185.227, 187.317, 189.397, 191.488, 193.579, 195.669, 197.749, 199.84, 201.931, 204.011, 206.101, 208.181, 210.261, 212.352, 214.432, 216.523, 218.613, 220.704, 222.784, 224.875, 226.965, 229.056, 231.136, 233.227, 235.307, 237.397, 239.477, 241.579];
  const BEAT = 60 / 114.93;
  const DUR = 242.087;

  const cast = (g, who, o) => { if (E.cast && E.cast.draw) E.cast.draw(g, who, o); };
  /** 官方 Q 版小人两个动画之间交叉淡化（o.sd 规格，走角色库的钩子，受 sd 的镜头闸门保护；没有官方小人时角色库照常按 pose 画手绘版） */
  const sdMix = (from, to, k, view = 'build') => (k <= 0.001 ? { view, anim: from } : k >= 0.999 ? { view, anim: to } : { view, from, to, k });
  /** 官方小人的坐姿：臀部在座面上、小腿垂下约 0.36 身高（量出来的）。座面要至少这么高，否则小腿会穿过地面 */
  const SIT_DROP = 0.37;
  /** 让她坐在座面 seatY 上（座面以下的小腿自然垂下；手绘版同一个座面高度） */
  const sitOn = (o, seatY) => Object.assign(o, { pose: 'sit', y: seatY + SIT_DROP * o.h, seat: SIT_DROP * o.h });
  /** 一块可以坐的大石头（顶面平一点，月光勾边，脚下几丛草）：(x, groundY) 底边中点，w 宽，h 高 */
  function seatRock(q, x, groundY, w, h, o = {}) {
    const top = groundY - h;
    groundShadow(q, x, groundY + 2, w * 0.62, 0.55);
    q.fillStyle = o.col || '#2c1d40';
    q.beginPath(); q.moveTo(x - w * 0.5, groundY + 4);
    q.bezierCurveTo(x - w * 0.54, groundY - h * 0.5, x - w * 0.44, top + h * 0.06, x - w * 0.18, top + 2);
    q.quadraticCurveTo(x + w * 0.06, top - h * 0.05, x + w * 0.3, top + h * 0.02);
    q.bezierCurveTo(x + w * 0.52, top + h * 0.12, x + w * 0.56, groundY - h * 0.4, x + w * 0.5, groundY + 4); q.closePath(); q.fill();
    q.strokeStyle = o.rim || 'rgba(210,180,255,0.45)'; q.lineWidth = Math.max(2, w * 0.018);
    q.beginPath(); q.moveTo(x - w * 0.42, top + h * 0.12); q.quadraticCurveTo(x + w * 0.02, top - h * 0.05, x + w * 0.34, top + h * 0.04); q.stroke();
    q.strokeStyle = 'rgba(10,4,20,0.35)'; q.lineWidth = Math.max(1.5, w * 0.012);
    q.beginPath(); q.moveTo(x - w * 0.1, top + h * 0.3); q.quadraticCurveTo(x + w * 0.05, top + h * 0.55, x - w * 0.02, groundY - h * 0.1); q.stroke();
    q.strokeStyle = o.grass || '#120a20'; q.lineWidth = Math.max(2, w * 0.016); q.lineCap = 'round';
    for (let i = 0; i < 9; i++) { const gx = x - w * 0.55 + (i / 8) * w * 1.1 + Math.sin(i * 7.1) * 8, gh = h * (0.12 + 0.1 * Math.abs(Math.sin(i * 3.3))); q.beginPath(); q.moveTo(gx, groundY + 6); q.quadraticCurveTo(gx + Math.sin(i) * 6, groundY - gh * 0.6, gx + Math.sin(i * 2) * 10, groundY - gh); q.stroke(); }
    q.lineCap = 'butt';
    return top;
  }
  /** 一把给小人坐的木椅（座面高 seatH；flip：椅背在右边） */
  function chibiChair(q, x, floorY, seatH, w, flip) {
    const ink = 'rgba(40,20,30,0.9)', sy = floorY - seatH, d = flip ? 1 : -1;
    q.fillStyle = '#6a4232'; q.strokeStyle = ink; q.lineWidth = 3;
    q.fillRect(x - w / 2 + 6, sy + 12, 12, seatH - 12); q.fillRect(x + w / 2 - 18, sy + 12, 12, seatH - 12);
    q.fillRect(x + d * (w / 2 - 12) - 7, sy - seatH * 0.95, 14, seatH * 0.95 + 12); q.strokeRect(x + d * (w / 2 - 12) - 7, sy - seatH * 0.95, 14, seatH * 0.95 + 12);
    rrect(q, x + d * (w / 2 - 12) - 14, sy - seatH * 1.02, 28, seatH * 0.4, 8); q.fill(); q.stroke();
    q.fillRect(x - w / 2, sy, w, 14); q.strokeRect(x - w / 2, sy, w, 14);
    q.fillStyle = 'rgba(255,220,190,0.25)'; q.fillRect(x - w / 2, sy, w, 3);
    return sy;
  }
  /** 走 / 跑的步频正好配上横向速度 v（像素 / 秒）时，要传给角色库的 speed（脚不打滑） */
  function stepSpeed(who, o, v, fb = 1) {
    if (!(E.cast && E.cast.gait)) return fb;
    const g1 = E.cast.gait(who, Object.assign({}, o, { speed: 1 })).speed;
    return g1 > 1 ? Math.abs(v) / g1 : fb;
  }
  /** 速度在变（加速 / 减速）时：用“走过的距离 / 每秒步幅”当作步态时间，腿的相位跟着距离走（再加上 t0 让呼吸 / 眨眼照常） */
  function gaitTime(who, o, dist, t0 = 0) {
    if (!(E.cast && E.cast.gait)) return t0 + dist / 100;
    const g1 = E.cast.gait(who, Object.assign({}, o, { speed: 1 })).speed;
    return t0 + (g1 > 1 ? Math.abs(dist) / g1 : 0);
  }
  /** 角色身上的关键点（正式立绘提供 anchors；占位版没有时用估计值 fb） */
  function anchor(who, o, key, fb) {
    try { if (E.cast && E.cast.anchors) { const A = E.cast.anchors(who, o); if (A && A[key]) return A[key]; } } catch (e) { /* 用估计值 */ }
    return fb;
  }
  /** 推荐的相对身高（卡提亚 = 1） */
  const scaleOf = (who, fb) => (E.cast && E.cast.meta && E.cast.meta[who] && E.cast.meta[who].scale) || fb;
  /** 提着的灯笼在哪（给光晕定位） */
  const lanternAt = (o) => anchor('adele-alter', o, 'prop', [o.x + (o.flip ? -1 : 1) * o.h * 0.16, o.y - o.h * 0.42]);
  /**
   * 她提着一盏灯：先画人（官方小人的站 / 走），再把灯笼挂在她手上（anchors().handN；走路时随手摆动、灯笼自己再晃一点）。
   * 返回灯笼的光心（给光晕用）。o: { k 灯笼高度 / 身高, ci 颜色, halo: 光晕强度（0 = 不画） }
   */
  function carryLantern(q, s, ao, o = {}) {
    cast(q, 'adele-alter', ao);
    const [hx, hy] = anchor('adele-alter', ao, 'handN', [ao.x + (ao.flip ? -1 : 1) * ao.h * 0.18, ao.y - ao.h * 0.36]);
    const size = ao.h * (o.k ?? 0.2), sw = Math.sin(s.t * 2.3 + (o.seed || 0)) * (ao.pose === 'walk' ? 0.12 : 0.05);
    const cx = hx - Math.sin(sw) * size * 0.52, cy = hy + Math.cos(sw) * size * 0.52;
    if (o.halo !== 0) lanternHalo(q, cx, cy, s.t, o.halo ?? 1);
    lantern(q, s, hx, hy - size * 0.04, size, o.ci ?? 2, sw);
    return [cx, cy];
  }

  /* =========================================================
   * 缓存
   * ========================================================= */
  // 大图层：按分辨率 k 区分，最近最少使用的先丢（上限约 12 个整屏；切走时 release() 全部释放）
  const LRU = new Map();
  let lruPx = 0, maxK = 0; // maxK：见过的最大分辨率系数（海报 / 缩略图这类小渲染器不会把主播放器的缓存挤掉）
  function lcBuild(ck, w, h, fn, k, sk) {
    const c = E.mk(w * k, h * k);
    const q = c.getContext('2d');
    q.setTransform(k, 0, 0, k, 0, 0);
    fn(q, k);
    LRU.set(ck, c);
    lruPx += c.width * c.height;
    if (sk > maxK) maxK = sk;
    const max = 12 * VW * VH * maxK * maxK;
    for (const [kk, cc] of LRU) {
      if (lruPx <= max || kk === ck) break;
      LRU.delete(kk); lruPx -= cc.width * cc.height; cc.width = cc.height = 1;
    }
    return c;
  }
  // 预热：切镜头前约 2.6 秒，把下一个镜头“空跑”一遍（画到 2×2 的假画布上），
  // 记下它缺的图层，之后每帧只花几毫秒把它们一张张建好——切过去的那一帧就不会卡
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
  /** 播放器切走 / 区块远离视口时调用：放掉所有自建的位图（之后用到时再懒建） */
  function release() {
    for (const c of LRU.values()) c.width = c.height = 1;
    LRU.clear(); lruPx = 0; maxK = 0; warmQ.length = 0; warmedAt.clear();
    for (const c of SPM.values()) c.width = c.height = 1;
    SPM.clear();
    OL.clear();
  }
  function warmStep(ms, sk) {
    const t0 = performance.now();
    while (warmQ.length && performance.now() - t0 < ms) { const it = warmQ.shift(); if (it.sk === sk && !LRU.has(it.ck)) lcBuild(it.ck, it.w, it.h, it.fn, it.k, it.sk); }
  }
  const warmedAt = new Map(), dummyCtx = E.mk(2, 2).getContext('2d');
  /** 与引擎 state() 同样的字段（给预热空跑用） */
  function fakeState(s, shot, t) {
    const T = s.T, lt = t - shot.t0, dur = (Number.isFinite(shot.t1) ? shot.t1 : T.duration) - shot.t0;
    const beat = T.beatAt(t), bar = T.barAt(t), bp = beat - Math.floor(beat), barp = bar - Math.floor(bar);
    return Object.assign({}, s, {
      t, lt, dur, p: clamp(lt / dur), shot, beat, bar, bp, barp,
      pulse: (sh = 6) => Math.exp(-bp * sh), barPulse: (sh = 4) => Math.exp(-barp * sh),
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
  // 小精灵：固定像素尺寸（柔光、雾团这类糊的东西不必跟着分辨率走）
  const SPM = new Map();
  function spr(key, w, h, fn) { let c = SPM.get(key); if (!c) { c = E.mk(w, h); fn(c.getContext('2d'), w, h); SPM.set(key, c); } return c; }

  /* =========================================================
   * 相机：与引擎 s.layer 相同的视差变换；baked() 把静态层按“基准机位”烘焙，机位小幅移动时直接贴图
   * ========================================================= */
  function camT(q, c, d) {
    const z = 1 + ((c.z ?? 1) - 1) * d;
    q.translate(960 + (c.sx || 0) * d, 540 + (c.sy || 0) * d);
    if (c.r) q.rotate(c.r * Math.min(1, d));
    q.scale(z, z);
    q.translate(-960 - ((c.x ?? 960) - 960) * d, -540 - ((c.y ?? 540) - 540) * d);
  }
  function inCam(g, c, d, fn) { g.save(); camT(g, c, d); fn(g); g.restore(); }
  const BM = 0.1;
  /** 视差层 d1 里的世界 x，在视差层 d2 里对应同一个屏幕 x 的世界坐标（远处的月亮在海面上的倒影要一直在月亮正下方） */
  function sameScreenX(c, x, d1, d2) {
    const cx = (c.x ?? 960) - 960, sx = c.sx || 0, z1 = 1 + ((c.z ?? 1) - 1) * d1, z2 = 1 + ((c.z ?? 1) - 1) * d2;
    const X = 960 + sx * d1 + z1 * (x - 960 - cx * d1);
    return (X - 960 - sx * d2) / z2 + 960 + cx * d2;
  }
  /** 视差层 d 在机位 c 下能看到的世界矩形 [x0, y0, x1, y1]（含手持 / 抖动偏移，不含旋转——本片不转镜头） */
  function visRect(c, d) {
    const z = 1 + ((c.z ?? 1) - 1) * d, ox = 960 + ((c.x ?? 960) - 960) * d, oy = 540 + ((c.y ?? 540) - 540) * d;
    const sx = (c.sx || 0) * d, sy = (c.sy || 0) * d;
    return [ox + (0 - 960 - sx) / z, oy + (0 - 540 - sy) / z, ox + (VW - 960 - sx) / z, oy + (VH - 540 - sy) / z];
  }
  /** 调试（实验页设置 window.__mvAudit = []）：记录缓存图层 / 分块图层的边缘有没有露进画面。正式播放时只多一次全局变量判断 */
  function auditCover(key, d, cam, have, content) {
    const A = window.__mvAudit;
    if (!A || warmMode) return;
    const v = visRect(cam, d), z = 1 + ((cam.z ?? 1) - 1) * d, sides = ['left', 'top', 'right', 'bottom'];
    for (let i = 0; i < 4; i++) {
      const over = i < 2 ? have[i] - v[i] : v[i] - have[i];
      const more = !content || (i < 2 ? content[i] < have[i] - 0.5 : content[i] > have[i] + 0.5); // 那一边还有内容（被缓存截掉了）
      if (over * z > 0.5 && more) A.push([key, sides[i], +(over * z).toFixed(1)]);
    }
  }
  /**
   * crop = [x0, y0, x1, y1]（世界坐标，可选）：只烘焙这一块（大部分图层上下都是透明的，少画很多像素，也省显存）
   */
  function baked(g, s, key, base, cam, d, fn, res = 1, crop = null) {
    const W = VW * (1 + 2 * BM), H = VH * (1 + 2 * BM);
    const zb = 1 + ((base.z ?? 1) - 1) * d, zc = 1 + ((cam.z ?? 1) - 1) * d;
    const dbx = ((base.x ?? 960) - 960) * d, dby = ((base.y ?? 540) - 540) * d;
    const dcx = ((cam.x ?? 960) - 960) * d, dcy = ((cam.y ?? 540) - 540) * d;
    // 缓存坐标（屏幕 + 边距）里要烘焙的矩形
    let u0 = 0, v0 = 0, u1 = W, v1 = H;
    if (crop) {
      const sx = (x) => 960 + zb * (x - 960 - dbx) + VW * BM, sy = (y) => 540 + zb * (y - 540 - dby) + VH * BM;
      u0 = Math.max(0, Math.floor(sx(crop[0]))); v0 = Math.max(0, Math.floor(sy(crop[1]))); u1 = Math.min(W, Math.ceil(sx(crop[2]))); v1 = Math.min(H, Math.ceil(sy(crop[3])));
      if (u1 <= u0 || v1 <= v0) return;
    }
    const cw = u1 - u0, ch = v1 - v0;
    if (window.__mvAudit) { const wx = (u) => (u - VW * BM - 960) / zb + 960 + dbx, wy = (v) => (v - VH * BM - 540) / zb + 540 + dby; auditCover('baked:' + key, d, cam, [wx(u0), wy(v0), wx(u1), wy(v1)], crop); }
    const c = LC(s, key, cw, ch, (q) => { q.translate(-u0, -v0); q.translate(VW * BM, VH * BM); camT(q, base, d); fn(q); }, res);
    g.save();
    g.translate(960 + (cam.sx || 0) * d, 540 + (cam.sy || 0) * d);
    if (cam.r) g.rotate(cam.r * Math.min(1, d));
    g.translate(zc * (dbx - dcx), zc * (dby - dcy));
    g.scale(zc / zb, zc / zb);
    g.translate(-960 - VW * BM, -540 - VH * BM);
    const kk = s.k * res;
    g.drawImage(c, 0, 0, Math.min(c.width, cw * kk), Math.min(c.height, ch * kk), u0, v0, cw, ch);
    g.restore();
  }
  /* ---------- 成片后期（MVE.finish，js/mv/finish.js）：有就用，没有就退回原来的暗角 + 颗粒 ---------- */
  const FIN = () => { const F = window.MVE && window.MVE.finish; return F && F.enabled !== false ? F : null; };
  /**
   * 每个镜头自己的暗角：成片后期的风格里已经带了一层暗角（≈0.42），这里只补上比它更暗的那一部分；
   * 没有成片后期时照原样画
   */
  function vig(g, s, a) { const d = FIN() ? a - 0.44 : a; if (d > 0.01) s.post.vignette(g, d); }
  /** 屋里的夜：台灯的暖光发光，其余中性（不染粉） */
  const LOOK_ROOM = { bloom: { strength: 0.4, threshold: 0.66, tint: '255,214,170', radius: 5, key: 'rgb' }, grade: 'film', leak: { palette: 'warm', a: 0.14, side: 'tr' }, vignette: { a: 0.42, rgb: '22,8,16' }, grain: 0.07 };
  /** 起雾的山坡（星空下）：梦的粉紫里掺一点夜的蓝 */
  const LOOK_HILL = { bloom: { strength: 0.42, threshold: 0.64, tint: '230,210,255', radius: 5, key: 'rgb' }, grade: { mix: [['dream-pink', 0.65], ['night-blue', 0.35]] }, leak: { palette: 'pink', a: 0.14, side: 'left' }, vignette: { a: 0.44, rgb: '10,6,26' }, grain: 0.07 };
  /** 火山口：熔岩的辉光与红晕（ember 的光）+ 梦的粉紫（不去饱和：她的衣服、头发、小羊保持原色） */
  const LOOK_CRATER = { bloom: { strength: 0.5, threshold: 0.58, tint: '255,190,170', halation: 0.3, radius: 5, key: 'rgb' }, grade: { mix: [['dream-pink', 0.7], ['golden-hour', 0.3]] }, leak: { palette: 'warm', a: 0.18, side: 'right' }, vignette: { a: 0.46, rgb: '18,4,10' }, grain: 0.07 };
  /** 片尾：窗外的晴天（轻一点的金色） */
  const LOOK_END = { bloom: { strength: 0.32, threshold: 0.78, tint: '255,236,210' }, grade: 'golden-hour', amount: 0.5, leak: { palette: 'warm', a: 0.16, side: 'tr' }, vignette: 0.26, grain: 0.05 };
  // 分段：汐斯塔的黄昏夜 → 屋里的夜 → 梦（粉）→ 起雾的山坡 → 火山口 → 日出 → 早晨的博物馆 → 片尾
  const LOOK_CUES = [[0, 'siesta-sunset'], [14.101, LOOK_ROOM], [22.443, 'dream-pink'], [124.704, LOOK_HILL], [141.387, LOOK_CRATER], [191.488, 'dawn'], [224.875, 'golden-hour'], [233.227, LOOK_END]];
  /** 用了官方立绘的那两小段：立绘镜头自己已经调过色、加了辉光和暗角，这里只留很轻的一层统一色调 + 颗粒 */
  const KA_SPANS = [[156.011, 158.101], [185.227, 187.317]];
  function filmLook(F, t) {
    const L = F.look(t, LOOK_CUES, 1.2);
    for (const [a, b] of KA_SPANS) if (t >= a && t < b && kaReady()) return { grade: L.grade, amount: 0.25, grain: 0.05 };
    return L;
  }
  /** 减少动态效果时，闪白减弱 */
  const flashK = (s) => (s.reduced ? 0.35 : 1);
  const shake = (s, amp, seed = 3, sp = 18) => (s.reduced ? { sx: 0, sy: 0 } : { sx: wobble(seed, s.t * sp) * amp, sy: wobble(seed + 5, s.t * sp) * amp * 0.8 });
  const hand = (s, seed, amp = 5, sp = 0.35) => (s.reduced ? { sx: 0, sy: 0 } : s.handheld(seed, s.t, amp, sp));

  /* =========================================================
   * 常用画法
   * ========================================================= */
  function vg(q, y0, y1, stops) { const gr = q.createLinearGradient(0, y0, 0, y1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function hg(q, x0, x1, stops) { const gr = q.createLinearGradient(x0, 0, x1, 0); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function rg(q, x, y, r0, r1, stops) { const gr = q.createRadialGradient(x, y, r0, x, y, r1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function rrect(q, x, y, w, h, r) { q.beginPath(); q.moveTo(x + r, y); q.arcTo(x + w, y, x + w, y + h, r); q.arcTo(x + w, y + h, x, y + h, r); q.arcTo(x, y + h, x, y, r); q.arcTo(x, y, x + w, y, r); q.closePath(); }
  /** 闭合的平滑曲线（Catmull-Rom → 贝塞尔） */
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
  /** 不规则石块的轮廓点 */
  function rockPts(cx, cy, rx, ry, seed, n = 9, j = 0.22) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = 1 - j + hash(seed, i, 7) * j * 2; pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]); }
    return pts;
  }
  function withAlpha(g, a, fn) { if (a <= 0.003) return; const A = g.globalAlpha; g.globalAlpha = A * Math.min(1, a); fn(g); g.globalAlpha = A; }
  function additive(g, fn) { const m = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter'; fn(g); g.globalCompositeOperation = m; }

  /* ---------- 柔光 / 雾团 / 散景 / 星芒 / 气泡 ---------- */
  function puff(i, rgb) {
    const v = ((i % 4) + 4) % 4;
    return spr('puff' + v + rgb, 256, 128, (q) => {
      const R = E.rng(71 + v * 31);
      for (let j = 0; j < 11; j++) {
        const cx = 64 + R() * 128, cy = 54 + R() * 20, r = 26 + R() * 28;
        q.fillStyle = rg(q, cx, cy, 0, r, [[0, `rgba(${rgb},0.26)`], [0.5, `rgba(${rgb},0.13)`], [1, `rgba(${rgb},0)`]]);
        q.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    });
  }
  /** 横向漂移的雾带（中心 x 在 [x0, x1] 之间循环） */
  function fogBand(g, t, o) {
    const n = o.n || 8, w = o.w || 900, h = o.h || 300, seed = o.seed || 1, x0 = (o.x0 ?? 0) - w * 0.7, span = (o.x1 ?? VW) - (o.x0 ?? 0) + w * 1.4;
    const A = g.globalAlpha, rgb = o.rgb || '255,255,255';
    for (let i = 0; i < n; i++) {
      const sp = (o.speed ?? 20) * (0.6 + 0.8 * hash(seed, i, 1));
      const x = x0 + ((((hash(seed, i, 2) * span + t * sp) % span) + span) % span);
      const y = lerp(o.y0, o.y1, hash(seed, i, 3)) + Math.sin(t * 0.25 + i * 1.7) * (o.bob ?? 10);
      const sc = 0.7 + 0.6 * hash(seed, i, 4);
      g.globalAlpha = A * (o.a ?? 0.5) * (0.5 + 0.5 * hash(seed, i, 5));
      g.drawImage(puff(i + seed, rgb), x - (w * sc) / 2, y - (h * sc) / 2, w * sc, h * sc);
    }
    g.globalAlpha = A;
  }
  const hazeSpr = (rgb) => spr('haze' + rgb, 4, 256, (q) => { q.fillStyle = vg(q, 0, 256, [[0, `rgba(${rgb},0)`], [1, `rgba(${rgb},1)`]]); q.fillRect(0, 0, 4, 256); });
  /** 高度雾：从 y0（透明）到 y1（a）的竖直渐变 */
  function haze(g, rgb, x, y0, w, y1, a) { withAlpha(g, a, (q) => q.drawImage(hazeSpr(rgb), x, y0, w, y1 - y0)); }
  const bokehSpr = (rgb) => spr('bok' + rgb, 64, 64, (q) => {
    q.fillStyle = rg(q, 32, 32, 0, 31, [[0, `rgba(${rgb},0.28)`], [0.72, `rgba(${rgb},0.36)`], [0.9, `rgba(${rgb},0.55)`], [1, `rgba(${rgb},0)`]]);
    q.beginPath(); q.arc(32, 32, 31, 0, TAU); q.fill();
  });
  function bokeh(g, x, y, r, rgb, a) { if (a <= 0.01) return; const A = g.globalAlpha, m = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter'; g.globalAlpha = A * a; g.drawImage(bokehSpr(rgb), x - r, y - r, r * 2, r * 2); g.globalAlpha = A; g.globalCompositeOperation = m; }
  const sparkSpr = (rgb) => spr('spk' + rgb, 96, 96, (q) => {
    q.fillStyle = rg(q, 48, 48, 0, 48, [[0, `rgba(${rgb},0.6)`], [0.28, `rgba(${rgb},0.16)`], [1, `rgba(${rgb},0)`]]);
    q.fillRect(0, 0, 96, 96);
    q.fillStyle = '#fff'; q.beginPath();
    for (let j = 0; j < 4; j++) { const a = j * PI / 2 - PI / 2, b = a + PI / 4; q.lineTo(48 + Math.cos(a) * 45, 48 + Math.sin(a) * 45); q.lineTo(48 + Math.cos(b) * 6.5, 48 + Math.sin(b) * 6.5); }
    q.closePath(); q.fill();
  });
  function sparkle(g, x, y, r, a, rot = 0, rgb = '255,232,180') {
    if (a <= 0.01 || r <= 0.5) return;
    const A = g.globalAlpha, m = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = A * Math.min(1, a);
    if (rot) { g.translate(x, y); g.rotate(rot); g.drawImage(sparkSpr(rgb), -r, -r, 2 * r, 2 * r); g.rotate(-rot); g.translate(-x, -y); }
    else g.drawImage(sparkSpr(rgb), x - r, y - r, 2 * r, 2 * r);
    g.globalAlpha = A; g.globalCompositeOperation = m;
  }
  const bubbleSpr = () => spr('bubble', 48, 48, (q) => {
    q.fillStyle = rg(q, 24, 24, 12, 22, [[0, 'rgba(255,255,255,0.04)'], [0.78, 'rgba(255,255,255,0.42)'], [0.92, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]);
    q.beginPath(); q.arc(24, 24, 22, 0, TAU); q.fill();
    q.fillStyle = 'rgba(255,255,255,0.95)'; q.beginPath(); q.ellipse(16.5, 15.5, 5, 3.2, -0.65, 0, TAU); q.fill();
    q.fillStyle = 'rgba(255,255,255,0.5)'; q.beginPath(); q.arc(31, 32, 2, 0, TAU); q.fill();
  });
  function bubble(g, x, y, r, a) { if (a <= 0.01 || r < 0.6) return; const A = g.globalAlpha; g.globalAlpha = A * a; g.drawImage(bubbleSpr(), x - r, y - r, r * 2, r * 2); g.globalAlpha = A; }
  /** 一股气泡（汽水）：从 (x, y) 沿 ang 方向喷出后上浮；t0 起喷，持续 dur，n 颗 */
  function fizz(g, t, o) {
    const n = o.n || 30, rel0 = t - o.t0;
    if (rel0 < 0) return;
    for (let i = 0; i < n; i++) {
      const birth = (i / n) * (o.dur || 2) + hash(o.seed || 5, i, 1) * 0.08;
      const age = rel0 - birth;
      const life = (o.life || 1.6) * (0.6 + 0.6 * hash(o.seed || 5, i, 2));
      if (age < 0 || age > life) continue;
      const k = age / life;
      const sp = (o.speed || 420) * (0.5 + hash(o.seed || 5, i, 3)), ang = (o.ang ?? -PI / 2) + (hash(o.seed || 5, i, 4) - 0.5) * (o.spread ?? 0.7);
      const damp = 1 - Math.exp(-age * 3.2);
      const x = o.x + Math.cos(ang) * sp * damp / 3.2 + Math.sin(age * 7 + i) * 6;
      const y = o.y + Math.sin(ang) * sp * damp / 3.2 - age * age * (o.rise ?? 90);
      bubble(g, x, y, (o.r || 7) * (0.5 + hash(o.seed || 5, i, 5)) * (0.6 + k * 0.7), (o.a ?? 0.9) * Math.sin(PI * Math.min(1, k * 1.1 + 0.05)));
    }
  }

  /* ---------- 星空 ---------- */
  function stars(g, t, o) {
    const n = o.n, seed = o.seed || 7, A = g.globalAlpha;
    g.fillStyle = o.color || '#fff';
    for (let i = 0; i < n; i++) {
      const x = o.x + hash(seed, i, 1) * o.w, y = o.y + Math.pow(hash(seed, i, 2), o.pow || 1.3) * o.h;
      const sz = (o.s || 2) * (0.35 + hash(seed, i, 3) * hash(seed, i, 6) * 1.8);
      const tw = 0.5 + 0.5 * Math.sin(t * (0.7 + hash(seed, i, 4) * 2.6) + i * 2.1);
      const a = (o.a ?? 1) * (0.2 + 0.8 * hash(seed, i, 5)) * (1 - (o.tw ?? 0.6) * tw);
      if (a < 0.03) continue;
      g.globalAlpha = A * a; g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      if (sz > 2.3) { g.globalAlpha = A; E.glow(g, x, y, sz * 3.4, o.rgb || '255,236,250', a * 0.55); if (sz > 3.1) sparkle(g, x, y, sz * 3.2, a * 0.7, 0, o.rgb || '255,236,250'); }
    }
    g.globalAlpha = A;
  }
  const moonSpr = () => spr('moon', 128, 128, (q) => {
    q.fillStyle = '#fff6f4'; q.beginPath(); q.arc(64, 64, 40, 0, TAU); q.fill();
    q.globalCompositeOperation = 'destination-out'; q.beginPath(); q.arc(82, 52, 37, 0, TAU); q.fill();
  });

  /* ---------- 棕榈（剪影，随风摆） ---------- */
  /** 一片棕榈叶：拱起的叶轴 + 两侧下垂的细长小叶（一条路径填充） */
  function frond(g, x, y, a, L, droop) {
    const N = 18, ca = Math.cos(a), sa = Math.sin(a), dr = droop * 0.6;
    g.beginPath();
    // 叶轴（细楔形）
    const ex = x + ca * L, ey = y + sa * L + dr * L;
    const w0 = L * 0.018;
    g.moveTo(x - sa * w0, y + ca * w0); g.quadraticCurveTo(x + ca * L * 0.5, y + sa * L * 0.5, ex, ey); g.quadraticCurveTo(x + ca * L * 0.5, y + sa * L * 0.5, x + sa * w0, y - ca * w0);
    for (let i = 1; i <= N; i++) {
      const u = i / (N + 1);
      const px = x + ca * L * u, py = y + sa * L * u + dr * L * u * u;
      let tx = ca, ty = sa + 2 * dr * u; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const len = L * 0.32 * Math.pow(Math.sin(PI * Math.min(1, u * 0.92 + 0.08)), 0.7) * (1 - u * 0.35);
      const bw = L * 0.02 * (1 - u * 0.5);
      for (const sd of [-1, 1]) {
        // 小叶方向：沿叶轴向外 55° 再被重力往下拉
        let dx = tx * 0.55 + -ty * sd * 0.84, dy = ty * 0.55 + tx * sd * 0.84 + 0.75;
        const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
        const tipx = px + dx * len, tipy = py + dy * len;
        g.moveTo(px - tx * bw, py - ty * bw);
        g.quadraticCurveTo(px + dx * len * 0.5 + tx * bw * 2, py + dy * len * 0.5 + ty * bw * 2 - len * 0.08, tipx, tipy);
        g.lineTo(px + tx * bw, py + ty * bw);
      }
    }
    g.fill();
  }
  /** 棕榈树：(x, y) 为树根，h 为树高；o: { lean, bend, seed, col, n, wind, rim } */
  function palm(g, x, y, h, t, o = {}) {
    const lean = o.lean ?? 0.12, seed = o.seed || 1;
    const sway = wobble(seed * 13, t * 0.35) * 0.04 + (o.wind || 0) * 0.05;
    const cx = x + (lean + sway * 0.5) * h, cy = y - h;
    const mx = x + lean * h * 0.3 + (o.bend ?? 0.1) * h, my = y - h * 0.5;
    g.fillStyle = o.col || '#100a18';
    const w0 = h * 0.042, w1 = h * 0.022;
    g.beginPath(); g.moveTo(x - w0, y); g.quadraticCurveTo(mx - w0 * 0.8, my, cx - w1, cy + 4); g.lineTo(cx + w1, cy + 4); g.quadraticCurveTo(mx + w0 * 0.8, my, x + w0, y); g.closePath(); g.fill();
    if (o.rim) { g.strokeStyle = o.rim; g.lineWidth = Math.max(1, h * 0.006); g.beginPath(); g.moveTo(x - w0, y); g.quadraticCurveTo(mx - w0 * 0.8, my, cx - w1, cy + 4); g.stroke(); }
    const n = o.n || 9;
    for (let i = 0; i < n; i++) {
      const side = i / (n - 1) - 0.5;
      const a0 = -PI / 2 + side * PI * 1.55 + (hash(seed, i, 1) - 0.5) * 0.3;
      const sw = wobble(seed * 7 + i, t * 0.5) * 0.08 + sway * 1.4;
      frond(g, cx, cy, a0 + sw, h * (0.4 + hash(seed, i, 2) * 0.18), 0.7 + Math.abs(side) * 0.9 + hash(seed, i, 3) * 0.4);
    }
    g.beginPath(); g.arc(cx - h * 0.012, cy + h * 0.02, h * 0.022, 0, TAU); g.arc(cx + h * 0.02, cy + h * 0.025, h * 0.02, 0, TAU); g.fill();
  }

  /* =========================================================
   * 小羊：用角色库（MVE.cast）画进精灵图；包围盒在 prepare 时量一次（正式立绘的尺寸未知也不怕）
   * ========================================================= */
  /** 爸爸羊 / 妈妈羊的固定打扮（小红领带 + 方框眼镜 / 白围巾 + 圆框眼镜） */
  const DAD = { glasses: true, tie: true }, MOM = { glasses: true, scarf: true };
  const LAMB = {
    pink: ['sheep-pink', {}], dad: ['sheep-black', DAD], mom: ['sheep-black', MOM], black: ['sheep-black', {}],
  };
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
  function lambSpr(s, kind, pose, expr) {
    const L = LAMB[kind] || LAMB.pink;
    const po = Object.assign({ pose }, L[1]);
    const b = castBox(L[0], po);
    const c = LC(s, `lamb:${kind}:${pose}:${expr}`, b.x1 - b.x0, b.y1 - b.y0, (q) => cast(q, L[0], Object.assign({ x: -b.x0, y: -b.y0, h: 100, t: 0, expr }, po)), 2);
    return { c, b };
  }
  /** 角色库里的羊：可见高度 V 对应的 h 参数（包围盒只和姿势有关，与表情无关） */
  function sheepH(kind, pose, V) { const L = LAMB[kind] || LAMB.pink; const b = castBox(L[0], Object.assign({ pose }, L[1])); return (100 * V) / Math.max(10, b.y1 - b.y0); }
  /* ---------- 官方粉色小羊（「火山旅梦」活动的敌人 Spine 模型，MVE.sd，opt-in）----------
   * 每只羊按 o.v（整数）固定选一种：交通锥 / 耳机飞盘 / 巫师帽（和它们的换色版）。
   * 性能：一种羊的一个动画（Idle / Move）按屏幕像素档（32…256）预渲染成 12 帧的精灵条，之后每帧只贴一张图（和手绘版一样便宜）。
   * 一致性：只有模型“可用”（加载好、且不是在这个镜头中途才加载好——sd 的镜头闸门）时才建精灵条；精灵条一次建完整（12 帧全成功才存），
   * 所以同一只羊在同一个镜头里不会从手绘版跳成官方版。没有 WebGL / 模型没到：照旧画手绘版的精灵。 */
  const OL_KEYS = ['enemy_1344_ddlamb', 'enemy_1345_tplamb', 'enemy_1350_mgcshp', 'enemy_1344_ddlamb_2', 'enemy_1350_mgcshp_2'];
  const OL = new Map(); // 每种官方小羊的身高（骨骼单位）与动画时长
  const SDX = () => { const S = window.MVE && window.MVE.sd; return S && S.enabled !== false && S.anchorsCast && (!S.supported || S.supported()) ? S : null; };
  const olKey = (v) => OL_KEYS[((Math.round(v || 0) % OL_KEYS.length) + OL_KEYS.length) % OL_KEYS.length];
  // 蹦跳（jump）用 Idle：离地的弧线由影片自己算。旧写法 jump → Move，而蹦跳的小羊按 hy > 0.3 在 jump / stand 之间来回切，
  // 每一跳都在 Idle 与 Move 之间硬切一次（第五部一直是 jump → Idle，三部统一）
  const olAnim = (pose) => (pose === 'run' || pose === 'walk' ? 'Move' : pose === 'push' ? 'Attack' : 'Idle');
  /** 模型现在能不能用（走 sd 的镜头闸门）；不能用时顺手让它开始加载 */
  function olUsable(S, key) {
    const o = { sd: true, variant: key, pose: 'stand', x: 0, y: 0, h: 100 };
    try { if (S.anchorsCast('sheep-pink', o)) return true; if (S.wants) S.wants('sheep-pink', o); } catch (e) { /* 手绘 */ }
    return false;
  }
  /**
   * 这只羊（o.v 选模型、pose 选动画）现在该怎么画：{ key, anim, sc（每骨骼单位几像素 / V）, t, phase }；模型不可用时 null = 画手绘版。
   * [修] 旧写法把每个动画预渲染成 12 帧的精灵条（约 12 帧 / 秒，一顿一顿；叼着的外套、领带也按 12 帧跳）；
   * 现在用 MVE.sd.drawCached（动画时间按 1/30 秒取整的帧缓存，大的直接实时画），嘴的位置按同一时刻的骨骼算
   */
  function olSpec(s, o) {
    const S = SDX();
    if (!S || (o.kind || 'pink') !== 'pink' || o.hand) return null;
    const key = olKey(o.v);
    if (!olUsable(S, key)) return null;
    let m = OL.get(key);
    if (!m) {
      try { const info = S.info(key); if (!info || !info.anims) return null; m = { h: Math.max(40, info.height), dur: new Map(info.anims) }; OL.set(key, m); } catch (e) { return null; }
    }
    const want = olAnim(o.pose || 'stand'), anim = m.dur.has(want) ? want : 'Idle', dur = m.dur.get(anim) || 1;
    // 每只羊错开相位（只跟 o.v 有关，不跟位置走）
    return { S, key, anim, h: m.h, t: s.t * (o.aspeed || 1), phase: hash(Math.round(o.v || 0) + 7, 91) * dur };
  }
  /** 小羊的嘴在哪（相对脚底；flip = 面朝左）：叼外套、叼领带时对位用。官方模型按骨骼，手绘版按比例 */
  function lambMouthOff(g, s, V, o = {}) {
    const f = o.flip ? -1 : 1, P = olSpec(s, Object.assign({ pose: 'jump' }, o));
    if (P) {
      try {
        const a = P.S.anchors(P.key, { x: 0, y: 0, scale: V / P.h, anim: P.anim, t: P.t, phase: P.phase });
        const m = a && (a.mouth || a.face);
        if (m) return [f * m[0], m[1]];
      } catch (e) { /* 按比例 */ }
    }
    return [f * 0.38 * V, -0.4 * V];
  }
  /** 羊背离脚底多高（骑在羊背上的东西对位用）：官方小羊的毛团更高 */
  function lambBack(g, V, o = {}) {
    const S = SDX(), off = S && (o.kind || 'pink') === 'pink' && !o.hand && olUsable(S, olKey(o.v));
    return (off ? 0.82 : 0.58) * V;
  }
  function lambOfficial(g, s, x, y, V, o, P) {
    const sq = o.sq || 0;
    if (o.glow) E.glow(g, x, y - V * 0.45, V * 1.25, o.glowRgb || '255,160,210', 0.3 * o.glow);
    g.save();
    g.translate(x, y);
    if (o.rot) g.rotate(o.rot);
    if (o.spin) { g.translate(0, -V * 0.45); g.rotate(o.spin); g.translate(0, V * 0.45); }
    g.scale(1 + sq * 0.2, 1 - sq * 0.2);
    const so = { x: 0, y: 0, scale: V / P.h, anim: P.anim, t: P.t, phase: P.phase, speed: 1, flip: !!o.flip, alpha: o.alpha };
    const ok = P.S.drawCached ? P.S.drawCached(g, P.key, so) : P.S.draw(g, P.key, so);
    g.restore();
    return ok;
  }
  /**
   * 画一只小羊：(x, y) 脚底，V 可见高度（官方模型可用时画官方粉色小羊，否则画手绘精灵）
   * o: { v（第几只：选哪一种官方小羊）, kind, pose, expr, flip, sq(挤压 -1..1), spin(绕身体中心转), rot(绕脚底转), alpha, glow, hand（强制手绘） }
   */
  function lamb(g, s, x, y, V, o = {}) {
    const P = olSpec(s, o);
    if (P) {
      if (warmMode) { lambOfficial(g, s, x, y, V, o, P); return; } // 画到 2×2 的假画布上：顺手把镜头开头那一帧的缓存建好
      if (lambOfficial(g, s, x, y, V, o, P)) return;
    }
    const L = lambSpr(s, o.kind || 'pink', o.pose || 'stand', o.expr || 'neutral');
    const b = L.b, bh = b.y1 - b.y0, sc = V / bh, sq = o.sq || 0;
    if (o.glow) E.glow(g, x, y - V * 0.45, V * 1.25, o.glowRgb || '255,160,210', 0.34 * o.glow);
    g.save();
    g.translate(x, y);
    if (o.rot) g.rotate(o.rot);
    if (o.spin) { g.translate(0, -V * 0.45); g.rotate(o.spin); g.translate(0, V * 0.45); }
    g.scale((o.flip ? -1 : 1) * sc * (1 + sq * 0.2), sc * (1 - sq * 0.2));
    if (o.alpha != null) g.globalAlpha *= clamp(o.alpha);
    g.drawImage(L.c, b.x0, b.y0, b.x1 - b.x0, bh);
    g.restore();
  }
  /** 一拍一跳：ph ∈ [0,1) → [离地高度 0..1, 挤压] */
  function hop(ph) {
    const y = 4 * ph * (1 - ph);
    const sq = ph < 0.1 ? 0.7 * (1 - ph / 0.1) : ph > 0.92 ? 0.5 * ((ph - 0.92) / 0.08) : -0.28 * Math.sin(PI * ((ph - 0.1) / 0.82));
    return [y, sq];
  }
  /** 抛物线 + 落地弹跳（解析算）：返回 { x, y, vy, n(第几段), sq } */
  function bounce(age, x0, y0, vx, vy, floor, grav = 2600, e = 0.52, fr = 0.7) {
    let x = x0, y = y0, v = vy, u = vx, tt = age, n = 0;
    for (; n < 6; n++) {
      // 这一段：y(τ) = y + v τ + g τ²/2，求落地时刻
      const disc = v * v + 2 * grav * (floor - y);
      const tl = disc > 0 ? (-v + Math.sqrt(disc)) / grav : 0;
      if (tt < tl || tl <= 0.02) {
        const yy = Math.min(floor, y + v * tt + 0.5 * grav * tt * tt);
        return { x: x + u * tt, y: yy, vy: v + grav * tt, n, sq: 0 };
      }
      tt -= tl; x += u * tl; y = floor; v = -(v + grav * tl) * e; u *= fr;
      if (tt < 0.09) return { x: x + u * tt, y: floor, vy: 0, n: n + 1, sq: (1 - tt / 0.09) * Math.min(1, Math.abs(v) / 500) };
    }
    return { x: x + u * Math.min(tt, 0.3), y: floor, vy: 0, n, sq: 0 };
  }

  /* =========================================================
   * 道具
   * ========================================================= */
  // ---- 汽水瓶（粉色汽水，玻璃瓶，羊标签）；精灵图设计尺寸 60×150，瓶底中心在 (30,146)
  function bottleArt(q) {
    q.save();
    const ink = '#1f3a44';
    const body = () => { q.beginPath(); q.moveTo(22, 10); q.lineTo(38, 10); q.lineTo(38, 36); q.bezierCurveTo(38, 52, 52, 56, 52, 72); q.lineTo(52, 136); q.quadraticCurveTo(52, 146, 42, 146); q.lineTo(18, 146); q.quadraticCurveTo(8, 146, 8, 136); q.lineTo(8, 72); q.bezierCurveTo(8, 56, 22, 52, 22, 36); q.closePath(); };
    body(); q.fillStyle = 'rgba(170,236,232,0.55)'; q.fill();
    q.save(); body(); q.clip();
    q.fillStyle = vg(q, 64, 146, [[0, 'rgba(255,140,190,0.85)'], [1, 'rgba(236,80,150,0.95)']]); q.fillRect(0, 64, 60, 90);
    q.fillStyle = 'rgba(255,220,236,0.9)'; q.fillRect(0, 62, 60, 4);
    q.fillStyle = 'rgba(255,255,255,0.75)'; for (let i = 0; i < 9; i++) { q.beginPath(); q.arc(14 + hash(9, i, 1) * 32, 74 + hash(9, i, 2) * 64, 1 + hash(9, i, 3) * 1.6, 0, TAU); q.fill(); }
    // 标签
    q.fillStyle = '#fff4f8'; q.fillRect(0, 92, 60, 30);
    q.fillStyle = '#ff7eb0'; q.fillRect(0, 92, 60, 4); q.fillRect(0, 118, 60, 4);
    q.fillStyle = '#ffffff'; for (const [x, y, r] of [[26, 107, 6], [32, 104, 6.5], [37, 108, 5.5], [30, 111, 6]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); }
    q.strokeStyle = '#e46a9c'; q.lineWidth = 1.2; for (const [x, y, r] of [[26, 107, 6], [32, 104, 6.5], [37, 108, 5.5], [30, 111, 6]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.stroke(); }
    q.fillStyle = '#fff4f8'; for (const [x, y, r] of [[26, 107, 5], [32, 104, 5.5], [37, 108, 4.5], [30, 111, 5]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); }
    q.fillStyle = '#3a2430'; q.beginPath(); q.ellipse(21, 106, 3.4, 4, -0.3, 0, TAU); q.fill();
    // 高光
    q.fillStyle = 'rgba(255,255,255,0.7)'; q.fillRect(12, 70, 4, 60); q.fillRect(24, 14, 3, 30);
    q.fillStyle = 'rgba(255,255,255,0.35)'; q.fillRect(44, 76, 3, 50);
    q.restore();
    body(); q.strokeStyle = ink; q.lineWidth = 2.2; q.stroke();
    // 瓶盖（红色皇冠盖）
    q.fillStyle = '#e0424e'; rrect(q, 19, 3, 22, 10, 3); q.fill(); q.strokeStyle = '#6a1a22'; q.lineWidth = 1.6; q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.5)'; q.fillRect(22, 5, 6, 2);
    q.restore();
  }
  function bottle(g, s, x, y, h, rot = 0, a = 1) {
    const c = LC(s, 'bottle', 60, 150, bottleArt, 2.4), sc = h / 150;
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(sc, sc); if (a < 1) g.globalAlpha *= a; g.drawImage(c, -30, -146, 60, 150); g.restore();
  }
  /** 瓶口在世界坐标里的位置（瓶底 (x,y)，旋转 rot，高 h） */
  const bottleMouth = (x, y, h, rot) => [x + Math.sin(rot) * h * 0.92, y - Math.cos(rot) * h * 0.92];

  // ---- 货箱（设计尺寸 300×230，箱底中心 (150,226)；盖子单独画）
  function crateArt(q) {
    const planks = ['#c08a58', '#b47e4e', '#c6915f', '#b98452'];
    for (let i = 0; i < 4; i++) {
      q.fillStyle = planks[i]; q.fillRect(6, 8 + i * 54, 288, 54);
      q.strokeStyle = 'rgba(90,50,24,0.35)'; q.lineWidth = 1.2;
      for (let j = 0; j < 3; j++) { q.beginPath(); const yy = 20 + i * 54 + j * 13 + hash(4, i, j) * 6; q.moveTo(20, yy); q.bezierCurveTo(90, yy - 4, 180, yy + 5, 280, yy - 2); q.stroke(); }
      q.fillStyle = 'rgba(60,30,14,0.55)'; q.fillRect(6, 8 + i * 54 + 51, 288, 3);
    }
    // 框
    q.fillStyle = '#8a5a34'; q.fillRect(0, 0, 30, 230); q.fillRect(270, 0, 30, 230); q.fillRect(0, 0, 300, 18); q.fillRect(0, 212, 300, 18);
    q.fillStyle = 'rgba(255,220,170,0.25)'; q.fillRect(0, 0, 300, 4); q.fillRect(0, 0, 4, 230);
    // X 撑
    q.save(); q.beginPath(); q.rect(30, 18, 240, 194); q.clip();
    q.strokeStyle = '#94643c'; q.lineWidth = 20; q.beginPath(); q.moveTo(30, 212); q.lineTo(270, 18); q.stroke();
    q.strokeStyle = 'rgba(60,30,14,0.4)'; q.lineWidth = 2; q.beginPath(); q.moveTo(24, 204); q.lineTo(264, 10); q.stroke();
    q.restore();
    // 钉子
    q.fillStyle = '#3a2a24'; for (const [x, y] of [[15, 10], [285, 10], [15, 220], [285, 220], [15, 115], [285, 115]]) { q.beginPath(); q.arc(x, y, 3, 0, TAU); q.fill(); }
    // 喷印
    q.save(); q.globalAlpha = 0.78;
    E.text(q, 'SIESTA', 150, 88, { font: 'sans', size: 44, weight: 700, color: '#4a2616', spacing: 6 });
    E.text(q, '易碎 · FRAGILE', 150, 150, { font: 'sans', size: 24, weight: 700, color: '#6a2a20', spacing: 3 });
    E.text(q, 'No.7', 244, 196, { font: 'mono', size: 18, weight: 700, color: '#4a2616' });
    q.restore();
    // 杯子图标
    q.strokeStyle = '#6a2a20'; q.lineWidth = 3; q.beginPath(); q.moveTo(58, 170); q.lineTo(62, 190); q.lineTo(74, 190); q.lineTo(78, 170); q.stroke(); q.beginPath(); q.moveTo(68, 190); q.lineTo(68, 202); q.moveTo(60, 202); q.lineTo(76, 202); q.stroke();
    // 小小的粉色蹄印贴纸（彩蛋）
    q.fillStyle = '#ff8fbf'; q.beginPath(); q.ellipse(214, 176, 7, 9, -0.2, 0, TAU); q.ellipse(228, 174, 7, 9, 0.2, 0, TAU); q.fill();
    q.strokeStyle = '#4a2616'; q.lineWidth = 3; q.strokeRect(1.5, 1.5, 297, 227);
  }
  function lidArt(q) {
    q.fillStyle = '#b98452'; q.fillRect(0, 4, 308, 22); q.fillStyle = '#8a5a34'; q.fillRect(0, 0, 308, 6); q.fillRect(0, 22, 308, 6);
    q.strokeStyle = '#4a2616'; q.lineWidth = 3; q.strokeRect(1.5, 1.5, 305, 25);
  }

  // ---- 母亲的外套（挂着 / 被叼着 / 飘着时）：真正的衣服结构——翻领、两只袖子（红袖口、红里子）、A 字衣身、下摆两道红条、腰侧红系带
  // 颜色与角色库里纯烬的 'coat' 外套一致
  const COATC = { c: '#f1e9dd', sh: '#d6c9b6', fold: 'rgba(150,126,104,0.55)', lining: '#b8323b', stripe: '#c23b3b', ink: '#3a2228' };
  const COAT_OUTLINE = [[-0.3, -0.01], [-0.64, 0.02], [-1, 0.08], [-1.02, 0.24], [-0.95, 0.44], [-1.0, 0.72], [-1.06, 1], [-0.7, 1.012], [-0.35, 0.995], [0, 1.01], [0.35, 0.995], [0.7, 1.012], [1.06, 1], [1.0, 0.72], [0.95, 0.44], [1.02, 0.24], [1, 0.08], [0.64, 0.02], [0.3, -0.01], [0.13, 0.035], [0, 0.05], [-0.13, 0.035]];
  function vg2(q, a, b, c0, c1) { const gr = q.createLinearGradient(a[0], a[1], b[0], b[1]); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; }
  /**
   * coatHang(g, t, o)：画那件外套
   *   o.C 领口中心 [x, y]；o.L 衣长（领口到下摆）；o.dn 衣身方向（领口 → 下摆，默认竖直向下；被拖着跑时往后斜）
   *   o.cuffs [u=-1 那只袖口, u=+1 那只袖口]：[x, y] = 被叼着 / 拽着，null = 自然垂下（u 轴 = dn 顺时针转 90°，竖直挂着时 +1 在屏幕右边）
   *   o.flap 飘动 0..1；o.seed 相位；o.face 1 = 看到后背，-1 = 看到敞开的前襟（露出红里子）
   *   o.ground 地面 y（下摆碰地就往后折）；o.mv 运动方向（-1 往左，+1 往右）；o.alpha；o.lw 墨线粗细倍数
   */
  function coatHang(g, t, o) {
    const L = o.L, C = o.C, seed = o.seed || 0, flap = o.flap ?? 0.5, face = o.face || 1, mv = o.mv || 0;
    let dx = o.dn ? o.dn[0] : 0, dy = o.dn ? o.dn[1] : 1; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const ax = dy, ay = -dx;
    const sw = 0.25 * L, hw = 0.35 * L, A = flap * 0.075 * L, ground = o.ground ?? 1e9;
    const P = (u, v) => {
      const vv = Math.max(0, v), half = sw + (hw - sw) * Math.pow(vv, 0.9);
      const w1 = Math.sin(t * 6.3 + seed + u * 1.6 + v * 3.3) * A * vv * vv, w2 = Math.sin(t * 4.7 + seed * 1.7 + v * 4.1 + u * 0.8) * A * 0.9 * vv * vv;
      let x = C[0] + ax * u * half + dx * v * L + dx * w1 + ax * w2, y = C[1] + ay * u * half + dy * v * L + dy * w1 + ay * w2;
      if (y > ground) { const over = y - ground; y = ground - over * 0.08; x -= mv * over * 0.9; }
      return [x, y];
    };
    const lw = Math.max(1.2, L * 0.014) * (o.lw || 1);
    const A0 = g.globalAlpha;
    if (o.alpha != null) g.globalAlpha = A0 * clamp(o.alpha);
    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    // ---- 袖子（先画，衣身压住袖根）
    const sleeve = (s, i) => {
      const sh = P(s, 0.08), ap = P(s, 0.26), R = [(sh[0] + ap[0]) / 2, (sh[1] + ap[1]) / 2];
      let K = o.cuffs && o.cuffs[i];
      const held = !!K;
      if (!K) {
        const sway = Math.sin(t * 3.1 + seed + s) * flap * 0.06 * L;
        K = [R[0] + dx * 0.48 * L + ax * s * (0.16 * L + sway), R[1] + dy * 0.48 * L + ay * s * (0.16 * L + sway)];
        if (K[1] > ground) K[1] = ground - 2;
      }
      const sag = (held ? 0.1 : 0.03) * L;
      const M = [(R[0] + K[0]) / 2 + dx * sag, (R[1] + K[1]) / 2 + dy * sag];
      const w0 = 0.088 * L, wc = 0.064 * L, N = 9, left = [], right = [];
      for (let k = 0; k <= N; k++) {
        const a = k / N, b = 1 - a;
        const px = b * b * R[0] + 2 * a * b * M[0] + a * a * K[0], py = b * b * R[1] + 2 * a * b * M[1] + a * a * K[1];
        let tx = 2 * b * (M[0] - R[0]) + 2 * a * (K[0] - M[0]), ty = 2 * b * (M[1] - R[1]) + 2 * a * (K[1] - M[1]); const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const w = lerp(w0, wc, a) * (1 + 0.08 * Math.sin(a * 9 + t * 4 + seed));
        left.push([px - ty * w, py + tx * w]); right.push([px + ty * w, py - tx * w]);
      }
      const tube = () => { g.beginPath(); g.moveTo(left[0][0], left[0][1]); for (const p of left) g.lineTo(p[0], p[1]); for (let k = right.length - 1; k >= 0; k--) g.lineTo(right[k][0], right[k][1]); g.closePath(); };
      tube(); g.fillStyle = COATC.c; g.fill();
      g.save(); tube(); g.clip();
      g.strokeStyle = COATC.fold; g.lineWidth = lw * 1.1; g.beginPath(); g.moveTo(right[1][0], right[1][1]); for (let k = 2; k < N; k++) g.lineTo((right[k][0] * 2 + left[k][0]) / 3, (right[k][1] * 2 + left[k][1]) / 3); g.stroke();
      g.fillStyle = COATC.stripe; g.beginPath(); g.moveTo(left[7][0], left[7][1]); g.lineTo(left[8][0], left[8][1]); g.lineTo(right[8][0], right[8][1]); g.lineTo(right[7][0], right[7][1]); g.closePath(); g.fill();
      g.restore();
      tube(); g.strokeStyle = COATC.ink; g.lineWidth = lw; g.stroke();
      const e0 = left[N], e1 = right[N];
      g.fillStyle = COATC.lining; g.beginPath(); g.ellipse((e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2, Math.hypot(e1[0] - e0[0], e1[1] - e0[1]) / 2, wc * 0.35, Math.atan2(e1[1] - e0[1], e1[0] - e0[0]), 0, TAU); g.fill(); g.stroke();
    };
    sleeve(-1, 0); sleeve(1, 1);
    // ---- 衣身
    const pts = COAT_OUTLINE.map(([u, v]) => P(u, v));
    blob(g, pts); g.fillStyle = vg2(g, P(0, 0), P(0, 1), COATC.c, COATC.sh); g.fill();
    g.save(); blob(g, pts); g.clip();
    g.strokeStyle = COATC.fold; g.lineWidth = lw * 1.3;
    for (const u of [-0.55, 0.5]) { g.beginPath(); for (let k = 0; k <= 6; k++) { const p = P(u + Math.sin(k + seed) * 0.05, 0.3 + k * 0.12); k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke(); }
    if (face > 0) {
      // 后背：中缝 + 过肩线
      g.strokeStyle = 'rgba(120,96,80,0.5)'; g.lineWidth = lw;
      g.beginPath(); for (let k = 0; k <= 6; k++) { const p = P(0, 0.06 + k * 0.155); k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke();
      g.beginPath(); for (let k = 0; k <= 6; k++) { const p = P(-0.95 + k * 0.317, 0.2 + Math.sin(k * 0.5) * 0.01); k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke();
    } else {
      // 敞开的前襟：露出红里子
      const l = [P(-0.05, 0.1), P(-0.08, 0.55), P(-0.15, 1.02)], r = [P(0.05, 0.1), P(0.08, 0.55), P(0.15, 1.02)];
      g.fillStyle = COATC.lining; g.beginPath(); g.moveTo(l[0][0], l[0][1]); g.quadraticCurveTo(l[1][0], l[1][1], l[2][0], l[2][1]); g.lineTo(r[2][0], r[2][1]); g.quadraticCurveTo(r[1][0], r[1][1], r[0][0], r[0][1]); g.closePath(); g.fill();
      g.strokeStyle = COATC.ink; g.lineWidth = lw * 0.8; g.stroke();
    }
    g.strokeStyle = COATC.stripe;
    for (const [v, w] of [[0.86, 0.04], [0.93, 0.018]]) { g.lineWidth = w * L; g.beginPath(); for (let k = 0; k <= 8; k++) { const p = P(-1.2 + k * 0.3, v); k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke(); }
    g.restore();
    blob(g, pts); g.strokeStyle = COATC.ink; g.lineWidth = lw; g.stroke();
    // ---- 翻领 + 一道红边
    blob(g, [P(-0.32, -0.005), P(-0.36, -0.075), P(0, -0.1), P(0.36, -0.075), P(0.32, -0.005), P(0.13, 0.035), P(0, 0.05), P(-0.13, 0.035)]);
    g.fillStyle = COATC.c; g.fill(); g.strokeStyle = COATC.ink; g.lineWidth = lw; g.stroke();
    { const c0 = P(-0.26, -0.03), c1 = P(0, -0.06), c2 = P(0.26, -0.03); g.strokeStyle = COATC.lining; g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(c0[0], c0[1]); g.quadraticCurveTo(c1[0], c1[1], c2[0], c2[1]); g.stroke(); }
    // ---- 腰两侧的红系带：一个结 + 两条往下、往运动反方向飘的带子
    const tw = Math.max(1.6, 0.03 * L);
    for (const s of [-1, 1]) {
      const a = P(s * 0.97, 0.43);
      for (let j = 0; j < 2; j++) {
        const fl = Math.sin(t * 8 + seed + s * 2 + j * 1.3) * flap * 0.05 * L, len = (0.2 + j * 0.06) * L;
        const ex = a[0] + dx * len * 0.9 + ax * s * (0.05 + j * 0.03) * L - mv * 0.12 * L + ax * fl, ey = a[1] + dy * len * 0.9 + ay * s * (0.05 + j * 0.03) * L + ay * fl;
        g.strokeStyle = COATC.ink; g.lineWidth = tw + lw * 1.4; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(a[0] + dx * len * 0.4 + ax * s * 0.06 * L - ax * fl, a[1] + dy * len * 0.4 + ay * s * 0.06 * L - ay * fl, ex, ey); g.stroke();
        g.strokeStyle = COATC.stripe; g.lineWidth = tw; g.stroke();
      }
      g.fillStyle = COATC.stripe; g.strokeStyle = COATC.ink; g.lineWidth = lw * 0.8; g.beginPath(); g.ellipse(a[0], a[1], 0.035 * L, 0.028 * L, Math.atan2(ay, ax), 0, TAU); g.fill(); g.stroke();
    }
    g.restore();
    g.globalAlpha = A0;
  }
  /**
   * 三只（梦里会飞的）粉色小羊叼着外套飞：中间那只叼着领后的挂环，前后两只各叼一只袖口，外套像一面旗子展开（领口朝上）
   *   s 镜头状态（画羊用）；C 领口中心；L 衣长（≈ 那个镜头里她身高的一半，和她的外套一样大）；V 羊的可见高度；mv 飞行方向（-1 往左 / +1 往右 / 0 悬停）
   *   o: { seed, flap, spread 袖子张开程度（袖口离领口的横向距离 / L）, drop 袖口比领口低多少（/ L，默认 0.2）, lean 衣身额外倾斜,
   *        ground, alpha, bob 每只羊的上下起伏 (i) → px, spin (i) → 旋转, dir 小羊面朝的方向（默认 = mv） }
   *   返回三只羊的嘴的位置（给别的东西对位用）
   */
  function coatTrio(g, s, t, C, L, V, mv, o = {}) {
    const flip = (o.dir ?? mv) < 0, seed = o.seed || 0;
    const bob = o.bob || ((i) => Math.sin(t * 5.2 + i * 2.1 + seed) * V * 0.1);
    let dx = -(mv || 0) * 0.22 + (o.lean || 0), dy = 1; const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
    const ax = dy, ay = -dx, sp = o.spread ?? 0.78, dp = o.drop ?? 0.2;
    const cuff = (s1, i) => [C[0] + ax * s1 * sp * L + dx * dp * L, C[1] + ay * s1 * sp * L + dy * dp * L + bob(i)];
    const cA = cuff(-1, 0), cB = cuff(1, 2), col = [C[0], C[1] + bob(1)];
    const loop = V * 0.42, top = [col[0] - dx * loop, col[1] - loop];
    const A0 = g.globalAlpha;
    if (o.alpha != null) g.globalAlpha = A0 * clamp(o.alpha);
    // o.parts：'coat' 只画外套、'lambs' 只画羊（屋里：外套受灯光影响，发光的小羊画在光照之后）
    if (o.parts !== 'lambs') {
      coatHang(g, t, { C: col, L, dn: [dx, dy], cuffs: [cA, cB], face: -1, flap: o.flap ?? 0.8, mv, seed, ground: o.ground });
      // 领后的挂环
      g.strokeStyle = COATC.ink; g.lineWidth = Math.max(2, L * 0.012); g.beginPath(); g.moveTo(col[0] - L * 0.03, col[1] - L * 0.08); g.quadraticCurveTo(top[0], top[1] - V * 0.08, col[0] + L * 0.03, col[1] - L * 0.08); g.stroke();
    }
    if (o.parts !== 'coat') {
      // 羊的嘴正好叼在袖口 / 挂环上（官方小羊按骨骼算嘴的位置，逐帧；手绘版按比例）
      const put = (m, i) => { const lo = { v: (o.v0 ?? 0) + i, flip, pose: 'jump', expr: i === 1 ? 'laugh' : 'smile', glow: 1, spin: o.spin ? o.spin(i) : 0 }; const mo = lambMouthOff(g, s, V, lo); lamb(g, s, m[0] - mo[0], m[1] - mo[1], V, lo); };
      put(cA, 0); put(top, 1); put(cB, 2);
    }
    g.globalAlpha = A0;
    return [cA, top, cB];
  }

  // ---- 浮石（多孔的小石头）
  function pumice(g, x, y, r, o = {}) {
    const pts = rockPts(x, y, r, r * 0.78, o.seed || 27, 11, 0.16);
    if (o.glow) { E.glow(g, x, y, r * 3.2, '255,190,150', o.glow * 0.55); }
    g.save();
    blob(g, pts); g.fillStyle = rg(g, x - r * 0.35, y - r * 0.4, r * 0.1, r * 1.3, [[0, o.lit || '#f2e8dc'], [0.6, '#cfc2b2'], [1, '#9a8c80']]); g.fill();
    g.clip();
    g.fillStyle = 'rgba(90,72,64,0.55)';
    for (let i = 0; i < 16; i++) { const a = hash(31, i, 1) * TAU, d = Math.sqrt(hash(31, i, 2)) * r * 0.85; g.beginPath(); g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, r * (0.03 + hash(31, i, 3) * 0.06), r * (0.025 + hash(31, i, 4) * 0.04), a, 0, TAU); g.fill(); }
    g.restore();
    blob(g, pts); g.strokeStyle = o.ink || '#4a3a36'; g.lineWidth = Math.max(1.2, r * 0.06); g.stroke();
  }

  /* =========================================================
   * 标题 / 片尾
   * ========================================================= */
  function titleArt(q, day) {
    // 设计尺寸 1400×520，中心 (700, 250)；day = 片尾的白天版（深色字 + 白描边，放在浅色天空上）
    q.save();
    if (day) {
      E.text(q, '雾中之忆', 700, 226, { size: 150, weight: 900, spacing: 44, color: '#7a2c5e', stroke: 'rgba(255,250,252,0.95)', strokeW: 16 });
      E.text(q, 'MISTY  MEMORY', 700, 318, { font: 'display', size: 50, weight: 700, spacing: 20, color: '#b0563e', stroke: 'rgba(255,250,245,0.9)', strokeW: 8 });
      E.text(q, 'NIGHT VERSION', 700, 364, { font: 'display', size: 24, weight: 700, spacing: 16, color: '#7a2c5e', stroke: 'rgba(255,250,252,0.9)', strokeW: 6 });
      q.strokeStyle = 'rgba(176,86,62,0.7)'; q.lineWidth = 2.5;
      q.beginPath(); q.moveTo(470, 392); q.lineTo(640, 392); q.moveTo(760, 392); q.lineTo(930, 392); q.stroke();
      q.restore();
      return;
    }
    E.text(q, '雾中之忆', 700, 230, { size: 150, weight: 900, spacing: 44, color: 'rgba(90,30,70,0.45)', stroke: 'rgba(60,20,50,0.35)', strokeW: 18 });
    const gr = vg(q, 90, 250, [[0, '#fff8fc'], [0.55, '#ffd8e8'], [1, '#ffb3cf']]);
    E.text(q, '雾中之忆', 700, 226, { size: 150, weight: 900, spacing: 44, color: gr });
    E.text(q, 'MISTY  MEMORY', 700, 318, { font: 'display', size: 50, weight: 700, spacing: 20, color: '#ffdca8' });
    E.text(q, 'NIGHT VERSION', 700, 364, { font: 'display', size: 24, weight: 500, spacing: 16, color: 'rgba(255,226,240,0.85)' });
    q.strokeStyle = 'rgba(255,220,170,0.7)'; q.lineWidth = 2;
    q.beginPath(); q.moveTo(470, 392); q.lineTo(640, 392); q.moveTo(760, 392); q.lineTo(930, 392); q.stroke();
    E.text(q, 'MV · 本页原创', 700, 440, { font: 'sans', size: 24, weight: 500, spacing: 8, color: 'rgba(255,236,246,0.8)' });
    q.restore();
  }

  /* =========================================================
   * 片 II 的场景：汐斯塔夜景（远景）
   * ========================================================= */
  const HZ = 700; // 海平线
  function snSky(q) {
    q.fillStyle = vg(q, 0, 720, [[0, '#06051a'], [0.22, '#100d33'], [0.42, '#23184c'], [0.58, '#40205f'], [0.7, '#6e2a6c'], [0.8, '#a4407a'], [0.88, '#d8638e'], [0.95, '#f4959f'], [1, '#ffc2a6']]);
    q.fillRect(0, 0, VW, 720);
    q.fillStyle = '#ffc2a6'; q.fillRect(0, 719, VW, 361);
    // 银河般的薄雾带
    q.save(); q.translate(960, 300); q.rotate(-0.35);
    q.fillStyle = rg(q, 0, 0, 0, 700, [[0, 'rgba(160,120,220,0.16)'], [1, 'rgba(160,120,220,0)']]);
    q.scale(1, 0.16); q.beginPath(); q.arc(0, 0, 700, 0, TAU); q.fill();
    q.restore();
    // 静态暗星
    const R = E.rng(3);
    for (let i = 0; i < 420; i++) { const x = R() * VW, y = Math.pow(R(), 1.5) * 620, a = 0.15 + R() * 0.45; q.fillStyle = `rgba(255,240,250,${a * (1 - y / 700)})`; q.fillRect(x, y, 1.4, 1.4); }
  }
  function snClouds(q) {
    // 1920×300：地平线附近被晚霞从下面照亮的薄云
    const R = E.rng(5);
    for (let i = 0; i < 11; i++) {
      const cx = R() * 2100 - 90, cy = 90 + R() * 170, w = 240 + R() * 460, h = 7 + R() * 16;
      q.fillStyle = vg(q, cy - h * 1.4, cy + h * 1.4, [[0, 'rgba(110,50,120,0)'], [0.45, 'rgba(150,70,130,0.5)'], [0.8, 'rgba(240,140,160,0.7)'], [1, 'rgba(255,190,170,0.85)']]);
      q.beginPath();
      for (let j = 0; j < 7; j++) { const ex = cx - w / 2 + (j + 0.5) * (w / 7) + (R() - 0.5) * 30, ey = cy + (R() - 0.5) * h * 0.7; q.ellipse(ex, ey, (w / 7) * (0.8 + R() * 0.6), h * (0.7 + R() * 0.6), 0, 0, TAU); }
      q.fill();
    }
  }
  /** 羊形的云（设计 320×200，脚底中心 (160,190)） */
  function sheepCloudArt(q, top, bottom, face) {
    q.fillStyle = vg(q, 30, 190, [[0, top], [1, bottom]]);
    q.beginPath();
    for (const [x, y, r] of [[92, 104, 44], [138, 80, 50], [190, 84, 46], [228, 110, 40], [196, 132, 44], [140, 134, 46], [96, 136, 38], [60, 118, 30]]) { q.moveTo(x + r, y); q.arc(x, y, r, 0, TAU); }
    q.moveTo(290, 92); q.ellipse(262, 92, 28, 30, 0.2, 0, TAU);
    for (const x of [92, 124, 182, 214]) { q.moveTo(x + 13, 176); q.ellipse(x, 168, 13, 20, 0, 0, TAU); }
    q.fill();
    if (face) { q.fillStyle = face; q.beginPath(); q.arc(270, 88, 4.5, 0, TAU); q.fill(); }
  }
  function snFar(q) {
    // 远处的旧火山（淡紫剪影）+ 缕缕粉烟起点
    const cx = 1560, top = 470, base = 704;
    q.fillStyle = vg(q, top, base, [[0, '#56326f'], [0.75, '#4a2a66'], [1, '#6a3a78']]);
    q.beginPath(); q.moveTo(900, base + 4);
    q.quadraticCurveTo(1380, base - 26, cx - 36, top);
    q.lineTo(cx - 20, top - 3); q.lineTo(cx - 8, top + 6); q.lineTo(cx + 10, top + 3); q.lineTo(cx + 30, top - 2);
    q.quadraticCurveTo(1760, base - 34, 2120, base + 4);
    q.closePath(); q.fill();
    q.strokeStyle = 'rgba(255,170,200,0.45)'; q.lineWidth = 2.5;
    q.beginPath(); q.moveTo(1250, base - 12); q.quadraticCurveTo(1440, base - 60, cx - 36, top); q.stroke();
    q.fillStyle = 'rgba(255,200,170,0.5)'; q.beginPath(); q.ellipse(cx - 3, top + 2, 20, 3.5, 0, 0, TAU); q.fill();
    q.fillStyle = vg(q, base - 80, base + 4, [[0, 'rgba(240,130,170,0)'], [1, 'rgba(250,150,175,0.6)']]); q.fillRect(700, base - 80, 1300, 84);
  }
  function snSea(q) {
    q.fillStyle = vg(q, HZ, 1080, [[0, '#d27a98'], [0.05, '#a45288'], [0.2, '#5c2e72'], [0.55, '#2a1a4c'], [1, '#120c2a']]);
    q.fillRect(-200, HZ, VW + 400, 1080 - HZ + 200);
    const R = E.rng(8);
    for (let i = 0; i < 520; i++) {
      const y = HZ + 4 + Math.pow(R(), 1.8) * 380, x = R() * (VW + 400) - 200, w = 8 + R() * 60 * (1 - (y - HZ) / 500), near = (y - HZ) / 380;
      q.fillStyle = `rgba(255,${180 + R() * 50 | 0},${200 + R() * 40 | 0},${(0.08 + R() * 0.2) * (1 - near * 0.7)})`;
      q.fillRect(x, y, w, 1 + near * 1.5);
    }
  }
  function snTown(q) {
    const R = E.rng(11);
    q.fillStyle = '#1b1331';
    q.beginPath(); q.moveTo(800, 780); q.lineTo(860, 752); q.lineTo(1000, 747); q.lineTo(1920 + 200, 740); q.lineTo(2120, 800); q.lineTo(800, 800); q.closePath(); q.fill();
    let x = 872;
    while (x < 2100) {
      // 度假小城：矮矮的白房子、圆顶、瓦顶，窗里一格格暖光
      const w = 22 + R() * 40, h = 12 + R() * 22 + (x > 1150 && x < 1450 ? 10 : 0) + (R() < 0.1 ? 14 : 0), y0 = 750 - h;
      q.fillStyle = R() < 0.5 ? '#2a2048' : '#30264f';
      q.fillRect(x, y0, w, h + 6);
      q.fillStyle = 'rgba(255,200,230,0.12)'; q.fillRect(x, y0, w, 2);
      const roof = R();
      q.fillStyle = '#241a40';
      if (roof < 0.3) { q.beginPath(); q.moveTo(x - 2, y0); q.lineTo(x + w / 2, y0 - 7 - R() * 6); q.lineTo(x + w + 2, y0); q.closePath(); q.fill(); }
      else if (roof < 0.42) { q.beginPath(); q.arc(x + w / 2, y0, w * 0.3, PI, 0); q.fill(); }
      for (let wy = y0 + 4; wy < 744; wy += 8) for (let wx = x + 3; wx < x + w - 4; wx += 7) {
        const r = R();
        if (r < 0.34) { q.fillStyle = r < 0.08 ? '#ffe2a8' : '#ffc27a'; q.fillRect(wx, wy, 3, 4); }
        else if (r < 0.5) { q.fillStyle = '#3a2a56'; q.fillRect(wx, wy, 3, 4); }
      }
      if (R() < 0.22) palm(q, x + w + 4, 752, 34 + R() * 22, 0, { seed: x | 0, col: '#150e28', n: 7 });
      x += w + 2 + R() * 10;
    }
    // 海滨步道的一串小灯
    q.fillStyle = '#ffd89a'; for (let i = 0; i < 60; i++) { const lx = 900 + i * 20, ly = 754 + Math.sin(i * 0.7) * 1.5; q.fillRect(lx, ly, 2, 2); }
    // 摩天轮骨架
    const fx = 1640, fy = 648, fr = 78;
    q.strokeStyle = '#2e2450'; q.lineWidth = 3; q.beginPath(); q.arc(fx, fy, fr, 0, TAU); q.stroke();
    q.lineWidth = 1.4; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; q.beginPath(); q.moveTo(fx, fy); q.lineTo(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr); q.stroke(); }
    q.lineWidth = 5; q.beginPath(); q.moveTo(fx - 40, 752); q.lineTo(fx, fy); q.lineTo(fx + 40, 752); q.stroke();
    // 灯塔
    q.fillStyle = '#e9e0f0'; q.beginPath(); q.moveTo(850, 752); q.lineTo(856, 690); q.lineTo(868, 690); q.lineTo(874, 752); q.closePath(); q.fill();
    q.fillStyle = '#c8404e'; q.fillRect(853, 712, 18, 8); q.fillRect(855, 694, 14, 5);
    q.fillStyle = '#2a2040'; q.fillRect(853, 682, 18, 9);
    // 栈桥
    q.strokeStyle = '#140e24'; q.lineWidth = 4; q.beginPath(); q.moveTo(1010, 752); q.lineTo(930, 790); q.stroke();
    q.lineWidth = 1.5; for (let i = 0; i < 6; i++) { const px = 1004 - i * 14, py = 755 + i * 6.6; q.beginPath(); q.moveTo(px, py); q.lineTo(px, py + 10); q.stroke(); }
  }
  function snHead(q) {
    // 左侧的岬角 + 火山博物馆
    q.fillStyle = vg(q, 560, 1080, [[0, '#1a1128'], [1, '#0c0814']]);
    q.beginPath(); q.moveTo(-200, 560); q.bezierCurveTo(60, 548, 160, 636, 260, 646); q.lineTo(640, 648); q.bezierCurveTo(740, 660, 790, 760, 860, 860); q.bezierCurveTo(900, 930, 980, 1000, 1060, 1100); q.lineTo(-200, 1100); q.closePath(); q.fill();
    q.strokeStyle = 'rgba(200,150,220,0.35)'; q.lineWidth = 2;
    q.beginPath(); q.moveTo(640, 648); q.bezierCurveTo(740, 660, 790, 760, 860, 860); q.stroke();
    // 博物馆（剪影 + 月光边）
    const S = '#1f152f', L = '#352648';
    q.fillStyle = S;
    q.fillRect(250, 560, 90, 88); q.beginPath(); q.arc(295, 560, 45, PI, 0); q.fill(); // 圆顶
    q.fillRect(340, 540, 230, 108); q.fillRect(570, 580, 70, 68);
    q.beginPath(); q.moveTo(395, 540); q.lineTo(455, 512); q.lineTo(515, 540); q.closePath(); q.fill();
    q.fillStyle = L; q.fillRect(340, 536, 230, 5); q.fillRect(570, 576, 70, 4);
    q.strokeStyle = L; q.lineWidth = 2; q.beginPath(); q.arc(295, 560, 45, PI, 0); q.stroke();
    q.fillStyle = '#120c1e'; q.fillRect(292, 516, 6, 44);
    // 窗（暗）
    q.fillStyle = '#2c2046';
    for (const wx of [362, 402, 510, 548]) { q.fillRect(wx, 566, 18, 30); q.beginPath(); q.arc(wx + 9, 566, 9, PI, 0); q.fill(); }
    q.fillRect(434, 590, 42, 58); // 门
    // 小路与树丛
    q.fillStyle = '#150d22';
    for (let i = 0; i < 14; i++) { const bx = 150 + i * 46 + hash(5, i) * 20, by = 650 + hash(6, i) * 10; q.beginPath(); q.ellipse(bx, by, 22 + hash(7, i) * 16, 12 + hash(8, i) * 6, 0, 0, TAU); q.fill(); }
    palm(q, 214, 652, 120, 0, { seed: 41, col: '#150d22', lean: -0.1, n: 8 });
    palm(q, 652, 654, 104, 0, { seed: 42, col: '#150d22', lean: 0.12, n: 8 });
    // 岬角的岩层与月光边、一条之字形的小路
    q.strokeStyle = 'rgba(120,90,160,0.18)'; q.lineWidth = 2;
    for (let i = 0; i < 9; i++) { const y = 700 + i * 40; q.beginPath(); q.moveTo(-100, y + 20); q.bezierCurveTo(200, y - 10, 500, y + 30, 700 + i * 25, y + 60); q.stroke(); }
    q.strokeStyle = 'rgba(255,200,170,0.22)'; q.lineWidth = 3; q.beginPath(); q.moveTo(470, 660); q.lineTo(520, 700); q.lineTo(430, 740); q.lineTo(560, 790); q.lineTo(470, 850); q.lineTo(640, 920); q.stroke();
    for (let i = 0; i < 7; i++) palm(q, 60 + i * 70 + hash(43, i) * 30, 720 + i * 30 + hash(44, i) * 30, 60 + hash(45, i) * 40, 0, { seed: 60 + i, col: '#110a1c', n: 7 });
  }
  const SN_WIN = [456, 578]; // 博物馆唯一亮着的窗（世界坐标）
  function snBeach(q) {
    q.fillStyle = '#07040c';
    q.beginPath(); q.moveTo(1040, 1100); q.bezierCurveTo(1200, 1030, 1500, 1010, 1700, 1000); q.bezierCurveTo(1820, 996, 1900, 990, 2200, 985); q.lineTo(2200, 1200); q.lineTo(1040, 1200); q.closePath(); q.fill();
    q.beginPath(); q.moveTo(-300, 980); q.bezierCurveTo(-100, 960, 60, 990, 240, 1040); q.lineTo(420, 1200); q.lineTo(-300, 1200); q.closePath(); q.fill();
    // 草
    q.strokeStyle = '#07040c'; q.lineWidth = 3; q.lineCap = 'round';
    for (let i = 0; i < 60; i++) { const x = 1180 + i * 16 + hash(12, i) * 10, y = 1012 - (x - 1180) * 0.015; q.beginPath(); q.moveTo(x, y + 6); q.quadraticCurveTo(x + (hash(13, i) - 0.5) * 20, y - 20, x + (hash(14, i) - 0.5) * 30, y - 30 - hash(15, i) * 26); q.stroke(); }
  }

  /* =========================================================
   * 镜头 1 · 汐斯塔的夜（0 → 9.92）
   * ========================================================= */
  function shotSiesta(g, s) {
    const t = s.t, k = ease.inOut(clamp(s.lt / 10.6));
    const cam = { x: lerp(960, 640, k), y: lerp(540, 590, k), z: lerp(1, 1.2, k), ...hand(s, 2, 3, 0.25) };
    g.drawImage(LC(s, 'sn-sky', VW, VH, snSky, 0.5), 0, 0, VW, VH);
    inCam(g, cam, 0.05, (q) => {
      stars(q, t, { n: 90, seed: 21, x: 0, y: 0, w: VW, h: 560, s: 2.6, pow: 1.6 });
      E.glow(q, 1720, 150, 230, '255,200,220', 0.28);
      q.drawImage(moonSpr(), 1656, 86, 128, 128);
    });
    inCam(g, cam, 0.1, (q) => {
      q.drawImage(LC(s, 'sn-clouds', VW, 300, snClouds, 0.5), -40 + t * 3, 420, VW + 80, 300);
      withAlpha(q, 0.3, (qq) => qq.drawImage(LC(s, 'sheepcloud-night', 320, 200, (c) => sheepCloudArt(c, 'rgba(190,160,235,0.7)', 'rgba(255,170,205,0.9)'), 0.28), 330 + t * 8, 150, 460, 288));
    });
    baked(g, s, 'sn-far', { x: 960, y: 540, z: 1 }, cam, 0.2, snFar, 0.6, [680, 436, 2140, 714]);
    inCam(g, cam, 0.2, (q) => {
      plumes(q, t, 1556, 468, 1, { a: 0.42, rgb: '255,176,210' });
      floatIsland(q, 1330 + Math.sin(t * 0.6) * 4, 250 + Math.sin(t * 0.8) * 6, 0.9, t);
    });
    baked(g, s, 'sn-sea', { x: 960, y: 540, z: 1 }, cam, 0.3, snSea, 0.6, [-220, 694, 2140, 1300]);
    inCam(g, cam, 0.3, (q) => seaShimmer(q, t, s, sameScreenX(cam, 1720, 0.05, 0.3)));
    baked(g, s, 'sn-town', { x: 960, y: 540, z: 1 }, cam, 0.4, snTown, 1.1, [780, 552, 2130, 806]);
    inCam(g, cam, 0.4, (q) => townLights(q, t, s));
    inCam(g, cam, 0.38, (q) => fogBand(q, t, { n: 7, seed: 4, y0: 700, y1: 760, w: 700, h: 120, speed: 10, rgb: '255,190,220', a: 0.28 }));
    baked(g, s, 'sn-head', { x: 960, y: 540, z: 1 }, cam, 0.75, snHead, 1.25, [-220, 496, 1090, 1110]);
    inCam(g, cam, 0.75, (q) => {
      const wl = 0.85 + 0.15 * wobble(8, t * 2);
      q.fillStyle = '#ffcf86'; q.fillRect(SN_WIN[0] - 9, SN_WIN[1] - 12, 18, 30); q.beginPath(); q.arc(SN_WIN[0], SN_WIN[1] - 12, 9, PI, 0); q.fill();
      E.glow(q, SN_WIN[0], SN_WIN[1], 60, '255,200,120', 0.8 * wl);
      E.glow(q, SN_WIN[0], SN_WIN[1], 170, '255,170,110', 0.3 * wl);
      for (let i = 0; i < 5; i++) { const lx = 480 + i * 70, ly = 668 + i * 38; q.fillStyle = '#ffd9a0'; q.fillRect(lx - 1.5, ly - 3, 3, 3); E.glow(q, lx, ly - 2, 18, '255,200,130', 0.7); }
      fireflies(q, t, { n: 16, seed: 3, x: 150, y: 560, w: 600, h: 140, s: 5 });
    });
    inCam(g, cam, 0.5, (q) => fogBand(q, t, { n: 6, seed: 9, x0: 300, x1: 1300, y0: 800, y1: 900, w: 900, h: 200, speed: 14, rgb: '255,180,225', a: 0.12 }));
    // 基准机位往左偏一点：镜头推到最左（结尾 + 淡出转场里）时，前景沙滩的左边也在缓存里
    baked(g, s, 'sn-beach2', { x: 880, y: 540, z: 1 }, cam, 1.25, snBeach, 1, [-320, 948, 2220, 1210]);
    inCam(g, cam, 1.25, (q) => {
      palm(q, 1790, 1010, 560, t, { seed: 5, lean: -0.16, col: '#07040c', rim: 'rgba(255,150,190,0.35)' });
      palm(q, 1660, 1030, 380, t + 3, { seed: 6, lean: 0.1, col: '#07040c' });
      palm(q, 60, 1010, 640, t + 1, { seed: 7, lean: 0.14, col: '#07040c', rim: 'rgba(200,150,240,0.3)' });
      palm(q, -80, 1060, 470, t + 2, { seed: 8, lean: 0.24, col: '#07040c' });
      fireflies(q, t, { n: 10, seed: 8, x: 1200, y: 760, w: 700, h: 240, s: 8 });
    });
    vig(g, s, 0.55);
  }
  function plumes(g, t, cx, cy, sc, o = {}) {
    // 火山口飘出的一缕粉色烟：几十团雾沿着一条弯曲的路径慢慢升起、变大、变淡（下缘被晚霞照亮）
    const n = o.n || 26, rgb = o.rgb || '255,176,206', A = g.globalAlpha;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const u = fract(t * (o.speed || 0.014) + i / n);
        const px = cx - u * 330 * sc - u * u * 160 * sc + Math.sin(u * 7 + i) * 18 * sc + (hash(4, i) - 0.5) * 30 * sc * u;
        const py = cy - u * 380 * sc + u * u * 70 * sc + (pass ? 10 * sc * (1 + u * 3) : 0);
        const r = (22 + u * 190) * sc * (pass ? 0.7 : 1) * (0.85 + 0.3 * hash(5, i));
        g.globalAlpha = A * (o.a || 0.5) * (pass ? 0.55 : 1) * Math.sin(PI * Math.min(1, u * 1.1 + 0.03)) * (0.7 + 0.3 * hash(3, i));
        g.drawImage(puff(i + pass, pass ? '255,214,190' : rgb), px - r, py - r * 0.6, r * 2, r * 1.2);
      }
    }
    g.globalAlpha = A;
    if (o.glow !== false) E.glow(g, cx, cy, 70 * sc, '255,190,200', 0.35 * (o.a || 0.5));
  }
  function floatIsland(q, x, y, sc, t) {
    q.save(); q.translate(x, y); q.scale(sc, sc);
    q.fillStyle = '#5a3a6e'; q.beginPath(); q.moveTo(-22, 0); q.quadraticCurveTo(0, -6, 22, 0); q.lineTo(6, 20); q.lineTo(-2, 30); q.lineTo(-8, 16); q.closePath(); q.fill();
    q.fillStyle = '#7a4e88'; q.fillRect(-22, -2, 44, 3);
    palm(q, 4, -1, 22, t, { seed: 77, col: '#5a3a6e', n: 6 });
    q.restore();
  }
  function seaShimmer(q, t, s, moonX = 1700) {
    // 晚霞与灯光在海面上的碎光
    for (let i = 0; i < 70; i++) {
      const y = HZ + 6 + Math.pow(hash(41, i, 1), 1.7) * 330, near = (y - HZ) / 330;
      const x = hash(41, i, 2) * VW + Math.sin(t * 0.6 + i) * 10;
      const a = Math.max(0, Math.sin(t * (1.3 + hash(41, i, 3) * 2) + i * 1.9)) * (0.5 - near * 0.3);
      if (a < 0.03) continue;
      q.globalAlpha = a; q.fillStyle = hash(41, i, 4) < 0.5 ? '#ffd0c0' : '#ffb0d0';
      q.fillRect(x, y, 10 + (1 - near) * 34, 1.5 + near * 2);
    }
    // 月亮倒影
    for (let i = 0; i < 16; i++) {
      const y = HZ + 14 + i * 14, w = 30 - i * 1.1 + Math.sin(t * 2 + i * 1.3) * 8;
      q.globalAlpha = 0.28 * (1 - i / 16) * (0.6 + 0.4 * Math.sin(t * 3 + i));
      q.fillStyle = '#ffe6f0'; q.fillRect(moonX - w / 2 + Math.sin(t * 1.2 + i * 0.7) * 6, y, w, 2.5);
    }
    // 城里灯光的倒影（竖直的金色碎条）
    for (let i = 0; i < 14; i++) {
      const x = 900 + hash(43, i, 1) * 1000;
      for (let j = 0; j < 6; j++) {
        q.globalAlpha = (0.32 - j * 0.045) * (0.6 + 0.4 * Math.sin(t * 2.6 + i + j * 1.7));
        q.fillStyle = '#ffc27a'; q.fillRect(x + Math.sin(t * 1.9 + j + i) * 3, 764 + j * 9, 2 + (6 - j) * 0.5, 4);
      }
    }
    q.globalAlpha = 1;
  }
  function townLights(q, t, s) {
    // 摩天轮：灯泡沿着圆圈追着拍子亮
    const fx = 1640, fy = 648, fr = 78, rot = t * 0.06, on = sst(4.6, 6, t);
    const beat = s.beat;
    for (let i = 0; i < 24; i++) {
      const a = rot + (i / 24) * TAU, x = fx + Math.cos(a) * fr, y = fy + Math.sin(a) * fr;
      const chase = Math.exp(-(((i - beat * 3) % 24) + 24) % 24 * 0.45);
      const lit = 0.35 + 0.65 * chase * on;
      q.fillStyle = i % 3 ? '#ffb0d0' : '#ffe0a0'; q.globalAlpha = 0.6 + 0.4 * lit; q.fillRect(x - 1.5, y - 1.5, 3, 3); q.globalAlpha = 1;
      E.glow(q, x, y, 9 + 6 * lit, i % 3 ? '255,150,200' : '255,210,140', 0.35 * lit);
    }
    for (let i = 0; i < 8; i++) { const a = rot * 1 + (i / 8) * TAU, x = fx + Math.cos(a) * fr, y = fy + Math.sin(a) * fr + 7; q.fillStyle = '#2e2450'; q.fillRect(x - 4, y - 3, 8, 7); }
    E.glow(q, fx, fy, 120, '255,150,200', 0.12 * on * (0.7 + 0.3 * s.pulse(3)));
    // 灯塔的光束（左右扫）
    const la = t * 0.9, lx = 862, ly = 686, face = Math.cos(la);
    q.save(); q.globalCompositeOperation = 'lighter';
    const dir = Math.sin(la) > 0 ? 1 : -1, len = 420 * Math.abs(Math.sin(la)) + 60;
    q.fillStyle = hg(q, lx, lx + dir * len, [[0, `rgba(255,236,200,${0.35 + 0.3 * Math.max(0, face)})`], [1, 'rgba(255,236,200,0)']]);
    q.beginPath(); q.moveTo(lx, ly - 2); q.lineTo(lx + dir * len, ly - 16 - len * 0.03); q.lineTo(lx + dir * len, ly + 12 + len * 0.03); q.closePath(); q.fill();
    q.restore();
    E.glow(q, lx, ly, 26 + 30 * Math.max(0, face), '255,236,200', 0.8);
    // 栈桥灯
    for (let i = 0; i < 3; i++) E.glow(q, 996 - i * 30, 748 + i * 14, 14, '255,210,150', 0.8);
  }
  function fireflies(q, t, o) {
    for (let i = 0; i < o.n; i++) {
      const bx = o.x + hash(o.seed, i, 1) * o.w, by = o.y + hash(o.seed, i, 2) * o.h;
      const f = 0.2 + hash(o.seed, i, 3) * 0.35, ph = hash(o.seed, i, 4) * TAU;
      const x = bx + Math.sin(t * f * TAU * 0.5 + ph) * 40, y = by + Math.cos(t * f * TAU * 0.37 + ph) * 22;
      const a = 0.5 + 0.5 * Math.sin(t * (2 + hash(o.seed, i, 5) * 3) + ph);
      E.glow(q, x, y, o.s * (0.8 + a * 0.6), o.rgb || '255,220,140', 0.25 + 0.6 * a);
    }
  }

  /* =========================================================
   * 镜头 2 · 博物馆的窗（9.92 → 14.10）
   * ========================================================= */
  const MZ_WIN = { x: 1020, y: 560, w: 190, h: 330 }; // 亮着的大拱窗（中心、宽、高）
  function archPath(q, cx, cy, w, h) { const r = w / 2, top = cy - h / 2 + r; q.beginPath(); q.moveTo(cx - r, cy + h / 2); q.lineTo(cx - r, top); q.arc(cx, top, r, PI, 0); q.lineTo(cx + r, cy + h / 2); q.closePath(); }
  function mzSky(q) {
    q.fillStyle = vg(q, 0, 1080, [[0, '#080722'], [0.45, '#1e1648'], [0.75, '#40225e'], [1, '#6e2c6c']]); q.fillRect(0, 0, VW, VH);
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
    // 圆顶观测台（左）
    q.fillStyle = vg(q, 250, 1000, [[0, '#3a3058'], [1, '#221a38']]); q.fillRect(130, 330, 320, 700);
    q.fillStyle = vg(q, 100, 330, [[0, '#4a5a7a'], [1, '#26304a']]); q.beginPath(); q.arc(290, 330, 170, PI, 0); q.fill();
    q.strokeStyle = 'rgba(200,210,255,0.45)'; q.lineWidth = 4; q.beginPath(); q.arc(290, 330, 170, PI * 1.08, PI * 1.55); q.stroke();
    q.fillStyle = '#141024'; q.beginPath(); q.moveTo(270, 164); q.lineTo(310, 164); q.lineTo(316, 330); q.lineTo(264, 330); q.closePath(); q.fill();
    q.strokeStyle = ink; q.lineWidth = 4; q.beginPath(); q.arc(290, 330, 170, PI, 0); q.stroke();
    q.fillStyle = '#2a2244'; q.fillRect(120, 322, 340, 18);
    // 主楼
    q.fillStyle = vg(q, 250, 1040, [[0, '#4a3a66'], [0.5, '#3a2c56'], [1, '#2a2042']]); q.fillRect(450, 280, 1150, 760);
    // 墙面灰泥纹理
    const R = E.rng(4);
    for (let i = 0; i < 900; i++) { q.fillStyle = `rgba(${R() < 0.5 ? '255,230,255' : '20,10,30'},${0.02 + R() * 0.04})`; q.fillRect(450 + R() * 1150, 280 + R() * 760, 2 + R() * 6, 1 + R() * 3); }
    // 檐口 + 招牌带
    q.fillStyle = '#2a2044'; q.fillRect(430, 250, 1190, 34); q.fillStyle = '#5a4a7e'; q.fillRect(430, 250, 1190, 5);
    q.fillStyle = '#34284e'; q.fillRect(450, 284, 1150, 60);
    E.text(q, 'SIESTA  VOLCANO  MUSEUM', 1025, 328, { font: 'display', size: 36, weight: 700, spacing: 10, color: '#b9a8d8' });
    // 壁柱
    for (const x of [470, 800, 1250, 1570]) { q.fillStyle = '#3e3260'; q.fillRect(x - 14, 344, 28, 700); q.fillStyle = 'rgba(210,200,255,0.12)'; q.fillRect(x - 14, 344, 5, 700); }
    // 窗（左右两扇暗的）
    for (const cx of [630, 1420]) {
      archPath(q, cx, 560, 170, 310); q.fillStyle = '#1a1432'; q.fill();
      q.save(); archPath(q, cx, 560, 170, 310); q.clip();
      q.fillStyle = 'rgba(160,140,220,0.18)'; q.beginPath(); q.moveTo(cx - 85, 420); q.lineTo(cx - 20, 420); q.lineTo(cx - 85, 560); q.closePath(); q.fill();
      q.restore();
      q.strokeStyle = '#4a3c6a'; q.lineWidth = 10; archPath(q, cx, 560, 170, 310); q.stroke();
      q.lineWidth = 5; q.beginPath(); q.moveTo(cx, 420); q.lineTo(cx, 715); q.moveTo(cx - 85, 560); q.lineTo(cx + 85, 560); q.stroke();
      q.fillStyle = '#2e2448'; q.fillRect(cx - 100, 712, 200, 16);
    }
    // 主窗框（亮窗的窗框画在前景层）
    q.fillStyle = '#2e2448'; q.fillRect(MZ_WIN.x - 118, MZ_WIN.y + MZ_WIN.h / 2 - 4, 236, 20);
    // 门 + 门牌
    q.fillStyle = '#1e1630'; archPath(q, 1250, 900, 150, 250); q.fill();
    q.strokeStyle = '#4a3c6a'; q.lineWidth = 8; archPath(q, 1250, 900, 150, 250); q.stroke();
    q.fillStyle = '#2a1e3c'; q.fillRect(1178, 830, 68, 190); q.fillRect(1254, 830, 68, 190);
    q.fillStyle = '#6a5a8a'; q.beginPath(); q.arc(1238, 930, 5, 0, TAU); q.arc(1262, 930, 5, 0, TAU); q.fill();
    q.fillStyle = '#d8c8a8'; rrect(q, 1340, 820, 150, 60, 6); q.fill(); q.strokeStyle = '#6a5040'; q.lineWidth = 3; q.stroke();
    E.text(q, '汐斯塔火山博物馆', 1415, 858, { font: 'serif', size: 17, weight: 700, color: '#4a3020', spacing: 1 });
    // 台阶
    q.fillStyle = '#2a2240'; q.fillRect(1150, 1020, 200, 24); q.fillStyle = '#342a4e'; q.fillRect(1130, 1040, 240, 40);
    // 石块砌缝（很淡）
    q.strokeStyle = 'rgba(20,10,40,0.18)'; q.lineWidth = 2;
    for (let y = 380; y < 1040; y += 44) { q.beginPath(); q.moveTo(450, y); q.lineTo(1600, y); q.stroke(); for (let x = 450 + ((y / 44) % 2) * 60; x < 1600; x += 120) { q.beginPath(); q.moveTo(x, y); q.lineTo(x, y + 44); q.stroke(); } }
    // 月光：上亮下暗；檐口下一道阴影
    q.fillStyle = vg(q, 280, 1080, [[0, 'rgba(200,190,255,0.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(10,4,20,0.35)']]); q.fillRect(450, 280, 1150, 800);
    q.fillStyle = vg(q, 344, 400, [[0, 'rgba(10,4,20,0.45)'], [1, 'rgba(10,4,20,0)']]); q.fillRect(450, 344, 1150, 56);
    // 亮窗与门灯投在墙上的暖光
    q.globalCompositeOperation = 'lighter';
    q.fillStyle = rg(q, MZ_WIN.x, MZ_WIN.y + 60, 0, 380, [[0, 'rgba(255,170,100,0.32)'], [1, 'rgba(255,170,100,0)']]); q.fillRect(MZ_WIN.x - 380, MZ_WIN.y - 320, 760, 760);
    q.fillStyle = rg(q, 1110, 800, 0, 260, [[0, 'rgba(255,190,120,0.35)'], [1, 'rgba(255,190,120,0)']]); q.fillRect(850, 540, 520, 520);
    q.globalCompositeOperation = 'source-over';
    // 三角梅：一簇簇（先铺叶子，再点花），爬满墙角和右边的柱子
    const clusters = [[480, 760, 90], [560, 860, 110], [470, 960, 100], [640, 990, 90], [760, 1020, 80], [1560, 420, 70], [1580, 540, 80], [1545, 660, 70], [1585, 780, 85], [1560, 900, 80], [1590, 1010, 80]];
    for (const [cx, cy, r] of clusters) {
      for (let j = 0; j < 22; j++) { const a = hash(cx, j, 1) * TAU, d = Math.sqrt(hash(cx, j, 2)) * r; q.fillStyle = j % 3 ? '#243832' : '#2e4a3e'; q.beginPath(); q.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 12, 7, a, 0, TAU); q.fill(); }
      for (let j = 0; j < 34; j++) { const a = hash(cy, j, 3) * TAU, d = Math.pow(hash(cy, j, 4), 0.7) * r * 0.9; const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.8; const warm = Math.max(0, 1 - Math.hypot(px - MZ_WIN.x, py - MZ_WIN.y) / 700); q.fillStyle = hash(cx, j, 5) < 0.5 ? mixC('#b8456e', '#ff9a6a', warm * 0.4) : mixC('#e0709e', '#ffc080', warm * 0.4); for (let k = 0; k < 3; k++) { const b = a + k * 2.1; q.beginPath(); q.ellipse(px + Math.cos(b) * 4, py + Math.sin(b) * 4, 5, 3.5, b, 0, TAU); q.fill(); } }
    }
    q.strokeStyle = ink; q.lineWidth = 4; q.strokeRect(450, 280, 1150, 800);
  }
  function mzWindowInside(g, s, t) {
    // 亮窗里：暖光的室内、标本架剪影、伏案写字的她（剪影 + 轮廓光）
    const W = MZ_WIN;
    g.save(); archPath(g, W.x, W.y, W.w, W.h); g.clip();
    g.drawImage(LC(s, 'mz-inside', 200, 340, (q) => {
      q.fillStyle = vg(q, 0, 340, [[0, '#6a3a2a'], [0.5, '#c07840'], [1, '#e8a860']]); q.fillRect(0, 0, 200, 340);
      q.fillStyle = 'rgba(60,24,16,0.85)'; q.fillRect(0, 40, 60, 300);
      for (let y = 70; y < 340; y += 60) { q.fillStyle = '#3a1a10'; q.fillRect(0, y, 70, 6); for (let i = 0; i < 4; i++) { q.beginPath(); q.ellipse(10 + i * 15, y - 8, 6, 8, 0, 0, TAU); q.fill(); } }
      q.fillStyle = rg(q, 150, 230, 0, 120, [[0, 'rgba(255,240,200,0.9)'], [1, 'rgba(255,200,120,0)']]); q.fillRect(0, 0, 200, 340);
      q.fillStyle = '#4a2414'; q.fillRect(40, 270, 170, 14); q.fillRect(50, 284, 10, 60);
    }, 1), W.x - 100, W.y - 170, 200, 340);
    // 窗里：她坐在书桌前的椅子上（逆光剪影；官方小人的坐姿，座面在窗台下面一点）
    cast(g, 'adele-alter', { x: W.x - 30, y: W.y + 180, h: 190, pose: 'sit', seat: 60, outfit: 'home', t, flip: false, sil: '#3a1c12', rim: '255,210,150', expr: 'sleepy' });
    E.glow(g, W.x + 55, W.y + 55, 70, '255,230,170', 0.7 + 0.1 * wobble(3, t * 3));
    // 窗角里一点一闪的粉光（货箱里有东西……）
    E.glow(g, W.x + 78, W.y + 150, 34, '255,140,210', 0.25 + 0.25 * Math.max(0, Math.sin(t * 5.3)) * Math.max(0, Math.sin(t * 1.7)));
    g.restore();
    // 窗框
    g.strokeStyle = '#4a3c6a'; g.lineWidth = 12; archPath(g, W.x, W.y, W.w, W.h); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.moveTo(W.x, W.y - W.h / 2 + 10); g.lineTo(W.x, W.y + W.h / 2); g.moveTo(W.x - W.w / 2, W.y); g.lineTo(W.x + W.w / 2, W.y); g.stroke();
    E.glow(g, W.x, W.y + 40, 260, '255,180,110', 0.28);
  }
  function shotMuseum(g, s) {
    const t = s.t, k = ease.inOut(clamp(s.lt / 4.4));
    const cam = { x: lerp(980, MZ_WIN.x, k), y: lerp(600, MZ_WIN.y, k), z: lerp(1.0, 1.42, k), ...hand(s, 4, 3, 0.3) };
    g.drawImage(LC(s, 'mz-sky', VW, VH, mzSky, 0.5), 0, 0, VW, VH);
    inCam(g, cam, 0.1, (q) => stars(q, t, { n: 70, seed: 33, x: 0, y: 0, w: VW, h: 620, s: 2.6 }));
    baked(g, s, 'mz-volc', { x: 960, y: 540, z: 1 }, cam, 0.3, mzVolcano, 0.8, [1190, 318, 2210, 1110]);
    inCam(g, cam, 0.3, (q) => plumes(q, t, 1690, 330, 1.5, { a: 0.35, rgb: '255,176,210', speed: 0.02 }));
    baked(g, s, 'mz-facade', { x: 960, y: 540, z: 1 }, cam, 1, mzFacade, 1.25, [106, 148, 1694, 1092]);
    inCam(g, cam, 1, (q) => {
      mzWindowInside(q, s, t);
      // 门边的壁灯
      E.glow(q, 1110, 800, 90, '255,196,120', 0.55); E.glow(q, 1110, 800, 22, '255,236,200', 0.9);
      fireflies(q, t, { n: 10, seed: 12, x: 1040, y: 700, w: 160, h: 180, s: 5, rgb: '255,236,200' });
      fogBand(q, t, { n: 6, seed: 17, y0: 960, y1: 1080, w: 900, h: 220, speed: 16, rgb: '220,170,240', a: 0.3 });
    });
    inCam(g, cam, 1.35, (q) => {
      // 前景：右上角垂下的棕榈叶、左下的灌木
      q.fillStyle = '#07040c';
      for (let i = 0; i < 5; i++) frond(q, 2020, -120, PI * 0.62 + i * 0.13 + wobble(40 + i, t * 0.5) * 0.06, 520 + i * 40, 0.6 + i * 0.1);
      for (let i = 0; i < 4; i++) frond(q, -140, 1180, -PI * 0.28 - i * 0.12 + wobble(50 + i, t * 0.5) * 0.05, 420 + i * 30, 0.3);
    });
    vig(g, s, 0.5);
  }

  /* =========================================================
   * 博物馆室内（世界坐标 1920×1080）：墙、标本架、窗、书桌；夜 / 早晨两种光
   * ========================================================= */
  // crate：货箱底边中心——在书桌右前方（箱底 y 比桌腿 1040 更靠前），倒下时也不会躲到书桌后面去
  // chair：挂外套的那把椅子，在书桌左边、标本柜前（不被书桌和她挡住，外套看得清）
  const RM = { lamp: [1330, 598], desk: [800, 1560, 740], crate: [1730, 1062], door: [60, 250], chair: [640, 752], adele: [1150, 985], win: [1560, 160, 300, 470], seat: 196 };
  function specimen(q, type, x, y, R) {
    // 在搁板 y 上放一件标本，返回占用宽度
    const ink = 'rgba(40,20,24,0.85)';
    q.lineWidth = 2; q.strokeStyle = ink;
    if (type === 'rock') {
      const w = 44 + R() * 40, h = 26 + R() * 30, col = pick(['#cfc4b4', '#2a2430', '#6a6070', '#a88a70', '#8a5a4a', '#e0d28a'], R());
      const pts = rockPts(x + w / 2, y - h / 2, w / 2, h / 2, (R() * 1000) | 0, 9, 0.2).map(([a, b]) => [a, Math.min(y, b)]);
      blob(q, pts); q.fillStyle = col; q.fill(); q.stroke();
      q.fillStyle = 'rgba(255,255,255,0.28)'; q.beginPath(); q.ellipse(x + w * 0.36, y - h * 0.7, w * 0.16, h * 0.12, -0.4, 0, TAU); q.fill();
      if (col === '#cfc4b4') { q.fillStyle = 'rgba(80,60,60,0.45)'; for (let i = 0; i < 7; i++) { q.beginPath(); q.arc(x + w * (0.2 + R() * 0.6), y - h * (0.2 + R() * 0.6), 1.5 + R() * 2, 0, TAU); q.fill(); } }
      q.fillStyle = '#f4ecdc'; q.fillRect(x + w / 2 - 10, y - 8, 20, 8);
      return w;
    }
    if (type === 'jar') {
      const w = 40 + R() * 16, h = 70 + R() * 30, fill = pick(['#9a8a92', '#c8a878', '#e2b8c8', '#6a5a60', '#b8c8a0'], R());
      rrect(q, x, y - h, w, h, 8); q.fillStyle = 'rgba(210,225,235,0.35)'; q.fill();
      q.save(); rrect(q, x, y - h, w, h, 8); q.clip(); q.fillStyle = fill; q.fillRect(x, y - h * (0.45 + R() * 0.3), w, h); q.restore();
      rrect(q, x, y - h, w, h, 8); q.stroke();
      q.fillStyle = pick(['#8a3a3a', '#6a5a3a', '#3a4a5a'], R()); q.fillRect(x - 3, y - h - 10, w + 6, 12); q.strokeRect(x - 3, y - h - 10, w + 6, 12);
      q.fillStyle = '#f4ecdc'; q.fillRect(x + 6, y - h * 0.62, w - 12, 16); q.fillStyle = 'rgba(60,40,30,0.6)'; q.fillRect(x + 10, y - h * 0.62 + 6, w - 20, 2);
      q.fillStyle = 'rgba(255,255,255,0.4)'; q.fillRect(x + 5, y - h + 6, 4, h - 14);
      return w;
    }
    if (type === 'crystal') {
      const w = 60 + R() * 20, col = pick([['#b48ae0', '#7a52b0'], ['#f0e070', '#b09a30'], ['#e8e4f4', '#a8a0c0']], R());
      q.fillStyle = '#5a4a50'; blob(q, rockPts(x + w / 2, y - 10, w / 2, 12, 5, 7, 0.15)); q.fill(); q.stroke();
      for (let i = 0; i < 5; i++) {
        const cx = x + w * (0.2 + i * 0.15), hh = 30 + R() * 40, ww = 7 + R() * 6, a = (i - 2) * 0.22;
        q.save(); q.translate(cx, y - 12); q.rotate(a);
        q.beginPath(); q.moveTo(-ww, 0); q.lineTo(-ww, -hh); q.lineTo(0, -hh - ww * 1.6); q.lineTo(ww, -hh); q.lineTo(ww, 0); q.closePath();
        q.fillStyle = col[0]; q.fill(); q.stroke(); q.fillStyle = col[1]; q.fillRect(0, -hh, ww, hh);
        q.restore();
      }
      return w;
    }
    if (type === 'books') {
      let w = 0; const n = 3 + ((R() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const bw = 13 + R() * 7, bh = 80 + R() * 40, col = pick(['#7a2e3a', '#2e4a6a', '#3e5a3a', '#6a4a2a', '#4a3a6a', '#8a6a3a'], R());
        q.fillStyle = col; q.fillRect(x + w, y - bh, bw, bh); q.strokeRect(x + w, y - bh, bw, bh);
        q.fillStyle = '#d8b060'; q.fillRect(x + w + 2, y - bh + 10, bw - 4, 3); q.fillRect(x + w + 2, y - 16, bw - 4, 3);
        w += bw;
      }
      return w;
    }
    if (type === 'dome') {
      const w = 64, h = 96;
      q.fillStyle = '#4a2c24'; q.fillRect(x - 4, y - 10, w + 8, 10);
      blob(q, rockPts(x + w / 2, y - 26, 18, 14, 3, 8, 0.2)); q.fillStyle = '#1e1a24'; q.fill();
      q.fillStyle = 'rgba(255,255,255,0.4)'; q.beginPath(); q.ellipse(x + w / 2 - 6, y - 32, 5, 3, -0.5, 0, TAU); q.fill();
      q.beginPath(); q.moveTo(x, y - 10); q.lineTo(x, y - h + w / 2); q.arc(x + w / 2, y - h + w / 2, w / 2, PI, 0); q.lineTo(x + w, y - 10);
      q.fillStyle = 'rgba(200,220,240,0.14)'; q.fill(); q.stroke();
      q.fillStyle = 'rgba(255,255,255,0.45)'; q.fillRect(x + 8, y - h + 26, 4, h - 44);
      return w;
    }
    if (type === 'model') {
      const w = 110, h = 70;
      q.fillStyle = '#6a4a3a'; q.fillRect(x - 4, y - 8, w + 8, 8);
      q.beginPath(); q.moveTo(x, y - 8); q.quadraticCurveTo(x + w * 0.38, y - 18, x + w * 0.44, y - h); q.lineTo(x + w * 0.56, y - h); q.quadraticCurveTo(x + w * 0.62, y - 18, x + w, y - 8); q.closePath();
      q.fillStyle = '#5a4a58'; q.fill(); q.stroke();
      q.fillStyle = '#e0603a'; q.beginPath(); q.moveTo(x + w * 0.44, y - h); q.lineTo(x + w * 0.56, y - h); q.lineTo(x + w * 0.53, y - h + 22); q.lineTo(x + w * 0.49, y - h + 34); q.closePath(); q.fill();
      return w;
    }
    // box：一盘小石子
    const w = 76;
    q.fillStyle = '#7a4a34'; q.fillRect(x, y - 18, w, 18); q.strokeRect(x, y - 18, w, 18);
    for (let i = 0; i < 6; i++) { q.fillStyle = pick(['#cfc4b4', '#2a2430', '#a88a70', '#e0d28a', '#8a5a4a'], R()); q.beginPath(); q.ellipse(x + 8 + (i % 3) * 24 + 4, y - 14 + ((i / 3) | 0) * 3, 7, 4, 0, 0, TAU); q.fill(); }
    return w;
  }
  function roomBack(q, M) {
    const ink = '#2a1418';
    // 墙
    q.fillStyle = vg(q, 0, 900, M ? [[0, '#e8d0c0'], [1, '#d4b4a8']] : [[0, '#a88a92'], [1, '#b89aa0']]); q.fillRect(-400, -200, VW + 800, 1100);
    q.fillStyle = 'rgba(120,80,90,0.12)'; for (let x = -414; x < VW + 400; x += 46) q.fillRect(x, 30, 16, 720);
    q.fillStyle = 'rgba(255,255,255,0.08)'; for (let x = -391; x < VW + 400; x += 46) for (let y = 60; y < 740; y += 70) { q.beginPath(); q.arc(x + 8, y + (Math.abs(Math.round(x / 46)) % 2) * 35, 4, 0, TAU); q.fill(); }
    q.fillStyle = '#7a5a54'; q.fillRect(-400, -200, VW + 800, 230); q.fillStyle = '#9a7a70'; q.fillRect(-400, 30, VW + 800, 6);
    // 护墙板
    q.fillStyle = '#6e4a3e'; q.fillRect(-400, 740, VW + 800, 160); q.fillStyle = '#8a6050'; q.fillRect(-400, 740, VW + 800, 8);
    for (let x = -280; x < VW + 400; x += 150) { q.strokeStyle = 'rgba(40,20,16,0.5)'; q.lineWidth = 3; q.strokeRect(x, 770, 120, 110); q.strokeStyle = 'rgba(255,220,190,0.15)'; q.lineWidth = 2; q.strokeRect(x + 3, 773, 120, 110); }
    // 地板
    q.fillStyle = '#6a4638'; q.fillRect(-400, 900, VW + 800, 500);
    for (let i = -20; i < 40; i++) { const x0 = 960 + i * 110, x1 = 960 + i * 190; q.strokeStyle = 'rgba(40,20,16,0.45)'; q.lineWidth = 2.5; q.beginPath(); q.moveTo(x0, 900); q.lineTo(x1, 1080); q.stroke(); }
    for (let j = 0; j < 8; j++) { const y = 900 + Math.pow(j / 5, 1.3) * 180; q.strokeStyle = 'rgba(40,20,16,0.25)'; q.lineWidth = 1.5; q.beginPath(); q.moveTo(-400, y); q.lineTo(VW + 400, y); q.stroke(); }
    q.fillStyle = '#3a2420'; q.fillRect(-400, 896, VW + 800, 8);
    // 地毯
    q.fillStyle = '#7a3a4a'; q.beginPath(); q.moveTo(760, 940); q.lineTo(1500, 940); q.lineTo(1600, 1060); q.lineTo(680, 1060); q.closePath(); q.fill();
    q.strokeStyle = '#d8a060'; q.lineWidth = 4; q.beginPath(); q.moveTo(780, 950); q.lineTo(1482, 950); q.lineTo(1570, 1050); q.lineTo(708, 1050); q.closePath(); q.stroke();
    // 门（左）
    q.fillStyle = '#5a3a30'; q.fillRect(60, 300, 190, 600); q.strokeStyle = ink; q.lineWidth = 4; q.strokeRect(60, 300, 190, 600);
    q.fillStyle = '#4a2e26'; q.fillRect(84, 330, 142, 160); q.fillRect(84, 520, 142, 350);
    q.fillStyle = M ? '#cfe0ee' : '#8a86b0'; q.fillRect(98, 344, 114, 132);
    q.strokeStyle = '#4a2e26'; q.lineWidth = 5; q.beginPath(); q.moveTo(155, 344); q.lineTo(155, 476); q.moveTo(98, 410); q.lineTo(212, 410); q.stroke();
    q.fillStyle = '#d8b060'; q.beginPath(); q.arc(222, 620, 9, 0, TAU); q.fill();
    q.fillStyle = '#8a6a50'; q.fillRect(44, 290, 222, 14); q.fillRect(44, 290, 14, 610); q.fillRect(252, 290, 14, 610);
    // 标本柜
    const SX0 = 300, SX1 = 770, rows = [250, 420, 590, 750];
    q.fillStyle = '#5a3428'; q.fillRect(SX0 - 22, 92, SX1 - SX0 + 44, 808); q.fillStyle = '#3a2018'; q.fillRect(SX0, 112, SX1 - SX0, 640);
    q.fillStyle = '#7a4a34'; q.fillRect(SX0 - 30, 84, SX1 - SX0 + 60, 18);
    const R = E.rng(17);
    const types = ['rock', 'jar', 'crystal', 'books', 'rock', 'dome', 'box', 'rock', 'jar', 'model'];
    rows.forEach((y, r) => {
      q.fillStyle = '#7a4a34'; q.fillRect(SX0 - 10, y, SX1 - SX0 + 20, 16); q.fillStyle = '#9a6448'; q.fillRect(SX0 - 10, y, SX1 - SX0 + 20, 4);
      if (r === 3) return;
      let x = SX0 + 12 + R() * 10;
      while (x < SX1 - 70) { const tp = types[(R() * types.length) | 0]; if (tp === 'model' && x > SX1 - 150) continue; const w = specimen(q, tp, x, y, R); x += w + 10 + R() * 16; }
    });
    // 最下层：柜门
    q.fillStyle = '#5a3428'; q.fillRect(SX0, 766, SX1 - SX0, 134); q.strokeStyle = ink; q.lineWidth = 3; q.strokeRect(SX0 + 8, 774, (SX1 - SX0) / 2 - 12, 118); q.strokeRect(SX0 + (SX1 - SX0) / 2 + 4, 774, (SX1 - SX0) / 2 - 12, 118);
    q.strokeStyle = ink; q.lineWidth = 4; q.strokeRect(SX0 - 22, 92, SX1 - SX0 + 44, 808);
    // 火山剖面图（画框）
    q.fillStyle = '#4a2c24'; q.fillRect(826, 136, 368, 312); q.fillStyle = '#efe4cf'; q.fillRect(842, 152, 336, 280);
    q.save(); q.beginPath(); q.rect(842, 152, 336, 280); q.clip();
    q.fillStyle = '#a8c8e0'; q.fillRect(842, 152, 336, 110);
    for (let i = 0; i < 5; i++) { q.fillStyle = ['#b89070', '#a07858', '#8a6848', '#c8a880', '#9a7a60'][i]; q.beginPath(); q.moveTo(842, 290 + i * 30); for (let x = 842; x <= 1178; x += 24) q.lineTo(x, 290 + i * 30 + Math.sin(x * 0.03 + i) * 6); q.lineTo(1178, 440); q.lineTo(842, 440); q.closePath(); q.fill(); }
    q.fillStyle = '#6a5a58'; q.beginPath(); q.moveTo(900, 300); q.quadraticCurveTo(990, 280, 1000, 200); q.lineTo(1024, 200); q.quadraticCurveTo(1034, 280, 1120, 300); q.closePath(); q.fill();
    q.fillStyle = '#e0603a'; q.beginPath(); q.ellipse(1012, 400, 70, 22, 0, 0, TAU); q.fill(); q.fillRect(1006, 200, 12, 200);
    q.fillStyle = '#ffb060'; q.beginPath(); q.ellipse(1012, 400, 40, 11, 0, 0, TAU); q.fill();
    q.strokeStyle = 'rgba(60,40,30,0.7)'; q.lineWidth = 1.5;
    for (const [x, y, w] of [[1060, 190, 90], [1080, 400, 80], [860, 180, 60]]) { q.beginPath(); q.moveTo(x, y); q.lineTo(x + w, y); q.stroke(); q.beginPath(); q.moveTo(x, y + 8); q.lineTo(x + w * 0.7, y + 8); q.stroke(); }
    q.restore();
    E.text(q, '火山剖面 · SIESTA', 1010, 176, { font: 'hand', size: 18, color: '#5a3020' });
    q.strokeStyle = ink; q.lineWidth = 4; q.strokeRect(826, 136, 368, 312);
    // 钟（指针每帧画）
    q.fillStyle = '#5a3428'; q.beginPath(); q.arc(1340, 214, 64, 0, TAU); q.fill(); q.fillStyle = '#f4ecdc'; q.beginPath(); q.arc(1340, 214, 52, 0, TAU); q.fill();
    q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.arc(1340, 214, 64, 0, TAU); q.stroke();
    q.strokeStyle = '#3a2420'; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; q.lineWidth = i % 3 ? 2 : 4; q.beginPath(); q.moveTo(1340 + Math.cos(a) * 42, 214 + Math.sin(a) * 42); q.lineTo(1340 + Math.cos(a) * 50, 214 + Math.sin(a) * 50); q.stroke(); }
    // 窗（右墙）
    const [wx, wy, ww, wh] = RM.win;
    q.save(); q.beginPath(); q.rect(wx, wy, ww, wh); q.clip();
    if (M) {
      q.fillStyle = vg(q, wy, wy + wh, [[0, '#9ccaf0'], [0.6, '#dfeaf4'], [1, '#ffe6d0']]); q.fillRect(wx, wy, ww, wh);
      q.fillStyle = '#8a9ab8'; q.beginPath(); q.moveTo(wx - 20, wy + wh); q.quadraticCurveTo(wx + 150, wy + wh - 16, wx + 166, wy + 300); q.lineTo(wx + 178, wy + 294); q.lineTo(wx + 190, wy + 302); q.quadraticCurveTo(wx + 206, wy + wh - 26, wx + ww + 30, wy + wh - 8); q.lineTo(wx + ww, wy + wh); q.closePath(); q.fill();
      q.save(); q.translate(wx + 70, wy + 50); q.scale(0.55, 0.55); sheepCloudArt(q, 'rgba(255,255,255,0.95)', 'rgba(255,220,236,0.95)', 'rgba(90,60,90,0.7)'); q.restore();
    } else {
      q.fillStyle = vg(q, wy, wy + wh, [[0, '#0e0c2c'], [0.7, '#2a1c4e'], [1, '#5a2a62']]); q.fillRect(wx, wy, ww, wh);
      for (let i = 0; i < 60; i++) { q.fillStyle = `rgba(255,240,250,${0.2 + hash(2, i) * 0.6})`; q.fillRect(wx + hash(3, i) * ww, wy + hash(4, i) * wh * 0.7, 1.6, 1.6); }
      q.fillStyle = '#fff4f0'; q.beginPath(); q.arc(wx + 70, wy + 90, 24, 0, TAU); q.fill(); q.fillStyle = '#0e0c2c'; q.beginPath(); q.arc(wx + 80, wy + 84, 22, 0, TAU); q.fill();
      q.fillStyle = '#140c24'; q.beginPath(); q.moveTo(wx - 20, wy + wh); q.quadraticCurveTo(wx + 150, wy + wh - 16, wx + 166, wy + 300); q.lineTo(wx + 178, wy + 294); q.lineTo(wx + 190, wy + 302); q.quadraticCurveTo(wx + 206, wy + wh - 26, wx + ww + 30, wy + wh - 8); q.lineTo(wx + ww, wy + wh); q.closePath(); q.fill();
    }
    q.restore();
    q.fillStyle = '#7a5448'; q.fillRect(wx - 18, wy - 18, ww + 36, 18); q.fillRect(wx - 18, wy + wh, ww + 36, 22); q.fillRect(wx - 18, wy, 18, wh); q.fillRect(wx + ww, wy, 18, wh);
    q.fillRect(wx + ww / 2 - 6, wy, 12, wh); q.fillRect(wx, wy + wh * 0.46, ww, 12);
    q.strokeStyle = ink; q.lineWidth = 4; q.strokeRect(wx - 18, wy - 18, ww + 36, wh + 40);
    q.fillStyle = '#9a7060'; q.fillRect(wx - 30, wy + wh + 14, ww + 60, 14);
    // 窗帘
    for (const sd of [-1, 1]) {
      const x0 = sd < 0 ? wx - 70 : wx + ww + 6;
      q.fillStyle = M ? '#e8a8b8' : '#a86078'; q.beginPath(); q.moveTo(x0, wy - 40); q.lineTo(x0 + 64, wy - 40); q.bezierCurveTo(x0 + 50, wy + 200, x0 + 70, wy + 400, x0 + 60, wy + wh + 60); q.lineTo(x0, wy + wh + 60); q.closePath(); q.fill();
      q.strokeStyle = 'rgba(60,20,30,0.35)'; q.lineWidth = 3; for (let i = 1; i < 4; i++) { q.beginPath(); q.moveTo(x0 + i * 15, wy - 30); q.bezierCurveTo(x0 + i * 13, wy + 200, x0 + i * 16, wy + 400, x0 + i * 14, wy + wh + 50); q.stroke(); }
    }
    q.fillStyle = '#6a4a3a'; q.fillRect(wx - 90, wy - 52, ww + 180, 12);
    // 盆栽（窗边地上）
    q.fillStyle = '#b86a4a'; q.beginPath(); q.moveTo(1480, 900); q.lineTo(1546, 900); q.lineTo(1536, 960); q.lineTo(1490, 960); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
    q.fillStyle = '#3e6a4a';
    for (let i = 0; i < 7; i++) { const a = -PI / 2 + (i - 3) * 0.36; q.save(); q.translate(1513, 900); q.rotate(a + PI / 2); q.beginPath(); q.ellipse(0, -60 - (i % 2) * 20, 22, 56, 0, 0, TAU); q.fill(); q.restore(); }
  }
  function roomFront(q, M) {
    const ink = '#2a1418';
    const [x0, x1, y] = RM.desk;
    // 书桌：桌面 + 前板 + 抽屉
    q.fillStyle = '#9a6a4c'; q.beginPath(); q.moveTo(x0 + 20, y - 18); q.lineTo(x1 - 20, y - 18); q.lineTo(x1, y + 8); q.lineTo(x0, y + 8); q.closePath(); q.fill();
    q.fillStyle = '#7a4c36'; q.fillRect(x0, y + 8, x1 - x0, 22);
    q.fillStyle = '#5e3a2a'; q.fillRect(x0 + 16, y + 30, x1 - x0 - 32, 230);
    for (const dx of [0.08, 0.56]) { const dxx = x0 + (x1 - x0) * dx; q.fillStyle = '#6e4632'; q.fillRect(dxx, y + 50, (x1 - x0) * 0.36, 86); q.strokeStyle = 'rgba(30,14,10,0.6)'; q.lineWidth = 3; q.strokeRect(dxx, y + 50, (x1 - x0) * 0.36, 86); q.fillStyle = '#d8b060'; q.fillRect(dxx + (x1 - x0) * 0.18 - 20, y + 88, 40, 8); }
    q.fillStyle = '#4a2c20'; q.fillRect(x0 + 16, y + 260, 30, 40); q.fillRect(x1 - 46, y + 260, 30, 40);
    q.strokeStyle = ink; q.lineWidth = 4; q.strokeRect(x0, y + 8, x1 - x0, 22); q.strokeRect(x0 + 16, y + 30, x1 - x0 - 32, 230);
    q.fillStyle = 'rgba(255,230,190,0.25)'; q.fillRect(x0, y + 8, x1 - x0, 3);
    // 桌上的东西（静态）
    for (let i = 0; i < 3; i++) { q.fillStyle = ['#3e5a3a', '#7a2e3a', '#2e4a6a'][i]; q.fillRect(x0 + 60, y - 30 - i * 16, 150 - i * 12, 15); q.strokeStyle = ink; q.lineWidth = 2; q.strokeRect(x0 + 60, y - 30 - i * 16, 150 - i * 12, 15); }
    q.fillStyle = '#5a3428'; q.fillRect(x0 + 250, y - 26, 150, 18); q.strokeRect(x0 + 250, y - 26, 150, 18);
    for (let i = 0; i < 5; i++) { q.fillStyle = pick(['#cfc4b4', '#2a2430', '#a88a70', '#e0d28a', '#8a5a4a'], hash(7, i)); q.beginPath(); q.ellipse(x0 + 268 + i * 28, y - 28, 11, 7, 0, 0, TAU); q.fill(); }
    // 笔筒
    q.fillStyle = '#3a4a6a'; q.fillRect(x0 + 440, y - 64, 40, 50); q.strokeRect(x0 + 440, y - 64, 40, 50);
    for (let i = 0; i < 4; i++) { q.strokeStyle = ['#c8323a', '#2a2a2a', '#d8b060', '#4a7ab0'][i]; q.lineWidth = 4; q.beginPath(); q.moveTo(x0 + 448 + i * 8, y - 62); q.lineTo(x0 + 440 + i * 12, y - 100 - i * 5); q.stroke(); }
    // 标签卡片一叠
    q.fillStyle = '#f6efe2'; for (let i = 0; i < 4; i++) { q.save(); q.translate(x0 + 520 + i * 3, y - 16 - i * 2); q.rotate(-0.05 + i * 0.02); q.fillRect(0, 0, 70, 12); q.restore(); }
    // 台灯（黄铜摇臂 + 墨绿灯罩）
    const [lx, ly] = RM.lamp;
    q.fillStyle = '#7a5a30'; q.beginPath(); q.ellipse(lx + 110, y - 8, 46, 12, 0, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
    q.strokeStyle = '#c8a060'; q.lineWidth = 9; q.lineCap = 'round'; q.beginPath(); q.moveTo(lx + 110, y - 14); q.lineTo(lx + 150, y - 150); q.lineTo(lx + 50, ly - 40); q.stroke();
    q.strokeStyle = '#7a5a30'; q.lineWidth = 3; q.beginPath(); q.moveTo(lx + 120, y - 14); q.lineTo(lx + 156, y - 146); q.stroke();
    q.fillStyle = '#d8b060'; q.beginPath(); q.arc(lx + 150, y - 150, 9, 0, TAU); q.fill();
    q.save(); q.translate(lx + 30, ly - 20); q.rotate(0.55);
    q.fillStyle = '#2e4a40'; q.beginPath(); q.moveTo(-26, -40); q.lineTo(26, -40); q.lineTo(62, 30); q.lineTo(-62, 30); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.18)'; q.beginPath(); q.moveTo(-20, -36); q.lineTo(-8, -36); q.lineTo(-30, 26); q.lineTo(-48, 26); q.closePath(); q.fill();
    q.fillStyle = '#fff2c8'; q.beginPath(); q.ellipse(0, 30, 60, 10, 0, 0, TAU); q.fill();
    q.restore();
    q.lineCap = 'butt';
    // 放大镜
    q.strokeStyle = '#3a2420'; q.lineWidth = 8; q.beginPath(); q.moveTo(x1 - 150, y - 6); q.lineTo(x1 - 100, y - 20); q.stroke();
    q.strokeStyle = '#c8a060'; q.lineWidth = 5; q.beginPath(); q.ellipse(x1 - 178, y - 4, 30, 9, 0, 0, TAU); q.stroke();
  }
  /** 光照贴图（正片叠底）：夜里台灯的暖光 + 窗外月光；早晨窗外的阳光 */
  function roomLight(q, M) {
    if (M) {
      q.fillStyle = '#c8b0b8'; q.fillRect(-400, -300, VW + 800, VH + 600);
      q.globalCompositeOperation = 'lighter';
      q.fillStyle = rg(q, 1700, 380, 0, 1300, [[0, 'rgba(90,80,60,1)'], [1, 'rgba(40,30,30,0)']]); q.fillRect(-400, -300, VW + 800, VH + 600);
      q.fillStyle = 'rgba(80,70,50,1)'; q.beginPath(); q.moveTo(1560, 160); q.lineTo(1860, 160); q.lineTo(1200, 1080); q.lineTo(700, 1080); q.closePath(); q.fill();
      q.fillStyle = '#fff'; q.fillRect(RM.win[0], RM.win[1], RM.win[2], RM.win[3]);
    } else {
      q.fillStyle = '#34294e'; q.fillRect(-400, -300, VW + 800, VH + 600);
      q.globalCompositeOperation = 'lighter';
      q.fillStyle = rg(q, 1290, 690, 0, 820, [[0, 'rgba(255,210,150,1)'], [0.3, 'rgba(210,140,100,0.75)'], [0.65, 'rgba(110,60,60,0.35)'], [1, 'rgba(60,30,40,0)']]); q.fillRect(-400, -300, VW + 800, VH + 600);
      q.fillStyle = 'rgba(70,70,140,0.55)'; q.beginPath(); q.moveTo(1560, 160); q.lineTo(1860, 160); q.lineTo(1560, 1080); q.lineTo(1080, 1080); q.closePath(); q.fill();
      q.fillStyle = '#fff'; q.fillRect(RM.win[0], RM.win[1], RM.win[2], RM.win[3]);
    }
    q.globalCompositeOperation = 'source-over';
  }
  function roomLit(g, s, cam, M) {
    // 光照贴图比房间四周多出一圈（镜头推到房间外时也是同样的暗）
    const c = LC(s, M ? 'rm-light-m2' : 'rm-light-n2', VW + 800, VH + 600, (q) => { q.translate(400, 300); roomLight(q, M); }, 0.25);
    inCam(g, cam, 1, (q) => { const m = q.globalCompositeOperation; q.globalCompositeOperation = 'multiply'; q.drawImage(c, 0, 0, Math.min(c.width, (VW + 800) * s.k * 0.25), Math.min(c.height, (VH + 600) * s.k * 0.25), -400, -300, VW + 800, VH + 600); q.globalCompositeOperation = m; });
  }
  /** 书桌左后方那把椅子的椅背（(x, y) = 椅背中心；外套搭在它上面） */
  function chairBack(g, x, y) {
    g.fillStyle = '#5a3428'; g.strokeStyle = '#2a1418'; g.lineWidth = 3;
    g.fillRect(x - 70, y - 150, 14, 330); g.fillRect(x + 56, y - 150, 14, 330);
    g.fillRect(x - 76, y - 166, 152, 22); g.strokeRect(x - 76, y - 166, 152, 22);
    g.fillRect(x - 60, y - 90, 120, 12);
  }
  /** 搭在椅背上的外套：领子挂在椅背顶横梁上，衣身垂下，袖子自然垂着 */
  const COAT_CHAIR = { L: 282, dy: -160 };
  function coatOnChair(g, x, y, t) {
    coatHang(g, t, { C: [x, y + COAT_CHAIR.dy], L: COAT_CHAIR.L, face: -1, flap: 0.06, seed: 3 });
  }
  function clockHands(g, s) {
    const cx = 1340, cy = 214, beat = Math.floor(s.beat);
    const sec = beat * (TAU / 60), min = 1.9 * TAU / 12 * 0 + (TAU * 47) / 60 + s.t * 0.002, hr = (TAU * 1.8) / 12;
    g.strokeStyle = '#2a1418'; g.lineCap = 'round';
    g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(hr) * 26, cy - Math.cos(hr) * 26); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(min) * 40, cy - Math.cos(min) * 40); g.stroke();
    g.strokeStyle = '#c8323a'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(sec) * 46, cy - Math.cos(sec) * 46); g.stroke();
    g.lineCap = 'butt';
  }
  /** 室内镜头的公共部分：背景 → 椅子外套 → 阿黛尔 → 书桌 → 灯光（正片叠底）→ 发光物 */
  function room(g, s, cam, o = {}) {
    const t = s.t, M = !!o.morning, base = o.base || { x: 960, y: 540, z: 1 }, res = o.res || 1.25;
    // 保底：先铺一层与墙同色的底，镜头推得很近、拍到房间外面时也不会透出上一帧
    g.fillStyle = M ? '#6a4a44' : '#1c1218'; g.fillRect(0, 0, VW, VH);
    baked(g, s, (M ? 'rm-back-m:' : 'rm-back-n:') + (o.key || 'w'), base, cam, 1, (q) => roomBack(q, M), res);
    inCam(g, cam, 1, (q) => {
      clockHands(q, s);
      chairBack(q, RM.chair[0], RM.chair[1]);
      if (!o.coatGone && !o.coatOff) coatOnChair(q, RM.chair[0], RM.chair[1], t);
      if (o.behind) o.behind(q);
      if (o.adele !== false) cast(q, 'adele-alter', Object.assign({ x: RM.adele[0], y: RM.adele[1], h: 560, pose: 'sit', outfit: 'home', t, expr: 'neutral', desk: RM.adele[1] - RM.desk[2] + 6, seat: RM.seat }, o.adele || {}));
      if (o.onAdele) o.onAdele(q); // 搭在她身上的东西（在书桌前板之后画，会被桌子挡住下半截）
    });
    baked(g, s, (M ? 'rm-front-m:' : 'rm-front-n:') + (o.key || 'w'), base, cam, 1, (q) => roomFront(q, M), res, [778, 476, 1622, 1052]);
    inCam(g, cam, 1, (q) => {
      // 货箱立在书桌右前方的地板上（比桌腿更靠近镜头）：倒下之后也不会被书桌挡住
      if (!o.noCrate) crateAt(q, s, o.crate || {});
      if (o.onDesk) o.onDesk(q);
    });
    roomLit(g, s, cam, M);
    inCam(g, cam, 1, (q) => {
      // 发光物：灯泡、光锥、尘埃
      if (!M) {
        const fl = o.flicker ?? 1;
        const [lx, ly] = RM.lamp;
        E.glow(q, lx + 18, ly + 6, 60 * fl, '255,236,200', 0.9 * fl);
        E.glow(q, lx, ly + 60, 380, '255,190,120', 0.22 * fl);
        q.save(); q.globalCompositeOperation = 'lighter';
        q.fillStyle = coneGrad(q);
        q.globalAlpha = 0.5 * fl; q.beginPath(); q.moveTo(lx - 10, ly + 2); q.lineTo(lx + 50, ly + 30); q.lineTo(lx + 60, RM.desk[2] - 6); q.lineTo(lx - 250, RM.desk[2] - 6); q.closePath(); q.fill();
        q.restore();
        dust(q, t, { x: lx - 260, y: ly, w: 330, h: RM.desk[2] - ly, n: 26, rgb: '255,220,170' });
      } else {
        sunShafts(q, t);
        dust(q, t, { x: 900, y: 300, w: 800, h: 700, n: 40, rgb: '255,236,200' });
      }
      if (o.after) o.after(q);
    });
  }
  function coneGrad(q) { const [lx, ly] = RM.lamp; return vg(q, ly, RM.desk[2], [[0, 'rgba(255,220,160,0.45)'], [1, 'rgba(255,200,130,0.12)']]); }
  function dust(q, t, o) {
    for (let i = 0; i < o.n; i++) {
      const x = o.x + fract(hash(61, i, 1) + t * 0.01 * (hash(61, i, 2) - 0.5)) * o.w + Math.sin(t * 0.5 + i) * 10;
      const y = o.y + fract(hash(61, i, 3) - t * 0.012 * (0.3 + hash(61, i, 4))) * o.h;
      const a = 0.35 + 0.35 * Math.sin(t * 1.7 + i * 2.3);
      q.globalAlpha = a; q.fillStyle = `rgb(${o.rgb})`; q.fillRect(x, y, 2.2, 2.2);
    }
    q.globalAlpha = 1;
  }
  function sunShafts(q, t) {
    q.save(); q.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const a = 0.08 + 0.04 * Math.sin(t * 0.4 + i * 1.7);
      q.fillStyle = `rgba(255,226,170,${a})`;
      const x0 = 1580 + i * 70, x1 = 1000 + i * 150;
      q.beginPath(); q.moveTo(x0, 170); q.lineTo(x0 + 40, 170); q.lineTo(x1 + 120, 1080); q.lineTo(x1, 1080); q.closePath(); q.fill();
    }
    q.restore();
  }

  // ---- 货箱在房间里：书桌右前方、窗下的地板上（箱底中心 RM.crate）
  //   o: { wob 摇晃角, lid 盖子被顶起 0..1, tip 倾倒 0..1（绕左下角往书桌那边倒）, peek(q) 箱里的东西, leak 缝里的粉光,
  //        lidAt: [x, y, rot]（盖子已经飞走：画在世界坐标里）| 'rest'（盖子躺在地板上） }
  const CRATE_SC = 0.86;
  const softShadow = () => spr('soft-shadow', 128, 32, (q) => { q.scale(1, 0.25); q.fillStyle = rg(q, 64, 64, 0, 64, [[0, 'rgba(24,8,14,0.6)'], [0.55, 'rgba(24,8,14,0.3)'], [1, 'rgba(24,8,14,0)']]); q.fillRect(0, 0, 128, 128); });
  /** 贴地的柔和接触阴影（中心 (x, y)，半宽 w） */
  function groundShadow(g, x, y, w, a = 1, h = 0.16) { if (a <= 0.01) return; withAlpha(g, a, (q) => q.drawImage(softShadow(), x - w, y - w * h, w * 2, w * h * 2)); }
  /** 箱子局部坐标（箱底中心为原点、箱子自身单位）→ 世界坐标；tip 为倾倒程度 */
  function crateToWorld(px, py, tip) {
    const [cx, cy] = RM.crate, a = -tip * PI / 2, u = (150 + px) * CRATE_SC, v = py * CRATE_SC;
    return [cx - 150 * CRATE_SC + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a)];
  }
  function lidAtWorld(g, s, x, y, rot) {
    groundShadow(g, x, Math.min(RM.crate[1] + 26, 1082), 150, clamp(1 - (1082 - y - 12) / 120) * 0.8);
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(CRATE_SC, CRATE_SC);
    g.drawImage(LC(s, 'crate-lid', 308, 28, lidArt, 1.6), -154, -14, 308, 28);
    g.restore();
  }
  function crateAt(g, s, o) {
    const [cx, cy] = RM.crate, sc = CRATE_SC;
    const body = LC(s, 'crate', 300, 230, crateArt, 1.6), lid = LC(s, 'crate-lid', 308, 28, lidArt, 1.6);
    const wob = o.wob || 0, tip = clamp(o.tip || 0, 0, 1.2);
    // 接触阴影：立着时在箱底，倒下后在侧面（倒的过程中跟着移过去）
    const k = clamp(tip);
    groundShadow(g, lerp(cx, cx - 150 * sc - 115 * sc, k), cy + 2, lerp(150, 118, k) * sc * 1.08, 0.9 - 0.25 * Math.sin(PI * k));
    g.save(); g.translate(cx, cy);
    // 倾倒：绕左下角转
    if (tip) { g.translate(-150 * sc, 0); g.rotate(-tip * PI / 2); g.translate(150 * sc, 0); }
    else if (wob) { const piv = wob > 0 ? 150 : -150; g.translate(piv * sc, 0); g.rotate(wob); g.translate(-piv * sc, 0); }
    g.scale(sc, sc);
    if (o.peek) o.peek(g);
    g.drawImage(body, -150, -230, 300, 230);
    // 盖子（还在箱子上时）
    const lift = o.lid || 0;
    if (!o.lidAt) { g.save(); g.translate(-154, -230 - lift * 16); g.rotate(-lift * 0.12); g.drawImage(lid, 0, -24, 308, 28); g.restore(); }
    if (o.leak) { additive(g, (q) => { q.globalAlpha = o.leak; q.fillStyle = hg(q, -150, 150, [[0, 'rgba(255,150,210,0)'], [0.5, 'rgba(255,170,220,0.9)'], [1, 'rgba(255,150,210,0)']]); q.fillRect(-150, -236 - lift * 16, 300, 8 + lift * 10); q.globalAlpha = 1; }); }
    g.restore();
    if (o.lidAt === 'rest') lidAtWorld(g, s, LID.rest[0], LID.rest[1], 0);
    else if (o.lidAt) lidAtWorld(g, s, o.lidAt[0], o.lidAt[1], o.lidAt[2]);
  }

  /* =========================================================
   * 镜头 3 · 深夜的标本室（14.10 → 18.27）
   * ========================================================= */
  function shotDesk(g, s) {
    const t = s.t, k = ease.inOut(clamp(s.lt / 4.2));
    const cam = { x: lerp(960, 1010, k), y: lerp(560, 575, k), z: lerp(1.0, 1.08, k), ...hand(s, 7, 4, 0.3) };
    // 写标签 → 伸个懒腰打哈欠（第 5 拍起）→ 又低头写，但眼皮开始打架
    const lt = s.lt, yawn = lt > BEAT * 4.6 && lt < BEAT * 6.6;
    room(g, s, cam, {
      // 她坐在书桌前（官方小人的坐姿：闭着眼、困得直点头）——写标签的那只手在下一个特写里
      adele: { pose: 'sit', expr: lt > BEAT * 6.6 ? 'sleepy' : 'neutral', look: [0.6, 0.5] },
      onDesk: (q) => { bottle(q, s, 1440, RM.desk[2] - 4, 120, 0); fizz(q, t, { t0: s.shot.t0 - 1, x: 1440, y: RM.desk[2] - 118, n: 10, dur: 6, speed: 30, r: 3, rise: 30, life: 2.4, ang: -PI / 2, spread: 0.3 }); labelCard(q, 1238, RM.desk[2] - 8, 0.9, s, 0.2); },
      crate: { leak: 0.12 + 0.1 * Math.sin(t * 2) },
    });
    vig(g, s, 0.5);
  }
  /** 桌上的标签卡（远景用的小卡片） */
  function labelCard(g, x, y, sc, s, write, o = {}) {
    g.save(); g.translate(x, y); g.rotate(o.rot ?? -0.06); g.scale(sc, sc);
    g.fillStyle = '#fbf5e8'; rrect(g, -60, -40, 120, 40, 4); g.fill(); g.strokeStyle = '#6a5040'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#c8323a'; g.fillRect(-60, -40, 6, 40);
    g.fillStyle = 'rgba(60,40,40,0.6)'; g.fillRect(-44, -30, 60, 3); g.fillRect(-44, -18, 44 * clamp(write + 0.3), 3);
    if (o.hoof) { g.fillStyle = '#ff7fb0'; g.beginPath(); g.ellipse(34, -14, 5, 7, -0.2, 0, TAU); g.ellipse(45, -15, 5, 7, 0.2, 0, TAU); g.fill(); }
    g.restore();
  }

  /* ---------- 特写：标签卡（设计坐标里画一张大卡片） ---------- */
  function deskTop(q) {
    q.fillStyle = vg(q, 0, VH, [[0, '#3a2018'], [0.35, '#6a3c26'], [1, '#8a5436']]); q.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 70; i++) {
      const y = hash(5, i, 1) * VH, a = 0.05 + hash(5, i, 2) * 0.08;
      q.strokeStyle = `rgba(40,16,8,${a})`; q.lineWidth = 1 + hash(5, i, 3) * 3;
      q.beginPath(); q.moveTo(-20, y); for (let x = 0; x <= VW + 40; x += 80) q.lineTo(x, y + Math.sin(x * 0.004 + i) * 14 + (x / VW) * 40); q.stroke();
    }
    // 远处（虚）的标本盘与书本：只画糊的色块
    q.fillStyle = 'rgba(40,20,20,0.5)'; rrect(q, 1320, 90, 520, 90, 20); q.fill();
    q.fillStyle = 'rgba(120,40,50,0.45)'; rrect(q, 80, 60, 400, 70, 14); q.fill();
  }
  function bigLabel(q) {
    // 1000×560 的卡片（中心 500,280）
    q.fillStyle = 'rgba(20,8,4,0.35)'; rrect(q, 26, 34, 960, 520, 26); q.fill();
    q.fillStyle = '#fbf4e4'; rrect(q, 10, 10, 960, 520, 26); q.fill();
    q.fillStyle = '#c8323a'; q.fillRect(10, 36, 34, 470);
    q.strokeStyle = '#6a5040'; q.lineWidth = 4; rrect(q, 10, 10, 960, 520, 26); q.stroke();
    q.fillStyle = '#6a5040'; q.beginPath(); q.arc(110, 80, 16, 0, TAU); q.fill(); q.fillStyle = '#fbf4e4'; q.beginPath(); q.arc(110, 80, 9, 0, TAU); q.fill();
    E.text(q, 'SIESTA VOLCANO MUSEUM · SPECIMEN', 540, 92, { font: 'display', size: 30, weight: 700, spacing: 4, color: '#8a5a48' });
    q.strokeStyle = 'rgba(106,80,64,0.5)'; q.lineWidth = 3;
    for (const y of [210, 330, 450]) { q.beginPath(); q.moveTo(110, y); q.lineTo(920, y); q.stroke(); }
    E.text(q, '名称', 160, 196, { font: 'sans', size: 30, weight: 700, color: '#8a5a48', align: 'left' });
    E.text(q, '编号', 160, 316, { font: 'sans', size: 30, weight: 700, color: '#8a5a48', align: 'left' });
    E.text(q, '产地', 160, 436, { font: 'sans', size: 30, weight: 700, color: '#8a5a48', align: 'left' });
    E.text(q, '浮石 · Pumice', 300, 196, { font: 'hand', size: 60, color: '#2a2440', align: 'left' });
    E.text(q, '旧汐斯塔火山', 300, 436, { font: 'hand', size: 50, color: '#2a2440', align: 'left' });
  }
  /** 一只握着笔的手（右手，从右上方伸进来）。(x, y) 为笔尖 */
  function penHand(g, x, y, sc, lean) {
    g.save(); g.translate(x, y); g.scale(sc, sc); g.rotate(lean);
    // 笔
    g.strokeStyle = '#2a2a3a'; g.lineWidth = 16; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(190, -250); g.stroke();
    g.strokeStyle = '#d8b060'; g.lineWidth = 16; g.beginPath(); g.moveTo(150, -198); g.lineTo(166, -219); g.stroke();
    g.fillStyle = '#e8d8b0'; g.beginPath(); g.moveTo(-3, 3); g.lineTo(14, -30); g.lineTo(-10, -22); g.closePath(); g.fill();
    // 手
    g.fillStyle = '#ffe2d0'; g.strokeStyle = '#6a3a30'; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(40, -60); g.bezierCurveTo(30, -110, 80, -150, 130, -140); g.bezierCurveTo(200, -150, 300, -130, 340, -60); g.lineTo(420, 20); g.lineTo(300, 110); g.bezierCurveTo(220, 60, 150, 40, 110, 10); g.bezierCurveTo(80, -5, 50, -20, 40, -60); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(52, -48); g.bezierCurveTo(70, -30, 100, -26, 118, -40); g.stroke();
    g.beginPath(); g.moveTo(130, -140); g.bezierCurveTo(150, -110, 150, -90, 128, -70); g.stroke();
    g.fillStyle = 'rgba(255,160,150,0.35)'; g.beginPath(); g.ellipse(200, -70, 60, 30, 0.3, 0, TAU); g.fill();
    // 袖口（家居服：深色袖子 + 淡紫的袖口）
    g.fillStyle = '#2c2939'; g.beginPath(); g.moveTo(330, -110); g.lineTo(470, 20); g.lineTo(360, 150); g.lineTo(250, 40); g.closePath(); g.fill(); g.strokeStyle = '#141220'; g.stroke();
    g.fillStyle = '#8f7fd0'; g.beginPath(); g.moveTo(330, -110); g.lineTo(356, -86); g.lineTo(276, 64); g.lineTo(250, 40); g.closePath(); g.fill(); g.stroke();
    g.restore(); g.lineCap = 'butt';
  }
  function shotLabel(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 960, y: 540, z: 1 + lt * 0.03, ...hand(s, 9, 3, 0.5) };
    inCam(g, cam, 1, (q) => q.drawImage(LC(s, 'desktop', VW, VH, deskTop, 0.5), -60, -40, VW + 120, VH + 80)); // 桌面和上面的标签卡同一层
    inCam(g, cam, 1, (q) => {
      q.save(); q.translate(1010, 560); q.rotate(-0.07);
      q.drawImage(LC(s, 'biglabel', 1000, 560, bigLabel, 1), -500, -280, 1000, 560);
      // 「No. 2」「7」一笔一笔写出来，然后笔尖滑成一条困倦的线
      const w1 = clamp(lt / 0.34), w2 = clamp((lt - 0.36) / 0.24), trail = clamp((lt - 0.62) / 0.4);
      q.save(); q.beginPath(); q.rect(-200, -60, 160 * w1 + 150 * w2, 90); q.clip();
      E.text(q, 'No. 27', -200, 36, { font: 'hand', size: 76, color: '#2a2440', align: 'left' });
      q.restore();
      let px = -200 + 160 * w1 + 150 * w2, py = 10;
      if (trail > 0) {
        q.strokeStyle = '#2a2440'; q.lineWidth = 5; q.lineCap = 'round'; q.beginPath(); q.moveTo(80, 12);
        for (let i = 1; i <= 24 * trail; i++) { const u = i / 24; q.lineTo(80 + u * 190, 12 + u * u * 150 + Math.sin(u * 20) * 10 * (1 - u)); }
        q.stroke(); q.lineCap = 'butt';
        px = 80 + trail * 190; py = 12 + trail * trail * 150;
      }
      pumice(q, -330, 190, 110, { seed: 27 });
      q.restore();
      // 手：写字时轻轻抖动，写完后慢慢放松滑下去
      const jig = lt < 0.62 ? Math.sin(lt * 60) * 4 : 0;
      const hx = 1010 + (px * Math.cos(-0.07) - py * Math.sin(-0.07)), hy = 560 + (px * Math.sin(-0.07) + py * Math.cos(-0.07)) + jig;
      penHand(q, hx, hy, 0.95, -0.05 + trail * 0.25);
      // 汽水瓶底 + 气泡（右上角）
      bottle(q, s, 1780, 380, 520, 0.02);
      fizz(q, t, { t0: s.shot.t0 - 1.5, x: 1790, y: 150, n: 14, dur: 4, speed: 40, r: 9, rise: 50, life: 2, spread: 0.4 });
    });
    // 台灯的暖光
    E.glow(g, 1200, 300, 900, '255,190,120', 0.28);
    s.post.fill(g, '#2a1020', 0.12, 'multiply');
    vig(g, s, 0.6);
  }

  /* ---------- 睡着了（19.32 → 20.36） ---------- */
  function shotAsleep(g, s) {
    const t = s.t, lt = s.lt, k = ease.out(clamp(lt / 1.1));
    const cam = { x: lerp(1150, 1170, k), y: lerp(600, 610, k), z: lerp(1.45, 1.52, k), ...hand(s, 11, 3, 0.3) };
    // 台灯在拍点上闪两下
    const fl = 1 - 0.45 * Math.exp(-Math.pow((t - (s.shot.t0 + BEAT)) * 9, 2)) - 0.3 * Math.exp(-Math.pow((t - (s.shot.t0 + BEAT * 1.4)) * 10, 2));
    room(g, s, cam, {
      key: 'a', base: { x: 1160, y: 605, z: 1.48 }, res: 1.06, flicker: fl,
      adele: { pose: 'sit', expr: 'closed' }, // 坐在椅子上睡着了（官方小人的坐姿本来就是闭着眼的）
      onDesk: (q) => { bottle(q, s, 1440, RM.desk[2] - 4, 120, 0); labelCard(q, 1238, RM.desk[2] - 8, 0.9, s, 1); },
      crate: { leak: 0.2 + 0.2 * s.pulse(4) },
      after: (q) => {
        // 睡着的“Zz”
        for (let i = 0; i < 3; i++) { const u = fract(lt * 0.7 + i / 3); withAlpha(q, Math.sin(PI * u) * 0.8, (qq) => E.text(qq, 'z', 1220 + u * 60 + i * 8, 470 - u * 90, { font: 'hand', size: 22 + u * 26, color: '#ffe8f0' })); }
      },
    });
    vig(g, s, 0.55);
  }

  /* ---------- 货箱（20.36 → 22.44）：一拍一晃，盖子顶开一条缝，粉光漏出来，小羊探头 ---------- */
  function shotCrate(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const build = clamp(lt / 2.08);
    const cam = { x: 1700, y: 922 - build * 10, z: 2.0 + build * 0.12, ...shake(s, 2 + build * 6 * s.pulse(5), 5) };
    const kick = s.pulse(7) * (0.3 + build);
    const wob = Math.sin(bt * PI) * 0.035 * kick;
    const lid = 0.15 + build * 0.8 + kick * 0.5;
    room(g, s, cam, {
      key: 'c', base: { x: 1700, y: 922, z: 2.06 }, res: 1.08, adele: false,
      crate: {
        wob, lid, leak: 0.35 + build * 0.65,
        peek: (q) => {
          // 小羊从箱子里探头（被箱子前板挡住下半身）
          const up = win(lt, 0.95, 1.2, 1.55, 1.7) * 70 + win(lt, 1.72, 1.85, 2.3, 2.4) * 40;
          if (up > 1) { lamb(q, s, -40, -150 - up, 150, { v: 0, expr: 'surprise' }); lamb(q, s, 70, -150 - up * 0.6, 130, { v: 2, flip: true }); }
          // 箱子里一闪一闪的眼睛
          for (let i = 0; i < 4; i++) { const a = win(lt, 0.2 + i * 0.25, 0.3 + i * 0.25, 1.9, 2.1) * (0.6 + 0.4 * Math.sin(t * 9 + i)); if (a > 0.05) { q.fillStyle = `rgba(255,220,240,${a})`; q.beginPath(); q.ellipse(-110 + i * 70, -238 - lid * 8, 5, 3, 0, 0, TAU); q.fill(); } }
        },
      },
      after: (q) => {
        // 缝里射出的粉光
        const [cx, cy] = RM.crate;
        q.save(); q.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const a = (0.08 + build * 0.14) * (0.6 + 0.4 * Math.sin(t * 5 + i * 1.7));
          const x = cx - 110 + i * 44, y = cy - 200;
          q.fillStyle = `rgba(255,170,220,${a})`; q.beginPath(); q.moveTo(x - 10, y); q.lineTo(x + 10, y); q.lineTo(x + 40 + (i - 2.5) * 30, y - 260); q.lineTo(x - 40 + (i - 2.5) * 30, y - 260); q.closePath(); q.fill();
        }
        q.restore();
        E.glow(q, cx, cy - 200, 220, '255,150,210', 0.3 + build * 0.4);
        // 蹦出来的稻草
        for (let i = 0; i < 10; i++) { const ph = fract(bt + hash(71, i)); const hh = 4 * ph * (1 - ph); q.strokeStyle = '#e8c870'; q.lineWidth = 3; q.save(); q.translate(cx - 120 + hash(72, i) * 240, cy - 200 - hh * 60 * build); q.rotate(hash(73, i) * 3 + ph * 4); q.beginPath(); q.moveTo(-8, 0); q.lineTo(8, 0); q.stroke(); q.restore(); }
      },
    });
    vig(g, s, 0.6);
  }
  const T0beat = (s) => s.T.beatAt(s.shot.t0);

  /* ---------- 翻倒（22.44 → 26.61）：小羊和汽水瓶滚了一地，气泡变成粉色的雾 ---------- */
  // 箱子绕左下角往书桌那边倒下；原来的箱顶变成朝左的箱口，mouth 为箱口中心
  const TIP = { t: D[10], pivot: [RM.crate[0] - 150 * CRATE_SC, RM.crate[1]], mouth: crateToWorld(0, -230, 1) };
  // 盖子：倒到 18% 时被甩出去，空中转一整圈，落在书桌右前方的地板上，弹两下躺平（之后几个镜头都躺在那里）
  const LID = (() => {
    const tr = 0.18, tip = ease.in(tr / 0.32), c = Math.cos(-0.12), sn = Math.sin(-0.12);
    const lc = [-154 + 154 * c + 10 * sn, -246 + 154 * sn - 10 * c]; // 掀开时盖子中心在箱子局部坐标里的位置
    const p0 = crateToWorld(lc[0], lc[1], tip), floor = 1072, vx = -430, vy = -760, G = 2600;
    const t1 = (-vy + Math.sqrt(vy * vy + 2 * G * (floor - p0[1]))) / G;
    return { t0: D[10] + tr, p0, rot0: -tip * PI / 2 - 0.12, floor, vx, vy, t1, rest: [bounce(4, p0[0], p0[1], vx, vy, floor, G, 0.35, 0.55).x, floor] };
  })();
  function lidFlight(t) {
    const age = t - LID.t0;
    if (age < 0) return null;
    const b = bounce(age, LID.p0[0], LID.p0[1], LID.vx, LID.vy, LID.floor, 2600, 0.35, 0.55);
    const rot = b.n === 0 ? lerp(LID.rot0, -TAU, age / LID.t1) : 0.06 * Math.sin((age - LID.t1) * 24) * Math.exp(-(age - LID.t1) * 7);
    return [b.x, b.y, rot];
  }
  const LAMBS_OUT = 20, DESK_FOOT = RM.desk[2] - 12;
  function tumbleLambs(s, t) {
    // 每只小羊：从箱口喷出 → 抛物线正好落在自己的落点（桌面上，或书桌前面的地板上）→ 弹两下 → 按拍子蹦
    const out = [], G = 2600;
    for (let i = 0; i < LAMBS_OUT; i++) {
      const te = TIP.t + 0.12 + i * 0.07, age = t - te;
      if (age < 0) continue;
      const onDesk = i % 6 === 2;
      const x0 = TIP.mouth[0] - 10, y0 = TIP.mouth[1] + (hash(90, i, 4) - 0.5) * 80;
      const tx = onDesk ? 880 + hash(90, i, 1) * 560 : TIP.mouth[0] - 160 - hash(90, i, 2) * 860;
      const floor = onDesk ? DESK_FOOT : 1050 + hash(90, i, 1) * 60;
      const T = onDesk ? 0.64 + hash(90, i, 3) * 0.18 : 0.4 + hash(90, i, 3) * 0.28;
      const vx = (tx - x0) / T, vy = (floor - y0 - 0.5 * G * T * T) / T;
      const b = bounce(age, x0, y0, vx, vy, floor, G, 0.42, 0.75);
      let x = b.x, y = b.y, sq = b.sq, spin = b.n === 0 ? -age * (5 + hash(90, i, 5) * 6) : 0, pose = b.n === 0 ? 'jump' : 'stand';
      const settle = T + 0.6;
      if (age > settle) {
        // 落定后：以拍为单位原地 / 小步跳
        const ph = fract(s.beat * (i % 3 === 0 ? 0.5 : 1) + hash(90, i, 6));
        const [hy, hsq] = hop(ph);
        const k2 = clamp((age - settle) / 0.4);
        y -= hy * (30 + hash(90, i, 7) * 40) * k2; sq = hsq * k2; pose = hy > 0.3 ? 'jump' : 'stand';
        x += (Math.sin((age - settle) * 0.6 + i) - Math.sin(i)) * 30 * k2;
      }
      const V = (onDesk ? 70 : 50 + (floor - 900) * 0.2) * (0.88 + hash(90, i, 8) * 0.24);
      out.push({ x, y, V, sq, spin, pose, flip: vx < 0 && i % 4 !== 1, expr: i % 3 === 0 ? 'laugh' : i % 3 === 1 ? 'surprise' : 'neutral', i, desk: onDesk, fy: floor });
    }
    return out.sort((a, b) => a.fy - b.fy || a.y - b.y);
  }
  function shotTumble(g, s) {
    const t = s.t, lt = s.lt;
    // 倒下：前 0.32 秒加速倒地，然后在着地的那条棱上往回晃两下（只往回晃，不会有角陷进地板）
    const tipK = clamp(lt / 0.32), tip = tipK < 1 ? ease.in(tipK) : 1 - Math.abs(Math.sin((lt - 0.32) * 22)) * Math.exp(-(lt - 0.32) * 7) * 0.05;
    const k = ease.inOut(clamp((lt - 0.6) / 3.4));
    const cam = { x: lerp(1330, 1100, k), y: lerp(790, 660, k), z: lerp(1.42, 1.08, k), ...shake(s, 14 * Math.exp(-lt * 3) + 3 * s.acc(0.2), 9) };
    const lambs = tumbleLambs(s, t);
    const fog = sst(0.6, 3.6, lt);
    room(g, s, cam, {
      key: 'w', adele: { pose: 'sit', expr: 'closed' },
      crate: { tip, lid: 1, lidAt: lidFlight(t) },
      onDesk: (q) => { bottle(q, s, 1440, RM.desk[2] - 4, 120, 0); labelCard(q, 1238, RM.desk[2] - 8, 0.9, s, 1); for (const L of lambs) if (L.desk && L.y < RM.desk[2]) lamb(q, s, L.x, L.y, L.V, { v: L.i, sq: L.sq, spin: L.spin, flip: L.flip, pose: L.pose, expr: L.expr, glow: 1 }); },
      after: (q) => {
        // 汽水瓶：从箱口旋转着滑出去，躺在书桌前面的地板上，瓶口喷气泡
        for (let j = 0; j < 5; j++) {
          const te = TIP.t + 0.1 + j * 0.16, a = t - te;
          if (a < 0) continue;
          const x = TIP.mouth[0] - (300 + j * 110) * (1 - Math.exp(-a * 2.2)), y = 1056 + j * 13;
          const rot = PI / 2 + (j % 2 ? 1 : -1) * (8 + j * 2) * (1 - Math.exp(-a * 1.3)) / 1.3;
          bottle(q, s, x, y, 96, rot);
          const [mx, my] = bottleMouth(x, y, 96, rot);
          fizz(q, t, { t0: te, x: mx, y: my, n: 26, dur: 2.6, speed: 520, r: 9, rise: 160, life: 1.3, ang: rot - PI / 2, spread: 0.5, seed: 50 + j });
        }
        for (const L of lambs) {
          if (L.desk && L.y < RM.desk[2]) continue; // 已经在桌面上的（上面画过了）
          if (!L.desk) groundShadow(q, L.x, L.fy + 2, L.V * 0.45, 0.5 * clamp(1 - (L.fy - L.y) / 90));
          lamb(q, s, L.x, L.y, L.V, { v: L.i, sq: L.sq, spin: L.spin, flip: L.flip, pose: L.pose, expr: L.expr, glow: 1 });
        }
        // 冲天的气泡 → 粉雾
        risingBubbles(q, t, { t0: TIP.t, n: 70, x: 700, w: 1000, y0: 1060, h: 900, seed: 3, a: 0.8 });
        withAlpha(q, fog, (qq) => { fogBand(qq, t, { n: 9, seed: 21, x0: 300, x1: 1900, y0: 850, y1: 1080, w: 1000, h: 320, speed: 30, rgb: '255,176,220', a: 0.55 }); fogBand(qq, t, { n: 7, seed: 22, x0: 300, x1: 1900, y0: 60, y1: 500, w: 1100, h: 380, speed: 18, rgb: '255,196,232', a: 0.4 }); });
      },
    });
    additive(g, (q) => withAlpha(q, 0.18 * fog, (qq) => qq.drawImage(hazeSpr('255,120,190'), 0, 200, VW, 880)));
    vig(g, s, 0.5);
  }
  /** 从下往上冒的大量气泡（越往上越大越淡） */
  function risingBubbles(q, t, o) {
    for (let i = 0; i < o.n; i++) {
      const te = o.t0 + hash(o.seed, i, 1) * 2.4, age = t - te;
      if (age < 0) continue;
      const life = 2.2 + hash(o.seed, i, 2) * 2, k = age / life;
      if (k > 1 && !o.loop) continue;
      const kk = o.loop ? fract(k) : k;
      const x = o.x + hash(o.seed, i, 3) * o.w + Math.sin(age * 2 + i) * 16, y = o.y0 - kk * o.h * (0.7 + hash(o.seed, i, 4) * 0.5);
      bubble(q, x, y, 5 + kk * 16 * hash(o.seed, i, 5) + 4, (o.a ?? 0.8) * Math.sin(PI * Math.min(1, kk * 1.05)));
    }
  }

  /* ---------- 惊醒（26.61 → 28.70） ---------- */
  function shotWake(g, s) {
    const t = s.t, lt = s.lt;
    const jolt = ease.back(clamp(lt / 0.25));
    const cam = { x: 1150, y: 600 - jolt * 10, z: 1.5 + lt * 0.02, ...shake(s, 8 * Math.exp(-lt * 6) + 2, 11) };
    room(g, s, cam, {
      key: 'a', base: { x: 1160, y: 605, z: 1.48 }, res: 1.06,
      crate: { tip: 1, lidAt: 'rest' }, // 和上一个镜头接上：箱子倒着，盖子躺在地板上
      // 惊醒：一下子从椅子上站起来（站在书桌后面），双手捂在胸前（官方小人的 Interact）
      adele: { pose: 'wave', expr: 'surprise', look: [-0.5, 0.2] },
      onDesk: (q) => {
        bottle(q, s, 1440, RM.desk[2] - 4, 120, 0); labelCard(q, 1238, RM.desk[2] - 8, 0.9, s, 1);
        // 桌上的小羊：一拍一跳，一只在台灯上晃
        for (let i = 0; i < 4; i++) { const ph = fract(s.beat + i * 0.25); const [hy, sq] = hop(ph); lamb(q, s, 940 + i * 120, RM.desk[2] - 10 - hy * 70, 74, { v: i + 1, sq, flip: i % 2 === 0, glow: 1, pose: hy > 0.3 ? 'jump' : 'stand', expr: i % 2 ? 'laugh' : 'neutral' }); }
      },
      after: (q) => {
        // “！”
        const ex = clamp(lt / 0.15) * (1 - clamp((lt - 1.2) / 0.3));
        if (ex > 0) { q.strokeStyle = `rgba(255,236,246,${ex})`; q.lineWidth = 6; q.lineCap = 'round'; for (let i = 0; i < 3; i++) { const a = -PI / 2 + (i - 1) * 0.5; q.beginPath(); q.moveTo(1150 + Math.cos(a) * 250, 380 + Math.sin(a) * 60); q.lineTo(1150 + Math.cos(a) * 300, 380 + Math.sin(a) * 60 - 40); q.stroke(); } q.lineCap = 'butt'; }
        risingBubbles(q, t, { t0: TIP.t, n: 60, x: 700, w: 1000, y0: 1060, h: 900, seed: 4, a: 0.7, loop: true });
        fogBand(q, t, { n: 8, seed: 23, x0: 500, x1: 1800, y0: 780, y1: 1000, w: 900, h: 300, speed: 26, rgb: '255,176,220', a: 0.5 });
        fogBand(q, t, { n: 6, seed: 24, x0: 500, x1: 1800, y0: 120, y1: 400, w: 900, h: 300, speed: 18, rgb: '255,196,232', a: 0.35 });
      },
    });
    additive(g, (q) => withAlpha(q, 0.2, (qq) => qq.drawImage(hazeSpr('255,120,190'), 0, 200, VW, 880)));
    vig(g, s, 0.5);
  }

  /* ---------- 外套被叼走（28.70 → 30.78）：三只小羊从地板上蹦起来，叼住椅背上的外套，把它展开着“飞”向门口；门开了，粉光涌进来 ---------- */
  const HEIST = { V: 70, grab: [0.08, 0.5], fly: [0.5, 2.05], door: [155, 612] };
  /** 外套离开椅背以后：领口的位置、袖口的张开 / 下垂程度（都只由 lt 决定）。刚离开时和挂在椅背上一模一样，然后袖子被拽开 */
  function heistCoat(lt) {
    const [chx, chy] = RM.chair, C0 = [chx, chy + COAT_CHAIR.dy];
    const f = clamp((lt - HEIST.fly[0]) / (HEIST.fly[1] - HEIST.fly[0])), fly = f * f * (3 - 2 * f);
    const x = lerp(C0[0], HEIST.door[0], fly), y = lerp(C0[1], HEIST.door[1], fly) - Math.sin(PI * fly) * 70 - 22 * sst(0, 0.25, lt - HEIST.fly[0]);
    const open = sst(0, 0.22, f), close = sst(0.62, 1, f);
    return { C: [x, y], spread: lerp(lerp(0.43, 0.78, open), 0.42, close), drop: lerp(lerp(0.65, 0.2, open), 0.3, close), fly: f };
  }
  function shotHeist(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp((lt - 0.3) / 1.7));
    const cam = { x: lerp(820, 420, k), y: lerp(640, 600, k), z: lerp(1.25, 1.3, k), ...hand(s, 13, 5, 0.6) };
    const V = HEIST.V, L = COAT_CHAIR.L;
    const grab = ease.inOut(clamp((lt - HEIST.grab[0]) / (HEIST.grab[1] - HEIST.grab[0])));
    const lifted = lt >= HEIST.fly[0];
    const hc = heistCoat(lt);
    const door = clamp((lt - 1.3) / 0.5);
    // 她：先在桌子后面愣住 → 往右绕出去（跑出画面右边）→ 过一会儿从画面右边、桌子前面追进来（步频按跑的速度算，脚不打滑）
    const behind = lt < 1.1;
    const runB = { h: 560, pose: 'run', speed: 1.8 }, runF = { h: 640, pose: 'run', speed: 1.5 };
    const gait = (o, fb) => (E.cast && E.cast.gait ? E.cast.gait('adele-alter', o).speed : fb);
    const vB = gait(runB, 780), vF = gait(runF, 745);
    const bx = lt < 0.55 ? 1150 : 1150 + vB * (lt - 0.55);
    const go = sst(0, 0.18, hc.fly); // 刚离开椅背的那一刻和挂着时完全一样，再慢慢飘起来
    const trioOpt = (parts) => ({ parts, spread: hc.spread, drop: hc.drop, seed: 3, flap: lerp(0.06, 0.8, go), lean: -0.22 * (1 - go), ground: 930, bob: (i) => Math.sin(t * 5.2 + i * 2.1) * V * 0.1 * go });
    room(g, s, cam, {
      // 这个镜头往左摇到门口（世界 x≈-320），用自己的基准机位烘焙房间，左边不会露出没烘到的一条
      key: 'h', base: { x: 640, y: 620, z: 1.12 },
      adele: behind ? { x: bx, pose: lt < 0.55 ? 'stand' : 'run', speed: runB.speed, expr: 'surprise', flip: lt < 0.55, look: [-1, 0.2] } : false,
      coatOff: lifted,
      crate: { tip: 1, lidAt: 'rest' },
      behind: (q) => {
        // 门开了：门框里先铺一层不透明的粉（遮住原来的门板），亮光在光照之后再叠
        if (door > 0) withAlpha(q, door, (qq) => { qq.fillStyle = vg(qq, 302, 898, [[0, '#ffd6ec'], [0.6, '#ffc0e0'], [1, '#ffe8f4']]); qq.fillRect(62, 302, 186, 596); });
        // 外套受屋里灯光影响（和挂在椅背上时一样），发光的小羊画在光照之后
        if (lifted) coatTrio(q, s, t, hc.C, L, V, -1, trioOpt('coat'));
      },
      after: (q) => {
        // 门：门框里一片粉色的光，光铺到地板上
        if (door > 0) {
          q.save(); q.globalCompositeOperation = 'lighter';
          q.fillStyle = `rgba(255,170,215,${0.7 * door})`; q.fillRect(62, 302, 186, 596);
          q.fillStyle = `rgba(255,150,205,${0.35 * door})`; q.beginPath(); q.moveTo(62, 898); q.lineTo(248, 898); q.lineTo(520, 1080); q.lineTo(-120, 1080); q.closePath(); q.fill();
          q.restore();
          E.glow(q, 155, 600, 420, '255,160,210', 0.7 * door);
        }
        if (!lifted) {
          // 三只羊从椅子脚下的地板上蹦起来：两只叼住垂着的袖口，一只叼住领后的挂环
          const C = hc.C, spots = [[C[0] - 0.43 * L, C[1] + 0.65 * L], [C[0], C[1] - V * 0.42], [C[0] + 0.43 * L, C[1] + 0.65 * L]];
          // 它们在书桌后面的地板上：书桌挡住的部分不画（只在桌子左边、桌面以上的地方可见）
          q.save(); q.beginPath(); q.rect(-600, -600, 600 + RM.desk[0], 2400); q.rect(-600, -600, 3600, 600 + RM.desk[2] - 18); q.clip();
          for (let i = 0; i < 3; i++) {
            const m = spots[i], fy = m[1] + 0.4 * V, floorY = 946 + i * 5;
            const gi = ease.inOut(clamp((lt - HEIST.grab[0] - i * 0.06) / (HEIST.grab[1] - HEIST.grab[0] - 0.12)));
            const y = lerp(floorY, fy, gi) - Math.sin(PI * gi) * (i === 1 ? 40 : 70);
            groundShadow(q, m[0] + 0.38 * V, floorY + 2, V * 0.45, 0.5 * (1 - gi));
            lamb(q, s, m[0] + 0.38 * V, y, V, { v: 3 + i, flip: true, pose: gi > 0.02 && gi < 0.98 ? 'jump' : 'stand', expr: 'laugh', glow: 1 });
          }
          q.restore();
        } else {
          const mouths = coatTrio(q, s, t, hc.C, L, V, -1, trioOpt('lambs'));
          for (const [x, y] of mouths) E.glow(q, x + 0.38 * V, y - 0.05 * V, V * 1.1, '255,160,210', 0.3);
        }
        // 门板（向屋里开，离镜头更近：挡在飞进门里的小羊和外套前面）
        if (door > 0) {
          q.fillStyle = '#5a3a30'; q.strokeStyle = '#2a1418'; q.lineWidth = 4;
          const w = 190 * (1 - door * 0.82);
          q.beginPath(); q.moveTo(60, 300); q.lineTo(60 + w, 300 - door * 40); q.lineTo(60 + w, 900 + door * 40); q.lineTo(60, 900); q.closePath(); q.fill(); q.stroke();
          fogBand(q, t, { n: 6, seed: 31, x0: 60, x1: 600, y0: 500, y1: 900, w: 700, h: 300, speed: 60, rgb: '255,190,230', a: 0.5 * door });
        }
        // 从桌子前面追进来的她
        if (!behind) cast(q, 'adele-alter', { x: 1640 - vF * (lt - 1.1), y: 1075, h: runF.h, pose: 'run', speed: runF.speed, outfit: 'home', t, expr: 'determined', flip: true, wind: 0.6, look: [-1, 0] });
        risingBubbles(q, t, { t0: TIP.t, n: 50, x: 200, w: 1300, y0: 1060, h: 900, seed: 5, a: 0.6, loop: true });
        fogBand(q, t, { n: 7, seed: 25, x0: 0, x1: 1500, y0: 820, y1: 1040, w: 900, h: 300, speed: 30, rgb: '255,176,220', a: 0.5 });
      },
    });
    additive(g, (q) => withAlpha(q, 0.2, (qq) => qq.drawImage(hazeSpr('255,120,190'), 0, 200, VW, 880)));
    vig(g, s, 0.5);
  }

  /* =========================================================
   * 梦里的灯笼街：一整面山坡上的粉彩小房子（立面图，分 3 层视差），大粉月亮，灯笼串，粉雾
   * 世界宽 0..3840；近层房子的地面 y = 880（街面），街面往前是散步道
   * ========================================================= */
  const PASTEL = ['#f3a9c4', '#f6c3a4', '#cbb2ec', '#a9ddd2', '#f3dc9e', '#a9c6ef', '#f4e6ee', '#eea6a0', '#d9c2f0'];
  const SHUTTER = ['#3e8a8a', '#4a6ab0', '#7a5ab0', '#c0506a', '#3e7a5a'];
  function mkRow(seed, x0, x1, base, hmin, hmax, wmin, wmax) {
    const R = E.rng(seed), out = [];
    let x = x0;
    while (x < x1) {
      const w = wmin + R() * (wmax - wmin), h = hmin + R() * (hmax - hmin);
      out.push({ x, w, top: base - h, base, col: pick(PASTEL, R()), roof: R(), style: R(), seed: (R() * 1e6) | 0 });
      x += w + (R() < 0.35 ? 8 + R() * 30 : -R() * 12);
    }
    return out;
  }
  const TOWN = {
    far: mkRow(301, -200, 4100, 640, 120, 260, 90, 170),
    mid: mkRow(302, -200, 4100, 760, 220, 400, 150, 260),
    // 近层往左多盖几栋（屋顶镜头开头机位在 x≈-300，原来的第一栋从 -200 开始，左边会空出一条）；原有的房子一栋不变
    near: mkRow(313, -1300, -200, 880, 330, 560, 210, 340).concat(mkRow(303, -200, 4100, 880, 330, 560, 210, 340)),
  };
  /** 近层屋顶的高度（给屋顶上跳的小羊用） */
  function roofY(x) {
    let best = 880;
    for (const h of TOWN.near) if (x >= h.x - 4 && x <= h.x + h.w + 4) best = Math.min(best, roofTop(h, x));
    return best;
  }
  function roofTop(h, x) {
    if (h.roof < 0.42) { const c = h.x + h.w / 2, hw = h.w / 2 + 10; return h.top - Math.max(0, 1 - Math.abs(x - c) / hw) * h.w * 0.26; }
    if (h.roof < 0.55) { const c = h.x + h.w / 2, r = h.w * 0.3; const d = Math.abs(x - c); return h.top - 14 - (d < r ? Math.sqrt(r * r - d * d) : 0); }
    return h.top - 14;
  }
  /** 颜色混合（#rrggbb） */
  function hexRgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mixC(a, b, k) { const A = hexRgb(a), B = hexRgb(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`; }
  function drawHouse(q, h, detail, R, night = 0.5) {
    const { x, w, top, base } = h, ink = 'rgba(44,18,48,0.85)', H = base - top;
    const wallTop = mixC(h.col, '#1a1034', night + 0.12), wallBot = mixC(h.col, '#3a1e4a', Math.max(0, night - 0.18));
    const roofC = (c) => mixC(c, '#1a1034', night);
    // 屋顶（月光从上方给屋脊一道亮边）
    if (h.roof < 0.42) {
      q.fillStyle = roofC(h.style < 0.5 ? '#c96a5c' : '#b8586a');
      q.beginPath(); q.moveTo(x - 12, top + 2); q.lineTo(x + w / 2, top - w * 0.26); q.lineTo(x + w + 12, top + 2); q.closePath(); q.fill();
      if (detail > 0.5) { q.strokeStyle = 'rgba(30,10,30,0.35)'; q.lineWidth = 2; for (let i = 1; i < 6; i++) { const yy = top - w * 0.26 * (1 - i / 6); q.beginPath(); q.moveTo(x + w / 2 - (w / 2 + 12) * (i / 6), yy + 2); q.lineTo(x + w / 2 + (w / 2 + 12) * (i / 6), yy + 2); q.stroke(); } }
      q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.moveTo(x - 12, top + 2); q.lineTo(x + w / 2, top - w * 0.26); q.lineTo(x + w + 12, top + 2); q.stroke();
      q.strokeStyle = 'rgba(255,200,230,0.45)'; q.lineWidth = 2; q.beginPath(); q.moveTo(x - 6, top - 1); q.lineTo(x + w / 2, top - w * 0.26 + 3); q.stroke();
      if (h.style > 0.7) { q.fillStyle = roofC('#9a4a50'); q.fillRect(x + w * 0.7, top - w * 0.3, 18, w * 0.22); q.strokeRect(x + w * 0.7, top - w * 0.3, 18, w * 0.22); }
    } else if (h.roof < 0.55) {
      q.fillStyle = roofC(h.style < 0.5 ? '#6aa0c8' : '#e8e0f4');
      q.beginPath(); q.arc(x + w / 2, top - 14, w * 0.3, PI, 0); q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
      q.strokeStyle = 'rgba(255,210,236,0.5)'; q.lineWidth = 2.5; q.beginPath(); q.arc(x + w / 2, top - 14, w * 0.3 - 4, PI * 1.15, PI * 1.6); q.stroke();
      q.fillStyle = roofC('#f4ecf4'); q.fillRect(x + w / 2 - 2, top - 14 - w * 0.3 - 16, 4, 16);
    }
    // 墙：上暗下亮（被街灯和灯笼照着）
    q.fillStyle = vg(q, top, base, [[0, wallTop], [1, wallBot]]); q.fillRect(x, top - (h.roof >= 0.42 ? 14 : 0), w, H + (h.roof >= 0.42 ? 14 : 0));
    if (h.roof >= 0.42) { q.fillStyle = roofC('#f4ecf4'); q.fillRect(x - 6, top - 18, w + 12, 8); q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(x - 6, top - 18, w + 12, 8); }
    q.fillStyle = vg(q, base - 260, base, [[0, 'rgba(255,170,120,0)'], [1, 'rgba(255,170,120,0.22)']]); q.fillRect(x, base - 260, w, 260);
    if (detail > 0.4) { q.fillStyle = 'rgba(255,230,255,0.045)'; for (let i = 0; i < 20; i++) q.fillRect(x + R() * w, top + R() * H, 4 + R() * 14, 2 + R() * 4); }
    // 窗
    const floors = Math.max(1, Math.floor((H - (detail > 0.7 ? 150 : 40)) / 105)), cols = Math.max(1, Math.round(w / 95));
    const shut = pick(SHUTTER, h.style);
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const wx = x + ((c + 0.5) * w) / cols, wy = top + 40 + f * 105, ww = Math.min(44, (w / cols) * 0.5), wh = 62;
      const lit = R() < 0.5, arch = h.style > 0.4;
      q.beginPath();
      if (arch) { q.moveTo(wx - ww / 2, wy + wh); q.lineTo(wx - ww / 2, wy + ww / 2); q.arc(wx, wy + ww / 2, ww / 2, PI, 0); q.lineTo(wx + ww / 2, wy + wh); q.closePath(); }
      else q.rect(wx - ww / 2, wy, ww, wh);
      q.fillStyle = lit ? '#ffd48e' : '#3a2c64'; q.fill();
      if (lit) { q.fillStyle = 'rgba(255,150,80,0.45)'; q.fillRect(wx - ww / 2, wy + wh * 0.55, ww, wh * 0.45); }
      q.strokeStyle = ink; q.lineWidth = 2.5; q.stroke();
      if (detail > 0.5) {
        q.strokeStyle = lit ? 'rgba(120,60,30,0.6)' : 'rgba(20,10,40,0.6)'; q.lineWidth = 2; q.beginPath(); q.moveTo(wx, wy + (arch ? 4 : 0)); q.lineTo(wx, wy + wh); q.moveTo(wx - ww / 2, wy + wh * 0.5); q.lineTo(wx + ww / 2, wy + wh * 0.5); q.stroke();
        if (!lit || R() < 0.4) { q.fillStyle = shut; q.fillRect(wx - ww / 2 - 14, wy + 4, 12, wh - 4); q.fillRect(wx + ww / 2 + 2, wy + 4, 12, wh - 4); q.strokeStyle = ink; q.lineWidth = 1.8; q.strokeRect(wx - ww / 2 - 14, wy + 4, 12, wh - 4); q.strokeRect(wx + ww / 2 + 2, wy + 4, 12, wh - 4); }
        if (R() < 0.45) { q.fillStyle = '#5a3a2a'; q.fillRect(wx - ww / 2 - 4, wy + wh, ww + 8, 9); for (let i = 0; i < 6; i++) { q.fillStyle = R() < 0.3 ? '#3e7a4a' : R() < 0.6 ? '#ff6a9a' : '#ffb0c8'; q.beginPath(); q.arc(wx - ww / 2 + 2 + i * (ww / 5), wy + wh - 2 - R() * 5, 4 + R() * 3, 0, TAU); q.fill(); } }
      }
    }
    // 近层：门、雨篷、阳台
    if (detail > 0.7) {
      const dx = x + w * (0.25 + R() * 0.5);
      q.fillStyle = pick(['#4a6ab0', '#3e7a6a', '#8a4a6a', '#6a4a3a'], R()); archPath(q, dx, base - 62, 64, 124); q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
      q.fillStyle = '#ffd070'; q.beginPath(); q.arc(dx + 18, base - 58, 4, 0, TAU); q.fill();
      q.fillStyle = h.col; q.fillRect(dx - 44, base - 6, 88, 6);
      if (R() < 0.5) {
        const ay = base - 150, aw = Math.min(w - 20, 170), ax = x + (w - aw) / 2, cA = pick(['#e0506a', '#4a8ac0', '#e89a40', '#8a60c0'], R());
        for (let i = 0; i < 7; i++) { q.fillStyle = i % 2 ? '#fff4f0' : cA; q.beginPath(); q.moveTo(ax + (i * aw) / 7, ay); q.lineTo(ax + ((i + 1) * aw) / 7, ay); q.lineTo(ax + ((i + 1) * aw) / 7 + 6, ay + 34); q.lineTo(ax + (i * aw) / 7 + 6, ay + 34); q.closePath(); q.fill(); }
        q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(ax, ay, aw + 6, 34);
      } else if (floors > 1) {
        const by = top + 40 + 105 + 66, bw = Math.min(w - 30, 150), bx = x + (w - bw) / 2;
        q.fillStyle = 'rgba(40,20,50,0.9)'; q.fillRect(bx - 8, by, bw + 16, 8);
        q.strokeStyle = 'rgba(40,20,50,0.9)'; q.lineWidth = 3; for (let i = 0; i <= 10; i++) { q.beginPath(); q.moveTo(bx + (i * bw) / 10, by); q.lineTo(bx + (i * bw) / 10, by - 34); q.stroke(); }
        q.beginPath(); q.moveTo(bx - 8, by - 34); q.lineTo(bx + bw + 8, by - 34); q.stroke();
        for (let i = 0; i < 5; i++) { q.fillStyle = i % 2 ? '#ff7aa8' : '#3e7a4a'; q.beginPath(); q.arc(bx + 10 + i * (bw / 5), by - 38, 9, 0, TAU); q.fill(); }
      }
    }
    q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.moveTo(x, base); q.lineTo(x, top - (h.roof >= 0.42 ? 14 : 0)); q.moveTo(x + w, top - (h.roof >= 0.42 ? 14 : 0)); q.lineTo(x + w, base); q.stroke();
  }
  function townLayer(q, which, tint, tintA, detail, x0, x1, night = 0.5) {
    const row = TOWN[which];
    for (const h of row) { if (h.x + h.w < x0 - 60 || h.x > x1 + 60) continue; drawHouse(q, h, detail, E.rng(h.seed), night); }
    // 大气透视：只染已经画了的部分（越远越粉、越淡）
    q.globalCompositeOperation = 'source-atop';
    const base = row[0].base, top = base - 620;
    q.fillStyle = vg(q, top, base, [[0, tint], [1, tint]]); q.globalAlpha = tintA * 0.6; q.fillRect(x0 - 100, 0, x1 - x0 + 200, VH);
    q.fillStyle = vg(q, base - 240, base, [[0, 'rgba(255,170,215,0)'], [1, 'rgba(255,170,215,1)']]); q.globalAlpha = tintA; q.fillRect(x0 - 100, base - 240, x1 - x0 + 200, 240);
    q.globalAlpha = 1;
    q.globalCompositeOperation = 'source-over';
    // 亮窗 / 灯笼的暖光晕（烘焙进图层）
    if (detail > 0.3) {
      q.globalCompositeOperation = 'lighter';
      for (const h of row) {
        if (h.x + h.w < x0 - 60 || h.x > x1 + 60) continue;
        const r2 = E.rng(h.seed + 5);
        for (let i = 0; i < 2; i++) { const gx = h.x + r2() * h.w, gy = h.top + 40 + r2() * (h.base - h.top - 60); q.fillStyle = rg(q, gx, gy, 0, 110, [[0, 'rgba(255,160,90,0.2)'], [1, 'rgba(255,160,90,0)']]); q.fillRect(gx - 110, gy - 110, 220, 220); }
      }
      if (which === 'near') for (let i = 0; i < 10; i++) { const lx = i * 400 - 60 + 190, ly = 600 + hash(46, i) * 60; if (lx < x0 - 300 || lx > x1 + 300) continue; q.fillStyle = rg(q, lx, ly, 0, 300, [[0, 'rgba(255,150,110,0.3)'], [1, 'rgba(255,150,110,0)']]); q.fillRect(lx - 300, ly - 300, 600, 600); }
      q.globalCompositeOperation = 'source-over';
    }
  }
  /** 石板路：全局网格（按行 / 列取随机），分块画也能严丝合缝 */
  function cobbles(q, a, b, y0, y1, rowH, colW, seed) {
    for (let r = 0, y = y0; y < y1; r++, y += rowH) {
      const off = (r % 2) * (colW / 2);
      for (let ci = Math.floor((a - off) / colW) - 1; ci * colW + off < b + colW; ci++) {
        const x = ci * colW + off;
        q.fillStyle = `rgba(${hash(seed, r, ci) < 0.5 ? '255,220,240' : '30,10,40'},${0.06 + hash(seed + 1, r, ci) * 0.08})`;
        rrect(q, x + 2, y + 2, colW - 6, rowH - 4, 8); q.fill();
      }
    }
  }
  /** 视差层 d 在相机 cam 下可见的世界 x 范围 */
  function visRange(cam, d) { const z = 1 + ((cam.z ?? 1) - 1) * d, cx = 960 + ((cam.x ?? 960) - 960) * d; return [cx - 960 / z - 80, cx + 960 / z + 80]; }
  /** 分块的世界图层：只画与视野相交的块（每块单独缓存，走 LRU） */
  function tiled(g, s, key, cam, d, x0, x1, tw, fn, res = 1, y0 = 0, h = VH) {
    const z = 1 + ((cam.z ?? 1) - 1) * d, cx = 960 + ((cam.x ?? 960) - 960) * d;
    const vx0 = cx - 960 / z - 40, vx1 = cx + 960 / z + 40;
    if (window.__mvAudit) auditCover('tiled:' + key, d, cam, [x0, y0, x1, y0 + h], null);
    inCam(g, cam, d, (q) => {
      // 块的左右边对齐到设备像素：相邻两块正好接上，不留缝、也不重叠
      // 位图宽高是向上取整的，只取真正有内容的那一块（否则最右一列半透明，会露出一道缝）
      const M = q.getTransform(), a = M.a, e = M.e, kk = s.k * res;
      for (let tx = x0; tx < x1; tx += tw) {
        if (tx + tw < vx0 || tx > vx1) continue;
        const c = LC(s, key + ':' + tx, tw, h, (qq) => { qq.translate(-tx, -y0); fn(qq, tx, tx + tw); }, res);
        const X0 = Math.round(a * tx + e), X1 = Math.round(a * (tx + tw) + e);
        q.drawImage(c, 0, 0, Math.min(c.width, tw * kk), Math.min(c.height, h * kk), (X0 - e) / a, y0, (X1 - X0) / a, h);
      }
    });
  }
  function townSky(q) {
    q.fillStyle = vg(q, 0, VH, [[0, '#0e0830'], [0.3, '#26134e'], [0.55, '#52206e'], [0.75, '#9a3f86'], [0.9, '#e0709e'], [1, '#ffa6bc']]); q.fillRect(0, 0, VW, VH);
    const R = E.rng(31); for (let i = 0; i < 360; i++) { const y = Math.pow(R(), 1.4) * 700; q.fillStyle = `rgba(255,236,250,${(0.12 + R() * 0.45) * (1 - y / 800)})`; q.fillRect(R() * VW, y, 1.5, 1.5); }
  }
  const bigMoon = () => spr('bigmoon', 512, 512, (q) => {
    q.fillStyle = rg(q, 256, 256, 0, 256, [[0, 'rgba(255,190,220,0.5)'], [0.5, 'rgba(255,160,210,0.12)'], [1, 'rgba(255,150,200,0)']]); q.fillRect(0, 0, 512, 512);
    q.fillStyle = rg(q, 220, 220, 20, 150, [[0, '#fffaf6'], [0.7, '#ffe0ea'], [1, '#ffc2da']]); q.beginPath(); q.arc(256, 256, 150, 0, TAU); q.fill();
    for (const [x, y, r] of [[200, 210, 30], [300, 300, 42], [230, 330, 22], [322, 196, 18], [176, 290, 16], [280, 248, 12]]) { q.fillStyle = rg(q, x, y, 0, r, [[0, 'rgba(226,150,190,0.3)'], [0.7, 'rgba(226,150,190,0.16)'], [1, 'rgba(226,150,190,0)']]); q.fillRect(x - r, y - r, 2 * r, 2 * r); }
  });
  /** 一串灯笼：从 (x0,y0) 到 (x1,y1)，下垂 sag，n 个，随风摆 */
  const LANTERN_COL = [['#ff6a5a', '#b82a3a', '255,150,90'], ['#ffb0cc', '#d0507a', '255,160,200'], ['#ffd27a', '#c8842a', '255,210,130'], ['#c9a8ff', '#7a5ac0', '210,170,255']];
  const lanternSpr = (s, ci) => LC(s, 'lantern' + ci, 64, 92, (q) => {
    const [c1, c2] = LANTERN_COL[ci];
    q.strokeStyle = '#3a1a22'; q.lineWidth = 2; q.beginPath(); q.moveTo(32, 0); q.lineTo(32, 16); q.stroke();
    q.fillStyle = '#3a1a22'; q.fillRect(20, 14, 24, 7); q.fillRect(22, 72, 20, 6);
    q.fillStyle = rg(q, 27, 40, 2, 34, [[0, '#fff6d8'], [0.4, c1], [1, c2]]); q.beginPath(); q.ellipse(32, 46, 26, 28, 0, 0, TAU); q.fill();
    q.strokeStyle = 'rgba(90,30,30,0.55)'; q.lineWidth = 1.6; for (const k of [0.4, 0.75]) { q.beginPath(); q.ellipse(32, 46, 26 * k, 28, 0, 0, TAU); q.stroke(); } q.beginPath(); q.moveTo(32, 18); q.lineTo(32, 74); q.stroke();
    q.strokeStyle = '#3a1a22'; q.lineWidth = 2; q.beginPath(); q.ellipse(32, 46, 26, 28, 0, 0, TAU); q.stroke();
    q.strokeStyle = '#e0404a'; q.lineWidth = 3; q.beginPath(); q.moveTo(32, 78); q.lineTo(32, 90); q.stroke();
  }, 2);
  const lanternOff = (s, ci) => LC(s, 'lanternoff' + ci, 64, 92, (q) => {
    const [c1] = LANTERN_COL[ci];
    q.strokeStyle = '#2a1420'; q.lineWidth = 2; q.beginPath(); q.moveTo(32, 0); q.lineTo(32, 16); q.stroke();
    q.fillStyle = '#2a1420'; q.fillRect(20, 14, 24, 7); q.fillRect(22, 72, 20, 6);
    q.fillStyle = mixC(c1, '#2a1640', 0.62); q.beginPath(); q.ellipse(32, 46, 26, 28, 0, 0, TAU); q.fill();
    q.strokeStyle = '#1a0c18'; q.lineWidth = 2; q.stroke();
  }, 2);
  function lantern(g, s, x, y, h, ci, swing, lit = 1) {
    const sc = h / 92;
    g.save(); g.translate(x, y); g.rotate(swing); g.scale(sc, sc);
    if (lit < 1) g.drawImage(lanternOff(s, ci), -32, 0, 64, 92);
    if (lit > 0) { g.globalAlpha *= lit; g.drawImage(lanternSpr(s, ci), -32, 0, 64, 92); }
    g.restore();
    if (lit > 0) { const gx = x - Math.sin(swing) * h * 0.5, gy = y + Math.cos(swing) * h * 0.5; E.glow(g, gx, gy, h * 1.5, LANTERN_COL[ci][2], 0.5 * lit); E.glow(g, gx, gy, h * 0.45, '255,245,220', 0.5 * lit); }
  }
  function lanternString(g, s, t, x0, y0, x1, y1, sag, n, seed, o = {}) {
    const wob = wobble(seed, t * 0.4) * 10 + (o.wind || 0);
    g.strokeStyle = o.wire || 'rgba(40,20,40,0.8)'; g.lineWidth = o.lw || 2;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag + wob;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
    for (let i = 1; i <= n; i++) {
      const u = i / (n + 1), x = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * mx + u * u * x1, y = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * my + u * u * y1;
      const out = o.out ? o.out(i, n, seed, x, y) : 1;
      lantern(g, s, x, y, (o.size || 40) * (0.85 + 0.3 * hash(seed, i, 1)), (seed + i) % 4, Math.sin(t * 1.3 + i * 0.9 + seed) * 0.08 + wob * 0.004, out);
    }
  }
  /** 小镇的所有层（相机 cam；o: { lanterns, lambs(q), street(q), front(q), out(i,n) } ） */
  function town(g, s, cam, o = {}) {
    townBack(g, s, cam, o);
    townNear(g, s, cam, o);
  }
  function townBack(g, s, cam, o = {}) {
    const t = s.t;
    g.drawImage(LC(s, 'town-sky', VW, VH, townSky, 0.5), 0, 0, VW, VH);
    inCam(g, cam, 0.06, (q) => {
      stars(q, t, { n: 70, seed: 41, x: -200, y: 0, w: VW + 400, h: 560, s: 2.6 });
      q.drawImage(bigMoon(), (o.moonX ?? 1380) - 330, (o.moonY ?? 300) - 330, 660, 660);
      fogBand(q, t, { n: 4, seed: 42, x0: 900, x1: 1900, y0: 260, y1: 360, w: 700, h: 90, speed: 12, rgb: '255,200,230', a: 0.5 });
    });
    tiled(g, s, 'town-far', cam, 0.3, -200, 4200, 1100, (q, a, b) => townLayer(q, 'far', '#9a62b0', 0.75, 0.2, a, b, 0.62), 0.7, 288, 452);
    inCam(g, cam, 0.3, (q) => { haze(q, '255,160,210', -400, 470, 4800, 700, 0.75); fogBand(q, t, { n: 10, seed: 43, x0: -200, x1: 4000, y0: 560, y1: 700, w: 900, h: 220, speed: 14, rgb: '255,176,220', a: 0.6 }); });
    tiled(g, s, 'town-mid', cam, 0.55, -200, 4200, 1100, (q, a, b) => townLayer(q, 'mid', '#7a4aa0', 0.5, 0.55, a, b, 0.55), 0.9, 242, 612);
    const vm = visRange(cam, 0.55);
    inCam(g, cam, 0.55, (q) => {
      if (o.lanterns !== false) for (let i = 0; i < 9; i++) { const x = i * 460 - 100; if (x + 420 < vm[0] || x > vm[1]) continue; lanternString(q, s, t, x, 440 + hash(44, i) * 60, x + 420, 430 + hash(45, i) * 80, 70, 5, 50 + i, { size: 26, out: o.out }); }
      haze(q, '255,166,214', -400, 560, 4800, 800, 0.6);
      fogBand(q, t, { n: 10, seed: 44, x0: -200, x1: 4000, y0: 700, y1: 820, w: 900, h: 220, speed: 20, rgb: '255,186,226', a: 0.55 });
    });
  }
  function townNear(g, s, cam, o = {}) {
    const t = s.t, vn = visRange(cam, 0.85);
    tiled(g, s, 'town-near', cam, 0.85, -1160, 4600, 960, (q, a, b) => townLayer(q, 'near', '#5a3a8a', 0.2, 1, a, b, 0.4), 1.15, 176, 796);
    inCam(g, cam, 0.85, (q) => {
      if (o.lambs) o.lambs(q);
      if (o.lanterns !== false) for (let i = 0; i < 10; i++) { const x = i * 400 - 60; if (x + 380 < vn[0] || x > vn[1]) continue; lanternString(q, s, t, x, 520 + hash(46, i) * 90, x + 380, 500 + hash(47, i) * 100, 90, 6, 70 + i, { size: 38, out: o.out }); }
    });
    // 街面（左右都比最远的机位多铺一段：台阶那几个镜头镜头推到 x≈4250，也不会露出街面的尽头）
    // （往下也多铺一段：台阶镜头开头机位低，画面底边在 y≈1160）
    tiled(g, s, 'town-street', cam, 1, -1300, 4800, 1100, (q, a, b) => {
      q.fillStyle = vg(q, 870, 1080, [[0, '#6a4a7a'], [1, '#3a2848']]); q.fillRect(a - 2, 870, b - a + 4, 400);
      cobbles(q, a, b, 890, 1260, 26, 60, 11);
      q.fillStyle = 'rgba(255,190,150,0.18)'; q.fillRect(a - 2, 870, b - a + 4, 6);
    }, 1, 860, 400);
    inCam(g, cam, 1, (q) => { if (o.street) o.street(q); fogBand(q, t, { n: 8, seed: 45, x0: -200, x1: 4000, y0: 900, y1: 1060, w: 1000, h: 260, speed: 26, rgb: '255,196,232', a: 0.4 }); });
    if (o.front) inCam(g, cam, 1.3, o.front);
    lanternBokeh(g, s, cam, o.bokeh ?? 1);
  }
  /** 灯笼街上方失焦的灯笼光斑（成片后期的散景精灵；跟着镜头有视差；只在画面上半部，不压人物的脸） */
  function lanternBokeh(g, s, cam, a = 1) {
    const F = FIN();
    if (!F || !F.bokeh || a <= 0.01) return;
    F.bokeh(g, s, { n: 14, seed: 23, colors: ['255,190,130', '255,160,200', '255,214,150', '210,170,255'], depth: [0.2, 1], size: [34, 120], a: 0.3 * a, drift: [6, -3], cam, parallax: 0.5, rect: [0, -40, VW, 560] });
  }
  /* ---------- 镜头 9 · 走进粉色的夜雾（30.78 → 34.97） ---------- */
  /**
   * 梦里的那扇门：和博物馆里被小羊推开的那扇一模一样（同样的木门框、门板向里开），孤零零地立在街面上，门里是粉色的光。
   * (x, base) = 门洞底边中点（站在街面上，和街面同一层），w / h 门洞宽高；a 整扇门的显现程度（消散时 → 0）
   */
  function dreamDoor(q, t, x, base, w, h, a) {
    if (a <= 0.01) return;
    const x0 = x - w / 2, top = base - h, fw = 16;
    withAlpha(q, a, (qq) => {
      // 门口铺到街面上的光
      additive(qq, (q3) => { q3.fillStyle = vg(q3, base, base + 150, [[0, 'rgba(255,160,210,0.55)'], [1, 'rgba(255,160,210,0)']]); q3.beginPath(); q3.moveTo(x0 + 6, base); q3.lineTo(x0 + w - 6, base); q3.lineTo(x0 + w + 110, base + 150); q3.lineTo(x0 - 110, base + 150); q3.closePath(); q3.fill(); });
      groundShadow(qq, x, base + 4, w * 0.9, 0.55);
      // 门洞里的光
      qq.fillStyle = vg(qq, top, base, [[0, '#ffd8ee'], [0.55, '#ffc4e2'], [1, '#fff0f8']]); qq.fillRect(x0, top, w, h);
      additive(qq, (q3) => { q3.fillStyle = 'rgba(255,255,255,0.35)'; q3.fillRect(x0 + w * 0.3, top + 8, w * 0.4, h - 8); });
      // 门框 + 门槛（和博物馆那扇一样的木色）
      qq.fillStyle = '#8a6a50'; qq.strokeStyle = '#2a1418'; qq.lineWidth = 3;
      qq.fillRect(x0 - fw, top - fw, fw, h + fw); qq.fillRect(x0 + w, top - fw, fw, h + fw); qq.fillRect(x0 - fw - 6, top - fw - 10, w + fw * 2 + 12, 14);
      qq.strokeRect(x0 - fw, top - fw, fw, h + fw); qq.strokeRect(x0 + w, top - fw, fw, h + fw); qq.strokeRect(x0 - fw - 6, top - fw - 10, w + fw * 2 + 12, 14);
      qq.fillStyle = '#6a5a7a'; qq.fillRect(x0 - fw - 8, base - 4, w + fw * 2 + 16, 10); qq.strokeRect(x0 - fw - 8, base - 4, w + fw * 2 + 16, 10);
      // 门板：向镜头这边敞开（和博物馆里那扇门打开时一个样子）
      const pw = w * 0.2;
      qq.fillStyle = '#5a3a30'; qq.beginPath(); qq.moveTo(x0, top); qq.lineTo(x0 + pw, top - h * 0.07); qq.lineTo(x0 + pw, base + h * 0.07); qq.lineTo(x0, base); qq.closePath(); qq.fill(); qq.stroke();
      qq.fillStyle = '#d8b060'; qq.beginPath(); qq.arc(x0 + pw * 0.7, top + h * 0.53, 4, 0, TAU); qq.fill();
    });
    E.glow(q, x, top + h * 0.45, h * 0.9, '255,160,210', 0.55 * a);
    E.glow(q, x, base - 10, w * 1.2, '255,236,246', 0.5 * a);
  }
  // 门在街面上的位置：上一个镜头（博物馆里那扇门）圆形转场的圆心正对着它
  const SDOOR = { x: 424, base: 926, w: 118, h: 332 };
  function shotStreet(g, s) {
    const t = s.t, lt = s.lt, k = ease.inOut(clamp(lt / 3.9));
    const cam = { x: lerp(620, 980, k), y: lerp(760, 520, k), z: lerp(1.75, 1.0, k), ...hand(s, 15, 5, 0.3) };
    town(g, s, cam, {
      lambs: (q) => rooftopLambs(q, s, t, 900, 8, 0.6),
      street: (q) => {
        // 她从那扇发光的门里走出来；门在她身后慢慢化成光点散掉
        const dg = 1 - sst(1.6, 2.9, lt);
        dreamDoor(q, t, SDOOR.x, SDOOR.base, SDOOR.w, SDOOR.h, dg);
        if (dg < 1 && dg > 0) for (let i = 0; i < 14; i++) { const ph = fract(hash(55, i) + lt * 0.7); const px = SDOOR.x + (hash(56, i) - 0.5) * SDOOR.w * 1.4, py = SDOOR.base - hash(57, i) * SDOOR.h - ph * 120; sparkle(q, px, py, 10 + hash(58, i) * 12, Math.sin(PI * ph) * Math.sin(PI * dg), ph * 3, '255,220,240'); }
        // 匀速走（步频按速度算），走出门口约 3.6 秒后停下抬头看
        const wk = { h: 300, pose: 'walk', speed: 1.1 }, v = E.cast && E.cast.gait ? E.cast.gait('adele-alter', wk).speed : 88;
        const wt = clamp(lt - 0.3, 0, 3.6), ax = SDOOR.x + 10 + v * wt, walking = lt < 3.9;
        cast(q, 'adele-alter', { x: ax, y: SDOOR.base, h: 300, pose: walking ? 'walk' : 'look-up', speed: wk.speed, outfit: 'home', t, expr: 'surprise', look: [0.4, -0.8] });
        for (let i = 0; i < 3; i++) { const ph = fract(s.beat + i * 0.3); const [hy, sq] = hop(ph); const lx = ax + 240 + i * 90 + lt * 60; groundShadow(q, lx, SDOOR.base + 2, 26, 0.45 * (1 - hy * 0.6)); lamb(q, s, lx, SDOOR.base - hy * 40, 60, { v: i + 2, sq, glow: 1, pose: hy > 0.3 ? 'jump' : 'stand' }); }
      },
      front: (q) => {
        for (let i = 0; i < 3; i++) lanternString(q, s, t, -200 + i * 900, -40, 500 + i * 900, -20, 160, 4, 90 + i, { size: 90, lw: 3 });
        for (let i = 0; i < 8; i++) bokeh(q, (hash(48, i) * 3200) - 200, 900 + hash(49, i) * 200, 60 + hash(50, i) * 70, '255,180,220', 0.25);
      },
    });
    sparkles(g, t, 26, 5, '255,220,240');
    vig(g, s, 0.5);
  }
  /** 屋顶上排成一队、一拍一跳的小羊（x0 起点，n 只，spd 每拍前进的格数） */
  function rooftopLambs(q, s, t, x0, n, spd, o = {}) {
    // 一队小羊齐步跳：每 1/spd 拍跳一格（所有羊同一相位，看起来是在踩拍子）
    const hopLen = o.hopLen || 120, b0 = o.b0 ?? T0beat(s), gap = o.gap || 76;
    const b = (s.beat - b0) * spd + (o.phase || 0), f = fract(b), i = Math.floor(b);
    const [, sq] = hop(f);
    for (let j = 0; j < n; j++) {
      const xa = x0 + i * hopLen - j * gap, xb = xa + hopLen;
      const x = lerp(xa, xb, f), y = lerp(roofY(xa), roofY(xb), f) - 4 * f * (1 - f) * (o.hopH || 70) * (0.85 + 0.3 * hash(77, j));
      lamb(q, s, x, y + 4, (o.V || 56) * (0.9 + 0.2 * hash(78, j)), { v: j, sq, glow: 1, pose: f > 0.15 && f < 0.85 ? 'jump' : 'stand', expr: j % 3 ? 'laugh' : 'neutral' });
    }
    return x0 + (i + f) * hopLen;
  }
  function sparkles(g, t, n, seed, rgb) {
    for (let i = 0; i < n; i++) {
      const life = 1.6 + hash(seed, i, 1) * 1.4, ph = fract(t / life + hash(seed, i, 2));
      const cyc = Math.floor(t / life + hash(seed, i, 2));
      const x = hash(seed, i * 7 + cyc, 3) * VW, y = hash(seed, i * 7 + cyc, 4) * VH * 0.9;
      sparkle(g, x, y, 10 + hash(seed, i, 5) * 16, Math.sin(PI * ph) * 0.8, ph * 1.5, rgb);
    }
  }
  /* ---------- 镜头 10 · 屋顶（34.97 → 39.14）：小羊踩着拍子跳过屋顶，外套像旗子一样被扛着 ---------- */
  function shotRooftops(g, s) {
    const t = s.t, lt = s.lt, b0 = T0beat(s);
    const lead = 900 + (s.beat - b0) * 120, zn = 1 + 0.05 * 0.85;
    const camX = 960 + (lead - 960 - (1250 - 960) / zn) / 0.85;
    const cam = { x: camX, y: 380, z: 1.05, ...hand(s, 17, 4, 0.4) };
    town(g, s, cam, {
      moonX: 1180, moonY: 360,
      lambs: (q) => {
        rooftopLambs(q, s, t, 900, 7, 1, { b0, hopH: 90, V: 62 });
        // 队尾：三只小羊叼着外套（中间那只叼领后的挂环，前后两只叼袖口），和队伍踩着同一个拍子跳过屋顶
        const b = s.beat - b0, i = Math.floor(b), f = fract(b), L = 150, V = 60;
        const xa = 900 + i * 120 - 7 * 76 - 150, xb = xa + 120, cx = lerp(xa, xb, f);
        const cy = lerp(roofY(xa), roofY(xb), f) - 0.4 * V - 0.2 * L - 4 * f * (1 - f) * 90;
        coatTrio(q, s, t, [cx, cy], L, V, 1, { seed: 7, spread: 0.72, bob: (k) => Math.sin(t * 7 + k * 2) * 4 });
      },
      street: (q) => {
        // 街上追着跑的她（画面底边）：步频按她的实际速度算（镜头速度 ± 一点前后晃），脚不打滑
        const v0 = 120 / BEAT / 0.85, run = { h: 300, pose: 'run' };
        const sp = v0 / (E.cast && E.cast.gait ? E.cast.gait('adele-alter', run).speed : 233);
        cast(q, 'adele-alter', { x: camX - 240 + Math.sin(lt * 1.3) * 30, y: 905, h: 300, pose: 'run', speed: sp, phase: 30 * Math.sin(lt * 1.3) / v0, outfit: 'home', t, expr: 'determined', look: [0.5, -0.6] });
      },
    });
    sparkles(g, t, 20, 6, '255,220,240');
    vig(g, s, 0.45);
  }

  /* =========================================================
   * 梦中集市：山顶小广场（世界 0..3400；摊位底 y=860，广场地面 860..1080）
   * 五个摊位：棉花糖 / 汽水 / 风车（北风）/ 种子 / 羊毛 —— 暗合多利那笔“北风、种子和羊毛”的交易
   * ========================================================= */
  const STALLS = [
    { x: 40, w: 380, c: '#f07aa8', sign: '棉花糖', kind: 'floss' },
    { x: 520, w: 380, c: '#4aa8c8', sign: '汽水', kind: 'soda' },
    { x: 1580, w: 360, c: '#8a78d8', sign: '北风 · 风车', kind: 'wind' },
    { x: 2040, w: 360, c: '#5ab080', sign: '种子', kind: 'seeds' },
    { x: 2500, w: 360, c: '#f09a58', sign: '羊毛', kind: 'wool' },
  ];
  const FOUNT = [1240, 905]; // 池子中心（在广场上，不越过广场后沿）
  const GATE = [3060, 930];
  function stallArt(q, st) {
    const { x, w } = st, base = 860, top = base - 380, ink = 'rgba(40,16,40,0.9)';
    q.fillStyle = mixC(st.c, '#1a1030', 0.6); q.fillRect(x + 12, top + 40, w - 24, 230);
    q.globalCompositeOperation = 'lighter';
    q.fillStyle = rg(q, x + w / 2, top + 110, 0, w * 0.75, [[0, 'rgba(255,196,130,0.5)'], [1, 'rgba(255,196,130,0)']]); q.fillRect(x - 60, top, w + 120, 360);
    q.globalCompositeOperation = 'source-over';
    q.fillStyle = '#6a4a3a'; q.fillRect(x + 20, top + 140, w - 40, 8); q.fillRect(x + 20, top + 210, w - 40, 8);
    const R = E.rng(x | 0);
    // 货架上的小东西
    for (let row = 0; row < 2; row++) for (let i = 0; i < 7; i++) {
      const gx = x + 36 + i * ((w - 72) / 6), gy = top + 140 + row * 70;
      if (st.kind === 'seeds') { q.fillStyle = pick(['#f4d06a', '#e87a8a', '#8ac06a', '#8ab0e8'], R()); q.fillRect(gx - 12, gy - 34, 24, 32); q.fillStyle = '#3e7a4a'; q.fillRect(gx - 1, gy - 26, 2, 12); q.beginPath(); q.ellipse(gx + 4, gy - 26, 5, 3, -0.5, 0, TAU); q.fill(); }
      else if (st.kind === 'wool') { q.fillStyle = pick(['#ffd0e0', '#d8c8ff', '#fff0c8', '#c8f0e8', '#ffffff'], R()); q.beginPath(); q.arc(gx, gy - 16, 15, 0, TAU); q.fill(); q.strokeStyle = 'rgba(80,40,60,0.4)'; q.lineWidth = 1.5; q.beginPath(); q.arc(gx, gy - 16, 9, 0.5, 4); q.stroke(); }
      else if (st.kind === 'soda') { q.fillStyle = pick(['rgba(255,140,190,0.9)', 'rgba(150,220,210,0.9)', 'rgba(255,210,120,0.9)'], R()); rrect(q, gx - 7, gy - 40, 14, 38, 4); q.fill(); q.fillStyle = '#e0424e'; q.fillRect(gx - 5, gy - 44, 10, 5); }
      else { q.fillStyle = pick(['#ffb0cc', '#d8b8ff', '#fff0f4', '#b0e0ff'], R()); q.beginPath(); q.arc(gx, gy - 18, 13, 0, TAU); q.fill(); q.fillStyle = 'rgba(255,255,255,0.4)'; q.beginPath(); q.arc(gx - 4, gy - 22, 4, 0, TAU); q.fill(); }
    }
    // 柜台
    q.fillStyle = '#8a5a3a'; q.fillRect(x, base - 124, w, 124);
    q.strokeStyle = 'rgba(40,16,10,0.35)'; q.lineWidth = 2; for (let i = 1; i < 5; i++) { q.beginPath(); q.moveTo(x, base - 124 + i * 25); q.lineTo(x + w, base - 124 + i * 25); q.stroke(); }
    q.fillStyle = '#b07a50'; q.fillRect(x - 10, base - 136, w + 20, 14);
    q.strokeStyle = ink; q.lineWidth = 3; q.strokeRect(x - 10, base - 136, w + 20, 14); q.strokeRect(x, base - 122, w, 122);
    // 柜台上的货
    if (st.kind === 'floss') {
      for (let i = 0; i < 5; i++) { const fx = x + 70 + i * 60, fy = base - 180 - (i % 2) * 20; q.strokeStyle = '#f4ecdc'; q.lineWidth = 4; q.beginPath(); q.moveTo(fx, base - 136); q.lineTo(fx, fy); q.stroke(); q.fillStyle = pick(['#ffb6d2', '#e8c6ff', '#b8e0ff', '#fff0f6'], hash(8, i)); blob(q, rockPts(fx, fy - 24, 34, 28, 40 + i, 10, 0.18)); q.fill(); q.fillStyle = 'rgba(255,255,255,0.45)'; q.beginPath(); q.arc(fx - 10, fy - 34, 9, 0, TAU); q.fill(); }
    } else if (st.kind === 'soda') {
      q.fillStyle = '#d8e8f4'; rrect(q, x + 230, base - 196, 130, 62, 10); q.fill(); q.strokeStyle = ink; q.lineWidth = 2.5; q.stroke();
      for (let i = 0; i < 5; i++) { q.fillStyle = 'rgba(255,140,190,0.9)'; rrect(q, x + 244 + i * 22, base - 236, 14, 52, 4); q.fill(); q.fillStyle = '#e0424e'; q.fillRect(x + 246 + i * 22, base - 242, 10, 7); }
      q.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 8; i++) { q.beginPath(); q.arc(x + 240 + i * 15, base - 190 + (i % 2) * 6, 6, 0, TAU); q.fill(); }
    } else if (st.kind === 'wind') {
      for (let i = 0; i < 6; i++) { const fx = x + 50 + i * 52; q.strokeStyle = '#8a6a50'; q.lineWidth = 4; q.beginPath(); q.moveTo(fx, base - 136); q.lineTo(fx, base - 230 - (i % 2) * 30); q.stroke(); }
    } else if (st.kind === 'seeds') {
      for (let i = 0; i < 4; i++) { const fx = x + 60 + i * 80; q.fillStyle = '#c86a4a'; q.beginPath(); q.moveTo(fx - 24, base - 136); q.lineTo(fx - 18, base - 176); q.lineTo(fx + 18, base - 176); q.lineTo(fx + 24, base - 136); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke(); q.strokeStyle = '#4a9a5a'; q.lineWidth = 3; q.beginPath(); q.moveTo(fx, base - 176); q.lineTo(fx, base - 206); q.stroke(); q.fillStyle = '#6ac07a'; q.beginPath(); q.ellipse(fx - 9, base - 206, 10, 5, -0.4, 0, TAU); q.ellipse(fx + 9, base - 210, 10, 5, 0.4, 0, TAU); q.fill(); }
    } else {
      q.fillStyle = '#c89a6a'; rrect(q, x + 60, base - 196, 240, 60, 14); q.fill(); q.strokeStyle = ink; q.lineWidth = 2.5; q.stroke();
      for (let i = 0; i < 7; i++) { q.fillStyle = pick(['#ffd0e0', '#d8c8ff', '#fff0c8', '#ffffff'], hash(9, i)); q.beginPath(); q.arc(x + 90 + i * 30, base - 200 - (i % 2) * 14, 22, 0, TAU); q.fill(); q.strokeStyle = 'rgba(80,40,60,0.35)'; q.lineWidth = 1.6; q.stroke(); }
    }
    // 招牌
    q.fillStyle = '#fff4e8'; rrect(q, x + w / 2 - 120, base - 106, 240, 66, 14); q.fill(); q.strokeStyle = st.c; q.lineWidth = 5; q.stroke();
    E.text(q, st.sign, x + w / 2, base - 60, { size: st.sign.length > 3 ? 30 : 38, weight: 900, color: mixC(st.c, '#2a1030', 0.45), spacing: 4 });
    // 柱子
    q.fillStyle = '#5a3a2e'; q.fillRect(x + 6, top + 10, 12, base - top - 10); q.fillRect(x + w - 18, top + 10, 12, base - top - 10);
    // 条纹雨篷 + 波浪边
    const n = 9, x0 = x - 16, x1 = x + w + 16, bx0 = x - 36, bx1 = x + w + 36, ay = top - 20, by = top + 44;
    for (let i = 0; i < n; i++) {
      const a0 = lerp(x0, x1, i / n), a1 = lerp(x0, x1, (i + 1) / n), b0 = lerp(bx0, bx1, i / n), b1 = lerp(bx0, bx1, (i + 1) / n);
      q.fillStyle = i % 2 ? '#fff2f4' : st.c;
      q.beginPath(); q.moveTo(a0, ay); q.lineTo(a1, ay); q.lineTo(b1, by); q.arc((b0 + b1) / 2, by, (b1 - b0) / 2, 0, PI); q.closePath(); q.fill();
    }
    q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.moveTo(x0, ay); q.lineTo(x1, ay); q.lineTo(bx1, by); for (let i = n - 1; i >= 0; i--) { const b0 = lerp(bx0, bx1, i / n), b1 = lerp(bx0, bx1, (i + 1) / n); q.arc((b0 + b1) / 2, by, (b1 - b0) / 2, 0, PI); } q.lineTo(x0, ay); q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.18)'; q.fillRect(x0, ay, x1 - x0, 6);
    q.fillStyle = st.c; q.beginPath(); q.moveTo(x + w / 2 - 50, ay); q.lineTo(x + w / 2, ay - 46); q.lineTo(x + w / 2 + 50, ay); q.closePath(); q.fill(); q.strokeStyle = ink; q.stroke();
  }
  function fairStalls(q, a, b) {
    for (const st of STALLS) if (st.x + st.w + 60 > a && st.x - 60 < b) stallArt(q, st);
  }
  /** 喷泉的池子（画在广场地面之后、瓶子之前：瓶子立在池子里） */
  function fountainPool(q, t) {
    const [fx, fy] = FOUNT;
    groundShadow(q, fx, fy + 40, 270, 0.6, 0.2);
    q.fillStyle = '#8a7a9a'; q.beginPath(); q.ellipse(fx, fy, 250, 56, 0, 0, TAU); q.fill(); q.strokeStyle = 'rgba(40,16,40,0.9)'; q.lineWidth = 3; q.stroke();
    q.fillStyle = '#ff9ac4'; q.beginPath(); q.ellipse(fx, fy - 8, 226, 42, 0, 0, TAU); q.fill();
    // 水面的波纹（一圈圈从瓶底扩开）
    q.strokeStyle = 'rgba(255,236,246,0.6)'; q.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const ph = fract(t * 0.6 + i / 3); q.globalAlpha = 1 - ph; q.beginPath(); q.ellipse(fx, fy - 10, 40 + ph * 180, 8 + ph * 32, 0, 0, TAU); q.stroke(); }
    q.globalAlpha = 1;
    q.fillStyle = 'rgba(255,255,255,0.35)'; q.beginPath(); q.ellipse(fx - 60, fy - 20, 80, 10, 0, 0, TAU); q.fill();
    q.fillStyle = '#6a5a7a'; q.strokeStyle = 'rgba(40,16,40,0.9)'; q.lineWidth = 3;
    q.beginPath(); q.ellipse(fx, fy, 250, 56, 0, 0, PI); q.lineTo(fx - 250, fy + 40); q.ellipse(fx, fy + 40, 250, 56, 0, PI, 0, true); q.closePath(); q.fill(); q.stroke();
    q.strokeStyle = 'rgba(255,220,240,0.35)'; q.lineWidth = 2; q.beginPath(); q.ellipse(fx, fy, 250, 56, 0, 0.15, PI - 0.15); q.stroke();
  }
  function fairGround(q, a, b) {
    q.fillStyle = vg(q, 860, 1080, [[0, '#7a5a86'], [1, '#3a2848']]); q.fillRect(a - 2, 860, b - a + 4, 240);
    for (let r = 0; r < 9; r++) {
      const y = 866 + Math.pow(r / 9, 1.4) * 220, hh = 10 + r * 3.2, ww = 40 + r * 9, st = ww + 6, off = ((r % 2) * ww) / 2;
      for (let ci = Math.floor((a - off) / st) - 1; ci * st + off < b + st; ci++) { const x = ci * st + off; q.fillStyle = `rgba(${hash(12, r, ci) < 0.5 ? '255,220,240' : '30,10,40'},${0.07 + hash(13, r, ci) * 0.08})`; rrect(q, x, y, ww, hh, hh / 2.4); q.fill(); }
    }
    q.globalCompositeOperation = 'lighter';
    for (const st of STALLS) { if (st.x + st.w < a - 200 || st.x > b + 200) continue; q.fillStyle = rg(q, st.x + st.w / 2, 880, 0, 320, [[0, 'rgba(255,170,110,0.28)'], [1, 'rgba(255,170,110,0)']]); q.fillRect(st.x - 200, 860, st.w + 400, 240); }
    q.fillStyle = rg(q, FOUNT[0], 900, 0, 420, [[0, 'rgba(255,140,200,0.3)'], [1, 'rgba(255,140,200,0)']]); q.fillRect(FOUNT[0] - 420, 860, 840, 240);
    q.globalCompositeOperation = 'source-over';
  }
  /** 风车（北风摊位上的一排，每帧转） */
  function pinwheel(g, x, y, r, a, cols) {
    for (let i = 0; i < 4; i++) {
      const b = a + (i * PI) / 2;
      g.fillStyle = cols[i % cols.length];
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); g.lineTo(x + Math.cos(b + 0.9) * r * 0.62, y + Math.sin(b + 0.9) * r * 0.62); g.closePath(); g.fill();
    }
    g.fillStyle = '#fff4d0'; g.beginPath(); g.arc(x, y, r * 0.12, 0, TAU); g.fill();
  }
  /** 集市（相机 cam；o: { lambs(q), plaza(q), fountain: 喷发强度 0..1, dollyCloud } ） */
  function fair(g, s, cam, o = {}) {
    const t = s.t;
    townBack(g, s, cam, { moonX: o.moonX ?? 1500, moonY: o.moonY ?? 240 });
    // 摊位立在广场的后沿上：和广场地面同一层（d = 1），镜头横移时摊位和地面、地上的暖光不会互相错开
    tiled(g, s, 'fair-stalls', cam, 1, -200, 3600, 1000, fairStalls, 1.1, 396, 590);
    const vr = visRange(cam, 1);
    inCam(g, cam, 1, (q) => {
      // 摊位之间的灯笼串、风车、气球
      for (let i = 0; i < STALLS.length - 1; i++) { const a = STALLS[i], b = STALLS[i + 1]; if (b.x < vr[0] - 300 || a.x > vr[1] + 300) continue; lanternString(q, s, t, a.x + a.w + 10, 470, b.x - 10, 470, 110, a.kind === 'soda' ? 9 : 4, 120 + i, { size: 40 }); }
      const W = STALLS[2];
      if (W.x + W.w > vr[0] && W.x < vr[1]) for (let i = 0; i < 6; i++) { const fx = W.x + 50 + i * 52, fy = 860 - 230 - (i % 2) * 30; pinwheel(q, fx, fy, 26, t * (4 + i * 0.7) * (o.wind || 1) + i, ['#ff8ab8', '#8ad0ff', '#ffe08a', '#c8a8ff']); }
      for (const st of STALLS) { if (st.x + st.w < vr[0] || st.x > vr[1]) continue; for (let j = 0; j < 2; j++) { const bx = st.x + (j ? st.w - 30 : 30), by = 360 + Math.sin(t * 1.4 + st.x + j) * 14; q.strokeStyle = 'rgba(255,240,250,0.6)'; q.lineWidth = 1.5; q.beginPath(); q.moveTo(bx, 470); q.quadraticCurveTo(bx + 10, 420, bx + Math.sin(t + j) * 8, by + 20); q.stroke(); lamb(q, s, bx + Math.sin(t + j) * 8, by + 40, 70, { v: (st.x / 40 | 0) + j, spin: Math.sin(t * 1.3 + j) * 0.15, glow: 0.6, expr: 'smile' }); } }
      if (o.stalls) o.stalls(q);
    });
    // 广场地面：左右都铺到最远的机位之外（集市开头镜头在 x≈-320 处也有地面，数羊处的镜头在 x≈3820）
    tiled(g, s, 'fair-ground', cam, 1, -1200, 4800, 1000, fairGround, 1, 850, 250);
    inCam(g, cam, 1, (q) => {
      fountainPool(q, t);
      fountain(q, s, t, o.fountain || 0, o.boomT);
      if (o.plaza) o.plaza(q);
      fogBand(q, t, { n: 8, seed: 61, x0: -200, x1: 3600, y0: 900, y1: 1060, w: 1000, h: 260, speed: 24, rgb: '255,196,232', a: 0.35 });
    });
    if (o.front) inCam(g, cam, 1.3, o.front);
    lanternBokeh(g, s, cam, 0.8);
  }
  /** 巨大的汽水瓶喷泉：平时从瓶口冒一股气泡，boom 时喷出一整根汽水柱 */
  function fountain(q, s, t, boom, boomT = 1e9) {
    const [fx, fy] = FOUNT;
    const tb = t - boomT, kick = tb > 0 ? Math.exp(-tb * 5) : 0;
    bottle(q, s, fx + (kick ? Math.sin(tb * 60) * 8 * kick : 0), fy - 20, 440, 0.04);
    const mx = fx + Math.sin(0.04) * 405, my = fy - 20 - 405;
    fizz(q, t, { t0: -10, x: mx, y: my, n: 40, dur: 400, speed: 260, r: 10, rise: 120, life: 1.8, spread: 0.6, seed: 71 });
    if (boom > 0 && tb > 0) {
      // 汽水柱：一根摇晃的粉色水柱，顶上开花
      const H = 760 * boom * (0.8 + 0.2 * s.pulse(3)) * clamp(tb / 0.25);
      additive(q, (qq) => {
        qq.globalAlpha = 0.55 * boom;
        qq.fillStyle = vg(qq, my - H, my, [[0, 'rgba(255,190,230,0)'], [0.3, 'rgba(255,170,220,0.6)'], [1, 'rgba(255,230,245,0.95)']]);
        qq.beginPath(); qq.moveTo(mx - 16, my);
        for (let j = 0; j <= 12; j++) { const u = j / 12; qq.lineTo(mx - 16 - u * 60 + Math.sin(t * 9 + u * 7) * 12 * u, my - u * H); }
        for (let j = 12; j >= 0; j--) { const u = j / 12; qq.lineTo(mx + 16 + u * 60 + Math.sin(t * 9 + u * 7 + 1) * 12 * u, my - u * H); }
        qq.closePath(); qq.fill(); qq.globalAlpha = 1;
      });
      // 喷出来又落下的气泡（抛物线）
      for (let i = 0; i < 130; i++) {
        const born = boomT + (i / 130) * 3.4 + hash(72, i, 1) * 0.05, a = t - born;
        if (a < 0 || a > 2.2) continue;
        const ang = -PI / 2 + (hash(72, i, 2) - 0.5) * 1.5, sp = (700 + hash(72, i, 3) * 900) * boom;
        const x = mx + Math.cos(ang) * sp * a * 0.7 + Math.sin(a * 5 + i) * 10, y = my + Math.sin(ang) * sp * a + 620 * a * a;
        bubble(q, x, y, (7 + hash(72, i, 4) * 20) * (0.7 + a * 0.6), 0.9 * (1 - a / 2.2));
        if (a > 1 && hash(72, i, 5) < 0.2) sparkle(q, x, y, 18, (1 - a / 2.2) * 1.4, a * 3, '255,220,240');
      }
      E.glow(q, mx, my - H * 0.9, 300, '255,180,230', 0.55 * boom);
      E.glow(q, mx, my, 160, '255,240,250', 0.6 * boom * (0.5 + kick));
    }
  }
  /** 集市里闲逛的小羊（固定位置，按拍子各玩各的） */
  function fairLambs(q, s, t, x0, x1) {
    for (let i = 0; i < 18; i++) {
      const x = 80 + hash(81, i, 1) * 3200;
      if (x < x0 - 100 || x > x1 + 100) continue;
      const y = 900 + hash(81, i, 2) * 140, V = 56 + (y - 900) * 0.25;
      const mode = i % 4, ph = fract(s.beat * (mode === 1 ? 0.5 : 1) + hash(81, i, 3));
      const [hy, sq] = hop(ph);
      const jump = mode === 3 ? 0.25 : 1;
      lamb(q, s, x + (mode === 2 ? Math.sin(t * 0.8 + i) * 60 : 0), y - hy * 50 * jump, V, { v: i, sq: sq * jump, flip: hash(81, i, 4) < 0.5, glow: 1, pose: hy * jump > 0.3 ? 'jump' : 'stand', expr: pick(['laugh', 'smile', 'neutral', 'surprise'], hash(81, i, 5)) });
    }
  }
  /* ---------- 镜头 11 · 梦中集市（39.14 → 43.32） ---------- */
  function shotFair(g, s) {
    const t = s.t, lt = s.lt, k = ease.inOut(clamp(lt / 4.2));
    const cam = { x: lerp(560, 1260, k), y: lerp(560, 540, k), z: lerp(1.1, 1.02, k), ...hand(s, 21, 4, 0.35) };
    // 月亮摆在和上一个镜头（屋顶）结尾同一个屏幕位置：擦除转场扫过时，月亮是连着的
    fair(g, s, cam, {
      moonX: 1112, moonY: 371,
      plaza: (q) => {
        const vr = visRange(cam, 1);
        fairLambs(q, s, t, vr[0], vr[1]);
        // 她一边笑一边快步走进集市（匀速，步频按速度算，脚不打滑），走到摊子前停下
        const wk = { h: 330, pose: 'walk', speed: 1.25 }, v = E.cast && E.cast.gait ? E.cast.gait('adele-alter', wk).speed : 110;
        const walking = lt < 3.4, ax = 380 + v * Math.min(lt, 3.4);
        cast(q, 'adele-alter', { x: ax, y: 1000, h: 330, pose: walking ? 'walk' : 'stand', speed: wk.speed, outfit: 'home', t, expr: 'laugh', look: [0.6, -0.4] });
        // 一只小羊顶着棉花糖蹦蹦跳跳跑过镜头前
        const px = lerp(-100, 1900, fract(lt / 4.2)) + 200, ph = fract(s.beat * 2), [hy, sq] = hop(ph);
        groundShadow(q, px, 1062, 40, 0.5 * (1 - hy * 0.6));
        lamb(q, s, px, 1060 - hy * 40, 90, { v: 2, sq, glow: 1, pose: 'jump', expr: 'laugh' });
        const mx = px + 0.38 * 90, my = 1060 - hy * 40 - 0.4 * 90;
        q.strokeStyle = '#f4ecdc'; q.lineWidth = 4; q.lineCap = 'round'; q.beginPath(); q.moveTo(mx - 4, my + 4); q.lineTo(mx + 14, my - 70); q.stroke(); q.lineCap = 'butt';
        q.fillStyle = '#ffb6d2'; blob(q, rockPts(mx + 16, my - 92, 30, 26, 44, 10, 0.18)); q.fill(); q.fillStyle = 'rgba(255,255,255,0.45)'; q.beginPath(); q.arc(mx + 7, my - 102, 8, 0, TAU); q.fill();
      },
    });
    sparkles(g, t, 22, 7, '255,226,190');
    vig(g, s, 0.45);
  }
  /* ---------- 镜头 12 · 数羊（43.32 → 47.49）：一拍一只小羊跳过栅栏，计数牌翻页 ---------- */
  /** 数羊的翻页计数牌：上半页往下翻（翻到一半露出新数字的上半边，翻完露出整个新数字），n = 翻完以后的数，flip 0..1 */
  function countSign(q, n, flip) {
    const [gx, gy] = GATE;
    groundShadow(q, gx + 198, gy + 2, 40, 0.55);
    q.fillStyle = '#6a4a3a'; q.fillRect(gx + 190, gy - 330, 16, 330);
    q.fillStyle = '#3a2440'; rrect(q, gx + 120, gy - 420, 160, 110, 12); q.fill(); q.strokeStyle = '#ffd08a'; q.lineWidth = 4; q.stroke();
    const f = clamp(flip), cur = String(Math.min(99, n)).padStart(2, '0'), prev = String(Math.min(99, Math.max(0, n - 1))).padStart(2, '0');
    const digit = (ch, cx, cy, clipTop, clipH) => { q.save(); q.beginPath(); q.rect(cx - 32, clipTop, 64, clipH); q.clip(); q.fillStyle = '#fff4e8'; rrect(q, cx - 32, cy - 44, 64, 88, 8); q.fill(); E.text(q, ch, cx, cy + 26, { font: 'display', size: 70, weight: 900, color: '#3a2440' }); q.restore(); };
    for (let i = 0; i < 2; i++) {
      const cx = gx + 160 + i * 80, cy = gy - 365;
      const moving = cur[i] !== prev[i] && f < 1;
      if (!moving) { digit(cur[i], cx, cy, cy - 44, 88); }
      else {
        // 上半：新数字（已经露出来的）；下半：旧数字，直到翻页落下盖住
        digit(cur[i], cx, cy, cy - 44, 44);
        digit(f < 0.5 ? prev[i] : cur[i], cx, cy, cy, 44);
        // 正在翻的那一页：前半程是旧数字的上半页往下压扁，后半程是新数字的下半页展开
        const h = Math.abs(Math.cos(f * PI)) * 44;
        q.save();
        if (f < 0.5) { q.beginPath(); q.rect(cx - 32, cy - h, 64, h); q.clip(); q.translate(cx, cy); q.scale(1, h / 44); q.translate(-cx, -cy); digit(prev[i], cx, cy, cy - 44, 44); }
        else { q.beginPath(); q.rect(cx - 32, cy, 64, h); q.clip(); q.translate(cx, cy); q.scale(1, h / 44); q.translate(-cx, -cy); digit(cur[i], cx, cy, cy, 44); }
        q.restore();
        q.fillStyle = `rgba(58,36,64,${0.25 * Math.sin(PI * f)})`; q.fillRect(cx - 32, f < 0.5 ? cy - h : cy, 64, h);
      }
      q.fillStyle = 'rgba(58,36,64,0.35)'; q.fillRect(cx - 32, cy - 1, 64, 2);
    }
    E.text(q, '数羊处 · COUNTING SHEEP', gx + 200, gy - 440, { size: 30, weight: 900, color: '#ffe0ec', spacing: 3, stroke: 'rgba(58,20,50,0.7)', strokeW: 8 });
  }
  function fence(q, x0, x1, y) {
    q.fillStyle = '#f4ecf4'; q.strokeStyle = 'rgba(40,16,40,0.9)'; q.lineWidth = 3;
    q.fillRect(x0, y - 70, x1 - x0, 14); q.strokeRect(x0, y - 70, x1 - x0, 14); q.fillRect(x0, y - 36, x1 - x0, 14); q.strokeRect(x0, y - 36, x1 - x0, 14);
    for (let x = x0 + 8; x < x1; x += 34) { q.beginPath(); q.moveTo(x, y); q.lineTo(x, y - 96); q.lineTo(x + 10, y - 108); q.lineTo(x + 20, y - 96); q.lineTo(x + 20, y); q.closePath(); q.fill(); q.stroke(); }
  }
  function shotCounting(g, s) {
    const t = s.t, lt = s.lt, b0 = T0beat(s), bt = s.beat - b0;
    const cam = { x: GATE[0] + 60 + lt * 14, y: 700, z: 1.5, ...hand(s, 23, 3, 0.4) };
    const n = Math.max(0, Math.floor(bt + 0.5)), flip = fract(bt + 0.5) * 3;
    fair(g, s, cam, {
      plaza: (q) => {
        const [gx, gy] = GATE;
        // 排队的小羊：每只在自己的那一拍从左边跳过栅栏
        for (let j = -3; j < 10; j++) {
          const u = bt - j; // u ∈ [0,1) 正在跳
          let x, y, pose = 'stand', sq = 0, V = 78;
          if (u < 0) { x = gx - 170 + u * 110; const ph = fract(s.beat * 2 + j * 0.3); y = gy - hop(ph)[0] * 12; sq = hop(ph)[1] * 0.4; }
          else if (u < 1) { x = gx - 170 + u * 380; y = gy - Math.sin(PI * u) * 190; pose = 'jump'; sq = -0.25; }
          else { x = gx + 210 + (u - 1) * 260; y = gy + Math.min(1, u - 1) * 30; const ph = fract(s.beat * 2 + j * 0.2); y -= hop(ph)[0] * 16; }
          if (x < gx - 700 || x > gx + 1200) continue;
          lamb(q, s, x, y, V, { v: j + 3, sq, glow: 1, pose, expr: u >= 0 && u < 1 ? 'laugh' : 'neutral', spin: u >= 0 && u < 1 ? (u - 0.5) * -0.5 : 0 });
        }
        fence(q, gx - 80, gx + 110, gy);
        countSign(q, n, flip);
        // 她在旁边看着数（官方小人：双手合在胸前，开心）
        cast(q, 'adele-alter', { x: gx + 470, y: gy + 60, h: 360, pose: 'wave', outfit: 'home', t, expr: 'smile', flip: true });
        // 小羊跳过时的“咩”
        const u = fract(bt);
        if (bt > 0) withAlpha(q, Math.sin(PI * clamp(u * 1.4)) * 0.9, (qq) => E.text(qq, '咩～', gx - 20 + u * 60, gy - 250 - u * 40, { size: 40, weight: 900, color: '#fff0f6', stroke: 'rgba(90,30,70,0.6)', strokeW: 8 }));
      },
    });
    vig(g, s, 0.45);
  }
  /* ---------- 镜头 13 · 谁把汽水撞翻了（47.49 → 51.66） ---------- */
  function shotSodaBurst(g, s) {
    const t = s.t, lt = s.lt, bump = s.shot.t0 + BEAT * 2, boomT = s.shot.t0 + BEAT * 4;
    const up = ease.inOut(clamp((t - boomT + 0.2) / 1.6));
    const cam = { x: lerp(820, 1150, ease.inOut(clamp(lt / 2.2))), y: lerp(660, 360, up), z: lerp(1.35, 1.05, up), ...shake(s, 10 * Math.exp(-Math.max(0, t - boomT) * 4) * (t > boomT ? 1 : 0) + 2, 25) };
    const boom = clamp((t - boomT) / 0.3) * (1 - 0.3 * clamp((t - boomT - 2) / 1.5));
    const pyramid = (q) => {
        // 汽水摊柜台上的瓶子金字塔：被小羊一撞，一个接一个哗啦倒下，滚到广场上（画在地面之后，落地的瓶子不会被地面盖住）
        const S = STALLS[1], bx = S.x + 110, by = 860 - 136;
        let k = 0;
        for (let row = 0; row < 4; row++) for (let i = 0; i < 4 - row; i++) {
          const x0 = bx + i * 34 + row * 17, y0 = by - row * 64;
          const te = bump + k * 0.05 + row * 0.08, a = t - te;
          if (a < 0) bottle(q, s, x0, y0, 62, 0);
          else { const b = bounce(a, x0, y0, (hash(91, k) - 0.35) * 500, -300 - hash(92, k) * 300, 960 + hash(93, k) * 60, 2400, 0.4, 0.7); const rot = a * (6 + hash(94, k) * 6) * (hash(95, k) < 0.5 ? -1 : 1); bottle(q, s, b.x, b.y, 62, b.n > 1 ? PI / 2 : rot); const [mx, my] = bottleMouth(b.x, b.y, 62, b.n > 1 ? PI / 2 : rot); fizz(q, t, { t0: te, x: mx, y: my, n: 12, dur: 2, speed: 300, r: 6, rise: 120, life: 1.2, ang: rot - PI / 2, seed: 100 + k }); }
          k++;
        }
    };
    fair(g, s, cam, {
      fountain: boom, boomT,
      plaza: (q) => {
        pyramid(q);
        const vr = visRange(cam, 1);
        fairLambs(q, s, t, vr[0], vr[1]);
        // 肇事的小羊：一路跳过来，撞上摊子，弹回去坐在地上
        const S = STALLS[1], a = t - bump;
        const x = a < 0 ? S.x + 560 + a * 260 : S.x + 520 + Math.min(0.5, a) * 200, y = a < 0 ? 960 - hop(fract(s.beat * 2))[0] * 40 : 960;
        lamb(q, s, x, y, 90, { v: 1, flip: true, glow: 1, pose: a < 0 ? 'jump' : 'stand', expr: a < 0 ? 'laugh' : 'surprise', sq: a > 0 && a < 0.2 ? 0.6 : 0, spin: a > 0 ? Math.sin(a * 20) * 0.2 * Math.exp(-a * 3) : 0 });
        cast(q, 'adele-alter', { x: 1560, y: 1010, h: 340, pose: t > boomT ? 'look-up' : 'stand', outfit: 'home', t, expr: t > boomT ? 'laugh' : 'surprise', flip: true });
      },
    });
    if (boom > 0) { risingBubbles(g, t, { t0: boomT, n: 50, x: 400, w: 1200, y0: 1100, h: 1200, seed: 9, a: 0.7 }); sparkles(g, t, 26, 8, '255,210,240'); }
    vig(g, s, 0.45);
  }
  /* ---------- 镜头 14 · 多利（51.66 → 55.84）：汽水的雾在天上聚成一只巨大的粉色羊，眨了眨眼 ---------- */
  function dollyCloud(g, s, cx, cy, sc, form, wink) {
    // 由几十团雾组成的羊形云（form 0..1 聚拢程度）
    const t = s.t;
    const P = [[-150, -20, 120], [-60, -70, 130], [50, -80, 130], [150, -40, 115], [110, 40, 120], [0, 50, 130], [-110, 40, 115], [-200, 10, 80], [230, -120, 90], [260, -160, 70]];
    for (let i = 0; i < 40; i++) {
      const p = P[i % P.length], sp = 1 - form;
      const ox = (hash(111, i, 1) - 0.5) * 500 * sp + Math.sin(t * 0.5 + i) * 10, oy = (hash(111, i, 2) - 0.5) * 300 * sp + Math.cos(t * 0.4 + i) * 8;
      const x = cx + (p[0] + (hash(111, i, 3) - 0.5) * 60 + ox) * sc, y = cy + (p[1] + (hash(111, i, 4) - 0.5) * 50 + oy) * sc, r = p[2] * sc * (0.8 + 0.4 * hash(111, i, 5));
      withAlpha(g, 0.55 * (0.4 + 0.6 * form), (q) => q.drawImage(puff(i, i % 3 ? '255,196,230' : '255,226,244'), x - r * 1.6, y - r * 0.9, r * 3.2, r * 1.8));
    }
    if (form > 0.6) {
      const a = (form - 0.6) / 0.4;
      // 腿（四根短短的云柱）；脸和眼睛由角色库的多利来画（这里不再另画一只眼睛，免得天上飘着两张脸）
      for (let i = 0; i < 4; i++) withAlpha(g, 0.45 * a, (q) => q.drawImage(puff(i, '255,210,236'), cx + (-150 + i * 90) * sc - 50 * sc, cy + 120 * sc, 100 * sc, 110 * sc));
    }
  }
  function shotDolly(g, s) {
    const t = s.t, lt = s.lt;
    const form = ease.inOut(clamp(lt / 1.8)), wink = win(lt, 2.55, 2.62, 2.8, 2.9);
    const cam = { x: 1240, y: 430, z: 1 + lt * 0.015, ...hand(s, 27, 4, 0.3) };
    const gust = clamp((lt - 3.0) / 1.1);
    fair(g, s, cam, {
      moonX: 1760, moonY: 170, wind: 1 + gust * 4,
      plaza: (q) => {
        const vr = visRange(cam, 1);
        fairLambs(q, s, t, vr[0], vr[1]);
        cast(q, 'adele-alter', { x: 760, y: 1030, h: 380, pose: 'look-up', outfit: 'home', t, expr: 'surprise', look: [0.4, -1], wind: 0.3 + gust * 0.6 });
      },
    });
    inCam(g, cam, 0.2, (q) => {
      // 多利：汽水雾聚成的一只巨大的粉色羊（角色库画形，雾团包边）
      const dx = 1220, dy = 470;
      E.glow(q, dx, dy - 180, 620, '255,160,215', 0.35 * form);
      dollyCloud(q, s, dx - 30, dy - 170, 1.35, form * 0.8, 0);
      if (form > 0.25) cast(q, 'dolly', { x: dx, y: dy, h: 380, t, glow: 1, sd: sdMix('Idle_A', 'Skill_A_1', sst(2.7, 3.2, lt)), form: 'cloud', fade: 1 - sst(0.3, 1, form), expr: wink > 0.5 ? 'closed' : 'smile', look: [-0.4, 0.6] });
      for (let i = 0; i < 10; i++) withAlpha(q, 0.35 * form, (qq) => { const a = (i / 10) * TAU + t * 0.1, r = 330 + 40 * Math.sin(t * 0.7 + i); qq.drawImage(puff(i, '255,210,236'), dx + Math.cos(a) * r - 180, dy - 170 + Math.sin(a) * r * 0.45 - 70, 360, 150); });
      // “交易”：一阵北风（旋涡线）、一把发光的种子、几缕羊毛
      if (lt > 1.4) {
        const k = clamp((lt - 1.4) / 1.0);
        q.strokeStyle = `rgba(255,236,250,${0.55 * k})`; q.lineWidth = 3.5; q.lineCap = 'round';
        for (let i = 0; i < 5; i++) { const ph = t * 2 + i * 1.3, cx = 380 + i * 330 + gust * 400; q.beginPath(); for (let j = 0; j <= 30; j++) { const u = j / 30, a = ph + u * 4.5, r = 20 + u * 80; q.lineTo(cx + Math.cos(a) * r + u * 160, 560 + i * 30 + Math.sin(a) * r * 0.45 + u * 30); } q.stroke(); }
        q.lineCap = 'butt';
        for (let i = 0; i < 30; i++) { const ph = fract(t * 0.22 + hash(121, i)); const x = 500 + hash(122, i) * 1500 + Math.sin(ph * 8 + i) * 34 + gust * ph * 300, y = 180 + ph * 900; const a = Math.sin(PI * ph) * k; E.glow(q, x, y, 16, '255,236,170', 0.9 * a); q.fillStyle = `rgba(255,250,220,${a})`; q.beginPath(); q.ellipse(x, y, 3.5, 6, ph * 6, 0, TAU); q.fill(); }
        for (let i = 0; i < 6; i++) { const ph = fract(t * 0.18 + i / 6); withAlpha(q, Math.sin(PI * ph) * 0.6 * k, (qq) => qq.drawImage(puff(i, '255,255,255'), 300 + ph * 1400, 300 + i * 60 + Math.sin(ph * 6) * 30, 180, 40)); }
      }
    });
    // 一阵风：叼着外套的三只小羊被吹过画面（去往下一个镜头的追逐）；外套在风里翻着
    if (gust > 0) inCam(g, cam, 1, (q) => {
      const x = lerp(-420, 2500, ease.in(gust)), y = 560 - Math.sin(gust * PI) * 170;
      coatTrio(q, s, t, [x, y], 190, 66, 1, { seed: 11, flap: 1, lean: Math.sin(t * 3.1) * 0.35, spread: 0.7 + 0.1 * Math.sin(t * 4), bob: (i) => Math.sin(t * 9 + i * 2) * 12, spin: (i) => Math.sin(t * 6 + i) * 0.3 });
    });
    sparkles(g, t, 20, 9, '255,220,240');
    vig(g, s, 0.45);
  }

  /* ---------- 镜头 15 · 追（55.84 → 60.00）：沿街追着叼外套的小羊跑，前景的路灯一根根掠过 ---------- */
  /** 街道后沿（紧挨着房子的人行道，和街面同一层 d=1）的路灯、盆栽棕榈、长椅：画在人物之前，不会挡脸，也不会和地面错开滑动 */
  const STREET_BACK = 884;
  function streetProps(q, s, t, x0, x1) {
    const y = STREET_BACK;
    for (let i = 0; i < 14; i++) {
      const x = 200 + i * 330 + hash(131, i) * 80;
      if (x < x0 - 300 || x > x1 + 300) continue;
      const kind = i % 3;
      groundShadow(q, x, y + 2, kind === 2 ? 110 : 46, 0.5);
      if (kind === 0) { // 路灯
        q.fillStyle = '#2a1c3a'; q.fillRect(x - 6, y - 470, 12, 470); q.fillRect(x - 18, y - 34, 36, 34);
        q.fillStyle = 'rgba(255,220,240,0.18)'; q.fillRect(x - 6, y - 470, 3, 436);
        q.fillStyle = '#2a1c3a'; q.beginPath(); q.moveTo(x - 24, y - 470); q.lineTo(x + 24, y - 470); q.lineTo(x + 15, y - 514); q.lineTo(x - 15, y - 514); q.closePath(); q.fill();
        q.fillStyle = '#ffe2a8'; q.fillRect(x - 11, y - 507, 22, 33); E.glow(q, x, y - 490, 150, '255,200,130', 0.55); E.glow(q, x, y - 490, 38, '255,240,210', 0.8);
      } else if (kind === 1) { // 盆栽棕榈
        q.fillStyle = '#6a3a44'; q.beginPath(); q.moveTo(x - 36, y); q.lineTo(x - 30, y - 64); q.lineTo(x + 30, y - 64); q.lineTo(x + 36, y); q.closePath(); q.fill();
        q.strokeStyle = 'rgba(30,10,30,0.8)'; q.lineWidth = 2.5; q.stroke();
        palm(q, x, y - 60, 250, t, { seed: 140 + i, col: '#2a1c3a', n: 8, lean: 0.05 });
      } else { // 长椅 + 一只打盹的小羊
        q.fillStyle = '#4a2c3a'; q.fillRect(x - 90, y - 52, 180, 12); q.fillRect(x - 90, y - 98, 180, 10); q.fillRect(x - 80, y - 40, 10, 40); q.fillRect(x + 70, y - 40, 10, 40); q.fillRect(x - 84, y - 98, 8, 56); q.fillRect(x + 76, y - 98, 8, 56);
        q.strokeStyle = 'rgba(30,10,30,0.8)'; q.lineWidth = 2; q.strokeRect(x - 90, y - 52, 180, 12);
        lamb(q, s, x - 20 + (i % 2) * 40, y - 52, 46, { v: i, pose: 'sleep', expr: 'closed', glow: 0.6, flip: i % 2 === 0 });
      }
    }
  }
  function shotChase(g, s) {
    const t = s.t, lt = s.lt, b0 = T0beat(s);
    const camX = 1750 + lt * 250;
    const cam = { x: camX, y: 690, z: 1.28, ...hand(s, 29, 6, 0.8) };
    town(g, s, cam, {
      street: (q) => {
        const vr = visRange(cam, 1);
        streetProps(q, s, t, vr[0], vr[1]);
        // 前面：三只会飞的小羊叼着外套，一拍两下地往前蹿（外套下摆离地一点点）
        const f = fract((s.beat - b0) * 2), hy = 4 * f * (1 - f);
        const L = 180, lx = camX + 430 + Math.sin(lt * 1.5) * 40;
        coatTrio(q, s, t, [lx, 905 - L - 18 - hy * 34], L, 74, 1, { seed: 5, bob: (i) => Math.sin(t * 8 + i * 1.7) * 5 });
        // 她：步频按镜头速度算（250 像素 / 秒），脚不打滑
        const run = { h: 360, pose: 'run' }, sp = 250 / (E.cast && E.cast.gait ? E.cast.gait('adele-alter', run).speed : 279);
        cast(q, 'adele-alter', { x: camX - 180, y: 905, h: 360, pose: 'run', outfit: 'home', t, expr: 'determined', speed: sp, wind: 0.6 });
        // 被她惊得跳开的小羊
        for (let i = 0; i < 6; i++) { const x = 1900 + i * 230, a = (camX - 180 - x) / 250; if (a < -1.5 || a > 3) continue; const k = clamp(a + 0.5); lamb(q, s, x + k * 40 * (i % 2 ? 1 : -1), 960 + (i % 3) * 30 - Math.sin(PI * clamp(a + 0.5)) * 90, 64, { v: i + 1, glow: 1, pose: k > 0 && k < 1 ? 'jump' : 'stand', expr: k > 0 ? 'surprise' : 'neutral', flip: i % 2 === 0 }); }
      },
      // 前景：画框底边几团失焦的暖光（只在底边，不挡人）
      front: (q) => { for (let i = 0; i < 8; i++) bokeh(q, 1250 + i * 400 + hash(135, i) * 160, 1190 + hash(136, i) * 110, 90 + hash(137, i) * 80, i % 2 ? '255,200,140' : '255,170,215', 0.22); },
    });
    vig(g, s, 0.45);
  }

  /* ---------- 镜头 16 · 通往雾里的台阶（60.00 → 64.18）：小羊一拍一跳地上台阶，到顶“噗”地钻进雾里 ---------- */
  const STAIR = { x0: 3000, y0: 880, run: 56, rise: 44, n: 16 };
  function stairArt(q) {
    const { x0, y0, run, rise, n } = STAIR, ink = 'rgba(40,16,40,0.9)';
    // 台阶下的石墙：砌石纹 + 一个透出暖光的拱门 + 墙根的花盆
    const wall = () => { q.beginPath(); q.moveTo(x0 - 20, y0 + 10); for (let i = 0; i <= n; i++) q.lineTo(x0 + i * run + run, y0 - i * rise - 20); q.lineTo(x0 + n * run + run + 40, y0 - n * rise - 20); q.lineTo(x0 + n * run + run + 40, y0 + 12); q.closePath(); };
    wall(); q.fillStyle = vg(q, y0 - n * rise, y0, [[0, '#6a5a8e'], [1, '#56487a']]); q.fill();
    q.save(); wall(); q.clip();
    q.strokeStyle = 'rgba(30,14,40,0.35)'; q.lineWidth = 2;
    for (let y = y0 - n * rise - 40, r = 0; y < y0 + 20; y += 34, r++) { q.beginPath(); q.moveTo(x0 - 40, y); q.lineTo(x0 + n * run + 200, y); q.stroke(); for (let x = x0 - 40 + (r % 2) * 40; x < x0 + n * run + 200; x += 80) { q.beginPath(); q.moveTo(x, y); q.lineTo(x, y + 34); q.stroke(); } }
    q.fillStyle = 'rgba(255,230,255,0.05)'; for (let i = 0; i < 60; i++) q.fillRect(x0 + hash(141, i) * n * run, y0 - hash(142, i) * n * rise, 30, 14);
    // 拱门（里面一盏灯）
    const ax = x0 + n * run * 0.62, aw = 170, ah = 250;
    q.fillStyle = '#2a1830'; archPath(q, ax, y0 - ah / 2 + 8, aw, ah); q.fill();
    q.fillStyle = rg(q, ax, y0 - 90, 0, 140, [[0, 'rgba(255,200,130,0.85)'], [1, 'rgba(255,170,110,0)']]); archPath(q, ax, y0 - ah / 2 + 8, aw, ah); q.fill();
    q.strokeStyle = '#8a7aa8'; q.lineWidth = 10; archPath(q, ax, y0 - ah / 2 + 8, aw + 14, ah + 10); q.stroke();
    q.fillStyle = 'rgba(0,0,0,0.25)'; q.fillRect(x0 - 40, y0 - 30, n * run + 240, 40);
    q.restore();
    for (let i = 0; i < 4; i++) { const px = x0 + 150 + i * 190; q.fillStyle = '#b86a4a'; q.beginPath(); q.moveTo(px - 24, y0 + 10); q.lineTo(px - 18, y0 - 30); q.lineTo(px + 18, y0 - 30); q.lineTo(px + 24, y0 + 10); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke(); q.fillStyle = i % 2 ? '#3e7a4a' : '#4a8a5a'; q.beginPath(); q.arc(px, y0 - 44, 26, 0, TAU); q.fill(); q.fillStyle = '#ff7aa8'; for (let j = 0; j < 5; j++) { q.beginPath(); q.arc(px - 16 + j * 8, y0 - 56 + (j % 2) * 10, 5, 0, TAU); q.fill(); } }
    for (let i = 0; i < n; i++) {
      const x = x0 + i * run, y = y0 - (i + 1) * rise;
      q.fillStyle = '#e8dcec'; q.fillRect(x, y, run + 60, rise); q.fillStyle = '#b8a8c8'; q.fillRect(x, y + rise - 8, run + 60, 8);
      q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(x, y, run + 60, rise);
    }
    // 栏杆 + 立柱
    q.strokeStyle = '#f4ecf4'; q.lineWidth = 7; q.beginPath(); q.moveTo(x0 + 20, y0 - 110); q.lineTo(x0 + n * run + 40, y0 - n * rise - 110); q.stroke();
    for (let i = 0; i <= n; i += 3) { const x = x0 + i * run + 26, y = y0 - i * rise - rise; q.fillStyle = '#f4ecf4'; q.fillRect(x - 6, y - 110, 12, 110); q.strokeStyle = ink; q.lineWidth = 2; q.strokeRect(x - 6, y - 110, 12, 110); }
  }
  const stairY = (x) => STAIR.y0 - clamp((x - STAIR.x0) / STAIR.run, 0, STAIR.n) * STAIR.rise;
  /** 第 m 级台阶（0 起）踏面的高度与中点 */
  const treadY = (m) => STAIR.y0 - (m + 1) * STAIR.rise, treadX = (m) => STAIR.x0 + (m + 0.5) * STAIR.run;
  /**
   * 她上台阶：先在街上跑到台阶下，然后一步两级地往上跑，每一步都正好落在踏面上（落地的瞬间正是跑步动画的脚着地）。
   * 最后一步落在最高一级（下一个镜头开头她就站在那里）
   */
  // 她从画面左边跑进来，约 2.6 秒时到台阶下，镜头结束时刚好上到一半（下一个镜头她已经站在最高一级）
  const CLIMB = { sp: 0.94, h: 330, x0: 2340, foot: STAIR.x0 - 30 };
  /** gs = 角色库给的跑步速度（像素 / 秒）与步态周期；一步两级 = 半个跑步周期 */
  function climbAt(lt, gs) {
    const T1 = (CLIMB.foot - CLIMB.x0) / gs.speed;
    if (lt < T1) return { x: CLIMB.x0 + gs.speed * lt, y: STAIR.y0 + 2, T1 };
    const u = (lt - T1) / (gs.period / 2), k = Math.min(8, Math.floor(u)), f = k >= 8 ? 0 : u - k;
    const P = (j) => (j <= 0 ? [CLIMB.foot, STAIR.y0 + 2] : [treadX(2 * j - 1), treadY(2 * j - 1) + 2]);
    const a = P(k), b = P(k + 1);
    return { x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f) - 4 * f * (1 - f) * 26, T1, top: k >= 8 };
  }
  function shotStairs(g, s) {
    const t = s.t, lt = s.lt, b0 = T0beat(s), bt = s.beat - b0;
    const k = ease.inOut(clamp(lt / 4));
    const cam = { x: lerp(3150, 3420, k), y: lerp(640, 420, k), z: lerp(1.05, 1.15, k), ...hand(s, 31, 4, 0.4) };
    town(g, s, cam, {
      street: (q) => {
        const { x0, run, rise, n } = STAIR;
        q.drawImage(LC(s, 'stairway', 1100, 900, (qq) => { qq.translate(-2950, -100); stairArt(qq); }, 1), 2950, 100, 1100, 900);
        // 台阶顶上的浓雾
        const topX = x0 + n * run, topY = STAIR.y0 - n * rise;
        for (let i = 0; i < 9; i++) withAlpha(q, 0.7, (qq) => qq.drawImage(puff(i, i % 2 ? '255,214,238' : '236,210,255'), topX - 300 + (i % 3) * 200 + Math.sin(t * 0.5 + i) * 30, topY - 220 + Math.floor(i / 3) * 90, 520, 260));
        E.glow(q, topX, topY - 60, 420, '255,190,230', 0.45);
        // 小羊：两级一跳，每次都落在踏面上，到顶“噗”
        for (let j = 0; j < 8; j++) {
          const b = bt * 1 - j * 0.5 + 1.5; if (b < 0) continue;
          const i = Math.floor(b), f = fract(b);
          const xa = x0 - 60 + i * run * 2, xb = xa + run * 2;
          if (xa > x0 + n * run - 30) { const pa = b - (n / 2 + 0.6); if (pa < 1.2) { sparkle(q, x0 + n * run + 20, stairY(x0 + n * run) - 40, 40 * (1 - pa / 1.2), (1 - pa / 1.2), pa * 3, '255,230,250'); withAlpha(q, 1 - pa / 1.2, (qq) => qq.drawImage(puff(j, '255,230,246'), x0 + n * run - 90, stairY(x0 + n * run) - 110, 220 * (1 + pa), 110 * (1 + pa))); } continue; }
          const y = lerp(stairY(xa), stairY(xb), f) - 4 * f * (1 - f) * 70;
          lamb(q, s, lerp(xa, xb, f), y, 60, { v: j, sq: hop(f)[1], glow: 1, pose: f > 0.15 && f < 0.85 ? 'jump' : 'stand', expr: 'laugh' });
        }
        // 叼着外套的三只小羊：在台阶上方一蹿一蹿地往上飞，到顶钻进雾里
        {
          const b = bt + 0.6, i = Math.floor(b), f = fract(b), xa = x0 - 60 + i * run * 2, xb = xa + run * 2, L = 165;
          const cx = lerp(xa, xb, f), cy = lerp(stairY(xa), stairY(xb), f) - L - 34 - 4 * f * (1 - f) * 40;
          const gone = sst(x0 + n * run - 200, x0 + n * run + 40, cx);
          if (gone < 1) coatTrio(q, s, t, [cx, cy], L, 60, 1, { seed: 9, alpha: 1 - gone });
        }
        // 她跑到台阶下，一步两级地往上跑（每一步都踩在踏面上）
        const gs = E.cast && E.cast.gait ? E.cast.gait('adele-alter', { h: CLIMB.h, pose: 'run', speed: CLIMB.sp }) : { speed: 240, period: 0.77 };
        const c = climbAt(lt, gs);
        cast(q, 'adele-alter', { x: c.x, y: c.y, h: CLIMB.h, pose: 'run', speed: CLIMB.sp, phase: -(s.shot.t0 + c.T1), outfit: 'home', t, expr: 'determined', look: [0.6, -0.6] });
      },
    });
    vig(g, s, 0.45);
  }

  /* ---------- 镜头 17 · 灯一盏盏熄了（64.18 → 68.35）：台阶顶上，她提着一盏灯回头，身后的灯笼一拍一盏地灭 ---------- */
  function shotLanternsOut(g, s) {
    const t = s.t, lt = s.lt, t0 = s.shot.t0;
    const cam = { x: 3560 - lt * 16, y: 170 + lt * 6, z: 0.92 + lt * 0.01, ...hand(s, 33, 3, 0.3) };
    // 一拍熄一排：按灯笼在画面上的位置（以镜头起点为准，远 / 近两层各自换算）从她身边往远处分 7 组，第 1..7 拍各熄一组
    const outAt = (seed, x) => {
      const d = seed >= 70 ? 0.85 : 0.55, z = 1 + (0.92 - 1) * d, sx = 960 + (x - (960 + (3560 - 960) * d)) * z;
      return t0 + (1 + Math.max(0, Math.min(6, Math.floor(((1880 - sx) / 1760) * 7)))) * BEAT - 0.05;
    };
    const out = (i, n, seed, x) => 1 - clamp((t - outAt(seed, x)) / 0.12);
    const dim = sst(0.2, 4.2, lt);
    townBack(g, s, cam, { out, moonX: 1500 });
    inCam(g, cam, 0.55, (q) => withAlpha(q, dim * 0.55, (qq) => fogBand(qq, t, { n: 12, seed: 151, x0: 1500, x1: 4400, y0: 350, y1: 800, w: 1000, h: 400, speed: 12, rgb: '220,190,240', a: 0.8 })));
    townNear(g, s, cam, {
      out,
      street: (q) => {
        q.drawImage(LC(s, 'stairway', 1100, 900, (qq) => { qq.translate(-2950, -100); stairArt(qq); }, 1), 2950, 100, 1100, 900);
        const ax = STAIR.x0 + STAIR.n * STAIR.run - 20, ay = stairY(ax + 20);
        // 她提着灯站在台阶顶上，回头看（官方小人的站姿，灯笼挂在手上）
        const ao = { x: ax, y: ay, h: 330, pose: 'stand', outfit: 'home', t, expr: 'sad', flip: true, look: [-1, 0.4], wind: 0.2 };
        carryLantern(q, s, ao, { halo: 0.7 });
      },
    });
    // 越来越浓的雾（盖住整个小镇）
    withAlpha(g, dim, (q) => { fogBand(q, t, { n: 10, seed: 152, y0: 300, y1: 1000, w: 1100, h: 420, speed: 16, rgb: '214,190,236', a: 0.55 }); haze(q, '120,90,160', 0, 200, VW, 1080, 0.35); });
    vig(g, s, 0.5);
  }

  /* ---------- 镜头 18 · 只剩她和一盏灯（68.35 → 72.53） ---------- */
  function fogWorld(g, s, cam, o = {}) {
    // 一片无边的雾：天是淡紫粉，地面是更亮的雾；几层慢慢流动
    const t = s.t;
    g.drawImage(LC(s, 'fog-sky', VW, VH, (q) => { q.fillStyle = vg(q, 0, VH, [[0, '#2a2044'], [0.45, '#6a5288'], [0.75, '#b89ac0'], [1, '#e8d0e0']]); q.fillRect(0, 0, VW, VH); }, 0.25), 0, 0, VW, VH);
    inCam(g, cam, 0.1, (q) => { if (o.moon !== false) { withAlpha(q, o.moonA ?? 0.35, (qq) => qq.drawImage(bigMoon(), 1300, 30, 520, 520)); } });
    inCam(g, cam, 0.3, (q) => fogBand(q, t, { n: 10, seed: 161, y0: 250, y1: 800, w: 1200, h: 460, speed: 10, rgb: '236,214,246', a: 0.6 }));
    inCam(g, cam, 0.6, (q) => fogBand(q, t, { n: 9, seed: 162, y0: 450, y1: 950, w: 1100, h: 420, speed: 16, rgb: '255,220,240', a: 0.55 }));
    if (o.mid) inCam(g, cam, 1, o.mid);
    inCam(g, cam, 1.2, (q) => fogBand(q, t, { n: 8, seed: 163, y0: 800, y1: 1150, w: 1200, h: 460, speed: 24, rgb: '255,236,248', a: 0.6 }));
    if (o.front) inCam(g, cam, 1.3, o.front);
  }
  function shotAlone(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 960, y: 560, z: lerp(1.25, 1.0, ease.out(clamp(lt / 4))), ...hand(s, 35, 3, 0.25) };
    fogWorld(g, s, cam, {
      moonA: 0.3,
      mid: (q) => {
        const ax = 900, ay = 880, ao = { x: ax, y: ay, h: 250, pose: 'stand', outfit: 'home', t, expr: 'neutral', look: [0.3, -0.2] };
        carryLantern(q, s, ao, { halo: 0.9 });
        // 远处最后几盏灯笼的影子，慢慢被雾吞掉
        for (let i = 0; i < 5; i++) { const a = 0.5 * (1 - sst(0.2 + i * 0.5, 1.6 + i * 0.5, lt)); if (a > 0.01) E.glow(q, 300 + i * 340, 520 + (i % 2) * 60, 40, '255,190,120', a); }
      },
    });
    sparkles(g, t, 10, 10, '255,236,250');
    vig(g, s, 0.55);
  }

  /* =========================================================
   * 间奏 A · 雾中之忆（72.53 → 91.31，低音退出）：浓雾、回忆的碎片、雾里的餐桌、两只小黑羊
   * ========================================================= */
  const MEM = { ink: '255,214,150', fill: 'rgba(255,226,180,0.16)' };
  /** 回忆里的东西：金色线描 + 很淡的填色；a 为出现程度，dis 为消散（化成光点） */
  function memGlowLine(g, fn, a) {
    if (a <= 0.01) return;
    g.save(); g.globalAlpha *= a; g.lineJoin = 'round'; g.lineCap = 'round';
    g.fillStyle = MEM.fill; g.strokeStyle = `rgba(${MEM.ink},0.85)`; g.lineWidth = 4; fn(g, true);
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(${MEM.ink},0.3)`; g.lineWidth = 12; fn(g, false);
    g.restore();
  }
  function memDust(g, t, x, y, w, h, a, seed) {
    for (let i = 0; i < 26; i++) { const ph = fract(t * 0.3 + hash(seed, i)); const px = x + hash(seed, i, 1) * w + Math.sin(ph * 6 + i) * 14, py = y + hash(seed, i, 2) * h - ph * 80; E.glow(g, px, py, 7 + hash(seed, i, 3) * 8, MEM.ink, a * Math.sin(PI * ph)); }
  }
  function memRadio(g, x, y, k, t, bp) {
    g.save(); g.translate(x, y); g.scale(k, k);
    const shape = (q, fill) => {
      q.beginPath(); rrect(q, -172, -208, 344, 208, 32); if (fill) q.fill(); q.stroke();
      q.beginPath(); q.arc(-82, -104, 70, 0, TAU); q.stroke();
      q.beginPath(); rrect(q, 14, -180, 140, 56, 12); q.stroke();
      q.beginPath(); q.moveTo(-98, -208); q.bezierCurveTo(-92, -268, 92, -268, 98, -208); q.stroke();
      for (const kx of [44, 124]) { q.beginPath(); q.arc(kx, -34, 15, 0, TAU); q.stroke(); }
      q.beginPath(); for (let r = 20; r < 70; r += 16) { q.moveTo(-82 + r, -104); q.arc(-82, -104, r, 0, TAU); } q.stroke();
    };
    memGlowLine(g, shape, 1);
    E.glow(g, 84, -152, 120, '255,200,110', 0.5);
    // 声波
    for (let j = 0; j < 2; j++) { const ph = (bp + j * 0.5) % 1; g.strokeStyle = `rgba(255,226,170,${(1 - ph) * 0.5})`; g.lineWidth = 5; g.beginPath(); g.arc(-82, -104, 90 + ph * 170, PI * 0.72, PI * 1.28); g.stroke(); }
    g.restore();
  }
  function memTape(g, x, y, k, t) {
    g.save(); g.translate(x, y); g.scale(k, k); g.rotate(Math.sin(t * 0.8) * 0.08);
    const ang = t * 1.2 * TAU;
    memGlowLine(g, (q, fill) => {
      q.beginPath(); rrect(q, -130, -82, 260, 164, 12); if (fill) q.fill(); q.stroke();
      q.beginPath(); rrect(q, -114, -70, 228, 96, 8); q.stroke();
      q.beginPath(); rrect(q, -58, -12, 116, 36, 12); q.stroke();
      for (const [cx, r] of [[-36, 22], [36, 15]]) { q.beginPath(); q.arc(cx, 6, r, 0, TAU); q.stroke(); q.beginPath(); for (let i = 0; i < 6; i++) { const a = ang + (i * TAU) / 6; q.moveTo(cx + Math.cos(a) * 5, 6 + Math.sin(a) * 5); q.lineTo(cx + Math.cos(a) * 12, 6 + Math.sin(a) * 12); } q.stroke(); }
      q.beginPath(); q.moveTo(-80, 82); q.lineTo(-64, 44); q.lineTo(64, 44); q.lineTo(80, 82); q.stroke();
    }, 1);
    g.fillStyle = 'rgba(226,87,76,0.55)'; g.fillRect(-114, -70, 228, 16);
    E.text(g, 'Before Summer', 0, -30, { font: 'hand', size: 26, color: 'rgba(255,236,200,0.9)' });
    g.restore();
  }
  function memCoat(g, x, y, k, t) {
    g.save(); g.translate(x, y); g.rotate(Math.sin(t * 0.9) * 0.03); g.scale(k, k);
    memGlowLine(g, (q, fill) => {
      q.beginPath(); q.moveTo(0, -12); q.quadraticCurveTo(12, -26, 2, -32); q.stroke();
      q.beginPath(); q.moveTo(-58, 18); q.quadraticCurveTo(0, -4, 58, 18); q.lineTo(74, 250); q.quadraticCurveTo(0, 270, -74, 250); q.closePath(); if (fill) q.fill(); q.stroke();
      q.beginPath(); q.moveTo(-58, 20); q.quadraticCurveTo(-84, 90, -80, 210); q.lineTo(-58, 214); q.quadraticCurveTo(-60, 120, -44, 40); q.moveTo(58, 20); q.quadraticCurveTo(84, 90, 80, 210); q.lineTo(58, 214); q.quadraticCurveTo(60, 120, 44, 40); q.stroke();
      q.beginPath(); q.moveTo(-40, 14); q.lineTo(-4, 58); q.lineTo(-18, 6); q.moveTo(40, 14); q.lineTo(4, 58); q.lineTo(18, 6); q.stroke();
    }, 1);
    g.fillStyle = 'rgba(226,87,76,0.75)'; g.fillRect(-50, 127, 100, 7); g.fillRect(-81, 186, 23, 8); g.fillRect(58, 186, 23, 8);
    g.restore();
  }
  /* ---------- 镜头 19 · 雾里走（72.53 → 76.72） ---------- */
  function lanternHalo(g, x, y, t, a = 1) {
    E.glow(g, x, y, 520, '255,190,130', 0.28 * a);
    E.glow(g, x, y, 200, '255,210,150', 0.45 * a);
    E.glow(g, x, y, 50, '255,244,220', 0.9 * a);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) { const an = (i / 7) * TAU + t * 0.08, len = 300 + 80 * Math.sin(t * 0.7 + i); g.fillStyle = `rgba(255,210,150,${0.05 * a})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an - 0.06) * len, y + Math.sin(an - 0.06) * len); g.lineTo(x + Math.cos(an + 0.06) * len, y + Math.sin(an + 0.06) * len); g.closePath(); g.fill(); }
    g.restore();
  }
  function looming(g, t, x, y, h, kind, a) {
    // 雾里若隐若现的影子：路灯 / 树 / 屋角
    if (a <= 0.01) return;
    g.save(); g.globalAlpha *= a; g.fillStyle = '#6a5a86';
    if (kind === 0) { g.fillRect(x - 6, y - h, 12, h); g.beginPath(); g.moveTo(x - 24, y - h); g.lineTo(x + 24, y - h); g.lineTo(x + 14, y - h - 40); g.lineTo(x - 14, y - h - 40); g.closePath(); g.fill(); }
    else if (kind === 1) { palm(g, x, y, h, t, { seed: 170 + (x | 0), col: '#6a5a86', n: 8 }); }
    else { g.fillRect(x - h * 0.4, y - h, h * 0.8, h); g.beginPath(); g.moveTo(x - h * 0.45, y - h); g.lineTo(x, y - h * 1.3); g.lineTo(x + h * 0.45, y - h); g.closePath(); g.fill(); }
    g.restore();
  }
  function shotMistWalk(g, s) {
    const t = s.t, lt = s.lt;
    const ax = 640 + lt * 80, cam = { x: 900 + lt * 60, y: 560, z: 1.1, ...hand(s, 37, 3, 0.25) };
    fogWorld(g, s, cam, {
      moonA: 0.18,
      mid: (q) => {
        for (let i = 0; i < 6; i++) { const x = 200 + i * 420, a = 0.35 * win(ax - x, -900, -500, 200, 700); looming(q, t, x, 920, [520, 460, 300][i % 3], i % 3, a); }
        const ao = { x: ax, y: 920, h: 330, pose: 'walk', speed: stepSpeed('adele-alter', { h: 330, pose: 'walk' }, 80, 0.9), outfit: 'home', t, expr: 'neutral', look: [0.5, -0.1] };
        carryLantern(q, s, ao);
        for (let i = 0; i < 8; i++) { const ph = fract(t * 0.15 + i / 8); bubble(q, 400 + hash(181, i) * 1400, 1000 - ph * 900, 8 + hash(182, i) * 10, 0.4 * Math.sin(PI * ph)); }
      },
    });
    s.post.grade(g, '#8a7aa0', 0.25, 'soft-light');
    vig(g, s, 0.6);
  }
  /* ---------- 镜头 20 · 回忆的碎片（76.72 → 80.89）：收音机、磁带、门边的外套，一碰就散 ---------- */
  function shotMemories(g, s) {
    const t = s.t, lt = s.lt, t0 = s.shot.t0;
    const cam = { x: 900 + lt * 140, y: 560, z: 1.05, ...hand(s, 39, 3, 0.25) };
    const ax = 700 + lt * 130;
    fogWorld(g, s, cam, {
      moonA: 0.12,
      mid: (q) => {
        // 窗台上的收音机（片 I 的清晨）、写着 Before Summer 的磁带、门边挂着的那件外套：她走近，它们就化成光点散开
        const fr = [
          { x: 1000, y: 560, at: 0.05, fn: (qq, a) => { memGlowLine(qq, (q3) => { q3.beginPath(); q3.rect(800, 250, 400, 460); q3.moveTo(1000, 250); q3.lineTo(1000, 710); q3.moveTo(800, 480); q3.lineTo(1200, 480); q3.moveTo(770, 712); q3.lineTo(1230, 712); q3.stroke(); }, a * 0.7); withAlpha(qq, a, (q3) => memRadio(q3, 1000, 706, 0.78, t, s.bp)); } },
          { x: 1560, y: 470, at: 1.15, fn: (qq, a) => withAlpha(qq, a, (q3) => memTape(q3, 1560, 470, 1.25, t)) },
          { x: 2150, y: 420, at: 2.3, fn: (qq, a) => { memGlowLine(qq, (q3) => { q3.beginPath(); q3.moveTo(2040, 930); q3.lineTo(2040, 260); q3.lineTo(2300, 260); q3.lineTo(2300, 930); q3.stroke(); q3.beginPath(); q3.arc(2270, 600, 8, 0, TAU); q3.stroke(); }, a * 0.6); withAlpha(qq, a, (q3) => memCoat(q3, 2150, 330, 1.35, t)); } },
        ];
        for (const f of fr) {
          const appear = sst(f.at, f.at + 0.9, lt), dis = sst(0, 1, (ax - f.x + 60) / 260);
          const a = appear * (1 - dis);
          if (a > 0.01) { E.glow(q, f.x, f.y, 380, MEM.ink, 0.18 * a); f.fn(q, a); }
          if (dis > 0 && dis < 1) memDust(q, t, f.x - 180, f.y - 200, 360, 400, Math.sin(PI * dis), 190 + f.at * 10);
        }
        // 一边走一边伸手（腿一直在走，步频配上 130 像素 / 秒的速度，不会“滑”过去）
        // 提着灯一路走过去，回忆一靠近就散开（官方小人的走路，灯笼挂在手上）
        const ao = { x: ax, y: 920, h: 330, pose: 'walk', speed: stepSpeed('adele-alter', { h: 330, pose: 'walk' }, 130, 1.48), outfit: 'home', t, expr: 'sad', look: [0.6, -0.35] };
        carryLantern(q, s, ao, { halo: 0.9 });
      },
    });
    s.post.grade(g, '#8a7aa0', 0.25, 'soft-light');
    vig(g, s, 0.6);
  }
  /* ---------- 雾里的餐桌 ---------- */
  const TB = { x: 1020, y: 800 }; // 桌面中心
  function tableChairArt(q) {
    // 桌子后面的那把空椅子（椅背）
    const ink = 'rgba(40,20,30,0.9)', { x, y } = TB;
    q.fillStyle = '#6a4232'; q.strokeStyle = ink; q.lineWidth = 3;
    q.fillRect(x - 70, y - 220, 16, 230); q.fillRect(x + 54, y - 220, 16, 230); rrect(q, x - 78, y - 236, 156, 30, 12); q.fill(); q.stroke();
    q.fillRect(x - 60, y - 170, 120, 12); q.fillRect(x - 60, y - 120, 120, 12);
  }
  function tableArt(q) {
    const ink = 'rgba(40,20,30,0.9)', { x, y } = TB;
    // 桌布
    q.fillStyle = '#f6eee8'; q.beginPath(); q.ellipse(x, y, 330, 60, 0, 0, TAU); q.fill();
    q.beginPath(); q.moveTo(x - 330, y); q.bezierCurveTo(x - 340, y + 60, x - 320, y + 140, x - 300, y + 150); for (let i = 0; i <= 10; i++) { const u = i / 10; q.lineTo(x - 300 + u * 600, y + 150 + Math.sin(u * PI * 5) * 10 + Math.sin(u * PI) * 20); } q.bezierCurveTo(x + 320, y + 140, x + 340, y + 60, x + 330, y); q.closePath(); q.fill();
    q.strokeStyle = 'rgba(160,130,140,0.5)'; q.lineWidth = 3; for (let i = 0; i < 7; i++) { const xx = x - 270 + i * 90; q.beginPath(); q.moveTo(xx, y + 50); q.quadraticCurveTo(xx + 8, y + 110, xx + 4, y + 160); q.stroke(); }
    q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.ellipse(x, y, 330, 60, 0, PI, TAU); q.stroke();
    // 桌上：盘子、茶壶、花瓶、面包、一张折起来的地图（乌纳圈了红圈）
    for (const [px, py] of [[x - 170, y + 6], [x + 170, y + 6], [x, y + 22]]) { q.fillStyle = '#ffffff'; q.beginPath(); q.ellipse(px, py, 58, 14, 0, 0, TAU); q.fill(); q.strokeStyle = 'rgba(120,100,120,0.6)'; q.lineWidth = 2; q.stroke(); q.beginPath(); q.ellipse(px, py, 38, 8, 0, 0, TAU); q.stroke(); }
    q.fillStyle = '#e8a870'; q.beginPath(); q.ellipse(x - 60, y - 16, 30, 13, -0.2, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke();
    q.fillStyle = '#fbf4e4'; q.save(); q.translate(x + 60, y - 10); q.rotate(0.12); q.fillRect(-46, -12, 92, 26); q.strokeStyle = 'rgba(100,80,60,0.6)'; q.strokeRect(-46, -12, 92, 26); q.strokeStyle = '#d84a3a'; q.lineWidth = 2.5; q.beginPath(); q.ellipse(14, 0, 12, 7, 0, 0, TAU); q.stroke(); q.restore();
    q.fillStyle = '#7a9ac8'; q.beginPath(); q.moveTo(x + 250, y - 6); q.lineTo(x + 236, y - 56); q.lineTo(x + 264, y - 56); q.closePath(); q.fill(); q.strokeStyle = ink; q.stroke();
    q.strokeStyle = '#4a8a5a'; q.lineWidth = 3; q.beginPath(); q.moveTo(x + 250, y - 56); q.lineTo(x + 246, y - 96); q.stroke();
    q.fillStyle = '#ff8ab4'; for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; q.beginPath(); q.ellipse(x + 246 + Math.cos(a) * 9, y - 100 + Math.sin(a) * 9, 8, 5, a, 0, TAU); q.fill(); } q.fillStyle = '#ffe08a'; q.beginPath(); q.arc(x + 246, y - 100, 5, 0, TAU); q.fill();
    q.fillStyle = '#f0e8f4'; rrect(q, x - 280, y - 60, 70, 56, 16); q.fill(); q.strokeStyle = ink; q.lineWidth = 2.5; q.stroke(); q.beginPath(); q.moveTo(x - 212, y - 44); q.quadraticCurveTo(x - 190, y - 50, x - 186, y - 70); q.stroke(); q.fillStyle = '#c8a8d8'; q.fillRect(x - 256, y - 70, 22, 10);
  }
  function sideChair(q, x, y, flip) {
    const ink = 'rgba(40,20,30,0.9)', d = flip ? -1 : 1;
    q.fillStyle = '#6a4232'; q.strokeStyle = ink; q.lineWidth = 3;
    q.fillRect(x - 60, y - 90, 120, 16); q.strokeRect(x - 60, y - 90, 120, 16);
    q.fillRect(x - 56, y - 76, 12, 170); q.fillRect(x + 44, y - 76, 12, 170);
    q.fillRect(x - d * 60 - 8, y - 300, 16, 220); q.strokeRect(x - d * 60 - 8, y - 300, 16, 220);
    rrect(q, x - d * 60 - 14, y - 310, 28, 60, 8); q.fill(); q.stroke();
  }
  function hangLamp(g, x, y, t, a = 1) {
    const sw = Math.sin(t * 0.8) * 0.03;
    g.save(); g.translate(x, -60); g.rotate(sw);
    g.strokeStyle = '#2a1a24'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, y + 60 - 70); g.stroke();
    g.translate(0, y + 60 - 70);
    g.fillStyle = '#3e5a4a'; g.beginPath(); g.moveTo(-26, 0); g.quadraticCurveTo(0, -20, 26, 0); g.lineTo(90, 60); g.lineTo(-90, 60); g.closePath(); g.fill(); g.strokeStyle = '#1a1018'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#fff4d0'; g.beginPath(); g.ellipse(0, 60, 88, 12, 0, 0, TAU); g.fill();
    g.restore();
    const lx = x + Math.sin(sw) * (y + 60), ly = y + 10;
    E.glow(g, lx, ly, 90, '255,244,210', 0.9 * a);
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.22 * a;
    g.fillStyle = vg(g, ly, ly + 460, [[0, 'rgba(255,220,160,1)'], [1, 'rgba(255,220,160,0)']]);
    g.beginPath(); g.moveTo(lx - 80, ly); g.lineTo(lx + 80, ly); g.lineTo(lx + 420, ly + 460); g.lineTo(lx - 420, ly + 460); g.closePath(); g.fill();
    g.restore();
    E.glow(g, lx, ly + 240, 420, '255,190,130', 0.3 * a);
  }
  /** 餐桌场景：o: { sit(0..1 她坐下), adeleX, sheepLook, dadTug, momTilt, fizz } */
  function tableScene(g, s, cam, o = {}) {
    const t = s.t;
    fogWorld(g, s, cam, {
      moon: false,
      mid: (q) => {
        E.glow(q, TB.x, TB.y - 40, 700, '255,196,140', 0.2);
        q.drawImage(LC(s, 'dinner-chair', 800, 520, (qq) => { qq.translate(-TB.x + 400, -TB.y + 300); tableChairArt(qq); }, 1.3), TB.x - 400, TB.y - 300, 800, 520);
        if (o.seated) o.seated(q);
        q.drawImage(LC(s, 'dinner-table', 800, 520, (qq) => { qq.translate(-TB.x + 400, -TB.y + 300); tableArt(qq); }, 1.3), TB.x - 400, TB.y - 300, 800, 520);
        sideChair(q, TB.x - 360, TB.y + 140, false); sideChair(q, TB.x + 360, TB.y + 140, true);
        const V = 150;
        const dadH = sheepH('dad', 'sit', V), momH = sheepH('mom', 'sit', V);
        cast(q, 'sheep-black', { x: TB.x - 350, y: TB.y + 52, h: dadH, pose: 'sit', t, ...DAD, flip: o.sheepLook === -1 ? true : false, expr: o.sheepExpr || 'smile', heat: o.heat || 0 });
        cast(q, 'sheep-black', { x: TB.x + 350, y: TB.y + 52, h: momH, pose: 'sit', t: t + 1.3, ...MOM, flip: true, expr: o.sheepExpr || 'smile', heat: o.heat || 0 });
        if (o.bottle !== false) { bottle(q, s, TB.x + 120, TB.y - 4, 96, 0); if (o.fizz) fizz(q, t, { t0: o.fizz, x: TB.x + 124, y: TB.y - 92, n: 60, dur: 1.2, speed: 380, r: 9, rise: 260, life: 1.2, spread: 0.8, seed: 201 }); }
        if (o.adele) o.adele(q);
        hangLamp(q, TB.x, 330, t, o.lamp ?? 1);
      },
      front: o.front,
    });
  }
  /* ---------- 镜头 21 · 雾里的餐桌（80.89 → 85.06） ---------- */
  function shotTable(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp(lt / 4));
    const cam = { x: lerp(820, 940, k), y: 600, z: lerp(1.0, 1.06, k), ...hand(s, 41, 2, 0.2) };
    tableScene(g, s, cam, {
      sheepLook: lt > 1.6 ? -1 : 1,
      // 她提着灯走近，第 1 秒停下（走的那一段步频配上速度，停下以后才换成站姿）
      adele: (q) => { const wk = { h: 340, pose: 'walk', speed: 0.8 }, v = E.cast && E.cast.gait ? E.cast.gait('adele-alter', wk).speed : 72; const ao = { x: 420 - v * Math.max(0, 1 - lt), y: 930, h: 340, pose: lt < 1 ? 'walk' : 'stand', speed: wk.speed, outfit: 'home', t, expr: 'surprise', look: [1, 0] }; carryLantern(q, s, ao, { halo: 0.8 }); },
    });
    s.post.grade(g, '#8a7aa0', 0.18, 'soft-light');
    vig(g, s, 0.62);
  }
  /* ---------- 镜头 22 · 熟悉的小动作（85.06 → 89.23）：爸爸羊扶了扶领带，妈妈羊歪着头；她蹲下伸出手 ---------- */
  function shotMeet(g, s) {
    const t = s.t, lt = s.lt;
    if (lt < BEAT * 4) {
      // 两只羊的特写
      const cam = { x: 1020, y: 700, z: 1.6 + lt * 0.02, ...hand(s, 43, 2, 0.2) };
      tableScene(g, s, cam, { sheepLook: -1 });
      inCam(g, cam, 1, (q) => {
        // 爸爸羊扶领带：领带左右一晃 + 小小的“嗯”
        const dh = anchor('sheep-black', { x: TB.x - 350, y: TB.y + 52, h: sheepH('dad', 'sit', 150), pose: 'sit', ...DAD, flip: true }, 'head', [TB.x - 390, TB.y - 40]);
        const mh = anchor('sheep-black', { x: TB.x + 350, y: TB.y + 52, h: sheepH('mom', 'sit', 150), pose: 'sit', ...MOM, flip: true }, 'head', [TB.x + 310, TB.y - 40]);
        const tug = win(lt, 0.3, 0.45, 0.8, 1.0);
        if (tug > 0) { q.strokeStyle = `rgba(255,240,230,${tug * 0.85})`; q.lineWidth = 4; q.lineCap = 'round'; for (let i = 0; i < 3; i++) { const a = -PI / 2 + (i - 1) * 0.5; q.beginPath(); q.moveTo(dh[0] + Math.cos(a) * 60, dh[1] - 20 + Math.sin(a) * 50); q.lineTo(dh[0] + Math.cos(a) * 86, dh[1] - 20 + Math.sin(a) * 74); q.stroke(); } q.lineCap = 'butt'; }
        const tilt = win(lt, 1.0, 1.3, 1.8, 2.05);
        if (tilt > 0) withAlpha(q, tilt, (qq) => E.text(qq, '?', mh[0] - 10, mh[1] - 70, { size: 54, weight: 900, color: '#fff0f6', stroke: 'rgba(80,40,70,0.5)', strokeW: 8 }));
      });
    } else {
      // 她在桌边的椅子上坐下；妈妈羊走过来，闭着眼把脸蹭在她膝上（官方小人的坐姿，手放在腿上）
      const u = lt - BEAT * 4;
      const cam = { x: 1000, y: 720, z: 1.55 + u * 0.03, ...hand(s, 45, 2, 0.2) };
      fogWorld(g, s, cam, {
        moon: false,
        mid: (q) => {
          E.glow(q, 1000, 700, 560, '255,196,140', 0.3);
          const nuzzle = ease.inOut(clamp((u - 0.35) / 0.9));
          const floor = 935, chx = 870, AH = 400;
          groundShadow(q, chx, floor + 2, 100, 0.5);
          const seatY = chibiChair(q, chx, floor, SIT_DROP * AH, 150, false);
          const ao = sitOn({ x: chx + 4, h: AH, outfit: 'home', t, expr: nuzzle > 0.5 ? 'tearful' : 'smile', look: [0.8, 0.5] }, seatY);
          const hn = anchor('adele-alter', ao, 'handN', [940, 840]);
          const mh0 = sheepH('mom', 'stand', 150), hx = anchor('sheep-black', { x: 0, y: 0, h: mh0, pose: 'stand', ...MOM, flip: true }, 'head', [-40, -110]);
          // 羊头停在她膝前（手在腿上）：mo.x = 手的 x − 头相对脚底的偏移
          const walking = nuzzle > 0.02 && nuzzle < 0.97;
          const mo = { x: lerp(hn[0] - hx[0] + 170, hn[0] - hx[0] + 26, nuzzle), y: floor, h: mh0, pose: walking ? 'walk' : 'stand', t: walking ? gaitTime('sheep-black', { h: mh0, pose: 'walk' }, 144 * nuzzle, s.shot.t0) : t, ...MOM, flip: true, expr: nuzzle > 0.5 ? 'closed' : 'smile', heat: nuzzle * 0.8 };
          cast(q, 'adele-alter', ao);
          groundShadow(q, mo.x, mo.y + 2, 70, 0.45);
          cast(q, 'sheep-black', mo);
          if (nuzzle > 0.5) { const [hx, hy] = anchor('sheep-black', mo, 'head', [mo.x - 40, mo.y - 110]); for (let i = 0; i < 3; i++) { const ph = fract(t * 0.6 + i / 3); withAlpha(q, Math.sin(PI * ph) * (nuzzle - 0.5) * 2, (qq) => E.text(qq, '♥', hx - 20 + i * 26, hy - 50 - ph * 90, { size: 24 + i * 6, color: '#ff9ac0' })); } }
        },
      });
    }
    s.post.grade(g, '#8a7aa0', 0.18, 'soft-light');
    vig(g, s, 0.62);
  }
  /* ---------- 镜头 23 · 屏住呼吸的一小节（89.23 → 91.31）：她坐进那把空椅子；然后汽水冒了 ---------- */
  function shotHush(g, s) {
    const t = s.t, lt = s.lt, t0 = s.shot.t0;
    const cam = { x: 1020, y: 640, z: 1.12 - lt * 0.01 };
    const fizzT = D[43] - 0.42;
    const burst = clamp((t - fizzT) / 0.42);
    tableScene(g, s, cam, {
      sheepLook: -1, fizz: fizzT, lamp: 1 - 0.25 * win(lt, 0.5, 0.9, 1.4, 1.6), heat: 0.7, sheepExpr: 'content',
      seated: (q) => cast(q, 'adele-alter', { x: TB.x, y: TB.y + 96, h: 340, pose: 'sit', outfit: 'home', t, expr: 'content', look: [0, 0.3] }),
    });
    if (burst > 0) { risingBubbles(g, t, { t0: fizzT, n: 80, x: 200, w: 1500, y0: 1100, h: 1200, seed: 211, a: 0.9 }); s.post.fill(g, '#ffe8f4', burst * burst * 0.8, 'lighter'); }
    s.post.grade(g, '#8a7aa0', 0.2 * (1 - burst), 'soft-light');
    vig(g, s, 0.7 - burst * 0.3);
  }

  /* =========================================================
   * 副歌 B · 汽水海（91.31 → 108.01）：冒泡的粉色海、汽水瓶小船、会随拍子收缩的水母灯
   * 海平线 y = 610（世界坐标，相机 d=1 时）
   * ========================================================= */
  const SEA = 610;
  function seaSky(q) {
    q.fillStyle = vg(q, 0, SEA + 20, [[0, '#0a0826'], [0.35, '#1c1448'], [0.7, '#4a2470'], [0.9, '#a2468a'], [1, '#ff9ab8']]); q.fillRect(0, 0, VW, VH);
    const R = E.rng(51); for (let i = 0; i < 420; i++) { const y = Math.pow(R(), 1.3) * SEA; q.fillStyle = `rgba(255,240,250,${(0.15 + R() * 0.5) * (1 - y / 700)})`; q.fillRect(R() * VW, y, 1.5, 1.5); }
    q.save(); q.translate(1100, 250); q.rotate(-0.4); q.fillStyle = rg(q, 0, 0, 0, 800, [[0, 'rgba(190,150,255,0.18)'], [1, 'rgba(190,150,255,0)']]); q.scale(1, 0.18); q.beginPath(); q.arc(0, 0, 800, 0, TAU); q.fill(); q.restore();
  }
  function seaWater(q) {
    // 世界宽 -400..2400，y SEA..1300
    q.fillStyle = vg(q, SEA, 1300, [[0, '#ff9cc0'], [0.04, '#e070a8'], [0.2, '#9a3c8e'], [0.6, '#4a2066'], [1, '#1e1036']]); q.fillRect(-400, SEA, 2800, 700);
    const R = E.rng(52);
    for (let i = 0; i < 900; i++) {
      const y = SEA + 3 + Math.pow(R(), 1.7) * 690, near = (y - SEA) / 690, x = -400 + R() * 2800;
      q.fillStyle = `rgba(255,${200 + R() * 55 | 0},${220 + R() * 35 | 0},${(0.06 + R() * 0.18) * (1 - near * 0.5)})`;
      q.fillRect(x, y, 6 + (1 - near) * 30 + near * 40, 1 + near * 3);
    }
  }
  /** 海面上随时冒起来的小气泡（从水下浮上来，在海面“啵”地破掉） */
  function seaFizz(g, t, cam, n, seed) {
    for (let i = 0; i < n; i++) {
      const life = 1.2 + hash(seed, i, 1) * 1.4, ph = fract(t / life + hash(seed, i, 2)), cyc = Math.floor(t / life + hash(seed, i, 2));
      const y = SEA + 6 + Math.pow(hash(seed, i * 5 + cyc, 3), 1.6) * 460, near = (y - SEA) / 460;
      const x = -300 + hash(seed, i * 5 + cyc, 4) * 2600;
      const r = (2 + near * 9) * (0.6 + 0.8 * hash(seed, i, 5));
      if (ph < 0.8) bubble(g, x, y - ph * r * 3, r, 0.7 * Math.sin(PI * ph / 0.8));
      else sparkle(g, x, y - r * 3, r * 2.4, (1 - (ph - 0.8) / 0.2) * 0.8, 0, '255,230,245');
    }
  }
  function moonPath(g, t, x, a = 1) {
    for (let i = 0; i < 26; i++) {
      const y = SEA + 8 + i * i * 0.9, w = 60 + i * 8 + Math.sin(t * 1.6 + i * 1.3) * 20;
      g.globalAlpha = a * 0.34 * (1 - i / 26) * (0.6 + 0.4 * Math.sin(t * 2.3 + i));
      g.fillStyle = '#fff0f6'; g.fillRect(x - w / 2 + Math.sin(t + i * 0.8) * 10, y, w, 2 + i * 0.2);
    }
    g.globalAlpha = 1;
  }
  /** 汽水瓶小船：一只剖开的大玻璃瓶当船身，瓶颈翘在船头（红瓶盖），标签当帆 */
  function bottleBoat(g, s, x, y, sc, t, o = {}) {
    const rock = Math.sin(t * 1.4 + (o.seed || 0)) * 0.035 + (o.bob || 0) * 0.02;
    g.save(); g.translate(x, y); g.rotate(rock); g.scale(sc, sc);
    // 桅杆 + 帆（标签）
    g.strokeStyle = '#6a4a3a'; g.lineWidth = 7; g.beginPath(); g.moveTo(-10, -30); g.lineTo(-10, -330); g.stroke();
    const flap = Math.sin(t * 3 + (o.seed || 0)) * 10;
    g.fillStyle = '#fff4f8'; g.beginPath(); g.moveTo(-4, -320); g.quadraticCurveTo(110 + flap, -250, 140, -120); g.lineTo(-4, -110); g.closePath(); g.fill();
    g.strokeStyle = '#3a2430'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#ff7eb0'; g.fillRect(-4, -300, 70 + flap * 0.3, 12); g.fillRect(-4, -150, 128, 12);
    g.fillStyle = '#ffffff'; for (const [cx, cy, r] of [[50, -214, 20], [72, -222, 22], [90, -210, 18], [66, -200, 20]]) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); }
    g.fillStyle = '#3a2430'; g.beginPath(); g.ellipse(34, -210, 9, 11, -0.3, 0, TAU); g.fill();
    // 桅杆上的灯笼
    g.restore();
    if (o.lantern !== false) { const lx = x + Math.sin(rock) * 330 * sc - 10 * sc, ly = y - Math.cos(rock) * 330 * sc; lantern(g, s, lx, ly, 46 * sc, 2, Math.sin(t * 1.7) * 0.12); }
    g.save(); g.translate(x, y); g.rotate(rock); g.scale(sc, sc);
    // 船里横着一条长凳（让两只羊坐得高一点）
    g.fillStyle = '#8a5a3a'; g.fillRect(-270, -44, 540, 12); g.fillStyle = 'rgba(255,220,180,0.3)'; g.fillRect(-270, -44, 540, 3);
    if (o.riders) o.riders(g, rock);
    // 船身：半透明玻璃 + 粉色汽水
    const hull = () => { g.beginPath(); g.moveTo(-300, -60); g.quadraticCurveTo(-310, 40, -220, 50); g.lineTo(200, 50); g.quadraticCurveTo(290, 40, 300, -20); g.bezierCurveTo(330, -40, 360, -70, 380, -110); g.lineTo(400, -104); g.bezierCurveTo(390, -50, 330, -10, 310, 10); g.lineTo(300, -60); g.closePath(); };
    hull(); g.fillStyle = 'rgba(170,236,232,0.45)'; g.fill();
    g.save(); hull(); g.clip();
    g.fillStyle = vg(g, -20, 60, [[0, 'rgba(255,150,200,0.85)'], [1, 'rgba(230,80,150,0.95)']]); g.fillRect(-320, -16, 720, 80);
    g.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 12; i++) { const ph = fract(t * 0.8 + hash(221, i)); g.beginPath(); g.arc(-260 + hash(222, i) * 520, 40 - ph * 50, 2 + hash(223, i) * 3, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-280, -50, 520, 6);
    g.restore();
    hull(); g.strokeStyle = '#1f3a44'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#e0424e'; rrect(g, 378, -128, 30, 22, 5); g.fill(); g.strokeStyle = '#6a1a22'; g.lineWidth = 3; g.stroke();
    g.restore();
    // 倒影 + 船边的泡沫
    withAlpha(g, 0.35, (q) => { q.fillStyle = 'rgba(255,200,230,0.6)'; q.beginPath(); q.ellipse(x, y + 60 * sc, 330 * sc, 18 * sc, 0, 0, TAU); q.fill(); });
    for (let i = 0; i < 10; i++) { const ph = fract(t * 0.9 + i / 10); bubble(g, x + (-300 + i * 64) * sc, y + 50 * sc - ph * 30 * sc, (4 + (i % 3) * 3) * sc, 0.7 * Math.sin(PI * ph)); }
  }
  /** 水母灯：半透明的伞 + 飘带触手；pulse 0..1（拍点上收缩） */
  function jellyfish(g, x, y, r, t, hue, pulse, a = 1) {
    if (a <= 0.01) return;
    const sq = 1 - pulse * 0.18, st = 1 + pulse * 0.12;
    const col = ['255,170,215', '210,180,255', '255,214,150', '170,230,255'][hue % 4];
    E.glow(g, x, y, r * 2.8, col, 0.35 * a);
    g.save(); g.globalAlpha *= a;
    // 触手（飘带）
    g.strokeStyle = `rgba(${col},0.55)`; g.lineWidth = Math.max(1.5, r * 0.08); g.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const bx = x + (i - 2) * r * 0.32; g.beginPath(); g.moveTo(bx, y + r * 0.2); for (let j = 1; j <= 8; j++) { const u = j / 8; g.lineTo(bx + Math.sin(t * 3 + i + u * 5) * r * 0.25 * u, y + r * 0.2 + u * r * 2.2 * st); } g.stroke(); }
    // 伞
    g.fillStyle = rg(g, x - r * 0.2, y - r * 0.5, r * 0.1, r * 1.2, [[0, 'rgba(255,255,255,0.9)'], [0.5, `rgba(${col},0.55)`], [1, `rgba(${col},0.15)`]]);
    g.beginPath(); g.ellipse(x, y, r * st, r * 0.85 * sq, 0, PI, TAU);
    for (let i = 0; i <= 8; i++) { const u = i / 8; g.lineTo(x + r * st - u * 2 * r * st, y + Math.sin(u * PI * 4) * r * 0.06 + r * 0.08); }
    g.closePath(); g.fill();
    g.strokeStyle = `rgba(255,255,255,0.6)`; g.lineWidth = Math.max(1, r * 0.05); g.beginPath(); g.ellipse(x, y, r * st, r * 0.85 * sq, 0, PI * 1.1, PI * 1.6); g.stroke();
    // 里面的灯芯
    g.globalCompositeOperation = 'lighter'; E.glow(g, x, y - r * 0.25, r * 0.7, '255,250,235', 0.8);
    g.restore();
  }
  /** 汽水海（相机 cam；o: { boats(q), mid(q), front(q), jelly } ） */
  function sodaSea(g, s, cam, o = {}) {
    const t = s.t;
    g.drawImage(LC(s, 'sea-sky', VW, VH, seaSky, 0.5), 0, 0, VW, VH);
    inCam(g, cam, 0.05, (q) => { stars(q, t, { n: 60, seed: 53, x: -200, y: 0, w: VW + 400, h: 520, s: 2.8 }); q.drawImage(bigMoon(), (o.moonX ?? 1250) - 300, (o.moonY ?? 250) - 300, 600, 600); });
    inCam(g, cam, 0.15, (q) => {
      // 远处的小岛（旋转木马在上面发光）
      q.fillStyle = '#3a1e52'; q.beginPath(); q.ellipse(1700, SEA + 2, 260, 26, 0, PI, TAU); q.fill();
      E.glow(q, 1700, SEA - 40, 120, '255,200,140', 0.5 + 0.2 * s.pulse(3));
      for (let i = 0; i < 8; i++) E.glow(q, 1640 + i * 17, SEA - 30 - Math.sin(i) * 6, 6, '255,220,160', 0.9);
      q.fillStyle = '#3a1e52'; q.beginPath(); q.ellipse(300, SEA + 2, 360, 34, 0, PI, TAU); q.fill();
      fogBand(q, t, { n: 8, seed: 54, x0: -400, x1: 2400, y0: SEA - 30, y1: SEA + 20, w: 700, h: 110, speed: 10, rgb: '255,190,230', a: 0.45 });
    });
    tiled(g, s, 'sea-water', cam, 0.6, -400, 2400, 1400, seaWater, 0.7, SEA, 700);
    inCam(g, cam, 0.6, (q) => { moonPath(q, t, sameScreenX(cam, o.moonX ?? 1250, 0.05, 0.6)); seaFizz(q, t, cam, 70, 55); });
    if (o.mid) inCam(g, cam, 0.8, o.mid);
    inCam(g, cam, 1, (q) => { if (o.boats) o.boats(q); });
    if (o.front) inCam(g, cam, 1.3, o.front);
  }
  /* ---------- 镜头 24 · 汽水海（91.31 → 95.49）：白光过后，贴着冒泡的海面飞向瓶子船队 ---------- */
  function fleet(q, s, t, list) {
    for (const b of list) bottleBoat(q, s, b[0], b[1], b[2], t, { seed: b[3], lantern: true, riders: b[4] });
  }
  function shotSodaSea(g, s) {
    const t = s.t, lt = s.lt, k = ease.out(clamp(lt / 4.2));
    const cam = { x: lerp(700, 1000, k), y: lerp(760, 560, k), z: lerp(1.5, 1.0, k), ...shake(s, 6 * s.acc(0.25), 47) };
    sodaSea(g, s, cam, {
      mid: (q) => fleet(q, s, t, [[380, 700, 0.35, 1], [1520, 690, 0.3, 2], [1900, 720, 0.4, 3]]),
      boats: (q) => {
        // 船上三个的位置 / 前后顺序和后面两个近景镜头一致（切过去不跳）
        bottleBoat(q, s, 980, 860, 0.8, t, { seed: 4, riders: (qq) => { cast(qq, 'sheep-black', { x: -150, y: -38, h: sheepH('mom', 'sit', 110), pose: 'sit', t, ...MOM, flip: false }); cast(qq, 'adele-alter', sitOn({ x: 10, h: 300, outfit: 'home', t, expr: 'laugh' }, -44)); cast(qq, 'sheep-black', { x: 240, y: -44, h: sheepH('dad', 'stand', 120), pose: 'stand', t, ...DAD, flip: true }); } });
      },
      front: (q) => { for (let i = 0; i < 16; i++) { const ph = fract(t * 0.35 + hash(231, i)); bubble(q, -200 + hash(232, i) * 2400, 1200 - ph * 1300, 20 + hash(233, i) * 40, 0.55 * Math.sin(PI * ph)); } },
    });
    sparkles(g, t, 24, 11, '255,230,245');
    vig(g, s, 0.45);
  }
  /* ---------- 镜头 25 · 小船上（95.49 → 99.66）：爸爸羊在船头拿红领带当指挥棒，妈妈羊靠着她 ---------- */
  function tieBaton(g, x, y, t, s, sc = 1) {
    // 挥动的红领带：领带尖划出拍子的弧线
    const a = -1.1 + Math.sin(s.beat * PI) * 0.7;
    g.save(); g.translate(x, y); g.rotate(a); g.scale(sc, sc);
    g.fillStyle = '#c0392b'; g.strokeStyle = '#5a1410'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.lineTo(10, -70); g.lineTo(0, -84); g.lineTo(-10, -70); g.closePath(); g.fill(); g.stroke();
    g.restore();
    const tx = x + Math.sin(a) * 84 * sc, ty = y - Math.cos(a) * 84 * sc;
    sparkle(g, tx, ty, 16 * sc, 0.6 + 0.4 * s.pulse(5), t * 2, '255,220,200');
  }
  /** 船头的爸爸羊（船的局部坐标里画）+ 叼在嘴里挥的红领带：领带跟着船一起晃，不会飘在半空 */
  function dadConductor(qq, s, t, expr = 'smile') {
    const o = { x: 240, y: -44, h: sheepH('dad', 'stand', 120), pose: 'stand', t, ...DAD, flip: true, expr };
    cast(qq, 'sheep-black', o);
    const S = o.h / 54, face = anchor('sheep-black', o, 'face', [o.x - 18 * S, o.y - 22 * S]);
    tieBaton(qq, face[0] - 2 * S, face[1] + 5 * S, t, s, 1);
  }
  function shotBoat(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 980, y: 700, z: 1.75 + lt * 0.02, ...hand(s, 49, 4, 0.35) };
    const bob = s.pulse(4);
    sodaSea(g, s, cam, {
      mid: (q) => fleet(q, s, t, [[520, 700, 0.35, 1], [1500, 690, 0.3, 2]]),
      boats: (q) => {
        bottleBoat(q, s, 980, 860 + bob * 6, 0.8, t, { seed: 4, bob, riders: (qq) => {
          cast(qq, 'sheep-black', { x: -150, y: -38, h: sheepH('mom', 'sit', 110), pose: 'sit', t, ...MOM, flip: false, expr: 'smile' });
          cast(qq, 'adele-alter', sitOn({ x: 10, h: 300, outfit: 'home', t, expr: 'laugh', look: [0.6, -0.2] }, -44));
          dadConductor(qq, s, t);
        } });
      },
    });
    sparkles(g, t, 20, 12, '255,230,245');
    vig(g, s, 0.45);
  }
  /* ---------- 镜头 26 · 水母灯（99.66 → 103.83）：从海里升起，跟着爸爸羊的“指挥”一拍一收缩 ---------- */
  function jellies(g, s, t, n, seed, t0, o = {}) {
    const beatP = s.pulse(5);
    for (let i = 0; i < n; i++) {
      const born = t0 + hash(seed, i, 1) * (o.spread ?? 2.5), a = t - born;
      if (a < 0) continue;
      const x = (o.x0 ?? -200) + hash(seed, i, 2) * (o.w ?? 2300) + Math.sin(a * 0.7 + i) * 30;
      const y = (o.y0 ?? 900) - a * (o.rise ?? 80) * (0.6 + 0.8 * hash(seed, i, 3)) - beatP * 6;
      const r = (o.r ?? 34) * (0.5 + hash(seed, i, 4));
      jellyfish(g, x, y, r, t + i, i, beatP, clamp(a / 0.8) * (o.a ?? 1));
    }
  }
  function shotJellyfish(g, s) {
    const t = s.t, lt = s.lt, t0 = s.shot.t0;
    const cam = { x: 1000, y: lerp(640, 560, ease.inOut(clamp(lt / 4))), z: 1.25, ...hand(s, 51, 4, 0.3) };
    sodaSea(g, s, cam, {
      mid: (q) => jellies(q, s, t, 26, 241, t0 - 1, { y0: 780, rise: 60, r: 30 }),
      boats: (q) => {
        bottleBoat(q, s, 980, 870, 0.8, t, { seed: 4, bob: s.pulse(4), riders: (qq) => {
          cast(qq, 'sheep-black', { x: -150, y: -38, h: sheepH('mom', 'sit', 110), pose: 'sit', t, ...MOM, flip: false, expr: 'smile', look: [0, -1] });
          cast(qq, 'adele-alter', { x: 10, y: 10, h: 300, pose: 'look-up', sd: sdMix('Relax', 'Interact', sst(1.3, 1.8, lt)), outfit: 'home', t, expr: 'laugh', look: [0.3, -1] });
          dadConductor(qq, s, t);
        } });
      },
      front: (q) => jellies(q, s, t, 8, 242, t0 - 0.5, { y0: 1000, rise: 90, r: 60, a: 0.9 }),
    });
    vig(g, s, 0.45);
  }
  /* ---------- 镜头 27 · 水母升上天（103.83 → 108.01）：仰拍，满天的水母灯，105.92 的高音处星光一闪 ---------- */
  function shotJellySky(g, s) {
    const t = s.t, lt = s.lt, t0 = s.shot.t0;
    const up = ease.inOut(clamp(lt / 4.2));
    const cam = { x: 1000, y: lerp(560, 180, up), z: lerp(1.0, 0.95, up), ...hand(s, 53, 3, 0.3) };
    sodaSea(g, s, cam, {
      moonY: 200,
      mid: (q) => jellies(q, s, t, 60, 251, t0 - 4, { y0: 780, rise: 150, r: 26, spread: 5 }),
      boats: (q) => bottleBoat(q, s, 980, 880, 0.5, t, { seed: 4, riders: (qq) => { cast(qq, 'adele-alter', { x: 10, y: 10, h: 300, pose: 'look-up', outfit: 'home', t, expr: 'laugh' }); } }),
      front: (q) => jellies(q, s, t, 14, 252, t0 - 2, { y0: 1100, rise: 240, r: 50, spread: 4 }),
    });
    const hi = Math.exp(-Math.max(0, t - D[50]) * 2) * (t > D[50] ? 1 : 0);
    if (hi > 0.01) { sparkles(g, t, 40, 13, '255,240,250'); s.post.fill(g, '#ffe0f0', hi * 0.25 * flashK(s), 'lighter'); }
    for (let i = 0; i < 3; i++) { const st = t0 + 0.8 + i * 1.1, a = t - st; if (a > 0 && a < 0.7) { const x = 300 + i * 500 + a * 900, y = 120 + i * 60 + a * 300; g.strokeStyle = `rgba(255,240,250,${(1 - a / 0.7) * 0.9})`; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 160, y - 55); g.stroke(); E.glow(g, x, y, 20, '255,240,250', 1 - a / 0.7); } }
    vig(g, s, 0.45);
  }

  /* =========================================================
   * 羊群旋转木马（108.01 → 124.70）
   * ========================================================= */
  const CAR = { x: 960, y: 800, R: 470, n: 10 };
  /** 旋转木马：rot 转角；o: { riders(i) → fn(q, x, y, sc) } */
  function carousel(g, s, t, rot, o = {}) {
    const { x, y, R, n } = CAR, ry = R * 0.22;
    const bulbs = (q, cx, cy, rx, ryy, a0, a1, m, on) => { for (let i = 0; i <= m; i++) { const a = a0 + (a1 - a0) * (i / m), bx = cx + Math.cos(a) * rx, by = cy + Math.sin(a) * ryy; const lit = on(i); q.fillStyle = lit > 0.5 ? '#fff4c8' : '#c8a060'; q.beginPath(); q.arc(bx, by, 5, 0, TAU); q.fill(); if (lit > 0.3) E.glow(q, bx, by, 16, '255,220,150', 0.5 * lit); } };
    const chase = (i) => 0.5 + 0.5 * Math.cos((i - s.beat * 4) * 0.8);
    // 底座（后半圈）
    g.fillStyle = '#5a3a6a'; g.beginPath(); g.ellipse(x, y + 40, R + 40, ry + 12, 0, 0, TAU); g.fill();
    g.fillStyle = '#e8c8e8'; g.beginPath(); g.ellipse(x, y, R + 30, ry + 8, 0, 0, TAU); g.fill();
    g.fillStyle = '#c8a0d0'; g.beginPath(); g.ellipse(x, y, R - 30, ry - 8, 0, 0, TAU); g.fill();
    // 马（羊）按深度排序
    const items = [];
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; items.push({ i, a, z: Math.sin(a) }); }
    items.sort((p, q2) => p.z - q2.z);
    const drawItem = (it) => {
      const px = x + Math.cos(it.a) * R * 0.86, py = y + Math.sin(it.a) * ry * 0.86;
      const sc = 0.8 + 0.2 * (it.z + 1) / 2, dark = (1 - it.z) * 0.25;
      const bobY = Math.sin(it.a * 2 + t * 2.2 + it.i) * 26;
      // 金色立柱
      g.strokeStyle = '#e0b860'; g.lineWidth = 6 * sc; g.beginPath(); g.moveTo(px, py - 470); g.lineTo(px, py); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2 * sc; g.beginPath(); g.moveTo(px - 1.5 * sc, py - 470); g.lineTo(px - 1.5 * sc, py); g.stroke();
      const sy = py - 150 - bobY, LV = 120 * sc, lo = { v: it.i, kind: 'pink', pose: 'jump', expr: 'smile', flip: Math.cos(it.a) > 0, alpha: 1 - dark * 0.8 };
      lamb(g, s, px, sy, LV, lo);
      // 小鞍（在羊背上：官方小羊的背比手绘版高）
      const seat = sy - lambBack(g, LV, lo);
      g.fillStyle = '#c83a5a'; g.beginPath(); g.ellipse(px, seat + 4 * sc, 26 * sc, 10 * sc, 0, 0, TAU); g.fill();
      if (o.riders) o.riders(it.i, px, seat, sc, it.z);
    };
    for (const it of items) if (it.z < 0) drawItem(it);
    // 中心柱（镜子 + 灯）
    g.fillStyle = '#8a5a9a'; g.fillRect(x - 70, y - 470, 140, 470);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#ffd8ec' : '#c8e8ff'; g.fillRect(x - 60 + i * 30, y - 400, 26, 300); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(x - 56 + i * 30, y - 396, 6, 290); }
    E.glow(g, x, y - 250, 220, '255,200,230', 0.35);
    for (const it of items) if (it.z >= 0) drawItem(it);
    // 前半圈的底座边
    g.fillStyle = '#d8b0d8'; g.beginPath(); g.ellipse(x, y, R + 30, ry + 8, 0, 0, PI); g.lineTo(x - R - 30, y + 30); g.ellipse(x, y + 30, R + 30, ry + 8, 0, PI, 0, true); g.closePath(); g.fill();
    bulbs(g, x, y + 16, R + 30, ry + 8, 0, PI, 24, chase);
    // 顶棚：条纹圆锥 + 波浪边 + 灯泡
    const cy = y - 480;
    for (let i = 0; i < 16; i++) {
      const a0 = PI + (i / 16) * PI, a1 = PI + ((i + 1) / 16) * PI;
      g.fillStyle = i % 2 ? '#fff0f6' : '#ff8ab8';
      g.beginPath(); g.moveTo(x, cy - 190); g.lineTo(x + Math.cos(a0 - PI) * (R + 60), cy + Math.sin(a0 - PI) * 0 + 0); g.lineTo(x + Math.cos(a1 - PI) * (R + 60), cy); g.closePath(); g.fill();
    }
    g.fillStyle = '#ff8ab8'; g.beginPath(); g.ellipse(x, cy, R + 60, 46, 0, 0, PI); g.fill();
    for (let i = 0; i < 18; i++) { const a = (i / 18) * PI, bx = x + Math.cos(a) * (R + 60), by = cy + Math.sin(a) * 46; g.fillStyle = i % 2 ? '#fff0f6' : '#b86ad0'; g.beginPath(); g.arc(bx, by + 12, 22, 0, PI); g.fill(); }
    bulbs(g, x, cy + 4, R + 60, 46, 0, PI, 22, (i) => chase(i + 5));
    g.fillStyle = '#ffd070'; g.beginPath(); g.arc(x, cy - 196, 16, 0, TAU); g.fill(); E.glow(g, x, cy - 196, 60, '255,220,150', 0.7);
    g.strokeStyle = '#8a5a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, cy - 210); g.lineTo(x, cy - 290); g.stroke();
    g.fillStyle = '#ff7eb0'; g.beginPath(); g.moveTo(x, cy - 290); g.lineTo(x + 70 + Math.sin(t * 4) * 8, cy - 272); g.lineTo(x, cy - 254); g.closePath(); g.fill();
  }
  function islandNight(g, s, cam, o = {}) {
    const t = s.t;
    g.drawImage(LC(s, 'sea-sky', VW, VH, seaSky, 0.5), 0, 0, VW, VH);
    inCam(g, cam, 0.05, (q) => { stars(q, t, { n: 60, seed: 57, x: -200, y: 0, w: VW + 400, h: 520, s: 2.8 }); q.drawImage(bigMoon(), 1480, 20, 440, 440); if (o.sky) o.sky(q); });
    tiled(g, s, 'sea-water', cam, 0.3, -400, 2400, 1400, seaWater, 0.7, SEA, 700);
    inCam(g, cam, 0.3, (q) => { moonPath(q, t, sameScreenX(cam, 1700, 0.05, 0.3), 0.8); fogBand(q, t, { n: 8, seed: 58, x0: -400, x1: 2400, y0: SEA - 10, y1: SEA + 60, w: 800, h: 140, speed: 10, rgb: '255,190,230', a: 0.4 }); });
    // 小岛的草地：和站在上面的旋转木马、坐在上面的人同一层（d = 1），镜头移动时不会互相滑开
    inCam(g, cam, 1, (q) => {
      q.drawImage(LC(s, 'isle-ground2', 3200, 600, (qq) => {
        qq.fillStyle = vg(qq, 0, 600, [[0, '#4a2a5e'], [1, '#1e1030']]); qq.beginPath(); qq.moveTo(0, 130); qq.bezierCurveTo(700, 40, 2500, 40, 3200, 130); qq.lineTo(3200, 600); qq.lineTo(0, 600); qq.closePath(); qq.fill();
        const R = E.rng(61); for (let i = 0; i < 700; i++) { const x = R() * 3200, y = 90 + R() * 500; qq.strokeStyle = `rgba(${R() < 0.5 ? '140,90,170' : '40,20,60'},0.5)`; qq.lineWidth = 2; qq.beginPath(); qq.moveTo(x, y); qq.lineTo(x + (R() - 0.5) * 8, y - 8 - R() * 14); qq.stroke(); }
        for (let i = 0; i < 80; i++) { qq.fillStyle = pick(['#ff9ac0', '#ffe08a', '#c8a8ff', '#ffffff'], R()); qq.beginPath(); qq.arc(R() * 3200, 130 + R() * 460, 3 + R() * 3, 0, TAU); qq.fill(); }
      }, 0.8), -640, 700, 3200, 600);
      if (o.ground) o.ground(q);
    });
    if (o.mid) inCam(g, cam, 1, o.mid);
    if (o.front) inCam(g, cam, 1.3, o.front);
  }
  /* ---------- 镜头 28 · 旋转木马（108.01 → 112.18） ---------- */
  const carRot = (s) => s.T.barAt(s.t) * (TAU / 4);
  function shotCarousel(g, s) {
    const t = s.t, lt = s.lt, k = ease.inOut(clamp(lt / 4.2));
    const cam = { x: lerp(1080, 960, k), y: 440, z: lerp(0.98, 1.1, k), ...hand(s, 55, 4, 0.3) };
    islandNight(g, s, cam, {
      mid: (q) => {
        carousel(q, s, t, carRot(s), { riders: (i, px, py, sc) => {
          if (i === 0) cast(q, 'adele-alter', sitOn({ x: px, h: 260 * sc, outfit: 'home', t, expr: 'laugh' }, py));
          if (i === 1) cast(q, 'sheep-black', { x: px, y: py + 8 * sc, h: sheepH('mom', 'sit', 80 * sc), pose: 'sit', t, ...MOM });
          if (i === 9) cast(q, 'sheep-black', { x: px, y: py + 8 * sc, h: sheepH('dad', 'sit', 80 * sc), pose: 'sit', t, ...DAD });
        } });
        for (let i = 0; i < 8; i++) { const ph = fract(s.beat + i * 0.125), [hy, sq] = hop(ph); const lx = 200 + i * 230 + (i > 3 ? 300 : 0); lamb(q, s, lx, 1000 - hy * 40, 70, { v: i, sq, glow: 1, pose: hy > 0.3 ? 'jump' : 'stand', expr: 'laugh', flip: i > 3 }); }
      },
      front: (q) => { for (let i = 0; i < 10; i++) bokeh(q, hash(261, i) * 2200 - 100, 200 + hash(262, i) * 900, 60 + hash(263, i) * 90, i % 2 ? '255,200,140' : '255,160,210', 0.2); },
    });
    sparkles(g, t, 20, 14, '255,226,190');
    vig(g, s, 0.45);
  }
  /* ---------- 镜头 29 · 转啊转（112.18 → 116.35）：她骑着木马，妈妈羊把一朵小花别在她角上 ---------- */
  function shotRide(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 960, y: 520, z: 1.0, ...hand(s, 57, 3, 0.4) };
    // 背景：转动的灯光拉成的光带
    g.drawImage(LC(s, 'sea-sky', VW, VH, seaSky, 0.5), 0, 0, VW, VH);
    const rot = carRot(s);
    for (let i = 0; i < 28; i++) {
      const x = ((hash(271, i) * 2400 - rot * 900) % 2400 + 2400) % 2400 - 240, y = 150 + hash(272, i) * 700;
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.4; g.fillStyle = hg(g, x - 160, x + 160, [[0, 'rgba(255,200,150,0)'], [0.5, i % 2 ? 'rgba(255,200,150,0.9)' : 'rgba(255,150,210,0.9)'], [1, 'rgba(255,200,150,0)']]); g.fillRect(x - 160, y - 3, 320, 6); g.restore();
    }
    inCam(g, cam, 1, (q) => {
      // 前景金柱 + 三匹“羊马”上下起伏
      const bob = (ph) => Math.sin(t * 2.2 + ph) * 34;
      const riders = [[560, 0.9, 'mom'], [1080, 0, 'adele'], [1620, 1.8, 'dad']];
      let horn = [1030, 330 - bob(0)], momHead = [620, 700 - bob(0.9)];
      for (const [x, ph, who] of riders) {
        const y = 760 - bob(ph);
        q.strokeStyle = '#e0b860'; q.lineWidth = 12; q.beginPath(); q.moveTo(x, -20); q.lineTo(x, 1100); q.stroke();
        q.strokeStyle = 'rgba(255,255,255,0.5)'; q.lineWidth = 4; q.beginPath(); q.moveTo(x - 3, -20); q.lineTo(x - 3, 1100); q.stroke();
        const lo = { v: who === 'adele' ? 1 : who === 'dad' ? 2 : 0, kind: 'pink', pose: 'jump', expr: 'smile' };
        lamb(q, s, x, y + 150, 250, lo);
        const seat = y + 150 - lambBack(q, 250, lo);
        q.fillStyle = '#c83a5a'; q.beginPath(); q.ellipse(x, seat + 8, 52, 18, 0, 0, TAU); q.fill();
        if (who === 'adele') {
          const ao = sitOn({ x, h: 480, outfit: 'home', t, expr: 'laugh', look: [-0.6, 0], wind: 0.4 }, seat);
          cast(q, 'adele-alter', ao);
          const hd = anchor('adele-alter', ao, 'head', [x, seat - 300]);
          horn = [hd[0] - 0.13 * 480, hd[1] - 0.12 * 480]; // 左边那只角
        } else {
          const so = { x, y: seat + 10, h: sheepH(who, 'sit', 150), pose: 'sit', t, ...(who === 'dad' ? DAD : MOM), flip: who === 'dad', expr: 'smile' };
          cast(q, 'sheep-black', so);
          if (who === 'mom') momHead = anchor('sheep-black', so, 'head', momHead);
        }
      }
      // 妈妈羊递来的一朵小花，飞到她的角上
      const f = ease.inOut(clamp((lt - 1.4) / 0.9));
      if (lt > 1.2) { const fx = lerp(momHead[0], horn[0], f), fy = lerp(momHead[1], horn[1], f) - Math.sin(PI * f) * 120; for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + t; q.fillStyle = '#ff8ab4'; q.beginPath(); q.ellipse(fx + Math.cos(a) * 11, fy + Math.sin(a) * 11, 10, 6, a, 0, TAU); q.fill(); } q.fillStyle = '#ffe08a'; q.beginPath(); q.arc(fx, fy, 6, 0, TAU); q.fill(); if (f > 0.95) sparkle(q, fx, fy, 30, 1 - clamp((lt - 2.4) / 0.6), t, '255,200,230'); }
    });
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 30 · 烟花（116.35 → 120.53）：羊形烟花一拍一朵；他们碰了碰汽水瓶 ---------- */
  // 烟花的“单位图案”：圆形两圈；羊形（身子一圈 + 头 + 耳朵 + 四条腿）
  const FW_RING = (() => { const p = []; for (let i = 0; i < 30; i++) { const a = (i / 30) * TAU; p.push([Math.cos(a), Math.sin(a)]); } for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + 0.2; p.push([Math.cos(a) * 0.55, Math.sin(a) * 0.55]); } return p; })();
  const FW_SHEEP = (() => {
    const p = [];
    for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU; p.push([Math.cos(a) * 0.82 - 0.12, Math.sin(a) * 0.55 * (1 + 0.1 * Math.cos(a * 6))]); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; p.push([0.86 + Math.cos(a) * 0.24, -0.34 + Math.sin(a) * 0.27]); }
    p.push([0.66, -0.52], [0.6, -0.58]);
    for (const lx of [-0.62, -0.3, 0.18, 0.46]) p.push([lx, 0.62], [lx, 0.8]);
    return p;
  })();
  const FW_COL = ['255,160,210', '255,210,140', '200,170,255', '160,236,220', '255,236,246'];
  /** 一朵烟花：(x, y) 炸开点，R 半径，a = 炸开后的秒数（负数时是升空的火箭） */
  function firework(g, x, y, R, a, hue, sheep, launch = 0.5) {
    if (a < -launch || a > 2.4) return;
    const col = FW_COL[hue % FW_COL.length];
    if (a < 0) { // 升空：一颗拖着尾巴的火星
      const u = 1 + a / launch, sy = lerp(1040, y, ease.out(u));
      g.strokeStyle = `rgba(${col},0.5)`; g.lineWidth = 3; g.beginPath(); g.moveTo(x, sy); g.lineTo(x + Math.sin(u * 20) * 3, sy + 70); g.stroke();
      E.glow(g, x, sy, 16, '255,244,220', 0.9);
      return;
    }
    const k = 1 - Math.exp(-a * 4.2), k0 = 1 - Math.exp(-Math.max(0, a - 0.1) * 4.2), fade = Math.pow(1 - a / 2.4, 1.3), drop = 46 * a * a;
    if (a < 0.3) E.glow(g, x, y, R * 1.1 * (1 - a / 0.3), '255,250,240', 0.9);
    E.glow(g, x, y + drop * 0.4, R * 1.7 * k, col, 0.2 * fade);
    const pts = sheep ? FW_SHEEP : FW_RING;
    g.save(); g.globalCompositeOperation = 'lighter';
    g.strokeStyle = `rgba(${col},${0.8 * fade})`; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath();
    for (const [ux, uy] of pts) { g.moveTo(x + ux * R * k0, y + uy * R * k0 + drop * 0.8); g.lineTo(x + ux * R * k, y + uy * R * k + drop); }
    g.stroke(); g.restore();
    const tw = a > 1.2 ? 0.5 + 0.5 * Math.sin(a * 40 + x) : 1;
    for (const [ux, uy] of pts) E.glow(g, x + ux * R * k, y + uy * R * k + drop, 11, col, fade * tw);
  }
  /** 一串烟花：t0 起每 step 秒一朵（第 i 朵的位置 / 大小 / 颜色由 seed 决定），every 朵里有一朵是羊形 */
  function fireworkShow(q, t, t0, n, step, seed, o = {}) {
    for (let i = 0; i < n; i++) {
      const bt = t0 + i * step + 0.45, a = t - bt;
      if (a < -0.5 || a > 2.4) continue;
      const x = (o.x0 ?? 280) + hash(seed, i, 1) * (o.w ?? 1400), y = (o.y0 ?? 150) + hash(seed, i, 2) * (o.h ?? 250), R = (o.r ?? 110) * (0.75 + 0.6 * hash(seed, i, 3));
      firework(q, x, y, R, a, i + seed, i % (o.every ?? 3) === 1);
    }
  }  function shotFireworks(g, s) {
    const t = s.t, lt = s.lt, t0 = s.shot.t0;
    const cam = { x: 960, y: 520, z: 1.05, ...hand(s, 59, 3, 0.3) };
    islandNight(g, s, cam, {
      sky: (q) => fireworkShow(q, t, t0 - BEAT * 2, 12, BEAT, 281, { r: 160 }),
      mid: (q) => {
        // 远处坡上的旋转木马还亮着
        q.save(); q.translate(1540, 745); q.scale(0.26, 0.26); q.translate(-CAR.x, -CAR.y); carousel(q, s, t, carRot(s)); q.restore();
        E.glow(q, 1540, 690, 200, '255,190,210', 0.25);
        // 草坡上：她坐在一块大石头上（官方小人的坐姿，手里捧着汽水），两只羊一左一右坐在草地上
        cast(q, 'sheep-black', { x: 800, y: 900, h: sheepH('mom', 'sit', 120), pose: 'sit', t, ...MOM, flip: false, expr: 'smile', look: [0.2, -1] });
        const AH = 380, rockTop = seatRock(q, 960, 918, 200, SIT_DROP * AH + 10, { col: '#2a1838', rim: 'rgba(255,190,220,0.5)' });
        const ao = sitOn({ x: 960, h: AH, outfit: 'home', t, expr: 'smile', look: [0, -1] }, rockTop + 6);
        cast(q, 'adele-alter', ao);
        const hn = anchor('adele-alter', ao, 'handN', [960, rockTop]), hf = anchor('adele-alter', ao, 'handF', hn);
        // 碰杯：爸爸羊叼着一瓶汽水凑过来，和她手里那瓶的瓶口碰一下（“叮”的星光在两个瓶口之间）
        const clink = win(lt, 1.7, 2.0, 2.45, 2.8), BH = 62;
        const hx0 = (hn[0] + hf[0]) / 2, hy0 = Math.max(hn[1], hf[1]) + 10, herRot = 0.28 * clink;
        bottle(q, s, hx0, hy0, BH, herRot);
        const M = bottleMouth(hx0, hy0, BH, herRot);
        const dh = sheepH('dad', 'sit', 124), off = anchor('sheep-black', { x: 0, y: 0, h: dh, pose: 'sit', t, ...DAD, flip: true }, 'mouth', [-40, -70]);
        const L = BH * 0.92 * 0.96, dyM = (900 + off[1]) - M[1], need = M[0] + Math.sqrt(Math.max(0, L * L - dyM * dyM)) - off[0];
        const so = { x: lerp(1130, Math.min(1130, need), clink), y: 900, h: dh, pose: 'sit', t, ...DAD, flip: true, expr: 'smile', look: [-0.2, -1] };
        cast(q, 'sheep-black', so);
        const dm = [so.x + off[0], so.y + off[1]], rot = Math.atan2(M[0] - dm[0], -(M[1] - dm[1])) * clink + (1 - clink) * -1.2;
        bottle(q, s, dm[0], dm[1] + 6, BH * 0.9, rot);
        if (clink > 0.6) { const k = (clink - 0.6) / 0.4; sparkle(q, M[0] + 8, M[1] - 6, 42 * k, k, t * 2, '255,240,220'); withAlpha(q, k, (qq) => E.text(qq, '叮！', M[0] + 20, M[1] - 60, { size: 40, weight: 900, color: '#fff4e0', stroke: 'rgba(90,40,60,0.5)', strokeW: 8 })); }
      },
    });
    vig(g, s, 0.45);
  }
  /* ---------- 镜头 31 · 上山的小路（120.53 → 124.70）：三个背影走上浮灯的小路 ---------- */
  function shotPath(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 900 + lt * 30, y: 520, z: 1.0 };
    islandNight(g, s, cam, {
      sky: (q) => fireworkShow(q, t, s.shot.t0 - BEAT * 2, 8, BEAT * 1.5, 291, { r: 100, every: 2 }),
      mid: (q) => {
        // 一条浮灯铺的小路，通向山坡上
        for (let i = 0; i < 16; i++) { const u = i / 15, x = 300 + u * 1500, y = 1000 - Math.pow(u, 1.2) * 480 + Math.sin(t * 1.2 + i) * 6; lantern(q, s, x, y - 60, 40 * (1 - u * 0.5), i % 4, Math.sin(t + i) * 0.1); }
        const walk = lt * 60;
        for (const [dx, who] of [[-110, 'mom'], [0, 'adele'], [110, 'dad']]) {
          const x = 700 + walk + dx, y = 1000 - Math.pow((x - 300) / 1500, 1.2) * 480;
          if (who === 'adele') cast(q, 'adele-alter', { x, y, h: 250, pose: 'walk', speed: stepSpeed('adele-alter', { h: 250, pose: 'walk' }, 60, 0.7), outfit: 'home', t, sil: '#2a1838', rim: '255,200,160' });
          else { const sh = sheepH(who, 'walk', 70); cast(q, 'sheep-black', { x, y, h: sh, pose: 'walk', speed: stepSpeed('sheep-black', { h: sh, pose: 'walk' }, 63, 2.7), t: t + (who === 'dad' ? 0.3 : 0), ...(who === 'dad' ? DAD : MOM), sil: '#2a1838', rim: '255,200,160' }); }
        }
      },
    });
    vig(g, s, 0.5);
  }

  /* =========================================================
   * 间奏 B · 掌心的石头（124.70 → 141.39）：星空下起雾的山坡；石头；远处的雾泛起红光
   * ========================================================= */
  function hillSky(q) {
    q.fillStyle = vg(q, 0, VH, [[0, '#04041a'], [0.4, '#110f3a'], [0.7, '#2a1c56'], [0.88, '#5a3470'], [1, '#8a4a7e']]); q.fillRect(0, 0, VW, VH);
    // 银河
    q.save(); q.translate(960, 380); q.rotate(-0.55);
    q.fillStyle = rg(q, 0, 0, 0, 1100, [[0, 'rgba(210,180,255,0.3)'], [0.5, 'rgba(170,140,230,0.12)'], [1, 'rgba(160,120,220,0)']]); q.scale(1, 0.14); q.beginPath(); q.arc(0, 0, 1100, 0, TAU); q.fill();
    q.restore();
    const R = E.rng(71);
    for (let i = 0; i < 1400; i++) {
      // 沿银河更密
      const u = R() * 2 - 1, v = (R() + R() + R() - 1.5) * 0.35 * (R() < 0.6 ? 1 : 4);
      const x = 960 + u * 1300 * Math.cos(-0.55) - v * 300 * Math.sin(-0.55), y = 380 + u * 1300 * Math.sin(-0.55) + v * 300 * Math.cos(-0.55);
      if (y > 900) continue;
      q.fillStyle = `rgba(255,${230 + R() * 25 | 0},${240 + R() * 15 | 0},${0.12 + R() * 0.5})`; q.fillRect(x, y, 1.2 + R() * 1.2, 1.2 + R() * 1.2);
    }
  }
  function hillGround(q) {
    // 山顶：一道弧线 + 草叶剪影 + 小花
    q.fillStyle = '#120a20';
    q.beginPath(); q.moveTo(-100, 1100); q.lineTo(-100, 900); q.bezierCurveTo(400, 800, 1100, 790, 1500, 850); q.bezierCurveTo(1800, 890, 2000, 950, 2100, 1100); q.closePath(); q.fill();
    const R = E.rng(72);
    q.strokeStyle = '#120a20'; q.lineWidth = 3; q.lineCap = 'round';
    for (let i = 0; i < 220; i++) { const x = R() * 2000, y = 800 + Math.pow((x - 800) / 1200, 2) * 180 + 20; q.beginPath(); q.moveTo(x, y + 10); q.quadraticCurveTo(x + (R() - 0.5) * 20, y - 20, x + (R() - 0.5) * 30, y - 24 - R() * 30); q.stroke(); }
    q.strokeStyle = 'rgba(200,170,255,0.35)'; q.lineWidth = 2; q.beginPath(); q.moveTo(-100, 900); q.bezierCurveTo(400, 800, 1100, 790, 1500, 850); q.bezierCurveTo(1800, 890, 2000, 950, 2100, 1100); q.stroke();
    for (let i = 0; i < 40; i++) { const x = 200 + R() * 1500, y = 830 + Math.pow((x - 800) / 1200, 2) * 180; q.fillStyle = pick(['#ff9ac0', '#fff0c0', '#c8a8ff'], R()); q.beginPath(); q.arc(x, y + R() * 30, 3, 0, TAU); q.fill(); }
  }
  const HILL_Y = (x) => 820 + Math.pow((x - 800) / 1200, 2) * 180 - 12;
  /** 山顶上那块可以坐的大石头（她和两只羊看星星的地方；hill / rumble / glow 都在同一个位置） */
  const HILL_ROCK = [905, 150, 132];
  const hillRockTop = () => HILL_Y(HILL_ROCK[0]) + 10 - HILL_ROCK[2];
  const hillRock = (q, o = {}) => seatRock(q, HILL_ROCK[0], HILL_Y(HILL_ROCK[0]) + 10, HILL_ROCK[1], HILL_ROCK[2], Object.assign({ col: '#241634' }, o));
  /** 起雾的山坡（相机 cam；o: { glow: 远处红光 0..1, volcano: 火山显形 0..1, mid, front } ） */
  function hillWorld(g, s, cam, o = {}) {
    const t = s.t;
    g.drawImage(LC(s, 'hill-sky', VW, VH, hillSky, 0.6), 0, 0, VW, VH);
    inCam(g, cam, 0.04, (q) => stars(q, t, { n: 110, seed: 73, x: -100, y: 0, w: VW + 200, h: 700, s: 2.6 }));
    const gl = o.glow || 0, vo = o.volcano || 0;
    inCam(g, cam, 0.2, (q) => {
      if (gl > 0) { E.glow(q, 1320, 700, 900, '255,90,90', 0.35 * gl); E.glow(q, 1320, 720, 420, '255,150,110', 0.4 * gl); }
      if (vo > 0) withAlpha(q, vo, (qq) => dreamVolcano(qq, s, 1320, 720, 0.9, gl));
      fogBand(q, t, { n: 12, seed: 74, x0: -300, x1: 2300, y0: 700, y1: 860, w: 1000, h: 260, speed: 10, rgb: gl > 0.5 ? '255,190,200' : '220,200,246', a: 0.7 });
    });
    inCam(g, cam, 0.5, (q) => fogBand(q, t, { n: 10, seed: 75, x0: -300, x1: 2300, y0: 820, y1: 980, w: 1100, h: 300, speed: 16, rgb: '236,220,250', a: 0.6 }));
    inCam(g, cam, 1, (q) => { q.drawImage(LC(s, 'hill-ground', 2200, 400, (qq) => { qq.translate(100, -760); hillGround(qq); }, 1), -100, 760, 2200, 400); if (o.mid) o.mid(q); });
    if (o.front) inCam(g, cam, 1.3, o.front);
  }
  /** 梦里的旧火山（剪影 + 发光的火山口；heat 0..1） */
  function dreamVolcano(q, s, cx, base, sc, heat, skirt = false) {
    q.save(); q.translate(cx, base); q.scale(sc, sc);
    q.fillStyle = '#1e1230';
    // skirt：山体往下一直铺到画面外（登山远景的机位低，山脚下不能露出一条天空的颜色）；别的镜头山脚下有地面 / 光河，不需要
    q.beginPath(); q.moveTo(-900, 40); q.quadraticCurveTo(-330, 0, -120, -420); q.lineTo(-70, -436); q.lineTo(-20, -418); q.lineTo(40, -432); q.lineTo(110, -420); q.quadraticCurveTo(340, 0, 900, 40);
    if (skirt) { q.lineTo(900, 700); q.lineTo(-900, 700); }
    q.closePath(); q.fill();
    if (heat > 0) {
      q.strokeStyle = `rgba(255,150,120,${0.6 * heat})`; q.lineWidth = 4; q.beginPath(); q.moveTo(-120, -420); q.lineTo(-70, -436); q.lineTo(-20, -418); q.lineTo(40, -432); q.lineTo(110, -420); q.stroke();
      E.glow(q, -5, -430, 260, '255,120,110', 0.6 * heat); E.glow(q, -5, -430, 90, '255,220,180', 0.8 * heat);
      // 山坡上的光河
      q.strokeStyle = `rgba(255,140,120,${0.55 * heat})`; q.lineWidth = 6; q.lineCap = 'round';
      for (let i = 0; i < 3; i++) { q.beginPath(); q.moveTo(-40 + i * 40, -420); q.bezierCurveTo(-80 + i * 90, -300, -150 + i * 160, -160, -260 + i * 250, 20); q.stroke(); }
      q.lineCap = 'butt';
    }
    q.restore();
  }
  /* ---------- 镜头 32 · 山坡（124.70 → 128.88）：三个靠在一起看星星；一颗流星 ---------- */
  function shotHill(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 900, y: 520 + lt * 4, z: 1.0 + lt * 0.012 };
    hillWorld(g, s, cam, {
      mid: (q) => {
        hillRock(q);
        cast(q, 'sheep-black', { x: 780, y: HILL_Y(780), h: sheepH('dad', 'sleep', 100), pose: 'sleep', t, ...DAD, flip: false, expr: 'closed' });
        cast(q, 'adele-alter', sitOn({ x: HILL_ROCK[0] + 4, h: 330, outfit: 'home', t, expr: 'content', look: [0.2, -1] }, hillRockTop() + 6));
        cast(q, 'sheep-black', { x: 1020, y: HILL_Y(1020), h: sheepH('mom', 'sit', 104), pose: 'sit', t, ...MOM, flip: true, expr: 'closed' });
        fireflies(q, t, { n: 12, seed: 76, x: 500, y: 600, w: 900, h: 250, s: 6, rgb: '255,236,200' });
      },
    });
    const st = s.shot.t0 + 2.4, a = t - st;
    if (a > 0 && a < 0.9) { const x = 1300 - a * 900, y = 160 + a * 260; g.strokeStyle = `rgba(255,240,250,${(1 - a / 0.9)})`; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 240, y - 70); g.stroke(); E.glow(g, x, y, 26, '255,240,250', 1 - a / 0.9); }
    vig(g, s, 0.6);
  }
  /* ---------- 镜头 33 · 石头（128.88 → 133.06）：妈妈羊用鼻子把一块温热的小石头推进她手心 ---------- */
  function shotStone(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 980, y: 660, z: 1.32 + lt * 0.015, ...hand(s, 61, 2, 0.2) };
    // 中近景：她跪坐着伸出双手 → 妈妈羊用鼻子把石头推过来 → 石头落进手心 → 她把它捧在胸前
    const got = lt > 2.05, hold = ease.inOut(clamp((lt - 2.05) / 0.9)), push = ease.inOut(clamp((lt - 0.2) / 1.2));
    hillWorld(g, s, cam, {
      mid: (q) => {
        const AH = 470, rx = 820, rockTop = seatRock(q, rx, HILL_Y(rx) + 10, 250, SIT_DROP * AH + 14, { col: '#241634' });
        const ao = sitOn({ x: rx + 6, h: AH, prop: got ? 'stone' : null, outfit: 'home', t, expr: got ? 'tearful' : 'surprise', look: [0.9, 0.5] }, rockTop + 8);
        // 妈妈羊一步一步走过来（腿的相位按走过的距离算），把石头推过来
        const mh = sheepH('mom', 'stand', 190), mx = lerp(1330, 1180, push), mWalk = push > 0.01 && push < 0.99;
        const mo = { x: mx, y: HILL_Y(1200) + 4, h: mh, pose: mWalk ? 'walk' : 'stand', t: mWalk ? gaitTime('sheep-black', { h: mh, pose: 'walk' }, 1330 - mx, s.shot.t0) : t, ...MOM, flip: true, expr: got ? 'closed' : 'smile', heat: hold * 0.9 };
        cast(q, 'adele-alter', ao);
        groundShadow(q, mo.x, mo.y + 2, 90, 0.45);
        cast(q, 'sheep-black', mo);
        const hn0 = anchor('adele-alter', ao, 'handN', [rx + 40, rockTop - 10]), hf0 = anchor('adele-alter', ao, 'handF', hn0), hn = [(hn0[0] + hf0[0]) / 2, Math.min(hn0[1], hf0[1])];
        const nose = anchor('sheep-black', mo, 'mouth', anchor('sheep-black', mo, 'face', [mo.x - 190, mo.y - 300]));
        if (!got) {
          // 石头从羊鼻子前滚进她的手心，暖暖地亮着
          const k = ease.inOut(clamp((lt - 0.9) / 1.1));
          const x = lerp(nose[0] - 40, hn[0], k), y = lerp(nose[1] + 40, hn[1] - 10, k) - Math.sin(k * PI) * 40;
          pumice(q, x, y, 34, { seed: 27, glow: 0.7 + 0.2 * Math.sin(t * 3), lit: '#fff0e0' });
        } else {
          const pa = hn;
          pumice(q, pa[0], pa[1] - 6, 30, { seed: 27, glow: 0.6 + 0.2 * Math.sin(t * 3), lit: '#fff0e0' });
          E.glow(q, pa[0], pa[1], 160, '255,196,150', 0.45 + 0.2 * Math.sin(t * 2));
          for (let i = 0; i < 8; i++) { const ph = fract(t * 0.45 + i / 8); E.glow(q, pa[0] + Math.sin(i * 2.3 + ph * 5) * 70, pa[1] - ph * 220, 9, '255,214,170', Math.sin(PI * ph) * 0.8 * hold); }
        }
      },
    });
    vig(g, s, 0.62);
  }
  /* ---------- 镜头 34 · 远处的雾泛起红光（133.06 → 137.23） ---------- */
  function shotRumble(g, s) {
    const t = s.t, lt = s.lt;
    const acc = s.acc(0.18);
    const cam = { x: 1000 + lt * 20, y: 540, z: 1.0, ...shake(s, 2 + acc * 9, 63, 30) };
    const gl = sst(0, 3.5, lt);
    hillWorld(g, s, cam, {
      glow: gl, volcano: 0,
      mid: (q) => {
        hillRock(q);
        cast(q, 'sheep-black', { x: 780, y: HILL_Y(780), h: sheepH('dad', 'stand', 104), pose: 'stand', t, ...DAD, flip: false, expr: 'surprise', look: [1, -0.2] });
        cast(q, 'adele-alter', sitOn({ x: HILL_ROCK[0] + 4, h: 330, outfit: 'home', t, expr: 'surprise', look: [1, -0.1] }, hillRockTop() + 6));
        cast(q, 'sheep-black', { x: 1020, y: HILL_Y(1020), h: sheepH('mom', 'stand', 104), pose: 'stand', t, ...MOM, flip: false, expr: 'surprise', look: [1, -0.2] });
        // 草丛里冒出来的粉色小羊，一个个紧张地探头（跟着重音）：从山脊线后面钻出来（脊线以下的部分被挡住）
        q.save(); q.beginPath(); q.moveTo(-400, -400); for (let x = -400; x <= 2400; x += 50) q.lineTo(x, HILL_Y(x) + 14); q.lineTo(2400, -400); q.closePath(); q.clip();
        for (let i = 0; i < 9; i++) { const at = 0.3 + i * 0.4, a = lt - at; if (a < 0) continue; const x = 300 + hash(301, i) * 1400, pop = ease.back(clamp(a / 0.3)); lamb(q, s, x, HILL_Y(x) + 60 - pop * 70 - acc * 10, 70, { v: i, glow: 1, expr: 'surprise', flip: x > 1100 ? false : true, sq: acc * 0.4 }); }
        q.restore();
      },
    });
    vig(g, s, 0.6);
  }
  /* ---------- 镜头 35 · 火山亮起来（137.23 → 141.39）：重音越来越密，镜头跟着抖，最后一下白光 ---------- */
  function shotGlow(g, s) {
    const t = s.t, lt = s.lt;
    const acc = s.acc(0.15);
    const k = ease.inOut(clamp(lt / 4));
    const cam = { x: lerp(1100, 1300, k), y: lerp(560, 520, k), z: lerp(1.0, 1.35, k), ...shake(s, 3 + acc * 14 + k * 4, 65, 32) };
    hillWorld(g, s, cam, {
      glow: 0.6 + k * 0.4 + acc * 0.3, volcano: sst(0, 1.5, lt),
      mid: (q) => {
        hillRock(q, { col: '#1a0e1c', rim: 'rgba(255,150,120,0.5)' });
        for (const [x, who] of [[780, 'dad'], [860, 'adele'], [1020, 'mom']]) {
          if (who === 'adele') cast(q, 'adele-alter', { x, y: HILL_Y(x), h: 330, pose: 'stand', outfit: 'home', t, expr: 'determined', look: [1, -0.3], sil: '#1a0e1c', rim: '255,150,120' });
          else cast(q, 'sheep-black', { x, y: HILL_Y(x), h: sheepH(who, 'stand', 104), pose: 'stand', t, ...(who === 'dad' ? DAD : MOM), sil: '#1a0e1c', rim: '255,150,120' });
        }
      },
    });
    const fl = Math.exp(-Math.max(0, t - 140.88) * 5) * (t > 140.88 ? 1 : 0);
    if (fl > 0.01) s.post.fill(g, '#fff0e8', fl * 0.8 * flashK(s), 'lighter');
    vig(g, s, 0.6);
  }

  /* =========================================================
   * 副歌 C · 火山亮了（141.39 → 176.89）：光的喷发、羊卷风、外套回来了、踩着小羊冲上山
   * ========================================================= */
  function eruptSky(q) {
    q.fillStyle = vg(q, 0, VH, [[0, '#1a0a2e'], [0.35, '#4a1a4e'], [0.65, '#a0385e'], [0.85, '#f07a6a'], [1, '#ffc08a']]); q.fillRect(0, 0, VW, VH);
    const R = E.rng(81); for (let i = 0; i < 200; i++) { const y = Math.pow(R(), 1.6) * 500; q.fillStyle = `rgba(255,236,240,${(0.1 + R() * 0.4) * (1 - y / 520)})`; q.fillRect(R() * VW, y, 1.4, 1.4); }
  }
  /** 光的喷发：从火山口 (x, y) 喷出一簇簇发光的粒子，抛物线落下；环形的光波一圈圈扩开 */
  function lightEruption(g, s, t, x, y, t0, k = 1, sc = 1) {
    const a0 = t - t0;
    if (a0 < 0) return;
    const beat = s.pulse(4);
    E.glow(g, x, y, 760 * sc * k, '255,90,130', 0.36 * k);
    E.glow(g, x, y, 330 * sc, '255,150,120', 0.55 * k);
    E.glow(g, x, y, 110 * sc * (1 + 0.15 * beat), '255,244,226', 0.85 * k);
    // 光柱（粉 → 金，顶上散开）
    additive(g, (q) => {
      q.globalAlpha = 0.42 * k; q.fillStyle = vg(q, y - 1000 * sc, y, [[0, 'rgba(255,170,200,0)'], [0.6, 'rgba(255,170,190,0.55)'], [1, 'rgba(255,226,196,1)']]);
      q.beginPath(); q.moveTo(x - 36 * sc, y); q.lineTo(x - 170 * sc, y - 1000 * sc); q.lineTo(x + 170 * sc, y - 1000 * sc); q.lineTo(x + 36 * sc, y); q.closePath(); q.fill();
      // 光的缎带：几条弧线像喷泉一样从火山口洒出来、沿山坡流下（虚线流动）
      q.globalAlpha = 0.7 * k; q.lineCap = 'round';
      for (let j = 0; j < 7; j++) {
        const side = j % 2 ? 1 : -1, reach = (260 + j * 90) * sc, hgt = (240 + (j % 3) * 110) * sc;
        q.strokeStyle = pick(['rgba(255,160,200,0.8)', 'rgba(255,210,150,0.8)', 'rgba(255,236,220,0.8)'], hash(317, j));
        q.lineWidth = (5 + (j % 3) * 2) * sc;
        q.setLineDash([60 * sc, 90 * sc]); q.lineDashOffset = -t * (380 + j * 40) * sc;
        q.beginPath(); q.moveTo(x, y); q.quadraticCurveTo(x + side * reach * 0.5, y - hgt * 1.6, x + side * reach, y + 60 * sc + j * 30 * sc); q.stroke();
      }
      q.setLineDash([]); q.globalAlpha = 1;
    });
    // 光环（每两拍一圈）
    for (let j = 0; j < 3; j++) { const ph = fract(s.beat * 0.5 + j / 3), r = ph * 900 * sc; g.strokeStyle = `rgba(255,200,190,${(1 - ph) * 0.45 * k})`; g.lineWidth = 6 * (1 - ph) + 1; g.beginPath(); g.ellipse(x, y, r, r * 0.32, 0, 0, TAU); g.stroke(); }
    // 喷出的光点（带一小段拖尾）
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (let i = 0; i < 190; i++) {
      const born = t0 + (i / 190) * 4.2 + hash(311, i) * 0.05, a = t - born;
      if (a < 0 || a > 2.4) continue;
      const ang = -PI / 2 + (hash(312, i) - 0.5) * 1.4, sp = (500 + hash(313, i) * 1000) * sc;
      const px = x + Math.cos(ang) * sp * a, py = y + Math.sin(ang) * sp * a + 420 * sc * a * a;
      const a2 = Math.max(0, a - 0.06), qx = x + Math.cos(ang) * sp * a2, qy = y + Math.sin(ang) * sp * a2 + 420 * sc * a2 * a2;
      const col = pick(['255,140,180', '255,196,130', '255,236,210', '255,160,215', '230,180,255'], hash(314, i)), fa = 1 - a / 2.4;
      g.strokeStyle = `rgba(${col},${0.7 * fa * k})`; g.lineWidth = (3 + hash(315, i) * 4) * sc; g.beginPath(); g.moveTo(qx, qy); g.lineTo(px, py); g.stroke();
      E.glow(g, px, py, (9 + hash(315, i) * 14) * sc, col, 0.85 * fa * k);
      if (hash(316, i) < 0.14) sparkle(g, px, py, 24 * sc, fa * k, a * 4, col);
    }
    g.restore();
  }
  function volcanoWorld(g, s, cam, o = {}) {
    const t = s.t;
    g.drawImage(LC(s, 'erupt-sky', VW, VH, eruptSky, 0.5), 0, 0, VW, VH);
    inCam(g, cam, 0.05, (q) => stars(q, t, { n: 50, seed: 82, x: -100, y: 0, w: VW + 200, h: 420, s: 2.4 }));
    inCam(g, cam, 0.35, (q) => {
      dreamVolcano(q, s, o.vx ?? 1100, o.vy ?? 900, o.vs ?? 1.4, 1, !!o.skirt);
      if (o.erupt != null) lightEruption(q, s, t, (o.vx ?? 1100) - 7 * (o.vs ?? 1.4), (o.vy ?? 900) - 430 * (o.vs ?? 1.4), o.erupt, o.ek ?? 1, o.vs ?? 1.4);
      fogBand(q, t, { n: 10, seed: 83, x0: -300, x1: 2300, y0: 820, y1: 960, w: 1000, h: 280, speed: 30, rgb: '255,180,190', a: 0.55 });
    });
    if (o.mid) inCam(g, cam, 1, o.mid);
    if (o.front) inCam(g, cam, 1.3, o.front);
    // 落下的白灰（像雪）
    E.kit.particles(g, t, 'ash', { n: o.ash ?? 60, seed: 84 });
  }
  /* ---------- 镜头 36 · 喷发（141.39 → 145.57）：不是灾难，是光 ---------- */
  function shotEruption(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 1000, y: lerp(520, 470, ease.out(clamp(lt / 4))), z: lerp(1.12, 0.96, ease.out(clamp(lt / 4))), ...shake(s, 10 * Math.exp(-lt * 2) + 4 * s.acc(0.2), 67, 26) };
    volcanoWorld(g, s, cam, {
      erupt: s.shot.t0 - 0.05, ash: 80,
      mid: (q) => {
        q.drawImage(LC(s, 'hill-ground', 2200, 400, (qq) => { qq.translate(100, -760); hillGround(qq); }, 1), -100, 760, 2200, 400);
        // 冲击波推开的雾
        const w = ease.out(clamp(lt / 1.6));
        for (let i = 0; i < 8; i++) withAlpha(q, 0.5 * (1 - w), (qq) => qq.drawImage(puff(i, '255,210,220'), 960 + Math.cos(i) * w * 1200 - 300, 700 + Math.sin(i * 1.7) * 100 - 100, 600, 220));
        for (const [x, who] of [[780, 'dad'], [900, 'adele'], [1020, 'mom']]) {
          if (who === 'adele') cast(q, 'adele-alter', { x, y: HILL_Y(x), h: 330, pose: 'look-up', outfit: 'home', t, sil: '#1a0e1c', rim: '255,190,160', wind: 0.6 });
          else cast(q, 'sheep-black', { x, y: HILL_Y(x), h: sheepH(who, 'stand', 104), pose: 'stand', t, ...(who === 'dad' ? DAD : MOM), sil: '#1a0e1c', rim: '255,190,160' });
        }
      },
    });
    sparkles(g, t, 34, 15, '255,220,200');
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 37 · 羊卷风（145.57 → 149.75）：小羊们被上升气流卷成一根粉色的龙卷风 ---------- */
  function sheepnado(g, s, t, cx, cy, H, k) {
    // 螺旋：每个元素有自己的高度 h 与角速度；按前后排序（背面的先画、更暗更小）
    const items = [];
    const N = 46;
    for (let i = 0; i < N; i++) {
      const h = fract(hash(321, i) + t * 0.12 * (0.6 + hash(322, i) * 0.8));
      const r = (40 + Math.pow(h, 1.3) * 420) * k, th = t * (2.2 + hash(323, i)) + i * 2.4;
      const x = cx + Math.cos(th) * r + Math.sin(h * 5 + t) * 40 * h, y = cy - h * H, z = Math.sin(th);
      items.push({ i, x, y, z, h, th });
    }
    items.sort((a, b) => a.z - b.z);
    // 漏斗雾
    for (let j = 0; j < 12; j++) { const h = j / 12, r = (60 + Math.pow(h, 1.3) * 420) * k; withAlpha(g, 0.28 * k, (q) => q.drawImage(puff(j, '255,190,226'), cx - r * 1.3 + Math.sin(t * 2 + j) * 30, cy - h * H - 70, r * 2.6, 140)); }
    for (const it of items) {
      const sc = 0.75 + 0.25 * (it.z + 1) / 2, kind = it.i % 9;
      if (kind === 0) bottle(g, s, it.x, it.y, 60 * sc, it.th * 2);
      else if (kind === 4) lantern(g, s, it.x, it.y - 30, 34 * sc, it.i % 4, it.th);
      else lamb(g, s, it.x, it.y, 58 * sc, { v: it.i, spin: it.th * 1.5, glow: it.z > 0 ? 0.8 : 0.2, expr: it.i % 2 ? 'surprise' : 'laugh', pose: 'jump', flip: Math.cos(it.th) < 0, alpha: 0.7 + 0.3 * (it.z + 1) / 2 });
    }
    // 旋转的风线
    g.strokeStyle = `rgba(255,236,246,${0.45 * k})`; g.lineWidth = 3; g.lineCap = 'round';
    for (let j = 0; j < 6; j++) { g.beginPath(); for (let u = 0; u <= 1; u += 0.05) { const h = fract(j / 6 + u * 0.3), r = (60 + Math.pow(h, 1.3) * 420) * k, th = t * 3 + u * 5 + j; g.lineTo(cx + Math.cos(th) * r, cy - h * H + Math.sin(th) * 20); } g.stroke(); }
    g.lineCap = 'butt';
  }
  function shotSheepnado(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 1000, y: 470, z: 0.95 + lt * 0.02, ...shake(s, 4 + 3 * s.acc(0.2), 69, 20) };
    volcanoWorld(g, s, cam, {
      erupt: D[67] - 0.05, ek: 0.6, vx: 1500, vs: 1.1, ash: 60,
      mid: (q) => {
        q.drawImage(LC(s, 'hill-ground', 2200, 400, (qq) => { qq.translate(100, -760); hillGround(qq); }, 1), -100, 760, 2200, 400);
        sheepnado(q, s, t, 1040, 860, 820, clamp(lt / 0.8));
        // 她抱住两只黑羊，被风吹得衣角乱飞
        cast(q, 'sheep-black', { x: 600, y: HILL_Y(600), h: sheepH('dad', 'stand', 110), pose: 'stand', t, ...DAD, flip: false, expr: 'surprise' });
        cast(q, 'adele-alter', { x: 480, y: HILL_Y(480), h: 360, pose: 'stand', outfit: 'home', t, expr: 'surprise', wind: 1, sil: '#1a0e1c', rim: '255,190,170', rimDir: -0.4 });
        cast(q, 'sheep-black', { x: 380, y: HILL_Y(380), h: sheepH('mom', 'stand', 106), pose: 'stand', t, ...MOM, flip: false, expr: 'surprise' });
      },
    });
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 38 · 外套回来了（149.75 → 153.92）：三只小羊撑着外套像降落伞一样飘下来 ---------- */
  function shotCoatReturn(g, s) {
    const t = s.t, lt = s.lt;
    const fall = ease.inOut(clamp(lt / 3.4));
    const cx = lerp(1250, 900, fall), cy = lerp(-150, 620, fall);
    const cam = { x: lerp(1100, 920, fall), y: lerp(300, 560, fall), z: lerp(1.0, 1.25, fall), ...hand(s, 71, 4, 0.4) };
    volcanoWorld(g, s, cam, {
      erupt: D[67] - 0.05, ek: 0.5, vx: 1500, vs: 1.1, ash: 70,
      mid: (q) => {
        q.drawImage(LC(s, 'hill-ground', 2200, 400, (qq) => { qq.translate(100, -760); hillGround(qq); }, 1), -100, 760, 2200, 400);
        // 外套张开着飘下来：两只小羊叼着两只袖口、一只叼着领后的挂环，像撑着一顶降落伞（敞开的前襟露出红里子）
        coatTrio(q, s, t, [cx, cy - 150], 250, 64, 0, { dir: -1, seed: 13, spread: 0.95, drop: 0.3, flap: 0.6, bob: (i) => Math.sin(t * 4 + i) * 10, spin: (i) => Math.sin(t * 3 + i) * 0.15 });
        sparkle(q, cx, cy - 190, 40, 0.8, t, '255,236,210');
        cast(q, 'adele-alter', { x: 900, y: HILL_Y(900), h: 340, pose: 'look-up', sd: sdMix('Relax', 'Interact', sst(2.2, 2.8, lt)), outfit: 'home', t, expr: 'surprise', look: [0.2, -1], wind: 0.6 });
        cast(q, 'sheep-black', { x: 760, y: HILL_Y(760), h: sheepH('dad', 'stand', 104), pose: 'stand', t, ...DAD, expr: 'smile', look: [0.3, -1] });
        cast(q, 'sheep-black', { x: 1040, y: HILL_Y(1040), h: sheepH('mom', 'stand', 104), pose: 'stand', t, ...MOM, flip: true, expr: 'smile', look: [-0.3, -1] });
      },
    });
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 39 · 穿上外套（153.92 → 158.10）：外套一甩、红系带一扣，156.01 白灰炸开，开花的法杖到手 ---------- */
  const KA = () => window.MVE && window.MVE.keyart;
  const KA_KEY = 'alter-e0';
  // 与 MVE.keyart.credit 相同（片尾字幕里要写；影片脚本执行时 keyart.js 还没加载，所以直接写这串字）
  const KA_CREDIT = '角色立绘 © Hypergryph（官方原画，本页分层绑定）';
  const SD_CREDIT = 'Q版小人 © Hypergryph（官方 Spine 模型）'; // 与 MVE.sd.credit 相同
  const kaReady = () => { const K = KA(); return !!(K && K.ready && K.ready(KA_KEY)); };
  /** 立绘镜头的背景：本片的火山口夜色（渐变 + 几团很大的柔光和雾，本身就是虚的，像景深外的背景） */
  function kaVolcanoBg(q, s, o = {}) {
    const t = s.t;
    q.drawImage(LC(s, 'erupt-sky', VW, VH, eruptSky, 0.5), 0, 0, VW, VH);
    const lx = o.lx ?? 1500, ly = o.ly ?? 760;
    E.glow(q, lx, ly, 1100, '255,120,140', 0.45);
    E.glow(q, lx, ly, 520, '255,200,180', 0.55 * (o.hot ?? 1));
    E.glow(q, lx, ly + 40, 180, '255,244,230', 0.7 * (o.hot ?? 1));
    fogBand(q, t, { n: 8, seed: 331, x0: -300, x1: 2300, y0: 760, y1: 1080, w: 1100, h: 360, speed: 22, rgb: '255,190,210', a: 0.5 });
    fogBand(q, t, { n: 6, seed: 332, x0: -300, x1: 2300, y0: 80, y1: 400, w: 1100, h: 320, speed: 12, rgb: '220,170,240', a: 0.25 });
  }
  function shotTransform(g, s) {
    const t = s.t, lt = s.lt, T = D[74];
    const pre = t < T, u = clamp((t - s.shot.t0) / (T - s.shot.t0)), after = Math.max(0, t - T);
    // 156.01 的闪光之后：切到官方立绘（纯烬 · 精英零——穿着那件外套、拿着开花的法杖），上升气流吹起衣摆和头发，慢慢推近。
    // 立绘没加载好 / 设备不支持时，照旧画 Q 版的这一小节
    if (!pre && kaReady()) {
      const K = KA();
      const ok = K.shot(g, s, {
        key: KA_KEY, crop: 'upper',
        from: { crop: 'upper', z: 1.0, y: 0.03, look: [0.3, -0.12], cast: 0.15 }, to: { crop: 'upper', z: 1.1, y: 0.0, look: [0.14, -0.06], cast: 0.7 },
        ease: 'sine', span: [T - s.shot.t0, s.dur],
        eyes: 'open', smile: 0.15, blush: 0.2, wind: 1, windDir: -1, glow: 1.3, seed: 7,
        grade: { base: 'ember', tint: ['#fff0f4', 0.12], overlay: ['#ff6fa0', 0.14, 'soft-light'], light: { color: '#ffb48c', dir: [0.85, 0.35], rim: 1.0, wash: 0.1 }, leak: '255,130,150', bokeh: '255,180,210', grain: 0 },
        bg: (q, s2) => kaVolcanoBg(q, s2, { lx: 1560, ly: 820, hot: 1 + 0.4 * Math.exp(-after * 2) }),
        particles: [{ type: 'embers', n: 46 }, { type: 'ash', n: 50 }], dof: 0.5, bloom: 0.45, pulse: 0.4,
        leak: { x: 1700, y: 900, r: 1100, rgb: '255,120,140', a: 0.34 }, vignette: 0.5, grain: 0,
        // 彩色叶子从法杖的花枝上迸出来（立绘坐标系里的锚点）
        over: (q, s2, A) => {
          const tip = A && (A.staffTip || A.crystal); if (!tip) return;
          for (let i = 0; i < 24; i++) { const a = after - hash(331, i) * 0.3; if (a < 0 || a > 2) continue; const ang = hash(332, i) * TAU, sp = (200 + hash(333, i) * 300) * 1.4; const px = tip[0] + Math.cos(ang) * sp * a, py = tip[1] + Math.sin(ang) * sp * a + 160 * a * a; q.save(); q.translate(px, py); q.rotate(a * 5 + i); q.fillStyle = pick(['#ff8ab4', '#8ad0ff', '#ffe08a', '#a8f0a0', '#c8a8ff'], hash(334, i)); q.globalAlpha = (1 - a / 2) * 0.95; q.beginPath(); q.ellipse(0, 0, 14, 7, 0, 0, TAU); q.fill(); q.restore(); }
          E.glow(q, tip[0], tip[1], 160, '255,236,246', 0.35 + 0.35 * Math.exp(-after * 2));
        },
        fallback: (q, s2) => transformChibi(q, s2),
      });
      if (!ok) vig(g, s, 0.5); // 立绘没画出来：fallback 画的是 Q 版画面，补上它原来的暗角
      transformFlash(g, s, after);
      return;
    }
    transformChibi(g, s);
    if (!pre) transformFlash(g, s, after);
    vig(g, s, 0.5);
  }
  /** 156.01：闪白 + 白灰像雪一样在光里炸开（立绘 / Q 版两种画面共用） */
  function transformFlash(g, s, after) {
    s.post.fill(g, '#fff4f0', Math.exp(-after * 4) * 0.85 * flashK(s), 'lighter');
    for (let i = 0; i < 60; i++) { const a = after - hash(341, i) * 0.2; if (a < 0 || a > 2.2) continue; const ang = hash(342, i) * TAU, sp = 300 + hash(343, i) * 700; const x = 960 + Math.cos(ang) * sp * a, y = 560 + Math.sin(ang) * sp * a * 0.7 + 80 * a * a; sparkle(g, x, y, 12 + hash(344, i) * 16, (1 - a / 2.2), a * 3, '255,255,255'); }
  }
  function transformChibi(g, s) {
    const t = s.t, lt = s.lt, T = D[74];
    const pre = t < T, u = clamp((t - s.shot.t0) / (T - s.shot.t0)), after = Math.max(0, t - T);
    const cam = { x: 960, y: lerp(560, 520, ease.out(clamp(after / 2))), z: lerp(1.5, 1.35, ease.out(clamp(lt / 2))) + after * 0.03, ...shake(s, pre ? 2 : 10 * Math.exp(-after * 3), 73, 24) };
    volcanoWorld(g, s, cam, {
      erupt: D[67] - 0.05, ek: pre ? 0.4 : 0.8, vx: 1500, vs: 1.1, ash: pre ? 40 : 140,
      mid: (q) => {
        const ax = 960, ay = 900;
        q.drawImage(LC(s, 'hill-ground', 2200, 400, (qq) => { qq.translate(100, -760); hillGround(qq); }, 1), -100, 760, 2200, 400);
        if (pre) {
          // 她把外套举在身侧 → 原地一转，领口沿着头顶划一道弧 → 外套落到肩上（156.01 的闪光里换装）
          // 官方小人站着；原地转两圈用“纸片转身”：横向按 cos 压扁，转过背面时左右镜像（外套绕着她飞一圈）
          const spin = u > 0.3 && u < 0.86 ? ease.inOut((u - 0.3) / 0.56) * TAU * 2 : 0, cs = Math.cos(spin);
          const ao = { x: ax, y: ay, h: 420, pose: 'stand', flip: cs < 0, outfit: 'home', t, expr: 'determined', wind: 0.9 };
          const sh = anchor('adele-alter', Object.assign({}, ao, { pose: 'stand', flip: false }), 'chest', [ax, ay - 250]);
          const coatAt = (w) => {
            // w 0..1：领口位置（手边 → 头顶 → 肩上）与布料“下垂”的方向（与运动方向相反 + 重力）
            const th = lerp(0.35, -3.0, w), R = lerp(190, 30, ease.in(w)), cx = ax + Math.cos(th) * R, cy = ay - 300 + Math.sin(th) * R * 0.9;
            const x = lerp(cx, sh[0], sst(0.75, 1, w)), y = lerp(cy, sh[1] - 40, sst(0.75, 1, w));
            const vx = -Math.sin(th), vy = Math.cos(th) * 0.9, sp = Math.sin(PI * clamp(w * 1.1)) * 1.6;
            let dx = -vx * sp * (w < 1 ? 1 : 0), dy = 1 - vy * sp;
            const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
            return [x, y, dx, dy];
          };
          const sw = ease.inOut(clamp((u - 0.25) / 0.65));
          for (let echo = 3; echo >= 0; echo--) {
            const [cx, cy, dx, dy] = coatAt(clamp(sw - echo * 0.05));
            coatHang(q, t, { C: [cx, cy], L: 290, dn: [dx, dy], face: -1, flap: 1.2 * (1 - sst(0.9, 1, sw)), seed: 17, alpha: echo ? 0.18 : 1 });
          }
          q.save(); q.translate(ax, 0); q.scale(Math.max(0.06, Math.abs(cs)), 1); q.translate(-ax, 0);
          cast(q, 'adele-alter', ao);
          q.restore();
          // 绕着她升起的一圈白灰星光
          for (let i = 0; i < 26; i++) { const ph = fract(i / 26 + t * 0.6), a = ph * TAU * 2 + i; const r = 150 + 40 * Math.sin(i), y = ay - 40 - ph * 520; sparkle(q, ax + Math.cos(a) * r, y + Math.sin(a) * 30, 10 + (i % 3) * 6, Math.sin(PI * ph) * sst(0.2, 0.6, u), a, '255,250,245'); }
          // 红系带“唰”地扣上
          if (u > 0.78) { const k = (u - 0.78) / 0.22; q.strokeStyle = `rgba(210,50,60,${k})`; q.lineWidth = 8; q.lineCap = 'round'; q.beginPath(); q.moveTo(sh[0] - 70, sh[1] + 60); q.quadraticCurveTo(sh[0], sh[1] + 60 + 40 * (1 - k), sh[0] + 70, sh[1] + 60); q.stroke(); q.lineCap = 'butt'; sparkle(q, sh[0] + 70, sh[1] + 60, 30 * k, k, t * 3, '255,210,210'); }
        } else {
          // 变身之后：穿着外套、拿着开花的法杖，衣摆和头发在上升气流里飘
          E.glow(q, ax, ay - 220, 520, '255,220,210', 0.5 * Math.exp(-after * 0.8) + 0.15);
          cast(q, 'adele-alter', { x: ax, y: ay, h: 420, pose: 'wave', prop: 'staff', outfit: 'coat', t, expr: 'determined', wind: 1, look: [0.6, -0.4] });
          // 彩色叶子从法杖上迸出来
          for (let i = 0; i < 24; i++) { const a = after - hash(331, i) * 0.3; if (a < 0 || a > 2) continue; const ang = hash(332, i) * TAU, sp = 200 + hash(333, i) * 300; const px = ax + 150 + Math.cos(ang) * sp * a, py = ay - 380 + Math.sin(ang) * sp * a + 120 * a * a; q.save(); q.translate(px, py); q.rotate(a * 5 + i); q.fillStyle = pick(['#ff8ab4', '#8ad0ff', '#ffe08a', '#a8f0a0', '#c8a8ff'], hash(334, i)); q.globalAlpha = 1 - a / 2; q.beginPath(); q.ellipse(0, 0, 9, 5, 0, 0, TAU); q.fill(); q.restore(); }
        }
      },
    });
  }
  /* ---------- 镜头 40 · 踩着小羊过光河（158.10 → 162.26）：小羊排成一串踏脚石，她一拍一跳 ---------- */
  function shotStepping(g, s) {
    const t = s.t, lt = s.lt, b0 = T0beat(s), bt = s.beat - b0;
    const step = 170, x0 = 300;
    const i = Math.floor(bt), f = fract(bt);
    const ax = x0 + (i + f) * step, ayBase = (x) => 900 - (x - x0) * 0.22;
    const cam = { x: ax + 200, y: ayBase(ax) - 280, z: 1.1, ...hand(s, 75, 4, 0.5) };
    volcanoWorld(g, s, cam, {
      erupt: D[67] - 0.05, ek: 0.55, vx: 2100, vy: 700, vs: 1.4, ash: 90,
      mid: (q) => {
        // 光河
        // （光河左右都铺到镜头看得到的范围之外：镜头从 x≈500 跟到 x≈1860，画面两边是 -380 … 2740）
        additive(q, (qq) => { qq.globalAlpha = 0.8; qq.fillStyle = vg(qq, 700, 1150, [[0, 'rgba(255,120,110,0)'], [0.4, 'rgba(255,140,120,0.7)'], [1, 'rgba(255,200,150,0.9)']]); qq.beginPath(); qq.moveTo(-900, 1400); for (let x = -900; x <= 3500; x += 100) qq.lineTo(x, 980 - (x - x0) * 0.22 + Math.sin(x * 0.01 + t * 2) * 12); qq.lineTo(3500, 1400); qq.closePath(); qq.fill(); qq.globalAlpha = 1; });
        for (let k = 0; k < 40; k++) { const ph = fract(t * 0.6 + hash(351, k)); const x = -500 + hash(352, k) * 3600; E.glow(q, x + ph * 200, 1000 - (x - x0) * 0.22 - ph * 60, 10, '255,220,180', Math.sin(PI * ph)); }
        // 踏脚石小羊：落脚的那一只被踩得一扁
        const V = 74, under = (k) => (k === i ? Math.max(0, 1 - f * 5) : k === i + 1 ? Math.max(0, (f - 0.85) * 6) : 0);
        const stone = (k) => ayBase(x0 + k * step) + Math.sin(t * 2 + k) * 6 + 30; // 这只羊的脚底
        const back = (k) => stone(k) - 0.8 * V * (1 - 0.2 * under(k) * 0.9); // 羊背（被踩扁时跟着矮下去）
        for (let k = -4; k < 16; k++) {
          const lx = x0 + k * step, u = under(k);
          lamb(q, s, lx, stone(k), V, { v: k + 4, glow: 1, sq: u * 0.9, expr: u > 0.2 ? 'surprise' : 'smile', pose: 'stand', flip: k % 2 === 0 });
          if (u > 0.5) sparkle(q, lx, stone(k) - 60, 40 * u, u, t * 3, '255,236,210');
        }
        // 她的脚正好踩在羊背上（起跳 / 落地的那一只），中间是一道弧：一拍一跳，跑着跳过去——
        // 步子按横向速度（一拍 step 像素）配好（脚不打滑）；起跳的弧只算一次（air: 0，官方小人不再自己加一层跳）
        const ay = lerp(back(i), back(i + 1), f) - 4 * f * (1 - f) * 96;
        const ro = { h: 360, pose: 'run' };
        cast(q, 'adele-alter', { x: ax, y: ay, h: 360, pose: 'run', speed: stepSpeed('adele-alter', ro, step / BEAT, 0.9), air: 0, prop: 'staff', outfit: 'coat', t, expr: 'determined', wind: 0.8 });
      },
    });
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 41 · 往上跑（162.26 → 166.44）：两只黑羊一左一右陪着她跑 ---------- */
  function shotClimb(g, s) {
    const t = s.t, lt = s.lt;
    // 镜头跟着她往右上方跑（她 200 像素 / 秒，步频按速度算；两只黑羊小碎步跟上）
    const v = 200, run = 700 + lt * v, yy = (x) => 980 - (x + 200) * (420 / 2600);
    const cam = { x: run + 260, y: 500 - (run - 700) * (420 / 2600), z: 1.2, ...hand(s, 77, 6, 0.8) };
    volcanoWorld(g, s, cam, {
      erupt: D[67] - 0.05, ek: 0.7, vx: 1300, vy: 760, vs: 1.6, ash: 110,
      mid: (q) => {
        // 斜坡（向右上）：左右都铺到镜头看得到的范围之外
        q.fillStyle = '#1e1230'; q.beginPath(); q.moveTo(-800, 1400); q.lineTo(-800, yy(-800)); q.lineTo(3200, yy(3200)); q.lineTo(3200, 1400); q.closePath(); q.fill();
        q.strokeStyle = 'rgba(255,160,140,0.6)'; q.lineWidth = 4; q.beginPath(); q.moveTo(-800, yy(-800)); q.lineTo(3200, yy(3200)); q.stroke();
        const mh = sheepH('mom', 'run', 100), dh = sheepH('dad', 'run', 104);
        cast(q, 'sheep-black', { x: run - 170, y: yy(run - 170), h: mh, pose: 'run', speed: stepSpeed('sheep-black', { h: mh, pose: 'run' }, v, 2.5), t, ...MOM, expr: 'laugh' });
        cast(q, 'adele-alter', { x: run, y: yy(run), h: 380, pose: 'run', speed: stepSpeed('adele-alter', { h: 380, pose: 'run' }, v, 0.68), prop: 'staff', outfit: 'coat', t, expr: 'laugh', wind: 1 });
        cast(q, 'sheep-black', { x: run + 170, y: yy(run + 170), h: dh, pose: 'run', speed: stepSpeed('sheep-black', { h: dh, pose: 'run' }, v, 2.4), t: t + 0.2, ...DAD, expr: 'laugh' });
        for (let k = 0; k < 7; k++) { const ph = fract(s.beat * 2 + k * 0.3), [hy, sq] = hop(ph); const lx = run - 500 - k * 110; lamb(q, s, lx, yy(lx) - hy * 50, 60, { v: k, sq, glow: 1, pose: 'jump', expr: 'laugh' }); }
      },
    });
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 42 · 登山（166.44 → 172.70）：远景，整座发光的火山，一串小羊的光点盘旋着通向山顶 ---------- */
  let ASC_LEN = null; // 盘山路的累计横向路程表（u 从 0 到 1，400 段；只算一次）
  function shotAscent(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp(lt / 6.2));
    const cam = { x: lerp(900, 1050, k), y: lerp(620, 380, k), z: lerp(0.9, 1.1, k), ...hand(s, 79, 3, 0.3) };
    volcanoWorld(g, s, cam, {
      erupt: D[67] - 0.05, ek: 0.8, vx: 1000, vy: 1000, vs: 1.8, ash: 100, skirt: true,
      mid: (q) => {
        // 盘旋上山的小羊光点 + 她（一个小小的发光的点）
        const cx = 1000 - 7 * 1.8, top = 1000 - 430 * 1.8;
        // 盘山的小羊灯：一串会随她的脚步一只只亮起来的光点（每四只画一只小羊）
        const P = (u) => { const th = u * TAU * 2.2 + 0.4, r = (1 - u) * 560; return [cx + Math.cos(th) * r, 1000 - u * (1000 - top) + Math.sin(th) * r * 0.14, Math.sin(th)]; };
        // 她在上一个镜头里已经跑上了山脚那一大圈（那一段的灯已经亮着）：这个镜头从 U0 跑到山顶，一直在跑（接上一个镜头的速度），到顶前慢下来
        const U0 = 0.36, x01 = clamp(lt / 6.2), uH = U0 + (0.99 - U0) * (x01 + 0.5 * x01 * (1 - x01));
        q.save(); q.globalCompositeOperation = 'lighter'; q.strokeStyle = 'rgba(255,190,220,0.35)'; q.lineWidth = 5; q.beginPath();
        for (let i = 0; i <= 80; i++) { const u = i / 80; if (u > uH) break; const [x, y] = P(u); i ? q.lineTo(x, y) : q.moveTo(x, y); }
        q.stroke(); q.restore();
        for (let i = 0; i < 64; i++) {
          const u = i / 64, [x, y, z] = P(u);
          const lit = sst(u - 0.08, u, uH);
          if (lit <= 0.01) continue;
          E.glow(q, x, y - 6, 30, '255,170,215', 0.75 * lit * (0.7 + 0.3 * z));
          E.glow(q, x, y - 6, 9, '255,245,250', 0.9 * lit);
          if (i % 4 === 0) lamb(q, s, x, y + 4, 26, { v: i / 4, glow: 0.6 * lit, pose: 'jump', flip: z > 0, alpha: lit });
        }
        const [ax, ay, az] = P(uH);
        E.glow(q, ax, ay - 24, 80, '255,240,230', 0.9);
        // 远景里只有 70 像素高的一个发光小人：腿的相位 = 沿盘山路走过的横向路程 / 步幅（她朝左右跑，脚按横向速度着地；到顶前慢下来，脚不打滑）
        if (!ASC_LEN) { ASC_LEN = [0]; let px = P(0)[0]; for (let j = 1; j <= 400; j++) { const x = P(j / 400)[0]; ASC_LEN.push(ASC_LEN[j - 1] + Math.abs(x - px)); px = x; } }
        const lenAt = (u) => { const jf = clamp(u) * 400, j0 = Math.min(399, Math.floor(jf)); return lerp(ASC_LEN[j0], ASC_LEN[j0 + 1], jf - j0); };
        const ro = { h: 70, pose: 'run' };
        cast(q, 'adele-alter', { x: ax, y: ay, h: 70, pose: 'run', t: gaitTime('adele-alter', ro, lenAt(uH) - lenAt(U0), s.shot.t0), prop: 'staff', outfit: 'coat', flip: az > 0, sil: '#1a0e1c', rim: '255,220,200' });
      },
    });
    sparkles(g, t, 30, 16, '255,220,200');
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 43 · 火山口（172.70 → 176.89）：她跑到山顶的边缘，停下来，喘口气 ---------- */
  function shotRim(g, s) {
    const t = s.t, lt = s.lt;
    const slow = sst(1.9, 2.4, lt);
    const cam = { x: 960, y: 540, z: lerp(1.0, 1.15, ease.inOut(clamp(lt / 4.2))), ...hand(s, 81, 3 * (1 - slow), 0.4) };
    const tt = s.shot.t0 + lt * (1 - slow * 0.7);
    volcanoWorld(g, s, cam, {
      ash: 70,
      mid: (q) => {
        // 近景：火山口的边缘（暗），后面是发光的火山口
        E.glow(q, 960, 760, 900, '255,150,140', 0.55);
        E.glow(q, 960, 780, 380, '255,236,210', 0.7);
        additive(q, (qq) => { qq.globalAlpha = 0.5; qq.fillStyle = vg(qq, 0, 800, [[0, 'rgba(255,200,180,0)'], [1, 'rgba(255,220,200,0.9)']]); qq.beginPath(); qq.moveTo(820, 800); qq.lineTo(700, 0); qq.lineTo(1220, 0); qq.lineTo(1100, 800); qq.closePath(); qq.fill(); qq.globalAlpha = 1; });
        q.fillStyle = '#140a1c'; q.beginPath(); q.moveTo(-200, 1200); q.lineTo(-200, 880); q.quadraticCurveTo(500, 790, 960, 820); q.quadraticCurveTo(1450, 790, 2200, 880); q.lineTo(2200, 1200); q.closePath(); q.fill();
        q.strokeStyle = 'rgba(255,190,170,0.8)'; q.lineWidth = 4; q.beginPath(); q.moveTo(-200, 880); q.quadraticCurveTo(500, 790, 960, 820); q.quadraticCurveTo(1450, 790, 2200, 880); q.stroke();
        // 跑到火山口边上慢下来、停住：跑的时候腿的相位按“跑过的距离”算（减速时脚不打滑），停下以后换站姿
        const ax = lerp(560, 760, ease.out(clamp(lt / 2.2))), running = slow <= 0.5, d = ax - 560;
        const mh = sheepH('mom', 'stand', 100), dh = sheepH('dad', 'stand', 104);
        const tA = running ? gaitTime('adele-alter', { h: 380, pose: 'run' }, d, s.shot.t0) : tt;
        const tM = running ? gaitTime('sheep-black', { h: mh, pose: 'run' }, d, s.shot.t0) : tt, tD = running ? gaitTime('sheep-black', { h: dh, pose: 'run' }, d, s.shot.t0 + 0.2) : tt;
        cast(q, 'adele-alter', { x: ax, y: 812, h: 380, pose: running ? 'run' : 'stand', prop: 'staff', outfit: 'coat', t: tA, expr: 'determined', wind: 0.7, sil: '#1a0e1c', rim: '255,220,200' });
        cast(q, 'sheep-black', { x: ax - 170, y: 818, h: mh, pose: running ? 'run' : 'stand', t: tM, ...MOM, sil: '#1a0e1c', rim: '255,220,200' });
        cast(q, 'sheep-black', { x: ax + 170, y: 816, h: dh, pose: running ? 'run' : 'stand', t: tD, ...DAD, sil: '#1a0e1c', rim: '255,220,200' });
      },
    });
    vig(g, s, 0.55);
  }

  /* =========================================================
   * 间奏 C · 火山口的告别（176.89 → 191.49）：两只黑羊走进光里，有一瞬变回两个人的剪影
   * ========================================================= */
  function rimWorld(g, s, cam, o = {}) {
    const t = s.t;
    g.drawImage(LC(s, 'erupt-sky', VW, VH, eruptSky, 0.5), 0, 0, VW, VH);
    inCam(g, cam, 0.05, (q) => stars(q, t, { n: 50, seed: 91, x: -100, y: 0, w: VW + 200, h: 420, s: 2.4 }));
    inCam(g, cam, 0.4, (q) => {
      // 火山口的光：柔和的光柱 + 光晕（不再是喷发，而是安静的亮）
      const lx = o.lightX ?? 1080;
      E.glow(q, lx, 700, 1000, '255,160,150', 0.45);
      E.glow(q, lx, 720, 420, '255,236,220', 0.6 * (o.light ?? 1));
      additive(q, (qq) => { qq.globalAlpha = 0.4 * (o.light ?? 1); qq.fillStyle = vg(qq, -100, 760, [[0, 'rgba(255,220,210,0)'], [1, 'rgba(255,236,226,1)']]); qq.beginPath(); qq.moveTo(lx - 150, 760); qq.lineTo(lx - 320, -100); qq.lineTo(lx + 320, -100); qq.lineTo(lx + 150, 760); qq.closePath(); qq.fill(); qq.globalAlpha = 1; });
      fogBand(q, t, { n: 10, seed: 92, x0: -300, x1: 2300, y0: 700, y1: 820, w: 1000, h: 240, speed: 8, rgb: '255,210,220', a: 0.45 });
    });
    inCam(g, cam, 1, (q) => {
      q.fillStyle = '#160b1e'; q.beginPath(); q.moveTo(-300, 1200); q.lineTo(-300, 860); q.quadraticCurveTo(600, 780, 1080, 800); q.quadraticCurveTo(1600, 780, 2300, 860); q.lineTo(2300, 1200); q.closePath(); q.fill();
      q.strokeStyle = 'rgba(255,200,180,0.75)'; q.lineWidth = 4; q.beginPath(); q.moveTo(-300, 860); q.quadraticCurveTo(600, 780, 1080, 800); q.quadraticCurveTo(1600, 780, 2300, 860); q.stroke();
      if (o.mid) o.mid(q);
    });
    if (o.front) inCam(g, cam, 1.3, o.front);
    E.kit.particles(g, t, 'ash', { n: 50, seed: 93 });
  }
  const RIM_Y = (x) => { const u = (x - 1080) / 1380; return 800 + u * u * 60 - 6; };
  /* ---------- 镜头 44 · 两只黑羊走进光里（176.89 → 181.06） ---------- */
  function shotSheepWalk(g, s) {
    const t = s.t, lt = s.lt, k = ease.inOut(clamp(lt / 4.2));
    const cam = { x: lerp(820, 900, k), y: 560, z: 1.12, ...hand(s, 93, 2, 0.2) };
    rimWorld(g, s, cam, {
      mid: (q) => {
        // 两只羊慢慢走进光里（先加速后减速：腿的相位按走过的距离算，不打滑），停下，回头
        const walk = ease.inOut(clamp(lt / 3.0)), turn = lt > 3.1;
        for (const [dx, who] of [[0, 'dad'], [270, 'mom']]) {
          const x = lerp(600, 880, walk) + dx, sh = sheepH(who, 'walk', 96);
          const tw = walk < 1 ? gaitTime('sheep-black', { h: sh, pose: 'walk' }, (880 - 600) * walk, s.shot.t0 + dx * 0.004) : t + dx * 0.01;
          cast(q, 'sheep-black', { x, y: RIM_Y(x), h: sh, pose: walk < 1 ? 'walk' : 'stand', t: tw, ...(who === 'dad' ? DAD : MOM), flip: turn, sil: '#1a0e1c', rim: '255,220,210' });
        }
        cast(q, 'adele-alter', { x: 420, y: RIM_Y(420), h: 380, pose: 'stand', prop: 'staff', outfit: 'coat', t, expr: 'sad', wind: 0.4, sil: '#1a0e1c', rim: '255,210,200' });
      },
    });
    vig(g, s, 0.55);
  }
  /* ---------- 镜头 45 · 剪影（181.06 → 185.23）：在光里，两只羊变成了两个人，向她挥手 ---------- */
  const PARENTS_X = [880, 1190];
  /** 爸爸（卡提亚）和妈妈（玛格娜，穿着同一件外套）的逆光剪影，并肩站着向她挥手 */
  function parentsSil(q, t, pose, a) {
    const k = 1, mh = scaleOf('magna', 0.94);
    cast(q, 'katia', { x: PARENTS_X[0], y: RIM_Y(PARENTS_X[0]), h: 420 * k, pose, outfit: 'suit', t, flip: true, sil: '#1a0e1c', rim: '255,226,214', alpha: a });
    cast(q, 'magna', { x: PARENTS_X[1], y: RIM_Y(PARENTS_X[1]), h: 420 * mh, pose, outfit: 'field', t: t + 0.4, flip: true, sil: '#1a0e1c', rim: '255,226,214', alpha: a });
  }
  function shotParents(g, s) {
    const t = s.t, lt = s.lt;
    const morph = sst(0.4, 1.5, lt);
    const cam = { x: 1040, y: 540, z: 1.28 + lt * 0.02, ...hand(s, 95, 2, 0.2) };
    rimWorld(g, s, cam, {
      light: 1 + 0.3 * Math.sin(PI * morph),
      mid: (q) => {
        const px = PARENTS_X;
        // 变形时一团柔光
        E.glow(q, 1035, 640, 360, '255,240,230', 0.7 * Math.sin(PI * morph));
        if (morph < 1) { cast(q, 'sheep-black', { x: px[0] + 20, y: RIM_Y(px[0]), h: sheepH('dad', 'stand', 96), pose: 'stand', t, ...DAD, flip: true, sil: '#1a0e1c', rim: '255,220,210', alpha: 1 - morph }); cast(q, 'sheep-black', { x: px[1] - 20, y: RIM_Y(px[1]), h: sheepH('mom', 'stand', 96), pose: 'stand', t, ...MOM, flip: true, sil: '#1a0e1c', rim: '255,220,210', alpha: 1 - morph }); }
        if (morph > 0) parentsSil(q, t, lt > 1.9 ? 'wave2' : 'stand', morph);
        for (let i = 0; i < 20; i++) { const ph = fract(t * 0.25 + hash(351, i)); E.glow(q, 900 + hash(352, i) * 300, 800 - ph * 500, 8, '255,236,220', Math.sin(PI * ph) * 0.8 * morph); }
      },
    });
    vig(g, s, 0.55);
  }
  /* ---------- 镜头 46 · 她也挥手（185.23 → 189.40） ---------- */
  function shotWaveBack(g, s) {
    const t = s.t, bar = D[89] - D[88];
    // 第一小节：官方立绘的脸部特写——她闭着眼，慢慢睁开，看向光里的他们，轻轻地笑（逆光从火山口那边来）；
    // 第二小节切回 Q 版：她举起手挥别。立绘没加载好时，整个镜头照旧是 Q 版
    if (s.lt < bar && kaReady()) {
      const K = KA();
      const ok = K.shot(g, s, {
        key: KA_KEY, crop: 'face',
        from: { crop: 'face', z: 1.0, x: -0.012, y: 0.01, look: [0.34, 0.04], nod: 0.12 }, to: { crop: 'face', z: 1.08, x: 0.006, y: 0, look: [0.26, -0.02], nod: 0.04 },
        ease: 'sine', span: [0, bar],
        eyes: 1 - s.at(0.45, 1.3, 'sine'), smile: 0.2 + 0.25 * s.at(1.2, 2.0, 'sine'), blush: 0.35, wind: 0.5, windDir: -1, glow: 1, seed: 11, saccade: 0.3,
        grade: { base: 'dream', tint: ['#fff0f2', 0.12], overlay: ['#ff8aa8', 0.12, 'soft-light'], light: { color: '#ffd2c0', dir: [0.95, -0.25], rim: 1.0, wash: 0.12 }, leak: '255,170,170', bokeh: '255,200,220', grain: 0 },
        bg: (q, s2) => kaVolcanoBg(q, s2, { lx: 1500, ly: 640, hot: 0.9 }),
        particles: [{ type: 'ash', n: 28 }, { type: 'sparkle', n: 14 }], dof: 0.55, bloom: 0.35,
        sweep: s.at(1.0, 1.9, 'inOut'), // 睁眼的同时，一道光从脸上掠过
        leak: { x: 1720, y: 420, r: 1100, rgb: '255,190,180', a: 0.3 }, vignette: 0.5, grain: 0,
        fallback: (q, s2) => waveBackChibi(q, s2),
      });
      if (!ok) vig(g, s, 0.6);
      return;
    }
    waveBackChibi(g, s);
    vig(g, s, 0.6);
  }
  function waveBackChibi(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 700, y: 520, z: 1.7 + lt * 0.025, ...hand(s, 97, 2, 0.2) };
    rimWorld(g, s, cam, {
      lightX: 1300,
      mid: (q) => {
        E.glow(q, 760, 500, 420, '255,200,180', 0.4);
        const ao = { x: 700, y: RIM_Y(700) + 40, h: 420, pose: lt > 0.6 ? 'wave' : 'stand', prop: 'stone', outfit: 'coat', t, expr: 'tearful', wind: 0.5, look: [1, -0.1], rim: '255,210,190' };
        cast(q, 'adele-alter', ao);
        // 手心的石头发着暖光（跟着拿石头的那只手）
        const [sx, sy] = anchor('adele-alter', ao, 'prop', [610, 640]);
        E.glow(q, sx, sy, 60, '255,210,160', 0.5 + 0.2 * Math.sin(t * 2));
      },
    });
  }
  /* ---------- 镜头 47 · 雾温柔地收走（189.40 → 191.49）：两团光升上去，变成两颗星 ---------- */
  function shotFold(g, s) {
    const t = s.t, lt = s.lt;
    const close = ease.inOut(clamp(lt / 1.6));
    const cam = { x: 1040, y: 520, z: 1.25 };
    rimWorld(g, s, cam, {
      mid: (q) => {
        const px = PARENTS_X;
        if (close < 1) parentsSil(q, t, 'wave2', 1 - close);
        // 左右合拢的雾幕
        for (let i = 0; i < 8; i++) { const side = i % 2 ? 1 : -1, y = 380 + Math.floor(i / 2) * 120; withAlpha(q, 0.85 * close, (qq) => qq.drawImage(puff(i, '255,226,236'), 1035 + side * (900 - close * 820) - 350, y - 110, 700, 260)); }
        // 两团光升起
        for (let j = 0; j < 2; j++) { const up = ease.out(clamp((lt - 0.6) / 1.4)); const x = px[j] + (j ? 30 : -30) * up, y = RIM_Y(px[j]) - 200 - up * 480; E.glow(q, x, y, 40 + 20 * up, '255,244,230', 0.9 * sst(0.3, 0.8, lt)); sparkle(q, x, y, 30 + 20 * up, sst(0.3, 0.8, lt), t, '255,240,230'); }
      },
    });
    s.post.fill(g, '#fff4ec', sst(1.4, 2.08, lt) * 0.9, 'lighter');
    vig(g, s, 0.55);
  }

  /* =========================================================
   * 终段 · 云海日出（191.49 → 224.88）：太阳从云海里升起，小羊像鸟一样飞，回忆变成一张张发光的卡片
   * ========================================================= */
  function dawnSky(q) {
    q.fillStyle = vg(q, 0, VH, [[0, '#3a5aa8'], [0.3, '#7a8ad0'], [0.52, '#e8a0c0'], [0.66, '#ffc4a0'], [0.76, '#ffe2b0'], [1, '#ffd0a8']]); q.fillRect(0, 0, VW, VH);
    const R = E.rng(95); for (let i = 0; i < 90; i++) { const y = Math.pow(R(), 1.4) * 300; q.fillStyle = `rgba(255,255,255,${(0.1 + R() * 0.4) * (1 - y / 320)})`; q.fillRect(R() * VW, y, 1.5, 1.5); }
  }
  /** 一排云海（设计宽 2400，顶上被太阳镀金） */
  function cloudRow(q, seed, y, hMin, hMax, top, bot, rim) {
    const R = E.rng(seed);
    q.fillStyle = vg(q, y - hMax, y + 200, [[0, top], [1, bot]]);
    q.beginPath();
    for (let x = -100; x < 2500; x += 60 + R() * 70) { const r = hMin + R() * (hMax - hMin); q.moveTo(x + r, y); q.arc(x, y, r, 0, TAU); }
    q.rect(-100, y, 2600, 400);
    q.fill();
    if (rim) { q.globalCompositeOperation = 'source-atop'; q.fillStyle = vg(q, y - hMax, y - hMin * 0.3, [[0, rim], [1, 'rgba(255,230,200,0)']]); q.fillRect(-100, y - hMax - 10, 2600, hMax); q.globalCompositeOperation = 'source-over'; }
  }
  function dawnWorld(g, s, cam, o = {}) {
    const t = s.t, rise = o.rise ?? 1;
    g.drawImage(LC(s, 'dawn-sky', VW, VH, dawnSky, 0.5), 0, 0, VW, VH);
    inCam(g, cam, 0.05, (q) => {
      const sx = o.sunX ?? 1180, sy = lerp(760, 520, rise);
      E.glow(q, sx, sy, 1100, '255,200,150', 0.5);
      E.glow(q, sx, sy, 420, '255,230,190', 0.7);
      q.fillStyle = '#fff6e0'; q.beginPath(); q.arc(sx, sy, 110, 0, TAU); q.fill();
      E.glow(q, sx, sy, 160, '255,255,240', 0.9);
      // 旋转的光芒
      q.save(); q.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + t * 0.04, len = 900 + 200 * Math.sin(t * 0.5 + i * 2); q.fillStyle = `rgba(255,236,200,${0.06 + 0.03 * Math.sin(t + i)})`; q.beginPath(); q.moveTo(sx, sy); q.lineTo(sx + Math.cos(a - 0.04) * len, sy + Math.sin(a - 0.04) * len); q.lineTo(sx + Math.cos(a + 0.04) * len, sy + Math.sin(a + 0.04) * len); q.closePath(); q.fill(); }
      q.restore();
    });
    // 三排云海，越近越大、漂得越快
    const rows = [[0.15, 'dawn-c1', 211, 700, 40, 90, '#f4c0c8', '#e8a8b8', 'rgba(255,240,210,0.9)', 6], [0.4, 'dawn-c2', 212, 800, 70, 140, '#fbd0d0', '#d8a0b8', 'rgba(255,236,200,0.95)', 14], [0.8, 'dawn-c3', 213, 920, 110, 210, '#ffe0dc', '#c898b8', 'rgba(255,244,220,1)', 26]];
    for (const [d, key, seed, y, h0, h1, top, bot, rim, sp] of rows) {
      inCam(g, cam, d, (q) => {
        const c = LC(s, key, 2400, 600, (qq) => { qq.translate(0, -(y - 300)); cloudRow(qq, seed, y, h0, h1, top, bot, rim); }, 0.6);
        const off = -((t * sp) % 2400);
        q.drawImage(c, off - 240, y - 300, 2400, 600); q.drawImage(c, off + 2160, y - 300, 2400, 600);
      });
      if (d === 0.4 && o.mid) inCam(g, cam, 0.6, o.mid);
    }
    if (o.near) inCam(g, cam, 1, o.near);
    if (o.front) inCam(g, cam, 1.3, o.front);
  }
  /** 脚下的一小朵云（托着她站在云海上方）：(x, y) 脚底，w 宽度；a 浓度（前面再叠一层淡的，把脚埋进云里一点） */
  function cloudPad(q, x, y, w, t, a = 1) {
    E.glow(q, x, y + 6, w * 0.9, '255,236,240', 0.35 * a);
    const A = q.globalAlpha;
    for (let i = 0; i < 6; i++) {
      const u = i / 5 - 0.5, px = x + u * w * 1.1 + Math.sin(t * 1.3 + i * 2) * 6, py = y + 4 - Math.cos(u * PI) * 10 + Math.sin(t * 1.7 + i) * 3;
      q.globalAlpha = A * a * (0.75 + 0.25 * Math.sin(i * 1.7));
      q.drawImage(puff(i, i % 2 ? '255,244,250' : '255,226,240'), px - w * 0.42, py - w * 0.16, w * 0.84, w * 0.32);
    }
    q.globalAlpha = A;
  }
  /** 像鸟一样飞的一群小羊（V 字队形） */
  function flock(g, s, t, x, y, n, sc, dir = 1, seed = 1) {
    for (let i = 0; i < n; i++) {
      const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      const px = x - dir * row * 70 * sc, py = y + (i ? side * row * 34 * sc : 0) + Math.sin(t * 3 + i * 0.9) * 8 * sc;
      withAlpha(g, 0.35, (q) => q.drawImage(puff(i, '255,255,255'), px - dir * 120 * sc - 60 * sc, py - 30 * sc, 120 * sc, 40 * sc));
      lamb(g, s, px, py + 30 * sc, 44 * sc, { v: i + seed, pose: 'jump', expr: 'laugh', flip: dir < 0, glow: 0.4, spin: Math.sin(t * 2 + i) * 0.1 });
    }
  }
  /* ---------- 镜头 48 · 云海日出（191.49 → 199.84） ---------- */
  function shotSunrise(g, s) {
    const t = s.t, lt = s.lt, k = ease.inOut(clamp(lt / 8.3));
    const cam = { x: lerp(900, 1000, k), y: lerp(620, 540, k), z: lerp(1.05, 1.0, k) };
    dawnWorld(g, s, cam, {
      rise: ease.out(clamp(lt / 7)),
      mid: (q) => { flock(q, s, t, lerp(-200, 2100, fract(lt / 8.3)), 420, 9, 1, 1, 3); flock(q, s, t, lerp(2200, -300, fract(lt / 9 + 0.3)), 300, 7, 0.7, -1, 5); },
      near: (q) => {
        // 山顶（露出云海的一小块岩石），她站在上面，衣摆飞扬
        q.fillStyle = '#6a4a6a'; q.beginPath(); q.moveTo(200, 1200); q.lineTo(360, 930); q.lineTo(470, 900); q.lineTo(600, 925); q.lineTo(760, 1200); q.closePath(); q.fill();
        q.strokeStyle = 'rgba(255,220,190,0.8)'; q.lineWidth = 4; q.beginPath(); q.moveTo(360, 930); q.lineTo(470, 900); q.lineTo(600, 925); q.stroke();
        // 背影：她拿着开花的法杖，面朝云海上的太阳站着；最后一段把法杖举起来（官方小人的作战背面：Idle → Skill_1）
        cast(q, 'adele-alter', { x: 480, y: 905, h: 380, pose: 'stand', view: 'back', sd: sdMix('Idle', 'Skill_1_Loop', sst(6.0, 6.6, lt), 'back'), prop: 'staff', outfit: 'coat', t, expr: lt < 6.2 ? 'smile' : 'laugh', wind: 0.9, look: [1, -0.3], rim: '255,220,180', rimDir: -0.6 });
      },
    });
    sparkles(g, t, 24, 17, '255,244,220');
    vig(g, s, 0.35);
  }
  /* ---------- 镜头 49 · 飞（199.84 → 208.18）：她纵身一跳，小羊们聚成一朵云托着她飞 ---------- */
  function shotFlight(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 960 + lt * 20, y: 520 + Math.sin(lt * 0.8) * 20, z: 1.0, ...hand(s, 99, 5, 0.3) };
    dawnWorld(g, s, cam, {
      rise: 1, sunX: 1500,
      mid: (q) => { flock(q, s, t, lerp(-300, 2200, fract(lt / 6)), 340, 7, 0.8, 1, 7); flock(q, s, t, lerp(2300, -300, fract(lt / 7 + 0.5)), 230, 5, 0.6, -1, 9); },
      near: (q) => {
        const x = 900 + Math.sin(lt * 0.6) * 60, y = 560 + Math.sin(lt * 1.3) * 26;
        // 托着她的小羊云
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r = 110 + 30 * Math.sin(t * 2 + i); lamb(q, s, x + Math.cos(a) * r * 1.4, y + 120 + Math.sin(a) * r * 0.35, 60, { v: i, pose: 'jump', expr: 'laugh', glow: 0.5, flip: Math.cos(a) < 0 }); }
        withAlpha(q, 0.6, (qq) => qq.drawImage(puff(3, '255,244,250'), x - 260, y + 60, 520, 170));
        cast(q, 'adele-alter', { x, y: y + 110, h: 360, pose: 'jump', prop: 'staff', outfit: 'coat', t, expr: 'laugh', wind: 1, look: [1, 0], rim: '255,220,180' });
      },
      front: (q) => { for (let i = 0; i < 6; i++) { const ph = fract(t * 0.3 + i / 6); withAlpha(q, 0.5, (qq) => qq.drawImage(puff(i, '255,236,236'), 2200 - ph * 3000, 700 + i * 60, 600, 200)); } },
    });
    sparkles(g, t, 20, 18, '255,244,220');
    vig(g, s, 0.35);
  }
  /* ---------- 镜头 50 · 回忆卡片（208.18 → 216.52）：一拍翻一张 ---------- */
  const CARDS = ['radio', 'tape', 'table', 'baton', 'carousel', 'jelly', 'stone', 'coat', 'roof', 'soda'];
  function cardArt(q, kind, s) {
    // 300×400 的卡面（圆角、金边、一幅小画）
    q.fillStyle = '#fff6ea'; rrect(q, 0, 0, 300, 400, 22); q.fill();
    q.save(); rrect(q, 18, 18, 264, 300, 14); q.clip();
    const bg = { radio: ['#ffe0b8', '#f0b890'], tape: ['#d8e0f4', '#a8b8e0'], table: ['#5a4a6a', '#2a1e3a'], baton: ['#2a2a5a', '#6a3a7a'], carousel: ['#2a1a4a', '#8a3a7a'], jelly: ['#1a1a4a', '#6a3a8a'], stone: ['#1a1440', '#3a2a60'], coat: ['#ffd8c8', '#e88a8a'], roof: ['#2a1650', '#b05a90'], soda: ['#ffc8e0', '#ff90b8'] }[kind];
    q.fillStyle = vg(q, 18, 318, [[0, bg[0]], [1, bg[1]]]); q.fillRect(18, 18, 264, 300);
    q.save(); q.translate(150, 170);
    if (kind === 'radio') { q.fillStyle = '#a05e34'; rrect(q, -90, -60, 180, 110, 18); q.fill(); q.fillStyle = '#e6d0a8'; q.beginPath(); q.arc(-40, -5, 36, 0, TAU); q.fill(); q.fillStyle = '#ffc070'; rrect(q, 10, -40, 66, 28, 6); q.fill(); q.strokeStyle = '#3a2620'; q.lineWidth = 4; q.beginPath(); q.moveTo(-50, -60); q.bezierCurveTo(-46, -96, 46, -96, 50, -60); q.stroke(); for (let j = 0; j < 2; j++) { q.strokeStyle = `rgba(255,236,190,${0.6 - j * 0.25})`; q.beginPath(); q.arc(-40, -5, 56 + j * 22, PI * 0.8, PI * 1.2); q.stroke(); } }
    else if (kind === 'tape') { q.fillStyle = '#34303a'; rrect(q, -100, -64, 200, 128, 10); q.fill(); q.fillStyle = '#fbf1dc'; rrect(q, -88, -54, 176, 74, 6); q.fill(); q.fillStyle = '#e2574c'; q.fillRect(-88, -54, 176, 12); E.text(q, 'Before Summer', 0, -18, { font: 'hand', size: 20, color: '#2c3e7a' }); q.fillStyle = '#2a2630'; rrect(q, -44, 0, 88, 26, 10); q.fill(); for (const cx of [-26, 26]) { q.fillStyle = '#f6f1e6'; q.beginPath(); q.arc(cx, 13, 9, 0, TAU); q.fill(); } }
    else if (kind === 'table') { q.fillStyle = 'rgba(255,220,160,0.35)'; q.beginPath(); q.moveTo(-20, -110); q.lineTo(20, -110); q.lineTo(110, 60); q.lineTo(-110, 60); q.closePath(); q.fill(); q.fillStyle = '#3e5a4a'; q.beginPath(); q.moveTo(-10, -120); q.lineTo(10, -120); q.lineTo(30, -100); q.lineTo(-30, -100); q.closePath(); q.fill(); q.fillStyle = '#f6eee8'; q.beginPath(); q.ellipse(0, 40, 100, 20, 0, 0, TAU); q.fill(); q.fillRect(-100, 40, 200, 50); q.fillStyle = '#2c2430'; for (const x of [-80, 80]) { q.beginPath(); q.arc(x, 20, 24, 0, TAU); q.fill(); } q.fillStyle = '#c0392b'; q.beginPath(); q.moveTo(-70, 34); q.lineTo(-64, 50); q.lineTo(-76, 50); q.closePath(); q.fill(); q.fillStyle = '#f4efe6'; q.fillRect(64, 32, 26, 7); }
    else if (kind === 'baton') { q.fillStyle = '#2c2430'; for (const [x, y, r] of [[-30, 10, 34], [0, -6, 36], [30, 10, 32], [0, 24, 34]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); } q.fillStyle = '#fff1e6'; q.beginPath(); q.ellipse(52, -12, 20, 24, 0.1, 0, TAU); q.fill(); q.fillStyle = '#2b1a1a'; q.beginPath(); q.arc(58, -14, 3.5, 0, TAU); q.fill(); q.save(); q.translate(30, -30); q.rotate(-0.9 + Math.sin(s.t * 6) * 0.2); q.fillStyle = '#c0392b'; q.beginPath(); q.moveTo(-5, 0); q.lineTo(5, 0); q.lineTo(8, -60); q.lineTo(0, -72); q.lineTo(-8, -60); q.closePath(); q.fill(); q.restore(); }
    else if (kind === 'carousel') { q.fillStyle = '#ff8ab8'; q.beginPath(); q.moveTo(0, -110); q.lineTo(110, -40); q.lineTo(-110, -40); q.closePath(); q.fill(); q.fillStyle = '#e8c8e8'; q.beginPath(); q.ellipse(0, 70, 110, 20, 0, 0, TAU); q.fill(); q.strokeStyle = '#e0b860'; q.lineWidth = 4; for (const x of [-70, 0, 70]) { q.beginPath(); q.moveTo(x, -40); q.lineTo(x, 70); q.stroke(); q.fillStyle = '#ffd6e6'; q.beginPath(); q.ellipse(x, 20, 24, 16, 0, 0, TAU); q.fill(); } for (let i = 0; i < 9; i++) { q.fillStyle = '#fff4c8'; q.beginPath(); q.arc(-100 + i * 25, -40, 4, 0, TAU); q.fill(); } }
    else if (kind === 'jelly') { for (let i = 0; i < 4; i++) { const x = -70 + i * 48, y = -40 + (i % 2) * 60; q.fillStyle = ['rgba(255,170,215,0.8)', 'rgba(210,180,255,0.8)', 'rgba(255,214,150,0.8)', 'rgba(170,230,255,0.8)'][i]; q.beginPath(); q.ellipse(x, y, 30, 26, 0, PI, TAU); q.closePath(); q.fill(); q.strokeStyle = q.fillStyle; q.lineWidth = 2; for (let j = 0; j < 3; j++) { q.beginPath(); q.moveTo(x - 12 + j * 12, y); q.quadraticCurveTo(x - 20 + j * 12, y + 30, x - 10 + j * 12, y + 56); q.stroke(); } } }
    else if (kind === 'stone') { q.fillStyle = 'rgba(255,200,150,0.3)'; q.beginPath(); q.arc(0, 0, 90, 0, TAU); q.fill(); pumice(q, 0, 10, 56, { seed: 27, lit: '#fff0e0' }); }
    else if (kind === 'coat') { coatHang(q, 0, { C: [0, -105], L: 215, face: -1, flap: 0, seed: 2 }); }
    else if (kind === 'roof') { q.fillStyle = '#ffe0ea'; q.beginPath(); q.arc(40, -40, 60, 0, TAU); q.fill(); q.fillStyle = '#4a3a6a'; q.fillRect(-130, 40, 260, 120); q.beginPath(); q.moveTo(-130, 40); q.lineTo(-60, -10); q.lineTo(10, 40); q.closePath(); q.fill(); for (let i = 0; i < 4; i++) { q.fillStyle = '#ffd6e6'; q.beginPath(); q.arc(-80 + i * 50, 20 - (i % 2) * 30, 16, 0, TAU); q.fill(); } }
    else { q.save(); q.scale(1.3, 1.3); q.translate(-30, 60); bottleArt(q); q.restore(); }
    q.restore();
    q.restore();
    q.strokeStyle = '#d8a860'; q.lineWidth = 6; rrect(q, 18, 18, 264, 300, 14); q.stroke();
    q.strokeStyle = '#c89048'; q.lineWidth = 4; rrect(q, 4, 4, 292, 392, 20); q.stroke();
    q.fillStyle = '#d8a860'; for (let i = 0; i < 3; i++) { q.beginPath(); q.arc(120 + i * 30, 356, 5, 0, TAU); q.fill(); }
  }
  function cardBack(q) {
    q.fillStyle = vg(q, 0, 400, [[0, '#ff9ac4'], [1, '#c86aa8']]); rrect(q, 0, 0, 300, 400, 22); q.fill();
    q.strokeStyle = '#fff0c8'; q.lineWidth = 5; rrect(q, 14, 14, 272, 372, 16); q.stroke();
    q.save(); q.translate(0, 110); sheepCloudArt(q, '#ffffff', '#ffe0ee', '#5a2a4a'); q.restore();
  }
  function card(g, s, x, y, w, rot, flip, kind, a = 1) {
    // flip 0..1：0 背面 → 1 正面（绕竖轴翻）
    const c = Math.cos(flip * PI), sx = Math.abs(c) * w / 300;
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(Math.max(0.02, sx), w / 300);
    if (a < 1) g.globalAlpha *= a;
    const img = c > 0 ? LC(s, 'cardback', 300, 400, cardBack, 1) : LC(s, 'card:' + kind, 300, 400, (q) => cardArt(q, kind, s), 1);
    g.drawImage(img, -150, -200, 300, 400);
    g.restore();
    E.glow(g, x, y, w * 1.2, '255,236,210', 0.25 * a);
  }
  function shotCards(g, s) {
    const t = s.t, lt = s.lt, b0 = T0beat(s), bt = s.beat - b0;
    const cam = { x: 960, y: 540, z: 1.0 + lt * 0.01, ...hand(s, 101, 4, 0.3) };
    dawnWorld(g, s, cam, {
      rise: 1, sunX: 1500,
      mid: (q) => flock(q, s, t, lerp(-300, 2200, fract(lt / 7)), 300, 7, 0.7, 1, 11),
      near: (q) => {
        const n = CARDS.length;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + lt * 0.35, r = 560;
          const x = 960 + Math.cos(a) * r, y = 520 + Math.sin(a) * r * 0.42, z = Math.sin(a);
          const flip = clamp((bt - (i + 1) + 0.3) / 0.3); // 第 i 张在第 i+1 拍上正好翻完
          card(q, s, x, y, 150 + 60 * (z + 1) / 2, Math.sin(t + i) * 0.12, flip, CARDS[i], 0.6 + 0.4 * (z + 1) / 2);
        }
        // 她站在一小朵云上（梦里浮在云海上方，脚下有东西托着，不是凭空悬着）；小羊绕着她转：后半圈在她身后、前半圈在她身前
        const orbit = (front) => { for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + t * 0.6; if ((Math.sin(a) > 0) !== front) continue; lamb(q, s, 960 + Math.cos(a) * 240, 700 + Math.sin(a) * 60, 44, { v: i, pose: 'jump', glow: 0.5, flip: Math.sin(a) > 0 }); } };
        orbit(false);
        cloudPad(q, 960, 760, 190, t);
        cast(q, 'adele-alter', { x: 960, y: 760, h: 380, pose: 'look-up', prop: 'staff', outfit: 'coat', t, expr: 'smile', wind: 0.8, rim: '255,220,180' });
        cloudPad(q, 960, 768, 150, t + 3, 0.55);
        orbit(true);
      },
    });
    sparkles(g, t, 26, 19, '255,244,220');
    vig(g, s, 0.35);
  }
  /* ---------- 镜头 51 · 光（216.52 → 224.88）：卡片和小羊旋进太阳，220.18 的重音处满屏的光 ---------- */
  function shotBloom(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.in(clamp(lt / 8.3));
    const cam = { x: lerp(960, 1300, k), y: lerp(540, 480, k), z: lerp(1.0, 1.4, k), ...hand(s, 103, 3, 0.3) };
    dawnWorld(g, s, cam, {
      rise: 1, sunX: 1400,
      near: (q) => {
        const n = CARDS.length;
        for (let i = 0; i < n; i++) {
          const u = clamp(lt / 7 - i * 0.04), a = (i / n) * TAU + lt * (0.4 + u * 2), r = 560 * (1 - u * 0.85);
          const x = lerp(960, 1400, u) + Math.cos(a) * r, y = lerp(520, 420, u) + Math.sin(a) * r * 0.42;
          card(q, s, x, y, (180 - u * 120), Math.sin(t + i) * 0.15, 1, CARDS[i], 1 - u * 0.7);
        }
        for (let i = 0; i < 16; i++) { const u = clamp(lt / 7 - i * 0.02), a = (i / 16) * TAU + t * 1.2; lamb(q, s, lerp(900, 1400, u) + Math.cos(a) * 380 * (1 - u), lerp(620, 420, u) + Math.sin(a) * 120 * (1 - u), 50 * (1 - u * 0.6), { v: i, pose: 'jump', glow: 0.6, flip: Math.sin(a) > 0, alpha: 1 - u * 0.8 }); }
        cloudPad(q, 820, 900, 200, t);
        cast(q, 'adele-alter', { x: 820, y: 900, h: 400, pose: 'wave', prop: 'staff', outfit: 'coat', t, expr: 'smile', wind: 1, look: [1, -0.4], rim: '255,230,200' });
        cloudPad(q, 820, 908, 160, t + 3, 0.55);
      },
    });
    const pk = Math.exp(-Math.max(0, t - 220.18) * 1.5) * (t > 220.18 ? 1 : 0);
    // 走进光里：最后一秒半才整个变白（和下一个镜头的白色转场连起来，全白只停留很短一下）
    s.post.fill(g, '#fff6ea', pk * 0.6 * flashK(s) + sst(223.3, 224.9, t) * 0.95, 'lighter');
    sparkles(g, t, 40, 20, '255,250,235');
    vig(g, s, 0.3);
  }

  /* =========================================================
   * 尾声 · 早安（224.88 → 242.09）：博物馆的早晨
   * ========================================================= */
  function blanket(g, x, y, t, fall, w = 300) {
    // 一条暖色格子小毯：从凯勒手里落下，搭在她背上（(x, y) 为背上的落点，fall 0..1）
    const f = ease.out(clamp(fall)), y0 = lerp(y - 260, y, f), flap = Math.sin(t * 5) * 12 * (1 - f), hw = w / 2;
    const top = (u) => y0 - Math.sin(PI * u) * 46 * (0.4 + 0.6 * f) + flap * Math.sin(u * 5);
    g.save();
    g.beginPath();
    for (let i = 0; i <= 12; i++) { const u = i / 12; g.lineTo(x - hw + u * w, top(u)); }
    for (let i = 12; i >= 0; i--) { const u = i / 12; g.lineTo(x - hw - 18 + u * (w + 36), y0 + 150 + Math.sin(u * PI * 4 + t) * 6 + Math.sin(PI * u) * 10); }
    g.closePath();
    g.fillStyle = '#d27a6e'; g.fill();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(255,240,215,0.5)'; g.lineWidth = 7; for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(x - hw + i * 46, y0 - 80); g.lineTo(x - hw + i * 46 + 16, y0 + 200); g.stroke(); }
    g.strokeStyle = 'rgba(110,40,50,0.3)'; g.lineWidth = 10; for (let j = 0; j < 4; j++) { g.beginPath(); g.moveTo(x - hw - 30, y0 - 10 + j * 46); g.lineTo(x + hw + 30, y0 - 4 + j * 46); g.stroke(); }
    g.fillStyle = 'rgba(80,20,30,0.18)'; g.fillRect(x - hw - 30, y0 + 100, w + 60, 80);
    g.restore();
    g.strokeStyle = '#5a2228'; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke();
    // 流苏
    g.strokeStyle = '#f0d8c0'; g.lineWidth = 2.5; for (let i = 0; i <= 10; i++) { const u = i / 10, bx = x - hw - 18 + u * (w + 36), by = y0 + 150 + Math.sin(u * PI * 4 + t) * 6 + Math.sin(PI * u) * 10; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.sin(t * 2 + i) * 2, by + 12); g.stroke(); }
    g.restore();
  }
  function shotMorning(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp(lt / 4.2));
    const cam = { x: lerp(1060, 1120, k), y: 590, z: lerp(1.3, 1.36, k), ...hand(s, 105, 2, 0.2) };
    const fall = ease.inOut(clamp((lt - 1.3) / 1.3));
    // 她还坐在书桌前睡着（官方小人的坐姿：闭着眼）；凯勒把一条小毯子盖到她肩上
    const ao = { x: RM.adele[0], y: RM.adele[1], h: 560, pose: 'sit', outfit: 'home', expr: 'closed', desk: RM.adele[1] - RM.desk[2] + 6, seat: RM.seat, t };
    const back = anchor('adele-alter', ao, 'chest', [RM.adele[0] - 30, 700]);
    room(g, s, cam, {
      morning: true, key: 'm', base: { x: 1090, y: 590, z: 1.33 }, res: 1.05, noCrate: false, coatGone: true,
      crate: { tip: 1, lidAt: 'rest' },
      adele: ao,
      // （梦里那件外套在毯子下面：下一个镜头她坐起来、毯子滑下去，才看到她穿着它）
      onAdele: (q) => { if (fall > 0) blanket(q, back[0], back[1] - 20, t, fall, 300); },
      onDesk: (q) => {
        bottle(q, s, 1440, RM.desk[2] - 4, 120, 0); fizz(q, t, { t0: s.shot.t0 - 2, x: 1440, y: RM.desk[2] - 118, n: 16, dur: 12, speed: 30, r: 3.5, rise: 40, life: 2.4, spread: 0.3, seed: 401 }); labelCard(q, 1238, RM.desk[2] - 8, 0.9, s, 1, { hoof: true });
        // 凯勒走进晨光里，低头看她（镜片上一闪阳光），轻轻合上眼笑
        kellerCard(q, s, 1720, 1040, 580, [[s.shot.t0 - 1, 7], [s.shot.t0 + 2.2, 2]], ease.out(clamp(lt / 0.9)), { look: (tt) => { const u = clamp((tt - s.shot.t0 - 0.4) / 1.4); const e = u * u * (3 - 2 * u); return [lerp(-0.1, -0.55, e), lerp(0.05, 0.4, e)]; }, glint: (tt) => E.window01(tt - s.shot.t0, 0.7, 1.5, 0.25, 0.4), tilt: -0.35 });
      },
    });
    vig(g, s, 0.4);
  }
  /**
   * 凯勒馆长：官方剧情立绘（MVE.sd.card，胸像）像剧情里那样站在画面右边（从右边滑进来 + 淡入）。
   * (x, y) 立绘底边中点（房间的世界坐标），h 高；expr 表情关键帧；k 进场 0..1。立绘没加载好时画角色库的凯勒（手绘）
   */
  function kellerCard(q, s, x, y, h, expr, k = 1, ro = {}) {
    const S = window.MVE && window.MVE.sd;
    if (k <= 0.01) return;
    // [v3] 首选：凯勒立绘的分层绑定（眨眼、转头、官方差分表情与嘴型、镜片反光），构图与立绘卡片的 bust 一致
    if (kellerRigOk(s)) {
      const K = KA();
      if (K.draw(q, 'keller', { t: s.t, crop: KR_BUST, x: x + (1 - k) * 160, y, h, ax: 0.5, ay: 1, alpha: k, expr, xfade: 0.25, look: ro.look, mouth: ro.mouth, glint: ro.glint, tilt: ro.tilt, wind: 0.12, tint: ['#fff0e0', 0.15] })) return;
    }
    const o = { crop: 'bust', x: x + (1 - k) * 160, y, h, t: s.t, expr, alpha: k, breath: 1, light: { color: '#fff0e0', amount: 0.15 } };
    if (kellerOk(s, expr) && S.card(q, 'keller', o)) return;
    // 立绘没加载好（资源站连不上）：不画手绘的凯勒（和官方小人放在一起很粗糙），只画窗前一个逆光的、虚掉的剪影
    q.save(); q.globalAlpha *= 0.62 * k;
    q.drawImage(LC(s, 'keller-sil', 300, 560, (c) => cast(c, 'keller', { x: 150, y: 550, h: 520, pose: 'stand', t: 0, flip: true, sil: '#4a2c2c' }), 0.3), x - 250 + (1 - k) * 160, y - h * 1.42, 300 * 1.6, 560 * 1.6);
    q.restore();
  }
  /**
   * 凯勒立绘用不用：进入镜头的那一刻（或跳着看时）立绘的几种表情都已经下载好才用，并且整个镜头都保持这个决定——
   * 立绘在镜头播放中途才下载好时，不会从剪影突然跳成立绘
   */
  /** [v3] 凯勒的分层绑定用不用：同样是进入镜头时决定一次（绑定没准备好 → 立绘卡片 → 剪影），镜头中途准备好了也不换 */
  const KR_BUST = [347, -20, 332, 369]; // 立绘卡片 bust 的同一块（原画像素）
  const krGate = new Map();
  function kellerRigOk(s) {
    const K = KA(), id = s.shot.id;
    let G = krGate.get(id);
    if (!G || Math.abs(s.t - G.t) > 0.75) {
      G = { ok: !!(K && K.ready && K.ready('keller')), t: s.t };
      if (!G.ok && K && K.load) K.load('keller', 0);
      krGate.set(id, G);
    }
    G.t = s.t;
    return G.ok;
  }
  const kcGate = new Map();
  let kcProbeC = null;
  function kellerOk(s, expr) {
    const S = window.MVE && window.MVE.sd, id = s.shot.id;
    let G = kcGate.get(id);
    if (!G || Math.abs(s.t - G.t) > 0.75) {
      let ok = !!(S && S.card);
      if (ok) {
        if (!kcProbeC) kcProbeC = E.mk(4, 4);
        const c = kcProbeC.getContext('2d'), list = Array.isArray(expr) ? expr.map((e) => e[1]) : [expr];
        for (const e of list) ok = ok && S.card(c, 'keller', { expr: e, crop: 'bust', x: 2, y: 4, h: 4, t: 0 });
      }
      G = { ok, t: s.t };
      kcGate.set(id, G);
    }
    G.t = s.t;
    return G.ok;
  }
  function shotWakeUp(g, s) {
    const t = s.t, lt = s.lt;
    if (lt < BEAT * 4) {
      // 特写：标签上的粉色小蹄印，旁边的汽水还在冒泡
      const cam = { x: 960, y: 540, z: 1.05 + lt * 0.02, ...hand(s, 107, 2, 0.3) };
      inCam(g, cam, 1, (q) => q.drawImage(LC(s, 'desktop', VW, VH, deskTop, 0.5), -60, -40, VW + 120, VH + 80)); // 桌面和上面的标签卡同一层
      inCam(g, cam, 1, (q) => {
        q.save(); q.translate(1010, 560); q.rotate(-0.07);
        q.drawImage(LC(s, 'biglabel', 1000, 560, bigLabel, 1), -500, -280, 1000, 560);
        E.text(q, 'No. 27', -200, 36, { font: 'hand', size: 76, color: '#2a2440', align: 'left' });
        q.strokeStyle = '#2a2440'; q.lineWidth = 5; q.lineCap = 'round'; q.beginPath(); q.moveTo(80, 12); for (let i = 1; i <= 24; i++) { const u = i / 24; q.lineTo(80 + u * 190, 12 + u * u * 150 + Math.sin(u * 20) * 10 * (1 - u)); } q.stroke(); q.lineCap = 'butt';
        // 粉色小蹄印（一对）
        const pop = ease.back(clamp((lt - 0.3) / 0.4));
        q.save(); q.translate(300, 120); q.scale(pop, pop); q.rotate(0.3);
        q.fillStyle = '#ff7fb0'; q.beginPath(); q.ellipse(-16, 0, 15, 22, -0.2, 0, TAU); q.ellipse(16, -2, 15, 22, 0.2, 0, TAU); q.fill();
        q.restore();
        pumice(q, -330, 190, 110, { seed: 27 });
        q.restore();
        bottle(q, s, 1780, 380, 520, 0.02);
        fizz(q, t, { t0: s.shot.t0 - 1.5, x: 1790, y: 150, n: 18, dur: 6, speed: 40, r: 9, rise: 50, life: 2, spread: 0.4, seed: 411 });
      });
      g.save(); g.globalCompositeOperation = 'lighter'; E.glow(g, 1500, 200, 900, '255,236,200', 0.3); g.restore();
      vig(g, s, 0.45);
    } else {
      // 她醒了：坐起来，外套还披在肩上，看向窗外
      const u = lt - BEAT * 4;
      const cam = { x: 1180, y: 580, z: 1.34, ...hand(s, 109, 2, 0.2) };
      // 醒了：穿着那件外套坐在桌前（官方小人的坐姿，睁着眼），毯子从肩上滑下去；手心里那块浮石暖暖地亮着；凯勒在旁边笑
      const ao = { x: RM.adele[0], y: RM.adele[1], h: 560, pose: 'sit', outfit: 'coat', expr: u < 1.5 ? 'surprise' : 'smile', look: u < 1.5 ? [0.3, 0.8] : [1, -0.3], prop: 'stone', desk: RM.adele[1] - RM.desk[2] + 6, seat: RM.seat, t };
      const back = anchor('adele-alter', ao, 'chest', [RM.adele[0] - 30, 700]);
      room(g, s, cam, {
        morning: true, key: 'm', base: { x: 1090, y: 590, z: 1.33 }, res: 1.05, coatGone: true,
        crate: { tip: 1, lidAt: 'rest' },
        adele: ao,
        onAdele: (q) => blanket(q, back[0], back[1] - 20 + ease.inOut(clamp(u / 0.8)) * 90, t, 1, 300),
        onDesk: (q) => {
          bottle(q, s, 1440, RM.desk[2] - 4, 120, 0); fizz(q, t, { t0: s.shot.t0 - 2, x: 1440, y: RM.desk[2] - 118, n: 16, dur: 12, speed: 30, r: 3.5, rise: 40, life: 2.4, spread: 0.3, seed: 402 }); labelCard(q, 1238, RM.desk[2] - 8, 0.9, s, 1, { hoof: true });
          // 她醒了：凯勒低头对她说了句什么（官方差分的嘴型），她看向窗外时，凯勒合上眼笑
          const kt0 = s.shot.t0 + BEAT * 4;
          kellerCard(q, s, 1700, 1040, 580, [[s.shot.t0 - 1, 9], [kt0 + 0.15, 8], [kt0 + 1.6, 2]], 1, { look: KA() && KA().path ? KA().path([[kt0, [-0.5, 0.35]], [kt0 + 1.3, [-0.35, 0.25]], [kt0 + 2.0, [-0.1, 0.1]]]) : [-0.4, 0.3], mouth: KA() && KA().talk ? KA().talk([[kt0 + 0.25, kt0 + 1.25]], { seed: 27 }) : 0, glint: (tt) => E.window01(tt - kt0, 1.9, 2.8, 0.3, 0.5), tilt: -0.3 });
        },
        after: (q) => {
          // 手心里的浮石在她腿上（被书桌挡着），暖光从桌沿后面透上来，几颗光点往上飘
          const hn = anchor('adele-alter', ao, 'handN', [RM.adele[0], 780]), px = hn[0], py = RM.desk[2] - 16;
          E.glow(q, px, py, 130, '255,210,160', 0.4 + 0.15 * Math.sin(t * 3));
          for (let i = 0; i < 6; i++) { const ph = fract(t * 0.5 + i / 6); E.glow(q, px + Math.sin(i * 2.3 + ph * 4) * 40, py - ph * 160, 7, '255,226,180', Math.sin(PI * ph) * 0.7); }
        },
      });
      vig(g, s, 0.4);
    }
  }
  /* ---------- 镜头 54 · 片尾（233.23 → 242.09）：窗外早晨的汐斯塔、羊形的云；片名与字幕 ---------- */
  function endSky(q) {
    q.fillStyle = vg(q, 0, VH, [[0, '#8cc0ec'], [0.55, '#dce8f4'], [0.8, '#ffe8d8'], [1, '#ffd8c8']]); q.fillRect(0, 0, VW, VH);
    q.fillStyle = '#9aa8c8'; q.beginPath(); q.moveTo(1000, 900); q.quadraticCurveTo(1400, 860, 1520, 700); q.lineTo(1560, 694); q.quadraticCurveTo(1660, 860, 2000, 900); q.closePath(); q.fill();
    q.fillStyle = '#7fb0d8'; q.fillRect(0, 880, VW, 200);
    q.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 60; i++) q.fillRect(hash(501, i) * VW, 890 + hash(502, i) * 180, 20 + hash(503, i) * 60, 2);
  }
  function shotEnd(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 960, y: 540, z: 1.0 + lt * 0.01 };
    g.drawImage(LC(s, 'end-sky', VW, VH, endSky, 0.5), 0, 0, VW, VH);
    inCam(g, cam, 0.2, (q) => {
      withAlpha(q, 0.95, (qq) => qq.drawImage(LC(s, 'sheepcloud-day', 320, 200, (c) => sheepCloudArt(c, '#ffffff', '#ffe4ee', 'rgba(90,60,90,0.8)'), 1), 1060 + lt * 14, 170, 420, 262));
      for (let i = 0; i < 4; i++) q.drawImage(E.kit.cloudSprite(600 + i, 420, 170, '#ffffff', '#e8eef8'), 100 + i * 520 - lt * 6, 330 + (i % 2) * 90, 420, 170);
      for (let i = 0; i < 6; i++) { const ph = fract(t * 0.05 + i / 6); lamb(q, s, lerp(-100, 2100, ph), 120 + i * 30 + Math.sin(t + i) * 10, 26, { v: i, pose: 'jump', flip: false, alpha: 0.8 }); }
    });
    // 窗框（我们在博物馆里看出去）
    g.drawImage(LC(s, 'end-frame', VW, VH, (q) => {
      q.fillStyle = '#7a5448'; q.fillRect(0, 0, VW, 70); q.fillRect(0, VH - 90, VW, 90); q.fillRect(0, 0, 80, VH); q.fillRect(VW - 80, 0, 80, VH); q.fillRect(VW / 2 - 14, 0, 28, VH);
      q.fillStyle = 'rgba(255,236,210,0.25)'; q.fillRect(0, 66, VW, 4);
      q.fillStyle = '#e8a8b8'; q.beginPath(); q.moveTo(0, 0); q.lineTo(260, 0); q.bezierCurveTo(200, 300, 260, 700, 180, VH); q.lineTo(0, VH); q.closePath(); q.fill();
      q.beginPath(); q.moveTo(VW, 0); q.lineTo(VW - 260, 0); q.bezierCurveTo(VW - 200, 300, VW - 260, 700, VW - 180, VH); q.lineTo(VW, VH); q.closePath(); q.fill();
    }, 0.5), 0, 0, VW, VH);
    // 片名与片尾字幕在 overlay 里画（成片调色之后）：endTitles()
    vig(g, s, 0.3);
  }

  /* =========================================================
   * 片尾 / 叠加层
   * ========================================================= */
  /**
   * 转场的接缝要看起来是故意的（画在两个镜头合成之后）：
   *   圆形转场（ring: false）→ 沿圆周一圈柔光（引擎自带的是一条 6px 的细线，扫到画面边缘时像一道划痕）；
   *   擦除转场 → 接缝处一道粉色的雾幕 + 星光 + 几只正蹦过去的小羊（像是小羊把我们领进了下一个场景）
   */
  function transitionDress(g, s) {
    const tr = s.shot.in;
    if (!tr || tr.type === 'cut') return;
    const k = s.lt / (tr.dur || 0.6);
    if (k < 0 || k >= 1) return;
    const a = Math.sin(PI * k), e = ease.inOut(k);
    if (tr.type === 'iris' && tr.ring === false) {
      const cx = tr.x ?? 960, cy = tr.y ?? 540, R = Math.max(1, Math.hypot(Math.max(cx, VW - cx), Math.max(cy, VH - cy)) * e);
      const n = Math.max(16, Math.ceil((TAU * R) / 64));
      for (let i = 0; i < n; i++) {
        const an = (i / n) * TAU, x = cx + Math.cos(an) * R, y = cy + Math.sin(an) * R;
        if (x < -90 || x > VW + 90 || y < -90 || y > VH + 90) continue;
        E.glow(g, x, y, 70 + R * 0.05, tr.edge || '255,255,255', 0.32 * a);
      }
    } else if (tr.type === 'wipe') {
      const x = tr.dir === 'left' ? VW * (1 - e) : VW * e;
      const A = g.globalAlpha;
      for (let j = 0; j < 9; j++) { g.globalAlpha = A * 0.55 * a; g.drawImage(puff(j, j % 2 ? '255,214,238' : '255,236,246'), x - 190 + Math.sin(j * 1.7 + s.t * 2) * 30, j * 128 - 60, 380, 170); }
      g.globalAlpha = A;
      for (let j = 0; j < 6; j++) sparkle(g, x + (hash(141, j) - 0.5) * 160, 90 + j * 180 + Math.sin(s.t * 3 + j) * 30, 18 + hash(142, j) * 14, a, s.t * 2 + j, '255,236,246');
      for (let j = 0; j < 3; j++) { const ph = fract(k * 2.2 + j * 0.33), [hy, sq] = hop(ph); lamb(g, s, x - 40 + j * 20, 330 + j * 250 - hy * 90, 70, { v: j + 1, sq, glow: 1, pose: 'jump', expr: 'laugh', alpha: a }); }
    }
  }
  // 片名（成片后期可用时用它的衬线标题：逐字写出 + 纸纹肌理 + 小红印；否则用本片自己画的标题位图）
  const TITLE_O = { text: '雾中之忆', sub: 'MISTY  MEMORY', seal: '梦', style: 'serif', size: 128 };
  function openingTitle(g, s, F) {
    const t = s.t, ta = win(t, 5.6, 7.2, 11.2, 12.6);
    if (F && F.title) {
      if (t > 0.2 && t < 5.6 && F.warmTitle) { try { F.warmTitle(s, TITLE_O); } catch (e) { /* 第一次用时再建 */ } }
      if (ta <= 0) return;
      E.glow(g, 960, 320, 560, '255,150,200', 0.14 * ta);
      F.title(g, s, Object.assign({ x: 960, y: 318, fill: ['#fff8fc', '#ffe4ef', '#ffc6dc'], anim: 'ink', t0: 5.6, dur: 2.2, out: 11.2, outDur: 1.4 }, TITLE_O));
      const la = ta * sst(6.8, 7.8, t);
      E.text(g, 'NIGHT  VERSION', 960, 512, { font: 'display', size: 22, weight: 500, spacing: 12, color: 'rgba(255,226,240,0.85)', alpha: la });
      E.text(g, 'MV · 本页原创', 960, 556, { font: 'sans', size: 22, weight: 500, spacing: 8, color: 'rgba(255,236,246,0.8)', alpha: la });
    } else {
      if (t > 0.2 && t < 5.6) LC(s, 'title', 1400, 520, titleArt, 1); // 标题位图在开头的黑场淡入时就先建好
      if (ta <= 0) return;
      const c = LC(s, 'title', 1400, 520, titleArt, 1);
      g.save(); g.globalAlpha = ta; g.translate(960, 350 - (1 - ease.out(clamp((t - 5.6) / 2.2))) * 16);
      E.glow(g, 0, -40, 520, '255,150,200', 0.16 * ta);
      g.drawImage(c, -700, -250, 1400, 520);
      g.restore();
    }
    for (let i = 0; i < 6; i++) { const a = ta * Math.max(0, Math.sin(t * 1.6 + i * 1.3)); sparkle(g, 960 + (hash(81, i) - 0.5) * 900, 300 + (hash(82, i) - 0.5) * 260, 14 + hash(83, i) * 14, a, t * 0.3); }
  }
  /** 片尾：片名 + 歌曲信息 + 非官方声明（画在成片调色之后，不被调色 / 颗粒影响） */
  function endTitles(g, s, F) {
    const t = s.t;
    const ta = win(t, D[111] + 0.6, D[111] + 2.2, 241.2, 242.1);
    if (ta > 0) {
      if (F && F.title) {
        // 身后一团柔和的白光：窗棂从字后面穿过时字依然清楚
        E.glow(g, 960, 330, 620, '255,255,255', 0.45 * ta, 'source-over', false);
        F.title(g, s, Object.assign({}, TITLE_O, { style: 'serif-ink', seal: '梦', size: 104, x: 960, y: 292, fill: ['#6e2656', '#8a3048'], anim: 'fade', t0: D[111] + 0.6, dur: 1.6, out: 241.2, outDur: 0.9 }));
        E.text(g, 'NIGHT  VERSION', 960, 440, { font: 'display', size: 20, weight: 700, spacing: 12, color: '#7a2c5e', alpha: ta, stroke: 'rgba(255,250,252,0.85)', strokeW: 5 });
      } else {
        const c = LC(s, 'title-day', 1400, 520, (q) => titleArt(q, true), 1);
        g.save(); g.globalAlpha = ta; g.translate(960, 300 - (1 - ease.out(clamp((t - D[111] - 0.6) / 1.6))) * 14); g.scale(0.72, 0.72); E.glow(g, 0, -40, 700, '255,255,255', 0.35); g.drawImage(c, -700, -250, 1400, 520); g.restore();
      }
    }
    const ca = win(t, D[112] + 0.2, D[112] + 1.2, 241.4, 242.1);
    if (ca > 0) {
      g.save(); g.globalAlpha = ca;
      g.fillStyle = 'rgba(46,22,54,0.62)'; rrect(g, 440, 614, 1040, 336, 26); g.fill(); g.strokeStyle = 'rgba(255,220,236,0.35)'; g.lineWidth = 2; rrect(g, 452, 626, 1016, 312, 20); g.stroke();
      E.text(g, '歌曲　Misty Memory (Night Version)', 960, 690, { size: 32, weight: 700, color: '#fff6f0', spacing: 2 });
      E.text(g, '塞壬唱片-MSR / Elvin Shen / ZT / Erik Castro / David Lin / 左乙（《火山旅梦》OST）', 960, 740, { font: 'sans', size: 22, weight: 500, color: '#ffe6ee', maxW: 960 });
      E.text(g, 'MV：本页原创同人影像，与官方无关', 960, 796, { font: 'sans', size: 24, weight: 700, color: '#fff0c8', spacing: 2 });
      E.text(g, '角色与世界观 © Hypergryph', 960, 842, { font: 'sans', size: 22, weight: 500, color: '#ffe6ee', spacing: 2 });
      E.text(g, KA_CREDIT, 960, 882, { font: 'sans', size: 20, weight: 500, color: '#ffe6ee', spacing: 1 });
      E.text(g, SD_CREDIT, 960, 916, { font: 'sans', size: 20, weight: 500, color: '#ffe6ee', spacing: 1 });
      g.restore();
    }
  }
  function overlay(g, s) {
    const t = s.t, F = FIN();
    warmAhead(s);
    transitionDress(g, s);
    // ① 成片后期（辉光 → 分段调色 → 漏光 → 暗角 → 颗粒）放在最前；没有它时退回原来的细颗粒
    if (F) { try { F.frame(g, s, filmLook(F, t)); } catch (e) { s.post.grain(g, t, 0.045); } } else s.post.grain(g, t, 0.045);
    // ② 三段间奏加电影黑边（2.35:1）
    const lb = Math.max(win(t, D[34], D[34] + 1.2, D[43] - 0.06, D[43]), win(t, D[59], D[59] + 1.4, D[67] - 0.06, D[67]), win(t, D[84], D[84] + 1.2, D[91], D[91] + 0.9));
    if (lb > 0) s.post.letterbox(g, ease.inOut(lb));
    // ③ 片头 / 片尾的字（不被调色、辉光影响）
    if (t < 13) openingTitle(g, s, F);
    if (t >= D[111]) endTitles(g, s, F);
  }

  /* =========================================================
   * 镜头表
   * ========================================================= */
  const shots = [
    { id: 'siesta', t0: 0, title: '汐斯塔的夜', draw: shotSiesta },
    { id: 'museum', t0: D[4], in: { type: 'fade', dur: 1.0 }, draw: shotMuseum },
    { id: 'desk', t0: D[6], in: { type: 'zoom', dur: 0.9 }, draw: shotDesk },
    { id: 'label', t0: D[8], draw: shotLabel },
    { id: 'asleep', t0: D[8] + 2 * BEAT, draw: shotAsleep },
    { id: 'crate', t0: D[9], draw: shotCrate },
    { id: 'tumble', t0: D[10], title: '翻倒的货箱', in: { type: 'flash', dur: 0.5, color: '#ffc0e0' }, draw: shotTumble },
    { id: 'wake', t0: D[12], draw: shotWake },
    { id: 'heist', t0: D[13], draw: shotHeist },
    { id: 'street', t0: D[14], title: '粉色夜雾', in: { type: 'iris', dur: 0.9, x: 615, y: 540, edge: '255,190,230', ring: false }, draw: shotStreet },
    { id: 'rooftops', t0: D[16], draw: shotRooftops },
    { id: 'fair', t0: D[18], in: { type: 'wipe', dur: 0.6, edge: '255,200,230' }, draw: shotFair },
    { id: 'counting', t0: D[20], draw: shotCounting },
    { id: 'soda-burst', t0: D[22], draw: shotSodaBurst },
    { id: 'dolly', t0: D[24], in: { type: 'flash', dur: 0.5, color: '#ffd0ec' }, draw: shotDolly },
    { id: 'chase', t0: D[26], draw: shotChase },
    { id: 'stairs', t0: D[28], draw: shotStairs },
    { id: 'lanterns-out', t0: D[30], draw: shotLanternsOut },
    { id: 'alone', t0: D[32], in: { type: 'fade', dur: 1.2 }, draw: shotAlone },
    { id: 'mist-walk', t0: D[34], title: '雾中之忆', in: { type: 'fade', dur: 1.4 }, draw: shotMistWalk },
    { id: 'memories', t0: D[36], in: { type: 'fade', dur: 1.0 }, draw: shotMemories },
    { id: 'table', t0: D[38], in: { type: 'fade', dur: 1.2 }, draw: shotTable },
    { id: 'meet', t0: D[40], draw: shotMeet },
    { id: 'hush', t0: D[42], in: { type: 'fade', dur: 0.5 }, draw: shotHush },
    { id: 'soda-sea', t0: D[43], title: '汽水海', in: { type: 'flash', dur: 0.7, color: '#fff0f8' }, draw: shotSodaSea },
    { id: 'boat', t0: D[45], draw: shotBoat },
    { id: 'jellyfish', t0: D[47], draw: shotJellyfish },
    { id: 'jelly-sky', t0: D[49], draw: shotJellySky },
    { id: 'carousel', t0: D[51], title: '旋转木马', in: { type: 'fade', dur: 0.6 }, draw: shotCarousel },
    { id: 'ride', t0: D[53], draw: shotRide },
    { id: 'fireworks', t0: D[55], draw: shotFireworks },
    { id: 'path', t0: D[57], draw: shotPath },
    { id: 'hill', t0: D[59], title: '掌心的石头', in: { type: 'fade', dur: 1.5 }, draw: shotHill },
    { id: 'stone', t0: D[61], in: { type: 'fade', dur: 1.0 }, draw: shotStone },
    { id: 'rumble', t0: D[63], draw: shotRumble },
    { id: 'glow', t0: D[65], draw: shotGlow },
    { id: 'eruption', t0: D[67], title: '火山亮了', in: { type: 'flash', dur: 0.6, color: '#ffd8c0' }, draw: shotEruption },
    { id: 'sheepnado', t0: D[69], draw: shotSheepnado },
    { id: 'coat-return', t0: D[71], draw: shotCoatReturn },
    { id: 'transform', t0: D[73], draw: shotTransform },
    { id: 'stepping', t0: D[75], draw: shotStepping },
    { id: 'climb', t0: D[77], draw: shotClimb },
    { id: 'ascent', t0: D[79], draw: shotAscent },
    { id: 'rim', t0: D[82], draw: shotRim },
    { id: 'sheep-walk', t0: D[84], title: '火山口的告别', in: { type: 'fade', dur: 1.0 }, draw: shotSheepWalk },
    { id: 'parents', t0: D[86], in: { type: 'fade', dur: 1.0 }, draw: shotParents },
    { id: 'wave-back', t0: D[88], draw: shotWaveBack },
    { id: 'fold', t0: D[90], in: { type: 'fade', dur: 0.8 }, draw: shotFold },
    { id: 'sunrise', t0: D[91], title: '云海日出', in: { type: 'white', dur: 1.0 }, draw: shotSunrise },
    { id: 'flight', t0: D[95], draw: shotFlight },
    { id: 'cards', t0: D[99], in: { type: 'flash', dur: 0.5, color: '#fff4e0' }, draw: shotCards },
    { id: 'bloom', t0: D[103], draw: shotBloom },
    { id: 'morning', t0: D[107], title: '早安', in: { type: 'white', dur: 1.2 }, draw: shotMorning },
    { id: 'wake-up', t0: D[109], draw: shotWakeUp },
    { id: 'end', t0: D[111], t1: DUR + 0.01, in: { type: 'fade', dur: 1.0 }, draw: shotEnd },
  ];

  /* =========================================================
   * 旁白（本页原创；不是歌词）
   * ========================================================= */
  const captions = [
    [15.2, 19.6, '汐斯塔的夏夜，标签写到了第二十七号。'],
    [20.6, 24.4, '货箱里，好像有谁在偷笑。'],
    [31.6, 35.8, '跟着小羊走吧。梦里，不用认路。'],
    [73.4, 78.2, '雾浓了，连声音都变得很远。'],
    [81.6, 86.6, '雾里的那张餐桌边，留着一把空椅子。'],
    [95.8, 100.6, '一只系着红领带，一只围着白围巾。'],
    [129.3, 134.4, '它们把一块温热的小石头，推到我的手心。'],
    [156.4, 160.6, '妈妈的外套，刚好合身。'],
    [181.6, 187.2, '他们挥了挥手，像每一个平常的早晨。'],
    [226.2, 231.0, '汽水还在冒泡。标签上，多了一枚粉色的小蹄印。'],
  ];

  E.film({
    id: 'misty-memory-night',
    title: 'Misty Memory (Night Version)',
    audio: 'assets/music/misty-memory-night.mp3',
    meta: {
      no: 'II', cn: '雾中之忆', en: 'Misty Memory (Night Version)',
      artists: '塞壬唱片-MSR / Elvin Shen / ZT / Erik Castro / David Lin / 左乙',
      form: 'alter',
      logline: '汐斯塔的夏夜，她在火山博物馆的桌上睡着了。一群粉色小羊打翻了货箱，叼走了母亲的外套——她追着它们，走进一场粉色的夜雾之梦。',
      synopsis: [
        '多年后的汐斯塔。深夜的火山博物馆里，她给标本写标签，写到第二十七号时趴在桌上睡着了。窗下的货箱一歪，粉色小羊和汽水瓶滚了一地，气泡冒成了粉色的雾。',
        '小羊们叼走了椅背上母亲的外套。她追进一场夜雾之梦：灯笼街、屋顶上踩着拍子跳的小羊、会数羊的集市。雾最浓的时候，餐桌边坐着两只小黑羊——一只系着红领带，一只围着白围巾。',
        '它们陪她坐汽水瓶船、看水母灯、坐旋转木马，在起雾的山坡上把一块温热的小石头推到她手心。梦里的火山亮了，外套从天而降；她穿上它，踩着小羊跑上山顶，在光里和两个熟悉的剪影挥手道别。',
        '天亮了。她在博物馆的桌上醒来：汽水还在冒泡，标签上多了一枚粉色的小蹄印。',
      ],
      // 海报 / 缩略图：外套上身的那一刻、火山口的告别（官方立绘；立绘不可用时是同一时刻的 Q 版画面）
      poster: 157.3, thumbs: [66.2, 110.6, 186.6, 197.0], accent: '#ff8fbf',
    },
    // 官方立绘（情绪最高的两个特写：外套上身的那一刻、火山口的告别）；keyart.js 加载失败也照样放行，那两个镜头会自动换回 Q 版画面
    // 成片后期（MVE.finish）：分段调色、辉光、漏光、颗粒、片名；没加载成功时影片退回自己的暗角 + 颗粒
    needs: ['keyart', 'finish', 'sd'],
    // 官方 Q 版小人（MVE.sd）：引擎在开播前预载这些模型（纯烬的家居服 / 外套，正面与背面；多利；五种粉色小羊）
    sd: ['alter-home', 'alter-home-back', 'alter', 'alter-back', 'dolly', ...OL_KEYS],
    prepare: async (ctx) => {
      const F = FIN();
      if (F && F.warm) { try { F.warm(['grain', 'dirt', 'paper']); } catch (e) { /* 用到时再生成 */ } }
      // 立绘在开播前预载好（图集上传显卡会卡一下，放在开播前）；只会 resolve(true / false)
      const K = KA();
      const ka = ctx && ctx.keyart ? Promise.resolve(ctx.keyart([KA_KEY, 'keller'])).catch(() => false) : K && K.load ? K.load([KA_KEY, 'keller'], 6000).catch(() => false) : Promise.resolve(false);
      const fonts = document.fonts ? Promise.race([Promise.all(['900 150px "Noto Serif SC"', '700 50px Cinzel', '500 24px Cinzel', '500 24px "Noto Sans SC"', '700 44px "Noto Sans SC"'].map((f) => document.fonts.load(f, '雾中之忆汐斯塔火山博物馆易碎本页原创MISTYVOLCANO角色立绘官方原画分层绑定'))), new Promise((r) => setTimeout(r, 2500))]).catch(() => null) : null;
      // 小羊精灵的包围盒提前量好（避免第一次出场时卡一下）
      for (const [k, poses] of [['pink', ['stand', 'jump', 'sleep']], ['dad', ['stand', 'sit', 'walk', 'run', 'sleep', 'jump']], ['mom', ['stand', 'sit', 'walk', 'run', 'jump']]]) for (const pose of poses) castBox(LAMB[k][0], Object.assign({ pose }, LAMB[k][1]));
      // 凯勒馆长的剧情立绘（尾声两个镜头用到的三种表情）
      const S = window.MVE && window.MVE.sd, kc = S && S.card && S.card.load ? Promise.resolve(S.card.load('keller', [2, 7, 9])).catch(() => false) : null;
      await Promise.all([ka, fonts, kc]);
    },
    captions,
    overlay,
    release() { release(); const K = KA(); if (K) try { K.release(); } catch (e) { /* 立绘模块自己会重建 */ } },
    shots,
  });
})();
