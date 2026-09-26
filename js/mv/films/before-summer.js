/* =========================================================
 * 片 I · 夏天之前（Before Summer）—— 本页原创的实时渲染 MV（同人作品，与官方无关）
 *
 * 故事：莱塔尼亚，威廉大学所在的学院城，六月里平凡的一天。十来岁的阿黛尔已经在大学里旁听。
 *   清晨的广播 → 一家人的早晨（爸爸系红领带、妈妈收拾考察背包、门边挂着米白的防护外套）→ 冲下楼、冲出门 →
 *   钟声里冲进爸爸的课 → 图书馆里小黑羊顶着一摞书 → 河畔的午后：冰棍、云、录音机 →
 *   小黑羊叼走录音机，一路追到广场的喷泉 → 晚餐：地图上圈着乌纳火山，爸爸答应带一块石头回来，
 *   妈妈把一封信悄悄夹进文件 → 屋顶上的流星雨 → 黎明，爸爸妈妈像往常一样出发 →
 *   她给磁带写上「Before Summer」，和奖章一起收进盒子——盒子里空着一格，写着「乌纳的石头」。
 *
 * 技术：画面是时间的纯函数；静态大图层走本文件的 LRU 位图缓存（按分辨率重建、总像素上限 16M ≈ 64 MB，
 *   正在用的图层不丢；在前一个镜头里提前一张张预热；film.release() 全部释放、之后按需重建）；
 *   远景人群用预画的走路循环帧；镜头切点对齐小节线（120 BPM，一小节 2 秒）。
 * ========================================================= */
(() => {
  'use strict';
  const E = window.MVE;
  if (!E) return;
  const { VW, VH, TAU, clamp, lerp, ease, hash, rng, wobble, span, glow } = E;
  const PI = Math.PI;
  const { sin, cos, abs, min, max, floor, pow, sqrt, atan2, hypot } = Math;

  /* 小节线（assets/music/before-summer.json 的 downbeats），镜头从这里取切点 */
  const DB = [1.760, 3.776, 5.771, 7.776, 9.760, 11.755, 13.760, 15.755, 17.760, 19.755, 21.760, 23.755, 25.760, 27.755, 29.760, 31.755, 33.760, 35.755, 37.760, 39.723,
    41.760, 43.765, 45.760, 47.765, 49.760, 51.755, 53.760, 55.755, 57.760, 59.765, 61.760, 63.765, 65.760, 67.765, 69.760, 71.765, 73.760, 75.755, 77.760, 79.765,
    81.760, 83.755, 85.760, 87.765, 89.760, 91.755, 93.760, 95.755, 97.760, 99.723, 101.760, 103.755, 105.760, 107.765, 109.760, 111.765, 113.760, 115.765, 117.760, 119.755,
    121.760, 123.765, 125.760, 127.765, 129.760, 131.765, 133.728, 135.723, 137.760, 139.755, 141.760, 143.712, 145.739, 147.755, 149.760, 151.755, 153.739, 155.723, 157.728, 159.733,
    161.739, 163.755, 165.760, 167.765, 169.760, 171.765, 173.760, 175.765, 177.760, 179.755, 181.760, 183.765, 185.760, 187.765, 189.760, 191.765, 193.760, 195.733, 197.717, 199.765,
    201.760, 203.723, 205.717, 207.765, 209.749, 211.733, 213.643, 215.563, 217.493, 219.531, 221.547, 223.520, 225.525, 227.477, 229.504, 231.509, 233.504, 235.595, 237.536, 239.499];
  const B = (i) => DB[i];
  const DUR = 240.726;

  /* ---------------- 调色 ---------------- */
  const INK = '#3a2620';           // 暖棕墨线（和本页插画同一路）
  const RED = '#e2574c';           // 封面那一抹红 / 爸爸的领带
  const TIE = '#c0392b';
  const CREAM = '#fff6e6';
  const SKIN = '#ffe2cf';
  const KAI = '"KaiTi","STKaiti","Kaiti SC","BiauKai","Noto Serif SC",serif'; // 中文手写（楷体）

  /* ---------------- 角色 ---------------- */
  const cast = (q, name, o) => { const C = E.cast; if (C) C.draw(q, name, o); };
  /**
   * 角色（带接触阴影）。身高按角色库的相对身高：SC[who] × 这个镜头里“爸爸的身高”
   * o.shadow === false 不画影子；o.sha 影子浓淡（用自己的柔影精灵，和背景的光更好配）
   */
  function who(q, name, o) {
    if (o.shadow !== false && !o.sil) {
      const sheep = name.startsWith('sheep'), h = o.h || 300;
      const ground = o.pose === 'sit-ground' || o.pose === 'hug-knees' || o.pose === 'kneel2' || o.pose === 'lie';
      shadow(q, o.x, o.y, h * (sheep ? 0.42 : ground ? 0.36 : 0.22), o.sha ?? 0.42);
    }
    const C = E.cast;
    if (C) C.draw(q, name, o.shadow === true ? Object.assign({}, o, { shadow: false }) : o);
  }
  /**
   * 爸爸妈妈在游戏里没有官方形象（只有声音）：本片里他们永远不露脸——背影、逆光剪影、只露手 / 肩、影子，或者在画外。
   * PSIL：剪影 + 逆光轮廓（rim 为轮廓光的颜色）
   */
  const PSIL = (rim = '255,206,160', col = '#2a1c28') => ({ sil: col, rim, rimW: 1.1 });
  /**
   * 童年的阿黛尔 = 官方艾雅法拉小人（js/mv/sd.js；站 / 走 / 跑 / 坐 / 睡 / 跳）。她的基建 Interact 是“吓一跳”：
   * startle(t0) 让它从 t0 起从头播一次（官方小人不可用时退回手绘的站姿）
   */
  const startle = (t0) => ({ pose: 'stand', sd: { anim: 'Interact', view: 'build', loop: false, phase: -t0 } });
  /** 相对身高（katia = 1；羊的 h 是身长） */
  const SC = { 'adele-child': 0.6, magna: 0.94, katia: 1, fontaine: 0.74, liese: 0.7, 'sheep-black': 0.3, crowd: 0.95 };
  const HT = (name, base) => base * (SC[name] || 1);

  /* ---------------- 位图缓存（LRU，按分辨率） ----------------
   * reg(key, w, h, fn(q, w, h))：登记一个静态图层的画法（设计坐标）
   * lay(s, key) → 画布（第一次用时画，按 s.k 缓存）；img(g, s, key, x, y, [w, h]) 直接贴
   * 总像素超过 LRU_MAX 时丢掉最久没用的（拖回去会重画一次，但内存有上限） */
  const PAINT = {};
  const LRU = new Map();
  let lruPx = 0;
  const LRU_MAX = 16e6; // 约 64 MB（1280×720 下够容纳当前镜头 + 预热的下一个镜头）
  const CLOG = (window.__bsCache = []);
  const CSTAT = (window.__bsCacheStats = { peak: 0, evicted: 0, built: 0 });
  function reg(key, w, h, fn) { PAINT[key] = [w, h, fn]; }
  const ck = (s, key) => key + '@' + s.k.toFixed(4);
  function lay(s, key) {
    const id = ck(s, key);
    let e = LRU.get(id);
    if (e) { e.u = s.t; LRU.delete(id); LRU.set(id, e); return e.c; }
    const P = PAINT[key];
    if (!P) throw new Error('no painter ' + key);
    const t0 = performance.now();
    // 画布尺寸取整后按实际像素重新定比例：设计区域正好铺满整张画布，
    // 否则最右一列 / 最下一行只盖了一部分，拉伸贴图时会在画面边上透出一道暗边
    const c = E.mk(P[0] * s.k, P[1] * s.k), q = c.getContext('2d');
    q.setTransform(c.width / P[0], 0, 0, c.height / P[1], 0, 0);
    q.save(); P[2](q, P[0], P[1]); q.restore();
    e = { c, px: c.width * c.height, u: s.t };
    LRU.set(id, e); lruPx += e.px; CSTAT.built++;
    if (CLOG.length < 400) CLOG.push([key, +(performance.now() - t0).toFixed(1), c.width, c.height]);
    // 超出上限就丢最久没用的；正在用的（最近 0.4 秒内画过的）不丢，免得同一个镜头里反复重画
    for (const [kk, v] of LRU) {
      if (lruPx <= LRU_MAX) break;
      if (v === e || abs(s.t - v.u) < 0.4) continue;
      LRU.delete(kk); lruPx -= v.px; v.c.width = v.c.height = 1; CSTAT.evicted++;
    }
    CSTAT.now = lruPx; if (lruPx > CSTAT.peak) CSTAT.peak = lruPx;
    return c;
  }
  function img(g, s, key, x = 0, y = 0, w, h) { const P = PAINT[key]; g.drawImage(lay(s, key), x, y, w ?? P[0], h ?? P[1]); }
  /** 预热：6 秒内要开始的镜头用到的图层，每帧最多画一张（在 overlay 里调用）；
   *  3 秒内就要用的，顺手标成“正在用”，免得刚画好又被别的图层挤掉 */
  function warm(s, shots) {
    const t = s.t;
    let built = false;
    for (const sh of shots) {
      if (sh.t0 <= t || sh.t0 > t + 6) continue;
      for (const key of sh.uses || []) {
        const e = LRU.get(ck(s, key));
        if (e) { if (sh.t0 < t + 3) e.u = t; continue; }
        if (!built && PAINT[key]) { lay(s, key); built = true; }
      }
    }
  }

  /* ---------------- 画图小工具 ---------------- */
  function rrect(q, x, y, w, h, r) {
    r = max(0, min(r, w / 2, h / 2));
    q.moveTo(x + r, y); q.lineTo(x + w - r, y); q.arcTo(x + w, y, x + w, y + r, r);
    q.lineTo(x + w, y + h - r); q.arcTo(x + w, y + h, x + w - r, y + h, r);
    q.lineTo(x + r, y + h); q.arcTo(x, y + h, x, y + h - r, r);
    q.lineTo(x, y + r); q.arcTo(x, y, x + r, y, r); q.closePath();
  }
  function fs(q, fill, lw = 0, ink = INK) {
    if (fill) { q.fillStyle = fill; q.fill(); }
    if (lw) { q.lineWidth = lw; q.strokeStyle = ink; q.lineJoin = 'round'; q.lineCap = 'round'; q.stroke(); }
  }
  function lg(q, x0, y0, x1, y1, st) { const gr = q.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < st.length; i++) gr.addColorStop(st[i][0], st[i][1]); return gr; }
  function rg(q, x, y, r0, r1, st, x1 = x, y1 = y) { const gr = q.createRadialGradient(x, y, r0, x1, y1, r1); for (let i = 0; i < st.length; i++) gr.addColorStop(st[i][0], st[i][1]); return gr; }
  function line(q, x0, y0, x1, y1, lw, col) { q.beginPath(); q.moveTo(x0, y0); q.lineTo(x1, y1); q.lineWidth = lw; q.strokeStyle = col; q.lineCap = 'round'; q.stroke(); }
  function circ(q, x, y, r) { q.moveTo(x + r, y); q.arc(x, y, r, 0, TAU); }
  function ell(q, x, y, rx, ry, rot = 0) { q.moveTo(x + rx * cos(rot), y + rx * sin(rot)); q.ellipse(x, y, rx, ry, rot, 0, TAU); }
  function poly(q, a, close = true) { q.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) q.lineTo(a[i], a[i + 1]); if (close) q.closePath(); }
  /** Catmull-Rom 平滑曲线（a 为 [x0,y0,x1,y1,…]） */
  function curve(q, a, closed = false, move = true) {
    const n = a.length / 2;
    if (move) q.moveTo(a[0], a[1]); else q.lineTo(a[0], a[1]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const i0 = closed ? (i - 1 + n) % n : max(0, i - 1), i2 = closed ? (i + 1) % n : i + 1, i3 = closed ? (i + 2) % n : min(n - 1, i + 2);
      q.bezierCurveTo(a[i * 2] + (a[i2 * 2] - a[i0 * 2]) / 6, a[i * 2 + 1] + (a[i2 * 2 + 1] - a[i0 * 2 + 1]) / 6,
        a[i2 * 2] - (a[i3 * 2] - a[i * 2]) / 6, a[i2 * 2 + 1] - (a[i3 * 2 + 1] - a[i * 2 + 1]) / 6, a[i2 * 2], a[i2 * 2 + 1]);
    }
    if (closed) q.closePath();
  }
  /** 不规则的一团（树冠、灌木、云、蒸汽） */
  function blob(q, cx, cy, rx, ry, seed, n = 9, amp = 0.18) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = 1 + (hash(seed, i) - 0.5) * 2 * amp; pts.push(cx + cos(a) * rx * r, cy + sin(a) * ry * r); }
    curve(q, pts, true);
  }
  /** 纸面颗粒：静态图层里撒一点点深浅斑点 */
  function speckle(q, x, y, w, h, n, seed, cols, a = 0.08, sz = 3) {
    const R = rng(seed);
    for (let i = 0; i < n; i++) { q.globalAlpha = a * (0.4 + R()); q.fillStyle = cols[floor(R() * cols.length)]; const s = sz * (0.4 + R()); q.fillRect(x + R() * w, y + R() * h, s, s); }
    q.globalAlpha = 1;
  }
  const withAlpha = (q, a, fn) => { const pa = q.globalAlpha; q.globalAlpha = pa * a; fn(); q.globalAlpha = pa; };
  const easeIO = ease.inOut, easeO = ease.out, easeS = ease.sine;
  /** 在 [a, b] 里从 0 升到 1 再保持 */
  const up = (x, a, b, e = easeS) => e(clamp((x - a) / (b - a)));
  /** 抛物线：从 p0 飞到 p1，顶点高 hgt */
  const arc3 = (x0, y0, x1, y1, hgt, k) => [lerp(x0, x1, k), lerp(y0, y1, k) - hgt * 4 * k * (1 - k)];

  /* ---------------- 常用精灵 ---------------- */
  let SHADOW = null;
  function shadowSprite() {
    if (SHADOW) return SHADOW;
    const c = E.mk(128, 64), q = c.getContext('2d');
    q.setTransform(1, 0, 0, 0.5, 0, 0);
    q.fillStyle = rg(q, 64, 64, 0, 64, [[0, 'rgba(46,24,30,0.6)'], [0.55, 'rgba(46,24,30,0.26)'], [1, 'rgba(46,24,30,0)']]);
    q.fillRect(0, 0, 128, 128);
    return (SHADOW = c);
  }
  function shadow(q, x, y, w, a = 0.5) { const pa = q.globalAlpha; q.globalAlpha = pa * a; q.drawImage(shadowSprite(), x - w, y - w * 0.2, w * 2, w * 0.4); q.globalAlpha = pa; }
  const SHAFTS = new Map();
  function shaftSprite(rgb) {
    let c = SHAFTS.get(rgb);
    if (c) return c;
    c = E.mk(64, 512);
    const q = c.getContext('2d');
    q.fillStyle = lg(q, 0, 0, 64, 0, [[0, `rgba(${rgb},0)`], [0.25, `rgba(${rgb},0.55)`], [0.5, `rgba(${rgb},1)`], [0.75, `rgba(${rgb},0.55)`], [1, `rgba(${rgb},0)`]]);
    q.fillRect(0, 0, 64, 512);
    q.globalCompositeOperation = 'destination-in';
    q.fillStyle = lg(q, 0, 0, 0, 512, [[0, 'rgba(0,0,0,0.95)'], [0.55, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
    q.fillRect(0, 0, 64, 512);
    SHAFTS.set(rgb, c);
    return c;
  }
  /** 一道光束：从 (x, y) 出发，ang 为偏离竖直向下的角度，宽 w、长 L */
  function shaft(q, x, y, ang, w, L, a, rgb = '255,226,168') {
    if (a <= 0.004) return;
    q.save(); q.translate(x, y); q.rotate(ang); q.globalCompositeOperation = 'lighter'; q.globalAlpha *= clamp(a);
    q.drawImage(shaftSprite(rgb), -w / 2, 0, w, L); q.restore();
  }
  /** 镜头光斑：太阳在 (sx, sy)，沿着过画面中心的直线排几颗鬼影 */
  function flare(q, sx, sy, a, rgb = '255,214,160') {
    if (a <= 0.01) return;
    glow(q, sx, sy, 300, rgb, a * 0.75, 'lighter', false);
    glow(q, sx, sy, 90, '255,250,235', a * 0.9);
    const dx = VW / 2 - sx, dy = VH / 2 - sy;
    const G = [[0.35, 34, '255,210,150', 0.28], [0.62, 18, '190,225,255', 0.3], [0.95, 60, '255,190,130', 0.14], [1.3, 24, '255,240,210', 0.26], [1.62, 110, '255,180,140', 0.07], [1.85, 14, '200,240,255', 0.3]];
    for (const [k, r, c, al] of G) glow(q, sx + dx * k, sy + dy * k, r, c, a * al, 'lighter', false);
    // 横向的一道光纹
    q.save(); q.globalCompositeOperation = 'lighter'; q.globalAlpha = a * 0.22;
    q.fillStyle = lg(q, sx - 700, 0, sx + 700, 0, [[0, 'rgba(255,220,170,0)'], [0.5, 'rgba(255,230,190,1)'], [1, 'rgba(255,220,170,0)']]);
    q.fillRect(sx - 700, sy - 3, 1400, 6); q.restore();
  }

  /* ---------------- 小元素：音符、鸟、z、蒸汽、星芒 ---------------- */
  function note(q, x, y, s, rot, col, kind = 0) {
    q.save(); q.translate(x, y); q.rotate(rot); q.scale(s, s);
    q.fillStyle = col; q.strokeStyle = col; q.lineWidth = 3.4; q.lineCap = 'round';
    q.beginPath(); q.ellipse(0, 0, 9, 6.5, -0.35, 0, TAU); q.fill();
    q.beginPath(); q.moveTo(8, -2); q.lineTo(8, -34); q.stroke();
    if (kind === 1) {
      q.beginPath(); q.ellipse(26, -6, 9, 6.5, -0.35, 0, TAU); q.fill();
      q.beginPath(); q.moveTo(34, -8); q.lineTo(34, -40); q.stroke();
      q.lineWidth = 7; q.beginPath(); q.moveTo(8, -32); q.lineTo(34, -38); q.stroke();
    } else { q.beginPath(); q.moveTo(8, -34); q.quadraticCurveTo(22, -26, 19, -12); q.stroke(); }
    q.restore();
  }
  function bird(q, x, y, s, ph, col) {
    const f = sin(ph);
    q.beginPath(); q.moveTo(x - 13 * s, y - 5 * s * f); q.quadraticCurveTo(x - 6 * s, y - 9 * s * f - 3 * s, x, y);
    q.quadraticCurveTo(x + 6 * s, y - 9 * s * f - 3 * s, x + 13 * s, y - 5 * s * f);
    q.lineWidth = 2.6 * s; q.strokeStyle = col; q.lineCap = 'round'; q.stroke();
  }
  /** 鸽子：站着（flap=0）或飞起（flap>0，翅膀扇动相位 ph） */
  function pigeon(q, x, y, s, flip, flap, ph) {
    q.save(); q.translate(x, y); q.scale(flip ? -s : s, s);
    q.beginPath(); ell(q, 0, -14, 16, 11, -0.2); fs(q, '#9aa0b0', 2);
    q.beginPath(); circ(q, 14, -26, 7.5); fs(q, '#8a90a2', 2);
    q.beginPath(); q.moveTo(20, -27); q.lineTo(27, -25); q.lineTo(20, -23); fs(q, '#e0a060', 1.4);
    q.fillStyle = '#2a1a1a'; q.beginPath(); circ(q, 16, -28, 1.5); q.fill();
    if (flap > 0) {
      const w = sin(ph) * 0.9;
      q.beginPath(); q.moveTo(-2, -18); q.quadraticCurveTo(-10, -40 - 20 * w, -30, -46 - 26 * w); q.quadraticCurveTo(-16, -26, 6, -16); fs(q, '#b4b9c6', 2);
    } else {
      q.beginPath(); q.moveTo(-8, -18); q.quadraticCurveTo(4, -22, 10, -12); q.stroke();
      line(q, -2, -4, -4, 2, 2, '#c07050'); line(q, 4, -4, 5, 2, 2, '#c07050');
    }
    q.beginPath(); q.moveTo(-14, -12); q.lineTo(-26, -6); q.lineTo(-14, -6); fs(q, '#7a8090', 1.6);
    q.restore();
  }
  function zzz(q, x, y, t, s = 1, col = '#fffaf0') {
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.5 + i / 3) % 1);
      const a = sin(PI * k);
      E.text(q, 'z', x + k * 60 * s + sin(k * 6 + i) * 8, y - k * 110 * s, { size: (26 + k * 30) * s, font: 'hand', color: col, alpha: a, stroke: 'rgba(58,38,32,.5)', strokeW: 5 * s, weight: 700 });
    }
  }
  /** 小黑羊发烫时冒的蒸汽（纯函数：每一团按出生后的年龄算） */
  function steam(q, t, x, y, k, seed = 1, spread = 36, size = 1) {
    if (k <= 0.02) return;
    E.field(q, t, { n: 12, every: 0.11, life: 1.3, seed, prewarm: true,
      make: (r) => ({ dx: (r(1) - 0.5) * spread, vx: (r(2) - 0.5) * 40, s: (9 + r(3) * 9) * size, ph: r(4) * 6 }),
      draw: (g, p, age, kk) => {
        const px = x + p.dx + p.vx * age + sin(age * 5 + p.ph) * 6 * size, py = y - age * 95 * size, rr = p.s * (1 + kk * 2.1);
        g.globalAlpha = k * 0.6 * (1 - kk) * min(1, age * 7); g.fillStyle = '#fffaf2';
        g.beginPath(); g.arc(px, py, rr, 0, TAU); g.fill(); g.globalAlpha = 1;
      } });
  }
  function star4(q, x, y, r, rot = 0) {
    q.moveTo(x + cos(rot) * r, y + sin(rot) * r);
    for (let j = 1; j <= 8; j++) { const a = rot + (j * TAU) / 8, rr = j % 2 ? r * 0.22 : r; q.lineTo(x + cos(a) * rr, y + sin(a) * rr); }
    q.closePath();
  }
  function sparkle(q, x, y, r, a, rot = 0, col = '#fffbe8') {
    if (a <= 0.01) return;
    glow(q, x, y, r * 1.6, '255,240,200', a * 0.7);
    q.save(); q.globalAlpha *= a; q.fillStyle = col; q.beginPath(); star4(q, x, y, r, rot); q.fill(); q.restore();
  }
  /** 漫画式的“！”：一个弹出来的感叹号 */
  function bang(q, x, y, k, s = 1, col = RED) {
    if (k <= 0) return;
    const sc = s * (k < 0.3 ? ease.back(k / 0.3) : 1);
    q.save(); q.translate(x, y); q.scale(sc, sc); q.rotate(0.12);
    q.beginPath(); q.moveTo(-9, -70); q.lineTo(9, -70); q.lineTo(5, -18); q.lineTo(-5, -18); q.closePath(); fs(q, col, 5);
    q.beginPath(); circ(q, 0, 0, 8); fs(q, col, 5);
    q.restore();
  }

  /* ---------------- 手写字：Before Summer ----------------
   * 每个字母是几条笔画（控制点），Catmull-Rom 平滑后按长度逐段画出来（写字动画）。字形是本页自己画的 */
  const GLYPHS = {
    B: [66, [[8, -96, 6, -60, 5, -24, 4, 0], [3, -94, 20, -103, 40, -99, 50, -86, 46, -70, 30, -58, 10, -55], [12, -56, 36, -54, 56, -42, 58, -20, 44, -4, 22, 1, 2, -2]]],
    e: [50, [[6, -24, 26, -26, 40, -32, 38, -46, 24, -53, 8, -46, 1, -28, 6, -9, 20, 0, 36, -2, 46, -10]]],
    f: [36, [[40, -90, 32, -101, 18, -100, 11, -88, 9, -62, 8, -30, 6, 0, 2, 16], [-6, -52, 12, -53, 30, -55]]],
    o: [52, [[26, -52, 10, -47, 1, -30, 4, -10, 18, 0, 34, -4, 44, -20, 42, -40, 30, -52, 18, -50]]],
    r: [42, [[5, -50, 5, -25, 4, 0], [5, -28, 12, -44, 24, -52, 38, -50]]],
    S: [64, [[52, -88, 44, -99, 26, -103, 8, -96, 2, -80, 10, -66, 30, -56, 50, -44, 56, -26, 48, -8, 28, 0, 8, -3, -2, -14]]],
    u: [56, [[4, -50, 3, -24, 10, -6, 24, 0, 36, -8, 44, -26, 44, -50], [44, -50, 44, -20, 46, 0]]],
    m: [74, [[4, -50, 4, -25, 4, 0], [4, -32, 12, -47, 24, -52, 32, -44, 34, -28, 34, 0], [34, -32, 42, -47, 54, -52, 62, -44, 64, -28, 64, 0]]],
  };
  function catmull(p, seg = 7) {
    const n = p.length / 2, out = [];
    for (let i = 0; i < n - 1; i++) {
      const a = max(0, i - 1), b = i, c = i + 1, d = min(n - 1, i + 2);
      for (let j = 0; j < seg; j++) {
        const t = j / seg, t2 = t * t, t3 = t2 * t;
        for (let k = 0; k < 2; k++) {
          const P0 = p[a * 2 + k], P1 = p[b * 2 + k], P2 = p[c * 2 + k], P3 = p[d * 2 + k];
          out.push(0.5 * (2 * P1 + (-P0 + P2) * t + (2 * P0 - 5 * P1 + 4 * P2 - P3) * t2 + (-P0 + 3 * P1 - 3 * P2 + P3) * t3));
        }
      }
    }
    out.push(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);
    return out;
  }
  function strokeSet(list, gap = 16) {
    const strokes = [];
    for (const raw of list) {
      const p = catmull(raw, 7), c = new Float32Array(p.length / 2);
      let L = 0;
      for (let i = 1; i < c.length; i++) { L += hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]); c[i] = L; }
      strokes.push({ p, c, L });
    }
    let total = 0;
    for (const s of strokes) { s.o = total; total += s.L + gap; }
    return { strokes, total };
  }
  function words(lines, slant = 0.16) {
    const list = [];
    for (const [txt, ox, oy] of lines) {
      let x = ox;
      for (const ch of txt) {
        const G = GLYPHS[ch];
        if (!G) { x += 30; continue; }
        for (const st of G[1]) { const r = []; for (let i = 0; i < st.length; i += 2) r.push(x + st[i] - st[i + 1] * slant, oy + st[i + 1]); list.push(r); }
        x += G[0];
      }
    }
    return strokeSet(list);
  }
  const TITLE = words([['Before', 0, 0], ['Summer', 64, 128]]);
  const SWOOSH = strokeSet([[30, 158, 150, 170, 300, 168, 420, 150, 486, 118]]);
  const RAYS = strokeSet([[388, -58, 404, -84], [414, -48, 440, -66], [424, -24, 454, -28], [420, 2, 448, 14]], 8);
  const LABEL = words([['Before', 0, 0], ['Summer', 330, 0]], 0.1);
  /** 画一组笔画的前 prog（0..1）部分，返回笔尖位置 */
  function drawStrokes(q, W, prog, lw, color) {
    const lim = W.total * clamp(prog);
    if (lim <= 0) return null;
    q.lineCap = 'round'; q.lineJoin = 'round'; q.lineWidth = lw; q.strokeStyle = color;
    q.beginPath();
    let tip = null;
    for (const s of W.strokes) {
      if (s.o >= lim) break;
      const upto = lim - s.o, p = s.p, c = s.c;
      q.moveTo(p[0], p[1]);
      let i = 1;
      for (; i < c.length && c[i] <= upto; i++) q.lineTo(p[i * 2], p[i * 2 + 1]);
      if (i < c.length) { const f = (upto - c[i - 1]) / max(1e-6, c[i] - c[i - 1]); const x = lerp(p[i * 2 - 2], p[i * 2], f), y = lerp(p[i * 2 - 1], p[i * 2 + 1], f); q.lineTo(x, y); tip = [x, y]; }
      else tip = [p[p.length - 2], p[p.length - 1]];
    }
    q.stroke();
    return tip;
  }
  /** 红色笔刷底（静态精灵）：干笔的纤维 + 印刷网点 */
  reg('bs-brush', 1100, 360, (q, w, h) => {
    const R = rng(77);
    const band = (off, th, col, a) => {
      q.globalAlpha = a; q.lineWidth = th; q.strokeStyle = col; q.lineCap = 'round';
      const x0 = 60 + R() * 70, x1 = w - 60 - R() * 90, j = (R() - 0.5) * 14;
      q.beginPath(); q.moveTo(x0, 250 + off + j); q.bezierCurveTo(x0 + 330, 214 + off, x1 - 330, 150 + off, x1, 110 + off + j); q.stroke();
    };
    band(0, 150, '#e2574c', 0.95);
    for (let i = 0; i < 70; i++) band((R() - 0.5) * 170, 3 + R() * 12, R() < 0.75 ? '#e2574c' : '#c9433b', 0.35 + R() * 0.5);
    for (let i = 0; i < 26; i++) band((R() - 0.5) * 120, 2 + R() * 4, '#f07a66', 0.3 + R() * 0.3);
    // 网点
    q.globalAlpha = 1;
    q.globalCompositeOperation = 'source-atop';
    q.fillStyle = 'rgba(255,190,170,0.35)';
    for (let y = 0; y < h; y += 14) for (let x = (y / 14) % 2 ? 7 : 0; x < w; x += 14) { const r = 1.2 + 2.6 * clamp((x - 600) / 500) * (0.6 + 0.4 * sin(y * 0.05)); q.beginPath(); circ(q, x, y, r); q.fill(); }
    q.globalCompositeOperation = 'source-over';
  });
  /**
   * 标题：Before Summer（手写）+ 红笔刷 + 太阳光线；t0 起开始写。o: { sub（中文标题 alpha）, fade（整体 alpha）, ink, beat }
   * 时间线：0–0.45 笔刷刷出；0.3–2.7 写字；2.6–3.1 下划线；3.0–3.4 光线
   */
  function titleCard(g, s, cx, cy, sc, t0, o = {}) {
    const lt = s.t - t0, fa = o.fade ?? 1;
    if (lt < 0 || fa <= 0) return;
    g.save(); g.globalAlpha *= fa;
    // 笔刷
    // 笔刷从左往右刷出来：前沿是羽化的（几条透明度递减的竖条），前沿上有一点笔尖的高光——
    // 看得出是一笔刷上去的，而不是一块被硬边裁开的红色色块
    const bk = easeO(clamp(lt / 0.5));
    if (bk > 0) {
      g.save(); g.translate(cx, cy + 30 * sc); g.scale(sc, sc); g.rotate(-0.05);
      const spr = lay(s, 'bs-brush'), X0 = -420, W0 = 840, edge = X0 + (W0 + 140) * bk - 70, F = 140, N = 7;
      const pa = g.globalAlpha, sx = spr.width / W0;
      const slice = (a, b, al) => { const x0 = max(X0, a), x1 = min(X0 + W0, b); if (x1 <= x0 || al <= 0) return; g.globalAlpha = pa * al; g.drawImage(spr, (x0 - X0) * sx, 0, (x1 - x0) * sx, spr.height, x0, -140, x1 - x0, 275); };
      slice(X0, edge - F, 1);
      for (let i = 0; i < N; i++) slice(edge - F + (F / N) * i, edge - F + (F / N) * (i + 1), 1 - (i + 0.5) / N);
      g.globalAlpha = pa;
      if (bk < 1) { const ty = 51 - 107 * clamp((edge - X0) / W0); glow(g, edge - 40, ty, 110, '255,190,170', 0.5 * (1 - bk)); }
      g.restore();
    }
    g.translate(cx - 250 * sc, cy - 10 * sc); g.scale(sc, sc);
    const wp = clamp((lt - 0.3) / 2.4), sw = clamp((lt - 2.6) / 0.5), rp = clamp((lt - 3.0) / 0.45);
    const ink = o.ink || '#fff6ea', sh = 'rgba(110,30,24,0.4)';
    g.save(); g.translate(5, 6);
    drawStrokes(g, TITLE, wp, 15, sh); drawStrokes(g, SWOOSH, sw, 12, sh); drawStrokes(g, RAYS, rp, 10, sh);
    g.restore();
    const tip = drawStrokes(g, TITLE, wp, 14, ink);
    drawStrokes(g, SWOOSH, sw, 11, ink);
    const pop = 1 + 0.12 * (o.beat || 0);
    g.save(); g.translate(420, -30); g.scale(pop, pop); g.translate(-420, 30); drawStrokes(g, RAYS, rp, 9, ink); g.restore();
    if (tip && wp < 1) glow(g, tip[0], tip[1], 40, '255,236,200', 0.8);
    g.restore();
  }

  /* ---------------- 道具 ---------------- */
  /** 收音机（厨房窗台上那台）：底边中心 (x, y)，缩放 k；on 0..1 通电，lv 0..1 音量，t 时间，bp 拍内相位 */
  function radio(q, x, y, k, t, on = 1, lv = 0.6, bp = 0) {
    q.save(); q.translate(x, y); q.scale(k, k);
    shadow(q, 0, 0, 200, 0.55);
    // 声波：每拍一圈
    if (on > 0.1 && lv > 0.02) {
      q.save(); q.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 2; j++) {
        const ph = (bp + j * 0.5) % 1, r = 90 + ph * 170;
        q.globalAlpha = on * lv * (1 - ph) * 0.45; q.strokeStyle = '#ffe6b0'; q.lineWidth = 5;
        q.beginPath(); q.arc(-82, -104, r, PI * 0.72, PI * 1.28); q.stroke();
      }
      q.restore();
    }
    // 提手
    q.beginPath(); q.moveTo(-98, -200); q.bezierCurveTo(-92, -268, 92, -268, 98, -200);
    q.lineWidth = 17; q.strokeStyle = INK; q.lineCap = 'round'; q.stroke(); q.lineWidth = 9; q.strokeStyle = '#7a4a2c'; q.stroke();
    // 机身
    q.beginPath(); rrect(q, -172, -208, 344, 208, 32);
    q.fillStyle = lg(q, 0, -208, 0, 0, [[0, '#c27a44'], [0.55, '#a05e34'], [1, '#6e3f22']]); q.fill();
    q.lineWidth = 5; q.strokeStyle = INK; q.stroke();
    q.save(); q.clip();
    q.globalAlpha = 0.16; q.strokeStyle = '#3a1e10'; q.lineWidth = 2.2;
    for (let i = 0; i < 8; i++) { q.beginPath(); q.moveTo(-172, -196 + i * 26); q.bezierCurveTo(-60, -204 + i * 26 + (i % 2 ? 9 : -7), 60, -188 + i * 26, 172, -198 + i * 26); q.stroke(); }
    q.globalAlpha = 1; q.fillStyle = 'rgba(255,226,190,.22)'; q.fillRect(-172, -208, 344, 20);
    q.restore();
    // 喇叭网（左）
    q.beginPath(); circ(q, -82, -104, 72); q.fillStyle = '#e6d0a8'; q.fill(); q.lineWidth = 5; q.strokeStyle = INK; q.stroke();
    q.save(); q.beginPath(); circ(q, -82, -104, 70); q.clip();
    q.strokeStyle = 'rgba(120,86,50,.35)'; q.lineWidth = 1.6;
    for (let r = 12; r < 72; r += 8) { q.beginPath(); q.arc(-82, -104, r, 0, TAU); q.stroke(); }
    q.strokeStyle = 'rgba(120,86,50,.22)';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; line(q, -82, -104, -82 + cos(a) * 72, -104 + sin(a) * 72, 1.4, 'rgba(120,86,50,.22)'); }
    q.fillStyle = 'rgba(255,255,255,.18)'; q.beginPath(); q.ellipse(-104, -130, 34, 18, -0.6, 0, TAU); q.fill();
    q.restore();
    q.beginPath(); circ(q, -82, -104, 14); fs(q, '#b88a52', 3);
    // 刻度窗（右上）
    q.beginPath(); rrect(q, 14, -180, 140, 56, 12);
    q.fillStyle = on > 0.05 ? lg(q, 0, -180, 0, -124, [[0, `rgba(255,${190 + 40 * on | 0},110,1)`], [1, `rgba(${230 + 20 * on | 0},${120 + 40 * on | 0},50,1)`]]) : '#4a3024';
    q.fill(); q.lineWidth = 4; q.strokeStyle = INK; q.stroke();
    q.save(); q.globalAlpha = 0.25 + 0.5 * on; q.fillStyle = '#5a2a10';
    for (let i = 0; i <= 12; i++) q.fillRect(22 + i * 10.3, -172, 2, i % 3 ? 8 : 14);
    q.restore();
    const nx = 30 + 104 * (0.35 + 0.3 * on + 0.02 * sin(t * 0.7));
    line(q, nx, -176, nx, -128, 3.4, '#c0281c');
    if (on > 0.05) glow(q, 84, -152, 110, '255,190,90', on * 0.5);
    // 频谱窗（右下）
    q.beginPath(); rrect(q, 14, -110, 140, 58, 10); fs(q, '#2b2230', 4);
    for (let i = 0; i < 9; i++) {
      const hh = on * clamp(lv * (0.35 + 0.65 * abs(sin(t * (2.2 + i * 0.9) + i * 1.7))) + (i < 3 ? 0.35 : 0.12) * (1 - bp) * lv);
      const n = max(1, Math.round(hh * 6));
      for (let j = 0; j < n; j++) { q.fillStyle = j > 4 ? '#ff8a5a' : j > 2 ? '#ffd27a' : '#9fe0a0'; q.fillRect(22 + i * 14.2, -60 - j * 8, 10, 5.5); }
    }
    // 旋钮 + 铭牌
    for (const kx of [44, 124]) { q.beginPath(); circ(q, kx, -28, 15); fs(q, '#f1e2c2', 4); line(q, kx, -28, kx + 6, -38, 3, INK); }
    q.beginPath(); rrect(q, 64, -36, 40, 14, 4); fs(q, '#e8c064', 2.5);
    q.restore();
  }
  /** 磁带盘 */
  function reel(q, x, y, rTape, ang) {
    q.beginPath(); circ(q, x, y, rTape); q.fillStyle = '#5b3b2c'; q.fill();
    q.strokeStyle = 'rgba(255,220,180,.18)'; q.lineWidth = 1.2; q.beginPath(); q.arc(x, y, rTape * 0.8, 0, TAU); q.stroke();
    q.beginPath(); circ(q, x, y, 14); q.fillStyle = '#f6f1e6'; q.fill(); q.lineWidth = 2.4; q.strokeStyle = INK; q.stroke();
    q.save(); q.translate(x, y); q.rotate(ang); q.fillStyle = INK;
    for (let i = 0; i < 6; i++) { q.rotate(TAU / 6); q.fillRect(-1.8, -13, 3.6, 6); }
    q.restore();
  }
  /** 小黑羊贴纸 */
  function sheepSticker(q, x, y, k) {
    q.save(); q.translate(x, y); q.scale(k, k); q.rotate(-0.15);
    q.beginPath(); circ(q, 0, 0, 22); fs(q, '#fff8ea', 2.5);
    q.fillStyle = '#2c2430'; for (const [a, b, r] of [[-9, -8, 8], [0, -11, 8], [9, -8, 8], [-11, 1, 7], [11, 1, 7]]) { q.beginPath(); circ(q, a, b, r); q.fill(); }
    q.beginPath(); ell(q, 0, 3, 9, 10); fs(q, '#fff1e6', 1.5);
    q.fillStyle = '#2b1a1a'; q.beginPath(); circ(q, -3.5, 2, 1.6); circ(q, 3.5, 2, 1.6); q.fill();
    q.strokeStyle = '#e0a44a'; q.lineWidth = 3; q.beginPath(); q.arc(-11, -2, 5, 3.6, 5.8); q.stroke(); q.beginPath(); q.arc(11, -2, 5, 3.6 - 2.2, 5.8 - 2.2, false); q.stroke();
    q.restore();
  }
  /**
   * 手提录音机：底边中心 (x, y)，缩放 k
   * o = { t, rec（录音灯 0..1）, spin（转速 圈/秒）, left（左盘磁带量 0..1）, key（按下的键）, strap, rot }
   */
  function recorder(q, x, y, k, o = {}) {
    const t = o.t || 0;
    q.save(); q.translate(x, y); if (o.rot) q.rotate(o.rot); q.scale(k, k);
    if (o.shadow !== false) shadow(q, 0, 0, 200, 0.5);
    if (o.strap !== false) { q.beginPath(); q.moveTo(-124, -160); q.bezierCurveTo(-112, -262, 112, -262, 124, -160); q.lineWidth = 13; q.strokeStyle = INK; q.lineCap = 'round'; q.stroke(); q.lineWidth = 7; q.strokeStyle = '#c24a3e'; q.stroke(); }
    const keys = [['#e2574c', 'rec'], ['#f4ecdc', 'play'], ['#f4ecdc', 'rew'], ['#f4ecdc', 'ff'], ['#f4ecdc', 'stop']];
    for (let i = 0; i < 5; i++) { const dn = o.key === keys[i][1] ? 7 : 0; q.beginPath(); rrect(q, -150 + i * 46, -184 + dn, 40, 26, 6); fs(q, keys[i][0], 3.2); }
    q.beginPath(); rrect(q, -176, -170, 352, 170, 24);
    q.fillStyle = lg(q, 0, -170, 0, 0, [[0, '#f8f0de'], [1, '#dccaa6']]); q.fill(); q.lineWidth = 5; q.strokeStyle = INK; q.stroke();
    q.fillStyle = RED; q.fillRect(-173, -50, 346, 17);
    q.fillStyle = 'rgba(255,255,255,.35)'; q.fillRect(-160, -164, 320, 8);
    // 磁带仓
    q.beginPath(); rrect(q, -96, -146, 192, 86, 12); fs(q, '#3a3444', 4.5);
    q.save(); q.beginPath(); rrect(q, -92, -142, 184, 78, 9); q.clip();
    q.fillStyle = '#f0e2c6'; q.fillRect(-92, -142, 184, 22);
    q.fillStyle = RED; q.fillRect(-92, -142, 184, 5);
    const L = o.left ?? 0.6, ang = t * (o.spin ?? 0) * TAU;
    reel(q, -46, -99, 17 + 16 * L, ang); reel(q, 46, -99, 17 + 16 * (1 - L), ang + 0.7);
    q.fillStyle = 'rgba(255,255,255,.13)'; q.beginPath(); q.moveTo(-92, -142); q.lineTo(-30, -142); q.lineTo(-74, -64); q.lineTo(-92, -64); q.fill();
    q.restore();
    // 喇叭网（右）、麦克风（左）
    q.fillStyle = 'rgba(58,38,32,.55)';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { q.beginPath(); circ(q, 118 + c * 11, -132 + r * 13, 3); q.fill(); }
    q.beginPath(); circ(q, -136, -128, 13); fs(q, '#8a8290', 3); q.fillStyle = 'rgba(0,0,0,.35)'; for (let i = -1; i <= 1; i++) q.fillRect(-144, -129 + i * 5, 16, 1.6);
    // 录音灯
    const rec = o.rec || 0;
    q.beginPath(); circ(q, 128, -64, 7.5); fs(q, rec > 0.05 ? '#ff6a58' : '#7a2a24', 2.4);
    if (rec > 0.05) glow(q, 128, -64, 34, '255,90,70', rec);
    sheepSticker(q, -134, -24, 0.9);
    q.restore();
  }
  /** 一盘磁带（正面）：中心 (x, y)，缩放 k；o = { t, spin, label（手写进度 0..1）, labelInk, rot } */
  function tape(q, x, y, k, o = {}) {
    q.save(); q.translate(x, y); if (o.rot) q.rotate(o.rot); q.scale(k, k);
    if (o.shadow !== false) shadow(q, 0, 80, 150, 0.45);
    q.beginPath(); rrect(q, -130, -82, 260, 164, 12); fs(q, o.shell || '#34303a', 5);
    q.beginPath(); rrect(q, -114, -70, 228, 96, 8); fs(q, '#fbf1dc', 3);
    q.fillStyle = o.band || RED; q.fillRect(-114, -70, 228, 16);
    E.text(q, 'A', -100, -57, { size: 13, font: 'sans', weight: 700, color: '#fff', align: 'left' });
    q.strokeStyle = 'rgba(58,38,32,.18)'; q.lineWidth = 1.5; for (let i = 0; i < 3; i++) line(q, -100, -30 + i * 16, 100, -30 + i * 16, 1.5, 'rgba(58,38,32,.18)');
    // 窗与盘
    q.beginPath(); rrect(q, -58, -12, 116, 36, 12); fs(q, '#2a2630', 3);
    const ang = (o.t || 0) * (o.spin || 0) * TAU;
    q.save(); q.beginPath(); rrect(q, -56, -10, 112, 32, 10); q.clip();
    reel(q, -36, 6, 22, ang); reel(q, 36, 6, 15, ang + 1);
    q.restore();
    // 下沿梯形 + 螺丝
    q.beginPath(); poly(q, [-80, 82, -64, 44, 64, 44, 80, 82]); fs(q, 'rgba(0,0,0,.18)', 3);
    for (const [sx, sy] of [[-118, -72], [118, -72], [-118, 70], [118, 70], [0, 64]]) { q.beginPath(); circ(q, sx, sy, 4); fs(q, '#8a8494', 1.5); }
    if (o.label > 0) {
      q.save(); q.translate(-96, -24); q.scale(0.285, 0.285);
      drawStrokes(q, LABEL, o.label, 11, o.labelInk || '#2c3e7a');
      q.restore();
    }
    q.restore();
  }
  /** 冰棍：棍底在 (x, y)，rot 旋转，col 颜色，melt 0..1，t 时间（滴落） */
  function popsicle(q, x, y, k, rot, col, melt, t, seed = 1, dark) {
    q.save(); q.translate(x, y); q.rotate(rot); q.scale(k, k);
    q.beginPath(); rrect(q, -9, -62, 18, 80, 8); fs(q, '#e9cb96', 3.5);
    const hgt = 128 * (1 - melt * 0.18), top = -58 - hgt;
    q.beginPath();
    q.moveTo(-34, -52); q.lineTo(-34, top + 30); q.arcTo(-34, top, -4, top, 30); q.lineTo(2, top);
    q.arc(20, top + 4, 17, PI * 1.05, PI * 0.35, true); // 咬了一口
    q.lineTo(34, top + 34); q.lineTo(34, -52);
    // 底边融化的波浪
    for (let i = 0; i <= 6; i++) { const xx = 34 - i * (68 / 6); q.lineTo(xx, -52 + (i % 2 ? 7 + melt * 10 : 0)); }
    q.closePath(); fs(q, col, 4);
    q.save(); q.clip(); q.fillStyle = 'rgba(255,255,255,.35)'; q.fillRect(-26, top + 10, 9, hgt - 30); q.fillStyle = dark || 'rgba(0,0,0,.12)'; q.fillRect(18, top, 20, hgt + 10); q.restore();
    // 滴落
    for (let i = 0; i < 3; i++) {
      const per = 0.9 + i * 0.37, ph = ((t + hash(seed, i) * 3) / per) % 1;
      const dx = -22 + i * 22, dy = -46 + ph * ph * 260;
      const a = melt * (1 - ph);
      if (a > 0.05) { q.globalAlpha = a; q.beginPath(); q.moveTo(dx, dy - 14); q.quadraticCurveTo(dx + 8, dy, dx, dy + 6); q.quadraticCurveTo(dx - 8, dy, dx, dy - 14); fs(q, col, 2.5); q.globalAlpha = 1; }
    }
    q.restore();
  }
  /** 一本书（侧放 / 平放：书脊朝外） */
  function book(q, x, y, w, h, col, rot = 0, lw = 3) {
    q.save(); q.translate(x, y); q.rotate(rot);
    q.beginPath(); rrect(q, -w / 2, -h / 2, w, h, min(6, h / 3)); fs(q, col, lw);
    q.fillStyle = 'rgba(255,240,200,.55)'; q.fillRect(-w / 2 + w * 0.12, -h / 2 + 2, 3, h - 4); q.fillRect(w / 2 - w * 0.12 - 3, -h / 2 + 2, 3, h - 4);
    q.fillStyle = '#fbf1dc'; q.fillRect(-w * 0.2, -h * 0.22, w * 0.4, h * 0.44);
    q.restore();
  }
  const BOOKC = ['#5b4a6b', '#2f4a5a', '#8a3a3a', '#3e6a4a', '#b0703a', '#6a5a8a', '#c0543e', '#40506a', '#7a5a3a'];
  /** 玫瑰花结奖章（宠物大赛第一名） */
  function medal(q, x, y, k, t = 0) {
    q.save(); q.translate(x, y); q.scale(k, k); q.rotate(sin(t * 1.3) * 0.04);
    q.beginPath(); poly(q, [-26, 20, -8, 24, -18, 110, -26, 100, -36, 106]); fs(q, '#3f6aa8', 3);
    q.beginPath(); poly(q, [8, 24, 26, 20, 36, 106, 26, 100, 18, 110]); fs(q, RED, 3);
    q.beginPath();
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU, r = i % 2 ? 44 : 50; i ? q.lineTo(cos(a) * r, sin(a) * r) : q.moveTo(cos(a) * r, sin(a) * r); }
    q.closePath(); fs(q, RED, 3);
    q.beginPath(); for (let i = 0; i <= 20; i++) { const a = 0.15 + (i / 20) * TAU, r = i % 2 ? 31 : 36; i ? q.lineTo(cos(a) * r, sin(a) * r) : q.moveTo(cos(a) * r, sin(a) * r); } q.closePath(); fs(q, '#f6e6c4', 2.5);
    q.beginPath(); circ(q, 0, 0, 25); q.fillStyle = rg(q, -8, -8, 2, 30, [[0, '#fff6c4'], [0.5, '#ffd45a'], [1, '#c98a24']]); q.fill(); q.lineWidth = 3; q.strokeStyle = '#7a4a0c'; q.stroke();
    E.text(q, '1', 0, 11, { size: 32, font: 'Georgia, serif', weight: 700, color: '#8a4f0e' });
    q.restore();
  }
  /** 米白色的火山防护外套（挂着）：挂钩在 (x, y) */
  function coat(q, x, y, k, sway = 0) {
    q.save(); q.translate(x, y); q.rotate(sway); q.scale(k, k);
    q.beginPath(); q.moveTo(0, -12); q.quadraticCurveTo(12, -26, 2, -32); q.lineWidth = 4; q.strokeStyle = '#8a8070'; q.stroke();
    // 衣身
    q.beginPath(); q.moveTo(-58, 18); q.quadraticCurveTo(0, -4, 58, 18); q.lineTo(74, 250); q.quadraticCurveTo(0, 270, -74, 250); q.closePath();
    fs(q, lg(q, -70, 0, 70, 0, [[0, '#f3ecdf'], [0.6, '#e6dccb'], [1, '#cfc3ae']]), 4);
    // 袖子（垂着）
    q.beginPath(); q.moveTo(-58, 20); q.quadraticCurveTo(-84, 90, -80, 210); q.lineTo(-58, 214); q.quadraticCurveTo(-60, 120, -44, 40); q.closePath(); fs(q, '#e2d8c6', 3.5);
    q.beginPath(); q.moveTo(58, 20); q.quadraticCurveTo(84, 90, 80, 210); q.lineTo(58, 214); q.quadraticCurveTo(60, 120, 44, 40); q.closePath(); fs(q, '#d8ccb8', 3.5);
    // 红色条纹与系带
    q.fillStyle = RED; q.fillRect(-81, 186, 23, 8); q.fillRect(58, 186, 23, 8);
    line(q, -4, 30, -2, 250, 3, 'rgba(58,38,32,.5)');
    q.beginPath(); q.moveTo(-50, 130); q.lineTo(50, 130); q.lineWidth = 7; q.strokeStyle = RED; q.stroke();
    q.beginPath(); q.moveTo(-4, 130); q.quadraticCurveTo(-18, 160, -10, 190); q.moveTo(-4, 130); q.quadraticCurveTo(10, 164, 4, 196); q.lineWidth = 5; q.stroke();
    // 领子
    q.beginPath(); q.moveTo(-40, 14); q.lineTo(-4, 58); q.lineTo(-18, 6); q.closePath(); fs(q, '#f6f0e4', 3);
    q.beginPath(); q.moveTo(40, 14); q.lineTo(4, 58); q.lineTo(18, 6); q.closePath(); fs(q, '#ece4d4', 3);
    // 口袋 + 袖口灼痕（只是一点黄）
    q.beginPath(); rrect(q, -52, 170, 34, 30, 5); fs(q, null, 2.5, 'rgba(58,38,32,.45)');
    q.beginPath(); rrect(q, 18, 170, 34, 30, 5); fs(q, null, 2.5, 'rgba(58,38,32,.45)');
    q.restore();
  }
  /** 野外考察背包（打开 / 合上），底边中心 (x, y) */
  function backpack(q, x, y, k, open = 0) {
    q.save(); q.translate(x, y); q.scale(k, k);
    shadow(q, 0, 0, 120, 0.45);
    // 睡袋卷
    q.beginPath(); rrect(q, -84, -250, 168, 50, 25); fs(q, '#6a7a8a', 4); line(q, -40, -250, -40, -200, 3, INK); line(q, 40, -250, 40, -200, 3, INK);
    q.beginPath(); rrect(q, -92, -206, 184, 206, 34); fs(q, lg(q, -92, 0, 92, 0, [[0, '#7c8656'], [1, '#5d6640']]), 5);
    q.beginPath(); rrect(q, -70, -110, 140, 90, 16); fs(q, '#6d7648', 4);
    line(q, -40, -206, -40, -140, 6, '#4a4a30'); line(q, 40, -206, 40, -140, 6, '#4a4a30');
    // 翻盖
    q.save(); q.translate(0, -206); q.rotate(-open * 1.9);
    q.beginPath(); q.moveTo(-88, 0); q.quadraticCurveTo(0, -30, 88, 0); q.lineTo(80, 70); q.quadraticCurveTo(0, 86, -80, 70); q.closePath(); fs(q, '#687244', 4.5);
    q.fillStyle = '#c9a060'; q.fillRect(-10, 60, 20, 16);
    q.restore();
    // 地质锤（插在侧面）
    q.save(); q.translate(96, -60); q.rotate(-0.25);
    q.beginPath(); rrect(q, -6, -150, 12, 170, 5); fs(q, '#b07a44', 3);
    q.beginPath(); poly(q, [-26, -160, 30, -164, 30, -146, -20, -142]); fs(q, '#8a93a0', 3.5);
    q.restore();
    q.restore();
  }
  /** 样品瓶 */
  function jar(q, x, y, k, fill = '#c9a27a') {
    q.save(); q.translate(x, y); q.scale(k, k);
    q.beginPath(); rrect(q, -20, -54, 40, 54, 8); fs(q, 'rgba(210,235,240,.65)', 3.5);
    q.beginPath(); rrect(q, -16, -30, 32, 27, 5); q.fillStyle = fill; q.fill();
    q.beginPath(); rrect(q, -23, -64, 46, 13, 4); fs(q, '#c8a060', 3);
    q.fillStyle = 'rgba(255,255,255,.55)'; q.fillRect(-13, -48, 5, 38);
    q.restore();
  }
  /** 纸灯笼（提在手里 / 挂着）：中心 (x, y) */
  function lantern(q, x, y, k, t, a = 1) {
    q.save(); q.translate(x, y); q.scale(k, k);
    glow(q, 0, 0, 120, '255,190,110', 0.55 * a);
    q.beginPath(); ell(q, 0, 0, 34, 42); fs(q, rg(q, -8, -10, 4, 50, [[0, '#fff2c8'], [0.6, '#ffc070'], [1, '#e87a3a']]), 3.5);
    q.strokeStyle = 'rgba(160,70,30,.5)'; q.lineWidth = 2; for (const dx of [-18, 0, 18]) { q.beginPath(); q.ellipse(0, 0, abs(dx) + 4, 42, 0, -PI / 2, PI / 2, dx < 0); q.stroke(); }
    q.beginPath(); rrect(q, -16, -50, 32, 10, 3); fs(q, '#6a3a2a', 2.5); q.beginPath(); rrect(q, -14, 40, 28, 9, 3); fs(q, '#6a3a2a', 2.5);
    q.restore();
  }
  /**
   * 手（插入镜头用）：手腕在 (x, y)，朝 ang 方向，s 缩放
   * kind: 'open' | 'fist' | 'point' | 'pinky' | 'pen' | 'hold' | 'flat'；sleeve: 袖子颜色；cuff: 袖口颜色；flip: 上下翻（左右手）
   */
  function hand(q, x, y, s, ang, kind = 'open', o = {}) {
    const skin = o.skin || SKIN, lw = o.lw ?? 4;
    q.save(); q.translate(x, y); q.rotate(ang); q.scale(s, o.flip ? -s : s);
    if (o.sleeve) {
      // 袖子：往手臂根部渐渐变粗，上亮下暗，袖口附近几道褶
      const sl = o.sleeveLen || 236, w0 = 50, w1 = sl > 400 ? 68 : 60;
      q.beginPath(); q.moveTo(6, -w0); q.bezierCurveTo(-sl * 0.3, -w0 - 6, -sl * 0.7, -w1, -sl, -w1); q.lineTo(-sl, w1); q.bezierCurveTo(-sl * 0.7, w1, -sl * 0.3, w0 + 8, 6, w0); q.closePath();
      fs(q, o.sleeve, lw);
      q.save(); q.clip();
      q.fillStyle = 'rgba(40,30,50,.16)'; q.beginPath(); q.moveTo(6, w0 * 0.25); q.bezierCurveTo(-sl * 0.3, w0 * 0.4, -sl * 0.7, w1 * 0.5, -sl, w1 * 0.4); q.lineTo(-sl, w1 + 10); q.lineTo(6, w0 + 10); q.closePath(); q.fill();
      q.fillStyle = 'rgba(255,255,255,.22)'; q.beginPath(); q.moveTo(6, -w0 * 0.55); q.bezierCurveTo(-sl * 0.3, -w0 * 0.7, -sl * 0.7, -w1 * 0.75, -sl, -w1 * 0.7); q.lineTo(-sl, -w1 * 0.5); q.bezierCurveTo(-sl * 0.7, -w1 * 0.55, -sl * 0.3, -w0 * 0.45, 6, -w0 * 0.35); q.closePath(); q.fill();
      q.strokeStyle = 'rgba(40,30,50,.35)'; q.lineWidth = 3; q.lineCap = 'round';
      for (const [fx, fy, len] of [[-60, -18, 50], [-100, 10, 70], [-150, -30, 44], [-210, 18, 60]]) { q.beginPath(); q.moveTo(fx, fy); q.quadraticCurveTo(fx - len * 0.5, fy + 8, fx - len, fy + 2); q.stroke(); }
      q.restore();
      if (o.cuff) { q.beginPath(); rrect(q, -30, -w0 - 4, 30, w0 * 2 + 8, 10); fs(q, o.cuff, lw); q.beginPath(); circ(q, -15, w0 * 0.45, 5); fs(q, '#e8e0d0', 2); }
    }
    const finger = (fx, fy, len, w, a) => { q.save(); q.translate(fx, fy); q.rotate(a); q.beginPath(); rrect(q, 0, -w / 2, len, w, w / 2); fs(q, skin, lw); q.restore(); };
    const curled = (fx, fy, w) => { q.beginPath(); ell(q, fx, fy, w * 0.72, w * 0.55); fs(q, skin, lw); };
    // 手掌
    q.beginPath(); rrect(q, -6, -32, 70, 64, 26); fs(q, skin, lw);
    if (kind === 'open' || kind === 'flat') {
      const sp = kind === 'open' ? 0.12 : 0.03;
      finger(56, -22, 50, 15, -sp * 1.5); finger(60, -7, 56, 15, -sp * 0.5); finger(60, 8, 52, 15, sp * 0.5); finger(54, 22, 42, 14, sp * 1.6);
      finger(20, -26, 44, 17, -0.9);
    } else if (kind === 'point') {
      finger(58, -18, 58, 15, -0.05); curled(66, -2, 22); curled(64, 12, 21); curled(58, 24, 19); finger(22, -26, 36, 17, -0.7);
    } else if (kind === 'pinky') {
      curled(66, -20, 22); curled(68, -5, 22); curled(66, 9, 21); finger(54, 22, 44, 13, 0.25); finger(22, -26, 34, 17, -0.4);
    } else if (kind === 'pen') {
      q.save(); q.rotate(-0.5); q.beginPath(); rrect(q, 30, -8, 150, 12, 6); fs(q, o.pen || '#3a4a8a', 3); q.beginPath(); poly(q, [180, -8, 196, -2, 180, 4]); fs(q, '#e8d8b0', 2.5); q.restore();
      curled(66, -14, 24); curled(66, 2, 23); curled(62, 16, 21); curled(54, 27, 18); finger(26, -26, 44, 17, -0.25);
    } else if (kind === 'hold') {
      curled(66, -18, 23); curled(69, -3, 23); curled(67, 11, 22); curled(60, 24, 20); finger(26, -28, 40, 17, -0.35);
    } else { // fist
      curled(62, -18, 22); curled(65, -3, 22); curled(63, 11, 21); curled(57, 23, 19); finger(24, -24, 34, 17, 0.3);
    }
    q.restore();
  }

  /* ---------------- 天空（很细的竖直渐变条，拉伸贴满） ---------------- */
  const SKIES = {
    predawn: [[0, '#1b2044'], [0.45, '#34335e'], [0.78, '#7a5272'], [1, '#d88a6e']],
    dawn: [[0, '#5b74b0'], [0.45, '#b69ab8'], [0.78, '#ffc39a'], [1, '#ffe4b4']],
    morning: [[0, '#79aee8'], [0.55, '#b8d7f0'], [0.86, '#ffeccc'], [1, '#fff3dc']],
    noon: [[0, '#4f93dc'], [0.55, '#9fcbf0'], [1, '#e6f3f6']],
    golden: [[0, '#6c8ccc'], [0.42, '#e9b4a2'], [0.74, '#ffc47e'], [1, '#ffe09c']],
    sunset: [[0, '#3c4588'], [0.38, '#b86c8c'], [0.7, '#f39460'], [1, '#ffcf88']],
    dusk: [[0, '#1b2150'], [0.5, '#44468a'], [0.82, '#a8708e'], [1, '#e29a80']],
    night: [[0, '#0a0f2c'], [0.55, '#172050'], [1, '#2c2e62']],
    dawn2: [[0, '#3c4c88'], [0.42, '#9888b8'], [0.74, '#ffae9e'], [1, '#ffe0b2']],
    white: [[0, '#fffaf0'], [1, '#fff4e0']],
  };
  for (const k in SKIES) reg('sky:' + k, 8, VH, (q, w, h) => { q.fillStyle = lg(q, 0, 0, 0, h, SKIES[k]); q.fillRect(0, 0, w, h); });
  function sky(g, s, name, a = 1, y = 0, h = VH) { if (a <= 0) return; const pa = g.globalAlpha; g.globalAlpha = pa * a; g.drawImage(lay(s, 'sky:' + name), -40, y - 40, VW + 80, h + 80); g.globalAlpha = pa; }

  /* ---------------- 字幕旁白（我们自己写的，不是歌词） ---------------- */
  const CAPTIONS = [
    [8.4, 13.2, '莱塔尼亚，六月。一个平凡的早晨。'],
    [14.0, 18.6, '明天一早，爸爸妈妈又要出发去考察。'],
    [44.2, 48.8, '爸爸的课，她从不迟到——差一点。'],
    [54.0, 58.8, '她想把这一天的声音，都录下来。'],
    [76.0, 80.6, '下午的风很慢，冰棍化得很快。'],
    [148.1, 151.6, '“等我回来，给你带一块乌纳火山的石头。”', { style: 'quote', y: 930, size: 46 }],
    [170.3, 175.2, '那一夜，她把流星也录了进去。'],
    [196.8, 201.4, '黎明。他们像往常一样出发了。'],
    [219.9, 223.3, '那是夏天之前，平凡的一天。'],
  ];

  /* =========================================================
   * 场景件：远处的城、联排房、窗
   * ========================================================= */
  const TOWN = {
    dawn: { far: '#6b6690', near: '#433f68', win: null, tower: '#3a375c' },
    morning: { far: '#b3c0dc', near: '#8e9cc0', win: null, tower: '#7d8bb2' },
    noon: { far: '#b8cde6', near: '#94abcf', win: null, tower: '#8aa0c8' },
    golden: { far: '#e2ab92', near: '#bf8078', win: null, tower: '#a86a66' },
    sunset: { far: '#b87888', near: '#7a4e6c', win: '#ffcf7a', tower: '#5e3c5c' },
    night: { far: '#262a56', near: '#191c3c', win: '#ffcf7a', tower: '#14173a' },
    dawn2: { far: '#8a7fa8', near: '#5a5280', win: '#ffd9a0', tower: '#4a4270' },
  };
  /** 钟楼（立面）：底边中心 (x, base)，宽 w，高 h；o = { col, face, ink, bell（钟的摆角）, detail } */
  function belltower(q, x, base, w, h, o = {}) {
    const col = o.col || '#d8c6a8', lw = o.lw ?? 0;
    const sw = w, top = base - h;
    const beltY = top + h * 0.22, clockY = top + h * 0.38;
    q.beginPath(); q.rect(x - sw / 2, beltY, sw, base - beltY); fs(q, col, lw);
    // 钟楼顶层（开拱）
    q.beginPath(); q.rect(x - sw * 0.46, top + h * 0.08, sw * 0.92, h * 0.15); fs(q, col, lw);
    if (o.detail) {
      q.fillStyle = o.dark || 'rgba(40,30,50,.8)';
      for (const dx of [-0.2, 0.2]) { q.beginPath(); const ax = x + dx * sw, aw = sw * 0.14, ay = top + h * 0.1, ah = h * 0.12; q.moveTo(ax - aw, ay + ah); q.lineTo(ax - aw, ay + aw); q.quadraticCurveTo(ax, ay - aw * 0.4, ax + aw, ay + aw); q.lineTo(ax + aw, ay + ah); q.closePath(); q.fill(); }
      if (o.bell != null) {
        q.save(); q.translate(x, top + h * 0.115); q.rotate(o.bell);
        q.beginPath(); q.moveTo(-sw * 0.09, h * 0.075); q.quadraticCurveTo(-sw * 0.085, 0, 0, -h * 0.005); q.quadraticCurveTo(sw * 0.085, 0, sw * 0.09, h * 0.075); q.closePath(); fs(q, '#c89a3a', lw * 0.8);
        q.restore();
      }
    }
    // 尖顶
    q.beginPath(); q.moveTo(x - sw * 0.52, top + h * 0.085); q.lineTo(x, top - h * 0.3); q.lineTo(x + sw * 0.52, top + h * 0.085); q.closePath(); fs(q, o.roof || col, lw);
    // 角上小尖塔
    for (const s of [-1, 1]) { q.beginPath(); q.moveTo(x + s * sw * 0.5 - sw * 0.06, top + h * 0.09); q.lineTo(x + s * sw * 0.5, top - h * 0.02); q.lineTo(x + s * sw * 0.5 + sw * 0.06, top + h * 0.09); q.closePath(); fs(q, o.roof || col, lw); }
    // 钟面
    const cr = sw * 0.3;
    q.beginPath(); circ(q, x, clockY, cr); fs(q, o.face || 'rgba(255,245,220,.9)', lw);
    if (o.detail) {
      q.strokeStyle = o.ink || INK; q.lineWidth = max(1, cr * 0.06);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; q.beginPath(); q.moveTo(x + cos(a) * cr * 0.78, clockY + sin(a) * cr * 0.78); q.lineTo(x + cos(a) * cr * 0.9, clockY + sin(a) * cr * 0.9); q.stroke(); }
    }
    // 金色尖端
    q.beginPath(); circ(q, x, top - h * 0.3, max(2, sw * 0.04)); q.fillStyle = '#e8c064'; q.fill();
  }
  /** 远处的学院城剪影：两层（远层尖塔 / 近层屋顶），towerX 处有大学钟楼 */
  function skyline(q, w, base, seed, pal, o = {}) {
    const R = rng(seed);
    q.fillStyle = pal.far;
    let x = -60;
    while (x < w + 60) {
      const bw = 70 + R() * 120, bh = 50 + R() * 90;
      q.fillRect(x, base - bh, bw + 2, bh + 40);
      const k = R();
      if (k < 0.2) {
        const spw = 16 + R() * 18, sph = 130 + R() * 170, sx = x + bw * (0.3 + R() * 0.4);
        q.fillRect(sx - spw / 2, base - bh - sph * 0.4, spw, sph * 0.4 + 2);
        q.beginPath(); q.moveTo(sx - spw / 2 - 5, base - bh - sph * 0.4); q.lineTo(sx, base - bh - sph); q.lineTo(sx + spw / 2 + 5, base - bh - sph * 0.4); q.fill();
      } else if (k < 0.32) {
        const dr = bw * 0.32; q.beginPath(); q.ellipse(x + bw / 2, base - bh, dr, dr * 0.95, 0, PI, TAU); q.fill(); q.fillRect(x + bw / 2 - 2, base - bh - dr - 34, 4, 36);
      } else {
        q.beginPath(); q.moveTo(x - 6, base - bh); q.lineTo(x + bw / 2, base - bh - bw * (0.35 + R() * 0.25)); q.lineTo(x + bw + 6, base - bh); q.fill();
      }
      x += bw * (0.65 + R() * 0.45);
    }
    if (o.towerX != null) belltower(q, o.towerX, base - 20, 70, 300, { col: pal.tower || pal.near, roof: pal.tower || pal.near, face: pal.win ? '#ffe7b0' : 'rgba(255,245,225,.55)' });
    // 近层：屋顶与烟囱
    q.fillStyle = pal.near;
    x = -80;
    const wins = [];
    while (x < w + 80) {
      const bw = 90 + R() * 130, bh = 16 + R() * 60, rh = bw * (0.3 + R() * 0.3);
      q.beginPath(); q.moveTo(x, base + 60); q.lineTo(x, base - bh); q.lineTo(x + bw * 0.5, base - bh - rh); q.lineTo(x + bw, base - bh); q.lineTo(x + bw, base + 60); q.fill();
      if (R() < 0.6) q.fillRect(x + bw * (0.2 + R() * 0.5), base - bh - rh * 0.8, 12, rh * 0.6);
      if (pal.win) for (let i = 0; i < 3; i++) if (R() < 0.5) wins.push([x + bw * (0.15 + R() * 0.7), base - bh + 8 + R() * 40]);
      x += bw * (0.75 + R() * 0.35);
    }
    q.fillRect(-80, base + 10, w + 160, 400);
    if (pal.win) { q.fillStyle = pal.win; for (const [wx, wy] of wins) q.fillRect(wx, wy, 7, 10); }
  }
  for (const k of ['dawn', 'morning', 'golden', 'sunset', 'night', 'dawn2', 'noon']) {
    reg('far:' + k, 2400, 560, (q, w, h) => skyline(q, w, 440, 11, TOWN[k], { towerX: 1500 }));
    reg('farw:' + k, 3840, 560, (q, w, h) => skyline(q, w, 440, 12, TOWN[k], { towerX: 2600 }));
  }

  /* ---------- 莱塔尼亚的联排房（立面） ---------- */
  const WALLS = ['#f2d9ae', '#eec39c', '#e8b9a4', '#dcd4ae', '#c8dccc', '#f1e2c4', '#e2bea6', '#cdd6e4', '#efcfb6', '#d8c6e0'];
  const ROOFS = ['#7a4a3c', '#5a4a5e', '#8a5a44', '#4e5a6a', '#6a3e36', '#7a5a4a'];
  const SHUT = ['#5d8a78', '#6a88a8', '#a8574a', '#7a6a9a', '#4f7a8a', '#8a7a4a'];
  /**
   * townhouse(q, x, y, w, h, seed, o)：x 左边，y 地面，w 宽，h 墙高（不含屋顶）
   * o = { wall, roof, shutter, lw, night（0..1 亮窗概率）, door: 'door'|'shop'|null, roofType, light: 'left'|'right' }
   */
  function townhouse(q, x, y, w, h, seed, o = {}) {
    const R = rng(seed);
    const wall = o.wall || WALLS[floor(R() * WALLS.length)], roof = o.roof || ROOFS[floor(R() * ROOFS.length)], sh = o.shutter || SHUT[floor(R() * SHUT.length)];
    const lw = o.lw ?? 3, top = y - h;
    const rt = o.roofType || ['gable', 'step', 'curve', 'mansard'][floor(R() * 4)];
    // 屋顶
    const rh = rt === 'mansard' ? w * 0.3 : w * (0.5 + R() * 0.2);
    q.beginPath();
    if (rt === 'gable') { q.moveTo(x - 12, top + 4); q.lineTo(x + w / 2, top - rh); q.lineTo(x + w + 12, top + 4); q.closePath(); fs(q, roof, lw); if (o.dark) { q.fillStyle = `rgba(28,30,72,${o.dark})`; q.fill(); } }
    else if (rt === 'mansard') { q.moveTo(x - 10, top + 4); q.lineTo(x + w * 0.12, top - rh); q.lineTo(x + w * 0.88, top - rh); q.lineTo(x + w + 10, top + 4); q.closePath(); fs(q, roof, lw); if (o.dark) { q.fillStyle = `rgba(28,30,72,${o.dark})`; q.fill(); } }
    else if (rt === 'step') {
      const n = 4, sw = w / (n * 2 + 1);
      q.moveTo(x, top + 2);
      for (let i = 0; i < n; i++) { q.lineTo(x + sw * i, top - (rh / n) * (i + 1)); q.lineTo(x + sw * (i + 1), top - (rh / n) * (i + 1)); }
      q.lineTo(x + w - sw * n, top - rh - 10); q.lineTo(x + w - sw * n, top - rh);
      for (let i = n - 1; i >= 0; i--) { q.lineTo(x + w - sw * i - sw, top - (rh / n) * (i + 1)); q.lineTo(x + w - sw * i, top - (rh / n) * (i + 1)); }
      q.lineTo(x + w, top + 2); q.closePath(); fs(q, wall, lw);
      if (o.dark) { q.fillStyle = `rgba(28,30,72,${o.dark})`; q.fill(); }
    } else {
      q.moveTo(x, top + 2); q.bezierCurveTo(x, top - rh * 0.3, x + w * 0.3, top - rh * 0.45, x + w * 0.32, top - rh * 0.7);
      q.lineTo(x + w * 0.4, top - rh); q.quadraticCurveTo(x + w / 2, top - rh * 1.14, x + w * 0.6, top - rh); q.lineTo(x + w * 0.68, top - rh * 0.7);
      q.bezierCurveTo(x + w * 0.7, top - rh * 0.45, x + w, top - rh * 0.3, x + w, top + 2); q.closePath(); fs(q, wall, lw);
      if (o.dark) { q.fillStyle = `rgba(28,30,72,${o.dark})`; q.fill(); }
    }
    // 屋顶上的瓦线 / 圆窗
    if (rt === 'gable' || rt === 'mansard') {
      q.save(); q.clip(); q.strokeStyle = 'rgba(0,0,0,.14)'; q.lineWidth = 2;
      for (let yy = top - rh + 14; yy < top; yy += 16) { q.beginPath(); q.moveTo(x - 20, yy); q.lineTo(x + w + 20, yy); q.stroke(); }
      q.restore();
      if (o.oculus) { const cy = top - rh * 0.42, cr = min(w * 0.1, 30); q.beginPath(); circ(q, x + w / 2, cy, cr + 6); fs(q, '#f4ecde', lw * 0.8); q.beginPath(); circ(q, x + w / 2, cy, cr); fs(q, o.night ? '#ffcf7a' : '#7f95b0', lw * 0.7); line(q, x + w / 2 - cr, cy, x + w / 2 + cr, cy, lw * 0.6, '#f4ecde'); line(q, x + w / 2, cy - cr, x + w / 2, cy + cr, lw * 0.6, '#f4ecde'); }
      else if (R() < 0.7) { const cx = x + w * (0.25 + R() * 0.5), cr = min(w * 0.08, 18); q.beginPath(); q.rect(cx - cr, top - rh * 0.55, cr * 2, rh * 0.5); fs(q, wall, lw * 0.8); q.beginPath(); q.moveTo(cx - cr - 5, top - rh * 0.55); q.lineTo(cx, top - rh * 0.55 - cr * 1.2); q.lineTo(cx + cr + 5, top - rh * 0.55); q.closePath(); fs(q, roof, lw * 0.8); q.beginPath(); q.rect(cx - cr * 0.55, top - rh * 0.45, cr * 1.1, rh * 0.3); fs(q, o.night && R() < o.night ? '#ffcf7a' : '#6f84a0', lw * 0.6); }
    } else {
      const cx = x + w / 2, cy = top - rh * 0.45, cr = min(w * 0.08, 16);
      q.beginPath(); circ(q, cx, cy, cr); fs(q, o.night && R() < o.night ? '#ffcf7a' : '#6f84a0', lw * 0.7);
    }
    // 烟囱
    if (R() < 0.7 && rt !== 'step' && rt !== 'curve') { const cx = x + w * (0.2 + R() * 0.6); const cy = top - rh * (rt === 'mansard' ? 1 : (1 - abs(cx - x - w / 2) / (w / 2))) ; q.beginPath(); q.rect(cx - 11, cy - 34, 22, 40); fs(q, '#9a6a54', lw * 0.8); q.beginPath(); q.rect(cx - 14, cy - 40, 28, 8); fs(q, '#7a4e40', lw * 0.8); }
    // 墙
    q.beginPath(); q.rect(x, top, w, h); fs(q, wall, lw);
    // 光影：一侧亮一侧暗、檐下阴影、墙根发暗
    q.save(); q.beginPath(); q.rect(x, top, w, h); q.clip();
    q.fillStyle = lg(q, x, 0, x + w, 0, o.light === 'right' ? [[0, 'rgba(60,30,40,.12)'], [1, 'rgba(255,240,210,.12)']] : [[0, 'rgba(255,240,210,.14)'], [1, 'rgba(60,30,40,.12)']]);
    q.fillRect(x, top, w, h);
    q.fillStyle = 'rgba(60,30,40,.16)'; q.fillRect(x, top, w, 14);
    if (o.dark) { q.fillStyle = `rgba(28,30,72,${o.dark})`; q.fillRect(x, top, w, h); }
    q.fillStyle = lg(q, 0, y - 80, 0, y, [[0, 'rgba(60,30,40,0)'], [1, 'rgba(60,30,40,.18)']]); q.fillRect(x, y - 80, w, 80);
    q.restore();
    // 檐口
    q.beginPath(); q.rect(x - 6, top - 2, w + 12, 12); fs(q, 'rgba(255,255,255,.35)', lw * 0.7);
    // 楼层与窗（o.gh：底层的高度，家门口那栋用更高的底层，门才比人高）
    const gh = o.gh || (o.door === 'shop' ? min(190, h * 0.3) : min(170, h * 0.26));
    const n = max(1, floor((h - gh) / 150));
    const fh = (h - gh) / n;
    const cols = max(2, min(4, floor(w / 105)));
    const ww = min(54, (w / cols) * 0.46), wh = fh * 0.56;
    const arch = R() < 0.5;
    for (let f = 0; f < n; f++) {
      const fy = top + f * fh + fh * 0.22;
      if (f > 0) { q.fillStyle = 'rgba(0,0,0,.08)'; q.fillRect(x, top + f * fh + 2, w, 5); }
      for (let c = 0; c < cols; c++) {
        const cx = x + (w / cols) * (c + 0.5);
        const lit = o.night && R() < o.night;
        winFacade(q, cx, fy, ww, wh, { arch, lit, shutter: R() < 0.45 ? sh : null, box: f === n - 1 && R() < 0.5, lw: lw * 0.75, seed: seed * 7 + f * 5 + c });
      }
    }
    // 底层
    const gy = y - gh;
    const doorR = R();
    q.fillStyle = 'rgba(0,0,0,.1)'; q.fillRect(x, gy, w, 6);
    if (o.door === 'shop') {
      q.beginPath(); q.rect(x + 14, gy + 44, w - 28, gh - 60); fs(q, '#6c86a0', lw * 0.8);
      q.fillStyle = 'rgba(255,255,255,.3)'; q.fillRect(x + 24, gy + 50, 10, gh - 76);
      // 条纹遮阳篷
      const aw = w - 10, ay = gy + 20;
      q.beginPath(); q.moveTo(x + 5, ay); q.lineTo(x + 5 + aw, ay); q.lineTo(x + aw + 18, ay + 46); q.lineTo(x - 8, ay + 46); q.closePath(); fs(q, '#fbf2e2', lw * 0.8);
      q.save(); q.clip(); q.fillStyle = o.awning || [RED, '#4f8a78', '#e0a040', '#5a7ab0'][floor(R() * 4)];
      for (let i = 0; i < 12; i++) q.fillRect(x - 8 + i * ((aw + 30) / 12) * 1, ay, (aw + 30) / 24, 50);
      q.restore();
      q.beginPath(); for (let i = 0; i <= 10; i++) { const xx = x - 8 + i * ((aw + 26) / 10); q.moveTo(xx, ay + 46); q.arc(xx + (aw + 26) / 20, ay + 46, (aw + 26) / 20, PI, 0, true); } fs(q, null, lw * 0.6);
    } else if (o.door !== null) {
      const dx = x + w * (o.doorAt ?? (doorR < 0.5 ? 0.3 : 0.7)), dw = o.doorW || min(70, w * 0.22), dh = gh - 30;
      q.beginPath(); q.moveTo(dx - dw / 2, y); q.lineTo(dx - dw / 2, y - dh + dw / 2); q.arc(dx, y - dh + dw / 2, dw / 2, PI, 0); q.lineTo(dx + dw / 2, y); q.closePath(); fs(q, o.doorCol || '#7a4a2e', lw);
      line(q, dx, y - dh + dw / 2 - 6, dx, y - 4, lw * 0.6, 'rgba(0,0,0,.35)');
      q.fillStyle = '#e8c064'; q.beginPath(); circ(q, dx + dw * 0.3, y - dh * 0.45, 3.5); q.fill();
      q.beginPath(); q.rect(dx - dw / 2 - 10, y - 8, dw + 20, 8); fs(q, '#b8a898', lw * 0.6);
      const wx = dx < x + w / 2 ? x + w * 0.72 : x + w * 0.28;
      winFacade(q, wx, gy + 26, ww, gh * 0.55, { arch: true, lit: o.night && R() < o.night, lw: lw * 0.75, seed: seed + 99 });
    }
  }
  /** 立面上的一扇窗：中心 x，上沿 y */
  function winFacade(q, cx, y, w, h, o = {}) {
    const lw = o.lw ?? 2.4;
    if (o.shutter) { q.beginPath(); q.rect(cx - w / 2 - w * 0.48, y, w * 0.44, h); q.rect(cx + w / 2 + w * 0.04, y, w * 0.44, h); fs(q, o.shutter, lw); q.strokeStyle = 'rgba(0,0,0,.18)'; q.lineWidth = 1.5; for (let k = 6; k < h; k += 7) { line(q, cx - w / 2 - w * 0.46, y + k, cx - w / 2 - w * 0.06, y + k, 1.2, 'rgba(0,0,0,.18)'); line(q, cx + w / 2 + w * 0.06, y + k, cx + w / 2 + w * 0.46, y + k, 1.2, 'rgba(0,0,0,.18)'); } }
    q.beginPath();
    if (o.arch) { q.moveTo(cx - w / 2, y + h); q.lineTo(cx - w / 2, y + w / 2); q.arc(cx, y + w / 2, w / 2, PI, 0); q.lineTo(cx + w / 2, y + h); q.closePath(); }
    else q.rect(cx - w / 2, y, w, h);
    fs(q, '#fbf4e6', lw);
    const p = w * 0.12;
    q.beginPath();
    if (o.arch) { q.moveTo(cx - w / 2 + p, y + h - p); q.lineTo(cx - w / 2 + p, y + w / 2); q.arc(cx, y + w / 2, w / 2 - p, PI, 0); q.lineTo(cx + w / 2 - p, y + h - p); q.closePath(); }
    else q.rect(cx - w / 2 + p, y + p, w - 2 * p, h - 2 * p);
    q.fillStyle = o.lit ? '#ffd27e' : lg(q, 0, y, 0, y + h, [[0, '#8fa6c0'], [1, '#5f7490']]); q.fill();
    if (!o.lit) { q.save(); q.clip(); q.fillStyle = 'rgba(255,255,255,.3)'; q.beginPath(); q.moveTo(cx - w / 2, y + h * 0.7); q.lineTo(cx - w / 2 + w * 0.5, y); q.lineTo(cx - w / 2 + w * 0.75, y); q.lineTo(cx - w / 2, y + h); q.fill(); q.restore(); }
    line(q, cx, y + p, cx, y + h - p, lw * 0.7, '#fbf4e6'); line(q, cx - w / 2 + p, y + h * 0.55, cx + w / 2 - p, y + h * 0.55, lw * 0.7, '#fbf4e6');
    q.beginPath(); q.rect(cx - w / 2 - 5, y + h, w + 10, 7); fs(q, '#efe4d0', lw * 0.7);
    if (o.box) {
      q.beginPath(); q.rect(cx - w / 2 - 2, y + h + 7, w + 4, 14); fs(q, '#8a5a3a', lw * 0.7);
      const R = rng(o.seed || 1);
      for (let i = 0; i < 7; i++) { q.fillStyle = '#4f8a4a'; q.beginPath(); circ(q, cx - w / 2 + R() * w, y + h + 4 - R() * 6, 5 + R() * 3); q.fill(); }
      for (let i = 0; i < 6; i++) { q.fillStyle = R() < 0.6 ? '#e2574c' : '#f08aa8'; q.beginPath(); circ(q, cx - w / 2 + 4 + R() * (w - 8), y + h + 2 - R() * 10, 3.5 + R() * 2); q.fill(); }
    }
  }
  /** 木地板 */
  function planks(q, x, y, w, h, c0, c1, seed, rows = 7) {
    q.fillStyle = lg(q, 0, y, 0, y + h, [[0, c0], [1, c1]]); q.fillRect(x, y, w, h);
    const R = rng(seed);
    q.strokeStyle = 'rgba(58,30,20,.28)'; q.lineWidth = 2;
    let yy = y;
    for (let r = 0; r < rows; r++) {
      const rh = (h / rows) * (0.75 + (r / rows) * 0.5);
      q.beginPath(); q.moveTo(x, yy); q.lineTo(x + w, yy); q.stroke();
      let xx = x - R() * 200;
      while (xx < x + w) { xx += 220 + R() * 260; q.beginPath(); q.moveTo(xx, yy); q.lineTo(xx, yy + rh); q.stroke(); }
      q.globalAlpha = 0.08; q.fillStyle = R() < 0.5 ? '#fff' : '#000'; q.fillRect(x, yy, w, rh); q.globalAlpha = 1;
      yy += rh;
    }
  }
  /** 屋外的景（窗里看出去）：天空 + 远处屋顶（静态，早晨） */
  function viewOut(q, x, y, w, h, pal = 'morning', seed = 3) {
    q.fillStyle = lg(q, 0, y, 0, y + h, SKIES[pal]); q.fillRect(x, y, w, h);
    const R = rng(seed);
    q.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 3; i++) { const cx = x + R() * w, cy = y + h * (0.1 + R() * 0.25); q.beginPath(); blob(q, cx, cy, w * (0.1 + R() * 0.08), h * 0.035, seed + i, 8, 0.25); q.fill(); }
    q.save(); q.beginPath(); q.rect(x, y, w, h); q.clip();
    q.save(); q.translate(x, y + h * 0.74); const sc = w / 1500; q.scale(sc, sc);
    skyline(q, 1500, 0, seed + 5, TOWN[pal] || TOWN.morning, { towerX: seed % 2 ? 980 : null });
    q.restore();
    // 近处的红瓦屋顶
    let xx = x - w * 0.1;
    while (xx < x + w) {
      const rw = w * (0.24 + R() * 0.16), rh = rw * (0.38 + R() * 0.2), by = y + h * (0.86 + R() * 0.06);
      q.beginPath(); q.moveTo(xx, by + h); q.lineTo(xx, by); q.lineTo(xx + rw / 2, by - rh); q.lineTo(xx + rw, by); q.lineTo(xx + rw, by + h); q.closePath();
      q.fillStyle = pal === 'night' ? '#2a2a48' : R() < 0.5 ? '#c0705a' : '#a85a4a'; q.fill(); q.lineWidth = max(1, w * 0.005); q.strokeStyle = 'rgba(58,38,32,.6)'; q.stroke();
      if (R() < 0.6) { q.fillStyle = pal === 'night' ? '#20203a' : '#8a4a3a'; q.fillRect(xx + rw * 0.66, by - rh * 0.7, rw * 0.08, rh * 0.5); }
      xx += rw * (0.7 + R() * 0.25);
    }
    q.restore();
  }
  /** 室内的窗（带窗框、窗台），景色在 viewOut；arch：拱顶 */
  function roomWindow(q, x, y, w, h, o = {}) {
    const lw = o.lw ?? 5;
    const pathWin = (inset) => { q.beginPath(); const X = x + inset, Y = y + inset, W = w - inset * 2, H = h - inset * 2; if (o.arch) { q.moveTo(X, Y + H); q.lineTo(X, Y + W * 0.28); q.quadraticCurveTo(X + W / 2, Y - W * 0.12, X + W, Y + W * 0.28); q.lineTo(X + W, Y + H); q.closePath(); } else q.rect(X, Y, W, H); };
    pathWin(-16); fs(q, o.frame || '#f6eee0', lw);
    pathWin(4); q.save(); q.clip(); viewOut(q, x, y - 20, w, h + 20, o.view || 'morning', o.seed || 3);
    q.fillStyle = 'rgba(255,255,255,.14)'; q.beginPath(); q.moveTo(x, y + h * 0.8); q.lineTo(x + w * 0.45, y); q.lineTo(x + w * 0.62, y); q.lineTo(x, y + h); q.fill();
    q.restore();
    pathWin(4); fs(q, null, lw * 0.8);
    q.fillStyle = o.frame || '#f6eee0';
    q.fillRect(x + w / 2 - 7, y, 14, h); q.fillRect(x, y + h * 0.42, w, 12);
    q.beginPath(); q.rect(x + w / 2 - 7, y, 14, h); q.rect(x, y + h * 0.42, w, 12); fs(q, null, 2.5, 'rgba(58,38,32,.5)');
    // 窗台
    q.beginPath(); q.rect(x - 34, y + h, w + 68, 26); fs(q, o.sill || '#c79a66', lw);
    q.fillStyle = 'rgba(0,0,0,.18)'; q.fillRect(x - 30, y + h + 26, w + 60, 12);
  }
  /** 窗帘（一侧，挽起来的） */
  function drape(q, x, y, w, h, col, side = 1) {
    q.beginPath();
    q.moveTo(x, y); q.lineTo(x + w, y);
    q.bezierCurveTo(x + w - side * 10, y + h * 0.3, x + w * 0.35, y + h * 0.5, x + w * 0.5, y + h * 0.62);
    q.bezierCurveTo(x + w * 0.62, y + h * 0.75, x + w * 0.9, y + h * 0.9, x + w * 0.8, y + h);
    q.lineTo(x, y + h); q.closePath();
    fs(q, col, 4);
    q.save(); q.clip(); q.strokeStyle = 'rgba(0,0,0,.14)'; q.lineWidth = 6; for (let i = 1; i < 5; i++) { q.beginPath(); q.moveTo(x + (w / 5) * i, y); q.quadraticCurveTo(x + (w / 5) * i - 10, y + h * 0.5, x + (w / 5) * i * 0.6, y + h); q.stroke(); } q.restore();
    q.beginPath(); rrect(q, x + w * 0.3, y + h * 0.58, w * 0.42, 16, 6); fs(q, '#c98a3a', 3);
  }

  /* =========================================================
   * 序：厨房窗台上的收音机（黎明）
   * ========================================================= */
  reg('win-dawn', VW, VH, (q, w, h) => {
    // 墙
    q.fillStyle = lg(q, 0, 0, 0, h, [[0, '#e6cfae'], [1, '#d4b690']]); q.fillRect(0, 0, w, h);
    speckle(q, 0, 0, w, h, 1400, 5, ['#fff', '#8a6040'], 0.06, 4);
    // 窗洞（透明：天空在后面画）
    const X0 = 300, X1 = 1620, Y0 = 60, Y1 = 790;
    const win = (inset) => { q.beginPath(); q.moveTo(X0 + inset, Y1); q.lineTo(X0 + inset, 170 + inset); q.quadraticCurveTo(960, Y0 - 50 + inset * 1.3, X1 - inset, 170 + inset); q.lineTo(X1 - inset, Y1); q.closePath(); };
    win(-30); fs(q, '#f4ecde', 6);
    win(8); q.save(); q.globalCompositeOperation = 'destination-out'; q.fill(); q.restore();
    win(8); fs(q, null, 5);
    // 玻璃反光（很淡）
    q.save(); win(8); q.clip(); q.globalAlpha = 0.07; q.fillStyle = '#fff';
    q.beginPath(); q.moveTo(380, 790); q.lineTo(820, 60); q.lineTo(960, 60); q.lineTo(520, 790); q.fill();
    q.beginPath(); q.moveTo(1080, 790); q.lineTo(1400, 60); q.lineTo(1450, 60); q.lineTo(1130, 790); q.fill();
    q.restore();
    // 窗棂
    q.fillStyle = '#f4ecde';
    q.beginPath(); q.rect(947, 40, 26, 750); q.rect(300, 372, 1320, 24); fs(q, '#f4ecde', 4);
    // 窗帘
    drape(q, 170, 20, 250, 800, '#f1d38a', 1);
    q.save(); q.translate(w, 0); q.scale(-1, 1); drape(q, 170, 20, 250, 800, '#f1d38a', 1); q.restore();
    q.beginPath(); q.rect(140, 6, 1640, 22); fs(q, '#9a6a44', 4);
    // 窗台
    q.beginPath(); q.rect(250, 790, 1420, 40); fs(q, lg(q, 0, 790, 0, 830, [[0, '#d3a877'], [1, '#b78756']]), 5);
    q.beginPath(); q.rect(270, 830, 1380, 30); fs(q, '#9e7248', 4);
    q.fillStyle = 'rgba(40,20,20,.22)'; q.fillRect(270, 860, 1380, 28);
    // 窗台上的东西：罗勒、插着黄花的牛奶瓶、咖啡杯
    // 罗勒
    q.beginPath(); q.moveTo(420, 792); q.lineTo(410, 720); q.lineTo(530, 720); q.lineTo(520, 792); q.closePath(); fs(q, '#c8704a', 4);
    q.beginPath(); q.rect(402, 710, 136, 18); fs(q, '#b0603e', 4);
    for (let i = 0; i < 14; i++) { const R = rng(40 + i); const lx = 430 + R() * 80, ly = 700 - R() * 90; q.beginPath(); q.ellipse(lx, ly, 22, 12, (R() - 0.5) * 2, 0, TAU); fs(q, R() < 0.5 ? '#5f9a4c' : '#7ab45a', 3); }
    // 牛奶瓶 + 黄花
    q.beginPath(); q.moveTo(680, 792); q.lineTo(676, 700); q.quadraticCurveTo(676, 670, 700, 660); q.lineTo(700, 630); q.lineTo(744, 630); q.lineTo(744, 660); q.quadraticCurveTo(768, 670, 768, 700); q.lineTo(764, 792); q.closePath();
    fs(q, 'rgba(220,240,245,.8)', 4);
    q.fillStyle = 'rgba(255,255,255,.5)'; q.fillRect(690, 690, 8, 90);
    for (let i = 0; i < 7; i++) {
      const R = rng(60 + i); const fx = 722 + (R() - 0.5) * 150, fy = 540 - R() * 110;
      q.beginPath(); q.moveTo(722, 650); q.quadraticCurveTo(722 + (fx - 722) * 0.3, 600, fx, fy); q.lineWidth = 4; q.strokeStyle = '#5f8a44'; q.stroke();
      for (let p = 0; p < 6; p++) { const a = (p / 6) * TAU + i; q.beginPath(); q.ellipse(fx + cos(a) * 12, fy + sin(a) * 12, 11, 6, a, 0, TAU); fs(q, '#ffd23e', 2.5); }
      q.beginPath(); circ(q, fx, fy, 7); fs(q, '#e08a1e', 2.5);
    }
    // 咖啡杯
    q.beginPath(); q.ellipse(1500, 792, 86, 14, 0, 0, TAU); fs(q, '#f1ece4', 4);
    q.beginPath(); q.moveTo(1446, 690); q.lineTo(1554, 690); q.quadraticCurveTo(1552, 786, 1500, 788); q.quadraticCurveTo(1448, 786, 1446, 690); q.closePath(); fs(q, '#f6f0e6', 4.5);
    q.beginPath(); q.arc(1560, 728, 22, -PI / 2, PI / 2); q.lineWidth = 9; q.strokeStyle = INK; q.stroke(); q.lineWidth = 4; q.strokeStyle = '#f6f0e6'; q.stroke();
    q.fillStyle = '#6a3a22'; q.beginPath(); q.ellipse(1500, 692, 52, 9, 0, 0, TAU); q.fill();
    q.fillStyle = RED; q.fillRect(1452, 720, 96, 10);
  });

  /* =========================================================
   * 房间（1920×1080，单独做近景；也缩小后拼进剖面房子里）
   * ========================================================= */
  let VIEW = 'morning'; // 房间窗外的景（夜里的版本改成 'night'）
  /** 厨房（一楼）：窗台上是那台收音机 */
  function roomKitchen(q) {
    q.fillStyle = lg(q, 0, 0, 0, 880, [[0, '#f3e2c4'], [1, '#e7cfa8']]); q.fillRect(0, 0, 1920, 880);
    speckle(q, 0, 0, 1920, 880, 900, 21, ['#fff', '#a07050'], 0.05, 4);
    // 天花梁
    q.fillStyle = '#7a4e32'; q.fillRect(0, 0, 1920, 46); q.fillStyle = 'rgba(0,0,0,.25)'; q.fillRect(0, 46, 1920, 8);
    for (let x = 60; x < 1920; x += 260) { q.beginPath(); q.rect(x, 0, 36, 62); fs(q, '#8a5a3a', 3); }
    // 墙裙（木）
    q.beginPath(); q.rect(0, 640, 1000, 240); fs(q, '#c89a68', 4);
    for (let x = 30; x < 1000; x += 140) { q.beginPath(); rrect(q, x, 666, 110, 180, 8); fs(q, null, 3, 'rgba(58,38,32,.35)'); }
    // 瓷砖
    q.save(); q.beginPath(); q.rect(1000, 330, 920, 300); q.clip();
    q.fillStyle = '#eef0ec'; q.fillRect(1000, 330, 920, 300);
    for (let yy = 330; yy < 640; yy += 50) for (let xx = 1000; xx < 1920; xx += 50) { q.strokeStyle = 'rgba(90,110,130,.35)'; q.lineWidth = 2; q.strokeRect(xx, yy, 50, 50); if (((xx + yy) / 50) % 2 === 0) { q.fillStyle = 'rgba(80,120,170,.35)'; q.beginPath(); q.moveTo(xx + 25, yy + 12); q.lineTo(xx + 38, yy + 25); q.lineTo(xx + 25, yy + 38); q.lineTo(xx + 12, yy + 25); q.fill(); } }
    q.restore();
    // 窗
    roomWindow(q, 380, 150, 480, 410, { arch: true, view: VIEW, seed: 5 });
    q.beginPath(); q.rect(340, 132, 560, 18); fs(q, '#9a6a44', 3);
    // 格子窗帘（上沿）
    q.save(); q.beginPath(); q.moveTo(356, 150); for (let i = 0; i <= 12; i++) q.quadraticCurveTo(356 + i * 44 - 22, 214, 356 + i * 44, 196); q.lineTo(884, 150); q.closePath(); q.fillStyle = '#fbf3e6'; q.fill(); q.clip();
    q.fillStyle = 'rgba(226,87,76,.55)'; for (let xx = 356; xx < 900; xx += 24) q.fillRect(xx, 150, 12, 80); for (let yy = 150; yy < 230; yy += 24) q.fillRect(356, yy, 540, 12);
    q.restore();
    // 日历
    q.save(); q.translate(960, 250); q.rotate(0.03);
    q.beginPath(); q.rect(-70, -80, 140, 170); fs(q, '#fffaf0', 3.5); q.fillStyle = RED; q.fillRect(-70, -80, 140, 36);
    E.text(q, '六月', 0, -52, { size: 24, color: '#fff', weight: 700 });
    for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) { q.fillStyle = 'rgba(58,38,32,.5)'; q.fillRect(-58 + c * 20, -30 + r * 22, 10, 8); }
    q.beginPath(); q.ellipse(-8 + 40, -26 + 66, 16, 12, 0, 0, TAU); q.lineWidth = 3; q.strokeStyle = RED; q.stroke();
    q.restore();
    // 吊架上的铜锅
    line(q, 1080, 290, 1560, 290, 6, '#6a4a3a');
    for (const [px, pr] of [[1150, 48], [1290, 38], [1420, 56]]) { line(q, px, 290, px, 318, 3, INK); q.beginPath(); circ(q, px, 318 + pr, pr); fs(q, lg(q, px - pr, 0, px + pr, 0, [[0, '#e8a060'], [0.5, '#c86a3a'], [1, '#8a4222']]), 4); q.beginPath(); rrect(q, px - 8, 300, 16, 22, 5); fs(q, '#5a3a2a', 3); }
    // 挂钟
    q.beginPath(); circ(q, 1750, 190, 58); fs(q, '#fbf6ea', 5); q.beginPath(); circ(q, 1750, 190, 48); fs(q, null, 2, 'rgba(58,38,32,.4)');
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; line(q, 1750 + cos(a) * 40, 190 + sin(a) * 40, 1750 + cos(a) * 46, 190 + sin(a) * 46, 3, INK); }
    line(q, 1750, 190, 1750 + cos(-PI / 2 + 7.5 / 12 * TAU) * 26, 190 + sin(-PI / 2 + 7.5 / 12 * TAU) * 26, 5, INK); line(q, 1750, 190, 1750 + cos(-PI / 2 + 0.5 * TAU) * 38, 190 + sin(-PI / 2 + 0.5 * TAU) * 38, 3.5, INK);
    // 台面与橱柜
    q.beginPath(); q.rect(1000, 610, 920, 30); fs(q, '#e9ddc8', 4);
    q.beginPath(); q.rect(1010, 640, 900, 240); fs(q, '#7fa8a0', 4);
    for (let x = 1030; x < 1900; x += 150) { q.beginPath(); rrect(q, x, 660, 130, 196, 8); fs(q, '#8fb8ae', 3); q.beginPath(); circ(q, x + 108, 758, 7); fs(q, '#e8c064', 2); }
    // 炉子
    q.beginPath(); q.rect(1180, 560, 300, 50); fs(q, '#33303a', 4);
    q.beginPath(); q.rect(1170, 640, 320, 240); fs(q, '#3c3842', 4);
    q.beginPath(); rrect(q, 1200, 680, 260, 150, 12); fs(q, '#4c4852', 3.5); q.fillStyle = '#e8c064'; q.fillRect(1250, 700, 160, 8);
    q.fillStyle = RED; q.beginPath(); circ(q, 1230, 660, 7); circ(q, 1270, 660, 7); circ(q, 1390, 660, 7); circ(q, 1430, 660, 7); q.fill();
    // 水壶
    q.beginPath(); q.moveTo(1250, 560); q.quadraticCurveTo(1240, 480, 1310, 472); q.quadraticCurveTo(1380, 480, 1370, 560); q.closePath(); fs(q, '#e2574c', 4.5);
    q.beginPath(); q.moveTo(1368, 530); q.quadraticCurveTo(1400, 520, 1418, 486); q.lineWidth = 12; q.strokeStyle = INK; q.stroke(); q.lineWidth = 6; q.strokeStyle = '#e2574c'; q.stroke();
    q.beginPath(); q.arc(1310, 478, 40, PI * 1.1, PI * 1.9); q.lineWidth = 7; q.strokeStyle = INK; q.stroke();
    q.fillStyle = 'rgba(255,255,255,.4)'; q.beginPath(); q.ellipse(1282, 510, 10, 22, 0.3, 0, TAU); q.fill();
    // 调料架
    q.beginPath(); q.rect(1540, 420, 330, 16); fs(q, '#9a6a44', 3);
    for (let i = 0; i < 6; i++) { const jx = 1560 + i * 52; q.beginPath(); rrect(q, jx, 360, 40, 60, 8); fs(q, ['#f2c46a', '#c86a4a', '#8ab06a', '#e8e0d0', '#b4583e', '#f0d890'][i], 3); q.beginPath(); rrect(q, jx - 2, 350, 44, 14, 4); fs(q, '#6a4a3a', 2.5); }
    // 地板
    planks(q, 0, 880, 1920, 200, '#b98556', '#8e5c38', 31, 5);
    q.fillStyle = 'rgba(0,0,0,.25)'; q.fillRect(0, 880, 1920, 10);
    // 窗光落在地上
    q.save(); q.globalCompositeOperation = 'lighter'; q.fillStyle = 'rgba(255,220,160,.12)'; q.beginPath(); q.moveTo(380, 880); q.lineTo(860, 880); q.lineTo(1100, 1080); q.lineTo(520, 1080); q.fill(); q.restore();
  }
  /** 餐椅的椅背（在坐着的人后面画）：两根立柱 + 弧形的顶横档 + 两根竖板；x 椅子中心，top 靠背顶，bot 画到哪（被桌子挡住的地方不用画） */
  function chairBack(q, x, top, bot, w = 150, col = '#9a6a44') {
    const pw = w * 0.14, dkc = '#7a4e30';
    q.beginPath(); rrect(q, x - w / 2, top, pw, bot - top, 5); rrect(q, x + w / 2 - pw, top, pw, bot - top, 5); fs(q, dkc, 3.5);
    q.beginPath(); rrect(q, x - w * 0.2, top + 24, w * 0.12, bot - top - 24, 4); rrect(q, x + w * 0.08, top + 24, w * 0.12, bot - top - 24, 4); fs(q, col, 3);
    q.beginPath(); q.moveTo(x - w / 2 - 8, top + 30); q.quadraticCurveTo(x, top - 16, x + w / 2 + 8, top + 30); q.lineTo(x + w / 2 + 8, top + 4); q.quadraticCurveTo(x, top - 42, x - w / 2 - 8, top + 4); q.closePath(); fs(q, col, 3.5);
    q.fillStyle = 'rgba(255,230,190,.25)'; q.fillRect(x - w / 2 + 3, top + 8, 4, bot - top - 12);
  }
  /** 从背后看的书桌椅（画在坐着的人前面）：四条腿、座面的边、靠背（两根立柱 + 横档 + 竖板）；x 中心，seatY 座面，fy 地面 */
  function deskChair(q, x, seatY, fy) {
    const w = 190, col = '#7a4a2c', dkc = '#5a3420';
    q.beginPath(); q.rect(x - w / 2 + 8, seatY + 20, 18, fy - seatY - 20); q.rect(x + w / 2 - 26, seatY + 20, 18, fy - seatY - 20); fs(q, dkc, 3.5);
    q.beginPath(); rrect(q, x - w / 2 - 4, seatY, w + 8, 24, 6); fs(q, col, 3.5);
    q.beginPath(); rrect(q, x - w / 2, seatY - 170, 22, 180, 5); rrect(q, x + w / 2 - 22, seatY - 170, 22, 180, 5); fs(q, dkc, 3.5);
    q.beginPath(); rrect(q, x - w * 0.16, seatY - 130, 20, 130, 4); rrect(q, x + w * 0.16 - 20, seatY - 130, 20, 130, 4); fs(q, col, 3);
    q.beginPath(); q.moveTo(x - w / 2 - 8, seatY - 130); q.quadraticCurveTo(x, seatY - 152, x + w / 2 + 8, seatY - 130); q.lineTo(x + w / 2 + 8, seatY - 166); q.quadraticCurveTo(x, seatY - 190, x - w / 2 - 8, seatY - 166); q.closePath(); fs(q, col, 3.5);
    q.fillStyle = 'rgba(255,220,170,.18)'; q.fillRect(x - w / 2 + 4, seatY - 164, 5, 150);
    q.beginPath(); q.rect(x - w / 2 + 8, fy - 64, w - 16, 10); fs(q, dkc, 2.5);
  }
  /** 夜里的书房（房间坐标）：妈妈背对着我们坐在书桌前，台灯在她前面——暖色的轮廓光；stop：停下笔 */
  function momAtDesk(q, t, stop) {
    const X = 960, FY = 905, SEAT = 150;
    shadow(q, X, FY + 2, 140, 0.4);
    who(q, 'magna', { x: X, y: FY, h: 600, pose: 'sit', seat: SEAT, desk: FY - 646, arms: stop ? undefined : 'write', view: 'back', t, outfit: 'home', shadow: false, rim: '255,200,130', rimDir: -0.7, rimW: 0.9, rimGlow: 0 });
    deskChair(q, X, FY - SEAT, FY);
  }
  /**
   * 书房里的高背扶手椅（画在坐着的人后面；人朝右 3/4 坐着）：高靠背从她肩后露出来，远侧的扶手、坐垫前沿和椅脚在身体两边露出来。
   * x 为人的髋，seatY 座面，fy 地面
   */
  function armchair(q, x, seatY, fy) {
    const c0 = '#7a3a46', c1 = '#5e2a36', wood = '#5e3a22';
    // 靠背（带一点翼）
    q.beginPath(); q.moveTo(x - 150, seatY + 10); q.lineTo(x - 158, seatY - 210); q.quadraticCurveTo(x - 150, seatY - 300, x - 40, seatY - 306); q.quadraticCurveTo(x + 70, seatY - 300, x + 78, seatY - 214); q.lineTo(x + 70, seatY + 10); q.closePath();
    fs(q, lg(q, x - 150, 0, x + 80, 0, [[0, c1], [0.5, c0], [1, c1]]), 4);
    q.strokeStyle = 'rgba(255,220,200,.16)'; q.lineWidth = 4; for (const dx of [-100, -40, 20]) { q.beginPath(); q.moveTo(x + dx, seatY - 280); q.lineTo(x + dx + 4, seatY - 20); q.stroke(); }
    // 远侧扶手（左）
    q.beginPath(); rrect(q, x - 176, seatY - 104, 64, 150, 26); fs(q, c1, 4);
    // 坐垫与底座（前沿在右，比座面低一点，露在膝下）
    q.beginPath(); rrect(q, x - 150, seatY - 8, 260, 44, 16); fs(q, c0, 4);
    q.beginPath(); q.rect(x - 150, seatY + 30, 256, fy - seatY - 58); fs(q, c1, 4);
    q.fillStyle = 'rgba(0,0,0,.18)'; q.fillRect(x - 150, seatY + 30, 256, 10);
    for (const lx of [x - 140, x + 84]) { q.beginPath(); q.moveTo(lx, fy - 28); q.lineTo(lx + 16, fy - 28); q.lineTo(lx + 12, fy); q.lineTo(lx + 4, fy); q.closePath(); fs(q, wood, 3); }
  }
  /**
   * 3/4 侧面看的木椅（画在坐着的人后面：人朝右坐，椅背在她身后左边）：x 为人的髋，seatY 座面，fy 地面。
   * 座面是一块略斜的板（前沿在右），四条腿落地，椅背从座面后沿往上
   */
  function sideChair(q, x, seatY, fy, col = '#8a5a34') {
    const dkc = '#5e3a22', bx = x - 78, fx = x + 70;
    q.beginPath(); q.rect(bx - 4, seatY + 10, 16, fy - seatY - 10); q.rect(fx - 30, seatY + 14, 15, fy - seatY - 22); fs(q, dkc, 3); // 远侧的两条腿
    q.beginPath(); q.rect(bx - 2, seatY - 176, 18, 186); fs(q, dkc, 3.5); // 椅背立柱
    q.beginPath(); q.moveTo(bx - 6, seatY - 176); q.quadraticCurveTo(bx + 34, seatY - 190, bx + 44, seatY - 170); q.lineTo(bx + 44, seatY - 140); q.quadraticCurveTo(bx + 30, seatY - 158, bx - 6, seatY - 146); q.closePath(); fs(q, col, 3);
    for (const dy of [-120, -86]) { q.beginPath(); q.rect(bx + 10, seatY + dy, 30, 10); fs(q, col, 2.5); }
    q.beginPath(); q.moveTo(bx - 10, seatY); q.lineTo(fx - 6, seatY - 6); q.lineTo(fx + 10, seatY + 12); q.lineTo(bx + 4, seatY + 20); q.closePath(); fs(q, col, 3.5); // 座面
    q.beginPath(); q.rect(bx + 6, seatY + 18, 16, fy - seatY - 18); q.rect(fx - 8, seatY + 10, 16, fy - seatY - 10); fs(q, col, 3.5); // 近侧的两条腿
    q.beginPath(); q.moveTo(bx + 14, fy - 70); q.lineTo(fx, fy - 76); fs(q, null, 5, dkc);
  }
  /** 厨房的餐桌（前景，单独一层：坐在桌后的人要被它挡住）。晚饭时铺上桌布：一直垂到画面下沿，桌子后面的腿和椅子都看不见 */
  function kitchenTable(q, dinner = false) {
    // 桌子（前景）
    q.beginPath(); q.rect(80, 770, 900, 44); fs(q, '#b07a4a', 5);
    q.beginPath(); q.rect(110, 814, 36, 266); q.rect(910, 814, 36, 266); fs(q, '#8a5a34', 4);
    q.fillStyle = 'rgba(0,0,0,.2)'; q.fillRect(80, 814, 900, 12);
    if (dinner) {
      // 桌布：奶白色，桌角处垂成圆弧，下摆一道红条和扇形的花边，竖着几道褶
      q.beginPath(); q.moveTo(64, 762); q.lineTo(996, 762); q.quadraticCurveTo(1004, 764, 1002, 782); q.lineTo(1008, 1034);
      for (let i = 0; i <= 18; i++) { const xx = 1008 - i * (944 / 18); q.quadraticCurveTo(xx - 944 / 36, 1052, xx - 944 / 18, 1034); }
      q.lineTo(58, 782); q.quadraticCurveTo(56, 764, 64, 762); q.closePath();
      fs(q, lg(q, 0, 762, 0, 1050, [[0, '#fbf3e4'], [0.5, '#f1e4cc'], [1, '#e2d0b0']]), 5);
      q.save(); q.clip();
      q.strokeStyle = 'rgba(120,80,50,.16)'; q.lineWidth = 5; for (let x = 150; x < 1000; x += 118) { q.beginPath(); q.moveTo(x, 790); q.quadraticCurveTo(x - 10, 900, x + 6, 1040); q.stroke(); }
      q.fillStyle = 'rgba(226,87,76,.8)'; q.fillRect(50, 992, 970, 16); q.fillStyle = 'rgba(226,87,76,.45)'; q.fillRect(50, 1014, 970, 5);
      q.fillStyle = 'rgba(255,255,255,.35)'; q.fillRect(58, 766, 950, 7);
      q.fillStyle = 'rgba(80,40,30,.14)'; q.fillRect(58, 790, 950, 16);
      q.restore();
      // 桌布下露出来的两只桌脚
      q.beginPath(); q.rect(110, 1046, 36, 40); q.rect(910, 1046, 36, 40); fs(q, '#8a5a34', 4);
      // 桌上：一小篮面包（放在阿黛尔和妈妈之间，矮矮的，不挡脸）
      q.beginPath(); q.moveTo(662, 770); q.lineTo(672, 736); q.lineTo(758, 736); q.lineTo(768, 770); q.closePath(); fs(q, '#c8964e', 3.5);
      q.strokeStyle = 'rgba(90,50,20,.4)'; q.lineWidth = 2; for (let i = 0; i < 5; i++) { q.beginPath(); q.moveTo(672 + i * 22, 738); q.lineTo(668 + i * 24, 768); q.stroke(); }
      for (const [bx, by, r] of [[690, 732, 20], [722, 726, 22], [750, 734, 18]]) { q.beginPath(); ell(q, bx, by, r, r * 0.62, -0.2); fs(q, '#e0a050', 3); }
    } else {
      // 桌上：面包板
      q.beginPath(); q.ellipse(300, 770, 110, 14, 0, 0, TAU); fs(q, '#d6a46a', 3.5);
      q.beginPath(); q.moveTo(220, 766); q.quadraticCurveTo(230, 700, 300, 698); q.quadraticCurveTo(372, 700, 380, 766); q.closePath(); fs(q, '#d88a3e', 4);
      q.strokeStyle = 'rgba(255,230,180,.6)'; q.lineWidth = 3; for (let i = 0; i < 4; i++) { q.beginPath(); q.moveTo(250 + i * 30, 712); q.lineTo(262 + i * 30, 740); q.stroke(); }
    }
    if (!dinner) {
      q.beginPath(); rrect(q, 440, 700, 60, 70, 10); fs(q, '#c8384a', 3.5); q.beginPath(); rrect(q, 436, 690, 68, 16, 4); fs(q, '#f1e2c4', 3);
      q.beginPath(); q.moveTo(560, 770); q.lineTo(556, 690); q.lineTo(572, 660); q.lineTo(602, 660); q.lineTo(618, 690); q.lineTo(614, 770); q.closePath(); fs(q, '#f6f6f2', 3.5);
    } else {
      // 一小盏烛台
      q.beginPath(); q.ellipse(470, 768, 30, 7, 0, 0, TAU); fs(q, '#c8963a', 3); q.beginPath(); q.rect(462, 716, 16, 50); fs(q, '#fff4dc', 3);
      q.beginPath(); q.moveTo(470, 690); q.quadraticCurveTo(480, 704, 470, 714); q.quadraticCurveTo(460, 704, 470, 690); q.fillStyle = '#ffc860'; q.fill();
    }
    if (!dinner) for (const cx of [700, 820]) { q.beginPath(); q.moveTo(cx - 34, 722); q.lineTo(cx + 34, 722); q.lineTo(cx + 28, 770); q.lineTo(cx - 28, 770); q.closePath(); fs(q, cx === 700 ? '#f4efe2' : '#9ec2d8', 3.5); }
  }
  /** 书房（二楼）：妈妈收拾考察背包；门边的衣架上挂着那件外套 */
  function roomStudy(q) {
    q.fillStyle = lg(q, 0, 0, 0, 880, [[0, '#607e6a'], [1, '#4f6a58']]); q.fillRect(0, 0, 1920, 880);
    q.strokeStyle = 'rgba(232,200,120,.18)'; q.lineWidth = 2; for (let x = 20; x < 1920; x += 44) { q.beginPath(); q.moveTo(x, 0); q.lineTo(x, 700); q.stroke(); }
    q.fillStyle = 'rgba(232,200,120,.16)'; for (let y = 40; y < 700; y += 88) for (let x = 42; x < 1920; x += 88) { q.beginPath(); star4(q, x, y, 7); q.fill(); }
    q.beginPath(); q.rect(0, 700, 1920, 180); fs(q, '#7a4e30', 4);
    for (let x = 20; x < 1920; x += 160) { q.beginPath(); rrect(q, x, 720, 130, 140, 8); fs(q, null, 3, 'rgba(0,0,0,.3)'); }
    q.fillStyle = '#5a3a26'; q.fillRect(0, 0, 1920, 40);
    // 书架（左）
    q.beginPath(); q.rect(40, 90, 520, 790); fs(q, '#6a4228', 5);
    const R = rng(8);
    for (let sy = 120; sy < 850; sy += 150) {
      q.fillStyle = '#4a2c1a'; q.fillRect(60, sy, 480, 130);
      let bx = 64;
      while (bx < 530) { const bw = 18 + R() * 22, bh = 80 + R() * 45; if (bx + bw > 536) break; q.beginPath(); rrect(q, bx, sy + 130 - bh, bw, bh, 3); fs(q, BOOKC[floor(R() * BOOKC.length)], 2.2); q.fillStyle = 'rgba(255,230,160,.5)'; q.fillRect(bx + 3, sy + 138 - bh, bw - 6, 3); bx += bw + 1.5; if (R() < 0.08) bx += 20; }
      q.beginPath(); q.rect(52, sy + 130, 496, 14); fs(q, '#7a4e30', 3);
    }
    // 窗
    roomWindow(q, 780, 150, 380, 430, { arch: true, view: VIEW, seed: 7 });
    drape(q, 690, 110, 150, 560, '#8a3a44', 1); q.save(); q.translate(1940, 0); q.scale(-1, 1); drape(q, 690, 110, 150, 560, '#8a3a44', 1); q.restore();
    q.beginPath(); q.rect(660, 96, 600, 16); fs(q, '#5a3a26', 3);
    // 书桌
    q.beginPath(); q.rect(650, 640, 640, 36); fs(q, '#8a5230', 5);
    q.beginPath(); q.rect(670, 676, 180, 204); q.rect(1090, 676, 180, 204); fs(q, '#7a4628', 4);
    for (const dy of [700, 770, 830]) { q.beginPath(); circ(q, 760, dy + 10, 5); circ(q, 1180, dy + 10, 5); fs(q, '#e8c064', 1.5); }
    // 桌上：摊开的地图、台灯、地球仪、纸
    q.save(); q.translate(900, 630); q.rotate(-0.04); q.beginPath(); q.rect(-150, -14, 300, 20); fs(q, '#efe0bc', 3); q.restore();
    q.beginPath(); q.moveTo(1080, 636); q.lineTo(1100, 560); q.lineTo(1180, 560); q.lineTo(1200, 636); q.closePath(); fs(q, '#3f7a5a', 4);
    line(q, 1140, 560, 1140, 520, 5, '#c89a3a'); q.beginPath(); q.ellipse(1140, 640, 40, 8, 0, 0, TAU); fs(q, '#c89a3a', 3);
    q.beginPath(); circ(q, 740, 580, 52); fs(q, lg(q, 690, 0, 790, 0, [[0, '#8ab6d8'], [1, '#4f7eaa']]), 4); q.fillStyle = '#8ab06a'; q.beginPath(); blob(q, 728, 568, 24, 18, 3); q.fill(); q.beginPath(); blob(q, 762, 600, 14, 10, 4); q.fill();
    q.beginPath(); q.arc(740, 580, 62, PI * 0.8, PI * 2.2); q.lineWidth = 4; q.strokeStyle = '#c89a3a'; q.stroke(); line(q, 740, 642, 740, 636, 6, '#c89a3a');
    // 墙上的乌纳火山地图（红圈）
    q.save(); q.translate(1420, 330); q.rotate(0.02);
    q.beginPath(); q.rect(-150, -120, 300, 230); fs(q, '#f2e6c8', 4);
    q.strokeStyle = 'rgba(120,80,40,.45)'; q.lineWidth = 2;
    for (let i = 0; i < 6; i++) { q.beginPath(); blob(q, 20, 0, 30 + i * 20, 22 + i * 15, 70 + i, 10, 0.12); q.stroke(); }
    q.beginPath(); q.moveTo(-130, 80); q.quadraticCurveTo(-60, 20, -150, -60); q.lineWidth = 5; q.strokeStyle = 'rgba(80,130,190,.6)'; q.stroke();
    q.beginPath(); q.moveTo(8, 12); q.lineTo(20, -10); q.lineTo(32, 12); q.closePath(); fs(q, '#8a4a2a', 2);
    q.beginPath(); q.ellipse(20, 2, 44, 34, -0.2, 0, TAU); q.lineWidth = 5; q.strokeStyle = RED; q.stroke();
    E.text(q, '乌纳', 70, -40, { size: 26, color: '#8a3a2a', weight: 700 });
    q.fillStyle = RED; q.beginPath(); circ(q, -130, -104, 7); circ(q, 130, -104, 7); q.fill();
    q.restore();
    // 火山素描（小）
    q.save(); q.translate(1400, 530); q.rotate(-0.05); q.beginPath(); q.rect(-70, -50, 140, 100); fs(q, '#fbf4e2', 3); q.beginPath(); q.moveTo(-50, 34); q.lineTo(-10, -26); q.lineTo(10, -26); q.lineTo(50, 34); q.lineWidth = 3; q.strokeStyle = '#5a3a2a'; q.stroke(); q.restore();
    // 标本柜（右）
    q.beginPath(); q.rect(1640, 160, 250, 720); fs(q, '#7a4a2c', 5);
    for (let r = 0; r < 4; r++) {
      const sy = 190 + r * 160;
      q.beginPath(); q.rect(1660, sy, 210, 136); fs(q, 'rgba(200,225,230,.35)', 3);
      for (let i = 0; i < 3; i++) { const R2 = rng(90 + r * 3 + i); const rx = 1690 + i * 64, ry = sy + 120; if ((r + i) % 2) jar(q, rx, ry, 0.9, ['#c9a27a', '#8a8a9a', '#b86a4a'][i]); else { q.beginPath(); blob(q, rx, ry - 22, 26, 20, 50 + r * 4 + i, 7, 0.3); fs(q, ['#7a6a6a', '#a0826a', '#4a4250', '#c0a080'][floor(R2() * 4)], 3); } }
      q.beginPath(); q.rect(1652, sy + 136, 226, 12); fs(q, '#6a3e24', 3);
    }
    // 衣架 + 外套
    q.beginPath(); q.rect(1508, 330, 14, 550); fs(q, '#6a4228', 3.5);
    q.beginPath(); q.moveTo(1450, 880); q.lineTo(1580, 880); q.lineTo(1515, 850); q.closePath(); fs(q, '#6a4228', 3.5);
    q.beginPath(); circ(q, 1515, 326, 12); fs(q, '#6a4228', 3);
    coat(q, 1515, 360, 1.25, 0.02);
    // 地板、地毯
    planks(q, 0, 880, 1920, 200, '#a8703f', '#7a4a28', 41, 5);
    q.beginPath(); q.ellipse(1000, 990, 560, 70, 0, 0, TAU); fs(q, '#9a3a3a', 4);
    q.beginPath(); q.ellipse(1000, 990, 500, 54, 0, 0, TAU); fs(q, null, 4, '#e8c064');
    q.beginPath(); q.ellipse(1000, 990, 380, 36, 0, 0, TAU); fs(q, '#b04a44', 0);
  }
  /** 爸爸妈妈的卧室（三楼）：穿衣镜 */
  function roomParents(q) {
    q.fillStyle = lg(q, 0, 0, 0, 880, [[0, '#d2dbe4'], [1, '#bcc8d4']]); q.fillRect(0, 0, 1920, 880);
    q.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 0; x < 1920; x += 96) q.fillRect(x, 0, 40, 880);
    q.fillStyle = 'rgba(200,120,140,.35)'; for (let y = 60; y < 860; y += 90) for (let x = 20 + (y / 90 % 2) * 48; x < 1920; x += 96) { q.beginPath(); circ(q, x, y, 6); q.fill(); }
    q.fillStyle = '#6a5a70'; q.fillRect(0, 0, 1920, 36);
    q.beginPath(); q.rect(0, 830, 1920, 50); fs(q, '#efe8dc', 4);
    // 窗 + 蕾丝窗帘
    roomWindow(q, 720, 160, 360, 420, { view: VIEW, seed: 9, frame: '#fbf6ee' });
    q.save(); q.globalAlpha = 0.55; q.fillStyle = '#fffdf8';
    q.beginPath(); q.moveTo(700, 140); q.lineTo(820, 140); q.quadraticCurveTo(790, 400, 740, 600); q.lineTo(700, 600); q.closePath(); q.fill();
    q.beginPath(); q.moveTo(1100, 140); q.lineTo(980, 140); q.quadraticCurveTo(1010, 400, 1060, 600); q.lineTo(1100, 600); q.closePath(); q.fill();
    q.restore();
    // 全家福
    q.beginPath(); q.rect(250, 230, 190, 150); fs(q, '#b88a4a', 5); q.beginPath(); q.rect(266, 246, 158, 118); fs(q, lg(q, 0, 246, 0, 364, [[0, '#f6e2b8'], [1, '#e8c090']]), 2);
    for (const [fx, fh, fc] of [[300, 80, '#4a3a4a'], [345, 56, '#2e3a5a'], [390, 84, '#e6ddd0']]) { q.fillStyle = fc; q.beginPath(); q.moveTo(fx - 14, 364); q.lineTo(fx - 10, 364 - fh * 0.62); q.lineTo(fx + 10, 364 - fh * 0.62); q.lineTo(fx + 14, 364); q.fill(); q.fillStyle = '#ffe2cf'; q.beginPath(); circ(q, fx, 364 - fh * 0.75, 10); q.fill(); q.fillStyle = '#5a3a2a'; q.beginPath(); q.arc(fx, 364 - fh * 0.78, 11, PI, TAU); q.fill(); }
    q.fillStyle = '#2c2430'; q.beginPath(); circ(q, 330, 356, 8); circ(q, 340, 352, 8); q.fill();
    // 床
    q.beginPath(); rrect(q, 60, 470, 70, 360, 12); fs(q, '#8a5a3a', 4);
    q.beginPath(); q.moveTo(130, 520); q.quadraticCurveTo(200, 470, 300, 500); q.lineTo(300, 830); q.lineTo(130, 830); q.closePath(); fs(q, '#9a6a44', 4);
    q.beginPath(); rrect(q, 150, 640, 520, 170, 20); fs(q, '#f7f3ea', 4);
    q.beginPath(); rrect(q, 320, 610, 360, 190, 24); fs(q, '#e8e0f0', 4);
    q.strokeStyle = 'rgba(120,100,150,.3)'; q.lineWidth = 3; for (let x = 360; x < 680; x += 60) { q.beginPath(); q.moveTo(x, 620); q.lineTo(x - 10, 790); q.stroke(); }
    q.beginPath(); rrect(q, 160, 580, 150, 70, 30); fs(q, '#fffdf6', 4);
    q.beginPath(); rrect(q, 650, 780, 30, 60, 8); fs(q, '#8a5a3a', 3.5);
    // 床头柜 + 台灯 + 眼镜盒
    q.beginPath(); q.rect(700, 700, 120, 130); fs(q, '#9a6a44', 4); q.beginPath(); rrect(q, 716, 730, 88, 30, 5); fs(q, null, 3, 'rgba(0,0,0,.3)');
    q.beginPath(); q.moveTo(730, 630); q.lineTo(790, 630); q.lineTo(776, 580); q.lineTo(744, 580); q.closePath(); fs(q, '#f4d9a0', 3.5); line(q, 760, 630, 760, 690, 5, '#8a6a4a'); q.beginPath(); q.ellipse(760, 698, 30, 7, 0, 0, TAU); fs(q, '#8a6a4a', 3);
    // 衣柜（右）：一扇门开着，挂着衬衫和领带
    q.beginPath(); q.rect(1580, 160, 300, 680); fs(q, '#9a6a44', 5);
    q.beginPath(); q.rect(1600, 190, 130, 630); fs(q, '#4a3428', 3.5);
    line(q, 1606, 230, 1726, 230, 4, '#c8a060');
    for (const [sx, sc] of [[1630, '#f4f1ea'], [1668, '#dfe7ef'], [1706, '#f4f1ea']]) { q.beginPath(); q.moveTo(sx - 18, 244); q.lineTo(sx + 18, 244); q.lineTo(sx + 22, 420); q.lineTo(sx - 22, 420); q.closePath(); fs(q, sc, 3); }
    for (let i = 0; i < 4; i++) { const tx = 1620 + i * 26; q.beginPath(); q.moveTo(tx, 470); q.lineTo(tx + 10, 470); q.lineTo(tx + 12, 590); q.lineTo(tx + 5, 604); q.lineTo(tx - 2, 590); q.closePath(); fs(q, i === 1 ? TIE : ['#3f5a8a', TIE, '#4a6a4a', '#7a4a6a'][i], 2.5); }
    line(q, 1606, 466, 1726, 466, 4, '#c8a060');
    q.beginPath(); q.rect(1740, 190, 124, 630); fs(q, '#a8784e', 3.5);
    q.beginPath(); rrect(q, 1758, 220, 88, 560, 10); fs(q, null, 3, 'rgba(0,0,0,.25)');
    q.beginPath(); circ(q, 1754, 500, 6); fs(q, '#e8c064', 2);
    // 穿衣镜（镜面在动态层里画，这里只画框和脚）
    q.beginPath(); q.moveTo(1250, 880); q.lineTo(1290, 800); q.moveTo(1450, 880); q.lineTo(1410, 800); q.lineWidth = 12; q.strokeStyle = INK; q.stroke(); q.lineWidth = 7; q.strokeStyle = '#a8784e'; q.stroke();
    line(q, 1240, 580, 1460, 580, 12, INK); line(q, 1240, 580, 1460, 580, 7, '#a8784e');
    q.beginPath(); q.ellipse(1350, 560, 128, 250, 0, 0, TAU); fs(q, '#b88a5a', 5);
    q.beginPath(); q.ellipse(1350, 560, 110, 232, 0, 0, TAU); q.fillStyle = lg(q, 1240, 330, 1460, 790, [[0, '#e8f0f4'], [0.5, '#b8c8d4'], [1, '#d8e4ea']]); q.fill(); q.lineWidth = 3; q.strokeStyle = INK; q.stroke();
    // 地板
    planks(q, 0, 880, 1920, 200, '#c09064', '#94643e', 51, 5);
    q.beginPath(); q.ellipse(1000, 990, 420, 50, 0, 0, TAU); fs(q, '#8aa0b8', 3.5);
  }
  const MIRROR = [1350, 560, 110, 232];
  /** 阁楼（阿黛尔的房间）：斜屋顶、圆窗、奖章、火山涂鸦、书堆（小羊的床） */
  function roomAttic(q) {
    // 屋顶内侧（斜梁）
    q.fillStyle = '#5a3a2a'; q.fillRect(0, 0, 1920, 880);
    q.strokeStyle = 'rgba(0,0,0,.35)'; q.lineWidth = 3; for (let x = -800; x < 1920; x += 70) { q.beginPath(); q.moveTo(x, 0); q.lineTo(x + 800, 880); q.stroke(); }
    // 山墙（后墙）
    q.beginPath(); q.moveTo(0, 560); q.lineTo(960, 40); q.lineTo(1920, 560); q.lineTo(1920, 880); q.lineTo(0, 880); q.closePath();
    q.fillStyle = lg(q, 0, 40, 0, 880, [[0, '#f6e6cc'], [1, '#e8cfa8']]); q.fill();
    q.save(); q.clip(); speckle(q, 0, 0, 1920, 880, 900, 33, ['#fff', '#a07050'], 0.05, 4);
    // 斜顶上的星星贴纸
    q.fillStyle = '#ffd86a'; const R = rng(12); for (let i = 0; i < 26; i++) { const x = R() * 1920, y = 60 + R() * 500; if (y > 560 - abs(x - 960) * 0.54 + 40) { q.beginPath(); star4(q, x, y, 8 + R() * 6, R()); q.fill(); } }
    q.restore();
    // 斜梁（边上的两根粗梁）
    q.beginPath(); q.moveTo(0, 520); q.lineTo(960, 0); q.lineTo(1920, 520); q.lineTo(1920, 590); q.lineTo(960, 70); q.lineTo(0, 590); q.closePath(); fs(q, '#7a4e34', 5);
    // 圆窗
    const cx = 960, cy = 330, r = 118;
    q.beginPath(); circ(q, cx, cy, r + 22); fs(q, '#f4ecde', 5);
    q.save(); q.beginPath(); circ(q, cx, cy, r); q.clip(); viewOut(q, cx - r, cy - r, r * 2, r * 2, VIEW, 13); q.restore();
    q.beginPath(); circ(q, cx, cy, r); fs(q, null, 4);
    q.fillStyle = '#f4ecde'; q.fillRect(cx - 7, cy - r, 14, r * 2); q.fillRect(cx - r, cy - 7, r * 2, 14);
    q.beginPath(); q.rect(cx - 7, cy - r, 14, r * 2); q.rect(cx - r, cy - 7, r * 2, 14); fs(q, null, 2.5, 'rgba(58,38,32,.5)');
    // 火山涂鸦（贴在墙上）
    q.save(); q.translate(470, 520); q.rotate(-0.06);
    q.beginPath(); q.rect(-90, -70, 180, 140); fs(q, '#fffaf0', 3.5);
    q.beginPath(); q.moveTo(-70, 56); q.lineTo(-18, -24); q.lineTo(18, -24); q.lineTo(70, 56); q.closePath(); fs(q, '#a0704a', 3);
    q.fillStyle = '#ff7a3a'; q.beginPath(); q.moveTo(-18, -24); q.quadraticCurveTo(-30, -60, 0, -58); q.quadraticCurveTo(30, -60, 18, -24); q.fill();
    q.fillStyle = '#ffd23e'; q.beginPath(); circ(q, 56, -44, 14); q.fill();
    q.fillStyle = '#2c2430'; q.beginPath(); circ(q, -52, 44, 9); circ(q, -44, 40, 9); q.fill(); q.fillStyle = '#fff1e6'; q.beginPath(); circ(q, -38, 44, 6); q.fill();
    q.fillStyle = 'rgba(255,255,255,.6)'; q.fillRect(-20, -76, 40, 14);
    q.restore();
    // 奖章（宠物大赛第一名）
    medal(q, 1190, 470, 0.95);
    // 书架（右墙）+ 火山模型
    q.beginPath(); q.rect(1420, 420, 420, 18); fs(q, '#8a5a3a', 3.5);
    let bx = 1440; const R3 = rng(19);
    while (bx < 1640) { const bw = 20 + R3() * 18, bh = 70 + R3() * 40; q.beginPath(); rrect(q, bx, 420 - bh, bw, bh, 3); fs(q, BOOKC[floor(R3() * BOOKC.length)], 2.2); bx += bw + 2; }
    q.beginPath(); q.moveTo(1680, 420); q.lineTo(1730, 350); q.lineTo(1760, 350); q.lineTo(1810, 420); q.closePath(); fs(q, '#8a5a44', 3.5); q.fillStyle = RED; q.beginPath(); q.ellipse(1745, 352, 16, 5, 0, 0, TAU); q.fill();
    // 床（左）：拼布被
    q.beginPath(); rrect(q, 70, 600, 60, 280, 10); fs(q, '#8a5a3a', 4);
    q.beginPath(); rrect(q, 100, 700, 640, 120, 16); fs(q, '#9a6a44', 4);
    q.beginPath(); rrect(q, 120, 640, 180, 70, 28); fs(q, '#fffdf4', 4);
    q.save(); q.beginPath(); rrect(q, 250, 650, 490, 110, 22); q.clip();
    const QC = ['#f2b8a0', '#a8c8e0', '#f4d890', '#b8d8a8', '#e8a0b0', '#f6eadc'];
    for (let yy = 650; yy < 760; yy += 55) for (let xx = 250; xx < 740; xx += 70) { q.fillStyle = QC[((xx + yy * 3) / 5 | 0) % QC.length]; q.fillRect(xx, yy, 70, 55); q.strokeStyle = 'rgba(58,38,32,.2)'; q.lineWidth = 2; q.setLineDash([6, 5]); q.strokeRect(xx + 5, yy + 5, 60, 45); q.setLineDash([]); }
    q.restore();
    q.beginPath(); rrect(q, 250, 650, 490, 110, 22); fs(q, null, 4);
    q.beginPath(); rrect(q, 720, 740, 34, 140, 8); fs(q, '#8a5a3a', 3.5);
    // 床头小柜（闹钟在动态层）
    q.beginPath(); q.rect(780, 760, 120, 120); fs(q, '#a8784e', 4);
    // 书桌（右）
    q.beginPath(); q.rect(1300, 660, 540, 30); fs(q, '#9a6a44', 4.5);
    q.beginPath(); q.rect(1320, 690, 26, 190); q.rect(1794, 690, 26, 190); fs(q, '#8a5a3a', 3.5);
    q.beginPath(); q.moveTo(1740, 660); q.lineTo(1760, 590); q.lineTo(1820, 590); q.lineTo(1836, 660); q.closePath(); fs(q, '#e2574c', 3.5); line(q, 1790, 590, 1790, 560, 4, '#6a4a3a');
    book(q, 1380, 646, 120, 22, '#3e6a4a'); book(q, 1386, 624, 104, 22, '#b0703a', -0.03);
    q.save(); q.translate(1520, 652); q.rotate(0.04); q.beginPath(); q.rect(-60, -8, 120, 10); fs(q, '#fbf4e2', 2.5); q.restore();
    q.beginPath(); rrect(q, 1640, 610, 30, 48, 6); fs(q, '#6a88a8', 3); for (let i = 0; i < 3; i++) line(q, 1648 + i * 7, 612, 1646 + i * 9, 580, 3, ['#e2574c', '#f2c46a', '#3f5a8a'][i]);
    // 椅子
    q.beginPath(); rrect(q, 1470, 560, 20, 320, 6); fs(q, '#8a5a3a', 3.5); q.beginPath(); q.rect(1470, 740, 200, 20); fs(q, '#9a6a44', 3.5); q.beginPath(); q.rect(1650, 760, 18, 120); fs(q, '#8a5a3a', 3);
    // 小羊的书堆（小羊在动态层）
    const S = [[1000, 866, 170, 28, '#3e6a4a'], [1004, 838, 150, 28, '#b0703a'], [996, 810, 164, 28, '#5b4a6b'], [1006, 782, 140, 28, '#8a3a3a'], [1000, 754, 156, 28, '#2f4a5a'], [1004, 726, 136, 28, '#c0543e']];
    for (const [x, y, w, h, c] of S) book(q, x, y, w, h, c, (x - 1000) * 0.004);
    // 地板 + 编织地毯
    planks(q, 0, 880, 1920, 200, '#c4925e', '#98643c', 61, 5);
    q.fillStyle = 'rgba(0,0,0,.25)'; q.fillRect(0, 880, 1920, 10);
    q.beginPath(); q.ellipse(1000, 980, 340, 52, 0, 0, TAU); fs(q, '#e6b070', 4);
    q.beginPath(); q.ellipse(1000, 980, 270, 38, 0, 0, TAU); fs(q, '#d48a5a', 3);
    q.beginPath(); q.ellipse(1000, 980, 180, 24, 0, 0, TAU); fs(q, '#f0cc8a', 3);
    // 纸星星风铃（挂在屋脊）
    line(q, 960, 70, 960, 150, 2, 'rgba(58,38,32,.6)');
    for (let i = 0; i < 5; i++) { const a = -0.7 + i * 0.35, lx = 960 + sin(a) * 120, ly = 180 + cos(a) * 20; line(q, 960, 150, lx, ly - 30, 1.5, 'rgba(58,38,32,.5)'); line(q, lx, ly - 30, lx, ly, 1.5, 'rgba(58,38,32,.5)'); q.beginPath(); star4(q, lx, ly + 10, 14, 0.3); fs(q, ['#ffd86a', '#f6a0a0', '#a0c8f0', '#ffd86a', '#b8e0a0'][i], 2); }
  }
  reg('room-kitchen', VW, VH, roomKitchen);
  reg('kitchen-table', VW, VH, (q) => kitchenTable(q));
  reg('kitchen-table:dinner', VW, VH, (q) => kitchenTable(q, true));
  const kitchenFull = (q) => { roomKitchen(q); kitchenTable(q); };
  reg('room-study', VW, VH, roomStudy);
  reg('room-parents', VW, VH, roomParents);
  reg('room-attic', VW, VH, roomAttic);

  /* ---------- 剖面房子（整栋，早晨 / 夜晚），2400×1620，贴的时候缩到 ≈0.667 ---------- */
  const HOUSE = {
    x0: 758, x1: 1642, g: 1540,
    main: [782, 1358], stair: [1374, 1618],
    floors: { G: [1224, 1524], F1: [908, 1208], F2: [592, 892] }, attic: 576,
    sM: 576 / 1920, sA: 836 / 1920,
  };
  /** 房子里每个房间的变换：room(q, name, fn) 把 1920×1080 的房间画进剖面对应的格子 */
  function roomBox(name) {
    const H = HOUSE;
    if (name === 'attic') { const s = H.sA; return { x: H.main[0], y: H.attic - 880 * s, s, clip: null }; }
    const [y0, y1] = H.floors[name];
    const s = H.sM, x = H.main[0], y = y1 - 880 * s - 18;
    return { x, y, s, clip: [H.main[0], y0, H.main[1] - H.main[0], y1 - y0] };
  }
  const ROOMS = { attic: roomAttic, F2: roomParents, F1: roomStudy, G: kitchenFull };
  function houseDraw(q, w, h, night) {
    const H = HOUSE;
    // 邻居（不剖开）
    const dk = night ? 0.3 : 0;
    townhouse(q, 150, H.g, 560, 1080, 301, { wall: '#e8c4a8', roof: '#6a4a5a', roofType: 'step', night: night ? 0.5 : 0, dark: dk, lw: 4, door: 'door', light: 'left' });
    townhouse(q, 1690, H.g, 580, 1000, 302, { wall: '#c8d8cc', roof: '#5a4a5e', roofType: 'curve', night: night ? 0.5 : 0, dark: dk, lw: 4, door: 'shop', light: 'left' });
    townhouse(q, -380, H.g, 520, 900, 303, { night: night ? 0.5 : 0, dark: dk, lw: 4 });
    townhouse(q, 2290, H.g, 500, 1120, 304, { night: night ? 0.5 : 0, dark: dk, lw: 4 });
    // 屋顶（剖面：厚度 + 瓦）
    const m = 0.5416, peakY = 170;
    const roofY = (x) => peakY + abs(1200 - x) * m;
    q.beginPath(); q.moveTo(700, roofY(700)); q.lineTo(1200, peakY); q.lineTo(1700, roofY(1700)); q.lineTo(1700, roofY(1700) + 44); q.lineTo(1200, peakY + 44); q.lineTo(700, roofY(700) + 44); q.closePath();
    fs(q, '#7a3e30', 5);
    q.save(); q.clip(); q.strokeStyle = 'rgba(0,0,0,.25)'; q.lineWidth = 2; for (let x = 660; x < 1740; x += 22) { q.beginPath(); q.moveTo(x, 100); q.lineTo(x, 700); q.stroke(); } q.restore();
    // 烟囱
    q.beginPath(); q.rect(1420, 180, 60, 150); fs(q, '#9a5a44', 4); q.beginPath(); q.rect(1410, 168, 80, 20); fs(q, '#7a4234', 4);
    // 外墙（剖面，斜线填充）
    const wall = (x, y0, y1, ww) => { q.beginPath(); q.rect(x, y0, ww, y1 - y0); fs(q, '#e9d6b6', 4); q.save(); q.clip(); q.strokeStyle = 'rgba(120,80,50,.35)'; q.lineWidth = 2; for (let yy = y0 - 40; yy < y1; yy += 14) { q.beginPath(); q.moveTo(x, yy + 30); q.lineTo(x + ww, yy); q.stroke(); } q.restore(); };
    // 各房间（先画房间，再盖墙和楼板）
    for (const name of ['G', 'F1', 'F2']) {
      const b = roomBox(name);
      q.save(); q.beginPath(); q.rect(b.clip[0], b.clip[1], b.clip[2], b.clip[3]); q.clip(); q.translate(b.x, b.y); q.scale(b.s, b.s);
      if (night && name === 'G') { roomKitchen(q); kitchenTable(q, true); } else ROOMS[name](q);
      q.restore();
      if (night) nightRoom(q, name, b);
    }
    // 阁楼：屋顶以下
    {
      const b = roomBox('attic');
      q.save(); q.beginPath(); q.moveTo(H.main[0], H.attic); q.lineTo(H.main[0], roofY(H.main[0]) + 44); q.lineTo(1200, peakY + 44); q.lineTo(1618, roofY(1618) + 44); q.lineTo(1618, H.attic); q.closePath(); q.clip();
      q.translate(b.x, b.y); q.scale(b.s, b.s); roomAttic(q); q.restore();
      if (night) nightRoom(q, 'attic', b);
    }
    // 楼梯间（每层两跑）
    for (const name of ['G', 'F1', 'F2']) {
      const [y0, y1] = H.floors[name];
      q.fillStyle = name === 'G' ? '#e8d6b8' : '#efdcc0'; q.fillRect(H.stair[0], y0, H.stair[1] - H.stair[0], y1 - y0);
      q.fillStyle = 'rgba(120,80,50,.08)'; for (let yy = y0; yy < y1; yy += 30) q.fillRect(H.stair[0], yy, 244, 2);
      stairFlight(q, H.stair[0] + 8, y1, H.stair[1] - 10, y1 - 150, 7);
      stairFlight(q, H.stair[1] - 10, y1 - 150, H.stair[0] + 8, y0 - 16, 7, true);
      if (night) { q.fillStyle = 'rgba(20,24,60,.5)'; q.fillRect(H.stair[0], y0, 244, y1 - y0); }
    }
    // 一楼门厅：前门、外套、行李
    {
      const [y0, y1] = H.floors.G;
      q.beginPath(); rrect(q, 1560, y1 - 190, 56, 190, 6); fs(q, '#7a4a2e', 4);
      backpack(q, 1470, y1, 0.36, 0); backpack(q, 1520, y1, 0.3, 0);
    }
    wall(H.x0, roofY(H.x0) + 30, H.g, 24); wall(H.x1 - 24, roofY(H.x1) + 30, H.g, 24);
    wall(H.main[1], H.floors.F2[0], H.g - 16, 16);
    for (const yy of [H.floors.G[1], H.floors.F1[1], H.floors.F2[1], H.attic]) {
      q.beginPath(); q.rect(H.x0, yy, H.x1 - H.x0, 16); fs(q, '#8a5a3a', 4);
      q.fillStyle = 'rgba(255,220,170,.3)'; q.fillRect(H.x0, yy + 2, H.x1 - H.x0, 3);
    }
    // 楼梯开口：楼板上留洞
    for (const yy of [H.floors.G[0] - 16, H.floors.F1[0] - 16, H.floors.F2[0] - 16]) { q.fillStyle = night ? '#2a2a44' : '#e8d6b8'; q.fillRect(H.stair[0] + 4, yy, 110, 16); }
    // 地基 + 街面
    q.beginPath(); q.rect(-400, H.g, 3200, 90); fs(q, '#a8a0a0', 4);
    q.fillStyle = 'rgba(0,0,0,.12)'; for (let x = -400; x < 2800; x += 60) q.fillRect(x, H.g + 8, 2, 70);
    q.beginPath(); q.rect(H.x0 - 10, H.g - 6, H.x1 - H.x0 + 20, 20); fs(q, '#8a8078', 4);
    // 夜里：房子的外壳、屋顶、街面一起压暗（房间和楼梯间已经单独打过光，挖掉不压）
    if (night) {
      q.save(); q.beginPath(); q.rect(-400, -100, 3400, 1800);
      for (const name of ['G', 'F1', 'F2']) { const b = roomBox(name).clip; q.rect(b[0], b[1], b[2], b[3]); q.rect(H.stair[0], b[1], H.stair[1] - H.stair[0], b[3]); }
      q.moveTo(H.main[0], H.attic); q.lineTo(H.main[0], 437); q.lineTo(1200, 214); q.lineTo(1618, 437); q.lineTo(1618, H.attic); q.closePath();
      q.clip('evenodd');
      gradeKeepAlpha(q, [['multiply', '#8a88bc']]);
      q.restore();
    }
  }
  function stairFlight(q, x0, y0, x1, y1, n, back) {
    const dx = (x1 - x0) / n, dy = (y1 - y0) / n;
    q.beginPath(); q.moveTo(x0, y0);
    for (let i = 0; i < n; i++) { q.lineTo(x0 + dx * i, y0 + dy * (i + 1)); q.lineTo(x0 + dx * (i + 1), y0 + dy * (i + 1)); }
    q.lineTo(x1, y1 + 30); q.lineTo(x0, y0 + 30); q.closePath();
    fs(q, back ? '#a8784e' : '#b88a5a', 3);
    // 扶手
    q.beginPath(); q.moveTo(x0, y0 - 70); q.lineTo(x1, y1 - 70); q.lineWidth = 6; q.strokeStyle = INK; q.stroke(); q.lineWidth = 3; q.strokeStyle = '#c89a68'; q.stroke();
    for (let i = 0; i <= n; i += 2) line(q, x0 + dx * i, y0 + dy * i - 70, x0 + dx * i, y0 + dy * i, 2.5, 'rgba(58,38,32,.7)');
  }
  /** 夜里：房间压暗，开着的灯留一团暖光 */
  function nightRoom(q, name, b) {
    q.save();
    if (b.clip) { q.beginPath(); q.rect(b.clip[0], b.clip[1], b.clip[2], b.clip[3]); q.clip(); }
    else { const H = HOUSE; q.beginPath(); q.moveTo(H.main[0], H.attic); q.lineTo(H.main[0], 400); q.lineTo(1200, 214); q.lineTo(1618, 400); q.lineTo(1618, H.attic); q.closePath(); q.clip(); }
    q.globalCompositeOperation = 'multiply'; q.fillStyle = name === 'G' ? '#8a7aa0' : '#4a4a7a'; q.fillRect(0, 0, 2400, 1620);
    q.globalCompositeOperation = 'lighter';
    const L = { G: [[560, 330, 900]], F1: [[1140, 560, 700]], F2: [[760, 600, 600]], attic: [[1790, 590, 600]] }[name] || [];
    for (const [lx, ly, lr] of L) { const x = b.x + lx * b.s, y = b.y + ly * b.s, r = lr * b.s; q.fillStyle = rg(q, x, y, 0, r, [[0, 'rgba(255,190,110,.55)'], [0.5, 'rgba(255,160,90,.2)'], [1, 'rgba(255,160,90,0)']]); q.fillRect(x - r, y - r, r * 2, r * 2); }
    q.restore();
  }
  reg('house:day', 2880, 1620, (q, w, h) => { q.translate(240, 0); houseDraw(q, w, h, false); });
  reg('house:night', 2880, 1620, (q, w, h) => { q.translate(240, 0); houseDraw(q, w, h, true); });

  /* ---------- 楼梯井（竖长图，镜头跟着她往下冲），1920×2640 ---------- */
  const STAIR = { lv: 640, top: 40, x0: 600, x1: 1320 };
  reg('stairwell', VW, 2800, (q, w, h) => {
    const S = STAIR;
    // 整张先铺满（不留透明的地方：透明处会透出上一帧的残影）；最上面是阁楼的屋顶梁
    q.fillStyle = '#f3e2c8'; q.fillRect(0, 0, w, h);
    q.fillStyle = '#5a3a2a'; q.fillRect(0, 0, 560, S.top + 2);
    q.fillStyle = lg(q, 0, 0, 0, S.top, [[0, '#8fbce8'], [1, '#9cc4ec']]); q.fillRect(1440, 0, 480, S.top + 2);
    q.beginPath(); q.rect(-10, S.top - 16, 1450, 18); fs(q, '#7a4e34', 4);
    // 每层：左边是房间的一角，中间楼梯，右边外墙剖面 + 窗外
    const rooms = [roomAttic, roomParents, roomStudy, kitchenFull];
    for (let i = 0; i < 4; i++) {
      const y0 = S.top + i * S.lv, y1 = y0 + S.lv;
      // 左：房间（房间的右边缘对齐隔墙，地板对齐这一层的楼板；缩放 0.72 让房间正好盖满这一格，不在隔墙边和楼板下留缝）
      const RS = 0.72;
      q.save(); q.beginPath(); q.rect(0, y0, 560, S.lv); q.clip(); q.translate(560 - 1920 * RS, y1 - 20 - 880 * RS); q.scale(RS, RS); rooms[i](q); q.restore();
      // 中：楼梯间
      q.fillStyle = i % 2 ? '#efdcc0' : '#f3e2c8'; q.fillRect(560, y0, 820, S.lv);
      q.save(); q.beginPath(); q.rect(560, y0, 820, S.lv); q.clip();
      q.strokeStyle = 'rgba(160,110,70,.14)'; q.lineWidth = 2; for (let yy = y0; yy < y1; yy += 40) { q.beginPath(); q.moveTo(560, yy); q.lineTo(1380, yy); q.stroke(); }
      // 墙上的画框 / 壁灯
      q.beginPath(); q.rect(760, y0 + 110, 110, 84); fs(q, '#b88a4a', 4); q.beginPath(); q.rect(772, y0 + 122, 86, 60); fs(q, ['#a8c8e0', '#f2c49a', '#b8d8a8', '#e8b0b8'][i], 2);
      q.beginPath(); q.moveTo(1180, y0 + 150); q.lineTo(1220, y0 + 150); q.lineTo(1210, y0 + 110); q.lineTo(1190, y0 + 110); q.closePath(); fs(q, '#f4d9a0', 3);
      q.restore();
      // 右：外墙 + 窗
      q.beginPath(); q.rect(1380, y0, 60, S.lv); fs(q, '#e9d6b6', 4);
      q.save(); q.beginPath(); q.rect(1380, y0, 60, S.lv); q.clip(); q.strokeStyle = 'rgba(120,80,50,.35)'; q.lineWidth = 2; for (let yy = y0 - 60; yy < y1; yy += 14) { q.beginPath(); q.moveTo(1380, yy + 50); q.lineTo(1440, yy); q.stroke(); } q.restore();
      q.fillStyle = lg(q, 0, y0, 0, y1, [[0, '#9cc4ec'], [1, '#d8e8f4']]); q.fillRect(1440, y0, 480, S.lv);
      q.save(); q.beginPath(); q.rect(1440, y0, 480, S.lv); q.clip(); q.translate(1440 - 400, y0 + S.lv * (0.2 + i * 0.25)); q.scale(0.9, 0.9); skyline(q, 900, 200, 40 + i, TOWN.morning, {}); q.restore();
      // 隔墙（房间和楼梯间之间，留门洞）
      q.beginPath(); q.rect(548, y0, 24, S.lv - 250); fs(q, '#d8c2a0', 3.5);
    }
    // 楼梯与楼板（背景全画完再画，免得被下一层的墙盖住）
    for (let i = 0; i < 4; i++) {
      const y1 = S.top + (i + 1) * S.lv;
      if (i < 3) {
        stairFlight(q, S.x1, y1 - 20 + S.lv / 2, S.x0 + 10, y1 - 20 + S.lv, 8, true);
        stairFlight(q, S.x0, y1 - 20, S.x1, y1 - 20 + S.lv / 2, 8);
        q.beginPath(); q.rect(S.x1 - 10, y1 - 20 + S.lv / 2, 120, 22); fs(q, '#a8784e', 3.5);
      }
      q.beginPath(); q.rect(0, y1 - 20, i < 3 ? S.x0 : 1440, 20); fs(q, '#8a5a3a', 4);
      if (i < 3) { q.beginPath(); q.rect(S.x1 + 110, y1 - 20, 1440 - S.x1 - 110, 20); fs(q, '#8a5a3a', 4); }
      q.fillStyle = 'rgba(255,220,170,.3)'; q.fillRect(0, y1 - 18, 1440, 3);
    }
    // 一楼门厅：前门 + 行李
    const gy = S.top + 4 * S.lv - 20;
    q.beginPath(); rrect(q, 1250, gy - 300, 120, 300, 8); fs(q, '#7a4a2e', 5);
    q.beginPath(); rrect(q, 1270, gy - 280, 80, 110, 30); fs(q, '#8fb0d0', 3);
    q.fillStyle = '#e8c064'; q.beginPath(); circ(q, 1266, gy - 140, 7); q.fill();
    backpack(q, 1100, gy, 0.55, 0); backpack(q, 1170, gy, 0.46, 0);
    q.beginPath(); q.rect(0, gy, 1920, h - gy); fs(q, '#a8a0a0', 4);
  });

  /* =========================================================
   * 街道（侧面跟拍）：一排联排房切成 1200 宽的瓦片（y 从 -220 画到 1080）；地面一块可平铺
   * 世界坐标：房子落地 GY=830；远侧人行道 830–880；马路 892–1030；近侧路沿 1030 以下
   * ========================================================= */
  const GY = 830;
  const ROW = (() => {
    const R = rng(404), row = [];
    let x = -180;
    for (let i = 0; i < 22; i++) {
      const home = i === 1;
      const w = home ? 430 : 300 + floor(R() * 150);
      const h = home ? 650 : 540 + floor(R() * 230);
      const kind = home ? 'home' : R() < 0.42 ? 'shop' : 'door';
      row.push({ x, w, h, seed: 500 + i, home, kind, gap: 0 });
      x += w;
      if (!home && i > 1 && R() < 0.3) { const gw = 80 + floor(R() * 60); row[row.length - 1].gap = gw; x += gw; }
    }
    return row;
  })();
  /* 家门左边再补几栋（另一个随机种子，不改动原来那一排）：镜头在家门口时画面左边缘不会露出没画的空白 */
  const ROW_L = (() => {
    const R = rng(4040), out = [];
    let x = ROW[0].x;
    for (let i = 0; i < 4; i++) {
      const w = 300 + floor(R() * 150), h = 540 + floor(R() * 230);
      x -= w;
      out.push({ x, w, h, seed: 480 - i, home: false, kind: R() < 0.42 ? 'shop' : 'door', gap: 0 });
    }
    return out.reverse();
  })();
  const SS = 1.6; // 立面放大：人物是 Q 版大头身，门和窗要跟着大一点
  const HOME_DOOR = (ROW[1].x + 215) * SS;
  // 家（ROW[1]）的底层加高、门加大：门洞 160×336，比阿黛尔（300 + 羊角）高；楼上两层 + 山墙上的圆窗（阁楼），和剖面图的四层一致
  const HOME_GH = 240, HOME_DW = 100;
  /** 街边的椴树 */
  function linden(q, x, y, s, seed, pal = 'morning') {
    const g0 = pal === 'golden' ? ['#8aa04a', '#a8b85a', '#6a8040'] : pal === 'night' ? ['#1e3030', '#2a4038', '#18262a'] : ['#5f9a58', '#7cb46a', '#4a7e48'];
    q.beginPath(); q.moveTo(x - 12 * s, y); q.lineTo(x - 8 * s, y - 220 * s); q.lineTo(x + 8 * s, y - 220 * s); q.lineTo(x + 12 * s, y); q.closePath(); fs(q, '#6a4a3a', 3);
    const R = rng(seed);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, cx = x + cos(a) * 70 * s * R(), cy = y - 300 * s + sin(a) * 60 * s * R(); q.beginPath(); blob(q, cx, cy, (70 + R() * 30) * s, (60 + R() * 20) * s, seed + i, 8, 0.2); fs(q, g0[i % 3], 3); }
    q.fillStyle = 'rgba(255,250,200,.25)'; for (let i = 0; i < 5; i++) { q.beginPath(); circ(q, x - 50 * s + R() * 60 * s, y - 360 * s + R() * 80 * s, 16 * s); q.fill(); }
    q.beginPath(); q.ellipse(x, y + 4, 40 * s, 10 * s, 0, 0, TAU); q.fillStyle = 'rgba(0,0,0,.18)'; q.fill();
  }
  function streetTile(q, i, pal) {
    q.save(); q.translate(-i * 1200, 220);
    q.translate(0, GY); q.scale(SS, SS); q.translate(0, -GY);
    const x0 = (i * 1200 - 480) / SS, x1 = ((i + 1) * 1200 + 480) / SS;
    const night = pal === 'night' ? 0.55 : pal === 'dawn2' ? 0.25 : 0;
    const trees = [];
    for (const H of i < 1 ? ROW_L.concat(ROW) : ROW) {
      if (H.x + H.w + H.gap < x0 || H.x > x1) continue;
      const o = { lw: 2.4, night, light: 'left' };
      if (H.home) Object.assign(o, { wall: '#f2dfae', roof: '#7a3e30', shutter: '#5d8a78', roofType: 'gable', doorCol: '#3f6a5a', doorAt: 0.5, doorW: HOME_DW, gh: HOME_GH, oculus: true });
      else if (H.kind === 'shop') o.door = 'shop';
      townhouse(q, H.x, GY, H.w, H.h, H.seed, o);
      if (H.home) {
        q.beginPath(); rrect(q, H.x + 280, GY - 150, 34, 30, 5); fs(q, '#2f5a8a', 2.5); E.text(q, '7', H.x + 297, GY - 127, { size: 22, color: '#fff', weight: 700, font: 'sans' });
      }
      if (H.gap) trees.push(H);
    }
    // 树种在人行道上、站在两栋房子前面：等所有立面都画完再画，树冠才不会被下一栋房子的墙切掉
    for (const H of trees) linden(q, H.x + H.w + H.gap / 2, GY + 6, 1.05, H.seed + 3, pal);
    q.restore();
    streetGrade(q, pal, 1200, 1300);
  }
  /** 按时间段给静态图层上一层光色（在缓存里做一次） */
  function streetGrade(q, pal, w, h) {
    const ops = pal === 'golden' ? [['multiply', '#ffd2a0'], ['soft-light', 'rgba(255,150,60,.45)']]
      : pal === 'sunset' ? [['multiply', '#f0b0a0'], ['soft-light', 'rgba(255,120,80,.4)']]
      : pal === 'night' ? [['multiply', '#4a4a80']]
      : pal === 'dawn2' ? [['multiply', '#b8a8cc'], ['soft-light', 'rgba(255,170,150,.35)']] : null;
    if (ops) gradeKeepAlpha(q, ops);
  }
  /** 给缓存图层上色（multiply / soft-light 等），但保留原来的透明度（透明的天空不能被填上颜色） */
  function gradeKeepAlpha(q, ops) {
    const c = q.canvas, tmp = E.mk(c.width, c.height), t = tmp.getContext('2d');
    t.drawImage(c, 0, 0);
    for (const [mode, color] of ops) { t.globalCompositeOperation = mode; t.fillStyle = color; t.fillRect(0, 0, c.width, c.height); }
    t.globalCompositeOperation = 'destination-in'; t.drawImage(c, 0, 0);
    q.save(); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'copy'; q.drawImage(tmp, 0, 0); q.restore();
    tmp.width = tmp.height = 1;
  }
  /* 瓦片两边各多画 BL 个设计像素、贴的时候互相压住：相邻瓦片的边缘是抗锯齿的半透明像素，不压住会透出一条细亮线 */
  const BL = 4;
  for (const pal of ['morning', 'golden', 'dawn2']) for (let i = -1; i < 10; i++) reg(`street:${pal}:${i}`, 1200 + 2 * BL, 1300, (q) => { q.translate(BL, 0); streetTile(q, i, pal); });
  /** 地面（可平铺，世界 y 820–1120）：人行道、路沿、石子路、电车轨道。严格以 1200 为周期（每排石子的宽度凑满 1200），瓦片之间看不出接缝 */
  function groundTile(q, pal) {
    const R = rng(77), X0 = -BL, X1 = 1200 + BL, W = X1 - X0;
    q.fillStyle = '#d9cfc2'; q.fillRect(X0, 10, W, 52);
    q.strokeStyle = 'rgba(80,60,50,.3)'; q.lineWidth = 2; for (let x = 0; x <= 1300; x += 100) { q.beginPath(); q.moveTo(x, 10); q.lineTo(x - 14, 62); q.stroke(); }
    line(q, X0, 36, X1, 36, 1.5, 'rgba(80,60,50,.2)');
    q.fillStyle = '#b8aca0'; q.fillRect(X0, 60, W, 14); line(q, X0 - 4, 60, X1 + 4, 60, 3, INK); line(q, X0 - 4, 74, X1 + 4, 74, 2, 'rgba(58,38,32,.5)');
    q.fillStyle = '#8c8078'; q.fillRect(X0, 74, W, 140);
    for (let row = 0; row < 9; row++) {
      const y = 76 + row * 15.5, hgt = 13 + row * 0.2;
      const o = -R() * 30, ws = [], cs = [];
      let sum = 0;
      while (sum < 1200) { const w = 20 + R() * 16; ws.push(w); cs.push(118 + R() * 40 | 0); sum += w; }
      const k = 1200 / sum;
      let x = o;
      for (let j = 0; j < ws.length; j++) {
        const w = ws[j] * k, c = cs[j];
        q.fillStyle = `rgb(${c},${c - 10 | 0},${c - 18 | 0})`;
        for (const ox of [-1200, 0, 1200]) { if (x + ox + w < X0 || x + ox > X1) continue; q.beginPath(); rrect(q, x + ox, y, w - 3, hgt, 5); q.fill(); }
        x += w;
      }
    }
    for (const ry of [118, 170]) { q.fillStyle = '#6c625c'; q.fillRect(X0, ry - 3, W, 9); line(q, X0 - 4, ry - 3, X1 + 4, ry - 3, 2.5, '#d8d4d0'); }
    q.fillStyle = '#b0a498'; q.fillRect(X0, 212, W, 14); line(q, X0 - 4, 212, X1 + 4, 212, 3, INK);
    q.fillStyle = '#d4c8ba'; q.fillRect(X0, 226, W, 274);
    for (let x = -120; x <= 1200; x += 120) line(q, x, 226, x + 40, 500, 2, 'rgba(80,60,50,.25)');
    for (let y = 300; y < 500; y += 90) line(q, X0 - 4, y, X1 + 4, y, 2, 'rgba(80,60,50,.18)');
    streetGrade(q, pal, 1200, 500);
  }
  for (const pal of ['morning', 'golden', 'dawn2']) reg('ground:' + pal, 1200 + 2 * BL, 500, (q) => { q.translate(BL, 0); groundTile(q, pal); });
  /** 画一段街：远景城 + 房子瓦片 + 地面；cam 为镜头（世界坐标），pal 为时间段 */
  function streetScene(g, s, cam, pal, o = {}) {
    s.layer(g, cam, 0.25, (q) => {
      const ox = (cam.x - VW / 2) * 0.25;
      q.drawImage(lay(s, 'farw:' + pal), -300 + ox * 0, 170, 3840, 560);
    });
    s.layer(g, cam, 1, (q) => {
      const vx0 = cam.x - VW / 2 / (cam.z || 1) - 200, vx1 = cam.x + VW / 2 / (cam.z || 1) + 200;
      for (let i = max(-1, floor(vx0 / 1200)); i <= min(9, floor(vx1 / 1200)); i++) q.drawImage(lay(s, `street:${pal}:${i}`), i * 1200 - BL, -220, 1200 + 2 * BL, 1300);
      for (let i = floor(vx0 / 1200); i <= floor(vx1 / 1200); i++) q.drawImage(lay(s, 'ground:' + pal), i * 1200 - BL, 820, 1200 + 2 * BL, 500);
      if (o.mid) o.mid(q);
    });
  }
  /** 电车（侧面精灵） */
  reg('tram', 1100, 430, (q) => {
    const y0 = 110, y1 = 390;
    // 受电弓不在精灵里：在镜头里按架空线的高度画（tramPanto），弓头正好顶在线上
    q.beginPath(); q.rect(470, y0 - 16, 120, 16); fs(q, '#4a4a52', 3);
    q.beginPath(); q.moveTo(40, y1); q.lineTo(30, y0 + 50); q.quadraticCurveTo(40, y0, 110, y0); q.lineTo(990, y0); q.quadraticCurveTo(1060, y0, 1070, y0 + 50); q.lineTo(1060, y1); q.closePath(); fs(q, '#f3e7cc', 5);
    q.save(); q.clip(); q.fillStyle = '#c0453a'; q.fillRect(0, y0 + 170, 1100, 200); q.fillStyle = '#e8c064'; q.fillRect(0, y0 + 164, 1100, 8); q.restore();
    for (let i = 0; i < 8; i++) {
      const wx = 90 + i * 115; q.beginPath(); rrect(q, wx, y0 + 30, 90, 110, 10); fs(q, '#8fb2cc', 3.5);
      if (i % 3 !== 1) { q.fillStyle = 'rgba(40,40,60,.55)'; q.beginPath(); circ(q, wx + 45, y0 + 88, 17); q.fill(); q.fillRect(wx + 22, y0 + 104, 46, 40); }
      q.fillStyle = 'rgba(255,255,255,.35)'; q.beginPath(); q.moveTo(wx + 8, y0 + 110); q.lineTo(wx + 50, y0 + 36); q.lineTo(wx + 66, y0 + 36); q.lineTo(wx + 8, y0 + 132); q.fill();
    }
    q.beginPath(); rrect(q, 470, y0 + 190, 70, 30, 5); fs(q, '#fff6e0', 3); E.text(q, '7', 505, y0 + 214, { size: 24, color: RED, weight: 700, font: 'sans' });
    for (const wx of [170, 330, 770, 930]) { q.beginPath(); circ(q, wx, y1 + 6, 30); fs(q, '#3a3440', 4); q.beginPath(); circ(q, wx, y1 + 6, 10); fs(q, '#8a8494', 2); }
    q.beginPath(); q.rect(40, y1 - 20, 1020, 24); fs(q, '#4a3a3a', 3);
  });
  /** 电车的受电弓：底座在车顶 (bx, by)，弓头顶在架空线 wy 上（菱形的两根折臂 + 弓头） */
  function tramPanto(q, bx, by, wy) {
    const my = (by + wy) / 2;
    q.lineCap = 'round'; q.lineJoin = 'round';
    for (const [lw, col] of [[7, INK], [3.4, '#6a6a74']]) {
      q.lineWidth = lw; q.strokeStyle = col;
      q.beginPath(); q.moveTo(bx - 46, by); q.lineTo(bx + 26, my); q.lineTo(bx - 20, wy + 10);
      q.moveTo(bx + 40, by); q.lineTo(bx - 30, my + 8); q.lineTo(bx + 14, wy + 10); q.stroke();
    }
    q.beginPath(); rrect(q, bx - 64, wy - 1, 96, 11, 4); fs(q, '#4a4a52', 3);
  }
  const WIRE_Y = 318, WIRE_M = 288; // 架空线（接触线 / 承力索）：在马路上方、比远侧人行道上所有人的头（连耳朵、角）都高
  /** 路灯（近景，铸铁）：底在 (x, y) */
  function lampPost(q, x, y, s, lit = 0) {
    q.save(); q.translate(x, y); q.scale(s, s);
    q.beginPath(); q.rect(-16, -40, 32, 40); fs(q, '#3a3a44', 4);
    q.beginPath(); q.rect(-8, -520, 16, 480); fs(q, '#3a3a44', 4);
    q.beginPath(); q.moveTo(-34, -540); q.lineTo(34, -540); q.lineTo(24, -620); q.lineTo(-24, -620); q.closePath(); fs(q, lit ? '#ffe2a0' : '#dfe6ea', 4);
    q.beginPath(); q.moveTo(-42, -620); q.lineTo(42, -620); q.lineTo(0, -660); q.closePath(); fs(q, '#3a3a44', 4);
    q.beginPath(); rrect(q, -40, -545, 80, 12, 4); fs(q, '#3a3a44', 3);
    if (lit) glow(q, 0, -580, 140, '255,210,140', 0.6 * lit);
    q.restore();
  }
  /**
   * 小提琴手（街头艺人，成年路人）：琴托在下巴底下，斜着往下伸到远侧的手（握琴颈）；弓从近侧的手搭在琴上、往身前斜下方伸出去。
   * 手、嘴的位置用角色库的 anchors（拿不到路人内部键名时按这个路人的比例估）——琴和弓都在脸的下面，不会挡住眼睛
   */
  const VIOLIN_SEED = 17, VIOLIN_COL = '#5a4a7a';
  function violinPts(o) {
    const C = E.cast, key = 'crowd#' + VIOLIN_SEED + '#' + VIOLIN_COL, h = o.h;
    let A = null;
    try { if (C && C._internal && C._internal.CH && C._internal.CH[key]) A = C.anchors(key, o); } catch (e) { A = null; }
    if (A && A.mouth && A.handN && A.handF) return { mouth: A.mouth, hn: A.handN, hf: A.handF };
    return { mouth: [o.x - 0.068 * h, o.y - 0.691 * h], hn: [o.x - 0.153 * h, o.y - 0.553 * h], hf: [o.x - 0.208 * h, o.y - 0.478 * h] };
  }
  function violinist(q, x, y, h, t) {
    const o = { x, y, h, pose: 'stand', arms: 'reach', aim: -0.2, t, flip: true, seed: VIOLIN_SEED, color: VIOLIN_COL, headPose: 'tilt', expr: 'content' };
    who(q, 'crowd', o);
    const P = violinPts(o), chin = [P.mouth[0] + 0.035 * h, P.mouth[1] + 0.08 * h];
    const ang = atan2(P.hf[1] - chin[1], P.hf[0] - chin[0]), k = hypot(P.hf[0] - chin[0], P.hf[1] - chin[1]) / 95;
    q.save(); q.translate(chin[0] + cos(ang) * 30 * k, chin[1] + sin(ang) * 30 * k); q.rotate(ang); q.scale(k, k); q.lineJoin = 'round';
    q.beginPath(); q.moveTo(-40, 0); q.bezierCurveTo(-40, -18, -22, -21, -14, -12); q.bezierCurveTo(-9, -16, -1, -15, 2, -10); q.bezierCurveTo(4, -15, 16, -17, 20, -9); q.lineTo(20, 9);
    q.bezierCurveTo(16, 17, 4, 15, 2, 10); q.bezierCurveTo(-1, 15, -9, 16, -14, 12); q.bezierCurveTo(-22, 21, -40, 18, -40, 0); q.closePath(); fs(q, '#b8642a', 3);
    q.fillStyle = 'rgba(255,220,170,.35)'; q.beginPath(); ell(q, -26, -6, 9, 4, -0.3); q.fill();
    q.fillStyle = '#2a1a14'; q.fillRect(-8, -5, 3, 10);
    q.beginPath(); q.rect(20, -3.5, 44, 7); q.fillStyle = '#2a1e1a'; q.fill(); q.beginPath(); circ(q, 67, 0, 5); q.fill();
    q.strokeStyle = 'rgba(255,240,220,.7)'; q.lineWidth = 0.9; q.beginPath(); q.moveTo(-30, -1.4); q.lineTo(64, -1.4); q.moveTo(-30, 1.4); q.lineTo(64, 1.4); q.stroke();
    q.restore();
    // 弓：搭在近侧的手上，顺着弓杆来回拉
    const bd = ang - PI / 2 * 0.95, sl = sin(t * 5.5) * 0.035 * h, bl = 0.3 * h, bx = P.hn[0] + cos(bd) * sl, by = P.hn[1] + sin(bd) * sl;
    q.save(); q.lineCap = 'round'; q.strokeStyle = '#3a2418'; q.lineWidth = 4; q.beginPath(); q.moveTo(bx - cos(bd) * 8, by - sin(bd) * 8); q.lineTo(bx + cos(bd) * bl, by + sin(bd) * bl); q.stroke();
    q.strokeStyle = 'rgba(250,245,230,.95)'; q.lineWidth = 1.6; q.stroke(); q.restore();
  }
  function notesFrom(q, t, x, y, n, seed, col = 'rgba(58,38,32,.85)', spread = 1) {
    E.field(q, t, { n, every: 0.35, life: 2.8, seed, prewarm: true,
      make: (r) => ({ vx: (r(1) - 0.3) * 90 * spread, vy: -(60 + r(2) * 60), ph: r(3) * 6, k: r(4) < 0.4 ? 1 : 0, s: 0.8 + r(5) * 0.6 }),
      draw: (g, p, age, kk) => { const a = sin(PI * kk); if (a < 0.02) return; g.globalAlpha = a; note(g, x + p.vx * age + sin(age * 3 + p.ph) * 16, y + p.vy * age, p.s, sin(age * 2 + p.ph) * 0.3, col, p.k); g.globalAlpha = 1; } });
  }

  /* ---------- 大学：钟楼（大钟面近景）、校门 → 庭院 → 讲堂台阶（侧面长条） ---------- */
  reg('clockface', VW, VH, (q, w, h) => {
    q.fillStyle = '#cdb898'; q.fillRect(0, 0, w, h);
    const R = rng(90);
    for (let y = 0; y < h; y += 70) for (let x = (y / 70) % 2 ? -60 : 0; x < w; x += 140) { const c = 190 + R() * 30 | 0; q.fillStyle = `rgb(${c},${c - 18 | 0},${c - 44 | 0})`; q.fillRect(x + 3, y + 3, 134, 64); }
    speckle(q, 0, 0, w, h, 1600, 91, ['#fff', '#6a5040'], 0.08, 4);
    const cx = 980, cy = 500, r = 400;
    q.beginPath(); circ(q, cx, cy, r + 70); fs(q, '#b8a080', 6);
    q.beginPath(); circ(q, cx, cy, r + 40); fs(q, lg(q, cx - r, cy - r, cx + r, cy + r, [[0, '#f0d890'], [0.5, '#c8963a'], [1, '#8a5a1e']]), 6);
    q.beginPath(); circ(q, cx, cy, r); fs(q, rg(q, cx - 80, cy - 100, 40, r, [[0, '#fffaf0'], [1, '#efe2c4']]), 5);
    q.beginPath(); circ(q, cx, cy, r * 0.8); fs(q, null, 3, 'rgba(58,38,32,.35)');
    const RN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    for (let i = 0; i < 60; i++) { const a = -PI / 2 + (i / 60) * TAU, r0 = i % 5 ? r * 0.93 : r * 0.88; line(q, cx + cos(a) * r0, cy + sin(a) * r0, cx + cos(a) * r * 0.97, cy + sin(a) * r * 0.97, i % 5 ? 3 : 7, INK); }
    for (let i = 0; i < 12; i++) { const a = -PI / 2 + (i / 12) * TAU; E.text(q, RN[i], cx + cos(a) * r * 0.72, cy + sin(a) * r * 0.72 + 22, { size: 64, font: 'display', weight: 700, color: '#3a2620' }); }
    q.beginPath(); q.rect(cx - 520, cy + r + 90, 1040, 50); fs(q, '#a88c6c', 5);
    q.fillStyle = 'rgba(0,0,0,.25)'; q.fillRect(cx - 520, cy + r + 140, 1040, 24);
  });
  function clockHands(q, cx, cy, r, hh, mm) {
    const ah = -PI / 2 + ((hh % 12) + mm / 60) / 12 * TAU, am = -PI / 2 + (mm / 60) * TAU;
    q.save(); q.lineCap = 'round';
    q.translate(cx, cy); q.rotate(ah); q.beginPath(); q.moveTo(-30, 0); q.lineTo(r * 0.5, 0); q.lineWidth = 26; q.strokeStyle = INK; q.stroke(); q.lineWidth = 14; q.strokeStyle = '#3a3440'; q.stroke(); q.rotate(-ah);
    q.rotate(am); q.beginPath(); q.moveTo(-40, 0); q.lineTo(r * 0.78, 0); q.lineWidth = 18; q.strokeStyle = INK; q.stroke(); q.lineWidth = 9; q.strokeStyle = '#3a3440'; q.stroke(); q.beginPath(); poly(q, [r * 0.78, -16, r * 0.9, 0, r * 0.78, 16]); fs(q, '#3a3440', 4);
    q.restore();
    q.beginPath(); circ(q, cx, cy, 24); fs(q, '#c8963a', 5);
  }
  /** 校园长条（侧面）：校门 → 庭院 → 讲堂正面与台阶；3 块 1200 瓦片，y 从 -220 画到 1080 */
  const CAMPUS_G = 860, STEP0 = 2400, STEP1 = 2960, LAND = 610, HALL_DOOR = 3150;
  function campusDraw(q) {
    // 远处的石墙
    q.fillStyle = '#b8a888'; q.fillRect(-100, 560, 2500, 300);
    q.strokeStyle = 'rgba(58,38,32,.18)'; q.lineWidth = 2; for (let y = 580; y < 860; y += 40) { q.beginPath(); q.moveTo(-100, y); q.lineTo(2400, y); q.stroke(); }
    const R = rng(33);
    for (let i = 0; i < 40; i++) { q.fillStyle = R() < 0.5 ? '#5f8a50' : '#78a060'; q.beginPath(); blob(q, R() * 2400, 560 + R() * 120, 30 + R() * 30, 18 + R() * 16, 60 + i, 7, 0.3); q.fill(); }
    line(q, -100, 560, 2400, 560, 4, INK);
    // 庭院的树
    for (const [tx, ts] of [[1300, 1.3], [1900, 1.5]]) linden(q, tx, CAMPUS_G, ts, 70 + tx);
    // 校门
    for (const px of [300, 820]) {
      q.beginPath(); q.rect(px - 60, 260, 120, CAMPUS_G - 260); fs(q, '#d8c6a4', 5);
      q.beginPath(); q.moveTo(px - 70, 260); q.lineTo(px, 120); q.lineTo(px + 70, 260); q.closePath(); fs(q, '#a8906c', 5);
      q.beginPath(); circ(q, px, 112, 12); fs(q, '#e8c064', 3);
      for (let y = 300; y < CAMPUS_G; y += 60) line(q, px - 60, y, px + 60, y, 2, 'rgba(58,38,32,.25)');
    }
    q.beginPath(); q.moveTo(360, 380); q.quadraticCurveTo(560, 120, 760, 380); q.lineTo(760, 420); q.quadraticCurveTo(560, 180, 360, 420); q.closePath(); fs(q, '#d8c6a4', 5);
    q.beginPath(); q.moveTo(520, 250); q.lineTo(600, 250); q.lineTo(600, 300); q.quadraticCurveTo(560, 340, 520, 300); q.closePath(); fs(q, '#3f5a8a', 4);
    q.beginPath(); star4(q, 560, 280, 16); q.fillStyle = '#e8c064'; q.fill();
    // 铁门（开着）
    q.strokeStyle = '#2a2a30'; q.lineWidth = 5; for (let i = 0; i < 6; i++) { line(q, 250 - i * 22, 420, 250 - i * 22, CAMPUS_G, 5, '#2a2a30'); line(q, 870 + i * 22, 420, 870 + i * 22, CAMPUS_G, 5, '#2a2a30'); }
    // 公告栏
    q.beginPath(); q.rect(1560, 560, 220, 160); fs(q, '#8a5a3a', 5); q.beginPath(); q.rect(1576, 576, 188, 128); fs(q, '#d8b88a', 3);
    for (const [px, py, pc] of [[1600, 600, '#fffaf0'], [1660, 590, '#f6e0a0'], [1710, 610, '#e0f0f6'], [1620, 650, '#f6d0c0']]) { q.save(); q.translate(px, py); q.rotate((px % 7) * 0.02 - 0.06); q.beginPath(); q.rect(0, 0, 44, 52); fs(q, pc, 2); q.restore(); }
    line(q, 1590, 720, 1590, CAMPUS_G, 8, '#6a4a3a'); line(q, 1750, 720, 1750, CAMPUS_G, 8, '#6a4a3a');
    // 讲堂正面（两层高，石砌；屋顶在上面，钟楼从后面冒出来）
    const hx0 = 2300, hx1 = 3700, top = 60;
    q.beginPath(); q.moveTo(hx0 - 30, top + 6); q.lineTo(hx0 + 90, top - 170); q.lineTo(hx1 - 90, top - 170); q.lineTo(hx1 + 30, top + 6); q.closePath(); fs(q, '#5a6072', 6);
    q.save(); q.clip(); for (let y = top - 160; y < top; y += 22) line(q, hx0 - 40, y, hx1 + 40, y, 2, 'rgba(255,255,255,.12)'); q.restore();
    for (const dx of [2600, 3000, 3400]) { q.beginPath(); q.rect(dx - 34, top - 120, 68, 90); fs(q, '#dccaa6', 4); q.beginPath(); q.moveTo(dx - 44, top - 120); q.lineTo(dx, top - 170); q.lineTo(dx + 44, top - 120); q.closePath(); fs(q, '#5a6072', 4); q.beginPath(); q.rect(dx - 18, top - 104, 36, 56); fs(q, '#8aa8c8', 3); }
    q.beginPath(); q.rect(hx0, top, hx1 - hx0, LAND - top); fs(q, '#dccaa6', 6);
    for (let y = top + 30; y < LAND; y += 52) line(q, hx0, y, hx1, y, 2, 'rgba(58,38,32,.14)');
    for (const bx of [hx0, 2780, 3500, hx1 - 40]) { q.beginPath(); q.rect(bx, top, 40, LAND - top); fs(q, '#cbb690', 4); q.beginPath(); q.moveTo(bx - 6, top); q.lineTo(bx + 20, top - 50); q.lineTo(bx + 46, top); q.closePath(); fs(q, '#cbb690', 4); }
    for (const wx of [2560, 3400]) {
      q.beginPath(); q.moveTo(wx - 76, 530); q.lineTo(wx - 76, 200); q.quadraticCurveTo(wx - 76, 110, wx, 80); q.quadraticCurveTo(wx + 76, 110, wx + 76, 200); q.lineTo(wx + 76, 530); q.closePath(); fs(q, lg(q, 0, 80, 0, 530, [[0, '#a8c4e0'], [1, '#6a86a8']]), 5);
      line(q, wx, 96, wx, 530, 4, '#dccaa6'); for (let y = 250; y < 530; y += 100) line(q, wx - 76, y, wx + 76, y, 4, '#dccaa6');
      q.beginPath(); circ(q, wx - 34, 170, 18); circ(q, wx + 34, 170, 18); fs(q, null, 3.5, '#dccaa6');
      q.fillStyle = 'rgba(255,255,255,.3)'; q.beginPath(); q.moveTo(wx - 70, 420); q.lineTo(wx - 10, 120); q.lineTo(wx + 10, 120); q.lineTo(wx - 70, 480); q.fill();
    }
    // 门廊的尖山墙 + 玫瑰窗
    q.beginPath(); q.moveTo(HALL_DOOR - 200, top + 40); q.lineTo(HALL_DOOR, top - 150); q.lineTo(HALL_DOOR + 200, top + 40); q.closePath(); fs(q, '#e4d4b2', 5);
    q.beginPath(); circ(q, HALL_DOOR, 110, 86); fs(q, '#dccaa6', 5); q.beginPath(); circ(q, HALL_DOOR, 110, 70); fs(q, '#8aa8c8', 4);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; line(q, HALL_DOOR, 110, HALL_DOOR + cos(a) * 70, 110 + sin(a) * 70, 4, '#dccaa6'); }
    q.beginPath(); circ(q, HALL_DOOR, 110, 20); fs(q, '#e8c064', 3);
    // 大门
    q.beginPath(); q.moveTo(HALL_DOOR - 120, LAND); q.lineTo(HALL_DOOR - 120, 330); q.quadraticCurveTo(HALL_DOOR - 120, 240, HALL_DOOR, 220); q.quadraticCurveTo(HALL_DOOR + 120, 240, HALL_DOOR + 120, 330); q.lineTo(HALL_DOOR + 120, LAND); q.closePath(); fs(q, '#a8906c', 6);
    q.beginPath(); q.moveTo(HALL_DOOR - 95, LAND); q.lineTo(HALL_DOOR - 95, 340); q.quadraticCurveTo(HALL_DOOR - 95, 262, HALL_DOOR, 246); q.quadraticCurveTo(HALL_DOOR + 95, 262, HALL_DOOR + 95, 340); q.lineTo(HALL_DOOR + 95, LAND); q.closePath(); fs(q, '#6a3e26', 5);
    line(q, HALL_DOOR, 250, HALL_DOOR, LAND, 4, INK);
    for (let y = 360; y < LAND; y += 60) { line(q, HALL_DOOR - 90, y, HALL_DOOR - 6, y, 2.5, 'rgba(0,0,0,.3)'); line(q, HALL_DOOR + 6, y, HALL_DOOR + 90, y, 2.5, 'rgba(0,0,0,.3)'); }
    q.fillStyle = '#e8c064'; q.beginPath(); circ(q, HALL_DOOR - 24, 470, 8); circ(q, HALL_DOOR + 24, 470, 8); q.fill();
    // 讲堂的石基（台阶后面，不然台阶和墙之间会透出天空）
    q.beginPath(); q.rect(hx0, LAND, hx1 - hx0, CAMPUS_G - LAND); fs(q, '#bfae8a', 5);
    for (let y = LAND + 40; y < CAMPUS_G; y += 44) line(q, hx0, y, hx1, y, 2, 'rgba(58,38,32,.16)');
    for (let x = hx0 + 60, r2 = 0; x < STEP0 + 40; x += 70, r2++) line(q, x + (r2 % 2) * 30, LAND, x + (r2 % 2) * 30, CAMPUS_G, 2, 'rgba(58,38,32,.12)');
    // 台阶
    const n = 8, rise = (CAMPUS_G - LAND) / n, run = (STEP1 - STEP0) / n;
    for (let i = 0; i < n; i++) { q.beginPath(); q.rect(STEP0 + i * run, CAMPUS_G - (i + 1) * rise, 3700 - STEP0 - i * run, rise); fs(q, i % 2 ? '#d0c0a0' : '#c8b898', 3.5); }
    q.beginPath(); q.rect(STEP1, LAND - 8, 3700 - STEP1, 14); fs(q, '#e0d2b4', 3);
    // 地面
    q.fillStyle = '#c8b898'; q.fillRect(-100, CAMPUS_G, 3800, 520); line(q, -100, CAMPUS_G, 3800, CAMPUS_G, 4, INK);
    q.fillStyle = 'rgba(58,38,32,.12)'; for (let x = -100; x < 3700; x += 90) q.fillRect(x, CAMPUS_G + 6, 3, 200);
    q.fillStyle = '#e4d8c2'; q.fillRect(-100, CAMPUS_G + 20, 3800, 50);
  }
  for (let i = 0; i < 3; i++) reg('campus:' + i, 1200 + 2 * BL, 1500, (q) => { q.translate(BL - i * 1200, 220); campusDraw(q); });
  function campusScene(g, s, cam, o = {}) {
    s.layer(g, cam, 0.25, (q) => { q.drawImage(lay(s, 'farw:noon'), -500, 150, 3840, 560); });
    if (o.tower !== false) s.layer(g, cam, 0.55, (q) => { const tx = 3050 * 0.55 + 960 * 0.45; belltower(q, tx, 800, 230, 900, { col: '#e0d0b0', roof: '#5f9a8c', face: '#fff6e0', lw: 5, detail: true, bell: o.bell ?? 0, dark: '#2a2436' }); });
    s.layer(g, cam, 1, (q) => {
      const vx0 = cam.x - VW / 2 / cam.z - 100, vx1 = cam.x + VW / 2 / cam.z + 100;
      for (let i = max(0, floor(vx0 / 1200)); i <= min(2, floor(vx1 / 1200)); i++) q.drawImage(lay(s, 'campus:' + i), i * 1200 - BL, -220, 1200 + 2 * BL, 1500);
      if (o.mid) o.mid(q);
    });
  }
  /** 钟楼仰拍（大）：塔身由下往上收窄 */
  reg('tower-low', VW, 2000, (q, w, h) => {
    q.translate(0, 600);
    const cx = 960, base = 1440, top = 180;
    const W0 = 760, W1 = 420;
    const wAt = (y) => lerp(W1, W0, (y - top) / (base - top));
    q.beginPath(); q.moveTo(cx - W0 / 2, base); q.lineTo(cx - W1 / 2, top); q.lineTo(cx + W1 / 2, top); q.lineTo(cx + W0 / 2, base); q.closePath();
    fs(q, lg(q, cx - W0 / 2, 0, cx + W0 / 2, 0, [[0, '#f0e2c4'], [0.55, '#e0cca6'], [1, '#bca47e']]), 7);
    q.save(); q.clip();
    for (let y = top; y < base; y += 44) { const ww = wAt(y); line(q, cx - ww / 2, y, cx + ww / 2, y, 2.5, 'rgba(58,38,32,.18)'); }
    for (const f of [-0.5, 0.5]) { q.beginPath(); q.moveTo(cx + f * W0 * 0.92, base); q.lineTo(cx + f * W1 * 0.92, top); q.lineWidth = 30; q.strokeStyle = 'rgba(120,90,60,.16)'; q.stroke(); }
    q.restore();
    // 钟面
    const cy = 720, cr = 170;
    q.beginPath(); circ(q, cx, cy, cr + 34); fs(q, '#c8963a', 6); q.beginPath(); circ(q, cx, cy, cr); fs(q, '#fff8ea', 5);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; line(q, cx + cos(a) * cr * 0.78, cy + sin(a) * cr * 0.78, cx + cos(a) * cr * 0.92, cy + sin(a) * cr * 0.92, 6, INK); }
    // 下面的尖拱窗
    for (const dx of [-110, 110]) { const y0 = 1020; q.beginPath(); q.moveTo(cx + dx - 44, y0 + 300); q.lineTo(cx + dx - 44, y0 + 40); q.quadraticCurveTo(cx + dx, y0 - 30, cx + dx + 44, y0 + 40); q.lineTo(cx + dx + 44, y0 + 300); q.closePath(); fs(q, '#5a6a8a', 5); }
    // 钟楼开拱（钟在动态层）
    const by0 = 240, by1 = 520;
    q.beginPath(); q.moveTo(cx - 150, by1); q.lineTo(cx - 150, by0 + 90); q.quadraticCurveTo(cx - 150, by0, cx, by0 - 30); q.quadraticCurveTo(cx + 150, by0, cx + 150, by0 + 90); q.lineTo(cx + 150, by1); q.closePath(); fs(q, '#2a2436', 6);
    q.beginPath(); q.rect(cx - 250, by1, 500, 40); fs(q, '#cbb690', 5);
    // 尖顶
    q.beginPath(); q.moveTo(cx - W1 / 2 - 40, top + 10); q.lineTo(cx, -520); q.lineTo(cx + W1 / 2 + 40, top + 10); q.closePath(); fs(q, lg(q, cx - 250, 0, cx + 250, 0, [[0, '#7ab8a8'], [1, '#4a8a7c']]), 7);
    q.save(); q.clip(); for (let y = -500; y < top; y += 36) line(q, cx - 300, y, cx + 300, y, 2.5, 'rgba(0,0,0,.12)'); q.restore();
    for (const s2 of [-1, 1]) { const px = cx + s2 * (W1 / 2 + 10); q.beginPath(); q.moveTo(px - 34, top + 20); q.lineTo(px, top - 200); q.lineTo(px + 34, top + 20); q.closePath(); fs(q, '#5f9a8c', 5); }
  });

  /* =========================================================
   * 大学讲堂：阶梯教室（一点透视全景 / 侧面）、黑板近景、笔记本
   * ========================================================= */
  const HP = { vx: 960, vy: 250, f: 500 };
  const hp = (X, Y, Z) => [HP.vx + (HP.f * X) / Z, HP.vy - (HP.f * Y) / Z];
  function quad3(q, P) { const a = hp(...P[0]); q.moveTo(a[0], a[1]); for (let i = 1; i < P.length; i++) { const b = hp(...P[i]); q.lineTo(b[0], b[1]); } q.closePath(); }
  const ROWS = 8, rowZ = (i) => 9.0 - i * 0.8, rowY = (i) => -5 + i * 0.3, rowZX = (i, X) => rowZ(i) - (X / 7.5) ** 2 * 0.9;
  reg('hall-wide', VW, VH, (q, w, h) => {
    const FL = -5; // 讲台前的地面
    // 远墙（黑板墙）
    q.beginPath(); quad3(q, [[-8, FL, 10], [8, FL, 10], [8, 8, 10], [-8, 8, 10]]); fs(q, '#c9b08a', 3);
    q.beginPath(); quad3(q, [[-8, FL, 10], [8, FL, 10], [8, -3.4, 10], [-8, -3.4, 10]]); fs(q, '#8a5a3a', 2.5);
    // 黑板
    q.beginPath(); quad3(q, [[-4.9, -4.5, 10], [4.9, -4.5, 10], [4.9, -0.9, 10], [-4.9, -0.9, 10]]); fs(q, '#6a4228', 3);
    q.beginPath(); quad3(q, [[-4.6, -4.2, 10], [4.6, -4.2, 10], [4.6, -1.2, 10], [-4.6, -1.2, 10]]); fs(q, '#2f4a3e', 2);
    // 远墙上的圆窗
    { const c = hp(0, 3.4, 10); q.beginPath(); circ(q, c[0], c[1], 58); fs(q, '#e8dcc4', 3); q.beginPath(); circ(q, c[0], c[1], 46); fs(q, '#a8c8e8', 2.5); line(q, c[0] - 46, c[1], c[0] + 46, c[1], 3, '#e8dcc4'); line(q, c[0], c[1] - 46, c[0], c[1] + 46, 3, '#e8dcc4'); }
    // 左墙（窗）/ 右墙（护墙板、画像）
    q.beginPath(); quad3(q, [[-8, FL, 10], [-8, 9, 10], [-8, 9, 0.9], [-8, -3, 0.9]]); fs(q, '#dcc6a0', 3);
    q.beginPath(); quad3(q, [[8, FL, 10], [8, 9, 10], [8, 9, 0.9], [8, -3, 0.9]]); fs(q, '#cfb690', 3);
    q.beginPath(); quad3(q, [[8, FL, 10], [8, -1, 10], [8, 0.6, 0.9], [8, -3, 0.9]]); fs(q, '#8a5a3a', 3);
    for (const z of [2.4, 4.0, 5.9, 7.9]) { q.beginPath(); quad3(q, [[8, 1.6, z], [8, 4.6, z], [8, 4.6, z + 1.0], [8, 1.6, z + 1.0]]); fs(q, '#b88a4a', 2.5); q.beginPath(); quad3(q, [[8, 1.9, z + 0.12], [8, 4.3, z + 0.12], [8, 4.3, z + 0.88], [8, 1.9, z + 0.88]]); fs(q, ['#6a5a4a', '#5a4a5a', '#4a5a4a', '#6a4a3a'][(z * 3) % 4 | 0], 1.5); }
    // 左墙的尖拱长窗
    for (const [z0, z1] of [[1.5, 2.8], [3.6, 4.7], [5.5, 6.5], [7.4, 8.3]]) {
      q.beginPath(); quad3(q, [[-8, -1.6, z0], [-8, 5.2, z0], [-8, 6.5, (z0 + z1) / 2], [-8, 5.2, z1], [-8, -1.6, z1]]);
      fs(q, lg(q, 0, -200, 0, 600, [[0, '#fff6dc'], [0.6, '#cfe2f0'], [1, '#9ab8d4']]), 3);
      { const a = hp(-8, 5.7, (z0 + z1) / 2), b = hp(-8, -1.6, (z0 + z1) / 2); q.beginPath(); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]); q.lineWidth = 3; q.strokeStyle = '#dcc6a0'; q.stroke(); }
      { const a = hp(-8, 2, z0), b = hp(-8, 2, z1); line(q, a[0], a[1], b[0], b[1], 3, '#dcc6a0'); }
    }
    // 拱顶的肋
    for (let z = 1.2; z < 10; z += 1.2) {
      q.beginPath(); const a = hp(-8, 7, z), b = hp(0, 9.6, z), c = hp(8, 7, z); q.moveTo(a[0], a[1]); q.quadraticCurveTo(b[0], b[1] - 40 / z, c[0], c[1]); q.lineWidth = max(2, 20 / z); q.strokeStyle = '#8a6a4a'; q.stroke();
    }
    q.save(); q.globalCompositeOperation = 'multiply'; q.fillStyle = lg(q, 0, 0, 0, 300, [[0, 'rgba(90,60,50,.55)'], [1, 'rgba(90,60,50,0)']]); q.fillRect(0, 0, w, 300); q.restore();
    // 讲台前的地面 + 讲台
    q.beginPath(); quad3(q, [[-8, FL, 10], [8, FL, 10], [8, FL, 8.4], [-8, FL, 8.4]]); fs(q, '#9a6a44', 2);
    q.beginPath(); quad3(q, [[-2.8, FL, 9.2], [-1.4, FL, 9.2], [-1.4, FL + 1.2, 9.2], [-2.8, FL + 1.2, 9.2]]); fs(q, '#7a4a2c', 2.5);
    // 阶梯座位：从前往后画（前排远、在上；后排近、在下）
    const band = (Y0, dz0, Y1, dz1, i, col, lw = 2) => {
      q.beginPath();
      for (let k = 0; k <= 20; k++) { const X = -8 + k * 0.8, [x, y] = hp(X, Y0, rowZX(i, X) + dz0); k ? q.lineTo(x, y) : q.moveTo(x, y); }
      for (let k = 20; k >= 0; k--) { const X = -8 + k * 0.8, [x, y] = hp(X, Y1, rowZX(i, X) + dz1); q.lineTo(x, y); }
      q.closePath(); fs(q, col, lw);
    };
    for (let i = 0; i < ROWS; i++) {
      const yb = rowY(i);
      band(yb, -0.42, yb, 0.42, i, i % 2 ? '#b88a5a' : '#b0824f');     // 这一层的地面
      band(yb - 0.27, 0.42, yb, 0.42, i, '#8a5a36', 1.5);               // 台阶的立面（往下一层）
      band(yb + 0.82, -0.36, yb, -0.36, i, '#7a4a2c', 1.5);             // 桌子背板（朝着学生这一面）
      band(yb + 0.82, -0.62, yb + 0.82, -0.36, i, '#c8925a', 1.5);     // 桌面
      const R = rng(80 + i);
      for (let k = 0; k < 6; k++) { const X = -6 + k * 2.3 + R(), Z = rowZX(i, X) - 0.5, [x, y] = hp(X, yb + 0.83, Z), s2 = 32 / Z; q.fillStyle = R() < 0.5 ? '#fbf4e2' : BOOKC[floor(R() * 9)]; q.beginPath(); q.moveTo(x - s2, y); q.lineTo(x + s2, y); q.lineTo(x + s2 * 1.1, y + s2 * 0.35); q.lineTo(x - s2 * 0.9, y + s2 * 0.35); q.fill(); }
      // 学生（后脑勺 + 肩）
      for (let k = 0; k < 13; k++) {
        const X = -6.6 + k * 1.1 + (R() - 0.5) * 0.3;
        if (i === 0 && X > -1.6 && X < 2.6) continue;
        if (R() < 0.22) continue;
        const Z = rowZX(i, X) + 0.05, [x, y] = hp(X, yb + 1.28, Z), r = 0.27 * HP.f / Z;
        q.beginPath(); q.ellipse(x, y + r * 1.7, r * 1.55, r * 1.15, 0, PI, TAU); q.lineTo(x + r * 1.55, y + r * 2.4); q.lineTo(x - r * 1.55, y + r * 2.4); q.closePath(); fs(q, ['#3f5a8a', '#6a4a5a', '#4a6a5a', '#8a6a4a', '#5a5a6a', '#9a5a4a'][floor(R() * 6)], 1.5);
        const hair = ['#4a3228', '#2a2230', '#8a5a3a', '#c8a060', '#6a4a3a', '#3a2a22', '#d8d0c8', '#7a4a6a'][floor(R() * 8)];
        // 泰拉的学生各有各的种族：猫耳、兔耳、角、光环……
        const race = R();
        if (race < 0.2) { for (const sd of [-1, 1]) { q.beginPath(); q.moveTo(x + sd * r * 0.35, y - r * 0.75); q.lineTo(x + sd * r * 0.95, y - r * 1.45); q.lineTo(x + sd * r * 0.95, y - r * 0.35); q.closePath(); fs(q, hair, 1.2); } }
        else if (race < 0.3) { for (const sd of [-1, 1]) { q.beginPath(); q.ellipse(x + sd * r * 0.4, y - r * 1.35, r * 0.22, r * 0.6, sd * 0.2, 0, TAU); fs(q, hair, 1.2); } }
        else if (race < 0.42) { q.strokeStyle = '#e8d8b8'; q.lineWidth = r * 0.28; q.lineCap = 'round'; for (const sd of [-1, 1]) { q.beginPath(); q.arc(x + sd * r * 0.75, y - r * 0.55, r * 0.4, sd > 0 ? -1.4 : PI + 1.4, sd > 0 ? 0.6 : PI - 0.6, sd < 0); q.stroke(); } }
        else if (race < 0.47) { q.beginPath(); q.ellipse(x, y - r * 1.35, r * 0.75, r * 0.22, 0, 0, TAU); q.lineWidth = r * 0.14; q.strokeStyle = '#ffe9a0'; q.stroke(); }
        q.beginPath(); circ(q, x, y, r); fs(q, hair, 1.5);
        q.fillStyle = 'rgba(255,255,255,.18)'; q.beginPath(); q.ellipse(x - r * 0.3, y - r * 0.35, r * 0.4, r * 0.22, -0.5, 0, TAU); q.fill();
        if (R() < 0.3) { q.beginPath(); q.moveTo(x - r * 0.2, y + r * 0.7); q.quadraticCurveTo(x, y + r * 1.9, x + r * 0.25, y + r * 1.6); q.lineWidth = r * 0.45; q.strokeStyle = hair; q.stroke(); }
      }
    }
    // 最近一排下面（镜头脚下）
    q.beginPath();
    for (let k = 0; k <= 20; k++) { const X = -8 + k * 0.8, [x, y] = hp(X, rowY(ROWS - 1), rowZX(ROWS - 1, X) + 0.42); k ? q.lineTo(x, y) : q.moveTo(x, y); }
    q.lineTo(w + 40, h + 40); q.lineTo(-40, h + 40); q.closePath(); fs(q, '#8a5a36', 2);
    // 前景：我们自己这一排的课桌（摊开的笔记本、铅笔、墨水瓶）
    q.beginPath(); q.moveTo(-40, 850); q.lineTo(1960, 826); q.lineTo(1960, 1100); q.lineTo(-40, 1100); q.closePath();
    fs(q, lg(q, 0, 826, 0, 1080, [[0, '#d09a62'], [1, '#9a6a40']]), 5);
    q.save(); q.clip(); q.strokeStyle = 'rgba(90,50,20,.18)'; q.lineWidth = 3; for (let i = 0; i < 9; i++) { const y = 860 + i * 26; q.beginPath(); q.moveTo(-40, y); q.bezierCurveTo(600, y - 8, 1300, y + 10, 1960, y - 22); q.stroke(); } q.restore();
    q.fillStyle = 'rgba(255,230,190,.35)'; q.beginPath(); q.moveTo(-40, 850); q.lineTo(1960, 826); q.lineTo(1960, 834); q.lineTo(-40, 858); q.fill();
    q.save(); q.translate(700, 960); q.rotate(-0.04);
    q.fillStyle = 'rgba(0,0,0,.2)'; q.fillRect(-300, -70, 620, 190);
    for (const sd of [-1, 1]) { q.beginPath(); q.moveTo(0, -80); q.quadraticCurveTo(sd * 150, -92, sd * 300, -80); q.lineTo(sd * 300, 110); q.quadraticCurveTo(sd * 150, 100, 0, 112); q.closePath(); fs(q, '#fbf6e8', 4); for (let i = 0; i < 5; i++) line(q, sd * 30, -44 + i * 30, sd * 270, -44 + i * 30, 2.5, 'rgba(80,120,190,.3)'); }
    q.beginPath(); q.moveTo(-230, 70); q.lineTo(-170, -20); q.lineTo(-140, -20); q.lineTo(-80, 70); q.lineWidth = 4; q.strokeStyle = 'rgba(60,60,70,.7)'; q.stroke();
    q.restore();
    q.save(); q.translate(1240, 990); q.rotate(-0.12); q.beginPath(); rrect(q, -170, -12, 340, 24, 8); fs(q, '#f2c46a', 3.5); q.beginPath(); poly(q, [170, -12, 206, 0, 170, 12]); fs(q, '#e8d0a0', 3); q.restore();
    q.beginPath(); rrect(q, 1500, 880, 90, 80, 14); fs(q, '#3a4a6a', 4); q.beginPath(); rrect(q, 1522, 862, 46, 22, 5); fs(q, '#2a2a3a', 3);
    // 吊灯链
    for (const [X, Z] of [[-3.5, 3.4], [3.5, 3.4], [-3.5, 6.6], [3.5, 6.6]]) { const a = hp(X, 9, Z), b = hp(X, 5.2, Z); line(q, a[0], a[1], b[0], b[1], 2, 'rgba(58,38,32,.7)'); q.beginPath(); circ(q, b[0], b[1] + 40 / Z, 60 / Z); fs(q, '#ffe9b8', 2); }
  });
  /** 讲堂全景里的动态：光束、灯、黑板上的粉笔画、讲课的爸爸、前排三个人 */
  function hallWideDyn(q, s, t) {
    q.save(); q.globalCompositeOperation = 'lighter';
    for (const [z0, z1] of [[1.5, 2.8], [3.6, 4.7], [5.5, 6.5], [7.4, 8.3]]) {
      const a = hp(-8, 5.2, z0), b = hp(-8, 5.2, z1), c = hp(2.5, -4.6, z1 + 0.8), d = hp(2.5, -4.6, z0 + 0.8);
      const fl = 0.55 + 0.25 * sin(t * 0.7 + z0) + 0.2 * s.lo;
      q.fillStyle = lg(q, a[0], a[1], c[0], c[1], [[0, `rgba(255,236,190,${0.22 * fl})`], [1, 'rgba(255,236,190,0)']]);
      q.beginPath(); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]); q.lineTo(c[0], c[1]); q.lineTo(d[0], d[1]); q.closePath(); q.fill();
    }
    q.restore();
    for (const [X, Z] of [[-3.5, 3.4], [3.5, 3.4], [-3.5, 6.6], [3.5, 6.6]]) { const b = hp(X, 5.2, Z); glow(q, b[0], b[1] + 40 / Z, 300 / Z, '255,220,150', 0.35 + 0.25 * s.lo); }
    // 黑板上的粉笔火山（随重拍长出来）
    const [bx0] = hp(-4.6, -1.2, 10), [bx1, by1] = hp(4.6, -4.2, 10);
    chalkVolcano(q, (bx0 + bx1) / 2 + 20, by1 - 8, (bx1 - bx0) / 1000, clamp((t - B(21)) / 6), t, 2.4);
    // 爸爸：背对着我们站在黑板前，一边讲一边画那座粉笔火山（远远的背影，不露脸）
    const [fx, fy] = hp(-2.6, -5, 9.25);
    who(q, 'katia', { x: fx, y: fy, h: 104, pose: 'point', aim: 0.5 + 0.25 * sin(t * 2.2), view: 'back', t, outfit: 'suit' });
    // 前排的三个人：和满堂的同学一样画成后脑勺 + 肩膀（同一种画法，不会一眼看出是另一套小人），各带一个认得出的特征：
    // 阿黛尔的小羊角、芳汀的光环、莉瑟的兔耳和背上的大提琴
    const back = (X, hair, cloth, feat) => {
      const Z = rowZX(0, X) + 0.05, [x, y] = hp(X, rowY(0) + 1.28, Z), r = 0.27 * HP.f / Z;
      if (feat === 'cello') { q.save(); q.translate(x + r * 1.2, y + r * 0.6); q.rotate(0.22); q.beginPath(); rrect(q, -r * 0.16, -r * 2.2, r * 0.32, r * 2.4, r * 0.12); fs(q, '#6a3a22', 1.5); q.beginPath(); ell(q, 0, -r * 2.3, r * 0.22, r * 0.3); fs(q, '#3a2418', 1.2); q.restore(); }
      q.beginPath(); q.ellipse(x, y + r * 1.7, r * 1.55, r * 1.15, 0, PI, TAU); q.lineTo(x + r * 1.55, y + r * 2.4); q.lineTo(x - r * 1.55, y + r * 2.4); q.closePath(); fs(q, cloth, 1.5);
      if (feat === 'rabbit') for (const sd of [-1, 1]) { q.beginPath(); q.ellipse(x + sd * r * 0.4, y - r * 1.35, r * 0.22, r * 0.62, sd * 0.2, 0, TAU); fs(q, hair, 1.2); }
      q.beginPath(); circ(q, x, y, r); fs(q, hair, 1.5);
      q.fillStyle = 'rgba(255,255,255,.18)'; q.beginPath(); q.ellipse(x - r * 0.3, y - r * 0.35, r * 0.4, r * 0.22, -0.5, 0, TAU); q.fill();
      if (feat === 'horns') { q.strokeStyle = '#efe4d0'; q.lineWidth = r * 0.3; q.lineCap = 'round'; for (const sd of [-1, 1]) { q.beginPath(); q.arc(x + sd * r * 0.72, y - r * 0.5, r * 0.4, sd > 0 ? -1.4 : PI + 1.4, sd > 0 ? 0.7 : PI - 0.7, sd < 0); q.stroke(); } q.beginPath(); q.moveTo(x - r * 0.3, y + r * 0.7); q.quadraticCurveTo(x - r * 0.1, y + r * 2.1, x + r * 0.3, y + r * 1.9); q.lineWidth = r * 0.5; q.strokeStyle = hair; q.stroke(); }
      if (feat === 'halo') { q.beginPath(); q.ellipse(x, y - r * 1.35, r * 0.75, r * 0.22, 0, 0, TAU); q.lineWidth = r * 0.14; q.strokeStyle = '#ffe9a0'; q.stroke(); glow(q, x, y - r * 1.35, r * 1.6, '255,240,170', 0.5 + 0.3 * s.pulse(5)); }
      if (feat === 'rabbit') { q.beginPath(); q.moveTo(x + r * 0.5, y + r * 0.5); q.quadraticCurveTo(x + r * 1.1, y + r * 1.4, x + r * 0.7, y + r * 2.2); q.lineWidth = r * 0.36; q.strokeStyle = hair; q.stroke(); }
    };
    back(1.9, '#b8603a', '#6a2e3a', 'cello'); back(1.9, '#b8603a', '#6a2e3a', 'rabbit');
    back(0.55, '#e8d49a', '#2e3a5a', 'halo');
    back(-0.75, '#7a4a30', '#2e3a5a', 'horns');
  }
  /** 粉笔画的火山剖面：中心底边 (cx, by)，缩放 k，p 为画出来的进度 0..1 */
  const CHALK = (() => {
    const L = [];
    const add = (pts, w = 1) => L.push({ pts, w });
    add([-360, 0, -150, -250, -60, -262]); add([60, -262, 150, -250, 360, 0]);           // 山体
    add([-60, -262, -30, -238, 30, -238, 60, -262]);                                      // 火山口
    add([-18, -240, -12, -120, -16, -40, 0, 40]); add([18, -240, 12, -120, 16, -40, 0, 40]);// 火山通道
    add([-120, 70, -60, 40, 60, 40, 120, 70, 60, 110, -60, 110, -120, 70]);              // 岩浆房
    add([-300, 0, -200, 20, -100, 10, 0, 30, 110, 10, 220, 24, 330, 0], 0.7);            // 地层
    add([-340, 140, -170, 160, 0, 150, 170, 162, 340, 140], 0.7);
    add([-10, -270, -40, -330, -10, -380, 30, -420, 10, -470, 50, -500], 0.9);           // 烟柱
    add([10, -280, 50, -330, 90, -350, 120, -400], 0.8);
    add([200, -200, 240, -230], 0.8); add([250, -170, 300, -186], 0.8);                   // 标注线
    return L.map((s) => ({ ...s, pts: catmull(s.pts, 6) }));
  })();
  function chalkVolcano(q, cx, by, k, p, t, lw = 7) {
    if (p <= 0) return null;
    q.save(); q.translate(cx, by); q.scale(k, k);
    q.lineCap = 'round'; q.lineJoin = 'round'; q.strokeStyle = 'rgba(245,245,235,.9)';
    const n = CHALK.length;
    let tip = null;
    for (let i = 0; i < n; i++) {
      const f = clamp(p * n - i);
      if (f <= 0) break;
      const S = CHALK[i], pts = S.pts, m = max(2, floor((pts.length / 2) * f));
      q.lineWidth = lw * S.w / k * 0.5 + 3;
      q.beginPath(); q.moveTo(pts[0], pts[1]); for (let j = 1; j < m; j++) q.lineTo(pts[j * 2], pts[j * 2 + 1]); q.stroke();
      tip = [pts[(m - 1) * 2], pts[(m - 1) * 2 + 1]];
    }
    if (p > 0.55) { q.globalAlpha = clamp((p - 0.55) * 4) * 0.8; q.fillStyle = 'rgba(255,130,90,.55)'; q.beginPath(); q.ellipse(0, 75, 100, 32, 0, 0, TAU); q.fill(); q.globalAlpha = 1; }
    if (p > 0.9) { E.text(q, '岩浆房', 190, 100, { size: 34, color: 'rgba(245,245,235,.9)', font: KAI, align: 'left' }); E.text(q, '火山通道', 250, -214, { size: 34, color: 'rgba(245,245,235,.9)', font: KAI, align: 'left' }); }
    q.restore();
    return tip ? [cx + tip[0] * k, by + tip[1] * k] : null;
  }
  /** 侧面的阶梯教室：黑板在右，前排长桌，后排往左上升，高窗 */
  reg('hall-side', 2400, VH, (q, w, h) => {
    q.fillStyle = lg(q, 0, 0, 0, h, [[0, '#d8c0a0'], [1, '#c8a880']]); q.fillRect(0, 0, w, h);
    // 高窗
    for (const wx of [300, 820, 1340]) {
      q.beginPath(); q.moveTo(wx - 110, 560); q.lineTo(wx - 110, 150); q.quadraticCurveTo(wx - 110, 40, wx, -10); q.quadraticCurveTo(wx + 110, 40, wx + 110, 150); q.lineTo(wx + 110, 560); q.closePath();
      fs(q, lg(q, 0, 0, 0, 560, [[0, '#fff4d8'], [1, '#bcd4e8']]), 5);
      line(q, wx, 10, wx, 560, 5, '#d8c0a0'); for (let y = 180; y < 560; y += 130) line(q, wx - 110, y, wx + 110, y, 5, '#d8c0a0');
    }
    // 黑板（右墙）
    q.beginPath(); q.rect(1820, 200, 600, 470); fs(q, '#6a4228', 6); q.beginPath(); q.rect(1846, 226, 560, 420); fs(q, '#2f4a3e', 4);
    q.save(); q.globalAlpha = 0.2; q.fillStyle = '#fff'; const R = rng(5); for (let i = 0; i < 40; i++) { q.beginPath(); q.ellipse(1860 + R() * 520, 250 + R() * 380, 30 + R() * 50, 8 + R() * 10, R(), 0, TAU); q.fill(); } q.restore();
    q.beginPath(); q.rect(1830, 646, 590, 16); fs(q, '#8a5a3a', 4);
    // 阶梯（往左升高）
    for (let i = 3; i >= 0; i--) {
      const x1 = 1500 - i * 480, y = 800 - i * 120;
      q.beginPath(); q.rect(-100, y + 40, x1 + 100, 1080 - y); fs(q, i % 2 ? '#a8784e' : '#b88a5a', 4);
      if (i > 0) {
        const R2 = rng(20 + i);
        for (let k = 0; k < 7; k++) { const sx = x1 - 140 - k * 150 + R2() * 40, r = 34 - i * 3; q.beginPath(); q.ellipse(sx, y - 20, r * 1.6, r * 1.2, 0, PI, TAU); fs(q, ['#3f5a8a', '#6a4a5a', '#4a6a5a', '#8a6a4a'][k % 4], 3); q.beginPath(); circ(q, sx + 6, y - 70, r); fs(q, ['#4a3228', '#2a2230', '#8a5a3a', '#c8a060', '#6a4a3a'][(k + i) % 5], 3); }
      }
      q.beginPath(); q.rect(x1 - 1100, y - 36, 1100, 34); fs(q, '#c8925a', 4); q.beginPath(); q.rect(x1 - 1100, y - 2, 1100, 70); fs(q, '#8a5a36', 4);
    }
    q.fillStyle = '#9a6a44'; q.fillRect(0, 1000, w, 80);
  });
  reg('chalkboard', VW, VH, (q, w, h) => {
    q.fillStyle = '#6a4228'; q.fillRect(0, 0, w, h);
    q.beginPath(); q.rect(60, 40, 1800, 900); fs(q, lg(q, 0, 40, 0, 940, [[0, '#355244'], [1, '#2a4238']]), 6);
    q.save(); q.beginPath(); q.rect(60, 40, 1800, 900); q.clip();
    const R = rng(7); q.fillStyle = 'rgba(255,255,255,.07)'; for (let i = 0; i < 60; i++) { q.beginPath(); q.ellipse(R() * w, 60 + R() * 860, 60 + R() * 140, 14 + R() * 20, R() * 0.4, 0, TAU); q.fill(); }
    E.text(q, '天灾与火山 · 第六讲', 140, 140, { size: 56, color: 'rgba(245,245,235,.85)', font: KAI, align: 'left' });
    q.restore();
    q.beginPath(); q.rect(40, 940, 1840, 40); fs(q, '#8a5a3a', 5);
    for (let i = 0; i < 5; i++) { q.beginPath(); rrect(q, 300 + i * 70, 918, 50, 18, 8); fs(q, ['#fffaf0', '#fff3a0', '#ffc0c0', '#fffaf0', '#c0e0ff'][i], 2.5); }
    q.fillStyle = '#5a3a26'; q.fillRect(0, 980, w, 100);
  });
  reg('notebook', VW, VH, (q, w, h) => {
    planks(q, 0, 0, w, h, '#b4804e', '#9a6a40', 71, 8);
    q.save(); q.translate(980, 560); q.rotate(-0.05);
    q.fillStyle = 'rgba(0,0,0,.25)'; q.fillRect(-620, -390, 1260, 820);
    q.beginPath(); q.rect(-640, -410, 1280, 820); fs(q, '#fbf6e8', 5);
    line(q, 0, -410, 0, 410, 4, 'rgba(58,38,32,.35)');
    q.strokeStyle = 'rgba(80,120,190,.3)'; q.lineWidth = 2; for (let y = -340; y < 400; y += 48) { line(q, -620, y, -20, y, 2, 'rgba(80,120,190,.3)'); line(q, 20, y, 620, y, 2, 'rgba(80,120,190,.3)'); }
    line(q, -540, -410, -540, 410, 2.5, 'rgba(226,87,76,.45)');
    E.text(q, '6月 · 火山的构造', -500, -350, { size: 44, font: KAI, color: '#2c3e7a', align: 'left' });
    q.restore();
    q.save(); q.translate(1600, 860); q.rotate(0.5); q.beginPath(); rrect(q, -12, -220, 24, 400, 8); fs(q, '#f2c46a', 3.5); q.restore();
    q.save(); q.translate(300, 900); q.rotate(-0.3); q.beginPath(); rrect(q, -60, -30, 120, 60, 10); fs(q, '#f6b0b0', 3.5); q.restore();
  });
  /** 阿黛尔的笔记（铅笔画：小一号的火山 + 一只小羊） */
  const DOODLE = (() => {
    const L = [];
    L.push([-300, 160, -120, -60, -40, -70]); L.push([40, -70, 120, -60, 300, 160]); L.push([-40, -70, 0, -52, 40, -70]);
    L.push([-8, -60, -6, 60, 0, 120]); L.push([8, -60, 6, 60, 0, 120]);
    L.push([-90, 170, -40, 140, 40, 140, 90, 170, 40, 200, -40, 200, -90, 170]);
    L.push([-10, -90, -40, -150, 0, -200, 30, -260]);
    L.push([200, -120, 230, -140, 262, -136, 284, -114, 280, -86, 252, -72, 220, -76, 198, -94, 200, -120]); // 小羊的毛
    L.push([276, -110, 300, -112, 310, -96, 296, -84, 280, -88]);                                          // 小羊的脸
    L.push([226, -76, 224, -56]); L.push([256, -72, 256, -52]);
    return L.map((p) => catmull(p, 6));
  })();
  function doodle(q, cx, cy, k, p, col = 'rgba(60,60,70,.85)') {
    q.save(); q.translate(cx, cy); q.scale(k, k); q.lineCap = 'round'; q.lineJoin = 'round'; q.strokeStyle = col; q.lineWidth = 5 / k * 0.9 + 2;
    const n = DOODLE.length;
    let tip = null;
    for (let i = 0; i < n; i++) { const f = clamp(p * n - i); if (f <= 0) break; const pts = DOODLE[i], m = max(2, floor((pts.length / 2) * f)); q.beginPath(); q.moveTo(pts[0], pts[1]); for (let j = 1; j < m; j++) q.lineTo(pts[j * 2], pts[j * 2 + 1]); q.stroke(); tip = [pts[(m - 1) * 2], pts[(m - 1) * 2 + 1]]; }
    q.restore();
    return tip ? [cx + tip[0] * k, cy + tip[1] * k] : null;
  }

  /* =========================================================
   * 图书馆：高书架的长廊（一点透视）、阅览桌（侧面）
   * ========================================================= */
  const LP = { vx: 960, vy: 470, f: 560 };
  const lp = (X, Y, Z) => [LP.vx + (LP.f * X) / Z, LP.vy - (LP.f * Y) / Z];
  function lquad(q, P) { const a = lp(...P[0]); q.moveTo(a[0], a[1]); for (let i = 1; i < P.length; i++) { const b = lp(...P[i]); q.lineTo(b[0], b[1]); } q.closePath(); }
  reg('library', VW, VH, (q, w, h) => {
    q.fillStyle = '#4a3024'; q.fillRect(0, 0, w, h);
    // 尽头的墙 + 大拱窗
    q.beginPath(); lquad(q, [[-4, -3, 14], [4, -3, 14], [4, 9, 14], [-4, 9, 14]]); fs(q, '#8a6444', 3);
    q.beginPath(); { const a = lp(-2, -1, 14), b = lp(2, 6.5, 14), c = lp(0, 8.4, 14); q.moveTo(a[0], a[1] + 30); q.lineTo(a[0], b[1]); q.quadraticCurveTo(a[0], c[1], c[0], c[1]); q.quadraticCurveTo(b[0], c[1], b[0], b[1]); q.lineTo(b[0], a[1] + 30); q.closePath(); }
    fs(q, lg(q, 0, 100, 0, 500, [[0, '#fff8e0'], [1, '#d8e8f0']]), 3);
    { const a = lp(0, 8.4, 14), b = lp(0, -1, 14); line(q, a[0], a[1], b[0], b[1] + 30, 4, '#8a6444'); const c = lp(-2, 3, 14), d = lp(2, 3, 14); line(q, c[0], c[1], d[0], d[1], 4, '#8a6444'); }
    // 天花板（拱）
    q.beginPath(); lquad(q, [[-4, 9, 14], [4, 9, 14], [4, 9, 1], [-4, 9, 1]]); fs(q, '#5a3a2a', 2);
    for (let z = 1.5; z < 14; z += 1.6) { const a = lp(-4, 8, z), b = lp(0, 10.5, z), c = lp(4, 8, z); q.beginPath(); q.moveTo(a[0], a[1]); q.quadraticCurveTo(b[0], b[1], c[0], c[1]); q.lineWidth = max(2, 26 / z); q.strokeStyle = '#7a5238'; q.stroke(); }
    // 两侧书架（三层，每层一格格书）
    for (const side of [-1, 1]) {
      const X = side * 4;
      q.beginPath(); lquad(q, [[X, -3, 14], [X, 8, 14], [X, 8, 0.8], [X, -3, 0.8]]); fs(q, '#6a4228', 3);
      const R = rng(side > 0 ? 3 : 4);
      for (let lv = 0; lv < 9; lv++) {
        const y0 = -2.6 + lv * 1.2, y1 = y0 + 1.0;
        for (let z = 1; z < 14; z += 0.34 + R() * 0.1) {
          const z2 = z + 0.26 + R() * 0.06, hh = 0.7 + R() * 0.28;
          q.beginPath(); lquad(q, [[X, y0, z], [X, y0 + hh, z], [X, y0 + hh, z2], [X, y0, z2]]); q.fillStyle = BOOKC[floor(R() * BOOKC.length)]; q.fill();
        }
        q.beginPath(); lquad(q, [[X, y1 + 0.02, 14], [X, y1 + 0.2, 14], [X, y1 + 0.2, 0.8], [X, y1 + 0.02, 0.8]]); fs(q, '#8a5a3a', 1.5);
      }
      // 书架间的立柱
      for (let z = 1.2; z < 14; z += 2.2) { q.beginPath(); lquad(q, [[X, -3, z], [X, 8, z], [X, 8, z + 0.25], [X, -3, z + 0.25]]); fs(q, '#5a3622', 1.5); }
      // 梯子轨道
      const a = lp(X, 6.9, 14), b = lp(X, 6.9, 0.8); line(q, a[0], a[1], b[0], b[1], 3, '#c8a060');
    }
    // 地面 + 地毯 + 长桌
    q.beginPath(); lquad(q, [[-4, -3, 14], [4, -3, 14], [4, -3, 0.8], [-4, -3, 0.8]]); fs(q, '#7a5034', 2);
    q.beginPath(); lquad(q, [[-1.2, -3, 14], [1.2, -3, 14], [1.2, -3, 0.8], [-1.2, -3, 0.8]]); fs(q, '#8a3a36', 2);
    q.beginPath(); lquad(q, [[-0.9, -3, 14], [0.9, -3, 14], [0.9, -3, 0.8], [-0.9, -3, 0.8]]); fs(q, null, 2, '#e8c064');
    q.beginPath(); lquad(q, [[-1, -2, 12.5], [1, -2, 12.5], [1, -2, 6], [-1, -2, 6]]); fs(q, '#a8703e', 2);
    q.beginPath(); lquad(q, [[-1, -2, 6], [1, -2, 6], [1, -2.3, 6], [-1, -2.3, 6]]); fs(q, '#7a4a28', 2);
    for (const z of [7.5, 9.5, 11.5]) { const a = lp(0, -2, z), b = lp(0, -0.9, z); line(q, a[0], a[1], b[0], b[1], 3, '#6a4a3a'); q.beginPath(); q.ellipse(b[0], b[1], 60 / z * 3, 18 / z * 3, 0, 0, TAU); fs(q, '#3f7a5a', 2); }
  });
  function libraryDyn(q, s, t) {
    const a = lp(0, 7.5, 14);
    // 尽头拱窗照进来的柔边光束（后期工具箱），落在长桌和地毯上
    const F = E.finish;
    if (F && F.enabled) F.rays(q, s, { x: a[0], y: a[1] + 40, angle: PI / 2, spread: 1.25, n: 6, len: 1250, width: [70, 200], rgb: '255,226,170', a: 0.15, seed: 27 });
    q.save(); q.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const ang = -0.5 + i * 0.25, fl = 0.55 + 0.3 * sin(t * 0.6 + i * 1.3) + 0.15 * s.lo;
      shaft(q, a[0] + (i - 2) * 30, a[1], ang, 170 + i * 20, 1200, 0.22 * fl);
    }
    q.restore();
    for (const z of [7.5, 9.5, 11.5]) { const b = lp(0, -0.9, z); glow(q, b[0], b[1] + 10, 200 / z * 3, '255,220,140', 0.5); }
  }
  reg('reading', VW, VH, (q, w, h) => {
    q.fillStyle = lg(q, 0, 0, 0, h, [[0, '#5a3a2a'], [1, '#3e281e']]); q.fillRect(0, 0, w, h);
    // 背后的书架
    const R = rng(9);
    for (let lv = 0; lv < 5; lv++) {
      const y1 = 140 + lv * 150;
      let x = -20;
      while (x < w) { const bw = 24 + R() * 26, bh = 90 + R() * 40; q.beginPath(); rrect(q, x, y1 - bh, bw, bh, 3); fs(q, BOOKC[floor(R() * BOOKC.length)], 2.5); if (R() < 0.3) { q.fillStyle = 'rgba(255,220,150,.5)'; q.fillRect(x + 4, y1 - bh + 12, bw - 8, 5); } x += bw + 2; if (R() < 0.05) x += 60; }
      q.beginPath(); q.rect(-10, y1, w + 20, 18); fs(q, '#7a4e30', 4);
    }
    q.fillStyle = 'rgba(30,20,20,.35)'; q.fillRect(0, 0, w, h);
    // 窗光
    q.save(); q.globalCompositeOperation = 'lighter'; q.fillStyle = lg(q, 0, 0, 900, 900, [[0, 'rgba(255,230,180,.35)'], [1, 'rgba(255,230,180,0)']]); q.beginPath(); q.moveTo(0, 0); q.lineTo(700, 0); q.lineTo(1400, 1080); q.lineTo(400, 1080); q.fill(); q.restore();
  });
  /** 阅览桌（前景，透明底）：人坐在桌子后面，所以桌子最后画 */
  reg('reading-fg', VW, VH, (q, w, h) => {
    q.beginPath(); q.rect(-20, 760, w + 40, 44); fs(q, '#a8703e', 5); q.beginPath(); q.rect(-20, 804, w + 40, 276); fs(q, '#6a4228', 5);
    q.fillStyle = 'rgba(255,220,160,.25)'; q.fillRect(-20, 764, w + 40, 8);
    for (let x = 60; x < w; x += 360) { q.beginPath(); rrect(q, x, 840, 300, 200, 10); fs(q, null, 4, 'rgba(0,0,0,.3)'); }
    for (const lx of [240, 1700]) { q.beginPath(); q.moveTo(lx - 110, 560); q.lineTo(lx + 110, 560); q.lineTo(lx + 80, 500); q.lineTo(lx - 80, 500); q.closePath(); fs(q, '#3f7a5a', 5); line(q, lx, 560, lx, 760, 7, '#c89a3a'); q.beginPath(); q.ellipse(lx, 760, 60, 12, 0, 0, TAU); fs(q, '#c89a3a', 4); }
    for (const [bx, c, r] of [[700, '#8a3a3a', -0.1], [1180, '#3e6a4a', 0.05]]) book(q, bx, 744, 170, 30, c, r);
  });
  /** 纸页（会扇动的“鸟”）：中心 (x, y)，flap 相位，s 大小 */
  function pageBird(q, x, y, s, ph, rot, a = 1) {
    const f = sin(ph);
    q.save(); q.translate(x, y); q.rotate(rot); q.globalAlpha *= a;
    q.fillStyle = '#fbf6e8'; q.strokeStyle = 'rgba(58,38,32,.7)'; q.lineWidth = 2;
    for (const d of [-1, 1]) { q.beginPath(); q.moveTo(0, 0); q.lineTo(d * 40 * s, -24 * s * f - 6 * s); q.lineTo(d * 34 * s, 14 * s - 16 * s * f); q.closePath(); q.fill(); q.stroke(); }
    q.strokeStyle = 'rgba(80,120,190,.35)'; q.lineWidth = 1.2; for (let i = 1; i < 3; i++) { line(q, -30 * s + i * 4, -8 * s * f + i * 8 * s, -8 * s, i * 6 * s, 1.2, 'rgba(80,120,190,.35)'); }
    q.restore();
  }

  /* =========================================================
   * 河畔：远岸的城 + 河水（倒影）+ 石拱桥；近岸草坡 + 冰棍车。2400 宽，可平移
   * ========================================================= */
  const RIV = {
    afternoon: { water0: '#8cc4d8', water1: '#4f8cb4', grass0: '#9cc86a', grass1: '#6a9a4a', far: TOWN.noon, tree: ['#6aa05a', '#88b86a', '#548a4a'], stone: '#d8c8a8', light: null },
    golden: { water0: '#e8b88a', water1: '#8a7aa0', grass0: '#c8b860', grass1: '#8a8a40', far: TOWN.golden, tree: ['#9aa04a', '#b8b060', '#7a8040'], stone: '#e8c098', light: '#ffc27e' },
    sunset: { water0: '#f0a878', water1: '#6a5a8a', grass0: '#a88a58', grass1: '#6a5a40', far: TOWN.sunset, tree: ['#6a6a48', '#8a7a50', '#4a4a3a'], stone: '#c89880', light: '#ff9a60' },
  };
  const RIVER_Y = 540, BANK_Y = 800;
  function riverFar(q, pal) {
    const P = RIV[pal];
    // 远岸的城（天空透明）
    q.save(); q.translate(0, 0); skyline(q, 2400, 380, 21, P.far, { towerX: 1180 }); q.restore();
    // 远岸：堤岸与树
    const R = rng(31);
    for (let i = 0; i < 26; i++) { const x = i * 96 + R() * 40, r = 40 + R() * 30; q.beginPath(); blob(q, x, 440 - R() * 30, r * 1.2, r, 200 + i, 8, 0.22); fs(q, P.tree[i % 3], 3); }
    q.beginPath(); q.rect(-20, 470, 2440, 70); fs(q, P.stone, 3.5);
    for (let x = 0; x < 2400; x += 60) line(q, x, 470, x, 540, 1.5, 'rgba(58,38,32,.2)');
    line(q, -20, 505, 2420, 505, 1.5, 'rgba(58,38,32,.2)');
    for (let x = 10; x < 2400; x += 36) line(q, x, 470, x, 452, 3, 'rgba(58,38,32,.55)');
    line(q, -20, 452, 2420, 452, 3.5, 'rgba(58,38,32,.6)');
    // 河水
    q.fillStyle = lg(q, 0, RIVER_Y, 0, BANK_Y + 40, [[0, P.water0], [1, P.water1]]); q.fillRect(-20, RIVER_Y, 2440, BANK_Y + 40 - RIVER_Y);
    // 倒影：远岸翻过来，压扁、变淡
    q.save(); q.beginPath(); q.rect(-20, RIVER_Y, 2440, BANK_Y - RIVER_Y + 40); q.clip();
    q.translate(0, RIVER_Y * 2 - 4); q.scale(1, -0.62);
    q.globalAlpha = 0.28; skyline(q, 2400, 380, 21, P.far, { towerX: 1180 });
    for (let i = 0; i < 26; i++) { const R2 = rng(31); } q.globalAlpha = 1;
    q.restore();
    // 石拱桥（右边）
    const bx0 = 1480, bx1 = 2420, deck = 400;
    q.beginPath(); q.moveTo(bx0 - 60, RIVER_Y + 10); q.lineTo(bx0, deck); q.lineTo(bx1, deck); q.lineTo(bx1, RIVER_Y + 10); q.closePath(); fs(q, P.stone, 4);
    const arches = [[1640, 110], [1900, 130], [2180, 120]];
    for (const [ax, ar] of arches) { q.beginPath(); q.moveTo(ax - ar, RIVER_Y + 12); q.arc(ax, RIVER_Y + 12, ar, PI, 0); q.closePath(); fs(q, '#4a5a6a', 4); }
    for (let x = bx0; x < bx1; x += 44) line(q, x, deck, x, deck + 30, 2, 'rgba(58,38,32,.25)');
    q.beginPath(); q.rect(bx0 - 20, deck - 60, bx1 - bx0 + 40, 60); fs(q, P.stone, 4);
    for (let x = bx0; x < bx1; x += 50) { q.beginPath(); q.rect(x, deck - 50, 26, 40); fs(q, 'rgba(0,0,0,.18)', 0); }
    q.beginPath(); q.rect(bx0 - 30, deck - 72, bx1 - bx0 + 60, 16); fs(q, '#c8b898', 3);
    // 桥洞的倒影（拱 → 圆）
    q.save(); q.globalAlpha = 0.35; for (const [ax, ar] of arches) { q.beginPath(); q.moveTo(ax - ar, RIVER_Y + 12); q.arc(ax, RIVER_Y + 12, ar * 0.9, PI, 0, true); q.closePath(); q.fillStyle = '#2a3a4a'; q.fill(); } q.restore();
    // 水面的横纹
    q.strokeStyle = 'rgba(255,255,255,.22)'; q.lineWidth = 2.5;
    for (let i = 0; i < 70; i++) { const x = R() * 2400, y = RIVER_Y + 20 + R() * (BANK_Y - RIVER_Y), l = 20 + R() * 80; line(q, x, y, x + l, y, 2.5, 'rgba(255,255,255,.2)'); }
    if (P.light) streetGrade(q, pal, 2400, 1080);
  }
  function riverNear(q, pal) {
    const P = RIV[pal];
    const edge = (x) => BANK_Y + sin(x * 0.004) * 16 + sin(x * 0.011 + 1) * 8;
    q.beginPath(); q.moveTo(-20, edge(-20)); for (let x = 0; x <= 2420; x += 40) q.lineTo(x, edge(x)); q.lineTo(2420, 1220); q.lineTo(-20, 1220); q.closePath();
    fs(q, lg(q, 0, BANK_Y, 0, 1200, [[0, P.grass0], [1, P.grass1]]), 4);
    // 水边的一道浅色（湿泥 / 石子）
    q.beginPath(); for (let x = -20; x <= 2420; x += 40) q.lineTo(x, edge(x) + 6); q.lineWidth = 8; q.strokeStyle = 'rgba(230,220,180,.6)'; q.stroke();
    // 小路
    q.beginPath(); q.moveTo(-20, 930); q.bezierCurveTo(600, 900, 1400, 960, 2420, 910); q.lineTo(2420, 980); q.bezierCurveTo(1400, 1030, 600, 970, -20, 1000); q.closePath(); fs(q, pal === 'afternoon' ? '#e8d8a8' : '#d8b888', 3);
    // 草叶与野花
    const R = rng(71);
    q.strokeStyle = 'rgba(40,80,30,.35)'; q.lineWidth = 2.5; q.lineCap = 'round';
    for (let i = 0; i < 700; i++) { const x = R() * 2400, y = edge(x) + 10 + R() * 280; if (y > 900 && y < 1000) continue; const l = 10 + R() * 18; q.beginPath(); q.moveTo(x, y); q.quadraticCurveTo(x + 3, y - l * 0.6, x + (R() - 0.5) * 10, y - l); q.stroke(); }
    for (let i = 0; i < 160; i++) { const x = R() * 2400, y = edge(x) + 20 + R() * 260; if (y > 900 && y < 1000) continue; const c = R(); q.fillStyle = c < 0.5 ? '#fffaf0' : c < 0.8 ? '#ffd84a' : '#f4a0b8'; q.beginPath(); circ(q, x, y, 4 + R() * 4); q.fill(); if (c < 0.5) { q.fillStyle = '#f2c040'; q.beginPath(); circ(q, x, y, 1.8); q.fill(); } }
    // 冰棍车
    const cx = 1660, cy = 930;
    q.beginPath(); rrect(q, cx - 110, cy - 150, 220, 130, 14); fs(q, '#e8f0f4', 4); q.fillStyle = '#6ab0d8'; q.fillRect(cx - 106, cy - 110, 212, 30);
    E.text(q, '冰 棍', cx, cy - 88, { size: 26, color: '#fff', weight: 700 });
    for (const wx of [cx - 70, cx + 70]) { q.beginPath(); circ(q, wx, cy - 8, 26); fs(q, '#3a3440', 4); q.beginPath(); circ(q, wx, cy - 8, 9); fs(q, '#c8c0b0', 2); }
    line(q, cx + 100, cy - 140, cx + 150, cy - 190, 7, INK);
    line(q, cx - 10, cy - 150, cx - 10, cy - 400, 6, '#6a5a4a');
    q.beginPath(); q.moveTo(cx - 170, cy - 380); q.quadraticCurveTo(cx - 10, cy - 470, cx + 150, cy - 380); q.closePath(); fs(q, '#fffaf0', 4);
    q.save(); q.clip(); for (let i = 0; i < 8; i++) { q.fillStyle = i % 2 ? RED : '#fffaf0'; q.beginPath(); q.moveTo(cx - 10, cy - 440); q.lineTo(cx - 170 + i * 40, cy - 380); q.lineTo(cx - 150 + i * 40, cy - 380); q.closePath(); q.fill(); } q.restore();
    if (P.light) streetGrade(q, pal, 2400, 1080);
  }
  for (const pal of ['afternoon', 'golden', 'sunset']) { reg('river-far:' + pal, 2400, 1080, (q) => riverFar(q, pal)); reg('river-near:' + pal, 2400, 1200, (q) => riverNear(q, pal)); }
  /** 柳树：树干缓存在场景外，这里画会被风吹动的垂枝 */
  function willow(q, t, x, y, s, pal = 'afternoon', wind = 1) {
    const C = RIV[pal].tree;
    q.beginPath(); q.moveTo(x - 30 * s, y); q.bezierCurveTo(x - 20 * s, y - 200 * s, x - 60 * s, y - 380 * s, x - 10 * s, y - 520 * s); q.lineTo(x + 30 * s, y - 520 * s); q.bezierCurveTo(x + 10 * s, y - 360 * s, x + 40 * s, y - 180 * s, x + 40 * s, y); q.closePath(); fs(q, '#7a5a44', 4);
    for (let i = 0; i < 6; i++) { q.beginPath(); blob(q, x + (i - 2.5) * 70 * s, y - 540 * s - (i % 2) * 40 * s, 110 * s, 70 * s, 300 + i, 8, 0.2); fs(q, C[i % 3], 3); }
    q.lineCap = 'round';
    for (let i = 0; i < 34; i++) {
      const sx = x + (hash(71, i) - 0.5) * 520 * s, sy = y - 520 * s + hash(72, i) * 60 * s, L = (260 + hash(73, i) * 240) * s;
      const sw = (sin(t * 1.3 + i * 0.7) * 30 + wobble(74 + i, t * 0.4) * 40) * s * wind;
      q.beginPath(); q.moveTo(sx, sy); q.quadraticCurveTo(sx + sw * 0.4, sy + L * 0.5, sx + sw, sy + L);
      q.lineWidth = 9 * s; q.strokeStyle = C[i % 3]; q.stroke();
      q.lineWidth = 3 * s; q.strokeStyle = 'rgba(40,70,30,.4)'; q.stroke();
    }
  }
  function riverScene(g, s, cam, pal, o = {}) {
    s.layer(g, cam, 0.5, (q) => { img(q, s, 'river-far:' + pal, -240, 0, 2400, 1080); if (o.life !== false) riverLife(q, s.t, pal); if (o.far) o.far(q); });
    // 水面的闪光（纯函数）
    s.layer(g, cam, 0.5, (q) => {
      for (let i = 0; i < 40; i++) { const x = -240 + hash(81, i) * 2400, y = RIVER_Y + 30 + hash(82, i) * (BANK_Y - RIVER_Y - 30); const a = max(0, sin(s.t * (1.5 + hash(83, i) * 2) + i * 2.1)); if (a > 0.6) sparkle(q, x + sin(s.t + i) * 10, y, 10 + hash(84, i) * 10, (a - 0.6) * 2.2, 0, '#ffffff'); }
      if (o.water) o.water(q);
    });
    s.layer(g, cam, 1, (q) => { img(q, s, 'river-near:' + pal, -240, 0, 2400, 1200); if (o.mid) o.mid(q); });
  }
  /** 云朵的“小团”精灵（顶光） */
  reg('puff', 160, 160, (q, w, h) => {
    q.fillStyle = rg(q, 60, 52, 6, 80, [[0, '#ffffff'], [0.6, '#fbf6f2'], [0.85, '#e6e2ee'], [1, 'rgba(230,226,238,0)']]);
    q.beginPath(); circ(q, 80, 80, 78); q.fill();
  });
  /** 会变形的云：从一团普通的积云变成 shape（'volcano' | 'sheep' | 'family'） */
  const CLOUDS = (() => {
    const mk = (pts) => pts.map(([x, y, r]) => ({ x, y, r }));
    const volcano = [];
    for (let i = 0; i < 9; i++) { const k = i / 8; volcano.push([-200 + k * 400 * 0.5 - 20, 60 - k * 150, 60 - k * 18]); volcano.push([200 - k * 400 * 0.5 + 20, 60 - k * 150, 60 - k * 18]); }
    for (let i = 0; i < 6; i++) volcano.push([-10 + sin(i) * 30, -120 - i * 44, 30 + i * 8]);
    const sheep = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; sheep.push([cos(a) * 150, sin(a) * 80, 58]); }
    sheep.push([0, 0, 90], [190, -60, 46], [210, -40, 40], [-80, 110, 20], [-30, 116, 20], [60, 116, 20], [110, 110, 20]);
    const family = [];
    for (const [fx, fh] of [[-150, 1], [0, 0.7], [150, 1.05]]) { family.push([fx, -150 * fh, 40 * fh + 10]); for (let j = 0; j < 4; j++) family.push([fx, -80 * fh + j * 50 * fh, 44 * fh]); }
    family.push([-75, -40, 22], [75, -40, 22]);
    const blobPts = (seed, n) => { const out = []; for (let i = 0; i < n; i++) out.push([(hash(seed, i) - 0.5) * 380, (hash(seed, i, 1) - 0.5) * 120 - (1 - abs(hash(seed, i) - 0.5) * 2) * 60, 46 + hash(seed, i, 2) * 44]); return out; };
    const pair = (shape, seed) => { const a = mk(blobPts(seed, shape.length)), b = mk(shape); return a.map((p, i) => [p, b[i]]); };
    return { volcano: pair(volcano, 5), sheep: pair(sheep, 7), family: pair(family, 9) };
  })();
  function morphCloud(q, s, name, x, y, k, sc = 1, a = 1) {
    const P = CLOUDS[name], spr = lay(s, 'puff');
    const e = easeIO(clamp(k));
    q.save(); q.globalAlpha *= a;
    for (let i = 0; i < P.length; i++) {
      const [A, Bp] = P[i];
      const wob = sin(s.t * 0.6 + i) * 4;
      const px = x + lerp(A.x, Bp.x, e) * sc + wob, py = y + lerp(A.y, Bp.y, e) * sc, r = lerp(A.r, Bp.r, e) * sc * 1.25;
      q.drawImage(spr, px - r, py - r, r * 2, r * 2);
    }
    q.restore();
  }
  /** 草地（俯拍）：细密的草叶、三叶草、小花 */
  reg('grass-top', VW, VH, (q, w, h) => {
    q.fillStyle = '#8cc060'; q.fillRect(0, 0, w, h);
    const R = rng(91);
    for (let i = 0; i < 90; i++) { q.fillStyle = R() < 0.5 ? 'rgba(60,110,40,.14)' : 'rgba(200,240,140,.12)'; q.beginPath(); blob(q, R() * w, R() * h, 60 + R() * 120, 40 + R() * 90, 400 + i, 8, 0.3); q.fill(); }
    q.lineCap = 'round';
    for (let i = 0; i < 2600; i++) { const x = R() * w, y = R() * h, a = R() * TAU, l = 8 + R() * 16; q.strokeStyle = R() < 0.5 ? 'rgba(50,100,40,.45)' : 'rgba(180,230,120,.5)'; q.lineWidth = 2 + R() * 1.5; line(q, x, y, x + cos(a) * l, y + sin(a) * l, q.lineWidth, q.strokeStyle); }
    for (let i = 0; i < 70; i++) { const x = R() * w, y = R() * h; for (let j = 0; j < 3; j++) { const a = (j / 3) * TAU + R(); q.fillStyle = '#6aa048'; q.beginPath(); q.ellipse(x + cos(a) * 9, y + sin(a) * 9, 9, 7, a, 0, TAU); q.fill(); } }
    for (let i = 0; i < 90; i++) { const x = R() * w, y = R() * h, c = R(); if (c < 0.55) { for (let j = 0; j < 8; j++) { const a = (j / 8) * TAU; q.fillStyle = '#fffdf6'; q.beginPath(); q.ellipse(x + cos(a) * 8, y + sin(a) * 8, 6, 3, a, 0, TAU); q.fill(); } q.fillStyle = '#f2c040'; q.beginPath(); circ(q, x, y, 4); q.fill(); } else { q.fillStyle = c < 0.8 ? '#ffd84a' : '#f4a8c8'; for (let j = 0; j < 5; j++) { const a = (j / 5) * TAU; q.beginPath(); circ(q, x + cos(a) * 5, y + sin(a) * 5, 4.5); q.fill(); } } }
  });
  /* =========================================================
   * 集市广场（黄昏前的金色光）：一点透视；喷泉在中央；彩旗；两侧摊位
   * ========================================================= */
  const SQ = { vx: 960, vy: 430, f: 720, gy: -2.4 };
  const sp = (X, Y, Z) => [SQ.vx + (SQ.f * X) / Z, SQ.vy - (SQ.f * Y) / Z];
  function squad(q, P) { const a = sp(...P[0]); q.moveTo(a[0], a[1]); for (let i = 1; i < P.length; i++) { const b = sp(...P[i]); q.lineTo(b[0], b[1]); } q.closePath(); }
  function facadeSide(q, X, z0, z1, H, seed, dir) {
    const R = rng(seed), G = SQ.gy;
    const wall = WALLS[floor(R() * WALLS.length)], roof = ROOFS[floor(R() * ROOFS.length)];
    q.beginPath(); squad(q, [[X, G, z0], [X, H, z0], [X, H + 1.6, (z0 + z1) / 2], [X, H, z1], [X, G, z1]]); fs(q, wall, 2.5);
    q.beginPath(); squad(q, [[X, H, z0], [X, H + 1.6, (z0 + z1) / 2], [X, H, z1], [X, H - 0.3, z1], [X, H - 0.3, z0]]); fs(q, roof, 2);
    const floors = max(2, floor((H - G) / 2.6)), cols = max(1, floor((z1 - z0) / 1.6));
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const za = z0 + (z1 - z0) * (c + 0.3) / cols, zb = z0 + (z1 - z0) * (c + 0.7) / cols, ya = G + 1.2 + f * 2.6, yb = ya + 1.5;
      if (f === 0) continue;
      q.beginPath(); squad(q, [[X, ya, za], [X, yb, za], [X, yb, zb], [X, ya, zb]]); fs(q, '#7f95b0', 1.4);
    }
    // 一层的门 / 店面
    const zd = z0 + (z1 - z0) * 0.5;
    q.beginPath(); squad(q, [[X, G, zd - 0.5], [X, G + 2, zd - 0.5], [X, G + 2, zd + 0.5], [X, G, zd + 0.5]]); fs(q, '#7a4a2e', 1.6);
    // 金色的侧光
    q.save(); q.globalCompositeOperation = 'soft-light'; q.beginPath(); squad(q, [[X, G, z0], [X, H, z0], [X, H, z1], [X, G, z1]]); q.fillStyle = dir < 0 ? 'rgba(255,190,120,.6)' : 'rgba(60,40,80,.5)'; q.fill(); q.restore();
  }
  function stall(q, X, Z, w, d, seed, col) {
    const G = SQ.gy, R = rng(seed);
    // 桌子
    q.beginPath(); squad(q, [[X - w / 2, G + 1, Z], [X + w / 2, G + 1, Z], [X + w / 2, G + 1, Z + d], [X - w / 2, G + 1, Z + d]]); fs(q, '#a8784e', 1.5);
    q.beginPath(); squad(q, [[X - w / 2, G, Z], [X + w / 2, G, Z], [X + w / 2, G + 1, Z], [X - w / 2, G + 1, Z]]); fs(q, '#8a5a36', 1.5);
    // 果子
    for (let i = 0; i < 14; i++) { const [x, y] = sp(X - w / 2 + R() * w, G + 1.12, Z + R() * d); q.fillStyle = ['#e2574c', '#f2a03a', '#f6d04a', '#8ab04a'][floor(R() * 4)]; q.beginPath(); circ(q, x, y, 70 / Z); q.fill(); }
    // 柱子与遮阳篷
    for (const dx of [-w / 2, w / 2]) { const a = sp(X + dx, G, Z), b = sp(X + dx, G + 2.6, Z); line(q, a[0], a[1], b[0], b[1], max(1.5, 30 / Z), '#6a4a3a'); }
    q.beginPath(); squad(q, [[X - w / 2 - 0.3, G + 2.4, Z - 0.4], [X + w / 2 + 0.3, G + 2.4, Z - 0.4], [X + w / 2, G + 3.1, Z + d], [X - w / 2, G + 3.1, Z + d]]); fs(q, '#fffaf0', 1.5);
    q.save(); q.clip(); for (let i = 0; i < 8; i++) { if (i % 2) continue; const xa = X - w / 2 - 0.3 + (w + 0.6) * i / 8, xb = xa + (w + 0.6) / 8; q.beginPath(); squad(q, [[xa, G + 2.3, Z - 0.5], [xb, G + 2.3, Z - 0.5], [xb, G + 3.2, Z + d], [xa, G + 3.2, Z + d]]); q.fillStyle = col; q.fill(); } q.restore();
  }
  reg('square', VW, VH, (q, w, h) => {
    const G = SQ.gy;
    // 地面：金色的石板（透视格）
    const [hx, hy] = sp(0, G, 400);
    q.fillStyle = lg(q, 0, hy, 0, h, [[0, '#c8a070'], [0.4, '#d8b080'], [1, '#b88a5a']]); q.fillRect(0, hy - 2, w, h - hy + 2);
    q.strokeStyle = 'rgba(90,60,40,.28)'; q.lineWidth = 2;
    for (let X = -40; X <= 40; X += 1.6) { const a = sp(X, G, 3), b = sp(X, G, 40); line(q, a[0], a[1], b[0], b[1], 1.6, 'rgba(90,60,40,.25)'); }
    for (let Z = 3; Z < 40; Z *= 1.09) { const a = sp(-40, G, Z), b = sp(40, G, Z); line(q, a[0], a[1], b[0], b[1], 1.6, 'rgba(90,60,40,.25)'); }
    // 远处一排房子（正对镜头）+ 钟楼
    q.save(); const k30 = SQ.f / 32, [fx, fy] = sp(-16, G, 32);
    q.translate(fx, fy); q.scale(k30 / 60, k30 / 60);
    belltower(q, 16 * 60 - 260, 0, 170, 1300, { col: '#e8c8a0', roof: '#6aa090', face: '#fff2d8', lw: 4, detail: true, bell: 0, dark: '#3a2a3a' });
    let xx = 0; const R = rng(111);
    while (xx < 32 * 60) { const ww = 190 + R() * 110, hh = 380 + R() * 260; townhouse(q, xx, 0, ww, hh, 900 + xx | 0, { lw: 4, door: R() < 0.5 ? 'shop' : 'door' }); xx += ww; }
    q.restore();
    // 两侧的房子（斜着往远处退）
    let z = 4; let i = 0; while (z < 32) { const d = 2.6 + (i % 3) * 0.7; facadeSide(q, -16, z, z + d, 5 + (i % 4) * 1.2, 700 + i, -1); z += d; i++; }
    z = 4; i = 0; while (z < 32) { const d = 2.4 + (i % 3) * 0.8; facadeSide(q, 16, z, z + d, 4.6 + ((i + 2) % 4) * 1.3, 800 + i, 1); z += d; i++; }
    // 摊位
    stall(q, -11, 7, 3.2, 1.6, 3, RED); stall(q, -11, 12, 3, 1.6, 4, '#4f8a78'); stall(q, -11, 17, 3, 1.6, 5, '#e0a040');
    stall(q, 11, 9, 3, 1.6, 6, '#5a7ab0'); stall(q, 11, 15, 3, 1.6, 7, RED);
    // 喷泉：池子、两层的石盘、顶上抱着竖琴的小雕像
    const fz = 13;
    q.beginPath(); { const c = sp(0, G, fz); q.ellipse(c[0], c[1], 3.4 * SQ.f / fz, 0.95 * SQ.f / fz, 0, 0, TAU); } fs(q, '#d8c8a8', 3);
    q.beginPath(); { const c = sp(0, G + 0.7, fz); q.ellipse(c[0], c[1], 3.4 * SQ.f / fz, 0.95 * SQ.f / fz, 0, 0, TAU); } fs(q, '#e8dcc0', 3);
    q.beginPath(); { const c = sp(0, G + 0.7, fz); q.ellipse(c[0], c[1], 3.0 * SQ.f / fz, 0.8 * SQ.f / fz, 0, 0, TAU); } fs(q, '#6aa8c0', 2.5);
    { const a = sp(-0.3, G + 0.7, fz), b = sp(0.3, G + 3.2, fz); q.beginPath(); q.rect(a[0], b[1], b[0] - a[0], a[1] - b[1]); fs(q, '#d8c8a8', 2.5); }
    for (const [yy, rr] of [[G + 2.2, 1.5], [G + 3.4, 0.8]]) { const c = sp(0, yy, fz); q.beginPath(); q.ellipse(c[0], c[1], rr * SQ.f / fz, 0.3 * SQ.f / fz, 0, 0, PI); q.lineTo(c[0] - rr * SQ.f / fz, c[1]); fs(q, '#e8dcc0', 2.5); q.beginPath(); q.ellipse(c[0], c[1], rr * SQ.f / fz, 0.26 * SQ.f / fz, 0, 0, TAU); fs(q, '#8ac0d0', 2); }
    { const c = sp(0, G + 4.4, fz), r = 0.45 * SQ.f / fz; q.beginPath(); ell(q, c[0], c[1], r * 0.8, r); fs(q, '#e8dcc0', 2.5); q.beginPath(); circ(q, c[0], c[1] - r * 1.3, r * 0.5); fs(q, '#e8dcc0', 2.5); q.beginPath(); q.arc(c[0] + r * 0.9, c[1] - r * 0.2, r * 0.6, -1.2, 1.2); q.lineWidth = 3; q.strokeStyle = '#c8a060'; q.stroke(); }
    // 彩旗
    for (const [z1, z2, sag] of [[6, 10, 1.2], [11, 16, 1.4], [18, 22, 1.2]]) {
      const pts = []; for (let k = 0; k <= 16; k++) { const f = k / 16; pts.push(sp(lerp(-16, 16, f), 6 - sin(PI * f) * sag, lerp(z1, z2, f))); }
      q.beginPath(); pts.forEach((p, k) => (k ? q.lineTo(p[0], p[1]) : q.moveTo(p[0], p[1]))); q.lineWidth = 1.5; q.strokeStyle = 'rgba(58,38,32,.7)'; q.stroke();
      for (let k = 0; k < 16; k++) { const a = pts[k], b = pts[k + 1], zz = lerp(z1, z2, (k + 0.5) / 16); q.beginPath(); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]); q.lineTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 30 * 14 / zz); q.closePath(); q.fillStyle = [RED, '#f6d04a', '#5a9ad0', '#fffaf0', '#6ab07a'][k % 5]; q.fill(); }
    }
    // 金色的光：从左边斜过来（保留透明的天空）
    { const kk = q.getTransform().a; gradeKeepAlpha(q, [['soft-light', lg(q, 0, 0, w * kk, 0, [[0, 'rgba(255,170,90,.6)'], [1, 'rgba(120,80,140,.35)']])]]); }
  });
  /** 广场里喷泉的水柱（动态） */
  function fountainJets(q, t, X, Z, k = 1) {
    const G = SQ.gy;
    q.save(); q.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2, top = sp(0, G + 4.0, Z);
      const tip = sp(X + cos(a) * 1.4, G + 2.6, Z + sin(a) * 0.4);
      q.globalAlpha = 0.5 * k; q.strokeStyle = '#e8f6ff'; q.lineWidth = 4; q.beginPath(); q.moveTo(top[0], top[1]); q.quadraticCurveTo((top[0] + tip[0]) / 2, top[1] - 40, tip[0], tip[1]); q.stroke();
    }
    q.restore();
    for (let i = 0; i < 12; i++) { const ph = (t * 1.6 + hash(91, i)) % 1, a = hash(92, i) * TAU; const [x, y] = sp(cos(a) * 1.5 * ph, SQ.gy + 2.6 + 1.2 * sin(PI * ph), Z + sin(a) * 0.4 * ph); q.globalAlpha = 0.8 * (1 - ph); q.fillStyle = '#f0faff'; q.beginPath(); circ(q, x, y, 3); q.fill(); }
    q.globalAlpha = 1;
  }
  /** 集市的摊位条（侧面，透明底，放在金色街道瓦片前面） */
  function stallsTile(q, i) {
    q.save(); q.translate(-i * 1200, 0);
    const R = rng(600 + i);
    for (let x = i * 1200 - 200; x < (i + 1) * 1200 + 200; x += 420 + floor(hash(601, x) * 200)) {
      const w = 300, col = [RED, '#4f8a78', '#e0a040', '#5a7ab0'][floor(hash(602, x) * 4)];
      line(q, x, 880, x, 600, 8, '#6a4a3a'); line(q, x + w, 880, x + w, 600, 8, '#6a4a3a');
      q.beginPath(); q.moveTo(x - 30, 600); q.lineTo(x + w + 30, 600); q.lineTo(x + w + 50, 670); q.lineTo(x - 50, 670); q.closePath(); fs(q, '#fffaf0', 4);
      q.save(); q.clip(); q.fillStyle = col; for (let k = 0; k < 8; k++) if (k % 2) q.fillRect(x - 50 + k * ((w + 100) / 8), 590, (w + 100) / 8, 90); q.restore();
      q.beginPath(); for (let k = 0; k <= 8; k++) { const xx = x - 50 + k * ((w + 100) / 8); q.moveTo(xx, 670); q.arc(xx + (w + 100) / 16, 670, (w + 100) / 16, PI, 0, true); } fs(q, null, 3);
      q.beginPath(); q.rect(x - 10, 760, w + 20, 20); fs(q, '#a8784e', 4); q.beginPath(); q.rect(x, 780, w, 100); fs(q, '#8a5a36', 4);
      for (let k = 0; k < 16; k++) { q.fillStyle = ['#e2574c', '#f2a03a', '#f6d04a', '#8ab04a', '#b04a6a'][floor(hash(603, x + k) * 5)]; q.beginPath(); circ(q, x + 20 + (k % 8) * 36, 752 - floor(k / 8) * 20, 16); q.fill(); q.strokeStyle = 'rgba(58,38,32,.5)'; q.lineWidth = 2; q.stroke(); }
      // 箱子
      q.beginPath(); q.rect(x + w + 10, 820, 110, 64); fs(q, '#c8925a', 4); line(q, x + w + 10, 850, x + w + 120, 850, 3, 'rgba(58,38,32,.4)');
    }
    q.restore();
    streetGrade(q, 'golden', 1200, 1080);
  }
  for (let i = 0; i < 5; i++) reg('stalls:' + i, 1200, 1080, (q) => stallsTile(q, i));
  /** 喷泉近景（金色）：石头池沿 + 背后糊掉的广场 */
  reg('fountain', VW, VH, (q, w, h) => {
    q.fillStyle = lg(q, 0, 0, 0, h, [[0, '#f0b070'], [0.5, '#e8a070'], [1, '#c07a50']]); q.fillRect(0, 0, w, h);
    // 背景：远处房子（糊）
    q.save(); q.globalAlpha = 0.55; q.translate(-100, 560); q.scale(1.2, 1.2); let xx = 0; const R = rng(121); while (xx < 1800) { const ww = 240 + R() * 140; townhouse(q, xx, 0, ww, 460 + R() * 200, 1000 + xx | 0, { lw: 3 }); xx += ww; } q.restore();
    q.save(); q.globalCompositeOperation = 'soft-light'; q.fillStyle = 'rgba(255,170,90,.8)'; q.fillRect(0, 0, w, h); q.restore();
    q.fillStyle = 'rgba(255,220,180,.35)'; q.fillRect(0, 0, w, h);
    // 池水
    q.beginPath(); q.ellipse(960, 820, 1100, 170, 0, 0, TAU); fs(q, lg(q, 0, 650, 0, 990, [[0, '#8ac0d0'], [1, '#4a8aa8']]), 5);
    // 中间的石柱（有线脚）、上层大石盘、顶上的小石盘和抱着竖琴的小雕像
    q.beginPath(); q.moveTo(880, 830); q.lineTo(900, 470); q.lineTo(1020, 470); q.lineTo(1040, 830); q.closePath(); fs(q, lg(q, 880, 0, 1040, 0, [[0, '#f0e0c0'], [1, '#c8b08a']]), 5);
    for (const y of [560, 700]) { q.beginPath(); rrect(q, 880, y, 160, 26, 10); fs(q, '#e8d8b8', 4); }
    q.beginPath(); q.moveTo(620, 420); q.quadraticCurveTo(960, 560, 1300, 420); q.lineTo(1280, 440); q.quadraticCurveTo(960, 600, 640, 440); q.closePath(); fs(q, '#dccaa6', 5);
    q.beginPath(); q.ellipse(960, 420, 340, 62, 0, 0, TAU); fs(q, '#efe2c6', 5); q.beginPath(); q.ellipse(960, 420, 306, 48, 0, 0, TAU); fs(q, '#8cc4d6', 3.5);
    q.beginPath(); q.moveTo(930, 420); q.lineTo(936, 250); q.lineTo(984, 250); q.lineTo(990, 420); q.closePath(); fs(q, '#e8d8b8', 4);
    q.beginPath(); q.moveTo(820, 250); q.quadraticCurveTo(960, 320, 1100, 250); q.closePath(); fs(q, '#dccaa6', 4); q.beginPath(); q.ellipse(960, 250, 142, 28, 0, 0, TAU); fs(q, '#efe2c6', 4); q.beginPath(); q.ellipse(960, 250, 124, 20, 0, 0, TAU); fs(q, '#8cc4d6', 3);
    // 雕像
    q.beginPath(); q.moveTo(930, 244); q.lineTo(940, 150); q.quadraticCurveTo(960, 130, 980, 150); q.lineTo(990, 244); q.closePath(); fs(q, '#e8dcc4', 4);
    q.beginPath(); circ(q, 960, 118, 24); fs(q, '#e8dcc4', 4);
    q.beginPath(); q.moveTo(978, 150); q.quadraticCurveTo(1030, 150, 1024, 210); q.moveTo(1000, 144); q.lineTo(1000, 204); q.moveTo(1012, 146); q.lineTo(1012, 206); q.lineWidth = 5; q.strokeStyle = '#c8a060'; q.stroke();
    // 池沿（前景，厚石头）
    q.beginPath(); q.moveTo(-40, 900); q.quadraticCurveTo(960, 1060, 1960, 900); q.lineTo(1960, 1100); q.lineTo(-40, 1100); q.closePath(); fs(q, '#e0ccaa', 6);
    q.beginPath(); q.moveTo(-40, 900); q.quadraticCurveTo(960, 1060, 1960, 900); q.lineTo(1960, 940); q.quadraticCurveTo(960, 1100, -40, 940); q.closePath(); fs(q, '#f0e2c4', 4);
    for (let x = 60; x < 1920; x += 220) line(q, x, 950 + sin(x / 1920 * PI) * 150 * 0.55, x + 6, 1100, 3, 'rgba(58,38,32,.3)');
  });
  function splashFx(q, t, t0, x, y, k = 1) {
    const a = t - t0;
    if (a < 0 || a > 2.8) return;
    // 水花：一圈往外飞的水滴
    for (let i = 0; i < 70; i++) {
      const ang = -PI / 2 + (hash(131, i) - 0.5) * 2.8, v = (600 + hash(132, i) * 900) * k, s = 5 + hash(133, i) * 10;
      const px = x + cos(ang) * v * a * 0.8, py = y + sin(ang) * v * a + 900 * a * a;
      if (py > y + 200) continue;
      q.globalAlpha = clamp(1 - a / 1.6); q.fillStyle = '#eef8ff'; q.beginPath(); ell(q, px, py, s * 0.8, s * 1.3, ang); q.fill(); q.strokeStyle = 'rgba(80,140,180,.6)'; q.lineWidth = 1.5; q.stroke();
    }
    q.globalAlpha = 1;
    // 水冠：一圈往上喷的“水指头”（半透明、蓝边）
    const c = easeO(clamp(a / 0.4)), f = clamp(1 - (a - 0.35) / 0.9);
    if (f > 0) {
      for (let i = 0; i < 18; i++) {
        const ang = -PI + 0.1 + (i / 17) * (PI - 0.2), len = (220 + hash(134, i) * 200) * c * k, bx = x + cos(ang) * 120 * k, by = y + sin(ang) * 30 * k;
        const tx = bx + cos(ang) * len * 0.8, ty = by - len * (0.6 + 0.4 * abs(sin(ang)));
        q.globalAlpha = f * 0.85; q.fillStyle = 'rgba(245,252,255,.85)';
        q.beginPath(); q.moveTo(bx - 18 * k, by); q.quadraticCurveTo(tx - 10 * k, ty + 40 * k, tx, ty); q.quadraticCurveTo(tx + 10 * k, ty + 40 * k, bx + 18 * k, by); q.closePath(); q.fill();
        q.lineWidth = 2.5; q.strokeStyle = 'rgba(90,150,190,.7)'; q.stroke();
        q.beginPath(); circ(q, tx, ty, 9 * k); q.fill(); q.stroke();
      }
      q.globalAlpha = f * 0.7; q.fillStyle = 'rgba(250,253,255,.9)'; q.beginPath(); q.ellipse(x, y, 260 * c * k, 60 * c * k, 0, 0, TAU); q.fill();
      q.globalAlpha = 1;
    }
    // 蒸汽（小羊是烫的！）
    for (let i = 0; i < 16; i++) { const ang = (i / 16) * TAU, r = (60 + a * 260) * k; const ph = clamp(1 - a / 2.6); q.globalAlpha = 0.55 * ph; q.fillStyle = '#fffaf4'; q.beginPath(); circ(q, x + cos(ang) * r * 1.3, y - 80 * k - a * 160 * k + sin(ang) * r * 0.6, (60 + a * 90) * k); q.fill(); }
    q.globalAlpha = 1;
  }
  function rainbow(q, x, y, r, a) {
    if (a <= 0) return;
    q.save(); q.globalCompositeOperation = 'lighter'; q.globalAlpha = a * 0.35; q.lineWidth = 14;
    ['#ff6a6a', '#ffb45a', '#fff27a', '#7aea8a', '#6ac8ff', '#9a8aff'].forEach((c, i) => { q.strokeStyle = c; q.beginPath(); q.arc(x, y, r - i * 14, PI * 1.05, PI * 1.95); q.stroke(); });
    q.restore();
  }

  /* =========================================================
   * 夜里的房间：窗外换成夜景，屋里压暗（窗留亮），灯留一团暖光——烘焙在缓存里
   * ========================================================= */
  function nightBake(q, room, win, lamps, dark = '#6a6490') {
    VIEW = 'night'; try { room(q); } finally { VIEW = 'morning'; }
    q.save();
    q.beginPath(); q.rect(0, 0, VW, VH);
    if (win) { if (win.length === 3) { q.moveTo(win[0] + win[2], win[1]); q.arc(win[0], win[1], win[2], 0, TAU, true); } else q.rect(win[0] + win[2], win[1], -win[2], win[3]); }
    q.clip('evenodd');
    q.globalCompositeOperation = 'multiply'; q.fillStyle = dark; q.fillRect(0, 0, VW, VH);
    q.restore();
    q.save(); q.globalCompositeOperation = 'lighter';
    for (const [x, y, r, a] of lamps) { q.fillStyle = rg(q, x, y, 0, r, [[0, `rgba(255,196,120,${a})`], [0.45, `rgba(255,160,90,${a * 0.4})`], [1, 'rgba(255,150,80,0)']]); q.fillRect(x - r, y - r, r * 2, r * 2); }
    q.restore();
  }
  reg('room-kitchen:night', VW, VH, (q) => nightBake(q, roomKitchen, [372, 88, 496, 474], [[560, 330, 760, 0.55], [560, 760, 520, 0.4]]));
  reg('room-study:night', VW, VH, (q) => nightBake(q, roomStudy, [780, 150, 380, 430], [[1140, 580, 700, 0.6]]));
  reg('room-attic:night', VW, VH, (q) => nightBake(q, roomAttic, [960, 330, 118], [[1790, 600, 520, 0.45]], '#5a5a8a'));
  /** 地图（俯拍，餐桌上）：等高线、河、火山；红铅笔圈出乌纳 */
  reg('map-top', VW, VH, (q, w, h) => {
    q.fillStyle = '#f2e6d0'; q.fillRect(0, 0, w, h);
    q.fillStyle = 'rgba(226,87,76,.22)'; for (let x = 0; x < w; x += 80) q.fillRect(x, 0, 40, h); for (let y = 0; y < h; y += 80) q.fillRect(0, y, w, 40);
    q.save(); q.translate(960, 540); q.rotate(-0.06);
    q.fillStyle = 'rgba(0,0,0,.25)'; q.fillRect(-690, -400, 1400, 830);
    q.beginPath(); q.rect(-700, -420, 1400, 830); fs(q, '#f6ecd2', 5);
    q.strokeStyle = 'rgba(140,100,60,.4)'; q.lineWidth = 2.5;
    for (let i = 0; i < 9; i++) { q.beginPath(); blob(q, 260, -40, 50 + i * 42, 40 + i * 34, 90 + i, 12, 0.1); q.stroke(); }
    for (let i = 0; i < 5; i++) { q.beginPath(); blob(q, -380, 200, 40 + i * 36, 30 + i * 22, 120 + i, 10, 0.14); q.stroke(); }
    q.beginPath(); q.moveTo(-700, 300); q.bezierCurveTo(-400, 120, -200, 330, 40, 200); q.bezierCurveTo(200, 120, 300, 300, 700, 260); q.lineWidth = 12; q.strokeStyle = 'rgba(90,150,210,.55)'; q.stroke();
    q.beginPath(); q.moveTo(236, -20); q.lineTo(260, -64); q.lineTo(284, -20); q.closePath(); fs(q, '#9a5a3a', 3);
    q.fillStyle = 'rgba(255,120,60,.6)'; q.beginPath(); circ(q, 260, -70, 8); q.fill();
    E.text(q, '乌纳火山', 300, 40, { size: 46, font: KAI, color: '#6a3a2a', align: 'left', weight: 700 });
    E.text(q, '莱塔尼亚', -560, -260, { size: 42, font: KAI, color: '#6a3a2a', align: 'left', weight: 700 });
    q.beginPath(); circ(q, -470, -200, 12); fs(q, '#3f5a8a', 3);
    q.setLineDash([14, 12]); q.beginPath(); q.moveTo(-470, -200); q.bezierCurveTo(-200, -250, 0, 40, 230, -30); q.lineWidth = 5; q.strokeStyle = 'rgba(58,38,32,.7)'; q.stroke(); q.setLineDash([]);
    // 罗盘玫瑰
    q.save(); q.translate(-560, 280); q.beginPath(); star4(q, 0, 0, 60, -PI / 2); fs(q, '#e8d8b0', 2.5); E.text(q, 'N', 0, -70, { size: 26, font: 'display', weight: 700, color: INK }); q.restore();
    q.restore();
    // 灯下的一圈光、汤碗的边
    q.save(); q.globalCompositeOperation = 'multiply'; q.fillStyle = rg(q, 900, 460, 300, 1200, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(120,90,110,1)']]); q.fillRect(0, 0, w, h); q.restore();
    q.beginPath(); circ(q, 1700, 980, 220); fs(q, '#f4efe6', 6); q.beginPath(); circ(q, 1700, 980, 170); fs(q, '#d88a4a', 3);
  });
  /** 书桌（俯拍，夜里）：台灯的光、资料夹 */
  reg('desk-night-top', VW, VH, (q, w, h) => {
    planks(q, 0, 0, w, h, '#8a5230', '#6a3a22', 131, 8);
    q.save(); q.translate(1000, 560); q.rotate(0.04);
    q.fillStyle = 'rgba(0,0,0,.3)'; q.fillRect(-470, -300, 960, 640);
    q.beginPath(); rrect(q, -480, -310, 960, 640, 14); fs(q, '#b88a52', 5);
    q.beginPath(); rrect(q, -440, -270, 880, 560, 8); fs(q, '#f6ecd4', 3);
    for (let i = 0; i < 12; i++) line(q, -380, -200 + i * 40, 360 - (i % 3) * 80, -200 + i * 40, 3, 'rgba(58,58,80,.35)');
    E.text(q, '乌纳火山 · 考察资料', -380, -222, { size: 44, font: KAI, color: '#3a3a5a', align: 'left', weight: 700 });
    q.restore();
    q.save(); q.globalCompositeOperation = 'multiply'; q.fillStyle = rg(q, 1300, 300, 200, 1300, [[0, 'rgba(255,240,210,1)'], [1, 'rgba(70,60,100,1)']]); q.fillRect(0, 0, w, h); q.restore();
  });
  /** 信封：中心 (x, y)，rot 旋转 */
  function envelope(q, x, y, k, rot) {
    q.save(); q.translate(x, y); q.rotate(rot); q.scale(k, k);
    q.beginPath(); rrect(q, -170, -110, 340, 220, 8); fs(q, '#fbf2dc', 4);
    q.beginPath(); q.moveTo(-166, -106); q.lineTo(0, 20); q.lineTo(166, -106); q.lineWidth = 3; q.strokeStyle = 'rgba(58,38,32,.5)'; q.stroke();
    q.beginPath(); circ(q, 0, 16, 26); fs(q, '#c0392b', 3); q.beginPath(); star4(q, 0, 16, 13, 0.4); q.fillStyle = '#e8705a'; q.fill();
    q.restore();
  }

  /* =========================================================
   * 屋顶的夜：银河、城里的灯、前景的屋顶（烟囱、老虎窗）
   * ========================================================= */
  reg('night-sky', VW, VH, (q, w, h) => {
    q.fillStyle = lg(q, 0, 0, 0, h, [[0, '#070b24'], [0.5, '#141c48'], [0.85, '#2a2a5e'], [1, '#4a3a6a']]); q.fillRect(0, 0, w, h);
    // 银河：一条斜着的光带
    q.save(); q.translate(960, 420); q.rotate(-0.42);
    for (let i = 0; i < 26; i++) { const x = (hash(151, i) - 0.5) * 2400, y = (hash(152, i) - 0.5) * 160, r = 120 + hash(153, i) * 180; q.fillStyle = rg(q, x, y, 0, r, [[0, `rgba(${hash(154, i) < 0.5 ? '190,170,255' : '255,200,230'},0.18)`], [1, 'rgba(160,150,255,0)']]); q.fillRect(x - r, y - r, r * 2, r * 2); }
    const R = rng(155);
    for (let i = 0; i < 1400; i++) { const x = (R() - 0.5) * 2600, y = (R() + R() + R() - 1.5) * 150, s = R() * 1.8 + 0.4; q.globalAlpha = 0.25 + R() * 0.6; q.fillStyle = R() < 0.2 ? '#ffe8f0' : '#e8ecff'; q.fillRect(x, y, s, s); }
    q.globalAlpha = 1;
    // 暗尘带（很淡）
    q.fillStyle = 'rgba(10,10,30,.14)'; for (let i = 0; i < 8; i++) { q.beginPath(); blob(q, (R() - 0.5) * 2000, (R() - 0.5) * 50, 120 + R() * 120, 10 + R() * 10, 160 + i, 8, 0.3); q.fill(); }
    q.restore();
    const R2 = rng(156);
    for (let i = 0; i < 500; i++) { q.globalAlpha = 0.3 + R2() * 0.5; q.fillStyle = '#fff'; const s = R2() * 1.6 + 0.5; q.fillRect(R2() * w, R2() * h * 0.85, s, s); }
    q.globalAlpha = 1;
    q.fillStyle = lg(q, 0, h * 0.7, 0, h, [[0, 'rgba(120,90,140,0)'], [1, 'rgba(160,110,140,.45)']]); q.fillRect(0, h * 0.7, w, h * 0.3);
  });
  reg('rooftops', 2400, 1080, (q, w, h) => {
    // 远处：城的剪影（亮着的窗）+ 钟楼（钟面亮着）
    skyline(q, w, 640, 171, TOWN.night, { towerX: 1560 });
    q.fillStyle = 'rgba(255,220,150,.9)'; { const cx = 1560, cy = 640 - 20 - 300 + 0.38 * 300; q.beginPath(); circ(q, cx, cy, 20); q.fill(); }
    // 河（倒映着灯）
    q.fillStyle = '#10143a'; q.fillRect(0, 660, w, 60);
    const R = rng(172); for (let i = 0; i < 60; i++) { q.fillStyle = `rgba(255,${190 + R() * 50 | 0},120,${0.3 + R() * 0.4})`; q.fillRect(R() * w, 664 + R() * 50, 8 + R() * 24, 2); }
    // 中景的屋顶
    let x = -60;
    while (x < w + 60) {
      const bw = 160 + R() * 180, by = 760 + R() * 60, rh = bw * (0.45 + R() * 0.25);
      q.beginPath(); q.moveTo(x, h); q.lineTo(x, by); q.lineTo(x + bw / 2, by - rh); q.lineTo(x + bw, by); q.lineTo(x + bw, h); q.closePath(); fs(q, R() < 0.5 ? '#232650' : '#2a2a58', 3, '#10122a');
      q.strokeStyle = 'rgba(160,170,230,.18)'; q.lineWidth = 2; q.beginPath(); q.moveTo(x + 4, by); q.lineTo(x + bw / 2, by - rh + 4); q.stroke();
      if (R() < 0.7) { const cx = x + bw * (0.25 + R() * 0.2); q.beginPath(); q.rect(cx, by - rh * 0.8, 20, rh * 0.5); fs(q, '#1c1e40', 2.5, '#10122a'); }
      if (R() < 0.75) { const dx = x + bw * (0.5 + R() * 0.2), dy = by - rh * 0.35; q.beginPath(); q.rect(dx - 16, dy - 20, 32, 30); fs(q, '#ffcf7a', 2, '#10122a'); }
      x += bw * (0.8 + R() * 0.3);
    }
  });
  reg('roof-fg', VW, VH, (q, w, h) => {
    // 前景的屋顶：屋脊在 y≈780，斜面朝镜头
    q.beginPath(); q.moveTo(-40, 800); q.lineTo(1960, 760); q.lineTo(1960, 1100); q.lineTo(-40, 1100); q.closePath(); fs(q, '#4a3042', 5, '#1a0e18');
    q.save(); q.clip();
    for (let r = 0; r < 6; r++) for (let c = -1; c < 22; c++) { const y = 800 - c * 2 + r * 56, x = c * 96 + (r % 2) * 48; q.beginPath(); q.arc(x, y, 50, 0, PI); fs(q, r % 2 ? '#5a3a4c' : '#523448', 2.5, 'rgba(20,10,20,.7)'); }
    q.fillStyle = 'rgba(160,170,255,.1)'; q.fillRect(0, 760, w, 50);
    q.restore();
    q.beginPath(); q.moveTo(-40, 792); q.lineTo(1960, 752); q.lineTo(1960, 772); q.lineTo(-40, 812); q.closePath(); fs(q, '#6a4a5a', 3, '#1a0e18');
    // 烟囱（右）
    q.beginPath(); q.rect(1540, 520, 120, 250); fs(q, '#6a3a3a', 5, '#1a0e18');
    for (let y = 540; y < 770; y += 30) line(q, 1540, y, 1660, y, 2, 'rgba(0,0,0,.3)');
    q.beginPath(); q.rect(1528, 500, 144, 28); fs(q, '#5a3232', 4, '#1a0e18');
    // 老虎窗（左）：窗开着，透出暖光
    q.beginPath(); q.moveTo(210, 800); q.lineTo(210, 600); q.lineTo(340, 520); q.lineTo(470, 600); q.lineTo(470, 790); q.closePath(); fs(q, '#e8d8c0', 5, '#1a0e18');
    q.beginPath(); q.moveTo(190, 610); q.lineTo(340, 500); q.lineTo(490, 610); q.lineTo(470, 616); q.lineTo(340, 526); q.lineTo(210, 616); q.closePath(); fs(q, '#5a3a4c', 4, '#1a0e18');
    q.beginPath(); rrect(q, 250, 620, 180, 170, 10); fs(q, '#ffcf7a', 4, '#1a0e18');
    q.save(); q.globalCompositeOperation = 'multiply'; q.fillStyle = '#ffb060'; q.fillRect(250, 700, 180, 90); q.restore();
    q.beginPath(); q.moveTo(250, 620); q.lineTo(190, 650); q.lineTo(190, 810); q.lineTo(250, 790); q.closePath(); fs(q, '#f4ecde', 3, '#1a0e18');
    gradeKeepAlpha(q, [['multiply', '#6a6aa0']]);
    // 窗里的暖光不要被压暗
    q.save(); q.globalCompositeOperation = 'lighter'; q.fillStyle = 'rgba(255,190,110,.55)'; q.beginPath(); rrect(q, 254, 624, 172, 162, 8); q.fill(); q.restore();
  });
  /** 流星：出生时间、起点、方向由 hash 决定（纯函数） */
  function meteors(q, t, t0, t1, rate, o = {}) {
    const n = floor((t1 - t0) * rate);
    for (let i = 0; i < n; i++) {
      const tb = t0 + (i + hash(161, i) * 0.8) / rate, a = t - tb, life = 0.6 + hash(162, i) * 0.7;
      if (a < 0 || a > life) continue;
      const x0 = (o.x0 ?? -100) + hash(163, i) * (o.w ?? 2100), y0 = (o.y0 ?? -60) + hash(164, i) * (o.h ?? 420), ang = 0.45 + hash(165, i) * 0.35, v = 900 + hash(166, i) * 900;
      const k = a / life, x = x0 + cos(ang) * v * a, y = y0 + sin(ang) * v * a, len = 140 + v * 0.12;
      const al = sin(PI * k);
      q.save(); q.globalCompositeOperation = 'lighter';
      q.strokeStyle = lg(q, x, y, x - cos(ang) * len, y - sin(ang) * len, [[0, `rgba(255,250,235,${al})`], [1, 'rgba(180,200,255,0)']]);
      q.lineWidth = 3 + hash(167, i) * 2; q.lineCap = 'round'; q.beginPath(); q.moveTo(x, y); q.lineTo(x - cos(ang) * len, y - sin(ang) * len); q.stroke();
      q.restore();
      glow(q, x, y, 18, '255,250,230', al);
    }
  }
  /** 星座：一串星点 + 慢慢连起来的线（p 为进度） */
  const CONST = {
    volcano: [[-180, 120], [-60, -40], [0, -60], [60, -40], [180, 120], [-60, -40, 1], [-30, -150], [20, -230], [-10, -300]],
    sheep: [[-120, 0], [-80, -60], [0, -80], [80, -60], [120, 0], [80, 50], [0, 60], [-80, 50], [-120, 0], [120, 0, 1], [170, -40], [200, -10], [170, 20], [-80, 50, 1], [-80, 110], [80, 50, 1], [80, 110]],
    family: [[-160, -120], [-160, 60], [-190, 160], [-160, 60, 1], [-130, 160], [-160, -20, 1], [-60, 10], [0, -40], [0, 70], [-20, 150], [0, 70, 1], [20, 150], [0, 10, 1], [60, 10], [160, -130], [160, 60], [130, 160], [160, 60, 1], [190, 160], [160, -30, 1], [60, 10, 1]],
  };
  function constellation(q, t, name, cx, cy, sc, p, a = 1) {
    if (p <= 0 || a <= 0) return;
    const P = CONST[name], n = P.length;
    q.save(); q.globalCompositeOperation = 'lighter'; q.lineCap = 'round';
    for (let i = 1; i < n; i++) {
      if (P[i][2]) continue;
      const f = clamp(p * (n - 1) - (i - 1)); if (f <= 0) break;
      const [x0, y0] = P[i - 1], [x1, y1] = P[i];
      q.globalAlpha = a * 0.7; q.strokeStyle = '#bcd0ff'; q.lineWidth = 3;
      q.beginPath(); q.moveTo(cx + x0 * sc, cy + y0 * sc); q.lineTo(cx + lerp(x0, x1, f) * sc, cy + lerp(y0, y1, f) * sc); q.stroke();
    }
    q.restore();
    for (let i = 0; i < n; i++) { if (P[i][2]) continue; if (clamp(p * (n - 1) - i + 1) <= 0) break; const tw = 0.7 + 0.3 * sin(t * 3 + i); glow(q, cx + P[i][0] * sc, cy + P[i][1] * sc, 22, '220,230,255', a * tw); q.fillStyle = '#fff'; q.globalAlpha = a; q.fillRect(cx + P[i][0] * sc - 2, cy + P[i][1] * sc - 2, 4, 4); q.globalAlpha = 1; }
  }

  /* =========================================================
   * 黎明的街（一点透视，尽头是日出）
   * ========================================================= */
  const DP = { vx: 960, vy: 560, f: 820, gy: -1.6 };
  const dp = (X, Y, Z) => [DP.vx + (DP.f * X) / Z, DP.vy - (DP.f * Y) / Z];
  function dquad(q, P) { const a = dp(...P[0]); q.moveTo(a[0], a[1]); for (let i = 1; i < P.length; i++) { const b = dp(...P[i]); q.lineTo(b[0], b[1]); } q.closePath(); }
  reg('street-persp', VW, VH, (q, w, h) => {
    const G = DP.gy;
    // 地面：路、人行道
    const [, hy] = dp(0, G, 400);
    q.fillStyle = lg(q, 0, hy, 0, h, [[0, '#c8a0a8'], [0.3, '#9a7a90'], [1, '#6a5070']]); q.fillRect(0, hy, w, h - hy);
    for (const sx of [-1, 1]) { q.beginPath(); dquad(q, [[sx * 4, G, 1.2], [sx * 6.6, G, 1.2], [sx * 6.6, G, 80], [sx * 4, G, 80]]); fs(q, '#b89aa8', 1.5, 'rgba(40,20,40,.5)'); }
    q.strokeStyle = 'rgba(40,20,40,.22)'; q.lineWidth = 1.5;
    for (let X = -4; X <= 4; X += 0.5) { const a = dp(X, G, 1.2), b = dp(X, G, 80); line(q, a[0], a[1], b[0], b[1], 1.5, 'rgba(40,20,40,.2)'); }
    for (let Z = 1.2; Z < 80; Z *= 1.08) { const a = dp(-4, G, Z), b = dp(4, G, Z); line(q, a[0], a[1], b[0], b[1], 1.5, 'rgba(40,20,40,.2)'); }
    for (const rx of [-1.6, -0.9, 0.9, 1.6]) { const a = dp(rx, G, 1.2), b = dp(rx, G, 80); line(q, a[0], a[1], b[0], b[1], 3, 'rgba(255,220,200,.45)'); }
    // 两排房子
    for (const side of [-1, 1]) {
      let z = 1.4, i = 0;
      while (z < 70) {
        const d = 3.2 + (i % 3) * 0.9, H = 7 + ((i * 7 + (side > 0 ? 3 : 0)) % 4) * 1.6;
        const R = rng(1200 + i * 3 + (side > 0 ? 1 : 0));
        const wall = WALLS[floor(R() * WALLS.length)];
        const X = side * 6.6;
        q.beginPath(); dquad(q, [[X, G, z], [X, H, z], [X, H + 2.2, z + d / 2], [X, H, z + d], [X, G, z + d]]); fs(q, wall, 2, 'rgba(40,20,40,.6)');
        q.beginPath(); dquad(q, [[X, H, z], [X, H + 2.2, z + d / 2], [X, H, z + d], [X, H - 0.35, z + d], [X, H - 0.35, z]]); fs(q, ROOFS[floor(R() * ROOFS.length)], 1.6, 'rgba(40,20,40,.6)');
        const floors = floor((H - G) / 2.8);
        for (let f = 1; f < floors; f++) for (let c = 0; c < 2; c++) { const za = z + d * (0.2 + c * 0.45), zb = za + d * 0.22, ya = G + f * 2.8 + 0.4, yb = ya + 1.5; q.beginPath(); dquad(q, [[X, ya, za], [X, yb, za], [X, yb, zb], [X, ya, zb]]); fs(q, R() < 0.35 ? '#ffd9a0' : '#8a90b0', 1.2, 'rgba(40,20,40,.5)'); }
        const zd = z + d * 0.5; q.beginPath(); dquad(q, [[X, G, zd - 0.45], [X, G + 2.2, zd - 0.45], [X, G + 2.2, zd + 0.45], [X, G, zd + 0.45]]); fs(q, '#6a4050', 1.4, 'rgba(40,20,40,.6)');
        z += d; i++;
      }
    }
    // 逆光：房子整体偏冷偏暗，屋顶边沿有一点暖光
    gradeKeepAlpha(q, [['multiply', '#b8a0c8']]);
    q.save(); q.globalCompositeOperation = 'lighter';
    for (const side of [-1, 1]) { const a = dp(side * 6.6, 9, 1.4), b = dp(side * 6.6, 9, 70); q.strokeStyle = 'rgba(255,190,150,.35)'; q.lineWidth = 4; q.beginPath(); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]); q.stroke(); }
    q.restore();
    // 路灯杆
    for (let z = 3; z < 60; z += 6) for (const side of [-1, 1]) { const a = dp(side * 4.5, G, z), b = dp(side * 4.5, 1.9, z); line(q, a[0], a[1], b[0], b[1], max(1.5, 26 / z), '#3a2a44'); const c = dp(side * 4.5, 2.1, z); q.beginPath(); circ(q, c[0], c[1], max(2, 30 / z)); fs(q, '#ffe2a8', 1, '#3a2a44'); }
  });
  function streetLampsGlow(g, t, a) {
    for (let z = 3; z < 60; z += 6) for (const side of [-1, 1]) { const c = dp(side * 4.5, 2.1, z); glow(g, c[0], c[1], max(8, 170 / z), '255,210,150', a * (0.6 + 0.1 * sin(t * 3 + z))); }
  }

  /* =========================================================
   * 书桌（俯拍，早晨）：磁带、夹着黄花的书、冰棍棍、照片、奖章……
   * ========================================================= */
  const DESK_ITEMS = {
    book: [300, 700], photo: [1520, 250], stick: [1650, 800], star: [520, 230], pencil: [1180, 900], medal: [1380, 620], tapeA: [760, 560], tapeB: [640, 330],
  };
  reg('desk-top', 2200, 1300, (q, w, h) => {
    // 木纹桌面
    q.fillStyle = lg(q, 0, 0, w, h, [[0, '#c8894c'], [0.5, '#b87a42'], [1, '#9a6234']]); q.fillRect(0, 0, w, h);
    const R = rng(211);
    for (let i = 0; i < 60; i++) { const y = R() * h; q.strokeStyle = `rgba(90,50,20,${0.08 + R() * 0.12})`; q.lineWidth = 2 + R() * 4; q.beginPath(); q.moveTo(0, y); for (let x = 0; x <= w; x += 100) q.lineTo(x, y + sin(x * 0.004 + i) * 12 + (R() - 0.5) * 4); q.stroke(); }
    for (let x = 0; x < w; x += 440) line(q, x, 0, x, h, 3, 'rgba(60,30,10,.25)');
    // 夹着黄花的书（摊开）
    q.save(); q.translate(360, 820); q.rotate(-0.18);
    q.fillStyle = 'rgba(0,0,0,.25)'; q.fillRect(-330, -200, 680, 440);
    q.beginPath(); rrect(q, -340, -220, 680, 440, 14); fs(q, '#7a3a2a', 5);
    for (const sd of [-1, 1]) { q.beginPath(); q.moveTo(0, -200); q.quadraticCurveTo(sd * 160, -222, sd * 318, -204); q.lineTo(sd * 318, 204); q.quadraticCurveTo(sd * 160, 190, 0, 206); q.closePath(); fs(q, '#fbf4e2', 4); for (let i = 0; i < 9; i++) line(q, sd * 40, -150 + i * 34, sd * (270 - (i % 3) * 40), -150 + i * 34, 3, 'rgba(58,58,70,.25)'); }
    line(q, 0, -200, 0, 206, 3, 'rgba(58,38,32,.4)');
    // 压扁的黄花
    q.save(); q.translate(150, 40); q.rotate(0.3);
    q.beginPath(); q.moveTo(0, 30); q.quadraticCurveTo(-20, 120, 10, 190); q.lineWidth = 5; q.strokeStyle = '#7a9a4a'; q.stroke();
    for (let p = 0; p < 12; p++) { const a = (p / 12) * TAU; q.beginPath(); q.ellipse(cos(a) * 30, sin(a) * 30, 28, 12, a, 0, TAU); fs(q, '#ffd23e', 2.5); }
    q.beginPath(); circ(q, 0, 0, 16); fs(q, '#d88a1e', 2.5);
    q.beginPath(); q.ellipse(-24, 130, 24, 10, 0.8, 0, TAU); fs(q, '#8ab04a', 2);
    q.restore();
    q.restore();
    // 照片：喷泉边的三个人（小小的一张）
    q.save(); q.translate(1560, 260); q.rotate(0.12);
    q.fillStyle = 'rgba(0,0,0,.25)'; q.fillRect(-150, -120, 310, 280);
    q.beginPath(); q.rect(-160, -140, 320, 290); fs(q, '#fffdf6', 4);
    q.fillStyle = lg(q, 0, -120, 0, 90, [[0, '#ffc890'], [1, '#e89a70']]); q.fillRect(-136, -116, 272, 206);
    q.fillStyle = '#e8dcc0'; q.fillRect(-136, 40, 272, 50);
    for (const [fx, c, hc] of [[-70, '#6a3a4a', '#c98a5a'], [0, '#5b6b8a', '#e8d9a8'], [70, '#2e3a5a', '#6b4a3a']]) { q.fillStyle = c; q.fillRect(fx - 22, -10, 44, 60); q.fillStyle = SKIN; q.beginPath(); circ(q, fx, -30, 20); q.fill(); q.fillStyle = hc; q.beginPath(); q.arc(fx, -34, 21, PI, TAU); q.fill(); }
    q.strokeStyle = '#ffe9a0'; q.lineWidth = 3; q.beginPath(); q.ellipse(0, -58, 16, 5, 0, 0, TAU); q.stroke();
    q.fillStyle = '#2c2430'; q.beginPath(); circ(q, 110, 40, 16); circ(q, 124, 36, 14); q.fill();
    E.text(q, '六月 · 喷泉', 0, 130, { size: 30, font: KAI, color: '#5a4a6a' });
    q.restore();
    // 冰棍棍（写着“再来一根”）
    q.save(); q.translate(1700, 860); q.rotate(-0.5); q.fillStyle = 'rgba(0,0,0,.2)'; q.fillRect(-100, -10, 210, 40); q.beginPath(); rrect(q, -110, -20, 220, 40, 20); fs(q, '#ecd098', 3.5); E.text(q, '再来一根', 0, 10, { size: 28, font: KAI, color: '#8a4a2a', weight: 700 }); q.restore();
    // 纸星星、铅笔
    q.save(); q.translate(560, 240); q.rotate(0.3); q.beginPath(); star4(q, 0, 0, 44, 0.2); fs(q, '#ffd86a', 3); q.restore();
    q.save(); q.translate(1200, 1000); q.rotate(-0.08); q.beginPath(); rrect(q, -200, -14, 400, 28, 8); fs(q, '#3f6a8a', 3); q.beginPath(); poly(q, [200, -14, 240, 0, 200, 14]); fs(q, '#e8d0a0', 2.5); q.beginPath(); poly(q, [228, -4, 240, 0, 228, 4]); q.fillStyle = INK; q.fill(); q.restore();
    // 奖章
    medal(q, 1400, 600, 1.2, 0);
    // 另一盘磁带（背面朝上）
    q.save(); q.translate(640, 330); q.rotate(0.35); tape(q, 0, 0, 1.0, { shell: '#3a4a6a', band: '#4f8a78', shadow: true }); q.restore();
  });
  /** 纪念铁盒（俯拍）：几格，其中一格空着，贴着“乌纳的石头” */
  reg('tin-box', VW, VH, (q, w, h) => {
    q.fillStyle = lg(q, 0, 0, w, h, [[0, '#c8894c'], [1, '#9a6234']]); q.fillRect(0, 0, w, h);
    const R = rng(221); for (let i = 0; i < 40; i++) { const y = R() * h; q.strokeStyle = `rgba(90,50,20,${0.08 + R() * 0.1})`; q.lineWidth = 3; q.beginPath(); q.moveTo(0, y); q.bezierCurveTo(600, y + 20, 1300, y - 20, w, y); q.stroke(); }
    q.save(); q.translate(960, 560);
    q.fillStyle = 'rgba(0,0,0,.3)'; q.fillRect(-690, -400, 1400, 830);
    q.beginPath(); rrect(q, -700, -420, 1400, 820, 40); fs(q, lg(q, -700, -420, 700, 400, [[0, '#7ab0c0'], [1, '#4a7a90']]), 7);
    q.beginPath(); rrect(q, -660, -380, 1320, 740, 28); fs(q, '#e8e0cc', 4);
    // 格子
    for (const x of [-120]) line(q, x, -380, x, 360, 10, '#c8bca0');
    line(q, -120, 20, 660, 20, 10, '#c8bca0');
    // 左格：奖章（已经放好）
    medal(q, -400, -40, 2.0, 0);
    // 右上格：磁带位（空，磁带之后放进来）
    // 右下格：空着的一格 + 手写的纸签
    q.fillStyle = 'rgba(0,0,0,.06)'; q.fillRect(-110, 30, 760, 320);
    q.save(); q.translate(270, 190); q.rotate(-0.05);
    q.beginPath(); q.rect(-150, -50, 300, 100); fs(q, '#fffaf0', 3);
    q.fillStyle = 'rgba(240,210,120,.6)'; q.fillRect(-40, -62, 80, 24);
    E.text(q, '乌纳的石头', 0, 18, { size: 56, font: KAI, color: '#2c3e7a', weight: 700 });
    q.restore();
    q.restore();
  });

  /* =========================================================
   * 角色的挂点（按身高 h 的比例）：给道具、蒸汽、表情符号定位用
   * （角色代理的正式立绘到位后在这里校准）
   * ========================================================= */
  const KIND = { sheep: 'sheep-black', child: 'adele-child', adult: 'katia' };
  /**
   * 角色身上的点（用角色库的 anchors()）：part = 'head' | 'face' | 'mouth' | 'top' | 'chest' | 'hip' | 'hand'（近手）| 'handF'
   * | 'feet' | 'back'（羊背上放东西的地方）| 'tie'（领结处）。kind 可以是角色名，也可以是 'sheep' / 'child' / 'adult'
   */
  function at(o, kind, part) {
    const name = KIND[kind] || kind, C = E.cast, f = o.flip ? -1 : 1, h = o.h || 100;
    let A = null;
    if (C && C.anchors) { try { A = C.anchors(name, o); } catch (e) { A = null; } }
    if (!A) return [o.x, o.y - h * 0.6];
    if (name.startsWith('sheep')) {
      // 羊身上的点：角色库 v2 的 anchors 直接给嘴 / 背 / 头顶（跟着羊的起伏、低头）；旧版没有时按同一套公式自己算
      if (A[part]) return A[part];
      const L = part === 'back' ? [3, -37, 0] : part === 'mouth' ? [-3, 6, 1] : part === 'top' ? [2, -42, 0] : null;
      if (!L) return A.head;
      return sheepPt(o, L[0], L[1], L[2]);
    }
    if (part === 'hand') return A.handN;
    if (part === 'tie') return [lerp(A.chest[0], A.mouth[0], 0.4), lerp(A.chest[1], A.mouth[1], 0.4)];
    return A[part] || A.head;
  }

  /**
   * 羊身上一点的位置（和 o.x / o.y 同一坐标系）：lx, ly 是羊的局部坐标（面朝左、脚底原点、单位 = h / 54）；
   * head = 1 时 (lx, ly) 是相对头中心的偏移（跟着头一起低头 / 抬头）。公式和角色库 drawSheep 一致
   */
  function sheepPt(o, lx, ly, head) {
    const S = (o.h || 90) / 54, t = (o.t || 0) + (o.phase || 0), sp = o.speed > 0 ? o.speed : 1, pose = o.pose || 'stand', seed = o.seed != null ? o.seed : 5;
    const sit = pose === 'sit' || pose === 'sleep' || pose === 'lie';
    let bob = 0, rot = 0, hDy = 0, hRot = 0;
    if (pose === 'walk') { const ph = TAU * 1.6 * sp * t; bob = abs(sin(ph)) * 1.2; hDy = sin(ph * 2 - 0.6) * 0.5; }
    else if (pose === 'run' || pose === 'run-away') { const ph = TAU * 2.4 * sp * t; bob = abs(sin(ph)) * 3.2; rot = 0.08 * sin(ph * 2); hDy = sin(ph * 2 - 0.8) * 0.9; }
    else if (pose === 'jump' || pose === 'bounce') { const ph = t * 1.3 * sp, qq = ph - floor(ph), air = o.air != null ? clamp(o.air) : sin(PI * qq); bob = air * 14; rot = -0.12 * cos(PI * qq) * air; }
    else if (pose === 'float') { bob = 6 + 2 * sin(t * 1.4); rot = 0.05 * sin(t * 0.9); }
    else if (pose === 'push') { rot = -0.18; hDy = 2.5; hRot = -0.15; }
    else if (pose === 'eat') { hDy = 6 + 0.6 * sin(t * 5); hRot = -0.35; }
    else if (pose === 'look-up') { hRot = 0.35; hDy = -1.2; }
    else if (!sit) bob = 0.35 * sin(t * 2.2 + seed);
    if (pose === 'sleep') { hDy = 2.5 + 0.4 * sin(t * 1.5); hRot = -0.18; }
    let x = lx, y = ly;
    if (head) {
      const hx = -17, hy = -23 + (sit ? 3 : 0), a = hRot + 0.04 * sin(t * 1.3 + seed), ca = cos(a), sa = sin(a);
      x = hx + lx * ca - ly * sa; y = hy + hDy + lx * sa + ly * ca;
    }
    y += sit ? 5 : 0;
    const c = cos(rot), sn = sin(rot), fx = o.flip ? 1 : -1;
    const px = (x * c - y * sn) * S * fx, py = (x * sn + y * c - bob) * S;
    const r0 = o.rot || 0, c0 = cos(r0), s0 = sin(r0);
    return [o.x + px * c0 - py * s0, o.y + px * s0 + py * c0];
  }
  /** 睡在床上的她：角色的脸部特写侧过来枕在枕头上，被子盖到下巴（阁楼房间坐标） */
  /**
   * 睡在床上的她（阁楼房间坐标）：官方小人的睡姿（侧躺），头枕在枕头上；拼布被子从肩膀往下盖住身子，
   * 被子的上沿顺着身体鼓起来、跟着呼吸起伏
   */
  function sleepInBed(q, t) {
    const br = sin(t * 1.6) * 2.5;
    who(q, 'adele-child', { x: 305, y: 690, h: 330, pose: 'sleep', t, outfit: 'pajama', shadow: false });
    // 被子（盖在身上的那一截）：肩膀以下
    q.beginPath(); q.moveTo(262, 770); q.lineTo(262, 676); q.bezierCurveTo(300, 628 - br, 420, 624 - br, 480, 664); q.quadraticCurveTo(600, 684, 744, 690); q.lineTo(744, 770); q.closePath();
    fs(q, '#f2b8a0', 4);
    q.save(); q.clip();
    const QC = ['#f2b8a0', '#a8c8e0', '#f4d890', '#b8d8a8', '#e8a0b0', '#f6eadc'];
    for (let yy = 620; yy < 770; yy += 55) for (let xx = 262; xx < 744; xx += 70) { q.fillStyle = QC[((xx + yy * 3) / 5 | 0) % QC.length]; q.fillRect(xx, yy, 70, 55); q.strokeStyle = 'rgba(58,38,32,.2)'; q.lineWidth = 2; q.setLineDash([6, 5]); q.strokeRect(xx + 5, yy + 5, 60, 45); q.setLineDash([]); }
    q.fillStyle = 'rgba(80,40,30,.12)'; q.fillRect(262, 700, 482, 70);
    q.restore();
    q.beginPath(); q.moveTo(262, 770); q.lineTo(262, 676); q.bezierCurveTo(300, 628 - br, 420, 624 - br, 480, 664); q.quadraticCurveTo(600, 684, 744, 690); q.lineTo(744, 770); fs(q, null, 4);
    // 翻过来的被沿（白色的衬里），压在她的肩上
    q.beginPath(); q.moveTo(250, 690); q.bezierCurveTo(262, 652 - br, 312, 640 - br, 346, 650 - br * 0.6); q.lineTo(352, 676); q.bezierCurveTo(318, 668, 282, 680, 262, 704); q.closePath(); fs(q, '#fffdf4', 3.5);
  }
  /** 阁楼的床沿（房间坐标）：坐在床边的官方小人（座面 = 床垫顶，脚垂在床边） */
  const BED_EDGE = { y: 880, seat: 176 };
  /** 双铃闹钟：ring 0..1 时抖动 */
  function alarmClock(q, x, y, k, t, ring) {
    q.save(); q.translate(x, y); q.scale(k, k);
    const sh = ring > 0 ? sin(t * 70) * 0.12 * ring : 0;
    q.rotate(sh);
    for (const s of [-1, 1]) { q.beginPath(); q.arc(s * 34, -98, 22, PI, TAU); q.closePath(); fs(q, '#e8c064', 3.5); }
    line(q, -30, -76, 30, -76, 4, INK);
    q.beginPath(); circ(q, 0, -54, 52); fs(q, RED, 4.5); q.beginPath(); circ(q, 0, -54, 40); fs(q, '#fffaf0', 3);
    line(q, 0, -54, 0, -84, 4, INK); line(q, 0, -54, 20, -46, 4, INK);
    line(q, -30, -8, -40, 4, 5, INK); line(q, 30, -8, 40, 4, 5, INK);
    q.restore();
    if (ring > 0) {
      q.save(); q.strokeStyle = INK; q.lineWidth = 4; q.lineCap = 'round'; q.globalAlpha = ring;
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const a = -PI / 2 + s * (0.5 + i * 0.35); const r0 = 80 * k, r1 = 110 * k + sin(t * 30 + i) * 6; q.beginPath(); q.moveTo(x + cos(a) * r0, y - 60 * k + sin(a) * r0); q.lineTo(x + cos(a) * r1, y - 60 * k + sin(a) * r1); q.stroke(); }
      q.restore();
    }
  }
  /** 房子里（或近景房间里）会动的东西：房间坐标 1920×1080。who 是一个开关表 */
  function kettleSteam(q, t, x, y, k = 1) {
    q.save(); q.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.6 + i / 3) % 1;
      q.globalAlpha = 0.55 * sin(PI * ph); q.strokeStyle = '#fff'; q.lineWidth = (10 - ph * 5) * k;
      q.beginPath();
      for (let j = 0; j <= 10; j++) { const yy = y - j * 14 * k - ph * 60 * k, xx = x + sin(j * 0.7 + t * 3 + i * 2) * 10 * k * (j / 10) + j * 3 * k; j ? q.lineTo(xx, yy) : q.moveTo(xx, yy); }
      q.stroke();
    }
    q.restore();
  }
  function toaster(q, x, y, k, pop) {
    q.save(); q.translate(x, y); q.scale(k, k);
    q.beginPath(); rrect(q, -80, -120, 160, 120, 34); fs(q, lg(q, -80, 0, 80, 0, [[0, '#e8ecf0'], [0.5, '#b8c0c8'], [1, '#8a929c']]), 4.5);
    q.fillStyle = 'rgba(255,255,255,.55)'; q.fillRect(-58, -104, 12, 80);
    line(q, 60, -80, 60, -40 + pop * 30, 6, INK);
    q.restore();
  }
  function toast(q, x, y, k, rot, bite = 0) {
    q.save(); q.translate(x, y); q.rotate(rot); q.scale(k, k);
    q.beginPath(); q.moveTo(-40, 44); q.lineTo(-40, -20); q.bezierCurveTo(-56, -58, -10, -64, 0, -44); q.bezierCurveTo(10, -64, 56, -58, 40, -20); q.lineTo(40, 44); q.closePath(); fs(q, '#c9803a', 4);
    q.beginPath(); q.moveTo(-30, 36); q.lineTo(-30, -18); q.bezierCurveTo(-40, -44, -8, -48, 0, -32); q.bezierCurveTo(8, -48, 40, -44, 30, -18); q.lineTo(30, 36); q.closePath(); fs(q, '#f6d28e', 0);
    q.restore();
  }
  function houseDyn(q, s, t, mode, o = {}) {
    // 在房子坐标里（2400×1620）：各房间的小人和会动的东西（房间坐标里爸爸身高 ≈ 640）
    const R = (name, fn) => { const b = roomBox(name); q.save(); if (b.clip) { q.beginPath(); q.rect(b.clip[0], b.clip[1], b.clip[2], b.clip[3]); q.clip(); } q.translate(b.x, b.y); q.scale(b.s, b.s); fn(q); q.restore(); };
    R('attic', (q) => {
      if (mode === 'night') { who(q, 'adele-child', { x: 520, y: BED_EDGE.y, h: 384, pose: 'sit', seat: BED_EDGE.seat, t, outfit: 'pajama', shadow: false }); }
      else sleepInBed(q, t);
      who(q, 'sheep-black', { x: 1010, y: 714, h: 190, pose: 'sleep', t, shadow: false });
      if (mode === 'night') glow(q, 1790, 600, 260, '255,190,110', 0.5);
    });
    // 爸爸妈妈都背对着我们（不露脸）：爸爸站在穿衣镜前系领带（身子正好挡住镜子），妈妈跪在背包前收拾 / 夜里伏案写东西
    R('F2', (q) => {
      if (mode === 'night') return;
      who(q, 'katia', { x: MIRROR[0], y: 905, h: 660, pose: 'hold', view: 'back', t, outfit: 'suit' });
    });
    R('F1', (q) => {
      if (mode === 'night') { momAtDesk(q, t, false); return; }
      who(q, 'magna', { x: 930, y: 880, h: 600, pose: 'kneel2', arms: 'reach', aim: -0.2, view: 'back3', t, outfit: 'home' });
      backpack(q, 1150, 880, 1.05, 1);
    });
    R('G', (q) => {
      const night = mode === 'night';
      radio(q, night ? DINNER_RADIO[0] : 610, 562, night ? DINNER_RADIO[1] : 0.62, t, 1, night ? 0.3 : 0.6 + 0.3 * s.e, s.bp);
      kettleSteam(q, t, 1400, 470, 1.4);
      toaster(q, 1640, 610, 0.9, 0);
      // 和下一个镜头（晚饭）同样的座位：阿黛尔在桌子对面，爸爸妈妈背对着我们
      if (night) dinnerScene(q, s, t, { U: 640 });
    });
  }

  /* =========================================================
   * 镜头
   * ========================================================= */
  const hand0 = (s, seed, amp) => s.handheld(seed, s.t, s.reduced ? amp * 0.3 : amp);
  /**
   * 把镜头限制在画好的区域里：(x0, y0)–(x1, y1) 是焦平面（depth 1）上背景覆盖的范围。
   * 推拉、手持、摇镜头走到头时，画面边上不会露出没画的空白
   */
  function fit(cam, x0, y0, x1, y1) {
    const hw = VW / 2 / cam.z, hh = VH / 2 / cam.z;
    cam.x = x1 - x0 <= hw * 2 ? (x0 + x1) / 2 : clamp(cam.x, x0 + hw, x1 - hw);
    cam.y = y1 - y0 <= hh * 2 ? (y0 + y1) / 2 : clamp(cam.y, y0 + hh, y1 - hh);
    return cam;
  }
  const PH = (label, bg) => (g, s) => { g.fillStyle = bg || '#2a2030'; g.fillRect(0, 0, VW, VH); E.text(g, label, VW / 2, VH / 2, { size: 64, color: '#fff', font: 'sans' }); };

  /* ---------- 背景里的小生活：路人、鸟、船、鸭子、夜里的窗（全是 t 的纯函数） ---------- */
  /**
   * 远侧人行道上的路人：在世界坐标 [xa, xb] 里撒 n 个人，各自以不打滑的步速走（T0 为镜头开始的时刻）
   * o = { y, h, seed, stand（站着看摊子的比例） }
   */
  function passersby(q, t, T0, xa, xb, n, o = {}) {
    const seed = o.seed || 1, H = o.h || HT('crowd', US) * 0.84, y = o.y ?? SY - 40;
    const C = E.cast;
    for (let i = 0; i < n; i++) {
      const h = H * (0.86 + hash(seed, i, 3) * 0.2), dir = hash(seed, i) < 0.5 ? -1 : 1;
      const still = hash(seed, i, 4) < (o.stand || 0);
      const v = still ? 0 : (C && C.gait ? C.gait('crowd', { h, pose: 'walk' }).speed : 90);
      const x = xa + (xb - xa) * hash(seed, i, 2) + dir * v * (t - T0);
      who(q, 'crowd', { x, y: y - hash(seed, i, 5) * 10, h, pose: still ? 'stand' : 'walk', t: t + i * 0.37, flip: dir < 0, seed: seed * 7 + i, color: ['#6a5a8a', '#8a5a4a', '#4a6a7a', '#7a7a5a', '#9a6a7a', '#5a6a5a'][i % 6], sha: 0.3 });
    }
  }
  /**
   * 不打滑的步子：o = { h, pose: 'walk' | 'run', t（和画角色时同一个 t）, phase? }，dist = 已经走过的路程（像素，单调增加）。
   * 返回 { speed } 合并进角色参数：步子的相位正好是“走过的路程 / 步幅”——跑得快步子就快，停下来腿也停，
   * 而 t 不变（眨眼、头发、呼吸照常）。角色库里走 / 跑的相位 = 2π × 步频 × speed × t，步频 × 步幅 = gait 的速度
   */
  function stride(name, o, dist) {
    const C = E.cast, g1 = C && C.gait ? C.gait(name, Object.assign({}, o, { speed: 1 })).speed : 0;
    const tt = (o.t || 0) + (o.phase || 0);
    if (!(g1 > 0) || !(tt > 0.01)) return {};
    return { speed: max(1e-4, dist) / (g1 * tt) };
  }
  /** 小黑羊蹦着跑（跑得比腿快的时候）：每 per 秒一跳，落地的一瞬间才着地，不会有“滑步”。per 在一个镜头里要保持不变（相位 = t / per） */
  const bound = (per) => ({ pose: 'jump', speed: 1 / (1.3 * per) });
  /**
   * 远侧人行道上的行人（按远近排好再画）：list = [[x0（镜头开始时的位置）, dir（-1 / 0 站着 / 1）, y（脚底）, seed, color, h]]
   * 走路的速度来自 gait（不打滑）；彼此错开车道，迎面而过时近的挡住远的
   */
  function walkersOn(q, t, T0, list) {
    const C = E.cast;
    const L = list.slice().sort((a, b) => a[2] - b[2]);
    for (const [x0, dir, y, seed, color, h, face] of L) {
      const v = dir && C && C.gait ? C.gait('crowd', { h, pose: 'walk' }).speed : 0;
      who(q, 'crowd', { x: x0 + dir * v * (t - T0), y, h, pose: dir ? 'walk' : 'stand', t: t + seed * 0.37, flip: (dir || face || 1) < 0, seed, color, sha: 0.3 });
    }
  }
  /** 近处路沿上的矮东西（系船柱一样的铁桩、花箱）：前景视差，但矮到挡不住任何人的脸 */
  function kerbProps(q, xs, y, s) {
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], kind = i % 3 === 2 ? 1 : 0;
      q.save(); q.translate(x, y); q.scale(s, s);
      if (kind === 0) {
        q.beginPath(); rrect(q, -16, -118, 32, 118, 10); fs(q, '#3a3a44', 4);
        q.beginPath(); ell(q, 0, -118, 20, 9); fs(q, '#4a4a56', 3.5);
        q.fillStyle = 'rgba(255,255,255,.18)'; q.fillRect(-9, -108, 6, 96);
        q.beginPath(); q.rect(-19, -46, 38, 10); fs(q, '#2e2e38', 3);
      } else {
        q.beginPath(); q.moveTo(-70, -90); q.lineTo(70, -90); q.lineTo(60, 0); q.lineTo(-60, 0); q.closePath(); fs(q, '#8a5a3a', 4);
        q.fillStyle = 'rgba(0,0,0,.14)'; q.fillRect(-64, -40, 128, 10);
        for (let j = 0; j < 9; j++) { const fx = -58 + j * 14.5, fy = -96 - (j % 3) * 12; q.fillStyle = '#4f8a4a'; q.beginPath(); ell(q, fx, fy + 10, 14, 10); q.fill(); q.fillStyle = j % 2 ? RED : '#f2c46a'; q.beginPath(); circ(q, fx + 3, fy, 6.5); q.fill(); }
      }
      q.restore();
    }
  }
  /** 一群鸟从画面上方飞过（每 period 秒一群） */
  function flock(q, t, o = {}) {
    const per = o.period || 7, seed = o.seed || 3, k = ((t + (o.offset || 0)) % per) / per, n = o.n || 5, dir = o.dir || 1;
    const x0 = dir > 0 ? -200 : VW + 200, x1 = dir > 0 ? VW + 300 : -300, y0 = o.y || 180;
    for (let i = 0; i < n; i++) {
      const x = lerp(x0, x1, k) - dir * (i * 46 + hash(seed, i) * 30), y = y0 - k * 60 + (i % 2) * 22 + sin(t * 1.3 + i) * 6;
      bird(q, x, y, o.s || 1.2, t * 11 + i * 1.7, o.col || 'rgba(70,60,80,.75)');
    }
  }
  /** 河上的小船（慢慢漂）+ 几只鸭子（带 V 字水纹）；在河的图层坐标里画 */
  function riverLife(q, t, pal) {
    const bx = 300 + ((t * 26) % 2000), by = 640;
    // 水纹
    q.save(); q.strokeStyle = 'rgba(255,255,255,.45)'; q.lineWidth = 2.5;
    for (let j = 0; j < 3; j++) { const ph = (t * 0.8 + j / 3) % 1; q.globalAlpha = 0.5 * (1 - ph); q.beginPath(); q.ellipse(bx - 40 - ph * 90, by + 8, 70 + ph * 80, 8 + ph * 6, 0, PI * 0.1, PI * 0.9); q.stroke(); }
    q.restore();
    // 船
    q.beginPath(); q.moveTo(bx - 90, by - 14); q.quadraticCurveTo(bx, by + 26, bx + 96, by - 16); q.lineTo(bx + 80, by - 22); q.lineTo(bx - 76, by - 20); q.closePath(); fs(q, pal === 'golden' ? '#8a4a2a' : '#9a5a36', 3);
    q.fillStyle = 'rgba(255,230,190,.35)'; q.fillRect(bx - 70, by - 20, 140, 4);
    // 划船的人（简笔：戴草帽）
    q.beginPath(); rrect(q, bx - 16, by - 62, 32, 44, 10); fs(q, '#e8d8b8', 2.5);
    q.beginPath(); circ(q, bx, by - 74, 13); fs(q, '#f6d8c0', 2.5);
    q.beginPath(); q.ellipse(bx, by - 82, 24, 6, 0, 0, TAU); fs(q, '#e8c070', 2.5);
    const oar = sin(t * 2.4) * 0.5;
    q.save(); q.translate(bx, by - 40); q.rotate(0.6 + oar); line(q, -60, 0, 70, 0, 4, '#6a4a3a'); q.restore();
    // 鸭子
    for (let i = 0; i < 3; i++) {
      const dx = 1300 + i * 70 - ((t * 18) % 900), dy = 700 + i * 16 + sin(t * 2 + i) * 2;
      q.strokeStyle = 'rgba(255,255,255,.45)'; q.lineWidth = 2; q.beginPath(); q.moveTo(dx + 26, dy + 4); q.lineTo(dx + 70, dy - 6); q.moveTo(dx + 26, dy + 6); q.lineTo(dx + 70, dy + 16); q.stroke();
      q.beginPath(); q.ellipse(dx + 6, dy, 18, 9, 0, 0, TAU); fs(q, i === 1 ? '#8a6a4a' : '#fbfaf6', 2);
      q.beginPath(); circ(q, dx - 10, dy - 10, 7); fs(q, i === 1 ? '#3a6a4a' : '#fbfaf6', 2);
      q.beginPath(); q.moveTo(dx - 16, dy - 10); q.lineTo(dx - 26, dy - 8); q.lineTo(dx - 16, dy - 6); q.closePath(); fs(q, '#f2a040', 1.5);
    }
  }
  /** 夜里的城：远处的窗一盏盏亮了又灭（在 rooftops 图层坐标里） */
  function townTwinkle(q, t) {
    for (let i = 0; i < 26; i++) {
      const x = -200 + hash(271, i) * 2400, y = 560 + hash(272, i) * 260;
      const on = sin(t * (0.3 + hash(273, i) * 0.5) + i * 2.3);
      if (on < 0.2) continue;
      glow(q, x, y, 22, '255,200,120', (on - 0.2) * 0.8);
      q.fillStyle = `rgba(255,214,140,${(on - 0.2) * 1.1})`; q.fillRect(x - 4, y - 6, 8, 11);
    }
  }

  /* ---------- 01 序：窗台上的收音机，黎明，手写标题 ---------- */
  function shotRadio(g, s) {
    const t = s.t;
    const dawn = up(t, 0.4, 7.4);
    const hh = hand0(s, 3, 3);
    const cam = fit({ x: 960 + hh.sx, y: 560 - 26 * easeIO(clamp(t / 7.8)) + hh.sy, z: 1 + 0.07 * easeIO(clamp(t / 7.8)) }, 0, 0, VW, VH);
    sky(g, s, 'predawn'); sky(g, s, 'dawn', dawn);
    const sunX = 1250, sunY = lerp(780, 600, up(t, 2.2, 7.8, easeO));
    s.layer(g, cam, 0.25, (q) => {
      s.kit.stars(q, t, { n: 50, seed: 4, y: 40, h: 500, size: 2.4, tw: 0.6, color: '255,240,230' });
      q.fillStyle = `rgba(255,236,210,${0.6 * dawn})`; q.fillRect(0, 0, VW, VH);
      glow(q, sunX, sunY, 520, '255,170,110', 0.55 * dawn, 'lighter', false);
      q.beginPath(); circ(q, sunX, sunY, 44); q.fillStyle = `rgba(255,240,200,${clamp(dawn * 1.3)})`; q.fill();
      q.drawImage(lay(s, 'far:dawn'), -240, 420, 2400, 560);
      for (let i = 0; i < 5; i++) { const k = ((t - 3 - i * 0.35) / 5); if (k > 0 && k < 1) bird(q, 300 + k * 1500 + i * 30, 300 - k * 90 + (i % 2) * 24, 1.1, t * 11 + i, 'rgba(60,40,70,.7)'); }
    });
    const on = up(t, 0.7, 1.5, easeO);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'win-dawn');
      radio(q, 1110, 812, 0.98, t, on, clamp(0.35 + s.e * 1.2), s.bp);
      q.save(); q.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const ph = (t * 0.35 + i / 3) % 1; q.globalAlpha = 0.45 * sin(PI * ph); q.strokeStyle = '#fff'; q.lineWidth = 6; q.beginPath(); for (let j = 0; j <= 8; j++) { const yy = 680 - j * 12 - ph * 40, xx = 1490 + i * 12 + sin(j * 0.8 + t * 2 + i) * 9; j ? q.lineTo(xx, yy) : q.moveTo(xx, yy); } q.stroke(); }
      q.restore();
    });
    s.post.fill(g, '#2a2c5a', 0.62 * (1 - dawn), 'multiply');
    s.layer(g, cam, 1, (q) => { glow(q, 1110 + 82 * 0.98, 812 - 152 * 0.98, 160, '255,180,90', on * (0.35 + 0.4 * (1 - dawn))); });
    s.kit.rays(g, t, { x: sunX, y: sunY, n: 9, len: 1300, spread: 2.6, angle: PI * 0.62, rgb: '255,226,180', alpha: 0.12 * dawn, seed: 21 });
    s.kit.particles(g, t, 'dust', { n: 40, seed: 7, rgb: '255,236,200' });
    s.post.leak(g, t, { x: sunX, y: sunY, r: 900, rgb: '255,170,100', a: 0.3 * dawn });
    // 标题与宽银幕黑边在影片的 overlay 里画（调色之后）：titlesOver / lbAt
  }

  /* ---------- 02 剖面房子：阳光一层层照进来 ---------- */
  function shotHouse(g, s, night) {
    const t = s.t;
    const hh = hand0(s, 5, 3);
    const k = night ? easeIO(s.at(1.0, s.dur)) : 0;
    const z = night ? 1.02 + 0.66 * k : 1.02 + 0.045 * easeS(s.p);
    const tx = night ? lerp(960, 873, k) : 960, ty = night ? lerp(540, 880, k) : 540 - 24 * s.p;
    const cam = fit({ x: tx + hh.sx, y: ty + hh.sy, z }, 0, 0, VW, VH);
    sky(g, s, night ? 'dusk' : 'morning');
    s.layer(g, cam, 0.3, (q) => {
      if (night) s.kit.stars(q, t, { n: 70, seed: 9, h: 420, size: 2.2 });
      else { glow(q, 300, 160, 420, '255,236,190', 0.7, 'lighter', false); q.beginPath(); circ(q, 300, 160, 56); q.fillStyle = '#fff6dc'; q.fill(); }
      q.drawImage(lay(s, night ? 'far:night' : 'far:morning'), -240, 470, 2400, 560);
      if (!night) for (let i = 0; i < 4; i++) q.drawImage(s.kit.cloudSprite(30 + i, 520, 200, '#ffffff', '#e8d8e8'), -200 + i * 620 + t * 9 % 200, 90 + (i % 2) * 110, 520, 200);
    });
    s.layer(g, cam, 1, (q) => {
      q.save(); q.scale(0.6667, 0.6667);
      q.drawImage(lay(s, night ? 'house:night' : 'house:day'), 0, 0, 2880, 1620);
      q.translate(240, 0);
      houseDyn(q, s, t, night ? 'night' : 'day');
      if (!night) {
        // 早晨：阳光按拍子一层层照进来（屋顶 → 地面）
        const L = [['attic', 8.26], ['F2', 8.76], ['F1', 9.26], ['G', 9.76]];
        for (const [name, tl] of L) {
          const a = 1 - up(t, tl - 0.05, tl + 0.35);
          const b = roomBox(name);
          const box = b.clip || [HOUSE.main[0], 200, 1618 - HOUSE.main[0], HOUSE.attic - 200];
          if (a > 0.01) { q.save(); q.globalCompositeOperation = 'multiply'; q.globalAlpha = a * 0.55; q.fillStyle = '#6a6aa0'; q.fillRect(box[0], box[1], box[2] + 260, box[3]); q.restore(); }
          const f = clamp((t - tl) / 0.5); if (f > 0 && f < 1) { q.save(); q.globalCompositeOperation = 'lighter'; q.globalAlpha = (1 - f) * 0.35; q.fillStyle = '#ffd89a'; q.fillRect(box[0], box[1], box[2] + 260, box[3]); q.restore(); }
        }
        for (let i = 0; i < 6; i++) { const kk = ((t * 0.3 + i / 6) % 1); q.globalAlpha = 0.4 * sin(PI * kk); q.fillStyle = '#fff'; q.beginPath(); circ(q, 1450 + kk * 80 + sin(kk * 6 + i) * 10, 150 - kk * 220, 14 + kk * 30); q.fill(); q.globalAlpha = 1; }
      } else {
        // 夜里：烟囱冒着一缕淡烟，厨房的灯一闪一闪地暖
        for (let i = 0; i < 5; i++) { const kk = ((t * 0.25 + i / 5) % 1); q.globalAlpha = 0.25 * sin(PI * kk); q.fillStyle = '#c8c8e8'; q.beginPath(); circ(q, 1450 + kk * 60, 150 - kk * 200, 12 + kk * 26); q.fill(); q.globalAlpha = 1; }
      }
      q.restore();
    });
    s.kit.particles(g, t, 'dust', { n: 26, seed: 8 });
  }

  /* ---------- 03 爸爸对着穿衣镜系领带（系紧的那一下，他朝镜子眨了下眼） ---------- */
  function shotMirror(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 7, 4);
    // 从爸爸身后拍：他站在穿衣镜正前方系领带，身子正好挡住镜子里的自己（他的脸不入画）；
    // 镜面上是窗户照进来的晨光，系紧的那一下，领口那儿闪一下光
    const cam = fit({ x: 1330 + hh.sx - 24 * s.p, y: 560 + hh.sy, z: 1.32 + 0.06 * s.p }, 0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'room-parents');
      shaft(q, 900, 150, -0.35, 360, 1100, 0.35);
      const tight = up(lt, 0.95, 1.1, easeO);
      const [mx, my, mrx, mry] = MIRROR;
      // 镜面：映着窗外的晨光（一块斜的亮斑慢慢滑过）
      q.save(); q.beginPath(); ell(q, mx, my, mrx, mry); q.clip();
      q.fillStyle = 'rgba(255,248,230,.35)'; q.beginPath(); q.moveTo(mx - 100, my - 240); q.lineTo(mx - 20, my - 240); q.lineTo(mx - 130, my + 240); q.lineTo(mx - 210, my + 240); q.fill();
      const gx = mx - 60 + 80 * s.p; q.fillStyle = 'rgba(255,255,255,.28)'; q.beginPath(); q.moveTo(gx, my - 240); q.lineTo(gx + 30, my - 240); q.lineTo(gx - 60, my + 240); q.lineTo(gx - 90, my + 240); q.fill();
      q.restore();
      shadow(q, mx, 935, 150, 0.4);
      const K = { x: mx, y: 935, h: 690, pose: 'hold', view: 'back', t, outfit: 'suit' };
      who(q, 'katia', K);
      // 系紧的那一下：领口两侧（肩头上方）闪一下光
      const A = E.cast && E.cast.anchors ? E.cast.anchors('katia', K) : null, cy = A ? lerp(A.chest[1], A.head[1], 0.55) : 935 - 470;
      const a = tight * (1 - up(lt, 1.3, 1.9));
      sparkle(q, mx + 130, cy, 34 * tight, a, lt * 2); sparkle(q, mx - 120, cy + 20, 22 * tight, a * 0.8, lt * 3);
    });
  }

  /* ---------- 04 妈妈收拾考察背包：东西按拍子跳进包里 ---------- */
  function shotPack(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 9, 4);
    const cam = fit({ x: 1100 + hh.sx + 40 * s.p, y: 600 + hh.sy, z: 1.12 }, 0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'room-study');
      shaft(q, 980, 160, 0.3, 380, 1000, 0.3);
      // 妈妈背对着我们跪在背包前（脸不入画），东西一样一样跳进包里
      who(q, 'magna', { x: 880, y: 905, h: 620, pose: 'kneel2', arms: 'reach', aim: -0.1, view: 'back3', t, outfit: 'home' });
      const open = 1 - up(lt, 1.75, 1.95, easeO);
      backpack(q, 1160, 905, 1.12, open);
      const items = [
        (q, a) => { q.rotate(a); q.beginPath(); rrect(q, -8, -70, 16, 120, 6); fs(q, '#b07a44', 3); q.beginPath(); poly(q, [-34, -74, 40, -78, 40, -58, -26, -54]); fs(q, '#8a93a0', 3.5); },
        (q, a) => { q.rotate(a); jar(q, 0, 30, 1, '#c9a27a'); },
        (q, a) => { q.rotate(a); q.beginPath(); rrect(q, -44, -32, 88, 64, 6); fs(q, '#3f6a8a', 3.5); q.fillStyle = '#f6eedc'; q.fillRect(-36, -26, 6, 52); },
        (q, a) => { q.rotate(a); q.beginPath(); circ(q, 0, 0, 30); fs(q, '#e8c064', 3.5); q.beginPath(); circ(q, 0, 0, 22); fs(q, '#fffaf0', 2); line(q, 0, 0, 0, -18, 3, RED); },
      ];
      const src = [[760, 640], [700, 600], [980, 630], [1240, 620]];
      for (let i = 0; i < items.length; i++) {
        const tb = B(6) + i * 0.5 - s.shot.t0, k = clamp((lt - tb) / 0.46);
        if (k <= 0 || k >= 1) continue;
        const [x, y] = arc3(src[i][0], src[i][1], 1160, 700, 230, easeIO(k));
        q.save(); q.translate(x, y); q.scale(1.1, 1.1); items[i](q, k * 5 * (i % 2 ? 1 : -1)); q.restore();
        if (k > 0.85) sparkle(q, 1160, 690, 30, (1 - k) * 6, i);
      }
    });
  }

  /* ---------- 05 阁楼：她还在睡，小羊睡在书堆上；闹钟响，她一下坐起来 ---------- */
  function shotAttic(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 11, 3);
    const jolt = up(t, 17.26, 17.4, easeO);
    const cam = fit({ x: 640 + hh.sx + 20 * s.p, y: 620 + hh.sy - 30 * jolt, z: 1.35 + 0.08 * s.p }, 0, 0, VW, VH);
    const ring = t > 17.26 ? 1 : 0;
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'room-attic');
      shaft(q, 960, 330, 0.55, 260, 900, 0.4);
      const awake = t > 17.5;
      if (!awake) sleepInBed(q, t);
      else {
        // 一下子坐起来：坐在床沿上，脚垂在床边（官方小人的坐姿），朝着响个不停的闹钟
        who(q, 'adele-child', { x: 560, y: BED_EDGE.y, h: 384, pose: 'sit', seat: BED_EDGE.seat, t, outfit: 'pajama', shadow: false });
        bang(q, 600, 380, clamp((t - 17.5) / 0.4), 1.2);
      }
      const sh = { x: 1010, y: 714, h: 190, pose: awake ? 'jump' : 'sleep', t, expr: awake ? 'surprise' : 'sleepy', air: awake ? 0.5 * sin(PI * clamp((t - 17.5) / 0.26)) : 0 };
      who(q, 'sheep-black', Object.assign(sh, { shadow: false }));
      if (!awake) { const [zx, zy] = at(sh, 'sheep', 'top'); zzz(q, zx + 20, zy, t, 1.1); }
      alarmClock(q, 840, 760, 0.9, t, ring);
    });
  }

  /* ---------- 06 冲下楼：楼梯井里一路往下 ---------- */
  /**
   * 楼梯井里的路线：阁楼地板上跑几步 → 每一跑楼梯跳两下（落在第 4 级的台阶面正中、再落到休息平台 / 下一层地板）→ 一楼地板上跑向厨房。
   * 每一跳 0.25 秒、落地点都在台阶面上（不是沿着台阶的斜线滑下去）
   */
  const STAIR_HOPS = (() => {
    const L = [[580, 660]];
    for (let i = 0; i < 3; i++) { const y0 = 660 + 640 * i; L.push([915, y0 + 160], [1360, y0 + 320], [1009, y0 + 480], [575, y0 + 640]); }
    return L;
  })();
  const STAIR_T0 = 18.12, STAIR_HOP = 0.25, STAIR_T1 = STAIR_T0 + (STAIR_HOPS.length - 1) * STAIR_HOP;
  /** tt 时刻在楼梯井里的位置：{ x, y, dir, mode: 'run' | 'hop', u（跳的进度）, d（在平地上跑过的路程）} */
  function stairPath(tt, arc = 50) {
    if (tt < STAIR_T0) { const k = clamp((tt - 17.76) / (STAIR_T0 - 17.76)); return { x: lerp(380, 580, k), y: 660, dir: 1, mode: 'run', d: 200 * k, v: 200 / (STAIR_T0 - 17.76) }; }
    if (tt < STAIR_T1) {
      const H = hops(STAIR_HOPS, tt - STAIR_T0, STAIR_HOP, arc), i = min(STAIR_HOPS.length - 2, floor((tt - STAIR_T0) / STAIR_HOP));
      return { x: H.x, y: H.y, yl: H.y + arc * 4 * H.u * (1 - H.u), dir: STAIR_HOPS[i + 1][0] >= STAIR_HOPS[i][0] ? 1 : -1, mode: 'hop', u: H.u };
    }
    const k = clamp((tt - STAIR_T1) / (21.76 - STAIR_T1));
    return { x: lerp(575, 300, k), y: 2580, dir: -1, mode: 'run', d: 275 * k, v: 275 / (21.76 - STAIR_T1) };
  }
  function shotStairs(g, s) {
    const t = s.t;
    const A = stairPath(t), C = stairPath(t - 0.12, 0);
    const hh = hand0(s, 13, 5);
    const cam = fit({ x: 960 + (A.x - 960) * 0.15 + hh.sx, y: clamp(C.y - 150, 540, 2260) + hh.sy, z: 1 }, 0, 0, VW, 2800);
    const U = 520; // 楼梯井每层净高 620：爸爸（连羊角）要站得进去
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'stairwell');
      // 爸爸在三楼门口挥手，妈妈在二楼递书包
      // 爸爸妈妈背对着我们（3/4 背影，脸朝楼梯那边，不露脸）：爸爸在三楼挥手，妈妈在二楼把书包递过去
      who(q, 'katia', { x: 300, y: 1300, h: U, pose: t > 18.8 && t < 19.9 ? 'wave2' : 'hold', view: 'back3', t, outfit: 'suit' });
      const handed = t > 20.05;
      who(q, 'magna', { x: 430, y: 1940, h: HT('magna', U), pose: handed ? 'wave' : 'reach', aim: -0.1, view: 'back3', t, outfit: 'home', prop: handed ? null : 'satchel' });
      const person = (name, P, o) => {
        if (P.mode === 'hop') {
          // 影子贴着台阶（两个落点之间的连线），跳得越高越淡
          shadow(q, P.x, P.yl, o.h * (name === 'sheep-black' ? 0.42 : 0.22), 0.42 * (1 - clamp((P.yl - P.y) / 120)));
          return who(q, name, Object.assign({ x: P.x, y: P.y, pose: 'jump', air: 0.6 * sin(PI * P.u), flip: P.dir < 0, t, shadow: false }, o));
        }
        who(q, name, Object.assign({ x: P.x, y: P.y, pose: 'run', flip: P.dir < 0, t }, o, stride(name, { h: o.h, pose: 'run', t }, P.d)));
      };
      person('sheep-black', stairPath(t - 0.38), { h: HT('sheep-black', U) });
      person('adele-child', A, { h: HT('adele-child', U), expr: 'determined', outfit: 'school', prop: handed ? 'satchel' : null, wind: 0.6 });
    });
    speedLines(g, t, 0.35, 'rgba(255,250,240,.5)', PI / 2);
  }
  /** 速度线（屏幕边缘的细线，纯函数） */
  function speedLines(g, t, a, col, ang = 0, n = 26) {
    if (a <= 0) return;
    g.save(); g.strokeStyle = col; g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const ph = (t * (2 + hash(51, i) * 2) + hash(52, i)) % 1;
      const side = hash(53, i) < 0.5 ? -1 : 1;
      const off = (0.62 + hash(54, i) * 0.36) * side;
      const len = 120 + hash(55, i) * 260;
      const cx = VW / 2 + cos(ang + PI / 2) * off * VW * 0.55, cy = VH / 2 + sin(ang + PI / 2) * off * VH * 0.55;
      const pos = (ph - 0.5) * (VW + len) * 1.2;
      const x = cx + cos(ang) * pos, y = cy + sin(ang) * pos;
      g.globalAlpha = a * sin(PI * ph); g.lineWidth = 2 + hash(56, i) * 3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - cos(ang) * len, y - sin(ang) * len); g.stroke();
    }
    g.restore();
  }

  /* ---------- 07 厨房：吐司弹出来，落进小羊嘴里 ---------- */
  function shotKitchen(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 15, 4);
    const cam = fit({ x: 1130 + hh.sx, y: 590 + hh.sy, z: 1.12 }, 0, 0, VW, VH);
    const U = 760;
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'room-kitchen');
      shaft(q, 620, 200, 0.45, 300, 1000, 0.35);
      radio(q, 610, 562, 0.62, t, 1, clamp(0.4 + s.e), s.bp);
      kettleSteam(q, t, 1400, 470, 1.4);
      const pop = up(t, 22.7, 22.8, easeO);
      // 烤面包机里的吐司（还没弹出来之前）在人物后面：她从面包机前面跑过时，吐司不会盖在她脸上
      if (t < 22.75) toast(q, 1650, 515 - pop * 30, 0.8, 0);
      toaster(q, 1640, 610, 0.9, pop);
      // 阿黛尔：从右跑进来（匀速跑 → 最后几步刹住），停一下（抬头看吐司），再往右冲出去。腿的相位跟着走过的路程，脚下不打滑
      const h = HT('adele-child', U);
      const dash = (tt, T, D, T2) => { const v = D / (T - T2 / 2), k = clamp(tt / T) * T; return k < T - T2 ? v * k : D - v * (T - k) * (T - k) / (2 * T2); };
      const inA = dash(t - 21.76, 0.69, 800, 0.32), outA = t > 23.15 ? 920 * pow(clamp((t - 23.15) / 0.6), 2) : 0;
      const ax = t < 22.45 ? 1980 - inA : t < 23.15 ? 1180 : 1180 + outA;
      const pose = t < 22.45 ? 'run' : t < 23.15 ? 'look-up' : 'run';
      const gA = pose === 'run' ? stride('adele-child', { h, pose: 'run', t }, t < 22.45 ? inA : outA) : {};
      // 小羊：跟进来，接住吐司（低头吃一口），再跟着冲出去（比阿黛尔离镜头远半步：先画，冲出门时被她挡住而不是反过来）
      const hs = HT('sheep-black', U), inS = dash(t - 22.0, 0.6, 610, 0.3), outS = t > 23.3 ? 700 * pow(clamp((t - 23.3) / 0.45), 2) : 0;
      const sx = t < 22.6 ? 2060 - inS : t < 23.3 ? 1450 : 1450 + outS;
      const caught = t > 23.17, running = t < 22.6 || t > 23.3;
      // 小羊跑得比腿快：一蹦一蹦地冲（每 0.2 秒一跳，只在落地的一瞬着地）
      const sh = Object.assign({ x: sx, y: 896, h: hs, pose: caught ? 'eat' : 'look-up', t, flip: t < 22.6, expr: caught ? 'laugh' : 'neutral', heat: caught ? 0.5 : 0 }, running ? bound(0.2) : {});
      who(q, 'sheep-black', sh);
      const k = clamp((t - 22.75) / 0.42);
      const [m1, m2] = at(sh, 'sheep', 'mouth');
      if (k >= 1) toast(q, m1 + 10, m2 + 8, 0.6, 0.4); // 叼在嘴里的吐司和小羊同一层（在阿黛尔后面）
      who(q, 'adele-child', Object.assign({ x: ax, y: 905, h, pose, t, flip: t < 22.45, expr: t < 23.15 && t > 22.75 ? 'laugh' : 'determined', outfit: 'school', prop: 'satchel', wind: 0.4, look: [0.6, -0.8] }, gA));
      img(q, s, 'kitchen-table');
      if (t >= 22.75 && k < 1) { const [x, y] = arc3(1650, 485, m1, m2, 260, k); toast(q, x, y, 0.8, k * 7); }
      if (t > 22.75 && t < 23.1) sparkle(q, 1650, 500, 40, 1 - (t - 22.75) / 0.35, t * 3);
    });
  }

  /* ---------- 08–12 上学路：冲出家门 → 电车与小提琴手 → 钟面 → 狂奔 → 校门 → 台阶 → 起跳 ---------- */
  const SY = 872; // 远侧人行道上人物的脚底
  const US = 500; // 街景里“爸爸的身高”（阿黛尔 = 300）
  const DOOR_W = HOME_DW * SS, DOOR_H = (HOME_GH - 30) * SS;
  function adeleX(t) {
    const d = t - 24.0;
    if (d <= 0) return HOME_DOOR;
    const x8 = (u) => HOME_DOOR + (u < 0.4 ? 560 * u * u / 0.8 : 560 * (u - 0.2));
    if (t < B(13)) return x8(d);
    const X9 = x8(B(13) - 24.0);
    return X9 + (t - B(13)) * 430;
  }
  function pigeonsOnWalk(q, t, xs, walkerX, y, s = 1) {
    for (let i = 0; i < xs.length; i++) {
      const px = xs[i], tt = walkerX(px);
      const f = t - tt;
      if (f <= 0) pigeon(q, px, y + (i % 2) * 6, 1.3 * s, i % 2 === 0, 0, 0);
      else if (f < 2.5) pigeon(q, px + f * (240 + i * 30), y - f * (380 + i * 40) + f * f * 30, 1.3 * s, false, 1, t * 22 + i);
    }
  }
  /**
   * 家门打开（门扇往屋里开）：拱形门洞里是亮着暖灯的门厅；门扇绕左边的铰链转进去，按透视变窄、远边略短。
   * 门厅和门扇都裁在门洞里（不会盖到门洞外面的墙上），最后补上门洞的描边、侧壁的厚度和门槛石
   */
  function homeDoorOpen(q, op, glowA = 0.35) {
    const dx = HOME_DOOR, dw = DOOR_W, dh = DOOR_H, x0 = dx - dw / 2, x1 = dx + dw / 2, top = GY - dh, spY = top + dw / 2;
    const arch = () => { q.beginPath(); q.moveTo(x0, GY); q.lineTo(x0, spY); q.arc(dx, spY, dw / 2, PI, 0); q.lineTo(x1, GY); q.closePath(); };
    q.save(); arch(); q.clip();
    // 门厅：暗墙、从里面透出来的暖光、木地板、右侧门洞的厚度（侧壁的阴影）
    q.fillStyle = '#3a2a2c'; q.fillRect(x0 - 4, top - 4, dw + 8, dh + 8);
    q.fillStyle = lg(q, 0, top, 0, GY, [[0, `rgba(255,190,120,${0.35 * glowA})`], [0.65, `rgba(255,206,150,${glowA})`], [1, `rgba(255,222,176,${1.2 * glowA})`]]); q.fillRect(x0, top, dw, dh);
    q.fillStyle = 'rgba(120,78,52,.85)'; q.fillRect(x0, GY - dh * 0.09, dw, dh * 0.09);
    q.fillStyle = 'rgba(40,20,20,.3)'; q.fillRect(x1 - dw * 0.1, top, dw * 0.1, dh);
    // 门扇：a = 开的角度（0 = 关着，≈ 93° 全开）；镜头在门的右前方，所以全开时还看得见一窄条门扇的内侧
    const a = clamp(op) * 1.62, far = dw * (cos(a) + 0.24 * sin(a)), xf = x0 + far;
    if (far > 1) {
      const dt = dh * 0.05 * sin(a), db = dh * 0.07 * sin(a);
      q.beginPath(); q.moveTo(x0, top - 8); q.lineTo(xf, top - 8 + dt); q.lineTo(xf, GY - db); q.lineTo(x0, GY); q.closePath();
      q.fillStyle = lg(q, x0, 0, xf, 0, [[0, '#2f5246'], [1, op > 0.5 ? '#46725f' : '#3f6a5a']]); q.fill();
      q.lineWidth = 3; q.strokeStyle = INK; q.stroke();
      // 两块凹进去的门板（跟着透视）
      const P = (u, v) => [lerp(x0, xf, u), lerp(lerp(top - 8, GY, v), lerp(top - 8 + dt, GY - db, v), u)];
      q.strokeStyle = 'rgba(20,40,32,.45)'; q.lineWidth = 2.2;
      for (const [v0, v1] of [[0.3, 0.55], [0.62, 0.9]]) { const A = P(0.2, v0), B2 = P(0.8, v0), C = P(0.8, v1), D = P(0.2, v1); q.beginPath(); q.moveTo(A[0], A[1]); q.lineTo(B2[0], B2[1]); q.lineTo(C[0], C[1]); q.lineTo(D[0], D[1]); q.closePath(); q.stroke(); }
      const K = P(0.86, 0.56); q.fillStyle = '#e8c064'; q.beginPath(); circ(q, K[0], K[1], 4); q.fill();
    }
    q.restore();
    arch(); q.lineWidth = 3.6; q.strokeStyle = INK; q.stroke();
    q.beginPath(); q.rect(x0 - 16, GY - 12.8, dw + 32, 12.8); fs(q, '#b8a898', 2.4);
  }
  /** 正从家门里出来的角色：on 时裁在“门洞 ∪ 门的右边 ∪ 门槛以下”里（还在屋里的那部分藏在墙后面） */
  function fromDoor(q, on, fn) {
    if (!on) { fn(); return; }
    const dx = HOME_DOOR, dw = DOOR_W, x0 = dx - dw / 2, x1 = dx + dw / 2, spY = GY - DOOR_H + dw / 2;
    q.save(); q.beginPath();
    q.moveTo(x0, GY + 2); q.lineTo(x0, spY); q.arc(dx, spY, dw / 2, PI, 0); q.lineTo(x1, GY + 2); q.closePath();
    q.rect(x1, -4000, 12000, 8000); q.rect(-8000, GY + 2, 20000, 4000);
    q.clip(); fn(); q.restore();
  }
  function shotDoor(g, s) {
    const t = s.t;
    const ax = adeleX(t);
    const hh = hand0(s, 17, 4);
    const cam = fit({ x: max(HOME_DOOR + 280, ax + 240) + hh.sx, y: 560 + hh.sy, z: 1.05 }, -1e5, -1e5, 1e5, 1320);
    sky(g, s, 'morning');
    glow(g, 260, 120, 500, '255,240,200', 0.6, 'lighter', false);
    streetScene(g, s, cam, 'morning', { mid: (q) => {
      const op = up(t, 23.8, 23.95, easeO);
      if (op > 0) homeDoorOpen(q, op);
      walkersOn(q, t, s.shot.t0, [[1330, 0, 842, 81, '#9a6a7a', 395, -1], [2100, -1, 846, 77, '#6a5a8a', 400], [2770, 1, 836, 78, '#8a5a4a', 380], [3150, 0, 840, 79, '#4a6a7a', 410]]);
      pigeonsOnWalk(q, t, [HOME_DOOR + 1250, HOME_DOOR + 1310, HOME_DOOR + 1380, HOME_DOOR + 1460], (px) => 24.2 + (px - 180 - HOME_DOOR) / 560, SY);
      // 从门里蹦出来：落地点正好接上之后跑步的路线（不跳帧）；刚出门的一瞬间被门洞裁着（身体还在屋里的部分藏在墙后）
      const xA = (tt) => adeleX(tt) + 110, xS = (tt) => adeleX(tt - 0.3) + 30;
      const JS = 24.28, LS = 24.64;
      if (t > JS) {
        const k = clamp((t - JS) / (LS - JS)), j = t < LS, [jx, jy] = arc3(HOME_DOOR - 6, GY + 2, xS(LS), SY, 26, k);
        const sh = Object.assign({ x: j ? jx : xS(t), y: j ? jy : SY, h: HT('sheep-black', US), t, heat: 0.3 }, j ? { pose: 'jump', air: 0.7 * sin(PI * k) } : bound(0.3));
        fromDoor(q, j, () => { who(q, 'sheep-black', sh); const [mx, my] = at(sh, 'sheep', 'mouth'); toast(q, mx + 8, my + 6, 0.45, 0.3); });
      }
      const JA = 23.9, LA = 24.26;
      if (t > JA) {
        const k = clamp((t - JA) / (LA - JA)), j = t < LA, [jx, jy] = arc3(HOME_DOOR - 6, GY + 2, xA(LA), SY, 24, k), h = HT('adele-child', US);
        const o = { x: j ? jx : xA(t), y: j ? jy : SY, h, pose: j ? 'jump' : 'run', air: j ? 0.5 * sin(PI * k) : undefined, t, expr: 'determined', outfit: 'school', prop: 'satchel', wind: 0.6 };
        if (!j) Object.assign(o, stride('adele-child', { h, pose: 'run', t }, xA(t) - xA(LA)));
        fromDoor(q, j, () => who(q, 'adele-child', o));
      }
    } });
    flock(g, t, { period: 6.5, y: 150, n: 5, seed: 5, offset: 2 });
    // 前景：路灯只放在不会从人物前面扫过的位置（按这个镜头的运镜算过）；中间用矮的铁桩 / 花箱做视差
    s.layer(g, cam, 1.3, (q) => { kerbProps(q, [-260, 430, 890, 1350, 1810, 2270, 2730, 3190, 3620, 4180, 4640], 1110, 1.3); lampPost(q, 200, 1110, 1.3); lampPost(q, 3900, 1110, 1.3); });
    s.kit.rays(g, t, { x: 200, y: -80, n: 8, len: 1500, spread: 0.7, angle: PI / 2 - 0.55, alpha: 0.13, seed: 31 });
    s.kit.particles(g, t, 'dust', { n: 24, seed: 18 });
  }
  function shotViolin(g, s) {
    const t = s.t, lt = s.lt;
    const ax = adeleX(t) + 110;
    const hh = hand0(s, 19, 4);
    const cam = fit({ x: ax + 200 + hh.sx, y: 540 + hh.sy, z: 0.92 }, -1e5, -1e5, 1e5, 1320);
    const VX = adeleX(B(13)) + 1100;
    sky(g, s, 'morning');
    glow(g, 200, 100, 520, '255,240,200', 0.55, 'lighter', false);
    streetScene(g, s, cam, 'morning', { mid: (q) => {
      // 架空线（接触线 + 承力索 + 吊弦），在所有人的头顶上方
      line(q, cam.x - 1400, WIRE_M, cam.x + 1400, WIRE_M, 2, 'rgba(40,40,50,.6)');
      line(q, cam.x - 1400, WIRE_Y, cam.x + 1400, WIRE_Y, 3, 'rgba(40,40,50,.85)');
      for (let x = floor((cam.x - 1400) / 180) * 180; x < cam.x + 1400; x += 180) line(q, x, WIRE_M, x, WIRE_Y, 1.4, 'rgba(40,40,50,.5)');
      walkersOn(q, t, s.shot.t0, [[2500, 1, 838, 91, '#6a5a8a', 395], [3380, 0, 836, 93, '#4a6a7a', 380], [4300, 1, 842, 94, '#7a7a5a', 370], [5200, -1, 848, 92, '#8a5a4a', 410]]);
      violinist(q, VX, SY - 4, HT('crowd', US) * 0.96, t);
      notesFrom(q, t, VX - 0.3 * 456, SY - 0.62 * 456, 10, 7, 'rgba(58,38,32,.8)');
      q.beginPath(); rrect(q, VX + 60, SY - 24, 130, 34, 8); fs(q, '#6a3a2a', 3);
      // 蹦蹦跳跳：每拍一小跳（跳起来时腿收起、落地只一瞬，不会滑步）
      const hop = abs(sin(PI * (t - 0.26) / 0.5));
      who(q, 'sheep-black', Object.assign({ x: ax - 190, y: SY, h: HT('sheep-black', US), t, phase: -0.44, shadow: false }, bound(0.5)));
      shadow(q, ax - 190, SY, 60, 0.36);
      who(q, 'adele-child', { x: ax, y: SY, h: HT('adele-child', US), pose: 'jump', air: 0.85 * hop, t, expr: 'laugh', outfit: 'school', prop: 'satchel', wind: 0.4, look: [1, -0.2], shadow: false });
      shadow(q, ax, SY, 70, 0.4 * (1 - hop * 0.5));
      const tx = cam.x + 1500 - lt * 2700;
      if (tx > cam.x - 2800) { q.drawImage(lay(s, 'tram'), tx - 550, 1030 - 396, 1100, 430); tramPanto(q, tx - 20, 1030 - 396 + 94, WIRE_Y); }
    } });
    // 前景：路灯只放在不会从阿黛尔、小羊、小提琴手前面扫过的位置；中间是矮的铁桩 / 花箱
    s.layer(g, cam, 1.3, (q) => { kerbProps(q, [1900, 2250, 3050, 3520, 3990, 4460, 4930, 5400, 5870, 6750, 7220], 1110, 1.3); lampPost(q, 2600, 1110, 1.3); lampPost(q, 6300, 1110, 1.3); });
    s.kit.rays(g, t, { x: 180, y: -80, n: 8, len: 1500, spread: 0.7, angle: PI / 2 - 0.55, alpha: 0.12, seed: 31 });
  }
  function shotClock(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 21, 3);
    const cam = fit({ x: 980 + hh.sx, y: 540 + hh.sy, z: 1.02 + 0.05 * s.p }, 0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'clockface');
      const mm = 57 + ease.back(clamp((t - 32.26) / 0.25));
      clockHands(q, 980, 500, 400, 7, mm);
      for (let i = 0; i < 3; i++) pigeon(q, 700 + i * 260, 990, 2.4, i === 1, 0, 0);
      glow(q, 700, 250, 380, '255,240,210', 0.35, 'lighter', false);
    });
    if (t > 32.26 && t < 32.7) s.post.fill(g, '#fff', (1 - (t - 32.26) / 0.44) * 0.12, 'lighter');
  }
  function shotLookUp(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 23, 4);
    // 背景：街（景深外，预先模糊一次、缓存）。街景瓦片的上沿在世界 y = -220：镜头压低到 y 390，画面上沿正好在瓦片里面
    const bg = (q) => { sky(q, s, 'morning'); streetScene(q, s, { x: 3900, y: 390, z: 0.9 }, 'morning'); };
    const F = E.finish;
    if (F && F.enabled) F.dof(g, s, 'bs-lookup-bg', bg, { radius: 9, opaque: true, x: -hh.sx * 0.45 }); else { sky(g, s, 'morning'); streetScene(g, s, { x: 3900 + hh.sx * 0.5, y: 390, z: 0.9 }, 'morning'); }
    s.post.fill(g, '#fff3e0', 0.3);
    // 中近景（官方小人画得很大、画框在膝盖处切掉）：抬头看见钟——吓了一跳（她的基建 Interact），头上蹦出一个“！”
    s.layer(g, { x: 960, y: 540, z: 1 + 0.06 * s.p, sx: hh.sx, sy: hh.sy }, 1, (q) => {
      who(q, 'sheep-black', { x: 1440, y: 1130, h: 400, pose: 'look-up', t, flip: true, expr: 'surprise', shadow: false });
      const A = Object.assign({ x: 820, y: 1250, h: 980, t, outfit: 'school', prop: 'satchel', shadow: false, rim: '255,244,214', rimDir: -2.2, rimW: 0.7, rimGlow: 0 }, startle(32.8));
      who(q, 'adele-child', A);
      const [bx, by] = at(A, 'adele-child', 'top');
      bang(q, bx + 250, max(160, by + 40), clamp((t - 32.9) / 0.35), 1.8);
    });
  }
  function shotRun(g, s) {
    const t = s.t, lt = s.lt;
    const X = 5200 + lt * 900;
    const hh = hand0(s, 25, 6);
    const cam = fit({ x: X + 160 + hh.sx, y: 560 + hh.sy, z: 1.0 }, -1e5, -1e5, 1e5, 1320);
    sky(g, s, 'morning');
    streetScene(g, s, cam, 'morning', { mid: (q) => {
      // 远处的行人（在她们身后，先画）→ 鸽子 → 小羊 → 阿黛尔
      walkersOn(q, t, s.shot.t0, [[6000, -1, 846, 101, '#6a5a8a', 400], [6500, 1, 836, 102, '#8a5a4a', 385], [7450, 0, 840, 103, '#4a6a7a', 410, -1], [8400, -1, 850, 104, '#7a7a5a', 370]]);
      pigeonsOnWalk(q, t, [5800, 5860, 5920], (px) => 33.76 + (px - 150 - 5200) / 900, SY);
      const sx = X - 300 - sin(t * 3) * 20, h = HT('adele-child', US);
      who(q, 'sheep-black', Object.assign({ x: sx, y: SY, h: HT('sheep-black', US), t, heat: 0.7 }, bound(0.28)));
      who(q, 'adele-child', Object.assign({ x: X, y: SY, h, pose: 'run', t, expr: 'determined', outfit: 'school', prop: 'satchel', wind: 1 }, stride('adele-child', { h, pose: 'run', t }, X - 5200)));
    } });
    // 前景：路灯只放在不会从人物前面扫过的位置；中间是矮的铁桩 / 花箱（速度感）
    s.layer(g, cam, 1.35, (q) => { kerbProps(q, [4700, 5170, 5640, 6580, 7050, 7520, 7990, 8460, 8930, 9400, 10340], 1110, 1.35); lampPost(q, 6100, 1110, 1.35); lampPost(q, 9800, 1110, 1.35); });
    speedLines(g, t, 0.5, 'rgba(255,255,255,.7)', PI);
  }
  /** 跑动的腿（近景插入）：鞋 + 白袜 + 藏青裙摆（和角色的校服一致） */
  function runningLegs(g, t, cx, base, s) {
    const ph = t * 12.5;
    for (let leg = 0; leg < 2; leg++) {
      const p = ph + leg * PI, sw = sin(p), lift = max(0, cos(p));
      const hipX = cx + (leg ? 40 : -40) * s, hipY = base - 700 * s;
      const kneeX = hipX + sw * 150 * s, kneeY = hipY + 330 * s - lift * 80 * s;
      const footX = kneeX + sw * 120 * s - lift * 60 * s, footY = base - lift * 160 * s;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(hipX, hipY); g.lineTo(kneeX, kneeY); g.lineTo(footX, footY - 60 * s); g.lineWidth = 92 * s; g.strokeStyle = INK; g.stroke(); g.lineWidth = 80 * s; g.strokeStyle = SKIN; g.stroke();
      g.beginPath(); g.moveTo(kneeX + (footX - kneeX) * 0.35, kneeY + (footY - 60 * s - kneeY) * 0.35); g.lineTo(footX, footY - 60 * s); g.lineWidth = 92 * s; g.strokeStyle = INK; g.stroke(); g.lineWidth = 80 * s; g.strokeStyle = '#fbfaf6'; g.stroke();
      g.save(); g.translate(footX, footY - 30 * s); g.rotate(-sw * 0.3 - lift * 0.4);
      g.beginPath(); rrect(g, -60 * s, -46 * s, 190 * s, 84 * s, 38 * s); fs(g, '#5a2e22', 6 * s); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(-20 * s, -38 * s, 80 * s, 10 * s);
      g.beginPath(); rrect(g, -10 * s, -52 * s, 18 * s, 30 * s, 6 * s); fs(g, '#5a2e22', 4 * s);
      g.restore();
    }
    g.beginPath(); g.moveTo(cx - 280 * s, base - 1100 * s); g.lineTo(cx + 280 * s, base - 1100 * s); g.lineTo(cx + 320 * s + sin(t * 12.5) * 20 * s, base - 640 * s); g.lineTo(cx - 320 * s, base - 640 * s); g.closePath(); fs(g, '#2e3a5a', 6 * s);
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 6 * s; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(cx + i * 100 * s, base - 1080 * s); g.lineTo(cx + i * 120 * s, base - 650 * s); g.stroke(); }
  }
  /** 贴地镜头的石子路（2400 宽，严格周期：每排石头的宽度凑满 2400，两张首尾相接时看不出接缝） */
  reg('cobbles-close', 2400, 700, (q, w, h) => {
    q.fillStyle = '#7a7068'; q.fillRect(0, 0, w, h);
    const R = rng(55);
    for (let row = 0; row < 7; row++) {
      const y = row * 100 + (row > 3 ? (row - 3) * 20 : 0), hgt = 80 + row * 12;
      const o = -R() * 80, ws = [], cs = [];
      let sum = 0;
      while (sum < w) { const ww = 120 + R() * 70; ws.push(ww); cs.push(140 + R() * 50 | 0); sum += ww; }
      const k = w / sum;
      let x = o;
      for (let j = 0; j < ws.length; j++) {
        const ww = ws[j] * k, c = cs[j];
        for (const ox of [0, w]) { if (x + ox > w) continue; q.beginPath(); rrect(q, x + ox + 6, y + 6, ww - 12, hgt - 12, 26); fs(q, `rgb(${c},${c - 10 | 0},${c - 22 | 0})`, 4, 'rgba(40,30,30,.6)'); q.fillStyle = 'rgba(255,255,255,.18)'; q.fillRect(x + ox + 20, y + 14, ww * 0.4, 8); }
        x += ww;
      }
    }
  });
  function shotFeet(g, s) {
    const t = s.t, lt = s.lt;
    // 贴地的低机位：上面是糊掉的街（亮），下面是飞快往后的石子路
    sky(g, s, 'morning');
    // 背景：放大一倍的街景瓦片连续地往后滚（一张接一张，不会露出天空、也不会跳回去）
    const xw = 3000 + lt * 350;
    g.save(); g.globalAlpha = 0.6;
    for (let i = floor((xw - 100) / 1200); i <= floor((xw + 900) / 1200); i++) g.drawImage(lay(s, `street:morning:${i}`), (i * 1200 - BL - xw) * 2 - 200, -420, (1200 + 2 * BL) * 2, 2600);
    g.restore();
    g.fillStyle = 'rgba(255,240,220,.45)'; g.fillRect(0, 0, VW, 470);
    const off = (t * 2200) % 2400;
    g.drawImage(lay(s, 'cobbles-close'), -off, 440, 2403, 700); g.drawImage(lay(s, 'cobbles-close'), 2400 - off, 440, 2403, 700);
    runningLegs(g, t, 900, 1020, 1.05);
    speedLines(g, t, 0.7, 'rgba(255,255,255,.8)', PI, 30);
  }
  function shotSheepRun(g, s) {
    const t = s.t;
    g.fillStyle = lg(g, 0, 0, VW, VH, [[0, '#ffe3b8'], [1, '#ffc49a']]); g.fillRect(0, 0, VW, VH);
    speedLines(g, t, 0.9, 'rgba(255,255,255,.9)', PI, 36);
    const sh = { x: 1000 + sin(t * 9) * 16, y: 960, h: 700, pose: 'run', t, speed: 1.8, expr: 'determined', heat: 0.8 };
    glow(g, 1000, 700, 520, '255,140,60', 0.25 + 0.15 * sin(t * 20));
    who(g, 'sheep-black', sh);
    const [bx, by] = at(sh, 'sheep', 'top'); steam(g, t, bx - 60, by + 40, 1, 9, 160, 3.4);
  }
  function shotGate(g, s) {
    const t = s.t, lt = s.lt;
    const X = 250 + lt * 1400;
    const cam = fit({ x: 620 + lt * 500, y: 520, z: 0.9 }, 0, -1e5, 3600, 1280);
    sky(g, s, 'noon');
    campusScene(g, s, cam, { mid: (q) => {
      who(q, 'sheep-black', Object.assign({ x: X - 280, y: CAMPUS_G + 14, h: 160, t, heat: 0.8 }, bound(0.2)));
      who(q, 'adele-child', Object.assign({ x: X, y: CAMPUS_G + 14, h: 320, pose: 'run', t, expr: 'determined', outfit: 'school', prop: 'satchel', wind: 1 }, stride('adele-child', { h: 320, pose: 'run', t }, X - 250)));
    } });
    speedLines(g, t, 0.45, 'rgba(255,255,255,.7)', PI);
  }
  function stepY(x) { if (x < STEP0) return CAMPUS_G; if (x > STEP1) return LAND; const n = 8, run = (STEP1 - STEP0) / n; const i = min(n - 1, floor((x - STEP0) / run)); return CAMPUS_G - (i + 1) * (CAMPUS_G - LAND) / n; }
  const STEP_RUN = (STEP1 - STEP0) / 8, STEP_RISE = (CAMPUS_G - LAND) / 8;
  /**
   * 一连串的跳：P = [[x, y], …] 是依次的落点（落点都在台阶面上），每跳 dur 秒、弧高 hgt。
   * 返回 { x, y, u（这一跳的进度 0..1，落地时为 0 / 1）}；在空中时横着走，落地的那一刻正好踩在台阶面上
   */
  function hops(P, lt, dur, hgt) {
    const n = P.length - 1, f = clamp(lt / dur, 0, n), i = min(n - 1, floor(f)), u = f - i, a = P[i], b = P[i + 1];
    return { x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u) - hgt * 4 * u * (1 - u), u: f >= n ? 1 : u };
  }
  /** 第 i 级台阶面的中点；小羊的四只蹄子都踩在同一级上（蹄子的中点在身体原点后面约 0.065h） */
  const tread = (i, dx = 0) => [STEP0 + (i + 0.5) * STEP_RUN + dx, CAMPUS_G - (i + 1) * STEP_RISE];
  const ADELE_STEPS = [[2280, CAMPUS_G], tread(1), tread(3), tread(5), tread(7)];
  const SHEEP_STEPS = [[2020, CAMPUS_G], [2230, CAMPUS_G], tread(0, 10), tread(2, 10), tread(4, 10)];
  function shotSteps(g, s) {
    const t = s.t, lt = s.lt;
    const cam = fit({ x: 2650, y: 520, z: 1.0 }, 0, -1e5, 3600, 1280);
    sky(g, s, 'noon');
    campusScene(g, s, cam, { mid: (q) => {
      const S = hops(SHEEP_STEPS, lt, 0.125, 34), A = hops(ADELE_STEPS, lt, 0.125, 46);
      // 影子落在脚下那一级台阶上（离地越高越淡），不跟着人飞到半空
      const gs = stepY(S.x - 10), ga = stepY(A.x);
      shadow(q, S.x - 10, gs, 62, 0.34 * (1 - clamp((gs - S.y) / 160)));
      shadow(q, A.x, ga, 64, 0.36 * (1 - clamp((ga - A.y) / 200)));
      who(q, 'sheep-black', { x: S.x, y: S.y, h: 160, pose: 'jump', air: 0.8 * sin(PI * S.u), t, heat: 0.8, shadow: false });
      who(q, 'adele-child', { x: A.x, y: A.y, h: 320, pose: 'jump', air: 0.55 * sin(PI * A.u), t, expr: 'determined', outfit: 'school', prop: 'satchel', wind: 1, shadow: false });
    } });
  }
  function shotLeap(g, s) {
    const t = s.t, lt = s.lt;
    const slow = t > 38.76;
    const k = t < 38.76 ? (t - 37.76) * 0.58 : 0.58 + (t - 38.76) * 0.07;
    // 从最上面一级（上一个镜头落脚的地方）起跳，跳向讲堂门口；小羊从它落脚的那一级跟着飞起来（两个都在空中进入慢镜头）
    const A0 = tread(7), S0 = tread(4, 10);
    const [x, y] = arc3(A0[0], A0[1], 3120, LAND, 190, clamp(k));
    const [sx2, sy2] = arc3(S0[0], S0[1], 3010, LAND, 200, clamp(k * 0.97));
    const hh = hand0(s, 27, slow ? 1.5 : 5);
    const z = 1.05 + (slow ? 0.22 * easeIO(clamp((t - 38.76) / 0.96)) : 0);
    const cam = fit({ x: 2990 + hh.sx, y: 150 + hh.sy, z }, 0, -1e5, 3600, 1280);
    const bell = t < 38.76 ? -0.25 * clamp(lt) : -0.25 - 0.3 * easeO(clamp((t - 38.76) / 0.9));
    const ts = slow ? 38.76 + (t - 38.76) * 0.1 : t;
    sky(g, s, 'noon');
    glow(g, 1500, 120, 420, '255,250,230', 0.6, 'lighter', false);
    campusScene(g, s, cam, { bell, mid: (q) => {
      const gS = stepY(sx2 - 10), gA = stepY(x);
      shadow(q, sx2 - 10, gS, 62, 0.34 * (1 - clamp((gS - sy2) / 220)));
      shadow(q, x, gA, 64, 0.36 * (1 - clamp((gA - y) / 260)));
      // 惊起的鸽子在她们身后飞（不从脸前面挡过去）
      for (let i = 0; i < 6; i++) { const f = (slow ? 38.76 + (t - 38.76) * 0.08 : t) - 37.9; pigeon(q, 2700 + i * 90 + f * 200, 520 - f * 300 - i * 30, 1.2, false, 1, ts * 22 + i); }
      who(q, 'sheep-black', { x: sx2, y: sy2, h: 160, pose: 'jump', air: 0.8 * clamp(k * 8), t: ts, expr: 'laugh', heat: 0.6, shadow: false });
      who(q, 'adele-child', { x, y, h: 320, pose: 'jump', air: 0.3 * clamp(k * 8), t: ts, expr: 'determined', outfit: 'school', prop: 'satchel', wind: 1, shadow: false });
    } });
    if (slow) s.kit.particles(g, ts, 'dust', { n: 50, seed: 29, rgb: '255,250,230' });
    s.post.fill(g, '#fffaf0', up(t, 39.25, 39.72, ease.in) * 0.85, 'lighter');
  }
  /* ---------- 13 钟声：仰拍钟楼，钟响 → 鸽群四散 → 庭院全景 ---------- */
  function shotBell(g, s) {
    const t = s.t, lt = s.lt;
    const hit = (tt) => (t >= tt ? Math.exp(-(t - tt) * 5) : 0);
    const H = max(hit(B(19)), hit(B(19) + 1) * 0.6, hit(B(20)) * 0.9);
    const shake = s.reduced ? 0 : H * 16;
    const z = 1.18 - 0.14 * easeO(clamp(lt / 2));
    const cam = fit({ x: 960 + wobble(3, t * 9) * shake, y: 540 + wobble(4, t * 9) * shake, z }, 0, -540, VW, 1460);
    sky(g, s, 'noon');
    s.layer(g, cam, 0.2, (q) => { glow(q, 1560, 150, 420, '255,250,230', 0.8, 'lighter', false); for (let i = 0; i < 3; i++) q.drawImage(s.kit.cloudSprite(40 + i, 620, 220, '#ffffff', '#dfe8f4'), -200 + i * 760 + t * 12, 620 + (i % 2) * 80, 620, 220); });
    s.layer(g, cam, 1, (q) => {
      q.drawImage(lay(s, 'tower-low'), 0, -600 + 60, VW, 2000);
      // 钟（在开拱里摆）
      const sw = sin((t - B(19)) * PI * 2) * 0.35 * clamp(1 - (t - B(19)) * 0.1);
      q.save(); q.translate(960, 240 + 60 - 20); q.rotate(sw);
      q.beginPath(); q.moveTo(-100, 190); q.quadraticCurveTo(-96, 30, 0, 20); q.quadraticCurveTo(96, 30, 100, 190); q.quadraticCurveTo(0, 214, -100, 190); fs(q, lg(q, -100, 0, 100, 0, [[0, '#f0c860'], [0.5, '#c8963a'], [1, '#8a5a1e']]), 6);
      q.beginPath(); circ(q, 0, 200, 22); fs(q, '#6a4a1e', 4);
      q.restore();
      // 钟面指针：八点整（分针刚落到 12，带一点回弹）
      const a0 = t - B(19), mA = -PI / 2 + 0.06 * Math.exp(-a0 * 7) * sin(a0 * 34), hA = -PI / 2 + (8 / 12) * TAU;
      line(q, 960, 780, 960 + cos(hA) * 92, 780 + sin(hA) * 92, 14, INK);
      line(q, 960, 780, 960 + cos(mA) * 138, 780 + sin(mA) * 138, 9, INK);
      q.beginPath(); circ(q, 960, 780, 15); fs(q, '#c8963a', 4);
      // 声波
      q.save(); q.globalCompositeOperation = 'lighter';
      for (const tt of [B(19), B(19) + 1, B(20), B(20) + 1]) { const a = t - tt; if (a < 0 || a > 1.6) continue; for (let j = 0; j < 3; j++) { const r = 160 + (a - j * 0.12) * 900; if (r < 160) continue; q.globalAlpha = (1 - a / 1.6) * 0.5; q.strokeStyle = '#fff6dc'; q.lineWidth = 14 - j * 4; q.beginPath(); q.arc(960, 400, r, 0, TAU); q.stroke(); } }
      q.restore();
    });
    // 鸽群四散
    E.field(g, t, { n: 40, every: 0.02, life: 3.5, seed: 41, loop: false, t0: B(19),
      make: (r) => ({ a: -PI / 2 + (r(1) - 0.5) * 2.6, v: 300 + r(2) * 500, s: 1.4 + r(3) * 1.6, ph: r(4) * 6 }),
      draw: (q, p, age) => { const x = 960 + cos(p.a) * p.v * age, y = 420 + sin(p.a) * p.v * age + age * age * 20; bird(q, x, y, p.s, age * 18 + p.ph, 'rgba(60,50,70,.85)'); } });
    s.kit.particles(g, t, 'petals', { n: 40, seed: 14, rgb: '255,235,240' });
    flare(g, 1560, 150, 0.6 + 0.3 * H);
    s.post.fill(g, '#fff', H * 0.25, 'lighter');
  }
  /* 远景路人的走路循环：每人预先画 CW_N 帧小图（按步态相位取帧）。
   * 全景里一下子十几个人时，不必每帧把每个人从头画一遍（GPU 光栅化是大头） */
  const CW_N = 10, CW_Z = 0.66;
  const cwPer = (h, sp) => (E.cast && E.cast.gait ? E.cast.gait('crowd', { h, pose: 'walk', speed: sp }).period : 1);
  const cwKey = (seed, h, sp) => 'cw:' + seed + ':' + (h | 0) + ':' + sp.toFixed(2);
  /** 一个人一张横条图：CW_N 个相位并排（站着的只有一格） */
  function cwReg(seed, h, sp, stand) {
    const key = cwKey(seed, h, sp), W = h * 0.8, H = h * 1.25, n = stand ? 1 : CW_N;
    if (!PAINT[key]) reg(key, W * CW_Z * n, H * CW_Z, (q) => {
      q.scale(CW_Z, CW_Z);
      for (let j = 0; j < n; j++) who(q, 'crowd', { x: W / 2 + j * W, y: h * 1.1, h, pose: stand ? 'stand' : 'walk', t: stand ? 0.4 : (j / CW_N) * cwPer(h, sp), speed: sp || 1, seed });
    });
    return key;
  }
  function cwDraw(q, s, o) {
    const n = o.stand ? 1 : CW_N, j = o.stand ? 0 : floor(((((o.t / cwPer(o.h, o.sp)) % 1) + 1) % 1) * CW_N) % CW_N;
    const c = lay(s, cwReg(o.seed, o.h, o.sp, o.stand)), cw = c.width / n;
    const W = o.h * 0.8, H = o.h * 1.25;
    q.save(); q.translate(o.x, o.y); if (o.flip) q.scale(-1, 1);
    q.drawImage(c, j * cw, 0, cw, c.height, -W / 2, -o.h * 1.1, W, H);
    q.restore();
  }
  /** 庭院里的学生：[x, 离地前移, 方向(0=站着), 长相种子]，按远近排好 */
  const COURT = [[1610, 2, 0, 361], [540, 4, 1, 300], [1700, 6, 0, 377], [1180, 10, 1, 307], [2060, 14, -1, 314], [760, 24, 1, 321], [1420, 30, 1, 328], [980, 44, -1, 335], [1900, 50, 1, 342], [620, 60, 1, 349], [2240, 64, 1, 356]];
  const courtH = (i) => Math.round(290 * (0.94 + COURT[i][1] / 300) * (0.94 + hash(77, i) * 0.12));
  const courtSp = (i) => (COURT[i][2] ? Math.round((0.9 + hash(79, i) * 0.35) * 100) / 100 : 0);
  const COURT_KEYS = [];
  for (let i = 0; i < COURT.length; i++) COURT_KEYS.push(cwReg(COURT[i][3], courtH(i), courtSp(i), !COURT[i][2]));
  function shotCourtyard(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 29, 4);
    const cam = fit({ x: 1900 + lt * 60 + hh.sx, y: 380 + hh.sy, z: 0.62 + 0.03 * s.p }, 0, -1e5, 3600, 1280);
    sky(g, s, 'noon');
    glow(g, 1600, 100, 460, '255,250,230', 0.6, 'lighter', false);
    campusScene(g, s, cam, { bell: sin(t * 3) * 0.2, mid: (q) => {
      // 讲堂大门：阿黛尔和小黑羊刚好挤进去，门在身后合上
      const op = up(lt, 0, 0.15) * (1 - up(lt, 1.0, 1.35, easeIO));
      if (op > 0) {
        q.save(); q.beginPath(); q.moveTo(HALL_DOOR - 95, LAND); q.lineTo(HALL_DOOR - 95, 340); q.quadraticCurveTo(HALL_DOOR - 95, 262, HALL_DOOR, 246); q.quadraticCurveTo(HALL_DOOR + 95, 262, HALL_DOOR + 95, 340); q.lineTo(HALL_DOOR + 95, LAND); q.closePath(); q.clip();
        q.fillStyle = '#3a2824'; q.fillRect(HALL_DOOR - 95 * op, 240, 190 * op, 380);
        glow(q, HALL_DOOR - 20, 420, 160, '255,200,130', 0.5 * op);
        q.restore();
      }
      for (const [dx, sp, who2, hh2] of [[0, 0, 'adele-child', 320], [-120, 0.22, 'sheep-black', 160]]) {
        const k = clamp((lt - sp) / 0.7), x0 = 2990 + dx, x = lerp(x0, HALL_DOOR - 10, easeO(k)), a = 1 - up(lt, sp + 0.5, sp + 0.8);
        if (a <= 0) continue;
        const o = { x, y: LAND, h: hh2, t, alpha: a, expr: 'determined', outfit: 'school', prop: 'satchel', heat: 0.6, shadow: false };
        // 冲进门：腿的相位跟着冲过的路程；小羊蹦进去
        who(q, who2, Object.assign(o, who2 === 'sheep-black' ? bound(0.16) : Object.assign({ pose: 'run' }, stride(who2, { h: hh2, pose: 'run', t }, x - x0))));
      }
      // 上课铃响过：学生们三三两两往讲堂走；公告栏前两个人还在看通知
      for (let i = 0; i < COURT.length; i++) {
        const [x0, dy, dir, seed] = COURT[i], h = courtH(i), sp = courtSp(i);
        const v = !dir ? 0 : E.cast && E.cast.gait ? E.cast.gait('crowd', { h, pose: 'walk', speed: sp }).speed : 90 * sp;
        cwDraw(q, s, { x: x0 + dir * v * (t - B(20)), y: CAMPUS_G + dy, h, sp, stand: !dir, t: t + i * 0.41, seed, flip: dir < 0 || seed === 377 });
      }
    } });
    E.field(g, t, { n: 16, every: 0.1, life: 6, seed: 43, prewarm: true, make: (r) => ({ cx: 700 + r(1) * 900, cy: 180 + r(2) * 200, R: 120 + r(3) * 200, w: 0.5 + r(4) * 0.5, ph: r(5) * 6 }), draw: (q, p, age) => { const a = p.ph + age * p.w; bird(q, p.cx + cos(a) * p.R, p.cy + sin(a) * p.R * 0.35, 1.2, age * 16, 'rgba(60,50,70,.8)'); } });
    s.kit.particles(g, t, 'petals', { n: 30, seed: 44, rgb: '255,240,245' });
  }

  /* ---------- 14–18 爸爸的课 ---------- */
  function shotHallWide(g, s) {
    const t = s.t;
    const hh = hand0(s, 31, 3);
    const z = 1.05 + 0.1 * easeS(s.p) + 0.006 * s.barPulse(5);
    const cam = fit({ x: 960 + hh.sx, y: 470 + hh.sy, z }, 0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => { img(q, s, 'hall-wide'); hallWideDyn(q, s, t); });
    s.kit.particles(g, t, 'dust', { n: 50, seed: 33, rgb: '255,236,200' });
    s.post.leak(g, t, { x: 0, y: 200, r: 800, rgb: '255,200,130', a: 0.25 });
  }
  function shotChalk(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 35, 3);
    const cam = fit({ x: 960 + hh.sx, y: 560 + hh.sy, z: 1.06 + 0.04 * s.p }, 0, 0, VW, VH);
    // 进度：每拍画一段，拍内先快后慢
    const bi = s.beat - s.T.beatAt(s.shot.t0), p = clamp((floor(bi) + easeO(bi - floor(bi))) / 4 * 0.98);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'chalkboard');
      const tip = chalkVolcano(q, 1010, 760, 1.3, p, t, 9);
      // 喷发：粉笔灰
      if (t > 49.26) E.field(q, t, { n: 40, every: 0.01, life: 1.2, seed: 61, loop: false, t0: 49.26, make: (r) => ({ a: -PI / 2 + (r(1) - 0.5) * 1.4, v: 200 + r(2) * 420, s: 4 + r(3) * 10 }), draw: (qq, pp, age, k) => { qq.globalAlpha = (1 - k) * 0.8; qq.fillStyle = '#f4f4ea'; qq.beginPath(); circ(qq, 1010 + cos(pp.a) * pp.v * age, 760 - 340 + sin(pp.a) * pp.v * age + age * age * 160, pp.s * (1 + k)); qq.fill(); qq.globalAlpha = 1; } });
      if (tip && p < 0.97) {
        glow(q, tip[0], tip[1], 30, '255,255,240', 0.6);
        q.save(); q.translate(tip[0], tip[1]);
        q.beginPath(); rrect(q, -8, -8, 60, 16, 7); fs(q, '#fffaf0', 3);
        hand(q, 60, 40, 1.25, -2.45 + sin(t * 9) * 0.05, 'hold', { sleeve: '#f4f1ea', cuff: '#e8e2d6', sleeveLen: 900 });
        q.restore();
      }
    });
  }
  function shotNotebook(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 37, 2);
    const cam = fit({ x: 960 + hh.sx, y: 540 + hh.sy, z: 1.05 + 0.05 * s.p }, 0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'notebook');
      const tip = doodle(q, 700, 640, 0.95, clamp(lt / 1.85), 'rgba(58,58,70,.9)');
      glow(q, 1320 + sin(t * 0.8) * 30, 380, 180, '255,236,160', 0.35 + 0.1 * sin(t * 2));
      if (tip) { q.save(); q.translate(tip[0], tip[1]); hand(q, 0, 0, 1.1, 2.3, 'pen', { sleeve: '#fbfaf6', cuff: '#fbfaf6', pen: '#f2c46a', sleeveLen: 900 }); q.restore(); }
    });
  }
  function shotRaise(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 39, 4);
    const cam = fit({ x: 1420 + hh.sx + 30 * s.p, y: 560 + hh.sy, z: 1.14 }, -240, 0, 2160, VH);
    const upT = 52.26, raised = t > upT;
    const U = 640;
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'hall-side', -240, 0);
      shaft(q, 600, 0, -0.5, 400, 1300, 0.3); shaft(q, 1100, 0, -0.5, 400, 1300, 0.25);
      who(q, 'liese', { x: 740, y: 900, h: HT('liese', U), pose: 'sit', arms: raised ? 'cover' : 'write', t, expr: raised ? 'laugh' : 'smile', look: [1, 0], shadow: false });
      // 芳汀、阿黛尔：官方小人坐着（腿在长桌后面）；答题时她一下子站了起来（蹦一下）
      const F = { x: 1000, y: 900, h: HT('fontaine', U), pose: 'sit', t, shadow: false };
      who(q, 'fontaine', F);
      const A = raised ? { x: 1270, y: 900, h: HT('adele-child', U), pose: 'jump', air: 0.7 * sin(PI * clamp((t - upT) / 0.4)), t, outfit: 'school', shadow: false } : { x: 1270, y: 900, h: HT('adele-child', U), pose: 'sit', t, outfit: 'school', shadow: false };
      who(q, 'adele-child', A);
      // 前排长桌 + 桌上的笔记本 / 录音机
      q.beginPath(); q.rect(560, 764, 920, 34); fs(q, '#c8925a', 4); q.beginPath(); q.rect(560, 798, 920, 110); fs(q, '#8a5a36', 4);
      for (const [nx, rot] of [[1040, -0.06], [1230, 0.05]]) { q.save(); q.translate(nx, 762); q.scale(1, 0.35); q.rotate(rot); q.beginPath(); q.rect(-60, -46, 120, 92); fs(q, '#fbf6e8', 3); line(q, 0, -46, 0, 46, 2, 'rgba(58,38,32,.4)'); q.restore(); }
      recorder(q, 1350, 766, 0.32, { t, rec: 1, spin: 0.6 });
      const ha = at(A, 'adele-child', 'top');
      if (raised) sparkle(q, ha[0] + 60, ha[1] - 40, 40, clamp(1 - (t - upT) / 0.5), t * 3);
      // 爸爸在黑板前点她回答：只看见他伸进画面的手（拿着粉笔），不露脸
      const hk = up(t, 52.45, 52.8, easeO);
      if (hk > 0) {
        const bob = sin(t * 7) * 6 * (t > 52.8 ? 1 : 0);
        hand(q, 2240 - 300 * hk, 610 + bob, 1.05, PI + 0.08, 'point', { sleeve: '#f4f1ea', cuff: '#e8e2d6', sleeveLen: 900 });
        q.save(); q.translate(2240 - 300 * hk + 70, 600 + bob); q.rotate(0.3); q.beginPath(); rrect(q, -6, -30, 12, 34, 4); fs(q, '#fffaf0', 2.5); q.restore();
      }
      // 芳汀的光环亮一下
      const [fx, fy] = at(F, 'fontaine', 'top');
      glow(q, fx, fy - 20, 70, '255,240,170', 0.3 + 0.5 * s.pulse(5));
    });
  }
  function bokeh(g, t, cols, n = 16, seed = 5) {
    for (let i = 0; i < n; i++) { const x = hash(seed, i) * VW, y = hash(seed, i, 1) * VH * 0.8, r = 40 + hash(seed, i, 2) * 90; glow(g, x + sin(t * 0.3 + i) * 20, y + cos(t * 0.25 + i) * 14, r, cols[i % cols.length], 0.35 + 0.2 * sin(t + i), 'lighter', false); }
  }
  function shotRec(g, s) {
    const t = s.t, lt = s.lt;
    g.fillStyle = lg(g, 0, 0, 0, VH, [[0, '#d8b890'], [0.6, '#b88a5a'], [1, '#6a4228']]); g.fillRect(0, 0, VW, VH);
    bokeh(g, t, ['255,226,170', '255,200,140', '220,236,255'], 14, 9);
    const hh = hand0(s, 41, 2);
    const cam = { x: 960 + hh.sx, y: 560 + hh.sy, z: 1.0 + 0.05 * easeS(s.p) };
    const press = up(t, 53.9, 54.02, easeO) * (1 - up(t, 54.3, 54.4)), on = t > 54.0 ? 1 : 0;
    s.layer(g, cam, 1, (q) => {
      q.fillStyle = '#b07a4a'; q.fillRect(-200, 820, 2400, 400); line(q, -200, 820, 2200, 820, 5, INK);
      q.fillStyle = 'rgba(255,230,190,.3)'; q.fillRect(-200, 826, 2400, 10);
      // 录音机转起来：转过的圈数是转速的积分（纯函数）
      const a = max(0, t - 54.0), rev = a < 0.83 ? 0.7 * a * a / (2 * 0.83) : 0.7 * (a - 0.415);
      recorder(q, 980, 830, 2.3, { t: rev, spin: 1, rec: on * (0.75 + 0.25 * sin(t * 6)), left: 0.7 - a * 0.01, key: t > 53.95 ? 'rec' : null });
      const fy = 830 - 184 * 2.3 - 40 + press * 26 - (1 - up(t, 53.6, 53.9, easeO)) * 200 + up(t, 54.3, 54.9) * 240;
      hand(q, 980 - 150 * 2.3 + 20 * 2.3, fy, 1.4, PI / 2 + 0.25, 'point', { sleeve: '#fbfaf6', cuff: '#fbfaf6', sleeveLen: 900 });
      if (on) { const k = clamp(a / 1.2); q.save(); q.globalCompositeOperation = 'lighter'; for (let j = 0; j < 3; j++) { const ph = (a * 0.8 + j / 3) % 1; q.globalAlpha = 0.4 * (1 - ph) * k; q.strokeStyle = '#ffd8b0'; q.lineWidth = 6; q.beginPath(); q.arc(980 - 136 * 2.3, 830 - 128 * 2.3, 40 + ph * 260, -PI * 0.9, -PI * 0.1); q.stroke(); } q.restore(); }
    });
  }
  /* ---------- 19–22 图书馆 ---------- */
  /** 小黑羊背着一摞书（书按拍子弹、有惯性地晃）；返回书堆顶 */
  /**
   * topple 0..1：书堆倒了——最下面两本留在背上，上面的从上往下依次翻着跟头掉到地上（落在羊身体两边的地板上，
   * 在羊脚的前面一点，不会盖到羊脸上）。o.ground：地面的 y（羊蹦起来时 o.y 仍是地面）
   */
  function sheepWithBooks(q, t, o, nBooks, hop, topple = 0) {
    who(q, 'sheep-black', o);
    const [bx, by] = at(o, 'sheep', 'back');
    const k = o.h / 150, ground = o.ground ?? o.y, f0 = o.flip ? -1 : 1;
    let y = by + 6 * k;
    const fallen = [];
    for (let i = 0; i < nBooks; i++) {
      const lag = sin(t * 9 - i * 0.5) * (0.02 + hop * 0.05) * (i + 1);
      const w = (120 - (i % 3) * 14) * k, hh2 = 22 * k, col = BOOKC[(i * 3 + 1) % BOOKC.length];
      const sx = bx + (sin(i * 2.1) * 8 + lag * 60) * k, sy = y - hh2 / 2;
      const f = i >= 2 && topple > 0 ? clamp((topple - (nBooks - 1 - i) * 0.07) / 0.6) : 0;
      if (f <= 0) { q.save(); q.translate(sx, sy); q.rotate(lag); book(q, 0, 0, w, hh2, col, 0, 2.5 * k); q.restore(); }
      else {
        // 落点：左右交替散开；身体朝向的那一侧（脸在那边）再往外让一让
        const side = i % 2 ? 1 : -1, out = (70 + (i - 2) * 30) * k + (side === f0 ? 70 * k : 0);
        const lx = bx + side * out, ly = ground + (4 + ((i * 7) % 3) * 4) * k - hh2 / 2;
        const px = lerp(sx, lx, f), py = lerp(sy, ly, f * f) - sin(PI * f) * 70 * k;
        const r = lerp(lag, side * 0.06 * (i % 3), f) + side * sin(PI * f) * 2.4;
        fallen.push([px, py, r, w, hh2, col]);
      }
      y -= hh2 - 1;
    }
    // 掉下来的书在羊的前面（离镜头近一点），最后画
    for (const [px, py, r, w, hh2, col] of fallen) { q.save(); q.translate(px, py); q.rotate(r); book(q, 0, 0, w, hh2, col, 0, 2.5 * k); q.restore(); }
    return [bx, y];
  }
  function shotLibrary(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 43, 3);
    const cam = fit({ x: 960 + hh.sx, y: 520 + hh.sy, z: 1.03 + 0.1 * easeS(s.p) }, 0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'library');
      libraryDyn(q, s, t);
      // 远处的芳汀和莉瑟：坐在长桌两边的小凳上看书（面朝桌子，在桌子旁边，不是坐在桌面上）
      for (const [X, Z, name, H0, fl] of [[-1.42, 8.2, 'fontaine', 118, false], [1.42, 9.6, 'liese', 104, true]]) {
        const [px, py] = lp(X, -3, Z), k = 9.2 / Z, hh = H0 * k, seat = hh * 0.24;
        q.beginPath(); q.rect(px - hh * 0.2, py - seat, hh * 0.4, hh * 0.05); q.rect(px - hh * 0.17, py - seat, hh * 0.05, seat); q.rect(px + hh * 0.12, py - seat, hh * 0.05, seat); fs(q, '#6a4228', 1.5);
        // 芳汀是官方小人（坐着；书摊在他面前的长桌上），莉瑟手绘（捧着书）
        if (name === 'fontaine') { who(q, name, { x: px, y: py, h: hh, pose: 'sit', seat, t, flip: fl, shadow: false }); const [bx, by] = lp(-0.7, -2, 8.2); q.save(); q.translate(bx, by); q.beginPath(); q.moveTo(-16, 0); q.lineTo(0, -3); q.lineTo(16, 0); q.lineTo(16, 5); q.lineTo(0, 3); q.lineTo(-16, 5); q.closePath(); fs(q, '#fbf4e2', 1.2); q.restore(); }
        else who(q, name, { x: px, y: py, h: hh, pose: 'sit', seat, arms: 'read', prop: 'book', t, flip: fl, shadow: false });
      }
      // 背着书的小黑羊：从左边书架底下蹦到右边（每拍一跳，落地时才着地）。走在字幕带的上面、梯子的后面
      const hop = abs(sin(PI * s.bp)), x = 420 + lt * 270;
      sheepWithBooks(q, t, { x, y: 905, h: 132, pose: 'jump', air: 0.75 * hop, t, expr: 'content' }, 7, hop);
      // 梯子上的阿黛尔（右侧书架）：脚踩在第 4 根横档上
      const [rx, ry] = lp(3.3, -3, 3.2), [rx2, ry2] = lp(3.3, 4.2, 3.2);
      line(q, rx - 30, ry, rx2 - 20, ry2, 10, '#8a5a3a'); line(q, rx + 40, ry, rx2 + 50, ry2, 10, '#8a5a3a');
      for (let i = 1; i < 8; i++) { const k = i / 8; line(q, lerp(rx - 30, rx2 - 20, k), lerp(ry, ry2, k), lerp(rx + 40, rx2 + 50, k), lerp(ry, ry2, k), 7, '#a8784e'); }
      // 她站在梯子的横档上（官方小人），面朝书架；头顶上方有一本书被她抽出来一半
      const AX = lerp(rx, rx2, 0.5) + 10, AY = lerp(ry, ry2, 0.5);
      who(q, 'adele-child', { x: AX, y: AY, h: 300, pose: 'stand', t, flip: false, outfit: 'school', shadow: false });
      const pull = 0.5 + 0.5 * sin(t * 1.6);
      q.save(); q.translate(AX + 70 + pull * 18, AY - 330); q.rotate(-0.25 - pull * 0.15); q.beginPath(); rrect(q, -14, -48, 28, 96, 4); fs(q, '#8a3a3a', 3); q.fillStyle = 'rgba(255,230,160,.6)'; q.fillRect(-10, -36, 20, 4); q.restore();
    });
    s.kit.particles(g, t, 'dust', { n: 60, seed: 45, rgb: '255,240,210' });
  }
  function shotPages(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 47, 4);
    const cam = fit({ x: 960 + hh.sx, y: 500 + hh.sy - 40 * s.p, z: 1.08 }, 0, 0, VW, VH);
    const U = 660;
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'library');
      libraryDyn(q, s, t);
      const top = clamp(lt / 0.9);
      const sx = 1580 + min(lt, 0.4) * 120;
      // 一蹦（书堆晃倒）→ 落地坐下
      const sh = { x: sx, y: 1010, h: HT('sheep-black', U), pose: lt < 0.5 ? 'jump' : 'sit', air: lt < 0.5 ? sin(PI * lt / 0.5) * 0.6 : 0, t, expr: 'laugh', heat: 0.9 };
      sheepWithBooks(q, t, sh, 7, 1, top);
      who(q, 'adele-child', { x: 1180, y: 1030, h: HT('adele-child', U), pose: lt > 1.5 ? 'cheer' : 'look-up', t, expr: 'laugh', outfit: 'school', look: [0.3, -1] });
      who(q, 'liese', { x: 620, y: 1040, h: HT('liese', U), pose: 'look-up', t, expr: 'surprise', look: [0.4, -1] });
      who(q, 'fontaine', { x: 860, y: 1050, h: HT('fontaine', U), pose: 'look-up', t, expr: 'smile', look: [0.3, -1] });
      // 书页像鸟一样从倒下的书里飞起来，绕着光柱往上（和场景在同一层：跟着镜头走，起点一直在书那里）
      const t0 = B(29) + 0.1;
      E.field(q, t, { n: 46, every: 0.035, life: 5.5, seed: 49, loop: false, t0,
        make: (r) => ({ R: 120 + r(1) * 520, a0: r(2) * TAU, w: (0.6 + r(3) * 0.8) * (r(4) < 0.5 ? 1 : -1), up: 110 + r(5) * 120, s: 0.8 + r(6) * 0.9, ph: r(7) * 6 }),
        draw: (qq, p, age, k) => { const a = p.a0 + age * p.w; const x = 1560 - age * 90 + cos(a) * p.R * min(1, age * 1.5), y = 930 - age * p.up + sin(a) * p.R * 0.3; pageBird(qq, x, y, p.s * (0.6 + min(1, age * 2) * 0.6), age * 13 + p.ph, sin(a) * 0.4, min(1, age * 4) * (1 - k * k)); } });
    });
    s.kit.particles(g, t, 'sparkle', { n: 20, seed: 50 });
  }
  function shotReading(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 51, 3);
    const cam = fit({ x: 960 + hh.sx, y: 540 + hh.sy, z: 1.03 + 0.04 * easeS(s.p) }, 0, 0, VW, VH);
    const shh = s.shot.id === 'shh';
    const frozen = shh && t > 68.77 && t < 70.26;
    const tf = frozen ? 68.77 : t;
    const U = 680;
    // 70.26 之后：踮着脚往右溜，70.75 憋不住笑着跑起来
    const sneak = shh ? clamp((t - 70.26) / 1.5) : 0, run = shh && t > 70.75;
    const dx = sneak > 0 ? (run ? 180 + (t - 70.75) * 900 : (t - 70.26) * 360) : 0;
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'reading');
      // 溜走：踮着脚、捂着嘴走（步子跟着走过的路程，不滑）→ 憋不住了，笑着跑起来
      const pose = (base) => (sneak > 0 ? (run ? 'run' : 'walk') : base);
      const arms = frozen ? 'cover' : sneak > 0 ? (run ? undefined : 'cover') : 'read';
      const prop = frozen || sneak > 0 ? null : 'book';
      const gaitOf = (name, h) => (sneak > 0 ? stride(name, { h, pose: run ? 'run' : 'walk', t: tf }, dx) : {});
      const hl = HT('liese', U), hf = HT('fontaine', U), ha = HT('adele-child', U);
      who(q, 'liese', Object.assign({ x: 420 + dx, y: 900, h: hl, pose: pose('sit'), arms, prop, t: tf, expr: frozen ? 'surprise' : run ? 'laugh' : shh ? 'surprise' : 'laugh', shadow: false }, gaitOf('liese', hl)));
      // 芳汀、阿黛尔：官方小人（坐着看书 → 被“嘘”得定住（动画停在那一帧）→ 起身溜走 → 跑）；书摊在他们面前的桌上
      const F = Object.assign({ x: 900 + dx, y: 900, h: hf, pose: pose('sit'), t: tf, shadow: false }, gaitOf('fontaine', hf));
      who(q, 'fontaine', F);
      const [fx, fy] = at(F, 'fontaine', 'top'); glow(q, fx, fy - 20, 110, '255,240,170', 0.45 + 0.2 * sin(t * 2));
      who(q, 'adele-child', Object.assign({ x: 1380 + dx, y: 900, h: ha, pose: pose('sit'), t: tf, outfit: 'school', flip: sneak <= 0, shadow: false }, gaitOf('adele-child', ha)));
      img(q, s, 'reading-fg');
      if (sneak <= 0) for (const [bx, rot] of [[930, 0.04], [1360, -0.05]]) { q.save(); q.translate(bx, 760); q.scale(1, 0.32); q.rotate(rot); q.beginPath(); q.moveTo(-120, 0); q.quadraticCurveTo(-60, -40, 0, -10); q.quadraticCurveTo(60, -40, 120, 0); q.lineTo(120, 90); q.quadraticCurveTo(60, 60, 0, 80); q.quadraticCurveTo(-60, 60, -120, 90); q.closePath(); fs(q, '#fbf4e2', 4); line(q, 0, -10, 0, 80, 3, 'rgba(58,38,32,.4)'); q.restore(); }
      // 小黑羊（在桌子前面的地板上，整个身子都看得见）：溜走时一蹦一蹦，不是拖着腿滑
      who(q, 'sheep-black', Object.assign({ x: 1140 + dx * 0.9, y: 1060, h: HT('sheep-black', U), pose: frozen ? 'stand' : 'sleep', t: tf, expr: frozen ? 'surprise' : 'sleepy' }, sneak > 0 ? bound(run ? 0.22 : 0.3) : {}));
      E.field(q, tf, { n: 10, every: 0.4, life: 4, seed: 53, prewarm: true, make: (r) => ({ x: 200 + r(1) * 1500, s: 0.7 + r(2) * 0.5, ph: r(3) * 6 }), draw: (qq, p, age, k) => { pageBird(qq, p.x + sin(age * 1.7 + p.ph) * 80, -60 + age * 260, p.s, 0.6 + sin(age * 3 + p.ph) * 0.3, sin(age * 2 + p.ph) * 0.8, sin(PI * k)); } });
    });
    if (shh) shushFx(g, s, t, frozen);
  }
  function shushFx(g, s, t, frozen) {
    // 管理员从左边探进来：“嘘——”（眼镜反光一闪）
    const inK = up(t, 67.9, 68.4, easeO), outK = up(t, 70.3, 70.8);
    const x = lerp(-420, 160, inK) - outK * 520;
    // 管理员的影子（投在书架上）：盘发、眼镜、竖起一根手指
    if (inK > 0 && outK < 1) {
      g.save(); g.translate(x, 1120); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.62 * inK * (1 - outK); g.fillStyle = '#3a2440';
      g.beginPath(); g.moveTo(-150, 0); g.lineTo(-95, -690); g.quadraticCurveTo(0, -730, 95, -690); g.lineTo(150, 0); g.closePath(); g.fill();
      g.beginPath(); circ(g, 0, -800, 92); g.fill(); g.beginPath(); circ(g, -58, -900, 52); g.fill();
      g.beginPath(); g.moveTo(80, -660); g.quadraticCurveTo(190, -700, 120, -790); g.lineTo(112, -840); g.lineTo(136, -842); g.lineTo(142, -790); g.quadraticCurveTo(230, -700, 100, -620); g.closePath(); g.fill();
      g.restore();
    }
    const hx = x + 40, hy = 1120 - 800;
    sparkle(g, hx + 36, hy - 6, 44, inK * (1 - outK) * (0.4 + 0.6 * s.pulse(4)), t);
    if (inK > 0.3 && outK < 1) E.text(g, '嘘——', x + 360, 360, { size: 110, font: KAI, weight: 700, color: '#fff6e6', stroke: 'rgba(58,38,32,.7)', strokeW: 12, alpha: clamp((inK - 0.3) * 3) * (1 - outK) });
    if (frozen) s.post.fill(g, '#2a2040', 0.22, 'multiply');
    const burst = clamp((t - 71.2) / 0.565);
    if (burst > 0) s.post.fill(g, '#fffaf0', ease.in(burst) * 0.95, 'lighter');
  }

  /* ---------- 23–30 河畔的午后 ---------- */
  function skyClouds(g, s, pal, drift = 10, n = 4, y0 = 80) {
    sky(g, s, pal);
    for (let i = 0; i < n; i++) { const w = 560 + (i % 3) * 140; g.drawImage(s.kit.cloudSprite(60 + i, 560, 220, '#ffffff', pal === 'golden' ? '#f0c8b0' : '#dfe6f2'), ((i * 640 + s.t * drift * (0.6 + i * 0.15)) % 2600) - 500, y0 + (i % 2) * 120, w, w * 0.4); }
  }
  const UR = 500; // 河边中景里“爸爸的身高”
  function shotRiver(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 53, 4);
    const cam = fit({ x: 820 + lt * 40 + hh.sx, y: 560 + hh.sy, z: 0.86 }, -240, -1e5, 2160, 1200);
    skyClouds(g, s, 'noon', 12);
    glow(g, 1500, 120, 500, '255,250,230', 0.5, 'lighter', false);
    riverScene(g, s, cam, 'afternoon', { mid: (q) => {
      willow(q, t, 60, 1000, 1.1);
      who(q, 'crowd', { x: 1800, y: 905, h: HT('crowd', UR) * 0.8, pose: 'stand', t, flip: true, seed: 4, color: '#d8845a' });
      // 跑下河坡：先冲、后放慢、停住。腿的相位跟着跑过的路程（刚冲出来步子快，快停下时步子也慢下来，不会原地蹬腿 / 滑着走）
      const run = (i) => { const k = clamp((lt - i * 0.25) / 3.3), e = easeO(k), x0 = -200 - i * 150, x1 = 1060 - i * 190, y1 = 900 + i * 10; return [lerp(x0, x1, e), lerp(1020, y1, e), k, e * hypot(x1 - x0, y1 - 1020)]; };
      const [ax, ay, ak, ad] = run(0), [fx, fy, fk, fd] = run(1), [lx, ly, lk, ld] = run(2), [sx, sy, sk] = run(0.5);
      const runner = (name, x, y, k, d, o) => { const h = HT(name, UR), tt = o.t ?? t; who(q, name, Object.assign({ x, y, h, pose: k < 1 ? 'run' : 'stand', t: tt }, o, k < 1 ? stride(name, { h, pose: 'run', t: tt }, d) : {})); };
      runner('liese', lx, ly, lk, ld, { expr: 'laugh', prop: 'cello' });
      runner('fontaine', fx, fy, fk, fd, { t: t + 0.3, expr: 'smile' });
      // 小黑羊一蹦一蹦地冲下坡（快的时候蹦得远），停下来就站着
      const sheepMove = sk < 0.9;
      who(q, 'sheep-black', Object.assign({ x: sx - 60, y: sy + 30, h: HT('sheep-black', UR), pose: 'stand', t }, sheepMove ? bound(0.25) : {}));
      runner('adele-child', ax, ay, ak, ad, { pose: ak < 1 ? 'run' : 'cheer', expr: 'laugh', outfit: 'school', prop: 'satchel', wind: 0.6 });
    } });
    flock(g, t, { period: 8, y: 210, n: 6, seed: 9, dir: -1, offset: 3 });
    s.kit.particles(g, t, 'petals', { n: 20, seed: 55, rgb: '255,250,240' });
    s.post.fill(g, '#fffaf0', 1 - up(lt, 0, 0.55, easeO), 'source-over');
  }
  function shotPopsicle(g, s) {
    const t = s.t, lt = s.lt;
    skyClouds(g, s, 'noon', 18, 4, 160);
    glow(g, 1600, 160, 520, '255,250,230', 0.7, 'lighter', false);
    const hh = hand0(s, 57, 5);
    const cam = { x: 960 + hh.sx, y: 540 + hh.sy, z: 1.0 + 0.05 * s.p };
    const melt = clamp(0.25 + lt * 0.18);
    s.layer(g, cam, 1, (q) => {
      const P = [[560, 760, -0.18, '#f49ac0', 11, '#e8e2ea'], [980, 700, 0.02, '#ffab4a', 12, '#fbfaf6'], [1400, 780, 0.2, '#7ac8f0', 13, '#2e3a60']];
      for (const [x, y, rot, col, seed, sl] of P) {
        const bob = sin(t * 2 + seed) * 6;
        popsicle(q, x, y + bob, 1.9, rot, col, melt, t, seed);
        q.save(); q.translate(x, y + bob); q.rotate(rot); hand(q, 0, 80, 1.3, -PI / 2, 'hold', { sleeve: sl, cuff: '#fbfaf6', sleeveLen: 700 }); q.restore();
      }
      // 滴到阿黛尔的指尖上（踩着拍子）
      const ph = s.bp;
      q.globalAlpha = 1 - ph; q.fillStyle = '#ffab4a'; q.beginPath(); ell(q, 1010, 700 - 60 + ph * ph * 140, 7, 11); q.fill(); q.globalAlpha = 1;
      // 小黑羊从右下角探进来舔一口
      const pk = up(t, 78.2, 78.7, ease.back) * (1 - up(t, 79.4, 79.76));
      if (pk > 0) who(q, 'sheep-black', { x: 1960 - pk * 330, y: 1230, h: 520, pose: 'eat', t, flip: true, expr: 'laugh', shadow: false });
    });
    s.kit.particles(g, t, 'sparkle', { n: 14, seed: 58 });
    fgFrame(g, s, 'bs-fg-willow-r', -1, false, hh);
  }
  function shotGrass(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 960, y: 540, z: 1.2 - 0.14 * easeIO(s.p), r: -0.1 + 0.08 * s.p };
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'grass-top', -100, -100, VW + 200, VH + 200);
      // 三个人头挨着头躺在草地上（俯拍）：整个人躺着（官方小人的睡姿 / 莉瑟手绘），身体往外伸，头凑在中间
      // lie(name, 头的位置, 头→脚的方向)：用 anchors 找到头，把人转到这个方向（官方小人、手绘都一样）
      const lie = (name, hx, hy, dir, o) => {
        const O = Object.assign({ x: 0, y: 0, t, shadow: false }, o), C = E.cast;
        const A = C && C.anchors ? C.anchors(name, O) : null, head = A ? A.head : [0, -O.h * 0.2], foot = A ? (A.hip || A.feet) : [0, 0];
        const a0 = atan2(foot[1] - head[1], foot[0] - head[0]);
        q.save(); q.translate(hx, hy); q.rotate(dir - a0); who(q, name, Object.assign(O, { x: -head[0], y: -head[1] })); q.restore();
      };
      lie('liese', 850, 500, PI + 0.55, { h: 320, pose: 'lie', expr: 'laugh' });
      lie('fontaine', 1075, 505, -0.55, { h: 360, pose: 'sleep' });
      lie('adele-child', 960, 650, PI / 2, { h: 330, pose: 'sleep', outfit: 'school' });
      who(q, 'sheep-black', { x: 1360, y: 830, h: 230, pose: 'sleep', t, shadow: false, heat: 0.3 });
      recorder(q, 640, 800, 0.5, { t, rec: 1, spin: 0.6, shadow: false, rot: -0.3 });
    });
    for (let i = 0; i < 3; i++) { const x = ((t * 140 + i * 900) % 2800) - 500; g.globalAlpha = 0.22; g.drawImage(s.kit.fogSprite('40,60,40'), x - 400, 200 + i * 260 - 200, 900, 460); g.globalAlpha = 1; }
    s.kit.particles(g, t, 'petals', { n: 16, seed: 59, rgb: '255,255,250' });
  }
  function shotClouds(g, s) {
    const t = s.t, lt = s.lt;
    sky(g, s, 'noon');
    glow(g, 300, 900, 600, '255,250,235', 0.4, 'lighter', false);
    const hh = hand0(s, 61, 3);
    g.save(); g.translate(hh.sx, hh.sy);
    morphCloud(g, s, 'volcano', 620 + lt * 20, 430, (lt - 0.4) / 1.6, 1.05);
    morphCloud(g, s, 'sheep', 1360 + lt * 26, 330, (lt - 1.5) / 1.6, 0.95);
    morphCloud(g, s, 'family', 1120 - lt * 10, 800, (lt - 2.4) / 1.4, 0.8, 0.9);
    g.restore();
    for (let i = 0; i < 4; i++) bird(g, 200 + ((t * 120 + i * 60) % 2200), 200 + i * 26 + sin(t + i) * 10, 1.2, t * 10 + i, 'rgba(60,70,90,.7)');
    const pt = up(lt, 0.6, 1.1, easeO);
    hand(g, 360 + pt * 60, 1150 - pt * 260, 1.5, -1.0, 'point', { sleeve: '#fbfaf6', cuff: '#fbfaf6', sleeveLen: 800 });
  }
  /**
   * 前景的失焦枝叶（给近景做框）：垂下来的柳枝 + 叶子，side = 1 在左上角、-1 在右上角；可选的右下角草丛。
   * 用后期工具箱预先模糊一次（缓存），每帧只贴图；跟着手持镜头比背景晃得多一点（前景视差）
   */
  function fgFoliage(q, side, grass) {
    q.save(); if (side < 0) { q.translate(VW, 0); q.scale(-1, 1); }
    // 失焦以后细线会淡没：前景要画得“粗而实”（大叶片、浓一点的颜色），糊了才读得出是一簇叶子
    const R = rng(505), C = ['#2f5a2c', '#3d6c36', '#284a26'];
    q.lineCap = 'round';
    q.fillStyle = '#284a26'; q.beginPath(); blob(q, 150, -40, 360, 150, 506, 9, 0.2); q.fill();
    for (let i = 0; i < 8; i++) {
      const x0 = -30 + i * 58 + R() * 30, L = 200 + R() * 240 - i * 12, bend = 50 + R() * 70;
      q.beginPath(); q.moveTo(x0, -20); q.quadraticCurveTo(x0 + bend * 0.5, L * 0.5, x0 + bend, L);
      q.lineWidth = 16 + R() * 8; q.strokeStyle = C[i % 3]; q.stroke();
      for (let j = 0; j < 6; j++) { const u = (j + 1) / 7, lx = x0 + bend * u * u, ly = -20 + L * u; q.fillStyle = C[(i + j) % 3]; q.beginPath(); ell(q, lx + (j % 2 ? 22 : -22), ly, 38, 16, (j % 2 ? 0.9 : -0.9) + u * 0.4); q.fill(); }
    }
    q.restore();
    if (grass) {
      for (let i = 0; i < 30; i++) { const x = 1500 + R() * 460, h = 130 + R() * 170, lean = (R() - 0.3) * 60; q.beginPath(); q.moveTo(x - 16, 1100); q.quadraticCurveTo(x + lean * 0.3, 1100 - h * 0.6, x + lean, 1100 - h); q.quadraticCurveTo(x + lean * 0.3 + 10, 1100 - h * 0.5, x + 16, 1100); q.closePath(); q.fillStyle = C[i % 3]; q.fill(); }
    }
  }
  function fgFrame(g, s, key, side, grass, hh, drift = 0) {
    const F = E.finish;
    if (F && F.enabled) F.dof(g, s, key, (q) => fgFoliage(q, side, grass), { radius: 7, x: hh.sx * 1.6 + drift, y: hh.sy * 1.6, alpha: 0.97 });
  }
  function shotRecord(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 63, 3);
    const cam = fit({ x: 900 + hh.sx + 30 * s.p, y: 600 + hh.sy, z: 1.3 }, -240, -1e5, 2160, 1200);
    // 她（官方小人）站在河边，手里提着录音机、朝着河水录音
    const A = { x: 830, y: 905, h: 330, pose: 'stand', t, outfit: 'school' };
    skyClouds(g, s, 'noon', 12);
    riverScene(g, s, cam, 'afternoon', { mid: (q) => {
      who(q, 'sheep-black', { x: 560, y: 905, h: 165, pose: 'sit', t, expr: 'content' });
      who(q, 'adele-child', A);
      const [tx, ty] = heldRecorder(q, A, t, 0.24);
      // 声音：从水面流向录音机
      q.save(); q.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 5; j++) { const ph = (t * 0.6 + j / 5) % 1; q.globalAlpha = 0.45 * sin(PI * ph); q.strokeStyle = '#ffffff'; q.lineWidth = 4; q.beginPath(); q.arc(tx, ty, 50 + (1 - ph) * 420, -PI * 0.25, PI * 0.2); q.stroke(); }
      q.restore();
    } });
    s.kit.particles(g, t, 'sparkle', { n: 12, seed: 64 });
    fgFrame(g, s, 'bs-fg-willow-l', 1, true, hh, -40 * s.p);
  }
  function shotCello(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 65, 3);
    const cam = fit({ x: 740 + lt * 30 + hh.sx, y: 560 + hh.sy, z: 1.1 }, -240, -1e5, 2160, 1200);
    const U = 560;
    skyClouds(g, s, 'noon', 10);
    riverScene(g, s, cam, 'afternoon', { mid: (q) => {
      willow(q, t, 380, 1000, 1.25);
      who(q, 'liese', { x: 610, y: 930, h: HT('liese', U), pose: 'play', prop: 'cello', t, expr: 'closed' });
      notesFrom(q, t, 700, 520, 12, 21, 'rgba(58,38,32,.85)', 1.6);
      // 芳汀（官方小人）坐在河边的大石头上听，书摊在石头上；阿黛尔提着录音机录莉瑟的琴声
      const RX = 1235, RY = 962, RH = 96;
      q.beginPath(); q.moveTo(RX - 120, RY + 6); q.quadraticCurveTo(RX - 128, RY - RH + 10, RX - 60, RY - RH); q.quadraticCurveTo(RX + 40, RY - RH - 14, RX + 110, RY - RH + 16); q.quadraticCurveTo(RX + 138, RY - 30, RX + 124, RY + 6); q.closePath(); fs(q, '#a8a098', 4);
      q.fillStyle = 'rgba(255,255,255,.22)'; q.beginPath(); ell(q, RX - 30, RY - RH + 14, 60, 10, -0.08); q.fill(); shadow(q, RX, RY + 4, 150, 0.4);
      who(q, 'fontaine', { x: RX - 10, y: RY, h: HT('fontaine', U), pose: 'sit', seat: RH, t, flip: true, shadow: false });
      q.save(); q.translate(RX + 76, RY - RH + 4); q.rotate(0.1); q.beginPath(); q.moveTo(-34, 0); q.lineTo(0, -8); q.lineTo(34, 0); q.lineTo(34, 10); q.lineTo(0, 4); q.lineTo(-34, 10); q.closePath(); fs(q, '#fbf4e2', 2.5); line(q, 0, -8, 0, 4, 1.5, 'rgba(58,38,32,.4)'); q.restore();
      const A = { x: 960, y: 945, h: HT('adele-child', U), pose: 'stand', t, outfit: 'school', flip: true };
      who(q, 'adele-child', A);
      heldRecorder(q, A, t, 0.2);
      for (let i = 0; i < 3; i++) { const x = 900 + sin(t * 0.9 + i * 2) * 300, y = 600 + sin(t * 1.7 + i) * 60; q.save(); q.translate(x, y); q.rotate(sin(t * 3 + i) * 0.3); line(q, -30, 0, 30, 0, 5, '#4a7ab0'); q.globalAlpha = 0.6; q.fillStyle = '#e8f4ff'; const f = sin(t * 60 + i) * 0.4; for (const d of [-1, 1]) { q.beginPath(); q.ellipse(-2, d * 16, 26, 7, d * (0.3 + f), 0, TAU); q.fill(); q.beginPath(); q.ellipse(10, d * 14, 22, 6, d * (0.5 + f), 0, TAU); q.fill(); } q.restore(); }
    } });
  }
  function shotStone(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 67, 4);
    const cam = fit({ x: 980 + hh.sx, y: 540 + hh.sy, z: 0.95 }, -240, -1e5, 2160, 1200);
    const hops = [96.95, 97.76, 98.25, 98.73, 99.25, 99.6];
    const X = [700, 900, 1080, 1230, 1350, 1440], Y = [800, 740, 700, 668, 646, 632];
    const U = 600;
    skyClouds(g, s, 'noon', 10);
    riverScene(g, s, cam, 'afternoon', { mid: (q) => {
      for (let i = 1; i < hops.length; i++) {
        const a = t - hops[i]; if (a < 0) continue;
        for (let j = 0; j < 3; j++) { const r = (a - j * 0.15) * 150; if (r <= 0) continue; q.globalAlpha = max(0, 0.7 - a * 0.28); q.strokeStyle = '#fff'; q.lineWidth = 3.5; q.beginPath(); q.ellipse(X[i], Y[i], r, r * 0.2, 0, 0, TAU); q.stroke(); }
        if (a < 0.4) { q.globalAlpha = 1 - a / 0.4; for (let j = 0; j < 5; j++) { const aa = -PI / 2 + (j - 2) * 0.4; q.fillStyle = '#fff'; q.beginPath(); circ(q, X[i] + cos(aa) * a * 180, Y[i] + sin(aa) * a * 200 + a * a * 300, 5); q.fill(); } }
        q.globalAlpha = 1;
      }
      const thrown = t > 96.95, cheer = t > 98.3;
      // 芳汀（官方小人）：站着瞄准 → 甩出去以后抬手（他的基建 Interact）；阿黛尔（官方小人）看着石头跳，跳到第三下高兴得原地蹦起来
      who(q, 'fontaine', { x: 600, y: 970, h: HT('fontaine', U), pose: thrown ? 'wave' : 'stand', t, phase: thrown ? -96.95 : 0 });
      who(q, 'liese', { x: 300, y: 985, h: HT('liese', U), pose: cheer ? 'clap' : 'stand', t, expr: cheer ? 'laugh' : 'smile' });
      const jy = cheer ? 46 * abs(sin(PI * (t - 98.3) / 0.42)) : 0;
      shadow(q, 1030, 990, 70, 0.4 * (1 - jy / 90));
      who(q, 'adele-child', { x: 1030, y: 990 - jy, h: HT('adele-child', U), pose: 'stand', t, outfit: 'school', shadow: false });
      who(q, 'sheep-black', { x: 1300, y: 1000, h: HT('sheep-black', U), pose: cheer ? 'jump' : 'stand', t, expr: 'laugh' });
      let k = -1; for (let i = 0; i < hops.length - 1; i++) if (t >= hops[i] && t < hops[i + 1]) k = i;
      if (k >= 0) { const f = (t - hops[k]) / (hops[k + 1] - hops[k]); const [x, y] = k === 0 ? arc3(560, 700, X[1], Y[1], 120, f) : arc3(X[k], Y[k], X[k + 1], Y[k + 1], 70 / k, f); q.beginPath(); ell(q, x, y, 10, 7); fs(q, '#8a8494', 2.5); }
    } });
  }
  function shotSteal(g, s) {
    const t = s.t, lt = s.lt;
    const frozen = t > 102.76;
    const tf = frozen ? 102.76 + (t - 102.76) * 0.05 : t;
    const hh = hand0(s, 69, frozen ? 1 : 3);
    const zz = frozen ? 1.25 + 0.15 * easeO(clamp((t - 102.76) / 0.4)) : 1.1 + 0.1 * s.p;
    const cam = fit({ x: 1000 + hh.sx, y: 620 + hh.sy, z: zz }, -240, -1e5, 2160, 1200);
    const U = 620;
    skyClouds(g, s, 'noon', 10);
    riverScene(g, s, cam, 'afternoon', { mid: (q) => {
      const grab = t > 101.26, go = t > 102.2;
      // 叼起录音机就跑：一蹦一蹦（不是拖着腿滑）
      const sh = Object.assign({ x: 1100 + (go ? (tf - 102.2) * 300 : 0), y: 960, h: HT('sheep-black', U), pose: grab ? 'eat' : 'sleep', t: tf, expr: grab ? 'laugh' : 'sleepy', heat: 0.5 + (grab ? 0.5 : 0) }, go ? bound(0.24) : {});
      who(q, 'sheep-black', sh);
      // 录音机放在草地上、正好在小羊鼻子前面（和叼起来之后同样大小）：低头一叼，背带就到了嘴里，不会“瞬移”
      if (!grab) { const [ex] = at(Object.assign({}, sh, { pose: 'eat' }), 'sheep', 'mouth'); recorder(q, ex, 978, sh.h * 0.0013, { t, rec: 1, spin: 0.6 }); }
      else recInMouth(q, sh, tf, { spin: 0.8 });
      const notice = t > 102.26;
      // 她和莉瑟坐在河边的长椅上；发现录音机被叼走——她吓得一下子站起来（官方小人的 Interact：吓一跳），莉瑟捂住嘴
      const BX = 560, BY = 995, BH = 112;
      q.beginPath(); q.rect(BX - 250, BY - BH + 18, 18, BH - 18); q.rect(BX + 232, BY - BH + 18, 18, BH - 18); fs(q, '#5a3a24', 3.5);
      q.beginPath(); rrect(q, BX - 270, BY - BH, 540, 24, 6); fs(q, '#8a5a36', 4); q.fillStyle = 'rgba(255,230,190,.25)'; q.fillRect(BX - 262, BY - BH + 4, 524, 5);
      shadow(q, BX, BY + 4, 280, 0.35);
      who(q, 'liese', { x: 420, y: BY, h: HT('liese', U), pose: notice ? 'cover' : 'sit', seat: notice ? undefined : BH, t: tf, expr: notice ? 'surprise' : 'laugh', shadow: false });
      if (notice) who(q, 'adele-child', Object.assign({ x: 700, y: BY + 4, h: HT('adele-child', U), t: tf, outfit: 'school' }, startle(102.26)));
      else who(q, 'adele-child', { x: 690, y: BY, h: HT('adele-child', U), pose: 'sit', seat: BH, t: tf, outfit: 'school', shadow: false });
      // 背后的长椅靠背（在人后面画会被挡住：这里画在前面的只有扶手的一小截）
      q.beginPath(); rrect(q, BX - 276, BY - BH - 50, 16, 70, 4); rrect(q, BX + 260, BY - BH - 50, 16, 70, 4); fs(q, '#6a4228', 3);
      if (frozen) { bang(q, 760, 360, clamp((t - 102.76) / 0.3), 1.2); bang(q, 470, 420, clamp((t - 102.86) / 0.3), 1); bang(q, 1300, 700, clamp((t - 102.96) / 0.3), 0.9); }
    } });
    if (frozen) s.post.fill(g, '#ffe2b0', 0.18, 'multiply');
  }

  /* ---------- 31–39 追逐：小黑羊叼着录音机一路跑到广场的喷泉 ---------- */
  /**
   * 她提在手里的录音机：背带挂在近侧的手上，机身吊在手下面、轻轻晃（官方小人的手就是这样垂着的）。
   * 返回录音机麦克风的位置（给“声音飘进录音机”的波纹用）
   */
  function heldRecorder(q, A, t, k = 0.24) {
    const [hx, hy] = at(A, 'adele-child', 'hand'), sw = 0.08 * sin(t * 2.1);
    q.save(); q.translate(hx, hy); q.rotate(sw); recorder(q, 0, 250 * k, k, { t, rec: 1, spin: 0.6, shadow: false }); q.restore();
    return [hx - 136 * k, hy + 122 * k];
  }
  /** 羊嘴里叼着的录音机（跟着羊的大小） */
  function recInMouth(q, sh, t, o = {}) {
    // 录音机的背带叼在嘴里（背带的顶点 = 支点在嘴上），机身吊在下巴底下：不会挡住羊脸。跑 / 蹦的时候往后甩、一晃一晃
    const [mx, my] = at(sh, 'sheep', 'mouth'), k = sh.h * 0.0013 * (o.k || 1), f = sh.flip ? -1 : 1;
    const moving = sh.pose === 'jump' || sh.pose === 'run' || sh.pose === 'walk';
    const sw = o.rot != null ? o.rot : moving ? -f * 0.34 + 0.1 * sin(t * 9) : 0.05 * sin(t * 2);
    const oo = Object.assign({ t, rec: 1, spin: 1, shadow: false }, o); delete oo.rot; delete oo.k;
    q.save(); q.translate(mx, my); q.rotate(sw); recorder(q, 0, 236 * k, k, oo); q.restore();
  }
  function shotChaseSquare(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 71, 5);
    const cam = fit({ x: 940 + hh.sx + lt * 12, y: 530 + hh.sy, z: 1.05 + 0.04 * s.p + 0.01 * s.barPulse(6) }, 0, 0, VW, VH);
    sky(g, s, 'golden');
    glow(g, 200, 330, 520, '255,200,130', 0.6, 'lighter', false);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'square');
      fountainJets(q, t, 0, 13);
      const G = SQ.gy;
      const path = (u) => [lerp(-3.2, 4.4, u), lerp(2.3, 4.8, u)];
      // 沿着一条斜着往远处去的路线跑：腿的相位 = 在地面上跑过的距离 / 步幅（步幅按“离镜头 1 个单位时”的身高算，和透视无关）
      // 每个人一条“跑道”（dz：往远处错开一点），彼此拉开距离，不会叠成一团；路线不在终点停住（跑到最后也一直在跑）
      const put = (name, lag, Hh, dz, o) => {
        const u = max(0, (lt - lag * 0.8 + 0.3) / 3.6); const [X, Z0] = path(u), Z = Z0 + dz; const [x, y] = sp(X, G, Z);
        const tt = t + lag, d = u * hypot(7.6, 2.5) * SQ.f;
        const O = Object.assign({ x, y, h: SQ.f * Hh / Z, t: tt }, name === 'sheep-black' ? bound(0.22) : Object.assign({ pose: 'run' }, stride(name, { h: SQ.f * Hh, pose: 'run', t: tt }, d)), o);
        who(q, name, O); return O;
      };
      // 鸽子被惊起（在人后面）
      for (let i = 0; i < 8; i++) { const tt = 104.3 + i * 0.12, a = t - tt; const [bx, by] = sp(-4 + i * 1.1, G, 8 + (i % 3)); if (a < 0) pigeon(q, bx, by, 0.9, i % 2 === 0, 0, 0); else if (a < 3) pigeon(q, bx + a * 260, by - a * 420 + a * a * 20, 1.0, false, 1, t * 20 + i); }
      // 远的先画
      put('liese', 1.5, 1.22, 0.9, { expr: 'laugh', prop: 'cello' });
      put('fontaine', 1.05, 1.3, 0.45, { expr: 'smile' });
      const sh = put('sheep-black', 0, 0.53, 0.1, { expr: 'laugh', heat: 0.6 });
      recInMouth(q, sh, t);
      put('adele-child', 0.6, 1.05, 0, { expr: 'laugh', outfit: 'school', wind: 0.8 });
    });
    s.kit.particles(g, t, 'dust', { n: 30, seed: 72, rgb: '255,220,160' });
    s.post.leak(g, t, { x: 0, y: 300, r: 900, rgb: '255,160,80', a: 0.35 });
  }
  function shotMarket(g, s) {
    const t = s.t, lt = s.lt;
    const X = 800 + lt * 760;
    const hh = hand0(s, 73, 6);
    const cam = fit({ x: X + 260 + hh.sx, y: 540 + hh.sy, z: 1.0 }, -1e5, -1e5, 1e5, 1320);
    const U = 560;
    sky(g, s, 'golden');
    streetScene(g, s, cam, 'golden', { mid: (q) => {
      for (let i = floor((cam.x - 1300) / 1200); i <= floor((cam.x + 1300) / 1200); i++) if (i >= 0 && i < 5) q.drawImage(lay(s, 'stalls:' + i), i * 1200, 0, 1200, 1080);
      // 逛集市的人：站在摊位前面的路沿上（脚踩地面，不是飘在柜台前），有的在挑水果、有的慢慢走
      walkersOn(q, t, s.shot.t0, [[1060, 0, 884, 191, '#6a5a8a', 390, 1], [1700, 1, 890, 192, '#8a5a4a', 370], [2860, 0, 886, 193, '#4a6a7a', 400, -1], [3150, -1, 892, 194, '#7a7a5a', 380], [3900, 0, 884, 195, '#9a6a7a', 395, 1], [4650, 1, 888, 196, '#5a6a5a', 385]]);
      // 滚落的苹果
      for (let i = 0; i < 6; i++) { const t0 = 108.3 + i * 0.25, a = t - t0; if (a < 0) continue; const ax = 1500 + i * 60 + a * 380, ay = min(1000, 760 + a * a * 900); q.beginPath(); circ(q, ax, ay, 16); fs(q, '#e2574c', 3); q.fillStyle = 'rgba(255,255,255,.5)'; q.beginPath(); circ(q, ax - 5, ay - 5, 4); q.fill(); }
      // 跳起来的猫
      { const a = clamp((t - 109.2) / 0.8); if (a > 0 && a < 1) { const [cx, cy] = arc3(2300, 880, 2520, 760, 160, a); q.save(); q.translate(cx, cy); q.fillStyle = '#3a3440'; q.beginPath(); q.ellipse(0, 0, 44, 20, -0.3, 0, TAU); q.fill(); q.beginPath(); circ(q, 40, -18, 16); q.fill(); q.beginPath(); q.moveTo(30, -30); q.lineTo(34, -46); q.lineTo(42, -32); q.moveTo(44, -32); q.lineTo(52, -44); q.lineTo(54, -28); q.fill(); q.beginPath(); q.moveTo(-40, 0); q.quadraticCurveTo(-80, -40, -60, -60); q.lineWidth = 8; q.strokeStyle = '#3a3440'; q.stroke(); q.restore(); } }
      // 小黑羊在摊位之间钻来钻去
      // 小黑羊一蹦一蹦地在摊位之间钻来钻去；三个人追（腿的相位跟着跑过的路程）
      const weave = sin(lt * 5.2) * 40;
      const sh = Object.assign({ x: X, y: 960 + weave, h: HT('sheep-black', U), t, expr: 'laugh', heat: 0.7 }, bound(0.2));
      const runner = (name, x, y, tt, o) => { const h = HT(name, U); who(q, name, Object.assign({ x, y, h, pose: 'run', t: tt }, o, stride(name, { h, pose: 'run', t: tt }, lt * 760 + 400))); };
      if (sh.y < 990) { who(q, 'sheep-black', sh); recInMouth(q, sh, t); }
      runner('liese', X - 640, 990, t + 0.4, { expr: 'laugh', prop: 'cello' });
      runner('fontaine', X - 480, 1000, t + 0.2, { expr: 'smile' });
      if (sh.y >= 990) { who(q, 'sheep-black', sh); recInMouth(q, sh, t); }
      runner('adele-child', X - 290, 1010, t, { expr: 'laugh', outfit: 'school', wind: 1 });
    } });
    speedLines(g, t, 0.3, 'rgba(255,240,220,.6)', PI);
    s.post.leak(g, t, { x: 0, y: 200, r: 900, rgb: '255,160,80', a: 0.3 });
  }
  /** 蒸汽尾巴（像小火车一样）：从 (x, y) 往后拖 */
  function steamTrail(q, t, x, y, heat, dir = -1, n = 16, sc = 1) {
    for (let i = 0; i < n; i++) {
      const age = i * 0.11 + ((t * 9) % 1) * 0.11;
      const px = x + dir * age * 560 * sc, py = y - age * 130 * sc - sin(age * 5 + i) * 18 * sc;
      q.globalAlpha = heat * 0.65 * (1 - age / 1.9); q.fillStyle = '#fffaf2'; q.beginPath(); circ(q, px, py, (18 + age * 56) * sc); q.fill();
    }
    q.globalAlpha = 1;
  }
  function shotSteamRun(g, s) {
    const t = s.t, lt = s.lt;
    const X = -200 + lt * 1250;
    const hh = hand0(s, 77, 4);
    const cam = fit({ x: 1000 + hh.sx + lt * 60, y: 560 + hh.sy, z: 0.95 }, -240, -1e5, 2160, 1200);
    const U = 540;
    skyClouds(g, s, 'golden', 8, 3, 120);
    glow(g, 300, 400, 600, '255,190,110', 0.6, 'lighter', false);
    riverScene(g, s, cam, 'golden', { mid: (q) => {
      const heat = 0.55 + 0.45 * clamp(lt / 2);
      // 蒸汽小火车一样的冲刺：小羊一蹦就是一大步；三个人的腿按跑过的路程倒腾（快得腿都模糊了，但脚下不滑）
      const sh = Object.assign({ x: X, y: 960, h: HT('sheep-black', U), expr: 'determined', heat, t }, bound(0.16));
      glow(q, X, 910, 240, '255,120,50', 0.4 * heat);
      steamTrail(q, t, X - 40, 880, heat);
      who(q, 'sheep-black', sh);
      recInMouth(q, sh, t);
      const runner = (name, dx, y, tt, o) => { const h = HT(name, U); who(q, name, Object.assign({ x: X + dx, y, h, pose: 'run', t: tt }, o, stride(name, { h, pose: 'run', t: tt }, lt * 1250 + 600))); };
      // 远的先画（y 小 = 远）
      runner('adele-child', -560, 985, t, { expr: 'laugh', outfit: 'school', wind: 1 });
      runner('fontaine', -770, 990, t + 0.3, { expr: 'laugh' });
      runner('liese', -950, 995, t + 0.5, { prop: 'cello', expr: 'laugh' });
    } });
  }
  /** 追逐的“速度”镜头：背景抽象成飞快掠过的草、河、光斑 */
  function shotSteamFast(g, s) {
    const t = s.t, lt = s.lt;
    g.fillStyle = lg(g, 0, 0, 0, VH, [[0, '#ffcf96'], [0.55, '#f6a86e'], [0.56, '#d8a060'], [1, '#9a8a40']]); g.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 18; i++) { const y = 380 + hash(93, i) * 200, w = 200 + hash(94, i) * 700, x = ((hash(95, i) * 3000 - t * (900 + hash(96, i) * 600)) % 3000 + 3000) % 3000 - 500; g.globalAlpha = 0.35; g.fillStyle = i % 3 ? '#fff0d0' : '#b8806a'; g.fillRect(x, y, w, 6 + hash(97, i) * 10); }
    g.globalAlpha = 1;
    for (let i = 0; i < 60; i++) { const x = ((hash(98, i) * 2400 - t * 2600) % 2400 + 2400) % 2400 - 240, y = 640 + hash(99, i) * 440; g.strokeStyle = i % 2 ? 'rgba(80,90,30,.5)' : 'rgba(240,220,140,.5)'; g.lineWidth = 3 + hash(100, i) * 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 120 + hash(101, i) * 200, y); g.stroke(); }
    const hh = hand0(s, 103, 7);
    const sx = 1230 + sin(lt * 3) * 60 + hh.sx;
    glow(g, sx, 800, 340, '255,110,40', 0.5 + 0.1 * sin(t * 20));
    steamTrail(g, t, sx - 80, 740, 1, -1, 18, 1.2);
    const sh = { x: sx, y: 900, h: 300, pose: 'run', t, speed: 2, expr: 'determined', heat: 1 };
    who(g, 'sheep-black', sh);
    recInMouth(g, sh, t);
    who(g, 'adele-child', { x: 520 + sin(lt * 2.4) * 40, y: 1060, h: 560, pose: 'run', t, speed: 2, expr: 'laugh', outfit: 'school', wind: 1 });
    speedLines(g, t, 0.7, 'rgba(255,245,230,.85)', PI, 34);
  }
  function shotSheepFace(g, s) {
    const t = s.t;
    g.fillStyle = lg(g, 0, 0, VW, VH, [[0, '#ffc07a'], [1, '#ff8a5a']]); g.fillRect(0, 0, VW, VH);
    speedLines(g, t, 1, 'rgba(255,245,230,.9)', PI, 40);
    const shk = s.reduced ? 0 : 6;
    const sh = { x: 860 + wobble(3, t * 8) * shk, y: 1140 + wobble(4, t * 8) * shk, h: 980, pose: 'run', t, speed: 1.6, expr: 'determined', heat: 1 };
    glow(g, 900, 600, 760, '255,110,40', 0.45 + 0.1 * sin(t * 18));
    who(g, 'sheep-black', Object.assign(sh, { shadow: false }));
    recInMouth(g, sh, t, { rec: (t * 3 % 1) < 0.5 ? 1 : 0.2, spin: 1.2 });
    const [bx, by] = at(sh, 'sheep', 'top'); steam(g, t, bx, by + 60, 1, 79, 300, 4.4);
  }
  function shotFountainLeap(g, s) {
    const t = s.t;
    const k = t < 118.76 ? 0.55 * (t - 117.76) : t < 119.6 ? 0.55 + (t - 118.76) * 0.06 : 0.6 + ((t - 119.6) / 0.155) * 0.4;
    const slow = t > 118.76 && t < 119.6;
    const [x, y] = arc3(-150, 1060, 960, 800, 620, clamp(k));
    const hh = hand0(s, 81, slow ? 1 : 5);
    const cam = fit({ x: 960 + hh.sx, y: 540 + hh.sy, z: 1.0 + (slow ? 0.12 * easeO(clamp((t - 118.76) / 0.8)) : 0) }, 0, 0, VW, VH);
    const U = 880;
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'fountain');
      const tf = slow ? 118.76 + (t - 118.76) * 0.1 : t;
      fountainJetsClose(q, tf);
      // 小羊从两个人身后（离镜头更远）起跳、越过她们的头顶扑向喷泉：先画小羊，再画人（刚起跳时被芳汀的头挡住一下，而不是盖在她脸上）
      const sh = { x, y, h: 230, pose: 'jump', air: 0, t: tf, expr: 'laugh', heat: 0.9 };
      glow(q, x, y - 90, 240, '255,120,50', 0.4);
      who(q, 'sheep-black', sh);
      recInMouth(q, sh, tf);
      // 两个人（官方小人）：芳汀抬手想拦，阿黛尔吓了一跳
      who(q, 'fontaine', { x: 110, y: 1030, h: HT('fontaine', U), pose: 'wave', t: tf, phase: -117.76 });
      who(q, 'adele-child', Object.assign({ x: 330, y: 1020, h: HT('adele-child', U), t: tf, outfit: 'school' }, startle(117.9)));
      if (slow) { for (let i = 0; i < 20; i++) { const px = 300 + hash(83, i) * 1300, py = 200 + hash(84, i) * 600; q.globalAlpha = 0.7; q.fillStyle = '#eef8ff'; q.beginPath(); ell(q, px + sin(tf + i) * 4, py, 5, 8); q.fill(); } q.globalAlpha = 1; }
    });
    if (slow) s.post.fill(g, '#ffe0b0', 0.12, 'soft-light');
  }
  function fountainJetsClose(q, t) {
    q.save(); q.lineCap = 'round';
    for (let i = 0; i < 12; i++) { const a = PI * 0.08 + (i / 11) * PI * 0.84, x = 960 + cos(a) * 140, y0 = 254 + sin(a) * 26; q.globalAlpha = 0.45 + 0.2 * sin(t * 7 + i); q.strokeStyle = '#eef8ff'; q.lineWidth = 4; q.beginPath(); q.moveTo(x, y0); q.quadraticCurveTo(x + cos(a) * 30, y0 + 60, x + cos(a) * 40 + sin(t * 9 + i) * 3, 420 + sin(a) * 40); q.stroke(); }
    for (let i = 0; i < 22; i++) { const a = PI * 0.04 + (i / 21) * PI * 0.92, x = 960 + cos(a) * 330, y0 = 424 + sin(a) * 56; q.globalAlpha = 0.4 + 0.2 * sin(t * 6 + i * 1.7); q.strokeStyle = i % 2 ? '#eaf6ff' : '#cfe8f4'; q.lineWidth = 6; q.beginPath(); q.moveTo(x, y0); q.quadraticCurveTo(x + cos(a) * 70, y0 + 120, x + cos(a) * 90 + sin(t * 8 + i) * 4, 780 + sin(a) * 40); q.stroke(); }
    for (let i = 0; i < 24; i++) { const ph = (t * 1.5 + hash(141, i)) % 1, a = hash(142, i) * PI; q.globalAlpha = 0.8 * (1 - ph); q.fillStyle = '#f4fbff'; q.beginPath(); circ(q, 960 + cos(a) * (420 + ph * 80), 800 + sin(a) * 50 - sin(PI * ph) * 60, 4); q.fill(); }
    q.restore();
  }
  function shotSplash(g, s) {
    const t = s.t, lt = s.lt;
    const T0 = B(59);
    const hit = Math.exp(-max(0, t - T0) * 4);
    const shk = s.reduced ? 0 : hit * 22;
    const cam = fit({ x: 960 + wobble(5, t * 10) * shk, y: 540 + wobble(6, t * 10) * shk, z: 1.08 - 0.08 * easeO(clamp(lt / 1.5)) }, 0, 0, VW, VH);
    const U = 880;
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'fountain');
      fountainJetsClose(q, t);
      const sit = lt > 0.5;
      const sh = { x: 990, y: 870, h: 250, pose: sit ? 'sit' : 'jump', air: 0, t, expr: 'laugh', heat: 0.45 };
      if (lt > 0.25) { who(q, 'sheep-black', Object.assign(sh, { shadow: false })); recInMouth(q, sh, t, { rot: -0.35, spin: 0.7 }); }
      splashFx(q, t, T0, 980, 800, 1.2);
      rainbow(q, 980, 900, 620, up(t, 120.3, 121.2) * (1 - up(t, 122.8, 123.7)));
      // 两边被溅了一身水的小伙伴：先挡，再笑
      const shield = lt < 0.9, laugh = lt > 1.4;
      // 官方小人：水花溅起来时阿黛尔吓一跳、芳汀抬手挡；缓过来以后都笑了（芳汀抬手，阿黛尔原地蹦）
      who(q, 'fontaine', { x: 130, y: 1040, h: HT('fontaine', U), pose: shield || laugh ? 'wave' : 'stand', t, phase: laugh ? -121.2 : -119.76 });
      const jy = laugh ? 40 * abs(sin(PI * (t - 121.2) / 0.45)) : 0;
      if (shield) who(q, 'adele-child', Object.assign({ x: 370, y: 1030, h: HT('adele-child', U), t, outfit: 'school' }, startle(119.76)));
      else { shadow(q, 370, 1030, 80, 0.4 * (1 - jy / 80)); who(q, 'adele-child', { x: 370, y: 1030 - jy, h: HT('adele-child', U), pose: 'stand', t, outfit: 'school', shadow: false }); }
      who(q, 'liese', { x: 1610, y: 1040, h: HT('liese', U), pose: shield ? 'cover' : laugh ? 'clap' : 'stand', t, flip: true, expr: lt > 1.6 ? 'laugh' : 'surprise', prop: 'cello' });
      // 溅在他们身上的水珠
      if (lt > 0.2 && lt < 2.5) for (let i = 0; i < 16; i++) { const x = [260, 470, 1600][i % 3] + (hash(151, i) - 0.5) * 200, y = 520 + hash(152, i) * 380 + (lt - 0.2) * 60; q.globalAlpha = 0.8 * (1 - (lt - 0.2) / 2.3); q.fillStyle = '#eef8ff'; q.beginPath(); ell(q, x, y, 5, 8); q.fill(); }
      q.globalAlpha = 1;
    });
    s.post.fill(g, '#fff', hit * 0.4, 'lighter');
    s.kit.particles(g, t, 'sparkle', { n: 26, seed: 86 });
  }
  function shotLaugh(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 87, 3);
    const cam = fit({ x: 960 + hh.sx, y: 560 + hh.sy, z: 1.15 - 0.05 * s.p }, 0, 0, VW, VH);
    const U = 800, seat = 110;
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'fountain');
      fountainJetsClose(q, t);
      who(q, 'sheep-black', { x: 1000, y: 870, h: 240, pose: 'sit', t, expr: 'laugh', heat: 0.2, shadow: false });
      const ph = (s.beat % 2) / 2;
      if (ph < 0.4) for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, r = 110 + ph * 500; q.globalAlpha = 1 - ph / 0.4; q.fillStyle = '#f0f8ff'; q.beginPath(); circ(q, 1000 + cos(a) * r, 770 + sin(a) * r * 0.6, 6); q.fill(); }
      q.globalAlpha = 1;
      who(q, 'liese', { x: 420, y: 1060, h: HT('liese', U), pose: 'sit', seat, arms: 'clap', t, expr: 'laugh', prop: 'cello', shadow: false });
      who(q, 'fontaine', { x: 700, y: 1060, h: HT('fontaine', U), pose: 'sit', seat, t, expr: 'laugh', shadow: false });
      // 阿黛尔（官方小人）坐在池沿上，录音机放在身边，正在回放刚才录下的声音
      const A = { x: 1420, y: 1060, h: HT('adele-child', U), pose: 'sit', seat, t, outfit: 'school', flip: true, shadow: false };
      who(q, 'adele-child', A);
      const RK = 0.3, RXc = 1250, RYc = 1060 - seat + 6;
      recorder(q, RXc, RYc, RK, { t, rec: 1, spin: 0.8, shadow: false, key: 'play' });
      // 回放：从录音机的喇叭里飘出来的声音
      const hx = RXc + 130 * RK, hy = RYc - 130 * RK;
      // 回放的声音从录音机里飘出来，往左上方（画面中间）飘：不从她的脸前面经过
      E.field(q, t, { n: 10, every: 0.4, life: 3, seed: 88, prewarm: true, make: (r) => ({ vx: -(30 + r(1) * 50), k: floor(r(2) * 4), ph: r(3) * 6 }), draw: (qq, p, age, k) => {
        const x = hx - 80 + p.vx * age * 1.4 + sin(age * 3 + p.ph) * 14, y = hy - 30 - age * 150, a = sin(PI * k);
        if (p.k < 2) { qq.globalAlpha = a; note(qq, x, y, 1.2, 0, '#fff6e6', p.k); qq.globalAlpha = 1; }
        else E.text(qq, p.k === 2 ? '咩！' : '哈哈', x, y, { size: 48, font: KAI, weight: 700, color: '#fff6e6', stroke: 'rgba(120,60,30,.6)', strokeW: 8, alpha: a });
      } });
    });
    s.post.leak(g, t, { x: 1900, y: 100, r: 1000, rgb: '255,150,80', a: 0.4 });
    s.kit.particles(g, t, 'sparkle', { n: 18, seed: 89 });
  }
  function shotWalkHome(g, s) {
    const t = s.t, lt = s.lt;
    // 一起往右走 → 1.8 秒在岔路口分手：莉瑟转身往左走、芳汀往右走，边走边回头挥手；阿黛尔和小羊停下来挥手送他们
    const V = 150, TS = 2.46; // 大家一起走的速度；阿黛尔停下的时刻
    const X = 200 + V * lt;
    const camX = 200 + V * (lt < 2.2 ? lt : 2.2 + 0.6 * (1 - Math.exp(-(lt - 2.2) / 0.6)));
    const hh = hand0(s, 91, 3);
    const cam = fit({ x: camX + 500 + hh.sx, y: 560 + hh.sy, z: 0.95 }, -240, -1e5, 2160, 1200);
    const U = 540;
    sky(g, s, 'sunset');
    glow(g, 1500, 520, 700, '255,160,90', 0.7, 'lighter', false);
    riverScene(g, s, cam, 'sunset', { mid: (q) => {
      const rim = '255,190,130';
      const walker = (name, o, d) => { const w = o.pose === 'walk'; who(q, name, Object.assign(o, w ? stride(name, { h: o.h, pose: 'walk', t }, d) : {})); };
      // 芳汀（走在最前面）：走到 1.8 秒停下、回身挥手，2.1 秒起往右走（边走边挥手）。不从阿黛尔身后穿过去
      const fT = 280, fx = lt < 1.8 ? 730 + V * lt : lt < 2.1 ? 1000 : 1000 + fT * (lt - 2.1);
      // （官方小人：停下时回身抬手 = 他的 Interact；走的时候就是走）
      walker('fontaine', { x: fx, y: 955, h: HT('fontaine', U), pose: lt < 1.8 || lt >= 2.1 ? 'walk' : 'wave', phase: lt < 2.1 ? -129.57 : 0, flip: lt >= 1.8 && lt < 2.1, t, sha: 0.6, rim }, lt < 1.8 ? V * lt : fT * (lt - 2.1));
      // 莉瑟：停下、转身，2.1 秒起往左走（面朝左，边走边挥手）
      const lT = 170, lx = lt < 1.8 ? V * lt : lt < 2.1 ? 270 : 270 - lT * (lt - 2.1);
      walker('liese', { x: lx, y: 960, h: HT('liese', U), pose: lt < 1.8 || lt >= 2.1 ? 'walk' : 'stand', arms: lt >= 1.8 ? 'wave' : undefined, flip: lt >= 1.8, t, expr: 'smile', prop: 'cello', sha: 0.6, rim }, lt < 1.8 ? V * lt : lT * (lt - 2.1));
      // 阿黛尔：走到 TS 停下，先朝左挥手送莉瑟，再朝右挥手送芳汀
      const ax = 510 + V * min(lt, TS);
      walker('adele-child', { x: ax, y: 965, h: HT('adele-child', U), pose: lt < TS ? 'walk' : 'wave2', t, outfit: 'school', prop: 'satchel', flip: lt >= TS && lt < 2.94, sha: 0.6, rim }, V * lt);
      // 小黑羊跟着她走（小碎步），她停下它也停下
      walker('sheep-black', { x: 370 + V * min(lt, TS), y: 968, h: HT('sheep-black', U), pose: lt < TS ? 'walk' : 'stand', t, sha: 0.6 }, V * lt);
    } });
    s.post.leak(g, t, { x: 1600, y: 500, r: 900, rgb: '255,140,80', a: 0.4 });
  }
  function shotSunset(g, s) {
    const t = s.t, lt = s.lt;
    // 镜头不死：极慢地往前推（画面四边都有东西铺满，放大不会露边）
    const zp = 1 + 0.035 * easeS(s.p);
    g.save(); g.translate(960, 560); g.scale(zp, zp); g.translate(-960, -560);
    shotSunsetBody(g, s, t, lt);
    g.restore();
  }
  function shotSunsetBody(g, s, t, lt) {
    sky(g, s, 'sunset');
    const sunY = 640 + lt * 60;
    glow(g, 960, sunY, 900, '255,150,80', 0.8, 'lighter', false);
    g.beginPath(); circ(g, 960, sunY, 190); g.fillStyle = rg(g, 960, sunY, 0, 190, [[0, '#fff2c0'], [0.7, '#ffc880'], [1, '#ff9a60']]); g.fill();
    g.fillStyle = lg(g, 0, 700, 0, VH, [[0, '#6a4a7a'], [1, '#3a2a4a']]); g.fillRect(0, 700, VW, 380);
    for (let i = 0; i < 26; i++) { const y = 712 + i * 14, w = (220 - i * 6) * (0.7 + 0.3 * sin(t * 2 + i * 1.3)); g.fillStyle = `rgba(255,200,130,${0.7 - i * 0.022})`; g.fillRect(960 - w / 2 + sin(t * 1.5 + i) * 10, y, w, 5); }
    const dark = '#3a2440';
    g.fillStyle = dark; g.beginPath(); g.moveTo(-40, 700); g.lineTo(-40, 520); g.lineTo(1960, 520); g.lineTo(1960, 700);
    for (const [ax, ar] of [[1640, 150], [960, 190], [280, 150]]) { g.lineTo(ax + ar, 700); g.arc(ax, 700, ar, 0, PI, true); }
    g.closePath(); g.fill();
    g.fillRect(-40, 470, 2000, 56); for (let x = -20; x < 1960; x += 70) g.fillRect(x, 440, 16, 40); g.fillRect(-40, 432, 2000, 14);
    // 桥上走过的剪影：真的在往前走（步子跟着走过的路程），不是原地踏步
    const wv = 100, wd = wv * lt;
    who(g, 'sheep-black', Object.assign({ x: 730 + wd, y: 470, h: 150, pose: 'walk', t, sil: dark, rim: '255,190,120', shadow: false }, stride('sheep-black', { h: 150, pose: 'walk', t }, wd)));
    who(g, 'adele-child', Object.assign({ x: 900 + wd, y: 470, h: 300, pose: 'walk', t, outfit: 'school', prop: 'satchel', sil: dark, rim: '255,190,120', shadow: false }, stride('adele-child', { h: 300, pose: 'walk', t }, wd)));
    s.kit.particles(g, t, 'dust', { n: 30, seed: 92, rgb: '255,200,140' });
    for (let i = 0; i < 5; i++) bird(g, 300 + i * 60 + lt * 80, 260 + (i % 2) * 20, 1.1, t * 9 + i, 'rgba(60,30,50,.8)');
  }

  /* ---------- 40–47 晚上：晚餐、地图、约定、信、阁楼的窗 ---------- */
  /** 夜里屋内：整体压一层暖暗（人和房间一起），再补上灯光 */
  function nightGrade(g, lamps, a = 1) {
    g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = a; g.fillStyle = '#c8b0a8'; g.fillRect(0, 0, VW, VH); g.restore();
    for (const [x, y, r, al] of lamps) glow(g, x, y, r, '255,190,120', al, 'lighter', false);
  }
  function soupSteam(q, t, x, y, k = 1) {
    q.save(); q.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const ph = (t * 0.45 + i / 3) % 1; q.globalAlpha = 0.4 * sin(PI * ph); q.strokeStyle = '#fff'; q.lineWidth = 7 * k; q.beginPath(); for (let j = 0; j <= 8; j++) { const yy = y - j * 12 * k - ph * 50 * k, xx = x + (i - 1) * 16 * k + sin(j * 0.8 + t * 2 + i) * 8 * k; j ? q.lineTo(xx, yy) : q.moveTo(xx, yy); } q.stroke(); }
    q.restore();
  }
  const scr = (cam, x, y) => [960 + (x - cam.x) * cam.z, 540 + (y - cam.y) * cam.z];
  const DINNER_RADIO = [724, 0.34]; // 晚饭时收音机在窗台上的位置 / 缩放（晚饭、约定两个镜头共用）
  /** 爸爸举过头顶挥的红领带：从近侧的拳头往上伸，像指挥棒一样左右挥，领带尖跟着甩（纯函数）。领带一直在头顶上方 */
  function waveTie(q, K, t, U) {
    const C = E.cast, A = C && C.anchors ? C.anchors('katia', K) : null;
    if (!A || !A.handN) return;
    const [hx, hy] = A.handN, L = U * 0.21, ph = t * 6.8;
    const ang = -PI / 2 + 0.62 * sin(ph), lag = -0.55 * cos(ph);
    const c1x = hx + cos(ang) * L * 0.55, c1y = hy + sin(ang) * L * 0.55, ex = hx + cos(ang + lag) * L, ey = hy + sin(ang + lag) * L;
    const N = 10, Lft = [], Rgt = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      const x = a * hx + b * c1x + c * ex, y = a * hy + b * c1y + c * ey;
      const dx = 2 * (1 - u) * (c1x - hx) + 2 * u * (ex - c1x), dy = 2 * (1 - u) * (c1y - hy) + 2 * u * (ey - c1y), dl = hypot(dx, dy) || 1;
      const wdt = U * (u < 0.82 ? 0.012 + 0.02 * u : 0.0284 * (1 - (u - 0.82) / 0.18));
      Lft.push(x - (dy / dl) * wdt, y + (dx / dl) * wdt); Rgt.push(x + (dy / dl) * wdt, y - (dx / dl) * wdt);
    }
    q.beginPath(); q.moveTo(Lft[0], Lft[1]);
    for (let i = 2; i < Lft.length; i += 2) q.lineTo(Lft[i], Lft[i + 1]);
    for (let i = Rgt.length - 2; i >= 0; i -= 2) q.lineTo(Rgt[i], Rgt[i + 1]);
    q.closePath(); fs(q, TIE, 3);
    // 斜纹
    q.save(); q.clip(); q.strokeStyle = 'rgba(255,220,200,.35)'; q.lineWidth = 3;
    for (let i = 2; i < N; i += 2) { const k = i * 2; q.beginPath(); q.moveTo(Lft[k], Lft[k + 1]); q.lineTo(Rgt[k + 2], Rgt[k + 3]); q.stroke(); }
    q.restore();
    // 挥动的弧线（速度线）
    q.save(); q.globalAlpha = 0.5 * abs(cos(ph)); q.strokeStyle = '#fff4dc'; q.lineWidth = 4; q.lineCap = 'round';
    const sg = cos(ph) >= 0 ? 1 : -1;
    q.beginPath(); q.arc(hx, hy, L * 1.08, ang - 0.5 * sg, ang - 0.12 * sg, sg < 0); q.stroke(); q.restore();
  }
  function shotDinner(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 105, 3);
    const cam = fit({ x: 560 + hh.sx + 20 * s.p, y: 640 + hh.sy, z: 1.5 + 0.08 * easeS(s.p) }, 0, 0, VW, VH);
    const U = 640;
    // 爸爸讲起宠物大赛：抓起领带当指挥棒挥起来，大家笑成一团
    const story = lt > 0.9;
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'room-kitchen:night');
      radio(q, DINNER_RADIO[0], 562, DINNER_RADIO[1], t, 1, 0.25 + 0.3 * s.e, s.bp);
      dinnerScene(q, s, t, { story, U, hopT: B(70) });
      line(q, 560, 40, 560, 290, 3, INK); q.beginPath(); q.moveTo(470, 350); q.lineTo(650, 350); q.lineTo(610, 290); q.lineTo(510, 290); q.closePath(); fs(q, '#e8a060', 4);
    });
    nightGrade(g, [[...scr(cam, 560, 360), 520, 0.45], [...scr(cam, 560, 760), 460, 0.25]]);
  }
  /**
   * 晚饭的一桌（厨房房间坐标，镜头从爸爸妈妈身后看过去——过肩镜头）：
   *   阿黛尔坐在桌子对面，面朝我们（官方小人的坐姿，腰以下在桌后）；
   *   爸爸（左）妈妈（右）坐在靠镜头这一边，背对我们，被吊灯勾出暖色的轮廓——他们的脸始终不入画。
   *   story：爸爸把领带举过头顶挥（背影里也看得见），妈妈拍手，小黑羊从他们中间蹦起来
   */
  function dinnerScene(q, s, t, o = {}) {
    const U = o.U || 640, story = !!o.story;
    chairBack(q, 575, 600, 800, 136);
    // 她看着讲故事的爸爸（面朝左）
    who(q, 'adele-child', { x: 575, y: 905, h: HT('adele-child', U), pose: 'sit', seat: 110, t, outfit: 'school', flip: story, shadow: false });
    img(q, s, 'kitchen-table:dinner');
    glow(q, 470, 700, 70 + 6 * sin(t * 13) + 4 * sin(t * 7.3), '255,200,120', 0.7);
    for (const bx of [330, 600, 830]) { q.beginPath(); q.ellipse(bx, 770, 70, 14, 0, 0, TAU); fs(q, '#f4efe6', 3.5); q.beginPath(); q.moveTo(bx - 70, 770); q.quadraticCurveTo(bx, 830, bx + 70, 770); fs(q, '#f4efe6', 3.5); q.fillStyle = '#d88a4a'; q.beginPath(); q.ellipse(bx, 770, 60, 10, 0, 0, TAU); q.fill(); soupSteam(q, t + bx, bx, 750, 0.9); }
    // 小黑羊在爸爸妈妈中间的地板上；大家一笑，它跟着拍子蹦起来
    const hop = story ? abs(sin(PI * clamp((t - (o.hopT ?? 0)) / 0.5))) : 0;
    who(q, 'sheep-black', { x: 600, y: 1050 - hop * 60, h: HT('sheep-black', U), pose: story ? 'jump' : 'sleep', air: 0, t, expr: 'laugh', heat: story ? 0.5 : 0, shadow: false });
    // 近处的两个人：背影（比桌子那边的人离镜头近，画得大一点），吊灯在他们前上方 → 轮廓光
    const kU = 1.22, rim = '255,196,130';
    const K = { x: 225, y: 1250, h: U * kU, pose: 'sit', seat: 400, view: 'back', arms: story ? 'cheer' : undefined, t, outfit: 'suit', shadow: false, rim, rimDir: -0.9, rimW: 0.9, rimGlow: 0 };
    who(q, 'katia', K);
    if (story) waveTie(q, K, t, U * kU);
    who(q, 'magna', { x: 930, y: 1250, h: HT('magna', U) * kU, pose: 'sit', seat: 400, view: 'back', arms: story ? 'clap' : undefined, t, outfit: 'home', flip: true, shadow: false, rim, rimDir: -2.2, rimW: 0.9, rimGlow: 0 });
    // 他们的椅背（离镜头更近，挡住腰）
    chairBack(q, 225, 900, 1120, 230, '#8a5a38'); chairBack(q, 930, 900, 1120, 220, '#8a5a38');
  }
  function shotMap(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 107, 2);
    const cam = fit({ x: 960 + hh.sx, y: 540 + hh.sy, z: 1.08 + 0.06 * s.p }, 0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'map-top');
      q.save(); q.translate(960, 540); q.rotate(-0.06);
      const cp = clamp((lt - 0.4) / 1.3);
      if (cp > 0) { q.beginPath(); q.ellipse(260, -40, 120, 90, -0.2, -PI / 2, -PI / 2 + TAU * cp * 1.05); q.lineWidth = 9; q.strokeStyle = 'rgba(214,58,48,.9)'; q.lineCap = 'round'; q.stroke(); }
      const rk = clamp(lt / 1.6), [rx, ry] = [lerp(-470, 230, rk), lerp(-200, -30, rk) - sin(PI * rk) * 120];
      if (lt < 1.9) hand(q, rx + 10, ry + 20, 1.0, 1.2, 'point', { sleeve: '#c8a8b8', cuff: '#e8d8e0', sleeveLen: 700 });
      else hand(q, 310, 120, 1.0, 1.4, 'pen', { sleeve: '#c8a8b8', cuff: '#e8d8e0', pen: '#d63a30', sleeveLen: 700 });
      // 爸爸放下一个空的样品瓶：“给你带一块石头回来”
      const jk = up(t, 145.9, 146.35, easeO);
      if (jk > 0) {
        const jy = lerp(-500, 60, jk);
        q.beginPath(); circ(q, 470, jy, 58); fs(q, 'rgba(210,235,242,.7)', 5); q.beginPath(); circ(q, 470, jy, 36); fs(q, '#c89a60', 4);
        q.fillStyle = 'rgba(255,255,255,.7)'; q.beginPath(); ell(q, 448, jy - 22, 12, 6, -0.6); q.fill();
        hand(q, 470 + 60, jy - 20, 1.25, -2.4, 'hold', { sleeve: '#f4f1ea', cuff: '#e8e2d6', sleeveLen: 700 });
      }
      q.restore();
    });
    nightGrade(g, [[900, 460, 700, 0.3]], 0.6);
  }
  function shotPromise(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 109, 3);
    const cam = fit({ x: 1200 + hh.sx, y: 640 + hh.sy, z: 1.55 + 0.05 * s.p }, 0, 0, VW, VH);
    const U = 660;
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'room-kitchen:night');
      radio(q, DINNER_RADIO[0], 562, DINNER_RADIO[1], t, 1, 0.25 + 0.3 * s.e, s.bp); // 窗台上的收音机（和晚饭的镜头同一个位置）
      // 过肩镜头：爸爸单膝跪在前景（背影，离镜头更近），向她伸出手；她（官方小人）站在对面看着他。爸爸的脸不入画
      who(q, 'adele-child', { x: 1010, y: 905, h: HT('adele-child', U), pose: 'stand', t, outfit: 'school', shadow: true });
      who(q, 'katia', { x: 1440, y: 1010, h: U * 1.18, pose: 'kneel', arms: 'reach', aim: 0.15 + 0.08 * up(lt, 0.5, 1.2, easeO), view: 'back3', flip: true, t, outfit: 'suit', shadow: false, rim: '255,196,130', rimDir: -2.4, rimW: 0.9, rimGlow: 0 });
    });
    nightGrade(g, [[...scr(cam, 560, 330), 560, 0.4]]);
  }
  function shotPinky(g, s) {
    const t = s.t, lt = s.lt;
    g.fillStyle = lg(g, 0, 0, 0, VH, [[0, '#4a3040'], [1, '#2a1a28']]); g.fillRect(0, 0, VW, VH);
    bokeh(g, t, ['255,190,120', '255,160,90', '255,220,170'], 14, 21);
    const hh = hand0(s, 111, 2);
    const hook = easeO(clamp(lt / 0.6));
    g.save(); g.translate(hh.sx, hh.sy);
    const y = 520 + sin(t * 1.2) * 6;
    // 爸爸的大手（右）与她的小手（左）：两只拳头，小指伸出来勾在一起
    const sep = (1 - hook) * 260, cx = 960;
    hand(g, cx - 190 - sep, y + 6, 1.45, -0.04, 'fist', { sleeve: '#fbfaf6', cuff: '#fbfaf6', sleeveLen: 900 });
    hand(g, cx + 230 + sep, y - 4, 1.9, PI + 0.04, 'fist', { sleeve: '#f4f1ea', cuff: '#e8e2d6', sleeveLen: 900, flip: true, skin: '#ffd8c0' });
    const finger = (pts, w, col) => { g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(pts[0], pts[1]); g.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); g.lineWidth = w + 9; g.strokeStyle = INK; g.stroke(); g.lineWidth = w; g.strokeStyle = col; g.stroke(); };
    const hisP = [cx + 76 + sep, y + 46, cx + 30 + sep * 0.6, y + 76, cx - 14 + sep * 0.2, y + 22, cx - 30 + sep * 0.2, y + 66];
    const herP = [cx - 90 - sep, y + 54, cx - 40 - sep * 0.6, y + 84, cx + 16 - sep * 0.2, y + 64, cx + 26 - sep * 0.2, y + 20];
    finger(hisP, 38, '#ffd8c0');
    finger(herP, 30, SKIN);
    if (hook > 0.8) { g.save(); g.beginPath(); g.rect(cx - 40, y + 40, 40, 40); g.clip(); finger(hisP, 30, '#ffd8c0'); g.restore(); }
    if (hook > 0.95) sparkle(g, cx, y + 40, 40, clamp((lt - 0.6) / 0.3) * (1 - clamp((lt - 1.2) / 0.6)), t);
    g.restore();
    glow(g, 960, y, 280, '255,200,140', 0.2 + 0.1 * s.pulse(3));
  }
  function shotSmile(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 113, 2);
    // 背景：放大的厨房（景深外，预先模糊一次）+ 灯光的焦外光斑；她的脸被左上方的吊灯勾出一圈暖色的轮廓光
    const F = E.finish, fin = F && F.enabled;
    const bg = (q) => { q.translate(960, 540); q.scale(2.2, 2.2); q.translate(-700, -560); img(q, s, 'room-kitchen:night'); radio(q, DINNER_RADIO[0], 562, DINNER_RADIO[1], 0, 1, 0.3, 0); };
    if (fin) F.dof(g, s, 'bs-smile-bg', bg, { radius: 12, opaque: true, x: hh.sx * 0.5, y: hh.sy * 0.5 });
    else s.layer(g, { x: 700, y: 560, z: 2.2, sx: hh.sx * 0.5, sy: hh.sy * 0.5 }, 1, (q) => { img(q, s, 'room-kitchen:night'); radio(q, DINNER_RADIO[0], 562, DINNER_RADIO[1], t, 1, 0.3, s.bp); });
    s.post.fill(g, '#3a2830', 0.35);
    if (fin) F.bokeh(g, s, { n: 11, seed: 23, a: 0.3, colors: ['255,200,140', '255,176,110', '255,226,180'], depth: [0.2, 1], size: [36, 120], rect: [0, 0, VW, 760], drift: [4, -3], twinkle: 0.3 });
    // 中近景：她（官方小人，画得很大）坐在餐桌后面，桌沿在胸口以下把画面切开；镜头慢慢推近。左上方的吊灯给她一圈暖色轮廓光
    s.layer(g, { x: 960, y: 540, z: 1.0 + 0.07 * easeS(s.p), sx: hh.sx, sy: hh.sy }, 1, (q) => {
      who(q, 'adele-child', { x: 940, y: 1340, h: 1180, pose: 'sit', seat: 300, t, outfit: 'school', shadow: false, rim: '255,200,140', rimDir: -2.3, rimW: 0.8, rimGlow: 0 });
      // 桌沿（前景，景深外的一条暖色木边 + 桌布）
      q.fillStyle = lg(q, 0, 900, 0, 1100, [[0, '#f4e6cc'], [1, '#d8c4a0']]); q.fillRect(-100, 905, 2200, 300);
      q.fillStyle = 'rgba(80,40,30,.18)'; q.fillRect(-100, 905, 2200, 14);
      q.beginPath(); q.ellipse(1310, 905, 150, 26, 0, PI, TAU); fs(q, '#f4efe6', 4); glow(q, 520, 880, 140, '255,200,120', 0.5);
    });
    nightGrade(g, [[600, 200, 700, 0.35]]);
  }
  function shotLap(g, s) {
    const t = s.t, lt = s.lt;
    // 桌子底下：她两只手攥着裙角；小黑羊把头搁在她腿上，暖暖的
    g.fillStyle = lg(g, 0, 0, 0, VH, [[0, '#2a1e28'], [1, '#1a1218']]); g.fillRect(0, 0, VW, VH);
    const hh = hand0(s, 114, 2);
    s.layer(g, { x: 960, y: 540, z: 1 + 0.04 * s.p, sx: hh.sx, sy: hh.sy }, 1, (q) => {
      q.fillStyle = '#4a2e22'; q.fillRect(-100, 870, 2200, 400);
      q.fillStyle = 'rgba(0,0,0,.25)'; q.fillRect(-100, 870, 2200, 14);
      // 她坐的那把大椅子（和晚饭的镜头一样，座面比她的膝盖高，两条腿悬着晃）：座面、前腿、后腿
      const AX = 700, FLOOR = 1060, SEAT = 387;
      q.beginPath(); q.rect(AX - 250, FLOOR - SEAT + 40, 34, SEAT - 40); q.rect(AX + 200, FLOOR - SEAT + 40, 34, SEAT - 40); fs(q, '#5a3a24', 4);
      q.beginPath(); rrect(q, AX - 262, FLOOR - SEAT, 510, 46, 10); fs(q, '#7a4e30', 4.5);
      q.fillStyle = 'rgba(255,220,170,.18)'; q.fillRect(AX - 250, FLOOR - SEAT + 6, 486, 8);
      who(q, 'adele-child', { x: AX, y: FLOOR, h: 1350, pose: 'sit', seat: SEAT, arms: 'lap', t, expr: 'content', outfit: 'school', shadow: false });
      // 小黑羊从右边挨过来，把下巴搁在她的膝盖上
      const sk = up(t, 154.1, 154.7, easeO);
      const sh = { x: 1520 - sk * 380, y: 960, h: 500, pose: 'stand', t, flip: true, expr: 'closed', heat: 0.35 * sk, shadow: false };
      glow(q, sh.x - 160, 700, 420, '255,150,80', 0.3 * sk);
      who(q, 'sheep-black', sh);
      // 桌面的下沿：挡住她的脸，只看得见领口以下（我们在桌子底下）
      q.fillStyle = '#3a2418'; q.fillRect(-100, -100, 2200, 500); q.fillStyle = '#5a3a26'; q.fillRect(-100, 380, 2200, 40); line(q, -100, 420, 2100, 420, 5, '#1a0e0a');
      q.fillStyle = 'rgba(255,190,120,.12)'; q.fillRect(-100, 400, 2200, 6);
    });
    nightGrade(g, [[960, 300, 700, 0.2]], 0.8);
    s.kit.particles(g, t, 'dust', { n: 20, seed: 115, rgb: '255,200,150' });
  }
  function shotEnvelope(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 117, 2);
    const cam = fit({ x: 960 + hh.sx, y: 540 + hh.sy, z: 1.05 + 0.05 * s.p }, 0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'desk-night-top');
      const slide = easeIO(clamp((lt - 0.3) / 0.9)), close = easeIO(clamp((lt - 1.4) / 0.5));
      q.save(); q.translate(1000, 560); q.rotate(0.04);
      envelope(q, lerp(-40, 40, slide), lerp(420, 10, slide), 1.1, lerp(-0.25, 0.02, slide));
      if (close > 0) { q.save(); q.scale(1, close); q.beginPath(); rrect(q, -480, -310, 960, 640, 14); fs(q, '#c89a5e', 5); E.text(q, '乌纳 · 考察资料', 0, 22, { size: 62, font: KAI, color: '#5a3a1a', weight: 700 }); q.restore(); }
      q.restore();
      if (close < 1) hand(q, 900 + lerp(-40, 40, slide) - 170, 560 + lerp(420, 10, slide) + 60, 1.2, -0.6, 'hold', { sleeve: '#c8a8b8', cuff: '#e8d8e0', sleeveLen: 700 });
      else hand(q, 1000, 470 - sin(clamp((lt - 1.9) / 0.1) * PI) * 10, 1.2, -1.4, 'flat', { sleeve: '#c8a8b8', cuff: '#e8d8e0', sleeveLen: 700 });
    });
    glow(g, 1400, 200, 600, '255,210,150', 0.25, 'lighter', false);
  }
  function shotStudyNight(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 119, 2);
    // 慢慢推近：夜里的书房，妈妈背对着我们在台灯下写考察资料；写完停下笔（她的脸始终不入画）
    const cam = fit({ x: 1060 + hh.sx - 40 * s.p, y: 600 + hh.sy, z: 1.3 + 0.1 * easeS(s.p) }, 0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'room-study:night');
      momAtDesk(q, t, lt > 1.1);
    });
    nightGrade(g, [[...scr(cam, 1140, 560), 560, 0.35]], 0.8);
  }
  function shotAtticNight(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 121, 2);
    const cam = fit({ x: 700 + hh.sx, y: 560 + hh.sy, z: 1.25 + 0.06 * s.p }, 0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'room-attic:night');
      shaft(q, 960, 330, 0.45, 220, 900, 0.35, '190,210,255');
      const mk = clamp((t - 162.1) / 0.5);
      if (mk > 0 && mk < 1) { q.save(); q.beginPath(); circ(q, 960, 330, 118); q.clip(); const x = 880 + mk * 160, y = 280 + mk * 70; line(q, x, y, x - 60, y - 26, 3, 'rgba(255,255,240,.9)'); glow(q, x, y, 20, '255,250,220', 1); q.restore(); }
      const up2 = t > 162.8;
      who(q, 'sheep-black', { x: 330, y: 718, h: 190, pose: 'sleep', t, expr: 'content', shadow: false });
      // 坐在床沿上（官方小人），录音机放在身边的床上；看见流星，站起来、抓起录音机蹦了一下
      if (!up2) { who(q, 'adele-child', { x: 520, y: BED_EDGE.y, h: 384, pose: 'sit', seat: BED_EDGE.seat, t, outfit: PJ, shadow: false }); recorder(q, 668, 706, 0.3, { t, rec: 0, spin: 0, shadow: false }); }
      else {
        const A = { x: 600, y: 890, h: 384, pose: 'jump', air: 0.6 * sin(PI * clamp((t - 162.8) / 0.5)), t, outfit: PJ, shadow: false };
        shadow(q, 600, 892, 90, 0.35);
        who(q, 'adele-child', A);
        const [hx, hy] = at(A, 'adele-child', 'hand'); recorder(q, hx, hy + 30, 0.26, { t, rec: 0, spin: 0, shadow: false, strap: false });
      }
      if (t > 162.2) sparkle(q, 640, 300, 44, clamp(1 - (t - 162.2) / 0.6), t * 2);
    });
    nightGrade(g, [[1500, 560, 500, 0.25]], 0.7);
  }
  function shotRecClick(g, s) {
    const t = s.t, lt = s.lt;
    sky(g, s, 'night');
    s.kit.stars(g, t, { n: 90, seed: 23, h: 700, size: 2.2 });
    g.save(); g.translate(0, 700); g.rotate(-0.08);
    for (let r = 0; r < 6; r++) for (let c = -1; c < 14; c++) { g.beginPath(); g.arc(c * 150 + (r % 2) * 75, r * 70, 76, 0, PI); fs(g, r % 2 ? '#5a3a44' : '#4e3440', 3, 'rgba(20,10,20,.6)'); }
    g.restore();
    const press = up(t, 164.1, 164.25, easeO) * (1 - up(t, 164.6, 164.7)), on = t > 164.25;
    const a = max(0, t - 164.25), rev = 0.5 * a;
    recorder(g, 960, 860, 2.0, { t: rev, spin: 1, rec: on ? 1 : 0, key: t > 164.2 && t < 164.7 ? 'rec' : null });
    hand(g, 960 - 150 * 2 + 20 * 2, 860 - 184 * 2 - 40 + press * 24 - (1 - up(t, 163.8, 164.1, easeO)) * 220 + up(t, 164.6, 165.3) * 260, 1.2, PI / 2 + 0.25, 'point', { sleeve: '#bcd8f0', cuff: '#eaf4fc', sleeveLen: 700 });
    glow(g, 960, 300, 700, '170,190,255', 0.15, 'lighter', false);
  }

  /* ---------- 48–56 屋顶：流星雨、星座、灯笼、许愿、一家人、外套、睡着 ---------- */
  function roofScene(g, s, cam, o = {}) {
    s.layer(g, cam, 0.08, (q) => { img(q, s, 'night-sky', -60, -60, VW + 120, VH + 120); s.kit.stars(q, s.t, { n: 60, seed: 181, h: 700, size: 2.6, tw: 0.8 }); });
    if (o.dawn > 0) s.layer(g, cam, 0.08, (q) => { q.globalAlpha = o.dawn; q.fillStyle = lg(q, 0, 300, 0, 1080, [[0, 'rgba(120,110,190,0)'], [0.6, 'rgba(230,150,160,.8)'], [1, 'rgba(255,200,160,1)']]); q.fillRect(-60, 300, VW + 120, 900); q.globalAlpha = 1; });
    if (o.sky) o.sky(g);
    s.layer(g, cam, 0.5, (q) => { img(q, s, 'rooftops', -240, 40, 2400, 1080); townTwinkle(q, s.t); });
    // 远处城里的灯：失焦的光斑（后期工具箱），在对面屋顶的后面
    const F = E.finish;
    if (F && F.enabled) F.bokeh(g, s, { n: 14, seed: 11, a: 0.3, colors: ['255,206,140', '255,180,120', '210,220,255'], depth: [0, 0.6], size: [16, 64], rect: [-40, 380, VW + 80, 380], cam, parallax: 0.5, drift: [5, -2], twinkle: 0.45 });
    if (o.mid) s.layer(g, cam, 0.5, o.mid);
    s.layer(g, cam, 1, (q) => { img(q, s, 'roof-fg'); glow(q, 340, 700, 260, '255,190,110', 0.45); if (o.fg) o.fg(q); });
  }
  const PJ = 'pajama', MOON = '190,205,255';
  const UF = 440; // 屋顶近景里“爸爸的身高”
  /** 前景屋顶的屋脊（roof-fg 里屋脊盖瓦的上沿） */
  const ridgeY = (x) => 792 - (x + 40) * 0.02;
  /** 坐在屋脊上（官方小人的坐姿：臀部在屋脊上，两条小腿垂在朝我们这一面的瓦上） */
  const onRidge = (x, h) => { const S = 0.22 * h + 2; return { x, y: ridgeY(x) + S, seat: S, pose: 'sit' }; };
  /**
   * 妈妈的米白外套披在坐着的她身上（正面、近景；o = 她的 who() 选项，官方小人的坐姿）。
   * part 'back'：身后那一片（先画，从她头顶上方落下来 drop 像素）；'front'：两片前襟从肩头垂到腿上（后画，k 0→1 从上往下展开）
   */
  function drapedCoat(q, o, part, k = 1, drop = 0) {
    const h = o.h, cx = o.x + (o.flip ? 1 : -1) * 0.02 * h, sy = o.y - o.seat, sh = sy - 0.3 * h;
    const lw = max(2, h * 0.006);
    q.save(); q.translate(cx, sh - drop); q.scale(h / 100, h / 100); q.lineJoin = 'round';
    const L = lw * 100 / h;
    // 月光下的米白：偏冷、偏暗一点（白天那件是 #f3ecdf）
    if (part === 'back') {
      // 身后：肩膀比她宽一点、两只空袖子垂在两边（被她的头发和身子挡住大半，只露出一圈边）
      q.beginPath(); q.moveTo(-11, -3); q.quadraticCurveTo(-23, -5, -28, 3); q.quadraticCurveTo(-32, 15, -33, 27); q.quadraticCurveTo(0, 31, 33, 27); q.quadraticCurveTo(32, 15, 28, 3); q.quadraticCurveTo(23, -5, 11, -3); q.quadraticCurveTo(0, -8, -11, -3); q.closePath();
      fs(q, lg(q, 0, -6, 0, 30, [[0, '#d9d4df'], [1, '#9c96ad']]), L);
      for (const sx of [-1, 1]) {
        q.beginPath(); q.moveTo(sx * 27, 4); q.quadraticCurveTo(sx * 33.5, 13, sx * 34, 25); q.lineTo(sx * 29, 25.5); q.quadraticCurveTo(sx * 29, 15, sx * 24, 7); q.closePath(); fs(q, '#b5afc2', L);
        q.fillStyle = '#c54a44'; q.beginPath(); q.moveTo(sx * 29.2, 22); q.lineTo(sx * 33.9, 21.6); q.lineTo(sx * 34, 23.4); q.lineTo(sx * 29.1, 23.8); q.closePath(); q.fill();
      }
    } else if (k > 0) {
      q.beginPath(); q.rect(-50, -12, 100, 12 + 42 * k); q.clip();
      for (const sx of [-1, 1]) {
        // 前襟：从领口经过肩头垂下来，下摆微微张开；盖住她两侧的头发和手，中间敞开露出脸、胸前和腿
        q.beginPath(); q.moveTo(sx * 10, -1.5); q.quadraticCurveTo(sx * 22, -4, sx * 27, 3); q.quadraticCurveTo(sx * 31.5, 14, sx * 32, 26.5);
        q.quadraticCurveTo(sx * 26, 30.5, sx * 19, 29.5); q.quadraticCurveTo(sx * 15, 15, sx * 11, 5); q.closePath();
        fs(q, lg(q, sx * 11, 0, sx * 32, 0, [[0, '#ebe7ee'], [0.55, '#cdc7d6'], [1, '#a59eb4']]), L);
        // 两道衣褶、翻领、红系带垂在前襟里边、下摆的红条
        q.strokeStyle = 'rgba(40,30,60,.2)'; q.lineWidth = L * 1.1; q.lineCap = 'round';
        q.beginPath(); q.moveTo(sx * 21, 7); q.quadraticCurveTo(sx * 25, 17, sx * 24, 28.5); q.stroke();
        q.beginPath(); q.moveTo(sx * 15.5, 12); q.quadraticCurveTo(sx * 17.5, 20, sx * 18.5, 28); q.stroke();
        q.beginPath(); q.moveTo(sx * 10, -1.5); q.lineTo(sx * 19, -2.6); q.lineTo(sx * 13, 8.5); q.closePath(); fs(q, '#f2eff5', L * 0.8);
        q.strokeStyle = '#c54a44'; q.lineWidth = L * 1.1; q.beginPath(); q.moveTo(sx * 15, 13); q.quadraticCurveTo(sx * 12.5, 18, sx * 14.5, 23); q.stroke();
        q.strokeStyle = 'rgba(197,74,68,.85)'; q.lineWidth = L * 1.4; q.beginPath(); q.moveTo(sx * 20, 28.2); q.quadraticCurveTo(sx * 26, 29.2, sx * 31.6, 25.4); q.stroke();
      }
    }
    q.restore();
  }
  /** 剪影里披着的外套：她背后多出来的一片（同一个剪影颜色） */
  function coatSil(q, A, col) {
    const C = E.cast, P = C && C.anchors ? C.anchors('adele-child', A) : null;
    if (!P || !P.chest || !P.head) return;
    const h = A.h, nx = lerp(P.chest[0], P.head[0], 0.35), ny = lerp(P.chest[1], P.head[1], 0.35);
    q.save(); q.beginPath(); q.moveTo(nx - 0.16 * h, ny + 0.03 * h); q.quadraticCurveTo(nx, ny - 0.05 * h, nx + 0.16 * h, ny + 0.03 * h);
    q.lineTo(A.x + 0.24 * h, A.y); q.lineTo(A.x - 0.24 * h, A.y); q.closePath(); q.fillStyle = col; q.fill(); q.restore();
  }
  /** 近景里我们这边的屋顶（矢量，放大也清楚）：屋脊上沿在 RY，往镜头这边是一排排鳞片瓦 */
  function closeRoof(q, RY, k) {
    q.fillStyle = lg(q, 0, RY, 0, VH + 40, [[0, '#23254c'], [1, '#12132a']]); q.fillRect(-120, RY, VW + 240, VH - RY + 160);
    for (let r = 0; r < 6; r++) for (let c = -2; c < 2 + VW / (130 * k); c++) {
      const x = c * 130 * k + (r % 2) * 65 * k, y = RY + 20 * k + r * 58 * k;
      q.beginPath(); q.arc(x, y, 66 * k, 0, PI); fs(q, r % 2 ? '#262953' : '#21234a', 2.5, 'rgba(8,8,24,.55)');
      q.strokeStyle = 'rgba(190,205,255,.1)'; q.lineWidth = 2; q.beginPath(); q.arc(x, y, 60 * k, 0.2, PI - 0.2); q.stroke();
    }
    q.beginPath(); rrect(q, -140, RY - 16 * k, VW + 280, 34 * k, 14 * k); fs(q, '#2f3266', 3, 'rgba(8,8,24,.6)');
    line(q, -140, RY - 12 * k, VW + 140, RY - 12 * k, 2.5, 'rgba(190,205,255,.35)');
  }
  /** 近景的背景：夜空 + 远处的屋顶（景深外，模糊一次缓存） */
  function roofCloseBg(g, s, hh, lowY = 300) {
    const bg = (q) => { img(q, s, 'night-sky', -100, -200, VW + 200, VH + 200); img(q, s, 'rooftops', -240, lowY, 2400, 1080); };
    const F = E.finish;
    if (F && F.enabled) {
      F.dof(g, s, 'bs-roofclose-bg', bg, { radius: 7, opaque: true, x: -hh.sx * 0.3, y: -hh.sy * 0.3 });
      F.bokeh(g, s, { n: 12, seed: 31, a: 0.34, colors: ['255,206,140', '255,180,120', '210,220,255'], depth: [0.2, 0.7], size: [24, 80], rect: [-40, lowY + 330, VW + 80, 260], parallax: 0.3, drift: [4, -2], twinkle: 0.45 });
    } else bg(g);
  }
  function shotRoof(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 183, 3);
    const cam = fit({ x: 960 + hh.sx, y: 520 + hh.sy - 20 * s.p, z: 1.03 + 0.03 * s.p }, 0, 0, VW, VH);
    roofScene(g, s, cam, { sky: (q) => meteors(q, t, B(82), B(84), 1.6), fg: (q) => {
      const ha = HT('adele-child', UF);
      who(q, 'adele-child', Object.assign(onRidge(880, ha), { h: ha, t, outfit: PJ, rim: MOON, shadow: false }));
      who(q, 'sheep-black', { x: 1060, y: ridgeY(1060) + 4, h: HT('sheep-black', UF), pose: 'sit', t, rim: MOON });
      recorder(q, 985, ridgeY(985) + 3, 0.15, { t, rec: 1, spin: 0.5, shadow: false });
    } });
    const a = t - B(82);
    if (a >= 0 && a < 1.2) { const x = 300 + a * 1100, y = 120 + a * 380; g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = lg(g, x, y, x - 330, y - 115, [[0, 'rgba(255,250,235,1)'], [1, 'rgba(180,200,255,0)']]); g.lineWidth = 6; g.lineCap = 'round'; g.globalAlpha = sin(PI * a / 1.2); g.beginPath(); g.moveTo(x, y); g.lineTo(x - 330, y - 115); g.stroke(); g.restore(); glow(g, x, y, 40, '255,250,230', sin(PI * a / 1.2)); }
  }
  function shotMeteors(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 185, 3);
    const cam = fit({ x: 900 + hh.sx, y: 560 + hh.sy, z: 1.5 + 0.05 * s.p }, 0, 0, VW, VH);
    roofScene(g, s, cam, { fg: (q) => {
      // 坐在屋脊上（官方小人），录音机立在身边的屋脊上，红灯亮着，把流星也录进去
      const ha = HT('adele-child', UF);
      who(q, 'adele-child', Object.assign(onRidge(880, ha), { h: ha, t, outfit: PJ, rim: MOON, shadow: false }));
      const rx = 975, ry = ridgeY(975) + 3;
      recorder(q, rx, ry, 0.16, { t, rec: 1, spin: 0.6, shadow: false, key: 'rec' });
      q.save(); q.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 3; j++) { const ph = (t * 0.7 + j / 3) % 1; q.globalAlpha = 0.4 * sin(PI * ph); q.strokeStyle = '#dfe6ff'; q.lineWidth = 3; q.beginPath(); q.arc(rx - 22, ry - 20, 18 + (1 - ph) * 150, -PI * 0.9, -PI * 0.35); q.stroke(); }
      q.restore();
      who(q, 'sheep-black', { x: 1060, y: ridgeY(1060) + 4, h: HT('sheep-black', UF), pose: 'look-up', t, rim: MOON, expr: 'laugh' });
    } });
    meteors(g, t, B(84), B(86), 5.5);
    s.kit.particles(g, t, 'sparkle', { n: 16, seed: 186, rgb: '220,230,255' });
  }
  function shotConstel(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 187, 2);
    g.save(); g.translate(hh.sx, hh.sy);
    // 夜空慢慢往上摇：贴图四边都留出余量，摇到最后画面下沿也不会露出空白
    const z = 1.12 + 0.05 * s.p, sw = VW * z + 80, sh2 = VH * z + 160;
    g.drawImage(lay(s, 'night-sky'), 960 - sw / 2, 480 - 540 * z - 60 * s.p - 20, sw, sh2);
    s.kit.stars(g, t, { n: 70, seed: 188, h: 1000, size: 2.8, tw: 0.9 });
    constellation(g, t, 'volcano', 500, 520, 1.25, (lt - 0.1) / 1.5);
    constellation(g, t, 'sheep', 1080, 330, 1.25, (lt - 1.2) / 1.5);
    constellation(g, t, 'family', 1480, 610, 1.1, (lt - 2.3) / 1.4);
    g.restore();
    meteors(g, t, B(86), B(88), 2.2);
  }
  function shotLanterns(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 189, 3);
    const cam = fit({ x: 1100 + hh.sx, y: 560 + hh.sy, z: 1.2 }, 0, 0, VW, VH);
    roofScene(g, s, cam, { mid: (q) => {
      // 对面那栋房子的屋顶平台（比我们的屋脊远、高出一截）：莉瑟和芳汀提着灯笼站在栏杆后面。
      // 平台在烟囱的左边（不会被前景的烟囱挡住），栏杆挡住她们的脚：看得出是站在另一栋房子上
      const TY = 700;
      q.beginPath(); q.rect(1040, TY + 4, 420, 300); fs(q, '#262a56', 3, '#10122a');
      q.fillStyle = 'rgba(160,170,230,.12)'; q.fillRect(1040, TY + 4, 420, 6);
      // 芳汀（官方小人）朝这边抬手打招呼；两盏纸灯笼挂在栏杆上，暖光照着他
      glow(q, 1250, TY - 70, 260, '255,190,110', 0.35 + 0.05 * sin(t * 5));
      who(q, 'fontaine', { x: 1250, y: TY, h: 222, pose: 'wave', t, rim: '255,200,130', flip: true, shadow: false });
      q.lineCap = 'round';
      for (let x = 1050; x <= 1450; x += 28) line(q, x, TY + 6, x, TY - 36, 5, '#1a1c3e');
      line(q, 1040, TY - 38, 1460, TY - 38, 7, '#1a1c3e'); line(q, 1040, TY - 40, 1460, TY - 40, 2, 'rgba(255,200,140,.35)');
      for (const [lx, ph] of [[1118, 0], [1402, 1.7]]) {
        q.save(); q.translate(lx, TY - 38); q.rotate(0.08 * sin(t * 2.3 + ph)); line(q, 0, 0, 0, 26, 2, '#1a1c3e'); lantern(q, 0, 60, 0.62, t, 1); q.restore();
      }
    }, fg: (q) => {
      const ha = HT('adele-child', UF);
      who(q, 'adele-child', Object.assign(onRidge(880, ha), { h: ha, t, outfit: PJ, rim: MOON, shadow: false }));
      who(q, 'sheep-black', { x: 740, y: ridgeY(740) + 4, h: HT('sheep-black', UF), pose: 'stand', t, rim: MOON });
    } });
    meteors(g, t, B(88), B(89), 2);
  }
  function shotWish(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 193, 1.5);
    // 中近景：她坐在屋脊上（官方小人），一颗大流星从她头顶上方划过去；背景的夜空和远处屋顶在景深外
    roofCloseBg(g, s, hh, 330);
    s.kit.stars(g, t, { n: 50, seed: 191, h: 700, size: 2.6, tw: 0.6 });
    const k = clamp(lt / 1.95), mx = 200 + k * 1500, my = 140 + k * 260;
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = lg(g, mx, my, mx - 600, my - 104, [[0, 'rgba(255,250,235,.95)'], [1, 'rgba(180,200,255,0)']]); g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx - 600, my - 104); g.stroke(); g.restore();
    glow(g, mx, my, 70, '255,250,230', 1);
    s.layer(g, { x: 960, y: 540, z: 1 + 0.05 * easeS(s.p), sx: hh.sx, sy: hh.sy }, 1, (q) => {
      const RY = 905, H = 760, S = 0.22 * H + 2;
      closeRoof(q, RY, 1.5);
      who(q, 'adele-child', { x: 860, y: RY + S, seat: S, pose: 'sit', h: H, t, outfit: PJ, rim: MOON, rimW: 1.2, shadow: false });
    });
    glow(g, mx * 0.3 + 672, 500, 700, '200,215,255', 0.18 * sin(PI * k), 'lighter', false);
  }
  function shotDormer(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 195, 3);
    const cam = fit({ x: 700 + hh.sx, y: 620 + hh.sy, z: 1.3 }, 0, 0, VW, VH);
    roofScene(g, s, cam, { fg: (q) => {
      // 老虎窗亮着：爸爸妈妈从窗里探出来——窗里的灯在他们身后，只看得见两个逆光的剪影
      const pk = up(lt, 0.2, 0.8, easeO), pm = up(lt, 0.9, 1.5, easeO);
      q.save(); q.beginPath(); rrect(q, 254, 624, 172, 162, 8); q.clip();
      who(q, 'magna', Object.assign({ x: 330, y: 1180 - pm * 280, h: 420, pose: 'stand', t, outfit: 'home', shadow: false }, PSIL('255,200,130')));
      who(q, 'katia', Object.assign({ x: 345, y: 1190 - pk * 300, h: 440, pose: 'wave', t, outfit: 'suit', shadow: false }, PSIL('255,200,130')));
      q.restore();
      const ha = HT('adele-child', UF);
      who(q, 'adele-child', Object.assign(onRidge(880, ha), { h: ha, t, outfit: PJ, flip: true, rim: MOON, shadow: false }));
      who(q, 'sheep-black', { x: 1060, y: ridgeY(1060) + 4, h: HT('sheep-black', UF), pose: 'sit', t, rim: MOON });
    } });
    meteors(g, t, B(90), B(91), 5);
  }
  /** 从背后看的一家三口（坐在屋脊上看流星）：月光逆光里三个剪影 */
  function familyOnRoof(q, t, o = {}) {
    // 腿垂在屋脊另一边（看不见）：剪影在屋脊上沿截住
    const S = PSIL(MOON, '#1b1a38');
    q.save(); q.beginPath(); q.moveTo(-200, -400); q.lineTo(2200, -400); q.lineTo(2200, ridgeY(2200) + 2); q.lineTo(-200, ridgeY(-200) + 2); q.closePath(); q.clip();
    who(q, 'katia', Object.assign({ x: 760, y: ridgeY(760) + 8, h: UF, pose: 'sit-ground', view: 'back3', t, outfit: 'suit', shadow: false }, S));
    const A = Object.assign({ x: 930, y: ridgeY(930) + 8, h: HT('adele-child', UF), pose: 'sit-ground', view: 'back3', rot: o.lean || 0, t, outfit: PJ, shadow: false }, S);
    who(q, 'adele-child', A);
    if (o.coat) coatSil(q, A, S.sil);
    who(q, 'magna', Object.assign({ x: 1090, y: ridgeY(1090) + 8, h: HT('magna', UF), pose: 'sit-ground', view: 'back3', t, outfit: 'home', flip: true, shadow: false }, S));
    q.restore();
    who(q, 'sheep-black', { x: 1230, y: ridgeY(1230) + 4, h: HT('sheep-black', UF), pose: 'sleep', t, sil: S.sil, rim: MOON, shadow: false });
    return A;
  }
  function shotFamilyRoof(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 197, 2);
    const cam = fit({ x: 960 + hh.sx, y: 470 + hh.sy - 30 * s.p, z: 1.04 + 0.05 * s.p }, 0, 0, VW, VH);
    roofScene(g, s, cam, { sky: (q) => meteors(q, t, B(91), B(93), 7), fg: (q) => familyOnRoof(q, t) });
    s.kit.particles(g, t, 'sparkle', { n: 18, seed: 198, rgb: '220,230,255' });
  }
  function shotCoat(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 199, 2);
    // 近景：妈妈站在她身后（画外），两只手提着外套从上面落下来、披到她肩上，前襟垂下来；手松开、收回画外
    roofCloseBg(g, s, hh, 330);
    s.kit.stars(g, t, { n: 40, seed: 199, h: 600, size: 2.4, tw: 0.6 });
    meteors(g, t, B(93), B(95), 4);
    const ck = easeO(clamp((lt - 0.1) / 1.0)), drop = (1 - ck) * 900, fk = up(lt, 0.95, 1.4, easeO), rel = up(lt, 1.45, 2.3, ease.in);
    s.layer(g, { x: 960, y: 540, z: 1 + 0.04 * easeS(s.p), sx: hh.sx, sy: hh.sy }, 1, (q) => {
      const RY = 890, H = 640, S = 0.22 * H + 2;
      closeRoof(q, RY, 1.3);
      const A = { x: 900, y: RY + S, seat: S, pose: 'sit', h: H, t, outfit: PJ, rim: MOON, shadow: false };
      who(q, 'sheep-black', { x: 1330, y: RY + 6, h: 360, pose: 'sleep', t, rim: MOON });
      drapedCoat(q, A, 'back', 1, drop);
      // 妈妈的两只手：抓着外套的两个肩角（在她身后，先画），袖子伸出画面上沿
      const cx = A.x - 0.02 * H, sh = A.y - S - 0.3 * H - drop;
      for (const sx of [-1, 1]) {
        // 左手从左上方伸进来、右手从右上方（手指朝下、扣住外套的肩角）
        const ang = PI / 2 + sx * 0.36, s2 = 0.8, gx = cx + sx * 0.28 * H, gy = sh + 0.01 * H;
        hand(q, gx - cos(ang) * 58 * s2 + sx * rel * 80, gy - sin(ang) * 58 * s2 - rel * 760, s2, ang, 'hold', { sleeve: '#45375c', cuff: '#392d4e', sleeveLen: 1000, flip: sx > 0 });
      }
      who(q, 'adele-child', A);
      drapedCoat(q, A, 'front', fk);
    });
  }
  function shotSleepRoof(g, s) {
    const t = s.t, lt = s.lt;
    const dawn = up(t, 193.2, 195.8);
    const hh = hand0(s, 201, 2);
    const cam = fit({ x: 960 + hh.sx, y: 500 + hh.sy, z: 1.08 - 0.06 * s.p }, 0, 0, VW, VH);
    roofScene(g, s, cam, { dawn, sky: (q) => meteors(q, t, B(95), B(97), 1.2 * (1 - dawn)), fg: (q) => {
      const A = familyOnRoof(q, t, { coat: 1, lean: -0.22 });
      recorder(q, 1010, 794, 0.15, { t, rec: 1, spin: 0.5, shadow: false });
      const [hx, hy] = at(A, 'adele-child', 'top'); zzz(q, hx + 30, hy, t, 0.8);
    } });
  }

  /* ---------- 57–60 黎明：门口 → 拥抱 → 他们走向日出 ---------- */
  const DAWN_RIM = '255,196,150';
  function shotDawnDoor(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 203, 2);
    const cam = fit({ x: HOME_DOOR + 160 + hh.sx, y: 560 + hh.sy, z: 1.12 + 0.03 * s.p }, -1e5, -1e5, 1e5, 1320);
    sky(g, s, 'dawn2');
    glow(g, 1700, 700, 600, '255,190,150', 0.5, 'lighter', false);
    streetScene(g, s, cam, 'dawn2', { mid: (q) => {
      homeDoorOpen(q, 1, 0.55);
      glow(q, HOME_DOOR, GY - 100, 200, '255,200,130', 0.6);
      // 爸爸妈妈走出门口几步、停下回头：朝着日出走，逆光里只是两个剪影；步子跟着走过的路程（放慢时步子也放慢）
      const out = up(lt, 0.2, 1.4, easeO), PS = PSIL(DAWN_RIM, '#4a2e4c');
      // 他们身后（街的那一头）是日出的逆光
      q.save(); q.globalCompositeOperation = 'lighter'; glow(q, HOME_DOOR + 480, SY - 260, 560, '255,206,160', 0.5); q.restore();
      const K = Object.assign({ x: HOME_DOOR + 110 + out * 280, y: SY, h: US, pose: out < 1 ? 'walk' : 'stand', t, outfit: 'field', prop: ['backpack', 'hammer'] }, PS);
      const M = Object.assign({ x: HOME_DOOR + 50 + out * 190, y: SY + 4, h: HT('magna', US), pose: out < 1 ? 'walk' : 'stand', t, outfit: 'field', prop: 'backpack' }, PS);
      who(q, 'katia', Object.assign(K, out < 1 ? stride('katia', { h: K.h, pose: 'walk', t }, out * 280) : {}));
      who(q, 'magna', Object.assign(M, out < 1 ? stride('magna', { h: M.h, pose: 'walk', t }, out * 190) : {}));
      who(q, 'sheep-black', { x: HOME_DOOR - 110, y: GY + 12, h: HT('sheep-black', US), pose: 'sit', t, expr: 'sleepy' });
      // 她站在门口（官方小人），门里的灯从背后照过来
      who(q, 'adele-child', { x: HOME_DOOR - 10, y: GY + 8, h: HT('adele-child', US), pose: 'stand', t, outfit: PJ, rim: DAWN_RIM });
    } });
    // 前景的路灯放在画面两边，别挡住门口的一家人
    s.layer(g, cam, 1.3, (q) => { const o = (cam.x - 960) * 1.3 + 960; for (const sx of [-760, 780]) lampPost(q, o + sx / cam.z, 1110, 1.3, 1); });
  }
  function shotHug(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 205, 2);
    // 背景：家门口的街，景深外（预先模糊一次、缓存）；前景的三个人清晰
    const bg = (q) => { sky(q, s, 'dawn2'); streetScene(q, s, { x: HOME_DOOR + 700, y: 420, z: 0.75 }, 'dawn2'); };
    const F = E.finish;
    if (F && F.enabled) F.dof(g, s, 'bs-hug-bg', bg, { radius: 9, opaque: true, x: -hh.sx * 0.3, y: -hh.sy * 0.3 }); else bg(g);
    s.post.fill(g, '#f0c0b8', 0.3);
    glow(g, 1750, 560, 700, '255,190,140', 0.7, 'lighter', false);
    const U = 640, Y = 1010;
    s.layer(g, { x: 960, y: 540, z: 1 + 0.04 * s.p, sx: hh.sx, sy: hh.sy }, 1, (q) => {
      // 逆光里的一张剪影：妈妈跪下来把她搂进怀里（两个头挨着），爸爸弯腰把手搭在妈妈肩上。
      // 三个人都只剩轮廓和一圈暖色的边光（父母不露脸）
      const PS = Object.assign(PSIL(DAWN_RIM, '#3a2238'), { rimW: 1.3 });
      const HM = HT('magna', U), mx = 1080, ax = mx - 0.2 * HM, kx = mx + 0.36 * HM;
      q.save(); q.globalCompositeOperation = 'lighter'; glow(q, mx - 40, Y - 330, 520, '255,214,176', 0.55); q.restore();
      who(q, 'katia', Object.assign({ x: kx, y: Y, h: U, pose: 'reach', aim: -0.55, t, outfit: 'field', prop: 'backpack', flip: true, shadow: false }, PS));
      const M = Object.assign({ x: mx, y: Y, h: HM, pose: 'kneel2', arms: 'hug', t, outfit: 'field', flip: true, shadow: false }, PS);
      who(q, 'magna', M);
      who(q, 'adele-child', Object.assign({ x: ax, y: Y, h: HT('adele-child', U), pose: 'stand', flip: true, t, outfit: PJ, shadow: false }, PS));
      // 妈妈的两只手臂环在她背上：把妈妈手臂那一段再画一遍，盖在她身上
      q.save(); q.beginPath(); q.rect(mx - 0.24 * HM, Y - 0.27 * HM, 0.27 * HM, 0.12 * HM); q.clip(); who(q, 'magna', M); q.restore();
    });
    s.post.leak(g, t, { x: 1900, y: 540, r: 900, rgb: '255,170,120', a: 0.45 });
  }
  /** 走向日出的两个人（在右侧人行道，越走越小） */
  function walkers(q, t, Z, o = {}) {
    // 远的先画（妈妈 dz = 0.3 在后面）
    for (const [X, Hh, name, dz] of [[2.7, 1.7, 'magna', 0.3], [3.3, 1.8, 'katia', 0]]) {
      const zz = Z + dz, [x, y] = dp(X - (zz - 4) * 0.08, DP.gy, zz);
      const turn = o.turn && name === 'magna', wave = o.wave && name === 'katia';
      // 步子跟着往远处走过的距离（世界单位）：不在回头 / 挥手的时候“站着滑走”——回头、挥手都是边走边做
      const C = E.cast, g100 = C && C.gait ? C.gait(name, { h: 100, pose: 'walk', yaw: PI / 2 }).speed : 0;
      const sp = g100 > 0 && o.dist != null ? max(1e-4, o.dist) / ((g100 / 100) * Hh * max(0.01, t)) : 1;
      who(q, name, { x, y, h: DP.f * Hh / zz, pose: 'walk-away', arms: wave ? 'wave2' : undefined, headPose: turn ? 'turn' : undefined, turn: 1, view: wave || turn ? 'back3' : undefined, speed: sp, t, outfit: 'field', prop: name === 'katia' ? ['backpack', 'hammer'] : 'backpack', expr: 'smile', sil: o.sil, rim: DAWN_RIM, shadow: false, alpha: o.alpha });
    }
  }
  function shotWalkAway(g, s) {
    const t = s.t, lt = s.lt;
    const sunY = lerp(640, 590, s.p);
    sky(g, s, 'dawn2');
    glow(g, DP.vx, sunY, 700, '255,190,140', 0.8, 'lighter', false);
    g.beginPath(); circ(g, DP.vx, sunY, 70); g.fillStyle = 'rgba(255,240,210,.95)'; g.fill();
    const hh = hand0(s, 207, 2);
    const cam = fit({ x: 960 + hh.sx, y: 540 + hh.sy, z: 1.03 + 0.04 * s.p }, 0, 0, VW, VH);
    const wave = t > 205.72 && t < 207.3;
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'street-persp');
      streetLampsGlow(q, t, 0.7);
      // 匀速地走远（每秒 1.3 个单位 ≈ 大步走；原来中段一下子快到 4.7，腿跟不上），下一个镜头从 9.4 接着走
      const WZ = 4.2 + 1.3 * lt;
      walkers(q, t, WZ, { turn: wave, wave, sil: '#4a3050', dist: WZ - 4.2 });
      const [ax, ay] = dp(-1.9, DP.gy, 2.4);
      who(q, 'sheep-black', { x: ax - 210, y: ay + 6, h: 200, pose: 'sit', t, sil: '#3a2440', rim: DAWN_RIM, shadow: false });
      who(q, 'adele-child', { x: ax, y: ay, h: DP.f * 1.08 / 2.4, pose: 'wave', view: 'back', t, outfit: PJ, sil: '#3a2440', rim: DAWN_RIM, shadow: false });
    });
    s.kit.rays(g, t, { x: DP.vx, y: sunY, n: 12, len: 1500, spread: 3.2, angle: PI / 2, rgb: '255,220,190', alpha: 0.14, seed: 208 });
    flare(g, DP.vx, sunY, 0.55);
  }
  function shotSunrise(g, s) {
    const t = s.t, lt = s.lt;
    const sunY = lerp(590, 470, easeO(s.p));
    sky(g, s, 'dawn2');
    s.post.fill(g, '#ffd8b0', 0.2 + 0.4 * s.p, 'soft-light');
    glow(g, DP.vx, sunY, 900, '255,200,150', 0.9, 'lighter', false);
    g.beginPath(); circ(g, DP.vx, sunY, 80); g.fillStyle = '#fff6e4'; g.fill();
    const cam = fit({ x: 960, y: 540, z: 1.04 + 0.05 * s.p }, 0, 0, VW, VH);
    const wave = t > 209.75;
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'street-persp');
      streetLampsGlow(q, t, 0.5 * (1 - s.p));
      walkers(q, t, 9.4 + lt * 1.3, { wave, turn: wave, sil: '#4a3050', alpha: 1 - up(lt, 2.2, 3.6), dist: 5.2 + lt * 1.3 });
      const [ax, ay] = dp(-1.9, DP.gy, 2.4);
      who(q, 'sheep-black', { x: ax - 210, y: ay + 6, h: 200, pose: 'sit', t, sil: '#3a2440', rim: DAWN_RIM, shadow: false });
      who(q, 'adele-child', { x: ax, y: ay, h: DP.f * 1.08 / 2.4, pose: wave ? 'wave2' : 'stand', view: 'back', t, outfit: PJ, sil: '#3a2440', rim: DAWN_RIM, shadow: false });
    });
    s.kit.rays(g, t, { x: DP.vx, y: sunY, n: 14, len: 1600, spread: 3.4, angle: PI / 2, rgb: '255,230,200', alpha: 0.18 + 0.1 * s.p, seed: 209 });
    flare(g, DP.vx, sunY, 0.7 + 0.3 * s.p);
    s.post.fill(g, '#fffaf0', up(t, 210.6, 211.73, ease.in), 'source-over');
  }
  /* ---------- 61–64 书桌：写标签、放进盒子、磁带停下、片尾 ---------- */
  const rot2 = (x, y, a) => [x * cos(a) - y * sin(a), x * sin(a) + y * cos(a)];
  function shotLabel(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 211, 1.5);
    // 背景：书桌（稍微推近、提亮一点，当作景深外的虚景）
    const cam = fit({ x: 820 + hh.sx * 0.5, y: 560 + hh.sy * 0.5, z: 1.35 }, -140, -110, 2060, 1190);
    s.layer(g, cam, 1, (q) => img(q, s, 'desk-top', -140, -110));
    s.post.fill(g, '#fff0dc', 0.28);
    // 前景：大大的一盘磁带 + 她写标签的手
    const TX = 930 + hh.sx, TY = 560 + hh.sy, TK = 2.5, TR = -0.06;
    const p = clamp((lt - 0.3) / 3.1);
    tape(g, TX, TY, TK, { t, spin: 0, label: p, rot: TR });
    const L = LABEL, lim = L.total * p; let tip = [0, 0];
    for (const st of L.strokes) { if (st.o > lim) break; const upto = lim - st.o; let i = 1; while (i < st.c.length && st.c[i] < upto) i++; tip = [st.p[min(i, st.c.length - 1) * 2], st.p[min(i, st.c.length - 1) * 2 + 1]]; }
    const [lx, ly] = rot2((-96 + tip[0] * 0.285) * TK, (-24 + tip[1] * 0.285) * TK, TR);
    const P = [TX + lx, TY + ly];
    if (p < 1) {
      const a = -2.2, hs = 1.9, [ox, oy] = rot2(171 * hs, -96 * hs, a);
      hand(g, P[0] - ox, P[1] - oy, hs, a, 'pen', { sleeve: '#bcd8f0', cuff: '#eaf4fc', pen: '#2c3e7a', sleeveLen: 900 });
    }
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,230,180,.12)'; g.beginPath(); g.moveTo(300, 0); g.lineTo(1000, 0); g.lineTo(1500, 1080); g.lineTo(700, 1080); g.fill(); g.restore();
    s.post.fill(g, '#fffaf0', 1 - up(lt, 0, 0.9, easeO));
  }
  function shotBox(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 213, 1.5);
    const e = easeIO(clamp((lt - 2) / 1.9));
    const cam = fit({ x: 960 + 110 * e + hh.sx, y: 540 + 76 * e + hh.sy, z: 1.02 + 0.25 * e }, 0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'tin-box');
      const k = easeIO(clamp((lt - 0.2) / 1.3));
      const tx = 960 + 270, ty = lerp(-300, 560 - 190, k);
      tape(q, tx, ty, 1.35 - 0.1 * k, { t, spin: 0, label: 1, rot: lerp(0.4, 0.03, k) });
      // 手捏着磁带的上沿放进去，放好后抬走
      const lift = clamp((lt - 1.5) / 0.4);
      if (lift < 1) hand(q, tx + 20, ty - 190 - lift * 460, 1.7, 1.62, k < 1 ? 'hold' : 'open', { sleeve: '#bcd8f0', cuff: '#eaf4fc', sleeveLen: 900 });
    });
    s.kit.particles(g, t, 'dust', { n: 30, seed: 214, rgb: '255,240,210' });
  }
  function shotReels(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 215, 1.2);
    const cam = fit({ x: 1360 + hh.sx, y: 610 + hh.sy, z: 2.0 + 0.1 * s.p }, 0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'room-attic');
      shaft(q, 960, 330, 0.55, 260, 900, 0.45);
      who(q, 'sheep-black', { x: 1010, y: 714, h: 190, pose: 'sleep', t, expr: 'content', shadow: false });
      zzz(q, 1060, 600, t, 0.8);
      // 转速慢下来，最后停住，录音灯灭（转过的圈数 = 速度的积分，纯函数）
      const T = 3.2, s0 = 0.8, rev = lt < T ? s0 * (lt - (lt * lt) / (2 * T)) : (s0 * T) / 2;
      recorder(q, 1560, 662, 0.62, { t: rev, spin: 1, rec: lt < T ? 1 - (lt / T) * 0.35 : 0, left: 0.04, key: lt < T ? 'rec' : null });
    });
    s.kit.particles(g, t, 'dust', { n: 40, seed: 216, rgb: '255,240,210' });
  }
  function shotEnd(g, s) {
    const t = s.t, lt = s.lt;
    const hh = hand0(s, 217, 2);
    const cam = fit({ x: 980 + hh.sx + lt * 4, y: 560 + hh.sy, z: 1.0 + 0.03 * s.p }, -140, -110, 2060, 1190);
    s.layer(g, cam, 1, (q) => {
      img(q, s, 'desk-top', -140, -110);
      q.save(); q.translate(760, 560); q.rotate(-0.08); tape(q, 0, 0, 1.0, { t, spin: 0, label: 1 }); q.restore();
      q.save(); q.globalCompositeOperation = 'lighter'; q.fillStyle = 'rgba(255,230,180,.14)'; q.beginPath(); q.moveTo(200, -110); q.lineTo(900, -110); q.lineTo(1400, 1200); q.lineTo(600, 1200); q.fill(); q.restore();
    });
    s.kit.particles(g, t, 'dust', { n: 40, seed: 218, rgb: '255,240,210' });
    g.save(); g.globalAlpha = 0.35 * up(lt, 0, 1); g.fillStyle = rg(g, 960, 420, 100, 900, [[0, 'rgba(40,20,20,.55)'], [1, 'rgba(40,20,20,0)']]); g.fillRect(0, 0, VW, VH); g.restore();
    // 片名、制作信息在 overlay 里画（调色之后）：titlesOver
  }

  const ST = (pal, a, b) => { const out = []; for (let i = a; i <= b; i++) out.push(`street:${pal}:${i}`); return out; };
  const SHOTS = [
    { id: 'radio', t0: 0, title: '清晨', uses: ['win-dawn', 'far:dawn', 'sky:predawn', 'sky:dawn', 'bs-brush'], draw: shotRadio },
    { id: 'house', t0: B(3), uses: ['house:day', 'far:morning', 'sky:morning'], draw: (g, s) => shotHouse(g, s, false) },
    { id: 'mirror', t0: B(5), uses: ['room-parents'], draw: shotMirror },
    { id: 'pack', t0: B(6), uses: ['room-study'], draw: shotPack },
    { id: 'attic', t0: B(7), uses: ['room-attic'], draw: shotAttic },
    { id: 'stairs', t0: B(8), uses: ['stairwell'], draw: shotStairs },
    { id: 'kitchen', t0: B(10), uses: ['room-kitchen', 'kitchen-table'], draw: shotKitchen },
    { id: 'door', t0: B(11), title: '上学路', uses: ['sky:morning', 'farw:morning', 'ground:morning', ...ST('morning', 0, 3)], draw: shotDoor },
    { id: 'violin', t0: B(13), uses: ['tram', ...ST('morning', 1, 4)], draw: shotViolin },
    { id: 'clock', t0: B(15), uses: ['clockface'], draw: shotClock },
    { id: 'lookup', t0: B(15) + 1.0, uses: ST('morning', 2, 4), draw: shotLookUp },
    { id: 'run', t0: B(16), uses: ST('morning', 3, 6), draw: shotRun },
    { id: 'feet', t0: B(17), uses: ['cobbles-close', 'street:morning:2', 'street:morning:3'], draw: shotFeet },
    { id: 'sheeprun', t0: B(17) + 0.5, draw: shotSheepRun },
    { id: 'gate', t0: B(17) + 1.0, uses: ['sky:noon', 'farw:noon', 'campus:0', 'campus:1'], draw: shotGate },
    { id: 'steps', t0: B(17) + 1.5, uses: ['campus:1', 'campus:2'], draw: shotSteps },
    { id: 'leap', t0: B(18), uses: ['campus:2'], draw: shotLeap },
    { id: 'bell', t0: B(19), title: '钟声', uses: ['tower-low'], draw: shotBell },
    { id: 'courtyard', t0: B(20), uses: ['campus:0', 'campus:1', 'campus:2', ...COURT_KEYS], draw: shotCourtyard },
    { id: 'hall', t0: B(21), uses: ['hall-wide'], draw: shotHallWide },
    { id: 'chalk', t0: B(23), uses: ['chalkboard'], draw: shotChalk },
    { id: 'notebook', t0: B(24), uses: ['notebook'], draw: shotNotebook },
    { id: 'raise', t0: B(25), uses: ['hall-side'], draw: shotRaise },
    { id: 'rec', t0: B(26), draw: shotRec },
    { id: 'library', t0: B(27), title: '图书馆', uses: ['library'], draw: shotLibrary },
    { id: 'pages', t0: B(29), uses: ['library'], draw: shotPages },
    { id: 'reading', t0: B(31), uses: ['reading', 'reading-fg'], draw: shotReading },
    { id: 'shh', t0: B(33), uses: ['reading', 'reading-fg'], draw: shotReading },
    { id: 'river', t0: B(35), title: '河畔午后', uses: ['sky:noon', 'river-far:afternoon', 'river-near:afternoon'], draw: shotRiver },
    { id: 'popsicle', t0: B(37), draw: shotPopsicle },
    { id: 'grass', t0: B(39), uses: ['grass-top'], draw: shotGrass },
    { id: 'clouds', t0: B(41), uses: ['puff'], draw: shotClouds },
    { id: 'record', t0: B(43), uses: ['river-far:afternoon', 'river-near:afternoon'], draw: shotRecord },
    { id: 'cello', t0: B(45), uses: ['river-far:afternoon', 'river-near:afternoon'], draw: shotCello },
    { id: 'stone', t0: B(47), uses: ['river-far:afternoon', 'river-near:afternoon'], draw: shotStone },
    { id: 'steal', t0: B(49), uses: ['river-far:afternoon', 'river-near:afternoon'], draw: shotSteal },
    { id: 'chase', t0: B(51), title: '追逐', uses: ['sky:golden', 'square'], draw: shotChaseSquare },
    { id: 'market', t0: B(53), uses: ['farw:golden', 'ground:golden', ...ST('golden', 0, 4), 'stalls:0', 'stalls:1', 'stalls:2', 'stalls:3', 'stalls:4'], draw: shotMarket },
    { id: 'steamrun', t0: B(55), uses: ['river-far:golden', 'river-near:golden'], draw: shotSteamRun },
    { id: 'steamfast', t0: B(56), draw: shotSteamFast },
    { id: 'sheepface', t0: B(57), draw: shotSheepFace },
    { id: 'fountain-leap', t0: B(58), uses: ['fountain'], draw: shotFountainLeap },
    { id: 'splash', t0: B(59), uses: ['fountain'], draw: shotSplash },
    { id: 'laugh', t0: B(61), uses: ['fountain'], draw: shotLaugh },
    { id: 'walkhome', t0: B(63), uses: ['sky:sunset', 'river-far:sunset', 'river-near:sunset'], draw: shotWalkHome },
    { id: 'sunset', t0: B(65), uses: ['sky:sunset'], draw: shotSunset },
    { id: 'dusk-house', t0: B(66), title: '晚餐', in: { type: 'fade', dur: 1.2 }, uses: ['sky:dusk', 'far:night', 'house:night'], draw: (g, s) => shotHouse(g, s, true) },
    { id: 'dinner', t0: B(69), uses: ['room-kitchen:night', 'kitchen-table:dinner'], draw: shotDinner },
    { id: 'map', t0: B(71), uses: ['map-top'], draw: shotMap },
    { id: 'promise', t0: B(73), uses: ['room-kitchen:night'], draw: shotPromise },
    { id: 'pinky', t0: B(74), draw: shotPinky },
    { id: 'smile', t0: B(75), uses: ['room-kitchen:night'], draw: shotSmile },
    { id: 'lap', t0: B(76), draw: shotLap },
    { id: 'envelope', t0: B(77), uses: ['desk-night-top'], draw: shotEnvelope },
    { id: 'studynight', t0: B(78), uses: ['room-study:night'], draw: shotStudyNight },
    { id: 'window', t0: B(79), uses: ['room-attic:night'], draw: shotAtticNight },
    { id: 'recclick', t0: B(81), uses: ['sky:night'], draw: shotRecClick },
    { id: 'roof', t0: B(82), title: '流星', uses: ['night-sky', 'rooftops', 'roof-fg'], draw: shotRoof },
    { id: 'meteors', t0: B(84), uses: ['night-sky', 'rooftops', 'roof-fg'], draw: shotMeteors },
    { id: 'constel', t0: B(86), uses: ['night-sky'], draw: shotConstel },
    { id: 'lanterns', t0: B(88), uses: ['night-sky', 'rooftops', 'roof-fg'], draw: shotLanterns },
    { id: 'wish', t0: B(89), uses: ['night-sky', 'rooftops'], draw: shotWish },
    { id: 'dormer', t0: B(90), uses: ['night-sky', 'rooftops', 'roof-fg'], draw: shotDormer },
    { id: 'family-roof', t0: B(91), uses: ['night-sky', 'rooftops', 'roof-fg'], draw: shotFamilyRoof },
    { id: 'coat', t0: B(93), uses: ['night-sky', 'rooftops', 'roof-fg'], draw: shotCoat },
    { id: 'sleep-roof', t0: B(95), uses: ['night-sky', 'rooftops', 'roof-fg'], draw: shotSleepRoof },
    { id: 'dawn-door', t0: B(97), title: '黎明', in: { type: 'fade', dur: 1.5 }, uses: ['sky:dawn2', 'farw:dawn2', 'ground:dawn2', ...ST('dawn2', 0, 1)], draw: shotDawnDoor },
    { id: 'hug', t0: B(99), uses: ST('dawn2', 0, 2), draw: shotHug },
    { id: 'walkaway', t0: B(101), uses: ['street-persp'], draw: shotWalkAway },
    { id: 'sunrise', t0: B(103), uses: ['street-persp'], draw: shotSunrise },
    { id: 'label', t0: B(105), title: '夏天之前', uses: ['desk-top'], draw: shotLabel },
    { id: 'box', t0: B(107), uses: ['tin-box'], draw: shotBox },
    { id: 'reels', t0: B(109), uses: ['room-attic'], draw: shotReels },
    { id: 'end', t0: B(111), in: { type: 'fade', dur: 1.5 }, uses: ['desk-top', 'bs-brush'], draw: shotEnd },
  ];
  /* ---------------- 影片 ---------------- */
  E.film({
    id: 'before-summer',
    title: 'Before Summer',
    audio: 'assets/music/before-summer.mp3',
    meta: {
      no: 'I', cn: '夏天之前', en: 'Before Summer', artists: '塞壬唱片-MSR / Adam Gubman / Matilda Stray', form: 'base', era: '童年 · 莱塔尼亚',
      logline: '出发前的最后一个平凡的日子：清晨的广播、爸爸的课、化在指尖的冰棍、叼走录音机的小黑羊，和屋顶上的流星。',
      synopsis: [
        '莱塔尼亚，威廉大学所在的学院城，六月。十来岁的阿黛尔已经在大学里旁听。明天一早，爸爸妈妈又要出发去乌纳火山考察——和从前的许多次一样。',
        '她差一点在爸爸的课上迟到；在图书馆里，小黑羊顶着一摞书，书页像鸟一样飞了起来。午后的河边，冰棍化在指尖，她第一次用磁带录下身边的声音——直到小黑羊叼走了录音机，一路跑进广场的喷泉。',
        '晚饭时，地图上圈着乌纳火山。爸爸勾着她的小指答应：给她带一块火山的石头回来；妈妈把一封信悄悄夹进了考察资料。那一夜，一家人坐在屋顶上看流星。',
        '黎明，她在门口挥手送他们出发，然后在磁带上写下「Before Summer」，和奖章一起收进盒子。盒子里空着一格。',
      ],
      cast: [
        { who: 'adele-child', o: { outfit: 'school', prop: 'satchel' }, role: '主角 · 十来岁的小学者' },
        { who: 'katia', o: { outfit: 'suit' }, role: '父亲 · 源石技艺学院的教授' },
        { who: 'magna', o: { outfit: 'home' }, role: '母亲 · 自然环境与生态学者' },
        { who: 'fontaine', role: '同一位教授课上的同学' },
        { who: 'liese', o: { prop: 'cello' }, role: '同学（本页原创）' },
        { who: 'sheep-black', o: { heat: 0.6 }, role: '叼走录音机的小黑羊' },
      ],
      poster: 185.5, thumbs: [10.5, 74.5, 122.3], accent: '#ffb35c',
    },    fadeIn: 1.2, fadeOut: 3,
    captions: CAPTIONS,
    shots: SHOTS,
    // 后期工具箱（js/mv/finish.js）：分段调色、辉光、颗粒、景深。没载到时照样能放（退回原来的颗粒 + 暗角）
    needs: ['finish', 'sd'],
    // 官方 Q 版小人（js/mv/sd.js）：童年的阿黛尔 = 艾雅法拉（char_180_amgoat）、芳汀（char_271_spikes）；片头之前预载
    sd: ['char_180_amgoat/build', 'char_271_spikes/build'],
    prepare() { const F = E.finish; if (F) F.warm(['grain', 'paper', 'dust', 'dirt']); },
    /** 播放器切走 / 离得很远时调用：丢掉本片自己的位图缓存（之后用到时再按需重画） */
    release() {
      for (const v of LRU.values()) v.c.width = v.c.height = 1;
      LRU.clear(); lruPx = 0;
      for (const c of SHAFTS.values()) c.width = c.height = 1;
      SHAFTS.clear(); SHADOW = null;
    },
    overlay(g, s) {
      warm(s, SHOTS);
      // ① 成片（调色 + 辉光 + 暗角 + 颗粒）→ ② 宽银幕黑边 → ③ 片名（黑边和字不被调色、不被辉光糊掉）
      const F = E.finish;
      if (F && F.enabled) F.frame(g, s, lookAt(F, s.t)); else overlayFx(g, s);
      s.post.letterbox(g, lbAt(s.t));
      titlesOver(g, s);
    },
  });
  function overlayFx(g, s) {
    s.post.grain(g, s.t, 0.045);
    s.post.vignette(g, 0.4);
  }

  /* ---------------- 成片风格的时间线（每段一个“调子”，参考官方 MV 的分段调色） ----------------
   * 白天：golden-hour（早晨 / 正午淡一些，下午的广场最浓）；桥上落日：siesta-sunset；晚饭的灯下：暖夜；
   * 妈妈夹信：memory-sepia（回忆）；屋顶：night-blue；黎明：dawn；最后的书桌：golden-hour，盒子里空着的那一格带一点 sepia。
   * [开始时间, 风格, 进入时的交叉淡化秒数]：硬切处为 0（调子跟着剪辑一起换），转场处等于转场时长 */
  let LOOKT = null;
  function lookTable(F) {
    if (LOOKT) return LOOKT;
    const L = F.LOOKS;
    // 同一个风格的淡一点的版本：调色强度 k，辉光 / 漏光跟着减弱
    const soft = (name, k, extra) => {
      const b = L[name] || {}, o = Object.assign({}, b, { amount: k });
      if (b.bloom) o.bloom = Object.assign({}, b.bloom, { strength: (b.bloom.strength ?? 0.5) * (0.5 + 0.5 * k) });
      if (b.leak) o.leak = Object.assign({}, b.leak, { a: (b.leak.a ?? 0.25) * k });
      return Object.assign(o, extra || {});
    };
    // 灯下的暖夜（厨房、书房）：人脸保持暖色，灯和烛光发一点光晕
    const warmNight = { bloom: { strength: 0.42, threshold: 0.62, tint: '255,200,150', key: 'rgb', halation: 0.12 }, grade: 'golden-hour', amount: 0.4, vignette: { a: 0.44, rgb: '30,12,6' }, grain: 0.07 };
    const day = (k) => soft('golden-hour', k);
    // 黎明前的窗台：天还没亮透，不要泛白——辉光只给收音机的灯和朝阳，暗部保持深紫
    const preDawn = { bloom: { strength: 0.3, threshold: 0.74, tint: '255,214,190', halation: 0.12 }, grade: 'dawn', amount: 0.42, vignette: { a: 0.42, rgb: '20,10,34' }, grain: 0.06 };
    LOOKT = [
      [0, preDawn, 0],                              // 黎明前的窗台
      [B(3), day(0.45), 0],                         // 早晨的家
      [B(11), day(0.55), 0],                        // 上学路
      [B(19), day(0.45), 0],                        // 钟楼、庭院（正午，天空保持蓝）
      [B(21), day(0.62), 0],                        // 讲堂
      [B(27), day(0.8), 0],                         // 图书馆
      [B(35), day(0.5), 0],                         // 河畔的午后
      [B(51), day(0.85), 0],                        // 广场、集市、追逐（金色）
      [B(58), day(0.7), 0],                         // 喷泉
      [B(63), soft('siesta-sunset', 0.6), 0],       // 回家的路
      [B(65), L['siesta-sunset'], 0],               // 桥上的落日
      [B(66), soft('night-blue', 0.7), 1.2],        // 入夜的房子（淡入转场）
      [B(69), warmNight, 0],                        // 晚饭、地图、约定
      [B(77), soft('memory-sepia', 0.8), 0],        // 妈妈把信夹进资料
      [B(78), warmNight, 0],                        // 书房
      [B(79), soft('night-blue', 0.62), 0],         // 阁楼的窗、按下录音键
      [B(82), soft('night-blue', 0.85), 0],         // 屋顶
      [193.2, soft('dawn', 0.55), 2.6],             // 屋顶上天慢慢亮了
      [B(97), soft('dawn', 0.85), 1.5],             // 黎明的门口（淡入转场）
      [B(105), day(0.5), 0],                        // 写标签
      [B(107), F.mixLook(day(0.5), L['memory-sepia'], 0.35), 0], // 收进盒子
      [B(109), day(0.5), 0],                        // 磁带停下
      [B(111), day(0.6), 1.5],                      // 片尾
    ];
    return LOOKT;
  }
  function lookAt(F, t) {
    const C = lookTable(F);
    let i = 0; while (i + 1 < C.length && C[i + 1][0] <= t) i++;
    const [t0, cur, fd] = C[i];
    if (i === 0 || !(fd > 0)) return cur;
    const k = clamp((t - t0) / fd);
    return k >= 1 ? cur : F.mixLook(C[i - 1][1], cur, easeS(k));
  }
  /** 宽银幕黑边（在调色之后画，保持纯黑）：开场、清晨的房子（收起）、黎明的离别 */
  function lbAt(t) {
    if (t < B(3)) return 1;
    if (t < B(5)) return 1 - up(t - B(3), 0, 0.9, easeIO);
    if (t >= B(97) && t < B(99)) return up(t - B(97), 0, 1.2, easeIO);
    if (t >= B(99) && t < B(103)) return 1;
    if (t >= B(103) && t < B(105)) return 1 - up(t, 210.8, 211.7);
    return 0;
  }
  /** 片名（开场 / 片尾）：画在调色和黑边之后 */
  function titlesOver(g, s) {
    const t = s.t, F = E.finish, fin = F && F.enabled;
    if (t < B(3)) {
      const fade = 1 - up(t, 7.25, 7.75);
      titleCard(g, s, 990, 385, 1.45, 3.776, { fade, beat: s.pulse(7) * up(t, 6.9, 7.1) });
      const ca = up(t, 5.9, 6.7) * fade;
      if (ca > 0) {
        // 中文片名写在下面的宽银幕黑边里（衬线字 + 发丝线 + 小红印），小字在上面的黑边里（不压画面）
        if (fin) F.title(g, s, { text: '夏天之前', style: 'serif', size: 46, y: 1004, t0: 5.9, dur: 1.0, out: 7.25, outDur: 0.5, seal: '夏' });
        else E.text(g, '夏 天 之 前', 960, 1030, { size: 50, weight: 700, color: '#fff4e4', spacing: 20, alpha: ca });
        E.text(g, 'MV · 本页原创', 960, 84, { size: 24, weight: 600, color: '#e8d8c8', spacing: 10, alpha: ca * 0.85, font: 'sans' });
      }
    }
    if (t >= B(111)) {
      // 片尾（这个镜头是淡入的：字跟着一起淡入）
      const fi = easeS(clamp((t - B(111)) / 1.5));
      titleCard(g, s, 1000, 360, 1.45, B(111) + 0.35, { fade: fi, beat: 0 });
      const ca = up(t, 227.3, 228.3);
      if (ca > 0) {
        if (fin) F.title(g, s, { text: '夏天之前', style: 'serif', size: 70, y: 736, t0: 227.3, dur: 1.4, sub: 'I · BEFORE SUMMER', seal: '夏', alpha: fi });
        else E.text(g, '夏 天 之 前', 960, 770, { size: 58, weight: 700, color: '#fff4e4', spacing: 20, alpha: ca * fi, stroke: 'rgba(60,30,30,.45)', strokeW: 8 });
      }
      const cr = up(t, 229.6, 230.8) * fi;
      if (cr > 0) {
        const o = { size: 26, weight: 600, color: '#fff2e2', spacing: 3, alpha: cr, font: 'sans', stroke: 'rgba(40,20,20,.55)', strokeW: 6 }, y0 = fin ? 868 : 846;
        E.text(g, '歌曲　Before Summer — 塞壬唱片-MSR / Adam Gubman / Matilda Stray', 960, y0, o);
        E.text(g, 'MV　本页原创同人影像，与官方无关', 960, y0 + 42, o);
        E.text(g, '角色与世界观 © Hypergryph', 960, y0 + 82, Object.assign({}, o, { alpha: cr * 0.9, size: 24 }));
        E.text(g, (E.sd && E.sd.credit) || 'Q版小人 © Hypergryph（官方 Spine 模型）', 960, y0 + 118, Object.assign({}, o, { alpha: cr * 0.9, size: 24 }));
      }
    }
  }
})();
