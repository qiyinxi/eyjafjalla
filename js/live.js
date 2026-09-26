/* =========================================================
 * 「活」立绘：在 WebGL 中重新绘制静态立绘，让它动起来
 *  - 呼吸：以脚底为锚点的轻微起伏
 *  - 风 / 热浪：由透明度边缘生成权重图，只让发梢、飘带、衣摆摆动
 *  - 选择性发光：本体的红色熔岩部分脉动发光；纯烬的蓝色晶体闪烁
 *  - 光：周期性流光扫过 + 跟随鼠标方向的轮廓光
 * 图片需以 CORS 方式加载；否则自动退回普通 <img>
 * ========================================================= */
window.LIVE = (() => {
  const VS = `attribute vec2 p; varying vec2 vUv;
void main(){ vUv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
  const FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform float uTime;
uniform float uForm;
uniform float uAmp;
uniform vec2 uLight;
uniform float uFlash;
uniform float uPoke;
uniform vec2 uPar;
// —— 手工绑定（Live2D 式）：所有坐标都是立绘的归一化 uv（y 向下）——
uniform float uRig;       // 1 = 这张立绘有绑定
uniform vec3 uHead;       // xy 头部中心，z 半径
uniform vec2 uNeck;       // 颈部支点
uniform vec3 uHeadMove;   // x 旋转（弧度），yz 平移
uniform vec4 uEyeL;       // xy 中心，zw 宽高
uniform vec4 uEyeR;
uniform vec3 uEyeMove;    // x 闭眼程度，yz 视线偏移（以眼宽为单位）
uniform vec2 uWaist;      // 腰部支点
uniform float uBodyRot;   // 上半身倾斜（弧度）
uniform float uHop;       // 跳起的高度
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
// 眼睛：上眼睑落下（把眼睛上方的睫毛线拉下来）+ 瞳孔随视线轻移
vec2 eyeWarp(vec2 uv, vec4 e){
  vec2 d = (uv - e.xy) / (e.zw * vec2(0.62, 0.9));
  float wgt = 1.0 - smoothstep(0.62, 1.0, length(d));
  if (wgt <= 0.0) return uv;
  uv.y -= uEyeMove.x * e.w * 0.95 * wgt;
  uv -= uEyeMove.yz * e.z * 0.08 * wgt * (1.0 - uEyeMove.x);
  return uv;
}
void main(){
  vec2 uv = vUv;
  float t = uTime;
  // 呼吸 + 被戳时的挤压回弹（以底部为锚点）
  float br = sin(t * 1.6) * 0.0045 * uAmp + uPoke * 0.12;
  uv.y = 1.0 - (1.0 - uv.y) / (1.0 + br);
  uv.x = 0.5 + (uv.x - 0.5) / (1.0 - br * 0.5);
  if (uRig > 0.5) {
    // 跳起：整体上移
    uv.y += uHop;
    // 上半身绕腰部倾斜，腰部以下保持不动
    float wb = smoothstep(uWaist.y + 0.07, uWaist.y - 0.04, uv.y);
    uv = uWaist + rot(uv - uWaist, -uBodyRot * wb);
    // 头部绕颈部做刚性转动 + 平移（点头、歪头、看向鼠标）
    // 角度小 + 过渡带宽：发梢只是被轻轻带动，不会出现剪切撕裂；颈部以下（衣领）不参与
    float wh = 1.0 - smoothstep(uHead.z * 0.9, uHead.z * 1.9, length(uv - uHead.xy));
    wh *= smoothstep(uNeck.y + 0.02, uNeck.y - 0.02, uv.y);
    uv = uNeck + rot(uv - uNeck, -uHeadMove.x * wh);
    uv -= uHeadMove.yz * wh;
    // 眨眼与视线（此时 uv 已回到原图空间，眼睛会跟着头一起动）
    uv = eyeWarp(uv, uEyeL);
    uv = eyeWarp(uv, uEyeR);
  }
  // 2.5D 视差：把模糊后的透明度当作“厚度”，中心比边缘位移更多
  float depth = texture2D(uMask, uv).a;
  uv -= uPar * 0.007 * (depth - 0.35) * uAmp;
  // 边缘权重：身体内部几乎不动，越靠外轮廓摆动越大
  float m = texture2D(uMask, uv).a;
  float w = 1.0 - smoothstep(0.18, 0.8, m);
  w *= smoothstep(0.02, 0.12, m + 0.03);
  float n = noise(uv * 3.0 + vec2(t * 0.35, -t * 0.22));
  vec2 disp;
  if (uForm < 0.5) {
    disp = vec2(sin(uv.y * 15.0 + t * 2.2 + n * 3.0) * 0.7, -0.35 - 0.45 * abs(sin(uv.x * 11.0 + t * 1.4)));
  } else {
    disp = vec2(0.55 + sin(uv.y * 9.0 + t * 1.5 + n * 2.4), sin(uv.x * 7.0 + t * 1.1) * 0.4);
  }
  uv += disp * 0.005 * w * uAmp;
  vec4 c = texture2D(uTex, uv);
  float a = c.a;
  vec3 col = c.rgb;
  // 选择性发光
  if (uForm < 0.5) {
    float lava = smoothstep(0.22, 0.5, col.r - max(col.g, col.b)) * smoothstep(0.35, 0.7, col.r);
    float pulse = 0.55 + 0.45 * sin(t * 2.5 - uv.y * 9.0 + n * 4.0);
    col += vec3(1.0, 0.38, 0.52) * lava * pulse * 0.28;
  } else {
    float blue = smoothstep(0.06, 0.28, col.b - col.r) * smoothstep(0.45, 0.85, col.b);
    float spark = pow(noise(uv * 70.0 + vec2(t * 1.3, -t * 0.7)), 10.0) * 4.0;
    col += vec3(0.75, 0.9, 1.0) * blue * (0.15 + spark) * 0.35;
    float red = smoothstep(0.22, 0.5, col.r - max(col.g, col.b));
    col += vec3(1.0, 0.42, 0.52) * red * (0.5 + 0.5 * sin(t * 2.0 + uv.x * 6.0)) * 0.12;
  }
  // 流光：约 9 秒一次
  float ph = fract(t * 0.11);
  float d = (uv.x * 0.8 + uv.y * 0.6) - (ph * 2.8 - 0.5);
  col += vec3(1.0, 0.97, 0.98) * (exp(-d * d * 900.0) * 0.16 + exp(-d * d * 50.0) * 0.03);
  // 轮廓光：朝向光源（鼠标）的一侧边缘被照亮
  vec2 ld = normalize(uLight + vec2(0.0001, 0.0));
  float a2 = texture2D(uTex, uv + ld * 0.0038).a;
  float rim = clamp(a - a2, 0.0, 1.0);
  vec3 rimC = uForm < 0.5 ? vec3(1.0, 0.5, 0.7) : vec3(0.55, 0.75, 1.0);
  col += rimC * rim * (0.4 + uFlash * 0.5);
  col += vec3(1.0) * uFlash * 0.1;
  gl_FragColor = vec4(col * a, a);
}`;

  function boxBlurAlpha(src, w, h, r, passes) {
    let a = src, b = new Float32Array(w * h);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < h; y++) {
        let acc = 0;
        for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
          b[y * w + x] = acc / (2 * r + 1);
          acc += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) {
          a[y * w + x] = acc / (2 * r + 1);
          acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
        }
      }
    }
    return a;
  }

  function create(host) {
    const cv = document.createElement('canvas');
    cv.className = 'live-canvas';
    cv.setAttribute('aria-hidden', 'true');
    host.appendChild(cv);
    const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    const ctl = { ok: false, canvas: cv, set: () => false, setForm() {}, pointer() {}, poke() {}, hide() {}, layout() {}, destroy() { cv.remove(); } };
    if (!gl) return ctl;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { console.warn('[LIVE]', e); return ctl; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['uTex', 'uMask', 'uTime', 'uForm', 'uAmp', 'uLight', 'uFlash', 'uPoke', 'uPar', 'uRig', 'uHead', 'uNeck', 'uHeadMove', 'uEyeL', 'uEyeR', 'uEyeMove', 'uWaist', 'uBodyRot', 'uHop'].forEach((k) => (U[k] = gl.getUniformLocation(prog, k)));
    gl.uniform1i(U.uTex, 0);
    gl.uniform1i(U.uMask, 1);
    const mkTex = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const tex = mkTex(), mask = mkTex();
    // visible 由 IntersectionObserver 给出（observe 之后一定会先回调一次当前状态）
    let form = 'base', running = false, visible = false, hasImg = false, raf = 0;
    let light = [0.6, -0.8], lightT = [0.6, -0.8], flash = 0, poke = 0, pokeV = 0;
    let par = [0, 0], parT = [0, 0];
    const t0 = performance.now();

    /* ---------- 动作系统：像 Live2D 一样按时间线驱动绑定参数 ---------- */
    let rig = null, autoIdle = true, lastT = 0, nextBlink = 1.5, nextIdle = 5;
    let active = [];
    const clamp01 = (k) => Math.max(0, Math.min(1, k));
    const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
    // 渐入-保持-渐出
    const hold = (k, a = 0.25) => (k < a ? smooth(k / a) : k > 1 - a ? smooth((1 - k) / a) : 1);
    const ACTS = {
      blink: { dur: 0.22, run(k, o) { o.blink = Math.max(o.blink, k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6); } },
      // 幅度刻意收小：像素级变形在大角度下会扭曲原画
      tilt: { dur: 2.0, big: true, run(k, o, s) { const h = hold(k, 0.3); o.headRot += 0.055 * s * h; o.headOff[0] += 0.0015 * s * h; } },
      nod: { dur: 1.3, big: true, run(k, o) { const v = Math.max(0, Math.sin(k * Math.PI * 2)) * (1 - k * 0.3); o.headOff[1] += 0.0065 * v; o.headRot += 0.006 * v; } },
      look: { dur: 2.6, big: true, run(k, o, s) { const h = hold(k, 0.18); o.eyeLook[0] += 0.9 * s * h; o.headOff[0] += 0.0025 * s * h; o.headRot += 0.014 * s * h; } },
      sway: { dur: 3.6, big: true, run(k, o) { const e = Math.sin(Math.PI * k), s = Math.sin(k * Math.PI * 2); o.bodyRot += 0.012 * s * e; o.headRot -= 0.014 * s * e; } },
      hop: { dur: 0.8, big: true, run(k, o) { o.hop += 0.018 * Math.sin(Math.PI * k) ** 1.4; o.headRot += 0.01 * Math.sin(Math.PI * k); } },
      cast: {
        dur: 2.8, big: true,
        run(k, o) {
          const h = hold(k, 0.22);
          o.bodyRot -= 0.014 * h; o.headRot -= 0.022 * h; o.headOff[1] -= 0.0025 * h;
          o.glow = Math.max(o.glow, h * (0.55 + 0.45 * Math.sin(k * 30)));
          if (k > 0.2 && k < 0.8) o.blink = Math.max(o.blink, 0.35);
        },
      },
    };
    function act(name, sign) {
      // 整图变形没有独立的法杖和分层表情：新动作退化成最接近的旧动作
      name = { swing: 'sway', dance: 'sway', jump: 'hop', surprise: 'hop', shake: 'look', shy: 'tilt', think: 'tilt', giggle: 'nod', stretch: 'nod' }[name] || name;
      const a = ACTS[name];
      if (!a || !rig) return;
      if (a.big) active = active.filter((x) => !ACTS[x.name].big);
      active.push({ name, t: 0, s: sign ?? (Math.random() < 0.5 ? -1 : 1) });
      if (a.big) nextIdle = 6 + Math.random() * 5;
      start();
    }
    function pose(t, dt) {
      const o = { blink: 0, headRot: 0, headOff: [0, 0], eyeLook: [0, 0], bodyRot: 0, hop: 0, glow: 0 };
      if (!rig) return o;
      // 自然的微动：头和上身轻轻晃
      o.headRot += Math.sin(t * 0.8) * 0.005;
      o.bodyRot += Math.sin(t * 0.55 + 1) * 0.0025;
      // 视线跟随鼠标（以眼睛为主，头只轻轻带一点）
      o.eyeLook[0] += par[0] * 0.7;
      o.eyeLook[1] += par[1] * 0.4;
      o.headOff[0] += par[0] * 0.0015;
      o.headOff[1] += par[1] * 0.0008;
      o.headRot += par[0] * 0.007;
      if (autoIdle) {
        nextBlink -= dt;
        if (nextBlink <= 0) {
          act('blink');
          if (Math.random() < 0.22) setTimeout(() => act('blink'), 280);
          nextBlink = 2.2 + Math.random() * 3.6;
        }
        nextIdle -= dt;
        if (nextIdle <= 0) {
          act(['tilt', 'nod', 'look', 'sway', 'look', 'tilt'][(Math.random() * 6) | 0]);
          nextIdle = 5 + Math.random() * 5;
        }
      }
      for (let i = active.length - 1; i >= 0; i--) {
        const a = active[i];
        a.t += dt;
        const k = a.t / ACTS[a.name].dur;
        if (k >= 1) { active.splice(i, 1); continue; }
        ACTS[a.name].run(k, o, a.s);
      }
      o.eyeLook[0] = Math.max(-1.2, Math.min(1.2, o.eyeLook[0]));
      o.eyeLook[1] = Math.max(-0.8, Math.min(0.8, o.eyeLook[1]));
      return o;
    }
    const dpr = () => Math.min(window.devicePixelRatio || 1, 1.6);

    let natW = 1, natH = 1;
    function layout() {
      // 在宿主中按 object-fit: contain 计算绘制区域
      const W0 = host.clientWidth, H0 = host.clientHeight;
      const s = Math.min(W0 / natW, H0 / natH) || 1;
      const r = { w: natW * s, h: natH * s };
      r.x = (W0 - r.w) / 2;
      r.y = (H0 - r.h) / 2;
      cv.style.left = r.x + 'px';
      cv.style.top = r.y + 'px';
      cv.style.width = r.w + 'px';
      cv.style.height = r.h + 'px';
      const W = Math.max(2, Math.round(r.w * dpr())), H = Math.max(2, Math.round(r.h * dpr()));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; gl.viewport(0, 0, W, H); }
    }

    function set(img, f) {
      form = f || form;
      hasImg = false;
      if (!img || !img.naturalWidth) return false;
      natW = img.naturalWidth;
      natH = img.naturalHeight;
      layout();
      try {
        // 先在 2D 画布中高质量缩小，避免大图直接采样产生闪烁
        const target = Math.min(img.naturalWidth, Math.max(512, Math.round(Math.max(cv.width, cv.height) * 1.15)));
        const s = target / Math.max(img.naturalWidth, img.naturalHeight);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s);
        c.height = Math.round(img.naturalHeight * s);
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, c.width, c.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        // 透明度模糊 → 边缘权重图
        const M = 128;
        const mc = document.createElement('canvas');
        mc.width = mc.height = M;
        const mg = mc.getContext('2d', { willReadFrequently: true });
        mg.drawImage(img, 0, 0, M, M);
        const px = mg.getImageData(0, 0, M, M);
        const al = new Float32Array(M * M);
        for (let i = 0; i < M * M; i++) al[i] = px.data[i * 4 + 3] / 255;
        const bl = boxBlurAlpha(al, M, M, 5, 3);
        const out = new Uint8Array(M * M * 4);
        for (let i = 0; i < M * M; i++) { const v = Math.round(bl[i] * 255); out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = v; }
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, mask);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, M, M, 0, gl.RGBA, gl.UNSIGNED_BYTE, out);
      } catch (e) {
        // 跨域污染等：放弃实时渲染
        return false;
      }
      hasImg = true;
      ctl.ok = true;
      draw(performance.now());
      start();
      return true;
    }

    // 60 帧封顶：高刷显示器上不必跟着 144/165 Hz 重绘
    let lastFrame = 0;
    function frame(now) {
      raf = 0;
      if (!hasImg || !visible || document.hidden) { running = false; return; }
      raf = requestAnimationFrame(frame);
      if (now - lastFrame < 1000 / 60 - 1.5) return;
      lastFrame = now;
      draw(now);
    }
    function draw(now) {
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, Math.max(0, t - lastT));
      lastT = t;
      light[0] += (lightT[0] - light[0]) * 0.08;
      light[1] += (lightT[1] - light[1]) * 0.08;
      par[0] += (parT[0] - par[0]) * 0.06;
      par[1] += (parT[1] - par[1]) * 0.06;
      flash *= 0.9;
      const o = pose(t, dt);
      flash = Math.max(flash, o.glow * 0.35);
      gl.uniform1f(U.uRig, rig ? 1 : 0);
      if (rig) {
        gl.uniform3f(U.uHead, rig.head[0], rig.head[1], rig.head[2]);
        gl.uniform2f(U.uNeck, rig.neck[0], rig.neck[1]);
        gl.uniform3f(U.uHeadMove, o.headRot, o.headOff[0], o.headOff[1]);
        gl.uniform4f(U.uEyeL, ...rig.eyes[0]);
        gl.uniform4f(U.uEyeR, ...rig.eyes[1]);
        gl.uniform3f(U.uEyeMove, o.blink, o.eyeLook[0], o.eyeLook[1]);
        gl.uniform2f(U.uWaist, rig.waist[0], rig.waist[1]);
        gl.uniform1f(U.uBodyRot, o.bodyRot);
        gl.uniform1f(U.uHop, o.hop);
      }
      // 戳一下：弹簧回弹
      pokeV += -poke * 0.35 - pokeV * 0.18;
      poke += pokeV;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.uTime, t);
      gl.uniform1f(U.uForm, form === 'alter' ? 1 : 0);
      gl.uniform1f(U.uAmp, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.2 : 1);
      gl.uniform2f(U.uLight, light[0], light[1]);
      gl.uniform1f(U.uFlash, flash);
      gl.uniform1f(U.uPoke, poke);
      gl.uniform2f(U.uPar, par[0], par[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    // 逐帧循环只在看得见、有图、标签页在前台时存在：鼠标移动等调用 start() 时不再白白请求一帧；
    // 离开视口 / 切到后台直接取消已排上的一帧，回来时由 IntersectionObserver / visibilitychange 重新开始
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; running = false; }
    function start() { if (!running && hasImg && visible && !document.hidden) { running = true; raf = requestAnimationFrame(frame); } }

    // 一次回调里可能有同一目标的多条记录，以最后一条为准
    const io = new IntersectionObserver((ens) => { visible = ens[ens.length - 1].isIntersecting; if (visible) start(); else stop(); });
    io.observe(host);
    // 画布尺寸变化会清空缓冲区，立即补画一帧
    const ro = new ResizeObserver(() => { layout(); if (hasImg && visible) draw(performance.now()); start(); });
    ro.observe(host);
    const onVis = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener('visibilitychange', onVis);

    Object.assign(ctl, {
      set,
      layout,
      /** 绑定数据：{ head:[x,y,r], neck:[x,y], eyes:[[x,y,w,h],[x,y,w,h]], waist:[x,y] }，null 表示无绑定 */
      setRig(r) { rig = r || null; active = []; nextBlink = 1.2; nextIdle = 4; },
      act,
      setIdle(on) { autoIdle = on; },
      setForm(f) { form = f; },
      pointer(x, y) {
        const r = cv.getBoundingClientRect();
        if (!r.width) return;
        const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height * 0.4);
        const l = Math.hypot(dx, dy) || 1;
        lightT = [dx / l, dy / l];
        const cl = (v) => Math.max(-1, Math.min(1, v));
        parT = [cl(dx / (innerWidth * 0.5)), cl(dy / (innerHeight * 0.5))];
        start();
      },
      poke(strength = 1) { pokeV -= 0.06 * strength; flash = Math.min(1, flash + 0.9 * strength); start(); },
      hide() { hasImg = false; stop(); },
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
      destroy() {
        hasImg = false;
        io.disconnect();
        ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        stop();
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        cv.remove();
      },
    });
    return ctl;
  }

  return { create };
})();
