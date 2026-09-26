/* =========================================================
 * 3D 人偶 · 舞台控制器
 * DOLL.create(host, opts) → 控制器
 *   opts = { form, outfit, auto(自由活动), view: { fov, dist, y, yaw, pitch }, radius(活动范围),
 *            floor(是否画地面法阵), onPoke, onAction, onReady }
 * 交互：点地面 → 走过去；点她 → 反应；左右拖动 → 旋转视角；鼠标 → 她看向你。
 * ========================================================= */
(() => {
  const D = window.DOLL;
  const TAU = Math.PI * 2;

  const THEMES = {
    base: { shade: '#c49ab8', rim: '#ffc2d2', ring: ['#ff5c93', '#ffb0c8', '#ff7a45'], ringBlend: 'add', shadow: 'rgba(20,0,8,0.55)', light: [-0.62, 0.58, 0.52], spark: ['#ff6f9f', '#ffb45c', '#ffd6e2'], ambient: 'ember' },
    alter: { shade: '#b3acd6', rim: '#f4f8ff', ring: ['#8fb8ff', '#ffffff', '#f7a8c8'], ringBlend: 'normal', shadow: 'rgba(40,50,90,0.3)', light: [-0.62, 0.55, 0.5], spark: ['#ffffff', '#a8d4ff', '#ffc2da'], ambient: 'ash' },
  };

  D.create = function create(host, opts = {}) {
    const ctl = { ok: false, form: opts.form || 'alter', outfitKey: opts.outfit || null, auto: opts.auto !== false };
    const ev = {};
    ctl.on = (n, f) => ((ev[n] = ev[n] || []).push(f), ctl);
    const emit = (n, ...a) => (ev[n] || []).forEach((f) => f(...a));
    let T, renderer, scene, camera, kit, rig, motion, outfitRes, floor, shadow, fx, amb, G;
    let companions = [], compKit = null;
    let raf = 0, running = false, visible = true, last = 0, destroyed = false;
    const view = Object.assign({ fov: 28, dist: 3.4, y: 0.78, yaw: 0, pitch: 0.1, lookY: 0.72 }, opts.view || {});
    const R = opts.radius ?? 1.25;
    let camYaw = view.yaw, camYawT = view.yaw, camX = 0;
    const lookPt = { x: 0, y: 1.3, z: 3 };
    let pointerIn = false, lastPointer = 0;
    let autoT = 4 + Math.random() * 3;

    ctl.ready = D.load().then(() => {
      if (destroyed) return ctl;
      T = D.T;
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.className = 'doll-canvas';
      host.appendChild(renderer.domElement);
      scene = new T.Scene();
      camera = new T.PerspectiveCamera(view.fov, 1, 0.05, 50);
      compKit = D.makeKit();
      G = compKit.G; // 所有角色 / 同伴共享的全局 uniform
      buildStage();
      resize();
      bindInput();
      return setOutfit(ctl.outfitKey || firstOutfit(ctl.form)).then(() => {
        startCompanions();
        ctl.ok = true;
        emit('ready', ctl);
        start();
        return ctl;
      });
    });

    function firstOutfit(form) {
      const l = D.listOutfits(form);
      return l.length ? l[0].key : Object.keys(D.outfits)[0];
    }

    /* ---------------------------------------------------------- 地面 / 影子 / 粒子 */
    function startCompanions() {
      const ids = opts.companions ?? Object.keys(D.companions);
      const api = {
        T, scene, kit: compKit, radius: R,
        motion: () => motion, rig: () => rig, form: () => ctl.form, camera: () => camera,
        on: (n, f) => ctl.on(n, f), emit,
        particle: (p) => fx.spawn(p),
      };
      companions = ids.map((id) => {
        try { return D.companions[id] ? D.companions[id](api) : null; } catch (e) { console.warn('[doll] companion', id, e); return null; }
      }).filter(Boolean);
      companions.forEach((c) => c.setForm && c.setForm(ctl.form));
    }
    function ringTex(th) {
      return compKit.canvasTex(1024, 1024, (g, w) => {
        const c = w / 2;
        g.clearRect(0, 0, w, w);
        g.translate(c, c);
        const [a, b, cc] = th.ring;
        const stroke = (r, lw, col, alpha, dash) => {
          g.globalAlpha = alpha; g.strokeStyle = col; g.lineWidth = lw;
          g.setLineDash(dash || []);
          g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
        };
        stroke(490, 3, a, 0.55);
        stroke(470, 1.5, b, 0.5, [2, 10]);
        stroke(430, 6, a, 0.35);
        stroke(400, 1.5, cc, 0.55);
        stroke(300, 2, b, 0.4, [30, 14, 4, 14]);
        stroke(180, 1.5, a, 0.35);
        // 刻度
        g.setLineDash([]);
        for (let i = 0; i < 72; i++) {
          const ang = (i / 72) * TAU, l = i % 6 === 0 ? 26 : 10;
          g.globalAlpha = i % 6 === 0 ? 0.6 : 0.35;
          g.strokeStyle = b; g.lineWidth = i % 6 === 0 ? 3 : 1.5;
          g.beginPath();
          g.moveTo(Math.cos(ang) * 432, Math.sin(ang) * 432);
          g.lineTo(Math.cos(ang) * (432 + l), Math.sin(ang) * (432 + l));
          g.stroke();
        }
        // 六芒 / 火山符号
        g.globalAlpha = 0.28; g.strokeStyle = a; g.lineWidth = 2;
        for (let k = 0; k < 2; k++) {
          g.beginPath();
          for (let i = 0; i <= 3; i++) {
            const ang = (i / 3) * TAU + k * Math.PI / 3 - Math.PI / 2;
            const x = Math.cos(ang) * 300, y = Math.sin(ang) * 300;
            i ? g.lineTo(x, y) : g.moveTo(x, y);
          }
          g.stroke();
        }
        // 小符文
        g.font = '600 26px "Cinzel", serif';
        g.textAlign = 'center';
        g.fillStyle = b; g.globalAlpha = 0.5;
        const word = 'EYJAFJALLAJOKULL · ADELE · NAUMANN · ';
        for (let i = 0; i < word.length; i++) {
          const ang = (i / word.length) * TAU;
          g.save(); g.rotate(ang); g.translate(0, -452); g.fillText(word[i], 0, 0); g.restore();
        }
      });
    }
    function buildStage() {
      const th = THEMES[ctl.form];
      const geo = new T.PlaneGeometry(R * 2.3, R * 2.3);
      geo.rotateX(-Math.PI / 2);
      floor = new T.Mesh(geo, new T.MeshBasicMaterial({ map: ringTex(th), transparent: true, depthWrite: false, blending: th.ringBlend === 'add' ? T.AdditiveBlending : T.NormalBlending, opacity: 0.85 }));
      floor.renderOrder = -2;
      floor.visible = opts.floor !== false;
      scene.add(floor);
      const sg = new T.PlaneGeometry(0.9, 0.9);
      sg.rotateX(-Math.PI / 2);
      const stex = compKit.canvasTex(128, 128, (g) => {
        const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
        r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.55, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, 128, 128);
      });
      shadow = new T.Mesh(sg, new T.MeshBasicMaterial({ map: stex, transparent: true, depthWrite: false, color: new T.Color(th.shadow.startsWith('rgba(20') ? '#140008' : '#28325a'), opacity: ctl.form === 'base' ? 0.55 : 0.3 }));
      shadow.position.y = 0.002;
      shadow.renderOrder = -1;
      scene.add(shadow);
      fx = makeFx();
      amb = makeAmbient();
    }
    function applyTheme() {
      const th = THEMES[ctl.form];
      if (kit) {
        kit.G.uShade.value.set(th.shade);
        kit.G.uRimColor.value.set(th.rim);
        kit.G.uLight.value.set(...th.light).normalize();
      }
      if (floor) {
        floor.material.map.dispose();
        floor.material.map = ringTex(th);
        floor.material.blending = th.ringBlend === 'add' ? T.AdditiveBlending : T.NormalBlending;
        floor.material.needsUpdate = true;
        shadow.material.color.set(ctl.form === 'base' ? '#140008' : '#28325a');
        shadow.material.opacity = ctl.form === 'base' ? 0.55 : 0.3;
      }
      if (amb) amb.setForm(ctl.form);
      companions.forEach((c) => c.setForm && c.setForm(ctl.form));
    }

    /** 粒子：法术火花、落地尘、点击涟漪 */
    function makeFx() {
      const N = 400;
      const geo = new T.BufferGeometry();
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      geo.setAttribute('aSize', new T.BufferAttribute(size, 1));
      geo.setAttribute('aAlpha', new T.BufferAttribute(alpha, 1));
      const mat = new T.ShaderMaterial({
        uniforms: { uScale: { value: 300 } },
        vertexShader: `attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale;
          void main(){ vC = color; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vC; varying float vA;
          void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
            float a = smoothstep(0.5, 0.0, r); a = a * a * vA; gl_FragColor = vec4(vC * (1.0 + a), a);
            #include <colorspace_fragment>
          }`,
        vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      });
      const pts = new T.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = 5;
      scene.add(pts);
      const P = Array.from({ length: N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.02, c: new T.Color(), g: 0, drag: 1 }));
      let head = 0;
      function spawn(o) {
        const p = P[head];
        head = (head + 1) % N;
        Object.assign(p, { life: o.life, max: o.life, x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, s: o.s || 0.03, g: o.g ?? 0, drag: o.drag ?? 0.98 });
        p.c.set(o.c || '#ffffff');
      }
      function update(dt) {
        for (let i = 0; i < N; i++) {
          const p = P[i];
          if (p.life > 0) {
            p.life -= dt;
            p.vy -= p.g * dt;
            const dr = Math.pow(p.drag, dt * 60);
            p.vx *= dr; p.vy *= dr; p.vz *= dr;
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          }
          const k = Math.max(0, p.life / p.max);
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
          col[i * 3] = p.c.r; col[i * 3 + 1] = p.c.g; col[i * 3 + 2] = p.c.b;
          size[i] = p.s * (0.4 + 0.6 * k);
          alpha[i] = p.life > 0 ? Math.min(1, k * 2.2) * Math.min(1, (1 - k) * 8 + 0.2) : 0;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
        geo.attributes.aSize.needsUpdate = true;
        geo.attributes.aAlpha.needsUpdate = true;
      }
      return { spawn, update, mat };
    }
    /** 环境漂浮物：本体为余烬、纯烬为白灰 */
    function makeAmbient() {
      const list = [];
      let form = ctl.form;
      function tick(dt) {
        if (list.length < 26 && Math.random() < dt * 6) {
          const a = Math.random() * TAU, r = Math.random() * R * 1.2;
          const th = THEMES[form];
          fx.spawn(form === 'base'
            ? { x: Math.cos(a) * r, y: Math.random() * 0.2, z: Math.sin(a) * r, vy: 0.12 + Math.random() * 0.18, vx: (Math.random() - 0.5) * 0.05, life: 3 + Math.random() * 3, s: 0.012 + Math.random() * 0.012, c: th.spark[(Math.random() * 3) | 0], drag: 0.995 }
            : { x: Math.cos(a) * r, y: 1.8 + Math.random() * 0.4, z: Math.sin(a) * r, vy: -0.08 - Math.random() * 0.06, vx: (Math.random() - 0.5) * 0.08, life: 5 + Math.random() * 3, s: 0.014 + Math.random() * 0.014, c: th.spark[(Math.random() * 3) | 0], drag: 0.998 });
        }
      }
      return { tick, setForm: (f) => (form = f), list };
    }

    function castFx(o = {}) {
      const th = THEMES[ctl.form];
      const V = new T.Vector3();
      const tip = outfitRes && outfitRes.props && outfitRes.props.staffTip;
      if (tip) tip.getWorldPosition(V);
      else rig.hand[o.hand || 'R'].getWorldPosition(V);
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * TAU, b = Math.random() * Math.PI, sp = 0.4 + Math.random() * 1.1;
        fx.spawn({ x: V.x, y: V.y, z: V.z, vx: Math.cos(a) * Math.sin(b) * sp, vy: Math.cos(b) * sp + 0.3, vz: Math.sin(a) * Math.sin(b) * sp, life: 0.8 + Math.random() * 0.9, s: 0.02 + Math.random() * 0.03, c: th.spark[i % 3], g: ctl.form === 'base' ? 0.6 : -0.1, drag: 0.94 });
      }
      // 地面光环
      const st = motion.st;
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * TAU;
        fx.spawn({ x: st.x + Math.cos(a) * 0.25, y: 0.03, z: st.z + Math.sin(a) * 0.25, vx: Math.cos(a) * 0.9, vz: Math.sin(a) * 0.9, vy: 0.05, life: 0.9, s: 0.025, c: th.spark[1], drag: 0.93 });
      }
      emit('fx', 'cast');
    }
    function rippleFx(x, z) {
      const th = THEMES[ctl.form];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        fx.spawn({ x: x + Math.cos(a) * 0.04, y: 0.02, z: z + Math.sin(a) * 0.04, vx: Math.cos(a) * 0.35, vz: Math.sin(a) * 0.35, life: 0.6, s: 0.018, c: th.spark[0], drag: 0.92 });
      }
    }

    /* ---------------------------------------------------------- 时装 */
    function setOutfit(key) {
      const def = D.outfits[key];
      if (!def) return Promise.resolve(false);
      const keep = motion ? { x: motion.st.x, z: motion.st.z, h: motion.st.heading } : null;
      if (rig) { scene.remove(rig.root); kit.dispose(); }
      kit = D.makeKit(G);
      const b = D.buildBody(kit, def.look || {});
      rig = b;
      kit.rig = rig;
      outfitRes = def.build(kit, rig) || {};
      motion = D.makeMotion(rig, { rest: outfitRes.rest, arms: outfitRes.arms, freeHand: outfitRes.freeHand, props: outfitRes.props, kit });
      if (outfitRes.soleDepth != null) rig.soleDepth = outfitRes.soleDepth;
      motion.on('fx', (name, o) => {
        if (name === 'cast') castFx(o);
        else if (name === 'particle') fx.spawn(o);
        else emit('fx', name, o);
      });
      motion.on('action', (id, phase) => emit('action', id, phase));
      if (keep) motion.place(keep.x, keep.z, keep.h);
      scene.add(rig.root);
      ctl.outfitKey = key;
      if (def.form && def.form !== ctl.form) { ctl.form = def.form; }
      applyTheme();
      // 预热：让弹簧稳定
      for (let i = 0; i < 30; i++) step(1 / 60, true);
      kit.resetGroups();
      emit('outfit', key);
      return Promise.resolve(true);
    }

    /* ---------------------------------------------------------- 输入 */
    function bindInput() {
      const cv = renderer.domElement;
      const rc = new T.Raycaster(), nd = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();
      let down = null;
      const toNdc = (e) => {
        const r = cv.getBoundingClientRect();
        nd.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        rc.setFromCamera(nd, camera);
      };
      cv.addEventListener('pointerdown', (e) => {
        down = { x: e.clientX, y: e.clientY, yaw: camYawT, drag: false, id: e.pointerId };
      });
      window.addEventListener('pointermove', (e) => {
        if (down && e.pointerId === down.id) {
          const dx = e.clientX - down.x;
          if (Math.abs(dx) > 6) down.drag = true;
          if (down.drag && opts.orbit !== false) camYawT = Math.max(-1.1, Math.min(1.1, down.yaw - dx * 0.006));
        }
      });
      window.addEventListener('pointerup', (e) => {
        if (!down || e.pointerId !== down.id) return;
        const d = down;
        down = null;
        if (d.drag || !ctl.ok) return;
        toNdc(e);
        const meshes = [];
        rig.root.traverse((o) => { if (o.isMesh && !o.userData.isLine) meshes.push(o); });
        const hits = rc.intersectObjects(meshes, false);
        if (hits.length) { poke(hits[0].point); return; }
        if (rc.ray.intersectPlane(plane, hit)) {
          const r = Math.hypot(hit.x, hit.z * 1.3);
          if (r > R) hit.multiplyScalar(R / r);
          rippleFx(hit.x, hit.z);
          motion.walkTo(hit.x, hit.z);
          autoT = 8 + Math.random() * 4;
        }
      });
      cv.addEventListener('pointerleave', () => { pointerIn = false; });
    }
    function poke(pt) {
      emit('poke', pt);
      const headY = rig.headC.getWorldPosition(new T.Vector3()).y;
      const list = pt.y > headY - 0.1 ? ['tilt', 'nod', 'wave'] : ['jump', 'wave', 'spin', 'bow'];
      motion.act(list[(Math.random() * list.length) | 0]);
      autoT = 7 + Math.random() * 4;
    }
    /** 页面级鼠标位置（clientX/Y）→ 她的视线目标 */
    ctl.pointer = (x, y) => {
      if (!ctl.ok) return;
      const r = renderer.domElement.getBoundingClientRect();
      if (!r.width) return;
      const nd = new T.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      const rc = new T.Raycaster();
      rc.setFromCamera(nd, camera);
      const p = rc.ray.at(camera.position.distanceTo(rig.root.position) * 0.85, new T.Vector3());
      lookPt.x = p.x; lookPt.y = p.y; lookPt.z = p.z;
      lastPointer = performance.now();
      pointerIn = true;
      start();
    };

    /* ---------------------------------------------------------- 循环 */
    function autoBrain(dt) {
      if (!ctl.auto || motion.busy() || motion.moving()) return;
      autoT -= dt;
      if (autoT > 0) return;
      autoT = 5 + Math.random() * 6;
      const r = Math.random();
      if (r < 0.55) {
        const a = Math.random() * TAU, d = 0.3 + Math.random() * (R - 0.35);
        motion.walkTo(Math.cos(a) * d, Math.sin(a) * d * 0.7);
      } else {
        const pool = (outfitRes.autoActions || ['wave', 'look', 'tilt', 'spin', 'jump', 'bow', 'cast']).concat(D.actionOrder.filter((id) => D.actions[id].auto));
        const ok = pool.filter((id) => D.actions[id] && (!D.actions[id].needs || D.actions[id].needs.every((n) => outfitRes.props && outfitRes.props[n])));
        motion.act(ok[(Math.random() * ok.length) | 0]);
      }
    }
    function step(dt, silent) {
      kit.G.uTime.value += dt;
      // 视线：鼠标最近动过就看鼠标，否则看镜头
      if (performance.now() - lastPointer < 4000 && pointerIn) motion.lookAt(lookPt);
      else motion.lookAt(camera.position);
      motion.update(dt);
      rig.updateCaps(kit.G.uCaps.value);
      kit.updateGroups(dt, motion.st.flare + Math.abs(motion.st.turnRate) * 0.004);
      for (const c of companions) c.update(dt);
      if (companions.length) compKit.updateGroups(dt, 0);
      if (!silent) {
        autoBrain(dt);
        // 到达后转向镜头
        if (!motion.moving() && !motion.busy() && motion.st.faceTo == null) {
          const want = Math.atan2(camera.position.x - motion.st.x, camera.position.z - motion.st.z);
          const da = ((want - motion.st.heading + Math.PI * 3) % TAU) - Math.PI;
          if (Math.abs(da) > 0.5 && motion.st.idleT > 0.6) motion.face(want);
        }
        shadow.position.x = motion.st.x; shadow.position.z = motion.st.z;
        const lift = rig.hips.position.y - D.DIM.HIP_Y;
        shadow.scale.setScalar(1 - Math.min(0.4, Math.max(0, lift) * 1.5));
        amb.tick(dt);
        fx.update(dt);
      }
    }
    function placeCamera(dt) {
      camYaw += (camYawT - camYaw) * Math.min(1, dt * 6);
      camX += (motion.st.x * 0.35 - camX) * Math.min(1, dt * 2);
      const d = view.dist;
      camera.position.set(camX + Math.sin(camYaw) * d * Math.cos(view.pitch), view.y + Math.sin(view.pitch) * d, Math.cos(camYaw) * d * Math.cos(view.pitch));
      camera.lookAt(camX, view.lookY, 0);
      const h = renderer.domElement.clientHeight || 1;
      kit.G.uK.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / (h * 1) * (opts.line ?? 1.35);
      fx.mat.uniforms.uScale.value = h * 0.9;
    }
    function frame(now) {
      raf = 0;
      if (!visible || document.hidden || destroyed) { running = false; return; }
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000 || 0.016));
      last = now;
      step(dt);
      placeCamera(dt);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || !ctl.ok || destroyed || opts.manual) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function resize() {
      if (!renderer) return;
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      const sz = renderer.getSize(new T.Vector2());
      if (sz.x === w && sz.y === h && camera.aspect === w / h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = w + 'px';
      renderer.domElement.style.height = h + 'px';
      camera.aspect = w / h;
      // 窄屏时拉远一点，保证全身入镜
      camera.fov = view.fov * (w / h < 0.8 ? 1.25 : 1);
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(() => { resize(); if (ctl.ok && !running && !opts.manual) { placeCamera(0.016); renderer.render(scene, camera); } });
    ro.observe(host);
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); });
    io.observe(host);
    const onVis = () => { if (!document.hidden) start(); };
    document.addEventListener('visibilitychange', onVis);

    Object.assign(ctl, {
      setOutfit: (k) => ctl.ready.then(() => setOutfit(k)),
      setForm(f) { ctl.form = f; if (ctl.ok) applyTheme(); },
      outfits: (form) => D.listOutfits(form || ctl.form),
      actions() {
        return D.actionOrder.map((id) => D.actions[id]).filter((a) => !a.hidden && (!a.needs || a.needs.every((n) => outfitRes && outfitRes.props && outfitRes.props[n]))).map((a) => ({ id: a.id, label: a.label, group: a.group || '' }));
      },
      act(id, o) { if (!ctl.ok) return false; autoT = 8 + Math.random() * 4; start(); return motion.act(id, o); },
      walkTo(x, z) { if (ctl.ok) { motion.walkTo(x, z); start(); } },
      setAuto(v) { ctl.auto = !!v; },
      resize,
      /** 调试 / 截图：按固定步长模拟到 t 秒后渲染一帧 */
      simulate(t, fps = 60) {
        const n = Math.round(t * fps);
        for (let i = 0; i < n; i++) { step(1 / fps); placeCamera(1 / fps); }
        renderer.render(scene, camera);
      },
      render() { placeCamera(0.016); renderer.render(scene, camera); },
      setView(v) { Object.assign(view, v); if (v.yaw != null) camYaw = camYawT = v.yaw; resize(); },
      destroy() {
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        ro.disconnect(); io.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        companions.forEach((c) => c.dispose && c.dispose());
        if (kit) kit.dispose();
        if (compKit) compKit.dispose();
        if (renderer) { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); }
      },
    });
    Object.defineProperties(ctl, {
      motion: { get: () => motion }, rig: { get: () => rig }, kit: { get: () => kit },
      renderer: { get: () => renderer }, camera: { get: () => camera }, scene: { get: () => scene },
      props: { get: () => (outfitRes && outfitRes.props) || {} },
    });
    return ctl;
  };
})();
