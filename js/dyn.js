/* =========================================================
 * 官方动态立绘（纯烬艾雅法拉）：游戏里的高清 Spine 立绘
 *  - 精英二 / 远行前的野餐 / 后来的故事，贴图约 2.3K，Spine 3.8.99
 *  - 资源经 GitHub 镜像 isHarryh/Ark-Models（jsDelivr）在线加载，单个约 6–9 MB
 *  - 贴图已预乘透明度；图集页名里带 “#”，因此用自定义贴图加载器绕开 URL 拼接
 * 本体艾雅法拉没有官方动态立绘
 * ========================================================= */
window.DYN = (() => {
  const COMMIT = '3745e5c6e10b5252b2a5e1f1841ebef62b7ef15b';
  // 优先 jsDelivr；个别文件会被它拒绝（403），此时退回 GitHub raw
  const HOSTS = [
    `https://cdn.jsdelivr.net/gh/isHarryh/Ark-Models@${COMMIT}/models_illust/`,
    `https://raw.githubusercontent.com/isHarryh/Ark-Models/${COMMIT}/models_illust/`,
  ];
  const MODELS = {
    e2: { name: '精英二', size: '5.9 MB', base: 'dyn_illust_1016_agoat2/dyn_illust_char_1016_agoat2', json: false },
    s34: { name: '远行前的野餐', size: '8.9 MB', base: 'dyn_illust_1016_agoat2_epoque%2334/dyn_illust_char_1016_agoat2_epoque%2334', json: true },
    s57: { name: '后来的故事', size: '6.9 MB', base: 'dyn_illust_1016_agoat2_epoque%2357/dyn_illust_char_1016_agoat2_epoque%2357', json: false },
  };
  const LABEL = { Start: '登场', Idle: '待机', Interact: '互动', Special: '特殊动作' };

  const retry = async (fn, times = 3) => {
    for (let i = 0; ; i++) {
      try { return await fn(i); } catch (e) { if (i >= times - 1) throw e; await new Promise((r) => setTimeout(r, 900 * (i + 1))); }
    }
  };
  const loadImage = (src) => retry(() => new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('texture'));
    im.src = src;
  }));
  const cache = {};
  // 每个文件先试 jsDelivr，失败后换 GitHub raw
  const anyHost = (path, get) => HOSTS.reduce((p, h) => p.catch(() => get(h + path)), Promise.reject(new Error('start')));
  function fetchModel(key) {
    if (!cache[key]) {
      const m = MODELS[key], path = m.base;
      const ok = (r) => { if (!r.ok) throw new Error(r.status); return r; };
      cache[key] = Promise.all([
        anyHost(m.json ? path : path + '.skel', (u) => fetch(u).then(ok).then((r) => (m.json ? r.text() : r.arrayBuffer()))),
        anyHost(path + '.atlas', (u) => fetch(u).then(ok).then((r) => r.text())),
        anyHost(path + '.png', (u) => loadImage(u)),
      ]);
      cache[key].catch(() => delete cache[key]);
    }
    return cache[key];
  }

  function create(host, opts = {}) {
    const canvas = document.createElement('canvas');
    canvas.className = 'dyn-canvas';
    host.appendChild(canvas);
    let ctx = null, gl = null, renderer = null, atlas = null;
    let skeleton = null, state = null, bounds = null, anims = [];
    let raf = 0, last = 0, visible = true, active = true, token = 0, autoT = 40, key = null;
    let par = [0, 0], parT = [0, 0];
    const api = { ready: false, onReady: null, onPoke: null, onAction: null };

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round(host.clientWidth * dpr)), h = Math.max(2, Math.round(host.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      if (gl) gl.viewport(0, 0, w, h);
    }
    function camera() {
      if (!renderer || !bounds) return;
      const W = canvas.width, H = canvas.height;
      const zoom = Math.max(bounds.w / W, bounds.h / H) * (opts.pad ?? 1.02);
      const cam = renderer.camera;
      cam.setViewport(W, H);
      // 鼠标带来极轻的镜头平移，增加一点纵深
      cam.position.x = bounds.x + bounds.w / 2 - par[0] * bounds.w * 0.006;
      cam.position.y = bounds.y + bounds.h / 2 + par[1] * bounds.h * 0.004;
      cam.zoom = zoom;
      cam.update();
    }

    async function load(k) {
      const my = ++token;
      key = k;
      api.ready = false;
      host.classList.add('loading');
      host.classList.remove('failed');
      try {
        await CHIBI.loadLib();
        if (!ctx) {
          ctx = new spine.webgl.ManagedWebGLRenderingContext(canvas, { alpha: true, premultipliedAlpha: true, antialias: false });
          gl = ctx.gl;
          renderer = new spine.webgl.SceneRenderer(canvas, ctx, true);
        }
        const [raw, atlasTxt, img] = await fetchModel(k);
        if (my !== token) return false;
        const isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
        // WebGL2 下为非 2 的幂贴图生成 mipmap，缩小显示时不闪烁；贴图已预乘，不再二次预乘
        const tex = new spine.webgl.GLTexture(ctx, img, isGL2);
        const nextAtlas = new spine.TextureAtlas(atlasTxt, () => tex);
        const loader = new spine.AtlasAttachmentLoader(nextAtlas);
        const data = MODELS[k].json ? new spine.SkeletonJson(loader).readSkeletonData(raw) : new spine.SkeletonBinary(loader).readSkeletonData(new Uint8Array(raw));
        skeleton = new spine.Skeleton(data);
        const sd = new spine.AnimationStateData(data);
        sd.defaultMix = 0.3;
        state = new spine.AnimationState(sd);
        anims = data.animations.map((a) => a.name);
        // 以待机第一帧测量整体范围（文件里记录的尺寸不可靠）
        const rest = anims.includes('Idle') ? 'Idle' : anims[0];
        state.setAnimation(0, rest, true);
        state.apply(skeleton);
        skeleton.updateWorldTransform();
        const off = new spine.Vector2(), sz = new spine.Vector2();
        skeleton.getBounds(off, sz, []);
        bounds = { x: off.x, y: off.y, w: sz.x, h: sz.y };
        if (anims.includes('Start') && opts.start !== false) {
          state.setAnimation(0, 'Start', false);
          state.addAnimation(0, rest, true, 0);
        }
        if (atlas) atlas.dispose();
        atlas = nextAtlas;
        size();
        camera();
        autoT = 30 + Math.random() * 20;
        api.ready = true;
        host.classList.remove('loading');
        start();
        if (api.onReady) api.onReady(actions());
        return true;
      } catch (e) {
        if (my !== token) return false;
        console.warn('[DYN]', e);
        host.classList.remove('loading');
        host.classList.add('failed');
        return false;
      }
    }

    const actions = () => ['Start', 'Interact', 'Special'].filter((n) => anims.includes(n)).map((n) => ({ id: n, label: LABEL[n] }));

    function play(name) {
      if (!state || !anims.includes(name)) return;
      state.setAnimation(0, name, false);
      state.addAnimation(0, 'Idle', true, 0);
      autoT = 35 + Math.random() * 20;
      if (api.onAction) api.onAction(name);
    }

    // 60 帧封顶：高刷显示器上不必跟着 144/165 Hz 重绘
    let lastFrame = 0;
    function frame(now) {
      raf = 0;
      if (!skeleton || !visible || !active || document.hidden) return;
      raf = requestAnimationFrame(frame);
      if (now - lastFrame < 1000 / 60 - 1.5) return;
      lastFrame = now;
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      // 偶尔自己来一段特殊动作
      if (opts.auto !== false) {
        autoT -= dt;
        const cur = state.getCurrent(0);
        if (autoT <= 0 && cur && cur.animation && cur.animation.name === 'Idle') play(anims.includes('Special') ? 'Special' : 'Interact');
      }
      par[0] += (parT[0] - par[0]) * 0.05;
      par[1] += (parT[1] - par[1]) * 0.05;
      camera();
      state.update(dt);
      state.apply(skeleton);
      skeleton.updateWorldTransform();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      renderer.begin();
      renderer.drawSkeleton(skeleton, true);
      renderer.end();
    }
    function start() {
      if (!raf && skeleton && visible && active) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }

    canvas.addEventListener('click', (e) => {
      if (!api.ready) return;
      play(anims.includes('Interact') ? 'Interact' : 'Special');
      if (api.onPoke) api.onPoke(e.clientX, e.clientY);
    });
    // 以最后一条记录为准（快速滚过时一次回调可能有多条）；看不见时直接取消已排上的一帧
    const io = new IntersectionObserver((ens) => {
      visible = ens[ens.length - 1].isIntersecting;
      if (visible) start(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    });
    io.observe(host);
    const ro = new ResizeObserver(() => { if (gl) { size(); camera(); } });
    ro.observe(host);
    const onVis = () => { if (!document.hidden) start(); };
    document.addEventListener('visibilitychange', onVis);

    // 用属性描述符合并：Object.assign 会立刻调用 getter，把 key 冻结成创建时的值
    return Object.defineProperties(api, Object.getOwnPropertyDescriptors({
      load,
      play,
      actions,
      get key() { return key; },
      setActive(on) { active = on; if (on) start(); },
      pointer(x, y) {
        const r = host.getBoundingClientRect();
        if (!r.width) return;
        parT = [Math.max(-1, Math.min(1, (x - r.left - r.width / 2) / (innerWidth / 2))), Math.max(-1, Math.min(1, (y - r.top - r.height / 2) / (innerHeight / 2)))];
      },
      destroy() {
        token++;
        if (raf) cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        if (atlas) atlas.dispose();
        if (gl) { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); }
        canvas.remove();
      },
    }));
  }

  return { create, MODELS };
})();
