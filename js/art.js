/* =========================================================
 * 手绘矢量插画库 —— 全部为本页原创绘制的 SVG
 * 颜色尽量通过 CSS 变量取色，从而随形态主题一起变化
 * ========================================================= */
window.ART = (() => {
  let uid = 0;
  const id = (p) => `${p}${++uid}`;
  const f = (n) => Math.round(n * 100) / 100;
  const TAU = Math.PI * 2;
  const polar = (cx, cy, r, a) => [f(cx + Math.cos(a) * r), f(cy + Math.sin(a) * r)];

  /* ---------------- 徽记：六边形 + 卷角 + 火焰/灰滴 ---------------- */
  function emblem(size = 40, cls = '') {
    const g = id('emg');
    return `<svg class="emblem ${cls}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style="stop-color:var(--c-acc2)"/><stop offset="1" style="stop-color:var(--c-acc)"/>
      </linearGradient></defs>
      <polygon points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5" fill="none" stroke="url(#${g})" stroke-width="2.2"/>
      <polygon points="32,9 52,20.5 52,43.5 32,55 12,43.5 12,20.5" fill="none" stroke="url(#${g})" stroke-width=".8" opacity=".45"/>
      <path d="M27 27 C 24 18, 13 17, 13 25.5 C 13 32, 21 33, 21.5 27.5 C 22 24, 18 23.5, 17.5 26.5" fill="none" stroke="url(#${g})" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M37 27 C 40 18, 51 17, 51 25.5 C 51 32, 43 33, 42.5 27.5 C 42 24, 46 23.5, 46.5 26.5" fill="none" stroke="url(#${g})" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M32 19 C 35 26, 40 30.5, 40 38 A 8 8 0 0 1 24 38 C 24 32.5, 28 30, 29.5 25 C 30.5 28, 31 29, 32 30 C 32.6 27, 32.6 23, 32 19 Z" fill="url(#${g})"/>
      <circle cx="32" cy="39" r="2.6" style="fill:var(--c-bg)"/>
    </svg>`;
  }

  /* ---------------- 本体法阵：卢恩符文 + 六芒 + 刻度 ---------------- */
  function circleBase() {
    const runes = 'ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ ᚷ ᚹ ᚺ ᚾ ᛁ ᛃ ᛇ ᛈ ᛉ ᛊ ᛏ ᛒ ᛖ ᛗ ᛚ ᛜ ᛞ ᛟ ';
    const pid = id('rp'), gid = id('mg'), rid = id('mr');
    const ring = (r) => `M ${250 - r} 250 a ${r} ${r} 0 1 1 ${2 * r} 0 a ${r} ${r} 0 1 1 ${-2 * r} 0`;
    let ticks = '';
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * TAU;
      const [x1, y1] = polar(250, 250, 236, a);
      const [x2, y2] = polar(250, 250, i % 8 === 0 ? 222 : i % 4 === 0 ? 228 : 232, a);
      ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
    const tri = (r, rot) => [0, 1, 2].map((k) => polar(250, 250, r, rot + (k * TAU) / 3).join(',')).join(' ');
    let nodes = '';
    for (let k = 0; k < 6; k++) {
      const [x, y] = polar(250, 250, 176, -Math.PI / 2 + (k * TAU) / 6);
      nodes += `<circle cx="${x}" cy="${y}" r="9"/><circle cx="${x}" cy="${y}" r="3.2" class="fillc"/>`;
    }
    let petals = '';
    for (let k = 0; k < 12; k++) {
      const a = (k * TAU) / 12;
      const [x, y] = polar(250, 250, 92, a);
      petals += `<ellipse cx="${x}" cy="${y}" rx="26" ry="7" transform="rotate(${f((a * 180) / Math.PI)} ${x} ${y})"/>`;
    }
    // 每一圈是一张独立的 <svg>，由外面的 div 整张旋转：旋转交给合成器，不必每帧重绘整个法阵
    // （不能直接转 svg 根元素：符文文字会随根元素的变换重排，反而每帧重绘）
    const L = (cls, body) => `<div class="mc-layer ${cls}"><svg viewBox="0 0 500 500">${body}</svg></div>`;
    return `<div class="mcircle mc-base" aria-hidden="true">
      ${L('mc-glow', `<defs>
        <path id="${pid}" d="${ring(203)}"/>
        <radialGradient id="${gid}"><stop offset="0" style="stop-color:var(--c-acc2);stop-opacity:.55"/><stop offset=".55" style="stop-color:var(--c-acc);stop-opacity:.12"/><stop offset="1" style="stop-color:var(--c-acc);stop-opacity:0"/></radialGradient>
        <linearGradient id="${rid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--c-acc2)"/><stop offset=".5" style="stop-color:var(--c-acc)"/><stop offset="1" style="stop-color:var(--c-acc3)"/></linearGradient>
      </defs>
      <circle cx="250" cy="250" r="250" fill="url(#${gid})"/>`)}
      ${L('mc-l1', `<g stroke="url(#${rid})" fill="none">
        <circle cx="250" cy="250" r="244" stroke-width="2"/>
        <circle cx="250" cy="250" r="238" stroke-width=".7" stroke-dasharray="2 6"/>
        <g stroke-width="1.2">${ticks}</g>
      </g>`)}
      ${L('mc-l2', `<circle cx="250" cy="250" r="216" fill="none" stroke="url(#${rid})" stroke-width="1"/>
        <circle cx="250" cy="250" r="190" fill="none" stroke="url(#${rid})" stroke-width="1.6"/>
        <text class="mc-runes"><textPath href="#${pid}">${runes.repeat(2)}</textPath></text>`)}
      ${L('mc-l3', `<g stroke="url(#${rid})" fill="none" stroke-width="1.4">
        <polygon points="${tri(176, -Math.PI / 2)}"/>
        <polygon points="${tri(176, Math.PI / 2)}"/>
        <circle cx="250" cy="250" r="128" stroke-dasharray="14 5 2 5"/>
        ${nodes}
      </g>`)}
      ${L('mc-l4', `<g stroke="url(#${rid})" fill="none" stroke-width="1">
        ${petals}
        <rect x="200" y="200" width="100" height="100" transform="rotate(45 250 250)"/>
        <rect x="200" y="200" width="100" height="100"/>
        <circle cx="250" cy="250" r="44" stroke-width="1.6"/>
      </g>`)}
    </div>`;
  }

  /* ---------------- 纯烬光环：晶花 + 灰羽 + 彩虹 ---------------- */
  function circleAlter() {
    const ig = id('ir'), gg = id('ag'), cg = id('cg');
    let shards = '';
    for (let k = 0; k < 36; k++) {
      const a = (k * TAU) / 36;
      const long = k % 3 === 0;
      const r1 = 188, r2 = long ? 246 : 222, w = long ? 0.05 : 0.035;
      const p = [polar(250, 250, r1, a), polar(250, 250, (r1 + r2) / 2, a - w), polar(250, 250, r2, a), polar(250, 250, (r1 + r2) / 2, a + w)];
      shards += `<polygon points="${p.map((q) => q.join(',')).join(' ')}" class="${long ? 'sh-l' : 'sh-s'}"/>`;
    }
    let petals = '';
    for (let k = 0; k < 10; k++) {
      const a = (k * TAU) / 10 - Math.PI / 2;
      const [x, y] = polar(250, 250, 128, a);
      const deg = f((a * 180) / Math.PI + 90);
      petals += `<path d="M ${x} ${f(y - 44)} C ${f(x + 22)} ${f(y - 22)}, ${f(x + 18)} ${f(y + 22)}, ${x} ${f(y + 40)} C ${f(x - 18)} ${f(y + 22)}, ${f(x - 22)} ${f(y - 22)}, ${x} ${f(y - 44)} Z" transform="rotate(${deg} ${x} ${y})"/>`;
    }
    let feathers = '';
    for (let k = 0; k < 8; k++) {
      const a = (k * TAU) / 8 + Math.PI / 8;
      const [x, y] = polar(250, 250, 176, a);
      const deg = f((a * 180) / Math.PI);
      feathers += `<g transform="translate(${x} ${y}) rotate(${deg})"><path d="M -26 0 C -10 -9, 12 -9, 26 0 C 12 7, -10 7, -26 0 Z" class="fe"/><line x1="-28" y1="0" x2="26" y2="0" class="fq"/></g>`;
    }
    // 闪烁的星星各自是一张小 <svg>，用 CSS 缩放 / 透明度动画（合成器完成）
    let stars = '';
    const sp = [[70, 110, 9], [420, 90, 7], [440, 380, 10], [86, 402, 6], [250, 18, 8], [470, 250, 6], [30, 250, 7]];
    sp.forEach(([x, y, r], i) => {
      stars += `<svg class="mc-star" viewBox="-1 -1 2 2" style="left:${f(x / 5)}%;top:${f(y / 5)}%;width:${f((r * 2) / 5)}%;animation-delay:${i * 0.4}s"><path d="M 0 -1 Q 0 0 1 0 Q 0 0 0 1 Q 0 0 -1 0 Q 0 0 0 -1 Z" fill="url(#${ig}s)"/></svg>`;
    });
    const L = (cls, body) => `<div class="mc-layer ${cls}"><svg viewBox="0 0 500 500">${body}</svg></div>`;
    return `<div class="mcircle mc-alter" aria-hidden="true">
      ${L('mc-glow', `<defs>
        <linearGradient id="${ig}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f7a1b5"/><stop offset=".25" stop-color="#ffd9a0"/><stop offset=".5" stop-color="#aee9d1"/><stop offset=".75" stop-color="#9fd0ff"/><stop offset="1" stop-color="#c9a8ff"/>
        </linearGradient>
        <linearGradient id="${ig}s" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f7a1b5"/><stop offset=".5" stop-color="#aee9d1"/><stop offset="1" stop-color="#c9a8ff"/>
        </linearGradient>
        <radialGradient id="${gg}"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".45" stop-color="#e8f2ff" stop-opacity=".35"/><stop offset="1" stop-color="#e8f2ff" stop-opacity="0"/></radialGradient>
        <linearGradient id="${cg}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b9d7f5"/></linearGradient>
      </defs>
      <circle cx="250" cy="250" r="250" fill="url(#${gg})"/>`)}
      ${L('mc-l1', `<g fill="url(#${cg})" stroke="url(#${ig})" stroke-width=".8">${shards}</g>`)}
      ${L('mc-l2', `<g fill="none" stroke="url(#${ig})">
        <circle cx="250" cy="250" r="200" stroke-width="2.2"/>
        <circle cx="250" cy="250" r="192" stroke-width=".8" stroke-dasharray="1 7"/>
        ${feathers}
      </g>`)}
      ${L('mc-l3', `<g fill="rgba(255,255,255,.25)" stroke="url(#${ig})" stroke-width="1.3">${petals}</g>`)}
      ${L('mc-l4', `<g fill="none" stroke="url(#${ig})">
        <circle cx="250" cy="250" r="70" stroke-width="1.5" stroke-dasharray="3 5"/>
        <circle cx="250" cy="250" r="54" stroke-width="2.4"/>
      </g>`)}
      ${stars}
    </div>`;
  }

  /* ---------------- 小羊（黑羊 / 发烫 / 粉色多利分身） ---------------- */
  function sheep(variant = 'black', cls = '') {
    const wool = [[70, 52, 26], [48, 60, 20], [93, 56, 22], [79, 71, 20], [57, 73, 18], [105, 68, 15], [66, 35, 18], [89, 38, 17], [110, 50, 13]];
    const hi = [[62, 40, 7], [85, 42, 6], [50, 55, 5], [98, 58, 5]];
    return `<svg class="sheep sheep-${variant} ${cls}" viewBox="0 0 140 112" aria-hidden="true">
      <g class="sh-steam" fill="none" stroke-linecap="round">
        <path d="M60 18 C 54 12, 66 8, 60 1"/><path d="M76 16 C 70 9, 82 5, 76 -3"/><path d="M92 19 C 86 12, 98 8, 92 1"/>
      </g>
      <g class="sh-legs">
        <rect class="l" x="47" y="80" width="9" height="22" rx="4.5"/><rect class="l" x="62" y="83" width="9" height="21" rx="4.5"/>
        <rect class="l" x="84" y="83" width="9" height="21" rx="4.5"/><rect class="l" x="99" y="80" width="9" height="22" rx="4.5"/>
      </g>
      <g class="sh-body">
        <circle class="w" cx="121" cy="56" r="8"/>
        ${wool.map(([x, y, r]) => `<circle class="w" cx="${x}" cy="${y}" r="${r}"/>`).join('')}
        ${hi.map(([x, y, r]) => `<circle class="wh" cx="${x}" cy="${y}" r="${r}"/>`).join('')}
      </g>
      <g class="sh-head">
        <ellipse class="f" cx="45" cy="47" rx="9" ry="4.6" transform="rotate(-28 45 47)"/>
        <ellipse class="f" cx="31" cy="58" rx="15.5" ry="17"/>
        <circle class="w" cx="34" cy="42" r="7.5"/><circle class="w" cx="26" cy="44" r="6"/><circle class="w" cx="41" cy="45" r="5.5"/>
        <path class="h" d="M41 47 C 52 45, 56 31, 47 27 C 38 23, 32 32, 38 36 C 42 38, 45 34, 43 31.5"/>
        <ellipse class="eye" cx="24.5" cy="58" rx="2.7" ry="3.5"/>
        <circle cx="23.6" cy="56.8" r=".9" fill="#fff"/>
        <ellipse class="blush" cx="22" cy="66" rx="4.2" ry="2.4"/>
        <path class="mouth" d="M17 69 q 2.2 2, 4.4 0"/>
      </g>
    </svg>`;
  }

  /* ---------------- 火山剖面图（现实中的 Eyjafjallajökull） ---------------- */
  function volcanoDiagram(spots) {
    const sky = id('vs'), mag = id('vm'), lav = id('vl'), ice = id('vi'), clip = id('vc'), rock = id('vr');
    let puffs = '';
    const pf = [[400, 120, 26], [384, 96, 30], [420, 88, 28], [396, 66, 34], [436, 58, 30], [366, 60, 26], [410, 38, 36], [450, 30, 30], [372, 28, 30], [480, 44, 22], [340, 40, 20]];
    pf.forEach(([x, y, r], i) => { puffs += `<circle cx="${x}" cy="${y}" r="${r}" style="animation-delay:${(i * 0.37).toFixed(2)}s"/>`; });
    let dots = '';
    spots.forEach((s, i) => {
      dots += `<g class="vspot" data-i="${i}" tabindex="0" role="button" aria-label="${s.title}" transform="translate(${s.x} ${s.y})">
        <circle r="18" class="vs-ring"/><circle r="7" class="vs-dot"/><text y="-24" text-anchor="middle">${s.title}</text></g>`;
    });
    const mountain = '0,432 110,372 190,300 250,236 332,160 366,140 434,140 468,160 560,242 690,352 800,420 800,520 0,520';
    return `<svg class="volcano-svg" viewBox="0 0 800 520" role="img" aria-label="艾雅法拉冰盖火山剖面示意图">
      <defs>
        <linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--v-sky1)"/><stop offset="1" style="stop-color:var(--v-sky2)"/></linearGradient>
        <radialGradient id="${mag}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff3b0"/><stop offset=".3" stop-color="#ffb030"/><stop offset=".65" stop-color="#ff4a12"/><stop offset="1" stop-color="#6a0d08" stop-opacity=".0"/></radialGradient>
        <linearGradient id="${lav}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3a0a"/><stop offset=".6" stop-color="#ff8a1c"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
        <linearGradient id="${ice}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#bfe0f6"/></linearGradient>
        <linearGradient id="${rock}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b4d4f"/><stop offset="1" stop-color="#2a2123"/></linearGradient>
        <clipPath id="${clip}"><polygon points="${mountain}"/></clipPath>
      </defs>
      <rect width="800" height="520" fill="url(#${sky})"/>
      <g class="v-plume">${puffs}</g>
      <polygon points="${mountain}" fill="url(#${rock})"/>
      <g clip-path="url(#${clip})" class="v-strata">
        <path d="M0 330 C 150 300, 300 330, 420 300 S 700 320, 800 300 L 800 520 L 0 520 Z" fill="#3e3234"/>
        <path d="M0 380 C 160 360, 300 390, 440 360 S 690 380, 800 360 L 800 520 L 0 520 Z" fill="#33292b"/>
        <path d="M0 250 C 160 240, 280 260, 420 236 S 690 250, 800 236 L 800 300 C 700 320, 560 300, 420 300 S 150 300, 0 330 Z" fill="#4a3d3f" opacity=".8"/>
        <path d="M0 420 C 200 408, 330 430, 480 410 S 700 424, 800 410 L 800 520 L 0 520 Z" fill="#241c1e"/>
      </g>
      <path class="v-ice" d="M318 172 C 330 160, 346 150, 358 142 L 442 142 C 456 150, 470 160, 486 176 C 478 180, 470 176, 464 184 C 456 178, 450 186, 442 182 C 436 190, 426 184, 420 188 C 412 182, 404 190, 396 184 C 388 190, 380 182, 372 188 C 364 180, 356 186, 350 180 C 342 186, 336 178, 328 182 C 324 176, 320 178, 318 172 Z" fill="url(#${ice})"/>
      <path class="v-dike" d="M396 408 C 330 386, 262 352, 186 302" fill="none" stroke="url(#${lav})" stroke-width="6" stroke-linecap="round"/>
      <path class="v-flow" d="M186 300 C 168 318, 150 336, 118 368" fill="none" stroke="#ff7a1a" stroke-width="5" stroke-linecap="round"/>
      <g class="v-fountain"><circle cx="186" cy="290" r="5"/><circle cx="180" cy="280" r="3.5"/><circle cx="193" cy="276" r="3"/><circle cx="186" cy="266" r="2.4"/></g>
      <path class="v-conduit" d="M400 144 C 394 200, 408 250, 398 300 S 404 380, 400 440" fill="none" stroke="url(#${lav})" stroke-width="16" stroke-linecap="round"/>
      <path class="v-conduit-flow" d="M400 440 C 404 380, 392 350, 398 300 S 394 200, 400 144" fill="none" stroke="#fff1b8" stroke-width="3" stroke-linecap="round" stroke-dasharray="6 22"/>
      <ellipse class="v-crater" cx="400" cy="142" rx="34" ry="6" fill="#ffb347"/>
      <ellipse class="v-chamber" cx="400" cy="462" rx="170" ry="56" fill="url(#${mag})"/>
      <g class="v-labels">
        <text x="20" y="506">冰岛南部 · 63.63°N 19.62°W</text>
        <text x="780" y="506" text-anchor="end">示意图 · 非比例</text>
      </g>
      <g class="v-spots">${dots}</g>
    </svg>`;
  }

  /* ---------------- 技能徽记（手绘，与官方图标并列） ---------------- */
  const skillEmblems = {
    chant: `<circle cx="40" cy="50" r="24"/><circle cx="60" cy="50" r="24"/><circle cx="50" cy="50" r="36" stroke-dasharray="3 5"/><path d="M50 36 L53 47 L64 50 L53 53 L50 64 L47 53 L36 50 L47 47 Z" class="fc"/>`,
    ignite: `<path d="M50 20 C 58 34, 70 42, 70 58 A 20 20 0 0 1 30 58 C 30 46, 40 40, 43 30 C 46 38, 48 40, 50 42 C 52 36, 52 28, 50 20 Z" class="fc"/><path d="M50 70 A 8 8 0 0 1 42 62 C 42 56, 48 54, 50 48 C 52 54, 58 56, 58 62 A 8 8 0 0 1 50 70 Z" class="fb"/><path d="M16 50 H 24 M76 50 H 84 M26 22 L 32 28 M74 22 L 68 28 M26 78 L32 72 M74 78 L 68 72"/>`,
    volcano: `<path d="M14 82 L 40 40 L 46 44 L 54 44 L 60 40 L 86 82 Z" class="fb"/><path d="M40 40 L 46 44 L 54 44 L 60 40"/><circle cx="50" cy="26" r="6" class="fc"/><circle cx="36" cy="18" r="4" class="fc"/><circle cx="64" cy="16" r="4.5" class="fc"/><path d="M50 44 C 48 56, 54 62, 50 82" class="lv"/>`,
    rain: `<path d="M50 16 C 58 30, 68 40, 68 52 A 18 18 0 0 1 32 52 C 32 40, 42 30, 50 16 Z" class="fb"/><ellipse cx="50" cy="80" rx="30" ry="6"/><ellipse cx="50" cy="80" rx="16" ry="3"/><path d="M50 62 C 50 54, 44 50, 40 50 C 40 56, 46 60, 50 62 M50 62 C 50 56, 56 52, 60 52 C 60 58, 54 61, 50 62" class="fc"/>`,
    shield: `<path d="M50 14 L 80 31 L 80 65 L 50 84 L 20 65 L 20 31 Z" class="fb"/><path d="M50 26 L 70 37 L 70 60 L 50 72 L 30 60 L 30 37 Z" stroke-dasharray="3 4"/><path d="M30 58 A 10 10 0 0 1 36 42 A 13 13 0 0 1 60 40 A 10 10 0 0 1 72 56 Z" class="fc"/>`,
    echo: `<path d="M30 80 L 50 52 L 70 80 Z" class="fc"/><path d="M28 46 A 26 26 0 0 1 72 46"/><path d="M18 40 A 38 38 0 0 1 82 40"/><path d="M8 34 A 50 50 0 0 1 92 34" stroke-dasharray="4 5"/><circle cx="50" cy="52" r="3" class="fc"/>`,
  };
  function skillEmblem(key) {
    return `<svg class="sk-emblem" viewBox="0 0 100 100" aria-hidden="true">${skillEmblems[key] || ''}</svg>`;
  }

  /* ---------------- 职业图标 ---------------- */
  function classIcon(prof) {
    if (prof === '医疗') {
      return `<svg class="cls-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4 C 34 14, 42 20, 42 30 A 18 18 0 0 1 6 30 C 6 20, 14 14, 24 4 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M24 20 V 38 M15 29 H 33" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`;
    }
    return `<svg class="cls-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M10 42 L 30 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="33" cy="15" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M33 3 V 8 M33 22 V 27 M21 15 H 26 M40 15 H 45" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="33" cy="15" r="2.6" fill="currentColor"/></svg>`;
  }

  /* ---------------- 小图标（冷知识等） ---------------- */
  const icons = {
    horn: '<path d="M8 14 C 4 6, 14 2, 16 8 C 18 13, 12 15, 11 11 C 10.4 8.6, 13 8, 13.6 10"/><path d="M16 8 C 18 4, 22 6, 21 11"/>',
    mountain: '<path d="M2 20 L 9 8 L 13 14 L 16 10 L 22 20 Z"/><path d="M9 8 L 11 11 M16 10 L 17.4 12.4"/><path d="M13 5 C 13 3, 15 3, 15 1.6"/>',
    book: '<path d="M3 5 C 6 4, 9 4, 12 6 C 15 4, 18 4, 21 5 V 19 C 18 18, 15 18, 12 20 C 9 18, 6 18, 3 19 Z"/><path d="M12 6 V 20"/>',
    brush: '<path d="M20 3 L 11 13"/><path d="M11 13 C 7 12, 4 15, 5 19 C 3 20, 3 21, 3 21 C 8 22, 12 19, 11 13 Z"/>',
    crown: '<path d="M3 18 L 4 7 L 9 12 L 12 5 L 15 12 L 20 7 L 21 18 Z"/><path d="M3 21 H 21"/>',
    spark: '<path d="M12 2 L 14 10 L 22 12 L 14 14 L 12 22 L 10 14 L 2 12 L 10 10 Z"/>',
    flame: '<path d="M12 2 C 15 7, 19 10, 19 15 A 7 7 0 0 1 5 15 C 5 11, 8 9, 9 6 C 10 8, 11 9, 12 10 C 12.6 8, 12.6 5, 12 2 Z"/>',
    shirt: '<path d="M8 3 L 3 7 L 6 11 L 7 10 V 21 H 17 V 10 L 18 11 L 21 7 L 16 3 C 15 5, 9 5, 8 3 Z"/>',
    cake: '<path d="M4 12 H 20 V 21 H 4 Z"/><path d="M4 15 C 7 17, 9 13, 12 15 S 17 13, 20 15"/><path d="M12 12 V 8"/><path d="M12 4 C 13 5.4, 13 6.4, 12 7 C 11 6.4, 11 5.4, 12 4 Z"/>',
    sheep: '<circle cx="14" cy="12" r="6"/><circle cx="9" cy="13" r="4"/><circle cx="19" cy="13" r="3.5"/><circle cx="6" cy="10" r="3"/><path d="M11 18 V 21 M17 18 V 21"/>',
    hand: '<path d="M8 12 V 5 A 1.5 1.5 0 0 1 11 5 V 11 V 3.5 A 1.5 1.5 0 0 1 14 3.5 V 11 V 5 A 1.5 1.5 0 0 1 17 5 V 13 C 17 18, 14 21, 11 21 C 8 21, 6 19, 4 15 L 3.4 13 A 1.4 1.4 0 0 1 6 12 L 8 14"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11 A 7 7 0 0 0 19 11 M12 18 V 22 M8 22 H 16"/>',
    music: '<path d="M9 18 V 5 L 20 3 V 16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    gem: '<path d="M6 3 H 18 L 22 9 L 12 21 L 2 9 Z"/><path d="M2 9 H 22 M9 3 L 12 9 L 15 3 M12 9 V 21"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11 V 7 A 4 4 0 0 1 16 7 V 11"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11 V 7 A 4 4 0 0 1 15.6 5.4"/>',
    play: '<path d="M7 4 L 20 12 L 7 20 Z"/>',
    pause: '<path d="M7 4 V 20 M17 4 V 20"/>',
    sound: '<path d="M4 9 H 8 L 13 4 V 20 L 8 15 H 4 Z"/><path d="M16 8 C 18 10, 18 14, 16 16 M19 5 C 23 9, 23 15, 19 19"/>',
    mute: '<path d="M4 9 H 8 L 13 4 V 20 L 8 15 H 4 Z"/><path d="M17 9 L 22 15 M22 9 L 17 15"/>',
    close: '<path d="M5 5 L 19 19 M19 5 L 5 19"/>',
    ear: '<path d="M7 9 A 5.5 5.5 0 0 1 18 9 C 18 12.5, 14.5 13, 14.5 16.5 A 3 3 0 0 1 9 17"/><path d="M10 9.5 A 2.2 2.2 0 0 1 14.4 9.5 C 14.4 11, 12.8 11.5, 12.6 12.8"/><path d="M20.5 5.5 C 22 7.5, 22 10.5, 20.5 12.5"/>',
    arrow: '<path d="M5 12 H 19 M13 6 L 19 12 L 13 18"/>',
    swap: '<path d="M4 8 H 18 L 14 4 M20 16 H 6 L 10 20"/>',
  };
  function icon(name, cls = '') {
    return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>`;
  }

  /* ---------------- 环形仪表（体检雷达在 archive.js，与另一形态对照） ---------------- */
  function gauge(value, max, label, unit) {
    const r = 46, c = TAU * r;
    const pct = Math.min(1, value / max);
    return `<div class="gauge" style="--pct:${pct}">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="${r}" class="g-track"/>
        <circle cx="60" cy="60" r="${r}" class="g-bar" style="stroke-dasharray:${f(c)};--c:${f(c)}"/>
        <circle cx="60" cy="60" r="54" class="g-ticks"/>
      </svg>
      <div class="g-val"><b data-count="${value}" data-dec="${String(value).includes('.') ? 2 : 0}">0</b><small>${unit}</small></div>
      <div class="g-label">${label}</div>
    </div>`;
  }

  /* ---------------- 分隔线：熔岩裂纹 / 灰羽 ---------------- */
  function divider() {
    return `<div class="divider" aria-hidden="true">
      <svg viewBox="0 0 1200 40" preserveAspectRatio="none">
        <path class="dv-lava" d="M0 20 L 180 20 L 200 12 L 222 26 L 240 18 L 420 20 L 436 8 L 452 30 L 470 16 L 486 22 L 700 20 L 716 26 L 734 10 L 752 24 L 780 20 L 960 20 L 976 14 L 994 28 L 1010 20 L 1200 20"/>
        <path class="dv-ash" d="M0 20 C 200 20, 300 12, 600 20 S 1000 28, 1200 20"/>
      </svg>
      <span class="dv-gem"></span>
    </div>`;
  }

  /* ---------------- 小插画：泰拉与火山石 ---------------- */
  const minis = {
    '天灾信使': `<circle cx="32" cy="32" r="26" style="fill:none;stroke:var(--c-acc);stroke-width:2"/><circle cx="32" cy="32" r="18" style="fill:none;stroke:var(--c-line2);stroke-dasharray:2 4"/><path d="M32 10 L 36 28 L 54 32 L 36 36 L 32 54 L 28 36 L 10 32 L 28 28 Z" style="fill:var(--c-acc2)"/><circle cx="32" cy="32" r="4" style="fill:var(--c-bg)"/>`,
    '源石与火山': `<path d="M6 56 L 26 20 L 32 26 L 38 20 L 58 56 Z" fill="#4a3d3f"/><path d="M26 20 L 32 26 L 38 20" fill="none" stroke="#ff8a1c" stroke-width="3"/><path d="M28 44 L 32 34 L 36 44 L 32 52 Z" fill="#ff5b1f"/><path d="M40 48 L 43 41 L 46 48 L 43 53 Z" fill="#ff9a3a"/><path d="M18 50 L 20 45 L 22 50 L 20 53 Z" fill="#ff9a3a"/>`,
    '危险的论文': `<rect x="14" y="8" width="36" height="48" rx="2" style="fill:var(--c-panel2);stroke:var(--c-acc);stroke-width:2"/><path d="M20 18 H 44 M20 26 H 44 M20 34 H 36" style="stroke:var(--c-muted);stroke-width:2"/><path d="M34 40 L 46 52 M46 40 L 34 52" style="stroke:var(--c-acc3);stroke-width:3;stroke-linecap:round"/>`,
    '浮石': `<path d="M8 38 C 6 24, 20 14, 34 16 C 50 18, 60 28, 56 40 C 52 52, 30 56, 18 50 C 12 47, 9 44, 8 38 Z" fill="#cfc6bd" stroke="#9a8e84" stroke-width="1.5"/><circle cx="22" cy="30" r="3" fill="#8e8279"/><circle cx="34" cy="26" r="2" fill="#8e8279"/><circle cx="44" cy="34" r="3.5" fill="#8e8279"/><circle cx="28" cy="42" r="2.4" fill="#8e8279"/><circle cx="40" cy="45" r="1.8" fill="#8e8279"/><circle cx="17" cy="40" r="1.6" fill="#8e8279"/><path d="M4 58 C 14 54, 24 60, 34 56 S 54 60, 62 56" fill="none" stroke="#7ab8f0" stroke-width="2"/><circle cx="50" cy="12" r="2" fill="none" stroke="#7ab8f0"/><circle cx="56" cy="20" r="1.4" fill="none" stroke="#7ab8f0"/>`,
    '黑曜石': `<path d="M32 4 L 52 22 L 46 54 L 20 60 L 10 28 Z" fill="#161220"/><path d="M32 4 L 36 30 L 52 22 M36 30 L 46 54 M36 30 L 20 60 M36 30 L 10 28" fill="none" stroke="#3a3350" stroke-width="1.2"/><path d="M30 10 L 22 26 L 28 28 Z" fill="rgba(200,220,255,.55)"/><path d="M40 34 L 44 48 L 40 46 Z" fill="rgba(255,160,200,.35)"/>`,
    '火山预警花': `<path d="M32 60 C 32 48, 30 40, 32 30" stroke="#6aa86a" stroke-width="3" fill="none"/><path d="M32 46 C 24 44, 20 38, 22 34 C 28 36, 31 40, 32 46 Z" fill="#8cc88c"/><g transform="translate(32 22)">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="7" ry="12" transform="rotate(${a}) translate(0 -9)" fill="#f7b8cb" stroke="#e58fa8"/>`).join('')}<circle r="5" fill="#ffd27a"/></g>`,
  };
  function mini(name) {
    return `<svg viewBox="0 0 64 64" aria-hidden="true">${minis[name] || ''}</svg>`;
  }

  /* ---------------- 故事章节插画 ---------------- */
  // 乌纳火山：碎屑流沿山坡倾泻
  function eruption() {
    const sky = id('es'), lava = id('el'), cloud = id('ec');
    let puffs = '';
    [[150, 56, 20], [132, 40, 22], [168, 34, 24], [148, 20, 26], [182, 16, 20], [118, 18, 18], [200, 30, 16]].forEach(([x, y, r], i) => {
      puffs += `<circle cx="${x}" cy="${y}" r="${r}" style="animation-delay:${(i * 0.45).toFixed(2)}s"/>`;
    });
    let flow = '';
    [[176, 104, 14], [192, 116, 17], [208, 130, 20], [226, 146, 23], [246, 160, 26], [266, 172, 26], [286, 180, 22]].forEach(([x, y, r], i) => {
      flow += `<circle cx="${x}" cy="${y}" r="${r}" style="animation-delay:${(i * 0.18).toFixed(2)}s"/>`;
    });
    return `<svg class="scene scene-eruption" viewBox="0 0 300 200" aria-hidden="true">
      <defs>
        <linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--c-bg)"/><stop offset="1" style="stop-color:var(--c-bg2)"/></linearGradient>
        <linearGradient id="${lava}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0c8"/><stop offset=".4" style="stop-color:var(--c-acc2)"/><stop offset="1" style="stop-color:var(--c-acc3)"/></linearGradient>
        <radialGradient id="${cloud}"><stop offset="0" stop-color="#8d8189"/><stop offset="1" stop-color="#4a3f46"/></radialGradient>
      </defs>
      <rect width="300" height="200" rx="6" fill="url(#${sky})"/>
      <g class="sc-glow"><circle cx="150" cy="80" r="70" style="fill:var(--c-glow)" opacity=".35"/></g>
      <g class="sc-puffs" fill="url(#${cloud})">${puffs}</g>
      <path d="M0 200 L 0 170 C 40 160, 80 130, 128 80 L 138 70 L 162 70 L 172 80 C 220 128, 260 158, 300 166 L 300 200 Z" fill="#231a20"/>
      <path d="M0 200 L 0 184 C 60 176, 100 160, 140 146 C 190 160, 250 176, 300 184 L 300 200 Z" fill="#171116"/>
      <path class="sc-lava" d="M150 72 C 146 96, 138 110, 124 132 C 116 146, 104 158, 92 176" fill="none" stroke="url(#${lava})" stroke-width="4" stroke-linecap="round"/>
      <path class="sc-lava" d="M156 72 C 160 90, 170 104, 178 124" fill="none" stroke="url(#${lava})" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="150" cy="71" rx="13" ry="3.5" fill="#ffe2b0"/>
      <g class="sc-flow" fill="#6f6168" opacity=".85">${flow}</g>
      <g class="sc-bombs" style="fill:var(--c-acc2)"><circle cx="120" cy="40" r="2.4"/><circle cx="186" cy="46" r="2"/><circle cx="104" cy="60" r="1.6"/><circle cx="200" cy="64" r="1.8"/></g>
    </svg>`;
  }

  // 渐远的声音：振幅逐渐衰减为一条直线，音符化作灰
  function sound() {
    const g = id('sg');
    let d = 'M 20 100';
    for (let x = 20; x <= 280; x += 2) {
      const k = (x - 20) / 260;
      const amp = 46 * Math.pow(1 - k, 1.6) + 1.2;
      const y = 100 + Math.sin(x * 0.19) * amp * (0.7 + 0.3 * Math.sin(x * 0.043));
      d += ` L ${x} ${f(y)}`;
    }
    let dust = '';
    for (let i = 0; i < 22; i++) {
      const x = 170 + Math.random() * 120, y = 50 + Math.random() * 100;
      dust += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.8 + Math.random() * 1.8)}" style="animation-delay:${f(Math.random() * 3)}s"/>`;
    }
    return `<svg class="scene scene-sound" viewBox="0 0 300 200" aria-hidden="true">
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--c-acc)"/><stop offset=".6" style="stop-color:var(--c-acc2)"/><stop offset="1" style="stop-color:var(--c-muted)" stop-opacity=".2"/></linearGradient></defs>
      <rect width="300" height="200" rx="6" style="fill:var(--c-panel2)"/>
      <g fill="none" style="stroke:var(--c-line2)" stroke-width="1"><path d="M20 40 H 280 M20 160 H 280" stroke-dasharray="2 6"/></g>
      <path class="sc-wave" d="${d}" fill="none" stroke="url(#${g})" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
      <g class="sc-notes" style="fill:var(--c-acc)"><text x="40" y="44" font-size="22">♪</text><text x="96" y="36" font-size="18">♫</text><text x="150" y="48" font-size="15" opacity=".6">♪</text><text x="196" y="42" font-size="12" opacity=".3">♪</text></g>
      <g class="sc-dust" style="fill:var(--c-muted)">${dust}</g>
      <text x="280" y="186" text-anchor="end" font-family="monospace" font-size="9" style="fill:var(--c-muted)">−dB · · ·</text>
    </svg>`;
  }

  // 乌纳火山之巅：一块小石头，两只飞走的花环
  function summit() {
    const sky = id('ms'), rock = id('mr');
    const wreath = (cx, cy, r, cls) => {
      let p = '';
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        const [x, y] = polar(cx, cy, r, a);
        p += `<circle cx="${x}" cy="${y}" r="${f(r * 0.32)}" fill="${['#f7b8cb', '#ffe0a0', '#ffffff', '#c9b3e8'][k % 4]}"/>`;
      }
      return `<g class="${cls}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#7fb07f" stroke-width="2"/>${p}</g>`;
    };
    return `<svg class="scene scene-summit" viewBox="0 0 300 200" aria-hidden="true">
      <defs>
        <linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--c-acc2)" stop-opacity=".35"/><stop offset="1" style="stop-color:var(--c-panel2)"/></linearGradient>
        <linearGradient id="${rock}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d5f66"/><stop offset="1" stop-color="#2b2227"/></linearGradient>
      </defs>
      <rect width="300" height="200" rx="6" fill="url(#${sky})"/>
      <circle cx="232" cy="52" r="26" fill="#fff" opacity=".35"/>
      <path d="M0 200 L 0 150 C 50 140, 90 110, 130 96 L 150 90 L 172 96 C 210 112, 250 140, 300 150 L 300 200 Z" fill="url(#${rock})"/>
      <path d="M118 102 L 130 96 L 150 90 L 172 96 L 184 102 C 170 106, 162 100, 150 104 C 138 100, 130 106, 118 102 Z" fill="#f4f1f6" opacity=".9"/>
      <ellipse cx="150" cy="92" rx="7" ry="4" fill="#4a3f46"/>
      <path d="M150 88 C 150 82, 146 80, 143 80 C 144 84, 147 86, 150 88 M150 88 C 151 83, 155 81, 158 82 C 156 85, 153 87, 150 88" fill="#8cc88c"/>
      ${wreath(196, 64, 12, 'sc-w1')}
      ${wreath(226, 36, 9, 'sc-w2')}
      <path d="M160 84 C 176 76, 184 72, 190 70 M 204 56 C 212 48, 216 44, 220 42" fill="none" style="stroke:var(--c-muted)" stroke-dasharray="2 4"/>
      <g class="sc-feathers" fill="#fff" opacity=".8"><path d="M60 50 c 8 -4, 16 -2, 20 2 c -8 3, -14 2, -20 -2 z"/><path d="M250 110 c 6 -3, 12 -1, 15 1 c -6 2, -10 2, -15 -1 z"/></g>
    </svg>`;
  }

  return { emblem, circleBase, circleAlter, sheep, volcanoDiagram, skillEmblem, classIcon, icon, gauge, divider, mini, eruption, sound, summit };
})();
