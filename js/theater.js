/* =========================================================
 * 小剧场的布景与道具（每套时装一个场景，基建 / 作战各一版）
 *
 * 结构：舞台里有两层“世界”（.tw，800×360 的世界坐标，按 xMidYMax slice 铺满墙面，地板在 y>360 处）
 *   - .th-scene：背景（一张静态 SVG）+ 会动的小部件 + 可以点的道具（按钮）
 *   - .th-fore：画在小人前面的东西（前景、灯光明暗），不接收指针
 * 会动的东西全都是独立的 HTML 小块（<i class="tl a-…">），只用 transform / opacity 做 CSS 动画——
 * 由合成器直接处理，不会让整张 SVG 每帧重绘（旧版把动画写在 SVG 内部，整张布景每帧重绘）。
 * 离屏时由 main.js 的 .anim-off 闸门统一暂停。
 *
 * 场景：scene.back / scene.fore（HTML 字符串）、props（点击道具时的效果、台词与小人的反应）、
 *       auto（自由活动时她会自己去摆弄的道具）、skill / action（作战：技能与攻击同步到布景上）
 * ========================================================= */
window.THEATER = (() => {
  'use strict';
  const D = window.EYJA || {};
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let uid = 0, hinted = false;
  const nid = (p) => `t${p}${++uid}`;
  const r1 = (n) => Math.round(n * 10) / 10;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
  const pick = (R, a) => a[(R() * a.length) | 0];

  /* ---------------------------------------------------- 画图小工具 */
  /** 独立的小 SVG（静态）；par：preserveAspectRatio */
  const svg = (w, h, body, par = 'none') => `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="${par}" aria-hidden="true" focusable="false">${body}</svg>`;
  /** 世界里的一个图层：x/y/w/h 为世界单位；cls 带动画类名；st 追加的 CSS 变量 */
  const lay = (cls, x, y, w, h, inner = '', st = '') => `<i class="tl ${cls}" style="--x:${r1(x)};--y:${r1(y)};--w:${r1(w)};--h:${r1(h)};${st}">${inner}</i>`;
  /** 同上，但内容画在自己的 w×h 坐标里 */
  const art = (cls, x, y, w, h, body, st = '') => lay(cls, x, y, w, h, svg(w, h, body), st);
  /** 可以点的道具（内容画在 w×h 坐标里；.tp-in 负责被点时的弹跳） */
  const prop = (id, label, x, y, w, h, body, cls = '', st = '') =>
    `<button type="button" class="tp ${cls}" data-prop="${id}" aria-label="${label}" title="${label}" style="--x:${r1(x)};--y:${r1(y)};--w:${r1(w)};--h:${r1(h)};${st}"><span class="tp-in"><span class="tp-b">${svg(w, h, body)}</span></span></button>`;
  /** 图层里再套一层（位置用父图层的百分比）：只用于光晕这类跟着父层开关的东西 */
  const sub = (cls, l, t, w, h, inner = '', st = '') => `<i class="ts ${cls}" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%;${st}">${inner}</i>`;
  const stop = (o, c, a) => `<stop offset="${o}" stop-color="${c}"${a == null ? '' : ` stop-opacity="${a}"`}/>`;
  const lin = (id, stops, x2 = 0, y2 = 1, extra = '') => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"${extra}>${stops.map((s) => stop(...s)).join('')}</linearGradient>`;
  const rad = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>${stops.map((s) => stop(...s)).join('')}</radialGradient>`;
  /** 四角星（闪光） */
  const spark = (x, y, s) => `M${r1(x)} ${r1(y - s)} Q${r1(x + s * 0.18)} ${r1(y - s * 0.18)} ${r1(x + s)} ${r1(y)} Q${r1(x + s * 0.18)} ${r1(y + s * 0.18)} ${r1(x)} ${r1(y + s)} Q${r1(x - s * 0.18)} ${r1(y + s * 0.18)} ${r1(x - s)} ${r1(y)} Q${r1(x - s * 0.18)} ${r1(y - s * 0.18)} ${r1(x)} ${r1(y - s)}Z`;
  /** 一团云：若干圆叠起来，底部压平 */
  function cloud(cx, cy, w, h, fill, R, extra = '') {
    let s = '';
    const n = 5 + ((R() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), x = cx - w / 2 + w * (0.12 + t * 0.76), rr = h * (0.42 + 0.35 * Math.sin(t * Math.PI)) * (0.85 + R() * 0.3);
      s += `<circle cx="${r1(x)}" cy="${r1(cy - rr * 0.35)}" r="${r1(rr)}"/>`;
    }
    s += `<rect x="${r1(cx - w * 0.44)}" y="${r1(cy - h * 0.3)}" width="${r1(w * 0.88)}" height="${r1(h * 0.3)}" rx="${r1(h * 0.15)}"/>`;
    return `<g fill="${fill}"${extra}>${s}</g>`;
  }
  /** 放射渐变的光斑图层（CSS 背景，比 SVG 便宜） */
  const glow = (cls, x, y, w, h, col, st = '') => `<i class="tl tg ${cls}" style="--x:${r1(x - w / 2)};--y:${r1(y - h / 2)};--w:${r1(w)};--h:${r1(h)};--g:${col};${st}"></i>`;

  /* ---------- 书架上的一排书 ---------- */
  function books(R, x0, x1, yb, hMax, pal, o = {}) {
    let s = '', x = x0;
    while (x < x1 - 6) {
      const w = 6 + R() * 8, h = hMax * (0.66 + R() * 0.32), c = pick(R, pal);
      if (x + w > x1) break;
      const lean = !o.noLean && R() < 0.08 && x + w + 10 < x1;
      const tr = lean ? ` transform="rotate(${r1(6 + R() * 6)} ${r1(x + w)} ${yb})"` : '';
      s += `<g${tr}><rect x="${r1(x)}" y="${r1(yb - h)}" width="${r1(w)}" height="${r1(h)}" rx=".8" fill="${c}"/>` +
        `<rect x="${r1(x)}" y="${r1(yb - h)}" width="${r1(w * 0.28)}" height="${r1(h)}" fill="#fff" opacity=".07"/>` +
        `<rect x="${r1(x + w * 0.78)}" y="${r1(yb - h)}" width="${r1(w * 0.22)}" height="${r1(h)}" fill="#000" opacity=".22"/>` +
        (R() < 0.7 ? `<path d="M${r1(x + 1)} ${r1(yb - h + 5)} h${r1(w - 2)} M${r1(x + 1)} ${r1(yb - 6)} h${r1(w - 2)}" stroke="${o.band || '#e8c27a'}" stroke-width="1" opacity=".55"/>` : '') +
        (R() < 0.45 ? `<rect x="${r1(x + w * 0.2)}" y="${r1(yb - h * 0.62)}" width="${r1(w * 0.6)}" height="${r1(h * 0.16)}" fill="#f4e6c8" opacity=".55"/>` : '') + '</g>';
      x += w + 0.8 + (lean ? 7 : 0);
    }
    return s;
  }
  /** 平放的一摞书 */
  function bookStack(R, x, yb, n, pal, wMax = 40) {
    let s = '', y = yb;
    for (let i = 0; i < n; i++) {
      const w = wMax * (0.72 + R() * 0.28), h = 5 + R() * 3, dx = (R() - 0.5) * 6, c = pick(R, pal);
      s += `<rect x="${r1(x - w / 2 + dx)}" y="${r1(y - h)}" width="${r1(w)}" height="${r1(h)}" rx="1" fill="${c}"/><path d="M${r1(x - w / 2 + dx + 2)} ${r1(y - h + 1.2)} h${r1(w - 4)}" stroke="#fff" stroke-width=".8" opacity=".2"/><rect x="${r1(x + w / 2 + dx - 3)}" y="${r1(y - h + 1)}" width="2.4" height="${r1(h - 2)}" fill="#f6ead2" opacity=".8"/>`;
      y -= h;
    }
    return s;
  }

  /* ---------- Q 版小羊（面朝左，脚底 y=0；pose：stand / sit / sleep） ---------- */
  const SHEEP = {
    black: { w0: '#6f606d', w1: '#2f272e', w2: '#141015', ol: '#0b080a', f0: '#fff6ec', f1: '#e4ccb6', h0: '#ffe0a3', h1: '#b8733a', hl: '#4b2a14', leg: '#241c22', hoof: '#070506', eye: '#2b1a1a', blush: '#ff8c78', hi: 'rgba(255,255,255,.2)' },
    pink: { w0: '#ffffff', w1: '#ffd2e2', w2: '#f39dbd', ol: '#d8739a', f0: '#ffffff', f1: '#ffe2ec', h0: '#fdf9ff', h1: '#b49de8', hl: '#7c65b6', leg: '#ec93b4', hoof: '#b95c82', eye: '#4a2a3b', blush: '#ff7fa8', hi: 'rgba(255,255,255,.85)' },
    white: { w0: '#ffffff', w1: '#f3f1ee', w2: '#d9d4d0', ol: '#8f8490', f0: '#fffaf6', f1: '#f1e2d8', h0: '#fff4dc', h1: '#c9a27a', hl: '#8a6a4a', leg: '#6d6270', hoof: '#3d343f', eye: '#3a2a34', blush: '#ff9fb0', hi: 'rgba(255,255,255,.9)' },
  };
  function sheep(C, o = {}) {
    const g = nid('sw'), f = nid('sf'), hn = nid('sh');
    const sit = o.pose === 'sit' || o.pose === 'sleep', sleep = o.pose === 'sleep';
    const dy = sit ? 5 : 0, bx = 5, by = -21 + dy, hx = -17, hy = -23 + dy - (sit ? 2 : 0) + (sleep ? 6 : 0);
    const c = (x, y, rr) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(rr)}"/>`;
    let legs;
    if (sit) {
      legs = `<g fill="none" stroke-linecap="round"><path d="M-1 -4 L-9 -1.6" stroke="${C.leg}" stroke-width="3.6"/><path d="M22 -3.2 L25.5 -.8" stroke="${C.leg}" stroke-width="3.4"/><path d="M4 -3.6 L-4.6 -.4" stroke="${C.leg}" stroke-width="3.8"/></g><circle cx="-9.4" cy="-1.5" r="1.9" fill="${C.hoof}"/><circle cx="-5" cy="-.3" r="2" fill="${C.hoof}"/>`;
    } else {
      const L = (x, dx, w) => `<path d="M${x} -9 L${x + dx} -1.5" stroke="${C.leg}" stroke-width="${w}"/><circle cx="${x + dx}" cy="-1.3" r="${r1(w / 2 + 0.15)}" fill="${C.hoof}" stroke="none"/>`;
      legs = `<g fill="none" stroke-linecap="round">${L(-3, 2.2, 3.4)}${L(15, -2.4, 3.4)}${L(-8, -2.6, 3.7)}${L(10, 2.4, 3.7)}</g>`;
    }
    const puffs = [[-15, -6, 6.8], [-8, -11, 7.4], [1, -13, 7.6], [10, -11.5, 7.4], [17, -5.5, 6.8], [18.5, 2.5, 6.4], [10, 7.5, 6.8], [0, 8.5, 7], [-9, 7.5, 6.6], [-15, 1.5, 6.4]];
    const woolC = [[bx + 24.5, by - 5, 3.8], ...puffs.map(([x, y, rr]) => [bx + x, by + y, rr])].map((a) => c(...a)).join('');
    const core = `<ellipse cx="${bx}" cy="${by}" rx="17" ry="12"/>`;
    const wool = `<g fill="${C.ol}" stroke="${C.ol}" stroke-width="3.4" stroke-linejoin="round">${core}${woolC}</g><g fill="url(#${g})">${core}${woolC}</g>`;
    const curls = `<g fill="none" stroke="${C.hi}" stroke-width="1.1" stroke-linecap="round"><path d="M${bx - 9} ${by - 6} q1.8 -2.4 3.6 0 q1.8 -2.4 3.6 0"/><path d="M${bx + 5} ${by - 1} q1.8 -2.4 3.6 0 q1.8 -2.4 3.6 0"/><path d="M${bx - 2} ${by + 5} q1.6 -2 3.2 0"/></g>`;
    const tuft = [[hx - 4.6, hy - 7.2, 3.6], [hx + 0.4, hy - 9, 4.1], [hx + 5, hy - 6.6, 3.5]].map((a) => c(...a)).join('');
    const horn = `M${hx + 2.5} ${hy - 6.5} C${hx + 8} ${hy - 14} ${hx + 17.5} ${hy - 9} ${hx + 15.2} ${hy - 1.5} C${hx + 13.6} ${hy + 3.4} ${hx + 7.4} ${hy + 2.2} ${hx + 8} ${hy - 2} C${hx + 8.4} ${hy - 4.6} ${hx + 11.2} ${hy - 5} ${hx + 12.1} ${hy - 2.8}`;
    const eyes = sleep || o.eyes === 'happy'
      ? `<path d="M${hx - 5.9} ${hy + (sleep ? 0.2 : 1.2)} q1.6 ${sleep ? 2 : -2.3} 3.2 0 M${hx + 0.7} ${hy + (sleep ? 0 : 0.9)} q1.5 ${sleep ? 1.9 : -2.2} 3 0" fill="none" stroke="${C.eye}" stroke-width="1.3" stroke-linecap="round"/>`
      : `<g fill="${C.eye}"><ellipse cx="${hx - 4.3}" cy="${hy + 0.4}" rx="1.35" ry="1.8"/><ellipse cx="${hx + 2.2}" cy="${hy + 0.2}" rx="1.3" ry="1.75"/></g><g fill="#fff"><circle cx="${hx - 4.8}" cy="${hy - 0.3}" r=".55"/><circle cx="${hx + 1.7}" cy="${hy - 0.5}" r=".5"/></g>`;
    const head =
      `<ellipse cx="${hx + 9}" cy="${hy + 1.5}" rx="4.4" ry="2.4" transform="rotate(28 ${hx + 9} ${hy + 1.5})" fill="url(#${f})" stroke="${C.ol}" stroke-width="1.4"/>` +
      `<ellipse cx="${hx}" cy="${hy}" rx="8.2" ry="9" transform="rotate(-6 ${hx} ${hy})" fill="url(#${f})" stroke="${C.ol}" stroke-width="1.6"/>` +
      `<g fill="${C.ol}" stroke="${C.ol}" stroke-width="3" stroke-linejoin="round">${tuft}</g><g fill="url(#${g})">${tuft}</g>` +
      `<path d="${horn}" fill="none" stroke="${C.hl}" stroke-width="5" stroke-linecap="round"/><path d="${horn}" fill="none" stroke="url(#${hn})" stroke-width="3.2" stroke-linecap="round"/>` +
      eyes + `<g fill="${C.blush}" opacity=".55"><ellipse cx="${hx - 6}" cy="${hy + 4.4}" rx="1.9" ry="1.1"/><ellipse cx="${hx + 4.2}" cy="${hy + 4.1}" rx="1.8" ry="1.05"/></g>` +
      `<path d="M${hx - 2.4} ${hy + 5.4} q.8 .9 1.6 0 q.8 .9 1.6 0" fill="none" stroke="${C.eye}" stroke-width=".9" stroke-linecap="round"/>` +
      (o.bow ? `<path d="M${hx - 1} ${hy - 11.5} l-4.4 -2.8 q-1 2.8 0 5.6Z M${hx - 1} ${hy - 11.5} l4.4 -2.8 q1 2.8 0 5.6Z" fill="${o.bow}" stroke="${C.ol}" stroke-width=".8"/><circle cx="${hx - 1}" cy="${hy - 11.5}" r="1.3" fill="${o.bow}" stroke="${C.ol}" stroke-width=".7"/>` : '') +
      (o.tie ? `<path d="M${hx + 1} ${hy + 8} l-4 -3 v6z M${hx + 1} ${hy + 8} l4 -3 v6z" fill="${o.tie}" stroke="${C.ol}" stroke-width=".7"/>` : '');
    const defs = `<defs><radialGradient id="${g}" cx=".36" cy=".3" r=".8">${stop(0, C.w0)}${stop(0.55, C.w1)}${stop(1, C.w2)}</radialGradient><radialGradient id="${f}" cx=".4" cy=".35" r=".75">${stop(0, C.f0)}${stop(1, C.f1)}</radialGradient><linearGradient id="${hn}" x1="0" y1="0" x2="1" y2="1">${stop(0, C.h0)}${stop(1, C.h1)}</linearGradient></defs>`;
    return `${defs}${legs}${wool}${curls}${head}`;
  }
  /** 把小羊画进一个 w×h 的格子：脚底中点落在 (w/2, h-2)，按 s 缩放，flip 朝右 */
  const sheepIn = (w, h, s, C, o = {}) => `<g transform="translate(${r1(w / 2)} ${r1(h - 2)}) scale(${o.flip ? -s : s} ${s})">${sheep(C, o)}</g>`;

  /* ---------- 小字（z z z） ---------- */
  const zPath = (x, y, s) => `M${r1(x)} ${r1(y)} h${r1(s)} l${r1(-s)} ${r1(s)} h${r1(s)}`;

  /* ====================================================================
   * 场景一 · 术师 · 默认 · 基建：夜 · 宿舍书房
   * ==================================================================== */
  function study(front) {
    const R = rng(1101);
    const id = { wall: nid('w'), pat: nid('p'), wain: nid('n'), sky: nid('s'), floor: nid('f'), rug: nid('r'), vig: nid('v'), wood: nid('d'), crater: nid('c'), moon: nid('m'), cone: nid('o'), lava: nid('l') };
    const pal = ['#8c2f45', '#a8443a', '#2f4f66', '#5b4a78', '#b8914e', '#3e6150', '#7a3b5e', '#9a5f36', '#44384f'];
    // —— 墙、护墙板、地板（静态） ——
    let floorLines = '';
    for (let i = -8; i <= 16; i++) { const xb = 400 + (i * 70 - 400) * 1.0 + 0; const xt = 400 + (xb - 400) * 0.62; floorLines += `<path d="M${r1(xt)} 360 L${r1(xb)} 470"/>`; }
    [372, 388, 410, 440].forEach((y, i) => { floorLines += `<path d="M0 ${y} H800" opacity="${0.5 + i * 0.12}"/>`; });
    const wainPanels = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<rect x="${i * 92 + 6}" y="282" width="80" height="56" rx="2"/>`).join('');
    // 窗外：星、月、远山与火山
    let stars = '';
    for (let i = 0; i < 34; i++) stars += `<circle cx="${r1(514 + R() * 148)}" cy="${r1(56 + R() * 100)}" r="${r1(0.35 + R() * 0.9)}" opacity="${r1(0.35 + R() * 0.6)}"/>`;
    const back = svg(800, 470, `<defs>
      ${lin(id.wall, [[0, '#301726'], [0.7, '#241120'], [1, '#1b0c16']])}
      <pattern id="${id.pat}" width="40" height="44" patternUnits="userSpaceOnUse"><path d="${spark(20, 22, 4.5)}" fill="#ffa3c0" opacity=".075"/><path d="M0 0 V44 M40 0 V44" stroke="#fff" stroke-opacity=".025" stroke-width="10"/><circle cx="0" cy="0" r="1.4" fill="#ffc9a0" opacity=".08"/><circle cx="40" cy="44" r="1.4" fill="#ffc9a0" opacity=".08"/></pattern>
      ${lin(id.wain, [[0, '#3c1c28'], [1, '#26111a']])}
      ${lin(id.sky, [[0, '#070a22'], [0.55, '#1d1640'], [0.85, '#4a1d42'], [1, '#6e2640']])}
      ${lin(id.floor, [[0, '#2a151b'], [0.35, '#3a1d22'], [1, '#1a0b10']])}
      ${rad(id.rug, [[0, '#6b2a3f'], [0.62, '#5a2135'], [0.64, '#c9955a'], [0.68, '#4a1a2c'], [0.9, '#3c1524'], [0.92, '#b8844c'], [0.95, '#321220'], [1, '#321220', 0]])}
      ${rad(id.vig, [[0.55, '#000', 0], [1, '#05020a', 0.55]], ' cx=".5" cy=".42" r=".75"')}
      ${lin(id.wood, [[0, '#5a3130'], [1, '#3a1d1f']])}
      ${rad(id.crater, [[0, '#ffd28a', 0.95], [0.35, '#ff7a3a', 0.55], [1, '#ff5a2a', 0]])}
      ${rad(id.moon, [[0, '#fff6dc', 0.5], [1, '#fff6dc', 0]])}
      ${lin(id.lava, [[0, '#ffe7a8'], [0.4, '#ff8a3d'], [1, '#b8262a']])}
    </defs>
    <rect width="800" height="360" fill="url(#${id.wall})"/>
    <rect width="800" height="270" fill="url(#${id.pat})"/>
    <!-- 窗外（墙洞里先画夜空） -->
    <rect x="512" y="52" width="152" height="176" fill="url(#${id.sky})"/>
    <g fill="#fff">${stars}</g>
    <circle cx="630" cy="84" r="30" fill="url(#${id.moon})"/>
    <path d="M630 70 a14 14 0 1 0 11 22 a11 11 0 1 1 -11 -22z" fill="#fff4d6"/>
    <path d="M512 196 C540 184 556 188 574 180 C590 174 606 182 626 176 C642 172 654 178 664 174 V228 H512Z" fill="#1d1230"/>
    <circle cx="592" cy="168" r="44" fill="url(#${id.crater})"/>
    <path d="M512 228 L548 204 C566 190 578 176 586 168 L600 168 C612 180 630 196 664 214 V228Z" fill="#120a19"/>
    <path d="M586 168 L600 168" stroke="#ffb46a" stroke-width="2"/>
    <path d="M590 169 C586 182 578 194 566 208 M596 169 C600 184 610 196 624 206" fill="none" stroke="url(#${id.lava})" stroke-width="1.8" stroke-linecap="round" opacity=".9"/>
    <!-- 窗框、窗台 -->
    <g>
      <rect x="500" y="40" width="176" height="200" fill="none" stroke="#4b2a2c" stroke-width="12"/>
      <rect x="506" y="46" width="164" height="188" fill="none" stroke="#6a3b39" stroke-width="2"/>
      <path d="M588 52 V228 M512 140 H664" stroke="#4b2a2c" stroke-width="6"/>
      <path d="M588 52 V228 M512 140 H664" stroke="#7a4643" stroke-width="1.2" opacity=".6"/>
      <path d="M520 60 L548 60 L520 96Z M596 60 L612 60 L596 84Z" fill="#fff" opacity=".05"/>
      <rect x="490" y="236" width="196" height="10" rx="2" fill="url(#${id.wood})"/><rect x="490" y="236" width="196" height="2" fill="#8a5450" opacity=".7"/>
      <rect x="494" y="246" width="188" height="6" fill="#000" opacity=".25"/>
    </g>
    <!-- 窗帘杆 -->
    <rect x="466" y="28" width="246" height="6" rx="3" fill="#b88a4a"/><circle cx="466" cy="31" r="5.5" fill="#d8a95a"/><circle cx="712" cy="31" r="5.5" fill="#d8a95a"/>
    <!-- 软木板：地震记录纸、地图、照片 -->
    <g>
      <rect x="322" y="70" width="150" height="104" rx="3" fill="#8a6446"/><rect x="326" y="74" width="142" height="96" fill="#a47a52"/>
      <g fill="#8e6644" opacity=".5">${Array.from({ length: 60 }, () => `<circle cx="${r1(328 + R() * 138)}" cy="${r1(76 + R() * 92)}" r="${r1(0.5 + R() * 0.9)}"/>`).join('')}</g>
      <g transform="rotate(-3 368 104)"><rect x="334" y="84" width="70" height="44" fill="#efe4cf"/><path d="M338 106 l6 0 l3 -9 l4 18 l4 -14 l3 8 l5 -3 l4 2 l3 -12 l4 20 l3 -8 l6 0 l4 -2 l6 1" fill="none" stroke="#c0395a" stroke-width="1.2"/><path d="M338 92 h40 M338 122 h56" stroke="#8a7a6a" stroke-width=".7" opacity=".6"/></g>
      <g transform="rotate(4 436 110)"><rect x="412" y="84" width="48" height="56" fill="#e2dccb"/><path d="M416 128 C424 112 432 118 438 104 C444 96 452 100 456 92" fill="none" stroke="#7a8a6a" stroke-width="1.2"/><path d="M420 96 C428 94 432 100 440 98" fill="none" stroke="#5a7a9a" stroke-width="1"/><circle cx="440" cy="106" r="5" fill="none" stroke="#c0395a" stroke-width="1.4"/><path d="M436 102 l8 8 M444 102 l-8 8" stroke="#c0395a" stroke-width="1"/></g>
      <g transform="rotate(-6 360 150)"><rect x="340" y="134" width="40" height="32" fill="#f6f1e6"/><rect x="343" y="137" width="34" height="22" fill="#3a3040"/><circle cx="360" cy="152" r="7" fill="#2a2228"/><circle cx="354" cy="148" r="4" fill="#fff6ec"/></g>
      <g transform="rotate(3 420 156)"><rect x="396" y="146" width="52" height="20" fill="#f3d27a"/><path d="M400 152 h40 M400 158 h30" stroke="#6a4a2a" stroke-width=".8" opacity=".6"/></g>
      <g fill="#e8414e"><circle cx="368" cy="86" r="2.4"/><circle cx="436" cy="87" r="2.4"/><circle cx="360" cy="137" r="2.2"/></g><circle cx="420" cy="148" r="2.2" fill="#4a8ae8"/>
    </g>
    <!-- 护墙板、腰线、踢脚线 -->
    <rect y="270" width="800" height="90" fill="url(#${id.wain})"/>
    <g fill="none" stroke="#4d2535" stroke-width="2">${wainPanels}</g>
    <g fill="none" stroke="#150810" stroke-width="1" opacity=".6" transform="translate(1 1)">${wainPanels}</g>
    <rect y="262" width="800" height="10" fill="#4d2733"/><rect y="262" width="800" height="2" fill="#7a4250" opacity=".7"/><rect y="271" width="800" height="2" fill="#000" opacity=".3"/>
    <rect y="346" width="800" height="14" fill="#1b0c12"/><rect y="346" width="800" height="1.5" fill="#5a3040" opacity=".7"/>
    <!-- 书桌（窗下） -->
    <g>
      <rect x="468" y="262" width="12" height="98" fill="#2e1618"/><rect x="662" y="262" width="12" height="98" fill="#2e1618"/>
      <rect x="480" y="266" width="182" height="40" fill="#3a1d20"/><rect x="560" y="276" width="44" height="18" rx="2" fill="#4a2628"/><rect x="576" y="284" width="12" height="3" rx="1.5" fill="#d8a95a"/>
      <rect x="458" y="250" width="226" height="14" rx="2" fill="url(#${id.wood})"/><rect x="458" y="250" width="226" height="2.5" rx="1" fill="#8e5a52" opacity=".8"/>
      <path d="M470 257 h40 M530 259 h60 M610 256 h50" stroke="#2e1618" stroke-width=".8" opacity=".6"/>
      <!-- 桌上：摊开的笔记、墨水瓶、羽毛笔、马克杯 -->
      <path d="M520 250 L524 242 C534 239 546 239 556 242 C566 239 578 239 588 242 L592 250Z" fill="#efe2c8"/><path d="M556 242 V250" stroke="#8a6a5a" stroke-width=".8"/>
      <path d="M528 245 h22 M530 247.5 h18 M562 245 h22 M562 247.5 h16" stroke="#8a6a5a" stroke-width=".6" opacity=".7"/>
      <rect x="600" y="240" width="10" height="10" rx="2" fill="#20242e"/><rect x="602" y="237" width="6" height="4" fill="#3a3a44"/>
      <path d="M606 238 C612 226 620 218 630 212" stroke="#f4ecdc" stroke-width="1.6" fill="none"/><path d="M618 222 c4 -4 8 -6 12 -10 c-2 5 -6 8 -12 10z" fill="#f4ecdc"/>
      <rect x="492" y="232" width="16" height="18" rx="3" fill="#e9e2d6"/><path d="M508 236 q7 2 0 9" fill="none" stroke="#e9e2d6" stroke-width="2.4"/><rect x="492" y="236" width="16" height="3" fill="#c0395a"/>
    </g>
    <!-- 书架（左） -->
    <g>
      <rect x="110" y="18" width="198" height="12" rx="2" fill="#4d2a2c"/><rect x="110" y="18" width="198" height="2.5" fill="#7a4643" opacity=".8"/>
      <rect x="118" y="28" width="182" height="332" fill="#3b1f22"/><rect x="128" y="38" width="162" height="306" fill="#170a0f"/>
      <rect x="128" y="38" width="162" height="306" fill="url(#${id.vig})" opacity=".6"/>
      ${[104, 176, 248, 320].map((y) => `<rect x="128" y="${y}" width="162" height="8" fill="#54302f"/><rect x="128" y="${y}" width="162" height="1.6" fill="#8a5450" opacity=".8"/><rect x="128" y="${y + 8}" width="162" height="4" fill="#000" opacity=".35"/>`).join('')}
      ${books(R, 132, 248, 104, 58, pal)}
      <g transform="translate(252 104)"><rect x="0" y="-10" width="36" height="10" rx="3" fill="#d9c7a6"/><rect x="4" y="-20" width="30" height="10" rx="3" fill="#c9b08a" transform="rotate(-6 19 -15)"/><path d="M2 -5 h32" stroke="#8a6a4a" stroke-width=".7"/></g>
      ${books(R, 132, 238, 176, 56, pal)}
      ${books(R, 132, 160, 248, 54, pal, { noLean: true })}
      ${bookStack(R, 277, 248, 4, pal, 22)}
      ${books(R, 132, 196, 320, 56, pal, { noLean: true })}${books(R, 212, 288, 320, 56, pal)}
      <rect x="132" y="330" width="72" height="12" rx="2" fill="#4a2628"/><rect x="212" y="330" width="74" height="12" rx="2" fill="#4a2628"/><circle cx="168" cy="336" r="2" fill="#d8a95a"/><circle cx="249" cy="336" r="2" fill="#d8a95a"/>
      <rect x="118" y="28" width="10" height="332" fill="#4a2729"/><rect x="290" y="28" width="10" height="332" fill="#2c1517"/>
    </g>
    <!-- 远处墙角（超宽屏才看得到）：盆栽与画 -->
    <g opacity=".85">
      <rect x="722" y="96" width="54" height="70" fill="#3a2028"/><rect x="727" y="101" width="44" height="60" fill="#5a2a3a"/><path d="M727 150 L744 126 L752 134 L771 112 V161 H727Z" fill="#2a1420"/><circle cx="758" cy="116" r="4" fill="#ff9a5a" opacity=".8"/>
      <path d="M740 360 L736 318 H770 L766 360Z" fill="#6a3a34"/><path d="M752 318 C740 296 722 290 716 272 M754 318 C756 290 770 276 786 270 M753 318 C750 300 752 280 744 262" stroke="#3e5a40" stroke-width="3" fill="none"/>
      <g fill="#4f7a52"><ellipse cx="718" cy="276" rx="10" ry="4" transform="rotate(-30 718 276)"/><ellipse cx="784" cy="272" rx="10" ry="4" transform="rotate(20 784 272)"/><ellipse cx="744" cy="264" rx="9" ry="4" transform="rotate(-70 744 264)"/><ellipse cx="770" cy="286" rx="9" ry="3.6" transform="rotate(10 770 286)"/></g>
      <g transform="translate(40 150)"><circle r="26" fill="#2f4f66"/><path d="M-16 -12 C-6 -18 4 -8 12 -14 C16 -2 6 4 14 12 C2 18 -8 8 -18 10 C-22 0 -12 -2 -16 -12Z" fill="#6a8a5a"/><ellipse rx="30" ry="6" fill="none" stroke="#c9a35a" stroke-width="2" transform="rotate(-20)"/><path d="M0 26 V74 M-16 74 H16" stroke="#6a4a3a" stroke-width="4"/></g>
    </g>
    <!-- 地板：透视木条 + 圆地毯 -->
    <rect y="360" width="800" height="110" fill="url(#${id.floor})"/>
    <g stroke="#140709" stroke-width="1.2" opacity=".5">${floorLines}</g>
    <rect y="360" width="800" height="6" fill="#000" opacity=".35"/>
    <ellipse cx="404" cy="404" rx="250" ry="34" fill="url(#${id.rug})"/>
    <ellipse cx="404" cy="404" rx="160" ry="21" fill="none" stroke="#d8a95a" stroke-width="1" stroke-dasharray="3 5" opacity=".6"/>
    <!-- 窗投在地上的月光 -->
    <path d="M520 362 L660 362 L720 460 L520 460Z" fill="#9ab4ff" opacity=".045"/>`);

    // —— 会动的部件 ——
    let mv = '';
    // 星星闪烁
    [[540, 70, 4.5], [566, 98, 3], [612, 62, 3.6], [652, 118, 3], [528, 122, 2.8], [604, 110, 2.6]].forEach(([x, y, s], i) => {
      mv += art('a-tw', x - s, y - s, s * 2, s * 2, `<path d="${spark(s, s, s)}" fill="#fff6dc"/>`, `--d:${r1(2.4 + i * 0.5)}s;--dl:${r1(-i * 0.9)}s`);
    });
    // 流星（很久才划过一次）
    mv += art('a-shoot', 620, 58, 36, 14, `<path d="M36 0 L0 14" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".9"/><circle cx="36" cy="0" r="1.6" fill="#fff"/>`, '--d:13s;--dl:-4s;--dx:-160%;--dy:120%');
    // 火山口的光：呼吸
    mv += glow('a-pulse', 594, 170, 70, 46, 'rgba(255,150,80,.55)', '--d:4.2s;--o0:.35;--o1:1');
    // 烟：几团慢慢升起、散开
    for (let i = 0; i < 3; i++) mv += art('a-smoke', 574 + i * 4, 120 - i * 6, 46, 40, cloud(23, 30, 40, 22, '#5d4a66', rng(7 + i)), `--d:9s;--dl:${-i * 3}s;--dx:40%;--dy:-70%;--o1:.55`);
    // 窗帘（盖住窗框两侧），微微摆动
    const drape = (flip) => {
      const g = nid('dr');
      return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#4a1024')}${stop(0.25, '#8a2440')}${stop(0.45, '#5a1428')}${stop(0.7, '#9a2c48')}${stop(1, '#4a1024')}</linearGradient></defs>` +
        `<path d="${flip ? 'M48 0 C36 70 40 150 28 240 L0 240 C6 150 6 70 0 0Z' : 'M0 0 C12 70 8 150 20 240 L48 240 C42 150 42 70 48 0Z'}" fill="url(#${g})"/>` +
        `<path d="${flip ? 'M40 4 C30 80 34 160 22 236' : 'M8 4 C18 80 14 160 26 236'}" stroke="#2a0612" stroke-width="1.4" fill="none" opacity=".5"/>` +
        `<path d="${flip ? 'M8 150 q14 6 34 -2' : 'M6 150 q20 8 34 -2'}" stroke="#d8a95a" stroke-width="3" fill="none"/><circle cx="${flip ? 10 : 38}" cy="152" r="3.5" fill="#e8b85a"/>`;
    };
    mv += art('a-sway', 470, 30, 48, 240, drape(false), '--d:7s;--r0:-.6deg;--r1:.8deg;--ox:50%;--oy:0%');
    mv += art('a-sway', 660, 30, 48, 240, drape(true), '--d:8s;--dl:-3s;--r0:.6deg;--r1:-.8deg;--ox:50%;--oy:0%');
    // 马克杯的热气
    for (let i = 0; i < 2; i++) mv += art('a-steam', 492 + i * 6, 204, 12, 30, `<path d="M6 30 C0 22 12 16 6 8 C3 4 6 1 6 0" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".5"/>`, `--d:3.2s;--dl:${-i * 1.6}s`);
    // 台灯：灯罩 + 光锥 + 桌面光斑（整组一起开关；光本身轻轻闪）
    const lampLight = `<defs>${lin(id.cone, [[0, '#ffe6a8', 0.5], [1, '#ffd27a', 0]])}</defs><path d="M86 30 L20 110 L170 110 L112 30Z" fill="url(#${id.cone})"/>`;
    mv += `<i class="tl lamp-on" style="--x:520;--y:170;--w:190;--h:110">${sub('tg a-flick', -30, -60, 160, 200, '', '--g:rgba(255,205,130,.42);--d:5.5s')}${svg(190, 110, lampLight)}</i>`;
    // 飘在光里的灰尘
    for (let i = 0; i < 7; i++) mv += art('a-mote lamp-on', 560 + R() * 90, 196 + R() * 50, 16, 16, `<circle cx="8" cy="8" r="${r1(0.7 + R() * 0.7)}" fill="#fff0c4"/>`, `--d:${r1(5 + R() * 4)}s;--dl:${r1(-R() * 8)}s;--dx:${r1(-60 + R() * 120)}%;--dy:${r1(-120 - R() * 120)}%`);

    // —— 道具 ——
    const lampSvg = `<ellipse cx="40" cy="104" rx="20" ry="4.6" fill="#2a1a1c"/><rect x="24" y="96" width="32" height="8" rx="3" fill="#6a4a3a"/>` +
      `<path d="M40 96 L52 58 L28 30" fill="none" stroke="#2a1a1c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 96 L52 58 L28 30" fill="none" stroke="#a88070" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="52" cy="58" r="3.6" fill="#6a4a3a"/>` +
      `<g transform="rotate(32 28 30)"><path d="M18 30 Q28 16 38 30" fill="#6a4a3a"/><path d="M10 30 L46 30 L54 50 L2 50Z" fill="#c0395a" stroke="#6a1428" stroke-width="1.2"/><path d="M12 33 L6 47" stroke="#fff" stroke-width="1.3" opacity=".35"/><ellipse cx="28" cy="50" rx="26" ry="4" fill="#fff2c4" class="lamp-bulb"/><path d="M2 50 L54 50" stroke="#e8b85a" stroke-width="1.6"/></g>`;
    let props = prop('lamp', '台灯', 592, 150, 80, 110, lampSvg, 'hint', '--hx:30%;--hy:30%');
    // 书架上睡觉的小黑羊（被碰了会发烫）
    const shSheep = `<g class="heat">${glowSvg(40, 30, 38, 26, '#ff6a3a')}</g>${sheepIn(80, 56, 1.25, SHEEP.black, { pose: 'sleep' })}`;
    props += prop('sheep', '书架上的小黑羊', 182, 196, 80, 56, shSheep, 'hint breathe', '--hx:40%;--hy:10%');
    // 小黑羊头上的 z
    [[190, 212, 6], [180, 202, 7.5], [168, 190, 9]].forEach(([x, y, s], i) => {
      mv += art('a-z zz', x, y, s + 3, s + 3, `<path d="${zPath(1.5, 1.5, s)}" stroke="#ffb0c8" stroke-width="1.6" fill="none" stroke-linejoin="round"/>`, `--d:3.6s;--dl:${r1(i * 1.2)}s`);
    });
    // 装着火山岩样本的玻璃罐
    const jar = `<g class="heat">${glowSvg(20, 34, 22, 20, '#ff8a3a')}</g><rect x="4" y="12" width="32" height="40" rx="6" fill="#fff" fill-opacity=".1" stroke="#ffc0d0" stroke-opacity=".45" stroke-width="1.4"/><rect x="7" y="6" width="26" height="8" rx="2" fill="#7a4a3a"/><path d="M12 48 L16 34 L22 30 L28 36 L30 48Z" fill="#241418" stroke="#ff8a3d" stroke-width="1"/><path d="M17 38 l4 4 l3 -5 l3 6" stroke="#ff9a4a" stroke-width="1" fill="none"/><path d="M8 18 V44" stroke="#fff" stroke-width="1.5" opacity=".3"/>`;
    props += prop('jar', '火山岩样本', 244, 122, 40, 56, jar);
    // 露出半截的红皮书
    const bk = `<rect x="2" y="2" width="15" height="58" rx="1.2" fill="#b0283e" stroke="#4a0c18" stroke-width="1"/><path d="M4 8 h11 M4 54 h11" stroke="#e8c27a" stroke-width="1.2"/><rect x="5" y="22" width="9" height="12" fill="#f4e6c8" opacity=".75"/><path d="M9.5 25 l-2 5 h4z" fill="#b0283e"/>`;
    props += prop('book', '一本红皮笔记', 198, 260, 19, 62, bk, 'hint', '--hx:50%;--hy:20%');
    // 窗外的火山
    props += `<button type="button" class="tp tp-area" data-prop="volcano" aria-label="窗外发光的火山" title="窗外发光的火山" style="--x:520;--y:150;--w:140;--h:76"></button>`;

    // —— 前景：地上的书堆、关灯后的暗 ——
    const fore = art('', 560, 326, 76, 52, `${bookStack(rng(9), 38, 52, 5, pal, 58)}<ellipse cx="38" cy="51" rx="34" ry="3" fill="#000" opacity=".3"/>`) +
      `<i class="tl dim" style="--x:0;--y:0;--w:800;--h:470">${svg(800, 470, `<defs>${rad(id.vig + 'd', [[0, '#0a0620', 0.1], [0.35, '#0a0620', 0.55], [1, '#05030f', 0.8]], ' cx=".735" cy=".32" r=".8"')}</defs><rect width="800" height="470" fill="url(#${id.vig}d)"/>`)}</i>` +
      `<i class="tl moonlit" style="--x:0;--y:0;--w:800;--h:470">${svg(800, 470, `<path d="M512 52 L664 52 L760 470 L430 470Z" fill="#8aa8ff" opacity=".07"/>`)}</i>`;

    return {
      id: 'study', place: '宿舍书房', time: '夜', cls: 'sc-study',
      cap: '书页、台灯、窗外远远发着光的山。',
      hint: '点点台灯、书架上的小黑羊和窗外的火山',
      back: `${lay('', 0, 0, 800, 470, back)}${mv}${props}`,
      fore,
      auto: ['lamp', 'sheep', 'book', 'jar'],
      props: {
        lamp: { react: 'Interact', run(t) { const off = t.toggle('lamp-off'); t.sfx('tick'); t.say(off ? '关上台灯——窗外的山亮了起来。' : '台灯亮了。再读一会儿就睡。', 'lamp'); } },
        sheep: {
          react: 'Interact',
          run(t, el) {
            t.pulse('hot', 2600);
            t.burst('ember', el, 14);
            t.say(pick(Math.random, ['小心！它一高兴，身体就会变得滚烫——', '不戴隔热手套，会被烫伤的哦。', '妈妈留给我的小羊。它最爱睡觉了。']), 'sheep');
          },
        },
        jar: { react: 'Interact', run(t, el) { t.pulse('jar-hot', 2200); t.burst('ember', el, 8); t.say('采回来的火山岩，摸上去还有一点温度。', 'jar'); } },
        book: {
          react: 'Sit',
          run(t) { t.kick('book', 'pull'); t.sfx('whoosh'); t.say(pick(Math.random, ['借来的天灾研究笔记——其实早就全部读完了。', '再读一章……就一章。', '这一页的数据，要记给前辈看。']), 'book'); },
        },
        volcano: { walk: false, run(t, el) { t.pulse('erupt', 2400); t.burst('ember', el, 10, 0.4); t.sfx('boom'); t.say('远处的山在发光……今晚也要记下来。', 'volcano'); } },
      },
      // 她睡着的时候，房间暗一点
      action(a, t) { t.toggle('dozing', a.id === 'Sleep'); },
    };
  }
  /* ---------- 作战：脚下的法阵（攻击 / 技能时亮起；术师粉焰、医疗是六边形的治疗阵） ---------- */
  function rune(form) {
    const alt = form === 'alter';
    const col = alt ? '#7fe0c0' : '#ff7aa8', col2 = alt ? '#a8d8ff' : '#ffb070';
    let ticks = '';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, x = 100 + Math.cos(a) * 84, y = 22 + Math.sin(a) * 15;
      ticks += i % 3 ? `<circle cx="${r1(x)}" cy="${r1(y)}" r=".9"/>` : `<path d="M${r1(x - 2)} ${r1(y)} h4 M${r1(x)} ${r1(y - 1.4)} v2.8"/>`;
    }
    const hex = alt ? `<path d="${[0, 1, 2, 3, 4, 5, 0].map((i, k) => { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; return `${k ? 'L' : 'M'}${r1(100 + Math.cos(a) * 60)} ${r1(22 + Math.sin(a) * 11)}`; }).join(' ')}" fill="none" stroke="${col2}" stroke-width="1.2"/>` : `<path d="${[0, 2, 4, 1, 3, 0].map((i, k) => { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; return `${k ? 'L' : 'M'}${r1(100 + Math.cos(a) * 60)} ${r1(22 + Math.sin(a) * 11)}`; }).join(' ')}" fill="none" stroke="${col2}" stroke-width="1.1"/>`;
    const body = `<g fill="none" stroke="${col}" stroke-width="1.6"><ellipse cx="100" cy="22" rx="92" ry="17"/><ellipse cx="100" cy="22" rx="76" ry="14" stroke-dasharray="6 4"/><ellipse cx="100" cy="22" rx="44" ry="8" stroke="${col2}"/></g><g fill="${col}" stroke="${col}" stroke-width="1">${ticks}</g>${hex}`;
    return `<i class="tl rune" style="--x:300;--y:348;--w:200;--h:44">${sub('tg rune-glow', -10, -40, 120, 180, '', `--g:${alt ? 'rgba(120,230,190,.45)' : 'rgba(255,120,160,.5)'}`)}${svg(200, 44, body)}</i>`;
  }
  /** 熔岩弹：平时藏着，.erupt 时沿抛物线飞出去 */
  const bombs = (x, y, list, col = '#ffb050') => list.map(([bx, by, bz, s, dl], i) => lay('bomb', x - s / 2, y - s / 2, s, s, svg(10, 10, `<circle cx="5" cy="5" r="4.2" fill="${col}"/><circle cx="4" cy="4" r="1.8" fill="#fff4c8"/>`), `--bx:${bx}%;--by:${by}%;--bz:${bz}%;--dl:${dl || i * 0.08}s`)).join('');

  /* ====================================================================
   * 场景二 · 术师 · 默认 · 作战：黄昏 · 火山地带
   * ==================================================================== */
  function dusk() {
    const R = rng(2203);
    const id = { sky: nid('s'), sun: nid('u'), vol: nid('v'), lava: nid('l'), crater: nid('c'), ground: nid('g'), plume: nid('p'), haze: nid('h') };
    let stars = '';
    for (let i = 0; i < 26; i++) stars += `<circle cx="${r1(R() * 800)}" cy="${r1(6 + R() * 110)}" r="${r1(0.4 + R() * 0.9)}" opacity="${r1(0.3 + R() * 0.6)}"/>`;
    // 地上的玄武岩：不规则的裂缝网（在地面坐标里随机游走，再投影成透视），缝里透着光
    const proj = (u, v) => `${r1(400 + (u * 800 - 400) * (0.62 + 0.38 * v))} ${r1(360 + 110 * Math.pow(clamp(v, 0, 1), 1.25))}`;
    let cracks = '', seams = '';
    for (let i = 0; i < 34; i++) {
      let u = R() * 1.3 - 0.15, v = 0.1 + R() * 0.85, a = R() * Math.PI * 2;
      let d = `M${proj(u, v)}`;
      const n = 3 + ((R() * 5) | 0);
      for (let k = 0; k < n; k++) {
        a += (R() - 0.5) * 1.5; u += Math.cos(a) * 0.04; v += Math.sin(a) * 0.13;
        if (v < 0.06 || v > 1) { a = -a; v = clamp(v, 0.06, 1); } // 碰到远处的地平线就折回来，别贴着它画出一道横线
        d += ` L${proj(u, v)}`;
        if (R() < 0.18) { const b = a + (R() < 0.5 ? 1 : -1) * (0.8 + R() * 0.6); d += ` M${proj(u, v)} L${proj(u + Math.cos(b) * 0.03, clamp(v + Math.sin(b) * 0.1, 0, 1))} M${proj(u, v)}`; }
      }
      (i < 8 ? (seams += `<path d="${d}"/>`) : (cracks += `<path d="${d}"/>`));
    }
    const pools = [[0.18, 0.55, 26], [0.74, 0.35, 20], [0.9, 0.8, 30], [0.42, 0.9, 22]].map(([u, v, w]) => { const [x, y] = proj(u, v).split(' ').map(Number); return `<ellipse cx="${x}" cy="${y}" rx="${r1(w * (0.62 + 0.38 * v))}" ry="${r1(w * 0.18 * (0.5 + v))}" fill="#ff8a3a" opacity=".35"/><ellipse cx="${x}" cy="${y}" rx="${r1(w * 0.5 * (0.62 + 0.38 * v))}" ry="${r1(w * 0.08 * (0.5 + v))}" fill="#ffd28a" opacity=".6"/>`; }).join('');
    const plume = [[600, 96, 26], [586, 74, 30], [618, 66, 28], [598, 44, 34], [636, 36, 30], [568, 40, 26], [612, 14, 38], [650, 8, 30], [574, 10, 32], [680, 22, 24], [548, 22, 22]];
    const back = svg(800, 470, `<defs>
      ${lin(id.sky, [[0, '#12081a'], [0.35, '#3a1230'], [0.62, '#8a2c38'], [0.82, '#d8603a'], [1, '#ffb070']])}
      ${rad(id.sun, [[0, '#fff2c8', 1], [0.25, '#ffc070', 0.8], [1, '#ff7040', 0]])}
      ${lin(id.vol, [[0, '#3a1520'], [0.5, '#24101a'], [1, '#160a10']])}
      ${lin(id.lava, [[0, '#fff0b8'], [0.3, '#ffa040'], [1, '#c8261c']])}
      ${rad(id.crater, [[0, '#ffe7a0', 1], [0.3, '#ff8a3a', 0.7], [1, '#ff5020', 0]])}
      ${lin(id.ground, [[0, '#2a1016'], [1, '#0e0508']])}
      ${lin(id.plume, [[0, '#2e2230'], [0.7, '#4a3440'], [1, '#8a4a3a']])}
      ${lin(id.haze, [[0, '#c0503a', 0], [1, '#ff9a5a', 0.35]])}
    </defs>
    <rect width="800" height="360" fill="url(#${id.sky})"/>
    <g fill="#ffd8c0">${stars}</g>
    <circle cx="170" cy="236" r="120" fill="url(#${id.sun})" opacity=".55"/>
    <circle cx="170" cy="236" r="30" fill="#ffe0a0" opacity=".9"/>
    <path d="M0 238 C60 226 110 234 160 224 C220 212 270 226 330 218 C380 212 420 226 470 222 L470 360 H0Z" fill="#6a2436" opacity=".75"/>
    <path d="M0 262 C70 250 130 258 200 246 C260 238 320 252 380 250 L420 360 H0Z" fill="#4a1a2a"/>
    <rect y="200" width="800" height="100" fill="url(#${id.haze})"/>
    <!-- 火山 -->
    <g fill="url(#${id.plume})">${plume.map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}"/>`).join('')}</g>
    <g fill="#ff9a5a" opacity=".22">${plume.slice(0, 4).map(([x, y, rr]) => `<circle cx="${x}" cy="${y + rr * 0.4}" r="${rr * 0.8}"/>`).join('')}</g>
    <circle cx="600" cy="120" r="60" fill="url(#${id.crater})"/>
    <path d="M380 360 L514 156 C534 132 552 124 570 122 L630 122 C648 126 664 136 680 156 L800 318 V360Z" fill="url(#${id.vol})"/>
    <path d="M514 156 C534 132 552 124 570 122 L630 122 C648 126 664 136 680 156" fill="none" stroke="#ff9a5a" stroke-width="2.4" opacity=".8"/>
    <path d="M570 122 L630 122" stroke="#ffe0a0" stroke-width="3"/>
    <g fill="none" stroke="#000" stroke-opacity=".25" stroke-width="2"><path d="M540 160 L480 260 M560 170 L520 300 M650 150 L700 250 M630 180 L660 300"/></g>
    <g fill="none" stroke="url(#${id.lava})" stroke-linecap="round"><path d="M592 124 C588 160 572 200 548 236 C530 262 512 290 500 330" stroke-width="4"/><path d="M612 124 C622 170 646 210 672 250 C690 276 708 300 724 330" stroke-width="3.2"/><path d="M602 124 C604 150 600 176 590 200" stroke-width="2.4"/></g>
    <!-- 左边的山崖与源石结晶 -->
    <path d="M0 262 C40 252 84 258 112 244 L160 218 C190 206 222 216 252 232 L304 258 C340 272 366 282 392 300 L400 360 H0Z" fill="#240d15"/>
    <path d="M112 244 L160 218 C190 206 222 216 252 232 L304 258" fill="none" stroke="#ff8a4a" stroke-width="1.6" opacity=".55"/>
    ${[[132, 250, 34, -12], [148, 252, 48, 4], [166, 252, 28, 16], [246, 236, 26, -8], [262, 240, 38, 10], [712, 332, 30, -8], [728, 334, 42, 8]].map(([x, y, h, a]) => `<g transform="translate(${x} ${y}) rotate(${a})"><polygon points="0,0 7,-${r1(h * 0.18)} 7,-${r1(h * 0.78)} 0,-${h} -7,-${r1(h * 0.78)} -7,-${r1(h * 0.18)}" fill="#1c0d14" stroke="#ff8a3d" stroke-width="1.3"/><path d="M0 -3 V-${h - 3}" stroke="#ffb070" stroke-width=".9" opacity=".7"/><polygon points="0,-${h} 7,-${r1(h * 0.78)} 0,-${r1(h * 0.6)}" fill="#ff8a3d" opacity=".35"/></g>`).join('')}
    <!-- 近处的地面线 -->
    <path d="M0 330 C120 318 260 326 400 322 C540 318 680 328 800 322 V360 H0Z" fill="#1a0a10"/>
    <path d="M0 330 C120 318 260 326 400 322 C540 318 680 328 800 322" fill="none" stroke="#ff7a4a" stroke-width="1.2" opacity=".35"/>
    <!-- 地板 -->
    <rect y="360" width="800" height="110" fill="url(#${id.ground})"/>
    <g fill="#2a1219" opacity=".7">${Array.from({ length: 22 }, () => { const [x, y] = proj(R() * 1.2 - 0.1, R()).split(' ').map(Number); return `<ellipse cx="${x}" cy="${y}" rx="${r1(6 + R() * 14)}" ry="${r1(2 + R() * 3)}"/>`; }).join('')}</g>
    <g fill="none" stroke="#0a0406" stroke-width="2.4" stroke-linejoin="round" opacity=".8">${cracks}${seams}</g>
    <g fill="none" stroke="#ff6a30" stroke-width="1.1" stroke-linejoin="round" opacity=".45">${cracks}</g>
    ${pools}
    <rect y="360" width="800" height="5" fill="#000" opacity=".4"/>`);

    let mv = '';
    // 地上几道发光的裂缝：一明一暗
    mv += art('a-pulse', 0, 360, 800, 110, `<g transform="translate(0 -360)" fill="none" stroke-linejoin="round" stroke-linecap="round"><g stroke="#ff7a30" stroke-width="3.2" opacity=".55">${seams}</g><g stroke="#ffd890" stroke-width="1.2">${seams}</g></g>`, '--d:3.6s;--o0:.3;--o1:1');
    // 火山口的光、熔岩流的明暗
    mv += glow('a-pulse', 600, 124, 150, 90, 'rgba(255,170,90,.75)', '--d:3.2s;--o0:.45;--o1:1');
    mv += glow('a-pulse', 560, 240, 160, 160, 'rgba(255,110,50,.3)', '--d:4.4s;--dl:-1.5s;--o0:.3;--o1:.9');
    mv += glow('a-pulse', 170, 236, 180, 120, 'rgba(255,190,120,.35)', '--d:6s;--o0:.6;--o1:1');
    // 烟柱里慢慢翻涌的烟团
    for (let i = 0; i < 4; i++) mv += art('a-smoke', 560 + i * 16, 40 - i * 8, 70, 56, cloud(35, 42, 62, 32, '#3e2c38', rng(20 + i)), `--d:${10 + i}s;--dl:${-i * 2.6}s;--dx:${30 + i * 10}%;--dy:-60%;--o1:.75`);
    // 火山闪电（很久才闪一下）
    mv += art('a-bolt', 590, 10, 40, 70, `<path d="M26 0 L14 26 L22 28 L8 58 L12 60 L4 70" fill="none" stroke="#fff4e0" stroke-width="1.8" stroke-linejoin="round"/><path d="M26 0 L14 26 L22 28 L8 58" fill="none" stroke="#ffb0d0" stroke-width="4" opacity=".35"/>`, '--d:11s;--dl:-3s');
    // 升起的火星、飘落的灰
    for (let i = 0; i < 12; i++) mv += art('a-rise', 60 + R() * 700, 240 + R() * 110, 10, 10, `<circle cx="5" cy="5" r="${r1(0.9 + R() * 1.2)}" fill="${pick(R, ['#ffb050', '#ff8a3a', '#ffd890'])}"/>`, `--d:${r1(5 + R() * 5)}s;--dl:${r1(-R() * 10)}s;--dx:${r1((R() - 0.3) * 400)}%;--dy:${r1(-900 - R() * 900)}%`);
    for (let i = 0; i < 8; i++) mv += art('a-fall', R() * 800, -10 + R() * 60, 8, 8, `<ellipse cx="4" cy="4" rx="2.2" ry="1.2" fill="#6a5a60"/>`, `--d:${r1(9 + R() * 6)}s;--dl:${r1(-R() * 14)}s;--dx:${r1(200 + R() * 300)}%;--dy:${r1(2600 + R() * 1400)}%;--o1:.7`);
    // 喷发时：火山口爆亮、熔岩弹飞出去
    mv += glow('boom', 600, 110, 260, 200, 'rgba(255,220,150,.9)');
    mv += bombs(600, 116, [[-900, -700, 1400, 12], [-500, -1000, 1800, 9], [300, -900, 1600, 10], [800, -600, 1500, 12], [1200, -500, 2000, 8], [-1300, -400, 1700, 9]]);
    mv += rune('base');

    const props = `<button type="button" class="tp tp-area hint" data-prop="volcano" aria-label="火山" title="火山" style="--x:520;--y:20;--w:170;--h:150;--hx:50%;--hy:62%"></button>` +
      `<button type="button" class="tp tp-area hint" data-prop="crystal" aria-label="源石结晶" title="源石结晶" style="--x:118;--y:196;--w:64;--h:60;--hx:40%;--hy:30%"></button>`;
    const fore = art('', 0, 318, 150, 60, `<path d="M0 60 L0 18 C20 8 40 14 58 6 C80 -2 100 20 120 28 C134 34 146 48 150 60Z" fill="#12070b"/><path d="M0 18 C20 8 40 14 58 6 C80 -2 100 20 120 28" fill="none" stroke="#ff7a4a" stroke-width="1.2" opacity=".4"/>`) +
      art('', 690, 330, 110, 44, `<path d="M0 44 C10 30 30 20 50 18 C70 14 90 4 110 8 V44Z" fill="#12070b"/>`) +
      Array.from({ length: 5 }, () => art('a-rise', 80 + R() * 640, 330 + R() * 30, 12, 12, `<circle cx="6" cy="6" r="1.6" fill="#ffc070"/>`, `--d:${r1(4 + R() * 3)}s;--dl:${r1(-R() * 6)}s;--dx:${r1((R() - 0.5) * 300)}%;--dy:-1400%`)).join('');

    const erupt = (t) => { t.pulse('erupt', 2600); t.burst('ember', 'volcano', 30, 0.62); t.sfx('boom'); if (window.FX) FX.shake(3, 0.5); };
    return {
      id: 'dusk', place: '火山地带', time: '黄昏', cls: 'sc-dusk',
      cap: '源石结晶在余晖里发亮，远处的山口正在翻涌。',
      hint: '点火山，她会放出「火山」',
      back: `${lay('', 0, 0, 800, 470, back)}${mv}${props}`,
      fore,
      props: {
        volcano: { cast: 'Skill', run(t) { erupt(t); t.say(pick(Math.random, ['大地在呼吸……', '就是现在——火山！', '熔岩的温度，是 1100 度左右。'])); } },
        crystal: { cast: 'Attack', run(t, el) { t.kick(el); t.burst('ember', el, 12, 0.3); t.pulse('glint', 900); t.sfx('tick'); } },
      },
      skill(id, t) { if (id === 'volcano') t.later(() => erupt(t), 500); },
    };
  }

  /* ---------- 透视木地板 ---------- */
  function planks(R, c0, c1, line, o = {}) {
    const g = nid('fl');
    let s = '';
    for (let i = -10; i <= 18; i++) { const xb = i * (o.step || 62), xt = 400 + (xb - 400) * 0.62; s += `<path d="M${r1(xt)} 360 L${r1(xb)} 470"/>`; }
    let seams = '';
    [[374, 0.5], [392, 0.6], [416, 0.7], [448, 0.8]].forEach(([y, a], k) => {
      for (let i = -10; i <= 18; i++) {
        if (R() < 0.55) continue;
        const f = (y - 360) / 110, xb = i * (o.step || 62), xt = 400 + (xb - 400) * 0.62, x = xt + (xb - xt) * f, w = ((o.step || 62) * (0.62 + 0.38 * f));
        seams += `<path d="M${r1(x)} ${y} h${r1(w)}" opacity="${a}"/>`;
      }
    });
    return `<defs>${lin(g, [[0, c0], [1, c1]])}</defs><rect y="360" width="800" height="110" fill="url(#${g})"/><g stroke="${line}" stroke-width="1.1" opacity=".55">${s}${seams}</g>`;
  }
  /** 蝴蝶：外层沿路线飞，里层扇翅膀 */
  const butterfly = (x, y, col, st) => lay('a-glide', x, y, 14, 12, sub('a-flap', 0, 0, 100, 100, svg(14, 12, `<path d="M7 6 C3 0 0 1 1 5 C0 9 4 10 7 7Z M7 6 C11 0 14 1 13 5 C14 9 10 10 7 7Z" fill="${col}" stroke="#fff" stroke-width=".6"/><path d="M7 3 V9" stroke="#4a3a5a" stroke-width="1"/>`), '--d:.35s'), st);

  /* ====================================================================
   * 场景三 · 医疗 · 默认 · 基建：午后 · 汐斯塔火山博物馆
   * ==================================================================== */
  function museum() {
    const R = rng(3301);
    const id = { wall: nid('w'), wain: nid('n'), sky: nid('s'), sea: nid('e'), glass: nid('g'), beam: nid('b'), vol: nid('v'), obs: nid('o'), water: nid('a'), patch: nid('p') };
    const ink = '#6a6488';
    const label = (x, y, w = 22) => `<rect x="${x}" y="${y}" width="${w}" height="7" rx="1" fill="#ffffff" stroke="#c9d2e6" stroke-width=".6"/><path d="M${x + 3} ${y + 2.6} h${w - 8} M${x + 3} ${y + 4.8} h${w - 12}" stroke="#8a93b0" stroke-width=".6"/>`;
    const back = svg(800, 470, `<defs>
      ${lin(id.wall, [[0, '#fbf8f2'], [1, '#efe8dc']])}
      ${lin(id.wain, [[0, '#e4ebf4'], [1, '#d3dcea']])}
      ${lin(id.sky, [[0, '#8ec8ff'], [0.7, '#cfe8ff'], [1, '#eef7ff']])}
      ${lin(id.sea, [[0, '#7fb8e8'], [1, '#a9d4f2']])}
      ${lin(id.glass, [[0, '#ffffff', 0.35], [0.5, '#e8f2ff', 0.12], [1, '#ffffff', 0.3]], 1, 1)}
      ${lin(id.vol, [[0, '#a9a0cc'], [1, '#8a84b0']])}
      ${rad(id.obs, [[0, '#6a6a8a'], [0.4, '#22203a'], [1, '#0a0a14']], ' cx=".35" cy=".3" r=".8"')}
      ${lin(id.water, [[0, '#bfe4ff', 0.75], [1, '#7ab8e8', 0.85]])}
      ${lin(id.patch, [[0, '#fff6d0', 0.55], [1, '#fff6d0', 0.15]])}
    </defs>
    <rect width="800" height="360" fill="url(#${id.wall})"/>
    <!-- 墙上的横饰带：一排小火山 -->
    <rect y="18" width="800" height="16" fill="#eef2f8"/><rect y="17" width="800" height="1.5" fill="#c9d2e6"/><rect y="33" width="800" height="1.5" fill="#c9d2e6"/>
    <g fill="#c7cfe4">${Array.from({ length: 27 }, (_, i) => `<path d="M${i * 30 + 4} 30 L${i * 30 + 12} 22 L${i * 30 + 16} 22 L${i * 30 + 24} 30Z"/>`).join('')}</g>
    <!-- 馆牌 -->
    <g><rect x="318" y="44" width="164" height="30" rx="3" fill="#6a5a8a"/><rect x="322" y="48" width="156" height="22" rx="2" fill="none" stroke="#f3d6a8" stroke-width="1"/>
      <text x="400" y="63" text-anchor="middle" font-family="'Noto Serif SC',serif" font-size="11.5" font-weight="700" fill="#fff6e8" letter-spacing="2">汐斯塔火山博物馆</text></g>
    <!-- 纪录片海报 -->
    <g><rect x="336" y="88" width="128" height="150" rx="2" fill="#ffffff" stroke="#c9d2e6" stroke-width="3"/>
      <rect x="344" y="96" width="112" height="108" fill="#dbe8f7"/>
      <path d="M344 204 L380 158 L394 168 L420 140 L456 186 V204Z" fill="#9a94c0"/><path d="M414 146 L420 140 L426 146 Z" fill="#fff"/>
      <path d="M352 204 C370 196 380 186 392 178 C400 172 410 166 420 150" fill="none" stroke="#f3e6cc" stroke-width="2" stroke-dasharray="3 3"/>
      <g transform="translate(398 170)"><circle r="3" fill="#6a5a8a"/><path d="M0 3 v8 M0 6 l-4 3 M0 6 l4 -2 M0 11 l-3 5 M0 11 l3 5" stroke="#6a5a8a" stroke-width="1.6" fill="none"/></g>
      <circle cx="440" cy="112" r="8" fill="#fff4c8"/>
      <text x="400" y="222" text-anchor="middle" font-family="'Noto Serif SC',serif" font-size="11" font-weight="700" fill="#4a5478">一步，又一步</text>
      <text x="400" y="233" text-anchor="middle" font-family="sans-serif" font-size="5.5" fill="#8a93b0" letter-spacing="1.5">DOCUMENTARY</text></g>
    <!-- 窗：拱形大窗，窗外是海边的老火山 -->
    <g>
      <path d="M500 250 V110 A93 93 0 0 1 686 110 V250Z" fill="url(#${id.sky})"/>
      <rect x="500" y="196" width="186" height="26" fill="url(#${id.sea})"/>
      <path d="M500 200 h186" stroke="#fff" stroke-width="1.2" opacity=".6"/>
      <path d="M520 214 h20 M560 208 h30 M620 216 h24 M650 206 h18" stroke="#fff" stroke-width="1" opacity=".55"/>
      <path d="M548 200 L600 150 C606 144 612 142 618 142 L628 142 C636 146 640 150 646 156 L690 200Z" fill="url(#${id.vol})"/>
      <path d="M600 150 C606 144 612 142 618 142 L628 142 C636 146 640 150 646 156 C636 158 630 152 622 158 C614 152 606 158 600 150Z" fill="#fff"/>
      <path d="M500 222 C540 214 570 226 610 220 C640 216 670 224 686 220 V250 H500Z" fill="#bfe0c8"/>
      <path d="M500 232 C530 228 560 238 600 234 C640 230 660 238 686 234 V250 H500Z" fill="#f2e6c8"/>
      <path d="M500 250 V110 A93 93 0 0 1 686 110 V250" fill="none" stroke="#ffffff" stroke-width="12"/>
      <path d="M500 250 V110 A93 93 0 0 1 686 110 V250" fill="none" stroke="#c9d2e6" stroke-width="2"/>
      <path d="M593 18 V250 M500 150 H686" stroke="#fff" stroke-width="6"/>
      <path d="M593 30 V250 M506 150 H680" stroke="#dde5f2" stroke-width="1"/>
      <rect x="486" y="248" width="214" height="12" rx="2" fill="#ffffff"/><rect x="486" y="258" width="214" height="4" fill="#c9d2e6"/>
    </g>
    <!-- 护墙板 -->
    <rect y="276" width="800" height="84" fill="url(#${id.wain})"/>
    <g fill="none" stroke="#fff" stroke-width="2">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<rect x="${i * 92 + 8}" y="288" width="76" height="52" rx="2"/>`).join('')}</g>
    <rect y="270" width="800" height="8" fill="#ffffff"/><rect y="277" width="800" height="1.5" fill="#c9d2e6"/>
    <rect y="348" width="800" height="12" fill="#c7d1e4"/><rect y="348" width="800" height="1.5" fill="#fff"/>
    <!-- 长凳（海报下） -->
    <g><rect x="340" y="306" width="120" height="8" rx="3" fill="#c9a07a"/><rect x="346" y="314" width="6" height="40" fill="#a88060"/><rect x="448" y="314" width="6" height="40" fill="#a88060"/><rect x="344" y="302" width="112" height="4" rx="2" fill="#ddb892"/></g>
    <!-- 标本柜（左） -->
    <g>
      <rect x="112" y="44" width="194" height="12" rx="3" fill="#ffffff" stroke="#c9d2e6"/>
      <rect x="118" y="54" width="182" height="300" fill="#f7f4ee" stroke="#c9d2e6" stroke-width="2"/>
      <rect x="126" y="62" width="166" height="242" fill="#e6eef8"/>
      ${[132, 212].map((y) => `<rect x="126" y="${y}" width="166" height="4" fill="#ffffff"/><rect x="126" y="${y + 4}" width="166" height="2" fill="#c9d2e6"/>`).join('')}
      <rect x="126" y="300" width="166" height="4" fill="#ffffff"/>
      <rect x="126" y="62" width="166" height="8" fill="#fff6d8" opacity=".7"/>
      <g fill="#fffbe6" opacity=".55">${[150, 200, 250].map((x) => `<path d="M${x - 5} 70 L${x + 5} 70 L${x + 22} 132 L${x - 22} 132Z"/>`).join('')}</g>
      <!-- 上层：晶洞、火山弹 -->
      <g transform="translate(150 132)"><ellipse cx="0" cy="-2" rx="16" ry="4" fill="#cfd6e6"/><path d="M-15 -2 C-16 -20 -4 -28 6 -24 C16 -20 18 -8 15 -2Z" fill="#8a7f90"/><path d="M-10 -4 C-10 -16 -2 -20 5 -18 C12 -16 12 -8 10 -4Z" fill="#b89be0"/><g fill="#e8dcff">${[[-5, -10], [0, -14], [5, -9], [2, -6], [-3, -6]].map(([x, y]) => `<polygon points="${x},${y - 3} ${x + 2},${y} ${x},${y + 2} ${x - 2},${y}"/>`).join('')}</g></g>
      ${label(138, 120)}
      <g transform="translate(262 132)"><ellipse cx="0" cy="-1" rx="16" ry="3" fill="#cfd6e6"/><path d="M-22 -8 C-14 -18 -4 -20 6 -18 C16 -16 22 -12 26 -10 C18 -4 8 -2 -4 -2 C-14 -2 -20 -4 -22 -8Z" fill="#8a6a5a"/><path d="M-14 -10 C-4 -15 8 -15 18 -11" stroke="#6a4a3a" stroke-width="1" fill="none"/><path d="M-10 -6 C0 -9 10 -8 18 -7" stroke="#b08a70" stroke-width="1" fill="none"/></g>
      ${label(250, 120)}
      <!-- 中层：火山毛（玻璃皿里金色的细丝） -->
      <g transform="translate(268 212)"><ellipse cx="0" cy="-3" rx="19" ry="5" fill="#ffffff" stroke="#c9d2e6"/><g stroke="#e0b060" stroke-width=".7" fill="none">${Array.from({ length: 16 }, () => `<path d="M${r1(-14 + R() * 28)} ${r1(-3 - R() * 2)} q${r1((R() - 0.5) * 16)} ${r1(-6 - R() * 6)} ${r1((R() - 0.5) * 20)} ${r1(-2 - R() * 4)}"/>`).join('')}</g></g>
      ${label(257, 200)}
      <!-- 下层：火山灰瓶、剖面模型、火山砾 -->
      <g transform="translate(146 300)"><rect x="-12" y="-34" width="24" height="34" rx="4" fill="#fff" fill-opacity=".6" stroke="#9fb4d6"/><rect x="-11" y="-16" width="22" height="15" rx="3" fill="#b8b4bc"/><rect x="-9" y="-38" width="18" height="6" rx="1.5" fill="#c9a07a"/><path d="M-8 -30 V-4" stroke="#fff" stroke-width="1.4" opacity=".6"/></g>
      ${label(134, 288, 24)}
      <g transform="translate(212 300)"><path d="M-30 0 L-8 -40 C-4 -46 4 -46 8 -40 L30 0Z" fill="#b8a898"/><path d="M-30 0 L-8 -40 C-4 -46 4 -46 8 -40 L30 0Z" fill="none" stroke="#8a7a6a"/><path d="M-20 0 L-6 -28 H6 L20 0Z" fill="#d88a6a"/><path d="M-2 -40 V0 M2 -40 V0" stroke="#ff7a4a" stroke-width="2.4"/><path d="M-6 0 C-4 -8 4 -8 6 0" fill="#ff9a5a"/><path d="M-26 -8 H26 M-22 -16 H22" stroke="#8a7a6a" stroke-width=".6" opacity=".6"/><rect x="-34" y="0" width="68" height="4" rx="1" fill="#fff" stroke="#c9d2e6"/></g>
      <g transform="translate(266 300)" fill="#8a7e86">${[[-8, -3, 3], [-2, -4, 3.4], [4, -3, 2.6], [8, -2, 2], [-5, -8, 2.4], [2, -9, 2.6], [-1, -13, 2]].map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}"/>`).join('')}</g>
      ${label(254, 288, 24)}
      <!-- 下层：抽屉 -->
      ${[0, 1, 2].map((i) => `<rect x="${130 + i * 54}" y="308" width="50" height="40" rx="2" fill="#efeae0" stroke="#c9d2e6"/><rect x="${145 + i * 54}" y="318" width="20" height="8" rx="1" fill="#fff" stroke="#c9d2e6" stroke-width=".6"/><circle cx="${155 + i * 54}" cy="336" r="2" fill="#b8a080"/>`).join('')}
      <!-- 玻璃反光 -->
      <path d="M126 62 L292 62 L292 304 L126 304Z" fill="url(#${id.glass})"/>
      <path d="M140 70 L180 70 L130 180 L126 180 L126 100Z M200 62 L214 62 L140 250 L132 250Z" fill="#fff" opacity=".3"/>
      <path d="M209 56 V304" stroke="#ffffff" stroke-width="3"/><path d="M209 56 V304" stroke="#c9d2e6" stroke-width=".8"/>
    </g>
    <!-- 地板：浅色木地板、窗投下的光斑 -->
    ${planks(R, '#ecdcc0', '#d6bf9a', '#b89a74')}
    <rect y="360" width="800" height="4" fill="#000" opacity=".08"/>
    <ellipse cx="400" cy="402" rx="230" ry="30" fill="#c9daf0"/><ellipse cx="400" cy="402" rx="218" ry="26" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="1 5" stroke-linecap="round"/><ellipse cx="400" cy="402" rx="150" ry="17" fill="none" stroke="#e6b8c8" stroke-width="1.6"/>
    <path d="M430 362 L560 362 L520 470 L340 470Z M570 362 L690 362 L690 470 L540 470Z" fill="url(#${id.patch})"/>
    <rect width="800" height="470" fill="url(#${id.patch}w)"/>`).replace('</defs>', `${rad(id.patch + 'w', [[0, '#ffd89a', 0.28], [0.6, '#ffd89a', 0.08], [1, '#ffd89a', 0]], ' cx=".74" cy=".3" r=".7"')}</defs>`);

    let mv = '';
    // 窗外的云
    mv += `<i class="tl" style="--x:500;--y:40;--w:186;--h:160;overflow:hidden;border-radius:50% 50% 0 0 / 30% 30% 0 0">${sub('a-drift', -10, 22, 40, 18, svg(130, 40, cloud(65, 34, 110, 26, '#fff', rng(31))), '--d:46s;--dx:180%')}${sub('a-drift', 60, 40, 28, 12, svg(90, 30, cloud(45, 26, 76, 18, '#ffffff', rng(32))), '--d:60s;--dl:-20s;--dx:-200%')}${sub('wx-cloud fade', -5, 10, 110, 70, svg(200, 110, cloud(60, 60, 110, 40, '#dfe4ee', rng(33)) + cloud(140, 50, 120, 44, '#cfd6e4', rng(34)) + cloud(100, 90, 160, 36, '#e8ecf4', rng(35))))}${sub('wx-rain fade', 0, 30, 100, 70, Array.from({ length: 12 }, (_, i) => `<i class="ts a-fall" style="left:${(i * 8.3) % 100}%;top:${(i * 37) % 30}%;width:2%;height:18%;--d:.8s;--dl:${r1(-i * 0.07)}s;--dx:-30%;--dy:300%;--r:0deg;--o1:.8">${svg(4, 20, '<path d="M3 0 L1 20" stroke="#8ab0dc" stroke-width="1.4"/>')}</i>`).join(''))}${sub('wx-bow fade', 5, 22, 90, 110, svg(180, 110, ['#ffb3c8', '#ffe08a', '#a6e3b8', '#9fc8ff', '#c9b0ff'].map((c, i) => `<path d="M${10 + i * 7} 110 A${80 - i * 7} ${80 - i * 7} 0 0 1 ${170 - i * 7} 110" fill="none" stroke="${c}" stroke-width="6" opacity=".75"/>`).join('')))}</i>`;
    // 薄纱窗帘
    const sheer = (flip) => `<path d="${flip ? 'M40 0 C30 60 36 140 24 230 L0 230 C4 140 2 60 0 0Z' : 'M0 0 C10 60 4 140 16 230 L40 230 C36 140 38 60 40 0Z'}" fill="#ffffff" opacity=".78"/><path d="${flip ? 'M30 4 C22 80 28 160 18 226 M14 4 C10 80 16 160 8 226' : 'M10 4 C18 80 12 160 22 226 M26 4 C30 80 24 160 32 226'}" stroke="#d6e0f2" stroke-width="1.2" fill="none"/>`;
    mv += art('a-sway', 478, 22, 40, 230, sheer(false), '--d:6s;--r0:-.8deg;--r1:1.2deg');
    mv += art('a-sway', 668, 22, 40, 230, sheer(true), '--d:7s;--dl:-2s;--r0:.8deg;--r1:-1.2deg');
    // 阳光：两道斜斜的光柱，慢慢明暗
    mv += lay('beam fade', 330, 110, 360, 360, sub('a-pulse', 0, 0, 100, 100, svg(360, 360, `<defs>${lin(id.beam, [[0, '#fff8dc', 0.5], [1, '#fff8dc', 0]], 0, 1)}</defs><path d="M200 0 L300 0 L200 360 L40 360Z" fill="url(#${id.beam})"/><path d="M320 0 L360 0 L330 360 L250 360Z" fill="url(#${id.beam})" opacity=".7"/>`), '--d:7s;--o0:.45;--o1:.95'));
    for (let i = 0; i < 9; i++) mv += art('a-mote', 380 + R() * 250, 160 + R() * 170, 14, 14, `<path d="${spark(7, 7, 2.4)}" fill="#fffbe8"/>`, `--d:${r1(6 + R() * 5)}s;--dl:${r1(-R() * 10)}s;--dx:${r1(-80 + R() * 160)}%;--dy:${r1(-150 - R() * 150)}%;--o1:.95`);
    // 水箱里的浮石（信物：投进水里会浮起来、上下翻滚）
    const tank = `<rect x="2" y="8" width="56" height="40" rx="3" fill="url(#${id.water})" stroke="#9fb4d6" stroke-width="1.4"/><rect x="2" y="8" width="56" height="8" fill="#fff" opacity=".35"/><path d="M6 12 V44" stroke="#fff" stroke-width="1.5" opacity=".5"/><rect x="0" y="46" width="60" height="6" rx="2" fill="#ffffff" stroke="#c9d2e6"/>`;
    let props = prop('pumice', '水箱里的浮石', 186, 162, 60, 52, tank, 'hint', '--hx:50%;--hy:25%');
    mv += art('a-bob pumice', 204, 165, 24, 18, `<path d="M3 10 C2 4 8 1 13 2 C19 2 23 6 21 11 C19 16 10 17 5 15 C3 14 3 12 3 10Z" fill="#d8d2c8" stroke="#9a9488" stroke-width="1"/><g fill="#9a9488">${[[8, 7], [12, 10], [16, 7], [10, 13], [17, 12], [6, 11]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1"/>`).join('')}</g>`, '--d:2.2s;--dy:-18%;--r0:-6deg;--r1:8deg');
    for (let i = 0; i < 4; i++) mv += art('a-rise bub', 204 + i * 7, 198, 8, 8, `<circle cx="4" cy="4" r="1.6" fill="none" stroke="#fff" stroke-width=".8"/>`, `--d:${r1(1.6 + i * 0.4)}s;--dl:${r1(-i * 0.5)}s;--dx:${r1((i - 1.5) * 40)}%;--dy:-340%`);
    // 黑曜石
    const obs = `<ellipse cx="22" cy="40" rx="16" ry="3.6" fill="#cfd6e6"/><path d="M8 38 L12 22 L22 12 L34 18 L38 34 L30 40Z" fill="url(#${id.obs})" stroke="#0a0a14" stroke-width="1"/><path d="M14 22 L22 14 L26 26Z" fill="#9aa0c8" opacity=".55"/><path d="M28 20 L34 30" stroke="#fff" stroke-width="1" opacity=".6"/>${label(12, 42, 20)}`;
    props += prop('obsidian', '黑曜石', 136, 170, 44, 50, obs);
    mv += art('glint', 150, 170, 20, 20, `<path d="${spark(10, 10, 8)}" fill="#fff"/>`);
    // 窗台上的预警花（“棉花糖”3号）
    const flower = `<path d="M10 58 L14 40 H38 L42 58Z" fill="#e8b89a" stroke="#c08a6a"/><rect x="12" y="38" width="28" height="5" rx="2" fill="#f0c8aa"/>` +
      `<path d="M26 40 C24 30 28 22 26 12" stroke="#6cb07e" stroke-width="2.4" fill="none"/><path d="M26 30 C18 28 14 30 12 34 C18 36 22 34 26 30Z M26 24 C32 20 38 20 40 24 C34 28 30 26 26 24Z" fill="#8ed09f"/>` +
      `<g fill="#ffd9e6" stroke="#f3a8c4" stroke-width=".8"><circle cx="26" cy="10" r="7"/><circle cx="19" cy="14" r="5"/><circle cx="33" cy="15" r="5"/></g><g fill="#fff">${[[24, 7], [28, 9], [19, 13], [33, 14]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4"/>`).join('')}</g>`;
    props += prop('flower', '窗台上的预警花', 610, 196, 52, 60, flower, 'hint', '--hx:50%;--hy:15%');
    // 啃花的隐形小羊：平时看不见
    mv += art('nibbler fade', 640, 218, 40, 32, sheepIn(40, 32, 0.8, SHEEP.pink, { flip: false }));
    // 时隐时现的粉色小羊：偶尔从标本柜后面探出头
    mv += art('a-peek', 292, 318, 40, 34, sheepIn(40, 34, 0.85, SHEEP.pink, { flip: true }), '--d:17s;--dl:-6s');
    props += `<button type="button" class="tp tp-area hint" data-prop="window" aria-label="窗外的天气" title="窗外的天气" style="--x:506;--y:40;--w:176;--h:150;--hx:30%;--hy:40%"></button>`;
    props += `<button type="button" class="tp tp-area" data-prop="poster" aria-label="纪录片海报" title="纪录片海报" style="--x:336;--y:88;--w:128;--h:150"></button>`;

    const fore = art('', 690, 300, 110, 80, `<path d="M40 80 L46 44 H86 L92 80Z" fill="#f4f1ea" stroke="#c9d2e6"/><path d="M66 44 C54 20 40 14 26 8 M66 44 C70 20 84 8 100 4 M66 44 C62 26 66 12 64 0" stroke="#5a9a6a" stroke-width="3" fill="none"/><g fill="#7cc08e"><ellipse cx="30" cy="10" rx="12" ry="5" transform="rotate(-20 30 10)"/><ellipse cx="96" cy="6" rx="12" ry="5" transform="rotate(20 96 6)"/><ellipse cx="64" cy="4" rx="5" ry="11"/><ellipse cx="80" cy="22" rx="10" ry="4" transform="rotate(30 80 22)"/><ellipse cx="46" cy="24" rx="10" ry="4" transform="rotate(-30 46 24)"/></g>`);

    const WX = ['', 'w-cloud', 'w-rain', 'w-bow'];
    const WXL = ['又是晴天。窗外的老火山安安静静的。', '起风了，云从海那边压过来。', '下雨了——等雨停了，山坡会更绿。', '雨停了。彩虹！'];
    let wx = 0;
    return {
      id: 'museum', place: '汐斯塔火山博物馆', time: '午后', cls: 'sc-museum',
      cap: '海边的老火山、标本柜，和一群时隐时现的粉色小羊。',
      hint: '点点水箱里的浮石、窗台上的花和窗外的天气',
      back: `${lay('', 0, 0, 800, 470, back)}${mv}${props}`,
      fore,
      auto: ['pumice', 'flower', 'window', 'obsidian'],
      props: {
        pumice: { react: 'Interact', run(t) { t.pulse('fizz', 2600); t.say('投进水里会浮起来，上下翻滚，嗞嗞作响——它在唱歌。', 'pumice'); t.sfx('sparkle'); } },
        obsidian: { react: 'Interact', run(t) { t.pulse('glint', 1200); t.say(pick(Math.random, ['黑曜石：岩浆来不及结晶，就冷却成了天然的玻璃。', '断口像贝壳一样，边缘比刀还锋利。']), 'obsidian'); } },
        flower: { react: 'Interact', run(t, el) { t.pulse('nibble', 3200); t.burst('ash', el, 8, 0.2); t.say('“棉花糖”3号的茎秆上，又添了一圈小牙印……', 'flower'); } },
        window: {
          react: 'Interact',
          run(t) {
            if (WX[wx]) t.stage.classList.remove(WX[wx]);
            wx = (wx + 1) % WX.length;
            if (WX[wx]) t.stage.classList.add(WX[wx]);
            t.say(WXL[wx], 'window');
          },
        },
        poster: { react: 'Interact', run(t) { t.say('纪录片《一步，又一步》——她也参与了拍摄。', 'poster'); } },
      },
    };
  }

  /* ====================================================================
   * 场景四 · 医疗 · 默认 · 作战：晴空 · 草坡（三个技能各自落在布景上）
   * ==================================================================== */
  function meadow() {
    const R = rng(4409);
    const id = { sky: nid('s'), h1: nid('a'), h2: nid('b'), h3: nid('c'), vol: nid('v'), grass: nid('g') };
    const dots = (n, x0, x1, y0, y1, cols, s = 1.6) => Array.from({ length: n }, () => `<circle cx="${r1(x0 + R() * (x1 - x0))}" cy="${r1(y0 + R() * (y1 - y0))}" r="${r1(s * (0.6 + R() * 0.6))}" fill="${pick(R, cols)}"/>`).join('');
    let blades = '';
    for (let i = 0; i < 160; i++) { const x = R() * 800, y = 364 + R() * 100, h = 3 + R() * 5 * (1 + (y - 364) / 60); blades += `<path d="M${r1(x)} ${r1(y)} q${r1((R() - 0.5) * 3)} ${r1(-h * 0.6)} ${r1((R() - 0.5) * 4)} ${r1(-h)}"/>`; }
    const back = svg(800, 470, `<defs>
      ${lin(id.sky, [[0, '#6fb8ff'], [0.55, '#bfe2ff'], [1, '#f2f9ff']])}
      ${lin(id.h1, [[0, '#c4e8cf'], [1, '#a9dbb8']])}
      ${lin(id.h2, [[0, '#a4d9b2'], [1, '#86c79a']])}
      ${lin(id.h3, [[0, '#8fd0a0'], [1, '#6db584']])}
      ${lin(id.vol, [[0, '#b7b0d8'], [1, '#9a94c4']])}
      ${lin(id.grass, [[0, '#7cc290'], [1, '#5ea874']])}
    </defs>
    <rect width="800" height="360" fill="url(#${id.sky})"/>
    <!-- 彩虹（火山回响时会亮起来） -->
    <g fill="none" stroke-width="7" opacity=".28">${['#ffb3c8', '#ffe08a', '#a6e3b8', '#9fc8ff', '#c9b0ff'].map((c, i) => `<path d="M${120 + i * 9} 262 A${190 - i * 9} ${170 - i * 9} 0 0 1 ${500 - i * 9} 262" stroke="${c}"/>`).join('')}</g>
    <!-- 远山、火山 -->
    <path d="M0 232 C60 214 110 222 160 208 C210 196 250 214 300 206 C340 200 380 214 420 210 C470 206 500 222 540 226 C600 232 700 224 800 230 V280 H0Z" fill="#c5cdee" opacity=".8"/>
    <path d="M0 246 C80 236 150 240 220 232 C300 226 360 240 440 236 L440 280 H0Z" fill="#b6c4e6" opacity=".5"/>
    <path d="M430 262 L560 160 C572 150 582 146 594 146 L612 146 C624 148 632 154 642 162 L780 262Z" fill="url(#${id.vol})"/>
    <path d="M560 160 C572 150 582 146 594 146 L612 146 C624 148 632 154 642 162 C628 170 618 160 606 168 C594 160 584 172 574 164 C568 168 562 164 560 160Z" fill="#fff"/>
    <path d="M580 200 L560 240 M620 196 L650 244" stroke="#8a84b0" stroke-width="2" opacity=".5"/>
    <!-- 草坡：三层 -->
    <path d="M0 262 C90 236 180 238 280 252 C380 266 460 244 560 240 C650 236 730 248 800 244 V360 H0Z" fill="url(#${id.h1})"/>
    ${dots(40, 20, 780, 250, 280, ['#ffd6e4', '#ffffff', '#fff2b0'], 1.3)}
    <path d="M0 296 C110 276 220 272 330 284 C430 294 520 278 640 274 C710 272 760 280 800 278 V360 H0Z" fill="url(#${id.h2})"/>
    ${dots(60, 0, 800, 286, 320, ['#fbc4d6', '#ffffff', '#ffe08a', '#ffd6e4'], 1.8)}
    <path d="M40 360 C120 330 200 312 280 318 C320 322 350 340 370 360Z" fill="#e8dcc0" opacity=".7"/>
    <path d="M0 326 C150 312 300 318 440 314 C580 310 700 320 800 316 V360 H0Z" fill="url(#${id.h3})"/>
    <!-- 预警花丛 -->
    ${Array.from({ length: 22 }, () => { const x = 20 + R() * 760, y = 318 + R() * 36, s = 0.7 + R() * 0.5; return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${r1(s)})"><path d="M0 0 V-10" stroke="#5a9a6a" stroke-width="1.4"/><circle cy="-12" r="4" fill="#ffe0ec" stroke="#f3a8c4" stroke-width=".8"/><circle cx="-3" cy="-10" r="2.6" fill="#fff"/></g>`; }).join('')}
    <!-- 地面 -->
    <rect y="360" width="800" height="110" fill="url(#${id.grass})"/>
    <g stroke="#4f9a66" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".7">${blades}</g>
    ${dots(40, 0, 800, 370, 468, ['#ffffff', '#ffe08a', '#fbc4d6'], 2)}`);

    let mv = '';
    // 大朵的积云
    mv += art('a-drift', 30, 30, 240, 90, cloud(120, 76, 220, 58, '#ffffff', rng(41)) + cloud(70, 84, 110, 30, '#eef6ff', rng(42)), '--d:70s;--dx:26%');
    mv += art('a-drift shield-cloud', 300, 8, 200, 80, cloud(100, 66, 190, 50, '#ffffff', rng(43)), '--d:90s;--dl:-30s;--dx:-18%');
    mv += art('a-drift', 620, 44, 160, 60, cloud(80, 50, 150, 36, '#ffffff', rng(44)), '--d:80s;--dl:-10s;--dx:-30%');
    // 白色的烟（纯净的灰），慢慢升起
    for (let i = 0; i < 3; i++) mv += art('a-smoke', 580 + i * 8, 100 - i * 10, 60, 48, cloud(30, 38, 54, 28, '#ffffff', rng(45 + i)), `--d:${9 + i * 2}s;--dl:${-i * 3.4}s;--dx:-40%;--dy:-80%;--o1:.95`);
    // 羊：在草坡上低头吃草
    mv += art('a-bob', 150, 246, 40, 30, sheepIn(40, 30, 0.75, SHEEP.white, { flip: true }), '--d:2.6s;--dy:-4%');
    // 蝴蝶、蒲公英
    mv += butterfly(260, 270, '#ffd0e0', '--d:26s;--dx:-900%;--dy:-120%');
    mv += butterfly(620, 250, '#bfe0ff', '--d:32s;--dl:-12s;--dx:-1400%;--dy:80%');
    mv += butterfly(540, 300, '#fff0b0', '--d:22s;--dl:-5s;--dx:-700%;--dy:-200%');
    for (let i = 0; i < 7; i++) mv += art('a-rise', 60 + R() * 680, 300 + R() * 60, 12, 12, `<circle cx="6" cy="6" r="1" fill="#fff"/><path d="M6 6 l-3 -3 M6 6 l3 -3 M6 6 v-4 M6 6 l-4 0 M6 6 l4 0" stroke="#fff" stroke-width=".6"/>`, `--d:${r1(9 + R() * 6)}s;--dl:${r1(-R() * 14)}s;--dx:${r1(200 + R() * 400)}%;--dy:${r1(-900 - R() * 600)}%;--o1:.9`);
    // 技能：细雨（无声润物）、护盾的六边形微光（云霭荫佑）、彩虹亮起（火山回响）
    mv += `<i class="tl sk-rain fade" style="--x:0;--y:0;--w:800;--h:360">${Array.from({ length: 26 }, (_, i) => `<i class="ts a-fall" style="left:${r1((i * 3.9 + 1) % 100)}%;top:${r1(-10 + ((i * 17) % 40))}%;width:.6%;height:8%;--d:${r1(0.9 + (i % 5) * 0.12)}s;--dl:${r1(-i * 0.13)}s;--dx:-60%;--dy:900%;--r:0deg;--o1:.75">${svg(5, 30, '<path d="M4 0 L1 30" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/>')}</i>`).join('')}</i>`;
    mv += art('sk-shield fade', 150, 20, 500, 300, `<g fill="none" stroke="#bfe8ff" stroke-width="1.4" opacity=".8">${Array.from({ length: 30 }, (_, i) => { const cx = 40 + (i % 6) * 84 + ((i / 6 | 0) % 2) * 42, cy = 30 + (i / 6 | 0) * 62; return `<path d="${[0, 1, 2, 3, 4, 5, 0].map((k, j) => { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; return `${j ? 'L' : 'M'}${r1(cx + Math.cos(a) * 36)} ${r1(cy + Math.sin(a) * 36)}`; }).join(' ')}"/>`; }).join('')}</g>`);
    mv += art('sk-bow fade', 110, 80, 400, 190, `<g fill="none" stroke-width="8">${['#ffb3c8', '#ffe08a', '#a6e3b8', '#9fc8ff', '#c9b0ff'].map((c, i) => `<path d="M${10 + i * 9} 182 A${190 - i * 9} ${170 - i * 9} 0 0 1 ${390 - i * 9} 182" stroke="${c}"/>`).join('')}</g>`);
    mv += rune('alter');

    const props = `<button type="button" class="tp tp-area hint" data-prop="rain" aria-label="一片云" title="一片云" style="--x:40;--y:30;--w:230;--h:90;--hx:50%;--hy:60%"></button>` +
      `<button type="button" class="tp tp-area" data-prop="shield" aria-label="大朵的积云" title="大朵的积云" style="--x:310;--y:10;--w:180;--h:74"></button>` +
      `<button type="button" class="tp tp-area hint" data-prop="volcano" aria-label="远处的火山" title="远处的火山" style="--x:520;--y:70;--w:180;--h:120;--hx:50%;--hy:70%"></button>` +
      prop('sheep', '吃草的小羊', 520, 270, 44, 34, sheepIn(44, 34, 0.85, SHEEP.white, {}), 'breathe');
    const tuft = (flip) => `<g fill="none" stroke-linecap="round">${Array.from({ length: 9 }, (_, i) => `<path d="M${20 + i * 5} 60 q${flip ? -4 : 4} -${20 + (i % 3) * 10} ${(flip ? -1 : 1) * (6 + i * 1.5)} -${34 + (i % 4) * 8}" stroke="${i % 2 ? '#5ea874' : '#7cc290'}" stroke-width="3"/>`).join('')}</g><circle cx="${flip ? 30 : 60}" cy="${22}" r="4" fill="#ffe0ec" stroke="#f3a8c4"/>`;
    const fore = art('a-sway', 40, 318, 90, 60, tuft(false), '--d:4s;--r0:-2deg;--r1:3deg;--oy:100%') + art('a-sway', 680, 322, 90, 60, tuft(true), '--d:5s;--dl:-2s;--r0:2deg;--r1:-3deg;--oy:100%');
    const echo = (t) => { t.pulse('echo', 3200); t.burst('ring', 'volcano', 0, 0.6); t.sfx('sparkle'); };
    return {
      id: 'meadow', place: '草坡', time: '晴空', cls: 'sc-meadow',
      cap: '风从远处的火山那边吹来，灰是白色的。',
      hint: '点点天上的云和远处的火山，她会放出对应的技能',
      back: `${lay('', 0, 0, 800, 470, back)}${mv}${props}`,
      fore,
      props: {
        rain: { cast: 'Skill1', run(t) { t.pulse('raining', 4200); t.sfx('whoosh'); } },
        shield: { cast: 'Skill2', run(t) { t.pulse('shielded', 3400); t.sfx('sparkle'); } },
        volcano: { cast: 'Skill3', run(t) { echo(t); } },
        sheep: { run(t, el) { t.burst('ash', el, 8, 0.2); t.say('咩——', el, 1600); } },
      },
      skill(id, t) {
        if (id === 'rain') t.pulse('raining', 4600);
        else if (id === 'shield') t.pulse('shielded', 3400);
        else if (id === 'echo') t.later(() => echo(t), 400);
      },
    };
  }

  /* ---------- 椰子树：树干（静态）+ 树冠（单独一层，会随风摆） ---------- */
  function palmTrunk(x, y, h, lean, c0, c1) {
    let s = '';
    const n = 14;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1.15) / n;
      const px = (t) => x + lean * t * t, py = (t) => y - h * t, w = (t) => 9 - 4 * t;
      s += `<path d="M${r1(px(t0) - w(t0))} ${r1(py(t0))} L${r1(px(t1) - w(t1))} ${r1(py(t1))} L${r1(px(t1) + w(t1))} ${r1(py(t1))} L${r1(px(t0) + w(t0))} ${r1(py(t0))}Z" fill="${i % 2 ? c0 : c1}"/><path d="M${r1(px(t1) - w(t1))} ${r1(py(t1))} l${r1(w(t1) * 2)} 2" stroke="#000" stroke-opacity=".18" stroke-width="1"/>`;
    }
    return s;
  }
  function palmCrown(cx, cy, L, c0, c1) {
    let s = '';
    [[-170, 1], [-140, 0.9], [-105, 0.75], [-70, 0.8], [-38, 0.95], [-8, 1], [150, 0.7], [30, 0.65]].forEach(([deg, k], i) => {
      const a = (deg * Math.PI) / 180, l = L * k, ex = cx + Math.cos(a) * l, ey = cy + Math.sin(a) * l + l * 0.45;
      const mx = cx + Math.cos(a) * l * 0.55, my = cy + Math.sin(a) * l * 0.55 - l * 0.08;
      const nx = -Math.sin(a) * l * 0.13, ny = Math.cos(a) * l * 0.13;
      s += `<path d="M${cx} ${cy} Q${r1(mx + nx)} ${r1(my + ny)} ${r1(ex)} ${r1(ey)} Q${r1(mx - nx)} ${r1(my - ny)} ${cx} ${cy}Z" fill="${i % 2 ? c0 : c1}"/><path d="M${cx} ${cy} Q${r1(mx)} ${r1(my)} ${r1(ex)} ${r1(ey)}" fill="none" stroke="#1f4a3a" stroke-width="1" opacity=".5"/>`;
      for (let j = 1; j < 6; j++) { const t = j / 6, qx = (1 - t) * (1 - t) * cx + 2 * (1 - t) * t * mx + t * t * ex, qy = (1 - t) * (1 - t) * cy + 2 * (1 - t) * t * my + t * t * ey; s += `<path d="M${r1(qx)} ${r1(qy)} l${r1(nx * 0.9)} ${r1(ny * 0.9 + 3)} M${r1(qx)} ${r1(qy)} l${r1(-nx * 0.9)} ${r1(-ny * 0.9 + 3)}" stroke="${i % 2 ? c1 : c0}" stroke-width="1.2" opacity=".8"/>`; }
    });
    s += `<g fill="#6a4a2a"><circle cx="${cx - 5}" cy="${cy + 6}" r="5"/><circle cx="${cx + 5}" cy="${cy + 7}" r="5"/><circle cx="${cx}" cy="${cy + 11}" r="4.6"/></g>`;
    return s;
  }
  /** 一条波浪线（周期 80，画 880 宽；图层向左平移一个周期就能无缝循环） */
  const waveLine = (y, amp, col, w, op) => `<path d="M0 ${y} ${Array.from({ length: 22 }, (_, i) => `Q${i * 40 + 20} ${y + (i % 2 ? amp : -amp)} ${i * 40 + 40} ${y}`).join(' ')}" fill="none" stroke="${col}" stroke-width="${w}" opacity="${op}" stroke-linecap="round"/>`;
  const gull = (x, y, st) => lay('a-glide', x, y, 18, 8, sub('a-flap', 0, 0, 100, 100, svg(18, 8, '<path d="M1 6 Q5 0 9 5 Q13 0 17 6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>'), '--d:.6s'), st);

  /* ====================================================================
   * 场景五 · 术师 · 夏卉 FA018：珊瑚海岸（基建 = 午后，作战 = 晚霞）
   * ==================================================================== */
  function beach(front) {
    const R = rng(5507);
    const id = { sky: nid('s'), sea: nid('e'), sand: nid('a'), sun: nid('u'), wet: nid('w'), path: nid('p'), towel: nid('t') };
    const sky = front ? [[0, '#2e1a52'], [0.35, '#8a3a7e'], [0.62, '#e8607a'], [0.82, '#ffa070'], [1, '#ffd89a']] : [[0, '#ff96c0'], [0.45, '#ffbfd2'], [0.8, '#ffdcca'], [1, '#fff0dc']];
    const sea = front ? [[0, '#5a3a8a'], [0.4, '#a8508a'], [1, '#f0907e']] : [[0, '#6ac4d4'], [0.5, '#8ed8d6'], [1, '#bff0e2']];
    const sun = front ? { x: 560, y: 204, r: 40 } : { x: 620, y: 78, r: 24 };
    let stars = '';
    if (front) for (let i = 0; i < 24; i++) stars += `<circle cx="${r1(R() * 800)}" cy="${r1(R() * 90)}" r="${r1(0.4 + R() * 0.8)}" opacity="${r1(0.3 + R() * 0.6)}"/>`;
    let shells = '';
    for (let i = 0; i < 12; i++) { const x = R() * 800, y = 380 + R() * 80, c = pick(R, ['#fff4ec', '#ffd0dc', '#f4e0c8']); shells += R() < 0.5 ? `<path d="M${r1(x)} ${r1(y)} a5 5 0 0 1 10 0 z" fill="${c}" stroke="#d8a888" stroke-width=".6"/><path d="M${r1(x + 5)} ${r1(y)} v-4 M${r1(x + 2.5)} ${r1(y)} l1 -3.4 M${r1(x + 7.5)} ${r1(y)} l-1 -3.4" stroke="#d8a888" stroke-width=".5"/>` : `<path d="${spark(x, y, 4)}" fill="${c}" opacity=".85"/>`; }
    const back = svg(800, 470, `<defs>
      ${lin(id.sky, sky)}${lin(id.sea, sea)}
      ${lin(id.sand, [[0, front ? '#e8b098' : '#ffe6c8'], [1, front ? '#c88a78' : '#f2c8a0']])}
      ${rad(id.sun, [[0, '#fff8e0', 1], [0.2, front ? '#ffd080' : '#fff6e0', 0.8], [1, front ? '#ff8a6a' : '#ffd0e0', 0]])}
      ${lin(id.wet, [[0, front ? '#a86a78' : '#e8c09a'], [1, front ? '#c88a78' : '#f2c8a0', 0]])}
      ${lin(id.path, [[0, '#fff4d0', 0.9], [1, '#fff4d0', 0]])}
    </defs>
    <rect width="800" height="360" fill="url(#${id.sky})"/>
    <g fill="#fff">${stars}</g>
    <circle cx="${sun.x}" cy="${sun.y}" r="${sun.r * 4}" fill="url(#${id.sun})" opacity=".8"/>
    <circle cx="${sun.x}" cy="${sun.y}" r="${sun.r}" fill="${front ? '#ffe2a0' : '#fffaf0'}"/>
    <!-- 远处冒烟的火山小岛 -->
    <path d="M110 206 L150 176 C156 170 162 168 168 168 L176 168 C184 172 190 176 200 186 L236 206Z" fill="${front ? '#5a2a5e' : '#c49ac0'}" opacity=".85"/>
    <path d="M150 176 C156 170 162 168 168 168 L176 168 C184 172 190 176 196 182" fill="none" stroke="${front ? '#ff9a6a' : '#fff'}" stroke-width="1.4" opacity=".7"/>
    <!-- 海 -->
    <rect y="204" width="800" height="100" fill="url(#${id.sea})"/>
    <path d="M0 204 H800" stroke="#fff" stroke-width="1.4" opacity=".6"/>
    ${front ? `<path d="M${sun.x - 40} 206 L${sun.x + 40} 206 L${sun.x + 90} 300 L${sun.x - 90} 300Z" fill="url(#${id.path})" opacity=".55"/>` : `<path d="M${sun.x - 16} 206 L${sun.x + 16} 206 L${sun.x + 50} 300 L${sun.x - 50} 300Z" fill="url(#${id.path})" opacity=".35"/>`}
    <!-- 沙滩 -->
    <path d="M0 296 C120 288 260 294 400 290 C540 286 680 294 800 290 V360 H0Z" fill="url(#${id.sand})"/>
    <path d="M0 296 C120 288 260 294 400 290 C540 286 680 294 800 290 V310 C680 312 540 306 400 310 C260 314 120 306 0 312Z" fill="url(#${id.wet})" opacity=".8"/>
    <!-- 椰子树（左）树干 -->
    ${palmTrunk(152, 362, 250, 60, front ? '#6a3e3a' : '#a9785a', front ? '#7e4a42' : '#bf8c68')}
    ${palmTrunk(716, 362, 210, -40, front ? '#6a3e3a' : '#a9785a', front ? '#7e4a42' : '#bf8c68')}
    <!-- 遮阳伞的杆、沙滩上的毛巾 -->
    <path d="M232 362 L244 236" stroke="#f4f0f6" stroke-width="3.4"/><path d="M232 362 L244 236" stroke="#b8a8c0" stroke-width="1" opacity=".6"/>
    <rect y="360" width="800" height="110" fill="url(#${id.sand})"/>
    <path d="M0 360 H800" stroke="#000" stroke-opacity=".06" stroke-width="4"/>
    ${shells}
    <g transform="translate(560 406) skewX(-24)"><rect x="-60" y="-14" width="120" height="30" rx="2" fill="#ff9ab8"/><g fill="#fff" opacity=".55">${Array.from({ length: 6 }, (_, i) => `<rect x="${-60 + i * 20}" y="-14" width="10" height="30"/>`).join('')}${Array.from({ length: 3 }, (_, i) => `<rect x="-60" y="${-14 + i * 10}" width="120" height="5"/>`).join('')}</g><path d="M-60 16 h120" stroke="#fff" stroke-width="2" stroke-dasharray="2 3"/></g>
    <g fill="none" stroke="#c89878" stroke-width="1" opacity=".5">${Array.from({ length: 6 }, (_, i) => `<ellipse cx="${480 + i * 26}" cy="${448 - i * 12}" rx="5" ry="2.4" transform="rotate(-20 ${480 + i * 26} ${448 - i * 12})"/>`).join('')}</g>`);

    let mv = '';
    if (front) {
      [[80, 40], [300, 26], [720, 30], [420, 60]].forEach(([x, y], i) => { mv += art('a-tw', x, y, 8, 8, `<path d="${spark(4, 4, 3.4)}" fill="#fff"/>`, `--d:${r1(2.6 + i * 0.6)}s;--dl:${-i}s`); });
    }
    // 长条的粉色云
    mv += art('a-drift', 40, front ? 90 : 60, 260, 40, `<g fill="${front ? '#ffb0c0' : '#fff'}" opacity="${front ? 0.55 : 0.8}"><ellipse cx="120" cy="20" rx="110" ry="9"/><ellipse cx="80" cy="12" rx="50" ry="8"/><ellipse cx="170" cy="28" rx="70" ry="6"/></g>`, '--d:60s;--dx:40%');
    mv += art('a-drift', 460, front ? 120 : 36, 240, 36, `<g fill="${front ? '#ffc8a0' : '#fff'}" opacity="${front ? 0.5 : 0.75}"><ellipse cx="120" cy="18" rx="100" ry="8"/><ellipse cx="160" cy="10" rx="50" ry="7"/></g>`, '--d:72s;--dl:-30s;--dx:-35%');
    // 太阳（晚霞里在呼吸）
    mv += glow('a-pulse', sun.x, sun.y, sun.r * 6, sun.r * 5, front ? 'rgba(255,190,120,.5)' : 'rgba(255,250,230,.6)', '--d:5s;--o0:.5;--o1:1');
    // 小岛上的烟
    for (let i = 0; i < 2; i++) mv += art('a-smoke', 160 + i * 6, 146 - i * 6, 26, 22, cloud(13, 18, 22, 12, front ? '#8a5a8a' : '#fff', rng(51 + i)), `--d:${8 + i * 2}s;--dl:${-i * 4}s;--dx:-60%;--dy:-80%;--o1:.8`);
    // 海浪：三排波纹向左流、岸边的白沫一涨一落
    [[222, 1.6, 0.35, 26], [246, 2.2, 0.45, 20], [270, 2.8, 0.55, 15]].forEach(([y, a, op, d], i) => { mv += art('a-wave', -40, y - 6, 880, 12, waveLine(6, a, '#fff', 1.4 + i * 0.3, op), `--d:${d}s;--dx:-9.0909%`); });
    mv += art('a-bob', -20, 284, 840, 22, `<path d="M0 14 ${Array.from({ length: 21 }, (_, i) => `Q${i * 40 + 20} ${i % 2 ? 22 : 6} ${i * 40 + 40} 14`).join(' ')} V22 H0Z" fill="#fff" opacity=".75"/>`, '--d:3.2s;--dy:-22%');
    // 波光
    for (let i = 0; i < 14; i++) { const y = 212 + R() * 80, spread = 20 + (y - 206) * 0.8; mv += art('a-tw', sun.x - spread + R() * spread * 2, y, 8, 4, `<path d="M0 2 H8" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>`, `--d:${r1(1.2 + R() * 1.6)}s;--dl:${r1(-R() * 3)}s;--o0:0`); }
    // 海鸥、沿着岸边横着走的小螃蟹
    mv += gull(700, 90, '--d:30s;--dx:-4200%;--dy:-200%');
    mv += gull(760, 130, '--d:38s;--dl:-14s;--dx:-4400%;--dy:120%');
    mv += lay('a-glide crab', 700, 300, 22, 14, svg(22, 14, `<ellipse cx="11" cy="9" rx="7" ry="4.4" fill="#ff7a5a"/><path d="M4 9 q-4 -5 -2 -7 M18 9 q4 -5 2 -7" stroke="#ff7a5a" stroke-width="2" fill="none"/><circle cx="2" cy="2" r="2" fill="#ff7a5a"/><circle cx="20" cy="2" r="2" fill="#ff7a5a"/><path d="M6 12 l-3 2 M9 13 l-1 2 M13 13 l1 2 M16 12 l3 2" stroke="#e05a3a" stroke-width="1"/><circle cx="9" cy="6" r="1" fill="#2a1a1a"/><circle cx="13" cy="6" r="1" fill="#2a1a1a"/>`), '--d:34s;--dl:-8s;--dx:-2600%;--dy:10%');
    // 椰子树冠（随风摆）
    mv += art('a-sway', 142, 62, 140, 130, palmCrown(70, 50, 76, front ? '#2e6a52' : '#4aa27a', front ? '#23543f' : '#3a8a64'), '--d:5s;--r0:-2deg;--r1:2.5deg;--ox:50%;--oy:38%');
    mv += art('a-sway', 620, 102, 120, 120, palmCrown(56, 50, 64, front ? '#2e6a52' : '#4aa27a', front ? '#23543f' : '#3a8a64'), '--d:6s;--dl:-2s;--r0:2deg;--r1:-2.5deg;--ox:47%;--oy:42%');

    // —— 道具 ——
    // 遮阳伞（粉色格纹，和泳装同款）
    const umb = (() => {
      const cp = nid('uc');
      let shape = 'M4 40 C8 14 36 4 70 4 C104 4 132 14 136 40';
      for (let i = 0; i < 8; i++) shape += ` Q${r1(136 - 16.5 * i - 8.25)} 48 ${r1(136 - 16.5 * (i + 1))} 40`;
      shape += 'Z';
      let gores = '';
      for (let i = 0; i < 8; i++) gores += `<path d="M70 -40 L${r1(4 + i * 16.5)} 52 L${r1(4 + (i + 1) * 16.5)} 52Z" fill="${i % 2 ? '#fff6f9' : '#ff8ab0'}"/>`;
      return `<defs><clipPath id="${cp}"><path d="${shape}"/></clipPath></defs><g clip-path="url(#${cp})">${gores}<g stroke="#ff5a90" stroke-width="1" opacity=".35">${[14, 22, 30, 38].map((y) => `<path d="M0 ${y} H140"/>`).join('')}</g><path d="M20 30 C30 14 50 9 70 8" stroke="#fff" stroke-width="3" fill="none" opacity=".45"/></g><path d="${shape}" fill="none" stroke="#e8609a" stroke-width="1.2"/><circle cx="70" cy="3" r="3.4" fill="#ff8ab0" stroke="#e8609a"/>`;
    })();
    let props = prop('parasol', '遮阳伞', 174, 190, 140, 50, umb, '', '--hx:50%;--hy:20%');
    // 海浪里套着游泳圈的小黑羊（踩着浪花）
    const ring = `${sheepIn(60, 44, 0.95, SHEEP.black, { flip: true })}<ellipse cx="30" cy="38" rx="26" ry="8" fill="none" stroke="#ff8ab0" stroke-width="7"/><ellipse cx="30" cy="38" rx="26" ry="8" fill="none" stroke="#fff" stroke-width="7" stroke-dasharray="10 12"/><path d="M8 40 q22 8 44 0" stroke="#fff" stroke-width="1.2" fill="none" opacity=".6"/>`;
    props += `<button type="button" class="tp a-bob hint" data-prop="sheep" aria-label="游泳圈里的小黑羊" title="游泳圈里的小黑羊" style="--x:440;--y:224;--w:60;--h:48;--d:2.4s;--dy:-10%;--r0:-4deg;--r1:5deg;--hx:40%;--hy:20%"><span class="tp-in"><span class="tp-b">${svg(60, 48, ring)}</span></span></button>`;
    // 沙滩球
    const ball = (() => { const cols = ['#ff5a7a', '#fff', '#ffc84a', '#fff', '#4ab0ff', '#fff']; let s = ''; for (let i = 0; i < 6; i++) { const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2; s += `<path d="M18 18 L${r1(18 + Math.cos(a0) * 16)} ${r1(18 + Math.sin(a0) * 16)} A16 16 0 0 1 ${r1(18 + Math.cos(a1) * 16)} ${r1(18 + Math.sin(a1) * 16)}Z" fill="${cols[i]}"/>`; } return `<ellipse cx="18" cy="35" rx="13" ry="2.4" fill="#000" opacity=".15"/>${s}<circle cx="18" cy="18" r="16" fill="none" stroke="#c86a8a" stroke-width="1"/><circle cx="18" cy="18" r="3.4" fill="#fff" stroke="#c86a8a" stroke-width=".8"/><ellipse cx="12" cy="11" rx="4" ry="2.4" fill="#fff" opacity=".6" transform="rotate(-30 12 11)"/>`; })();
    props += prop('ball', '沙滩球', 520, 322, 36, 38, ball, 'hint', '--hx:50%;--hy:10%');
    // 堆成火山的沙堡
    const castle = `<path d="M4 60 L26 22 C29 17 33 16 36 16 L44 16 C47 16 51 17 54 22 L76 60Z" fill="#f2cc9a" stroke="#c8966a" stroke-width="1.2"/><path d="M26 22 C29 17 33 16 36 16 L44 16 C47 16 51 17 54 22 C48 25 44 20 40 24 C36 20 32 25 26 22Z" fill="#d8a878"/><g fill="#c8966a" opacity=".6">${Array.from({ length: 14 }, () => `<circle cx="${r1(14 + R() * 52)}" cy="${r1(30 + R() * 26)}" r=".9"/>`).join('')}</g><path d="M40 16 V2" stroke="#8a6a4a" stroke-width="1.2"/><path d="M40 2 L50 5 L40 8Z" fill="#ff8ab0"/><path d="M10 60 q30 -6 60 0" stroke="#fff" stroke-width="1.4" fill="none" opacity=".4"/>`;
    props += prop('castle', '堆成火山的沙堡', 590, 302, 80, 62, castle, 'hint', '--hx:50%;--hy:30%');
    const fore = art('', 0, 330, 120, 50, `<g stroke="#6aa06a" stroke-width="2.4" fill="none" stroke-linecap="round">${Array.from({ length: 10 }, (_, i) => `<path d="M${10 + i * 9} 50 q${i % 2 ? 6 : -4} -${16 + (i % 3) * 8} ${i % 2 ? 12 : -2} -${26 + (i % 4) * 6}"/>`).join('')}</g>`) +
      art('', 700, 336, 100, 40, `<g stroke="#6aa06a" stroke-width="2.4" fill="none" stroke-linecap="round">${Array.from({ length: 8 }, (_, i) => `<path d="M${14 + i * 10} 40 q${i % 2 ? -6 : 4} -${14 + (i % 3) * 6} ${i % 2 ? -12 : 4} -${22 + (i % 4) * 5}"/>`).join('')}</g>`) +
      (front ? rune('base') : '');
    return {
      id: 'beach', place: '珊瑚海岸', time: front ? '晚霞' : '午后', cls: 'sc-beach' + (front ? ' st-dusk' : ''),
      cap: front ? '粉色晚霞下的棕榈海岸，小黑羊在身后踩着浪花。' : '研究火山的人，也可以尽情玩水。',
      hint: '点点沙滩球、火山沙堡和游泳圈里的小黑羊',
      back: `${lay('', 0, 0, 800, 470, back)}${mv}${props}`,
      fore,
      auto: ['ball', 'castle', 'parasol'],
      props: {
        ball: { react: 'Interact', cast: 'Attack', run(t) { t.kick('ball', 'roll'); t.sfx('tick'); } },
        castle: { react: 'Interact', cast: 'Attack', run(t, el) { t.pulse('sand', 1800); t.burst('ember', el, 12, 0.25); t.say(pick(Math.random, ['小心——它要喷发了！', '沙子堆的火山，也有火山口哦。']), el); t.sfx('whoosh'); } },
        sheep: { walk: false, run(t, el) { t.kick(el, 'splash'); t.burst('ash', el, 10, 0.6); t.say('小黑羊在踩浪花——', el, 2200); } },
        parasol: { react: 'Interact', run(t) { t.kick('parasol', 'spin'); t.say('海风好大，伞差点被吹跑。', 'parasol'); } },
      },
    };
  }

  /* ====================================================================
   * 场景六 · 术师 · 绵绒小魔女：夜色城市与巨大的钟面（基建 = 夜，作战 = 午夜）
   * ==================================================================== */
  function magic(front) {
    const R = rng(6607);
    const id = { sky: nid('s'), moon: nid('m'), face: nid('f'), glow: nid('g'), stone: nid('t'), road: nid('r'), pool: nid('p') };
    const sky = front ? [[0, '#0b0826'], [0.45, '#2a1a56'], [0.78, '#6a2a78'], [1, '#c05a8a']] : [[0, '#121436'], [0.5, '#2a2458'], [0.8, '#523a7a'], [1, '#8a5a90']];
    let stars = '';
    for (let i = 0; i < 60; i++) stars += `<circle cx="${r1(R() * 800)}" cy="${r1(R() * 190)}" r="${r1(0.4 + R() * 1)}" opacity="${r1(0.3 + R() * 0.7)}"/>`;
    // 城市剪影：一栋栋楼，窗户亮着暖光
    let city = '', wins = '';
    const bld = (x, w, h, c, roof) => {
      const y = 320 - h;
      let s = `<rect x="${x}" y="${y}" width="${w}" height="${h + 40}" fill="${c}"/>`;
      if (roof === 1) s += `<path d="M${x - 3} ${y} L${x + w / 2} ${y - w * 0.5} L${x + w + 3} ${y}Z" fill="${c}"/>`;
      if (roof === 2) s += `<path d="M${x} ${y} Q${x + w / 2} ${y - w * 0.7} ${x + w} ${y}Z" fill="${c}"/><path d="M${x + w / 2} ${y - w * 0.62} v-10" stroke="${c}" stroke-width="2"/>`;
      for (let yy = y + 8; yy < 312; yy += 14) for (let xx = x + 5; xx < x + w - 7; xx += 11) if (R() < 0.42) wins += `<rect x="${xx}" y="${yy}" width="5" height="7" rx="1" fill="${pick(R, ['#ffd98a', '#ffc070', '#ffb0d0', '#fff0c0'])}" opacity="${r1(0.55 + R() * 0.45)}"/>`;
      return s;
    };
    [[0, 60, 120, '#2a2150', 0], [58, 48, 90, '#241c48', 1], [104, 70, 150, '#2e2456', 2], [170, 50, 100, '#261e4a', 1], [218, 64, 130, '#2a2150', 0], [280, 44, 80, '#241c48', 1], [322, 60, 110, '#2e2456', 0], [380, 50, 94, '#2a2150', 2], [428, 56, 120, '#261e4a', 0], [690, 60, 140, '#2a2150', 1], [748, 52, 100, '#2e2456', 0]].forEach((b) => { city += bld(...b); });
    const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    const cx = 600, cy = 118, CR = 74;
    const face = `<circle cx="${cx}" cy="${cy}" r="${CR + 10}" fill="#5a3a8a"/><circle cx="${cx}" cy="${cy}" r="${CR + 5}" fill="none" stroke="#e8c27a" stroke-width="2.4"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${CR}" fill="url(#${id.face})"/><circle cx="${cx}" cy="${cy}" r="${CR - 16}" fill="none" stroke="#f3a8c4" stroke-width="1.2" stroke-dasharray="2 4"/>` +
      numerals.map((n, i) => { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; return `<text x="${r1(cx + Math.cos(a) * (CR - 9))}" y="${r1(cy + Math.sin(a) * (CR - 9) + 3.4)}" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-size="9.5" font-weight="700" fill="#5a3a8a">${n}</text>`; }).join('') +
      Array.from({ length: 60 }, (_, i) => { const a = (i / 60) * Math.PI * 2; const r0 = CR - (i % 5 ? 2 : 4); return `<path d="M${r1(cx + Math.cos(a) * r0)} ${r1(cy + Math.sin(a) * r0)} L${r1(cx + Math.cos(a) * CR)} ${r1(cy + Math.sin(a) * CR)}" stroke="#8a6aaa" stroke-width="${i % 5 ? 0.6 : 1.4}"/>`; }).join('') +
      `<path d="${spark(cx, cy + 28, 7)} ${spark(cx - 26, cy - 22, 4)} ${spark(cx + 28, cy - 16, 3)}" fill="#f3a8c4" opacity=".7"/>`;
    const back = svg(800, 470, `<defs>
      ${lin(id.sky, sky)}
      ${rad(id.moon, [[0, '#fff4e0', 0.6], [1, '#fff4e0', 0]])}
      ${rad(id.face, [[0, '#fffaf2'], [0.8, '#fff0e6'], [1, '#f6d8e6']])}
      ${lin(id.stone, [[0, '#5a4a86'], [1, '#3a2c62']])}
      ${lin(id.road, [[0, '#5a4a78'], [1, '#2e2448']])}
      ${rad(id.pool, [[0, '#ffd98a', 0.45], [1, '#ffd98a', 0]])}
    </defs>
    <rect width="800" height="360" fill="url(#${id.sky})"/>
    <g fill="#fff">${stars}</g>
    <circle cx="170" cy="74" r="70" fill="url(#${id.moon})"/>
    <path d="M170 48 a26 26 0 1 0 22 40 a21 21 0 1 1 -22 -40z" fill="#fff4dc"/>
    <!-- 钟楼 -->
    <rect x="${cx - 62}" y="${cy + 40}" width="124" height="240" fill="url(#${id.stone})"/>
    <g fill="none" stroke="#7a6aa6" stroke-width="1" opacity=".5">${Array.from({ length: 16 }, (_, i) => `<path d="M${cx - 62} ${cy + 52 + i * 15} h124"/>`).join('')}</g>
    <rect x="${cx - 22}" y="${cy + 150}" width="44" height="70" rx="22" fill="#2a1e4a"/><rect x="${cx - 16}" y="${cy + 156}" width="32" height="60" rx="16" fill="#ffd98a" opacity=".55"/>
    <path d="M${cx - 76} ${cy + 44} h152 l-10 -10 h-132z" fill="#6a5a9a"/>
    <path d="M${cx - 50} ${cy - 76} L${cx} ${cy - 150} L${cx + 50} ${cy - 76}Z" fill="#4a3a7a"/><path d="M${cx} ${cy - 150} v-12" stroke="#e8c27a" stroke-width="2"/><path d="${spark(cx, cy - 168, 6)}" fill="#ffe08a"/>
    ${face}
    <!-- 城市 -->
    <g>${city}</g><g>${wins}</g>
    <!-- 广场：石板路 -->
    <rect y="320" width="800" height="40" fill="#3a2e5e"/>
    <path d="M0 320 H800" stroke="#8a7ab8" stroke-width="1.4" opacity=".6"/>
    <rect y="360" width="800" height="110" fill="url(#${id.road})"/>
    <g fill="none" stroke="#7a6aa0" stroke-width="1" opacity=".45">${Array.from({ length: 7 }, (_, k) => { const y = 364 + k * k * 2.6 + k * 6; return `<path d="M0 ${r1(y)} H800"/>` + Array.from({ length: 16 }, (_, i) => { const x = (i + (k % 2) * 0.5) * (52 + k * 6) - 20; return `<path d="M${r1(x)} ${r1(y)} v${r1(4 + k * 2.4)}"/>`; }).join(''); }).join('')}</g>
    <ellipse cx="300" cy="380" rx="120" ry="16" fill="url(#${id.pool})"/>
    <!-- 路灯 -->
    <g><path d="M300 360 V230" stroke="#2a1e44" stroke-width="5"/><path d="M300 360 V230" stroke="#6a5a9a" stroke-width="1.4"/><path d="M292 360 h16" stroke="#2a1e44" stroke-width="5"/></g>
    <!-- 长椅 -->
    <g><rect x="140" y="318" width="130" height="7" rx="3" fill="#8a5a6a"/><rect x="140" y="296" width="130" height="6" rx="3" fill="#8a5a6a"/><rect x="140" y="306" width="130" height="5" rx="2.5" fill="#7a4a5a"/><path d="M150 325 v34 M260 325 v34 M150 296 v30 M260 296 v30" stroke="#3a2a44" stroke-width="4"/></g>`);

    let mv = '';
    // 星星闪烁、月光
    for (let i = 0; i < 8; i++) mv += art('a-tw', R() * 780, R() * 170, 10, 10, `<path d="${spark(5, 5, 4.4)}" fill="${pick(R, ['#fff', '#ffe0f0', '#fff4c0'])}"/>`, `--d:${r1(2 + R() * 2.5)}s;--dl:${r1(-R() * 4)}s`);
    mv += glow('a-pulse', 170, 74, 200, 200, 'rgba(255,240,210,.35)', '--d:6s;--o0:.6;--o1:1');
    // 钟面的光晕、指针（分针一分钟一圈、时针十二分钟一圈——这是魔法钟）
    mv += glow('a-pulse clockglow', cx, cy, 260, 260, 'rgba(255,200,230,.3)', '--d:4s;--o0:.4;--o1:1');
    mv += art('a-spin hand-h', cx - 50, cy - 50, 100, 100, `<path d="M50 50 L47 26 L50 18 L53 26Z" fill="#4a2a6a"/><circle cx="50" cy="50" r="4" fill="#4a2a6a"/>`, '--d:720s;--dl:-250s');
    mv += art('a-spin hand-m', cx - 70, cy - 70, 140, 140, `<path d="M70 70 L68.4 18 L70 10 L71.6 18Z" fill="#6a3a8a"/><path d="${spark(70, 12, 4)}" fill="#f3a8c4"/><circle cx="70" cy="70" r="3" fill="#f3a8c4"/>`, '--d:60s;--dl:-17s');
    // 窗户一闪一闪
    for (let i = 0; i < 7; i++) mv += art('a-blink', 20 + R() * 460, 210 + R() * 90, 5, 7, `<rect width="5" height="7" rx="1" fill="#ffe7a8"/>`, `--d:${r1(4 + R() * 6)}s;--dl:${r1(-R() * 6)}s;--o0:.1`);
    // 彩旗与小灯串（在两栋楼之间）
    const flags = Array.from({ length: 12 }, (_, i) => { const t = i / 11, x = 10 + t * 340, y = 16 + Math.sin(t * Math.PI) * 30; return `<path d="M${r1(x - 6)} ${r1(y)} L${r1(x + 6)} ${r1(y)} L${r1(x)} ${r1(y + 12)}Z" fill="${['#ffb0d0', '#c8b0ff', '#fff0b0', '#a8e0ff'][i % 4]}"/>`; }).join('');
    mv += art('a-sway', 100, 128, 360, 60, `<path d="M10 16 Q180 76 350 16" fill="none" stroke="#e8c27a" stroke-width="1"/>${flags}`, '--d:5s;--r0:-.6deg;--r1:.8deg;--ox:50%;--oy:0%');
    // 魔法的光点慢慢升起
    for (let i = 0; i < 12; i++) mv += art('a-rise', 60 + R() * 700, 240 + R() * 110, 12, 12, `<path d="${spark(6, 6, 4)}" fill="${pick(R, ['#ffb0d8', '#fff0b0', '#d8c0ff'])}"/>`, `--d:${r1(6 + R() * 5)}s;--dl:${r1(-R() * 10)}s;--dx:${r1((R() - 0.5) * 400)}%;--dy:${r1(-800 - R() * 900)}%`);
    // 路灯的光
    mv += glow('a-flick lamp-glow', 300, 226, 150, 150, 'rgba(255,215,140,.55)', '--d:6s');
    // 流星雨（点月亮）
    [[380, 20, 0], [520, 50, 0.35], [260, 60, 0.7], [700, 10, 0.2], [440, 90, 0.9]].forEach(([x, y, dl]) => { mv += art('meteor', x, y, 60, 24, `<path d="M60 0 L0 24" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M60 0 L30 12" stroke="#ffe0f0" stroke-width="3" stroke-linecap="round" opacity=".5"/>`, `--dl:${dl}s`); });
    // 气球
    const balloon = (c, hl) => `<path d="M18 50 Q14 60 20 70" stroke="#e8e0f0" stroke-width="1" fill="none"/><ellipse cx="18" cy="24" rx="15" ry="19" fill="${c}"/><path d="M15 43 l3 5 l3 -5z" fill="${c}"/><ellipse cx="12" cy="16" rx="4" ry="6" fill="${hl}" opacity=".6"/>`;
    mv += art('a-bob', 188, 190, 36, 70, balloon('#c8b0ff', '#fff'), '--d:3.4s;--dl:-1s;--dy:-6%;--r0:-4deg;--r1:3deg');
    mv += art('a-bob', 226, 176, 36, 70, balloon('#a8e0ff', '#fff'), '--d:3s;--dy:-7%;--r0:3deg;--r1:-4deg');

    // —— 道具 ——
    let props = `<button type="button" class="tp tp-area hint" data-prop="clock" aria-label="巨大的钟面" title="巨大的钟面" style="--x:${cx - 84};--y:${cy - 84};--w:168;--h:168;--hx:50%;--hy:50%"></button>`;
    props += prop('balloon', '粉色气球', 158, 168, 36, 72, balloon('#ffb0d0', '#fff'), 'hint a-bob', '--d:2.8s;--dy:-8%;--r0:-3deg;--r1:4deg;--hx:50%;--hy:30%');
    // 长椅上的毛绒朋友们（没有照着任何角色画）
    const plush = `<g transform="translate(20 44)"><ellipse cx="0" cy="-12" rx="12" ry="11" fill="#fff4f8" stroke="#d8a0c0"/><ellipse cx="-6" cy="-30" rx="4" ry="10" fill="#fff4f8" stroke="#d8a0c0"/><ellipse cx="6" cy="-30" rx="4" ry="10" fill="#fff4f8" stroke="#d8a0c0"/><ellipse cx="-6" cy="-29" rx="1.8" ry="6" fill="#ffc0d8"/><ellipse cx="6" cy="-29" rx="1.8" ry="6" fill="#ffc0d8"/><circle cx="-4" cy="-14" r="1.3" fill="#3a2a3a"/><circle cx="4" cy="-14" r="1.3" fill="#3a2a3a"/><ellipse cx="0" cy="-10" rx="1.6" ry="1" fill="#ff90b0"/><path d="M-8 -4 q8 5 16 0" fill="#ffc0d8"/></g>` +
      `<g transform="translate(52 44)"><ellipse cx="0" cy="-12" rx="13" ry="12" fill="#d8b89a" stroke="#a88a6a"/><circle cx="-10" cy="-22" r="5" fill="#d8b89a" stroke="#a88a6a"/><circle cx="10" cy="-22" r="5" fill="#d8b89a" stroke="#a88a6a"/><circle cx="-10" cy="-22" r="2.4" fill="#f0d8c0"/><circle cx="10" cy="-22" r="2.4" fill="#f0d8c0"/><circle cx="-4" cy="-14" r="1.3" fill="#3a2a2a"/><circle cx="4" cy="-14" r="1.3" fill="#3a2a2a"/><ellipse cx="0" cy="-9" rx="4" ry="3" fill="#f0d8c0"/><circle cx="0" cy="-10" r="1.1" fill="#3a2a2a"/><path d="M-6 -30 l6 4 l6 -4 v6 l-6 -3 l-6 3z" fill="#c8b0ff"/></g>`;
    props += prop('plush', '毛绒朋友们', 176, 262, 74, 46, plush, 'hint', '--hx:30%;--hy:20%');
    props += `<button type="button" class="tp tp-area" data-prop="lamp" aria-label="路灯" title="路灯" style="--x:282;--y:200;--w:36;--h:160"></button>`;
    props += `<button type="button" class="tp tp-area" data-prop="moon" aria-label="月亮" title="月亮" style="--x:130;--y:34;--w:80;--h:80"></button>`;
    mv += art('lamp-head', 284, 206, 32, 30, `<path d="M4 22 L10 6 H22 L28 22Z" fill="#6a5a9a" stroke="#2a1e44"/><rect x="10" y="10" width="12" height="10" fill="#ffe7a8"/><path d="M8 4 H24 L16 -2Z" fill="#2a1e44"/><path d="M16 22 V30" stroke="#2a1e44" stroke-width="3"/>`);
    const fore = (front ? rune('base') : '') + art('a-rise', 380, 330, 12, 12, `<path d="${spark(6, 6, 5)}" fill="#fff0b0"/>`, '--d:5s;--dx:200%;--dy:-1600%') + art('a-rise', 520, 340, 12, 12, `<path d="${spark(6, 6, 4)}" fill="#ffb0d8"/>`, '--d:6s;--dl:-3s;--dx:-200%;--dy:-1500%');
    return {
      id: 'magic', place: front ? '巨大的钟面' : '钟楼下的广场', time: front ? '午夜' : '夜', cls: 'sc-magic' + (front ? ' st-mid' : ''),
      cap: front ? '撑起阳伞、戴上礼帽——魔法少女的梦，在钟声里开场。' : '勘查报告和监测数据先放一边，今晚和毛绒朋友们玩个痛快。',
      hint: '点点巨大的钟面、气球和长椅上的毛绒朋友',
      back: `${lay('', 0, 0, 800, 470, back)}${mv}${props}`,
      fore,
      auto: ['plush', 'balloon', 'lamp'],
      props: {
        clock: { walk: false, cast: 'Skill', run(t, el) { t.pulse('chime', 2600); t.burst('ring', el, 0, 0.5); t.burst('ember', el, 16, 0.5); t.sfx('sparkle'); t.say(pick(Math.random, ['当——当——魔法开始了。', '十二点的钟声还没敲完呢。']), el); } },
        balloon: { react: 'Interact', run(t) { t.kick('balloon', 'fly'); t.say('啊，气球！……它自己飘回来了。', 'balloon'); } },
        plush: { react: 'Interact', run(t) { t.kick('plush', 'hop'); t.sfx('tick'); t.say(pick(Math.random, ['毛绒朋友们也来参加今晚的派对。', '这只兔子的耳朵软软的。']), 'plush'); } },
        lamp: { react: 'Interact', run(t, el) { t.pulse('lamp-pop', 1400); t.burst('ember', el, 10, 0.1); } },
        moon: { walk: false, run(t) { t.pulse('shower', 3000); t.sfx('sparkle'); } },
      },
      skill(id, t) { if (id === 'volcano') t.pulse('chime', 2600); },
    };
  }

  /* ====================================================================
   * 场景七 · 医疗 · 远行前的野餐：甜点舞台（大家都被变小了；基建 = 午后，作战 = 日落）
   * ==================================================================== */
  function picnic(front) {
    const R = rng(7703);
    const id = { sky: nid('s'), sun: nid('u'), cream: nid('c'), sponge: nid('p'), cup: nid('k'), tea: nid('t'), blanket: nid('b'), hill: nid('h') };
    const sky = front ? [[0, '#7f8ee0'], [0.38, '#e8a8cc'], [0.7, '#ffc8a0'], [1, '#fff0c4']] : [[0, '#8fd0ff'], [0.6, '#d4eeff'], [1, '#fff4fa']];
    // 格子野餐布（透视）：竖条与横条叠出格纹
    let cols = '', rows = '';
    for (let i = -12; i <= 24; i++) {
      if (i % 2) continue;
      const x0 = i * 40, x1 = x0 + 40, t0 = 400 + (x0 - 400) * 0.55, t1 = 400 + (x1 - 400) * 0.55;
      cols += `<path d="M${r1(t0)} 340 L${r1(t1)} 340 L${r1(x1)} 470 L${r1(x0)} 470Z"/>`;
    }
    [[340, 352], [364, 380], [398, 422], [448, 470]].forEach(([a, b]) => { rows += `<rect x="0" y="${a}" width="800" height="${b - a}"/>`; });
    const lace = Array.from({ length: 40 }, (_, i) => `<circle cx="${i * 20 + 10}" cy="340" r="7"/>`).join('');
    const drip = (x, y, w) => { let s = `M${x} ${y}`; for (let i = 0; i < 6; i++) { const xx = x + ((i + 1) * w) / 6, d = 4 + R() * 8; s += ` L${r1(xx - w / 12)} ${r1(y)} Q${r1(xx - w / 12)} ${r1(y + d)} ${r1(xx)} ${r1(y + d * 0.6)} Q${r1(xx + 2)} ${r1(y)} ${r1(xx)} ${r1(y)}`; } return s; };
    const back = svg(800, 470, `<defs>
      ${lin(id.sky, sky)}
      ${rad(id.sun, [[0, '#fffbe8', 1], [0.25, front ? '#ffe0a0' : '#fffbe8', 0.8], [1, front ? '#ffb080' : '#fff4d0', 0]])}
      ${lin(id.cream, [[0, '#ffffff'], [1, '#fbeee6']])}
      ${lin(id.sponge, [[0, '#ffe2a0'], [1, '#f2c276']])}
      ${lin(id.cup, [[0, '#ffffff'], [1, '#eef0fa']], 1, 0)}
      ${lin(id.tea, [[0, '#e8a870'], [1, '#c8804a']])}
      ${lin(id.blanket, [[0, '#fff4f6'], [1, '#ffe8ee']])}
      ${lin(id.hill, [[0, '#ffffff'], [1, '#f6e6ee']])}
    </defs>
    <rect width="800" height="360" fill="url(#${id.sky})"/>
    <!-- 云间升起的彩虹桥 -->
    <g fill="none" stroke-width="9" opacity="${front ? 0.3 : 0.45}">${['#ffb3c8', '#ffe08a', '#a6e3b8', '#9fc8ff', '#c9b0ff'].map((c, i) => `<path d="M${260 + i * 10} 250 A${230 - i * 10} ${200 - i * 10} 0 0 1 ${720 - i * 10} 250" stroke="${c}"/>`).join('')}</g>
    ${front ? `<circle cx="640" cy="196" r="130" fill="url(#${id.sun})"/>` : `<circle cx="680" cy="64" r="80" fill="url(#${id.sun})"/><circle cx="680" cy="64" r="20" fill="#fffdf4"/>`}
    <!-- 奶油山丘、棉花糖树 -->
    <path d="M0 262 C40 236 80 250 110 236 C150 218 180 240 220 232 C260 222 290 246 330 238 C380 226 420 244 470 236 C520 226 560 246 610 238 C660 228 710 246 800 236 V340 H0Z" fill="url(#${id.hill})"/>
    <path d="M0 262 C40 236 80 250 110 236 C150 218 180 240 220 232 C260 222 290 246 330 238 C380 226 420 244 470 236 C520 226 560 246 610 238 C660 228 710 246 800 236" fill="none" stroke="#f3c8d8" stroke-width="2"/>
    <g fill="#ff8aa8">${Array.from({ length: 16 }, () => `<circle cx="${r1(R() * 800)}" cy="${r1(250 + R() * 60)}" r="${r1(2 + R() * 2.4)}"/>`).join('')}</g>
    ${[[360, 232, '#ffc0d8'], [420, 238, '#c8e8ff'], [470, 230, '#fff0b0'], [60, 246, '#d8c8ff']].map(([x, y, c]) => `<path d="M${x} ${y + 30} V${y}" stroke="#e8c8a8" stroke-width="2.4"/><circle cx="${x}" cy="${y - 8}" r="14" fill="${c}"/><circle cx="${x - 8}" cy="${y - 2}" r="9" fill="${c}"/><circle cx="${x + 8}" cy="${y - 3}" r="10" fill="${c}"/><circle cx="${x - 4}" cy="${y - 14}" r="4" fill="#fff" opacity=".6"/>`).join('')}
    <!-- 巨大的草莓奶油蛋糕（切开的一角） -->
    <g>
      <path d="M118 340 L118 238 L292 214 L292 318Z" fill="#f4d6c8"/>
      <path d="M118 340 L118 300 L292 282 L292 318Z" fill="url(#${id.sponge})"/>
      <path d="M118 300 L118 282 L292 264 L292 282Z" fill="url(#${id.cream})"/>
      <path d="M118 282 L118 256 L292 234 L292 264Z" fill="url(#${id.sponge})"/>
      <g>${[0, 1, 2, 3, 4, 5, 6].map((i) => { const x = 131 + i * 23.5, y = 291 - i * 2.35; return `<path d="M${x} ${y + 1} C${x - 1} ${y - 7} ${x + 4} ${y - 11} ${x + 8} ${y - 11} C${x + 12} ${y - 11} ${x + 17} ${y - 7} ${x + 16} ${y + 1}Z" fill="#ff4a6a"/><path d="M${x + 8} ${y - 1} C${x + 5} ${y - 4} ${x + 5} ${y - 8} ${x + 8} ${y - 8} C${x + 11} ${y - 8} ${x + 11} ${y - 4} ${x + 8} ${y - 1}Z" fill="#ffd6dc"/>`; }).join('')}</g>
      <path d="M112 244 C150 228 250 212 298 210 L298 222 C250 226 150 240 112 256Z" fill="url(#${id.cream})"/>
      <path d="${drip(118, 250, 174)}" fill="#fffaf6"/>
      <path d="M118 340 L118 238 L292 214 L292 318Z" fill="none" stroke="#e8c0a8" stroke-width="1.2"/>
      ${[[150, 224], [196, 216], [244, 210], [280, 206]].map(([x, y]) => `<g transform="translate(${x} ${y})"><path d="M-10 -2 C-12 -14 -4 -22 0 -22 C4 -22 12 -14 10 -2 C8 6 -8 6 -10 -2Z" fill="#ff4a6a"/><g fill="#ffe0a0">${[[-4, -12], [3, -14], [-1, -7], [5, -6], [-6, -4]].map(([a, b]) => `<ellipse cx="${a}" cy="${b}" rx=".9" ry="1.3"/>`).join('')}</g><path d="M-6 -21 l6 3 l6 -3 l-2 -4 l-4 2 l-4 -2z" fill="#5aa86a"/><ellipse cx="-4" cy="-14" rx="2" ry="4" fill="#fff" opacity=".35"/></g>`).join('')}
      <path d="M270 200 C276 190 286 188 292 192 C288 198 280 202 270 200Z" fill="#6cc084"/>
    </g>
    <!-- 野餐布 -->
    <rect y="340" width="800" height="130" fill="url(#${id.blanket})"/>
    <g fill="#ff9ab4" opacity=".35">${cols}</g><g fill="#ff9ab4" opacity=".35">${rows}</g>
    <g fill="#fff">${lace}</g><g fill="none" stroke="#f3c8d8" stroke-width="1">${lace.replace(/r="7"/g, 'r="4"')}</g>
    <g fill="#e8b890" opacity=".8">${Array.from({ length: 14 }, () => `<circle cx="${r1(R() * 800)}" cy="${r1(370 + R() * 90)}" r="${r1(0.8 + R() * 1.2)}"/>`).join('')}</g>`);

    let mv = '';
    // 棉花糖一样的云
    mv += art('a-drift', 20, 40, 200, 70, cloud(100, 58, 180, 46, front ? '#ffe0ec' : '#ffffff', rng(71)) + cloud(60, 64, 90, 26, '#ffe4f0', rng(72)), '--d:64s;--dx:40%');
    mv += art('a-drift', 380, 20, 180, 60, cloud(90, 50, 160, 40, front ? '#ffd8e8' : '#fff', rng(73)), '--d:80s;--dl:-20s;--dx:-30%');
    mv += art('a-drift', 560, 110, 150, 50, cloud(75, 42, 130, 30, '#ffeaf4', rng(74)), '--d:70s;--dl:-35s;--dx:-40%');
    // 太阳（作战：落日，点它会往下沉一点又升回来——追不上的太阳）
    mv += glow('a-pulse', front ? 640 : 680, front ? 196 : 64, front ? 220 : 140, front ? 200 : 140, front ? 'rgba(255,220,150,.55)' : 'rgba(255,252,230,.6)', '--d:5s;--o0:.5;--o1:1');
    if (front) mv += art('sun-disk', 606, 162, 68, 68, `<circle cx="34" cy="34" r="34" fill="#fff2c8"/><circle cx="34" cy="34" r="26" fill="#fffae6"/>`);
    // 蝴蝶（和她领结同款的颜色）、糖霜一样的光点
    mv += butterfly(300, 220, '#8ad0f0', '--d:24s;--dx:-1400%;--dy:-200%');
    mv += butterfly(520, 180, '#ffb0d0', '--d:30s;--dl:-10s;--dx:-1800%;--dy:160%');
    for (let i = 0; i < 10; i++) mv += art('a-mote', 40 + R() * 720, 150 + R() * 180, 12, 12, `<path d="${spark(6, 6, 3.4)}" fill="${pick(R, ['#fff', '#ffe0f0', '#fff4c0'])}"/>`, `--d:${r1(6 + R() * 5)}s;--dl:${r1(-R() * 10)}s;--dx:${r1((R() - 0.5) * 300)}%;--dy:${r1(-200 - R() * 300)}%;--o1:1`);
    // 茶杯的热气
    for (let i = 0; i < 3; i++) mv += art('a-steam', 520 + i * 18, 210, 20, 60, `<path d="M10 60 C0 46 20 34 10 20 C4 12 10 4 10 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`, `--d:${r1(3 + i * 0.4)}s;--dl:${r1(-i * 1.1)}s`);

    // —— 道具 ——
    let props = `<button type="button" class="tp tp-area hint" data-prop="cake" aria-label="草莓奶油蛋糕" title="草莓奶油蛋糕" style="--x:112;--y:190;--w:190;--h:150;--hx:40%;--hy:20%"></button>`;
    const cup = `<ellipse cx="60" cy="86" rx="58" ry="10" fill="#f4f0fa" stroke="#d8c8e0"/><ellipse cx="60" cy="84" rx="44" ry="6" fill="#e8e0f0"/>` +
      `<path d="M14 20 C14 56 30 80 60 80 C90 80 106 56 106 20Z" fill="url(#${id.cup})" stroke="#d8c8e0" stroke-width="1.2"/>` +
      `<path d="M104 30 C124 28 126 56 102 58" fill="none" stroke="#f4f0fa" stroke-width="7"/><path d="M104 30 C124 28 126 56 102 58" fill="none" stroke="#d8c8e0" stroke-width="1"/>` +
      `<ellipse cx="60" cy="20" rx="46" ry="9" fill="#ffffff" stroke="#d8c8e0"/><ellipse cx="60" cy="21" rx="40" ry="6.4" fill="url(#${id.tea})"/><ellipse cx="50" cy="20" rx="12" ry="2" fill="#fff" opacity=".4"/>` +
      `<path d="M16 28 C40 34 80 34 104 28" fill="none" stroke="#ff9ab4" stroke-width="3"/>` +
      `<g fill="#ffb0c8">${[[36, 50], [60, 56], [84, 50]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4"/><circle cx="${x}" cy="${y}" r="1.6" fill="#fff"/>`).join('')}</g>`;
    props += prop('cup', '冒着热气的茶杯', 500, 262, 124, 98, cup, 'hint', '--hx:50%;--hy:15%');
    // 巨大的白色小羊，趴在一边打盹
    const bigSheep = (() => {
      const C = SHEEP.white;
      const g = nid('bs');
      const puffs = [[70, 40, 30], [110, 28, 34], [150, 30, 32], [186, 44, 28], [96, 64, 30], [140, 66, 32], [176, 70, 26], [60, 70, 24]].map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}"/>`).join('');
      return `<defs><radialGradient id="${g}" cx=".4" cy=".3" r=".8">${stop(0, C.w0)}${stop(0.6, C.w1)}${stop(1, C.w2)}</radialGradient></defs>` +
        `<g fill="${C.ol}" stroke="${C.ol}" stroke-width="3">${puffs}</g><g fill="url(#${g})">${puffs}</g>` +
        `<g transform="translate(44 70)"><ellipse cx="0" cy="0" rx="26" ry="24" fill="#fffaf6" stroke="${C.ol}" stroke-width="2.4"/><ellipse cx="22" cy="-10" rx="12" ry="6" fill="#fffaf6" stroke="${C.ol}" stroke-width="2" transform="rotate(30 22 -10)"/><path d="M10 -22 C24 -40 44 -26 34 -10 C28 -2 18 -8 22 -14" fill="none" stroke="#c9a27a" stroke-width="5" stroke-linecap="round"/><g class="eyelid"><path d="M-14 -2 q5 4 10 0 M4 -3 q5 4 10 0" stroke="#3a2a34" stroke-width="2" fill="none" stroke-linecap="round"/></g><ellipse cx="-12" cy="8" rx="4" ry="2.4" fill="#ffb0c0" opacity=".6"/><ellipse cx="12" cy="8" rx="4" ry="2.4" fill="#ffb0c0" opacity=".6"/><path d="M-3 12 q3 2 6 0" stroke="#3a2a34" stroke-width="1.4" fill="none"/><path d="M-8 -26 l8 5 l8 -5 v10 l-8 -5 l-8 5z" fill="#8ad0f0" stroke="${C.ol}" stroke-width="1"/></g>`;
    })();
    props += prop('sheep', '打盹的大白羊', 610, 214, 220, 110, bigSheep, 'hint breathe', '--hx:18%;--hy:40%');
    if (front) props += `<button type="button" class="tp tp-area" data-prop="sun" aria-label="落日" title="落日" style="--x:590;--y:150;--w:100;--h:90"></button>`;
    // 前景：一颗大草莓、一摞马卡龙
    const berry = `<path d="M30 58 C8 58 2 36 6 24 C10 12 22 8 30 10 C38 8 50 12 54 24 C58 36 52 58 30 58Z" fill="#ff4a6a" stroke="#d8284a" stroke-width="1.2"/><g fill="#ffe0a0">${Array.from({ length: 14 }, () => `<ellipse cx="${r1(12 + R() * 36)}" cy="${r1(18 + R() * 34)}" rx="1.1" ry="1.6"/>`).join('')}</g><path d="M14 12 L22 2 L28 10 L32 0 L36 10 L44 2 L46 12 C38 16 22 16 14 12Z" fill="#5aa86a" stroke="#3a8a4a" stroke-width="1"/><ellipse cx="18" cy="26" rx="4" ry="8" fill="#fff" opacity=".35"/>`;
    props += prop('berry', '熟透的莓果', 300, 318, 60, 60, berry, '', '--hx:50%;--hy:10%');
    const mac = (y, c) => `<ellipse cx="30" cy="${y + 10}" rx="26" ry="9" fill="${c}"/><rect x="6" y="${y + 4}" width="48" height="5" fill="#fff6ee"/><ellipse cx="30" cy="${y}" rx="26" ry="9" fill="${c}"/><ellipse cx="24" cy="${y - 3}" rx="10" ry="3" fill="#fff" opacity=".35"/>`;
    const fore = art('', 640, 314, 60, 64, `${mac(46, '#c8e8b0')}${mac(28, '#ffc0d8')}${mac(10, '#d8c8ff')}`) + (front ? rune('alter') : '');
    const tale = { cake: ['一块莓果、一抹蹭来的奶油、藤叶做的盘子——请前辈尝尝刚做好的蛋糕。', '爱与执着做蛋糕坯，冒险与奇遇做奶油，再点缀上各种形状的心情。'], cup: ['云朵做的棉花糖，淋上天空色的糖浆。', '凉风钻进冒着气泡的汽水。'], sheep: ['小羊们已经在那边开始野餐了。', '大家都变小了，甜点却没变——那是不是可以一直一直吃下去？'] };
    return {
      id: 'picnic', place: front ? '追不上的太阳' : '云朵上的野餐', time: front ? '日落' : '午后', cls: 'sc-picnic' + (front ? ' st-dusk' : ''),
      cap: front ? '太阳快要落山了。要是能追上它，让野餐再长一点就好了。' : '多利的恶作剧把大家都变小了——草莓、奶油蛋糕与白色小羊围成一座甜点舞台。',
      hint: front ? '点点落日、茶杯和打盹的大白羊' : '点点蛋糕、茶杯和打盹的大白羊',
      back: `${lay('', 0, 0, 800, 470, back)}${mv}${props}`,
      fore,
      auto: ['cake', 'cup', 'berry', 'sheep'],
      props: {
        cake: { react: 'Interact', cast: 'Skill2', run(t, el) { t.burst('ash', el, 12, 0.2); t.say(pick(Math.random, tale.cake), el); t.sfx('sparkle'); } },
        cup: { react: 'Interact', cast: 'Attack', run(t, el) { t.pulse('puff', 1600); t.say(pick(Math.random, tale.cup), el); } },
        sheep: { react: 'Interact', run(t, el) { t.pulse('wake', 2600); t.say(pick(Math.random, tale.sheep), el); t.sfx('tick'); } },
        berry: { react: 'Interact', cast: 'Attack', run(t) { t.kick('berry', 'hop'); t.say('藤蔓上还挂着一颗熟透的莓果。', 'berry', 2400); } },
        sun: { walk: false, cast: 'Skill1', run(t) { t.pulse('chase', 3600); t.say('太阳快要落山了——追上它，让野餐再长一点。', 'sun'); } },
      },
    };
  }

  /* ====================================================================
   * 场景八 · 医疗 · 后来的故事：家（基建 = 傍晚，作战 = 夜里讲童话的时间）
   * ==================================================================== */
  function home(front) {
    const R = rng(8807);
    const id = { wall: nid('w'), pat: nid('p'), sky: nid('s'), fire: nid('f'), sofa: nid('o'), wood: nid('d'), rug: nid('r'), photo: nid('h'), lampg: nid('l') };
    const W = front ? { w0: '#6e4c6e', w1: '#4e3654', flower: '#ffc8e0', wain: '#8a6a86', wain2: '#6e5270', floor0: '#7a5652', floor1: '#553a3a', line: '#3a2626', sofa: '#b0708e', sofa2: '#8a5470' }
      : { w0: '#f8dccd', w1: '#efc6b6', flower: '#e8909e', wain: '#fdf2e8', wain2: '#ecd8c8', floor0: '#d0a27c', floor1: '#aa7c5c', line: '#8a5e44', sofa: '#e8a4b8', sofa2: '#c8849a' };
    const sky = front ? [[0, '#1a1a48'], [0.6, '#3a2a68'], [1, '#6a3a78']] : [[0, '#7a8ad8'], [0.45, '#e8a0c0'], [1, '#ffd0a8']];
    let stars = '';
    if (front) for (let i = 0; i < 20; i++) stars += `<circle cx="${r1(522 + R() * 146)}" cy="${r1(52 + R() * 120)}" r="${r1(0.4 + R() * 0.8)}" opacity="${r1(0.4 + R() * 0.6)}"/>`;
    const bricks = Array.from({ length: 8 }, (_, row) => Array.from({ length: 7 }, (_, i) => `<rect x="${r1(342 + i * 18 + (row % 2) * 9)}" y="${216 + row * 11}" width="16" height="9" rx="1"/>`).join('')).join('');
    const back = svg(800, 470, `<defs>
      ${lin(id.wall, [[0, W.w0], [1, W.w1]])}
      <pattern id="${id.pat}" width="36" height="36" patternUnits="userSpaceOnUse"><g fill="${W.flower}" opacity=".16"><circle cx="18" cy="14" r="2.4"/><circle cx="14.6" cy="18" r="2.4"/><circle cx="21.4" cy="18" r="2.4"/><circle cx="18" cy="21" r="2.4"/></g><circle cx="18" cy="18" r="1.4" fill="#fff" opacity=".25"/><circle cx="0" cy="0" r="1" fill="${W.flower}" opacity=".2"/><circle cx="36" cy="36" r="1" fill="${W.flower}" opacity=".2"/></pattern>
      ${lin(id.sky, sky)}
      ${rad(id.fire, [[0, '#fff0b0', 0.95], [0.4, '#ffa050', 0.7], [1, '#ff6a30', 0]])}
      ${lin(id.sofa, [[0, W.sofa], [1, W.sofa2]])}
      ${lin(id.wood, [[0, '#6a4038'], [1, '#4a2a26']])}
      ${rad(id.rug, [[0, '#fff8f0'], [0.8, '#fbeee4'], [0.86, '#f0c8d4'], [0.92, '#fff4ee'], [1, '#fff4ee', 0]])}
      ${lin(id.photo, [[0, '#ffd8b0'], [1, '#f4a8b8']])}
    </defs>
    <rect width="800" height="360" fill="url(#${id.wall})"/>
    <rect width="800" height="282" fill="url(#${id.pat})"/>
    <!-- 护墙板 -->
    <rect y="282" width="800" height="78" fill="${W.wain}"/><rect y="278" width="800" height="6" fill="${W.wain2}"/>
    <g fill="none" stroke="${W.wain2}" stroke-width="2">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<rect x="${i * 92 + 8}" y="292" width="76" height="48" rx="3"/>`).join('')}</g>
    <rect y="350" width="800" height="10" fill="${W.wain2}"/>
    <!-- 墙上的相框（一家三口的剪影，没有画脸） -->
    <g><rect x="150" y="80" width="108" height="84" rx="3" fill="#c9a060"/><rect x="156" y="86" width="96" height="72" fill="url(#${id.photo})"/>
      <path d="M156 150 L190 118 L206 128 L226 108 L252 140 V158 H156Z" fill="#a878a0" opacity=".7"/><path d="M222 110 l4 -4 l4 4" stroke="#fff" stroke-width="1.4" fill="none"/>
      <g fill="#6a4a6a"><circle cx="186" cy="130" r="5"/><path d="M180 136 h12 l2 22 h-16z"/><circle cx="222" cy="128" r="5.4"/><path d="M215 134 h14 l2 24 h-18z"/><circle cx="204" cy="142" r="4"/><path d="M199 147 h10 l1 11 h-12z"/></g>
      <circle cx="238" cy="96" r="6" fill="#fff4d0" opacity=".9"/></g>
    <g><rect x="118" y="178" width="30" height="38" rx="2" fill="#fff" stroke="#c9a060" stroke-width="2"/><path d="M133 208 V190 M133 196 q-6 -4 -8 -10 M133 194 q6 -4 8 -10" stroke="#6cb07e" stroke-width="1.2" fill="none"/><circle cx="125" cy="186" r="3" fill="#ff7a8a"/><circle cx="141" cy="184" r="3" fill="#ff7a8a"/></g>
    <!-- 壁炉（在她身后：炉火的光会从她周围透出来） -->
    <g><rect x="326" y="186" width="148" height="12" rx="2" fill="url(#${id.wood})"/><rect x="332" y="198" width="136" height="154" fill="#b8866e"/>
      <g fill="#a06a58" stroke="#8a5646" stroke-width=".6">${bricks}</g>
      <path d="M356 352 V250 Q400 214 444 250 V352Z" fill="#2a1414"/>
      <path d="M362 352 V254 Q400 222 438 254 V352Z" fill="url(#${id.fire})" opacity=".5"/>
      <g><rect x="340" y="170" width="6" height="16" fill="#fff4e0"/><rect x="454" y="166" width="6" height="20" fill="#fff4e0"/><rect x="390" y="160" width="22" height="26" rx="10" fill="#c9a060"/><circle cx="401" cy="172" r="7" fill="#fff8ec"/><path d="M401 172 v-4 M401 172 l3 2" stroke="#6a4a3a" stroke-width="1"/></g></g>
    <!-- 窗（钢琴上方） -->
    <g><rect x="514" y="42" width="164" height="140" rx="4" fill="url(#${id.sky})"/><g fill="#fff">${stars}</g>
      ${front ? '<path d="M650 66 a12 12 0 1 0 9 19 a9.6 9.6 0 1 1 -9 -19z" fill="#fff4dc"/>' : '<circle cx="640" cy="150" r="16" fill="#fff0c8" opacity=".9"/>'}
      <path d="M514 160 C540 150 570 156 600 148 C630 142 660 152 678 146 V182 H514Z" fill="${front ? '#2a1e48' : '#c89ab8'}" opacity=".8"/>
      <rect x="508" y="36" width="176" height="152" rx="6" fill="none" stroke="#fffaf2" stroke-width="10"/><path d="M596 40 V186 M512 112 H680" stroke="#fffaf2" stroke-width="5"/><rect x="500" y="184" width="192" height="8" rx="2" fill="#fffaf2"/></g>
    <!-- 钢琴（立式） -->
    <g><rect x="512" y="200" width="176" height="156" rx="3" fill="#5a3634"/><rect x="518" y="206" width="164" height="54" rx="2" fill="#6e4442"/><path d="M524 212 h152 v42 h-152z" fill="none" stroke="#8a5a54" stroke-width="1.2"/>
      <rect x="504" y="262" width="192" height="24" rx="2" fill="#4a2a28"/>
      <rect x="510" y="266" width="180" height="14" fill="#fffaf2"/>
      <g fill="#2a1a1a">${Array.from({ length: 25 }, (_, i) => ([1, 2, 4, 5, 6].includes(i % 7) ? `<rect x="${r1(510 + i * 7.2 + 4.5)}" y="266" width="4" height="8"/>` : '')).join('')}</g>
      <g stroke="#d8ccc0" stroke-width=".6">${Array.from({ length: 25 }, (_, i) => `<path d="M${r1(510 + i * 7.2)} 266 v14"/>`).join('')}</g>
      <rect x="520" y="290" width="160" height="60" rx="2" fill="#6e4442"/><rect x="530" y="298" width="140" height="44" rx="2" fill="none" stroke="#8a5a54"/>
      <path d="M548 356 v-6 h8 v6 M644 356 v-6 h8 v6" fill="#c9a060"/>
      <path d="M572 228 h56 l-4 30 h-48z" fill="#fffaf2" stroke="#d8ccc0"/><g stroke="#8a7a7a" stroke-width=".6">${[234, 240, 246, 252].map((y) => `<path d="M578 ${y} h44"/>`).join('')}</g><g fill="#5a4a4a">${[[584, 238], [598, 244], [610, 236], [616, 250]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4"/>`).join('')}</g>
      <!-- 琴上的花瓶：红色的花（童话的结尾，山麓开满了红花） -->
      <path d="M534 200 L530 182 C528 176 540 176 538 182 L534 200Z" fill="#fff" stroke="#d8ccc0"/><path d="M534 180 C530 170 526 164 524 156 M534 180 C536 168 540 160 546 154 M534 180 V160" stroke="#5a9a6a" stroke-width="1.4" fill="none"/>
      <g fill="#e84a5a"><circle cx="524" cy="154" r="4.4"/><circle cx="546" cy="152" r="4.6"/><circle cx="534" cy="157" r="4"/></g>
      <path d="M664 200 L668 176 H688 L692 200Z" fill="#fff0d8"/><path d="M678 176 V166" stroke="#c9a060" stroke-width="2"/></g>
    <!-- 沙发 -->
    <g><path d="M112 232 C112 222 122 218 132 218 H280 C290 218 300 222 300 232 V300 H112Z" fill="url(#${id.sofa})"/>
      <path d="M206 222 V296" stroke="${W.sofa2}" stroke-width="1.4" opacity=".6"/>
      <rect x="112" y="282" width="188" height="36" rx="8" fill="${W.sofa}"/><path d="M118 290 H294" stroke="#fff" stroke-width="1.4" opacity=".25"/>
      <rect x="100" y="250" width="26" height="76" rx="12" fill="${W.sofa2}"/><rect x="286" y="250" width="26" height="76" rx="12" fill="${W.sofa2}"/>
      <path d="M118 326 v24 M294 326 v24" stroke="#5a3a3a" stroke-width="5" stroke-linecap="round"/>
      <path d="M136 214 C150 206 176 208 188 220 L184 262 C172 256 150 258 138 264Z" fill="${front ? '#9a88c8' : '#c8b8f0'}"/><g stroke="#fff" stroke-width="1" opacity=".5" fill="none">${[0, 1, 2, 3].map((i) => `<path d="M${140 + i * 11} 216 l-2 44"/>`).join('')}</g>
      <path d="M218 260 C206 244 212 232 224 236 C230 226 246 232 238 250 C234 258 226 262 218 260Z" fill="#ff8aa8" stroke="#e86a8a"/>
      <path d="${spark(262, 250, 16)}" fill="#ffd86a" stroke="#e8b84a"/></g>
    <!-- 地板、圆地毯、绒绒拖鞋 -->
    ${planks(R, W.floor0, W.floor1, W.line, { step: 56 })}
    <rect y="360" width="800" height="5" fill="#000" opacity=".12"/>
    <ellipse cx="400" cy="408" rx="260" ry="38" fill="url(#${id.rug})"/>
    <g transform="translate(300 424)"><ellipse cx="0" cy="0" rx="16" ry="7" fill="#ffd8e4"/><ellipse cx="-4" cy="-2" rx="9" ry="4" fill="#fff" opacity=".7"/><ellipse cx="30" cy="4" rx="16" ry="7" fill="#ffd8e4"/><ellipse cx="26" cy="2" rx="9" ry="4" fill="#fff" opacity=".7"/></g>`);

    let mv = '';
    // 炉火：火光呼吸、火苗跳动
    mv += glow('a-flick', 400, 300, 420, 300, 'rgba(255,170,90,.42)', '--d:3.4s');
    for (let i = 0; i < 3; i++) mv += art('a-bob', 378 + i * 14, 300, 18, 48, `<path d="M9 48 C0 40 2 26 9 16 C10 24 14 26 13 16 C18 26 20 40 9 48Z" fill="${['#ffb050', '#ffd070', '#ff8a40'][i]}"/>`, `--d:${r1(0.5 + i * 0.13)}s;--dl:${r1(-i * 0.2)}s;--dy:-10%;--r0:-4deg;--r1:5deg`);
    // 窗里的两朵云：一朵背着小火山，一朵撑着小伞（她讲的童话）
    const cloudA = `${cloud(34, 30, 60, 24, '#fff', rng(81))}<path d="M24 12 L32 2 L38 2 L46 12Z" fill="#a898c8"/><path d="M32 2 L35 -4 L38 2" fill="#ff8a6a"/>`;
    const cloudB = `${cloud(30, 30, 54, 22, '#fff', rng(82))}<path d="M30 4 Q30 -8 42 -8 Q54 -8 54 4Z" fill="#ff9ab8"/><path d="M42 -8 V10" stroke="#8a6a8a" stroke-width="1.2"/>`;
    mv += `<i class="tl" style="--x:514;--y:42;--w:164;--h:140;overflow:hidden;border-radius:4px">${sub('a-drift cl-a', 2, 18, 42, 32, svg(70, 44, cloudA), '--d:26s;--dx:40%')}${sub('a-drift cl-b', 56, 40, 36, 30, svg(62, 42, cloudB), '--d:30s;--dl:-8s;--dx:-45%')}${sub('cl-c', 42, 30, 16, 14, svg(30, 24, cloud(15, 18, 24, 12, '#fff', rng(83))))}</i>`;
    // 钢琴上的台灯、夜里墙上的小灯串
    mv += glow('a-flick', 678, 186, 150, 120, 'rgba(255,220,160,.45)', '--d:6s;--dl:-2s');
    if (front) {
      mv += art('', 0, 20, 800, 30, `<path d="M0 6 Q100 26 200 8 Q300 26 400 8 Q500 26 600 8 Q700 26 800 6" fill="none" stroke="#5a4a5a" stroke-width="1"/>`);
      for (let i = 0; i < 16; i++) { const x = 25 + i * 50, y = 22 + 14 * Math.sin(((x % 200) / 200) * Math.PI); mv += art('a-tw', x - 4, y - 4, 8, 8, `<circle cx="4" cy="4" r="2.6" fill="${['#ffe08a', '#ffb0c8', '#b0e0ff'][i % 3]}"/>`, `--d:${r1(2 + (i % 4) * 0.5)}s;--dl:${r1(-i * 0.3)}s;--o0:.35`); }
    } else {
      for (let i = 0; i < 7; i++) mv += art('a-mote', 470 + R() * 200, 190 + R() * 110, 12, 12, `<circle cx="6" cy="6" r="1" fill="#fff4d8"/>`, `--d:${r1(6 + R() * 4)}s;--dl:${r1(-R() * 8)}s;--dx:${r1((R() - 0.5) * 200)}%;--dy:${r1(-200 - R() * 200)}%`);
    }
    // 钢琴的音符（点钢琴时飘起来）
    [[560, 240, 0], [600, 236, 0.25], [640, 244, 0.5], [580, 230, 0.75]].forEach(([x, y, dl], i) => { mv += art('note', x, y, 14, 18, `<path d="${i % 2 ? 'M4 14 a3 2.4 0 1 1 0 .1 M7 14 V2 L12 4' : 'M3 14 a3 2.4 0 1 1 0 .1 M6 14 V3 H12 V12 M12 12 a3 2.4 0 1 1 0 .1'}" fill="${['#ff9ab8', '#b8a0f0', '#ffd070', '#8ad0f0'][i]}" stroke="${['#ff9ab8', '#b8a0f0', '#ffd070', '#8ad0f0'][i]}" stroke-width="1.6"/>`, `--dl:${dl}s`); });

    // —— 道具 ——
    let props = `<button type="button" class="tp tp-area" data-prop="photo" aria-label="全家福" title="全家福" style="--x:148;--y:78;--w:112;--h:88"></button>`;
    props += prop('sheep', '坐在沙发扶手上的小黑羊', 280, 210, 50, 44, sheepIn(50, 44, 0.95, SHEEP.black, { pose: 'sit', eyes: 'happy' }), 'hint breathe', '--hx:40%;--hy:10%');
    const book = `<path d="M4 22 L6 8 C16 5 26 5 32 9 C38 5 48 5 58 8 L60 22Z" fill="#f4e6ff" stroke="#8a6aaa" stroke-width="1"/><path d="M32 9 V22" stroke="#8a6aaa" stroke-width="1"/><path d="M10 18 C14 12 20 14 22 11 M40 16 l4 -6 l3 3 l4 -5" stroke="#b890d8" stroke-width="1.2" fill="none"/><circle cx="16" cy="11" r="2.4" fill="#fff"/><circle cx="44" cy="11" r="1.6" fill="#ff9ab8"/><path d="M2 22 H62" stroke="#8a5aaa" stroke-width="2.4"/>`;
    props += prop('book', '童话书', 176, 262, 64, 26, book, 'hint', '--hx:50%;--hy:0%');
    props += `<button type="button" class="tp tp-area hint" data-prop="window" aria-label="窗外的两朵云" title="窗外的两朵云" style="--x:514;--y:42;--w:164;--h:140;--hx:30%;--hy:40%"></button>`;
    props += `<button type="button" class="tp tp-area" data-prop="piano" aria-label="钢琴" title="钢琴" style="--x:504;--y:200;--w:192;--h:156"></button>`;
    // 前景：矮茶几上三杯热巧克力
    const mugs = `<ellipse cx="70" cy="30" rx="70" ry="10" fill="${front ? '#6a4a44' : '#b88a6a'}"/><rect x="0" y="30" width="140" height="8" rx="3" fill="${front ? '#553a36' : '#9a6a50'}"/>` +
      [[34, '#fff'], [70, '#ffe0ec'], [106, '#e8e0ff']].map(([x, c]) => `<rect x="${x - 10}" y="10" width="20" height="20" rx="4" fill="${c}" stroke="#c8a8b8"/><path d="M${x + 10} 14 q7 2 0 10" fill="none" stroke="${c}" stroke-width="3"/><ellipse cx="${x}" cy="11" rx="9" ry="2.4" fill="#7a4a3a"/>`).join('');
    let fore = prop('cocoa', '三杯热巧克力', 566, 344, 140, 40, mugs, 'hint', '--hx:50%;--hy:10%');
    for (let i = 0; i < 3; i++) fore += art('a-steam', 592 + i * 36, 322, 14, 30, `<path d="M7 30 C1 22 13 16 7 8 C4 4 7 1 7 0" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".6"/>`, `--d:${r1(3 + i * 0.3)}s;--dl:${r1(-i)}s`);
    if (front) fore += rune('alter');
    // 童话：基建讲“睡前的一版”，作战讲“作战时的一版”（js/data.js 时装语音 · 后来的故事）
    const vs = (D.forms && D.forms.alter.voiceSets || []).find((s) => s.key === 'e57');
    const lineOf = (n) => { const l = vs && vs.lines.find((x) => x[0] === n); return l ? l[2] : ''; };
    const taleIds = front ? [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31] : [1, 2, 3, 4, 9];
    const tale = taleIds.map(lineOf).filter(Boolean);
    let ti = 0;
    return {
      id: 'home', place: front ? '讲童话的时间' : '家', time: front ? '夜' : '傍晚', cls: 'sc-home' + (front ? ' st-night' : ''),
      cap: front ? '三个人难得聚在一起，像小时候那样挤着讲童话。' : '家居服、绒绒拖鞋、靠垫、书本与钢琴——最令人安心的家的回忆。',
      hint: '点点沙发上的童话书、窗外的两朵云和热巧克力',
      back: `${lay('', 0, 0, 800, 470, back)}${mv}${props}`,
      fore,
      auto: ['book', 'cocoa', 'piano', 'sheep'],
      props: {
        book: {
          react: 'Sit', cast: 'Skill1',
          run(t, el) {
            if (!tale.length) return;
            t.pulse('reading', 3000);
            t.say(`童话 · ${ti + 1}/${tale.length}　${tale[ti]}`, el, 5200);
            ti = (ti + 1) % tale.length;
          },
        },
        photo: { react: 'Interact', run(t, el) { t.say('想请爸爸妈妈坐下，听她讲这些年自己记录下的故事。', el, 4200); } },
        sheep: { react: 'Interact', run(t, el) { t.say('小黑羊，想听故事就要乖乖坐好哦。', el); t.sfx('tick'); } },
        window: { walk: false, cast: 'Skill3', run(t, el) { t.pulse('hug', 5200); t.say(pick(Math.random, ['一团背着火山的云，一团撑着小伞的云，在天空中相遇。', '一小团云，在它们相拥的怀里诞生了。']), el, 4200); t.sfx('sparkle'); } },
        piano: { react: 'Interact', cast: 'Skill2', run(t) { t.pulse('play', 2600); t.sfx('sparkle'); } },
        cocoa: { react: 'Interact', run(t, el) { t.pulse('puff', 1600); t.say('奖品是妈妈教她做的、加了榛子糖浆的热巧克力。', el); } },
      },
    };
  }

  /** SVG 里的一团柔光（道具发烫、发亮时淡入） */
  function glowSvg(cx, cy, rx, ry, col) {
    const g = nid('gl');
    return `<defs>${rad(g, [[0, col, 0.75], [0.5, col, 0.3], [1, col, 0]])}</defs><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${g})"/>`;
  }

  /* ====================================================================
   * 场景表：形态 · 时装 → 场景；作战时传 front = true
   * ==================================================================== */
  const SCENES = {
    'base:默认': (front) => (front ? dusk() : study()),
    'alter:默认': (front) => (front ? meadow() : museum()),
    'base:夏卉 FA018': beach,
    'base:绵绒小魔女': magic,
    'alter:远行前的野餐': picnic,
    'alter:后来的故事': home,
  };
  function sceneFor(form, skin) {
    return SCENES[`${form}:${skin}`] || SCENES[`${form}:默认`] || SCENES['base:默认'];
  }

  /* ====================================================================
   * 挂载：把场景画进舞台，接好道具、小人的反应与自由活动
   * ==================================================================== */
  function mount(stage, o) {
    if (!stage) return null;
    if (stage._th) stage._th.dispose();
    frame(stage, o.form);
    const front = o.group === 'front';
    const sc = sceneFor(o.form, o.skin)(front, o);
    let back = stage.querySelector('.th-scene:not(.th-fore)'), fore = stage.querySelector('.th-fore');
    if (!back) { back = document.createElement('div'); back.className = 'th-scene'; stage.prepend(back); }
    if (!fore) { fore = document.createElement('div'); fore.className = 'th-scene th-fore'; fore.setAttribute('aria-hidden', 'true'); stage.appendChild(fore); }
    back.innerHTML = `<div class="tw">${sc.back}</div>`;
    fore.innerHTML = `<div class="tw">${sc.fore || ''}</div>`;
    // 换场景：上一个场景留下的状态类（关灯、下雨、喷发……）全部清掉，只留舞台本身的类
    const keep = /^(th-stage|g-build|g-front|closed|loading|failed|poked)$/;
    [...stage.classList].forEach((c) => { if (!keep.test(c)) stage.classList.remove(c); });
    stage.classList.add(...(sc.cls || 'sc-' + sc.id).split(/\s+/));
    const cap = stage.querySelector('.th-cap');
    if (cap) cap.innerHTML = `<b>${sc.time ? sc.time + ' · ' : ''}${sc.place}</b><span>${sc.cap}</span>${sc.hint ? `<small>${sc.hint}</small>` : ''}`;
    const now = stage.querySelector('.th-place');
    if (now) now.textContent = sc.place;

    const chibi = () => (o.chibi ? o.chibi() : null);
    const timers = new Set();
    const later = (fn, ms) => { const h = setTimeout(() => { timers.delete(h); fn(); }, ms); timers.add(h); return h; };
    const sayEl = stage.querySelector('.th-say');
    let sayT = 0;
    const propEl = (id) => stage.querySelector(`[data-prop="${id}"]`);
    const t = {
      stage, sc, front,
      toggle(cls, v) { return stage.classList.toggle(cls, v); },
      /** 加一个状态类，ms 后去掉（重复触发时重新计时） */
      pulse(cls, ms) {
        stage.classList.remove(cls); void stage.offsetWidth; stage.classList.add(cls);
        clearTimeout(t['_p' + cls]);
        t['_p' + cls] = later(() => stage.classList.remove(cls), ms);
      },
      /** 让道具（或任何元素）重新播放一次某个动画类 */
      kick(idOrEl, cls = 'go') {
        const el = typeof idOrEl === 'string' ? propEl(idOrEl) : idOrEl;
        if (!el) return;
        el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
        clearTimeout(el['_k' + cls]);
        el['_k' + cls] = later(() => el.classList.remove(cls), 2600);
      },
      /** 道具旁边冒出一句话 */
      say(text, idOrEl, ms = 3400) {
        if (!sayEl) return;
        const el = typeof idOrEl === 'string' ? propEl(idOrEl) : idOrEl;
        const sr = stage.getBoundingClientRect();
        let x = sr.width / 2, y = sr.height * 0.3;
        if (el) { const r = el.getBoundingClientRect(); x = r.left + r.width / 2 - sr.left; y = r.top - sr.top; }
        sayEl.textContent = text;
        sayEl.style.setProperty('--sx', clamp(x, 120, sr.width - 120).toFixed(0) + 'px');
        sayEl.style.setProperty('--sy', clamp(y, 64, sr.height - 60).toFixed(0) + 'px');
        sayEl.style.setProperty('--tx', (x - clamp(x, 120, sr.width - 120)).toFixed(0) + 'px');
        sayEl.classList.remove('on'); void sayEl.offsetWidth; sayEl.classList.add('on');
        clearTimeout(sayT);
        sayT = later(() => sayEl.classList.remove('on'), ms);
      },
      /** 在道具处爆一小团火星 / 白灰（页面的全屏粒子层） */
      burst(kind, idOrEl, n = 12, fy = 0.35) {
        const el = typeof idOrEl === 'string' ? propEl(idOrEl) : idOrEl;
        if (!el || !window.FX) return;
        const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height * fy;
        if (kind === 'ember') FX.emberBurst(x, y, n, [30, 150], { g: -40 });
        else if (kind === 'ash') FX.ashBurst(x, y, n, [30, 140]);
        else if (kind === 'ring') FX.ring(x, y, { r1: Math.max(r.width, r.height), w0: 3, dur: 0.7, a: 0.5, col: o.form === 'base' ? 'rgba(255,150,120,1)' : 'rgba(140,190,255,1)', add: o.form === 'base' });
      },
      sfx(k) { try { if (window.AUDIO) AUDIO.sfx(k); } catch (e) { /* 忽略 */ } },
      chibi,
      later,
    };

    /* ---------- 道具：点一下 ---------- */
    let lines = {};
    function fire(pid, how = {}) {
      const p = sc.props && sc.props[pid], el = propEl(pid);
      if (!p || !el) return;
      t.kick(el);
      if (p.run) p.run(t, el, how);
      if (how.user) react(p, el);
    }
    /** 小人的反应：基建里走过去摆弄；作战里转身（或者放技能） */
    function react(p, el) {
      const c = chibi();
      if (!c || !c.ready) return;
      const sr = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
      const px = r.left + r.width / 2 - sr.left;
      if (front) {
        c.faceTo(px);
        if (p.cast) c.play(p.cast);
        return;
      }
      if (p.walk === false) { c.faceTo(px); c.hold(4); return; }
      // 站到道具靠近她的那一侧，不挡住道具
      const side = px > c.x ? -1 : 1;
      const tx = px + side * (Math.min(r.width, 120) * 0.5 + 34);
      c.goTo(tx, () => { c.faceTo(px); if (p.react) c.play(p.react); });
    }
    const onClick = (e) => {
      const b = e.target.closest && e.target.closest('.tp');
      if (!b || !stage.contains(b)) return;
      stage.classList.add('poked');
      fire(b.dataset.prop, { user: true });
    };
    stage.addEventListener('click', onClick);

    /* ---------- 小人：闲着的时候看向指针；自由活动时偶尔自己去摆弄道具 ---------- */
    let lookT = 0;
    const onMove = (e) => {
      const now = performance.now();
      if (now - lookT < 140) return;
      lookT = now;
      const c = chibi();
      if (!c || !c.ready || !c.idle) return;
      const sr = stage.getBoundingClientRect(), x = e.clientX - sr.left;
      if (Math.abs(x - c.x) > 50) c.faceTo(x);
    };
    stage.addEventListener('pointermove', onMove, { passive: true });
    let inView = false;
    const io = new IntersectionObserver(([en]) => {
      inView = en.isIntersecting;
      // 第一次看到舞台、还没点过任何道具：在一个道具旁边冒一句提示（整页只提示一次）
      if (inView && !hinted) {
        hinted = true;
        later(() => {
          if (stage.classList.contains('poked') || stage.classList.contains('closed')) { hinted = false; return; }
          const el = stage.querySelector('.tp.hint');
          if (el) t.say(`点点「${el.getAttribute('aria-label')}」试试？`, el, 3600);
        }, 2600);
      }
    }, { threshold: 0.35 });
    io.observe(stage);
    const c0 = chibi();
    const autoHook = () => {
      if (front || !inView || !sc.auto || !sc.auto.length || Math.random() > 0.4) return false;
      const c = chibi();
      if (!c || !c.ready) return false;
      const pid = sc.auto[(Math.random() * sc.auto.length) | 0], el = propEl(pid), p = sc.props[pid];
      if (!el || !p) return false;
      const sr = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
      const px = r.left + r.width / 2 - sr.left;
      if (px < 30 || px > sr.width - 30) return false; // 窄屏上道具在画面外
      const side = px > c.x ? -1 : 1;
      c.goTo(px + side * (Math.min(r.width, 120) * 0.5 + 34), () => {
        c.faceTo(px);
        c.play(p.react === 'Sit' ? 'Sit' : 'Interact');
        later(() => fire(pid, { auto: true }), 700);
      });
      return true;
    };
    if (c0) c0.onAuto = autoHook;

    const ctl = {
      scene: sc,
      /** 小人开始某个动作（main.js 的 chibi.onAction 转过来） */
      action(a) { if (sc.action) sc.action(a, t); if (front) { if (/^(Attack|Skill)/.test(a.id)) t.pulse(a.id === 'Attack' ? 'atk' : 'cast', a.id === 'Attack' ? 900 : 2600); } },
      /** 技能（volcano / rain / shield / echo）：布景跟着起变化 */
      skill(id) { if (sc.skill) sc.skill(id, t); },
      /** 新的小人（换了形态 / 场景后重建）要重新挂上自由活动的钩子 */
      bind() { const c = chibi(); if (c) c.onAuto = autoHook; },
      fire,
      dispose() {
        stage.removeEventListener('click', onClick);
        stage.removeEventListener('pointermove', onMove);
        io.disconnect();
        timers.forEach(clearTimeout);
        timers.clear();
        const c = chibi();
        if (c && c.onAuto === autoHook) c.onAuto = null;
        stage._th = null;
      },
    };
    stage._th = ctl;
    return ctl;
  }

  /* ---------- 台口：顶上的帷幔、两侧的幕布、幕布上的提示字（按形态换材质） ---------- */
  function valance(form) {
    const alt = form === 'alter';
    const n = 6, w = 800 / n;
    const c = alt ? { band: '#f4f7fd', band2: '#dfe7f5', swag: '#ffffff', swag2: '#d8e2f3', trim: '#efb3c6', tas: '#f2a7bf' } : { band: '#5a0f22', band2: '#3a0714', swag: '#8a1a34', swag2: '#4a0a1c', trim: '#d8a95a', tas: '#e8b85a' };
    const g = nid('vg');
    let swags = '', trims = '', tass = '';
    for (let i = 0; i < n; i++) {
      const x0 = i * w, x1 = x0 + w, xm = x0 + w / 2;
      swags += `<path d="M${r1(x0)} 8 Q${r1(xm)} 44 ${r1(x1)} 8Z"/>`;
      trims += `<path d="M${r1(x0 + 2)} 10 Q${r1(xm)} 43 ${r1(x1 - 2)} 10"/>`;
      if (i) tass += `<path d="M${r1(x0)} 8 v16" stroke="${c.tas}" stroke-width="2.4"/><ellipse cx="${r1(x0)}" cy="27" rx="3" ry="5" fill="${c.tas}"/>`;
    }
    return svg(800, 40, `<defs>${lin(g, [[0, c.swag], [1, c.swag2]])}</defs><rect width="800" height="10" fill="${c.band}"/><rect y="9" width="800" height="2" fill="${c.band2}"/><g fill="url(#${g})">${swags}</g><g fill="none" stroke="${c.trim}" stroke-width="2.2" stroke-dasharray="1.5 2.5">${trims}</g><g>${tass}</g><rect y="0" width="800" height="3" fill="${c.trim}" opacity=".7"/>`);
  }
  /** 两侧束起来的幕布（打开时看到的样子）；合上时淡出，换成整幅的幕布 */
  function drape(form, right) {
    const alt = form === 'alter', g = nid('dp');
    const c = alt ? [['#e9f0fb', 0.92], ['#ffffff', 0.96], ['#d3dff2', 0.94], ['#f6f9ff', 0.96], ['#c9d6ee', 0.92]] : [['#3e0816'], ['#8a1c36'], ['#5a0e22'], ['#a02a44'], ['#4a0a1c']];
    const tie = alt ? '#efa9c1' : '#d8a95a', fold = alt ? '#9fb2d6' : '#1e0209', edge = alt ? '#f0c8d6' : '#c99a4a';
    const shape = 'M0 0 H100 C96 70 70 150 46 236 C42 250 42 258 46 270 C60 320 82 370 90 400 H0Z';
    const body = `<defs>${lin(g, c.map((s, i) => [i / (c.length - 1), ...s]), 1, 0)}</defs>` +
      `<path d="${shape}" fill="url(#${g})"/>` +
      `<g fill="none" stroke="${fold}" stroke-width="1.6" opacity="${alt ? 0.5 : 0.55}"><path d="M22 0 C24 90 30 170 42 244 C40 300 34 350 30 400"/><path d="M48 0 C50 80 50 160 44 240 C52 300 60 350 62 400"/><path d="M74 0 C72 80 62 170 46 246 C58 300 74 350 80 400"/></g>` +
      `<path d="M100 0 C96 70 70 150 46 236 C42 250 42 258 46 270 C60 320 82 370 90 400" fill="none" stroke="${edge}" stroke-width="3"/>` +
      `<path d="M4 246 C20 256 38 258 58 250" stroke="${tie}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M50 252 C54 270 50 282 52 296" stroke="${tie}" stroke-width="3" fill="none"/><path d="M46 292 h12 l3 22 h-18z" fill="${tie}"/>`;
    return `<svg viewBox="0 0 100 400" preserveAspectRatio="none" aria-hidden="true"${right ? ' style="transform:scaleX(-1)"' : ''}>${body}</svg>`;
  }
  function frame(stage, form) {
    const need = (cls, tag = 'div') => { let el = stage.querySelector(':scope > .' + cls.split(' ').join('.')); if (!el) { el = document.createElement(tag); el.className = cls; stage.appendChild(el); } el.setAttribute('aria-hidden', 'true'); return el; };
    need('th-curtain l');
    need('th-curtain r');
    const dl = need('th-drape l'), dr = need('th-drape r');
    if (dl.dataset.form !== form) { dl.innerHTML = drape(form, false); dr.innerHTML = drape(form, true); dl.dataset.form = dr.dataset.form = form; }
    const v = need('th-valance');
    if (v.dataset.form !== form) { v.innerHTML = valance(form); v.dataset.form = form; }
    need('th-cnote');
    need('th-cap').removeAttribute('aria-hidden');
    const s = need('th-say');
    s.removeAttribute('aria-hidden');
    s.setAttribute('aria-live', 'polite');
  }

  /* ---------- 幕布：换装 / 换场景时合上，模型到了再拉开 ---------- */
  function curtain(stage, closed, note) {
    if (!stage) return;
    stage.classList.toggle('closed', !!closed);
    const n = stage.querySelector('.th-cnote');
    if (n && note != null) n.innerHTML = `${note}<i>·</i><i>·</i><i>·</i>`;
  }

  /* ---------- 桌宠名单上的小头像（PRTS 资源站的干员 / 时装头像，服务端缩图） ---------- */
  const AV = {
    base: { e: 'c/cc/头像_艾雅法拉.png', s1: '0/06/头像_艾雅法拉_skin1.png', s2: '3/3f/头像_艾雅法拉_skin2.png' },
    alter: { e: 'f/f0/头像_纯烬艾雅法拉.png', s1: '1/1d/头像_纯烬艾雅法拉_skin1.png', s2: '7/70/头像_纯烬艾雅法拉_skin2.png' },
  };
  function avatar(form, skin) {
    const f = D.forms && D.forms[form];
    const o = skin === '默认' ? null : f && f.outfits.find((x) => x.name === skin);
    const p = AV[form] && AV[form][o ? o.key : 'e'];
    return p ? 'https://media.prts.wiki/' + encodeURI(p) + '?image_process=resize,w_72/format,webp/quality,Q_85' : '';
  }

  return { mount, curtain, frame, avatar, scenes: SCENES };
})();
