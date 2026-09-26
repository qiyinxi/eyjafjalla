/* =========================================================
 * 故事区的分层插画（本页原创 SVG）
 *
 * 为什么分层：SVG 内部元素的 CSS 动画不能交给合成器——每一帧都要在主线程重算样式、
 * 重新布局 SVG、重绘整块画面。这里把一幅插画拆成：
 *   · 底图 .lsc-base：完全静止的 SVG（大幅的整屏场景会再“烘焙”成位图，见 story.js）
 *   · 图层 .ly：绝对定位的小块，各自带一个 viewBox 就是它在原画坐标里那一块的 SVG；
 *     会动的东西只动图层本身的 transform / opacity，由合成器完成，主线程零开销
 * 坐标一律沿用原画的 viewBox（240×160 或 1600×900），图层位置按百分比换算。
 * 主题色写在 style="" 里（SVG 呈现属性不认 var()）。依赖 scenes.js 导出的画图小工具 SCENES._。
 * ========================================================= */
window.STORY_ART = (() => {
  'use strict';
  const H = (window.SCENES && window.SCENES._) || null;
  if (!H) return null;
  const { nid, r, P, pol, TAU, rng, spline, sample, band, smoothstep, gauss, sparkle, scribble, stop, vstop, glowGrad, sheepDefs, sheepFig, PAL, flameD } = H;
  const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';
  const pc = (v) => `${+(v * 100).toFixed(3)}%`;
  const fillOf = (c) => (c.startsWith('var') ? `style="fill:${c}"` : `fill="${c}"`);
  const pts = (arr) => arr.map(([x, y]) => `${r(x)},${r(y)}`).join(' ');

  /* ---------------------------------------------------- 分层场景 */
  /**
   * 一个图层。l = { x, y, w, h（原画坐标）, svg | html, defs, cls, wrap: [内层类名…], o: [ox, oy]（变换原点，原画坐标）, style, attrs }
   * wrap 生成嵌套的 div（各自可以挂一个动画：比如外层随滚动位移、内层循环摆动），它们共用 --o 作变换原点
   */
  function ly(W, Hh, l) {
    let st = `left:${pc(l.x / W)};top:${pc(l.y / Hh)};width:${pc(l.w / W)};height:${pc(l.h / Hh)};`;
    if (l.o) st += `--o:${pc((l.o[0] - l.x) / l.w)} ${pc((l.o[1] - l.y) / l.h)};`;
    if (l.style) st += l.style;
    let body = l.html != null ? l.html
      : `<svg ${XMLNS} viewBox="${r(l.x)} ${r(l.y)} ${r(l.w)} ${r(l.h)}" overflow="visible" aria-hidden="true" focusable="false">${l.defs || ''}${l.svg || ''}</svg>`;
    if (l.bake) {
      // 静止的大图层：和底图一样交给 story.js 烘焙（key 用来缓存；fw / fh 是它占整幅画的比例）
      const key = nid('bk');
      BASES.set(key, `<svg ${XMLNS} viewBox="${r(l.x)} ${r(l.y)} ${r(l.w)} ${r(l.h)}">${l.defs || ''}${l.svg || ''}</svg>`);
      body = `<div class="bk-host" data-bk="${key}" data-scene="${l.key || 'layer'}" data-fw="${r(l.w / W * 10000) / 10000}" data-fh="${r(l.h / Hh * 10000) / 10000}"></div>`;
    }
    (l.wrap || []).slice().reverse().forEach((c) => { body = `<div class="${c}">${body}</div>`; });
    return `<div class="ly${l.cls ? ' ' + l.cls : ''}" style="${st}"${l.attrs || ''}>${body}</div>`;
  }
  /** 插画上的可点区域：一个透明按钮，交给 story.js 的互动表（data-x） */
  const hs = (W, Hh, x, y, w, h, act, label) =>
    `<button class="hs" type="button" data-x="${act}" aria-label="${label}" style="left:${pc(x / W)};top:${pc(y / Hh)};width:${pc(w / W)};height:${pc(h / Hh)}"></button>`;
  /** 可点区域排在图层前面（图层本身不接收指针），这样悬停时可以用 “.hs:hover ~ .ly” 牵动后面的图层 */
  /* 整屏场景的静止底图不直接放进页面：先存成一份独立的 SVG 字符串，由 story.js 在 CPU 上烘焙成位图再贴上
     （大幅矢量画第一次上屏时，显卡要现编一批着色器，会卡一两百毫秒） */
  const BASES = new Map();
  function scene(name, W, Hh, { defs = '', base = '', layers = [], cls = '', par = '', bake = false }) {
    const hot = layers.filter((s) => s.startsWith('<button')), rest = layers.filter((s) => !s.startsWith('<button'));
    let b;
    if (bake) {
      const key = nid('bk');
      BASES.set(key, `<svg ${XMLNS} viewBox="0 0 ${W} ${Hh}"${par ? ` preserveAspectRatio="${par}"` : ''}>${defs}${base}</svg>`);
      b = `<div class="lsc-base bk-host" data-bk="${key}" data-scene="${name}"></div>`;
    } else {
      b = `<svg class="lsc-base" ${XMLNS} viewBox="0 0 ${W} ${Hh}"${par ? ` preserveAspectRatio="${par}"` : ''} aria-hidden="true" focusable="false">${defs}${base}</svg>`;
    }
    return `<div class="lsc lsc-${name}${cls ? ' ' + cls : ''}" style="aspect-ratio:${W}/${Hh}" data-scene="${name}">` + b + hot.join('') + rest.join('') + '</div>';
  }
  /** 取走某个底图的 SVG 字符串（取一次就删，免得反复重绘时越积越多） */
  function takeBase(key) { const s = BASES.get(key); BASES.delete(key); return s || ''; }
  /** 一串 HTML 粒子（位置、大小、延迟、时长写进 CSS 变量，动画在 story.css） */
  function motes(n, seed, fn) {
    const R = rng(seed);
    let s = '';
    for (let i = 0; i < n; i++) {
      const m = fn(R, i);
      s += `<i style="left:${m.x}%;top:${m.y}%;--s:${m.s || 1};--d:${r(m.d || 0)}s;--t:${r(m.t || 4)}s${m.c ? `;--c:${m.c}` : ''}${m.dx != null ? `;--dx:${m.dx}` : ''}${m.dy != null ? `;--dy:${m.dy}` : ''}"></i>`;
    }
    return s;
  }
  const note = (x, y, s, rot) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><ellipse cx="0" cy="0" rx="3.3" ry="2.3" transform="rotate(-20)"/><path d="M2.9 -.8 V-11.5 Q6.2 -9.6 7.6 -6.2" fill="none" stroke-width="1.4" stroke-linecap="round"/></g>`;

  /* ====================================================================
   * I-1 学者之家：书堆上打盹的小黑羊、自己翻页的书、一盏台灯（可关灯、可摸羊）
   * ==================================================================== */
  function study() {
    const W = 240, Hh = 160, ink = '#3a2620';
    const id = { wool: nid('sw'), face: nid('sf'), horn: nid('sh'), glow: nid('sg'), cone: nid('sc'), page: nid('sp'), page2: nid('sp2'), pool: nid('spl'), bulb: nid('sb') };
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
    const base = `<ellipse cx="120" cy="146" rx="106" ry="5" fill="#000" opacity=".2"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      ${book(14, 128, 72, 13, '#5b4a6b')}${book(20, 116, 62, 12, 'var(--c-acc3)', 1.5)}${book(12, 105, 68, 11, '#2f4a5a', -2)}
      <path d="M100 138 C118 133.5 134 133.5 146 139 C158 133.5 174 133.5 192 138 L192 141.5 C174 137 158 137 146 142.5 C134 137 118 137 100 141.5 Z" style="fill:var(--c-acc3)" stroke="${ink}" stroke-width="1.4"/>
      <path d="${pageL}" fill="#e2d2b4" stroke="${ink}" stroke-width="1" transform="translate(0 2)"/>
      <path d="${pageR}" fill="#e2d2b4" stroke="${ink}" stroke-width="1" transform="translate(0 2)"/>
      <path d="${pageL}" fill="url(#${id.page})" stroke="${ink}" stroke-width="1.3"/>
      <path d="${pageR}" fill="url(#${id.page})" stroke="${ink}" stroke-width="1.3"/>
      <g fill="none" stroke="#8a6a5a" stroke-width=".7" opacity=".7">${lines}</g>
      <path d="M121 113 l6 -3 l5 4 l6 -6" fill="none" style="stroke:var(--c-acc)" stroke-width="1" opacity=".8"/>
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
        <ellipse cx="0" cy="12" rx="17" ry="3" fill="#5a4a44" stroke="${ink}" stroke-width="1.2"/>
      </g>
    </g>
    <path d="${sparkle(96, 38, 3.6)} ${sparkle(228, 48, 2.6)} ${sparkle(74, 18, 2.2)}" style="fill:var(--c-acc2)" opacity=".85"/>`;
    const defs = `<defs><linearGradient id="${id.page}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#fffaf0')}${stop(1, '#eedfc2')}</linearGradient></defs>`;
    const Lr = (l) => ly(W, Hh, l);
    const layers = [
      // 光锥与桌上的光斑：关灯时淡出
      Lr({ x: 96, y: 76, w: 110, h: 72, cls: 'sy-cone', wrap: ['fl'],
        defs: `<defs><linearGradient id="${id.cone}" gradientUnits="userSpaceOnUse" x1="189" y1="88" x2="138" y2="130">${stop(0, '#fff2c0', 0.6)}${stop(1, '#ffd27a', 0.04)}</linearGradient><radialGradient id="${id.pool}">${stop(0, '#ffd98a', 0.55)}${stop(1, '#ffd98a', 0)}</radialGradient></defs>`,
        svg: `<polygon points="175,78 203,98 192,140 98,114" fill="url(#${id.cone})"/><ellipse cx="148" cy="138" rx="52" ry="7" fill="url(#${id.pool})"/>` }),
      // 灯泡：灯罩口的一团暖光
      Lr({ x: 170, y: 70, w: 38, h: 36, cls: 'sy-bulb',
        defs: `<defs><radialGradient id="${id.bulb}">${stop(0, '#fff6d6', 1)}${stop(0.4, '#ffd98a', 0.65)}${stop(1, '#ffd98a', 0)}</radialGradient></defs>`,
        svg: `<circle cx="189" cy="88" r="18" fill="url(#${id.bulb})"/><ellipse cx="189.1" cy="87.8" rx="12" ry="2.4" transform="rotate(35 189.1 87.8)" fill="#fff4cf"/>` }),
      // 自己翻动的那一页（沿书脊水平翻转）
      Lr({ x: 104, y: 106, w: 86, h: 32, o: [146, 124], cls: 'sy-page',
        defs: `<defs><linearGradient id="${id.page2}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#f3e6cc')}${stop(1, '#fffaf0')}</linearGradient></defs>`,
        svg: `<path d="${pageR}" fill="url(#${id.page2})" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>` }),
      // 书堆上打盹的小羊：呼吸；被摸会发烫
      Lr({ x: 18, y: 52, w: 74, h: 56, o: [55, 106], cls: 'sy-sheep', wrap: ['br'],
        defs: `<defs>${sheepDefs(ids, PAL.black)}</defs>`,
        svg: `<g transform="translate(50 105) scale(1.16)">${sheepFig(ids, PAL.black, { pose: 'sit', eyes: 'happy' })}</g>` }),
      Lr({ x: 38, y: 30, w: 44, h: 28, cls: 'sy-steam', svg: `<g fill="none" style="stroke:var(--c-acc)" stroke-width="1.4" stroke-linecap="round"><path d="M48 56 q-2.6 -3 0 -6 q2.6 -3 0 -6 q-2.6 -3 0 -6"/><path d="M59 54 q-2.6 -3 0 -6 q2.6 -3 0 -6 q-2.6 -3 0 -6 q2.6 -3 0 -6"/><path d="M70 56 q-2.2 -2.6 0 -5.2 q2.2 -2.6 0 -5.2 q-2.2 -2.6 0 -5.2"/></g>` }),
      Lr({ x: 66, y: 30, w: 40, h: 18, cls: 'sy-bub', html: '<b>烫！</b>' }),
      Lr({ x: 10, y: 34, w: 34, h: 42, cls: 'sy-zz', html: '<i style="left:48%;top:66%;font-size:3.4cqw">z</i><i style="left:30%;top:36%;font-size:4.2cqw">z</i><i style="left:8%;top:4%;font-size:5.4cqw">Z</i>' }),
      Lr({ x: 118, y: 86, w: 70, h: 44, cls: 'sy-motes pm', html: motes(7, 11, (R) => ({ x: r(R() * 92), y: r(R() * 80), s: r(0.6 + R() * 0.8), d: -R() * 5, t: 4 + R() * 2.5 })) }),
    ];
    return scene('study', W, Hh, { defs, base, layers: [...layers, hs(W, Hh, 178, 62, 50, 82, 'lamp', '台灯'), hs(W, Hh, 22, 58, 64, 50, 'pet', '摸摸小羊')] });
  }

  /* ====================================================================
   * I-2 宠物大赛第一名：玫瑰花结奖章、口哨、坐着的小黑羊（吹口哨它会前空翻）
   * ==================================================================== */
  function trophy() {
    const W = 240, Hh = 160, ink = '#3a1c14';
    const id = { ros: nid('tr'), ros2: nid('tr2'), gold: nid('tgo'), silver: nid('tsv'), path: nid('tp'), wool: nid('tw'), face: nid('tf'), horn: nid('th'), glow: nid('tsg') };
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
    let pleats = '', pleats2 = '', laurel = '';
    for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU, p1 = pol(cx, cy, 29, a), p2 = pol(cx, cy, 37, a); pleats += `M${P(p1[0], p1[1])} L${P(p2[0], p2[1])} `; }
    for (let i = 0; i < 20; i++) { const a = 0.16 + (i / 20) * TAU, p1 = pol(cx, cy, 22.5, a), p2 = pol(cx, cy, 28.5, a); pleats2 += `M${P(p1[0], p1[1])} L${P(p2[0], p2[1])} `; }
    for (let k = 0; k < 6; k++) {
      [1, -1].forEach((side) => {
        const a = Math.PI / 2 + side * (0.35 + k * 0.2), p = pol(cx, cy, 15.4, a);
        laurel += `<ellipse cx="${r(p[0])}" cy="${r(p[1])}" rx="2.5" ry="1.1" transform="rotate(${r((a * 180) / Math.PI + 90 + side * 30)} ${r(p[0])} ${r(p[1])})"/>`;
      });
    }
    const R = rng(3);
    const cols = ['var(--c-acc)', 'var(--c-acc2)', 'var(--c-acc3)', '#ffd66b', '#fff3c4'];
    const spots = [[18, 28], [40, 14], [150, 18], [176, 36], [208, 20], [226, 52], [198, 66], [14, 70], [26, 96], [224, 100], [124, 10], [62, 8], [8, 118], [146, 44], [232, 132], [190, 8]];
    const conf = ['', ''];
    spots.forEach(([x, y], i) => {
      const c = cols[i % cols.length], st = fillOf(c), rot = r(R() * 180), kind = i % 4;
      let s;
      if (kind === 0) s = `<rect x="${x - 2.4}" y="${y - 1.3}" width="4.8" height="2.6" rx=".6" transform="rotate(${rot} ${x} ${y})" ${st}/>`;
      else if (kind === 1) s = `<circle cx="${x}" cy="${y}" r="1.7" ${st}/>`;
      else if (kind === 2) s = `<path d="M${x} ${y - 2.4} L${r(x + 2.2)} ${r(y + 1.6)} L${r(x - 2.2)} ${r(y + 1.6)}Z" transform="rotate(${rot} ${x} ${y})" ${st}/>`;
      else s = `<path d="M${r(x - 4)} ${y} q2 -3 4 0 q2 3 4 0" fill="none" ${st.replace('fill', 'stroke')} stroke-width="1.4" stroke-linecap="round"/>`;
      conf[i % 2] += s;
    });
    const ids = { wool: id.wool, face: id.face, horn: id.horn, glow: id.glow };
    const defs = `<defs>
      <radialGradient id="${id.ros}" cx=".5" cy=".5" r=".5">${vstop(0.55, '--c-acc2')}${vstop(1, '--c-acc')}</radialGradient>
      <radialGradient id="${id.ros2}" cx=".45" cy=".4" r=".6">${vstop(0, '--c-acc2', 1)}${vstop(0.5, '--c-acc3')}${vstop(1, '--c-acc3')}</radialGradient>
      <radialGradient id="${id.gold}" cx=".38" cy=".32" r=".8">${stop(0, '#fff6c4')}${stop(0.45, '#ffd45a')}${stop(0.8, '#e0a23a')}${stop(1, '#b9761c')}</radialGradient>
      <linearGradient id="${id.silver}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#ffffff')}${stop(0.5, '#cfd6de')}${stop(1, '#8d97a3')}</linearGradient>
      <path id="${id.path}" d="M60 112.6 Q92 120.4 124 112.6" fill="none"/>
    </defs>`;
    const base = `<ellipse cx="118" cy="149" rx="96" ry="5" fill="#000" opacity=".2"/>
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
      <path d="M57 125 C70 129 72 143 60 147.5 C48 152 30 150 21 143" fill="none" style="stroke:var(--c-acc)" stroke-width="2.4"/>
      <path d="M57 125 C70 129 72 143 60 147.5 C48 152 30 150 21 143" fill="none" stroke="#fff" stroke-width=".9" stroke-dasharray="1.6 2.4" opacity=".55"/>
      <circle cx="53.5" cy="124.4" r="3.1" fill="none" stroke="#5f6874" stroke-width="1.4"/>
      <path d="M43 119.5 L23 119.5 Q19 119.5 19 123.5 L19 127.5 Q19 131.2 23 131.2 L32.8 131.4 A10.5 10.5 0 1 0 43 119.5 Z" fill="url(#${id.silver})" stroke="#3b4250" stroke-width="1.6"/>
      <rect x="35" y="118" width="6.6" height="3" rx=".8" fill="#2a2f38"/>
      <ellipse cx="19.8" cy="125.4" rx=".9" ry="3" fill="#2a2f38"/>
      <path d="M23 122.2 H38" stroke="#fff" stroke-width="1.2" opacity=".8"/>
      <ellipse cx="46" cy="125.6" rx="3" ry="2" transform="rotate(-30 46 125.6)" fill="#fff" opacity=".7"/>
    </g>
    <path d="${sparkle(138, 26, 4.6)} ${sparkle(46, 30, 3.6)} ${sparkle(150, 70, 2.6)}" style="fill:var(--c-acc2)"/>
    <ellipse cx="182" cy="142" rx="30" ry="3.2" fill="#000" opacity=".18"/>`;
    const Lr = (l) => ly(W, Hh, l);
    const layers = [
      Lr({ x: 0, y: 0, w: 240, h: 160, cls: 'tr-conf a', svg: conf[0] }),
      Lr({ x: 0, y: 0, w: 240, h: 160, cls: 'tr-conf b', svg: conf[1] }),
      Lr({ x: 70.5, y: 40.5, w: 43, h: 43, cls: 'tr-gleam', html: '<i></i>' }),
      Lr({ x: 0, y: 112, w: 20, h: 28, cls: 'tr-blow', svg: `<g fill="none" style="stroke:var(--c-acc2)" stroke-width="1.6" stroke-linecap="round"><path d="M15 118 q-3 -2 -6 -1"/><path d="M14 125.5 h-8"/><path d="M15 133 q-3 2 -6 1"/></g>` }),
      Lr({ x: 138, y: 72, w: 90, h: 74, o: [182, 112], cls: 'tr-sheep', wrap: ['sw'],
        defs: `<defs>${sheepDefs(ids, PAL.black)}</defs>`,
        svg: `<g transform="translate(176 139) scale(1.42)">${sheepFig(ids, PAL.black, { pose: 'sit', eyes: 'happy', heat: true, bow: true })}</g>` }),
      Lr({ x: 128, y: 62, w: 40, h: 20, cls: 'tr-bub', html: '<b>咩！</b>' }),
    ];
    return scene('trophy', W, Hh, { defs, base, layers: [...layers, hs(W, Hh, 12, 112, 62, 42, 'whistle', '吹响口哨'), hs(W, Hh, 140, 78, 84, 66, 'whistle', '小黑羊')] });
  }

  /* ====================================================================
   * I-3 碎屑流（整屏）：乌纳火山的黄昏。烟柱升起，碎屑流沿右侧山坡滚落，
   * 吞没山脚的观测营地；最后一切落成灰。1600×900，底图静止（会被烘焙成位图），
   * 烟柱、碎屑流、落灰、营地的旗子是独立图层，由滚动进度驱动
   * ==================================================================== */
  function eruption() {
    const W = 1600, Hh = 900;
    const id = { sky: nid('es'), hz: nid('eh'), vol: nid('ev'), rim: nid('er'), crater: nid('ec'), halo: nid('eha'), lamp: nid('elm'), shade: nid('esd') };
    const R = rng(29);
    const PX = 1000, PY = 330; // 火山口
    /* 火山：左坡缓长、右坡稍陡；山体轮廓用平滑曲线 */
    const volY = (x) => {
      const d = x - PX, ad = Math.abs(d);
      if (ad < 50) return PY + 6 * (d / 50) ** 2 + 2.4 * Math.sin(x * 0.2);
      const Wd = d < 0 ? 780 : 640, t = Math.min(1, (ad - 50) / Wd);
      return PY + 6 + (900 - PY) * (1 - Math.pow(1 - t, 1.7)) + (5 * Math.sin(x * 0.013) + 3 * Math.sin(x * 0.031 + 1)) * Math.min(1, t * 3);
    };
    const volPts = sample(160, 1700, 12, volY);
    const vol = `${spline(volPts)} L1700 900 L160 900 Z`;
    let stars = '';
    for (let i = 0; i < 90; i++) {
      const x = R() * 1600, y = R() * 330;
      if (x > 720 && x < 1600 && y < 330) continue;
      stars += `<circle cx="${r(x)}" cy="${r(y)}" r="${r(0.6 + R() * 1.3)}" opacity="${r(0.2 + R() * 0.6)}"/>`;
    }
    const far = band(sample(-20, 1620, 20, (x) => 650 + 22 * Math.sin(x * 0.004 + 1) + 14 * Math.sin(x * 0.011) + 6 * Math.sin(x * 0.03) - 70 * gauss(x, 300, 170) - 40 * gauss(x, 1480, 140)), 900);
    const far2 = band(sample(-20, 1620, 20, (x) => 740 + 16 * Math.sin(x * 0.006 + 2) + 9 * Math.sin(x * 0.017 + 0.5) - 34 * gauss(x, 520, 130)), 900);
    /* 左坡的熔岩：四道长短不一的熔岩流，几层由宽到窄的半透明描边叠出发光（不用模糊滤镜） */
    const lava = [];
    [[-0.16, 0.62, 1], [-0.34, 0.42, 2], [-0.5, 0.74, 3], [-0.7, 0.36, 4]].forEach(([f, len, k]) => {
      const p = [];
      for (let y = PY + 10; y < PY + (900 - PY) * len; y += 12) {
        const u = (y - PY) / (900 - PY), hw = 50 + (1 - Math.pow(1 - u, 1 / 1.7)) * 780;
        p.push([PX + f * hw + Math.sin(y * 0.026 + k * 2) * 10 * Math.min(1, u * 6), y]);
      }
      if (p.length > 2) lava.push(spline(p));
    });
    const lavaD = lava.map((d) => `<path d="${d}"/>`).join('');
    /* 前景山脊：右下角，观测营地所在 */
    const fgY = (x) => 812 - 64 * smoothstep(980, 1320, x) + 10 * Math.sin(x * 0.02) + 5 * Math.sin(x * 0.05 + 1);
    const fg = `${spline(sample(880, 1640, 16, fgY))} L1640 900 L880 900 Z`;
    const TX = 1300, TY = fgY(1300), IX = 1438, IY = fgY(1438), FX = 1228, FY = fgY(1228), BX = 1378, BY = fgY(1378);
    const camp = `
      <g fill="#0a0407" stroke="#0a0407" stroke-linejoin="round">
        <path d="M${TX - 62} ${r(TY + 6)} L${TX - 6} ${r(TY - 70)} L${TX + 6} ${r(TY - 70)} L${TX + 64} ${r(TY + 6)} Z"/>
        <path d="M${IX} ${r(IY - 74)} L${IX - 26} ${r(IY + 4)} M${IX} ${r(IY - 74)} L${IX + 24} ${r(IY + 4)} M${IX} ${r(IY - 74)} L${IX + 3} ${r(IY + 4)}" fill="none" stroke-width="5"/>
        <rect x="${IX - 22}" y="${r(IY - 96)}" width="44" height="24" rx="4"/><rect x="${IX + 20}" y="${r(IY - 90)}" width="16" height="10" rx="2"/>
        <rect x="${FX - 3}" y="${r(FY - 124)}" width="5" height="128"/>
        <rect x="${BX - 16}" y="${r(BY - 30)}" width="30" height="34" rx="6"/><rect x="${BX + 16}" y="${r(BY - 24)}" width="24" height="28" rx="6"/>
      </g>
      <g fill="none" stroke="#ff9a62" stroke-width="2" opacity=".55" stroke-linecap="round">
        <path d="M${TX + 6} ${r(TY - 70)} L${TX + 64} ${r(TY + 6)}"/><path d="M${IX} ${r(IY - 74)} L${IX + 24} ${r(IY + 4)}"/>
        <path d="M${IX + 22} ${r(IY - 96)} v24"/><path d="M${BX + 40} ${r(BY - 22)} v24"/><path d="M${FX + 2} ${r(FY - 124)} v128"/>
      </g>
      <path d="M${TX - 6} ${r(TY + 6)} L${TX} ${r(TY - 40)} L${TX + 8} ${r(TY + 6)} Z" fill="#2a0f0c"/>
      <circle cx="${IX + 30}" cy="${r(IY - 86)}" r="3.4" style="fill:var(--c-acc)"/>`;
    const base = `
      <rect width="1600" height="900" fill="url(#${id.sky})"/>
      <rect width="1600" height="900" fill="url(#${id.hz})"/>
      <g fill="#ffe8e0">${stars}</g>
      <ellipse cx="${PX + 60}" cy="${PY + 10}" rx="620" ry="380" fill="url(#${id.halo})"/>
      <path d="${far}" fill="#1e0d15"/>
      <path d="${vol}" fill="url(#${id.vol})"/>
      <path d="M${PX - 40} ${PY + 10} ${volPts.filter((p) => p[0] < PX - 40).reverse().map((p) => `L${P(p[0], p[1])}`).join(' ')} L160 900 L${PX - 200} 900 Q${PX - 120} 600 ${PX - 40} ${PY + 10} Z" fill="url(#${id.shade})"/>
      <path d="${spline(volPts.filter((p) => p[0] < PX - 50 && p[0] > PX - 560))}" fill="none" stroke="#ff8a5a" stroke-width="2.2" opacity=".22"/>
      <path d="${spline(volPts.filter((p) => p[0] > PX + 40))}" fill="none" stroke="url(#${id.rim})" stroke-width="3.2" opacity=".9"/>
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        <g stroke="#ff4f2f" stroke-width="18" opacity=".08">${lavaD}</g>
        <g stroke="#ff6a3d" stroke-width="9" opacity=".2">${lavaD}</g>
        <g stroke="#ff9a52" stroke-width="4" opacity=".55">${lavaD}</g>
        <g stroke="#ffe0a0" stroke-width="1.4" opacity=".9">${lavaD}</g>
      </g>
      <ellipse cx="${PX}" cy="${PY + 4}" rx="72" ry="12" fill="url(#${id.crater})"/>
      <path d="${far2}" fill="#13080e" opacity=".9"/>
      <path d="${fg}" fill="#0b0508"/>
      <path d="${spline(sample(980, 1640, 16, (x) => fgY(x) - 1))}" fill="none" stroke="#ff8a5a" stroke-width="2.4" opacity=".45"/>
      ${camp}`;
    const defs = `<defs>
      <linearGradient id="${id.sky}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#06030a')}${stop(0.28, '#110611')}${stop(0.52, '#2a0b18')}${stop(0.68, '#551722')}${stop(0.8, '#7e2a24')}${stop(1, '#1a0a0c')}</linearGradient>
      <linearGradient id="${id.hz}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#000', 0.45)}${stop(0.42, '#000', 0)}${stop(1, '#000', 0.1)}</linearGradient>
      <radialGradient id="${id.halo}">${stop(0, '#ff8a3d', 0.5)}${stop(0.35, '#ff4f5f', 0.2)}${stop(1, '#ff4f8f', 0)}</radialGradient>
      <linearGradient id="${id.vol}" x1="0" y1="${PY}" x2="0" y2="900" gradientUnits="userSpaceOnUse">${stop(0, '#57242a')}${stop(0.35, '#321219')}${stop(1, '#0e0609')}</linearGradient>
      <linearGradient id="${id.shade}" x1="${PX - 500}" y1="0" x2="${PX}" y2="0" gradientUnits="userSpaceOnUse">${stop(0, '#000', 0.4)}${stop(1, '#000', 0)}</linearGradient>
      <linearGradient id="${id.rim}" x1="${PX}" y1="0" x2="1700" y2="0" gradientUnits="userSpaceOnUse">${stop(0, '#ffc890', 0.95)}${stop(1, '#ff6a3d', 0)}</linearGradient>
      <radialGradient id="${id.crater}">${stop(0, '#fff6d8')}${stop(0.4, '#ffb347')}${stop(1, '#ff4f2f', 0)}</radialGradient>
    </defs>`;
    /* 烟与碎屑流的画法：同一组圆画三遍——往右下错开的暗色（阴影）、本色、往左上缩小的亮色（受光面），
       圆彼此大幅重叠，看上去是一团团翻滚的体积，而不是一串珠子 */
    const C = (x, y, rr) => `<circle cx="${r(x)}" cy="${r(y)}" r="${r(rr)}"/>`;
    const billow = (cs, c) =>
      (c.glow ? `<g fill="${c.glow}" opacity="${c.go || 0.45}">${cs.map(([x, y, rr]) => C(x, y + rr * 0.32, rr * 0.96)).join('')}</g>` : '') +
      `<g fill="${c.lo}">${cs.map(([x, y, rr]) => C(x + rr * 0.1, y + rr * 0.14, rr)).join('')}</g>` +
      `<g fill="${c.mid}">${cs.map(([x, y, rr]) => C(x, y, rr * 0.94)).join('')}</g>` +
      `<g fill="${c.hi}" opacity="${c.ho || 0.85}">${cs.map(([x, y, rr]) => C(x - rr * 0.24, y - rr * 0.3, rr * 0.56)).join('')}</g>`;
    const Rc = rng(7);
    const col = [], cap = [];
    for (let i = 0; i < 30; i++) { const t = i / 29, rr = 24 + 52 * t; col.push([PX + Math.sin(t * 4.2) * 14 + t * 46 + (Rc() - 0.5) * rr * 0.8, PY - 18 - t * 300 + (Rc() - 0.5) * 16, rr * (0.8 + Rc() * 0.4)]); }
    for (let i = 0; i < 44; i++) { const t = i / 43, rr = 74 - 34 * t; cap.push([PX + 10 + t * 600 + (Rc() - 0.5) * 50, 60 + Math.sin(t * 3.4) * 26 + t * 90 + (Rc() - 0.5) * rr * 0.9, rr * (0.75 + Rc() * 0.45)]); }
    const colSvg = billow(col, { lo: '#1c1015', mid: '#3a262c', hi: '#624a50', glow: '#ff6a3d', go: 0.4 });
    const capSvg = billow(cap, { lo: '#150c10', mid: '#2e1f25', hi: '#4c3940', ho: 0.7 });
    /* 碎屑流：贴着右坡的一股浓密灰流，上缘翻滚，前锋最大；地面一道白热的底边 */
    const Rf = rng(13), flow = [], ground = [];
    for (let x = PX + 36; x <= PX + 500; x += 12) {
      const t = (x - PX - 36) / 464, th = 16 + 92 * Math.pow(t, 1.15), g = volY(x) + 3;
      ground.push([x, g]);
      flow.push([x + (Rf() - 0.5) * 10, g - th * 0.62 + (Rf() - 0.5) * th * 0.25, th * (0.55 + Rf() * 0.3)]);
      if (t > 0.35 && Rf() < 0.7) flow.push([x + (Rf() - 0.5) * 18, g - th * 0.95, th * (0.35 + Rf() * 0.25)]);
    }
    const head = ground[ground.length - 1];
    for (let k = 0; k < 7; k++) flow.push([head[0] - 30 + Rf() * 60, head[1] - 60 - Rf() * 70, 40 + Rf() * 26]);
    const gd = spline(ground);
    const flowSvg = `<g fill="none" stroke-linecap="round"><path d="${gd}" stroke="#ff4f2f" stroke-width="34" opacity=".18"/><path d="${gd}" stroke="#ff7a3d" stroke-width="16" opacity=".35"/><path d="${gd}" stroke="#ffd08a" stroke-width="5" opacity=".8"/></g>` +
      billow(flow, { lo: '#2a2026', mid: '#56464d', hi: '#8e7b80', glow: '#ff6a3d', go: 0.28 });
    const bolt = (pts0, w) => {
      const d = `M${pts0.map((p) => P(p[0], p[1])).join(' L')}`;
      return `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" stroke="#c9a8ff" stroke-width="${w * 5}" opacity=".25"/><path d="${d}" stroke="#ffe8ff" stroke-width="${w * 2}" opacity=".7"/><path d="${d}" stroke="#ffffff" stroke-width="${w}"/></g>`;
    };
    const Lr = (l) => ly(W, Hh, l);
    const layers = [
      Lr({ x: PX - 150, y: -30, w: 330, h: PY + 40, o: [PX, PY], cls: 'er-col', wrap: ['boil'], svg: colSvg }),
      Lr({ x: PX - 90, y: -60, w: 780, h: 330, o: [PX, 220], cls: 'er-cap', wrap: ['boil2'], svg: capSvg }),
      Lr({ x: PX + 20, y: 110, w: 90, h: 150, cls: 'er-bolt b1', svg: bolt([[PX + 80, 118], [PX + 62, 160], [PX + 74, 172], [PX + 48, 214], [PX + 58, 222], [PX + 40, 252]], 2) }),
      Lr({ x: PX + 250, y: 70, w: 110, h: 110, cls: 'er-bolt b2', svg: bolt([[PX + 262, 80], [PX + 290, 114], [PX + 280, 122], [PX + 318, 152], [PX + 310, 160], [PX + 342, 176]], 1.6) }),
      Lr({ x: PX - 90, y: PY - 40, w: 180, h: 80, cls: 'er-glow', html: '<i></i>' }),
      Lr({ x: PX - 20, y: PY - 150, w: 620, h: 620, o: [PX + 34, PY + 12], cls: 'er-flow', wrap: ['roll'], svg: flowSvg }),
      Lr({ x: TX - 70, y: TY - 110, w: 140, h: 130, cls: 'er-lamp', defs: `<defs><radialGradient id="${id.lamp}">${stop(0, '#ffd88a', 0.75)}${stop(0.35, '#ffb050', 0.35)}${stop(1, '#ff8a3d', 0)}</radialGradient></defs>`, wrap: ['fk'], svg: `<ellipse cx="${TX}" cy="${r(TY - 20)}" rx="62" ry="54" fill="url(#${id.lamp})"/><path d="M${TX - 6} ${r(TY + 6)} L${TX} ${r(TY - 40)} L${TX + 8} ${r(TY + 6)} Z" fill="#ffc070" opacity=".85"/>` }),
      Lr({ x: FX, y: FY - 124, w: 70, h: 44, o: [FX + 2, FY - 118], cls: 'er-flag', wrap: ['wave'], svg: `<path d="M${FX + 2} ${r(FY - 122)} q18 -5 34 2 q16 7 32 1 l0 26 q-16 6 -32 -1 q-16 -7 -34 -2 Z" style="fill:var(--c-acc)" opacity=".9"/>` }),
      Lr({ x: 0, y: 0, w: 1600, h: 900, cls: 'er-ash pm', html: motes(34, 5, (Rr) => ({ x: r(Rr() * 100), y: r(Rr() * 90), s: r(0.6 + Rr() * 1.6), d: -Rr() * 12, t: 9 + Rr() * 7, dx: r((Rr() - 0.3) * 60) + 'px', dy: r(160 + Rr() * 200) + 'px' })) }),
      Lr({ x: 0, y: 0, w: 1600, h: 900, cls: 'er-dim', html: '<i></i>' }),
    ];
    return scene('eruption', W, Hh, { defs, base, layers, cls: 'lsc-cine', bake: true });
  }

  /* ====================================================================
   * I-4 夹在文件里的信：信封、露出一角的信纸（点开后抽出来）、火焰蜡封、压花
   * ==================================================================== */
  function letter() {
    const W = 240, Hh = 160, ink = '#3d2620';
    const id = { env: nid('le'), inn: nid('li'), paper: nid('lp'), seal: nid('ls'), pat: nid('lpt'), sheet: nid('lsh') };
    const R = rng(7);
    let specks = '';
    for (let i = 0; i < 26; i++) specks += `<circle cx="${r(52 + R() * 136)}" cy="${r(80 + R() * 56)}" r="${r(0.3 + R() * 0.5)}"/>`;
    let seis = 'M34 70';
    for (let i = 0; i < 26; i++) { const x = 34 + i * 2.6, a = (i > 8 && i < 18 ? 7 : 2.2) * (0.5 + R() * 0.5) * (i % 2 ? 1 : -1); seis += ` L${r(x)} ${r(70 + a)}`; }
    const hand = [[80, 52, 78, 11], [80, 66, 84, 12], [80, 74, 72, 13], [84, 82, 70, 14], [80, 90, 66, 15], [92, 98, 50, 16], [100, 106, 34, 17]]
      .map(([x, y, w, s]) => `<path d="${scribble(x, y, w, s)}"/>`).join('');
    let petals = '';
    for (let k = 0; k < 6; k++) petals += `<g transform="rotate(${k * 60})"><path d="M0 0 C3 -2.5 3.6 -6 0.8 -10 C0.6 -7.5 -0.8 -7 -1.4 -8.2 C-3.4 -5.6 -2.8 -2.4 0 0Z" style="fill:var(--c-acc2)" fill-opacity=".85" stroke="#8f4a26" stroke-width=".7" stroke-linejoin="round"/></g>`;
    const defs = `<defs>
      <linearGradient id="${id.inn}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#c9a275')}${stop(1, '#dcbc92')}</linearGradient>
      <linearGradient id="${id.env}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#fbeedb')}${stop(1, '#ecd2ad')}</linearGradient>
      <linearGradient id="${id.sheet}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#f1eadc')}${stop(1, '#ddd2bf')}</linearGradient>
      <pattern id="${id.pat}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" style="fill:var(--c-acc2)" opacity=".28"/><line x1="1.5" y1="0" x2="1.5" y2="6" style="stroke:var(--c-acc)" stroke-width="1.6" opacity=".4"/></pattern>
    </defs>`;
    const base = `<ellipse cx="120" cy="146" rx="86" ry="6" fill="#000" opacity=".22"/>
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
    </g>
    <g style="fill:var(--c-acc2)"><circle cx="16" cy="26" r="1.2" opacity=".6"/><circle cx="222" cy="30" r="1.5" opacity=".55"/><circle cx="228" cy="66" r="1" opacity=".5"/><circle cx="10" cy="58" r=".9" opacity=".5"/><circle cx="204" cy="10" r="1" opacity=".5"/></g>
    <path d="${sparkle(36, 12, 4.2)} ${sparkle(214, 120, 3.4)}" style="fill:var(--c-acc)" opacity=".75"/>`;
    const front = `<g stroke-linecap="round" stroke-linejoin="round">
      <path d="M46 74 L114 110 Q120 113.5 126 110 L194 74 L194 136 Q194 140 190 140 L50 140 Q46 140 46 136 Z" fill="url(#${id.env}f)" stroke="${ink}" stroke-width="1.8"/>
      <path d="M49 138 L106 105 M191 138 L134 105" fill="none" stroke="${ink}" stroke-width="1.1" opacity=".3"/>
      <path d="M52 132 Q120 126 188 132" fill="none" stroke="#fff" stroke-width="1" opacity=".5"/>
      <g fill="#8a6440" opacity=".35">${specks}</g>
      <g transform="translate(170 116) rotate(-24)">
        <path d="M0 2 C-1 10 1 18 -2 26" fill="none" stroke="#7a7c44" stroke-width="1.4"/>
        <path d="M-.6 13 C-6.5 10 -10 12 -12 15.4 C-8 17.6 -4 16.8 -.6 13Z" fill="#a3a462" stroke="#5e6034" stroke-width=".7"/>
        <path d="M0 19 C5.5 16 9.5 17.4 11.4 20.6 C7.6 23 3.6 22.4 0 19Z" fill="#a3a462" stroke="#5e6034" stroke-width=".7"/>
        <g transform="translate(0 -4)">${petals}<circle r="2.2" style="fill:var(--c-acc)" stroke="#6a2a12" stroke-width=".6"/></g>
        <rect x="-10" y="7" width="20" height="7" rx="1" transform="rotate(18)" fill="#fffbe8" fill-opacity=".55" stroke="#cdbd9a" stroke-width=".6"/>
      </g>
      <path d="${flameD(1.12, 120, 116)}" fill="#000" opacity=".25" transform="translate(1.2 1.6)"/>
      <path d="${flameD(1.12, 120, 116)}" fill="url(#${id.seal})" stroke="#5a1414" stroke-width="1.4"/>
      <path d="${flameD(0.74, 120, 118)}" fill="none" stroke="#3a0a0a" stroke-width="1" opacity=".3"/>
      <path d="${flameD(0.74, 119.4, 117.4)}" fill="none" stroke="#fff" stroke-width=".7" opacity=".35"/>
      <ellipse cx="115.2" cy="110" rx="2.2" ry="3.4" transform="rotate(28 115.2 110)" fill="#fff" opacity=".45"/>
    </g>`;
    const Lr = (l) => ly(W, Hh, l);
    const layers = [
      Lr({ x: 62, y: 24, w: 116, h: 100, o: [120, 120], cls: 'lt-paper', wrap: ['pk'],
        defs: `<defs><linearGradient id="${id.paper}" x1="0" y1="0" x2=".3" y2="1">${stop(0, '#fffdf7')}${stop(1, '#f3e7d1')}</linearGradient></defs>`,
        svg: `<g transform="rotate(-4 120 74)" stroke-linecap="round" stroke-linejoin="round">
          <rect x="68" y="30" width="104" height="90" rx="2" fill="url(#${id.paper})" stroke="${ink}" stroke-width="1.5"/>
          <path d="M69 58.5 H171" stroke="#dccbb0" stroke-width="1"/>
          <text x="79" y="44" font-family="Georgia,'Times New Roman',serif" font-style="italic" font-size="8.5" fill="#5b3a2e">Liebe Adele,</text>
          <path d="M134 42.5 q3 -3 6 0 q3 3 6 0" fill="none" style="stroke:var(--c-acc)" stroke-width=".9" opacity=".8"/>
          <g fill="none" stroke="#6b4a3a" stroke-width=".95" opacity=".8">${hand}</g></g>` }),
      Lr({ x: 44, y: 72, w: 152, h: 70, cls: 'lt-front',
        defs: `<defs><linearGradient id="${id.env}f" x1="0" y1="0" x2="0" y2="1">${stop(0, '#fbeedb')}${stop(1, '#ecd2ad')}</linearGradient><radialGradient id="${id.seal}" cx=".38" cy=".34" r=".78">${vstop(0.1, '--c-acc')}${vstop(1, '--c-acc3')}</radialGradient></defs>`,
        svg: front }),
      Lr({ x: 100, y: 96, w: 40, h: 36, cls: 'lt-glow', html: '<i></i>' }),
    ];
    return scene('letter', W, Hh, { defs, base, layers: [...layers, hs(W, Hh, 44, 22, 152, 122, 'letter', '拆开信封')] });
  }

  /* ====================================================================
   * I-5 渐远的声音：一排音柱，左边响亮、越往右越低、越灰，最后散成灰；戴上助听器，声音回来一些
   * ==================================================================== */
  function sound() {
    const W = 240, Hh = 160, N = 18;
    const R = rng(17);
    let bars = '';
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      const h = 0.06 + 0.94 * Math.pow(1 - k, 1.35) * (0.75 + 0.25 * Math.sin(i * 1.7) ** 2);
      const h2 = 0.18 + 0.7 * Math.pow(1 - k * 0.55, 1.2) * (0.75 + 0.25 * Math.sin(i * 1.7) ** 2);
      bars += `<i style="--h:${r(h)};--h2:${r(h2)};--k:${r(k)};--d:${r(-R() * 1.6)}s;--t:${r(0.9 + R() * 0.9)}s"><b></b></i>`;
    }
    const icon = (d, x, y, dl) => `<span class="sn-ico" style="left:${x}%;top:${y}%;--d:${dl}s"><svg ${XMLNS} viewBox="0 0 24 24" aria-hidden="true">${d}</svg></span>`;
    const ICON = {
      note: '<path d="M9 17.5a3 3 0 1 1-2-2.8V5l10-2v11.5a3 3 0 1 1-2-2.8V6.5L9 8z" fill="currentColor"/>',
      bird: '<path d="M3 13c3 0 5-2 7-5 1.5-2 4-3 6-2l3 1-3 1c0 5-4 9-10 9H4l3-2c-2 0-3-1-4-2z" fill="currentColor"/>',
      bell: '<path d="M12 3a5 5 0 0 1 5 5v4l2 3H5l2-3V8a5 5 0 0 1 5-5zm-2 14h4a2 2 0 0 1-4 0z" fill="currentColor"/>',
      voice: '<path d="M4 6h16v9H9l-4 3v-3H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 10h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    };
    let ticks = '';
    for (let x = 18; x <= 222; x += 12) ticks += `M${x} 138 v${x % 36 === 18 ? 4 : 2} `;
    const base = `<g fill="none" style="stroke:var(--c-line2)" stroke-width=".7"><path d="M14 44 H226 M14 136 H226" stroke-dasharray="1.4 4"/><path d="${ticks}"/></g>
      <path d="M14 90 H226" style="stroke:var(--c-line2)" stroke-width=".8" opacity=".7"/>
      <g style="fill:var(--c-muted)" font-family="'JetBrains Mono',Consolas,monospace" font-size="5.4" opacity=".75"><text x="14" y="150">20 Hz</text><text x="226" y="150" text-anchor="end">20 kHz</text></g>
      <path d="${sparkle(206, 152, 2.2)} ${sparkle(150, 22, 2)}" style="fill:var(--c-acc2)" opacity=".7"/>`;
    const Lr = (l) => ly(W, Hh, l);
    const layers = [
      // 音柱沿中线上下对称伸缩（像波形），外层的高度由“听力”决定，内层循环跳动
      Lr({ x: 18, y: 48, w: 204, h: 84, cls: 'sn-bars', html: bars }),
      Lr({ x: -6, y: 2, w: 42, h: 38, cls: 'sn-ring', html: '<i></i><i></i>' }),
      // 助听器：戴上时指示灯亮起
      Lr({ x: 4, y: 8, w: 24, h: 26, cls: 'sn-aid', svg: `<g transform="translate(6 10) scale(.72) translate(-6 -107)"><g stroke="#3a2a34" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">
        <path d="M14 108 C8 108 6 114 7 120 C8 127 12 132 16 134 C19 135.5 21 133 20 130 C18 124 18 118 21 113 C23 109.5 19 107.6 14 108 Z" fill="#f3e7ee"/>
        <path d="M20.4 111 C25 110 29 113 29 118" fill="none" stroke="#b9a7b3" stroke-width="1.6"/>
        <ellipse cx="29" cy="120" rx="2.6" ry="3.2" fill="#e6d8e2"/>
        <path d="M10 114 C10 112 12 111 14 111.4" fill="none" stroke="#fff" stroke-width="1" opacity=".8"/></g>
        <circle cx="12.6" cy="119" r="1.5" fill="#7a6a74"/></g>` }),
      Lr({ x: 8.15, y: 16.04, w: 5.2, h: 5.2, cls: 'sn-led', html: '<i></i>' }),
      Lr({ x: 38, y: 8, w: 110, h: 44, cls: 'sn-icons', html: icon(ICON.note, 4, 46, 0) + icon(ICON.voice, 26, 26, -1.1) + icon(ICON.bird, 50, 40, -2.2) + icon(ICON.bell, 74, 20, -3.3) }),
      Lr({ x: 150, y: 44, w: 80, h: 90, cls: 'sn-ash pm', html: motes(12, 23, (Rr) => ({ x: r(10 + Rr() * 80), y: r(20 + Rr() * 60), s: r(0.6 + Rr()), d: -Rr() * 6, t: 5 + Rr() * 3, dx: r(10 + Rr() * 30) + 'px', dy: r(-20 - Rr() * 30) + 'px' })) }),
      Lr({ x: 160, y: 8, w: 70, h: 20, cls: 'sn-tag', html: '<b class="off">−dB · · ·</b><b class="on">助听器 · ON</b>' }),
    ];
    return scene('sound', W, Hh, { base, layers: [...layers, hs(W, Hh, 10, 36, 220, 100, 'aid', '戴上助听器')] });
  }

  /* ====================================================================
   * I-6 前辈：前辈生日的熔岩蛋糕。蜡烛可以吹灭（再点一下重新点亮）
   * ==================================================================== */
  function cake() {
    const W = 240, Hh = 160, ink = '#3b221b';
    const id = { plate: nid('kp'), cake: nid('kc'), molten: nid('km'), flame: nid('kf'), fglow: nid('kg'), pool: nid('kpg'), clip: nid('kcl'), leaf: nid('kl') };
    const R = rng(21);
    let sugar = '';
    for (let i = 0; i < 26; i++) { const a = R() * TAU, d = Math.sqrt(R()); sugar += `<circle cx="${r(58 + Math.cos(a) * 22 * d)}" cy="${r(60 + Math.sin(a) * 5.2 * d)}" r="${r(0.35 + R() * 0.55)}"/>`; }
    const poolPts = [];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, w = 1 + 0.12 * Math.sin(i * 2.7) + (Math.sin(a) > 0.3 ? 0.1 : 0); poolPts.push([60 + Math.cos(a) * 27 * w, 92.4 + Math.sin(a) * 6.6 * w]); }
    const lava = `<path d="${H.splineClosed(poolPts)}"/>` +
      '<path d="M48.2 63.4 C51.6 67.4 64.4 67.4 67.8 63.4 C69 70 66.6 74.4 66.4 80 C66.2 84 68.6 86.6 70.6 90 L45.4 90 C47.4 86.6 49.8 84 49.6 80 C49.4 74 47.2 70 48.2 63.4Z"/>' +
      '<path d="M39.6 68 C41.6 72 42.2 76 41.4 79 C40.8 81.2 38.4 81.2 38.4 78.6 C38.4 75 39 72 39.6 68Z"/>' +
      '<path d="M75 69.4 C76.2 72 76.4 74.4 75.8 76.2 C75.3 77.6 73.6 77.6 73.6 75.8 C73.6 73.8 74.2 71.6 75 69.4Z"/>';
    const berry = [[22, 90], [25, 88], [25.2, 91.6], [28, 89.4], [22.4, 93.4], [27.6, 93], [19.6, 91.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3"/>`).join('');
    // 蛋糕按 120×120 画，放进 240×160：以 (56, 14) 为原点放大 1.12 倍
    const T = (x, y) => [48 + x * 1.3, -2 + y * 1.3];
    const defs = `<defs>
      <linearGradient id="${id.plate}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#ffffff')}${stop(1, '#ddd6cf')}</linearGradient>
      <linearGradient id="${id.cake}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#2e120b')}${stop(0.3, '#6b3120')}${stop(0.7, '#4a2014')}${stop(1, '#26100a')}</linearGradient>
      <linearGradient id="${id.molten}" gradientUnits="userSpaceOnUse" x1="0" y1="62" x2="0" y2="101">${stop(0, '#ffc15a')}${stop(0.45, '#ff6a26')}${stop(0.8, '#b8321a')}${stop(1, '#6a220f')}</linearGradient>
      <radialGradient id="${id.pool}">${stop(0, '#ff6a26', 0.45)}${stop(1, '#ff6a26', 0)}</radialGradient>
      <linearGradient id="${id.leaf}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#a8e0b2')}${stop(1, '#4f9468')}</linearGradient>
      <clipPath id="${id.clip}"><rect x="65.5" y="36" width="5" height="24" rx="1.6"/></clipPath>
    </defs>`;
    const card = `<g transform="rotate(-8 30 58)">
      <path d="M8 40 h44 v34 h-44 Z" fill="#fffaf2" stroke="${ink}" stroke-width="1.1"/>
      <path d="M8 40 l22 14 l22 -14" fill="none" stroke="${ink}" stroke-width=".8" opacity=".4"/>
      <path d="M26 64 C22.4 61 22.4 57.6 25 57.6 C26 57.6 26.6 58.4 26.6 59 C26.6 58.4 27.2 57.6 28.2 57.6 C30.8 57.6 30.8 61 27.2 64Z" style="fill:var(--c-acc)"/>
      <text x="30" y="71" text-anchor="middle" font-family="'Segoe Print','Bradley Hand','Comic Sans MS',cursive" font-size="4.6" fill="#6b3a2a">for senpai</text></g>`;
    const base = `<ellipse cx="128" cy="141" rx="70" ry="5" fill="#000" opacity=".22"/>
    ${card}
    <g transform="translate(48 -2) scale(1.3)" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="60" cy="94" rx="50" ry="13.5" fill="url(#${id.plate})" stroke="${ink}" stroke-width="1.6"/>
      <ellipse cx="60" cy="92.6" rx="38" ry="9.2" fill="#f3eee8" stroke="#c9bfb4" stroke-width=".8"/>
      <ellipse cx="60" cy="94" rx="45" ry="12" fill="none" style="stroke:var(--c-acc2)" stroke-width=".9" stroke-dasharray="2 3" opacity=".7"/>
      <ellipse cx="64" cy="96" rx="30" ry="8" fill="url(#${id.pool})"/>
      <path d="M33 60 C33 55 83 55 83 60 L81 86 C80 91.4 36 91.4 35 86 Z" fill="url(#${id.cake})" stroke="${ink}" stroke-width="1.6"/>
      <path d="M36 70 Q40 72 44 70 M72 74 Q76 76 80 73 M38 80 Q41 81.6 44 80" fill="none" stroke="#1d0906" stroke-width=".8" opacity=".6"/>
      <ellipse cx="58" cy="60" rx="25" ry="6.2" fill="#7a3a24" stroke="${ink}" stroke-width="1.4"/>
      <ellipse cx="56" cy="59.4" rx="17" ry="3.6" fill="#ffffff" opacity=".22"/>
      <g fill="#ffffff" opacity=".9">${sugar}</g>
      <g stroke="#2a0f08" stroke-width="2.8" fill="#2a0f08">${lava}</g>
      <g fill="url(#${id.molten})">${lava}</g>
      <path d="M49 63.6 C53 61.2 63 61.2 67 63.6" fill="none" stroke="#3a150b" stroke-width="1.6"/>
      <path d="M52 67.8 Q54 71 53.4 78" fill="none" stroke="#fff5d6" stroke-width="1.3" opacity=".85"/>
      <path d="M40 94.6 Q52 99 70 98.4" fill="none" stroke="#fff5d6" stroke-width="1" opacity=".55"/>
      <path d="M22 84 C18 78 22 74 28 76 C30 80 27 84 22 84Z M29 84 C30 78 35 76 38 80 C36 84 33 85 29 84Z" fill="url(#${id.leaf})" stroke="#2f6a45" stroke-width=".9"/>
      <g fill="#d8385a" stroke="#7a1430" stroke-width=".6">${berry}</g>
      <rect x="65.5" y="36" width="5" height="24" rx="1.6" fill="#fffaf2"/>
      <g clip-path="url(#${id.clip})" style="stroke:var(--c-acc)" stroke-width="1.8" fill="none"><path d="M64 42 L72 36 M64 48 L72 42 M64 54 L72 48 M64 60 L72 54"/></g>
      <rect x="65.5" y="36" width="5" height="24" rx="1.6" fill="none" stroke="${ink}" stroke-width="1.2"/>
      <path d="M65.6 37.4 Q66.4 41 67.2 38 Q68 36.6 69 37" fill="#fffaf2" stroke="${ink}" stroke-width=".7"/>
      <path d="M68 36 L68 32.6" stroke="#2b1a12" stroke-width="1.1"/>
    </g>
    <path d="${sparkle(212, 44, 3.4)} ${sparkle(190, 20, 2.4)} ${sparkle(222, 100, 2.2)}" style="fill:var(--c-acc2)" opacity=".85"/>`;
    const [fx, fy] = T(68, 26); // 火苗中心
    const Lr = (l) => ly(W, Hh, l);
    const layers = [
      Lr({ x: fx - 21, y: fy - 21, w: 42, h: 42, cls: 'ck-glow', html: '<i></i>' }),
      Lr({ x: fx - 7, y: fy - 11, w: 14, h: 21, o: [fx, fy + 9], cls: 'ck-flame', wrap: ['fk'],
        defs: `<defs><linearGradient id="${id.flame}" x1="0" y1="1" x2="0" y2="0">${stop(0, '#ffd36b')}${stop(1, '#ff5b1f')}</linearGradient></defs>`,
        svg: `<g transform="translate(48 -2) scale(1.3)"><path d="M68 19.6 C72.2 24.6 73.4 29 71.6 31.6 C70.4 33.4 65.6 33.4 64.4 31.6 C62.8 29 64.2 24.8 68 19.6Z" fill="url(#${id.flame})"/><path d="M68 25.4 C69.6 28 70 30 69.2 31.2 C68.6 32 67.4 32 66.8 31.2 C66 30 66.4 28 68 25.4Z" fill="#fff6d6"/></g>` }),
      Lr({ x: fx - 10, y: fy - 34, w: 22, h: 34, cls: 'ck-smoke', svg: `<path d="M${r(fx)} ${r(fy - 2)} q-4 -5 0 -10 q4 -5 0 -10 q-4 -5 0 -10" fill="none" style="stroke:var(--c-muted)" stroke-width="1.4" stroke-linecap="round"/>` }),
      Lr({ x: 96, y: 50, w: 30, h: 30, cls: 'ck-steam', svg: `<g fill="none" style="stroke:var(--c-muted)" stroke-width="1.1" stroke-linecap="round" opacity=".6"><path d="M${r(T(42, 50)[0])} ${r(T(42, 50)[1])} q-2 -3 0 -6 q2 -3 0 -6"/><path d="M${r(T(50, 46)[0])} ${r(T(50, 46)[1])} q-2 -3 0 -6 q2 -3 0 -6"/></g>` }),
      Lr({ x: 150, y: 10, w: 84, h: 22, cls: 'ck-wish', html: '<b>生日快乐，前辈～</b>' }),
    ];
    return scene('cake', W, Hh, { defs, base, layers: [...layers, hs(W, Hh, fx - 16, fy - 22, 32, 62, 'candle', '蜡烛')] });
  }

  /* ====================================================================
   * I-7 学者之心：古火山地带的外勤。落石、热感弧、仪器读数（点一下：感知热量，击碎落石）
   * ==================================================================== */
  function field() {
    const W = 240, Hh = 160, ink = '#1f161b';
    const id = { rock: nid('fr'), lava: nid('fl'), cry: nid('fc'), metal: nid('fm'), halo: nid('fh') };
    const crystal = (cx, by, h, w, rot) => {
      const p = [[0, 0], [w / 2, -h * 0.14], [w / 2, -h * 0.78], [0, -h], [-w / 2, -h * 0.78], [-w / 2, -h * 0.14]];
      return `<g transform="translate(${cx} ${by}) rotate(${rot})"><polygon points="${pts(p)}" fill="url(#${id.cry})" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<path d="M0 -1 V${r(-h + 1)} M${r(w / 2)} ${r(-h * 0.78)} L0 ${r(-h * 0.62)} L${r(-w / 2)} ${r(-h * 0.78)}" fill="none" style="stroke:var(--c-acc)" stroke-width=".8" opacity=".8"/>` +
        `<path d="M${r(-w / 2 + 1.2)} ${r(-h * 0.2)} V${r(-h * 0.7)}" stroke="#fff" stroke-width=".8" opacity=".35"/></g>`;
    };
    const arc = 'M44 80 Q120 8 200 68';
    const defs = `<defs>
      <linearGradient id="${id.rock}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#6d5c64')}${stop(0.45, '#3c2f36')}${stop(1, '#1d1519')}</linearGradient>
      <linearGradient id="${id.lava}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#fff0c8')}${vstop(0.45, '--c-acc2')}${vstop(1, '--c-acc3')}</linearGradient>
      <linearGradient id="${id.cry}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#5a4f66')}${stop(0.5, '#241c2c')}${stop(1, '#0e0a12')}</linearGradient>
      <linearGradient id="${id.metal}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#8d97a3')}${stop(0.5, '#ffffff')}${stop(1, '#8d97a3')}</linearGradient>
    </defs>`;
    const base = `<ellipse cx="121" cy="150" rx="102" ry="5" fill="#000" opacity=".22"/>
    <path d="${arc}" fill="none" style="stroke:var(--c-acc2)" stroke-width="8" stroke-linecap="round" opacity=".14"/>
    <path d="${arc}" fill="none" style="stroke:var(--c-acc2)" stroke-width="2" stroke-linecap="round" stroke-dasharray="12 6"/>
    <path d="M49 82 Q120 15 195 70" fill="none" stroke="#fff" stroke-width=".7" stroke-dasharray="2 5" opacity=".55"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 128 C30 116 52 112 70 114 C90 108 110 112 128 110 C150 106 176 112 196 110 C210 112 222 120 224 130 L214 142 C170 148 80 148 26 142 Z" fill="url(#${id.rock})" stroke="${ink}" stroke-width="1.6"/>
      <path d="M26 118 C48 112 66 114 72 116 M128 111 C150 107 176 113 196 111" fill="none" stroke="#fff" stroke-width=".9" opacity=".18"/>
      <path d="M30 133 C80 138 160 136 214 131" fill="none" stroke="#000" stroke-width="1" opacity=".3"/>
      <path d="M84 113 L90 122 L86 131 L93 141 M170 110 L164 121 L171 130 L168 141" fill="none" style="stroke:var(--c-acc2)" stroke-width="5" opacity=".3"/>
      <path d="M84 113 L90 122 L86 131 L93 141 M170 110 L164 121 L171 130 L168 141 M90 122 L100 126" fill="none" stroke="url(#${id.lava})" stroke-width="1.9"/>
      ${crystal(46, 118, 26, 9, -12)}${crystal(56, 116, 34, 11, 4)}${crystal(66, 118, 20, 8, 18)}
      <ellipse cx="56" cy="117" rx="18" ry="3" style="fill:var(--c-acc)" opacity=".25"/>
      <rect x="156.5" y="80" width="3.4" height="34" fill="url(#${id.metal})" stroke="${ink}" stroke-width=".9"/>
      <path d="M176 58 L180 44" stroke="${ink}" stroke-width="1.2"/><circle cx="180.4" cy="43" r="2" style="fill:var(--c-acc)" stroke="${ink}" stroke-width=".8"/>
      <rect x="140" y="58" width="40" height="25" rx="3.4" fill="#ebe6de" stroke="${ink}" stroke-width="1.5"/>
      <rect x="144" y="62" width="24" height="15" rx="1.6" fill="#15241f" stroke="${ink}" stroke-width=".9"/>
      <path d="M171 73 h6 M171 76.5 h6" stroke="${ink}" stroke-width=".8" opacity=".6"/>
      <g transform="rotate(8 206 104)"><rect x="203" y="92" width="6" height="18" rx="2.6" fill="#fff" fill-opacity=".55" stroke="${ink}" stroke-width="1"/><rect x="203.6" y="101" width="4.8" height="8.4" rx="2" style="fill:var(--c-acc)" opacity=".85"/><rect x="202.2" y="90.4" width="7.6" height="3" rx="1" fill="#3b4250"/></g>
      <g transform="rotate(-6 196 106)"><rect x="193" y="95" width="6" height="15" rx="2.6" fill="#fff" fill-opacity=".55" stroke="${ink}" stroke-width="1"/><rect x="193.6" y="103" width="4.8" height="6.4" rx="2" fill="#7dffb0" opacity=".8"/><rect x="192.2" y="93.4" width="7.6" height="3" rx="1" fill="#3b4250"/></g>
    </g>
    <path d="${sparkle(24, 40, 3)} ${sparkle(222, 30, 3.6)}" style="fill:var(--c-acc2)" opacity=".8"/>`;
    const rockD = 'M-5 -3 L-1 -6.2 L5 -4.4 L6.4 1 L2.4 5.4 L-4.2 4.4 Z';
    const rock = (x, y, s, cls) => ly(W, Hh, { x: x - 8 * s, y: y - 8 * s, w: 16 * s, h: 16 * s, cls: 'fd-rock ' + cls, svg: `<g transform="translate(${x} ${y}) scale(${s})"><path d="${rockD}" fill="#6a5a62" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/></g>` });
    const flash = (x, y, cls) => ly(W, Hh, { x: x - 7, y: y - 7, w: 14, h: 14, cls: 'fd-flash ' + cls, svg: `<path d="${sparkle(x, y, 6)}" fill="#fff" style="stroke:var(--c-acc2)" stroke-width=".8"/>` });
    let wave = 'M0 7.5';
    for (let k = 0; k < 2; k++) { const o = k * 24; wave += ` L${o + 3} 7.5 L${o + 5} 2 L${o + 7} 11 L${o + 9} 4.5 L${o + 11} 7.5 L${o + 14} 7.5 L${o + 16} 3.5 L${o + 18} 7.5 L${o + 24} 7.5`; }
    const Lr = (l) => ly(W, Hh, l);
    const layers = [
      Lr({ x: 29, y: 10, w: 184, h: 88, cls: 'fd-halo', defs: `<defs>${glowGrad(id.halo, '--c-acc2', 0.4)}</defs>`, svg: `<ellipse cx="121" cy="54" rx="92" ry="44" fill="url(#${id.halo})"/>` }),
      rock(90, 6, 1.1, 'r1'), rock(160, 4, 1.25, 'r2'), rock(124, -2, 0.8, 'r3'),
      flash(90, 46, 'f1'), flash(160, 48, 'f2'), flash(123, 40, 'f3'),
      Lr({ x: 144, y: 62, w: 24, h: 15, cls: 'fd-screen', html: `<div class="sc"><svg ${XMLNS} viewBox="0 0 48 15" preserveAspectRatio="none" aria-hidden="true"><path d="${wave}" fill="none" stroke="#7dffb0" stroke-width="1" vector-effect="non-scaling-stroke"/></svg></div>` }),
      Lr({ x: 171.9, y: 63.9, w: 4.2, h: 4.2, cls: 'fd-led', html: '<i></i>' }),
      ...[[90, 108, 0], [167, 106, 1], [128, 104, 2]].map(([x, y, d]) => Lr({ x: x - 5, y: y - 32, w: 10, h: 34, cls: 'fd-heat', style: `--d:${-d}s;`, svg: `<path d="M${x} ${y} q-3 -5 0 -10 q3 -5 0 -10 q-3 -5 0 -10" fill="none" style="stroke:var(--c-acc)" stroke-width="1.2" stroke-linecap="round"/>` })),
      Lr({ x: 124, y: 44, w: 56, h: 56, cls: 'fd-ping', html: '<i></i><i></i>' }),
      Lr({ x: 150, y: 30, w: 70, h: 16, cls: 'fd-read', html: '<b>ΔT +12.6 °C · 落石</b>' }),
      Lr({ x: 104, y: 10, w: 40, h: 40, cls: 'fd-burst', svg: `<g style="fill:var(--c-acc2)"><path d="${sparkle(124, 30, 14)}"/></g><g fill="#6a5a62"><circle cx="112" cy="22" r="2.4"/><circle cx="136" cy="20" r="1.8"/><circle cx="116" cy="40" r="1.6"/><circle cx="134" cy="38" r="2.2"/></g>` }),
    ];
    return scene('field', W, Hh, { defs, base, layers: [...layers, hs(W, Hh, 20, 20, 200, 120, 'sense', '感知热量')] });
  }

  /* ====================================================================
   * I-8 阿黛尔·瑙曼：北方荒原的阴天黄昏。拱窗里的远山与云，窗前的提灯和笔记本（翻开会写出她的名字）
   * ==================================================================== */
  function camp() {
    const W = 240, Hh = 160, ink = '#1b1522';
    const id = { clip: nid('cc'), sky: nid('cs'), sun: nid('csn'), lamp: nid('cl'), cover: nid('ccv'), fog: nid('cf') };
    const arch = 'M40 146 V58 A80 52 0 0 1 200 58 V146 Z';
    const tuft = (x, y) => `<path d="M${x} ${y} l-3 -6 M${x} ${y} l0 -8 M${x} ${y} l3 -6 M${x} ${y} l5 -4" />`;
    const defs = `<defs>
      <clipPath id="${id.clip}"><path d="${arch}"/></clipPath>
      <linearGradient id="${id.sky}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#2b2a42')}${stop(0.45, '#57506a')}${stop(0.78, '#a07a80')}${stop(1, '#c98f7e')}</linearGradient>
      <radialGradient id="${id.sun}">${stop(0, '#ffe2c0', 0.9)}${stop(0.35, '#ffb38a', 0.45)}${stop(1, '#ffb38a', 0)}</radialGradient>
      <radialGradient id="${id.lamp}">${stop(0, '#ffd88a', 0.6)}${stop(1, '#ffd88a', 0)}</radialGradient>
      <linearGradient id="${id.cover}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#8a4a44')}${stop(1, '#4e2426')}</linearGradient>
      <linearGradient id="${id.fog}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#cbb3b4', 0)}${stop(1, '#cbb3b4', 0.45)}</linearGradient>
    </defs>`;
    const base = `<ellipse cx="120" cy="149" rx="100" ry="4.5" fill="#000" opacity=".22"/>
    <g clip-path="url(#${id.clip})">
      <rect x="36" y="0" width="168" height="150" fill="url(#${id.sky})"/>
      <circle cx="84" cy="104" r="34" fill="url(#${id.sun})"/>
      <path d="M40 92 C70 86 110 96 150 88 C170 84 190 90 204 86 V120 H40 Z" fill="url(#${id.fog})"/>
      <path d="M62 126 L106 84 L114 79 L126 79 L134 85 L180 126 Z" fill="#2d2434"/>
      <path d="M106 84 L114 79 L126 79 L134 85" fill="none" stroke="#9a7a86" stroke-width="1"/>
      <path d="M114 80 C110 92 104 100 96 112" fill="none" stroke="#6a4a5a" stroke-width="1"/>
      <path d="M36 118 C60 112 84 118 110 114 C140 110 170 118 204 112 V150 H36 Z" fill="#231c28"/>
      <path d="M36 122 C70 115 96 127 130 121 C160 116 182 123 204 118 V150 H36 Z" fill="#17121b"/>
      <g fill="none" stroke="#352a36" stroke-width="1.1" stroke-linecap="round">${tuft(58, 128)}${tuft(170, 124)}${tuft(188, 128)}${tuft(98, 130)}</g>
      <g fill="none" stroke="#2a2030" stroke-width=".9" stroke-linecap="round"><path d="M150 60 q3 -2.4 6 0 q3 -2.4 6 0"/><path d="M166 52 q2.4 -2 4.8 0 q2.4 -2 4.8 0"/></g>
      <path d="${arch}" fill="none" style="stroke:var(--c-acc)" stroke-width="3" opacity=".3"/>
    </g>
    <path d="${arch}" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      <path d="M65 108 Q72 98 79 108" fill="none" stroke="${ink}" stroke-width="1.5"/>
      <path d="M63 111 L81 111 L78 107 L66 107 Z" fill="#4a3a3a" stroke="${ink}" stroke-width="1.2"/>
      <rect x="63.5" y="111" width="17" height="24" rx="2" fill="#fff3c8" fill-opacity=".8" stroke="${ink}" stroke-width="1.3"/>
      <path d="M68 111 V135 M76 111 V135" stroke="${ink}" stroke-width=".8" opacity=".55"/>
      <rect x="61.5" y="135" width="21" height="6.5" rx="1.6" fill="#4a3a3a" stroke="${ink}" stroke-width="1.2"/>
      <path d="M186 146 L208 126" stroke="${ink}" stroke-width="4"/><path d="M186 146 L208 126" stroke="#e8b54e" stroke-width="2.4"/>
      <path d="M208 126 L212 122.6" stroke="#f3d2a8" stroke-width="2.4"/><path d="M211.2 123.3 L212.8 122" stroke="#333" stroke-width="1.4"/>
      <path d="M104 146 L108 140 L115 139 L118 144 Z M92 147 L95 143 L100 143.5 L101 147 Z" fill="#5a4a52" stroke="${ink}" stroke-width="1"/>
    </g>
    <path d="${sparkle(24, 30, 3.4)} ${sparkle(218, 22, 2.8)} ${sparkle(222, 96, 2.2)}" style="fill:var(--c-acc2)" opacity=".85"/>`;
    const cloud = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}"><ellipse cx="0" cy="0" rx="26" ry="5"/><ellipse cx="-10" cy="-3" rx="12" ry="5"/><ellipse cx="8" cy="-4" rx="14" ry="6"/></g>`;
    const Lr = (l) => ly(W, Hh, l);
    const closed = `<g transform="rotate(-9 156 132)" stroke-linecap="round" stroke-linejoin="round">
        <rect x="128" y="120" width="56" height="25" rx="2.4" fill="#e9dcc2" stroke="${ink}" stroke-width="1.2" transform="translate(2 2)"/>
        <rect x="128" y="120" width="56" height="25" rx="2.4" fill="url(#${id.cover}b)" stroke="${ink}" stroke-width="1.4"/>
        <path d="M177 120 V145" stroke="#1b1522" stroke-width="1.8"/>
        <rect x="132" y="126" width="41" height="11" rx="1" fill="#f5ead2" stroke="${ink}" stroke-width=".8"/>
        <path d="${scribble(136, 132, 30, 81, 0.9)}" fill="none" stroke="#3a2620" stroke-width=".7"/></g>`;
    const layers = [
      // 窗里的云：一层圆角遮罩（border-radius 近似拱顶），里面两条云带缓缓漂移
      Lr({ x: 40, y: 6, w: 160, h: 112, cls: 'cp-win', html:
        `<div class="cp-clouds a"><svg ${XMLNS} viewBox="0 0 320 112" aria-hidden="true">${cloud(40, 30, 1, '#6a6078')}${cloud(150, 18, 1.3, '#5d556e')}${cloud(250, 40, 0.9, '#6a6078')}${cloud(200, 62, 0.7, '#8a7088')}${cloud(80, 58, 0.8, '#8a7088')}</svg></div>` +
        `<div class="cp-clouds b"><svg ${XMLNS} viewBox="0 0 320 112" aria-hidden="true">${cloud(20, 70, 0.9, '#a08090')}${cloud(130, 46, 0.75, '#7a6a80')}${cloud(260, 20, 1.1, '#5d556e')}</svg></div>` +
        `<div class="cp-smoke">${[0, 1, 2, 3].map((i) => `<i style="--d:${-i * 1.1}s"></i>`).join('')}</div>` }),
      Lr({ x: 40, y: 92, w: 64, h: 64, cls: 'cp-lamp', defs: `<defs><radialGradient id="${id.lamp}b">${stop(0, '#ffd88a', 0.55)}${stop(1, '#ffd88a', 0)}</radialGradient></defs>`, svg: `<circle cx="72" cy="124" r="32" fill="url(#${id.lamp}b)"/>` }),
      Lr({ x: 68, y: 117, w: 8, h: 15, o: [72, 131], cls: 'cp-flame', wrap: ['fk'], svg: `<path d="M72 131 C68.6 127 70 122 72 118.5 C74 122 75.4 127 72 131 Z" fill="#ffb347" stroke="#c0601a" stroke-width=".6"/><path d="M72 130 C70.6 128 71.2 125.6 72 124 C72.8 125.6 73.4 128 72 130 Z" fill="#fff6d0"/>` }),
      Lr({ x: 124, y: 112, w: 66, h: 40, cls: 'cp-closed', defs: `<defs><linearGradient id="${id.cover}b" x1="0" y1="0" x2="1" y2="1">${stop(0, '#8a4a44')}${stop(1, '#4e2426')}</linearGradient></defs>`, svg: closed }),
      // 翻开的笔记本：左页是火山速写，右页写着她的名字（一道遮挡从左往右滑开，像在书写）
      Lr({ x: 96, y: 58, w: 124, h: 86, cls: 'cp-open', html:
        `<svg ${XMLNS} viewBox="96 58 124 86" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round">
          <path d="M100 66 Q130 60 158 68 Q186 60 216 66 L216 138 Q186 132 158 140 Q130 132 100 138 Z" fill="#4e2426" stroke="${ink}" stroke-width="1.4"/>
          <path d="M103 67 Q130 62 157 69 L157 136 Q130 130 103 135 Z" fill="#fbf3e2" stroke="${ink}" stroke-width="1"/>
          <path d="M159 69 Q186 62 213 67 L213 135 Q186 130 159 136 Z" fill="#fffaf0" stroke="${ink}" stroke-width="1"/>
          <path d="M110 118 L124 94 L128 91 L133 91 L137 95 L150 118" fill="none" stroke="#6b4a3a" stroke-width="1"/>
          <path d="M128 90 q-3 -5 1 -9 q4 -4 1 -8" fill="none" stroke="#6b4a3a" stroke-width=".8" opacity=".7"/>
          <path d="M112 124 h36 M114 128 h30" stroke="#b3a08c" stroke-width=".7"/>
          <path d="M163 80 h40 M163 86 h36" stroke="#e0d2bb" stroke-width=".6"/>
        </g></svg>` +
        '<div class="cp-name"><b>Adele Naumann</b><span>阿黛尔 · 瑙曼</span><i></i></div>' }),
      Lr({ x: 176, y: 30, w: 60, h: 70, cls: 'cp-hum', html: ['♪', '♫', '♪'].map((n, i) => `<i style="--d:${-i * 1.6}s;left:${20 + i * 22}%">${n}</i>`).join('') }),
    ];
    return scene('camp', W, Hh, { defs, base, layers: [...layers, hs(W, Hh, 124, 110, 70, 42, 'book', '翻开笔记本'), hs(W, Hh, 56, 100, 32, 44, 'book', '提灯')] });
  }

  /* ====================================================================
   * II-1 汐斯塔的邀请：凯勒老师的邀请函、博物馆明信片、票根；
   * 五只几乎看不见的粉色小羊藏在各处（找到它们），多利巨大的身影在背后若隐若现
   * ==================================================================== */
  function invite() {
    const W = 240, Hh = 160, ink = '#3a3552';
    const id = { sky: nid('is'), paper: nid('ip'), seal: nid('isl'), dolly: nid('idl'), wool: nid('iw'), face: nid('if'), horn: nid('ih'), sea: nid('isea') };
    const ids = { wool: id.wool, face: id.face, horn: id.horn };
    const R = rng(51);
    let dolly = '';
    for (let i = 0; i < 22; i++) { const a = R() * TAU, d = Math.sqrt(R()); dolly += `<circle cx="${r(196 + Math.cos(a) * 40 * d)}" cy="${r(36 + Math.sin(a) * 26 * d)}" r="${r(9 + R() * 10)}"/>`; }
    const hand = [[140, 62, 60, 5], [140, 70, 66, 6], [140, 78, 54, 7], [140, 86, 62, 8], [140, 94, 40, 9]].map(([x, y, w, s]) => `<path d="${scribble(x, y, w, s, 1.2)}"/>`).join('');
    const defs = `<defs>
      <linearGradient id="${id.sky}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#8fc3ee')}${stop(0.7, '#d9ecfb')}${stop(1, '#fff3e6')}</linearGradient>
      <linearGradient id="${id.sea}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#7cc0ea')}${stop(1, '#4f9fe0')}</linearGradient>
      <linearGradient id="${id.paper}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#fffdf8')}${stop(1, '#f1e8d8')}</linearGradient>
      <radialGradient id="${id.seal}" cx=".38" cy=".34" r=".8">${stop(0, '#c4d6f6')}${stop(1, '#4a66a8')}</radialGradient>
      <radialGradient id="${id.dolly}" cx=".45" cy=".4" r=".7">${stop(0, '#ffe3ee')}${stop(1, '#f39dbd')}</radialGradient>
    </defs>`;
    const base = `<g opacity=".3"><g fill="url(#${id.dolly})">${dolly}</g>
        <path d="M184 20 l-3 -12 l4 7 l2 -10 l2 10 l4 -7 l-3 12 Z M204 22 l-2 -11 l4 6 l2 -9 l2 9 l3 -6 l-3 11 Z" fill="#2a2433"/>
        <ellipse cx="196" cy="40" rx="9" ry="7.6" fill="#3a3040"/><circle cx="199" cy="39" r="1.8" fill="#f6c98a"/></g>
      <ellipse cx="122" cy="148" rx="100" ry="5" fill="#6b6884" opacity=".16"/>
      <g stroke-linecap="round" stroke-linejoin="round">
        <g transform="rotate(-6 70 72)">
          <rect x="16" y="30" width="110" height="80" rx="2" fill="#ffffff" stroke="${ink}" stroke-width="1.3"/>
          <rect x="21" y="35" width="100" height="62" fill="url(#${id.sky})"/>
          <circle cx="44" cy="50" r="7" fill="#fffbea" opacity=".95"/>
          <path d="M60 80 L84 52 L88 50 L94 50 L98 53 L121 76 V97 H60 Z" fill="#b4c1da"/>
          <path d="M84 52 L88 50 L94 50 L98 53 L96 58 Q91 55 86 58 Z" fill="#ffffff"/>
          <path d="M91 49 q-4 -6 2 -10 q6 -4 2 -10" fill="none" stroke="#ffffff" stroke-width="2.4" opacity=".9"/>
          <rect x="21" y="84" width="100" height="13" fill="url(#${id.sea})"/>
          <path d="M26 88 h10 M50 92 h14 M78 89 h8" stroke="#fff" stroke-width="1" opacity=".8"/>
          <path d="M28 84 V70 H70 V84 Z" fill="#f4f1ea" stroke="${ink}" stroke-width=".9"/>
          <path d="M26 70 L49 60 L72 70 Z" fill="#e6dfd2" stroke="${ink}" stroke-width=".9"/>
          <path d="M33 72 V83 M39 72 V83 M45 72 V83 M53 72 V83 M59 72 V83 M65 72 V83" stroke="${ink}" stroke-width=".7" opacity=".6"/>
          <circle cx="49" cy="65.4" r="2" fill="none" stroke="${ink}" stroke-width=".6"/>
          <text x="71" y="105.6" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="5.2" letter-spacing="1.1" fill="${ink}">SIESTA · VOLCANO MUSEUM</text>
        </g>
        <g transform="rotate(5 172 86)">
          <rect x="124" y="42" width="100" height="92" rx="2" fill="url(#${id.paper})" stroke="${ink}" stroke-width="1.3"/>
          <text x="140" y="55" font-family="Georgia,'Times New Roman',serif" font-style="italic" font-size="7" fill="#3a4a6a">Liebe Adele,</text>
          <g fill="none" stroke="#3a4a6a" stroke-width=".8" opacity=".7">${hand}</g>
          <path d="${scribble(176, 112, 34, 12, 1.4)}" fill="none" stroke="#3a4a6a" stroke-width=".9"/>
          <circle cx="210" cy="122" r="8" fill="url(#${id.seal})" stroke="#26345e" stroke-width="1"/>
          <path d="M206 126.6 C207.6 121 211 117.4 215 116.2 C213.6 121 210.6 124.6 206 126.6 Z" fill="none" stroke="#fff" stroke-width=".8" opacity=".8"/>
        </g>
        <g transform="rotate(-10 98 132)">
          <path d="M72 124 h54 v18 h-54 v-5 a4 4 0 0 0 0 -8 Z" fill="#fff6e6" stroke="${ink}" stroke-width="1"/>
          <path d="M112 124 v18" stroke="${ink}" stroke-width=".7" stroke-dasharray="1.4 1.4"/>
          <text x="96" y="135" text-anchor="middle" font-family="Georgia,serif" font-size="4.8" font-weight="700" letter-spacing=".4" fill="#d2334f">ADMIT ONE</text>
          <text x="119" y="135.6" text-anchor="middle" font-family="Georgia,serif" font-size="5" fill="${ink}">No.1</text>
        </g>
      </g>
      <path d="${sparkle(132, 22, 3.4)} ${sparkle(12, 126, 2.6)} ${sparkle(230, 142, 2.2)}" style="fill:var(--c-acc3)" opacity=".85"/>`;
    // 五只小羊：位置（脚底）、缩放、朝向
    const sheep = [[34, 30, 0.62, 1], [226, 44, 0.55, -1], [140, 150, 0.6, 1], [14, 116, 0.5, -1], [178, 138, 0.46, 1]];
    const Lr = (l) => ly(W, Hh, l);
    const layers = sheep.map(([x, y, s, f], i) => Lr({ x: x - 26 * s, y: y - 44 * s, w: 52 * s, h: 48 * s, o: [x, y], cls: `iv-sheep s${i}`, wrap: ['hop'],
      attrs: ` data-i="${i}"`,
      defs: i === 0 ? `<defs>${sheepDefs(ids, PAL.pink)}</defs>` : '',
      svg: `<g transform="translate(${x} ${y}) scale(${r(s * f)} ${s})">${sheepFig(ids, PAL.pink, { eyes: i % 2 ? 'happy' : 'open', phase: i % 2, bow: i === 2 })}</g>` }));
    layers.push(Lr({ x: 150, y: 2, w: 88, h: 16, cls: 'iv-count', html: '<b>找到小羊 <em>0</em> / 5</b>' }));
    const spots = sheep.map(([x, y, s], i) => hs(W, Hh, x - 24 * s, y - 42 * s, 48 * s, 44 * s, 'seek', '看不见的小羊').replace('data-x="seek"', `data-x="seek" data-i="${i}"`));
    return scene('invite', W, Hh, { defs, base, layers: [...layers, ...spots] });
  }

  /* ====================================================================
   * II-3 会浮起来的石头：水碗里上下翻滚、嗞嗞冒泡的浮石；黑曜石；读唇语的气泡（点一下：把浮石放进水里）
   * ==================================================================== */
  function pumice() {
    const W = 240, Hh = 160, ink = '#34304a';
    const id = { water: nid('pw'), glass: nid('pg'), stone: nid('ps'), obs: nid('po'), clip: nid('pc') };
    const bowl = 'M70 70 C66 100 80 136 120 138 C160 136 174 100 170 70';
    let holes = '';
    [[-8, -3, 1.6], [-3, -6, 1.2], [3, -4, 1.7], [9, -2, 1.1], [-10, 2, 1], [6, 2, 1.3], [0, 0, 1], [-5, 4, 0.9], [11, 3, 0.8]].forEach(([x, y, rr]) => { holes += `<ellipse cx="${x}" cy="${y}" rx="${rr}" ry="${r(rr * 0.8)}"/>`; });
    const defs = `<defs>
      <clipPath id="${id.clip}"><path d="${bowl} Z"/></clipPath>
      <linearGradient id="${id.water}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#bfe6ff', 0.75)}${stop(1, '#6fb0e0', 0.8)}</linearGradient>
      <linearGradient id="${id.glass}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#ffffff', 0.55)}${stop(0.5, '#eaf2ff', 0.18)}${stop(1, '#ffffff', 0.45)}</linearGradient>
      <linearGradient id="${id.obs}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#55506c')}${stop(0.45, '#15131c')}${stop(1, '#050507')}</linearGradient>
    </defs>`;
    const base = `<ellipse cx="124" cy="146" rx="98" ry="5" fill="#000" opacity=".16"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 18 H84 Q90 18 90 24 V42 Q90 48 84 48 H56 L48 57 L48 48 H28 Q22 48 22 42 V24 Q22 18 28 18 Z" fill="#fffdf8" stroke="${ink}" stroke-width="1.4"/>
      <path d="M34 33 C38 28 44 27.5 48 30.5 C52 27.5 58 28 62 33 C57 38.5 39 38.5 34 33 Z" style="fill:var(--c-acc)" stroke="#8a2a4a" stroke-width="1"/>
      <path d="M35 33 C42 34.6 54 34.6 61 33" fill="none" stroke="#8a2a4a" stroke-width=".9"/>
      <path d="M40 31 Q44 29.6 46 31" fill="none" stroke="#fff" stroke-width=".8" opacity=".6"/>
      <path d="${bowl} Z" fill="url(#${id.glass})"/>
      <path d="M70 70 A50 9 0 0 1 170 70" fill="none" stroke="${ink}" stroke-width="1.2" opacity=".55"/>
      <g clip-path="url(#${id.clip})"><rect x="60" y="90" width="120" height="52" fill="url(#${id.water})"/></g>
      <ellipse cx="120" cy="90" rx="49" ry="6.5" fill="#dff3ff" fill-opacity=".75" stroke="#7fb7de" stroke-width="1"/>
      <path d="${bowl}" fill="none" stroke="${ink}" stroke-width="1.6"/>
      <path d="M70 70 A50 9 0 0 0 170 70" fill="none" stroke="${ink}" stroke-width="1.6"/>
      <path d="M78 86 C76 104 82 122 96 130" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>
      <path d="M160 82 C162 92 161 100 158 108" fill="none" stroke="#fff" stroke-width="1.2" opacity=".5"/>
      <path d="M186 141 L189 125 L199 116 L213 120 L220 134 L211 142 Z" fill="url(#${id.obs})" stroke="#1a1a22" stroke-width="1.3"/>
      <path d="M189 125 L203 128 L211 142 M199 116 L203 128 L220 134" fill="none" stroke="#9a94c0" stroke-width=".6" opacity=".45"/>
      <path d="M192 124 L199 118.4" stroke="#fff" stroke-width="1.2" opacity=".6"/>
      <g transform="rotate(-12 44 128)">
        <path d="M40 116 L50 116" stroke="${ink}" stroke-width=".8"/>
        <rect x="26" y="118" width="38" height="22" rx="2" fill="#fffdf6" stroke="${ink}" stroke-width="1.2"/>
        <circle cx="30.5" cy="122.5" r="1.3" fill="none" stroke="${ink}" stroke-width=".8"/>
        <text x="46" y="130" text-anchor="middle" font-family="'Noto Serif SC','Songti SC',serif" font-size="8.6" font-weight="700" fill="#3a3354">浮石</text>
        <text x="46" y="136.6" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="4.8" fill="#6a6480">Pumice</text>
      </g>
    </g>
    <path d="${sparkle(212, 60, 3.4)} ${sparkle(100, 16, 2.4)} ${sparkle(226, 100, 2.2)}" style="fill:var(--c-acc2)" opacity=".85"/>`;
    const Lr = (l) => ly(W, Hh, l);
    const layers = [
      Lr({ x: 67, y: 30, w: 18, h: 6, cls: 'pm-dots', html: '<i></i><i></i><i></i>' }),
      // 水里的气泡：一层圆角遮罩（碗的下半部），气泡往上冒
      Lr({ x: 76, y: 92, w: 88, h: 44, cls: 'pm-water pm', html: `<div class="bu">${motes(10, 5, (R) => ({ x: r(25 + R() * 50), y: r(40 + R() * 55), s: r(0.6 + R() * 0.9), d: -R() * 2.4, t: 2 + R() * 1.2 }))}</div>` }),
      Lr({ x: 96, y: 82, w: 48, h: 16, cls: 'pm-ripple', html: '<i></i><i></i><i class="big"></i>' }),
      Lr({ x: 102, y: 74, w: 36, h: 24, o: [120, 87], cls: 'pm-stone', wrap: ['drop', 'bob'],
        defs: `<defs><radialGradient id="${id.stone}" cx=".38" cy=".3" r=".8">${stop(0, '#e6dacb')}${stop(0.6, '#b3a393')}${stop(1, '#7c6c61')}</radialGradient></defs>`,
        svg: `<g transform="translate(120 87)"><path d="M-15 2 C-16 -5 -9 -10.5 -2 -9.5 C5 -11.5 14 -7 15 -1 C16 5 9 8.5 1 8.5 C-6 9.5 -14 7.5 -15 2 Z" fill="url(#${id.stone})" stroke="#5a4c44" stroke-width="1.3"/><g fill="#7a6a60" opacity=".85">${holes}</g><path d="M-9 -6 Q-4 -9 2 -8.4" fill="none" stroke="#fff" stroke-width="1" opacity=".6"/></g>` }),
      Lr({ x: 70, y: 90, w: 100, h: 16, cls: 'pm-front', defs: `<defs><clipPath id="${id.clip}b"><path d="${bowl} Z"/></clipPath></defs>`, svg: `<g clip-path="url(#${id.clip}b)"><rect x="60" y="91.5" width="120" height="14" fill="#9fd0f2" opacity=".35"/></g>` }),
      Lr({ x: 96, y: 64, w: 48, h: 20, cls: 'pm-fizz', svg: `<g fill="none" style="stroke:var(--c-acc2)" stroke-width="1.1" stroke-linecap="round"><path d="M100 80 q-3 -3 -1 -6.5 M140 78 q3 -3 1 -6.5 M112 72 l-1 -4 M129 71 l1.4 -4"/></g>` }),
      Lr({ x: 92, y: 60, w: 56, h: 26, cls: 'pm-splash', html: '<i style="--dx:-18px;--dy:-16px"></i><i style="--dx:-6px;--dy:-24px"></i><i style="--dx:8px;--dy:-22px"></i><i style="--dx:19px;--dy:-14px"></i>' }),
      Lr({ x: 188, y: 112, w: 16, h: 16, cls: 'pm-gleam', svg: `<path d="${sparkle(196, 121, 4.2)}" fill="#fff"/>` }),
      Lr({ x: 142, y: 98, w: 96, h: 12, cls: 'pm-obs', html: '<b>黑曜石 · 记着一次岩浆的来去</b>' }),
    ];
    return scene('pumice', W, Hh, { defs, base, layers: [...layers, hs(W, Hh, 70, 60, 100, 80, 'drop', '把浮石放进水里'), hs(W, Hh, 184, 112, 40, 34, 'obs', '黑曜石')] });
  }

  /* ====================================================================
   * II-4 想要留住的声音：手写标签的录音带（播放时磁带轮转快、带卷此消彼长、标签换成曲名）
   * ==================================================================== */
  function cassette() {
    const W = 240, Hh = 160, ink = '#34304a';
    const id = { shell: nid('csh'), lclip: nid('clc'), roll: nid('crl') };
    const reel = (cx, cy) => {
      let teeth = '', holes = '';
      for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6, p1 = pol(cx, cy, 5.1, a), p2 = pol(cx, cy, 3, a); teeth += `<line x1="${r(p1[0])}" y1="${r(p1[1])}" x2="${r(p2[0])}" y2="${r(p2[1])}"/>`; }
      for (let k = 0; k < 3; k++) { const p = pol(cx, cy, 7, (k * TAU) / 3 + 0.5); holes += `<circle cx="${r(p[0])}" cy="${r(p[1])}" r="1.05"/>`; }
      return `<circle cx="${cx}" cy="${cy}" r="9" fill="#fbf8f3" stroke="${ink}" stroke-width="1.4"/><circle cx="${cx}" cy="${cy}" r="5.4" fill="#2a2433"/><g stroke="#fbf8f3" stroke-width="1.5" stroke-linecap="round">${teeth}</g><g style="fill:var(--c-acc3)">${holes}</g>`;
    };
    const screw = (x, y) => `<circle cx="${x}" cy="${y}" r="2.8" fill="#dcdfe7" stroke="${ink}" stroke-width=".9"/><path d="M${r(x - 1.6)} ${r(y - 1.6)} L${r(x + 1.6)} ${r(y + 1.6)} M${r(x - 1.6)} ${r(y + 1.6)} L${r(x + 1.6)} ${r(y - 1.6)}" stroke="${ink}" stroke-width=".7"/>`;
    const defs = `<defs>
      <linearGradient id="${id.shell}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#fdfcfa')}${stop(1, '#e2e5ee')}</linearGradient>
      <clipPath id="${id.lclip}"><rect x="46" y="40" width="148" height="64" rx="5"/></clipPath>
    </defs>`;
    const base = `<ellipse cx="120" cy="146" rx="84" ry="5" fill="#000" opacity=".18"/>
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
      <circle cx="59" cy="80" r="7.5" fill="none" stroke="${ink}" stroke-width="1.2"/>
      <text x="59" y="83.6" text-anchor="middle" font-family="'Segoe UI',Arial,sans-serif" font-size="10" font-weight="700" fill="${ink}">A</text>
      <path d="M181 85 C175.6 80.8 175.6 75.6 179 75.6 C180.4 75.6 181 76.8 181 77.6 C181 76.8 181.6 75.6 183 75.6 C186.4 75.6 186.4 80.8 181 85Z" fill="none" style="stroke:var(--c-acc)" stroke-width="1.3"/>
      <rect x="72" y="66" width="96" height="28" rx="14" fill="#2c2636"/>
      <path d="M78 134 L86 113 L154 113 L162 134" fill="#e7e8ef" stroke="${ink}" stroke-width="1.6"/>
      <circle cx="98" cy="125" r="3.4" fill="#2a2433"/><circle cx="142" cy="125" r="3.4" fill="#2a2433"/>
      <rect x="110.5" y="121.5" width="5" height="5" rx="1" fill="#2a2433"/><rect x="124.5" y="121.5" width="5" height="5" rx="1" fill="#2a2433"/>
      <circle cx="120" cy="117.5" r="1.4" fill="#2a2433"/>
    </g>
    <path d="${sparkle(20, 52, 3.4)} ${sparkle(226, 128, 3.8)} ${sparkle(200, 16, 2.6)}" style="fill:var(--c-acc2)"/>`;
    const rings = (rr) => { let s = ''; for (let q = 11; q < rr; q += 2.6) s += `<circle cx="0" cy="0" r="${r(q)}"/>`; return s; };
    const roll = (rr) => `<svg ${XMLNS} viewBox="-20 -20 40 40" aria-hidden="true"><defs><radialGradient id="${id.roll}${rr}" cx=".5" cy=".5" r=".5">${stop(0.3, '#7a5646')}${stop(1, '#3a2520')}</radialGradient></defs><circle r="${rr}" fill="url(#${id.roll}${rr})"/><g fill="none" stroke="#9a735f" stroke-width=".5" opacity=".55">${rings(rr)}</g></svg>`;
    const arcs = (side, dl) => {
      const s = side < 0 ? -1 : 1, x0 = side < 0 ? 28 : 212;
      return [0, 1, 2].map((k) => { const dx = 7 * k * s, a = 12 + 8 * k; return `<path d="M${x0 + dx} ${82 - a} Q${x0 + dx + s * (6 + 3 * k)} 82 ${x0 + dx} ${82 + a}" stroke-width="${2.2 - k * 0.3}" style="animation-delay:${r(dl + k * 0.3)}s"/>`; }).join('');
    };
    const Lr = (l) => ly(W, Hh, l);
    const layers = [
      Lr({ x: 0, y: 50, w: 44, h: 64, cls: 'cs-wave', svg: `<g fill="none" style="stroke:var(--c-acc3)" stroke-linecap="round">${arcs(-1, 0.15)}</g>` }),
      Lr({ x: 196, y: 50, w: 44, h: 64, cls: 'cs-wave', svg: `<g fill="none" style="stroke:var(--c-acc2)" stroke-linecap="round">${arcs(1, 0)}</g>` }),
      // 磁带窗：两个带卷（播放时左卷变小、右卷变大），外面一圈圆角遮罩
      Lr({ x: 72, y: 66, w: 96, h: 28, cls: 'cs-win', html: `<div class="rl a">${roll(19)}</div><div class="rl b">${roll(19)}</div><i class="gl"></i>` }),
      Lr({ x: 87, y: 71, w: 18, h: 18, cls: 'cs-reel', wrap: ['spin', 'spin2'], svg: reel(96, 80) }),
      Lr({ x: 135, y: 71, w: 18, h: 18, cls: 'cs-reel', wrap: ['spin', 'spin2'], svg: reel(144, 80) }),
      // 标签：平时是手写的 “sounds to keep”，播放时换成曲名
      Lr({ x: 64, y: 55, w: 112, h: 11, cls: 'cs-label', html: '<b class="idle">sounds to keep</b><b class="now"></b>' }),
      Lr({ x: 8, y: 20, w: 224, h: 120, cls: 'cs-notes', svg: `<g style="fill:var(--c-acc);stroke:var(--c-acc)"><g class="n1">${note(213, 38, 1, 12)}</g><g class="n2">${note(22, 128, 0.85, -10)}</g><g class="n3">${note(30, 34, 0.7, -6)}</g></g>` }),
    ];
    return scene('cassette', W, Hh, { defs, base, layers: [...layers, hs(W, Hh, 34, 30, 172, 104, 'play', '播放磁带')] });
  }

  /* ====================================================================
   * II-5 两封信：寄往莱塔尼亚（火焰蜡封）与寄自汐斯塔（羽毛蜡封），中间飘着一张旧照片
   * ==================================================================== */
  function letters() {
    const W = 240, Hh = 160, ink = '#3d2a30';
    const id = { paper: nid('tp'), paper2: nid('tp2'), sealA: nid('tsa'), sealB: nid('tsb'), photo: nid('tph'), wool: nid('tw'), face: nid('tf'), horn: nid('th') };
    const pdefs = (k) => `<defs><linearGradient id="${id.paper}${k}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#fffaf0')}${stop(1, '#efdcbf')}</linearGradient><linearGradient id="${id.paper2}${k}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#f6e7cc')}${stop(1, '#e6cfaa')}</linearGradient></defs>`;
    const env = (k, seal, stamp) => `
      <rect x="-35" y="-22" width="70" height="44" rx="2.4" fill="url(#${id.paper}${k})" stroke="${ink}" stroke-width="1.5"/>
      <path d="M-35 22 L-7 1 M35 22 L7 1" fill="none" stroke="${ink}" stroke-width=".8" opacity=".3"/>
      <path d="M-34.4 -21.4 L0 5 L34.4 -21.4 Z" fill="url(#${id.paper2}${k})" stroke="${ink}" stroke-width="1.2"/>
      ${stamp}${seal}`;
    const sealA = `<radialGradient id="${id.sealA}" cx=".38" cy=".34" r=".78">${vstop(0.1, '--c-acc')}${vstop(1, '--c-acc3')}</radialGradient>`;
    const sealB = `<radialGradient id="${id.sealB}" cx=".38" cy=".34" r=".8">${stop(0, '#c4d6f6')}${stop(1, '#4a66a8')}</radialGradient>`;
    const sA = `<path d="${flameD(0.62, 0, 4)}" fill="#000" opacity=".25" transform="translate(.8 1)"/><path d="${flameD(0.62, 0, 4)}" fill="url(#${id.sealA})" stroke="#5a1414" stroke-width="1"/><path d="${flameD(0.38, 0, 5)}" fill="none" stroke="#fff" stroke-width=".6" opacity=".4"/>`;
    const sB = `<circle cx=".8" cy="5" r="8.4" fill="#000" opacity=".22"/><circle cx="0" cy="4" r="8.4" fill="url(#${id.sealB})" stroke="#26345e" stroke-width="1"/><path d="M-4 8.6 C-2.4 3 1 -.6 5 -1.8 C3.6 3 .6 6.6 -4 8.6 Z M-4 8.6 L-5.6 10.2 M-2.6 6.4 L1 3.6" fill="none" stroke="#fff" stroke-width=".8" opacity=".75"/>`;
    const stamp = (icon) => `<g transform="translate(19 -18)"><rect width="12" height="14" fill="#fff" stroke="${ink}" stroke-width=".6" stroke-dasharray="1.2 .8"/>${icon}</g>`;
    const stampA = stamp('<path d="M2 11 L5.6 5 L6.4 4.4 L7.2 5 L10 11 Z" style="fill:var(--c-acc3)"/><path d="M6.4 4 q-1 -2 .6 -3" fill="none" stroke="#888" stroke-width=".6"/>') + `<g transform="translate(22 -8)" fill="none" stroke="${ink}" stroke-width=".6" opacity=".55"><circle r="7"/><path d="M-12 -2 q3 -2 6 0 t6 0 t6 0 t6 0 M-12 2 q3 -2 6 0 t6 0 t6 0 t6 0"/></g>`;
    const stampB = stamp('<rect x="1.4" y="1.4" width="9.2" height="11.2" fill="#bfe6ff"/><path d="M1.4 9 q2.3 -2 4.6 0 t4.6 0 V12.6 H1.4 Z" fill="#6fb0e0"/><circle cx="8" cy="4.4" r="1.6" fill="#ffd66b"/>') + `<g transform="translate(22 -8)" fill="none" stroke="#26345e" stroke-width=".6" opacity=".5"><circle r="7"/><path d="M-4 -1 h8 M-4 1.6 h8"/></g>`;
    const ids = { wool: id.wool, face: id.face, horn: id.horn };
    const heart = (x, y, s) => `<path d="M${x} ${r(y + 3 * s)} C${r(x - 5 * s)} ${r(y - 0.6 * s)} ${r(x - 2.6 * s)} ${r(y - 4 * s)} ${x} ${r(y - 1.6 * s)} C${r(x + 2.6 * s)} ${r(y - 4 * s)} ${r(x + 5 * s)} ${r(y - 0.6 * s)} ${x} ${r(y + 3 * s)} Z"/>`;
    const base = `<ellipse cx="120" cy="148" rx="90" ry="4.5" fill="#000" opacity=".16"/>
    <g fill="none" stroke-linecap="round" stroke-width="2" stroke-dasharray="1 5">
      <path d="M4 104 C22 80 36 70 52 68" style="stroke:var(--c-acc2)"/>
      <path d="M236 58 C224 84 208 98 194 102" stroke="#7a96d6"/>
    </g>
    <path d="${sparkle(26, 30, 3.4)} ${sparkle(214, 30, 2.8)} ${sparkle(110, 132, 2.2)}" style="fill:var(--c-acc2)" opacity=".85"/>`;
    const Lr = (l) => ly(W, Hh, l);
    const layers = [
      Lr({ x: 100, y: 16, w: 42, h: 44, o: [120, 20], cls: 'll-photo', wrap: ['sw'],
        defs: `<defs><linearGradient id="${id.photo}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#f2b98a')}${stop(1, '#7a4a5a')}</linearGradient>${sheepDefs(ids, PAL.black)}</defs>`,
        svg: `<g transform="translate(120 20) rotate(6)">
          <rect x="-15" y="0" width="30" height="34" rx="1" fill="#fffdf8" stroke="${ink}" stroke-width="1.1"/>
          <rect x="-12" y="3" width="24" height="22" fill="url(#${id.photo})"/>
          <path d="M-12 20 C-6 16 4 17 12 19 V25 H-12 Z" fill="#3a2a30" opacity=".7"/>
          <g transform="translate(-2.5 23.6) scale(.34)">${sheepFig(ids, PAL.black, { eyes: 'happy' })}</g>
          <g transform="translate(6.5 23.6) scale(-.3 .3)">${sheepFig(ids, PAL.black, { eyes: 'happy', phase: 1 })}</g>
          <path d="M-7 30 h14" stroke="#8a6a5a" stroke-width=".7" opacity=".6"/></g>` }),
      Lr({ x: 38, y: 36, w: 84, h: 64, cls: 'll-env a', wrap: ['fl'], defs: `<defs>${sealA}</defs>${pdefs('a')}`,
        svg: `<g transform="translate(80 68) rotate(-12)">${env('a', sA, stampA)}<path d="${scribble(-28, 14, 22, 71, 0.9)}" fill="none" stroke="#6b4a3a" stroke-width=".7" opacity=".55"/></g>` }),
      Lr({ x: 122, y: 72, w: 84, h: 64, cls: 'll-env b', wrap: ['fl'], defs: `<defs>${sealB}</defs>${pdefs('b')}`,
        svg: `<g transform="translate(164 104) rotate(9)">${env('b', sB, stampB)}<path d="${scribble(-28, 14, 24, 72, 0.9)}" fill="none" stroke="#3a4a6a" stroke-width=".7" opacity=".55"/></g>` }),
      Lr({ x: 32, y: 84, w: 16, h: 14, cls: 'll-heart', svg: `<g style="fill:var(--c-acc)">${heart(40, 92, 1)}</g>` }),
      Lr({ x: 205, y: 113, w: 14, h: 13, cls: 'll-heart h2', svg: `<g style="fill:var(--c-acc)">${heart(212, 120, 0.8)}</g>` }),
    ];
    return scene('letters', W, Hh, { base, layers: [...layers, hs(W, Hh, 40, 40, 80, 58, 'env-a', '寄往莱塔尼亚的信'), hs(W, Hh, 124, 76, 80, 58, 'env-b', '寄自汐斯塔的信')] });
  }

  /* ====================================================================
   * II-6 想要留下的生命：棉花糖3号、试管、偷看的粉色小羊、一球冰淇淋（点花：测一测源石活性）
   * ==================================================================== */
  function flower() {
    const W = 240, Hh = 160, ink = '#3e3a55';
    const id = { pot: nid('fp'), rim: nid('fr'), petal: nid('fpt'), warn: nid('fwn'), leaf: nid('fl'), wool: nid('fw'), face: nid('ff'), horn: nid('fh'), cream: nid('fc'), glass: nid('fg') };
    const fx = 108, fy = 46;
    const petalSet = (grad, stroke) => {
      let s = '';
      for (let k = 0; k < 5; k++) s += `<g transform="rotate(${k * 72 - 4} ${fx} ${fy})"><path d="M${fx} ${fy} C${fx - 8} ${fy - 3} ${fx - 11} ${fy - 14} ${fx - 6} ${fy - 19} C${fx - 3.5} ${fy - 21.5} ${fx - 1} ${fy - 20.5} ${fx} ${fy - 18} C${fx + 1} ${fy - 20.5} ${fx + 3.5} ${fy - 21.5} ${fx + 6} ${fy - 19} C${fx + 11} ${fy - 14} ${fx + 8} ${fy - 3} ${fx} ${fy}Z" fill="url(#${grad})" stroke="${stroke}" stroke-width="1.2"/><path d="M${fx} ${fy - 4} V${fy - 14} M${fx - 2.4} ${fy - 6} Q${fx - 4} ${fy - 10} ${fx - 3.6} ${fy - 13} M${fx + 2.4} ${fy - 6} Q${fx + 4} ${fy - 10} ${fx + 3.6} ${fy - 13}" fill="none" stroke="#f0a0bc" stroke-width=".7" opacity=".85"/></g>`;
      return s;
    };
    let stamens = '';
    for (let k = 0; k < 8; k++) { const p = pol(fx, fy, 6.2, (k / 8) * TAU + 0.3); stamens += `<circle cx="${r(p[0])}" cy="${r(p[1])}" r=".95"/>`; }
    let marks = '';
    [110, 116, 122, 128, 134, 140].forEach((y, i) => { marks += `M${r(91 + (y - 104) * 0.09)} ${y} h${i % 2 ? 3 : 5.5} `; });
    const ids = { wool: id.wool, face: id.face, horn: id.horn };
    const defs = `<defs>
      <linearGradient id="${id.pot}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#e9eef7')}${stop(0.32, '#ffffff')}${stop(1, '#c9d3e4')}</linearGradient>
      <linearGradient id="${id.rim}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#ffffff')}${stop(1, '#dfe5f0')}</linearGradient>
      <radialGradient id="${id.cream}" cx=".4" cy=".3" r=".8">${stop(0, '#fffcf4')}${stop(1, '#f5dfbf')}</radialGradient>
      <linearGradient id="${id.glass}" x1="0" y1="0" x2="1" y2="0">${stop(0, '#ffffff', 0.85)}${stop(0.5, '#eaf2ff', 0.35)}${stop(1, '#ffffff', 0.7)}</linearGradient>
    </defs>`;
    const base = `<ellipse cx="124" cy="149" rx="100" ry="5" fill="#000" opacity=".15"/>
    <g stroke-linecap="round" stroke-linejoin="round">
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
      <path d="M127 96 L146 79" stroke="#8a6a48" stroke-width="3.2"/><path d="M127 96 L146 79" stroke="#d9b88a" stroke-width="1.8"/>
      <g transform="rotate(-8 152 72)">
        <rect x="131" y="64" width="44" height="16" rx="3" fill="#fffdf7" stroke="${ink}" stroke-width="1.2"/>
        <path d="M134 64 H137 V80 H134 Q131 80 131 77 V67 Q131 64 134 64Z" style="fill:var(--c-acc)"/>
        <text x="156.5" y="75.2" text-anchor="middle" font-family="'Microsoft YaHei','PingFang SC',sans-serif" font-size="7" font-weight="700" fill="#4a4366">棉花糖3号</text>
      </g>
      <rect x="84" y="95" width="52" height="9" rx="3.5" fill="url(#${id.rim})" stroke="${ink}" stroke-width="1.8"/>
      <ellipse cx="110" cy="96.6" rx="22" ry="2.8" fill="#5b4033"/>
      <path d="M88 104 L132 104 L128.4 142 Q128 147 123 147 L97 147 Q92 147 91.6 142 Z" fill="url(#${id.pot})" stroke="${ink}" stroke-width="1.8"/>
      <path d="M88.4 107 L131.6 107 L131.3 110 L88.7 110Z" style="fill:var(--c-acc2)" opacity=".5"/>
      <path d="${marks}" fill="none" style="stroke:var(--c-acc2)" stroke-width="1.1"/>
      <rect x="103" y="117" width="22" height="15" rx="2" fill="#fffdf5" stroke="${ink}" stroke-width=".9"/>
      <text x="114" y="124" text-anchor="middle" font-family="'Segoe UI',Arial,sans-serif" font-size="5.4" font-weight="700" fill="${ink}">No.3</text>
      <path d="M106 127 v3 M107.4 127 v3 M109.6 127 v3 M110.6 127 v3 M112.6 127 v3 M114.6 127 v3 M115.6 127 v3 M117.8 127 v3 M119.4 127 v3 M121.6 127 v3" stroke="${ink}" stroke-width=".6"/>
      <path d="M94.6 110 L97 140" stroke="#fff" stroke-width="2.2" opacity=".8"/>
      <ellipse cx="198" cy="142" rx="24" ry="6.4" fill="#ffffff" stroke="${ink}" stroke-width="1.5"/>
      <ellipse cx="198" cy="141.2" rx="16.5" ry="3.9" fill="none" style="stroke:var(--c-acc2)" stroke-width="1" opacity=".65"/>
      <path d="M204 125 L214 106" stroke="#a8743a" stroke-width="5"/><path d="M204 125 L214 106" stroke="#eabd79" stroke-width="3.4"/>
      <path d="M186 136 Q184 124 191 119 Q198 114 205 119 Q212 124 210 136 Q207 139 204 136.5 Q201 140 198 137 Q195 140 192 137 Q189 139.5 186 136Z" fill="url(#${id.cream})" stroke="${ink}" stroke-width="1.4"/>
      <path d="M189 122 Q198 114.4 207 122 Q205.4 126.4 203 124 Q201 128.4 199 125 Q196 128.6 194 124.6 Q191 127.4 189 122Z" fill="#f59ab7" stroke="#d0708f" stroke-width=".9"/>
      <path d="M199 110.6 Q200 106.6 203.4 105.4" fill="none" stroke="#4f7a3a" stroke-width="1"/>
      <circle cx="199" cy="113.4" r="3.2" style="fill:var(--c-acc)" stroke="#6a1a2a" stroke-width="1"/>
      <circle cx="198" cy="112.4" r=".9" fill="#fff" opacity=".8"/>
    </g>
    <path d="${sparkle(78, 40, 4)} ${sparkle(136, 30, 3.4)} ${sparkle(90, 18, 2.6)}" style="fill:var(--c-acc2)" opacity=".85"/>
    <path d="${sparkle(176, 94, 2.8)} ${sparkle(24, 84, 3)}" style="fill:var(--c-acc3)" opacity=".8"/>`;
    const stem = `<path d="M110 96 C104 84 115 68 ${fx} ${fy + 3}" fill="none" stroke="#4f8d62" stroke-width="3.6" stroke-linecap="round"/><path d="M110 96 C104 84 115 68 ${fx} ${fy + 3}" fill="none" stroke="#7cc08f" stroke-width="2" stroke-linecap="round"/>
      <path d="M108.6 80 C102 72 94 70 89.6 72 C94 80 102 83 108.6 80Z" fill="url(#${id.leaf})" stroke="#3f7a55" stroke-width="1.2"/>
      <path d="M111 68 C117 60 125 58 129.4 60 C125.4 67.4 117.4 70.4 111 68Z" fill="url(#${id.leaf})" stroke="#3f7a55" stroke-width="1.2"/>`;
    const head = (grad, stroke) => `${petalSet(grad, stroke)}<circle cx="${fx}" cy="${fy}" r="4.8" fill="#ffe08a" stroke="#e0a24a" stroke-width="1"/><g fill="#f5b04a">${stamens}</g><circle cx="${fx - 1.4}" cy="${fy - 1.4}" r="1.3" fill="#fff" opacity=".8"/>`;
    const vb = '84 22 50 76';
    const Lr = (l) => ly(W, Hh, l);
    const layers = [
      Lr({ x: 104, y: 94, w: 50, h: 48, o: [122, 140], cls: 'fw-sheep', wrap: ['peek'],
        defs: `<defs>${sheepDefs(ids, PAL.pink)}</defs>`,
        svg: `<g transform="translate(122 140) scale(-1.25 1.25)">${sheepFig(ids, PAL.pink, { eyes: 'open', phase: 1 })}</g>` }),
      Lr({ x: 84, y: 22, w: 50, h: 76, o: [110, 96], cls: 'fw-flower', wrap: ['sway'], html:
        `<svg ${XMLNS} viewBox="${vb}" overflow="visible" aria-hidden="true"><defs><linearGradient id="${id.leaf}" x1="0" y1="0" x2="1" y2="1">${stop(0, '#b5e3b9')}${stop(1, '#5c9f72')}</linearGradient><radialGradient id="${id.petal}" gradientUnits="userSpaceOnUse" cx="${fx}" cy="${fy}" r="22">${stop(0, '#ffffff')}${stop(0.45, '#fff2f7')}${stop(1, '#f59ab8')}</radialGradient></defs>${stem}${head(id.petal, '#d0708f')}</svg>` +
        `<div class="warn"><svg ${XMLNS} viewBox="${vb}" overflow="visible" aria-hidden="true"><defs><radialGradient id="${id.warn}" gradientUnits="userSpaceOnUse" cx="${fx}" cy="${fy}" r="22">${stop(0, '#fff2d6')}${stop(0.45, '#ffb070')}${stop(1, '#e8433f')}</radialGradient></defs>${head(id.warn, '#b8322a')}</svg></div>` }),
      Lr({ x: 128, y: 30, w: 70, h: 16, cls: 'fw-read', html: '<b>源石活性 ↑ · 花色转红</b>' }),
      Lr({ x: 160, y: 100, w: 20, h: 16, cls: 'fw-crumb pm', html: motes(4, 9, (R) => ({ x: r(R() * 80), y: r(R() * 60), s: r(0.6 + R() * 0.6), d: -R() * 3, t: 3 + R() })) }),
    ];
    return scene('flower', W, Hh, { defs, base, layers: [...layers, hs(W, Hh, 84, 20, 52, 80, 'bloom', '棉花糖3号')] });
  }

  /* ====================================================================
   * II-7 夜色中的第一步：圆窗里的夜山，发光的小羊领路；点一下：在山顶种下预警花
   * ==================================================================== */
  function night() {
    const W = 240, Hh = 160, ink = '#2c2946';
    const id = { clip: nid('nc'), sky: nid('ns'), hill: nid('nh'), pet: nid('nf'), glow: nid('ng'), aura: nid('na'), wool: nid('nw'), face: nid('nfa'), horn: nid('nho') };
    const cx = 114, cy = 78, rad = 66;
    const R = rng(33);
    const starsA = [], starsB = [];
    for (let i = 0; i < 30; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * rad;
      const x = cx + Math.cos(a) * d, y = cy - Math.abs(Math.sin(a)) * d * 0.95;
      (i % 3 === 0 ? starsA : starsB).push(`<circle cx="${r(x)}" cy="${r(y)}" r="${r(0.4 + R() * 0.9)}" opacity="${r(0.4 + R() * 0.6)}"/>`);
    }
    const path = [[62, 136], [72, 132], [82, 128], [92, 122], [102, 116], [111, 108], [120, 100], [130, 92], [140, 84], [150, 76]];
    const ids = { wool: id.wool, face: id.face, horn: id.horn };
    let pet = '';
    for (let k = 0; k < 5; k++) pet += `<ellipse cx="158" cy="57.2" rx="1.9" ry="3.1" transform="rotate(${k * 72} 158 60.4)" fill="url(#${id.pet})"/>`;
    const defs = `<defs>
      <clipPath id="${id.clip}"><circle cx="${cx}" cy="${cy}" r="${rad}"/></clipPath>
      <linearGradient id="${id.sky}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#0e1536')}${stop(0.6, '#27306a')}${stop(1, '#5c4c86')}</linearGradient>
      <linearGradient id="${id.hill}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#2e2850')}${stop(1, '#15122a')}</linearGradient>
    </defs>`;
    const base = `<ellipse cx="128" cy="149" rx="96" ry="4.5" fill="#000" opacity=".16"/>
    <g clip-path="url(#${id.clip})">
      <rect x="${cx - rad}" y="${cy - rad}" width="${rad * 2}" height="${rad * 2}" fill="url(#${id.sky})"/>
      <g fill="#fff">${starsB.join('')}</g>
      <circle cx="86" cy="40" r="9" fill="#fff6d8"/><circle cx="90" cy="37" r="8.2" fill="#131b40"/>
      <path d="M40 148 L48 128 C74 124 96 112 118 98 C132 88 146 76 156 70 L162 68 C170 72 178 80 186 88 V148 Z" fill="url(#${id.hill})"/>
      <path d="M118 98 C132 88 146 76 156 70 L162 68" fill="none" stroke="#6a5c9a" stroke-width="1" opacity=".7"/>
      <path d="M40 148 V136 C80 132 120 138 190 124 V148 Z" fill="#0d0b1a"/>
      <ellipse cx="158" cy="69.4" rx="6" ry="1.8" fill="#4a3a5a"/>
      <path d="M166 69 L169 58" stroke="#8a7a70" stroke-width="1.2"/><path d="M168 60 L171 52 L173 53 L170 61 Z" fill="#b8c0cc" stroke="#4a4a5a" stroke-width=".6"/>
      <circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="#ffc2d8" stroke-width="3" opacity=".4"/>
    </g>
    <circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${ink}" stroke-width="2.4"/>
    <circle cx="${cx}" cy="${cy}" r="${rad + 5}" fill="none" style="stroke:var(--c-acc2)" stroke-width=".8" stroke-dasharray="2 5" opacity=".7"/>
    <path d="${sparkle(30, 34, 4)} ${sparkle(212, 36, 3)} ${sparkle(28, 116, 2.6)} ${sparkle(196, 84, 2.2)}" style="fill:var(--c-acc2)" opacity=".85"/>`;
    const mini = ([x, y], i) => `<div class="mn" style="left:${pc((x - 12 - (cx - rad)) / (rad * 2))};top:${pc((y - 17 - (cy - rad)) / (rad * 2))};width:${pc(22 / (rad * 2))};height:${pc(20 / (rad * 2))};--d:${r(-i * 0.3)}s"><svg ${XMLNS} viewBox="${x - 12} ${y - 17} 22 20" aria-hidden="true"><circle cx="${x}" cy="${y - 5}" r="10" fill="url(#${id.aura})"/><path d="M${x - 3} ${y - 1.8} v2.2 M${x + 2.6} ${y - 1.8} v2.2" stroke="#ffd2e2" stroke-width="1.1" stroke-linecap="round"/><g fill="#ffe3ee"><circle cx="${x - 3.4}" cy="${y - 5.2}" r="3.1"/><circle cx="${x + 0.6}" cy="${y - 6.4}" r="3.4"/><circle cx="${x + 3.6}" cy="${y - 4.6}" r="2.9"/><circle cx="${x - 0.4}" cy="${y - 3.4}" r="3.3"/></g><circle cx="${x + 6.4}" cy="${y - 7.2}" r="2.3" fill="#fff"/><circle cx="${x + 7.2}" cy="${y - 7.6}" r=".5" fill="#4a2a3b"/></svg></div>`;
    const dots = (sel) => path.filter((_, i) => i % 2 === sel).map(([x, y]) => `<i style="left:${pc((x - (cx - rad)) / (rad * 2))};top:${pc((y - (cy - rad)) / (rad * 2))}"></i>`).join('');
    const Lr = (l) => ly(W, Hh, l);
    const layers = [
      // 圆窗里会动的东西：星星、路灯一样的光点、三只领路的小羊（一层圆形遮罩）
      Lr({ x: cx - rad, y: cy - rad, w: rad * 2, h: rad * 2, cls: 'nt-win', html:
        `<svg class="nt-st" ${XMLNS} viewBox="${cx - rad} ${cy - rad} ${rad * 2} ${rad * 2}" aria-hidden="true"><g fill="#fff">${starsA.join('')}</g></svg>` +
        `<div class="pd a">${dots(0)}</div><div class="pd b">${dots(1)}</div>` +
        `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><radialGradient id="${id.aura}">${stop(0, '#ffc2d8', 0.55)}${stop(1, '#ffc2d8', 0)}</radialGradient></defs></svg>` +
        [path[1], path[4], path[7]].map(mini).join('') }),
      Lr({ x: 142, y: 44, w: 32, h: 32, cls: 'nt-glow', defs: `<defs><radialGradient id="${id.glow}">${stop(0, '#ffe3ee', 0.85)}${stop(1, '#ffb3cc', 0)}</radialGradient></defs>`, svg: `<circle cx="158" cy="60" r="16" fill="url(#${id.glow})"/>` }),
      Lr({ x: 150, y: 52, w: 16, h: 18, o: [158, 69], cls: 'nt-flower', wrap: ['grow', 'sway'],
        defs: `<defs><radialGradient id="${id.pet}" cx=".5" cy=".3" r=".8">${stop(0, '#ffffff')}${stop(1, '#f59ab8')}</radialGradient></defs>`,
        svg: `<path d="M158 69 C157 66 158.6 63 158 60" fill="none" stroke="#7cc08f" stroke-width="1.3"/><path d="M158 66.4 C155 64.4 152.6 65 151.6 66.6 C154 67.8 156.4 67.4 158 66.4 Z M158.2 65 C161 63 163.6 63.4 164.6 65 C162.2 66.2 159.8 66 158.2 65 Z" fill="#8ed09f"/>${pet}<circle cx="158" cy="60.4" r="1.4" fill="#ffe08a"/>` }),
      Lr({ x: 58, y: 22, w: 112, h: 16, cls: 'nt-promise', html: '<b></b>' }),
      Lr({ x: 176, y: 108, w: 58, h: 42, o: [204, 146], cls: 'nt-sheep', wrap: ['br'],
        defs: `<defs>${sheepDefs(ids, PAL.pink)}</defs>`,
        svg: `<g transform="translate(204 146) scale(1.18)">${sheepFig(ids, PAL.pink, { eyes: 'open', phase: 1, bow: true })}</g>` }),
    ];
    return scene('night', W, Hh, { defs, base, layers: [...layers, hs(W, Hh, 48, 12, 132, 132, 'plant', '种下预警花')] });
  }

  /* ====================================================================
   * II-8 一步，又一步（整屏）：乌纳火山之巅的清晨，云海之上。
   * 山顶埋着一块小石头；两个花环在无风的山顶自己飞走，白色的灰像羽毛一样落下。1600×900
   * ==================================================================== */
  function summit() {
    const W = 1600, Hh = 900;
    const id = { sky: nid('ms'), sun: nid('msn'), rock: nid('mr'), snow: nid('msw'), mist: nid('mm'), rim: nid('mrm'), shade: nid('msh'), crater: nid('mcr') };
    const R = rng(61);
    /* 近景：她站着的火山口外缘，横贯画面下方；远处是云海、群峰与太阳 */
    const rimPts = [[-20, 812], [160, 796], [380, 784], [620, 772], [820, 756], [960, 744], [1060, 738], [1150, 742], [1280, 754], [1420, 770], [1620, 790]];
    const rimD = spline(rimPts);
    const yAt = (x) => { for (let i = 0; i < rimPts.length - 1; i++) { const [x0, y0] = rimPts[i], [x1, y1] = rimPts[i + 1]; if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); } return 800; };
    const bank = (y0, amp, seed, lo = -40, hi = 1640) => { const Rr = rng(seed); return band(sample(lo, hi, 40, (x) => y0 + amp * Math.sin(x * 0.006 + seed) + amp * 0.5 * Math.sin(x * 0.017 + seed * 2) - Rr() * amp * 0.6), 900); };
    const peaks = [[210, 560, 130], [480, 590, 90], [1470, 575, 110], [760, 600, 70]].map(([x, y, w]) => `<path d="M${x - w} ${y + 40} Q${x - w * 0.3} ${y - 20} ${x} ${y - 50} Q${x + w * 0.3} ${y - 20} ${x + w} ${y + 40} Z"/>`).join('');
    let glory = '';
    ['#f59ab0', '#ffc98f', '#fff09a', '#a9e5c5', '#9ccaf5', '#b9a2ec'].forEach((c, i) => { glory += `<circle cx="1190" cy="300" r="${150 + i * 7}" stroke="${c}"/>`; });
    const defs = `<defs>
      <linearGradient id="${id.sky}" x1="0" y1="0" x2="0" y2="1">${stop(0, '#86bbe8')}${stop(0.34, '#c3ddf4')}${stop(0.58, '#f8e8dc')}${stop(0.72, '#f7dacd')}${stop(1, '#f1e4ee')}</linearGradient>
      <radialGradient id="${id.sun}">${stop(0, '#fffbe9', 0.95)}${stop(0.25, '#fff1d6', 0.55)}${stop(1, '#fff1d6', 0)}</radialGradient>
    </defs>`;
    const base = `
      <rect width="1600" height="900" fill="url(#${id.sky})"/>
      <circle cx="1190" cy="300" r="380" fill="url(#${id.sun})"/>
      <g fill="none" stroke-width="5" opacity=".3">${glory}</g>
      <circle cx="1190" cy="300" r="44" fill="#fffdf4"/>
      <g fill="#c4cfe8" opacity=".8">${peaks}</g>
      <path d="${bank(560, 20, 3)}" fill="#e7edf8"/>
      <path d="${bank(600, 24, 5)}" fill="#f5f1f5"/>`;
    /* 外缘上的积灰：沿着地面铺开的一片片浅色，边缘不齐 */
    let dust = '';
    for (let k = 0; k < 26; k++) {
      const x = -10 + k * 64 + (R() - 0.5) * 40, y = yAt(x) + 10 + R() * 60, w = 30 + R() * 70;
      dust += `<ellipse cx="${r(x)}" cy="${r(y)}" rx="${r(w)}" ry="${r(3 + R() * 6)}" opacity="${r(0.25 + R() * 0.45)}"/>`;
    }
    let rocks = '';
    [[240, 16], [520, 12], [760, 20], [1240, 14], [1380, 22], [1520, 15], [900, 10], [120, 11]].forEach(([x, s]) => {
      const y = yAt(x) + s * 0.9 + R() * 30;
      rocks += `<path d="M${x - s * 1.5} ${r(y + s * 0.5)} L${x - s * 0.8} ${r(y - s * 0.6)} L${x + s * 0.3} ${r(y - s)} L${x + s * 1.4} ${r(y - s * 0.2)} L${x + s * 1.6} ${r(y + s * 0.5)} Z" fill="#3b3550"/><path d="M${x - s * 0.8} ${r(y - s * 0.6)} L${x + s * 0.3} ${r(y - s)} L${x + s * 1.4} ${r(y - s * 0.2)} L${x + s * 0.2} ${r(y - s * 0.3)} Z" fill="#9a94b2"/>`;
    });
    const cairnX = 1060, cairnY = yAt(1060);
    const top = `<defs>
        <linearGradient id="${id.rock}" x1="0" y1="730" x2="0" y2="900" gradientUnits="userSpaceOnUse">${stop(0, '#5f5976')}${stop(0.4, '#433d58')}${stop(1, '#2a2640')}</linearGradient>
        <linearGradient id="${id.rim}" x1="0" y1="0" x2="1600" y2="0" gradientUnits="userSpaceOnUse">${stop(0, '#ffffff', 0.35)}${stop(0.6, '#fff6e0', 0.9)}${stop(1, '#fff3d6', 0.5)}</linearGradient>
        <radialGradient id="${id.shade}">${stop(0, '#1c1830', 0.55)}${stop(1, '#1c1830', 0)}</radialGradient>
      </defs>
      <path d="${rimD} L1620 900 L-20 900 Z" fill="url(#${id.rock})"/>
      <g fill="#e9e6f4">${dust}</g>
      <path d="${rimD}" fill="none" stroke="url(#${id.rim})" stroke-width="5" stroke-linecap="round"/>
      <path d="${spline(rimPts.map(([x, y]) => [x, y + 7]))}" fill="none" stroke="#ffffff" stroke-width="2" opacity=".35"/>
      ${rocks}
      <ellipse cx="${cairnX + 30}" cy="${r(cairnY + 12)}" rx="70" ry="10" fill="url(#${id.shade})"/>
      <g transform="translate(${cairnX} ${r(cairnY + 2)}) scale(1.9)">
        <ellipse cx="0" cy="4" rx="34" ry="7" fill="#332d48" opacity=".9"/>
        <ellipse cx="-2" cy="2" rx="24" ry="5" fill="#57506e"/>
        <path d="M-11 3 Q-10 -9 0 -12 Q11 -10 12 3 Z" fill="#aaa3c2" stroke="#332d48" stroke-width="1.6"/>
        <path d="M-6 -5 Q-1 -9 5 -8" fill="none" stroke="#fff" stroke-width="1.6" opacity=".75"/>
        ${[-27, -19, 18, 26].map((x, i) => `<circle cx="${x}" cy="${4 - (i % 2)}" r="${3 + (i % 2)}" fill="#7a7294"/>`).join('')}
      </g>`;
    const wreath = (cx, cy, rr, seed) => {
      const Rw = rng(seed);
      let s = `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="#6fa56f" stroke-width="${r(rr * 0.16)}"/>`;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU + Rw() * 0.2, [x, y] = pol(cx, cy, rr, a);
        const c = ['#f7b8cb', '#ffe0a0', '#ffffff', '#c9b3e8', '#9ccaf5'][k % 5];
        s += `<circle cx="${r(x)}" cy="${r(y)}" r="${r(rr * (0.24 + Rw() * 0.1))}" fill="${c}" stroke="#d98aa6" stroke-width="${r(rr * 0.03)}"/>`;
        if (k % 3 === 0) { const [lx, ly2] = pol(cx, cy, rr * 1.2, a + 0.2); s += `<ellipse cx="${r(lx)}" cy="${r(ly2)}" rx="${r(rr * 0.17)}" ry="${r(rr * 0.07)}" transform="rotate(${r((a * 180) / Math.PI + 90)} ${r(lx)} ${r(ly2)})" fill="#7cc08f"/>`; }
      }
      return s;
    };
    const w1 = [cairnX - 96, cairnY - 64, 40], w2 = [cairnX + 70, cairnY - 56, 32];
    const Lr = (l) => ly(W, Hh, l);
    const layers = [
      Lr({ x: -80, y: 560, w: 1760, h: 150, cls: 'sm-cloud a', html: `<svg ${XMLNS} viewBox="0 0 1760 150" preserveAspectRatio="none" aria-hidden="true"><path d="${band(sample(0, 1760, 44, (x) => 64 + 18 * Math.sin(x * 0.008) + 12 * Math.sin(x * 0.021 + 1)), 150)}" fill="#ffffff" opacity=".78"/></svg>` }),
      Lr({ x: -80, y: 640, w: 1760, h: 180, cls: 'sm-cloud b', html: `<svg ${XMLNS} viewBox="0 0 1760 180" preserveAspectRatio="none" aria-hidden="true"><path d="${band(sample(0, 1760, 44, (x) => 70 + 22 * Math.sin(x * 0.006 + 2) + 10 * Math.sin(x * 0.019)), 180)}" fill="#fbf7fa" opacity=".9"/></svg>` }),
      Lr({ x: 0, y: 700, w: 1600, h: 200, bake: true, key: 'summit-rim', svg: top }),
      Lr({ x: 1110, y: 220, w: 160, h: 160, cls: 'sm-sun', html: '<i></i>' }),
      Lr({ x: w1[0] - w1[2] - 12, y: w1[1] - w1[2] - 12, w: (w1[2] + 12) * 2, h: (w1[2] + 12) * 2, o: [w1[0], w1[1]], cls: 'sm-wreath w1', wrap: ['rise', 'turn'], svg: wreath(w1[0], w1[1], w1[2], 3) }),
      Lr({ x: w2[0] - w2[2] - 10, y: w2[1] - w2[2] - 10, w: (w2[2] + 10) * 2, h: (w2[2] + 10) * 2, o: [w2[0], w2[1]], cls: 'sm-wreath w2', wrap: ['rise', 'turn'], svg: wreath(w2[0], w2[1], w2[2], 8) }),
      Lr({ x: cairnX - 180, y: cairnY - 200, w: 360, h: 200, cls: 'sm-petals pm', wrap: ['rise'], html: motes(12, 71, (Rr) => ({ x: r(20 + Rr() * 60), y: r(30 + Rr() * 60), s: r(0.7 + Rr()), d: -Rr() * 6, t: 5 + Rr() * 3, c: ['#f7b8cb', '#ffe0a0', '#ffffff', '#c9b3e8'][(Rr() * 4) | 0] })) }),
      Lr({ x: 0, y: 0, w: 1600, h: 900, cls: 'sm-ash pm', html: motes(26, 13, (Rr) => ({ x: r(Rr() * 100), y: r(Rr() * 80), s: r(0.7 + Rr() * 1.4), d: -Rr() * 14, t: 11 + Rr() * 8, dx: r((Rr() - 0.5) * 80) + 'px', dy: r(180 + Rr() * 220) + 'px' })) }),
      Lr({ x: 0, y: 0, w: 1600, h: 900, cls: 'sm-light', html: '<i></i>' }),
    ];
    return scene('summit', W, Hh, { defs, base, layers, cls: 'lsc-cine', bake: true });
  }

  /* ====================================================================
   * II-2 母亲的外套：分层绑定的立绘（由 main.js 挂到 .ch-pimg），前后各一层落下的白灰
   * ==================================================================== */
  function portrait(src) {
    const feathers = (seed, n) => motes(n, seed, (R) => ({ x: r(R() * 100), y: r(R() * 70), s: r(0.7 + R() * 1.1), d: -R() * 12, t: 9 + R() * 6, dx: r((R() - 0.5) * 60) + 'px', dy: r(120 + R() * 140) + 'px' }));
    return `<div class="ch-portrait lsc lsc-portrait">
      <div class="pt-sky"></div><i class="pt-sun"></i>
      <div class="pt-ash back pm">${feathers(4, 8)}</div>
      <div class="ch-pimg"><img src="${src}" alt="穿着母亲外套的纯烬艾雅法拉" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'"></div>
      <span class="pt-cap mono">HVÍT ASKA · 精英零</span>
      <div class="pt-ash front pm">${feathers(9, 6)}</div>
      <p class="pt-note"><b>袖口的灼痕</b>凯勒老师说，那是岩浆突然迸出来时留下的。妈妈差点因此留了疤，却笑着说自己运气真好。</p>
    </div>`;
  }

  /* ---------------------------------------------------- 人物卡的小插画（没有立绘的人） */
  function personWreath() {
    const id = { g: nid('pwg') };
    let s = '';
    const cx = 120, cy = 92, rr = 34;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU, [x, y] = pol(cx, cy, rr, a), c = ['#f7b8cb', '#ffe0a0', '#ffffff', '#c9b3e8'][k % 4];
      s += `<circle cx="${r(x)}" cy="${r(y)}" r="${r(8 + (k % 3))}" fill="${c}" stroke="#d98aa6" stroke-width="1"/>`;
    }
    return `<svg ${XMLNS} viewBox="0 0 240 180" class="pp-draw" aria-hidden="true"><defs><radialGradient id="${id.g}">${stop(0, '#ffd88a', 0.55)}${stop(1, '#ffd88a', 0)}</radialGradient></defs>
      <circle cx="170" cy="120" r="40" fill="url(#${id.g})"/>
      <circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="#6fa56f" stroke-width="5"/>${s}
      <g transform="translate(170 104)" stroke="#3a3552" stroke-width="1.4" stroke-linejoin="round"><path d="M-7 0 Q0 -10 7 0" fill="none"/><path d="M-9 3 H9 L7 0 H-7 Z" fill="#6a5a6a"/><rect x="-8" y="3" width="16" height="20" rx="2" fill="#fff3c8" fill-opacity=".85"/><path d="M0 20 C-3 17 -2 12 0 9 C2 12 3 17 0 20 Z" fill="#ffb347" stroke="#c0601a" stroke-width=".6"/><rect x="-10" y="23" width="20" height="5" rx="1.4" fill="#6a5a6a"/></g>
      <path d="${sparkle(60, 40, 5)} ${sparkle(200, 50, 3.6)}" style="fill:var(--c-acc3)" opacity=".8"/></svg>`;
  }
  function personPink() {
    const ids = { wool: nid('ppw'), face: nid('ppf'), horn: nid('pph') };
    return `<svg ${XMLNS} viewBox="0 0 240 180" class="pp-draw" aria-hidden="true"><defs>${sheepDefs(ids, PAL.pink)}</defs>
      <g opacity=".3"><g transform="translate(70 160) scale(2.2 2.2)">${sheepFig(ids, PAL.pink, { eyes: 'open', phase: 1 })}</g></g>
      <g transform="translate(150 158) scale(-2.6 2.6)">${sheepFig(ids, PAL.pink, { eyes: 'happy', bow: true })}</g>
      <g opacity=".12"><g transform="translate(206 120) scale(1.4)">${sheepFig(ids, PAL.pink, { eyes: 'open' })}</g></g>
      <path d="${sparkle(40, 50, 5)} ${sparkle(200, 40, 4)} ${sparkle(120, 30, 3)}" style="fill:var(--c-acc3)" opacity=".8"/></svg>`;
  }

  return { study, trophy, eruption, letter, sound, cake, field, camp, invite, parade: invite, pumice, cassette, letters, flower, night, summit, portrait, personWreath, personPink, takeBase };
})();
