/* =========================================================
 * 档案 · 资料 · 附录（#profile / #files / #appendix）
 * PRTS 终端风格：干员证（游戏内半身像）、体检雷达（与另一形态对照）、病程记录、作战属性与攻击范围（含技能范围）；
 * 档案解密（每份档案附带整理过的“附件”）、干员密录（剧情里的场景背景 + 蚀刻章 + 分幕概述）；
 * 分页的作战附录（模组故事按信笺 / 赛道 / 录音带 / 标本卡排版）。
 * 数值与条目按 PRTS Wiki 核对；档案与故事均为概述。
 * 性能：全部是静态 DOM；动效只用 transform / opacity，而且都是一次性的（解密、揭开、换页、展开），
 *      唯一会循环的是图片加载时的骨架扫光（图到了就移除）。数字滚动、信赖值拖动的补间都有固定时长。
 * 由 main.js 调用：ARCHIVE.init(ctx) 之后 profile() / files() / refreshFiles() / appendix()
 * ========================================================= */
window.ARCHIVE = (() => {
  'use strict';
  const D = window.EYJA, A = window.ART;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad2 = (n) => String(n).padStart(2, '0');
  const sfx = (n) => { try { if (window.AUDIO) AUDIO.sfx(n); } catch (e) { /* 没有音频也无妨 */ } };

  /* ---------------------------------------------------- 图片：PRTS 资源站（服务端缩图，约 5–25 KB 一张） */
  const MEDIA = 'https://media.prts.wiki/';
  // 道具图标文件名 → MediaWiki 目录（md5 前缀）；地址已逐个 HEAD 核验
  const ITEM = {
    '龙门币': '6/6a', '术师芯片': 'd/dc', '异铁': '7/71', '糖': 'e/e8', '术师双芯片': '9/9c', '聚合剂': '9/98', '改量装置': 'f/fd',
    '技巧概要·卷1': 'a/a5', '异铁碎片': '8/87', '代糖': 'a/a9', '技巧概要·卷2': '8/88', '酮凝集': '6/6a', '装置': '6/64', '聚酸酯': 'b/b9',
    '扭转醇': 'a/a8', '技巧概要·卷3': '0/0e', '轻锰矿': 'e/e6', 'RMA70-12': '7/7c', '五水研磨石': '5/52', '糖聚块': '6/69', 'RMA70-24': 'e/e5',
    '聚酸酯块': '8/8d', '提纯源岩': 'c/c8', '三水锰矿': '2/2c', '研磨石': 'e/e7', '异铁块': '7/70', 'D32钢': '7/76', '酮阵列': '3/39',
    '模组数据块': 'b/b6', '数据增补条': 'b/be', '晶体电子单元': 'e/eb', '数据增补仪': '3/33', '双极纳米片': '4/4a', '重相位对映体': '5/5f',
    '医疗芯片': '7/71', '固源岩': 'c/cf', '医疗双芯片': 'a/a6', '双酮': '4/4b', '固源岩组': '2/2e', '半自然溶剂': '2/23', '异铁组': '1/14',
    '酮凝集组': 'd/d6', '晶体电路': 'd/df', '烧结核凝晶': '6/61', '聚酸酯组': '0/09', '精炼溶剂': 'a/a3', '聚合凝胶': '4/42',
  };
  // 干员密录的场景背景（PRTS Widget:Data_Image；剧情里实际用到的那几张）
  const AVG = {
    laccolith: 'b/b9/Avg_bg_bg_laccolith.png', desert_3: 'd/d2/Avg_bg_bg_desert_3.png', infirmary: '0/0d/Avg_bg_bg_infirmary.png',
    wilderness_d: 'd/d2/Avg_bg_bg_wilderness_d.png', cave: '3/38/Avg_bg_bg_caveentrance.png', wilderness_n: 'a/a7/Avg_bg_bg_wilderness_n.png',
    starry: 'f/fc/Avg_bg_38_g21_skystarry_L2.png', hotel: '9/9a/Avg_bg_bg_hotel.png', summit: '5/57/Avg_bg_41_g11_volcanomountainside.png',
  };
  const Q = (w) => `?image_process=resize,w_${w}/format,webp/quality,Q_82`;
  const shrink = (url, w) => (/media\.prts\.wiki/.test(url) ? url.replace(/\?.*$/, '') + Q(w) : url);
  const webp = (url) => (/media\.prts\.wiki/.test(url) ? url.replace(/\?.*$/, '') + '?image_process=format,webp/quality,Q_88' : url);
  const avg = (k, w) => (AVG[k] ? MEDIA + AVG[k] + Q(w) : '');
  const medalSrc = (id) => `https://torappu.prts.wiki/assets/medal_icon/${id}.png`;
  const itemSrc = (n) => (ITEM[n] ? `${MEDIA}${ITEM[n]}/${encodeURI('道具_带框_' + n + '.png')}${Q(80)}` : '');
  const IMG = (src, alt = '', cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${src}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.classList.add('img-x')">`;
  /** 带骨架的图片：加载期间一道扫光，到了淡入（扫光随即移除）；加载失败就只留底色 */
  const SK = (src, alt = '', cls = '', tag = 'span', extra = '') => `<${tag} class="sk ${cls}"${extra}><img src="${src}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" onload="this.parentNode.classList.add('ok')" onerror="this.parentNode.classList.add('ok','x')"></${tag}>`;
  const mats = (list) => `<ul class="ar-mats">${list.map(([n, c]) => `<li title="${esc(n)} ×${c}">${IMG(itemSrc(n), n)}<b class="mono">${typeof c === 'number' ? '×' + c : c}</b><span>${n}</span></li>`).join('')}</ul>`;
  // ART.icon 里没有的几枚小图标（同样的 24 格线稿）
  const ico = (body, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const ICO = {
    ear: () => A.icon('ear'), spark: () => A.icon('spark'),
    eye: () => ico('<path d="M2 12 C 5 7, 8.5 5, 12 5 S 19 7, 22 12 C 19 17, 15.5 19, 12 19 S 5 17, 2 12 Z"/><circle cx="12" cy="12" r="3.2"/>'),
    drop: () => ico('<path d="M12 3 L 17.5 11 A 6.4 6.4 0 1 1 6.5 11 Z"/><path d="M9.4 14.6 A 2.8 2.8 0 0 0 12 17"/>'),
    heart: () => ico('<path d="M12 20 C 5 15, 3 11.5, 3 8.6 A 4.4 4.4 0 0 1 12 6.4 A 4.4 4.4 0 0 1 21 8.6 C 21 11.5, 19 15, 12 20 Z"/><path d="M6.5 12 H 9.5 L 11 9.5 L 13 14 L 14.5 12 H 17.5"/>'),
    film: () => ico('<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 9 H 21 M3 15 H 21 M7 5 V 9 M12 5 V 9 M17 5 V 9 M7 15 V 19 M12 15 V 19 M17 15 V 19"/>'),
    mail: () => ico('<rect x="3" y="5.5" width="18" height="13" rx="1.2"/><path d="M3.5 6.5 L 12 13 L 20.5 6.5"/>'),
    chev: () => ico('<path d="M6 9 L 12 15 L 18 9"/>'),
    clip: () => ico('<path d="M8 12.5 L 14.2 6.3 A 3 3 0 0 1 18.4 10.5 L 10.6 18.3 A 4.6 4.6 0 0 1 4.1 11.8 L 11 4.9"/>'),
  };

  /* ---------------------------------------------------- 状态 */
  let C = null; // 来自 main.js：{ state, store, F, OTHER, head, observeReveals, reduce }
  const F = () => C.F();
  const OTHER = () => C.OTHER();
  const form = () => C.state.form;
  const S = {
    phase: 3, withTrust: false, range: 2,
    tab: 'talent', file: 'resume',
    lv: { base: [9, 9, 9], alter: [9, 9, 9] },
    mod: { base: [2, 2], alter: [2, 2] },
    pot: { base: 1, alter: 1 },
    recOpen: new Set(), // 展开了分幕概述的密录：'base:0'
  };

  /** 有时长上限的数字补间（不是常驻循环） */
  function tween(el, to, dur = 650, fmt = (v) => Math.round(v)) {
    const from = parseFloat(el.textContent) || 0, t0 = performance.now();
    const tok = (el._tw = (el._tw || 0) + 1);
    if (C.reduce || from === to) { el.textContent = fmt(to); return; }
    const step = (now) => {
      if (el._tw !== tok) return;
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const GLYPH = '▓▒░█■□◆◇#%&@ᚠᚢᚦᚨᚱᚲ01';
  /** 标题的短暂乱码解密（约 0.4 秒） */
  function scramble(el, text, dur = 420) {
    if (C.reduce) { el.textContent = text; return; }
    const tok = (el._sc = (el._sc || 0) + 1), t0 = performance.now(), n = text.length;
    const step = (now) => {
      if (el._sc !== tok) return;
      const k = Math.min(1, (now - t0) / dur), shown = Math.floor(n * k);
      let s = text.slice(0, shown);
      for (let i = shown; i < n; i++) s += text[i] === ' ' ? ' ' : GLYPH[(Math.random() * GLYPH.length) | 0];
      el.textContent = s;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ====================================================
   * 05 · 干员档案
   * ==================================================== */
  const STAT = [['hp', '生命上限', 2000], ['atk', '攻击', 800], ['def', '防御', 160], ['res', '法术抗性', 25]];
  const trustOf = (f) => {
    const t = f.stats.trust, g = (re) => +((t.match(re) || [])[1] || 0);
    return { hp: g(/生命\s*\+(\d+)/), atk: g(/攻击\s*\+(\d+)/), def: g(/防御\s*\+(\d+)/), res: 0 };
  };
  const statAt = (f, k, i) => f.stats[k][i] + (S.withTrust ? trustOf(f)[k] : 0);

  // 技能改变的攻击范围：「火山」为以自身为中心、半径 3 的菱形（range_table x-3）；「火山回响」扩大至整个战场
  const SKILL_RANGE = {
    base: { name: '火山', cells: (() => { const c = []; for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if ((x || y) && Math.abs(x) + Math.abs(y) <= 3) c.push(x + ',' + y); return c.join(' '); })(), note: '技能期间攻击范围增大：以自身为中心、半径 3 格的菱形，身后的敌人也在火力之下。' },
    alter: { name: '火山回响', all: true, note: '技能期间攻击范围扩大至整个战场；自身失去全部视野，第二天赋的范围同样扩展到全场。' },
  };
  /** 攻击范围网格（与职业区同一套 .rg 样式） */
  function rangeGrid(str) {
    const cells = str.split(' ').map((p) => p.split(',').map(Number));
    const all = cells.concat([[0, 0]]);
    const xs = all.map((c) => c[0]), ys = all.map((c) => c[1]);
    const set = new Set(cells.map((c) => c.join(',')));
    let html = '';
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
        if (x === 0 && y === 0) html += '<i class="me" title="干员位置"></i>';
        else if (set.has(`${x},${y}`)) html += `<i class="on" style="--d:${Math.abs(x) + Math.abs(y)}"></i>`;
        else html += '<i></i>';
      }
    }
    return `<div class="rg" style="--cols:${Math.max(...xs) - Math.min(...xs) + 1}" role="img" aria-label="攻击范围 ${cells.length} 格">${html}</div>`;
  }
  /** 全场范围：一小块“战场”全部点亮，干员在其中 */
  function fieldGrid() {
    let html = '';
    for (let y = 0; y < 5; y++) for (let x = 0; x < 9; x++) html += x === 2 && y === 2 ? '<i class="me" title="干员位置"></i>' : `<i class="on" style="--d:${Math.abs(x - 2) + Math.abs(y - 2)}"></i>`;
    return `<div class="rg rg-field" style="--cols:9" role="img" aria-label="攻击范围：整个战场">${html}<span class="rg-all mono">ENTIRE MAP · 全场</span></div>`;
  }
  function rangeView(f) {
    const sk = SKILL_RANGE[f.key];
    if (S.range === 3) return { grid: sk.all ? fieldGrid() : rangeGrid(sk.cells), cap: `技能「${sk.name}」 · ${sk.all ? '整个战场' : sk.cells.split(' ').length + ' 格'}`, note: sk.note };
    const str = f.range[S.range], n = str.split(' ').length, n0 = f.range[0].split(' ').length;
    const note = S.range === 0 ? '精英阶段 0 的基础范围。' : n > n0 ? `比精英 0 多出 ${n - n0} 格${f.key === 'base' ? '：正前方再远一格' : '：上下两翼各展开一行'}。` : '与上一阶段相同。';
    return { grid: rangeGrid(str), cap: `${['精英0', '精英1', '精英2'][S.range]} · ${n} 格`, note };
  }

  /** 综合体检雷达：实线为当前形态，虚线为另一形态。形状单独放一层，出现时只做缩放（合成器完成） */
  function radar(cur, oth, otherName) {
    const keys = Object.keys(cur), n = keys.length, cx = 160, cy = 160, R = 104, G = D.GRADE;
    const ang = (i) => -Math.PI / 2 + (i * Math.PI * 2) / n;
    const pt = (r, i) => [(cx + Math.cos(ang(i)) * r).toFixed(1), (cy + Math.sin(ang(i)) * r).toFixed(1)];
    let grid = '';
    for (let lv = 1; lv <= 5; lv++) grid += `<polygon class="rd-grid${lv === 5 ? ' rd-outer' : ''}" points="${keys.map((_, i) => pt((R * lv) / 5, i).join(',')).join(' ')}"/>`;
    const axes = keys.map((_, i) => { const [x, y] = pt(R, i); return `<line class="rd-axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`; }).join('');
    const poly = (ph) => keys.map((k, i) => pt((R * (G[ph[k]] || 2)) / 5, i).join(',')).join(' ');
    const labels = keys.map((k, i) => {
      const [x, y] = pt(R + 32, i), g = cur[k], diff = g !== oth[k];
      return `<text x="${x}" y="${(+y - 7).toFixed(1)}" text-anchor="middle" class="rd-label">${k}</text><text x="${x}" y="${(+y + 11).toFixed(1)}" text-anchor="middle" class="rd-grade g-${G[g]}${diff ? ' diff' : ''}">${g}${diff ? `<tspan class="rd-was"> · ${otherName}${oth[k]}</tspan>` : ''}</text>`;
    }).join('');
    const dots = keys.map((k, i) => { const [x, y] = pt((R * (G[cur[k]] || 2)) / 5, i); return `<circle cx="${x}" cy="${y}" r="4" class="rd-dot${cur[k] !== oth[k] ? ' diff' : ''}"/>`; }).join('');
    const vb = 'viewBox="-24 0 368 320"';
    return `<div class="pf-radar" role="img" aria-label="综合体检测试：${keys.map((k) => k + cur[k]).join('、')}">
      <svg class="rd-base" ${vb} aria-hidden="true">${grid}${axes}${labels}</svg>
      <svg class="rd-layer rd-other" ${vb} aria-hidden="true"><polygon class="rd-poly2" points="${poly(oth)}"/></svg>
      <svg class="rd-layer rd-cur" ${vb} aria-hidden="true"><polygon class="rd-poly" points="${poly(cur)}"/>${dots}</svg>
    </div>`;
  }

  const halfSrc = (f) => webp(((f.half || {})[C.state.elite]) || f.avatar);
  function idCard(f) {
    const cv = D.meta.cv.map(([l, n]) => `<span><i>${l}</i>${n}</span>`).join('');
    const e2 = C.state.elite === 'e2';
    return `<article class="panel pf-id" data-reveal>
      <header class="pf-id-bar mono"><span><i class="ar-led"></i>PRTS // RHODES ISLAND · OPERATOR RECORD</span><span>${f.code} · ${f.moodEn}</span></header>
      <div class="pf-id-body">
        <div class="pf-face">
          <span class="pf-code" aria-hidden="true">${f.code}</span>
          ${SK(halfSrc(f), `${f.name} 半身像`, 'pf-ava', 'figure')}
          <span class="pf-elite mono" aria-hidden="true"><i>${e2 ? 'Ⅱ' : '0'}</i>ELITE</span>
          <div class="pf-stars" role="img" aria-label="稀有度 六星">${'<i>★</i>'.repeat(6)}</div>
        </div>
        <div class="pf-who">
          <p class="pf-kicker mono">OPERATOR · ${f.giant}</p>
          <h3 class="pf-name">${f.name}</h3>
          <p class="pf-alias"><span>${f.en}</span><span lang="ja">${f.jp}</span></p>
          <div class="pf-cls">
            <span class="ar-chip">${A.classIcon(f.profession)}<b>${f.profession}</b></span>
            <span class="ar-chip">${IMG(f.branchImg, '', 'ar-bicon')}<b>${f.branch}</b></span>
            <span class="pf-tag">${f.position}</span>${f.tags.map((t) => `<span class="pf-tag">${t}</span>`).join('')}
          </div>
          <blockquote class="pf-brief"><p>${f.brief[0]}</p><footer>${f.brief[1]}</footer></blockquote>
        </div>
        <dl class="pf-meta">
          <div><dt class="mono">ILLUST</dt><dd>${D.meta.illustrator}</dd></div>
          <div><dt class="mono">CV</dt><dd class="pf-cv">${cv}</dd></div>
          <div><dt class="mono">OBTAIN</dt><dd>${f.obtain}</dd></div>
          <div><dt class="mono">ONLINE</dt><dd>${f.release}</dd></div>
          <div><dt class="mono">FACTION</dt><dd>${D.meta.faction}</dd></div>
        </dl>
      </div>
      <footer class="pf-id-foot mono"><span class="pf-barcode" aria-hidden="true"></span><span>RHODES ISLAND · 人事部 · 档案已归档</span><span>${f.release.replace(/-/g, '.')}</span></footer>
      <span class="pf-sweep" aria-hidden="true"></span>
    </article>`;
  }
  /** 首屏切换精英阶段时，干员证上的半身像跟着换（只换图，不重绘整块） */
  function syncPortrait() {
    const box = $('#profile .pf-ava'), f = F();
    if (!box) return;
    const src = halfSrc(f), im = $('img', box);
    const lab = $('#profile .pf-elite i');
    if (lab) lab.textContent = C.state.elite === 'e2' ? 'Ⅱ' : '0';
    if (!im || im.getAttribute('src') === src) return;
    box.classList.remove('ok', 'x');
    im.src = src;
  }

  function attrPanel(f, o) {
    return `<div class="panel pf-attr" data-reveal>
      <div class="panel-h">ATTRIBUTES <span>作战属性</span></div>
      <div class="pf-attr-ctl">
        <div class="seg" role="group" aria-label="精英阶段与等级">${f.stats.phases.map((p, i) => `<button type="button" data-pfphase="${i}" class="${i === S.phase ? 'on' : ''}" aria-pressed="${i === S.phase}">${p}</button>`).join('')}</div>
        <label class="pf-tb"><input type="checkbox" data-pftrust${S.withTrust ? ' checked' : ''}><i aria-hidden="true"></i><span>计入满信赖加成 <b>${f.stats.trust}</b></span></label>
      </div>
      <div class="pf-stats">${STAT.map(([k, l, max]) => {
        const v = statAt(f, k, S.phase), ov = statAt(o, k, S.phase);
        return `<div class="pf-stat" data-k="${k}">
          <span class="l">${l}</span>
          <div class="pf-bar"><i class="v" style="--w:${(v / max).toFixed(4)}"></i><i class="o" style="--o:${(ov / max).toFixed(4)}" title="${o.mood}：${ov}"></i></div>
          <b class="n mono" data-count="${v}">${v}</b><small class="d mono">${o.mood} ${ov}</small>
        </div>`;
      }).join('')}</div>
      <p class="pf-legend"><span><i class="v"></i>${f.mood}（当前）</span><span><i class="o"></i>${o.mood} · 同阶段</span></p>
      <p class="pf-grow mono"><span>GROWTH</span>精英0 · 1级 → 精英2 · 90级${STAT.slice(0, 3).map(([k, l]) => `<b>${l.replace('上限', '')} +${Math.round((f.stats[k][3] / f.stats[k][0] - 1) * 100)}%</b>`).join('')}</p>
      <div class="pf-promo">${f.promote.map((m, i) => `<div class="pf-promo-row${S.phase >= i + 2 ? ' done' : ''}" data-e="${i + 1}">
        <span class="pf-promo-h"><b>精英化 ${i ? 'Ⅱ' : 'Ⅰ'}</b><small>${i ? '精英1 · 80级 → 精英2' : '精英0 · 50级 → 精英1'}</small></span>${mats(m)}</div>`).join('')}</div>
    </div>`;
  }
  function updateAttr() {
    const f = F(), o = OTHER(), host = $('.pf-attr');
    if (!host) return;
    $$('[data-pfphase]', host).forEach((b) => { const on = +b.dataset.pfphase === S.phase; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    STAT.forEach(([k, , max]) => {
      const row = $(`.pf-stat[data-k="${k}"]`, host);
      const v = statAt(f, k, S.phase), ov = statAt(o, k, S.phase);
      $('.v', row).style.setProperty('--w', (v / max).toFixed(4));
      const oi = $('.o', row);
      oi.style.setProperty('--o', (ov / max).toFixed(4));
      oi.title = `${o.mood}：${ov}`;
      tween($('.n', row), v);
      $('.d', row).textContent = `${o.mood} ${ov}`;
    });
    $$('.pf-promo-row', host).forEach((r) => r.classList.toggle('done', S.phase >= +r.dataset.e + 1));
  }

  function rangePanel(f) {
    const v = rangeView(f), sk = SKILL_RANGE[f.key];
    // 选择器本身就是四张缩略的范围图
    const opts = [0, 1, 2, 3].map((i) => {
      const cells = i < 3 ? f.range[i] : sk.cells;
      const mini = i === 3 && sk.all ? fieldGrid() : rangeGrid(cells);
      const n = i === 3 && sk.all ? '全场' : cells.split(' ').length + ' 格';
      return `<button type="button" data-pfrange="${i}" class="${i === S.range ? 'on' : ''}${i === 3 ? ' skr' : ''}" aria-pressed="${i === S.range}"><span class="pf-mini" aria-hidden="true">${mini}</span><b>${i < 3 ? '精英' + i : '技能 · ' + sk.name}</b><small class="mono">${n}</small></button>`;
    });
    return `<div class="panel pf-rng" data-reveal style="--i:1">
      <div class="panel-h">RANGE · TRAIT <span>攻击范围与特性</span></div>
      <div class="pf-rg${S.range === 3 ? ' skill' : ''}">${v.grid}</div>
      <p class="pf-rg-cap"><b class="mono">${v.cap}</b><span>${v.note}</span></p>
      <div class="pf-rng-pick" role="group" aria-label="攻击范围">${opts.join('')}</div>
      <p class="pf-trait"><span class="ar-chip">${IMG(f.branchImg, '', 'ar-bicon')}<b>${f.branch}</b></span><span>${f.traitFull}</span></p>
      <div class="pf-tiles">${f.misc.map(([k, val]) => `<div><span>${k}</span><b class="mono">${val}</b></div>`).join('')}</div>
    </div>`;
  }
  function setRange(i) {
    const pf = $('#profile'), f = F();
    S.range = i;
    $$('[data-pfrange]', pf).forEach((b) => { const on = +b.dataset.pfrange === i; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    const v = rangeView(f), host = $('.pf-rg', pf);
    if (host) { host.innerHTML = v.grid; host.classList.toggle('skill', i === 3); }
    const cap = $('.pf-rg-cap', pf);
    if (cap) cap.innerHTML = `<b class="mono">${v.cap}</b><span>${v.note}</span>`;
  }

  function symptomStrip(f) {
    if (!f.symptoms) return '';
    return `<div class="panel pf-sym" data-reveal>
      <div class="panel-h">SYMPTOM LOG <span>病程记录 · ${f.mood}</span></div>
      <ol class="pf-sym-list">${f.symptoms.map(([ic, k, t, src], i) => `<li style="--k:${i}">
        <i class="pf-sym-ic">${(ICO[ic] || ICO.spark)()}</i>
        <div><b>${k}</b><p>${t}</p><small class="mono">${src}</small></div>
      </li>`).join('')}</ol>
    </div>`;
  }

  function deltaPanel() {
    const b = D.forms.base, a = D.forms.alter, cur = form();
    const h = (f) => (f.basic.find((x) => x[0] === '身高') || [])[1];
    const rows = [
      ['职业', `${b.profession} · ${b.branch}`, `${a.profession} · ${a.branch}`],
      ['身高', h(b), h(a)],
      ['生理耐受', b.physical['生理耐受'], a.physical['生理耐受']],
      ['源石融合率', b.infection.fusion + '%', a.infection.fusion + '%'],
      ['结晶密度', b.infection.crystal.toFixed(2) + 'u/L', a.infection.crystal.toFixed(2) + 'u/L'],
      ['部署费用', b.misc[1][1], a.misc[1][1]],
      ['攻击间隔', b.misc[3][1], a.misc[3][1]],
      ['实装', b.release, a.release],
    ];
    const tok = (f, me) => `<figure class="pf-tok${me ? ' me' : ''}">${SK(webp(f.tokenImg), f.tokenName, 'pf-tok-img')}<figcaption><small class="mono">${f.mood} · TOKEN</small><b>${f.tokenName}</b><span>${f.token}</span></figcaption></figure>`;
    return `<div class="panel pf-delta" data-reveal style="--i:1">
      <div class="panel-h">FORM DELTA <span>${b.mood} → ${a.mood}</span></div>
      <table class="ar-table pf-dt">
        <thead><tr><th></th><th class="${cur === 'base' ? 'me' : ''}">${b.mood}</th><th aria-hidden="true"></th><th class="${cur === 'alter' ? 'me' : ''}">${a.mood}</th></tr></thead>
        <tbody>${rows.map(([k, x, y]) => `<tr class="${x === y ? 'same' : 'chg'}"><th>${k}</th><td class="${cur === 'base' ? 'me' : ''}">${x}</td><td class="arr" aria-hidden="true">${x === y ? '=' : '→'}</td><td class="${cur === 'alter' ? 'me' : ''}">${y}</td></tr>`).join('')}</tbody>
      </table>
      <div class="pf-toks">${tok(b, cur === 'base')}<i class="pf-toks-arr" aria-hidden="true">${A.icon('arrow')}</i>${tok(a, cur === 'alter')}</div>
      <p class="note">同一个人的两份档案：数年之间，她长高了一点，身体更弱了一点，走得却更远了。信物从一把缠着隔热布的理发剪，换成了一块会在水里嗞嗞作响的火山石。</p>
    </div>`;
  }

  function notePanel(f) {
    const [en, zh, txt] = f.entry ? ['NEW OPERATOR', '新干员 · 信息录入', f.entry] : ['IMPRESSION', '初到罗德岛', f.impression];
    return `<article class="panel pf-note" data-reveal><div class="panel-h">${en} <span>${zh}</span></div><p class="pf-note-t">${txt}</p>
      <p class="pf-resume"><b class="mono">RESUME · 客观履历</b>${f.resume}</p>
      ${f.sketch ? `<p class="pf-sk-h mono">SKETCHES · 舰上速写</p><ul class="pf-sketch">${f.sketch.map(([k, t, src]) => `<li><b>${k}</b><p>${t}</p><small class="mono">语音 · ${src}</small></li>`).join('')}</ul>` : ''}
    </article>`;
  }

  function profile() {
    const f = F(), o = OTHER();
    $('#profile').innerHTML = C.head('07', 'OPERATOR PROFILE', '干员档案', `${f.name} · ${f.en}`) + `
      <div class="wrap pf">
        ${idCard(f)}
        <div class="pf-row3">
          <div class="panel pf-basic" data-reveal>
            <div class="panel-h">BASIC FILE <span>基础档案</span></div>
            <dl class="kv">${f.basic.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
            <p class="pf-inf"><b>矿石病感染情况</b>体表有源石结晶分布，参照医学检测报告，确认为感染者。</p>
          </div>
          <div class="panel pf-exam" data-reveal style="--i:1">
            <div class="panel-h">PHYSICAL EXAM <span>综合体检测试</span></div>
            ${radar(f.physical, o.physical, o.mood)}
            <p class="pf-legend"><span><i class="v"></i>${f.mood}</span><span><i class="o dash"></i>${o.mood}</span></p>
          </div>
          <div class="panel pf-med" data-reveal style="--i:2">
            <div class="panel-h">CLINICAL <span>临床诊断</span></div>
            <div class="gauges">
              ${A.gauge(f.infection.fusion, 20, '体细胞与源石融合率', '%')}
              ${A.gauge(f.infection.crystal, 1, '血液源石结晶密度', 'u/L')}
            </div>
            <p class="med-note">${f.infection.note}</p>
            <div class="med-trend mono"><span class="${form() === 'base' ? 'me' : ''}">${D.forms.base.mood} <b>${D.forms.base.infection.fusion}% · ${D.forms.base.infection.crystal.toFixed(2)}</b></span><i class="arrow"></i><span class="${form() === 'alter' ? 'me' : ''}">${D.forms.alter.mood} <b>${D.forms.alter.infection.fusion}% · ${D.forms.alter.infection.crystal.toFixed(2)}</b></span></div>
          </div>
        </div>
        ${symptomStrip(f)}
        <div class="pf-row2">${attrPanel(f, o)}${rangePanel(f)}</div>
        <div class="pf-row2 pf-row2b">${notePanel(f)}${deltaPanel()}</div>
      </div>`;
  }

  /* ====================================================
   * 06 · 档案资料：信赖值解锁 + 揭开涂黑的解密效果 + 附件
   * ==================================================== */
  function fileList() {
    const f = F(), att = f.fileAtt || {};
    return [
      { id: 'resume', title: '客观履历', need: 0, body: f.resume, att: att.resume },
      { id: 'clinic', title: '临床诊断分析', need: 25, body: f.clinic || f.infection.note, att: att.clinic },
      ...f.files.map((x) => ({ ...x, att: att[x.id] })),
    ];
  }
  const unlocked = (it) => (it.need === 'E2' ? C.state.elite === 'e2' : C.state.trust >= it.need);
  const needText = (it) => (it.need === 'E2' ? 'E2' : `${it.need}%`);
  const recOpen = (r) => C.state.elite === 'e2' && C.state.trust >= (r.need || 0);
  const lockSig = () => fileList().map(unlocked).join('') + '|' + F().records.map(recOpen).join('') + '|' + C.state.elite;
  const SHORT = { resume: '履历', clinic: '临床', f1: '资料一', f2: '资料二', f3: '资料三', f4: '资料四' };

  function files() {
    const t = C.state.trust, list = fileList();
    const marks = [0, 25, 50, 100, 150, 200].map((m) => [m, list.filter((x) => x.need === m).map((x) => SHORT[x.id] || x.title).join(' · ')]);
    $('#files').innerHTML = C.head('08', 'CLASSIFIED FILES', '档案资料', '拖动信赖值解锁档案；晋升记录与干员密录还需要精英阶段 2。以下为本页对档案内容的概述，并非原文。') + `
      <div class="wrap fz">
        <div class="panel fz-term" data-reveal>
          <div class="fz-auth mono"><span><i class="ar-led"></i>PRTS · ARCHIVE ACCESS // ${F().code}</span><span>DOCTOR · <b class="fz-count"></b></span></div>
          <div class="fz-ctl">
            <div class="fz-trust">
              <div class="fz-tv"><label for="fz-trust">信赖值</label><output class="mono" for="fz-trust">${t}%</output></div>
              <div class="fz-track">
                <input id="fz-trust" type="range" min="0" max="200" step="1" value="${t}" style="--v:${t / 200}" aria-describedby="fz-trust-h">
                <div class="fz-marks">${marks.map(([m, lab]) => `<button type="button" class="fz-mark" data-fztrust="${m}" style="--x:${m / 200}" aria-label="信赖值设为 ${m}%${lab ? '，解锁' + lab : ''}"><i></i><span>${m}</span>${lab ? `<em>${lab}</em>` : ''}</button>`).join('')}</div>
              </div>
              <p class="sr" id="fz-trust-h">方向键逐点调整，Page Up / Page Down 每次 10 点</p>
            </div>
            <div class="fz-elite"><span>精英阶段</span><div class="seg elite-seg" role="group" aria-label="精英阶段"><button type="button" data-elite="e0" class="${C.state.elite === 'e0' ? 'on' : ''}">精英零</button><button type="button" data-elite="e2" class="${C.state.elite === 'e2' ? 'on' : ''}">精英二</button></div></div>
          </div>
        </div>
        <div class="fz-body">
          <nav class="fz-list" aria-label="档案列表" data-reveal></nav>
          <article class="panel fz-reader" data-reveal style="--i:1">
            <header class="fz-head"><span class="fz-code mono"></span><h3></h3><span class="fz-status mono" aria-live="polite"></span></header>
            <span class="fz-wm" aria-hidden="true">${A.emblem(220)}</span>
            <div class="fz-page"><div class="fz-text"></div><div class="fz-bars" aria-hidden="true"></div></div>
            <div class="fz-att-host"></div>
            <footer class="fz-foot mono"></footer>
            <span class="fz-stamp mono" aria-hidden="true"></span>
            <span class="fz-scan" aria-hidden="true"></span>
          </article>
        </div>
        <h3 class="sub-h fz-rec-h" data-reveal>干员密录 <small>OPERATOR RECORDS · PARADOX SIMULATION</small><span class="fz-rec-n mono"></span></h3>
        <div class="fz-recs" data-reveal></div>
      </div>`;
    S.sig = '';
    refreshFiles(false);
  }

  function refreshFiles(animate = true) {
    syncPortrait();
    const nav = $('.fz-list');
    if (!nav) return;
    const list = fileList();
    if (!list.find((x) => x.id === S.file)) S.file = 'resume';
    const was = nav._open;
    const open = new Set(list.filter(unlocked).map((x) => x.id));
    const hadFocus = nav.contains(document.activeElement);
    nav.innerHTML = list.map((it, i) => {
      const ok = open.has(it.id), fresh = animate && was && ok && !was.has(it.id);
      return `<button type="button" class="fz-item ${ok ? 'open' : 'locked'}${it.id === S.file ? ' sel' : ''}${fresh ? ' fresh' : ''}" data-fz="${it.id}" aria-pressed="${it.id === S.file}">
        <span class="fz-no mono">${pad2(i + 1)}</span>${A.icon(ok ? 'unlock' : 'lock')}<span class="fz-t">${it.title}</span><small class="mono">${it.need ? needText(it) : 'OPEN'}</small></button>`;
    }).join('');
    if (hadFocus) $(`.fz-item[data-fz="${S.file}"]`, nav)?.focus({ preventScroll: true });
    nav._open = open;
    const cnt = $('.fz-count');
    if (cnt) cnt.textContent = `已解密 ${open.size} / ${list.length}`;
    nav.style.setProperty('--p', (open.size / list.length).toFixed(3));
    syncTrustUI();
    $$('#files .elite-seg button').forEach((b) => b.classList.toggle('on', b.dataset.elite === C.state.elite));
    showFile(S.file, animate);
    records(animate);
    S.sig = lockSig();
  }

  function syncTrustUI(fromSlider) {
    const v = C.state.trust, r = $('#fz-trust');
    if (r) { if (!fromSlider) r.value = v; r.style.setProperty('--v', v / 200); r.setAttribute('aria-valuetext', `信赖值 ${v}%`); }
    const o = $('.fz-tv output');
    if (o) o.textContent = v + '%';
    $$('.fz-mark').forEach((m) => m.classList.toggle('on', v >= +m.dataset.fztrust));
  }
  function setTrust(v, fromSlider) {
    v = clamp(Math.round(v), 0, 200);
    const before = fileList().filter(unlocked).length;
    C.state.trust = v;
    C.store.set('trust', v);
    syncTrustUI(fromSlider);
    if (lockSig() !== S.sig) {
      refreshFiles(true);
      if (fileList().filter(unlocked).length > before) sfx('tick');
    }
  }
  /** 点刻度 / “将信赖调至…”：信赖值在 0.6 秒内滑过去，沿途解锁的档案逐个亮起 */
  function glideTrust(to) {
    const from = C.state.trust, t0 = performance.now(), dur = C.reduce ? 0 : 600;
    const tok = (S.glide = (S.glide || 0) + 1);
    const step = (now) => {
      if (S.glide !== tok) return;
      const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      setTrust(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** 文字每一行的外框（相对 .fz-page）：用来盖上“涂黑条”，再一条条揭开 */
  function lineBoxes(text, page) {
    const base = page.getBoundingClientRect(), out = [], rg = document.createRange();
    for (const p of text.children) {
      rg.selectNodeContents(p);
      for (const r of rg.getClientRects()) {
        if (r.width < 1) continue;
        const t = r.top - base.top, last = out[out.length - 1];
        if (last && Math.abs(last.t - t) < 6) {
          const right = Math.max(last.l + last.w, r.right - base.left);
          last.l = Math.min(last.l, r.left - base.left);
          last.w = right - last.l;
          last.h = Math.max(last.h, r.height);
        } else out.push({ t, l: r.left - base.left, w: r.width, h: r.height });
      }
    }
    return out.map((o) => ({ t: Math.round(o.t + 1), l: Math.round(o.l - 3), w: Math.round(o.w + 6), h: Math.round(o.h - 2) }));
  }
  /** 揭开：术师形态是涂黑条被一道余烬烧穿；医疗形态是灰白的涂层碎成灰烬飘走。返回揭开完毕的时刻（毫秒） */
  function peel(rd) {
    const page = $('.fz-page', rd), text = $('.fz-text', rd), bars = $('.fz-bars', rd);
    const lines = lineBoxes(text, page);
    const ash = form() === 'alter';
    let html = '', end = 0;
    lines.forEach((ln, i) => {
      const d = 120 + i * 70;
      const box = `left:${ln.l}px;top:${ln.t}px;height:${ln.h}px;`;
      if (!ash) {
        const dur = Math.round(380 + ln.w * 0.55);
        html += `<i class="pb" style="${box}width:${ln.w}px;--d:${d}ms;--t:${dur}ms"></i><i class="pe" style="${box}--w:${ln.w}px;--d:${d}ms;--t:${dur}ms"></i>`;
        end = Math.max(end, d + dur);
      } else {
        const n = clamp(Math.round(ln.w / 48), 2, 12), sw = ln.w / n;
        for (let k = 0; k < n; k++) {
          const dd = d + k * 34 + ((Math.random() * 160) | 0);
          html += `<i class="pa" style="${box}left:${(ln.l + k * sw).toFixed(1)}px;width:${(sw + 0.8).toFixed(1)}px;--d:${dd}ms;--dx:${((Math.random() - 0.3) * 26).toFixed(1)}px;--dy:${(-10 - Math.random() * 22).toFixed(1)}px;--r:${((Math.random() - 0.5) * 50).toFixed(0)}deg"></i>`;
          end = Math.max(end, dd + 900);
        }
      }
    });
    bars.innerHTML = html;
    rd.classList.add('peel', 'scan');
    clearTimeout(rd._t);
    rd._t = setTimeout(() => { bars.textContent = ''; rd.classList.remove('peel', 'scan'); }, end + 150);
    return end;
  }

  /* ---------- 附件：按 k 选版式（文字均为概述 / 整理） ---------- */
  function labAtt() {
    const b = D.forms.base, a = D.forms.alter, cur = form();
    const row = (k, get, max, unit, dec) => `<div class="fa-lab-row"><span class="fa-lab-k">${k}</span>${[b, a].map((f) => { const v = get(f); return `<div class="fa-lab-v${f.key === cur ? ' me' : ''}"><small>${f.mood}</small><i style="--w:${(v / max).toFixed(3)}"></i><b class="mono">${v.toFixed(dec)}${unit}</b></div>`; }).join('')}</div>`;
    return row('体细胞与源石融合率', (f) => f.infection.fusion, 20, '%', 0) + row('血液源石结晶密度', (f) => f.infection.crystal, 1, 'u/L', 2);
  }
  const ATT = {
    chips: (a) => `<div class="fa-chips">${a.items.map((x) => `<span>${x}</span>`).join('')}</div>${a.sub ? `<p class="fa-sub">${a.sub}</p><div class="fa-chips sub">${a.subItems.map((x) => `<span>${x}</span>`).join('')}</div>` : ''}`,
    lab: () => `<div class="fa-lab">${labAtt()}</div>`,
    cards: (a) => `<div class="fa-cards">${a.items.map(([t, d], i) => `<div style="--k:${i}"><b>${t}</b><p>${d}</p></div>`).join('')}</div>`,
    family: (a) => `<div class="fa-family"><div class="fa-par">${a.items.slice(0, 2).map(([t, d]) => `<div><b>${t}</b><p>${d}</p></div>`).join('')}</div><i class="fa-tie" aria-hidden="true"></i><div class="fa-kid"><b>${a.items[2][0]}</b><p>${a.items[2][1]}</p></div></div>${a.note ? `<p class="fa-note">${a.note}</p>` : ''}`,
    guide: (a) => `<ol class="fa-guide">${a.items.map(([g, cue, m], i) => `<li style="--k:${i}"><i class="mono" aria-hidden="true">${g}</i><b>${cue}</b><p>${m}</p></li>`).join('')}</ol>`,
    redact: (a) => `<ul class="fa-papers">${a.items.map((t) => `<li>${t}</li>`).join('')}</ul><p class="fa-redact mono">${a.foot}</p>`,
    shift: (a) => `<div class="fa-shift"><div class="fa-shift-h"><span></span>${a.cols.map((c) => `<b>${c}</b>`).join('')}</div>${a.items.map(([k, x, y]) => `<div class="fa-shift-r"><span>${k}</span><p class="${x === '—' ? 'na' : ''}">${x}</p><p>${y}</p></div>`).join('')}</div>`,
    log: (a) => `<ol class="fa-log">${a.items.map(([who, t], i) => `<li style="--k:${i}"><small class="mono">${who}</small><p>${t}</p></li>`).join('')}</ol>`,
    letters: (a) => `<div class="fa-letters">${a.items.map(([from, to, t], i) => `<article class="fa-letter" style="--k:${i}"><header class="mono"><span>FROM</span><b>${from}</b><span>TO</span><b>${to}</b>${ICO.mail()}</header><p>${t}</p></article>`).join('')}</div>`,
    film: (a) => `<div class="fa-film">${ICO.film()}${a.items.map((t, i) => `<p style="--k:${i}"><i class="mono">${pad2(i + 1)}</i>${t}</p>`).join('')}</div>`,
    xref: (a) => `<button type="button" class="fa-xref" data-fzrec="${esc(a.to)}"><span>${a.text}</span><b>看干员密录 ${A.icon('arrow')}</b></button>`,
  };
  const attHTML = (a) => (a && ATT[a.k] ? `<section class="fz-att k-${a.k}" aria-label="附件：${esc(a.h || '')}"><p class="fz-att-h mono">${ICO.clip()}ATTACHMENT<span>${a.h || ''}</span></p>${ATT[a.k](a)}</section>` : '');

  function showFile(id, animate = true) {
    const list = fileList(), idx = list.findIndex((x) => x.id === id), it = list[idx];
    const rd = $('.fz-reader');
    if (!it || !rd) return;
    S.file = id;
    $$('.fz-item').forEach((b) => { const on = b.dataset.fz === id; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); });
    const ok = unlocked(it), key = `${id}|${ok}|${form()}`;
    if (rd.dataset.shown === key) return;
    rd.dataset.shown = key;
    const f = F();
    const title = $('h3', rd), st = $('.fz-status', rd), text = $('.fz-text', rd), stamp = $('.fz-stamp', rd), att = $('.fz-att-host', rd);
    $('.fz-code', rd).textContent = `${f.code} / FILE ${pad2(idx + 1)} · ${it.need === 'E2' ? 'ELITE II' : 'TRUST ' + it.need + '%'}`;
    if (animate) scramble(title, it.title); else title.textContent = it.title;
    $('.fz-bars', rd).textContent = '';
    clearTimeout(rd._t);
    rd.classList.remove('peel', 'scan', 'denied', 'granted', 'stamped', 'att-in');
    $('.fz-foot', rd).textContent = `解锁条件 · ${it.need === 'E2' ? '精英阶段 2' : it.need ? '信赖 ≥ ' + it.need + '%' : '初始开放'}　｜　本页概述，非档案原文　｜　${it.body.length} 字${it.att ? '　｜　附件 1 份' : ''}`;
    if (!ok) {
      rd.classList.add('denied');
      st.textContent = 'ACCESS DENIED · 权限不足';
      stamp.textContent = 'CLASSIFIED';
      att.textContent = '';
      const n = clamp(Math.round(it.body.length / 34), 3, 9);
      const widths = Array.from({ length: n }, (_, i) => (i === n - 1 ? 30 + Math.random() * 30 : 78 + Math.random() * 22).toFixed(0));
      const go = it.need === 'E2'
        ? '<button type="button" class="btn btn-ghost fz-go" data-elite="e2">切换至精英二</button>'
        : `<button type="button" class="btn btn-ghost fz-go" data-fztrust="${it.need}">将信赖调至 ${it.need}%</button>`;
      text.innerHTML = `<div class="fz-lock"><p class="fz-lock-h mono">[ ${it.need === 'E2' ? '需要精英阶段 2' : `需要信赖值 ≥ ${it.need}%`} ]</p><div class="fz-fake" aria-hidden="true">${widths.map((w) => `<i style="width:${w}%"></i>`).join('')}</div>${go}</div>`;
      return;
    }
    rd.classList.add('granted');
    st.textContent = 'ACCESS GRANTED · 已解密';
    stamp.textContent = 'DECLASSIFIED';
    // 末尾一个闪烁的终端光标
    text.innerHTML = it.body.split(/\n+/).map((p, i, a) => `<p>${esc(p)}${i === a.length - 1 ? '<i class="fz-caret" aria-hidden="true"></i>' : ''}</p>`).join('');
    att.innerHTML = attHTML(it.att);
    if (animate && !C.reduce) {
      const end = peel(rd);
      rd.style.setProperty('--ad', Math.round(end * 0.7) + 'ms');
      requestAnimationFrame(() => rd.classList.add('stamped', 'att-in'));
    } else { rd.style.setProperty('--ad', '0ms'); rd.classList.add('stamped'); }
  }

  /* ---------- 干员密录：剧情里的场景背景做横幅，蚀刻章做封印；展开后是分幕概述 ---------- */
  function sceneShot(bg) {
    if (bg === 'letter') return `<span class="rec-shot letter" aria-hidden="true"><span>${ICO.mail()}</span><i></i><i></i><i></i></span>`;
    return SK(avg(bg, 400), '', 'rec-shot', 'span');
  }
  /** 点分幕：横幅换成这一幕的场景（交叉淡入），并在横幅上写上幕名——像翻一本分镜 */
  function showScene(i, k) {
    const card = $(`.fz-rec[data-rec="${i}"]`), r = F().records[i];
    if (!card || !r || !r.scenes || !r.scenes[k]) return;
    const [bg, when, t] = r.scenes[k];
    $$('.rec-sc', card).forEach((b, j) => { b.classList.toggle('cur', j === k); b.setAttribute('aria-pressed', j === k); });
    const cap = $('.rec-cap', card);
    if (cap) cap.innerHTML = `<small class="mono">${pad2(k + 1)} · ${when}</small><b>${t}</b>`;
    const host = $('.rec-ban-img', card);
    if (!host || bg === 'letter') return;
    const src = avg(bg, 760), cur = host.lastElementChild;
    if (cur && cur.getAttribute('src') === src) return;
    const im = new Image();
    im.alt = '';
    im.decoding = 'async';
    im.referrerPolicy = 'no-referrer';
    im.className = 'rec-next';
    im.onload = () => {
      host.classList.add('ok');
      const olds = $$('img', host).filter((x) => x !== im);
      const done = () => { olds.forEach((x) => x.remove()); im.classList.remove('rec-next'); };
      if (C.reduce) { done(); return; }
      im.animate([{ opacity: 0, transform: 'scale(1.06)' }, { opacity: 1, transform: 'scale(1.02)' }], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = done;
    };
    im.src = src;
    host.appendChild(im);
  }
  function records(animate) {
    const host = $('.fz-recs');
    if (!host) return;
    const f = F(), e2 = C.state.elite === 'e2', fk = form();
    // 这一次刚解锁的密录：蚀刻章“盖”上去（一次性）
    const seen = host._seen && host._form === fk ? host._seen : null;
    const nowOpen = new Set(f.records.map((r, i) => (recOpen(r) ? i : -1)).filter((i) => i >= 0));
    if (e2) nowOpen.add('p');
    host._seen = nowOpen;
    host._form = fk;
    const fresh = (i) => !!(animate && seen && nowOpen.has(i) && !seen.has(i));
    const lockBtn = (need) => (!e2
      ? '<button type="button" class="btn btn-ghost fz-go" data-elite="e2">切换至精英二</button>'
      : `<button type="button" class="btn btn-ghost fz-go" data-fztrust="${need}">将信赖调至 ${need}%</button>`);
    const fake = (n) => `<div class="fz-fake" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i style="width:${i === n - 1 ? 46 : 92 - i * 4}%"></i>`).join('')}</div>`;
    let nOpen = 0;
    const recs = f.records.map((r, i) => {
      const ok = recOpen(r), key = `${fk}:${i}`, open = ok && S.recOpen.has(key);
      if (ok) nOpen++;
      const sc = r.scenes || [];
      return `<article class="panel fz-rec${ok ? '' : ' locked'}${open ? ' open' : ''}${fresh(i) ? ' fresh' : ''}" data-rec="${i}" style="--i:${i}">
        <div class="rec-ban">${SK(avg(r.bg, 760), '', 'rec-ban-img')}<span class="rec-no mono" aria-hidden="true">${pad2(i + 1)}</span>${sc.length ? `<span class="rec-cap" aria-live="polite"><small class="mono">01 · ${sc[0][1]}</small><b>${sc[0][2]}</b></span>` : ''}${r.medal ? `<img class="rec-medal" src="${medalSrc(r.medal)}" alt="蚀刻章 · ${r.name}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>
        <div class="rec-body">
          <header><div><small class="mono">OPERATOR RECORD · ${pad2(i + 1)}</small><h4>${r.name}</h4><span class="fz-cond">${r.cond}</span></div>${A.icon(ok ? 'unlock' : 'lock', 'fz-rec-lock')}</header>
          <p class="fz-intro">“${r.intro}”</p>
          ${ok ? `<p class="fz-gist">${r.gist}</p>${sc.length ? `<button type="button" class="rec-toggle" data-recopen="${i}" aria-expanded="${open}" aria-controls="rec-sc-${fk}-${i}"><span>${open ? '收起分幕' : `分幕概述 · ${sc.length} 幕`}</span>${ICO.chev()}</button>` : ''}` : fake(3) + lockBtn(r.need)}
        </div>
        ${ok && sc.length ? `<ol class="rec-scenes${sc.length % 3 ? ' c4' : ''}" id="rec-sc-${fk}-${i}"${open ? '' : ' hidden'}>${sc.map(([bg, when, t, beat], k) => `<li style="--k:${k}"><button type="button" class="rec-sc${k ? '' : ' cur'}" data-recsc="${i}:${k}" aria-pressed="${!k}">${sceneShot(bg)}<span class="rec-sc-t"><small class="mono">${pad2(k + 1)} · ${when}</small><b>${t}</b><span>${beat}</span></span></button></li>`).join('')}</ol>` : ''}
      </article>`;
    }).join('');
    const p = f.paradox, pok = e2;
    const para = p ? `<article class="panel fz-rec fz-para${pok ? '' : ' locked'}${fresh('p') ? ' fresh' : ''}">
        <div class="rec-ban para" style="--fy:${(clamp((((f.rig || {}).e2 || {}).head || [0, 0.2])[1] - 0.135, 0, 1) / 0.73 * 100).toFixed(1)}%">${SK(shrink(f.art.e2, 760), '', 'rec-ban-img')}<span class="rec-no mono" aria-hidden="true">P</span><span class="rec-hex" aria-hidden="true">${A.icon('spark')}</span></div>
        <div class="rec-body">
          <header><div><small class="mono">PARADOX SIMULATION · 悖论模拟</small><h4>${p.name}</h4><span class="fz-cond">${p.cond}</span></div>${A.icon(pok ? 'unlock' : 'lock', 'fz-rec-lock')}</header>
          ${pok ? `<p class="fz-gist">${p.gist}</p>${p.stage ? `<div class="fz-stage"><span class="fz-vent" aria-hidden="true">${Array.from({ length: 9 }, (_, k) => `<i${k === 4 ? ' class="v"' : ''}></i>`).join('')}</span><p><b>关卡机制</b>${p.stage}</p></div>` : ''}` : fake(3) + lockBtn(0)}
        </div>
      </article>` : '';
    host.innerHTML = recs + para;
    host.classList.toggle('n2', f.records.length + (p ? 1 : 0) === 2);
    host.classList.toggle('has-open', !!$('.fz-rec.open', host));
    const n = $('.fz-rec-n');
    if (n) n.textContent = `${nOpen + (p && pok ? 1 : 0)} / ${f.records.length + (p ? 1 : 0)}`;
  }
  function toggleRec(i, force) {
    const card = $(`.fz-rec[data-rec="${i}"]`);
    if (!card || card.classList.contains('locked')) return;
    const key = `${form()}:${i}`, open = force ?? !S.recOpen.has(key);
    if (open) S.recOpen.add(key); else S.recOpen.delete(key);
    card.classList.toggle('open', open);
    card.parentNode.classList.toggle('has-open', !!$('.fz-rec.open', card.parentNode));
    const list = $('.rec-scenes', card), btn = $('.rec-toggle', card);
    if (list) list.hidden = !open;
    if (btn) { btn.setAttribute('aria-expanded', open); $('span', btn).textContent = open ? '收起分幕' : `分幕概述 · ${list ? list.children.length : 0} 幕`; }
    if (open && !C.reduce) {
      card.animate([{ opacity: 0.6, transform: 'translate3d(0, 8px, 0)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    return card;
  }

  /* ====================================================
   * 11 · 作战附录（分页终端）
   * ==================================================== */
  const TABS = [['talent', '天赋', 'TALENT'], ['skill', '技能', 'SKILL'], ['module', '模组', 'MODULE'], ['pot', '潜能', 'POTENTIAL'], ['riic', '后勤', 'RIIC'], ['table', '数据表', 'DATA']];
  const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ'];

  function paneTalent(f) {
    const [mx, my] = f.modules;
    return `<div class="ax-tal">
      <article class="ax-card ax-trait">
        <header><span class="ar-chip ar-chip-lg">${IMG(f.branchImg, '', 'ar-bicon')}</span><div><small class="mono">TRAIT · 分支特性</small><h4>${f.profession} · ${f.branch}</h4></div></header>
        <p class="ax-trait-t">${f.traitFull}</p>
        <ul class="ax-trait-mod">${[mx, my].map((m) => `<li><b class="mono">${m.code}</b><span>${m.stages[0].fx[0]}</span><p>${m.stages[0].fx[1]}</p></li>`).join('')}</ul>
      </article>
      ${f.talents.map((t, i) => `<article class="ax-card ax-talent">
        <header><span class="ax-num mono">0${i + 1}</span><div><small class="mono">TALENT · 第${i ? '二' : '一'}天赋</small><h4>${t.name}</h4></div></header>
        <ol class="ax-steps">${t.stages.map(([c, d, v], j) => `<li style="--j:${j}"><span class="ax-step-c mono">${c}</span><b class="ax-step-v">${v}</b><p>${d}</p></li>`).join('')}</ol>
        <p class="ax-potnote"><b>${t.pot[0]}</b>${t.pot[1]}</p>
      </article>`).join('')}
    </div>`;
  }

  function skillView(sk, lv) {
    const v = {};
    for (const k in sk.v) v[k] = sk.v[k][lv];
    const dur = sk.dur === null ? (v.c ? `充能 ${v.c}` : '瞬时') : sk.dur === '∞' ? '无限' : sk.dur + 's';
    return { v, desc: sk.text(v), init: sk.init[lv], cost: sk.cost[lv], dur };
  }
  function paneSkill(f) {
    return `<div class="ax-skills">${f.skills.map((sk, i) => `<article class="ax-sk skill" data-axsk="${i}">
      <header class="ax-sk-h">
        <div class="ax-sk-ic">${IMG(sk.icon, sk.name + ' 技能图标')}<span class="ax-sk-lvb mono"></span></div>
        <div class="ax-sk-tt"><small class="mono">SKILL 0${i + 1} · ${sk.unlock}开放</small><h4>${sk.name}</h4><span class="ax-sk-en">${sk.en}</span>
          <div class="ax-sk-tags"><span>${sk.sp}</span><span>${sk.trig}</span></div></div>
      </header>
      <div class="ax-lv" role="group" aria-label="${sk.name} 技能等级">${D.LEVELS.map((L, l) => `<button type="button" class="${l >= 7 ? 'm' : ''}" data-axlv="${i}:${l}" aria-label="等级 ${L}" aria-pressed="false"><span>${l >= 7 ? 'M' + (l - 6) : L}</span></button>`).join('')}</div>
      <p class="ax-sk-desc"></p>
      <div class="ax-sp">
        <div class="ax-spbar"><i class="ax-sp-fill"></i><i class="ax-sp-run" aria-hidden="true"></i><span class="ax-sp-lbl mono"></span></div>
        <dl class="ax-sp-nums"><div><dt>初始技力</dt><dd class="mono" data-n="init"></dd></div><div><dt>技力消耗</dt><dd class="mono" data-n="cost"></dd></div><div><dt>持续</dt><dd class="mono" data-n="dur"></dd></div></dl>
      </div>
      <div class="ax-up"><p class="ax-up-h"></p><div class="ax-up-m"></div></div>
      <p class="ax-sk-note">${sk.note}</p>
      <button class="btn btn-primary cast" type="button" data-cast="${sk.id}">${A.icon('spark')}施放演出<span class="cd"></span></button>
    </article>`).join('')}</div>`;
  }
  function setLv(i, l, anim = true) {
    const f = F(), sk = f.skills[i], card = $(`.ax-sk[data-axsk="${i}"]`);
    S.lv[form()][i] = l;
    if (!sk || !card) return;
    const v = skillView(sk, l);
    $$('[data-axlv]', card).forEach((b) => { const k = +b.dataset.axlv.split(':')[1]; b.classList.toggle('on', k === l); b.classList.toggle('past', k < l); b.setAttribute('aria-pressed', k === l); });
    const badge = $('.ax-sk-lvb', card);
    badge.textContent = l >= 7 ? `专精 ${ROMAN[l - 7]}` : `Lv.${l + 1}`;
    badge.classList.toggle('m', l >= 7);
    const desc = $('.ax-sk-desc', card);
    desc.innerHTML = v.desc;
    if (anim && !C.reduce) $$('b', desc).forEach((b) => b.classList.add('bump'));
    const n = (k) => $(`[data-n="${k}"]`, card);
    if (anim) { tween(n('init'), v.init); tween(n('cost'), v.cost); } else { n('init').textContent = v.init; n('cost').textContent = v.cost; }
    n('dur').textContent = v.dur;
    const bar = $('.ax-spbar', card);
    bar.style.setProperty('--k', v.cost ? (v.init / v.cost).toFixed(3) : 0);
    bar.style.setProperty('--n', v.cost);
    // 技力自动回复每秒 1 点：从初始技力充到满要 (消耗 − 初始) 秒——一段按真实时长循环的充能
    bar.style.setProperty('--t', Math.max(1, v.cost - v.init) + 's');
    const run = $('.ax-sp-run', card);
    run.style.animation = 'none';
    void run.offsetWidth;
    run.style.animation = '';
    $('.ax-sp-lbl', card).textContent = `SP ${v.init} / ${v.cost}`;
    const up = l === 0 ? null : l <= 6 ? f.skillUp[l - 1] : sk.mastery[l - 7];
    $('.ax-up-h', card).innerHTML = l === 0 ? '初始等级 · 无需材料' : l <= 6 ? `升至 ${l + 1} 级 <small>· 三个技能共用</small>` : `专精 ${ROMAN[l - 7]} <small>· 仅此技能</small>`;
    $('.ax-up-m', card).innerHTML = up ? mats(up) : '';
  }

  /* ---------- 模组故事：四种版式 ---------- */
  const TALE = {
    letter: (t) => `<div class="tl-paper"><p class="tl-to">${t.to}：</p>${t.paras.map((p) => `<p>${p}</p>`).join('')}<p class="tl-sign">${t.sign}</p></div>`,
    race: (t) => `<ol class="tl-track">${t.steps.map(([k, d], i) => `<li class="${i === 3 ? 'oops' : ''}${i === t.steps.length - 1 ? ' baa' : ''}" style="--k:${i}"><i class="tl-flag mono" aria-hidden="true">${i === t.steps.length - 1 ? '!' : i + 1}</i><b>${k}</b><p>${d}</p></li>`).join('')}</ol>`,
    tape: (t, m) => `<div class="tl-cassette" aria-hidden="true"><span class="tl-label">${m.name.replace(/[“”]/g, '')}<small class="mono">SIDE A · ${t.tracks.length} TRACKS</small></span><span class="tl-win"><i class="tl-reel"></i><i class="tl-reel"></i></span></div>
      <ol class="tl-tracks">${t.tracks.map(([n, kind, note], i) => `<li class="${i === t.tracks.length - 1 ? 'blank' : ''}" style="--k:${i}"><span class="mono">${pad2(i + 1)}</span><div><b>${n}</b><small>录音内容 · ${kind}</small><p>${note}</p></div></li>`).join('')}</ol>`,
    spec: (t) => `<div class="tl-spec"><p class="tl-spec-n"><small class="mono">SPECIMEN</small>${t.name}</p><dl>${t.rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <p class="tl-h mono">防啃指南 · 阿黛尔小姐的建议</p><ol class="tl-guide">${t.guide.map((g) => `<li>${g}</li>`).join('')}</ol><blockquote>“${t.quote}”</blockquote></div>`,
  };
  const TALE_H = { letter: ['LETTER', '信笺'], race: ['RACE', '赛况'], tape: ['TAPE', '录音带'], spec: ['SPECIMEN', '标本卡'] };
  const taleHTML = (m) => {
    const t = m.tale;
    if (!t || !TALE[t.k]) return `<p class="ax-mod-story">${m.story}</p>`;
    return `<section class="ax-tale t-${t.k}" aria-label="模组故事（概述）"><p class="ax-tale-h mono">${TALE_H[t.k][0]} · <span>${TALE_H[t.k][1]}（概述）</span></p>${TALE[t.k](t, m)}</section>`;
  };
  function paneModule(f) {
    return `<div class="ax-mods">${f.modules.map((m, i) => `<article class="ax-mod k-${m.kind}" data-axmodc="${i}">
      <header class="ax-mod-head">
        <div class="ax-mod-art">
          ${SK(shrink(m.img, 520), m.name + ' 模组图', 'ax-mod-img')}
          <span class="ax-mod-kind" aria-hidden="true">${m.kind}</span>
          <img class="ax-mod-type" src="${m.type}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">
        </div>
        <div class="ax-mod-id">
          <small class="mono">${m.code} · ${f.branch}专属模组</small><h4>${m.name}</h4>
          <div class="seg ax-mod-lv" role="group" aria-label="模组等级">${[0, 1, 2].map((s) => `<button type="button" data-axmod="${i}:${s}">等级 ${s + 1}</button>`).join('')}</div>
          <div class="ax-mod-stats"></div>
        </div>
      </header>
      <ol class="ax-mod-fx"></ol>
      <p class="ax-mod-need mono"></p>
      <div class="ax-mod-mats"></div>
      ${taleHTML(m)}
      <details class="ax-mod-task"><summary>解锁任务 · ${m.tasks.length} 项（概述）</summary><ol>${m.tasks.map((t) => `<li>${t}</li>`).join('')}</ol></details>
    </article>`).join('')}</div>`;
  }
  function setMod(i, s) {
    const m = F().modules[i], card = $(`.ax-mod[data-axmodc="${i}"]`);
    S.mod[form()][i] = s;
    if (!m || !card) return;
    $$('[data-axmod]', card).forEach((b) => { const on = +b.dataset.axmod.split(':')[1] === s; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    const st = m.stages[s];
    $('.ax-mod-stats', card).innerHTML = [['生命上限', st.hp], ['攻击', st.atk]].filter(([, v]) => v).map(([k, v]) => `<div><span>${k}</span><b class="mono">+${v}</b></div>`).join('');
    $('.ax-mod-fx', card).innerHTML = m.stages.map((x, j) => `<li class="${j < s ? 'kept' : j === s ? 'new' : 'later'}"><span class="mono">Lv.${j + 1}</span><b>${x.fx[0]}</b><p>${x.fx[1]}</p></li>`).join('');
    $('.ax-mod-need', card).innerHTML = `解锁 · 精英2 · 60级 · 信赖 ${m.trust[s]}%${s ? ` · 需先升至等级 ${s}` : ' · 完成解锁任务'}`;
    $('.ax-mod-mats', card).innerHTML = mats(m.mats[s]);
  }

  function panePot(f) {
    return `<div class="ax-pot">
      <div class="ax-token">
        <div class="ax-token-img">${IMG(shrink(f.tokenImg, 180), f.tokenName)}</div>
        <div><small class="mono">TOKEN · 信物</small><h4>${f.tokenName}</h4><p>${f.token}</p><span class="note">用于提升${f.name}的潜能。每多一枚信物，潜能提升一级，最高 6 级。</span></div>
      </div>
      <ol class="ax-chain" aria-label="潜能等级">${[1, 2, 3, 4, 5, 6].map((n) => `<li><button type="button" data-axpot="${n}" aria-pressed="false"><i class="mono"><span>${n}</span></i><b>${n === 1 ? '初始' : f.potentials[n - 2]}</b></button></li>`).join('')}</ol>
      <div class="ax-pot-sum"></div>
    </div>`;
  }
  function setPot(p) {
    const f = F(), host = $('.ax-pot');
    S.pot[form()] = p;
    if (!host) return;
    $$('[data-axpot]', host).forEach((b) => { const n = +b.dataset.axpot; b.parentNode.classList.toggle('on', n <= p); b.parentNode.classList.toggle('cur', n === p); b.setAttribute('aria-pressed', n === p); });
    $('.ax-chain', host).style.setProperty('--p', ((p - 1) / 5).toFixed(3));
    const fx = f.potFx.slice(0, p - 1);
    const sum = (k) => fx.reduce((s, x) => s + (x[k] || 0), 0);
    const cost = sum('cost'), atk = sum('atk'), re = sum('redeploy');
    const costE2 = +String(f.misc[1][1]).split('→').pop().trim();
    const redeploy = parseInt(f.misc[0][1], 10);
    const tal = fx.filter((x) => x.tal != null).map((x) => f.talents[x.tal]);
    const rows = [];
    if (cost) rows.push(['部署费用', `${cost}`, `精英2：${costE2} → ${costE2 + cost}`]);
    if (re) rows.push(['再部署时间', `${re}s`, `${redeploy}s → ${redeploy + re}s`]);
    if (atk) rows.push(['攻击力', `+${atk}`, `精英2 · 90级：${f.stats.atk[3]} → ${f.stats.atk[3] + atk}`]);
    tal.forEach((t) => rows.push([`天赋【${t.name}】`, '增强', t.pot[1]]));
    $('.ax-pot-sum', host).innerHTML = `<p class="ax-pot-h mono">POTENTIAL ${p} / 6 · 累计效果</p>` + (rows.length
      ? `<ul>${rows.map(([k, v, d]) => `<li><span>${k}</span><b class="mono">${v}</b><small>${d}</small></li>`).join('')}</ul>`
      : '<p class="note">初始潜能：还没有额外效果。点上面的节点看看每一级。</p>');
  }

  function paneRiic(f) {
    const slots = [];
    f.infra.forEach((b) => { const k = (b.slot || 1) - 1; (slots[k] = slots[k] || []).push(b); });
    return `<div class="ax-riic">${slots.map((list, si) => `<div class="ax-slot${list.length > 1 ? ' multi' : ''}">
      <p class="ax-slot-h mono">RIIC SKILL · 栏位 0${si + 1}</p>
      <div class="ax-slot-row">${list.map((b, j) => `${j ? `<span class="ax-arrow" aria-hidden="true"><i></i><small>${b.cond}</small></span>` : ''}<article class="ax-inf${j < list.length - 1 ? ' old' : ''}">
        <div class="ax-inf-ic">${IMG(b.icon, b.name + ' 图标')}</div>
        <div><span class="ax-room">${b.room}</span><h4>${b.name}</h4><small class="mono">${b.cond}${j ? ' · 替换上一项' : ''}</small><p>${b.desc}</p></div>
      </article>`).join('')}</div>
    </div>`).join('')}
    <p class="note">${form() === 'base' ? '基建里的她：在制造站和源石打交道，在办公室里联络人脉——天灾信使的老本行。' : '同一栏位里，精英2 的「实战技巧：行医」替换「医疗专精·α」；「火山温泉浴」则把每一名行医都变成宿舍的温泉。'}</p>
    </div>`;
  }

  function paneTable(f) {
    const cur = form();
    const attr = ['base', 'alter'].map((k) => {
      const x = D.forms[k], s = x.stats, tr = trustOf(x);
      return `<div class="ax-tbl-w${k === cur ? ' me' : ''}"><p class="ax-tbl-h"><b>${x.name}</b><small class="mono">${x.profession} · ${x.branch}</small></p>
        <div class="ar-scroll" tabindex="0" role="region" aria-label="${x.name} 属性表"><table class="ar-table">
          <thead><tr><th>阶段</th><th>生命</th><th>攻击</th><th>防御</th><th>法抗</th></tr></thead>
          <tbody>${s.phases.map((p, i) => `<tr><th>${p}</th><td>${s.hp[i]}</td><td>${s.atk[i]}</td><td>${s.def[i]}</td><td>${s.res[i]}</td></tr>`).join('')}
          <tr class="sub"><th>满信赖加成</th><td>${tr.hp ? '+' + tr.hp : '—'}</td><td>${tr.atk ? '+' + tr.atk : '—'}</td><td>—</td><td>—</td></tr></tbody>
        </table></div>
        <p class="ax-tbl-misc mono">${x.misc.map(([a, b]) => `${a} ${b}`).join(' · ')}</p></div>`;
    }).join('');
    const skills = f.skills.map((sk, i) => {
      const keys = Object.keys(sk.v), me = S.lv[cur][i];
      return `<div class="ax-tbl-w"><p class="ax-tbl-h">${IMG(sk.icon, '', 'ax-tbl-ic')}<b>${sk.name}</b><small class="mono">${sk.en} · ${sk.sp} · ${sk.trig}</small></p>
        <div class="ar-scroll" tabindex="0" role="region" aria-label="${sk.name} 数值表"><table class="ar-table ax-skt">
          <thead><tr><th>等级</th>${keys.map((k) => `<th>${(sk.cols && sk.cols[k]) || k}</th>`).join('')}<th>初始</th><th>消耗</th><th>持续</th></tr></thead>
          <tbody>${D.LEVELS.map((L, l) => { const v = skillView(sk, l); return `<tr class="${l === me ? 'me' : ''}${l >= 7 ? ' m' : ''}"><th>${L}</th>${keys.map((k) => `<td>${v.v[k]}</td>`).join('')}<td>${v.init}</td><td>${v.cost}</td><td>${sk.dur === null ? '—' : v.dur}</td></tr>`; }).join('')}</tbody>
        </table></div></div>`;
    }).join('');
    return `<div class="ax-table">
      <p class="ax-tbl-sec mono">ATTRIBUTES · 两种形态的属性</p><div class="ax-tbl-2">${attr}</div>
      <p class="ax-tbl-sec mono">SKILL DATA · ${f.name}的技能数值（高亮行为「技能」页当前选中的等级）</p><div class="ax-tbl-3">${skills}</div>
    </div>`;
  }

  const PANES = { talent: paneTalent, skill: paneSkill, module: paneModule, pot: panePot, riic: paneRiic, table: paneTable };
  function afterPane(k) {
    const cur = form();
    if (k === 'skill') F().skills.forEach((_, i) => setLv(i, S.lv[cur][i], false));
    else if (k === 'module') F().modules.forEach((_, i) => setMod(i, S.mod[cur][i]));
    else if (k === 'pot') setPot(S.pot[cur]);
  }
  function setTab(k, focus) {
    if (!PANES[k]) return;
    const pane = $('#ax-pane');
    if (!pane) return;
    const changed = k !== S.tab;
    S.tab = k;
    C.store.set('apxTab', k);
    $$('[data-axtab]').forEach((b) => { const on = b.dataset.axtab === k; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    pane.setAttribute('aria-labelledby', 'ax-tab-' + k);
    pane.innerHTML = PANES[k](F());
    afterPane(k);
    if (changed && !C.reduce) { pane.classList.remove('swap'); void pane.offsetWidth; pane.classList.add('swap'); }
  }

  function appendix() {
    const f = F();
    if (!PANES[S.tab]) S.tab = 'talent';
    const e2 = (k) => f.stats[k][3];
    const quick = [['攻击 · 精英2', e2('atk')], ['生命 · 精英2', e2('hp')], ['攻击间隔', f.misc[3][1]], ['部署费用', f.misc[1][1]], ['再部署', f.misc[0][1]], ['阻挡', f.misc[2][1]]];
    $('#appendix').innerHTML = C.head('13', 'APPENDIX', '作战附录', '天赋、技能、模组、潜能与基建技能：游戏内的数值资料（PRTS Wiki 核对）。点技能图标可以观看施放演出。') + `
      <div class="wrap ax">
        <div class="panel ax-sum" data-reveal>
          <div class="ax-cls">${A.classIcon(f.profession)}<div><b>${f.profession} · ${f.branch}</b><span>${f.traitFull}</span>
            <p class="ax-cls-mods">${f.modules.map((m) => `<button type="button" data-axgo="module" title="查看模组"><i class="mono">${m.code}</i>${m.name}</button>`).join('')}</p></div></div>
          <dl class="ax-quick">${quick.map(([k, v]) => `<div><dt>${k}</dt><dd class="mono">${v}</dd></div>`).join('')}</dl>
          <div class="ax-cast" role="group" aria-label="施放演出">${f.skills.map((sk) => `<button type="button" class="ax-castbtn" data-cast="${sk.id}" title="施放 ${sk.name}">${IMG(sk.icon)}<span>${sk.name}</span></button>`).join('')}</div>
        </div>
        <div class="panel ax-term" data-reveal style="--i:1">
          <div class="ax-tabs" role="tablist" aria-label="作战附录分页">${TABS.map(([k, zh, en], i) => `<button type="button" role="tab" id="ax-tab-${k}" aria-controls="ax-pane" aria-selected="${k === S.tab}" tabindex="${k === S.tab ? 0 : -1}" data-axtab="${k}"><small class="mono">0${i + 1} · ${en}</small><b>${zh}</b></button>`).join('')}</div>
          <div class="ax-pane" id="ax-pane" role="tabpanel" tabindex="0" aria-labelledby="ax-tab-${S.tab}">${PANES[S.tab](f)}</div>
        </div>
      </div>`;
    afterPane(S.tab);
  }

  /* ---------------------------------------------------- 事件（挂在各自的区块上，不经过 main.js 的全局分发） */
  function bind() {
    const pf = $('#profile'), fz = $('#files'), ax = $('#appendix');
    pf.addEventListener('click', (e) => {
      const ph = e.target.closest('[data-pfphase]');
      if (ph) { S.phase = +ph.dataset.pfphase; updateAttr(); return; }
      const rg = e.target.closest('[data-pfrange]');
      if (rg && +rg.dataset.pfrange !== S.range) setRange(+rg.dataset.pfrange);
    });
    pf.addEventListener('change', (e) => { if (e.target.matches('[data-pftrust]')) { S.withTrust = e.target.checked; updateAttr(); } });

    fz.addEventListener('input', (e) => { if (e.target.id === 'fz-trust') { S.glide = (S.glide || 0) + 1; setTrust(+e.target.value, true); } });
    fz.addEventListener('click', (e) => {
      const it = e.target.closest('[data-fz]');
      if (it) { showFile(it.dataset.fz, true); if (it.classList.contains('locked')) sfx('tick'); return; }
      const tj = e.target.closest('[data-fztrust]');
      if (tj) { glideTrust(+tj.dataset.fztrust); return; }
      const ro = e.target.closest('[data-recopen]');
      if (ro) { toggleRec(+ro.dataset.recopen); sfx('tick'); return; }
      const rs = e.target.closest('[data-recsc]');
      if (rs) {
        const [i, k] = rs.dataset.recsc.split(':').map(Number);
        showScene(i, k);
        // 横幅在视野外（窄屏上分幕排在下面）：滚回去看
        const ban = $(`.fz-rec[data-rec="${i}"] .rec-ban`);
        if (ban && innerWidth > 640 && ban.getBoundingClientRect().top < 0) ban.scrollIntoView({ block: 'start', behavior: C.reduce ? 'auto' : 'smooth' });
        return;
      }
      const xr = e.target.closest('[data-fzrec]');
      if (xr) {
        const i = F().records.findIndex((r) => r.name === xr.dataset.fzrec);
        const card = i >= 0 ? toggleRec(i, true) : null;
        const tgt = card || $(`.fz-rec[data-rec="${i}"]`);
        if (tgt) tgt.scrollIntoView({ block: 'start', behavior: C.reduce ? 'auto' : 'smooth' });
      }
    });
    // 档案列表：上下方向键在条目间移动
    fz.addEventListener('keydown', (e) => {
      const it = e.target.closest && e.target.closest('.fz-item');
      if (!it || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      const all = $$('.fz-item'), i = all.indexOf(it), to = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
      e.preventDefault();
      to.focus();
      showFile(to.dataset.fz, true);
    });

    ax.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-axtab]');
      if (tb) { if (tb.dataset.axtab !== S.tab) { setTab(tb.dataset.axtab); sfx('tick'); } return; }
      const go = e.target.closest('[data-axgo]');
      if (go) {
        if (go.dataset.axgo !== S.tab) { setTab(go.dataset.axgo); sfx('tick'); }
        const term = $('.ax-term', ax);
        if (term && term.getBoundingClientRect().top > innerHeight * 0.5) term.scrollIntoView({ block: 'start', behavior: C.reduce ? 'auto' : 'smooth' });
        return;
      }
      const lv = e.target.closest('[data-axlv]');
      if (lv) { const [i, l] = lv.dataset.axlv.split(':').map(Number); setLv(i, l); return; }
      const md = e.target.closest('[data-axmod]');
      if (md) { const [i, s] = md.dataset.axmod.split(':').map(Number); setMod(i, s); return; }
      const pt = e.target.closest('[data-axpot]');
      if (pt) setPot(+pt.dataset.axpot);
    });
    // 分页键盘操作：左右方向键 / Home / End
    ax.addEventListener('keydown', (e) => {
      const tb = e.target.closest && e.target.closest('[data-axtab]');
      if (!tb) return;
      const i = TABS.findIndex(([k]) => k === tb.dataset.axtab);
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
      if (to == null) return;
      e.preventDefault();
      setTab(TABS[(to + TABS.length) % TABS.length][0], true);
    });
  }

  let bound = false;
  const api = {
    init(ctx) {
      C = ctx;
      const t = C.store.get('apxTab', 'talent');
      if (PANES[t]) S.tab = t;
      if (!bound && $('#profile') && $('#files') && $('#appendix')) { bind(); bound = true; }
      return api;
    },
    profile, files, refreshFiles, appendix,
  };
  return api;
})();
