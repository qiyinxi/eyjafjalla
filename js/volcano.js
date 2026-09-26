/* =========================================================
 * 火山图鉴 · 冷知识 · 页脚
 * - 剖面推演：静态 SVG 只画一次；岩浆、灰柱、闪电、融水等动效全部是 HTML 小元素上的
 *   transform / opacity 动画（交给合成器，不触发重绘）。SVG 里的部件只在换阶段时切换一次
 * - 按形态：术师看爆发指数（VEI），医疗看灰烬的旅程（2010 年欧洲灰云示意图）
 * - 欧洲地图：手工录入的经纬度（示意精度），等距圆锥投影；灰云范围为示意
 * - 自动演示、灰云播放只在看得见时运行；离屏的子块挂上 .anim-off 暂停动画
 * ========================================================= */
window.VOLC = (() => {
  'use strict';
  const D = window.EYJA, A = window.ART;
  const V = () => D.volcano;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const f1 = (n) => Math.round(n * 10) / 10;
  const RAD = Math.PI / 180;
  const em = (u) => f1(u / 10) + 'em'; // 剖面图里 1em = 10 个 viewBox 单位（见 .vx-fx 的字号）
  let uid = 0;

  /* ---------------------------------------------------- 小图标（ART.icon 里没有的补在这里） */
  const ICO = {
    up: '<path d="M12 20 V 5 M6 10 L 12 4 L 18 10"/><path d="M4 21 H 20"/>',
    plus: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8 V 16 M8 12 H 16"/>',
    drop: '<path d="M12 3 C 16 9, 19 12, 19 15.5 A 7 7 0 0 1 5 15.5 C 5 12, 8 9, 12 3 Z"/><path d="M9 16 A 3 3 0 0 0 12 19"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 7 L 12 13 L 21 7"/><path d="M15 16 H 18" stroke-dasharray="1 2"/>',
    bolt: '<path d="M13 2 L 5 13 H 11 L 9 22 L 19 10 H 13 Z"/>',
    tag: '<path d="M3 12 V 4 H 11 L 21 14 L 14 21 Z"/><circle cx="7.5" cy="8" r="1.4"/>',
    lava: '<path d="M3 7 C 7 5, 9 9, 13 7 S 19 5, 21 7"/><path d="M8 7.5 C 8 11, 11 12.5, 11 16.5 A 2 2 0 0 1 7 16.5 C 7 13.5, 8 11, 8 7.5"/><path d="M15.5 7.5 C 15.5 10, 17.5 11, 17.5 13.5 A 1.5 1.5 0 0 1 14.5 13.5"/>',
    pyro: '<path d="M2 21 L 9 8 L 12 12"/><path d="M10.5 19 A 3 3 0 0 1 13.5 14 A 3.5 3.5 0 0 1 19.5 14.5 A 3 3 0 0 1 20 20.5 H 11 A 1.8 1.8 0 0 1 10.5 19 Z"/><path d="M7 5 L 9 3 M11 5 L 12 2.5"/>',
    flood: '<path d="M3 10 C 5 8, 7 8, 9 10 S 13 12, 15 10 S 19 8, 21 10"/><path d="M3 15 C 5 13, 7 13, 9 15 S 13 17, 15 15 S 19 13, 21 15"/><path d="M3 20 C 5 18, 7 18, 9 20 S 13 22, 15 20 S 19 18, 21 20"/><path d="M8 5 L 12 2.5 L 16 5"/>',
    ash: '<path d="M6 11 A 3.5 3.5 0 0 1 9 6 A 4.5 4.5 0 0 1 17 6.5 A 3.5 3.5 0 0 1 18 13 H 7 A 2.5 2.5 0 0 1 6 11 Z"/><path d="M8 17 v.1 M12 18.5 v.1 M16 17 v.1 M10 21 v.1 M14 21.5 v.1" stroke-width="2.4"/>',
    mask: '<path d="M4 9 C 8 8, 16 8, 20 9 V 13 C 20 17, 16 19, 12 19 C 8 19, 4 17, 4 13 Z"/><path d="M4 10 H 2 M20 10 H 22 M8 12 H 16 M8 15 H 16"/>',
    sprout: '<path d="M12 21 V 11"/><path d="M12 13 C 7 13, 5 10, 5 6 C 9 6, 12 9, 12 13 Z"/><path d="M12 11 C 12 7, 15 4, 19 4 C 19 8, 16 11, 12 11 Z"/><path d="M6 21 H 18"/>',
    spring: '<path d="M4 16 C 4 20.5, 20 20.5, 20 16"/><path d="M3 16 H 21"/><path d="M8 13 C 7 11, 9 10, 8 7.5 M12 13 C 11 11, 13 10, 12 7.5 M16 13 C 15 11, 17 10, 16 7.5"/>',
    eye: '<path d="M2 12 C 5 6.5, 19 6.5, 22 12 C 19 17.5, 5 17.5, 2 12 Z"/><circle cx="12" cy="12" r="3"/><path d="M4 4 L 20 20"/>',
  };
  const ico = (n) => (ICO[n] ? `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICO[n]}</svg>` : A.icon(n));

  /* ====================================================
   * 欧洲示意地图：等距圆锥投影（标准纬线 45°N / 65°N）
   * ==================================================== */
  const MAP = { l: -26, r: 30, t: 71.8, b: 35, lon0: 2, p1: 45, p2: 65 };
  const CN = (Math.cos(MAP.p1 * RAD) - Math.cos(MAP.p2 * RAD)) / ((MAP.p2 - MAP.p1) * RAD);
  const CG = Math.cos(MAP.p1 * RAD) / CN + MAP.p1 * RAD;
  const raw = (lon, lat) => { const r = CG - lat * RAD, t = CN * (lon - MAP.lon0) * RAD; return [r * Math.sin(t), r * Math.cos(t)]; };
  const X0 = raw(MAP.l, MAP.b)[0], Y0 = raw(MAP.l, MAP.t)[1];
  const SC = 780 / (-2 * X0), PAD = 10;
  const MW = Math.round(-2 * X0 * SC + PAD * 2), MH = Math.round((raw(MAP.lon0, MAP.b)[1] - Y0) * SC + PAD * 2);
  const proj = (lon, lat) => { const [x, y] = raw(lon, lat); return [(x - X0) * SC + PAD, (y - Y0) * SC + PAD]; };
  const pct = (lon, lat) => { const [x, y] = proj(lon, lat); return `left:${f1((x / MW) * 100)}%;top:${f1((y / MH) * 100)}%`; };
  const pts = (s) => s.trim().split(/\s+/).map((p) => p.split(',').map(Number));
  const poly = (s) => 'M' + pts(s).map(([lo, la]) => proj(lo, la).map(f1).join(' ')).join('L') + 'Z';
  /** Catmull-Rom 闭合曲线：灰云的柔软轮廓 */
  const blob = (s) => spline(pts(s).map(([lo, la]) => proj(lo, la)));
  function spline(P) {
    const n = P.length;
    let d = `M${f1(P[0][0])} ${f1(P[0][1])}`;
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
    }
    return d + 'Z';
  }
  const line = (a) => 'M' + a.map(([lo, la]) => proj(lo, la).map(f1).join(' ')).join('L');
  const parallel = (lat, l = MAP.l, r = MAP.r) => { const a = []; for (let lo = l; lo <= r + 1e-6; lo += 1) a.push([lo, lat]); return a; };

  // 海岸线（经度,纬度）。示意精度：只保留能认出形状的转折点
  const LAND = [
    // 冰岛
    '-22.7,63.82 -22.0,63.83 -21.2,63.87 -20.6,63.72 -20.0,63.55 -19.13,63.4 -18.3,63.45 -17.5,63.72 -16.64,63.8 -16.0,64.05 -15.2,64.25 -14.5,64.4 -14.0,64.72 -13.55,65.1 -13.62,65.5 -14.6,65.8 -14.55,66.38 -15.2,66.25 -16.0,66.53 -16.9,66.18 -17.6,66.05 -18.1,65.72 -18.4,66.15 -19.4,66.1 -20.0,65.72 -20.6,66.12 -21.4,65.75 -22.4,66.45 -23.1,66.43 -23.8,65.95 -24.53,65.5 -23.6,65.45 -22.2,65.35 -22.8,65.05 -24.05,64.87 -23.2,64.78 -22.2,64.62 -22.1,64.4 -21.95,64.15 -22.5,64.02',
    // 法罗群岛、设得兰、奥克尼、外赫布里底、斯凯岛
    '-7.5,62.25 -6.6,62.35 -6.3,62.05 -6.7,61.6 -6.9,61.4 -7.1,61.9',
    '-1.7,60.2 -1.2,60.8 -0.75,60.8 -1.1,60.4 -1.3,59.85',
    '-3.4,58.9 -2.8,59.35 -2.4,59.2 -2.9,58.75',
    '-7.55,56.95 -7.2,57.1 -7.2,57.65 -6.95,57.85 -6.2,58.2 -6.25,58.52 -6.9,58.25 -7.1,57.8 -7.5,57.45',
    '-6.8,57.5 -6.3,57.7 -5.7,57.25 -6.1,57.05 -6.5,57.3',
    // 大不列颠
    '-5.7,50.05 -5.2,49.96 -4.2,50.33 -3.5,50.6 -2.45,50.55 -1.9,50.7 -1.3,50.78 -0.8,50.73 0.25,50.74 1.0,50.92 1.4,51.15 1.45,51.38 0.7,51.48 1.1,51.78 1.75,52.1 1.75,52.48 1.3,52.93 0.4,52.8 0.35,53.1 0.12,53.58 -0.08,54.1 -0.6,54.49 -1.2,54.65 -1.4,55.0 -1.6,55.6 -2.0,55.8 -2.5,56.0 -3.2,56.02 -2.58,56.28 -2.8,56.45 -2.45,56.7 -2.1,57.15 -1.8,57.5 -2.0,57.7 -3.0,57.68 -4.2,57.5 -3.8,57.9 -3.05,58.64 -4.4,58.55 -5.0,58.62 -5.3,58.2 -5.7,57.8 -5.6,57.3 -6.23,56.72 -5.6,56.4 -5.6,55.9 -5.8,55.3 -5.4,55.7 -4.8,55.95 -4.65,55.46 -5.0,55.0 -4.86,54.63 -4.3,54.75 -3.6,54.92 -3.2,54.95 -3.45,54.5 -3.0,54.05 -3.0,53.75 -3.1,53.38 -3.6,53.3 -4.4,53.42 -4.7,53.2 -4.77,52.78 -4.1,52.45 -4.6,52.1 -5.3,51.88 -5.1,51.6 -4.3,51.56 -3.3,51.4 -2.7,51.55 -3.1,51.22 -4.2,51.2 -4.53,51.02 -5.0,50.58',
    // 爱尔兰
    '-7.37,55.38 -6.9,55.2 -6.2,55.25 -5.75,54.85 -5.45,54.4 -6.1,54.0 -6.2,53.6 -6.06,53.38 -6.0,52.97 -6.35,52.18 -7.0,52.15 -7.6,51.95 -8.3,51.8 -9.0,51.6 -9.8,51.45 -10.2,51.6 -9.8,51.8 -10.47,52.1 -9.9,52.35 -9.7,52.55 -9.45,52.95 -9.0,53.2 -10.23,53.4 -9.9,53.8 -10.1,54.25 -9.3,54.3 -8.6,54.3 -8.3,54.5 -8.8,54.65 -8.5,55.05 -8.0,55.2',
    // 欧洲大陆：北冰洋岸 → 挪威 → 瑞典 → 波的尼亚湾 → 芬兰 → 波罗的海 → 北海 → 大西洋岸 → 地中海 → 黑海（东缘在图框外）
    '32.5,69.8 31.1,70.37 30.6,70.54 29.1,70.86 27.65,71.13 25.78,71.17 23.68,70.66 22.5,70.6 21.5,70.25 20.2,69.95 18.95,69.65 17.2,69.35 16.0,69.25 14.6,68.75 13.0,67.95 14.5,68.1 15.3,67.6 14.4,67.28 13.2,66.6 12.6,66.0 12.2,65.4 11.2,64.85 10.2,64.35 9.6,63.95 8.6,63.55 7.7,63.1 6.9,62.85 6.1,62.47 5.1,62.2 5.0,61.6 4.95,61.05 5.1,60.4 5.2,59.9 5.25,59.4 5.6,58.95 5.5,58.7 6.0,58.45 7.05,58.0 8.0,58.15 8.8,58.45 9.6,58.95 10.4,59.4 10.75,59.9 10.8,59.3 10.9,59.2 11.2,58.9 11.3,58.35 11.85,57.7 12.15,57.2 12.85,56.65 12.6,56.2 12.7,56.05 13.0,55.6 12.9,55.35 13.8,55.43 14.35,55.55 14.3,55.93 14.85,56.17 15.6,56.15 16.35,56.65 16.6,57.2 16.65,57.75 16.8,58.3 16.9,58.6 17.8,58.9 18.3,59.3 18.9,59.6 19.0,59.9 18.4,60.3 17.2,60.7 17.3,61.3 17.4,62.4 18.0,62.8 18.7,63.3 20.3,63.8 21.2,64.7 21.5,65.3 22.15,65.58 24.15,65.8 24.55,65.73 25.45,65.0 24.45,64.7 23.1,63.85 21.6,63.1 21.35,62.27 21.5,61.5 21.45,61.1 21.35,60.8 22.25,60.45 22.95,59.82 24.0,60.0 24.95,60.15 25.7,60.3 26.9,60.45 28.7,60.7 29.5,60.2 30.3,59.93 29.9,59.88 29.1,59.9 28.3,59.68 28.05,59.45 27.0,59.45 26.5,59.52 24.75,59.45 24.05,59.35 23.5,58.95 23.5,58.57 24.5,58.38 24.4,57.9 24.1,57.05 23.6,56.97 22.6,57.75 21.55,57.4 21.18,56.9 21.0,56.5 21.05,55.9 21.1,55.7 21.0,55.3 20.5,54.95 19.9,54.65 19.6,54.45 18.65,54.38 18.55,54.6 18.3,54.83 17.55,54.77 16.85,54.6 15.55,54.18 14.25,53.92 13.8,54.15 13.4,54.6 12.8,54.4 12.1,54.18 11.45,54.0 10.9,53.95 11.1,54.45 10.2,54.45 10.0,54.5 9.45,54.8 9.8,54.9 9.6,55.5 10.0,55.85 10.25,56.15 10.95,56.4 10.3,56.5 10.3,56.99 10.55,57.45 10.6,57.74 9.95,57.6 8.6,57.12 8.2,56.7 8.1,56.1 8.08,55.56 8.45,55.47 8.5,55.1 8.3,54.9 8.9,54.45 8.6,54.3 8.7,53.87 8.55,53.55 8.1,53.5 7.2,53.6 7.2,53.35 6.6,53.45 4.75,52.95 4.6,52.45 4.28,52.08 4.1,51.98 3.55,51.5 3.4,51.4 2.9,51.23 2.35,51.05 1.85,50.96 1.6,50.73 1.6,50.2 1.1,49.93 0.4,49.77 0.1,49.49 -0.4,49.33 -1.1,49.4 -1.26,49.67 -1.95,49.72 -1.6,49.2 -1.6,48.84 -1.5,48.64 -2.0,48.65 -2.7,48.55 -3.1,48.85 -3.45,48.82 -4.0,48.72 -4.6,48.62 -4.78,48.33 -4.55,48.25 -4.73,48.04 -4.37,47.8 -3.9,47.87 -3.4,47.72 -3.12,47.48 -2.8,47.55 -2.5,47.3 -2.2,47.27 -2.15,46.9 -1.8,46.5 -1.15,46.15 -1.1,45.9 -1.05,45.6 -1.2,45.2 -1.25,44.65 -1.3,44.1 -1.56,43.48 -2.0,43.32 -2.95,43.37 -3.8,43.47 -4.5,43.4 -5.65,43.55 -5.85,43.66 -6.9,43.57 -7.87,43.77 -8.25,43.48 -8.4,43.37 -9.1,43.2 -9.27,42.88 -9.0,42.5 -8.85,42.2 -8.85,41.9 -8.83,41.7 -8.68,41.15 -8.75,40.64 -8.87,40.15 -9.07,39.6 -9.38,39.36 -9.5,38.78 -9.2,38.65 -8.9,38.5 -8.87,37.95 -8.99,37.02 -8.67,37.1 -7.93,36.98 -7.4,37.17 -6.95,37.2 -6.4,36.8 -6.3,36.53 -6.03,36.18 -5.6,36.0 -5.35,36.12 -5.15,36.42 -4.42,36.7 -3.5,36.72 -2.45,36.83 -2.19,36.72 -1.9,37.1 -0.98,37.58 -0.69,37.63 -0.75,37.85 -0.48,38.34 0.23,38.73 -0.15,38.99 -0.32,39.45 -0.03,39.98 0.5,40.5 0.87,40.7 1.25,41.1 2.17,41.38 2.8,41.7 3.32,42.32 3.05,42.7 3.1,43.15 3.7,43.4 4.6,43.35 5.35,43.3 5.93,43.1 6.65,43.25 7.0,43.55 7.27,43.7 7.5,43.78 7.77,43.8 8.48,44.3 8.93,44.4 9.83,44.1 10.25,43.87 10.3,43.55 10.52,42.93 11.2,42.45 11.8,42.1 12.28,41.73 12.62,41.45 13.05,41.23 13.57,41.21 14.25,40.83 14.35,40.6 14.75,40.65 14.9,40.25 15.6,40.07 15.8,39.6 16.05,39.1 16.1,38.7 15.83,38.62 15.7,38.25 15.65,38.1 16.06,37.92 16.55,38.7 17.13,39.08 17.05,39.45 16.5,39.75 17.2,40.47 17.98,40.05 18.36,39.8 18.5,40.15 17.95,40.65 16.87,41.12 16.3,41.32 15.92,41.63 16.2,41.9 15.5,41.92 15.0,42.0 14.22,42.47 13.5,43.62 12.57,44.07 12.3,44.45 12.5,44.95 12.35,45.43 13.0,45.65 13.77,45.65 13.52,45.43 13.85,44.87 14.43,45.33 14.9,44.99 15.2,44.4 15.23,44.12 15.9,43.73 16.44,43.5 17.0,43.3 17.6,42.93 18.1,42.64 18.75,42.42 19.1,42.1 19.2,41.92 19.45,41.32 19.5,40.9 19.48,40.47 20.0,39.87 20.27,39.5 20.75,38.95 21.1,38.35 21.8,38.3 22.9,38.02 22.4,38.18 21.75,38.15 21.1,37.95 21.7,36.9 21.95,36.8 22.1,37.02 22.48,36.39 22.57,36.76 23.2,36.44 23.05,36.7 22.75,37.1 22.8,37.57 23.45,37.35 23.15,37.65 23.0,37.93 23.6,37.95 24.02,37.65 23.97,38.15 24.55,38.15 24.2,38.5 23.6,38.85 23.0,39.0 22.95,39.35 22.6,40.1 22.94,40.63 23.4,40.25 23.7,40.0 24.1,40.15 24.35,40.15 23.9,40.45 24.4,40.9 25.2,40.95 25.9,40.85 26.05,40.72 26.2,40.05 26.7,40.4 27.5,40.97 28.6,41.0 29.0,41.03 29.1,41.2 28.1,41.63 28.0,41.9 27.5,42.5 27.9,42.9 27.95,43.2 28.47,43.36 28.58,43.8 28.65,44.17 29.7,44.9 29.65,45.2 30.2,45.85 30.75,46.48 31.5,46.6 32.5,46.55',
    // 小亚细亚（东缘在图框外）
    '29.15,41.2 29.6,41.18 30.15,41.15 30.7,41.1 31.4,41.28 31.8,41.45 32.5,41.6 32.5,36.3 32.0,36.55 31.45,36.75 30.7,36.88 30.55,36.5 30.4,36.2 29.64,36.2 29.1,36.62 28.8,36.7 28.25,36.85 27.4,36.7 27.4,37.03 27.25,37.38 27.25,37.87 26.3,38.3 27.0,38.45 26.75,38.8 26.68,39.3 26.07,39.48 26.4,40.15 27.0,40.4 27.97,40.35 28.9,40.38 29.9,40.76 29.2,40.9 29.02,41.02',
    // 北非（南缘在图框外）
    '-10,33 -6.8,34.0 -6.3,35.0 -5.92,35.78 -5.4,35.92 -5.3,35.6 -4.4,35.2 -3.9,35.25 -2.9,35.17 -2.2,35.1 -1.86,35.1 -1.38,35.3 -0.64,35.72 0.1,35.9 1.3,36.5 2.5,36.6 3.05,36.8 4.3,36.9 5.1,36.75 5.8,36.82 6.9,36.95 7.8,36.95 8.7,36.95 9.85,37.3 10.3,37.1 11.05,37.08 10.6,36.4 10.65,35.8 11.07,35.5 11.1,35.2 10.75,34.75 10.0,34.3 10.2,33.8 11.2,33.3 12,33 12,32 -10,32',
    // 地中海岛屿
    '12.4,37.8 13.35,38.2 14.0,38.05 15.1,38.15 15.55,38.25 15.65,38.27 15.3,37.85 15.1,37.5 15.3,37.05 15.1,36.7 14.25,37.06 13.5,37.25 12.6,37.65',
    '8.2,41.0 9.2,41.25 9.6,40.9 9.7,40.3 9.7,39.9 9.5,39.1 9.1,39.2 8.4,39.0 8.4,39.9 8.3,40.55',
    '9.4,43.0 9.45,42.7 9.55,42.1 9.3,41.6 9.15,41.39 8.9,41.67 8.7,41.9 8.6,42.2 8.75,42.57 9.3,42.68',
    '23.55,35.5 24.0,35.55 24.5,35.37 25.13,35.34 25.72,35.3 26.3,35.3 26.15,35.0 25.7,35.0 24.8,34.95 24.0,35.2 23.55,35.25',
    '2.35,39.58 3.2,39.96 3.45,39.7 3.05,39.27 2.72,39.52',
    '1.25,38.95 1.6,39.1 1.6,38.85 1.3,38.85',
    '3.8,40.0 4.3,39.95 4.25,39.82 3.85,39.95',
    '25.85,39.3 26.4,39.35 26.6,39.05 26.1,39.0',
    '27.7,36.1 28.2,36.45 28.25,36.1 27.8,35.9',
    // 丹麦与波罗的海岛屿
    '12.3,56.12 12.62,56.04 12.6,55.68 12.2,55.45 12.45,55.3 11.9,55.0 11.3,55.25 11.15,55.33 11.1,55.68 11.3,55.97 11.85,55.97',
    '9.73,55.5 10.15,55.6 10.6,55.55 10.8,55.3 10.7,55.05 10.2,55.05 9.8,55.3',
    '10.95,54.85 11.6,54.85 12.1,54.7 11.9,54.55 11.2,54.65',
    '14.7,55.1 14.8,55.3 15.15,55.13 15.0,55.0',
    '18.1,57.4 18.7,57.9 19.1,57.85 18.9,57.3 18.3,56.95',
    '16.4,56.2 16.9,57.2 17.1,57.35 16.6,56.4',
    '21.8,58.3 22.3,58.6 23.3,58.55 22.9,58.2 22.1,57.9 22.0,58.0',
    '22.2,58.9 22.5,59.05 23.0,58.85 22.6,58.7',
    '19.6,60.1 19.9,60.4 20.4,60.3 20.2,60.05',
  ];
  const LAKES = ['12.4,58.9 13.2,59.35 14.0,59.0 13.5,58.5 12.7,58.4', '14.2,57.8 14.6,58.55 14.8,58.5 14.3,57.8', '29.9,61.2 31.0,61.7 32.8,61.2 32.5,60.3 31.0,60.0 30.2,60.5'];

  // 机场（经度, 纬度）
  const PINS = {
    伦敦: [-0.45, 51.47], 爱丁堡: [-3.37, 55.95], 格拉斯哥: [-4.43, 55.87], 都柏林: [-6.27, 53.43], 奥斯陆: [11.1, 60.19], 哥本哈根: [12.65, 55.62],
    斯德哥尔摩: [17.92, 59.65], 赫尔辛基: [24.96, 60.32], 塔林: [24.83, 59.41], 里加: [23.97, 56.92], 华沙: [20.97, 52.17], 柏林: [13.5, 52.37],
    法兰克福: [8.57, 50.03], 慕尼黑: [11.79, 48.35], 布鲁塞尔: [4.48, 50.9], 卢森堡: [6.2, 49.63], 巴黎: [2.55, 49.01], 苏黎世: [8.55, 47.46],
    维也纳: [16.57, 48.11], 布拉格: [14.26, 50.1], 布拉迪斯拉发: [17.21, 48.17], 布达佩斯: [19.26, 47.43], 卢布尔雅那: [14.46, 46.22],
    萨格勒布: [16.07, 45.74], 贝尔格莱德: [20.31, 44.82], 布加勒斯特: [26.1, 44.57], 马德里: [-3.57, 40.47], 里斯本: [-9.13, 38.77], 米兰: [8.72, 45.63],
  };
  // 灰云示意轮廓（经度,纬度 控制点）——依据当日各国空域关闭情况绘制，不是实测边界
  const CLOUDS = [
    '-20.3,63.35 -18.4,63.95 -14.5,63.1 -10.5,61.8 -8.4,60.7 -10.6,60.1 -15.2,61.3 -19.4,62.8',
    '-20.3,63.3 -16,63.8 -9,62.8 -1,62.2 6,62.4 12,60.9 18,60.3 24.5,58.4 26.5,56 23.5,52.8 20,51.4 15,52.2 10,52.6 6,50.4 2.5,50.3 -2,50 -5.6,50.6 -5,52.6 -6,54.8 -8,56.4 -11,58.6 -14.5,60.8 -18,62.4',
    '-20.3,63.2 -15,63.9 -6,63 4,63.2 14,62.6 24,61.9 29,60.4 29.5,55.2 28,50 27.8,45.6 26,43.6 20,43.8 15,45 9,45.4 4,46.2 0,47.2 -4,48.1 -8,50.4 -11,53 -12.3,57 -15,60.5 -19.4,62.5',
    '-20.3,63.3 -15,63 -8.5,60.6 -5.5,58.2 -8,56.6 -12,58.5 -17,61.6 M 2,58 10,59.6 20,59.1 26,57.2 22,54.6 14,54.1 6,55.1',
    '-20.3,63.2 -17,62.4 -13,58 -11,54 -8,51.4 -5,52.4 -2.6,55.2 -3,57.2 -6,58.6 -10,61 -16,63.3',
    '-20.3,63.2 -17,62.8 -15.5,58 -16,52 -14,46 -11,42 -9.8,38.4 -8,37.6 -3,39.4 3,41.8 9,44.2 14.5,46.2 17.6,47.4 16.8,49 12,48.9 8,47.8 3,45.4 -2,43.6 -7,42.8 -10.5,44.6 -12.5,49 -13.5,55 -15.5,60 -19,62.6',
    '-20.3,63.2 -17,62.8 -12.5,58.5 -10.4,55 -8.2,51 -4,49.8 1.2,50.4 5,52.4 4,54.6 -1,56 -5,58.5 -10,61 -16,63.2',
  ];

  let mapCache = '';
  function mapBase() {
    if (mapCache) return mapCache;
    const u = 'am' + ++uid;
    const frame = line([...parallel(MAP.t), [MAP.r, MAP.b], ...parallel(MAP.b).reverse(), [MAP.l, MAP.t]]) + 'Z';
    let grat = '';
    for (let lo = -20; lo <= 20; lo += 10) grat += line([[lo, MAP.b], [lo, MAP.t]]);
    for (let la = 40; la <= 70; la += 10) grat += line(parallel(la));
    const lab = (lo, la, t, cls = '', anchor = 'middle') => { const [x, y] = proj(lo, la); return `<text x="${f1(x)}" y="${f1(y)}" text-anchor="${anchor}" class="${cls}">${t}</text>`; };
    const latLab = [40, 50, 60, 70].map((la) => lab(MAP.l + 0.6, la - 0.25, la + '°N', 'am-deg', 'start')).join('');
    const lonLab = [-20, -10, 0, 10, 20].map((lo) => lab(lo, MAP.b + 0.5, (lo < 0 ? -lo + '°W' : lo === 0 ? '0°' : lo + '°E'), 'am-deg')).join('');
    mapCache = `<svg class="ash-base" viewBox="0 0 ${MW} ${MH}" aria-hidden="true">
      <defs><clipPath id="${u}c"><path d="${frame}"/></clipPath></defs>
      <path class="am-sea" d="${frame}"/>
      <g clip-path="url(#${u}c)">
        <path class="am-grat" d="${grat}"/>
        <path class="am-land" d="${LAND.map(poly).join('')}"/>
        <path class="am-lake" d="${LAKES.map(poly).join('')}"/>
      </g>
      <path class="am-frame" d="${frame}"/>
      <g class="am-lab">${latLab}${lonLab}
        ${lab(-17, 55, '北 大 西 洋', 'am-sea-t')}${lab(3.2, 56.4, '北海', 'am-sea-t')}${lab(19.5, 55.6, '波罗的海', 'am-sea-t')}${lab(5, 39.6, '地中海', 'am-sea-t')}${lab(-19.6, 64.9, '冰岛', 'am-land-t')}
      </g>
    </svg>`;
    return mapCache;
  }
  function cloudLayers() {
    return CLOUDS.map((c, i) => {
      const u = 'ac' + ++uid;
      const d = c.split(' M ').map(blob).join('');
      return `<svg class="ash-day" data-d="${i}" viewBox="0 0 ${MW} ${MH}" aria-hidden="true">
        <defs><pattern id="${u}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0 V7" class="ac-hatch"/></pattern></defs>
        <path d="${d}" class="ac-fill"/><path d="${d}" fill="url(#${u})"/><path d="${d}" class="ac-edge"/>
      </svg>`;
    }).join('');
  }

  /* ====================================================
   * 剖面推演
   * ==================================================== */
  const MOUNTAIN = '0,432 110,372 190,300 250,236 332,160 366,140 382,146 418,146 434,140 468,160 560,242 690,352 800,420 800,520 0,520';
  function sectionSVG() {
    const u = 'vx' + ++uid;
    return `<svg class="vx-svg" viewBox="0 0 800 520" aria-hidden="true">
      <defs>
        <linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--v-sky1)"/><stop offset="1" style="stop-color:var(--v-sky2)"/></linearGradient>
        <radialGradient id="${u}m" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff3b0"/><stop offset=".3" stop-color="#ffb030"/><stop offset=".65" stop-color="#ff4a12"/><stop offset="1" stop-color="#6a0d08" stop-opacity="0"/></radialGradient>
        <linearGradient id="${u}l" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3a0a"/><stop offset=".6" stop-color="#ff8a1c"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
        <linearGradient id="${u}i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#bfe0f6"/></linearGradient>
        <linearGradient id="${u}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b4d4f"/><stop offset="1" stop-color="#2a2123"/></linearGradient>
        <clipPath id="${u}c"><polygon points="${MOUNTAIN}"/></clipPath>
      </defs>
      <rect width="800" height="520" fill="url(#${u}s)"/>
      <g class="vx-far">
        <path d="M470 332 C 540 280, 600 244, 660 228 C 700 219, 760 216, 800 220 L 800 520 L 470 520 Z" class="vx-far-rock"/>
        <path d="M624 240 Q 642 233, 660 228 C 700 219, 760 216, 800 220" class="vx-far-ice" fill="none" stroke-width="10" stroke-linecap="round"/>
      </g>
      <polygon points="${MOUNTAIN}" fill="url(#${u}r)"/>
      <g clip-path="url(#${u}c)">
        <path d="M0 330 C 150 300, 300 330, 420 300 S 700 320, 800 300 L 800 520 L 0 520 Z" fill="#3e3234"/>
        <path d="M0 380 C 160 360, 300 390, 440 360 S 690 380, 800 360 L 800 520 L 0 520 Z" fill="#33292b"/>
        <path d="M0 250 C 160 240, 280 260, 420 236 S 690 250, 800 236 L 800 300 C 700 320, 560 300, 420 300 S 150 300, 0 330 Z" fill="#4a3d3f" opacity=".8"/>
        <path d="M0 420 C 200 408, 330 430, 480 410 S 700 424, 800 410 L 800 520 L 0 520 Z" fill="#241c1e"/>
      </g>
      <g class="vx-sills">
        <path d="M360 432 C 330 418, 306 402, 298 393 M440 434 C 470 420, 496 410, 510 404" fill="none" stroke="#6a2a1c" stroke-width="3"/>
        <path d="M238 392 C 262 382, 330 380, 356 390 C 330 400, 262 400, 238 392 Z" fill="url(#${u}l)"/>
        <path d="M452 404 C 480 394, 548 394, 574 404 C 548 413, 480 413, 452 404 Z" fill="url(#${u}l)"/>
      </g>
      <path class="vx-dike-c" d="M436 428 C 480 380, 540 320, 578 258" fill="none" stroke="#4a2420" stroke-width="6" stroke-linecap="round"/>
      <path class="vx-dike-h" d="M436 428 C 480 380, 540 320, 578 258" fill="none" stroke="url(#${u}l)" stroke-width="6" stroke-linecap="round"/>
      <path class="vx-lava-c" d="M578 255 C 600 272, 632 300, 664 327" fill="none" stroke="#2f2426" stroke-width="7" stroke-linecap="round"/>
      <path class="vx-lava-h" d="M578 255 C 600 272, 632 300, 664 327" fill="none" stroke="#ff7a1a" stroke-width="6" stroke-linecap="round"/>
      <path class="vx-cond-c" d="M400 146 C 394 200, 408 250, 398 300 S 404 380, 400 424" fill="none" stroke="#4a2420" stroke-width="14" stroke-linecap="round"/>
      <path class="vx-cond-h" d="M400 146 C 394 200, 408 250, 398 300 S 404 380, 400 424" fill="none" stroke="url(#${u}l)" stroke-width="14" stroke-linecap="round"/>
      <ellipse class="vx-cham" cx="400" cy="462" rx="170" ry="56" fill="url(#${u}m)"/>
      <g class="vx-ice">
        <path class="ice-l" d="M316 174 C 328 162, 344 150, 360 140 L 382 140 L 382 196 C 374 190, 368 198, 358 192 C 350 198, 342 188, 334 190 C 328 184, 322 184, 316 174 Z" fill="url(#${u}i)"/>
        <path class="ice-c" d="M381 140 L 419 140 L 419 196 C 410 200, 402 194, 396 200 C 390 196, 386 200, 381 196 Z" fill="url(#${u}i)"/>
        <path class="ice-r" d="M418 140 L 440 140 C 456 150, 472 162, 488 178 C 480 182, 474 180, 468 188 C 460 184, 452 192, 444 188 C 436 196, 428 190, 418 196 Z" fill="url(#${u}i)"/>
      </g>
      <path class="vx-flood" d="M320 176 C 300 196, 272 218, 250 238 C 226 262, 206 282, 190 302 C 162 330, 134 352, 110 374 C 76 392, 40 414, 0 434" fill="none" stroke="#9fd6ff" stroke-width="6" stroke-linecap="round"/>
      <path class="vx-dust" d="M190 300 L 250 236 L 316 175 M 488 179 L 560 242 L 690 352" fill="none" stroke="#8d8589" stroke-width="5" stroke-linecap="round"/>
      <path class="vx-dust-ice" d="M318 172 C 330 160, 346 150, 360 141 L 440 141 C 456 150, 472 162, 486 176" fill="none" stroke="#8d8589" stroke-width="6" stroke-linecap="round"/>
      <ellipse class="vx-crater" cx="400" cy="143" rx="20" ry="5" fill="#ffcf70"/>
      <g class="vx-lab">
        <text x="16" y="26">W 西</text><text x="784" y="26" text-anchor="end">东 E</text>
        <text x="786" y="206" text-anchor="end" class="vx-katla">卡特拉 · Mýrdalsjökull →</text>
        <text x="16" y="508" class="vx-lb">冰岛南部 · 63.63°N 19.62°W</text>
        <text x="784" y="508" text-anchor="end" class="vx-lb">示意图 · 非比例</text>
      </g>
    </svg>`;
  }

  /* ---- 合成器层上的小元素 ---- */
  /** 沿线段 (x1,y1)→(x2,y2) 匀速移动的光点：外层静态旋转，内层只做 translateX */
  function strip(cls, x1, y1, x2, y2, n, dur) {
    const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) / RAD;
    let s = '';
    for (let i = 0; i < n; i++) s += `<b style="animation-duration:${dur}s;animation-delay:${f1((-dur * i) / n)}s"></b>`;
    return `<i class="strip ${cls}" style="left:${em(x1)};top:${em(y1)};width:${em(len)};transform:rotate(${f1(ang)}deg)">${s}</i>`;
  }
  /** 抛物线：外层旋转（可镜像），中层匀速横移，内层上抛下落 */
  const arcs = (cls, x, y, list) => list.map(([r, d, dl, flip]) => `<i class="arc ${cls}" style="left:${em(x)};top:${em(y)};transform:rotate(${r}deg)${flip ? ' scaleX(-1)' : ''}"><b style="animation-duration:${d}s;animation-delay:${dl}s"><u style="animation-duration:${d}s;animation-delay:${dl}s"></u></b></i>`).join('');
  /** 烟团：外层旋转定方向，内层沿“上方”飘走并胀大 */
  const puffs = (cls, x, y, list) => list.map(([r, s, d, dl]) => `<i class="puff ${cls}" style="left:${em(x - s / 2)};top:${em(y - s / 2)};width:${em(s)};height:${em(s)};transform:rotate(${r}deg)"><b style="animation-duration:${d}s;animation-delay:${dl}s"></b></i>`).join('');
  const glow = (cls, x, y, w, h, dl = 0) => `<i class="glow ${cls}" style="left:${em(x - w / 2)};top:${em(y - h / 2)};width:${em(w)};height:${em(h)};animation-delay:${dl}s"></i>`;
  const BOLT = '<svg viewBox="0 0 20 44"><path d="M12 0 L 3 21 L 10 21 L 5 44 L 18 16 L 11 16 L 16 0 Z"/></svg>';
  const SPROUT = '<svg viewBox="0 0 20 24"><path d="M10 24 C 10 17, 10 12, 10 8" fill="none" stroke="#4f9a4f" stroke-width="2" stroke-linecap="round"/><path d="M10 13 C 5 11, 2.5 7, 3.5 3.5 C 8 4.5, 10 8.5, 10 13 Z" fill="#7cc47c"/><path d="M10 10.5 C 15 8.5, 17 4.5, 16 1.5 C 12 2.5, 10 6, 10 10.5 Z" fill="#9ad89a"/></svg>';

  function sectionFX() {
    // 灰柱：竖直的柱体 + 升到高处后被风压弯、向东（右）铺开的伞状灰云（只在第 4 阶段）
    const plume = puffs('pa', 400, 134, [[-4, 44, 5.2, 0], [6, 52, 5.6, -0.8], [0, 40, 4.8, -1.7], [12, 56, 6, -2.5], [-8, 46, 5.4, -3.3], [4, 60, 6.2, -4.1], [10, 42, 5, -1.2], [-2, 50, 5.8, -2.9]])
      + puffs('pd x3', 420, 58, [[84, 74, 9, 0], [90, 88, 10, -1.2], [80, 66, 8.6, -2.4], [94, 96, 10.4, -3.6], [86, 80, 9.4, -4.8], [92, 90, 10, -6], [82, 72, 9.2, -7.2], [96, 100, 10.8, -8.4], [88, 84, 9.6, -9.4]]);
    const falls = [[452, 96], [488, 88], [520, 110], [556, 94], [590, 118], [624, 104], [472, 128], [538, 136], [602, 142], [650, 126], [506, 150], [570, 160]]
      .map(([x, y], i) => `<i class="fall" style="left:${em(x)};top:${em(y)};animation-duration:${f1(3.2 + (i % 4) * 0.45)}s;animation-delay:${f1(-i * 0.37)}s"></i>`).join('');
    const bolts = [[366, 44, 52, 3.7, 0], [432, 20, 44, 5.3, -1.8], [404, 72, 36, 4.4, -3.1]]
      .map(([x, y, h, d, dl]) => `<i class="bolt" style="left:${em(x)};top:${em(y)};width:${em(h * 0.45)};height:${em(h)};animation-duration:${d}s;animation-delay:${dl}s">${BOLT}</i>`).join('');
    const sprouts = [[34, 413], [60, 399], [86, 385], [128, 354], [152, 333], [724, 373], [752, 391], [774, 404]]
      .map(([x, y], i) => `<i class="sprout" style="left:${em(x - 7)};top:${em(y - 17)};animation-delay:${f1(0.2 + i * 0.16)}s">${SPROUT}</i>`).join('');
    return `<div class="vx-fx" aria-hidden="true">
      <div class="g all cham">${glow('gc', 400, 462, 360, 130)}</div>
      <div class="g s0 s2 seis">${[0, 0.8, 1.6].map((d) => `<i class="ring" style="left:${em(400 - 60)};top:${em(456 - 22)};animation-delay:${d}s"></i>`).join('')}</div>
      <div class="g s0 sillg">${glow('gs', 297, 391, 150, 40)}${glow('gs', 513, 404, 150, 40, -1.4)}${strip('mag', 360, 432, 300, 394, 2, 2.6)}${strip('mag', 440, 434, 510, 404, 2, 2.6)}</div>
      <div class="g s1 dike">${strip('mag', 436, 428, 578, 258, 3, 2.2)}${strip('lavaf', 580, 258, 664, 327, 3, 2.8)}${glow('gf', 578, 252, 70, 44)}</div>
      <div class="g s1 fount">${arcs('fa', 578, 252, [[-14, 1.3, 0], [-4, 1.1, -0.35], [8, 1.25, -0.7], [18, 1.4, -0.2], [2, 1.05, -0.95], [-20, 1.5, -1.1], [-10, 1.2, -0.5, 1], [6, 1.35, -0.85, 1], [16, 1.15, -0.15, 1], [-2, 1.45, -1.25, 1], [24, 1.3, -0.6, 1]])}</div>
      <div class="g s1 steam">${puffs('ps', 578, 244, [[10, 34, 3.4, 0], [24, 28, 3.8, -1.3], [2, 38, 4.2, -2.6]])}</div>
      <div class="g s4 steam">${puffs('ps', 400, 132, [[8, 36, 5, 0], [18, 30, 5.6, -1.9], [0, 40, 6, -3.7]])}</div>
      <div class="g s2 s3 rise">${strip('mag v', 400, 424, 400, 150, 4, 2.2)}${glow('gk', 400, 142, 80, 34)}</div>
      <div class="g s2 s3 plume">${plume}</div>
      <div class="g s3 bolts">${bolts}</div>
      <div class="g s3 falls">${falls}</div>
      <div class="g s3 bombs">${arcs('bm', 400, 140, [[-8, 2.4, 0, 1], [10, 2.8, -0.9], [-22, 3.1, -1.7, 1], [24, 2.6, -2.2]])}</div>
      <div class="g s2 flood">${strip('water', 320, 178, 190, 302, 3, 1.7)}${strip('water', 190, 302, 20, 426, 3, 2.1)}</div>
      <div class="g s4 sprouts">${sprouts}</div>
    </div>`;
  }

  function spotsHTML() {
    return `<div class="vx-spots">${V().hotspots.map((s, i) => `<button type="button" class="vspot" data-i="${i}" style="left:${em(s.x)};top:${em(s.y)}" aria-label="${s.title}"><i></i><span>${s.title}</span></button>`).join('')}</div>`;
  }
  const stageNow = (i) => { const s = V().stages[i]; return `<p class="mono vx-k">${String(i + 1).padStart(2, '0')} / ${String(V().stages.length).padStart(2, '0')} · ${s.k}</p><h4>${s.t}<small class="mono">${s.en}</small></h4><p>${s.d}</p>`; };

  function sectionHTML(stage) {
    const S = V().stages;
    return `<div class="vx-grid">
      <div class="panel vx-panel" data-reveal>
        <div class="vx" data-stage="${stage}">${sectionSVG()}${sectionFX()}${spotsHTML()}</div>
        <div class="vo-tip" aria-live="polite"><b>点击剖面上的光点</b>查看火山的各个部分。本图为原创示意，不按比例。</div>
      </div>
      <div class="panel vx-side" data-reveal style="--i:1">
        <div class="panel-h">ERUPTION 2010 <span>喷发推演</span></div>
        <ol class="vx-steps" style="--n:${S.length};--at:${stage}">${S.map((s, i) => `<li><button type="button" data-vx="${i}" class="${i === stage ? 'on' : ''}" aria-pressed="${i === stage}"><span class="mono">${s.k}</span><b>${s.t}</b></button></li>`).join('')}</ol>
        <div class="vx-now" aria-live="polite">${stageNow(stage)}</div>
        <div class="vx-ctl">
          <button type="button" class="btn btn-ghost" data-vx="prev" aria-label="上一阶段">◀</button>
          <button type="button" class="btn btn-primary vx-play" data-vx="play">▶ 演示全过程</button>
          <button type="button" class="btn btn-ghost" data-vx="next" aria-label="下一阶段">▶</button>
        </div>
      </div>
    </div>`;
  }

  /* ====================================================
   * 爆发指数（术师）
   * ==================================================== */
  const VEI_VOL = [1e3, 1e4, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12]; // 立方米，取各级下限（0 级取示意值）
  function veiHTML(k) {
    const L = V().vei;
    return `<div class="panel vei" data-reveal>
      <div class="panel-h">VOLCANIC EXPLOSIVITY INDEX <span>火山爆发指数</span></div>
      <div class="vei-body">
        <div class="vei-bars" role="group" aria-label="选择爆发指数等级">${L.map((v, i) => `
          <button type="button" class="vei-b${i === k ? ' on' : ''}${i === 4 ? ' me' : ''}" data-vei="${i}" style="--k:${((i + 1.4) / 9.4).toFixed(3)}" aria-pressed="${i === k}" aria-label="VEI ${i} ${v.n}">
            <i></i><b>${i}</b><small>${v.n}</small>${i === 4 ? '<em class="mono">2010</em>' : ''}
          </button>`).join('')}
        </div>
        <div class="vei-card" aria-live="polite">${veiCard(k)}</div>
      </div>
      <p class="vo-note">VEI 按喷出物体积与喷发柱高度划分（Newhall &amp; Self, 1982）。从 2 级起，每升一级，喷出物体积约 ×10；频率为全球平均。</p>
    </div>`;
  }
  function veiCard(k) {
    const v = V().vei[k];
    const ratio = VEI_VOL[k] / VEI_VOL[4];
    const eN = Math.cbrt(VEI_VOL[k]), eR = Math.cbrt(VEI_VOL[4]), m = Math.max(eN, eR);
    const cmp = k === 4 ? '2010 年的艾雅法拉冰盖火山就在这一级' : k === 0 ? '喷出物不到 4 级下限的 1 / 10,000' : ratio > 1 ? `喷出物下限是 4 级的 ${ratio.toLocaleString('en-US')} 倍` : `喷出物下限是 4 级的 1 / ${(1 / ratio).toLocaleString('en-US')}`;
    return `<div class="vei-top"><b class="vei-n">${k}</b><div><h4>${v.n}<small class="mono">${v.en}</small></h4><p>${v.d}</p></div></div>
      <div class="vei-row">
        <dl class="vei-dl">
          <div><dt>喷出物</dt><dd>${v.vol}</dd></div>
          <div><dt>喷发柱</dt><dd>${v.h}</dd></div>
          <div><dt>类型</dt><dd>${v.type}</dd></div>
          <div><dt>频率</dt><dd>${v.freq}</dd></div>
        </dl>
        <div class="vei-viz" aria-hidden="true">
          <div class="vei-cubes"><i class="cube ref" style="--k:${(eR / m).toFixed(4)}"></i><i class="cube now" style="--k:${(eN / m).toFixed(4)}"></i></div>
          <div class="vei-col"><i class="fill" style="--h:${Math.min(1, v.hk / 60).toFixed(3)}"></i><i class="cruise"><span>10 km</span></i></div>
        </div>
      </div>
      <p class="vei-cmp"><span class="sw now"></span>VEI ${k}<span class="sw ref"></span>VEI 4 · 2010<span class="sw air"></span>客机巡航高度<br>${cmp}</p>
      <p class="vei-ex"><b>典型</b>${v.ex}${v.is ? `<br><b>冰岛</b>${v.is}` : ''}</p>`;
  }

  /* ====================================================
   * 灰烬的旅程（医疗）
   * ==================================================== */
  function ashHTML(day) {
    const A2 = V().ash;
    const pins = Object.entries(PINS).map(([n, [lo, la]], j) => `<i class="pin" data-p="${n}" style="${pct(lo, la)};--j:${j % 12}" title="${n}"><b>${n}</b></i>`).join('');
    return `<div class="panel ash" data-reveal>
      <div class="panel-h">ASH CLOUD 2010 <span>灰烬的旅程 · 示意</span></div>
      <div class="ash-body">
        <div class="ash-map" data-day="${day}" style="aspect-ratio:${MW}/${MH}">
          ${mapBase()}${cloudLayers()}
          <div class="ash-pins">${pins}</div>
          <i class="ash-vo" style="${pct(-19.62, 63.63)}"><b></b></i>
          <span class="ash-vo-t mono" style="${pct(-19.62, 62.7)}">EYJAFJALLAJÖKULL</span>
        </div>
        <div class="ash-side">
          <div class="ash-now" aria-live="polite">${ashNow(day)}</div>
          <ol class="ash-tl" style="--n:${A2.days.length};--at:${day}">${A2.days.map((d, i) => `<li><button type="button" data-ash="${i}" class="${i === day ? 'on' : ''}" aria-pressed="${i === day}" aria-label="${d.k} ${d.t}" title="${d.t}"><b class="mono">${d.k}</b></button></li>`).join('')}</ol>
          <button type="button" class="btn btn-primary ash-play" data-ash="play">▶ 播放灰云</button>
          <div class="ash-stats">${A2.stats.map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join('')}</div>
        </div>
      </div>
      <p class="vo-note">示意图：灰云范围依据当日各国空域关闭情况绘制，并非实测边界；红点只标出当天关闭空域的部分机场。</p>
    </div>`;
  }
  const ashNow = (i) => { const d = V().ash.days[i]; return `<p class="mono vx-k">2010 · ${d.k}</p><h4>${d.t}</h4><p>${d.d}</p>`; };

  /* ---- 冰岛位置小图：单独一份更细的海岸线（经度,纬度，逆时针从雷克雅内斯半岛起），折线不做平滑 ---- */
  const ISL = `-22.70,63.81 -22.72,63.93 -22.69,64.08 -22.35,63.99 -22.05,64.05 -21.93,64.15 -22.03,64.17 -21.78,64.22 -21.88,64.32 -21.45,64.39 -21.85,64.36 -22.08,64.32
    -21.92,64.52 -21.78,64.58 -22.02,64.56 -22.35,64.57 -22.80,64.74 -23.25,64.78 -23.80,64.74 -24.05,64.88 -23.70,64.93 -23.25,64.94 -22.73,65.07 -22.25,65.13 -21.85,65.28
    -22.40,65.44 -23.20,65.49 -23.90,65.44 -24.53,65.50 -24.10,65.62 -23.95,65.78 -23.78,65.92 -23.55,66.05 -23.40,66.16 -23.10,66.10 -22.70,66.00 -22.45,65.90 -22.72,66.10
    -22.95,66.25 -23.10,66.43 -22.70,66.46 -22.40,66.45 -21.95,66.30 -21.60,66.12 -21.35,65.92 -21.15,65.65 -20.95,65.55 -20.75,65.62 -20.35,65.78 -20.40,66.05 -20.00,66.12
    -19.70,65.95 -19.40,65.72 -19.20,65.95 -18.95,66.10 -18.85,66.18 -18.45,66.08 -18.15,65.85 -18.09,65.68 -17.98,65.90 -17.85,66.08 -17.55,66.10 -17.35,66.05 -17.12,66.20
    -16.80,66.12 -16.60,66.05 -16.45,66.20 -16.20,66.54 -15.95,66.45 -15.60,66.28 -15.35,66.18 -15.00,66.30 -14.53,66.38 -14.85,66.12 -14.83,65.75 -14.55,65.72 -14.30,65.58
    -13.95,65.55 -13.78,65.50 -13.60,65.40 -13.50,65.27 -13.49,65.08 -13.70,64.92 -14.00,64.80 -14.28,64.66 -14.55,64.40 -14.95,64.30 -15.20,64.25 -15.60,64.10 -16.10,63.95
    -16.64,63.80 -17.30,63.73 -17.90,63.52 -18.40,63.43 -18.90,63.39 -19.13,63.40 -19.50,63.52 -20.10,63.60 -20.60,63.73 -21.00,63.82 -21.38,63.85 -21.90,63.82 -22.43,63.84`;
  // 冰盖（示意轮廓）：[名字, 轮廓, 是否标注]
  const ICE = [
    ['瓦特纳冰原', '-18.20,64.58 -17.60,64.75 -16.90,64.78 -16.20,64.72 -15.65,64.56 -15.38,64.36 -15.72,64.20 -16.30,64.06 -16.85,64.02 -17.25,64.12 -17.65,64.26 -18.10,64.36', 1],
    ['朗格冰原', '-20.58,64.78 -20.05,64.82 -19.88,64.62 -20.10,64.44 -20.50,64.50', 0],
    ['霍夫斯冰原', '-19.15,64.85 -18.72,64.90 -18.55,64.78 -18.72,64.66 -19.10,64.70', 0],
    ['米尔达尔斯冰原', '-19.45,63.72 -19.05,63.76 -18.78,63.66 -18.95,63.55 -19.35,63.57', 0],
    ['艾雅法拉冰盖', '-19.80,63.65 -19.56,63.67 -19.44,63.62 -19.58,63.585 -19.78,63.60', 0],
    ['德朗加冰原', '-22.45,66.20 -22.10,66.24 -22.00,66.12 -22.30,66.08', 0],
    ['斯奈山冰盖', '-23.86,64.81 -23.72,64.83 -23.70,64.79 -23.82,64.78', 0],
  ];
  function icelandMap() {
    const L0 = -24.8, L1 = -13.2, T = 66.7, B = 63.15, W = 360;
    const H = Math.round((W * (T - B)) / ((L1 - L0) * Math.cos(64.9 * RAD)));
    const p = (lo, la) => [f1(((lo - L0) / (L1 - L0)) * W), f1(((T - la) / (T - B)) * H)];
    const path = (s) => 'M' + pts(s).map(([lo, la]) => p(lo, la).join(' ')).join('L') + 'Z';
    const lab = (lo, la, t, cls, dx, dy, a = 'start') => { const [x, y] = p(lo, la); return `<circle cx="${x}" cy="${y}" r="2.4" class="${cls}"/><text x="${f1(x + dx)}" y="${f1(y + dy)}" text-anchor="${a}" class="${cls}">${t}</text>`; };
    const [vx, vy] = p(-19.62, 63.63), [sx] = p(-15.2, 63.35), [sx2] = p(-15.2 + 1.025, 63.35);
    const [gx, gy] = p(-16.9, 64.42);
    // 韦斯特曼纳群岛：几粒小岛
    const vm = [[-20.27, 63.44, 1.8], [-20.35, 63.40, 1], [-20.60, 63.30, 0.9], [-20.2, 63.47, 0.7]].map(([lo, la, r]) => { const [x, y] = p(lo, la); return `<circle cx="${x}" cy="${y}" r="${r}" class="is-land"/>`; }).join('');
    // 2010 年的灰羽：从火山口向东南飘出去的几团（HTML 小元素，只动 transform / opacity）
    const puffs = [0, 1, 2, 3, 4].map((i) => `<b style="animation-delay:${f1(-i * 1.5)}s"></b>`).join('');
    return `<div class="vo-iceland" aria-label="冰岛位置示意图"><div class="is-in">
      <svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
        <path d="${path(ISL)}" class="is-land"/>${vm}
        <g class="is-ice">${ICE.map(([, s]) => `<path d="${path(s)}"/>`).join('')}</g>
        <text x="${gx}" y="${gy}" text-anchor="middle" class="is-glab">瓦特纳冰原</text>
        ${lab(-21.94, 64.15, '雷克雅未克', 'is-city', 7, 4)}
        ${lab(-20.27, 63.44, '韦斯特曼纳群岛', 'is-city', -6, 12, 'end')}
        <text x="${p(-19.1, 63.66)[0]}" y="${f1(p(-19.1, 63.66)[1] - 9)}" text-anchor="start" class="is-city">卡特拉</text>
        <text x="${f1(vx - 5)}" y="${f1(vy - 10)}" text-anchor="end" class="is-vo">艾雅法拉冰盖火山</text>
        <path d="M${f1(sx)} ${H - 12} H${f1(sx2)}" class="is-scale"/><text x="${f1((sx + sx2) / 2)}" y="${H - 16}" text-anchor="middle" class="is-city">50 km</text>
        <g class="is-n" transform="translate(${W - 16} 20)"><path d="M0 -9 L 4 3 L 0 0 L -4 3 Z"/><text y="13" text-anchor="middle">N</text></g>
      </svg>
      <span class="is-plume" style="left:${f1((vx / W) * 100)}%;top:${f1((vy / H) * 100)}%" aria-hidden="true">${puffs}</span>
      <i class="is-pulse" style="left:${f1((vx / W) * 100)}%;top:${f1((vy / H) * 100)}%"><b></b></i></div>
      <span class="mono">ICELAND · 位置示意</span>
    </div>`;
  }

  /* ====================================================
   * 名字的来历
   * ==================================================== */
  function etymHTML(form) {
    const E = V();
    /** 音节按词素分组（依次拼接音节，直到与词素一致）：每组下面一道括线，写上这个词素的意思 */
    const word = (list, parts, key) => {
      const groups = [];
      let cur = [], acc = '', pi = 0;
      list.forEach((s, i) => {
        cur.push([s, i]);
        acc += s[0];
        if (parts[pi] && acc.toLowerCase() === parts[pi].part.toLowerCase()) { groups.push([parts[pi], cur]); cur = []; acc = ''; pi++; }
      });
      if (cur.length) groups.push([null, cur]);
      const syl = ([s, ipa, cn], i) => `<span class="syl${cn ? ' cn' : key === 'eyja' ? ' drop' : ''}" style="--k:${i}"><b>${s}</b><i class="mono">${ipa}</i>${cn ? `<em>${cn}</em>` : key === 'eyja' ? '<em class="x">·</em>' : ''}</span>`;
      return `<div class="ety-word" data-w="${key}" aria-label="${list.map((x) => x[0]).join('')}">${groups.map(([m, g], gi) => `<span class="ety-m" style="--g:${gi}"><span class="ety-sy">${g.map(([s, i]) => syl(s, i)).join('')}</span>${m ? `<span class="ety-mu"><b>${m.part}</b>${m.mean}</span>` : ''}</span>`).join('')}</div>`;
    };
    const main = `<div class="ety-blk">
        ${word(E.syl, E.etymology, 'eyja')}
        <div class="ety-line"><span class="mono ety-ipa">[ˈeiːjaˌfjatl̥aˌjœːkʏtl̥]</span><button type="button" class="btn btn-ghost ety-say" data-say="eyja">▶ 跟读一遍</button></div>
        <p>Eyjafjallajökull ——“岛屿山的冰川”。山名 Eyjafjöll 意为“群岛之山”，指的是近海的韦斯特曼纳群岛。代号「艾雅法拉」取的是前半截 Eyjafjalla：艾·雅·法·拉，冰川 jökull 留在了山顶。</p>
        <ul class="ety-tips">${E.tips.map(([a, b]) => `<li><b class="mono">${a}</b>${b}</li>`).join('')}</ul>
      </div>`;
    const alt = `<div class="ety-blk ety-alt">
        ${word(E.sylAlt, E.alterEtym, 'hvit')}
        <div class="ety-line"><span class="mono ety-ipa">[ˈkʰviːt ˈaska]</span><button type="button" class="btn btn-ghost ety-say" data-say="hvit">▶ 跟读一遍</button></div>
        <p>异格的名字 Hvít Aska 同样是冰岛语：白色的灰烬。<b class="mono">hv</b> 在冰岛语里读作 [kv]。</p>
      </div>`;
    return `<div class="panel ety" data-reveal>
      <div class="panel-h">ETYMOLOGY <span>名字的来历</span></div>
      ${form === 'alter' ? alt + main : main + alt}
      <p class="vo-note">2010 年喷发时，这个长长的名字让全世界的新闻播报员都犯了难。</p>
    </div>`;
  }

  /* ====================================================
   * 标本柜
   * ==================================================== */
  const STONE_ART = {
    basalt: () => {
      const cols = [[14, 56], [32, 40], [50, 30], [68, 46], [86, 62]].map(([x, top], i) => `<g class="col" style="--k:${i}">
        <path d="M${x} ${top + 4} L${x + 5} ${top + 8} L${x + 13} ${top + 8} L${x + 18} ${top + 4} L${x + 18} 92 L${x} 92 Z" fill="#3b3438"/>
        <path d="M${x + 9} ${top + 8} V92" stroke="#2a2427" stroke-width="1"/>
        <path d="M${x} ${top + 4} L${x + 5} ${top} L${x + 13} ${top} L${x + 18} ${top + 4} L${x + 13} ${top + 8} L${x + 5} ${top + 8} Z" fill="#6d6468"/>
        <path d="M${x} ${top + 30} H${x + 18} M${x} ${top + 52} H${x + 18}" stroke="#2a2427" stroke-width=".8" opacity=".7"/></g>`).join('');
      return `<svg viewBox="0 0 120 100">${cols}<path d="M4 92 H116" stroke="#2a2427" stroke-width="2"/></svg>`;
    },
    obsidian: () => {
      const u = 'so' + ++uid;
      return `<svg viewBox="0 0 120 100"><defs><clipPath id="${u}"><path d="M62 6 L96 32 L88 88 L40 96 L20 46 Z"/></clipPath><linearGradient id="${u}g" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
        <path d="M62 6 L96 32 L88 88 L40 96 L20 46 Z" fill="#15121d"/>
        <path d="M62 6 L66 44 L96 32 M66 44 L88 88 M66 44 L40 96 M66 44 L20 46" fill="none" stroke="#3a3350" stroke-width="1.2"/>
        <path d="M58 14 L36 44 L50 46 Z" fill="rgba(200,220,255,.45)"/><path d="M72 50 L80 78 L72 74 Z" fill="rgba(255,160,200,.3)"/>
        <g clip-path="url(#${u})"><rect class="glint" x="-40" y="0" width="30" height="100" fill="url(#${u}g)" transform="skewX(-18)"/></g></svg>`;
    },
    bomb: () => `<svg viewBox="0 0 120 100"><path d="M14 58 C 26 40, 54 30, 80 36 C 98 40, 108 50, 114 52 C 104 57, 92 68, 72 72 C 48 76, 26 70, 14 58 Z" fill="#3b2a26"/>
      <path d="M8 60 L 16 58 M 110 50 L 118 49" stroke="#3b2a26" stroke-width="4" stroke-linecap="round"/>
      <path d="M34 48 L 44 54 L 40 62 M 56 42 L 62 52 L 58 60 L 66 64 M 78 44 L 84 54 L 94 56 M 50 66 L 60 62" fill="none" stroke="#ff7a3a" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>
      <path d="M30 50 C 46 40, 70 36, 90 42" fill="none" stroke="#6b5048" stroke-width="2" stroke-linecap="round"/></svg>`,
    pumice: () => {
      const holes = [[40, 42, 4], [56, 36, 3], [72, 44, 5], [48, 56, 3.4], [64, 60, 2.6], [82, 56, 3], [34, 56, 2.4], [58, 48, 2], [76, 32, 2.2], [88, 46, 2]]
        .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${f1(r * 0.8)}" fill="#8e8279"/>`).join('');
      return `<svg viewBox="0 0 120 100"><path d="M22 52 C 18 34, 40 22, 62 24 C 86 26, 102 38, 98 54 C 94 70, 62 76, 42 70 C 30 66, 24 60, 22 52 Z" fill="#d6cdc3" stroke="#9a8e84" stroke-width="1.5"/>${holes}</svg>`;
    },
    ash: () => {
      let specks = '';
      for (let i = 0; i < 40; i++) { const x = 18 + ((i * 37) % 84), y = 70 + ((i * 17) % 22) - Math.abs(x - 60) * 0.25; specks += `<circle cx="${x}" cy="${f1(y)}" r="${(0.6 + (i % 3) * 0.4).toFixed(1)}" fill="#6d6670"/>`; }
      return `<svg viewBox="0 0 120 100"><path d="M8 92 C 26 90, 36 62, 60 58 C 84 62, 94 90, 112 92 Z" fill="#a7a1a8"/><path d="M26 86 C 38 80, 48 68, 60 66 C 72 68, 82 80, 94 86" fill="none" stroke="#8d878f" stroke-width="1.2"/>${specks}</svg>`;
    },
    soil: () => `<svg viewBox="0 0 120 100"><rect x="14" y="14" width="92" height="80" rx="3" fill="#2d2420"/>
      <rect x="14" y="14" width="92" height="16" rx="3" fill="#3a2c22"/><path d="M14 22 C 30 18, 50 26, 70 20 S 100 24, 106 20" fill="none" stroke="#5a8f4e" stroke-width="3"/>
      <rect x="14" y="36" width="92" height="4" fill="#a7a1a8"/><rect x="14" y="50" width="92" height="3" fill="#d9d2c6"/><rect x="14" y="62" width="92" height="6" fill="#1d1a1c"/><rect x="14" y="76" width="92" height="3" fill="#a7a1a8"/>
      <g fill="#6a5a4c">${[[24, 44], [60, 46], [88, 44], [40, 58], [76, 57], [30, 72], [66, 72], [96, 84], [48, 86]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"/>`).join('')}</g></svg>`,
    flower: (alarm) => `<svg viewBox="0 0 120 100"><path d="M60 96 C 60 80, 58 66, 60 50" stroke="#6aa86a" stroke-width="3" fill="none"/><path d="M60 78 C 50 76, 44 68, 46 62 C 54 64, 58 70, 60 78 Z" fill="#8cc88c"/>
      <g transform="translate(60 38)">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="9" ry="15" transform="rotate(${a}) translate(0 -12)" fill="${alarm ? '#b8a3d8' : '#f7b8cb'}" stroke="${alarm ? '#8a6ab8' : '#e58fa8'}"/>`).join('')}<circle r="6" fill="${alarm ? '#ff8a3a' : '#ffd27a'}"/></g>
      <g transform="translate(94 76)"><circle r="13" fill="#fff" stroke="#6aa86a" stroke-width="2"/><circle r="8" fill="${alarm ? '#ff6a2a' : '#b9e3a8'}"/><circle r="3" fill="${alarm ? '#c8321a' : '#8cc88c'}"/></g>
      <path d="M62 66 L 82 72" stroke="#6aa86a" stroke-dasharray="2 3"/></svg>`,
  };
  function stoneArt(k) {
    if (k === 'flower') return `<div class="st-fly"><div class="st-fl a">${STONE_ART.flower(false)}</div><div class="st-fl b">${STONE_ART.flower(true)}</div></div>`;
    let extra = '';
    if (k === 'pumice') extra = `<i class="st-water"></i>${[0, 1, 2, 3, 4].map((i) => `<i class="st-bub" style="left:${38 + i * 6}%;animation-delay:${f1(0.5 + i * 0.22)}s"></i>`).join('')}`;
    if (k === 'ash') extra = `<i class="st-mag"><svg viewBox="0 0 60 60">${[[14, 18, 0], [34, 12, 40], [40, 34, -30], [18, 38, 70], [28, 26, 15], [46, 20, 110]].map(([x, y, r]) => `<path d="M${x} ${y} l7 -2 l3 6 l-5 7 l-6 -3 z" transform="rotate(${r} ${x} ${y})" fill="#cfd6e4" stroke="#7d86a0" stroke-width=".8"/>`).join('')}</svg></i>`;
    if (k === 'soil') extra = [22, 48, 74].map((x, i) => `<i class="st-sprout" style="left:${x}%;animation-delay:${f1(0.1 + i * 0.25)}s">${SPROUT}</i>`).join('');
    return `${extra}<div class="st-fly">${STONE_ART[k]()}</div>`;
  }
  function stonesHTML(form) {
    return `<div class="vo-stones">${V().stones[form].map((s, i) => `
      <div class="panel stone st-${s.k}" data-reveal style="--i:${i}">
        <div class="st-art">${stoneArt(s.k)}</div>
        <div class="st-body">
          <p class="mono st-en">${s.en}</p><h4>${s.t}</h4>
          <div class="st-tags">${s.tags.map(([a, b]) => `<span><i>${a}</i>${b}</span>`).join('')}</div>
          <p>${s.d}</p>
          <button type="button" class="btn btn-ghost st-btn" data-stone="${s.k}">${s.act}</button>
        </div>
      </div>`).join('')}</div>`;
  }

  /* ---- 泰拉卡片的小插画 ---- */
  const TERRA_ART = {
    '行医': '<svg viewBox="0 0 64 64"><rect x="10" y="10" width="44" height="44" rx="10" style="fill:none;stroke:var(--c-acc);stroke-width:2"/><path d="M32 20 V44 M20 32 H44" style="stroke:var(--c-acc2);stroke-width:5;stroke-linecap:round"/><circle cx="48" cy="48" r="7" style="fill:var(--c-bg);stroke:var(--c-acc3);stroke-width:2"/><path d="M48 44 C 50 47, 50 49, 48 51 C 46 49, 46 47, 48 44 Z" style="fill:var(--c-acc3)"/></svg>',
    '诊断记录': '<svg viewBox="0 0 64 64"><path d="M22 20 A 12 12 0 0 1 44 22 C 44 30, 36 31, 36 38 A 5 5 0 0 1 27 40" style="fill:none;stroke:var(--c-acc);stroke-width:2.4;stroke-linecap:round"/><path d="M29 22 A 5 5 0 0 1 38 23 C 38 26, 34 27, 34 30" style="fill:none;stroke:var(--c-acc2);stroke-width:2;stroke-linecap:round"/><path d="M8 50 H 20 L 24 42 L 30 56 L 34 46 L 38 50 H 56" style="fill:none;stroke:var(--c-muted);stroke-width:2;stroke-linejoin:round"/></svg>',
    '未竟的研究': '<svg viewBox="0 0 64 64"><rect x="14" y="8" width="36" height="48" rx="2" style="fill:var(--c-panel2);stroke:var(--c-acc);stroke-width:2"/><path d="M20 18 H 44 M20 26 H 44 M20 34 H 36" style="stroke:var(--c-muted);stroke-width:2"/><path d="M24 50 L 32 40 L 40 50 Z" style="fill:var(--c-acc3)"/><circle cx="32" cy="36" r="2" style="fill:var(--c-acc2)"/></svg>',
  };
  const terraArt = (t) => (TERRA_ART[t] || A.mini(t));
  const TERRA_ALIAS = { '天灾信使 · 纯烬': '天灾信使', '源石与天灾': '源石与火山' };

  /* ====================================================
   * 整段火山图鉴
   * ==================================================== */
  function html(form) {
    const E = V(), B = E.byForm[form];
    const other = form === 'base' ? '医疗' : '术师';
    const stage = form === 'base' ? 3 : 4;
    const feature = form === 'base'
      ? `<h3 class="sub-h" data-reveal>爆发指数 <small>VEI · 0 – 8</small></h3>${veiHTML(4)}`
      : `<h3 class="sub-h" data-reveal>灰烬的旅程 <small>ASH CLOUD · 2010</small></h3>${ashHTML(reduce ? 2 : 0)}`;
    return `<div class="wrap vo">
      <div class="panel vo-form" data-reveal>
        <div class="vo-form-h"><div><p class="mono vo-en">${B.en}</p><h3>${B.title}</h3></div><p class="vo-lead">${B.lead}</p></div>
        <div class="vo-cards">${B.cards.map((c, i) => `<div class="vo-card" style="--i:${i}"><span class="n mono">0${i + 1}</span><span class="vo-ic">${ico(c.ic)}</span><h4>${c.t}</h4><p>${c.d}</p></div>`).join('')}</div>
      </div>
      <h3 class="sub-h" data-reveal>剖面推演 <small>CROSS-SECTION · 1994 – 2010</small></h3>
      ${sectionHTML(stage)}
      ${feature}
      <p class="vo-hint" data-reveal>${form === 'base' ? '切换到「医疗」形态，看这场喷发的灰烬飘去了哪里。' : '切换到「术师」形态，看看这场喷发在爆发指数里排第几级。'}<button type="button" class="vo-hint-btn" data-act="form">切换到「${other}」</button></p>
      <div class="vo-grid2">
        ${etymHTML(form)}
        <div class="panel vo-facts" data-reveal style="--i:1">
          <div class="panel-h">FACT SHEET <span>现实中的火山</span></div>
          <dl class="facts">${E.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
          ${icelandMap()}
        </div>
      </div>
      <h3 class="sub-h" data-reveal>${form === 'base' ? '2010 · 喷发实景' : '2010 · 灰烬之下'} <small>WIKIMEDIA COMMONS</small></h3>
      <div class="vo-photos">${E.photos[form].map((ph, i) => `
        <figure class="vo-ph" data-reveal style="--i:${i}">
          <img src="${ph.src}" alt="${ph.cap}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="this.closest('figure').remove()">
          <figcaption><b>${ph.cap}</b><a href="${ph.page}" target="_blank" rel="noopener">${ph.credit}</a></figcaption>
        </figure>`).join('')}</div>
      <h3 class="sub-h" data-reveal>泰拉 · ${form === 'base' ? '天灾与源石' : '医者与信使'} <small>TERRA</small></h3>
      <div class="vo-terra">${E.terra[form].map((c, i) => `<div class="panel icard" data-reveal style="--i:${i}"><div class="art">${terraArt(TERRA_ALIAS[c.t] || c.t)}</div><div><h4>${c.t}</h4><p>${c.d}</p></div></div>`).join('')}</div>
      <h3 class="sub-h" data-reveal>标本柜 <small>SPECIMENS · ${form === 'base' ? '岩浆的形状' : '灰烬的去处'}</small></h3>
      ${stonesHTML(form)}
    </div>`;
  }

  /* ====================================================
   * 交互与闸门
   * ==================================================== */
  const st = { root: null, form: 'base', stage: 3, vei: 4, day: 0, io: null, vis: new Set(), stageT: 0, stagePlay: false, ashT: 0, ashPlay: false, ashAuto: false };

  function setStage(i, burst) {
    const S = V().stages, root = st.root;
    i = (i + S.length) % S.length;
    st.stage = i;
    const vx = $('.vx', root);
    if (!vx) return;
    vx.dataset.stage = i;
    $$('.vx-steps [data-vx]', root).forEach((b) => { const on = +b.dataset.vx === i; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('.vx-steps', root).style.setProperty('--at', i);
    $('.vx-now', root).innerHTML = stageNow(i);
    if (burst && !reduce && window.FX && i >= 1 && i <= 3) {
      const r = vx.getBoundingClientRect();
      const [px, py] = i === 1 ? [578, 252] : [400, 140];
      const x = r.left + (r.width * px) / 800, y = r.top + (r.height * py) / 520;
      if (st.form === 'base') FX.emberBurst(x, y, i === 3 ? 34 : 20, [80, 320]); else FX.ashBurst(x, y, i === 3 ? 34 : 20, [60, 260]);
    }
  }
  function stagePlay(on) {
    st.stagePlay = on;
    clearTimeout(st.stageT);
    const b = st.root && $('.vx-play', st.root);
    if (b) b.textContent = on ? '■ 停止演示' : '▶ 演示全过程';
    if (!on) return;
    setStage(0, true); // 演示全过程：总是从蓄积阶段开始
    const step = () => {
      if (!st.stagePlay) return;
      if (!st.vis.has('vx')) { st.stageT = setTimeout(step, 600); return; } // 看不见时原地等待
      if (st.stage >= V().stages.length - 1) { stagePlay(false); return; }
      setStage(st.stage + 1, true);
      st.stageT = setTimeout(step, 5200);
    };
    st.stageT = setTimeout(step, 4200);
  }

  function setVei(k) {
    st.vei = k;
    const root = st.root;
    $$('.vei-b', root).forEach((b) => { const on = +b.dataset.vei === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    const card = $('.vei-card', root);
    if (!card) return;
    // 只更新文字与变量，方块与烟柱的 transform 过渡交给合成器
    const tmp = document.createElement('div');
    tmp.innerHTML = veiCard(k);
    const keep = ['.vei-top', '.vei-dl', '.vei-cmp', '.vei-ex'];
    keep.forEach((s) => { const a = $(s, card), b = $(s, tmp); if (a && b) a.replaceWith(b); });
    const v = V().vei[k];
    const eN = Math.cbrt(VEI_VOL[k]), eR = Math.cbrt(VEI_VOL[4]), m = Math.max(eN, eR);
    $('.cube.now', card).style.setProperty('--k', (eN / m).toFixed(4));
    $('.cube.ref', card).style.setProperty('--k', (eR / m).toFixed(4));
    $('.vei-col .fill', card).style.setProperty('--h', Math.min(1, v.hk / 60).toFixed(3));
  }

  function setDay(i) {
    const days = V().ash.days, root = st.root;
    i = Math.max(0, Math.min(days.length - 1, i));
    st.day = i;
    const map = $('.ash-map', root);
    if (!map) return;
    map.dataset.day = i;
    const d = days[i];
    const closed = new Set(d.pins || []), ok = new Set(d.ok || []);
    $$('.pin', map).forEach((p) => { p.classList.toggle('on', closed.has(p.dataset.p)); p.classList.toggle('ok', ok.has(p.dataset.p)); });
    $$('.ash-tl [data-ash]', root).forEach((b) => { const on = +b.dataset.ash === i; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('.ash-tl', root).style.setProperty('--at', i);
    $('.ash-now', root).innerHTML = ashNow(i);
  }
  function ashPlay(on) {
    st.ashPlay = on;
    clearTimeout(st.ashT);
    const b = st.root && $('.ash-play', st.root);
    if (b) b.textContent = on ? '■ 暂停' : '▶ 播放灰云';
    if (!on) return;
    if (st.day >= V().ash.days.length - 1) setDay(0);
    const step = () => {
      if (!st.ashPlay) return;
      if (!st.vis.has('ash')) { st.ashT = setTimeout(step, 600); return; }
      if (st.day >= V().ash.days.length - 1) { ashPlay(false); return; }
      setDay(st.day + 1);
      st.ashT = setTimeout(step, 2600);
    };
    st.ashT = setTimeout(step, 2200);
  }

  function playStone(card) {
    if (!card) return;
    card.classList.remove('play');
    void card.offsetWidth;
    card.classList.add('play');
    clearTimeout(card._t);
    card._t = setTimeout(() => card.classList.remove('play'), card.classList.contains('st-flower') ? 3600 : 2800);
  }

  let sayT = 0;
  function say(key) {
    const w = $(`.ety-word[data-w="${key}"]`, st.root);
    if (!w) return;
    w.classList.remove('say');
    void w.offsetWidth;
    w.classList.add('say');
    clearTimeout(sayT);
    sayT = setTimeout(() => w.classList.remove('say'), 3200);
    // 系统里有冰岛语语音时顺便读出来（多数系统没有，就只做高亮）
    try {
      const vs = window.speechSynthesis && speechSynthesis.getVoices().filter((v) => /^is\b|^is-/i.test(v.lang));
      if (vs && vs.length) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(key === 'eyja' ? 'Eyjafjallajökull' : 'Hvít Aska');
        u.voice = vs[0]; u.lang = vs[0].lang; u.rate = 0.8;
        speechSynthesis.speak(u);
      }
    } catch (e) { /* 没有语音合成 */ }
  }

  function onClick(e) {
    const t = e.target;
    const vx = t.closest('[data-vx]');
    if (vx) {
      const a = vx.dataset.vx;
      if (a === 'play') { stagePlay(!st.stagePlay); return; }
      stagePlay(false);
      setStage(a === 'prev' ? st.stage - 1 : a === 'next' ? st.stage + 1 : +a, true);
      return;
    }
    const v = t.closest('[data-vei]');
    if (v) { setVei(+v.dataset.vei); return; }
    const a = t.closest('[data-ash]');
    if (a) {
      st.ashAuto = true; // 用户动过手，就不再自动播放
      if (a.dataset.ash === 'play') { ashPlay(!st.ashPlay); return; }
      ashPlay(false);
      setDay(+a.dataset.ash);
      return;
    }
    const s = t.closest('[data-stone]');
    if (s) { playStone(s.closest('.stone')); return; }
    const y = t.closest('[data-say]');
    if (y) say(y.dataset.say);
  }

  function spot(i) {
    const s = V().hotspots[i];
    if (!s || !st.root) return;
    $$('.vspot', st.root).forEach((g) => g.classList.toggle('on', +g.dataset.i === i));
    const tip = $('.vo-tip', st.root);
    if (tip) tip.innerHTML = `<b>${s.title}</b>${s.text}`;
  }

  /** 子块闸门：看不见的剖面 / 地图 / 标本暂停动画，自动播放原地等待 */
  function gate(root) {
    if (st.io) st.io.disconnect();
    st.vis.clear();
    st.io = new IntersectionObserver((ens) => ens.forEach((en) => {
      const k = en.target.dataset.gate;
      en.target.classList.toggle('anim-off', !en.isIntersecting);
      if (en.isIntersecting) st.vis.add(k); else st.vis.delete(k);
      // 灰云地图第一次进入视野时自动播放一遍
      if (k === 'ash' && en.isIntersecting && en.intersectionRatio > 0.35 && !st.ashAuto && !reduce) { st.ashAuto = true; ashPlay(true); }
    }), { rootMargin: '0px', threshold: [0, 0.4] });
    [['.vx', 'vx'], ['.ash-map', 'ash'], ['.vo-stones', 'stones'], ['.vo-iceland', 'iceland']].forEach(([sel, k]) => {
      const el = $(sel, root);
      if (el) { el.dataset.gate = k; el.classList.add('anim-off'); st.io.observe(el); }
    });
  }

  function mount(root, form) {
    st.root = root;
    st.form = form;
    stagePlay(false);
    ashPlay(false);
    st.ashAuto = false;
    if (!root._voBound) { root._voBound = true; root.addEventListener('click', onClick); }
    st.stage = form === 'base' ? 3 : 4;
    if (form === 'base') st.vei = 4; else setDay(reduce ? 2 : 0);
    gate(root);
  }

  /* ====================================================
   * 冷知识
   * ==================================================== */
  const tv = { root: null, form: 'base', filter: 'all' };
  const tvList = (form) => D.trivia.filter((t) => !t.form || t.form === form).sort((a, b) => (b.form ? 1 : 0) - (a.form ? 1 : 0));
  function triviaDesc(form) {
    const L = tvList(form), own = L.filter((t) => t.form).length;
    return `翻开卡片。${own} 张只属于「${D.forms[form].mood}」形态的她，${L.length - own} 张两种形态共有。`;
  }
  function triviaHTML(form) {
    const L = tvList(form), mood = D.forms[form].mood, own = L.filter((t) => t.form).length;
    const oF = form === 'base' ? 'alter' : 'base', oMood = D.forms[oF].mood, oOwn = D.trivia.filter((t) => t.form === oF).length;
    const hasScene = (t) => t.scene && window.SCENES && typeof SCENES[t.scene] === 'function';
    const scene = (t) => (hasScene(t) ? `<span class="tv-scene">${SCENES[t.scene]()}</span>` : `<span class="tv-ic">${ico(t.icon)}</span>`);
    return `<div class="wrap">
      <div class="tv-bar" data-reveal>
        <div class="seg tv-seg" role="group" aria-label="筛选">
          <button type="button" class="on" data-tvf="all" aria-pressed="true">全部 <b>${L.length}</b></button>
          <button type="button" data-tvf="own" aria-pressed="false">「${mood}」专属 <b>${own}</b></button>
          <button type="button" data-tvf="both" aria-pressed="false">两形态共有 <b>${L.length - own}</b></button>
        </div>
        <div class="tv-tools">
          <span class="tv-prog"><span class="tv-meter"><i></i></span><span class="mono"><b class="tv-n">0</b> / <span class="tv-of">${L.length}</span> 已翻开</span></span>
          <button type="button" class="btn btn-ghost tv-btn" data-tvx="rand">随机翻一张</button>
          <button type="button" class="btn btn-ghost tv-btn" data-tvx="all">全部翻开</button>
        </div>
      </div>
      <div class="tv-grid">${L.map((t, i) => `
        <button type="button" class="tv-card${t.form ? ' own' : ''}${hasScene(t) ? ' can-wide' : ''}" data-own="${t.form ? 1 : 0}" data-reveal style="--i:${i % 6}" aria-pressed="false" aria-label="${t.q ? t.q + ' ' : ''}${t.t}：${t.d}">
          <span class="tv-inner">
            <span class="tv-face tv-front">
              <span class="tv-wm" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
              <span class="tv-top"><small class="mono">NO.${String(i + 1).padStart(2, '0')}</small><em class="tv-tag">${t.cat || '设定'}</em></span>
              ${scene(t)}
              <span class="tv-tt"><small>${t.form ? `${mood} · 专属` : '两形态共有'}</small><h4>${t.t}</h4>${t.q ? `<span class="tv-q">${t.q}</span>` : ''}</span>
              <span class="tv-hint mono" aria-hidden="true">TAP ↻</span>
            </span>
            <span class="tv-face tv-back"><span class="tv-top"><em class="tv-tag">${t.cat || '设定'}</em><small class="mono">NO.${String(i + 1).padStart(2, '0')}</small></span><h4>${t.t}</h4><p>${t.d}</p></span>
          </span>
        </button>`).join('')}
        <div class="tv-end" data-reveal>
          <div class="tv-end-tx"><p class="mono">${L.length} CARDS · ${mood}</p><b>${form === 'base' ? '火山记下的，她也都记得。' : '灰烬落定，故事还长。'}</b><span>另一种形态那边，还有 ${oOwn} 张只属于「${oMood}」的冷知识。</span></div>
          <button type="button" class="btn btn-ghost tv-end-go" data-act="form" data-then="trivia">切换到「${oMood}」</button>
        </div>
      </div>
      <p class="tv-done" aria-live="polite"></p>
    </div>`;
  }
  /** 排版：插画卡在一行里放得下时占两格；最后一块“收尾”占满最后一行剩下的格子（按实际列数算，改尺寸时重排） */
  function tvLayout() {
    const grid = tv.root && $('.tv-grid', tv.root);
    if (!grid) return;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    if (cols === tv.cols && tv.filter === tv.laid) return;
    tv.cols = cols;
    tv.laid = tv.filter;
    let col = 0;
    for (const c of tvVisible()) {
      const wide = cols >= 3 && c.classList.contains('can-wide') && col + 2 <= cols;
      c.classList.toggle('wide', wide);
      col = (col + (wide ? 2 : 1)) % cols;
    }
    const end = $('.tv-end', grid), span = col ? cols - col : cols;
    if (end) { end.style.gridColumn = `span ${span}`; end.classList.toggle('row', span >= 3 || (span >= 2 && cols === 2)); }
  }
  const tvVisible = () => $$('.tv-card', tv.root).filter((c) => !c.classList.contains('tv-hide'));
  function tvProgress() {
    const vis = tvVisible(), n = vis.filter((c) => c.classList.contains('flip')).length;
    $('.tv-n', tv.root).textContent = n;
    $('.tv-of', tv.root).textContent = vis.length;
    $('.tv-meter i', tv.root).style.transform = `scaleX(${vis.length ? n / vis.length : 0})`;
    const allB = $('[data-tvx="all"]', tv.root);
    allB.textContent = n === vis.length && n ? '全部合上' : '全部翻开';
    return [n, vis.length];
  }
  function tvCelebrate() {
    const d = $('.tv-done', tv.root);
    d.textContent = tv.form === 'base' ? '全部翻开了——火山记下的，她也都记得。' : '全部翻开了——灰烬落定，故事还长。';
    d.classList.add('on');
    clearTimeout(d._t);
    d._t = setTimeout(() => d.classList.remove('on'), 3600);
    if (!reduce && window.FX) {
      const r = $('.tv-grid', tv.root).getBoundingClientRect();
      const x = innerWidth / 2, y = Math.min(innerHeight * 0.6, Math.max(80, r.top + r.height / 2));
      if (tv.form === 'base') FX.emberBurst(x, y, 60, [120, 460]); else FX.ashBurst(x, y, 60, [120, 460]);
    }
  }
  function flip(card, force) {
    const on = force === undefined ? !card.classList.contains('flip') : force;
    card.classList.toggle('flip', on);
    card.setAttribute('aria-pressed', on);
    if (force !== undefined) return;
    const [n, of] = tvProgress();
    if (on && n === of) tvCelebrate();
  }
  function tvFilter(f) {
    tv.filter = f;
    $$('[data-tvf]', tv.root).forEach((b) => { const on = b.dataset.tvf === f; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $$('.tv-card', tv.root).forEach((c) => c.classList.toggle('tv-hide', (f === 'own' && c.dataset.own !== '1') || (f === 'both' && c.dataset.own !== '0')));
    tvLayout();
    tvProgress();
  }
  function tvClick(e) {
    const f = e.target.closest('[data-tvf]');
    if (f) { tvFilter(f.dataset.tvf); return; }
    const x = e.target.closest('[data-tvx]');
    if (!x) return;
    const vis = tvVisible();
    if (x.dataset.tvx === 'all') {
      const open = !vis.every((c) => c.classList.contains('flip'));
      vis.forEach((c, i) => setTimeout(() => { flip(c, open); if (i === vis.length - 1) { const [n, of] = tvProgress(); if (open && n === of) tvCelebrate(); } }, reduce ? 0 : i * 45));
      return;
    }
    const pool = vis.filter((c) => !c.classList.contains('flip'));
    const c = (pool.length ? pool : vis)[(Math.random() * (pool.length || vis.length)) | 0];
    if (!c) return;
    const r = c.getBoundingClientRect();
    const off = r.top < 70 || r.bottom > innerHeight - 20;
    if (off) c.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    c.classList.add('tv-pick');
    setTimeout(() => { c.classList.remove('tv-pick'); if (!c.classList.contains('flip')) flip(c); }, off ? 520 : 120);
  }
  function triviaMount(root, form) {
    tv.root = root;
    tv.form = form;
    tv.filter = 'all';
    tv.cols = 0;
    tv.laid = null;
    if (!root._tvBound) { root._tvBound = true; root.addEventListener('click', tvClick); }
    tvLayout();
    // 列数变了（改窗口尺寸、区块第一次真正排版）就重排一次；列数没变时 tvLayout 直接返回
    if (window.ResizeObserver) {
      if (!tv.ro) tv.ro = new ResizeObserver(() => tvLayout());
      tv.ro.disconnect();
      tv.ro.observe($('.tv-grid', root));
    }
    tvProgress();
  }

  /* ====================================================
   * 页脚
   * ==================================================== */
  const SOURCES = [
    ['PRTS Wiki', 'https://prts.wiki/w/%E8%89%BE%E9%9B%85%E6%B3%95%E6%8B%89', '干员档案、数值与模组'],
    ['萌娘百科', 'https://mzh.moegirl.org.cn/%E8%89%BE%E9%9B%85%E6%B3%95%E6%8B%89', '角色资料与梗'],
    ['Arknights Wiki (wiki.gg)', 'https://arknights.wiki.gg/', '剧情人物立绘'],
    ['Wikipedia · Eyjafjallajökull', 'https://en.wikipedia.org/wiki/Eyjafjallaj%C3%B6kull', '火山概况、名字与读音'],
    ['Wikipedia · 2010 eruptions', 'https://en.wikipedia.org/wiki/2010_eruptions_of_Eyjafjallaj%C3%B6kull', '喷发经过'],
    ['Wikipedia · Air travel disruption', 'https://en.wikipedia.org/wiki/Air_travel_disruption_after_the_2010_Eyjafjallaj%C3%B6kull_eruption', '空域关闭时间线'],
    ['Wikipedia · VEI', 'https://en.wikipedia.org/wiki/Volcanic_explosivity_index', '爆发指数分级（Newhall & Self, 1982）'],
    ['Sigmundsson et al., Nature 2010', 'https://www.nature.com/articles/nature09558', '1994 / 1999 岩浆侵入'],
    ['Smithsonian GVP', 'https://volcano.si.edu/', '冰岛火山喷发记录'],
  ];
  function footerHTML(form) {
    const q = (form === 'alter' && D.meta.quoteAlter) || D.meta.quote, F = D.forms[form];
    const photos = [...V().photos.base, ...V().photos.alter];
    const seen = new Set();
    const credits = photos.filter((p) => !seen.has(p.page) && seen.add(p.page)).map((p) => `<li><a href="${p.page}" target="_blank" rel="noopener">${p.cap}</a><span>${p.credit}</span></li>`).join('');
    const lamb = window.SHEEP && SHEEP.lamb ? SHEEP.lamb(form === 'alter' ? 'pink' : 'black') : '';
    const motes = Array.from({ length: 12 }, (_, i) => { const s = 4 + (i % 3) * 2; return `<i style="left:${f1(4 + ((i * 53) % 92))}%;width:${s}px;height:${s}px;animation-duration:${f1(9 + (i % 5) * 1.7)}s;animation-delay:${f1(-i * 1.3)}s"></i>`; }).join('');
    return `<div class="ft-fx" aria-hidden="true">${motes}</div>
      <div class="wrap ft">
        <div class="ft-head" data-reveal>
          <div class="ft-emblem">${A.emblem(64)}</div>
          <p class="ft-quote">${q.text}</p>
          <p class="ft-from">—— ${q.from}</p>
          <p class="ft-sign mono"><span>${F.name}</span><i></i><span>${F.mood}</span><i></i><span>${F.moodEn}</span></p>
        </div>
        <div class="ft-grid" data-reveal style="--i:1">
          <section class="ft-col">
            <h4>关于本页</h4>
            <p>非官方同人展示页，仅供个人欣赏与学习交流，不用于任何商业用途。</p>
            <p>《明日方舟》及相关角色、立绘、语音、模型的著作权归上海鹰角网络科技有限公司（Hypergryph）所有，海外发行为悠星网络（Yostar）。</p>
            <p>故事、档案、语音与模组文字均为本页的概述改写。</p>
          </section>
          <section class="ft-col">
            <h4>资料来源</h4>
            <ul class="ft-src">${SOURCES.map(([n, u, d]) => `<li><a href="${u}" target="_blank" rel="noopener">${n}</a><span>${d}</span></li>`).join('')}</ul>
          </section>
          <section class="ft-col">
            <h4>素材与技术</h4>
            <ul class="ft-src">
              <li><span>立绘与语音经 PRTS 资源站在线加载</span></li>
              <li><span>纯烬官方动态立绘经 GitHub 镜像</span><a href="https://github.com/isHarryh/Ark-Models" target="_blank" rel="noopener">isHarryh/Ark-Models</a></li>
              <li><span>小剧场 Spine 模型来自游戏资源，由 spine-ts 3.8 渲染</span><a href="https://esotericsoftware.com/spine-runtimes-license" target="_blank" rel="noopener">Spine Runtimes License</a></li>
              <li><span>字体：Google Fonts（SIL Open Font License）</span></li>
              <li><span>徽记、法阵、小羊、章节插画、火山剖面、欧洲示意图与标本插画为本页原创绘制</span></li>
            </ul>
          </section>
          <section class="ft-col ft-photos">
            <h4>实景照片 · Wikimedia Commons</h4>
            <ul class="ft-src ft-ph">${credits}</ul>
          </section>
        </div>
        <div class="ft-bottom" data-reveal style="--i:2">
          <p class="ft-keys"><kbd>T</kbd>切换形态 <kbd>E</kbd>精英零 / 精英二 <kbd>M</kbd>环境音 <kbd>Esc</kbd>关闭预览</p>
          <div class="ft-end">
            <span class="ft-lamb ${form === 'alter' ? 'pink' : 'black'}" aria-hidden="true"><span class="ft-lamb-b">${lamb}</span><i>${form === 'alter' ? '♪' : 'z'}</i><i>${form === 'alter' ? '♪' : 'Z'}</i></span>
            <button type="button" class="ft-up" data-ft="top"><span>${form === 'base' ? '回到山顶' : '回到起点'}</span><b aria-hidden="true">↑</b></button>
          </div>
        </div>
      </div>`;
  }
  function footerMount(root) {
    if (root._ftBound) return;
    root._ftBound = true;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ft="top"]');
      if (!b) return;
      const r = b.getBoundingClientRect();
      if (!reduce && window.FX) { if (document.documentElement.dataset.form === 'base') FX.emberBurst(r.left + r.width / 2, r.top, 30, [120, 380]); else FX.ashBurst(r.left + r.width / 2, r.top, 30, [120, 380]); }
      scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  }

  return { html, mount, spot, triviaHTML, triviaDesc, triviaMount, flip, footerHTML, footerMount };
})();
