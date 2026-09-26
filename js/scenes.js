/* =========================================================
 * 章节场景插画库 —— 全部为本页原创手绘风 SVG
 * - 纯函数，返回 SVG 字符串；无外部资源、无脚本、无 foreignObject
 * - 需要随主题变化的颜色一律写在 style="" 中，通过 CSS 变量取色
 *   （SVG 呈现属性里不能写 var()）
 * - 渐变 / 滤镜 / 裁剪 id 全部带模块级计数器，每次调用唯一
 * ========================================================= */
window.SCENES = (() => {
  'use strict';

  /* ---------------------------------------------------- 工具 */
  let uid = 0;
  const nid = (p) => `scn-${p}-${++uid}`;
  const r = (n) => Math.round(n * 100) / 100;
  const TAU = Math.PI * 2;
  const P = (x, y) => `${r(x)} ${r(y)}`;
  const pol = (cx, cy, rad, a) => [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

  /* 可复现的伪随机（xorshift32） */
  function rng(seed) {
    let s = (Math.imul(seed + 1, 2654435761) >>> 0) || 1;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* Catmull-Rom → 三次贝塞尔：让剪影线条更“手绘” */
  function spline(pts, tension = 1) {
    const t = tension / 6;
    let d = `M${P(pts[0][0], pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += ` C${P(p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t)} ${P(p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t)} ${P(p2[0], p2[1])}`;
    }
    return d;
  }
  function splineClosed(pts, tension = 1) {
    const t = tension / 6, n = pts.length;
    let d = `M${P(pts[0][0], pts[0][1])}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += ` C${P(p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t)} ${P(p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t)} ${P(p2[0], p2[1])}`;
    }
    return d + 'Z';
  }
  const sample = (x0, x1, step, fn) => { const out = []; for (let x = x0; x < x1; x += step) out.push([x, fn(x)]); out.push([x1, fn(x1)]); return out; };
  const band = (pts, bottom = 330) => `${spline(pts)} L${P(pts[pts.length - 1][0], bottom)} L${P(pts[0][0], bottom)}Z`;

  const svg = (vb, cls, body, extra = '') =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="scene ${cls}" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;
  const vstop = (off, v, o = 1) => `<stop offset="${off}" style="stop-color:var(${v});stop-opacity:${o}"/>`;
  const stop = (off, c, o) => `<stop offset="${off}" stop-color="${c}"${o == null ? '' : ` stop-opacity="${o}"`}/>`;
  const glowGrad = (id, v, o = 0.35) => `<radialGradient id="${id}">${vstop(0, v, o)}${vstop(1, v, 0)}</radialGradient>`;
  const sparkle = (x, y, s) => {
    const k = s * 0.16;
    return `M${P(x, y - s)} Q${P(x + k, y - k)} ${P(x + s, y)} Q${P(x + k, y + k)} ${P(x, y + s)} Q${P(x - k, y + k)} ${P(x - s, y)} Q${P(x - k, y - k)} ${P(x, y - s)}Z`;
  };
  const circ = (a) => `<circle cx="${r(a[0])}" cy="${r(a[1])}" r="${r(a[2])}"/>`;

  /* 手写字迹：一串带上下笔画的连笔波浪 */
  function scribble(x, y, w, seed, amp = 1.6) {
    const R = rng(seed);
    let d = `M${P(x, y)}`, cx = x;
    while (cx < x + w) {
      const st = 2 + R() * 2.4, h = amp * (0.7 + R() * 0.6), roll = R();
      if (roll < 0.14) d += ` c${r(st * 0.2)} ${r(-h * 3.2)} ${r(st * 1.1)} ${r(-h * 3.2)} ${r(st * 0.5)} 0`;
      else if (roll < 0.22) d += ` c${r(st * 0.2)} ${r(h * 2.6)} ${r(st * 1.1)} ${r(h * 2.6)} ${r(st * 0.5)} 0`;
      else d += ` q${r(st / 2)} ${r(-h * 2)} ${r(st)} 0`;
      cx += st * (roll < 0.22 ? 0.5 : 1);
      if (R() < 0.1 && cx < x + w - 8) { const g = 3 + R() * 2; d += ` m${r(g)} ${r((R() - 0.5) * 0.6)}`; cx += g; }
    }
    return d;
  }

  /* ---------------------------------------------------- Q 版小羊（面朝左，脚底 y=0） */
  const PAL = {
    black: {
      w0: '#716270', w1: '#30282f', w2: '#141015', ol: '#0c090b', rim: true,
      f0: '#fff6ec', f1: '#e6cfb9', h0: '#ffe0a3', h1: '#b8733a', hl: '#4b2a14',
      leg: '#261e24', legFar: '#141014', hoof: '#070506', eye: '#2b1a1a', blush: '#ff8c78', hi: 'rgba(255,255,255,.22)'
    },
    pink: {
      w0: '#ffffff', w1: '#ffd2e2', w2: '#f39dbd', ol: '#d8739a', rim: false,
      f0: '#ffffff', f1: '#ffe2ec', h0: '#fdf9ff', h1: '#b49de8', hl: '#7c65b6',
      leg: '#ec93b4', legFar: '#d67a9e', hoof: '#b95c82', eye: '#4a2a3b', blush: '#ff7fa8', hi: 'rgba(255,255,255,.85)'
    }
  };
  function sheepDefs(ids, C) {
    return `<radialGradient id="${ids.wool}" cx=".36" cy=".3" r=".8">${stop(0, C.w0)}${stop(0.55, C.w1)}${stop(1, C.w2)}</radialGradient>` +
      `<radialGradient id="${ids.face}" cx=".4" cy=".35" r=".75">${stop(0, C.f0)}${stop(1, C.f1)}</radialGradient>` +
      `<linearGradient id="${ids.horn}" x1="0" y1="0" x2="1" y2="1">${stop(0, C.h0)}${stop(1, C.h1)}</linearGradient>` +
      (ids.glow ? glowGrad(ids.glow, '--c-acc', 0.42) : '');
  }
  function sheepFig(ids, C, o = {}) {
    const sit = o.pose === 'sit';
    const dy = sit ? 5 : 0;
    const bx = 5, by = -21 + dy;
    const hx = -17, hy = -23 + dy - (sit ? 2 : 0);

    let legs;
    if (sit) {
      legs = `<g fill="none" stroke-linecap="round"><path d="M-1 -4 L-9 -1.6" stroke="${C.legFar}" stroke-width="3.6"/><path d="M22 -3.2 L25.5 -0.8" stroke="${C.legFar}" stroke-width="3.4"/><path d="M4 -3.6 L-4.6 -0.4" stroke="${C.leg}" stroke-width="3.8"/></g>` +
        `<circle cx="-9.4" cy="-1.5" r="1.9" fill="${C.hoof}"/><circle cx="-5" cy="-0.3" r="2" fill="${C.hoof}"/>`;
    } else {
      const s = o.phase ? [2.6, -2.2, -2.4, 2.4] : [-2.6, 2.2, 2.4, -2.4];
      const L = (x, dx, col, w) => (C.rim ? `<path d="M${x} -9 L${r(x + dx)} -1.5" style="stroke:var(--c-line2)" stroke-width="${r(w + 2)}"/>` : '') +
        `<path d="M${x} -9 L${r(x + dx)} -1.5" stroke="${col}" stroke-width="${w}"/><circle cx="${r(x + dx)}" cy="-1.3" r="${r(w / 2 + 0.15)}" fill="${C.hoof}" stroke="none"/>`;
      legs = `<g fill="none" stroke-linecap="round">${L(-3, s[1], C.legFar, 3.4)}${L(15, s[3], C.legFar, 3.4)}${L(-8, s[0], C.leg, 3.7)}${L(10, s[2], C.leg, 3.7)}</g>`;
    }

    const puffs = [[-15, -6, 6.8], [-8, -11, 7.4], [1, -13, 7.6], [10, -11.5, 7.4], [17, -5.5, 6.8], [18.5, 2.5, 6.4], [10, 7.5, 6.8], [0, 8.5, 7], [-9, 7.5, 6.6], [-15, 1.5, 6.4]];
    const woolC = [[bx + 24.5, by - 5, 3.8], ...puffs.map(([x, y, rr]) => [bx + x, by + y, rr])].map(circ).join('');
    const core = `<ellipse cx="${bx}" cy="${r(by)}" rx="17" ry="12"/>`;
    const rimPass = C.rim ? `<g style="fill:var(--c-line2);stroke:var(--c-line2)" stroke-width="5.6" stroke-linejoin="round">${core}${woolC}</g>` : '';
    const wool = `${rimPass}<g fill="${C.ol}" stroke="${C.ol}" stroke-width="3.4" stroke-linejoin="round">${core}${woolC}</g><g fill="url(#${ids.wool})">${core}${woolC}</g>`;
    const curls = `<g fill="none" stroke="${C.hi}" stroke-width="1.1" stroke-linecap="round"><path d="M${P(bx - 9, by - 6)} q1.8 -2.4 3.6 0 q1.8 -2.4 3.6 0"/><path d="M${P(bx + 5, by - 1)} q1.8 -2.4 3.6 0 q1.8 -2.4 3.6 0"/><path d="M${P(bx - 2, by + 5)} q1.6 -2 3.2 0"/><path d="M${P(bx + 12, by - 10)} q1.4 -1.8 2.8 0"/></g>`;

    const tuft = [[hx - 4.6, hy - 7.2, 3.6], [hx + 0.4, hy - 9, 4.1], [hx + 5, hy - 6.6, 3.5]].map(circ).join('');
    const horn = `M${P(hx + 2.5, hy - 6.5)} C${P(hx + 8, hy - 14)} ${P(hx + 17.5, hy - 9)} ${P(hx + 15.2, hy - 1.5)} C${P(hx + 13.6, hy + 3.4)} ${P(hx + 7.4, hy + 2.2)} ${P(hx + 8, hy - 2)} C${P(hx + 8.4, hy - 4.6)} ${P(hx + 11.2, hy - 5)} ${P(hx + 12.1, hy - 2.8)}`;
    const eyes = o.eyes === 'happy'
      ? `<path d="M${P(hx - 5.9, hy + 1.2)} q1.6 -2.3 3.2 0 M${P(hx + 0.7, hy + 0.9)} q1.5 -2.2 3 0" fill="none" stroke="${C.eye}" stroke-width="1.3" stroke-linecap="round"/>`
      : `<g fill="${C.eye}"><ellipse cx="${r(hx - 4.3)}" cy="${r(hy + 0.4)}" rx="1.35" ry="1.8"/><ellipse cx="${r(hx + 2.2)}" cy="${r(hy + 0.2)}" rx="1.3" ry="1.75"/></g><g fill="#fff"><circle cx="${r(hx - 4.8)}" cy="${r(hy - 0.3)}" r=".55"/><circle cx="${r(hx + 1.7)}" cy="${r(hy - 0.5)}" r=".5"/></g>`;
    const head =
      `<ellipse cx="${r(hx + 9)}" cy="${r(hy + 1.5)}" rx="4.4" ry="2.4" transform="rotate(28 ${r(hx + 9)} ${r(hy + 1.5)})" fill="url(#${ids.face})" stroke="${C.ol}" stroke-width="1.4"/>` +
      `<ellipse cx="${hx}" cy="${r(hy)}" rx="8.2" ry="9" transform="rotate(-6 ${hx} ${r(hy)})" fill="url(#${ids.face})" stroke="${C.ol}" stroke-width="1.6"/>` +
      `<g fill="${C.ol}" stroke="${C.ol}" stroke-width="3" stroke-linejoin="round">${tuft}</g><g fill="url(#${ids.wool})">${tuft}</g>` +
      `<path d="${horn}" fill="none" stroke="${C.hl}" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="${horn}" fill="none" stroke="url(#${ids.horn})" stroke-width="3.2" stroke-linecap="round"/>` +
      `<path d="M${P(hx + 9.5, hy - 10.4)} l1.2 1.6 M${P(hx + 14.2, hy - 7.4)} l-.2 2" fill="none" stroke="${C.hl}" stroke-width=".7" stroke-linecap="round" opacity=".6"/>` +
      eyes +
      `<g fill="${C.blush}" opacity=".55"><ellipse cx="${r(hx - 6)}" cy="${r(hy + 4.4)}" rx="1.9" ry="1.1"/><ellipse cx="${r(hx + 4.2)}" cy="${r(hy + 4.1)}" rx="1.8" ry="1.05"/></g>` +
      `<path d="M${P(hx - 2.4, hy + 5.4)} q.8 .9 1.6 0 q.8 .9 1.6 0" fill="none" stroke="${C.eye}" stroke-width=".9" stroke-linecap="round"/>`;

    let extra = '';
    if (o.heat) {
      extra += `<g fill="none" style="stroke:var(--c-acc)" stroke-width="1.3" stroke-linecap="round" opacity=".85"><path d="M${P(bx - 3, by - 23)} q-2 -2.2 0 -4.4 q2 -2.2 0 -4.4"/><path d="M${P(bx + 5, by - 25)} q-2 -2.2 0 -4.4 q2 -2.2 0 -4.4"/><path d="M${P(bx + 13, by - 22)} q-1.6 -1.8 0 -3.6 q1.6 -1.8 0 -3.6"/></g>`;
    }
    if (o.bell) {
      extra += `<path d="M${P(hx + 1, hy + 6.6)} Q${P(hx + 6, hy + 10.6)} ${P(hx + 10.4, hy + 5)}" fill="none" style="stroke:var(--c-acc)" stroke-width="2.2" stroke-linecap="round"/>` +
        `<circle cx="${r(hx + 5.6)}" cy="${r(hy + 10.4)}" r="2.3" fill="#ffd66b" stroke="#8a5a12" stroke-width=".8"/><path d="M${P(hx + 4.4, hy + 11.2)} h2.4" stroke="#8a5a12" stroke-width=".6"/>`;
    }
    if (o.bow) {
      const x = hx - 1, y = hy - 11.5;
      extra += `<path d="M${P(x, y)} l-4.4 -2.8 q-1 2.8 0 5.6Z M${P(x, y)} l4.4 -2.8 q1 2.8 0 5.6Z" style="fill:var(--c-acc3)" stroke="${C.ol}" stroke-width=".8" stroke-linejoin="round"/><circle cx="${r(x)}" cy="${r(y)}" r="1.3" style="fill:var(--c-acc3)" stroke="${C.ol}" stroke-width=".7"/>`;
    }
    const glow = ids.glow ? `<ellipse cx="4" cy="${-20 + dy}" rx="33" ry="24" fill="url(#${ids.glow})"/>` : '';
    return `${glow}${legs}${wool}${curls}${head}${extra}`;
  }

  /* ====================================================================
   * 1. 错过的声音 —— 夹在论文里的母亲来信
   * ==================================================================== */
  function letter() {
    const id = { env: nid('le'), inn: nid('li'), paper: nid('lp'), seal: nid('ls'), pat: nid('lpt'), sheet: nid('lsh') };
    const ink = '#3d2620';
    const R = rng(7);
    let specks = '';
    for (let i = 0; i < 26; i++) specks += `<circle cx="${r(52 + R() * 136)}" cy="${r(80 + R() * 56)}" r="${r(0.3 + R() * 0.5)}"/>`;
    let seis = 'M34 70';
    for (let i = 0; i < 26; i++) { const x = 34 + i * 2.6, a = (i > 8 && i < 18 ? 7 : 2.2) * (0.5 + R() * 0.5) * (i % 2 ? 1 : -1); seis += ` L${r(x)} ${r(70 + a)}`; }
    const hand = [[80, 52, 78, 11], [80, 66, 84, 12], [80, 74, 72, 13], [84, 82, 70, 14], [80, 90, 66, 15], [92, 98, 50, 16], [100, 106, 34, 17]]
      .map(([x, y, w, s]) => `<path d="${scribble(x, y, w, s)}"/>`).join('');
    const flame = (s, cx, cy) => {
      const q = (x, y) => P(cx + x * s, cy + y * s);
      return `M${q(0, -16)} C${q(4.5, -10)} ${q(11, -6)} ${q(11, 3)} C${q(11, 10)} ${q(6, 14)} ${q(0, 14)} C${q(-6, 14)} ${q(-11, 10)} ${q(-11, 3)} C${q(-11, -3)} ${q(-7.5, -6)} ${q(-5.5, -11)} C${q(-3.4, -7.4)} ${q(-2.2, -5.6)} ${q(-1, -4.6)} C${q(0.2, -8)} ${q(1, -12)} ${q(0, -16)}Z`;
    };
    let petals = '';
    for (let k = 0; k < 6; k++) {
      petals += `<g transform="rotate(${k * 60})"><path d="M0 0 C3 -2.5 3.6 -6 0.8 -10 C0.6 -7.5 -0.8 -7 -1.4 -8.2 C-3.4 -5.6 -2.8 -2.4 0 0Z" style="fill:var(--c-acc2)" fill-opacity=".85" stroke="#8f4a26" stroke-width=".7" stroke-linejoin="round"/><path d="M0 -1.5 Q.6 -4.5 .2 -7" fill="none" stroke="#8f4a26" stroke-width=".45" opacity=".6"/></g>`;
    }
    const body = `<defs>
      <linearGradient id="${id.env}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#fbeedb')}${stop(1, '#ecd2ad')}</linearGradient>
      <linearGradient id="${id.inn}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#c9a275')}${stop(1, '#dcbc92')}</linearGradient>
      <linearGradient id="${id.paper}" x1="0" y1="0" x2=".3" y2="1">${stop(0, '#fffdf7')}${stop(1, '#f3e7d1')}</linearGradient>
      <linearGradient id="${id.sheet}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#f1eadc')}${stop(1, '#ddd2bf')}</linearGradient>
      <radialGradient id="${id.seal}" cx=".38" cy=".34" r=".78">${vstop(0.1, '--c-acc')}${vstop(1, '--c-acc3')}</radialGradient>
      <pattern id="${id.pat}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" style="fill:var(--c-acc2)" opacity=".28"/><line x1="1.5" y1="0" x2="1.5" y2="6" style="stroke:var(--c-acc)" stroke-width="1.6" opacity=".4"/></pattern>
    </defs>
    <ellipse cx="120" cy="146" rx="86" ry="6" fill="#000" opacity=".22"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      <g transform="rotate(-12 70 80)">
        <rect x="22" y="24" width="84" height="104" rx="2" fill="url(#${id.sheet})" stroke="${ink}" stroke-width="1.3"/>
        <path d="M30 34 h36" stroke="#8a7462" stroke-width="2.2"/><path d="M30 41 h58 M30 46 h50 M30 51 h54" stroke="#b3a08c" stroke-width=".9"/>
        <path d="M32 60 V80 H92" fill="none" stroke="#8a7462" stroke-width=".8"/>
        <path d="${seis}" fill="none" style="stroke:var(--c-acc)" stroke-width="1.1"/>
        <path d="M30 88 h56 M30 93 h48 M30 98 h52" stroke="#b3a08c" stroke-width=".9"/>
      </g>
      <g transform="rotate(10 170 78)">
        <rect x="130" y="20" width="82" height="102" rx="2" fill="url(#${id.sheet})" stroke="${ink}" stroke-width="1.3"/>
        <path d="M138 30 h30 M138 37 h40 M138 42 h34" stroke="#b3a08c" stroke-width=".9"/>
        <path d="M172 58 L186 34 Q188 31 190 34 L204 58Z" fill="#e9dcc6" stroke="#8a7462" stroke-width="1"/>
        <path d="M188 36 V52" stroke="#8a7462" stroke-width=".8" stroke-dasharray="1.6 1.6"/>
        <ellipse cx="188" cy="54" rx="6" ry="2.6" style="fill:var(--c-acc)" opacity=".55"/>
      </g>
      <rect x="46" y="70" width="148" height="70" rx="4" fill="url(#${id.inn})" stroke="${ink}" stroke-width="1.8"/>
      <path d="M46 72 L113 28 Q120 23.5 127 28 L194 72 Z" fill="url(#${id.env})" stroke="${ink}" stroke-width="1.8"/>
      <path d="M60 69.5 L115.5 33.6 Q120 31 124.5 33.6 L180 69.5 Z" fill="url(#${id.pat})"/>
      <path d="M60 69.5 L115.5 33.6 Q120 31 124.5 33.6 L180 69.5" fill="none" stroke="${ink}" stroke-width=".8" stroke-dasharray="2 2.4" opacity=".45"/>
      <g transform="rotate(-4 120 74)">
        <rect x="68" y="30" width="104" height="90" rx="2" fill="url(#${id.paper})" stroke="${ink}" stroke-width="1.5"/>
        <path d="M69 58.5 H171" stroke="#dccbb0" stroke-width="1"/><rect x="69" y="59" width="102" height="4" fill="#7a5a3a" opacity=".05"/>
        <text x="79" y="44" font-family="Georgia,'Times New Roman',serif" font-style="italic" font-size="8.5" fill="#5b3a2e">Liebe Eyja,</text>
        <path d="M128 42.5 q3 -3 6 0 q3 3 6 0" fill="none" style="stroke:var(--c-acc)" stroke-width=".9" opacity=".8"/>
        <g fill="none" stroke="#6b4a3a" stroke-width=".95" opacity=".8">${hand}</g>
      </g>
      <path d="M46 74 L114 110 Q120 113.5 126 110 L194 74 L194 136 Q194 140 190 140 L50 140 Q46 140 46 136 Z" fill="url(#${id.env})" stroke="${ink}" stroke-width="1.8"/>
      <path d="M49 138 L106 105 M191 138 L134 105" fill="none" stroke="${ink}" stroke-width="1.1" opacity=".3"/>
      <path d="M52 132 Q120 126 188 132" fill="none" stroke="#fff" stroke-width="1" opacity=".5"/>
      <g fill="#8a6440" opacity=".35">${specks}</g>
      <g transform="translate(170 116) rotate(-24)">
        <path d="M0 2 C-1 10 1 18 -2 26" fill="none" stroke="#7a7c44" stroke-width="1.4"/>
        <path d="M-.6 13 C-6.5 10 -10 12 -12 15.4 C-8 17.6 -4 16.8 -.6 13Z" fill="#a3a462" stroke="#5e6034" stroke-width=".7"/>
        <path d="M0 19 C5.5 16 9.5 17.4 11.4 20.6 C7.6 23 3.6 22.4 0 19Z" fill="#a3a462" stroke="#5e6034" stroke-width=".7"/>
        <g transform="translate(0 -4)">${petals}<circle r="2.2" style="fill:var(--c-acc)" stroke="#6a2a12" stroke-width=".6"/><circle cx="-.6" cy="-.6" r=".6" fill="#fff" opacity=".6"/></g>
        <rect x="-10" y="7" width="20" height="7" rx="1" transform="rotate(18)" fill="#fffbe8" fill-opacity=".55" stroke="#cdbd9a" stroke-width=".6"/>
      </g>
      <g>
        <path d="${flame(1.12, 120, 116)}" fill="#000" opacity=".25" transform="translate(1.2 1.6)"/>
        <path d="${flame(1.12, 120, 116)}" fill="url(#${id.seal})" stroke="#5a1414" stroke-width="1.4"/>
        <path d="${flame(0.74, 120, 118)}" fill="none" stroke="#3a0a0a" stroke-width="1" opacity=".3"/>
        <path d="${flame(0.74, 119.4, 117.4)}" fill="none" stroke="#fff" stroke-width=".7" opacity=".35"/>
        <path d="M117 121 C114 116 118 111.5 121.5 113 C124.5 114.5 123 118.6 120.4 118 C118.6 117.6 119.2 115.6 120.6 115.8" fill="none" stroke="#3a0a0a" stroke-width="1" opacity=".35"/>
        <ellipse cx="115.2" cy="110" rx="2.2" ry="3.4" transform="rotate(28 115.2 110)" fill="#fff" opacity=".45"/>
      </g>
    </g>
    <g style="fill:var(--c-acc2)"><circle cx="16" cy="26" r="1.2" opacity=".6"/><circle cx="222" cy="30" r="1.5" opacity=".55"/><circle cx="228" cy="66" r="1" opacity=".5"/><circle cx="10" cy="58" r=".9" opacity=".5"/><circle cx="204" cy="10" r="1" opacity=".5"/></g>
    <path d="${sparkle(36, 12, 4.2)} ${sparkle(214, 120, 3.4)}" style="fill:var(--c-acc)" opacity=".75"/>`;
    return svg('0 0 240 160', 'scn-letter', body);
  }

  /* ====================================================================
   * 2. 宠物大赛第一名 —— 玫瑰花结奖章 + 黑色小羊 + 口哨 + 彩纸
   * ==================================================================== */
  function trophy() {
    const id = { ros: nid('tr'), ros2: nid('tr2'), gold: nid('tgo'), silver: nid('tsv'), path: nid('tp'), wool: nid('tw'), face: nid('tf'), horn: nid('th'), glow: nid('tsg') };
    const ink = '#3a1c14';
    const cx = 92, cy = 62;
    const ring = (R0, n, bump, rot = 0) => {
      let d = '';
      for (let i = 0; i <= n; i++) {
        const a = rot + (i / n) * TAU, p = pol(cx, cy, R0, a);
        if (i === 0) d += `M${P(p[0], p[1])}`;
        else { const c = pol(cx, cy, R0 + bump * 2, a - Math.PI / n); d += ` Q${P(c[0], c[1])} ${P(p[0], p[1])}`; }
      }
      return d + 'Z';
    };
    let pleats = '';
    for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU, p1 = pol(cx, cy, 29, a), p2 = pol(cx, cy, 37, a); pleats += `M${P(p1[0], p1[1])} L${P(p2[0], p2[1])} `; }
    let pleats2 = '';
    for (let i = 0; i < 20; i++) { const a = 0.16 + (i / 20) * TAU, p1 = pol(cx, cy, 22.5, a), p2 = pol(cx, cy, 28.5, a); pleats2 += `M${P(p1[0], p1[1])} L${P(p2[0], p2[1])} `; }
    let laurel = '';
    for (let k = 0; k < 6; k++) {
      [1, -1].forEach((side) => {
        const a = Math.PI / 2 + side * (0.35 + k * 0.2), p = pol(cx, cy, 15.4, a);
        const deg = r((a * 180) / Math.PI + 90 + side * 30);
        laurel += `<ellipse cx="${r(p[0])}" cy="${r(p[1])}" rx="2.5" ry="1.1" transform="rotate(${deg} ${r(p[0])} ${r(p[1])})"/>`;
      });
    }
    const R = rng(3);
    const cols = ['var(--c-acc)', 'var(--c-acc2)', 'var(--c-acc3)', '#ffd66b', '#fff3c4'];
    const spots = [[18, 28], [40, 14], [150, 18], [176, 36], [208, 20], [226, 52], [198, 66], [14, 70], [26, 96], [224, 100], [124, 10], [62, 8], [8, 118], [146, 44], [232, 132], [190, 8]];
    let confetti = '';
    spots.forEach(([x, y], i) => {
      const c = cols[i % cols.length], st = c.startsWith('var') ? `style="fill:${c}"` : `fill="${c}"`, rot = r(R() * 180), kind = i % 4;
      if (kind === 0) confetti += `<rect x="${x - 2.4}" y="${y - 1.3}" width="4.8" height="2.6" rx=".6" transform="rotate(${rot} ${x} ${y})" ${st}/>`;
      else if (kind === 1) confetti += `<circle cx="${x}" cy="${y}" r="1.7" ${st}/>`;
      else if (kind === 2) confetti += `<path d="M${x} ${y - 2.4} L${r(x + 2.2)} ${r(y + 1.6)} L${r(x - 2.2)} ${r(y + 1.6)}Z" transform="rotate(${rot} ${x} ${y})" ${st}/>`;
      else confetti += `<path d="M${r(x - 4)} ${y} q2 -3 4 0 q2 3 4 0" fill="none" ${st.replace('fill', 'stroke')} stroke-width="1.4" stroke-linecap="round"/>`;
    });
    const ids = { wool: id.wool, face: id.face, horn: id.horn, glow: id.glow };
    const body = `<defs>
      <radialGradient id="${id.ros}" cx=".5" cy=".5" r=".5">${vstop(0.55, '--c-acc2')}${vstop(1, '--c-acc')}</radialGradient>
      <radialGradient id="${id.ros2}" cx=".45" cy=".4" r=".6">${vstop(0, '--c-acc2', 1)}${vstop(0.5, '--c-acc3')}${vstop(1, '--c-acc3')}</radialGradient>
      <radialGradient id="${id.gold}" cx=".38" cy=".32" r=".8">${stop(0, '#fff6c4')}${stop(0.45, '#ffd45a')}${stop(0.8, '#e0a23a')}${stop(1, '#b9761c')}</radialGradient>
      <linearGradient id="${id.silver}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#ffffff')}${stop(0.5, '#cfd6de')}${stop(1, '#8d97a3')}</linearGradient>
      <path id="${id.path}" d="M60 112.6 Q92 120.4 124 112.6" fill="none"/>
      ${sheepDefs(ids, PAL.black)}
    </defs>
    <ellipse cx="118" cy="149" rx="96" ry="5" fill="#000" opacity=".2"/>
    <g>${confetti}</g>
    <g stroke-linejoin="round" stroke-linecap="round">
      <path d="M78 80 L98 84 L86 146 L77.5 137.5 L66 142 Z" style="fill:var(--c-acc3)" stroke="${ink}" stroke-width="1.7"/>
      <path d="M88.4 83 L75 139" fill="none" style="stroke:var(--c-acc2)" stroke-width="2" opacity=".75"/>
      <path d="M88 84 L108 80 L120 142 L108.5 137.5 L100 146 Z" style="fill:var(--c-acc)" stroke="${ink}" stroke-width="1.7"/>
      <path d="M97.8 83 L110.4 140" fill="none" style="stroke:var(--c-acc2)" stroke-width="2" opacity=".75"/>
      <ellipse cx="93" cy="88" rx="20" ry="6" fill="#000" opacity=".22"/>
      <path d="${ring(37, 26, 3.2)}" fill="url(#${id.ros})" stroke="${ink}" stroke-width="1.6"/>
      <path d="${pleats}" fill="none" stroke="${ink}" stroke-width=".8" opacity=".3"/>
      <path d="${ring(28.5, 20, 2.4, 0.16)}" fill="url(#${id.ros2})" stroke="${ink}" stroke-width="1.4"/>
      <path d="${pleats2}" fill="none" stroke="${ink}" stroke-width=".7" opacity=".3"/>
      <circle cx="${cx}" cy="${cy}" r="21.5" fill="url(#${id.gold})" stroke="#7a4a0c" stroke-width="1.8"/>
      <circle cx="${cx}" cy="${cy}" r="18" fill="none" stroke="#b07a1e" stroke-width=".9" stroke-dasharray="1.4 1.8"/>
      <g fill="#c98a1e" opacity=".9">${laurel}</g>
      <text x="${cx + 0.9}" y="${cy + 10.8}" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="28" font-weight="700" fill="#fff4cf" opacity=".85">1</text>
      <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="28" font-weight="700" fill="#8a4f0e">1</text>
      <path d="M76.5 55 A17 17 0 0 1 90 44.6" fill="none" stroke="#fff" stroke-width="2" opacity=".75"/>
      <path d="M58 106 L46 107 L51 112.6 L46 119.4 L58 118Z M126 106 L138 107 L133 112.6 L138 119.4 L126 118Z" fill="#e6cfa8" stroke="${ink}" stroke-width="1.4"/>
      <path d="M56 103.6 Q92 112 128 103.6 L128 117.6 Q92 126 56 117.6 Z" fill="#fff4df" stroke="${ink}" stroke-width="1.5"/>
      <text font-family="'Microsoft YaHei','PingFang SC',sans-serif" font-size="7.4" font-weight="700" letter-spacing="1.6" fill="#6b2d20"><textPath href="#${id.path}" startOffset="50%" text-anchor="middle">宠物大赛</textPath></text>
      <g>
        <path d="M57 125 C70 129 72 143 60 147.5 C48 152 30 150 21 143" fill="none" style="stroke:var(--c-acc)" stroke-width="2.4"/>
        <path d="M57 125 C70 129 72 143 60 147.5 C48 152 30 150 21 143" fill="none" stroke="#fff" stroke-width=".9" stroke-dasharray="1.6 2.4" opacity=".55"/>
        <circle cx="53.5" cy="124.4" r="3.1" fill="none" stroke="#5f6874" stroke-width="1.4"/>
        <path d="M43 119.5 L23 119.5 Q19 119.5 19 123.5 L19 127.5 Q19 131.2 23 131.2 L32.8 131.4 A10.5 10.5 0 1 0 43 119.5 Z" fill="url(#${id.silver})" stroke="#3b4250" stroke-width="1.6"/>
        <rect x="35" y="118" width="6.6" height="3" rx=".8" fill="#2a2f38"/>
        <ellipse cx="19.8" cy="125.4" rx=".9" ry="3" fill="#2a2f38"/>
        <path d="M23 122.2 H38" stroke="#fff" stroke-width="1.2" opacity=".8"/>
        <ellipse cx="46" cy="125.6" rx="3" ry="2" transform="rotate(-30 46 125.6)" fill="#fff" opacity=".7"/>
      </g>
      <g transform="translate(176 139) scale(1.42)">${sheepFig(ids, PAL.black, { pose: 'sit', eyes: 'happy', heat: true, bow: true })}</g>
    </g>
    <path d="${sparkle(138, 26, 4.6)} ${sparkle(46, 30, 3.6)} ${sparkle(150, 70, 2.6)}" style="fill:var(--c-acc2)"/>`;
    return svg('0 0 240 160', 'scn-trophy', body);
  }

  /* ====================================================================
   * 3. 想要留住的声音 —— 手写标签的磁带
   * ==================================================================== */
  function cassette() {
    const uc = nid('cas');
    const id = { shell: nid('csh'), lclip: nid('clc'), win: nid('cwn'), roll: nid('crl') };
    const ink = '#34304a';
    const reel = (cx, cy) => {
      let teeth = '', holes = '';
      for (let k = 0; k < 6; k++) {
        const a = (k * TAU) / 6, p1 = pol(cx, cy, 5.1, a), p2 = pol(cx, cy, 3, a);
        teeth += `<line x1="${r(p1[0])}" y1="${r(p1[1])}" x2="${r(p2[0])}" y2="${r(p2[1])}"/>`;
      }
      for (let k = 0; k < 3; k++) { const p = pol(cx, cy, 7, (k * TAU) / 3 + 0.5); holes += `<circle cx="${r(p[0])}" cy="${r(p[1])}" r="1.05"/>`; }
      return `<g class="sc-reel"><circle cx="${cx}" cy="${cy}" r="9" fill="#fbf8f3" stroke="${ink}" stroke-width="1.4"/><circle cx="${cx}" cy="${cy}" r="5.4" fill="#2a2433"/><g stroke="#fbf8f3" stroke-width="1.5" stroke-linecap="round">${teeth}</g><g style="fill:var(--c-acc3)">${holes}</g></g>`;
    };
    const rings = (cx, cy, rr) => { let s = ''; for (let q = 11; q < rr; q += 2.6) s += `<circle cx="${cx}" cy="${cy}" r="${r(q)}"/>`; return s; };
    const screw = (x, y) => `<circle cx="${x}" cy="${y}" r="2.8" fill="#dcdfe7" stroke="${ink}" stroke-width=".9"/><path d="M${r(x - 1.6)} ${r(y - 1.6)} L${r(x + 1.6)} ${r(y + 1.6)} M${r(x - 1.6)} ${r(y + 1.6)} L${r(x + 1.6)} ${r(y - 1.6)}" stroke="${ink}" stroke-width=".7"/>`;
    const note = (x, y, s, rot) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><ellipse cx="0" cy="0" rx="3.3" ry="2.3" transform="rotate(-20)"/><path d="M2.9 -.8 V-11.5 Q6.2 -9.6 7.6 -6.2" fill="none" stroke-width="1.4" stroke-linecap="round"/></g>`;
    const style = `<style>.${uc} .sc-reel{transform-box:fill-box;transform-origin:center;animation:${uc}-spin 4s linear infinite}` +
      `.${uc} .scn-cw{animation:${uc}-pulse 2.4s ease-in-out infinite}` +
      `@keyframes ${uc}-spin{to{transform:rotate(360deg)}}@keyframes ${uc}-pulse{0%,100%{opacity:.3}50%{opacity:1}}` +
      `@media (prefers-reduced-motion:reduce){.${uc} .sc-reel,.${uc} .scn-cw{animation:none}}</style>`;
    const body = `${style}<defs>
      <linearGradient id="${id.shell}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#fdfcfa')}${stop(1, '#e2e5ee')}</linearGradient>
      <radialGradient id="${id.roll}" cx=".5" cy=".5" r=".5">${stop(0.3, '#7a5646')}${stop(1, '#3a2520')}</radialGradient>
      <clipPath id="${id.lclip}"><rect x="46" y="40" width="148" height="64" rx="5"/></clipPath>
      <clipPath id="${id.win}"><rect x="72" y="66" width="96" height="28" rx="14"/></clipPath>
    </defs>
    <ellipse cx="120" cy="146" rx="84" ry="5" fill="#000" opacity=".18"/>
    <g fill="none" stroke-linecap="round">
      <g style="stroke:var(--c-acc2)">
        <path class="scn-cw" d="M212 70 Q218 82 212 94" stroke-width="2.2"/>
        <path class="scn-cw" d="M219 62 Q229 82 219 102" stroke-width="1.9" style="animation-delay:.3s"/>
        <path class="scn-cw" d="M226 54 Q239 82 226 110" stroke-width="1.6" style="animation-delay:.6s"/>
      </g>
      <g style="stroke:var(--c-acc3)">
        <path class="scn-cw" d="M28 70 Q22 82 28 94" stroke-width="2.2" style="animation-delay:.15s"/>
        <path class="scn-cw" d="M21 62 Q11 82 21 102" stroke-width="1.9" style="animation-delay:.45s"/>
        <path class="scn-cw" d="M14 54 Q1 82 14 110" stroke-width="1.6" style="animation-delay:.75s"/>
      </g>
    </g>
    <g stroke-linejoin="round" stroke-linecap="round">
      <rect x="34" y="30" width="172" height="104" rx="10" fill="url(#${id.shell})" stroke="${ink}" stroke-width="2"/>
      <rect x="34" y="30" width="172" height="104" rx="10" style="fill:var(--c-acc2)" opacity=".12"/>
      <rect x="39.5" y="35.5" width="161" height="93" rx="7" fill="none" stroke="${ink}" stroke-opacity=".18" stroke-width="1"/>
      <path d="M40 40 Q40 34 46 34 H110" fill="none" stroke="#fff" stroke-width="1.6" opacity=".9"/>
      ${screw(41.5, 38)}${screw(198.5, 38)}${screw(41.5, 126)}${screw(198.5, 126)}
      <g clip-path="url(#${id.lclip})">
        <rect x="46" y="40" width="148" height="64" fill="#fffdf6"/>
        <rect x="46" y="40" width="148" height="12" style="fill:var(--c-acc3)"/>
        <rect x="46" y="52" width="148" height="2.2" style="fill:var(--c-acc)"/>
        <rect x="46" y="97" width="148" height="7" style="fill:var(--c-acc2)"/>
        <path d="M52 101 h88" stroke="#fff" stroke-width=".8" stroke-dasharray="1 2.2" opacity=".8"/>
      </g>
      <rect x="46" y="40" width="148" height="64" rx="5" fill="none" stroke="${ink}" stroke-width="1.4"/>
      <text x="53" y="48.6" font-family="'Segoe UI',Arial,sans-serif" font-size="6" font-weight="700" letter-spacing="1.4" fill="#fff">C-60</text>
      <text x="187" y="48.6" text-anchor="end" font-family="'Segoe UI',Arial,sans-serif" font-size="5" letter-spacing="1" fill="#fff" opacity=".9">TYPE I · SIDE A</text>
      <text x="118" y="63.4" text-anchor="middle" transform="rotate(-2 118 60)" font-family="'Segoe Print','Bradley Hand','Comic Sans MS',cursive" font-size="9" fill="#3a3354">sounds to keep</text>
      <path d="M156 58.6 C153.8 56.8 153.8 54.4 155.4 54.4 C156.2 54.4 156.6 55.1 156.6 55.5 C156.6 55.1 157 54.4 157.8 54.4 C159.4 54.4 159.4 56.8 156.6 58.6Z" style="fill:var(--c-acc)" transform="rotate(-2 118 60) translate(-3.4 3.8)"/>
      <circle cx="59" cy="80" r="7.5" fill="none" stroke="${ink}" stroke-width="1.2"/>
      <text x="59" y="83.6" text-anchor="middle" font-family="'Segoe UI',Arial,sans-serif" font-size="10" font-weight="700" fill="${ink}">A</text>
      <path d="M181 85 C175.6 80.8 175.6 75.6 179 75.6 C180.4 75.6 181 76.8 181 77.6 C181 76.8 181.6 75.6 183 75.6 C186.4 75.6 186.4 80.8 181 85Z" fill="none" style="stroke:var(--c-acc)" stroke-width="1.3"/>
      <rect x="72" y="66" width="96" height="28" rx="14" fill="#2c2636"/>
      <g clip-path="url(#${id.win})">
        <circle cx="96" cy="80" r="19" fill="url(#${id.roll})"/>
        <circle cx="144" cy="80" r="13" fill="url(#${id.roll})"/>
        <g fill="none" stroke="#9a735f" stroke-width=".5" opacity=".55">${rings(96, 80, 19)}${rings(144, 80, 13)}</g>
        <path d="M86 66 L97 66 L83 94 L72 94Z M101 66 L105 66 L91 94 L87 94Z" fill="#fff" opacity=".14"/>
      </g>
      <rect x="72" y="66" width="96" height="28" rx="14" fill="none" stroke="${ink}" stroke-width="1.4"/>
      ${reel(96, 80)}${reel(144, 80)}
      <path d="M78 134 L86 113 L154 113 L162 134" fill="#e7e8ef" stroke="${ink}" stroke-width="1.6"/>
      <circle cx="98" cy="125" r="3.4" fill="#2a2433"/><circle cx="142" cy="125" r="3.4" fill="#2a2433"/>
      <rect x="110.5" y="121.5" width="5" height="5" rx="1" fill="#2a2433"/><rect x="124.5" y="121.5" width="5" height="5" rx="1" fill="#2a2433"/>
      <circle cx="120" cy="117.5" r="1.4" fill="#2a2433"/>
    </g>
    <g style="fill:var(--c-acc);stroke:var(--c-acc)">${note(213, 38, 1, 12)}${note(22, 128, 0.85, -10)}${note(30, 34, 0.7, -6)}</g>
    <path d="${sparkle(20, 52, 3.4)} ${sparkle(226, 128, 3.8)} ${sparkle(200, 16, 2.6)}" style="fill:var(--c-acc2)"/>`;
    return svg('0 0 240 160', `scn-cassette ${uc}`, body);
  }

  /* ====================================================================
   * 4. 想要留下的生命 —— 棉花糖3号、试管、偷看的粉色小羊、一球冰淇淋
   * ==================================================================== */
  function flowerPot() {
    const id = { pot: nid('fp'), rim: nid('fr'), petal: nid('fpt'), leaf: nid('fl'), wool: nid('fw'), face: nid('ff'), horn: nid('fh'), cream: nid('fc'), glass: nid('fg') };
    const ink = '#3e3a55';
    const fx = 108, fy = 46;
    let petals = '';
    for (let k = 0; k < 5; k++) {
      petals += `<g transform="rotate(${k * 72 - 4} ${fx} ${fy})"><path d="M${fx} ${fy} C${fx - 8} ${fy - 3} ${fx - 11} ${fy - 14} ${fx - 6} ${fy - 19} C${fx - 3.5} ${fy - 21.5} ${fx - 1} ${fy - 20.5} ${fx} ${fy - 18} C${fx + 1} ${fy - 20.5} ${fx + 3.5} ${fy - 21.5} ${fx + 6} ${fy - 19} C${fx + 11} ${fy - 14} ${fx + 8} ${fy - 3} ${fx} ${fy}Z" fill="url(#${id.petal})" stroke="#d0708f" stroke-width="1.2"/><path d="M${fx} ${fy - 4} V${fy - 14} M${fx - 2.4} ${fy - 6} Q${fx - 4} ${fy - 10} ${fx - 3.6} ${fy - 13} M${fx + 2.4} ${fy - 6} Q${fx + 4} ${fy - 10} ${fx + 3.6} ${fy - 13}" fill="none" stroke="#f0a0bc" stroke-width=".7" opacity=".85"/></g>`;
    }
    let stamens = '';
    for (let k = 0; k < 8; k++) { const p = pol(fx, fy, 6.2, (k / 8) * TAU + 0.3); stamens += `<circle cx="${r(p[0])}" cy="${r(p[1])}" r=".95"/>`; }
    let marks = '';
    [110, 116, 122, 128, 134, 140].forEach((y, i) => { marks += `M${r(91 + (y - 104) * 0.09)} ${y} h${i % 2 ? 3 : 5.5} `; });
    const ids = { wool: id.wool, face: id.face, horn: id.horn };
    const body = `<defs>
      <linearGradient id="${id.pot}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#e9eef7')}${stop(0.32, '#ffffff')}${stop(1, '#c9d3e4')}</linearGradient>
      <linearGradient id="${id.rim}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#ffffff')}${stop(1, '#dfe5f0')}</linearGradient>
      <radialGradient id="${id.petal}" gradientUnits="userSpaceOnUse" cx="${fx}" cy="${fy}" r="22">${stop(0, '#ffffff')}${stop(0.45, '#fff2f7')}${stop(1, '#f59ab8')}</radialGradient>
      <linearGradient id="${id.leaf}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#b5e3b9')}${stop(1, '#5c9f72')}</linearGradient>
      <radialGradient id="${id.cream}" cx=".4" cy=".3" r=".8">${stop(0, '#fffcf4')}${stop(1, '#f5dfbf')}</radialGradient>
      <linearGradient id="${id.glass}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#ffffff', 0.85)}${stop(0.5, '#eaf2ff', 0.35)}${stop(1, '#ffffff', 0.7)}</linearGradient>
      ${sheepDefs(ids, PAL.pink)}
    </defs>
    <ellipse cx="124" cy="149" rx="100" ry="5" fill="#000" opacity=".15"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      <g opacity=".55">
        <g transform="translate(122 140) scale(-1.25 1.25)">${sheepFig(ids, PAL.pink, { eyes: 'open', phase: 1 })}</g>
        <path d="${sparkle(160, 100, 3)} ${sparkle(152, 128, 2.2)}" fill="#fff" stroke="#e08aac" stroke-width=".6"/>
      </g>
      <g>
        <path d="M40 100 L40 132 A4 4 0 0 0 48 132 L48 100" fill="url(#${id.glass})" stroke="${ink}" stroke-width="1.2"/>
        <path d="M40.6 116 L47.4 116 L47.4 132 A3.4 3.4 0 0 1 40.6 132Z" fill="#f7a8c4"/>
        <path d="M56 104 L56 132 A4 4 0 0 0 64 132 L64 104" fill="url(#${id.glass})" stroke="${ink}" stroke-width="1.2"/>
        <path d="M56.6 122 L63.4 122 L63.4 132 A3.4 3.4 0 0 1 56.6 132Z" style="fill:var(--c-acc2)" opacity=".75"/>
        <rect x="38.6" y="98" width="10.8" height="3" rx="1" fill="#fff" stroke="${ink}" stroke-width="1"/>
        <rect x="54.6" y="102" width="10.8" height="3" rx="1" fill="#fff" stroke="${ink}" stroke-width="1"/>
        <path d="M42 104 V114 M58 108 V118" stroke="#fff" stroke-width="1.2" opacity=".9"/>
        <rect x="31" y="118" width="42" height="5" rx="1.5" fill="#ffffff" stroke="${ink}" stroke-width="1.2"/>
        <path d="M34 123 V141 M70 123 V141" stroke="${ink}" stroke-width="1.6"/>
        <rect x="31" y="139" width="42" height="5" rx="1.5" fill="#f1f3f9" stroke="${ink}" stroke-width="1.2"/>
      </g>
      <path d="M110 96 C104 84 115 68 ${fx} ${fy + 3}" fill="none" stroke="#4f8d62" stroke-width="3.6"/>
      <path d="M110 96 C104 84 115 68 ${fx} ${fy + 3}" fill="none" stroke="#7cc08f" stroke-width="2"/>
      <path d="M108.6 80 C102 72 94 70 89.6 72 C94 80 102 83 108.6 80Z" fill="url(#${id.leaf})" stroke="#3f7a55" stroke-width="1.2"/>
      <path d="M108 79.4 Q99 75 91.4 72.6" fill="none" stroke="#3f7a55" stroke-width=".8" opacity=".7"/>
      <path d="M111 68 C117 60 125 58 129.4 60 C125.4 67.4 117.4 70.4 111 68Z" fill="url(#${id.leaf})" stroke="#3f7a55" stroke-width="1.2"/>
      <path d="M111.6 67.6 Q120 63 128.6 60.4" fill="none" stroke="#3f7a55" stroke-width=".8" opacity=".7"/>
      ${petals}
      <circle cx="${fx}" cy="${fy}" r="4.8" fill="#ffe08a" stroke="#e0a24a" stroke-width="1"/>
      <g fill="#f5b04a">${stamens}</g>
      <circle cx="${fx - 1.4}" cy="${fy - 1.4}" r="1.3" fill="#fff" opacity=".8"/>
      <path d="M127 96 L146 79" stroke="#8a6a48" stroke-width="3.2"/><path d="M127 96 L146 79" stroke="#d9b88a" stroke-width="1.8"/>
      <g transform="rotate(-8 152 72)">
        <rect x="131" y="64" width="44" height="16" rx="3" fill="#fffdf7" stroke="${ink}" stroke-width="1.2"/>
        <path d="M134 64 H137 V80 H134 Q131 80 131 77 V67 Q131 64 134 64Z" style="fill:var(--c-acc)"/>
        <text x="156.5" y="75.2" text-anchor="middle" font-family="'Microsoft YaHei','PingFang SC',sans-serif" font-size="7" font-weight="700" fill="#4a4366">棉花糖3号</text>
      </g>
      <rect x="84" y="95" width="52" height="9" rx="3.5" fill="url(#${id.rim})" stroke="${ink}" stroke-width="1.8"/>
      <ellipse cx="110" cy="96.6" rx="22" ry="2.8" fill="#5b4033"/>
      <path d="M100 96 q2 -1.4 4 0 M114 95.6 q2 -1.2 4 0" fill="none" stroke="#8a6a55" stroke-width=".8"/>
      <path d="M88 104 L132 104 L128.4 142 Q128 147 123 147 L97 147 Q92 147 91.6 142 Z" fill="url(#${id.pot})" stroke="${ink}" stroke-width="1.8"/>
      <path d="M88.4 107 L131.6 107 L131.3 110 L88.7 110Z" style="fill:var(--c-acc2)" opacity=".5"/>
      <path d="${marks}" fill="none" style="stroke:var(--c-acc2)" stroke-width="1.1"/>
      <rect x="103" y="117" width="22" height="15" rx="2" fill="#fffdf5" stroke="${ink}" stroke-width=".9"/>
      <text x="114" y="124" text-anchor="middle" font-family="'Segoe UI',Arial,sans-serif" font-size="5.4" font-weight="700" fill="${ink}">No.3</text>
      <path d="M106 127 v3 M107.4 127 v3 M109.6 127 v3 M110.6 127 v3 M112.6 127 v3 M114.6 127 v3 M115.6 127 v3 M117.8 127 v3 M119.4 127 v3 M121.6 127 v3" stroke="${ink}" stroke-width=".6"/>
      <path d="M94.6 110 L97 140" stroke="#fff" stroke-width="2.2" opacity=".8"/>
      <ellipse cx="198" cy="142" rx="24" ry="6.4" fill="#ffffff" stroke="${ink}" stroke-width="1.5"/>
      <ellipse cx="198" cy="141.2" rx="16.5" ry="3.9" fill="none" style="stroke:var(--c-acc2)" stroke-width="1" opacity=".65"/>
      <ellipse cx="203" cy="140.6" rx="7" ry="1.8" fill="#fff3df"/>
      <path d="M204 125 L214 106" stroke="#a8743a" stroke-width="5"/><path d="M204 125 L214 106" stroke="#eabd79" stroke-width="3.4"/>
      <path d="M206.2 117.4 l2.6 1.4 M208.6 112.8 l2.6 1.4" stroke="#b8844a" stroke-width=".7"/>
      <path d="M186 136 Q184 124 191 119 Q198 114 205 119 Q212 124 210 136 Q207 139 204 136.5 Q201 140 198 137 Q195 140 192 137 Q189 139.5 186 136Z" fill="url(#${id.cream})" stroke="${ink}" stroke-width="1.4"/>
      <path d="M189 122 Q198 114.4 207 122 Q205.4 126.4 203 124 Q201 128.4 199 125 Q196 128.6 194 124.6 Q191 127.4 189 122Z" fill="#f59ab7" stroke="#d0708f" stroke-width=".9"/>
      <path d="M192.6 120.6 l1.6 -.8 M197.6 119 l.4 1.6 M201.8 120.4 l1.6 .6" stroke="#fff" stroke-width="1" />
      <path d="M199 110.6 Q200 106.6 203.4 105.4" fill="none" stroke="#4f7a3a" stroke-width="1"/>
      <circle cx="199" cy="113.4" r="3.2" style="fill:var(--c-acc)" stroke="#6a1a2a" stroke-width="1"/>
      <circle cx="198" cy="112.4" r=".9" fill="#fff" opacity=".8"/>
      <path d="M190 130.6 q2 1.6 3.8 0" fill="none" stroke="#fff" stroke-width="1.2" opacity=".9"/>
    </g>
    <path d="${sparkle(78, 40, 4)} ${sparkle(136, 30, 3.4)} ${sparkle(90, 18, 2.6)}" style="fill:var(--c-acc2)" opacity=".85"/>
    <path d="${sparkle(176, 94, 2.8)} ${sparkle(24, 84, 3)}" style="fill:var(--c-acc3)" opacity=".8"/>
    <g fill="#ffc8da" opacity=".5"><circle cx="170" cy="112" r="2.2"/><circle cx="173" cy="109.6" r="1.6"/><circle cx="166" cy="104" r="1.4"/></g>`;
    return svg('0 0 240 160', 'scn-flower', body);
  }

  /* ====================================================================
   * 5. 年表上方的全景带：莱塔尼亚大学城 · 丘陵 · 火山 · 海滩
   * ==================================================================== */
  function panorama(form) {
    const alt = form === 'alter';
    const id = {};
    ['sky', 'horizon', 'halo', 'vol', 'lava', 'blur', 'puff', 'ash', 'sea', 'snow', 'fade', 'beam', 'lamp', 'sun', 'cloud', 'hill'].forEach((k) => { id[k] = nid('pn' + k); });
    const R = rng(alt ? 77 : 41);
    /* 暖金高光固定取色：本体全景在任一主题下都保持“熔岩夜” */
    const HOT = '#ffb347';
    const C = alt
      ? { far: '#dbe4f1', vol0: '#cfd8ea', vol1: '#b4c1da', gully: '#9fb0cf', shade: '#7f8fb5', hill: '#b7cbdc', hill2: '#a6bdd2', tree: '#91abc4', town: '#97a8c7', rock: '#8b9cbc', sand: '#f3e6d2', sea0: '#b9def4', sea1: '#8cc2e6', fg: '#8ba0bd', puff: '#ffffff' }
      : { far: '#2c1512', vol0: '#3f1c16', vol1: '#1c0d0c', gully: '#57281d', shade: '#000000', hill: '#170b0b', hill2: '#110808', tree: '#0c0606', town: '#0d0707', rock: '#0a0505', sand: '#1d1311', sea0: '#1c1116', sea1: '#0c070a', fg: '#0b0607', puff: '#2b1b1a' };

    /* ---------- 火山轮廓 ---------- */
    /* 构图集中在 x≈220–980：横幅较高时 slice 会裁掉左右两端 */
    const VX = 735, PEAK = 62, VB = 246, CR = 24, WL = 310, WR = 265, EXP = 1.9;
    const volY = (x) => {
      const d = x - VX, ad = Math.abs(d);
      if (ad <= CR) return PEAK + 4.5 * (1 - (d / CR) ** 2) + 0.8 * Math.sin(x * 0.9);
      const W = d < 0 ? WL : WR;
      if (ad > W) return VB + (ad - W) * 0.08;
      const t = (ad - CR) / (W - CR);
      let y = PEAK + (VB - PEAK) * (1 - Math.pow(1 - t, EXP));
      y += (2.6 * Math.sin(x * 0.071) + 1.6 * Math.sin(x * 0.19 + 1.3) + 0.8 * Math.sin(x * 0.43)) * Math.min(1, t * 4);
      y -= 16 * gauss(x, VX - 160, 32) + 6 * gauss(x, VX + 160, 38);
      return y;
    };
    const stream = (f, len, seed, step = 7) => {
      const pts = [], W = f < 0 ? WL : WR, s = f < 0 ? -1 : 1, af = Math.abs(f);
      const yEnd = PEAK + (VB - PEAK) * len;
      for (let y = PEAK + 3; y <= yEnd; y += step) {
        const u = (y - PEAK) / (VB - PEAK), t = 1 - Math.pow(Math.max(0, 1 - u), 1 / EXP), hw = CR + t * (W - CR);
        pts.push([VX + s * hw * af + Math.sin(y * 0.11 + seed) * 3 * Math.min(1, u * 5) + Math.sin(y * 0.29 + seed * 2) * 1.2, y]);
      }
      return pts;
    };
    const volPts = sample(VX - WL - 60, VX + WR + 60, 5, volY);
    const volPath = band(volPts);
    const shadePts = [[VX + 2, PEAK + 3], [VX + 22, 110], [VX + 40, 170], [VX + 30, 250], [VX + 30, 330]];
    const shadePath = `M${P(VX + 2, PEAK + 3)} ${volPts.filter((p) => p[0] > VX + 2).map((p) => `L${P(p[0], p[1])}`).join(' ')} L${VX + WR + 60} 330 ${shadePts.slice().reverse().map((p) => `L${P(p[0], p[1])}`).join(' ')}Z`;
    let gullies = '';
    [[-0.86, 0.62, 1], [-0.64, 0.5, 2], [-0.4, 0.66, 3], [-0.2, 0.42, 4], [0.1, 0.56, 5], [0.3, 0.44, 6], [0.52, 0.64, 7], [0.72, 0.5, 8], [0.9, 0.6, 9]]
      .forEach(([f, len, s]) => { gullies += `<path d="${spline(stream(f, len, s, 9))}"/>`; });

    /* ---------- 天空 ---------- */
    /* 天空不透明：两种形态的全景在任一主题下都是完整的画面 */
    let sky;
    if (alt) {
      sky = `<rect x="-60" y="-40" width="1320" height="370" fill="url(#${id.sky})"/>
        <circle cx="290" cy="58" r="120" fill="url(#${id.sun})"/>
        <circle cx="290" cy="58" r="19" fill="#fffbea"/>`;
    } else {
      sky = `<rect x="-60" y="-40" width="1320" height="370" fill="url(#${id.sky})"/>
        <rect x="-60" y="-40" width="1320" height="370" fill="url(#${id.horizon})"/>
        <ellipse cx="${VX}" cy="90" rx="330" ry="170" fill="url(#${id.halo})"/>`;
    }

    /* ---------- pl-1：远景（星月 / 彩虹云朵 + 远山） ---------- */
    const farPts = sample(-60, 1260, 12, (x) => 170 + 10 * Math.sin(x * 0.0075 + 0.4) + 7 * Math.sin(x * 0.019 + 1.7) + 3.5 * Math.sin(x * 0.051 + 0.3) + 1.6 * Math.sin(x * 0.13) - 34 * gauss(x, 370, 120) - 18 * gauss(x, 130, 90) - 22 * gauss(x, 1160, 60) + 22 * smoothstep(880, 1040, x));
    let l1 = '';
    if (alt) {
      const bands = ['#f59ab0', '#ffc98f', '#fff09a', '#a9e5c5', '#9ccaf5', '#b9a2ec'];
      l1 += `<g fill="none" stroke-width="6.6" opacity=".4">${bands.map((c, i) => { const rr = 162 - i * 6.2; return `<path d="M${P(990 - rr, 236)} A${r(rr)} ${r(rr)} 0 0 1 ${P(990 + rr, 236)}" stroke="${c}"/>`; }).join('')}</g>`;
      const cloud = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="url(#${id.cloud})"><circle cx="-22" cy="2" r="12"/><circle cx="-6" cy="-8" r="17"/><circle cx="14" cy="-4" r="14"/><circle cx="30" cy="4" r="9"/><rect x="-34" y="2" width="72" height="12" rx="6"/></g>`;
      l1 += cloud(150, 86, 1) + cloud(460, 44, 0.8) + cloud(575, 104, 0.62) + cloud(1130, 66, 0.86);
      l1 += `<g fill="none" stroke="#7d8bb0" stroke-width="1.3" stroke-linecap="round" opacity=".7"><path d="M498 64 q4 -4 8 0 q4 -4 8 0"/><path d="M522 54 q3 -3 6 0 q3 -3 6 0"/><path d="M540 70 q3 -3 6 0 q3 -3 6 0"/></g>`;
    } else {
      let stars = '';
      for (let i = 0; i < 54; i++) {
        const x = -40 + R() * 1280, y = 6 + R() * 118;
        if (Math.abs(x - VX - 60) < 150 && y < 70) continue;
        stars += `<circle class="pn-star" cx="${r(x)}" cy="${r(y)}" r="${r(0.5 + R() * 0.9)}" opacity="${r(0.25 + R() * 0.6)}" style="animation-delay:${r(R() * 4)}s"/>`;
      }
      l1 += `<g fill="#ffe8d6">${stars}</g>`;
      l1 += `<circle cx="270" cy="46" r="30" fill="url(#${id.lamp})"/><path d="M270 30 A16 16 0 1 0 270 62 A20 20 0 0 1 270 30Z" fill="#ffe3c4" opacity=".92"/>`;
      l1 += `<g><ellipse cx="320" cy="74" rx="90" ry="5" fill="#2a1414" opacity=".7"/><ellipse cx="330" cy="77" rx="70" ry="2.4" style="fill:var(--c-acc)" opacity=".16"/><ellipse cx="560" cy="44" rx="70" ry="4" fill="#2a1414" opacity=".6"/><ellipse cx="1110" cy="60" rx="100" ry="5" fill="#2a1414" opacity=".6"/><ellipse cx="1100" cy="63" rx="80" ry="2.2" style="fill:var(--c-acc)" opacity=".14"/></g>`;
    }
    l1 += `<path d="${band(farPts)}" fill="${C.far}"/>`;
    if (alt) l1 += `<ellipse cx="500" cy="188" rx="420" ry="16" fill="#ffffff" opacity=".45"/>`;

    /* ---------- pl-2：火山 + 烟柱 ---------- */
    /* 烟柱：从火山口升起，向右（及少量向左）飘散；纯烬形态在尾端断成一朵朵云 */
    const plume = [];
    const Rp = rng(alt ? 5 : 9);
    const puffAt = (x, y, rr, n) => {
      for (let k = 0; k < n; k++) plume.push([r(x + (Rp() - 0.5) * rr * 1.1), r(y + (Rp() - 0.5) * rr * 0.7), r(rr * (0.62 + Rp() * 0.45))]);
    };
    for (let i = 0; i <= 8; i++) { const t = i / 8; puffAt(VX + 4 * Math.sin(t * 3) + 26 * t * t, 55 - 42 * t, 7 + 11 * t, 2); }
    const ASH = plume.length;
    for (let i = 1; i <= 7; i++) { const t = i / 7; puffAt(VX + 12 - 105 * t, 15 + 5 * t + 3 * Math.sin(t * 6), 15 - 7 * t, 2); }
    for (let i = 1; i <= 20; i++) {
      const t = i / 20;
      if (alt && t > 0.55 && i % 4 === 0) continue;
      puffAt(VX + 30 + 330 * t, 12 - 5 * Math.sin(t * 5.5) + 7 * t, 20 - 9 * t, 3);
    }
    let l2 = `<path d="${volPath}" fill="url(#${id.vol})"/>`;
    l2 += `<path d="${shadePath}" fill="${C.shade}" opacity="${alt ? 0.14 : 0.28}"/>`;
    if (alt) {
      const snowY = (x) => 104 + 6 * Math.sin(x * 0.083) + 3.5 * Math.sin(x * 0.21 + 2) + 13 * Math.pow(Math.max(0, Math.sin(x * 0.052 + 0.6)), 6);
      const top = [], bot = [];
      for (let x = VX - 150; x <= VX + 150; x += 3) { const yv = volY(x), ys = snowY(x); if (yv < ys) { top.push([x, yv - 0.6]); bot.push([x, ys]); } }
      if (top.length > 2) l2 += `<path d="M${top.map((p) => P(p[0], p[1])).join(' L')} L${bot.reverse().map((p) => P(p[0], p[1])).join(' L')}Z" fill="url(#${id.snow})"/>`;
    }
    l2 += `<g fill="none" stroke="${C.gully}" stroke-width="1.2" stroke-linecap="round" opacity="${alt ? 0.55 : 0.6}">${gullies}</g>`;
    l2 += `<ellipse cx="${VX}" cy="${PEAK + 2.5}" rx="${CR - 3}" ry="3.2" fill="${alt ? '#9aa6bf' : '#120606'}" opacity=".85"/>`;
    if (!alt) {
      const flows = [[-0.55, 0.62, 1], [-0.22, 0.8, 2], [-0.36, 0.42, 6], [0.08, 0.5, 3], [0.34, 0.74, 4], [0.64, 0.55, 5]].map(([f, len, s]) => stream(f, len, s + 10, 6));
      const dl = flows.map((p) => `<path d="${spline(p)}"/>`).join('');
      const ends = flows.map((p) => { const e = p[p.length - 1]; return `<circle cx="${r(e[0])}" cy="${r(e[1])}" r="2.6"/>`; }).join('');
      // 发光不用高斯模糊（大片模糊栅格化要几百毫秒，滚到故事区时会卡一下）：用几层由宽到窄的半透明描边叠出来
      l2 += `<ellipse cx="${VX}" cy="${PEAK + 2}" rx="44" ry="15" fill="${HOT}" opacity=".3"/><ellipse cx="${VX}" cy="${PEAK + 2}" rx="34" ry="10" fill="${HOT}" opacity=".6"/>`;
      l2 += `<g fill="none" style="stroke:var(--c-acc)" stroke-linecap="round" stroke-linejoin="round"><g stroke-width="13" opacity=".14">${dl}</g><g stroke-width="8" opacity=".24">${dl}</g><g stroke-width="4.5" opacity=".4">${dl}</g></g>`;
      l2 += `<g fill="none" stroke="url(#${id.lava})" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${dl}</g>`;
      l2 += `<g fill="none" stroke="#fff2c2" stroke-width=".8" stroke-linecap="round" opacity=".7">${flows.map((p) => `<path d="${spline(p.slice(0, Math.max(3, Math.floor(p.length * 0.35))))}"/>`).join('')}</g>`;
      l2 += `<g style="fill:var(--c-acc)" opacity=".3">${ends.replace(/r="2\.6"/g, 'r="6"')}</g><g style="fill:var(--c-acc)" opacity=".75">${ends}</g>`;
      l2 += `<g style="fill:var(--c-acc)" opacity=".26">${plume.map(([x, y, rr]) => `<circle cx="${x}" cy="${r(y + rr * 0.34)}" r="${r(rr * 0.92)}"/>`).join('')}</g>`;
      l2 += `<g fill="url(#${id.puff})">${plume.map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}"/>`).join('')}</g>`;
      let embers = '';
      for (let k = 0; k < 34; k++) {
        const x = VX - 45 + R() * 110, y = 6 + R() * 60, c = R() < 0.6 ? HOT : 'var(--c-acc)';
        embers += `<circle class="pn-ember" cx="${r(x)}" cy="${r(y)}" r="${r(0.7 + R() * 1.4)}" style="fill:${c};opacity:${r(0.45 + R() * 0.5)};--e:${k}"/>`;
      }
      l2 += embers;
    } else {
      l2 += `<g fill="#9fb0cc" opacity=".35">${plume.map(([x, y, rr]) => `<circle cx="${x}" cy="${r(y + rr * 0.3)}" r="${rr}"/>`).join('')}</g>`;
      l2 += plume.map(([x, y, rr], i) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="url(#${i < ASH ? id.ash : id.puff})"/>`).join('');
      l2 += `<path d="${sparkle(VX - 42, 96, 3.2)} ${sparkle(VX + 44, 88, 2.4)}" fill="#ffffff"/>`;
    }

    /* ---------- pl-3：海 · 丘陵 · 远处尖塔 · 树 ---------- */
    const hillY = (x) => 204 + 9 * Math.sin(x * 0.0095 + 1.2) + 6 * Math.sin(x * 0.023 + 0.4) + 2.5 * Math.sin(x * 0.061) + 30 * smoothstep(790, 900, x) - 6 * gauss(x, 610, 70);
    const hill2Y = (x) => 217 + 7 * Math.sin(x * 0.013 + 2.2) + 4 * Math.sin(x * 0.031 + 1) + 1.5 * Math.sin(x * 0.09) + 26 * smoothstep(810, 895, x);
    let l3 = `<rect x="850" y="214" width="410" height="120" fill="url(#${id.sea})"/>`;
    l3 += `<path d="M850 214.4 H1260" stroke="${alt ? '#ffffff' : '#ff9a6a'}" stroke-width="1" opacity="${alt ? 0.9 : 0.3}"/>`;
    let waves = '';
    for (let i = 0; i < 30; i++) { const x = 870 + R() * 370, y = 219 + R() * 34, w = 6 + R() * 16; waves += `<path d="M${r(x)} ${r(y)} h${r(w)}"/>`; }
    l3 += alt
      ? `<g stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" opacity=".75">${waves}</g>`
      : `<g stroke="${HOT}" stroke-width="1" stroke-linecap="round" opacity=".28">${waves}</g>`;
    l3 += alt
      ? `<g transform="translate(-22 0)"><path d="M1062 219 L1090 219 L1085 224 L1067 224Z" fill="#6f7fa6"/><path d="M1076 218 V198" stroke="#6f7fa6" stroke-width="1"/><path d="M1077 199 L1077 217 L1089 217Z" fill="#ffffff"/><path d="M1075 202 L1075 217 L1066 217Z" fill="#f4f7fd"/></g>`
      : `<g transform="translate(-22 0)"><path d="M1062 219 L1090 219 L1085 224 L1067 224Z" fill="#0d0707"/><path d="M1076 218 V198" stroke="#0d0707" stroke-width="1"/><path d="M1077 199 L1077 217 L1089 217Z" fill="#2a1816"/><path d="M1075 202 L1075 217 L1066 217Z" fill="#231412"/><circle cx="1076" cy="197" r="1.3" fill="${HOT}"/></g>`;
    l3 += `<path d="${band(sample(-60, 930, 10, hillY))}" fill="url(#${id.hill})"/>`;
    const spire = (x, h, w) => { const y = hillY(x) + 4; return `<rect x="${r(x - w / 2)}" y="${r(y - h)}" width="${w}" height="${r(h)}"/><path d="M${P(x - w / 2 - 1, y - h)} L${P(x, y - h - h * 0.55)} L${P(x + w / 2 + 1, y - h)}Z"/>`; };
    l3 += `<g fill="${C.hill}">${spire(30, 34, 8)}${spire(120, 40, 9)}${spire(204, 30, 8)}${spire(266, 44, 10)}${spire(288, 26, 7)}${spire(356, 38, 9)}${spire(432, 50, 9)}${spire(500, 32, 8)}</g>`;
    l3 += `<path d="${band(sample(-60, 920, 10, hill2Y))}" fill="${C.hill2}"/>`;
    let trees = '';
    for (let i = 0; i < 30; i++) {
      const x = 560 + R() * 290, y = hill2Y(x) + 2, h = 7 + R() * 9;
      trees += R() < 0.65
        ? `<path d="M${P(x - h * 0.34, y)} L${P(x, y - h)} L${P(x + h * 0.34, y)}Z"/>`
        : `<circle cx="${r(x)}" cy="${r(y - h * 0.45)}" r="${r(h * 0.42)}"/><rect x="${r(x - 0.6)}" y="${r(y - h * 0.3)}" width="1.2" height="${r(h * 0.3)}"/>`;
    }
    l3 += `<g fill="${C.tree}">${trees}</g>`;
    if (alt) {
      let flock = '';
      [[650, 1], [665, 0.9], [680, 1.05], [728, 0.85]].forEach(([x, s]) => {
        const y = hill2Y(x) - 2.5 * s;
        flock += `<g transform="translate(${x} ${r(y)}) scale(${s})"><ellipse cx="0" cy="0" rx="4.4" ry="3.2" fill="#ffd3e2" stroke="#e7a0bb" stroke-width=".6"/><circle cx="-4.4" cy="-1" r="1.7" fill="#fff4f8" stroke="#e7a0bb" stroke-width=".5"/></g>`;
      });
      l3 += flock;
    } else {
      let lamps = '';
      for (let x = 600; x < 840; x += 20 + R() * 12) { const y = hill2Y(x) - 3; lamps += `<circle cx="${r(x)}" cy="${r(y)}" r="3.4" opacity=".18"/><circle cx="${r(x)}" cy="${r(y)}" r="1.1" opacity=".85"/>`; }
      l3 += `<g fill="${HOT}">${lamps}</g>`;
    }

    /* ---------- pl-4：大学城 + 海滩 + 灯塔 ---------- */
    const B = 229;
    let sil = '';
    const wins = [];
    const rect = (x, y, w, h) => `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}"/>`;
    const poly = (pts) => `<polygon points="${pts.map((p) => `${r(p[0])},${r(p[1])}`).join(' ')}"/>`;
    const winGrid = (x, w, top, bottom, gap = 11, ww = 3.2) => {
      const cols = Math.max(1, Math.floor((w - 4) / 8)), gx = (w - cols * ww) / (cols + 1);
      for (let y = top; y < bottom - 6; y += gap) for (let c = 0; c < cols; c++) wins.push([x + gx + c * (ww + gx), y, ww, 5.2]);
    };
    const finial = (x, y) => `${rect(x - 0.4, y - 6, 0.8, 6.4)}<circle cx="${r(x)}" cy="${r(y - 6.4)}" r="1.1"/>`;
    function house(x, w, h, roof, chim) {
      sil += rect(x, B - h, w, h + 6) + poly([[x - 2, B - h + 0.5], [x + w / 2, B - h - roof], [x + w + 2, B - h + 0.5]]);
      if (chim) sil += rect(x + w * 0.7, B - h - roof * 0.8, 3.2, roof * 0.6);
      winGrid(x, w, B - h + 6, B);
    }
    function gable(x, w, h, steps) {
      const st = w / (2 * steps + 1), sh = 5, left = [[x, B - h]];
      for (let i = 1; i <= steps; i++) { left.push([x + (i - 1) * st, B - h - i * sh]); left.push([x + i * st, B - h - i * sh]); }
      const right = left.map(([px, py]) => [2 * x + w - px, py]).reverse();
      sil += poly([[x, B + 6], ...left, ...right, [x + w, B + 6]]);
      sil += finial(x + w / 2, B - h - steps * sh);
      winGrid(x, w, B - h + 5, B);
      wins.push(['o', x + w / 2, B - h - steps * sh + 3.4, 1.6]);
    }
    function tower(x, w, h, spire, crenel) {
      sil += rect(x, B - h, w, h + 6);
      if (crenel) {
        for (let k = 0; k < 4; k++) sil += rect(x - 1 + k * ((w + 2) / 3.5), B - h - 4, (w + 2) / 7, 4.2);
        sil += rect(x - 1, B - h - 0.5, w + 2, 2.4);
      } else {
        sil += poly([[x - 1.4, B - h], [x + w / 2, B - h - spire], [x + w + 1.4, B - h]]);
        sil += poly([[x - 2, B - h], [x - 0.2, B - h - 9], [x + 1.6, B - h]]) + poly([[x + w - 1.6, B - h], [x + w + 0.2, B - h - 9], [x + w + 2, B - h]]);
        sil += finial(x + w / 2, B - h - spire);
      }
      for (let y = B - h + 8; y < B - 10; y += 15) wins.push([x + w / 2 - 1.6, y, 3.2, 7]);
    }
    function cathedral(x) {
      sil += rect(x + 16, B - 52, 54, 58) + poly([[x + 15, B - 51], [x + 43, B - 78], [x + 71, B - 51]]);
      [x, x + 70].forEach((tx) => {
        sil += rect(tx, B - 92, 16, 98) + poly([[tx - 1.5, B - 92], [tx + 8, B - 136], [tx + 17.5, B - 92]]);
        sil += poly([[tx - 2.4, B - 92], [tx - 0.4, B - 102], [tx + 1.6, B - 92]]) + poly([[tx + 14.4, B - 92], [tx + 16.4, B - 102], [tx + 18.4, B - 92]]);
        sil += finial(tx + 8, B - 136);
        for (let y = B - 84; y < B - 20; y += 16) wins.push([tx + 6.4, y, 3.2, 8]);
      });
      [x + 23, x + 63].forEach((px) => { sil += poly([[px - 2, B - 51], [px, B - 64], [px + 2, B - 51]]); });
      sil += finial(x + 43, B - 78);
      wins.push(['o', x + 43, B - 60, 6.4]);
      [x + 25, x + 34, x + 49, x + 58].forEach((wx) => wins.push([wx, B - 42, 3.6, 14]));
      wins.push([x + 39.5, B - 20, 7, 14]);
    }
    function clockTower(x) {
      sil += rect(x, B - 104, 20, 110) + poly([[x - 2, B - 104], [x + 10, B - 128], [x + 22, B - 104]]) + rect(x - 2, B - 106, 24, 3);
      sil += finial(x + 10, B - 128);
      wins.push(['clock', x + 10, B - 92, 5.6]);
      for (let y = B - 78; y < B - 12; y += 14) wins.push([x + 8.4, y, 3.2, 7]);
      return `<path d="M${P(x + 10, B - 134.4)} V${r(B - 146)}" stroke="${C.town}" stroke-width="1"/><path d="M${P(x + 10.5, B - 146)} l9 2.6 l-9 2.8Z" style="fill:var(--c-acc)"/>`;
    }
    function domeHall(x, w, h) {
      const cx = x + w / 2;
      sil += rect(x, B - h, w, h + 6) + rect(x - 2, B - h - 2, w + 4, 3) + rect(cx - 15, B - h - 8, 30, 8);
      sil += `<path d="M${P(cx - 15, B - h - 8)} A15 15 0 0 1 ${P(cx + 15, B - h - 8)}Z"/>`;
      sil += finial(cx, B - h - 23);
      wins.push(['slit', cx - 1.6, B - h - 21, 3.2, 12]);
      for (let k = 0; k < 6; k++) wins.push([x + 5 + k * ((w - 12) / 5), B - h + 8, 3.4, 12]);
      for (let k = 0; k < 6; k++) wins.push([x + 5 + k * ((w - 12) / 5), B - h + 26, 3.4, 8]);
    }
    /* 城镇整体右移 TX：地标落在常见裁切窗口内，左侧补一片郊外小屋 */
    const TX = 170;
    house(-236, 22, 20, 9, false); house(-212, 24, 26, 11, true);
    tower(-186, 12, 50, 22);
    house(-172, 26, 28, 12, false);
    gable(-144, 22, 32, 2);
    house(-120, 24, 22, 10, true); house(-94, 16, 18, 8, false);
    house(-60, 22, 30, 12, true); house(-38, 26, 36, 14, true);
    tower(-12, 14, 72, 30);
    gable(4, 30, 42, 3);
    house(36, 22, 34, 13, false);
    cathedral(60);
    house(148, 18, 40, 12, true);
    const flag = clockTower(168);
    gable(192, 26, 48, 2);
    domeHall(222, 60, 46);
    tower(287, 12, 80, 28);
    house(302, 28, 34, 14, true);
    tower(332, 14, 52, 0, true);
    gable(348, 22, 30, 2);
    house(372, 24, 24, 11, false);
    house(398, 20, 16, 9, false);
    const moundPts = sample(-60, 450 + TX, 10, (x) => 226 + 3 * Math.sin(x * 0.02) + 22 * smoothstep(380 + TX, 450 + TX, x));
    let winSvg = '';
    const lit = (o) => (alt ? `fill="#eef3fb" opacity="${r(0.55 + o * 0.4)}"` : `style="fill:${o > 0.8 ? 'var(--c-acc)' : HOT};opacity:${r(0.4 + o * 0.6)}"`);
    wins.forEach((wd) => {
      const o = R();
      if (!alt && o < 0.22) return;
      if (wd[0] === 'o') winSvg += `<circle cx="${r(wd[1])}" cy="${r(wd[2])}" r="${wd[3]}" ${lit(0.95)}/>`;
      else if (wd[0] === 'clock') winSvg += `<circle cx="${r(wd[1])}" cy="${r(wd[2])}" r="${wd[3]}" ${alt ? 'fill="#f7f9fd"' : `fill="${HOT}" opacity=".9"`}/><path d="M${P(wd[1], wd[2])} v-3.8 M${P(wd[1], wd[2])} h2.8" stroke="${C.town}" stroke-width=".9" stroke-linecap="round"/>`;
      else if (wd[0] === 'slit') winSvg += `<rect x="${r(wd[1])}" y="${r(wd[2])}" width="${wd[3]}" height="${wd[4]}" ${lit(0.9)}/>`;
      else { const [x, y, w, h] = wd; winSvg += `<path d="M${P(x, y + h)} V${r(y + 1.4)} Q${P(x + w / 2, y - 1.2)} ${P(x + w, y + 1.4)} V${r(y + h)}Z" ${lit(o)}/>`; }
    });
    let l4 = alt ? '' : `<ellipse cx="${190 + TX}" cy="200" rx="300" ry="60" fill="url(#${id.lamp})" opacity=".55"/>`;
    l4 += `<g fill="${C.town}"><g transform="translate(${TX} 0)">${sil}</g><path d="${band(moundPts)}"/></g><g transform="translate(${TX} 0)">${flag}${winSvg}</g>`;
    const beachY = (x) => 244 - 9 * smoothstep(900, 990, x) + 1.6 * Math.sin(x * 0.05);
    const beachPts = sample(890, 1260, 8, beachY);
    beachPts.unshift([872, 262]);
    l4 += `<path d="${band(beachPts)}" fill="${C.sand}"/>`;
    l4 += `<path d="${spline(sample(904, 1260, 8, (x) => beachY(x) - 1.2))}" fill="none" ${alt ? 'stroke="#ffffff" opacity=".95"' : `stroke="${HOT}" opacity=".35"`} stroke-width="1.6" stroke-linecap="round"/>`;
    const lx = 962, lb = 236, lt = 196;
    const xl = (y) => lx - 7 + ((lb - y) / (lb - lt)) * 3, xr = (y) => lx + 7 - ((lb - y) / (lb - lt)) * 3;
    l4 += `<path d="M${lx - 24} ${lb + 4} Q${lx - 20} ${lb - 7} ${lx - 10} ${lb - 4} Q${lx} ${lb - 9} ${lx + 12} ${lb - 3} Q${lx + 22} ${lb - 6} ${lx + 26} ${lb + 4}Z" fill="${C.rock}"/>`;
    if (!alt) l4 += `<path d="M${lx} ${lt - 8} L${lx + 150} ${lt - 30} L${lx + 150} ${lt + 8}Z" fill="url(#${id.beam})"/>`;
    l4 += `<path d="M${P(xl(lb), lb)} L${P(xl(lt), lt)} L${P(xr(lt), lt)} L${P(xr(lb), lb)}Z" fill="${alt ? '#fbfbff' : C.town}"/>`;
    if (alt) l4 += [[202, 210], [218, 226]].map(([y1, y2]) => `<path d="M${P(xl(y1), y1)} L${P(xr(y1), y1)} L${P(xr(y2), y2)} L${P(xl(y2), y2)}Z" style="fill:var(--c-acc)"/>`).join('');
    l4 += `<rect x="${lx - 8}" y="${lt - 3}" width="16" height="3" fill="${alt ? '#6f7fa6' : C.town}"/>`;
    l4 += `<rect x="${lx - 4.6}" y="${lt - 12}" width="9.2" height="9" ${alt ? 'fill="#fff6c9" stroke="#6f7fa6" stroke-width="1"' : `fill="${HOT}"`}/>`;
    l4 += `<path d="M${lx - 6} ${lt - 12} Q${lx} ${lt - 21} ${lx + 6} ${lt - 12}Z" ${alt ? 'style="fill:var(--c-acc)"' : `fill="${C.town}"`}/>`;
    if (!alt) l4 += `<circle cx="${lx}" cy="${lt - 7.5}" r="14" fill="url(#${id.lamp})"/>`;

    /* ---------- pl-5：近景草坡、路灯、栅栏、路牌 ---------- */
    const fgY = (x) => 242 + 3.5 * Math.sin(x * 0.021 + 0.3) + 2.2 * Math.sin(x * 0.057 + 1) + 1.2 * Math.sin(x * 0.13) + 30 * smoothstep(830, 905, x);
    let l5 = `<path d="${band(sample(-60, 940, 10, fgY))}"/>`;
    let tufts = '';
    for (let x = -40; x < 880; x += 18 + R() * 26) {
      const y = fgY(x) + 1.5, s = 0.7 + R() * 0.8;
      tufts += `<path d="M${P(x - 4 * s, y)} Q${P(x - 3 * s, y - 5 * s)} ${P(x - 5 * s, y - 8 * s)} Q${P(x - 1 * s, y - 4 * s)} ${P(x, y - 9 * s)} Q${P(x + 1 * s, y - 4 * s)} ${P(x + 4.5 * s, y - 7 * s)} Q${P(x + 2.5 * s, y - 3 * s)} ${P(x + 4 * s, y)}Z"/>`;
    }
    l5 += tufts;
    const lpx = 612, ly = fgY(lpx + 1);
    l5 += `<rect x="${lpx - 1}" y="${r(ly - 48)}" width="2.4" height="50"/><path d="M${P(lpx - 4, ly)} h8.4 l-1.6 -5 h-5.2Z"/><path d="M${P(lpx - 4.4, ly - 48)} h9.2 l-1.6 -4 l-3 -3.4 l-3 3.4Z"/><rect x="${lpx - 2.8}" y="${r(ly - 58)}" width="6" height="1.6"/>`;
    const lampLit = alt ? `<rect x="${lpx - 2.4}" y="${r(ly - 56.2)}" width="5.2" height="7" fill="#fff8dc" opacity=".9"/>` : `<circle cx="${lpx + 0.2}" cy="${r(ly - 52)}" r="16" fill="url(#${id.lamp})"/><rect x="${lpx - 2.4}" y="${r(ly - 56.2)}" width="5.2" height="7" fill="${HOT}"/>`;
    let fence = '';
    const fx0 = 650, fx1 = 770;
    const topPts = [];
    for (let x = fx0; x <= fx1; x += 15) { const y = fgY(x); fence += `<rect x="${r(x - 1.1)}" y="${r(y - 13)}" width="2.2" height="15"/>`; topPts.push([x, y]); }
    fence += `<path d="${topPts.map((p, i) => `${i ? 'L' : 'M'}${P(p[0], p[1] - 10)}`).join(' ')} M${topPts.map((p, i) => `${i ? 'L' : ''}${P(p[0], p[1] - 5)}`).join(' ')}" fill="none" stroke="${C.fg}" stroke-width="1.4"/>`;
    l5 += fence;
    const spx = 796, sy = fgY(spx + 1);
    l5 += `<rect x="${spx - 1}" y="${r(sy - 30)}" width="2.6" height="32"/><path d="M${P(spx + 1, sy - 28)} h16 l4 3.2 l-4 3.2 h-16Z M${P(spx - 1, sy - 19)} h-14 l-3.6 3 l3.6 3 h14Z"/>`;
    let rocks = '';
    [[120, 5], [560, 4], [720, 6], [822, 5]].forEach(([x, s]) => { const y = fgY(x); rocks += `<path d="M${P(x - s * 2, y + 1)} Q${P(x - s * 1.6, y - s * 1.3)} ${P(x, y - s * 1.4)} Q${P(x + s * 1.8, y - s * 1.2)} ${P(x + s * 2.2, y + 1)}Z"/>`; });
    l5 += rocks;

    const fgFill = `fill="${C.fg}"`;
    const defs = `<defs>
      <linearGradient id="${id.sky}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="260">${alt
        ? `${stop(0, '#b7d4f1')}${stop(0.45, '#d4e6f8')}${stop(0.75, '#edf2f8')}${stop(1, '#fbefe3')}`
        : `${stop(0, '#070409')}${stop(0.45, '#12070a')}${stop(0.72, '#260c0b')}${stop(0.86, '#3e140d')}${stop(1, '#1e0b09')}`}</linearGradient>
      <linearGradient id="${id.horizon}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="260">${vstop(0, '--c-acc', 0)}${vstop(0.55, '--c-acc', 0.04)}${vstop(0.8, '--c-acc', 0.2)}${stop(0.9, HOT, 0.22)}${vstop(1, '--c-acc', 0.06)}</linearGradient>
      ${glowGrad(id.halo, '--c-acc', 0.32)}
      <radialGradient id="${id.sun}">${stop(0, '#fffbe6', 0.95)}${stop(0.25, '#fff4d2', 0.6)}${stop(1, '#fff4d2', 0)}</radialGradient>
      <linearGradient id="${id.cloud}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#ffffff')}${stop(1, '#dde8f6')}</linearGradient>
      <linearGradient id="${id.vol}" gradientUnits="userSpaceOnUse" x1="0" y1="${PEAK}" x2="0" y2="${VB}">${stop(0, C.vol0)}${stop(1, C.vol1)}</linearGradient>
      <linearGradient id="${id.hill}" x1="0" y1="0" x2="1" y2="0">${stop(0, C.hill)}${stop(0.6, C.hill)}${stop(1, alt ? '#c3d6e4' : '#1a0d0c')}</linearGradient>
      <linearGradient id="${id.lava}" gradientUnits="userSpaceOnUse" x1="0" y1="${PEAK}" x2="0" y2="${VB}">${stop(0, '#ffe08a')}${stop(0.18, HOT)}${vstop(0.5, '--c-acc')}${vstop(1, '--c-acc3', 0.55)}</linearGradient>
      <radialGradient id="${id.puff}" cx=".4" cy=".35" r=".7">${alt ? `${stop(0, '#ffffff')}${stop(0.6, '#f1f6fc')}${stop(1, '#d3e0f1')}` : `${stop(0, '#4a302c')}${stop(0.6, '#2c1c1b')}${stop(1, '#1d1212')}`}</radialGradient>
      <radialGradient id="${id.ash}" cx=".4" cy=".35" r=".7">${stop(0, '#eef0f5')}${stop(1, '#b9c1d0')}</radialGradient>
      <linearGradient id="${id.sea}" x1="0" y1="0" x2="0" y2="1">${stop(0, C.sea0)}${stop(1, C.sea1)}</linearGradient>
      <linearGradient id="${id.snow}" gradientUnits="userSpaceOnUse" x1="${VX - 110}" y1="0" x2="${VX + 110}" y2="0">${stop(0, '#ffffff')}${stop(0.5, '#fbfdff')}${stop(1, '#d6e1f2')}</linearGradient>
      <linearGradient id="${id.beam}" gradientUnits="userSpaceOnUse" x1="${lx}" y1="0" x2="${lx + 150}" y2="0">${stop(0, HOT, 0.5)}${stop(1, HOT, 0)}</linearGradient>
      <radialGradient id="${id.lamp}">${stop(0, HOT, 0.45)}${stop(1, HOT, 0)}</radialGradient>
      <linearGradient id="${id.fade}" x1="0" y1="0" x2="0" y2="1">${vstop(0, '--c-bg', 0)}${vstop(1, '--c-bg', 1)}</linearGradient>
    </defs>`;
    const body = `${defs}
    <g class="pn-sky">${sky}</g>
    <g class="pl pl-1">${l1}</g>
    <g class="pl pl-2">${l2}</g>
    <g class="pl pl-3">${l3}</g>
    <g class="pl pl-4">${l4}</g>
    <g class="pl pl-5" ${fgFill}>${l5}${lampLit}</g>
    <rect class="pn-fade" x="-60" y="226" width="1320" height="40" fill="url(#${id.fade})"/>`;
    return svg('0 0 1200 260', `scn-panorama pn-${alt ? 'alter' : 'base'}`, body, ' preserveAspectRatio="xMidYMax slice"');
  }

  /* ====================================================================
   * 6. 熔岩巧克力蛋糕
   * ==================================================================== */
  function lavaCake() {
    const id = { plate: nid('kp'), cake: nid('kc'), molten: nid('km'), flame: nid('kf'), fglow: nid('kg'), pool: nid('kpg'), clip: nid('kcl'), leaf: nid('kl') };
    const ink = '#3b221b';
    const R = rng(21);
    let sugar = '';
    for (let i = 0; i < 26; i++) {
      const a = R() * TAU, d = Math.sqrt(R());
      sugar += `<circle cx="${r(58 + Math.cos(a) * 22 * d)}" cy="${r(60 + Math.sin(a) * 5.2 * d)}" r="${r(0.35 + R() * 0.55)}"/>`;
    }
    const poolPts = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU, w = 1 + 0.12 * Math.sin(i * 2.7) + (Math.sin(a) > 0.3 ? 0.1 : 0);
      poolPts.push([60 + Math.cos(a) * 27 * w, 92.4 + Math.sin(a) * 6.6 * w]);
    }
    const lava = `<path d="${splineClosed(poolPts)}"/>` +
      `<path d="M48.2 63.4 C51.6 67.4 64.4 67.4 67.8 63.4 C69 70 66.6 74.4 66.4 80 C66.2 84 68.6 86.6 70.6 90 L45.4 90 C47.4 86.6 49.8 84 49.6 80 C49.4 74 47.2 70 48.2 63.4Z"/>` +
      `<path d="M39.6 68 C41.6 72 42.2 76 41.4 79 C40.8 81.2 38.4 81.2 38.4 78.6 C38.4 75 39 72 39.6 68Z"/>` +
      `<path d="M75 69.4 C76.2 72 76.4 74.4 75.8 76.2 C75.3 77.6 73.6 77.6 73.6 75.8 C73.6 73.8 74.2 71.6 75 69.4Z"/>`;
    const berry = [[22, 90], [25, 88], [25.2, 91.6], [28, 89.4], [22.4, 93.4], [27.6, 93], [19.6, 91.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3"/>`).join('');
    const body = `<defs>
      <linearGradient id="${id.plate}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#ffffff')}${stop(1, '#ddd6cf')}</linearGradient>
      <linearGradient id="${id.cake}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#2e120b')}${stop(0.3, '#6b3120')}${stop(0.7, '#4a2014')}${stop(1, '#26100a')}</linearGradient>
      <linearGradient id="${id.molten}" gradientUnits="userSpaceOnUse" x1="0" y1="62" x2="0" y2="101">${stop(0, '#ffc15a')}${stop(0.45, '#ff6a26')}${stop(0.8, '#b8321a')}${stop(1, '#6a220f')}</linearGradient>
      <linearGradient id="${id.flame}" x1="0" y1="1" x2="0" y2="0">${stop(0, '#ffd36b')}${stop(1, '#ff5b1f')}</linearGradient>
      <radialGradient id="${id.fglow}">${stop(0, '#ffc766', 0.55)}${stop(1, '#ffc766', 0)}</radialGradient>
      <radialGradient id="${id.pool}">${stop(0, '#ff6a26', 0.45)}${stop(1, '#ff6a26', 0)}</radialGradient>
      <linearGradient id="${id.leaf}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#a8e0b2')}${stop(1, '#4f9468')}</linearGradient>
      <clipPath id="${id.clip}"><rect x="65.5" y="36" width="5" height="24" rx="1.6"/></clipPath>
    </defs>
    <ellipse cx="60" cy="109" rx="46" ry="4" fill="#000" opacity=".22"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="60" cy="94" rx="50" ry="13.5" fill="url(#${id.plate})" stroke="${ink}" stroke-width="1.6"/>
      <ellipse cx="60" cy="92.6" rx="38" ry="9.2" fill="#f3eee8" stroke="#c9bfb4" stroke-width=".8"/>
      <ellipse cx="60" cy="94" rx="45" ry="12" fill="none" style="stroke:var(--c-acc2)" stroke-width=".9" stroke-dasharray="2 3" opacity=".7"/>
      <ellipse cx="64" cy="96" rx="30" ry="8" fill="url(#${id.pool})"/>
      <path d="M33 60 C33 55 83 55 83 60 L81 86 C80 91.4 36 91.4 35 86 Z" fill="url(#${id.cake})" stroke="${ink}" stroke-width="1.6"/>
      <path d="M36 70 Q40 72 44 70 M72 74 Q76 76 80 73 M38 80 Q41 81.6 44 80" fill="none" stroke="#1d0906" stroke-width=".8" opacity=".6"/>
      <ellipse cx="58" cy="60" rx="25" ry="6.2" fill="#7a3a24" stroke="${ink}" stroke-width="1.4"/>
      <path d="M44 59 l5 1.4 l3 -1.6 M64 61 l4 -1 l3 1.4" fill="none" stroke="#4a1e12" stroke-width=".8"/>
      <ellipse cx="56" cy="59.4" rx="17" ry="3.6" fill="#ffffff" opacity=".22"/>
      <g fill="#ffffff" opacity=".9">${sugar}</g>
      <g stroke="#2a0f08" stroke-width="2.8" fill="#2a0f08">${lava}</g>
      <g fill="url(#${id.molten})">${lava}</g>
      <path d="M49 63.6 C53 61.2 63 61.2 67 63.6" fill="none" stroke="#3a150b" stroke-width="1.6"/>
      <path d="M52 67.8 Q54 71 53.4 78" fill="none" stroke="#fff5d6" stroke-width="1.3" opacity=".85"/>
      <path d="M40 94.6 Q52 99 70 98.4" fill="none" stroke="#fff5d6" stroke-width="1" opacity=".55"/>
      <circle cx="63.6" cy="70" r="1" fill="#fff5d6" opacity=".8"/><circle cx="78" cy="94.6" r=".8" fill="#fff5d6" opacity=".7"/><circle cx="41.2" cy="77" r=".6" fill="#fff5d6" opacity=".7"/>
      <path d="M22 84 C18 78 22 74 28 76 C30 80 27 84 22 84Z M29 84 C30 78 35 76 38 80 C36 84 33 85 29 84Z" fill="url(#${id.leaf})" stroke="#2f6a45" stroke-width=".9"/>
      <g fill="#d8385a" stroke="#7a1430" stroke-width=".6">${berry}</g>
      <g fill="#fff" opacity=".7"><circle cx="21.4" cy="89.2" r=".6"/><circle cx="24.4" cy="87.2" r=".6"/><circle cx="27.4" cy="88.6" r=".6"/></g>
      <circle cx="68" cy="28" r="14" fill="url(#${id.fglow})"/>
      <rect x="65.5" y="36" width="5" height="24" rx="1.6" fill="#fffaf2"/>
      <g clip-path="url(#${id.clip})" style="stroke:var(--c-acc)" stroke-width="1.8" fill="none"><path d="M64 42 L72 36 M64 48 L72 42 M64 54 L72 48 M64 60 L72 54"/></g>
      <rect x="65.5" y="36" width="5" height="24" rx="1.6" fill="none" stroke="${ink}" stroke-width="1.2"/>
      <path d="M65.6 37.4 Q66.4 41 67.2 38 Q68 36.6 69 37" fill="#fffaf2" stroke="${ink}" stroke-width=".7"/>
      <path d="M68 36 L68 32.6" stroke="#2b1a12" stroke-width="1.1"/>
      <path d="M68 19.6 C72.2 24.6 73.4 29 71.6 31.6 C70.4 33.4 65.6 33.4 64.4 31.6 C62.8 29 64.2 24.8 68 19.6Z" fill="url(#${id.flame})"/>
      <path d="M68 25.4 C69.6 28 70 30 69.2 31.2 C68.6 32 67.4 32 66.8 31.2 C66 30 66.4 28 68 25.4Z" fill="#fff6d6"/>
      <g fill="none" style="stroke:var(--c-muted)" stroke-width="1.1" opacity=".55"><path d="M42 50 q-2 -3 0 -6 q2 -3 0 -6"/><path d="M50 46 q-2 -3 0 -6 q2 -3 0 -6"/></g>
    </g>
    <g style="fill:var(--c-acc2)"><circle cx="76" cy="14" r="1.1" opacity=".8"/><circle cx="61" cy="10" r=".8" opacity=".6"/><circle cx="82" cy="24" r=".7" opacity=".7"/></g>
    <path d="${sparkle(96, 40, 3.2)} ${sparkle(20, 56, 2.4)}" style="fill:var(--c-acc2)" opacity=".85"/>`;
    return svg('0 0 120 120', 'scn-cake', body);
  }

  /* ====================================================================
   * 7. 黑曜石胸针
   * ==================================================================== */
  function brooch() {
    const id = { silv: nid('bs'), bead: nid('bb'), table: nid('bt'), ref: nid('br'), clip: nid('bc'), drop: nid('bd') };
    const cx = 60, cy = 54;
    const ring = (rx, ry, n, bx, by) => {
      let d = '';
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU, p = [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
        if (i === 0) d += `M${P(p[0], p[1])}`;
        else { const am = a - Math.PI / n; d += ` Q${P(cx + (rx + bx) * Math.cos(am), cy + (ry + by) * Math.sin(am))} ${P(p[0], p[1])}`; }
      }
      return d + 'Z';
    };
    let beads = '';
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; beads += `<circle cx="${r(cx + 32.4 * Math.cos(a))}" cy="${r(cy + 37.4 * Math.sin(a))}" r="1.75"/>`; }
    const T = [], G = [];
    for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + ((i + 0.5) * TAU) / 8; T.push([cx + 11.5 * Math.cos(a), cy + 14 * Math.sin(a)]); }
    for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + (i * TAU) / 16; G.push([cx + 25 * Math.cos(a), cy + 30 * Math.sin(a)]); }
    const L = -2.36;
    const shade = (pts, tier, jit) => {
      const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length - cx, my = pts.reduce((s, p) => s + p[1], 0) / pts.length - cy;
      const th = Math.atan2(my / 1.2, mx);
      let b = 0.5 + 0.5 * Math.cos(th - L);
      b = Math.min(1, Math.max(0, Math.pow(b, 1.7) * tier + jit));
      const c0 = [7, 6, 11], c1 = [104, 98, 132];
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * b));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    };
    const R = rng(5);
    let facets = '';
    const tri = (pts, tier) => { facets += `<polygon points="${pts.map((p) => `${r(p[0])},${r(p[1])}`).join(' ')}" fill="${shade(pts, tier, (R() - 0.5) * 0.12)}"/>`; };
    for (let i = 0; i < 8; i++) {
      const t0 = T[i], t1 = T[(i + 1) % 8], g1 = G[(2 * i + 1) % 16], g2 = G[(2 * i + 2) % 16], g3 = G[(2 * i + 3) % 16];
      tri([t0, g1, g2], 0.95);
      tri([t0, g2, t1], 0.7);
      tri([t1, g2, g3], 0.9);
    }
    let edges = '';
    for (let i = 0; i < 8; i++) { const g = G[(2 * i + 1) % 16]; edges += `M${P(T[i][0], T[i][1])} L${P(g[0], g[1])} `; }
    let prongs = '';
    [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4].forEach((a) => {
      const x = cx + 25.4 * Math.cos(a), y = cy + 30.4 * Math.sin(a), deg = r((Math.atan2(30.4 * Math.sin(a), 25.4 * Math.cos(a)) * 180) / Math.PI + 90);
      prongs += `<ellipse cx="${r(x)}" cy="${r(y)}" rx="3" ry="4.2" transform="rotate(${deg} ${r(x)} ${r(y)})"/>`;
    });
    const hornL = 'M33 24 C19 16 5 28 7.4 44 C9.4 55.6 21.4 55.6 21.4 47.6 C21.4 41.6 14.4 41.6 14.8 46.6';
    const hornR = 'M87 24 C101 16 115 28 112.6 44 C110.6 55.6 98.6 55.6 98.6 47.6 C98.6 41.6 105.6 41.6 105.2 46.6';
    const body = `<defs>
      <linearGradient id="${id.silv}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#ffffff')}${stop(0.35, '#e3e7ee')}${stop(0.7, '#a9b0bc')}${stop(1, '#7d8592')}</linearGradient>
      <radialGradient id="${id.bead}" cx=".35" cy=".3" r=".75">${stop(0, '#ffffff')}${stop(1, '#8e96a3')}</radialGradient>
      <linearGradient id="${id.table}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#3a3748')}${stop(0.55, '#15141c')}${stop(1, '#07070b')}</linearGradient>
      <radialGradient id="${id.ref}" cx=".5" cy=".5" r=".5">${vstop(0, '--c-acc', 0.55)}${vstop(1, '--c-acc', 0)}</radialGradient>
      <clipPath id="${id.clip}"><ellipse cx="${cx}" cy="${cy}" rx="25" ry="30"/></clipPath>
      <linearGradient id="${id.drop}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#4a4660')}${stop(0.5, '#101016')}${stop(1, '#050507')}</linearGradient>
    </defs>
    <ellipse cx="60" cy="116" rx="30" ry="2.6" fill="#000" opacity=".2"/>
    <g fill="none" stroke-linecap="round">
      <path d="${hornL}" stroke="#3f444f" stroke-width="5.2"/><path d="${hornL}" stroke="url(#${id.silv})" stroke-width="3.2"/>
      <path d="${hornR}" stroke="#3f444f" stroke-width="5.2"/><path d="${hornR}" stroke="url(#${id.silv})" stroke-width="3.2"/>
      <path d="M11 34 q3 -6 9 -8 M109 34 q-3 -6 -9 -8" stroke="#fff" stroke-width="1" opacity=".8"/>
    </g>
    <path d="M60 99 V104" stroke="#5a606c" stroke-width="1.4"/>
    <circle cx="60" cy="102.6" r="2.4" fill="none" stroke="#6b7280" stroke-width="1.3"/>
    <path d="M60 104.8 C63.6 108.8 66 111.2 66 113.4 A6 6 0 0 1 54 113.4 C54 111.2 56.4 108.8 60 104.8Z" fill="url(#${id.drop})" stroke="#2a2d35" stroke-width="1"/>
    <path d="M57 111 Q57.6 108.8 59.4 107.4" fill="none" stroke="#fff" stroke-width=".8" opacity=".7"/>
    <ellipse cx="61.6" cy="115.4" rx="2.6" ry="1.1" style="fill:var(--c-acc)" opacity=".55"/>
    <path d="${ring(35.5, 40.5, 28, 4.2, 4.8)}" fill="url(#${id.silv})" stroke="#474c58" stroke-width="1.5" stroke-linejoin="round"/>
    <ellipse cx="${cx}" cy="${cy}" rx="30.4" ry="35.4" fill="none" stroke="#6e7582" stroke-width=".8" opacity=".7"/>
    <g fill="url(#${id.bead})" stroke="#555b66" stroke-width=".5">${beads}</g>
    <ellipse cx="${cx}" cy="${cy}" rx="28" ry="33" fill="#5f6672" stroke="#373b45" stroke-width="1.2"/>
    <g stroke="#000" stroke-opacity=".45" stroke-width=".5" stroke-linejoin="round">${facets}</g>
    <polygon points="${T.map((p) => `${r(p[0])},${r(p[1])}`).join(' ')}" fill="url(#${id.table})" stroke="#000" stroke-opacity=".5" stroke-width=".5"/>
    <g clip-path="url(#${id.clip})"><ellipse cx="${cx + 3}" cy="${cy + 22}" rx="22" ry="12" fill="url(#${id.ref})"/></g>
    <path d="${edges}" fill="none" stroke="#c9c3ea" stroke-width=".5" opacity=".35"/>
    <ellipse cx="${cx}" cy="${cy}" rx="25" ry="30" fill="none" stroke="#1a1c22" stroke-width="1.1"/>
    <g fill="url(#${id.silv})" stroke="#474c58" stroke-width=".9">${prongs}</g>
    <path d="M41.5 50 Q42.5 37 52 30" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>
    <path d="${sparkle(49, 37, 4.6)}" fill="#ffffff"/>
    <circle cx="54.4" cy="32.6" r=".9" fill="#fff" opacity=".85"/>
    <path d="${sparkle(96, 16, 3.2)} ${sparkle(20, 88, 2.6)} ${sparkle(102, 84, 2.2)}" style="fill:var(--c-acc2)" opacity=".85"/>`;
    return svg('0 0 120 120', 'scn-brooch', body);
  }

  /* ====================================================================
   * 8. 小羊游行（7 只，面朝左依次前进）
   * ==================================================================== */
  function sheepParade(form) {
    const alt = form === 'alter';
    const C = alt ? PAL.pink : PAL.black;
    const ids = { wool: nid('sw'), face: nid('sf'), horn: nid('sh'), glow: alt ? '' : nid('sg') };
    const bob = [0, -4, -1.5, -5, -2, -4.5, -1];
    const sc = [1.24, 1.18, 1.28, 1.16, 1.24, 1.2, 1.02];
    let shadows = '', flock = '';
    for (let i = 0; i < 7; i++) {
      const x = 48 + i * 82, y = 82 + bob[i];
      shadows += `<ellipse cx="${x + 6}" cy="83" rx="${r(20 * sc[i])}" ry="2.8"/>`;
      const opt = { phase: i % 2, eyes: i === 2 || i === 5 ? 'happy' : 'open', heat: !alt && (i === 2 || i === 5), bell: i === 3, bow: i === 6 || (alt && i === 1) };
      flock += `<g class="sp-sheep" style="--i:${i}"><g transform="translate(${x} ${r(y)}) scale(${sc[i]})">${sheepFig(ids, C, opt)}</g></g>`;
    }
    const deco = alt
      ? `<path d="${sparkle(92, 16, 3.4)} ${sparkle(258, 10, 2.6)} ${sparkle(420, 18, 3.2)} ${sparkle(548, 12, 2.4)}" style="fill:var(--c-acc3)" opacity=".8"/><g fill="#ffc8da" opacity=".6"><circle cx="176" cy="20" r="2"/><circle cx="340" cy="14" r="1.6"/><circle cx="500" cy="24" r="1.8"/></g>`
      : `<g style="fill:var(--c-acc2)"><circle cx="210" cy="16" r="1.3" opacity=".8"/><circle cx="222" cy="8" r=".9" opacity=".6"/><circle cx="458" cy="14" r="1.2" opacity=".8"/><circle cx="470" cy="6" r=".8" opacity=".6"/></g><path d="${sparkle(92, 14, 3)} ${sparkle(560, 16, 2.6)}" style="fill:var(--c-acc)" opacity=".7"/>`;
    const body = `<defs>${sheepDefs(ids, C)}</defs>
    <g fill="${alt ? '#6b6884' : '#000'}" opacity="${alt ? 0.16 : 0.3}">${shadows}</g>
    ${deco}
    ${flock}`;
    return svg('0 0 600 90', `scn-parade sp-${alt ? 'alter' : 'base'}`, body);
  }

  /* 每张插画自带一小段作用域样式（类名带计数器），减少动态效果时整体关掉 */
  const anim = (uc, css) => `<style>${css}@media (prefers-reduced-motion:reduce){.${uc} *{animation:none!important}}</style>`;
  const fillOf = (c) => (c.startsWith('var') ? `style="fill:${c}"` : `fill="${c}"`);
  const pts = (arr) => arr.map(([x, y]) => `${r(x)},${r(y)}`).join(' ');
  /* 蜡封上的火苗（与“错过的声音”那封信同一个印章） */
  const flameD = (s, cx, cy) => {
    const q = (x, y) => P(cx + x * s, cy + y * s);
    return `M${q(0, -16)} C${q(4.5, -10)} ${q(11, -6)} ${q(11, 3)} C${q(11, 10)} ${q(6, 14)} ${q(0, 14)} C${q(-6, 14)} ${q(-11, 10)} ${q(-11, 3)} C${q(-11, -3)} ${q(-7.5, -6)} ${q(-5.5, -11)} C${q(-3.4, -7.4)} ${q(-2.2, -5.6)} ${q(-1, -4.6)} C${q(0.2, -8)} ${q(1, -12)} ${q(0, -16)}Z`;
  };

  /* ====================================================================
   * 9. 学者之家 —— 书堆上打盹的小黑羊、自己翻页的书、一盏台灯
   * ==================================================================== */
  function study() {
    const uc = nid('stu');
    const id = { wool: nid('sw'), face: nid('sf'), horn: nid('sh'), glow: nid('sg'), cone: nid('sc'), page: nid('sp'), page2: nid('sp2'), pool: nid('spl') };
    const ink = '#3a2620';
    const ids = { wool: id.wool, face: id.face, horn: id.horn, glow: id.glow };
    const book = (x, y, w, h, c, rot = 0) =>
      `<g transform="rotate(${rot} ${r(x + w / 2)} ${r(y + h / 2)})">` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.8" ${fillOf(c)} stroke="${ink}" stroke-width="1.4"/>` +
      `<path d="M${x + 5} ${y + 1.4} V${y + h - 1.4} M${x + 8} ${y + 1.4} V${y + h - 1.4} M${x + w - 5} ${y + 1.4} V${y + h - 1.4} M${x + w - 8} ${y + 1.4} V${y + h - 1.4}" stroke="#f1d58a" stroke-width="1" opacity=".75"/>` +
      `<rect x="${r(x + w / 2 - 13)}" y="${r(y + 2.6)}" width="26" height="${r(h - 5.2)}" rx=".8" fill="#fbf1dc" opacity=".9"/>` +
      `<path d="M${r(x + w / 2 - 9)} ${r(y + h / 2)} h18" stroke="${ink}" stroke-width=".8" opacity=".45"/>` +
      `<path d="M${x + 2.5} ${y + 2} H${x + w - 2.5}" stroke="#fff" stroke-width=".8" opacity=".22"/></g>`;
    const pageL = 'M146 136 C134 131.5 118 131.5 104 135 L104 111 C118 107.5 134 107.5 146 112 Z';
    const pageR = 'M146 136 C158 131.5 174 131.5 188 135 L188 111 C174 107.5 158 107.5 146 112 Z';
    let lines = '';
    [[108, 116, 32], [108, 121, 34], [108, 126, 26], [150, 116, 34], [150, 121, 30], [150, 126, 34], [150, 131, 22]].forEach(([x, y, w], i) => { lines += `<path d="${scribble(x, y, w, 40 + i, 1.1)}"/>`; });
    let motes = '';
    const R = rng(11);
    for (let i = 0; i < 9; i++) motes += `<circle class="mo" cx="${r(126 + R() * 56)}" cy="${r(92 + R() * 34)}" r="${r(0.5 + R() * 0.8)}" style="animation-delay:${r(-R() * 5)}s"/>`;
    const style = anim(uc,
      `.${uc} .tp{transform-origin:146px 124px;animation:${uc}-turn 6.5s ease-in-out infinite}` +
      `.${uc} .cone{animation:${uc}-flick 4.2s ease-in-out infinite}` +
      `.${uc} .br{transform-box:fill-box;transform-origin:50% 100%;animation:${uc}-br 3.6s ease-in-out infinite}` +
      `.${uc} .zz text{opacity:0;animation:${uc}-z 3.6s ease-out infinite}` +
      `.${uc} .zz text:nth-child(2){animation-delay:1.2s}.${uc} .zz text:nth-child(3){animation-delay:2.4s}` +
      `.${uc} .mo{animation:${uc}-mote 5s ease-in-out infinite}` +
      `@keyframes ${uc}-turn{0%{transform:scaleX(1);opacity:0}6%{opacity:1}30%{transform:scaleX(1)}54%{transform:scaleX(-1)}80%{transform:scaleX(-1);opacity:1}90%,100%{transform:scaleX(-1);opacity:0}}` +
      `@keyframes ${uc}-flick{0%,100%{opacity:.9}38%{opacity:1}42%{opacity:.62}46%{opacity:.96}}` +
      `@keyframes ${uc}-br{50%{transform:scale(1.025,1.055)}}` +
      `@keyframes ${uc}-z{0%{opacity:0;transform:translate(0,0)}20%{opacity:.95}100%{opacity:0;transform:translate(-9px,-15px)}}` +
      `@keyframes ${uc}-mote{0%,100%{opacity:.15}50%{transform:translate(3px,-7px);opacity:.9}}`);
    const body = `${style}<defs>
      <linearGradient id="${id.cone}" gradientUnits="userSpaceOnUse" x1="189" y1="88" x2="138" y2="130">${stop(0, '#fff2c0', 0.6)}${stop(1, '#ffd27a', 0.04)}</linearGradient>
      <radialGradient id="${id.pool}">${stop(0, '#ffd98a', 0.55)}${stop(1, '#ffd98a', 0)}</radialGradient>
      <linearGradient id="${id.page}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#fffaf0')}${stop(1, '#eedfc2')}</linearGradient>
      <linearGradient id="${id.page2}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#f3e6cc')}${stop(1, '#fffaf0')}</linearGradient>
      ${sheepDefs(ids, PAL.black)}
    </defs>
    <ellipse cx="120" cy="146" rx="106" ry="5" fill="#000" opacity=".2"/>
    <g class="cone"><polygon points="175,78 203,98 192,140 98,114" fill="url(#${id.cone})"/><ellipse cx="148" cy="138" rx="52" ry="7" fill="url(#${id.pool})"/></g>
    <g stroke-linecap="round" stroke-linejoin="round">
      ${book(14, 128, 72, 13, '#5b4a6b')}
      ${book(20, 116, 62, 12, 'var(--c-acc3)', 1.5)}
      ${book(12, 105, 68, 11, '#2f4a5a', -2)}
      <g transform="translate(50 105) scale(1.16)"><g class="br">${sheepFig(ids, PAL.black, { pose: 'sit', eyes: 'happy' })}</g></g>
      <g class="zz" font-family="Georgia,'Times New Roman',serif" font-weight="700" style="fill:var(--c-acc2)"><text x="28" y="70" font-size="8">z</text><text x="22" y="58" font-size="10">z</text><text x="15" y="45" font-size="13">Z</text></g>
      <path d="M100 138 C118 133.5 134 133.5 146 139 C158 133.5 174 133.5 192 138 L192 141.5 C174 137 158 137 146 142.5 C134 137 118 137 100 141.5 Z" style="fill:var(--c-acc3)" stroke="${ink}" stroke-width="1.4"/>
      <path d="${pageL}" fill="#e2d2b4" stroke="${ink}" stroke-width="1" transform="translate(0 2)"/>
      <path d="${pageR}" fill="#e2d2b4" stroke="${ink}" stroke-width="1" transform="translate(0 2)"/>
      <path d="${pageL}" fill="url(#${id.page})" stroke="${ink}" stroke-width="1.3"/>
      <path d="${pageR}" fill="url(#${id.page})" stroke="${ink}" stroke-width="1.3"/>
      <g fill="none" stroke="#8a6a5a" stroke-width=".7" opacity=".7">${lines}</g>
      <path d="M121 113 l6 -3 l5 4 l6 -6" fill="none" style="stroke:var(--c-acc)" stroke-width="1" opacity=".8"/>
      <path class="tp" d="${pageR}" fill="url(#${id.page2})" stroke="${ink}" stroke-width="1.2"/>
      <path d="M146 112 V136" stroke="${ink}" stroke-width="1" opacity=".5"/>
      <ellipse cx="212" cy="139" rx="15" ry="3.6" fill="#4a3a36" stroke="${ink}" stroke-width="1.3"/>
      <rect x="201" y="132.5" width="22" height="6.5" rx="3" fill="#7a6258" stroke="${ink}" stroke-width="1.3"/>
      <path d="M212 133 L221 101 L201 80" fill="none" stroke="${ink}" stroke-width="4.4"/>
      <path d="M212 133 L221 101 L201 80" fill="none" stroke="#a88c80" stroke-width="2.4"/>
      <circle cx="221" cy="101" r="3.2" fill="#7a6258" stroke="${ink}" stroke-width="1.2"/>
      <g transform="translate(196 78) rotate(35)">
        <path d="M-7 -4 Q0 -13 7 -4" fill="#7a6258" stroke="${ink}" stroke-width="1.3"/>
        <path d="M-12 -4 L12 -4 L17 12 L-17 12 Z" style="fill:var(--c-acc3)" stroke="${ink}" stroke-width="1.5"/>
        <path d="M-9 -1.5 L-12.5 9" stroke="#fff" stroke-width="1.2" opacity=".35"/>
        <ellipse cx="0" cy="12" rx="17" ry="3" fill="#fff4cf" stroke="${ink}" stroke-width="1.2"/>
      </g>
    </g>
    <g fill="#fff4cf">${motes}</g>
    <path d="${sparkle(96, 38, 3.6)} ${sparkle(228, 48, 2.6)} ${sparkle(74, 18, 2.2)}" style="fill:var(--c-acc2)" opacity=".85"/>`;
    return svg('0 0 240 160', `scn-study ${uc}`, body);
  }

  /* ====================================================================
   * 10. 学者之心 —— 火山异常区：采样探针、源石结晶、被热感挡开的落石
   * ==================================================================== */
  function fieldwork() {
    const uc = nid('fld');
    const id = { rock: nid('fr'), lava: nid('fl'), cry: nid('fc'), metal: nid('fm'), halo: nid('fh') };
    const ink = '#1f161b';
    const crystal = (cx, by, h, w, rot) => {
      const p = [[0, 0], [w / 2, -h * 0.14], [w / 2, -h * 0.78], [0, -h], [-w / 2, -h * 0.78], [-w / 2, -h * 0.14]];
      return `<g transform="translate(${cx} ${by}) rotate(${rot})"><polygon points="${pts(p)}" fill="url(#${id.cry})" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<path d="M0 -1 V${r(-h + 1)} M${r(w / 2)} ${r(-h * 0.78)} L0 ${r(-h * 0.62)} L${r(-w / 2)} ${r(-h * 0.78)}" fill="none" style="stroke:var(--c-acc)" stroke-width=".8" opacity=".8"/>` +
        `<path d="M${r(-w / 2 + 1.2)} ${r(-h * 0.2)} V${r(-h * 0.7)}" stroke="#fff" stroke-width=".8" opacity=".35"/></g>`;
    };
    const rock = (x, y, s, cls) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="rk ${cls}" d="M-5 -3 L-1 -6.2 L5 -4.4 L6.4 1 L2.4 5.4 L-4.2 4.4 Z" fill="#6a5a62" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/></g>`;
    const flash = (x, y, cls) => `<path class="fx ${cls}" d="${sparkle(x, y, 6)}" fill="#fff" style="stroke:var(--c-acc2)" stroke-width=".8"/>`;
    const heat = (x, y, d) => `<path class="ht" d="M${x} ${y} q-3 -5 0 -10 q3 -5 0 -10 q-3 -5 0 -10" style="animation-delay:${d}s"/>`;
    const arc = 'M44 80 Q120 8 200 68';
    const style = anim(uc,
      `.${uc} .rk{transform-box:fill-box;transform-origin:center;opacity:0;animation:${uc}-fall 3.3s cubic-bezier(.5,0,.6,1) infinite}` +
      `.${uc} .r2{animation-name:${uc}-fall2;animation-delay:1.1s}.${uc} .r3{animation-delay:2.2s}` +
      `.${uc} .fx{transform-box:fill-box;transform-origin:center;opacity:0;animation:${uc}-flash 3.3s linear infinite}` +
      `.${uc} .f2{animation-delay:1.1s}.${uc} .f3{animation-delay:2.2s}` +
      `.${uc} .arc{stroke-dasharray:12 6;animation:${uc}-dash 1.4s linear infinite}` +
      `.${uc} .halo{animation:${uc}-pulse 3.3s ease-in-out infinite}` +
      `.${uc} .lv{animation:${uc}-pulse 2.2s ease-in-out infinite}` +
      `.${uc} .ht{fill:none;stroke:var(--c-acc);stroke-width:1.2;stroke-linecap:round;opacity:0;animation:${uc}-heat 3s ease-out infinite}` +
      `.${uc} .rd{stroke-dasharray:40;animation:${uc}-dash2 1.6s linear infinite}` +
      `.${uc} .led{animation:${uc}-blink 1s steps(1) infinite}` +
      `@keyframes ${uc}-fall{0%{transform:translate(0,-10px);opacity:0}12%{opacity:1}40%{transform:translate(0,34px)}58%{transform:translate(-14px,24px) rotate(-70deg)}100%{transform:translate(-56px,96px) rotate(-220deg);opacity:0}}` +
      `@keyframes ${uc}-fall2{0%{transform:translate(0,-10px);opacity:0}12%{opacity:1}40%{transform:translate(0,38px)}58%{transform:translate(15px,28px) rotate(80deg)}100%{transform:translate(52px,98px) rotate(230deg);opacity:0}}` +
      `@keyframes ${uc}-flash{0%,37%{opacity:0;transform:scale(.3)}41%{opacity:1;transform:scale(1.25)}56%,100%{opacity:0;transform:scale(.6)}}` +
      `@keyframes ${uc}-dash{to{stroke-dashoffset:-18}}@keyframes ${uc}-dash2{to{stroke-dashoffset:-80}}` +
      `@keyframes ${uc}-pulse{0%,100%{opacity:.55}50%{opacity:1}}` +
      `@keyframes ${uc}-heat{0%{opacity:0;transform:translateY(4px)}30%{opacity:.7}100%{opacity:0;transform:translateY(-12px)}}` +
      `@keyframes ${uc}-blink{50%{opacity:.15}}`);
    const body = `${style}<defs>
      <linearGradient id="${id.rock}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#6d5c64')}${stop(0.45, '#3c2f36')}${stop(1, '#1d1519')}</linearGradient>
      <linearGradient id="${id.lava}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#fff0c8')}${vstop(0.45, '--c-acc2')}${vstop(1, '--c-acc3')}</linearGradient>
      <linearGradient id="${id.cry}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#5a4f66')}${stop(0.5, '#241c2c')}${stop(1, '#0e0a12')}</linearGradient>
      <linearGradient id="${id.metal}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#8d97a3')}${stop(0.5, '#ffffff')}${stop(1, '#8d97a3')}</linearGradient>
      ${glowGrad(id.halo, '--c-acc2', 0.4)}
    </defs>
    <ellipse cx="121" cy="150" rx="102" ry="5" fill="#000" opacity=".22"/>
    <ellipse class="halo" cx="121" cy="54" rx="92" ry="44" fill="url(#${id.halo})"/>
    <path d="${arc}" fill="none" style="stroke:var(--c-acc2)" stroke-width="8" stroke-linecap="round" opacity=".16"/>
    <path class="arc" d="${arc}" fill="none" style="stroke:var(--c-acc2)" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M49 82 Q120 15 195 70" fill="none" stroke="#fff" stroke-width=".7" stroke-dasharray="2 5" opacity=".6"/>
    ${rock(90, 6, 1.1, 'r1')}${rock(160, 4, 1.25, 'r2')}${rock(124, -2, 0.8, 'r3')}
    ${flash(90, 46, 'f1')}${flash(160, 48, 'f2')}${flash(123, 40, 'f3')}
    <g stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 128 C30 116 52 112 70 114 C90 108 110 112 128 110 C150 106 176 112 196 110 C210 112 222 120 224 130 L214 142 C170 148 80 148 26 142 Z" fill="url(#${id.rock})" stroke="${ink}" stroke-width="1.6"/>
      <path d="M26 118 C48 112 66 114 72 116 M128 111 C150 107 176 113 196 111" fill="none" stroke="#fff" stroke-width=".9" opacity=".18"/>
      <path d="M30 133 C80 138 160 136 214 131" fill="none" stroke="#000" stroke-width="1" opacity=".3"/>
      <g class="lv" fill="none">
        <path d="M84 113 L90 122 L86 131 L93 141 M170 110 L164 121 L171 130 L168 141" style="stroke:var(--c-acc2)" stroke-width="5" opacity=".3"/>
        <path d="M84 113 L90 122 L86 131 L93 141 M170 110 L164 121 L171 130 L168 141 M90 122 L100 126" stroke="url(#${id.lava})" stroke-width="1.9"/>
      </g>
      ${heat(90, 108, 0)}${heat(167, 106, 1)}${heat(128, 104, 2)}
      ${crystal(46, 118, 26, 9, -12)}${crystal(56, 116, 34, 11, 4)}${crystal(66, 118, 20, 8, 18)}
      <ellipse cx="56" cy="117" rx="18" ry="3" style="fill:var(--c-acc)" opacity=".25"/>
      <rect x="156.5" y="80" width="3.4" height="34" fill="url(#${id.metal})" stroke="${ink}" stroke-width=".9"/>
      <path d="M176 58 L180 44" stroke="${ink}" stroke-width="1.2"/><circle cx="180.4" cy="43" r="2" style="fill:var(--c-acc)" stroke="${ink}" stroke-width=".8"/>
      <rect x="140" y="58" width="40" height="25" rx="3.4" fill="#ebe6de" stroke="${ink}" stroke-width="1.5"/>
      <rect x="144" y="62" width="24" height="15" rx="1.6" fill="#15241f" stroke="${ink}" stroke-width=".9"/>
      <path class="rd" d="M145 72 L149 72 L151 66.5 L153 75.5 L155 69 L157 72 L160 72 L162 68 L164 72 L167 72" fill="none" stroke="#7dffb0" stroke-width="1"/>
      <circle class="led" cx="174" cy="66" r="2.1" style="fill:var(--c-acc)"/>
      <path d="M171 73 h6 M171 76.5 h6" stroke="${ink}" stroke-width=".8" opacity=".6"/>
      <g transform="rotate(8 206 104)"><rect x="203" y="92" width="6" height="18" rx="2.6" fill="#fff" fill-opacity=".55" stroke="${ink}" stroke-width="1"/><rect x="203.6" y="101" width="4.8" height="8.4" rx="2" style="fill:var(--c-acc)" opacity=".85"/><rect x="202.2" y="90.4" width="7.6" height="3" rx="1" fill="#3b4250"/></g>
      <g transform="rotate(-6 196 106)"><rect x="193" y="95" width="6" height="15" rx="2.6" fill="#fff" fill-opacity=".55" stroke="${ink}" stroke-width="1"/><rect x="193.6" y="103" width="4.8" height="6.4" rx="2" fill="#7dffb0" opacity=".8"/><rect x="192.2" y="93.4" width="7.6" height="3" rx="1" fill="#3b4250"/></g>
    </g>
    <path d="${sparkle(24, 40, 3)} ${sparkle(222, 30, 3.6)}" style="fill:var(--c-acc2)" opacity=".8"/>`;
    return svg('0 0 240 160', `scn-field ${uc}`, body);
  }

  /* ====================================================================
   * 11. 阿黛尔·瑙曼 —— 北方荒地的夜：拱窗里的远山与星空，窗前的提灯和写着名字的笔记本
   * ==================================================================== */
  function nightCamp() {
    const uc = nid('cmp');
    const id = { clip: nid('cc'), sky: nid('cs'), glow: nid('cg'), lamp: nid('cl'), crater: nid('ccr'), cover: nid('ccv') };
    const ink = '#1b1522';
    const R = rng(21);
    const arch = 'M40 146 V58 A80 52 0 0 1 200 58 V146 Z';
    let stars = '';
    for (let i = 0; i < 36; i++) {
      const x = 44 + R() * 152, y = 8 + R() * 74, s = 0.4 + R() * 0.9;
      stars += `<circle cx="${r(x)}" cy="${r(y)}" r="${r(s)}" opacity="${r(0.45 + R() * 0.55)}"${i % 3 === 0 ? ` class="tw" style="animation-delay:${r(-R() * 3)}s"` : ''}/>`;
    }
    const puffs = [[123, 70, 4.4], [129, 62, 6], [137, 55, 7.6], [148, 49, 9]].map(([x, y, rr], i) => `<circle class="pf" cx="${x}" cy="${y}" r="${rr}" style="animation-delay:${-i * 1.1}s"/>`).join('');
    const tuft = (x, y) => `<path d="M${x} ${y} l-3 -6 M${x} ${y} l0 -8 M${x} ${y} l3 -6 M${x} ${y} l5 -4" />`;
    const style = anim(uc,
      `.${uc} .tw{animation:${uc}-tw 3s ease-in-out infinite}` +
      `.${uc} .pf{transform-box:fill-box;transform-origin:center;animation:${uc}-pf 4.4s ease-out infinite}` +
      `.${uc} .gl{animation:${uc}-gl 4s ease-in-out infinite}` +
      `.${uc} .lg{animation:${uc}-lg 2.6s ease-in-out infinite}` +
      `.${uc} .fl{transform-box:fill-box;transform-origin:50% 100%;animation:${uc}-fl .9s ease-in-out infinite alternate}` +
      `.${uc} .ss{opacity:0;animation:${uc}-ss 7s linear infinite}` +
      `@keyframes ${uc}-tw{0%,100%{opacity:.25}50%{opacity:1}}` +
      `@keyframes ${uc}-pf{0%{opacity:0;transform:translate(-4px,6px) scale(.6)}25%{opacity:.55}100%{opacity:0;transform:translate(10px,-8px) scale(1.25)}}` +
      `@keyframes ${uc}-gl{0%,100%{opacity:.45}50%{opacity:.8}}` +
      `@keyframes ${uc}-lg{0%,100%{opacity:.7}45%{opacity:1}55%{opacity:.8}}` +
      `@keyframes ${uc}-fl{from{transform:scale(.92,1)}to{transform:scale(1.06,1.14)}}` +
      `@keyframes ${uc}-ss{0%,78%{opacity:0;transform:translate(0,0)}80%{opacity:1}88%,100%{opacity:0;transform:translate(-34px,15px)}}`);
    const body = `${style}<defs>
      <clipPath id="${id.clip}"><path d="${arch}"/></clipPath>
      <linearGradient id="${id.sky}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#10163a')}${stop(0.55, '#33234a')}${stop(1, '#6a2e44')}</linearGradient>
      ${glowGrad(id.glow, '--c-acc', 0.6)}
      <radialGradient id="${id.lamp}">${stop(0, '#ffd88a', 0.6)}${stop(1, '#ffd88a', 0)}</radialGradient>
      <radialGradient id="${id.crater}">${stop(0, '#fff0c8')}${vstop(1, '--c-acc2')}</radialGradient>
      <linearGradient id="${id.cover}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#8a4a44')}${stop(1, '#4e2426')}</linearGradient>
    </defs>
    <ellipse cx="120" cy="149" rx="100" ry="4.5" fill="#000" opacity=".22"/>
    <g clip-path="url(#${id.clip})">
      <rect x="36" y="0" width="168" height="150" fill="url(#${id.sky})"/>
      <g fill="#fff">${stars}</g>
      <path class="ss" d="M92 22 l-16 7" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>
      <circle class="gl" cx="120" cy="82" r="40" fill="url(#${id.glow})"/>
      <g fill="#7a6a80">${puffs}</g>
      <path d="M62 126 L106 84 L114 79 L126 79 L134 85 L180 126 Z" fill="#231a2a"/>
      <path d="M106 84 L114 79 L126 79 L134 85" fill="none" stroke="#6a4a5a" stroke-width="1"/>
      <path d="M114 80 C110 92 104 100 96 112" fill="none" style="stroke:var(--c-acc2)" stroke-width="1.2" opacity=".5"/>
      <ellipse cx="120" cy="79.5" rx="6.5" ry="1.8" fill="url(#${id.crater})"/>
      <path d="M36 122 C70 115 96 127 130 121 C160 116 182 123 204 118 V150 H36 Z" fill="#140f18"/>
      <g fill="none" stroke="#2c2230" stroke-width="1.1" stroke-linecap="round">${tuft(58, 128)}${tuft(170, 124)}${tuft(188, 128)}${tuft(98, 130)}</g>
      <path d="${arch}" fill="none" style="stroke:var(--c-acc)" stroke-width="3" opacity=".35"/>
    </g>
    <path d="${arch}" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      <circle class="lg" cx="72" cy="124" r="32" fill="url(#${id.lamp})"/>
      <path d="M65 108 Q72 98 79 108" fill="none" stroke="${ink}" stroke-width="1.5"/>
      <path d="M63 111 L81 111 L78 107 L66 107 Z" fill="#4a3a3a" stroke="${ink}" stroke-width="1.2"/>
      <rect x="63.5" y="111" width="17" height="24" rx="2" fill="#fff3c8" fill-opacity=".8" stroke="${ink}" stroke-width="1.3"/>
      <path class="fl" d="M72 131 C68.6 127 70 122 72 118.5 C74 122 75.4 127 72 131 Z" fill="#ffb347" stroke="#c0601a" stroke-width=".6"/>
      <path d="M72 130 C70.6 128 71.2 125.6 72 124 C72.8 125.6 73.4 128 72 130 Z" fill="#fff6d0"/>
      <path d="M68 111 V135 M76 111 V135" stroke="${ink}" stroke-width=".8" opacity=".55"/>
      <rect x="61.5" y="135" width="21" height="6.5" rx="1.6" fill="#4a3a3a" stroke="${ink}" stroke-width="1.2"/>
      <g transform="rotate(-9 156 132)">
        <rect x="128" y="120" width="56" height="25" rx="2.4" fill="#e9dcc2" stroke="${ink}" stroke-width="1.2" transform="translate(2 2)"/>
        <rect x="128" y="120" width="56" height="25" rx="2.4" fill="url(#${id.cover})" stroke="${ink}" stroke-width="1.4"/>
        <path d="M177 120 V145" stroke="#1b1522" stroke-width="1.8"/>
        <rect x="132" y="126" width="41" height="11" rx="1" fill="#f5ead2" stroke="${ink}" stroke-width=".8"/>
        <text x="152.5" y="133.6" text-anchor="middle" font-family="'Segoe Print','Bradley Hand','Comic Sans MS',cursive" font-size="5" fill="#3a2620">A. Naumann</text>
      </g>
      <path d="M186 146 L208 126" stroke="${ink}" stroke-width="4"/><path d="M186 146 L208 126" stroke="#e8b54e" stroke-width="2.4"/>
      <path d="M208 126 L212 122.6" stroke="#f3d2a8" stroke-width="2.4"/><path d="M211.2 123.3 L212.8 122" stroke="#333" stroke-width="1.4"/>
      <path d="M104 146 L108 140 L115 139 L118 144 Z M92 147 L95 143 L100 143.5 L101 147 Z" fill="#5a4a52" stroke="${ink}" stroke-width="1"/>
    </g>
    <path d="${sparkle(24, 30, 3.4)} ${sparkle(218, 22, 2.8)} ${sparkle(222, 96, 2.2)}" style="fill:var(--c-acc2)" opacity=".85"/>`;
    return svg('0 0 240 160', `scn-camp ${uc}`, body);
  }

  /* ====================================================================
   * 12. 会浮起来的石头 —— 水碗里上下翻滚、嗞嗞冒泡的浮石；黑曜石；读唇语的气泡
   * ==================================================================== */
  function pumice() {
    const uc = nid('pum');
    const id = { water: nid('pw'), glass: nid('pg'), stone: nid('ps'), obs: nid('po'), clip: nid('pc') };
    const ink = '#34304a';
    const bowl = 'M70 70 C66 100 80 136 120 138 C160 136 174 100 170 70';
    const R = rng(5);
    let holes = '';
    [[-8, -3, 1.6], [-3, -6, 1.2], [3, -4, 1.7], [9, -2, 1.1], [-10, 2, 1], [6, 2, 1.3], [0, 0, 1], [-5, 4, 0.9], [11, 3, 0.8]].forEach(([x, y, rr]) => { holes += `<ellipse cx="${x}" cy="${y}" rx="${rr}" ry="${r(rr * 0.8)}"/>`; });
    let bubbles = '';
    for (let i = 0; i < 9; i++) bubbles += `<circle class="bu" cx="${r(106 + R() * 28)}" cy="${r(112 + R() * 18)}" r="${r(0.9 + R() * 1.5)}" style="animation-delay:${r(-R() * 2.4)}s"/>`;
    const style = anim(uc,
      `.${uc} .bob{transform-box:fill-box;transform-origin:center;animation:${uc}-bob 2.6s ease-in-out infinite}` +
      `.${uc} .bu{animation:${uc}-bu 2.4s ease-in infinite}` +
      `.${uc} .rp{transform-box:fill-box;transform-origin:center;opacity:0;animation:${uc}-rp 2.6s ease-out infinite}` +
      `.${uc} .rp2{animation-delay:1.3s}` +
      `.${uc} .fz{animation:${uc}-fz .5s steps(2) infinite}` +
      `.${uc} .dot{animation:${uc}-dot 1.5s ease-in-out infinite}` +
      `.${uc} .dot:nth-child(2){animation-delay:.2s}.${uc} .dot:nth-child(3){animation-delay:.4s}` +
      `.${uc} .gl{transform-box:fill-box;transform-origin:center;animation:${uc}-gl 3.2s ease-in-out infinite}` +
      `@keyframes ${uc}-bob{0%,100%{transform:translateY(-1.5px) rotate(-5deg)}50%{transform:translateY(2px) rotate(6deg)}}` +
      `@keyframes ${uc}-bu{0%{opacity:0;transform:translateY(0)}20%{opacity:.9}90%{opacity:.8}100%{opacity:0;transform:translateY(-26px)}}` +
      `@keyframes ${uc}-rp{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(2.3)}}` +
      `@keyframes ${uc}-fz{50%{opacity:.2}}` +
      `@keyframes ${uc}-dot{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-1.5px)}}` +
      `@keyframes ${uc}-gl{0%,70%,100%{opacity:0;transform:scale(.4) rotate(0)}80%{opacity:1;transform:scale(1.2) rotate(45deg)}}`);
    const body = `${style}<defs>
      <clipPath id="${id.clip}"><path d="${bowl} Z"/></clipPath>
      <linearGradient id="${id.water}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#bfe6ff', 0.75)}${stop(1, '#6fb0e0', 0.8)}</linearGradient>
      <linearGradient id="${id.glass}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#ffffff', 0.55)}${stop(0.5, '#eaf2ff', 0.18)}${stop(1, '#ffffff', 0.45)}</linearGradient>
      <radialGradient id="${id.stone}" cx=".38" cy=".3" r=".8">${stop(0, '#e6dacb')}${stop(0.6, '#b3a393')}${stop(1, '#7c6c61')}</radialGradient>
      <linearGradient id="${id.obs}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#55506c')}${stop(0.45, '#15131c')}${stop(1, '#050507')}</linearGradient>
    </defs>
    <ellipse cx="124" cy="146" rx="98" ry="5" fill="#000" opacity=".16"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 18 H84 Q90 18 90 24 V42 Q90 48 84 48 H56 L48 57 L48 48 H28 Q22 48 22 42 V24 Q22 18 28 18 Z" fill="#fffdf8" stroke="${ink}" stroke-width="1.4"/>
      <path d="M34 33 C38 28 44 27.5 48 30.5 C52 27.5 58 28 62 33 C57 38.5 39 38.5 34 33 Z" style="fill:var(--c-acc)" stroke="#8a2a4a" stroke-width="1"/>
      <path d="M35 33 C42 34.6 54 34.6 61 33" fill="none" stroke="#8a2a4a" stroke-width=".9"/>
      <path d="M40 31 Q44 29.6 46 31" fill="none" stroke="#fff" stroke-width=".8" opacity=".6"/>
      <g style="fill:var(--c-acc2)"><circle class="dot" cx="70" cy="33" r="1.7"/><circle class="dot" cx="76" cy="33" r="1.7"/><circle class="dot" cx="82" cy="33" r="1.7"/></g>
      <path d="${bowl} Z" fill="url(#${id.glass})"/>
      <path d="M70 70 A50 9 0 0 1 170 70" fill="none" stroke="${ink}" stroke-width="1.2" opacity=".55"/>
      <g clip-path="url(#${id.clip})">
        <rect x="60" y="90" width="120" height="52" fill="url(#${id.water})"/>
        <g fill="#fff" opacity=".8">${bubbles}</g>
      </g>
      <ellipse cx="120" cy="90" rx="49" ry="6.5" fill="#dff3ff" fill-opacity=".75" stroke="#7fb7de" stroke-width="1"/>
      <ellipse class="rp" cx="120" cy="90" rx="17" ry="3" fill="none" stroke="#fff" stroke-width="1"/>
      <ellipse class="rp rp2" cx="120" cy="90" rx="17" ry="3" fill="none" stroke="#fff" stroke-width="1"/>
      <g transform="translate(120 87)"><g class="bob">
        <path d="M-15 2 C-16 -5 -9 -10.5 -2 -9.5 C5 -11.5 14 -7 15 -1 C16 5 9 8.5 1 8.5 C-6 9.5 -14 7.5 -15 2 Z" fill="url(#${id.stone})" stroke="#5a4c44" stroke-width="1.3"/>
        <g fill="#7a6a60" opacity=".85">${holes}</g>
        <path d="M-9 -6 Q-4 -9 2 -8.4" fill="none" stroke="#fff" stroke-width="1" opacity=".6"/>
      </g></g>
      <g clip-path="url(#${id.clip})"><rect x="60" y="91.5" width="120" height="14" fill="#9fd0f2" opacity=".35"/></g>
      <g class="fz" fill="none" style="stroke:var(--c-acc2)" stroke-width="1.1"><path d="M100 80 q-3 -3 -1 -6.5 M140 78 q3 -3 1 -6.5 M112 72 l-1 -4 M129 71 l1.4 -4"/></g>
      <path d="${bowl}" fill="none" stroke="${ink}" stroke-width="1.6"/>
      <path d="M70 70 A50 9 0 0 0 170 70" fill="none" stroke="${ink}" stroke-width="1.6"/>
      <path d="M78 86 C76 104 82 122 96 130" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>
      <path d="M160 82 C162 92 161 100 158 108" fill="none" stroke="#fff" stroke-width="1.2" opacity=".5"/>
      <path d="M186 141 L189 125 L199 116 L213 120 L220 134 L211 142 Z" fill="url(#${id.obs})" stroke="#1a1a22" stroke-width="1.3"/>
      <path d="M189 125 L203 128 L211 142 M199 116 L203 128 L220 134" fill="none" stroke="#9a94c0" stroke-width=".6" opacity=".45"/>
      <path d="M192 124 L199 118.4" stroke="#fff" stroke-width="1.2" opacity=".6"/>
      <path class="gl" d="${sparkle(196, 121, 4.2)}" fill="#fff"/>
      <g transform="rotate(-12 44 128)">
        <path d="M40 116 L50 116" stroke="${ink}" stroke-width=".8"/>
        <rect x="26" y="118" width="38" height="22" rx="2" fill="#fffdf6" stroke="${ink}" stroke-width="1.2"/>
        <circle cx="30.5" cy="122.5" r="1.3" fill="none" stroke="${ink}" stroke-width=".8"/>
        <text x="46" y="130" text-anchor="middle" font-family="'Noto Serif SC','Songti SC',serif" font-size="8.6" font-weight="700" fill="#3a3354">浮石</text>
        <text x="46" y="136.6" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="4.8" fill="#6a6480">Pumice</text>
      </g>
    </g>
    <path d="${sparkle(212, 60, 3.4)} ${sparkle(100, 16, 2.4)} ${sparkle(226, 100, 2.2)}" style="fill:var(--c-acc2)" opacity=".85"/>`;
    return svg('0 0 240 160', `scn-pumice ${uc}`, body);
  }

  /* ====================================================================
   * 13. 两封信 —— 寄往莱塔尼亚的（火焰蜡封）与寄自汐斯塔的（羽毛蜡封），中间飘着一张旧照片
   * ==================================================================== */
  function twoLetters() {
    const uc = nid('two');
    const id = { paper: nid('tp'), paper2: nid('tp2'), sealA: nid('tsa'), sealB: nid('tsb'), photo: nid('tph'), wool: nid('tw'), face: nid('tf'), horn: nid('th') };
    const ink = '#3d2a30';
    const env = (seal, stamp) => `
      <rect x="-35" y="-22" width="70" height="44" rx="2.4" fill="url(#${id.paper})" stroke="${ink}" stroke-width="1.5"/>
      <path d="M-35 22 L-7 1 M35 22 L7 1" fill="none" stroke="${ink}" stroke-width=".8" opacity=".3"/>
      <path d="M-34.4 -21.4 L0 5 L34.4 -21.4 Z" fill="url(#${id.paper2})" stroke="${ink}" stroke-width="1.2"/>
      ${stamp}${seal}`;
    const sealA = `<path d="${flameD(0.62, 0, 4)}" fill="#000" opacity=".25" transform="translate(.8 1)"/><path d="${flameD(0.62, 0, 4)}" fill="url(#${id.sealA})" stroke="#5a1414" stroke-width="1"/><path d="${flameD(0.38, 0, 5)}" fill="none" stroke="#fff" stroke-width=".6" opacity=".4"/>`;
    const sealB = `<circle cx=".8" cy="5" r="8.4" fill="#000" opacity=".22"/><circle cx="0" cy="4" r="8.4" fill="url(#${id.sealB})" stroke="#26345e" stroke-width="1"/><path d="M-4 8.6 C-2.4 3 1 -.6 5 -1.8 C3.6 3 .6 6.6 -4 8.6 Z M-4 8.6 L-5.6 10.2 M-2.6 6.4 L1 3.6" fill="none" stroke="#fff" stroke-width=".8" opacity=".75"/>`;
    const stamp = (icon) => `<g transform="translate(19 -18)"><rect width="12" height="14" fill="#fff" stroke="${ink}" stroke-width=".6" stroke-dasharray="1.2 .8"/>${icon}</g>`;
    const stampA = stamp(`<path d="M2 11 L5.6 5 L6.4 4.4 L7.2 5 L10 11 Z" style="fill:var(--c-acc3)"/><path d="M6.4 4 q-1 -2 .6 -3" fill="none" stroke="#888" stroke-width=".6"/>`) + `<g transform="translate(22 -8)" fill="none" stroke="${ink}" stroke-width=".6" opacity=".55"><circle r="7"/><path d="M-12 -2 q3 -2 6 0 t6 0 t6 0 t6 0 M-12 2 q3 -2 6 0 t6 0 t6 0 t6 0"/></g>`;
    const stampB = stamp(`<rect x="1.4" y="1.4" width="9.2" height="11.2" fill="#bfe6ff"/><path d="M1.4 9 q2.3 -2 4.6 0 t4.6 0 V12.6 H1.4 Z" fill="#6fb0e0"/><circle cx="8" cy="4.4" r="1.6" fill="#ffd66b"/>`) + `<g transform="translate(22 -8)" fill="none" stroke="#26345e" stroke-width=".6" opacity=".5"><circle r="7"/><path d="M-4 -1 h8 M-4 1.6 h8"/></g>`;
    const ids = { wool: id.wool, face: id.face, horn: id.horn };
    const style = anim(uc,
      `.${uc} .ea{animation:${uc}-a 3.6s ease-in-out infinite}` +
      `.${uc} .eb{animation:${uc}-b 4.1s ease-in-out infinite}` +
      `.${uc} .ph{transform-box:fill-box;transform-origin:50% 0;animation:${uc}-ph 5s ease-in-out infinite}` +
      `.${uc} .tr{stroke-dasharray:1 5;animation:${uc}-tr 1.2s linear infinite}` +
      `.${uc} .hv{transform-box:fill-box;transform-origin:center;animation:${uc}-hv 2.4s ease-in-out infinite}` +
      `@keyframes ${uc}-a{0%,100%{transform:translate(0,0)}50%{transform:translate(3px,-4px)}}` +
      `@keyframes ${uc}-b{0%,100%{transform:translate(0,0)}50%{transform:translate(-3px,-3px)}}` +
      `@keyframes ${uc}-ph{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(5deg)}}` +
      `@keyframes ${uc}-tr{to{stroke-dashoffset:-12}}` +
      `@keyframes ${uc}-hv{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}`);
    const heart = (x, y, s) => `<path class="hv" d="M${x} ${r(y + 3 * s)} C${r(x - 5 * s)} ${r(y - 0.6 * s)} ${r(x - 2.6 * s)} ${r(y - 4 * s)} ${x} ${r(y - 1.6 * s)} C${r(x + 2.6 * s)} ${r(y - 4 * s)} ${r(x + 5 * s)} ${r(y - 0.6 * s)} ${x} ${r(y + 3 * s)} Z"/>`;
    const body = `${style}<defs>
      <linearGradient id="${id.paper}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#fffaf0')}${stop(1, '#efdcbf')}</linearGradient>
      <linearGradient id="${id.paper2}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#f6e7cc')}${stop(1, '#e6cfaa')}</linearGradient>
      <radialGradient id="${id.sealA}" cx=".38" cy=".34" r=".78">${vstop(0.1, '--c-acc')}${vstop(1, '--c-acc3')}</radialGradient>
      <radialGradient id="${id.sealB}" cx=".38" cy=".34" r=".8">${stop(0, '#c4d6f6')}${stop(1, '#4a66a8')}</radialGradient>
      <linearGradient id="${id.photo}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#f2b98a')}${stop(1, '#7a4a5a')}</linearGradient>
      ${sheepDefs(ids, PAL.black)}
    </defs>
    <ellipse cx="120" cy="148" rx="90" ry="4.5" fill="#000" opacity=".16"/>
    <g fill="none" stroke-linecap="round" stroke-width="2">
      <path class="tr" d="M4 104 C22 80 36 70 52 68" style="stroke:var(--c-acc2)"/>
      <path class="tr" d="M236 58 C224 84 208 98 194 102" stroke="#7a96d6"/>
    </g>
    <g class="ph"><g transform="translate(120 20) rotate(6)">
      <rect x="-15" y="0" width="30" height="34" rx="1" fill="#fffdf8" stroke="${ink}" stroke-width="1.1"/>
      <rect x="-12" y="3" width="24" height="22" fill="url(#${id.photo})"/>
      <path d="M-12 20 C-6 16 4 17 12 19 V25 H-12 Z" fill="#3a2a30" opacity=".7"/>
      <g transform="translate(-2.5 23.6) scale(.34)">${sheepFig(ids, PAL.black, { eyes: 'happy' })}</g>
      <g transform="translate(6.5 23.6) scale(-.3 .3)">${sheepFig(ids, PAL.black, { eyes: 'happy', phase: 1 })}</g>
      <path d="M-7 30 h14" stroke="#8a6a5a" stroke-width=".7" opacity=".6"/>
    </g></g>
    <g class="ea"><g transform="translate(80 68) rotate(-12)">${env(sealA, stampA)}
      <path d="${scribble(-28, 14, 22, 71, 0.9)}" fill="none" stroke="#6b4a3a" stroke-width=".7" opacity=".55"/></g></g>
    <g class="eb"><g transform="translate(164 104) rotate(9)">${env(sealB, stampB)}
      <path d="${scribble(-28, 14, 24, 72, 0.9)}" fill="none" stroke="#3a4a6a" stroke-width=".7" opacity=".55"/></g></g>
    <g style="fill:var(--c-acc)" opacity=".85">${heart(40, 92, 1)}${heart(212, 120, 0.8)}</g>
    <path d="${sparkle(26, 30, 3.4)} ${sparkle(214, 30, 2.8)} ${sparkle(110, 132, 2.2)}" style="fill:var(--c-acc2)" opacity=".85"/>`;
    return svg('0 0 240 160', `scn-letters ${uc}`, body);
  }

  /* ====================================================================
   * 14. 夜色中的第一步 —— 圆窗里的夜山：发光的小羊领路，山顶种下一株预警花
   * ==================================================================== */
  function nightPlanting() {
    const uc = nid('npl');
    const id = { clip: nid('nc'), sky: nid('ns'), hill: nid('nh'), pet: nid('nf'), glow: nid('ng'), aura: nid('na'), wool: nid('nw'), face: nid('nfa'), horn: nid('nho') };
    const ink = '#2c2946';
    const cx = 114, cy = 78, rad = 66;
    const R = rng(33);
    let stars = '';
    for (let i = 0; i < 30; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * rad;
      const x = cx + Math.cos(a) * d, y = cy - Math.abs(Math.sin(a)) * d * 0.95;
      stars += `<circle cx="${r(x)}" cy="${r(y)}" r="${r(0.4 + R() * 0.9)}" opacity="${r(0.4 + R() * 0.6)}"${i % 3 === 0 ? ` class="tw" style="animation-delay:${r(-R() * 3)}s"` : ''}/>`;
    }
    const path = [[62, 136], [72, 132], [82, 128], [92, 122], [102, 116], [111, 108], [120, 100], [130, 92], [140, 84], [150, 76]];
    const dots = path.map(([x, y], i) => `<circle class="pd" cx="${x}" cy="${y}" r="1.5" style="animation-delay:${r(i * 0.22)}s"/>`).join('');
    const mini = ([x, y], i) => `<g transform="translate(${x} ${y - 1})"><g class="hop" style="animation-delay:${r(-i * 0.3)}s">
      <circle cx="0" cy="-4" r="10" fill="url(#${id.aura})"/>
      <path d="M-3 -.8 v2.2 M2.6 -.8 v2.2" stroke="#ffd2e2" stroke-width="1.1" stroke-linecap="round"/>
      <g fill="#ffe3ee"><circle cx="-3.4" cy="-4.2" r="3.1"/><circle cx=".6" cy="-5.4" r="3.4"/><circle cx="3.6" cy="-3.6" r="2.9"/><circle cx="-.4" cy="-2.4" r="3.3"/></g>
      <circle cx="6.4" cy="-6.2" r="2.3" fill="#fff"/><circle cx="7.2" cy="-6.6" r=".5" fill="#4a2a3b"/>
    </g></g>`;
    const ids = { wool: id.wool, face: id.face, horn: id.horn };
    let pet = '';
    for (let k = 0; k < 5; k++) pet += `<ellipse cx="158" cy="57.2" rx="1.9" ry="3.1" transform="rotate(${k * 72} 158 60.4)" fill="url(#${id.pet})"/>`;
    const style = anim(uc,
      `.${uc} .tw{animation:${uc}-tw 3s ease-in-out infinite}` +
      `.${uc} .pd{animation:${uc}-pd 2.2s ease-in-out infinite}` +
      `.${uc} .hop{animation:${uc}-hop .9s ease-in-out infinite}` +
      `.${uc} .fg{transform-box:fill-box;transform-origin:center;animation:${uc}-fg 3s ease-in-out infinite}` +
      `.${uc} .sway{transform-box:fill-box;transform-origin:50% 100%;animation:${uc}-sw 4s ease-in-out infinite}` +
      `@keyframes ${uc}-tw{0%,100%{opacity:.25}50%{opacity:1}}` +
      `@keyframes ${uc}-pd{0%,100%{opacity:.25}35%{opacity:1}}` +
      `@keyframes ${uc}-hop{0%,100%{transform:translateY(0)}50%{transform:translateY(-3.5px)}}` +
      `@keyframes ${uc}-fg{0%,100%{opacity:.55;transform:scale(.9)}50%{opacity:1;transform:scale(1.15)}}` +
      `@keyframes ${uc}-sw{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}`);
    const body = `${style}<defs>
      <clipPath id="${id.clip}"><circle cx="${cx}" cy="${cy}" r="${rad}"/></clipPath>
      <linearGradient id="${id.sky}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#0e1536')}${stop(0.6, '#27306a')}${stop(1, '#5c4c86')}</linearGradient>
      <linearGradient id="${id.hill}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#2e2850')}${stop(1, '#15122a')}</linearGradient>
      <radialGradient id="${id.pet}" cx=".5" cy=".3" r=".8">${stop(0, '#ffffff')}${stop(1, '#f59ab8')}</radialGradient>
      <radialGradient id="${id.glow}">${stop(0, '#ffe3ee', 0.85)}${stop(1, '#ffb3cc', 0)}</radialGradient>
      <radialGradient id="${id.aura}">${stop(0, '#ffc2d8', 0.55)}${stop(1, '#ffc2d8', 0)}</radialGradient>
      ${sheepDefs(ids, PAL.pink)}
    </defs>
    <ellipse cx="128" cy="149" rx="96" ry="4.5" fill="#000" opacity=".16"/>
    <g clip-path="url(#${id.clip})">
      <rect x="${cx - rad}" y="${cy - rad}" width="${rad * 2}" height="${rad * 2}" fill="url(#${id.sky})"/>
      <g fill="#fff">${stars}</g>
      <circle cx="86" cy="40" r="9" fill="#fff6d8"/><circle cx="90" cy="37" r="8.2" fill="#131b40"/>
      <path d="M40 148 L48 128 C74 124 96 112 118 98 C132 88 146 76 156 70 L162 68 C170 72 178 80 186 88 V148 Z" fill="url(#${id.hill})"/>
      <path d="M118 98 C132 88 146 76 156 70 L162 68" fill="none" stroke="#6a5c9a" stroke-width="1" opacity=".7"/>
      <path d="M40 148 V136 C80 132 120 138 190 124 V148 Z" fill="#0d0b1a"/>
      <g fill="#ffd6e6">${dots}</g>
      ${[path[1], path[4], path[7]].map(mini).join('')}
      <circle class="fg" cx="158" cy="60" r="16" fill="url(#${id.glow})"/>
      <ellipse cx="158" cy="69.4" rx="6" ry="1.8" fill="#4a3a5a"/>
      <g class="sway">
        <path d="M158 69 C157 66 158.6 63 158 60" fill="none" stroke="#7cc08f" stroke-width="1.3"/>
        <path d="M158 66.4 C155 64.4 152.6 65 151.6 66.6 C154 67.8 156.4 67.4 158 66.4 Z M158.2 65 C161 63 163.6 63.4 164.6 65 C162.2 66.2 159.8 66 158.2 65 Z" fill="#8ed09f"/>
        ${pet}<circle cx="158" cy="60.4" r="1.4" fill="#ffe08a"/>
      </g>
      <path d="M166 69 L169 58" stroke="#8a7a70" stroke-width="1.2"/><path d="M168 60 L171 52 L173 53 L170 61 Z" fill="#b8c0cc" stroke="#4a4a5a" stroke-width=".6"/>
      <circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="#ffc2d8" stroke-width="3" opacity=".4"/>
    </g>
    <circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${ink}" stroke-width="2.4"/>
    <circle cx="${cx}" cy="${cy}" r="${rad + 5}" fill="none" style="stroke:var(--c-acc2)" stroke-width=".8" stroke-dasharray="2 5" opacity=".7"/>
    <g transform="translate(204 146) scale(1.18)">${sheepFig(ids, PAL.pink, { eyes: 'open', phase: 1, bow: true })}</g>
    <path d="${sparkle(30, 34, 4)} ${sparkle(212, 36, 3)} ${sparkle(28, 116, 2.6)} ${sparkle(196, 84, 2.2)}" style="fill:var(--c-acc2)" opacity=".85"/>`;
    return svg('0 0 240 160', `scn-night ${uc}`, body);
  }

  /* ====================================================================
   * 15. 人物卡：瑙曼夫妇 —— 黄昏里走向火山的两个背影
   * ==================================================================== */
  function farewell() {
    const uc = nid('fw');
    const id = { sky: nid('fs'), sun: nid('fsn'), glow: nid('fg') };
    const walker = (x, y, s, coat, d) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="wk" style="animation-delay:${d}s">
      <path d="M-3 0 L-2.4 -9 M3 0 L2.4 -9" stroke="#0c080c" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M-6 -8 L-5 -22 Q0 -25 5 -22 L6 -8 Z" fill="${coat}" stroke="#0c080c" stroke-width="1"/>
      <rect x="-4.4" y="-21" width="8.8" height="10" rx="2" fill="#2a1e22" stroke="#0c080c" stroke-width=".9"/>
      <circle cx="0" cy="-27" r="4.2" fill="#1a1216"/>
      <path d="M-3 -29.6 C-7.6 -33 -10 -28 -7 -25.6 M3 -29.6 C7.6 -33 10 -28 7 -25.6" fill="none" stroke="#c9b8a0" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M-6 -8 L-5 -22" stroke="#ffb070" stroke-width=".7" opacity=".6"/>
    </g></g>`;
    const style = anim(uc,
      `.${uc} .wk{animation:${uc}-wk .8s ease-in-out infinite alternate}` +
      `.${uc} .pf{transform-box:fill-box;transform-origin:center;animation:${uc}-pf 5s ease-out infinite}` +
      `.${uc} .gl{animation:${uc}-gl 4s ease-in-out infinite}` +
      `@keyframes ${uc}-wk{to{transform:translateY(-1.2px)}}` +
      `@keyframes ${uc}-pf{0%{opacity:0;transform:translate(-4px,8px) scale(.6)}25%{opacity:.7}100%{opacity:0;transform:translate(14px,-10px) scale(1.3)}}` +
      `@keyframes ${uc}-gl{0%,100%{opacity:.5}50%{opacity:.9}}`);
    const puffs = [[166, 50, 6], [172, 40, 8], [182, 30, 10], [196, 22, 12]].map(([x, y, rr], i) => `<circle class="pf" cx="${x}" cy="${y}" r="${rr}" style="animation-delay:${-i * 1.25}s"/>`).join('');
    const body = `${style}<defs>
      <linearGradient id="${id.sky}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#22162a')}${stop(0.55, '#6a2e3e')}${stop(1, '#e0844e')}</linearGradient>
      <radialGradient id="${id.sun}">${stop(0, '#fff0c8')}${stop(0.5, '#ffc27a', 0.8)}${stop(1, '#ffc27a', 0)}</radialGradient>
      <radialGradient id="${id.glow}">${stop(0, '#ff9a4a', 0.8)}${stop(1, '#ff9a4a', 0)}</radialGradient>
    </defs>
    <rect width="240" height="160" fill="url(#${id.sky})"/>
    <circle cx="66" cy="106" r="30" fill="url(#${id.sun})"/>
    <circle class="gl" cx="166" cy="60" r="22" fill="url(#${id.glow})"/>
    <g fill="#8a6a70" opacity=".6">${puffs}</g>
    <path d="M0 124 C30 112 64 116 100 124 Z" fill="#4a2a36"/>
    <path d="M96 126 L150 64 L158 60 L172 60 L180 66 L240 122 V126 Z" fill="#2a1a24"/>
    <path d="M150 64 L158 60 L172 60 L180 66" fill="none" stroke="#ff9a4a" stroke-width="1" opacity=".7"/>
    <path d="M0 122 H240 V160 H0 Z" fill="#1a1016"/>
    <path d="M100 160 C118 146 130 136 150 124 L156 124 C140 136 132 148 128 160 Z" fill="#3a2a30"/>
    ${walker(127, 150, 1.12, '#3a3a52', 0)}${walker(143, 140, 0.94, '#5a3a3a', -0.4)}
    <path d="M0 122 H240" stroke="#ff9a4a" stroke-width=".6" opacity=".35"/>`;
    return svg('0 0 240 160', `scn-farewell ${uc}`, body, ' preserveAspectRatio="xMidYMid slice"');
  }

  /* ====================================================================
   * 16. 小剧场的布景：两种形态 × 基建 / 作战，共四套（只画墙面以上，地板由 CSS 画）
   *   术师 · 基建：夜里的宿舍书房，窗外远山在发光
   *   术师 · 作战：黄昏的火山地带
   *   医疗 · 基建：汐斯塔火山博物馆里阳光充足的小房间
   *   医疗 · 作战：晴空下的草坡，远处的火山飘着白色的灰
   * 大部分是静态的（只绘制一次）；只有烟、云、灯光这几处在动
   * ==================================================================== */
  function stage(form, group) {
    const uc = nid('stg');
    const alt = form === 'alter', front = group === 'front';
    const id = { a: nid('sa'), b: nid('sb'), c: nid('sc'), d: nid('sd'), e: nid('se'), pat: nid('sp') };
    const R = rng(alt ? (front ? 41 : 42) : front ? 43 : 44);
    const style = anim(uc,
      `.${uc} .sm{transform-box:fill-box;transform-origin:center;animation:${uc}-sm 7s ease-in-out infinite}` +
      `.${uc} .sm:nth-child(2n){animation-delay:-2.4s}.${uc} .sm:nth-child(3n){animation-delay:-4.6s}` +
      `.${uc} .fl{animation:${uc}-fl 4s ease-in-out infinite}` +
      `.${uc} .cl{animation:${uc}-cl 40s linear infinite alternate}` +
      `.${uc} .tw{animation:${uc}-tw 3s ease-in-out infinite}` +
      `@keyframes ${uc}-sm{0%,100%{transform:translate(0,0) scale(1);opacity:.55}50%{transform:translate(14px,-10px) scale(1.12);opacity:.8}}` +
      `@keyframes ${uc}-fl{0%,100%{opacity:.75}46%{opacity:1}50%{opacity:.6}54%{opacity:.95}}` +
      `@keyframes ${uc}-cl{from{transform:translateX(-30px)}to{transform:translateX(40px)}}` +
      `@keyframes ${uc}-tw{0%,100%{opacity:.3}50%{opacity:1}}`);
    let body = '';
    const stars = (n, x0, x1, y0, y1) => { let s = ''; for (let i = 0; i < n; i++) s += `<circle cx="${r(x0 + R() * (x1 - x0))}" cy="${r(y0 + R() * (y1 - y0))}" r="${r(0.5 + R() * 1.1)}"${i % 3 ? '' : ' class="tw"'} style="animation-delay:${r(-R() * 3)}s"/>`; return s; };
    const smoke = (x, y, k, col, op = 0.6) => [[0, 0, 10], [8, -12, 13], [20, -24, 16], [36, -34, 19], [56, -40, 22]].map(([dx, dy, rr]) => `<circle class="sm" cx="${r(x + dx * k)}" cy="${r(y + dy * k)}" r="${r(rr * k)}" fill="${col}" opacity="${op}"/>`).join('');
    const books = (x, y, w, cols) => {
      let s = '', cx = x;
      while (cx < x + w - 8) {
        const bw = 7 + R() * 9, bh = 34 + R() * 20, c = cols[(R() * cols.length) | 0], lean = R() < 0.12;
        s += `<rect x="${r(cx)}" y="${r(y - bh)}" width="${r(bw)}" height="${r(bh)}" rx="1" fill="${c}"${lean ? ` transform="rotate(8 ${r(cx)} ${y})"` : ''}/><path d="M${r(cx + 2)} ${r(y - bh + 6)} h${r(bw - 4)} M${r(cx + 2)} ${r(y - 8)} h${r(bw - 4)}" stroke="#fff" stroke-opacity=".25" stroke-width="1"/>`;
        cx += bw + 1.5 + (lean ? 4 : 0);
      }
      return s;
    };
    const plush = (x, y, s, wool, face, horn) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="-12" rx="22" ry="14" fill="${wool}"/><circle cx="-12" cy="-20" r="9" fill="${wool}"/><circle cx="8" cy="-24" r="10" fill="${wool}"/><circle cx="18" cy="-12" r="8" fill="${wool}"/><ellipse cx="-22" cy="-14" rx="8" ry="9" fill="${face}"/><path d="M-24 -22 q-8 -8 -10 2 q2 4 6 2" fill="none" stroke="${horn}" stroke-width="3" stroke-linecap="round"/><circle cx="-24" cy="-14" r="1.2" fill="#2b1a1a"/><circle cx="-19" cy="-14" r="1.2" fill="#2b1a1a"/></g>`;
    const crystal = (x, y, h, rot, edge) => `<g transform="translate(${x} ${y}) rotate(${rot})"><polygon points="0,0 6,-${r(h * 0.16)} 6,-${r(h * 0.78)} 0,-${h} -6,-${r(h * 0.78)} -6,-${r(h * 0.16)}" fill="#1c1420" stroke="${edge}" stroke-width="1.2"/><path d="M0 -2 V-${h - 2}" stroke="${edge}" stroke-width=".8" opacity=".7"/></g>`;
    if (!alt && !front) {
      // 术师 · 基建：夜里的书房
      body = `<defs>
        <pattern id="${id.pat}" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="#2a1520"/><path d="M14 0 V28" stroke="#fff" stroke-opacity=".035" stroke-width="6"/><circle cx="14" cy="14" r="1.6" fill="#ff9ab8" opacity=".12"/></pattern>
        <linearGradient id="${id.a}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#0c0e26')}${stop(0.7, '#2a1838')}${stop(1, '#5a2238')}</linearGradient>
        <radialGradient id="${id.b}">${stop(0, '#ffd88a', 0.55)}${stop(1, '#ffd88a', 0)}</radialGradient>
        <radialGradient id="${id.c}">${stop(0, '#ff7a3a', 0.7)}${stop(1, '#ff7a3a', 0)}</radialGradient>
      </defs>
      <rect width="800" height="360" fill="url(#${id.pat})"/>
      <rect y="262" width="800" height="98" fill="#1f0f17"/><rect y="258" width="800" height="6" fill="#4a2432"/>
      <g>
        <rect x="462" y="52" width="196" height="176" fill="#3a1f2a"/>
        <rect x="472" y="62" width="176" height="156" fill="url(#${id.a})"/>
        <g fill="#fff">${stars(26, 474, 646, 64, 150)}</g>
        <circle cx="584" cy="178" r="46" fill="url(#${id.c})"/>
        <path d="M472 218 L520 190 C548 178 566 168 578 160 L590 160 C606 170 630 184 648 196 L648 218 Z" fill="#150c18"/>
        <ellipse cx="584" cy="161" rx="7" ry="2" fill="#ffb070"/>
        <g>${smoke(588, 150, 1.1, '#6a5a70', 0.5)}</g>
        <path d="M560 62 V218 M472 140 H648" stroke="#3a1f2a" stroke-width="5"/>
        <path d="M452 46 C470 110 466 190 486 236 L446 236 Z" fill="#6a1f3a"/><path d="M668 46 C650 110 654 190 634 236 L674 236 Z" fill="#6a1f3a"/>
        <path d="M456 60 C468 120 464 180 476 226 M664 60 C652 120 656 180 644 226" stroke="#000" stroke-opacity=".25" stroke-width="2" fill="none"/>
        <rect x="444" y="40" width="232" height="8" rx="3" fill="#8a5a3a"/>
      </g>
      <g>
        <rect x="52" y="60" width="190" height="300" fill="#2e1820"/><rect x="60" y="68" width="174" height="292" fill="#1d0e15"/>
        ${[128, 190, 252, 314].map((y) => `<rect x="60" y="${y}" width="174" height="6" fill="#4a2a32"/>`).join('')}
        ${books(64, 128, 120, ['#7a2e45', '#a14a3a', '#2f4a5a', '#5b4a6b', '#c9a35a', '#3a5a4a'])}${books(64, 190, 166, ['#7a2e45', '#2f4a5a', '#8a3a50', '#5b4a6b', '#6a5a3a'])}
        ${books(110, 252, 120, ['#a14a3a', '#2f4a5a', '#c9a35a', '#5b4a6b'])}${books(64, 314, 170, ['#3a5a4a', '#7a2e45', '#5b4a6b', '#a14a3a', '#2f4a5a'])}
        <g transform="translate(200 128)"><rect x="-14" y="-30" width="26" height="30" rx="4" fill="#fff" fill-opacity=".12" stroke="#ffb0c8" stroke-opacity=".4"/>${crystal(-1, -4, 20, 8, '#ff8a3d')}</g>
        <g transform="translate(80 252)">${plush(0, 0, 0.9, '#2b2229', '#fff3e6', '#ffd08a')}</g>
      </g>
      <g>
        <rect x="318" y="84" width="74" height="60" fill="#c99a4a"/><rect x="324" y="90" width="62" height="48" fill="#3a1c24"/>
        <path d="M324 138 L346 112 L356 118 L372 100 L386 118 V138 Z" fill="#8a3a4a"/><circle cx="372" cy="100" r="3" fill="#ffb070"/>
        <rect x="700" y="72" width="70" height="104" fill="#e9dcc8" transform="rotate(3 735 124)"/>
        <g transform="rotate(3 735 124)"><path d="M710 150 L734 100 L760 150 Z" fill="#5a2a3a"/><path d="M734 100 l-4 -12 M734 100 l5 -14" stroke="#ff7a3a" stroke-width="2"/><rect x="708" y="154" width="54" height="3" fill="#5a2a3a"/><rect x="714" y="161" width="42" height="2" fill="#5a2a3a" opacity=".5"/></g>
      </g>
      <g>
        <rect x="286" y="246" width="176" height="12" rx="2" fill="#5a3438"/><rect x="286" y="256" width="176" height="6" fill="#3a2026"/>
        <rect x="296" y="262" width="10" height="98" fill="#3a2026"/><rect x="442" y="262" width="10" height="98" fill="#3a2026"/><rect x="306" y="262" width="136" height="40" fill="#2e181e"/><rect x="366" y="276" width="16" height="3" rx="1" fill="#c99a4a"/>
        <path d="M318 246 C330 240 344 240 356 244 C368 240 382 240 394 246 Z" fill="#f3e6cc"/><path d="M356 244 V246" stroke="#8a6a5a"/>
        <path d="M324 243 h24 M362 243 h24" stroke="#8a6a5a" stroke-width=".8" opacity=".6"/>
        <rect x="404" y="232" width="14" height="14" rx="2" fill="#e9e2d6"/><path d="M418 236 q6 2 0 7" fill="none" stroke="#e9e2d6" stroke-width="2"/>
        <path class="sm" d="M408 228 q-3 -5 0 -10 M414 226 q3 -5 0 -10" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.4"/>
        <ellipse cx="444" cy="246" rx="12" ry="3" fill="#4a3a36"/><path d="M444 244 L450 206 L430 190" fill="none" stroke="#a88c80" stroke-width="3"/>
        <path d="M424 180 L440 180 L446 196 L418 196 Z" transform="rotate(-24 432 190)" fill="#c0395a"/>
      </g>
      <circle class="fl" cx="410" cy="222" r="96" fill="url(#${id.b})"/>`;
    } else if (!alt && front) {
      // 术师 · 作战：黄昏的火山地带
      body = `<defs>
        <linearGradient id="${id.a}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#140910')}${stop(0.55, '#4a1624')}${stop(1, '#b8452e')}</linearGradient>
        <radialGradient id="${id.b}">${stop(0, '#ff9a4a', 0.75)}${stop(1, '#ff9a4a', 0)}</radialGradient>
        <linearGradient id="${id.c}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#fff0c8')}${stop(0.5, '#ff8a3d')}${stop(1, '#c02a20')}</linearGradient>
      </defs>
      <rect width="800" height="360" fill="url(#${id.a})"/>
      <g fill="#ffd0b0">${stars(20, 0, 800, 10, 120)}</g>
      <circle cx="520" cy="190" r="150" fill="url(#${id.b})"/>
      <path d="M0 300 C80 262 160 250 240 262 C300 270 340 250 380 240 C410 234 440 250 470 290 L470 360 L0 360 Z" fill="#3a1a24"/>
      <path d="M300 360 L470 176 L492 168 L540 168 L560 178 L760 360 Z" fill="#241018"/>
      <path d="M470 176 L492 168 L540 168 L560 178" fill="none" stroke="#ff9a4a" stroke-width="2" opacity=".8"/>
      <path d="M506 170 C498 210 480 240 452 290 M526 170 C534 206 550 236 574 280" fill="none" stroke="url(#${id.c})" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="516" cy="169" rx="22" ry="4" fill="#ffd9a0"/>
      <g>${smoke(518, 150, 2.2, '#4a3440', 0.7)}${smoke(470, 110, 1.6, '#3a2830', 0.5)}</g>
      <path d="M560 360 C620 300 700 280 800 290 L800 360 Z" fill="#2e1520"/>
      <path d="M0 330 C140 312 300 320 420 316 C560 312 680 322 800 318 V360 H0 Z" fill="#1a0c12"/>
      ${crystal(90, 332, 34, -10, '#ff8a3d')}${crystal(104, 334, 46, 6, '#ff8a3d')}${crystal(118, 334, 26, 18, '#ff8a3d')}
      ${crystal(690, 330, 30, -6, '#ff8a3d')}${crystal(704, 332, 40, 10, '#ff8a3d')}
      <g fill="#ffb070">${[[240, 200], [300, 150], [640, 120], [700, 200], [380, 90]].map(([x, y]) => `<circle class="tw" cx="${x}" cy="${y}" r="1.6"/>`).join('')}</g>`;
    } else if (alt && !front) {
      // 医疗 · 基建：博物馆里阳光充足的小房间
      body = `<defs>
        <linearGradient id="${id.a}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#a9d6ff')}${stop(1, '#eaf5ff')}</linearGradient>
        <linearGradient id="${id.b}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#ffffff', 0.7)}${stop(1, '#dfeaff', 0.25)}</linearGradient>
        <radialGradient id="${id.c}">${stop(0, '#fff6d0', 0.8)}${stop(1, '#fff6d0', 0)}</radialGradient>
      </defs>
      <rect width="800" height="360" fill="#f3f5fb"/>
      <rect width="800" height="360" fill="url(#${id.b})" opacity=".4"/>
      <rect y="262" width="800" height="98" fill="#e3e8f3"/><rect y="258" width="800" height="6" fill="#c9d2e6"/>
      <g>
        <rect x="430" y="36" width="280" height="196" fill="#fff" stroke="#c9d2e6" stroke-width="4"/>
        <rect x="440" y="46" width="260" height="176" fill="url(#${id.a})"/>
        <g class="cl" fill="#fff"><ellipse cx="490" cy="80" rx="34" ry="10"/><ellipse cx="514" cy="72" rx="20" ry="10"/><ellipse cx="640" cy="100" rx="28" ry="8"/></g>
        <path d="M520 222 C520 150 690 150 690 222" fill="none" stroke="#ffb3c8" stroke-width="4" opacity=".6"/><path d="M528 222 C528 158 682 158 682 222" fill="none" stroke="#ffe08a" stroke-width="4" opacity=".6"/><path d="M536 222 C536 166 674 166 674 222" fill="none" stroke="#a6e3b8" stroke-width="4" opacity=".6"/><path d="M544 222 C544 174 666 174 666 222" fill="none" stroke="#9fc8ff" stroke-width="4" opacity=".6"/>
        <path d="M440 222 L510 180 C540 166 556 152 566 146 L580 146 C594 156 616 170 640 182 L700 208 L700 222 Z" fill="#b8b0d0"/>
        <path d="M556 152 L566 146 L580 146 L590 152 C582 156 574 150 566 156 Z" fill="#fff"/>
        <g>${smoke(572, 138, 0.9, '#ffffff', 0.85)}</g>
        <path d="M570 46 V222 M440 134 H700" stroke="#fff" stroke-width="5"/>
        <path d="M420 30 C440 100 434 180 456 244 L412 244 Z" fill="#f7cfe0"/><path d="M720 30 C700 100 706 180 684 244 L728 244 Z" fill="#f7cfe0"/>
        <rect x="410" y="24" width="320" height="8" rx="3" fill="#d8c0a8"/>
      </g>
      <circle cx="570" cy="140" r="130" fill="url(#${id.c})" opacity=".32"/>
      <g>
        <rect x="46" y="70" width="200" height="290" fill="#dfe6f3" stroke="#b8c4dc" stroke-width="3"/>
        <rect x="56" y="80" width="180" height="280" fill="#f7fbff" fill-opacity=".7"/>
        ${[140, 204, 268].map((y) => `<rect x="56" y="${y}" width="180" height="5" fill="#c9d2e6"/>`).join('')}
        <g transform="translate(90 140)"><path d="M-16 0 C-18 -10 -10 -18 -2 -16 C6 -20 16 -14 16 -4 C18 4 8 2 0 2 Z" fill="#c9b8a8" stroke="#8a7a6a"/>${[[-8, -8], [0, -11], [7, -6], [-3, -3]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#8a7a6a"/>`).join('')}</g>
        <g transform="translate(150 140)"><path d="M-14 0 L-10 -18 L2 -24 L14 -14 L12 0 Z" fill="#1a1824" stroke="#6a6488"/><path d="M-8 -16 L2 -22" stroke="#fff" stroke-width="1.5" opacity=".6"/></g>
        <g transform="translate(206 140)">${crystal(0, 0, 26, 0, '#9fc8ff')}</g>
        ${[[90, 204, '#f5a0b8'], [150, 204, '#ffd08a'], [206, 204, '#a6e3b8']].map(([x, y, c]) => `<g transform="translate(${x} ${y})"><rect x="-12" y="-30" width="24" height="30" rx="3" fill="#fff" stroke="#c9d2e6"/><circle cx="0" cy="-18" r="6" fill="${c}"/><rect x="-8" y="-6" width="16" height="3" fill="#c9d2e6"/></g>`).join('')}
        <g transform="translate(96 268)">${plush(0, 0, 0.9, '#ffd2e2', '#ffffff', '#b49de8')}</g>
        <g transform="translate(196 268)">${plush(0, 0, 0.75, '#ffe3ee', '#ffffff', '#b49de8')}</g>
      </g>
      <g>
        <rect x="276" y="76" width="112" height="80" fill="#fff" stroke="#c9d2e6" stroke-width="3"/>
        <rect x="284" y="84" width="96" height="52" fill="#c9e4ff"/><path d="M284 136 L318 104 L332 112 L352 94 L380 136 Z" fill="#8a84b0"/><path d="M346 98 L352 94 L358 98 Z" fill="#fff"/>
        <text x="332" y="150" text-anchor="middle" font-family="'Noto Serif SC',serif" font-size="9" font-weight="700" fill="#5a6488">一步，又一步</text>
        <g transform="translate(330 262)"><path d="M-18 0 L-14 -26 H14 L18 0 Z" fill="#e8b89a"/><path d="M0 -26 C-2 -44 4 -60 0 -74" stroke="#6cb07e" stroke-width="3" fill="none"/><path d="M0 -44 C-12 -48 -18 -44 -20 -38 C-10 -36 -4 -38 0 -44 Z M0 -54 C10 -60 16 -58 18 -52 C10 -48 4 -50 0 -54 Z" fill="#8ed09f"/>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-82" rx="4" ry="7" fill="#fbc4d6" transform="rotate(${a} 0 -76)"/>`).join('')}<circle cx="0" cy="-76" r="3" fill="#ffe08a"/></g>
      </g>`;
    } else {
      // 医疗 · 作战：晴空下的草坡
      body = `<defs>
        <linearGradient id="${id.a}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#8ecbff')}${stop(0.7, '#d8eeff')}${stop(1, '#f4faff')}</linearGradient>
        <linearGradient id="${id.b}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#bfe6c8')}${stop(1, '#96cfa6')}</linearGradient>
      </defs>
      <rect width="800" height="360" fill="url(#${id.a})"/>
      <g class="cl" fill="#fff" opacity=".95"><ellipse cx="120" cy="70" rx="60" ry="16"/><ellipse cx="160" cy="58" rx="36" ry="16"/><ellipse cx="560" cy="50" rx="50" ry="12"/><ellipse cx="700" cy="96" rx="40" ry="10"/></g>
      <path d="M240 260 C240 150 520 150 520 260" fill="none" stroke="#ffb3c8" stroke-width="7" opacity=".45"/><path d="M252 260 C252 162 508 162 508 260" fill="none" stroke="#ffe08a" stroke-width="7" opacity=".45"/><path d="M264 260 C264 174 496 174 496 260" fill="none" stroke="#a6e3b8" stroke-width="7" opacity=".45"/><path d="M276 260 C276 186 484 186 484 260" fill="none" stroke="#9fc8ff" stroke-width="7" opacity=".45"/>
      <path d="M420 280 L560 180 L578 172 L612 172 L630 182 L780 280 Z" fill="#b6aed0"/>
      <path d="M560 180 L578 172 L612 172 L630 182 C616 188 604 180 596 186 C586 180 574 188 560 180 Z" fill="#fff"/>
      <g>${smoke(596, 160, 1.6, '#ffffff', 0.9)}</g>
      <path d="M0 290 C120 250 260 244 380 266 C480 284 600 252 800 262 V360 H0 Z" fill="url(#${id.b})"/>
      <path d="M0 320 C160 300 320 310 460 306 C600 302 700 312 800 308 V360 H0 Z" fill="#a8d8b2"/>
      ${[[180, 262], [218, 258], [650, 262]].map(([x, y], i) => `<g transform="translate(${x} ${y}) scale(.45)">${plush(0, 0, 1, i === 2 ? '#fff' : '#ffd2e2', '#fff', '#b49de8')}</g>`).join('')}
      <g>${Array.from({ length: 26 }, () => { const x = R() * 800, y = 300 + R() * 50, c = pick3(R, ['#fbc4d6', '#ffffff', '#ffe08a']); return `<circle cx="${r(x)}" cy="${r(y)}" r="${r(2 + R() * 2)}" fill="${c}"/>`; }).join('')}</g>`;
    }
    return svg('0 0 800 360', `scn-stage ${uc}`, style + body, ' preserveAspectRatio="xMidYMax slice"');
  }
  const pick3 = (R, arr) => arr[(R() * arr.length) | 0];

  return {
    letter, trophy, cassette, flowerPot, panorama, lavaCake, brooch, sheepParade, study, fieldwork, nightCamp, pumice, twoLetters, nightPlanting, farewell, stage,
    // 画图小工具：故事区的分层插画（js/story.js）复用同一套笔触与小羊
    _: { nid, r, P, pol, TAU, rng, spline, splineClosed, sample, band, smoothstep, gauss, sparkle, scribble, circ, stop, vstop, glowGrad, sheepDefs, sheepFig, PAL, flameD },
  };
})();
