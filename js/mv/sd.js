/* =========================================================
 * MV · 官方 Q 版小人（游戏内 Spine 模型）渲染器   →  window.MVE.sd
 *
 * 用游戏里真正的 Spine 小人（PRTS 资源站 torappu.prts.wiki，与本页 js/chibi.js 的小剧场同源）代替手绘 Q 版角色，
 * 画进 MV 的 Canvas 2D 画面。和 js/mv/keyart.js 同一套架构：共享的一张离屏 WebGL 画布、只渲染屏幕上看得见的那一块、
 * 按它在屏幕上的实际像素渲染，再 drawImage 贴回。姿势是 t 的纯函数（setToSetupPose + Animation.apply，从不步进
 * AnimationState），任意跳帧都一致。
 *
 * ---------------------------------------------------------------- 模型 key
 *   干员：'char_1016_agoat2/build'（默认时装 · 基建小人）  视角：build（基建：Relax / Move / Sit / Sleep / Interact / Special）
 *         'char_1016_agoat2/front'（作战 · 正面）           front（作战：Start / Idle / Attack / Skill_* / Die）
 *         'char_1016_agoat2/back'（作战 · 背面）            back（作战背面：Start / Idle / Attack / Skill_*，没有 Move）
 *         时装：'char_1016_agoat2_epoque_34/build'（= 皮肤目录名 / 视角）；省略视角 = build
 *   敌人：'enemy_1545_shpkg'（torappu.prts.wiki/assets/enemy_spine/<id>/<id>.skel）
 *   简写（ALIAS）：'alter' 'alter-picnic' 'alter-home' 'caster' 'caster-summer' 'caster-sanrio' 'dolly' 'lamb' …（见 keys()）
 *
 * ---------------------------------------------------------------- 接口
 *   load(key | [keys], timeoutMs = 15000) → Promise<boolean>   预载（运行库 + meta + skel + atlas + 贴图，上传显卡）。只 resolve，
 *                                   不 reject；超时 resolve(false)，加载在后台继续。失败按退避重试；PRTS 偶尔断连：每个请求 15 秒超时、重试 3 次
 *   ready(key) → boolean · supported() → boolean（有没有可用的 WebGL）
 *   draw(g, key, o) → boolean        画进 2D 画布 g（当前变换 = 设计坐标 × 相机，可放进 s.layer；旋转也行）。没加载完 / 不支持时
 *                                   返回 false、什么也不画（第一次 draw 会自动开始加载）
 *     o = {
 *       x, y          脚底中心（当前坐标系）
 *       h             屏幕上的身高：脚底到头顶（不含角 / 呆毛 / 耳朵），与 MVE.cast 的 h 同一含义；或 scale：每个骨骼单位多少像素
 *       flip          true = 面朝左（模型默认面朝右）
 *       anim          动画名（'Relax' | 'Move' | 'Sit' | 'Sleep' | 'Interact' | 'Idle' | 'Attack' | 'Skill_3_Loop' …）；没有时按 ANIM_FALLBACK 退
 *       t             秒（一般传 s.t）；动画内的时间 = (t + phase) × speed，循环（loop: false 时停在最后一帧）
 *       speed, phase  播放速度倍数 / 相位偏移（秒）
 *       from, to, k   交叉淡化：from / to 为动画名或 { anim, t, speed, phase, loop }，k 0..1（0 = 全是 from）。也可写 mix: { from, to, k }
 *       alpha         整体透明度（整个小人一起淡，不会透出重叠的部件）；mode：贴回时的混合模式
 *       tint          正片叠底调色：'#ffe8d8' | ['#ffe8d8', 0.4] | { color, amount }
 *       sil           剪影色（'#1a1016'）：整个小人画成一块剪影；silK 0..1 剪影程度（默认 1）
 *       rim           逆光轮廓光：'r,g,b' | '#rgb' | { color, dir, amount, width, glow }
 *                     dir：光源方向（屏幕坐标弧度，-π/2 = 正上方；或 [dx, dy]）；不给 = 正后方逆光（四周 + 头顶描亮边）
 *                     width：亮边宽度（1080p 设计像素，默认按身高）；glow：背后柔光（默认 0.18，0 关）
 *       shadow        true | 0..1：脚下接触阴影（shadowY：影子的 y；shadowW：宽度倍数）
 *       rot           整体旋转（弧度，绕脚底）
 *     }
 *   anchors(key, o) → { head, face, top, chest, hip, handN, handF, hands, prop, feet, footL, footR, bounds, s }
 *                                   与 draw 同一构图、同一时刻，骨骼的世界坐标换算到调用者坐标（bounds = [x0, y0, x1, y1]）
 *   gait(key, o) → { speed, period, stride }   Move 动画脚不打滑的横向速度（调用者像素 / 秒；按 o.h、o.speed）
 *   info(key) → { anims: [[名, 秒]], bones, height, ready, pma, view }（已加载时）
 *   crowd(g, list, common) → 画了几个         一群小人（按 y 从远到近排序）：list = [{ key, x, y, h, anim, flip, t, phase, speed, … }]
 *   release(key?, immediate?)        释放显存（默认推迟 1.5 秒，期间又 draw / load 就取消）
 *   credit                           片尾署名：「Q版小人 © Hypergryph（官方 Spine 模型）」
 *   stats → { draws, lastMs, avgMs, canvas, models, gpuMB }
 *
 * ---------------------------------------------------------------- 角色库（MVE.cast）适配：钩子
 *   js/mv/cast.js 的 draw / anchors / gait 开头各有一行：
 *     draw:    const S = window.MVE && MVE.sd; if (S && S.wants && S.wants(who, o) && S.drawCast(g, who, o)) return;
 *     anchors: const S = window.MVE && MVE.sd; if (S && S.wants && S.wants(who, o)) { const A = S.anchorsCast(who, o); if (A) return A; }
 *     gait:    const S = window.MVE && MVE.sd; if (S && S.wants && S.wants(who, o)) { const G = S.gaitCast(who, o); if (G) return G; }
 *   wants(who, o) → boolean：这个角色、这个姿势有官方小人可用（没加载时顺手开始加载）；drawCast 没画成（没加载完）时返回 false，
 *   角色库照常画手绘版。映射（CAST / POSE 两张表）：
 *     'adele-alter'  outfit coat → char_1016_agoat2 · picnic → …_epoque_34 · home → …_epoque_57
 *     'adele-caster' → char_180_amgoat
 *     pose stand / idle / look / look-up / nod / listen → Relax · walk / run → Move（步频按 gaitCast 配速）· sit → Sit · sleep → Sleep
 *          wave / wave2 / cheer / clap / joy → Interact · view back / back3 的站姿 → 作战背面 Idle
 *     其余姿势（hug / carry / reach / kneel / point / write / jump / 手里拿着道具 / crop 特写 …）返回 false → 手绘版。
 *   o.sd：false = 这一次强制手绘；'Attack' / { anim, view: 'front' | 'back' | 'build', k… } = 强制用官方小人的某个动画（作战 / 施法镜头）
 *   audit：MVE.sd.audit = true 时每次决定记进 MVE.sd.log（lab/sd.html?film=… 用来列出每个镜头是小人还是手绘）
 *
 * 性能：见 lab/sd.html?perf=1。调试开关：页面地址带 ?sd=off 当作不支持（检查手绘替代）。
 * ========================================================= */
(() => {
  'use strict';
  const E = window.MVE;
  if (!E || E.sd) return;
  const VW = E.VW || 1920;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const now = () => performance.now();
  const EMPTY = Object.freeze({});
  const CREDIT = 'Q版小人 © Hypergryph（官方 Spine 模型）';
  const LIB = 'https://cdn.jsdelivr.net/gh/EsotericSoftware/spine-runtimes@3.8/spine-ts/build/spine-webgl.js';
  const ROOT = 'https://torappu.prts.wiki/assets/char_spine/';
  const ROOT_E = 'https://torappu.prts.wiki/assets/enemy_spine/';
  const opts = { maxDim: 2048, budget: 8, idleSec: 300, debug: false, mip: true };
  const stats = { draws: 0, lastMs: 0, avgMs: 0, canvas: [1, 1], loads: {} };
  const OFF = /[?&]sd=off\b/.test(location.search);

  /* ---------------------------------------------------------------- 简写 */
  const ALIAS = {
    alter: 'char_1016_agoat2/build', 'alter-front': 'char_1016_agoat2/front', 'alter-back': 'char_1016_agoat2/back',
    'alter-picnic': 'char_1016_agoat2_epoque_34/build', 'alter-picnic-front': 'char_1016_agoat2_epoque_34/front', 'alter-picnic-back': 'char_1016_agoat2_epoque_34/back',
    'alter-home': 'char_1016_agoat2_epoque_57/build', 'alter-home-front': 'char_1016_agoat2_epoque_57/front', 'alter-home-back': 'char_1016_agoat2_epoque_57/back',
    caster: 'char_180_amgoat/build', 'caster-front': 'char_180_amgoat/front', 'caster-back': 'char_180_amgoat/back',
    'caster-summer': 'char_180_amgoat_summer_5/build', 'caster-sanrio': 'char_180_amgoat_sanrio_2/build',
    dolly: 'enemy_1545_shpkg', lamb: 'enemy_1351_yhhshp',
    // 《火山旅梦》的活动干员与 NPC（汐斯塔的路人客串）
    snowsant: 'char_383_snsant/build', swire2: 'char_1033_swire2/build', buildr: 'char_488_buildr/build', bryota: 'char_4106_bryota/build',
  };
  const VIEW_CN = { build: '基建', front: '正面', back: '背面' };
  /** key → { id（规范名）, kind, char, dir（皮肤目录）, view, enemy } */
  const parsed = new Map();
  function parse(key) {
    let p = parsed.get(key);
    if (p !== undefined) return p;
    p = null;
    if (typeof key === 'string' && key.length < 120) {
      const k = ALIAS[key] || key;
      let m = /^(enemy_\d+_[a-z0-9]+)$/i.exec(k);
      if (m) p = { id: m[1], kind: 'enemy', enemy: m[1], view: 'front' };
      else {
        m = /^(char_\d+_[a-z0-9]+)((?:_[a-z0-9#]+)*)(?:\/(build|front|back))?$/i.exec(k);
        if (m) {
          const view = (m[3] || 'build').toLowerCase();
          const dir = m[2] ? m[1] + m[2] : 'defaultskin';
          p = { id: m[1] + (m[2] || '') + '/' + view, kind: 'char', char: m[1], dir, view };
        }
      }
    }
    parsed.set(key, p);
    return p;
  }

  /* ---------------------------------------------------------------- 网络（与 chibi.js 同一套：超时 + 重试） */
  // 资源站冷启动时首字节偶尔要 7–14 秒（实测）：单个请求给 20 秒；同时最多 6 个请求（手机带宽 + 不让排队的请求白白耗掉超时）
  const TIMEOUT = 20000;
  const retry = async (fn, times = 3) => {
    for (let i = 0; ; i++) {
      try { return await fn(i); } catch (e) { if (i >= times - 1) throw e; await new Promise((r) => setTimeout(r, 800 * (i + 1))); }
    }
  };
  let inflight = 0;
  const waiting = [];
  const slot = () => (inflight < 6 ? (inflight++, Promise.resolve()) : new Promise((r) => waiting.push(r)));
  const unslot = () => { const n = waiting.shift(); if (n) n(); else inflight--; };
  /** 带超时的 fetch（超时从真正发出请求时算起，排队不算）；body 读完才算结束 */
  async function fetchT(url, kind) {
    await slot();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT) : undefined, referrerPolicy: 'no-referrer' });
      if (!r.ok) throw new Error(kind + ' ' + r.status);
      return await (kind === 'meta' ? r.json() : kind === 'atlas' ? r.text() : kind === 'png' ? r.blob() : r.arrayBuffer());
    } finally { unslot(); }
  }
  const getBin = (url) => retry(() => fetchT(url, 'skel'));
  const getText = (url) => retry(() => fetchT(url, 'atlas'));
  const getBlob = (url) => retry((i) => fetchT(i ? url + '?r=' + i : url, 'png'));
  let libP = null;
  function loadLib() {
    if (window.spine && window.spine.webgl) return Promise.resolve(true);
    // 本页的小剧场（js/chibi.js）已经在加载同一个运行库：共用它的 Promise
    if (window.CHIBI && window.CHIBI.loadLib) return window.CHIBI.loadLib().then(() => !!(window.spine && window.spine.webgl));
    if (!libP) {
      libP = new Promise((res, rej) => {
        const old = [...document.scripts].find((s) => s.src === LIB);
        const s = old || document.createElement('script');
        const to = setTimeout(() => { libP = null; rej(new Error('spine runtime timeout')); }, 25000);
        s.addEventListener('load', () => { clearTimeout(to); res(true); });
        s.addEventListener('error', () => { clearTimeout(to); libP = null; if (!old) s.remove(); rej(new Error('spine runtime')); });
        if (!old) { s.src = LIB; s.async = true; document.head.appendChild(s); }
      });
    }
    return libP;
  }
  const metaCache = new Map();
  function meta(char) {
    let p = metaCache.get(char);
    if (!p) {
      p = retry(() => fetchT(ROOT + char + '/meta.json', 'meta'));
      metaCache.set(char, p);
      p.catch(() => metaCache.delete(char));
    }
    return p;
  }
  /** 模型文件的地址（不含扩展名） */
  async function baseOf(P) {
    if (P.kind === 'enemy') return ROOT_E + P.enemy + '/' + P.enemy;
    const m = await meta(P.char);
    const skins = m.skin || {};
    let entry = null;
    for (const name in skins) {
      const v = skins[name] && skins[name][VIEW_CN[P.view]];
      if (v && v.file && v.file.split('/')[0].toLowerCase() === P.dir.toLowerCase()) { entry = v; break; }
    }
    if (!entry) throw new Error('no skin ' + P.id);
    return (m.prefix || ROOT + P.char + '/') + entry.file;
  }

  /* ---------------------------------------------------------------- WebGL：一个共享的离屏上下文 */
  let cv = null, gl = null, gl2 = false, glOK = null, gen = 0;
  let mctx = null, shader = null, batcher = null, skr = null;
  let progP = null, UP = null, quad = null, fbo = null, fboTex = null, fboW = 0, fboH = 0, fboOK = false;
  let CW = 1, CH = 1, MAXDIM = 2048;
  const MVP = new Float32Array(16);
  function initGL() {
    if (glOK !== null) return glOK;
    glOK = false;
    if (opts.disable || OFF) return false;
    try {
      cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: !opts.software };
      gl = cv.getContext('webgl2', attrs);
      gl2 = !!gl;
      if (!gl) gl = cv.getContext('webgl', attrs) || cv.getContext('experimental-webgl', attrs);
      if (!gl) return false;
      cv.addEventListener('webglcontextlost', onLost, false);
      cv.addEventListener('webglcontextrestored', onRestored, false);
      glOK = true;
    } catch (e) { gl = null; glOK = false; }
    return glOK;
  }
  const glLive = () => !!gl && !gl.isContextLost();
  /** spine 的渲染对象（运行库加载之后才能建） */
  function buildSpineGL() {
    if (mctx && shader && batcher) return true;
    const W = window.spine && window.spine.webgl;
    if (!W || !glLive()) return false;
    mctx = new W.ManagedWebGLRenderingContext(gl);
    shader = W.Shader.newTwoColoredTextured(mctx);
    batcher = new W.PolygonBatcher(mctx, true);
    skr = new W.SkeletonRenderer(mctx, true);
    skr.premultipliedAlpha = true;
    // 后期：剪影 + 逆光轮廓（读帧缓冲纹理，一遍画完）
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const a = sh(gl.VERTEX_SHADER, PVS), b = sh(gl.FRAGMENT_SHADER, PFS);
    if (a && b) {
      progP = gl.createProgram();
      gl.attachShader(progP, a); gl.attachShader(progP, b);
      gl.bindAttribLocation(progP, 0, 'aQ');
      gl.linkProgram(progP);
      if (!gl.getProgramParameter(progP, gl.LINK_STATUS)) progP = null;
    }
    if (progP) {
      UP = {};
      ['uTex', 'uRect', 'uClamp', 'uPx', 'uSil', 'uRim', 'uDir'].forEach((k) => (UP[k] = gl.getUniformLocation(progP, k)));
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [4096, 4096];
    MAXDIM = Math.max(256, Math.min(opts.maxDim || 2048, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096, vp[0], vp[1]));
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.SCISSOR_TEST);
    fbo = null; fboTex = null; fboW = fboH = 0; fboOK = false;
    CW = cv.width; CH = cv.height;
    return true;
  }
  const PVS = `
precision highp float;
attribute vec2 aQ;
varying vec2 vQ;
void main(){ vQ = aQ; gl_Position = vec4(aQ * 2.0 - 1.0, 0.0, 1.0); }`;
  // uRect: 纹理里的区域（x0, y0, w, h，uv）；uClamp：采样夹在区域内；uPx：一个像素的 uv；
  // uSil: 剪影色 rgb + 程度；uRim: 轮廓光 rgb（已乘强度）+ 宽度（像素）；uDir: 光的方向（uv，指向光源）+ 是否四周
  const PFS = `
precision mediump float;
varying vec2 vQ;
uniform sampler2D uTex;
uniform vec4 uRect;
uniform vec4 uClamp;
uniform vec2 uPx;
uniform vec4 uSil;
uniform vec4 uRim;
uniform vec3 uDir;
float A(vec2 p){ return texture2D(uTex, clamp(p, uClamp.xy, uClamp.zw)).a; }
void main(){
  vec2 uv = uRect.xy + vQ * uRect.zw;
  vec4 c = texture2D(uTex, uv);
  if (c.a < 0.002) { gl_FragColor = vec4(0.0); return; }
  vec3 rgb = mix(c.rgb, uSil.rgb * c.a, uSil.a);
  if (uRim.a > 0.0) {
    float e;
    vec2 w = uPx * uRim.a;
    if (uDir.z > 0.5) {
      float s = A(uv + vec2(w.x, 0.0)) + A(uv - vec2(w.x, 0.0)) + A(uv + vec2(0.0, w.y)) * 2.0
        + A(uv + vec2(w.x, w.y) * 0.7) + A(uv + vec2(-w.x, w.y) * 0.7) + A(uv + vec2(w.x * 1.8, 0.0)) * 0.5 + A(uv - vec2(w.x * 1.8, 0.0)) * 0.5 + A(uv + vec2(0.0, w.y * 1.8));
      e = 1.0 - s / 8.0;
    } else {
      vec2 d = uDir.xy * w;
      e = 1.0 - (A(uv + d * 0.45) + A(uv + d) + A(uv + d * 1.7)) / 3.0;
    }
    rgb += uRim.rgb * clamp(e * 1.6, 0.0, 1.0) * c.a;
  }
  gl_FragColor = vec4(min(rgb, vec3(c.a)), c.a);
}`;
  function onLost(e) {
    e.preventDefault();
    gen++;
    for (const R of models.values()) dropGPU(R, true);
    mctx = shader = batcher = skr = null; progP = null; quad = null;
    fbo = null; fboTex = null; fboW = fboH = 0;
  }
  function onRestored() { gen++; /* 各模型在下次 draw 时自动重新加载（文件走浏览器缓存） */ }
  /** 离屏画布按需增大（按 256 取整，不频繁重建）；最大 MAXDIM */
  function ensureSize(w, h) {
    if (w <= CW && h <= CH) return;
    const nw = Math.min(MAXDIM, Math.max(CW, Math.ceil(w / 256) * 256));
    const nh = Math.min(MAXDIM, Math.max(CH, Math.ceil(h / 256) * 256));
    if (nw === CW && nh === CH) return;
    cv.width = CW = nw; cv.height = CH = nh;
    stats.canvas[0] = CW; stats.canvas[1] = CH;
  }
  function ensureFBO() {
    if (fbo && fboW === CW && fboH === CH) return fboOK;
    if (!fbo) { fbo = gl.createFramebuffer(); fboTex = gl.createTexture(); }
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, CW, CH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
    fboOK = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    fboW = CW; fboH = CH;
    return fboOK;
  }

  /* ---------------------------------------------------------------- 每个模型 */
  const models = new Map();
  function rec(P) {
    let R = models.get(P.id);
    if (!R) {
      R = { P, id: P.id, ready: false, loading: null, fails: 0, retryAt: 0, gen: -1, tok: 0, data: null, skel: null, atlas: null, texs: [], bytes: 0, last: 0, dropAt: 0,
        anims: null, bounds: new Map(), info: null, posed: null, lastAnim: null, pma: true };
      models.set(P.id, R);
    }
    return R;
  }
  const withTimeout = (p, ms) => (ms > 0 ? Promise.race([p, new Promise((r) => setTimeout(() => r(false), ms))]) : p);
  /** 预载：key 或 [keys]；只 resolve（true = 全部就绪） */
  function load(key, timeout = 15000) {
    try {
      if (Array.isArray(key)) return Promise.all(key.map((k) => load(k, timeout))).then((a) => a.every(Boolean), () => false);
      const P = parse(key);
      if (!P || !initGL()) return Promise.resolve(false);
      const R = rec(P);
      R.dropAt = 0; shrinkAt = 0;
      if (R.ready && glLive() && R.gen === gen) return Promise.resolve(true);
      if (R.ready && R.gen !== gen) dropGPU(R, true);
      if (!R.loading) {
        if (R.fails && now() < R.retryAt) return Promise.resolve(false);
        if (!glLive()) return Promise.resolve(false);
        R.loading = doLoad(R).catch((e) => { if (opts.debug) console.warn('[sd]', R.id, e); return false; }).then((ok) => {
          R.loading = null;
          if (ok === false) { R.fails++; R.retryAt = now() + Math.min(120000, 10000 * R.fails); }
          if (ok) R.fails = 0;
          return !!ok;
        });
      }
      return withTimeout(R.loading, timeout);
    } catch (e) { return Promise.resolve(false); }
  }
  /** draw() 用到还没加载的模型：后台开始加载（失败后按退避重试） */
  function want(P) {
    if (glOK === false || !P) return;
    const R = models.get(P.id);
    if (R && (R.loading || (R.fails && now() < R.retryAt))) return;
    load(P.id, 0);
  }
  /** 解析图集页：名字与声明尺寸 */
  function atlasPages(txt) {
    const lines = txt.split(/\r?\n/), pages = [];
    lines.forEach((l, i) => {
      const name = l.trim();
      if (name && /\.png$/i.test(name) && (i === 0 || !lines[i - 1].trim())) {
        const sz = (lines[i + 1] || '').match(/size:\s*(\d+)\s*,\s*(\d+)/);
        pages.push({ name, w: sz ? +sz[1] : 0, h: sz ? +sz[2] : 0 });
      }
    });
    return pages;
  }
  /** 贴图：后台线程解码，保持原始（预乘过的）像素；资源站的贴图可能被缩小过，按图集声明的尺寸放大回去（spine-ts 3.8 按实际尺寸归一化 UV） */
  async function decode(blob, w, h) {
    if (window.createImageBitmap) {
      try {
        let bm = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        const nat = [bm.width, bm.height];
        if (w && h && (bm.width !== w || bm.height !== h)) {
          const b2 = await createImageBitmap(bm, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
          bm.close(); bm = b2;
        }
        return { img: bm, nat };
      } catch (e) { /* 退回 <img> */ }
    }
    const url = URL.createObjectURL(blob);
    try {
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const nat = [im.naturalWidth, im.naturalHeight];
      if (w && h && (im.naturalWidth !== w || im.naturalHeight !== h)) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const q = c.getContext('2d'); q.imageSmoothingQuality = 'high'; q.drawImage(im, 0, 0, w, h);
        return { img: c, nat };
      }
      return { img: im, nat };
    } finally { URL.revokeObjectURL(url); }
  }
  /** → true 成功；false 失败（按退避重试）；null 中途作废（上下文丢失、被 release） */
  async function doLoad(R) {
    const tok = R.tok, g0 = gen;
    const stale = () => tok !== R.tok || g0 !== gen || !glLive();
    const t0 = now();
    await loadLib();
    if (!window.spine || !window.spine.webgl) return false;
    if (stale()) return null;
    if (!buildSpineGL()) return false;
    const base = await baseOf(R.P);
    const [bin, atlasTxt] = await Promise.all([getBin(base + '.skel'), getText(base + '.atlas')]);
    if (stale()) return null;
    const dir = base.slice(0, base.lastIndexOf('/') + 1);
    const pages = atlasPages(atlasTxt);
    const imgs = {};
    const nat = {};
    await Promise.all(pages.map(async (p) => { const r = await decode(await getBlob(dir + p.name), p.w, p.h); imgs[p.name] = r.img; nat[p.name] = r.nat; }));
    if (stale()) { for (const k in imgs) if (imgs[k] && imgs[k].close) imgs[k].close(); return null; }
    R.nat = nat;
    const t1 = now();
    const S = window.spine, W = S.webgl;
    let bytes = 0;
    const texs = [];
    const atlas = new S.TextureAtlas(atlasTxt, (path) => {
      const im = imgs[path] || Object.values(imgs)[0];
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      const tx = new W.GLTexture(mctx, im, false);
      texs.push(tx);
      bytes += (im.width || 0) * (im.height || 0) * 4 * (opts.mip && gl2 ? 1.34 : 1);
      return tx;
    });
    // 缩小显示（远景小人）时用 mipmap：WebGL2 支持非 2 的幂尺寸
    if (opts.mip && gl2) {
      for (const tx of texs) {
        try { tx.bind(); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); } catch (e) { /* 无妨 */ }
      }
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    // 贴图已经上传：放掉解码后的位图，只留尺寸（spine-ts 读网格的 UV 时要用 texture.getImage().width / height）
    for (const tx of texs) {
      const im = tx.getImage();
      if (im && im.close) { const w = im.width, h = im.height; try { im.close(); } catch (e) { /* 无妨 */ } tx._image = { width: w, height: h }; }
    }
    const sb = new S.SkeletonBinary(new S.AtlasAttachmentLoader(atlas));
    const data = sb.readSkeletonData(new Uint8Array(bin));
    if (stale()) { atlas.dispose(); return null; }
    if (R.atlas) { try { R.atlas.dispose(); } catch (e) { /* 无妨 */ } }
    R.atlas = atlas; R.texs = texs; R.data = data; R.bytes = bytes;
    R.skel = new S.Skeleton(data);
    R.anims = new Map(data.animations.map((a) => [a.name, a]));
    R.bounds.clear(); R.posed = null; R.lastAnim = null;
    R.info = analyze(R);
    R.ready = true; R.gen = gen; R.last = now();
    stats.loads[R.id] = { ms: Math.round(now() - t0), parse: Math.round(now() - t1), kb: Math.round(bin.byteLength / 1024) };
    budget(R);
    idleWatch();
    return stale() ? null : true;
  }
  function dropGPU(R, lostCtx) {
    R.tok++;
    if (R.atlas && !lostCtx && glLive()) { try { R.atlas.dispose(); } catch (e) { /* 无妨 */ } }
    R.atlas = null; R.texs = []; R.ready = false; R.data = null; R.skel = null; R.anims = null; R.posed = null; R.lastAnim = null; R.bytes = 0;
    R.bounds.clear();
  }
  function budget(keep) {
    const live = [...models.values()].filter((R) => R.ready);
    if (live.length <= opts.budget) return;
    live.sort((a, b) => a.last - b.last);
    for (const R of live) { if (live.length-- <= opts.budget) break; if (R !== keep) dropGPU(R); }
  }
  let lastDraw = 0, idleT = 0;
  function idleWatch() {
    if (idleT) return;
    idleT = setInterval(() => {
      if (now() - lastDraw > opts.idleSec * 1000 && ![...models.values()].some((R) => R.loading)) { clearInterval(idleT); idleT = 0; release(undefined, true); }
    }, 30000);
  }

  /* ---------------------------------------------------------------- 模型分析：头 / 手 / 脚骨骼、身高、步速 */
  const ANIM_FALLBACK = {
    Relax: ['Relax', 'Idle', 'Default'], Idle: ['Idle', 'Relax', 'Default'], Move: ['Move', 'Run', 'Walk', 'Relax', 'Idle'],
    Sit: ['Sit', 'Relax', 'Idle'], Sleep: ['Sleep', 'Sit', 'Relax', 'Idle'], Interact: ['Interact', 'Special', 'Relax', 'Idle'],
    Attack: ['Attack', 'Combat', 'Idle'], Die: ['Die', 'Idle'],
  };
  function animOf(R, name) {
    if (!R.anims) return null;
    const a = R.anims.get(name);
    if (a) return a;
    const fb = ANIM_FALLBACK[name] || [name, 'Relax', 'Idle', 'Default'];
    for (const n of fb) { const x = R.anims.get(n); if (x) return x; }
    return R.data.animations.find((x) => x.duration > 0) || R.data.animations[0] || null;
  }
  const findBone = (bones, res, not) => {
    for (const re of res) for (const b of bones) if (re.test(b.data.name) && !(not && not.test(b.data.name))) return b;
    return null;
  };
  const depthOf = (b) => { let d = 0; while (b.parent) { d++; b = b.parent; } return d; };
  const isDesc = (b, anc) => { while (b) { if (b === anc) return true; b = b.parent; } return false; };
  const NOT_HEAD = /sheep|_mm_|_bb_|small|muzzle|shadow|IK/i;
  const EXTRA = /horn|ahoge|ear(?!ring)|antenna|halo|bowknot|ribbon|hat|flower|antler|sheep|weapon|staff|effect|fx|light|glow|shadow|_mm_|_bb_|small/i;
  function analyze(R) {
    const S = window.spine, sk = R.skel, bones = sk.bones;
    const rest = animOf(R, R.P.view === 'build' ? 'Relax' : 'Idle');
    sk.setToSetupPose();
    if (rest) rest.apply(sk, 0, 0, false, null, 1, S.MixBlend.setup, S.MixDirection.mixIn);
    sk.x = 0; sk.y = 0; sk.scaleX = 1; sk.scaleY = 1;
    sk.updateWorldTransform();
    // 头：名字里有 head / face、离根最近的那根骨骼（小羊、爸爸妈妈羊、嘴套等排除）
    const heads = bones.filter((b) => /(^|_)(head|face)(_?[a-z]?\d*)?$/i.test(b.data.name) && !NOT_HEAD.test(b.data.name));
    heads.sort((a, b) => depthOf(a) - depthOf(b) || countDesc(bones, b) - countDesc(bones, a));
    const head = heads[0] || findBone(bones, [/head/i, /face/i], NOT_HEAD);
    const handL = findBone(bones, [/(^|_)L_(hand|palm)(_?0?1)?$/i, /(^|_)L_hand/i, /L_?palm/i]);
    const handR = findBone(bones, [/(^|_)R_(hand|palm)(_?0?1)?$/i, /(^|_)R_hand/i, /R_?palm/i]);
    const footL = findBone(bones, [/(^|_)L_(foot|shose|shoe)(_?0?1)?$/i, /(^|_)L_foot/i], /IK|sheep/i);
    const footR = findBone(bones, [/(^|_)R_(foot|shose|shoe)(_?0?1)?$/i, /(^|_)R_foot/i], /IK|sheep/i);
    const chest = findBone(bones, [/(^|_)chest(_?0?1)?$/i, /chest/i, /neck/i], /sheep|move/i);
    const hip = findBone(bones, [/(^|_)(hip|pelvis|waist|wast)(_?[a-z]?0?1)?$/i, /hip|pelvis|waist|wast/i], /sheep|skirt|belt/i);
    // 头部的包围盒（在头骨骼的局部坐标里，去掉角 / 呆毛 / 耳朵 / 头饰）：给身高、头顶、脸的锚点用
    const verts = new Float32Array(4096);
    let hb = null, all = null;
    const drawOrder = sk.drawOrder;
    for (let i = 0; i < drawOrder.length; i++) {
      const slot = drawOrder[i], at = slot.getAttachment();
      if (!at || !slot.bone.active) continue;
      let n = 0;
      if (at instanceof S.RegionAttachment) { at.computeWorldVertices(slot.bone, verts, 0, 2); n = 8; }
      else if (at instanceof S.MeshAttachment) { if (at.worldVerticesLength > verts.length) continue; at.computeWorldVertices(slot, 0, at.worldVerticesLength, verts, 0, 2); n = at.worldVerticesLength; }
      else continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let j = 0; j < n; j += 2) { const x = verts[j], y = verts[j + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (!(x1 > x0)) continue;
      const nm = slot.data.name + ' ' + at.name + ' ' + slot.bone.data.name;
      if (!EXTRA.test(nm)) all = all ? [Math.min(all[0], x0), Math.min(all[1], y0), Math.max(all[2], x1), Math.max(all[3], y1)] : [x0, y0, x1, y1];
      if (head && isDesc(slot.bone, head) && !EXTRA.test(nm)) hb = hb ? [Math.min(hb[0], x0), Math.min(hb[1], y0), Math.max(hb[2], x1), Math.max(hb[3], y1)] : [x0, y0, x1, y1];
    }
    const off = new S.Vector2(), size = new S.Vector2();
    sk.getBounds(off, size, []);
    const bb = [off.x, off.y, off.x + size.x, off.y + size.y];
    // 身高 = 头顶（不含头饰）；异常时退回整体包围盒
    let top = hb ? hb[3] : all ? all[3] : bb[3];
    if (!(top > 20)) top = bb[3];
    const toLocal = (b, x, y) => { const v = new S.Vector2(x, y); b.worldToLocal(v); return [v.x, v.y]; };
    const headBox = head && hb ? { c: toLocal(head, (hb[0] + hb[2]) / 2, (hb[1] + hb[3]) / 2), top: toLocal(head, (hb[0] + hb[2]) / 2, hb[3]), face: toLocal(head, (hb[0] + hb[2]) / 2 + (hb[2] - hb[0]) * 0.08, hb[1] + (hb[3] - hb[1]) * 0.36), r: (hb[3] - hb[1]) / 2 } : null;
    // 离镜头近的手：绘制顺序里靠后的那只
    const slotIdx = (b) => { if (!b) return -1; let k = -1; drawOrder.forEach((s, i) => { if (s.bone === b || isDesc(s.bone, b)) k = i; }); return k; };
    const nearL = slotIdx(handL) >= slotIdx(handR);
    const info = { height: top, bb, head, headBox, handN: nearL ? handL : handR, handF: nearL ? handR : handL, footL, footR, chest, hip, gait: null, restName: rest ? rest.name : '' };
    info.gait = measureGait(R, info);
    return info;
  }
  function countDesc(bones, b) { let n = 0; for (const x of bones) if (x !== b && isDesc(x, b)) n++; return n; }
  /** Move 动画的地面速度（骨骼单位 / 秒）：着地那只脚往后滑的速度的中位数 */
  function measureGait(R, info) {
    const S = window.spine, sk = R.skel, a = R.anims && R.anims.get('Move');
    if (!a || !(a.duration > 0)) return null;
    const N = 72, feet = [info.footL, info.footR].filter(Boolean);
    if (!feet.length) return { speed: info.height * 0.45, dur: a.duration };
    const xs = feet.map(() => new Float32Array(N + 1)), ys = feet.map(() => new Float32Array(N + 1));
    for (let i = 0; i <= N; i++) {
      sk.setToSetupPose();
      a.apply(sk, 0, (a.duration * i) / N, true, null, 1, S.MixBlend.setup, S.MixDirection.mixIn);
      sk.updateWorldTransform();
      feet.forEach((f, j) => { xs[j][i] = f.worldX; ys[j][i] = f.worldY; });
    }
    R.lastAnim = null;
    const v = [];
    const dt = a.duration / N;
    feet.forEach((f, j) => {
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i <= N; i++) { mn = Math.min(mn, ys[j][i]); mx = Math.max(mx, ys[j][i]); }
      const lim = mn + Math.max(1.5, (mx - mn) * 0.2);
      for (let i = 0; i < N; i++) if (ys[j][i] <= lim && ys[j][i + 1] <= lim) v.push(-(xs[j][i + 1] - xs[j][i]) / dt);
    });
    v.sort((p, q) => p - q);
    let sp = v.length ? v[Math.floor(v.length / 2)] : 0;
    if (!(sp > info.height * 0.05)) sp = info.height * 0.45; // 量不出来（原地踏步 / 飘着走）：按身高估
    return { speed: sp, dur: a.duration };
  }

  /* ---------------------------------------------------------------- 姿势（t 的纯函数） */
  function animSpec(R, v, o) {
    if (!v) return null;
    if (typeof v === 'string') v = { anim: v };
    const a = animOf(R, v.anim || 'Relax');
    if (!a) return null;
    const sp = v.speed ?? o.speed ?? 1;
    let tt = ((v.t ?? o.t ?? 0) + (v.phase ?? o.phase ?? 0)) * sp;
    const loop = v.loop ?? o.loop ?? true;
    const d = a.duration;
    if (d > 0) tt = loop ? ((tt % d) + d) % d : clamp(tt, 0, d);
    else tt = 0;
    return { a, tt };
  }
  function pose(R, A, B, k) {
    const S = window.spine, sk = R.skel, P = R.posed;
    if (P && P.a === A.a && P.ta === A.tt && P.b === (B ? B.a : null) && P.tb === (B ? B.tt : 0) && P.k === k) return;
    // 同一个动画接着画：动画里的时间轴都按 setup 混合写满，不必整体复位（换动画、交叉淡化时才复位）
    if (B || R.lastAnim !== A.a) sk.setToSetupPose();
    sk.x = 0; sk.y = 0; sk.scaleX = 1; sk.scaleY = 1;
    if (B && k > 0.001) {
      // 权重小的先铺满，权重大的后上（它的附件 / 绘制顺序生效），与 AnimationState 的附件阈值 0.5 一致
      if (k < 0.5) { B.a.apply(sk, B.tt, B.tt, true, null, 1, S.MixBlend.setup, S.MixDirection.mixIn); A.a.apply(sk, A.tt, A.tt, true, null, 1 - k, S.MixBlend.replace, S.MixDirection.mixIn); }
      else { A.a.apply(sk, A.tt, A.tt, true, null, 1, S.MixBlend.setup, S.MixDirection.mixIn); B.a.apply(sk, B.tt, B.tt, true, null, k, S.MixBlend.replace, S.MixDirection.mixIn); }
      R.lastAnim = null;
    } else {
      A.a.apply(sk, A.tt, A.tt, true, null, 1, S.MixBlend.setup, S.MixDirection.mixIn);
      R.lastAnim = A.a;
    }
    sk.updateWorldTransform();
    R.posed = { a: A.a, ta: A.tt, b: B ? B.a : null, tb: B ? B.tt : 0, k };
  }
  /** 动画的包围盒（骨骼单位，采样 16 帧的并集，稍微放大）：决定离屏渲染的区域 */
  function animBounds(R, a) {
    let b = R.bounds.get(a);
    if (b) return b;
    const S = window.spine, sk = R.skel, off = new S.Vector2(), size = new S.Vector2(), tmp = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const n = a.duration > 0 ? 16 : 1;
    for (let i = 0; i < n; i++) {
      sk.setToSetupPose();
      a.apply(sk, 0, (a.duration * i) / n, true, null, 1, S.MixBlend.setup, S.MixDirection.mixIn);
      sk.updateWorldTransform();
      sk.getBounds(off, size, tmp);
      if (size.x > 0) { x0 = Math.min(x0, off.x); y0 = Math.min(y0, off.y); x1 = Math.max(x1, off.x + size.x); y1 = Math.max(y1, off.y + size.y); }
    }
    R.lastAnim = null; R.posed = null;
    if (!(x1 > x0)) { x0 = -200; y0 = -50; x1 = 200; y1 = 500; }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.03 + 4;
    b = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
    R.bounds.set(a, b);
    return b;
  }

  /* ---------------------------------------------------------------- 颜色 */
  const COLC = new Map();
  function rgb01(c) {
    if (Array.isArray(c)) return [clamp(c[0] / 255), clamp(c[1] / 255), clamp(c[2] / 255)];
    const k = String(c == null ? '#ffffff' : c);
    let v = COLC.get(k);
    if (v) return v;
    if (k[0] === '#') {
      let h = k.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      v = [0, 2, 4].map((i) => (parseInt(h.slice(i, i + 2), 16) || 0) / 255);
    } else if (/^rgba?\(/.test(k)) v = k.replace(/[^\d.,]/g, '').split(',').slice(0, 3).map((x) => clamp((parseFloat(x) || 0) / 255));
    else v = k.split(',').map((x) => clamp((parseFloat(x) || 0) / 255));
    if (v.length < 3 || v.some((x) => !Number.isFinite(x))) v = [1, 1, 1];
    if (COLC.size > 200) COLC.clear();
    COLC.set(k, v);
    return v;
  }
  const rgbStr = (c) => { const v = rgb01(c); return Math.round(v[0] * 255) + ',' + Math.round(v[1] * 255) + ',' + Math.round(v[2] * 255); };

  /* ---------------------------------------------------------------- 地面阴影（2D 精灵） */
  let shadowSpr = null;
  function shadowSprite() {
    if (shadowSpr) return shadowSpr;
    const c = E.mk(128, 32), q = c.getContext('2d');
    q.scale(1, 0.25);
    const gr = q.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(30,24,40,1)'); gr.addColorStop(0.55, 'rgba(30,24,40,.5)'); gr.addColorStop(1, 'rgba(30,24,40,0)');
    q.fillStyle = gr; q.fillRect(0, 0, 128, 128);
    return (shadowSpr = c);
  }

  /* ---------------------------------------------------------------- 画 */
  const FR = { s: 1, fx: 1 };
  function scaleOf(R, o) {
    if (o.scale > 0) return o.scale;
    const h = o.h > 0 ? o.h : 300;
    return h / Math.max(40, R.info.height);
  }
  function draw(g, key, o) {
    o = o || EMPTY;
    let R;
    try {
      if (!g || !g.canvas) return false;
      const P = parse(key);
      if (!P) return false;
      R = models.get(P.id);
      if (!R || !R.ready || !glLive() || R.gen !== gen) { if (R && R.ready && R.gen !== gen) dropGPU(R, true); want(P); return false; }
      if (R.dropAt) { R.dropAt = 0; shrinkAt = 0; }
    } catch (e) { return false; }
    let saved = false;
    try {
      const c0 = now();
      // 动画与时间
      let A, B = null, k = 0;
      const mx = o.mix || (o.from != null && o.to != null ? o : null);
      if (mx) {
        k = clamp(+mx.k || 0);
        A = animSpec(R, mx.from, o); B = animSpec(R, mx.to, o);
        if (!A) { A = B; B = null; }
        if (B && k <= 0.001) B = null;
        else if (B && k >= 0.999) { A = B; B = null; }
      } else A = animSpec(R, o.anim || (R.P.view === 'build' ? 'Relax' : 'Idle'), o);
      if (!A) return false;
      pose(R, A, B, k);
      // 构图：骨骼单位 (u, v) → 调用者坐标：x = X + s·fx·(u cosr − v sinr)…（绕脚底旋转 rot）
      const s = scaleOf(R, o), fx = o.flip ? -1 : 1, X = +o.x || 0, Y = +o.y || 0;
      const bx = B ? union(animBounds(R, A.a), animBounds(R, B.a)) : animBounds(R, A.a);
      let a = 1, b = 0, c = 0, d = 1, e = 0, f = 0;
      const M = g.getTransform ? g.getTransform() : null;
      if (M) { a = M.a; b = M.b; c = M.c; d = M.d; e = M.e; f = M.f; } else { a = d = g.canvas.width / VW; }
      // 局部：p = (X, Y) + R(rot)·(s·fx·u, −s·v)
      const r = +o.rot || 0, cr = Math.cos(r), sr = Math.sin(r);
      const lu = [s * fx * cr, s * fx * sr], lv = [s * sr, -s * cr]; // ∂p/∂u, ∂p/∂v
      // 设备坐标 = M·p：(u, v) → 设备的仿射 [Au Av Ac; Bu Bv Bc]
      const Au = a * lu[0] + c * lu[1], Av = a * lv[0] + c * lv[1], Ac = a * X + c * Y + e;
      const Bu = b * lu[0] + d * lu[1], Bv = b * lv[0] + d * lv[1], Bc = b * X + d * Y + f;
      // 包围盒四角 → 设备像素，和画布求交
      let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
      for (let q = 0; q < 4; q++) {
        const u = q & 1 ? bx[2] : bx[0], v = q & 2 ? bx[3] : bx[1];
        const px = Au * u + Av * v + Ac, py = Bu * u + Bv * v + Bc;
        if (px < X0) X0 = px; if (px > X1) X1 = px; if (py < Y0) Y0 = py; if (py > Y1) Y1 = py;
      }
      const Wc = g.canvas.width, Hc = g.canvas.height;
      X0 = Math.max(0, Math.floor(X0)); Y0 = Math.max(0, Math.floor(Y0)); X1 = Math.min(Wc, Math.ceil(X1)); Y1 = Math.min(Hc, Math.ceil(Y1));
      const alpha = o.alpha == null ? 1 : clamp(+o.alpha);
      if (X1 - X0 < 1 || Y1 - Y0 < 1 || alpha <= 0.002) { R.last = now(); lastDraw = R.last; return true; }
      const pw = X1 - X0, ph = Y1 - Y0;
      const rs = Math.min(1, MAXDIM / pw, MAXDIM / ph);
      const rw = Math.max(1, Math.round(pw * rs)), rh = Math.max(1, Math.round(ph * rs));
      ensureSize(rw, rh);
      // 投影：(u, v) → 设备像素 [X0, X1]×[Y0, Y1] → 离屏画布左上角 rw×rh 的区域（裁剪空间，y 向上）
      MVP.fill(0);
      MVP[0] = (2 * Au) / pw; MVP[4] = (2 * Av) / pw; MVP[12] = (2 * (Ac - X0)) / pw - 1;
      MVP[1] = (-2 * Bu) / ph; MVP[5] = (-2 * Bv) / ph; MVP[13] = 1 - (2 * (Bc - Y0)) / ph;
      MVP[10] = 1; MVP[15] = 1;
      // 光与剪影
      const sil = o.sil ? rgb01(o.sil) : null, silK = sil ? clamp(o.silK ?? 1) : 0;
      let rim = null;
      if (o.rim) {
        const ro = typeof o.rim === 'object' && !Array.isArray(o.rim) ? o.rim : { color: o.rim };
        const amt = ro.amount ?? 1;
        if (amt > 0) {
          const col = rgb01(ro.color || '255,240,220');
          const devPerUnit = Math.sqrt(Math.abs(a * d - b * c));
          const hDev = (o.h > 0 ? o.h : R.info.height * s) * devPerUnit;
          const wpx = ro.width != null ? ro.width * devPerUnit * (1080 / 1080) : Math.max(1.4, Math.min(7, hDev * 0.014));
          let dir = null;
          const dv = ro.dir ?? o.rimDir;
          if (dv != null) {
            let dx, dy;
            if (Array.isArray(dv)) { dx = +dv[0] || 0; dy = +dv[1] || 0; } else { dx = Math.cos(dv); dy = Math.sin(dv); }
            // 设备空间方向（y 向下）→ 纹理 uv（y 向上）
            const ddx = a * dx + c * dy, ddy = b * dx + d * dy, l = Math.hypot(ddx, ddy) || 1;
            dir = [ddx / l, -ddy / l];
          }
          rim = { col, rgb: rgbStr(ro.color || '255,240,220'), amt: amt * (sil ? 1 : 0.85), w: wpx * rs, dir, glow: ro.glow ?? o.rimGlow ?? (sil ? 0.18 : 0) };
        }
      }
      // 调色：乘在顶点色上（免费）
      const skc = R.skel.color;
      if (o.tint) {
        let tc = o.tint, ta = 1;
        if (Array.isArray(tc) && typeof tc[0] === 'string') { ta = tc[1] ?? 1; tc = tc[0]; } else if (tc && typeof tc === 'object' && !Array.isArray(tc)) { ta = tc.amount ?? 1; tc = tc.color; }
        const v = rgb01(tc);
        skc.set(1 + (v[0] - 1) * ta, 1 + (v[1] - 1) * ta, 1 + (v[2] - 1) * ta, 1);
      } else skc.set(1, 1, 1, 1);
      // 渲染
      const post = (sil || rim) && progP && ensureFBO();
      gl.bindFramebuffer(gl.FRAMEBUFFER, post ? fbo : null);
      gl.viewport(0, CH - rh, rw, rh);
      gl.scissor(0, CH - rh, rw, rh);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      shader.bind();
      shader.setUniformi(window.spine.webgl.Shader.SAMPLER, 0);
      shader.setUniform4x4f(window.spine.webgl.Shader.MVP_MATRIX, MVP);
      batcher.begin(shader);
      skr.draw(batcher, R.skel);
      batcher.end();
      shader.unbind();
      if (post) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, CH - rh, rw, rh);
        gl.scissor(0, CH - rh, rw, rh);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.BLEND);
        gl.useProgram(progP);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fboTex);
        gl.uniform1i(UP.uTex, 0);
        const u0 = 0, v0 = (CH - rh) / CH, uw = rw / CW, vh = rh / CH;
        gl.uniform4f(UP.uRect, u0, v0, uw, vh);
        gl.uniform4f(UP.uClamp, u0 + 0.5 / CW, v0 + 0.5 / CH, u0 + uw - 0.5 / CW, v0 + vh - 0.5 / CH);
        gl.uniform2f(UP.uPx, 1 / CW, 1 / CH);
        gl.uniform4f(UP.uSil, sil ? sil[0] : 0, sil ? sil[1] : 0, sil ? sil[2] : 0, silK);
        if (rim) {
          gl.uniform4f(UP.uRim, rim.col[0] * rim.amt, rim.col[1] * rim.amt, rim.col[2] * rim.amt, rim.w);
          gl.uniform3f(UP.uDir, rim.dir ? rim.dir[0] : 0, rim.dir ? rim.dir[1] : 1, rim.dir ? 0 : 1);
        } else { gl.uniform4f(UP.uRim, 0, 0, 0, 0); gl.uniform3f(UP.uDir, 0, 1, 1); }
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.useProgram(null);
      }
      // 贴回 2D 画布（先画阴影、背后的柔光）
      g.save(); saved = true;
      if (o.shadow && !sil) {
        const sw = R.info.height * s * 0.34 * (o.shadowW || 1), sy = o.shadowY ?? Y, sa = (typeof o.shadow === 'number' ? o.shadow : o.shadowA ?? 0.26) * alpha;
        const ga = g.globalAlpha;
        g.globalAlpha = ga * clamp(sa);
        g.drawImage(shadowSprite(), X - sw, sy - sw * 0.16, sw * 2, sw * 0.32);
        g.globalAlpha = ga;
      }
      if (rim && rim.glow > 0) E.glow(g, X, Y - R.info.height * s * 0.5, R.info.height * s * 0.75, rim.rgb, rim.glow * alpha, 'lighter', false);
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (alpha < 1) g.globalAlpha *= alpha;
      if (o.mode) g.globalCompositeOperation = o.mode;
      g.imageSmoothingEnabled = true;
      g.drawImage(cv, 0, 0, rw, rh, X0, Y0, pw, ph);
      g.restore(); saved = false;
      R.last = now(); lastDraw = R.last;
      const ms = now() - c0;
      stats.draws++; stats.lastMs = ms; stats.avgMs = stats.avgMs ? stats.avgMs * 0.95 + ms * 0.05 : ms;
      FR.s = s; FR.fx = fx;
      return true;
    } catch (err) {
      if (saved) { try { g.restore(); } catch (e2) { /* 无妨 */ } }
      if (opts.debug) console.warn('[sd]', err);
      return false;
    }
  }
  const union = (p, q) => [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])];

  /* ---------------------------------------------------------------- 锚点 */
  function anchors(key, o) {
    try {
      o = o || EMPTY;
      const P = parse(key);
      const R = P && models.get(P.id);
      if (!R || !R.ready || !R.skel) return null;
      let A, B = null, k = 0;
      const mx = o.mix || (o.from != null && o.to != null ? o : null);
      if (mx) { k = clamp(+mx.k || 0); A = animSpec(R, mx.from, o); B = animSpec(R, mx.to, o); if (!A) { A = B; B = null; } if (B && k <= 0.001) B = null; else if (B && k >= 0.999) { A = B; B = null; } }
      else A = animSpec(R, o.anim || (R.P.view === 'build' ? 'Relax' : 'Idle'), o);
      if (!A) return null;
      pose(R, A, B, k);
      const s = scaleOf(R, o), fx = o.flip ? -1 : 1, X = +o.x || 0, Y = +o.y || 0;
      const r = +o.rot || 0, cr = Math.cos(r), sr = Math.sin(r);
      const T = (u, v) => [X + s * fx * u * cr + s * v * sr, Y + s * fx * u * sr - s * v * cr];
      const I = R.info, S = window.spine;
      const bw = (b) => (b ? T(b.worldX, b.worldY) : null);
      const loc = (b, p) => { const v = new S.Vector2(p[0], p[1]); b.localToWorld(v); return T(v.x, v.y); };
      const out = { s };
      if (I.head && I.headBox) {
        out.head = loc(I.head, I.headBox.c); out.top = loc(I.head, I.headBox.top); out.face = loc(I.head, I.headBox.face);
      } else { out.head = T(0, I.height * 0.72); out.top = T(0, I.height); out.face = T(I.height * 0.04, I.height * 0.68); }
      out.eyes = out.face; out.eyeN = out.face; out.eyeF = out.face; out.mouth = [out.face[0], out.face[1] + I.height * s * 0.06];
      out.chest = bw(I.chest) || T(0, I.height * 0.38);
      out.hip = bw(I.hip) || T(0, I.height * 0.22);
      out.handN = bw(I.handN) || T(I.height * 0.12, I.height * 0.25);
      out.handF = bw(I.handF) || out.handN;
      out.hands = [(out.handN[0] + out.handF[0]) / 2, (out.handN[1] + out.handF[1]) / 2];
      out.prop = out.handN; out.hand = out.handN;
      out.footL = bw(I.footL); out.footR = bw(I.footR);
      out.feet = [X, Y];
      const bb = B ? union(animBounds(R, A.a), animBounds(R, B.a)) : animBounds(R, A.a);
      pose(R, A, B, k); // animBounds 会改动骨架：再摆回来
      const p0 = T(bb[0], bb[1]), p1 = T(bb[2], bb[3]);
      out.bounds = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1])];
      return out;
    } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------- 步速 */
  function gait(key, o) {
    o = o || EMPTY;
    const P = parse(key), R = P && models.get(P.id);
    if (!R || !R.ready || !R.info || !R.info.gait) return null;
    const s = scaleOf(R, o), k = o.speed > 0 ? o.speed : 1, G = R.info.gait;
    return { speed: G.speed * s * k, period: G.dur / k, stride: G.speed * G.dur * s };
  }

  /* ---------------------------------------------------------------- 一群小人 */
  function crowd(g, list, common) {
    if (!Array.isArray(list)) return 0;
    const L = list.filter(Boolean).slice().sort((p, q) => (p.y ?? 0) - (q.y ?? 0));
    let n = 0;
    for (const it of L) if (draw(g, it.key, common ? Object.assign({}, common, it) : it)) n++;
    return n;
  }

  /* ---------------------------------------------------------------- 角色库适配 */
  // 谁 → 模型（按 outfit）
  const CAST = {
    'adele-alter': { outfit: 'coat', build: { coat: 'char_1016_agoat2', picnic: 'char_1016_agoat2_epoque_34', home: 'char_1016_agoat2_epoque_57' } },
    'adele-caster': { outfit: 'default', build: { default: 'char_180_amgoat' } },
  };
  // 手绘姿势 → 基建动画
  const POSE = {
    stand: 'Relax', idle: 'Relax', look: 'Relax', 'look-up': 'Relax', nod: 'Relax', listen: 'Relax',
    walk: 'Move', run: 'Move',
    sit: 'Sit',
    sleep: 'Sleep',
    wave: 'Interact', wave2: 'Interact', cheer: 'Interact', clap: 'Interact', joy: 'Interact',
  };
  const ARMS_OK = { rest: 1, swing: 1, pump: 1 };
  // 身上背着的、SD 模型本来就有的道具：不妨碍用官方小人（法杖：基建小人手里没有，放下）
  const PROP_OK = { staff: 1, satchel: 1, backpack: 1, bag: 1 };
  const RUNK = 1.75; // 跑 = 加快的 Move
  /** 按身高算的统一步速（身高 / 秒）：同一个角色的各套时装走路一样快（影片按 gait() 配速时不必知道 outfit） */
  const CANON = { 'adele-alter': 0.5, 'adele-caster': 0.5 };
  const log = [];
  let lastW = null, lastO = null, lastD = null;
  function decide(who, o) {
    if (lastO === o && lastW === who && o) return lastD;
    const d = decide0(who, o || EMPTY);
    lastW = who; lastO = o; lastD = d;
    if (API.audit) log.push({ who, pose: (o && o.pose) || 'stand', outfit: o && o.outfit, view: o && o.view, key: d.key || null, anim: d.anim || null, why: d.why || 'sd', sil: !!(o && o.sil) });
    return d;
  }
  function decide0(who, o) {
    const C = CAST[who];
    if (!C) return { why: 'who' };
    if (!API.enabled || OFF) return { why: 'off' };
    if (o.sd === false) return { why: 'o.sd=false' };
    const outfit = o.outfit && C.build[o.outfit] ? o.outfit : C.outfit;
    const char = C.build[outfit];
    // 影片直接指定官方动画（作战 / 施法镜头）
    if (o.sd) {
      const sp = typeof o.sd === 'string' ? { anim: o.sd } : o.sd;
      const view = sp.view || (/^(Relax|Move|Sit|Sleep|Interact|Special)$/.test(sp.anim || '') ? 'build' : 'front');
      return { key: char + '/' + view, anim: sp.anim || (view === 'build' ? 'Relax' : 'Idle'), spec: sp, rate: sp.speed };
    }
    if (o.crop) return { why: 'crop:' + o.crop };
    const pose = o.pose || 'stand';
    const anim = POSE[pose];
    if (!anim) return { why: 'pose:' + pose };
    if (o.arms && !ARMS_OK[o.arms] && POSE[o.arms] !== anim) return { why: 'arms:' + o.arms };
    if (o.legs && !ARMS_OK[o.legs] && POSE[o.legs] !== anim) return { why: 'legs:' + o.legs };
    const props = Array.isArray(o.prop) ? o.prop : o.prop ? [o.prop] : [];
    for (const p of props) if (!PROP_OK[p]) return { why: 'prop:' + p };
    if (o.air > 0 || o.float) return { why: 'air' };
    if (anim === 'Sleep' && o.desk) return { why: 'sleep@desk' };
    let view = o.view || '';
    if (o.yaw != null) { const y = Math.abs(((o.yaw % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); view = y < Math.PI * 0.35 ? 'back' : ''; }
    if (view === 'back' || view === 'back3') {
      if (anim !== 'Relax') return { why: 'back:' + pose };
      return { key: char + '/back', anim: 'Idle' };
    }
    return { key: char + '/build', anim, run: pose === 'run' };
  }
  function wants(who, o) {
    try {
      if (!CAST[who]) return false;
      const d = decide(who, o);
      if (!d.key) return false;
      want(parse(d.key));
      return true;
    } catch (e) { return false; }
  }
  /** 手绘角色库的选项 → draw 的选项 */
  function castOpts(who, o, d, R) {
    const q = {
      x: o.x, y: o.y, h: o.h, flip: o.flip, t: o.t, phase: o.phase, alpha: o.alpha, rot: o.rot,
      anim: d.anim, sil: o.sil, shadow: o.shadow === true ? true : false, shadowY: o.shadowY, shadowA: o.shadowA,
    };
    if (o.rim) q.rim = { color: o.rim, dir: o.rimDir, width: o.rimW ? o.rimW * 2.2 : undefined, glow: o.rimGlow ?? (o.sil ? 0.18 : 0) };
    if (d.spec) { Object.assign(q, d.spec, { anim: d.anim }); delete q.view; }
    // 步频：Move 的播放速度让脚底不打滑（与 gaitCast 给出的横向速度一致）
    if (d.anim === 'Move' && R && R.info && R.info.gait) {
      const G = R.info.gait, want0 = (CANON[who] || 0.5) * R.info.height; // 骨骼单位 / 秒
      q.speed = (o.speed > 0 ? o.speed : 1) * (d.run ? RUNK : 1) * (want0 / G.speed);
    } else if (d.rate) q.speed = d.rate;
    else q.speed = 1;
    // Sit：基建小人坐在椅子上（根骨骼在座面，小腿垂下）；手绘的 seat = 座面离脚底的高度，没给时脚踩地
    if (d.anim === 'Sit' && R && R.info) {
      const s = scaleOf(R, o), drop = sitDrop(R);
      const seat = o.seat != null ? o.seat : drop * s;
      q.y = (o.y || 0) - seat;
    }
    return q;
  }
  /** Sit 动画里脚底比根骨骼低多少（骨骼单位） */
  function sitDrop(R) {
    if (R.info.sitDrop != null) return R.info.sitDrop;
    const a = R.anims && R.anims.get('Sit');
    let v = 0;
    if (a) { const b = animBounds(R, a); v = Math.max(0, -(b[1] + Math.max(b[2] - b[0], b[3] - b[1]) * 0.03 + 4)); }
    R.info.sitDrop = v;
    return v;
  }
  function drawCast(g, who, o) {
    try {
      const d = decide(who, o);
      if (!d.key) return false;
      const P = parse(d.key), R = P && models.get(P.id);
      if (!R || !R.ready) { want(P); return false; }
      const ok = draw(g, d.key, castOpts(who, o, d, R));
      if (API.audit && log.length) log[log.length - 1].drawn = ok;
      return ok;
    } catch (e) { return false; }
  }
  function anchorsCast(who, o) {
    try {
      const d = decide(who, o);
      if (!d.key) return null;
      const P = parse(d.key), R = P && models.get(P.id);
      if (!R || !R.ready) return null;
      const A = anchors(d.key, castOpts(who, o, d, R));
      if (A) A.feet = [o.x || 0, o.y || 0];
      return A;
    } catch (e) { return null; }
  }
  function gaitCast(who, o) {
    try {
      const d = decide(who, o);
      if (!d.key || d.anim !== 'Move') return null;
      const P = parse(d.key), R = P && models.get(P.id);
      if (!R || !R.ready || !R.info) return null;
      const h = o.h > 0 ? o.h : 300, k = o.speed > 0 ? o.speed : 1, v = (CANON[who] || 0.5) * h * k * (d.run ? RUNK : 1);
      const G = R.info.gait, period = G ? G.dur / (k * (d.run ? RUNK : 1) * ((CANON[who] || 0.5) * R.info.height / G.speed)) : 1;
      return { speed: v, period, stride: v * period };
    } catch (e) { return null; }
  }
  /** 影片可能用到的模型（预载用）：def.sd 列表；没有时按影片脚本里的 cast 调用猜 */
  function modelsFor(def) {
    const out = new Set();
    if (def && Array.isArray(def.sd)) { def.sd.forEach((k) => { const P = parse(k); if (P) out.add(P.id); }); return [...out]; }
    return [...out];
  }
  async function prepareFilm(def, timeout = 8000) {
    try {
      let keys = modelsFor(def);
      if (!keys.length && def && def.id) keys = await scanFilm(def.id);
      if (!keys.length) return true;
      return await load(keys, timeout);
    } catch (e) { return false; }
  }
  /** 从影片脚本的源码里找 cast(…'adele-alter'…outfit…) 的调用，猜出要预载的模型 */
  async function scanFilm(id) {
    try {
      const s = [...document.scripts].find((x) => x.src && new RegExp('/films/' + id.replace(/[^\w-]/g, '') + '\\.js(\\?|$)').test(x.src));
      if (!s) return [];
      const txt = await (await fetch(s.src)).text();
      const out = new Set();
      for (const who in CAST) {
        const C = CAST[who];
        if (txt.indexOf("'" + who + "'") < 0) continue;
        const lines = txt.split('\n').filter((l) => l.indexOf("'" + who + "'") >= 0 || /adele\s*\(/.test(l));
        let any = false;
        for (const l of lines) {
          const m = /outfit:\s*'([\w-]+)'/.exec(l);
          if (m && C.build[m[1]]) { out.add(C.build[m[1]] + '/build'); any = true; }
        }
        if (!any || lines.some((l) => !/outfit:/.test(l))) out.add(C.build[C.outfit] + '/build');
      }
      return [...out].slice(0, 5);
    } catch (e) { return []; }
  }

  /* ---------------------------------------------------------------- 释放 */
  let relT = 0, shrinkAt = 0;
  function shrink() {
    if (!gl) return;
    if (fbo && glLive()) { gl.deleteFramebuffer(fbo); gl.deleteTexture(fboTex); }
    fbo = null; fboTex = null; fboW = fboH = 0;
    if (cv) { cv.width = cv.height = 1; CW = CH = 1; }
    stats.canvas[0] = stats.canvas[1] = 1;
  }
  function flushRelease() {
    relT = 0;
    const t = now();
    let pending = false;
    for (const R of models.values()) {
      if (!R.dropAt) continue;
      if (R.dropAt <= t) { R.dropAt = 0; dropGPU(R); } else pending = true;
    }
    if (shrinkAt && shrinkAt <= t) { shrinkAt = 0; if (![...models.values()].some((R) => R.ready || R.loading)) shrink(); }
    if (pending || shrinkAt) relT = setTimeout(flushRelease, 300);
  }
  function release(key, immediate) {
    try {
      const P = key ? parse(key) : null;
      const list = P ? [models.get(P.id)].filter(Boolean) : [...models.values()];
      if (immediate === true) {
        for (const R of list) { R.dropAt = 0; dropGPU(R); }
        if (!P) { shrinkAt = 0; shrink(); }
        return;
      }
      const at = now() + 1500;
      for (const R of list) if (R.ready || R.loading) R.dropAt = at;
      if (!P) shrinkAt = at;
      if (!relT) relT = setTimeout(flushRelease, 1600);
    } catch (e) { /* 无妨 */ }
  }

  /* ---------------------------------------------------------------- 接口 */
  const API = {
    credit: CREDIT,
    enabled: true,
    audit: false,
    log,
    opts,
    stats,
    aliases: ALIAS,
    cast: CAST,
    poses: POSE,
    supported: () => initGL(),
    parse: (key) => { const p = parse(key); return p ? Object.assign({}, p) : null; },
    keys: () => Object.keys(ALIAS),
    load,
    ready: (key) => { const P = parse(key), R = P && models.get(P.id); return !!(R && R.ready && glLive() && R.gen === gen); },
    has: (key, anim) => { const P = parse(key), R = P && models.get(P.id); return !!(R && R.anims && R.anims.has(anim)); },
    draw,
    anchors,
    gait,
    crowd,
    info: (key) => {
      const P = parse(key), R = P && models.get(P.id);
      if (!R || !R.data) return P ? { id: P.id, ready: false } : null;
      const I = R.info;
      return {
        id: R.id, ready: R.ready, view: P.view, pma: R.pma, height: Math.round(I.height), bb: I.bb.map(Math.round),
        anims: R.data.animations.map((a) => [a.name, +a.duration.toFixed(3)]),
        bones: { head: I.head && I.head.data.name, handN: I.handN && I.handN.data.name, handF: I.handF && I.handF.data.name, footL: I.footL && I.footL.data.name, footR: I.footR && I.footR.data.name, chest: I.chest && I.chest.data.name, hip: I.hip && I.hip.data.name },
        gait: I.gait ? { speed: +I.gait.speed.toFixed(1), dur: +I.gait.dur.toFixed(3), perHeight: +(I.gait.speed / I.height).toFixed(3) } : null,
        load: stats.loads[R.id] || null, bytes: R.bytes, tex: R.nat || null,
      };
    },
    release,
    wants,
    drawCast,
    anchorsCast,
    gaitCast,
    decide: (who, o) => { const d = decide0(who, o || EMPTY); return Object.assign({}, d); },
    prepareFilm,
    scanFilm,
    _models: models,
    _gl: () => gl,
  };
  Object.defineProperty(stats, 'gpuMB', { enumerable: true, get: () => Math.round([...models.values()].reduce((s, R) => s + (R.ready ? R.bytes : 0), 0) / 1048576) });
  Object.defineProperty(stats, 'models', { enumerable: true, get: () => [...models.values()].filter((R) => R.ready).map((R) => R.id) });
  E.sd = API;
})();
