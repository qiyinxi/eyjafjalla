/* =========================================================
 * MV · 官方 Q 版小人（游戏内 Spine 模型）渲染器   →  window.MVE.sd
 *
 * 用游戏里真正的 Spine 小人（PRTS 资源站 torappu.prts.wiki，与本页 js/chibi.js 的小剧场同源）代替手绘 Q 版角色，
 * [self-host] 用到的模型与立绘都在本站 assets/official/ 里有副本，先取本地，本地没有才退回 PRTS（见 localOf / cardLocal）。
 * 画进 MV 的 Canvas 2D 画面。和 js/mv/keyart.js 同一套架构：共享的一张离屏 WebGL 画布、只渲染屏幕上看得见的那一块、
 * 按它在屏幕上的实际像素渲染，再 drawImage 贴回。姿势是 t 的纯函数（setToSetupPose + Animation.apply，从不步进
 * AnimationState），任意跳帧都一致。
 *
 * ---------------------------------------------------------------- 模型 key
 *   干员：'char_1016_agoat2/build'（默认时装 · 基建小人）  视角：build（基建：Relax / Move / Sit / Sleep / Interact / Special）
 *         'char_1016_agoat2/front'（作战 · 正面）           front（作战：Start / Idle / Attack / Skill_* / Die）
 *         'char_1016_agoat2/back'（作战 · 背面）            back（作战背面：Start / Idle / Attack / Skill_*，没有 Move）
 *         时装：'char_1016_agoat2_epoque_34/build'（= 皮肤目录名 / 视角）；省略视角 = build
 *   敌人：'enemy_1545_shpkg'、'enemy_1344_ddlamb_2'（torappu.prts.wiki/assets/enemy_spine/<id>/<id>.skel，没有 meta.json）
 *   简写（ALIAS）：'alter' 'alter-front' 'alter-back' 'alter-picnic' 'alter-home' 'caster' 'caster-summer' 'caster-sanrio'
 *         'dolly' 'lamb' 'snowsant' 'swire2' 'buildr' 'bryota' …（见 keys()）
 *   多利 enemy_1545_shpkg：A 形态（大团粉云羊）Idle_A / Move_A / Attack_A / Skill_A_* / Fall_A_* / Die_A_*；B 形态（小一号）Idle_B / Move_B
 *   粉色小羊（「火山旅梦」的敌人，都很小，37–126 KB）：1344 交通锥、1345 耳机飞盘、1346 滑板、1347 竹蜻蜓、1348 尘云、1349 大个子、
 *         1350 巫师帽（_2 为换色）；动画 Idle / Move / Attack / Die。1351“好朋友”是白云羊，Idle 是透明的，不要用
 *   客串（汐斯塔的街）：雪雉 char_383_snsant、琳琅诗怀雅 char_1033_swire2、苍苔 char_4106_bryota、锡兰 char_348_ceylon（夏装
 *         char_348_ceylon_summer_13）、黑 char_340_shwaz、青枳 char_488_buildr —— 基建模型 Relax / Move / Sit / Sleep / Interact
 *   芳汀 = 干员 char_271_spikes（基建动画名正常；作战是 Attack_01 / Combat / Skill_01 / Skill_02，ANIM_FALLBACK 会找到）
 *
 * ---------------------------------------------------------------- 接口
 *   load(key | [keys], timeoutMs = 15000) → Promise<boolean>   预载（运行库 + meta + skel + atlas + 贴图，上传显卡）。只 resolve，
 *                                   不 reject；超时 resolve(false)，加载在后台继续。失败按退避重试；PRTS 偶尔断连：每个请求 20 秒超时、
 *                                   重试 3 次，同时最多 6 个请求。运行库与 js/chibi.js 共用（已加载 / 正在加载时不重复）
 *   ready(key) → boolean · has(key, anim) → boolean · supported() → boolean（有没有可用的 WebGL）
 *                                   ready 在“这个镜头播放中途才加载好”的模型上仍返回 false（到下一个镜头才 true），影片按它选官方 / 替代画面，
 *                                   同一个镜头里不会换人
 *   trace                            调试：设成函数时，每次 draw / drawCached / card 报告这一帧的动画时间、位置与骨骼（lab/jitter.html 用）；平时 null
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
 *       solo          true：不画模型自带的同伴（挂在 'Common' 骨骼下的整棵子树：后来的故事里的爸爸妈妈羊、伞、书、特效）
 *       glow          0..1：身后一团柔光（glowRgb，默认粉色）
 *     }
 *   drawCached(g, key, o) → boolean  与 draw 相同的参数；画面上不大的（身高 ≤ opts.cacheMaxPx 设备像素）按“动画时间取整到 1/30 秒”
 *                                   的帧缓存贴图（按需生成、LRU，尺寸按半个八度分档、只缩小不放大）。一群小羊用它：每只每帧一次 drawImage，
 *                                   动作仍是 30 帧 / 秒。剪影 / 逆光 / 交叉淡化 / 混合模式、以及大的小人，自动改走 draw。
 *                                   o.warm = true：不画，只把这一圈要用的帧排进预热队列（影片切镜头前空跑下一个镜头时用），
 *                                   之后每次 frame() 花最多 opts.warmMs 毫秒生成；cacheStats() 给出命中 / 现生成 / 预热的帧数
 *     相位（phase）只能跟“这是谁”有关（序号、seed），不能跟位置、大小、朝向有关：动画时间 = (t + phase) × speed，
 *     phase 或 speed 每帧一变，动画就每帧跳（走动的人会“抽搐”）。速度会变的走路请按走过的距离锁步相（见 before-summer 的 stride）
 *   anchors(key | who, o) → { head, face, top, chest, hip, handN, handF, hands, prop, feet, footL, footR, bounds, s }
 *                                   与 draw 同一构图、同一时刻，骨骼的世界坐标换算到调用者坐标（bounds = [x0, y0, x1, y1]）；
 *                                   第一个参数是角色库的 who（'adele-alter'）时等于 anchorsCast
 *   gait(key, o) → { speed, period, stride }   Move 动画脚不打滑的横向速度（调用者像素 / 秒；按 o.h、o.speed）。
 *                                   测量：逐帧取着地的那只脚（两只脚里更低的、离自己最低点不到 3% 身高），它后移速度的中位数；
 *                                   着地的骨骼按“最低点贴近地面、真的在动”挑（骑羊的时装是羊腿）。与影片组的检查方法一致
 *                                   （lab/sd.html?sheet=gaitcheck：按 MVE.cast.gait() 前进、MVE.cast.anchors 的脚，漂移 ≤ 1%）
 *   info(key) → { anims: [[名, 秒]], bones, height, gait, tex, load, ready, pma, view }（已加载时）
 *   crowd(g, list, common) → 画了几个         一群小人（按 y 从远到近排序）：list = [{ key, x, y, h, anim, flip, t, phase, speed, … }]
 *   card(g, key, o) → boolean        官方剧情立绘（avg）做成人物剪纸（凯勒、多利、雪雉……）：见下面“立绘卡片”一节
 *   release(key?, immediate?)        释放显存（默认推迟 1.5 秒，期间又 draw / load 就取消）；5 分钟没画自动全部释放
 *   prepareFilm(def, ms) → Promise<boolean>   预载一部影片会用到的模型（def.sd 列表；没有时扫描影片脚本里的角色调用）。
 *                                   引擎在 needs 含 'sd' 的影片 prepare 时自动调用；ctx.sd(key) 也可以在影片的 prepare 里用
 *   frame(id)                        引擎每帧调用（'影片id:镜头id'，js/mv/engine.js render()）：播放中途才加载好的模型，角色库这边
 *                                   等到下一个镜头再换上，同一个镜头里不会从手绘版突然跳成官方小人
 *   credit                           片尾署名：「Q版小人 © Hypergryph（官方 Spine 模型）」
 *   stats → { draws, lastMs, avgMs, canvas, models, gpuMB, loads }
 *
 * ---------------------------------------------------------------- 角色库（MVE.cast）适配：钩子
 *   js/mv/cast.js 的 draw / anchors / gait 开头各有一行：
 *     draw:    const S = window.MVE && MVE.sd; if (S && S.wants && S.wants(who, o) && S.drawCast(g, who, o)) return;
 *     anchors: const S = window.MVE && MVE.sd; if (S && S.wants && S.wants(who, o)) { const A = S.anchorsCast(who, o); if (A) return A; }
 *     gait:    const S = window.MVE && MVE.sd; if (S && S.wants && S.wants(who, o)) { const G = S.gaitCast(who, o); if (G) return G; }
 *   wants(who, o) → boolean：这个角色、这个姿势有官方小人可用（没加载时顺手开始加载）；drawCast 没画成（没加载完）时返回 false，
 *   角色库照常画手绘版。映射（CAST / POSE 两张表）：
 *     'adele-alter'  outfit coat → char_1016_agoat2 · picnic → …_epoque_34 · home → …_epoque_57（自带的羊 / 伞不画：solo）
 *     'adele-caster' → char_180_amgoat · 'adele-child' → char_180_amgoat（童年也用官方艾雅法拉小人，outfit 不管）
 *     'fontaine' → char_271_spikes（芳汀）
 *     'dolly' → enemy_1545_shpkg · 'sheep-pink' → 粉色小羊（1344 / 1345 / 1350 / 1344_2 / 1350_2，按 o.seed 或 o.variant 选）
 *          这两个是 opt-in：o.sd === true（或 MVE.sd.castOn[who] = true）才接管。影片会把手绘小羊按像素量尺寸、画进精灵缓存，
 *          默认接管会让缓存与尺寸对不上。羊的 h ≈ 身长、多利的 h ≈ 整团高度（按模型的 C_Body 换算）；jump / bounce 自己往上跳
 *     pose stand / idle / look / look-up / nod / listen → Relax · walk / run → Move · sit → Sit（手放腿上 arms: 'lap' 也行）
 *          · sleep → Sleep（趴在桌上 desk 的除外）· wave / wave2 / cheer / clap / joy → Interact（艾雅法拉的 Interact 是被吓一跳，
 *          这几个改用 Relax）· view back / back3 的站姿 → 作战背面 Idle（纯烬 / 术师；背面模型拿着法杖）
 *     道具：staff（放下）、satchel / backpack / bag、stone（手心的小石头，影片在 anchors().prop 画光）不妨碍；其它道具 → 手绘
 *     走 / 跑的横向速度 = 手绘版同样参数下的步速（MVE.cast.gait，sd: false 取原生值）：影片按角色库算好的配速，不管这一帧
 *          是官方小人还是手绘版都对得上；Move 的播放速度由此反推（跑 = 加快的 Move）
 *     Sit：基建小人坐在椅子上（根骨骼在座面，小腿垂下）；o.seat = 座面离脚底的高度，没给时让脚刚好踩地
 *     其余姿势（hug / carry / reach / kneel / point / write / jump / sit-ground / walk-away / turn / crop 特写 …）返回 false → 手绘版
 *   换姿势时交叉淡化：o.mixFrom = 上一个姿势（与 o 合并，例如 { pose: 'walk' }），o.mixK = 0..1（1 = 全是现在的姿势）；
 *          同一个模型、同一视角时才淡化（站 ↔ 走 ↔ 挥手 ↔ 坐），否则硬切
 *   o.sd：false = 这一次强制手绘；true = 允许 opt-in 的角色；'Attack' / { anim, view: 'front' | 'back' | 'build', speed, loop }
 *         = 强制用官方小人的某个动画（作战 / 施法镜头，例如 { anim: 'Skill_3_Loop', view: 'front' } 举杖施法）
 *   audit：MVE.sd.audit = true 时每次决定记进 MVE.sd.log（lab/sd.html?film=…&audit=1 用来列出每个镜头是小人还是手绘）
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
  // [self-host] 本站自带官方资源（assets/official/：spine/ 镜像 torappu.prts.wiki/assets/ 的目录结构，avg/ 是立绘卡片）。
  // 本地优先：地址按本脚本自己的位置解析（js/mv/sd.js → ../../assets/official/），首页、lab/ 实验页、GitHub Pages 的子路径下都对；
  // 本地没有（404 / 出错）时静默退回 PRTS 原地址（之后这个文件直接走 PRTS）
  const TORAPPU = 'https://torappu.prts.wiki/assets/';
  const OFFICIAL = (() => {
    try {
      const me = document.currentScript || [...document.scripts].find((s) => /\/js\/mv\/sd\.js(?:[?#]|$)/.test(s.src));
      return (me && me.src ? new URL('../../assets/official/', me.src) : new URL('assets/official/', location.href)).href;
    } catch (e) { return ''; }
  })();
  const localMiss = new Set();
  const localOf = (url) => (OFFICIAL && url.startsWith(TORAPPU) ? OFFICIAL + 'spine/' + url.slice(TORAPPU.length).split('?')[0] : '');
  // [/self-host]
  // cacheFps / cacheMaxPx / cacheMB：drawCached 的帧率（动画时间）、只缓存身高不超过多少设备像素的、缓存上限（0 = 桌面 24MB、触屏 12MB）
  // warmMs：每帧最多花多少毫秒生成预热队列里的帧（见 drawCached 的 o.warm）
  const opts = { maxDim: 2048, budget: 32, budgetMB: 0, idleSec: 300, debug: false, mip: true, cacheFps: 30, cacheMaxPx: 150, cacheMB: 0, warmMs: 1.5 };
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
      let m = /^(enemy_\d+_[a-z0-9]+(?:_\d+)?)$/i.exec(k);
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
  // [self-host] 先取本地副本（assets/official/spine/…），失败再走原地址（下面的 fetchT0，照旧超时 + 重试）
  async function fetchT(url, kind) {
    const lu = localOf(url);
    if (lu && !localMiss.has(lu)) {
      try { return await fetchT0(lu, kind); } catch (e) { localMiss.add(lu); }
    }
    return fetchT0(url, kind);
  }
  // [/self-host]
  /** 带超时的 fetch（超时从真正发出请求时算起，排队不算）；body 读完才算结束 */
  async function fetchT0(url, kind) {
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
      // 运行库也用本站自带的副本（assets/vendor/），加载失败再退回 jsDelivr
      const LIB_LOCAL = OFFICIAL ? OFFICIAL.replace(/official\/$/, 'vendor/spine-webgl-3.8.js') : '';
      const one = (src) => new Promise((res, rej) => {
        const old = [...document.scripts].find((s) => s.src === src);
        const s = old || document.createElement('script');
        const to = setTimeout(() => { rej(new Error('spine runtime timeout')); }, 25000);
        s.addEventListener('load', () => { clearTimeout(to); res(true); });
        s.addEventListener('error', () => { clearTimeout(to); if (!old) s.remove(); rej(new Error('spine runtime')); });
        if (!old) { s.src = src; s.async = true; document.head.appendChild(s); }
      });
      libP = (LIB_LOCAL ? one(LIB_LOCAL).catch(() => one(LIB)) : one(LIB)).catch((e) => { libP = null; throw e; });
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
    R.gate = curShot; // 播放中才加载好：角色库这边等镜头换了再用（见 frame()）
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
  /** 显存预算：超过 opts.budgetMB（桌面 160MB、触屏 80MB）或 opts.budget 个模型时，释放最久没画的 */
  function budget(keep) {
    const live = [...models.values()].filter((R) => R.ready).sort((a, b) => a.last - b.last);
    const cap = (opts.budgetMB || (matchMedia('(pointer: coarse)').matches ? 80 : 160)) * 1048576;
    let bytes = live.reduce((s, R) => s + R.bytes, 0), n = live.length;
    for (const R of live) {
      if (bytes <= cap && n <= opts.budget) break;
      if (R === keep) continue;
      bytes -= R.bytes; n--;
      dropGPU(R);
    }
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
    for (const n of fb) { const x = R.anims.get(n) || R.anims.get(n + '_A') || R.anims.get(n + '_01'); if (x) return x; }
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
    let hb = null, all = null, body = null;
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
      if (!body && /^(c|cc|f)_body$/i.test(slot.data.name)) body = [x0, y0, x1, y1]; // 敌人（羊 / 多利）的身体：给按身长缩放用
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
    // 同伴 / 道具：挂在 'Common' 骨骼下的一整棵子树（后来的故事：爸爸妈妈羊、小羊、伞、书、特效），solo 时不画
    // （有的模型——比如敌人小羊——整只都挂在 Common 下：头在 Common 里时它不是“同伴”，不隐藏）
    const common = bones.find((b) => /^common$/i.test(b.data.name));
    const comp = common && !(head && isDesc(head, common)) ? bones.filter((b) => isDesc(b, common)) : [];
    // 步速测量用的候选骨骼：名字带 foot / shoe / toe / leg / calf 的、在下半身的（羊、多利、骑着的羊也算；
    // 同伴子树和 IK 控制骨骼除外）。真正着地的是哪几根，在 measureGait 里按“最低点贴近地面”再挑
    const compSet = new Set(comp);
    const legs = bones.filter((b) => /foot|shoe|shose|toe|leg|calf|shin/i.test(b.data.name) && !/ik|somk|smoke/i.test(b.data.name) && !compSet.has(b) && b.worldY < top * 0.35);
    const info = { height: top, bb, body, head, headBox, handN: nearL ? handL : handR, handF: nearL ? handR : handL, footL, footR, legs, chest, hip, gait: null, restName: rest ? rest.name : '', comp };
    info.gait = measureGait(R, info);
    return info;
  }
  function countDesc(bones, b) { let n = 0; for (const x of bones) if (x !== b && isDesc(x, b)) n++; return n; }
  /**
   * Move 动画的地面速度（骨骼单位 / 秒）：逐帧取“着地的那只脚”——两只脚里更低的那只，而且离它自己的最低点
   * 不到身高的 3%——它往后移的速度，取所有着地帧的中位数（按着地时长自然加权；不对两只脚求平均）。
   * 官方动画的着地段常带缓入缓出、落脚时还往前滑一点，中位数让典型的一帧不打滑。
   * 与影片组的检查方法一致（lab/sd.html?sheet=feet，MVE.cast.anchors 的 footL / footR）。
   */
  function measureGait(R, info) {
    const S = window.spine, sk = R.skel, a = R.anims && (R.anims.get('Move') || R.anims.get('Move_A'));
    if (!a || !(a.duration > 0)) return null;
    const N = Math.max(120, Math.ceil(a.duration * 90)), cand = info.legs;
    if (!cand.length) return { speed: info.height * 0.45, dur: a.duration, est: true };
    const xs = cand.map(() => new Float32Array(N + 1)), ys = cand.map(() => new Float32Array(N + 1));
    for (let i = 0; i <= N; i++) {
      sk.setToSetupPose();
      a.apply(sk, 0, (a.duration * i) / N, true, null, 1, S.MixBlend.setup, S.MixDirection.mixIn);
      sk.updateWorldTransform();
      cand.forEach((f, j) => { xs[j][i] = f.worldX; ys[j][i] = f.worldY; });
    }
    R.lastAnim = null; R.posed = null;
    const dt = a.duration / N;
    // 真正着地的骨骼：这一段里最低点贴近地面（全体候选的最低点 + 4% 身高以内），而且水平方向真的在动（≥ 2% 身高）。
    // 骑在羊上的时装（远行前的野餐）着地的是羊腿；脚尖 / 脚跟有好几根时各取摆幅最大的一根
    const mins = cand.map((f, j) => { let m = Infinity; for (let i = 0; i <= N; i++) m = Math.min(m, ys[j][i]); return m; });
    const range = cand.map((f, j) => { let x0 = Infinity, x1 = -Infinity; for (let i = 0; i <= N; i++) { x0 = Math.min(x0, xs[j][i]); x1 = Math.max(x1, xs[j][i]); } return x1 - x0; });
    // 地面 = 在动的骨骼里最低的那个最低点（不动的骨骼——比如基建模型里藏着的背面骨骼——不算）
    const live = (j) => range[j] >= info.height * 0.02;
    let ground = Infinity;
    cand.forEach((f, j) => { if (live(j)) ground = Math.min(ground, mins[j]); });
    const best = { L: [-1, 0], R: [-1, 0] }, moving = [];
    cand.forEach((f, j) => {
      if (!live(j) || mins[j] > ground + info.height * 0.04) return; // 不怎么动（控制骨骼 / 装饰）或离地面太高
      const x1x0 = range[j];
      moving.push([j, x1x0]);
      // 左右：F_L_Foot / F_Shoes_L / Left…（前缀或后缀）
      const nm = f.data.name, side = /(^|_)(L|left)(_|$|\d)/i.test(nm) ? 'L' : /(^|_)(R|right)(_|$|\d)/i.test(nm) ? 'R' : null;
      if (side && x1x0 > best[side][1]) best[side] = [j, x1x0];
    });
    let feet;
    if (best.L[0] >= 0 && best.R[0] >= 0) feet = [best.L[0], best.R[0]];
    else feet = moving.sort((p, q) => q[1] - p[1]).slice(0, 4).map((m) => m[0]);
    // 锚点里的左右脚也用这两根（有的模型名字叫 foot 的骨骼其实不动）
    if (feet.length >= 2) { info.footL = cand[feet[0]]; info.footR = cand[feet[1]]; }
    const mn = feet.map((j) => mins[j]);
    const lim = info.height * 0.03, v = [];
    let contacts = 0, was = false, lift0 = 0;
    if (feet.length) for (let i = 0; i <= N; i++) lift0 = Math.max(lift0, ys[feet[0]][i] - mn[0]);
    const off = Math.max(lim * 1.2, lift0 * 0.55); // 抬到最高抬脚高度的一半多才算离地
    for (let i = 0; i < N; i++) {
      // 这一帧着地的脚：两只脚里更低的那只（绝对高度），而且离它自己的最低点不到 3% 身高
      let jj = -1, kk = -1, yy = Infinity;
      feet.forEach((j, k) => { if (ys[j][i] < yy) { yy = ys[j][i]; jj = j; kk = k; } });
      const on = jj >= 0 && ys[jj][i] - mn[kk] <= lim;
      if (on) v.push(-(xs[jj][i + 1] - xs[jj][i]) / dt);
      // 着地次数（第一只脚，带回差：抬到 3 倍阈值以上才算离地）：给一个步态周期的长度用
      if (feet.length) {
        const h0 = ys[feet[0]][i] - mn[0];
        if (!was && h0 <= lim) { contacts++; was = true; } else if (was && h0 > off) was = false;
      }
    }
    // 片段首尾是同一次着地（循环接缝）时别数两次
    if (feet.length && contacts > 1 && ys[feet[0]][0] - mn[0] <= lim && ys[feet[0]][N] - mn[0] <= lim) contacts--;
    v.sort((p, q) => p - q);
    let sp = v.length ? v[Math.floor(v.length / 2)] : 0;
    if (opts.gaitScale && opts.gaitScale[R.id]) sp *= opts.gaitScale[R.id]; // 调试用（实验页对比旧标定）
    const est = !(sp > info.height * 0.05);
    if (est) sp = info.height * 0.45; // 量不出来（原地踏步 / 飘着走）：按身高估
    return { speed: sp, dur: a.duration, cycles: Math.max(1, contacts), est };
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
    return { a, tt, sp };
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
  function animBounds(R, a, solo) {
    solo = !!(solo && R.info && R.info.comp.length);
    const ck = solo ? 'solo:' + a.name : a;
    let b = R.bounds.get(ck);
    if (b) return b;
    if (solo) setComp(R, false);
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
    if (solo) setComp(R, true);
    if (!(x1 > x0)) { x0 = -200; y0 = -50; x1 = 200; y1 = 500; }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.03 + 4;
    b = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
    R.bounds.set(ck, b);
    return b;
  }
  /** 同伴子树的骨骼开 / 关（只影响绘制与包围盒；骨骼照常计算） */
  function setComp(R, on) { const c = R.info && R.info.comp; if (c) for (let i = 0; i < c.length; i++) c[i].active = on; }

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
      const solo = !!(o.solo && R.info.comp.length);
      const bx = B ? union(animBounds(R, A.a, solo), animBounds(R, B.a, solo)) : animBounds(R, A.a, solo);
      pose(R, A, B, k); // 包围盒第一次算时会动骨架：再摆回来（已摆好时直接返回）
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
      if (API.trace) traceSD(g, R, A, B, k, o, Au, Av, Ac, Bu, Bv, Bc);
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
      if (solo) setComp(R, false);
      try { skr.draw(batcher, R.skel); } finally { if (solo) setComp(R, true); batcher.end(); }
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
      if (o.glow > 0) { const vh = Math.max(20, bx[3]) * s; E.glow(g, X, Y - vh * 0.45, vh * 1.1, o.glowRgb || '255,160,210', 0.34 * o.glow * alpha); }
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

  /* ---------------------------------------------------------------- 小尺寸的帧缓存
   * drawCached(g, key, o)：参数与 draw 相同。画面上不大的小人（身高 ≤ opts.cacheMaxPx 设备像素）按“动画时间取整到 1/opts.cacheFps 秒”
   * 渲染成一张小位图缓存起来，以后同一帧（同模型、同动画、同一档尺寸）直接 drawImage——一群小羊每帧只花几次贴图。
   * 与旧的“每个动作固定 10～12 帧的精灵条”不同：帧率按动画时间算（默认 30 帧 / 秒，0.8 秒的 Move 就是 24 帧），按需生成、
   * LRU 淘汰（opts.cacheMB），尺寸按半个八度分档（缓存图总是不小于屏幕上的尺寸，只缩小不放大，不会糊）。
   * 剪影、逆光、交叉淡化、混合模式这些不缓存，直接 draw。t 的纯函数：同一时刻永远是同一帧。 */
  const FC = new Map();
  let fcPx = 0;
  function fcCap() { return (opts.cacheMB || (matchMedia('(pointer: coarse)').matches ? 12 : 24)) * 262144; }
  function fcClear() { for (const c of FC.values()) { c.width = c.height = 0; } FC.clear(); fcPx = 0; FQ.length = 0; FQS.clear(); }
  /** 生成一帧缓存：key / 动画名 / 第几帧（共 nF 帧）/ 尺寸档 ts；失败返回 null */
  function fcBuild(key, R, an, fi, nF, d, ts, solo, tint, ck) {
    const a = R.anims && R.anims.get(an);
    if (!a) return null;
    const bx = animBounds(R, a, solo);
    const cw = Math.ceil((bx[2] - bx[0]) * ts) + 4, chh = Math.ceil((bx[3] - bx[1]) * ts) + 4;
    if (cw * chh > 1048576) return null;
    const c = E.mk(cw, chh);
    c._ox = -bx[0] * ts + 2; c._oy = bx[3] * ts + 2; c._ts = ts;
    const tr = API.trace; API.trace = null;
    let ok = false;
    try { ok = draw(c.getContext('2d'), key, { x: c._ox, y: c._oy, scale: ts, anim: an, t: d > 0 ? (fi * d) / nF : 0, speed: 1, phase: 0, loop: false, solo, tint }); }
    finally { API.trace = tr; }
    if (!ok) { c.width = c.height = 0; return null; }
    FC.set(ck, c); fcPx += cw * chh;
    const cap = fcCap();
    for (const [k2, c2] of FC) { if (fcPx <= cap || k2 === ck) break; fcPx -= c2.width * c2.height; c2.width = c2.height = 0; FC.delete(k2); }
    return c;
  }
  // 预热队列：影片在切镜头前“空跑”下一个镜头时（o.warm），把要用到的整圈帧排进来；frame() 每帧花一点时间（opts.warmMs）生成，
  // 镜头开头就不必一口气现生成几十帧。只影响“什么时候生成”，画出来的东西不变
  const FQ = [], FQS = new Set(), FST = { hit: 0, miss: 0, warm: 0 };
  function fcWarmStep(ms) {
    const t0 = now();
    while (FQ.length && now() - t0 < ms) {
      const it = FQ.shift(); FQS.delete(it.ck);
      if (FC.has(it.ck)) continue;
      const R = models.get(it.id);
      if (R && R.ready && R.gen === gen && glLive() && fcBuild(it.key, R, it.an, it.fi, it.nF, it.d, it.ts, it.solo, it.tint, it.ck)) FST.warm++;
    }
  }
  function drawCached(g, key, o) {
    o = o || EMPTY;
    if (o.sil || o.rim || o.mix || (o.from != null && o.to != null) || o.mode || opts.cacheFps === 0) return draw(g, key, o);
    let R;
    try {
      if (!g || !g.canvas) return false;
      const P = parse(key);
      if (!P) return false;
      R = models.get(P.id);
      if (!R || !R.ready || !glLive() || R.gen !== gen) return draw(g, key, o); // 没加载：draw 负责开始加载、返回 false
      const A = animSpec(R, o.anim || (R.P.view === 'build' ? 'Relax' : 'Idle'), o);
      if (!A) return false;
      const M = g.getTransform ? g.getTransform() : null;
      // 按变换里放大得最多的那个方向选档（挤压 / 拉伸时也不放大缓存图）
      const axk = M ? Math.max(Math.hypot(M.a, M.b), Math.hypot(M.c, M.d)) : g.canvas.width / VW;
      const s = scaleOf(R, o), devS = s * axk;
      if (!(devS > 0) || devS * R.info.height > (opts.cacheMaxPx || 150)) return draw(g, key, o);
      // 动画时间取整到 1/fps（循环动画按整数帧均分一圈，接缝不跳）
      const d = A.a.duration, fps = opts.cacheFps || 30, loop = o.loop ?? true;
      const nF = d > 0 ? Math.max(1, Math.round(d * fps)) : 1;
      let fi = d > 0 ? Math.round((A.tt / d) * nF) : 0;
      if (loop) fi %= nF; else fi = Math.min(fi, nF);
      // 尺寸档：不小于屏幕上的缩放，半个八度一档
      const ts = Math.pow(2, Math.ceil(Math.log2(devS) * 2 - 1e-6) / 2);
      const solo = !!(o.solo && R.info.comp.length);
      const tk = o.tint ? (Array.isArray(o.tint) ? o.tint.join('/') : typeof o.tint === 'object' ? o.tint.color + '/' + o.tint.amount : String(o.tint)) : '';
      const ckOf = (f) => R.id + '|' + A.a.name + '|' + f + '|' + ts.toFixed(4) + '|' + (solo ? 1 : 0) + '|' + tk + '|' + R.gen;
      if (o.warm) {
        // 预热：把这一圈的帧都排进队列（循环动画一整圈；不循环的从当前帧到结尾），不画
        const n = loop ? nF : nF + 1;
        for (let j = 0; j < n; j++) { const f = loop ? (fi + j) % nF : Math.min(nF, fi + j); const k2 = ckOf(f); if (!FC.has(k2) && !FQS.has(k2)) { FQS.add(k2); FQ.push({ id: R.id, key, an: A.a.name, fi: f, nF, d, ts, solo, tint: o.tint, ck: k2 }); } }
        if (FQ.length > 3000) { for (const it of FQ.splice(0, FQ.length - 3000)) FQS.delete(it.ck); }
        return true;
      }
      const ck = ckOf(fi);
      let c = FC.get(ck);
      if (c) { FC.delete(ck); FC.set(ck, c); FST.hit++; }
      else {
        FST.miss++;
        c = fcBuild(key, R, A.a.name, fi, nF, d, ts, solo, o.tint, ck);
        if (!c) return draw(g, key, o);
      }
      const X = +o.x || 0, Y = +o.y || 0, alpha = o.alpha == null ? 1 : clamp(+o.alpha);
      if (API.trace) { const pts = []; API.trace({ src: 'sd', cached: true, key: R.id, cv: g.canvas, anim: A.a.name, tt: A.tt, sp: A.sp, dur: d, animB: null, ttB: 0, k: 0, x: M ? M.a * X + M.c * Y + M.e : X, y: M ? M.b * X + M.d * Y + M.f : Y, s: devS, pts, alpha, sil: false, flip: !!o.flip }); }
      if (alpha <= 0.002) return true;
      g.save();
      if (o.shadow) {
        const sw = R.info.height * s * 0.34 * (o.shadowW || 1), sy = o.shadowY ?? Y, sa = (typeof o.shadow === 'number' ? o.shadow : o.shadowA ?? 0.26) * alpha;
        const ga = g.globalAlpha; g.globalAlpha = ga * clamp(sa);
        g.drawImage(shadowSprite(), X - sw, sy - sw * 0.16, sw * 2, sw * 0.32);
        g.globalAlpha = ga;
      }
      if (o.glow > 0) { const bb = animBounds(R, A.a, solo), vh = Math.max(20, bb[3]) * s; E.glow(g, X, Y - vh * 0.45, vh * 1.1, o.glowRgb || '255,160,210', 0.34 * o.glow * alpha); }
      g.translate(X, Y);
      if (o.rot) g.rotate(+o.rot);
      const kk = s / c._ts;
      g.scale((o.flip ? -1 : 1) * kk, kk);
      if (alpha < 1) g.globalAlpha *= alpha;
      g.imageSmoothingEnabled = true;
      g.drawImage(c, -c._ox, -c._oy);
      g.restore();
      R.last = now(); lastDraw = R.last;
      return true;
    } catch (e) { if (opts.debug) console.warn('[sd.cached]', e); return false; }
  }
  /**
   * 调试（lab/jitter.html）：MVE.sd.trace = (rec) => {} 时，每次 draw 报告这一帧的动画时间、构图与几根骨骼的设备坐标，
   * 用来逐帧比较（t 与 t + 1/60 之间姿势 / 位置的跳变）。平时 trace 为 null，不花任何开销
   */
  function traceSD(g, R, A, B, k, o, Au, Av, Ac, Bu, Bv, Bc) {
    try {
      const I = R.info, pts = [];
      for (const b of [I.head, I.hip, I.footL, I.footR, I.handN, I.chest]) if (b) pts.push(Au * b.worldX + Av * b.worldY + Ac, Bu * b.worldX + Bv * b.worldY + Bc);
      API.trace({ src: 'sd', key: R.id, cv: g.canvas, anim: A.a.name, tt: A.tt, sp: A.sp, dur: A.a.duration, animB: B ? B.a.name : null, ttB: B ? B.tt : 0, k,
        x: Ac, y: Bc, s: Math.sqrt(Math.abs(Au * Bv - Av * Bu)), pts, alpha: o.alpha == null ? 1 : +o.alpha, sil: !!o.sil, flip: !!o.flip });
    } catch (e) { /* 调试用，出错不影响画面 */ }
  }

  /* ---------------------------------------------------------------- 锚点 */
  function anchors(key, o) {
    try {
      o = o || EMPTY;
      if (CAST[key]) return anchorsCast(key, o); // 角色库的钩子可能直接传 who（'adele-alter'）
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
      const solo = !!(o.solo && I.comp.length);
      const bb = B ? union(animBounds(R, A.a, solo), animBounds(R, B.a, solo)) : animBounds(R, A.a, solo);
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
    const s = scaleOf(R, o), k = o.speed > 0 ? o.speed : 1, G = R.info.gait, per = G.dur / (G.cycles || 1);
    return { speed: G.speed * s * k, period: per / k, stride: G.speed * per * s };
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
  // 谁 → 模型。干员：按 outfit 选时装（any：不管 outfit 一律用默认时装）；back：view 'back' 的站姿用作战背面（背面模型拿着武器）
  // 敌人（kind）：dolly = 多利；lamb = 粉色毛绒绒的小羊（几种，按 o.seed / o.variant 选）。optIn：只有 o.sd === true
  // 或 MVE.sd.castOn[who] = true 时才接管——影片会把手绘小羊按像素量好尺寸、画进精灵缓存，默认接管会让缓存与尺寸对不上
  const CAST = {
    'adele-alter': { models: { coat: 'char_1016_agoat2', picnic: 'char_1016_agoat2_epoque_34', home: 'char_1016_agoat2_epoque_57' }, outfit: 'coat', back: true },
    'adele-caster': { models: { default: 'char_180_amgoat' }, outfit: 'default', back: true },
    snowsant: { models: { default: 'char_383_snsant' }, outfit: 'default', any: true }, // 雪雉（第五部的汽水摊店主；播放器的人物小像也用它）
    'adele-child': { models: { default: 'char_180_amgoat' }, outfit: 'default', any: true }, // 童年：用官方艾雅法拉小人（用户的决定），不管 school / summer / pajama
    fontaine: { models: { default: 'char_271_spikes' }, outfit: 'default', any: true }, // 芳汀 = 干员 char_271_spikes
    dolly: { kind: 'dolly', enemies: ['enemy_1545_shpkg'], optIn: true },
    'sheep-pink': { kind: 'lamb', enemies: ['enemy_1344_ddlamb', 'enemy_1345_tplamb', 'enemy_1350_mgcshp', 'enemy_1344_ddlamb_2', 'enemy_1350_mgcshp_2'], optIn: true },
  };
  // 手绘姿势 → 基建动画
  const POSE = {
    stand: 'Relax', idle: 'Relax', look: 'Relax', 'look-up': 'Relax', nod: 'Relax', listen: 'Relax',
    walk: 'Move', run: 'Move',
    jump: 'Move', // 近似：Move 的步子 + 和手绘版同一条起跳曲线（o.air，或按 t 自己循环），离地约 0.15 身高
    sit: 'Sit',
    sleep: 'Sleep',
    wave: 'Interact', wave2: 'Interact', cheer: 'Interact', clap: 'Interact', joy: 'Interact',
  };
  // 敌人：手绘姿势 → 动画
  const POSE_E = {
    dolly: { stand: 'Idle_A', idle: 'Idle_A', 'look-up': 'Idle_A', float: 'Idle_A', jump: 'Idle_A', bounce: 'Idle_A', walk: 'Move_A', run: 'Move_B' },
    lamb: { stand: 'Idle', idle: 'Idle', 'look-up': 'Idle', eat: 'Idle', float: 'Idle', walk: 'Move', run: 'Move', bound: 'Move', gallop: 'Move', jump: 'Move', bounce: 'Idle', push: 'Attack' },
  };
  const ARMS_OK = { rest: 1, swing: 1, pump: 1 };
  const ARMS_SIT = { lap: 1 }; // 坐着时手放在腿上：Sit 动画本来就是
  // 身上背着的、SD 模型本来就有的道具：不妨碍用官方小人（法杖：基建小人手里没有，放下）；
  // stone：手心里的小石头，影片自己在 anchors().prop 画光（石头本身很小，不画也看不出）
  const PROP_OK = { staff: 1, satchel: 1, backpack: 1, bag: 1, stone: 1 };
  // 个别模型的 Interact 不是“打招呼”：艾雅法拉（术师）的 Interact 是被吓一跳 → 挥手 / 欢呼改用 Relax
  const INTERACT_NOT_WAVE = { char_180_amgoat: 1 };
  const RUNK = 1.75; // 跑 = 加快的 Move（角色库不可用时）
  /** 角色库不可用时的步速（身高 / 秒） */
  const CANON = { snowsant: 0.5, 'adele-alter': 0.5, 'adele-caster': 0.5, 'adele-child': 0.5, fontaine: 0.5, dolly: 0.35, 'sheep-pink': 1.2 };
  const castOn = { dolly: false, 'sheep-pink': false };
  const log = [];
  let lastW = null, lastO = null, lastD = null, quiet = 0, lastLog = null;
  function decide(who, o) {
    if (lastO === o && lastW === who && o) return lastD;
    const d = decide0(who, o || EMPTY);
    lastW = who; lastO = o; lastD = d;
    return d;
  }
  /** 审计（lab/sd.html?film=…&audit=1）：记下角色库每次问“要不要官方小人”；gait() 的调用（没有 x）在统计时忽略 */
  function note(who, o, d) {
    if (!API.audit || quiet || !o) return;
    lastLog = { who, pose: o.pose || 'stand', outfit: o.outfit, view: o.view, x: o.x, y: o.y, h: o.h, key: d.key || null, anim: d.anim || null, why: d.why || 'sd', sil: !!o.sil, o };
    log.push(lastLog);
  }
  function decide0(who, o) {
    const C = CAST[who];
    if (!C) return { why: 'who' };
    if (!API.enabled || OFF) return { why: 'off' };
    if (o.sd === false) return { why: 'o.sd=false' };
    const spec = o.sd && o.sd !== true ? (typeof o.sd === 'string' ? { anim: o.sd } : o.sd) : null;
    if (C.kind) return decideEnemy(who, C, o, spec);
    const outfit = !C.any && o.outfit && C.models[o.outfit] ? o.outfit : C.outfit;
    const char = C.models[outfit];
    // 影片直接指定官方动画（作战 / 施法镜头）：o.sd = 'Skill_3_Loop' | { anim, view: 'front' | 'back' | 'build', speed, loop }
    if (spec) {
      const view = spec.view || (/^(Relax|Move|Sit|Sleep|Interact|Special)$/.test(spec.anim || '') ? 'build' : 'front');
      return { key: char + '/' + view, anim: spec.anim || (view === 'build' ? 'Relax' : 'Idle'), spec, rate: spec.speed };
    }
    if (o.crop) return { why: 'crop:' + o.crop };
    const pose = o.pose || 'stand';
    let anim = POSE[pose];
    if (!anim) return { why: 'pose:' + pose };
    if (anim === 'Interact' && INTERACT_NOT_WAVE[char]) anim = 'Relax';
    if (o.arms && !ARMS_OK[o.arms] && !(anim === 'Sit' && ARMS_SIT[o.arms]) && POSE[o.arms] !== anim) return { why: 'arms:' + o.arms };
    if (o.legs && !ARMS_OK[o.legs] && POSE[o.legs] !== anim) return { why: 'legs:' + o.legs };
    const props = Array.isArray(o.prop) ? o.prop : o.prop ? [o.prop] : [];
    for (const p of props) if (!PROP_OK[p]) return { why: 'prop:' + p };
    if ((o.air > 0 && pose !== 'jump') || o.float) return { why: 'air' };
    if (anim === 'Sleep' && o.desk) return { why: 'sleep@desk' };
    let view = o.view || '';
    if (o.yaw != null) { const y = Math.abs(((o.yaw % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); view = y < Math.PI * 0.35 ? 'back' : ''; }
    if (view === 'back' || view === 'back3') {
      if (anim !== 'Relax' || !C.back) return { why: 'back:' + pose };
      return { key: char + '/back', anim: 'Idle' };
    }
    return { key: char + '/build', anim, run: pose === 'run' || pose === 'jump', hop: pose === 'jump' };
  }
  function decideEnemy(who, C, o, spec) {
    if (C.optIn && !(o.sd === true || spec || castOn[who])) return { why: 'opt-in' };
    if (o.crop) return { why: 'crop:' + o.crop };
    const pose = o.pose || 'stand';
    const anim = spec && spec.anim ? spec.anim : POSE_E[C.kind][pose];
    if (!anim) return { why: 'pose:' + pose };
    let i = 0;
    // 直接点名一只不在默认列表里的官方敌人模型（如 'enemy_1347_fyshp' 竹蜻蜓小羊）：不改动按 seed 挑选的分布
    if (typeof o.variant === 'string' && /^enemy_\w+$/.test(o.variant) && C.enemies.indexOf(o.variant) < 0) return { key: o.variant, anim, kind: C.kind, air: pose === 'jump' || pose === 'bounce', spec, rate: spec && spec.speed, run: pose === 'run' };
    if (o.variant != null) { const v = C.enemies.indexOf(o.variant); i = v >= 0 ? v : Math.abs(o.variant | 0) % C.enemies.length; }
    else if (o.seed != null) i = Math.floor(E.hash(o.seed | 0, 77) * C.enemies.length);
    return { key: C.enemies[i], anim, kind: C.kind, air: pose === 'jump' || pose === 'bounce', spec, rate: spec && spec.speed, run: pose === 'run' };
  }
  function wants(who, o) {
    try {
      if (!CAST[who]) return false;
      const d = decide(who, o);
      note(who, o, d);
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
      solo: true, // 模型自带的同伴（后来的故事里的爸爸妈妈羊、伞……）由影片自己画，这里不要
    };
    if (o.rim) q.rim = { color: o.rim, dir: o.rimDir, width: o.rimW ? o.rimW * 2.2 : undefined, glow: o.rimGlow ?? (o.sil ? 0.18 : 0) };
    if (d.spec) { Object.assign(q, d.spec, { anim: d.anim }); delete q.view; }
    if (d.kind && R && R.info) {
      // 手绘羊的 h ≈ 身长；多利的 h ≈ 整团云羊的高度：按模型身体（C_Body）的包围盒换算
      const b = R.info.body || R.info.bb, h = o.h > 0 ? o.h : d.kind === 'dolly' ? 200 : 90;
      q.scale = d.kind === 'lamb' ? h / Math.max(20, b[2] - b[0]) : h / Math.max(20, b[3]);
      q.h = undefined;
      if (d.air) {
        const per = 0.9 / (o.speed > 0 ? o.speed : 1), ph = ((o.t || 0) / per) % 1;
        const a = o.air != null ? clamp(o.air) : Math.sin(Math.PI * (ph < 0 ? ph + 1 : ph));
        q.y = (o.y || 0) - a * h * 0.45;
        if (o.shadow) { q.shadowY = o.shadowY ?? o.y; q.shadowA = (o.shadowA ?? 0.26) * (1 - a * 0.5); }
      }
      if (o.fade) q.alpha = (o.alpha == null ? 1 : o.alpha) * (1 - clamp(o.fade));
      if (o.glow) { q.glow = o.glow; q.glowRgb = o.glowRgb || '255,160,210'; }
    }
    // 步频：Move 的播放速度让脚底不打滑（横向速度 = gaitCast，即手绘版同样参数下的步速）
    if (d.anim === 'Move' && R && R.info && R.info.gait) {
      const v = walkSpeed(who, o, d), s = scaleOf(R, o);
      q.speed = v / Math.max(1e-3, R.info.gait.speed * s);
    } else if (d.rate) q.speed = d.rate;
    else q.speed = 1;
    // jump：与角色库 LEGS.jump 同一条曲线（o.air 给定时用它，否则周期 0.9 / speed 的 sin 弧），离地 ≈ 0.15 身高；影子留在地上
    if (d.hop) {
      const sp = o.speed > 0 ? o.speed : 1, per = 0.9 / sp, ph = (((o.t || 0) / per) % 1 + 1) % 1;
      const a = o.air != null ? clamp(o.air) : Math.sin(Math.PI * ph);
      q.y = (o.y || 0) - a * (o.h > 0 ? o.h : 300) * 0.15;
      if (o.shadow) { q.shadowY = o.shadowY ?? o.y; q.shadowA = (o.shadowA ?? 0.26) * (1 - a * 0.5); }
    }
    // Sit：基建小人坐在椅子上（根骨骼在座面，小腿垂下）；手绘的 seat = 座面离脚底的高度，没给时脚踩地
    if (d.anim === 'Sit' && R && R.info) {
      // 座面比小腿还低时（矮凳 / 台阶）按“脚刚好踩地”放：宁可略高出座面几像素（被裙摆挡住），也不让腿穿进地面
      const s = scaleOf(R, o), drop = sitDrop(R) * s;
      const seat = o.seat != null ? Math.max(o.seat, drop) : drop;
      q.y = (o.y || 0) - seat;
    }
    // 换动作时交叉淡化（不硬切）：o.mixFrom = 上一个姿势（与 o 合并的选项，例如 { pose: 'walk', speed }），o.mixK = 0..1（1 = 全是现在的姿势）。
    // 两个姿势是同一个模型（同一视角）时才淡化，否则照旧硬切。t 的纯函数：影片按时间算 mixK（例如 sst(停下, 停下 + 0.25, t)）
    // 现在的姿势是 o.sd 指定的官方动画时，mixFrom 里要写 sd: undefined（否则上一个姿势也会被当成同一个指定动画）
    if (o.mixFrom && o.mixK != null && o.mixK < 0.999 && !d.kind) {
      const po = Object.assign({}, o, o.mixFrom);
      delete po.mixFrom; delete po.mixK;
      const d2 = decide0(who, po);
      if (d2.key === d.key && d2.anim && d2.anim !== q.anim) {
        const q2 = castOpts(who, po, d2, R), k = clamp(o.mixK);
        q.from = { anim: d2.anim, speed: q2.speed, t: q2.t, phase: q2.phase };
        q.to = { anim: q.anim, speed: q.speed, t: q.t, phase: q.phase };
        q.k = k;
        q.y = (q2.y || 0) + ((q.y || 0) - (q2.y || 0)) * k;
      }
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
  /**
   * 引擎每帧告诉我们当前镜头（'影片id:镜头id'，js/mv/engine.js 的 render()）。在某个镜头播放中途才加载好的模型，
   * 角色库这边要等镜头切换后才换上——同一个镜头里不会从手绘版突然跳成官方小人
   */
  let curShot = null;
  function frame(id) {
    if (FQ.length) fcWarmStep(opts.warmMs);
    if (id === curShot) return;
    curShot = id;
    for (const R of models.values()) if (R.gate != null && R.gate !== id) R.gate = null;
  }
  const usable = (R) => !!(R && R.ready && (R.gate == null || R.gate !== curShot));
  function drawCast(g, who, o) {
    try {
      const d = decide(who, o);
      if (!d.key) return false;
      const P = parse(d.key), R = P && models.get(P.id);
      if (!usable(R)) { want(P); return false; }
      const ok = draw(g, d.key, castOpts(who, o, d, R));
      if (API.audit && lastLog && lastLog.o === o) lastLog.drawn = ok;
      return ok;
    } catch (e) { return false; }
  }
  function anchorsCast(who, o) {
    try {
      const d = decide(who, o);
      if (!d.key) return null;
      const P = parse(d.key), R = P && models.get(P.id);
      if (!usable(R)) return null;
      const A = anchors(d.key, castOpts(who, o, d, R));
      if (A) A.feet = [o.x || 0, o.y || 0];
      return A;
    } catch (e) { return null; }
  }
  /**
   * 官方小人走 / 跑的横向速度（调用者像素 / 秒）= 手绘版同样参数下的步速（MVE.cast.gait，sd: false 取原生值）。
   * 这样影片按角色库算好的配速，不管这一帧是官方小人还是手绘版都对得上；Move 动画的播放速度由此反推。
   * 角色库不可用时按 CANON（身高 / 秒）× RUNK
   */
  function walkSpeed(who, o, d) {
    const C = E.cast;
    if (C && C.gait) {
      quiet++;
      try {
        const g0 = C.gait(who, Object.assign({}, o, { sd: false }));
        // 影片按距离锁定步相时 speed 可以很小（例如 dist / (g1 · 绝对 t)）：只要给了正数就照用，不退回 CANON
        if (g0 && g0.speed > 1e-6) return g0.speed;
      } catch (e) { /* 用估计值 */ } finally { quiet--; }
    }
    const h = o.h > 0 ? o.h : 300, k = o.speed > 0 ? o.speed : 1;
    return (CANON[who] || 0.5) * h * k * (d.run ? RUNK : 1);
  }
  function gaitCast(who, o) {
    try {
      const d = decide(who, o);
      if (!d.key || d.anim !== 'Move') return null;
      const P = parse(d.key), R = P && models.get(P.id);
      if (!usable(R) || !R.info || !R.info.gait) return null;
      const v = walkSpeed(who, o, d), s = scaleOf(R, o), rate = v / Math.max(1e-3, R.info.gait.speed * s);
      const period = R.info.gait.dur / (R.info.gait.cycles || 1) / Math.max(1e-3, rate);
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
        if (C.kind || txt.indexOf("'" + who + "'") < 0) continue; // 敌人（小羊 / 多利）是 opt-in，影片用 def.sd 声明
        const lines = txt.split('\n').filter((l) => l.indexOf("'" + who + "'") >= 0 || (who === 'adele-alter' && /adele\s*\(/.test(l)));
        let any = false;
        if (!C.any) for (const l of lines) {
          const m = /outfit:\s*'([\w-]+)'/.exec(l);
          if (m && C.models[m[1]]) { out.add(C.models[m[1]] + '/build'); any = true; }
        }
        if (!any || C.any || lines.some((l) => !/outfit:/.test(l))) out.add(C.models[C.outfit] + '/build');
      }
      return [...out].slice(0, 5);
    } catch (e) { return []; }
  }

  /* ---------------------------------------------------------------- 立绘卡片：官方剧情立绘（avg）做成“人物剪纸”
   * card(g, key, o) → boolean（没加载完时返回 false、什么也不画，第一次调用自动开始加载）
   *   key：'keller'（凯勒，10 种表情）| 'dolly'（多利，avg_npc_1014_1）| 'snowsant'（雪雉夏装，11 种）| 'lamb-black'（小黑羊）
   *        | 任意 'avg_npc_xxx_1' / 'avg_xxx_1'（有表情编号时按 '-{n}$1' 取）| 完整的图片地址
   *   o = {
   *     x, y      构图块底边中点（当前坐标系）；h：构图块的高度（或 w 宽度）
   *     crop      'full'（整个人，默认）| 'upper'（膝上）| 'bust'（胸像）| 'face' | [x, y, w, h]（1024 原图像素）
   *     expr      表情编号（1..n）或关键帧 [[t, n], …]（绝对秒，与 o.t 比较；换表情时交叉淡化 xfade 秒，默认 0.3）
   *     t         秒（呼吸、浮动、表情关键帧）；breath：呼吸幅度倍数（默认 1）；bob：上下浮动的像素（默认 0）
   *     flip, alpha, mode
   *     light     { color, amount }：调色（正片叠底）；sil：剪影色；rim：{ color, amount }：逆光时整体提亮一层（叠加）
   *     parallax  [dx, dy]：额外平移（影片按镜头算好的视差）
   *   }
   * card.load(key, expr | [exprs]) → Promise<boolean>；card.info(key) → { crops, n, ready }；card.url(key, expr, big)
   * 贴图按屏幕尺寸取 media.prts.wiki 的 webp 变体（512 或 1024），同一张图只下载一次；CORS 是 *。
   * [self-host] 先取本站副本 assets/official/avg/<名字>.w512.webp / <名字>.webp（card.url 仍返回 PRTS 地址，作缓存的 key）。
   * ---------------------------------------------------------------- */
  const CARD_ALIAS = {
    keller: { base: 'avg_npc_999_1', n: 10 }, dolly: { base: 'avg_npc_1014_1', n: 0 }, snowsant: { base: 'avg_npc_1005_1', n: 11 },
    'lamb-black': { base: 'avg_npc_1004_1', n: 0 }, adele: { base: 'avg_1016_agoat2_1', n: 11 }, caster: { base: 'avg_180_amgoat_1', n: 13 },
  };
  function cardSpec(key) {
    if (typeof key !== 'string') return null;
    if (/^https?:\/\//.test(key)) return { url: key, n: 0, base: key };
    const a = CARD_ALIAS[key];
    if (a) return a;
    if (/^avg_[\w]+$/i.test(key)) return { base: key, n: 99 };
    return null;
  }
  function md5(str) {
    const s = unescape(encodeURIComponent(str)), n = s.length;
    const W = new Array((((n + 8) >> 6) + 1) * 16).fill(0);
    for (let i = 0; i < n; i++) W[i >> 2] |= s.charCodeAt(i) << ((i % 4) * 8);
    W[n >> 2] |= 0x80 << ((n % 4) * 8);
    W[W.length - 2] = n * 8;
    const K = [], SH = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let o = 0; o < W.length; o += 16) {
      let A = a, B = b, C = c, D = d;
      for (let i = 0; i < 64; i++) {
        let f, k;
        if (i < 16) { f = (B & C) | (~B & D); k = i; } else if (i < 32) { f = (D & B) | (~D & C); k = (5 * i + 1) % 16; } else if (i < 48) { f = B ^ C ^ D; k = (3 * i + 5) % 16; } else { f = C ^ (B | ~D); k = (7 * i) % 16; }
        const x = (A + f + K[i] + (W[o + k] | 0)) | 0, r = SH[(i >> 4) * 4 + (i % 4)];
        A = D; D = C; C = B; B = (B + ((x << r) | (x >>> (32 - r)))) | 0;
      }
      a = (a + A) | 0; b = (b + B) | 0; c = (c + C) | 0; d = (d + D) | 0;
    }
    const hx = (v) => { let r = ''; for (let i = 0; i < 4; i++) r += ((v >> (i * 8)) & 255).toString(16).padStart(2, '0'); return r; };
    return hx(a) + hx(b) + hx(c) + hx(d);
  }
  /** PRTS 媒体文件地址：/<md5[0]>/<md5[0..1]>/<文件名>（文件名的 md5；空格换成 _） */
  function mediaUrl(file) { const f = file.replace(/ /g, '_'), h = md5(f); return 'https://media.prts.wiki/' + h[0] + '/' + h.slice(0, 2) + '/' + encodeURIComponent(f); }
  function cardUrl(key, expr, big) {
    const S = cardSpec(key);
    if (!S) return null;
    const q = big ? '?image_process=format,webp/quality,Q_90' : '?image_process=resize,w_512/format,webp/quality,Q_88';
    if (S.url) return S.url;
    const e = S.n > 0 ? Math.max(1, Math.min(S.n, Math.round(expr || 1))) : 0;
    return mediaUrl('Avg_' + S.base + (e ? '-' + e : '') + '$1.png') + q;
  }
  // [self-host] PRTS 立绘地址 → 本地副本：Avg_<名字>$1.png 的 512 宽变体 = avg/<名字>.w512.webp，原尺寸变体 = avg/<名字>.webp
  const cardLocal = (url) => {
    const m = OFFICIAL && /^https:\/\/media\.prts\.wiki\/[0-9a-f]\/[0-9a-f]{2}\/Avg_(avg_[\w-]+)%241\.png\?image_process=(resize,w_512\/)?format,webp/.exec(url);
    return m ? OFFICIAL + 'avg/' + m[1] + (m[2] ? '.w512' : '') + '.webp' : '';
  };
  const cardImgs = new Map(), cardMeta = new Map();
  function cardImg(url) {
    let r = cardImgs.get(url);
    if (r) return r;
    r = { img: null, ok: false, p: null, fails: 0, at: 0 };
    cardImgs.set(url, r);
    return r;
  }
  function cardLoad1(url) {
    const r = cardImg(url);
    if (r.ok) return Promise.resolve(true);
    if (r.p) return r.p;
    if (r.fails && now() < r.at) return Promise.resolve(false);
    const one = (src) => new Promise((res, rej) => {
      const im = new Image();
      im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer'; im.decoding = 'async';
      const to = setTimeout(() => { im.src = ''; rej(new Error('card timeout')); }, TIMEOUT);
      im.onload = () => { clearTimeout(to); res(im); };
      im.onerror = () => { clearTimeout(to); rej(new Error('card')); };
      im.src = src;
    });
    const remote = () => retry((i) => one(i ? url + (url.includes('?') ? '&' : '?') + 'r=' + i : url), 2);
    // [self-host] 先取本地副本（assets/official/avg/…webp），失败再走 PRTS
    const lu = cardLocal(url);
    r.p = (lu && !localMiss.has(lu) ? one(lu).catch(() => { localMiss.add(lu); return remote(); }) : remote()).then((im) => { r.img = im; r.ok = true; r.p = null; return true; }, () => { r.p = null; r.fails++; r.at = now() + 15000 * r.fails; return false; });
    return r.p;
  }
  /** 构图预设：按立绘的不透明区域算（每个 key 一次，用第一张加载好的图） */
  function cardCrops(key, im) {
    let m = cardMeta.get(key);
    if (m) return m;
    const c = E.mk(128, 128), q = c.getContext('2d', { willReadFrequently: true });
    q.drawImage(im, 0, 0, 128, 128);
    let x0 = 128, y0 = 128, x1 = -1, y1 = -1;
    try {
      const d = q.getImageData(0, 0, 128, 128).data;
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (d[(y * 128 + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    } catch (e) { /* 画布被污染（不该发生：CORS 是 *）：用整张 */ }
    if (x1 < x0) { x0 = 0; y0 = 0; x1 = 127; y1 = 127; }
    const k = 1024 / 128, X0 = x0 * k, Y0 = y0 * k, X1 = (x1 + 1) * k, Y1 = (y1 + 1) * k, H = Y1 - Y0, cx = (X0 + X1) / 2;
    const box = (hh, cy) => { const w = Math.min(1024, Math.max(X1 - X0, hh * 0.9)); return [cx - w / 2, cy, w, hh]; };
    m = { full: [X0, Y0, X1 - X0, H], upper: box(H * 0.62, Y0 - H * 0.02), bust: box(H * 0.36, Y0 - H * 0.02), face: box(H * 0.18, Y0 + H * 0.02) };
    cardMeta.set(key, m);
    return m;
  }
  let cardScratch = null;
  function card(g, key, o) {
    o = o || EMPTY;
    try {
      if (!g || !g.canvas || !cardSpec(key)) return false;
      const t = +o.t || 0;
      // 表情：关键帧 → 当前与上一个（交叉淡化）
      let e1 = 1, e0 = 0, k = 1;
      if (Array.isArray(o.expr)) {
        const K = o.expr.slice().sort((p, q) => p[0] - q[0]), xf = o.xfade ?? 0.3;
        let i = 0;
        while (i + 1 < K.length && K[i + 1][0] <= t) i++;
        e1 = K[i] ? K[i][1] : 1;
        if (i > 0 && t - K[i][0] < xf) { e0 = K[i - 1][1]; k = clamp((t - K[i][0]) / xf); }
      } else if (o.expr != null) e1 = o.expr;
      // 屏幕上的高度 → 取 512 还是 1024 的图
      const M = g.getTransform ? g.getTransform() : null, sy = M ? Math.hypot(M.c, M.d) : g.canvas.width / VW;
      const want1 = (o.h || 600) * sy > 600;
      const pick = (e) => {
        const uB = cardUrl(key, e, true), uS = cardUrl(key, e, false);
        const rB = cardImg(uB), rS = cardImg(uS);
        if (want1 && !rB.ok) cardLoad1(uB);
        if (!rS.ok && !(want1 && rB.ok)) cardLoad1(uS);
        return want1 && rB.ok ? rB.img : rS.ok ? rS.img : rB.ok ? rB.img : null;
      };
      const im1 = pick(e1), im0 = e0 && k < 1 ? pick(e0) : null;
      if (!im1) return false;
      const crops = cardCrops(key, im1);
      const cr = Array.isArray(o.crop) ? o.crop : crops[o.crop || 'full'] || crops.full;
      const sc = (o.h ? o.h / cr[3] : o.w ? o.w / cr[2] : 1);
      const breath = 1 + 0.0055 * (o.breath ?? 1) * Math.sin((t * Math.PI * 2) / 3.8);
      const bob = (o.bob || 0) * Math.sin((t * Math.PI * 2) / 3.1 + 0.7);
      const px = o.parallax ? +o.parallax[0] || 0 : 0, py = o.parallax ? +o.parallax[1] || 0 : 0;
      const alpha = o.alpha == null ? 1 : clamp(o.alpha);
      if (alpha <= 0.002) return true;
      const X = (+o.x || 0) + px, Y = (+o.y || 0) + py + bob;
      if (API.trace) { try { const m = g.getTransform(); API.trace({ src: 'card', key, cv: g.canvas, x: m.a * X + m.c * Y + m.e, y: m.b * X + m.d * Y + m.f, s: sc * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)), breath, e1, e0, k, big: !!(im1 && (im1.naturalWidth || 0) > 600), alpha }); } catch (e) { /* 调试用 */ } }
      const src = (im) => { const f = (im.naturalWidth || 1024) / 1024; return [cr[0] * f, cr[1] * f, cr[2] * f, cr[3] * f]; };
      const fx = o.flip ? -1 : 1;
      // 半身 / 胸像的下边缘柔和地淡出（不留一道硬切线）；fade: 0..0.5 构图高度的比例，0 = 不淡
      const fadeK = clamp(o.fade ?? (o.crop && o.crop !== 'full' ? 0.14 : 0), 0, 0.5);
      const tinted = o.light || o.sil || fadeK > 0;
      g.save();
      g.translate(X, Y);
      g.scale(fx * sc, sc * breath);
      if (o.mode) g.globalCompositeOperation = o.mode;
      const ga = g.globalAlpha;
      const put = (im, a) => {
        if (!im || a <= 0.002) return;
        const s = src(im);
        if (!tinted) { g.globalAlpha = ga * a; g.drawImage(im, s[0], s[1], s[2], s[3], -cr[2] / 2, -cr[3], cr[2], cr[3]); return; }
        // 调色 / 剪影：先画进离屏小画布（设备像素），再贴回
        const dw = Math.max(1, Math.min(2048, Math.ceil(cr[2] * sc * sy))), dh = Math.max(1, Math.min(2048, Math.ceil(cr[3] * sc * sy)));
        if (!cardScratch) cardScratch = E.mk(dw, dh);
        if (cardScratch.width < dw || cardScratch.height < dh) { cardScratch.width = Math.max(cardScratch.width, dw); cardScratch.height = Math.max(cardScratch.height, dh); }
        const q = cardScratch.getContext('2d');
        q.globalCompositeOperation = 'source-over'; q.globalAlpha = 1;
        q.clearRect(0, 0, dw, dh);
        q.drawImage(im, s[0], s[1], s[2], s[3], 0, 0, dw, dh);
        if (o.sil) { q.globalCompositeOperation = 'source-in'; q.fillStyle = o.sil; q.fillRect(0, 0, dw, dh); }
        if (o.light && !o.sil) {
          const L = o.light, amt = clamp(L.amount ?? 0.35);
          q.globalCompositeOperation = 'multiply'; q.globalAlpha = amt; q.fillStyle = L.color || '#ffd8b0'; q.fillRect(0, 0, dw, dh);
          q.globalCompositeOperation = 'destination-in'; q.globalAlpha = 1; q.drawImage(im, s[0], s[1], s[2], s[3], 0, 0, dw, dh);
        }
        if (fadeK > 0) {
          const fy = dh * (1 - fadeK), fg = q.createLinearGradient(0, fy, 0, dh);
          fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,1)');
          q.globalCompositeOperation = 'destination-out'; q.globalAlpha = 1; q.fillStyle = fg; q.fillRect(0, fy, dw, dh - fy);
        }
        q.globalCompositeOperation = 'source-over';
        g.globalAlpha = ga * a;
        g.drawImage(cardScratch, 0, 0, dw, dh, -cr[2] / 2, -cr[3], cr[2], cr[3]);
      };
      if (im0) { put(im0, alpha); put(im1, alpha * k); } else put(im1, alpha);
      if (o.rim) {
        const R0 = typeof o.rim === 'object' ? o.rim : { color: o.rim };
        g.globalCompositeOperation = 'lighter';
        E.glow(g, 0, -cr[3] * 0.55, cr[3] * 0.62, rgbStr(R0.color || '255,230,200'), (R0.amount ?? 0.25) * alpha, 'lighter', false);
      }
      g.globalAlpha = ga;
      g.restore();
      lastDraw = now();
      return true;
    } catch (e) { if (opts.debug) console.warn('[sd.card]', e); return false; }
  }
  card.load = (key, expr) => {
    try {
      const list = Array.isArray(expr) ? expr : [expr || 1];
      return Promise.all(list.map((e) => cardLoad1(cardUrl(key, e, false)))).then((a) => a.every(Boolean), () => false);
    } catch (e) { return Promise.resolve(false); }
  };
  card.url = cardUrl;
  card.info = (key) => { const S = cardSpec(key); return S ? { n: S.n, crops: cardMeta.get(key) || null, ready: cardImg(cardUrl(key, 1, false)).ok } : null; };
  card.md5 = md5;

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
      if (!P) fcClear();
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
    trace: null,
    credit: CREDIT,
    enabled: true,
    audit: false,
    log,
    opts,
    stats,
    aliases: ALIAS,
    cast: CAST,
    castOn,
    poses: POSE,
    posesEnemy: POSE_E,
    supported: () => initGL(),
    parse: (key) => { const p = parse(key); return p ? Object.assign({}, p) : null; },
    keys: () => Object.keys(ALIAS),
    load,
    // 播放中途才加载好的模型，在同一个镜头里仍报告“没好”（与角色库钩子的 usable() 一致）：影片按 ready() 决定画官方小人还是替代画面，
    // 这样一个镜头里不会从手绘突然跳成官方小人；下一个镜头起才换上
    ready: (key) => { const P = parse(key), R = P && models.get(P.id); return !!(R && R.ready && glLive() && R.gen === gen && usable(R)); },
    has: (key, anim) => { const P = parse(key), R = P && models.get(P.id); return !!(R && R.anims && R.anims.has(anim)); },
    draw,
    drawCached,
    // 帧缓存的统计（开发用）：命中 / 现生成 / 预热生成的帧数、占用像素、预热队列长度
    cacheStats: () => ({ hit: FST.hit, miss: FST.miss, warm: FST.warm, px: fcPx, n: FC.size, queue: FQ.length }),
    anchors,
    gait,
    crowd,
    card,
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
    frame,
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
