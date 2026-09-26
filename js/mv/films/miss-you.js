/* =========================================================
 * 片 III · 想你（Miss You）
 * 纯烬艾雅法拉 EP《Miss You》（塞壬唱片-MSR / Erik Castro / David Lin / 左乙）的本页原创 MV —— 同人作品，与官方无关。
 *
 * 故事（BIBLE §2 III）
 *   地底：一滴熔化的石头落下，更多的岩浆从四面八方的裂缝里流来，汇成同一团火 → 冲上地面
 *   → 晴空下的城市，白灰像雪一样落，红色花瓣；撕纸边的「MISS YOU」
 *   → 罗德岛：录下想留住的声音、读唇、小粉羊偷走冰淇淋；给卡恩前辈和凯勒老师写信，信折成纸鸟飞走；纪录片；
 *     医疗部的担心 —— 生命的分量在深浅
 *   → 乌纳：重建的村子、失去祖父母的小女孩；夜里小羊引路，种下预警花；白天一步一步登上灰色的山坡，父母当年的虚影同行
 *   → 半山腰重读母亲的信 → 头晕、听不见助手的劝，拄杖继续
 *   → 云海之上的山顶：埋下一块小石头；两个花环在无风的山顶自己飞走；她笑了
 *   → 回忆像一颗颗发光的石头汇进胸口 —— 和开头的岩浆呼应
 *   → 最后的副歌是一场“喷发”：不是灾难，是光。熔岩色的极光、白灰与花瓣，灰落下的地方开出花；她和小羊们下山
 *   → 山顶的风录进磁带空着的最后一轨，标签写上「Miss You」。
 *
 * 技术
 *   - 纯函数：画面只由 t 决定（粒子、镜头、动作都从 t 解析地算出来）
 *   - 静态层用本片自带的 LRU 缓存 C(s, key)：按分辨率分开存（舞台 / 预览 / 海报几个渲染器可以同时用），
 *     超出像素预算时淘汰最久没用的；overlay 里每帧提前预热下一个镜头的一张图层；
 *     film.release() 放掉全部缓存（播放器切走时调用），film.prepare() 先按 1280×720 画好开场的图层
 *   - 角色走路用角色库的 gait() 算横向速度（脚底不打滑），步频 STEP_SPD 让一拍正好一步；
 *     光效贴在角色库 anchors() 给的关键点上（胸口、眼睛、手里的东西）
 *   - 不用 shadowBlur / filter；发光用引擎的柔光精灵；prefers-reduced-motion 时抖动、闪白按 RM() 减弱
 *   - 实验页：lab/mv.html?film=miss-you&strip=auto | &t=… | &perf=1
 * ========================================================= */
(() => {
  'use strict';
  const E = window.MVE;
  if (!E) return;
  const { VW, VH, TAU, clamp, lerp, ease, hash, wobble, rng } = E;
  const PI = Math.PI;
  const { sin, cos, abs, min, max, floor, pow, sqrt, hypot, atan2 } = Math;
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const fract = (x) => x - floor(x);

  /* ---------- 小节线（assets/music/miss-you.json 的 downbeats，133.97 BPM） ---------- */
  const DB = [0.896, 2.667, 4.48, 6.272, 8.053, 9.845, 11.637, 13.429, 15.221, 17.013, 18.805, 20.597, 22.389, 24.171, 25.963, 27.755,
    29.557, 31.349, 33.141, 34.912, 36.725, 38.507, 40.299, 42.091, 43.883, 45.664, 47.467, 49.248, 51.051, 52.843, 54.635, 56.405,
    58.208, 60.0, 61.792, 63.563, 65.376, 67.168, 68.96, 70.731, 72.533, 74.325, 76.117, 77.909, 79.701, 81.483, 83.275, 85.067,
    86.859, 88.651, 90.443, 92.235, 94.027, 95.819, 97.611, 99.403, 101.195, 102.987, 104.779, 106.581, 108.363, 110.155, 111.915, 113.739,
    115.52, 117.312, 119.104, 120.875, 122.688, 124.48, 126.272, 128.053, 129.845, 131.637, 133.429, 135.221, 137.013, 138.805, 140.597, 142.389,
    144.181, 145.963, 147.755, 149.547, 151.339, 153.131, 154.923, 156.715, 158.507, 160.299, 162.091, 163.893, 165.675, 167.467, 169.237, 170.976,
    172.843, 174.635, 176.416, 178.219, 180.0, 181.803, 183.595, 185.376, 187.157, 188.949, 190.741, 192.533, 194.325, 196.117, 197.909, 199.701,
    201.493, 203.275, 205.067, 206.859, 208.651, 210.443, 212.235, 214.027, 215.819, 217.611, 219.403, 221.195, 222.987, 224.779, 226.549, 228.352,
    230.144, 231.947];
  const bar = (i) => (i < DB.length ? DB[i] : DB[DB.length - 1] + (i - DB.length + 1) * 1.7913);
  const BEAT = 60 / 133.97;
  /** 减少动态效果（prefers-reduced-motion）：镜头抖动、闪白按这个系数减弱 */
  const RM = (s) => (s.reduced ? 0.15 : 1);
  /** 成片工具箱（js/mv/finish.js，needs 里声明）：有它时由 overlay 里的 F.frame 统一加暗角 / 颗粒 / 调色 */
  const FIN = () => { const F = window.MVE && window.MVE.finish; return F && F.enabled !== false ? F : null; };
  /** 镜头里固定强度的暗角：成片风格已经带了暗角时就不再叠一层 */
  const vigS = (g, s, a) => { if (!FIN()) s.post.vignette(g, a); };
  /** 只给背景这一层调色（例如城市去饱和、只留红色），人物画在它上面、保持原色；没有工具箱时直接画 */
  const gradedBg = (g, s, spec, fn, amount = 1) => { const F = FIN(); if (F && F.graded) F.graded(g, s, spec, fn, { amount }); else fn(g); };
  /** 太阳的眩光：有工具箱时用它的（星芒 + 光环 + 鬼影 + 横向拉丝），否则用本片自己的 */
  function sunFlare(g, s, x, y, a) { const F = FIN(); if (F && F.flare) F.flare(g, s, { x, y, a: a * 0.7, rgb: '255,226,196', size: 0.85, streak: 0.5 }); else flare(g, x, y, a); }

  /* ---------- 角色 ---------- */
  /** 脚下的一团软阴影（让人站在地上，而不是贴在画面上） */
  function groundShadow(g, x, y, w, a, rgb = '40,40,70') {
    if (a <= 0.01) return;
    const spr = shadowSpr(rgb), pa = g.globalAlpha;
    g.globalAlpha = pa * a; g.drawImage(spr, x - w, y - w * 0.16, w * 2, w * 0.32); g.globalAlpha = pa;
  }
  const SH = Object.create(null);
  function shadowSpr(rgb) {
    let c = SH[rgb]; if (c) return c;
    c = E.mk(128, 32); const q = c.getContext('2d');
    q.scale(1, 0.25); const gr = q.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.55, `rgba(${rgb},.55)`); gr.addColorStop(1, `rgba(${rgb},0)`); q.fillStyle = gr; q.fillRect(0, 0, 128, 128);
    return (SH[rgb] = c);
  }
  /**
   * o.shadow（透明度）时先画脚下的影子（自己画，好控制浓淡；不再让角色库重复画）；o.shadowY 让跳起来的羊影子留在地上
   * o.ground：坐 / 跪在地上时，地面以下的部分（垂下来的系带、法杖尾）要被地面挡住 ——
   *   true = 在脚底 o.y 稍下方水平剪裁；数字 = 剪裁线的 y；函数 (x) => y = 沿着坡面剪裁
   */
  const cast = (g, who, o) => {
    if (!E.cast) return;
    const { shadow, shadowY, ground, ...rest } = o;
    if (shadow && !o.sil) groundShadow(g, o.x, shadowY ?? o.y, (o.h || 100) * (who.startsWith('sheep') || who === 'dolly' ? 0.75 : 0.26), shadow * (o.alpha ?? 1));
    if (ground == null || ground === false) { E.cast.draw(g, who, rest); return; }
    const h = o.h || 300, x0 = o.x - h * 1.6, x1 = o.x + h * 1.6, top = o.y - h * 3;
    g.save(); g.beginPath();
    if (typeof ground === 'function') {
      g.moveTo(x0, top);
      for (let i = 0; i <= 24; i++) { const x = x0 + ((x1 - x0) * i) / 24; g.lineTo(x, ground(x)); }
      g.lineTo(x1, top);
    } else g.rect(x0, top, x1 - x0, (ground === true ? o.y + max(2, h * 0.012) : ground) - top);
    g.clip();
    E.cast.draw(g, who, rest);
    g.restore();
  };
  /** 设计坐标 (x, y) 在视差层 depth 里经过镜头 cam 之后落在屏幕的哪里（和引擎的 s.layer 同一套算法） */
  function scr(cam, d, x, y) {
    const c = cam || {}, z = 1 + ((c.z ?? 1) - 1) * d;
    let dx = z * (x - VW / 2 - ((c.x ?? VW / 2) - VW / 2) * d), dy = z * (y - VH / 2 - ((c.y ?? VH / 2) - VH / 2) * d);
    const r = (c.r || 0) * min(1, d);
    if (r) { const cr = cos(r), sr = sin(r), tx = dx * cr - dy * sr; dy = dx * sr + dy * cr; dx = tx; }
    return [VW / 2 + (c.sx || 0) * d + dx, VH / 2 + (c.sy || 0) * d + dy];
  }
  /** 角色身上的关键点（胸口、眼睛、手……）；角色库没有时给个粗略估计 */
  const anchor = (who, o, key) => {
    const a = E.cast && E.cast.anchors ? E.cast.anchors(who, o) : null;
    if (a && a[key]) return a[key];
    const h = o.h || 300, f = { chest: 0.62, head: 0.86, face: 0.86, eyeN: 0.87, top: 1, hip: 0.45, handN: 0.45 }[key] ?? 0.5;
    return [o.x, o.y - h * f];
  };
  /** 走路不打滑的横向速度（像素 / 秒） */
  const gaitSpeed = (who, o, fallback) => (E.cast && E.cast.gait ? E.cast.gait(who, o).speed || fallback : fallback);
  /** 一拍一步的步频倍数（角色库的走路 0.92 个周期 / 秒 × 这个倍数 = 每拍半个周期） */
  const STEP_SPD = 1 / (2 * (60 / 133.97) * 0.92);
  /** 让小羊以地面速度 v 走（步频倍数） */
  const sheepSpeed = (h, v, run) => { const base = gaitSpeed('sheep-black', { h, pose: run ? 'run' : 'walk', speed: 1 }, 0); return base > 0 ? clamp(v / base, 0.3, 3) : 1; };
  const adele = (g, o) => cast(g, 'adele-alter', Object.assign({ outfit: 'coat', prop: 'staff', shadow: 0.2 }, o));

  /* =========================================================
   * 缓存：REG 里登记“怎么画”（设计坐标 w×h，可超采样 sc），C(s, key) 取位图
   * 自带 LRU：总像素超过预算时淘汰最久没用的；分辨率变化时整体丢弃
   * ========================================================= */
  const REG = Object.create(null);
  const def = (key, w, h, fn, sc = 1) => { REG[key] = { w, h, fn, sc }; return key; };
  // 同一页里可能同时有几个渲染器（舞台 1280/1920、进度条预览 256、海报），按分辨率分开缓存，共用一个像素预算
  const MEM = new Map();
  const BUDGET = 26e6; // 约 100MB：够放下当前镜头 + 预热的下一个镜头
  /** 放掉本片自己的所有缓存（播放器在切走 / 区块离得很远时调用 film.release()）；之后用到时再按需重建 */
  function releaseAll() {
    for (const e of MEM.values()) e.c.width = e.c.height = 0;
    MEM.clear(); PIX = 0;
    for (const k of Object.keys(SPR)) { SPR[k].width = SPR[k].height = 0; delete SPR[k]; }
    for (const k of Object.keys(SH)) { SH[k].width = SH[k].height = 0; delete SH[k]; }
  }
  let FRAME = 1, PIX = 0;
  const ckey = (key, k) => key + '@' + (k * REG[key].sc).toFixed(4);
  function evict() {
    if (PIX <= BUDGET) return;
    const list = [...MEM.entries()].filter(([, e]) => e.last < FRAME - 2).sort((a, b) => a[1].last - b[1].last);
    for (const [key, e] of list) {
      if (PIX <= BUDGET * 0.8) break;
      MEM.delete(key); PIX -= e.px; e.c.width = e.c.height = 0;
    }
  }
  function C(s, key) {
    const ck = ckey(key, s.k);
    let e = MEM.get(ck);
    if (!e) {
      const d = REG[key];
      const kk = s.k * d.sc;
      const c = E.mk(d.w * kk, d.h * kk), q = c.getContext('2d');
      q.setTransform(kk, 0, 0, kk, 0, 0);
      try { d.fn(q, d.w, d.h, kk); } catch (err) { console.warn('[miss-you] layer', key, err); }
      e = { c, px: c.width * c.height, last: FRAME };
      MEM.set(ck, e); PIX += e.px;
      evict();
    }
    e.last = FRAME;
    return e.c;
  }
  /** 把缓存层贴到 (x, y)，尺寸默认为登记的设计尺寸 */
  const put = (g, s, key, x = 0, y = 0, w, h) => { const d = REG[key]; g.drawImage(C(s, key), x, y, w ?? d.w, h ?? d.h); };
  /** 在缓存画布里开一张同密度的临时画布（做遮罩合成用） */
  function scratch(q, w, h) {
    const kk = q.getTransform().a;
    const c = E.mk(w * kk, h * kk), t = c.getContext('2d');
    t.setTransform(kk, 0, 0, kk, 0, 0);
    return { c, q: t, done: (x = 0, y = 0) => { q.save(); q.setTransform(kk, 0, 0, kk, 0, 0); q.drawImage(c, x, y, w, h); q.restore(); } };
  }

  /* ---------- 小精灵（固定像素，和分辨率无关） ---------- */
  const SPR = Object.create(null);
  const sprite = (key, w, h, fn) => { let c = SPR[key]; if (!c) { c = E.mk(w, h); fn(c.getContext('2d'), w, h); SPR[key] = c; } return c; };
  const flakeSpr = () => sprite('flake', 32, 32, (q) => {
    const gr = q.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.42, 'rgba(252,253,255,.92)'); gr.addColorStop(0.72, 'rgba(236,242,252,.35)'); gr.addColorStop(1, 'rgba(236,242,252,0)');
    q.fillStyle = gr; q.fillRect(0, 0, 32, 32);
  });
  const chipSpr = () => sprite('chip', 128, 32, (q) => {
    for (let i = 0; i < 4; i++) {
      q.save(); q.translate(16 + i * 32, 16); q.rotate(i * 0.8 + 0.3);
      const R = rng(5 + i); q.beginPath();
      for (let j = 0; j < 7; j++) { const a = (j / 7) * TAU, r = (j % 2 ? 6 : 9.5) * (0.75 + R() * 0.5); q.lineTo(cos(a) * r * 1.25, sin(a) * r * 0.8); }
      q.closePath(); q.fillStyle = '#f8f9fc'; q.fill(); q.strokeStyle = 'rgba(140,150,172,.6)'; q.lineWidth = 1.3; q.stroke();
      q.restore();
    }
  });
  /** 花瓣精灵表：12 个角度 × 3 种翻面（压扁） */
  const petalSheet = (col, tip) => sprite('petal:' + col, 480, 120, (q) => {
    for (let r = 0; r < 12; r++) for (let f = 0; f < 3; f++) {
      q.save(); q.translate(r * 40 + 20, f * 40 + 20); q.rotate((r / 12) * TAU); q.scale(1, [1, 0.62, 0.3][f]);
      q.beginPath(); q.moveTo(0, -14); q.quadraticCurveTo(3, -11, 5, -15); q.bezierCurveTo(13, -8, 10, 9, 0, 15); q.bezierCurveTo(-10, 9, -13, -8, -5, -15); q.quadraticCurveTo(-3, -11, 0, -14);
      q.fillStyle = col; q.fill();
      q.globalAlpha = 0.45; q.fillStyle = tip || '#ff9aa8'; q.beginPath(); q.ellipse(-2.5, -3, 3, 8, 0.25, 0, TAU); q.fill();
      q.globalAlpha = 0.25; q.fillStyle = '#5a0f1e'; q.beginPath(); q.ellipse(2, 8, 4, 5, 0, 0, TAU); q.fill();
      q.restore();
    }
  });
  /** 小花精灵（盛开的五瓣花），col 花瓣色，mid 花心 */
  const flowerSpr = (col, mid, n = 5) => sprite('fl:' + col + mid + n, 64, 64, (q) => {
    q.translate(32, 32);
    for (let i = 0; i < n; i++) {
      q.save(); q.rotate((i / n) * TAU);
      q.beginPath(); q.ellipse(0, -15, 10, 15, 0, 0, TAU); q.fillStyle = col; q.fill();
      q.strokeStyle = 'rgba(80,60,90,.25)'; q.lineWidth = 1.5; q.stroke();
      q.globalAlpha = 0.35; q.fillStyle = '#fff'; q.beginPath(); q.ellipse(-3, -18, 3.5, 8, 0.2, 0, TAU); q.fill(); q.globalAlpha = 1;
      q.restore();
    }
    q.beginPath(); q.arc(0, 0, 7, 0, TAU); q.fillStyle = mid; q.fill();
    q.fillStyle = 'rgba(255,255,255,.6)'; q.beginPath(); q.arc(-2, -2, 2.4, 0, TAU); q.fill();
  });

  /* ---------- 粒子（全部由 t 解析地算出） ---------- */
  /** 白灰：像雪一样落。o: n seed x0 x1 y0 y1 vy vx sway s0 s1 a chips twinkle scale */
  function ashfall(g, t, o = {}) {
    const n = o.n ?? 110, seed = o.seed ?? 1;
    const x0 = o.x0 ?? -80, x1 = o.x1 ?? VW + 80, y0 = o.y0 ?? -60, y1 = o.y1 ?? VH + 60;
    const spanX = x1 - x0, spanY = y1 - y0;
    const vy = o.vy ?? 60, vx = o.vx ?? 14, sway = o.sway ?? 24, s0 = o.s0 ?? 1.6, s1 = o.s1 ?? 6.5, A = o.a ?? 0.9;
    const fl = flakeSpr(), ch = chipSpr(), chips = o.chips ?? 0.22, tw = o.twinkle ?? 0, sc = o.scale ?? 1;
    const pa = g.globalAlpha;
    for (let i = 0; i < n; i++) {
      const d = 0.35 + 0.65 * hash(seed, i, 4);
      const v = vy * (0.5 + d);
      const per = spanY / max(1, abs(v));
      const tt = t + hash(seed, i, 2) * per;
      const cyc = floor(tt / per), ph = tt - cyc * per;
      let x = hash(seed, i, 100 + cyc) * spanX + vx * (0.5 + d) * ph + sin(ph * (0.7 + hash(seed, i, 3)) + i) * sway * d;
      x = x0 + (((x % spanX) + spanX) % spanX);
      const y = v >= 0 ? y0 + ph * v : y1 + ph * v;
      const sz = (s0 + (s1 - s0) * d * d) * sc;
      let a = A * (0.4 + 0.6 * d);
      if (tw) a *= 1 - tw * 0.5 * (1 + sin(t * 5 + i * 1.7));
      g.globalAlpha = pa * a;
      if (hash(seed, i, 9) < chips) { const k = (i & 3) * 32; g.drawImage(ch, k, 0, 32, 32, x - sz * 1.3, y - sz * 1.3, sz * 2.6, sz * 2.6); }
      else g.drawImage(fl, x - sz, y - sz, sz * 2, sz * 2);
    }
    g.globalAlpha = pa;
  }
  /** 花瓣。o 同上，另有 col（颜色）、spin */
  function petals(g, t, o = {}) {
    const n = o.n ?? 30, seed = o.seed ?? 3;
    const x0 = o.x0 ?? -80, x1 = o.x1 ?? VW + 80, y0 = o.y0 ?? -60, y1 = o.y1 ?? VH + 60;
    const spanX = x1 - x0, spanY = y1 - y0;
    const vy = o.vy ?? 75, vx = o.vx ?? 40, sway = o.sway ?? 50, s0 = o.s0 ?? 14, s1 = o.s1 ?? 30, A = o.a ?? 1;
    const sheet = petalSheet(o.col || '#d2334f', o.tip);
    const pa = g.globalAlpha;
    for (let i = 0; i < n; i++) {
      const d = 0.3 + 0.7 * hash(seed, i, 4);
      const v = vy * (0.55 + d * 0.8);
      const per = spanY / max(1, abs(v));
      const tt = t + hash(seed, i, 2) * per;
      const cyc = floor(tt / per), ph = tt - cyc * per;
      let x = hash(seed, i, 100 + cyc) * spanX + vx * (0.5 + d) * ph + sin(ph * (0.9 + hash(seed, i, 3)) + i) * sway * d;
      x = x0 + (((x % spanX) + spanX) % spanX);
      const y = v >= 0 ? y0 + ph * v : y1 + ph * v;
      const sz = (s0 + (s1 - s0) * d * d) * (o.scale ?? 1);
      const rot = hash(seed, i, 5) * TAU + ph * (1 + hash(seed, i, 6) * 2) * (o.spin ?? 1);
      const ri = ((floor((rot / TAU) * 12) % 12) + 12) % 12;
      const fl = abs(sin(ph * (1.4 + hash(seed, i, 7) * 2) + i));
      const fi = fl > 0.62 ? 0 : fl > 0.28 ? 1 : 2;
      g.globalAlpha = pa * A * (0.55 + 0.45 * d);
      g.drawImage(sheet, ri * 40, fi * 40, 40, 40, x - sz / 2, y - sz / 2, sz, sz);
    }
    g.globalAlpha = pa;
  }
  /** 浮尘 / 光点（叠加发光） */
  function motes(g, t, o = {}) {
    const n = o.n ?? 30, seed = o.seed ?? 5, rgb = o.rgb || '255,240,210';
    const x0 = o.x0 ?? 0, x1 = o.x1 ?? VW, y0 = o.y0 ?? 0, y1 = o.y1 ?? VH;
    for (let i = 0; i < n; i++) {
      const per = 5 + hash(seed, i, 1) * 6, ph = fract(t / per + hash(seed, i, 2));
      const x = x0 + hash(seed, i, 3) * (x1 - x0) + sin(t * 0.4 + i) * 30 + (o.vx ?? 0) * ph * per;
      const y = y0 + hash(seed, i, 4) * (y1 - y0) - ph * (o.rise ?? 40);
      const a = sin(PI * ph) * (o.a ?? 0.6) * (0.5 + 0.5 * sin(t * 3 + i * 2.1));
      E.glow(g, x, y, (o.s ?? 5) * (0.6 + hash(seed, i, 5)), rgb, a);
    }
  }

  /* ---------- 成片质感：焦外光斑、柔焦的前景、纸纹（全部是一次性画好的缓存 / 精灵） ---------- */
  /** 焦外光斑的精灵：边缘稍亮的圆盘（镜头焦外的光点） */
  const bokehSpr = (rgb) => sprite('bokeh:' + rgb, 96, 96, (q) => {
    const gr = q.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, `rgba(${rgb},.3)`); gr.addColorStop(0.72, `rgba(${rgb},.34)`); gr.addColorStop(0.88, `rgba(${rgb},.42)`); gr.addColorStop(0.96, `rgba(${rgb},.16)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    q.fillStyle = gr; q.fillRect(0, 0, 96, 96);
  });
  /** 焦外光斑：大小不一的圆盘，缓慢漂移、呼吸（叠加）。o: n seed rgb x0 x1 y0 y1 r0 r1 a vx mode */
  function bokeh(g, t, o = {}) {
    const n = o.n ?? 12, seed = o.seed ?? 7, spr = bokehSpr(o.rgb || '255,240,220');
    const x0 = o.x0 ?? -100, x1 = o.x1 ?? VW + 100, y0 = o.y0 ?? 0, y1 = o.y1 ?? VH, span = x1 - x0, r0 = o.r0 ?? 18, r1 = o.r1 ?? 70;
    const pa = g.globalAlpha, pc = g.globalCompositeOperation;
    g.globalCompositeOperation = o.mode || 'lighter';
    for (let i = 0; i < n; i++) {
      const r = r0 + (r1 - r0) * pow(hash(seed, i, 1), 1.6);
      const xx = hash(seed, i, 2) * span + sin(t * (0.1 + 0.2 * hash(seed, i, 3)) + i) * 30 + (o.vx ?? 0) * t;
      const x = x0 + (((xx % span) + span) % span), y = y0 + hash(seed, i, 4) * (y1 - y0) + cos(t * (0.08 + 0.15 * hash(seed, i, 5)) + i * 2) * 20;
      const a = (o.a ?? 0.5) * (0.45 + 0.55 * (0.5 + 0.5 * sin(t * (0.4 + hash(seed, i, 6)) + i * 1.3)));
      g.globalAlpha = pa * a; g.drawImage(spr, x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = pa; g.globalCompositeOperation = pc;
  }
  /**
   * 柔焦的缓存层（焦外的前景 / 远景）：先按 4 倍分辨率画，再逐级缩小到大约 blur/2 个设计像素一个像素，
   * 贴回去时双线性放大 —— 等于只在建缓存时做一次模糊，每帧只是贴图
   */
  function defSoft(key, w, h, fn, blur) {
    return def(key, w, h, (q, W, H, kk) => {
      const cw = q.canvas.width, ch = q.canvas.height;
      const big = E.mk(cw * 4, ch * 4), b = big.getContext('2d');
      b.setTransform(kk * 4, 0, 0, kk * 4, 0, 0); fn(b, W, H);
      const mid = E.mk(cw * 2, ch * 2), m = mid.getContext('2d');
      m.imageSmoothingQuality = 'high'; m.drawImage(big, 0, 0, mid.width, mid.height);
      q.save(); q.setTransform(1, 0, 0, 1, 0, 0); q.imageSmoothingQuality = 'high'; q.drawImage(mid, 0, 0, cw, ch); q.restore();
      big.width = big.height = mid.width = mid.height = 0;
    }, 2 / blur);
  }
  /** 把一个已登记的图层再登记一份柔焦版（key + '~'）：远景用它，焦点落在人物身上（景深） */
  const soften = (key, blur) => { const d = REG[key]; return defSoft(key + '~', d.w, d.h, (q, w, h) => d.fn(q, w, h, 1), blur); };
  /** 焦外的前景：一丛花（大花头 + 叶子），底边对齐 */
  defSoft('fg-flowers', 900, 520, (q, w, h) => {
    const R = rng(611);
    q.lineCap = 'round';
    // 所有东西离画布边缘留出一个模糊半径以上的距离：糊开的边不会被画布切出一道直边
    for (let i = 0; i < 26; i++) { const x = 170 + R() * (w - 340), l = 160 + R() * 280, a = -PI / 2 + (R() - 0.5) * 0.6; q.strokeStyle = ['#4f7f48', '#5f9058', '#3f6b3c'][i % 3]; q.lineWidth = 10 + R() * 12; q.beginPath(); q.moveTo(x, h + 20); q.quadraticCurveTo(x + cos(a) * l * 0.5 + (R() - 0.5) * 40, h - l * 0.5, x + cos(a) * l, h + sin(a) * l); q.stroke(); }
    for (let i = 0; i < 9; i++) {
      const x = 150 + R() * (w - 300), y = h - 160 - R() * 260, r = 34 + R() * 36, [pc, mc] = BLOOM_COLS[floor(R() * BLOOM_COLS.length)];
      for (let k = 0; k < 5; k++) { const an = (k / 5) * TAU + R(); q.fillStyle = pc; q.beginPath(); q.ellipse(x + cos(an) * r * 0.62, y + sin(an) * r * 0.62, r * 0.6, r * 0.42, an, 0, TAU); q.fill(); }
      q.fillStyle = mc; q.beginPath(); q.arc(x, y, r * 0.3, 0, TAU); q.fill();
    }
  }, 18);
  /** 焦外的前景：一丛草 + 几朵小白花 */
  defSoft('fg-grass', 900, 420, (q, w, h) => {
    const R = rng(612);
    q.lineCap = 'round';
    for (let i = 0; i < 60; i++) { const x = 150 + R() * (w - 300), l = 120 + R() * 250, a = -PI / 2 + (R() - 0.5) * 0.6; q.strokeStyle = ['#6f9a60', '#86ad74', '#5a8a50', '#a0bf88'][i % 4]; q.lineWidth = 6 + R() * 8; q.beginPath(); q.moveTo(x, h + 10); q.quadraticCurveTo(x + cos(a) * l * 0.4, h - l * 0.6, x + cos(a) * l, h + sin(a) * l); q.stroke(); }
    for (let i = 0; i < 6; i++) { const x = 160 + R() * (w - 320), y = h - 160 - R() * 160, r = 14 + R() * 10; q.fillStyle = i % 3 ? '#ffffff' : '#f49ab0'; for (let k = 0; k < 5; k++) { q.beginPath(); q.arc(x + cos(k * 1.26) * r, y + sin(k * 1.26) * r * 0.8, r * 0.7, 0, TAU); q.fill(); } q.fillStyle = '#f2c14e'; q.beginPath(); q.arc(x, y, r * 0.4, 0, TAU); q.fill(); }
  }, 16);
  /** 焦外的前景：一块灰色的火山岩（上沿被光照亮） */
  defSoft('fg-rock', 900, 360, (q, w, h) => {
    const pts = [[0, h + 20], [0, 150], [120, 70], [300, 40], [520, 60], [700, 120], [820, 220], [850, h + 20]];
    poly(q, pts); q.fillStyle = lin(q, 0, 40, 0, h, [[0, '#5d627a'], [1, '#2f3246']]); q.fill();
    q.strokeStyle = 'rgba(255,244,230,.55)'; q.lineWidth = 10; q.beginPath(); q.moveTo(20, 140); q.lineTo(120, 70); q.lineTo(300, 40); q.lineTo(520, 60); q.lineTo(700, 120); q.stroke();
  }, 18);
  /** 焦外的前景：室内的一片大叶子（龟背竹似的） */
  defSoft('fg-leaf', 700, 900, (q, w, h) => {
    q.fillStyle = '#4c7a58';
    q.beginPath(); q.moveTo(80, h + 20); q.quadraticCurveTo(160, 520, 420, 250); q.quadraticCurveTo(640, 60, 660, 250); q.quadraticCurveTo(620, 520, 300, 700); q.quadraticCurveTo(200, 800, 180, h + 20); q.closePath(); q.fill();
    q.strokeStyle = '#3a6246'; q.lineWidth = 16; q.beginPath(); q.moveTo(130, h + 20); q.quadraticCurveTo(330, 520, 600, 170); q.stroke();
    q.fillStyle = 'rgba(255,255,230,.12)'; q.beginPath(); q.ellipse(460, 300, 120, 60, -0.6, 0, TAU); q.fill();
  }, 20);

  /** 水彩纸的纹理（中灰为底：柔光叠上去只留下纹理，不改变整体明暗）；半分辨率缓存，本来就是柔的 */
  def('paper', 1920, 1080, (q, w, h) => {
    q.fillStyle = '#808080'; q.fillRect(0, 0, w, h);
    const R = rng(301);
    // 大块的颜料深浅
    for (let i = 0; i < 70; i++) {
      const x = R() * w, y = R() * h, r = 80 + R() * 380, v = (R() < 0.5 ? 150 + R() * 36 : 96 - R() * 36) | 0;
      const gr = q.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${v},${v},${v},${0.16 + R() * 0.18})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      q.fillStyle = gr; q.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 纸的纤维
    q.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
      const x = R() * w, y = R() * h, l = 6 + R() * 26, a = R() * PI, v = R() < 0.5 ? 176 : 84;
      q.strokeStyle = `rgba(${v},${v},${v},${0.1 + R() * 0.16})`; q.lineWidth = 0.8 + R();
      q.beginPath(); q.moveTo(x, y); q.quadraticCurveTo(x + cos(a) * l * 0.5 + (R() - 0.5) * 6, y + sin(a) * l * 0.5 + (R() - 0.5) * 6, x + cos(a) * l, y + sin(a) * l); q.stroke();
    }
    // 水彩干了以后留下的水痕（很淡）
    for (let i = 0; i < 14; i++) {
      const x = R() * w, y = R() * h, r = 60 + R() * 220;
      q.strokeStyle = `rgba(100,100,100,${0.08 + R() * 0.08})`; q.lineWidth = 1.5 + R() * 2; q.beginPath();
      for (let k = 0; k <= 24; k++) { const an = (k / 24) * TAU, rr = r * (1 + 0.12 * sin(an * 3 + i) + 0.06 * sin(an * 7 + i * 2)); const px = x + cos(an) * rr, py = y + sin(an) * rr * 0.7; k ? q.lineTo(px, py) : q.moveTo(px, py); }
      q.stroke();
    }
  }, 0.5);

  /** 镜头光晕：太阳 (sx, sy) 经过画面中心的一串光斑 + 一道横向的光（叠加） */
  function flare(g, sx, sy, a = 1) {
    if (a <= 0.01) return;
    const dx = 960 - sx, dy = 540 - sy;
    for (const [k, r, rgb, al] of [[0.35, 26, '255,226,190', 0.22], [0.62, 64, '190,210,255', 0.12], [0.86, 16, '255,200,220', 0.3], [1.25, 110, '210,236,255', 0.08], [1.55, 38, '255,236,200', 0.16], [1.9, 70, '255,210,240', 0.07]]) E.glow(g, sx + dx * k, sy + dy * k, r, rgb, al * a, 'lighter', false);
    const pa = g.globalAlpha, pc = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = pa * 0.3 * a;
    g.drawImage(E.glowSprite('255,226,190', false), sx - 700, sy - 10, 1400, 20);
    g.globalAlpha = pa; g.globalCompositeOperation = pc;
  }
  /** 一缕炊烟：从 (x, y) 升起、往左飘（纯函数） */
  function smoke(g, t, x, y, seed, sc = 1, rgb = '236,240,248') {
    const spr = E.kit.fogSprite(rgb), pa = g.globalAlpha;
    for (let i = 0; i < 7; i++) {
      const ph = fract(t * 0.18 + i / 7 + hash(seed, 1)), r = (10 + ph * 46) * sc;
      g.globalAlpha = pa * 0.55 * sin(PI * ph) * (1 - ph * 0.4);
      g.drawImage(spr, x - ph * 70 * sc + sin(ph * 5 + seed) * 8 - r, y - ph * 170 * sc - r * 0.5, r * 2, r);
    }
    g.globalAlpha = pa;
  }
  /** 一小群飞过的鸟（拍着翅膀的 V 字） */
  function birds(g, t, o) {
    g.save(); g.strokeStyle = o.col || 'rgba(50,58,86,.75)'; g.lineWidth = 2.2 * (o.s || 1); g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < (o.n || 6); i++) {
      const x = o.x0 + t * o.vx * (0.9 + hash(o.seed, i, 1) * 0.2) + hash(o.seed, i, 2) * 260, y = o.y0 + hash(o.seed, i, 3) * 90 + sin(t * 0.8 + i) * 10;
      const w = (8 + hash(o.seed, i, 4) * 5) * (o.s || 1), f = sin(t * 9 + i * 1.7) * 0.7;
      g.beginPath(); g.moveTo(x - w, y - w * f * 0.6); g.lineTo(x, y); g.lineTo(x + w, y - w * f * 0.6); g.stroke();
    }
    g.restore();
  }

  /* ---------- 画图小工具（主要在缓存里用） ---------- */
  function poly(q, pts) { q.beginPath(); q.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) q.lineTo(pts[i][0], pts[i][1]); q.closePath(); }
  function line(q, pts) { q.beginPath(); q.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) q.lineTo(pts[i][0], pts[i][1]); }
  function lin(q, x0, y0, x1, y1, stops) { const gr = q.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function rad(q, x, y, r0, r1, stops) { const gr = q.createRadialGradient(x, y, r0, x, y, r1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function rrect(q, x, y, w, h, r) { q.beginPath(); q.moveTo(x + r, y); q.arcTo(x + w, y, x + w, y + h, r); q.arcTo(x + w, y + h, x, y + h, r); q.arcTo(x, y + h, x, y, r); q.arcTo(x, y, x + w, y, r); q.closePath(); }
  const sample = (x0, x1, step, fn) => { const out = []; for (let x = x0; x < x1; x += step) out.push([x, fn(x)]); out.push([x1, fn(x1)]); return out; };
  /** 双线性插值四边形：Q = [左上, 右上, 右下, 左下] */
  const bil = (Q, u, v) => { const [a, b, c, d] = Q; const tx = a[0] + (b[0] - a[0]) * u, ty = a[1] + (b[1] - a[1]) * u, bx = d[0] + (c[0] - d[0]) * u, by = d[1] + (c[1] - d[1]) * u; return [tx + (bx - tx) * v, ty + (by - ty) * v]; };
  const sub = (Q, u0, v0, u1, v1) => [bil(Q, u0, v0), bil(Q, u1, v0), bil(Q, u1, v1), bil(Q, u0, v1)];
  /** 撕纸边：沿 (x0,y0)→(x1,y1) 的锯齿折线 */
  function tornPts(seed, x0, y0, x1, y1, step = 12, amp = 9) {
    const dx = x1 - x0, dy = y1 - y0, L = hypot(dx, dy), n = max(2, Math.round(L / step));
    const nx = -dy / L, ny = dx / L, out = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, e = i === 0 || i === n ? 0 : 1;
      const off = (wobble(seed, (u * L) / 160, 2) * 1.6 + (hash(seed, i, 7) - 0.5) * 0.9) * amp * e;
      out.push([x0 + dx * u + nx * off, y0 + dy * u + ny * off]);
    }
    return out;
  }
  /** 水彩式的纹理：在当前路径（已 clip）里铺底色 + 半透明色块 + 细笔触 */
  function washTex(q, x, y, w, h, seed, base, blobs, lines) {
    const R = rng(seed);
    q.fillStyle = base; q.fillRect(x, y, w, h);
    for (let i = 0; i < 90; i++) {
      q.globalAlpha = 0.08 + R() * 0.22; q.fillStyle = blobs[floor(R() * blobs.length)];
      q.beginPath(); q.ellipse(x + R() * w, y + R() * h, 10 + R() * 90, 6 + R() * 40, R() * PI, 0, TAU); q.fill();
    }
    q.globalAlpha = 0.5; q.strokeStyle = lines; q.lineWidth = 1.4;
    for (let i = 0; i < 40; i++) { const sx = x + R() * w, sy = y + R() * h, l = 20 + R() * 90, a = -0.6 + R() * 0.4; q.beginPath(); q.moveTo(sx, sy); q.quadraticCurveTo(sx + cos(a) * l * 0.5 + 8, sy + sin(a) * l * 0.5, sx + cos(a) * l, sy + sin(a) * l); q.stroke(); }
    q.globalAlpha = 0.6; q.fillStyle = '#ffffff';
    for (let i = 0; i < 70; i++) { q.beginPath(); q.arc(x + R() * w, y + R() * h, 0.6 + R() * 2, 0, TAU); q.fill(); }
    q.globalAlpha = 1;
  }
  /** 撕开的纸：outer 为外轮廓（含撕边），在撕边内侧留一道白色纸芯，内部铺纹理 */
  function paperPiece(q, outer, inner, tex, o = {}) {
    q.save(); poly(q, outer.map(([x, y]) => [x + (o.sx ?? 7), y + (o.sy ?? 9)])); q.fillStyle = o.shadow || 'rgba(24,40,86,.22)'; q.fill(); q.restore();
    poly(q, outer); q.fillStyle = o.paper || '#fbfaf6'; q.fill();
    q.save(); poly(q, inner); q.clip(); tex(q); q.restore();
    q.strokeStyle = 'rgba(160,168,186,.55)'; q.lineWidth = 1.2; poly(q, inner); q.stroke();
  }

  /* ---------- 天空与云 ---------- */
  // 窄画布（非整数像素宽时最后一列只画了一部分）：多铺一圈，避免拉伸后右边出现半透明的竖条
  const skyDef = (key, stops) => def(key, 24, 540, (q, w, h) => { q.fillStyle = lin(q, 0, 0, 0, h, stops); q.fillRect(-4, -4, w + 8, h + 8); });
  const sky = (g, s, key, y = 0, h = VH) => g.drawImage(C(s, key), -20, y, VW + 40, h);
  /** 积云（平底）：底色阴影 + 向光一侧的亮部 + 底部渐暗；画在独立的缓存里 */
  function cumulus(q, cx, by, w, h, seed, P) {
    const R = rng(seed), puffs = [];
    const n = max(5, Math.round(w / 52));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, hump = pow(sin(u * PI), 0.8);
      const r = h * (0.2 + 0.22 * hump) * (0.8 + R() * 0.45);
      puffs.push([cx - w / 2 + u * w + (R() - 0.5) * (w / n) * 0.6, by - r * 0.6 - hump * h * 0.36 * (0.7 + R() * 0.5), r]);
    }
    for (let i = 0; i < n * 0.7; i++) { const u = 0.18 + R() * 0.64, hump = sin(u * PI); puffs.push([cx - w / 2 + u * w, by - h * 0.28 - h * 0.42 * hump * (0.6 + R() * 0.5), h * (0.13 + 0.15 * R())]); }
    const lx = P.lx ?? -0.35, ly = P.ly ?? -0.55;
    q.save();
    q.beginPath(); q.rect(cx - w, by - h * 2, w * 2, h * 2); q.clip();
    q.fillStyle = P.shade; q.beginPath(); for (const [x, y, r] of puffs) { q.moveTo(x + r, y); q.arc(x, y, r, 0, TAU); } q.fill();
    q.fillStyle = P.mid || P.lit; q.beginPath(); for (const [x, y, r] of puffs) { const ox = x + lx * r * 0.18, oy = y + ly * r * 0.18; q.moveTo(ox + r * 0.9, oy); q.arc(ox, oy, r * 0.9, 0, TAU); } q.fill();
    q.fillStyle = P.lit; q.beginPath(); for (const [x, y, r] of puffs) { const ox = x + lx * r * 0.34, oy = y + ly * r * 0.34; q.moveTo(ox + r * 0.72, oy); q.arc(ox, oy, r * 0.72, 0, TAU); } q.fill();
    if (P.rim) { q.strokeStyle = P.rim; q.lineWidth = 2; q.beginPath(); for (const [x, y, r] of puffs) { if (y > by - h * 0.25) continue; q.moveTo(x + cos(-2.2) * r, y + sin(-2.2) * r); q.arc(x, y, r, -2.2, -1.0); } q.stroke(); }
    q.globalCompositeOperation = 'source-atop';
    q.fillStyle = lin(q, 0, by - h * 0.55, 0, by, [[0, 'rgba(0,0,0,0)'], [1, P.base || 'rgba(150,170,205,.55)']]);
    q.fillRect(cx - w, by - h, w * 2, h);
    q.restore();
  }
  /** 登记一朵云（独立缓存，w×h 的精灵，云底在 h*0.92） */
  const cloudDef = (key, w, h, seed, P) => def(key, w, h, (q) => cumulus(q, w / 2, h * 0.92, w * 0.9, h * 0.8, seed, P));
  const CLOUD_DAY = { lit: '#ffffff', mid: '#f3f7fd', shade: '#c6d5ec', base: 'rgba(140,164,204,.55)' };

  /* =========================================================
   * 序章 · 地火（0 – 15.22）：一滴熔化的石头落下，更多的岩浆沿裂缝从四面八方流来，汇成同一团火
   * ========================================================= */
  const CORE = [960, 640];
  let CRACKS = null;
  /** 裂缝：从外圈往火核走的折线（世界坐标），附带累计长度，岩浆滴沿着它流 */
  function cracks() {
    if (CRACKS) return CRACKS;
    const R = rng(41), out = [];
    const N = 21;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + (R() - 0.5) * 0.3;
      const r0 = 480 + R() * 760, r1 = 60 + R() * 150;
      const pts = [];
      let ang = a;
      const steps = 12 + floor(R() * 9);
      for (let k = 0; k <= steps; k++) {
        const u = k / steps, r = (r0 + (r1 - r0) * pow(u, 0.9)) * (1 + (R() - 0.5) * 0.06);
        ang += (R() - 0.5) * 0.24 + (R() < 0.14 ? (R() - 0.5) * 0.7 : 0);
        pts.push([CORE[0] + cos(ang) * r * 1.25, CORE[1] + sin(ang) * r * 0.78]);
      }
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      // 小支杈
      const br = [];
      for (let b = 0; b < 2; b++) { const k = 3 + floor(R() * (pts.length - 6)); const [x, y] = pts[k]; const ba = ang + (R() < 0.5 ? 1 : -1) * (0.6 + R() * 0.6); const l = 50 + R() * 110; br.push([[x, y], [x + cos(ba) * l * 0.5 + (R() - 0.5) * 20, y + sin(ba) * l * 0.5], [x + cos(ba) * l, y + sin(ba) * l]]); }
      out.push({ pts, cum, L: cum[cum.length - 1], br, grp: i % 3 });
    }
    return (CRACKS = out);
  }
  function crackAt(c, u) {
    const d = clamp(u) * c.L, cum = c.cum;
    let k = 1; while (k < cum.length - 1 && cum[k] < d) k++;
    const f = (d - cum[k - 1]) / max(1e-6, cum[k] - cum[k - 1]);
    const a = c.pts[k - 1], b = c.pts[k];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  let DROPS = null;
  /** 岩浆滴的时间表：出生时间、沿哪条裂缝、流多久 */
  function drops() {
    if (DROPS) return DROPS;
    const R = rng(77), NC = cracks().length, out = [];
    for (let i = 0; i < 8; i++) out.push({ c: (i * 8 + 3) % NC, ts: 4.48 + i * BEAT * 1.0, dur: 5.6 + R() * 2.2, sz: 8 + R() * 4 });
    for (let i = 0; i < 90; i++) { const u = i / 90; out.push({ c: floor(R() * NC), ts: 7.2 + 5.6 * pow(u, 0.8), dur: 3.4 - 2.0 * u + R() * 0.6, sz: 6 + R() * 6 }); }
    return (DROPS = out);
  }
  function paintStrata(q, x0, y0, w, h, seed, pal) {
    const R = rng(seed);
    q.fillStyle = pal[0]; q.fillRect(x0, y0, w, h);
    const bounds = [];
    for (let y = y0 - 60; y < y0 + h + 120; y += 36 + R() * 110) {
      const a = R() * 6, f = 0.0018 + R() * 0.0022, amp = 8 + R() * 30, tilt = (R() - 0.5) * 0.07;
      bounds.push((x) => y + sin(x * f + a) * amp + sin(x * f * 3.3 + a * 2) * amp * 0.28 + (x - x0 - w / 2) * tilt);
    }
    for (let i = 0; i < bounds.length - 1; i++) {
      const top = sample(x0 - 10, x0 + w + 10, 24, bounds[i]), bot = sample(x0 - 10, x0 + w + 10, 24, bounds[i + 1]).reverse();
      poly(q, top.concat(bot));
      q.fillStyle = pal[1 + floor(R() * (pal.length - 1))]; q.fill();
      q.save(); q.clip();
      // 层内：上亮下暗的一点体积
      const ym = bounds[i](x0 + w / 2), yb = bounds[i + 1](x0 + w / 2);
      q.fillStyle = lin(q, 0, ym, 0, yb, [[0, 'rgba(255,200,170,.07)'], [1, 'rgba(0,0,0,.22)']]); q.fillRect(x0, ym - 60, w, yb - ym + 120);
      // 砂砾的点
      for (let k = 0; k < w * 0.09; k++) { const x = x0 + R() * w, y = bounds[i](x) + R() * (bounds[i + 1](x) - bounds[i](x)); q.fillStyle = R() < 0.5 ? 'rgba(255,210,180,.07)' : 'rgba(0,0,0,.22)'; q.fillRect(x, y, 2 + R() * 3, 2 + R() * 2); }
      // 棱角分明的裂纹
      q.strokeStyle = 'rgba(0,0,0,.35)'; q.lineWidth = 1.6;
      for (let k = 0; k < w / 260; k++) { let x = x0 + R() * w, y = bounds[i](x) + 6; q.beginPath(); q.moveTo(x, y); for (let j = 0; j < 3; j++) { x += (R() - 0.5) * 40; y += 10 + R() * 20; q.lineTo(x, y); } q.stroke(); }
      q.restore();
    }
    // 层理：粗细不一的墨线 + 下缘一道被火光照到的暖边
    for (let i = 0; i < bounds.length; i++) {
      const pts = sample(x0 - 10, x0 + w + 10, 20, bounds[i]);
      q.strokeStyle = 'rgba(4,2,2,.95)'; q.lineWidth = 2.4 + R() * 3; line(q, pts); q.stroke();
      q.strokeStyle = 'rgba(140,80,56,.3)'; q.lineWidth = 1.6; line(q, pts.map(([x, y]) => [x, y + 3.5])); q.stroke();
    }
    // 嵌在岩层里的石块
    for (let i = 0; i < 70; i++) {
      const cx = x0 + R() * w, cy = y0 + R() * h, r = 8 + R() * 30, n = 6 + floor(R() * 3), pts = [];
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU + R() * 0.4; pts.push([cx + cos(a) * r * (0.7 + R() * 0.4), cy + sin(a) * r * 0.7 * (0.7 + R() * 0.4)]); }
      poly(q, pts); q.fillStyle = pal[1 + floor(R() * (pal.length - 1))]; q.fill();
      q.strokeStyle = 'rgba(4,2,2,.8)'; q.lineWidth = 2; q.stroke();
      q.strokeStyle = 'rgba(120,70,50,.35)'; q.lineWidth = 1.5; q.beginPath(); q.moveTo(pts[n - 1][0], pts[n - 1][1]); q.lineTo(pts[0][0], pts[0][1]); q.lineTo(pts[1][0], pts[1][1]); q.stroke();
    }
  }
  const ROCK_PAL = ['#100909', '#2a1812', '#1f120e', '#352019', '#261610', '#2f1c15', '#1a0f0c'];
  def('ug-rock', 2112, 1188, (q, w, h) => {
    q.translate(96, 54);
    paintStrata(q, -96, -54, w, h, 7, ROCK_PAL);
    // 钟乳：第一滴从这里落下
    const tip = [960, 252];
    const st = [[820, -60], [860, 40], [890, 110], [918, 170], [940, 222], tip, [978, 214], [996, 170], [1026, 116], [1066, 30], [1110, -60]];
    poly(q, st); q.fillStyle = '#140b0a'; q.fill(); q.strokeStyle = 'rgba(3,1,1,.95)'; q.lineWidth = 3; q.stroke();
    q.strokeStyle = 'rgba(140,80,56,.4)'; q.lineWidth = 2; line(q, st.slice(5, 9)); q.stroke();
    // 火核所在的石台
    const ledge = [[790, 700], [840, 668], [920, 660], [1010, 662], [1090, 672], [1140, 702], [1120, 740], [800, 742]];
    poly(q, ledge); q.fillStyle = '#1b110e'; q.fill(); q.strokeStyle = 'rgba(3,1,1,.95)'; q.lineWidth = 3; q.stroke();
    q.strokeStyle = 'rgba(150,90,60,.45)'; q.lineWidth = 2; line(q, ledge.slice(0, 6)); q.stroke();
    // 裂缝（干了的暗线）
    for (const c of cracks()) {
      q.strokeStyle = 'rgba(2,1,1,.95)'; q.lineWidth = 6; q.lineJoin = 'round'; line(q, c.pts); q.stroke();
      q.lineWidth = 3; for (const b of c.br) { line(q, b); q.stroke(); }
      q.strokeStyle = 'rgba(70,24,12,.8)'; q.lineWidth = 1.6; line(q, c.pts); q.stroke();
    }
  }, 1.3);
  /** 裂缝的发光层（三组，交替点亮），透明底，用 lighter 叠加 */
  for (let gi = 0; gi < 3; gi++) def('ug-glow' + gi, 2112, 1188, (q) => {
    q.translate(96, 54); q.lineJoin = 'round'; q.lineCap = 'round';
    for (const c of cracks()) {
      if (c.grp !== gi) continue;
      for (const [lw, col] of [[16, 'rgba(255,70,20,.1)'], [6, 'rgba(255,110,40,.3)'], [2.2, 'rgba(255,190,120,.7)']]) {
        q.strokeStyle = col; q.lineWidth = lw; line(q, c.pts); q.stroke();
        q.lineWidth = lw * 0.6; for (const b of c.br) { line(q, b); q.stroke(); }
      }
    }
  });
  def('ug-shaft', 1920, 1400, (q, w, h) => paintStrata(q, 0, 0, w, h, 19, ROCK_PAL));
  /** 岩浆滴（头 + 一小段拖尾） */
  function magmaDrop(g, x, y, r, a = 1, tx = 0, ty = 0) {
    if (tx || ty) { E.glow(g, x - tx * 0.45, y - ty * 0.45, r * 2.4, '255,90,30', 0.4 * a); E.glow(g, x - tx, y - ty, r * 1.7, '255,70,20', 0.28 * a); }
    E.glow(g, x, y, r * 3.8, '255,96,32', 0.55 * a);
    E.glow(g, x, y, r * 1.5, '255,190,110', a);
  }
  /** 火核：t 时刻已经流进来多少 */
  function coreMass(t) {
    let n = 0; for (const d of drops()) if (t > d.ts + d.dur + 0.3) n++;
    return n;
  }
  function drawCore(g, s, t, r, heat) {
    const pl = s.pulse(5), [x, y] = CORE;
    E.glow(g, x, y, r * 9, '255,110,50', 0.42 * heat, 'color-dodge', false);
    E.glow(g, x, y, r * 4.2, '255,90,30', 0.5 * heat);
    E.glow(g, x, y, r * 1.9 * (1 + pl * 0.08), '255,150,60', 0.9 * heat);
    E.glow(g, x, y, r * 0.9, '255,230,170', heat);
    // 拍点上的热浪环
    const ring = s.bp;
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(255,150,70,${0.35 * (1 - ring) * heat})`; g.lineWidth = 3 + 6 * (1 - ring);
    g.beginPath(); g.ellipse(x, y, r * (1.3 + ring * 2.4), r * (1.3 + ring * 2.4) * 0.8, 0, 0, TAU); g.stroke(); g.restore();
  }
  function drawDrops(g, t, alpha = 1) {
    const cs = cracks();
    for (const d of drops()) {
      const lt = t - d.ts;
      if (lt < 0 || lt > d.dur + 0.35) continue;
      const c = cs[d.c];
      const a = alpha * min(1, lt / 0.35);
      if (lt <= d.dur) {
        const u = ease.in(lt / d.dur) * 0.97;
        const [x, y] = crackAt(c, u), [px, py] = crackAt(c, max(0, u - 0.035));
        magmaDrop(g, x, y, d.sz, a, x - px, y - py);
      } else {
        // 从裂缝口跃进火核
        const k = (lt - d.dur) / 0.35, [ex, ey] = crackAt(c, 0.97);
        const x = lerp(ex, CORE[0], ease.in(k)), y = lerp(ey, CORE[1], ease.in(k)) - sin(PI * k) * 40;
        magmaDrop(g, x, y, d.sz * (1 - k * 0.5), a);
      }
    }
  }
  function crackGlow(g, s, a) {
    if (a <= 0.01) return;
    const pa = g.globalAlpha;
    g.globalCompositeOperation = 'lighter';
    for (let gi = 0; gi < 3; gi++) {
      const ph = fract(s.beat / 3 + gi / 3);
      g.globalAlpha = pa * a * (0.45 + 0.55 * Math.exp(-ph * 3));
      g.drawImage(C(s, 'ug-glow' + gi), -96, -54, 2112, 1188);
    }
    g.globalAlpha = pa; g.globalCompositeOperation = 'source-over';
  }

  const SHOTS = [];
  const shot = (id, t0, opt, draw) => { SHOTS.push(Object.assign({ id, t0, draw }, opt)); };

  // 1 · 一滴 —— 钟乳尖上凝出一滴熔化的石头，慢慢落下，点亮了岩层
  shot('p-drop', 0, { title: '地火', lb: 1, pre: ['ug-rock', 'ug-glow0', 'ug-glow1', 'ug-glow2'] }, (g, s) => {
    const t = s.t;
    const tip = [960, 252], land = CORE[1] - 14;
    const fall = clamp((t - bar(1)) / (bar(2) - bar(1)));
    const dy = t < bar(1) ? tip[1] + 6 + 8 * sstep(0.9, bar(1), t) : t < bar(2) ? lerp(tip[1] + 14, land, fall * fall) : land;
    const follow = t < bar(2) ? dy : land;
    const z = t < bar(2) ? 1.55 - 0.2 * sstep(bar(1), bar(2), t) : 1.35 - 0.2 * sstep(bar(2), bar(4), t);
    const cam = { x: 960, y: lerp(tip[1] + 60, follow, sstep(bar(1) - 0.4, bar(2), t)) * 0.9 + 60, z, ...s.handheld(3, t, 3) };
    const hit = t > bar(2) ? Math.exp(-(t - bar(2)) * 5) : 0;
    cam.sy += hit * 14 * sin((t - bar(2)) * 50) * RM(s);
    g.fillStyle = '#050303'; g.fillRect(0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'ug-rock'), -96, -54, 2112, 1188);
      // 光：落下的那一滴、落地后的熔池
      const lit = t < bar(2) ? 0.25 + 0.4 * sstep(0.9, bar(1), t) : 0.65 + 0.35 * hit;
      E.glow(q, 960, t < bar(2) ? dy : land, 520 * lit, '255,110,50', 0.55 * lit, 'color-dodge', false);
      crackGlow(q, s, 0.55 * sstep(bar(2), bar(4) + 1, t));
      if (t < bar(2)) {
        const grow = sstep(0.6, bar(1), t);
        const r = 3 + 7 * grow, stretch = t < bar(1) ? 1 + grow * 0.5 : 1.6 - 0.4 * fall;
        E.glow(q, 960, dy + r * 0.5, r * 4, '255,96,32', 0.6 * grow + 0.2);
        E.glow(q, 960, dy, r * 1.4, '255,190,110', 0.4 + 0.6 * grow);
        if (t > bar(1)) E.glow(q, 960, dy - r * stretch * 1.6, r * 2.2, '255,120,40', 0.4);
      } else {
        drawDrops(q, t);
        const m = coreMass(t);
        const pool = 16 + 30 * hit + min(40, m * 2);
        drawCore(q, s, t, pool, 0.75 + 0.25 * hit);
        // 溅起的火星
        const lt = t - bar(2);
        if (lt < 2.2) for (let i = 0; i < 34; i++) {
          const a = -PI * (0.08 + 0.84 * hash(9, i, 1)), v = 180 + hash(9, i, 2) * 380;
          const x = 960 + cos(a) * v * lt, y = land + sin(a) * v * lt + 520 * lt * lt;
          if (y > land + 40) continue;
          E.glow(q, x, y, 5 + hash(9, i, 3) * 6, '255,170,90', (1 - lt / 2.2) * 0.9);
        }
      }
    });
    s.post.vignette(g, 0.85);
  });

  // 2 · 汇流 —— 更多的熔岩沿裂缝从四面八方流来，汇进石台上的那团火
  shot('p-converge', bar(4), { lb: 1, pre: ['ug-rock', 'ug-glow0', 'ug-glow1', 'ug-glow2'] }, (g, s) => {
    const t = s.t, p = s.p;
    const cam = { x: 960, y: 600, z: 1.12 - 0.1 * ease.out(p) + 0.012 * s.barPulse(6), ...s.handheld(5, t, 4 + 6 * p) };
    cam.sx += s.lo * sin(t * 40) * 3 * p * RM(s); cam.sy += s.lo * cos(t * 37) * 3 * p * RM(s);
    g.fillStyle = '#050303'; g.fillRect(0, 0, VW, VH);
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'ug-rock'), -96, -54, 2112, 1188);
      const m = coreMass(t), r = 34 + min(70, m * 0.8);
      crackGlow(q, s, 0.55 + 0.45 * p);
      drawDrops(q, t);
      drawCore(q, s, t, r, 1);
    });
    // 汇流的节奏：每小节的重拍，一圈光从火核荡开（跟着火核在屏幕上的位置）
    const k = s.barp, [ccx, ccy] = scr(cam, 1, CORE[0], CORE[1]);
    E.glow(g, ccx, ccy, 300 + 900 * k, '255,120,60', 0.18 * (1 - k) * (0.4 + p));
    s.post.vignette(g, 0.8 - 0.2 * p);
  });

  // 3 · 上升 —— 那团火顺着岩层往上冲，头顶越来越亮
  shot('p-rise', bar(7), { lb: 1, pre: ['ug-shaft'] }, (g, s) => {
    const lt = s.lt, p = s.p;
    const speed = 900 + 5200 * p * p;
    const off = (lt * 900 + 2600 * pow(lt, 3)) % 2800;
    const shake = (4 + 22 * p) * (0.5 + s.pulse(4)) * RM(s);
    const sx = sin(lt * 53) * shake, sy = cos(lt * 47) * shake;
    g.save(); g.translate(sx, sy);
    const sh = C(s, 'ug-shaft');
    for (let k = -1; k <= 1; k++) {
      const y = off + k * 2800 - 1400;
      g.drawImage(sh, -60, y, 2040, 1400);
      g.save(); g.translate(0, y + 2800); g.scale(1, -1); g.drawImage(sh, -60, 0, 2040, 1400); g.restore();
    }
    // 中间是熔岩往上冲的通道（锯齿形的岩缝，跟着岩层一起往下掠）
    const head = lerp(760, 360, ease.in(p)) + sin(lt * 30) * 6;
    const eL = (y) => 690 + 46 * sin((y - off) * 0.009) + 22 * sin((y - off) * 0.031 + 1) + 9 * sin((y - off) * 0.11);
    const eR = (y) => 1230 + 40 * sin((y - off) * 0.008 + 2) + 24 * sin((y - off) * 0.027 + 4) + 9 * sin((y - off) * 0.13 + 1);
    const chan = [];
    for (let y = -40; y <= VH + 40; y += 24) chan.push([eL(y), y]);
    for (let y = VH + 40; y >= -40; y -= 24) chan.push([eR(y), y]);
    g.save(); poly(g, chan); g.clip();
    g.fillStyle = '#0b0405'; g.fillRect(0, 0, VW, VH);
    // 熔岩的前沿：鼓起来、冒着泡
    const mag = [];
    for (let x = 600; x <= 1320; x += 16) { const u = (x - 960) / 300; mag.push([x, head + 40 - 90 * max(0, 1 - u * u) + sin(x * 0.06 + lt * 18) * 7 + sin(x * 0.17 - lt * 11) * 4]); }
    mag.push([1320, VH + 40], [600, VH + 40]);
    g.fillStyle = lin(g, 0, head - 60, 0, VH, [[0, '#fff2d0'], [0.1, '#ffb45a'], [0.4, '#ff6a24'], [1, '#b8300e']]); poly(g, mag); g.fill();
    for (let i = 0; i < 7; i++) { const bx = 760 + hash(15, i, 1) * 400, ph = fract(lt * 2 + hash(15, i, 2)), u = (bx - 960) / 300; const by = head + 40 - 90 * max(0, 1 - u * u) - ph * 30; g.fillStyle = `rgba(255,244,210,${0.8 * (1 - ph)})`; g.beginPath(); g.arc(bx, by, 6 + 10 * ph, 0, TAU); g.fill(); }
    // 熔岩表面的纹路（往下流的亮线）
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,230,160,.35)'; g.lineWidth = 3;
    for (let i = 0; i < 14; i++) { const x = 720 + i * 36 + sin(i * 2.1) * 10, ph = ((lt * 700 + i * 90) % 400); g.beginPath(); g.moveTo(x, head + ph); g.lineTo(x + sin(i) * 8, head + ph + 160); g.stroke(); }
    g.globalCompositeOperation = 'source-over';
    g.restore();
    g.strokeStyle = 'rgba(255,140,60,.55)'; g.lineWidth = 4;
    line(g, chan.slice(0, chan.length / 2).filter(([, y]) => y > head - 80)); g.stroke();
    line(g, chan.slice(chan.length / 2).filter(([, y]) => y > head - 80)); g.stroke();
    // 两侧岩壁压暗（横向渐变，不留硬边 —— 硬边的矩形在手机上看是两道竖线）
    g.drawImage(sprite('side-shade', 64, 4, (q, w) => { q.fillStyle = lin(q, 0, 0, w, 0, [[0, 'rgba(5,2,2,.62)'], [0.3, 'rgba(5,2,2,.28)'], [0.42, 'rgba(5,2,2,0)'], [0.58, 'rgba(5,2,2,0)'], [0.7, 'rgba(5,2,2,.28)'], [1, 'rgba(5,2,2,.62)']]); q.fillRect(0, 0, w, 4); }), -40, -40, VW + 80, VH + 80);
    // 速度线（往下掠过的火星）
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 34; i++) {
      const x = 380 + hash(13, i, 1) * 1160, len = 160 + hash(13, i, 2) * 520 * (0.4 + p);
      const y = ((hash(13, i, 3) * 1700 + lt * speed * (0.6 + hash(13, i, 4))) % 1700) - 400;
      g.globalAlpha = 0.14 + 0.24 * p;
      g.fillStyle = i % 3 ? '#ff9a50' : '#fff0d8';
      g.fillRect(x, y, 2 + hash(13, i, 5) * 3, len);
    }
    g.globalAlpha = 1;
    // 熔岩柱的光（照亮岩壁）+ 上冲的“头”
    const body = E.glowSprite('255,100,36');
    g.globalAlpha = 0.55; g.drawImage(body, 960 - 700, head - 300, 1400, (VH - head) * 2 + 600);
    g.globalAlpha = 1;
    E.glow(g, 960, head, 260 + 50 * s.pulse(3), '255,236,190', 1);
    for (let i = 0; i < 18; i++) { const k = fract(lt * 1.6 + i / 18), a = -PI / 2 + (hash(14, i, 1) - 0.5) * 1.6; E.glow(g, 960 + cos(a) * 260 * k, head + sin(a) * 200 * k + 300 * k * k, 10 * (1 - k) + 3, '255,200,120', 1 - k); }
    // 头顶：地表裂开一道白光，越来越宽
    const crack = sstep(0.25, 1, p);
    if (crack > 0) {
      const top = tornPts(17, -40, 70, VW + 40, 60, 40, 22), bot = tornPts(18, VW + 40, 60 + 60 * crack, -40, 70 + 80 * crack, 40, 22);
      g.globalAlpha = 0.5 + 0.5 * crack; g.fillStyle = '#fff6e6'; poly(g, top.concat(bot)); g.fill(); g.globalAlpha = 1;
      E.glow(g, 960, 80, 500 + 1600 * crack * crack, '255,250,240', 0.3 + 0.7 * crack, 'lighter', false);
    }
    g.globalCompositeOperation = 'source-over';
    g.restore();
    s.post.vignette(g, 0.7 * (1 - p));
    s.post.fill(g, '#ffffff', sstep(0.7, 1, p));
  });

  /* =========================================================
   * 一 · 晴空与白灰（15.22 – 29.56）：冲上地面 —— 晴天下的城市，白灰像雪一样落，红色的花瓣
   * ========================================================= */
  skyDef('sky-city', [[0, '#2a70cc'], [0.32, '#4f93e0'], [0.62, '#8fc2f0'], [0.86, '#cfe6fa'], [1, '#eef7fd']]);
  cloudDef('cl-a', 1100, 520, 12, CLOUD_DAY);
  cloudDef('cl-b', 760, 380, 23, CLOUD_DAY);
  cloudDef('cl-c', 560, 260, 34, CLOUD_DAY);
  cloudDef('cl-d', 900, 340, 45, CLOUD_DAY);

  /** 仰视的楼：Q 为立面四边形 [左上, 右上, 右下, 左下]；fs 近大远小（0=无） */
  function facade(q, Q, o) {
    poly(q, Q); q.fillStyle = o.base; q.fill();
    if (o.shade) { q.save(); poly(q, Q); q.clip(); const a = bil(Q, 0, 0.5), b = bil(Q, 1, 0.5); q.fillStyle = lin(q, a[0], a[1], b[0], b[1], o.shade); q.fillRect(-100, -100, 2200, 1300); q.restore(); }
    const R = rng(o.seed || 1), fs = o.fs ?? 0;
    const U = (u) => (u * (1 + fs)) / (1 + fs * u);
    const rows = o.rows, cols = o.cols, v0 = o.v0 ?? 0.06, v1 = o.v1 ?? 0.96;
    for (let r = 0; r < rows; r++) {
      const va = v0 + ((r + 0.18) / rows) * (v1 - v0), vb = v0 + ((r + 0.74) / rows) * (v1 - v0);
      // 楼层线
      if (o.floorLine) { const fa = bil(Q, 0, v0 + (r / rows) * (v1 - v0)), fb = bil(Q, 1, v0 + (r / rows) * (v1 - v0)); q.strokeStyle = o.floorLine; q.lineWidth = 3; q.beginPath(); q.moveTo(fa[0], fa[1]); q.lineTo(fb[0], fb[1]); q.stroke(); }
      for (let c = 0; c < cols; c++) {
        const ua = U((c + 0.2) / cols), ub = U((c + 0.8) / cols);
        const Wq = sub(Q, ua, va, ub, vb);
        poly(q, Wq); q.fillStyle = o.frame; q.fill();
        const G = sub(Q, lerp(ua, ub, 0.14), lerp(va, vb, 0.1), lerp(ua, ub, 0.86), lerp(va, vb, 0.9));
        poly(q, G);
        const lit = R();
        q.fillStyle = lin(q, G[0][0], G[0][1], G[3][0], G[3][1], lit < 0.3 ? [[0, '#d9ecfb'], [0.5, '#8db6de'], [1, '#5d7fae']] : [[0, '#a9cdef'], [0.55, '#6e93c4'], [1, '#43618f']]);
        q.fill();
        // 窗格
        q.strokeStyle = o.frame; q.lineWidth = 2;
        const m1 = bil(Q, (ua + ub) / 2, va), m2 = bil(Q, (ua + ub) / 2, vb); q.beginPath(); q.moveTo(m1[0], m1[1]); q.lineTo(m2[0], m2[1]); q.stroke();
        // 窗台 / 花箱
        const s0 = bil(Q, ua - 0.01, vb), s1 = bil(Q, ub + 0.01, vb), s2 = bil(Q, ub + 0.01, vb + 0.012), s3 = bil(Q, ua - 0.01, vb + 0.012);
        poly(q, [s0, s1, s2, s3]); q.fillStyle = o.sill || '#f4f1ea'; q.fill();
        if (o.flowers && R() < o.flowers) {
          const f0 = bil(Q, ua, vb + 0.004), f1 = bil(Q, ub, vb + 0.004);
          q.fillStyle = '#3f6b4a'; q.fillRect(min(f0[0], f1[0]), f0[1] - 6, abs(f1[0] - f0[0]), 10);
          for (let k = 0; k < 7; k++) { const x = lerp(f0[0], f1[0], (k + 0.5) / 7), y = lerp(f0[1], f1[1], (k + 0.5) / 7) - 8 - R() * 6; q.fillStyle = R() < 0.6 ? '#d2334f' : R() < 0.5 ? '#f49ab0' : '#ffffff'; q.beginPath(); q.arc(x, y, 3 + R() * 2.5, 0, TAU); q.fill(); }
        }
        if (o.balcony && R() < o.balcony) {
          const b0 = bil(Q, ua - 0.03, vb + 0.01), b1 = bil(Q, ub + 0.03, vb + 0.01), b2 = bil(Q, ub + 0.03, vb + 0.06), b3 = bil(Q, ua - 0.03, vb + 0.06);
          q.strokeStyle = o.rail || '#39415a'; q.lineWidth = 2.2; poly(q, [b0, b1, b2, b3]); q.stroke();
          for (let k = 1; k < 8; k++) { const a = [lerp(b0[0], b1[0], k / 8), lerp(b0[1], b1[1], k / 8)], b = [lerp(b3[0], b2[0], k / 8), lerp(b3[1], b2[1], k / 8)]; q.beginPath(); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]); q.stroke(); }
        }
      }
    }
    if (o.cornice) { const a = bil(Q, 0, 0), b = bil(Q, 1, 0), c = bil(Q, 1, 0.025), d = bil(Q, 0, 0.025); poly(q, [[a[0] - 6, a[1] - 4], [b[0] + 6, b[1] - 4], c, d]); q.fillStyle = o.cornice; q.fill(); }
    poly(q, Q); q.strokeStyle = o.ink || 'rgba(40,52,86,.55)'; q.lineWidth = 3; q.stroke();
  }
  // 远处的高楼（雾蓝）
  def('city-far', 2016, 1134, (q) => {
    q.translate(48, 27);
    const R = rng(3);
    for (const [x, w, top, col] of [[620, 110, 700, '#b5cde8'], [720, 80, 610, '#a9c3e2'], [800, 130, 760, '#bcd2ea'], [930, 90, 560, '#a2bee0'], [1010, 150, 690, '#b8cfe9'], [1150, 100, 600, '#a6c1e1'], [1240, 120, 740, '#bdd3ea'], [1340, 90, 650, '#aac4e2']]) {
      q.fillStyle = col; q.fillRect(x, top, w, 1134 - top);
      q.fillStyle = 'rgba(255,255,255,.35)';
      for (let y = top + 16; y < 1100; y += 22) for (let xx = x + 10; xx < x + w - 10; xx += 18) if (R() < 0.55) q.fillRect(xx, y, 8, 10);
      q.fillStyle = 'rgba(255,255,255,.45)'; q.fillRect(x, top, w, 4);
      if (R() < 0.5) { q.fillStyle = col; q.fillRect(x + w * 0.45, top - 60, 6, 60); }
    }
    q.fillStyle = lin(q, 0, 700, 0, 1134, [[0, 'rgba(230,242,252,0)'], [1, 'rgba(230,242,252,.85)']]); q.fillRect(500, 560, 1000, 574);
  });
  soften('city-far', 5); // 远处的楼：焦外
  // 右侧：玻璃高楼 + 广告牌楼
  def('city-right', 2016, 1134, (q) => {
    q.translate(48, 27);
    // 广告牌楼（矮）
    const B = [[1180, 640], [1640, 600], [1690, 1134], [1150, 1134]];
    facade(q, B, { base: '#e9e0e4', shade: [[0, 'rgba(255,255,255,0)'], [1, 'rgba(120,110,150,.25)']], rows: 3, cols: 5, v0: 0.3, frame: '#f8f5f2', seed: 8, ink: 'rgba(60,60,90,.5)' });
    // 广告牌：粉色晚霞与小羊的剪影（本页原创的画面）
    const bb = [[1210, 470], [1600, 440], [1612, 640], [1218, 660]];
    q.save(); poly(q, bb); q.clip();
    q.fillStyle = lin(q, 0, 440, 0, 660, [[0, '#f7b7c9'], [0.6, '#fcd9c4'], [1, '#fbeede']]); q.fillRect(1200, 430, 420, 240);
    q.fillStyle = 'rgba(255,255,255,.8)'; q.beginPath(); q.arc(1500, 520, 40, 0, TAU); q.fill();
    q.fillStyle = '#e48fae'; q.beginPath(); q.moveTo(1210, 640); q.lineTo(1330, 560); q.lineTo(1400, 600); q.lineTo(1500, 540); q.lineTo(1620, 640); q.fill();
    for (const [x, y] of [[1290, 610], [1330, 616], [1372, 608]]) { q.fillStyle = '#fff6fa'; q.beginPath(); q.arc(x, y, 13, 0, TAU); q.arc(x + 12, y - 4, 11, 0, TAU); q.fill(); q.fillStyle = '#5a3a4a'; q.beginPath(); q.arc(x + 22, y - 6, 5, 0, TAU); q.fill(); }
    q.restore();
    poly(q, bb); q.strokeStyle = '#3b4262'; q.lineWidth = 6; q.stroke();
    q.strokeStyle = '#3b4262'; q.lineWidth = 5; q.beginPath(); q.moveTo(1300, 655); q.lineTo(1306, 720); q.moveTo(1520, 645); q.lineTo(1524, 715); q.stroke();
    // 玻璃高楼
    const T = [[1560, 150], [2060, -60], [2060, 1134], [1640, 1134]];
    poly(q, T); q.fillStyle = lin(q, 1560, 0, 2060, 0, [[0, '#6e9fd6'], [0.5, '#4f82c4'], [1, '#34629f']]); q.fill();
    q.save(); poly(q, T); q.clip();
    // 玻璃里映着的云
    q.globalAlpha = 0.55; q.fillStyle = '#e8f3fd';
    for (const [x, y, r] of [[1640, 380, 60], [1700, 350, 80], [1780, 400, 70], [1720, 420, 60], [1660, 700, 50], [1740, 690, 70], [1820, 720, 60]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); }
    q.globalAlpha = 1;
    for (let k = 0; k <= 14; k++) { const u = k / 14, a = bil(T, u, 0), b = bil(T, u, 1); q.strokeStyle = 'rgba(210,228,248,.5)'; q.lineWidth = 2.5; q.beginPath(); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]); q.stroke(); }
    for (let k = 0; k <= 26; k++) { const v = k / 26, a = bil(T, 0, v), b = bil(T, 1, v); q.strokeStyle = 'rgba(30,60,110,.35)'; q.lineWidth = 2; q.beginPath(); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]); q.stroke(); }
    q.restore();
    poly(q, T); q.strokeStyle = 'rgba(30,44,80,.6)'; q.lineWidth = 3; q.stroke();
  });
  // 左侧：老城的楼（阳台、花箱）+ 楼顶的铁塔
  def('city-left', 2016, 1134, (q) => {
    q.translate(48, 27);
    // 铁塔
    q.strokeStyle = '#46506e'; q.lineWidth = 3;
    const tw = [[250, 230, 330, 230], [262, 150, 318, 150], [274, 70, 306, 70], [284, -20, 296, -20]];
    q.beginPath(); q.moveTo(250, 240); q.lineTo(284, -40); q.moveTo(330, 240); q.lineTo(296, -40); q.stroke();
    q.lineWidth = 2; for (let i = 0; i < tw.length - 1; i++) { const [a0, y0, b0] = tw[i], [a1, y1, b1] = tw[i + 1]; q.beginPath(); q.moveTo(a0, y0); q.lineTo(b1, y1); q.moveTo(b0, y0); q.lineTo(a1, y1); q.moveTo(a0, y0); q.lineTo(b0, y0); q.stroke(); }
    q.fillStyle = '#d2334f'; q.beginPath(); q.arc(290, -44, 6, 0, TAU); q.fill();
    // 后排的高楼
    facade(q, [[-60, 200], [470, 260], [540, 1134], [-60, 1134]], { base: '#d8dce8', shade: [[0, 'rgba(255,255,255,.2)'], [1, 'rgba(90,100,140,.3)']], rows: 9, cols: 4, v0: 0.05, frame: '#eef0f5', seed: 4, fs: 0.2, cornice: '#c3c8d8' });
    // 前排的老楼（米色，带阳台和花箱）
    facade(q, [[-80, 420], [600, 560], [640, 1134], [-80, 1134]], { base: '#f0e2d4', shade: [[0, 'rgba(255,255,255,.15)'], [1, 'rgba(150,110,120,.28)']], rows: 5, cols: 4, v0: 0.06, frame: '#fbf6ef', seed: 6, fs: 0.35, flowers: 0.6, balcony: 0.5, cornice: '#dcc7b4', floorLine: 'rgba(180,150,140,.35)' });
    // 雨棚（红白条）
    const aw = [[-80, 1010], [610, 1040], [620, 1100], [-80, 1080]];
    q.save(); poly(q, aw); q.clip();
    for (let i = 0; i < 16; i++) { const a = bil(aw, i / 16, 0), b = bil(aw, (i + 1) / 16, 0), c = bil(aw, (i + 1) / 16, 1), d = bil(aw, i / 16, 1); poly(q, [a, b, c, d]); q.fillStyle = i % 2 ? '#fbf6ef' : '#d2334f'; q.fill(); }
    q.restore();
  });
  // 前景：路灯、红色的圆牌、电线
  def('city-fg', 2016, 1134, (q) => {
    q.translate(48, 27);
    q.lineCap = 'round';
    // 电线：一直拉出画面右边（不在半空里断开，也不会在别的视差层的楼面上滑来滑去）
    q.strokeStyle = 'rgba(40,48,76,.75)'; q.lineWidth = 2.6;
    for (const [x0, y0, x1, y1, sag] of [[300, 120, 2010, 40, 185], [260, 190, 2010, 128, 215], [320, 40, 2010, -24, 140]]) { q.beginPath(); q.moveTo(x0, y0); q.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1); q.stroke(); }
    // 路灯（从右下弯上来）
    q.strokeStyle = '#2f3752'; q.lineWidth = 16; q.beginPath(); q.moveTo(1380, 1160); q.lineTo(1330, 640); q.quadraticCurveTo(1310, 470, 1180, 470); q.stroke();
    q.strokeStyle = 'rgba(160,190,230,.5)'; q.lineWidth = 3; q.beginPath(); q.moveTo(1376, 1150); q.lineTo(1326, 640); q.stroke();
    q.fillStyle = '#2f3752'; rrect(q, 1110, 454, 96, 30, 10); q.fill();
    q.fillStyle = '#fff4d8'; rrect(q, 1120, 480, 76, 10, 4); q.fill();
    // 红色的圆牌
    q.strokeStyle = '#3a4260'; q.lineWidth = 9; q.beginPath(); q.moveTo(372, 1160); q.lineTo(392, 860); q.stroke();
    q.fillStyle = '#ffffff'; q.beginPath(); q.arc(394, 800, 66, 0, TAU); q.fill();
    q.fillStyle = '#d2334f'; q.beginPath(); q.arc(394, 800, 60, 0, TAU); q.fill();
    q.fillStyle = '#ffffff'; rrect(q, 352, 790, 84, 20, 3); q.fill();
    q.strokeStyle = 'rgba(60,20,30,.4)'; q.lineWidth = 3; q.beginPath(); q.arc(394, 800, 66, 0, TAU); q.stroke();
  });
  // 撕开的纸角（屏幕固定）
  def('torn-corners', 1920, 1080, (q) => {
    const tl = tornPts(51, 760, -10, -10, 430, 13, 10), tlIn = tornPts(52, 730, -10, -10, 400, 13, 9);
    paperPiece(q, [[-30, -30], [790, -30], ...tl, [-30, 460]], [[-30, -30], [760, -30], ...tlIn, [-30, 430]], (c) => washTex(c, -30, -30, 820, 480, 7, '#7fb6c6', ['#4f93ab', '#a8d6df', '#2f6f86', '#d8eef2'], 'rgba(30,70,90,.5)'));
    const tr = tornPts(53, 1930, 300, 1480, -10, 13, 9), trIn = tornPts(54, 1930, 272, 1510, -10, 13, 8);
    paperPiece(q, [[1950, 330], ...tr, [1450, -30], [1950, -30]], [[1950, 300], ...trIn, [1480, -30], [1950, -30]], (c) => washTex(c, 1440, -30, 520, 360, 9, '#2c3550', ['#1b2238', '#46557a', '#0f1426', '#5d6b92'], 'rgba(200,210,240,.35)'));
    // 纸上的两片花瓣
    for (const [x, y, r] of [[1640, 120, 0.6], [1780, 60, 2.2], [260, 90, -0.4]]) { q.save(); q.translate(x, y); q.rotate(r); q.fillStyle = '#d2334f'; q.beginPath(); q.ellipse(0, 0, 9, 16, 0, 0, TAU); q.fill(); q.restore(); }
  });

  /* ---------- 标题字「MISS YOU」：本页原创的几何粗体，字里是天空，一道撕纸的斜痕 ---------- */
  function logoStrokes(q, e) {
    // 字高 300（y: 0..300），e = 描边外扩（让平头的剪裁框跟着外扩）
    let x = 0;
    const seg = (w, fn) => { q.save(); q.beginPath(); q.rect(x - 60, -e, w + 120, 300 + 2 * e); q.clip(); q.beginPath(); fn(x); q.stroke(); q.restore(); x += w; };
    seg(320, (x) => { q.moveTo(x + 30, 380); q.lineTo(x + 30, -80); q.moveTo(x + 290, 380); q.lineTo(x + 290, -80); q.moveTo(x + 22, -60); q.lineTo(x + 160, 218); q.lineTo(x + 298, -60); }); x += 34;
    seg(60, (x) => { q.moveTo(x + 30, 380); q.lineTo(x + 30, -80); }); x += 34;
    const S = (x) => { q.moveTo(x + 205, 72); q.bezierCurveTo(x + 192, 40, x + 160, 29, x + 112, 29); q.bezierCurveTo(x + 62, 29, x + 30, 52, x + 30, 88); q.bezierCurveTo(x + 30, 128, x + 72, 140, x + 112, 150); q.bezierCurveTo(x + 152, 160, x + 196, 172, x + 196, 214); q.bezierCurveTo(x + 196, 252, x + 162, 271, x + 112, 271); q.bezierCurveTo(x + 62, 271, x + 30, 256, x + 16, 226); };
    seg(232, S); x += 26;
    seg(232, S); x += 104;
    seg(250, (x) => { q.moveTo(x + 8, -80); q.lineTo(x + 125, 172); q.moveTo(x + 242, -80); q.lineTo(x + 125, 172); q.moveTo(x + 125, 150); q.lineTo(x + 125, 380); }); x += 14;
    seg(290, (x) => { q.moveTo(x + 145 + 115, 150); q.ellipse(x + 145, 150, 115, 120, 0, 0, TAU); }); x += 22;
    seg(250, (x) => { q.moveTo(x + 30, -80); q.lineTo(x + 30, 172); q.bezierCurveTo(x + 30, 244, x + 70, 270, x + 125, 270); q.bezierCurveTo(x + 180, 270, x + 220, 244, x + 220, 172); q.lineTo(x + 220, -80); });
    return x;
  }
  const LOGO_W = 1858;
  /** 标题：w=1640 h=520。上方一行小字，下面是大字（缩放 0.8） */
  def('logo', 1640, 520, (q, w, h) => {
    const sc = 0.8, ox = (w - LOGO_W * sc) / 2, oy = 170;
    const SW = 60;
    q.lineJoin = 'miter'; q.lineCap = 'butt'; q.miterLimit = 10;
    // 阴影 / 外描边
    q.save(); q.translate(ox + 12, oy + 16); q.scale(sc, sc); q.strokeStyle = 'rgba(20,40,96,.26)'; q.lineWidth = SW + 22; logoStrokes(q, 11); q.restore();
    q.save(); q.translate(ox, oy); q.scale(sc, sc); q.strokeStyle = 'rgba(36,62,120,.55)'; q.lineWidth = SW + 26; logoStrokes(q, 13); q.strokeStyle = '#ffffff'; q.lineWidth = SW + 18; logoStrokes(q, 9); q.restore();
    // 字里的天空
    const sp = scratch(q, w, h), t = sp.q;
    t.save(); t.translate(ox, oy); t.scale(sc, sc); t.lineJoin = 'miter'; t.lineCap = 'butt'; t.strokeStyle = '#000'; t.lineWidth = SW; logoStrokes(t, 0); t.restore();
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = lin(t, 0, oy, 0, oy + 300 * sc, [[0, '#2769c4'], [0.45, '#5b9fe3'], [0.8, '#a9d3f6'], [1, '#e2f1fc']]); t.fillRect(0, 0, w, h);
    t.globalCompositeOperation = 'source-atop';
    const R = rng(88);
    for (let i = 0; i < 60; i++) { const x = R() * w, y = oy + 150 * sc + R() * 170 * sc, r = 14 + R() * 34; t.fillStyle = R() < 0.3 ? 'rgba(200,222,246,.9)' : 'rgba(255,255,255,.92)'; t.beginPath(); t.arc(x, y, r, 0, TAU); t.fill(); }
    for (let i = 0; i < 14; i++) { const x = R() * w, y = oy + R() * 120 * sc; t.fillStyle = 'rgba(255,255,255,.5)'; t.beginPath(); t.ellipse(x, y, 30 + R() * 50, 6 + R() * 6, -0.1, 0, TAU); t.fill(); }
    // 一道撕纸的斜痕
    const slash = tornPts(61, -20, oy + 310 * sc, w + 20, oy - 10, 10, 5), slash2 = tornPts(62, -20, oy + 334 * sc, w + 20, oy + 14, 10, 5);
    poly(t, slash.concat(slash2.slice().reverse())); t.fillStyle = '#fbfaf6'; t.fill();
    t.strokeStyle = 'rgba(150,160,185,.7)'; t.lineWidth = 1.5; line(t, slash2); t.stroke();
    // 底部压暗一点、顶部一道亮边
    t.fillStyle = lin(t, 0, oy + 180 * sc, 0, oy + 300 * sc, [[0, 'rgba(30,70,140,0)'], [1, 'rgba(30,70,140,.28)']]); t.fillRect(0, 0, w, h);
    sp.done();
  });
  /** 标题上方的一行小字（在标题的坐标系里画：标题画在 (-820, -260) 处） */
  function logoSub(g, a, dark) {
    if (a <= 0.01) return;
    const col = dark ? '#34406e' : '#ffffff', st = dark ? 'rgba(255,255,255,.7)' : 'rgba(24,44,100,.55)';
    E.text(g, 'EYJAFJALLA  THE  HVÍT  ASKA', -250, -140, { font: 'display', size: 40, weight: 700, spacing: 8, color: col, alpha: a, stroke: st, strokeW: 7 });
    g.globalAlpha = a; g.fillStyle = st; g.fillRect(-582, -126, 664, 8); g.fillStyle = col; g.fillRect(-580, -124, 660, 4); g.globalAlpha = 1;
  }

  // 4 · 标题 —— 冲出地面：晴空、城市、白灰和花瓣，「MISS YOU」砸在重拍上
  shot('st-title', bar(8), { title: '晴空与白灰', pre: ['sky-city', 'cl-a', 'cl-b', 'cl-c', 'cl-d', 'city-far', 'city-right', 'city-left', 'city-fg', 'torn-corners', 'logo'] }, (g, s) => {
    const lt = s.lt, t = s.t, p = s.p;
    const kick = Math.exp(-lt * 6);
    const cam = { x: 960, y: 560 - 60 * ease.inOut(p), z: 1.0 + 0.1 * (1 - ease.out(min(1, lt / 3))) + 0.004 * s.pulse(), ...s.handheld(31, t, 3) };
    cam.sx += kick * 16 * sin(lt * 70) * RM(s); cam.sy += kick * 12 * cos(lt * 60) * RM(s);
    sky(g, s, 'sky-city');
    s.layer(g, cam, 0.12, (q) => {
      q.drawImage(C(s, 'cl-a'), 820 - s.lt * 6, 160, 1100, 520);
      q.drawImage(C(s, 'cl-b'), 180 - s.lt * 9, 40, 760, 380);
      q.drawImage(C(s, 'cl-c'), 1320 - s.lt * 7, 60, 560, 260);
      q.drawImage(C(s, 'cl-d'), 560 - s.lt * 5, 520, 900, 340);
    });
    // 城市：冷灰、只留红色（官方 MV 的街道）—— 只调楼这一层，天空保持晴朗
    gradedBg(g, s, 'rain-cool', (q) => {
      s.layer(q, cam, 0.35, (qq) => put(qq, s, 'city-far~', -48, -27));
      s.layer(q, cam, 0.8, (qq) => put(qq, s, 'city-right', -48, -27));
      s.layer(q, cam, 1, (qq) => put(qq, s, 'city-left', -48, -27));
      ashfall(q, t, { n: 70, seed: 21, vy: 55, vx: -16, s0: 1.5, s1: 4.5, a: 0.8 });
      s.layer(q, cam, 1.25, (qq) => put(qq, s, 'city-fg', -48, -27));
    }, 0.85);
    // 逆光里的焦外光斑（右上角，太阳那边）
    bokeh(g, t, { n: 8, seed: 31, rgb: '255,238,214', x0: 1150, x1: 2000, y0: 20, y1: 420, r0: 22, r1: 76, a: 0.32 });
    // 标题：重拍上砸下来（闪白很短，砸的动作留到白光退去之后还看得见）
    const k = ease.out(clamp(lt / 0.55));
    const sc = (1.45 - 0.45 * k) * (1 + 0.006 * s.pulse(5)), la = clamp(lt / 0.1);
    const F = FIN();
    g.save(); g.translate(960, 470 + sin(t * 1.3) * 5); g.scale(sc, sc); g.globalAlpha = la;
    if (F && F.title) {
      // 官方 MV 那种白色粗体「MISS YOU」（带纸纹与做旧）：身后一团很淡的暗雾，浅色的城市上也压得住
      E.glow(g, 0, 10, 980, '26,36,62', 0.3, 'source-over', false);
      F.title(g, s, { text: 'MISS YOU', sub: 'EYJAFJALLA  THE  HVÍT  ASKA', label: 'III', style: 'bold', x: 0, y: 0, size: 236, align: 'center', anim: 'fade', reveal: clamp(lt / 0.5) });
    } else {
      g.drawImage(C(s, 'logo'), -820, -260, 1640, 520);
      g.globalAlpha = 1;
      logoSub(g, clamp((lt - 0.35) / 0.5), false);
    }
    g.restore();
    E.text(g, 'MV · 本页原创同人影像', 960, 728, { size: 30, weight: 700, spacing: 10, color: '#ffffff', alpha: clamp((lt - 0.8) / 0.8), stroke: 'rgba(24,44,100,.6)', strokeW: 7 });
    // 重拍：一圈花瓣从标题后面炸开
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + hash(7, i, 1), v = 500 + hash(7, i, 2) * 900, u = ease.out(clamp(lt / 2.2));
      const x = 960 + cos(a) * v * u, y = 470 + sin(a) * v * u * 0.7 + 200 * u * u;
      const sheet = petalSheet('#d2334f'), ri = (i + floor(lt * 8)) % 12;
      g.globalAlpha = (1 - u) * 0.95; g.drawImage(sheet, ri * 40, (i % 3) * 40, 40, 40, x - 14, y - 14, 28, 28);
    }
    g.globalAlpha = 1;
    petals(g, t, { n: 16, seed: 5, vx: 30, s0: 14, s1: 26 });
    ashfall(g, t, { n: 22, seed: 22, vy: 80, vx: -20, s0: 5, s1: 11, a: 0.75, chips: 0.4 });
    g.drawImage(C(s, 'torn-corners'), 0, 0, 1920, 1080);
    // 冲出地面的那一下：极短的白光（标题砸下来的动作要看得见）
    s.post.fill(g, '#ffffff', Math.exp(-lt * 13) * (s.reduced ? 0.3 : 1), 'source-over');
    s.post.fill(g, '#ffffff', kick * 0.25, 'lighter');
  });

  /* ---------- 街景（横向跟拍）：一排小店 ---------- */
  function paintShops(q, w, G, seed) {
    const R = rng(seed);
    const pal = ['#f3e6d6', '#efd8d2', '#dde6f0', '#e8e0ee', '#f5eedf', '#d9e8e2', '#f2dcc8'];
    const awn = [['#d2334f', '#fbf6ef'], ['#4f7fc0', '#fbf6ef'], ['#3f7a64', '#f4efe2'], ['#e0a24a', '#fbf6ef'], ['#7a5aa8', '#f6f0fa']];
    const icons = ['cup', 'bread', 'flower', 'book', 'note', 'key'];
    let x = -60, n = 0;
    while (x < w + 60) {
      const bw = 300 + floor(R() * 5) * 40, floors = 2 + (R() < 0.45 ? 1 : 0), fh = 120, gf = 170;
      const top = G - gf - floors * fh;
      const col = pal[floor(R() * pal.length)];
      q.fillStyle = col; q.fillRect(x, top, bw, G - top);
      q.fillStyle = lin(q, x, 0, x + bw, 0, [[0, 'rgba(255,255,255,.12)'], [1, 'rgba(90,90,140,.14)']]); q.fillRect(x, top, bw, G - top);
      // 屋顶
      const roof = R();
      if (roof < 0.4) { q.fillStyle = '#5b6687'; poly(q, [[x - 8, top], [x + 30, top - 70], [x + bw - 30, top - 70], [x + bw + 8, top]]); q.fill(); q.fillStyle = '#e9eef7'; for (let k = 0; k < 2; k++) { const dx = x + bw * (0.3 + k * 0.4); q.fillRect(dx - 18, top - 58, 36, 44); q.fillStyle = '#6f8fbf'; q.fillRect(dx - 12, top - 50, 24, 32); q.fillStyle = '#e9eef7'; } }
      else if (roof < 0.7) { q.fillStyle = col; poly(q, [[x, top], [x + bw / 2, top - 90], [x + bw, top]]); q.fill(); q.strokeStyle = 'rgba(80,80,110,.45)'; q.lineWidth = 3; q.stroke(); q.fillStyle = '#fff'; q.beginPath(); q.arc(x + bw / 2, top - 38, 16, 0, TAU); q.fill(); q.fillStyle = '#7fa6d6'; q.beginPath(); q.arc(x + bw / 2, top - 38, 11, 0, TAU); q.fill(); }
      else { q.fillStyle = '#ffffff'; q.fillRect(x - 6, top - 14, bw + 12, 16); q.fillStyle = 'rgba(80,80,110,.2)'; q.fillRect(x - 6, top, bw + 12, 4); }
      if (R() < 0.5) { q.fillStyle = '#8a6a60'; q.fillRect(x + bw * 0.78, top - 110, 26, 70); q.fillStyle = '#6b4d45'; q.fillRect(x + bw * 0.78 - 4, top - 116, 34, 10); }
      // 上层窗
      const nw = bw > 380 ? 3 : 2;
      for (let f = 0; f < floors; f++) for (let k = 0; k < nw; k++) {
        const wx = x + (bw / nw) * (k + 0.5) - 32, wy = top + f * fh + 22;
        q.fillStyle = '#fbf8f2'; q.fillRect(wx - 6, wy - 6, 76, 94);
        q.fillStyle = lin(q, 0, wy, 0, wy + 82, [[0, '#cfe6fa'], [0.5, '#86acd8'], [1, '#56769f']]); q.fillRect(wx, wy, 64, 82);
        q.strokeStyle = '#fbf8f2'; q.lineWidth = 4; q.beginPath(); q.moveTo(wx + 32, wy); q.lineTo(wx + 32, wy + 82); q.moveTo(wx, wy + 34); q.lineTo(wx + 64, wy + 34); q.stroke();
        const sh = awn[(n + f) % awn.length][0];
        if (R() < 0.6) { q.fillStyle = sh; q.globalAlpha = 0.85; q.fillRect(wx - 30, wy - 4, 22, 90); q.fillRect(wx + 72, wy - 4, 22, 90); q.globalAlpha = 1; }
        if (R() < 0.55) { q.fillStyle = '#4a6b50'; q.fillRect(wx - 8, wy + 84, 80, 12); for (let j = 0; j < 8; j++) { q.fillStyle = R() < 0.55 ? '#d2334f' : R() < 0.5 ? '#f49ab0' : '#ffffff'; q.beginPath(); q.arc(wx - 2 + j * 10, wy + 80 - R() * 6, 4 + R() * 2, 0, TAU); q.fill(); } }
        else { q.fillStyle = '#f4f1ea'; q.fillRect(wx - 10, wy + 84, 84, 8); }
      }
      // 一层店面
      const gy = G - gf;
      q.fillStyle = '#fbf8f2'; q.fillRect(x, gy - 8, bw, 10);
      const [ac, bc] = awn[n % awn.length];
      // 橱窗 + 门
      q.fillStyle = '#3d4b66'; q.fillRect(x + 20, gy + 40, bw - 40, gf - 40);
      q.fillStyle = lin(q, 0, gy + 40, 0, G, [[0, '#9cc0e4'], [0.6, '#5f7fae'], [1, '#3b4f73']]); q.fillRect(x + 28, gy + 48, bw * 0.62 - 28, gf - 56);
      q.fillStyle = 'rgba(255,255,255,.35)'; poly(q, [[x + 40, gy + 48], [x + 90, gy + 48], [x + 50, G - 8], [x + 28, G - 8]]); q.fill();
      q.fillStyle = '#6b4a3c'; q.fillRect(x + bw * 0.66, gy + 50, bw * 0.24, gf - 50);
      q.fillStyle = '#e7c46a'; q.beginPath(); q.arc(x + bw * 0.66 + 12, gy + 110, 4, 0, TAU); q.fill();
      // 招牌
      q.fillStyle = ac; rrect(q, x + bw * 0.18, gy - 2, bw * 0.64, 36, 6); q.fill();
      const ic = icons[n % icons.length], icx = x + bw / 2, icy = gy + 16;
      q.fillStyle = bc; q.strokeStyle = bc; q.lineWidth = 3;
      if (ic === 'cup') { q.fillRect(icx - 10, icy - 7, 18, 14); q.beginPath(); q.arc(icx + 10, icy, 5, -1.4, 1.4); q.stroke(); }
      else if (ic === 'bread') { q.beginPath(); q.ellipse(icx, icy, 18, 9, 0, 0, TAU); q.fill(); }
      else if (ic === 'flower') { for (let j = 0; j < 5; j++) { q.beginPath(); q.arc(icx + cos(j * 1.26) * 7, icy + sin(j * 1.26) * 7, 5, 0, TAU); q.fill(); } }
      else if (ic === 'book') { q.fillRect(icx - 16, icy - 9, 14, 18); q.fillRect(icx + 2, icy - 9, 14, 18); }
      else if (ic === 'note') { q.beginPath(); q.arc(icx - 6, icy + 5, 5, 0, TAU); q.fill(); q.fillRect(icx - 2, icy - 12, 3, 17); q.fillRect(icx - 2, icy - 12, 12, 4); }
      else { q.beginPath(); q.arc(icx - 6, icy, 7, 0, TAU); q.stroke(); q.fillRect(icx, icy - 2, 16, 4); }
      // 雨棚（扇贝边）
      const ay = gy + 36, ax0 = x + 10, ax1 = x + bw - 10, stripes = 10;
      for (let j = 0; j < stripes; j++) { const sx = lerp(ax0, ax1, j / stripes), ex = lerp(ax0, ax1, (j + 1) / stripes); q.fillStyle = j % 2 ? bc : ac; poly(q, [[sx + 6, ay - 30], [ex + 6, ay - 30], [ex, ay], [sx, ay]]); q.fill(); q.beginPath(); q.arc((sx + ex) / 2, ay, (ex - sx) / 2, 0, PI); q.fill(); }
      q.strokeStyle = 'rgba(60,40,50,.35)'; q.lineWidth = 2; q.beginPath(); q.moveTo(ax0 + 6, ay - 30); q.lineTo(ax1 + 6, ay - 30); q.stroke();
      // 门口：花桶 / 小桌
      if (ic === 'flower') for (let j = 0; j < 4; j++) { const bx = x + 40 + j * 46; q.fillStyle = '#8d9bb8'; q.fillRect(bx, G - 44, 34, 44); for (let m = 0; m < 9; m++) { q.fillStyle = ['#d2334f', '#f49ab0', '#ffffff', '#f2c14e'][(m + j) % 4]; q.beginPath(); q.arc(bx + 4 + R() * 26, G - 50 - R() * 26, 6 + R() * 3, 0, TAU); q.fill(); } }
      if (ic === 'cup') for (let j = 0; j < 2; j++) { const tx = x + bw * (0.25 + j * 0.45); q.fillStyle = '#39415a'; q.fillRect(tx - 3, G - 60, 6, 60); q.fillStyle = '#f7f3ea'; q.beginPath(); q.ellipse(tx, G - 62, 36, 8, 0, 0, TAU); q.fill(); q.fillStyle = '#2f3752'; q.beginPath(); q.arc(tx - 48, G - 96, 16, 0, TAU); q.fill(); q.fillRect(tx - 62, G - 82, 28, 50); }
      q.strokeStyle = 'rgba(64,70,104,.5)'; q.lineWidth = 2.5; q.strokeRect(x, top, bw, G - top);
      x += bw; n++;
    }
  }
  def('street-shops', 4200, 700, (q, w, h) => paintShops(q, w, 680, 17));
  def('street-haze', 3000, 420, (q, w, h) => {
    const R = rng(29);
    for (let x = -20; x < w; x += 60 + R() * 120) {
      const bw = 70 + R() * 130, top = 40 + R() * 220;
      q.fillStyle = R() < 0.5 ? '#c4d7ec' : '#b6cce6'; q.fillRect(x, top, bw, h - top);
      q.fillStyle = 'rgba(255,255,255,.4)'; for (let y = top + 14; y < h; y += 20) for (let xx = x + 8; xx < x + bw - 8; xx += 16) if (R() < 0.5) q.fillRect(xx, y, 7, 9);
      if (R() < 0.25) { q.fillStyle = '#b6cce6'; q.fillRect(x + bw / 2 - 3, top - 70, 6, 70); }
    }
    q.fillStyle = lin(q, 0, 0, 0, h, [[0, 'rgba(236,245,253,0)'], [1, 'rgba(236,245,253,.75)']]); q.fillRect(0, 0, w, h);
  });
  soften('street-haze', 6);
  def('street-walk', 4200, 240, (q, w, h) => {
    q.fillStyle = lin(q, 0, 0, 0, h, [[0, '#d9d6d3'], [1, '#c6c3c6']]); q.fillRect(0, 0, w, h);
    q.strokeStyle = 'rgba(120,118,130,.35)'; q.lineWidth = 2;
    for (let y = 30; y < h; y += 50 + y * 0.2) { q.beginPath(); q.moveTo(0, y); q.lineTo(w, y); q.stroke(); }
    const R = rng(4);
    for (let x = 0; x < w; x += 80) { q.beginPath(); q.moveTo(x, 0); q.lineTo(x - 40, h); q.stroke(); }
    // 落在地上的白灰
    for (let i = 0; i < 900; i++) { q.fillStyle = `rgba(255,255,255,${0.35 + R() * 0.5})`; q.beginPath(); q.ellipse(R() * w, R() * h, 2 + R() * 7, 1 + R() * 3, 0, 0, TAU); q.fill(); }
    q.fillStyle = 'rgba(255,255,255,.6)'; q.fillRect(0, 0, w, 6);
    q.fillStyle = '#a9a5ab'; q.fillRect(0, h - 26, w, 26); q.fillStyle = '#eeeae6'; q.fillRect(0, h - 30, w, 6);
  });
  // 前景（视差 1.6）：路灯杆和花坛一直伸到画框下面 —— 画面下沿永远被它们盖住，不会“浮”在人行道上
  def('street-fg', 4200, 1240, (q, w, h) => {
    const R = rng(33), G = 1080;
    for (let x = 200; x < w; x += 900 + R() * 300) {
      // 路灯
      q.fillStyle = '#26304a'; q.fillRect(x - 12, 120, 24, h - 120); q.fillRect(x - 26, G - 150, 52, h - G + 150);
      q.beginPath(); q.moveTo(x, 130); q.quadraticCurveTo(x + 10, 60, x + 90, 70); q.lineWidth = 12; q.strokeStyle = '#26304a'; q.stroke();
      q.fillStyle = '#26304a'; rrect(q, x + 60, 64, 80, 24, 8); q.fill();
      // 花坛
      const px = x + 380;
      q.fillStyle = '#56607c'; q.fillRect(px, G - 120, 260, h - G + 120);
      q.fillStyle = 'rgba(255,255,255,.14)'; q.fillRect(px, G - 120, 260, 6);
      for (let m = 0; m < 40; m++) { q.fillStyle = ['#3f6b4a', '#4f7d58', '#2f5a3c'][m % 3]; q.beginPath(); q.arc(px + 10 + R() * 240, G - 120 - R() * 40, 14 + R() * 10, 0, TAU); q.fill(); }
      for (let m = 0; m < 22; m++) { q.fillStyle = ['#d2334f', '#ffffff', '#f49ab0'][m % 3]; q.beginPath(); q.arc(px + 16 + R() * 228, G - 130 - R() * 46, 5 + R() * 4, 0, TAU); q.fill(); }
    }
  });
  soften('street-fg', 12); // 近处的路灯和花坛：焦外（焦点在她身上）
  skyDef('sky-street', [[0, '#3a82d8'], [0.5, '#7fb8ee'], [1, '#dcefff']]);

  // 5 · 走在街上 —— 横向跟拍：她拄着开花的法杖走过一排小店，脚步踩在拍子上
  shot('st-walk', bar(10), { pre: ['sky-street', 'cl-a', 'cl-b', 'cl-c', 'street-haze', 'street-shops', 'street-walk', 'street-fg'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    // 一拍一步：步频倍数 STEP_SPD 让两步正好一个节拍周期；横向速度按角色库的步幅算，脚底不打滑
    const v = gaitSpeed('adele-alter', { h: 420, pose: 'walk', speed: STEP_SPD }, 150);
    const wx = 700 + lt * v;
    const cam = { x: wx + 160, y: 560, z: 1, ...s.handheld(41, t, 4) };
    sky(g, s, 'sky-street');
    s.layer(g, cam, 0.06, (q) => { q.drawImage(C(s, 'cl-a'), 700 - s.lt * 8, 40, 880, 416); q.drawImage(C(s, 'cl-c'), 1400 - s.lt * 8, 110, 520, 240); q.drawImage(C(s, 'cl-b'), -60 - s.lt * 8, 150, 600, 300); });
    // 城市这一层（远楼、小店、人行道、鸽子、路人）：冷灰、只留红色；她和小黑羊画在上面，保持原色
    gradedBg(g, s, 'rain-cool', (gq) => {
      s.layer(gq, cam, 0.3, (q) => put(q, s, 'street-haze~', -200, 300));
      s.layer(gq, cam, 1, (q) => {
        put(q, s, 'street-shops', -400, 210);
        put(q, s, 'street-walk', -400, 880);
        // 鸽子：她走近时扑棱飞起（第 5 拍）
        const fly = clamp((t - (bar(10) + BEAT * 5)) / 1.4);
        for (let i = 0; i < 3; i++) {
          const bx = wx + 330 + i * 46, by = 884 - fly * (260 + i * 60) - sin(fly * PI) * 40, fl = sin(t * 30 + i) * (fly > 0 ? 1 : 0.1);
          q.fillStyle = '#8b93a8'; q.beginPath(); q.ellipse(bx + fly * 240, by, 14, 9, 0, 0, TAU); q.fill();
          q.beginPath(); q.moveTo(bx + fly * 240 - 4, by - 2); q.lineTo(bx + fly * 240 - 22, by - 16 * fl - 4); q.lineTo(bx + fly * 240 + 8, by - 3); q.fill();
        }
        // 迎面走过的路人（在她身后一点的人行道上，比她小一点）
        for (const [x0, col, sd, hh3] of [[wx + 900, '#6a86b8', 21, 360], [wx + 1500, '#b86a6a', 33, 380]]) {
          const pv = gaitSpeed('crowd', { h: hh3, pose: 'walk' }, 90), px = x0 - lt * pv;
          cast(q, 'crowd', { shadow: 0.14, x: px, y: 896, h: hh3, pose: 'walk', flip: true, t: t + sd, color: col, seed: sd });
        }
      });
    }, 0.85);
    s.layer(g, cam, 1, (q) => {
      adele(q, { x: wx, y: 912, h: 420, pose: 'walk', t: s.beat * BEAT, speed: STEP_SPD, expr: 'smile', wind: 0.35, look: [1, -0.1] });
      cast(q, 'sheep-black', { shadow: 0.2, x: wx - 170, y: 914, h: 92, pose: 'walk', t: s.beat * BEAT + 0.2, speed: sheepSpeed(92, v) });
    });
    ashfall(g, t, { n: 80, seed: 31, vy: 55, vx: -30, s0: 1.4, s1: 5, a: 0.85 });
    petals(g, t, { n: 12, seed: 32, vx: -60, s0: 12, s1: 22 });
    s.layer(g, cam, 1.6, (q) => put(q, s, 'street-fg~', -500, 0));
    // 焦外的光斑（镜头跟着她往右走，光斑往左掠过）
    bokeh(g, t, { n: 9, seed: 41, rgb: '255,244,226', y0: 40, y1: 520, r0: 24, r1: 84, a: 0.26, vx: -60 });
    ashfall(g, t, { n: 8, seed: 33, vy: 90, vx: -50, s0: 10, s1: 18, a: 0.5, chips: 0 });
  });

  /** 一把椅子（座面顶在 y - seatH）：style 'wood'（木椅）| 'bistro'（甲板上的金属小椅）；back = 椅背在哪一侧（-1 左 / 1 右） */
  function chair(g, x, y, seatH, o = {}) {
    const s = seatH / 120, back = o.back ?? -1, wood = (o.style || 'wood') === 'wood';
    const c = wood ? '#8a5e40' : '#39415a', c2 = wood ? '#a87a54' : '#56607c';
    g.save(); g.translate(x, y); g.lineCap = 'round';
    // 椅背
    g.strokeStyle = c; g.lineWidth = 10 * s;
    g.beginPath(); g.moveTo(back * 58 * s, -seatH); g.lineTo(back * 66 * s, -seatH - 150 * s); g.stroke();
    if (wood) { g.fillStyle = c2; rrect(g, back * 66 * s - 12 * s, -seatH - 150 * s, 24 * s, 70 * s, 6 * s); g.fill(); }
    else { g.lineWidth = 5 * s; g.beginPath(); g.arc(back * 62 * s, -seatH - 110 * s, 30 * s, -PI / 2 - 0.9, -PI / 2 + 0.9); g.stroke(); }
    // 腿
    g.strokeStyle = c; g.lineWidth = 8 * s;
    for (const lx of [-54, 54]) { g.beginPath(); g.moveTo(lx * s, -seatH); g.lineTo(lx * s * 1.08, 0); g.stroke(); }
    // 座面
    g.fillStyle = c2; rrect(g, -70 * s, -seatH - 12 * s, 140 * s, 16 * s, 6 * s); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(-64 * s, -seatH - 12 * s, 128 * s, 3 * s);
    g.restore();
  }

  /** 一张书桌（正面）：桌面是 top..top+28 的一条，下面是桌子的正面板和两条腿（人坐在它后面，腿被挡住） */
  function desk(g, x0, x1, top, h, o = {}) {
    const c = o.c || '#6a4a3c', c2 = o.c2 || '#8a644e', edge = o.edge || '#a47a5c';
    g.fillStyle = c; g.fillRect(x0 + 16, top + 28, x1 - x0 - 32, h - 28);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x0 + 16, top + 28, x1 - x0 - 32, 18);
    g.fillStyle = c2; g.fillRect(x0 + 40, top + 60, (x1 - x0) * 0.3, 70); g.fillStyle = edge; g.beginPath(); g.arc(x0 + 40 + (x1 - x0) * 0.15, top + 95, 5, 0, TAU); g.fill();
    g.fillStyle = edge; rrect(g, x0, top, x1 - x0, 30, 6); g.fill();
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x0 + 6, top + 3, x1 - x0 - 12, 4);
    g.strokeStyle = 'rgba(30,18,20,.45)'; g.lineWidth = 3; g.strokeRect(x0 + 16, top + 28, x1 - x0 - 32, h - 28);
  }

  /* ---------- 近景：鞋 / 手心 / 法杖 ---------- */
  /** 手（掌心向上），x,y 手腕，s 缩放，rot 旋转 */
  function palmUp(g, x, y, s, rot, curl = 0.2) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
    // 袖口：米白外套 + 红色条纹
    g.fillStyle = '#efe7da'; rrect(g, -190, -70, 170, 140, 30); g.fill();
    g.fillStyle = '#d2334f'; g.fillRect(-60, -70, 16, 140);
    g.strokeStyle = 'rgba(120,100,90,.45)'; g.lineWidth = 3; rrect(g, -190, -70, 170, 140, 30); g.stroke();
    // 手掌
    g.fillStyle = '#ffe3d3'; g.strokeStyle = 'rgba(170,110,95,.7)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-30, -48); g.bezierCurveTo(40, -70, 120, -60, 140, -20); g.bezierCurveTo(150, 20, 120, 50, 60, 52); g.bezierCurveTo(10, 54, -30, 40, -34, 0); g.closePath(); g.fill(); g.stroke();
    // 四指（向前微弯）
    for (let i = 0; i < 4; i++) {
      const fy = -40 + i * 26, len = [70, 80, 76, 60][i];
      g.beginPath(); g.moveTo(120, fy); g.quadraticCurveTo(120 + len * 0.7, fy - 6 - curl * 20, 120 + len, fy + curl * 26); g.lineWidth = 22; g.lineCap = 'round'; g.strokeStyle = 'rgba(170,110,95,.7)'; g.stroke();
      g.lineWidth = 17; g.strokeStyle = '#ffe3d3'; g.stroke();
    }
    // 拇指
    g.beginPath(); g.moveTo(40, -46); g.quadraticCurveTo(80, -110, 130, -96); g.lineWidth = 26; g.strokeStyle = 'rgba(170,110,95,.7)'; g.stroke(); g.lineWidth = 21; g.strokeStyle = '#ffe3d3'; g.stroke();
    g.strokeStyle = 'rgba(200,140,120,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 10); g.quadraticCurveTo(60, -10, 110, 6); g.stroke();
    g.restore();
  }
  /** 纯烬的法杖头：白色枝条 + 彩色叶子 */
  function staffHead(g, x, y, s, t, glow = 0) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.lineCap = 'round'; g.strokeStyle = '#f7f5f0';
    const br = [[0, 0, 0, -260, 18], [0, -120, -90, -230, 10], [0, -170, 80, -270, 9], [-40, -180, -60, -300, 7], [0, -230, 30, -330, 7], [30, -90, 110, -170, 8]];
    for (const [x0, y0, x1, y1, w] of br) { g.lineWidth = w + 4; g.strokeStyle = 'rgba(120,120,140,.5)'; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + 12, (y0 + y1) / 2, x1, y1); g.stroke(); g.lineWidth = w; g.strokeStyle = '#f7f5f0'; g.stroke(); }
    g.strokeStyle = 'rgba(40,40,40,1)'; g.lineWidth = 22; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 600); g.stroke();
    g.strokeStyle = '#f2efe8'; g.lineWidth = 16; g.stroke();
    const cols = ['#f49ab0', '#f6c98a', '#86d3b8', '#7ab8f0', '#a88be0', '#d2334f'];
    const leaves = [[-90, -230, -0.8], [80, -270, 0.6], [-60, -300, -0.3], [30, -330, 0.2], [110, -170, 0.9], [-30, -150, -1.2], [40, -210, 0.8], [0, -260, 0]];
    leaves.forEach(([lx, ly, a], i) => {
      const sw = sin(t * 2 + i) * 0.12;
      g.save(); g.translate(lx, ly); g.rotate(a + sw);
      if (glow) E.glow(g, 0, -20, 40, ['255,170,200', '255,210,150', '150,230,200', '150,200,255', '200,170,255', '255,120,140'][i % 6], glow * 0.6);
      g.fillStyle = cols[i % cols.length]; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(22, -14, 18, -44, 0, -58); g.bezierCurveTo(-18, -44, -22, -14, 0, 0); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -50); g.stroke();
      g.restore();
    });
    g.restore();
  }
  /** 鞋（侧面，朝右）：和角色库里纯烬的鞋一样 —— 淡粉白的厚底鞋、粉色鞋底、红鞋带。x,y 脚底，rot 绕脚踝转，back 远侧那只 */
  function boot(g, x, y, s, lift, flip, rot = 0, back = false) {
    g.save(); g.translate(x, y - lift); g.scale(flip ? -s : s, s);
    if (rot) { g.translate(0, -40); g.rotate(rot); g.translate(0, 40); }
    const body = back ? '#d9c8d0' : '#f5e8ee', sole = back ? '#c98aa0' : '#e8a2ba', ink = 'rgba(90,50,70,.55)';
    // 鞋底（厚）
    g.fillStyle = sole; rrect(g, -52, -26, 178, 28, 12); g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke();
    // 鞋面
    g.fillStyle = body; g.beginPath(); g.moveTo(-46, -26); g.lineTo(-44, -96); g.quadraticCurveTo(-8, -110, 26, -96); g.lineTo(34, -64); g.quadraticCurveTo(100, -66, 120, -30); g.lineTo(120, -26); g.closePath(); g.fill(); g.stroke();
    // 红鞋带
    g.strokeStyle = back ? '#a83a44' : '#d63a36'; g.lineWidth = 4; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(8 + k * 16, -86 + k * 9); g.lineTo(30 + k * 16, -70 + k * 9); g.stroke(); }
    if (!back) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(70, -52, 28, 7, -0.25, 0, TAU); g.fill(); }
    g.restore();
  }
  /**
   * 走路的近景（只看得到小腿、靴子和外套下摆）：每拍落一步（两段骨骼的 IK），身后留下白灰里的脚印
   * b = 镜头里的第几拍（小数）
   */
  function walkCloseup(g, s, t, b) {
    const STEP = 330, GY = 900, HIP = [900, -40], L1 = 560, L2 = 520;
    const worldX = b * STEP; // 身体走了多远
    const n = floor(b);
    // 背景（虚掉的街）+ 地面 + 脚印：城市的冷灰（只留红色）；腿、靴子、外套保持原色
    gradedBg(g, s, 'rain-cool', (q) => {
      q.drawImage(C(s, 'bokeh-street'), 0, -300, 1920, 1080);
      // 地面（往左掠）
      const off = ((worldX % 2400) + 2400) % 2400;
      q.drawImage(C(s, 'pave-close'), -off, GY - 120, 2400, 700); q.drawImage(C(s, 'pave-close'), 2400 - off, GY - 120, 2400, 700);
      q.fillStyle = lin(q, 0, GY - 130, 0, GY - 40, [[0, 'rgba(220,228,240,1)'], [1, 'rgba(220,228,240,0)']]); q.fillRect(0, GY - 130, VW, 90);
      // 脚印：第 i 拍落下的那只脚，世界坐标 = i*STEP + 落点
      for (let i = n - 5; i <= n; i++) {
        const fx = HIP[0] + (i * STEP + STEP * 0.5) - worldX + (i % 2 ? 40 : -40);
        q.fillStyle = 'rgba(120,118,136,.55)'; q.beginPath(); q.ellipse(fx + 70, GY + 8 + (i % 2 ? 16 : -6), 120, 26, 0, 0, TAU); q.fill();
        q.fillStyle = 'rgba(90,88,106,.5)'; q.beginPath(); q.ellipse(fx + 20, GY + 8 + (i % 2 ? 16 : -6), 46, 16, 0, 0, TAU); q.fill();
      }
    }, 0.7);
    // 两条腿：相差一拍
    const leg = (phase, back) => {
      const ph = fract(phase / 2), stance = ph < 0.5;
      const u = stance ? ph * 2 : (ph - 0.5) * 2;
      const fx = stance ? lerp(STEP * 0.5, -STEP * 0.5, u) : lerp(-STEP * 0.5, STEP * 0.5, ease.inOut(u));
      const lift = stance ? 0 : sin(PI * u) * 150;
      const F = [HIP[0] + fx + (back ? -40 : 40), GY - lift + (back ? -10 : 8)];
      const Ak = [F[0] - 10, F[1] - 190]; // 脚踝（IK 的目标）
      const dx = Ak[0] - HIP[0], dy = Ak[1] - HIP[1], d = min(L1 + L2 - 1, hypot(dx, dy));
      const a = atan2(dy, dx), k = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      const K = [HIP[0] + cos(a - k) * L1, HIP[1] + sin(a - k) * L1];
      const toe = stance ? (u < 0.15 ? -0.25 * (1 - u / 0.15) : u > 0.8 ? (u - 0.8) * 1.4 : 0) : 0.35 * sin(PI * u) - 0.1;
      g.save();
      g.strokeStyle = back ? '#1f1a25' : '#2a2430'; g.lineCap = 'round';
      g.lineWidth = 92; g.beginPath(); g.moveTo(HIP[0], HIP[1]); g.lineTo(K[0], K[1]); g.stroke();
      g.lineWidth = 76; g.beginPath(); g.moveTo(K[0], K[1]); g.lineTo(Ak[0], Ak[1]); g.stroke();
      // 小腿上的两道红色绑带
      g.strokeStyle = back ? '#9a2c36' : '#c8323c'; g.lineWidth = 14; g.lineCap = 'butt';
      for (const f of [0.45, 0.8]) { const cx = lerp(K[0], Ak[0], f), cy = lerp(K[1], Ak[1], f), nx = -(Ak[1] - K[1]), ny = Ak[0] - K[0], nl = hypot(nx, ny); g.beginPath(); g.moveTo(cx - (nx / nl) * 40, cy - (ny / nl) * 40); g.lineTo(cx + (nx / nl) * 40, cy + (ny / nl) * 40); g.stroke(); }
      g.restore();
      boot(g, F[0] - 20, F[1], 2.3, 0, false, toe, back);
    };
    leg(b + 1, true);
    leg(b, false);
    // 外套下摆（米白，红色条纹），随着步子摆
    const sw = sin(b * PI) * 18;
    // 深色的裙摆（外套里面）+ 米白外套的下摆（红色条纹、红色衬里的一角）
    g.fillStyle = '#3b3447'; g.beginPath(); g.moveTo(560, -20); g.lineTo(1260, -20); g.lineTo(1250 + sw, 120); g.quadraticCurveTo(900, 150, 580 + sw, 120); g.closePath(); g.fill();
    g.fillStyle = '#b8323b'; g.beginPath(); g.moveTo(1300, -20); g.lineTo(1420, -20); g.quadraticCurveTo(1440 + sw, 200, 1400 + sw * 1.6, 300); g.lineTo(1330 + sw * 1.4, 290); g.closePath(); g.fill();
    g.fillStyle = '#efe7da';
    g.beginPath(); g.moveTo(420, -20); g.lineTo(1330, -20); g.quadraticCurveTo(1350 + sw, 200, 1330 + sw * 1.4, 292); g.quadraticCurveTo(900 + sw, 330, 440 + sw * 1.2, 290); g.quadraticCurveTo(400, 150, 420, -20); g.fill();
    g.strokeStyle = '#c23b3b'; g.lineWidth = 22; g.beginPath(); g.moveTo(448 + sw * 1.2, 262); g.quadraticCurveTo(900 + sw, 300, 1322 + sw * 1.4, 266); g.stroke();
    g.strokeStyle = 'rgba(120,100,90,.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(440 + sw * 1.2, 290); g.quadraticCurveTo(900 + sw, 330, 1400 + sw * 1.6, 300); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.12)'; g.beginPath(); g.moveTo(900, -20); g.quadraticCurveTo(930 + sw, 150, 900 + sw, 320); g.lineTo(880 + sw, 320); g.quadraticCurveTo(900, 150, 880, -20); g.fill();
    // 被靴子踢起的灰
    const kickAge = fract(b) * BEAT;
    for (let i = 0; i < 10; i++) { const a = -PI * (0.55 + 0.4 * hash(66, i + n * 10, 1)), v = 200 + 300 * hash(66, i, 2); const x = HIP[0] + STEP * 0.5 - 60 + cos(a) * v * kickAge, y = GY + sin(a) * v * kickAge + 900 * kickAge * kickAge; g.globalAlpha = 0.8 * (1 - fract(b)); g.drawImage(flakeSpr(), x - 7, y - 7, 14, 14); }
    g.globalAlpha = 1;
    ashfall(g, t, { n: 40, seed: 61, vy: 90, vx: -40, s0: 3, s1: 12, a: 0.9 });
    ashfall(g, t, { n: 7, seed: 62, vy: 140, vx: -60, s0: 22, s1: 36, a: 0.5, chips: 0 });
  }
  def('bokeh-street', 1920, 1080, (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 1080, [[0, '#7fb6ea'], [0.45, '#cfe2f3'], [0.7, '#efe6dc'], [1, '#e2ddd8']]); q.fillRect(0, 0, 1920, 1080);
    // 虚掉的店面色块
    const R = rng(71);
    for (let i = 0; i < 9; i++) { const x = i * 230 - 40 + R() * 60; q.fillStyle = ['rgba(243,226,208,.7)', 'rgba(222,232,242,.7)', 'rgba(239,216,210,.7)', 'rgba(232,224,238,.7)'][i % 4]; q.fillRect(x, 380 + R() * 60, 200 + R() * 60, 700); }
    q.fillStyle = 'rgba(255,255,255,.45)'; q.fillRect(0, 360, 1920, 720);
    // 柔和的光斑
    for (let i = 0; i < 34; i++) { const x = R() * 1920, y = 250 + R() * 700, r = 30 + R() * 110; const c = ['255,255,255', '255,248,236', '200,220,245', '255,190,200'][i % 4]; q.fillStyle = rad(q, x, y, r * 0.6, r, [[0, `rgba(${c},${0.35 + R() * 0.25})`], [1, `rgba(${c},0)`]]); q.fillRect(x - r, y - r, r * 2, r * 2); }
  });
  def('pave-close', 2400, 700, (q, w, h) => {
    q.fillStyle = '#cfccd0'; q.fillRect(0, 0, w, h);
    q.strokeStyle = 'rgba(110,108,122,.45)'; q.lineWidth = 4;
    for (let x = 0; x < w; x += 260) { q.beginPath(); q.moveTo(x, 0); q.lineTo(x - 120, h); q.stroke(); }
    for (let y = 80; y < h; y += 230) { q.beginPath(); q.moveTo(0, y); q.lineTo(w, y); q.stroke(); }
    const R = rng(8);
    // 石板的明暗
    for (let x = 0; x < w; x += 260) for (let y = 80; y < h; y += 230) { q.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '90,88,110'},${0.06 + R() * 0.08})`; poly(q, [[x, y], [x + 260, y], [x + 260 - 120 * (230 / h), y + 230], [x - 120 * (230 / h), y + 230]]); q.fill(); }
    // 积在石板上的白灰（成片 + 零星）
    for (let i = 0; i < 60; i++) { q.fillStyle = `rgba(250,251,253,${0.5 + R() * 0.4})`; q.beginPath(); q.ellipse(R() * w, R() * h, 30 + R() * 110, 8 + R() * 22, (R() - 0.5) * 0.3, 0, TAU); q.fill(); }
    for (let i = 0; i < 900; i++) { q.fillStyle = `rgba(255,255,255,${0.5 + R() * 0.5})`; q.beginPath(); q.ellipse(R() * w, R() * h, 2 + R() * 8, 1 + R() * 4, R(), 0, TAU); q.fill(); }
    q.fillStyle = 'rgba(255,255,255,.2)'; q.fillRect(0, 0, w, h);
  });

  // 6 · 近景三连：踩在白灰上的靴子 / 手心接住一片还带着余温的灰 / 花瓣落在法杖的叶子上
  shot('st-detail', bar(12), { pre: ['bokeh-street', 'pave-close'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const b = (t - bar(12)) / BEAT; // 镜头内第几拍
    // 三个特写各自慢慢推近一点（镜头不是死的）
    const sub = b < 4 ? b / 4 : b < 6 ? (b - 4) / 2 : (b - 6) / 2, zk = 1 + 0.045 * ease.out(clamp(sub));
    g.save(); g.translate(960, 540); g.scale(zk, zk); g.translate(-960, -540);
    if (b < 4) {
      walkCloseup(g, s, t, b);
    } else if (b < 6) {
      // 手心：一片灰落进掌心，芯里还有一点橙色的余温，慢慢冷成白色
      gradedBg(g, s, 'rain-cool', (q) => q.drawImage(C(s, 'bokeh-street'), 0, 0, 1920, 1080), 0.7);
      const k = (b - 4) / 2;
      palmUp(g, 820, 700, 1.7, -0.08, 0.25);
      const land = min(1, k * 2.2), fx = 1040 + (1 - land) * 60, fy = 560 - (1 - ease.out(land)) * 420;
      const hot = land >= 1 ? Math.exp(-(k - 0.45) * 4) : 1;
      E.glow(g, fx, fy, 60, '255,140,60', 0.6 * hot);
      E.glow(g, fx, fy, 18, '255,220,170', 0.8 * hot);
      g.drawImage(chipSpr(), 32, 0, 32, 32, fx - 22, fy - 16, 44, 32);
      ashfall(g, t, { n: 30, seed: 63, vy: 50, vx: -20, s0: 4, s1: 16, a: 0.8 });
    } else {
      // 法杖：一片红色花瓣落在叶子上
      gradedBg(g, s, 'rain-cool', (q) => q.drawImage(C(s, 'bokeh-street'), 0, 0, 1920, 1080), 0.7);
      const k = (b - 6) / 2;
      staffHead(g, 1000, 900, 1.9, t, 0.3);
      const px = 860 + (1 - ease.out(k)) * 200, py = 380 - (1 - ease.out(k)) * 500;
      const sheet = petalSheet('#d2334f');
      g.drawImage(sheet, (floor(k * 10) % 12) * 40, 0, 40, 40, px - 30, py - 30, 60, 60);
      ashfall(g, t, { n: 30, seed: 64, vy: 60, vx: -20, s0: 4, s1: 14, a: 0.8 });
    }
    g.restore();
    bokeh(g, t, { n: 7, seed: 61, rgb: '255,246,236', y0: 60, y1: 700, r0: 30, r1: 90, a: 0.22 });
    vigS(g, s, 0.3);
  });

  /* ---------- 路口：一点透视的街，尽头是天 ---------- */
  // 画布往上多留 400：镜头最后仰到天上时，电车线一直伸出画面，不会在半空里被画布边缘截断
  def('cross-street', 2016, 1800, (q) => {
    q.translate(48, 400);
    const VPX = 960, VPY = 600;
    const onL = (x0, y0, x) => y0 + (VPY - y0) * ((x - x0) / (VPX - x0)); // 从 (x0,y0) 指向消失点的线在 x 处的 y
    const FL = VPX - 170, FR = VPX + 170;
    // 街尽头的低楼与小尖塔
    q.fillStyle = '#c9d6e8'; q.fillRect(FL, 470, FR - FL, 260); q.fillStyle = '#b9c9e0'; poly(q, [[930, 470], [960, 380], [990, 470]]); q.fill(); q.fillRect(956, 350, 8, 40);
    q.fillStyle = 'rgba(255,255,255,.5)'; for (let y = 490; y < 700; y += 26) for (let x = FL + 14; x < FR - 14; x += 22) q.fillRect(x, y, 10, 12);
    // 左右两排楼（立面朝向街心，楼顶线也收向消失点）
    const L1 = [[-140, 150], [FL, onL(-140, 150, FL)], [FL, onL(-140, 1400, FL)], [-140, 1400]];
    facade(q, L1, { base: '#efe1d3', shade: [[0, 'rgba(255,255,255,.1)'], [1, 'rgba(110,100,140,.35)']], rows: 6, cols: 6, v0: 0.05, v1: 0.8, frame: '#fbf6ef', seed: 12, fs: 1.6, flowers: 0.5, balcony: 0.3, cornice: '#dcc7b4', ink: 'rgba(60,60,96,.5)' });
    const R1 = [[FR, onL(2100, 60, FR)], [2100, 60], [2100, 1400], [FR, onL(2100, 1400, FR)]];
    facade(q, R1, { base: '#dfe5ef', shade: [[0, 'rgba(110,110,150,.35)'], [1, 'rgba(255,255,255,.1)']], rows: 7, cols: 6, v0: 0.05, v1: 0.8, frame: '#f6f8fb', seed: 13, fs: -0.62, flowers: 0.3, cornice: '#c6cfdd', ink: 'rgba(60,60,96,.5)' });
    // 楼顶的烟囱、天线
    q.fillStyle = '#8a6a60';
    for (const u of [0.12, 0.3, 0.55]) { const x = lerp(-140, FL, u), y = onL(-140, 150, x); q.fillRect(x, y - 60 * (1 - u * 0.7), 22 * (1 - u * 0.6), 60 * (1 - u * 0.7)); }
    q.strokeStyle = '#46506e'; q.lineWidth = 3;
    for (const u of [0.2, 0.6]) { const x = lerp(2100, FR, u), y = onL(2100, 60, x); q.beginPath(); q.moveTo(x, y); q.lineTo(x, y - 90 * (1 - u * 0.6)); q.moveTo(x - 20 * (1 - u * 0.6), y - 60 * (1 - u * 0.6)); q.lineTo(x + 20 * (1 - u * 0.6), y - 60 * (1 - u * 0.6)); q.stroke(); }
    // 一层的雨棚
    for (const [Q, a, b] of [[L1, '#d2334f', '#fbf6ef'], [R1, '#4f7fc0', '#fbf6ef']]) {
      const band = sub(Q, 0, 0.8, 1, 0.86);
      for (let i = 0; i < 12; i++) { const S = sub(band, i / 12, 0, (i + 1) / 12, 1); poly(q, S); q.fillStyle = i % 2 ? b : a; q.fill(); }
    }
    // 路面
    q.fillStyle = lin(q, 0, VPY, 0, 1400, [[0, '#c9ccd6'], [1, '#9ea3b2']]);
    poly(q, [[FL, onL(-140, 1400, FL)], [FR, onL(2100, 1400, FR)], [2100, 1400], [-140, 1400]]); q.fill();
    // 斑马线
    for (let i = 0; i < 9; i++) {
      const u0 = (i + 0.1) / 9, u1 = (i + 0.55) / 9, yA = 1150, yB = 1300;
      const xa = (y, u) => { const f = (y - VPY) / (1400 - VPY); const l = lerp(VPX - 20, -140, f), r = lerp(VPX + 20, 2100, f); return lerp(l, r, u); };
      poly(q, [[xa(yA, u0), yA], [xa(yA, u1), yA], [xa(yB, u1), yB], [xa(yB, u0), yB]]); q.fillStyle = 'rgba(250,250,252,.92)'; q.fill();
    }
    // 路中线
    q.strokeStyle = 'rgba(255,255,255,.7)'; q.lineWidth = 5; q.setLineDash([40, 50]); q.beginPath(); q.moveTo(VPX, 670); q.lineTo(VPX, 1120); q.stroke(); q.setLineDash([]);
    // 电车线：两根顺着街道收向远处，一直伸出画面上沿
    q.strokeStyle = 'rgba(40,48,76,.6)'; q.lineWidth = 3;
    for (const dx of [-60, 60]) { q.beginPath(); q.moveTo(VPX + dx * 0.2, 470); q.lineTo(VPX + dx * 0.2 + (dx * 5.8) * (850 / 510), -380); q.stroke(); }
    // 横跨街道的吊线：两头都挂在楼面上（楼顶线往下 22% 的地方），不会飘在楼顶上面的天空里
    const topL = (x) => onL(-140, 150, x), botL = (x) => onL(-140, 1400, x), topR = (x) => onL(2100, 60, x), botR = (x) => onL(2100, 1400, x);
    q.lineWidth = 2.4;
    for (const f of [0.12, 0.3, 0.52, 0.78]) {
      const xl = lerp(FL, -140, f), xr = lerp(FR, 2100, f);
      const yl = topL(xl) + 0.22 * (botL(xl) - topL(xl)), yr = topR(xr) + 0.22 * (botR(xr) - topR(xr));
      q.beginPath(); q.moveTo(xl, yl); q.quadraticCurveTo((xl + xr) / 2, (yl + yr) / 2 + 26 * f + 6, xr, yr); q.stroke();
      q.fillStyle = 'rgba(40,48,76,.7)'; q.fillRect(xl - 3, yl - 3, 6, 6); q.fillRect(xr - 3, yr - 3, 6, 6);
    }
  });

  // 7 · 路口 —— 她停在斑马线前抬头；镜头往上摇，整片天空，花瓣往上卷
  shot('st-sky', bar(14), { pre: ['sky-city', 'cl-a', 'cl-b', 'cl-d', 'city-far', 'cross-street'] }, (g, s) => {
    const t = s.t, p = s.p;
    const up = ease.inOut(sstep(0.25, 1, p));
    const cam = { x: 960, y: 640 - 520 * up, z: 1.02 + 0.06 * (1 - up), ...s.handheld(51, t, 3) };
    sky(g, s, 'sky-city', -200, 1400);
    s.layer(g, cam, 0.2, (q) => { q.drawImage(C(s, 'cl-a'), 500 - s.lt * 6, -260, 1300, 614); q.drawImage(C(s, 'cl-b'), -100 - s.lt * 7, -40, 900, 450); q.drawImage(C(s, 'cl-d'), 1100 - s.lt * 5, 80, 900, 340); q.drawImage(C(s, 'cl-c'), 300 - s.lt * 8, 280, 700, 325); });
    // 城市（远楼、路口）冷灰、只留红色；她和小黑羊保持原色
    gradedBg(g, s, 'rain-cool', (gq) => {
      s.layer(gq, cam, 0.5, (q) => put(q, s, 'city-far~', -48, -100));
      s.layer(gq, cam, 1, (q) => put(q, s, 'cross-street', -48, -480));
    }, 0.85);
    s.layer(g, cam, 1, (q) => {
      adele(q, { x: 960, y: 1210, h: 330, pose: 'look-up', view: 'back3', t, expr: 'smile', wind: 0.5, windDir: 1, look: [0.2, -1], rim: '255,248,228', rimDir: -1.1, rimGlow: 0.1 });
      cast(q, 'sheep-black', { shadow: 0.2, x: 1080, y: 1214, h: 80, pose: 'stand', t: t + 1 });
    });
    ashfall(g, t, { n: 90, seed: 71, vy: 50, vx: 10, s0: 1.5, s1: 6, a: 0.85 });
    // 往上卷的花瓣（风从街口往天上吹）
    petals(g, t, { n: 26, seed: 72, vy: -120 - 200 * up, vx: 40, sway: 80, s0: 14, s1: 30 });
    s.kit.rays(g, t, { x: 1500, y: -200, n: 6, len: 1600, angle: PI / 2 + 0.5, rgb: '255,250,235', alpha: 0.12 * up });
    bokeh(g, t, { n: 8, seed: 51, rgb: '255,246,230', x0: 900, x1: 2000, y0: 0, y1: 520, r0: 20, r1: 70, a: 0.3 * (0.3 + 0.7 * up) });
  });

  /* =========================================================
   * 二 · 想要留住的声音（29.56 – 45.66）：罗德岛。录音机、读唇、小粉羊偷走冰淇淋
   * ========================================================= */
  /** 声波：从 (x, y) 向 dir 方向荡开的弧。muffle>0 时弧在半路变灰、断成点（她听不清） */
  function soundRings(g, x, y, t, o = {}) {
    const n = o.n ?? 4, per = o.per ?? BEAT * 2, maxR = o.r ?? 420, dir = o.dir ?? 0, spread = o.spread ?? 0.7, rgb = o.rgb || '255,255,255', A = o.a ?? 0.6;
    g.save(); g.globalCompositeOperation = o.mode || 'lighter'; g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const ph = fract(t / per + i / n), r = 30 + ph * maxR;
      let a = A * (1 - ph) * min(1, ph * 6);
      if (o.muffle) { const m = sstep(maxR * 0.25, maxR * 0.6, r) * o.muffle; a *= 1 - m * 0.8; if (m > 0.2) g.setLineDash([3, 16 + 30 * m]); else g.setLineDash([]); }
      if (a <= 0.01) continue;
      g.strokeStyle = `rgba(${o.muffle && r > maxR * 0.3 ? '190,196,210' : rgb},${a})`; g.lineWidth = (o.w ?? 5) * (1 - ph * 0.6);
      g.beginPath(); g.arc(x, y, r, dir - spread, dir + spread); g.stroke();
    }
    g.restore();
  }
  /* ---------- 录音机（本页原创的造型：米白机身、深蓝面板、红色录音键） ---------- */
  def('rec-body', 1000, 620, (q) => {
    q.lineJoin = 'round';
    // 提手
    q.strokeStyle = '#2b3148'; q.lineWidth = 30; q.lineCap = 'round';
    q.beginPath(); q.moveTo(170, 150); q.bezierCurveTo(190, 20, 810, 20, 830, 150); q.stroke();
    q.strokeStyle = 'rgba(255,255,255,.18)'; q.lineWidth = 6; q.beginPath(); q.moveTo(210, 110); q.bezierCurveTo(240, 50, 760, 50, 790, 110); q.stroke();
    // 机身
    rrect(q, 20, 130, 960, 470, 50); q.fillStyle = lin(q, 0, 130, 0, 600, [[0, '#f4f0e8'], [0.5, '#e9e4da'], [1, '#d4cec3']]); q.fill();
    q.strokeStyle = '#6c6a74'; q.lineWidth = 4; q.stroke();
    q.fillStyle = 'rgba(255,255,255,.55)'; rrect(q, 40, 140, 920, 20, 10); q.fill();
    // 面板
    rrect(q, 52, 196, 896, 376, 32); q.fillStyle = lin(q, 0, 196, 0, 572, [[0, '#353d5a'], [1, '#262c44']]); q.fill();
    // 喇叭网
    rrect(q, 84, 226, 360, 316, 24); q.fillStyle = '#20263b'; q.fill();
    q.fillStyle = '#4a5374';
    for (let y = 246; y < 530; y += 18) for (let x = 104; x < 430; x += 18) q.fillRect(x, y, 7, 7);
    q.fillStyle = 'rgba(255,255,255,.08)'; rrect(q, 84, 226, 360, 60, 24); q.fill();
    // 磁带仓
    rrect(q, 478, 222, 440, 250, 20); q.fillStyle = '#161a2a'; q.fill();
    rrect(q, 500, 238, 396, 218, 14); q.fillStyle = '#efe9dc'; q.fill();
    q.fillStyle = '#ffffff'; rrect(q, 520, 250, 356, 66, 8); q.fill();
    q.fillStyle = '#d2334f'; q.fillRect(520, 250, 356, 10);
    E.text(q, '想要留住的声音', 698, 300, { size: 30, weight: 700, color: '#3b3550', spacing: 3 });
    q.fillStyle = '#2a2230'; rrect(q, 574, 330, 248, 100, 48); q.fill();
    q.fillStyle = 'rgba(255,255,255,.12)'; rrect(q, 478, 222, 440, 30, 20); q.fill();
    // 电平表
    rrect(q, 500, 490, 190, 64, 10); q.fillStyle = '#f7efd8'; q.fill(); q.strokeStyle = '#8a8272'; q.lineWidth = 2; q.stroke();
    q.strokeStyle = '#3b3550'; q.lineWidth = 2; q.beginPath(); q.arc(595, 600, 88, -2.3, -0.84); q.stroke();
    q.strokeStyle = '#d2334f'; q.lineWidth = 4; q.beginPath(); q.arc(595, 600, 88, -1.1, -0.84); q.stroke();
    // 小字（本页原创的型号）
    E.text(q, 'MEMO · 01', 850, 542, { font: 'display', size: 22, weight: 700, color: '#c9cde0', spacing: 4 });
    // 麦克风孔
    q.fillStyle = '#20263b'; q.beginPath(); q.arc(944, 170, 12, 0, TAU); q.fill();
  });
  /** 录音机：x,y 左上，s 缩放；rec 0..1 录音键按下；spin 磁带转了多少（圈）；vu 0..1 */
  function recorder(g, s, x, y, sc, o = {}) {
    g.save(); g.translate(x, y); g.scale(sc, sc);
    // 按键（在机身上沿）
    const keys = ['#d2334f', '#e8e3d8', '#e8e3d8', '#e8e3d8', '#e8e3d8', '#e8e3d8'];
    for (let i = 0; i < 6; i++) {
      const dn = i === 0 ? (o.rec || 0) * 14 : 0;
      g.fillStyle = '#4a4f66'; rrect(g, 230 + i * 92, 108 + dn, 80, 40, 8); g.fill();
      g.fillStyle = keys[i]; rrect(g, 234 + i * 92, 104 + dn, 72, 30, 7); g.fill();
      if (i === 0) { g.fillStyle = '#fff'; g.beginPath(); g.arc(270, 119 + dn, 7, 0, TAU); g.fill(); }
      else { g.fillStyle = '#6a6f86'; const cx = 270 + i * 92, cy = 119; g.beginPath(); if (i === 1) { g.moveTo(cx - 6, cy - 8); g.lineTo(cx + 8, cy); g.lineTo(cx - 6, cy + 8); } else if (i === 4) g.rect(cx - 7, cy - 7, 14, 14); else { g.rect(cx - 8, cy - 7, 5, 14); g.rect(cx + 3, cy - 7, 5, 14); } g.fill(); }
    }
    g.drawImage(C(s, 'rec-body'), 0, 0, 1000, 620);
    // 磁带盘
    const spin = o.spin || 0;
    for (const [cx, full] of [[640, 0.62], [756, 0.38]]) {
      const r = 22 + 26 * full;
      g.fillStyle = '#5a3a2c'; g.beginPath(); g.arc(cx, 380, r, 0, TAU); g.fill();
      g.fillStyle = '#f4f1ea'; g.beginPath(); g.arc(cx, 380, 20, 0, TAU); g.fill();
      g.save(); g.translate(cx, 380); g.rotate(spin * TAU);
      g.fillStyle = '#3b3550'; for (let k = 0; k < 6; k++) { g.rotate(TAU / 6); g.fillRect(-3, 8, 6, 10); }
      g.restore();
    }
    // 电平表指针
    const ang = -2.2 + 1.3 * clamp(o.vu || 0);
    g.strokeStyle = '#2a2230'; g.lineWidth = 3; g.beginPath(); g.moveTo(595, 600); g.lineTo(595 + cos(ang) * 96, 600 + sin(ang) * 96); g.stroke();
    // 录音指示灯
    const led = o.led || 0;
    g.fillStyle = led > 0.05 ? '#ff5a6e' : '#6a2a36'; g.beginPath(); g.arc(760, 522, 11, 0, TAU); g.fill();
    if (led > 0.05) E.glow(g, 760, 522, 50, '255,80,100', led);
    g.restore();
  }
  /** 伸出食指按键的手（从右上方伸进来） */
  function fingerHand(g, x, y, s, rot) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
    g.fillStyle = '#efe7da'; rrect(g, 60, -80, 260, 160, 40); g.fill(); g.strokeStyle = 'rgba(120,100,90,.45)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#d2334f'; g.fillRect(90, -80, 18, 160);
    g.fillStyle = '#ffe3d3'; g.strokeStyle = 'rgba(170,110,95,.7)';
    g.beginPath(); g.moveTo(70, -60); g.bezierCurveTo(10, -70, -40, -40, -44, 0); g.bezierCurveTo(-46, 44, 10, 64, 70, 58); g.closePath(); g.fill(); g.stroke();
    // 蜷着的三指
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(-30 + i * 6, -8 + i * 22, 26, 14, 0.3, 0, TAU); g.fill(); g.stroke(); }
    // 食指
    g.lineCap = 'round'; g.beginPath(); g.moveTo(-10, -40); g.lineTo(-120, -64); g.lineWidth = 34; g.strokeStyle = 'rgba(170,110,95,.7)'; g.stroke(); g.lineWidth = 29; g.strokeStyle = '#ffe3d3'; g.stroke();
    g.fillStyle = '#ffd0d6'; g.beginPath(); g.ellipse(-122, -64, 9, 11, 0.2, 0, TAU); g.fill();
    g.restore();
  }
  // 书桌近景：暖色木纹 + 左边窗口进来的光。分成两层：远处虚掉的墙（视差 0.6）和桌面（和录音机同一层，录音机不会在桌面上滑）
  // 两层都按原来的 1920×1080 构图画，贴图时横向 ×1.0625、纵向 ×1.0556（和原来一样）
  const DESK_TOP = 598;
  def('desk-close-wall', 1920, 660, (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 640, [[0, '#9fb3c9'], [1, '#c7d3df']]); q.fillRect(0, 0, 1920, 660);
    const R = rng(3);
    // 虚掉的室内：书架、植物、窗
    q.globalAlpha = 0.5;
    q.fillStyle = '#f6f9fc'; rrect(q, -80, 40, 700, 520, 30); q.fill();
    for (let i = 0; i < 12; i++) { q.fillStyle = ['#8aa0bb', '#c98a7a', '#e2c38a', '#7f9f8c', '#a58fc0'][i % 5]; rrect(q, 1100 + i * 58, 180 + (i % 3) * 10, 46, 200 - (i % 3) * 10, 8); q.fill(); }
    q.fillStyle = '#5f8a6a'; for (let i = 0; i < 9; i++) { q.beginPath(); q.ellipse(1640 + R() * 180, 260 + R() * 200, 60, 30, R() * 3, 0, TAU); q.fill(); }
    q.globalAlpha = 1;
  });
  def('desk-close-top', 1920, 1080 - DESK_TOP + 90, (q) => {
    q.translate(0, -DESK_TOP + 90);
    const R = rng(4);
    // 桌面（上沿多画一点：浮石罐立在桌面靠后的地方，罐身伸到桌沿上方）
    q.fillStyle = lin(q, 0, 600, 0, 1080, [[0, '#c9a07a'], [1, '#9b6f4c']]); q.fillRect(0, 600, 1920, 480);
    q.strokeStyle = 'rgba(110,70,40,.25)'; q.lineWidth = 3;
    for (let i = 0; i < 16; i++) { const y = 630 + i * 30 + R() * 10; q.beginPath(); q.moveTo(0, y); for (let x = 0; x <= 1920; x += 80) q.lineTo(x, y + sin(x * 0.004 + i) * 6); q.stroke(); }
    q.fillStyle = 'rgba(255,255,255,.35)'; q.fillRect(0, DESK_TOP, 1920, 5);
    // 窗光落在桌上
    q.fillStyle = 'rgba(255,246,220,.28)'; poly(q, [[0, 640], [760, 640], [1200, 1080], [0, 1080]]); q.fill();
    // 桌上的小东西：浮石罐、笔记本
    q.fillStyle = '#e8dcc6'; rrect(q, 1480, 700, 300, 60, 8); q.fill(); q.fillStyle = '#d2334f'; q.fillRect(1500, 700, 14, 60);
    q.fillStyle = 'rgba(200,220,240,.6)'; rrect(q, 200, 520, 150, 150, 20); q.fill(); q.strokeStyle = 'rgba(120,140,170,.7)'; q.lineWidth = 3; q.stroke();
    for (let i = 0; i < 6; i++) { q.fillStyle = ['#b9b2a6', '#9d968c', '#d6cfc2'][i % 3]; q.beginPath(); q.ellipse(230 + (i % 3) * 40, 630 - floor(i / 3) * 34, 20, 15, 0.3, 0, TAU); q.fill(); }
    q.fillStyle = 'rgba(0,0,0,.1)'; q.beginPath(); q.ellipse(275, 672, 80, 7, 0, 0, TAU); q.fill();
  });

  // 8 · 录音 —— 手指按下红色的录音键，磁带转起来，“想要留住的声音”
  shot('ri-tape', bar(16), { title: '想要留住的声音', in: { type: 'tear', dur: 0.9, seed: 5 }, pre: ['desk-close-wall', 'desk-close-top', 'rec-body'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const press = bar(16) + BEAT * 2;
    const pk = t < press ? sstep(press - 0.5, press, t) : 1 - 0.3 * sstep(press, press + 0.4, t);
    const recOn = t > press;
    const cam = { x: 980, y: 560, z: 1.08 + 0.05 * s.p, ...s.handheld(61, t, 3) };
    const KY = 1140 / 1080;
    s.layer(g, cam, 0.6, (q) => q.drawImage(C(s, 'desk-close-wall'), -60, -30, 2040, 660 * KY));
    s.layer(g, cam, 1, (q) => {
      // 桌面和录音机在同一层（录音机放在桌面上，镜头推的时候两者一起动）
      q.drawImage(C(s, 'desk-close-top'), -60, -30 + (DESK_TOP - 90) * KY, 2040, (1080 - DESK_TOP + 90) * KY);
      // 录音机压在桌面上的影子（贴地的一条暗影 + 往右下拖的一点投影，光从左上的窗来）
      groundShadow(q, 470 + 500, 250 + 600, 520, 0.42, '70,44,30');
      groundShadow(q, 470 + 560, 250 + 612, 560, 0.18, '70,44,30');
      recorder(q, s, 470, 250, 1.0, { rec: recOn ? 1 : pk * 0.4, spin: recOn ? (t - press) * 0.55 : 0, vu: recOn ? 0.25 + 0.7 * s.raw('rms') : 0.05, led: recOn ? 0.55 + 0.45 * s.pulse(3) : 0 });
      // 手：从右上伸进来按键，按完退出去
      const inK = sstep(press - 1.1, press - 0.2, t) * (1 - sstep(press + 0.5, press + 1.4, t));
      fingerHand(q, lerp(1500, 860, inK), lerp(-120, 250 + pk * 16, inK), 1.2, 0.35);
      if (recOn) soundRings(q, 470 + 944, 250 + 170, t, { n: 5, per: BEAT * 2, r: 520, dir: -PI / 2 - 0.4, spread: 0.9, rgb: '255,250,235', a: 0.55 });
    });
    motes(g, t, { n: 26, seed: 8, x0: 0, x1: 900, y0: 100, y1: 800, rgb: '255,240,200', a: 0.5, s: 6 });
    s.kit.rays(g, t, { x: -100, y: -80, n: 5, len: 1500, angle: 0.75, spread: 0.35, rgb: '255,244,214', alpha: 0.14 });
    vigS(g, s, 0.35);
  });

  /* ---------- 圆形的小画面（录进磁带的声音 / 回忆的石头） ---------- */
  const VG = {};
  function vgDef(key, fn) { VG[key] = true; def('vg-' + key, 280, 280, (q) => { q.save(); q.beginPath(); q.arc(140, 140, 136, 0, TAU); q.clip(); fn(q); q.restore(); q.strokeStyle = 'rgba(255,255,255,.9)'; q.lineWidth = 5; q.beginPath(); q.arc(140, 140, 134, 0, TAU); q.stroke(); }); }
  vgDef('volcano', (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 280, [[0, '#2b2446'], [0.6, '#b8607a'], [1, '#f2a36a']]); q.fillRect(0, 0, 280, 280);
    q.fillStyle = '#231b2a'; poly(q, [[0, 280], [0, 230], [100, 130], [120, 122], [160, 122], [180, 130], [280, 220], [280, 280]]); q.fill();
    E.glow(q, 140, 124, 60, '255,140,60', 0.9); for (let i = 0; i < 6; i++) { q.fillStyle = `rgba(240,230,240,${0.35 - i * 0.04})`; q.beginPath(); q.arc(140 + i * 14, 100 - i * 16, 18 + i * 6, 0, TAU); q.fill(); }
  });
  vgDef('cafe', (q) => {
    q.fillStyle = '#5a3a36'; q.fillRect(0, 0, 280, 280);
    q.fillStyle = lin(q, 0, 40, 0, 220, [[0, '#ffd9a0'], [1, '#f2a060']]); rrect(q, 36, 44, 208, 150, 12); q.fill();
    for (const [x, h] of [[80, 70], [130, 84], [180, 74], [222, 66]]) { q.fillStyle = '#3a2428'; q.beginPath(); q.arc(x, 196 - h, 16, 0, TAU); q.fill(); q.fillRect(x - 18, 196 - h + 14, 36, h); }
    q.fillStyle = '#fff4dc'; for (const [x, y] of [[70, 70], [150, 60], [210, 90]]) { q.beginPath(); q.arc(x, y, 7, 0, TAU); q.fill(); q.fillRect(x + 5, y - 26, 3, 26); }
    q.fillStyle = '#8a5a44'; q.fillRect(0, 200, 280, 80);
  });
  vgDef('lawn', (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 160, [[0, '#8cc4f0'], [1, '#dcefff']]); q.fillRect(0, 0, 280, 160);
    q.fillStyle = '#7fbf6a'; q.fillRect(0, 150, 280, 130); q.fillStyle = '#6aa85a'; q.beginPath(); q.ellipse(140, 150, 200, 20, 0, 0, TAU); q.fill();
    q.fillStyle = '#2f3d4a'; rrect(q, 170, 96, 70, 50, 4); q.fill(); q.strokeStyle = '#f4f1ea'; q.lineWidth = 2; q.beginPath(); q.moveTo(180, 110); q.lineTo(226, 110); q.moveTo(180, 122); q.lineTo(214, 122); q.stroke();
    for (const [x, y, c] of [[60, 190, '#f2d4c0'], [100, 214, '#c9d8ee'], [150, 206, '#f4e0a8'], [196, 196, '#e8c0cc'], [120, 176, '#b9d9c4']]) { q.fillStyle = c; q.beginPath(); q.arc(x, y - 22, 11, 0, TAU); q.fill(); q.beginPath(); q.ellipse(x, y, 16, 12, 0, 0, TAU); q.fill(); }
  });
  vgDef('birthday', (q) => {
    q.fillStyle = '#6a5040'; q.fillRect(0, 0, 280, 280);
    q.fillStyle = '#d8b88c'; rrect(q, 20, 30, 240, 220, 10); q.fill();
    q.fillStyle = '#fff6e6'; rrect(q, 80, 150, 120, 60, 10); q.fill(); q.fillStyle = '#e8a0a8'; q.fillRect(80, 170, 120, 10);
    for (let i = 0; i < 5; i++) { q.fillStyle = '#fff'; q.fillRect(96 + i * 22, 126, 6, 24); E.glow(q, 99 + i * 22, 120, 14, '255,210,140', 0.9); }
    q.fillStyle = '#3a2a24'; q.beginPath(); q.arc(70, 110, 22, 0, TAU); q.fill(); q.fillRect(50, 128, 40, 60);
    q.fillStyle = 'rgba(40,20,10,.35)'; for (let y = 0; y < 280; y += 6) q.fillRect(0, y, 280, 2);
    q.strokeStyle = 'rgba(40,20,10,.5)'; q.lineWidth = 3; for (let y = 10; y < 280; y += 30) { q.strokeRect(4, y, 12, 16); q.strokeRect(264, y, 12, 16); }
  });
  vgDef('party', (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 280, [[0, '#f7d0dc'], [1, '#c6d8f4']]); q.fillRect(0, 0, 280, 280);
    q.strokeStyle = '#6a5a8a'; q.lineWidth = 2; q.beginPath(); q.moveTo(0, 60); q.quadraticCurveTo(140, 110, 280, 50); q.stroke();
    const R = rng(4); const cs = ['#d2334f', '#f2c14e', '#4f9fe0', '#86d3b8', '#a88be0'];
    for (let i = 0; i < 7; i++) { const x = 20 + i * 40, y = 64 + sin(i) * 10 + (i - 3) * (i - 3) * 1.5; q.fillStyle = cs[i % 5]; poly(q, [[x - 12, y], [x + 12, y], [x, y + 26]]); q.fill(); }
    for (let i = 0; i < 70; i++) { q.fillStyle = cs[i % 5]; q.fillRect(R() * 280, 110 + R() * 170, 6, 10); }
    for (const [x, y, c] of [[70, 170, '#d2334f'], [210, 150, '#4f9fe0'], [150, 190, '#f2c14e']]) { q.fillStyle = c; q.beginPath(); q.ellipse(x, y, 26, 32, 0, 0, TAU); q.fill(); q.strokeStyle = '#6a5a8a'; q.beginPath(); q.moveTo(x, y + 32); q.lineTo(x + 6, y + 90); q.stroke(); }
  });
  /** 发光的小画面（泡泡 / 石头）：x,y 中心，r 半径 */
  function vignette(g, s, key, x, y, r, a = 1, rgb = '255,236,210') {
    if (a <= 0.01 || r < 1) return;
    E.glow(g, x, y, r * 1.8, rgb, 0.45 * a);
    const pa = g.globalAlpha; g.globalAlpha = pa * a;
    g.drawImage(C(s, 'vg-' + key), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = pa;
    E.glow(g, x - r * 0.4, y - r * 0.45, r * 0.5, '255,255,255', 0.35 * a);
  }

  // 罗德岛的舱室（白天 / 夜里）：大窗、窗外的甲板和荒原
  function paintCabin(q, night) {
    const wall = night ? ['#26304f', '#1a2238'] : ['#e3eaf2', '#cdd8e6'];
    q.fillStyle = lin(q, 0, 0, 0, 1080, [[0, wall[0]], [1, wall[1]]]); q.fillRect(0, 0, 1920, 1080);
    // 窗外
    const WX = 520, WY = 110, WW = 880, WH = 560;
    q.save(); rrect(q, WX, WY, WW, WH, 40); q.clip();
    if (night) {
      q.fillStyle = lin(q, 0, WY, 0, WY + WH, [[0, '#0e1633'], [0.7, '#27335c'], [1, '#3a3f66']]); q.fillRect(WX, WY, WW, WH);
      const R = rng(9); q.fillStyle = '#ffffff'; for (let i = 0; i < 90; i++) { q.globalAlpha = 0.3 + R() * 0.7; q.fillRect(WX + R() * WW, WY + R() * WH * 0.7, 2, 2); } q.globalAlpha = 1;
      q.fillStyle = '#fff6dc'; q.beginPath(); q.arc(WX + WW * 0.76, WY + 130, 44, 0, TAU); q.fill(); E.glow(q, WX + WW * 0.76, WY + 130, 150, '255,240,200', 0.4);
      q.fillStyle = '#141a30'; poly(q, [[WX, WY + WH * 0.78], [WX + 200, WY + WH * 0.7], [WX + 420, WY + WH * 0.76], [WX + 660, WY + WH * 0.68], [WX + WW, WY + WH * 0.75], [WX + WW, WY + WH], [WX, WY + WH]]); q.fill();
    } else {
      q.fillStyle = lin(q, 0, WY, 0, WY + WH, [[0, '#5f9fe0'], [0.65, '#bfe0f8'], [1, '#f0e6d6']]); q.fillRect(WX, WY, WW, WH);
      q.fillStyle = '#d9c3a6'; poly(q, [[WX, WY + WH * 0.74], [WX + 150, WY + WH * 0.68], [WX + 260, WY + WH * 0.68], [WX + 300, WY + WH * 0.72], [WX + 520, WY + WH * 0.7], [WX + 600, WY + WH * 0.62], [WX + 700, WY + WH * 0.62], [WX + 740, WY + WH * 0.7], [WX + WW, WY + WH * 0.72], [WX + WW, WY + WH], [WX, WY + WH]]); q.fill();
      q.fillStyle = '#ead9c0'; q.fillRect(WX, WY + WH * 0.8, WW, WH * 0.2);
    }
    // 甲板栏杆
    q.strokeStyle = night ? '#3a4466' : '#f4f6f9'; q.lineWidth = 8; q.beginPath(); q.moveTo(WX, WY + WH * 0.84); q.lineTo(WX + WW, WY + WH * 0.84); q.stroke();
    q.lineWidth = 5; for (let x = WX + 30; x < WX + WW; x += 70) { q.beginPath(); q.moveTo(x, WY + WH * 0.84); q.lineTo(x, WY + WH); q.stroke(); }
    q.restore();
    // 窗框
    q.strokeStyle = night ? '#3b4568' : '#f7f9fc'; q.lineWidth = 26; rrect(q, WX, WY, WW, WH, 40); q.stroke();
    q.lineWidth = 12; q.beginPath(); q.moveTo(WX + WW / 2, WY); q.lineTo(WX + WW / 2, WY + WH); q.stroke();
    q.strokeStyle = night ? 'rgba(10,14,30,.6)' : 'rgba(90,110,140,.4)'; q.lineWidth = 3; rrect(q, WX - 13, WY - 13, WW + 26, WH + 26, 50); q.stroke();
    // 书架
    q.fillStyle = night ? '#2c3452' : '#d7dfe9'; q.fillRect(80, 160, 330, 520);
    q.fillStyle = night ? '#3a4466' : '#eef2f7'; for (let y = 160; y <= 680; y += 130) q.fillRect(70, y, 350, 14);
    const R = rng(12), bc = night ? ['#4a4f7a', '#6a4a5a', '#5a6a5a', '#7a6a4a'] : ['#8aa0bb', '#c98a7a', '#e2c38a', '#7f9f8c', '#a58fc0', '#d2334f'];
    for (let r = 0; r < 4; r++) { let x = 92; while (x < 390) { const bw = 20 + R() * 22, bh = 80 + R() * 34; q.fillStyle = bc[floor(R() * bc.length)]; q.fillRect(x, 174 + r * 130 + 116 - bh, bw, bh); x += bw + 3; if (R() < 0.12) x += 30; } }
    // 浮石罐
    q.fillStyle = night ? 'rgba(120,140,190,.35)' : 'rgba(200,220,240,.7)'; rrect(q, 290, 560, 100, 110, 14); q.fill();
    // 墙上的照片
    q.fillStyle = night ? '#3a4466' : '#fbf8f2'; q.fillRect(1500, 200, 150, 120); q.fillStyle = night ? '#4a5a7a' : '#a8c6e4'; q.fillRect(1512, 212, 126, 96);
    q.fillStyle = night ? '#2a3050' : '#7a8aa6'; poly(q, [[1512, 308], [1560, 250], [1590, 280], [1638, 240], [1638, 308]]); q.fill();
    // 植物
    q.fillStyle = night ? '#2c3a44' : '#b98f6a'; rrect(q, 1640, 560, 120, 110, 10); q.fill();
    for (let i = 0; i < 14; i++) { const a = -PI / 2 + (i - 7) * 0.2; q.strokeStyle = night ? '#2f4a44' : '#5f8a6a'; q.lineWidth = 16; q.lineCap = 'round'; q.beginPath(); q.moveTo(1700, 570); q.quadraticCurveTo(1700 + cos(a) * 80, 570 + sin(a) * 120, 1700 + cos(a) * 160, 570 + sin(a) * 150 + 40); q.stroke(); }
    // 书桌
    q.fillStyle = night ? '#3a2e36' : '#b88a5f'; q.fillRect(0, 700, 1920, 380);
    q.fillStyle = night ? '#4a3a40' : '#cda27a'; q.fillRect(0, 690, 1920, 22);
    q.strokeStyle = night ? 'rgba(0,0,0,.2)' : 'rgba(110,70,40,.22)'; q.lineWidth = 3; for (let i = 0; i < 10; i++) { const y = 740 + i * 34; q.beginPath(); q.moveTo(0, y); q.bezierCurveTo(600, y + 8, 1200, y - 8, 1920, y + 4); q.stroke(); }
    if (!night) { q.fillStyle = 'rgba(255,246,220,.25)'; poly(q, [[520, 712], [1400, 712], [1560, 1080], [380, 1080]]); q.fill(); }
  }
  def('cabin-day', 1920, 1080, (q) => paintCabin(q, false));
  def('cabin-night', 1920, 1080, (q) => paintCabin(q, true));

  // 9 · 声音 —— 她闭着眼睛听，录下的声音变成一个个发光的小画面，飘进录音机里
  const VOICES = ['volcano', 'cafe', 'lawn', 'birthday', 'party'];
  shot('ri-voices', bar(18), { pre: ['cabin-day', 'fg-leaf', 'cl-b', 'cl-c','vg-volcano', 'vg-cafe', 'vg-lawn', 'vg-birthday', 'vg-party'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const cam = { x: 960 + 30 * s.p, y: 560, z: 1.02 + 0.04 * s.p, ...s.handheld(71, t, 3) };
    // 舱室和她在同一层：她站在舱室的地板上，镜头移动时脚下不会滑
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'cabin-day'), -40, -20, 2000, 1125);
      // 窗外慢慢飘过的云（只在天空那一截）
      const k2 = 2000 / 1920, wx = -40 + 520 * k2, wy = -20 + 110 * k2, ww = 880 * k2, wh = 560 * k2;
      q.save(); q.beginPath(); q.rect(wx, wy, ww, wh * 0.6); q.clip();
      q.drawImage(C(s, 'cl-c'), wx + 700 - s.lt * 14, wy + 50, 420, 195); q.drawImage(C(s, 'cl-b'), wx + 60 - s.lt * 9, wy + 20, 380, 190);
      q.restore();
      // 她站在窗边，举着录音机、另一只手按在耳边听（闭着眼睛）
      const ao = { x: 820, y: 1030, h: 560, pose: 'record', prop: 'recorder', t, expr: 'content', look: [0.6, -0.4], wind: 0.1, rim: '255,246,226', rimDir: -1.3, rimGlow: 0.08 };
      adele(q, ao);
      // 一个个小画面从窗外飘进来，被她手里的录音机“收”进去
      const mic = anchor('adele-alter', ao, 'prop');
      VOICES.forEach((key, i) => {
        const born = bar(18) + i * BEAT * 2 - 0.4, life = 4.2;
        const k = (t - born) / life;
        if (k < 0 || k > 1) return;
        const sx = 620 + i * 190, sy = 180 + (i % 2) * 120;
        const u = ease.inOut(sstep(0.45, 1, k));
        const x = lerp(sx, mic[0], u) + sin(t * 1.3 + i) * 20 * (1 - u), y = lerp(sy, mic[1], u) + cos(t * 1.1 + i) * 16 * (1 - u) - 40 * sin(PI * u);
        const r = 110 * ease.back(min(1, k * 5)) * (1 - 0.85 * u);
        vignette(q, s, key, x, y, r, min(1, k * 6) * (1 - sstep(0.9, 1, k)));
      });
      soundRings(q, mic[0], mic[1], t, { n: 4, r: 260, dir: -PI / 2, spread: 1.2, rgb: '255,240,220', a: 0.35 });
    });
    // 焦外的前景：窗台上的一片大叶子（视差 1.35，右下角，给画面一点纵深）
    s.layer(g, cam, 1.35, (q) => { q.globalAlpha = 0.92; q.drawImage(C(s, 'fg-leaf'), 1560, 380 + sin(t * 0.7) * 6, 700, 900); q.globalAlpha = 1; });
    motes(g, t, { n: 24, seed: 9, rgb: '255,240,210', a: 0.45, s: 5 });
    vigS(g, s, 0.3);
  });

  /* ---------- 甲板上的小桌（读唇 / 小粉羊偷冰淇淋） ---------- */
  def('deck', 2112, 1188, (q) => {
    q.translate(96, 54);
    q.fillStyle = lin(q, 0, -54, 0, 700, [[0, '#4f93e0'], [0.6, '#a9d3f6'], [1, '#e9f2f7']]); q.fillRect(-96, -54, 2112, 760);
    q.drawImage(E.kit.cloudSprite(81, 520, 220), 100, 60, 700, 300); q.drawImage(E.kit.cloudSprite(82, 520, 220), 1200, 20, 600, 260); q.drawImage(E.kit.cloudSprite(83, 520, 220), 820, 260, 400, 170);
    // 远处的荒原与平顶山
    q.fillStyle = '#d6c4ab'; poly(q, [[-96, 560], [160, 520], [260, 520], [300, 548], [620, 540], [700, 470], [860, 470], [900, 540], [1300, 530], [1400, 500], [1560, 500], [1600, 540], [2016, 548], [2016, 700], [-96, 700]]); q.fill();
    q.fillStyle = '#e6d8c2'; q.fillRect(-96, 600, 2112, 110);
    q.fillStyle = 'rgba(255,255,255,.35)'; q.fillRect(-96, 540, 2112, 60);
    // 甲板
    q.fillStyle = lin(q, 0, 700, 0, 1134, [[0, '#aeb8c8'], [1, '#7d889c']]); q.fillRect(-96, 700, 2112, 440);
    q.strokeStyle = 'rgba(60,70,90,.35)'; q.lineWidth = 3; for (let x = -96; x < 2016; x += 160) { q.beginPath(); q.moveTo(x, 700); q.lineTo(x - 200, 1134); q.stroke(); }
    for (const y of [760, 860, 1000]) { q.beginPath(); q.moveTo(-96, y); q.lineTo(2016, y); q.stroke(); }
    q.fillStyle = 'rgba(40,50,70,.5)'; for (let x = -60; x < 2016; x += 160) for (const y of [780, 880]) { q.beginPath(); q.arc(x, y, 4, 0, TAU); q.fill(); }
    // 栏杆
    q.strokeStyle = '#f4f6f9'; q.lineWidth = 12; q.beginPath(); q.moveTo(-96, 560); q.lineTo(2016, 560); q.stroke();
    q.lineWidth = 7; q.beginPath(); q.moveTo(-96, 630); q.lineTo(2016, 630); q.stroke();
    for (let x = -60; x < 2016; x += 120) { q.lineWidth = 8; q.beginPath(); q.moveTo(x, 556); q.lineTo(x, 704); q.stroke(); }
    q.strokeStyle = 'rgba(90,100,130,.5)'; q.lineWidth = 2; q.beginPath(); q.moveTo(-96, 567); q.lineTo(2016, 567); q.stroke();
    // 小桌
    q.fillStyle = '#39415a'; q.fillRect(952, 800, 16, 190); q.fillRect(900, 980, 120, 12);
    q.fillStyle = '#f7f4ee'; q.beginPath(); q.ellipse(960, 800, 190, 34, 0, 0, TAU); q.fill(); q.strokeStyle = 'rgba(80,90,120,.5)'; q.lineWidth = 3; q.stroke();
    q.fillStyle = '#e4ded3'; q.fillRect(770, 800, 380, 14);
    // 两个杯子
    for (const x of [880, 1030]) { q.fillStyle = '#ffffff'; rrect(q, x - 22, 752, 44, 44, 8); q.fill(); q.strokeStyle = 'rgba(80,90,120,.5)'; q.stroke(); q.beginPath(); q.arc(x + 26, 772, 10, -1.3, 1.3); q.stroke(); }
    // 遮阳伞
    q.fillStyle = '#39415a'; q.fillRect(956, 380, 8, 420);
    q.fillStyle = '#fbf6ef'; q.beginPath(); q.moveTo(960, 330); q.quadraticCurveTo(1200, 360, 1260, 440); q.lineTo(660, 440); q.quadraticCurveTo(720, 360, 960, 330); q.fill();
    q.fillStyle = '#d2334f'; for (let i = 0; i < 6; i += 2) { const a = 660 + i * 100, b = a + 100; q.beginPath(); q.moveTo(960, 330); q.lineTo(b, 440); q.lineTo(a, 440); q.closePath(); q.fill(); }
    q.strokeStyle = 'rgba(80,60,70,.4)'; q.lineWidth = 3; q.beginPath(); q.moveTo(660, 440); q.lineTo(1260, 440); q.stroke();
  });
  /**
   * 前景：从博士身后越过右肩看过去（兜帽、兜帽口的衬里、肩上的一截外套和挎带、兜帽的抽绳），
   * 光从对面（她那边）来，兜帽和右肩的外缘有一道暖色的轮廓光。
   * 局部坐标：原点在兜帽下方的后颈，博士面朝右。缓存时用 0.55 倍分辨率，贴大以后自然是柔焦的前景。
   */
  const FGD = { x0: -520, y0: -250, w: 1000, h: 900 };
  def('fg-doctor', FGD.w, FGD.h, (q) => {
    q.translate(-FGD.x0, -FGD.y0);
    q.lineJoin = 'round'; q.lineCap = 'round';
    // 肩背（外套）
    const back = new Path2D();
    back.moveTo(-520, 650); back.bezierCurveTo(-500, 420, -430, 280, -300, 232);
    back.bezierCurveTo(-200, 196, -120, 188, -40, 190);
    back.bezierCurveTo(90, 192, 210, 206, 280, 250);
    back.bezierCurveTo(370, 306, 420, 430, 440, 650); back.closePath();
    q.fillStyle = lin(q, 0, 180, 0, 650, [[0, '#30354d'], [0.45, '#262a3e'], [1, '#1b1e2d']]); q.fill(back);
    q.save(); q.clip(back);
    // 背中缝、布料的褶、右肩上的挎带（带扣反一点光）
    q.strokeStyle = 'rgba(12,14,24,.45)'; q.lineWidth = 6;
    q.beginPath(); q.moveTo(-60, 230); q.bezierCurveTo(-70, 380, -90, 520, -96, 650); q.stroke();
    q.lineWidth = 4; q.strokeStyle = 'rgba(12,14,24,.3)';
    for (const [a, b, c, d] of [[-300, 300, -340, 520], [-200, 330, -230, 600], [120, 300, 150, 560], [230, 320, 290, 600]]) { q.beginPath(); q.moveTo(a, b); q.quadraticCurveTo((a + c) / 2 + 24, (b + d) / 2, c, d); q.stroke(); }
    // 斜挎包的带子（从右肩斜到左下，微微弯）+ 带扣
    q.lineCap = 'butt';
    q.strokeStyle = '#393e53'; q.lineWidth = 30; q.beginPath(); q.moveTo(214, 200); q.quadraticCurveTo(40, 380, -250, 660); q.stroke();
    q.strokeStyle = 'rgba(255,236,210,.16)'; q.lineWidth = 3; q.beginPath(); q.moveTo(227, 207); q.quadraticCurveTo(54, 387, -236, 666); q.stroke();
    q.save(); q.translate(34, 382); q.rotate(-0.785); q.fillStyle = '#8e919e'; rrect(q, -22, -17, 44, 34, 5); q.fill(); q.fillStyle = '#2a2e40'; rrect(q, -12, -8, 24, 16, 3); q.fill(); q.restore();
    q.lineCap = 'round';
    // 右肩顶上被对面的光照到（径向的柔光，不留硬边）
    q.fillStyle = rad(q, 330, 250, 0, 190, [[0, 'rgba(255,226,196,.24)'], [1, 'rgba(255,226,196,0)']]); q.fillRect(140, 60, 380, 380);
    q.restore();
    // 兜帽：后脑勺那一侧鼓起来，顶上一个柔和的尖，开口朝右（朝着她）
    const hood = new Path2D();
    hood.moveTo(-150, 214);
    hood.bezierCurveTo(-250, 150, -272, -40, -212, -140);
    hood.bezierCurveTo(-178, -196, -122, -232, -66, -246);
    hood.lineTo(-50, -254);
    hood.bezierCurveTo(20, -238, 112, -178, 162, -80);
    hood.bezierCurveTo(198, 0, 202, 90, 174, 150);
    hood.bezierCurveTo(148, 200, 60, 222, -30, 224);
    hood.closePath();
    q.fillStyle = lin(q, -240, 0, 190, 0, [[0, '#1e2131'], [0.55, '#2c3047'], [1, '#353a54']]); q.fill(hood);
    q.save(); q.clip(hood);
    // 天光落在兜帽顶上（一点体积感）
    q.fillStyle = rad(q, -30, -170, 0, 240, [[0, 'rgba(170,186,232,.2)'], [1, 'rgba(170,186,232,0)']]); q.fillRect(-300, -300, 600, 520);
    // 兜帽口：一圈衬里（稍亮，被对面的光照到）+ 里面的暗处（脸在另一边，看不见）
    q.fillStyle = '#4a5174'; q.beginPath(); q.ellipse(164, 40, 70, 196, -0.1, 0, TAU); q.fill();
    q.fillStyle = 'rgba(255,226,196,.18)'; q.beginPath(); q.ellipse(150, 20, 40, 170, -0.1, 0, TAU); q.fill();
    q.fillStyle = '#0f111b'; q.beginPath(); q.ellipse(214, 56, 44, 160, -0.08, 0, TAU); q.fill();
    // 兜帽的缝线和褶
    q.strokeStyle = 'rgba(10,12,22,.5)'; q.lineWidth = 5;
    q.beginPath(); q.moveTo(-50, -250); q.bezierCurveTo(-80, -140, -90, 40, -60, 214); q.stroke();
    q.lineWidth = 4; q.strokeStyle = 'rgba(10,12,22,.3)';
    q.beginPath(); q.moveTo(-196, -60); q.quadraticCurveTo(-156, 40, -176, 160); q.stroke();
    q.beginPath(); q.moveTo(40, -190); q.quadraticCurveTo(84, -80, 96, 60); q.stroke();
    q.restore();
    // 抽绳（从兜帽口垂下来，末端的金属扣反光）
    q.strokeStyle = '#8b90a6'; q.lineWidth = 6;
    for (const [x0, len, sw] of [[170, 110, 10], [188, 86, -4]]) { q.beginPath(); q.moveTo(x0, 170); q.quadraticCurveTo(x0 + sw, 170 + len * 0.5, x0 + sw * 0.6, 170 + len); q.stroke(); q.fillStyle = '#c4c8d6'; rrect(q, x0 + sw * 0.6 - 5, 170 + len, 10, 16, 3); q.fill(); }
    // 轮廓光：兜帽顶到兜帽口的外缘、右肩的外缘（光从右前方来）
    const rim = (pts, w, a) => { q.strokeStyle = `rgba(255,236,210,${a})`; q.lineWidth = w; q.beginPath(); q.moveTo(pts[0], pts[1]); q.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); q.stroke(); };
    rim([-50, -254, 20, -240, 112, -180, 162, -80], 9, 0.95);
    rim([162, -80, 190, -20, 200, 60, 184, 132], 7, 0.8);
    rim([222, 222, 300, 262, 364, 330, 406, 460], 8, 0.9);
    rim([406, 460, 420, 520, 430, 580, 438, 650], 5, 0.5);
    rim([-196, -128, -160, -190, -100, -218, -40, -220], 3, 0.35);
  }, 0.55);
  function iceCream(g, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = '#e0a860'; poly(g, [[-16, -20], [16, -20], [0, 26]]); g.fill();
    g.strokeStyle = 'rgba(140,90,40,.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-10, -12); g.lineTo(6, 10); g.moveTo(10, -12); g.lineTo(-6, 10); g.stroke();
    g.fillStyle = '#f7b7c9'; g.beginPath(); g.arc(0, -30, 18, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-6, -36, 6, 0, TAU); g.fill();
    g.fillStyle = '#d2334f'; g.beginPath(); g.arc(4, -48, 4, 0, TAU); g.fill();
    g.restore();
  }

  // 10 · 读唇 —— 对面的人在说话，声波到半路就变灰、断掉；她看着对方的嘴唇，那些口型化成光，落进她眼里
  shot('ri-lips', bar(21), { pre: ['deck', 'fg-doctor'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const cam = { x: 1040 + 30 * s.p, y: 560, z: 1.32 - 0.05 * s.p, ...s.handheld(81, t, 3) };
    const ao = { x: 1170, y: 940, h: 430, pose: 'sit', seat: 430 * 0.24, t, flip: true, expr: t > bar(22) + 0.2 ? 'smile' : 'neutral', look: [-1, 0.05], prop: null, wind: 0.3 };
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'deck'), -96, -54, 2112, 1188);
      chair(q, 1190, 940, ao.seat, { style: 'bistro', back: 1 });
      adele(q, ao);
    });
    // 前景博士的位置（视差层 1.4 里）：说话时轻轻点头；嘴在兜帽口外面一点
    const bx = 600, by = 560 + sin(t * 1.4) * 4, nod = sin(t * 3.1) * 0.03;
    const mouth = [bx + 196 * cos(nod) - 70 * sin(nod), by + 196 * sin(nod) + 70 * cos(nod)];
    // 屏幕坐标：从博士的嘴边（左）到她的眼睛（右，按角色库给的眼睛位置换算到屏幕）
    const eye = anchor('adele-alter', ao, 'eyeN');
    const src = scr(cam, 1.4, mouth[0], mouth[1]), dst = scr(cam, 1, eye[0], eye[1]);
    soundRings(g, src[0], src[1], t, { n: 4, per: BEAT * 2, r: 480, dir: -0.05, spread: 0.5, rgb: '255,255,255', a: 0.5, muffle: 1 });
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,236,200,.1)'; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.moveTo(src[0], src[1]); g.quadraticCurveTo((src[0] + dst[0]) / 2, src[1] - 90, dst[0], dst[1]); g.stroke(); g.restore();
    for (let i = 0; i < 12; i++) {
      const born = bar(21) + i * BEAT * 0.6, k = (t - born) / 1.5;
      if (k < 0 || k > 1) continue;
      const u = ease.inOut(k), x = lerp(src[0], dst[0], u), y = lerp(src[1], dst[1], u) - sin(PI * u) * 90 * (1 - 0.5 * abs(u - 0.5));
      const a = sin(PI * k), sc = 2.2 * (1 - 0.5 * k);
      E.glow(g, x, y, 46 * sc, '255,220,160', a * 0.45);
      g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(255,244,214,${a})`; g.lineWidth = 3.5; g.lineCap = 'round';
      g.beginPath(); const sh = i % 4;
      if (sh === 0) g.ellipse(x, y, 10 * sc, 7 * sc, 0, 0, TAU);
      else if (sh === 1) g.arc(x, y - 6 * sc, 11 * sc, 0.3, PI - 0.3);
      else if (sh === 2) { g.moveTo(x - 11 * sc, y); g.lineTo(x + 11 * sc, y); }
      else { g.ellipse(x, y, 6 * sc, 9 * sc, 0, 0, TAU); }
      g.stroke(); g.restore();
    }
    // 到了她眼前，化成一点亮光
    E.glow(g, dst[0], dst[1], 40 + 20 * s.pulse(4), '255,236,200', 0.5 * sstep(bar(21) + 1.5, bar(21) + 2.2, t));
    // 前景：越过博士的右肩看她（兜帽的剪影 + 轮廓光 + 一截外套），柔焦
    s.layer(g, cam, 1.4, (q) => {
      q.save(); q.translate(bx, by); q.rotate(nod);
      E.glow(q, 150, -120, 260, '255,226,196', 0.16, 'screen', false);
      q.drawImage(C(s, 'fg-doctor'), FGD.x0, FGD.y0, FGD.w, FGD.h);
      q.restore();
    });
    vigS(g, s, 0.3);
  });

  // 11 · 小粉羊 —— 桌子底下钻出一只粉色小羊，叼走冰淇淋就跑；她笑出了声
  shot('ri-lamb', bar(23), { pre: ['deck'] }, (g, s) => {
    const t = s.t;
    const cam = { x: 960, y: 560, z: 1.08, ...s.handheld(82, t, 4) };
    const pop = bar(23) + BEAT * 2, grab = pop + BEAT * 0.9;
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'deck'), -96, -54, 2112, 1188);
      // 对面坐着的是博士（她口中的“前辈”）；小羊叼走冰淇淋时，博士伸手去指，她捂着嘴笑出声
      const seatD = 470 * 0.24, seatA = 420 * 0.24;
      chair(q, 700, 960, seatD, { style: 'bistro', back: -1 });
      cast(q, 'doctor', { shadow: 0.16, x: 720, y: 960, h: 470, pose: 'sit', seat: seatD, arms: t > grab + 0.2 ? 'point' : 'rest', aim: -0.2, t, expr: 'surprise' });
      chair(q, 1230, 960, seatA, { style: 'bistro', back: 1 });
      adele(q, { x: 1210, y: 960, h: 420, pose: 'sit', seat: seatA, arms: t > grab + 0.3 ? 'cover' : 'rest', t, flip: true, expr: t > grab + 0.2 ? 'laugh' : 'smile', prop: null, wind: 0.3, look: t > grab ? [1, 0.2] : [-1, 0.2] });
      // 冰淇淋：先立在桌上，被叼走后跟着小羊跑
      const run = clamp((t - grab) / 2.2);
      const lx = t < grab ? 960 : 960 + ease.in(run) * 1300, ly = t < pop ? 1040 : t < grab ? lerp(1040, 790, ease.out(clamp((t - pop) / (grab - pop)))) : 900 - abs(sin(run * 14)) * 60;
      if (t < grab) iceCream(q, 1000, 780, 1.6);
      if (t > pop - 0.05) {
        // 叼着冰淇淋一路蹦着跑：影子留在地上，跑步用最快的步频（冲刺）
        cast(q, 'sheep-pink', { shadow: 0.2, shadowY: t >= grab ? 900 : ly, x: lx, y: ly, h: 110, pose: t > grab ? 'run' : 'jump', t, speed: t > grab ? 3 : 1, glow: 0.4 });
        if (t >= grab) iceCream(q, lx + 44, ly - 70, 1.2);
        if (t >= grab) for (let i = 0; i < 8; i++) { const k = fract(t * 1.6 + i / 8); E.glow(q, lx - 60 - k * 200, ly - 40 - sin(i) * 30 - k * 40, 10 * (1 - k), '255,170,210', 0.8 * (1 - k)); }
      }
    });
    vigS(g, s, 0.3);
  });

  /* =========================================================
   * 三 · 寄往远方的信（45.66 – 70.73）：写信 → 纸鸟 → 莱塔尼亚与汐斯塔 → 纪录片 → 医疗部
   * ========================================================= */
  /** 纸鸟：k 0..1 从信纸折成鸟；flap 拍翅相位 */
  function paperBird(g, x, y, sc, k, flap, rot = 0) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(sc, sc);
    const f = clamp(k), w = sin(flap) * 0.9;
    // 信纸（矩形）→ 对折的三角 → 鸟
    const A = [[-60, -40], [60, -40], [60, 40], [-60, 40]];
    const B = [[-70, 0], [0, -46 + 30 * w], [70, 0], [0, 10]];
    const P2 = f < 0.5 ? A.map((p, i) => [lerp(p[0], B[i][0], f * 2), lerp(p[1], B[i][1], f * 2)]) : B;
    if (f < 0.5) { poly(g, P2); g.fillStyle = '#fbf8f1'; g.fill(); g.strokeStyle = 'rgba(120,130,160,.6)'; g.lineWidth = 2; g.stroke(); if (f < 0.2) { g.strokeStyle = 'rgba(90,90,120,.35)'; g.lineWidth = 2; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-44, -24 + i * 12); g.lineTo(30 - (i % 2) * 20, -24 + i * 12); g.stroke(); } } }
    else {
      const kk = (f - 0.5) * 2;
      // 身体
      g.fillStyle = '#eef2f8'; poly(g, [[-70 * (1 - kk * 0.2), 0], [0, 12], [60, 2], [86 * kk, -14 * kk]]); g.fill();
      // 两翼（拍动）
      g.fillStyle = '#fbf8f1'; poly(g, [[-30, 2], [30, 2], [-4, -60 * (0.4 + 0.6 * kk) * (0.3 + 0.7 * (0.5 + w * 0.5))]]); g.fill();
      g.fillStyle = '#dfe6f1'; poly(g, [[-26, 4], [26, 4], [8, 50 * kk * (0.5 - w * 0.5)]]); g.fill();
      g.strokeStyle = 'rgba(120,130,160,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-70, 0); g.lineTo(60, 2); g.stroke();
      // 尾巴 / 头
      g.fillStyle = '#fbf8f1'; poly(g, [[-66, 0], [-96 * kk - 10, -24 * kk], [-58, 6]]); g.fill();
      poly(g, [[56, 2], [86 * kk, -14 * kk], [70 * kk, 6]]); g.fill();
    }
    g.restore();
  }
  /** 夜里的台灯：暖色光锥 */
  function lampLight(g, x, y, a) {
    g.save(); g.globalCompositeOperation = 'lighter';
    g.fillStyle = `rgba(255,200,130,${0.16 * a})`; poly(g, [[x - 40, y], [x + 40, y], [x + 360, y + 420], [x - 300, y + 420]]); g.fill();
    g.restore();
    E.glow(g, x, y + 10, 160, '255,200,130', 0.8 * a);
    E.glow(g, x + 20, y + 330, 420, '255,190,120', 0.35 * a, 'lighter', false);
  }

  /** 夜里写信的书桌（写信和纸鸟两个镜头共用同一套摆设：椅子、她、书桌、台灯、信纸、趴着睡的小黑羊）；envA 0..1 信封的不透明度 */
  const WRITE_DT = 752; // 桌面
  function writingDesk(q, t, o = {}) {
    const DT = WRITE_DT;
    // 她坐在书桌后面：胸口在桌面上方，手搭在桌面上写字，腿被桌子的正面挡住
    chair(q, 780, 930, 118, { style: 'wood', back: -1 });
    // 台灯在她右边：脸和肩膀的右侧有一道暖色的轮廓光
    adele(q, { x: 800, y: 930, h: 540, pose: 'write', legs: 'sit', seat: 118, desk: 930 - DT - 16, t, expr: o.expr || 'smile', outfit: 'home', prop: null, look: o.look || [1, 0.55], rim: '255,204,150', rimDir: -0.25, rimGlow: 0.05, ...(o.adele || {}) });
    desk(q, 560, 1760, DT, 330);
    // 台灯
    q.strokeStyle = '#1b2034'; q.lineWidth = 12; q.lineCap = 'round'; q.beginPath(); q.moveTo(1330, DT + 4); q.lineTo(1270, 540); q.lineTo(1160, 490); q.stroke();
    q.fillStyle = '#1b2034'; q.fillRect(1296, DT - 8, 70, 14);
    q.fillStyle = '#d2334f'; poly(q, [[1110, 460], [1210, 490], [1180, 550], [1080, 520]]); q.fill();
    lampLight(q, 1130, 530, 0.9 + 0.1 * sin(t * 2));
    // 信纸与信封（在桌面上）
    q.fillStyle = '#fbf6e8'; q.save(); q.translate(1000, DT + 8); q.rotate(-0.04); q.fillRect(-100, -10, 200, 22); q.restore();
    const envA = o.envA ?? [1, 1];
    [[1420, '卡恩前辈'], [1570, '凯勒老师']].forEach(([x, lab], i) => { if (envA[i] <= 0.01) return; q.save(); q.globalAlpha *= envA[i]; q.translate(x, DT - 30); q.rotate(0.03); q.fillStyle = '#efe4cf'; q.fillRect(-70, -34, 140, 70); q.strokeStyle = 'rgba(120,100,80,.5)'; q.lineWidth = 2; q.beginPath(); q.moveTo(-70, -34); q.lineTo(0, 4); q.lineTo(70, -34); q.stroke(); E.text(q, lab, 0, 26, { size: 20, weight: 700, color: '#5a4a60' }); q.restore(); });
    // 小黑羊趴在台灯的光里睡着（在信纸和台灯底座之间：写信的全景和纸鸟的近景里都整只看得见）
    cast(q, 'sheep-black', { shadow: 0.2, x: 1212, y: DT + 6, h: 86, pose: 'sleep', t, flip: true });
  }

  // 12 · 写信 —— 夜里，台灯下，给卡恩前辈和凯勒老师写信；小黑羊趴在桌上睡着
  shot('lt-write', bar(25), { title: '寄往远方的信', in: { type: 'black', dur: 0.8 }, pre: ['cabin-night'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const insert = t > bar(26) + BEAT * 2;
    if (!insert) {
      const cam = { x: 900, y: 560, z: 1.05 + 0.04 * s.p, ...s.handheld(91, t, 2.5) };
      s.layer(g, cam, 1, (q) => {
        q.drawImage(C(s, 'cabin-night'), -40, -20, 2000, 1125);
        writingDesk(q, t);
      });
    } else {
      // 特写：信纸上写下称呼（只有称呼，正文是看不清的字迹）
      g.fillStyle = '#3a2e36'; g.fillRect(0, 0, VW, VH);
      E.glow(g, 960, 300, 900, '255,190,120', 0.5, 'lighter', false);
      g.save(); g.translate(960, 560); g.rotate(-0.05);
      g.fillStyle = '#fbf6e8'; g.fillRect(-620, -360, 1240, 760);
      g.strokeStyle = 'rgba(120,150,190,.35)'; g.lineWidth = 2; for (let y = -220; y < 380; y += 64) { g.beginPath(); g.moveTo(-560, y); g.lineTo(560, y); g.stroke(); }
      const k = clamp((t - (bar(26) + BEAT * 2)) / 1.2);
      g.save(); g.beginPath(); g.rect(-560, -330, 1120 * k, 140); g.clip();
      E.text(g, '卡恩前辈：', -540, -236, { size: 64, weight: 700, color: '#3b3550', align: 'left' });
      g.restore();
      // 看不清的正文：波浪笔迹
      g.strokeStyle = 'rgba(59,53,80,.55)'; g.lineWidth = 4; g.lineCap = 'round';
      for (let r = 0; r < 5; r++) { const kr = clamp(k * 2.2 - r * 0.25); if (kr <= 0) continue; g.beginPath(); for (let x = -520; x < -520 + 1000 * kr; x += 8) { const y = -140 + r * 64 + sin(x * 0.09 + r) * 7 + sin(x * 0.23) * 4; x === -520 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); }
      g.restore();
      E.glow(g, 1500, 200, 500, '255,200,140', 0.25);
    }
    vigS(g, s, 0.5);
  });

  // 13 · 纸鸟 —— 两封信在桌上折成纸鸟，扑棱棱地从开着的窗飞出去，飞过夜里的甲板
  def('ship-night', 2400, 1080, (q, w, h) => {
    q.fillStyle = lin(q, 0, 0, 0, h, [[0, '#0b1230'], [0.6, '#233261'], [1, '#3b3a66']]); q.fillRect(0, 0, w, h);
    const R = rng(21); q.fillStyle = '#ffffff'; for (let i = 0; i < 260; i++) { q.globalAlpha = 0.2 + R() * 0.8; const s2 = R() < 0.1 ? 3 : 1.6; q.fillRect(R() * w, R() * h * 0.7, s2, s2); } q.globalAlpha = 1;
    q.fillStyle = '#fff6dc'; q.beginPath(); q.arc(1700, 200, 56, 0, TAU); q.fill(); E.glow(q, 1700, 200, 240, '255,240,200', 0.35);
    q.fillStyle = '#161c38'; poly(q, [[0, 820], [400, 780], [900, 800], [1400, 770], [2000, 800], [w, 790], [w, h], [0, h]]); q.fill();
    // 罗德岛的剪影（本页原创的简化轮廓）+ 灯
    q.fillStyle = '#0f142a'; poly(q, [[200, 900], [300, 700], [900, 660], [980, 560], [1160, 560], [1200, 640], [1700, 650], [1900, 760], [2000, 900]]); q.fill();
    q.fillRect(1000, 470, 60, 100); q.fillRect(1080, 500, 30, 70);
    for (let i = 0; i < 60; i++) { const x = 320 + R() * 1560, y = 680 + R() * 180; if (y < 650 + (x > 1700 ? (x - 1700) * 0.5 : 0)) continue; q.fillStyle = R() < 0.8 ? '#ffd9a0' : '#9fd0ff'; q.fillRect(x, y, 6, 4); }
  });
  shot('lt-birds', bar(27), { pre: ['cabin-night', 'ship-night'] }, (g, s) => {
    const t = s.t, lt = s.lt, out = t > bar(28);
    if (!out) {
      // 同一张书桌（台灯、信纸、睡着的小黑羊、她都还在）：两个信封在桌上折成纸鸟，扑棱棱地朝开着的窗飞出去
      const fly0 = clamp((t - bar(27) - 1.0) / 0.9);
      // 她在画面左边三分之一处（整张脸都在画里），看着信封折成纸鸟、飞向窗口
      const cam = { x: 1178 - 20 * ease.inOut(fly0), y: 700 - 190 * ease.inOut(fly0), z: 1.96 - 0.3 * ease.inOut(fly0), ...s.handheld(92, t, 2) };
      const fold = (i) => clamp((t - bar(27) - i * 0.35) / 0.9);
      s.layer(g, cam, 1, (q) => {
        q.drawImage(C(s, 'cabin-night'), -40, -20, 2000, 1125);
        writingDesk(q, t, { envA: [1 - clamp(fold(0) * 3), 1 - clamp(fold(1) * 3)], look: [1, -0.45], expr: 'smile' });
        for (let i = 0; i < 2; i++) {
          const k = fold(i), ex = 1420 + i * 150, ey = WRITE_DT - 32;
          const flyK = clamp((t - bar(27) - 1.0 - i * 0.2) / 1.1), u = ease.inOut(flyK);
          const x = lerp(ex, ex - 330 - i * 110, u), y = lerp(ey, 400 - i * 30, ease.out(flyK)) - sin(PI * flyK) * 40;
          if (k < 1) E.glow(q, x, y, 60, '255,236,200', 0.35 * sin(PI * k));
          if (k > 0) { q.save(); q.translate(x, y); q.scale(-1, 1); paperBird(q, 0, 0, 0.75 - 0.15 * u, k, t * 16 + i * 2, -0.35 * flyK); q.restore(); }
          if (flyK > 0) E.glow(q, x + 30, y + 10, 50, '255,230,180', 0.5 * flyK);
        }
      });
    } else {
      // 夜里的甲板：图层比画面大一圈（视差 0.5 + 手持漂移也盖得住画面边缘）
      const k = min(1, (t - bar(28)) / (bar(29) - bar(28)));
      const cam = { x: 1100 + 300 * k, y: 540, z: 1.0, ...s.handheld(93, t, 3) };
      s.layer(g, cam, 0.5, (q) => q.drawImage(C(s, 'ship-night'), -280, -24, 2480, 1128));
      for (let i = 0; i < 2; i++) {
        const dir = i ? 1 : -1, u = ease.out(k);
        const x = 900 + dir * 700 * u + (1 - u) * 100, y = 700 - 520 * u - sin(u * PI) * 60 * (i ? 1 : 0.4);
        const sc = 0.8 - 0.55 * u;
        // 光的尾迹
        for (let j = 1; j < 8; j++) { const uu = max(0, u - j * 0.03); E.glow(g, 900 + dir * 700 * uu + (1 - uu) * 100, 700 - 520 * uu - sin(uu * PI) * 60 * (i ? 1 : 0.4), 20 * sc * (1 - j / 8) + 4, '255,230,180', 0.5 * (1 - j / 8)); }
        paperBird(g, x, y, sc, 1, t * 14 + i * 3, dir > 0 ? -0.2 : 0.2);
      }
      s.kit.stars(g, t, { n: 40, seed: 31, h: 500, size: 2 });
    }
    vigS(g, s, 0.45);
  });

  // 14 · 两地 —— 撕开的分屏：左边是夜里莱塔尼亚的尖塔，右边是汐斯塔的黄昏海岸；纸鸟各自落在收信人的手里
  // 宽 1200：撕开的纸边最右能到 x≈1070，左半边的画要一直铺到纸边（原来 1100 宽，纸边上面露出一条平涂的底色）
  def('leith-night', 1200, 1080, (q, w, h) => {
    q.fillStyle = lin(q, 0, 0, 0, h, [[0, '#0d1433'], [0.65, '#2b2f63'], [1, '#4a3f72']]); q.fillRect(0, 0, w, h);
    const R = rng(5); q.fillStyle = '#fff'; for (let i = 0; i < 150; i++) { q.globalAlpha = 0.2 + R() * 0.8; q.fillRect(R() * w, R() * h * 0.6, 2, 2); } q.globalAlpha = 1;
    q.fillStyle = '#fff4d8'; q.beginPath(); q.arc(300, 190, 70, 0, TAU); q.fill(); q.fillStyle = '#0d1433'; q.beginPath(); q.arc(330, 170, 62, 0, TAU); q.fill();
    const spire = (x, bw, top, col) => { q.fillStyle = col; q.fillRect(x - bw / 2, top, bw, h - top); poly(q, [[x - bw / 2 - 6, top], [x, top - bw * 2.4], [x + bw / 2 + 6, top]]); q.fill(); q.fillRect(x - 3, top - bw * 2.4 - 40, 6, 44); };
    for (const [x, bw, top] of [[80, 60, 520], [210, 80, 430], [480, 70, 560], [620, 110, 380], [800, 60, 600], [930, 90, 470], [1060, 70, 540], [1165, 80, 450]]) spire(x, bw, top, '#1a1d3e');
    for (const [x, bw, top] of [[140, 90, 700], [360, 120, 640], [720, 140, 690], [1000, 110, 720], [1120, 100, 680]]) spire(x, bw, top, '#12142e');
    for (let i = 0; i < 46; i++) { q.fillStyle = 'rgba(255,210,150,.8)'; q.fillRect(40 + R() * 1120, 620 + R() * 400, 5, 8); }
    // 收信的窗
    q.fillStyle = '#1a1d3e'; q.fillRect(330, 360, 190, 720);
    q.fillStyle = '#ffd89a'; q.beginPath(); q.moveTo(380, 560); q.lineTo(380, 470); q.quadraticCurveTo(425, 420, 470, 470); q.lineTo(470, 560); q.fill();
    q.strokeStyle = '#1a1d3e'; q.lineWidth = 6; q.beginPath(); q.moveTo(425, 450); q.lineTo(425, 560); q.moveTo(380, 505); q.lineTo(470, 505); q.stroke();
  });
  def('siesta-dusk', 1100, 1080, (q, w, h) => {
    q.fillStyle = lin(q, 0, 0, 0, h, [[0, '#6a78c8'], [0.4, '#f0a6b4'], [0.62, '#fbd3a2'], [0.64, '#f7c08e'], [1, '#e9a58a']]); q.fillRect(0, 0, w, h);
    q.fillStyle = '#fff1d0'; q.beginPath(); q.arc(700, 640, 70, 0, TAU); q.fill(); E.glow(q, 700, 640, 300, '255,220,170', 0.5);
    // 远处的汐斯塔火山
    q.fillStyle = '#9a7ab0'; poly(q, [[380, 690], [560, 540], [600, 530], [640, 540], [860, 690]]); q.fill();
    q.fillStyle = 'rgba(255,255,255,.4)'; q.beginPath(); q.arc(610, 500, 30, 0, TAU); q.arc(640, 470, 24, 0, TAU); q.fill();
    // 海
    q.fillStyle = lin(q, 0, 690, 0, h, [[0, '#f2b89a'], [1, '#6f7fc0']]); q.fillRect(0, 690, w, h - 690);
    q.strokeStyle = 'rgba(255,240,220,.6)'; q.lineWidth = 3; const R = rng(8); for (let i = 0; i < 40; i++) { const x = R() * w, y = 700 + R() * 300; q.beginPath(); q.moveTo(x, y); q.lineTo(x + 20 + R() * 40, y); q.stroke(); }
    // 博物馆（白色小楼 + 阳台）
    q.fillStyle = '#f4ece6'; q.fillRect(500, 560, 520, 520); q.fillStyle = '#e2d4d0'; q.fillRect(500, 560, 520, 24);
    q.fillStyle = '#c96a5a'; poly(q, [[480, 560], [760, 470], [1040, 560]]); q.fill();
    for (let i = 0; i < 4; i++) { q.fillStyle = '#7f9fd0'; rrect(q, 540 + i * 120, 640, 70, 110, 30); q.fill(); }
    q.fillStyle = '#e8ddd8'; q.fillRect(480, 800, 560, 20); q.strokeStyle = '#8a7a86'; q.lineWidth = 4; for (let x = 490; x < 1040; x += 28) { q.beginPath(); q.moveTo(x, 820); q.lineTo(x, 880); q.stroke(); } q.beginPath(); q.moveTo(480, 880); q.lineTo(1040, 880); q.stroke();
    // 棕榈
    const palm = (x, y, hh) => { q.strokeStyle = '#4a3a50'; q.lineWidth = 16; q.beginPath(); q.moveTo(x, h); q.quadraticCurveTo(x + 30, y + hh / 2, x + 10, y); q.stroke(); q.fillStyle = '#3f5a4a'; for (let i = 0; i < 7; i++) { const a = -PI / 2 + (i - 3) * 0.55; q.beginPath(); q.moveTo(x + 10, y); q.quadraticCurveTo(x + 10 + cos(a) * 90, y + sin(a) * 60 - 20, x + 10 + cos(a) * 170, y + sin(a) * 60 + 40); q.quadraticCurveTo(x + 10 + cos(a) * 80, y + sin(a) * 40, x + 10, y + 6); q.fill(); } };
    palm(120, 520, 560); palm(300, 640, 440);
  });
  shot('lt-split', bar(29), { in: { type: 'tear', dur: 0.8, seed: 9, dir: 'left' }, pre: ['leith-night', 'siesta-dusk'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const sep = 960 + sin(t * 0.8) * 20;
    const edge = tornPts(77, sep + 60, -20, sep - 60, 1100, 26, 12);
    // 左：莱塔尼亚
    g.save(); poly(g, [[-10, -20], ...edge, [-10, 1100]]); g.clip();
    g.fillStyle = '#0d1433'; g.fillRect(0, 0, 1100, VH);
    const lx0 = -120 + lt * 6;
    g.drawImage(C(s, 'leith-night'), lx0, 0, 1200, 1080);
    const k1 = clamp((t - bar(29) - 0.3) / 2.6);
    const wx = lx0 + 425; // 那扇亮着的窗
    const b1x = lerp(1000, wx + 10, ease.out(k1)), b1y = lerp(260, 548, ease.inOut(k1)) - sin(k1 * PI) * 80;
    E.glow(g, wx, 500, 160, '255,210,140', 0.3 + 0.45 * sstep(0.85, 1, k1));
    // 窗里的人影（逆光）：纸鸟落到窗台上时，伸手接住
    g.save(); g.beginPath(); g.moveTo(lx0 + 380, 560); g.lineTo(lx0 + 380, 470); g.quadraticCurveTo(wx, 420, lx0 + 470, 470); g.lineTo(lx0 + 470, 560); g.closePath(); g.clip();
    g.fillStyle = '#2a2230'; g.beginPath(); g.arc(wx - 6, 494, 17, 0, TAU); g.fill(); g.beginPath(); g.ellipse(wx - 6, 552, 38, 30, 0, 0, TAU); g.fill();
    g.restore();
    if (k1 > 0.8) { g.strokeStyle = '#2a2230'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(wx + 14, 535); g.lineTo(wx + 12 + 30 * sstep(0.8, 1, k1), 552); g.stroke(); }
    g.fillStyle = '#1a1d3e'; g.fillRect(lx0 + 372, 558, 106, 10);
    if (k1 < 1) paperBird(g, b1x, b1y, 0.42, 1, t * 15, 0.1);
    else paperBird(g, wx + 16, 548, 0.3, 1, 0.5, 0);
    g.restore();
    // 右：汐斯塔
    g.save(); poly(g, [...edge, [1940, 1100], [1940, -20]]); g.clip();
    g.fillStyle = '#e9a58a'; g.fillRect(800, 0, 1120, VH);
    g.drawImage(C(s, 'siesta-dusk'), 880 - lt * 6, 0, 1100, 1080);
    // 海面上一闪一闪的夕阳碎光
    for (let i = 0; i < 26; i++) { const tw = pow(max(0, sin(t * 2.6 + i * 2.3)), 6); if (tw < 0.05) continue; E.glow(g, 880 - lt * 6 + 380 + hash(55, i, 1) * 640, 700 + pow(hash(55, i, 2), 1.5) * 320, 6 + 8 * hash(55, i, 3), '255,236,200', tw); }
    const k2 = clamp((t - bar(29) - 1.0) / 2.6);
    const kx = 1500 - lt * 6;
    cast(g, 'keller', { shadow: 0.16, x: kx, y: 812, h: 280, pose: k2 >= 1 ? 'read' : 'reach', t, expr: k2 >= 1 ? 'smile' : 'neutral', flip: true });
    if (k2 < 1) paperBird(g, lerp(900, kx - 60, ease.out(k2)), lerp(280, 560, ease.inOut(k2)) - sin(k2 * PI) * 90, 0.5, 1, t * 15 + 2, -0.1);
    g.restore();
    // 撕边：白色纸芯 + 阴影
    g.save(); g.strokeStyle = 'rgba(20,20,40,.25)'; g.lineWidth = 16; line(g, edge.map(([x, y]) => [x + 6, y])); g.stroke();
    g.strokeStyle = '#fbfaf6'; g.lineWidth = 12; line(g, edge); g.stroke(); g.restore();
    vigS(g, s, 0.3);
  });

  // 15 · 纪录片 —— 场记板在重拍上合上；取景框里，她站在远处喷着熔岩的火山前讲解
  def('docu-land', 2112, 1188, (q) => {
    q.translate(96, 54);
    q.fillStyle = lin(q, 0, -54, 0, 700, [[0, '#2a2a52'], [0.55, '#8a5a7a'], [1, '#f0a070']]); q.fillRect(-96, -54, 2112, 960);
    // 远处的火山（黄昏里的剪影，山脚被熔岩映红）
    paintVolcano(q, { cx: 840, baseY: 720, peakY: 312, halfW: 700, craterW: 90, top: '#3b3050', base: '#2a2238', shade: 'rgba(12,6,24,.55)', gully: 'rgba(255,120,70,.22)', haze: 'rgba(240,140,110,.35)', shoulder: [1, 0.5, 30], gullies: 12, seed: 21, x0: 60, x1: 1640, bottom: 780, crater: 'rgba(255,120,60,.6)' });
    // 熔岩流：暗红的宽带 + 亮橙的细线
    q.lineCap = 'round'; q.lineJoin = 'round';
    const flows = [[[836, 318], [812, 400], [790, 470], [744, 560], [706, 650], [690, 720]], [[848, 318], [880, 390], [918, 460], [962, 560], [1010, 660]], [[842, 318], [846, 420], [836, 520], [850, 620]]];
    for (const f of flows) { q.strokeStyle = 'rgba(160,40,20,.8)'; q.lineWidth = 12; line(q, f); q.stroke(); q.strokeStyle = '#ff8a3c'; q.lineWidth = 5; line(q, f); q.stroke(); q.strokeStyle = 'rgba(255,230,160,.9)'; q.lineWidth = 1.8; line(q, f.slice(0, 3)); q.stroke(); }
    // 近处的玄武岩地面
    q.fillStyle = '#1e1a26'; poly(q, [[-96, 760], [300, 690], [700, 720], [1100, 690], [1500, 720], [2016, 680], [2016, 1134], [-96, 1134]]); q.fill();
    q.fillStyle = '#2a2432'; const R = rng(3); for (let i = 0; i < 40; i++) { const x = R() * 2000 - 50, y = 760 + R() * 360; q.beginPath(); q.ellipse(x, y, 30 + R() * 60, 10 + R() * 14, 0, 0, TAU); q.fill(); }
  });
  function viewfinder(g, t, tc) {
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 5;
    for (const [x, y, dx, dy] of [[120, 110, 1, 1], [1800, 110, -1, 1], [120, 970, 1, -1], [1800, 970, -1, -1]]) { g.beginPath(); g.moveTo(x, y + dy * 70); g.lineTo(x, y); g.lineTo(x + dx * 70, y); g.stroke(); }
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(940, 540); g.lineTo(980, 540); g.moveTo(960, 520); g.lineTo(960, 560); g.stroke();
    const blink = fract(t / (BEAT * 2)) < 0.5;
    if (blink) { g.fillStyle = '#ff4a5e'; g.beginPath(); g.arc(180, 170, 14, 0, TAU); g.fill(); }
    E.text(g, 'REC', 210, 181, { font: 'mono', size: 30, weight: 800, align: 'left', color: '#ffffff' });
    E.text(g, tc, 1740, 181, { font: 'mono', size: 30, weight: 700, align: 'right', color: '#ffffff' });
    E.text(g, '纪录片 · 火山', 180, 930, { size: 30, weight: 700, align: 'left', color: '#ffffff', spacing: 4 });
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeRect(1650, 900, 90, 40); g.fillStyle = '#ffffff'; g.fillRect(1740, 912, 8, 16); g.fillRect(1656, 906, 60, 28);
    g.restore();
  }
  shot('lt-docu', bar(32), { pre: ['docu-land'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const clap = bar(32) + BEAT * 0.02;
    const cam = { x: 960 + 40 * s.p, y: 540, z: 1.0 + 0.06 * s.p, ...s.handheld(101, t, 5) };
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'docu-land'), -96, -54, 2112, 1188);
      // 火山口的光随拍子喘息
      // 火山口喘着气的烟（软的，暗紫，被下面的火映红）
      smoke(q, t, 846, 300, 5, 2.4, '96,74,104'); smoke(q, t + 2.7, 830, 300, 9, 2.0, '120,80,96');
      E.glow(q, 840, 318, 120 + 30 * s.pulse(4), '255,140,60', 0.85);
      // 她对着镜头讲解（嘴在动），手指向身后的火山
      const pointing = t > bar(33);
      // 身后火山口的光从左上方照过来：一圈暖色的轮廓光
      adele(q, { x: 1420, y: 1000, h: 520, pose: pointing ? 'point' : 'stand', aim: 0.35, t, flip: true, expr: 'smile', talk: 0.8, look: pointing ? [-1, -0.3] : [-0.2, 0], view: pointing ? 'three' : 'front', wind: 0.5, windDir: -1, rim: '255,168,110', rimDir: -2.6, rimGlow: 0.1 });
    });
    s.kit.particles(g, t, 'embers', { n: 30, seed: 41 });
    const sec = floor(lt), fr = floor((lt % 1) * 24);
    viewfinder(g, t, `00:12:${String(40 + sec).padStart(2, '0')}:${String(fr).padStart(2, '0')}`);
    // 场记板：开头一拍从下面伸上来、合上、退下
    const ck = clamp(lt / 0.9);
    if (ck < 1) {
      const y = 1200 - 700 * ease.out(min(1, ck * 3)) + 900 * ease.in(clamp((ck - 0.6) / 0.4));
      g.save(); g.translate(960, y);
      g.fillStyle = '#1b1d26'; g.fillRect(-300, -60, 600, 380);
      g.fillStyle = '#f4f1ea'; for (let i = 0; i < 3; i++) g.fillRect(-270, 10 + i * 90, 540, 4);
      E.text(g, '纪录片 · 火山', -250, 70, { size: 40, weight: 700, align: 'left', color: '#f4f1ea' });
      E.text(g, 'SCENE 01   TAKE 3', -250, 160, { font: 'mono', size: 34, weight: 700, align: 'left', color: '#f4f1ea' });
      const ang = -0.5 * (1 - sstep(0.02, 0.2, ck));
      g.save(); g.translate(-300, -60); g.rotate(ang); g.fillStyle = '#f4f1ea'; g.fillRect(0, -70, 600, 70); g.fillStyle = '#1b1d26'; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(i * 100 + 20, -70); g.lineTo(i * 100 + 70, -70); g.lineTo(i * 100 + 40, 0); g.lineTo(i * 100 - 10, 0); g.fill(); } g.restore();
      g.restore();
    }
    vigS(g, s, 0.5);
  });

  // 16 · 医疗部 —— 走廊里，护士拿着报告在说；她笑了笑，转身朝走廊尽头的光走过去
  def('corridor', 1920, 1080, (q) => {
    // 一点透视的走廊：近处是整个画面，远处尽头是 (860..1100, 430..610) 的门框
    const FL = 860, FR = 1100, FT = 430, FB = 610, Z = 6;
    const pz = (u) => (1 - 1 / (1 + (Z - 1) * u)) / (1 - 1 / Z); // 深度 u → 屏幕插值（近大远小）
    const Lw = (u, v) => { const f = pz(u); return [lerp(0, FL, f), lerp(lerp(0, FT, f), lerp(1080, FB, f), v)]; };
    const Rw = (u, v) => { const f = pz(u); return [lerp(1920, FR, f), lerp(lerp(0, FT, f), lerp(1080, FB, f), v)]; };
    const Fl = (u, w) => { const f = pz(u); return [lerp(lerp(0, FL, f), lerp(1920, FR, f), w), lerp(1080, FB, f)]; };
    const Ce = (u, w) => { const f = pz(u); return [lerp(lerp(0, FL, f), lerp(1920, FR, f), w), lerp(0, FT, f)]; };
    // 面
    q.fillStyle = lin(q, 0, 0, 0, FT, [[0, '#cfd8e4'], [1, '#e9eef5']]); poly(q, [[0, 0], [1920, 0], [FR, FT], [FL, FT]]); q.fill();
    q.fillStyle = lin(q, 0, FB, 0, 1080, [[0, '#e3e8ef'], [1, '#aeb9c9']]); poly(q, [[FL, FB], [FR, FB], [1920, 1080], [0, 1080]]); q.fill();
    q.fillStyle = lin(q, 0, 0, FL, 0, [[0, '#d5deea'], [1, '#f1f4f8']]); poly(q, [[0, 0], [FL, FT], [FL, FB], [0, 1080]]); q.fill();
    q.fillStyle = lin(q, FR, 0, 1920, 0, [[0, '#f1f4f8'], [1, '#cdd7e4']]); poly(q, [[1920, 0], [FR, FT], [FR, FB], [1920, 1080]]); q.fill();
    // 墙裙
    for (const W of [Lw, Rw]) { poly(q, [W(0, 0.72), W(1, 0.72), W(1, 1), W(0, 1)]); q.fillStyle = 'rgba(150,170,200,.25)'; q.fill(); q.strokeStyle = 'rgba(120,140,170,.45)'; q.lineWidth = 3; line(q, [W(0, 0.72), W(1, 0.72)]); q.stroke(); }
    // 天花板的灯板（发亮）+ 地上的倒影
    for (let i = 0; i < 6; i++) {
      const u0 = 0.04 + i * 0.16, u1 = u0 + 0.07;
      poly(q, [Ce(u0, 0.38), Ce(u0, 0.62), Ce(u1, 0.62), Ce(u1, 0.38)]); q.fillStyle = '#ffffff'; q.fill(); q.strokeStyle = 'rgba(180,195,215,.8)'; q.lineWidth = 3; q.stroke();
      poly(q, [Fl(u0, 0.4), Fl(u0, 0.6), Fl(u1, 0.6), Fl(u1, 0.4)]); q.fillStyle = 'rgba(255,255,255,.35)'; q.fill();
    }
    // 右墙的窗（窗外是天和荒原）与地上的光斑
    for (let i = 0; i < 4; i++) {
      const u0 = 0.06 + i * 0.22, u1 = u0 + 0.11;
      const Wq = [Rw(u0, 0.22), Rw(u1, 0.22), Rw(u1, 0.62), Rw(u0, 0.62)];
      q.save(); poly(q, Wq); q.clip(); const [ax, ay] = Wq[0], [, by] = Wq[3];
      q.fillStyle = lin(q, 0, ay, 0, by, [[0, '#8fc3ee'], [0.7, '#dcebf6'], [0.72, '#e2cfb2'], [1, '#d6c0a0']]); q.fillRect(Wq[1][0] - 10, ay - 20, ax - Wq[1][0] + 20, by - ay + 60); q.restore();
      poly(q, Wq); q.strokeStyle = '#ffffff'; q.lineWidth = 7; q.stroke();
      poly(q, [Fl(u0 + 0.03, 0.95), Fl(u1 + 0.07, 0.95), Fl(u1 + 0.05, 0.45), Fl(u0 + 0.01, 0.45)]); q.fillStyle = 'rgba(255,248,226,.5)'; q.fill();
    }
    // 左墙：两扇门、长椅、一盆植物、扶手、墙上的灯箱（扫描片上几粒结晶的影子）
    for (const [u0, u1] of [[0.08, 0.2], [0.5, 0.58]]) {
      const D = [Lw(u0, 0.2), Lw(u1, 0.2), Lw(u1, 1), Lw(u0, 1)];
      poly(q, D); q.fillStyle = '#c3cfdd'; q.fill(); q.strokeStyle = '#9aabc2'; q.lineWidth = 4; q.stroke();
      const G = [Lw(lerp(u0, u1, 0.3), 0.3), Lw(lerp(u0, u1, 0.7), 0.3), Lw(lerp(u0, u1, 0.7), 0.45), Lw(lerp(u0, u1, 0.3), 0.45)]; poly(q, G); q.fillStyle = '#e8f2fb'; q.fill();
    }
    const box = [Lw(0.28, 0.3), Lw(0.36, 0.3), Lw(0.36, 0.52), Lw(0.28, 0.52)];
    poly(q, box); q.fillStyle = '#2a3348'; q.fill();
    const bc = [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[2][1]) / 2];
    q.fillStyle = '#9fb4cf'; q.beginPath(); q.ellipse(bc[0], bc[1], 24, 44, 0.1, 0, TAU); q.fill(); q.fillStyle = '#e8a0b0'; for (const [dx, dy] of [[-6, -14], [8, 8], [-8, 16]]) { q.beginPath(); q.arc(bc[0] + dx, bc[1] + dy, 4, 0, TAU); q.fill(); }
    const bench = [Lw(0.22, 0.8), Lw(0.36, 0.8), Lw(0.36, 0.86), Lw(0.22, 0.86)]; poly(q, bench); q.fillStyle = '#8a9ab5'; q.fill();
    q.strokeStyle = '#6a7a95'; q.lineWidth = 5; line(q, [Lw(0.24, 0.86), Lw(0.24, 0.97)]); q.stroke(); line(q, [Lw(0.34, 0.86), Lw(0.34, 0.97)]); q.stroke();
    const [px, py] = Lw(0.42, 1); q.fillStyle = '#b98f6a'; q.fillRect(px - 14, py - 60, 34, 60); for (let i = 0; i < 9; i++) { const a = -PI / 2 + (i - 4) * 0.28; q.strokeStyle = '#5f8a6a'; q.lineWidth = 7; q.lineCap = 'round'; q.beginPath(); q.moveTo(px + 3, py - 60); q.quadraticCurveTo(px + 3 + cos(a) * 30, py - 60 + sin(a) * 60, px + 3 + cos(a) * 55, py - 60 + sin(a) * 70 + 20); q.stroke(); }
    q.strokeStyle = '#c6cfdb'; q.lineWidth = 6; line(q, [Lw(0, 0.64), Lw(1, 0.64)]); q.stroke();
    // 地砖缝
    q.strokeStyle = 'rgba(120,130,160,.3)'; q.lineWidth = 2;
    for (let k = 1; k < 12; k++) { const u = k / 12; line(q, [Fl(u, 0), Fl(u, 1)]); q.stroke(); }
    for (let k = 1; k < 6; k++) { const w = k / 6; line(q, [Fl(0, w), Fl(1, w)]); q.stroke(); }
    // 尽头的墙与门（很亮）
    q.fillStyle = '#e4eaf2'; q.fillRect(FL - 1, FT - 1, FR - FL + 2, FB - FT + 2);
    q.fillStyle = '#ffffff'; q.fillRect(FL + 60, FT + 20, FR - FL - 120, FB - FT - 20);
  });
  shot('lt-clinic', bar(35), { pre: ['corridor'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const turn = bar(37) + BEAT * 2;
    const walk = clamp((t - turn) / (bar(39) - turn));
    const cam = { x: 980, y: 540, z: 1.05 + 0.1 * ease.in(walk), ...s.handheld(111, t, 2) };
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'corridor'), 0, 0, 1920, 1080);
      E.glow(q, 980, 520, 260 + 200 * walk, '255,255,245', 0.6 + 0.3 * walk, 'lighter', false);
      const nurseX = 620;
      cast(q, 'crowd', { shadow: 0.16, x: nurseX, y: 1010, h: 520, pose: 'hold', t, color: '#e9eff7', seed: 4, talk: t < turn ? 0.7 : 0 });
      if (t < turn) soundRings(q, nurseX + 60, 600, t, { n: 4, per: BEAT * 2, r: 460, dir: 0, spread: 0.5, rgb: '255,255,255', a: 0.5, muffle: 1 });
      // 她：先面向护士，之后转身走向尽头
      const ax = t < turn ? 1180 : lerp(1180, 990, ease.in(walk)), ay = t < turn ? 1010 : lerp(1010, 640, ease.in(walk)), ah = t < turn ? 540 : lerp(540, 120, ease.in(walk));
      // 听完（看着护士的嘴唇），笑了笑；然后背过身，朝走廊尽头的光走过去
      adele(q, { x: ax, y: ay, h: ah, pose: t < turn ? 'stand' : 'walk-away', t: s.beat * BEAT, speed: STEP_SPD, flip: t < turn, expr: 'smile', look: t < turn ? [-1, -0.05] : [0, 0], alpha: 1 - sstep(0.85, 1, walk), shadow: 0.2 * (1 - walk) });
    });
    s.post.fill(g, '#ffffff', sstep(0.8, 1, walk) * 0.8);
    vigS(g, s, 0.2);
  });

  /* =========================================================
   * 四 · 乌纳（70.73 – 102.99）：重建的村子、小女孩；夜里小羊引路种下预警花；白天一步一步登上灰色的山坡
   * ========================================================= */
  /** 火山剪影：凹形山坡 + 平顶火山口，返回折线点 */
  function volcanoPts(cx, baseY, peakY, halfW, craterW, x0, x1, seed = 1) {
    const H = baseY - peakY;
    return sample(x0, x1, 8, (x) => {
      const d = abs(x - cx) - craterW / 2;
      if (d <= 0) return peakY + 6 + sin(x * 0.08 + seed) * 3;
      const u = min(1, d / (halfW - craterW / 2));
      return peakY + H * (1 - pow(1 - u, 1.85)) + (sin(x * 0.021 + seed) * 6 + sin(x * 0.057 + seed * 2) * 3) * min(1, u * 5) + (d > halfW - craterW / 2 ? (d - halfW + craterW / 2) * 0.04 : 0);
    });
  }
  /**
   * 画一座火山：凹形的锥 + 一侧的山肩；左上来的光（亮面 / 背光面的横向渐变），
   * 从火山口放射下来的山脊（亮边）与冲沟（暗线），锯齿边的白灰顶，山脚的雾
   */
  /** 火山的轮廓函数 y(x)（paintVolcano 与需要贴着山体画东西的镜头共用） */
  function volcanoProfile(o) {
    const { cx, baseY, peakY, halfW, craterW } = o;
    const seed = o.seed || 1, H = baseY - peakY, cw = craterW / 2;
    const sh = o.shoulder || [1, 0.42, H * 0.06];
    return (x) => {
      const d = abs(x - cx) - cw;
      if (d <= 0) return peakY + 5 + sin(x * 0.09 + seed) * 3 + abs(sin(x * 0.31 + seed)) * 3;
      const side = x < cx ? -1 : 1, u = d / (halfW - cw);
      let y = peakY + H * (1 - pow(max(0, 1 - min(1, u)), 1.85)) + max(0, u - 1) * H * 0.06;
      if (side === sh[0]) y -= sh[2] * Math.exp(-pow((u - sh[1]) / 0.13, 2));
      return y + (sin(x * 0.021 + seed) * 6 + sin(x * 0.057 + seed * 2) * 3 + sin(x * 0.13 + seed) * 1.3) * min(1, u * 4);
    };
  }
  function paintVolcano(q, o) {
    const { cx, baseY, peakY, halfW, craterW } = o;
    const seed = o.seed || 1, H = baseY - peakY, cw = craterW / 2;
    const prof = volcanoProfile(o);
    const x0 = o.x0 ?? cx - halfW - 200, x1 = o.x1 ?? cx + halfW + 200, bottom = o.bottom ?? baseY + 400;
    const pts = sample(x0, x1, 6, prof);
    poly(q, [...pts, [x1, bottom], [x0, bottom]]);
    q.fillStyle = lin(q, 0, peakY, 0, baseY, [[0, o.top], [1, o.base]]); q.fill();
    q.save(); q.clip();
    // 光：左亮右暗
    q.fillStyle = lin(q, cx - halfW * 0.8, 0, cx + halfW * 0.8, 0, [[0, 'rgba(255,255,255,.16)'], [0.45, 'rgba(255,255,255,0)'], [0.62, 'rgba(0,0,0,0)'], [1, o.shade]]);
    q.fillRect(x0, peakY - 50, x1 - x0, bottom - peakY + 50);
    // 放射的山脊与冲沟（锥面上方位角 φ 的母线）
    const R = rng(seed);
    const gen = (phi, t) => [cx + sin(phi) * (cw + (halfW - cw) * t) * 0.98, peakY + 6 + H * (1 - pow(1 - t, 1.85)) * 0.985];
    // 大块的明暗面（锥面上几道很宽、很淡的楔形）
    for (let i = 0; i < 7; i++) {
      const phi = -1.2 + 2.4 * R(), wv = 0.03 + R() * 0.06, t1 = 0.6 + R() * 0.4;
      const pts2 = [];
      for (let k = 0; k <= 10; k++) pts2.push(gen(phi - wv * (k / 10), (k / 10) * t1));
      for (let k = 10; k >= 0; k--) pts2.push(gen(phi + wv * (k / 10), (k / 10) * t1));
      poly(q, pts2); q.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(30,30,60,.07)'; q.fill();
    }
    // 冲沟：短一些、弯一些，起点不都在火山口
    const nG = o.gullies ?? 16;
    q.lineCap = 'round';
    for (let i = 0; i < nG; i++) {
      const phi = -1.4 + (2.8 * (i + 0.2 + R() * 0.6)) / nG, t0 = R() < 0.5 ? 0 : R() * 0.35, len = 0.14 + R() * 0.42, lit = sin(phi) < 0.2;
      const seg = 12, drift = (R() - 0.5) * 0.35, a0 = 0.45 + R() * 0.5, sd = R() * 10;
      q.globalAlpha = a0;
      for (let k = 0; k < seg; k++) {
        const ta = t0 + (k / seg) * len, tb = t0 + ((k + 1) / seg) * len;
        const wob = (tt) => (sin(tt * 6 + sd) * 16 + sin(tt * 17 + sd * 2) * 5) * tt;
        const [ax, ay] = gen(phi + drift * ta, ta), [bx, by] = gen(phi + drift * tb, tb);
        const taper = sin(PI * ((k + 0.5) / seg));
        const wdt = taper * (lit ? 4 : 5) + 1;
        q.strokeStyle = o.gully; q.lineWidth = wdt; q.beginPath(); q.moveTo(ax + wob(ta) + 3, ay); q.lineTo(bx + wob(tb) + 3, by); q.stroke();
        if (lit) { q.strokeStyle = 'rgba(255,255,255,.22)'; q.lineWidth = wdt * 0.8; q.beginPath(); q.moveTo(ax + wob(ta) - 3, ay); q.lineTo(bx + wob(tb) - 3, by); q.stroke(); }
      }
      q.globalAlpha = 1;
    }
    // 点点的质感
    for (let i = 0; i < 500; i++) { const x = x0 + R() * (x1 - x0), y = prof(x) + R() * (baseY - prof(x)); q.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.12)' : 'rgba(40,40,70,.12)'; q.fillRect(x, y, 2 + R() * 3, 1.5 + R() * 2); }
    // 白灰顶：锯齿的下缘，沿着冲沟往下拖出几道
    if (o.snow) {
      q.fillStyle = o.snow;
      const cap = [];
      for (let x = cx - halfW * 0.6; x <= cx + halfW * 0.6; x += 10) { const d = abs(x - cx); if (d > (halfW - cw) * 0.3 + cw) continue; cap.push([x, prof(x) - 2]); }
      const lower = [];
      for (let k = cap.length - 1; k >= 0; k--) { const x = cap[k][0], d = max(0, abs(x - cx) - cw) / (halfW - cw); const tc = 0.09 + 0.035 * sin(x * 0.03 + seed) + 0.02 * sin(x * 0.09 + seed * 2); const yEdge = peakY + H * (1 - pow(1 - tc, 1.85)); lower.push([x, max(cap[k][1] + 4, yEdge + d * 24)]); }
      if (cap.length > 2) { poly(q, cap.concat(lower)); q.fill(); }
      // 几道往下拖的白灰（圆头，粗细渐变）
      for (let i = 0; i < 9; i++) { const phi = -1.1 + 2.2 * ((i + R() * 0.8) / 9), l = 0.08 + R() * 0.16; q.strokeStyle = o.snow; q.lineCap = 'round'; for (let k = 0; k < 6; k++) { const [ax, ay] = gen(phi, 0.07 + (k / 6) * l), [bx, by] = gen(phi, 0.07 + ((k + 1) / 6) * l); q.lineWidth = (1 - k / 6) * 12 + 2; q.beginPath(); q.moveTo(ax, ay); q.lineTo(bx, by); q.stroke(); } }
      q.fillStyle = 'rgba(150,165,200,.25)'; poly(q, lower.map(([x, y]) => [x, y]).concat(lower.slice().reverse().map(([x, y]) => [x, y - 6]))); q.fill();
    }
    // 山脚的雾
    if (o.haze) { q.fillStyle = lin(q, 0, baseY - H * 0.45, 0, baseY + 30, [[0, 'rgba(0,0,0,0)'], [1, o.haze]]); q.fillRect(x0, baseY - H * 0.45, x1 - x0, bottom - baseY + H * 0.45); }
    q.restore();
    q.strokeStyle = o.ink || 'rgba(60,70,100,.5)'; q.lineWidth = 3; line(q, pts); q.stroke();
    // 火山口：内壁的阴影 + 一道亮的边
    q.fillStyle = o.crater || 'rgba(70,80,110,.6)'; q.beginPath(); q.ellipse(cx, peakY + 9, cw * 0.86, 8, 0, 0, TAU); q.fill();
    q.strokeStyle = 'rgba(255,255,255,.5)'; q.lineWidth = 2; q.beginPath(); q.ellipse(cx, peakY + 9, cw * 0.86, 8, 0, 0.1, PI - 0.1); q.stroke();
  }
  /** 云海：一排排的积云团，光从 lx 一侧来 */
  function paintCloudSea(q, x, y, w, h, seed, P) {
    const R = rng(seed);
    const rows = P.rows ?? 5;
    for (let j = 0; j < rows; j++) {
      const ry = y + (j / (rows - 1)) * h, r0 = (P.r ?? 40) * (1 + j * 0.55);
      const circles = [];
      for (let cx = x - r0; cx < x + w + r0; cx += r0 * (0.7 + R() * 0.6)) circles.push([cx, ry + (R() - 0.5) * r0 * 0.5, r0 * (0.7 + R() * 0.6)]);
      const fade = j / (rows - 1);
      q.fillStyle = P.shade[min(P.shade.length - 1, j)]; q.beginPath(); for (const [cx, cy, r] of circles) { q.moveTo(cx + r, cy); q.arc(cx, cy, r, 0, TAU); } q.fill();
      q.fillStyle = P.lit[min(P.lit.length - 1, j)]; q.beginPath(); for (const [cx, cy, r] of circles) { const ox = cx + (P.lx ?? -0.3) * r * 0.3, oy = cy - r * 0.28; q.moveTo(ox + r * 0.78, oy); q.arc(ox, oy, r * 0.78, 0, TAU); } q.fill();
      if (P.glint) { q.fillStyle = P.glint; q.beginPath(); for (const [cx, cy, r] of circles) { if (R() < 0.5) continue; const ox = cx + (P.lx ?? -0.3) * r * 0.5, oy = cy - r * 0.5; q.moveTo(ox + r * 0.4, oy); q.arc(ox, oy, r * 0.4, 0, TAU); } q.fill(); }
      if (P.base) { q.fillStyle = P.base; q.fillRect(x - r0, ry + r0 * 0.4, w + r0 * 2, h - (ry - y) + r0 * 2); }
      void fade;
    }
  }
  /** 小女孩（本页原创：乌纳村失去祖父母的孩子。毛线帽、短发、墨绿外套） */
  function girl(g, x, y, h, pose, t, o = {}) {
    const s = h / 200;
    g.save(); g.translate(x, y); if (o.flip) g.scale(-1, 1); g.scale(s, s);
    g.globalAlpha *= o.alpha ?? 1;
    const ink = 'rgba(60,40,50,.55)';
    g.lineJoin = 'round'; g.lineCap = 'round';
    const breathe = sin(t * 2) * 1.2;
    if (pose === 'hug') {
      // 坐在台阶上抱着膝盖
      g.fillStyle = '#3b3550'; g.beginPath(); g.ellipse(18, -40, 34, 22, -0.5, 0, TAU); g.fill();
      g.fillStyle = '#7a4e3c'; rrect(g, 30, -22, 34, 22, 8); g.fill();
      g.fillStyle = '#3f7a74'; g.beginPath(); g.moveTo(-26, 0); g.lineTo(-30, -80 + breathe); g.quadraticCurveTo(-10, -104 + breathe, 16, -86 + breathe); g.lineTo(24, -20); g.quadraticCurveTo(0, 4, -26, 0); g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#3f7a74'; g.beginPath(); g.ellipse(18, -56, 16, 30, -0.8, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#ffe6d6'; g.beginPath(); g.arc(32, -44, 8, 0, TAU); g.fill();
    } else {
      const wave = pose === 'wave' ? sin(t * 9) * 0.5 : 0;
      g.fillStyle = '#3b3550'; g.fillRect(-14, -60, 11, 52); g.fillRect(4, -60, 11, 52);
      g.fillStyle = '#7a4e3c'; rrect(g, -18, -12, 18, 12, 5); g.fill(); rrect(g, 2, -12, 18, 12, 5); g.fill();
      g.fillStyle = '#3f7a74'; g.beginPath(); g.moveTo(-28, -54); g.lineTo(-22, -118 + breathe); g.quadraticCurveTo(0, -128 + breathe, 22, -118 + breathe); g.lineTo(28, -54); g.closePath(); g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#f4efe2'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, -104 + k * 16, 3, 0, TAU); g.fill(); }
      // 手臂
      g.strokeStyle = '#3f7a74'; g.lineWidth = 12;
      if (pose === 'wave') { for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * 18, -112); g.lineTo(sd * 36 + sd * wave * 8, -160 + wave * 6); g.stroke(); g.fillStyle = '#ffe6d6'; g.beginPath(); g.arc(sd * 38 + sd * wave * 8, -166 + wave * 6, 7, 0, TAU); g.fill(); } }
      else { g.beginPath(); g.moveTo(-20, -110); g.lineTo(-26, -70); g.moveTo(20, -110); g.lineTo(26, -70); g.stroke(); }
    }
    // 头
    const hx = pose === 'hug' ? -4 : 0, hy = pose === 'hug' ? -104 : -146;
    const look = o.look || 0;
    g.fillStyle = '#5a3a30'; g.beginPath(); g.arc(hx, hy + 4, 30, 0, TAU); g.fill();
    g.fillStyle = '#ffe6d6'; g.beginPath(); g.arc(hx + 3 + look * 3, hy + 6, 24, 0, TAU); g.fill(); g.strokeStyle = ink; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = '#5a3a30'; g.beginPath(); g.arc(hx, hy - 4, 26, PI * 1.05, PI * 1.95); g.fill();
    g.fillStyle = '#e9b949'; g.beginPath(); g.arc(hx, hy - 8, 27, PI, TAU); g.fill(); g.fillRect(hx - 28, hy - 10, 56, 8);
    g.strokeStyle = '#c99a2e'; g.lineWidth = 2; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(hx + k * 10, hy - 32); g.lineTo(hx + k * 10, hy - 4); g.stroke(); }
    g.fillStyle = '#f4efe2'; g.beginPath(); g.arc(hx, hy - 38, 8, 0, TAU); g.fill();
    g.fillStyle = '#2b1a1a';
    if (o.closed) { g.fillRect(hx + 4 + look * 5, hy + 6, 7, 2); g.fillRect(hx + 17 + look * 5, hy + 6, 6, 2); }
    else { g.beginPath(); g.arc(hx + 8 + look * 5, hy + 6, 2.6, 0, TAU); g.arc(hx + 20 + look * 5, hy + 6, 2.4, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(240,130,130,.45)'; g.beginPath(); g.arc(hx + 4 + look * 4, hy + 15, 5, 0, TAU); g.arc(hx + 24 + look * 4, hy + 15, 4, 0, TAU); g.fill();
    g.strokeStyle = '#8a4a4a'; g.lineWidth = 2; g.beginPath(); if (o.smile) g.arc(hx + 14 + look * 5, hy + 16, 4, 0.2, PI - 0.2); else { g.moveTo(hx + 11 + look * 5, hy + 20); g.lineTo(hx + 17 + look * 5, hy + 20); } g.stroke();
    g.restore();
  }
  skyDef('sky-una', [[0, '#3f86d8'], [0.45, '#86bdf0'], [0.75, '#cfe5f8'], [1, '#eef3f6']]);
  /**
   * 乌纳村的房子：和 'una-valley' 里画出来的一模一样（重放同一串随机数），镜头里要知道屋顶在哪 ——
   * 修屋顶的人跪在一栋搭着脚手架的房子的屋顶上，炊烟从三栋房子的烟囱里冒出来
   */
  let UNA_V = null;
  function unaVillage() {
    if (UNA_V) return UNA_V;
    const R = rng(7); let n = 0; const r = () => { n++; return R(); };
    for (let i = 0; i < 160; i++) r(); // 先画的 40 片积灰各用了 4 个随机数
    const hs = [];
    for (let i = 0; i < 22; i++) hs.push({ x: 150 + r() * 1150, y: 800 + r() * 110, s: 0.7 + r() * 0.6 });
    hs.sort((a, b) => a.y - b.y);
    for (const h of hs) { h.roof = r() < 0.6 ? '#b5553f' : r() < 0.5 ? '#5b6687' : '#c98a5a'; h.wall = r() < 0.8 ? '#f4efe6' : '#e8dccb'; h.scaf = r() < 0.3; h.ww = 70 * h.s; h.hh = 50 * h.s; h.peak = h.y - h.hh - 34 * h.s; }
    const near = (list, x0) => list.reduce((b, h) => (!b || abs(h.x - x0) < abs(b.x - x0) ? h : b), null);
    const fix = near(hs.filter((h) => h.scaf), 1170) || near(hs, 1170);
    const chim = [];
    for (const x0 of [330, 660, 990]) { const h = near(hs.filter((h) => !h.scaf && h !== fix && !chim.includes(h)), x0); if (h) chim.push(h); }
    for (const h of chim) { h.chim = true; h.cx = h.x - (h.ww / 2 + 6) * 0.45; h.cy = h.peak + 34 * h.s * 0.45 - 13 * h.s; }
    return (UNA_V = { hs, fix, chim, calls: n });
  }
  /** 进村的路：路面上下两条贝塞尔边；中线的采样（按弧长），她沿着中线走 */
  const bez = (P, u) => { const v = 1 - u; return [v * v * v * P[0][0] + 3 * v * v * u * P[1][0] + 3 * v * u * u * P[2][0] + u * u * u * P[3][0], v * v * v * P[0][1] + 3 * v * v * u * P[1][1] + 3 * v * u * u * P[2][1] + u * u * u * P[3][1]]; };
  const UNA_ROAD_T = [[-40, 1080], [300, 980], [500, 930], [760, 900]], UNA_ROAD_B = [[800, 906], [560, 950], [400, 1010], [180, 1080]];
  let UNA_PATH = null;
  function unaPath() {
    if (UNA_PATH) return UNA_PATH;
    const bot = []; for (let i = 0; i <= 80; i++) bot.push(bez(UNA_ROAD_B, i / 80));
    const botY = (x) => { for (let i = 0; i < bot.length - 1; i++) { const [x0, y0] = bot[i], [x1, y1] = bot[i + 1]; if ((x - x0) * (x - x1) <= 0) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0 || 1)); } return bot[x > 500 ? 0 : bot.length - 1][1]; };
    const pts = [], cum = [0];
    for (let i = 0; i <= 60; i++) { const [x, y] = bez(UNA_ROAD_T, 0.4 + (0.57 * i) / 60); pts.push([x - 190, y + 0.45 * (botY(x) - y)]); if (i) cum.push(cum[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); }
    return (UNA_PATH = { pts, cum, L: cum[cum.length - 1] });
  }
  /** 路中线上弧长 d 处的点（设计坐标） */
  function unaAt(d) {
    const P = unaPath(), c = P.cum; d = clamp(d, 0, P.L);
    let k = 1; while (k < c.length - 1 && c[k] < d) k++;
    const f = (d - c[k - 1]) / max(1e-6, c[k] - c[k - 1]), a = P.pts[k - 1], b = P.pts[k];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  // 乌纳的山谷：大火山 + 重建中的村子
  def('una-valley', 2300, 1080, (q, w, h) => {
    paintVolcano(q, { cx: 1420, baseY: 760, peakY: 250, halfW: 900, craterW: 170, top: '#a3adc4', base: '#8994ae', shade: 'rgba(70,80,116,.4)', gully: 'rgba(90,100,134,.5)', snow: 'rgba(245,248,252,.9)', haze: 'rgba(214,228,242,.9)', shoulder: [-1, 0.55, 50], seed: 3, x0: 300, x1: 2400, bottom: 1080 });
    // 远处的矮山
    q.fillStyle = '#a7b6cc'; poly(q, [...sample(-20, 900, 20, (x) => 690 - 60 * sin(x * 0.004 + 0.5) - 30 * sin(x * 0.011)), [900, 900], [-20, 900]]); q.fill();
    // 田野（正在恢复的绿）
    q.fillStyle = lin(q, 0, 700, 0, 1080, [[0, '#a9bd98'], [1, '#8fa882']]); poly(q, [...sample(-20, w + 20, 20, (x) => 760 + 18 * sin(x * 0.005) + 10 * sin(x * 0.013)), [w + 20, 1080], [-20, 1080]]); q.fill();
    const R = rng(7);
    q.strokeStyle = 'rgba(120,140,100,.4)'; q.lineWidth = 2; for (let i = 0; i < 14; i++) { const y = 800 + i * 20; q.beginPath(); q.moveTo(-20, y); q.bezierCurveTo(600, y - 20, 1400, y + 30, w, y - 10); q.stroke(); }
    // 白灰还积在低处
    q.fillStyle = 'rgba(240,242,246,.7)'; for (let i = 0; i < 40; i++) { q.beginPath(); q.ellipse(R() * w, 780 + R() * 280, 40 + R() * 120, 6 + R() * 10, 0, 0, TAU); q.fill(); }
    // 村子（房子的位置 / 颜色来自 unaVillage()，和上面重放的是同一串随机数；这里跳过同样多的随机数，后面的树和草不变）
    const V = unaVillage();
    for (let i = 160; i < V.calls; i++) R();
    for (const H of V.hs) {
      const { x, y, s: s2, ww, hh } = H;
      q.fillStyle = H.wall; q.fillRect(x - ww / 2, y - hh, ww, hh);
      q.fillStyle = H.roof; poly(q, [[x - ww / 2 - 6, y - hh], [x, H.peak], [x + ww / 2 + 6, y - hh]]); q.fill();
      if (H.chim) { q.fillStyle = '#8a6a60'; q.fillRect(H.cx - 4 * s2, H.cy, 8 * s2, 16 * s2); q.fillStyle = '#6b4d45'; q.fillRect(H.cx - 5.5 * s2, H.cy - 2 * s2, 11 * s2, 4 * s2); }
      q.fillStyle = '#6f86a8'; q.fillRect(x - ww * 0.3, y - hh * 0.65, 10 * s2, 12 * s2); q.fillRect(x + ww * 0.1, y - hh * 0.65, 10 * s2, 12 * s2);
      if (H.scaf) { q.strokeStyle = '#a07a50'; q.lineWidth = 2; q.strokeRect(x - ww / 2 - 8, y - hh - 30 * s2, ww + 16, hh + 30 * s2); q.beginPath(); q.moveTo(x - ww / 2 - 8, y); q.lineTo(x + ww / 2 + 8, y - hh - 30 * s2); q.stroke(); }
      if (H === V.fix) { q.strokeStyle = 'rgba(120,80,50,.8)'; q.lineWidth = 1.6; for (let k = 1; k < 4; k++) { const f = k / 4; q.beginPath(); q.moveTo(x + 2, H.peak + 34 * s2 * f); q.lineTo(x + (ww / 2 + 6) * f, H.peak + 34 * s2 * f); q.stroke(); } }
      q.strokeStyle = 'rgba(70,70,90,.35)'; q.lineWidth = 1.5; q.strokeRect(x - ww / 2, y - hh, ww, hh);
    }
    // 小教堂
    q.fillStyle = '#f7f2ea'; q.fillRect(700, 740, 70, 120); q.fillStyle = '#5b6687'; poly(q, [[694, 740], [735, 660], [776, 740]]); q.fill(); q.fillStyle = '#f7f2ea'; q.fillRect(760, 800, 120, 60); q.fillStyle = '#b5553f'; poly(q, [[754, 800], [820, 770], [886, 800]]); q.fill();
    // 新树与烧过的枯树
    for (let i = 0; i < 30; i++) { const x = R() * w, y = 790 + R() * 200; if (R() < 0.3) { q.strokeStyle = '#8a8a94'; q.lineWidth = 3; q.beginPath(); q.moveTo(x, y); q.lineTo(x + 2, y - 40); q.moveTo(x + 1, y - 26); q.lineTo(x + 12, y - 36); q.stroke(); } else { q.fillStyle = ['#6f9a6a', '#5f8a5c', '#86ad78'][i % 3]; q.beginPath(); q.arc(x, y - 22, 14 + R() * 8, 0, TAU); q.fill(); q.fillStyle = '#6a5040'; q.fillRect(x - 2, y - 10, 4, 12); } }
    // 路
    q.fillStyle = '#d9d2c4'; q.beginPath(); q.moveTo(-40, 1080); q.bezierCurveTo(300, 980, 500, 930, 760, 900); q.lineTo(800, 906); q.bezierCurveTo(560, 950, 400, 1010, 180, 1080); q.fill();
    // 村口的木牌
    q.fillStyle = '#7a5a44'; q.fillRect(236, 900, 10, 120); q.fillRect(318, 900, 10, 120);
    q.fillStyle = '#e8d8bc'; rrect(q, 210, 880, 140, 60, 6); q.fill(); q.strokeStyle = '#7a5a44'; q.lineWidth = 4; q.stroke();
    E.text(q, '乌纳村', 280, 924, { size: 32, weight: 700, color: '#4a3a30', spacing: 4 });
    // 近处的草和小花
    for (let i = 0; i < 160; i++) { const x = R() * w, y = 960 + R() * 130; q.strokeStyle = ['#7f9f6a', '#6a8a5a', '#98b884'][i % 3]; q.lineWidth = 3; q.beginPath(); q.moveTo(x, y); q.lineTo(x + (R() - 0.5) * 10, y - 14 - R() * 20); q.stroke(); if (R() < 0.2) { q.fillStyle = ['#ffffff', '#f49ab0', '#f2c14e'][i % 3]; q.beginPath(); q.arc(x, y - 18, 4, 0, TAU); q.fill(); } }
  });
  /** 火山口升起的一缕白烟（软的）：出口在 (560, 660)，往左上飘散 */
  def('plume', 700, 700, (q) => {
    const R = rng(5);
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 70; i++) {
      const k = i / 69, x = 560 - k * 430 + sin(k * 5.5) * 26 + (R() - 0.5) * 20 * k, y = 660 - k * 520 - sin(k * 2.4) * 40 + (R() - 0.5) * 16 * k;
      const r = 16 + k * 105 * (0.8 + R() * 0.4);
      const c = pass ? '255,255,255' : '160,172,200', a = (pass ? 0.13 : 0.08) * (1 - k * 0.55);
      const ox = pass ? -r * 0.12 : r * 0.1, oy = pass ? -r * 0.15 : r * 0.12;
      q.fillStyle = rad(q, x + ox, y + oy, 0, r, [[0, `rgba(${c},${a})`], [0.6, `rgba(${c},${a * 0.7})`], [1, `rgba(${c},0)`]]);
      q.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  });

  // 17 · 乌纳 —— 重建中的村子，远处是那座火山；她走在进村的路上，屋顶上有人在钉木板
  shot('un-valley', bar(39), { title: '乌纳', in: { type: 'white', dur: 1.0 }, pre: ['sky-una', 'una-valley', 'plume', 'fg-grass', 'cl-b', 'cl-c'] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    // 镜头略低一点：2.35:1 黑边进来以后，走在路上的她（连脚）还在画面里
    const cam = { x: 900 + 160 * ease.inOut(p), y: 590, z: 1.0 + 0.04 * p, ...s.handheld(121, t, 3) };
    sky(g, s, 'sky-una');
    s.layer(g, cam, 0.15, (q) => { q.drawImage(C(s, 'cl-b'), 200 - s.lt * 6, 60, 600, 300); q.drawImage(C(s, 'cl-c'), 1300 - s.lt * 5, 110, 460, 214); });
    const V = unaVillage();
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'una-valley', -190, 0);
      q.fillStyle = '#8fa882'; q.fillRect(-240, 1076, 2400, 220); // 画布下沿再往下铺一截草地（黑边进来之前也不会露底）
      // 白烟：出口对准火山口 (1230, 250)
      const pl = C(s, 'plume'); q.globalAlpha = 0.9; q.drawImage(pl, 1230 - 560 - sin(t * 0.3) * 8, 250 - 660, 700, 700); q.globalAlpha = 1;
      // 炊烟：从三栋房子的烟囱里冒出来
      V.chim.forEach((H, i) => smoke(q, t + i * 1.7, H.cx - 190, H.cy, i + 1, 0.8 * H.s));
      // 屋顶上钉木板的人（和房子同一个比例），跪在那栋搭着脚手架的房子的屋顶斜面上，锤子落在拍子上
      const F = V.fix, fk = 0.32, rx = F.x - 190 + (F.ww / 2 + 6) * fk, ry = F.peak + 34 * F.s * fk + 1, wh = 34 * F.s, hb = s.pulse(9);
      cast(q, 'crowd', { x: rx, y: ry, h: wh, pose: 'kneel', t, flip: true, color: '#5b6f94', seed: 5 });
      const hx = rx - wh * 0.28, hy = ry - wh * 0.42;
      q.strokeStyle = '#4a4450'; q.lineWidth = 2; q.lineCap = 'round'; q.beginPath(); q.moveTo(hx, hy); q.lineTo(hx - wh * 0.22, hy - wh * 0.18 + hb * wh * 0.3); q.stroke();
      if (hb > 0.6) E.glow(q, hx - wh * 0.24, hy + wh * 0.14, 8, '255,255,255', hb * 0.6);
      // 她（小小的）和小黑羊，沿着路的中线往村里走（按角色库的步幅算速度，脚底不打滑；越走越远，稍微变小）
      const v = gaitSpeed('adele-alter', { h: 145, pose: 'walk', speed: STEP_SPD }, 44), L = unaPath().L;
      const dA = L - 20 - (s.dur - lt) * v;
      const [ax, ay] = unaAt(dA), sc = 1 - 0.07 * clamp(dA / L);
      adele(q, { x: ax, y: ay + 1, h: 150 * sc, pose: 'walk', t: s.beat * BEAT, speed: STEP_SPD, expr: 'smile', wind: 0.3, prop: ['staff', 'backpack'], shadow: 0.2 });
      const [sx2, sy2] = unaAt(dA - 46);
      cast(q, 'sheep-black', { shadow: 0.2, x: sx2, y: sy2 + 2, h: 38 * sc, pose: 'walk', t: s.beat * BEAT + 0.3, speed: sheepSpeed(38 * sc, v) });
    });
    // 飞过的鸟（村子是活的）
    s.layer(g, cam, 1, (q) => birds(q, lt, { x0: 200, y0: 300, vx: 70, n: 7, seed: 122, s: 1 }));
    // 焦外的前景：右下角一丛草和小白花（视差 1.5，比地面滑得快，画面有了纵深）
    s.layer(g, cam, 1.5, (q) => q.drawImage(C(s, 'fg-grass'), 1450, 700, 900, 420));
    ashfall(g, t, { n: 50, seed: 121, vy: 40, vx: 12, s0: 1.2, s1: 4, a: 0.7 });
    vigS(g, s, 0.25);
  });

  // 18 · 小女孩 —— 台阶上抱着膝盖的孩子。她走过去蹲下，小黑羊蹭了蹭孩子的手；两个人一起看向那座山
  def('una-house', 2112, 1188, (q) => {
    q.translate(96, 54);
    q.fillStyle = lin(q, 0, -54, 0, 700, [[0, '#5d9be0'], [1, '#d8ebfa']]); q.fillRect(-96, -54, 2112, 800);
    paintVolcano(q, { cx: 1560, baseY: 700, peakY: 300, halfW: 700, craterW: 120, top: '#a3aec5', base: '#909bb4', shade: 'rgba(70,80,116,.35)', gully: 'rgba(90,100,134,.5)', snow: 'rgba(245,248,252,.9)', haze: 'rgba(214,228,242,.9)', shoulder: [1, 0.5, 40], seed: 5, x0: 800, x1: 2100, bottom: 800 });
    q.fillStyle = '#a9bd98'; q.fillRect(-96, 690, 2112, 460);
    q.fillStyle = lin(q, 0, 880, 0, 1134, [[0, '#a3b893'], [1, '#98a888']]); q.fillRect(-96, 880, 2112, 260);
    // 房子（白墙木骨架）
    q.fillStyle = '#f4efe6'; q.fillRect(-96, 120, 1100, 900);
    q.strokeStyle = '#8a6a50'; q.lineWidth = 16; q.beginPath(); q.moveTo(-96, 130); q.lineTo(1004, 130); q.moveTo(-96, 560); q.lineTo(1004, 560); q.moveTo(996, 130); q.lineTo(996, 1030); q.moveTo(400, 130); q.lineTo(400, 560); q.moveTo(400, 130); q.lineTo(700, 560); q.stroke();
    q.fillStyle = '#b5553f'; poly(q, [[-96, 140], [-96, -54], [1080, -54], [1080, 60], [1030, 140]]); q.fill();
    q.strokeStyle = 'rgba(80,40,30,.35)'; q.lineWidth = 3; for (let x = -96; x < 1080; x += 40) { q.beginPath(); q.moveTo(x, -54); q.lineTo(x + 10, 140); q.stroke(); }
    // 窗 + 花箱
    q.fillStyle = '#fbf8f2'; q.fillRect(110, 240, 200, 220); q.fillStyle = lin(q, 0, 250, 0, 450, [[0, '#b9d8f4'], [1, '#6f8fbf']]); q.fillRect(124, 254, 172, 192);
    q.strokeStyle = '#fbf8f2'; q.lineWidth = 8; q.beginPath(); q.moveTo(210, 254); q.lineTo(210, 446); q.moveTo(124, 350); q.lineTo(296, 350); q.stroke();
    q.fillStyle = '#6a8a5a'; q.fillRect(100, 460, 220, 26); const R = rng(4); for (let i = 0; i < 14; i++) { q.fillStyle = ['#d2334f', '#ffffff', '#f49ab0'][i % 3]; q.beginPath(); q.arc(110 + i * 15, 456 - R() * 10, 8, 0, TAU); q.fill(); }
    // 门 + 台阶
    q.fillStyle = '#7a5a44'; rrect(q, 560, 620, 240, 360, 10); q.fill(); q.fillStyle = '#6a4a38'; q.fillRect(580, 650, 90, 140); q.fillRect(690, 650, 90, 140); q.fillStyle = '#e7c46a'; q.beginPath(); q.arc(770, 820, 7, 0, TAU); q.fill();
    q.fillStyle = '#cfc8bb'; q.fillRect(520, 980, 330, 40); q.fillStyle = '#bdb5a8'; q.fillRect(490, 1020, 390, 40); q.fillStyle = '#aaa294'; q.fillRect(460, 1060, 450, 80);
    // 地面
    q.fillStyle = lin(q, 0, 1000, 0, 1134, [[0, '#b7c2a4'], [1, '#98a888']]); q.fillRect(900, 1000, 1200, 140); q.fillRect(-96, 1060, 560, 80);
    q.fillStyle = 'rgba(240,242,246,.8)'; for (let i = 0; i < 30; i++) { q.beginPath(); q.ellipse(900 + R() * 1100, 1010 + R() * 120, 20 + R() * 60, 4 + R() * 6, 0, 0, TAU); q.fill(); }
  }, 1.25);
  const UNA_HOUSE_PROF = volcanoProfile({ cx: 1560, baseY: 700, peakY: 300, halfW: 700, craterW: 120, shoulder: [1, 0.5, 40], seed: 5 });
  shot('un-girl', bar(41), { pre: ['una-house'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    // 镜头放低、稍微拉开：台阶、孩子、她的脚和小黑羊都在 2.35:1 的黑边以内
    const cam = { x: 900 + 40 * s.p, y: 745, z: 1.2 + 0.04 * s.p, ...s.handheld(131, t, 2.5) };
    const arrive = bar(41) + BEAT * 3, kneel = bar(42);
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'una-house'), -96, -54, 2112, 1188);
      const lookUp = t > bar(42) + BEAT * 2;
      girl(q, 690, 985, 340, 'hug', t, { look: lookUp ? 1 : 0, smile: t > bar(42) + BEAT * 1 });
      // 走过来（按角色库的步幅算速度，脚底不打滑）、蹲到和孩子一样高；最后两个人一起看向那座山
      const v = gaitSpeed('adele-alter', { h: 430, pose: 'walk', speed: STEP_SPD }, 125);
      const ax = 960 + max(0, arrive - t) * v, pose = t < arrive ? 'walk' : t < kneel ? 'stand' : 'crouch';
      adele(q, { x: ax, y: 1030, h: 430, pose, t: t < arrive ? s.beat * BEAT : t, speed: STEP_SPD, flip: !lookUp, expr: lookUp ? 'content' : 'smile', look: lookUp ? [1, -0.3] : [-1, 0.2], wind: 0.25, ground: pose === 'crouch' ? true : null });
      // 小黑羊一路小跑过来（跑步的步频配合速度），跳上台阶，拿头去蹭孩子的手
      const run0 = bar(41) + 0.3, hop0 = bar(41) + 2.0, hop1 = hop0 + 0.36;
      const vS = gaitSpeed('sheep-black', { h: 90, pose: 'run', speed: 2.8 }, 180);
      if (t < hop0) {
        const sx = 900 + max(0, hop0 - max(t, run0)) * vS;
        cast(q, 'sheep-black', { shadow: 0.2, x: sx, y: 1012, h: 90, pose: t < run0 ? 'stand' : 'run', t, speed: 2.8, flip: true });
      } else if (t < hop1) {
        const k = (t - hop0) / (hop1 - hop0), sy = lerp(1012, 983, k) - sin(PI * k) * 46;
        cast(q, 'sheep-black', { shadow: 0.2, shadowY: lerp(1012, 983, k), x: lerp(900, 800, k), y: sy, h: 90, pose: 'jump', air: 0, t, flip: true });
      } else cast(q, 'sheep-black', { shadow: 0.2, x: 800, y: 983, h: 90, pose: t < hop1 + BEAT * 2 ? 'push' : 'stand', t, flip: true });
    });
    ashfall(g, t, { n: 40, seed: 131, vy: 36, vx: 10, s0: 1.5, s1: 5, a: 0.7 });
    vigS(g, s, 0.3);
  });

  // 19 · 夜里的第一步 —— 粉色的小羊发着光，一只接一只替她照亮上山的路；山下是村子的灯
  skyDef('sky-night', [[0, '#070b22'], [0.5, '#141d45'], [0.85, '#2c2c5e'], [1, '#4a3a6a']]);
  def('night-slope', 2600, 1300, (q, w, h) => {
    const R = rng(13);
    // 远处的山脊线（地平线压低一些）+ 山谷里乌纳村的灯
    q.fillStyle = '#161b3a'; poly(q, [[0, 700], [300, 660], [620, 690], [900, 650], [1300, 690], [1700, 660], [2600, 700], [2600, 1300], [0, 1300]]); q.fill();
    q.fillStyle = '#0d1128'; poly(q, [[0, 760], [500, 740], [1000, 770], [2600, 760], [2600, 1300], [0, 1300]]); q.fill();
    q.fillStyle = 'rgba(120,120,180,.12)'; q.fillRect(0, 740, 2600, 30);
    for (let i = 0; i < 90; i++) { const x = 60 + R() * 760, y = 780 + pow(R(), 1.5) * 150; q.fillStyle = R() < 0.85 ? '#ffcf8a' : '#9fd0ff'; q.globalAlpha = 0.55 + R() * 0.45; q.fillRect(x, y, 4 + R() * 3, 3 + R() * 2); } q.globalAlpha = 1;
    for (let i = 0; i < 12; i++) { const x = 80 + R() * 700, y = 790 + R() * 130; const gr = q.createRadialGradient(x, y, 0, x, y, 40); gr.addColorStop(0, 'rgba(255,200,130,.25)'); gr.addColorStop(1, 'rgba(255,200,130,0)'); q.fillStyle = gr; q.fillRect(x - 40, y - 40, 80, 80); }
    // 山坡（斜着往右上）
    // 从画布最左边就开始（原来从 x=500 开始，镜头刚开始时坡的左端是一条竖着的硬边）
    const surf = (x) => 1240 - x * 0.42 + sin(x * 0.01) * 14 + sin(x * 0.037) * 5;
    poly(q, [...sample(-20, w, 16, surf), [w, h], [-20, h]]); q.fillStyle = lin(q, 0, 200, 0, 1300, [[0, '#1c2244'], [1, '#0c1024']]); q.fill();
    q.strokeStyle = 'rgba(160,170,220,.35)'; q.lineWidth = 3; line(q, sample(-20, w, 16, surf)); q.stroke();
    for (let i = 0; i < 80; i++) { const x = 560 + R() * (w - 600), y = surf(x) + 20 + R() * 300; q.fillStyle = 'rgba(40,46,84,.9)'; q.beginPath(); q.ellipse(x, y, 10 + R() * 30, 6 + R() * 12, 0, 0, TAU); q.fill(); q.strokeStyle = 'rgba(120,130,190,.25)'; q.lineWidth = 2; q.beginPath(); q.ellipse(x, y, 10 + R() * 30, 6 + R() * 12, 0, PI * 1.1, PI * 1.9); q.stroke(); }
  });
  // 银河：一条斜着的光带（密的小星 + 暗的尘带），几乎不动
  def('milkyway', 1920, 1080, (q) => {
    const R = rng(17);
    const band = (u) => [lerp(-100, 2020, u), lerp(900, -60, u)];
    for (let i = 0; i < 26; i++) { const [x, y] = band(R()); const r = 90 + R() * 160; const gr = q.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${R() < 0.5 ? '190,180,255' : '255,210,230'},.10)`); gr.addColorStop(1, 'rgba(190,180,255,0)'); q.fillStyle = gr; q.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let i = 0; i < 900; i++) { const [x, y] = band(R()); const off = (R() + R() + R() - 1.5) * 140; q.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.6})`; const s2 = R() < 0.05 ? 2.4 : 1.2; q.fillRect(x + off * 0.45, y + off, s2, s2); }
    q.strokeStyle = 'rgba(8,10,30,.35)'; q.lineWidth = 26; q.lineCap = 'round';
    q.beginPath(); for (let u = 0; u <= 1; u += 0.02) { const [x, y] = band(u); const yy = y + sin(u * 12) * 18 + 10; u ? q.lineTo(x, yy) : q.moveTo(x, yy); } q.stroke();
  });
  const NS = { x0: 700, slope: 0.42 }; // 夜坡的坡度（每走 1px 升高 0.42px）
  const nsY = (x) => 1240 - x * 0.42 + sin(x * 0.01) * 14 + sin(x * 0.037) * 5;
  shot('un-night', bar(43), { in: { type: 'black', dur: 0.7 }, pre: ['sky-night', 'night-slope', 'milkyway'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    // 横向速度按角色库的步幅算（原来 95px/s，比她的步子快了 25%，脚在坡上打滑）
    const v = gaitSpeed('adele-alter', { h: 260, pose: 'walk', speed: STEP_SPD }, 76);
    const ax = 900 + lt * v, ay = nsY(ax);
    const cam = { x: ax + 200, y: ay - 180, z: 1.0, ...s.handheld(141, t, 3) };
    sky(g, s, 'sky-night');
    g.drawImage(C(s, 'milkyway'), -lt * 4 - 24, 0, 1968, 1080);
    s.kit.stars(g, t, { n: 150, seed: 14, h: 700, size: 2.4 });
    // 流星：在第二小节的第三拍划过
    const sk = (t - (bar(44) + BEAT * 2)) / 0.55;
    if (sk > 0 && sk < 1) { const x = lerp(1500, 980, ease.out(sk)), y = lerp(90, 330, ease.out(sk)); g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(255,240,220,${0.8 * (1 - sk)})`; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 220 * (1 - sk * 0.5), y - 102 * (1 - sk * 0.5)); g.stroke(); g.restore(); E.glow(g, x, y, 24, '255,240,220', 1 - sk); }
    // 月牙
    g.fillStyle = '#fff6dc'; g.beginPath(); g.arc(1560, 180, 46, 0, TAU); g.fill(); g.fillStyle = '#0a0f2a'; g.beginPath(); g.arc(1580, 166, 42, 0, TAU); g.fill();
    E.glow(g, 1550, 190, 160, '255,240,210', 0.2);
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'night-slope', 0, 0);
      // 发光的蹄印（走过后慢慢暗下去）
      for (let i = 0; i < 40; i++) {
        const born = bar(43) + i * BEAT * 0.5 - 0.3, age = t - born;
        if (age < 0) continue;
        const px = 900 + (born - bar(43)) * v + 200 + (i % 2) * 14;
        E.glow(q, px, nsY(px) + 4, 10, '255,160,210', 0.8 * Math.exp(-age * 0.6));
      }
      // 小羊们在前面引路（小羊腿短，要小跑才跟得上她：跑步的步频按速度配）
      for (let i = 0; i < 4; i++) {
        const lx = ax + 200 + i * 130 + sin(t * 1.3 + i) * 4, ly = nsY(lx);
        E.glow(q, lx, ly - 40, 140, '255,160,210', 0.35);
        cast(q, 'sheep-pink', { shadow: 0.2, x: lx, y: ly + 2, h: 70, pose: 'run', t: t + i * 0.3, speed: sheepSpeed(70, v, true), glow: 1 });
      }
      const ao = { x: ax, y: ay + 4, h: 260, pose: 'walk', arms: 'hold', t: s.beat * BEAT, speed: STEP_SPD, expr: 'smile', prop: 'lantern', glow: 1, wind: 0.2, look: [1, -0.2] };
      adele(q, ao);
      const lp = anchor('adele-alter', ao, 'prop');
      E.glow(q, lp[0], lp[1], 120, '255,210,140', 0.55);
    });
    s.kit.particles(g, t, 'fireflies', { n: 26, seed: 15, rgb: '255,170,220' });
    vigS(g, s, 0.55);
  });

  /** 预警花：k 0..1 长出、开放；glow 发光强度 */
  function warnFlower(g, x, y, sc, k, t, glow) {
    g.save(); g.translate(x, y); g.scale(sc, sc);
    const st = ease.out(clamp(k * 1.6)), op = ease.back(clamp((k - 0.5) * 2));
    g.strokeStyle = '#5f8a6a'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10, -60 * st, 0, -120 * st); g.stroke();
    for (const [sd, yy] of [[-1, -40], [1, -70]]) { const lk = clamp(st * 2 - (yy === -40 ? 0.4 : 0.8)); if (lk <= 0) continue; g.save(); g.translate(4, yy * st); g.rotate(sd * (0.9 - 0.3 * lk)); g.scale(lk, lk); g.fillStyle = '#6f9a6a'; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(sd * 30, -14, sd * 52, 0); g.quadraticCurveTo(sd * 30, 14, 0, 0); g.fill(); g.restore(); }
    if (glow > 0) E.glow(g, 0, -126 * st, 120 * (0.6 + op * 0.4), '255,150,190', glow * (0.5 + 0.5 * op));
    g.translate(0, -126 * st);
    if (op > 0) {
      for (let i = 0; i < 6; i++) { g.save(); g.rotate((i / 6) * TAU + t * 0.1); g.scale(op, op); g.fillStyle = i % 2 ? '#fff4f6' : '#ffe0e8'; g.beginPath(); g.ellipse(0, -26, 14, 28, 0, 0, TAU); g.fill(); g.restore(); }
      for (let i = 0; i < 5; i++) { g.save(); g.rotate((i / 5) * TAU + 0.3); g.scale(op, op); g.fillStyle = '#d2334f'; g.beginPath(); g.ellipse(0, -14, 8, 16, 0, 0, TAU); g.fill(); g.restore(); }
      g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(0, 0, 7 * op, 0, TAU); g.fill();
    } else { g.fillStyle = '#d2334f'; g.beginPath(); g.ellipse(0, -6, 9 * st, 16 * st, 0, 0, TAU); g.fill(); }
    g.restore();
  }
  // 20 · 预警花 —— 她跪在灰里，把一株预警花种下；花开了，发着光，小羊们围过来坐下
  shot('un-flower', bar(46), { pre: ['sky-night', 'night-slope', 'milkyway'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    // 她跪在坡面上（原来跪的高度取的是花那里的坡面，比她身下的坡高出 50 多像素，整个人悬在夜空里），
    // 花种在她手够得着的地方；小羊们在上坡那边围着花坐下
    const AX = 1400, AY = nsY(AX) + 3;
    const ao = { x: AX, y: AY, h: 250, pose: 'kneel2', arms: 'dig', t: bar(46) + BEAT, expr: 'neutral', prop: null, look: [1, 0.5] };
    const hand = anchor('adele-alter', ao, 'handN');
    const fx = clamp(hand[0] + 12, AX + 50, AX + 140), fy = nsY(fx) + 2;
    const cam = { x: AX + 115, y: AY - 175, z: 1.9 - 0.15 * s.p, ...s.handheld(151, t, 2) };
    sky(g, s, 'sky-night');
    g.drawImage(C(s, 'milkyway'), -300, -100, 1920 * 1.3, 1080 * 1.3);
    s.kit.stars(g, t, { n: 120, seed: 16, h: 800, size: 2.2 });
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'night-slope', 0, 0);
      const k = clamp((t - bar(46) - BEAT * 2) / (BEAT * 5));
      for (let i = 0; i < 3; i++) { const lx = fx + [150, 235, 320][i], ly = nsY(lx); cast(q, 'sheep-pink', { shadow: 0.2, x: lx, y: ly + 2, h: 64, pose: 'sit', t: t + i, glow: 0.8, flip: true }); }
      adele(q, { ...ao, t, arms: k < 0.55 ? 'dig' : 'rest', expr: k > 0.6 ? 'content' : 'neutral', ground: (x) => nsY(x) + 4 });
      warnFlower(q, fx, fy, 0.55, k, t, 0.55 + 0.3 * s.pulse(3) + 0.3 * s.acc(0.3));
      q.fillStyle = 'rgba(210,214,230,.5)'; q.beginPath(); q.ellipse(fx, fy + 2, 30, 7, -0.4, 0, TAU); q.fill();
    });
    motes(g, t, { n: 20, seed: 17, rgb: '255,180,220', a: 0.6, s: 6, rise: 80 });
    vigS(g, s, 0.55);
  });

  /* ---------- 白天的灰坡：侧面跟拍 ---------- */
  const SLOPE = 0.2; // 坡角（弧度）
  skyDef('sky-slope', [[0, '#5f9be0'], [0.4, '#a9cdef'], [0.7, '#e0ecf6'], [1, '#f4f2ee']]);
  def('slope-bg', 2600, 1080, (q, w, h) => {
    // 远处的山、云海
    q.fillStyle = '#9fb0cf'; poly(q, [[0, 640], [300, 560], [520, 600], [800, 500], [1100, 590], [1500, 540], [1900, 600], [2300, 520], [2600, 580], [2600, 800], [0, 800]]); q.fill();
    q.fillStyle = 'rgba(255,255,255,.5)'; poly(q, [[760, 520], [800, 500], [840, 520], [820, 530]]); q.fill();
    paintCloudSea(q, -60, 640, w + 120, 420, 31, { r: 44, rows: 5, lit: ['#ffffff'], shade: ['#dbe5f2', '#d3dfee', '#ccd9ea', '#c6d4e8', '#c0cfe4'], lx: -0.3 });
  });
  soften('slope-bg', 7); // 灰坡后面的远山和云海：焦外
  /**
   * 灰坡条带（3200 宽，三张首尾相接地铺）：地表起伏的频率都是 3200 的整数分之一，纹理在左右边缘绕回来画一遍，
   * 所以接缝处没有台阶、也没有被切掉一半的石子。高 1000：镜头缩小（同路那一镜）时画面右下角也盖得住。
   */
  const STRIP_W = 3200, STRIP_H = 1000;
  const wv = (n) => (TAU * n) / STRIP_W;
  /** 条带图里横坐标 x 处的地表 y（条带图自己的坐标，地表大约在 y=40） */
  const stripSurf = (x) => 40 + sin(x * wv(2)) * 8 + sin(x * wv(7) + 1) * 4 + sin(x * wv(25)) * 1.5;
  /** 在 x 处画一样东西，靠近左右边缘时在另一头再画一遍（条带首尾相接） */
  const wrapX = (w, x, r, fn) => { fn(x); if (x < r) fn(x + w); if (x > w - r) fn(x - w); };
  function paintStrip(q, w, h, seed, bloom) {
    poly(q, [...sample(0, w, 10, stripSurf), [w, h], [0, h]]);
    q.fillStyle = bloom ? lin(q, 0, 0, 0, h, [[0, '#9cc088'], [0.3, '#7aa868'], [0.76, '#5a8a50'], [1, '#527f49']]) : lin(q, 0, 0, 0, h, [[0, '#c7ccd8'], [0.23, '#a9b0c0'], [0.76, '#7c859c'], [1, '#737b92']]);
    q.fill();
    const R = rng(seed);
    if (!bloom) {
      // 层纹
      q.strokeStyle = 'rgba(255,255,255,.28)'; q.lineWidth = 2;
      for (let i = 0; i < 32; i++) { const y0 = 60 + R() * 860; q.beginPath(); for (let x = 0; x <= w; x += 40) { const y = y0 + sin(x * wv(3) + i) * 8; x ? q.lineTo(x, y) : q.moveTo(x, y); } q.stroke(); }
      // 石子
      for (let i = 0; i < 330; i++) {
        const x = R() * w, yy = pow(R(), 1.5), y = stripSurf(x) + 10 + yy * 920, r = 3 + R() * (y < 200 ? 10 : 22), col = ['#8a90a2', '#767d92', '#9aa0b0'][i % 3];
        wrapX(w, x, r * 1.4 + 2, (xx) => { q.fillStyle = col; q.beginPath(); q.ellipse(xx, y, r * 1.3, r * 0.8, 0, 0, TAU); q.fill(); q.fillStyle = 'rgba(255,255,255,.35)'; q.beginPath(); q.ellipse(xx - r * 0.2, y - r * 0.3, r * 0.7, r * 0.3, 0, 0, TAU); q.fill(); });
      }
      // 地表的一道亮边 + 零星的草
      q.strokeStyle = 'rgba(255,255,255,.75)'; q.lineWidth = 4; line(q, sample(0, w, 10, stripSurf)); q.stroke();
      for (let i = 0; i < 50; i++) {
        const x = R() * w, y = stripSurf(x) + 4, col = ['#8aa07a', '#9ab08a'][i % 2], hs = [0, 1, 2, 3, 4].map(() => 8 + R() * 10);
        wrapX(w, x, 24, (xx) => { q.strokeStyle = col; q.lineWidth = 2.5; for (let k = 0; k < 5; k++) { q.beginPath(); q.moveTo(xx + k * 3, y); q.lineTo(xx + k * 3 + (k - 2) * 3, y - hs[k]); q.stroke(); } });
      }
    } else {
      // 开满花的坡：草、小花（五瓣）、坡沿上一排高一点的花
      for (let i = 0; i < 1100; i++) {
        const x = R() * w, y = stripSurf(x) + 6 + pow(R(), 1.3) * 920, [pc, mc] = BLOOM_COLS[i % BLOOM_COLS.length];
        if (R() < 0.6) { const dx = (R() - 0.5) * 8, hh = 10 + R() * 14, col = ['#6fa060', '#86b870', '#5a8a50'][i % 3]; wrapX(w, x, 12, (xx) => { q.strokeStyle = col; q.lineWidth = 2.5; q.beginPath(); q.moveTo(xx, y); q.lineTo(xx + dx, y - hh); q.stroke(); }); }
        else { const r = 3 + R() * 6; wrapX(w, x, r * 2 + 2, (xx) => { for (let k = 0; k < 5; k++) { q.fillStyle = pc; q.beginPath(); q.arc(xx + cos(k * 1.26) * r, y + sin(k * 1.26) * r * 0.7, r * 0.7, 0, TAU); q.fill(); } q.fillStyle = mc; q.beginPath(); q.arc(xx, y, r * 0.5, 0, TAU); q.fill(); }); }
      }
      for (let i = 0; i < 160; i++) {
        const x = R() * w, y = stripSurf(x) + 2, [pc, mc] = BLOOM_COLS[i % BLOOM_COLS.length];
        wrapX(w, x, 16, (xx) => { q.strokeStyle = '#6fa060'; q.lineWidth = 3; q.beginPath(); q.moveTo(xx, y + 4); q.lineTo(xx, y - 22); q.stroke(); for (let k = 0; k < 5; k++) { q.fillStyle = pc; q.beginPath(); q.arc(xx + cos(k * 1.26) * 7, y - 24 + sin(k * 1.26) * 7, 6, 0, TAU); q.fill(); } q.fillStyle = mc; q.beginPath(); q.arc(xx, y - 24, 4, 0, TAU); q.fill(); });
      }
      q.strokeStyle = 'rgba(255,255,255,.5)'; q.lineWidth = 3; line(q, sample(0, w, 10, stripSurf)); q.stroke();
    }
  }
  def('slope-strip', STRIP_W, STRIP_H, (q, w, h) => paintStrip(q, w, h, 55, false));
  /** 侧面跟拍的灰坡：人物固定在屏幕 (sx, sy)，已走了 d 像素（沿坡），返回沿坡坐标 → 屏幕坐标的函数（落在条带真实的地表上） */
  function slopeFrame(g, s, d, sx, sy, o = {}) {
    const th = o.th ?? SLOPE, c = cos(th), sn = sin(th);
    g.save(); g.translate(sx, sy); g.rotate(-th);
    const strip = C(s, o.strip || 'slope-strip'), off = ((d % STRIP_W) + STRIP_W) % STRIP_W;
    for (let k = -1; k <= 1; k++) g.drawImage(strip, -off + k * STRIP_W - 400, -40, STRIP_W, STRIP_H);
    g.restore();
    // lx：沿坡离 (sx, sy) 的距离；ly：条带在那里的地表（局部坐标，y 向下）减去离地高度 up
    return (dd, up = 0) => {
      const lx = dd - d, ly = stripSurf((((lx + off + 400) % STRIP_W) + STRIP_W) % STRIP_W) - 40 - up;
      return [sx + lx * c + ly * sn, sy - lx * sn + ly * c];
    };
  }
  /** 前景：虚掉的石块，沿着坡比人走得快（视差），给画面一点纵深 */
  function fgRocks(g, d, o = {}) {
    const n = o.n ?? 5, span = 2600, par = o.par ?? 1.7, y0 = o.y ?? 1040, rgb = o.rgb || '46,50,72';
    for (let i = 0; i < n; i++) {
      const x = ((hash(o.seed || 1, i, 1) * span - d * par) % span + span) % span - 340;
      const y = y0 + hash(o.seed || 1, i, 2) * 60 - (x - 960) * (o.tilt ?? 0.2) * 0.5, r = 90 + hash(o.seed || 1, i, 3) * 110;
      E.glow(g, x, y, r, rgb, 0.8, 'source-over', false);
      E.glow(g, x - r * 0.2, y - r * 0.25, r * 0.5, '255,255,255', 0.06, 'lighter', false);
    }
  }
  /** 沿坡的脚印：每拍一个（左右交替），hoof=true 时在旁边加一对小蹄印 */
  function footprints(g, at, t, t0, speed, d0, o = {}) {
    const n = floor((t - t0) / BEAT);
    for (let i = max(0, n - 18); i <= n; i++) {
      const dd = d0 + i * BEAT * speed + 30;
      const [x, y] = at(dd, i % 2 ? -1 : -4);
      g.fillStyle = o.col || 'rgba(96,104,128,.55)'; g.beginPath(); g.ellipse(x, y + 2, 18, 5, -SLOPE, 0, TAU); g.fill();
      if (o.hoof) { const [hx, hy] = at(dd + 60, -2); const age = t - (t0 + i * BEAT + BEAT / 2); if (age > 0) { g.fillStyle = 'rgba(96,104,128,.5)'; g.beginPath(); g.ellipse(hx, hy + 3, 5, 2.5, -SLOPE, 0, TAU); g.ellipse(hx + 10, hy + 1, 5, 2.5, -SLOPE, 0, TAU); g.fill(); if (age < 0.6) E.glow(g, hx + 5, hy, 16, '255,180,220', (0.6 - age)); } }
    }
  }

  // 21 · 登山 —— 白天，灰色的山坡，一步一个拍子；她的脚印旁边多出一串小小的蹄印
  shot('un-climb', bar(48), { in: { type: 'white', dur: 0.8 }, pre: ['sky-slope', 'slope-bg', 'slope-strip', 'cl-c', 'cl-d'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    // 地面沿坡移动的速度：水平分量等于她的步速（sp / cos 坡角），脚底不打滑
    const sp = gaitSpeed('adele-alter', { h: 400, pose: 'walk', speed: STEP_SPD }, 120), d = (lt * sp) / cos(SLOPE);
    sky(g, s, 'sky-slope');
    g.drawImage(C(s, 'cl-d'), 1100 - s.lt * 4, 90, 800, 300); g.drawImage(C(s, 'cl-c'), 200 - s.lt * 5, 180, 460, 214);
    g.drawImage(C(s, 'slope-bg~'), -300 - d * 0.08, 60, 2600, 1080);
    const hh = s.handheld(161, t, 3), bp = 1 + 0.01 * s.barPulse(7) * RM(s);
    g.save(); g.translate(hh.sx, hh.sy); g.translate(960, 540); g.scale(bp, bp); g.translate(-960, -540);
    const at = slopeFrame(g, s, d, 820, 800);
    footprints(g, at, t, bar(48), sp / cos(SLOPE), 0, { hoof: true });
    // 脚落在条带真实的地表上（at 已经算上了坡面的起伏）
    const [ax, ay] = at(d), [bx2, by2] = at(d + 150);
    cast(g, 'sheep-black', { shadow: 0.2, x: bx2, y: by2 + 3, h: 80, pose: 'walk', t: s.beat * BEAT + 0.2, speed: sheepSpeed(80, sp) });
    adele(g, { x: ax, y: ay + 3, h: 400, pose: 'walk', t: s.beat * BEAT, speed: STEP_SPD, expr: 'determined', wind: 0.45, windDir: -1, look: [1, -0.25], prop: ['staff', 'backpack'], rim: '255,252,242', rimDir: -0.9, rimGlow: 0.05 });
    g.restore();
    fgRocks(g, d, { seed: 162, y: 1010 });
    ashfall(g, t, { n: 60, seed: 161, vy: 40, vx: -30, s0: 1.4, s1: 5, a: 0.8 });
    vigS(g, s, 0.25);
  });

  // 22 · 同路 —— 远一点看：同一条坡上，走在她前面的，是父母当年的影子
  shot('un-ghosts', bar(50), { pre: ['sky-slope', 'slope-bg', 'slope-strip', 'cl-d'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const sp = gaitSpeed('adele-alter', { h: 400, pose: 'walk', speed: STEP_SPD }, 110), d = (lt * sp) / cos(SLOPE);
    sky(g, s, 'sky-slope');
    g.drawImage(C(s, 'cl-d'), 900 - s.lt * 4, 60, 900, 340);
    g.drawImage(C(s, 'slope-bg~'), -500 - d * 0.1, 100, 2600, 1080);
    const hh = s.handheld(171, t, 2);
    g.save(); g.translate(hh.sx, hh.sy);
    g.save(); g.translate(960, 540); g.scale(0.62, 0.62); g.translate(-960, -540);
    const at = slopeFrame(g, s, d, 520, 1000);
    footprints(g, at, t, bar(50), sp / cos(SLOPE), 0, { hoof: true });
    const [ax, ay] = at(d);
    // 父母的虚影：在前面同一条路上，随拍子忽明忽暗；脚踩在坡面上，步频按各自的步幅配（和地面一起走，不打滑）
    const flick = 0.55 + 0.25 * s.pulse(2) + 0.1 * sin(t * 7);
    const reveal = sstep(bar(50), bar(50) + 1.2, t);
    for (const [who, dd, outfit, prop, hh2] of [['magna', 520, 'field', 'backpack', 400 * 0.94 / 0.84], ['katia', 700, 'field', 'hammer', 400 / 0.84]]) {
      const [gx, gy] = at(d + dd);
      const spd = (STEP_SPD * sp) / gaitSpeed(who, { h: hh2, pose: 'walk', speed: STEP_SPD }, sp);
      E.glow(g, gx, gy - 230, 300, '255,255,255', 0.14 * reveal * flick);
      // 半透明的、泛白的旧日身影（外套是同一件）
      cast(g, who, { x: gx, y: gy + 3, h: hh2, pose: 'walk', t: s.beat * BEAT, speed: spd, phase: who === 'katia' ? 0.25 : 0, outfit, prop, alpha: 0.62 * flick * reveal, rim: '255,255,255', look: [1, -0.1] });
      E.glow(g, gx, gy - hh2 * 0.5, hh2 * 0.6, '235,242,255', 0.12 * reveal, 'lighter', false);
      // 虚影脚下也有一串很淡的脚印
      for (let k = 1; k < 5; k++) { const [fx, fy] = at(d + dd - k * 50, -2); g.fillStyle = `rgba(255,255,255,${0.35 * reveal * (1 - k / 5)})`; g.beginPath(); g.ellipse(fx, fy + 2, 14, 4, -SLOPE, 0, TAU); g.fill(); }
    }
    adele(g, { x: ax, y: ay + 3, h: 400, pose: 'walk', t: s.beat * BEAT, speed: STEP_SPD, expr: 'neutral', look: [1, -0.2], wind: 0.4, windDir: -1, prop: ['staff', 'backpack'], rim: '255,252,242', rimDir: -0.9, rimGlow: 0.05 });
    const [bx2, by2] = at(d - 120);
    cast(g, 'sheep-black', { shadow: 0.2, x: bx2, y: by2 + 3, h: 80, pose: 'walk', t: s.beat * BEAT + 0.2, speed: sheepSpeed(80, sp) });
    g.restore();
    g.restore();
    ashfall(g, t, { n: 70, seed: 171, vy: 40, vx: -30, s0: 1.2, s1: 4.5, a: 0.8 });
    vigS(g, s, 0.25);
  });

  // 23 · 妈妈 —— 近一点：她和母亲的影子并肩走，外套是同一件；她转头看过去，影子化成白灰
  shot('un-mother', bar(52), { pre: ['sky-slope', 'slope-bg', 'slope-strip'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const sp = gaitSpeed('adele-alter', { h: 420, pose: 'walk', speed: STEP_SPD * 0.8 }, 90), d = (lt * sp) / cos(SLOPE);
    sky(g, s, 'sky-slope');
    g.drawImage(C(s, 'slope-bg~'), -200 - d * 0.12, 180, 2600, 1080);
    const hh = s.handheld(181, t, 2);
    g.save(); g.translate(hh.sx, hh.sy);
    g.save(); g.translate(960, 540); g.scale(1.35, 1.35); g.translate(-960, -540);
    const at = slopeFrame(g, s, d, 900, 820);
    const [ax, ay] = at(d), [mx, my] = at(d + 150);
    const fade = 1 - sstep(bar(53) + BEAT * 2, bar(54) - 0.1, t);
    // 妈妈的身影（和她身上是同一件外套），半透明、泛着白光，转过头来看她；步频按妈妈自己的步幅配（不打滑）
    const mh = 420 * 0.94 / 0.84, mspd = (STEP_SPD * 0.8 * sp) / gaitSpeed('magna', { h: mh, pose: 'walk', speed: STEP_SPD * 0.8 }, sp);
    E.glow(g, mx, my - mh * 0.55, mh * 0.8, '235,242,255', 0.35 * fade, 'lighter', false);
    cast(g, 'magna', { x: mx, y: my + 3, h: mh, pose: 'walk', t: s.beat * BEAT, speed: mspd, outfit: 'field', prop: 'backpack', alpha: 0.55 * fade * (0.85 + 0.15 * s.pulse(2)), rim: '255,255,255', look: t > bar(53) - 0.4 ? [-1, 0.1] : [1, -0.1], expr: 'smile' });
    // 化成白灰
    if (fade < 1) for (let i = 0; i < 40; i++) { const k = 1 - fade, a = hash(181, i, 1) * TAU; const x = mx + (hash(181, i, 2) - 0.5) * 120 + k * (60 + hash(181, i, 3) * 200), y = my - hash(181, i, 4) * 420 - k * 120 * hash(181, i, 5); E.glow(g, x + cos(a) * 10, y, 6, '255,255,255', (1 - k) * 0.9 * (0.5 + hash(181, i, 6))); }
    adele(g, { x: ax, y: ay + 3, h: 420, pose: 'walk', t: s.beat * BEAT, speed: STEP_SPD * 0.8, expr: t > bar(53) ? 'tearful' : 'neutral', look: t > bar(53) ? [1, 0] : [1, -0.1], wind: 0.45, windDir: -1, prop: ['staff', 'backpack'], rim: '255,252,242', rimDir: -0.9, rimGlow: 0.05 });
    g.restore();
    g.restore();
    fgRocks(g, d * 1.35, { seed: 182, y: 1020, n: 4 });
    ashfall(g, t, { n: 50, seed: 181, vy: 40, vx: -30, s0: 2, s1: 7, a: 0.85 });
    vigS(g, s, 0.3);
  });

  // 24 · 远景 —— 整座火山：云海在山腰，灰色的坡上一条之字形的小路，一个小小的人影往上走
  skyDef('sky-wide', [[0, '#3f7fd0'], [0.5, '#9ccaf2'], [1, '#e8f1f8']]);
  def('una-wide', 2400, 1300, (q, w, h) => {
    paintVolcano(q, { cx: 1200, baseY: 1300, peakY: 230, halfW: 1400, craterW: 220, top: '#b8bfcf', base: '#8d96ad', shade: 'rgba(70,80,116,.42)', gully: 'rgba(92,102,136,.45)', snow: 'rgba(250,251,253,.92)', haze: 'rgba(226,234,246,.7)', shoulder: [-1, 0.45, 70], gullies: 18, seed: 9, x0: -100, x1: 2500, bottom: 1300 });
    // 之字形的小路
    q.strokeStyle = 'rgba(245,240,230,.85)'; q.lineWidth = 3; q.setLineDash([10, 7]);
    q.beginPath(); let x = 900, y = 1100; q.moveTo(x, y);
    for (let i = 0; i < 9; i++) { const nx = i % 2 ? 1300 - i * 22 : 980 + i * 20, ny = y - 90; q.lineTo(nx, ny); x = nx; y = ny; }
    q.lineTo(1190, 245); q.stroke(); q.setLineDash([]);
    paintCloudSea(q, -80, 1000, w + 160, 300, 41, { r: 50, rows: 4, lit: ['#ffffff'], shade: ['#dce6f3', '#d4e0ef', '#cbd8ea', '#c3d1e5'], lx: -0.3 });
  });
  /**
   * 红色的等高线（纯烬 PV 里那种考察图的线）：父母当年的考察图叠在这座山上 ——
   * 每条线是山体被一个水平面切开的前半圈（从左坡到右坡、向下微微鼓起），外加一张很淡的测量网格，都只画在山体上
   */
  const UNA_WIDE = { cx: 1200, baseY: 1300, peakY: 230, halfW: 1400, craterW: 220, shoulder: [-1, 0.45, 70], seed: 9 };
  def('topo-una', 2400, 1300, (q, w, h) => {
    const prof = volcanoProfile(UNA_WIDE), pts = sample(-100, 2500, 6, prof);
    q.save(); poly(q, [...pts, [2500, 1300], [-100, 1300]]); q.clip();
    q.strokeStyle = 'rgba(210,51,79,.13)'; q.lineWidth = 1.5;
    for (let x = 0; x <= w; x += 150) { q.beginPath(); q.moveTo(x, 0); q.lineTo(x, h); q.stroke(); }
    for (let y = 100; y <= h; y += 150) { q.beginPath(); q.moveTo(0, y); q.lineTo(w, y); q.stroke(); }
    const R = rng(97);
    for (let i = 1; i <= 16; i++) {
      const ye = UNA_WIDE.peakY + 30 + (i / 17) * (1060 - UNA_WIDE.peakY - 30);
      let xl = UNA_WIDE.cx, xr = UNA_WIDE.cx;
      while (xl > -100 && prof(xl) < ye) xl -= 4;
      while (xr < 2500 && prof(xr) < ye) xr += 4;
      const cx = (xl + xr) / 2, rx = (xr - xl) / 2, b = rx * 0.07, ph = R() * TAU;
      q.strokeStyle = `rgba(210,51,79,${i % 4 === 0 ? 0.62 : 0.42})`; q.lineWidth = i % 4 === 0 ? 3.2 : 2;
      q.beginPath();
      for (let k = 0; k <= 60; k++) { const th = (k / 60) * PI, x = cx - rx * cos(th), y = ye + b * sin(th) + sin(th * 6 + ph) * 3 + sin(th * 13 + ph * 2) * 1.5; k ? q.lineTo(x, y) : q.moveTo(x, y); }
      q.stroke();
    }
    q.restore();
    // 山顶的三角标记 + 一圈虚线（考察点）
    q.strokeStyle = 'rgba(210,51,79,.75)'; q.lineWidth = 3; q.setLineDash([8, 7]);
    q.beginPath(); q.ellipse(UNA_WIDE.cx, UNA_WIDE.peakY + 8, 150, 38, 0, 0, TAU); q.stroke(); q.setLineDash([]);
    q.fillStyle = 'rgba(210,51,79,.85)'; poly(q, [[UNA_WIDE.cx, UNA_WIDE.peakY - 58], [UNA_WIDE.cx - 14, UNA_WIDE.peakY - 34], [UNA_WIDE.cx + 14, UNA_WIDE.peakY - 34]]); q.fill();
  });
  shot('un-wide', bar(54), { pre: ['sky-wide', 'una-wide', 'topo-una', 'plume', 'cl-a', 'cl-b'] }, (g, s) => {
    const t = s.t, p = s.p;
    const cam = { x: 960 + 40 * p, y: 600 - 120 * ease.inOut(p), z: 1.0 + 0.22 * ease.inOut(p), ...s.handheld(191, t, 2) };
    sky(g, s, 'sky-wide');
    s.layer(g, cam, 0.2, (q) => { q.drawImage(C(s, 'cl-a'), 1200 - s.lt * 5, 40, 800, 378); q.drawImage(C(s, 'cl-b'), -100 - s.lt * 6, 120, 600, 300); });
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'una-wide', -240, -100);
      // 考察图的红色等高线慢慢浮现在山体上（和山在同一层：镜头推的时候贴在山上）
      q.globalAlpha = 0.85 * sstep(0.4, 2.4, s.lt); put(q, s, 'topo-una', -240, -100); q.globalAlpha = 1;
      q.globalAlpha = 0.85; q.drawImage(C(s, 'plume'), 960 - 480, 130 - 566, 600, 600); q.globalAlpha = 1;
      // 小小的人影和羊，沿着之字形小路往上
      const k = clamp((t - bar(54)) / (bar(57) - bar(54)));
      const pts = []; let x = 900, y = 1100; pts.push([x, y]); for (let i = 0; i < 9; i++) { x = i % 2 ? 1300 - i * 22 : 980 + i * 20; y -= 90; pts.push([x, y]); }
      // 远景里的小人影：每秒大约走一个半身长（原来一秒走三个多身长，在陡坡上像是在飘）
      const seg = 3 + k * 0.55, i0 = floor(seg), f = seg - i0;
      const px = lerp(pts[i0][0], pts[i0 + 1][0], f) - 240, py = lerp(pts[i0][1], pts[i0 + 1][1], f) - 100;
      q.fillStyle = '#efe7da'; q.fillRect(px - 3, py - 16, 6, 12); q.fillStyle = '#7a4e40'; q.beginPath(); q.arc(px, py - 19, 3.5, 0, TAU); q.fill(); q.fillStyle = '#d2334f'; q.fillRect(px - 3, py - 10, 6, 2);
      q.fillStyle = '#2c2430'; q.beginPath(); q.arc(px - 12, py - 3, 3, 0, TAU); q.fill();
      E.glow(q, px, py - 12, 30, '255,255,255', 0.25);
    });
    ashfall(g, t, { n: 50, seed: 191, vy: 30, vx: -20, s0: 1, s1: 3.5, a: 0.7 });
    vigS(g, s, 0.25);
  });

  /* =========================================================
   * 五 · 半山腰（102.99 – 128.05）：坐在石头上重读母亲的信 → 头晕、听不见助手的劝 → 拄着法杖继续
   * ========================================================= */
  /** 花环（两种）：叶子 + 小花 */
  const wreathDef = (key, seed, cols) => def(key, 280, 280, (q) => {
    const R = rng(seed);
    q.translate(140, 140);
    q.strokeStyle = 'rgba(30,40,34,.35)'; q.lineWidth = 46; q.beginPath(); q.arc(0, 0, 92, 0, TAU); q.stroke();
    q.strokeStyle = '#5f7248'; q.lineWidth = 10; q.beginPath(); q.arc(0, 0, 92, 0, TAU); q.stroke();
    for (let i = 0; i < 38; i++) { const a = (i / 38) * TAU + R() * 0.1, r = 92 + (R() - 0.5) * 14; q.save(); q.translate(cos(a) * r, sin(a) * r); q.rotate(a + PI / 2 + (R() - 0.5) * 0.8); q.fillStyle = ['#56784a', '#476a40', '#6f9460', '#80a472'][i % 4]; q.beginPath(); q.ellipse(0, 0, 9, 22, 0, 0, TAU); q.fill(); q.strokeStyle = 'rgba(30,50,30,.4)'; q.lineWidth = 1.5; q.stroke(); q.restore(); }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + R() * 0.2, r = 92 + (R() - 0.5) * 16; const c = cols[i % cols.length]; q.save(); q.translate(cos(a) * r, sin(a) * r); for (let k = 0; k < 5; k++) { q.rotate(TAU / 5); q.fillStyle = c; q.beginPath(); q.ellipse(0, -8, 6, 9, 0, 0, TAU); q.fill(); } q.fillStyle = '#f2c14e'; q.beginPath(); q.arc(0, 0, 4, 0, TAU); q.fill(); q.restore(); }
    q.strokeStyle = 'rgba(210,51,79,.9)'; q.lineWidth = 5; q.beginPath(); q.moveTo(-10, 96); q.quadraticCurveTo(-20, 130, -34, 136); q.moveTo(10, 96); q.quadraticCurveTo(22, 128, 30, 138); q.stroke();
  });
  wreathDef('wreath-a', 3, ['#ffffff', '#f4f1ff', '#fde8ee']);
  wreathDef('wreath-b', 5, ['#f49ab0', '#ffffff', '#b9a2ec', '#f6c98a']);
  /** 花环：x,y 中心，r 半径；spin 绕自身的轴转；tilt 0..1 平躺的程度（压扁）；axis 椭圆本身的倾斜 */
  function wreath(g, s, key, x, y, r, spin = 0, tilt = 0.4, a = 1, axis = 0) {
    g.save(); g.translate(x, y); if (axis) g.rotate(axis); g.scale(1, max(0.15, 1 - tilt)); g.rotate(spin); g.globalAlpha *= a;
    g.drawImage(C(s, key), -r, -r, r * 2, r * 2);
    g.restore();
  }
  def('stone', 200, 160, (q) => {
    const R = rng(21);
    q.fillStyle = lin(q, 0, 20, 0, 150, [[0, '#d6d0c6'], [1, '#9c958c']]);
    q.beginPath(); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r = 60 + R() * 12; q.lineTo(100 + cos(a) * r * 1.25, 84 + sin(a) * r * 0.9); } q.closePath(); q.fill();
    q.strokeStyle = 'rgba(90,84,80,.6)'; q.lineWidth = 3; q.stroke();
    q.fillStyle = 'rgba(90,82,76,.55)'; for (let i = 0; i < 30; i++) { q.beginPath(); q.arc(40 + R() * 120, 40 + R() * 80, 1.5 + R() * 4, 0, TAU); q.fill(); }
    q.fillStyle = 'rgba(255,255,255,.4)'; q.beginPath(); q.ellipse(80, 50, 30, 10, -0.3, 0, TAU); q.fill();
  });
  def('pack', 260, 300, (q) => {
    q.fillStyle = '#6a6a58'; rrect(q, 30, 40, 200, 250, 40); q.fill(); q.strokeStyle = 'rgba(40,40,30,.5)'; q.lineWidth = 4; q.stroke();
    q.fillStyle = '#7d7d68'; rrect(q, 50, 150, 160, 110, 24); q.fill(); q.stroke();
    q.fillStyle = '#d2334f'; q.fillRect(30, 110, 200, 14);
    q.strokeStyle = '#4a4a3a'; q.lineWidth = 10; q.beginPath(); q.arc(130, 44, 40, PI, TAU); q.stroke();
  });
  // 半山腰的大石头 + 远处的云海
  skyDef('sky-half', [[0, '#4f8fdc'], [0.5, '#a3cbef'], [0.8, '#e2edf6'], [1, '#f3efe8']]);
  def('half-bg', 2112, 1188, (q) => {
    q.translate(96, 54);
    q.fillStyle = '#9fb0cf'; poly(q, [[-96, 560], [200, 480], [420, 530], [700, 430], [960, 520], [1300, 470], [1640, 540], [2016, 470], [2016, 700], [-96, 700]]); q.fill();
    q.fillStyle = 'rgba(255,255,255,.6)'; poly(q, [[660, 450], [700, 430], [740, 452], [712, 462]]); q.fill();
    paintCloudSea(q, -140, 560, 2300, 420, 51, { r: 46, rows: 5, lit: ['#ffffff'], shade: ['#dbe5f2', '#d3dfee', '#ccd9ea', '#c6d4e8', '#c0cfe4'], lx: -0.3 });
    // 坡
    q.fillStyle = lin(q, 0, 700, 0, 1134, [[0, '#b9bfcc'], [1, '#8b93a7']]); poly(q, [[-96, 1134], [-96, 860], [400, 820], [900, 800], [1400, 770], [2016, 730], [2016, 1134]]); q.fill();
    const R = rng(52); for (let i = 0; i < 120; i++) { const x = R() * 2100 - 96, y = 820 + R() * 320, r = 3 + R() * 14; q.fillStyle = ['#8a90a2', '#767d92', '#9aa0b0'][i % 3]; q.beginPath(); q.ellipse(x, y, r * 1.3, r * 0.8, 0, 0, TAU); q.fill(); }
    // 大石头
    q.fillStyle = lin(q, 0, 640, 0, 960, [[0, '#9aa0b2'], [1, '#6e7489']]);
    poly(q, [[620, 950], [640, 760], [700, 690], [820, 660], [980, 670], [1080, 720], [1120, 820], [1110, 950]]); q.fill();
    q.strokeStyle = 'rgba(50,56,80,.55)'; q.lineWidth = 4; q.stroke();
    q.fillStyle = 'rgba(255,255,255,.35)'; poly(q, [[650, 760], [705, 695], [820, 666], [980, 676], [920, 700], [800, 700], [700, 740]]); q.fill();
    q.strokeStyle = 'rgba(60,64,90,.35)'; q.lineWidth = 3; q.beginPath(); q.moveTo(760, 720); q.lineTo(800, 820); q.lineTo(780, 900); q.moveTo(980, 700); q.lineTo(1000, 800); q.stroke();
  });

  // 25 · 半山腰 —— 她坐在大石头上歇脚，背包上系着两个花环；她从怀里拿出那封旧信
  shot('hw-rest', bar(57), { title: '半山腰', in: { type: 'fade', dur: 1.2 }, pre: ['sky-half', 'half-bg', 'pack', 'wreath-a', 'wreath-b', 'fg-rock', 'cl-b', 'cl-c'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    // 镜头放低一点：石头的底、睡在石头边上的小黑羊都在 2.35:1 黑边以内
    const cam = { x: 920 - 30 * s.p, y: 605, z: 1.02 + 0.08 * ease.inOut(s.p), ...s.handheld(201, t, 2.5) };
    sky(g, s, 'sky-half');
    s.layer(g, cam, 0.15, (q) => { q.drawImage(C(s, 'cl-b'), 1100 - s.lt * 4, 80, 700, 350); q.drawImage(C(s, 'cl-c'), 200 - s.lt * 5, 160, 460, 214); });
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'half-bg'), -96, -54, 2112, 1188);
      q.drawImage(C(s, 'pack'), 1060, 700, 200, 230);
      wreath(q, s, 'wreath-a', 1120, 770, 62, 0.3, 0.1);
      wreath(q, s, 'wreath-b', 1200, 800, 58, -0.2, 0.1);
      const reading = t > bar(58) + BEAT * 2;
      // 坐在大石头的边上（小腿垂下来晃着），从怀里拿出那封信
      adele(q, { x: 860, y: 830, h: 440, pose: reading ? 'read' : 'sit', legs: 'sit', seat: 150, prop: reading ? 'letter' : 'staff', t, expr: reading ? 'content' : 'neutral', look: reading ? [1, 0.4] : [1, -0.1], wind: 0.35 + 0.15 * sin(t * 0.7), windDir: -1 });
      cast(q, 'sheep-black', { shadow: 0.2, x: 568, y: 948, h: 82, pose: 'sleep', t });
    });
    // 焦外的前景：左下角一块灰色的火山岩（视差 1.4）
    s.layer(g, cam, 1.4, (q) => q.drawImage(C(s, 'fg-rock'), -420, 880, 900, 360));
    ashfall(g, t, { n: 50, seed: 201, vy: 30, vx: -24, s0: 1.4, s1: 5, a: 0.8 });
    vigS(g, s, 0.3);
  });

  /** 信纸（旧）：抬头「给阿黛尔」、看不清的字迹、角落里一只小羊和火山的涂鸦、落款「妈妈」 */
  def('old-letter', 1200, 820, (q, w, h) => {
    q.fillStyle = '#f4ead4'; q.fillRect(0, 0, w, h);
    q.fillStyle = lin(q, 0, 0, w, h, [[0, 'rgba(200,170,120,.15)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(180,150,110,.25)']]); q.fillRect(0, 0, w, h);
    q.strokeStyle = 'rgba(160,130,90,.35)'; q.lineWidth = 3; q.beginPath(); q.moveTo(0, h / 3); q.lineTo(w, h / 3); q.moveTo(0, (h * 2) / 3); q.lineTo(w, (h * 2) / 3); q.stroke();
    E.text(q, '给阿黛尔：', 80, 130, { size: 58, weight: 700, color: '#4a3a50', align: 'left' });
    q.strokeStyle = 'rgba(74,58,80,.55)'; q.lineWidth = 4; q.lineCap = 'round';
    const R = rng(33);
    for (let r = 0; r < 7; r++) { q.beginPath(); const len = r === 6 ? 500 : 900 + R() * 120; for (let x = 90; x < 90 + len; x += 7) { const y = 220 + r * 72 + sin(x * 0.11 + r) * 8 + sin(x * 0.27 + r * 3) * 4; x === 90 ? q.moveTo(x, y) : q.lineTo(x, y); } q.stroke(); }
    E.text(q, '—— 妈妈', w - 110, h - 60, { size: 48, weight: 700, color: '#4a3a50', align: 'right' });
    // 涂鸦：小羊与火山
    q.strokeStyle = '#6a5a70'; q.lineWidth = 3;
    q.beginPath(); q.moveTo(120, h - 60); q.lineTo(200, h - 150); q.lineTo(230, h - 150); q.lineTo(310, h - 60); q.stroke();
    q.beginPath(); q.arc(215, h - 180, 12, 0, TAU); q.stroke();
    q.fillStyle = '#6a5a70'; for (const [x, y] of [[360, h - 80], [378, h - 88], [396, h - 80], [386, h - 70], [366, h - 70]]) { q.beginPath(); q.arc(x, y, 12, 0, TAU); q.fill(); }
    q.fillStyle = '#f4ead4'; q.beginPath(); q.arc(412, h - 86, 8, 0, TAU); q.fill();
  });
  // 26 · 信 —— 信纸的特写 → 多年前的夜里，妈妈在灯下写这封信 → 她把信贴在胸口
  def('magna-room', 1920, 1080, (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 1080, [[0, '#3a2e3e'], [1, '#221a26']]); q.fillRect(0, 0, 1920, 1080);
    q.fillStyle = '#4a3a44'; q.fillRect(0, 700, 1920, 380); q.fillStyle = '#5a4650'; q.fillRect(0, 690, 1920, 20);
    q.fillStyle = '#2a2436'; rrect(q, 1250, 140, 420, 360, 20); q.fill(); q.fillStyle = '#1a1d38'; rrect(q, 1270, 160, 380, 320, 14); q.fill();
    const R = rng(4); q.fillStyle = '#fff'; for (let i = 0; i < 40; i++) { q.globalAlpha = 0.3 + R() * 0.7; q.fillRect(1280 + R() * 360, 170 + R() * 300, 2, 2); } q.globalAlpha = 1;
    // 墙上钉着一张孩子的画
    q.fillStyle = '#f4ead4'; q.save(); q.translate(420, 300); q.rotate(-0.06); q.fillRect(-110, -80, 220, 160); q.strokeStyle = '#d2334f'; q.lineWidth = 4; q.beginPath(); q.moveTo(-80, 50); q.lineTo(-20, -30); q.lineTo(40, 50); q.stroke(); q.fillStyle = '#e9b949'; q.beginPath(); q.arc(60, -40, 18, 0, TAU); q.fill(); q.fillStyle = '#6a5a70'; q.beginPath(); q.arc(-40, 60, 10, 0, TAU); q.arc(-26, 58, 10, 0, TAU); q.fill(); q.restore();
  });
  shot('hw-letter', bar(60), { pre: ['old-letter', 'magna-room', 'sky-half', 'half-bg'] }, (g, s) => {
    const t = s.t;
    const past0 = bar(62), past1 = bar(63);
    if (t < past0 + 0.6) {
      // 信纸特写（两只手的拇指压着纸边）
      const cam = { x: 960, y: 540, z: 1.0 + 0.05 * s.at(0, 3), ...s.handheld(211, t, 3) };
      g.fillStyle = '#8b93a7'; g.fillRect(0, 0, VW, VH);
      s.layer(g, cam, 1, (q) => {
        q.save(); q.translate(960, 560); q.rotate(-0.04 + sin(t * 0.8) * 0.01);
        const lift = 0.5 + 0.5 * sin(t * 1.7);
        q.drawImage(C(s, 'old-letter'), -600, -410, 1200, 820);
        q.fillStyle = 'rgba(200,180,140,.5)'; poly(q, [[600, -410], [600 - 60 * lift, -410], [600, -410 + 60 * lift]]); q.fill();
        for (const sd of [-1, 1]) { q.fillStyle = '#ffe3d3'; q.strokeStyle = 'rgba(170,110,95,.7)'; q.lineWidth = 3; q.beginPath(); q.ellipse(sd * 560, 120, 46, 70, sd * 0.4, 0, TAU); q.fill(); q.stroke(); q.fillStyle = '#efe7da'; rrect(q, sd * 560 - 110 + sd * 80, 150, 220, 300, 40); q.fill(); q.fillStyle = '#d2334f'; q.fillRect(sd * 560 - 110 + sd * 80, 170, 220, 16); }
        q.restore();
      });
      ashfall(g, t, { n: 24, seed: 211, vy: 30, vx: -30, s0: 3, s1: 12, a: 0.7 });
      if (t > past0 - 0.2) s.post.fill(g, '#1a1420', sstep(past0 - 0.2, past0 + 0.6, t));
    } else if (t < past1) {
      // 多年前：母亲在灯下写信（镜像的构图）
      const cam = { x: 960, y: 540, z: 1.08, ...s.handheld(212, t, 2) };
      s.layer(g, cam, 1, (q) => {
        q.drawImage(C(s, 'magna-room'), 0, 0, 1920, 1080);
        // 母亲坐在书桌后面写信（和她在罗德岛写信的构图是镜像的）
        const DT = 752;
        chair(q, 800, 953, 120, { style: 'wood', back: -1 });
        cast(q, 'magna', { x: 820, y: 953, h: 600, pose: 'write', legs: 'sit', seat: 120, desk: 953 - DT - 16, t, outfit: 'home', expr: 'content', look: [1, 0.55] });
        desk(q, 560, 1700, DT, 330, { c: '#5a3e36', c2: '#7a5646', edge: '#94705a' });
        q.strokeStyle = '#1b1620'; q.lineWidth = 12; q.lineCap = 'round'; q.beginPath(); q.moveTo(1300, DT + 4); q.lineTo(1250, 540); q.lineTo(1140, 490); q.stroke();
        q.fillStyle = '#e0b060'; poly(q, [[1090, 460], [1190, 490], [1160, 550], [1060, 520]]); q.fill();
        lampLight(q, 1110, 530, 1);
        q.fillStyle = '#f4ead4'; q.save(); q.translate(1030, DT + 8); q.rotate(0.03); q.fillRect(-110, -10, 220, 22); q.restore();
      });
      // 旧照片的颗粒与暖色
      s.post.grade(g, '#ffb070', 0.25, 'soft-light');
      s.post.fill(g, '#1a1420', 1 - sstep(past0 + 0.2, past0 + 0.9, t));
      s.post.fill(g, '#fff4e0', sstep(past1 - 0.5, past1, t) * 0.7);
    } else {
      // 回到现在：胸像特写 —— 信贴在胸口，闭上眼睛（镜头慢慢推近）
      const pk = ease.out(clamp((t - past1) / (s.shot.t1 - past1)));
      const cam = { x: 900, y: 420, z: 1.3 + 0.05 * pk, ...s.handheld(213, t, 2) };
      sky(g, s, 'sky-half');
      s.layer(g, cam, 0.6, (q) => q.drawImage(C(s, 'half-bg'), -96, -54, 2112, 1188));
      const hh = s.handheld(214, t, 3);
      // 胸像往上提一点：贴在胸口的信和两只手在 2.35:1 黑边以内（原来全被下面的黑边挡住，只露出信封的一条边）
      adele(g, { crop: 'bust', x: 960 + hh.sx, y: 960 + hh.sy, h: 740 * (1 + 0.035 * pk), pose: 'hug', prop: 'letter', t, expr: 'content', look: [0.2, 0.2], wind: 0.45, windDir: -1, rim: '255,250,240', rimDir: -0.8, rimGlow: 0.06 });
      s.post.fill(g, '#fff4e0', 0.7 * (1 - sstep(past1, past1 + 0.6, t)));
      ashfall(g, t, { n: 30, seed: 213, vy: 30, vx: -30, s0: 2, s1: 8, a: 0.7 });
    }
    vigS(g, s, 0.4);
  });

  // 27 · 陡坡 —— 风变大了，灰横着吹；她走得很慢，身后远处跟着两个助手
  skyDef('sky-ridge', [[0, '#7f9fc8'], [0.5, '#c3d3e6'], [1, '#e9edf2']]);
  shot('dz-climb', bar(64), { pre: ['sky-ridge', 'slope-bg', 'slope-strip'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const sp = gaitSpeed('adele-alter', { h: 420, pose: 'walk', speed: STEP_SPD * 0.7 }, 70), d = (lt * sp) / cos(0.3);
    sky(g, s, 'sky-ridge');
    g.globalAlpha = 0.7; g.drawImage(C(s, 'slope-bg~'), -300 - d * 0.08, 240, 2600, 1080); g.globalAlpha = 1;
    const hh = s.handheld(221, t, 5);
    g.save(); g.translate(hh.sx, hh.sy);
    g.save(); g.translate(960, 540); g.scale(0.9, 0.9); g.translate(-960, -540);
    const at = slopeFrame(g, s, d, 900, 820, { th: 0.3 });
    const [ax, ay] = at(d);
    // 身后的两个助手（橙色的野外外套）：离她近一点，脚在 2.35:1 黑边以内；步频按路人的步幅配（和坡一起走，不打滑）
    const cspd = (0.8 * sp) / gaitSpeed('crowd', { h: 330, pose: 'walk', speed: 0.8 }, sp);
    for (const [dd, col, sd] of [[-400, '#e0873a', 7], [-520, '#d9763a', 11]]) { const [px, py] = at(d + dd); cast(g, 'crowd', { shadow: 0.16, x: px, y: py + 3, h: 330, pose: 'walk', t: t + dd * 0.01, speed: cspd, color: col, seed: sd }); }
    adele(g, { x: ax, y: ay + 3, h: 420, pose: 'walk', t: s.beat * BEAT, speed: STEP_SPD * 0.7, expr: 'determined', wind: 1, windDir: -1, look: [1, -0.3], prop: ['staff', 'backpack'] });
    const [bx2, by2] = at(d + 130);
    cast(g, 'sheep-black', { shadow: 0.2, x: bx2, y: by2 + 3, h: 76, pose: 'walk', t, speed: sheepSpeed(76, sp) });
    g.restore(); g.restore();
    ashfall(g, t, { n: 140, seed: 221, vy: 60, vx: -420, sway: 10, s0: 1.4, s1: 6, a: 0.85 });
    ashfall(g, t, { n: 12, seed: 222, vy: 90, vx: -600, sway: 10, s0: 10, s1: 18, a: 0.45, chips: 0 });
    vigS(g, s, 0.4);
  });

  // 28 · 头晕 —— 世界歪了、重影；助手们在喊她，声波还没到就散了；心跳一样的暗角
  shot('dz-tilt', bar(66), { pre: ['sky-ridge', 'slope-bg', 'slope-strip'] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    const dizzy = sstep(0, 0.4, p) * (1 - 0.6 * sstep(0.85, 1, p)) * (s.reduced ? 0.25 : 1);
    const rot = sin(lt * 1.3) * 0.07 * dizzy + 0.03 * dizzy;
    const scene = (ox, a) => {
      g.save(); g.globalAlpha = a;
      g.translate(960 + ox, 540); g.rotate(rot); g.scale(1.1, 1.1); g.translate(-960, -540);
      sky(g, s, 'sky-ridge', -200, 1480);
      g.drawImage(C(s, 'slope-bg~'), -400, 200, 2600, 1080);
      // 坡往上挪一点、助手们追近了一些：她和离得近的那个助手连脚都在 2.35:1 黑边以内
      const at = slopeFrame(g, s, 0, 980, 800, { th: 0.3 });
      for (const [dd, fl, col, sd] of [[-330, 0, '#e0873a', 7], [-470, 1, '#d9763a', 11]]) { const [px, py] = at(dd); cast(g, 'crowd', { shadow: 0.16, x: px, y: py + 3, h: 360, pose: fl ? 'point' : 'wave', t, color: col, seed: sd, talk: 1 }); if (a > 0.6) soundRings(g, px + 30, py - 300, t + fl * 0.3, { n: 4, per: BEAT * 2, r: 420, dir: -0.25, spread: 0.45, a: 0.55, muffle: 1 }); }
      const [ax, ay] = at(0);
      // 她在原地摇晃（整个人绕脚底轻轻转），闭着眼，扶着法杖
      adele(g, { x: ax, y: ay + 3, h: 440, pose: 'stand', rot: (sin(lt * 1.9) * 0.07 + 0.02) * dizzy, t, expr: 'closed', wind: 0.8, windDir: -1, prop: ['staff', 'backpack'] });
      g.restore();
    };
    scene(0, 1);
    const dbl = 26 * dizzy * (0.6 + 0.4 * sin(lt * 3.1));
    if (dbl > 1) scene(dbl, 0.35);
    // 去色 + 心跳暗角
    s.post.fill(g, '#808080', 0.55 * dizzy, 'saturation');
    const hb = s.pulse(5);
    s.post.vignette(g, 0.45 + 0.4 * dizzy * (0.6 + 0.4 * hb));
    ashfall(g, t, { n: 60, seed: 231, vy: 30, vx: -120, sway: 20, s0: 2, s1: 7, a: 0.6 * (1 - dizzy * 0.4) });
  });

  // 29 · 拄杖 —— 特写：手握住法杖，往灰里一插；叶子亮了，小黑羊顶住她的腿；她睁开眼
  def('ash-close', 1920, 1080, (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 1080, [[0, '#c9d3e2'], [0.45, '#dfe4ec'], [0.5, '#b7bdcb'], [1, '#8d95a8']]); q.fillRect(0, 0, 1920, 1080);
    const R = rng(61); for (let i = 0; i < 200; i++) { const y = 560 + pow(R(), 0.7) * 520, r = 2 + (y - 540) * 0.04 * R(); q.fillStyle = ['#8a90a2', '#767d92', '#a6acbc'][i % 3]; q.beginPath(); q.ellipse(R() * 1920, y, r * 1.4, r * 0.7, 0, 0, TAU); q.fill(); }
    q.fillStyle = 'rgba(255,255,255,.35)'; q.fillRect(0, 530, 1920, 20);
  });
  shot('dz-staff', bar(68), { pre: ['ash-close'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const plant = bar(68) + BEAT * 0.02, open = bar(69);
    const cam = { x: 960, y: 540, z: 1.05 + 0.04 * ease.out(clamp((t - plant) / (open - plant))), ...s.handheld(241, t, 3) };
    const hit = t > plant ? Math.exp(-(t - plant) * 6) : 0;
    cam.sy += hit * 20 * RM(s);
    if (t < open) {
      s.layer(g, cam, 1, (q) => {
        q.drawImage(C(s, 'ash-close'), 0, 0, 1920, 1080);
        // 杖尖插进灰里的地方（在 2.35:1 黑边以内看得见）：一圈压下去的灰，砸起来的灰也从这里飞出去
        const tipY = 880, age = t - plant;
        q.fillStyle = 'rgba(92,98,120,.42)'; q.beginPath(); q.ellipse(1000, tipY + 3, 30, 7, 0, 0, TAU); q.fill();
        for (let i = 0; i < 30; i++) { const a = -PI * (0.1 + 0.8 * hash(241, i, 1)), v = 150 + hash(241, i, 2) * 300; const x = 1000 + cos(a) * v * age, y = tipY - 4 + sin(a) * v * age + 400 * age * age; if (age > 0 && age < 1.2) { q.globalAlpha = (1 - age / 1.2) * 0.8; q.drawImage(flakeSpr(), x - 6, y - 6, 12, 12); } }
        q.globalAlpha = 1;
        // 杖头的彩色叶子慢慢亮起来（杖尖插在灰里，杖身从画面上方下来）
        staffHead(q, 1000, tipY - 480, 0.8, t, 0.4 + 0.6 * sstep(plant, plant + 1, t));
        // 握住杖身的手（拳头）
        q.save(); q.translate(1000, 572);
        q.fillStyle = '#efe7da'; rrect(q, 40, -60, 300, 130, 40); q.fill(); q.fillStyle = '#d2334f'; q.fillRect(80, -60, 18, 130);
        q.fillStyle = '#ffe3d3'; q.strokeStyle = 'rgba(170,110,95,.7)'; q.lineWidth = 3;
        for (let k = 0; k < 4; k++) { rrect(q, -40, -52 + k * 28, 90, 30, 14); q.fill(); q.stroke(); }
        q.beginPath(); q.ellipse(30, -58, 34, 18, -0.3, 0, TAU); q.fill(); q.stroke();
        q.restore();
        cast(q, 'sheep-black', { shadow: 0.2, x: 760, y: 902, h: 150, pose: 'stand', t, flip: false });
      });
    } else {
      // 她睁开眼（脸部特写）
      const zk = 1 + 0.06 * s.at(bar(69) - bar(68), s.dur), hh2 = s.handheld(242, t, 3);
      sky(g, s, 'sky-ridge');
      E.glow(g, 1500, 200, 700, '255,244,220', 0.4, 'screen', false);
      adele(g, { crop: 'face', x: 900 + hh2.sx, y: 560 + hh2.sy, h: 620 * zk, t, prop: null, expr: t > open + BEAT * 2 ? 'determined' : 'closed', wind: 0.9, windDir: -1, look: [1, -0.3] });
      ashfall(g, t, { n: 50, seed: 242, vy: 40, vx: -300, sway: 10, s0: 3, s1: 12, a: 0.7 });
    }
    vigS(g, s, 0.35);
  });

  // 30 · 山脊 —— 仰视：山脊的线就在头顶，太阳从后面探出来；她迈上去 → 白光
  shot('dz-look', bar(70), { pre: ['sky-ridge'] }, (g, s) => {
    const t = s.t, p = s.p;
    sky(g, s, 'sky-ridge');
    const cam = { x: 960, y: 540, z: 1.0 + 0.1 * p, ...s.handheld(251, t, 3) };
    s.layer(g, cam, 1, (q) => {
      E.glow(q, 1100, 470, 300 + 500 * p, '255,245,220', 0.7 + 0.3 * p, 'lighter', false);
      E.glow(q, 1100, 470, 120, '255,255,255', 1);
      q.fillStyle = '#5a627a'; poly(q, [[-100, 1100], [-100, 600], [300, 560], [700, 520], [1000, 500], [1300, 520], [1700, 480], [2100, 520], [2100, 1100]]); q.fill();
      q.strokeStyle = 'rgba(255,240,210,.9)'; q.lineWidth = 5; line(q, [[-100, 600], [300, 560], [700, 520], [1000, 500], [1300, 520], [1700, 480], [2100, 520]]); q.stroke();
      const step = ease.inOut(p);
      adele(q, { x: 820 + 120 * step, y: 1300 - 280 * step, h: 700, pose: 'walk-away', t: s.beat * BEAT, speed: STEP_SPD * 0.8, sil: '#262b40', rim: '255,230,190', wind: 0.8, prop: ['staff', 'backpack'] });
    });
    // 光芒和镜头光晕都从太阳在屏幕上的真实位置发出（太阳在推近的那一层里，会跟着镜头放大、移动）
    const [sunX, sunY] = scr(cam, 1, 1100, 470);
    s.kit.rays(g, t, { x: sunX, y: sunY, n: 9, len: 1400, spread: PI * 2, angle: 0, rgb: '255,244,220', alpha: 0.12 + 0.1 * p });
    sunFlare(g, s, sunX, sunY, 0.6 + 0.4 * p);
    s.post.fill(g, '#ffffff', sstep(0.7, 1, p) * 0.9);
  });

  /* =========================================================
   * 六 · 山顶（128.05 – 158.51）：云海之上的日出。埋下小石头；两个花环在无风的山顶自己飞走
   * ========================================================= */
  skyDef('sky-dawn', [[0, '#26397e'], [0.28, '#4d62ad'], [0.5, '#a58ecb'], [0.64, '#f2b0a4'], [0.72, '#ffd2a0'], [0.78, '#fff0cc'], [1, '#fff6e0']]);
  def('summit-far', 2400, 760, (q, w, h) => {
    // 远峰
    q.fillStyle = '#8d7fb8'; poly(q, [[0, 180], [160, 90], [260, 120], [420, 40], [560, 150], [700, 190], [w, 190], [w, 400], [0, 400]]); q.fill();
    q.fillStyle = '#9d8cc0'; poly(q, [[1600, 190], [1780, 70], [1900, 110], [2060, 30], [2200, 120], [w, 170], [w, 400], [1600, 400]]); q.fill();
    q.fillStyle = 'rgba(255,220,190,.7)'; poly(q, [[420, 40], [470, 80], [440, 100], [400, 70]]); q.fill(); poly(q, [[2060, 30], [2110, 70], [2080, 90], [2040, 60]]); q.fill();
    paintCloudSea(q, -60, 190, w + 120, 560, 61, { r: 42, rows: 6, lit: ['#ffe9d0', '#ffe4c4', '#ffdcb8', '#fbd4b4', '#f6ccb4', '#efc4b6'], shade: ['#c9b2d6', '#c4acd2', '#bea6cf', '#b8a0cb', '#b29ac6', '#ab94c2'], glint: 'rgba(255,246,226,.9)', lx: 0.5 });
  });
  soften('summit-far', 5); // 山顶背后的远峰和云海：焦外
  def('summit-rim', 2400, 520, (q, w, h) => {
    const top = (x) => 120 + sin(x * 0.004 + 1) * 30 + sin(x * 0.011) * 14 + sin(x * 0.041) * 5;
    poly(q, [...sample(0, w, 10, top), [w, h], [0, h]]);
    q.fillStyle = lin(q, 0, 80, 0, h, [[0, '#6e6a86'], [0.3, '#4e4a66'], [1, '#2c2a40']]); q.fill();
    // 顶上薄薄一层白灰（被晨光照成淡粉）
    q.fillStyle = lin(q, 0, 80, 0, 200, [[0, '#f6e6e0'], [1, '#c8b8c8']]); poly(q, [...sample(0, w, 10, top), ...sample(0, w, 10, (x) => top(x) + 26 + sin(x * 0.02) * 10).reverse()]); q.fill();
    q.strokeStyle = 'rgba(255,214,170,.95)'; q.lineWidth = 5; line(q, sample(0, w, 10, top)); q.stroke();
    const R = rng(71);
    for (let i = 0; i < 90; i++) { const x = R() * w, y = top(x) + 40 + pow(R(), 1.2) * 380, r = 6 + R() * 30; q.fillStyle = ['#3a3852', '#46445e', '#56546e'][i % 3]; q.beginPath(); q.ellipse(x, y, r * 1.4, r * 0.7, 0, 0, TAU); q.fill(); q.strokeStyle = 'rgba(255,200,170,.35)'; q.lineWidth = 2; q.beginPath(); q.ellipse(x, y, r * 1.4, r * 0.7, 0, PI * 1.05, PI * 1.6); q.stroke(); }
  });
  const rimTop = (x) => 120 + sin(x * 0.004 + 1) * 30 + sin(x * 0.011) * 14 + sin(x * 0.041) * 5;
  /** 火山口边沿（'summit-rim' 贴在 (-240, base)）在设计坐标 x 处的地表 y —— 每个角色、每样东西都按自己脚下的 x 取，不能借别人的 */
  const rimAt = (base, x) => base + rimTop(x + 240);
  /** 日出的天空 + 太阳 + 远峰云海（带视差） */
  function dawnSky(g, s, cam, t, o = {}) {
    sky(g, s, o.sky || 'sky-dawn');
    s.layer(g, cam, 0.05, (q) => {
      const sx = o.sunX ?? 1240, sy = o.sunY ?? 600;
      E.glow(q, sx, sy, 900, '255,200,150', 0.45, 'screen', false);
      E.glow(q, sx, sy, 300, '255,230,190', 0.8);
      q.fillStyle = '#fff8e8'; q.beginPath(); q.arc(sx, sy, 58, 0, TAU); q.fill();
    });
    s.layer(g, cam, 0.25, (q) => put(q, s, 'summit-far~', -240 - s.lt * 3, 540));
  }

  /* ---------- 官方立绘的关键画面（MVE.keyart，js/mv/keyart.js；和官方「Miss You」MV 同一张纯烬立绘） ----------
   * 只在情绪最高的三处用：花环飞走（正面仰望）、山顶的笑、迸发的极光。立绘没加载好 / 设备不支持时返回 false，
   * 镜头照原样画 Q 版的版本（故事、时间都不变）。 */
  const KA_KEY = 'alter-e0';
  function keyart(g, s, o) {
    const K = window.MVE && window.MVE.keyart;
    if (!K || !K.ready || !K.ready(KA_KEY)) return false;
    // 颗粒、黑边由本片的 overlay 统一加（不叠两遍）
    return K.shot(g, s, Object.assign({ key: KA_KEY, grain: 0, letterbox: 0, handheld: 2.5 }, o));
  }
  /** 立绘镜头里的两个花环：小小的、发着光，往左上方升，最后化成两点并排的星光（k 0..1） */
  function wreathsAbove(g, s, t, k) {
    for (let i = 0; i < 2; i++) {
      // 在她左边的天上（离头发远一点），往左上方升
      const ang = t * 0.9 + i * PI, rr = 60 * (1 - k * 0.7);
      const x = 330 - 150 * k + cos(ang) * rr + (i ? 30 : -30) * k, y = 600 - 400 * k + sin(ang) * rr * 0.35;
      const sc = 58 * (1 - k * 0.8);
      E.glow(g, x, y, sc * 2.6, '255,236,210', 0.55);
      wreath(g, s, i ? 'wreath-b' : 'wreath-a', x, y, sc, ang * 0.3, 0.45 + 0.25 * sin(ang), 1 - sstep(0.8, 1, k), sin(ang) * 0.3);
      const st = sstep(0.62, 0.92, k);
      if (st > 0) {
        const sz = 24 * st * (0.8 + 0.2 * sin(t * 5 + i * 2));
        E.glow(g, x, y, sz * 3.2, '255,244,220', 0.75 * st);
        g.save(); g.translate(x, y); g.rotate(t * 0.4 + i); g.globalAlpha = st; g.fillStyle = '#fffaf0'; g.beginPath();
        for (let j = 0; j < 4; j++) { const a2 = (j * TAU) / 4; g.lineTo(cos(a2) * sz, sin(a2) * sz); g.lineTo(cos(a2 + PI / 4) * sz * 0.16, sin(a2 + PI / 4) * sz * 0.16); }
        g.closePath(); g.fill(); g.restore();
      }
      // 掉下来的花瓣（从花环上）
      for (let j = 0; j < 5; j++) {
        const born = j * 0.55 + i * 0.3, age = (s.lt - (bar(81) - bar(79))) - born; if (age < 0 || age > 3.2) continue;
        const bx = x + (hash(612, j, i) - 0.5) * 60 + age * 24, by = y + age * 95;
        g.globalAlpha = 1 - age / 3.2; g.drawImage(petalSheet(i ? '#f49ab0' : '#fbf4f6', i ? '#ffd0dc' : '#ffffff'), (floor(age * 6 + j) % 12) * 40, (j % 3) * 40, 40, 40, bx - 11, by - 11, 22, 22); g.globalAlpha = 1;
      }
    }
  }

  // 31 · 山顶 —— 白光散开：云海之上的日出，她沿着火山口的边走到中间
  shot('sm-reveal', bar(71), { title: '山顶', in: { type: 'flash', dur: 0.6, color: '#ffffff', a: 1 }, pre: ['sky-dawn', 'summit-far', 'summit-rim'] }, (g, s) => {
    const t = s.t, p = s.p;
    const cam = { x: 960 + 60 * p, y: 540, z: 1.06 - 0.06 * ease.out(p), ...s.handheld(261, t, 2.5) };
    dawnSky(g, s, cam, t);
    const [sunX, sunY] = scr(cam, 0.05, 1240, 600);
    s.kit.rays(g, t, { x: sunX, y: sunY, n: 10, len: 1500, spread: PI * 2, angle: 0, rgb: '255,236,200', alpha: 0.1 });
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'summit-rim', -240, 700);
      // 按角色库的步幅匀速走到中间（原来是减速的缓动：一开始脚底打滑，最后又像在原地踏步），走到了就停下
      const v = gaitSpeed('adele-alter', { h: 360, pose: 'walk', speed: STEP_SPD }, 105), walking = s.lt * v < 340;
      const ax = 560 + min(340, s.lt * v), ay = rimAt(700, ax) + 6;
      adele(q, { x: ax, y: ay, h: 360, pose: walking ? 'walk' : 'stand', t: s.beat * BEAT, speed: STEP_SPD, sil: '#2b2944', rim: '255,214,170', wind: 0.1 });
      cast(q, 'sheep-black', { shadow: 0.2, x: ax - 120, y: rimAt(700, ax - 120) + 6, h: 70, pose: walking ? 'walk' : 'stand', t: s.beat * BEAT, speed: sheepSpeed(70, v), sil: '#2b2944', rim: '255,214,170' });
    });
    ashfall(g, t * 0.6, { n: 60, seed: 261, vy: 20, vx: 8, sway: 14, s0: 1.4, s1: 4.5, a: 0.9, twinkle: 0.5 });
    sunFlare(g, s, sunX, sunY, 0.9);
    bokeh(g, t, { n: 8, seed: 262, rgb: '255,224,190', x0: sunX - 700, x1: sunX + 800, y0: sunY - 360, y1: sunY + 260, r0: 22, r1: 78, a: 0.26 });
    vigS(g, s, 0.3);
  });

  // 32 · 挖 —— 她跪下来，用手在灰里挖一个小坑；背包和两个花环放在身边
  // 贴地的低机位：前景是虚掉的火山灰颗粒，她跪在逆光里挖；每一拍扬起的灰都被太阳照亮
  shot('sm-dig', bar(73), { pre: ['sky-dawn', 'summit-far', 'summit-rim', 'pack', 'wreath-a', 'wreath-b'] }, (g, s) => {
    const t = s.t, p = s.p;
    const cam = { x: 1010 + 40 * p, y: 770, z: 1.62 + 0.06 * p, ...s.handheld(271, t, 1.5) };
    const skyCam = { x: 1000, y: 620, z: 1.2 };
    dawnSky(g, s, skyCam, t, { sunX: 1080, sunY: 610 });
    const [sunX, sunY] = scr(skyCam, 0.05, 1080, 610);
    s.kit.rays(g, t, { x: sunX, y: sunY, n: 10, len: 1400, spread: PI * 2, angle: 0, rgb: '255,230,200', alpha: 0.1 });
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'summit-rim', -240, 760);
      // 每样东西都落在自己脚下的那段边沿上（原来都用 x=1000 处的高度：她跪进了地里 16px、背包浮起来 9px）
      q.drawImage(C(s, 'pack'), 1150, rimAt(760, 1202) - 116, 104, 120);
      wreath(q, s, 'wreath-a', 1250, rimAt(760, 1250) - 4, 40, 0.2, 0.78);
      wreath(q, s, 'wreath-b', 1310, rimAt(760, 1310) - 2, 36, -0.4, 0.78);
      const gy = rimAt(760, 960);
      adele(q, { x: 960, y: gy + 6, h: 300, pose: 'kneel2', arms: 'dig', t: s.beat * BEAT, prop: null, sil: '#2b2944', rim: '255,214,170', wind: 0, ground: true });
      // 每拍扬起一小撮灰（逆光里发亮），从她手边挖的地方
      const age = s.bp * BEAT, dy = rimAt(760, 1030) - 4;
      for (let i = 0; i < 10; i++) { const a = -PI * (0.2 + 0.6 * hash(271, i + floor(s.beat) * 10, 1)), v = 70 + hash(271, i, 2) * 110; const x = 1030 + cos(a) * v * age, y = dy + sin(a) * v * age + 260 * age * age; q.globalAlpha = 0.9 * (1 - s.bp); q.drawImage(flakeSpr(), x - 4, y - 4, 8, 8); q.globalAlpha = 1; E.glow(q, x, y, 8, '255,220,170', 0.6 * (1 - s.bp)); }
    });
    // 前景：虚掉的灰颗粒（大而软）
    for (let i = 0; i < 9; i++) { const x = hash(272, i, 1) * 1920 - p * 40 * (0.5 + hash(272, i, 2)), y = 960 + hash(272, i, 3) * 160, r = 50 + hash(272, i, 4) * 90; E.glow(g, x, y, r, i % 3 ? '70,62,96' : '255,210,180', i % 3 ? 0.55 : 0.18, i % 3 ? 'source-over' : 'lighter', false); }
    ashfall(g, bar(73) + s.lt * 0.6, { n: 40, seed: 271, vy: 20, vx: 8, sway: 14, s0: 1.5, s1: 5, a: 0.9, twinkle: 0.5 });
    vigS(g, s, 0.4);
  });

  // 33 · 石头 —— 特写：掌心里一块小小的浮石。放进坑里，灰慢慢把它盖住；重拍上，地下亮了一下
  def('ash-dawn-close', 1920, 1080, (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 1080, [[0, '#f7d6c0'], [0.4, '#e6c8c6'], [0.45, '#cbb6c4'], [1, '#8f86a4']]); q.fillRect(0, 0, 1920, 1080);
    const R = rng(81); for (let i = 0; i < 260; i++) { const y = 480 + pow(R(), 0.7) * 600, r = 2 + (y - 460) * 0.035 * R(); q.fillStyle = ['#7d7896', '#6a6686', '#a09ab4'][i % 3]; q.beginPath(); q.ellipse(R() * 1920, y, r * 1.4, r * 0.7, 0, 0, TAU); q.fill(); q.fillStyle = 'rgba(255,220,190,.4)'; q.beginPath(); q.ellipse(R() * 1920, y - r * 0.3, r, r * 0.25, 0, 0, TAU); q.fill(); }
    q.fillStyle = 'rgba(255,240,220,.4)'; q.fillRect(0, 470, 1920, 16);
  });
  shot('sm-stone', bar(75), { pre: ['ash-dawn-close', 'stone'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const place = bar(76) - BEAT, pulse = bar(76);
    const cam = { x: 960, y: 560, z: 1.0 + 0.06 * s.p, ...s.handheld(281, t, 2) };
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'ash-dawn-close'), 0, 0, 1920, 1080);
      // 坑
      q.fillStyle = 'rgba(70,60,90,.6)'; q.beginPath(); q.ellipse(1000, 800, 150, 44, 0, 0, TAU); q.fill();
      q.fillStyle = 'rgba(40,34,60,.7)'; q.beginPath(); q.ellipse(1000, 806, 110, 30, 0, 0, TAU); q.fill();
      const down = ease.inOut(clamp((t - bar(75)) / (place - bar(75))));
      const handOut = sstep(place + 0.2, place + 1.0, t);
      const sx = 1000, sy = lerp(500, 790, down);
      // 石头里的一点温度
      E.glow(q, sx, sy - 10, 90, '255,150,90', 0.35 + 0.3 * sin(t * 3) * 0.3);
      if (t < place + 1.2) {
        q.drawImage(C(s, 'stone'), sx - 70, sy - 70, 140, 112);
        palmUp(q, lerp(640, 560, handOut), lerp(sy + 30, sy + 260, handOut), 1.35, -0.12, 0.3);
      }
      // 灰盖上去
      const cover = sstep(place + 0.6, bar(77) - 0.2, t);
      if (t >= place + 1.2) q.drawImage(C(s, 'stone'), sx - 70, 790 - 70, 140, 112);
      q.fillStyle = '#c8b8c8'; q.beginPath(); q.ellipse(1000, 800 - 10 * cover, 160 * cover + 1, 50 * cover + 1, 0, 0, TAU); q.fill();
      q.fillStyle = 'rgba(255,230,220,.6)'; q.beginPath(); q.ellipse(990, 790 - 12 * cover, 120 * cover + 1, 20 * cover + 1, 0, 0, TAU); q.fill();
      // 重拍：地下亮了一下
      if (t > pulse) { const k = t - pulse; E.glow(q, 1000, 790, 200 + 600 * k, '255,170,110', 0.8 * Math.exp(-k * 2)); q.strokeStyle = `rgba(255,220,180,${0.8 * Math.exp(-k * 2.5)})`; q.lineWidth = 4; q.beginPath(); q.ellipse(1000, 800, 100 + 700 * k, 30 + 210 * k, 0, 0, TAU); q.stroke(); }
    });
    ashfall(g, t * 0.5, { n: 40, seed: 281, vy: 18, vx: 6, sway: 12, s0: 2, s1: 8, a: 0.9, twinkle: 0.5 });
    vigS(g, s, 0.4);
  });

  // 34 · 花环 —— 没有风。放在灰上的两个花环，自己慢慢飘了起来；灰停在半空（慢动作）；她抬起头
  shot('sm-lift', bar(77), { pre: ['sky-dawn', 'summit-far', 'summit-rim', 'wreath-a', 'wreath-b'] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    // 低机位、微微仰：花环从她面前的灰上浮起来，挡在太阳前面，被逆光照亮
    const cam = { x: 1000, y: 720 - 90 * ease.inOut(p), z: 1.32, ...s.handheld(291, t, 1.2) };
    const slow = 0.12;
    dawnSky(g, s, cam, t, { sunX: 1170, sunY: 640 });
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'summit-rim', -240, 760);
      // 她跪坐在灰上（按她脚下那段边沿的高度；原来借了 x=1000 处的高度，整个人陷在边沿下面 57px）；
      // 花环浮起来时，她抬头、慢慢伸出手（没有风：头发和衣摆一动不动）；法杖尾和垂下来的系带被地面挡住
      const gA = rimAt(760, 760);
      adele(q, { x: 760, y: gA + 7, h: 380, pose: 'kneel2', arms: t > bar(78) + BEAT * 2 ? 'reach-up' : 'rest', t, expr: t > bar(78) ? (t > bar(78) + BEAT * 3 ? 'content' : 'surprise') : 'neutral', rim: '255,214,170', rimDir: -0.3, wind: 0, look: t > bar(78) - 0.5 ? [1, -0.7] : [1, 0.3], ground: true });
      const up = ease.inOut(clamp((t - bar(77) - 0.4) / 3.2));
      for (let i = 0; i < 2; i++) {
        const k = up, a0 = i ? 0.5 : -0.3, bx = i ? 1190 : 1010, gy = rimAt(760, bx);
        const x = bx + sin(t * 0.8 + i * 2) * 26 * k, y = gy - 6 - k * 380 - sin(t * 1.1 + i) * 14 * k - (i ? 40 : 0) * k;
        const tilt = lerp(0.8, 0.18 + 0.14 * sin(t * 0.9 + i), ease.out(k));
        // 离地时，地上的灰被轻轻带起一圈
        if (k > 0 && k < 0.3) for (let j = 0; j < 14; j++) { const a = (j / 14) * TAU; q.globalAlpha = (0.3 - k) * 2.5; q.drawImage(flakeSpr(), bx + cos(a) * (70 + k * 260) - 6, gy + sin(a) * 14 - k * 80 - 6, 12, 12); q.globalAlpha = 1; }
        if (k < 0.05) { q.fillStyle = 'rgba(60,50,80,.35)'; q.beginPath(); q.ellipse(bx, gy + 4, 92, 18, 0, 0, TAU); q.fill(); }
        E.glow(q, x, y, 200 * k + 20, '255,236,200', 0.5 * k);
        wreath(q, s, i ? 'wreath-b' : 'wreath-a', x, y, 92, a0 + t * 0.12 * (i ? -1 : 1), tilt, 1, sin(t * 0.7 + i * 2) * 0.25 * k);
      }
    });
    ashfall(g, bar(77) + lt * slow, { n: 90, seed: 291, vy: 20, vx: 8, sway: 14, s0: 1.5, s1: 6, a: 0.9, twinkle: 0.5 });
    bokeh(g, bar(77) + lt * 0.3, { n: 8, seed: 292, rgb: '255,226,196', x0: 700, x1: 1920, y0: 180, y1: 760, r0: 24, r1: 84, a: 0.24 });
    vigS(g, s, 0.35);
  });

  // 35 · 飞走 —— 从她身后看：两个花环绕着彼此，慢慢升进朝霞里，越来越小，落下几片花瓣
  shot('sm-rise', bar(79), { pre: ['sky-dawn', 'summit-far', 'summit-rim', 'wreath-a', 'wreath-b'] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    // 后两小节：反打到她正面（官方立绘）。她仰着头看两个花环往左上方升走、化成星光；没有风，头发几乎不动
    const kaT = bar(81), kaSpan = [kaT - bar(79), s.dur];
    if (t >= kaT && keyart(g, s, {
      crop: 'upper', span: kaSpan, ease: 'sine',
      // 构图往下放：头顶（角、发带）一直在 2.35:1 黑边以下，推近的过程中也不被切掉
      from: { crop: 'upper', z: 1.0, x: 0.01, y: -0.11, look: [-0.18, -0.3] }, to: { crop: 'upper', z: 1.06, x: -0.01, y: -0.13, look: [-0.34, -0.5] },
      grade: { base: 'warm', overlay: ['#ffa0a8', 0.08, 'soft-light'], light: { color: '#ffd4b0', dir: [-0.8, -0.6], rim: 0.85, wash: 0.1 }, bloom: 0.4 },
      wind: 0.06, windDir: -1, blink: 'auto', saccade: 0.3, glow: 1.2,
      // 反打：太阳在镜头这一边（她身后是西边的天），只留一点从左边画外照进来的晨光
      // 副歌：背景是洋红单色（官方 MV 的粉色段落），她保持原色
      bg: (q, s2) => gradedBg(q, s2, 'duotone-magenta', (qq) => dawnSky(qq, s2, { x: 960 - 30 * s2.at(kaSpan[0], kaSpan[1]), y: 470, z: 1.1 }, s2.t, { sunX: -520, sunY: 700 }), 0.85),
      particles: [{ type: 'dust', n: 30, rgb: '255,232,206' }], dof: 0.6, leak: { x: 420, y: 520, r: 900, rgb: '255,196,170', a: 0.28 }, vignette: 0.32,
    })) {
      wreathsAbove(g, s, t, ease.inOut(s.at(kaSpan[0], kaSpan[1])));
      ashfall(g, bar(79) + lt * 0.35, { n: 40, seed: 303, vy: 20, vx: 6, sway: 12, s0: 1.4, s1: 5, a: 0.8, twinkle: 0.5 });
      return;
    }
    const cam = { x: 960, y: 560 - 80 * ease.inOut(p), z: 1.0 + 0.05 * p, ...s.handheld(301, t, 2) };
    dawnSky(g, s, cam, t, { sunX: 1180, sunY: 620 });
    const [sunX, sunY] = scr(cam, 0.05, 1180, 620);
    s.kit.rays(g, t, { x: sunX, y: sunY, n: 12, len: 1600, spread: PI * 2, angle: 0, rgb: '255,236,200', alpha: 0.09 });
    const k = ease.inOut(p);
    s.layer(g, cam, 0.6, (q) => {
      for (let i = 0; i < 2; i++) {
        const ang = t * 0.9 + i * PI, rr = 90 * (1 - k * 0.6);
        const x = 1000 + cos(ang) * rr + 160 * k, y = 640 - 470 * k + sin(ang) * rr * 0.35;
        const sc = 70 * (1 - k * 0.85);
        E.glow(q, x, y, sc * 2.5, '255,236,200', 0.5);
        wreath(q, s, i ? 'wreath-b' : 'wreath-a', x, y, sc, ang * 0.3, 0.45 + 0.25 * sin(ang), 1, sin(ang) * 0.3);
        // 升到最高处，化成两点并排的星光
        const st = sstep(0.72, 0.96, k);
        if (st > 0) {
          const sz = 26 * st * (0.8 + 0.2 * sin(t * 5 + i * 2));
          E.glow(q, x, y, sz * 3, '255,244,220', 0.7 * st);
          q.save(); q.translate(x, y); q.rotate(t * 0.4 + i); q.globalAlpha = st; q.fillStyle = '#fffaf0'; q.beginPath();
          for (let j = 0; j < 4; j++) { const a2 = (j * TAU) / 4; q.lineTo(cos(a2) * sz, sin(a2) * sz); q.lineTo(cos(a2 + PI / 4) * sz * 0.16, sin(a2 + PI / 4) * sz * 0.16); }
          q.closePath(); q.fill(); q.restore();
        }
        // 掉落的花瓣
        for (let j = 0; j < 6; j++) { const born = bar(79) + j * 1.1 + i * 0.5, age = t - born; if (age < 0 || age > 4) continue; const bx = 1000 + cos(t * 0.9 - age * 0.9 + i * PI) * rr + 160 * k - age * 30, by = 640 - 470 * ease.inOut(clamp((born - bar(79)) / s.dur)) + age * 90; const sheet = petalSheet(i ? '#f49ab0' : '#fbf4f6', i ? '#ffd0dc' : '#ffffff'); q.globalAlpha = 1 - age / 4; q.drawImage(sheet, (floor(age * 6 + j) % 12) * 40, (j % 3) * 40, 40, 40, bx - 12, by - 12, 24, 24); q.globalAlpha = 1; }
      }
    });
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'summit-rim', -240, 760);
      adele(q, { x: 960, y: rimAt(760, 960) + 6, h: 300, pose: 'look-up', view: 'back', t, sil: '#2b2944', rim: '255,214,170', wind: 0, look: [0.2, -1] });
      cast(q, 'sheep-black', { shadow: 0.2, x: 870, y: rimAt(760, 870) + 5, h: 64, pose: 'sit', t, sil: '#2b2944', rim: '255,214,170' });
    });
    ashfall(g, bar(79) + lt * 0.35, { n: 70, seed: 301, vy: 20, vx: 6, sway: 12, s0: 1.4, s1: 5, a: 0.9, twinkle: 0.5 });
    sunFlare(g, s, sunX, sunY, 0.8);
    bokeh(g, t, { n: 9, seed: 302, rgb: '255,210,220', x0: 500, x1: 1900, y0: 150, y1: 800, r0: 22, r1: 86, a: 0.24 });
    vigS(g, s, 0.3);
  });

  // 36 · 笑 —— 近景：晨光照在她脸上，她闭着眼睛，看起来像是松了一口气
  shot('sm-smile', bar(83), { pre: ['sky-dawn', 'summit-far'] }, (g, s) => {
    const t = s.t, p = s.p;
    // 官方立绘的脸部特写：晨光从右边来；先闭着眼，然后慢慢睁开、笑了（像是松了一口气）；风又回来了一点，吹动发梢
    if (keyart(g, s, {
      crop: 'face', ease: 'sine',
      // 从半身（头顶在黑边以下）慢慢推到脸
      from: { crop: 'bust', z: 1.02, x: 0.012, y: -0.16, look: [0.2, 0.12], tilt: 0.12 }, to: { crop: 'face', z: 1.04, x: 0, y: 0.03, look: [0.05, -0.04], tilt: 0.04, smile: 0.9, blush: 0.4 },
      eyes: 1 - ease.sine(s.at(0.9, 1.9)) * 0.85, blink: s.lt > 2 ? 'auto' : 0,
      grade: { base: 'warm', light: { color: '#ffd2a8', dir: [0.92, -0.38], rim: 0.95, wash: 0.05 }, bloom: 0.3 },
      wind: 0.12 + 0.3 * p, windDir: -1, saccade: 0.2,
      bg: (q, s2) => gradedBg(q, s2, 'duotone-magenta', (qq) => dawnSky(qq, s2, { x: 960 + 40 * p, y: 520, z: 1.04 }, s2.t, { sunX: 1560, sunY: 540 }), 0.6),
      particles: [{ type: 'dust', n: 36, rgb: '255,230,200' }], dof: 0.8, leak: { x: 1760, y: 420, r: 900, rgb: '255,196,150', a: 0.24 }, vignette: 0.3,
    })) {
      sunFlare(g, s, 1560, 540, 0.45);
      return;
    }
    const cam = { x: 960, y: 520, z: 1.0 + 0.04 * p, ...s.handheld(311, t, 1.5) };
    dawnSky(g, s, cam, t, { sunX: 1500, sunY: 560 });
    // 胸像特写：晨光从右边来，逆光的一圈亮边；先闭着眼，然后微微笑（像是松了一口气）
    const hh = s.handheld(312, t, 2.5);
    adele(g, { crop: 'bust', x: 820 + hh.sx, y: 1000 + hh.sy, h: 700 * (1 + 0.03 * p), t, prop: null, expr: p > 0.4 ? 'content' : 'closed', talk: 0, wind: 0.15 + 0.2 * p, windDir: -1, look: [1, -0.25], rim: '255,214,170', rimDir: -0.4 });
    E.glow(g, 1500, 560, 700, '255,210,160', 0.35, 'screen', false);
    sunFlare(g, s, 1500, 560, 0.5);
    motes(g, t, { n: 30, seed: 311, rgb: '255,230,200', a: 0.7, s: 6 });
    bokeh(g, t, { n: 10, seed: 312, rgb: '255,222,196', x0: 1050, x1: 2000, y0: 150, y1: 900, r0: 28, r1: 100, a: 0.26 });
    vigS(g, s, 0.3);
  });

  // 37 · 云海 —— 她坐在小土包旁边，小黑羊和粉色小羊挨着她；镜头往后、往上升
  shot('sm-wide', bar(85), { pre: ['sky-dawn', 'summit-far', 'summit-rim'] }, (g, s) => {
    const t = s.t, p = s.p;
    const k = ease.inOut(p);
    const cam = { x: 980, y: 600 - 160 * k, z: 1.5 - 0.5 * k, ...s.handheld(321, t, 2) };
    dawnSky(g, s, cam, t, { sunX: 1240, sunY: 590 - 20 * p });
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'summit-rim', -240, 700);
      // 每个都坐在自己脚下的那段边沿上（原来借了 x=980 处的高度：小黑羊陷进地里 29px、粉色小羊浮在空中 5px）
      q.fillStyle = '#c8b8c8'; q.beginPath(); q.ellipse(1050, rimAt(700, 1050) + 6, 50, 14, 0, 0, TAU); q.fill();
      adele(q, { x: 960, y: rimAt(700, 960) + 8, h: 300, pose: 'sit-ground', t, expr: 'content', rim: '255,214,170', wind: 0.2, prop: null, look: [1, -0.2], ground: true });
      cast(q, 'sheep-black', { shadow: 0.2, x: 870, y: rimAt(700, 870) + 6, h: 64, pose: 'sleep', t, rim: '255,214,170' });
      cast(q, 'sheep-pink', { shadow: 0.2, x: 1130, y: rimAt(700, 1130) + 6, h: 60, pose: 'sit', t: t + 1, glow: 0.4, flip: true });
    });
    ashfall(g, t * 0.6, { n: 60, seed: 321, vy: 20, vx: 8, sway: 14, s0: 1.4, s1: 4.5, a: 0.9, twinkle: 0.5 });
    bokeh(g, t, { n: 8, seed: 322, rgb: '255,226,196', x0: 700, x1: 1920, y0: 200, y1: 760, r0: 22, r1: 76, a: 0.22 });
    vigS(g, s, 0.3);
  });

  /* =========================================================
   * 七 · 汇流（158.51 – 187.16）：安静下来。回忆像一颗颗发光的石头，从四面八方汇进她胸口 —— 和开头的岩浆呼应
   * ========================================================= */
  vgDef('radio', (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 280, [[0, '#ffe2b0'], [1, '#f2b880']]); q.fillRect(0, 0, 280, 280);
    q.fillStyle = '#fff4dc'; q.fillRect(150, 20, 110, 150); q.strokeStyle = '#c9a070'; q.lineWidth = 6; q.strokeRect(150, 20, 110, 150); q.beginPath(); q.moveTo(205, 20); q.lineTo(205, 170); q.stroke();
    q.fillStyle = '#b07a4a'; q.fillRect(0, 196, 280, 84);
    q.fillStyle = '#8a5a3a'; rrect(q, 40, 110, 170, 100, 16); q.fill(); q.fillStyle = '#e8d2a8'; q.beginPath(); q.arc(90, 160, 30, 0, TAU); q.fill(); q.strokeStyle = '#8a5a3a'; q.lineWidth = 3; for (let i = -2; i <= 2; i++) { q.beginPath(); q.moveTo(66, 160 + i * 9); q.lineTo(114, 160 + i * 9); q.stroke(); }
    q.fillStyle = '#f4e4c0'; rrect(q, 134, 130, 60, 26, 5); q.fill(); q.fillStyle = '#d2334f'; q.fillRect(160, 132, 3, 22);
    q.strokeStyle = '#6a4a3a'; q.lineWidth = 3; q.beginPath(); q.moveTo(180, 110); q.lineTo(230, 50); q.stroke();
    q.fillStyle = '#6a4a3a'; for (const [x, y] of [[60, 70], [110, 52]]) { q.beginPath(); q.arc(x, y, 7, 0, TAU); q.fill(); q.fillRect(x + 5, y - 26, 3, 26); }
  });
  vgDef('rooftop', (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 280, [[0, '#6a5aa8'], [0.5, '#f28a7a'], [1, '#ffd08a']]); q.fillRect(0, 0, 280, 280);
    q.fillStyle = '#fff0c8'; q.beginPath(); q.arc(200, 150, 30, 0, TAU); q.fill();
    q.fillStyle = '#3a2a40'; for (const [x, w, h] of [[0, 60, 90], [60, 40, 130], [100, 70, 70], [170, 50, 110], [220, 60, 80]]) q.fillRect(x, 280 - h - 40, w, h);
    q.fillStyle = '#2a1e30'; q.fillRect(0, 240, 280, 40);
    q.fillStyle = '#f4efe6'; rrect(q, 90, 212, 60, 32, 5); q.fill(); q.fillStyle = '#3a2a40'; q.beginPath(); q.arc(108, 228, 6, 0, TAU); q.arc(132, 228, 6, 0, TAU); q.fill();
    q.fillStyle = '#2a1e30'; q.beginPath(); q.arc(60, 196, 14, 0, TAU); q.fill(); q.fillRect(48, 208, 24, 34);
  });
  vgDef('dream', (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 280, [[0, '#3a2a6a'], [0.6, '#e88ab8'], [1, '#ffc0d8']]); q.fillRect(0, 0, 280, 280);
    q.fillStyle = 'rgba(255,220,235,.5)'; for (let i = 0; i < 8; i++) { q.beginPath(); q.ellipse(i * 40, 230 + sin(i) * 10, 60, 24, 0, 0, TAU); q.fill(); }
    q.fillStyle = '#8a6aa8'; poly(q, [[90, 120], [190, 120], [170, 150], [110, 150]]); q.fill(); q.fillStyle = '#b9e0c0'; q.fillRect(90, 112, 100, 10);
    for (const [x, y] of [[70, 200], [150, 214], [210, 196]]) { q.fillStyle = '#fff0f6'; q.beginPath(); q.arc(x, y, 14, 0, TAU); q.arc(x + 12, y - 4, 12, 0, TAU); q.fill(); q.fillStyle = '#5a3a4a'; q.beginPath(); q.arc(x + 22, y - 6, 5, 0, TAU); q.fill(); }
    for (const [x, y] of [[50, 60], [230, 80]]) { E.glow(q, x, y, 24, '255,200,120', 0.9); }
  });
  vgDef('parents', (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 280, [[0, '#8fb0e0'], [0.6, '#f4c8b0'], [1, '#ffe4c0']]); q.fillRect(0, 0, 280, 280);
    q.fillStyle = '#6a5a70'; q.fillRect(0, 230, 280, 50);
    const fig = (x, h, c) => { q.fillStyle = c; q.beginPath(); q.arc(x, 230 - h + 14, 13, 0, TAU); q.fill(); q.fillRect(x - 13, 230 - h + 26, 26, h - 26); };
    fig(100, 120, '#4a3a50'); fig(150, 128, '#3a3048'); fig(210, 74, '#5a4a60');
    q.strokeStyle = '#4a3a50'; q.lineWidth = 7; q.lineCap = 'round'; q.beginPath(); q.moveTo(110, 136); q.lineTo(126, 100); q.stroke();
    q.strokeStyle = '#d2334f'; q.lineWidth = 4; q.beginPath(); q.moveTo(150, 132); q.lineTo(150, 160); q.stroke();
  });
  vgDef('friends', (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 280, [[0, '#ffd9a0'], [1, '#e89a70']]); q.fillRect(0, 0, 280, 280);
    q.fillStyle = '#8a5a44'; q.fillRect(0, 190, 280, 90);
    for (const [x, h, c] of [[50, 100, '#4a3a50'], [100, 118, '#5a4a60'], [160, 110, '#3a3048'], [220, 96, '#6a5060']]) { q.fillStyle = c; q.beginPath(); q.arc(x, 200 - h + 16, 16, 0, TAU); q.fill(); q.fillRect(x - 18, 200 - h + 30, 36, h - 30); }
    q.fillStyle = '#fff6e6'; for (let i = 0; i < 4; i++) { rrect(q, 36 + i * 60, 176, 26, 20, 4); q.fill(); }
    for (let i = 0; i < 5; i++) E.glow(q, 30 + i * 55, 40 + (i % 2) * 20, 16, '255,240,200', 0.9);
  });
  vgDef('birds', (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 280, [[0, '#0d1433'], [1, '#3a3f72']]); q.fillRect(0, 0, 280, 280);
    q.fillStyle = '#fff'; const R = rng(3); for (let i = 0; i < 40; i++) q.fillRect(R() * 280, R() * 280, 2, 2);
    for (const [x, y, s2] of [[100, 120, 1], [180, 90, 0.8]]) { q.save(); q.translate(x, y); q.scale(s2, s2); q.fillStyle = '#fbf8f1'; poly(q, [[-30, 0], [30, 2], [-4, -30]]); q.fill(); q.fillStyle = '#dfe6f1'; poly(q, [[-26, 2], [26, 2], [6, 18]]); q.fill(); q.restore(); E.glow(q, x - 20, y + 4, 20, '255,230,180', 0.6); }
  });
  vgDef('wflower', (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 280, [[0, '#0b1230'], [1, '#2a2c5a']]); q.fillRect(0, 0, 280, 280);
    q.fillStyle = '#1c2244'; poly(q, [[0, 230], [280, 170], [280, 280], [0, 280]]); q.fill();
    E.glow(q, 140, 150, 70, '255,150,190', 0.8);
    q.strokeStyle = '#5f8a6a'; q.lineWidth = 5; q.beginPath(); q.moveTo(140, 210); q.lineTo(140, 150); q.stroke();
    for (let i = 0; i < 6; i++) { q.save(); q.translate(140, 146); q.rotate((i / 6) * TAU); q.fillStyle = i % 2 ? '#fff4f6' : '#ffe0e8'; q.beginPath(); q.ellipse(0, -16, 9, 17, 0, 0, TAU); q.fill(); q.restore(); }
    q.fillStyle = '#d2334f'; q.beginPath(); q.arc(140, 146, 8, 0, TAU); q.fill();
  });
  const MEMS = ['radio', 'rooftop', 'dream', 'parents', 'friends', 'cafe', 'birds', 'wflower', 'lawn', 'volcano', 'party', 'birthday'];
  /** 回忆的石头：每颗在自己的轨道上绕着 (cx, cy) 转；conv 0..1 往中心收拢 */
  function memoryStones(g, s, t, cx, cy, o = {}) {
    const conv = o.conv ?? 0, appear = o.appear ?? 1, big = o.big ?? 1;
    const items = [];
    for (let i = 0; i < MEMS.length; i++) {
      const born = o.t0 + i * 0.45;
      const a0 = born > t ? 0 : min(1, (t - born) / 1.2) * appear;
      if (a0 <= 0) continue;
      const ang = hash(401, i, 1) * TAU + t * (0.12 + hash(401, i, 2) * 0.1) * (i % 2 ? 1 : -1);
      const R0 = (380 + hash(401, i, 3) * 420) * (1 - conv * conv);
      const z = sin(ang);
      const x = cx + cos(ang) * R0 * 1.3, y = cy + z * R0 * 0.35 - 120 * (1 - conv) + (hash(401, i, 4) - 0.5) * 300 * (1 - conv);
      const r = (46 + 30 * hash(401, i, 5)) * (1 + z * 0.25) * big * (1 - conv * 0.85);
      items.push([z, x, y, r, a0 * (1 - sstep(0.92, 1, conv)), MEMS[i]]);
    }
    items.sort((a, b) => a[0] - b[0]);
    for (const [, x, y, r, a, key] of items) {
      // 拖尾：往中心收拢时留下光的轨迹（和开头的岩浆滴一样）
      if (conv > 0.05) for (let j = 1; j < 5; j++) E.glow(g, lerp(x, cx, -j * 0.05), lerp(y, cy, -j * 0.05), r * 0.5 * (1 - j / 5), '255,170,110', 0.4 * a * conv);
      vignette(g, s, key, x, y, r, a, '255,210,170');
    }
  }
  /** 把当前画面压成“梦里的蓝” */
  function dreamTint(g, k) {
    if (k <= 0.01) return;
    E.post.fill(g, '#1c2560', 0.72 * k, 'multiply');
    E.post.fill(g, '#6a70c8', 0.18 * k, 'screen');
  }

  // 38 · 安静 —— 声音退下去。晨光变成梦一样的蓝，灰停在半空闪着光；她闭上眼睛。远处亮起第一颗“石头”
  shot('br-still', bar(88), { title: '汇流', in: { type: 'fade', dur: 1.4 }, pre: ['sky-dawn', 'summit-far', 'summit-rim', 'vg-radio', 'vg-rooftop', 'vg-dream', 'vg-parents'] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    const cam = { x: 960, y: 560, z: 1.25 + 0.1 * ease.inOut(p), ...s.handheld(411, t, 1.5) };
    dawnSky(g, s, cam, t, { sunX: 1240, sunY: 600 });
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'summit-rim', -240, 700);
      // 各自坐在自己脚下的那段边沿上（原来小黑羊借了 x=960 的高度，陷进地里 46px）
      adele(q, { x: 900, y: rimAt(700, 900) + 8, h: 420, pose: 'sit-ground', t, expr: 'closed', wind: 0, prop: null, look: [1, -0.1], ground: true });
      cast(q, 'sheep-black', { shadow: 0.2, x: 780, y: rimAt(700, 780) + 6, h: 80, pose: 'sleep', t });
    });
    dreamTint(g, sstep(0, 0.45, p));
    s.kit.stars(g, t, { n: 120, seed: 412, h: 560, size: 2.4, tw: 0.8 });
    // 静止的灰，像星星一样闪
    ashfall(g, bar(88) + lt * 0.04, { n: 90, seed: 413, vy: 20, vx: 4, sway: 8, s0: 1.4, s1: 5, a: 0.85, twinkle: 1 });
    memoryStones(g, s, t, 900, 560, { t0: bar(89) + 0.3, appear: sstep(bar(89), bar(90), t), big: 0.8 });
    vigS(g, s, 0.45);
  });

  // 39 · 回忆 —— 一颗颗发光的石头绕着她转：晨间的收音机、屋顶的磁带、梦里的粉色小羊、门口挥手的爸爸妈妈、罗德岛的朋友……
  shot('br-memories', bar(91), { in: { type: 'fade', dur: 0.9 }, pre: ['sky-dawn', 'summit-far', 'summit-rim', ...MEMS.map((k) => 'vg-' + k)] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    const cam = { x: 960 + sin(lt * 0.4) * 60, y: 540, z: 1.1, ...s.handheld(421, t, 2) };
    dawnSky(g, s, cam, t, { sunX: 1240, sunY: 600 });
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'summit-rim', -240, 740);
      adele(q, { x: 960, y: rimAt(740, 960) + 8, h: 360, pose: 'sit-ground', t, expr: 'content', wind: 0, prop: null, look: [0.3, -0.3], ground: true });
    });
    dreamTint(g, 1);
    s.kit.stars(g, t, { n: 140, seed: 412, h: 600, size: 2.4, tw: 0.8 });
    memoryStones(g, s, t, 960, 600, { t0: bar(89) + 0.3, big: 1 });
    // 每个重拍，一颗石头从镜头前擦过，把里面的画面看清楚
    const feat = ['radio', 'dream', 'parents'];
    for (let i = 0; i < 3; i++) {
      const b0 = bar(91 + i) - 0.2, k = (t - b0) / 2.0;
      if (k < 0 || k > 1) continue;
      const x = lerp(i % 2 ? 1500 : 420, i % 2 ? 380 : 1540, ease.inOut(k)), y = 520 + sin(k * PI) * -60;
      const r = 150 + 170 * sin(PI * k);
      vignette(g, s, feat[i], x, y, r, sin(PI * k) * 1.2, '255,210,170');
    }
    ashfall(g, bar(91) + lt * 0.05, { n: 70, seed: 422, vy: 20, vx: 4, sway: 8, s0: 1.4, s1: 5, a: 0.8, twinkle: 1 });
    vigS(g, s, 0.45);
  });

  // 40 · 同一团火 —— 石头们拖着光，从四面八方汇进她胸口，那里亮起一团暖色的火（和开头的岩浆一模一样的汇流）
  shot('br-converge', bar(94), { in: { type: 'fade', dur: 0.9 }, pre: ['sky-dawn', 'summit-far', 'summit-rim', ...MEMS.map((k) => 'vg-' + k)] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    const conv = ease.inOut(sstep(0.05, 0.7, p));
    // 她坐在地上，双手合在胸前；镜头慢慢推向她的胸口
    const gy0 = rimAt(740, 960) + 8;
    const ao = { x: 960, y: gy0, h: 380, pose: 'sit-ground', arms: 'clasp', t, expr: p > 0.55 ? 'content' : 'closed', wind: 0.1 * p, prop: null, look: [0.2, 0.1], ground: true };
    const ch0 = anchor('adele-alter', ao, 'chest');
    const cam = { x: 960, y: lerp(620, ch0[1] - 30, ease.inOut(p)), z: 1.2 + 0.35 * ease.inOut(p), ...s.handheld(431, t, 2) };
    dawnSky(g, s, cam, t, { sunX: 1240, sunY: 600 });
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'summit-rim', -240, 740);
      adele(q, ao);
      // 小黑羊一高兴就发烫（两只小羊各自坐在自己脚下的那段边沿上）
      const yb = rimAt(740, 850) + 5, yp = rimAt(740, 1080) + 5;
      cast(q, 'sheep-black', { shadow: 0.2, x: 850, y: yb, h: 76, pose: 'sit', t, heat: sstep(0.3, 0.9, p) });
      if (p > 0.3) E.glow(q, 850, yb - 42, 90, '255,150,80', 0.5 * sstep(0.3, 0.8, p));
      cast(q, 'sheep-pink', { shadow: 0.2, x: 1080, y: yp, h: 70, pose: 'sit', t: t + 1, glow: 0.6 + 0.4 * p, flip: true });
    });
    dreamTint(g, 1 - 0.35 * sstep(0.6, 1, p));
    s.kit.stars(g, t, { n: 140, seed: 412, h: 600, size: 2.4, tw: 0.8 });
    // 火：在她胸口（角色库给的胸口位置），随拍子呼吸，越来越大
    const [cx, cy] = anchor('adele-alter', ao, 'chest');
    const heat = sstep(0.1, 0.8, p);
    s.layer(g, cam, 1, (q) => {
      const r = 20 + 60 * heat;
      E.glow(q, cx, cy, r * 6, '255,110,50', 0.35 * heat);
      E.glow(q, cx, cy, r * 2.4 * (1 + 0.1 * s.pulse(4) + 0.25 * s.acc(0.3)), '255,150,70', 0.9 * heat);
      E.glow(q, cx, cy, r, '255,236,190', heat);
      const ring = s.barp;
      q.save(); q.globalCompositeOperation = 'lighter'; q.strokeStyle = `rgba(255,170,100,${0.5 * (1 - ring) * heat})`; q.lineWidth = 4; q.beginPath(); q.ellipse(cx, cy, r * (1.5 + ring * 5), r * (1.5 + ring * 5) * 0.8, 0, 0, TAU); q.stroke(); q.restore();
      memoryStones(q, s, t, cx, cy, { t0: bar(89) + 0.3, conv, big: 1 - 0.2 * p });
    });
    ashfall(g, bar(94) + lt * 0.08, { n: 70, seed: 432, vy: 20, vx: 4, sway: 8, s0: 1.4, s1: 5, a: 0.8, twinkle: 1 });
    vigS(g, s, 0.45);
  });

  // 41 · 回应 —— 她睁开眼、站起来。脚下的火山像在回应：火山口里透出橙色的光，云海被从下面照亮，大地轻轻震动
  shot('br-build', bar(100), { pre: ['sky-dawn', 'summit-far', 'summit-rim'] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    const q2 = ease.in(p);
    const shake = (2 + 14 * q2) * (0.5 + 0.5 * s.pulse(5)) * RM(s);
    const cam = { x: 960, y: 560 - 60 * p, z: 1.15 - 0.15 * ease.inOut(p), ...s.handheld(441, t, 2), r: sin(lt * 23) * 0.004 * q2 * RM(s) };
    cam.sx += sin(lt * 61) * shake; cam.sy += cos(lt * 53) * shake;
    dawnSky(g, s, cam, t, { sunX: 1240, sunY: 600 });
    s.layer(g, cam, 1, (q) => {
      // 火山口在身后发光（光从地下来）
      E.glow(q, 1300, 760, 500 + 300 * p, '255,120,60', 0.25 + 0.5 * p);
      put(q, s, 'summit-rim', -240, 740);
      const gy = rimAt(740, 960);
      const up = t > bar(101) ? 1 : 0;
      const ao = { x: 960, y: gy + 8, h: 380, pose: up ? (t > bar(102) ? 'look-up' : 'stand') : 'sit-ground', arms: up ? undefined : 'clasp', t, expr: up ? 'determined' : 'closed', wind: 0.2 + 0.6 * p, look: [0.3, -0.6], prop: up ? 'staff' : null, ground: up ? null : true };
      adele(q, ao);
      const ch = anchor('adele-alter', ao, 'chest');
      E.glow(q, ch[0], ch[1], 80 + 40 * s.pulse(3), '255,170,100', 0.6 + 0.3 * p);
    });
    dreamTint(g, 0.65 * (1 - p));
    // 地底的光照亮云海的下缘
    E.glow(g, 960, 1080, 1200 * (0.5 + p), '255,120,60', 0.3 + 0.4 * q2, 'screen', false);
    s.kit.particles(g, t, 'embers', { n: 40 + floor(40 * p), seed: 442 });
    ashfall(g, t, { n: 80, seed: 443, vy: -40 - 160 * p, vx: 10, sway: 20, s0: 1.4, s1: 5, a: 0.8 });
    vigS(g, s, 0.4);
    s.post.fill(g, '#fff4e0', sstep(0.88, 1, p) * 0.8, 'lighter');
  });

  /* =========================================================
   * 八 · 迸发（187.16 – 215.82）：不是灾难，是光。熔岩色的极光、白灰与花瓣；灰落下的地方开出花；她和小羊们下山
   * ========================================================= */
  skyDef('sky-aurora', [[0, '#0c1238'], [0.35, '#262c6a'], [0.6, '#5a3f86'], [0.8, '#b8607e'], [0.92, '#f09a70'], [1, '#ffd0a0']]);
  skyDef('sky-morning', [[0, '#4a86d8'], [0.45, '#9ccaf2'], [0.75, '#fbe0cc'], [1, '#fff4e4']]);
  const curtain = (rgb) => sprite('aur:' + rgb, 8, 256, (q) => { const gr = q.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.5, `rgba(${rgb},0.3)`); gr.addColorStop(0.86, `rgba(${rgb},0.95)`); gr.addColorStop(1, `rgba(${rgb},0)`); q.fillStyle = gr; q.fillRect(0, 0, 8, 256); });
  /** 熔岩色的极光：几条光帘沿着波动的曲线排开（叠加） */
  function aurora(g, t, k, o = {}) {
    if (k <= 0.01) return;
    const ribbons = o.ribbons || [
      { y: 420, amp: 90, f: 3.2, sp: 0.35, h: 420, rgb: '255,150,80', a: 0.55, ph: 0 },
      { y: 330, amp: 120, f: 2.4, sp: -0.28, h: 360, rgb: '255,110,170', a: 0.45, ph: 2 },
      { y: 250, amp: 70, f: 4.1, sp: 0.22, h: 300, rgb: '170,130,255', a: 0.4, ph: 4 },
    ];
    const pc = g.globalCompositeOperation, pa = g.globalAlpha;
    g.globalCompositeOperation = 'lighter';
    const n = o.n ?? 64, x0 = o.x0 ?? -80, x1 = o.x1 ?? VW + 80, span = x1 - x0, cw = span / n + 2;
    for (const rb of ribbons) {
      const spr = curtain(rb.rgb), reveal = o.reveal ?? 1;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        if (u > reveal) break;
        const x = x0 + u * span;
        const y = rb.y + (o.dy ?? 0) + sin(u * rb.f + t * rb.sp + rb.ph) * rb.amp + sin(u * rb.f * 2.3 - t * rb.sp * 0.7) * rb.amp * 0.3;
        const h = rb.h * (0.65 + 0.35 * sin(u * 9 + t * 0.9 + rb.ph));
        const a = rb.a * k * (0.45 + 0.55 * (0.5 + 0.5 * sin(u * 13 - t * 1.4 + rb.ph))) * (u > reveal - 0.08 ? (reveal - u) / 0.08 : 1);
        if (a <= 0.01) continue;
        g.globalAlpha = pa * a;
        g.drawImage(spr, x, y - h, cw, h * 1.15);
      }
    }
    g.globalCompositeOperation = pc; g.globalAlpha = pa;
  }
  /** 从 (cx, cy) 炸开的花瓣与白灰（t0 时刻开始；带空气阻力） */
  function burst(g, t, t0, cx, cy, o = {}) {
    const age = t - t0;
    if (age < 0 || age > (o.life ?? 5)) return;
    const n = o.n ?? 80, sheet = petalSheet('#d2334f'), fl = flakeSpr();
    const pa = g.globalAlpha;
    for (let i = 0; i < n; i++) {
      const a = -PI / 2 + (hash(o.seed || 7, i, 1) - 0.5) * (o.spread ?? PI * 1.6), v = (o.v ?? 900) * (0.3 + 0.7 * hash(o.seed || 7, i, 2));
      const drag = 1.4, dist = (v * (1 - Math.exp(-drag * age))) / drag;
      const x = cx + cos(a) * dist + sin(age * 2 + i) * 20 * age, y = cy + sin(a) * dist + 60 * age * age;
      const fade = 1 - sstep((o.life ?? 5) * 0.6, o.life ?? 5, age);
      g.globalAlpha = pa * fade;
      if (i % 3 === 0) { const sz = 14 + hash(o.seed || 7, i, 3) * 18; g.drawImage(sheet, ((i + floor(age * 8)) % 12) * 40, (i % 3) * 40, 40, 40, x - sz / 2, y - sz / 2, sz, sz); }
      else { const sz = 2 + hash(o.seed || 7, i, 4) * 5; g.drawImage(fl, x - sz, y - sz, sz * 2, sz * 2); }
    }
    g.globalAlpha = pa;
  }

  // 42 · 迸发 —— 重拍：火山口里冲出一道光柱（不是岩浆，是光），光环荡开；黑边退开，画面一下子打开
  shot('fx-erupt', bar(104), { title: '迸发', in: { type: 'flash', dur: 0.5, color: '#fff6e8', a: 1 }, pre: ['sky-aurora', 'summit-far', 'summit-rim'] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    const kick = Math.exp(-lt * 3);
    const cam = { x: 960, y: 520, z: 1.0 + 0.08 * kick, ...s.handheld(451, t, 3) };
    cam.sx += sin(lt * 70) * 14 * kick * RM(s); cam.sy += cos(lt * 64) * 10 * kick * RM(s);
    sky(g, s, 'sky-aurora');
    s.kit.stars(g, t, { n: 90, seed: 452, h: 500, size: 2, tw: 0.6 });
    aurora(g, t, sstep(0.2, 1.8, lt) * (0.85 + 0.3 * s.pulse(3)), { reveal: sstep(0.1, 2.6, lt) });
    s.layer(g, cam, 0.25, (q) => { put(q, s, 'summit-far~', -240 - s.lt * 3, 540); });
    // 光柱
    const cx = 1260, cy = 780;
    s.layer(g, cam, 0.8, (q) => {
      const grow = ease.out(clamp(lt / 0.6)), wv = 1 + 0.15 * s.pulse(4);
      const spr = E.glowSprite('255,140,80'), spr2 = E.glowSprite('255,120,170'), spr3 = E.glowSprite('255,250,235');
      q.save(); q.globalCompositeOperation = 'lighter';
      q.globalAlpha = 0.7; q.drawImage(spr, cx - 260 * wv, cy - 1900 * grow, 520 * wv, 2200 * grow);
      q.globalAlpha = 0.6; q.drawImage(spr2, cx - 130 * wv, cy - 1700 * grow, 260 * wv, 1900 * grow);
      q.globalAlpha = 0.95; q.drawImage(spr3, cx - 40, cy - 1500 * grow, 80, 1650 * grow);
      q.restore();
      // 光环
      for (let i = 0; i < 3; i++) { const k = lt * 0.8 - i * 0.35; if (k < 0 || k > 1) continue; q.save(); q.globalCompositeOperation = 'lighter'; q.strokeStyle = `rgba(255,220,180,${0.7 * (1 - k)})`; q.lineWidth = 10 * (1 - k) + 2; q.beginPath(); q.ellipse(cx, cy, 80 + k * 1400, 20 + k * 260, 0, 0, TAU); q.stroke(); q.restore(); }
      E.glow(q, cx, cy, 400 + 200 * kick, '255,200,140', 0.9);
    });
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'summit-rim', -240, 760);
      adele(q, { x: 820, y: rimAt(760, 820) + 8, h: 420, pose: 'reach-up', view: 'back3', t, sil: '#2b2140', rim: '255,190,140', rimDir: 0, wind: 0.9, windDir: -1, look: [1, -0.6], prop: 'staff' });
      cast(q, 'sheep-black', { shadow: 0.2, x: 700, y: rimAt(760, 700) + 6, h: 80, pose: 'jump', t, sil: '#2b2140', rim: '255,190,140' });
    });
    burst(g, t, bar(104), 1260, 700, { n: 110, seed: 453, v: 1100, life: 3.6 });
    petals(g, t, { n: 30, seed: 454, vy: 60, vx: 80, s0: 14, s1: 30 });
    bokeh(g, t, { n: 10, seed: 456, rgb: '255,168,130', x0: 700, x1: 1950, y0: 100, y1: 900, r0: 26, r1: 96, a: 0.28 * sstep(0.2, 1.2, lt) });
    ashfall(g, t, { n: 70, seed: 455, vy: 50, vx: 30, s0: 1.4, s1: 5, a: 0.9, twinkle: 0.3 });
    vigS(g, s, 0.3);
  });

  // 43 · 极光 —— 满天熔岩色的光帘在流动；她站在火山口边张开手，花瓣和白灰绕着她打旋
  shot('fx-aurora', bar(106), { pre: ['sky-aurora', 'summit-far', 'summit-rim'] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    // 第二小节：官方立绘，满天熔岩色的光帘下，风从画面右边吹来，头发和外套被吹起；法杖的晶叶亮起来，花瓣和白灰打着旋
    const kaT = bar(107), kaSpan = [kaT - bar(106), s.dur];
    if (t >= kaT && keyart(g, s, {
      crop: 'upper', span: kaSpan, ease: 'out',
      from: { crop: 'upper', z: 0.96, y: -0.09, look: [0.1, -0.25] }, to: { crop: 'upper', z: 1.03, y: -0.1, look: [0.25, -0.4] },
      grade: { base: 'dream', light: { color: '#ffb0c8', dir: [0.3, -0.95], rim: 0.8, wash: 0.06 }, overlay: ['#ff7aa8', 0.06, 'soft-light'], bloom: 0.32 },
      wind: 1.05, windDir: -1, cast: 0.55 + 0.35 * s.pulse(4), glow: 1.3 + 0.6 * s.lo, blink: 'auto',
      bg: (q, s2) => {
        sky(q, s2, 'sky-aurora');
        s2.kit.stars(q, s2.t, { n: 70, seed: 452, h: 500, size: 2, tw: 0.6 });
        aurora(q, s2.t, 0.8 + 0.25 * s2.pulse(3) + 0.35 * s2.acc(0.35), { dy: -80 });
        s2.layer(q, { x: 960, y: 560, z: 1.05 }, 0.25, (qq) => put(qq, s2, 'summit-far~', -240 - s2.lt * 3, 600));
        E.glow(q, 1260, 760, 800, '255,140,90', 0.3, 'screen', false);
      },
      particles: [{ type: 'petals', n: 40, depth: 1.4 }, { type: 'ash', n: 50 }], dof: 0.7, leak: { x: 1700, y: 160, r: 1000, rgb: '255,130,170', a: 0.3 }, vignette: 0.3,
    })) return;
    const cam = { x: 960, y: 560 - 60 * ease.inOut(p), z: 1.12 - 0.1 * ease.inOut(p), ...s.handheld(461, t, 3) };
    sky(g, s, 'sky-aurora');
    s.kit.stars(g, t, { n: 90, seed: 452, h: 500, size: 2, tw: 0.6 });
    s.layer(g, cam, 0.1, (q) => aurora(q, t, 0.72 + 0.25 * s.pulse(3) + 0.2 * s.lo + 0.35 * s.acc(0.35), { dy: -40 }));
    s.layer(g, cam, 0.25, (q) => { put(q, s, 'summit-far~', -240 - s.lt * 3, 540); });
    E.glow(g, 1260, 700, 700, '255,140,80', 0.25, 'screen', false);
    s.layer(g, cam, 1, (q) => {
      put(q, s, 'summit-rim', -240, 760);
      const gy = 760 + rimTop(960 + 240);
      // 先在光里原地转一圈（衣摆飞起来），然后仰起头、伸出手
      const tw = t < bar(107) - BEAT * 0.5;
      adele(q, { x: 960, y: gy + 8, h: 400, pose: tw ? 'twirl' : 'reach-up', t, expr: tw ? 'laugh' : 'content', rim: '255,190,160', wind: 0.9, look: [0, -1], prop: 'staff' });
      // 两只小羊各自在自己脚下的那段边沿上蹦（原来粉色小羊的地面比边沿高出 9px，影子浮在云上）
      cast(q, 'sheep-black', { shadow: 0.2, x: 840, y: rimAt(760, 840) + 6, h: 76, pose: 'jump', t: t * 1.2, glow: 1 });
      cast(q, 'sheep-pink', { shadow: 0.2, x: 1090, y: rimAt(760, 1090) + 6, h: 70, pose: 'jump', t: t * 1.2 + 0.5, glow: 1, flip: true });
      // 打旋的花瓣
      const sheet = petalSheet('#d2334f');
      for (let i = 0; i < 40; i++) {
        const ph = fract(t * 0.18 + i / 40), ang = ph * TAU * 2 + i, rr = 120 + ph * 520;
        const x = 960 + cos(ang) * rr, y = gy - 120 - ph * 700 + sin(ang) * rr * 0.25;
        const sz = 14 + 12 * hash(461, i, 1);
        q.globalAlpha = sin(PI * ph); q.drawImage(sheet, ((i + floor(t * 7)) % 12) * 40, (i % 3) * 40, 40, 40, x - sz / 2, y - sz / 2, sz, sz);
      }
      q.globalAlpha = 1;
    });
    ashfall(g, t, { n: 90, seed: 462, vy: 40, vx: 20, sway: 40, s0: 1.4, s1: 6, a: 0.9, twinkle: 0.4 });
    bokeh(g, t, { n: 12, seed: 463, rgb: '255,150,196', y0: 60, y1: 880, r0: 24, r1: 96, a: 0.26 });
    vigS(g, s, 0.3);
  });

  // 44 · 开花 —— 贴着地面：白灰落在灰色的坡上，落下的地方一朵朵开出花来（踩着拍子）
  def('bloom-grey', 1920, 1080, (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 1080, [[0, '#7a78a0'], [0.3, '#a8a4bc'], [1, '#8a869e']]); q.fillRect(0, 0, 1920, 1080);
    const R = rng(91); for (let i = 0; i < 300; i++) { const y = 260 + pow(R(), 0.8) * 820, r = 2 + (y - 240) * 0.03 * R(); q.fillStyle = ['#6e6a8a', '#5e5a7a', '#9a96b0'][i % 3]; q.beginPath(); q.ellipse(R() * 1920, y, r * 1.4, r * 0.7, 0, 0, TAU); q.fill(); q.fillStyle = 'rgba(255,200,170,.3)'; q.beginPath(); q.ellipse(R() * 1920, y - r * 0.3, r, r * 0.25, 0, 0, TAU); q.fill(); }
    q.fillStyle = lin(q, 0, 0, 0, 300, [[0, 'rgba(250,200,170,.8)'], [1, 'rgba(250,200,170,0)']]); q.fillRect(0, 0, 1920, 300);
  });
  def('bloom-green', 1920, 1080, (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 1080, [[0, '#9fc08a'], [0.3, '#86b070'], [1, '#5f9058']]); q.fillRect(0, 0, 1920, 1080);
    const R = rng(92);
    for (let i = 0; i < 1400; i++) { const y = 200 + pow(R(), 0.8) * 900, x = R() * 1920, l = 6 + (y - 180) * 0.05; q.strokeStyle = ['#6fa060', '#86b870', '#5a8a50', '#a0c88a'][i % 4]; q.lineWidth = 2 + (y - 200) * 0.004; q.beginPath(); q.moveTo(x, y); q.quadraticCurveTo(x + (R() - 0.5) * 10, y - l * 0.6, x + (R() - 0.5) * 14, y - l); q.stroke(); }
    q.fillStyle = lin(q, 0, 0, 0, 300, [[0, 'rgba(255,220,180,.6)'], [1, 'rgba(255,220,180,0)']]); q.fillRect(0, 0, 1920, 300);
  });
  const BLOOM_COLS = [['#ffffff', '#f2c14e'], ['#f49ab0', '#fff0c0'], ['#d2334f', '#ffe9a8'], ['#b9a2ec', '#fff4c0'], ['#f6c98a', '#ffffff'], ['#86d3b8', '#fff']];
  let BLOOMS = null;
  function blooms() {
    if (BLOOMS) return BLOOMS;
    const R = rng(93), out = [];
    for (let i = 0; i < 70; i++) { const y = 300 + pow(R(), 0.7) * 760; out.push({ x: R() * 1920, y, r: 60 + (y - 280) * 0.35 * (0.6 + R() * 0.6), b: floor(R() * 14), c: floor(R() * BLOOM_COLS.length), s: 0.6 + (y - 280) / 900 }); }
    out.sort((a, b) => a.y - b.y);
    return (BLOOMS = out);
  }
  shot('fx-bloom', bar(108), { pre: ['bloom-grey', 'bloom-green', 'fg-flowers'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const cam = { x: 960, y: 540 - 30 * s.p, z: 1.05, ...s.handheld(471, t, 3) };
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'bloom-grey'), -20, -20, 1960, 1120);
      // 落灰的地方一圈圈变绿（剪裁出新长的草地）
      const bl = blooms();
      q.save(); q.beginPath();
      for (const b of bl) {
        const tb = bar(108) + b.b * BEAT * 0.5, k = ease.out(clamp((t - tb) / 1.1)); if (k <= 0) continue;
        const r = b.r * k, ph = b.x * 0.01;
        for (let j = 0; j <= 18; j++) { const a = (j / 18) * TAU, rr = r * (1 + 0.22 * sin(3 * a + ph) + 0.1 * sin(7 * a + ph * 2)); const x = b.x + cos(a) * rr, y = b.y + sin(a) * rr * 0.45; j ? q.lineTo(x, y) : q.moveTo(x, y); }
        q.closePath();
      }
      q.clip(); q.drawImage(C(s, 'bloom-green'), -20, -20, 1960, 1120); q.restore();
      // 花
      for (const b of bl) {
        const tb = bar(108) + b.b * BEAT * 0.5, k = clamp((t - tb - 0.15) / 0.6);
        if (k <= 0) { // 还在落的那一片灰
          const fk = clamp((t - (tb - 1.2)) / 1.2); if (fk <= 0) continue;
          q.drawImage(flakeSpr(), b.x - 8, b.y - 600 * (1 - fk) - 8, 16, 16); continue;
        }
        const [pc, mc] = BLOOM_COLS[b.c], sz = 60 * b.s * ease.back(k);
        for (let j = 0; j < 3; j++) { const ox = (hash(94, b.x | 0, j) - 0.5) * b.r * 0.8, oy = (hash(95, b.x | 0, j) - 0.5) * b.r * 0.3; const ss = sz * (j ? 0.7 : 1); q.drawImage(flowerSpr(pc, mc), b.x + ox - ss / 2, b.y + oy - ss / 2 - ss * 0.2, ss, ss); }
        if (k < 1) E.glow(q, b.x, b.y, b.r * 0.8, '255,230,190', (1 - k) * 0.6);
      }
    });
    // 焦外的前景：两个下角各一丛开好的花（视差 1.35），花开得最早的就是离镜头最近的这些
    s.layer(g, cam, 1.35, (q) => {
      const k = ease.out(clamp((t - bar(108)) / 1.2));
      q.globalAlpha = k; q.drawImage(C(s, 'fg-flowers'), -380, 760 + (1 - k) * 60, 900, 520);
      q.save(); q.translate(2300, 0); q.scale(-1, 1); q.drawImage(C(s, 'fg-flowers'), 0, 800 + (1 - k) * 60, 820, 474); q.restore();
      q.globalAlpha = 1;
    });
    ashfall(g, t, { n: 60, seed: 472, vy: 70, vx: 10, sway: 30, s0: 2, s1: 9, a: 0.9, twinkle: 0.3 });
    petals(g, t, { n: 16, seed: 473, vy: 60, vx: 40, s0: 16, s1: 30 });
    E.glow(g, 1500, 0, 900, '255,180,130', 0.3, 'screen', false);
    bokeh(g, t, { n: 9, seed: 474, rgb: '255,236,200', x0: 900, x1: 1950, y0: 0, y1: 500, r0: 24, r1: 90, a: 0.26 });
    vigS(g, s, 0.3);
  });

  // 45 · 俯瞰 —— 从天上看乌纳：花从山顶往下铺开，一直铺到山脚的村子；极光在天上慢慢淡去
  const aerialPaint = (bloom) => (q, w, h) => {
    q.fillStyle = bloom ? '#86b070' : '#9aa0b4'; q.fillRect(0, 900, w, h - 900);
    paintVolcano(q, { cx: 1200, baseY: 1250, peakY: 260, halfW: 1250, craterW: 240, top: bloom ? '#a4c68e' : '#b5b9c9', base: bloom ? '#6fa060' : '#8d93a8', shade: bloom ? 'rgba(30,70,60,.3)' : 'rgba(70,80,116,.36)', gully: bloom ? 'rgba(50,100,64,.45)' : 'rgba(92,102,136,.45)', snow: bloom ? null : 'rgba(250,251,253,.9)', haze: bloom ? 'rgba(236,240,220,.5)' : 'rgba(226,232,244,.55)', shoulder: [1, 0.5, 60], gullies: 18, seed: 11, x0: -100, x1: w + 100, bottom: h });
    if (bloom) {
      // 花只落在山体上（source-atop）
      q.save(); q.globalCompositeOperation = 'source-atop';
      const R = rng(12);
      for (let i = 0; i < 2200; i++) { const x = R() * w, y = 260 + pow(R(), 0.8) * (h - 260); const [pc] = BLOOM_COLS[i % BLOOM_COLS.length]; q.fillStyle = pc; q.beginPath(); q.arc(x, y, 1.6 + (y / h) * 5, 0, TAU); q.fill(); }
      q.restore();
    }
    // 山脚的村子
    const R2 = rng(13);
    for (let i = 0; i < 30; i++) { const x = 250 + R2() * 700, y = 1150 + R2() * 180, s2 = 0.6 + R2() * 0.5; q.fillStyle = '#f4efe6'; q.fillRect(x - 20 * s2, y - 16 * s2, 40 * s2, 16 * s2); q.fillStyle = '#b5553f'; poly(q, [[x - 24 * s2, y - 16 * s2], [x, y - 32 * s2], [x + 24 * s2, y - 16 * s2]]); q.fill(); }
    paintCloudSea(q, -100, 1180, w + 200, 300, 14, { r: 50, rows: 3, lit: ['#fff4ea'], shade: ['#e6d6e6', '#dccde2', '#d4c6de'], lx: 0.3 });
  };
  const AER_PROF = volcanoProfile({ cx: 1200, baseY: 1250, peakY: 260, halfW: 1250, craterW: 240, shoulder: [1, 0.5, 60], seed: 11 });
  def('aerial-grey', 2400, 1500, aerialPaint(false));
  def('aerial-bloom', 2400, 1500, aerialPaint(true));
  skyDef('sky-dawn2', [[0, '#34488f'], [0.4, '#8a78c0'], [0.7, '#f4b0a0'], [1, '#ffe8c8']]);
  shot('fx-aerial', bar(110), { pre: ['sky-dawn2', 'aerial-grey', 'aerial-bloom'] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    const cam = { x: 960, y: 600 + 60 * p, z: 1.0 + 0.12 * p, ...s.handheld(481, t, 3) };
    sky(g, s, 'sky-dawn2');
    s.layer(g, cam, 0.1, (q) => aurora(q, t, 0.7 * (1 - p * 0.5), { dy: -120 }));
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'aerial-grey'), -240, -200, 2400, 1500);
      // 开花的前沿：一条波动的线从山顶往下
      const fy = lerp(40, 1320, ease.inOut(sstep(0, 0.95, p)));
      q.save(); q.beginPath(); q.moveTo(-300, -300);
      for (let x = -300; x <= 2300; x += 40) q.lineTo(x, fy + sin(x * 0.01 + t * 2) * 30 + sin(x * 0.027) * 18 + abs(x - 960) * 0.18);
      q.lineTo(2300, -300); q.closePath(); q.clip();
      q.drawImage(C(s, 'aerial-bloom'), -240, -200, 2400, 1500);
      q.restore();
      // 前沿：一道柔软的暖光（只画在山体上），花瓣从那里往上飘
      const frontY = (x) => fy + sin(x * 0.01 + t * 2) * 30 + sin(x * 0.027) * 18 + abs(x - 960) * 0.18;
      const onHill = (x) => frontY(x) > AER_PROF(x + 240) - 200 + 6;
      q.save(); q.globalCompositeOperation = 'lighter'; q.lineCap = 'round'; q.lineJoin = 'round';
      for (const [lw, a] of [[70, 0.06], [30, 0.12], [8, 0.3]]) {
        q.strokeStyle = `rgba(255,236,200,${a})`; q.lineWidth = lw; q.beginPath();
        let pen = false;
        for (let x = -300; x <= 2300; x += 30) { if (!onHill(x)) { pen = false; continue; } const y = frontY(x); pen ? q.lineTo(x, y) : q.moveTo(x, y); pen = true; }
        q.stroke();
      }
      q.restore();
      const sheet = petalSheet('#d2334f');
      for (let i = 0; i < 30; i++) { const x = hash(484, i, 1) * 2200 - 100; if (!onHill(x)) continue; const ph = fract(t * 0.7 + hash(484, i, 2)); const y = frontY(x) - ph * 160; q.globalAlpha = sin(PI * ph); q.drawImage(sheet, ((i + floor(t * 6)) % 12) * 40, (i % 3) * 40, 40, 40, x - 10, y - 10, 20, 20); }
      q.globalAlpha = 1;
    });
    petals(g, t, { n: 24, seed: 482, vy: 50, vx: 30, s0: 12, s1: 26 });
    ashfall(g, t, { n: 50, seed: 483, vy: 40, vx: 20, s0: 1.4, s1: 4.5, a: 0.8 });
    vigS(g, s, 0.3);
  });

  // 46 · 小女孩 —— 村子里：孩子站起来，看着天上的光和山坡上开出的花，用力朝山上挥手
  shot('fx-girl', bar(112), { pre: ['una-house'] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    // 近一点：孩子在画面左边，右边是那座开满花的山、山上那一点预警花的光
    const cam = { x: 1040 + 30 * p, y: 760 - 30 * p, z: 1.45 + 0.05 * p, ...s.handheld(491, t, 3) };
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'una-house'), -96, -54, 2112, 1188);
      q.fillStyle = '#98a888'; q.fillRect(-96, 1130, 2112, 160); // 画布下沿再铺一截地面（开场镜头最低时手持漂移也不露底）
      // 天上的极光余韵 + 山坡变绿 + 山上的一点光（预警花）
      q.save(); q.beginPath(); q.rect(1004, -54, 1200, 760); q.clip();
      aurora(q, t, 0.55, { x0: 1000, x1: 2100, n: 30, dy: -140 });
      q.restore();
      // 山坡从上往下变绿（贴着火山的轮廓）
      const gk = ease.out(p), front = 300 + 420 * gk;
      q.save(); q.beginPath(); q.moveTo(1004, 700);
      for (let x = 1004; x <= 2100; x += 20) q.lineTo(x, max(UNA_HOUSE_PROF(x), 0));
      q.lineTo(2100, 700); q.closePath(); q.clip();
      q.fillStyle = 'rgba(130,180,110,.42)'; q.fillRect(1004, 280, 1100, front - 280);
      q.restore();
      E.glow(q, 1480, 520, 30 + 12 * s.pulse(3), '255,150,190', 0.95);
      // 院子里开出的花（踩着拍子一簇簇冒出来）
      for (let i = 0; i < 40; i++) { const tb = bar(112) + floor(hash(492, i, 1) * 8) * BEAT * 0.5, k = ease.back(clamp((t - tb) / 0.5)); if (k <= 0) continue; const x = 560 + hash(492, i, 2) * 1300, y = 1010 + hash(492, i, 3) * 110, sz = 46 * k * (0.7 + (y - 1000) / 300); const [pc, mc] = BLOOM_COLS[i % BLOOM_COLS.length]; q.drawImage(flowerSpr(pc, mc), x - sz / 2, y - sz, sz, sz); }
      const st = t > bar(112) + BEAT * 2;
      girl(q, 800, 1010, 330, st ? 'wave' : 'hug', t, { look: 1, smile: true });
      const hop = abs(sin((s.beat) * PI)) * 36;
      cast(q, 'sheep-black', { shadow: 0.2, shadowY: 1016, x: 1010, y: 1016 - hop, h: 84, pose: 'jump', t: t * 1.2, flip: true });
    });
    petals(g, t, { n: 20, seed: 493, vy: 60, vx: 40, s0: 14, s1: 26 });
    vigS(g, s, 0.3);
  });

  // 47 · 下山 —— 她沿着开满花的坡往下走，粉色和黑色的小羊一路蹦跳着跟在旁边
  // 开满花的坡：和灰坡同一套条带（周期地表、纹理绕回来画、高 1000）
  def('slope-strip-bloom', STRIP_W, STRIP_H, (q, w, h) => paintStrip(q, w, h, 56, true));
  shot('fx-descend', bar(114), { pre: ['sky-morning', 'slope-bg', 'slope-strip-bloom', 'fg-flowers', 'cl-a', 'cl-c'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const sp = gaitSpeed('adele-alter', { h: 400, pose: 'walk', speed: STEP_SPD }, 150), d = 2000 - (lt * sp) / cos(SLOPE);
    sky(g, s, 'sky-morning');
    g.drawImage(C(s, 'cl-a'), 1000 - s.lt * 5, 40, 900, 425); g.drawImage(C(s, 'cl-c'), 100 - s.lt * 6, 160, 460, 214);
    aurora(g, t, 0.25, { dy: -200 });
    g.drawImage(C(s, 'slope-bg~'), -300 + lt * 12, 60, 2600, 1080);
    const hh = s.handheld(501, t, 3);
    g.save(); g.translate(hh.sx, hh.sy);
    // 和登山那几镜同一套坡：脚落在条带真实的地表上，条带首尾相接没有接缝
    const at = slopeFrame(g, s, d, 960, 800, { strip: 'slope-strip-bloom' });
    const [ax, ay] = at(d);
    adele(g, { x: ax, y: ay + 3, h: 400, pose: 'walk', t: s.beat * BEAT, speed: STEP_SPD, flip: true, expr: 'laugh', look: [-1, -0.1], wind: 0.5, windDir: 1 });
    for (let i = 0; i < 4; i++) {
      // 小羊们跟着她一起往下跑（步频按速度配；只留一点点前后的晃动，免得步子和位移对不上）
      const dd = d + [-180, 160, -330, 300][i] + sin(t * 1.5 + i) * 6, [lx, ly] = at(dd), hop = abs(sin((s.beat + i * 0.5) * PI)) * 40;
      cast(g, i % 2 ? 'sheep-pink' : 'sheep-black', { x: lx, y: ly + 3 - hop, shadowY: ly + 3, shadow: 0.22 * (1 - hop / 80), h: i < 2 ? 80 : 66, pose: 'run', t: t + i, speed: sheepSpeed(i < 2 ? 80 : 66, sp, true), flip: true, glow: i % 2 ? 0.3 : 0, heat: i % 2 ? 0 : 0.5 });
    }
    g.restore();
    // 焦外的前景：一丛丛花从镜头前掠过（比坡面滑得快：视差）
    for (let i = 0; i < 2; i++) {
      const span = 2600, x = ((hash(505, i, 1) * span + (2000 - d) * 1.7) % span + span) % span - 700;
      g.drawImage(C(s, 'fg-flowers'), x, 820 + hash(505, i, 2) * 70, 900, 520);
    }
    petals(g, t, { n: 30, seed: 502, vy: 60, vx: -50, s0: 14, s1: 30 });
    ashfall(g, t, { n: 40, seed: 503, vy: 40, vx: -20, s0: 1.4, s1: 4.5, a: 0.8 });
    vigS(g, s, 0.25);
  });

  def('parents-hill', 2112, 1188, (q) => {
    const summit = [[380, 1100], [640, 760], [860, 560], [1010, 452], [1090, 418], [1150, 436], [1210, 430], [1290, 410], [1420, 470], [1640, 640], [1960, 980], [2000, 1188], [380, 1188]];
    q.fillStyle = lin(q, 0, 400, 0, 1100, [[0, '#a8c890'], [1, '#6f9a60']]); poly(q, summit); q.fill();
    q.save(); poly(q, summit); q.clip();
    for (let i = 0; i < 420; i++) { const x = 400 + hash(514, i, 1) * 1560, y = 420 + pow(hash(514, i, 2), 0.7) * 700; const [pc, mc] = BLOOM_COLS[i % BLOOM_COLS.length]; const r = 2 + (y - 400) * 0.009; q.fillStyle = pc; q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); if (r > 5) { q.fillStyle = mc; q.beginPath(); q.arc(x, y, r * 0.4, 0, TAU); q.fill(); } }
    q.restore();
    q.strokeStyle = 'rgba(255,250,230,.95)'; q.lineWidth = 5; line(q, summit.slice(2, 10)); q.stroke();
  });
  // 48 · 回头 —— 她回头望向山顶：光里站着两个人影，朝她挥手；她也挥手。人影化成花瓣，升进天里
  shot('fx-parents', bar(116), { pre: ['sky-morning', 'slope-strip-bloom', 'parents-hill', 'fg-flowers'] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    const cam = { x: 960, y: 540, z: 1.0 + 0.05 * p, ...s.handheld(511, t, 2.5) };
    sky(g, s, 'sky-morning');
    aurora(g, t, 0.3 * (1 - p), { dy: -160 });
    s.layer(g, cam, 0.6, (q) => {
      // 山顶（仰视）+ 光
      E.glow(q, 1180, 330, 600, '255,240,210', 0.6, 'screen', false);
      // 山顶（火山口的两道唇边），坡上开满了花（静态，缓存）
      q.drawImage(C(s, 'parents-hill'), 0, 0, 2112, 1188);
      const fade = 1 - sstep(bar(117) + BEAT * 2, bar(118) - 0.1, t);
      for (const [who, x, y, hh2] of [['magna', 1110, 428, 160 * 0.94], ['katia', 1236, 424, 160]]) {
        E.glow(q, x, y - 80, 140, '255,250,235', 0.3 * fade);
        // 爸爸妈妈在光里朝她挥手（半透明、带一圈白光的轮廓）
        cast(q, who, { x, y, h: hh2, pose: 'wave2', view: 'front', t: t + (who === 'katia' ? 0.3 : 0), outfit: 'field', expr: 'smile', alpha: 0.85 * fade, rim: '255,255,255' });
        if (fade < 1) for (let i = 0; i < 20; i++) { const k = 1 - fade; const px = x + (hash(512, i, 1) - 0.5) * 60 + k * 100 * hash(512, i, 2), py = 400 - hash(512, i, 3) * 150 - k * 400 * (0.5 + hash(512, i, 4)); const sheet = petalSheet(i % 2 ? '#d2334f' : '#fbf4f6', i % 2 ? '#ff9aa8' : '#ffffff'); q.globalAlpha = 1 - k * 0.8; q.drawImage(sheet, ((i + floor(t * 6)) % 12) * 40, (i % 3) * 40, 40, 40, px - 10, py - 10, 20, 20); q.globalAlpha = 1; }
      }
    });
    s.layer(g, cam, 1, (q) => {
      q.save(); q.translate(0, 1000); q.rotate(-0.12);
      q.drawImage(C(s, 'slope-strip-bloom'), -300, -40, STRIP_W, STRIP_H);
      q.restore();
      // 她回过身（背影），望着山顶；然后举起双手用力挥
      // 山顶的光从右上方来：背影的一圈暖白的轮廓光
      adele(q, { x: 600, y: 1040, h: 560, pose: t > bar(116) + BEAT * 3 ? 'wave2' : 'look-up', view: 'back3', t, expr: 'smile', look: [1, -0.6], wind: 0.5, windDir: 1, rim: '255,244,220', rimDir: -0.9, rimGlow: 0.08 });
    });
    // 焦外的前景：右下角一丛花（视差 1.4）
    s.layer(g, cam, 1.4, (q) => q.drawImage(C(s, 'fg-flowers'), 1380, 800, 900, 520));
    petals(g, t, { n: 24, seed: 513, vy: -50, vx: 30, s0: 14, s1: 28 });
    bokeh(g, t, { n: 8, seed: 514, rgb: '255,244,220', x0: 900, x1: 1700, y0: 120, y1: 600, r0: 22, r1: 80, a: 0.24 });
    vigS(g, s, 0.25);
  });

  // 49 · 远方 —— 整座开满花的火山，极光淡成晨光；镜头升进天里，越来越亮
  shot('fx-far', bar(118), { pre: ['sky-morning', 'aerial-bloom', 'cl-a', 'cl-b', 'cl-c'] }, (g, s) => {
    const t = s.t, lt = s.lt, p = s.p;
    const up = ease.in(p);
    const cam = { x: 960, y: 600 - 560 * up, z: 0.94 + 0.08 * p, ...s.handheld(521, t, 2) };
    sky(g, s, 'sky-morning', -700, 1800);
    s.layer(g, cam, 0.12, (q) => {
      aurora(q, t, 0.35 * (1 - p), { dy: -330 });
      q.drawImage(C(s, 'cl-a'), 1150 - s.lt * 5, -420, 900, 425); q.drawImage(C(s, 'cl-b'), 60 - s.lt * 6, -300, 700, 350); q.drawImage(C(s, 'cl-c'), 700 - s.lt * 4, -620, 560, 260);
    });
    s.layer(g, cam, 0.5, (q) => {
      // 太阳从山后面升起来：一圈光冠
      E.glow(q, 1010, 250, 900, '255,236,200', 0.55, 'screen', false);
      E.glow(q, 1010, 250, 260, '255,250,235', 0.9);
    });
    s.layer(g, cam, 1, (q) => {
      q.drawImage(C(s, 'aerial-bloom'), -240, -290, 2400, 1500);
      // 山腰往下走的小小人影与小羊们
      const [ax, ay] = [760 + lt * 6, 870 + lt * 4];
      q.fillStyle = '#efe7da'; q.fillRect(ax - 3, ay - 16, 6, 12); q.fillStyle = '#7a4e40'; q.beginPath(); q.arc(ax, ay - 19, 3.5, 0, TAU); q.fill(); q.fillStyle = '#d2334f'; q.fillRect(ax - 3, ay - 10, 6, 2);
      for (let i = 0; i < 3; i++) { q.fillStyle = i % 2 ? '#ffd6e6' : '#2c2430'; q.beginPath(); q.arc(ax + 14 + i * 9, ay - 3 - abs(sin(t * 8 + i)) * 4, 3, 0, TAU); q.fill(); }
      // 山脚的村子里，预警花那一点光
      E.glow(q, 420, 905, 26 + 8 * s.pulse(3), '255,150,190', 0.9);
      s.kit.rays(q, t, { x: 1010, y: 250, n: 12, len: 1500, spread: PI * 2, angle: 0, rgb: '255,244,220', alpha: 0.08 });
    });
    petals(g, t, { n: 34, seed: 522, vy: -80 - 220 * up, vx: 30, sway: 70, s0: 14, s1: 28 });
    petals(g, t, { n: 12, seed: 524, vy: -60 - 160 * up, vx: -20, sway: 50, s0: 10, s1: 20, col: '#fbf4f6', tip: '#ffffff' });
    ashfall(g, t, { n: 50, seed: 523, vy: 40, vx: 10, s0: 1.4, s1: 4.5, a: 0.8 });
    s.post.fill(g, '#ffffff', sstep(0.72, 1, p) * 0.88);
    vigS(g, s, 0.2);
  });

  /* =========================================================
   * 尾声 · 最后一轨（215.82 – 233.73）：录音机放在山顶的石头上录风；磁带标签的最后一行写上「Miss You」；撕纸的片尾
   * ========================================================= */
  def('jcard', 900, 560, (q, w, h) => {
    q.fillStyle = '#fbf6ea'; q.fillRect(0, 0, w, h);
    q.fillStyle = '#d2334f'; q.fillRect(0, 0, w, 16);
    q.strokeStyle = 'rgba(120,150,190,.4)'; q.lineWidth = 2; for (let y = 120; y < h; y += 70) { q.beginPath(); q.moveTo(40, y); q.lineTo(w - 40, y); q.stroke(); }
    E.text(q, '想要留住的声音', 50, 86, { size: 44, weight: 700, color: '#3b3550', align: 'left' });
    const rows = ['A1  火山喷发后的呼吸', 'A2  咖啡馆里的合唱', 'A3  草坪上的研讨会', 'A4  生日歌（旧录像）', 'A5  欢迎会'];
    rows.forEach((r, i) => E.text(q, r, 60, 160 + i * 70, { size: 34, weight: 600, color: '#4a4460', align: 'left' }));
    E.text(q, 'B1', 60, 160 + 5 * 70 + 10, { size: 34, weight: 700, color: '#d2334f', align: 'left' });
  });
  def('rock-summit', 1920, 1080, (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 1080, [[0, '#5a8ee0'], [0.55, '#bcd8f2'], [0.7, '#fbe6d4'], [1, '#fff4e6']]); q.fillRect(0, 0, 1920, 1080);
    paintCloudSea(q, -60, 640, 2040, 300, 71, { r: 40, rows: 4, lit: ['#ffffff'], shade: ['#e2e6f2', '#dadff0', '#d2d9ec', '#cad2e8'], lx: 0.4 });
    // 远处的一段火山口边沿（她坐在那里）
    q.fillStyle = '#a7a3bd'; poly(q, [[1280, 740], [1420, 700], [1560, 688], [1700, 684], [1860, 694], [1980, 720], [1980, 780], [1280, 780]]); q.fill();
    q.strokeStyle = 'rgba(255,255,255,.7)'; q.lineWidth = 3; line(q, [[1420, 700], [1560, 688], [1700, 684], [1860, 694]]); q.stroke();
    q.fillStyle = lin(q, 0, 700, 0, 1080, [[0, '#8a88a4'], [1, '#5a5874']]);
    poly(q, [[300, 1080], [360, 820], [480, 740], [760, 700], [1180, 700], [1420, 740], [1560, 830], [1620, 1080]]); q.fill();
    q.fillStyle = 'rgba(255,255,255,.4)'; poly(q, [[380, 810], [490, 745], [760, 706], [1180, 706], [1400, 744], [1180, 730], [760, 730], [500, 770]]); q.fill();
    q.strokeStyle = 'rgba(40,40,70,.4)'; q.lineWidth = 4; poly(q, [[300, 1080], [360, 820], [480, 740], [760, 700], [1180, 700], [1420, 740], [1560, 830], [1620, 1080]]); q.stroke();
  });
  shot('ot-tape', bar(120), { title: '最后一轨', in: { type: 'white', dur: 1.4 }, pre: ['rock-summit', 'rec-body', 'jcard'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const card = t > bar(122);
    if (!card) {
      const cam = { x: 960, y: 560, z: 1.05 + 0.04 * s.at(0, 3.6), ...s.handheld(531, t, 2) };
      s.layer(g, cam, 1, (q) => {
        q.drawImage(C(s, 'rock-summit'), 0, 0, 1920, 1080);
        // 远处：她抱着膝坐在火山口边上看云海，小羊们挨着她（背影，很小）
        cast(q, 'adele-alter', { x: 1700, y: 688, h: 64, pose: 'hug-knees', view: 'back3', t, outfit: 'coat', prop: null, wind: 0.4, windDir: -1, ground: true });
        cast(q, 'sheep-black', { x: 1664, y: 690, h: 18, pose: 'sleep', t });
        cast(q, 'sheep-pink', { x: 1734, y: 690, h: 17, pose: 'sit', t: t + 1, glow: 0.3, flip: true });
        // 录音机放在石头平顶上（底边落在顶面那一条里；原来底边低了将近 100px，像是悬在石头正面前）
        const RX = 620, RY = 742 - 600 * 0.72;
        q.fillStyle = 'rgba(40,40,72,.28)'; q.beginPath(); q.ellipse(RX + 500 * 0.72, 744, 350, 11, 0, 0, TAU); q.fill();
        recorder(q, s, RX, RY, 0.72, { rec: 1, spin: lt * 0.5, vu: 0.15 + 0.5 * s.raw('rms') + 0.1 * sin(t * 5), led: 0.5 + 0.5 * s.pulse(2) });
        soundRings(q, RX + 944 * 0.72, RY + 170 * 0.72, t, { n: 4, per: BEAT * 4, r: 500, dir: -PI / 2 - 0.3, spread: 1.0, rgb: '255,255,255', a: 0.3 });
      });
      petals(g, t, { n: 16, seed: 532, vy: 30, vx: -90, sway: 60, s0: 14, s1: 26 });
      ashfall(g, t, { n: 40, seed: 533, vy: 30, vx: -60, s0: 1.4, s1: 5, a: 0.8 });
    } else {
      // 磁带盒里的标签：最后一行被写上「Miss You」
      const cam = { x: 960, y: 540, z: 1.0 + 0.03 * s.at(3.6, 7.2), ...s.handheld(534, t, 1.5) };
      g.fillStyle = '#c9d6e8'; g.fillRect(0, 0, VW, VH);
      s.layer(g, cam, 1, (q) => {
        q.save(); q.translate(960, 540); q.rotate(-0.03);
        q.fillStyle = 'rgba(40,50,90,.2)'; q.fillRect(-440, -266, 900, 560);
        q.drawImage(C(s, 'jcard'), -450, -280, 900, 560);
        const k = clamp((t - bar(122) - 0.6) / 1.6);
        // B1 那一行（卡片坐标 y=520 → 这里 y=240）
        q.save(); q.beginPath(); q.rect(-316, 176, 600 * k, 92); q.clip();
        E.text(q, 'Miss You', -306, 246, { font: 'hand', size: 56, color: '#d2334f', align: 'left' });
        q.restore();
        if (k > 0 && k < 1) E.glow(q, -306 + 600 * k * 0.9, 228, 30, '255,120,140', 0.6);
        q.restore();
      });
      petals(g, t, { n: 10, seed: 535, vy: 30, vx: -60, s0: 16, s1: 28 });
    }
    vigS(g, s, 0.3);
  });

  def('credits-bg', 1920, 1080, (q) => {
    q.fillStyle = lin(q, 0, 0, 0, 1080, [[0, '#3a7fd6'], [0.6, '#9fd0f5'], [1, '#e6f3fc']]); q.fillRect(0, 0, 1920, 1080);
    q.drawImage(E.kit.cloudSprite(91, 520, 220), 80, 640, 900, 380); q.drawImage(E.kit.cloudSprite(92, 520, 220), 1100, 700, 900, 380);
    // 撕开的纸：上方一大片白纸，下缘撕开露出天空
    const edge = tornPts(95, 1940, 850, -20, 896, 16, 14), edgeIn = tornPts(96, 1940, 830, -20, 874, 16, 12);
    paperPiece(q, [[-30, -30], [1950, -30], ...edge], [[-30, -30], [1950, -30], ...edgeIn], (c) => {
      c.fillStyle = '#f6f3ec'; c.fillRect(-30, -30, 1990, 940); const R = rng(4); c.fillStyle = 'rgba(160,150,140,.06)'; for (let i = 0; i < 460; i++) c.fillRect(R() * 1920, R() * 900, 2 + R() * 30, 1);
      // 纸上很淡的红色等高线（和乌纳那张考察图同一种线）
      for (const [cx, cy, n, s0] of [[1690, 150, 11, 7], [170, 760, 9, 3]]) {
        for (let i = 1; i <= n; i++) {
          const r = 40 + i * 46, ph = R() * TAU;
          c.strokeStyle = `rgba(210,51,79,${i % 4 === 0 ? 0.2 : 0.12})`; c.lineWidth = i % 4 === 0 ? 2.4 : 1.5; c.beginPath();
          for (let k = 0; k <= 72; k++) { const an = (k / 72) * TAU, rr = r * (1 + 0.1 * sin(an * 3 + ph + s0) + 0.05 * sin(an * 7 + i)); const x = cx + cos(an) * rr * 1.3, y = cy + sin(an) * rr * 0.85; k ? c.lineTo(x, y) : c.moveTo(x, y); }
          c.stroke();
        }
      }
    });
  });
  // 51 · 片尾 —— 撕纸的标题卡：MISS YOU 与歌曲信息，注明本页原创同人
  shot('ot-credits', bar(124), { in: { type: 'tear', dur: 1.1, seed: 13 }, pre: ['credits-bg', 'logo'] }, (g, s) => {
    const t = s.t, lt = s.lt;
    const cam = { x: 960, y: 540, z: 1.0 + 0.02 * s.p, ...s.handheld(541, t, 1.5) };
    s.layer(g, cam, 1, (q) => {
      // 比画面大一圈：镜头 z=1 时手持漂移也不会在画面边上露出一条缝
      q.drawImage(C(s, 'credits-bg'), -24, -14, 1968, 1108);
      const k = ease.out(clamp(lt / 1.2));
      q.save(); q.translate(960, 330); q.scale(0.72 + 0.04 * k, 0.72 + 0.04 * k); q.globalAlpha = k;
      q.drawImage(C(s, 'logo'), -820, -260, 1640, 520);
      q.globalAlpha = 1; logoSub(q, k, true);
      q.restore();
    });
    const lines = [
      ['想你 · Miss You', 36, 700, '#3b3550', 1.2],
      ['塞壬唱片-MSR / Erik Castro / David Lin / 左乙', 28, 600, '#4a4460', 2.0],
      ['MV：本页原创同人影像，与官方无关', 26, 600, '#6b6884', 2.8],
      ['角色与世界观 © Hypergryph', 26, 600, '#6b6884', 3.4],
      // 用了官方立绘（MVE.keyart.credit）
      ['角色立绘 © Hypergryph（官方原画，本页分层绑定）', 24, 600, '#6b6884', 3.9],
    ];
    lines.forEach(([str, size, w, col, at], i) => E.text(g, str, 960, 600 + i * 50 + (i > 1 ? 14 : 0), { size, weight: w, color: col, spacing: 4, alpha: clamp((lt - at) / 0.8) }));
    petals(g, t, { n: 18, seed: 542, vy: 50, vx: 30, s0: 14, s1: 28 });
    vigS(g, s, 0.2);
  });

  // @@SHOTS-END@@

  /* ---------- 旁白（本页原创，不是歌词） ---------- */
  const CAPTIONS = [
    [3.3, 7.7, '每一块石头，都曾经是一团火。', { y: 1022 }],
    [9.4, 13.3, '隔得再远，也终会流向同一个地方。', { y: 1022 }],
    [30.8, 34.8, '有些声音，我想把它们留下来。'],
    [39.0, 43.2, '听不清的时候，我就看着你说。'],
    [65.6, 69.9, '生命的分量，不在长短，而在深浅。'],
    // 2.35:1 黑边里的三句：整条字幕底带都放进下面的黑边（原来底带上沿压在画面上 30px，露出一块硬边的暗矩形）
    [104.0, 108.0, '妈妈，我走到半山腰了。', { y: 1022 }],
    [143.6, 148.4, '没有风。可它们还是飞走了。', { y: 1022 }],
    [173.2, 179.2, '所有的想念，最后都汇成同一团火。', { y: 1022 }],
    [195.2, 199.8, '灰烬落下的地方，会重新开出花来。'],
    [217.4, 221.8, '最后一轨，录下了山顶的风。'],
  ];

  /* ---------- 成片的调色、纸纹、漏光、章节小字 ---------- */
  // 分段调色：[起, 止, 颜色, 强度, 混合模式]。颜色都在中灰附近（柔光只偏色、不整体提亮），段落交界 0.8 秒交叉过渡
  const GRADES = [
    [bar(8), bar(16), '#7b90b4', 0.2, 'soft-light'], // 晴空与白灰：冷白蓝
    [bar(8), bar(16), '#808080', 0.12, 'saturation'], // 略微去饱和，红色的点缀更跳
    [bar(16), bar(25), '#b69478', 0.16, 'soft-light'], // 罗德岛的白天：暖
    [bar(25), bar(32), '#6e76a8', 0.14, 'soft-light'], // 写信的夜：靛蓝
    [bar(39), bar(43), '#8494b0', 0.18, 'soft-light'], // 乌纳：冷灰蓝
    [bar(48), bar(71), '#8492ad', 0.18, 'soft-light'], // 灰坡、半山腰、头晕：冷、灰
    [bar(48), bar(71), '#808080', 0.1, 'saturation'],
    [bar(71), bar(88), '#b89379', 0.16, 'soft-light'], // 山顶的晨光：暖桃色
    [bar(79) + 0.3, bar(83) + 1.2, '#b8487c', 0.26, 'soft-light'], // 花环飞走：一层玫红（呼应官方 MV 的洋红段落）
    [bar(104), bar(110), '#b8745e', 0.18, 'soft-light'], // 迸发：熔岩色
    [bar(110), bar(120), '#ad9780', 0.12, 'soft-light'], // 花开、下山：晨光
    [bar(120), 1e9, '#8898b4', 0.14, 'soft-light'], // 尾声：冷白蓝
  ];
  // 漏光：[起, 止, x, y, 半径, 颜色, 强度]
  const LEAKS = [
    [bar(8) + 0.2, bar(10), 1720, 40, 1000, '255,196,150', 0.2],
    [bar(18), bar(21), 160, 120, 900, '255,226,180', 0.16],
    [bar(71) + 0.5, bar(79), 1700, 260, 1000, '255,190,160', 0.18],
    [bar(83), bar(88), 1760, 300, 900, '255,196,170', 0.16],
    [bar(106), bar(108), 1700, 140, 1000, '255,130,170', 0.18],
    [bar(116), bar(118), 1500, 120, 900, '255,236,200', 0.16],
    [bar(124), 1e9, 1760, 80, 900, '255,214,180', 0.14],
  ];
  const ramp = (t, a, b, f = 0.8) => min(sstep(a - f / 2, a + f / 2, t), 1 - sstep(b - f / 2, b + f / 2, t));
  function finish(g, s, t) {
    for (const [a, b, col, al, mode] of GRADES) { const w = ramp(t, a, b); if (w > 0.005) s.post.fill(g, col, al * w, mode); }
    // 纸纹：静止不动（像是画在纸上的动画），回忆 / 梦的段落稍微重一点
    const pk = 0.2 + 0.1 * ramp(t, bar(62), bar(63) + 0.3) + 0.08 * ramp(t, bar(88), bar(100));
    const pa = g.globalAlpha, pc = g.globalCompositeOperation;
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = pk; g.drawImage(C(s, 'paper'), 0, 0, VW, VH);
    g.globalAlpha = pa; g.globalCompositeOperation = pc;
    for (const [a, b, x, y, r, rgb, al] of LEAKS) { const w = ramp(t, a, b, 1.2); if (w > 0.01) s.post.leak(g, t, { x, y, r, rgb, a: al * w, seed: floor(a) }); }
  }
  /** 画面下方的一层柔和的暗（只在没有黑边、字幕出现的时候）：白字压在花田、云海这种亮而碎的背景上也看得清 */
  const scrimSpr = () => sprite('scrim', 4, 256, (q) => { const gr = q.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(16,12,28,0)'); gr.addColorStop(0.55, 'rgba(16,12,28,.38)'); gr.addColorStop(1, 'rgba(16,12,28,.72)'); q.fillStyle = gr; q.fillRect(0, 0, 4, 256); });
  function captionScrim(g, t, lb) {
    if (lb > 40) return;
    let a = 0;
    for (const [t0, t1, , o] of CAPTIONS) { if (o && o.y) continue; if (t > t0 - 0.3 && t < t1 + 0.3) a = max(a, E.window01(t, t0 - 0.3, t1 + 0.3, 0.8, 0.8)); }
    if (a <= 0.01) return;
    const pa = g.globalAlpha; g.globalAlpha = pa * 0.6 * a; g.drawImage(scrimSpr(), -10, 790, VW + 20, 300); g.globalAlpha = pa;
  }
  /**
   * 有成片工具箱（MVE.finish）时的分段风格（按官方 MV / 纯烬 PV 的调色）；上面本片自己的 finish() 是没有工具箱时的替代。
   * 城市段的“冷灰、只留红色”只给背景那一层做（gradedBg），她的头发和脸保持原色；全局只放一个很轻的冷调。
   */
  let LOOK_CUES = null;
  function lookCues(F) {
    if (LOOK_CUES) return LOOK_CUES;
    const P = (name, o) => Object.assign({}, F.LOOKS[name] || { grade: name }, o || {});
    const paper = (a = 0.16) => [{ kind: 'paper', a }];
    const cool = [['curve', 'soft-light', 0.28], ['fill', 'soft-light', '#6c84a6', 0.22], ['sat', -0.06], ['lift', '#121a28', 0.18]];
    const climb = P('film', { grade: [['curve', 'soft-light', 0.26], ['fill', 'soft-light', '#7088a8', 0.24], ['sat', -0.1], ['lift', '#141c28', 0.2]], texture: paper(0.14), vignette: { a: 0.32, rgb: '10,16,28' } });
    const erupt = P('ember', { grade: [['curve', 'soft-light', 0.3], ['fill', 'soft-light', '#c85a3a', 0.16], ['lift', '#1a0610', 0.22]] });
    LOOK_CUES = [
      [0, P('ember')],
      [bar(8), P('film', { grade: cool, texture: paper(0.2), bloom: { strength: 0.3, threshold: 0.72, tint: '220,232,255' } })], // 城市：背景另做冷灰
      [bar(16), P('golden-hour', { amount: 0.5, texture: paper(0.14), leak: { palette: 'warm', a: 0.16, side: 'left' } })], // 罗德岛的白天
      [bar(25), P('night-blue', { amount: 0.75 })], // 写信的夜
      [bar(29), P('film', { texture: paper(0.14) })], // 分屏：莱塔尼亚的夜 / 汐斯塔的黄昏
      [bar(32), P('siesta-sunset', { amount: 0.5 })], // 纪录片：黄昏的火山
      [bar(35), P('film', { grade: cool, amount: 0.8 })], // 医疗部
      [bar(39), P('summer-noon', { amount: 0.75 })], // 乌纳村
      [bar(43), P('night-blue')], // 夜里的第一步
      [bar(48), climb], // 灰坡、半山腰
      [bar(62) + 0.25, P('memory-sepia')], // 多年前：妈妈在灯下写信
      [bar(63), climb],
      [bar(71), P('dawn')], // 山顶的日出
      // 官方立绘的两个镜头：调色与辉光放轻（原画自己的颜色要留住，脸不被辉光冲白）
      [bar(81), P('dawn', { amount: 0.5, bloom: { strength: 0.2, threshold: 0.76, tint: '255,214,190' }, leak: { palette: 'peach', a: 0.12, side: 'right' } })],
      [bar(85), P('dawn')],
      [bar(88), P('dream-pink', { amount: 0.5 })], // 汇流（梦一样的蓝里）
      [bar(100), P('dawn', { amount: 0.7 })],
      [bar(104), erupt], // 迸发
      [bar(107), Object.assign({}, erupt, { amount: 0.6, bloom: { strength: 0.28, threshold: 0.68, halation: 0.1, radius: 5 } })],
      [bar(108), P('summer-noon', { amount: 0.65 })], // 开花、下山
      [bar(120), P('film', { texture: paper(0.16) })], // 尾声
    ];
    return LOOK_CUES;
  }

  /**
   * 全片几处“白光”（冲出地面、白色转场、闪白、结尾白出）：[开始, 全白起, 全白止, 结束, 强度]。
   * 成片的暗角是在白光之后才加的，这几处要把暗角收掉，否则白画面上会留一圈灰色的椭圆
   */
  const WHITE_OUTS = [
    [bar(7) + 0.7 * (bar(8) - bar(7)), bar(8), bar(8) + 0.08, bar(8) + 0.35, 1],
    [bar(39) - 0.5, bar(39) + 0.4, bar(39) + 0.5, bar(39) + 1.0, 1],
    [bar(48), bar(48) + 0.4, bar(48) + 0.4, bar(48) + 0.8, 1],
    [bar(63) - 0.5, bar(63), bar(63), bar(63) + 0.6, 0.7],
    [bar(70) + 0.7 * (bar(71) - bar(70)), bar(71), bar(71) + 0.15, bar(71) + 0.6, 1],
    [bar(100) + 0.88 * (bar(104) - bar(100)), bar(104), bar(104) + 0.12, bar(104) + 0.5, 1],
    [bar(118) + 0.72 * (bar(120) - bar(118)), bar(120) + 0.1, bar(120) + 0.7, bar(120) + 1.4, 1],
  ];
  function whiteK(t) {
    let k = 0;
    for (const [a, b, c, d, w] of WHITE_OUTS) if (t > a && t < d) k = max(k, w * (t < b ? sstep(a, b, t) : t <= c ? 1 : 1 - sstep(c, d, t)));
    return k;
  }
  const scaleVig = (v, f) => (v == null || v === false ? v : typeof v === 'number' ? v * f : Object.assign({}, v, { a: (v.a ?? 0.4) * f }));

  // 章节小字（官方 MV 那种小号、拉开字距的排版）：有黑边时写在上面的黑边里，没有时写在画面左上角
  let CHAPTERS = null;
  function chapterLabel(g, s, t, lb) {
    if (!CHAPTERS) CHAPTERS = SHOTS.filter((sh) => sh.title).map((sh, i) => ({ t0: sh.t0, no: i + 1, name: sh.title }));
    for (const c of CHAPTERS) {
      if (c.no < 3) continue; // 开场和标题镜头自己就是标题
      const a0 = c.t0 + 0.9, a1 = c.t0 + 4.8;
      if (t < a0 || t > a1) continue;
      const k = E.window01(t, a0, a1, 0.7, 0.9), grow = ease.out(clamp((t - a0) / 1.1));
      const inBar = lb > 80, y = inBar ? lb * 0.5 + 18 : 100, x = 118 - 16 * (1 - grow);
      const st = inBar ? null : 'rgba(12,18,40,.4)';
      E.text(g, 'MISS YOU  ·  III', x, y - 40, { font: 'display', size: 17, weight: 700, spacing: 7, color: '#ffffff', align: 'left', alpha: k * 0.72, stroke: st, strokeW: 4 });
      E.text(g, String(c.no).padStart(2, '0'), x, y, { font: 'display', size: 34, weight: 700, color: '#ffffff', align: 'left', alpha: k, stroke: st, strokeW: 6 });
      g.save(); g.globalAlpha = k * 0.85; g.fillStyle = '#ffffff'; g.fillRect(x + 58, y - 12, 62 * grow, 2.5); g.restore();
      E.text(g, c.name, x + 138, y, { size: 33, weight: 700, spacing: 10, color: '#ffffff', align: 'left', alpha: k, stroke: st, strokeW: 6 });
    }
  }

  /* ---------- 全片后期：黑边、颗粒、暗角；预热下一个镜头的图层 ---------- */
  function letterboxAt(t) {
    let k = 0;
    if (t < bar(8)) k = 1;
    else if (t < bar(8) + 0.5) k = 1 - ease.out((t - bar(8)) / 0.5);
    else if (t >= bar(39) && t < bar(104)) k = ease.inOut(clamp((t - bar(39)) / 1.2));
    else if (t >= bar(104) && t < bar(104) + 0.7) k = 1 - ease.out((t - bar(104)) / 0.7);
    return k;
  }
  // 镜头里改用柔焦版的图层：预热列表跟着换（提前 3.5 秒画好，切镜头时不卡）
  const SOFT_ALIAS = { 'city-far': 'city-far~', 'street-haze': 'street-haze~', 'street-fg': 'street-fg~', 'slope-bg': 'slope-bg~', 'summit-far': 'summit-far~' };
  for (const sh of SHOTS) if (sh.pre) sh.pre = sh.pre.map((k) => SOFT_ALIAS[k] || k);
  function prefetch(s) {
    const t = s.t;
    for (const sh of SHOTS) {
      if (sh.t0 <= t - 0.01 || sh.t0 > t + 3.5 || !sh.pre) continue;
      for (const key of sh.pre) if (!MEM.has(ckey(key, s.k))) { C(s, key); return; }
    }
  }

  E.film({
    id: 'miss-you',
    title: 'Miss You',
    audio: 'assets/music/miss-you.mp3',
    fadeIn: 1.0,
    fadeOut: 3.0,
    meta: {
      no: 'III', cn: '想你', en: 'Miss You',
      artists: '塞壬唱片-MSR / Erik Castro / David Lin / 左乙',
      form: 'alter',
      logline: '熔化的石头从四面八方汇成同一团火。她带着想念登上乌纳火山，在云海之上埋下一块小石头。',
      synopsis: [
        '地底，一滴熔化的石头落下；更多的岩浆沿着裂缝从四面八方流来，汇成同一团火，冲上地面——晴空下的城市，白灰像雪一样落。',
        '她在罗德岛录下想留住的声音，学会看着别人的嘴唇听；给卡恩前辈和凯勒老师写信，信折成纸鸟飞走。',
        '她回到重建的乌纳：夜里，小羊们发着光替她引路，她在山坡上种下预警花；白天，她一步一步登上灰色的山坡，身边仿佛有父母当年的影子。',
        '山顶在云海之上。她埋下一块小石头，两个花环在无风的山顶自己飞走了。所有的想念汇成胸口的那团火——然后迸发成光，灰落下的地方开出花来。',
      ],
      era: '登顶 · 乌纳火山',
      // 海报与缩略图都不用标题画面：极光下的官方立绘（立绘不可用时是 Q 版的仰头举杖）/ 街上 / 和母亲的身影并肩 /
      // 洋红天空下仰望花环（官方立绘）/ 山顶挥手的父母
      poster: 193.6,
      thumbs: [20.6, 95.5, 147.4, 209.6],
      accent: '#6cb4ff',
      cast: [
        { who: 'adele-alter', o: { outfit: 'coat', prop: 'staff' }, role: '主角 · 穿着母亲的外套' },
        { who: 'sheep-black', role: '一路跟着她上山' },
        { who: 'sheep-pink', o: { glow: 0.8 }, role: '夜里为她引路' },
        { who: 'keller', role: '收信的凯勒老师' },
        { who: 'magna', o: { outfit: 'field' }, role: '母亲（回忆）' },
        { who: 'katia', o: { outfit: 'field' }, role: '父亲（回忆）' },
      ],
    },
    captions: CAPTIONS,
    shots: SHOTS,
    // 官方立绘（js/mv/keyart.js）：引擎在本片注册后自动加载；加载不了也照常播放（那三处画 Q 版的镜头）
    needs: ['keyart', 'finish'],
    /** 播放器切走 / 区块离得很远时调用：放掉本片的缓存（之后按需重建），立绘的显存也一起放 */
    release() { releaseAll(); const K = window.MVE && window.MVE.keyart; if (K && K.release) K.release(); },
    /** 预热：按播放器默认的 1280×720 先把开场镜头的图层画好（开播第一秒不卡）；预载立绘（只会 resolve，最多等 8 秒） */
    async prepare(ctx) {
      const s = { k: 1280 / VW };
      for (const key of ['ug-rock', 'ug-glow0', 'ug-glow1', 'ug-glow2', 'paper']) C(s, key);
      const F = FIN(); if (F && F.warm) F.warm(['paper', 'grain', 'dirt', 'watercolor', 'memory-sepia']);
      if (ctx && ctx.keyart) await ctx.keyart(KA_KEY);
    },
    overlay(g, s) {
      FRAME++;
      const t = s.t, F = FIN();
      // ① 成片（辉光 → 调色 → 纹理 → 漏光 → 暗角 → 颗粒）放最前；黑边、章节字、字幕在它之后，不被调色影响
      if (F) {
        let L = F.look(t, lookCues(F), 0.8);
        const wk = whiteK(t);
        if (wk > 0.01 && L) L = Object.assign({}, L, { vignette: scaleVig(L.vignette, 1 - wk) });
        F.frame(g, s, L);
      }
      else { finish(g, s, t); s.post.grain(g, t, 0.045); }
      const lb = letterboxAt(t), lbPx = ((VH - VW / 2.35) / 2) * lb;
      captionScrim(g, t, lbPx);
      if (lb > 0) s.post.letterbox(g, lb);
      chapterLabel(g, s, t, lbPx);
      prefetch(s);
    },
  });
})();
