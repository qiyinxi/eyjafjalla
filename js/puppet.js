/* =========================================================
 * 原画分层绑定 · 运行时（类 Live2D）
 * 读取 tools/puppet/build.py 产出的 assets/puppet/<key>/{atlas.webp, rig.json}。
 * 每个图层是一张按网格切分的贴图网格，挂在 2D 骨骼上做变形：
 *   - 骨骼：绕枢轴旋转 / 平移 / 缩放，父子层级；可带自身的待机摆动（idle）
 *   - 转头：按图层 depth 做视差；带 sphere 的图层按球面分布位移（脸中间动得多、轮廓动得少）
 *   - 发束 / 衣摆 / 飘带：沿根部 → 末端弯曲；风是沿发束传播的波（wave），加上弹簧惯性
 *   - 眼睛：眨眼压扁（可分左右）、虹膜跟随视线并被眼眶裁剪
 *   - 状态图层：闭眼线、开心眯眼、张嘴、腮红……按状态淡入淡出
 *   - 发光：图层按节奏微微发亮（熔岩、晶叶）
 * 画质即原画像素本身（WebGL2 下使用 mipmap，缩小显示不闪烁）。
 * API：PUPPET.create(host, opts) → { load(key), act(name), pointer(x,y), poke(x,y), talk(level),
 *        impulse(dx,dy), anchor(name), hitHead(x,y), setIdle(on), hide(), layout(), destroy(), ok, key, state }
 * ========================================================= */
window.PUPPET = (() => {
  const VS = `
attribute vec2 aPos;
uniform mat3 uBone;
uniform vec2 uShift;
uniform vec4 uSphere;
uniform vec4 uSway;
uniform vec4 uWind;
uniform float uLag;
uniform float uLift;
uniform float uSwayPow;
uniform float uTime;
uniform vec3 uSquash;
uniform vec2 uLook;
uniform vec4 uMouth;
uniform vec4 uView;
uniform vec2 uAtlasAt;
uniform vec2 uAtlas;
varying vec2 vUv;
varying vec2 vSock;
void main(){
  vUv = (aPos + uAtlasAt) / uAtlas;
  vec2 p = aPos + uLook;
  vSock = p;
  if (uMouth.w > 0.5) p.y = uMouth.y + (p.y - uMouth.y) * mix(uMouth.z, 1.0, uMouth.x);
  if (uSquash.z > 0.5) p.y = uSquash.y + (p.y - uSquash.y) * (1.0 - uSquash.x);
  if (dot(uSway.zw, uSway.zw) > 0.0) {
    vec2 d = uSway.zw;
    float len2 = dot(d, d);
    float t = clamp(dot(p - uSway.xy, d) / len2, 0.0, 1.0);
    float w = pow(t, uSwayPow);
    vec2 dir = d / sqrt(len2);
    vec2 perp = vec2(-dir.y, dir.x);
    float ph = uTime * uWind.y + uWind.z - uWind.w * t;
    float wind = (sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.25) * uWind.x;
    float b = (wind + uLag) * w;
    p += perp * b + dir * (abs(b) * 0.12 - uLift * w);
  }
  vec2 sh = uShift;
  if (uSphere.z > 0.0) {
    vec2 q = (p - uSphere.xy) / uSphere.zw;
    float g = sqrt(max(0.0, 1.0 - q.x * q.x)) * sqrt(max(0.0, 1.0 - q.y * q.y));
    sh *= 0.3 + 0.7 * g;
  }
  p += sh;
  p = (uBone * vec3(p, 1.0)).xy;
  gl_Position = vec4(p * uView.xy + uView.zw, 0.0, 1.0);
}`;
  const FS = `
precision mediump float;
uniform sampler2D uTex;
uniform float uAlpha;
uniform vec4 uClip;
uniform vec4 uGlow;
varying vec2 vUv;
varying vec2 vSock;
void main(){
  float a = uAlpha;
  if (uClip.z > 0.0) {
    vec2 q = (vSock - uClip.xy) / uClip.zw;
    a *= 1.0 - smoothstep(0.86, 1.0, dot(q, q));
  }
  vec4 c = texture2D(uTex, vUv);
  c.rgb += uGlow.rgb * uGlow.a * c.a;
  gl_FragColor = c * a;
}`;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const hold = (k, a = 0.25) => (k < a ? smooth(k / a) : k > 1 - a ? smooth((1 - k) / a) : 1);
  const hexRgb = (h) => { h = (h || '#ffffff').replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };

  /* 2D 仿射矩阵（列主序 3×3） */
  const M = {
    id: () => [1, 0, 0, 0, 1, 0, 0, 0, 1],
    mul(a, b) {
      const r = new Array(9);
      for (let c = 0; c < 3; c++) for (let rr = 0; rr < 3; rr++) r[c * 3 + rr] = a[rr] * b[c * 3] + a[3 + rr] * b[c * 3 + 1] + a[6 + rr] * b[c * 3 + 2];
      return r;
    },
    /** 围绕枢轴 (px,py) 旋转 a、缩放 (sx,sy)，再平移 (tx,ty) */
    local(px, py, a, sx, sy, tx, ty) {
      const c = Math.cos(a), s = Math.sin(a);
      const m00 = c * sx, m01 = -s * sy, m10 = s * sx, m11 = c * sy;
      return [m00, m10, 0, m01, m11, 0, px + tx - (m00 * px + m01 * py), py + ty - (m10 * px + m11 * py), 1];
    },
    apply(m, x, y) { return [m[0] * x + m[3] * y + m[6], m[1] * x + m[4] * y + m[7]]; },
  };

  function create(host, opts = {}) {
    const cv = document.createElement('canvas');
    cv.className = 'puppet-canvas';
    cv.style.position = 'absolute';
    cv.style.pointerEvents = 'none';
    host.appendChild(cv);
    // 网格边缘都落在透明区域里，不需要 MSAA（省 4 倍采样）
    const attrs = { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: !!opts.preserve };
    const gl = cv.getContext('webgl2', attrs) || cv.getContext('webgl', attrs);
    const gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    const ctl = { ok: false, key: null };
    const noop = () => {};
    if (!gl) return Object.assign(ctl, { load: async () => false, act: noop, pointer: noop, poke: noop, talk: noop, impulse: noop, anchor: () => null, hitHead: () => false, setIdle: noop, hide: noop, layout: noop, destroy: noop, dur: () => 0, glance: noop, gust: noop, head: () => null });

    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const U = {};
    ['uBone', 'uShift', 'uSphere', 'uSway', 'uWind', 'uLag', 'uLift', 'uSwayPow', 'uTime', 'uSquash', 'uLook', 'uMouth', 'uView', 'uAtlasAt', 'uAtlas', 'uTex', 'uAlpha', 'uClip', 'uGlow']
      .forEach((k) => (U[k] = gl.getUniformLocation(prog, k)));
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const tex = gl.createTexture();
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (!gl2) gl.getExtension('OES_element_index_uint');

    // visible 由 IntersectionObserver 给出（observe 之后一定会先回调一次当前状态）；在那之前不开逐帧循环
    let rig = null, layers = [], raf = 0, running = false, visible = false, hasImg = false;
    const t0 = performance.now();
    let lastT = 0;

    /* ---------------------------------------------------------- 加载 */
    async function load(key, base = 'assets/puppet/') {
      hasImg = false;
      ctl.ok = false;
      const url = base + key + '/';
      let r;
      try {
        const res = await fetch(url + 'rig.json', { cache: 'no-cache' });
        if (!res.ok) return false;
        r = await res.json();
      } catch (e) { return false; }
      // 图集：优先 createImageBitmap（在后台线程解码并预乘），主线程只剩一次贴图上传；
      // 不支持时退回 <img> 的 onload（不用 decode()：页面不绘制时它可能一直挂起）
      const atlasUrl = url + r.atlas + (r.v ? '?v=' + r.v : '');
      let src = null, bitmap = false;
      if (window.createImageBitmap) {
        try {
          const res2 = await fetch(atlasUrl);
          if (res2.ok) {
            src = await createImageBitmap(await res2.blob(), { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
            bitmap = true;
          }
        } catch (e) { src = null; }
      }
      if (!src) {
        const img = new Image();
        const ok = await new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false); img.src = atlasUrl; });
        if (!ok) return false;
        src = img;
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !bitmap);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      if (bitmap) src.close();
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (gl2) {
        // 立绘通常缩小显示：三线性 mipmap 让细线在动起来时不闪
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      layers.forEach((L) => { gl.deleteBuffer(L.vb); gl.deleteBuffer(L.ib); });
      rig = r;
      layers = r.layers.map((L) => buildLayer(L));
      ctl.key = key;
      initState();
      hasImg = true;
      ctl.ok = true;
      layout();
      draw(performance.now());
      start();
      return true;
    }

    function buildLayer(L) {
      const [x0, y0] = L.rect, s = L.step, cols = L.cols, rows = L.rows;
      const pos = [], idx = [], vid = new Map();
      const v = (q, r) => {
        const k = r * (cols + 1) + q;
        if (!vid.has(k)) { vid.set(k, pos.length / 2); pos.push(x0 + Math.min(q * s, L.rect[2]), y0 + Math.min(r * s, L.rect[3])); }
        return vid.get(k);
      };
      for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
        if (L.occ[r * cols + q] !== '1') continue;
        const a = v(q, r), b = v(q + 1, r), c = v(q, r + 1), d = v(q + 1, r + 1);
        idx.push(a, b, c, b, d, c);
      }
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      const big = pos.length / 2 > 65535;
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(idx) : new Uint16Array(idx), gl.STATIC_DRAW);
      const glow = L.glow ? { rgb: hexRgb(L.glow.color), amp: L.glow.amp ?? 0.25, freq: L.glow.freq ?? 0.6, phase: L.glow.phase ?? Math.random() * 6, cast: L.glow.cast ?? 0.6, base: L.glow.base ?? 0 } : null;
      return Object.assign({}, L, { vb, ib, n: idx.length, big, atAt: [L.at[0] - L.rect[0], L.at[1] - L.rect[1]], glowC: glow });
    }

    /* ---------------------------------------------------------- 状态 */
    let bones = {}, spr = {};
    let par = [0, 0], parT = [0, 0], gaze = [0, 0], gazeT = [0, 0], saccadeT = 1;
    let blinkT = 1.5, nextIdle = 5, active = [], autoIdle = true, poke = 0, pokeV = 0;
    const st = { blinkL: 0, blinkR: 0, happy: 0, talk: 0, sleepy: 0, cast: 0, blush: 0, surprise: 0 };
    let happyHold = 0, blushHold = 0, talkIn = 0, talkT = 0, idleClock = 0, pet = 0, lastPtr = null, impulse = [0, 0];
    // 更多的“活气”：阵风（发梢、飘带被吹起一阵）、鼠标停在脸旁边太久会害羞、连戳会生气、临时看向某处
    let gust = null, gustT = 6 + Math.random() * 6, stare = 0, shyCool = 0, pokes = [], glanceT = 0, glanceP = [0, 0], nearFace = false;
    function initState() {
      bones = rig.bones || {};
      spr = {};
      layers.forEach((L) => { if (L.sway) spr[L.id] = { x: 0, v: 0, ph: L.sway.phase ?? Math.random() * 6 }; });
      active = [];
      nextIdle = 4;
      idleClock = 0;
      blinkT = 1.5;
      happyHold = blushHold = talkIn = talkT = pet = poke = pokeV = 0;
      impulse = [0, 0];
      lastPtr = null;
      gust = null; gustT = 6 + Math.random() * 6; stare = 0; shyCool = 0; pokes = []; glanceT = 0;
      Object.keys(st).forEach((k) => (st[k] = 0));
    }
    const P = () => (rig && rig.params) || {};

    /*
     * 动作幅度：头、胸的相对转角受绑定限制（转多了图层之间会露缝，上限由各绑定的 params 给出），
     * 所以大动作按「整体 → 胸 → 头」分摊：整张图绕脚底（root）的倾斜、起跳、压扁拉伸永远不会露缝，
     * 叠加起来看到的幅度是单转头的两三倍。
     */
    // 幅度倍数（opts.amp，默认 1）：整体的倾斜 / 起跳 / 压扁按倍数放大（不会露缝）；
    // 头、胸的相对转角只跟着放大一小部分（J），免得超出绑定的安全范围
    let amp = opts.amp || 1;
    const J = () => 1 + (amp - 1) * 0.35;
    const TILT = () => (P().tilt ?? 0.04) * J(); // 头相对胸的转角
    const LEAN = () => (P().lean ?? (P().tilt ?? 0.04) * 2) * amp; // 整体倾斜（整张图一起转，不受露缝限制）
    const HOP = () => (P().hop ?? 12) * (P().hopScale ?? 2.6) * amp; // 起跳高度（坐着的绑定 hop=0，就不跳）
    /** 起跳曲线：蓄力下蹲 → 腾空（拉长）→ 落地压扁回弹；返回 { ty, sx, sy } 与是否刚落地 */
    function jumpCurve(k, h) {
      // 压扁拉伸也跟着幅度加大一些；params.squash 按绑定调（高个子的画可以压得轻一点）；不跳的绑定（hop=0，例如站在水里）默认也不压扁
      const q = Math.sqrt(amp) * (P().squash ?? ((P().hop ?? 12) === 0 ? 0 : 1));
      if (k < 0.18) { const c = Math.sin((k / 0.18) * Math.PI * 0.5); return { ty: 0, sy: -0.05 * q * c, sx: 0.025 * q * c }; }
      if (k < 0.7) { const u = (k - 0.18) / 0.52, a = Math.sin(Math.PI * u); return { ty: -h * a, sy: 0.035 * q * a * (1 - u), sx: -0.015 * q * a * (1 - u), air: a }; }
      const u = (k - 0.7) / 0.3, d = Math.exp(-5 * u) * Math.cos(u * Math.PI * 2.5);
      return { ty: 0, sy: -0.055 * q * d, sx: 0.028 * q * d, landed: true };
    }
    function applyJump(o, j) { o.root.ty += j.ty; o.root.sy += j.sy; o.root.sx += j.sx; }
    /** 动作：k 为 0..1 进度，o 为本帧姿势累加器，s 为方向 ±1，a 为这次动作的记录（放一次性标记） */
    const ACTS = {
      blink: { dur: 0.19, run(k, o) { const v = k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55; o.blinkL = Math.max(o.blinkL, v); o.blinkR = Math.max(o.blinkR, v); } },
      // 慢眨眼：放松时偶尔一次，闭上后稍停一下再睁开
      slowblink: { dur: 0.62, run(k, o) { const v = k < 0.3 ? smooth(k / 0.3) : k < 0.5 ? 1 : smooth((1 - k) / 0.5); o.blinkL = Math.max(o.blinkL, v); o.blinkR = Math.max(o.blinkR, v); o.head.ty += 1.2 * v; } },
      wink: { dur: 0.7, run(k, o, s) { const v = hold(k, 0.25); if (s > 0) o.blinkL = Math.max(o.blinkL, v); else o.blinkR = Math.max(o.blinkR, v); o.head.rot += 0.02 * s * v; o.smile = Math.max(o.smile, v); } },
      /*
       * 头部动作（歪头、点头、张望、摇头、害羞、思考、打招呼）只动头：身子不跟着扭。
       * 幅度来自各绑定验证过的头部安全转角（params.tilt，已按露缝上限放大过）。
       * 全身的倾斜、起跳只留给摇摆、律动、蹦跳、伸懒腰这类本来就是全身的动作。
       */
      tilt: { dur: 2.2, big: true, run(k, o, s) { const h = hold(k, 0.3); o.head.rot += TILT() * s * h; o.turn[0] += 0.35 * s * h; o.gaze[0] -= 0.3 * s * h; o.smile = Math.max(o.smile, 0.4 * h); } },
      nod: { dur: 1.3, big: true, run(k, o) { const v = Math.max(0, Math.sin(k * Math.PI * 2)) * (1 - k * 0.3); o.head.ty += (P().nod ?? 5) * 1.5 * v; o.turn[1] += 0.6 * v; o.smile = Math.max(o.smile, 0.5 * v); } },
      look: { dur: 3.0, big: true, run(k, o, s) { const h = hold(k, 0.2); o.turn[0] += 1.1 * s * h; o.head.rot += 0.012 * s * h; o.gaze[0] += 0.9 * s * h; } },
      // 摇摆：整张图左右晃（绕脚底），头往反方向找平衡
      sway: { dur: 3.6, big: true, run(k, o) { const e = Math.sin(Math.PI * k), w = Math.sin(k * Math.PI * 2); o.root.rot += LEAN() * 1.1 * w * e; o.body.rot += (P().sway ?? 0.01) * 1.5 * w * e; o.head.rot -= TILT() * 0.45 * w * e; o.turn[0] += 0.4 * w * e; } },
      hop: {
        dur: 0.95, big: true,
        run(k, o, s, a) {
          const j = jumpCurve(k, HOP());
          applyJump(o, j);
          o.head.rot += 0.01 * (j.air || 0);
          o.hopV = j.air || 0;
          if (j.landed && !a.kicked) { a.kicked = true; impulse = [impulse[0], clamp(impulse[1] + 7, -20, 20)]; } // 落地：发梢、飘带被甩一下
        },
      },
      // 蹦跳：连跳两下，第二下更高
      jump: {
        dur: 1.7, big: true,
        run(k, o, s, a) {
          const second = k >= 0.45, u = second ? (k - 0.45) / 0.55 : k / 0.45;
          const j = jumpCurve(u, HOP() * (second ? 1.25 : 0.8));
          applyJump(o, j);
          o.root.rot += LEAN() * 0.5 * s * (j.air || 0) * (second ? -1 : 1);
          o.happy = Math.max(o.happy, hold(k, 0.15));
          o.hopV = j.air || 0;
          const tag = second ? 'k2' : 'k1';
          if (j.landed && !a[tag]) { a[tag] = true; impulse = [impulse[0], clamp(impulse[1] + 7, -20, 20)]; }
        },
      },
      // 摇头：头左右转（带立体感的转动），像在说「不要」
      shake: { dur: 1.4, big: true, run(k, o) { const v = Math.sin(k * Math.PI * 6) * Math.pow(1 - k, 0.7) * hold(k, 0.1); o.turn[0] += 0.95 * v; o.head.rot += TILT() * 0.6 * v; o.gaze[0] -= 0.4 * v; o.blinkL = Math.max(o.blinkL, 0.35 * hold(k, 0.2)); o.blinkR = o.blinkL; } },
      // 偷笑：眯眼、脸红，肩膀一耸一耸
      giggle: {
        dur: 2.2, big: true,
        run(k, o) {
          const h = hold(k, 0.15), b = Math.abs(Math.sin(k * Math.PI * 7)) * h;
          o.happy = Math.max(o.happy, h); o.blush = Math.max(o.blush, 0.6 * h); o.smile = Math.max(o.smile, h);
          o.chest.ty += 2.5 * b; o.head.ty += 3 * b; o.root.sy -= 0.008 * b;
          o.head.rot += TILT() * 0.35 * Math.sin(k * Math.PI * 7) * h;
        },
      },
      // 害羞：脸红，视线往下躲开，头歪过去（只动头）
      shy: {
        dur: 3.2, big: true,
        run(k, o, s) {
          const h = hold(k, 0.25);
          o.blush = Math.max(o.blush, h); o.smile = Math.max(o.smile, 0.6 * h);
          o.gaze[0] -= 0.7 * s * h; o.gaze[1] += 0.6 * h;
          o.turn[0] -= 0.5 * s * h; o.turn[1] += 0.45 * h;
          o.head.rot += TILT() * 0.8 * s * h;
          o.blinkL = Math.max(o.blinkL, 0.3 * h); o.blinkR = o.blinkL;
        },
      },
      // 吃惊：原地一蹦，头往后一仰，然后眨两下眼
      surprise: {
        dur: 1.5, big: true,
        run(k, o) {
          const bump = Math.exp(-Math.pow((k - 0.1) / 0.07, 2));
          o.root.ty -= HOP() * 0.45 * bump; o.root.sy += 0.04 * bump; o.root.sx -= 0.02 * bump;
          o.head.ty -= 3 * bump; o.turn[1] -= 0.55 * hold(k, 0.12);
          o.gaze[1] -= 0.4 * hold(k, 0.12);
          const bl = (c) => Math.max(0, 1 - Math.abs(k - c) / 0.04);
          o.blinkL = Math.max(o.blinkL, bl(0.55), bl(0.68)); o.blinkR = o.blinkL;
        },
      },
      // 伸懒腰：整个人往上拉长、仰头、闭眼、张嘴打个哈欠，然后放松
      stretch: {
        dur: 3.4, big: true,
        run(k, o, s) {
          const u = k < 0.55 ? smooth(k / 0.4) : smooth((1 - k) / 0.45);
          o.root.sy += 0.035 * u; o.root.sx -= 0.012 * u; o.chest.sy += 0.01 * u;
          o.turn[1] -= 0.65 * u; o.head.rot += TILT() * 0.5 * s * u;
          o.blinkL = Math.max(o.blinkL, 0.95 * u); o.blinkR = o.blinkL;
          o.mouth = Math.max(o.mouth, 0.8 * Math.sin(Math.PI * clamp((k - 0.1) / 0.5, 0, 1))); // 哈欠
          if (k > 0.75) o.smile = Math.max(o.smile, smooth((k - 0.75) / 0.1) * hold(k, 0.1));
        },
      },
      // 律动：跟着节拍一颠一颠，左右晃，越跳越开心
      dance: {
        dur: 3.6, big: true,
        run(k, o, s) {
          const e = hold(k, 0.12), T = k * 3.6;
          const beat = Math.max(0, Math.sin(T * Math.PI * 4));
          o.root.ty -= HOP() * 0.28 * Math.pow(beat, 1.5) * e; o.root.sy -= 0.02 * (1 - beat) * e;
          o.root.rot += LEAN() * 0.9 * s * Math.sin(T * Math.PI * 2) * e;
          o.head.rot -= TILT() * 0.7 * s * Math.sin(T * Math.PI * 2 + 0.6) * e;
          o.turn[0] += 0.45 * s * Math.sin(T * Math.PI * 2) * e;
          o.happy = Math.max(o.happy, smooth((k - 0.3) / 0.2) * e); o.smile = Math.max(o.smile, e);
        },
      },
      // 挥手：需要绑定把手臂单独切出来（params.waveArm 上臂骨骼、waveFore 前臂骨骼）；没有就不出现在动作栏里
      wave: {
        dur: 2.4, big: true,
        run(k, o, s) {
          const h = hold(k, 0.16), up = P().waveArm, fore = P().waveFore;
          if (up) o.bone(up).rot += (P().waveRot ?? -0.6) * h;
          if (fore) o.bone(fore).rot += (P().waveSwing ?? 0.35) * Math.sin(k * Math.PI * 8) * h;
          o.smile = Math.max(o.smile, h);
          o.head.rot += TILT() * 0.4 * s * h;
        },
      },
      // 思考：眼睛往上瞟，头歪着
      think: { dur: 3.0, big: true, run(k, o, s) { const h = hold(k, 0.25); o.gaze[0] -= 0.55 * s * h; o.gaze[1] -= 0.85 * h; o.turn[0] -= 0.35 * s * h; o.turn[1] -= 0.35 * h; o.head.rot += TILT() * 0.7 * s * h; } },
      smile: { dur: 2.2, run(k, o) { const h = hold(k, 0.2); o.happy = Math.max(o.happy, h); o.blush = Math.max(o.blush, h * 0.8); o.head.rot += 0.02 * h; } },
      cast: {
        dur: 3.0, big: true,
        run(k, o) {
          const h = hold(k, 0.22);
          const arm = P().castArm;
          if (arm) o.bone(arm).rot += (P().castRot ?? -0.1) * h;
          o.head.rot -= 0.015 * h;
          o.turn[1] -= 0.4 * h;
          o.cast = Math.max(o.cast, h * (0.5 + 0.5 * Math.sin(k * Math.PI)));
          o.blinkL = Math.max(o.blinkL, 0.9 * hold(clamp((k - 0.25) / 0.35, 0, 1), 0.3));
          o.blinkR = o.blinkL;
        },
      },
      // 挥杖：法杖绕握点（params.staffBone 的 pivot）先后引、再猛地挥出，阻尼回弹后归位；
      // 身体跟着拧一下，挥出的瞬间给飘带 / 头发一记冲量。没有法杖骨骼的绑定只做身体部分
      swing: {
        dur: 1.7, big: true,
        run(k, o, s, a) {
          let v;
          if (k < 0.22) v = -0.4 * (0.5 - 0.5 * Math.cos((k / 0.22) * Math.PI));
          else if (k < 0.4) v = -0.4 + 1.4 * (1 - Math.pow(1 - (k - 0.22) / 0.18, 3));
          else { const u = (k - 0.4) / 0.6; v = Math.exp(-3.5 * u) * (1 - u) * Math.cos(u * Math.PI * 2.6); }
          const bone = P().staffBone;
          if (bone) o.bone(bone).rot += (P().swingRot ?? 0.16) * s * v; // 挥开露出的面积大，只用绑定自己验证过的幅度
          o.body.rot += (P().sway ?? 0.01) * 0.9 * s * v;
          o.head.rot += 0.012 * s * v;
          o.turn[0] += 0.35 * s * v;
          const peak = Math.exp(-Math.pow((k - 0.4) / 0.12, 2));
          o.cast = Math.max(o.cast, 0.7 * peak);
          o.smile = Math.max(o.smile, peak);
          if (!a.kicked && k > 0.3) { a.kicked = true; impulse = [clamp(impulse[0] + 9 * s, -20, 20), clamp(impulse[1] - 3, -20, 20)]; }
        },
      },
    };
    /** auto：她自己做的（眨眼、闲着时的小动作）——不算有人理她，不重置“多久没人理”的计时（否则永远不会打盹） */
    function act(name, sign, auto) {
      const a = ACTS[name];
      if (!a || !rig) return;
      if (a.big) active = active.filter((x) => !ACTS[x.name].big);
      active.push({ name, t: 0, s: sign ?? (Math.random() < 0.5 ? -1 : 1), auto: !!auto });
      if (a.big) nextIdle = 7 + Math.random() * 5;
      if (!auto) wake();
      start();
    }
    /** 从打盹中醒来：先惊一下，再眨两下眼 */
    function wake() {
      if (st.sleepy > 0.4) {
        st.surprise = 1;
        setTimeout(() => act('blink'), 180);
        setTimeout(() => act('blink'), 420);
      }
      idleClock = 0;
    }

    function frameState(t, dt) {
      const o = {
        blinkL: 0, blinkR: 0, happy: 0, smile: 0, blush: 0, cast: 0, mouth: 0, turn: [0, 0], gaze: [0, 0], hopV: 0,
        root: { rot: 0, tx: 0, ty: 0, sx: 1, sy: 1 }, extra: {},
      };
      const B = (name) => o.extra[name] || (o.extra[name] = { rot: 0, tx: 0, ty: 0, sx: 1, sy: 1 });
      o.bone = B;
      o.body = B(P().bodyBone || 'body');
      o.chest = B(P().chestBone || 'chest');
      o.head = B(P().headBone || 'head');
      // 骨骼自带的待机摆动：bones[name].idle = { rot, tx, ty, freq, phase }
      for (const name in bones) {
        const id = bones[name].idle;
        if (!id) continue;
        const e = B(name), w = t * (id.freq ?? 1) * Math.PI * 2 + (id.phase ?? 0);
        e.rot += (id.rot || 0) * Math.sin(w) + (id.spin || 0) * t;
        e.tx += (id.tx || 0) * Math.sin(w * 0.9 + 1.3);
        e.ty += (id.ty || 0) * Math.sin(w + 0.6);
      }
      // 呼吸
      const br = Math.sin(t * 1.55);
      o.chest.sy += (P().breath ?? 0.004) * br;
      o.chest.ty -= (P().breathLift ?? 0.8) * br;
      o.head.ty -= (P().breathLift ?? 0.8) * 0.8 * br;
      // 细微的待机摆动
      o.head.rot += Math.sin(t * 0.7) * 0.004;
      o.body.rot += Math.sin(t * 0.45 + 1) * 0.0015;
      o.turn[0] += Math.sin(t * 0.33) * 0.1;
      // 重心：整张图绕脚底极慢地左右挪一点（整体转动不会露缝），站久了的人都会这样
      o.root.rot += (Math.sin(t * 0.23 + 0.7) * 0.7 + Math.sin(t * 0.61) * 0.3) * 0.0032 * Math.min(amp, 1.5) * (P().hop === 0 ? 0.5 : 1);
      // 阵风：隔一阵子吹来一下，发梢、飘带、衣摆被推开再弹回来；她会微微眯眼
      if (autoIdle) gustT -= dt;
      if (gustT <= 0) {
        gust = { t: 0, dur: 1 + Math.random() * 0.9, dir: Math.random() < 0.5 ? -1 : 1, amp: (P().gust ?? 1) * (2 + Math.random() * 2.2) };
        gustT = 9 + Math.random() * 11;
      }
      if (gust) {
        gust.t += dt;
        const k = gust.t / gust.dur;
        if (k >= 1) gust = null;
        else {
          const f = Math.sin(Math.PI * k) * (1 - 0.3 * Math.sin(Math.PI * 6 * k) * Math.sin(Math.PI * k));
          impulse = [clamp(impulse[0] + gust.dir * gust.amp * f * dt * 6, -20, 20), clamp(impulse[1] - gust.amp * 0.3 * f * dt * 6, -20, 20)];
          o.blinkL = Math.max(o.blinkL, 0.2 * f); o.blinkR = Math.max(o.blinkR, 0.2 * f);
          o.head.rot -= gust.dir * 0.006 * f;
        }
      }
      // 鼠标：头慢慢转过去，眼睛先看过去
      par[0] += (parT[0] - par[0]) * Math.min(1, dt * 3);
      par[1] += (parT[1] - par[1]) * Math.min(1, dt * 3);
      o.turn[0] += par[0] * 0.55;
      o.turn[1] += par[1] * 0.35;
      o.head.rot += par[0] * 0.008;
      // 视线：跟随鼠标，偶尔扫视
      saccadeT -= dt;
      if (saccadeT <= 0) {
        saccadeT = 0.6 + Math.random() * 2.2;
        const idle = idleClock > 3;
        gazeT = [clamp(parT[0] * 1.3 + (idle ? (Math.random() - 0.5) * 0.9 : (Math.random() - 0.5) * 0.15), -1, 1), clamp(parT[1] * 1.1 + (idle ? (Math.random() - 0.5) * 0.5 : 0), -1, 1)];
      } else if (idleClock < 3) {
        gazeT = [clamp(parT[0] * 1.3, -1, 1), clamp(parT[1] * 1.1, -1, 1)];
      }
      // 临时看向某处（例如鼠标悬停的动作按钮）：眼睛先过去，头跟一点
      if (glanceT > 0) {
        glanceT -= dt;
        const w = smooth(Math.min(1, glanceT / 0.25));
        gazeT = [glanceP[0], glanceP[1]];
        saccadeT = Math.max(saccadeT, 0.3);
        o.turn[0] += glanceP[0] * 0.35 * w; o.turn[1] += glanceP[1] * 0.3 * w;
      }
      gaze[0] += (gazeT[0] - gaze[0]) * Math.min(1, dt * 14);
      gaze[1] += (gazeT[1] - gaze[1]) * Math.min(1, dt * 14);
      o.gaze[0] += gaze[0];
      o.gaze[1] += gaze[1];

      idleClock += dt;
      if (autoIdle) {
        blinkT -= dt;
        if (blinkT <= 0) {
          // 眨眼有变化：多数是一下，偶尔连眨两下，偶尔慢慢地眨一次
          const r = Math.random();
          if (r < 0.1 || (st.sleepy > 0.2 && r < 0.5)) act('slowblink', undefined, true);
          else { act('blink', undefined, true); if (r > 0.82) setTimeout(() => act('blink', undefined, true), 260); }
          blinkT = 2.2 + Math.random() * 3.8;
        }
        nextIdle -= dt;
        if (nextIdle <= 0 && st.sleepy < 0.3) {
          const pool = ['tilt', 'nod', 'look', 'sway', 'look', 'tilt', 'think', 'giggle', 'shy', 'tilt', 'look'];
          if (P().staffBone) pool.push('swing'); // 有法杖骨骼的绑定偶尔自己挥一下
          if (idleClock > 20) pool.push('stretch'); // 很久没人理她：伸个懒腰
          if (HOP() > 0) pool.push('dance');
          act(pool[(Math.random() * pool.length) | 0], undefined, true);
          nextIdle = 6 + Math.random() * 7;
        }
      }
      // 鼠标停在她脸旁边不走：先是脸慢慢红起来，盯久了就害羞地别过脸去（之后一阵子不再重复）
      shyCool = Math.max(0, shyCool - dt);
      stare = nearFace && st.sleepy < 0.2 ? stare + dt : Math.max(0, stare - dt * 1.5);
      if (stare > 1.3) o.blush = Math.max(o.blush, 0.75 * smooth((stare - 1.3) / 1.4));
      if (stare > 3.6 && shyCool <= 0) { act('shy', undefined, true); shyCool = 22; stare = 0; }
      for (let i = active.length - 1; i >= 0; i--) {
        const a = active[i];
        a.t += dt;
        const k = a.t / ACTS[a.name].dur;
        if (k >= 1) { active.splice(i, 1); continue; }
        ACTS[a.name].run(k, o, a.s, a);
      }

      // 打盹：长时间没人理她，眼皮半垂、头一点一点
      const doze = autoIdle && (opts.doze ?? true) && idleClock > (P().dozeAfter ?? 40);
      st.sleepy += ((doze ? 1 : 0) - st.sleepy) * Math.min(1, dt * (doze ? 0.35 : 3));
      if (st.sleepy > 0.01) {
        const nodT = t * 0.5;
        const dip = Math.pow(Math.max(0, Math.sin(nodT)), 6);
        o.head.ty += (P().nod ?? 5) * 1.4 * dip * st.sleepy;
        o.turn[1] += 0.6 * dip * st.sleepy;
        o.blinkL = Math.max(o.blinkL, st.sleepy * (0.55 + 0.4 * dip));
        o.blinkR = Math.max(o.blinkR, st.sleepy * (0.55 + 0.4 * dip));
        o.gaze[1] += 0.5 * st.sleepy;
      }
      // 惊醒
      if (st.surprise > 0.01) {
        o.root.ty -= 6 * st.surprise * st.surprise;
        o.head.rot += 0.02 * st.surprise;
        st.surprise = Math.max(0, st.surprise - dt * 2.5);
      }
      // 摸头：在头上来回划动，她会眯起眼睛、脸红、往手上蹭
      pet = Math.max(0, pet - dt * 0.9);
      const petting = smooth((pet - 0.6) / 1.2);
      if (petting > 0) {
        o.happy = Math.max(o.happy, petting);
        o.blush = Math.max(o.blush, petting);
        o.head.rot += 0.03 * petting * Math.sin(t * 2.2);
        o.head.ty += 2 * petting;
      }
      happyHold = Math.max(0, happyHold - dt);
      blushHold = Math.max(0, blushHold - dt);
      if (happyHold > 0) o.happy = Math.max(o.happy, smooth(happyHold / 0.3));
      if (blushHold > 0) o.blush = Math.max(o.blush, smooth(blushHold / 0.6));
      // 说话：外部每帧给出音量；没有时嘴巴合上
      talkT = Math.max(0, talkT - dt);
      const talkTarget = Math.max(talkT > 0 ? talkIn : 0, o.mouth); // o.mouth：动作里张嘴（打哈欠）
      st.talk += (talkTarget - st.talk) * Math.min(1, dt * 22);
      // 状态平滑
      const ease = (k, v, sp) => (st[k] += (v - st[k]) * Math.min(1, dt * sp));
      st.blinkL = o.blinkL;
      st.blinkR = o.blinkR;
      ease('happy', o.happy, 10);
      ease('blush', o.blush, 4);
      ease('cast', o.cast, 8);
      o.state = {
        blinkL: st.blinkL, blinkR: st.blinkR, blink: Math.max(st.blinkL, st.blinkR),
        happy: st.happy, talk: st.talk, sleepy: st.sleepy, cast: st.cast, blush: st.blush, smile: o.smile,
      };
      // 戳一下：整体弹一下；滚动 / 冲量：发梢被带动
      pokeV += -poke * 0.35 - pokeV * 0.2;
      poke += pokeV;
      o.root.sy += poke * 0.5;
      o.root.sx -= poke * 0.25;
      o.impulse = impulse;
      impulse = [impulse[0] * Math.max(0, 1 - dt * 6), impulse[1] * Math.max(0, 1 - dt * 6)];
      // 带画框的场景图（params.rootIsScene）：整体倾斜、起跳、压扁只作用在人物身上（bodyBone），画框和场景不动
      if (P().rootIsScene) {
        const b = o.body, r = o.root;
        b.rot += r.rot; b.tx += r.tx; b.ty += r.ty; b.sx *= r.sx; b.sy *= r.sy;
        r.rot = 0; r.tx = 0; r.ty = 0; r.sx = 1; r.sy = 1;
      }
      o.turn[0] = clamp(o.turn[0], -1.2, 1.2);
      o.turn[1] = clamp(o.turn[1], -1, 1);
      o.gaze[0] = clamp(o.gaze[0], -1, 1);
      o.gaze[1] = clamp(o.gaze[1], -1, 1);
      return o;
    }

    /** 骨骼世界矩阵 */
    function boneMats(o) {
      const out = {};
      const rp = (bones.root && bones.root.pivot) || [rig.w / 2, rig.h];
      out.root = M.local(rp[0], rp[1], o.root.rot, o.root.sx, o.root.sy, o.root.tx, o.root.ty);
      const get = (name) => {
        if (out[name]) return out[name];
        const b = bones[name];
        if (!b) return out.root;
        const e = o.extra[name] || { rot: 0, tx: 0, ty: 0, sx: 1, sy: 1 };
        const loc = M.local(b.pivot[0], b.pivot[1], e.rot, e.sx, e.sy, e.tx, e.ty);
        return (out[name] = M.mul(get(b.parent || 'root'), loc));
      };
      Object.keys(bones).forEach(get);
      return { get };
    }
    function boneRot(o, name) {
      let a = 0, n = name, guard = 0;
      while (n && n !== 'root' && guard++ < 16) {
        a += (o.extra[n] && o.extra[n].rot) || 0;
        n = bones[n] ? bones[n].parent : null;
      }
      return a + o.root.rot;
    }
    /** 图层按状态显示 / 隐藏：show / hide 可为状态名，或 { state, lo, hi } */
    function stateAlpha(spec, s, dflt) {
      if (!spec) return dflt;
      const o = typeof spec === 'string' ? { state: spec } : spec;
      const v = s[o.state] ?? 0;
      const lo = o.lo ?? (o.state.startsWith('blink') ? 0.5 : 0);
      const hi = o.hi ?? (o.state.startsWith('blink') ? 0.9 : 1);
      return smooth((v - lo) / Math.max(1e-3, hi - lo));
    }

    /* ---------------------------------------------------------- 绘制 */
    let view = [1, 1, 0, 0], lastO = null, lastBm = null, region = opts.region || null;
    /** 显示区域（原画坐标），默认整张图 */
    const R = () => region || [0, 0, rig.w, rig.h];
    /** 画布实际覆盖的区域：原画四周各留出 opts.pad（比例）的余量，整体跳起、倾斜时不会被画布边缘切掉 */
    const RP = () => {
      const [x0, y0, x1, y1] = R();
      const p = region ? 0 : opts.pad || 0, px = (x1 - x0) * p, py = (y1 - y0) * p;
      return [x0 - px, y0 - py, x1 + px, y1 + py];
    };
    function layout() {
      const W0 = host.clientWidth, H0 = host.clientHeight;
      if (!rig || !W0) return;
      // 按原画区域算缩放（原画在宿主里的大小不变），画布再向四周多铺出余量
      const [x0, y0, x1, y1] = R();
      const rw = x1 - x0, rh = y1 - y0;
      const s = Math.min(W0 / rw, H0 / rh);
      const [X0, Y0, X1, Y1] = RP();
      const RW = X1 - X0, RH = Y1 - Y0;
      const w = RW * s, h = RH * s;
      const dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2);
      cv.style.left = (W0 - rw * s) / 2 - (x0 - X0) * s + 'px';
      cv.style.top = (H0 - rh * s) / 2 - (y0 - Y0) * s + 'px';
      cv.style.width = w + 'px';
      cv.style.height = h + 'px';
      const PW = Math.round(w * dpr), PH = Math.round(h * dpr);
      if (cv.width !== PW || cv.height !== PH) { cv.width = PW; cv.height = PH; }
      gl.viewport(0, 0, PW, PH);
      view = [2 / RW, -2 / RH, -1 - (2 * X0) / RW, 1 + (2 * Y0) / RH];
    }
    function draw(now) {
      if (!hasImg) return;
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, Math.max(0, t - lastT));
      lastT = t;
      const o = frameState(t, dt);
      const bm = boneMats(o);
      lastO = o;
      lastBm = bm;
      const S = o.state;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniform4f(U.uView, ...view);
      gl.uniform2f(U.uAtlas, rig.atlasW, rig.atlasH);
      gl.uniform1f(U.uTime, t);
      gl.uniform1i(U.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const turnPx = P().turnPx ?? 6, turnPxY = P().turnPxY ?? 3;
      const sphere = P().sphere || null;
      for (const L of layers) {
        // 状态显隐
        let alpha = 1;
        const eyeBlink = L.eye === 'L' ? S.blinkL : L.eye === 'R' ? S.blinkR : S.blink;
        if (L.squash) alpha *= 1 - smooth((eyeBlink - 0.6) / 0.35);
        if (L.show) alpha *= stateAlpha(L.show, S, 1);
        if (L.hide) alpha *= 1 - stateAlpha(L.hide, S, 0);
        if (alpha <= 0.002) continue;

        const b = L.bone || 'root';
        gl.uniformMatrix3fv(U.uBone, false, bm.get(b));
        // 视差：depth ∈ [−1, 1]
        const d = L.depth || 0, dp = L.depthBody || 0;
        gl.uniform2f(U.uShift, d * o.turn[0] * turnPx + dp * o.turn[0] * turnPx * 0.4, d * o.turn[1] * turnPxY);
        const sp = L.sphere === false ? null : (Array.isArray(L.sphere) ? L.sphere : (L.sphere || (sphere && b === (P().headBone || 'head') && d > 0) ? sphere : null));
        if (sp) gl.uniform4f(U.uSphere, sp[0], sp[1], sp[2], sp[3] ?? sp[2]);
        else gl.uniform4f(U.uSphere, 0, 0, 0, 0);
        // 摆动
        if (L.sway) {
          const Sw = L.sway, s2 = spr[L.id];
          const amp = (Sw.amp ?? 1) * (P().swayPx ?? 6) * (Sw.side ?? 1);
          const len = Math.hypot(Sw.dir[0], Sw.dir[1]);
          const drive = (boneRot(o, b) * len + d * o.turn[0] * turnPx) * (Sw.follow ?? 1);
          // 冲量（滚动、摸头）沿垂直方向推一下；竖直的冲量让左右两侧的发束各自向外甩
          const px = -Sw.dir[1] / len, py = Sw.dir[0] / len;
          const hx = (bones[P().headBone || 'head'] || { pivot: [rig.w / 2] }).pivot[0];
          const out = Math.sign(Sw.root[0] - hx) || 1;
          const lat = o.impulse[1] * 0.6 * out * Math.sign(px || 1);
          s2.v += (o.impulse[0] * px + o.impulse[1] * py + lat) * (Sw.kick ?? 1) * dt * 60;
          s2.v += (-(s2.x - drive) * (Sw.stiff ?? 30) - s2.v * (Sw.damp ?? 5)) * dt;
          s2.x += s2.v * dt;
          gl.uniform4f(U.uSway, Sw.root[0], Sw.root[1], Sw.dir[0], Sw.dir[1]);
          gl.uniform4f(U.uWind, amp, Sw.freq ?? 1.1, s2.ph, Sw.wave ?? 0);
          gl.uniform1f(U.uLag, (s2.x - drive) * (Sw.lag ?? 0.7));
          gl.uniform1f(U.uLift, o.hopV * (Sw.lift ?? 0));
          gl.uniform1f(U.uSwayPow, Sw.pow ?? 1.6);
        } else {
          gl.uniform4f(U.uSway, 0, 0, 0, 0);
          gl.uniform4f(U.uWind, 0, 0, 0, 0);
          gl.uniform1f(U.uLag, 0);
          gl.uniform1f(U.uLift, 0);
          gl.uniform1f(U.uSwayPow, 1);
        }
        if (L.squash) gl.uniform3f(U.uSquash, eyeBlink * (L.squash.amount ?? 0.85), L.squash.pivotY, 1);
        else gl.uniform3f(U.uSquash, 0, 0, 0);
        // 虹膜跟随视线（被眼眶裁剪）
        if (L.look) {
          const a = L.look.amp || [4, 2.5];
          gl.uniform2f(U.uLook, o.gaze[0] * a[0], o.gaze[1] * a[1]);
          const c = L.look.clip;
          if (c) gl.uniform4f(U.uClip, c[0], c[1], c[2], c[3] ?? c[2]);
          else gl.uniform4f(U.uClip, 0, 0, 0, 0);
        } else {
          gl.uniform2f(U.uLook, 0, 0);
          if (L.clip) gl.uniform4f(U.uClip, L.clip[0], L.clip[1], L.clip[2], L.clip[3] ?? L.clip[2]);
          else gl.uniform4f(U.uClip, 0, 0, 0, 0);
        }
        // 张嘴：按说话音量纵向展开
        if (L.mouth) gl.uniform4f(U.uMouth, S.talk, L.mouth.pivotY, L.mouth.min ?? 0.25, 1);
        else gl.uniform4f(U.uMouth, 0, 0, 0, 0);
        // 发光：自身节奏 + 施法时增强
        if (L.glowC) {
          const g = L.glowC;
          const k = g.base + g.amp * (0.5 + 0.5 * Math.sin(t * g.freq * Math.PI * 2 + g.phase)) + g.cast * S.cast;
          gl.uniform4f(U.uGlow, g.rgb[0], g.rgb[1], g.rgb[2], k);
        } else gl.uniform4f(U.uGlow, 0, 0, 0, 0);
        gl.uniform2f(U.uAtlasAt, L.atAt[0], L.atAt[1]);
        gl.uniform1f(U.uAlpha, alpha);
        gl.bindBuffer(gl.ARRAY_BUFFER, L.vb);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, L.ib);
        gl.drawElements(gl.TRIANGLES, L.n, L.big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
      }
    }

    // 60 帧封顶：高刷显示器上不必跟着 144/165 Hz 重绘。
    // 只是在呼吸、发梢随风轻摆（没有动作、鼠标 2.5 秒没动、没在说话、没有冲量）时降到 30 帧：
    // 这些都是缓慢的正弦运动，30 帧看不出差别，显卡的活却少了一半；一有动静立刻回到 60 帧
    let lastFrame = 0, lastInput = 0;
    const FRAME = 1000 / (opts.fps || 60) - 1.5, IDLE_FRAME = 1000 / (opts.idleFps || 30) - 1.5;
    let paused = false;
    // 快的动作（眨眼、蹦跳、摇头……）30 帧会显得一顿一顿；她自己慢悠悠做的歪头、张望、摇摆 30 帧就够
    const FAST = new Set(['blink', 'slowblink', 'wink', 'hop', 'jump', 'surprise', 'shake', 'swing', 'dance', 'giggle']);
    function busy(now) {
      return active.some((a) => !a.auto || FAST.has(a.name)) || now - lastInput < 2500 || talkT > 0 || glanceT > 0 || pet > 0.05 || st.surprise > 0.01
        || Math.abs(impulse[0]) + Math.abs(impulse[1]) > 0.25 || Math.abs(pokeV) + Math.abs(poke) > 1e-4 || st.happy > 0.02 && st.happy < 0.98;
    }
    function frame(now) {
      raf = 0;
      if (!hasImg || !visible || paused || document.hidden) { running = false; return; }
      raf = requestAnimationFrame(frame);
      if (now - lastFrame < (busy(now) ? FRAME : IDLE_FRAME)) return;
      lastFrame = now;
      draw(now);
    }
    /**
     * 逐帧循环只在“看得见”时存在：宿主在视口里、没有暂停、标签页在前台。
     * 鼠标移动、说话口型、冲量等都会调用 start()——看不见时它什么也不做（以前每次都会白白请求一帧），
     * 离开视口 / 切到后台时直接取消已经排上的那一帧；回来时由 IntersectionObserver / visibilitychange 重新开始
     */
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; running = false; }
    function start() { if (!running && hasImg && visible && !paused && !document.hidden) { running = true; lastFrame = 0; raf = requestAnimationFrame(frame); } }
    // 一次回调里可能有同一目标的多条记录（快速滚过时），以最后一条为准
    const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) start(); else stop(); });
    io.observe(host);
    const ro = new ResizeObserver(() => { layout(); if (hasImg && visible && !paused) draw(performance.now()); });
    ro.observe(host);
    const onVis = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener('visibilitychange', onVis);

    /** 原画坐标 → 页面坐标 */
    function toClient(bone, x, y) {
      if (!rig || !lastBm) return null;
      const [ix, iy] = M.apply(lastBm.get(bone || 'root'), x, y);
      const r = cv.getBoundingClientRect();
      const [x0, y0, x1, y1] = RP();
      return [r.left + ((ix - x0) / (x1 - x0)) * r.width, r.top + ((iy - y0) / (y1 - y0)) * r.height];
    }

    // 用属性描述符合并（Object.assign 会立刻调用 getter，把 state 冻结成创建时的值）
    Object.defineProperties(ctl, Object.getOwnPropertyDescriptors({
      load, act, layout,
      /** 动作时长（秒）：动作栏按钮上的进度条用 */
      dur(name) { return ACTS[name] ? ACTS[name].dur : 0; },
      setIdle(on) { autoIdle = on; },
      /** 页面鼠标位置：转头 / 视线；在头上来回划动算“摸头” */
      pointer(x, y) {
        const r = cv.getBoundingClientRect();
        if (!r.width || !rig) return;
        lastInput = performance.now();
        const hp = P().headHit;
        parT = [clamp((x - (r.left + r.width / 2)) / (innerWidth * 0.5), -1, 1), clamp((y - (r.top + r.height * 0.3)) / (innerHeight * 0.5), -1, 1)];
        nearFace = false;
        if (hp) {
          const c = toClient(P().headBone || 'head', hp[0], hp[1]);
          const rr = (hp[2] / (RP()[2] - RP()[0])) * r.width; // 画布四周多铺了 pad，按实际覆盖的原画宽度换算
          const d = c ? Math.hypot(x - c[0], y - c[1]) : 1e9;
          if (lastPtr && d < rr) pet = Math.min(3, pet + Math.hypot(x - lastPtr[0], y - lastPtr[1]) / (rr * 1.2));
          nearFace = d < rr * 1.9;
        }
        // 鼠标从她身前快速划过：带起一阵风，发梢和飘带跟着飘（每次最多推一点，快速来回划才明显）
        if (lastPtr && x > r.left && x < r.right && y > r.top && y < r.bottom) {
          const dx = x - lastPtr[0], dy = y - lastPtr[1];
          const sp = Math.hypot(dx, dy);
          if (sp > 12) {
            const k = Math.min(1.6, sp * 0.03) / sp;
            impulse = [clamp(impulse[0] + dx * k, -20, 20), clamp(impulse[1] + dy * k * 0.5, -20, 20)];
          }
        }
        lastPtr = [x, y];
        if (st.sleepy > 0.4) wake();
        idleClock = 0;
        start();
      },
      /** 戳一下：戳头会开心地眯眼（偶尔眨单眼），戳身体会跳一下 */
      poke(x, y, strength = 1) {
        pokeV -= 0.012 * strength;
        wake();
        // 连戳：第三下吓一跳、接着摇头；戳到第五下就害羞地别过脸去
        const now = performance.now();
        pokes = pokes.filter((t) => now - t < 2600);
        pokes.push(now);
        let mood = 'poke';
        if (pokes.length >= 5) { pokes = []; act('shy'); blushHold = 3; mood = 'shy'; }
        else if (pokes.length === 3) { act('surprise'); setTimeout(() => act('shake'), 1100); mood = 'annoyed'; }
        else if (x != null && ctl.hitHead(x, y)) {
          if (Math.random() < 0.3) act('wink'); else act('smile');
          mood = 'head';
        } else act('hop');
        start();
        return mood;
      },
      /** 临时看向页面上的某一点（秒）：眼睛先过去，头跟一点 */
      glance(x, y, sec = 1.2) {
        const r = cv.getBoundingClientRect();
        if (!r.width || !rig) return;
        glanceP = [clamp((x - (r.left + r.width / 2)) / (innerWidth * 0.3), -1, 1), clamp((y - (r.top + r.height * 0.3)) / (innerHeight * 0.3), -1, 1)];
        glanceT = sec;
        start();
      },
      /** 来一阵风（dir ±1，amp 约 2–5） */
      gust(dir, amp) { gust = { t: 0, dur: 1.2, dir: dir || (Math.random() < 0.5 ? -1 : 1), amp: amp || 3.5 }; gustT = 9 + Math.random() * 11; start(); },
      hitHead(x, y) {
        const hp = P().headHit;
        if (!hp || !rig) return false;
        const r = cv.getBoundingClientRect();
        const c = toClient(P().headBone || 'head', hp[0], hp[1]);
        return !!c && Math.hypot(x - c[0], y - c[1]) < (hp[2] / (RP()[2] - RP()[0])) * r.width;
      },
      /** 只显示原画的某个区域（调试放大用），null 为整张图 */
      setRegion(r) { region = r; layout(); },
      /** 回到初始状态（不重新加载图集） */
      reset() { if (rig) initState(); },
      /** 暂停 / 恢复绘制（隐藏待命的实例不占显卡） */
      pause(on) { paused = !!on; cv.style.visibility = on ? 'hidden' : ''; if (on) stop(); else { layout(); start(); } },
      /** 把画布移到新的宿主元素里（区块重绘时复用 WebGL 上下文，不必销毁重建） */
      attach(el) {
        if (!el || el === host) return;
        io.unobserve(host); ro.unobserve(host);
        host = el;
        host.appendChild(cv);
        io.observe(host); ro.observe(host);
        layout();
        if (hasImg) draw(performance.now());
      },
      /** 说话音量 0..1（每帧调用；停止调用后嘴巴自然合上） */
      talk(level) { talkIn = clamp(level, 0, 1); talkT = 0.12; idleClock = 0; lastInput = performance.now(); start(); },
      /** 冲量（像素 / 帧量级）：页面滚动、快速划过时带动发梢 */
      impulse(dx, dy) { impulse = [clamp(impulse[0] + dx, -20, 20), clamp(impulse[1] + dy, -20, 20)]; lastInput = performance.now(); start(); },
      /** 动作幅度倍数（1 = 绑定原始幅度） */
      setAmp(k) { amp = clamp(+k || 1, 0.5, 3); },
      /** 某个锚点（rig.anchors）当前在页面上的位置 */
      anchor(name) { const a = rig && rig.anchors && rig.anchors[name]; return a ? toClient(a.bone, a.p[0], a.p[1]) : null; },
      /** 头部命中圆的圆心当前在页面上的位置（打盹的“z”、气泡从这里冒出来） */
      head() { const hp = P().headHit; return hp ? toClient(P().headBone || 'head', hp[0], hp[1]) : null; },
      hide() { hasImg = false; stop(); },
      get state() { return lastO && lastO.state; },
      /** 调试 / 截图：固定步长模拟 t 秒（可指定动作），然后绘制一帧 */
      simulate(t, name, sign) {
        autoIdle = false;
        if (name && ACTS[name]) act(name, sign);
        else if (name === 'talk') talkIn = 0.9;
        else if (name === 'happy') happyHold = 99;
        else if (name === 'sleepy') { autoIdle = true; idleClock = 999; blinkT = 999; nextIdle = 999; }
        else if (name === 'pet') pet = 3;
        const n = Math.round(t * 60);
        let now = performance.now();
        for (let i = 0; i < n; i++) {
          now += 1000 / 60;
          if (name === 'talk') { talkIn = 0.5 + 0.5 * Math.sin(i * 0.9); talkT = 1; }
          if (name === 'pet') pet = 3;
          lastT = (now - t0) / 1000 - 1 / 60;
          draw(now);
        }
      },
      setPointer(px, py) { par = [px, py]; parT = [px, py]; gaze = [clamp(px * 1.3, -1, 1), clamp(py * 1.1, -1, 1)]; gazeT = gaze.slice(); saccadeT = 99; },
      happy(sec = 1.6) { happyHold = sec; start(); },
      blush(sec = 2) { blushHold = sec; start(); },
      destroy() {
        hasImg = false;
        io.disconnect(); ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        stop();
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        cv.remove();
      },
    }));
    Object.defineProperty(ctl, 'rig', { get: () => rig });
    return ctl;
  }

  return { create };
})();
