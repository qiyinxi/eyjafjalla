/* =========================================================
 * 故事区（#story）：分篇渲染、章节互动、整屏滚动叙事、章节导航、全景烘焙
 *
 * main.js 的 renderStory() 调用 STORY.render(ctx)；返回 true 表示接管成功。
 * 本模块只动 #story 里的内容，外加挂在 <body> 上的章节导航条与信笺浮层。
 *
 * 性能：
 *  · 插画是分层的（见 story-art.js）：会动的只有独立图层的 transform / opacity，全部交给合成器
 *  · 横幅全景与两幅整屏场景的静止底图在 CPU 画布上分条烘焙成位图（空闲时进行），
 *    显卡只贴一张图——避免第一次上屏时现编一批着色器造成的一两百毫秒卡顿
 *  · 没有常驻的 requestAnimationFrame：导航条的进度只在滚动事件里更新，且只在故事区可见时挂监听
 * ========================================================= */
window.STORY = (() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const CN = '零一二三四五六七八九十';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const idle = (fn, t = 300) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: t }) : setTimeout(fn, 16));
  const sfx = (k) => { try { if (window.AUDIO && AUDIO.sfx) AUDIO.sfx(k); } catch (e) { /* 音效失败不影响交互 */ } };
  const ART = () => window.STORY_ART;

  /* ---------------------------------------------------- 烘焙：SVG → CPU 画布 → PNG 位图 */
  /* 两种形态的主题色（与 main.css 一致）。当前形态实时读取；另一形态用这里的备份（例如医疗篇末尾预告的术师全景） */
  const THEME = {
    base: { '--c-bg': '#0c0609', '--c-bg2': '#180b12', '--c-panel': 'rgba(30, 12, 22, 0.72)', '--c-panel2': 'rgba(56, 18, 38, 0.55)', '--c-line': 'rgba(255, 110, 160, 0.22)', '--c-line2': 'rgba(255, 130, 175, 0.45)', '--c-text': '#f8e8ef', '--c-muted': '#c19aab', '--c-acc': '#ff4f8f', '--c-acc2': '#ffb0c8', '--c-acc3': '#ff6a3d', '--c-glow': 'rgba(255, 70, 140, 0.55)' },
    alter: { '--c-bg': '#eef1f7', '--c-bg2': '#dde6f2', '--c-panel': 'rgba(255, 255, 255, 0.72)', '--c-panel2': 'rgba(236, 242, 252, 0.8)', '--c-line': 'rgba(110, 130, 180, 0.26)', '--c-line2': 'rgba(120, 140, 200, 0.5)', '--c-text': '#26233a', '--c-muted': '#6b6884', '--c-acc': '#d2334f', '--c-acc2': '#4f9fe0', '--c-acc3': '#9a82d8', '--c-glow': 'rgba(120, 175, 255, 0.45)' },
  };
  function palette(form) {
    if (form !== document.documentElement.dataset.form) return THEME[form];
    const cs = getComputedStyle(document.documentElement), o = {};
    for (const k in THEME[form]) o[k] = cs.getPropertyValue(k).trim() || THEME[form][k];
    return o;
  }
  const baked = new Map(); // key → { p: Promise<url|null>, url }
  /**
   * 把一份独立的 SVG 画到 CPU 画布（willReadFrequently 让画布留在内存里、由 Skia 软件光栅化），
   * 每次空闲只画一条（约 40 万像素），画完转成 PNG。失败返回 null，由调用方退回直接放 SVG。
   */
  function bake(key, svg, w, h, form) {
    const hit = baked.get(key);
    if (hit) return hit.p;
    const e = { url: null };
    e.p = new Promise((res) => {
      const P = palette(form);
      const src = svg.replace(/var\((--[\w-]+)\)/g, (m, v) => P[v] || '#888').replace(/<svg\b/, `<svg width="${w}" height="${h}"`);
      const u = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' }));
      const img = new Image();
      const fail = () => { URL.revokeObjectURL(u); baked.delete(key); res(null); };
      img.onerror = fail;
      img.onload = () => {
        let c, g;
        try { c = document.createElement('canvas'); c.width = w; c.height = h; g = c.getContext('2d', { willReadFrequently: true }); } catch (err) { fail(); return; }
        if (!g) { fail(); return; }
        const strips = Math.max(1, Math.ceil((w * h) / 420000)), sh = Math.ceil(h / strips);
        let k = 0;
        const step = () => {
          try { const y = k * sh, hh = Math.min(sh, h - y); if (hh > 0) g.drawImage(img, 0, y, w, hh, 0, y, w, hh); } catch (err) { fail(); return; }
          if (++k < strips) { idle(step, 250); return; }
          URL.revokeObjectURL(u);
          c.toBlob((b) => { if (!b) { baked.delete(key); res(null); return; } e.url = URL.createObjectURL(b); res(e.url); }, 'image/png');
        };
        idle(step, 250);
      };
      img.src = u;
    });
    baked.set(key, e);
    return e.p;
  }
  /** 把烘焙好的位图放进 host（先解码再插入，淡入）；已经烘焙过的直接放 */
  function mount(host, key, getSvg, w, h, form) {
    const hit = baked.get(key);
    if (hit && hit.url) { host.innerHTML = `<img class="bk on" src="${hit.url}" alt="" decoding="async" draggable="false">`; return; }
    host.dataset.key = key;
    bake(key, getSvg(), w, h, form).then((url) => {
      if (!host.isConnected || host.dataset.key !== key) return;
      if (!url) { host.innerHTML = getSvg(); host.classList.add('live'); return; }
      const im = new Image();
      im.className = 'bk'; im.alt = ''; im.decoding = 'async'; im.draggable = false; im.src = url;
      const put = () => {
        if (!host.isConnected || host.dataset.key !== key) return;
        const old = host.querySelector('.bk');
        host.appendChild(im);
        requestAnimationFrame(() => { im.classList.add('on'); if (old) setTimeout(() => old.remove(), 700); });
      };
      (im.decode ? im.decode() : Promise.resolve()).then(put, put);
    });
  }
  /* 尺寸：按 CSS 公式算（不去读布局，免得强制重排）；乘设备像素比，封顶约 400 万像素 */
  const vw = () => document.documentElement.clientWidth || innerWidth;
  const gut = () => Math.min(48, Math.max(16, vw() * 0.04));
  const wrapW = () => Math.min(vw(), 1280) - 2 * gut();
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  function fit(w, h, k = 1) {
    let s = dpr() * k;
    const cap = vw() < 760 ? 2.6e6 : 4.2e6; // 手机上内存更紧：位图封顶约 260 万像素
    if (w * h * s * s > cap) s = Math.sqrt(cap / (w * h));
    return [Math.round((w * s) / 8) * 8, Math.round((h * s) / 8) * 8];
  }
  const bannerH = () => Math.round(Math.min(540, Math.max(320, innerHeight * 0.56)));
  function panoSize() { return fit(wrapW() * 1.1, bannerH() * 1.1); }
  function nextSize() { const w = wrapW(); return fit(w, vw() < 760 ? 560 : Math.min(480, Math.max(380, innerHeight * 0.5))); }
  function cineSize() { const v = vw(), hh = innerHeight; const bw = Math.max(v, (hh * 16) / 9); return fit(bw, (bw * 9) / 16); }

  function mountPano(host, form, kind) {
    if (!host || !window.SCENES || typeof SCENES.panorama !== 'function') return;
    const [w, h] = kind === 'next' ? nextSize() : panoSize();
    mount(host, `pano:${form}:${w}x${h}`, () => SCENES.panorama(form), w, h, form);
  }
  function mountCine(host) {
    if (!host || !ART()) return;
    const fw = +host.dataset.fw || 1, fh = +host.dataset.fh || 1, [cw, chh] = cineSize();
    const w = Math.round((cw * fw) / 8) * 8, h = Math.round((chh * fh) / 8) * 8;
    const name = host.dataset.scene, key = `cine:${name}:${w}x${h}`;
    const svg = host.dataset.bk ? ART().takeBase(host.dataset.bk) : '';
    if (svg) host._svg = svg;
    host.removeAttribute('data-bk');
    const s = host._svg || svg;
    if (!s && !(baked.get(key) && baked.get(key).url)) return;
    mount(host, key, () => s, w, h, document.documentElement.dataset.form);
  }

  /* ---------------------------------------------------- 渲染 */
  const sents = (t) => t.match(/[^。！？；]+(?:[。！？；]+[”」』）]?|$)/g) || [t];
  const para = (t, k, cls = 'ch-p') => `<p class="${cls}${k === 0 ? ' first' : ''}" style="--k:${k}">${sents(t).map((s, j) => `<span class="s" style="--j:${j}">${s}</span>`).join('')}</p>`;
  const ALT = { lamp: '点亮台灯', aid: '摘下助听器', candle: '重新点亮', book: '合上笔记本', bloom: '让它平静下来', play: '暂停', scorch: '收起' };
  const ICO = {
    lamp: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.8.7-1 1.5-1 2.5H9c0-1-.2-1.8-1-2.5A6 6 0 0 1 12 3z"/>',
    pet: '<path d="M7 12c0-3 2.5-5 5-5s5 2 5 5-2 6-5 6-5-3-5-6zM9 7 7.5 4.5M15 7l1.5-2.5"/>',
    whistle: '<path d="M4 10h9a5 5 0 1 1-4.6 7H6a2 2 0 0 1-2-2zM13 10V7h3"/>',
    letter: '<path d="M4 7h16v11H4zM4 7l8 6 8-6"/>',
    aid: '<path d="M8 15a5 5 0 1 1 9-3c0 3-3 3-3 6a2.5 2.5 0 0 1-4 2"/><path d="M11 12a1.5 1.5 0 1 1 3 0"/>',
    candle: '<path d="M12 3c2 2.5 2 4.5 0 6-2-1.5-2-3.5 0-6zM10 11h4v10h-4z"/>',
    sense: '<path d="M12 3v12M9 6l3-3 3 3M6 21a6 6 0 0 1 12 0"/>',
    book: '<path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"/>',
    seek: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
    scorch: '<path d="M12 3c3 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-5 .5 1.5 1.5 2 2 2 0-2 .5-4 1-7z"/>',
    drop: '<path d="M12 3v10M8 9l4 4 4-4M4 17c3 2 5 2 8 0s5-2 8 0"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    'env-a': '<path d="M4 7h16v11H4zM4 7l8 6 8-6"/>', 'env-b': '<path d="M4 7h16v11H4zM4 7l8 6 8-6"/>',
    bloom: '<path d="M12 21v-8M12 13c-3 0-5-2-5-5 3 0 5 2 5 5zm0 0c3 0 5-2 5-5-3 0-5 2-5 5zM12 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>',
    plant: '<path d="M12 21v-9M12 12c-4 0-6-3-6-6 4 0 6 3 6 6zm0 0c4 0 6-3 6-6-4 0-6 3-6 6zM5 21h14"/>',
  };
  const ico = (k) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICO[k] || ICO.seek}</svg>`;

  function artHTML(c, form) {
    const S = ART();
    if (!S) return '';
    const key = c.art === 'parade' ? 'invite' : c.art;
    try {
      if (key === 'portrait') return S.portrait(window.EYJA.forms.alter.art.e0);
      return typeof S[key] === 'function' ? S[key](form) : '';
    } catch (e) { console.error('[story] art', c.art, e); return ''; }
  }
  function fragHTML(c) {
    const f = c.frag;
    if (!f) return c.promise ? `<p class="ch-promise" aria-hidden="true"></p>` : '';
    if (f.kind === 'letter') {
      return `<button class="ch-frag fr-letter" type="button" data-x="letter"><span class="mono">${esc(f.title)}</span><b>${esc(f.label)}</b><em>${esc(f.lines[1])}</em></button>`;
    }
    if (f.kind === 'letters') {
      return `<div class="ch-frag fr-letters">${f.letters.map((l) => `<button type="button" class="fr-env ink-${l.ink}" data-x="${l.key}"><span class="mono">${esc(l.title)}</span><b>${esc(l.label)}</b></button>`).join('')}</div>`;
    }
    if (f.kind === 'deal') {
      return `<div class="ch-frag fr-deal" role="list"><p class="fr-h mono">${esc(f.title)}</p>${f.items.map((it, i) => `
        <button type="button" class="deal" data-x="deal" data-i="${i}" role="listitem" aria-pressed="false"><span class="dl-in"><span class="dl-f"><b>${esc(it.k)}</b><em>它藏在哪里？</em></span><span class="dl-b"><b>${esc(it.k)}</b><em>${esc(it.a)}</em></span></span></button>`).join('')}</div>`;
    }
    if (f.kind === 'tape') {
      return `<div class="ch-frag fr-tape"><p class="fr-h mono">${esc(f.title)}</p><ol>${f.tracks.map((t, i) => `
        <li><button type="button" data-x="track" data-i="${i}"${t.empty ? ' class="empty"' : ''}><i class="mono">${String(i + 1).padStart(2, '0')}</i><b>${esc(t.t)}</b><span class="tk-bar"></span></button></li>`).join('')}</ol>
        <p class="tk-now" aria-live="polite"><span class="mono">NOW</span><em>点一首，听她录下的声音。</em></p></div>`;
    }
    if (f.kind === 'check') {
      return `<div class="ch-frag fr-check"><p class="fr-h mono">${esc(f.title)}</p><ul>${f.items.map((t, i) => `<li><button type="button" data-x="check" data-i="${i}" aria-pressed="false"><i></i><span>${esc(t)}</span></button></li>`).join('')}</ul></div>`;
    }
    return '';
  }
  function chapterHTML(c, i, form) {
    const no = String(i + 1).padStart(2, '0');
    const acts = (c.act || []).map((a) => `<button class="ch-act" type="button" data-x="${a.x}"${ALT[a.x] ? ` data-alt="${ALT[a.x]}"` : ''}>${ico(a.x)}<span>${esc(a.label)}</span></button>`).join('');
    if (c.cine) {
      const n = c.text.length;
      return `
      <article class="chapter st-ch cine cine-${c.art}" id="st-${c.id}" data-ch="${i + 1}" style="--n:${n}">
        <div class="cine-stage" aria-hidden="true"><div class="cine-box">${artHTML(c, form)}</div><div class="cine-scrim"></div><span class="ch-num">${ROMAN[i]}</span></div>
        <div class="cine-flow">
          <header class="cine-card cine-head" data-reveal>
            <p class="ch-place mono">CHAPTER ${no} · ${esc(c.place)}</p>
            <h3 class="ch-title">${esc(c.title)}</h3>
            <p class="ch-en">${esc(c.en)}</p>
            <p class="ch-epi">${esc(c.epi)}</p>
          </header>
          ${c.text.map((t, k) => `<div class="cine-card cine-p${k === n - 2 ? ' big' : ''}" data-reveal>${para(t, 0, 'ch-p cp')}</div>`).join('')}
          <p class="cine-card ch-src mono" data-reveal>取材 · ${esc(c.src)}</p>
        </div>
      </article>`;
    }
    return `
      <article class="chapter st-ch" id="st-${c.id}" data-reveal data-ch="${i + 1}" data-art="${c.art}">
        <div class="ch-art-wrap">
          <span class="ch-num" aria-hidden="true">${ROMAN[i]}</span>
          <div class="ch-art art-${c.art}">${artHTML(c, form)}</div>
          ${acts ? `<div class="ch-acts">${acts}</div>` : ''}
        </div>
        <div class="ch-body">
          <p class="ch-place mono">CHAPTER ${no} · ${esc(c.place)}</p>
          <h3 class="ch-title">${esc(c.title)}</h3>
          <p class="ch-en">${esc(c.en)}</p>
          <p class="ch-epi">${esc(c.epi)}</p>
          ${c.text.map((t, k) => para(t, k)).join('')}
          ${fragHTML(c)}
          <p class="ch-src mono">取材 · ${esc(c.src)}</p>
        </div>
      </article>`;
  }
  /** 横幅里的氛围粒子：本体是从火山口升起的火星，纯烬是缓缓落下的白灰 */
  function ambient(form) {
    let s = '';
    const n = form === 'base' ? 16 : 14;
    for (let i = 0; i < n; i++) {
      const a = Math.sin(i * 12.9898) * 43758.5453, rr = a - Math.floor(a), b = Math.sin(i * 78.233) * 12345.678, r2 = b - Math.floor(b);
      if (form === 'base') s += `<i style="--x:${(rr * 60 - 20).toFixed(1)}px;--dx:${(20 + r2 * 120).toFixed(0)}px;--dy:${(-60 - rr * 110).toFixed(0)}px;--d:${(-r2 * 5).toFixed(2)}s;--t:${(3.2 + rr * 2.6).toFixed(2)}s;--s:${(0.6 + r2 * 0.9).toFixed(2)}"></i>`;
      else s += `<i style="left:${(rr * 100).toFixed(1)}%;top:${(-10 + r2 * 40).toFixed(1)}%;--dx:${(-30 + r2 * 70).toFixed(0)}px;--dy:${(140 + rr * 160).toFixed(0)}px;--d:${(-rr * 12).toFixed(2)}s;--t:${(9 + r2 * 7).toFixed(2)}s;--s:${(0.7 + rr * 1.1).toFixed(2)}"></i>`;
    }
    return s;
  }

  let ctxRef = null;
  function render(ctx) {
    const D = window.EYJA, S = ART();
    const host = $('#story');
    if (!D || !S || !host || !D.parts || !D.story) return false;
    ctxRef = ctx;
    const form = ctx.form;
    const part = D.parts.find((p) => p.form === form) || D.parts[0];
    const other = D.parts.find((p) => p !== part);
    const chapters = D.story.filter((c) => c.part === part.part);
    const oc = other ? D.story.filter((c) => c.part === other.part) : [];
    teardown();

    const words = form === 'base'
      ? ['EYJAFJALLA', '艾雅法拉', 'VOLCANOLOGIST', '火山学家', 'CATASTROPHE MESSENGER', '天灾信使', 'LITTLE SHEEP', '小黑羊', 'ADELE NAUMANN', '阿黛尔·瑙曼']
      : ['HVÍT ASKA', '纯烬', 'WHITE ASH', '白色的灰烬', 'STEP BY STEP', '一步，又一步', 'SONG OF LIFE', '生命之歌', 'MARSHMALLOW No.3', '棉花糖3号'];
    const row = (arr) => [...arr, ...arr].map((w) => `<span>${w}</span><i>✦</i>`).join('');
    const marquee = `<div class="marquee" aria-hidden="true"><div class="mq-row">${row(words)}</div><div class="mq-row rev">${row([...words].reverse())}</div></div>`;
    const cn = CN[chapters.length] || chapters.length;
    const banner = `
      <div class="part-banner pb-${part.form} current st-banner" id="st-top" data-reveal>
        <div class="pb-bg" aria-hidden="true"><div class="pb-ph"></div><div class="pb-bake"></div><i class="pb-crater"></i><div class="pb-amb pb-amb-${part.form}">${ambient(part.form)}</div></div>
        <div class="pb-text">
          <span class="pb-no">${part.no}</span><h3>${part.title}</h3><p class="pb-en">${part.en}</p>
          <p class="pb-lead">${part.lead}</p>
          ${part.epi ? `<p class="pb-epi">${esc(part.epi)}</p>` : ''}
        </div>
        <nav class="pb-toc" aria-label="${part.no} 目录"><ol>${chapters.map((c, i) => `<li style="--i:${i}"><a href="#st-${c.id}"><i>${ROMAN[i]}</i><span>${esc(c.title)}</span></a></li>`).join('')}</ol></nav>
      </div>`;
    const next = other ? `
      <div class="part-next pb-${other.form} st-next" data-reveal>
        <div class="pn-bg" aria-hidden="true"><div class="pn-ph"></div><div class="pn-bake"></div></div>
        <div class="pn-text">
          <p class="pn-fin"><span class="mono">${part.no}</span><b>${part.title}</b><span>· 终 ·</span></p>
          <span class="pb-no">${other.no} · ${form === 'base' ? 'TO BE CONTINUED' : 'BEFORE ALL THIS'}</span>
          <h3>${other.title}<small>${other.en}</small></h3>
          <p>${form === 'base' ? '她的故事还没有结束。' : '在这一切之前，'}${other.lead}</p>
          <ol class="pn-list">${oc.map((c, i) => `<li><i>${ROMAN[i]}</i>${esc(c.title)}</li>`).join('')}</ol>
          <div class="pn-acts">
            <button class="btn btn-primary pn-go" type="button" data-act="form" data-then="story">${ctx.A && ctx.A.icon ? ctx.A.icon('swap') : ''}切换至「${D.forms[other.form].mood}」，读${other.no}</button>
            <a class="pn-back" href="#st-top">↑ 重读 ${part.no}</a>
          </div>
        </div>
      </div>` : '';
    const pre = form === 'base' ? 'b' : 'a';
    const people = D.people.filter((p) => !p.form || p.form === form);
    const personArt = (p) => {
      if (p.art === 'wreath') return `<div class="pp-scene">${S.personWreath()}</div>`;
      if (p.art === 'pink') return `<div class="pp-scene">${S.personPink()}</div>`;
      return ctx.personArt ? ctx.personArt(p) : '';
    };
    const peopleHTML = `
      <h3 class="sub-h" data-reveal>她身边的人 <small>PEOPLE · ${form === 'base' ? '追光路上' : '余烬之后'}</small></h3>
      <div class="people st-people n${people.length}">${people.map((p, i) => `
        <div class="panel person" data-reveal style="--i:${i}">
          <div class="pp-img">${personArt(p)}</div>
          <div class="pp-body"><span class="mono">${esc(p.role)}</span><h4>${esc(p.name)}</h4><p>${esc(p.text)}</p>
            ${p.ch && p.ch.length ? `<p class="pp-ch"><span class="mono">出现于</span>${p.ch.map((n) => `<a href="#st-${pre}${n}" title="${esc((chapters[n - 1] || {}).title || '')}">${ROMAN[n - 1]}</a>`).join('')}</p>` : ''}
          </div>
        </div>`).join('')}</div>`;
    const tl = D.timeline.filter((t) => t.form === form);
    const tlHTML = `
      <h3 class="sub-h" data-reveal>年表 <small>${form === 'base' ? 'CHRONOLOGY · 术师篇' : 'CHRONOLOGY · 医疗篇'}</small></h3>
      <div class="tl">
        <div class="tl-line"><i class="tl-fill"></i></div>
        ${tl.map((t) => `<div class="tl-item f-${t.form}" data-reveal><span class="tl-dot"></span><div class="panel tl-card"><span class="tl-era mono">${t.era}</span><span class="tl-when">${t.when}</span><h3>${t.title}</h3><p>${t.text}</p>${t.ch ? `<a class="tl-ch mono" href="#st-${pre}${t.ch}">→ CHAPTER ${String(t.ch).padStart(2, '0')} · ${esc((chapters[t.ch - 1] || {}).title || '')}</a>` : ''}</div></div>`).join('')}
      </div>`;

    host.innerHTML = marquee + ctx.head('03', 'HER STORY', '故事', part.sub || `${cn}个片段。`) + `
      <div class="wrap st-wrap st-${form}">
        ${banner}
        ${chapters.map((c, i) => chapterHTML(c, i, form)).join('')}
        ${next}
        ${peopleHTML}
        ${tlHTML}
      </div>`;
    host.dataset.form = form;
    after(host, form, part, chapters);
    return true;
  }

  /* ---------------------------------------------------- 渲染之后：烘焙、导航条、观察者 */
  let nearIO = null, chIO = null, visIO = null, tapeT = 0, resizeT = 0, lastSize = '';
  function teardown() {
    [nearIO, chIO, visIO].forEach((o) => o && o.disconnect());
    nearIO = chIO = visIO = null;
    stopTape();
    closeLetter(true);
  }
  function after(host, form, part, chapters) {
    // 1) 横幅全景：立刻开始（空闲时分条画），画好前是一张同色调的渐变底
    mountPano($('.pb-bake', host), form, 'banner');
    // 2) 快到了再烘焙：整屏场景、篇末预告
    nearIO = new IntersectionObserver((ens) => ens.forEach((en) => {
      if (!en.isIntersecting) return;
      nearIO.unobserve(en.target);
      if (en.target.classList.contains('bk-host')) mountCine(en.target);
      else if (en.target.classList.contains('pn-bake')) mountPano(en.target, form === 'base' ? 'alter' : 'base', 'next');
    }), { rootMargin: '220% 0px' });
    $$('.bk-host, .pn-bake', host).forEach((el) => nearIO.observe(el));
    // 3) 导航条
    buildRail(part, chapters, form);
    chIO = new IntersectionObserver((ens) => {
      for (const en of ens) en.target.classList.toggle('st-now', en.isIntersecting);
      const now = $('.st-ch.st-now', host);
      setActive(now ? +now.dataset.ch : 0);
    }, { rootMargin: '-46% 0px -52% 0px' });
    $$('.st-ch', host).forEach((el) => chIO.observe(el));
    // 故事区在视野附近时才挂滚动监听（导航条进度）
    visIO = new IntersectionObserver((ens) => { const on = ens.some((e) => e.isIntersecting); on ? addEventListener('scroll', onScroll, { passive: true }) : removeEventListener('scroll', onScroll); if (on) onScroll(); }, { rootMargin: '0px' });
    visIO.observe($('.st-wrap', host));
    lastSize = sizeSig();
  }
  const sizeSig = () => `${Math.round(vw() / 80)}:${Math.round(innerHeight / 80)}`;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const host = $('#story');
      if (!host || !$('.st-wrap', host) || sizeSig() === lastSize) return;
      lastSize = sizeSig();
      const form = host.dataset.form;
      mountPano($('.pb-bake', host), form, 'banner');
      const pn = $('.pn-bake', host); if (pn && pn.firstChild) mountPano(pn, form === 'base' ? 'alter' : 'base', 'next');
      $$('.bk-host', host).forEach((el) => { if (el.firstChild) mountCine(el); });
    }, 500);
  });

  /* ---------------------------------------------------- 章节导航条（挂在 body 上：#story 有 content-visibility，里面的 fixed 元素会被当成局部定位） */
  let rail = null, active = 0, ticking = false;
  function buildRail(part, chapters, form) {
    if (!rail) {
      rail = document.createElement('nav');
      rail.className = 'st-rail';
      rail.setAttribute('aria-label', '故事章节');
      document.body.appendChild(rail);
      rail.addEventListener('click', (e) => {
        const b = e.target.closest('.sx-tog');
        if (b) { rail.classList.toggle('open'); b.setAttribute('aria-expanded', rail.classList.contains('open')); return; }
        if (e.target.closest('a')) rail.classList.remove('open');
      });
    }
    rail.dataset.form = form;
    rail.innerHTML = `
      <button class="sx-tog" type="button" aria-expanded="false" aria-label="展开章节列表"><b class="mono">${part.no}</b><span class="sx-cur"><i class="mono">I</i><em>${esc(chapters[0].title)}</em></span><span class="sx-bar"><i></i></span></button>
      <p class="sx-part"><b class="mono">${part.no}</b><span>${part.title}</span></p>
      <ol>${chapters.map((c, i) => `<li><a href="#st-${c.id}" data-i="${i + 1}"><i class="mono">${ROMAN[i]}</i><span>${esc(c.title)}</span></a></li>`).join('')}</ol>
      <div class="sx-track"><i class="sx-fill"></i></div>`;
    rail._titles = chapters.map((c) => c.title);
    active = 0;
    rail.classList.remove('on', 'open');
  }
  function setActive(n) {
    if (!rail || n === active) return;
    active = n;
    rail.classList.toggle('on', n > 0);
    $$('a', rail).forEach((a) => a.classList.toggle('on', +a.dataset.i === n));
    if (n > 0) {
      const cur = $('.sx-cur', rail);
      cur.querySelector('i').textContent = ROMAN[n - 1];
      cur.querySelector('em').textContent = rail._titles[n - 1];
    } else rail.classList.remove('open');
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const chs = $$('#story .st-ch');
      if (!rail || !chs.length) return;
      const a = chs[0].getBoundingClientRect().top, b = chs[chs.length - 1].getBoundingClientRect().bottom;
      const mid = innerHeight * 0.5, p = Math.min(1, Math.max(0, (mid - a) / Math.max(1, b - a)));
      rail.style.setProperty('--p', p.toFixed(4));
    });
  }

  /* ---------------------------------------------------- 信笺浮层 */
  let modal = null, lastFocus = null;
  function openLetter(l, kicker) {
    if (!l) return;
    closeLetter(true);
    lastFocus = document.activeElement;
    modal = document.createElement('div');
    modal.className = `st-modal ink-${l.ink || 'paper'} f-${document.documentElement.dataset.form}`;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', l.title);
    modal.innerHTML = `<div class="stm-back" data-close></div>
      <article class="stm-paper">
        <button class="stm-x" type="button" data-close aria-label="收起信">×</button>
        <p class="stm-k mono">${esc(kicker || l.title)}</p>
        <div class="stm-lines">${l.lines.map((t, i) => `<p style="--i:${i}"${i === 0 ? ' class="to"' : ''}>${esc(t)}</p>`).join('')}</div>
        ${l.note ? `<p class="stm-note" style="--i:${l.lines.length}">${esc(l.note)}</p>` : ''}
        <i class="stm-flower" aria-hidden="true"></i>
      </article>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeLetter(); });
    modal.addEventListener('wheel', (e) => { if (!e.target.closest('.stm-paper')) e.preventDefault(); }, { passive: false });
    requestAnimationFrame(() => requestAnimationFrame(() => { if (modal) { modal.classList.add('on'); const x = $('.stm-x', modal); if (x) x.focus({ preventScroll: true }); } }));
    sfx('whoosh');
  }
  function closeLetter(now) {
    if (!modal) return;
    const m = modal;
    modal = null;
    if (now) { m.remove(); return; }
    m.classList.remove('on');
    setTimeout(() => m.remove(), 450);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    $$('#story .x-open').forEach((c) => c.classList.remove('x-open'));
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal) { e.stopPropagation(); closeLetter(); } }, true);

  /* ---------------------------------------------------- 录音带 */
  let tape = null, tapeGuard = null;
  function playTrack(ch, i) {
    const c = chapterOf(ch);
    if (!c || !c.frag || !c.frag.tracks) return;
    const tr = c.frag.tracks;
    clearTimeout(tapeT);
    if (i >= tr.length) { stopTape(); return; }
    tape = { ch, i };
    if (!tapeGuard) tapeGuard = new IntersectionObserver((ens) => ens.forEach((en) => { if (!en.isIntersecting && tape && tape.ch === en.target) stopTape(); }));
    tapeGuard.observe(ch);
    ch.classList.add('x-play');
    ch.classList.toggle('x-rec', !!tr[i].empty);
    $$('.fr-tape li', ch).forEach((li, k) => li.classList.toggle('on', k === i));
    const now = $('.tk-now', ch);
    if (now) now.innerHTML = `<span class="mono">${tr[i].empty ? '● REC' : 'NOW ' + String(i + 1).padStart(2, '0')}</span><em>${esc(tr[i].d)}</em>`;
    const lab = $('.cs-label .now', ch);
    if (lab) lab.textContent = tr[i].empty ? '· · ·' : tr[i].t;
    const act = $('.ch-act[data-x="play"] span', ch);
    if (act) act.textContent = ALT.play;
    sfx('tick');
    tapeT = setTimeout(() => (tr[i].empty ? stopTape(true) : playTrack(ch, i + 1)), tr[i].empty ? 5200 : 7000);
  }
  function stopTape(keep) {
    clearTimeout(tapeT);
    if (!tape) return;
    const ch = tape.ch;
    tape = null;
    ch.classList.remove('x-play', 'x-rec');
    $$('.fr-tape li', ch).forEach((li) => li.classList.remove('on'));
    const act = $('.ch-act[data-x="play"] span', ch);
    if (act) act.textContent = '播放磁带';
    if (!keep) { const now = $('.tk-now', ch); if (now) now.innerHTML = '<span class="mono">STOP</span><em>磁带停在这里。再点一首，接着听。</em>'; }
  }

  /* ---------------------------------------------------- 互动 */
  function chapterOf(ch) {
    const D = window.EYJA, form = document.documentElement.dataset.form;
    const part = D.parts.find((p) => p.form === form) || D.parts[0];
    return D.story.filter((c) => c.part === part.part)[+ch.dataset.ch - 1];
  }
  /** 重新触发一段一次性的动画：去掉类名、强制一次样式计算、再加回来 */
  const pulse = (el, cls, ms) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); clearTimeout(el['_t' + cls]); el['_t' + cls] = setTimeout(() => el.classList.remove(cls), ms); };
  function toggle(ch, cls, x) {
    const on = ch.classList.toggle(cls);
    $$(`.ch-act[data-x="${x}"]`, ch).forEach((b) => {
      const sp = b.querySelector('span');
      if (!b.dataset.label) b.dataset.label = sp.textContent;
      sp.textContent = on ? b.dataset.alt : b.dataset.label;
      b.setAttribute('aria-pressed', on);
    });
    return on;
  }
  const ACT = {
    lamp(ch) { toggle(ch, 'x-off', 'lamp'); sfx('tick'); },
    pet(ch) { pulse(ch, 'x-hot', 2600); },
    whistle(ch) { pulse(ch, 'x-flip', 2600); sfx('sparkle'); },
    letter(ch) {
      const c = chapterOf(ch);
      ch.classList.add('x-open');
      setTimeout(() => openLetter(c && c.frag), reduce ? 0 : 520);
    },
    aid(ch) { toggle(ch, 'x-aid', 'aid'); sfx('tick'); },
    candle(ch) { const on = toggle(ch, 'x-blown', 'candle'); if (on) sfx('whoosh'); },
    sense(ch) { pulse(ch, 'x-sense', 2200); sfx('tick'); },
    book(ch) { toggle(ch, 'x-book', 'book'); sfx('whoosh'); },
    seek(ch, b) {
      const i = b && b.dataset.i != null ? +b.dataset.i : [0, 1, 2, 3, 4].find((k) => !ch.classList.contains('f' + k));
      if (i == null) { pulse(ch, 'x-cheer', 1600); return; }
      if (b && b.classList.contains('hs')) {
        ch.classList.add('f' + i);
      } else {
        // 按钮：给下一只没找到的小羊一个提示（亮一下），再点它才算找到
        const sp = $(`.iv-sheep.s${i}`, ch); if (sp) { sp.classList.remove('hint'); void sp.offsetWidth; sp.classList.add('hint'); }
        return;
      }
      const n = [0, 1, 2, 3, 4].filter((k) => ch.classList.contains('f' + k)).length;
      const em = $('.iv-count em', ch); if (em) em.textContent = n;
      sfx('sparkle');
      if (n === 5) { ch.classList.add('x-all'); pulse(ch, 'x-cheer', 1600); }
    },
    deal(ch, b) { const on = b.classList.toggle('on'); b.setAttribute('aria-pressed', on); sfx('tick'); if ($$('.deal.on', ch).length === 3) pulse(ch, 'x-cheer', 1600); },
    scorch(ch) { toggle(ch, 'x-scorch', 'scorch'); },
    drop(ch) { pulse(ch, 'x-drop', 2400); sfx('tick'); },
    obs(ch) { pulse(ch, 'x-obs', 2600); },
    play(ch) { if (tape && tape.ch === ch) stopTape(); else playTrack(ch, 0); },
    track(ch, b) { playTrack(ch, +b.dataset.i); },
    'env-a'(ch) { const c = chapterOf(ch); pulse(ch, 'x-ea', 900); setTimeout(() => openLetter(c && c.frag && c.frag.letters[0], '寄往莱塔尼亚 · 她写给卡恩前辈'), reduce ? 0 : 380); },
    'env-b'(ch) { const c = chapterOf(ch); pulse(ch, 'x-eb', 900); setTimeout(() => openLetter(c && c.frag && c.frag.letters[1], '寄自汐斯塔 · 凯勒老师写给她'), reduce ? 0 : 380); },
    bloom(ch) { toggle(ch, 'x-warn', 'bloom'); sfx('tick'); },
    check(ch, b) { const on = b.classList.toggle('on'); b.setAttribute('aria-pressed', on); if (on) pulse(ch, 'x-fed', 1400); sfx('tick'); },
    plant(ch) {
      const c = chapterOf(ch), pr = $('.nt-promise b', ch);
      if (pr && c && c.promise) pr.textContent = c.promise;
      pulse(ch, 'x-plant', 5200);
      sfx('sparkle');
    },
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#story [data-x]');
    if (!b) return;
    const ch = b.closest('.st-ch');
    const fn = ACT[b.dataset.x];
    if (!ch || !fn) return;
    e.preventDefault();
    fn(ch, b);
  });
  // 录音带：章节离开视野就停
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopTape(true); });


  return { render, bake, palette, stopTape, closeLetter };
})();
