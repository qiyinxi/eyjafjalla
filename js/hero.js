/* =========================================================
 * 首屏 · 加载页 · 导航（main.js 在几个时间点调用这里）
 *
 *  加载页（HERO.ld）
 *   - 跟随形态上色：术师是熔岩夜色，医疗是白灰晴空
 *   - 进度条是一条记录笔：术师画地震仪的震颤（越接近 100% 越剧烈，满格时一次“喷发”），
 *     医疗画平稳的心电（生命体征监测）；读完以后继续走纸
 *   - 立绘下载完成后，在首屏立绘将要出现的位置“解密”出一张扫描像：
 *     术师是热成像（她的小羊一高兴就发烫），医疗是蓝晒（cyanotype）式的单色正片
 *   - 标题下像题记一样逐句讲她的故事（取材于档案与年表，均为概述），读完停在题词上
 *   - 进入：幕布从中缝上下拉开，先停成宽银幕的黑边，再完全收起；扫描像等真正的立绘出现后溶解过去
 *  开场（HERO.intro）：首屏各元素按镜头顺序依次入场（只动 transform / opacity）
 *  另有：首屏文字（名字印章、作战速览、署名）、鼠标视差、首屏的小动作（HERO.stage）、导航（HERO.nav）
 *
 * 性能：加载页的两块画布共用一个 rAF 循环，60 帧封顶、读完后 30 帧，加载页移除即停；
 *       扫描像只在“解密”的 1.3 秒里逐帧绘制，之后是静止画面，扫描光带交给合成器
 * ========================================================= */
window.HERO = (() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const formNow = () => (root.dataset.form === 'alter' ? 'alter' : 'base');

  /* ====================================================
   * 加载页
   * ==================================================== */
  // 终端里的每一行对应一项真实加载任务（main.js boot 按顺序使用）；字幕逐句讲故事（概述，出处见 data.js 档案 / 年表）
  const LD_TEXT = {
    base: {
      sub: 'PRTS · OPERATOR ARCHIVE · CASTER',
      tag: 'OPERATOR RECORD · LN02',
      trace: ['SEISMIC TREMOR', 'EYJAFJALLAJÖKULL · 63.63°N 19.62°W'],
      scan: ['THERMAL IMAGING', 'LN02 · CASTER'],
      tasks: ['AUTHENTICATING DOCTOR', 'DECRYPTING OPERATOR FILE: EYJAFJALLA [LN02]', 'ARMING SEISMIC ARRAY', 'LINKING MEDIC FORM: HVÍT ASKA [LN10]', 'WAKING THE LITTLE BLACK SHEEP'],
      story: [
        '莱塔尼亚，威廉大学。学者瑙曼夫妇的女儿。',
        '父母在一次火山实地考察中遭遇碎屑流，再也没有回来。',
        '她接过他们的报告，登上了罗德岛——也染上了矿石病。',
        '听力一点点被夺走，她仍想把全部时间留给火山。',
        '身边跟着一群温顺、嗜睡、一高兴就发烫的小黑羊。',
      ],
      last: '大地沸腾之处，她俯身倾听。',
    },
    alter: {
      sub: 'PRTS · OPERATOR ARCHIVE · MEDIC',
      tag: 'OPERATOR RECORD · LN10',
      trace: ['VITAL SIGNS', 'MONITORING · STABLE'],
      scan: ['ASH SCAN', 'LN10 · MEDIC'],
      tasks: ['AUTHENTICATING DOCTOR', 'RESTORING OPERATOR FILE: HVÍT ASKA [LN10]', 'SYNCING VITAL SIGNS · LIP-READING', 'LINKING CASTER FORM: EYJAFJALLA [LN02]', 'LOOKING FOR THE INVISIBLE LAMBS'],
      story: [
        '汐斯塔，火山博物馆。一位羊兽主提出了一场“交易”。',
        '梦中的聚会、迟来的真相——还有母亲留下的防护服。',
        '她学会了读唇语，也与卡恩、凯勒各自和解。',
        '然后穿上那件外套，一座接一座地登上火山。',
        '看不见的粉色小羊，一直跟在她身边。',
      ],
      last: '灰烬落定之处，万物重新生长。',
    },
  };

  const LD = (() => {
    const el = $('#loader');
    const form = formNow();
    const T = LD_TEXT[form];
    let trace = null, portrait = null, raf = 0, lastFrame = 0, gone = !el;
    let pTarget = 0, pShown = 0, done = false, doneAt = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    /** 背景里飘的小颗粒：术师是往上飘的火星，医疗是往下落的灰与羽（纯 CSS 位移动画，交给合成器） */
    function motes() {
      if (reduce) return '';
      let s = '';
      for (let i = 0; i < 16; i++) {
        const x = (Math.random() * 100).toFixed(1), d = (7 + Math.random() * 9).toFixed(1), dl = (-Math.random() * 16).toFixed(1);
        const sz = (form === 'base' ? 3 + Math.random() * 4 : 5 + Math.random() * 6).toFixed(1), dx = ((Math.random() - 0.5) * 120).toFixed(0);
        s += `<i class="ld-mote" style="--x:${x}%;--d:${d}s;--dl:${dl}s;--sz:${sz}px;--dx:${dx}px"></i>`;
      }
      return s;
    }

    function init() {
      el.classList.add('ld-v2', 'ld-' + form);
      el.insertAdjacentHTML('afterbegin', `
        <div class="ld-sh t" aria-hidden="true"></div><div class="ld-sh b" aria-hidden="true"></div>
        <div class="ld-fx" aria-hidden="true"><i class="ld-glow"></i><i class="ld-grain"></i>${motes()}</div>
        <div class="ld-seam" aria-hidden="true"></div>
        <div class="ld-portrait" aria-hidden="true"><canvas></canvas><div class="ld-pmask"><i class="ld-pscan"></i></div>
          <div class="ld-reticle"><i></i><i></i><b class="mono">${form === 'base' ? 'LN02' : 'LN10'}</b></div>
          <span class="ld-ptag tl mono"><b>${T.scan[0]}</b>${T.scan[1]}</span><span class="ld-ptag br mono">DECRYPTING · 0%</span>
          <i class="ld-corner c1"></i><i class="ld-corner c2"></i><i class="ld-corner c3"></i><i class="ld-corner c4"></i></div>`);
      // 字幕放在文字栏里、标题下面，像一段题记
      const inner = $('.ld-inner', el), emb = inner && $('.ld-emblem', inner);
      if (emb) emb.insertAdjacentHTML('afterend', `<div class="ld-story" aria-hidden="true"><small class="mono">${T.tag}</small><div class="ld-sline"></div></div>`);
      const sub = $('.ld-emblem small', el);
      if (sub) sub.textContent = T.sub;
      const bar = $('.ld-bar', el);
      if (bar) {
        bar.classList.add('has-trace');
        bar.insertAdjacentHTML('afterbegin', `<span class="ld-tlab mono"><b>${T.trace[0]}</b><em>${T.trace[1]}</em></span><canvas class="ld-trace"></canvas>`);
        trace = setupTrace($('.ld-trace', bar));
      }
      addEventListener('resize', () => { if (gone) return; if (trace) trace.resize(); placePortrait(); });
    }

    /* ---------------- 记录笔：地震仪 / 心电 ---------------- */
    function setupTrace(cv) {
      const g = cv.getContext('2d');
      let W = 0, H = 0, ys = null, penX = 0, ph = 0, grid = null, head = null;
      const col = form === 'base'
        ? { line: '255,120,170', hot: '255,210,150', grid: 'rgba(255,110,160,0.10)', axis: 'rgba(255,110,160,0.22)' }
        : { line: '210,51,79', hot: '255,255,255', grid: 'rgba(80,110,170,0.10)', axis: 'rgba(80,110,170,0.25)' };
      function resize() {
        W = Math.max(40, Math.round(cv.clientWidth)); H = Math.max(20, Math.round(cv.clientHeight));
        cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
        const old = ys;
        ys = new Float32Array(W + 1);
        if (old) ys.set(old.subarray(0, Math.min(old.length, ys.length)));
        // 网格预先画好（每帧只贴一次）
        grid = document.createElement('canvas');
        grid.width = cv.width; grid.height = cv.height;
        const q = grid.getContext('2d');
        q.scale(DPR, DPR);
        q.fillStyle = col.grid;
        for (let x = 0; x < W; x += 12) q.fillRect(x, 0, 1, H);
        for (let y = H / 2 % 12; y < H; y += 12) q.fillRect(0, y, W, 1);
        q.fillStyle = col.axis;
        q.fillRect(0, Math.round(H / 2), W, 1);
        // 笔尖光点（预渲染，不用 shadowBlur）
        head = document.createElement('canvas');
        head.width = head.height = 48;
        const hg = head.getContext('2d'), rg = hg.createRadialGradient(24, 24, 0, 24, 24, 24);
        rg.addColorStop(0, `rgba(${col.hot},1)`); rg.addColorStop(0.25, `rgba(${col.line},0.8)`); rg.addColorStop(1, `rgba(${col.line},0)`);
        hg.fillStyle = rg; hg.fillRect(0, 0, 48, 48);
      }
      resize();
      /** 第 x 列的样本（p：此刻的进度，live：读完后的走纸） */
      function sample(p, live) {
        const A = H / 2 - 4;
        if (form === 'base') {
          // 地震仪：底噪 + 随进度增强的震颤；偶尔一记尖峰；刚满格时来一段喷发
          const sinceDone = done ? (performance.now() - doneAt) / 1000 : -1;
          const erupt = sinceDone >= 0 && sinceDone < 1.6 ? Math.exp(-sinceDone * 1.6) : 0;
          let amp = 1.2 + 9 * p * p + (live ? 5 : 0) + 22 * erupt;
          ph += 0.9;
          let v = (Math.sin(ph * 0.7) * 0.4 + Math.sin(ph * 1.9 + 1) * 0.3 + (Math.random() - 0.5) * 1.3) * amp;
          if (Math.random() < 0.012 + 0.03 * p) v += (Math.random() - 0.5) * (8 + 26 * p);
          return clamp(v, -A, A);
        }
        // 心电：约每 70 列一拍（P 波 · QRS · T 波），底噪很轻
        ph += 1;
        const u = (ph % 70) / 70;
        const bump = (c, w, h) => h * Math.exp(-Math.pow((u - c) / w, 2));
        let v = bump(0.18, 0.035, -2.5) + bump(0.36, 0.008, 3) + bump(0.4, 0.012, -A * 0.95) + bump(0.435, 0.01, A * 0.38) + bump(0.62, 0.05, -4.5);
        v += (Math.random() - 0.5) * 0.9;
        return clamp(v, -A, A);
      }
      function step(dt) {
        const live = done && pShown > 0.999;
        if (!live) {
          const nx = Math.min(W, Math.round(pShown * W));
          for (; penX < nx; penX++) ys[penX] = sample(pShown, false);
        } else {
          // 走纸：整条向左卷动，新的样本从右端写入
          const n = Math.max(1, Math.round(dt * 60));
          ys.copyWithin(0, n);
          for (let i = W - n; i <= W; i++) ys[i] = sample(1, true);
          penX = W;
        }
      }
      function draw() {
        g.setTransform(DPR, 0, 0, DPR, 0, 0);
        g.clearRect(0, 0, W, H);
        g.drawImage(grid, 0, 0, W, H);
        const n = Math.min(penX, W);
        if (n < 2) return;
        const mid = H / 2;
        g.lineJoin = 'round';
        const path = () => { g.beginPath(); g.moveTo(0, mid + ys[0]); for (let x = 1; x < n; x++) g.lineTo(x, mid + ys[x]); };
        // 两遍：宽而淡的一遍当作光晕，细而亮的一遍是线本身
        path(); g.strokeStyle = `rgba(${col.line},0.22)`; g.lineWidth = 4; g.stroke();
        path(); g.strokeStyle = `rgba(${col.line},0.95)`; g.lineWidth = 1.3; g.stroke();
        const hx = n - 1, hy = mid + ys[hx];
        g.drawImage(head, hx - 12, hy - 12, 24, 24);
      }
      return { resize, step, draw };
    }

    /* ---------------- 扫描像：热成像 / 灰白底片 ---------------- */
    // 亮度 → 颜色的查找表
    function lut(stops) {
      const out = new Uint8ClampedArray(256 * 3);
      for (let i = 0; i < 256; i++) {
        const t = i / 255;
        let k = 0;
        while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
        const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
        const u = clamp((t - t0) / (t1 - t0 || 1), 0, 1);
        for (let j = 0; j < 3; j++) out[i * 3 + j] = c0[j] + (c1[j] - c0[j]) * u;
      }
      return out;
    }
    const hex = (h) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16));
    const LUTS = {
      base: lut([[0, hex('#14030d')], [0.22, hex('#3d0833')], [0.42, hex('#8c1450')], [0.6, hex('#ff3f72')], [0.76, hex('#ff8a3d')], [0.9, hex('#ffd27a')], [1, hex('#fff8e6')]]),
      // 医疗：蓝晒（cyanotype）式的单色正片——深处是墨蓝，亮处是带一点灰的浅蓝，在白底上仍然看得清轮廓
      alter: lut([[0, hex('#162143')], [0.35, hex('#34508a')], [0.62, hex('#6f93cb')], [0.85, hex('#aac3e6')], [1, hex('#cfdef3')]]),
    };
    function toScan(img) {
      const maxH = 820;
      const s = Math.min(1, maxH / (img.naturalHeight || img.height));
      const w = Math.max(1, Math.round((img.naturalWidth || img.width) * s)), h = Math.max(1, Math.round((img.naturalHeight || img.height) * s));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      // 热成像本来就是糊的：先轻轻模糊一下（只做这一次）
      if ('filter' in g) g.filter = form === 'base' ? 'blur(1.6px)' : 'blur(0.6px)';
      g.drawImage(img, 0, 0, w, h);
      g.filter = 'none';
      let d;
      try { d = g.getImageData(0, 0, w, h); } catch (e) { return null; } // 跨域污染：放弃扫描像
      const px = d.data, L = LUTS[form];
      for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        let l = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) | 0;
        // 每三行压暗一行：扫描线直接烤进图里（只落在人物身上，不会在空白处画出一个方框）
        const dim = ((i / 4 / w) | 0) % 3 === 0 ? 0.72 : 1;
        px[i] = L[l * 3] * dim; px[i + 1] = L[l * 3 + 1] * dim; px[i + 2] = L[l * 3 + 2] * dim;
      }
      g.putImageData(d, 0, 0);
      return c;
    }
    /**
     * 扫描框摆在首屏立绘将要出现的位置（立绘按 contain 放进 .hv-art）。
     * 立绘还没下载完时先按正方形摆出取景框（大多数立绘是正方形），到了再按实际比例校正
     */
    let placed = false;
    function placePortrait() {
      const art = $('.hv-art');
      const box = el && $('.ld-portrait', el);
      if (!art || !box) return false;
      const r = art.getBoundingClientRect();
      if (!r.width) return false;
      const iw = portrait ? portrait.src.width : 1, ih = portrait ? portrait.src.height : 1;
      const s = Math.min(r.width / iw, r.height / ih);
      const w = iw * s, h = ih * s;
      Object.assign(box.style, { left: r.left + (r.width - w) / 2 + 'px', top: r.top + (r.height - h) / 2 + 'px', width: w + 'px', height: h + 'px' });
      placed = true;
      box.classList.add('on');
      if (!portrait) return true;
      const cv = $('canvas', box), k = Math.min(DPR, 1.5);
      const cw = Math.round(w * k), ch = Math.round(h * k);
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; portrait.drawn = -1; }
      return true;
    }
    /** 扫描光带只落在人物身上：用人物剪影（缩小的透明度图）给光带的容器做遮罩——遮罩静止，光带只做位移 */
    function maskFrom(src) {
      const m = el && $('.ld-pmask', el);
      if (!m) return;
      try {
        const s = Math.min(1, 240 / src.height);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(src.width * s)); c.height = Math.max(1, Math.round(src.height * s));
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
        const url = `url(${c.toDataURL('image/png')})`;
        m.style.webkitMaskImage = m.style.maskImage = url;
      } catch (e) { m.remove(); }
    }
    function setPortrait(img) {
      if (gone || !img || portrait) return;
      const t0 = performance.now();
      const src = toScan(img);
      if (/[?&]debug\b/.test(location.search)) window.__ldScanMs = Math.round(performance.now() - t0);
      if (!src) return;
      portrait = { src, t0: performance.now(), dur: reduce ? 0 : 1300, drawn: -1 };
      placePortrait();
      maskFrom(src);
      el.classList.add('has-portrait');
      const tag = $('.ld-ptag.br', el);
      if (tag && !done) tag.textContent = 'FILE DECRYPTED';
      kick();
    }
    function drawPortrait(now) {
      const box = $('.ld-portrait', el), cv = box && $('canvas', box);
      if (!cv) return false;
      const k = portrait.dur ? clamp((now - portrait.t0) / portrait.dur, 0, 1) : 1;
      if (portrait.drawn === 1 && k >= 1) return false;
      const g = cv.getContext('2d'), W = cv.width, H = cv.height;
      g.clearRect(0, 0, W, H);
      const e = 1 - Math.pow(1 - k, 2);
      const y = Math.round(H * e);
      g.globalAlpha = 1;
      if (y > 0) g.drawImage(portrait.src, 0, 0, portrait.src.width, portrait.src.height * e, 0, 0, W, y);
      if (k < 1) {
        // 解密前沿：几条错位的切片 + 一道亮线
        const sh = portrait.src.height / H;
        for (let i = 0; i < 5; i++) {
          const sy = y - Math.random() * 40 * (1 - k) - 4, hh = 2 + Math.random() * 7;
          if (sy < 0) continue;
          const dx = (Math.random() - 0.5) * 22;
          g.globalAlpha = 0.85;
          g.drawImage(portrait.src, 0, sy * sh, portrait.src.width, hh * sh, dx, sy, W, hh);
        }
        g.globalAlpha = 1;
        const lg = g.createLinearGradient(0, y - 18, 0, y + 2);
        const c = form === 'base' ? '255,200,150' : '120,170,240';
        lg.addColorStop(0, `rgba(${c},0)`); lg.addColorStop(1, `rgba(${c},0.9)`);
        g.fillStyle = lg;
        g.globalCompositeOperation = 'source-atop';
        g.fillRect(0, y - 18, W, 20);
        g.globalCompositeOperation = 'source-over';
      } else {
        box.classList.add('shown');
      }
      portrait.drawn = k >= 1 ? 1 : 0;
      return k < 1;
    }

    /* ---------------- 循环 ---------------- */
    let last = performance.now();
    function kick() { if (!raf && !gone && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } }
    function loop(now) {
      raf = 0;
      if (gone || document.hidden) return;
      raf = requestAnimationFrame(loop);
      // 加载中 60 帧，读完以后（等待点击进入）降到 30 帧
      const cap = done && pShown > 0.999 ? 1000 / 30 - 2 : 1000 / 60 - 1.5;
      if (now - lastFrame < cap) return;
      lastFrame = now;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      pShown += (pTarget - pShown) * Math.min(1, dt * (reduce ? 60 : 5));
      if (Math.abs(pTarget - pShown) < 0.0015) pShown = pTarget;
      if (!placed && pTarget > 0) placePortrait();
      if (trace) { trace.step(dt); trace.draw(); }
      if (portrait) drawPortrait(now);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

    /* ---------------- 字幕：按自己的节奏一句句往下讲（与加载快慢无关），读完后停在题词上 ---------------- */
    let storyIdx = -1, storyT = 0, sayAt = 0;
    function say(text) {
      const box = el && $('.ld-sline', el);
      if (!box || !text) return;
      sayAt = performance.now();
      const old = $$('p', box);
      old.forEach((p) => { p.classList.add('out'); setTimeout(() => p.remove(), 700); });
      const p = document.createElement('p');
      p.textContent = text;
      box.appendChild(p);
      requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('in')));
    }
    function nextLine() {
      if (gone || done) return;
      storyIdx++;
      if (storyIdx < T.story.length) { say(T.story[storyIdx]); storyT = setTimeout(nextLine, reduce ? 2600 : 3300); }
    }

    if (el) { init(); kick(); storyT = setTimeout(nextLine, reduce ? 0 : 500); }

    return {
      form,
      /** 这个形态的加载任务名（main.js 用它替换默认文字） */
      labels: () => T.tasks.slice(),
      /** 第 i 行任务出现（字幕按自己的节奏走，这里不用） */
      step() {},
      progress(p) {
        pTarget = clamp(p, 0, 1);
        if (!portrait && el && !done) { const tag = $('.ld-ptag.br', el); if (tag) tag.textContent = `DECRYPTING · ${Math.round(pTarget * 100)}%`; }
        kick();
      },
      portrait: setPortrait,
      /** 全部读完：记录笔来一段喷发 / 平稳的心跳；当前这句字幕至少停留 1.6 秒，再换成题词 */
      done() {
        if (done) return;
        done = true; doneAt = performance.now(); pTarget = 1;
        clearTimeout(storyT);
        setTimeout(() => { if (!gone) say(T.last); }, Math.max(0, 1600 - (performance.now() - sayAt)));
        el && el.classList.add('ready');
        const tag = el && $('.ld-ptag.br', el);
        // 立绘没下载下来（资源站慢或失败）：取景框里的准星暗下去，标注“后台重试”——首屏会在后台悄悄重试
        if (!portrait && el) el.classList.add('no-portrait');
        if (tag) tag.textContent = !portrait ? 'SIGNAL WEAK · RETRYING' : form === 'base' ? 'SIGNAL LOCKED' : 'VITALS STABLE';
        const hint = el && $('.ld-hint', el);
        if (hint && !matchMedia('(pointer: coarse)').matches) hint.textContent = '按 Enter 进入 · 建议佩戴耳机 · 按 T 可随时切换形态';
        kick();
      },
      /** 进入：幕布拉开（先停成宽银幕黑边，再完全收起），扫描像溶解成首屏立绘；返回移除加载页的时刻 */
      exit() {
        if (!el || el.classList.contains('out')) return;
        placePortrait();
        // 立绘从 scale(0.97) translateX(-24px) 推近：扫描像先对齐到同一起点，溶解时两张图重合
        const pbox = $('.ld-portrait', el);
        if (pbox) pbox.classList.add('align');
        el.classList.add('out');
        if (reduce) el.classList.add('out-quick');
        const fx = window.FX;
        if (fx && !reduce) {
          const W = innerWidth, H = innerHeight;
          // 火星 / 白灰沿中缝从中间向两边迸开
          for (let k = 0; k < 7; k++) {
            const side = k % 2 ? 1 : -1, x = W / 2 + side * Math.ceil(k / 2) * W * 0.14;
            setTimeout(() => {
              if (form === 'base') fx.emberBurst(x, H / 2, 14, [90, 420], { g: 50, lift: 0 });
              else fx.ashBurst(x, H / 2, 12, [90, 380]);
            }, Math.ceil(k / 2) * 55);
          }
        }
        const t0 = performance.now();
        const kill = () => { if (gone) return; gone = true; if (raf) cancelAnimationFrame(raf); raf = 0; el.remove(); };
        if (reduce) { setTimeout(kill, 500); return; }
        // 扫描像等真正的立绘出现（.hv-art 去掉 gone）才溶解，并从她身上散开一圈；最多等 2.4 秒。
        // 加载页至少留到幕布完全收起（2.3 秒），溶解完再移除
        const art = $('.hv-art');
        let dissolved = false;
        const dissolve = () => {
          if (dissolved) return;
          dissolved = true;
          if (pbox) pbox.classList.add('dissolve');
          const r = pbox && portrait ? pbox.getBoundingClientRect() : null;
          if (fx && r && r.width) {
            for (let k = 0; k < 6; k++) {
              const x = r.left + r.width * (0.3 + Math.random() * 0.4), y = r.top + r.height * (0.15 + Math.random() * 0.75);
              if (form === 'base') fx.emberBurst(x, y, 10, [40, 200], { g: -40 });
              else fx.ashBurst(x, y, 8, [40, 180]);
            }
          }
          setTimeout(kill, Math.max(1000, 2350 - (performance.now() - t0)));
        };
        if (!portrait || !art || !art.classList.contains('gone')) setTimeout(dissolve, 500);
        else {
          const mo = new MutationObserver(() => { if (!art.classList.contains('gone')) { mo.disconnect(); setTimeout(dissolve, 220); } });
          mo.observe(art, { attributes: true, attributeFilter: ['class'] });
          setTimeout(() => { mo.disconnect(); dissolve(); }, 2400);
        }
      },
      get gone() { return gone; },
    };
  })();

  /* ====================================================
   * 首屏文字：名字、作战速览、署名（main.js renderHero / hud 调用）
   * ==================================================== */
  const D = window.EYJA;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /** 名字：「纯烬」这样的前缀竖排成一枚印章，主名「艾雅法拉」两个形态一样大、不折行 */
  function nameHTML(f) {
    const baseName = D.forms.base.name;
    const pre = f.name.length > baseName.length && f.name.endsWith(baseName) ? f.name.slice(0, -baseName.length) : '';
    const main = pre ? baseName : f.name;
    const chars = [...main].map((c, k) => `<span class="ch" style="--k:${k + (pre ? 1 : 0)}">${c}</span>`).join('');
    const seal = pre ? `<span class="hn-pre" aria-hidden="true">${[...pre].map((c) => `<i>${c}</i>`).join('')}</span>` : '';
    // data-t：光晕层（::before 的文字阴影）用的文字——光晕单独成层只栅格化一次，流光每次重绘名字时不必重算模糊
    return `<h1 class="hero-name${pre ? ' has-pre' : ''}">${seal}<span class="hn-main" data-t="${esc(main)}" aria-label="${esc(f.name)}">${chars}</span></h1>`;
  }
  const lastNum = (s) => { const m = String(s).match(/[\d.]+(?!.*[\d.])/); return m ? parseFloat(m[0]) : 0; };
  const cells = (f) => f.range[2].split(' ').length;
  /** 作战速览（精英2 · 90级）：两个形态用同一组指标，条长按两者中的较大值归一，切换形态时一眼看出差别 */
  function readoutHTML(f, form) {
    const o = D.forms[form === 'base' ? 'alter' : 'base'];
    const iv = (x) => lastNum((x.misc.find((m) => m[0] === '攻击间隔') || [])[1]);
    const cost = (x) => lastNum((x.misc.find((m) => m[0] === '部署费用') || [])[1]);
    const rows = [
      ['ATK', f.stats.atk[3], o.stats.atk[3], ''],
      ['INTERVAL', iv(f), iv(o), 's'],
      ['RANGE', cells(f), cells(o), '格'],
      ['COST', cost(f), cost(o), ''],
    ];
    const sk = f.skills[2];
    const head = form === 'base' ? ['CASTER', '法术伤害 · 可对空'] : ['MEDIC', '治疗 · 元素回复'];
    return `<p class="rd-h"><b>${head[0]}</b><span>${head[1]}</span></p>
      <dl>${rows.map(([k, v, w, u]) => `<div style="--v:${(v / Math.max(v, w)).toFixed(3)}"><dt>${k}</dt><dd>${v}<small>${u}</small></dd><i></i></div>`).join('')}</dl>
      <p class="rd-sk"><span class="rd-ic">${window.ART ? ART.skillEmblem(sk.id) : ''}<img src="${sk.icon}" alt="" referrerpolicy="no-referrer" onerror="this.remove()"></span><span><small>SKILL 3</small><b>${sk.name}</b></span></p>
      <p class="rd-f">${f.stats.phases[3]}</p>`;
  }
  /** 署名：画师一行，配音一行（语言用小标签） */
  function creditHTML() {
    const m = D.meta;
    return `<span><em>ILLUST.</em>${esc(m.illustrator)}</span><span><em>CV</em>${m.cv.map(([l, n]) => `<i>${esc(l)}</i>${esc(n)}`).join('')}</span>`;
  }

  /* ====================================================
   * 导航：滑动的当前区块指示条、窄屏的当前区块名、全屏编号菜单
   * ==================================================== */
  const NAV = (() => {
    let links = null, ind = null, cur = null, cap = null, inited = false;
    /** 每个链接补上编号（按链接顺序，菜单里不会重号）与英文名（从已渲染的区块标题里读），窄屏菜单里显示 */
    function annotate() {
      $$('a', links).forEach((a, i) => {
        const id = a.getAttribute('href').slice(1), sec = document.getElementById(id);
        const en = sec && $('.sec-en', sec);
        a.dataset.no = String(i + 1).padStart(2, '0');
        if (en && en.textContent.trim()) a.dataset.en = en.textContent.trim();
        a.style.setProperty('--i', i);
      });
    }
    function place() {
      if (!ind) return;
      const a = cur && links.querySelector(`a[href="#${cur}"]`);
      const vertical = getComputedStyle(links).flexDirection === 'column' || getComputedStyle(links).display === 'grid';
      if (!a || vertical || !a.offsetWidth) { ind.classList.remove('on'); return; }
      const pad = 11, w = Math.max(8, a.offsetWidth - pad * 2);
      ind.style.transform = `translateX(${a.offsetLeft + pad}px) scaleX(${(w / 100).toFixed(3)})`;
      ind.classList.add('on');
    }
    function label() {
      if (!cap) return;
      const a = cur && links.querySelector(`a[href="#${cur}"]`);
      const nav = $('#nav');
      if (!a) { nav.classList.remove('has-cur'); return; }
      $('b', cap).textContent = a.dataset.no || '';
      $('em', cap).textContent = a.textContent.trim();
      nav.classList.add('has-cur');
    }
    function init() {
      if (inited) return;
      links = $('.nav-links');
      const nav = $('#nav');
      if (!links || !nav) return;
      inited = true;
      annotate();
      ind = document.createElement('i');
      ind.className = 'nav-ind';
      ind.setAttribute('aria-hidden', 'true');
      links.appendChild(ind);
      const brand = $('.nav-brand');
      if (brand) { brand.insertAdjacentHTML('beforeend', '<span class="nav-cur" aria-hidden="true"><b></b><em></em></span>'); cap = $('.nav-cur', brand); }
      // 汉堡按钮：三道横线，打开时变成 ×
      const mb = $('.menu-btn');
      if (mb) { mb.innerHTML = '<i></i><i></i><i></i>'; mb.setAttribute('aria-expanded', 'false'); mb.setAttribute('aria-controls', 'nav-links'); }
      links.id = links.id || 'nav-links';
      new MutationObserver(() => {
        const open = links.classList.contains('open');
        nav.classList.toggle('menu-open', open);
        if (mb) mb.setAttribute('aria-expanded', String(open));
        if (open) annotate();
      }).observe(links, { attributes: true, attributeFilter: ['class'] });
      // 点菜单外的空白处关闭
      links.addEventListener('click', (e) => { if (e.target === links) links.classList.remove('open'); });
      const io = new IntersectionObserver((ens) => {
        for (const en of ens) if (en.isIntersecting) { cur = en.target.id; place(); label(); }
      }, { rootMargin: '-45% 0px -50% 0px' });
      $$('#app > section, #app > footer').forEach((s) => io.observe(s));
      let rz = 0;
      addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(place, 120); });
      if (document.fonts) document.fonts.ready.then(place);
    }
    return { init, place };
  })();

  /* ====================================================
   * 首屏舞台上的小生气（main.js boot 里 bind 一次）
   *  - 法杖尖不时冒一点：术师是火星，医疗是白灰与小星星
   *  - 鼠标停在首屏的按钮上，她会看过去
   *  - 打盹时头顶飘出“z”
   *  - 离开首屏一阵子再回来，她会打个招呼
   *  - 换精英阶段：一道扫描光从上往下扫过立绘
   * 全部由计时器驱动（不另开逐帧循环），首屏不在视野里时什么都不做
   * ==================================================== */
  const STAGE = (() => {
    let api = null, visible = false, awayAt = 0, ambT = 0, zT = 0, lastZ = 0, live = false;
    const fx = () => window.FX;
    const pup = () => (api && api.pup ? api.pup() : null);
    const on = () => visible && !document.hidden && api && !root.classList.contains('intro');
    /**
     * 计时器只在首屏看得见（至少 35% 在视口里）、标签页在前台时存在；
     * 离开首屏 / 切到后台时全部清掉（不留空转的计时器），回来时重新排上
     */
    function sync() {
      const want = !!api && visible && !document.hidden;
      if (want === live) return;
      live = want;
      if (want) { ambient(); zzz(); timecode(); }
      else { clearTimeout(ambT); clearTimeout(zT); clearTimeout(tcT); }
    }
    /** 法杖尖的一小撮火星 / 白灰（2.8–5.5 秒一次） */
    function ambient() {
      clearTimeout(ambT);
      if (reduce || !live) return;
      ambT = setTimeout(ambient, 2800 + Math.random() * 2700);
      const p = pup(), F = fx();
      if (!on() || !p || !F || scrollY > innerHeight * 0.6) return;
      const tip = p.anchor && p.anchor('staffTip');
      if (!tip) return;
      if (api.form() === 'base') F.emberBurst(tip[0], tip[1], 3, [10, 55], { g: -45 });
      else F.ashBurst(tip[0], tip[1], 2, [10, 45]);
    }
    /** 打盹：头顶一个接一个飘出“z” */
    function zzz() {
      clearTimeout(zT);
      if (!live) return;
      zT = setTimeout(zzz, 1000);
      const p = pup();
      if (!on() || !p || !p.state || p.state.sleepy < 0.6) return;
      const now = performance.now();
      if (now - lastZ < 1500) return;
      lastZ = now;
      const h = p.head && p.head(), vis = $('.hero-visual');
      if (!h || !vis) return;
      const r = vis.getBoundingClientRect();
      const z = document.createElement('span');
      z.className = 'hv-zzz';
      z.textContent = 'z';
      z.style.left = h[0] - r.left + 30 + 'px';
      z.style.top = h[1] - r.top - 40 + 'px';
      z.style.setProperty('--s', (0.8 + Math.random() * 0.5).toFixed(2));
      vis.appendChild(z);
      z.addEventListener('animationend', () => z.remove());
      setTimeout(() => z.remove(), 4000);
    }
    /** HUD 的录像时间码：进入页面后开始走（每秒更新一次，首屏不在视野里就不动） */
    const tc0 = performance.now();
    let tcT = 0;
    function timecode() {
      clearTimeout(tcT);
      if (!live) return;
      tcT = setTimeout(timecode, 1000);
      const rec = $('.hv-hud .tl .rec');
      if (!rec) return;
      let tc = rec.nextElementSibling;
      if (!tc || !tc.classList.contains('tc')) { tc = document.createElement('span'); tc.className = 'tc'; rec.after(tc); }
      const s = Math.floor((performance.now() - tc0) / 1000), p = (n) => String(n).padStart(2, '0');
      tc.textContent = `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
    }
    function welcome() {
      const p = pup();
      if (!p || !p.act) return;
      const rp = (p.rig && p.rig.params) || {};
      p.act(rp.waveArm ? 'wave' : 'tilt');
    }
    /** 鼠标停在首屏的按钮、她的名字上：她看过去 */
    function onOver(e) {
      const b = e.target.closest && e.target.closest('.hv-acts button, .hero-actions button, .hero-name, .rd-sk');
      const p = pup();
      if (!b || !p || !p.glance) return;
      const r = b.getBoundingClientRect();
      p.glance(r.left + r.width / 2, r.top + r.height / 2, 1.3);
    }
    /** 换立绘：一道扫描光从上往下扫过，沿途迸出几点火星 / 白灰 */
    function sweep() {
      const vis = $('.hero-visual');
      if (!vis || reduce) return;
      const old = $('.hv-sweep', vis);
      if (old) old.remove();
      const s = document.createElement('i');
      s.className = 'hv-sweep';
      vis.appendChild(s);
      s.addEventListener('animationend', () => s.remove());
      const r = $('.hv-art', vis).getBoundingClientRect(), F = fx(), base = api && api.form() === 'base';
      if (F) for (let k = 0; k < 6; k++) setTimeout(() => {
        const x = r.left + r.width * (0.3 + Math.random() * 0.4), y = r.top + r.height * (0.08 + (k / 5) * 0.84);
        if (base) F.emberBurst(x, y, 6, [30, 160], { g: -20 }); else F.ashBurst(x, y, 5, [30, 150]);
      }, 60 + k * 95);
    }
    function bind(o) {
      api = o;
      const hero = $('#hero');
      if (!hero) return;
      // 离开首屏一阵子（8 秒以上）再回来：她打个招呼。一次回调里可能有多条记录，以最后一条为准
      new IntersectionObserver((ens) => {
        const was = visible;
        visible = ens[ens.length - 1].isIntersecting;
        if (visible && !was && awayAt && performance.now() - awayAt > 8000) setTimeout(welcome, 350);
        if (!visible && was) awayAt = performance.now();
        sync();
      }, { threshold: 0.35 }).observe(hero);
      document.addEventListener('visibilitychange', sync);
      hero.addEventListener('pointerover', onOver);
      // 点首屏的空白处：她看向点的地方
      hero.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, a, .hv-art, .hv-dyn, .hv-3d, input')) return;
        const p = pup();
        if (p && p.glance) p.glance(e.clientX, e.clientY, 1.4);
      });
      // 往下滚动离开首屏：她低头看一眼你要去的地方（最多 1.6 秒一次）
      let lastY = scrollY, lastGl = 0;
      addEventListener('scroll', () => {
        const y = scrollY, dy = y - lastY;
        lastY = y;
        if (!visible || dy < 6 || y > innerHeight * 0.8) return;
        const now = performance.now();
        if (now - lastGl < 1600) return;
        lastGl = now;
        const p = pup();
        if (p && p.glance) p.glance(innerWidth * 0.5, innerHeight * 1.4, 1.1);
      }, { passive: true });
      sync();
    }
    return { bind, sweep, welcome };
  })();

  /* ====================================================
   * 鼠标视差：立绘框轻微转向、法阵平移、竖排巨字上下错开。
   * 每帧最多写一次，直接写这三个元素的 transform（不经过 #hero 上的自定义属性，免得整棵子树重算样式）
   * ==================================================== */
  let pxRaf = 0, pxX = 0, pxY = 0;
  function parallax(x, y) {
    pxX = x; pxY = y;
    if (pxRaf || reduce) return;
    pxRaf = requestAnimationFrame(() => {
      pxRaf = 0;
      const mx = clamp((pxX / innerWidth - 0.5) * 2, -1, 1), my = clamp((pxY / innerHeight - 0.5) * 2, -1, 1);
      const vis = $('.hero-visual'), circ = $('.hv-circle'), giant = $('.hero-giant');
      if (vis) vis.style.transform = vis.classList.contains('mode-3d') ? '' : `perspective(1400px) rotateY(${(mx * -5).toFixed(2)}deg) rotateX(${(my * 4).toFixed(2)}deg)`;
      if (circ) circ.style.transform = `translate(${(mx * 16).toFixed(1)}px, ${(my * 16).toFixed(1)}px)`;
      if (giant) giant.style.transform = matchMedia('(min-width: 981px)').matches ? `translateY(${(my * -18).toFixed(1)}px)` : `translateX(${(mx * -30).toFixed(1)}px)`;
    });
  }

  /* ====================================================
   * 开场：加载页拉开后，首屏元素按镜头顺序入场（样式见 hero.css 的 html.intro）
   * ==================================================== */
  function intro() {
    if (reduce) return;
    root.classList.add('intro');
    clearTimeout(intro.t);
    intro.t = setTimeout(() => root.classList.remove('intro'), 4200);
  }

  return { ld: LD, intro, nav: NAV, stage: STAGE, parallax, text: LD_TEXT, nameHTML, readoutHTML, creditHTML };
})();
