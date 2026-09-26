/* =========================================================
 * 主控：渲染、形态切换编排、交互
 * ========================================================= */
(() => {
  'use strict';
  const D = window.EYJA, A = window.ART;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('eyja.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('eyja.' + k, JSON.stringify(v)); } catch (e) { /* 隐私模式等 */ } },
  };

  const state = {
    form: store.get('form', 'base') === 'alter' ? 'alter' : 'base',
    elite: store.get('elite', 'e0') === 'e2' ? 'e2' : 'e0',
    view: store.get('view', 'art') === '3d' ? '3d' : 'art',
    lang: ['jp', 'cn', 'kr', 'en'].includes(store.get('lang', 'jp')) ? store.get('lang', 'jp') : 'jp',
    trust: clamp(+store.get('trust', 100) || 0, 0, 200),
    phase: 3, range: 2, file: 'resume', vfilter: 'all',
    busy: false, entered: false, playing: 0, lb: 0,
    // 语音区：语音组（默认 / 时装语音）、连播、术师的听觉模拟、医疗的读唇模式
    vset: 'default', vauto: store.get('vauto', false) === true, vsim: false, vlip: false,
  };
  const F = () => D.forms[state.form];
  const OTHER = () => D.forms[state.form === 'base' ? 'alter' : 'base'];
  document.documentElement.dataset.form = state.form;

  /* ---------------------------------------------------- 图片加载（优先 CORS，便于粒子采样） */
  const imgCache = new Map();
  function loadImg(src, retry = 1) {
    if (imgCache.has(src)) return imgCache.get(src);
    const p = new Promise((res) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.referrerPolicy = 'no-referrer';
      // 资源站偶尔整条连接挂住（既不 load 也不 error）：20 秒后按失败处理，别让调用方永远等下去
      const to = setTimeout(() => res(null), 20000);
      im.onload = () => { clearTimeout(to); res(im); };
      im.onerror = () => {
        const b = new Image();
        b.referrerPolicy = 'no-referrer';
        b.onload = () => { clearTimeout(to); res(b); };
        b.onerror = () => { clearTimeout(to); res(null); };
        b.src = src;
      };
      im.src = src;
    }).then((r) => {
      // PRTS 资源站偶尔超时：失败后稍等再试一次
      if (r || retry <= 0) return r;
      imgCache.delete(src);
      return wait(1500).then(() => loadImg(src, retry - 1));
    });
    imgCache.set(src, p);
    return p;
  }

  /** 缩略图：PRTS 资源站可以在服务端缩图（约 15 KB，而不是 0.5–1.3 MB 的原图） */
  function thumbUrl(src, w = 256) {
    if (!/media\.prts\.wiki/.test(src)) return src;
    return src.replace(/\?image_process=.*$/, '') + `?image_process=resize,w_${w}/format,webp/quality,Q_80`;
  }

  /* ---------------------------------------------------- 小工具 */
  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 2400);
  }
  function head(no, en, zh, desc = '') {
    return `<div class="wrap"><div class="sec-head" data-reveal>
      <span class="sec-no" data-n="${no}">${no}</span>
      <div class="sec-tt"><p class="sec-en">${en}</p><h2 class="sec-title">${zh}</h2>${desc ? `<p class="sec-desc">${desc}</p>` : ''}</div>
      <span class="sec-line"></span></div></div>`;
  }
  function countUp(el) {
    const to = parseFloat(el.dataset.count), dec = +el.dataset.dec || 0;
    const t0 = performance.now(), dur = 1400;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = (to * e).toFixed(dec);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ====================================================
   * 各区块渲染
   * ==================================================== */
  function renderHeroShell() {
    $('#hero').innerHTML = `
      <div class="hero-giant" aria-hidden="true"><span></span></div>
      <div class="hero-grid wrap">
        <div class="hero-info"></div>
        <div class="hero-visual">
          <div class="hv-circle"></div>
          <div class="hv-floor"></div>
          <canvas class="hv-shade gone" aria-hidden="true"></canvas>
          <div class="hv-art gone" title="点她一下"><img class="hv-img" alt="" draggable="false"><div class="th-bubble hv-bubble" aria-live="polite"></div></div>
          <div class="hv-dyn" title="点她一下"><div class="th-bubble hv-bubble2" aria-live="polite"></div></div>
          <div class="hv-dyn-tag mono"><i></i>官方动态立绘载入中 · 约 ${window.DYN ? DYN.MODELS.e2.size : ''}</div>
          <div class="hv-3d" title="点她一下 · 点地面让她走过去 · 左右拖动转视角"><div class="th-bubble hv-bubble3" aria-live="polite"></div></div>
          <div class="hv-3d-tag mono"><i></i>3D 模型生成中</div>
          <div class="hv-acts" role="group" aria-label="让她做个动作"></div>
          <div class="hv-hud"><span class="tl"></span><span class="tr"></span><div class="rd"></div></div>
        </div>
      </div>
      <div class="scroll-hint"><span>SCROLL</span><i></i></div>`;
  }
  function hud() {
    const f = F();
    $('.hv-hud .tl').innerHTML = `<b class="rec"><i></i>REC</b> FORM · ${f.moodEn}<br>${f.code} · 63.63°N 19.62°W`;
    // 右上：作战速览（精英2 · 90级，两个形态同一组指标对照；js/hero.js）
    const rd = $('.hv-hud .rd');
    if (rd && window.HERO && rd.dataset.form !== state.form) { rd.innerHTML = HERO.readoutHTML(f, state.form); rd.dataset.form = state.form; }
    // 立绘状态（职业已经在左栏的职业条和右上的速览里，这里不再重复）
    $('.hv-hud .tr').innerHTML = is3d()
      ? `3D · ${(window.DOLL && DOLL.outfits[doll3dKey()] || {}).name || ''} · TOON RIG`
      : `${state.elite === 'e0' ? 'ELITE 0' : 'ELITE II'} · ${heroDynOn() ? 'OFFICIAL DYNAMIC' : pupOn() ? 'LAYERED RIG' : 'LIVE RIG'}`;
    $('.hv-img').alt = `${f.name} ${state.elite === 'e0' ? '精英零' : '精英二'}立绘`;
  }
  function renderHero() {
    const f = F(), o = OTHER();
    $('.hero-giant span').textContent = f.giant;
    $('.hv-circle').innerHTML = state.form === 'base' ? A.circleBase() : A.circleAlter();
    const chars = [...f.name].map((c, k) => `<span class="ch" style="--k:${k}">${c}</span>`).join('');
    const height = f.basic.find((b) => b[0] === '身高')[1];
    $('.hero-info').innerHTML = `
      <p class="kicker mono"><span class="dot"></span>RHODES ISLAND · OPERATOR FILE // ${f.code}</p>
      <div class="cls-chip">${A.classIcon(f.profession)}<b>${f.profession}</b><i>/</i><span>${f.branch}</span>${f.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
      ${window.HERO ? HERO.nameHTML(f) : `<h1 class="hero-name"><span class="hn-main" style="--ns:${f.name.length > 4 ? 0.7 : 1}" aria-label="${f.name}">${chars}</span></h1>`}
      <p class="hero-en">${f.en}</p>
      <div class="stars" aria-label="稀有度六星">${Array.from({ length: 6 }, (_, k) => `<i style="--k:${k}"><b>★</b></i>`).join('')}</div>
      <p class="hero-tag">${f.tagline}</p>
      <p class="hero-intro">${f.intro}</p>
      <ul class="hero-facts">
        <li><span>BIRTHDAY</span><b>10.18</b></li>
        <li><span>RACE</span><b>卡普里尼</b></li>
        <li><span>ORIGIN</span><b>莱塔尼亚</b></li>
        <li><span>HEIGHT</span><b>${height}</b></li>
      </ul>
      <div class="hero-actions">
        <button class="btn btn-primary btn-erupt" data-act="form" type="button" title="点击切换 · 长按积蓄喷发">${A.icon('swap')}切换至「${o.mood}」<span class="erupt-fill" aria-hidden="true"></span></button>
        ${can3d() ? `<div class="seg view-seg" role="group" aria-label="首屏展示方式">
          <button type="button" data-view="3d" class="${is3d() ? 'on' : ''}">3D 漫步</button>
          <button type="button" data-view="art" class="${is3d() ? '' : 'on'}">原画</button>
        </div>` : ''}
        <div class="seg elite-seg ${is3d() ? 'hide' : ''}" role="group" aria-label="精英阶段立绘">
          <button type="button" data-elite="e0" class="${state.elite === 'e0' ? 'on' : ''}">精英零</button>
          <button type="button" data-elite="e2" class="${state.elite === 'e2' ? 'on' : ''}">精英二</button>
        </div>
        <button class="btn btn-ghost" data-act="hello" type="button">${A.icon('play')}干员报到</button>
      </div>
      <div class="seg skin3d-seg ${is3d() ? '' : 'hide'}" role="group" aria-label="3D 时装">${skin3dButtons()}</div>
      <p class="hold-hint mono"><i></i>${is3d() ? 'TIP · 点地面让她走过去 · 点她一下 · 左右拖动转视角' : 'TIP · 长按「切换」积蓄喷发 · 戳戳她的头，或者在她头上轻轻划几下'}</p>
      <p class="hero-credit mono">${window.HERO ? HERO.creditHTML() : `ILLUST. ${D.meta.illustrator} · CV ${D.meta.cv.map(([l, n]) => `${l} ${n}`).join(' / ')}`}</p>`;
    hud();
    renderHeroActs();
  }

  /* ---------- 07 档案 · 08 资料 · 13 附录：实现在 js/archive.js（身份卡、体检雷达、属性、档案解密、分页附录） ---------- */
  let archReady = false;
  function ARCH() {
    if (!window.ARCHIVE) return null;
    if (!archReady) { ARCHIVE.init({ state, store, F, OTHER, head, reduce }); archReady = true; }
    return ARCHIVE;
  }
  function renderProfile() { const X = ARCH(); if (X) X.profile(); }
  function renderFiles() { const X = ARCH(); if (X) X.files(); }
  function refreshFiles(animate = true) { const X = ARCH(); if (X) X.refreshFiles(animate); }
  function renderAppendix() { const X = ARCH(); if (X) X.appendix(); }

  function rangeGrid(str) {
    const cells = str.split(' ').map((p) => p.split(',').map(Number));
    const all = cells.concat([[0, 0]]);
    const xs = all.map((c) => c[0]), ys = all.map((c) => c[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const set = new Set(cells.map((c) => c.join(',')));
    let html = '';
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (x === 0 && y === 0) html += '<i class="me" title="干员位置"></i>';
        else if (set.has(`${x},${y}`)) html += `<i class="on" style="--d:${Math.abs(x) + Math.abs(y)}"></i>`;
        else html += '<i></i>';
      }
    }
    return `<div class="rg" style="--cols:${maxX - minX + 1}" role="img" aria-label="攻击范围 ${cells.length} 格">${html}</div>`;
  }
  /* ---------------------------------------------------- 职业：术师 / 医疗 —— 战术地图演示 + 职业特性（模拟本体在 js/sim.js） */
  const CLASS_INFO = {
    base: {
      head: ['CLASS · CASTER', '职业 · 术师', '法术伤害无视防御——越是披着重甲的敌人，越怕她。'],
      role: [
        ['法术输出', '攻击造成法术伤害：无视防御，只受法术抗性减免；可以攻击空中单位。'],
        ['专克重甲', '防御 800 的重装防御者，物理攻击只能打出 5% 的保底伤害，在她面前却与普通士兵无异；法术抗性高的敌人才是她的难题。'],
        ['全队增幅', '第一天赋「炎息」：在场时全体友方术师攻击力 +14%（X 模组 3 级 +22%，满潜再 +2%），她自己也吃得到。'],
        ['清场', '第三技能「火山」：攻击范围变成以她为中心的大菱形，攻击间隔缩短到 0.5 秒，每次向范围内随机至多 6 名敌人投下熔岩。'],
      ],
      stats: ['DPS · 近 5 秒', '总伤害', '击破', '最多同时命中'],
      legend: [['#ff7fd8', '法术伤害'], ['#b9a9b0', '同攻击力的物理伤害（对照 · 划掉）'], ['#ff7a2a', '点燃爆炸 · 法抗 −25%'], ['#ffb35c', '熔岩'], ['#ffae3d', '精英敌人']],
      tip: '把鼠标移到敌人身上（手机上点一下），看它的防御、法抗，和她这一击打多少；「重甲」关里每个伤害数字下面都附了物理伤害作对照。熔岩从画框外砸下来，大数字会飞出战场。',
      note: '演示数值：精英2 · 90级 · 满信赖 · 技能专精三；模组按 3 级计，「满潜」计入潜能的攻击力与天赋加强。敌人为 PRTS 敌人图鉴 0 级数值（移动速度按比例放慢）。携带「火山」时，技力快满会来一大波敌人，好看清它同时砸向 6 个目标。',
      math: '法术伤害 = max(攻击力 × (1 − 法抗 ÷ 100), 攻击力 × 5%)；物理伤害 = max(攻击力 − 防御, 攻击力 × 5%)。攻击力 = (645 + 信赖 90 + 潜能 + 模组) × (1 + 炎息 + 技能加成)，加成之间直接相加；攻击间隔 = 基础间隔 ÷ (攻速 ÷ 100)。「循环平均」把回技力的时间也算了进去；点燃每 5 秒回一层，法抗 −25% 持续 6 秒，按目标始终处于削弱中计。',
    },
    alter: {
      head: ['CLASS · MEDIC', '职业 · 医疗', '治疗友方，并回复元素损伤——哪怕对方还没受伤。'],
      role: [
        ['行医', '治疗友方生命，同时回复相当于攻击力 50% 的元素损伤（灼燃、凋亡、神经……；X 模组 60%），对未受伤的友方同样有效。'],
        ['持续回复', '第一天赋「氤氲」：每次治疗附带持续回复——每秒 10%，6 秒，最多叠加 3 层（Y 模组 3 级 13% · 8 秒）。'],
        ['火山灰疗愈', '第二天赋：攻击范围内友方生命上限 +6%，受到的元素损伤 −12%（X 模组 3 级 +8% / −14%）。'],
        ['全场支援', '第三技能「火山回响」：攻击范围覆盖整个战场，每次治疗 5 连发，第二天赋效果提升至 5 倍。'],
      ],
      stats: ['HPS · 近 5 秒', '总治疗', '元素回复', '屏障吸收'],
      legend: [['#34c878', '治疗 · 氤氲层数'], ['#e6a12a', '元素回复'], ['#5b95e0', '屏障吸收'], ['#ff8a3d', '灼燃积累'], ['#a869e0', '法术伤害'], ['#5a6480', '物理伤害']],
      tip: '友军头顶两条：绿色是生命，橙色是灼燃损伤积累（积满 1000 爆发）；旁边的小竖条是「氤氲」的层数。把鼠标移到友军或敌人身上可以看详细数值。',
      note: '演示数值：精英2 · 90级 · 满信赖 · 技能专精三；模组按 3 级计。敌人为 PRTS 敌人图鉴 0 级数值（移动速度放慢；逐火战士的复活机制省略）；近卫、重装为演示用的约数，撤退后 10 秒再部署。灼燃损伤积满 1000 爆发：1200 点法术伤害，10 秒内法术抗性 −20。',
      math: '治疗量 = 攻击力；元素回复 = 攻击力 × 50%（X 模组 60%）。「氤氲」让每次普通治疗再附带 10% × 6 秒 = 60% 的持续回复（Y 模组 3 级 13% × 8 秒 = 104%），这里一并算进每秒数值。按范围内 2 名友方都需要治疗估算；云霭荫佑的屏障吸收单列。',
    },
  };
  let sim = null, mathTgt = 'heavy';
  const simCfg = () => Object.assign({ mod: 'none', pot: 0, scen: '', tips: true }, store.get('simcfg.' + state.form, {}));
  function renderCombat() {
    const f = F(), ci = CLASS_INFO[state.form], medic = state.form === 'alter';
    const other = OTHER();
    const SM = window.SIM || null;
    const cfg = simCfg();
    const scens = SM ? SM.SCEN[state.form] : [];
    if (!scens.some((s) => s.id === cfg.scen)) cfg.scen = scens[0] ? scens[0].id : '';
    const cnt = (form) => D.forms[form].range[2].split(' ').length;
    const vs = [
      ['职业分支', `${D.forms.base.profession} · ${D.forms.base.branch}`, `${D.forms.alter.profession} · ${D.forms.alter.branch}`],
      ['定位', D.forms.base.tags.join(' / '), D.forms.alter.tags.join(' / ')],
      ['攻击力（精2满级）', D.forms.base.stats.atk[3], D.forms.alter.stats.atk[3]],
      ['攻击间隔', '1.6s', '2.85s'],
      ['部署费用', D.forms.base.misc[1][1], D.forms.alter.misc[1][1]],
      ['攻击范围', cnt('base') + ' 格', cnt('alter') + ' 格'],
      ['招牌技能', '火山', '火山回响'],
    ];
    const seg = (key, list) => list.map(([v, label, title]) => `<button type="button" data-simcfg="${key}" data-v="${v}" class="${String(cfg[key]) === String(v) ? 'on' : ''}"${title ? ` title="${esc(title)}"` : ''}>${label}</button>`).join('');
    const dia = SM ? SM.DIAMOND3.filter(([a, b]) => a || b).map(([a, b]) => `${a},${b}`).join(' ') : '';
    $('#combat').innerHTML = head('02', ...ci.head) + `
      <div class="wrap">
        <div class="panel sim-wrap" data-reveal>
          <div class="sim-top">
            <div class="sim-skills" role="group" aria-label="携带技能">${f.skills.map((s, i) => `<button type="button" class="sim-sk" data-simsk="${i}"><span class="sim-ic">${A.skillEmblem(s.id)}<img src="${s.icon}" alt="" referrerpolicy="no-referrer" onerror="this.remove()"></span><span><small>SKILL 0${i + 1}</small>${s.name}</span></button>`).join('')}</div>
            <div class="sim-ctrl">
              <button type="button" class="btn btn-primary sim-cast" data-simact="cast">释放技能</button>
              <label class="sim-auto"><input type="checkbox" data-simact="auto" checked>自动释放</label>
              <div class="seg sim-speed" role="group" aria-label="速度"><button type="button" data-simspd="1" class="on">×1</button><button type="button" data-simspd="2">×2</button><button type="button" data-simspd="4">×4</button></div>
              <button type="button" class="btn btn-ghost sim-reset" data-simact="reset">重来</button>
            </div>
          </div>
          <div class="sim-cfg" role="group" aria-label="演示设置">
            <div class="cfg-g"><span>关卡</span><div class="seg">${seg('scen', scens.map((s) => [s.id, s.name, s.desc]))}</div></div>
            <div class="cfg-g"><span>模组 · 3级</span><div class="seg">${seg('mod', [['none', '未装备'], ...f.modules.map((m) => [m.kind.toLowerCase(), m.code, `「${m.name}」${m.effects.join('；')}`])])}</div></div>
            <div class="cfg-g"><span>潜能</span><div class="seg">${seg('pot', [[0, '1 潜'], [1, '满潜', f.potentials.join(' · ')]])}</div></div>
            <label class="cfg-tips"><input type="checkbox" data-simcfg="tips"${cfg.tips ? ' checked' : ''}><span>解说</span></label>
          </div>
          <div class="sim-scroll"><div class="sim-host"></div></div>
          <div class="sim-desc" aria-live="polite"></div>
          <p class="sim-cfgsay" aria-live="polite"></p>
          <div class="sim-under">
            <div class="sim-graph-box"><div class="sg-h"><b>${medic ? 'HPS · 治疗曲线' : 'DPS · 输出曲线'}</b><span>每 0.5 秒一格 · 亮色为技能生效时段${medic ? ' · 金色为元素回复' : ''} · 折线为近 5 秒平均</span></div><canvas class="sim-graph" aria-hidden="true"></canvas></div>
            <div class="sim-stats">${ci.stats.map((l, i) => `<div><span>${l}</span><b data-simstat="${i}">0</b></div>`).join('')}<div><span>攻击力 · 间隔</span><b data-simstat="atk">—</b></div><div><span>${medic ? '撤退 · 灼燃爆发' : '当前技能'}</span><b data-simstat="x">—</b></div></div>
          </div>
          <div class="sim-legend">${ci.legend.map(([c, l]) => `<span style="--c:${c}">${l}</span>`).join('')}<em>${ci.tip}</em></div>
          <p class="sim-note">${ci.note}</p>
        </div>
        <div class="cls-grid">
          <div class="panel cls-roles" data-reveal>
            <div class="panel-h">ROLE <span>${f.profession} · ${f.branch}</span></div>
            <div class="cls-badge">${A.classIcon(f.profession)}<div><b>${f.profession}</b><span>${f.trait}</span></div></div>
            <ul>${ci.role.map(([t, d]) => `<li><b>${t}</b>${d}</li>`).join('')}</ul>
          </div>
          <div class="panel cls-range" data-reveal style="--i:1">
            <div class="panel-h">RANGE <span>攻击范围</span></div>
            <div class="range-duo">
              <figure><div class="range-wrap">${rangeGrid(f.range[2])}</div><figcaption>精英2 · ${cnt(state.form)} 格</figcaption></figure>
              <figure class="sk"><div class="range-wrap">${medic ? '<div class="rg-all"><b>整个战场</b><small>ALL TILES</small></div>' : dia ? rangeGrid(dia) : ''}</div><figcaption>${medic ? '火山回响期间' : '火山 · 菱形 24 格'}</figcaption></figure>
            </div>
            <p class="note">${medic ? '行医的范围又宽又深：站在后排也能照顾到前线；「火山回响」期间扩展到整个战场。' : '中坚术师的标准范围；「火山」期间变成以她为中心、半径 3 格的菱形（范围 x-3）——连身后都照顾得到。'}</p>
          </div>
          <div class="panel cls-vs" data-reveal style="--i:2">
            <div class="panel-h">VERSUS <span>${D.forms.base.mood} vs ${D.forms.alter.mood}</span></div>
            <table><thead><tr><th></th><th class="${medic ? '' : 'me'}">${D.forms.base.mood}</th><th class="${medic ? 'me' : ''}">${D.forms.alter.mood}</th></tr></thead>
              <tbody>${vs.map(([k, a, b]) => `<tr><th>${k}</th><td class="${medic ? '' : 'me'}">${a}</td><td class="${medic ? 'me' : ''}">${b}</td></tr>`).join('')}</tbody></table>
            <p class="note">同一个人，两种截然不同的战斗方式：${f.mood === '术师' ? `切换到「${other.mood}」看看她怎么守护队友。` : `切换到「${other.mood}」看看她怎么烧穿重甲。`}</p>
          </div>
        </div>
        <div class="panel cls-math" data-reveal>
          <div class="panel-h">SKILL MATH <span>三个技能的账 · 专精三 · 按上面选的模组与潜能</span></div>
          ${medic ? '' : `<div class="math-tgt"><span>打谁</span><div class="seg">${[['slug', '源石虫 · 防 0 抗 0'], ['heavy', '重装防御者 · 防 800'], ['casterL', '术师组长 · 抗 50']].map(([k, l]) => `<button type="button" data-mathtgt="${k}" class="${k === mathTgt ? 'on' : ''}">${l}</button>`).join('')}</div></div>`}
          <div class="math-rows"></div>
          <p class="note">${ci.math}</p>
        </div>
      </div>`;
    if (sim) { sim.destroy(); sim = null; }
    if (!SM) return;
    sim = SM.create($('.sim-host'), {
      form: state.form,
      data: f,
      config: cfg,
      graph: $('.sim-graph'),
      chars: { base: D.forms.base.char, alter: D.forms.alter.char },
      onCast: () => { if (window.AUDIO && AUDIO.sfx) AUDIO.sfx(medic ? 'sparkle' : 'whoosh'); },
      sfx: (k) => { if (window.AUDIO && AUDIO.sfx) AUDIO.sfx(k); },
      onStats: simStats,
    });
    simMarkSkill();
  }
  function simMarkSkill() {
    if (!sim) return;
    $$('[data-simsk]').forEach((b) => b.classList.toggle('on', +b.dataset.simsk === sim.skillIdx));
    // 当前技能的完整说明（专精三数值）+ 按当前模组 / 潜能算出来的实际数字
    const el = $('.sim-desc'), s = F().skills[sim.skillIdx], L = 9;
    if (!el || !s) return;
    const cfg = sim.config, medic = state.form === 'alter';
    const v = Object.fromEntries(Object.entries(s.v).map(([k, a]) => [k, a[L]]));
    const dur = s.dur == null ? '' : `<i>持续 ${s.dur === '∞' ? '无限' : s.dur + ' 秒'}</i>`;
    const m = SIM.math(F(), state.form, cfg, 'heavy'), row = m.rows[sim.skillIdx], fm = (x) => Math.round(x).toLocaleString();
    const now = !row ? '' : medic
      ? `当前配置：攻击力 <b>${fm(row.atk)}</b> · 每次治疗 <b>${fm(row.per)}</b> + 元素回复 <b>${fm(row.el)}</b> · 攻击间隔 ${row.iv.toFixed(2)}s`
      : `当前配置：攻击力 <b>${fm(row.atk)}</b> · 攻击间隔 <b>${row.iv.toFixed(2)}s</b> · 对重装防御者（防御 800）每发 <b>${fm(row.per)}</b>，同攻击力的物理伤害只有 <s>${fm(row.phys)}</s>`;
    el.innerHTML = `<span class="sd-tags"><i>${s.name} · 专精三</i><i>${s.sp}</i><i>${s.trig}</i><i>初始技力 ${s.init[L]} · 消耗 ${s.cost[L]}</i>${dur}</span><p>${s.text(v)}</p>${now ? `<p class="sd-now">${now}</p>` : ''}${s.note ? `<small>${s.note}</small>` : ''}`;
    // 关卡 / 模组 / 潜能的一句话说明
    const say = $('.sim-cfgsay');
    if (say) {
      const sc = SIM.SCEN[state.form].find((x) => x.id === cfg.scen) || SIM.SCEN[state.form][0];
      const mod = cfg.mod !== 'none' ? F().modules.find((x) => x.kind.toLowerCase() === cfg.mod) : null;
      say.innerHTML = `<b>${sc.name}</b>${sc.desc}${mod ? `<span><b>${mod.code}</b>「${mod.name}」${mod.effects.join('；')} · 攻击力 +${mod.stages[2].atk}</span>` : ''}${cfg.pot ? `<span><b>满潜</b>${F().potentials.join(' · ')}</span>` : ''}`;
    }
    renderMath();
  }
  /** 「技能数学」面板：三个技能在当前配置下的理论数值（数据来自 SIM.math） */
  function renderMath() {
    const box = $('.math-rows');
    if (!box || !sim || !window.SIM) return;
    const r = SIM.math(F(), state.form, sim.config, mathTgt), cur = sim.skills[sim.skillIdx].id;
    const fm = (x) => Math.round(x).toLocaleString();
    if (!r.medic) {
      const rows = [{ id: 'normal', name: '普通攻击', note: '不开技能 · 炎息已计入', atk: r.normal.atk, per: r.normal.per, phys: r.normal.phys, iv: r.normal.iv, n: 1, dps: r.normal.dps, total: r.normal.dps, cycle: r.normal.dps }, ...r.rows];
      const mx = Math.max(...rows.map((x) => x.total));
      box.innerHTML = rows.map((x) => `<div class="mr${x.id === cur ? ' on' : ''}${x.id === 'normal' ? ' base' : ''}">
        <div class="mr-n"><b>${x.name}</b><small>${x.note}</small></div>
        <div class="mr-bar"><i style="--w:${(x.total / mx).toFixed(4)}"></i>${x.total > x.dps * 1.01 ? `<i class="solo" style="--w:${(x.dps / mx).toFixed(4)}"></i>` : ''}<span>${fm(x.total)}<small> /秒${x.n > 1 ? ` · ${x.n} 名合计（单体 ${fm(x.dps)}）` : x.splash ? ` · 含 2 名邻近敌人的溅射（单体 ${fm(x.dps)}）` : ''}</small></span></div>
        <div class="mr-kv"><span>攻击力 <b>${fm(x.atk)}</b></span><span>每发 <b>${fm(x.per)}</b></span><span>物理同攻 <s>${fm(x.phys)}</s></span><span>间隔 <b>${x.iv.toFixed(2)}s</b></span><span>循环平均 <b>${fm(x.cycle)}</b>/秒</span></div>
      </div>`).join('');
    } else {
      const rows = [{ id: 'normal', name: '普通治疗', note: '不开技能 · 氤氲已计入', ...r.normal }, ...r.rows];
      const mx = Math.max(...rows.map((x) => x.hps + x.eps));
      box.innerHTML = rows.map((x) => `<div class="mr${x.id === cur ? ' on' : ''}${x.id === 'normal' ? ' base' : ''}">
        <div class="mr-n"><b>${x.name}</b><small>${x.note}</small></div>
        <div class="mr-bar med"><i style="--w:${(x.hps / mx).toFixed(4)}"></i><i class="el" style="--x:${(x.hps / mx).toFixed(4)};--w:${(x.eps / mx).toFixed(4)}"></i><span>${fm(x.hps)}<small> 治疗/秒</small> + ${fm(x.eps)}<small> 元素/秒</small></span></div>
        <div class="mr-kv"><span>攻击力 <b>${fm(x.atk)}</b></span><span>每次 <b>+${fm(x.per)}</b></span><span>元素 <b>−${fm(x.el)}</b></span><span>目标 <b>${x.n}</b></span><span>间隔 <b>${x.iv.toFixed(2)}s</b></span>${x.absorb ? `<span>屏障 <b>${fm(x.absorb)}</b></span>` : ''}</div>
      </div>`).join('');
    }
  }
  const fmtN = (v) => (v >= 10000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v).toLocaleString());
  function simStats(s) {
    const set = (k, v) => { const el = $(`[data-simstat="${k}"]`); if (el && el.textContent !== String(v)) el.textContent = v; };
    const st = s.stat;
    set(0, fmtN(s.perSec));
    if (s.medic) { set(1, fmtN(st.heal)); set(2, fmtN(st.elem)); set(3, fmtN(st.absorb)); set('x', `${st.downs} · ${st.bursts}`); }
    else { set(1, fmtN(st.dmg)); set(2, st.kills); set(3, st.best ? st.best + ' 名' : '—'); set('x', s.skill.name + (s.active ? ' · 生效中' : '')); }
    set('atk', `${s.atk} · ${s.iv.toFixed(2)}s`);
    const btn = $('.sim-cast');
    if (btn) {
      const txt = s.active ? (s.left === Infinity ? '持续中' : `生效中 ${Math.ceil(s.left)}s`) : s.skill.id === 'ignite' ? `充能 ${s.charges}` : s.ready ? '释放技能' : `技力 ${Math.floor(s.sp)} / ${s.cost}`;
      if (btn.textContent !== txt) btn.textContent = txt;
      btn.disabled = !s.ready;
    }
    const wrap = $('.sim-wrap');
    if (wrap) wrap.classList.toggle('erupting', !s.medic && s.active && s.skill.id === 'volcano');
  }

  /* ---------------------------------------------------- 小剧场（Spine 骨骼小人） */
  let chibi = null, chibiIO = null;
  const theater = { skin: '默认', group: 'build', auto: true };
  const BUBBLES = { base: ['呀！', '前辈？', '咩？', '嗯？'], alter: ['嗯？', '前辈~', '咩~', '♪'] };
  function renderTheater() {
    const f = F();
    const skins = ['默认', ...f.outfits.filter((o) => o.key.startsWith('s')).map((o) => o.name)];
    if (!skins.includes(theater.skin)) theater.skin = '默认';
    // 小人还没载入、或载入的不是这一套（换了形态）：幕布先合着，模型到了再拉开
    const Lc = chibi && chibi.loaded;
    const thClosed = !!window.THEATER && (!chibi || !chibi.ready || Lc.form !== state.form || Lc.skin !== theater.skin || Lc.group !== theater.group);
    $('#theater').innerHTML = head('01', 'LITTLE THEATER', '小剧场', '游戏里的 Spine 骨骼小人，每套时装都有自己的布景。点动作按钮、点她一下，或者点点布景里的小物件；开着「自由活动」，她会自己走来走去、摆弄身边的东西。') + `
      <div class="wrap"><div class="th" data-reveal>
        <div class="th-stage${thClosed ? ' closed' : ''}">
          ${window.THEATER ? '' : '<div class="th-bg" aria-hidden="true"></div><div class="th-floor" aria-hidden="true"></div>'}
          <div class="th-hud mono" aria-hidden="true"><span class="th-live"><i></i>LIVE</span><span class="th-place"></span><span class="th-now">—</span></div>
          <div class="th-bubble" aria-live="polite"></div>
          <div class="th-msg th-loading">正在载入骨骼动画…</div>
        </div>
        <div class="th-panel panel">
          <div class="th-row"><span class="mono">OUTFIT · 时装</span><div class="seg th-skins">${skins.map((s) => `<button type="button" data-thskin="${s}" class="${s === theater.skin ? 'on' : ''}">${s}</button>`).join('')}</div></div>
          <div class="th-row"><span class="mono">SCENE · 场景</span><div class="seg th-groups"><button type="button" data-thgroup="build" class="${theater.group === 'build' ? 'on' : ''}">基建日常</button><button type="button" data-thgroup="front" class="${theater.group === 'front' ? 'on' : ''}">作战</button></div></div>
          <div class="th-row"><span class="mono">ACTION · 动作</span><div class="th-acts"></div></div>
          <button class="btn ${theater.auto ? 'btn-primary' : 'btn-ghost'} th-auto" type="button" data-act="th-auto" aria-pressed="${theater.auto}">自由活动 · ${theater.auto ? '开' : '关'}</button>
          <div class="th-row th-pets"><span class="mono">DESK PETS · 桌宠（可多选，会沿屏幕四周溜达）</span><div class="th-petlist">${petVariants().map((v) => { const av = window.THEATER && THEATER.avatar ? THEATER.avatar(v.form, v.skin) : ''; return `<button type="button" class="th-pet${pets.has(v.id) ? ' on' : ''}${av ? ' has-av' : ''}" data-pet="${v.id}" aria-pressed="${pets.has(v.id)}">${av ? `<img src="${av}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<span>${v.label}</span></button>`; }).join('')}</div></div>
          <button class="btn btn-ghost th-auto" type="button" data-act="pet-toggle">${pets.size ? '都回来吧' : '全员出动'}</button>
          <p class="note">模型与动画来自游戏资源（经 PRTS 资源站在线加载），由 spine-ts 3.8 实时渲染。</p>
        </div>
      </div></div>`;
    theaterBg();
    if (thClosed) thCurtain(true, chibi ? '换幕中' : '开幕准备中');
    if (!window.CHIBI) return;
    // 已有小人：画布挪到新舞台（不重建 WebGL 上下文、不重编译着色器）；形态变了就在切换动画结束后的空闲时间换模型
    if (chibi) {
      chibi.attach($('.th-stage'));
      if (thCtl) thCtl.bind();
      if (chibi.ready) $('.th-acts').innerHTML = chibi.actions().map((a) => `<button type="button" class="th-act" data-thact="${a.id}">${a.label}</button>`).join('');
      const L = chibi.loaded;
      if (L.form !== state.form || L.skin !== theater.skin || L.group !== theater.group) {
        const me = chibi;
        setTimeout(() => idle(() => { if (me === chibi) loadTheaterChibi(); }), 1500);
      }
      return;
    }
    chibi = CHIBI.create($('.th-stage'), { chars: { base: D.forms.base.char, alter: D.forms.alter.char }, pma: true, theater: !!window.THEATER, fill: window.THEATER ? 0.6 : undefined });
    chibi.setAuto(theater.auto);
    if (thCtl) thCtl.bind();
    chibi.onReady = (acts) => {
      $('.th-acts').innerHTML = acts.map((a) => `<button type="button" class="th-act" data-thact="${a.id}">${a.label}</button>`).join('');
    };
    chibi.onAction = (a) => {
      const now = $('.th-now');
      if (now) now.textContent = `${theater.skin} · ${a.label}`;
      $$('.th-act').forEach((b) => b.classList.toggle('on', b.dataset.thact === a.id));
      if (thCtl) thCtl.action(a);
    };
    chibi.onSkill = (id) => {
      const st = $('.th-stage');
      if (st) setTimeout(() => FX.cast(id, st.getBoundingClientRect()), 350);
      if (thCtl) thCtl.skill(id);
    };
    chibi.onPoke = (x, y) => chibiPoked($('.th-stage'), $('.th-bubble'), x, y);
    // 接近视野时加载（资源约 0.3–1 MB）；剧场紧挨首屏，因此 2.5 秒后也会自动预载
    const me = chibi;
    let started = false;
    const go = () => {
      if (started || me !== chibi) return;
      started = true;
      if (chibiIO) chibiIO.disconnect();
      loadTheaterChibi();
    };
    if (chibiIO) chibiIO.disconnect();
    chibiIO = new IntersectionObserver(([en]) => { if (en.isIntersecting) go(); }, { rootMargin: '600px 0px' });
    chibiIO.observe($('.th-stage'));
    setTimeout(go, 2500);
  }
  /** 戳了一下小人：气泡、火星 / 白灰、一句语音。form：被戳的是哪个形态（桌宠可能和页面当前形态不同） */
  function chibiPoked(host, b, x, y, form = state.form) {
    const r = host ? host.getBoundingClientRect() : { left: 0, top: 0 }; // 没有 host：气泡本身是 fixed 定位
    const list = BUBBLES[form];
    b.textContent = list[(Math.random() * list.length) | 0];
    b.style.left = x - r.left + 'px';
    b.style.top = y - r.top - 30 + 'px';
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
    if (form === 'base') FX.emberBurst(x, y, 10, [40, 140]);
    else FX.ashBurst(x, y, 10, [40, 140]);
    const lines = POKE_LINES[form];
    playVoice(lines[pokeIdx++ % lines.length], form);
  }

  /* ---------------------------------------------------- 桌宠：可以同时放出好几只（两个形态、各款时装），各自沿屏幕四边溜达（行为见 pet.js） */
  const pets = new Map(); // id → { id, form, skin, label, chibi, ctl, host, bubble, fails }
  const GRAB_LINES = { base: ['呀！', '要、要掉下去了！', '咩？！'], alter: ['哇！', '前辈，放我下来~', '咩？！'] };
  // 碰面时说的话：同一形态之间、两种形态之间各一套（两种形态是不同时期的同一个人）
  const MEET_LINES = {
    base: ['嗨~', '咩~', '一起去书房吗？', '你也在呀', '这本借你看！'],
    alter: ['嗨~', '要一起去野餐吗？', '♪', '今天的风很舒服', '一步，又一步~'],
    mix: [['欸，是……我？', '你好呀，从前的我~'], ['好像在照镜子……', '嗯，是同一个人哦。'], ['咩？！', '咩~'], ['以后的我……好厉害。', '你也会走到这里的。']],
  };
  const CHEER_LINES = { yes: ['♪', '到我了！', '咩~', '嘿嘿'], no: ['欸？', '换人了？', '……咦？', '咩？'] };
  // 挥手用哪条胳膊：「远行前的野餐」的右臂藏在头发和小羊后面，换左臂（逐款截图比对过）
  const PET_ARM = { 'alter:远行前的野餐': 'L' };
  const petId = (form, skin) => `${form}:${skin}`;
  /** 能放出来的小人：两个形态各自的默认服装与时装（与剧场的时装列表一致） */
  function petVariants() {
    return ['base', 'alter'].flatMap((form) => ['默认', ...D.forms[form].outfits.filter((o) => o.key.startsWith('s')).map((o) => o.name)]
      .map((skin) => ({ id: petId(form, skin), form, skin, label: skin === '默认' ? D.forms[form].mood : skin })));
  }
  /** 第 i 只（共 n 只）从屏幕上方哪里掉下来：尽量散开 */
  const spreadX = (i, n) => (n <= 1 ? 0.72 : 0.12 + (0.76 * i) / (n - 1));
  function addPet(v, spawnX = 0.72) {
    if (pets.has(v.id) || !window.CHIBI || !window.PET) return null;
    // 每只一个气泡，放在旋转的舞台外面（贴墙、倒挂时字也是正的）
    const bubble = document.createElement('div');
    bubble.className = 'th-bubble pet-bubble';
    bubble.setAttribute('aria-live', 'polite');
    document.body.appendChild(bubble);
    const host = document.createElement('div');
    host.className = 'pet-stage';
    host.innerHTML = `<button type="button" class="pet-close" data-act="pet-close" data-pet-id="${v.id}" aria-label="让${v.label}回去">${A.icon('close')}</button>`;
    document.body.appendChild(host);
    // 所有桌宠共用一个离屏 WebGL 上下文（见 chibi.js shared）
    const chibi = CHIBI.create(host, { chars: { base: D.forms.base.char, alter: D.forms.alter.char }, pma: true, pet: true, shared: true });
    const ctl = PET.create(chibi, host, {
      reduce,
      spawnX,
      armSide: PET_ARM[v.id] || 'R',
      platforms: petPlatforms,
      say: (text, x, y) => petSay(text, x, y + 30, bubble),
      // 困了的时候：旁边有睡着的同伴就走过去挨着睡
      sleeper: (x) => { let best = null; pets.forEach((q) => { if (q.id !== v.id && q.ctl.sleeping && q.ctl.onFloor && (best == null || Math.abs(q.ctl.x - x) < Math.abs(best - x))) best = q.ctl.x; }); return best; },
      onPoke: (x, y) => chibiPoked(null, bubble, x, y, v.form),
      onGrab: (x, y) => { const l = GRAB_LINES[v.form]; petSay(l[(Math.random() * l.length) | 0], x, y, bubble); },
      onLand: (x, y, k) => {
        const n = Math.round(3 + 9 * k);
        if (v.form === 'base') FX.emberBurst(x, y, n, [30, 110 + 120 * k], { g: -30 });
        else FX.ashBurst(x, y, n, [30, 110 + 120 * k]);
      },
    });
    const p = { ...v, chibi, ctl, host, bubble, fails: 0 };
    pets.set(v.id, p);
    loadPetModel(p);
    if (DEBUG) { window.__pets = pets; window.__pet = ctl; }
    return p;
  }
  /** 载入模型；没加载出来时她本来就是隐藏的（.pet-stage.failed），隔一会儿悄悄重试 */
  function loadPetModel(p) {
    p.chibi.load(p.form, p.skin, 'build').then((ok) => {
      if (ok) { p.fails = 0; return; }
      if (pets.get(p.id) !== p || !p.host.classList.contains('failed') || p.fails >= 4) return;
      setTimeout(() => { if (pets.get(p.id) === p && !p.chibi.ready) loadPetModel(p); }, [6, 15, 40, 90][p.fails++] * 1000);
    });
  }
  function removePet(id) {
    const p = pets.get(id);
    if (!p) return;
    pets.delete(id);
    p.ctl.destroy();
    p.chibi.destroy();
    p.host.remove();
    p.bubble.remove();
  }
  function savePets() {
    store.set('pets', [...pets.keys()]);
    $$('[data-pet]').forEach((b) => { const on = pets.has(b.dataset.pet); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    const all = $('[data-act="pet-toggle"]');
    if (all) all.textContent = pets.size ? '都回来吧' : '全员出动';
  }
  function togglePetId(id) {
    if (pets.has(id)) removePet(id);
    else {
      const v = petVariants().find((x) => x.id === id);
      if (v) {
        const first = !pets.size;
        addPet(v, 0.2 + Math.random() * 0.6);
        if (first) toast(matchMedia('(hover: hover)').matches ? '她跟出来了——会沿着屏幕四周溜达，可以拎起来甩一甩。悬停在她身上可以让她回去。' : '她跟出来了——会沿着屏幕四周溜达，可以拎起来甩一甩。');
      }
    }
    savePets();
  }
  /** 全员出动 / 都回来吧 */
  function togglePets() {
    if (pets.size) { [...pets.keys()].forEach(removePet); savePets(); return; }
    const all = petVariants();
    all.forEach((v, i) => setTimeout(() => { addPet(v, spreadX(i, all.length)); savePets(); }, i * 350));
    toast('全员出动！她们会沿着屏幕四周各自溜达，碰面了还会打招呼。');
  }
  /**
   * 两只在地上碰面：转向对方打个招呼（同一形态 / 两种形态各有各的话），
   * 之后有时并排坐一会儿，有时一只跟着另一只走一段
   */
  const pickOf = (a) => a[(Math.random() * a.length) | 0];
  function petMeet() {
    if (pets.size < 2 || document.hidden) return;
    const list = [...pets.values()].filter((p) => p.chibi.ready && p.ctl.canMeet);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j], dx = b.ctl.x - a.ctl.x;
        if (Math.abs(dx) > 90 || !a.ctl.canMeet || !b.ctl.canMeet) continue;
        const roll = Math.random(), sit = roll < 0.3;
        a.ctl.meet(dx >= 0 ? 1 : -1, 'wave', sit);
        b.ctl.meet(dx >= 0 ? -1 : 1, Math.random() < 0.5 ? 'wave' : 'interact', sit);
        if (a.form !== b.form) {
          const [la, lb] = pickOf(MEET_LINES.mix), base = a.form === 'base' ? a : b, alt = base === a ? b : a;
          petSay(la, base.ctl.x, base.ctl.head, base.bubble);
          setTimeout(() => petSay(lb, alt.ctl.x, alt.ctl.head, alt.bubble), 1100);
        } else {
          petSay(pickOf(MEET_LINES[a.form]), a.ctl.x, a.ctl.head, a.bubble);
          setTimeout(() => petSay(pickOf(MEET_LINES[b.form]), b.ctl.x, b.ctl.head, b.bubble), 1000);
        }
        // 结伴走一段：打完招呼，b 跟着 a
        if (!sit && roll < 0.55) setTimeout(() => { if (pets.get(b.id) === b && pets.get(a.id) === a) b.ctl.follow(() => (pets.get(a.id) === a ? a.ctl.x : null), 9 + Math.random() * 6); }, 2600);
      }
    }
  }
  setInterval(petMeet, 300);
  // 页面切换形态（<html data-form> 变了）：同形态的开心地跳一下，另一个形态的吓一跳
  let petForm = document.documentElement.dataset.form;
  new MutationObserver(() => {
    const f = document.documentElement.dataset.form;
    if (f === petForm) return;
    petForm = f;
    let i = 0;
    pets.forEach((p) => {
      if (!p.chibi.ready) return;
      const match = p.form === f;
      setTimeout(() => { if (pets.get(p.id) !== p) return; p.ctl.cheer(match); petSay(pickOf(CHEER_LINES[match ? 'yes' : 'no']), p.ctl.x, p.ctl.head, p.bubble); }, 900 + i++ * 160);
    });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-form'] });
  /**
   * 她能站上去的平台：语音字幕条（不然会被它挡住）+ 各区块标题右边那条细线（小台阶，她会跳上去坐着）。
   * 标题线的页面坐标每 1.2 秒量一次；之间按滚动位置换算成视口坐标（不必每次都量）
   */
  let ledgeCache = [], ledgeT = -1e9;
  function petPlatforms() {
    const out = [];
    const s = $('#subtitle');
    if (s && s.classList.contains('on')) {
      const w = s.offsetWidth, left = s.offsetLeft - w / 2; // 布局位置（不含滑入动画的位移）
      out.push({ id: 'subtitle', x0: left, x1: left + w, y: s.offsetTop });
    }
    const now = performance.now();
    if (now - ledgeT > 1200) {
      ledgeT = now;
      ledgeCache = $$('.sec-head .sec-line').map((el) => {
        const r = el.getBoundingClientRect(), sec = el.closest('section');
        return r.width > 150 ? { id: 'ledge:' + (sec ? sec.id : ''), x0: r.left + 6, x1: r.right - 6, doc: r.top + scrollY } : null;
      }).filter(Boolean);
    }
    for (const q of ledgeCache) out.push({ id: q.id, x0: q.x0, x1: q.x1, doc: q.doc, y: q.doc - scrollY, ledge: true });
    return out;
  }
  function petSay(text, x, y, b) {
    if (!b) return;
    b.textContent = text;
    // 贴着屏幕边（挂在墙上、倒挂在顶上）时，气泡往里挪，别被切掉
    const half = Math.min(140, 14 + text.length * 8);
    b.style.left = clamp(x, half, innerWidth - half) + 'px';
    b.style.top = clamp(y - 30, 96, innerHeight - 20) + 'px';
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
  }

  /** 载入剧场小人；没加载出来不显示失败提示，隔一会儿悄悄重试 */
  let thRetryT = 0, thFails = 0;
  function loadTheaterChibi() {
    if (!chibi) return;
    clearTimeout(thRetryT);
    const me = chibi;
    chibi.load(state.form, theater.skin, theater.group).then((ok) => {
      if (me === chibi && (ok || $('.th-stage.failed'))) thCurtain(false); // 到了（或确实失败了）就拉开幕布
      if (ok) { thFails = 0; return; }
      const st = $('.th-stage');
      if (me !== chibi || !st || !st.classList.contains('failed') || thFails >= 4) return; // 被新的载入顶替时不算失败
      thRetryT = setTimeout(() => { if (me === chibi && !chibi.ready) loadTheaterChibi(); }, [6, 15, 40, 90][thFails++] * 1000);
    });
  }
  /** 剧场布景：每套时装一个场景，基建 / 作战各一版（js/theater.js）；没有 THEATER 时退回旧的单张布景 */
  let thCtl = null;
  function theaterBg() {
    const st = $('.th-stage');
    if (!st) return;
    st.classList.toggle('g-front', theater.group === 'front');
    st.classList.toggle('g-build', theater.group !== 'front');
    if (window.THEATER) {
      try { thCtl = THEATER.mount(st, { form: state.form, skin: theater.skin, group: theater.group, chibi: () => chibi }); } catch (e) { console.warn('[THEATER]', e); }
      return;
    }
    const bg = $('.th-bg');
    if (!bg) return;
    let svg = '';
    try { svg = window.SCENES && SCENES.stage ? SCENES.stage(state.form, theater.group) : ''; } catch (e) {}
    bg.innerHTML = svg ? `<div class="th-set">${svg}</div>` : '';
  }
  /** 幕布：合上时最多等 9 秒（资源站太慢就先拉开，小人到了再淡入） */
  let thOpenT = 0;
  function thCurtain(closed, note) {
    const st = $('.th-stage');
    if (!st || !window.THEATER) return;
    THEATER.curtain(st, closed, note);
    clearTimeout(thOpenT);
    if (closed) thOpenT = setTimeout(() => thCurtain(false), 6500);
  }
  // 鼠标移到时装 / 场景按钮上：先把那个模型取到本地缓存，点下去时换得快
  document.addEventListener('pointerover', (e) => {
    const b = e.target.closest && e.target.closest('[data-thskin], [data-thgroup]');
    if (!b || !window.CHIBI || !CHIBI.prefetch) return;
    CHIBI.prefetch(F().char, b.dataset.thskin || theater.skin, b.dataset.thgroup || theater.group);
  }, { passive: true });
  let thSwapT = 0;
  function theaterReload() {
    thFails = 0;
    $$('[data-thskin]').forEach((b) => b.classList.toggle('on', b.dataset.thskin === theater.skin));
    $$('[data-thgroup]').forEach((b) => b.classList.toggle('on', b.dataset.thgroup === theater.group));
    $('.th-acts').innerHTML = '';
    if (!window.THEATER || reduce) { theaterBg(); loadTheaterChibi(); return; }
    // 合上幕布 → 幕后换布景、换模型 → 模型到了再拉开
    thCurtain(true, '换幕中');
    clearTimeout(thSwapT);
    thSwapT = setTimeout(() => { theaterBg(); loadTheaterChibi(); }, 750);
  }

  /* ---------------------------------------------------- 故事 */
  function chapterArt(c) {
    const S = window.SCENES || {};
    const sc = (k, ...a) => { try { return typeof S[k] === 'function' ? S[k](...a) : ''; } catch (e) { return ''; } };
    const fb = (html) => `<div class="ch-fallback">${html}</div>`;
    switch (c.art) {
      case 'trophy': return sc('trophy') || fb(A.sheep('black'));
      case 'eruption': return A.eruption();
      case 'letter': return sc('letter') || fb(A.icon('book'));
      case 'sound': return A.sound();
      case 'cake': return sc('lavaCake') || fb(A.icon('cake'));
      case 'parade': return sc('sheepParade', 'alter') || fb(A.sheep('pink'));
      case 'portrait': return `<div class="ch-portrait"><div class="ch-pimg"><img src="${D.forms.alter.art.e0}" alt="穿着母亲外套的纯烬艾雅法拉" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'"></div></div>`;
      case 'cassette': return sc('cassette') || fb(A.icon('music'));
      case 'flower': return sc('flowerPot') || fb(A.mini('火山预警花'));
      case 'summit': return A.summit();
      case 'study': return sc('study') || fb(A.icon('book'));
      case 'field': return sc('fieldwork') || fb(A.icon('mountain'));
      case 'camp': return sc('nightCamp') || fb(A.icon('mountain'));
      case 'pumice': return sc('pumice') || fb(A.icon('mountain'));
      case 'letters': return sc('twoLetters') || fb(A.icon('book'));
      case 'night': return sc('nightPlanting') || fb(A.mini('火山预警花'));
      default: return '';
    }
  }
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  /** 人物卡的插画：有立绘用立绘，没有就画一张 */
  function personArt(p) {
    if (p.img) return `<img${p.half ? ' class="half"' : ''} src="${p.img}" alt="${p.name}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">`;
    if (p.art === 'sheep') return `<div class="pp-one">${A.sheep('black')}</div>`;
    if (p.art === 'volcano') {
      let s = '';
      try { s = typeof window.SCENES?.farewell === 'function' ? SCENES.farewell() : ''; } catch (e) {}
      return `<div class="pp-scene">${s || A.icon('mountain')}</div>`;
    }
    return `<div class="pp-pair">${A.sheep('black')}${A.sheep('black')}</div>`;
  }
  function renderStory() {
    // 故事区由 js/story.js 接管（分层插画、章节互动、整屏滚动叙事、章节导航）；它没加载时退回下面的简单版本
    if (window.STORY && window.STORY_ART) {
      let ok = false;
      try { ok = STORY.render({ form: state.form, head, A, personArt }); } catch (e) { console.error('[story]', e); }
      if (ok) { storyLive(); return; }
    }
    const S = window.SCENES || {};
    const pano = (form) => { try { return typeof S.panorama === 'function' ? S.panorama(form) : ''; } catch (e) { return ''; } };
    // 术师篇只讲 PART I，医疗篇只讲 PART II；另一半放在末尾，点一下就切换过去接着读
    const part = D.parts.find((p) => p.form === state.form) || D.parts[0];
    const other = D.parts.find((p) => p !== part);
    const chapters = D.story.filter((c) => c.part === part.part);
    const partHTML = (p) => `
      <div class="part-banner pb-${p.form} current" data-reveal>
        <div class="pb-bg">${pano(p.form)}</div>
        <div class="pb-text"><span class="pb-no">${p.no}</span><h3>${p.title}</h3><p class="pb-en">${p.en}</p><p class="pb-lead">${p.lead}</p></div>
      </div>`;
    const chapterHTML = (c, i) => `
      <article class="chapter" data-reveal>
        <div class="ch-art-wrap"><span class="ch-num" aria-hidden="true">${ROMAN[i]}</span><div class="ch-art art-${c.art}">${chapterArt(c)}</div></div>
        <div class="ch-body">
          <p class="ch-place mono">CHAPTER ${String(i + 1).padStart(2, '0')} · ${c.place}</p>
          <h3 class="ch-title">${c.title}</h3>
          <p class="ch-en">${c.en}</p>
          ${c.text.map((t, k) => `<p class="ch-p" style="--k:${k}">${t}</p>`).join('')}
        </div>
      </article>`;
    const oc = other && D.story.filter((c) => c.part === other.part);
    const nextHTML = other ? `
      <div class="part-next pb-${other.form}" data-reveal>
        <div class="pn-bg" aria-hidden="true">${pano(other.form)}</div>
        <div class="pn-text">
          <span class="pb-no">${other.no} · ${state.form === 'base' ? 'TO BE CONTINUED' : 'BEFORE ALL THIS'}</span>
          <h3>${other.title}<small>${other.en}</small></h3>
          <p>${state.form === 'base' ? '她的故事还没有结束。' : '在这一切之前，'}${other.lead}</p>
          <ol class="pn-list">${oc.map((c, i) => `<li><i>${ROMAN[i]}</i>${c.title}</li>`).join('')}</ol>
          <button class="btn btn-primary pn-go" type="button" data-act="form" data-then="story">${A.icon('swap')}切换至「${D.forms[other.form].mood}」，读${other.no}</button>
        </div>
      </div>` : '';
    const words = state.form === 'base'
      ? ['EYJAFJALLA', '艾雅法拉', 'VOLCANOLOGIST', '火山学家', 'CATASTROPHE MESSENGER', '天灾信使', 'LITTLE SHEEP', '小黑羊']
      : ['HVÍT ASKA', '纯烬', 'WHITE ASH', '白色的灰烬', 'STEP BY STEP', '一步，又一步', 'DOLLY', '棉花糖3号'];
    const row = (arr) => [...arr, ...arr].map((w) => `<span>${w}</span><i>✦</i>`).join('');
    const marquee = `<div class="marquee" aria-hidden="true"><div class="mq-row">${row(words)}</div><div class="mq-row rev">${row([...words].reverse())}</div></div>`;
    const cn = '零一二三四五六七八九十'[chapters.length] || chapters.length;
    $('#story').innerHTML = marquee + head('03', 'HER STORY', '故事', part.sub || `${cn}个片段。`) + `
      <div class="wrap">
        ${partHTML(part)}
        ${chapters.map(chapterHTML).join('')}
        ${nextHTML}
        <h3 class="sub-h" data-reveal>她身边的人 <small>PEOPLE</small></h3>
        <div class="people">${D.people.filter((p) => !p.form || p.form === state.form).map((p, i) => `
          <div class="panel person" data-reveal style="--i:${i}">
            <div class="pp-img">${personArt(p)}</div>
            <div class="pp-body"><span class="mono">${p.role}</span><h4>${p.name}</h4><p>${p.text}</p></div>
          </div>`).join('')}</div>
        <h3 class="sub-h" data-reveal>年表 <small>${state.form === 'base' ? 'CHRONOLOGY · 术师篇' : 'CHRONOLOGY · 医疗篇'}</small></h3>
        <div class="tl">
          <div class="tl-line"><i class="tl-fill"></i></div>
          ${D.timeline.filter((t) => t.form === state.form).map((t) => `<div class="tl-item f-${t.form}" data-reveal><span class="tl-dot"></span><div class="panel tl-card"><span class="tl-era mono">${t.era}</span><span class="tl-when">${t.when}</span><h3>${t.title}</h3><p>${t.text}</p></div></div>`).join('')}
        </div>
      </div>`;
    storyLive();
  }
  /** 「母亲的外套」一章的立绘同样“活”起来：优先用分层绑定，画布跨重绘复用（不重复创建 WebGL 上下文、不重复上传贴图） */
  function storyLive() {
    const host = $('.ch-pimg');
    if (!host) return;
    if (chLive) {
      chLive.attach(host);
      if (chLive.ok) host.classList.add('live');
      return;
    }
    if (window.PUPPET && PUP_KEYS.has('alter-e0')) {
      chLive = PUPPET.create(host, { doze: false });
      chLive.load('alter-e0').then((ok) => { if (ok) $('.ch-pimg')?.classList.add('live'); else { chLive.destroy(); chLive = null; } });
    } else if (window.LIVE) {
      chLive = LIVE.create(host);
      loadImg(D.forms.alter.art.e0).then((im) => {
        if (im && im.crossOrigin && chLive && chLive.set(im, 'alter')) $('.ch-pimg')?.classList.add('live');
      });
    }
  }
  let chLive = null;

  /* ---------------------------------------------------- 画廊 */
  /*
   * 舞台分三层景深（网格与光环 / 背景大字 / 立绘与分层动态），随鼠标错位，只改 transform（--px / --py）。
   * 换页：新页先加载再入场（旧页留到新页就绪，不闪空），入场结束后才由分层绑定（puppet）或「活」立绘接管。
   * 自动轮播由当前缩略图下方进度条的 CSS 动画驱动：动画结束即翻页；悬停、离屏、全屏预览时动画暂停，
   * 不用任何定时器轮询。舞台第一次接近视野之前不加载分层绑定（不和加载页抢带宽、主线程）。
   */
  const GAL_W = 1400; // 舞台图宽度：PRTS 服务端缩图；2–2.5K 的原图（2–6 MB）只在全屏预览时加载
  const GAL_AUTO = 8; // 自动翻页间隔（秒）；手动翻页后这一页停两倍时间
  const GAL_TINT = { base: '#ff4f8f', alter: '#6fb0f0', kv: '#9c86e0' };
  let galTok = 0, galHandT = 0, galPupQ = Promise.resolve(), galIO = null, galNear = false, galPend = null, galManual = false;
  let galAutoOn = !reduce;
  const GI = {
    plus: '<path d="M12 5 V 19 M5 12 H 19"/>',
    minus: '<path d="M5 12 H 19"/>',
    fit: '<path d="M4 9 V 4 H 9 M15 4 H 20 V 9 M20 15 V 20 H 15 M9 20 H 4 V 15"/>',
    expand: '<path d="M9 4 H 4 V 9 M15 4 H 20 V 9 M20 15 V 20 H 15 M4 15 V 20 H 9 M4 4 L 10 10 M20 4 L 14 10 M20 20 L 14 14 M4 20 L 10 14"/>',
  };
  const gIco = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${GI[n]}</svg>`;
  const ymd = (d) => (d ? d.replace(/-/g, '.') : '—');
  const pad2 = (n) => String(n).padStart(2, '0');
  /** 当前形态的立绘在前，另一形态随后，活动主视觉最后；补齐展示用字段 */
  function galleryItems() {
    const cur = state.form, oth = cur === 'base' ? 'alter' : 'base';
    const map = (form) => {
      const f = D.forms[form];
      // face：脸在立绘里的归一化位置（立绘对照的「特写」按它对齐）；精英零 / 二用手工绑定点，时装用数据里量好的值
      return f.outfits.map((o) => ({ ...o, form, who: f.name, mood: f.mood, color: o.color || GAL_TINT[form], word: o.word || o.brand || f.giant, date: o.date || f.release, skin: o.key[0] === 's', face: o.face || ((f.rig || {})[o.key] || {}).head || [0.5, 0.25] }));
    };
    return [...map(cur), ...map(oth), ...D.keyArt.map((o) => ({ ...o, kv: true, mood: '主视觉', color: GAL_TINT.kv, word: o.brand || 'ARKNIGHTS' }))];
  }
  /**
   * 舞台用图（与「活」立绘共用同一份 CORS 图片缓存）：加载页已下载过的原图直接用；
   * 否则请求服务端缩图（体积约为原图的 1/3、解码量少一半多），缩图 4.5 秒还没回来就同时去拿原图，谁先到用谁
   */
  function galLoad(o) {
    const c = imgCache.get(o.src);
    if (c) return c.then((im) => im || loadImg(thumbUrl(o.src, GAL_W)));
    return new Promise((res) => {
      let done = false;
      const ok = (im) => { if (!done && im) { done = true; res(im); } };
      const t = setTimeout(() => loadImg(o.src).then(ok), 4500);
      loadImg(thumbUrl(o.src, GAL_W)).then((im) => {
        clearTimeout(t);
        if (im) ok(im);
        else loadImg(o.src).then((b) => { if (!done) { done = true; res(b); } });
      });
    });
  }
  const galGroupLabel = (g) => (g === 'kv' ? '活动主视觉' : `${D.forms[g].mood} · ${D.forms[g].name}`);
  /** 信息卡 / 全屏预览共用的资料表 */
  function galMeta(o) {
    const when = o.kv ? `${ymd(o.date)}${o.until ? '–' + o.until.slice(5).replace('-', '.') : ''}` : ymd(o.date);
    const row = (k, v, cls = '') => `<div><dt>${k}</dt><dd class="${cls}">${esc(v)}</dd></div>`;
    // 时装：售价（源石）与复刻次数（PRTS 时装回廊）
    const re = o.rerun || [];
    const extra = (o.price ? row('售价', `${o.price} 源石`) : '') + (o.skin ? `<div title="${re.length ? '复刻：' + re.map(ymd).join(' / ') : ''}"><dt>复刻</dt><dd>${re.length ? re.length + ' 次' : '暂无'}</dd></div>` : '');
    return `<dl class="gc-meta${extra ? ' x6' : ''}">${row(o.kv ? '时间' : o.skin ? '上架' : '实装', when, 'mono')}${row('获取', o.get || '—')}${o.kv ? row('类型', o.tag || '—') : row('画师', o.artist || D.meta.illustrator)}${row('舞台', '原画', 'gc-mode')}${extra}</dl>`;
  }
  /** 动态时装附带的内容（动态立绘 / 入场动画 / 配套语音） */
  const galFeat = (o) => (o.feat ? `<p class="gc-feat">${o.feat.map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : '');
  function galHeadTags(o) {
    return `<span class="gc-form f-${o.kv ? 'kv' : o.form}">${o.kv ? '主视觉' : o.mood}</span><span class="gc-tag mono">${esc(o.tag || '')}</span>`;
  }
  function renderGallery() {
    const items = galleryItems();
    const f = F(), o2 = OTHER();
    state.gal = 0;
    // 官方动态立绘的舞台跨重绘保留：WebGL 上下文、已下载的骨骼和当前动作都还在
    const keepDyn = galDyn ? $('#gallery .dyn-screen') : null;
    const groups = [state.form, state.form === 'base' ? 'alter' : 'base', 'kv'];
    const strip = groups.map((g) => {
      const idx = items.map((o, i) => [o, i]).filter(([o]) => (g === 'kv' ? o.kv : !o.kv && o.form === g));
      return `<div class="gst-g g-${g}" style="--n:${idx.length}"><span class="gst-h"><i></i>${galGroupLabel(g)}</span><div class="gst-row">${idx.map(([o, i]) => `
        <button type="button" class="gst-i${o.kv ? ' is-kv' : ''}" data-gi="${i}" style="--oc:${o.color}" aria-label="${esc(`${o.mood} · ${o.name}`)}">
          <img src="${thumbUrl(o.src, o.kv ? 360 : 256)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" onload="this.parentNode.classList.add('ld')" onerror="this.style.opacity=0;this.parentNode.classList.add('ld')">
          ${o.logo ? `<i class="gst-logo"><img src="${thumbUrl(o.logo, 220)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" onerror="this.parentNode.remove()"></i>` : ''}
          <span class="gst-t"><b>${esc(o.name)}</b><small class="mono">${esc(o.tag || '')}</small></span><i class="gst-bar"></i>
        </button>`).join('')}</div></div>`;
    }).join('');
    const dynSub = (k) => (D.forms.alter.outfits.find((x) => x.dyn === k) || {}).series || '';
    $('#gallery').innerHTML = head('06', 'GALLERY', '画廊', `${f.mood}的 ${f.outfits.length} 幅立绘在前，${o2.mood}的 ${o2.outfits.length} 幅随后，另有 ${D.keyArt.length} 张活动主视觉。移动鼠标感受景深；点击舞台全屏欣赏，可以缩放、平移。`) + `
      <div class="wrap">
        <div class="gal${galAutoOn ? '' : ' paused'}" data-reveal>
          <div class="gal-stage" tabindex="0" aria-roledescription="轮播" aria-label="立绘舞台：← → 切换，回车全屏">
            <div class="gal-back" aria-hidden="true"><i class="gal-halo"></i></div>
            <div class="gal-slides"></div>
            <div class="gal-live"></div>
            <div class="gal-foil" aria-hidden="true"></div>
            <button type="button" class="gal-hit" data-g="full" tabindex="-1" aria-label="全屏查看当前立绘"></button>
            <div class="gal-hud" aria-hidden="true"><i class="c1"></i><i class="c2"></i><i class="c3"></i><i class="c4"></i></div>
            <div class="gal-top"><span class="gal-count mono"></span><span class="gal-grp"></span><span class="gal-mode mono"><i></i><b>STILL · 原画</b></span></div>
            <span class="gal-hint mono" aria-hidden="true">CLICK · 全屏 / 缩放</span>
            <div class="gal-ctrl">
              <button type="button" class="icon-btn gal-play" data-g="play" aria-pressed="${galAutoOn}" aria-label="自动轮播" title="自动轮播">${A.icon(galAutoOn ? 'pause' : 'play')}</button>
              <button type="button" class="icon-btn" data-g="prev" aria-label="上一幅">${A.icon('arrow', 'flip')}</button>
              <button type="button" class="icon-btn" data-g="next" aria-label="下一幅">${A.icon('arrow')}</button>
            </div>
          </div>
          <aside class="gal-card panel">
            <div class="gc-body" aria-live="polite"></div>
            <div class="gc-acts">
              <button type="button" class="btn btn-primary" data-g="full">${gIco('expand')}全屏欣赏</button>
              <button type="button" class="btn btn-ghost gc-dyn" data-g="dyn" hidden>${A.icon('play')}官方动态</button>
            </div>
          </aside>
          <div class="gal-strip">${strip}</div>
        </div>
        ${cmpMarkup()}
        <h3 class="sub-h" data-reveal>官方动态立绘 <small>DYNAMIC ILLUSTRATION · 纯烬艾雅法拉</small></h3>
        <div class="dyn" data-reveal>
          ${keepDyn ? '<div class="dyn-screen" data-keep></div>' : `<div class="dyn-screen">
            <div class="dyn-host playing"></div>
            <div class="dyn-hud" aria-hidden="true">
              <span class="dh-rec"><i></i>LIVE</span><span class="dh-tc mono">SPINE 3.8</span>
              <span class="dh-title">纯烬艾雅法拉 · <b class="dh-name">${DYN_MODELS[galDynKey] ? DYN_MODELS[galDynKey].name : ''}</b></span><span class="dh-geo mono">63.63°N 19.62°W · <b class="dh-act">待机</b></span>
              <span class="dh-c c1"></span><span class="dh-c c2"></span><span class="dh-c c3"></span><span class="dh-c c4"></span>
            </div>
            <button type="button" class="dyn-gate" data-act="dyn-load">${A.icon('play')}<span>载入官方动态立绘</span><small class="dg-size">约 ${DYN_MODELS[galDynKey] ? DYN_MODELS[galDynKey].size : ''}</small></button>
            <div class="dyn-msg dm-loading">正在载入高清骨骼动画…</div>
          </div>`}
          <div class="dyn-side">
            <div class="seg dyn-tabs" role="group" aria-label="选择动态立绘">${Object.entries(DYN_MODELS).map(([k, m]) => `<button type="button" data-dynk="${k}" class="${k === galDynKey ? 'on' : ''}"><b>${m.name}</b><small>${esc(dynSub(k))} · ${m.size}</small></button>`).join('')}</div>
            <div class="th-acts dyn-acts"></div>
            <p class="note">游戏客户端里的高清 Spine 动态立绘（约 2.3K 贴图），由 spine-ts 3.8 实时渲染；资源经 GitHub 镜像 isHarryh/Ark-Models 在线加载。点画面可以和她互动，隔一会儿她也会自己动一动。${state.form === 'base' ? '本体艾雅法拉没有官方动态立绘——这三段都属于纯烬。' : '精英二与两套 EPOQUE 时装都带有官方动态立绘；本体艾雅法拉没有。'}</p>
          </div>
        </div>
      </div>`;
    if (keepDyn) $('#gallery .dyn-screen[data-keep]').replaceWith(keepDyn);
    // 画布跨重绘复用：WebGL 上下文的创建和销毁都很贵
    const host = $('.gal-live');
    if (galLive) galLive.attach(host); else galLive = window.LIVE ? LIVE.create(host) : null;
    // 高分屏上画布最多按 1.5 倍像素绘制：立绘本来就是缩小显示，肉眼看不出差别，填充量少近一半
    if (galPup) galPup.attach(host); else galPup = window.PUPPET ? PUPPET.create(host, { doze: false, pad: 0.1, amp: 1.3, maxDpr: 1.5 }) : null;
    if (galLive) galLive.hide();
    if (galPup) galPup.hide();
    $('.gal-stage').classList.remove('pup', 'live');
    galBindStage();
    setGallery(0, 0);
    cmpInit();
    if (keepDyn) galDynSide(); else setupGalDyn();
  }
  /** 舞台：鼠标景深（每帧最多写一次变量）；离开视野暂停自动轮播；第一次接近视野才让分层动态接管 */
  function galBindStage() {
    const stage = $('.gal-stage');
    if (!stage) return;
    let raf = 0, px = 0, py = 0;
    const put = () => { raf = 0; stage.style.setProperty('--px', px.toFixed(3)); stage.style.setProperty('--py', py.toFixed(3)); };
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = stage.getBoundingClientRect();
      px = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      py = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
      if (!raf) raf = requestAnimationFrame(put);
    }, { passive: true });
    stage.addEventListener('pointerleave', () => { px = py = 0; if (!raf) raf = requestAnimationFrame(put); });
    if (galIO) galIO.disconnect();
    galNear = false;
    galIO = new IntersectionObserver(([en]) => {
      const was = galNear;
      galNear = en.isIntersecting;
      const g = stage.closest('.gal');
      if (g) g.classList.toggle('off', !galNear);
      // 区块被 content-visibility 跳过时，暂停样式不会生效、进度条照样在走：回到视野时从头计时
      if (galNear && !was) galBarReset();
      if (galNear && galPend) { const [o, tok] = galPend; galPend = null; galHandoff(o, tok); }
    }, { rootMargin: '160px 0px' });
    galIO.observe(stage);
  }
  /** 重绘后沿用已载入的动态立绘：只刷新右侧的选项卡与动作按钮 */
  function galDynSide() {
    $$('[data-dynk]').forEach((b) => b.classList.toggle('on', b.dataset.dynk === galDynKey));
    const acts = $('.dyn-acts');
    if (acts && galDyn && galDyn.ready) acts.innerHTML = galDyn.actions().map((a) => `<button type="button" class="th-act" data-dynact="${a.id}">${a.label}</button>`).join('');
  }
  /** 从画廊跳到下方的官方动态立绘，并载入对应的那一套 */
  function galToDyn() {
    const o = galleryItems()[state.gal];
    const scr = $('.dyn-screen');
    if (!scr || !o || !o.dyn) return;
    scrollTo({ top: scr.getBoundingClientRect().top + scrollY - 90, behavior: reduce ? 'auto' : 'smooth' });
    if (o.dyn !== galDynKey || !scr.classList.contains('started')) loadGalDyn(o.dyn);
  }

  /* ---------------------------------------------------- 官方动态立绘舞台（画廊） */
  const DYN_MODELS = window.DYN ? DYN.MODELS : {};
  let galDyn = null, galDynKey = 'e2', galDynIO = null;
  function setupGalDyn() {
    if (galDyn) { galDyn.destroy(); galDyn = null; }
    const host = $('.dyn-host');
    if (!window.DYN || !host) return;
    galDyn = DYN.create(host, { pad: 1.04 });
    galDyn.onReady = (acts) => {
      $('.dyn-screen').classList.add('ready');
      $('.dyn-acts').innerHTML = acts.map((a) => `<button type="button" class="th-act" data-dynact="${a.id}">${a.label}</button>`).join('');
    };
    galDyn.onAction = (n) => { const el = $('.dh-act'); if (el) el.textContent = ({ Start: '登场', Interact: '互动', Special: '特殊动作' })[n] || n; };
    galDyn.onPoke = () => AUDIO.sfx('tick');
    // 进入视野再下载（单个约 6–9 MB）
    if (galDynIO) galDynIO.disconnect();
    galDynIO = new IntersectionObserver(([en]) => { if (en.isIntersecting && state.entered) loadGalDyn(); }, { rootMargin: '200px 0px' });
    galDynIO.observe($('.dyn-screen'));
  }
  function loadGalDyn(key = galDynKey) {
    if (!galDyn) return;
    if (galDynIO) { galDynIO.disconnect(); galDynIO = null; }
    galDynKey = key;
    const scr = $('.dyn-screen');
    scr.classList.add('started');
    scr.classList.remove('ready');
    $$('[data-dynk]').forEach((b) => b.classList.toggle('on', b.dataset.dynk === key));
    $('.dh-name').textContent = DYN_MODELS[key].name;
    $('.dh-act').textContent = '待机';
    $('.dyn-acts').innerHTML = '';
    // 没加载出来：不显示失败提示，回到「载入官方动态立绘」的初始画面，想看可以再点一次
    const me = galDyn;
    galDyn.load(key).then((ok) => { if (!ok && me === galDyn && $('.dyn-host')?.classList.contains('failed')) scr.classList.remove('started'); });
  }
  /** 翻到第 i 幅；dir 为入场方向（0 = 不做过渡） */
  function setGallery(i, dir = 1) {
    const items = galleryItems();
    i = (i + items.length) % items.length;
    const o = items[i];
    const stage = $('.gal-stage');
    if (!stage) return;
    state.gal = i;
    const tok = ++galTok;
    clearTimeout(galHandT);
    galPend = null;
    // 缩略条：高亮 + 进度条（手动翻页后这一页停两倍时间）
    $$('.gst-i').forEach((b) => {
      const on = +b.dataset.gi === i;
      b.classList.toggle('on', on);
      if (on) { b.setAttribute('aria-current', 'true'); b.style.setProperty('--dur', (galManual ? GAL_AUTO * 2 : GAL_AUTO) + 's'); galStripTo(b); } else b.removeAttribute('aria-current');
    });
    // 读屏：自动轮播时不播报，手动翻页才播报信息卡
    $('.gc-body')?.setAttribute('aria-live', galManual ? 'polite' : 'off');
    galManual = false;
    $('.gal-count', stage).textContent = `${pad2(i + 1)} / ${pad2(items.length)}`;
    // 新的一页：底色、背景大字（按字数缩放到一行放得下）、立绘
    const sl = document.createElement('div');
    sl.className = 'gal-slide' + (o.kv ? ' is-kv' : '');
    sl.style.setProperty('--oc', o.color);
    sl.style.setProperty('--wl', Math.max(6, o.word.length));
    sl.innerHTML = `<i class="gs-tint"></i><div class="gs-word" aria-hidden="true"><span>${esc(o.word)}</span></div><div class="gs-art"></div>`;
    // 载入期间进度条暂停：图还没出来就不自动翻走
    const gal = stage.closest('.gal');
    stage.classList.add('loading');
    gal.classList.add('wait');
    // 文字与画面同时换（信息卡、左上角的分组）；舞台还空着、或图迟迟不到（资源站慢）时先换文字
    let carded = false;
    const card = () => { if (carded || tok !== galTok) return; carded = true; $('.gal-grp', stage).textContent = o.kv ? o.who : `${o.mood} · ${o.who}`; galCard(o); };
    const early = setTimeout(card, $('.gal-slides', stage).children.length ? 700 : 0);
    galLoad(o).then((im) => {
      if (tok !== galTok || !stage.isConnected) return;
      stage.classList.remove('loading');
      gal.classList.remove('wait');
      clearTimeout(early);
      card();
      if (im) {
        const pic = im.cloneNode();
        pic.alt = `${o.who} · ${o.name}`;
        pic.draggable = false;
        pic.decoding = 'sync'; // 图已经下载好：同步解码，入场第一帧就有画面
        $('.gs-art', sl).appendChild(pic);
      }
      // 上一幅若由分层动态 / 活立绘接管着：画布停在最后一帧并淡出，旧页的原画保持隐藏，不会先闪回原画
      const had = stage.classList.contains('pup') || stage.classList.contains('live');
      stage.classList.remove('pup', 'live');
      if (galPup) galPup.hide();
      if (galLive) galLive.hide();
      const slides = $('.gal-slides', stage);
      const olds = [...slides.children];
      slides.appendChild(sl);
      const anim = dir && !reduce;
      const ease = 'cubic-bezier(.2,.8,.2,1)';
      olds.forEach((old) => {
        if (had && !old.classList.contains('gone')) old.classList.add('hid');
        old.classList.add('gone');
        if (!anim) { old.remove(); return; }
        old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translate3d(${-dir * 4}%, 0, 0) scale(0.97)` }], { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).onfinish = () => old.remove();
      });
      if (anim) {
        sl.animate([{ opacity: 0, transform: `translate3d(${dir * 6}%, 0, 0) scale(1.03)` }, { opacity: 1, transform: 'none' }], { duration: 900, easing: ease });
        $('.gs-word span', sl).animate([{ opacity: 0, transform: `translate3d(${dir * 16}%, 0, 0)` }, { opacity: 1, transform: 'none' }], { duration: 1400, easing: ease });
        galSweep(stage, dir);
      }
      galMode(o);
      galHandT = setTimeout(() => galHandoff(o, tok), anim ? 950 : 60);
      // 空闲时预取下一幅（自动轮播的方向）
      idle(() => { if (tok === galTok) galLoad(items[(i + 1) % items.length]); });
    });
  }
  /** 入场结束后接管舞台：分层绑定优先，其次整图变形的「活」立绘；主视觉保持原图 */
  function galHandoff(o, tok) {
    if (tok !== galTok) return;
    if (!galNear) { galPend = [o, tok]; return; }
    const stage = $('.gal-stage');
    if (!stage || o.kv) return;
    const pk = `${o.form}-${o.key}`;
    if (!galPup || !PUP_KEYS.has(pk)) { galLiveSet(o, tok); return; }
    // 同一个人偶实例：加载排队进行，免得先发后至的请求把新立绘换掉
    galPupQ = galPupQ.then(async () => {
      if (tok !== galTok) return;
      const ok = await galPup.load(pk);
      if (tok !== galTok) { galPup.hide(); return; }
      if (!ok) { galLiveSet(o, tok); return; }
      if (galLive) galLive.hide();
      stage.classList.add('pup');
      if (!$('#lightbox').hidden) galPup.pause(true);
      galMode(o, 'pup');
    }).catch(() => {});
  }
  async function galLiveSet(o, tok) {
    const stage = $('.gal-stage');
    if (!galLive || !stage) return;
    const im = await galLoad(o);
    if (tok !== galTok || !im || !im.crossOrigin || !$('#lightbox').hidden) return;
    if (galLive.set(im, o.form)) { stage.classList.add('live'); galMode(o, 'live'); }
  }
  /** 舞台右上角与信息卡里的「舞台」状态 */
  function galMode(o, mode) {
    const m = $('.gal-mode');
    const [k, t, s] = o.kv ? ['kv', 'KEY ART · 主视觉', '活动原图'] : mode === 'pup' ? ['pup', 'LAYERED · 分层动态', '分层动态'] : mode === 'live' ? ['live', 'LIVE · 实时光影', '实时光影'] : ['still', 'STILL · 原画', '原画'];
    if (m) { m.dataset.m = k; $('b', m).textContent = t; }
    const d = $('.gal-card .gc-mode');
    if (d) d.textContent = s;
  }
  /** 换页时掠过舞台的一道光（只动 transform / opacity，结束即移除） */
  function galSweep(stage, dir) {
    const s = document.createElement('i');
    s.className = 'gal-sweep';
    stage.appendChild(s);
    const a = dir > 0 ? -140 : 440, b = dir > 0 ? 440 : -140;
    s.animate([{ opacity: 0, transform: `translate3d(${a}%, 0, 0) skewX(-16deg)` }, { opacity: 1, offset: 0.3 }, { opacity: 0, transform: `translate3d(${b}%, 0, 0) skewX(-16deg)` }], { duration: 1100, easing: 'cubic-bezier(.3,.5,.3,1)' }).onfinish = () => s.remove();
  }
  /** 信息卡 */
  function galCard(o) {
    const card = $('.gal-card');
    if (!card) return;
    const b = $('.gc-body', card);
    card.style.setProperty('--oc', o.color);
    b.innerHTML = `
      <div class="gc-head">${galHeadTags(o)}${o.logo ? `<span class="gc-logo"><img src="${thumbUrl(o.logo, 220)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></span>` : ''}</div>
      <p class="gc-series mono">${esc(o.brand && !o.kv ? `${o.brand} · ${o.series}` : o.series)}</p>
      <h3 class="gc-name">${esc(o.name)}</h3>
      ${o.kv ? `<p class="gc-who">${esc(`${o.who} · 纯烬艾雅法拉`)}</p>` : ''}
      <p class="gc-desc">${esc(o.desc)}</p>
      ${o.note ? `<p class="gc-note">${esc(o.note)}</p>` : ''}
      ${galFeat(o)}
      ${galMeta(o)}`;
    b.scrollTop = 0;
    // 内容比卡片高（字多的时装）：底部渐隐，提示可以在卡内滚动
    b.classList.toggle('more', b.scrollHeight > b.clientHeight + 4);
    b.classList.remove('end');
    b.onscroll = () => b.classList.toggle('end', b.scrollTop + b.clientHeight >= b.scrollHeight - 4);
    const dy = $('.gc-dyn', card);
    if (dy) dy.hidden = !o.dyn;
    if (!reduce) b.animate([{ opacity: 0, transform: 'translate3d(0, 10px, 0)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  /** 缩略条横向滚到当前项（只滚动缩略条自己，不带动页面） */
  function galStripTo(b) {
    const s = b.closest('.gal-strip');
    if (!s || s.scrollWidth <= s.clientWidth + 2) return;
    s.scrollTo({ left: b.offsetLeft - (s.clientWidth - b.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
  }

  /* ---------------------------------------------------- 立绘对照（拖动分界线；两层反向平移，只改 transform） */
  let cmpKey = 'elite', cmpP = 0.5, cmpTouched = false, cmpIO = null;
  const CMP_TEXT = {
    base: {
      elite: '精英零的她还带着书卷气：白色披肩、红色饰带、斜握的法杖。精英二是施术的一瞬——小黑羊围成一圈，熔岩像绸带一样卷上来。',
      form: '同一个人的两种答案：术师用熔岩回应天灾；后来的医疗形态，把灰烬化作新生。拖动分界线，看她从左边走到右边。',
      skin: '粉色晚霞里的海滩，与钟面下的魔法之夜——相隔四年的两套时装，一套属于海风，一套属于灯火。',
    },
    alter: {
      elite: '精英零是登山考察的装束：母亲留下的防护外套与晶枝法杖。精英二把舞台交给天空——云海、火山与彩虹，白色的灰烬从法杖尖端飘落。',
      form: '白色的灰烬之前，是粉色的烈焰。左边是如今的医疗形态，右边是最初那位术师——拖动分界线，把时间倒回去看一看。',
      skin: '远行前的野餐与后来的故事：一套属于出发，一套属于回家。两套都是带官方动态立绘的 EPOQUE 时装。',
    },
  };
  function cmpPairs() {
    const cf = state.form, of = cf === 'base' ? 'alter' : 'base';
    // 带上脸的位置（取景「半身 / 特写」按它把两幅立绘对齐）
    const pick = (form, key) => { const o = D.forms[form].outfits.find((x) => x.key === key); return o && { ...o, face: o.face || ((D.forms[form].rig || {})[key] || {}).head || [0.5, 0.25] }; };
    const T = CMP_TEXT[cf];
    return [
      { id: 'elite', tab: '精英化', a: pick(cf, 'e0'), b: pick(cf, 'e2'), la: '精英零', lb: '精英二', text: T.elite },
      { id: 'form', tab: '两种形态', a: pick(cf, 'e0'), b: pick(of, 'e0'), la: D.forms[cf].mood, lb: D.forms[of].mood, text: T.form },
      { id: 'skin', tab: '两套时装', a: pick(cf, 's1'), b: pick(cf, 's2'), la: pick(cf, 's1').name, lb: pick(cf, 's2').name, text: T.skin },
    ].filter((p) => p.a && p.b);
  }
  /* 取景：全身 / 半身 / 特写。两幅图各自平移缩放，让脸落在画面同一处（只改 transform，过渡交给合成器） */
  const CMP_ZOOM = [['全身', 1, 0], ['半身', 1.9, 0.26], ['特写', 3, 0.44]];
  let cmpZoom = 0, cmpRO = null;
  function cmpFrame() {
    const box = $('.cmp');
    const c = cmpPairs().find((p) => p.id === cmpKey);
    if (!box || !c) return;
    const [, s, ty] = CMP_ZOOM[cmpZoom];
    const W = box.clientWidth, H = box.clientHeight;
    $$('img', box).forEach((im, k) => {
      if (s === 1) { im.style.transform = ''; return; }
      const [hx, hy] = (k ? c.b : c.a).face;
      const ar = im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 1;
      // 与 CSS 一致：img 盒子占 inset 3% 2%，内容按 contain 居中
      const ew = W * 0.96, eh = H * 0.94, cw = Math.min(ew, eh * ar), ch = cw / ar;
      const qx = (ew - cw) / 2 + hx * cw, qy = (eh - ch) / 2 + hy * ch; // 脸在 img 盒子里的位置
      const tx = W * 0.5 - W * 0.02 - s * qx, ty2 = H * ty - H * 0.03 - s * qy;
      im.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty2.toFixed(1)}px, 0) scale(${s})`;
    });
    box.classList.toggle('zoomed', s > 1);
  }
  function cmpSetZoom(i) {
    cmpZoom = clamp(i, 0, CMP_ZOOM.length - 1);
    $$('[data-cmpz]').forEach((b) => { const on = +b.dataset.cmpz === cmpZoom; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    cmpFrame();
  }
  function cmpMarkup() {
    const P = cmpPairs();
    return `<h3 class="sub-h" data-reveal>立绘对照 <small>BEFORE · AFTER</small></h3>
      <div class="cmp-wrap" data-reveal>
        <div class="cmp" tabindex="0" role="slider" aria-label="拖动分界线对照两幅立绘" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(cmpP * 100)}" style="--p:${cmpP}">
          <div class="cmp-a"><img alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false"></div>
          <div class="cmp-b"><div class="cmp-bi"><img alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false"></div></div>
          <div class="cmp-line" aria-hidden="true"><span class="cmp-knob">${A.icon('swap')}</span></div>
          <span class="cmp-tag ta mono"></span><span class="cmp-tag tb mono"></span>
        </div>
        <div class="cmp-side panel">
          <div class="panel-h">COMPARE <span>对照组</span></div>
          <div class="seg cmp-tabs" role="group" aria-label="选择对照组">${P.map((p) => `<button type="button" data-cmp="${p.id}" class="${p.id === cmpKey ? 'on' : ''}" aria-pressed="${p.id === cmpKey}">${p.tab}</button>`).join('')}</div>
          <p class="cmp-pair"></p>
          <p class="cmp-text"></p>
          <p class="cmp-zh mono">FRAMING · 取景 <span>按脸部对齐</span></p>
          <div class="seg cmp-zoom" role="group" aria-label="取景">${CMP_ZOOM.map(([t], i) => `<button type="button" data-cmpz="${i}" class="${i === cmpZoom ? 'on' : ''}" aria-pressed="${i === cmpZoom}">${t}</button>`).join('')}</div>
          <p class="note">拖动画面上的分界线，或聚焦后用 ← → 键移动；双击回到正中。</p>
        </div>
      </div>`;
  }
  function cmpSet(id) {
    const P = cmpPairs(), c = P.find((p) => p.id === id) || P[0];
    const box = $('.cmp');
    if (!box || !c) return;
    cmpKey = c.id;
    const [ia, ib] = $$('img', box);
    // 与舞台共用同一份图（加载页下载过的原图，或 1400 宽的缩图）：切到对照时多半已经在缓存里
    const put = (im, o, label) => {
      const tk = (im._tk = (im._tk || 0) + 1);
      im.alt = label;
      im.onload = () => { cmpFrame(); if (!reduce) im.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450 }); };
      galLoad(o).then((x) => { if (im._tk !== tk || !x) return; if (!x.crossOrigin) im.removeAttribute('crossorigin'); else im.crossOrigin = 'anonymous'; im.src = x.src; });
    };
    // 图片等对照区接近视野再取
    if (box.dataset.near) { put(ia, c.a, c.la); put(ib, c.b, c.lb); }
    $('.cmp-tag.ta', box).textContent = c.la;
    $('.cmp-tag.tb', box).textContent = c.lb;
    const pr = $('.cmp-pair');
    if (pr) pr.innerHTML = `<b>${esc(c.la)}</b><i>${A.icon('swap')}</i><b>${esc(c.lb)}</b>`;
    const tx = $('.cmp-text');
    if (tx) tx.textContent = c.text;
    $$('[data-cmp]').forEach((b) => { const on = b.dataset.cmp === c.id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    cmpFrame();
  }
  function cmpInit() {
    const box = $('.cmp');
    if (!box) return;
    cmpSet(cmpKey);
    // 画框尺寸变了（窗口缩放、断点切换）：重算取景
    if (cmpRO) cmpRO.disconnect();
    if (window.ResizeObserver) { cmpRO = new ResizeObserver(() => { if (cmpZoom) cmpFrame(); }); cmpRO.observe(box); }
    let raf = 0, drag = false;
    const put = () => { raf = 0; box.style.setProperty('--p', cmpP.toFixed(4)); box.setAttribute('aria-valuenow', Math.round(cmpP * 100)); };
    const setP = (v) => { cmpP = clamp(v, 0, 1); if (!raf) raf = requestAnimationFrame(put); };
    const at = (e) => { const r = box.getBoundingClientRect(); setP((e.clientX - r.left) / r.width); };
    box.addEventListener('pointerdown', (e) => { if (e.button > 0) return; drag = true; cmpTouched = true; box.setPointerCapture(e.pointerId); box.classList.add('drag'); at(e); });
    box.addEventListener('pointermove', (e) => { if (drag) at(e); });
    const end = () => { drag = false; box.classList.remove('drag'); };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.addEventListener('dblclick', () => setP(0.5));
    const nearIO = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      nearIO.disconnect();
      box.dataset.near = '1';
      if (box.isConnected) cmpSet(cmpKey);
    }, { rootMargin: '400px 0px' });
    nearIO.observe(box);
    box.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); cmpTouched = true; setP(cmpP + (k === 'ArrowRight' ? 0.05 : -0.05)); }
      else if (k === 'Home' || k === 'End') { e.preventDefault(); setP(k === 'End' ? 1 : 0); }
    });
    // 第一次完整进入视野：分界线自己左右晃一下，提示可以拖（只在还没人动过它时）
    if (cmpIO) { cmpIO.disconnect(); cmpIO = null; }
    if (cmpTouched || reduce) return;
    cmpIO = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting || !state.entered) return;
      cmpIO.disconnect();
      cmpIO = null;
      setTimeout(() => {
        const t0 = performance.now(), dur = 1900;
        const step = (now) => {
          if (cmpTouched || !box.isConnected) return;
          const k = Math.min(1, (now - t0) / dur);
          cmpP = 0.5 + Math.sin(k * Math.PI * 2) * 0.22 * (1 - k * 0.4);
          put();
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, 400);
    }, { threshold: 0.6 });
    cmpIO.observe(box);
  }
  /* ====================================================
   * 语音（离线分析、播放器外观在 voice.js；这里管播放、状态与字幕）
   * - 可视化只在语音真正播放时逐帧更新：'playing' 开始、暂停 / 结束 / 出错即停，没有常驻循环
   * - 资源没加载出来：不提示，播放器悄悄回到待命
   * ==================================================== */
  const V = window.VOICE;
  const VOICE_LEAD = {
    base: '她听见的世界，总隔着一层薄雾。点击卡片播放官方语音（在线加载）；文字为本页的概述，并非台词原文。',
    alter: '如今她能读懂唇语——嘴唇一动，话语便浮现出来。点击卡片播放官方语音（在线加载）；文字为本页的概述，并非台词原文。',
  };
  const LANG_Z = { jp: '日', cn: '中', kr: '韩', en: '英' };
  /** 某个形态可用的语音组：默认 + 时装语音 */
  function voiceSets(form = state.form) {
    const f = D.forms[form];
    return [{ key: 'default', name: '默认', series: 'DEFAULT', path: f.char, langs: ['jp', 'cn', 'kr', 'en'], lines: f.voices }, ...(f.voiceSets || [])];
  }
  function voiceSet(key = state.vset, form = state.form) { const s = voiceSets(form); return s.find((x) => x.key === key) || s[0]; }
  /** 这组语音有没有当前语言：没有就用日语（「后来的故事」只有日 / 中） */
  const voiceLang = (set) => (set.langs.includes(state.lang) ? state.lang : 'jp');
  /** 解锁条件（精英 / 信赖）以默认语音表为准：时装语音与之相同 */
  const voiceCond = (form, n) => { const v = D.forms[form].voices.find((x) => x[0] === n); return (v && v[3]) || ''; };
  function voiceList() {
    const set = voiceSet();
    if (state.vfilter === 'tale' && set.tale) return set.tale.map((n) => set.lines.find((v) => v[0] === n)).filter(Boolean);
    return set.lines.filter((v) => state.vfilter === 'all' || V.catOf(v[0]) === state.vfilter);
  }
  const voiceModeOn = () => (state.form === 'base' ? state.vsim : state.vlip);
  let deckPaint = null, voiceVis = false, voiceIO = null, voiceRaf = 0, voiceClip = null, voiceLast = null;
  // 听过的语音（跨次访问保留）；分析过的真实包络（按语音地址，本次访问内给卡片声纹用）
  const voiceHeard = new Set(store.get('vheard', []));
  const voiceEnv = new Map();
  const voiceKey = (form, setKey, n) => `${form}:${setKey}:${n}`;
  const cardUrl = (set, n) => D.voiceUrl(voiceLang(set), set.path, n);
  /** 待命时推荐的第一条：默认语音用 voiceDeck.cue（术师：交谈2 · 听力；医疗：交谈3 · 读唇），其余取当前列表的第一条 */
  function voiceCue() {
    const set = voiceSet(), list = voiceList(), deck = F().voiceDeck || {};
    const want = set.key === 'default' ? deck.cue : state.vfilter === 'tale' && set.tale ? set.tale[0] : null;
    const v = list.find((x) => x[0] === want) || list[0];
    return v ? { n: v[0], title: v[1], text: v[2], set: set.key !== 'default' ? set.name : '' } : null;
  }

  function renderVoice() {
    const f = F();
    if (!voiceSets().some((s) => s.key === state.vset)) { state.vset = 'default'; if (state.vfilter === 'tale') state.vfilter = 'all'; }
    const deck = f.voiceDeck || { tag: 'VOICE', mode: '', modeName: '', modeTip: '', note: '', src: '' };
    $('#voice').innerHTML = head('09', 'VOICE ARCHIVE', '语音记录', VOICE_LEAD[state.form]) + `
      <div class="wrap">
        ${V.deckHTML({ f, deck, cv: D.meta.cv, langs: voiceSet().langs, lang: voiceLang(voiceSet()), auto: state.vauto, mode: voiceModeOn(), icon: A.icon, cue: voiceCue() })}
        ${V.guideHTML(deck, f.voices, A.icon)}
        <div class="vc-list"></div>
        <p class="note">角色 EP：${f.ep.map((e) => `《${esc(e)}》`).join('')}　·　配音：${D.meta.cv.map(([k, v]) => `${k} ${esc(v)}`).join(' / ')}　·　语音资源经 PRTS 资源站在线加载</p>
      </div>`;
    deckPaint = V.painter($('.vc-deck'));
    renderVoiceList();
    applyVoiceMode(false);
    // 正在说话的是这个形态：把播放器接回去（例如重绘时桌宠正好在说话）
    voiceLast = null;
    if (voiceClip && voiceClip.form === state.form) deckSync(voiceClip);
    if (!voiceIO) {
      voiceIO = new IntersectionObserver(([en]) => { voiceVis = en.isIntersecting; }, { rootMargin: '60px 0px' });
      voiceIO.observe($('#voice'));
    }
  }
  /** 语音组 / 分类 / 卡片（切换分类、语音组时只重绘这一块，播放器保持不动） */
  function renderVoiceList() {
    const box = $('.vc-list');
    if (!box) return;
    const f = F(), sets = voiceSets(), set = voiceSet();
    if (state.vfilter === 'tale' && !set.tale) state.vfilter = 'all';
    const cats = [...V.CATS, ...(set.tale ? [['tale', '童话']] : [])];
    const count = (k) => (k === 'all' ? set.lines.length : k === 'tale' ? set.tale.length : set.lines.filter((v) => V.catOf(v[0]) === k).length);
    const outfit = (s) => (s.key === 'default' ? f.outfits.find((o) => o.key === 'e0') : f.outfits.find((o) => o.name === s.name));
    const list = voiceList();
    const playKey = voiceClip ? voiceClip.key : '';
    const heardN = set.lines.filter((v) => voiceHeard.has(voiceKey(state.form, set.key, v[0]))).length;
    // 「全部」按场景分组，每组前一个小标题；其余分类（与「童话」）直接平铺
    let lastCat = '';
    const cards = list.map((v, i) => {
      const k = V.catOf(v[0]);
      const gh = state.vfilter === 'all' && k !== lastCat ? V.groupHTML(k, count(k)) : '';
      lastCat = k;
      return gh + V.cardHTML(v, i, {
        cond: voiceCond(state.form, v[0]),
        playing: playKey === voiceKey(state.form, set.key, v[0]),
        heard: voiceHeard.has(voiceKey(state.form, set.key, v[0])),
        env: voiceEnv.get(cardUrl(set, v[0])),
        tag: state.vfilter === 'tale' ? `TALE ${String(i + 1).padStart(2, '0')} / ${list.length}` : '',
      });
    }).join('');
    box.innerHTML = (sets.length > 1 ? `
      <div class="vc-sets" role="tablist" aria-label="语音组">${sets.map((s) => {
        const o = outfit(s), on = s.key === set.key;
        return `<button type="button" role="tab" class="vc-set${on ? ' on' : ''}" data-vset="${s.key}" aria-selected="${on}">
          ${o ? `<span class="vs-img"><img src="${thumbUrl(o.src, 240)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span>` : ''}
          <span class="vs-txt"><small class="mono">${esc(s.series)}${s.date ? ` · ${s.date}` : ''}</small><b>${esc(s.name)}</b><em>${s.lines.length} 条 · ${s.langs.map((l) => LANG_Z[l]).join(' ')}</em></span>
        </button>`;
      }).join('')}</div>
      <p class="vc-set-desc">${esc(set.desc || '默认语音：精英化、信赖与节日里的她。')}</p>` : '') + `
      <div class="vc-bar">
        <div class="seg vc-filter" role="group" aria-label="语音分类">${cats.map(([k, l]) => `<button type="button" data-vf="${k}" class="${state.vfilter === k ? 'on' : ''}" aria-pressed="${state.vfilter === k}">${l}<small>${count(k)}</small></button>`).join('')}</div>
        <span class="vc-heard mono" aria-live="polite"><span class="vc-hm"><i style="transform:scaleX(${(heardN / set.lines.length).toFixed(3)})"></i></span>已听 <b>${heardN}</b> / ${set.lines.length}</span>
      </div>
      <div class="vc-grid${state.vfilter === 'all' ? ' grouped' : ''}">${cards}</div>`;
    if (voiceClip) {
      voiceClip.card = $('.vc-card.playing');
      if (voiceClip.started && voiceClip.card) voiceProgress(voiceClip, !AUDIO.voice.paused);
    }
    // 待命中换了分类 / 语音组：推荐的那一条跟着换
    if (!voiceClip && deckPaint && $('.vc-deck.idle')) deckPaint.cue(voiceCue());
  }
  /** 播放器的状态：loading / playing / paused / done / idle */
  function deckState(s) {
    const d = $('.vc-deck');
    if (!d) return;
    ['loading', 'playing', 'paused', 'done', 'stopped', 'idle'].forEach((k) => d.classList.toggle(k, k === s));
    $('.vd-state', d).textContent = { loading: 'LOADING', playing: 'PLAYING', paused: 'PAUSED', done: 'END', stopped: 'STOPPED' }[s] || 'STANDBY';
    const pb = $('.vd-play', d);
    pb.innerHTML = A.icon(s === 'playing' || s === 'loading' ? 'pause' : 'play');
    pb.setAttribute('aria-label', s === 'playing' || s === 'loading' ? '暂停' : '播放');
    if (s === 'idle') { voiceLast = null; if (deckPaint) deckPaint.cue(voiceCue()); }
    else if (s !== 'playing' && deckPaint) deckPaint.rest(s === 'done');
  }
  /** 把播放器对准某条语音（标题、逐字台词、波形） */
  function deckSync(clip) {
    const d = $('.vc-deck');
    if (!d) return;
    voiceLast = clip;
    $('.vd-no', d).textContent = `VOICE ${String(clip.n).padStart(3, '0')}${clip.set.key !== 'default' ? ` · ${clip.set.name}` : ''}`;
    $('.vd-title', d).textContent = clip.v[1];
    const line = $('.vd-line', d);
    line.innerHTML = V.spans(clip.v[2], clip.n);
    clip.dchars = $$('span', line);
    for (let i = 0; i < clip.lit && i < clip.dchars.length; i++) clip.dchars[i].classList.add('lit');
    clip.card = $('.vc-card.playing');
    line.classList.remove('cue');
    if (deckPaint) { deckPaint.reset(); deckPaint.setWave(clip.res ? clip.res.env : null, clip.n); }
    deckState(AUDIO.voice.paused ? (clip.started ? 'paused' : 'loading') : 'playing');
    if (clip.started) voiceProgress(clip, !AUDIO.voice.paused);
  }
  /** 模式（术师：听觉模拟 / 医疗：读唇）→ 声音链与字幕样式。只作用于页面当前形态的语音（桌宠替另一个形态说话时不受影响） */
  function applyVoiceMode(user, form = voiceClip ? voiceClip.form : state.form) {
    const sim = form === 'base' && state.form === 'base' && state.vsim, lip = form === 'alter' && state.form === 'alter' && state.vlip;
    if (sim !== AUDIO.voiceSim) {
      const ok = AUDIO.setVoiceSim(sim);
      if (sim && !ok) { state.vsim = false; if (user) toast('这个浏览器暂时没法模拟她的听觉。'); }
    }
    if (lip !== AUDIO.voiceMute) AUDIO.setVoiceMute(lip);
    const on = voiceModeOn();
    const d = $('.vc-deck');
    if (d) { d.classList.toggle('mode-on', on); const b = $('.vd-mode', d); if (b) b.setAttribute('aria-pressed', on); }
    const sub = $('#subtitle');
    sub.classList.toggle('sim', AUDIO.voiceSim);
    sub.classList.toggle('lip', AUDIO.voiceMute);
  }

  function playVoice(n, form = state.form, setKey = 'default') {
    const f = D.forms[form];
    const set = voiceSet(setKey, form);
    const v = set.lines.find((x) => x[0] === n);
    if (!v) return;
    const key = `${form}:${set.key}:${n}`;
    if (voiceClip && voiceClip.key === key && !AUDIO.voice.paused) { AUDIO.stopVoice(); return; }
    cancelAnimationFrame(voiceRaf);
    voiceRaf = 0;
    state.playing = n;
    const lang = voiceLang(set);
    const url = D.voiceUrl(lang, set.path, n);
    const clip = (voiceClip = { n, v, form, set, key, url, lang, res: null, lit: 0, started: false, dchars: [], card: null });
    $$('.vc-card').forEach((c) => c.classList.toggle('playing', form === state.form && set.key === state.vset && +c.dataset.voice === n));
    $$('.vg-item[data-vguide]').forEach((c) => c.classList.toggle('playing', form === state.form && set.key === 'default' && +c.dataset.vguide === n));
    // 字幕：等声音真正响起来（'playing'）才滑出；卡拉 OK 式逐字点亮
    const sub = $('#subtitle');
    sub.innerHTML = `<img src="${f.avatar}" alt="" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="this.style.visibility='hidden'"><div><div class="st-t">${esc(f.name)} · ${esc(v[1])}${set.key !== 'default' ? ` · ${esc(set.name)}` : ''} · ${lang.toUpperCase()}</div><div class="st-x">${V.spans(v[2], n)}</div></div><button class="icon-btn" type="button" data-act="voice-stop" aria-label="停止">${A.icon('pause')}</button><span class="prog"></span>`;
    clip.chars = $$('.st-x span', sub);
    applyVoiceMode(false, form);
    if (form === state.form) deckSync(clip);
    V.analyze(url).then((res) => {
      if (!res) return;
      // 卡片声纹换成真实的响度轮廓（之后重绘列表也沿用）
      voiceEnv.set(url, res.env);
      if (form === state.form && set.key === state.vset) V.cardEnv($(`.vc-card[data-voice="${n}"]`), res.env);
      if (voiceClip !== clip) return;
      clip.res = res;
      if (form === state.form && voiceLast === clip && deckPaint) deckPaint.setWave(res.env, n);
    });
    AUDIO.playVoice(url, (ev) => onVoiceEvent(clip, ev));
  }
  /** 逐字点亮（字幕与播放器同步）。读唇模式：嘴唇动起来，字才往下浮现 */
  function lightTo(clip, k, lv) {
    const len = clip.chars.length;
    let m = Math.min(len, Math.ceil(k * len * 1.08));
    if (AUDIO.voiceMute && k < 0.995 && lv < 0.1) m = Math.min(m, clip.lit);
    for (; clip.lit < m; clip.lit++) {
      clip.chars[clip.lit].classList.add('lit');
      if (clip.dchars[clip.lit]) clip.dchars[clip.lit].classList.add('lit');
    }
  }
  /** 进度条与播放头（字幕、播放器波形、卡片底边）：交给合成器按剩余时长走，暂停 / 跳转 / 缓冲后再对齐 */
  function voiceProgress(clip, playing, k) {
    const a = AUDIO.voice, dur = a.duration || (clip.res && clip.res.dur) || 0;
    if (k == null) k = dur ? a.currentTime / dur : 0;
    const list = [[$('#subtitle .prog'), 'bar']];
    if (clip.card && clip.card.isConnected) list.push([$('.vc-prog', clip.card), 'bar']);
    V.progress(list, k, dur, playing);
    if (voiceLast === clip && deckPaint) deckPaint.progress(k, dur, playing);
  }
  function onVoiceEvent(clip, ev) {
    if (voiceClip !== clip) return;
    const sub = $('#subtitle'), here = clip.form === state.form && voiceLast === clip;
    if (ev === 'playing') {
      if (!clip.started) voiceMarkHeard(clip);
      clip.started = true;
      sub.classList.add('on');
      if (here) deckState('playing');
      voiceProgress(clip, true);
      voiceLoop(clip);
      return;
    }
    if (ev === 'pause') {
      cancelAnimationFrame(voiceRaf);
      voiceRaf = 0;
      voiceProgress(clip, false);
      if (here) deckState('paused');
      return;
    }
    if (ev !== 'end' && ev !== 'error') return;
    cancelAnimationFrame(voiceRaf);
    voiceRaf = 0;
    const natural = ev === 'end' && AUDIO.voice.ended;
    if (natural) lightTo(clip, 1, 1);
    voiceProgress(clip, false, natural ? 1 : undefined);
    voiceClip = null;
    state.playing = 0;
    $$('.vc-card.playing, .vg-item.playing').forEach((c) => c.classList.remove('playing'));
    // 没加载出来：不提示，字幕直接收起；正常播完则留一小会儿
    if (ev === 'error') sub.classList.remove('on');
    else setTimeout(() => { if (!state.playing) sub.classList.remove('on'); }, 900);
    if (here) deckState(ev === 'error' || !clip.started ? 'idle' : natural ? 'done' : 'stopped');
    // 连播：播完接着下一条（只在语音区当前这组里）
    if (natural && state.vauto && clip.form === state.form && clip.set.key === state.vset) {
      setTimeout(() => { if (!state.playing && !voiceClip) voiceStep(1, clip.n); }, 650);
    }
  }
  /** 播放中逐帧（最多约 60 次/秒）：逐字点亮、口型、播放器的光环与频谱（只在播放器可见时画）。进度条不在这里，见 voiceProgress */
  function voiceLoop(clip) {
    cancelAnimationFrame(voiceRaf);
    const a = AUDIO.voice;
    let prev = 0, meter = null, meterLv = -1;
    const tick = (now) => {
      voiceRaf = requestAnimationFrame(tick);
      if (voiceClip !== clip || a.paused) { cancelAnimationFrame(voiceRaf); voiceRaf = 0; return; }
      if (now - prev < 15) return; // 高刷新率屏幕上不必每帧都算
      prev = now;
      const t = a.currentTime, dur = a.duration || (clip.res && clip.res.dur) || 0;
      const k = dur ? Math.min(1, t / dur) : 0;
      const lv = clip.res ? V.levelAt(clip.res, t) : V.synthLevel(t);
      lightTo(clip, k, lv);
      if (t > 0) talkers().forEach((p) => p.talk(lv));
      if (voiceVis && voiceLast === clip && deckPaint) {
        deckPaint.frame(t, dur, lv, clip.res, AUDIO.voiceSim);
        const c = clip.card;
        if (c && c.isConnected) {
          if (!meter || !c.contains(meter)) meter = $('.vc-meter', c);
          const q = Math.round(lv * 20);
          if (meter && q !== meterLv) { meterLv = q; meter.style.setProperty('--lv', (q / 20).toFixed(2)); }
        }
      }
    };
    voiceRaf = requestAnimationFrame(tick);
  }
  /** 真正出声时记为“已听”（存进本地，下次来还在）；卡片打勾，计数与进度条跟着走 */
  function voiceMarkHeard(clip) {
    if (voiceHeard.has(clip.key)) return;
    voiceHeard.add(clip.key);
    store.set('vheard', [...voiceHeard].slice(-400));
    if (clip.form !== state.form || clip.set.key !== state.vset) return;
    const c = $(`.vc-card[data-voice="${clip.n}"]`);
    if (c) c.classList.add('heard');
    const box = $('.vc-heard');
    if (box) {
      const total = clip.set.lines.length, n = clip.set.lines.filter((v) => voiceHeard.has(voiceKey(clip.form, clip.set.key, v[0]))).length;
      $('b', box).textContent = n;
      $('.vc-hm i', box).style.transform = `scaleX(${(n / total).toFixed(3)})`;
      if (n === total) box.classList.add('all');
    }
  }
  /** 上一条 / 下一条（当前列表里循环）；dir = 0：从当前（或待命时推荐的那一条）开始 */
  function voiceStep(dir, from) {
    const list = voiceList();
    if (!list.length) return;
    const cur = from ?? (voiceLast && voiceLast.form === state.form && voiceLast.set.key === state.vset ? voiceLast.n : null);
    const i = list.findIndex((v) => v[0] === cur);
    const cue = dir === 0 && i < 0 ? voiceCue() : null;
    const j = i < 0 ? Math.max(0, cue ? list.findIndex((v) => v[0] === cue.n) : 0) : (i + dir + list.length) % list.length;
    playVoice(list[j][0], state.form, state.vset);
    const c = $(`.vc-card[data-voice="${list[j][0]}"]`);
    if (c && voiceVis) { const r = c.getBoundingClientRect(); if (r.top < 80 || r.bottom > innerHeight) c.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); }
  }
  /** 播放器按钮：上一条 / 播放暂停 / 下一条 / 连播 / 模式 */
  function voiceTransport(k) {
    const a = AUDIO.voice;
    if (k === 'prev' || k === 'next') { voiceStep(k === 'prev' ? -1 : 1); return; }
    if (k === 'toggle') {
      if (voiceClip && !a.paused) AUDIO.pauseVoice();
      else if (voiceClip && voiceClip.started && AUDIO.resumeVoice()) { /* 继续：'playing' 会重新启动逐帧更新 */ }
      else if (voiceLast && voiceLast.form === state.form && voiceLast.set.key === state.vset) playVoice(voiceLast.n, state.form, state.vset);
      else voiceStep(0);
      return;
    }
    if (k === 'auto') {
      state.vauto = !state.vauto;
      store.set('vauto', state.vauto);
      $('.vc-deck [data-vt="auto"]')?.setAttribute('aria-pressed', state.vauto);
      return;
    }
    if (k === 'mode') {
      if (state.form === 'base') state.vsim = !state.vsim; else state.vlip = !state.vlip;
      applyVoiceMode(true);
      const on = voiceModeOn();
      if (on) toast(state.form === 'base' ? '听觉模拟：声音像隔着一层厚玻璃，字句时有时无。' : '读唇模式：声音关掉了——看她的嘴唇。');
      if (on && !voiceClip) voiceStep(0);
    }
  }
  /** 拖动 / 点击波形跳转；左右方向键 ±1 秒 */
  function voiceSeek(k) {
    const a = AUDIO.voice, clip = voiceClip;
    if (!clip || !clip.started || !a.duration) return;
    k = clamp(k, 0, 0.999);
    a.currentTime = k * a.duration;
    clip.lit = 0;
    clip.chars.forEach((s) => s.classList.remove('lit'));
    clip.dchars.forEach((s) => s.classList.remove('lit'));
    lightTo(clip, k, 1);
    voiceProgress(clip, !a.paused, k);
    if (deckPaint && voiceLast === clip) deckPaint.frame(a.currentTime, a.duration, 0, clip.res, AUDIO.voiceSim);
  }
  function setVoiceLang(l) {
    const set = voiceSet();
    if (!set.langs.includes(l)) return;
    state.lang = l;
    store.set('lang', l);
    $$('.vd-lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === l));
    if (voiceClip && voiceClip.form === state.form) { const c = voiceClip; voiceClip = null; playVoice(c.n, c.form, c.set.key); }
  }
  function setVoiceSet(k) {
    if (k === state.vset) return;
    state.vset = k;
    const set = voiceSet(), eff = voiceLang(set);
    $$('.vd-lang button').forEach((b) => { b.disabled = !set.langs.includes(b.dataset.lang); b.classList.toggle('on', b.dataset.lang === eff); });
    renderVoiceList();
    observeReveals();
  }

  /** 画廊的事件只绑一次：#gallery 与 #lightbox 两个元素本身不会被重绘替换 */
  function galAuto() {
    const sec = $('#gallery');
    // 自动轮播：当前缩略图的进度条动画走完 = 翻页
    sec.addEventListener('animationend', (e) => {
      if (e.animationName !== 'galProg') return;
      const b = e.target.closest('.gst-i.on');
      if (!b) return;
      const g = b.closest('.gal');
      if (galAutoOn && galNear && state.entered && !document.hidden && $('#lightbox').hidden && !g.classList.contains('wait')) { setGallery(state.gal + 1, 1); return; }
      galBarReset(); // 条件不满足（离屏、加载页、预览中……）：进度条从头再走
    });
    sec.addEventListener('click', (e) => {
      const g = e.target.closest('[data-g]');
      if (g) {
        const a = g.dataset.g;
        if (a === 'prev' || a === 'next') { galManual = true; setGallery(state.gal + (a === 'next' ? 1 : -1), a === 'next' ? 1 : -1); }
        else if (a === 'full') openLightbox(state.gal);
        else if (a === 'play') galSetAuto(!galAutoOn);
        else if (a === 'dyn') galToDyn();
        return;
      }
      const gi = e.target.closest('[data-gi]');
      if (gi) { const i = +gi.dataset.gi; if (i !== state.gal) { galManual = true; setGallery(i, i > state.gal ? 1 : -1); } return; }
      const cp = e.target.closest('[data-cmp]');
      if (cp) { cmpSet(cp.dataset.cmp); return; }
      const cz = e.target.closest('[data-cmpz]');
      if (cz) cmpSetZoom(+cz.dataset.cmpz);
    });
    sec.addEventListener('keydown', (e) => {
      const t = e.target;
      if (!t.closest || !(t.matches('.gal-stage') || t.closest('.gal-strip'))) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        galManual = true;
        const d = e.key === 'ArrowRight' ? 1 : -1;
        setGallery(state.gal + d, d);
        if (t.closest('.gal-strip')) $(`.gst-i[data-gi="${state.gal}"]`)?.focus({ preventScroll: true });
      } else if ((e.key === 'Enter' || e.key === ' ') && t.matches('.gal-stage')) { e.preventDefault(); openLightbox(state.gal); }
    });
    lbInit();
  }
  /** 当前缩略图的进度条从头计时（直接改 CSS 动画的时间，不必移除重加类名触发重排） */
  function galBarReset() {
    const bar = $('.gst-i.on .gst-bar');
    const a = bar && bar.getAnimations ? bar.getAnimations()[0] : null;
    if (a) a.currentTime = 0;
  }
  function galSetAuto(on) {
    galAutoOn = on && !reduce;
    $('.gal')?.classList.toggle('paused', !galAutoOn);
    const b = $('.gal-play');
    if (b) { b.setAttribute('aria-pressed', galAutoOn); b.innerHTML = A.icon(galAutoOn ? 'pause' : 'play'); }
    toast(galAutoOn ? '自动轮播 · 开' : '自动轮播 · 关');
  }

  /* ---------------------------------------------------- 全屏预览：滚轮 / 双指缩放、拖拽平移、滑动与键盘切换 */
  const LBV = { s: 1, x: 0, y: 0, nat: [1, 1], ptr: new Map(), pinch: null, start: null, tapT: 0, touchT: 0, back: null, relive: false, tok: 0 };
  function openLightbox(i) {
    const list = galleryItems();
    const lb = $('#lightbox');
    const first = lb.hidden;
    const dir = first ? 0 : Math.sign(i - state.lb);
    if (!first && (i + list.length) % list.length === state.lb) return;
    state.lb = (i + list.length) % list.length;
    if (first) {
      LBV.back = document.activeElement;
      lb.setAttribute('aria-label', '立绘预览');
      lb.innerHTML = `
        <div class="lb-view"><div class="lb-pan"><div class="lb-fig"></div></div><span class="lb-load mono" aria-hidden="true">HD · LOADING</span></div>
        <div class="lb-zoom" role="group" aria-label="缩放">
          <button type="button" class="icon-btn" data-lb="out" aria-label="缩小（-）">${gIco('minus')}</button>
          <output class="lb-pct mono">100%</output>
          <button type="button" class="icon-btn" data-lb="in" aria-label="放大（+）">${gIco('plus')}</button>
          <button type="button" class="icon-btn" data-lb="fit" aria-label="适应窗口（0）">${gIco('fit')}</button>
        </div>
        <aside class="lb-side">
          <div class="lb-info" aria-live="polite"></div>
          <div class="lb-nav"><button class="btn btn-ghost" type="button" data-lb="prev">${A.icon('arrow', 'flip')}上一幅</button><button class="btn btn-primary" type="button" data-lb="next">下一幅${A.icon('arrow')}</button></div>
          <p class="lb-keys mono"><kbd>滚轮</kbd>缩放<kbd>拖拽</kbd>平移<kbd>双击</kbd>放大<kbd>← →</kbd>切换<kbd>Esc</kbd>关闭</p>
        </aside>
        <div class="lb-strip">${list.map((o, k) => `<button type="button" class="lb-th${o.kv ? ' is-kv' : ''}" data-lbi="${k}" aria-label="${esc(o.name)}"><img src="${thumbUrl(o.src, o.kv ? 360 : 256)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false"></button>`).join('')}</div>
        <button class="icon-btn lb-close" type="button" data-lb="close" aria-label="关闭（Esc）">${A.icon('close')}</button>`;
      lb.hidden = false;
      document.body.style.overflow = 'hidden';
      lbStage(true);
    }
    lbShow(list, dir);
    if (first) $('.lb-close', lb).focus({ preventScroll: true });
  }
  function lbShow(list, dir) {
    const lb = $('#lightbox');
    if (lb.hidden) return;
    const o = list[state.lb];
    const tok = ++LBV.tok;
    LBV.nat = [1, 1];
    lbZoom(1, 0, 0, false);
    const mk = (cls, cors) => {
      const im = new Image();
      im.className = cls;
      im.decoding = 'async';
      im.draggable = false;
      im.referrerPolicy = 'no-referrer';
      if (cors) im.crossOrigin = 'anonymous';
      im.onerror = () => { if (im.crossOrigin) { im.removeAttribute('crossorigin'); im.src = im.src; } else im.classList.add('bad'); };
      return im;
    };
    // 先放舞台用的缩图（多半已在缓存里，立刻有画面），原图下载好再淡入
    const lo = mk('lb-lo', true), hi = mk('lb-hi', false);
    lo.alt = `${o.who} · ${o.name}`;
    hi.alt = '';
    lo.onload = () => { if (tok === LBV.tok && LBV.nat[0] === 1) LBV.nat = [lo.naturalWidth, lo.naturalHeight]; };
    galLoad(o).then((im) => { if (tok === LBV.tok && im) { if (!im.crossOrigin) lo.removeAttribute('crossorigin'); lo.src = im.src; } });
    lb.classList.add('hd-wait');
    hi.onload = () => { if (tok !== LBV.tok) return; LBV.nat = [hi.naturalWidth, hi.naturalHeight]; hi.classList.add('on'); lb.classList.remove('hd-wait'); };
    hi.onerror = () => { hi.classList.add('bad'); if (tok === LBV.tok) lb.classList.remove('hd-wait'); };
    const cached = imgCache.get(o.src); // 加载页下载过的原图（blob），直接用
    (cached ? cached.then((im) => (im ? im.src : o.src), () => o.src) : Promise.resolve(o.src)).then((src) => { if (tok === LBV.tok) hi.src = src; });
    const fig = $('.lb-fig', lb);
    const pic = document.createElement('div');
    pic.className = 'lb-pic';
    pic.append(lo, hi);
    const olds = [...fig.children];
    fig.appendChild(pic);
    const anim = !reduce;
    olds.forEach((el) => {
      if (!anim || !dir) { el.remove(); return; }
      el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translate3d(${-dir * 50}px, 0, 0)` }], { duration: 320, easing: 'ease-in', fill: 'forwards' }).onfinish = () => el.remove();
    });
    if (anim) pic.animate([{ opacity: 0, transform: `translate3d(${dir * 70}px, 0, 0) scale(${dir ? 1 : 0.94})` }, { opacity: 1, transform: 'none' }], { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)' });
    const file = decodeURIComponent(o.src.split('?')[0].split('/').pop());
    $('.lb-info', lb).innerHTML = `
      <div class="gc-head">${galHeadTags(o)}<span class="lb-no mono">${pad2(state.lb + 1)} / ${pad2(list.length)}</span></div>
      <p class="gc-series mono">${esc(o.brand && !o.kv ? `${o.brand} · ${o.series}` : o.series)}</p>
      <h3 class="lb-name">${esc(o.name)}</h3>
      <p class="gc-who">${esc(o.who)}</p>
      <p class="lb-desc">${esc(o.desc)}</p>
      ${o.note ? `<p class="gc-note" style="--oc:${o.color}">${esc(o.note)}</p>` : ''}
      ${galFeat(o)}
      ${galMeta(o).replace('<dd class="gc-mode">原画</dd>', `<dd>${o.kv ? '活动原图' : '原画 · 可缩放'}</dd>`)}
      <a class="lb-src" href="${encodeURI('https://prts.wiki/w/文件:' + file)}" target="_blank" rel="noopener">在 PRTS 查看原始文件 ↗</a>`;
    $$('.lb-th', lb).forEach((b) => {
      const on = +b.dataset.lbi === state.lb;
      b.classList.toggle('on', on);
      if (on) { b.setAttribute('aria-current', 'true'); const s = b.parentNode; if (s.scrollWidth > s.clientWidth) s.scrollTo({ left: b.offsetLeft - (s.clientWidth - b.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' }); } else b.removeAttribute('aria-current');
    });
    // 空闲时预取左右两幅的缩图
    idle(() => {
      if (tok !== LBV.tok) return;
      [-1, 1].forEach((d) => { const n = list[(state.lb + d + list.length) % list.length]; galLoad(n); });
    });
  }
  function closeLightbox() {
    const lb = $('#lightbox');
    if (lb.hidden) return;
    LBV.tok++;
    LBV.ptr.clear();
    LBV.pinch = null;
    lb.hidden = true;
    lb.innerHTML = '';
    lb.classList.remove('zoomed', 'hd-wait');
    document.body.style.overflow = '';
    // 预览里翻到了别的立绘：舞台跟过去
    if (state.lb !== state.gal && $('.gal-stage')) { LBV.relive = false; lbStage(false); setGallery(state.lb, 0); }
    else lbStage(false);
    const back = LBV.back;
    LBV.back = null;
    if (back && back.isConnected && back.focus) back.focus({ preventScroll: true });
  }
  /** 预览打开期间，被整个盖住的舞台停止绘制（分层动态、官方动态、活立绘） */
  function lbStage(on) {
    $('.gal')?.classList.toggle('hold', on);
    if (galPup) galPup.pause(on);
    if (galDyn && galDyn.setActive) galDyn.setActive(!on);
    const st = $('.gal-stage');
    if (on && galLive && st && st.classList.contains('live')) { galLive.hide(); LBV.relive = true; }
    else if (!on && LBV.relive) {
      LBV.relive = false;
      const o = galleryItems()[state.gal];
      if (st && o) { st.classList.remove('live'); galLiveSet(o, galTok); }
    }
  }
  /** 缩放 / 平移（s ≥ 1；平移量限制在放大后的画面不离开视口） */
  function lbZoom(s, x, y, anim) {
    const lb = $('#lightbox');
    const fig = $('.lb-fig', lb), pan = $('.lb-pan', lb);
    if (!fig || !pan) return;
    const W = fig.clientWidth, H = fig.clientHeight;
    s = clamp(s, 1, 6);
    const ar = LBV.nat[0] / LBV.nat[1] || 1;
    const fw = Math.min(W, H * ar), fh = fw / ar;
    const mx = Math.max(0, (fw * s - W) / 2 + 24), my = Math.max(0, (fh * s - H) / 2 + 24);
    LBV.s = s;
    LBV.x = s > 1.001 ? clamp(x, -mx, mx) : 0;
    LBV.y = s > 1.001 ? clamp(y, -my, my) : 0;
    pan.classList.toggle('anim', !!anim);
    pan.style.transform = `translate3d(${LBV.x.toFixed(1)}px, ${LBV.y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
    lb.classList.toggle('zoomed', s > 1.01);
    const pct = $('.lb-pct', lb);
    if (pct) pct.textContent = Math.round(s * 100) + '%';
  }
  /** 以某一点（页面坐标）为中心缩放；不给坐标则以画面中心 */
  function lbZoomAt(ns, cx, cy, anim) {
    const v = $('#lightbox .lb-view');
    if (!v) return;
    const r = v.getBoundingClientRect();
    const px = cx == null ? 0 : cx - (r.left + r.width / 2), py = cy == null ? 0 : cy - (r.top + r.height / 2);
    ns = clamp(ns, 1, 6);
    const k = ns / LBV.s;
    lbZoom(ns, px - (px - LBV.x) * k, py - (py - LBV.y) * k, anim);
  }
  function lbInit() {
    const lb = $('#lightbox');
    lb.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lb]');
      if (b) {
        const a = b.dataset.lb;
        if (a === 'close') closeLightbox();
        else if (a === 'prev' || a === 'next') openLightbox(state.lb + (a === 'next' ? 1 : -1));
        else if (a === 'in' || a === 'out') lbZoomAt(LBV.s * (a === 'in' ? 1.6 : 1 / 1.6), null, null, true);
        else if (a === 'fit') lbZoom(1, 0, 0, true);
        return;
      }
      const th = e.target.closest('[data-lbi]');
      if (th) openLightbox(+th.dataset.lbi);
    });
    lb.addEventListener('wheel', (e) => {
      if (!e.target.closest('.lb-view')) return;
      e.preventDefault();
      lbZoomAt(LBV.s * Math.exp(-e.deltaY * (e.deltaMode ? 0.06 : 0.0022)), e.clientX, e.clientY, false);
    }, { passive: false });
    lb.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.lb-view') || performance.now() - LBV.touchT < 700) return;
      if (LBV.s > 1.05) lbZoom(1, 0, 0, true); else lbZoomAt(2.5, e.clientX, e.clientY, true);
    });
    lb.addEventListener('pointerdown', (e) => {
      const v = e.target.closest('.lb-view');
      if (!v || e.button > 0) return;
      if (e.pointerType === 'touch') LBV.touchT = performance.now();
      v.setPointerCapture(e.pointerId);
      LBV.ptr.set(e.pointerId, [e.clientX, e.clientY]);
      if (LBV.ptr.size === 2) { const [a, b] = [...LBV.ptr.values()]; LBV.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s: LBV.s }; }
      if (LBV.ptr.size === 1) LBV.start = [e.clientX, e.clientY, performance.now()];
      v.classList.add('grab');
    });
    lb.addEventListener('pointermove', (e) => {
      const p = LBV.ptr.get(e.pointerId);
      if (!p) return;
      LBV.ptr.set(e.pointerId, [e.clientX, e.clientY]);
      if (LBV.ptr.size >= 2 && LBV.pinch) {
        const [a, b] = [...LBV.ptr.values()];
        lbZoomAt((LBV.pinch.s * Math.hypot(a[0] - b[0], a[1] - b[1])) / LBV.pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, false);
        return;
      }
      if (LBV.s > 1.01) lbZoom(LBV.s, LBV.x + e.clientX - p[0], LBV.y + e.clientY - p[1], false);
    });
    const up = (e) => {
      if (!LBV.ptr.has(e.pointerId)) return;
      LBV.ptr.delete(e.pointerId);
      if (LBV.ptr.size < 2) LBV.pinch = null;
      if (LBV.ptr.size) { LBV.start = null; return; }
      $('#lightbox .lb-view')?.classList.remove('grab');
      const st = LBV.start;
      LBV.start = null;
      if (!st || e.type !== 'pointerup') return;
      const dx = e.clientX - st[0], dy = e.clientY - st[1], dt = performance.now() - st[2];
      // 未放大时横向滑动：切换上一幅 / 下一幅
      if (LBV.s <= 1.01 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) { openLightbox(state.lb + (dx < 0 ? 1 : -1)); return; }
      // 触屏双击：放大 / 复原
      if (e.pointerType === 'touch' && Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 260) {
        const now = performance.now();
        if (now - LBV.tapT < 320) { LBV.tapT = 0; if (LBV.s > 1.05) lbZoom(1, 0, 0, true); else lbZoomAt(2.5, e.clientX, e.clientY, true); }
        else LBV.tapT = now;
      }
    };
    lb.addEventListener('pointerup', up);
    lb.addEventListener('pointercancel', up);
    // 键盘：+ / - / 0 缩放，Tab 焦点留在预览里（← → Esc 由全局键盘处理）
    window.addEventListener('keydown', (e) => {
      if (lb.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); lbZoomAt(LBV.s * 1.5, null, null, true); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); lbZoomAt(LBV.s / 1.5, null, null, true); }
      else if (e.key === '0') lbZoom(1, 0, 0, true);
      else if (e.key === 'Tab') {
        const fs = $$('button, a[href], [tabindex]:not([tabindex="-1"])', lb).filter((x) => x.offsetParent !== null);
        if (!fs.length) return;
        const a = fs[0], z = fs[fs.length - 1], cur = document.activeElement;
        if (!lb.contains(cur)) { e.preventDefault(); a.focus(); }
        else if (e.shiftKey && cur === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && cur === z) { e.preventDefault(); a.focus(); }
      }
    });
  }

  /* 足迹（登场记录、年表丝带、关系星图）在 js/journey.js（window.JOURNEY） */
  function renderJourney() { const el = $('#journey'); if (el && window.JOURNEY) JOURNEY.render(el, state.form, { head, toast }); }
  /* 05 影像：原创 MV 三部曲「三个夏天」的放映厅在 js/mv/player.js（window.MVP）。切换形态时只换文字，正在放映的舞台原封不动 */
  function renderMV() { const el = $('#mv'); if (el && window.MVP) MVP.render(el, state.form, { head, jumpTo }); }

  /* 火山图鉴 / 冷知识 / 页脚的内容与交互在 js/volcano.js（window.VOLC） */
  function renderVolcano() {
    const el = $('#volcano');
    el.innerHTML = head('11', 'VOLCANOLOGY', '火山图鉴', D.volcano.byForm[state.form].desc) + (window.VOLC ? VOLC.html(state.form) : '');
    if (window.VOLC) VOLC.mount(el, state.form);
  }
  function showSpot(i) { if (window.VOLC) VOLC.spot(i); }

  /* ====================================================
   * 小羊（舞台、原创小羊与互动都在 sheep.js）
   * 术师：小黑羊饲育日志；医疗：看不见的小羊。每次重绘先拆掉上一次的计时器与监听
   * ==================================================== */
  let sheepCtl = null;
  function renderSheep() {
    if (sheepCtl) { sheepCtl.destroy(); sheepCtl = null; }
    const S = F().sheep || {};
    $('#sheep').innerHTML = head('10', S.en || 'LITTLE SHEEP', S.title || '小羊观察日志', S.desc || '') + (window.SHEEP ? SHEEP.html(state.form, D) : '');
    if (window.SHEEP) sheepCtl = SHEEP.mount($('#sheep'), state.form, D, { fx: FX, audio: AUDIO, toast, voice: (n) => playVoice(n, state.form) });
  }

  function renderTrivia() {
    // 当前形态专属的在前（带职业标签），两形态共有的在后；筛选、随机翻、全部翻开见 VOLC.triviaMount
    const el = $('#trivia');
    el.innerHTML = head('12', 'TRIVIA', '冷知识', window.VOLC ? VOLC.triviaDesc(state.form) : '') + (window.VOLC ? VOLC.triviaHTML(state.form) : '');
    if (window.VOLC) VOLC.triviaMount(el, state.form);
  }

  function renderFooter() {
    const el = $('#footer');
    el.innerHTML = A.divider() + (window.VOLC ? VOLC.footerHTML(state.form) : '');
    if (window.VOLC) VOLC.footerMount(el);
  }

  function renderAll() {
    renderHero();
    renderTheater();
    renderCombat();
    renderStory();
    renderJourney();
    renderMV();
    renderGallery();
    renderProfile();
    renderFiles();
    renderVoice();
    renderSheep();
    renderVolcano();
    renderTrivia();
    renderAppendix();
    renderFooter();
    observeReveals();
  }

  /* ====================================================
   * 首屏小人与形态切换
   * ==================================================== */
  let galLive = null, galPup = null, heroLive = null, heroPup = null, heroTok = 0;
  const heroRetry = new Map(); // 立绘地址 → 已悄悄重试的次数
  const heroRig = () => (F().rig || {})[state.elite] || null;
  // 已完成分层绑定（assets/puppet/<key>/）的立绘；其余立绘退回整图变形（live.js）
  const PUP_KEYS = new Set(['base-e0', 'base-e2', 'alter-e0', 'base-s1', 'base-s2']);

  /* ---------- 口型同步：音量包络由 voice.js 的 VOICE.analyze 离线算出，播放循环按进度驱动嘴巴 ---------- */
  /** 当前应当“开口说话”的人偶（首屏、画廊中与语音同一形态的那个） */
  function talkers() {
    const list = [];
    if (pupOn()) list.push(heroPup);
    const gs = $('.gal-stage');
    if (galPup && gs && gs.classList.contains('pup') && galPup.key && galPup.key.startsWith(state.form)) list.push(galPup);
    return list;
  }
  const pupOn = () => !!(heroPup && $('.hv-art') && $('.hv-art').classList.contains('pup'));
  /** 当前负责首屏立绘动作的控制器：分层绑定优先 */
  const heroCtl = () => (pupOn() ? heroPup : heroLive);
  /** 换上原画立绘，并挂上这张图的手工绑定；较早发起、较晚完成的请求不会覆盖新立绘 */
  async function setHeroSrc(src, opts = {}) {
    const img = $('.hv-img'), vis = $('.hero-visual'), art = $('.hv-art');
    const tok = ++heroTok;
    const pk = `${state.form}-${state.elite}`;
    if (!opts.noPup && window.PUPPET && PUP_KEYS.has(pk)) return setHeroPuppet(src, pk, tok, opts);
    const loaded = await loadImg(src);
    if (tok !== heroTok) return false;
    if (!loaded) {
      // 没加载出来：不显示任何提示，隔一会儿悄悄再试（期间没有换过立绘才试）
      vis.classList.add('failed');
      imgCache.delete(src);
      const n = heroRetry.get(src) || 0;
      if (n < 4) {
        heroRetry.set(src, n + 1);
        setTimeout(() => { if (tok === heroTok) setHeroSrc(src); }, [5, 15, 40, 90][n] * 1000);
      }
      return false;
    }
    heroRetry.delete(src);
    vis.classList.remove('failed');
    if (loaded.crossOrigin) img.crossOrigin = 'anonymous';
    else img.removeAttribute('crossorigin');
    img.referrerPolicy = 'no-referrer';
    // 加载页已下载过的立绘是 blob URL，直接复用，不再发第二次请求
    img.src = loaded.src || src;
    drawShade(loaded);
    // decode() 在页面不绘制时（包括视图过渡的更新阶段）会一直等下一帧，因此与超时赛跑；过渡中直接跳过
    if (!opts.waitPup) {
      try { await Promise.race([img.decode(), wait(700)]); } catch (e) { /* 未变化的 src 可能被拒绝 decode */ }
    }
    if (tok !== heroTok) return false;
    art.classList.remove('pup', 'live');
    // 整图变形（没有分层绑定、或绑定加载失败时的退路）
    const liveFallback = () => {
      const live = !!(heroLive && loaded.crossOrigin && heroLive.set(loaded, state.form));
      if (live) heroLive.setRig(heroRig());
      art.classList.toggle('live', live);
    };
    heroPups.forEach((p) => p.pause(true));
    liveFallback();
    return true;
  }
  /**
   * 有分层绑定的立绘：图集在本站，直接加载显示，不必先等资源站上的原图（资源站慢时首屏会一直空着）。
   * 原图在后台加载，只用来画地面投影；绑定载入失败时才退回原图 + 整图变形。
   * 已在后台预载好的实例直接切过去，不必再上传图集。
   */
  async function setHeroPuppet(src, pk, tok, opts) {
    const img = $('.hv-img'), vis = $('.hero-visual'), art = $('.hv-art');
    vis.classList.remove('failed');
    art.classList.remove('pup', 'live');
    if (heroLive) heroLive.hide();
    const next = heroPupFor(pk);
    let settled = false; // 已经先返回了（视图过渡限时）：之后绑定才失败，就在这里退回原图
    const pupReady = (next.ok && next.key === pk ? Promise.resolve(true) : next.load(pk)).then((ok) => {
      if (tok !== heroTok) return false;
      if (!ok) { next.pause(true); if (settled) setHeroSrc(src, { noPup: true }); return false; }
      heroPups.forEach((p) => { if (p !== next) p.pause(true); });
      heroPup = next;
      next.pause(false);
      art.classList.add('pup');
      hud();
      renderHeroActs(); // 动作栏按这张绑定的能力刷新（例如有没有「挥手」）
      return true;
    });
    loadImg(src).then((loaded) => {
      if (tok !== heroTok || !loaded) return;
      if (loaded.crossOrigin) img.crossOrigin = 'anonymous';
      else img.removeAttribute('crossorigin');
      img.referrerPolicy = 'no-referrer';
      img.src = loaded.src || src;
      drawShade(loaded);
    });
    const ok = await (opts.waitPup ? Promise.race([pupReady, wait(opts.waitPup).then(() => true)]) : pupReady);
    settled = true;
    if (tok !== heroTok) return false;
    if (!ok) return setHeroSrc(src, { ...opts, noPup: true }); // 绑定没载入：退回原图
    return true;
  }
  /** 首屏分层绑定实例池：当前形态 + 预载的另一形态，最多两个（各自持有已上传的图集） */
  const heroPups = new Map();
  function heroPupFor(key) {
    let p = heroPups.get(key);
    if (p) { heroPups.delete(key); heroPups.set(key, p); return p; }
    if (heroPups.size >= 2) {
      for (const [k0, p0] of heroPups) { if (p0 !== heroPup) { p0.destroy(); heroPups.delete(k0); break; } }
    }
    // amp：动作幅度 1.5 倍（整体倾斜、起跳加大）；pad：画布四周多留 14%，大幅倾斜、起跳时不会被切掉
    p = PUPPET.create($('.hv-art'), { pad: 0.14, amp: 1.5 });
    p.pause(true);
    heroPups.set(key, p);
    return p;
  }
  /** 后台预载另一形态的首屏分层绑定（解码 + 上传到显卡），切换时直接显示 */
  function prefetchOtherPuppet() {
    const pk = `${state.form === 'base' ? 'alter' : 'base'}-${state.elite}`;
    if (!window.PUPPET || !PUP_KEYS.has(pk)) return;
    const p = heroPupFor(pk);
    if (p.ok && p.key === pk) return;
    idle(() => p.load(pk).then(() => { if (p !== heroPup) p.pause(true); }));
  }
  /** 投影：把立绘压成黑色剪影、在小画布上模糊一次（静态，不占每帧开销） */
  function drawShade(im) {
    const c = $('.hv-shade');
    if (!c || !im || !im.naturalWidth) return;
    const S = 320;
    c.width = c.height = S;
    const g = c.getContext('2d');
    const s = Math.min(S / im.naturalWidth, S / im.naturalHeight);
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    const ok = 'filter' in g;
    if (ok) g.filter = 'brightness(0) blur(6px)';
    c.classList.toggle('css-blur', !ok);
    g.clearRect(0, 0, S, S);
    g.drawImage(im, (S - w) / 2, (S - h) / 2, w, h);
  }
  /** 立绘淡入，并缓慢推近；纯烬精英二随后换成官方动态立绘 */
  function showHero(entrance) {
    const art = $('.hv-art'), shade = $('.hv-shade');
    art.classList.remove('gone', 'pushin');
    shade.classList.remove('gone', 'pushin');
    void art.offsetWidth;
    art.classList.add('pushin');
    shade.classList.add('pushin');
    if (entrance) setTimeout(() => heroCtl() && heroCtl().act(entrance), 450);
    syncHeroDyn();
  }

  /* ---------- 官方动态立绘（仅纯烬精英二）：先显示手工绑定的原画，加载完成后交叉淡入 ---------- */
  let heroDyn = null;
  const heroWantsDyn = () => !!window.DYN && state.form === 'alter' && state.elite === 'e2';
  const heroDynOn = () => !!(heroDyn && $('.hv-dyn') && $('.hv-dyn').classList.contains('on'));
  function hideHeroDyn() {
    const host = $('.hv-dyn');
    if (host) host.classList.remove('on');
    $('.hv-art').classList.remove('under');
    $('.hero-visual').classList.remove('dyn-loading');
    if (heroDyn) heroDyn.setActive(false);
  }
  function syncHeroDyn() {
    if (!heroWantsDyn()) { hideHeroDyn(); renderHeroActs(); hud(); return; }
    const host = $('.hv-dyn'), vis = $('.hero-visual');
    if (!heroDyn) {
      heroDyn = DYN.create(host, { pad: 1.0 });
      heroDyn.onPoke = (x, y) => chibiPoked(host, $('.hv-bubble2'), x, y);
    }
    heroDyn.setActive(true);
    const show = () => {
      if (!heroWantsDyn()) return;
      vis.classList.remove('dyn-loading');
      host.classList.add('on');
      $('.hv-art').classList.add('under');
      // 官方动态立绘完全盖住下面的原画：停掉下层的逐帧绘制
      if (heroLive) heroLive.hide();
      heroPups.forEach((p) => p.pause(true));
      renderHeroActs();
      hud();
    };
    if (heroDyn.ready && heroDyn.key === 'e2') { show(); return; }
    vis.classList.add('dyn-loading');
    heroDyn.load('e2').then((ok) => { vis.classList.remove('dyn-loading'); if (ok) show(); });
  }
  /* ---------- 3D 漫步：程序化建模的 3D 人偶（点地面走过去、做各种动作、换时装） ---------- */
  let heroDoll = null, dollPt = [0, 0], can3dCache = null;
  function can3d() {
    if (can3dCache == null) {
      can3dCache = false;
      if (window.DOLL) {
        try {
          const g = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
          can3dCache = !!g;
          // 只是探测：用完立刻释放，别占着一个 WebGL 上下文
          const lose = g && g.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
        } catch (e) { can3dCache = false; }
      }
    }
    return can3dCache;
  }
  const dollOutfits = () => (window.DOLL ? DOLL.listOutfits(state.form) : []);
  const is3d = () => state.view === '3d' && can3d() && dollOutfits().length > 0;
  function doll3dKey() {
    const list = dollOutfits(), saved = store.get('skin3d.' + state.form, null);
    return list.some((o) => o.key === saved) ? saved : list.length ? list[0].key : null;
  }
  const skin3dButtons = () => dollOutfits().map((o) => `<button type="button" data-skin3d="${o.key}" class="${o.key === doll3dKey() ? 'on' : ''}">${o.name}</button>`).join('');
  function ensureDoll() {
    if (heroDoll || !can3d()) return heroDoll;
    const host = $('.hv-3d'), vis = $('.hero-visual');
    vis.classList.add('d3-loading');
    heroDoll = DOLL.create(host, { form: state.form, outfit: doll3dKey(), auto: true, radius: 1.1, view: { dist: 3.55, lookY: 0.74 } });
    host.addEventListener('pointerdown', (e) => { dollPt = [e.clientX, e.clientY]; }, true);
    heroDoll.on('poke', () => chibiPoked(host, $('.hv-bubble3'), dollPt[0], dollPt[1]));
    heroDoll.on('action', (id, phase) => $$('[data-hact]').forEach((b) => b.classList.toggle('on', phase === 'start' && b.dataset.hact === id)));
    heroDoll.on('fx', (name) => { if (name === 'cast') { BG.pulse(0.6); AUDIO.sfx(state.form === 'base' ? 'boom' : 'sparkle'); } });
    heroDoll.ready.then(() => {
      vis.classList.remove('d3-loading');
      renderHeroActs();
      hud();
    }).catch((e) => {
      // three.js 加载失败（离线 / CDN 不可用）：退回原画
      console.warn('[3D]', e);
      vis.classList.remove('d3-loading');
      heroDoll = null;
      can3dCache = false;
      applyView();
      renderHero();
    });
    if (/[?&]debug\b/.test(location.search)) window.__doll = heroDoll;
    return heroDoll;
  }
  /** 按当前视图切换首屏：3D 人偶 / 原画（含官方动态立绘） */
  function applyView() {
    const vis = $('.hero-visual');
    if (!vis) return;
    const on = is3d();
    vis.classList.toggle('mode-3d', on);
    if (on) {
      hideHeroDyn();
      ensureDoll();
    } else {
      syncHeroDyn();
    }
    renderHeroActs();
    hud();
  }
  function setView(v) {
    if (v === state.view) return;
    state.view = v;
    store.set('view', v);
    renderHero();
    applyView();
    AUDIO.sfx(state.form === 'base' ? 'whoosh' : 'sparkle');
  }
  function setSkin3d(key) {
    store.set('skin3d.' + state.form, key);
    $$('[data-skin3d]').forEach((b) => b.classList.toggle('on', b.dataset.skin3d === key));
    if (heroDoll) heroDoll.setOutfit(key).then(() => { renderHeroActs(); hud(); if (heroDoll.ok) heroDoll.act('spin'); });
    AUDIO.sfx('sparkle');
  }
  // 首屏动作栏：常用的排在前面，其余收进「更多」
  const DOLL_FIRST = ['wave', 'cast', 'spin', 'jump', 'listen', 'sit', 'dance', 'bow'];

  // 分层绑定的动作：前 7 个常驻，其余收进「更多」
  const RIG_ACTS = [['tilt', '歪头'], ['nod', '点头'], ['look', '张望'], ['wave', '挥手'], ['sway', '摇摆'], ['jump', '蹦跳'], ['swing', '挥杖'], ['cast', '施法'],
    ['hop', '跳一下'], ['shake', '摇头'], ['giggle', '偷笑'], ['shy', '害羞'], ['surprise', '吃惊'], ['think', '思考'], ['stretch', '伸懒腰'], ['dance', '律动']];
  const RIG_FIRST = 7;
  function renderHeroActs() {
    const box = $('.hv-acts');
    if (!box) return;
    if (is3d()) {
      const all = heroDoll && heroDoll.ok ? heroDoll.actions() : [];
      const first = DOLL_FIRST.map((id) => all.find((a) => a.id === id)).filter(Boolean);
      const rest = all.filter((a) => !first.includes(a));
      box.classList.remove('more');
      box.innerHTML = first.map((a) => `<button type="button" data-hact="${a.id}">${a.label}</button>`).join('')
        + (rest.length ? `<button type="button" class="more-btn" data-hact="__more">更多 ${rest.length}</button><div class="hv-acts-more">${rest.map((a) => `<button type="button" data-hact="${a.id}">${a.label}</button>`).join('')}</div>` : '');
      return;
    }
    // 「挥手」只给设置了 waveArm 的绑定；手臂没法单独切出来的绑定用法杖打招呼（waveArm 就是法杖骨骼），按钮改叫「打招呼」
    const rp = (pupOn() && heroPup.rig && heroPup.rig.params) || {};
    // 上臂与前臂是同一根骨骼 = 挥的是道具（法杖、阳伞），不是手
    const waveLabel = rp.waveArm && (rp.waveArm === rp.staffBone || rp.waveArm === rp.waveFore) ? '打招呼' : '挥手';
    const list = heroDynOn() ? heroDyn.actions().map((a) => [a.id, a.label])
      : RIG_ACTS.filter(([id]) => id !== 'wave' || rp.waveArm).map(([id, l]) => [id, id === 'wave' ? waveLabel : l]);
    const first = list.slice(0, RIG_FIRST), rest = list.slice(RIG_FIRST);
    const btn = ([id, l]) => `<button type="button" data-hact="${id}">${l}</button>`;
    box.classList.remove('more');
    box.innerHTML = first.map(btn).join('')
      + (rest.length ? `<button type="button" class="more-btn" data-hact="__more">更多 ${rest.length}</button><div class="hv-acts-more">${rest.map(btn).join('')}</div>` : '');
  }
  async function swapHero(entrance) {
    const art = $('.hv-art');
    art.classList.add('gone');
    $('.hv-shade').classList.add('gone');
    const [ok] = await Promise.all([setHeroSrc(F().art[state.elite]), wait(reduce ? 0 : 320)]);
    if (ok) showHero(entrance);
  }
  const POKE_LINES = { base: [34, 2, 3, 36, 21, 22, 28], alter: [34, 2, 4, 36, 22, 9, 31] };
  let pokeIdx = 0;
  function pokeHero(e) {
    const art = $('.hv-art');
    if (art.classList.contains('gone')) return;
    // 分层绑定：戳头会开心地眯眼（偶尔眨单眼），戳身体会跳一下；连戳三下吓一跳再摇头，戳到第五下害羞地别过脸
    let mood = null;
    if (pupOn()) mood = heroPup.poke(e.clientX, e.clientY, 0.7);
    else if (heroLive) { heroLive.poke(0.7); heroLive.act('hop'); setTimeout(() => heroLive.act('blink'), 120); }
    chibiPoked(art, $('.hv-bubble'), e.clientX, e.clientY);
    if (mood === 'annoyed') $('.hv-bubble').textContent = '别、别一直戳啦！';
    else if (mood === 'shy') $('.hv-bubble').textContent = '唔……前辈！';
  }
  function heroAct(name) {
    if (name === '__more') { $('.hv-acts').classList.toggle('more'); return; }
    if (is3d()) {
      if (heroDoll && heroDoll.ok) heroDoll.act(name);
      $('.hv-acts').classList.remove('more');
      return;
    }
    if (heroDynOn()) {
      heroDyn.play(name);
      $$('[data-hact]').forEach((b) => b.classList.toggle('on', b.dataset.hact === name));
      setTimeout(() => $$('[data-hact]').forEach((b) => b.classList.remove('on')), 1500);
      return;
    }
    if (!heroCtl()) return;
    heroCtl().act(name);
    $('.hv-acts').classList.remove('more');
    // 按钮亮着直到这个动作做完，底部走一条进度（时长取自绑定的动作表）
    const dur = (pupOn() && heroPup.dur && heroPup.dur(name)) || 1.5;
    $$('[data-hact]').forEach((b) => { const on = b.dataset.hact === name; b.classList.remove('on'); if (on) { b.style.setProperty('--dur', dur + 's'); void b.offsetWidth; b.classList.add('on'); } });
    clearTimeout(heroAct.t);
    heroAct.t = setTimeout(() => $$('[data-hact]').forEach((b) => b.classList.remove('on')), dur * 1000);
    if (name === 'swing') {
      AUDIO.sfx('whoosh');
      // 挥出的那一段（约 0.37–0.75 秒）沿着杖尖留下一道火星 / 白灰
      if (pupOn()) {
        for (let d = 360; d <= 760; d += 50) setTimeout(() => {
          const p = heroPup.anchor('staffTip');
          if (!p) return;
          if (state.form === 'base') FX.emberBurst(p[0], p[1], 6, [20, 90], { g: -20 });
          else FX.ashBurst(p[0], p[1], 6, [20, 90]);
        }, d);
      }
    }
    if (name === 'cast') {
      const r = $('.hv-art').getBoundingClientRect();
      setTimeout(() => FX.cast(state.form === 'base' ? 'chant' : 'rain', r), 250);
      BG.pulse(0.6);
      // 法杖尖（分层绑定的锚点）冒出火星 / 白灰
      if (pupOn()) {
        [500, 900, 1300].forEach((d) => setTimeout(() => {
          const p = heroPup.anchor('staffTip');
          if (!p) return;
          if (state.form === 'base') FX.emberBurst(p[0], p[1], 14, [30, 120], { g: -30 });
          else FX.ashBurst(p[0], p[1], 14, [30, 120]);
        }, d));
      }
    }
  }
  function setElite(e) {
    if (state.busy || e === state.elite) return;
    state.elite = e;
    store.set('elite', e);
    $$('.elite-seg button').forEach((b) => b.classList.toggle('on', b.dataset.elite === e));
    hud();
    refreshFiles(true);
    AUDIO.sfx(state.form === 'base' ? 'whoosh' : 'sparkle');
    hideHeroDyn();
    if (window.HERO) HERO.stage.sweep(); // 一道扫描光扫过立绘
    swapHero('look');
  }

  function cutIn(to) {
    const f = D.forms[to];
    const c = $('#cutin');
    c.className = `to-${to}`;
    c.innerHTML = `<div class="ci-band"></div><div class="ci-text"><b>${f.mood}</b><span>${f.moodEn}</span><small>FORM SHIFT // 形态切换</small></div>`;
    void c.offsetWidth;
    c.classList.add('play');
    setTimeout(() => c.classList.remove('play'), 1950);
  }

  /* ---------- 区块按需重绘：切换形态时只立刻重绘看得见的区块，其余在空闲时逐个更新 ---------- */
  const SECTION_RENDER = {
    hero: () => renderHero(), theater: () => renderTheater(), combat: () => renderCombat(), story: () => renderStory(), journey: () => renderJourney(), mv: () => renderMV(), gallery: () => renderGallery(),
    profile: () => renderProfile(), files: () => renderFiles(), voice: () => renderVoice(), sheep: () => renderSheep(),
    volcano: () => renderVolcano(), trivia: () => renderTrivia(), appendix: () => renderAppendix(), footer: () => renderFooter(),
  };
  let staleSecs = [];
  // 调试计时（?debug 时记录到 window.__marks，供 lab/cdp.mjs 读取）
  const DEBUG = /[?&]debug\b/.test(location.search);
  const mark = (name, t0) => { if (DEBUG) (window.__marks = window.__marks || []).push({ name, t: Math.round(performance.now()), ms: t0 != null ? Math.round(performance.now() - t0) : undefined }); };
  const secEls = () => $$('#app > section, #app > footer');
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 60));
  /** 以视口中第一个区块为锚，执行 fn 后把它挪回原位（避免上方区块高度变化导致跳动） */
  /**
   * 跳到页内某个区块。沿途还没显示过的区块用的是 content-visibility 的估计高度，
   * 滚过去的途中它们渲染出来会长高或变矮，平滑滚动的终点却是出发时算好的——
   * 所以停下来以后看看目标在不在顶上，不在就再直接对齐一次（最多几次）。
   */
  let jumpId = 0;
  function jumpTo(el) {
    const my = ++jumpId;
    const off = () => el.getBoundingClientRect().top;
    scrollTo({ top: off() + scrollY, behavior: reduce ? 'auto' : 'smooth' });
    let tries = 0;
    const fix = () => {
      if (my !== jumpId) return;
      const d = off();
      if (Math.abs(d) > 2 && tries++ < 5) { scrollTo({ top: d + scrollY, behavior: 'auto' }); setTimeout(fix, 160); }
    };
    if ('onscrollend' in window) addEventListener('scrollend', () => setTimeout(fix, 50), { once: true });
    setTimeout(fix, 1600); // 没触发 scrollend（本来就在目标处，或浏览器不支持）时的兜底
  }
  function keepAnchor(fn) {
    const anchor = secEls().find((s) => s.getBoundingClientRect().bottom > 90);
    const top = anchor ? anchor.getBoundingClientRect().top : 0;
    fn();
    if (anchor) { const d = anchor.getBoundingClientRect().top - top; if (Math.abs(d) > 0.5) window.scrollBy(0, d); }
  }
  let staleGen = 0;
  /** 立刻重绘视口内（及首屏）的区块，其余标记为待更新 */
  function renderVisibleSections() {
    staleSecs = [];
    staleGen++; // 让上一次切换留下的待重绘任务作废
    keepAnchor(() => {
      for (const el of secEls()) {
        const r = el.getBoundingClientRect();
        const inView = el.id === 'hero' || (r.bottom > -80 && r.top < innerHeight + 80);
        if (inView) SECTION_RENDER[el.id] && SECTION_RENDER[el.id]();
        else staleSecs.push(el.id);
      }
    });
    observeReveals();
  }
  /** 剩下的区块：滚动到附近（提前约一屏）时才重绘，看不见就不花这份力气 */
  let staleIO = null;
  function renderStaleSections() {
    const gen = staleGen;
    const doRender = (id) => {
      const i = staleSecs.indexOf(id);
      if (gen !== staleGen || i < 0) return;
      staleSecs.splice(i, 1);
      const t0 = performance.now();
      if (SECTION_RENDER[id]) keepAnchor(SECTION_RENDER[id]);
      mark('render:' + id, t0);
      observeReveals();
    };
    if (staleIO) staleIO.disconnect();
    staleIO = new IntersectionObserver((ens) => ens.forEach((en) => { if (en.isIntersecting) { staleIO.unobserve(en.target); doRender(en.target.id); } }), { rootMargin: '50% 0px' });
    staleSecs.forEach((id) => { const el = document.getElementById(id); if (el) staleIO.observe(el); });
  }

  /**
   * 形态切换：浏览器原生视图过渡。
   * 旧页面先拍成快照，新页面在快照下一次性换好，然后从点击处圆形揭开（与粒子光环同步）。
   * 整个过程只是两张画面在显卡上合成，不会逐帧重绘整页。
   */
  async function switchForm(to, ox, oy) {
    if (state.busy || to === state.form || !state.entered) return;
    state.busy = true;
    try {
      ox = ox ?? innerWidth / 2;
      oy = oy ?? innerHeight / 2;
      AUDIO.setForm(to);
      AUDIO.sfx(to === 'base' ? 'boom' : 'sparkle');
      AUDIO.stopVoice();
      hideHeroDyn();
      const root = document.documentElement;
      root.style.setProperty('--vt-x', ox + 'px');
      root.style.setProperty('--vt-y', oy + 'px');
      root.style.setProperty('--vt-r', Math.hypot(Math.max(ox, innerWidth - ox), Math.max(oy, innerHeight - oy)) + 8 + 'px');
      // 新立绘多半已在加载页预取；最多等 0.6 秒
      const artP = loadImg(D.forms[to].art[state.elite]);

      // 视图过渡期间旧画面是冻结的：不在这里等网络，新立绘没到就先切过去，到了再无缝换上
      const update = async () => {
        mark('update:start');
        await Promise.race([artP, wait(120)]);
        mark('update:art');
        let t0 = performance.now();
        state.form = to;
        store.set('form', to);
        root.dataset.form = to;
        document.querySelector('meta[name="theme-color"]').content = to === 'base' ? '#0c0609' : '#eef1f7';
        FX.setForm(to);
        renderVisibleSections();
        mark('update:sections', t0);
        if (heroDoll) {
          heroDoll.setForm(to);
          if (is3d()) heroDoll.setOutfit(doll3dKey()).then(() => { renderHeroActs(); hud(); heroDoll.act('jump'); });
        }
        t0 = performance.now();
        applyView();
        mark('update:view', t0);
        // 新立绘直接就位（揭开的过程就是过渡）；预载好的分层绑定几乎立刻可用，最多等 0.25 秒
        t0 = performance.now();
        const heroReady = setHeroSrc(F().art[state.elite], { waitPup: 250 }).then((ok) => {
          if (!ok) return;
          $('.hv-art').classList.remove('gone');
          $('.hv-shade').classList.remove('gone');
        });
        const inTime = await Promise.race([heroReady.then(() => true), wait(300).then(() => false)]);
        // 没赶上：先把旧形态的立绘藏起来，新立绘到了再淡入（heroReady 会移除 gone）
        if (!inTime) { $('.hv-art').classList.add('gone'); $('.hv-shade').classList.add('gone'); }
        mark('update:hero', t0);
        if (!reduce) cutIn(to);
      };

      if (document.startViewTransition && !reduce && !document.hidden) {
        mark('switch:start');
        const vt = document.startViewTransition(() => { BG.set(to); return update(); });
        vt.ready.then(() => { mark('vt:ready'); FX.formBurst(ox, oy, to); }).catch(() => {});
        vt.finished.then(() => mark('vt:finished')).catch(() => {});
        // 页面暂停绘制时（后台、被遮挡）视图过渡会一直等下一帧：超时就跳过动画，直接完成更新
        const guard = setTimeout(() => vt.skipTransition(), 1800);
        await vt.updateCallbackDone.catch(() => {});
        clearTimeout(guard);
        await Promise.race([vt.finished.catch(() => {}), wait(1600)]);
      } else if (document.hidden) {
        BG.set(to);
        await update();
      } else {
        // 不支持视图过渡的浏览器：保留着色器的燃烧推进
        FX.formBurst(ox, oy, to);
        BG.transition(to, ox, oy, 1700);
        await update();
      }
      // 揭开后跳一下、四处张望；其余区块与小人在空闲时更新
      if (heroCtl()) heroCtl().act('hop');
      setTimeout(() => heroCtl() && heroCtl().act('look'), 1200);
      renderStaleSections();
      setTimeout(prefetchOtherPuppet, 2500);
    } finally {
      state.busy = false;
    }
  }
  function toggleForm(ox, oy) { return switchForm(state.form === 'base' ? 'alter' : 'base', ox, oy); }

  /* ---------------------------------------------------- 按住喷发：长按首屏按钮积蓄压力 */
  let hold = null, eatFormClick = false, holdLong = false;
  function holdStart(e) {
    const b = e.target && e.target.closest ? e.target.closest('[data-act="form"]') : null;
    if (!b || state.busy || !state.entered || e.button > 0) return;
    hold = { b, t0: performance.now(), x: e.clientX, y: e.clientY, raf: 0 };
    const tick = () => {
      if (!hold) return;
      const k = Math.min(1, (performance.now() - hold.t0 - 240) / 1250);
      if (k > 0) {
        b.classList.add('holding');
        b.style.setProperty('--hold', k.toFixed(3));
        BG.pulse(0.25 + k * 0.75);
        if (!reduce) $('#app').style.transform = `translate3d(${((Math.random() - 0.5) * k * 2.5).toFixed(1)}px, ${((Math.random() - 0.5) * k * 2.5).toFixed(1)}px, 0)`;
        if (Math.random() < 0.12 + k * 0.3) {
          const r = b.getBoundingClientRect();
          const px = r.left + Math.random() * r.width, py = r.top + Math.random() * r.height;
          if (state.form === 'base') FX.ashBurst(px, py, 2, [40, 160]);
          else FX.emberBurst(px, py, 2, [40, 160], { g: -40 });
        }
      }
      if (k >= 1) { holdEnd(true); return; }
      hold.raf = requestAnimationFrame(tick);
    };
    hold.raf = requestAnimationFrame(tick);
  }
  function holdEnd(fire) {
    if (!hold) return;
    const { b, x, y, t0 } = hold;
    cancelAnimationFrame(hold.raf);
    hold = null;
    b.classList.remove('holding');
    b.style.removeProperty('--hold');
    $('#app').style.transform = '';
    if (performance.now() - t0 > 240) holdLong = true;
    if (fire) {
      FX.shake(12, 0.6);
      toggleForm(x, y);
    }
  }

  /* ====================================================
   * 滚动、揭示、导航
   * ==================================================== */
  let revealIO;
  function observeReveals() {
    if (!revealIO) {
      revealIO = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          en.target.classList.add('in');
          $$('[data-count]', en.target).forEach(countUp);
          revealIO.unobserve(en.target);
        }
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    }
    $$('[data-reveal]:not(.in)').forEach((el) => revealIO.observe(el));
    gateAnimations();
  }

  /* 动画闸门：离屏的块暂停其中全部 CSS 动画（样式见 .anim-off）。
   * 故事区上万像素高，content-visibility 只在整段离屏时才跳过它，所以按章节粒度开关 */
  let gateIO;
  function gateAnimations() {
    if (!gateIO) gateIO = new IntersectionObserver((ens) => ens.forEach((en) => en.target.classList.toggle('anim-off', !en.isIntersecting)), { rootMargin: '20% 0px' });
    else gateIO.disconnect();
    $$('#hero, #app > section.sec:not(#story), #app > footer, #story > :not(.wrap), #story > .wrap > *').forEach((el) => gateIO.observe(el));
  }

  /* 标题流光：每 160ms 推进一次 --flow（约 6 次/秒，与原先 steps() 的节奏相同）。
   * 背景位移写成 CSS 动画时不能交给合成器，哪怕是步进的，主线程也得每帧重算样式 */
  const FLOWS = [['.hn-main', 6250, 9000], ['.pb-text h3', 7500, 11250]];
  function flowTick() {
    if (document.hidden) return;
    const now = performance.now();
    for (const [sel, pBase, pAlter] of FLOWS) {
      const per = state.form === 'alter' ? pAlter : pBase;
      const v = ((now % per) / per).toFixed(4);
      for (const el of $$(sel)) if (!el.closest('.anim-off')) el.style.setProperty('--flow', v);
    }
  }
  if (!reduce) setInterval(flowTick, 160);

  const navIO = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      $$('.nav-links a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id));
    }
  }, { rootMargin: '-45% 0px -50% 0px' });

  let lastY = 0, ticking = false;
  const SCROLL_TL = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: view()'));
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
      const nav = $('#nav');
      nav.classList.toggle('solid', y > 40);
      nav.classList.toggle('hide', y > innerHeight && y > lastY + 4 && !$('.nav-links').classList.contains('open'));
      if (y < lastY - 4) nav.classList.remove('hide');
      // 滚动时，画面里的发梢与衣摆被轻轻带动
      const kick = clamp((y - lastY) * 0.06, -5, 5);
      if (kick) { if (heroPup && y < innerHeight * 1.2) heroPup.impulse(0, kick); if (galPup) galPup.impulse(0, kick); }
      lastY = y;
      nav.style.setProperty('--sp', max > 0 ? y / max : 0);
      BG.scroll(y / innerHeight);
      // 支持滚动驱动动画时视差由 CSS 完成，这里不再逐帧读写每个章节
      if (!SCROLL_TL) {
        for (const ch of $$('.chapter, .part-banner')) {
          const r = ch.getBoundingClientRect();
          if (r.bottom < -100 || r.top > innerHeight + 100) continue;
          ch.style.setProperty('--py', ((r.top + r.height / 2 - innerHeight / 2) / innerHeight).toFixed(3));
        }
      }
      // 只找故事区的年表（剧场布景的图层也用了 .tl 这个类名）；不在视野里就不逐项读位置
      const tl = $('#story .tl');
      const tr = tl && tl.getBoundingClientRect();
      if (tl && tr.bottom > -40 && tr.top < innerHeight + 40) {
        const r = tr;
        const p = clamp((innerHeight * 0.6 - r.top) / r.height, 0, 1);
        tl.style.setProperty('--p', p);
        $$('.tl-item', tl).forEach((it) => it.classList.toggle('lit', it.getBoundingClientRect().top < innerHeight * 0.6));
      }
    });
  }

  /* ====================================================
   * 游走的小羊
   * ==================================================== */
  let walkClicks = [];
  function spawnWalker(run = false, delay = 0) {
    if (reduce) return;
    const w = $('#walker');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'walk-sheep' + (run ? ' run' : '');
    b.setAttribute('aria-label', '路过的小羊');
    const dur = run ? 2.6 + Math.random() * 2 : 22 + Math.random() * 10;
    b.style.bottom = (run ? Math.random() * 60 : 6) + 'px';
    const size = run ? 50 + Math.random() * 40 : 74;
    b.style.width = size + 'px';
    // 跳动放在外层 span 上（直接动 <svg> 根元素交不给合成器）
    b.innerHTML = `<span class="ws-body">${A.sheep(state.form === 'base' ? 'black' : 'pink')}</span><span class="bub">咩！</span>`;
    w.appendChild(b);
    // 横穿屏幕：起止位置算成像素再交给 Web Animations（关键帧里写 vw / calc 时合成器接不了）
    const walk = b.animate([{ transform: `translateX(${innerWidth + 20}px)` }, { transform: `translateX(${-size - 40}px)` }], { duration: dur * 1000, delay: delay * 1000, easing: 'linear', fill: 'both' });
    walk.onfinish = () => b.remove();
  }
  function walkerLoop() {
    if (state.entered && !document.hidden && !$('.walk-sheep:not(.run)')) spawnWalker();
    setTimeout(walkerLoop, 30000 + Math.random() * 25000);
  }
  function clickWalker(b, e) {
    b.classList.add('said');
    setTimeout(() => b.classList.remove('said'), 900);
    if (state.form === 'base') FX.emberBurst(e.clientX, e.clientY, 18, [60, 240]);
    else FX.ashBurst(e.clientX, e.clientY, 16, [60, 240]);
    AUDIO.sfx('tick');
    const now = performance.now();
    walkClicks = walkClicks.filter((t) => now - t < 4000).concat(now);
    if (walkClicks.length >= 3) {
      walkClicks = [];
      toast('咩咩咩——小羊大迁徙！');
      for (let i = 0; i < 14; i++) spawnWalker(true, i * 0.12);
    }
  }

  /* ====================================================
   * 全局事件
   * ==================================================== */
  function bind() {
    const cursor = $('#cursor'), ring = $('.c-ring'), dot = $('.c-dot');
    const fine = matchMedia('(pointer: fine)').matches;
    if (fine && !reduce) document.documentElement.classList.add('has-cursor');
    let cx = innerWidth / 2, cy = innerHeight / 2, rx = cx, ry = cy, followRaf = 0, followT = 0;
    // 光圈追随鼠标：追上之后就停，不在空闲时每帧空转
    const follow = (now) => {
      followRaf = 0;
      const dt = Math.min(0.05, (now - followT) / 1000 || 0.016);
      followT = now;
      const k = 1 - Math.pow(0.8, dt * 60);
      rx += (cx - rx) * k;
      ry += (cy - ry) * k;
      ring.style.transform = `translate(${rx.toFixed(1)}px, ${ry.toFixed(1)}px)`;
      if (Math.abs(cx - rx) > 0.3 || Math.abs(cy - ry) > 0.3) followRaf = requestAnimationFrame(follow);
    };
    const kickFollow = () => { if (fine && !followRaf) { followT = performance.now(); followRaf = requestAnimationFrame(follow); } };

    window.addEventListener('pointermove', (e) => {
      cx = e.clientX; cy = e.clientY;
      kickFollow();
      cursor.classList.add('live');
      dot.style.transform = `translate(${cx}px, ${cy}px)`;
      FX.pointer(cx, cy);
      BG.pointer(cx, cy);
      if (heroLive) heroLive.pointer(cx, cy);
      if (heroPup) heroPup.pointer(cx, cy);
      if (galLive) galLive.pointer(cx, cy);
      if (galPup) galPup.pointer(cx, cy);
      if (heroDyn) heroDyn.pointer(cx, cy);
      if (galDyn) galDyn.pointer(cx, cy);
      if (heroDoll && scrollY < innerHeight * 1.2) heroDoll.pointer(cx, cy);
      // 首屏视差：直接写三个元素的 transform（js/hero.js，每帧最多一次）；
      // 以前是在 #hero 上改自定义属性，整个首屏子树（法阵几百个 SVG 节点）每次鼠标移动都要重算样式
      if (scrollY < innerHeight) {
        if (window.HERO) HERO.parallax(cx, cy);
        else {
          const hero = $('#hero');
          if (hero) { hero.style.setProperty('--mx', ((cx / innerWidth - 0.5) * 2).toFixed(3)); hero.style.setProperty('--my', ((cy / innerHeight - 0.5) * 2).toFixed(3)); }
        }
      }
      const t = e.target.closest && e.target.closest('.tilt');
      if (t) {
        const r = t.getBoundingClientRect();
        const px = (cx - r.left) / r.width, py = (cy - r.top) / r.height;
        t.style.setProperty('--ry', ((px - 0.5) * 16).toFixed(2) + 'deg');
        t.style.setProperty('--rx', ((0.5 - py) * 16).toFixed(2) + 'deg');
        t.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        t.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        t.style.setProperty('--fx', (px * 100).toFixed(1) + '%');
        t.style.setProperty('--fy', (py * 100).toFixed(1) + '%');
      }
      const inter = e.target.closest && e.target.closest('a, button, input, .vspot, [role="button"]');
      cursor.classList.toggle('hover', !!inter);
    }, { passive: true });
    document.addEventListener('pointerout', (e) => {
      const t = e.target.closest && e.target.closest('.tilt');
      if (t && !t.contains(e.relatedTarget)) { t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); }
    });
    window.addEventListener('pointerdown', (e) => { cursor.classList.add('down'); holdStart(e); });
    window.addEventListener('pointerup', () => {
      cursor.classList.remove('down');
      holdEnd(false);
      // 长按后松手产生的 click 不再重复触发切换
      if (holdLong) { holdLong = false; eatFormClick = true; setTimeout(() => (eatFormClick = false), 350); }
    });
    window.addEventListener('pointercancel', () => holdEnd(false));
    window.addEventListener('scroll', onScroll, { passive: true });

    document.addEventListener('click', (e) => {
      const t = e.target;
      if (state.entered && e.clientX) FX.click(e.clientX, e.clientY);

      const fs = t.closest('.form-switch, [data-act="form"]');
      if (fs && eatFormClick) { eatFormClick = false; return; }
      if (fs) {
        const r = fs.getBoundingClientRect();
        const then = fs.dataset.then;
        const p = toggleForm(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2);
        // 故事末尾的“接着读”：切过去以后回到新篇章的开头
        if (then && p) p.then(() => {
          const t = $(`#${then} .part-banner`) || document.getElementById(then);
          if (t) scrollTo({ top: t.getBoundingClientRect().top + scrollY - 80, behavior: reduce ? 'auto' : 'smooth' });
        });
        return;
      }
      const vw = t.closest('[data-view]');
      if (vw) { setView(vw.dataset.view); return; }
      const sk = t.closest('[data-skin3d]');
      if (sk) { setSkin3d(sk.dataset.skin3d); return; }
      const el = t.closest('[data-elite]');
      if (el) {
        const r = el.getBoundingClientRect();
        setElite(el.dataset.elite, [e.clientX || r.left + r.width / 2, e.clientY || r.top]);
        return;
      }
      const pt = t.closest('[data-pet]');
      if (pt) { togglePetId(pt.dataset.pet); return; }
      // 职业演示：换技能 / 速度 / 释放 / 重来 / 自动释放
      const ssk = t.closest('[data-simsk]');
      if (ssk) { if (sim) { sim.setSkill(+ssk.dataset.simsk); simMarkSkill(); } return; }
      const ssp = t.closest('[data-simspd]');
      if (ssp) { if (sim) sim.setSpeed(+ssp.dataset.simspd); $$('[data-simspd]').forEach((b) => b.classList.toggle('on', b === ssp)); return; }
      const sa = t.closest('[data-simact]');
      if (sa) {
        if (sim) { const k = sa.dataset.simact; if (k === 'cast') sim.cast(); else if (k === 'reset') sim.reset(); else if (k === 'auto') sim.setAuto(sa.checked); }
        return;
      }
      // 职业演示：关卡 / 模组 / 潜能 / 解说（记住每个形态各自的选择）
      const scf = t.closest('[data-simcfg]');
      if (scf) {
        if (sim) {
          const k = scf.dataset.simcfg, v = k === 'tips' ? scf.checked : k === 'pot' ? +scf.dataset.v : scf.dataset.v;
          sim.setConfig({ [k]: v });
          store.set('simcfg.' + state.form, sim.config);
          if (k !== 'tips') $$(`[data-simcfg="${k}"]`).forEach((b) => b.classList.toggle('on', b === scf));
          simMarkSkill();
        }
        return;
      }
      const mtg = t.closest('[data-mathtgt]');
      if (mtg) { mathTgt = mtg.dataset.mathtgt; $$('[data-mathtgt]').forEach((b) => b.classList.toggle('on', b === mtg)); renderMath(); return; }
      const act = t.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'dyn-load') { loadGalDyn(); return; }
        if (a === 'hear') { toggleHearing(); return; }
        if (a === 'pet-toggle') { togglePets(); return; }
        if (a === 'pet-close') { removePet(act.dataset.petId); savePets(); return; }
        if (a === 'th-auto') {
          theater.auto = !theater.auto;
          if (chibi) chibi.setAuto(theater.auto);
          act.textContent = `自由活动 · ${theater.auto ? '开' : '关'}`;
          act.classList.toggle('btn-primary', theater.auto);
          act.classList.toggle('btn-ghost', !theater.auto);
          act.setAttribute('aria-pressed', theater.auto);
          return;
        }
        if (a === 'hello') {
          playVoice(11);
          if (is3d() && heroDoll && heroDoll.ok) heroDoll.act('wave');
          if (pupOn()) heroPup.act('smile');
        }
        else if (a === 'voice-stop') AUDIO.stopVoice();
        return;
      }
      if (t.id === 'lightbox') { closeLightbox(); return; }
      const ts = t.closest('[data-thskin]');
      if (ts) { theater.skin = ts.dataset.thskin; theaterReload(); return; }
      const tg = t.closest('[data-thgroup]');
      if (tg) { theater.group = tg.dataset.thgroup; theaterReload(); return; }
      const ta = t.closest('[data-thact]');
      if (ta) { if (chibi) chibi.play(ta.dataset.thact); return; }
      const dk = t.closest('[data-dynk]');
      if (dk) { if (dk.dataset.dynk !== galDynKey || !$('.dyn-screen').classList.contains('started')) loadGalDyn(dk.dataset.dynk); return; }
      const da = t.closest('[data-dynact]');
      if (da) { if (galDyn) galDyn.play(da.dataset.dynact); return; }
      const ha = t.closest('[data-hact]');
      if (ha) { heroAct(ha.dataset.hact); return; }
      if (t.closest('.hv-art')) { pokeHero(e); return; }
      const cast = t.closest('[data-cast]');
      if (cast) {
        const card = cast.closest('.skill') || cast;
        FX.cast(cast.dataset.cast, card.getBoundingClientRect());
        AUDIO.sfx(state.form === 'base' ? 'boom' : 'sparkle');
        BG.pulse(0.8);
        cast.classList.add('cool');
        setTimeout(() => cast.classList.remove('cool'), 2400);
        return;
      }
      // 语音区：小故事条（默认语音） / 卡片 / 语言 / 分类 / 语音组 / 播放器按钮 / 波形跳转
      const vgd = t.closest('[data-vguide]');
      if (vgd) { playVoice(+vgd.dataset.vguide, state.form, 'default'); return; }
      const vc = t.closest('[data-voice]');
      if (vc) { playVoice(+vc.dataset.voice, state.form, state.vset); return; }
      const lang = t.closest('[data-lang]');
      if (lang) { setVoiceLang(lang.dataset.lang); return; }
      const vf = t.closest('[data-vf]');
      if (vf) { if (vf.dataset.vf !== state.vfilter) { state.vfilter = vf.dataset.vf; renderVoiceList(); observeReveals(); } return; }
      const vs = t.closest('[data-vset]');
      if (vs) { setVoiceSet(vs.dataset.vset); return; }
      const vt = t.closest('[data-vt]');
      if (vt) { voiceTransport(vt.dataset.vt); return; }
      const vwave = t.closest('.vd-wave');
      if (vwave) { const r = vwave.getBoundingClientRect(); voiceSeek((e.clientX - r.left) / r.width); return; }
      const sp = t.closest('.vspot');
      if (sp) { showSpot(+sp.dataset.i); return; }
      // 小羊区的互动由 sheep.js 挂在舞台上
      const tv = t.closest('.tv-card');
      if (tv) { if (window.VOLC) VOLC.flip(tv); else tv.classList.toggle('flip'); return; }
      const ws = t.closest('.walk-sheep');
      if (ws) { clickWalker(ws, e); return; }
      if (t.closest('.snd-btn')) { toggleSound(); return; }
      if (t.closest('.menu-btn')) { $('.nav-links').classList.toggle('open'); return; }
      if (t.closest('.nav-links a')) { $('.nav-links').classList.remove('open'); }
      // 页内锚点：自己滚过去，到站后再校正（见 jumpTo）
      const ah = t.closest('a[href^="#"]');
      const tgt = ah && ah.getAttribute('href').length > 1 && document.getElementById(ah.getAttribute('href').slice(1));
      if (tgt) { e.preventDefault(); jumpTo(tgt); history.replaceState(null, '', '#' + tgt.id); }
    });

    // 档案 / 附录区的交互（信赖值、阶段、技能等级、分页…）由 archive.js 挂在各自区块上
    document.addEventListener('focusin', (e) => { const sp = e.target.closest && e.target.closest('.vspot'); if (sp) showSpot(+sp.dataset.i); });

    window.addEventListener('keydown', (e) => {
      const lb = $('#lightbox');
      if (!lb.hidden) {
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') openLightbox(state.lb - 1);
        else if (e.key === 'ArrowRight') openLightbox(state.lb + 1);
        return;
      }
      if (e.target.matches('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!state.entered) {
        if ((e.key === 'Enter' || e.key === ' ') && !$('.ld-enter').disabled) { e.preventDefault(); enter(); }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 't') {
        const r = $('.form-switch').getBoundingClientRect();
        toggleForm(r.left + r.width / 2, r.top + r.height / 2);
      } else if (k === 'e') {
        setElite(state.elite === 'e0' ? 'e2' : 'e0');
      } else if (k === 'm') toggleSound();
      else if (e.key === 'Escape') $('.nav-links').classList.remove('open');
    });
    // 语音波形：左右方向键快退 / 快进 1 秒
    document.addEventListener('keydown', (e) => {
      if (!e.target.classList || !e.target.classList.contains('vd-wave') || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      const a = AUDIO.voice;
      if (a.duration) voiceSeek((a.currentTime + (e.key === 'ArrowLeft' ? -1 : 1)) / a.duration);
    });
  }

  function toggleSound() {
    const on = !AUDIO.enabled;
    AUDIO.setForm(state.form);
    AUDIO.setEnabled(on);
    const b = $('.snd-btn');
    b.innerHTML = A.icon(on ? 'sound' : 'mute');
    b.classList.toggle('on', on);
    $('.hear-btn').hidden = !on;
    if (on && !AUDIO.clear) toast('你听到的，是她听到的世界。点右上角的「助听器」让声音清晰起来。');
    else toast(on ? (state.form === 'base' ? '环境音：熔岩低鸣' : '环境音：风与风铃') : '环境音已关闭');
  }
  function toggleHearing() {
    const on = !AUDIO.clear;
    AUDIO.setClarity(on);
    const b = $('.hear-btn');
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
    toast(on ? '助听器已开启 · 世界清晰了起来' : '助听器已关闭');
  }

  /* ====================================================
   * 启动与加载页
   * ==================================================== */
  /** 打出一行终端文字（带光标），返回这一行的元素 */
  async function typeRow(el, text) {
    const row = document.createElement('div');
    const txt = document.createElement('span');
    const caret = document.createElement('span');
    caret.className = 'caret';
    row.append(txt, caret);
    el.appendChild(row);
    for (let i = 0; i <= text.length; i++) {
      txt.textContent = text.slice(0, i);
      await wait(reduce ? 0 : 7 + Math.random() * 11);
    }
    caret.remove();
    return row;
  }

  /** 带进度的下载：返回 Blob；onp(0..1) 按字节报告（没有 Content-Length 时按渐近估计） */
  async function fetchBlob(url, onp) {
    const r = await fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' });
    if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
    const total = +r.headers.get('content-length') || 0;
    const reader = r.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onp(total ? got / total : 1 - Math.exp(-got / 1.5e6));
    }
    return new Blob(chunks, { type: r.headers.get('content-type') || '' });
  }
  /** 带进度地加载一张立绘：下载完成后以 blob URL 解码并放进 imgCache，之后首屏 / 画廊直接命中 */
  function fetchImage(src, onp) {
    if (imgCache.has(src)) return imgCache.get(src).then((im) => { onp(1); if (!im) throw new Error('img'); return im; });
    const p = (async () => {
      try {
        const blob = await fetchBlob(src, onp);
        const im = new Image();
        im.crossOrigin = 'anonymous';
        await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = URL.createObjectURL(blob); });
        return im;
      } catch (e) {
        // 流式下载失败（跨域 / 网络）：退回普通图片加载
        imgCache.delete(src);
        return loadImg(src);
      }
    })();
    imgCache.set(src, p);
    return p.then((im) => { onp(1); if (!im) throw new Error('img'); return im; });
  }
  /** 预取首屏的分层绑定（rig.json + 图集），之后 PUPPET.load 命中浏览器缓存 */
  async function fetchPuppet(key, onp) {
    const rig = await (await fetch(`assets/puppet/${key}/rig.json`, { cache: 'no-cache' })).json();
    await fetchBlob(`assets/puppet/${key}/${rig.atlas}${rig.v ? '?v=' + rig.v : ''}`, onp);
  }

  /**
   * 终端加载页：每一行文字绑定一项真实加载任务。
   * 所有任务同时开始下载；文字按顺序打出，行尾显示实时百分比，完成才亮 OK。
   * 进度条只累计「已经出现的行」的真实进度，所以文字与进度条同步前进。
   */
  async function runLoader(tasks) {
    const el = $('.ld-lines'), bar = $('.ld-bar'), pct = $('.ld-pct');
    const W = tasks.reduce((s, t) => s + t.w, 0);
    const prog = tasks.map(() => 0), shown = tasks.map(() => false);
    const upd = () => {
      const p = tasks.reduce((s, t, i) => s + (shown[i] ? prog[i] * t.w : 0), 0) / W;
      bar.style.setProperty('--p', p.toFixed(4));
      pct.textContent = Math.round(p * 100) + '%';
      if (window.HERO) HERO.ld.progress(p); // 记录笔（地震仪 / 心电）跟着真实进度走
    };
    const results = tasks.map((t, i) => Promise.resolve()
      .then(() => t.run((v) => { prog[i] = Math.max(prog[i], clamp(v, 0, 1)); upd(); }))
      .then(() => true, () => false));
    el.textContent = '';
    await typeRow(el, 'PRTS // RHODES ISLAND TERMINAL');
    for (let i = 0; i < tasks.length; i++) {
      if (window.HERO) HERO.ld.step(i); // 字幕：逐句讲她的故事
      const row = await typeRow(el, '> ' + tasks[i].label + ' ');
      shown[i] = true;
      upd();
      const st = document.createElement('span');
      st.className = 'ld-st';
      row.appendChild(st);
      let dots = 0;
      const tick = () => {
        dots = (dots + 1) % 4;
        const p = prog[i];
        st.textContent = '.'.repeat(3 + dots) + (p > 0.001 && p < 1 ? ` ${Math.round(p * 100)}%` : '');
      };
      tick();
      const timer = setInterval(tick, 110);
      const ok = await Promise.race([results[i], wait(tasks[i].timeout || 15000).then(() => null)]);
      clearInterval(timer);
      // 没加载完的（失败或太慢）不报错：页面会在后台悄悄重试，这里只说一声「后台继续」
      st.innerHTML = '...... ' + (ok ? '<span class="ok">OK</span>' : '<span class="later">后台继续</span>');
      prog[i] = 1;
      upd();
      await wait(reduce ? 0 : 70);
    }
    if (window.HERO) HERO.ld.done();
    await typeRow(el, `> WELCOME BACK, DOCTOR.`);
    const c = document.createElement('span');
    c.className = 'caret';
    el.appendChild(c);
    return results;
  }

  async function enter() {
    if (state.entered) return;
    state.entered = true;
    const ld = $('#loader');
    AUDIO.setForm(state.form);
    // 幕布拉开、扫描像溶解成立绘、首屏按镜头顺序入场（js/hero.js）
    if (window.HERO && ld && ld.classList.contains('ld-v2')) { HERO.ld.exit(); HERO.intro(); }
    else if (ld) {
      ld.classList.add('out');
      setTimeout(() => ld.remove(), 1200);
      if (state.form === 'base') FX.emberBurst(innerWidth / 2, innerHeight / 2, 120, [200, 900], { g: 60, lift: 0 });
      else FX.ashBurst(innerWidth / 2, innerHeight / 2, 120, [200, 900]);
    }
    renderHero();
    applyView();
    observeReveals();
    const ok = await setHeroSrc(F().art[state.elite]);
    await wait(reduce ? 0 : 250);
    if (ok) showHero('hop');
    setTimeout(walkerLoop, 12000);
    // 上次放出来的桌宠（旧版只记了一只：store 'pet' = true）
    const savedPets = store.get('pets', null) ?? (store.get('pet', false) ? [petId(state.form, '默认')] : []);
    const vs = petVariants().filter((v) => savedPets.includes(v.id));
    if (vs.length) setTimeout(() => { vs.forEach((v, i) => addPet(v, spreadX(i, vs.length))); savePets(); }, 2500);
    setTimeout(prefetchOtherPuppet, 4000);
    setTimeout(warmViewTransition, 3200);
  }
  /**
   * 预热视图过渡：会话里第一次视图过渡时，显卡要现编译圆形揭开所需的着色器（约 0.1 秒卡顿）。
   * 进入页面后找个空闲时刻，跑一次极短（约 3 帧）且画面不变的过渡，把这笔开销提前付掉。
   */
  function warmViewTransition() {
    if (!document.startViewTransition || reduce || document.hidden || state.busy) return;
    idle(() => {
      if (state.busy || document.hidden) return;
      const root = document.documentElement;
      root.classList.add('vt-warm');
      root.style.setProperty('--vt-x', innerWidth / 2 + 'px');
      root.style.setProperty('--vt-y', innerHeight / 2 + 'px');
      root.style.setProperty('--vt-r', Math.hypot(innerWidth, innerHeight) + 'px');
      const vt = document.startViewTransition(() => {});
      vt.finished.finally(() => root.classList.remove('vt-warm'));
    });
  }

  async function boot() {
    $('.ld-mark').innerHTML = A.emblem(58);
    $('.nav-emblem').innerHTML = A.emblem(34);
    // 两个形态直接按职业称呼：术师 / 医疗
    $('.fs-opt[data-f="base"]').innerHTML = A.classIcon(D.forms.base.profession) + D.forms.base.mood;
    $('.fs-opt[data-f="alter"]').innerHTML = A.classIcon(D.forms.alter.profession) + D.forms.alter.mood;
    $('.snd-btn').innerHTML = A.icon('mute');
    $('.hear-btn').innerHTML = A.icon('ear');

    const app = $('#app');
    BG.init($('#bg'), state.form);
    FX.init($('#fx'), state.form, app);
    renderHeroShell();
    heroLive = window.LIVE ? LIVE.create($('.hv-art')) : null;
    if (/[?&]debug\b/.test(location.search)) { window.__hero = heroLive; window.__pups = heroPups; }
    renderAll();
    galAuto();
    let rz = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rz);
      rz = setTimeout(() => { if (heroLive) heroLive.layout(); heroPups.forEach((p) => p.layout()); if (galLive) galLive.layout(); }, 200);
    });
    $$('#app > section').forEach((s) => navIO.observe(s));
    if (window.HERO) {
      HERO.nav.init(); // 滑动指示条、窄屏当前区块名、全屏编号菜单（js/hero.js）
      // 首屏的小生气：法杖尖冒火星 / 白灰、看向悬停的按钮、打盹冒“z”、回到首屏时打招呼
      HERO.stage.bind({ pup: () => (pupOn() && !heroDynOn() ? heroPup : null), form: () => state.form });
    }
    bind();
    onScroll();

    // 加载任务：每一项对应加载页上的一行文字（w 为进度条权重）
    const f = F(), other = OTHER();
    const pk = `${state.form}-${state.elite}`;
    const tasks = [
      // 字体只是锦上添花：Google Fonts 慢的时候（包括在国内）最多等 2.5 秒，不让加载页卡在第一行
      { label: 'AUTHENTICATING DOCTOR', w: 1, timeout: 2500, run: (onp) => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => onp(1)) },
      // 立绘下载完：加载页在首屏立绘的位置“解密”出一张扫描像（js/hero.js）
      { label: `DECRYPTING OPERATOR FILE: ${f.giant} [${f.code}]`, w: 3, run: (onp) => fetchImage(f.art[state.elite], onp).then((im) => { if (window.HERO) HERO.ld.portrait(im); return im; }) },
      { label: 'CALIBRATING THERMAL SENSORS: 36.5°C', w: 3, run: (onp) => (window.PUPPET && PUP_KEYS.has(pk) ? fetchPuppet(pk, onp) : fetchImage(f.art[state.elite === 'e0' ? 'e2' : 'e0'], onp)) },
      { label: `LINKING ${state.form === 'base' ? 'ALTER' : 'ORIGIN'} FORM: ${other.giant} [${other.code}]`, w: 2, run: (onp) => fetchImage(other.art[state.elite], onp) },
      { label: 'SUMMONING LITTLE SHEEP', w: 2, run: (onp) => fetchImage(window.PUPPET && PUP_KEYS.has(pk) ? f.art[state.elite === 'e0' ? 'e2' : 'e0'] : other.art[state.elite === 'e0' ? 'e2' : 'e0'], onp) },
    ];
    // 每个形态有自己的一套终端文字（术师：地震仪 / 小黑羊；医疗：生命体征 / 看不见的小羊）
    if (window.HERO) HERO.ld.labels().forEach((l, i) => { if (tasks[i]) tasks[i].label = l; });
    if (/[?&]skip\b/.test(location.search)) {
      await Promise.race([Promise.all(tasks.map((t) => t.run(() => {}).catch(() => {}))), wait(4000)]);
      enter();
      return;
    }
    await runLoader(tasks);
    const btn = $('.ld-enter');
    btn.disabled = false;
    btn.focus({ preventScroll: true });
    btn.addEventListener('click', enter);
  }

  boot();
})();
