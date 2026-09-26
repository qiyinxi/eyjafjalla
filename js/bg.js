/* =========================================================
 * 背景着色器：本体 = 流动熔岩原野；纯烬 = 晴空、云海与虹光
 * 形态切换时，从点击处向外燃烧/灰化的噪声边缘推进
 * 性能：噪声查表（一次纹理采样代替四次哈希）、半分辨率渲染、平时 30 帧（切换时 60 帧）
 * ========================================================= */
window.BG = (() => {
  const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

  const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uFrom;
uniform float uTo;
uniform float uProg;
uniform vec2 uOrigin;
uniform float uScroll;
uniform float uPulse;
uniform sampler2D uNoise;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// 平滑值噪声：晶格随机值存在 256² 纹理里，用 smoothstep 变形后的坐标做一次双线性采样
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return texture2D(uNoise, (i + f + 0.5) / 256.0).r;
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){ v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}

vec3 lavaScene(vec2 uv, vec2 p, float t){
  vec2 q = p * 1.5;
  q.y -= uScroll * 0.35;
  vec2 w = vec2(fbm(q + vec2(0.0, t * 0.05)), fbm(q + vec2(5.2, 1.3) - vec2(0.0, t * 0.04)));
  float f = fbm(q + 2.4 * w + vec2(t * 0.03, -t * 0.07));
  float n2 = noise(q * 3.2 + w * 3.0 + vec2(0.0, -t * 0.08));
  float ridge = 1.0 - abs(2.0 * n2 - 1.0);
  float crack = pow(ridge, 9.0);
  float heat = smoothstep(1.05, -0.15, uv.y);
  vec2 m = (uMouse - 0.5 * uRes) / uRes.y;
  float md = length(p - m);
  float glow = f * f * 1.55 * (0.30 + 0.85 * heat);
  glow += crack * (0.22 + 0.95 * heat) * smoothstep(0.30, 0.70, f);
  glow += 0.30 * exp(-md * md * 9.0) * (0.6 + 0.4 * f);
  glow += uPulse * 0.15 * (0.5 + f);
  // 玫粉熔岩：暗部偏李紫，裂隙与热点由玫红过渡到樱粉白，局部夹杂熔岩橙
  float warm = smoothstep(0.35, 0.75, fbm(q * 0.7 + vec2(-t * 0.02, t * 0.01)));
  vec3 cDeep = mix(vec3(0.46, 0.04, 0.20), vec3(0.52, 0.10, 0.04), warm * 0.55);
  vec3 cMid = mix(vec3(1.00, 0.24, 0.52), vec3(1.00, 0.42, 0.16), warm * 0.6);
  vec3 col = vec3(0.034, 0.012, 0.026);
  col += cDeep * glow;
  col += cMid * pow(glow, 2.3) * 0.72;
  col += vec3(1.00, 0.84, 0.92) * pow(glow, 4.2) * 0.3;
  // 飘烟
  float smoke = fbm(p * 2.2 + vec2(t * 0.02, -t * 0.05) + w);
  col = mix(col, vec3(0.05, 0.025, 0.045), smoothstep(0.55, 0.85, smoke) * 0.35);
  float vig = smoothstep(1.4, 0.15, length(p * vec2(0.85, 1.1)));
  col *= mix(0.48, 1.0, vig);
  col *= mix(0.62, 1.0, heat);
  return col;
}

vec3 skyScene(vec2 uv, vec2 p, float t){
  float y = uv.y + uScroll * 0.08;
  vec3 top = vec3(0.58, 0.76, 0.93);
  vec3 mid = vec3(0.84, 0.90, 0.97);
  vec3 bot = vec3(0.965, 0.945, 0.955);
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.55, y));
  col = mix(col, top, smoothstep(0.55, 1.15, y));
  // 太阳光晕
  vec2 sunP = vec2(0.42 * uRes.x / uRes.y, 0.36);
  float sd = length(p - sunP);
  col += vec3(1.0, 0.96, 0.88) * exp(-sd * 3.2) * 0.35;
  col += vec3(1.0, 0.98, 0.94) * exp(-sd * 14.0) * 0.4;
  // 云
  vec2 q = p * vec2(1.1, 2.1) + vec2(t * 0.012, 0.0);
  q.y -= uScroll * 0.25;
  float c = fbm(q * 1.4 + fbm(q * 2.0 + t * 0.015));
  float cloud = smoothstep(0.46, 0.80, c);
  col = mix(col, vec3(1.0), cloud * 0.62);
  col -= vec3(0.04, 0.03, 0.0) * smoothstep(0.62, 0.92, c) * 0.8;
  // 虹光带
  float band = sin(p.x * 2.1 + fbm(p * 1.2 + t * 0.04) * 4.0 + t * 0.12) * 0.5 + 0.5;
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + p.x * 0.3 + t * 0.025 + band * 0.4));
  float aur = smoothstep(0.15, 0.95, y) * smoothstep(0.3, 0.9, band) * 0.16;
  col = mix(col, irid, aur);
  // 鼠标柔光
  vec2 m = (uMouse - 0.5 * uRes) / uRes.y;
  float md = length(p - m);
  col += vec3(0.07, 0.06, 0.09) * exp(-md * md * 7.0);
  col += vec3(0.05, 0.04, 0.06) * uPulse;
  // 丁香色暗角
  float v = length(p * vec2(0.8, 1.0));
  col = mix(col, vec3(0.80, 0.78, 0.92), smoothstep(0.55, 1.35, v) * 0.35);
  return col;
}

vec3 scene(float which, vec2 uv, vec2 p, float t){
  if (which < 0.5) return lavaScene(uv, p, t);
  return skyScene(uv, p, t);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  vec3 col = scene(uFrom, uv, p, t);
  if (uProg > 0.0) {
    vec3 cTo = scene(uTo, uv, p, t);
    vec2 o = (uOrigin - 0.5 * uRes) / uRes.y;
    float d = length(p - o);
    float maxR = length(vec2(uRes.x / uRes.y, 1.0)) + 0.5;
    float n = fbm(p * 4.0 + t * 0.4);
    float front = uProg * maxR - d + (n - 0.5) * 0.34;
    float m = smoothstep(-0.004, 0.018, front);
    col = mix(col, cTo, m);
    float fade = 1.0 - smoothstep(0.82, 1.0, uProg);
    float edge = exp(-abs(front) * 26.0) * fade;
    vec3 ec = uTo < 0.5 ? vec3(1.0, 0.36, 0.62) : vec3(1.0, 0.98, 0.94);
    col += ec * edge * 0.7;
    if (uTo < 0.5) {
      // 熔岩前沿后方的余烬
      col += vec3(1.0, 0.32, 0.12) * exp(-abs(front - 0.07) * 18.0) * 0.22 * fade * n;
    } else {
      vec3 rb = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + d * 2.2 + t * 0.2));
      col += rb * exp(-abs(front - 0.06) * 26.0) * 0.2 * fade;
    }
  }
  col += (hash(gl_FragCoord.xy + fract(t) * 91.7) - 0.5) * 0.016;
  gl_FragColor = vec4(col, 1.0);
}`;

  let gl, prog, canvas, U = {}, scale = 0.5;
  let state = { from: 0, to: 0, prog: 0, t0: 0, dur: 1600, ox: 0, oy: 0, pulse: 0 };
  let mouse = [0, 0], mouseT = [0, 0], scroll = 0, running = true, held = false, onDone = null, lastDraw = -1e9, lastT = 0;
  const start = performance.now();
  // 背景变化很慢：平时 30 帧足够；形态切换的燃烧前沿移动快，用 60 帧
  const FPS_IDLE = 30, FPS_FAST = 60;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function init(cv, form) {
    canvas = cv;
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) { document.documentElement.classList.add('no-webgl'); return false; }
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) {
      console.warn('[BG] shader error', e);
      document.documentElement.classList.add('no-webgl');
      gl = null;
      return false;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uRes', 'uTime', 'uMouse', 'uFrom', 'uTo', 'uProg', 'uOrigin', 'uScroll', 'uPulse', 'uNoise'].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));
    // 噪声表：256² 随机亮度，重复平铺、线性过滤
    const nd = new Uint8Array(256 * 256);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 256) | 0;
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 256, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, nd);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.uniform1i(U.uNoise, 0);
    state.from = state.to = form === 'alter' ? 1 : 0;
    // 画面本身很柔和：按 CSS 像素的一半渲染即可（与屏幕 DPR 无关），由浏览器平滑放大
    scale = 0.5;
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { const was = running; running = !document.hidden && !held; if (running && !was) requestAnimationFrame(loop); });
    mouse = mouseT = [innerWidth * 0.6, innerHeight * 0.4];
    requestAnimationFrame(loop);
    return true;
  }

  function resize() {
    if (!gl) return;
    canvas.width = Math.max(2, Math.floor(innerWidth * scale));
    canvas.height = Math.max(2, Math.floor(innerHeight * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function loop(now) {
    if (!gl || !running) return;
    requestAnimationFrame(loop);
    const fps = state.prog > 0 || state.pulse > 0.02 ? FPS_FAST : FPS_IDLE;
    if (now - lastDraw < 1000 / fps - 2) return;
    lastDraw = now;
    draw(now);
  }
  function draw(now) {
    const t = (now - start) / 1000;
    const dt = Math.min(0.1, t - lastT);
    lastT = t;
    // 与帧率无关的平滑（原先按 60 帧每帧 6% 追随）
    const kf = 1 - Math.pow(0.94, dt * 60);
    mouse[0] += (mouseT[0] - mouse[0]) * kf;
    mouse[1] += (mouseT[1] - mouse[1]) * kf;
    state.pulse *= Math.pow(0.94, dt * 60);
    if (state.prog > 0) {
      const k = Math.min(1, (now - state.t0) / state.dur);
      state.prog = k <= 0 ? 0.0001 : k;
      if (k >= 1) {
        state.from = state.to;
        state.prog = 0;
        if (onDone) { const cb = onDone; onDone = null; cb(); }
      }
    }
    const w = canvas.width, h = canvas.height;
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1f(U.uTime, t);
    gl.uniform2f(U.uMouse, mouse[0] * scale, h - mouse[1] * scale);
    gl.uniform1f(U.uFrom, state.from);
    gl.uniform1f(U.uTo, state.to);
    gl.uniform1f(U.uProg, easeInOut(state.prog));
    gl.uniform2f(U.uOrigin, state.ox * scale, h - state.oy * scale);
    gl.uniform1f(U.uScroll, scroll);
    gl.uniform1f(U.uPulse, state.pulse);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const easeInOut = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2) || 0.0001;

  function transition(form, ox, oy, dur = 1600) {
    return new Promise((res) => {
      if (!gl) return res();
      state.to = form === 'alter' ? 1 : 0;
      state.ox = ox; state.oy = oy; state.dur = dur;
      state.t0 = performance.now();
      state.prog = 0.0001;
      onDone = res;
    });
  }

  /** 立即换成某个形态并马上画一帧（视图过渡里用：新页面快照需要新背景） */
  function set(form) {
    if (!gl) return;
    state.from = state.to = form === 'alter' ? 1 : 0;
    state.prog = 0;
    if (onDone) { const cb = onDone; onDone = null; cb(); }
    draw(performance.now());
  }

  /** 暂停 / 恢复（例如 MV 全屏放映时，背后的页面根本看不见） */
  function hold(on) {
    held = !!on;
    const was = running;
    running = !!gl && !document.hidden && !held;
    if (running && !was) requestAnimationFrame(loop);
  }

  return {
    init,
    set,
    transition,
    hold,
    pointer(x, y) { mouseT = [x, y]; },
    scroll(v) { scroll = v; },
    pulse(v = 1) { state.pulse = Math.max(state.pulse, v); },
  };
})();
