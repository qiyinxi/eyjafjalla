/* =========================================================
 * 小羊区（#sheep）：本页原创绘制的小羊与两个互动舞台
 * - 术师：妈妈留下的小黑羊。摸摸会发烫（隔热手套）、喂草、帮忙搬书、打盹，
 *         以及模组「宠物大赛第一名」里的那场比赛。
 * - 医疗：看不见的粉色小羊。像「交谈1」里那样牵着你的手找到它们；
 *         照模组「想要留下的生命」里的防啃指南摆食物、开电视。
 * 性能：舞台背景是静态 SVG；持续的动画只有 HTML 包裹层上的 transform / opacity（离屏由 .anim-off 暂停）；
 *      眨眼、犯困之类的计时器只在舞台可见时工作；指针跟随按帧节流。没有常驻的 rAF 循环。
 * ========================================================= */
window.SHEEP = (() => {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pick = (a) => a[(Math.random() * a.length) | 0];
  let uid = 0;

  /* ====================================================
   * 小羊（面朝右；viewBox 220×170，脚底约在 y=154）
   * 颜色全部走 CSS 变量（.lamb-black / .lamb-pink / .hot …），部件带类名供动画使用
   * ==================================================== */
  const WOOL = [[58, 96, 19], [70, 74, 21], [92, 62, 23], [116, 62, 22], [136, 76, 19], [140, 100, 18], [122, 116, 20], [96, 120, 21], [72, 116, 19], [98, 92, 36], [36, 88, 10]];
  const TUFT = [[150, 50, 8], [160, 45, 9.5], [171, 49, 8]];
  const HORN = 'M156 58 C 150 40, 127 41, 127 58 C 127 72, 144 74, 145 64 C 146 57, 138 56, 137 62';
  const circ = (a) => a.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
  function lamb(kind = 'black', cls = '') {
    const id = 'lb' + ++uid;
    const w = circ(WOOL), t = circ(TUFT);
    return `<svg class="lamb lamb-${kind}${cls ? ' ' + cls : ''}" viewBox="0 0 220 170" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="${id}w" cx=".36" cy=".28" r=".85"><stop offset="0" style="stop-color:var(--w0)"/><stop offset=".55" style="stop-color:var(--w1)"/><stop offset="1" style="stop-color:var(--w2)"/></radialGradient>
        <radialGradient id="${id}f" cx=".4" cy=".35" r=".8"><stop offset="0" style="stop-color:var(--f0)"/><stop offset="1" style="stop-color:var(--f1)"/></radialGradient>
        <linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--h0)"/><stop offset="1" style="stop-color:var(--h1)"/></linearGradient>
      </defs>
      <g class="lb-legs">
        <rect class="lb-leg lb-far" x="74" y="118" width="11" height="34" rx="5.5"/><rect class="lb-leg lb-far" x="124" y="116" width="11" height="34" rx="5.5"/>
        <rect class="lb-leg" x="88" y="122" width="12" height="34" rx="6"/><rect class="lb-leg" x="138" y="118" width="12" height="34" rx="6"/>
      </g>
      <g class="lb-rim">${w}</g><g class="lb-ol">${w}</g><g fill="url(#${id}w)">${w}</g>
      <g class="lb-curl"><path d="M68 84 q4-5 8 0 q4-5 8 0"/><path d="M100 72 q4-5 8 0 q4-5 8 0"/><path d="M84 106 q3.5-4 7 0"/><path d="M118 96 q3.5-4 7 0"/><path d="M122 70 q3-3.6 6 0"/></g>
      <g class="lb-head">
        <ellipse class="lb-ear" cx="146" cy="80" rx="12" ry="6" transform="rotate(30 146 80)" fill="url(#${id}f)"/>
        <ellipse class="lb-face" cx="166" cy="76" rx="21" ry="24" fill="url(#${id}f)"/>
        <g class="lb-rim">${t}</g><g class="lb-ol">${t}</g><g fill="url(#${id}w)">${t}</g>
        <path class="lb-horn-o" d="${HORN}"/><path class="lb-horn" d="${HORN}" stroke="url(#${id}h)"/>
        <g class="lb-open"><ellipse cx="160" cy="76" rx="3" ry="4"/><ellipse cx="176" cy="75" rx="2.8" ry="3.8"/><circle class="lb-glint" cx="159" cy="74.4" r="1.1"/><circle class="lb-glint" cx="175" cy="73.4" r="1"/></g>
        <path class="lb-shut" d="M156 77 q4 3 8 0 M172 76 q4 3 8 0"/>
        <path class="lb-joy" d="M156 78 q4 -4.6 8 0 M172 77 q4 -4.6 8 0"/>
        <g class="lb-blush"><ellipse cx="154" cy="86" rx="4.5" ry="2.5"/><ellipse cx="182" cy="85" rx="4" ry="2.3"/></g>
        <path class="lb-mouth" d="M164 89 q2.5 2.4 5 0 q2.5 2.4 5 0"/>
      </g>
    </svg>`;
  }

  /* ---------------------------------------------------- 道具小图（原创） */
  const ICON = {
    book: (c = '#8a3a4e') => `<svg viewBox="0 0 60 18" aria-hidden="true"><rect x="1" y="2" width="58" height="14" rx="2" fill="${c}"/><rect x="1" y="2" width="58" height="3.4" rx="1.5" fill="rgba(255,255,255,.22)"/><rect x="47" y="2" width="4" height="14" fill="rgba(255,220,150,.55)"/><path d="M4 16 h52" stroke="rgba(0,0,0,.35)" stroke-width="1.4"/></svg>`,
    grass: () => `<svg viewBox="0 0 60 40" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-width="4"><path d="M30 40 C 30 26, 26 14, 18 4" stroke="#5f9a3a"/><path d="M30 40 C 31 24, 36 12, 44 6" stroke="#77b447"/><path d="M26 40 C 22 30, 14 24, 6 22" stroke="#4d8430"/><path d="M34 40 C 40 30, 48 26, 56 26" stroke="#6aa83e"/><path d="M30 40 V 10" stroke="#8cc956"/></g><circle cx="44" cy="6" r="3.2" fill="#ffe27a"/><circle cx="18" cy="5" r="2.6" fill="#fff4c2"/></svg>`,
    fruit: () => `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 12 C 12 6, 3 12, 5 23 C 7 33, 14 38, 20 35 C 26 38, 33 33, 35 23 C 37 12, 28 6, 20 12 Z" fill="#ff6d7a" stroke="#c23a52" stroke-width="1.6"/><path d="M20 12 C 20 7, 22 4, 25 2" stroke="#6b4a2a" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M22 7 C 27 3, 33 5, 34 9 C 29 11, 25 10, 22 7 Z" fill="#6fbf5a"/><ellipse cx="12" cy="19" rx="3" ry="5" fill="rgba(255,255,255,.45)" transform="rotate(20 12 19)"/></svg>`,
    icecream: () => `<svg viewBox="0 0 40 52" aria-hidden="true"><path d="M9 24 L20 51 L31 24 Z" fill="#e9b26a" stroke="#b07a3a" stroke-width="1.4"/><path d="M12 30 L26 27 M14 36 L24 33 M16 42 L22 40" stroke="#b07a3a" stroke-width="1.1"/><circle cx="14" cy="20" r="8.5" fill="#ffc6da"/><circle cx="26" cy="20" r="8.5" fill="#bfe6ff"/><circle cx="20" cy="11" r="8.5" fill="#fff4d6"/><circle cx="20" cy="3.6" r="2.6" fill="#ff5a6e"/></svg>`,
    marshmallow: () => `<svg viewBox="0 0 40 34" aria-hidden="true"><rect x="5" y="6" width="30" height="24" rx="9" fill="#fff6fa" stroke="#e9a8c2" stroke-width="1.6"/><ellipse cx="20" cy="9" rx="14" ry="4.6" fill="#ffe3ee" stroke="#e9a8c2" stroke-width="1.2"/><ellipse cx="13" cy="18" rx="2.2" ry="5" fill="rgba(255,255,255,.9)"/></svg>`,
    tie: () => `<svg viewBox="0 0 30 70" aria-hidden="true"><path d="M9 2 H21 L18 10 L24 52 L15 66 L6 52 L12 10 Z" fill="#3a5aa8" stroke="#1d2f63" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 20 L22 16 M8 32 L23 28 M8 44 L23 40" stroke="#c9d6ff" stroke-width="2.2" opacity=".75"/></svg>`,
    hoop: () => `<svg viewBox="0 0 80 130" aria-hidden="true"><path d="M40 78 V 128 M26 128 H 54" stroke="#b9a28a" stroke-width="4" stroke-linecap="round"/><circle cx="40" cy="44" r="34" fill="none" stroke="#ff5a7a" stroke-width="7"/><circle cx="40" cy="44" r="34" fill="none" stroke="#ffd36e" stroke-width="7" stroke-dasharray="12 12"/></svg>`,
    beam: () => `<svg viewBox="0 0 200 60" aria-hidden="true"><rect x="4" y="8" width="192" height="12" rx="3" fill="#d9b48a" stroke="#8a643c" stroke-width="2"/><path d="M28 20 L20 58 M44 20 L52 58 M156 20 L148 58 M172 20 L180 58" stroke="#8a643c" stroke-width="4" stroke-linecap="round"/></svg>`,
    flag: () => `<svg viewBox="0 0 70 130" aria-hidden="true"><path d="M8 4 V 128" stroke="#cfc4b8" stroke-width="4" stroke-linecap="round"/><path d="M10 6 H 64 V 42 H 10 Z" fill="#fff"/><g fill="#26202a"><rect x="10" y="6" width="9" height="9"/><rect x="28" y="6" width="9" height="9"/><rect x="46" y="6" width="9" height="9"/><rect x="19" y="15" width="9" height="9"/><rect x="37" y="15" width="9" height="9"/><rect x="55" y="15" width="9" height="9"/><rect x="10" y="24" width="9" height="9"/><rect x="28" y="24" width="9" height="9"/><rect x="46" y="24" width="9" height="9"/><rect x="19" y="33" width="9" height="9"/><rect x="37" y="33" width="9" height="9"/><rect x="55" y="33" width="9" height="9"/></g></svg>`,
    ribbon: () => `<svg viewBox="0 0 60 80" aria-hidden="true"><path d="M18 40 L8 78 L20 70 L28 80 L30 44 Z M42 40 L52 78 L40 70 L32 80 L30 44 Z" fill="#ff5a7a"/><circle cx="30" cy="28" r="22" fill="#ffd36e" stroke="#c9902c" stroke-width="3"/><circle cx="30" cy="28" r="15" fill="none" stroke="#c9902c" stroke-width="1.6" stroke-dasharray="3 3"/><text x="30" y="34" text-anchor="middle" font-size="17" font-weight="900" fill="#8a4e0c" font-family="serif">1</text></svg>`,
  };

  /* ====================================================
   * 术师：书房（静态背景，viewBox 640×440，与舞台同比例）
   * ==================================================== */
  function studyBackdrop() {
    const shelf = [];
    const cols = ['#5b2a3a', '#7a3346', '#3d2a45', '#8a5a3a', '#2e3a4a', '#6b2f3f', '#4a3a2a'];
    [[62, 118], [140, 196], [218, 274]].forEach(([top, bottom], s) => {
      let x = 482;
      for (let i = 0; x < 604; i++) {
        const w = 9 + ((i * 7 + s * 5) % 9), h = bottom - top - 8 - ((i * 13 + s * 3) % 16);
        const lean = i % 6 === 5 ? ` transform="rotate(-8 ${x + w} ${bottom})"` : '';
        shelf.push(`<rect x="${x}" y="${bottom - h}" width="${w}" height="${h}" rx="1.5" fill="${cols[(i + s * 2) % cols.length]}"${lean}/>`);
        x += w + 2;
      }
    });
    return `<svg class="sb-back" viewBox="0 0 640 440" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sbSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0a1c"/><stop offset=".72" stop-color="#4a1428"/><stop offset="1" stop-color="#8a2a2a"/></linearGradient>
        <radialGradient id="sbLamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".55"/><stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/></radialGradient>
        <radialGradient id="sbCrater" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff9a3a" stop-opacity=".9"/><stop offset="1" stop-color="#ff4a1a" stop-opacity="0"/></radialGradient>
      </defs>
      <g class="sb-window" transform="translate(46 0)">
        <rect x="40" y="36" width="160" height="140" rx="6" fill="url(#sbSky)"/>
        <g fill="#fff" opacity=".7"><circle cx="62" cy="58" r="1.2"/><circle cx="96" cy="48" r=".9"/><circle cx="150" cy="62" r="1.3"/><circle cx="182" cy="50" r=".8"/><circle cx="120" cy="80" r=".9"/></g>
        <ellipse cx="128" cy="126" rx="30" ry="14" fill="url(#sbCrater)"/>
        <path d="M40 176 L 92 138 L 116 128 L 138 128 L 166 146 L 200 162 L 200 176 Z" fill="#2a0e16"/>
        <path d="M116 128 C 112 112, 124 104, 120 90 M 134 128 C 140 114, 132 104, 138 92" stroke="#5a2a30" stroke-width="3" fill="none" opacity=".7"/>
        <rect x="40" y="36" width="160" height="140" rx="6" fill="none" style="stroke:var(--c-line2)" stroke-width="5"/>
        <path d="M120 38 V 174 M42 106 H 198" style="stroke:var(--c-line2)" stroke-width="3"/>
      </g>
      <g class="sb-shelf">
        <rect x="474" y="40" width="140" height="288" rx="4" fill="#2a1418" style="stroke:var(--c-line)" stroke-width="2"/>
        ${shelf.join('')}
        <g fill="#3e1f25"><rect x="474" y="118" width="140" height="6"/><rect x="474" y="196" width="140" height="6"/><rect x="474" y="274" width="140" height="6"/></g>
      </g>
      <g class="sb-desk" transform="translate(46 0)">
        <ellipse cx="64" cy="222" rx="70" ry="60" fill="url(#sbLamp)"/>
        <path d="M58 262 L 64 214 L 88 198" stroke="#6a4a3a" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M78 190 L 104 186 L 100 206 Z" fill="#c07a4a"/>
        <rect x="46" y="262" width="30" height="6" rx="2" fill="#6a4a3a"/>
        <rect x="18" y="268" width="190" height="12" rx="3" fill="#4a2a24"/>
        <path d="M28 280 V 336 M198 280 V 336" stroke="#3a201c" stroke-width="7" stroke-linecap="round"/>
        <g transform="rotate(-6 150 262)"><rect x="126" y="252" width="46" height="14" rx="1" fill="#efe2cd"/><path d="M130 258 h36 M130 262 h28" stroke="#b9a58a" stroke-width="1.2"/></g>
        <g class="sb-photo" transform="translate(178 234) rotate(5)">
          <path d="M8 30 L 4 36 M 22 30 L 26 36" stroke="#6a4a3a" stroke-width="2" stroke-linecap="round"/>
          <rect x="0" y="0" width="30" height="31" rx="2" fill="#c8a070"/><rect x="3" y="3" width="24" height="25" fill="#f2d6c2"/>
          <path d="M3 28 L 3 20 L 11 12 L 15 15 L 21 9 L 27 16 L 27 28 Z" fill="#b07a86"/><path d="M19.6 10.4 c 1 -3, 3 -3.4, 2.4 -6" stroke="#fff" stroke-width="1" fill="none" opacity=".8"/>
          <g fill="#5a2a3a"><circle cx="9" cy="17.5" r="2.2"/><path d="M6.4 28 L 7 21 H 11 L 11.6 28 Z"/><circle cx="21" cy="17" r="2.3"/><path d="M18.4 28 L 19 20.6 H 23 L 23.6 28 Z"/></g>
          <g fill="#e0607e"><circle cx="15" cy="21" r="1.7"/><path d="M13 28 L 13.5 22.8 H 16.5 L 17 28 Z"/></g>
        </g>
      </g>
      <g class="sb-map">
        <rect x="336" y="66" width="116" height="88" rx="3" fill="#3a1a22" stroke="#5a2a30" stroke-width="3"/>
        <rect x="344" y="74" width="100" height="72" fill="#e7d6bd" opacity=".92"/>
        <g fill="none" stroke="#b58866" stroke-width="1.1" opacity=".85">
          <path d="M360 132 C 356 112, 372 96, 394 96 C 416 96, 432 112, 428 130"/>
          <path d="M370 128 C 368 114, 380 104, 394 104 C 408 104, 420 114, 418 127"/>
          <path d="M380 124 C 380 116, 386 111, 394 111 C 402 111, 408 116, 407 123"/>
          <path d="M389 120 C 390 117, 398 117, 399 120"/>
          <path d="M346 142 C 366 138, 380 144, 400 139 S 430 142, 442 137" stroke="#8fb3c9"/>
        </g>
        <path d="M372 108 L 394 118 L 420 100 M 394 118 L 404 136" stroke="#c0304a" stroke-width="1" fill="none"/>
        <g fill="#ff4a64"><circle cx="372" cy="108" r="3"/><circle cx="394" cy="118" r="3.4"/><circle cx="420" cy="100" r="3"/><circle cx="404" cy="136" r="3"/></g>
        <rect x="428" y="76" width="18" height="22" fill="#fff4c8" transform="rotate(8 437 87)"/><path d="M431 82 h11 M431 86 h9 M431 90 h11" stroke="#b9a58a" stroke-width="1" transform="rotate(8 437 87)"/>
      </g>
      <rect x="0" y="330" width="640" height="110" style="fill:var(--sb-floor)"/>
      <path d="M0 330 H 640" style="stroke:var(--c-line2)" stroke-width="2"/>
      <ellipse cx="330" cy="392" rx="240" ry="34" style="fill:var(--sb-rug)"/>
      <ellipse cx="330" cy="392" rx="222" ry="27" fill="none" style="stroke:var(--sb-rug2)" stroke-width="3" stroke-dasharray="10 7"/>
      <g class="sb-pile">
        <rect x="528" y="316" width="78" height="15" rx="2" fill="#7a3346"/><rect x="534" y="302" width="70" height="14" rx="2" fill="#3d2a45"/>
        <rect x="530" y="288" width="72" height="14" rx="2" fill="#8a5a3a" transform="rotate(-3 566 295)"/><rect x="540" y="275" width="60" height="13" rx="2" fill="#2e3a4a"/>
      </g>
    </svg>`;
  }

  /* 宠物大赛那天的一家人（原创纸偶式小人，不画五官细节）：小时候的她站在起点，爸爸妈妈在场边 */
  const FHORN = (x, y, s = 1) => `<path d="M${x} ${y} c ${-6 * s} -2, ${-6 * s} -10, 0 -10 c ${3 * s} 0, ${3 * s} 4, ${1 * s} 5" fill="none" stroke="#ecd6b2" stroke-width="3" stroke-linecap="round"/>`;
  const FIG = {
    kid: `<svg viewBox="0 0 50 100" aria-hidden="true">
      <rect x="18" y="77" width="5" height="19" rx="2" fill="#3a2a3a"/><rect x="27" y="77" width="5" height="19" rx="2" fill="#3a2a3a"/>
      <path d="M34 50 L 46 39" stroke="#f4dccb" stroke-width="4" stroke-linecap="round"/>
      <path d="M14 46 L 36 46 L 42 80 L 8 80 Z" fill="#e0607e"/><path d="M18 46 L 25 54 L 32 46 Z" fill="#fff"/>
      <circle cx="25" cy="32" r="12" fill="#f7e3d4"/>
      <path d="M13 33 C 11 18, 39 16, 38 31 C 35 25, 30 23, 25 23.5 C 19 24, 16 28, 15.5 37 Z" fill="#8a5a44"/>
      ${FHORN(14, 25)}${FHORN(36, 25, -1)}
      <circle cx="21" cy="33.5" r="1.4" fill="#3a2020"/><circle cx="29" cy="33.5" r="1.4" fill="#3a2020"/><ellipse cx="18.5" cy="37.5" rx="2" ry="1.1" fill="#ff9aa8" opacity=".7"/><ellipse cx="31.5" cy="37.5" rx="2" ry="1.1" fill="#ff9aa8" opacity=".7"/>
    </svg>`,
    mom: `<svg viewBox="0 0 60 150" aria-hidden="true">
      <rect x="21" y="120" width="6" height="27" rx="2" fill="#2a2030"/><rect x="32" y="120" width="6" height="27" rx="2" fill="#2a2030"/>
      <path d="M17 58 L 43 58 L 51 124 L 9 124 Z" fill="#d9c4a8"/><path d="M30 58 V 122" stroke="#b9a288" stroke-width="1.2"/>
      <path d="M11 110 q 4 -3, 8 0" stroke="#a0582c" stroke-width="2" fill="none" opacity=".7"/>
      <circle cx="30" cy="42" r="13" fill="#f4dcc8"/>
      <path d="M16 45 C 13 24, 47 22, 45 45 L 47 72 L 41 64 C 43 51, 39 37, 30 35.5 C 21 37, 17 51, 19 64 L 13 72 Z" fill="#6a3a2a"/>
      ${FHORN(17, 33)}${FHORN(43, 33, -1)}
      <circle cx="25.5" cy="44" r="1.4" fill="#3a2020"/><circle cx="34.5" cy="44" r="1.4" fill="#3a2020"/>
    </svg>`,
    dad: `<svg viewBox="0 0 60 150" aria-hidden="true">
      <rect x="20" y="118" width="7" height="29" rx="2" fill="#262a3a"/><rect x="33" y="118" width="7" height="29" rx="2" fill="#262a3a"/>
      <path d="M14 54 L 46 54 L 50 120 L 10 120 Z" fill="#3a4a6a"/><path d="M25 54 L 30 67 L 35 54 Z" fill="#fff"/>
      <circle cx="30" cy="38" r="13" fill="#f4dcc8"/>
      <path d="M17 37 C 17 22, 43 22, 43 37 C 39 30, 21 30, 17 37 Z" fill="#3a2a24"/>
      ${FHORN(18, 30)}${FHORN(42, 30, -1)}
      <g fill="none" stroke="#3a2a24" stroke-width="1.2"><circle cx="25" cy="40" r="3.2"/><circle cx="35" cy="40" r="3.2"/><path d="M28.2 40 h3.6"/></g>
    </svg>`,
  };

  /* 宠物大赛的场地（叠在书房上，比赛时才显示） */
  function fieldHTML() {
    const flags = Array.from({ length: 13 }, (_, i) => `<path d="M${i * 50 + 10} ${18 + Math.sin(i) * 3} l12 22 l12 -22 z" fill="${['#ff5a7a', '#ffd36e', '#7ac8ff', '#9be08a'][i % 4]}"/>`).join('');
    return `<div class="sb-field" aria-hidden="true">
      <svg class="sb-bunting" viewBox="0 0 640 60" preserveAspectRatio="none"><path d="M0 18 Q 320 40 640 18" fill="none" stroke="#d9c7b4" stroke-width="2"/>${flags}</svg>
      <span class="sb-fig sb-mom">${FIG.mom}</span>
      <span class="sb-fig sb-dad">${FIG.dad}</span>
      <span class="sb-prop sb-hoop">${ICON.hoop()}</span>
      <span class="sb-prop sb-beam">${ICON.beam()}</span>
      <span class="sb-prop sb-flag">${ICON.flag()}</span>
      <span class="sb-prop sb-tie">${ICON.tie()}</span>
      <span class="sb-prop sb-ribbon">${ICON.ribbon()}</span>
      <span class="sb-fig sb-kid">${FIG.kid}<b class="sb-q">？</b></span>
    </div>`;
  }

  /** 舞台角落的语音按钮：播放与小羊有关的那一条官方语音 */
  const voiceChip = (S) => (S.voice ? `<button type="button" class="sh-chip sh-voice" data-shvoice="${S.voice[0]}"><i aria-hidden="true">▶</i>${esc(S.voice[1])}</button>` : '');

  /** 一只会动的小羊（位移层 → 转向层 → 跳跃层 → 呼吸层 → SVG） */
  const actor = (kind, cls = '', extra = '') => `<div class="lb-actor ${cls}">
      <span class="lb-heat"></span><span class="lb-shadow"></span>
      <div class="lb-flip"><div class="lb-hop"><div class="lb-breathe">${lamb(kind)}</div><span class="lb-cargo">${ICON.book('#7a3346')}</span></div></div>
      <span class="lb-steam"><i></i><i></i><i></i></span>
      <span class="lb-zz"><i>z</i><i>z</i><i>Z</i></span>
      <span class="lb-bub"></span>${extra}
    </div>`;

  function baseHTML(S) {
    return `<div class="sh-stage sb-stage" data-reveal>
        <div class="sb-scene">
          ${studyBackdrop()}
          ${fieldHTML()}
          <span class="sb-desk-pile" aria-hidden="true"></span>
          <span class="sb-grass" aria-hidden="true">${ICON.grass()}</span>
          ${actor('black', 'sb-helper')}
          ${actor('black', 'sb-main')}
        </div>
        <div class="sh-thermo" aria-label="小黑羊的体温"><span class="mono">TEMP</span><div class="tube"><i></i><b class="tk" style="--tky:.32"></b><b class="tk" style="--tky:.55"></b><b class="tk" style="--tky:.73"></b></div><b class="sh-temp mono">36.5°C</b><em class="sh-zone">常温</em></div>
        <div class="sh-tools">${voiceChip(S)}<button type="button" class="sh-chip sb-glove" aria-pressed="false">隔热手套 · 关</button></div>
        <p class="sb-caption" aria-live="polite">摸摸它。小黑羊一高兴就会发烫——记得戴隔热手套。</p>
      </div>
      <div class="sh-acts" role="group" aria-label="和小黑羊互动">
        <button type="button" class="sh-act" data-sb="pet">摸摸</button>
        <button type="button" class="sh-act" data-sb="feed">喂草</button>
        <button type="button" class="sh-act" data-sb="carry">帮忙搬书</button>
        <button type="button" class="sh-act" data-sb="nap">睡一会儿</button>
        <button type="button" class="sh-act sh-act-hl" data-sb="contest">宠物大赛</button>
      </div>
      <div class="sh-acts sb-cmds" role="group" aria-label="宠物大赛口令" hidden>
        ${S.contest.steps.map(([k, l], i) => `<button type="button" class="sh-act" data-sbc="${k}"${i ? ' disabled' : ''}>${esc(l)}</button>`).join('')}
        <button type="button" class="sh-act sh-act-hl" data-sbc="${S.contest.rescue[0]}" hidden>${esc(S.contest.rescue[1])}</button>
        <button type="button" class="sh-act sh-act-ghost" data-sbc="quit">回书房</button>
      </div>
      ${recordHTML()}`;
  }

  /* 术师：饲育记录——体温曲线（只在体温变化时重画一次，最多每 0.5 秒一次）+ 四个计数 */
  const TY = (t) => 86 - ((clamp(t, 20, 130) - 20) / 110) * 80; // 20–130°C → viewBox 86–6
  function recordHTML() {
    const marks = [[100, '100°C · 危险'], [80, '80°C · 烫手'], [55, '55°C · 暖烘烘'], [36.5, '36.5°C']];
    return `<div class="panel sh-rec" data-reveal>
      <div class="sh-log-h mono"><span>CARE LOG</span><span>饲育记录 · 体温曲线</span></div>
      <div class="sr-body">
        <div class="sr-chart" aria-hidden="true">
          <svg viewBox="0 0 300 90" preserveAspectRatio="none">
            <rect class="sr-hot" x="0" y="0" width="300" height="${TY(100).toFixed(1)}"/>
            ${marks.map(([t]) => `<path class="sr-grid${t === 36.5 ? ' base' : ''}" d="M0 ${TY(t).toFixed(1)}H300"/>`).join('')}
            <path class="sr-area" d="M0 90Z"/><path class="sr-line" d="M0 ${TY(36.5).toFixed(1)}H300"/>
          </svg>
          ${marks.map(([t, l]) => `<span class="sr-lab mono" style="top:${((TY(t) / 90) * 100).toFixed(1)}%">${l}</span>`).join('')}
          <span class="sr-dotw" style="transform:translate3d(0, ${((TY(36.5) / 90) * 100).toFixed(1)}%, 0)"><i class="sr-dot"></i></span>
          <span class="sr-empty mono">摸摸它，曲线就会动起来</span>
        </div>
        <div class="sh-stats">
          <div><span>摸摸</span><b class="mono" data-stat="pets">0</b></div>
          <div><span>最高体温</span><b class="mono" data-stat="max">36.5°</b></div>
          <div><span>搬书</span><b class="mono" data-stat="books">0</b></div>
          <div><span>宠物大赛</span><b class="mono" data-stat="contest">—</b></div>
        </div>
      </div>
    </div>`;
  }

  /* ====================================================
   * 医疗：新汐斯塔办事处的休息室（静态背景，viewBox 640×440）
   * ==================================================== */
  function loungeBackdrop() {
    const flowers = [[578, 318, '#ff5a6e'], [596, 302, '#ff8a9a'], [614, 322, '#e8455e'], [588, 332, '#ffb0bc'], [606, 336, '#ff6d7a']];
    return `<svg class="sa-back" viewBox="0 0 640 440" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="saSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fc6f2"/><stop offset="1" stop-color="#e6f2fc"/></linearGradient>
        <linearGradient id="saSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb5e8"/><stop offset="1" stop-color="#a6d6f5"/></linearGradient>
      </defs>
      <rect x="0" y="286" width="640" height="46" style="fill:var(--sa-wains)"/>
      <rect x="0" y="330" width="640" height="110" style="fill:var(--sa-floor)"/>
      <path d="M0 330 H 640" style="stroke:var(--c-line2)" stroke-width="2"/>
      <g class="sa-window">
        <rect x="192" y="34" width="256" height="168" rx="8" fill="url(#saSky)"/>
        <g fill="#fff" opacity=".9"><ellipse cx="250" cy="70" rx="30" ry="10"/><ellipse cx="274" cy="64" rx="20" ry="10"/><ellipse cx="386" cy="92" rx="34" ry="9"/><ellipse cx="410" cy="86" rx="18" ry="9"/></g>
        <rect x="192" y="160" width="256" height="42" fill="url(#saSea)"/>
        <path d="M300 160 L 330 128 L 346 124 L 360 124 L 392 160 Z" fill="#b8c7dc"/>
        <path d="M346 124 C 340 110, 352 104, 348 92 C 356 98, 366 92, 362 104 C 360 112, 364 118, 360 124 Z" fill="#fff" opacity=".85"/>
        <rect x="192" y="34" width="256" height="168" rx="8" fill="none" stroke="#fff" stroke-width="8"/>
        <path d="M320 36 V 200 M194 118 H 446" stroke="#fff" stroke-width="5"/>
        <rect x="186" y="200" width="268" height="10" rx="3" fill="#e4dcef"/>
      </g>
      <g class="sa-hanger">
        <path d="M60 108 V 330 M36 330 H 84 M60 116 L 44 126 M60 116 L 76 126" stroke="#b49da6" stroke-width="5" stroke-linecap="round" fill="none"/>
        <path d="M48 128 C 36 160, 30 230, 34 286 L 86 286 C 90 230, 84 160, 72 128 Z" fill="#e9dccd" stroke="#bda996" stroke-width="2"/>
        <path d="M60 126 C 40 124, 34 142, 38 160 C 50 170, 70 170, 82 160 C 86 142, 80 124, 60 126 Z" fill="#dccab5" stroke="#bda996" stroke-width="2"/>
        <ellipse cx="60" cy="150" rx="15" ry="12" fill="#b9a38c"/>
        <path d="M44 200 h32 M42 240 h36" stroke="#cdb9a3" stroke-width="2"/>
      </g>
      <g class="sa-sofa">
        <rect x="100" y="238" width="190" height="60" rx="22" fill="#cdb8e8"/>
        <rect x="104" y="280" width="182" height="44" rx="12" fill="#b9a2dc"/>
        <rect x="90" y="266" width="30" height="62" rx="12" fill="#c4addf"/><rect x="270" y="266" width="30" height="62" rx="12" fill="#c4addf"/>
        <rect x="128" y="252" width="44" height="30" rx="10" fill="#ffd4e2" transform="rotate(-8 150 267)"/>
        <path d="M104 326 v8 M286 326 v8" stroke="#8f78b6" stroke-width="5" stroke-linecap="round"/>
      </g>
      <g class="sa-guitar">
        <path d="M318 290 L 338 196" stroke="#6b4a2a" stroke-width="6" stroke-linecap="round"/>
        <rect x="332" y="180" width="12" height="20" rx="3" fill="#4a2f1a" transform="rotate(12 338 190)"/>
        <circle cx="316" cy="300" r="23" fill="#e89a4a" stroke="#a4602a" stroke-width="2"/><circle cx="320" cy="276" r="16" fill="#e89a4a" stroke="#a4602a" stroke-width="2"/>
        <circle cx="318" cy="290" r="6" fill="#5a3a1c"/><path d="M309 312 h14" stroke="#5a3a1c" stroke-width="3"/>
        <path d="M316 306 L 336 196 M320 306 L 339 197" stroke="#fff4dd" stroke-width=".8" opacity=".8"/>
      </g>
      <g class="sa-table">
        <ellipse cx="410" cy="392" rx="96" ry="14" fill="rgba(90,100,150,.12)"/>
        <rect x="350" y="318" width="136" height="10" rx="4" fill="#f4eee6" stroke="#d9cbb8" stroke-width="2"/>
        <path d="M352 328 h132 l-6 18 h-120 z" fill="#fff" stroke="#e6d9c8" stroke-width="1.5"/>
        <path d="M366 346 L 360 392 M470 346 L 476 392" stroke="#c9b7a2" stroke-width="6" stroke-linecap="round"/>
        <g class="sa-tub"><path d="M438 318 l4 -26 h28 l4 26 z" fill="#bfe6ff" stroke="#7fb6dc" stroke-width="2"/><rect x="438" y="288" width="36" height="8" rx="3" fill="#ffc6da"/><text x="456" y="312" text-anchor="middle" font-size="8" font-weight="700" fill="#4a7aa0" font-family="sans-serif">ICE</text></g>
      </g>
      <g class="sa-tvset">
        <rect x="498" y="250" width="126" height="80" rx="6" fill="#d9cfe6" stroke="#b8aacb" stroke-width="2"/>
        <path d="M512 270 h40 M572 270 h40" stroke="#b8aacb" stroke-width="3" stroke-linecap="round"/>
        <rect x="504" y="158" width="114" height="90" rx="8" fill="#39364a"/>
        <path d="M548 158 L 530 136 M574 158 L 594 134" stroke="#8a86a0" stroke-width="2.4" stroke-linecap="round"/>
      </g>
      <g class="sa-pots">
        ${flowers.map(([x, y, c], i) => `<path d="M${x} 386 C ${x - 2} ${y + 30}, ${x + 3} ${y + 14}, ${x} ${y}" stroke="#6aa84a" stroke-width="3" fill="none"/><g transform="translate(${x} ${y})"><circle r="7" fill="${c}"/><circle cx="-6" cy="-3" r="5" fill="${c}"/><circle cx="6" cy="-3" r="5" fill="${c}"/><circle cx="0" cy="-8" r="5" fill="${c}"/><circle r="3" fill="#ffe27a"/></g>${i === 2 ? `<path d="M${x + 5} ${y + 22} a3 3 0 0 0 5 0 a3 3 0 0 0 5 0" fill="none" stroke="#3a6a2a" stroke-width="1.4"/>` : ''}`).join('')}
        <path d="M566 380 h64 l-7 34 h-50 z" fill="#e39a7a" stroke="#b8704f" stroke-width="2"/><rect x="562" y="374" width="72" height="10" rx="3" fill="#ecac8e"/>
      </g>
    </svg>`;
  }

  // 藏身处（占舞台宽高的百分比；与背景 SVG 同比例）：x, y 为小羊中心，w 为宽度、flip 为朝向
  const SPOTS = { hood: [9.6, 29, 12.5, 1], guitar: [45.2, 61, 14, -1], tv: [87.5, 29.5, 13.5, -1], flower: [93.5, 69, 11.5, -1], icecream: [72.5, 62, 12.5, -1], toys: [58, 17, 11.5, 1] };
  function alterHTML(S) {
    return `<div class="sh-stage sa-stage" data-reveal>
        <div class="sa-scene">
          ${loungeBackdrop()}
          <span class="sa-toys" aria-hidden="true"><i class="t1"></i><i class="t2"></i><i class="t3"></i></span>
          <button type="button" class="sa-tv" aria-label="电视机：换一个节目"><span class="sa-tv-t mono">OFF</span><span class="sa-tv-n">休息室电视</span></button>
          <span class="sa-watch" aria-hidden="true">${lamb('pink')}${lamb('pink')}</span>
          <span class="sa-plate" aria-hidden="true"></span>
          ${S.spots.map((s) => {
            const [x, y, w, f] = SPOTS[s.key] || [50, 50, 10, 1];
            return `<button type="button" class="sa-spot" data-spot="${s.key}" style="left:${x}%;top:${y}%;width:${w}%;--sf:${f}" aria-label="看不见的小羊藏在：${esc(s.name)}"><span class="sa-lamb">${lamb('pink')}</span></button>`;
          }).join('')}
          <span class="sa-guide" aria-hidden="true"><i class="sa-hand"></i><b></b></span>
        </div>
        <span class="sh-count mono">找到 0 / ${S.spots.length}</span>
        <div class="sh-tools sa-tools">${voiceChip(S)}</div>
        <p class="sb-caption sa-caption" aria-live="polite">舰上总有看不见的粉色小羊。把手伸过去——她会告诉你往哪边摸。</p>
        <div class="sa-pocket" role="status" hidden></div>
      </div>
      <div class="sh-acts sa-feed" role="group" aria-label="防啃指南：往餐桌上摆点什么">
        <span class="sa-feed-h mono">防啃指南</span>
        ${S.feed.map(([k, l]) => `<button type="button" class="sh-act" data-feed="${k}"><span class="sa-ico">${ICON[k]()}</span>${esc(l)}</button>`).join('')}
      </div>
      ${S.duty ? dutyHTML(S) : ''}`;
  }
  /* 医疗：今日值班表（按模组里的三条建议逐项打勾；全部完成盖一个章） */
  function dutyHTML(S) {
    return `<div class="panel sa-duty" data-reveal>
      <div class="sh-log-h mono"><span>DUTY ROSTER</span><span>防啃指南 · 今日值班 <b class="sd-n">0</b> / ${S.duty.length}</span></div>
      <ol class="sd-list">${S.duty.map(([k, t, d], i) => `<li data-duty="${k}" style="--i:${i}"><i class="sd-box" aria-hidden="true"></i><div><b>${esc(t)}</b><p>${esc(d)}</p></div></li>`).join('')}</ol>
      <p class="sd-src">—— 模组「想要留下的生命」· “棉花糖”3号栽培记录</p>
      <span class="sd-stamp" aria-hidden="true"><b>今日</b><b>零啃食</b></span>
    </div>`;
  }

  /* ====================================================
   * 右栏：观察日志（术师：6 条；医疗：4 条 + 怪事登记簿）
   * ==================================================== */
  function notesHTML(S) {
    return `<div class="panel sh-log" data-reveal>
      <div class="sh-log-h mono"><span>OBSERVATION LOG</span><span>观察记录</span></div>
      <ol class="sh-notes">${S.notes.map(([t, d, src], i) => `<li class="sh-note" style="--i:${i}"><span class="n">${String(i + 1).padStart(2, '0')}</span><div><h4>${esc(t)}</h4><p>${esc(d)}</p><cite>${esc(src)}</cite></div></li>`).join('')}</ol>
    </div>`;
  }
  function sideHTML(form, S) {
    if (form === 'base') return notesHTML(S);
    return notesHTML(S) + `<div class="panel sh-cases" data-reveal>
      <div class="sh-log-h mono"><span>INCIDENT LOG</span><span>舰上怪事登记簿 · <b class="sh-cases-n">0</b> / ${S.spots.length}</span></div>
      <ul>${S.spots.map((s) => `<li data-case="${s.key}"><b>${esc(s.name)}</b><p>？？？</p></li>`).join('')}</ul>
    </div>`;
  }

  /** 整个区块的内容（标题由 main.js 的 head() 生成） */
  function html(form, D) {
    const S = D.forms[form].sheep;
    if (!S) return '';
    return `<div class="wrap"><div class="sh-grid sh-${form}">
      <div class="sh-left">${form === 'base' ? baseHTML(S) : alterHTML(S)}</div>
      <div class="sh-side">${sideHTML(form, S)}</div>
    </div></div>`;
  }

  /* ====================================================
   * 交互
   * ==================================================== */
  function mount(root, form, D, env) {
    const S = D.forms[form].sheep;
    if (!S) return { destroy() {} };
    const $ = (s) => root.querySelector(s), $$ = (s) => [...root.querySelectorAll(s)];
    const timers = new Set(), offs = [];
    let alive = true, visible = false, tok = 0;
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };
    const sleep = (ms) => new Promise((r) => later(r, reduce ? Math.min(ms, 120) : ms));
    const on = (el, ev, fn, o) => { if (!el) return; el.addEventListener(ev, fn, o); offs.push(() => el.removeEventListener(ev, fn, o)); };
    const stage = $('.sh-stage');
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) wake(); }, { rootMargin: '80px 0px' });
    io.observe(stage);
    let wake = () => {};
    const sfx = (k) => env.audio && env.audio.sfx(k);
    const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    const pop = (host, x, y, ch, cls = '') => {
      const h = document.createElement('span');
      h.className = 'sh-pop ' + cls;
      h.textContent = ch;
      h.style.left = x + 'px';
      h.style.top = y + 'px';
      host.appendChild(h);
      later(() => h.remove(), 1300);
    };
    on(stage, 'click', (e) => { const b = e.target.closest('[data-shvoice]'); if (b && env.voice) env.voice(+b.dataset.shvoice); });
    const ctl = form === 'base' ? mountBase() : mountAlter();
    return {
      destroy() {
        alive = false;
        tok++;
        io.disconnect();
        timers.forEach(clearTimeout);
        timers.clear();
        offs.forEach((f) => f());
        if (ctl && ctl.destroy) ctl.destroy();
      },
    };

    /* ------------------------------------------------ 术师：小黑羊 */
    function mountBase() {
      const scene = $('.sb-scene'), main = $('.sb-main'), helper = $('.sb-helper');
      const cap = $('.sb-caption'), glove = $('.sb-glove'), grass = $('.sb-grass'), pile = $('.sb-desk-pile');
      const acts = $('.sh-acts:not(.sb-cmds)'), cmds = $('.sb-cmds');
      const st = { temp: 36.5, max: 36.5, pets: 0, books: 0, glove: false, busy: false, asleep: false, mode: 'room', contest: 0 };
      const HOME = 0.47;
      let idleT = 0, blinkT = 0, coolT = 0;

      const say = (text) => { cap.textContent = text; restart(cap, 'flash'); };
      const bub = (a, text) => {
        const b = $(`.${a.classList.contains('sb-helper') ? 'sb-helper' : 'sb-main'} .lb-bub`);
        b.textContent = text;
        restart(b, 'on');
      };
      const setStat = (k, v) => { const el = $(`[data-stat="${k}"]`); if (el) el.textContent = v; };
      /** 位移：xf 为舞台宽度的比例（小羊中心），dy 为向上抬起的像素 */
      /** 瞬移（不播放过渡）：用于看不见的时候换位置 */
      function place(a, xf) {
        a.classList.add('tele');
        a.style.setProperty('--x', xf);
        a.style.setProperty('--tx', ((xf - HOME) * scene.clientWidth).toFixed(1) + 'px');
        a.style.setProperty('--ty', '0px');
        void a.offsetWidth;
        a.classList.remove('tele');
      }
      function go(a, xf, dur = 900, dy = 0) {
        const W = scene.clientWidth;
        const cur = parseFloat(a.style.getPropertyValue('--x')) || HOME;
        a.classList.toggle('face-l', xf < cur - 0.002 ? true : xf > cur + 0.002 ? false : a.classList.contains('face-l'));
        a.style.setProperty('--x', xf);
        a.style.setProperty('--tx', ((xf - HOME) * W).toFixed(1) + 'px');
        a.style.setProperty('--ty', (-dy).toFixed(1) + 'px');
        a.style.setProperty('--dur', (reduce ? 120 : dur) + 'ms');
        a.classList.add('walk');
        return sleep(dur).then(() => a.classList.remove('walk'));
      }
      function heat(dt) {
        st.temp = clamp(st.temp + dt, 36.5, 130);
        if (st.temp > st.max) { st.max = st.temp; setStat('max', st.max.toFixed(1) + '°'); }
        paintTemp();
        clearTimeout(coolT);
        coolT = later(cool, 700);
      }
      function cool() {
        if (st.temp <= 36.5) return;
        // 越烫降得越快：从一百多度回到常温大约十来秒
        st.temp = Math.max(36.5, st.temp - (st.asleep ? 1.8 : 1.2) - (st.temp - 36.5) * 0.035);
        paintTemp();
        if (st.temp > 36.5) coolT = later(cool, 500);
      }
      function paintTemp() {
        const t = st.temp;
        $('.sh-temp').textContent = t.toFixed(1) + '°C';
        $('.sh-thermo').style.setProperty('--t', clamp((t - 20) / 110, 0.05, 1).toFixed(3));
        $('.sh-zone').textContent = t > 100 ? '危险！' : t > 80 ? '烫手' : t > 55 ? '暖烘烘' : '常温';
        stage.style.setProperty('--heat', clamp((t - 45) / 60, 0, 1).toFixed(3));
        main.classList.toggle('warm', t > 55 && t <= 80);
        main.classList.toggle('hot', t > 80);
        plot(t);
      }
      /* 体温曲线：约每 0.5 秒记一个点（连续摸摸时只更新最后一个点），右端是现在，最多记一分钟 */
      const samples = [], chart = $('.sr-chart'), sline = $('.sr-line'), sarea = $('.sr-area'), sdot = $('.sr-dotw');
      let lastPush = 0;
      function plot(t) {
        if (!sline) return;
        const now = performance.now();
        if (samples.length && now - lastPush < 420) samples[samples.length - 1] = t;
        else { samples.push(t); lastPush = now; if (samples.length > 121) samples.shift(); }
        const step = 2.5, x0 = 300 - (samples.length - 1) * step;
        let d = `M0 ${TY(samples[0]).toFixed(1)}H${x0.toFixed(1)}`;
        for (let i = 1; i < samples.length; i++) d += `L${(x0 + i * step).toFixed(1)} ${TY(samples[i]).toFixed(1)}`;
        sline.setAttribute('d', d);
        sarea.setAttribute('d', d + 'V90H0Z');
        sdot.style.transform = `translate3d(0, ${((TY(t) / 90) * 100).toFixed(1)}%, 0)`;
        if (t > 36.6) chart.classList.add('live');
        chart.classList.toggle('hot', t > 100);
      }
      function sleepNow(on) {
        st.asleep = on;
        main.classList.toggle('sleep', on);
        if (on) say('它找了块宽敞的地方，睡着了。蓬松的背，正好能当枕头。');
      }
      function nudge() {
        clearTimeout(idleT);
        if (st.mode !== 'room') return;
        idleT = later(() => { if (!st.busy && !st.asleep && st.mode === 'room') { if (visible) sleepNow(true); else nudge(); } }, 14000);
      }
      function blink() {
        clearTimeout(blinkT);
        blinkT = later(() => {
          if (visible && !st.asleep && !reduce) { main.classList.add('blink'); later(() => main.classList.remove('blink'), 140); }
          blink();
        }, 2600 + Math.random() * 3200);
      }
      wake = () => { blink(); nudge(); };

      function petAt(x, y) {
        if (st.busy) return;
        st.pets++;
        setStat('pets', st.pets);
        const wasAsleep = st.asleep;
        if (wasAsleep) sleepNow(false);
        heat(st.glove ? 2.5 : 8);
        const r = scene.getBoundingClientRect();
        const lx = x - r.left, ly = y - r.top;
        restart(main, 'hop');
        if (wasAsleep) { bub(main, '咩？！'); say('被吵醒了——不过看起来并没有生气。'); pop(scene, lx, ly, '!'); sfx('tick'); }
        else if (st.glove) { bub(main, pick(['咩~', '咩♪', '咩！'])); pop(scene, lx, ly, '♥'); say('戴着隔热手套，放心地摸。它看起来很高兴。'); sfx('tick'); }
        else if (st.temp > 85) {
          bub(main, '咩！！');
          env.fx.emberBurst(x, y, 26, [80, 300]);
          env.fx.text(x, y - 20, '好烫！', 'rgb(255,120,60)', { size: 22, vx: 0 });
          env.fx.shake(4, 0.25);
          sfx('boom');
          say('好烫！它高兴过头了——生气或高兴时，小黑羊的身体会变得极烫。');
        } else {
          bub(main, '咩！');
          pop(scene, lx, ly, st.temp > 60 ? '♨' : '♥');
          say(st.temp > 60 ? '越摸越烫……再摸下去，最好戴上手套。' : '毛茸茸的，暖乎乎的。');
          sfx('tick');
        }
        main.classList.add('happy');
        later(() => main.classList.remove('happy'), 900);
        nudge();
      }

      async function feed() {
        if (st.busy) return;
        st.busy = true;
        const my = ++tok;
        if (st.asleep) sleepNow(false);
        await go(main, HOME, 300);
        grass.classList.remove('gone');
        restart(grass, 'in');
        say('一小把鲜草。它最喜欢悠闲地吃草——也只有这时候，才会在舰上露面。');
        await sleep(450);
        if (my !== tok) return;
        main.classList.add('eat');
        bub(main, '（嚼嚼）');
        for (let i = 0; i < 3; i++) { await sleep(520); if (my !== tok) return; grass.style.setProperty('--gl', (1 - (i + 1) / 3).toFixed(2)); }
        main.classList.remove('eat');
        grass.classList.add('gone');
        later(() => grass.style.removeProperty('--gl'), 600);
        heat(4);
        bub(main, '咩~');
        st.busy = false;
        nudge();
      }

      async function carry() {
        if (st.busy) return;
        st.busy = true;
        const my = ++tok;
        if (st.asleep) sleepNow(false);
        say('它会帮她搬书、递东西。');
        await go(main, 0.84, 1100);
        if (my !== tok) return;
        main.classList.add('loaded');
        bub(main, '咩！');
        // 需要帮忙的时候，另一只会忽然出现
        place(helper, 0.93);
        helper.classList.add('here');
        await sleep(360);
        if (my !== tok) return;
        helper.classList.add('loaded', 'face-l');
        say('另一只小黑羊不知从哪儿冒了出来，也驮起一本——需要它们的时候，它们总会忽然出现。');
        const g2 = go(helper, 0.38, 1500);
        await go(main, 0.27, 1300);
        if (my !== tok) return;
        main.classList.remove('loaded');
        st.books++;
        setStat('books', st.books);
        pile.style.setProperty('--books', Math.min(6, st.books));
        pile.classList.add('has');
        await g2;
        helper.classList.remove('loaded');
        st.books++;
        setStat('books', st.books);
        pile.style.setProperty('--books', Math.min(6, st.books));
        helper.classList.add('vanish');
        await sleep(700);
        helper.classList.remove('here', 'vanish', 'face-l');
        place(helper, 0.93);
        await go(main, HOME, 900);
        bub(main, '咩~');
        say(`书搬到书桌上了（已经 ${st.books} 本）。帮完忙，那只小黑羊又不见了。`);
        heat(3);
        st.busy = false;
        nudge();
      }

      /* ---------- 宠物大赛 ---------- */
      const C = S.contest;
      const setCmd = (k, dis) => { const b = $(`[data-sbc="${k}"]`); if (b) b.disabled = dis; };
      async function contestEnter() {
        if (st.busy) return;
        tok++;
        st.mode = 'contest';
        st.contest = 0;
        clearTimeout(idleT);
        if (st.asleep) sleepNow(false);
        stage.classList.add('contest');
        stage.classList.remove('won', 'tie-on', 'mom-down', 'dad-down', 'kid-q');
        acts.hidden = true;
        cmds.hidden = false;
        C.steps.forEach(([k], i) => setCmd(k, i > 0));
        const rb = $(`[data-sbc="${C.rescue[0]}"]`);
        rb.hidden = true;
        say('亲子宠物大赛 · 第一赛段。前一晚，小羊已经听她把流程讲了三遍。');
        st.busy = true;
        await go(main, 0.1, 700);
        st.busy = false;
        const b = $(`[data-sbc="${C.steps[0][0]}"]`);
        if (b) b.focus({ preventScroll: true });
      }
      async function contestStep(k) {
        if (st.busy || st.mode !== 'contest') return;
        st.busy = true;
        const my = ++tok;
        const idx = C.steps.findIndex((s) => s[0] === k);
        if (idx >= 0) setCmd(k, true);
        if (k === 'hoop') {
          stage.classList.remove('won');
          if ((parseFloat(main.style.getPropertyValue('--x')) || HOME) > 0.15) { await go(main, 0.1, 700); if (my !== tok) return; }
          say(C.steps[0][2]);
          const w = go(main, 0.44, 1100);
          await sleep(420);
          restart(main, 'jump');
          await w;
          bub(main, '咩！');
          setCmd('beam', false);
        } else if (k === 'beam') {
          const H = scene.clientHeight;
          await go(main, 0.54, 600, H * 0.05);
          if (my !== tok) return;
          await go(main, 0.62, 700, H * 0.1);
          if (my !== tok) return;
          restart(main, 'wobble');
          say(C.steps[1][2]);
          await go(main, 0.72, 800, H * 0.1);
          await go(main, 0.78, 400, 0);
          setCmd('forget', false);
        } else if (k === 'forget') {
          say(C.steps[2][2]);
          stage.classList.add('kid-q');
          bub(main, '……？');
          await sleep(1100);
          if (my !== tok) return;
          say(C.wild);
          main.classList.add('wild');
          for (let i = 0; i < 7; i++) {
            // 第四圈冲向场边——爸爸妈妈被撞翻了
            await go(main, i === 3 ? 0.68 : 0.12 + Math.random() * 0.76, i === 3 ? 420 : 300, i !== 3 && Math.random() < 0.3 ? 14 : 0);
            if (my !== tok) return;
            if (i === 3) {
              stage.classList.add('mom-down', 'dad-down');
              env.fx.shake(3, 0.2);
              sfx('boom');
              const fr = $('.sb-dad').getBoundingClientRect(), sr = scene.getBoundingClientRect();
              pop(scene, fr.left - sr.left, fr.top - sr.top, '!!');
            }
            if (i === 2 || i === 5) { const r = main.getBoundingClientRect(); env.fx.emberBurst(r.left + r.width / 2, r.bottom - 10, 10, [40, 160]); }
          }
          main.classList.remove('wild');
          bub(main, '咩咩咩！');
          $(`[data-sbc="${C.rescue[0]}"]`).hidden = false;
          $(`[data-sbc="${C.rescue[0]}"]`).focus({ preventScroll: true });
        } else if (k === C.rescue[0]) {
          $(`[data-sbc="${C.rescue[0]}"]`).hidden = true;
          stage.classList.remove('dad-down', 'kid-q');
          stage.classList.add('tie-on');
          say(C.rescueText);
          await go(main, 0.5, 900);
          if (my !== tok) return;
          await go(main, 0.86, 1000);
          if (my !== tok) return;
          stage.classList.remove('tie-on', 'mom-down');
          say(C.flip);
          restart(main, 'flipping');
          await sleep(900);
          const r = main.getBoundingClientRect();
          env.fx.emberBurst(r.left + r.width / 2, r.top + r.height * 0.4, 40, [120, 420]);
          sfx('sparkle');
          await sleep(700);
          bub(main, '咩！');
          say(C.protest);
          const sr = scene.getBoundingClientRect();
          for (let i = 0; i < 4; i++) later(() => pop(scene, r.left - sr.left + r.width * (0.3 + Math.random() * 0.4), r.top - sr.top + r.height * 0.3, '♥'), i * 160);
          stage.classList.add('won');
          st.contest++;
          setStat('contest', '完赛 ×' + st.contest);
          await sleep(1800);
          say(C.end);
          C.steps.forEach(([kk], i) => setCmd(kk, i > 0));
        }
        st.busy = false;
      }
      async function contestQuit() {
        tok++;
        st.busy = true;
        stage.classList.remove('contest', 'won', 'tie-on', 'mom-down', 'dad-down', 'kid-q');
        main.classList.remove('wild');
        cmds.hidden = true;
        acts.hidden = false;
        st.mode = 'room';
        await go(main, HOME, 600);
        st.busy = false;
        say('回到书房。它打了个哈欠。');
        nudge();
      }

      on(glove, 'click', () => {
        st.glove = !st.glove;
        glove.textContent = `隔热手套 · ${st.glove ? '开' : '关'}`;
        glove.setAttribute('aria-pressed', st.glove);
        glove.classList.toggle('on', st.glove);
        say(st.glove ? '戴好隔热手套了。现在可以放心地摸。' : '摘下手套。小心，它一高兴就会发烫。');
      });
      on(main, 'click', (e) => {
        if (st.mode !== 'room') return;
        const r = main.getBoundingClientRect();
        petAt(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 3);
      });
      on(root.querySelector('.sh-left'), 'click', (e) => {
        const b = e.target.closest('[data-sb]');
        if (b) {
          const k = b.dataset.sb;
          if (k === 'pet') { const r = main.getBoundingClientRect(); petAt(r.left + r.width * 0.5, r.top + r.height * 0.35); }
          else if (k === 'feed') feed();
          else if (k === 'carry') carry();
          else if (k === 'nap') { if (!st.busy) { sleepNow(!st.asleep); if (!st.asleep) { bub(main, '咩？'); say('醒了。'); nudge(); } } }
          else if (k === 'contest') contestEnter();
          return;
        }
        const c = e.target.closest('[data-sbc]');
        if (c) { if (c.dataset.sbc === 'quit') contestQuit(); else contestStep(c.dataset.sbc); }
      });
      // 窗口尺寸变化：位移是按像素算的，重新对齐
      const onResize = () => [main, helper].forEach((a) => a.style.setProperty('--tx', (((parseFloat(a.style.getPropertyValue('--x')) || HOME) - HOME) * scene.clientWidth).toFixed(1) + 'px'));
      on(window, 'resize', onResize, { passive: true });
      place(helper, 0.93);
      paintTemp();
      return { destroy() { tok++; } };
    }

    /* ------------------------------------------------ 医疗：看不见的小羊 */
    function mountAlter() {
      const scene = $('.sa-scene'), guide = $('.sa-guide'), gtext = $('.sa-guide b'), cap = $('.sa-caption');
      const found = new Set(), spots = $$('.sa-spot');
      const total = spots.length;
      let raf = 0, px = 0, py = 0, tv = -1, near = null, guideT = 0;
      const say = (t) => { cap.textContent = t; restart(cap, 'flash'); };

      function hint(dx, dy, d, R) {
        if (d < R * 1.8) return pick(['对，就在这儿……', '再近一点点——']);
        const ax = Math.abs(dx), ay = Math.abs(dy);
        const h = dx > 0 ? '右' : '左', v = dy > 0 ? '下' : '上';
        if (ax > ay * 1.6) return `往${h}边一点`;
        if (ay > ax * 1.6) return `再往${v}一点`;
        return `${h}边，再往${v}一点`;
      }
      /** 指针（或手指）在舞台上的位置 → 最近的一只没找到的小羊给出方向；足够近就找到它 */
      function sense(cx, cy, tap) {
        const r = scene.getBoundingClientRect();
        const x = cx - r.left, y = cy - r.top, R = r.width * 0.07;
        let best = null, bd = 1e9, bdx = 0, bdy = 0;
        for (const s of spots) {
          if (found.has(s.dataset.spot)) continue;
          const b = s.getBoundingClientRect();
          const dx = b.left + b.width / 2 - cx, dy = b.top + b.height / 2 - cy, d = Math.hypot(dx, dy);
          if (d < bd) { bd = d; best = s; bdx = dx; bdy = dy; }
        }
        if (near && near !== best) near.classList.remove('near');
        near = best;
        if (!best) { guide.classList.remove('on'); return; }
        best.classList.toggle('near', bd < R * 2.6);
        if (bd < R * (tap ? 1.35 : 0.9)) { find(best, cx, cy); return; }
        gtext.textContent = hint(bdx, bdy, bd, R);
        guide.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
        guide.classList.toggle('flip', x > r.width * 0.7);
        guide.classList.add('on');
        clearTimeout(guideT);
        guideT = later(() => guide.classList.remove('on'), tap ? 1600 : 2400);
      }
      function find(s, cx, cy) {
        const k = s.dataset.spot;
        if (found.has(k)) return;
        found.add(k);
        s.classList.remove('near');
        s.classList.add('found');
        s.setAttribute('aria-label', '找到了：' + (S.spots.find((x) => x.key === k) || {}).name);
        guide.classList.remove('on');
        const r = s.getBoundingClientRect();
        env.fx.ashBurst(cx || r.left + r.width / 2, cy || r.top + r.height / 2, 22, [80, 260]);
        sfx('sparkle');
        const info = S.spots.find((x) => x.key === k);
        gtext.textContent = '';
        say(`对，您现在摸到它啦。${info ? info.note : ''}`);
        const li = $(`[data-case="${k}"]`);
        if (li && info) { li.classList.add('open'); li.querySelector('p').innerHTML = `${esc(info.note)}<cite>${esc(info.src)}</cite>`; }
        const n = found.size;
        $('.sh-count').textContent = `找到 ${n} / ${total}`;
        const cn = $('.sh-cases-n');
        if (cn) cn.textContent = n;
        if (n === total) {
          later(() => {
            say(S.found);
            stage.classList.add('all');
            env.toast('全部找到啦！小羊们决定把你当成自己人。');
            const st = scene.getBoundingClientRect();
            env.fx.ashBurst(st.left + st.width / 2, st.top + st.height / 2, 70, [200, 640]);
          }, 900);
        }
      }
      const onMove = (e) => {
        if (e.pointerType === 'touch') return;
        px = e.clientX; py = e.clientY;
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (alive) sense(px, py, false); });
      };
      on(scene, 'pointermove', onMove, { passive: true });
      on(scene, 'pointerleave', () => { guide.classList.remove('on'); if (near) near.classList.remove('near'); });
      on(scene, 'click', (e) => {
        const tvb = e.target.closest('.sa-tv');
        if (tvb) { switchTV(); return; }
        // 直接点中（或用键盘选中）藏身处就算摸到；点在别处，她会告诉你往哪边
        const s = e.target.closest('.sa-spot');
        if (s) { find(s, e.clientX, e.clientY); return; }
        sense(e.clientX, e.clientY, true);
      });

      /* ---------- 电视：准点播出的节目能让它们安分些 ---------- */
      function switchTV() {
        tv = tv + 1 >= S.tv.length ? -1 : tv + 1;
        const b = $('.sa-tv');
        b.classList.toggle('on', tv >= 0);
        stage.classList.toggle('tv-on', tv >= 0);
        $('.sa-tv-t').textContent = tv >= 0 ? S.tv[tv][0] : 'OFF';
        $('.sa-tv-n').textContent = tv >= 0 ? `《${S.tv[tv][1]}》` : '休息室电视';
        sfx('tick');
        say(tv >= 0 ? `${S.tv[tv][0]}，《${S.tv[tv][1]}》准时开播。沙发上好像多了几团看不清的粉色影子，正对着电视。` : '电视关了。指南上说，最好一直开着。');
        duty('tv', tv >= 0);
      }

      /* ---------- 今日值班表：逐项打勾，全部完成盖章 ---------- */
      const done = new Set(), roster = $('.sa-duty');
      function duty(k, ok = true) {
        const li = roster && roster.querySelector(`[data-duty="${k}"]`);
        if (!li) return;
        if (ok === done.has(k)) return;
        if (ok) done.add(k); else done.delete(k);
        li.classList.toggle('done', ok);
        if (ok) restart(li, 'tick');
        roster.querySelector('.sd-n').textContent = done.size;
        const all = done.size === S.duty.length;
        if (all && !roster.classList.contains('stamped')) {
          roster.classList.add('stamped');
          later(() => {
            say(S.fed);
            sfx('sparkle');
            const r = roster.querySelector('.sd-stamp').getBoundingClientRect();
            env.fx.ashBurst(r.left + r.width / 2, r.top + r.height / 2, 26, [60, 220]);
          }, 500);
        } else if (!all) roster.classList.remove('stamped');
      }

      /* ---------- 防啃指南 ---------- */
      const plate = $('.sa-plate');
      let slot = 0;
      function serve(k) {
        const el = document.createElement('span');
        el.className = 'sa-food f-' + k;
        el.innerHTML = ICON[k]();
        el.style.setProperty('--slot', slot++ % 4);
        plate.appendChild(el);
        sfx('tick');
        later(() => { el.classList.add('bitten'); plate.classList.add('nibble'); later(() => plate.classList.remove('nibble'), 700); }, 1300);
        later(() => el.classList.add('gone'), 3600);
        later(() => el.remove(), 4300);
        if (k === 'marshmallow') {
          say('丢了东西，就在桌上多放一块棉花糖。隔天，记得摸摸口袋。');
          later(() => {
            const p = $('.sa-pocket');
            p.textContent = S.pocket;
            p.hidden = false;
            restart(p, 'on');
            duty('marshmallow');
            later(() => { p.hidden = true; }, 5200);
          }, 2200);
          return;
        }
        const name = (S.feed.find((f) => f[0] === k) || [])[1];
        say(`摆上${name}。${k === 'icecream' ? '水果和冰淇淋的口味每天都要换，一周内最好不重样。' : k === 'fruit' ? '今天是这一种——明天记得换。' : '桌上的东西，转眼就少了一口。'}`);
        duty(k);
      }
      on($('.sa-feed'), 'click', (e) => { const b = e.target.closest('[data-feed]'); if (b) serve(b.dataset.feed); });
      return { destroy() { cancelAnimationFrame(raf); } };
    }
  }

  return { html, mount, lamb };
})();
