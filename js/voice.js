/* =========================================================
 * 语音区：离线分析 + 播放器外观（main.js 负责播放与状态）
 * - analyze(url)：取语音文件解码一次，算出 20ms 一帧的音量包络与 16 段频谱。
 *   可视化全部按 <audio> 的 currentTime 查表，真实跟着声音走；分析分片进行，不卡主线程。
 * - 播放器只在语音播放时逐帧更新（由 main.js 的 rAF 驱动，声音停了就停），
 *   每帧只写 transform 与几个 CSS 变量，不触发布局。
 * ========================================================= */
window.VOICE = (() => {
  'use strict';
  const FPS = 50;              // 包络帧率（20ms）
  const BHOP = 2;              // 频谱每 2 帧（40ms）算一次，播放时线性插值
  const NB = 16;               // 频段数
  const LO = 90, HI = 8000;    // 频谱范围（Hz，对数分布）
  const SR = 22050, N = 512;   // 解码采样率 / FFT 点数
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------------------------------------------- 分类：按游戏里的语音触发场景（PRTS 语音记录的 place type） */
  const CATS = [['all', '全部'], ['home', '秘书'], ['grow', '成长'], ['battle', '作战'], ['infra', '基建'], ['fest', '节庆']];
  // HOME_*：1–10 · GACHA / LEVEL_UP / EVOLVE：11–14 · SQUAD / BATTLE_* / 结算：17–32 · BUILDING_*：33–36 · 标题 / 节日 / 问候：37–44
  const catOf = (n) => (n <= 10 ? 'home' : n <= 16 ? 'grow' : n <= 32 ? 'battle' : n <= 36 ? 'infra' : 'fest');
  const CAT_NAME = Object.fromEntries(CATS);

  /* 频段中心频率 */
  const bandHz = Array.from({ length: NB }, (_, i) => LO * Math.pow(HI / LO, (i + 0.5) / NB));

  /* ---------------------------------------------------- FFT（基 2，原位） */
  const COS = new Float32Array(N / 2), SIN = new Float32Array(N / 2), HANN = new Float32Array(N);
  for (let i = 0; i < N / 2; i++) { COS[i] = Math.cos((2 * Math.PI * i) / N); SIN[i] = -Math.sin((2 * Math.PI * i) / N); }
  for (let i = 0; i < N; i++) HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  function fft(re, im) {
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= N; len <<= 1) {
      const half = len >> 1, step = N / len;
      for (let i = 0; i < N; i += len) {
        for (let j = 0, w = 0; j < half; j++, w += step) {
          const a = i + j, b = a + half;
          const tr = re[b] * COS[w] - im[b] * SIN[w], ti = re[b] * SIN[w] + im[b] * COS[w];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }
  const nap = () => new Promise((r) => setTimeout(r, 0));

  /** 解码后的单声道数据 → { env, bands, frames, dur }（分片计算，每片约几毫秒） */
  async function crunch(d, sr) {
    const hop = Math.round(sr / FPS), frames = Math.max(1, Math.ceil(d.length / hop));
    const bf = Math.ceil(frames / BHOP);
    const env = new Float32Array(frames), db = new Float32Array(bf * NB), bands = new Uint8Array(bf * NB);
    const binHz = sr / N, edges = [];
    for (let i = 0; i <= NB; i++) edges.push(Math.round((LO * Math.pow(HI / LO, i / NB)) / binHz));
    for (let i = 1; i <= NB; i++) if (edges[i] <= edges[i - 1]) edges[i] = edges[i - 1] + 1;
    const tilt = bandHz.map((f) => 4.5 * Math.log2(f / LO)); // 语音能量集中在低频：按 +4.5dB/倍频程补偿，高频段看得见
    const re = new Float32Array(N), im = new Float32Array(N);
    let mxE = 1e-6, mxB = -1e9, t0 = performance.now();
    for (let f = 0; f < frames; f++) {
      if (performance.now() - t0 > 8) { await nap(); t0 = performance.now(); }
      const a = f * hop, b = Math.min(d.length, a + hop);
      let s = 0;
      for (let j = a; j < b; j++) s += d[j] * d[j];
      env[f] = Math.sqrt(s / Math.max(1, b - a));
      if (env[f] > mxE) mxE = env[f];
      if (f % BHOP) continue;
      const c = a + (hop >> 1) - (N >> 1);
      for (let j = 0; j < N; j++) { const k = c + j; re[j] = k >= 0 && k < d.length ? d[k] * HANN[j] : 0; im[j] = 0; }
      fft(re, im);
      const o = (f / BHOP) * NB;
      for (let k = 0; k < NB; k++) {
        let e = 0;
        for (let q = edges[k]; q < edges[k + 1]; q++) e += re[q] * re[q] + im[q] * im[q];
        const v = 10 * Math.log10(e / (edges[k + 1] - edges[k]) + 1e-12) + tilt[k];
        db[o + k] = v;
        if (v > mxB) mxB = v;
      }
    }
    for (let i = 0; i < frames; i++) env[i] = clamp((env[i] / mxE - 0.06) * 1.7, 0, 1);
    for (let i = 0; i < db.length; i++) bands[i] = Math.round(clamp((db[i] - (mxB - 52)) / 52, 0, 1) * 255);
    return { env, bands, frames, dur: d.length / sr };
  }

  /* ---------------------------------------------------- 分析缓存（每条语音只取一次；失败返回 null，下次再试） */
  const cache = new Map();
  function analyze(url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url, { referrerPolicy: 'no-referrer' })
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((buf) => {
        const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        return new AC(1, 1, SR).decodeAudioData(buf);
      })
      .then((ab) => crunch(ab.getChannelData(0), ab.sampleRate))
      .catch(() => null)
      .then((res) => { if (!res) cache.delete(url); return res; });
    cache.set(url, p);
    if (cache.size > 60) cache.delete(cache.keys().next().value);
    return p;
  }

  /** t 秒处的音量（0–1），帧间线性插值 */
  function levelAt(res, t) {
    const x = t * FPS, i = Math.floor(x), e = res.env;
    if (i < 0) return 0;
    if (i >= e.length - 1) return e[e.length - 1] || 0;
    return e[i] + (e[i + 1] - e[i]) * (x - i);
  }
  /** t 秒处的 16 段频谱，写进 out（0–1） */
  function bandsAt(res, t, out) {
    const bf = res.bands.length / NB, x = (t * FPS) / BHOP;
    const i = clamp(Math.floor(x), 0, bf - 1), j = Math.min(bf - 1, i + 1), k = clamp(x - i, 0, 1);
    for (let b = 0; b < NB; b++) out[b] = (res.bands[i * NB + b] * (1 - k) + res.bands[j * NB + b] * k) / 255;
    return out;
  }
  /** 没有分析结果时（取不到文件）：按音节节奏编一个包络，频谱从它派生 */
  const synthLevel = (t) => Math.pow(Math.max(0, Math.sin(t * 13)), 1.4) * (0.55 + 0.45 * Math.sin(t * 3.1 + 1));
  const SHAPE = bandHz.map((f) => Math.exp(-Math.pow(Math.log2(f / 420), 2) / 3.2));
  function synthBands(t, lv, out) {
    for (let b = 0; b < NB; b++) out[b] = clamp(lv * SHAPE[b] * (0.75 + 0.25 * Math.sin(t * 9 + b * 1.7)), 0, 1);
    return out;
  }

  /* ---------------------------------------------------- 波形（整条语音的响度轮廓，镜像竖条，一条 path） */
  const FLAT = 'M0 49h1000v2H0z';
  function wavePath(env, n = 120) {
    if (!env || !env.length) return FLAT;
    const W = 1000 / n, bw = W * 0.56, per = env.length / n;
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * per), b = Math.max(a + 1, Math.floor((i + 1) * per));
      let m = 0;
      for (let j = a; j < b && j < env.length; j++) if (env[j] > m) m = env[j];
      const h = Math.max(2, Math.pow(m, 0.8) * 94);
      d += `M${(i * W + (W - bw) / 2).toFixed(1)} ${(50 - h / 2).toFixed(1)}h${bw.toFixed(1)}v${h.toFixed(1)}h-${bw.toFixed(1)}z`;
    }
    return d;
  }

  /* ---------------------------------------------------- 字幕 / 台词的逐字点亮 */
  /** 听觉模拟时“没听清”的字：按字与语音编号确定（同一句每次漏掉的都一样），约三成 */
  const missed = (ch, i, n) => /[一-龥A-Za-z0-9]/.test(ch) && ((i * 73 + n * 151 + 17) % 97) / 97 < 0.32;
  const spans = (text, n) => [...text].map((ch, i) => `<span${missed(ch, i, n) ? ' class="miss"' : ''}>${esc(ch)}</span>`).join('');

  /* ---------------------------------------------------- 占位包络与卡片上的“声纹”
   * 还没取到真实语音时，按“音节 + 停顿”的节奏编一条包络（由语音编号决定，同一条每次都一样）；
   * 真实语音分析过一次后，卡片与播放器换成真实的响度轮廓 */
  const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const seedCache = new Map();
  function seedEnv(n, len = 150) {
    const key = n + ':' + len;
    if (seedCache.has(key)) return seedCache.get(key);
    const r = rng(n * 7919 + 13), env = new Float32Array(len);
    let i = 2 + ((r() * 3) | 0);
    while (i < len - 3) {
      const words = 2 + ((r() * 5) | 0), loud = 0.55 + r() * 0.45;
      for (let w = 0; w < words && i < len - 3; w++) {
        const L = 3 + ((r() * 6) | 0), A = loud * (0.5 + r() * 0.5);
        for (let k = 0; k < L && i < len; k++, i++) env[i] = A * Math.sin((Math.PI * (k + 0.5)) / L) * (0.82 + 0.18 * r());
        i += (r() * 2) | 0;
      }
      i += 3 + ((r() * 7) | 0);
    }
    seedCache.set(key, env);
    return env;
  }
  /** 卡片声纹：viewBox 100×24 的镜像竖条（一条 path） */
  function miniPath(env, n = 34) {
    if (!env || !env.length) return 'M0 11h100v2H0z';
    const W = 100 / n, bw = W * 0.52, per = env.length / n;
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * per), b = Math.max(a + 1, Math.floor((i + 1) * per));
      let m = 0;
      for (let j = a; j < b && j < env.length; j++) if (env[j] > m) m = env[j];
      const h = Math.max(0.9, Math.pow(m, 0.75) * 23);
      d += `M${(i * W + (W - bw) / 2).toFixed(2)} ${(12 - h / 2).toFixed(2)}h${bw.toFixed(2)}v${h.toFixed(2)}h-${bw.toFixed(2)}z`;
    }
    return d;
  }

  /* ---------------------------------------------------- 播放器外观 */
  const LANGS = [['jp', '日', '日本語'], ['cn', '中', '中文'], ['kr', '韩', '한국어'], ['en', '英', 'English']];
  const IDLE = [0.18, 0.3, 0.42, 0.5, 0.46, 0.38, 0.44, 0.34, 0.28, 0.3, 0.22, 0.18, 0.14, 0.12, 0.09, 0.07];
  const CUT = bandHz.findIndex((f) => f > (window.AUDIO && AUDIO.SIM_HZ ? AUDIO.SIM_HZ : 520));
  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${String((s / 60) | 0).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  /** 分类在「全部」里的小标题 */
  const GROUPS = {
    home: ['HOME', '办公室里的日常'], grow: ['PROMOTION', '报到、晋升与作战记录'], battle: ['OPERATION', '编队、部署与结算'],
    infra: ['BASE', '设施、戳一下与信赖触摸'], fest: ['GREETINGS', '标题、节日与问候'],
  };
  const cueNo = (cue) => `CUE · VOICE ${String(cue.n).padStart(3, '0')}${cue.set ? ` · ${esc(cue.set)}` : ''}`;
  /** 头像没加载出来时垫在底下的原创小羊（不显示任何错误提示） */
  const avaArt = (mode) => (window.SHEEP && SHEEP.lamb ? SHEEP.lamb(mode === 'lip' ? 'pink' : 'black') : '');

  /**
   * 播放器（上方的“声卡”）。o = { f, deck, cv, langs, lang, auto, mode, icon, cue: {n, title, text, set} }
   */
  function deckHTML(o) {
    const { f, deck, icon, cue } = o;
    const cv = Object.fromEntries(o.cv.map(([k, v]) => [k, v]));
    const lips = deck.mode === 'lip'
      ? '<span class="vd-lips" aria-hidden="true"><i class="lp-in"></i><i class="lp-u"></i><i class="lp-l"></i></span>'
      : `<span class="vd-aid" aria-hidden="true">${icon('ear')}</span>`;
    const cutPct = ((CUT / NB) * 100).toFixed(2);
    const wd = cue ? wavePath(seedEnv(cue.n)) : FLAT;
    return `
      <div class="panel glass vc-deck idle" data-reveal data-mode="${deck.mode}">
        <div class="vd-id">
          <div class="vd-ava"><i class="vd-ring"></i><i class="vd-ring r2"></i>
            <span class="vd-ph" aria-hidden="true">${avaArt(deck.mode)}</span>
            <img src="${f.avatar}" alt="${esc(f.name)} 头像" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="this.remove()">${lips}
          </div>
          <span class="vd-tag mono">${deck.tag}</span>
        </div>
        <div class="vd-main">
          <div class="vd-meta mono"><i class="vd-dot"></i><span class="vd-state">STANDBY</span><span class="vd-no">${cue ? cueNo(cue) : ''}</span><span class="vd-time">00:00 / 00:00</span></div>
          <b class="vd-title">${cue ? esc(cue.title) : '待命中'}</b>
          <p class="vd-line${cue ? ' cue' : ''}">${cue ? esc(cue.text) : '选择一条语音开始播放。'}</p>
          <div class="vd-wave" role="slider" tabindex="0" aria-label="播放进度（左右方向键快进快退）" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <svg class="vw vw-lo" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path d="${wd}"/></svg>
            <span class="vw-mask"><span class="vw-in"><svg class="vw vw-hi" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path d="${wd}"/></svg></span></span>
            <i class="vw-head"></i>
          </div>
          <div class="vd-ctrl">
            <button type="button" class="icon-btn" data-vt="prev" aria-label="上一条">${icon('arrow', 'flip')}</button>
            <button type="button" class="icon-btn vd-play" data-vt="toggle" aria-label="播放 / 暂停">${icon('play')}</button>
            <button type="button" class="icon-btn" data-vt="next" aria-label="下一条">${icon('arrow')}</button>
            <button type="button" class="vd-chip" data-vt="auto" aria-pressed="${o.auto}">连播</button>
            <button type="button" class="vd-chip vd-mode" data-vt="mode" aria-pressed="${o.mode}" title="${esc(deck.modeTip)}">${deck.modeName}</button>
          </div>
        </div>
        <div class="vd-side">
          <div class="vd-spec" aria-hidden="true" style="--cut:${cutPct}%">
            <span class="vs-bars">${IDLE.map((r, i) => `<i style="--vr:${r}"${i >= CUT ? ' class="hi"' : ''}></i>`).join('')}</span>
            <span class="vs-caps">${IDLE.map((r, i) => `<b style="--vr:${r}"${i >= CUT ? ' class="hi"' : ''}></b>`).join('')}</span>
            <span class="vs-th"><em>她的听阈 ≈ ${window.AUDIO && AUDIO.SIM_HZ || 520}Hz</em></span>
            <span class="vs-axis"><b>90</b><b>500</b><b>2k</b><b>8k Hz</b></span>
          </div>
          <div class="seg vd-lang" role="group" aria-label="语音语言">
            ${LANGS.map(([k, z, full]) => `<button type="button" data-lang="${k}" class="${o.lang === k ? 'on' : ''}"${o.langs.includes(k) ? '' : ' disabled'} title="${full} · CV ${esc(cv[z] || '')}"><b>${z}</b><small>${esc(cv[z] || '')}</small></button>`).join('')}
          </div>
          <p class="vd-note">${esc(deck.note)}<cite>—— ${esc(deck.src)}</cite></p>
        </div>
      </div>`;
  }

  /** 一张语音卡。o = { cond, playing, tag, heard, env（真实包络，有就用） } */
  function cardHTML(v, i, o) {
    const [n, title, text] = v;
    const cond = o.cond ? `<span class="vc-cond">${esc(o.cond)}</span>` : '';
    const cls = `vc-card${o.playing ? ' playing' : ''}${o.heard ? ' heard' : ''}`;
    return `<button type="button" class="${cls}" data-voice="${n}" data-reveal style="--i:${i % 8}" aria-label="${esc(title)}：${esc(text)}${o.heard ? '（已听）' : ''}">
      <span class="vc-top"><span class="vc-no mono">${o.tag || `VOICE ${String(n).padStart(3, '0')}`}</span><span class="vc-cat">${CAT_NAME[catOf(n)]}</span>${cond}</span>
      <b>${esc(title)}</b><p>${esc(text)}</p>
      <span class="vc-sig${o.env ? ' real' : ''}" aria-hidden="true"><svg viewBox="0 0 100 24" preserveAspectRatio="none"><path d="${miniPath(o.env || seedEnv(n, 90))}"/></svg></span>
      <span class="vc-meter" aria-hidden="true"><i style="--vm:.55"></i><i style="--vm:1"></i><i style="--vm:.75"></i><i style="--vm:.9"></i><i style="--vm:.5"></i></span>
      <span class="vc-prog" aria-hidden="true"></span>
    </button>`;
  }
  /** 卡片的声纹换成真实包络（语音分析完成后调用） */
  function cardEnv(card, env) {
    const p = card && card.querySelector('.vc-sig path');
    if (!p || !env) return;
    p.setAttribute('d', miniPath(env));
    p.parentNode.parentNode.classList.add('real');
  }
  /** 分类小标题（「全部」里按场景分组） */
  const groupHTML = (k, count) => `<div class="vc-gh" data-reveal><b>${CAT_NAME[k]}</b><span class="mono">${GROUPS[k][0]} · ${count}</span><em>${GROUPS[k][1]}</em><i></i></div>`;

  /* ---------------------------------------------------- 播放器下方的小故事条
   * 术师：档案资料三附的“交流经验”——看她的表情和动作，就知道话有没有传到（小脸图标悬停时点头 / 摇头）
   * 医疗：读唇与手语——四条语音里的小事，点一下直接播放那一条 */
  const FACE_HEAD = '<path class="fh" d="M24 13 C 32 13, 37 19, 37 27 C 37 35, 31 40, 24 40 C 17 40, 11 35, 11 27 C 11 19, 16 13, 24 13 Z"/><path class="fn" d="M14 19 C 7 18, 5 10, 11 8.6 C 15 7.8, 17 12, 13.6 13.6 M34 19 C 41 18, 43 10, 37 8.6 C 33 7.8, 31 12, 34.4 13.6"/>';
  const FACE = {
    shake: '<circle class="fe" cx="19.5" cy="26" r="1.7"/><circle class="fe" cx="28.5" cy="26" r="1.7"/><path d="M21 33.5 q3 -1.6 6 0"/><path class="fm" d="M4 25 l2.4 2.4 M4 29.8 l2.4 -2.4 M44 25 l-2.4 2.4 M44 29.8 l-2.4 -2.4"/>',
    shake2: '<circle cx="19.5" cy="26" r="2.6"/><circle cx="28.5" cy="26" r="2.6"/><path d="M16.5 20.6 q3 -2.6 6 -0.4 M25.5 20.2 q3 -2.2 6 0.4"/><ellipse cx="24" cy="34" rx="1.8" ry="2.4"/><path class="fm" d="M42 13 v5 M42 21.2 v0.4"/>',
    nod: '<circle class="fe" cx="19.5" cy="26" r="1.7"/><circle class="fe" cx="28.5" cy="26" r="1.7"/><path d="M21 32.5 q3 2 6 0"/><path class="fm" d="M17 45 q7 2.6 14 0"/>',
    nod2: '<path d="M17.4 26.4 q2.1 -2.6 4.2 0 M26.4 26.4 q2.1 -2.6 4.2 0"/><path d="M19.6 31.6 q4.4 4.6 8.8 0"/><path class="fm" d="M16.2 30.2 h2 M29.8 30.2 h2"/><path class="fm" d="M40 12 l1.4 2.8 l2.8 1.4 l-2.8 1.4 l-1.4 2.8 l-1.4 -2.8 l-2.8 -1.4 l2.8 -1.4 z"/>',
    repeat: '<circle class="fe" cx="19.5" cy="26" r="1.7"/><circle class="fe" cx="28.5" cy="26" r="1.7"/><ellipse cx="24" cy="33.6" rx="2.4" ry="1.6"/><path class="fm fw" d="M40.5 22 q2.6 3.8 0 7.6 M44 19.4 q4.4 6.4 0 12.8"/>',
    daze: '<path d="M17.4 26 h4.2 M26.4 26 h4.2"/><path d="M21.4 33.4 q2.6 -1 5.2 0"/><path class="fm" d="M35 20.5 c 1.6 2.2, 1.6 3.4, 0 4.2 c -1.6 -0.8, -1.6 -2, 0 -4.2 z"/><path class="fm fd" d="M39 10.5 h0.2 M42 10.5 h0.2 M45 10.5 h0.2"/>',
  };
  const faceSVG = (k) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${FACE_HEAD}${FACE[k] || ''}</svg>`;
  const LIP_ICO = {
    4: '<path d="M4 12 C 7 7.5, 10 7, 12 9 C 14 7, 17 7.5, 20 12 C 17 16.8, 7 16.8, 4 12 Z"/><path d="M4 12 C 9 13.4, 15 13.4, 20 12"/>',
    9: '<path d="M8 12 V 5 A 1.5 1.5 0 0 1 11 5 V 11 V 3.5 A 1.5 1.5 0 0 1 14 3.5 V 11 V 5 A 1.5 1.5 0 0 1 17 5 V 13 C 17 18, 14 21, 11 21 C 8 21, 6 19, 4 15 L 3.4 13 A 1.4 1.4 0 0 1 6 12 L 8 14"/>',
    36: '<path d="M8 12 V 5 A 1.5 1.5 0 0 1 11 5 V 11 V 3.5 A 1.5 1.5 0 0 1 14 3.5 V 11 V 5 A 1.5 1.5 0 0 1 17 5 V 13 C 17 18, 14 21, 11 21 C 8 21, 6 19, 4 15 L 3.4 13 A 1.4 1.4 0 0 1 6 12 L 8 14"/><path d="M19.5 2.5 l0.9 1.8 l1.8 0.9 l-1.8 0.9 l-0.9 1.8 l-0.9 -1.8 l-1.8 -0.9 l1.8 -0.9 z"/>',
    10: '<path d="M3 9 H 13 C 16 9, 16 5, 13.4 5 C 12 5, 11.4 6.2, 11.8 7.2"/><path d="M3 13 H 17 C 20.5 13, 20.5 18, 17.4 18 C 15.8 18, 15 16.6, 15.6 15.4"/><path d="M5 17 H 10"/>',
  };
  function guideHTML(deck, lines, icon) {
    const G = deck.guide;
    if (!G) return '';
    const h = `<div class="vg-h"><p class="mono">${esc(G.en)}</p><h3>${esc(G.title)}</h3><p class="vg-lead">${esc(G.lead)}</p><cite>—— ${esc(G.src)}</cite></div>`;
    if (deck.mode === 'sim') {
      return `<div class="vc-guide vg-sim" data-reveal>${h}
        <ol class="vg-list">${G.items.map(([g, m, k], i) => `<li class="vg-item" style="--i:${i}"><span class="vg-face f-${k}" aria-hidden="true">${faceSVG(k)}</span><div><b>${esc(g)}</b><p>${esc(m)}</p></div></li>`).join('')}</ol>
      </div>`;
    }
    return `<div class="vc-guide vg-lip" data-reveal>${h}
      <div class="vg-list">${G.items.map(([n, t, m], i) => {
        const v = lines.find((x) => x[0] === n);
        return `<button type="button" class="vg-item" data-vguide="${n}" style="--i:${i}" aria-label="播放 ${esc(v ? v[1] : '')}：${esc(t)}">
          <span class="vg-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${LIP_ICO[n] || ''}</svg></span>
          <span class="vg-tx"><small class="mono">VOICE ${String(n).padStart(3, '0')}${v ? ` · ${esc(v[1])}` : ''}</small><b>${esc(t)}</b><span>${esc(m)}</span></span>
          <span class="vg-go" aria-hidden="true">${icon('play')}</span>
        </button>`;
      }).join('')}</div>
    </div>`;
  }

  /* ---------------------------------------------------- 进度条 / 播放头：交给合成器
   * 声音开始（或继续）时，按剩余时长起一段线性的 Web Animation（只动 transform），之后不再每帧写样式；
   * 暂停、跳转、缓冲后重新 'playing' 时再对齐一次 */
  const PROG = {
    mask: (k) => `translate3d(${((k - 1) * 100).toFixed(3)}%, 0, 0)`,
    inner: (k) => `translate3d(${((1 - k) * 100).toFixed(3)}%, 0, 0)`,
    head: (k) => `translate3d(${(k * 100).toFixed(3)}%, 0, 0)`,
    bar: (k) => `scaleX(${k.toFixed(4)})`,
  };
  /** list: [[元素, 类型], …]；k 为当前进度，dur 为总时长（秒），playing 为是否继续往前走 */
  function progress(list, k, dur, playing) {
    k = clamp(k || 0, 0, 1);
    for (const [el, kind] of list) {
      if (!el) continue;
      if (el._pa) { el._pa.cancel(); el._pa = null; }
      el.style.transform = PROG[kind](k);
      if (playing && dur > 0 && k < 1 && !reduceMotion) {
        el._pa = el.animate([{ transform: PROG[kind](k) }, { transform: PROG[kind](1) }], { duration: (1 - k) * dur * 1000, easing: 'linear', fill: 'forwards' });
      }
    }
  }
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * 播放器（只在语音播放、且播放器在视野里时逐帧调用 frame）。
   * 每帧只写：头像光环 / 口型的 --lv（变化不足 1% 就不写），16 根频谱条的 transform（量化到 2%，没变就不写）；
   * 时间文本每秒一次；波形进度见 progress()。
   */
  function painter(deckEl) {
    const bars = [...deckEl.querySelectorAll('.vs-bars i')], caps = [...deckEl.querySelectorAll('.vs-caps b')];
    const wave = deckEl.querySelector('.vd-wave'), time = deckEl.querySelector('.vd-time');
    // 音量只写在光环与嘴唇上（写在整个头像容器上会让底下垫的小羊 SVG 跟着每帧重绘）
    const lvEls = [...deckEl.querySelectorAll('.vd-ring, .vd-lips')];
    const ava = { style: { setProperty: (k, v) => lvEls.forEach((el) => el.style.setProperty(k, v)) } };
    const parts = [[deckEl.querySelector('.vw-mask'), 'mask'], [deckEl.querySelector('.vw-in'), 'inner'], [deckEl.querySelector('.vw-head'), 'head']];
    // 频谱像真的分析仪那样：条往上跳得快、落得慢；顶上的小横线（峰值）停一下再慢慢落
    const out = new Float32Array(NB), cur = new Float32Array(NB), peak = new Float32Array(NB), hold = new Float32Array(NB);
    const last = new Int16Array(NB).fill(-1), lastP = new Int16Array(NB).fill(-1);
    let lastSec = -1, lastDur = -1, lastLv = -1, lastNow = 0;
    return {
      frame(t, dur, lv, res, sim) {
        const now = performance.now(), dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
        lastNow = now;
        const q = Math.round(lv * 100);
        if (q !== lastLv) { lastLv = q; ava.style.setProperty('--lv', (q / 100).toFixed(2)); }
        if (res) bandsAt(res, t, out); else synthBands(t, lv, out);
        for (let i = 0; i < NB; i++) {
          const target = sim && i >= CUT ? out[i] * 0.18 : out[i];
          cur[i] = Math.max(target, cur[i] - dt * 1.5);
          if (cur[i] >= peak[i]) { peak[i] = cur[i]; hold[i] = 0.4; } else if ((hold[i] -= dt) <= 0) peak[i] = Math.max(cur[i], peak[i] - dt * 0.45);
          const v = Math.round(cur[i] * 50), p = Math.round(peak[i] * 50);
          if (v !== last[i]) { last[i] = v; bars[i].style.transform = `scaleY(${(0.04 + v * 0.0192).toFixed(3)})`; }
          if (caps[i] && p !== lastP[i]) { lastP[i] = p; caps[i].style.transform = `translate3d(0, ${(-(0.04 + p * 0.0192) * 100).toFixed(1)}%, 0)`; }
        }
        const s = Math.floor(t), dd = Math.floor(dur || 0);
        if (s !== lastSec || dd !== lastDur) {
          lastSec = s; lastDur = dd;
          time.textContent = `${fmt(t)} / ${fmt(dur)}`;
          wave.setAttribute('aria-valuenow', Math.round((dur ? clamp(t / dur, 0, 1) : 0) * 100));
          if (reduceMotion && dur) progress(parts, t / dur, 0, false); // 减少动态效果：播放头每秒跳一格
        }
      },
      progress(k, dur, playing) { progress(parts, k, dur, playing); },
      /** 停下：频谱回到静止的轮廓，光环归零；进度停在原处（done：走满） */
      rest(done) {
        ava.style.setProperty('--lv', 0);
        lastLv = -1;
        lastNow = 0;
        last.fill(-1);
        lastP.fill(-1);
        cur.fill(0);
        peak.fill(0);
        bars.forEach((b) => (b.style.transform = ''));
        caps.forEach((b) => (b.style.transform = ''));
        parts.forEach(([el]) => { if (el && el._pa) { el._pa.pause(); } });
        if (done) progress(parts, 1, 0, false);
        lastSec = -1;
      },
      reset() { this.rest(); progress(parts, 0, 0, false); time.textContent = '00:00 / 00:00'; },
      /** 波形：有真实包络就画真实的；没有就先画这条语音的占位轮廓（淡一些） */
      setWave(env, n) {
        const d = env ? wavePath(env) : n ? wavePath(seedEnv(n)) : FLAT;
        deckEl.querySelectorAll('.vw path').forEach((p) => p.setAttribute('d', d));
        wave.classList.toggle('ready', !!env);
      },
      /** 待命：推荐的第一条（cue = { n, title, text, set }） */
      cue(c) {
        this.reset();
        deckEl.classList.add('idle');
        deckEl.querySelector('.vd-no').innerHTML = c ? cueNo(c) : '';
        deckEl.querySelector('.vd-title').textContent = c ? c.title : '待命中';
        const line = deckEl.querySelector('.vd-line');
        line.textContent = c ? c.text : '选择一条语音开始播放。';
        line.classList.toggle('cue', !!c);
        this.setWave(null, c && c.n);
      },
    };
  }

  return { FPS, NB, CATS, CAT_NAME, GROUPS, catOf, bandHz, analyze, levelAt, bandsAt, synthLevel, wavePath, seedEnv, miniPath, spans, deckHTML, cardHTML, cardEnv, groupHTML, guideHTML, painter, progress, LANGS, fmt };
})();
