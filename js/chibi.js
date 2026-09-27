/* =========================================================
 * 小剧场：游戏内 Spine 小人（官方骨骼动画；本站 assets/official/ 自带副本，本地没有时在线加载 PRTS 资源站）
 *  - 作战模型：登场 / 待机 / 攻击 / 技能
 *  - 基建模型：放松 / 走动 / 坐下 / 睡觉 / 互动
 *  - 「自由活动」：她会自己走来走去、坐下、打盹、和你互动
 * 运行时：spine-ts 3.8（jsDelivr），模型版本 3.8.99
 * ========================================================= */
window.CHIBI = (() => {
  const LIB = 'https://cdn.jsdelivr.net/gh/EsotericSoftware/spine-runtimes@3.8/spine-ts/build/spine-webgl.js';
  const ROOT = 'https://torappu.prts.wiki/assets/char_spine/';
  // [self-host] 本站自带官方模型（assets/official/spine/ 镜像 torappu.prts.wiki/assets/ 的目录结构，与 js/mv/sd.js 共用同一批文件）。
  // 本地优先：地址按本脚本自己的位置解析（js/chibi.js → ../assets/official/）；本地没有（404 / 出错）时静默退回 PRTS 原地址
  const TORAPPU = 'https://torappu.prts.wiki/assets/';
  const OFFICIAL = (() => {
    try {
      const me = document.currentScript || [...document.scripts].find((s) => /\/js\/chibi\.js(?:[?#]|$)/.test(s.src));
      return (me && me.src ? new URL('../assets/official/', me.src) : new URL('assets/official/', location.href)).href;
    } catch (e) { return ''; }
  })();
  const localMiss = new Set();
  const localOf = (url) => (OFFICIAL && url.startsWith(TORAPPU) ? OFFICIAL + 'spine/' + url.slice(TORAPPU.length).split('?')[0] : '');
  // [/self-host]
  let libP = null;
  // 运行库也用本站自带的副本（assets/vendor/），加载失败再退回 jsDelivr
  const LIB_LOCAL = OFFICIAL ? OFFICIAL.replace(/official\/$/, 'vendor/spine-webgl-3.8.js') : '';
  function loadLib() {
    if (window.spine) return Promise.resolve();
    if (!libP) {
      const one = (src) => new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        const to = setTimeout(() => { s.remove(); rej(new Error('spine runtime timeout')); }, 25000);
        s.onload = () => { clearTimeout(to); res(); };
        s.onerror = () => { clearTimeout(to); s.remove(); rej(new Error('spine runtime')); };
        document.head.appendChild(s);
      });
      libP = (LIB_LOCAL ? one(LIB_LOCAL).catch(() => one(LIB)) : one(LIB)).catch((e) => { libP = null; throw e; });
    }
    return libP;
  }
  const metaCache = {};
  function meta(char) {
    if (!metaCache[char]) {
      metaCache[char] = retry(() => fetchT(ROOT + char + '/meta.json').then((r) => { if (!r.ok) throw new Error('meta'); return r.json(); }));
      metaCache[char].catch(() => delete metaCache[char]);
    }
    return metaCache[char];
  }
  // PRTS 资源站偶尔断连：失败后稍等重试
  const retry = async (fn, times = 3) => {
    for (let i = 0; ; i++) {
      try { return await fn(i); } catch (e) { if (i >= times - 1) throw e; await new Promise((r) => setTimeout(r, 800 * (i + 1))); }
    }
  };
  // 资源站偶尔整条连接挂住（既不成功也不报错）：给每次请求设个上限，超时就当失败，交给 retry 重试
  const TIMEOUT = 15000;
  const fetchT0 = (url) => fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT) : undefined });
  // [self-host] 先取本地副本，不成（404 / 出错）再走原地址
  const fetchT = async (url) => {
    const lu = localOf(url);
    if (lu && !localMiss.has(lu)) {
      try { const r = await fetchT0(lu); if (r.ok) return r; } catch (e) { /* 退回 PRTS */ }
      localMiss.add(lu);
    }
    return fetchT0(url);
  };
  const img1 = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    const to = setTimeout(() => { im.src = ''; rej(new Error('texture timeout')); }, TIMEOUT);
    im.onload = () => { clearTimeout(to); res(im); };
    im.onerror = () => { clearTimeout(to); rej(new Error('texture')); };
    im.src = src;
  });
  const loadRemote = (src) => retry((i) => img1(i ? `${src}?r=${i}` : src));
  const loadImage = (src) => {
    const lu = localOf(src);
    return lu && !localMiss.has(lu) ? img1(lu).catch(() => { localMiss.add(lu); return loadRemote(src); }) : loadRemote(src);
  };
  // [/self-host]
  const getBin = (url) => retry(() => fetchT(url).then((r) => { if (!r.ok) throw new Error('skel'); return r.arrayBuffer(); }));
  const getText = (url) => retry(() => fetchT(url).then((r) => { if (!r.ok) throw new Error('atlas'); return r.text(); }));

  const LABEL = {
    Start: '登场', Idle: '待机', Attack: '攻击', Relax: '放松', Move: '走动', Sit: '坐下', Sleep: '睡觉', Interact: '互动',
  };
  const SKILL_LABEL = { base: ['火山'], alter: ['无声润物', '云霭荫佑', '火山回响'] };

  /** 根据模型中实际存在的动画生成可用动作 */
  function buildActions(names, group, form) {
    const has = (n) => names.includes(n);
    const acts = [];
    if (group === 'build') {
      ['Relax', 'Move', 'Sit', 'Sleep', 'Interact'].forEach((n) => {
        if (!has(n)) return;
        if (n === 'Interact') acts.push({ id: n, label: LABEL[n], seq: [n], then: 'Relax' });
        else if (n === 'Move') acts.push({ id: n, label: LABEL[n], walk: true });
        else acts.push({ id: n, label: LABEL[n], loop: n });
      });
      return acts;
    }
    if (has('Start')) acts.push({ id: 'Start', label: LABEL.Start, seq: ['Start'], then: 'Idle' });
    if (has('Idle')) acts.push({ id: 'Idle', label: LABEL.Idle, loop: 'Idle' });
    if (has('Attack')) acts.push({ id: 'Attack', label: LABEL.Attack, seq: ['Attack', 'Attack', 'Attack'], then: 'Idle' });
    const sk = SKILL_LABEL[form] || [];
    if (has('Skill_Start') && has('Skill_Loop')) {
      acts.push({ id: 'Skill', label: sk[0] || '技能', seq: ['Skill_Start', 'Skill_Loop', 'Skill_Loop', 'Skill_Loop', 'Skill_Loop', ...(has('Skill_End') ? ['Skill_End'] : [])], then: 'Idle', skill: 'volcano' });
    }
    if (has('Skill_1_Begin') && has('Skill_1_Loop')) acts.push({ id: 'Skill1', label: sk[0] || '技能一', seq: ['Skill_1_Begin', 'Skill_1_Loop', 'Skill_1_Loop', 'Skill_1_Loop'], then: 'Idle', skill: 'rain' });
    if (has('Skill_2')) acts.push({ id: 'Skill2', label: sk[1] || '技能二', seq: ['Skill_2'], then: 'Idle', skill: 'shield' });
    if (has('Skill_3_Begin') && has('Skill_3_Loop')) acts.push({ id: 'Skill3', label: sk[2] || '技能三', seq: ['Skill_3_Begin', 'Skill_3_Loop', 'Skill_3_Loop', ...(has('Skill_3_End') ? ['Skill_3_End'] : [])], then: 'Idle', skill: 'echo' });
    return acts;
  }

  /**
   * 共享的离屏 WebGL 上下文：桌宠可以同时放出好几只，每只都开一个 WebGL 上下文太贵，
   * 而且浏览器同时只保留十几个上下文（再多就会把旧的挤掉）。这里所有桌宠共用一个，
   * 各自画完一帧就 transferToImageBitmap 交给自己的 bitmaprenderer 画布显示（零拷贝）。
   */
  let sharedGL = null;
  function shared() {
    if (!sharedGL) {
      const oc = new OffscreenCanvas(2, 2);
      const g = oc.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
      if (!g) return null;
      const ctx = new spine.webgl.ManagedWebGLRenderingContext(g);
      sharedGL = { oc, gl: g, ctx, renderer: new spine.webgl.SceneRenderer(oc, ctx, true) };
    }
    return sharedGL;
  }
  const canShare = typeof OffscreenCanvas !== 'undefined' && typeof ImageBitmapRenderingContext !== 'undefined';

  /**
   * 桌宠共用一个 rAF 循环（而不是每只一个）：每帧先跑所有桌宠的行为逻辑与位移（60 帧，transform 由合成器处理），
   * 骨骼动画与绘制按各自的帧率（默认 30、打盹 15）错开进行——六只同时放出来时，每帧只有一半在画。
   */
  const petSet = new Set();
  let petRaf = 0, petLast = 0;
  function petLoop(now) {
    petRaf = 0;
    if (document.hidden || !petSet.size) return;
    petRaf = requestAnimationFrame(petLoop);
    if (now - petLast < 1000 / 60 - 1.5) return;
    petLast = now;
    for (const p of petSet) p(now);
  }
  function petWake() { if (!petRaf && petSet.size && !document.hidden) petRaf = requestAnimationFrame(petLoop); }
  document.addEventListener('visibilitychange', petWake);
  let petSeq = 0;

  function create(stage, opts = {}) {
    const canvas = document.createElement('canvas');
    canvas.className = 'chibi-canvas';
    stage.appendChild(canvas);
    const shadow = document.createElement('div');
    shadow.className = 'chibi-shadow';
    stage.appendChild(shadow);
    // 剧场模式：画布不接收指针（让背景道具可以点），另放一个跟着身体走的点击区
    const hit = opts.theater ? document.createElement('div') : null;
    if (hit) { hit.className = 'chibi-hit'; hit.setAttribute('aria-hidden', 'true'); stage.appendChild(hit); }

    let ctx, gl, renderer, skeleton = null, state = null, data = null, bounds = null, atlasObj = null;
    // opts.shared：用共享的离屏上下文（桌宠）；bmp 为本画布的 bitmaprenderer
    let useShared = !!opts.shared && canShare, bmp = null;
    let zoom = 1, camY = 0, visW = 1, visH = 1, dpr = 1;
    let raf = 0, last = 0, visible = true, token = 0;
    let form = 'base', group = 'build', actions = [], auto = true, cur = null;
    let walk = null, autoT = 0, autoStep = 0;
    // pet 模式：位置、朝向、动作全部交给 pet.js（这里只负责渲染；每帧回调 onTick）
    const pet = !!opts.pet;
    const GROUND = opts.ground ?? (pet ? 0.05 : 0.16), FILL = opts.fill ?? (pet ? 0.84 : 0.64);
    const WALK = opts.walkRange ?? 1;
    const api = { ready: false, actions: () => actions, onAction: null, onPoke: null, onSkill: null, onTick: null, onPose: null, onAuto: null };

    function sizeCanvas() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      stageW = stage.clientWidth || 1;
      stageH = stage.clientHeight || 1;
      lastSh = '';
      const w = Math.max(2, Math.round(stageW * dpr)), h = Math.max(2, Math.round(stageH * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      if (gl && !useShared) gl.viewport(0, 0, w, h);
      fit();
    }
    /** 把本实例的镜头设到（可能共享的）渲染器上 */
    function applyCam() {
      const cam = renderer.camera;
      cam.setViewport(canvas.width, canvas.height);
      cam.position.x = 0;
      cam.position.y = camY;
      cam.zoom = zoom;
      cam.update();
    }
    // 让角色高度约占舞台的 64%，脚底落在距底部 16% 的地面线上
    function fit() {
      if (!renderer || !bounds) return;
      const H = canvas.height, W = canvas.width;
      // 同时满足高度与宽度（作战模型带着法杖，横向更宽）
      zoom = Math.max(bounds.h / (H * FILL), bounds.w / (W * (pet ? 0.95 : 0.82)));
      visW = W * zoom;
      visH = H * zoom;
      camY = visH * (0.5 - GROUND);
      if (!useShared) applyCam(); // 共享渲染器每帧画之前再设
    }
    const halfRange = () => Math.max(0, visW / 2 - bounds.w * 0.55) * WALK;

    let skin = null;
    async function load(f, skinName, grp) {
      const my = ++token;
      form = f; group = grp; skin = skinName;
      api.ready = false;
      stage.classList.add('loading');
      stage.classList.remove('failed');
      try {
        await loadLib();
        if (!ctx) {
          const S = useShared ? shared() : null;
          if (S) {
            ({ ctx, gl, renderer } = S);
            bmp = canvas.getContext('bitmaprenderer');
          } else {
            useShared = false;
            ctx = new spine.webgl.ManagedWebGLRenderingContext(canvas, { alpha: true, premultipliedAlpha: false, antialias: false });
            gl = ctx.gl;
            renderer = new spine.webgl.SceneRenderer(canvas, ctx, true);
          }
        }
        const char = opts.chars[f];
        const m = await meta(char);
        const skins = m.skin || {};
        const sk = skins[skinName] || skins['默认'] || Object.values(skins)[0];
        const entry = sk[grp === 'build' ? '基建' : '正面'] || Object.values(sk)[0];
        const base = m.prefix + entry.file;
        const [bin, atlasTxt] = await Promise.all([getBin(base + '.skel'), getText(base + '.atlas')]);
        // 解析图集页及其声明尺寸
        const lines = atlasTxt.split(/\r?\n/);
        const pages = [];
        lines.forEach((l, i) => {
          const name = l.trim();
          if (name && /\.png$/i.test(name) && (i === 0 || !lines[i - 1].trim())) {
            const sz = (lines[i + 1] || '').match(/size:\s*(\d+)\s*,\s*(\d+)/);
            pages.push({ name, w: sz ? +sz[1] : 0, h: sz ? +sz[2] : 0 });
          }
        });
        const dir = base.slice(0, base.lastIndexOf('/') + 1);
        const imgs = {};
        await Promise.all(pages.map(async (p) => {
          const im = await loadImage(dir + p.name);
          // 资源站提供的贴图可能被缩小过，而 spine-ts 3.8 按贴图实际尺寸归一化 UV，
          // 所以先放大回图集声明的尺寸，否则部件会错位
          if (p.w && p.h && (im.naturalWidth !== p.w || im.naturalHeight !== p.h)) {
            const c = document.createElement('canvas');
            c.width = p.w;
            c.height = p.h;
            const g = c.getContext('2d');
            g.imageSmoothingQuality = 'high';
            g.drawImage(im, 0, 0, p.w, p.h);
            imgs[p.name] = c;
          } else imgs[p.name] = im;
        }));
        if (my !== token) return false;
        const atlas = new spine.TextureAtlas(atlasTxt, (path) => new spine.webgl.GLTexture(ctx, imgs[path] || Object.values(imgs)[0]));
        const sb = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas));
        data = sb.readSkeletonData(new Uint8Array(bin));
        skeleton = new spine.Skeleton(data);
        // 换模型：旧贴图在新骨架接手的同一刻释放（共享上下文里不释放会越积越多）
        if (atlasObj) atlasObj.dispose();
        atlasObj = atlas;
        const sd = new spine.AnimationStateData(data);
        sd.defaultMix = 0.18;
        state = new spine.AnimationState(sd);
        const names = data.animations.map((a) => a.name);
        actions = buildActions(names, grp, f);
        // 以待机姿态测量尺寸
        const rest = grp === 'build' ? 'Relax' : 'Idle';
        const probe = names.includes(rest) ? rest : names[0];
        state.setAnimation(0, probe, true);
        state.apply(skeleton);
        skeleton.updateWorldTransform();
        const off = new spine.Vector2(), size = new spine.Vector2();
        skeleton.getBounds(off, size, []);
        bounds = { x: off.x, y: off.y, w: Math.max(40, size.x), h: Math.max(60, size.y) };
        // 让模型包围盒居中（部分模型的根骨骼不在身体中心）
        skeleton.x = pet ? 0 : -(bounds.x + bounds.w / 2) * 0.6;
        skeleton.y = 0;
        sizeCanvas();
        walk = null;
        autoT = 0.8;
        autoStep = 0;
        if (pet) state.setAnimation(0, probe, true);
        else play(actions.find((a) => a.id === (grp === 'build' ? 'Relax' : 'Start')) || actions[0]);
        api.ready = true;
        stage.classList.remove('loading');
        start();
        if (api.onReady) api.onReady(actions);
        return true;
      } catch (e) {
        if (my !== token) return false;
        console.warn('[CHIBI]', e);
        stage.classList.remove('loading');
        stage.classList.add('failed');
        return false;
      }
    }

    function play(act, fromAuto = false) {
      if (!act || !state) return;
      if (!fromAuto) autoT = 6 + Math.random() * 3;
      cur = act;
      walk = null;
      if (act.walk) {
        const lim = halfRange();
        let tx = (Math.random() * 2 - 1) * lim;
        if (Math.abs(tx - skeleton.x) < lim * 0.4) tx = skeleton.x > 0 ? -lim * (0.4 + Math.random() * 0.6) : lim * (0.4 + Math.random() * 0.6);
        walk = { tx, speed: bounds.w * 0.9 };
        skeleton.scaleX = tx < skeleton.x ? -1 : 1;
        state.setAnimation(0, 'Move', true);
      } else if (act.loop) {
        state.setAnimation(0, act.loop, true);
      } else if (act.seq) {
        state.setAnimation(0, act.seq[0], false);
        for (let i = 1; i < act.seq.length; i++) state.addAnimation(0, act.seq[i], false, 0);
        if (act.then) state.addAnimation(0, act.then, true, 0);
        if (act.skill && api.onSkill) api.onSkill(act.skill);
      }
      if (api.onAction) api.onAction(act);
    }

    // 自由活动的日程
    const BUILD_PLAN = ['Relax', 'Move', 'Sit', 'Move', 'Interact', 'Relax', 'Move', 'Sleep', 'Move'];
    const FRONT_PLAN = ['Idle', 'Attack', 'Idle', 'Skill', 'Idle', 'Attack', 'Skill1', 'Idle', 'Skill2', 'Idle', 'Skill3'];
    function tickAuto(dt) {
      if (!auto || walk) return;
      autoT -= dt;
      if (autoT > 0) return;
      // 剧场可以接管一次：走去摆弄某个道具
      if (api.onAuto && api.onAuto()) { if (autoT <= 0) autoT = 6; return; }
      const plan = group === 'build' ? BUILD_PLAN : FRONT_PLAN;
      let act = null;
      for (let i = 0; i < plan.length && !act; i++) {
        const id = plan[autoStep % plan.length];
        autoStep++;
        act = actions.find((a) => a.id === id);
      }
      if (!act) return;
      play(act, true);
      const secs = { Sleep: 9, Sit: 7, Relax: 4, Idle: 3.5, Interact: 3.5, Attack: 4.5 };
      autoT = act.seq && !act.loop ? (secs[act.id] || 7) : (secs[act.id] || 5) + Math.random() * 2;
    }

    // 60 帧封顶：高刷显示器上不必跟着 144/165 Hz 重绘
    let lastFrame = 0;
    // 桌宠的骨骼绘制帧率（位移仍是 60 帧）；acc：距上次绘制累积的时间。按创建顺序错开半帧，六只不会挤在同一帧里画
    let fps = pet ? 30 : 60, acc = pet ? (petSeq++ % 2) / 60 : 0;
    function frame(now) {
      raf = 0;
      if (!skeleton || !visible || document.hidden) return;
      raf = requestAnimationFrame(frame);
      if (now - lastFrame < 1000 / 60 - 1.5) return;
      lastFrame = now;
      step(now);
    }
    function step(now) {
      if (!skeleton) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      if (walk) {
        const x0 = skeleton.x;
        const d = walk.tx - x0;
        const st = walk.speed * dt;
        if (Math.abs(d) <= st) {
          skeleton.x = walk.tx;
          const then = walk.then;
          walk = null;
          state.setAnimation(0, group === 'build' ? 'Relax' : 'Idle', true);
          autoT = 1.5 + Math.random() * 2;
          if (then) then();
        } else skeleton.x = x0 + Math.sign(d) * st;
      }
      if (pet) { if (api.onTick) api.onTick(dt); } else tickAuto(dt);
      acc += dt;
      if (acc < 1 / fps - 0.004) return;
      draw(Math.min(0.1, acc));
      acc = 0;
    }
    function draw(dt) {
      state.update(dt);
      state.apply(skeleton);
      // 程序化姿势（桌宠挥手等）叠加在动画之上
      if (api.onPose) api.onPose(skeleton, dt);
      skeleton.updateWorldTransform();
      if (useShared) {
        // 共享画布先调到本实例的尺寸（桌宠尺寸都一样，通常不必改），画完整帧交给自己的画布
        const S = sharedGL;
        if (S.oc.width !== canvas.width || S.oc.height !== canvas.height) { S.oc.width = canvas.width; S.oc.height = canvas.height; }
        gl.viewport(0, 0, canvas.width, canvas.height);
        applyCam();
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      renderer.begin();
      renderer.drawSkeleton(skeleton, opts.pma ?? true);
      renderer.end();
      if (useShared) bmp.transferFromImageBitmap(sharedGL.oc.transferToImageBitmap());
      // 地面阴影跟随（pet 模式下画布整体移动，阴影固定在画布中央）；位置没变就不写样式
      const cx = pet ? stageW / 2 : (skeleton.x / zoom) / dpr + stageW / 2;
      const bw = bounds.w / zoom / dpr;
      const sh = `translate(${cx.toFixed(1)}px, 0) translateX(-50%) scaleX(${(bw / 100).toFixed(3)})`;
      if (sh !== lastSh) {
        shadow.style.transform = sh;
        lastSh = sh;
        // 剧场：身体的点击区跟着她走（画布本身不接收指针，背景里的道具才点得到）
        if (hit) {
          const w = bw * 0.62, h = ((bounds.y + bounds.h) / zoom / dpr) * 0.96;
          hit.style.cssText = `width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;transform:translate3d(${(cx - w / 2).toFixed(1)}px,${(-stageH * GROUND).toFixed(1)}px,0)`;
        }
      }
    }
    let lastSh = '', stageW = 1, stageH = 1;
    function start() {
      if (!skeleton || !visible) return;
      if (pet) { if (!petSet.has(tickPet)) { last = performance.now(); petSet.add(tickPet); } petWake(); return; }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }
    const tickPet = (now) => step(now);

    // 点击小人：互动 / 攻击，并把事件交给页面（播放语音等）
    if (hit) hit.addEventListener('click', (e) => {
      if (!skeleton || !api.ready) return;
      const act = actions.find((a) => a.id === (group === 'build' ? 'Interact' : 'Attack'));
      if (act) play(act);
      if (api.onPoke) api.onPoke(e.clientX, e.clientY);
    });
    canvas.addEventListener('click', (e) => {
      if (pet || hit || !skeleton || !api.ready) return;
      const r = canvas.getBoundingClientRect();
      const cx = r.width / 2 + (pet ? 0 : (skeleton.x / zoom) / dpr);
      const halfW = (bounds.w / zoom / dpr) * 0.6;
      const groundY = r.height * (1 - GROUND);
      const topY = groundY - (bounds.h / zoom / dpr);
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (Math.abs(x - cx) > halfW || y < topY - 10 || y > groundY + 12) return;
      const act = actions.find((a) => a.id === (group === 'build' ? 'Interact' : 'Attack'));
      if (act) play(act);
      if (api.onPoke) api.onPoke(e.clientX, e.clientY);
    });

    // 桌宠始终在屏幕上（探头时会整个藏到屏幕外，但逻辑得继续跑，不能因为看不见就停）
    const io = new IntersectionObserver(([en]) => { visible = pet || en.isIntersecting; if (visible) start(); });
    io.observe(stage);
    const ro = new ResizeObserver(() => { if (ctx) sizeCanvas(); });
    ro.observe(stage);
    const onVis = () => { if (!document.hidden) start(); };
    document.addEventListener('visibilitychange', onVis);

    // 用属性描述符合并：Object.assign 会在合并时就调用 getter，把 loaded / facing / info 冻结成当时的值
    return Object.defineProperties(api, Object.getOwnPropertyDescriptors({
      load,
      /** 把画布移到新的舞台元素里（区块重绘时复用 WebGL 上下文与已加载的模型） */
      attach(el) {
        if (!el || el === stage) return;
        io.unobserve(stage); ro.unobserve(stage);
        stage = el;
        stage.append(canvas, shadow);
        if (hit) stage.append(hit);
        stage.classList.toggle('loading', !api.ready && token > 0 && !stage.classList.contains('failed'));
        io.observe(stage); ro.observe(stage);
        if (ctx) sizeCanvas();
        start();
      },
      /** 当前（或正在）加载的形态 / 时装 / 场景 */
      get loaded() { return { form, skin, group }; },
      destroy() {
        token++;
        if (raf) cancelAnimationFrame(raf);
        petSet.delete(tickPet);
        skeleton = null;
        if (hit) hit.remove();
        io.disconnect();
        ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        if (useShared) { if (atlasObj) atlasObj.dispose(); atlasObj = null; } // 共享上下文不能丢，只释放自己的贴图
        else if (gl) { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); }
        canvas.remove();
        shadow.remove();
      },
      play: (id) => play(actions.find((a) => a.id === id)),
      /* ---- pet 模式用的底层控制 ---- */
      has: (name) => !!(data && data.findAnimation(name)),
      /** 直接切换动画；then：播完后接着循环的动画 */
      anim(name, loop = true, then) {
        if (!state || !data || !data.findAnimation(name)) return false;
        const cur = state.getCurrent(0);
        if (loop && !then && cur && cur.animation.name === name && cur.loop) return true;
        state.setAnimation(0, name, loop);
        if (then && data.findAnimation(then)) state.addAnimation(0, then, true, 0);
        return true;
      },
      face(dir) { if (skeleton) skeleton.scaleX = dir < 0 ? -1 : 1; },
      get facing() { return skeleton ? skeleton.scaleX : 1; },
      /** 模型里实际有的动画（名称、时长）与骨骼（名称、父骨骼、长度、初始角度） */
      get info() {
        return data ? {
          anims: data.animations.map((a) => [a.name, +a.duration.toFixed(2)]),
          bones: data.bones.map((b) => [b.name, b.parent ? b.parent.name : '', Math.round(b.length), Math.round(b.rotation)]),
        } : null;
      },
      speed(k) { if (state) state.timeScale = k; },
      /** 身体包围盒（舞台坐标、CSS 像素，已按朝向镜像）与脚底位置 */
      body() {
        if (!bounds || !zoom || !canvas.width) return null;
        const k = 1 / zoom / dpr, cw = canvas.width / dpr, ch = canvas.height / dpr;
        const l = skeleton && skeleton.scaleX < 0 ? -(bounds.x + bounds.w) : bounds.x;
        return { x: cw / 2 + l * k, w: bounds.w * k, h: (bounds.y + bounds.h) * k, feetX: cw / 2, feetY: ch * (1 - GROUND), stageW: cw, stageH: ch };
      },
      setAuto(on) { auto = on; if (on) autoT = 0.5; },
      get auto() { return auto; },
      /* ---- 剧场用：走到道具旁边、转身、判断是否闲着 ---- */
      /** 走到舞台上某个横坐标（CSS 像素，相对舞台左边），到了回调 then；没有走动动画（作战模型）或已经很近就只转身 */
      goTo(x, then) {
        if (!skeleton || !bounds || !state) return false;
        const lim = halfRange();
        const tx = Math.max(-lim, Math.min(lim, (x - stageW / 2) * zoom * dpr));
        if (!(data && data.findAnimation('Move')) || Math.abs(tx - skeleton.x) < bounds.w * 0.15) {
          if (Math.abs(x - api.x) > 4) skeleton.scaleX = x < api.x ? -1 : 1;
          walk = null;
          if (then) then();
          return true;
        }
        walk = { tx, speed: bounds.w * 0.95, then };
        skeleton.scaleX = tx < skeleton.x ? -1 : 1;
        state.setAnimation(0, 'Move', true);
        autoT = 99; // 走到之前不让自由活动插进来（到达时会重设）
        return true;
      },
      faceTo(x) { if (skeleton && Math.abs(x - api.x) > 4) skeleton.scaleX = x < api.x ? -1 : 1; },
      /** 脚底在舞台上的横坐标（CSS 像素） */
      get x() { return skeleton && bounds ? stageW / 2 + skeleton.x / zoom / dpr : stageW / 2; },
      get walking() { return !!walk; },
      /** 正在循环播放放松 / 待机 / 坐下这类动作（可以被打断、可以转头看东西） */
      get idle() { const t = state && state.getCurrent(0); return !walk && !!t && t.loop && /^(Relax|Idle|Sit)$/.test(t.animation.name); },
      /** 让自由活动至少再等 sec 秒 */
      hold(sec) { autoT = Math.max(autoT, sec); },
      /** 骨骼绘制帧率（桌宠用；位移不受影响） */
      setFps(v) { fps = v; },
      get current() { return cur; },
    }));
  }

  /**
   * 预取某个模型的骨骼、图集与贴图（只是让浏览器缓存起来）：剧场里鼠标移到时装 / 场景按钮上时调用，
   * 真点下去的时候幕布一合一开，模型基本已经在本地了
   */
  const pre = new Set();
  function prefetch(char, skinName, grp) {
    const key = `${char}|${skinName}|${grp}`;
    if (pre.has(key)) return;
    pre.add(key);
    meta(char).then((m) => {
      const skins = m.skin || {};
      const sk = skins[skinName] || skins['默认'] || Object.values(skins)[0];
      const entry = sk[grp === 'build' ? '基建' : '正面'] || Object.values(sk)[0];
      const base = m.prefix + entry.file, dir = base.slice(0, base.lastIndexOf('/') + 1);
      return Promise.all([getBin(base + '.skel'), getText(base + '.atlas')]).then(([, txt]) => {
        const lines = txt.split(/\r?\n/);
        lines.forEach((l, i) => {
          const name = l.trim();
          if (name && /\.png$/i.test(name) && (i === 0 || !lines[i - 1].trim())) { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = (localMiss.has(localOf(dir + name)) ? '' : localOf(dir + name)) || dir + name; /* [self-host] */ }
        });
      });
    }).catch(() => pre.delete(key));
  }

  return { create, loadLib, prefetch };
})();
