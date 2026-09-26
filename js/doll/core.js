/* =========================================================
 * 3D 人偶 · 核心
 * three.js 在需要时从 jsDelivr 动态加载（ES 模块），本文件提供：
 *   - 注册表：DOLL.outfit（时装）/ DOLL.action（动作）/ DOLL.prop（道具）
 *   - 建模工具 kit：卡通材质（色块阴影 + 边缘光 + 反向外壳描边）、
 *     头发 / 衣摆的摆动着色、衣摆与双腿的碰撞推挤、各种几何体生成器
 * 坐标约定：Y 向上，角色面朝 +Z；她的左手在 +X，右手在 −X；单位为米（身高约 1.45）。
 * ========================================================= */
window.DOLL = (() => {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
  const D = { T: null, outfits: {}, actions: {}, props: {}, actionOrder: [] };
  let loading = null;

  D.load = () => {
    if (!loading) loading = import(THREE_URL).then((m) => (D.T = m));
    return loading;
  };
  /** 注册时装：def = { form: 'base'|'alter', name, series?, order?, build(k) } */
  D.outfit = (key, def) => { D.outfits[key] = Object.assign({ key, order: 50 }, def); };
  /** 注册动作：def = { label, dur, loop?, ground?, face?, pose(t, P, ctx), start?(ctx), end?(ctx) } */
  D.action = (id, def) => {
    if (!D.actions[id]) D.actionOrder.push(id);
    D.actions[id] = Object.assign({ id }, def);
  };
  /** 注册道具：build(k, opts) → THREE.Object3D */
  D.prop = (id, build) => { D.props[id] = build; };
  /**
   * 注册同伴（如跟在身边的小羊）：factory(api) → { update(dt), setForm?(form), dispose?() }
   * api = { T, scene, kit(共享全局 uniform 的建模工具), motion(), rig(), form(), on(ev, fn), emit }
   */
  D.companions = {};
  D.companion = (id, factory) => { D.companions[id] = factory; };
  D.listOutfits = (form) =>
    Object.values(D.outfits).filter((o) => !form || o.form === form).sort((a, b) => a.order - b.order);

  /* ------------------------------------------------------------------ 着色器 */
  const GLSL_SWAY = `
attribute float aSway;
uniform vec3 uSwing;
uniform float uWind;
uniform float uFlare;
uniform float uPhase;
vec3 dollSway(vec3 p){
  float w = aSway * aSway;
  vec3 d = uSwing * w;
  float ph = uTime * 2.2 + uPhase + p.y * 8.0 + (p.x - p.z) * 5.0;
  d += vec3(sin(ph), 0.3 * sin(ph * 1.7), cos(ph * 0.83)) * (uWind * w);
  float rl = length(p.xz);
  if (rl > 1e-4) { d.xz += p.xz / rl * (uFlare * w); d.y += uFlare * w * 0.45; }
  return d;
}`;
  const GLSL_PUSH = `
uniform vec4 uCaps[8];
vec3 dollPush(vec3 wp){
  for (int i = 0; i < 4; i++) {
    vec3 a = uCaps[i * 2].xyz;
    vec3 b = uCaps[i * 2 + 1].xyz;
    float r = uCaps[i * 2].w;
    vec3 ab = b - a;
    float h = clamp(dot(wp - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    vec3 c = a + ab * h;
    vec3 d = wp - c;
    float l = length(d);
    if (l < r && l > 1e-5) wp = c + d * (r / l);
  }
  return wp;
}`;
  const VS = `
uniform float uTime;
#ifdef SWAY
${GLSL_SWAY}
#endif
#ifdef COLLIDE
${GLSL_PUSH}
#endif
#ifdef OUTLINE
uniform float uK;
uniform float uW;
#endif
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
varying vec3 vCol;
void main(){
  vec3 p = position;
#ifdef SWAY
  p += dollSway(position);
#endif
  vec4 wp = modelMatrix * vec4(p, 1.0);
#ifdef COLLIDE
  wp.xyz = dollPush(wp.xyz);
#endif
  vN = normalize(mat3(modelMatrix) * normal);
#ifdef OUTLINE
  vec4 vp0 = viewMatrix * wp;
  wp.xyz += vN * (uW * uK * max(0.35, -vp0.z));
#endif
  vW = wp.xyz;
  vUv = uv;
#ifdef USE_COLOR
  vCol = color;
#else
  vCol = vec3(1.0);
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
  const FS = `
uniform vec3 uColor;
uniform vec3 uShade;
uniform vec3 uLight;
uniform vec3 uRimColor;
uniform float uRim;
uniform float uFlat;
uniform float uGlow;
uniform float uBias;
uniform float uOpacity;
#ifdef USE_TEX
uniform sampler2D uMap;
#endif
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
varying vec3 vCol;
void main(){
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 base = uColor * vCol;
  float a = uOpacity;
#ifdef USE_TEX
  vec4 tx = texture2D(uMap, vUv);
  base *= tx.rgb;
  a *= tx.a;
#endif
  if (a < 0.02) discard;
  float ndl = dot(n, uLight);
  float lit = smoothstep(-0.035, 0.035, ndl + uBias);
  vec3 col = mix(base * uShade, base, lit);
  col *= 0.93 + 0.07 * n.y;
  col = mix(col, base, uFlat);
  vec3 e = normalize(cameraPosition - vW);
  float fr = 1.0 - clamp(dot(n, e), 0.0, 1.0);
  col += uRimColor * smoothstep(0.62, 0.92, fr) * uRim * (0.35 + 0.65 * lit);
  col += base * uGlow;
  gl_FragColor = vec4(col, a);
#include <colorspace_fragment>
}`;
  const FS_LINE = `
uniform vec3 uColor;
void main(){
  gl_FragColor = vec4(uColor, 1.0);
#include <colorspace_fragment>
}`;

  /* ------------------------------------------------------------------ kit */
  /**
   * 每个角色实例一个 kit：材质共享全局 uniform（时间、光照方向、描边像素系数、腿部碰撞胶囊）。
   */
  D.makeKit = function makeKit(shared) {
    const T = D.T;
    const V3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
    const G = shared || {
      uTime: { value: 0 },
      uLight: { value: V3(-0.45, 0.75, 0.6).normalize() },
      uK: { value: 0.002 },
      uCaps: { value: Array.from({ length: 8 }, () => new T.Vector4(0, -9, 0, 0)) },
      uShade: { value: new T.Color('#c7abc9') },
      uRimColor: { value: new T.Color('#fff2f6') },
    };
    const mats = [];
    const col = (c) => (c && c.isColor ? c.clone() : new T.Color(c));

    /** 摆动组：挂在某根骨骼上，由弹簧模拟惯性，着色器按 aSway² 施加位移 */
    const groups = [];
    function sway(name, bone, o = {}) {
      const g = {
        name, bone,
        k: o.stiff ?? 38, c: o.damp ?? 7.5,
        gain: o.gain ?? 1, grav: o.gravity ?? 0.35, len: o.len ?? 0.5,
        wind: o.wind ?? 0.006, flareGain: o.flare ?? 1, maxSwing: o.max ?? 0.12,
        U: {
          uSwing: { value: V3() }, uWind: { value: o.wind ?? 0.006 },
          uFlare: { value: 0 }, uPhase: { value: o.phase ?? Math.random() * 6 },
        },
        x: null, v: V3(), extra: V3(), flare: 0,
      };
      groups.push(g);
      return g;
    }

    /**
     * 卡通材质。o: { shade, rim, rimColor, flat, glow, bias, map, vertexColors, side,
     *   transparent, opacity, sway(组), collide, outline(false 关闭), line(描边颜色), lineW }
     */
    function mat(color, o = {}) {
      const defines = {};
      if (o.sway) defines.SWAY = '';
      if (o.collide) defines.COLLIDE = '';
      if (o.map) defines.USE_TEX = '';
      const U = {
        uTime: G.uTime, uLight: G.uLight, uCaps: G.uCaps,
        uColor: { value: col(color) },
        uShade: o.shade ? { value: col(o.shade) } : G.uShade,
        uRimColor: o.rimColor ? { value: col(o.rimColor) } : G.uRimColor,
        uRim: { value: o.rim ?? 0.28 },
        uFlat: { value: o.flat ?? 0 },
        uGlow: { value: o.glow ?? 0 },
        uBias: { value: o.bias ?? 0 },
        uOpacity: { value: o.opacity ?? 1 },
        ...(o.map ? { uMap: { value: o.map } } : {}),
        ...(o.sway ? o.sway.U : {}),
      };
      const m = new T.ShaderMaterial({
        uniforms: U, defines, vertexShader: VS, fragmentShader: FS,
        vertexColors: !!o.vertexColors,
        side: o.side ?? (o.double ? T.DoubleSide : T.FrontSide),
        transparent: !!o.transparent,
        depthWrite: o.depthWrite ?? true,
      });
      m.userData = {
        line: o.outline === false ? null : { color: o.line ? col(o.line) : col(color).multiplyScalar(0.28).lerp(new T.Color('#2a1418'), 0.35), w: o.lineW ?? 1 },
        sway: o.sway || null, collide: !!o.collide,
      };
      mats.push(m);
      return m;
    }
    function lineMat(m) {
      if (m.userData.lineMat) return m.userData.lineMat;
      const defines = { OUTLINE: '' };
      if (m.userData.sway) defines.SWAY = '';
      if (m.userData.collide) defines.COLLIDE = '';
      const lm = new T.ShaderMaterial({
        uniforms: {
          uTime: G.uTime, uCaps: G.uCaps, uK: G.uK,
          uW: { value: m.userData.line.w }, uColor: { value: m.userData.line.color },
          ...(m.userData.sway ? m.userData.sway.U : {}),
        },
        defines, vertexShader: VS, fragmentShader: FS_LINE, side: T.BackSide,
      });
      m.userData.lineMat = lm;
      return lm;
    }

    /** 创建网格（自动附带描边外壳）。t = { p, r, s, name, outline, order } */
    function mesh(geo, m, parent, t = {}) {
      const me = new T.Mesh(geo, m);
      if (t.p) me.position.set(...t.p);
      if (t.r) me.rotation.set(t.r[0], t.r[1], t.r[2], t.r[3] || 'XYZ');
      if (t.s != null) Array.isArray(t.s) ? me.scale.set(...t.s) : me.scale.setScalar(t.s);
      if (t.name) me.name = t.name;
      if (t.order != null) me.renderOrder = t.order;
      me.frustumCulled = false;
      if (m.userData.line && t.outline !== false) {
        const ln = new T.Mesh(geo, lineMat(m));
        ln.frustumCulled = false;
        ln.userData.isLine = true;
        me.add(ln);
      }
      if (parent) parent.add(me);
      return me;
    }

    /* ---------------------------------------------------------- 几何体工具 */
    function setAttr(g, name, arr, n) { g.setAttribute(name, new T.BufferAttribute(arr, n)); return g; }
    /** aSway 按高度：yTop 处为 0，yBot 处为 amp */
    function swayY(g, yTop, yBot, amp = 1, pw = 1) {
      const p = g.attributes.position, a = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) a[i] = amp * Math.pow(Math.min(1, Math.max(0, (yTop - p.getY(i)) / (yTop - yBot))), pw);
      return setAttr(g, 'aSway', a, 1);
    }
    /** aSway 按离某点的距离 */
    function swayDist(g, o, d0, d1, amp = 1) {
      const p = g.attributes.position, a = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) {
        const d = Math.hypot(p.getX(i) - o[0], p.getY(i) - o[1], p.getZ(i) - o[2]);
        a[i] = amp * Math.min(1, Math.max(0, (d - d0) / (d1 - d0)));
      }
      return setAttr(g, 'aSway', a, 1);
    }
    /** 顶点色：fn(x, y, z, i) → [r,g,b] 或 THREE.Color */
    function paint(g, fn) {
      const p = g.attributes.position, c = new Float32Array(p.count * 3), tmp = new T.Color();
      for (let i = 0; i < p.count; i++) {
        let v = fn(p.getX(i), p.getY(i), p.getZ(i), i);
        if (!v.isColor) v = tmp.setRGB(v[0], v[1], v[2]);
        c[i * 3] = v.r; c[i * 3 + 1] = v.g; c[i * 3 + 2] = v.b;
      }
      return setAttr(g, 'color', c, 3);
    }
    /** 沿某轴的双色渐变（顶点色，与材质颜色相乘；传入的颜色为 sRGB 十六进制） */
    function grad(g, axis, a, b, c0, c1, pw = 1) {
      const A = col(c0), B = col(c1), k = { x: 0, y: 1, z: 2 }[axis], tmp = new T.Color();
      return paint(g, (x, y, z) => {
        const v = [x, y, z][k];
        const t = Math.pow(Math.min(1, Math.max(0, (v - a) / (b - a))), pw);
        return tmp.copy(A).lerp(B, t);
      });
    }

    /** 车削体：profile 为 [[半径, y], ...]，从下到上；o = { seg, phi0, phiLen, sz, sx } */
    function lathe(profile, o = {}) {
      const pts = profile.map(([r, y]) => new T.Vector2(Math.max(r, 1e-4), y));
      const g = new T.LatheGeometry(pts, o.seg ?? 36, o.phi0 ?? 0, o.phiLen ?? Math.PI * 2);
      if (o.sx != null || o.sz != null) g.scale(o.sx ?? 1, 1, o.sz ?? 1);
      if (o.phiLen == null || o.phiLen >= Math.PI * 2 - 1e-3) g.computeVertexNormals();
      return g;
    }
    /**
     * 衣物外壳：车削体 + 前开口（开口宽度可随高度变化）+ 下摆锯齿。
     * profile: [[半径, y], ...] 从下到上（不闭合，适合外套 / 裙 / 背心）
     * o = { seg, sx, sz, gap: 弧度|fn(y)（前方开口总角度，0 为闭合）, jag: fn(ψ)→下摆下垂量, jagH,
     *       bulge: fn(ψ, y)→半径系数, back: 后开口（ψ 以背后为 0） }
     * ψ 为从正前方（+Z）开始、向她左侧（+X）增加的角度。
     */
    function shell(profile, o = {}) {
      const seg = o.seg ?? 56, eps = 1e-3;
      const pts = profile.map(([r, y]) => new T.Vector2(Math.max(r, 1e-4), y));
      const g = new T.LatheGeometry(pts, seg, eps, Math.PI * 2 - 2 * eps);
      const p = g.attributes.position;
      const yb = profile[0][1], jagH = o.jagH ?? 0.08;
      const gapF = typeof o.gap === 'function' ? o.gap : () => o.gap || 0;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const r = Math.hypot(x, z);
        let psi = Math.atan2(x, z);
        if (psi < 0) psi += Math.PI * 2;
        const gy = Math.min(Math.PI * 1.9, Math.max(0, gapF(y)));
        const u = (psi - eps) / (Math.PI * 2 - 2 * eps);
        const q = gy / 2 + u * (Math.PI * 2 - gy);
        const rr = r * (o.bulge ? o.bulge(q, y) : 1);
        let ny = y;
        if (o.jag) ny -= o.jag(q) * Math.min(1, Math.max(0, (yb + jagH - y) / jagH));
        p.setXYZ(i, rr * Math.sin(q) * (o.sx ?? 1), ny, rr * Math.cos(q) * (o.sz ?? 1));
      }
      g.computeVertexNormals();
      return g;
    }
    /** 与外壳配套的里衬：同几何，向内缩一点，只画背面 */
    function lining(parentMesh, color, o = {}) {
      const m = mat(color, Object.assign({ side: T.BackSide, outline: false, rim: 0.05 }, o));
      const me = new T.Mesh(parentMesh.geometry, m);
      me.scale.setScalar(o.inset ?? 0.992);
      me.frustumCulled = false;
      parentMesh.add(me);
      return me;
    }
    /** 螺旋缠绕带（绑带、丝带缠腿）：沿 −Y 轴，半径 r(t)，从 y0 到 y1 */
    function helix(y0, y1, r, turns, o = {}) {
      const pts = [], n = Math.max(12, Math.round(turns * 18));
      const Rf = typeof r === 'function' ? r : () => r;
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = (o.a0 ?? 0) + t * turns * Math.PI * 2 * (o.dir ?? 1);
        const rr = Rf(t);
        pts.push([Math.sin(a) * rr * (o.sx ?? 1), y0 + (y1 - y0) * t, Math.cos(a) * rr * (o.sz ?? 1)]);
      }
      return sweep(pts, { seg: n * 2, rad: 4, w: o.w ?? 0.008, h: o.h ?? 0.0025, up: (t, P) => V3(P.x, 0, P.z).normalize(), sway: () => 0 });
    }

    /** 平滑插值半径列表的肢体（沿 −Y，从 0 到 −len，两端为半球） */
    function limb(len, radii, o = {}) {
      const n = o.rings ?? 14, prof = [];
      const R = (t) => {
        const f = t * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(f)), u = f - i;
        const s = u * u * (3 - 2 * u);
        return radii[i] * (1 - s) + radii[i + 1] * s;
      };
      const r1 = radii[radii.length - 1], r0 = radii[0];
      for (let i = 6; i >= 1; i--) { const a = (i / 6) * (Math.PI / 2); prof.push([r1 * Math.cos(a), -len - r1 * Math.sin(a) * (o.capB ?? 1)]); }
      for (let i = n; i >= 0; i--) { const t = i / n; prof.push([R(t), -len * t]); }
      for (let i = 1; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); prof.push([r0 * Math.cos(a), r0 * Math.sin(a) * (o.capT ?? 1)]); }
      const g = lathe(prof, { seg: o.seg ?? 20, sz: o.sz, sx: o.sx });
      return g;
    }
    function capsule(len, r0, r1, o) { return limb(len, [r0, r1], o); }
    function ellipsoid(rx, ry, rz, o = {}) {
      const g = new T.SphereGeometry(1, o.seg ?? 28, o.segY ?? 20);
      g.scale(rx, ry, rz);
      return g;
    }
    /** 圆角盒 */
    function rbox(w, h, d, r, o = {}) {
      const s = o.seg ?? 6;
      const g = new T.BoxGeometry(w, h, d, s, s, s);
      const p = g.attributes.position, n = g.attributes.normal;
      const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = V3(), c = V3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
        const dv = v.sub(c);
        if (dv.lengthSq() < 1e-12) continue;
        dv.normalize();
        n.setXYZ(i, dv.x, dv.y, dv.z);
        p.setXYZ(i, c.x + dv.x * r, c.y + dv.y * r, c.z + dv.z * r);
      }
      return g;
    }

    /**
     * 通用扫掠体：沿曲线生成椭圆截面的管状体。
     * pts: 控制点 [[x,y,z],...]
     * o: { w(t)|w: 截面宽（沿 side），h(t)|h: 截面厚（沿 nrm），up(t,P)|up: 截面朝向参考，
     *      seg: 沿曲线分段, rad: 截面分段, sway(t): aSway, colors: [c0, c1, pw, t0] 顶点色渐变,
     *      capA/capB: 是否封口, closed: 闭合曲线, tension }
     */
    function sweep(pts, o = {}) {
      const curve = new T.CatmullRomCurve3(pts.map((p) => V3(...p)), !!o.closed, 'catmullrom', o.tension ?? 0.5);
      const N = o.seg ?? 32, M = o.rad ?? 10;
      const W = typeof o.w === 'function' ? o.w : () => o.w ?? 0.01;
      const H = typeof o.h === 'function' ? o.h : () => o.h ?? W(0);
      const UP = typeof o.up === 'function' ? o.up : (() => { const u = V3(...(o.up || [0, 1, 0])); return () => u; })();
      const SW = o.sway || ((t) => t);
      const pos = [], nor = [], uvs = [], sw = [], cols = [], idx = [];
      let C0, C1;
      if (o.colors) { C0 = col(o.colors[0]); C1 = col(o.colors[1]); }
      const tmpC = new T.Color();
      const P = V3(), Tn = V3(), S = V3(), Nn = V3(), up = V3(), prevS = V3();
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        curve.getPointAt(Math.min(t, 1), P);
        curve.getTangentAt(Math.min(Math.max(t, 1e-4), 1 - 1e-4), Tn);
        up.copy(UP(t, P));
        S.crossVectors(Tn, up);
        if (S.lengthSq() < 1e-8) S.copy(prevS); else S.normalize();
        if (i > 0 && S.dot(prevS) < 0) S.negate();
        prevS.copy(S);
        Nn.crossVectors(S, Tn).normalize();
        const w = Math.max(W(t), 1e-5), h = Math.max(H(t), 1e-5);
        let cc = null;
        if (C0) {
          const [, , pw = 1, t0 = 0] = o.colors;
          const k = t0 >= 1 ? 0 : Math.pow(Math.min(1, Math.max(0, (t - t0) / (1 - t0))), pw);
          cc = tmpC.copy(C0).lerp(C1, k);
        }
        for (let j = 0; j <= M; j++) {
          const a = (j / M) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          pos.push(P.x + S.x * ca * w + Nn.x * sa * h, P.y + S.y * ca * w + Nn.y * sa * h, P.z + S.z * ca * w + Nn.z * sa * h);
          const nx = S.x * ca / w + Nn.x * sa / h, ny = S.y * ca / w + Nn.y * sa / h, nz = S.z * ca / w + Nn.z * sa / h;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nor.push(nx / nl, ny / nl, nz / nl);
          uvs.push(t, j / M);
          sw.push(SW(t));
          if (cc) cols.push(cc.r, cc.g, cc.b);
        }
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
        const a = i * (M + 1) + j, b = a + M + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      // 端盖
      const cap = (i, flip) => {
        const t = i / N;
        curve.getPointAt(t, P);
        curve.getTangentAt(Math.min(Math.max(t, 1e-4), 1 - 1e-4), Tn);
        const c = pos.length / 3;
        pos.push(P.x, P.y, P.z);
        nor.push(flip ? -Tn.x : Tn.x, flip ? -Tn.y : Tn.y, flip ? -Tn.z : Tn.z);
        uvs.push(t, 0.5); sw.push(SW(t));
        if (C0) { const k = cols.length ? i * (M + 1) * 3 : 0; cols.push(cols[k], cols[k + 1], cols[k + 2]); }
        for (let j = 0; j < M; j++) {
          const a = i * (M + 1) + j;
          flip ? idx.push(c, a + 1, a) : idx.push(c, a, a + 1);
        }
      };
      if (o.capA !== false) cap(0, true);
      if (o.capB !== false) cap(N, false);
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
      g.setAttribute('aSway', new T.Float32BufferAttribute(sw, 1));
      if (C0) g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
      g.setIndex(idx);
      return g;
    }

    /**
     * 发束：截面宽度沿头皮切向、厚度沿“离开头心”的方向，适合刘海 / 长发 / 侧发。
     * center: 头心（与 pts 同一坐标系）；o 同 sweep，另有 w0（根部宽）、tipW（末端宽比例）、thick（厚/宽）
     */
    function strand(center, pts, o = {}) {
      const c = V3(...center);
      const w0 = o.w0 ?? 0.03, tipW = o.tip ?? 0.04, bulge = o.bulge ?? 0.25, th = o.thick ?? 0.38;
      const wf = o.wf || ((t) => w0 * (1 + bulge * Math.sin(Math.PI * Math.min(1, t * 1.6))) * (tipW + (1 - tipW) * Math.pow(1 - t, o.taper ?? 0.9)));
      const out = V3();
      return sweep(pts, {
        seg: o.seg ?? 28, rad: o.rad ?? 8,
        w: wf, h: (t) => Math.max(0.0025, wf(t) * th),
        up: o.upFn || ((t, P) => out.copy(P).sub(c).normalize()),
        sway: o.sway, colors: o.colors, capA: o.capA, capB: o.capB,
      });
    }

    /**
     * 羊角螺旋：root 为根部位置，dir=±1 表示左 / 右（+1 为她的左侧 +X），
     * o = { r0: 初始回旋半径, turns, shrink, spread(向外推出), thick0, thick1, ridges, tilt(外倾角), yaw }
     */
    function curl(root, dir, o = {}) {
      const r0 = o.r0 ?? 0.05, turns = o.turns ?? 1.05, shrink = o.shrink ?? 0.17, spread = o.spread ?? 0.03;
      const tilt = o.tilt ?? 0.35, yaw = o.yaw ?? 0.15, a0 = o.a0 ?? Math.PI / 2;
      const pts = [], n = 36;
      const total = turns * Math.PI * 2;
      for (let i = 0; i <= n; i++) {
        const u = i / n, a = a0 + u * total;
        const r = r0 * Math.exp(-shrink * u * total);
        // 在 (z, y) 平面内回旋：先向上，再向后、向下，最后绕到前方
        let z = Math.cos(a) * r - Math.cos(a0) * r0, y = Math.sin(a) * r - Math.sin(a0) * r0;
        let x = spread * Math.pow(u, 0.8);
        // 外倾：让回旋平面绕 Z 轴倾斜，下半圈向外张开
        const ct = Math.cos(tilt), st = Math.sin(tilt);
        const x1 = x * ct - y * st, y1 = x * st + y * ct;
        // 轻微偏航
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        const x2 = x1 * cy + z * sy, z2 = -x1 * sy + z * cy;
        pts.push([root[0] + dir * x2, root[1] + y1, root[2] + z2]);
      }
      const t0 = o.thick0 ?? 0.02, t1 = o.thick1 ?? 0.005, rid = o.ridges ?? 11;
      const rf = (t) => (t0 + (t1 - t0) * Math.pow(t, 0.85)) * (1 + 0.1 * Math.cos(t * rid * Math.PI * 2));
      const g = sweep(pts, { seg: 90, rad: 12, w: rf, h: rf, up: [dir, 0, 0], sway: () => 0 });
      if (o.stripe) {
        const A = col(o.stripe[0]), B = col(o.stripe[1]), tmp = new T.Color();
        const uv = g.attributes.uv;
        paint(g, (x, y, z, i) => tmp.copy(A).lerp(B, 0.5 + 0.5 * Math.cos(uv.getX(i) * rid * Math.PI * 2)));
      }
      return g;
    }

    /** 合并多个几何体（统一为非索引，缺失的属性用默认值填充） */
    function merge(list) {
      const spec = { position: 3, normal: 3, uv: 2, aSway: 1, color: 3 };
      const defs = { uv: 0, aSway: 0, color: 1 };
      const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
      const hasColor = parts.some((g) => g.attributes.color);
      const out = new T.BufferGeometry();
      let n = 0;
      parts.forEach((g) => (n += g.attributes.position.count));
      for (const [k, s] of Object.entries(spec)) {
        if (k === 'color' && !hasColor) continue;
        const arr = new Float32Array(n * s);
        let off = 0;
        for (const g of parts) {
          const a = g.attributes[k], c = g.attributes.position.count;
          if (a) arr.set(a.array.subarray(0, c * s), off);
          else arr.fill(defs[k] ?? 0, off, off + c * s);
          off += c * s;
        }
        out.setAttribute(k, new T.BufferAttribute(arr, s));
      }
      return out;
    }
    /** 把几何体按矩阵变换后返回（用于合并前摆放） */
    function place(g, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
      const m = new T.Matrix4().compose(V3(...p), new T.Quaternion().setFromEuler(new T.Euler(r[0], r[1], r[2], r[3] || 'XYZ')), Array.isArray(s) ? V3(...s) : V3(s, s, s));
      g.applyMatrix4(m);
      return g;
    }
    /** 画布纹理（sRGB） */
    function canvasTex(w, h, draw) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      draw(g, w, h);
      const t = new T.CanvasTexture(c);
      t.colorSpace = T.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    }
    /** 空节点 */
    function node(parent, p = [0, 0, 0], r, name) {
      const n = new T.Group();
      n.position.set(...p);
      if (r) n.rotation.set(r[0], r[1], r[2], r[3] || 'XYZ');
      if (name) n.name = name;
      if (parent) parent.add(n);
      return n;
    }

    /* ---------------------------------------------------------- 每帧更新 */
    const _q = new T.Quaternion(), _p = V3(), _g = V3(), _d = V3();
    function updateGroups(dt, flare) {
      for (const g of groups) {
        g.bone.getWorldPosition(_p);
        if (!g.x) { g.x = _p.clone(); g.v.set(0, 0, 0); }
        const h = Math.min(dt, 1 / 30);
        // 弹簧：尖端追随骨骼
        _d.subVectors(_p, g.x);
        g.v.addScaledVector(_d, g.k * h).multiplyScalar(Math.max(0, 1 - g.c * h));
        g.x.addScaledVector(g.v, h);
        if (_d.length() > 0.6) { g.x.copy(_p); g.v.set(0, 0, 0); }
        // 滞后量（世界）→ 骨骼局部
        _d.subVectors(g.x, _p).multiplyScalar(g.gain);
        if (_d.length() > g.maxSwing) _d.setLength(g.maxSwing);
        _d.add(g.extra);
        g.bone.getWorldQuaternion(_q).invert();
        _d.applyQuaternion(_q);
        // 重力补偿：骨骼倾斜时让长发 / 衣摆仍大致下垂
        _g.set(0, -1, 0).applyQuaternion(_q);
        _d.x += (_g.x) * g.len * g.grav;
        _d.y += (_g.y + 1) * g.len * g.grav;
        _d.z += (_g.z) * g.len * g.grav;
        g.U.uSwing.value.copy(_d);
        g.flare += ((flare || 0) * g.flareGain - g.flare) * Math.min(1, dt * 6);
        g.U.uFlare.value = g.flare;
      }
    }
    function resetGroups() { for (const g of groups) { g.x = null; g.v.set(0, 0, 0); } }
    function dispose() {
      mats.forEach((m) => { m.dispose(); m.userData.lineMat && m.userData.lineMat.dispose(); });
    }

    return {
      T, D, V3, G, groups,
      mat, mesh, node, sway, setAttr, swayY, swayDist, paint, grad,
      lathe, limb, capsule, ellipsoid, rbox, sweep, strand, curl, merge, place, canvasTex, shell, lining, helix,
      updateGroups, resetGroups, dispose, color: col,
    };
  };

  return D;
})();
