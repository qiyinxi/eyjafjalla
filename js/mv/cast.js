/* =========================================================
 * MV 角色库 —— 本页原创的 Q 版角色（“绘本 × 动画电影”风格：墨线 + 柔和渐变）
 * 三支 MV 共用。所有动作都是 t 的纯函数（不存状态），可以任意跳帧。
 *
 * MVE.cast.draw(g, who, o)
 *   who: 'adele-child' | 'adele-caster' | 'adele-alter' | 'magna' | 'katia' | 'fontaine' | 'liese'
 *        | 'keller' | 'dolly' | 'sheep-black' | 'sheep-pink' | 'doctor' | 'crowd'
 *   o: {
 *     x, y        脚底中心（设计坐标 1920×1080；在当前变换下画，可放进 s.layer 里）
 *     h           身高（像素，站立时从脚底到头顶，不含角 / 呆毛 / 光环）
 *                 羊：h ≈ 身长（高度约 0.75h）；多利：h ≈ 整团云羊的高度
 *                 推荐相对身高见 MVE.cast.meta[who].scale（卡提亚 = 1）
 *     flip        true = 面朝左（默认面朝右）
 *     pose        'stand' | 'walk' | 'run' | 'sit' | 'kneel' | 'sleep' | 'wave' | 'point' | 'hug' | 'reach' | 'jump'
 *                 | 'look-up' | 'hold' | 'write' | 'read' | 'dig' | 'lie'
 *                 另有：'record'（举着录音机、另一只手按在耳边听）| 'turn'（背对镜头、回头看，配合 o.turn）
 *                 | 'walk-away' | 'run-away'（背影走 / 跑向远处）| 'sit-ground'（坐在地上）| 'hug-knees'（抱膝）
 *                 | 'kneel2'（双膝跪坐）| 'crouch'（蹲下）| 'pet'（蹲下摸羊）| 'tiptoe' | 'float'（梦里漂浮）
 *                 | 'twirl'（原地转圈，裙摆飞起）| 'cheer' | 'clap' | 'think' | 'clasp'（双手合在胸前许愿）
 *                 | 'stretch'（伸懒腰）| 'carry'（提着行李）| 'shade'（手搭凉棚远望）| 'cover'（双手捂嘴）
 *                 | 'wipe'（擦眼泪）| 'hips'（叉腰）| 'conduct'（爸爸挥领带指挥）| 'play'（拉大提琴）
 *                 | 'bow'（鞠躬）| 'hold-up'（双手把东西举过头顶）| 'reach-up' | 'hand'（牵手，配合 o.hand）
 *                 | 'wave2'（双手挥别）| 'pocket'（插兜）| 'cross'（抱臂）| 'listen'（手按耳边）| 'nod'
 *     legs / arms 分别覆盖下半身 / 上半身动作（值同上面的动作名，或 'rest' | 'swing' | 'pump' | 'lap'）
 *                 例：{ pose: 'walk', arms: 'hold', prop: 'lantern' } 提着灯笼走；{ pose: 'sit', arms: 'read', prop: 'book' }
 *     t           时间（秒）：走路 / 呼吸 / 眨眼 / 头发与衣摆的摆动都由它推出（纯函数）
 *     speed       走 / 跑的步频倍数（默认 1）；不想脚底打滑时，横向速度用 MVE.cast.gait(who, o).speed
 *     phase       动作相位偏移（秒）：并排走的人错开步子
 *     expr        'neutral' | 'smile' | 'laugh' | 'sad' | 'surprise' | 'sleepy' | 'closed' | 'determined' | 'tearful'
 *                 另有：'cry'（流泪）| 'wink' | 'shy'（脸红、目光躲开）| 'pout' | 'content'（闭眼微笑）| 'talk'（张嘴说话）
 *     talk        0..1：嘴按 t 一张一合（说话 / 唱歌）
 *     blink       false = 不眨眼
 *     look        [dx, dy] 视线方向（屏幕坐标，-1..1；dy < 0 向上看）。头会跟着转一点
 *     view        'three'（默认，3/4 侧面）| 'front'（正面）| 'side'（正侧面）| 'back'（背影）| 'back3'（3/4 背影）
 *     yaw         直接给身体朝向角（弧度，0 = 正面，π/2 = 正侧，π = 背面），可以做连续转身
 *     turn        0..1（pose 'turn'）：0 = 完全背对，1 = 回头看镜头
 *     wind        0..1 头发 / 衣摆 / 缎带被风吹起；windDir：+1 吹向屏幕右，-1 吹向左（默认从正面吹来）
 *     outfit      adele-child: 'school' | 'summer' | 'pajama'；adele-caster: 'default'；
 *                 adele-alter: 'coat' | 'picnic' | 'home'；magna: 'field' | 'home'；katia: 'suit' | 'field' | 'home'
 *                 （fontaine / liese / keller / doctor 各一套 'default'）
 *     gear        服装自带的装备会自动画上：玛格娜 'field' = 背包 + 腰间地质锤；卡提亚 'field' = 挎包；
 *                 术师 = 毛绒领 + 呼吸面罩 + 腰间护目镜。gear: false 可关掉（背包 / 挎包那部分）
 *     hood        adele-caster：true = 戴上兜帽
 *     prop        'satchel' | 'staff' | 'cassette' | 'popsicle' | 'letter' | 'stone' | 'wreath' | 'book' | 'lantern'
 *                 | 'backpack' | 'flower' | 'trowel' | 'soda' | 'cello' | null
 *                 另有：'recorder'（便携录音机）| 'hammer'（地质锤）| 'suitcase' | 'umbrella' | 'basket' | 'notebook'
 *                 | 'tie'（拿在手里的红领带）| 'lamb' / 'lamb-pink'（抱着一只小羊）| 'wreaths'（两个花环）| 'mug' | 'box'
 *                 | 'bag'（挎包）| 'camera' | 'map'
 *                 可以给数组同时带多个：['backpack', 'hammer']。背在身上的：satchel / backpack / cello（站着时）/ bag
 *                 · 手里的小道具按 Q 版比例放大（约 1.3–1.8 倍），站着不动（arms 'rest'）时会自动把前臂抬到身前拿着
 *                 · 双手捧的动作（hold / read / clasp / hold-up）：两只手画在道具外面；坐着 + 'cello' = 拉琴
 *                 · 'cello' 背着时琴颈从肩后斜着探出头顶；'backpack' 正面能看到两条肩带
 *     propHand    'near'（默认，离镜头近的手）| 'far'
 *     hand        pose 'hand'：'left' | 'right' | 'both'（向屏幕左 / 右伸手去牵旁边的人）
 *     aim         pose 'point' / 'reach'：手臂抬起的角度（弧度，0 = 水平）
 *     seat        坐姿时座面离脚底的高度（像素）；默认 = 膝盖高度（脚正好踩地），更高时小腿会晃
 *     desk        write / sleep 时桌面离脚底的高度（像素）
 *     air         0..1：jump / float 时离地的高度（不给则按 t 自己循环）
 *     glow        发光强度（粉色小羊、多利、光环、灯笼、石头）
 *     crop        'bust'（胸像特写：x,y = 画面底边中点，h = 从 y 到头顶的高度）| 'face'（脸部大特写：x,y = 脸中心，h = 头高）
 *     sil         剪影色（例如 '#1a1016'）：整个角色画成一块剪影；配合 rim 画轮廓光
 *                 （剪影 + 逆光时羊角的外缘也会被照亮，光环照样发光 —— 远景剪影也认得出是谁）
 *     rim         轮廓光 'r,g,b'（逆光时的一圈亮边）；rimDir：光源方向（屏幕坐标弧度，-π/2 = 正上方）；
 *                 不给 rimDir 时按“正后方逆光”在两侧和头顶都描亮边；rimW：亮边宽度倍数
 *                 rimGlow：剪影背后的柔光强度（默认 0.18，0 = 关）
 *     alpha       整体透明度（< 1 时先画到离屏层再整体淡出，不会“透视”出重叠的部件）
 *                 也可以在外面设 g.globalAlpha（会乘上去，但重叠处会叠深）
 *     shadow      只有 true 时才画脚下的接触阴影（数字会被忽略 —— 各片的包装函数自己画影子，避免画两遍）
 *                 shadowY：影子的 y（跳起来的羊影子留在地上）；shadowA：影子浓度（默认 0.26）
 *     rot         整体旋转（弧度，绕脚底）：翻滚、倒下
 *     seed        个体差异（路人的长相与衣着、眨眼节奏）
 *     color       路人的主色（衣服）；simple：true = 路人一律用最简剪影（很小的远景人群）
 *                 路人在屏幕上高于约 90px 时是完整的人物（按 seed 生成：体型、发型、兽耳 / 角 / 光环、衣服），
 *                 所以可以用任何 pose / expr；更小时自动退化成 0.02ms 的剪影
 *     headPose    'up' | 'down' | 'tilt'（歪头）| 'nod'（点头）| 'far'（望远）| 'sleep' | 'turn'：覆盖头部姿态
 *     lod         0 | 1 | 2：强制细节等级（默认按屏幕上的像素高度自动选）
 *     inkW        墨线粗细倍数（默认 1）
 *     petH        pose 'pet'：手伸到的高度（像素，离脚底）
 *     rec         true：录音机的红灯亮（pose 'record' 时自动亮）
 *     umbrellaColor  伞的颜色
 *     tie / scarf 羊专用：'sheep-black' 戴小红领带（爸爸羊）/ 白围巾（妈妈羊，布料来自那件白外套，带一道红条纹）
 *     glasses     羊专用：true 戴一副小眼镜（配 tie 时是方框，否则圆框）
 *     bow / bell  羊专用：头顶蝴蝶结（true 或颜色）/ 脖子上的铃铛
 *     heat        羊专用 0..1：高兴时身体发烫冒热气
 *                 羊的 pose：'stand' | 'walk' | 'run' | 'sit' | 'sleep' | 'jump' | 'bounce' | 'push'（低头顶东西）
 *                 | 'look-up' | 'eat'（低头吃草）| 'float'（梦里漂着）；expr：'open' | 'happy' | 'closed' | 'surprise' | 'sad'
 *     form        多利：'sheep'（默认）| 'cloud'（更松散的羊形烟云）；fade 0..1：散成雾；pose 'stand' | 'walk' 时露出小腿
 *   }
 *
 * MVE.cast.meta[who] → { name, species, desc, scale, original? }（给字幕 / 片尾 / 排版用）
 * MVE.cast.anchors(who, o) → { head, face, eyeN, eyeF, mouth, top, chest, hip, handN, handF, prop, feet, bounds }
 *     同一坐标系（和 o.x / o.y 一样）里的关键点，方便贴光效（灯笼的光、石头的光、法杖尖）
 * MVE.cast.gait(who, o) → { speed, period, stride }：走 / 跑时脚底不打滑的横向速度（像素 / 秒）
 * MVE.cast.poses / exprs / props / outfits / views：可用值列表
 * MVE.cast.lastMs：最近一次 draw 的 CPU 毫秒数（调试用）
 *
 * 性能：典型尺寸下每次 draw ≈ 0.1–0.25ms（胸像 / 剪影 + 逆光 / alpha 淡出 ≈ 0.25–0.33ms；羊 ≈ 0.04ms；
 * 远景路人剪影 ≈ 0.02ms）。不用 shadowBlur / filter；Path2D 与渐变都有缓存；细节等级按屏幕像素高度自动切换。
 * 实验页：lab/cast.html（?sheet=turn | outfits | poses | expr | busts | walk | sil | sizes | props | sheep | sheepbig
 * | group | yaw | one | perf | bench），说明见该页开头的注释。
 * ========================================================= */
(() => {
  'use strict';
  const E = window.MVE;
  if (!E) return;
  const PI = Math.PI, TAU = PI * 2, HP = PI / 2;
  const { sin, cos, abs, min, max, sqrt, atan2, hypot, floor, pow } = Math;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const hash = E.hash;
  const wob = E.wobble;
  const fract = (x) => x - floor(x);

  /* ================================================================
   * 颜色
   * ================================================================ */
  const RGBC = new Map();
  function rgbOf(c) {
    let v = RGBC.get(c);
    if (v) return v;
    let h = c.charAt(0) === '#' ? c.slice(1) : c;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    RGBC.set(c, v);
    return v;
  }
  const hx2 = (n) => { n = Math.round(clamp(n, 0, 255)); return (n < 16 ? '0' : '') + n.toString(16); };
  const MIXC = new Map();
  function mix(a, b, k) {
    const key = a + b + k;
    let v = MIXC.get(key);
    if (v) return v;
    const A = rgbOf(a), B = rgbOf(b);
    v = '#' + hx2(A[0] + (B[0] - A[0]) * k) + hx2(A[1] + (B[1] - A[1]) * k) + hx2(A[2] + (B[2] - A[2]) * k);
    MIXC.set(key, v);
    return v;
  }
  const RGBAC = new Map();
  function rgba(c, a) {
    const key = c + '|' + a;
    let v = RGBAC.get(key);
    if (v) return v;
    const A = rgbOf(c);
    v = `rgba(${A[0]},${A[1]},${A[2]},${a})`;
    RGBAC.set(key, v);
    return v;
  }
  // 常用的派生色：单键缓存（这些在每一笔描边里都会调用）
  const INKC = new Map(), DKC = new Map(), LTC = new Map();
  const dk = (c, k = 0.45) => { if (k !== 0.45) return mix(c, '#26141c', k); let v = DKC.get(c); if (!v) { v = mix(c, '#26141c', k); DKC.set(c, v); } return v; };
  const lt = (c, k = 0.4) => { if (k !== 0.4) return mix(c, '#ffffff', k); let v = LTC.get(c); if (!v) { v = mix(c, '#ffffff', k); LTC.set(c, v); } return v; };
  const inkOf = (c) => { let v = INKC.get(c); if (!v) { v = mix(c, '#2a1520', 0.62); INKC.set(c, v); } return v; };

  /* ================================================================
   * 缓存：渐变、精灵、Path2D
   * ================================================================ */
  const gctx = document.createElement('canvas').getContext('2d');
  const GC = new Map();
  function linG(key, x0, y0, x1, y1, stops) {
    let gr = GC.get(key);
    if (!gr) {
      gr = gctx.createLinearGradient(x0, y0, x1, y1);
      for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
      GC.set(key, gr);
    }
    return gr;
  }
  function radG(key, x0, y0, r0, x1, y1, r1, stops) {
    let gr = GC.get(key);
    if (!gr) {
      gr = gctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
      for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
      GC.set(key, gr);
    }
    return gr;
  }
  const SPR = new Map();
  /** 柔和的椭圆色块精灵（腮红 / 接触阴影），画在 [-1,1]² 里 */
  function softSprite(rgb, hard = 0.35) {
    const key = 'soft:' + rgb + ':' + hard;
    let c = SPR.get(key);
    if (c) return c;
    c = E.mk(64, 64);
    const q = c.getContext('2d'), gr = q.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(hard, `rgba(${rgb},0.8)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    q.fillStyle = gr; q.fillRect(0, 0, 64, 64);
    SPR.set(key, c);
    return c;
  }
  const PC = new Map();
  function pathCache(key, fn) {
    let p = PC.get(key);
    if (!p) {
      if (PC.size > 1600) PC.clear();
      p = fn();
      PC.set(key, p);
    }
    return p;
  }

  /* ================================================================
   * 仿射矩阵 [a, b, c, d, e, f]（与 canvas setTransform 同序）
   * ================================================================ */
  function tm(out, m, x, y, r, sx, sy) {
    let a = sx, b = 0, c = 0, d = sy;
    if (r) { const cr = cos(r), sr = sin(r); a = cr * sx; b = sr * sx; c = -sr * sy; d = cr * sy; }
    const m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3];
    out[0] = m0 * a + m2 * b; out[1] = m1 * a + m3 * b;
    out[2] = m0 * c + m2 * d; out[3] = m1 * c + m3 * d;
    out[4] = m0 * x + m2 * y + m[4]; out[5] = m1 * x + m3 * y + m[5];
    return out;
  }
  const setT = (g, m) => g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  const mscale = (m) => sqrt(abs(m[0] * m[3] - m[1] * m[2]));
  const mapX = (m, x, y) => m[0] * x + m[2] * y + m[4];
  const mapY = (m, x, y) => m[1] * x + m[3] * y + m[5];

  /* ================================================================
   * 体型（单位：站立身高 = 100，脚底原点，y 向下）
   * W / Dp：躯干五个截面（髋 → 肩）的半宽 / 半厚
   * ================================================================ */
  const RING_U = [0, 0.28, 0.52, 0.78, 1];
  function mkBody(b) {
    const Hh = 100 / b.heads, R = Hh / 2.08;
    const headY = -100 + 1.1 * R, chinY = headY + 0.98 * R;
    const shY = chinY + b.neck;
    const hipY = -b.leg;
    const T = hipY - shY;
    const ank = b.leg * 0.09;
    const thigh = (b.leg - ank) * 0.53, shin = (b.leg - ank) * 0.47;
    return Object.assign({ R, headY, chinY, shY, hipY, T, ank, thigh, shin }, b);
  }
  const BODIES = {
    child: mkBody({ heads: 2.12, leg: 31, neck: 1.5, W: [7.0, 6.7, 6.7, 7.2, 8.0], Dp: [4.6, 4.5, 4.4, 4.4, 4.0], shJ: 7.6, up: 9.0, fo: 8.1, hand: 2.75, armW: [4.2, 3.8], hipJ: 3.4, legW: [5.0, 4.4], foot: 5.6, fem: 1 }),
    teen: mkBody({ heads: 2.45, leg: 37, neck: 1.9, W: [7.2, 6.4, 6.2, 7.4, 8.8], Dp: [4.3, 4.0, 3.9, 4.3, 3.9], shJ: 8.3, up: 9.8, fo: 8.7, hand: 2.45, armW: [4.0, 3.6], hipJ: 3.4, legW: [4.9, 4.2], foot: 5.8, fem: 1 }),
    teenM: mkBody({ heads: 2.5, leg: 38, neck: 2.1, W: [7.3, 7.0, 7.1, 8.2, 9.5], Dp: [4.3, 4.1, 4.1, 4.5, 4.0], shJ: 9.0, up: 10.2, fo: 9.1, hand: 2.55, armW: [4.2, 3.8], hipJ: 3.6, legW: [5.2, 4.5], foot: 6.0, fem: 0 }),
    woman: mkBody({ heads: 2.72, leg: 41, neck: 2.1, W: [7.3, 6.5, 6.2, 7.7, 9.1], Dp: [4.4, 4.0, 3.9, 4.6, 4.0], shJ: 8.7, up: 10.4, fo: 9.2, hand: 2.45, armW: [4.1, 3.6], hipJ: 3.5, legW: [5.0, 4.2], foot: 6.0, fem: 1 }),
    man: mkBody({ heads: 2.85, leg: 42.5, neck: 2.5, W: [7.8, 7.8, 8.3, 9.8, 11.0], Dp: [4.6, 4.5, 4.7, 5.1, 4.5], shJ: 10.4, up: 11.2, fo: 10.0, hand: 2.75, armW: [4.8, 4.3], hipJ: 4.1, legW: [5.8, 5.1], foot: 6.6, fem: 0 }),
    elder: mkBody({ heads: 2.9, leg: 43, neck: 2.3, W: [7.1, 6.5, 6.4, 7.6, 9.0], Dp: [4.4, 4.0, 4.0, 4.6, 4.0], shJ: 8.7, up: 10.8, fo: 9.6, hand: 2.45, armW: [4.1, 3.6], hipJ: 3.6, legW: [5.0, 4.3], foot: 6.2, fem: 1 }),
  };

  /* ================================================================
   * 调色板
   * ================================================================ */
  const SKIN = { c: '#fff0e6', sh: '#f4cfbd', ink: '#8f5446', blush: '255,128,124', mouth: '#7b2733', tongue: '#ee8a8c', lip: '#c9555a' };
  const SKIN_K = { c: '#fcece2', sh: '#eecbb9', ink: '#86524a', blush: '240,140,130', mouth: '#6e2a30', tongue: '#e08888', lip: '#b8585a' };
  const HAIR = {
    caster: { c: '#7c4f3d', sh: '#56342a', lt: '#a8735c', tip: '#e2a2a0', ink: '#3b1d17' },
    alter: { c: '#7d4d3d', sh: '#573128', lt: '#ab7461', tip: '#f0949e', ink: '#3b1d17' },
    child: { c: '#835540', sh: '#5b3629', lt: '#b27b61', tip: '#cf9e85', ink: '#3b1d17' },
    magna: { c: '#8c5a41', sh: '#603a29', lt: '#bd8763', tip: '#c8966f', ink: '#40221a' },
    katia: { c: '#4f3228', sh: '#321e18', lt: '#7a5442', tip: '#5d3c30', ink: '#1f110d' },
    fontaine: { c: '#eadca8', sh: '#c3ab6e', lt: '#fff6d2', tip: '#f4e8bc', ink: '#7c6434' },
    liese: { c: '#b4613a', sh: '#843f20', lt: '#df8d5a', tip: '#e59a66', ink: '#4c2110' },
    keller: { c: '#d3d3da', sh: '#9d9dab', lt: '#f4f4f8', tip: '#e6e6ec', ink: '#56566c' },
  };
  const EYES = {
    adele: { top: '#6d1929', bot: '#e8636f', pupil: '#3a0914', ring: '#4b0e1c', lash: '#2b1411', hi2: '#ffd0d6' },
    magna: { top: '#761a25', bot: '#e2555e', pupil: '#3a0910', ring: '#4a0d18', lash: '#2b1411', hi2: '#ffd0d0' },
    katia: { top: '#6a4217', bot: '#dea44c', pupil: '#3a2008', ring: '#4a2c10', lash: '#1f120c', hi2: '#ffe6b8' },
    fontaine: { top: '#1f3e7c', bot: '#72aef0', pupil: '#0e1c3e', ring: '#16305e', lash: '#3a2c1c', hi2: '#d8ecff' },
    liese: { top: '#1d5a3a', bot: '#72c68e', pupil: '#0c2c1a', ring: '#16452c', lash: '#3a1c10', hi2: '#d8ffe2' },
    keller: { top: '#3c4250', bot: '#a4aebe', pupil: '#1c2028', ring: '#2c3240', lash: '#34343e', hi2: '#eef2f8' },
  };
  const HORNS = {
    adele: { c0: '#fdf6ea', c1: '#e8d6b8', c2: '#c3a787', ink: '#86684c' },
    magna: { c0: '#f6e9d3', c1: '#dcc4a0', c2: '#b39570', ink: '#7c5e42' },
    katia: { c0: '#cdc3b5', c1: '#a89c8c', c2: '#7d7163', ink: '#4c433a' },
  };
  const EAR_SHEEP = { c: '#fbf3ea', in: '#f3adb0', ink: '#9a6a5c' };

  /* ================================================================
   * 角色设定
   *   hair.bangs：刘海发梢 [方位角 ψ（0 正前，+ 为角色右侧）, 发梢高度 y, 弯向]
   *   hair.back：后发（len 发长，w 下端半宽，n 发束数，wave 卷度）
   *   hair.locks：鬓角垂下的长发束；ahoge：呆毛；pony：马尾；braid：麻花辫
   * ================================================================ */
  const ADELE_BANGS = [[-1.1, 0.14, 0.2], [-0.76, 0.26, 0.35], [-0.44, 0.1, 0.5], [-0.14, 0.3, 0.55], [0.18, 0.12, 0.5], [0.48, 0.28, 0.45], [0.82, 0.12, 0.35], [1.1, 0.22, 0.2]];
  const HAIR_ADELE = (pal, o = {}) => Object.assign({
    pal, cap: 1.1, side: 0.86, sideW: 0.13, part: 0.25, curly: 1,
    bangs: ADELE_BANGS,
    back: { len: 2.65, w: 1.2, n: 7, wave: 0.07, top: -0.15 },
    locks: { len: 1.95, w: 0.22, psi: 1.42, y0: 0.46, wave: 0.06 },
    ahoge: { psi: 0.2, len: 0.42, curl: 1.3 },
    pony: null, braid: null,
  }, o);

  // 服装字段见 drawHuman 的各部件函数；颜色都写成字面值
  const CH = {
    'adele-child': {
      body: 'child', skin: SKIN, eye: EYES.adele, horn: { pal: HORNS.adele, r: 0.42, turn: 1.36, out: 0.56, w: 0.26, psi: 1.12, y: -0.62 }, ear: 'sheep', sheepEar: 0.8,
      hair: HAIR_ADELE(HAIR.child, { back: { len: 2.05, w: 1.12, n: 6, wave: 0.08, top: -0.15 }, locks: { len: 1.35, w: 0.22, psi: 1.42, y0: 0.44, wave: 0.06 }, ahoge: { psi: 0.2, len: 0.6, curl: 1.2 } }),
      def: 'school',
      outfits: {
        school: {
          top: '#2f3a5e', sleeve: ['#f7f5f0', '#f7f5f0'], collar: { type: 'peter', c: '#fbfaf6' }, neck: { bow: '#d63a36' },
          skirt: { c: '#2f3a5e', len: 0.44, flare: 3.2, hem: 'pleat', trim: '#27304e' },
          cape: { c: '#c7976a', trim: '#8a5f3c', len: 0.42, clasp: '#d63a36' },
          legs: { c: ['#fff0e6', '#fff0e6', '#fbfaf6'], sock: 0.22 },
          shoes: { c: '#6b3f2a', sole: '#3a2216', type: 'mary' },
        },
        summer: {
          top: '#fbf7ee', sleeve: ['#fbf7ee', '#fff0e6'], collar: { type: 'square', c: '#8ec3e6' }, neck: { bow: '#8ec3e6' },
          skirt: { c: '#fbf7ee', len: 0.52, flare: 5.2, hem: 'scallop', trim: '#8ec3e6' }, sash: '#8ec3e6',
          legs: { c: ['#fff0e6', '#fff0e6', '#fff0e6'] },
          shoes: { c: '#b07a4a', sole: '#6e4426', type: 'sandal' },
          hat: { type: 'straw', c: '#f0d58c', band: '#d63a36' },
        },
        pajama: {
          top: '#bcd4f0', sleeve: ['#bcd4f0', '#bcd4f0'], collar: { type: 'peter', c: '#fbfaf6' }, dots: '#ffffff', buttons: '#fbfaf6',
          pants: { c: '#bcd4f0', w: [5.0, 4.6], cuff: '#fbfaf6' },
          shoes: { c: '#f6e6ee', sole: '#e0b8c8', type: 'slipper' },
          bedhair: true,
        },
      },
    },
    'adele-caster': {
      body: 'teen', skin: SKIN, eye: EYES.adele, horn: { pal: HORNS.adele, r: 0.5, turn: 1.42, out: 0.66, w: 0.29, psi: 1.12, y: -0.6 }, ear: 'sheep', sheepEar: 1,
      hair: HAIR_ADELE(HAIR.caster),
      def: 'default',
      outfits: {
        default: {
          top: '#857d98', sleeve: ['#f3f0ea', '#f3f0ea'], cuff: '#e3ddd4', collar: { type: 'jabot', c: '#fbfaf6' }, buttons: '#d63a36',
          skirt: { c: '#857d98', len: 0.4, flare: 3.4, hem: 'soot', trim: '#2c2433' },
          jacket: { c: '#f3f0ea', sh: '#d6cfc6', open: 0.5, len: 0.36, hood: true, lining: '#e2dbd0', flare: 3.2 },
          cords: '#d63a36', headphones: true, goggles: true,
          legs: { c: ['#fff0e6', '#2a2330', '#2a2330'], stock: 0.2 },
          shoes: { c: '#6d4230', sole: '#3a2216', type: 'boot', lace: '#d63a36' },
          staff: 'caster',
        },
      },
    },
    'adele-alter': {
      body: 'woman', skin: SKIN, eye: EYES.adele, horn: { pal: HORNS.adele, r: 0.5, turn: 1.44, out: 0.66, w: 0.29, psi: 1.12, y: -0.6 }, ear: 'sheep', sheepEar: 1,
      hair: HAIR_ADELE(HAIR.alter, { pony: { psi: 1.18, y: -0.55, len: 2.05, w: 0.5, bow: ['#d63a36', '#5b8ee0'] }, back: { len: 2.2, w: 1.16, n: 6, wave: 0.075, top: -0.15 } }),
      def: 'coat',
      outfits: {
        coat: {
          top: '#a597c8', sleeve: ['#efe7da', '#efe7da'], collar: { type: 'shirt', c: '#a597c8' },
          tricolor: true, corset: { c: '#2d2733', y0: 0.16, y1: 0.46 }, pouches: '#3a3340',
          skirt: { c: '#3b3447', len: 0.3, flare: 2.2, hem: 'plain', trim: '#2c2636' },
          coat: { c: '#efe7da', sh: '#d4c7b4', lining: '#b8323b', len: 0.72, open: 0.4, stripes: '#c23b3b', tatter: true, ribbons: '#c8323c' },
          legs: { c: ['#2a2430', '#2a2430', '#2a2430'], straps: '#c8323c' },
          shoes: { c: '#f5e8ee', sole: '#e8a2ba', type: 'chunky', lace: '#d63a36' },
          hearing: true, staff: 'alter',
        },
        picnic: {
          top: '#5fb3dd', sleeve: ['#fbfaf6', '#fff0e6'], puff: true, collar: { type: 'off', c: '#fbfaf6' }, neck: { bow: '#5fb3dd' },
          corset: { c: '#27365a', y0: 0.2, y1: 0.46 }, apron: '#fbfaf6',
          skirt: { c: '#5fb3dd', len: 0.46, flare: 6.5, hem: 'frill', trim: '#fbfaf6', check: ['#d63a36', '#fbfaf6'] },
          legs: { c: ['#fbfaf6', '#fbfaf6', '#fbfaf6'], ribbons: '#5fb3dd' },
          shoes: { c: '#26222e', sole: '#141118', type: 'mary' },
          hair: { pony: { psi: 1.0, y: -0.82, len: 2.3, w: 0.52, bow: ['#8fd0f0', '#8fd0f0'], big: true }, headdress: '#fbfaf6' },
          hearing: true, staff: 'alter',
        },
        home: {
          top: '#2c2939', sleeve: ['#2c2939', '#2c2939'], cuff: '#8f7fd0', collar: { type: 'ruffle', c: '#8f7fd0' }, neck: { bow: '#8fb4e8' },
          skirt: { c: '#6b5b9b', len: 0.34, flare: 3.2, hem: 'lace', trim: '#f1ecf6', plaid: '#8a7cc0' },
          legs: { c: ['#efe6dc', '#efe6dc', '#efe6dc'], bows: '#f2a2bc', band: '#26222e' },
          shoes: { c: '#f5b8cc', sole: '#e89ab4', type: 'slipper' },
          hair: { pony: null, headband: '#7d9be8', headbandFrill: '#f4f2fa' },
          hearing: true,
        },
      },
    },
    magna: {
      body: 'woman', skin: SKIN, eye: EYES.magna, horn: { pal: HORNS.magna, r: 0.5, turn: 1.72, out: 0.62, w: 0.29, psi: 1.1, y: -0.6 }, ear: 'sheep', sheepEar: 1,
      glasses: { shape: 'round', c: '#3a2a2a' },
      hair: {
        pal: HAIR.magna, cap: 1.12, side: 0.92, sideW: 0.16, part: 0.0,
        bangs: [[-1.1, 0.34, 0.1], [-0.78, 0.46, 0.2], [-0.42, 0.12, -0.35], [-0.08, 0.02, 0.1], [0.3, 0.14, 0.35], [0.66, 0.44, -0.2], [1.02, 0.36, -0.1]],
        back: { len: 3.0, w: 1.26, n: 7, wave: 0.09, top: -0.15 },
        locks: { len: 2.2, w: 0.24, psi: 1.42, y0: 0.46, wave: 0.08 },
        ahoge: { psi: -0.2, len: 0.32, curl: 0.6 }, pony: null, braid: null,
      },
      def: 'field',
      outfits: {
        field: {
          top: '#5a3d45', sleeve: ['#efe7da', '#efe7da'], collar: { type: 'turtle', c: '#5a3d45' },
          pants: { c: '#5c5349', w: [5.0, 4.4], tuck: true },
          coat: { c: '#efe7da', sh: '#d4c7b4', lining: '#b8323b', len: 0.66, open: 0.34, stripes: '#c23b3b', tatter: false },
          shoes: { c: '#4a372c', sole: '#241812', type: 'boot' },
          hair: { back: { len: 2.7, w: 1.1, n: 5, wave: 0.08, top: -0.15 }, pony: { psi: 3.14, y: 0.55, len: 2.3, w: 0.42, low: true, bow: ['#b8323b', '#b8323b'] }, locks: { len: 1.2, w: 0.22, psi: 1.32, y0: 0.44, wave: 0.07 } },
          belt: '#6b4a34', gear: ['backpack'], hammerBelt: true,
        },
        home: {
          top: '#8d6a95', sleeve: ['#7a5a84', '#7a5a84'], collar: { type: 'turtle', c: '#8d6a95' },
          skirt: { c: '#8d6a95', len: 0.86, flare: 3.0, hem: 'plain', trim: '#6e4f78' }, lacing: '#6e4f78',
          shawl: { c: '#eaa8c4', fringe: '#d98aa8' },
          legs: { c: ['#8a2d34', '#8a2d34', '#8a2d34'] },
          shoes: { c: '#d8c8ec', sole: '#b9a8d2', type: 'slipper' },
          pendant: '#e8c060',
        },
      },
    },
    katia: {
      body: 'man', skin: SKIN, eye: EYES.katia, horn: { pal: HORNS.katia, r: 0.6, turn: 1.6, out: 0.82, w: 0.33, psi: 1.16, y: -0.58, swept: 1 }, ear: 'sheep', sheepEar: 0.95,
      glasses: { shape: 'rect', c: '#2a2020' },
      hair: {
        pal: HAIR.katia, cap: 1.13, side: 0.78, sideW: 0.15, part: 0.35, messy: 1, curly: 1,
        bangs: [[-1.12, 0.3, 0.15], [-0.8, 0.44, 0.3], [-0.46, 0.2, 0.45], [-0.16, 0.44, 0.5], [0.16, 0.22, 0.55], [0.48, 0.48, 0.4], [0.84, 0.3, 0.3], [1.14, 0.42, 0.2]],
        back: { len: 1.62, w: 1.18, n: 6, wave: 0.075, top: -0.15, curl: 1.3 },
        locks: null,
        ahoge: { psi: 0.1, len: 0.5, curl: 0.8 }, pony: null, braid: null,
      },
      def: 'suit',
      outfits: {
        suit: {
          top: '#f6f4ef', vest: { c: '#7c6a5c', knit: '#6a5a4e' }, sleeve: ['#f6f4ef', '#f6f4ef'], cuff: '#ffffff', collar: { type: 'shirt', c: '#ffffff' }, neck: { tie: '#c4342e' },
          pants: { c: '#3b3745', w: [5.4, 4.8] },
          shoes: { c: '#5a3a2a', sole: '#2a1a12', type: 'shoe' },
        },
        field: {
          top: '#f6f4ef', sleeve: ['#8c7c56', '#8c7c56'], cuff: '#7a6a48', collar: { type: 'shirt', c: '#ffffff' }, neck: { tie: '#c4342e' },
          jacket: { c: '#8c7c56', sh: '#6e6040', open: 0.36, len: 0.22, pockets: true, lining: '#6e6040' }, gear: ['bag'], bag: { c: '#6a4a36', dev: '#c8a060' }, strap: '#5a3e2c',
          pants: { c: '#4e4a40', w: [5.4, 4.8], tuck: true },
          shoes: { c: '#4a372c', sole: '#241812', type: 'boot' },
        },
        home: {
          top: '#2f3552', sleeve: ['#d9c8b0', '#d9c8b0'], collar: { type: 'shirt', c: '#2f3552' },
          cardigan: { c: '#d9c8b0', knit: '#c2b094' },
          pants: { c: '#8e87b5', w: [5.6, 5.0] },
          shoes: { c: '#c9c2e0', sole: '#a89fc8', type: 'slipper' },
        },
      },
    },
    fontaine: {
      body: 'teenM', skin: SKIN, eye: EYES.fontaine, horn: null, ear: 'human', halo: { c: '#ffe38a', glow: '255,226,140' }, wings: { c: '#ffffff', edge: '#e8d69a', glow: '255,246,220' },
      hair: {
        pal: HAIR.fontaine, cap: 1.1, side: 0.66, sideW: 0.12, part: -0.3,
        bangs: [[-1.1, 0.26, 0.3], [-0.8, 0.12, 0.45], [-0.5, 0.3, 0.5], [-0.2, 0.08, 0.55], [0.1, 0.34, 0.55], [0.42, 0.14, 0.45], [0.74, 0.32, 0.35], [1.08, 0.22, 0.2]],
        back: { len: 1.12, w: 1.06, n: 5, wave: 0.04, top: -0.15 },
        locks: { len: 0.9, w: 0.17, psi: 1.36, y0: 0.42, wave: 0.03 }, ahoge: { psi: -0.3, len: 0.26, curl: 1.4 }, pony: null, braid: null,
      },
      def: 'default',
      outfits: {
        default: {
          top: '#f7f6f2', vest: { c: '#2e3a5c' }, blazer: true, sleeve: ['#2e3a5c', '#2e3a5c'], cuff: '#f7f6f2', collar: { type: 'shirt', c: '#ffffff' }, neck: { ribbon: '#5b8ee0' }, buttons: '#e8c060',
          pants: { c: '#5b5f70', w: [4.8, 4.2] },
          shoes: { c: '#2a2428', sole: '#141014', type: 'shoe' },
        },
      },
    },
    liese: {
      body: 'teen', skin: SKIN, eye: EYES.liese, horn: null, ear: 'rabbit', freckles: '#d9926e',
      hair: {
        pal: HAIR.liese, cap: 1.1, side: 0.8, sideW: 0.13, part: 0.1,
        bangs: [[-1.08, 0.26, 0.2], [-0.72, 0.3, 0.3], [-0.38, 0.14, 0.4], [-0.06, 0.3, 0.45], [0.26, 0.16, 0.4], [0.58, 0.32, 0.35], [0.9, 0.24, 0.25], [1.12, 0.3, 0.15]],
        back: { len: 1.18, w: 1.08, n: 5, wave: 0.05, top: -0.15 },
        locks: { len: 0.95, w: 0.19, psi: 1.42, y0: 0.44, wave: 0.05 },
        ahoge: null, pony: null, braid: { psi: 1.9, y: 0.5, len: 2.35, w: 0.3, tie: '#2f6a52' },
      },
      def: 'default',
      outfits: {
        default: {
          top: '#f6eee0', sleeve: ['#f6eee0', '#f6eee0'], puff: true, collar: { type: 'peter', c: '#ffffff' }, neck: { bow: '#2f6a52' },
          pinafore: '#7a2e42', skirt: { c: '#7a2e42', len: 0.5, flare: 4.2, hem: 'plain', trim: '#5e2233' },
          legs: { c: ['#fff0e6', '#fff0e6', '#f6f2ea'], sock: 0.3 },
          shoes: { c: '#6b3f2a', sole: '#3a2216', type: 'boot' },
        },
      },
    },
    keller: {
      body: 'elder', skin: SKIN_K, eye: EYES.keller, horn: null, ear: 'feather', feather: { c: '#3b3b46', tip: '#b8b8c8' },
      glasses: { shape: 'round', c: '#d6ab52', thin: 1 }, wrinkles: true, earring: '#e8e0d0',
      hair: {
        pal: HAIR.keller, cap: 1.1, side: 0.95, sideW: 0.12, part: 0.45, straight: 1,
        bangs: [[-1.1, 0.46, 0.1], [-0.76, 0.26, 0.4], [-0.42, 0.04, 0.6], [-0.12, -0.06, 0.7], [0.2, 0.1, 0.65], [0.52, 0.34, 0.55], [0.84, 0.5, 0.4], [1.12, 0.6, 0.2]],
        back: { len: 2.7, w: 1.1, n: 6, wave: 0.02, top: -0.15 },
        locks: { len: 1.9, w: 0.22, psi: 1.42, y0: 0.46, wave: 0.02 },
        ahoge: null, pony: null, braid: null,
      },
      def: 'default',
      outfits: {
        default: {
          top: '#f7f7f4', sleeve: ['#f7f7f4', '#f7f7f4'], cuff: '#ffffff', collar: { type: 'shirt', c: '#ffffff' }, neck: { kerchief: '#2f8a7c', pat: '#c8423c' },
          capelet: { c: '#c79a5c', sh: '#a87c44' },
          pants: { c: '#9c7d50', w: [5.2, 4.6], cargo: '#86683e', tuck: false },
          shoes: { c: '#27232b', sole: '#121014', type: 'boot', lace: '#8a5ab8' },
          strap: '#8a5ab8', bag: { c: '#2c2c34', dev: '#3f7fc4' },
        },
      },
    },
    doctor: {
      body: 'man', skin: SKIN, eye: EYES.katia, horn: null, ear: 'none', hooded: true,
      hair: null,
      def: 'default',
      outfits: {
        default: {
          top: '#1f2130', sleeve: ['#2d3042', '#2d3042'], cuff: '#23263a',
          coat: { c: '#2d3042', sh: '#22253a', lining: '#3a3e54', len: 0.62, open: 0.22, stripes: null, tatter: false, hoodie: true },
          pants: { c: '#23242e', w: [5.0, 4.5] },
          shoes: { c: '#1a1a20', sole: '#0c0c10', type: 'boot' },
          hood: { c: '#2d3042', sh: '#1c1e2c', face: '#0d0e16' },
        },
      },
    },
  };

  const META = {
    'adele-child': { name: '阿黛尔（童年）', species: '卡普里尼', scale: 0.6, desc: '十来岁的小学者。长长的棕色卷发、一对小羊角，背着塞满笔记的书包。' },
    'adele-caster': { name: '艾雅法拉', species: '卡普里尼', scale: 0.8, desc: '罗德岛术师干员。白色兜帽外套、红色系带、助听耳机、黑色法杖。' },
    'adele-alter': { name: '纯烬艾雅法拉', species: '卡普里尼', scale: 0.84, desc: '穿着母亲的火山防护外套，法杖上开着白色的枝与彩色的叶。' },
    magna: { name: '玛格娜', species: '卡普里尼', scale: 0.94, desc: '母亲。自然环境与生态学者，穿那件后来留给女儿的火山防护外套。' },
    katia: { name: '卡提亚', species: '卡普里尼', scale: 1, desc: '父亲。源石技艺学院的教授，眼镜、红领带，喜欢逗女儿笑。' },
    fontaine: { name: '芳汀', species: '萨科塔', scale: 0.74, desc: '同一位教授课上的同学，头顶光环。' },
    liese: { name: '莉瑟', species: '卡特斯（本页原创）', scale: 0.7, original: true, desc: '莱塔尼亚的同学，背着大提琴，麻花辫，爱笑。本页原创角色。' },
    keller: { name: '阿黛尔·凯勒', species: '黎博利', scale: 0.97, desc: '汐斯塔火山博物馆馆长，瑙曼夫妇的挚友。' },
    dolly: { name: '多利', species: '羊之兽主', scale: 1.2, desc: '守护着她的羊之兽主，化作一群看不见的小羊。' },
    'sheep-black': { name: '小黑羊', species: '', scale: 0.3, desc: '温顺、嗜睡，一高兴就发烫。' },
    'sheep-pink': { name: '粉色小羊', species: '', scale: 0.28, desc: '多利的化身，时隐时现，爱啃东西。' },
    doctor: { name: '博士', species: '', scale: 1, desc: '她口中的“前辈”。' },
    crowd: { name: '路人', species: '', scale: 0.95, desc: '' },
  };

  /* ================================================================
   * 动作：pose 预设 = 下半身（legs）+ 上半身（arms）+ 头 + 默认表情
   * ================================================================ */
  const VIEW = { three: 0.52, front: 0, side: HP, profile: HP, back: PI, back3: PI - 0.62 };
  const PRESET = {
    stand: { legs: 'stand', arms: 'rest' },
    walk: { legs: 'walk', arms: 'swing' },
    run: { legs: 'run', arms: 'pump' },
    'walk-away': { legs: 'walk', arms: 'swing', view: 'back' },
    'run-away': { legs: 'run', arms: 'pump', view: 'back' },
    sit: { legs: 'sit', arms: 'lap' },
    'sit-ground': { legs: 'sit-ground', arms: 'prop-back' },
    'hug-knees': { legs: 'hug-knees', arms: 'hug-knees', head: 'down' },
    kneel: { legs: 'kneel', arms: 'knee' },
    kneel2: { legs: 'kneel2', arms: 'lap' },
    crouch: { legs: 'crouch', arms: 'knee' },
    pet: { legs: 'crouch', arms: 'pet', head: 'down', expr: 'smile' },
    tiptoe: { legs: 'tiptoe', arms: 'rest' },
    sleep: { legs: 'sit', arms: 'sleep', head: 'sleep', expr: 'closed' },
    wave: { legs: 'stand', arms: 'wave', expr: 'smile' },
    wave2: { legs: 'stand', arms: 'wave2', expr: 'smile' },
    point: { legs: 'stand', arms: 'point' },
    hug: { legs: 'stand', arms: 'hug', expr: 'content' },
    reach: { legs: 'tiptoe', arms: 'reach' },
    'reach-up': { legs: 'tiptoe', arms: 'reach-up', head: 'up' },
    jump: { legs: 'jump', arms: 'cheer', expr: 'laugh' },
    'look-up': { legs: 'stand', arms: 'rest', head: 'up' },
    hold: { legs: 'stand', arms: 'hold' },
    'hold-up': { legs: 'tiptoe', arms: 'hold-up', head: 'up' },
    write: { legs: 'sit', arms: 'write', head: 'down' },
    read: { legs: 'stand', arms: 'read', head: 'down' },
    dig: { legs: 'kneel', arms: 'dig', head: 'down' },
    lie: { legs: 'lie', arms: 'lie' },
    record: { legs: 'stand', arms: 'record' },
    listen: { legs: 'stand', arms: 'listen', expr: 'closed' },
    turn: { legs: 'stand', arms: 'rest', view: 'back3', head: 'turn' },
    cheer: { legs: 'stand', arms: 'cheer', expr: 'laugh' },
    clap: { legs: 'stand', arms: 'clap', expr: 'smile' },
    think: { legs: 'stand', arms: 'think' },
    clasp: { legs: 'stand', arms: 'clasp' },
    stretch: { legs: 'tiptoe', arms: 'stretch', head: 'up', expr: 'closed' },
    carry: { legs: 'stand', arms: 'carry' },
    shade: { legs: 'stand', arms: 'shade', head: 'far' },
    cover: { legs: 'stand', arms: 'cover', expr: 'surprise' },
    wipe: { legs: 'stand', arms: 'wipe', expr: 'tearful', head: 'down' },
    hips: { legs: 'stand', arms: 'hips', expr: 'determined' },
    conduct: { legs: 'stand', arms: 'conduct', expr: 'laugh' },
    play: { legs: 'sit', arms: 'play', head: 'tilt', expr: 'closed' },
    bow: { legs: 'stand', arms: 'clasp-low', lean: 0.72 },
    float: { legs: 'float', arms: 'float' },
    twirl: { legs: 'twirl', arms: 'twirl', expr: 'laugh' },
    hand: { legs: 'stand', arms: 'hand' },
    pocket: { legs: 'stand', arms: 'pocket' },
    cross: { legs: 'stand', arms: 'cross' },
    nod: { legs: 'stand', arms: 'rest', head: 'nod', expr: 'smile' },
  };

  function legSet(L, a, b, k, fp) { L.a = a; L.b = b; L.k = k; L.fp = fp; L.ik = 0; }
  function legIK(L, s, v, f, ps, pv, pf, fp) { L.ik = 1; L.tg[0] = s; L.tg[1] = v; L.tg[2] = f; L.pole[0] = ps; L.pole[1] = pv; L.pole[2] = pf; L.fp = fp || 0; L.a = 0; L.b = 0; L.k = 0; }

  const LEGS = {
    stand(B, o, P, t) {
      const sw = sin(t * 0.8 + P.seed * 6);
      legSet(P.L[0], 0.04 + 0.015 * sw, 0.04, 0.05, 0);
      legSet(P.L[1], -0.05 - 0.015 * sw, 0.06, 0.07, 0);
      P.hipS = 0.3 * sw;
    },
    tiptoe(B, o, P, t) {
      LEGS.stand(B, o, P, t);
      P.L[0].fp = -0.8; P.L[1].fp = -0.8;
    },
    walk(B, o, P, t, sp) {
      const cyc = 0.92 * sp, ph = TAU * cyc * t;
      P.mv = 1; P.ph = ph; P.cyc = cyc;
      for (let i = 0; i < 2; i++) {
        const q = ph + i * PI, L = P.L[i], sw = max(0, cos(q + 0.3));
        L.ik = 0; L.a = 0.4 * sin(q); L.b = 0.03;
        L.k = 0.07 + 0.95 * pow(sw, 1.3) + 0.12 * max(0, sin(q - HP));
        L.fp = 0.2 * pow(max(0, sin(q)), 6) - 0.42 * pow(sw, 1.4);
      }
      P.lean = 0.05;
    },
    run(B, o, P, t, sp) {
      const cyc = 1.38 * sp, ph = TAU * cyc * t;
      P.mv = 1; P.run = 1; P.ph = ph; P.cyc = cyc;
      for (let i = 0; i < 2; i++) {
        const q = ph + i * PI, L = P.L[i], sw = max(0, cos(q + 0.45));
        L.ik = 0; L.a = 0.12 + 0.72 * sin(q); L.b = 0.04;
        L.k = 0.3 + 1.55 * pow(sw, 1.1);
        L.fp = -0.55 * sw;
      }
      P.lean = 0.2;
      P.lift = 2.6 * pow(sin(ph), 2);
    },
    sit(B, o, P, t) {
      const kneeH = B.shin + B.ank;
      const seat = o.seat != null ? o.seat / P.S : kneeH;
      P.ground = 0; P.hipV = -(seat + 1.4);
      P.seatV = -seat;
      const dangle = seat - kneeH;
      for (let i = 0; i < 2; i++) {
        const L = P.L[i], sd = i ? -1 : 1;
        if (dangle > 1.5) {
          const kick = P.kid ? 0.34 * sin(t * 3.0 + i * PI) : 0.07 * sin(t * 1.1 + i * 2);
          legSet(L, HP - 0.1, 0.07, HP - 0.18 + kick - min(0.5, dangle * 0.03), -0.25);
        } else legIK(L, sd * (B.hipJ + 0.7), -B.ank, B.thigh * 0.95 - i * 1.2, 0, -1, 1, 0);
      }
      P.lean = -0.02;
    },
    'sit-ground'(B, o, P, t) {
      P.ground = 0; P.hipV = -2.6; P.seatV = 0;
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; legIK(P.L[i], sd * (B.hipJ + 0.9), -B.ank * 0.8, B.thigh + B.shin * 0.78 - i * 2.5, 0, -1, 0.2, 0.25); }
      P.lean = -0.1;
    },
    'hug-knees'(B, o, P, t) {
      P.ground = 0; P.hipV = -2.6; P.seatV = 0;
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; legIK(P.L[i], sd * (B.hipJ + 0.2), -B.ank, B.thigh * 0.62 - i * 0.8, 0, -1, 1, 0); }
      P.lean = 0.3;
    },
    kneel(B, o, P, t) {
      P.ground = 0; P.hipV = -(B.thigh + 1.9);
      legSet(P.L[0], 0.02, 0.05, HP + 0.02, PI);
      legIK(P.L[1], -(B.hipJ + 0.5), -B.ank, B.thigh * 0.9, 0, -1, 1, 0);
      P.lean = 0.08;
    },
    kneel2(B, o, P, t) {
      P.ground = 0; P.hipV = -(B.legW[1] + 4.3);
      for (let i = 0; i < 2; i++) legSet(P.L[i], 1.25, 0.06, 1.25 + HP, PI);
      P.lean = 0.02;
    },
    crouch(B, o, P, t) {
      P.ground = 0; P.hipV = -(B.leg * 0.44);
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; legIK(P.L[i], sd * (B.hipJ + 1.2), -B.ank, 2.6 - i * 1.8, sd * 0.35, -1, 1, 0); }
      P.lean = 0.36;
    },
    jump(B, o, P, t, sp) {
      let a, v;
      if (o.air != null) { a = clamp(o.air); v = 0; } else { const per = 0.9 / sp, q = fract(t / per); a = sin(PI * q); v = cos(PI * q); }
      P.air = a; P.vy = v;
      legSet(P.L[0], 0.35 + 0.45 * a, 0.05, 0.4 + 0.9 * a, -0.3 * a);
      legSet(P.L[1], -0.05 + 0.3 * a, 0.07, 0.6 + 0.8 * a, -0.35 * a);
      if (a < 0.22) { const sq = (0.22 - a) / 0.22; P.L[0].k += 0.55 * sq; P.L[1].k += 0.55 * sq; P.L[0].a += 0.28 * sq; P.L[1].a += 0.28 * sq; }
      P.lift = a * B.leg * 0.42;
      P.lean = 0.04 - 0.1 * v * a;
    },
    float(B, o, P, t) {
      const a = o.air != null ? o.air : 0.35;
      P.ground = 0; P.hipV = B.hipY - a * B.leg * 0.9 - 1.6 * sin(t * 1.3);
      legSet(P.L[0], 0.28 + 0.08 * sin(t * 1.1), 0.05, 0.55 + 0.1 * sin(t * 1.1 + 1), -0.5);
      legSet(P.L[1], -0.12 + 0.08 * sin(t * 1.1 + 2), 0.08, 0.35 + 0.1 * sin(t * 1.2), -0.55);
      P.floaty = 1; P.lean = -0.05 + 0.04 * sin(t * 0.9);
    },
    twirl(B, o, P, t, sp) {
      LEGS.tiptoe(B, o, P, t);
      P.spin = t * 4.4 * sp; P.twirl = 1;
    },
    lie(B, o, P, t) {
      legSet(P.L[0], 0.03, 0.05, 0.06, 0.3);
      legSet(P.L[1], -0.02, 0.08, 0.12, 0.3);
      P.lie = 1;
    },
  };

  /* ---- 手臂：fk = 角度（a 前后摆，0 = 垂下；b 向外张开），ik = 手的目标点 ---- */
  function fk(A, a1, b1, a2, b2, hand) { A.ik = 0; A.a1 = a1; A.b1 = b1; A.a2 = a2; A.b2 = b2; A.hand = hand || 'open'; }
  /** 躯干坐标（s 侧向，按这只手所在的一侧取正；u 自髋向上；f 向前）里的目标点 */
  function ikT(P, A, sd, s, u, f, ps, pu, pf, hand) {
    A.ik = 1;
    tfp(P, sd * s, u, f, A.tg);
    // 极向量：躯干坐标 → 角色坐标
    A.pole[0] = sd * ps; A.pole[1] = P.U[1] * pu + P.F[1] * pf; A.pole[2] = P.U[2] * pu + P.F[2] * pf;
    A.hand = hand || 'grip';
  }
  /** 角色坐标里的目标点 */
  function ikW(A, s, v, f, ps, pv, pf, hand) {
    A.ik = 1; A.tg[0] = s; A.tg[1] = v; A.tg[2] = f; A.pole[0] = ps; A.pole[1] = pv; A.pole[2] = pf; A.hand = hand || 'grip';
  }
  function tfp(P, s, u, f, out) {
    out[0] = P.H[0] + s;
    out[1] = P.H[1] + P.U[1] * u + P.F[1] * f;
    out[2] = P.H[2] + P.U[2] * u + P.F[2] * f;
    return out;
  }
  /** 手臂 / 头 的比例：Q 版小孩的手臂比头的半径还短，举手的高度要跟着降（否则手臂会横穿脸） */
  const armK = (B) => sstep(0.72, 1.2, (B.up + B.fo) / B.R);
  const ARMS = {
    rest(B, o, P, t) {
      const br = P.br * 0.025;
      fk(P.A[0], 0.07 + br, 0.17, 0.3 + br, 0.1, 'open');
      fk(P.A[1], 0.03 + br, 0.15, 0.26 + br, 0.1, 'open');
    },
    swing(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const q = P.ph + i * PI, a1 = 0.05 - 0.52 * sin(q); fk(P.A[i], a1, 0.16, a1 + 0.24 + 0.4 * max(0, -sin(q)), 0.1, 'open'); }
    },
    pump(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const q = P.ph + i * PI, a1 = 0.2 - 0.85 * sin(q); fk(P.A[i], a1, 0.24, a1 + 1.5, 0.12, 'fist'); }
    },
    lap(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const K = P.L[i].kn, sd = i ? -1 : 1; ikW(P.A[i], K[0] - sd * 0.4, K[1] - 2.4, K[2] - 3.8, sd * 0.8, 0.4, -0.6, 'open'); }
    },
    knee(B, o, P, t) {
      const K = P.L[1].ik ? P.L[1].kn : P.L[0].kn;
      ikW(P.A[0], K[0] + 1.6, K[1] - 2.2, K[2] - 1.0, 0.8, 0.5, -0.6, 'open');
      ikW(P.A[1], K[0] - 0.8, K[1] - 2.6, K[2] - 2.2, -0.8, 0.5, -0.6, 'open');
    },
    'prop-back'(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikW(P.A[i], sd * (B.W[0] + 3.2), -1.3, P.H[2] - 7.5, sd * 0.3, 0.2, -1, 'flat'); }
    },
    'hug-knees'(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const K = P.L[i].kn, An = P.L[i].an, sd = i ? -1 : 1; ikW(P.A[i], (K[0] + An[0]) * 0.5 - sd * 0.6, (K[1] + An[1]) * 0.5 - 1, max(K[2], An[2]) + 2.6, sd, 0, -0.4, 'grip'); }
    },
    sleep(B, o, P, t) {
      const desk = P.desk;
      ikW(P.A[0], -1.2, -desk - 1.3, 9.5, 1, 0.3, 0, 'open');
      ikW(P.A[1], 1.6, -desk - 1.1, 8.5, -1, 0.3, 0, 'open');
    },
    wave(B, o, P, t) {
      // 手在头的一侧挥（目标点按头的大小算，Q 版的大头也挡不住）
      const Hd = P.head3, R = B.R, w = sin(t * 8.5);
      const kk = armK(B);
      // 3/4 与正面：手在头的外侧；越接近正侧面，手越往脸前面挪（否则会被头挡住）
      const a = min(1, abs(P.cy) * 1.6), side = R * (1.42 + 0.55 * kk + 0.1 * w) / max(0.55, abs(P.cy));
      ikW(P.A[0], Hd[0] + side * a, Hd[1] + R * (lerp(0.12, -0.2, kk) - 0.08 * w), Hd[2] + R * (1.25 * (1 - a) - 0.05), 1, 0.9, -0.3, 'flat');
      ARMS.restF(B, o, P, t);
    },
    restF(B, o, P, t) { fk(P.A[1], 0.03 + P.br * 0.025, 0.15, 0.26, 0.1, 'open'); },
    restN(B, o, P, t) { fk(P.A[0], 0.07 + P.br * 0.025, 0.17, 0.3, 0.1, 'open'); },
    wave2(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1, w = sin(t * 8 + i * PI); const a = min(1, abs(P.cy) * 1.6); ikW(P.A[i], Hd[0] + sd * R * (1.42 + 0.45 * armK(B) + 0.12 * w) * a, Hd[1] + R * (lerp(0.16, -0.2, armK(B)) - 0.08 * w), Hd[2] + R * 1.2 * (1 - a), sd, 0.9, -0.3, 'flat'); }
    },
    point(B, o, P, t) {
      // 近侧手臂横过身体指向面朝的方向（Q 版手臂短，允许拉长一点）
      const aim = o.aim != null ? o.aim : 0.15, L = (B.up + B.fo) * 1.55, Sh = P.A[0].sh;
      const cross = 0.42 * abs(P.cy);
      ikW(P.A[0], Sh[0] - L * cross, Sh[1] - L * sin(aim), Sh[2] + L * cos(aim) * (1 - cross * 0.3), 1, 0.8, -0.3, 'point');
      ARMS.restF(B, o, P, t);
    },
    hug(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, -1.4, 0.6 * B.T, B.Dp[3] + 6.5, 1, -0.3, -0.3, 'open'); }
    },
    reach(B, o, P, t) {
      const aim = o.aim != null ? o.aim : 0.35, L = (B.up + B.fo) * 1.45, cross = 0.35 * abs(P.cy);
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1, Sh = P.A[i].sh, a = aim - i * 0.2; ikW(P.A[i], Sh[0] + (i ? L * 0.1 : -L * cross), Sh[1] - L * sin(a), Sh[2] + L * cos(a), sd, 0.6, -0.4, 'open'); }
    },
    'reach-up'(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      const kk = armK(B);
      ikW(P.A[0], Hd[0] + R * 1.3, Hd[1] + R * lerp(0.05, -0.85, kk), Hd[2] + R * 0.25, 1, 0.8, -0.3, 'open');
      ikW(P.A[1], Hd[0] - R * 1.36, Hd[1] + R * lerp(0.22, -0.45, kk), Hd[2] + R * 0.2, -1, 0.8, -0.3, 'open');
    },
    cheer(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1, b = 0.1 * sin(t * 6 + i); ikW(P.A[i], Hd[0] + sd * R * 1.38, Hd[1] + R * (lerp(0.22, -0.62, armK(B)) - b), Hd[2] + R * 0.1, sd, 0.9, -0.3, 'fist'); }
    },
    stretch(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikW(P.A[i], Hd[0] + sd * R * 1.32, Hd[1] + R * lerp(0.1, -0.8, armK(B)), Hd[2] - R * 0.1, sd, 0.9, -0.2, 'open'); }
    },
    hold(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, 1.7, 0.56 * B.T, B.Dp[3] + 5.2, 1, -1, -0.2, 'grip'); }
    },
    'hold-up'(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      const kk = armK(B);
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikW(P.A[i], Hd[0] + sd * R * lerp(0.3, 0.8, kk), Hd[1] + R * lerp(0.62, -1.5, kk), Hd[2] + R * lerp(1.15, 0.3, kk), sd, 0.6, -0.4, 'grip'); }
    },
    read(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, 2.5, 0.5 * B.T, B.Dp[3] + 5.6, 1, -1, 0, 'grip'); }
    },
    write(B, o, P, t) {
      const desk = P.desk;
      ikW(P.A[0], 1.4 + 0.8 * sin(t * 5.2), -desk - 1.1, 9 + 0.5 * sin(t * 10.4), 1, 0.6, -0.3, 'grip');
      ikW(P.A[1], -3.2, -desk - 0.9, 8.2, -1, 0.6, -0.3, 'flat');
    },
    dig(B, o, P, t) {
      const q = t * 4.2;
      ikW(P.A[0], 1.8, -2.6 - 3.6 * pow(max(0, sin(q)), 2), 10 + 1.4 * cos(q), 1, -0.2, -0.5, 'grip');
      const K = P.L[1].kn;
      ikW(P.A[1], K[0] - 0.6, K[1] - 2.4, K[2] - 1.2, -0.8, 0.4, -0.6, 'open');
    },
    record(B, o, P, t) {
      ikT(P, P.A[0], 1, 0.9, 0.86 * B.T, B.Dp[3] + 7.8, 1, -1, -0.2, 'grip');
      ARMS.listenF(B, o, P, t);
    },
    listenF(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      ikW(P.A[1], Hd[0] - R * 0.98, Hd[1] + R * 0.12, Hd[2] - R * 0.05, -1, 0.6, -0.6, 'flat');
    },
    listen(B, o, P, t) { ARMS.restN(B, o, P, t); ARMS.listenF(B, o, P, t); },
    clap(B, o, P, t) {
      const k = pow(max(0, sin(t * 8)), 2);
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, 0.45 + 1.9 * k, 0.66 * B.T, B.Dp[3] + 5, 1, -1, 0, 'flat'); }
    },
    think(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      ikW(P.A[0], Hd[0] + R * 0.18, Hd[1] + R * 1.08, Hd[2] + R * 0.62, 1, 0.8, -0.2, 'fist');
      ikT(P, P.A[1], -1, -1.8, 0.46 * B.T, B.Dp[3] + 2.6, 1, -1, 0.2, 'flat');
    },
    clasp(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, 0.45, 0.72 * B.T, B.Dp[3] + 2.8, 1, -1, -0.1, 'grip'); }
    },
    'clasp-low'(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, 0.6, 0.08 * B.T, B.Dp[1] + 2.6, 1, -0.5, -0.4, 'grip'); }
    },
    carry(B, o, P, t) {
      fk(P.A[0], 0.04, 0.25, 0.05, 0.22, 'grip');
      ARMS.restF(B, o, P, t);
    },
    shade(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      ikW(P.A[0], Hd[0] + R * 0.25, Hd[1] - R * 0.42, Hd[2] + R * 1.15, 1, 0.3, -0.3, 'flat');
      ARMS.restF(B, o, P, t);
    },
    cover(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikW(P.A[i], Hd[0] + sd * R * 0.26, Hd[1] + R * 0.72, Hd[2] + R * 1.02, sd, 0.8, -0.2, 'flat'); }
    },
    wipe(B, o, P, t) {
      const Hd = P.head3, R = B.R, rub = 0.12 * sin(t * 9);
      ikW(P.A[0], Hd[0] + R * (0.42 + rub), Hd[1] + R * 0.34, Hd[2] + R * 1.02, 1, 0.8, -0.2, 'fist');
      ARMS.restF(B, o, P, t);
    },
    hips(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, B.W[0] + 1.3, 0.2 * B.T, 0.4, 1, 0, -1, 'fist'); }
    },
    conduct(B, o, P, t) {
      const q = t * 6.8;
      fk(P.A[0], 1.9 + 0.5 * sin(q), 0.35, 2.1 + 0.6 * sin(q + 0.9), 0.15, 'grip');
      fk(P.A[1], 1.0 + 0.35 * sin(q + PI), 0.45, 1.6 + 0.3 * sin(q + PI), 0.2, 'flat');
    },
    play(B, o, P, t) {
      // 大提琴在角色空间里：尾柱落在两膝之间的地上，琴颈靠向左肩（远侧肩）
      const L0 = P.L[0], L1 = P.L[1], sh = P.A[1].sh;
      const kx = (L0.kn[0] + L1.kn[0]) / 2, kz = max(L0.kn[2], L1.kn[2]);
      const C = P.cello || (P.cello = { b: v3(), t: v3() });
      C.b[0] = kx + 0.6; C.b[1] = -0.8; C.b[2] = kz + 1.2;
      C.t[0] = sh[0] - 2.2; C.t[1] = sh[1] - B.R * 0.35; C.t[2] = sh[2] + 3.5;
      const at = (k, i) => C.b[i] + (C.t[i] - C.b[i]) * k;
      ikW(P.A[1], at(0.8, 0) + 0.8, at(0.8, 1), at(0.8, 2) + 1.2, -1, 0.4, -0.3, 'grip');
      const bw = sin(t * 2.6);
      ikW(P.A[0], at(0.4, 0) + 3.5 + 4.5 * bw, at(0.4, 1) + 1.2 * bw, at(0.4, 2) + 2.8, 1, 0.3, -0.5, 'grip');
    },
    float(B, o, P, t) {
      for (let i = 0; i < 2; i++) fk(P.A[i], 0.55 + 0.12 * sin(t * 1.3 + i), 0.62, 0.8 + 0.15 * sin(t * 1.5 + i), 0.5, 'open');
    },
    twirl(B, o, P, t) {
      for (let i = 0; i < 2; i++) fk(P.A[i], 1.05, 1.2, 1.25, 1.15, 'open');
    },
    hand(B, o, P, t) {
      // o.hand（屏幕左 / 右）→ 近侧 / 远侧
      const want = o.hand || 'both';
      for (let i = 0; i < 2; i++) {
        const sd = i ? -1 : 1, left = P.nearLeft ? i === 0 : i === 1;
        if (want === 'both' || (want === 'left') === left) ikT(P, P.A[i], sd, 12.5, 0.02 * B.T, 1.8, 0.3, -1, -0.5, 'grip');
        else if (i) ARMS.restF(B, o, P, t); else ARMS.restN(B, o, P, t);
      }
    },
    pocket(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, B.W[0] + 0.2, 0.06 * B.T, 1.2, 1, 0, -1, 'hide'); }
    },
    cross(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, -3.4, 0.62 * B.T, B.Dp[3] + 2.4 - i * 0.6, 1, -0.4, 0.2, 'fist'); }
    },
    lie(B, o, P, t) {
      fk(P.A[0], 0.06, 0.3, 0.1, 0.25, 'open');
      fk(P.A[1], 0.04, 0.28, 0.08, 0.22, 'open');
    },
    pet(B, o, P, t) {
      const ph = o.petH != null ? o.petH / P.S : 9;
      ikW(P.A[0], 1.4, -ph, 13 + 1.8 * sin(t * 4), 1, 0.3, -0.5, 'flat');
      const K = P.L[1].kn;
      ikW(P.A[1], K[0] - 0.6, K[1] - 2.4, K[2] - 1.2, -0.8, 0.4, -0.6, 'open');
    },
  };

  /* ---- 3D 两段 IK：肩 S → 目标 T，上臂 a，前臂 b，极向量 pole（肘 / 膝朝向） ---- */
  function ik2(S, T, a, b, pole, outE, outW) {
    const dx = T[0] - S[0], dy = T[1] - S[1], dz = T[2] - S[2];
    const d0 = sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    const d = min(a + b - 1e-3, max(abs(a - b) + 1e-3, d0));
    const ux = dx / d0, uy = dy / d0, uz = dz / d0;
    const ca = (a * a + d * d - b * b) / (2 * a * d), sa = sqrt(max(0, 1 - ca * ca));
    const pd = pole[0] * ux + pole[1] * uy + pole[2] * uz;
    let vx = pole[0] - ux * pd, vy = pole[1] - uy * pd, vz = pole[2] - uz * pd;
    const vl = sqrt(vx * vx + vy * vy + vz * vz);
    if (vl < 1e-6) { vx = 0; vy = 1; vz = 0; } else { vx /= vl; vy /= vl; vz /= vl; }
    outE[0] = S[0] + (ux * ca + vx * sa) * a; outE[1] = S[1] + (uy * ca + vy * sa) * a; outE[2] = S[2] + (uz * ca + vz * sa) * a;
    outW[0] = S[0] + ux * d; outW[1] = S[1] + uy * d; outW[2] = S[2] + uz * d;
  }

  const HEADM = {
    up(P) { P.hp += 0.42; },
    down(P) { P.hp -= 0.34; },
    sleep(P) { P.hp -= 0.55; P.hr += 0.4; },
    tilt(P) { P.hr += 0.2; },
    far(P) { P.hp += 0.08; },
    nod(P, t) { P.hp -= 0.2 * pow(max(0, sin(t * 3.6)), 2); },
  };

  const v3 = () => [0, 0, 0];
  function newPose() {
    const leg = () => ({ a: 0, b: 0, k: 0, fp: 0, ik: 0, tg: v3(), pole: v3(), hj: v3(), kn: v3(), an: v3() });
    const arm = () => ({ ik: 0, a1: 0, b1: 0, a2: 0, b2: 0, hand: 'open', tg: v3(), pole: v3(), sh: v3(), el: v3(), wr: v3() });
    return { L: [leg(), leg()], A: [arm(), arm()], H: v3(), U: v3(), F: v3(), Sc: v3(), neck3: v3(), head3: v3(), j: {} };
  }

  /**
   * 解算骨架：输出角色坐标（单位 = 身高 1/100，脚底原点）里的 3D 关节与投影后的 2D 位置
   */
  function solve(B, C, o, S, P) {
    const t = (o.t || 0) + (o.phase || 0);
    let pn = o.pose;
    if (!PRESET[pn]) pn = 'stand';
    const pre = PRESET[pn];
    P.pose = pn; P.t = t; P.S = S;
    const sp = o.speed > 0 ? o.speed : 1;
    P.legsM = LEGS[o.legs] ? o.legs : (PRESET[o.legs] ? PRESET[o.legs].legs : pre.legs);
    P.armsM = ARMS[o.arms] ? o.arms : (PRESET[o.arms] ? PRESET[o.arms].arms : pre.arms);
    // 坐着又带着大提琴：自然就是在拉琴
    if (!o.arms && P.legsM === 'sit' && hasProp(o, 'cello')) P.armsM = 'play';
    P.expr = o.expr || pre.expr || 'neutral';
    P.seed = o.seed != null ? o.seed : C.seed || 0;
    P.kid = B === BODIES.child;
    P.lean = pre.lean || 0; P.hipS = 0; P.hipF = 0; P.ground = 1; P.lift = 0; P.hipV = B.hipY; P.seatV = null;
    P.mv = 0; P.run = 0; P.ph = 0; P.cyc = 0; P.air = 0; P.vy = 0; P.floaty = 0; P.twirl = 0; P.lie = 0; P.spin = 0;
    P.br = sin(TAU * t / 3.6 + P.seed * 3.1);
    P.hp = 0; P.hr = 0; P.hy = 0;
    P.desk = o.desk != null ? o.desk / S : (B.shin + B.ank) + B.T * 0.64;
    if (o.legs === 'sit' || P.legsM === 'sit') { /* 桌面高度按坐姿 */ } else if (o.desk == null) P.desk = -B.hipY + B.T * 0.42;

    // 朝向（先于腿：牵手要知道哪只手在屏幕左边）
    let yaw = o.yaw != null ? o.yaw : (VIEW[o.view] != null ? VIEW[o.view] : VIEW[pre.view] != null ? VIEW[pre.view] : VIEW.three);
    LEGS[P.legsM](B, o, P, t, sp);
    yaw += P.spin;
    yaw = ((yaw % TAU) + TAU) % TAU;
    P.mir = yaw > PI;
    if (P.mir) yaw = TAU - yaw;
    P.yaw = yaw; P.cy = cos(yaw); P.sy = sin(yaw);
    P.back = yaw > HP + 0.3;
    P.fx = (o.flip ? -1 : 1) * (P.mir ? -1 : 1);
    P.nearLeft = (P.cy >= 0) === (P.fx > 0);

    // 腿（相对髋）→ 着地
    const H = P.H;
    H[0] = P.hipS; H[1] = 0; H[2] = P.hipF;
    for (let i = 0; i < 2; i++) legFK(B, P, i);
    if (P.ground) {
      let low = -1e9;
      for (let i = 0; i < 2; i++) {
        const L = P.L[i];
        const c = L.an[1] + B.ank * cos(L.fp) + B.foot * 0.62 * max(0, -sin(L.fp));
        if (c > low) low = c;
      }
      P.hipV = -low - P.lift;
    }
    for (let i = 0; i < 2; i++) { const L = P.L[i]; L.hj[1] += P.hipV; L.kn[1] += P.hipV; L.an[1] += P.hipV; if (L.ik) L.tg[1] += 0; }
    // 腿的 IK 目标是地面坐标：重新解一次（此时髋高已知）
    H[1] = P.hipV;
    for (let i = 0; i < 2; i++) if (P.L[i].ik) legFK(B, P, i);

    // 躯干坐标系
    const lam = P.lean;
    P.U[0] = 0; P.U[1] = -cos(lam); P.U[2] = sin(lam);
    P.F[0] = 0; P.F[1] = sin(lam); P.F[2] = cos(lam);
    tfp(P, 0, B.T + P.br * 0.18, 0, P.Sc);
    // 头：随躯干前倾，但保持一部分直立
    const hl = lam * 0.55, hd = B.shY - B.headY;
    P.neck3[0] = P.Sc[0]; P.neck3[1] = P.Sc[1] - cos(lam) * 0.8; P.neck3[2] = P.Sc[2] + sin(lam) * 0.8;
    P.head3[0] = P.Sc[0] + P.hipS * 0.2; P.head3[1] = P.Sc[1] - cos(hl) * hd; P.head3[2] = P.Sc[2] + sin(hl) * hd;
    P.hp -= lam * 0.4;
    // 呼吸 / 走路时头的微动
    if (P.mv) { P.head3[1] += (P.run ? 0.9 : 0.45) * cos(2 * P.ph - 0.6); P.hp += (P.run ? -0.05 : 0.02) * sin(2 * P.ph); }
    else P.head3[1] += P.br * 0.12;
    // 头的姿态
    const hm = o.headPose || pre.head;
    if (hm && HEADM[hm]) HEADM[hm](P, t);
    P.hr += 0.025 * sin(t * 0.7 + P.seed) * (P.mv ? 0.4 : 1);

    // 手臂
    for (let i = 0; i < 2; i++) {
      const A = P.A[i], sd = i ? -1 : 1;
      tfp(P, sd * B.shJ, B.T - 1.25 + P.br * 0.22, 0, A.sh);
    }
    ARMS[P.armsM](B, o, P, t, sp);
    // 手里拿着小东西、手臂又没事做：前臂抬起来把它拿在身前（不然垂在身侧看不见）
    if (!o.arms && (P.armsM === 'rest') && firstHandProp(o)) ikT(P, P.A[0], 1, 1.4, 0.3 * B.T, B.Dp[3] + 3.6, 1, 0, -1, 'grip');
    // 撑伞：近侧手举高
    if (hasProp(o, 'umbrella') && !['wave', 'wave2', 'cheer', 'reach-up', 'stretch'].includes(P.armsM)) ikT(P, P.A[0], 1, 1.2, B.T + 1.5, B.Dp[3] + 4, 1, -1, -0.2, 'grip');
    for (let i = 0; i < 2; i++) armFK(B, P, i);

    // 头的朝向（视线）
    let lx = 0, ly = 0;
    if (o.look) { lx = (o.look[0] || 0) * P.fx; ly = o.look[1] || 0; }
    P.lookX = clamp(lx, -1, 1); P.lookY = clamp(ly, -1, 1);
    P.hy += P.lookX * 0.38; P.hp -= P.lookY * 0.3;
    if (hm === 'turn') {
      const k = o.turn != null ? clamp(o.turn) : 0.85;
      P.hy += -k * 1.45;
      P.lookX -= k * 0.4;
    }
    P.hyaw = yaw + P.hy;
    return P;
  }

  function legFK(B, P, i) {
    const L = P.L[i], sd = i ? -1 : 1, H = P.H;
    L.hj[0] = H[0] + sd * B.hipJ; L.hj[1] = H[1]; L.hj[2] = H[2];
    if (L.ik) {
      ik2(L.hj, L.tg, B.thigh, B.shin, L.pole, L.kn, L.an);
      return;
    }
    const ca = cos(L.a), sa = sin(L.a), cb = cos(L.b), sb = sin(L.b);
    L.kn[0] = L.hj[0] + sd * sb * B.thigh; L.kn[1] = L.hj[1] + ca * cb * B.thigh; L.kn[2] = L.hj[2] + sa * cb * B.thigh;
    const as = L.a - L.k, cs = cos(as), ss = sin(as);
    L.an[0] = L.kn[0] + sd * sb * 0.3 * B.shin; L.an[1] = L.kn[1] + cs * B.shin; L.an[2] = L.kn[2] + ss * B.shin;
  }
  function armFK(B, P, i) {
    const A = P.A[i], sd = i ? -1 : 1;
    if (A.ik) {
      // Q 版的手臂很短：够不着的目标（举过头顶）允许把手臂拉长一点（卡通的伸缩）
      const d = hypot(A.tg[0] - A.sh[0], A.tg[1] - A.sh[1], A.tg[2] - A.sh[2]);
      const st = clamp(d / ((B.up + B.fo) * 0.9), 1, 2.0);
      ik2(A.sh, A.tg, B.up * st, B.fo * st, A.pole, A.el, A.wr);
      A.st = st;
      return;
    }
    const st = 1 + 0.5 * sstep(1.6, 2.8, A.a1);
    A.st = st;
    // dir = F sin a cos b + L sd sin b + D cos a cos b（D = -U）
    const U = P.U, F = P.F;
    const d1 = (a, b, out, base, len) => {
      const sa = sin(a), ca = cos(a), sb = sin(b), cb = cos(b);
      out[0] = base[0] + (sd * sb) * len;
      out[1] = base[1] + (F[1] * sa * cb - U[1] * ca * cb) * len;
      out[2] = base[2] + (F[2] * sa * cb - U[2] * ca * cb) * len;
    };
    d1(A.a1, A.b1, A.el, A.sh, B.up * st);
    d1(A.a2, A.b2, A.wr, A.el, B.fo * st);
  }
  const hasProp = (o, name) => { const p = o.prop; return p === name || (Array.isArray(p) && p.includes(name)); };
  const LIFT_PROPS = { cassette: 1, popsicle: 1, letter: 1, stone: 1, flower: 1, soda: 1, mug: 1, recorder: 1, camera: 1, book: 1, notebook: 1, map: 1, wreath: 1, trowel: 1, hammer: 1 };
  const firstHandProp = (o) => { const p = o.prop; if (!p) return null; const a = Array.isArray(p) ? p : [p]; return a.find((x) => LIFT_PROPS[x]) || null; };

  /* ================================================================
   * 绘制小工具（D = 本次绘制的状态；sil 模式下所有颜色都换成剪影色，细节不画）
   * ================================================================ */
  function fillC(D, style) { const g = D.g; g.fillStyle = D.sil || style; g.fill(); }
  function fillP(D, p, style) { const g = D.g; g.fillStyle = D.sil || style; g.fill(p); }
  function inkC(D, w, color) { const g = D.g; g.lineWidth = w; g.strokeStyle = D.sil || color; g.stroke(); }
  function inkP(D, p, w, color) { const g = D.g; g.lineWidth = w; g.strokeStyle = D.sil || color; g.stroke(p); }
  function lineC(D, w, color) { if (D.sil) return; const g = D.g; g.lineWidth = w; g.strokeStyle = color; g.stroke(); }
  const SX = [new Float64Array(160), new Float64Array(160), new Float64Array(160), new Float64Array(160)];
  const SY = [new Float64Array(160), new Float64Array(160), new Float64Array(160), new Float64Array(160)];
  /** 过一串点画平滑曲线（中点二次插值） */
  function smooth(g, xs, ys, n, closed, move) {
    if (n < 2) return;
    if (closed) {
      const mx = (xs[n - 1] + xs[0]) / 2, my = (ys[n - 1] + ys[0]) / 2;
      if (move !== false) g.moveTo(mx, my); else g.lineTo(mx, my);
      for (let i = 0; i < n; i++) { const j = i + 1 < n ? i + 1 : 0; g.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[j]) / 2, (ys[i] + ys[j]) / 2); }
    } else {
      if (move !== false) g.moveTo(xs[0], ys[0]); else g.lineTo(xs[0], ys[0]);
      for (let i = 1; i < n - 1; i++) g.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
      g.lineTo(xs[n - 1], ys[n - 1]);
    }
  }
  function ellipseP(p, x, y, rx, ry, r) { p.moveTo(x + rx * cos(r), y + rx * sin(r)); p.ellipse(x, y, rx, ry, r, 0, TAU); }

  /* ================================================================
   * 头部（头部空间：颅骨半径 = 1，原点在颅骨中心，y 向下）
   * 五官都定义在球面上，按头的偏航 / 俯仰投影 —— 正面、3/4、侧面、背面用同一套画法
   * ================================================================ */
  function hproj(H, s, v, f, out) {
    const v2 = v * H.cp - f * H.sp, f2 = f * H.cp + v * H.sp;
    out[0] = -s * H.cy + f2 * H.sy; out[1] = v2; out[2] = s * H.sy + f2 * H.cy;
    return out;
  }
  function hsph(H, psi, y, rho, out) {
    const r = sqrt(max(0, 1 - y * y)) * rho;
    return hproj(H, r * sin(psi), y * rho, r * cos(psi), out);
  }
  const T3 = [0, 0, 0], T3b = [0, 0, 0], T3c = [0, 0, 0];

  function rayEllipse(dx, dy, ex, ey, rx, ry, rot) {
    const c = cos(rot), s = sin(rot);
    const dxr = dx * c + dy * s, dyr = -dx * s + dy * c;
    const cxr = ex * c + ey * s, cyr = -ex * s + ey * c;
    const irx = 1 / (rx * rx), iry = 1 / (ry * ry);
    const A = dxr * dxr * irx + dyr * dyr * iry, Bq = -2 * (dxr * cxr * irx + dyr * cyr * iry), Cq = cxr * cxr * irx + cyr * cyr * iry - 1;
    const disc = Bq * Bq - 4 * A * Cq;
    if (disc < 0) return 0;
    return (-Bq + sqrt(disc)) / (2 * A);
  }
  /** 脸的轮廓：颅骨圆 ∪ 下颌椭圆（∪ 侧面时的小鼻尖），按偏航缓存 */
  function facePath(H) {
    return pathCache('face:' + H.qk, () => {
      const p = new Path2D(), sy = H.sy, pt = H.pitch;
      const ex = 0.3 * sy, ey = 0.45 - 0.12 * pt, rx = 0.8 - 0.1 * abs(sy), ry = 0.55 + 0.03 * pt, rot = -0.18 * sy;
      const nose = abs(sy) > 0.72, nk = (abs(sy) - 0.72) / 0.28, nsx = sy > 0 ? 1 : -1;
      const N = 44, xs = SX[0], ys = SY[0];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU, dx = cos(a), dy = sin(a);
        let r = 1;
        const re = rayEllipse(dx, dy, ex, ey, rx, ry, rot);
        if (re > r) r = re;
        if (nose) { const rn = rayEllipse(dx, dy, nsx * (0.93 + 0.02 * nk), 0.43 - 0.1 * pt, 0.1 * nk + 0.01, 0.075 * nk + 0.01, 0); if (rn > r) r = rn; }
        xs[i] = dx * r; ys[i] = dy * r;
      }
      smooth(p, xs, ys, N, true);
      p.closePath();
      return p;
    });
  }
  function skinGrad(sk) {
    return radG('skin:' + sk.c, -0.34, -0.28, 0.05, 0.02, 0.12, 1.4, [0, lt(sk.c, 0.5), 0.42, sk.c, 0.78, mix(sk.c, sk.sh, 0.45), 1, sk.sh]);
  }

  /* ---- 头发的“帽子”（颅顶 + 刘海 + 鬓发），按偏航 / 俯仰缓存 ---- */
  function capPaths(D, H) {
    const hr = D.hair;
    return pathCache('cap:' + D.hkey + ':' + H.qk + ':' + (H.front ? 1 : 0), () => buildCap(H, hr));
  }
  function buildCap(H, hr) {
    const fill = new Path2D(), ink = new Path2D(), shade = new Path2D();
    const rc = hr.cap, cy0 = -0.04, side = hr.side;
    const wavy = (p, from, sweep, n) => {
      // 卷发：外轮廓是一串小波浪
      for (let k = 1; k <= n; k++) {
        const a1 = from - (k - 0.5) * sweep / n, a2 = from - k * sweep / n, rr = rc * (1.075 + 0.02 * (k % 2));
        p.quadraticCurveTo(cos(a1) * rr, cy0 + sin(a1) * rr, cos(a2) * rc, cy0 + sin(a2) * rc);
      }
    };
    if (!H.front) {
      if (hr.curly) { fill.moveTo(rc, cy0); wavy(fill, 0, TAU, 12); fill.closePath(); ink.addPath(fill); }
      else { fill.arc(0, cy0, rc, 0, TAU); ink.arc(0, cy0, rc, 0, TAU); }
      // 后脑勺：从发旋放射下来的发丝
      const strands = new Path2D();
      hsph(H, PI, -0.72, 1.0, T3b);
      const wx = T3b[0], wy = T3b[1];
      for (let k = 0; k < 9; k++) {
        const a = -0.2 + (k / 8) * (PI + 0.4), ex = wx + cos(a) * rc * 0.95, ey = wy + sin(a) * rc * 1.25 + 0.25;
        const ey2 = min(ey, cy0 + sqrt(max(0, rc * rc - (ex) * (ex))) * 0.95);
        strands.moveTo(wx + cos(a) * 0.12, wy + sin(a) * 0.1);
        strands.quadraticCurveTo(wx + cos(a) * rc * 0.55 + (k % 2 ? 0.08 : -0.08), wy + sin(a) * rc * 0.4 + 0.1, ex * 0.92, ey2);
      }
      // 发旋
      strands.moveTo(wx + 0.1, wy); strands.arc(wx, wy, 0.1, 0, PI * 1.5);
      return { fill, ink, shade: null, strands };
    }
    // 发际线的点（近侧 → 远侧，ψ 从 + 到 -）
    const pts = [];
    const push = (psi, y, rho, kind, bend) => {
      hsph(H, psi, y, rho, T3);
      let x = T3[0], yy = T3[1];
      if (T3[2] < 0.02) {
        const rr = lerp(1.0, rc, sstep(0.15, 0.7, y));
        const edge = sqrt(max(0, rr * rr - (yy - cy0) * (yy - cy0)));
        x = x >= 0 ? edge : -edge;
      }
      pts.push([x, yy, kind, bend || 0]);
    };
    const sideIn = 1.2 + (hr.sideW || 0.13) * 0.3;
    push(sideIn, side, 1.02, 'b');
    push(sideIn - 0.06, 0.12, 1.03, 'n');
    const bg = hr.bangs.slice().sort((a, b) => b[0] - a[0]);
    let prevPsi = sideIn - 0.06, prevY = 0.12;
    for (let i = 0; i < bg.length; i++) {
      const [psi, y, bend] = bg[i];
      const rPsi = (prevPsi + psi) / 2, rY = max(-0.34, min(prevY, y) - 0.3);
      push(rPsi, rY, 1.04, 'r');
      push(psi, y, 1.05, 't', bend);
      prevPsi = psi; prevY = y;
    }
    push((prevPsi - sideIn + 0.06) / 2, max(-0.34, prevY - 0.3), 1.04, 'r');
    push(-(sideIn - 0.06), 0.12, 1.03, 'n');
    push(-sideIn, side, 1.02, 'b');
    // 外轮廓（圆弧）两端
    const yb = min(side + 0.1, cy0 + rc * 0.98);
    const a0 = Math.asin(clamp((yb - cy0) / rc, -1, 1));
    const xr = rc * cos(a0), xl = -xr;
    const nb = pts[0], fb = pts[pts.length - 1];
    const build = (p, closeIt) => {
      p.moveTo(xr, yb);
      if (hr.curly) wavy(p, a0, PI + 2 * a0, 9);
      else p.arc(0, cy0, rc, a0, PI - a0, true);
      // 近侧鬓发的尖
      p.quadraticCurveTo(xl * 0.9 + nb[0] * 0.1, yb + 0.12, (xl + nb[0]) / 2, side + 0.22);
      p.quadraticCurveTo(nb[0] - 0.02, side + 0.1, nb[0], nb[1]);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b[0] - a[0], dy = b[1] - a[1], len = hypot(dx, dy) || 1e-6;
        let bend = 0.12;
        if (b[2] === 't') bend = 0.22 + (b[3] || 0) * 0.35;
        else if (a[2] === 't') bend = -0.1 + (a[3] || 0) * 0.15;
        const mx = (a[0] + b[0]) / 2 - (dy / len) * bend * len * 0.5, my = (a[1] + b[1]) / 2 + (dx / len) * bend * len * 0.5;
        p.quadraticCurveTo(mx, my, b[0], b[1]);
      }
      p.quadraticCurveTo(fb[0] + 0.02, side + 0.1, (xr + fb[0]) / 2, side + 0.22);
      p.quadraticCurveTo(xr * 0.9 + fb[0] * 0.1, yb + 0.12, xr, yb);
      if (closeIt) p.closePath();
    };
    build(fill, true);
    build(ink, false);
    // 刘海在额头上的投影阴影（向下偏移）
    shade.addPath(fill, new DOMMatrix([1, 0, 0, 1, 0.02, 0.1]));
    // 发丝线：从头顶发旋到每一缕刘海的尖
    const strands = new Path2D();
    hsph(H, 0.15, -0.95, 1.0, T3b);
    for (const q of pts) {
      if (q[2] !== 't') continue;
      strands.moveTo(T3b[0] * 0.6 + q[0] * 0.4, T3b[1] * 0.4 + q[1] * 0.6 - 0.3);
      strands.quadraticCurveTo(q[0] * 0.9 + T3b[0] * 0.1, q[1] - 0.2, q[0], q[1] - 0.04);
    }
    return { fill, ink, shade, strands };
  }
  function hairGrad(pal) {
    return linG('hcap:' + pal.c, 0, -1.15, 0, 0.95, [0, lt(pal.c, 0.12), 0.45, pal.c, 1, pal.sh]);
  }
  /** 头顶的高光带（“天使环”） */
  function shineRing(H, hr) {
    return pathCache('ring:' + hr.cap + ':' + Math.round(H.yaw * 40) + ':' + Math.round(H.pitch * 40), () => {
      const p = new Path2D(), rc = hr.cap * 0.9, off = 0.18 * H.sy, yc = -0.6 - 0.12 * H.pitch;
      const n = 9, xs = [], ys = [];
      for (let i = 0; i <= n; i++) {
        const a = -2.45 + (i / n) * 1.9;
        const x = cos(a) * rc * 0.98 + off * (1 - abs(cos(a))), y = yc + (sin(a) + 0.78) * 0.5;
        xs.push(x); ys.push(y + (i % 2 ? 0.05 : -0.03));
      }
      p.moveTo(xs[0], ys[0]);
      for (let i = 1; i <= n; i++) p.lineTo(xs[i], ys[i]);
      for (let i = n; i >= 0; i--) p.lineTo(xs[i] * 0.97, ys[i] + (i % 2 ? 0.1 : 0.16));
      p.closePath();
      return p;
    });
  }

  /* ---- 羊角：3D 螺旋 → 投影 → 变宽的带子 ---- */
  function hornPaths(D, H, hs, sd) {
    return pathCache('horn:' + D.who + ':' + sd + ':' + H.qk, () => {
      const N = 26, cx = [], cyy = [], cz = [], w = [];
      const psi = sd * hs.psi, y0 = hs.y;
      const rr = sqrt(max(0, 1 - y0 * y0)) * 0.95;
      const s0 = rr * sin(psi), v0 = y0 * 0.95, f0 = rr * cos(psi);
      const phi0 = -0.5, Phi = hs.turn * PI, r0 = hs.r;
      const cF = f0 - r0 * cos(phi0), cV = v0 - r0 * sin(phi0);
      for (let i = 0; i <= N; i++) {
        const u = i / N, ph = phi0 - Phi * u, r = r0 * (1 - 0.5 * pow(u, 1.25));
        const s = s0 + sd * (hs.out * pow(u, 0.5) + (hs.swept ? 0.08 * u : 0));
        const f = cF + r * cos(ph) - (hs.swept ? 0.12 * u : 0), v = cV + r * sin(ph);
        hproj(H, s, v, f, T3);
        cx.push(T3[0]); cyy.push(T3[1]); cz.push(T3[2]);
        w.push(hs.w * (1 - 0.78 * pow(u, 1.15)) + 0.02);
      }
      // 螺旋向内卷：判断内侧（曲率中心）在左还是右
      const L = [], R = [];
      for (let i = 0; i <= N; i++) {
        const a = max(0, i - 1), b = min(N, i + 1);
        let tx = cx[b] - cx[a], ty = cyy[b] - cyy[a];
        const tl = hypot(tx, ty) || 1e-6; tx /= tl; ty /= tl;
        L.push([cx[i] - ty * w[i] / 2, cyy[i] + tx * w[i] / 2]);
        R.push([cx[i] + ty * w[i] / 2, cyy[i] - tx * w[i] / 2]);
      }
      const im = N >> 1;
      const t1x = cx[im + 1] - cx[im - 1], t1y = cyy[im + 1] - cyy[im - 1], t0x = cx[im] - cx[im - 2], t0y = cyy[im] - cyy[im - 2];
      const turnSign = t0x * t1y - t0y * t1x;   // > 0：向右弯（R 在内侧）
      const IN = turnSign > 0 ? R : L, OUT = turnSign > 0 ? L : R;
      const out = new Path2D();
      out.moveTo(L[0][0], L[0][1]);
      for (let i = 1; i <= N; i++) out.lineTo(L[i][0], L[i][1]);
      const ex = cx[N] - cx[N - 1], ey = cyy[N] - cyy[N - 1], el = hypot(ex, ey) || 1e-6;
      out.quadraticCurveTo(cx[N] + (ex / el) * w[N] * 1.1, cyy[N] + (ey / el) * w[N] * 1.1, R[N][0], R[N][1]);
      for (let i = N - 1; i >= 0; i--) out.lineTo(R[i][0], R[i][1]);
      { const tx0 = cx[1] - cx[0], ty0 = cyy[1] - cyy[0], tl0 = hypot(tx0, ty0) || 1e-6; out.quadraticCurveTo(cx[0] - tx0 / tl0 * w[0] * 0.7, cyy[0] - ty0 / tl0 * w[0] * 0.7, L[0][0], L[0][1]); }
      out.closePath();
      // 沿角身的渐变：根部在头发的阴影里
      const i3 = 4, grad = gctx.createLinearGradient(cx[0], cyy[0], cx[i3], cyy[i3]);
      grad.addColorStop(0, hs.pal.c1); grad.addColorStop(0.7, hs.pal.c0); grad.addColorStop(1, hs.pal.c0);
      // 内侧阴影带（靠螺旋中心的一半）
      const sh = new Path2D();
      sh.moveTo(IN[0][0], IN[0][1]);
      for (let i = 1; i <= N; i++) sh.lineTo(IN[i][0], IN[i][1]);
      for (let i = N; i >= 0; i--) sh.lineTo(cx[i] * 0.55 + IN[i][0] * 0.45, cyy[i] * 0.55 + IN[i][1] * 0.45);
      sh.closePath();
      // 外缘（逆光剪影时这条边会被照亮）
      const edge = new Path2D();
      edge.moveTo(OUT[1][0], OUT[1][1]);
      for (let i = 2; i <= N; i++) edge.lineTo(OUT[i][0], OUT[i][1]);
      // 外侧高光线
      const hi = new Path2D();
      hi.moveTo(cx[2] * 0.4 + OUT[2][0] * 0.6, cyy[2] * 0.4 + OUT[2][1] * 0.6);
      for (let i = 3; i < N - 3; i++) hi.lineTo(cx[i] * 0.4 + OUT[i][0] * 0.6, cyy[i] * 0.4 + OUT[i][1] * 0.6);
      // 生长纹：一道道横过角身、略带弧度的纹
      const rid = new Path2D();
      for (let i = 2; i < N - 2; i++) {
        if (i % 2) continue;
        const mx = cx[i] + (cx[i + 1] - cx[i]) * 0.5, my = cyy[i] + (cyy[i + 1] - cyy[i]) * 0.5;
        rid.moveTo(L[i][0], L[i][1]);
        rid.quadraticCurveTo(mx, my, R[i][0], R[i][1]);
      }
      return { out, sh, rid, hi, edge, grad, z: cz[0], zm: cz[im], root: [cx[0], cyy[0]], w0: w[0], dir: [cx[2] - cx[0], cyy[2] - cyy[0]] };
    });
  }
  function drawHorn(D, H, sd) {
    const g = D.g, hs = D.C.horn, hp = hornPaths(D, H, hs, sd), pal = hs.pal;
    fillP(D, hp.out, D.sil ? null : D.lod >= 1 ? hp.grad : pal.c0);
    if (!D.sil && D.lod >= 1) {
      g.globalAlpha = D.ga * 0.9; g.fillStyle = pal.c1; g.fill(hp.sh); g.globalAlpha = D.ga;
      g.lineCap = 'round';
      g.lineWidth = D.inkH * (D.lod >= 2 ? 0.75 : 0.6); g.strokeStyle = pal.c2; g.stroke(hp.rid);
      if (D.lod >= 2) { g.lineWidth = D.inkH * 0.9; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.stroke(hp.hi); }
    }
    inkP(D, hp.out, D.inkH * 0.9, pal.ink);
    if (D.sil && D.rimC && !D.rimPass) { g.lineCap = 'round'; g.lineWidth = D.inkH * 1.3; g.strokeStyle = D.rimC; g.globalAlpha = D.ga * 0.85; g.stroke(hp.edge); g.globalAlpha = D.ga; }
    // 角根上搭两缕细发（让角“长”在头上，而不是贴上去的）
    if (D.hair && H.front && hp.z > 0.05 && D.lod >= 1 && !D.O.hat) {
      const [rx, ry] = hp.root, w0 = hp.w0, pal2 = D.hair.pal;
      const rl = hypot(rx, ry) || 1, tx = -ry / rl, ty = rx / rl, ox = rx / rl, oy = ry / rl;
      g.lineCap = 'round';
      for (let k = -1; k <= 1; k += 2) {
        const sx = rx - ox * w0 * 0.1 + tx * k * w0 * 0.35, sy = ry - oy * w0 * 0.1 + ty * k * w0 * 0.35;
        g.beginPath();
        g.moveTo(sx - ox * w0 * 0.5, sy - oy * w0 * 0.5);
        g.quadraticCurveTo(sx + tx * k * w0 * 0.3, sy + ty * k * w0 * 0.3, sx + ox * w0 * 0.45 + tx * k * w0 * 0.25, sy + oy * w0 * 0.45 + ty * k * w0 * 0.25);
        g.lineWidth = w0 * 0.14 + D.inkH * 1.1; g.strokeStyle = D.sil || pal2.ink; g.stroke();
        g.lineWidth = w0 * 0.14; g.strokeStyle = D.sil || pal2.c; g.stroke();
      }
    }
  }

  /* ---- 耳朵 ---- */
  function drawEar(D, H, sd) {
    const C = D.C, g = D.g, P = D.P;
    if (C.ear === 'sheep') {
      hsph(H, sd * (HP + 0.14), 0.1, 0.97, T3);
      const rx = T3[0], ry = T3[1];
      // 方向：向外、向下、略向后；走路 / 跑步时拍打
      hproj(H, sd * 0.82, 0.5, -0.32, T3b);
      const flop = (P.mv ? (P.run ? 0.28 : 0.14) * sin(2 * P.ph - 0.9 + sd) : 0) + 0.05 * sin(P.t * 1.7 + sd * 2) + (P.floaty ? -0.2 : 0);
      let dx = T3b[0], dy = T3b[1];
      const dl = hypot(dx, dy) || 1e-6; dx /= dl; dy /= dl;
      const fa = flop * (dx >= 0 ? 1 : -1);
      const cdx = dx * cos(fa) - dy * sin(fa), cdy = dx * sin(fa) + dy * cos(fa);
      const len = 0.5 * (C.sheepEar || 1) * (0.55 + 0.45 * min(1, dl / 0.8)), wid = 0.2 * (C.sheepEar || 1);
      const nx = -cdy, ny = cdx;
      const tx = rx + cdx * len, ty = ry + cdy * len;
      g.beginPath();
      g.moveTo(rx + nx * wid * 0.45, ry + ny * wid * 0.45);
      g.quadraticCurveTo(rx + cdx * len * 0.55 + nx * wid, ry + cdy * len * 0.55 + ny * wid, tx, ty);
      g.quadraticCurveTo(rx + cdx * len * 0.55 - nx * wid * 0.9, ry + cdy * len * 0.55 - ny * wid * 0.9, rx - nx * wid * 0.45, ry - ny * wid * 0.45);
      g.closePath();
      fillC(D, EAR_SHEEP.c);
      inkC(D, D.inkH * 0.8, EAR_SHEEP.ink);
      if (!D.sil && D.lod >= 1) {
        g.beginPath();
        g.moveTo(rx + cdx * len * 0.12, ry + cdy * len * 0.12);
        g.quadraticCurveTo(rx + cdx * len * 0.55 + nx * wid * 0.45, ry + cdy * len * 0.55 + ny * wid * 0.45, rx + cdx * len * 0.86, ry + cdy * len * 0.86);
        g.quadraticCurveTo(rx + cdx * len * 0.5 - nx * wid * 0.3, ry + cdy * len * 0.5 - ny * wid * 0.3, rx + cdx * len * 0.12, ry + cdy * len * 0.12);
        g.fillStyle = EAR_SHEEP.in; g.fill();
      }
    } else if (C.ear === 'rabbit') {
      // 兔耳：头顶两只长耳朵，远侧那只在中段折下来
      hsph(H, sd * 0.42, -0.86, 1.02, T3);
      const bx = T3[0], by = T3[1];
      const bounce = (P.mv ? (P.run ? 0.22 : 0.1) * sin(2 * P.ph - 0.6 + sd) : 0) + 0.04 * sin(P.t * 1.9 + sd);
      const tilt = sd * 0.22 * H.cy - 0.18 * H.sy + bounce + (P.expr === 'sad' ? sd * 0.5 : 0);
      const L1 = 0.72, L2 = 0.62, wd = 0.2;
      const fold = sd < 0 ? 1.05 : 0.18;
      const a1 = -HP + tilt, a2 = a1 + fold * (sd < 0 ? 1 : -1) * (H.sy >= 0 ? 1 : -1);
      const mx = bx + cos(a1) * L1, my = by + sin(a1) * L1;
      const ex = mx + cos(a2) * L2, ey = my + sin(a2) * L2;
      // 一只完整的长耳：根部窄、中段最宽、耳尖圆
      const earPath = (k) => {
        const w0 = wd * 0.55 * k, w1 = wd * k, w2 = wd * 0.9 * k;
        const n1x = -sin(a1), n1y = cos(a1), n2x = -sin(a2), n2y = cos(a2);
        const nmx = (n1x + n2x) / 2, nmy = (n1y + n2y) / 2;
        g.moveTo(bx + n1x * w0, by + n1y * w0);
        g.quadraticCurveTo(bx + cos(a1) * L1 * 0.5 + n1x * w1, by + sin(a1) * L1 * 0.5 + n1y * w1, mx + nmx * w1, my + nmy * w1);
        g.quadraticCurveTo(mx + cos(a2) * L2 * 0.55 + n2x * w2, my + sin(a2) * L2 * 0.55 + n2y * w2, ex + cos(a2) * 0.02, ey + sin(a2) * 0.02);
        g.quadraticCurveTo(mx + cos(a2) * L2 * 0.55 - n2x * w2, my + sin(a2) * L2 * 0.55 - n2y * w2, mx - nmx * w1, my - nmy * w1);
        g.quadraticCurveTo(bx + cos(a1) * L1 * 0.5 - n1x * w1, by + sin(a1) * L1 * 0.5 - n1y * w1, bx - n1x * w0, by - n1y * w0);
        g.closePath();
      };
      const earC = mix(D.hair.pal.lt, '#f6e2c8', 0.55);
      g.beginPath(); earPath(1);
      fillC(D, earC);
      inkC(D, D.inkH * 0.8, D.hair.pal.ink);
      if (!D.sil && D.lod >= 1) { g.save(); g.translate(bx, by); g.scale(0.55, 0.78); g.translate(-bx, -by); g.beginPath(); earPath(0.8); g.restore(); g.fillStyle = '#f5b8bc'; g.fill(); }
    } else if (C.ear === 'feather') {
      // 黎博利的耳羽：耳边向后上方翘起的几片深色羽毛
      hsph(H, sd * (HP + 0.05), 0.12, 1.02, T3);
      const bx = T3[0], by = T3[1];
      const dirx = (sd > 0 ? -1 : 1) * (abs(H.cy) * 0.8 + 0.2) * (H.sy >= 0 ? 1 : -1) * (sd > 0 ? 1 : 1);
      const base = sd > 0 ? (H.cy >= 0 ? PI + 0.5 : -0.5) : (H.cy >= 0 ? -0.5 : PI + 0.5);
      const flut = 0.06 * sin(P.t * 2.1 + sd) + (P.mv ? 0.08 * sin(2 * P.ph) : 0);
      const fc = C.feather;
      for (let k = 0; k < 3; k++) {
        const a = base + (sd > 0 ? 1 : -1) * (k * 0.28 - 0.05) * (H.cy >= 0 ? 1 : -1) + flut * (k + 1) * 0.5;
        const len = 0.55 - k * 0.1, wd = 0.13 - k * 0.02;
        const ex = bx + cos(a) * len, ey = by + sin(a) * len, nx = -sin(a), ny = cos(a);
        g.beginPath();
        g.moveTo(bx, by);
        g.quadraticCurveTo(bx + cos(a) * len * 0.5 + nx * wd, by + sin(a) * len * 0.5 + ny * wd, ex, ey);
        g.quadraticCurveTo(bx + cos(a) * len * 0.5 - nx * wd, by + sin(a) * len * 0.5 - ny * wd, bx, by);
        fillC(D, k === 0 ? fc.c : mix(fc.c, fc.tip, 0.35));
        inkC(D, D.inkH * 0.6, '#1e1e26');
      }
      void dirx;
    } else if (C.ear === 'animal') {
      // 路人的兽耳：佩洛 / 菲林 / 鲁珀的三角耳，乌萨斯的圆耳
      const kind = C.animal, pal = D.hair.pal;
      hsph(H, sd * 0.56, -0.8, 1.0, T3);
      const bx = T3[0], by = T3[1];
      const flick = 0.06 * sin(P.t * 2.3 + sd * 1.7) + (P.mv ? 0.08 * sin(2 * P.ph + sd) : 0);
      const tilt = sd * -0.28 * (0.4 + 0.6 * abs(H.cy)) + flick;
      g.beginPath();
      if (kind === 'bear') {
        g.arc(bx, by - 0.04, 0.2, 0, TAU);
        fillC(D, pal.c); inkC(D, D.inkH * 0.8, pal.ink);
        if (!D.sil) { g.beginPath(); g.arc(bx, by - 0.02, 0.1, 0, TAU); g.fillStyle = mix(pal.c, '#f0c8b8', 0.5); g.fill(); }
      } else {
        const hE = kind === 'fox' ? 0.6 : kind === 'wolf' ? 0.5 : 0.42, wB = kind === 'fox' ? 0.42 : 0.36;
        const tx = bx + sin(tilt) * hE, ty = by - cos(tilt) * hE;
        const ax = cos(tilt) * wB / 2, ay = sin(tilt) * wB / 2;
        g.moveTo(bx - ax, by - ay + 0.04); g.quadraticCurveTo(bx - ax * 0.6 + sin(tilt) * hE * 0.6, by - ay * 0.6 - cos(tilt) * hE * 0.6, tx, ty);
        g.quadraticCurveTo(bx + ax * 0.6 + sin(tilt) * hE * 0.6, by + ay * 0.6 - cos(tilt) * hE * 0.6, bx + ax, by + ay + 0.04); g.closePath();
        fillC(D, pal.c); inkC(D, D.inkH * 0.8, pal.ink);
        if (!D.sil && D.lod >= 1) {
          g.beginPath(); g.moveTo(bx - ax * 0.5, by - ay * 0.5); g.lineTo(bx + sin(tilt) * hE * 0.72, by - cos(tilt) * hE * 0.72); g.lineTo(bx + ax * 0.5, by + ay * 0.5); g.closePath();
          g.fillStyle = kind === 'fox' ? '#fbf4ea' : '#f4c4c4'; g.fill();
        }
      }
    } else if (C.ear === 'human') {
      hsph(H, sd * (HP - 0.05), 0.24, 1.0, T3);
      if (T3[2] < -0.3) return;
      const w = 0.13 * (0.3 + 0.7 * abs(H.sy)) + 0.04, h = 0.2;
      g.beginPath(); g.ellipse(T3[0], T3[1], w, h, 0, 0, TAU);
      fillC(D, D.C.skin.c); inkC(D, D.inkH * 0.7, D.C.skin.ink);
    }
  }

  /* ---- 眼睛（眼睛局部空间：单位方框，外眼角朝 +x） ---- */
  const EYE = {};
  (() => {
    const p = (fn) => { const q = new Path2D(); fn(q); return q; };
    EYE.white = p((q) => ellipseP(q, 0, 0.03, 0.5, 0.47, 0));
    EYE.iris = p((q) => ellipseP(q, 0, 0.06, 0.4, 0.46, 0));
    EYE.pupil = p((q) => ellipseP(q, 0, 0.0, 0.18, 0.25, 0));
    EYE.ring = p((q) => ellipseP(q, 0, 0.08, 0.3, 0.33, 0));
    EYE.lash = p((q) => {
      q.moveTo(-0.54, 0.1);
      q.bezierCurveTo(-0.5, -0.4, 0.3, -0.64, 0.6, -0.2);
      q.lineTo(0.84, -0.36);
      q.lineTo(0.7, -0.06);
      q.lineTo(0.62, -0.02);
      q.bezierCurveTo(0.36, -0.44, -0.34, -0.38, -0.46, 0.14);
      q.closePath();
    });
    EYE.lashS = p((q) => { q.moveTo(-0.5, 0.06); q.bezierCurveTo(-0.44, -0.36, 0.32, -0.56, 0.62, -0.12); });
    EYE.low = p((q) => { q.moveTo(0.02, 0.52); q.quadraticCurveTo(0.38, 0.5, 0.52, 0.24); });
    EYE.shade = p((q) => { q.moveTo(-0.42, -0.08); q.quadraticCurveTo(0, -0.46, 0.44, -0.1); q.quadraticCurveTo(0, -0.22, -0.42, -0.08); });
    EYE.closed = p((q) => { q.moveTo(-0.5, 0.02); q.quadraticCurveTo(0.02, 0.34, 0.58, 0.0); q.lineTo(0.74, -0.12); });
    EYE.happy = p((q) => { q.moveTo(-0.5, 0.2); q.quadraticCurveTo(0.04, -0.34, 0.56, 0.18); });
    EYE.tear = p((q) => { q.moveTo(-0.42, 0.34); q.quadraticCurveTo(0, 0.62, 0.46, 0.3); q.quadraticCurveTo(0, 0.48, -0.42, 0.34); });
  })();
  function irisGrad(ey) {
    return linG('iris:' + ey.top, 0, -0.42, 0, 0.5, [0, ey.top, 0.45, mix(ey.top, ey.bot, 0.45), 1, ey.bot]);
  }
  /** 表情 → 眼 / 眉 / 嘴 / 腮红的参数 */
  const EXPR = {
    neutral: { eye: 'open', lid: 0, low: 0, brow: 0, mouth: 'line', blush: 0.3 },
    smile: { eye: 'open', lid: 0.06, low: 0.22, brow: 0.05, mouth: 'smile', blush: 0.45 },
    laugh: { eye: 'happy', brow: 0.12, mouth: 'open', blush: 0.6 },
    sad: { eye: 'open', lid: 0.2, low: 0.05, brow: -1, tilt: -0.2, mouth: 'frown', blush: 0.25, look: [0, 0.25] },
    surprise: { eye: 'open', lid: -0.08, low: 0, brow: 0.9, mouth: 'o', blush: 0.3, big: 1.1, pupil: 0.7 },
    sleepy: { eye: 'open', lid: 0.55, low: 0.05, brow: 0.1, mouth: 'small', blush: 0.35 },
    closed: { eye: 'closed', brow: 0.1, mouth: 'line', blush: 0.35 },
    content: { eye: 'closed', brow: 0.15, mouth: 'smile', blush: 0.5 },
    determined: { eye: 'open', lid: 0.18, low: 0.1, brow: 1.2, tilt: 0.22, mouth: 'firm', blush: 0.2, angry: 1 },
    tearful: { eye: 'open', lid: 0.12, low: 0.08, brow: -1, tilt: -0.18, mouth: 'wobble', blush: 0.55, tears: 1, gloss: 1, look: [0, 0.15] },
    cry: { eye: 'closed', brow: -1.2, mouth: 'wobble', blush: 0.7, tears: 2 },
    wink: { eye: 'open', wink: 1, brow: 0.1, mouth: 'smile', blush: 0.5 },
    shy: { eye: 'open', lid: 0.22, low: 0.12, brow: -0.4, tilt: -0.08, mouth: 'small', blush: 0.95, look: [-0.4, 0.3] },
    pout: { eye: 'open', lid: 0.1, low: 0.05, brow: 0.8, tilt: 0.12, mouth: 'pout', blush: 0.7, angry: 1 },
    talk: { eye: 'open', lid: 0.04, low: 0.1, brow: 0.1, mouth: 'talk', blush: 0.4 },
  };
  /** 眨眼（纯函数）：返回 0 = 睁开，1 = 闭上 */
  function blinkAt(t, seed) {
    const per = 3.4 + hash(seed | 0, 7) * 1.6;
    const k = (t + seed * 1.37) / per, i = floor(k), f = (k - i) * per;
    const bt = 0.3 + hash(seed | 0, i) * (per - 0.9);
    let d = f - bt, c = 0;
    if (d >= 0 && d < 0.17) c = sin((d / 0.17) * PI);
    if (hash(seed | 0, i, 3) < 0.22) { d -= 0.26; if (d >= 0 && d < 0.15) c = max(c, sin((d / 0.15) * PI)); }
    return c;
  }
  const EYE_Y = 0.34, EYE_PSI = 0.43;
  function drawEye(D, H, sd, ex) {
    const g = D.g, C = D.C, P = D.P, ey = C.eye;
    hsph(H, sd * EYE_PSI, EYE_Y, 1.0, T3);
    const z = T3[2];
    if (z < 0.04) return;
    const es = C.eyeS || [1, 1];
    const fs = clamp(z / 0.87, 0.2, 1.12);
    const ew = 0.34 * es[0] * pow(fs, 0.85) * (ex.big || 1), eh = 0.47 * es[1] * (ex.big || 1);
    const cx = T3[0], cy = T3[1] + (ex.big ? -0.02 : 0);
    const m = sd > 0 ? -1 : 1; // 外眼角方向
    tm(D.mE, D.mH, cx, cy, 0, ew * m, eh);
    setT(g, D.mE);
    D.eyeX = cx; D.eyeY = cy;
    let shape = ex.eye;
    const blink = D.blink;
    if (ex.wink && sd < 0) shape = 'happy';
    const lw = D.inkH / eh;
    if (D.lod === 0 || D.sil) {
      if (D.sil) return;
      // 远景：小黑点 / 线
      if (shape === 'open' && blink < 0.6 && (ex.lid || 0) < 0.6) {
        g.beginPath(); g.ellipse(0.05 * m * P.lookX, 0.05, 0.3, 0.42 * (1 - blink), 0, 0, TAU); g.fillStyle = ey.lash; g.fill();
      } else {
        g.beginPath(); g.moveTo(-0.45, 0.1); g.quadraticCurveTo(0, shape === 'happy' ? -0.2 : 0.32, 0.5, 0.1); g.lineWidth = 0.22; g.strokeStyle = ey.lash; g.lineCap = 'round'; g.stroke();
      }
      return;
    }
    if (shape === 'closed' || shape === 'happy' || blink > 0.92) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.lineWidth = lw * 1.9; g.strokeStyle = ey.lash;
      g.stroke(shape === 'happy' ? EYE.happy : EYE.closed);
      if (ex.tears && shape !== 'happy') drawTears(D, ex, m, true);
      return;
    }
    const lid = clamp((ex.lid || 0) + blink * (1 - max(0, ex.lid || 0)), -0.12, 1);
    const low = ex.low || 0, tilt = ex.tilt || 0;
    // 上眼睑的变换（睁 → 闭：下移并压扁）
    const lt0 = lid * 0.5, ls = 1 - lid * 0.72;
    const ct = cos(tilt), st = sin(tilt);
    const L = (x, y) => { const yy = lt0 + y * ls; return [x * ct - yy * st, x * st + yy * ct]; };
    // 可见的眼球区域：上边 = 睫毛的下沿，下边 = 下眼睑（笑眼时上抬）
    const p0 = L(-0.46, 0.14), c1 = L(-0.34, -0.38), c2 = L(0.36, -0.44), p1 = L(0.68, -0.04);
    g.save();
    g.beginPath();
    g.moveTo(p0[0], p0[1]);
    g.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p1[0], p1[1]);
    g.quadraticCurveTo(0.58, 0.5 - low * 0.8, 0.02, 0.53 - low * 0.95);
    g.quadraticCurveTo(-0.5, 0.52 - low * 0.62, p0[0], p0[1]);
    g.closePath();
    g.clip();
    // 眼白 + 虹膜 + 瞳孔
    g.fillStyle = '#fffaf6'; g.fillRect(-0.8, -0.8, 1.6, 1.6);
    const ix = clamp(P.lookX * 0.24 * m + (D.H.sy * 0.08) * m, -0.2, 0.2) + (ex.lookX || 0) * m, iy = clamp(P.lookY * 0.2 + (ex.lookY || 0), -0.14, 0.16);
    g.translate(ix, iy);
    g.fillStyle = irisGrad(ey); g.fill(EYE.iris);
    if (D.lod >= 2) { g.globalAlpha = D.ga * 0.35; g.fillStyle = ey.hi2; g.fill(EYE.ring); g.globalAlpha = D.ga; }
    const pk = ex.pupil || 1;
    if (pk !== 1) g.scale(pk, pk);
    g.fillStyle = ey.pupil; g.fill(EYE.pupil);
    if (pk !== 1) g.scale(1 / pk, 1 / pk);
    g.lineWidth = lw * 0.7; g.strokeStyle = ey.ring; g.stroke(EYE.iris);
    g.translate(-ix, -iy);
    // 上眼睑投在眼球上的影子
    g.globalAlpha = D.ga * 0.32; g.fillStyle = ey.top;
    g.beginPath(); g.moveTo(p0[0], p0[1]); g.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p1[0], p1[1]); g.lineTo(p1[0], p1[1] + 0.2); g.bezierCurveTo(c2[0], c2[1] + 0.26, c1[0], c1[1] + 0.26, p0[0], p0[1] + 0.12); g.fill();
    g.globalAlpha = D.ga;
    // 高光（固定在屏幕左上）
    const hx = -0.15 * m + ix * 0.5;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(hx, -0.14 + iy * 0.5, 0.13, 0.15, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(-hx * 0.95, 0.24 + iy * 0.5, 0.055, 0, TAU); g.fill();
    if (ex.gloss) { g.globalAlpha = D.ga * 0.8; g.beginPath(); g.ellipse(-hx * 0.4, 0.32, 0.2, 0.06, 0, 0, TAU); g.fill(); g.globalAlpha = D.ga; }
    if (ex.tears) { g.globalAlpha = D.ga * 0.7; g.fillStyle = '#bfe4ff'; g.fill(EYE.tear); g.globalAlpha = D.ga; }
    g.restore();
    // 睫毛线（随眼睑下移）
    g.save();
    g.rotate(tilt);
    if (lid > 0.02) { g.translate(0, lt0); g.scale(1, ls); }
    g.fillStyle = ey.lash; g.fill(EYE.lash);
    g.restore();
    g.lineCap = 'round';
    g.save(); g.translate(0, -low * 0.8);
    g.lineWidth = lw * 0.75; g.strokeStyle = ey.lash; g.stroke(EYE.low);
    g.restore();
    if (ex.tears > 1 || ex.cryDrops) drawTears(D, ex, m, false);
  }
  function drawTears(D, ex, m, closed) {
    const g = D.g;
    g.globalAlpha = D.ga * 0.75;
    g.fillStyle = '#bfe4ff'; g.fill(EYE.tear);
    g.globalAlpha = D.ga;
    if (ex.tears > 1 || closed) {
      // 泪珠沿脸颊流下（纯函数）
      const t = D.P.t;
      for (let k = 0; k < 2; k++) {
        const per = 1.6 + k * 0.5, f = fract((t + k * 0.8 + (m > 0 ? 0.3 : 0)) / per);
        const y = 0.45 + f * (ex.tears > 1 ? 2.4 : 1.6), a = 1 - f;
        g.globalAlpha = D.ga * a;
        g.beginPath(); g.moveTo(0.4, y - 0.26); g.quadraticCurveTo(0.6, y + 0.04, 0.4, y + 0.12); g.quadraticCurveTo(0.2, y + 0.04, 0.4, y - 0.26);
        g.fillStyle = '#a8dcff'; g.fill(); g.lineWidth = 0.06; g.strokeStyle = '#5a9ad0'; g.stroke();
        g.beginPath(); g.arc(0.36, y - 0.02, 0.035, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
      }
      g.globalAlpha = D.ga;
    }
  }
  function drawBrow(D, H, sd, ex) {
    const g = D.g, C = D.C;
    hsph(H, sd * 0.4, -0.03 - (ex.brow > 0.5 ? 0.06 : 0) - (ex.brow < 0 ? 0.02 : 0), 1.04, T3);
    if (T3[2] < 0.1) return;
    const fs = clamp(T3[2] / 0.88, 0.25, 1.1);
    const L = 0.15 * fs * (C.browL || 1);
    const m = sd > 0 ? -1 : 1; // 外侧方向
    let inner = 0, outer = 0;
    const b = ex.brow || 0;
    if (b < 0) { inner = -0.07 * -b; outer = 0.03 * -b; }
    else if (ex.angry) { inner = 0.06 * b; outer = -0.04 * b; }
    else { inner = -0.02 * b; outer = -0.02 * b; }
    const x0 = T3[0] - m * L, y0 = T3[1] + inner, x1 = T3[0] + m * L, y1 = T3[1] + outer;
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(T3[0], T3[1] - 0.05 + (inner + outer) * 0.3, x1, y1);
    g.lineCap = 'round';
    // 表情越强，眉毛越清楚（Q 版的眉毛画在刘海上面）
    const strong = abs(b) >= 0.75 || ex.angry ? 1 : 0;
    g.lineWidth = D.inkH * (0.95 + 0.35 * strong) * (C.browW || 1); g.strokeStyle = C.browC || mix(D.hair.pal.ink, D.hair.pal.sh, 0.25);
    g.globalAlpha = D.ga * (0.55 + 0.35 * strong); g.stroke(); g.globalAlpha = D.ga;
  }
  function drawMouth(D, H, ex) {
    const g = D.g, C = D.C, P = D.P, sk = C.skin;
    hproj(H, 0, 0.74, 0.8, T3);
    if (T3[2] < 0.05) return;
    const fs = clamp(T3[2] / 0.8, 0.3, 1);
    const mx = T3[0], my = T3[1];
    const sx = fs * (C.mouthS || 1), lw = D.inkH * 0.95;
    let shape = ex.mouth;
    const talk = D.o.talk || (shape === 'talk' ? 0.8 : 0);
    let open = 0;
    if (talk) { open = talk * clamp(0.5 + 0.5 * sin(P.t * 11.3) * sin(P.t * 4.1 + 1) + 0.2 * sin(P.t * 17), 0, 1); shape = open > 0.12 ? 'talk' : 'line'; }
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = sk.mouth; g.lineWidth = lw;
    if (D.lod === 0) {
      if (shape === 'open' || shape === 'o' || shape === 'talk') { g.beginPath(); g.ellipse(mx, my + 0.02, 0.07 * sx, 0.06, 0, 0, TAU); g.fillStyle = sk.mouth; g.fill(); }
      return;
    }
    g.beginPath();
    if (shape === 'smile') { g.moveTo(mx - 0.1 * sx, my - 0.02); g.quadraticCurveTo(mx, my + 0.07, mx + 0.1 * sx, my - 0.02); g.stroke(); }
    else if (shape === 'line' || shape === 'small') { const w = shape === 'small' ? 0.045 : 0.07; g.moveTo(mx - w * sx, my); g.quadraticCurveTo(mx, my + 0.025, mx + w * sx, my); g.stroke(); }
    else if (shape === 'firm') { g.moveTo(mx - 0.08 * sx, my + 0.015); g.lineTo(mx + 0.08 * sx, my + 0.01); g.stroke(); }
    else if (shape === 'frown') { g.moveTo(mx - 0.07 * sx, my + 0.03); g.quadraticCurveTo(mx, my - 0.03, mx + 0.07 * sx, my + 0.03); g.stroke(); }
    else if (shape === 'wobble') { g.moveTo(mx - 0.09 * sx, my + 0.02); g.quadraticCurveTo(mx - 0.045 * sx, my - 0.03, mx, my + 0.01); g.quadraticCurveTo(mx + 0.045 * sx, my + 0.05, mx + 0.09 * sx, my + 0.0); g.stroke(); }
    else if (shape === 'o' || shape === 'pout') {
      const r = shape === 'o' ? 0.06 : 0.035;
      g.ellipse(mx, my + 0.02, r * sx, r * 1.25, 0, 0, TAU); g.fillStyle = sk.mouth; g.fill(); g.stroke();
    } else if (shape === 'open' || shape === 'talk') {
      const w = (shape === 'open' ? 0.13 : 0.08) * sx, h = shape === 'open' ? 0.15 : 0.03 + 0.1 * open;
      g.moveTo(mx - w, my - 0.02); g.quadraticCurveTo(mx, my + 0.02, mx + w, my - 0.02);
      g.quadraticCurveTo(mx + w * 0.8, my + h, mx, my + h + 0.01); g.quadraticCurveTo(mx - w * 0.8, my + h, mx - w, my - 0.02);
      g.closePath(); g.fillStyle = sk.mouth; g.fill();
      if (h > 0.06) { g.save(); g.clip(); g.beginPath(); g.ellipse(mx, my + h * 0.95, w * 0.62, h * 0.42, 0, 0, TAU); g.fillStyle = sk.tongue; g.fill(); g.restore(); }
      g.lineWidth = lw * 0.9; g.stroke();
    }
  }
  function drawBlush(D, H, ex) {
    const a = ex.blush || 0;
    if (a <= 0.02 || D.sil || D.lod === 0) return;
    const g = D.g, spr = softSprite(D.C.skin.blush, 0.3);
    for (let sd = -1; sd <= 1; sd += 2) {
      hsph(H, sd * 0.66, 0.63, 1.0, T3);
      if (T3[2] < 0.12) continue;
      const fs = clamp(T3[2] / 0.75, 0.3, 1);
      const rx = 0.2 * fs, ry = 0.11;
      g.globalAlpha = D.ga * a * 0.75;
      g.drawImage(spr, T3[0] - rx, T3[1] - ry, rx * 2, ry * 2);
      if (D.lod >= 2 && a > 0.4) {
        g.globalAlpha = D.ga * a * 0.5; g.strokeStyle = '#e8606a'; g.lineWidth = D.inkH * 0.5; g.beginPath();
        for (let k = -1; k <= 1; k++) { g.moveTo(T3[0] + (k * 0.06 - 0.02) * fs, T3[1] + 0.04); g.lineTo(T3[0] + (k * 0.06 + 0.03) * fs, T3[1] - 0.04); }
        g.stroke();
      }
    }
    g.globalAlpha = D.ga;
    if (D.C.freckles && D.lod >= 1) {
      g.fillStyle = D.C.freckles; g.globalAlpha = D.ga * 0.7;
      for (let sd = -1; sd <= 1; sd += 2) for (let k = 0; k < 3; k++) {
        hsph(H, sd * (0.5 + k * 0.08), 0.46 + (k % 2) * 0.05, 1.0, T3);
        if (T3[2] < 0.15) continue;
        g.beginPath(); g.arc(T3[0], T3[1], 0.018, 0, TAU); g.fill();
      }
      g.globalAlpha = D.ga;
    }
  }
  function drawGlasses(D, H) {
    const gl = D.C.glasses, g = D.g;
    const pos = [];
    for (let sd = -1; sd <= 1; sd += 2) {
      hsph(H, sd * EYE_PSI, EYE_Y, 1.08, T3);
      if (T3[2] < 0.08) { pos.push(null); continue; }
      const fs = clamp(T3[2] / 0.95, 0.2, 1.1);
      pos.push([T3[0], T3[1], fs, sd]);
    }
    const lw = D.inkH * (gl.thin ? 0.8 : 1.1);
    g.lineWidth = lw; g.strokeStyle = D.sil || gl.c; g.lineJoin = 'round';
    for (const q of pos) {
      if (!q) continue;
      const [x, y, fs] = q;
      const rx = (gl.shape === 'rect' ? 0.25 : 0.23) * fs, ry = gl.shape === 'rect' ? 0.18 : 0.23;
      g.beginPath();
      if (gl.shape === 'rect') { const r = 0.06; g.roundRect ? g.roundRect(x - rx, y - ry, rx * 2, ry * 2, r) : g.rect(x - rx, y - ry, rx * 2, ry * 2); }
      else g.ellipse(x, y, rx, ry, 0, 0, TAU);
      if (!D.sil) { g.fillStyle = 'rgba(255,255,255,0.1)'; g.fill(); }
      g.stroke();
      if (!D.sil && D.lod >= 1) {
        g.save(); g.globalAlpha = D.ga * 0.55; g.strokeStyle = '#ffffff'; g.lineWidth = lw * 0.9;
        g.beginPath(); g.moveTo(x - rx * 0.5, y + ry * 0.1); g.lineTo(x - rx * 0.05, y - ry * 0.55); g.stroke(); g.restore();
        g.strokeStyle = gl.c; g.lineWidth = lw;
      }
    }
    // 鼻梁架 + 镜腿
    if (pos[0] && pos[1]) {
      const a = pos[0], b = pos[1];
      const ax = a[0] + (b[0] > a[0] ? 1 : -1) * 0.23 * a[2], bx = b[0] - (b[0] > a[0] ? 1 : -1) * 0.23 * b[2];
      g.beginPath(); g.moveTo(ax, a[1] - 0.04); g.quadraticCurveTo((ax + bx) / 2, a[1] - 0.1, bx, b[1] - 0.04); g.stroke();
    }
    for (const q of pos) {
      if (!q) continue;
      const [x, y, fs, sd] = q;
      hsph(H, sd * 1.45, 0.2, 1.0, T3b);
      if (T3b[2] < 0.15) continue;
      // 镜腿只画到鬓发边上（再往后就藏进头发里了）
      const ox = x + (T3b[0] > x ? 1 : -1) * 0.23 * fs;
      g.beginPath(); g.moveTo(ox, y - 0.06); g.lineTo(ox + (T3b[0] - ox) * 0.42, y - 0.06 + (T3b[1] - 0.04 - y + 0.06) * 0.42); g.stroke();
    }
  }

  /* ================================================================
   * 头发的二次运动（纯函数）：u 为沿发束的位置（0 根部 → 1 发梢），k 为发束编号
   * D.trail / windX / swingA / liftA / bobA 都在 drawHuman 里由动作与风推出（单位：头部空间）
   * ================================================================ */
  function swayX(D, u, k) {
    const t = D.P.t, lag = u * 0.9 + k * 0.37;
    let x = D.trail * u * u;
    if (D.windX) x += D.windX * pow(u, 1.25) * (0.82 + 0.22 * sin(t * 2.3 - lag * 2 + k) + 0.14 * sin(t * 5.1 - lag * 3 + k * 1.7));
    if (D.swingA) x += D.swingA * sin(2 * D.P.ph - lag * 1.6) * u;
    x += D.idleA * sin(t * 1.25 + k * 1.7 + u * 2.2) * u;
    return x;
  }
  function swayY(D, u, k) {
    let y = -D.liftA * u * u;
    if (D.bobA) y += D.bobA * sin(2 * D.P.ph - u * 1.3 - k * 0.3 - 1.2) * u;
    if (D.windX) y -= abs(D.windX) * 0.22 * u * u * (0.7 + 0.3 * sin(D.P.t * 3.1 + k));
    return y;
  }
  function hairTipGrad(pal, len) {
    return linG('hback:' + pal.c + ':' + len.toFixed(2), 0, -0.2, 0, len, [0, pal.sh, 0.28, pal.c, 0.62, pal.c, 0.9, mix(pal.c, pal.tip, 0.7), 1, pal.tip]);
  }

  /** 后发（一大片，按发束组织，发梢带波浪；前视时在身体后面，背影时盖在身体上） */
  function drawBackHair(D, H, bk) {
    if (!bk) return;
    const g = D.g, n = bk.n, pal = D.hair.pal, M = 7;
    const cyb = D.P.cy, syb = D.P.sy, gr = D.grot;
    const CX = SX[1], CY = SY[1];
    const order = D.tmpOrder || (D.tmpOrder = []);
    order.length = 0;
    const hw0 = (bk.w * 2 / n) * 0.62;
    for (let k = 0; k < n; k++) {
      const q = n > 1 ? -1 + (2 * k) / (n - 1) : 0;
      hsph(H, PI + q * 1.45, bk.top, 1.04, T3);
      const rx = T3[0], ry = T3[1];
      const sm = q * (bk.w + 0.1 - hw0 * 0.8), fm = -0.64 - 0.1 * (1 - q * q);
      const mx = -sm * cyb + fm * syb;
      const st = q * (bk.w - hw0 * 0.5), ft = -0.5 - 0.22 * (1 - q * q);
      const tx = -st * cyb + ft * syb;
      const midV = min(1.05, bk.len * 0.42), tipV = bk.len * (1 - 0.1 * q * q) + (k % 2 ? 0.08 : 0);
      for (let i = 0; i < M; i++) {
        const u = i / (M - 1), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
        let X = a * rx + b * mx + c * tx, Y = a * ry + b * midV + c * tipV;
        if (gr) { const dx = X - rx, dy = Y - ry, cr = cos(gr), sr = sin(gr); X = rx + dx * cr - dy * sr; Y = ry + dx * sr + dy * cr; }
        CX[k * M + i] = X + swayX(D, u, k);
        CY[k * M + i] = Y + swayY(D, u, k);
      }
      order.push(k);
    }
    order.sort((a, b) => CX[a * M + M - 1] - CX[b * M + M - 1]);
    const xs = SX[2], ys = SY[2];
    let n2 = 0;
    const wave = bk.wave || 0, t = D.P.t;
    const edge = (k, i, sgn) => {
      const j = k * M + i, j0 = k * M + max(0, i - 1), j1 = k * M + min(M - 1, i + 1);
      let tx = CX[j1] - CX[j0], ty = CY[j1] - CY[j0];
      const tl = hypot(tx, ty) || 1e-6; tx /= tl; ty /= tl;
      const u = i / (M - 1);
      const hw = hw0 * (1 - 0.25 * u) * (u < 0.1 ? 0.9 : 1) + wave * sin(u * 8.2 + k * 1.3 + sgn + 0.4 * sin(t * 0.9)) * (0.3 + u);
      xs[n2] = CX[j] + ty * hw * sgn; ys[n2] = CY[j] - tx * hw * sgn; n2++;
    };
    const kL = order[0], kR = order[n - 1];
    for (let i = 0; i < M - 1; i++) edge(kL, i, -1);
    g.beginPath();
    smooth(g, xs, ys, n2, false);
    // 发梢：锯齿 + 圆润的发卷
    const tipOf = (k) => k * M + M - 1;
    let px = xs[n2 - 1], py = ys[n2 - 1];
    for (let oi = 0; oi < n; oi++) {
      const k = order[oi], j = tipOf(k);
      const curl = ((k % 2) ? 1 : -1) * 0.1 * (bk.curl || 1);
      g.quadraticCurveTo(lerp(px, CX[j], 0.3) + curl * 0.5, CY[j] - 0.05, CX[j] + curl, CY[j]);
      if (oi < n - 1) {
        const k2 = order[oi + 1], ja = k * M + M - 2, jb = k2 * M + M - 2;
        const nx = (CX[ja] + CX[jb]) / 2, ny = (CY[ja] + CY[jb]) / 2 + 0.05;
        g.quadraticCurveTo(CX[j] + curl * 0.2 + (nx - CX[j]) * 0.8, CY[j] - 0.02, nx, ny);
        px = nx; py = ny;
      }
    }
    n2 = 0;
    for (let i = M - 2; i >= 0; i--) edge(kR, i, 1);
    smooth(g, xs, ys, n2, false, false);
    // 头顶合拢
    g.quadraticCurveTo(1.15, -0.95, 0, -1.16);
    g.quadraticCurveTo(-1.15, -0.95, xs[0] === undefined ? -1 : CX[kL * M] - hw0, CY[kL * M]);
    g.closePath();
    fillC(D, hairTipGrad(pal, bk.len));
    inkC(D, D.inkH, pal.ink);
    if (D.sil || D.lod === 0) return;
    // 发束线
    g.beginPath();
    for (let oi = 1; oi < n; oi++) {
      const k = order[oi];
      const j = k * M;
      g.moveTo(CX[j + 2] - hw0 * 0.9, CY[j + 2]);
      g.quadraticCurveTo(CX[j + 4] - hw0 * 0.95, CY[j + 4], CX[j + 5] - hw0 * 0.7, CY[j + 5] + 0.05);
    }
    g.lineCap = 'round';
    g.lineWidth = D.inkH * 0.7; g.strokeStyle = rgba(pal.ink, 0.55); g.stroke();
    if (D.lod >= 2) {
      g.beginPath();
      for (let oi = 0; oi < n; oi += 2) {
        const j = order[oi] * M;
        g.moveTo(CX[j + 2], CY[j + 2]); g.quadraticCurveTo(CX[j + 3] + 0.05, CY[j + 3], CX[j + 4], CY[j + 4]);
      }
      g.lineWidth = D.inkH * 1.4; g.strokeStyle = rgba(pal.lt, 0.35); g.stroke();
    }
  }

  /** 鬓角垂到胸前的长发束 */
  function drawLock(D, H, sd, lk) {
    hsph(H, sd * lk.psi, lk.y0, 1.03, T3);
    if (T3[2] < -0.25) return;
    const g = D.g, pal = D.hair.pal, M = 7;
    const r0x = T3[0], r0y = T3[1];
    hproj(H, sd * 1.02, lk.y0 + (lk.len - lk.y0) * 0.42, 0.28, T3b);
    const m1x = T3b[0], m1y = T3b[1];
    hproj(H, sd * 0.84, lk.len, 0.4, T3c);
    const e0x = T3c[0], e0y = T3c[1];
    const xs = SX[1], ys = SY[1];
    const k = 10 + sd;
    for (let i = 0; i < M; i++) {
      const u = i / (M - 1), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      let X = a * r0x + b * m1x + c * e0x, Y = a * r0y + b * m1y + c * e0y;
      if (D.grot) { const dx = X - r0x, dy = Y - r0y, cr = cos(D.grot), sr = sin(D.grot); X = r0x + dx * cr - dy * sr; Y = r0y + dx * sr + dy * cr; }
      xs[i] = X + swayX(D, u, k) * 0.8; ys[i] = Y + swayY(D, u, k) * 0.8;
    }
    const L = SX[2], LY = SY[2], R = SX[3], RY = SY[3];
    const t = D.P.t, wv = lk.wave || 0.05;
    // S 形的波浪（整束发一起弯），宽度：根部窄 → 1/3 处最宽 → 发梢收尖
    for (let i = 0; i < M; i++) {
      const u = i / (M - 1);
      xs[i] += sd * wv * 1.6 * sin(u * 5.2 + 0.6 + sd) * u;
    }
    for (let i = 0; i < M; i++) {
      const i0 = max(0, i - 1), i1 = min(M - 1, i + 1);
      let tx = xs[i1] - xs[i0], ty = ys[i1] - ys[i0];
      const tl = hypot(tx, ty) || 1e-6; tx /= tl; ty /= tl;
      const u = i / (M - 1);
      const prof = u < 0.32 ? 0.55 + 0.45 * sstep(0, 0.32, u) : 1 - 0.82 * pow((u - 0.32) / 0.68, 1.3);
      const w = lk.w * 0.85 * prof;
      L[i] = xs[i] - ty * w; LY[i] = ys[i] + tx * w;
      R[i] = xs[i] + ty * w; RY[i] = ys[i] - tx * w;
    }
    g.beginPath();
    smooth(g, L, LY, M - 1, false);
    const tipx = xs[M - 1] + sd * 0.06, tipy = ys[M - 1] + 0.06;
    g.quadraticCurveTo(L[M - 1], LY[M - 1], tipx, tipy);
    g.quadraticCurveTo(R[M - 1], RY[M - 1], R[M - 2], RY[M - 2]);
    for (let i = M - 3; i >= 0; i--) g.quadraticCurveTo(R[i + 1], RY[i + 1], (R[i] + R[i + 1]) / 2, (RY[i] + RY[i + 1]) / 2);
    g.lineTo(R[0], RY[0]);
    g.closePath();
    fillC(D, hairTipGrad(pal, lk.len));
    inkC(D, D.inkH * 0.9, pal.ink);
    if (!D.sil && D.lod >= 1) {
      g.beginPath(); g.moveTo(xs[1] - sd * 0.02, ys[1]); g.quadraticCurveTo(xs[3] - sd * 0.03, ys[3], xs[5], ys[5]);
      g.lineWidth = D.inkH * 0.6; g.strokeStyle = rgba(pal.ink, 0.45); g.stroke();
      if (D.lod >= 2) {
        g.beginPath(); g.moveTo(xs[1] + sd * 0.03, ys[1] + 0.05); g.quadraticCurveTo(xs[2] + sd * 0.05, ys[2], xs[3] + sd * 0.02, ys[3]);
        g.lineWidth = D.inkH * 1.3; g.strokeStyle = rgba(pal.lt, 0.35); g.stroke();
      }
    }
  }

  /** 马尾（侧马尾 / 低马尾）+ 蝴蝶结 */
  function drawPony(D, H, pn, noBow) {
    const g = D.g, pal = D.hair.pal, M = 9;
    const low = pn.low;
    const sd = low ? 1 : (pn.psi >= 0 ? 1 : -1);
    hsph(H, pn.psi, pn.y, 1.05, T3);
    const x0 = T3[0], y0 = T3[1];
    const cps = low
      ? [[0, 0.95, -1.05], [0, 1.5, -1.0], [0, pn.len, -0.95]]
      : [[sd * 1.5, pn.y - 0.12, 0.05], [sd * 1.62, 0.85, -0.3], [sd * 1.25, pn.len - 0.35, -0.4]];
    const px = [x0], py = [y0];
    for (const c of cps) { hproj(H, c[0], c[1], c[2], T3b); px.push(T3b[0]); py.push(T3b[1]); }
    const xs = SX[1], ys = SY[1];
    for (let i = 0; i < M; i++) {
      const u = i / (M - 1), a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
      let X = a * px[0] + b * px[1] + c * px[2] + d * px[3], Y = a * py[0] + b * py[1] + c * py[2] + d * py[3];
      if (D.grot) { const dx = X - x0, dy = Y - y0, cr = cos(D.grot), sr = sin(D.grot); X = x0 + dx * cr - dy * sr; Y = y0 + dx * sr + dy * cr; }
      xs[i] = X + swayX(D, u, 20) * 1.15; ys[i] = Y + swayY(D, u, 20) * 1.1;
    }
    const L = SX[2], LY = SY[2], R = SX[3], RY = SY[3];
    for (let i = 0; i < M; i++) {
      const i0 = max(0, i - 1), i1 = min(M - 1, i + 1);
      let tx = xs[i1] - xs[i0], ty = ys[i1] - ys[i0];
      const tl = hypot(tx, ty) || 1e-6; tx /= tl; ty /= tl;
      const u = i / (M - 1);
      const w = pn.w * (0.42 + 0.75 * sin(PI * min(1, u * 1.35 + 0.08))) * (1 - u * 0.55) + (u > 0.9 ? -0.05 : 0);
      L[i] = xs[i] - ty * w; LY[i] = ys[i] + tx * w;
      R[i] = xs[i] + ty * w; RY[i] = ys[i] - tx * w;
    }
    g.beginPath();
    smooth(g, L, LY, M - 1, false);
    const ex = xs[M - 1], ey = ys[M - 1];
    g.quadraticCurveTo(L[M - 1], LY[M - 1], ex - 0.08, ey + 0.1);
    g.quadraticCurveTo(ex, ey - 0.05, ex + 0.1, ey + 0.14);
    g.quadraticCurveTo(R[M - 1], RY[M - 1], R[M - 2], RY[M - 2]);
    for (let i = M - 3; i >= 0; i--) g.quadraticCurveTo(R[i + 1], RY[i + 1], (R[i] + R[i + 1]) / 2, (RY[i] + RY[i + 1]) / 2);
    g.lineTo(R[0], RY[0]);
    g.closePath();
    fillC(D, hairTipGrad(pal, pn.len + 0.5));
    inkC(D, D.inkH, pal.ink);
    if (!D.sil && D.lod >= 1) {
      g.beginPath(); g.moveTo(xs[1], ys[1]); g.quadraticCurveTo(xs[4], ys[4], xs[7], ys[7]);
      g.moveTo((xs[2] + L[2]) / 2, (ys[2] + LY[2]) / 2); g.quadraticCurveTo((xs[5] + L[5]) / 2, (ys[5] + LY[5]) / 2, (xs[7] + L[7]) / 2, (ys[7] + LY[7]) / 2);
      g.lineWidth = D.inkH * 0.6; g.strokeStyle = rgba(pal.ink, 0.5); g.stroke();
    }
    if (pn.bow && !noBow) drawBow(D, x0, y0, pn.big ? 0.36 : 0.24, pn.bow[0], pn.bow[1], sd * 0.3);
  }
  /** 蝴蝶结（头部空间） */
  function drawBow(D, x, y, s, c1, c2, rot) {
    const g = D.g;
    g.save(); g.translate(x, y); g.rotate(rot || 0); g.scale(s, s);
    const ink = inkOf(c1), lw = D.inkH / s * 0.8;
    const loop = (sg, col) => {
      g.beginPath(); g.moveTo(0, 0);
      g.bezierCurveTo(sg * 0.5, -0.75, sg * 1.25, -0.55, sg * 1.1, 0.05);
      g.bezierCurveTo(sg * 1.0, 0.5, sg * 0.45, 0.35, 0, 0);
      g.fillStyle = D.sil || col; g.fill(); g.lineWidth = lw; g.strokeStyle = D.sil || ink; g.stroke();
    };
    const tail = (sg, col) => {
      g.beginPath(); g.moveTo(0, 0.05); g.lineTo(sg * 0.55, 1.1); g.lineTo(sg * 0.2, 0.95); g.lineTo(sg * 0.05, 1.15); g.closePath();
      g.fillStyle = D.sil || col; g.fill(); g.lineWidth = lw; g.strokeStyle = D.sil || ink; g.stroke();
    };
    tail(-1, c2 || c1); tail(1, c1);
    loop(-1, c2 || c1); loop(1, c1);
    g.beginPath(); g.ellipse(0, 0.02, 0.26, 0.3, 0, 0, TAU); g.fillStyle = D.sil || mix(c1, '#000000', 0.1); g.fill(); g.lineWidth = lw; g.strokeStyle = D.sil || ink; g.stroke();
    g.restore();
  }
  /** 麻花辫（莉瑟）：一节节交错的椭圆 */
  function drawBraid(D, H, br) {
    const g = D.g, pal = D.hair.pal;
    hsph(H, br.psi, br.y, 1.02, T3);
    if (T3[2] < -0.5) return;
    const px = [T3[0]], py = [T3[1]];
    for (const c of [[1.08, 1.0, 0.45], [0.86, 1.6, 0.72], [0.72, br.len, 0.66]]) { hproj(H, c[0], c[1], c[2], T3b); px.push(T3b[0]); py.push(T3b[1]); }
    const N = 8;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N, a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
      const X = a * px[0] + b * px[1] + c * px[2] + d * px[3] + swayX(D, u, 30) * 0.7, Y = a * py[0] + b * py[1] + c * py[2] + d * py[3] + swayY(D, u, 30) * 0.7;
      const w = br.w * (1 - 0.35 * u);
      g.beginPath(); g.ellipse(X + (i % 2 ? 0.05 : -0.05), Y, w, w * 0.62, (i % 2 ? 0.5 : -0.5), 0, TAU);
      fillC(D, i % 2 ? pal.c : mix(pal.c, pal.lt, 0.3)); inkC(D, D.inkH * 0.8, pal.ink);
      if (i === N - 1) {
        const tx = X + swayX(D, 1, 30) * 0.3, ty = Y + w * 1.3;
        g.beginPath(); g.moveTo(X - w * 0.5, Y + w * 0.4); g.quadraticCurveTo(tx - w * 0.9, ty + w * 0.6, tx, ty + w * 1.1); g.quadraticCurveTo(tx + w * 0.9, ty + w * 0.6, X + w * 0.5, Y + w * 0.4); g.closePath();
        fillC(D, pal.tip); inkC(D, D.inkH * 0.8, pal.ink);
        g.beginPath(); g.ellipse(X, Y + w * 0.55, w * 0.55, w * 0.25, 0, 0, TAU); fillC(D, br.tie); inkC(D, D.inkH * 0.7, inkOf(br.tie));
      }
    }
  }
  /** 呆毛：弹簧一样随动作晃 */
  function drawAhoge(D, H, ah) {
    const g = D.g, P = D.P, pal = D.hair.pal;
    hsph(H, ah.psi, -0.96, 1.08, T3);
    if (T3[2] < -0.6 && !H.front) { /* 背面也画 */ }
    const x0 = T3[0], y0 = T3[1];
    const bob = (P.mv ? (P.run ? 0.35 : 0.2) * sin(2 * P.ph - 1.4) : 0) + 0.08 * sin(P.t * 2.3) + (P.air ? -P.vy * 0.3 : 0) + D.windX * 0.25;
    const dir = H.sy >= 0 ? 1 : -1, L = ah.len, c = ah.curl || 1;
    const a = -HP + 0.25 * dir + bob;
    const x1 = x0 + cos(a) * L * 0.6, y1 = y0 + sin(a) * L * 0.6;
    const a2 = a + 1.1 * c * dir + bob * 0.8;
    const x2 = x1 + cos(a2) * L * 0.55, y2 = y1 + sin(a2) * L * 0.55;
    g.beginPath();
    g.moveTo(x0 - 0.04, y0 + 0.03);
    g.quadraticCurveTo(x1 - 0.03 * dir, y1 - 0.015, x2, y2);
    g.quadraticCurveTo(x1 + 0.06 * dir, y1 + 0.05, x0 + 0.05, y0 + 0.03);
    g.closePath();
    fillC(D, pal.c); inkC(D, D.inkH * 0.8, pal.ink);
    if (D.hair.tie && !D.sil) { g.beginPath(); g.arc(x0 + 0.01, y0 - 0.02, 0.06, 0, TAU); g.fillStyle = D.hair.tie; g.fill(); }
  }
  /** 睡乱的头发（睡衣）/ 毛躁的头发（卡提亚） */
  /** 蓬松的发卷：从帽子边缘翻出的几缕弯弯的头发（不是尖刺） */
  function drawTufts(D, H, n, seed) {
    const g = D.g, pal = D.hair.pal, rc = D.hair.cap;
    const t = D.P.t, sway = 0.05 * sin(t * 1.7 + seed) + (D.P.mv ? 0.06 * sin(2 * D.P.ph) : 0);
    g.beginPath();
    for (let k = 0; k < n; k++) {
      // 只在两侧（耳上方）翻出来，头顶保持圆润
      const side0 = k % 2 ? 1 : -1, a = side0 > 0 ? -0.18 - (k >> 1) * 0.42 - hash(seed, k) * 0.12 : -PI + 0.18 + (k >> 1) * 0.42 + hash(seed, k) * 0.12;
      const r0 = rc * 0.94, x = cos(a) * r0, y = -0.04 + sin(a) * r0;
      const l = 0.2 + hash(seed, k, 2) * 0.12, wdt = 0.09 + hash(seed, k, 4) * 0.05;
      const side = cos(a) >= 0 ? 1 : -1;
      const ang = a + side * (0.55 + hash(seed, k, 3) * 0.3) + sway;
      const ex = x + cos(ang) * l, ey = y + sin(ang) * l;
      const nx = -sin(a), ny = cos(a);
      g.moveTo(x + nx * wdt, y + ny * wdt);
      g.quadraticCurveTo(x + cos(a) * l * 0.9 + nx * wdt * 0.2, y + sin(a) * l * 0.9 + ny * wdt * 0.2, ex, ey);
      g.quadraticCurveTo(x + cos(a) * l * 0.35 - nx * wdt * 0.3, y + sin(a) * l * 0.35 - ny * wdt * 0.3, x - nx * wdt, y - ny * wdt);
      g.closePath();
    }
    fillC(D, pal.c); inkC(D, D.inkH * 0.7, pal.ink);
  }

  /** 头带 / 头饰：沿头顶的一条弧 */
  function drawHeadband(D, H, color, frill) {
    const g = D.g, xs = SX[1], ys = SY[1];
    let n = 0;
    for (let i = 0; i <= 10; i++) {
      const psi = -1.45 + (i / 10) * 2.9;
      hsph(H, psi, -0.58 + 0.12 * abs(psi) * 0.3, 1.1, T3);
      if (T3[2] < -0.15) continue;
      xs[n] = T3[0]; ys[n] = T3[1]; n++;
    }
    if (n < 2) return;
    g.beginPath(); smooth(g, xs, ys, n, false);
    g.lineCap = 'round';
    const fc = typeof frill === 'string' ? frill : color;
    if (frill && !D.sil && D.lod >= 1) {
      // 花边：一串小半圆（在发带上沿）
      g.beginPath();
      for (let i = 0; i < n; i++) { g.moveTo(xs[i] + 0.075, ys[i] - 0.05); g.arc(xs[i], ys[i] - 0.05, 0.075, 0, PI, true); }
      g.fillStyle = fc; g.fill(); g.lineWidth = D.inkH * 0.5; g.strokeStyle = inkOf(fc); g.stroke();
    }
    g.beginPath(); smooth(g, xs, ys, n, false);
    g.lineWidth = D.inkH * (frill ? 4.4 : 3.4); g.strokeStyle = D.sil || inkOf(color); g.stroke();
    g.lineWidth = D.inkH * (frill ? 3.0 : 2.0); g.strokeStyle = D.sil || color; g.stroke();
  }
  function drawStrawHat(D, H, hat) {
    const g = D.g, cx = 0.08 * H.sy, cy = -0.72 - 0.1 * H.pitch;
    const tilt = -0.08 * H.sy;
    const brimRy = 0.26 + 0.14 * abs(H.sp);
    g.save(); g.translate(cx, cy); g.rotate(tilt);
    // 帽檐
    g.beginPath(); g.ellipse(0, 0.08, 1.62, brimRy, 0, 0, TAU);
    fillC(D, hat.c); inkC(D, D.inkH, dk(hat.c, 0.45));
    // 帽冠
    g.beginPath(); g.moveTo(-0.82, 0.06); g.bezierCurveTo(-0.84, -0.62, 0.84, -0.62, 0.82, 0.06); g.quadraticCurveTo(0, 0.2, -0.82, 0.06);
    fillC(D, lt(hat.c, 0.12)); inkC(D, D.inkH, dk(hat.c, 0.45));
    if (!D.sil) {
      g.beginPath(); g.moveTo(-0.82, 0.0); g.quadraticCurveTo(0, 0.16, 0.82, 0.0); g.lineTo(0.83, -0.14); g.quadraticCurveTo(0, 0.02, -0.83, -0.14); g.closePath();
      g.fillStyle = hat.band; g.fill();
      if (D.lod >= 2) {
        g.beginPath();
        for (let k = -3; k <= 3; k++) { g.moveTo(k * 0.2, -0.46 + abs(k) * 0.02); g.quadraticCurveTo(k * 0.24, -0.2, k * 0.26, -0.12); }
        for (let k = -6; k <= 6; k++) { g.moveTo(k * 0.24, 0.2 + abs(k) * 0.01); g.lineTo(k * 0.27, 0.3); }
        g.lineWidth = D.inkH * 0.4; g.strokeStyle = rgba(dk(hat.c, 0.3), 0.6); g.stroke();
      }
    }
    g.restore();
  }
  function drawHalo(D, H, halo) {
    const g = D.g, t = D.P.t;
    const x = 0.12 * H.sy, y = -1.5 + 0.04 * sin(t * 1.6), rx = 0.62, ry = 0.16 + 0.12 * abs(H.sp);
    // 光环本身是光源：剪影里也亮着（逆光描边那几遍不画）
    if (D.rimPass) return;
    E.glow(g, x, y, 1.1, halo.glow, 0.28 * (D.o.glow != null ? D.o.glow + 0.5 : 1));
    g.beginPath(); g.ellipse(x, y, rx, ry, -0.12 * H.sy, 0, TAU);
    g.lineWidth = D.inkH * 3.2; g.strokeStyle = '#b8963a'; g.stroke();
    g.lineWidth = D.inkH * 2.0; g.strokeStyle = halo.c; g.stroke();
    g.lineWidth = D.inkH * 0.6; g.strokeStyle = '#fffbe8'; g.stroke();
  }
  /** 兜帽（戴上时）：外轮廓 − 脸的开口 */
  function drawHoodUp(D, H, hc, inner) {
    const g = D.g, sy = H.sy;
    // 兜帽：顶上微微尖起（帽尖偏向脑后），两侧向下垂到肩膀，下摆是一道弧
    const bx = -0.1 * sy, pk = -0.28 * sy;
    const fx = 0.42 * sy, rx = 0.8 - 0.3 * abs(sy);
    const hood = (p) => {
      p.moveTo(bx - 1.32, 1.34);
      p.bezierCurveTo(bx - 1.44, 0.5, bx - 1.34, -0.72, bx - 0.8, -1.12);
      p.quadraticCurveTo(bx + pk - 0.3, -1.4, bx + pk + 0.05, -1.36);
      p.quadraticCurveTo(bx + pk + 0.45, -1.33, bx + 0.85, -1.08);
      p.bezierCurveTo(bx + 1.36, -0.7, bx + 1.44, 0.5, bx + 1.32, 1.34);
      p.bezierCurveTo(bx + 0.9, 1.6, bx + 0.4, 1.4, bx, 1.52);
      p.bezierCurveTo(bx - 0.4, 1.4, bx - 0.9, 1.6, bx - 1.32, 1.34);
      p.closePath();
    };
    g.beginPath(); hood(g);
    if (H.front) { g.moveTo(fx + rx, 0.36); g.ellipse(fx, 0.36, rx, 0.9, 0, 0, TAU, true); }
    g.fillStyle = D.sil || (D.lod >= 1 ? linG('hood:' + hc.c, 0, -1.4, 0, 1.5, [0, lt(hc.c, 0.14), 0.6, hc.c, 1, dk(hc.c, 0.3)]) : hc.c); g.fill('evenodd');
    inkC(D, D.inkH, inkOf(hc.c));
    if (!D.sil && D.lod >= 1) {
      g.beginPath();
      if (H.front) {
        // 帽檐的厚度：沿开口一圈稍亮的边
        g.ellipse(fx, 0.36, rx + 0.07, 0.97, 0, PI * 1.08, PI * 1.92);
        g.lineWidth = D.inkH * 2.2; g.strokeStyle = rgba(lt(hc.c, 0.3), 0.55); g.stroke();
        g.beginPath();
        g.moveTo(bx - 0.62, -1.0); g.quadraticCurveTo(bx - 1.2, -0.1, bx - 1.12, 1.1);
        g.moveTo(bx + 0.66, -0.98); g.quadraticCurveTo(bx + 1.22, -0.1, bx + 1.15, 1.1);
      } else {
        // 背面：中缝 + 两道垂下来的褶
        g.moveTo(bx + pk + 0.05, -1.32); g.bezierCurveTo(bx + pk * 0.5, -0.5, bx + 0.02, 0.6, bx, 1.48);
        g.moveTo(bx - 0.75, -0.9); g.quadraticCurveTo(bx - 1.15, 0.2, bx - 0.95, 1.3);
        g.moveTo(bx + 0.8, -0.88); g.quadraticCurveTo(bx + 1.18, 0.2, bx + 0.98, 1.3);
      }
      g.lineWidth = D.inkH * 0.6; g.strokeStyle = rgba(inkOf(hc.c), 0.55); g.stroke();
    }
    if (inner && H.front) {
      g.beginPath(); g.ellipse(fx, 0.36, rx, 0.9, 0, 0, TAU);
      fillC(D, inner);
      if (!D.sil) { g.globalAlpha = D.ga * 0.35; g.beginPath(); g.ellipse(fx, 0.2, rx * 0.95, 0.55, 0, PI, TAU); g.fillStyle = hc.sh || '#000'; g.fill(); g.globalAlpha = D.ga; }
    }
  }

  /** 整个头：远侧的角和耳朵 → 脸 → 五官 → 头发帽子 → 近侧的角和耳朵 → 眼镜 / 头饰 */
  function drawHead(D) {
    const g = D.g, C = D.C, H = D.H, P = D.P, hr = D.hair;
    setT(g, D.mH);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const ex = EXPR[P.expr] || EXPR.neutral;
    const hornsBehind = [], hornsFront = [];
    if (C.horn) for (let sd = -1; sd <= 1; sd += 2) { const hp = hornPaths(D, H, C.horn, sd); (hp.z > 0.1 ? hornsFront : hp.z < -0.1 ? hornsBehind : hp.zm < 0 ? hornsBehind : hornsFront).push(sd); }
    const earSides = [];
    for (let sd = -1; sd <= 1; sd += 2) { hsph(H, sd * (HP + 0.14), 0.1, 0.97, T3); earSides.push([sd, T3[2]]); }
    // 1. 身后的角 / 耳朵
    for (const sd of hornsBehind) drawHorn(D, H, sd);
    if (C.ear === 'sheep' || C.ear === 'feather') for (const [sd, z] of earSides) if (z < 0) drawEar(D, H, sd);
    const pn = hr && hr.pony;
    if (pn && !pn.low) { hsph(H, pn.psi, pn.y, 1.05, T3); if (T3[2] < 0) drawPony(D, H, pn); }
    if (C.hooded) {
      drawHoodUp(D, H, D.O.hood, D.O.hood.face);
      if (!D.sil && H.front && D.lod >= 1) {
        // 兜帽下的暗处：两点微弱的反光
        const fx = 0.45 * H.sy;
        g.globalAlpha = D.ga * 0.5; g.fillStyle = '#6a7090';
        g.beginPath(); g.ellipse(fx - 0.22 * H.cy, 0.3, 0.07 * H.cy + 0.02, 0.025, 0, 0, TAU); g.ellipse(fx + 0.22 * H.cy, 0.3, 0.07 * H.cy + 0.02, 0.025, 0, 0, TAU); g.fill();
        g.globalAlpha = D.ga;
      }
      return;
    }
    // 2. 脸
    if (H.front) {
      const fp = facePath(H);
      fillP(D, fp, D.sil ? null : skinGrad(C.skin));
      inkP(D, fp, D.inkH, C.skin.ink);
      if (!D.sil && D.lod >= 1 && hr) {
        // 刘海在额头上的影子
        const cp = capPaths(D, H);
        g.save(); g.clip(fp);
        if (cp.shade) { g.globalAlpha = D.ga * 0.45; g.fillStyle = C.skin.sh; g.fill(cp.shade); }
        if (D.lod >= 2) {
          // 远侧下颌的一道柔和阴影（绘本式的单层阴影）
          const sy = H.sy;
          g.globalAlpha = D.ga * 0.28; g.fillStyle = C.skin.sh;
          g.beginPath(); g.rect(-2, -2, 4, 4); g.ellipse(0.3 * sy - 0.07, 0.36, 0.84 - 0.1 * abs(sy), 0.6, -0.18 * sy, 0, TAU); g.fill('evenodd');
          // 近侧脸颊的高光
          hsph(H, 0.55, 0.52, 1.0, T3);
          if (T3[2] > 0.3) { g.globalAlpha = D.ga * 0.5; g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(T3[0] + 0.02, T3[1] - 0.06, 0.09 * clamp(T3[2], 0.4, 1), 0.05, -0.3, 0, TAU); g.fill(); }
        }
        g.globalAlpha = D.ga; g.restore();
      }
      if (C.ear === 'human') for (const [sd, z] of earSides) if (z > -0.3) drawEar(D, H, sd);
      // 五官
      if (!D.sil) {
        drawBlush(D, H, ex);
        if (D.lod >= 2) { hproj(H, 0, 0.57, 0.93, T3); if (T3[2] > 0.3 && abs(H.sy) < 0.8) { g.fillStyle = C.skin.ink; g.globalAlpha = D.ga * 0.5; g.beginPath(); g.ellipse(T3[0], T3[1], 0.018, 0.012, 0, 0, TAU); g.fill(); g.globalAlpha = D.ga; } }
        drawMouth(D, H, ex);
        if (C.wrinkles && D.lod >= 2) {
          g.globalAlpha = D.ga * 0.35; g.strokeStyle = C.skin.ink; g.lineWidth = D.inkH * 0.5; g.beginPath();
          for (let sd = -1; sd <= 1; sd += 2) { hsph(H, sd * 0.44, 0.48, 1.0, T3); if (T3[2] > 0.2) { g.moveTo(T3[0] - 0.07, T3[1]); g.quadraticCurveTo(T3[0], T3[1] + 0.03, T3[0] + 0.07, T3[1]); } }
          g.stroke(); g.globalAlpha = D.ga;
        }
        const eyeOrder = H.sy >= 0 ? [-1, 1] : [1, -1];
        for (const sd of eyeOrder) drawEye(D, H, sd, ex);
        setT(g, D.mH);
      }
    }
    // 3. 头发帽子
    if (hr) {
      const cp = capPaths(D, H);
      fillP(D, cp.fill, D.sil ? null : hairGrad(hr.pal));
      if (!D.sil && D.lod >= 1) {
        g.globalAlpha = D.ga * 0.5; g.fillStyle = hr.pal.lt; g.fill(shineRing(H, hr)); g.globalAlpha = D.ga;
        if (cp.strands && (D.lod >= 2 || (!H.front && D.lod >= 1))) { g.lineWidth = D.inkH * 0.55; g.strokeStyle = rgba(hr.pal.ink, 0.45); g.stroke(cp.strands); }
      }
      inkP(D, cp.ink, D.inkH, hr.pal.ink);
      if (hr.messy && D.lod >= 1) drawTufts(D, H, 4, 11);
      if (D.O.bedhair && D.lod >= 1) drawTufts(D, H, 4, 23);
    }
    // 眉毛（画在刘海上面，半透明）
    if (H.front && !D.sil && D.lod >= 1) for (let sd = -1; sd <= 1; sd += 2) drawBrow(D, H, sd, ex);
    // 4. 前面的角 / 耳朵 / 马尾
    if (C.ear === 'sheep' || C.ear === 'feather') for (const [sd, z] of earSides) if (z >= 0) drawEar(D, H, sd);
    if (D.O.hearing && !D.sil && H.front) {
      for (const [sd, z] of earSides) {
        if (z < 0.3) continue;
        hsph(H, sd * (HP + 0.05), 0.3, 1.06, T3);
        const x = T3[0], y = T3[1];
        g.beginPath(); roundRectP(g, x - 0.045, y - 0.075, 0.09, 0.16, 0.035); g.fillStyle = '#e8eaf0'; g.fill(); g.lineWidth = D.inkH * 0.55; g.strokeStyle = '#6a6c7a'; g.stroke();
        g.beginPath(); g.moveTo(x - 0.02, y - 0.03); g.lineTo(x + 0.02, y - 0.03); g.moveTo(x - 0.02, y + 0.01); g.lineTo(x + 0.02, y + 0.01); g.lineWidth = D.inkH * 0.35; g.strokeStyle = '#9aa0b0'; g.stroke();
      }
    }
    let ponyBow = null;
    if (pn && !pn.low) { hsph(H, pn.psi, pn.y, 1.05, T3); if (T3[2] >= 0) { drawPony(D, H, pn, true); if (pn.bow) ponyBow = [T3[0], T3[1]]; } }
    for (const sd of hornsFront) drawHorn(D, H, sd);
    if (ponyBow) drawBow(D, ponyBow[0], ponyBow[1], pn.big ? 0.36 : 0.24, pn.bow[0], pn.bow[1], (pn.psi >= 0 ? 1 : -1) * 0.3);
    if (D.O.hat) drawStrawHat(D, H, D.O.hat);
    if (C.ear === 'rabbit' || C.ear === 'animal') for (let sd = -1; sd <= 1; sd += 2) drawEar(D, H, sd);
    if (hr && hr.ahoge && !D.O.hat) drawAhoge(D, H, hr.ahoge);
    if (D.O.headband) drawHeadband(D, H, D.O.headband, D.O.headbandFrill);
    if (D.O.headdress) drawHeadband(D, H, D.O.headdress, true);
    if (C.glasses && H.front) drawGlasses(D, H);
    if (D.O.hoodUp) drawHoodUp(D, H, D.O.hoodUp, null);
    if (C.halo) drawHalo(D, H, C.halo);
  }

  /* ================================================================
   * 身体（角色空间：单位 = 身高 1/100）
   * ================================================================ */
  const RA = new Float64Array(5), RB = new Float64Array(5), Q2 = [0, 0, 0], Q3 = [0, 0, 0];
  function computeRings(D) {
    const P = D.P, B = D.B, W = D.bw, Dp = D.bd, cy = P.cy, sy = P.sy;
    for (let i = 0; i < 5; i++) {
      const u = RING_U[i] * B.T;
      const s = P.H[0], v = P.H[1] + P.U[1] * u, f = P.H[2] + P.U[2] * u;
      D.rx[i] = -s * cy + f * sy; D.ry[i] = v;
      D.re[i] = sqrt(W[i] * W[i] * cy * cy + Dp[i] * Dp[i] * sy * sy);
    }
    let ax = D.rx[4] - D.rx[0], ay = D.ry[4] - D.ry[0];
    const al = hypot(ax, ay) || 1; ax /= al; ay /= al;
    D.nx = -ay; D.ny = ax;
    D.ax = ax; D.ay = ay;
  }
  /** 躯干在高度 u（0 髋 → 1 肩，可外推）处的截面：[cx, cy, W, Dp, ext] */
  function ringAt(D, u, out) {
    let i = 0;
    while (i < 3 && u > RING_U[i + 1]) i++;
    const k = (u - RING_U[i]) / (RING_U[i + 1] - RING_U[i]);
    out[0] = lerp(D.rx[i], D.rx[i + 1], k); out[1] = lerp(D.ry[i], D.ry[i + 1], k);
    out[2] = lerp(D.bw[i], D.bw[i + 1], k); out[3] = lerp(D.bd[i], D.bd[i + 1], k);
    out[4] = lerp(D.re[i], D.re[i + 1], k);
    return out;
  }
  /** 躯干表面的点：u 高度，phi 方位（0 = 正前，+ = 角色右侧），d 向外膨胀 → [x, y, z] */
  function surf(D, u, phi, d, out) {
    ringAt(D, u, RB);
    const P = D.P, W = RB[2] + d, Dd = RB[3] + d;
    const s = W * sin(phi), f = Dd * cos(phi);
    const lx = -s * P.cy + f * P.sy;
    out[0] = RB[0] + lx * D.nx; out[1] = RB[1] + lx * D.ny;
    out[2] = s * P.sy + f * P.cy;
    return out;
  }
  /** 躯干外轮廓（u0 → u1），inf 为向外膨胀量 */
  function torsoPath(D, g, u0, u1, inf, shoulder) {
    const xs = SX[1], ys = SY[1];
    let n = 0;
    const steps = [u0];
    for (const u of RING_U) if (u > u0 + 0.02 && u < u1 - 0.02) steps.push(u);
    steps.push(u1);
    for (let i = 0; i < steps.length; i++) { ringAt(D, steps[i], RA); const e = RA[4] + inf; xs[n] = RA[0] - D.nx * e; ys[n] = RA[1] - D.ny * e; n++; }
    const nL = n;
    for (let i = steps.length - 1; i >= 0; i--) { ringAt(D, steps[i], RA); const e = RA[4] + inf; xs[n] = RA[0] + D.nx * e; ys[n] = RA[1] + D.ny * e; n++; }
    g.moveTo(xs[0], ys[0]);
    for (let i = 1; i < nL; i++) g.lineTo(xs[i], ys[i]);
    if (shoulder) {
      ringAt(D, u1, RA);
      const nw = D.B.R * 0.22 + inf * 0.5, up = shoulder;
      const cx = RA[0] - D.ax * up * 0.1, cy = RA[1] - D.ay * up * 0.1;
      const lx = xs[nL - 1], ly = ys[nL - 1], rx = xs[nL], ry = ys[nL];
      g.quadraticCurveTo(lx + D.ax * up * 0.9, ly + D.ay * up * 0.9, cx - D.nx * nw + D.ax * up, cy - D.ny * nw + D.ay * up);
      g.lineTo(cx + D.nx * nw + D.ax * up, cy + D.ny * nw + D.ay * up);
      g.quadraticCurveTo(rx + D.ax * up * 0.9, ry + D.ay * up * 0.9, rx, ry);
    } else g.lineTo(xs[nL], ys[nL]);
    for (let i = nL + 1; i < n; i++) g.lineTo(xs[i], ys[i]);
    ringAt(D, u0, RA);
    g.quadraticCurveTo(RA[0] - D.ax * 1.2, RA[1] - D.ay * 1.2, xs[0], ys[0]);
    g.closePath();
  }
  const CLOTHG = new Map();
  function clothGrad(D, c) {
    const key = c + D.B.heads;
    let gr = CLOTHG.get(key);
    if (!gr) { gr = linG('cloth:' + c + ':' + D.B.T.toFixed(1), -9, -D.B.T - 2, 9, 4, [0, lt(c, 0.16), 0.5, c, 1, mix(c, '#2a1a2a', 0.18)]); CLOTHG.set(key, gr); }
    return gr;
  }
  /** 在髋部为原点的坐标里填渐变（路径已按角色坐标建好） */
  function fillAtHip(D, style) {
    const g = D.g;
    if (D.sil || typeof style === 'string') { g.fillStyle = D.sil || style; g.fill(); return; }
    const hx = D.hipX, hy = D.hipY;
    g.translate(hx, hy); g.fillStyle = style; g.fill(); g.translate(-hx, -hy);
  }
  /** 沿躯干表面的一条线（u0,phi0）→（u1,phi1），只画可见的部分 */
  function surfLine(D, g, u0, p0, u1, p1, d, n = 6) {
    let on = false;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      surf(D, lerp(u0, u1, k), lerp(p0, p1, k), d, Q2);
      if (Q2[2] > -0.2) { if (on) g.lineTo(Q2[0], Q2[1]); else { g.moveTo(Q2[0], Q2[1]); on = true; } } else on = false;
    }
  }
  /** 躯干表面的一块多边形（点列 [u, phi]），全部不可见时不画 */
  function surfPoly(D, g, pts, d) {
    let vis = 0;
    for (let i = 0; i < pts.length; i++) { surf(D, pts[i][0], pts[i][1], d, Q2); if (Q2[2] > 0) vis++; if (i) g.lineTo(Q2[0], Q2[1]); else g.moveTo(Q2[0], Q2[1]); }
    g.closePath();
    return vis;
  }

  /* ---- 躯干 + 衣服细节 ---- */
  function drawTorso(D) {
    const g = D.g, O = D.O, P = D.P, B = D.B;
    const top = O.top;
    g.beginPath();
    torsoPath(D, g, 0, 1, 0, 1.6);
    if (O.collar && O.collar.type === 'off') {
      fillAtHip(D, D.C.skin.c);
      inkC(D, D.ink, D.C.skin.ink);
      g.beginPath(); torsoPath(D, g, 0, 0.84, 0.05, 0);
    }
    fillAtHip(D, clothGrad(D, top));
    inkC(D, D.ink, inkOf(top));
    if (D.sil || P.back) {
      if (P.back && !D.sil && O.bib) { /* 背面：背带 */ g.beginPath(); surfLine(D, g, 0.72, 2.4, 1.0, 2.6, 0.1); surfLine(D, g, 0.72, -2.4, 1.0, -2.6, 0.1); lineC(D, 1.1, O.bib.strap || top); }
      return;
    }
    const inkW = D.ink;
    // 背心裙（莉瑟）：前片 + 两条肩带
    if (O.pinafore) {
      const pc = O.pinafore;
      g.beginPath();
      if (surfPoly(D, g, [[0.0, -0.9], [0.62, -0.72], [0.66, -0.4], [0.64, 0], [0.66, 0.4], [0.62, 0.72], [0.0, 0.9]], 0.12)) { fillAtHip(D, clothGrad(D, pc)); inkC(D, inkW * 0.8, inkOf(pc)); }
      g.beginPath(); surfLine(D, g, 0.62, 0.55, 1.03, 0.62, 0.12, 3); surfLine(D, g, 0.62, -0.55, 1.03, -0.62, 0.12, 3);
      g.lineCap = 'round'; g.lineWidth = 1.6 + inkW * 1.6; g.strokeStyle = D.sil || inkOf(pc); g.stroke(); g.lineWidth = 1.6; g.strokeStyle = D.sil || pc; g.stroke();
      if (!D.sil && D.lod >= 1) { for (const sg of [1, -1]) { surf(D, 0.6, sg * 0.55, 0.3, Q2); if (Q2[2] > 0.3) { g.beginPath(); g.arc(Q2[0], Q2[1], 0.55, 0, TAU); g.fillStyle = '#e8c060'; g.fill(); } } }
    }
    // 背心裙露出的衬衫
    if (O.bib) {
      g.beginPath();
      if (surfPoly(D, g, [[1.02, -0.66], [0.8, -0.56], [0.72, -0.3], [0.7, 0], [0.72, 0.3], [0.8, 0.56], [1.02, 0.66]], 0.05)) { fillC(D, O.bib.c); inkC(D, inkW * 0.8, inkOf(O.bib.c)); }
    }
    // 毛衣背心 / 西装马甲：V 领露出衬衫
    if (O.vest) {
      g.beginPath();
      if (surfPoly(D, g, [[1.02, -0.5], [0.56, 0], [1.02, 0.5]], 0.08)) { fillC(D, O.top === O.vest.c ? '#f6f4ef' : O.top); inkC(D, inkW * 0.8, inkOf(O.vest.c)); }
    }
    // 领子 / 领结 / 领带
    drawCollar(D);
    // 纽扣
    if (O.buttons && D.lod >= 1) {
      g.fillStyle = O.buttons;
      for (const u of [0.66, 0.5, 0.34]) { surf(D, u, 0, 0.15, Q2); if (Q2[2] > 0.3) { g.beginPath(); g.arc(Q2[0], Q2[1], 0.45, 0, TAU); g.fill(); } }
    }
    // 睡衣上的小圆点
    if (O.dots && D.lod >= 1) {
      g.fillStyle = O.dots; g.globalAlpha = D.ga * 0.8;
      for (let k = 0; k < 9; k++) { surf(D, 0.15 + (k % 3) * 0.28 + (k > 2 ? 0.1 : 0), -1.0 + (k * 0.75) % 2.1, 0.1, Q2); if (Q2[2] > 0.2) { g.beginPath(); g.arc(Q2[0], Q2[1], 0.55, 0, TAU); g.fill(); } }
      g.globalAlpha = D.ga;
    }
    // 腰封 / 束腰
    if (O.corset) {
      g.beginPath(); torsoPath(D, g, O.corset.y0, O.corset.y1, 0.25, 0);
      fillC(D, O.corset.c); inkC(D, inkW * 0.8, dk(O.corset.c, 0.3));
      if (O.pouches && D.lod >= 1) {
        for (const ph of [0.5, 0.95, -0.7]) {
          surf(D, (O.corset.y0 + O.corset.y1) / 2 - 0.06, ph, 0.7, Q2);
          if (Q2[2] < 0.4) continue;
          g.beginPath(); g.roundRect ? g.roundRect(Q2[0] - 1.1, Q2[1] - 1.1, 2.2, 2.6, 0.4) : g.rect(Q2[0] - 1.1, Q2[1] - 1.1, 2.2, 2.6);
          fillC(D, O.pouches); inkC(D, inkW * 0.6, '#16121a');
        }
        surf(D, O.corset.y0 + 0.02, 0.25, 0.9, Q2);
        if (Q2[2] > 0.4) { g.beginPath(); g.ellipse(Q2[0], Q2[1] + 1.2, 1.0, 1.3, 0, 0, TAU); fillC(D, '#f4f0ea'); inkC(D, inkW * 0.6, '#8a8490'); }
      }
    }
    if (O.belt) { g.beginPath(); torsoPath(D, g, 0.0, 0.1, 0.3, 0); fillC(D, O.belt); inkC(D, inkW * 0.7, dk(O.belt, 0.4)); }
    if (O.sash) { g.beginPath(); torsoPath(D, g, 0.2, 0.34, 0.3, 0); fillC(D, O.sash); inkC(D, inkW * 0.7, inkOf(O.sash)); }
    // 三色缎带（纯烬）
    if (O.tricolor && D.lod >= 1) {
      const bands = [['#c8323c', -0.55], ['#fbfaf6', 0], ['#3f64b8', 0.55]];
      g.lineCap = 'butt';
      for (const sgn of [1, -1]) for (const [c, o] of bands) {
        g.beginPath(); surfLine(D, g, 0.97, sgn * -1.05 + o * 0.12, 0.44, sgn * 0.62 + o * 0.12, 0.35, 5);
        lineC(D, 0.75, c);
      }
      g.lineCap = 'round';
    }
    // 花边系带（玛格娜的家居裙）
    if (O.lacing && D.lod >= 2) { g.beginPath(); for (let k = 0; k < 5; k++) { surf(D, 0.2 + k * 0.1, -0.12, 0.1, Q2); g.moveTo(Q2[0], Q2[1]); surf(D, 0.25 + k * 0.1, 0.12, 0.1, Q2); g.lineTo(Q2[0], Q2[1]); } lineC(D, 0.35, O.lacing); }
    if (O.pendant) {
      g.beginPath(); surfLine(D, g, 0.99, -0.45, 0.8, 0, 0.1, 4); surfLine(D, g, 0.8, 0, 0.99, 0.45, 0.1, 4); lineC(D, 0.25, '#b8903a');
      surf(D, 0.78, 0, 0.3, Q2); if (Q2[2] > 0.3) { g.beginPath(); g.arc(Q2[0], Q2[1], 0.6, 0, TAU); fillC(D, O.pendant); inkC(D, inkW * 0.5, '#8a6a20'); }
    }
    // 毛衣的罗纹
    if ((O.vest && O.vest.knit || O.knit) && D.lod >= 2) {
      g.beginPath();
      for (let k = -3; k <= 3; k++) surfLine(D, g, 0.05, k * 0.32, 0.5, k * 0.32, 0.05, 3);
      lineC(D, 0.2, O.vest ? O.vest.knit || dk(O.top, 0.2) : O.knit);
    }
  }
  function drawCollar(D) {
    const g = D.g, O = D.O, cl = O.collar, ne = O.neck, inkW = D.ink;
    if (cl) {
      const c = cl.c;
      g.beginPath();
      if (cl.type === 'shirt') {
        let v = 0;
        v += surfPoly(D, g, [[1.04, 0.02], [0.84, 0.36], [0.96, 0.62], [1.06, 0.4]], 0.25);
        v += surfPoly(D, g, [[1.04, -0.02], [0.84, -0.36], [0.96, -0.62], [1.06, -0.4]], 0.25);
        if (v) { fillC(D, c); inkC(D, inkW * 0.75, inkOf(c)); }
      } else if (cl.type === 'peter') {
        for (const sg of [1, -1]) {
          g.beginPath();
          if (surfPoly(D, g, [[1.04, sg * 0.03], [0.9, sg * 0.1], [0.84, sg * 0.4], [0.9, sg * 0.75], [1.02, sg * 0.9], [1.06, sg * 0.5]], 0.3)) { fillC(D, c); inkC(D, inkW * 0.75, inkOf(c)); }
        }
      } else if (cl.type === 'jabot') {
        const xs = SX[1], ys = SY[1];
        let n = 0;
        for (let k = 0; k <= 6; k++) { surf(D, 1.0 - k * 0.07, 0.18 + (k % 2) * 0.06, 0.4, Q2); xs[n] = Q2[0]; ys[n] = Q2[1]; n++; }
        for (let k = 6; k >= 0; k--) { surf(D, 1.0 - k * 0.07, -0.18 - (k % 2) * 0.06, 0.4, Q2); xs[n] = Q2[0]; ys[n] = Q2[1]; n++; }
        surf(D, 0.6, 0, 0.4, Q2);
        if (Q2[2] > 0.2) { g.beginPath(); smooth(g, xs, ys, n, true); fillC(D, c); inkC(D, inkW * 0.7, '#9a9098'); }
        if (!D.sil && D.lod >= 1) { g.beginPath(); for (let k = 1; k < 6; k++) { surf(D, 1.0 - k * 0.07, -0.16, 0.45, Q2); g.moveTo(Q2[0], Q2[1]); surf(D, 1.0 - k * 0.07 - 0.03, 0.16, 0.45, Q2); g.lineTo(Q2[0], Q2[1]); } lineC(D, 0.2, '#c8c0c8'); }
      } else if (cl.type === 'ruffle') {
        for (let k = -3; k <= 3; k++) { surf(D, 1.0, k * 0.28, 0.5, Q2); if (Q2[2] < 0.1) continue; g.moveTo(Q2[0] + 1.3, Q2[1]); g.arc(Q2[0], Q2[1] + 0.3, 1.3, 0, TAU); }
        fillC(D, c); inkC(D, inkW * 0.6, inkOf(c));
      } else if (cl.type === 'turtle') {
        ringAt(D, 1.0, RA);
        const w = D.B.R * 0.3;
        g.moveTo(RA[0] - D.nx * w, RA[1] - D.ny * w); g.lineTo(RA[0] - D.nx * w + D.ax * 2.6, RA[1] - D.ny * w + D.ay * 2.6);
        g.quadraticCurveTo(RA[0] + D.ax * 3.3, RA[1] + D.ay * 3.3, RA[0] + D.nx * w + D.ax * 2.6, RA[1] + D.ny * w + D.ay * 2.6);
        g.lineTo(RA[0] + D.nx * w, RA[1] + D.ny * w); g.closePath();
        fillC(D, lt(c, 0.06)); inkC(D, inkW * 0.7, inkOf(c));
      } else if (cl.type === 'square') {
        if (surfPoly(D, g, [[1.04, -0.55], [0.84, -0.5], [0.8, 0], [0.84, 0.5], [1.04, 0.55]], 0.06)) { fillC(D, D.C.skin.c); inkC(D, inkW * 0.7, c); }
      }
    }
    if (!ne) return;
    if (ne.bow) {
      surf(D, 0.93, 0, 0.6, Q2);
      if (Q2[2] > 0.2) {
        const s = D.B.R * (D.B === BODIES.child ? 0.12 : 0.09) * (0.5 + 0.5 * Q2[2] / 4);
        g.save(); g.translate(Q2[0], Q2[1]); g.scale(s * (0.4 + 0.6 * abs(D.P.cy)), s);
        bowShape(g, D, ne.bow, D.ink / s);
        g.restore();
      }
    } else if (ne.tie) {
      const tie = ne.tie;
      g.beginPath();
      const xs = SX[1], ys = SY[1];
      let n = 0;
      const sway = D.clothX * 0.12;
      for (const [u, ph] of [[0.97, 0.07], [0.9, 0.05], [0.5, 0.1], [0.4, 0], [0.5, -0.1], [0.9, -0.05], [0.97, -0.07]]) { surf(D, u, ph, 0.5, Q2); xs[n] = Q2[0] + (u < 0.6 ? sway : 0); ys[n] = Q2[1]; n++; }
      surf(D, 0.6, 0, 0.5, Q2);
      if (Q2[2] > 0.3) {
        g.moveTo(xs[0], ys[0]); for (let i = 1; i < n; i++) g.lineTo(xs[i], ys[i]); g.closePath();
        fillC(D, tie); inkC(D, D.ink * 0.8, inkOf(tie));
        surf(D, 0.96, 0, 0.6, Q2); g.beginPath(); g.ellipse(Q2[0], Q2[1], 1.0, 0.9, 0, 0, TAU); fillC(D, dk(tie, 0.12)); inkC(D, D.ink * 0.7, inkOf(tie));
        if (!D.sil && D.lod >= 2) { g.beginPath(); surfLine(D, g, 0.86, 0.06, 0.62, -0.08, 0.55, 2); surfLine(D, g, 0.76, 0.08, 0.52, -0.06, 0.55, 2); lineC(D, 0.25, lt(tie, 0.3)); }
      }
    } else if (ne.ribbon) {
      surf(D, 0.94, 0, 0.6, Q2);
      if (Q2[2] > 0.2) { const s = D.B.R * 0.07; g.save(); g.translate(Q2[0], Q2[1]); g.scale(s * (0.4 + 0.6 * abs(D.P.cy)), s); bowShape(g, D, ne.ribbon, D.ink / s); g.restore(); }
    } else if (ne.kerchief) {
      const c = ne.kerchief;
      g.beginPath();
      if (surfPoly(D, g, [[1.04, -0.75], [0.66, -0.05], [0.62, 0.1], [1.04, 0.75]], 0.6)) {
        fillC(D, c); inkC(D, D.ink * 0.8, inkOf(c));
        if (!D.sil && D.lod >= 1) { g.fillStyle = ne.pat; for (const [u, ph] of [[0.9, -0.3], [0.8, 0.1], [0.72, -0.05], [0.94, 0.35]]) { surf(D, u, ph, 0.7, Q2); g.beginPath(); g.arc(Q2[0], Q2[1], 0.45, 0, TAU); g.fill(); } }
        surf(D, 0.98, 0.05, 0.8, Q2); g.beginPath(); g.ellipse(Q2[0], Q2[1], 1.1, 0.8, 0.3, 0, TAU); fillC(D, dk(c, 0.1)); inkC(D, D.ink * 0.7, inkOf(c));
      }
    }
  }
  /** 蝴蝶结（单位大小，局部坐标） */
  function bowShape(g, D, c, lw) {
    const ink = inkOf(c);
    g.beginPath();
    g.moveTo(0, 0); g.bezierCurveTo(-0.6, -0.9, -1.5, -0.6, -1.4, 0.1); g.bezierCurveTo(-1.3, 0.6, -0.5, 0.5, 0, 0);
    g.moveTo(0, 0); g.bezierCurveTo(0.6, -0.9, 1.5, -0.6, 1.4, 0.1); g.bezierCurveTo(1.3, 0.6, 0.5, 0.5, 0, 0);
    g.moveTo(-0.15, 0.2); g.lineTo(-0.7, 1.5); g.lineTo(-0.3, 1.35); g.lineTo(0, 0.3);
    g.moveTo(0.15, 0.2); g.lineTo(0.7, 1.5); g.lineTo(0.3, 1.35); g.lineTo(0, 0.3);
    g.fillStyle = D.sil || c; g.fill(); g.lineWidth = lw; g.strokeStyle = D.sil || ink; g.stroke();
    g.beginPath(); g.ellipse(0, 0.05, 0.36, 0.4, 0, 0, TAU); g.fillStyle = D.sil || dk(c, 0.12); g.fill(); g.stroke();
  }

  /* ---- 裙子：腰 → 下摆，随动作摆动 ---- */
  function skirtGeom(D, sk, lenK) {
    const P = D.P, B = D.B;
    ringAt(D, 0.28, RA);
    const wx = RA[0], wy = RA[1], wW = RA[2] + 0.3, wD = RA[3] + 0.3;
    const len = (sk.len * lenK) * B.leg * (P.twirl ? 0.8 : 1);
    let flare = sk.flare * (P.twirl ? 2.2 : 1) + (P.run ? 1.2 : P.mv ? 0.4 : 0) + (P.air ? P.air * 1.5 : 0) + (P.floaty ? 1.4 : 0);
    const dx = D.clothX * (0.45 + sk.len) + (P.floaty ? 1.2 * sin(P.t * 1.1) : 0);
    const lift = (P.twirl ? 0.25 : 0) + (P.air ? -P.vy * 0.12 : 0) + (P.floaty ? 0.1 : 0) + abs(D.clothX) * 0.012;
    // 下摆随腿的位置倾斜：取两膝的中点方向
    const hx = wx + dx;
    let hy = D.hipY + len * (1 - lift), spread = 0;
    if (!P.lie && hy > -0.6) { spread = (hy + 0.6) * 0.6; hy = -0.6; }
    return { wx, wy, wW, wD, hx, hy, hW: wW + flare + spread, hD: wD + flare * 0.7 + spread * 0.5, len };
  }
  function drawSkirt(D, sk, lenK = 1, colorOverride, noHem) {
    const g = D.g, P = D.P, G = skirtGeom(D, sk, lenK);
    const cy = P.cy, sy = P.sy;
    const eW = (w, d) => sqrt(w * w * cy * cy + d * d * sy * sy);
    const we = eW(G.wW, G.wD), he = eW(G.hW, G.hD);
    const phc = atan2(G.hW * sy, G.hD * cy);
    const N = 14, xs = SX[1], ys = SY[1];
    const t = P.t, hemType = noHem ? 'plain' : sk.hem;
    for (let i = 0; i <= N; i++) {
      const ph = phc + HP - (i / N) * PI;
      const s = G.hW * sin(ph), f = G.hD * cos(ph), z = s * sy + f * cy;
      let x = G.hx - s * cy + f * sy, y = G.hy + max(0, z) * 0.28;
      if (hemType === 'scallop' || hemType === 'lace') y += 0.5 * abs(sin(i * PI / 2));
      else if (hemType === 'pleat') y += (i % 2) * 0.6;
      else if (hemType === 'soot') y += 0.9 * sin(i * 2.1 + t * 0.8) + 0.6;
      xs[i] = x; ys[i] = y;
    }
    const col = colorOverride || sk.c;
    // 衬裙褶边（在裙子后面）
    if (hemType === 'frill' && !colorOverride) {
      g.beginPath();
      g.moveTo(G.wx - we, G.wy);
      g.quadraticCurveTo(G.hx - he * 1.05, (G.wy + G.hy) / 2, xs[0] - 0.6, ys[0] + 1.6);
      for (let i = 1; i <= N; i++) g.quadraticCurveTo((xs[i - 1] + xs[i]) / 2, (ys[i - 1] + ys[i]) / 2 + 3.2, xs[i] + (i === N ? 0.6 : 0), ys[i] + 1.6);
      g.quadraticCurveTo(G.hx + he * 1.05, (G.wy + G.hy) / 2, G.wx + we, G.wy);
      g.closePath();
      fillC(D, sk.trim); inkC(D, D.ink * 0.8, '#9a9aa8');
    }
    g.beginPath();
    g.moveTo(G.wx - we, G.wy);
    g.quadraticCurveTo(lerp(G.wx - we, xs[0], 0.35) - 0.8, lerp(G.wy, ys[0], 0.6), xs[0], ys[0]);
    for (let i = 1; i <= N; i++) g.quadraticCurveTo(xs[i - 1] + (xs[i] - xs[i - 1]) * 0.5, ys[i - 1] + (ys[i] - ys[i - 1]) * 0.5 + (hemType === 'scallop' ? 0.9 : 0.3), xs[i], ys[i]);
    g.quadraticCurveTo(lerp(G.wx + we, xs[N], 0.35) + 0.8, lerp(G.wy, ys[N], 0.6), G.wx + we, G.wy);
    g.closePath();
    fillAtHip(D, clothGrad(D, col));
    inkC(D, D.ink, inkOf(col));
    if (D.sil || D.lod === 0 || colorOverride) return G;
    // 褶线
    if (hemType === 'pleat' || sk.plaid) {
      g.beginPath();
      for (let i = 2; i < N - 1; i += 2) { g.moveTo(lerp(G.wx - we, G.wx + we, i / N), G.wy + 1); g.lineTo(xs[i], ys[i] - 0.3); }
      lineC(D, D.ink * 0.6, rgba(inkOf(col), 0.6));
    }
    if (sk.plaid && D.lod >= 2) {
      g.beginPath();
      for (let k = 1; k < 4; k++) { const f = k / 4; g.moveTo(lerp(G.wx - we, xs[0], f), lerp(G.wy, ys[0], f)); g.lineTo(lerp(G.wx + we, xs[N], f), lerp(G.wy, ys[N], f)); }
      lineC(D, 0.35, sk.plaid);
    }
    if (hemType === 'lace') {
      g.beginPath();
      for (let i = 0; i < N; i++) { const x = (xs[i] + xs[i + 1]) / 2, y = (ys[i] + ys[i + 1]) / 2; g.moveTo(x + 1, y - 0.3); g.arc(x, y - 0.3, 1, 0, PI); }
      fillC(D, sk.trim); inkC(D, D.ink * 0.5, '#b8b0c0');
    }
    if (hemType === 'soot') {
      // 被火山灰熏黑的裙摆：一圈烟团
      g.beginPath();
      for (let i = 0; i <= N; i++) {
        const r = 1.5 + 0.7 * sin(i * 1.7 + t * 0.6);
        g.moveTo(xs[i] + r, ys[i] - 0.9); g.arc(xs[i], ys[i] - 0.9, r, 0, TAU);
      }
      g.moveTo(xs[0], ys[0] - 2);
      for (let i = 1; i <= N; i++) g.lineTo(xs[i], ys[i] - 2.2);
      for (let i = N; i >= 0; i--) g.lineTo(xs[i], ys[i] - 0.5);
      fillC(D, sk.trim);
      g.globalAlpha = D.ga * 0.5;
      for (let k = 0; k < 4; k++) { const f = fract(t * 0.25 + k * 0.25), i = (k * 4 + 2) % N; g.beginPath(); g.arc(xs[i] + (k - 1.5) * 1.2, ys[i] + 1 + f * 3, 0.6 * (1 - f) + 0.2, 0, TAU); g.fillStyle = sk.trim; g.fill(); }
      g.globalAlpha = D.ga;
    }
    if (sk.check && D.lod >= 2) {
      // 红白格纹带
      const [c1, c2] = sk.check;
      for (let i = 1; i < N; i++) {
        const x = xs[i], y = ys[i] - 2.4;
        g.fillStyle = i % 2 ? c1 : c2; g.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
      }
    }
    if (D.O.apron) {
      g.beginPath();
      const k0 = 0.3, k1 = 0.7;
      g.moveTo(lerp(G.wx - we, G.wx + we, 0.28), G.wy);
      g.lineTo(lerp(xs[0], xs[N], 0.2) , lerp(ys[0], ys[N], 0.2) - 3.2);
      for (let i = 0; i <= 6; i++) { const f = lerp(k0 - 0.1, k1 + 0.1, i / 6); g.quadraticCurveTo(lerp(xs[0], xs[N], f) , lerp(ys[0], ys[N], f) - 1.2, lerp(xs[0], xs[N], f + 0.033), lerp(ys[0], ys[N], f) - 2.4); }
      g.lineTo(lerp(G.wx - we, G.wx + we, 0.72), G.wy);
      g.closePath();
      fillC(D, D.O.apron); inkC(D, D.ink * 0.6, '#a8a8b8');
    }
    return G;
  }

  /* ---- 长外套 / 短外套（前襟敞开）：背片 / 两侧前片 / 躯干部分 ---- */
  function coatLevels(D, co) {
    const P = D.P, B = D.B, len = co.len * B.leg;
    ringAt(D, 0, RA);
    const hx = RA[0], hy = RA[1], hW = RA[2] + 0.7, hDp = RA[3] + 0.7;
    const L = D.coatL || (D.coatL = []);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const flare = (co.flare != null ? co.flare : 2.2) * pow(k, 0.9) + (P.run ? 1.6 : P.mv ? 0.5 : 0) * k + (P.floaty ? 1.5 * k : 0);
      const dx = D.clothX * k * k * 1.15 + (P.floaty ? 1.4 * sin(P.t * 1.1) * k : 0);
      const lift = abs(D.clothX) * 0.02 * k + (P.air ? -P.vy * 0.1 * k : 0);
      let y = hy + len * k * (1 - lift), W = hW + flare;
      if (!P.lie && y > -0.7) { W += (y + 0.7) * 0.55; y = -0.7 - (1 - k) * 0.2; }
      L[i] = { x: hx + dx, y, W, Dp: hDp + flare * 0.6, k };
    }
    return L;
  }
  function panelEdge(D, lv, phi) {
    const P = D.P, s = lv.W * sin(phi), f = lv.Dp * cos(phi);
    Q3[0] = lv.x - s * P.cy + f * P.sy; Q3[1] = lv.y; Q3[2] = s * P.sy + f * P.cy;
    return Q3;
  }
  /** part: 'back'（背片，前视时看到的是里子）| 'front'（两侧前片）| 'full'（背影） */
  function drawCoatSkirt(D, co, part) {
    const g = D.g, P = D.P, L = coatLevels(D, co), n = L.length;
    const cy = P.cy, sy = P.sy;
    const ext = (lv) => sqrt(lv.W * lv.W * cy * cy + lv.Dp * lv.Dp * sy * sy);
    const t = P.t, tat = co.tatter && D.lod >= 1;
    const hem = (x0, x1, y, pts) => {
      // 下摆：破口 / 平滑
      const N = 8;
      for (let i = 1; i <= N; i++) {
        const f = i / N, x = lerp(x0, x1, f);
        let yy = y + sin(f * PI) * 0.8;
        if (tat) yy += (hash(7, i + (x0 > x1 ? 20 : 0)) - 0.3) * 2.4 * (i % 2 ? 1 : 0.4);
        pts.push(x, yy);
      }
    };
    const draw = (xL, xR, isBack, color) => {
      // xL, xR：每层的左右边界（数组）
      g.beginPath();
      g.moveTo(xL[0], L[0].y);
      for (let i = 1; i < n; i++) g.lineTo(xL[i], L[i].y);
      const pts = [];
      hem(xL[n - 1], xR[n - 1], L[n - 1].y, pts);
      for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      for (let i = n - 2; i >= 0; i--) g.lineTo(xR[i], L[i].y);
      g.closePath();
      fillAtHip(D, typeof color === 'string' && !D.sil ? clothGrad(D, color) : color);
      inkC(D, D.ink, inkOf(co.c));
    };
    const xL = [], xR = [];
    if (part === 'back' || part === 'full') {
      for (let i = 0; i < n; i++) { const e = ext(L[i]); xL.push(L[i].x - e); xR.push(L[i].x + e); }
      // 跪 / 坐在地上时，后摆铺在身后的地上：看到的是外面而不是里子
      const low = D.hipY > -D.B.leg * 0.62;
      draw(xL, xR, true, part === 'back' && !low ? co.lining : co.c);
      if (part === 'full' && co.stripes && !D.sil && D.lod >= 1) {
        // 背面的红色条纹
        g.beginPath(); const y = L[n - 1].y - 3.2; g.moveTo(xL[n - 1] + 0.8, y); g.lineTo(xR[n - 1] - 0.8, y);
        g.lineWidth = 0.9; g.strokeStyle = co.stripes; g.stroke();
      }
      return;
    }
    // 前片：近侧（角色右侧，φ>0）与远侧
    for (const sg of [1, -1]) {
      xL.length = 0; xR.length = 0;
      let vis = 0;
      const lin = [];
      for (let i = 0; i < n; i++) {
        const lv = L[i], e = ext(lv), phe = sg * ((co.open || 0.35) + 0.3 * lv.k + (P.run ? 0.25 * lv.k : 0));
        panelEdge(D, lv, phe);
        const ex = Q3[0], ez = Q3[2];
        if (ez > 0) vis++;
        const sideX = (sg > 0) === (cy >= 0) ? lv.x - e : lv.x + e;
        const inner = ez > 0 ? ex : sideX;
        if (sideX < inner) { xL.push(sideX); xR.push(inner); } else { xL.push(inner); xR.push(sideX); }
        lin.push(ez > 0 ? ex : null);
      }
      if (!vis) continue;
      draw(xL, xR, false, co.c);
      // 前襟内侧露出的里子
      if (!D.sil && co.lining && D.lod >= 1) {
        g.beginPath();
        let on = false;
        for (let i = 1; i < n; i++) {
          if (lin[i] == null) continue;
          const w = 0.35 + 1.1 * L[i].k, dir = (sg > 0) === (cy >= 0) ? -1 : 1;
          if (!on) { g.moveTo(lin[i], L[i].y); on = true; } else g.lineTo(lin[i], L[i].y);
          void w; void dir;
        }
        for (let i = n - 1; i >= 1; i--) { if (lin[i] == null) continue; const w = 0.35 + 1.1 * L[i].k, dir = (sg > 0) === (cy >= 0) ? -1 : 1; g.lineTo(lin[i] + dir * w, L[i].y - 0.2); }
        g.closePath();
        g.fillStyle = co.lining; g.fill();
      }
      if (!D.sil && co.stripes && D.lod >= 1) {
        // 下摆上方的红色条纹
        const y = L[n - 1].y - 3.2, i2 = n - 1;
        g.beginPath(); g.moveTo(xL[i2] + 0.6, y); g.lineTo(xR[i2] - 0.6, y); g.lineWidth = 0.9; g.strokeStyle = co.stripes; g.stroke();
      }
    }
  }
  function drawCoatTorso(D, co) {
    const g = D.g, P = D.P;
    const inf = 0.55;
    if (P.back) {
      g.beginPath(); torsoPath(D, g, 0, 1, inf, 1.9); fillAtHip(D, clothGrad(D, co.c)); inkC(D, D.ink, inkOf(co.c));
      return;
    }
    for (const sg of [1, -1]) {
      const pts = [];
      let vis = 0;
      for (const u of [0, 0.28, 0.52, 0.78, 1.0]) {
        const phe = sg * ((co.open || 0.35) + (1 - u) * 0.05 + (u > 0.8 ? (u - 0.8) * 1.5 : 0));
        surf(D, u, phe, inf, Q2);
        ringAt(D, u, RA);
        const e = RA[4] + inf;
        const sideX = (sg > 0) === (P.cy >= 0) ? RA[0] - D.nx * e : RA[0] + D.nx * e;
        const sideY = (sg > 0) === (P.cy >= 0) ? RA[1] - D.ny * e : RA[1] + D.ny * e;
        if (Q2[2] > 0) vis++;
        pts.push([sideX, sideY, Q2[2] > 0 ? Q2[0] : sideX, Q2[2] > 0 ? Q2[1] : sideY, u]);
      }
      if (!vis) continue;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      // 肩到领口
      ringAt(D, 1, RA);
      const nw = D.B.R * 0.24;
      const sgx = (sg > 0) === (P.cy >= 0) ? -1 : 1;
      g.quadraticCurveTo(pts[4][0] + D.ax * 1.6, pts[4][1] + D.ay * 1.6, RA[0] + sgx * D.nx * nw + D.ax * 1.9, RA[1] + sgx * D.ny * nw + D.ay * 1.9);
      g.lineTo(pts[4][2], pts[4][3]);
      for (let i = pts.length - 2; i >= 0; i--) g.lineTo(pts[i][2], pts[i][3]);
      g.closePath();
      fillAtHip(D, clothGrad(D, co.c));
      inkC(D, D.ink, inkOf(co.c));
      // 翻领
      if (!D.sil && D.lod >= 1 && pts[4][2] !== pts[4][0]) {
        g.beginPath(); g.moveTo(pts[4][2], pts[4][3]); g.lineTo(pts[2][2] + sgx * -0.2, pts[2][3]); g.lineTo(lerp(pts[3][2], pts[3][0], 0.35), pts[3][3]); g.closePath();
        g.fillStyle = co.sh || dk(co.c, 0.12); g.fill(); g.lineWidth = D.ink * 0.6; g.strokeStyle = inkOf(co.c); g.stroke();
      }
      if (!D.sil && co.pockets && D.lod >= 1) {
        const px = lerp(pts[1][0], pts[1][2], 0.5), py = pts[1][1] + 1.5;
        g.beginPath(); g.rect(px - 1.6, py - 1.2, 3.2, 2.6); g.lineWidth = D.ink * 0.6; g.strokeStyle = inkOf(co.c); g.stroke();
      }
    }
  }
  /** 放下的兜帽（在脖子后面） */
  function drawHoodDown(D, c, sh) {
    const g = D.g, P = D.P;
    ringAt(D, 1, RA);
    const cx = RA[0] - D.ax * 1.2 - P.sy * 1.8 * (P.back ? -1 : 1) * 0, cy = RA[1] + D.ay * 1.0;
    const rx = RA[4] * 0.95 + 1.2, ry = 5.2;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, P.back ? 0 : PI, P.back ? PI * 2 : TAU);
    g.ellipse(cx, cy - 1.2, rx, ry * 0.7, 0, 0, TAU);
    fillC(D, c); inkC(D, D.ink, inkOf(c));
    if (!D.sil && D.lod >= 1) { g.beginPath(); g.ellipse(cx, cy - 1.6, rx * 0.72, ry * 0.42, 0, PI + 0.2, TAU - 0.2); lineC(D, D.ink * 0.6, sh || dk(c, 0.2)); }
  }
  /** 小斗篷 / 披肩 / 披巾 */
  function drawCape(D, cp, kind) {
    const g = D.g, P = D.P;
    const uB = 1 - (cp.len || 0.36);
    const pts = [];
    const sway = D.clothX * 0.2;
    ringAt(D, 1, RA);
    const topY = RA[1];
    g.beginPath();
    const n = 9, xs = SX[1], ys = SY[1];
    let k = 0;
    for (let i = 0; i <= n; i++) {
      const f = i / n, ph = -PI + f * TAU;
      surf(D, uB - (kind === 'shawl' ? 0.12 * cos(ph) : 0.04), ph, kind === 'shawl' ? 3.0 : D.B.armW[0] + 1.4, Q2);
      if (Q2[2] < -0.5 && !P.back) continue;
      xs[k] = Q2[0] + sway * f; ys[k] = Q2[1] + (P.back ? 0 : max(0, Q2[2]) * 0.2); k++;
    }
    // 取可见的左右端，用肩部轮廓合拢
    let minI = 0, maxI = 0;
    for (let i = 1; i < k; i++) { if (xs[i] < xs[minI]) minI = i; if (xs[i] > xs[maxI]) maxI = i; }
    const xl = xs[minI], yl = ys[minI], xr = xs[maxI], yr = ys[maxI];
    const e = RA[4] + (kind === 'shawl' ? 2.8 : D.B.armW[0] + 1.2);
    g.moveTo(xl, yl);
    g.quadraticCurveTo(RA[0] - D.nx * (e + 0.8), topY + 2, RA[0] - D.nx * (D.B.R * 0.26), topY - 1.2);
    g.lineTo(RA[0] + D.nx * (D.B.R * 0.26), topY - 1.2);
    g.quadraticCurveTo(RA[0] + D.nx * (e + 0.8), topY + 2, xr, yr);
    // 下摆：从右到左，按投影后的 x 排序后的前半圈
    const hemPts = [];
    for (let i = 0; i < k; i++) hemPts.push([xs[i], ys[i]]);
    hemPts.sort((a, b) => b[0] - a[0]);
    for (const [x, y] of hemPts) g.lineTo(x, y + 0.6);
    g.closePath();
    fillAtHip(D, clothGrad(D, cp.c));
    inkC(D, D.ink, inkOf(cp.c));
    if (D.sil || D.lod === 0) return;
    if (cp.trim) { g.beginPath(); for (let i = 0; i < hemPts.length; i++) { const [x, y] = hemPts[i]; if (i) g.lineTo(x, y - 0.4); else g.moveTo(x, y - 0.4); } lineC(D, 0.7, cp.trim); }
    if (cp.fringe && D.lod >= 1) { g.beginPath(); for (const [x, y] of hemPts) { g.moveTo(x, y + 0.6); g.lineTo(x + 0.2, y + 2); } lineC(D, 0.35, cp.fringe); }
    // 前襟敞开：把斗篷中间那一条重新画成里面的衣服（背心裙、衬衫、领结都露出来）
    if (!P.back) {
      const op = kind === 'shawl' ? 0.62 : cp.open != null ? cp.open : 0.4;
      const strip = new Path2D();
      const pts2 = [[1.08, -op * 0.8], [uB - 0.02, -op * 1.15], [uB - 0.06, 0], [uB - 0.02, op * 1.15], [1.08, op * 0.8]];
      let vis = 0;
      for (let i = 0; i < pts2.length; i++) { surf(D, pts2[i][0], pts2[i][1], 2.0, Q2); if (Q2[2] > 0) vis++; if (i) strip.lineTo(Q2[0], Q2[1]); else strip.moveTo(Q2[0], Q2[1]); }
      strip.closePath();
      if (vis >= 2) {
        g.save(); g.clip(strip);
        g.beginPath(); torsoPath(D, g, 0, 1, 0, 1.6); fillAtHip(D, clothGrad(D, D.O.top));
        const O = D.O;
        if (O.bib) { g.beginPath(); if (surfPoly(D, g, [[1.02, -0.66], [0.8, -0.56], [0.72, -0.3], [0.7, 0], [0.72, 0.3], [0.8, 0.56], [1.02, 0.66]], 0.05)) { fillC(D, O.bib.c); inkC(D, D.ink * 0.8, inkOf(O.bib.c)); } }
        if (O.vest) { g.beginPath(); if (surfPoly(D, g, [[1.02, -0.5], [0.56, 0], [1.02, 0.5]], 0.08)) { fillC(D, O.shirt || '#f6f4ef'); inkC(D, D.ink * 0.8, inkOf(O.vest.c)); } }
        g.restore();
        // 敞口的两条边
        g.beginPath(); for (const sg of [1, -1]) { surf(D, 1.08, sg * op * 0.8, 2.0, Q2); g.moveTo(Q2[0], Q2[1]); surf(D, uB - 0.02, sg * op * 1.15, 2.0, Q2); g.lineTo(Q2[0], Q2[1]); }
        lineC(D, D.ink, inkOf(cp.c));
      }
      drawCollar(D);
      if (cp.clasp && !D.O.neck) { surf(D, 0.97, 0, 2.6, Q2); if (Q2[2] > 0.5) { g.beginPath(); g.arc(Q2[0], Q2[1], 0.8, 0, TAU); fillC(D, cp.clasp); inkC(D, D.ink * 0.6, inkOf(cp.clasp)); } }
    }
    void pts;
  }
  /** 耳机（术师）：挂在脖子上的一对毛绒耳罩 + 胸前的白色助听装置 */
  /**
   * 术师的颈部装备（照精英零立绘）：一圈灰色的毛绒领、挂在下巴下面的白色呼吸面罩（红色点缀），
   * 远侧颈边一个黑色的助听装置
   */
  function drawHeadphones(D) {
    const g = D.g, P = D.P, ink = D.ink;
    // 毛绒领：沿脖子根部一圈蓬松的小团
    const puffs = [];
    for (let k = 0; k < 14; k++) {
      const ph = -PI + (k / 14) * TAU + 0.11;
      surf(D, 1.02 + 0.04 * sin(k * 2.3), ph, 2.2, Q2);
      puffs.push([Q2[0], Q2[1] - 0.4, Q2[2], 2.5 + 0.5 * hash(3, k)]);
    }
    const back = puffs.filter((p) => p[2] < 0), front = puffs.filter((p) => p[2] >= 0);
    const ring = (arr) => {
      if (!arr.length) return;
      g.beginPath(); for (const [x, y, , r] of arr) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
      g.lineWidth = ink * 1.8; g.strokeStyle = D.sil || '#55505e'; g.stroke();
      g.fillStyle = D.sil || '#9a96a4'; g.fill();
      if (!D.sil && D.lod >= 1) {
        g.beginPath(); for (const [x, y, , r] of arr) { g.moveTo(x - r * 0.1 + r * 0.45, y - r * 0.3); g.arc(x - r * 0.1, y - r * 0.3, r * 0.45, 0, TAU); } g.fillStyle = '#b8b4c2'; g.fill();
        g.beginPath(); for (const [x, y, , r] of arr) { g.moveTo(x - r * 0.6, y + r * 0.2); g.quadraticCurveTo(x - r * 0.2, y + r * 0.5, x + r * 0.3, y + r * 0.35); } g.lineWidth = ink * 0.5; g.strokeStyle = '#6e6a78'; g.stroke();
      }
    };
    ring(back);
    // 远侧的黑色装置
    surf(D, 1.12, -1.05, 2.4, Q2);
    if (Q2[2] > -3 || P.back) {
      g.beginPath(); roundRectP(g, Q2[0] - 1.4, Q2[1] - 2.3, 2.8, 4.4, 0.6);
      g.fillStyle = D.sil || '#26232c'; g.fill(); g.lineWidth = ink * 0.8; g.strokeStyle = D.sil || '#0c0a10'; g.stroke();
      if (!D.sil && D.lod >= 1) { g.fillStyle = '#4a4656'; g.fillRect(Q2[0] - 0.8, Q2[1] - 1.6, 1.6, 0.5); g.fillRect(Q2[0] - 0.8, Q2[1] - 0.7, 1.6, 0.5); }
    }
    ring(front);
    // 呼吸面罩（挂在下巴下）
    if (!P.back) {
      surf(D, 1.1, 0.06, 2.6, Q2);
      if (Q2[2] > 1) {
        const x = Q2[0], y = Q2[1] - 0.6, w = 2.4 * (0.55 + 0.45 * abs(P.cy)) + 0.6;
        g.beginPath();
        g.moveTo(x - w, y - 1.2); g.quadraticCurveTo(x, y - 2.4, x + w, y - 1.2);
        g.quadraticCurveTo(x + w * 0.95, y + 1.6, x, y + 2.6); g.quadraticCurveTo(x - w * 0.95, y + 1.6, x - w, y - 1.2); g.closePath();
        g.fillStyle = D.sil || '#f4f2f6'; g.fill(); g.lineWidth = ink * 0.8; g.strokeStyle = D.sil || '#6a6878'; g.stroke();
        if (!D.sil && D.lod >= 1) {
          g.beginPath(); g.moveTo(x, y - 1.8); g.lineTo(x, y + 2.4); g.lineWidth = 0.55; g.strokeStyle = '#d63a36'; g.stroke();
          g.fillStyle = '#b8b6c4'; g.beginPath(); g.arc(x - w * 0.5, y + 0.4, 0.55, 0, TAU); g.arc(x + w * 0.5, y + 0.4, 0.55, 0, TAU); g.fill();
        }
      }
    }
  }
  /** 挂在近侧腰间的一副护目镜（术师） */
  function drawGoggles(D) {
    const g = D.g, P = D.P, ink = D.ink;
    surf(D, 0.1, 1.35, 1.8, Q2);
    if (Q2[2] < -1.5 && !P.back) return;
    const x = Q2[0], y = Q2[1] + 2.4, sw = sin(P.t * 2) * 0.4 + (P.mv ? 0.8 * sin(2 * P.ph) : 0);
    g.save(); g.translate(x, y); g.rotate(1.35 + sw * 0.08);
    g.beginPath(); g.moveTo(-3.8, 0); g.lineTo(3.8, 0); g.lineWidth = 1.1 + ink * 2; g.strokeStyle = D.sil || '#1a1418'; g.stroke(); g.lineWidth = 1.1; g.strokeStyle = D.sil || '#4a3a34'; g.stroke();
    for (const s of [-1.9, 1.9]) {
      g.beginPath(); g.arc(s, 0, 1.75, 0, TAU); g.fillStyle = D.sil || '#5a5660'; g.fill(); g.lineWidth = ink * 0.8; g.strokeStyle = D.sil || '#1a1418'; g.stroke();
      if (!D.sil) { g.beginPath(); g.arc(s, 0, 1.1, 0, TAU); g.fillStyle = '#c23b3b'; g.fill(); g.beginPath(); g.arc(s - 0.35, -0.35, 0.35, 0, TAU); g.fillStyle = '#ffd0d0'; g.fill(); }
    }
    g.restore();
  }
  /** 从胸前垂下的一条带子（红色系带 / 缎带），随风飘 */
  function drawCord(D, x0, y0, len, w, color, k) {
    const g = D.g, N = 7, xs = SX[1], ys = SY[1];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      xs[i] = x0 + D.clothX * 0.9 * u * u * 1.4 + 0.8 * sin(D.P.t * 2.2 + k + u * 3) * u + (D.P.mv ? 0.6 * sin(2 * D.P.ph - u * 2 + k) * u : 0);
      ys[i] = y0 + len * u * (1 - abs(D.clothX) * 0.01 * u);
    }
    g.beginPath(); smooth(g, xs, ys, N, false);
    g.lineCap = 'round';
    g.lineWidth = w + D.ink * 1.6; g.strokeStyle = D.sil || inkOf(color); g.stroke();
    g.lineWidth = w; g.strokeStyle = D.sil || color; g.stroke();
  }

  /* ---- 手臂 ---- */
  function drawArm(D, i, part) {
    const g = D.g, P = D.P, B = D.B, O = D.O, J = D.j, C = D.C;
    const sh = J.sh[i], el = J.el[i], wr = J.wr[i], A = P.A[i];
    const k = D.sleeveK;
    const wU = B.armW[0] * k, wF = B.armW[1] * k * (O.coat || O.jacket ? 1.12 : 1);
    const cU = O.sleeve ? O.sleeve[0] : O.top, cF = O.sleeve ? O.sleeve[1] : O.top;
    const ink = D.ink;
    g.lineCap = 'round'; g.lineJoin = 'round';
    const doU = part === 'all' || part === 'upper' || part === 'nohand', doF = part === 'all' || part === 'fore' || part === 'nohand' || part === 'fore-nohand', doH = part === 'all' || part === 'fore' || part === 'hand';
    if (part === 'hand') { drawHand(D, wr, el, A.hand, C.skin); return; }
    // 墨线（先画两段的粗线，再画颜色，关节处就没有接缝）
    if (doU) { g.beginPath(); g.moveTo(sh[0], sh[1]); g.lineTo(el[0], el[1]); g.lineWidth = wU + ink * 2; g.strokeStyle = D.sil || inkOf(cU); g.stroke(); }
    if (doF) { g.beginPath(); g.moveTo(el[0], el[1]); g.lineTo(wr[0], wr[1]); g.lineWidth = wF + ink * 2; g.strokeStyle = D.sil || inkOf(cF); g.stroke(); }
    if (doU) {
      g.beginPath(); g.moveTo(sh[0], sh[1]); g.lineTo(el[0], el[1]); g.lineWidth = wU; g.strokeStyle = D.sil || cU; g.stroke();
      if (O.puff) { g.beginPath(); g.ellipse(lerp(sh[0], el[0], 0.35), lerp(sh[1], el[1], 0.35), wU * 0.95, wU * 0.85, atan2(el[1] - sh[1], el[0] - sh[0]), 0, TAU); fillC(D, O.sleeve[0]); inkC(D, ink, inkOf(O.sleeve[0])); }
    }
    if (doF) {
      g.beginPath(); g.moveTo(el[0], el[1]); g.lineTo(wr[0], wr[1]); g.lineWidth = wF; g.strokeStyle = D.sil || cF; g.stroke();
      if (!D.sil) {
        const dx = wr[0] - el[0], dy = wr[1] - el[1];
        const band = (f0, f1, c, w) => { g.beginPath(); g.moveTo(el[0] + dx * f0, el[1] + dy * f0); g.lineTo(el[0] + dx * f1, el[1] + dy * f1); g.lineCap = 'butt'; g.lineWidth = w; g.strokeStyle = c; g.stroke(); g.lineCap = 'round'; };
        const co = O.coat || O.jacket;
        if (co && co.stripes && D.lod >= 1) { band(0.5, 0.58, co.stripes, wF); band(0.66, 0.74, co.stripes, wF); }
        if (O.cuff) band(0.84, 1.0, O.cuff, wF * 1.02);
        if (co && D.lod >= 1) {
          // 喇叭袖口
          const l = hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
          g.beginPath(); g.moveTo(wr[0] + nx * wF * 0.5, wr[1] + ny * wF * 0.5); g.lineTo(wr[0] + nx * wF * 0.72 + dx / l * 0.6, wr[1] + ny * wF * 0.72 + dy / l * 0.6);
          g.lineTo(wr[0] - nx * wF * 0.72 + dx / l * 0.6, wr[1] - ny * wF * 0.72 + dy / l * 0.6); g.lineTo(wr[0] - nx * wF * 0.5, wr[1] - ny * wF * 0.5); g.closePath();
          g.fillStyle = co.c; g.fill(); g.lineWidth = ink * 0.8; g.strokeStyle = inkOf(co.c); g.stroke();
        }
      }
      if (doH) drawHand(D, wr, el, A.hand, C.skin);
    }
  }
  function drawHand(D, wr, el, type, sk) {
    if (type === 'hide') return;
    const g = D.g, B = D.B;
    let dx = wr[0] - el[0], dy = wr[1] - el[1];
    const l = hypot(dx, dy) || 1; dx /= l; dy /= l;
    const r = B.hand;
    const cx = wr[0] + dx * r * 0.55, cy = wr[1] + dy * r * 0.55;
    const ang = atan2(dy, dx);
    // 拇指朝向“前方”（角色坐标 +x）那一侧
    const ts = (-dy >= 0 ? 1 : -1) * (dx >= 0 ? 1 : -1) >= 0 ? 1 : -1;
    const nx = -dy * ts, ny = dx * ts;
    g.beginPath();
    if (type === 'fist' || type === 'grip') {
      g.arc(cx, cy, r * 0.84, 0, TAU);
      const tx = cx + nx * r * 0.62 + dx * r * 0.1, ty = cy + ny * r * 0.62 + dy * r * 0.1;
      g.moveTo(tx + r * 0.3, ty); g.arc(tx, ty, r * 0.3, 0, TAU);
    } else {
      g.ellipse(cx + dx * r * 0.18, cy + dy * r * 0.18, r * 1.05, r * 0.8, ang, 0, TAU);
      const tx = cx + nx * r * 0.72 - dx * r * 0.05, ty = cy + ny * r * 0.72 - dy * r * 0.05;
      g.moveTo(tx + r * 0.34, ty); g.ellipse(tx, ty, r * 0.4, r * 0.28, ang + ts * 0.9, 0, TAU);
    }
    if (type === 'point') { g.moveTo(cx + dx * r * 0.3 + nx * 0.2, cy + dy * r * 0.3 + ny * 0.2); g.ellipse(cx + dx * r * 1.25, cy + dy * r * 1.25, r * 0.85, r * 0.3, ang, 0, TAU); }
    // 先描粗一圈墨线再填色：两个形状叠在一起时里面不会留线
    g.lineWidth = D.ink * 1.8; g.strokeStyle = D.sil || sk.ink; g.stroke();
    g.fillStyle = D.sil || sk.c; g.fill();
    if (!D.sil && D.lod >= 2 && (type === 'open' || type === 'flat')) {
      g.beginPath();
      for (let k = -1; k <= 1; k++) { const fx = cx + dx * r * 0.95 + nx * r * 0.25 * k * -1, fy = cy + dy * r * 0.95 + ny * r * 0.25 * k * -1; g.moveTo(fx, fy); g.lineTo(fx + dx * r * 0.28, fy + dy * r * 0.28); }
      g.lineWidth = D.ink * 0.5; g.strokeStyle = rgba(sk.ink, 0.5); g.stroke();
    }
  }

  /* ---- 腿与鞋 ---- */
  function drawLeg(D, i) {
    const g = D.g, O = D.O, B = D.B, J = D.j, P = D.P;
    const hj = J.hj[i], kn = J.kn[i], an = J.an[i];
    const pants = O.pants;
    const wT = pants ? pants.w[0] : B.legW[0], wS = pants ? pants.w[1] : B.legW[1];
    const lc = O.legs ? O.legs.c : null;
    const cT0 = pants ? pants.c : lc ? lc[0] : D.C.skin.c, cT1 = pants ? pants.c : lc ? lc[1] : cT0, cS = pants ? pants.c : lc ? lc[2] : cT1;
    const ink = D.ink;
    g.lineCap = 'round'; g.lineJoin = 'round';
    // 墨线
    g.beginPath(); g.moveTo(hj[0], hj[1]); g.lineTo(kn[0], kn[1]); g.lineWidth = wT + ink * 2; g.strokeStyle = D.sil || inkOf(cT1); g.stroke();
    g.beginPath(); g.moveTo(kn[0], kn[1]); g.lineTo(an[0], an[1]); g.lineWidth = wS + ink * 2; g.strokeStyle = D.sil || inkOf(cS); g.stroke();
    // 颜色
    const st = O.legs && O.legs.stock != null ? O.legs.stock : 0;
    if (st > 0 && !D.sil) {
      const mx = lerp(hj[0], kn[0], st), my = lerp(hj[1], kn[1], st);
      g.beginPath(); g.moveTo(hj[0], hj[1]); g.lineTo(mx, my); g.lineWidth = wT; g.strokeStyle = cT0; g.stroke();
      g.beginPath(); g.moveTo(mx, my); g.lineTo(kn[0], kn[1]); g.lineWidth = wT; g.strokeStyle = cT1; g.stroke();
      g.beginPath(); g.moveTo(mx, my); g.lineTo(lerp(mx, kn[0], 0.08), lerp(my, kn[1], 0.08)); g.lineCap = 'butt'; g.lineWidth = wT * 1.04; g.strokeStyle = dk(cT1, 0.25); g.stroke(); g.lineCap = 'round';
    } else { g.beginPath(); g.moveTo(hj[0], hj[1]); g.lineTo(kn[0], kn[1]); g.lineWidth = wT; g.strokeStyle = D.sil || cT0; g.stroke(); }
    g.beginPath(); g.moveTo(kn[0], kn[1]); g.lineTo(an[0], an[1]); g.lineWidth = wS; g.strokeStyle = D.sil || cS; g.stroke();
    if (!D.sil && O.legs) {
      const lg = O.legs;
      if (lg.sock) { const sy0 = lerp(kn[0], an[0], lg.sock), sy1 = lerp(kn[1], an[1], lg.sock); g.beginPath(); g.moveTo(sy0, sy1); g.lineTo(an[0], an[1]); g.lineWidth = wS * 1.04; g.strokeStyle = '#fbfaf6'; g.stroke(); g.beginPath(); g.moveTo(sy0, sy1); g.lineTo(lerp(sy0, an[0], 0.12), lerp(sy1, an[1], 0.12)); g.lineCap = 'butt'; g.lineWidth = wS * 1.1; g.strokeStyle = '#e4e0d8'; g.stroke(); g.lineCap = 'round'; }
      if (lg.straps && D.lod >= 1) {
        g.beginPath();
        for (let k = 1; k <= 3; k++) { const f = k / 4, x = lerp(kn[0], an[0], f), y = lerp(kn[1], an[1], f); g.moveTo(x - wS * 0.5, y - 0.6); g.lineTo(x + wS * 0.5, y + 0.6); g.moveTo(x + wS * 0.5, y - 0.6); g.lineTo(x - wS * 0.5, y + 0.6); }
        g.lineWidth = 0.35; g.strokeStyle = lg.straps; g.stroke();
      }
      if (lg.bows && D.lod >= 1) { const x = lerp(kn[0], an[0], 0.5), y = lerp(kn[1], an[1], 0.5); g.save(); g.translate(x, y); g.scale(0.7, 0.7); bowShape(g, D, lg.bows, ink / 0.7); g.restore(); }
      if (lg.band) { g.beginPath(); g.moveTo(lerp(kn[0], an[0], 0.82), lerp(kn[1], an[1], 0.82)); g.lineTo(lerp(kn[0], an[0], 0.94), lerp(kn[1], an[1], 0.94)); g.lineCap = 'butt'; g.lineWidth = wS * 1.08; g.strokeStyle = lg.band; g.stroke(); g.lineCap = 'round'; }
      if (lg.ribbons) { g.beginPath(); g.ellipse(an[0], an[1] - 0.6, wS * 0.6, 0.7, 0, 0, TAU); g.fillStyle = lg.ribbons; g.fill(); }
    }
    if (pants && pants.cuff && !D.sil) { g.beginPath(); g.moveTo(lerp(kn[0], an[0], 0.86), lerp(kn[1], an[1], 0.86)); g.lineTo(an[0], an[1]); g.lineCap = 'butt'; g.lineWidth = wS * 1.05; g.strokeStyle = pants.cuff; g.stroke(); g.lineCap = 'round'; }
    drawShoe(D, i, wS);
  }
  function drawShoe(D, i, wS) {
    const g = D.g, O = D.O, B = D.B, P = D.P, L = P.L[i], J = D.j;
    const sh = O.shoes || { c: '#4a3a30', sole: '#221812', type: 'shoe' };
    const an = J.an[i];
    // 脚的方向（3D → 2D）
    const fp = L.fp;
    const fv = -sin(fp), ff = cos(fp);
    const len = B.foot * (sh.type === 'slipper' ? 1.1 : 1);
    const tx = ff * P.sy * len * 0.78, ty = fv * len * 0.78;
    const hxo = -ff * P.sy * len * 0.22, hyo = -fv * len * 0.22;
    let x0 = an[0] + hxo, y0 = an[1] + hyo + B.ank * 0.55, x1 = an[0] + tx, y1 = an[1] + ty + B.ank * 0.55;
    const wLat = (wS + 1.2) * abs(P.cy);
    const d = hypot(x1 - x0, y1 - y0);
    if (d < wLat) { const cx = (x0 + x1) / 2, e = wLat / 2; const dir = x1 >= x0 ? 1 : -1; x0 = cx - e * dir; x1 = cx + e * dir; y0 = y1 = (y0 + y1) / 2; }
    const hh = B.ank * (sh.type === 'chunky' ? 0.95 : sh.type === 'slipper' ? 0.85 : 0.7);
    const ink = D.ink;
    // 靴筒
    if (sh.type === 'boot' && !(O.pants && !O.pants.tuck)) {
      const kn = J.kn[i];
      g.beginPath(); g.moveTo(lerp(an[0], kn[0], 0.42), lerp(an[1], kn[1], 0.42)); g.lineTo(an[0], an[1] + B.ank * 0.2);
      g.lineCap = 'round'; g.lineWidth = wS + 1.1 + ink * 2; g.strokeStyle = D.sil || inkOf(sh.c); g.stroke();
      g.lineWidth = wS + 1.1; g.strokeStyle = D.sil || sh.c; g.stroke();
      if (!D.sil && sh.lace && D.lod >= 1) { g.beginPath(); for (let k = 1; k <= 3; k++) { const f = k / 4 * 0.42; const x = lerp(an[0], kn[0], f), y = lerp(an[1], kn[1], f); g.moveTo(x - 0.8, y - 0.4); g.lineTo(x + 0.8, y + 0.4); g.moveTo(x + 0.8, y - 0.4); g.lineTo(x - 0.8, y + 0.4); } g.lineWidth = 0.4; g.strokeStyle = sh.lace; g.stroke(); }
    }
    const capsule = (xa, ya, xb, yb, r) => {
      const dx = xb - xa, dy = yb - ya, l = hypot(dx, dy) || 1e-6, nx = -dy / l, ny = dx / l, a = atan2(dy, dx);
      g.moveTo(xa + nx * r, ya + ny * r);
      g.lineTo(xb + nx * r, yb + ny * r);
      g.arc(xb, yb, r, a + HP, a - HP, true);
      g.lineTo(xa - nx * r, ya - ny * r);
      g.arc(xa, ya, r, a - HP, a + HP, true);
      g.closePath();
    };
    if (sh.type === 'sandal') {
      g.beginPath(); capsule(x0, y0, x1, y1, hh * 0.8); fillC(D, D.C.skin.c); inkC(D, ink * 0.8, D.C.skin.ink);
      g.beginPath(); capsule(x0, y0 + hh * 0.7, x1, y1 + hh * 0.7, hh * 0.32); fillC(D, sh.c); inkC(D, ink * 0.6, inkOf(sh.c));
      if (!D.sil) { g.beginPath(); g.moveTo(lerp(x0, x1, 0.55), y0 - hh * 0.8); g.lineTo(lerp(x0, x1, 0.62), y0 + hh * 0.6); g.moveTo(lerp(x0, x1, 0.25), y0 - hh * 0.7); g.lineTo(lerp(x0, x1, 0.2), y0 + hh * 0.6); g.lineWidth = 0.6; g.strokeStyle = sh.c; g.stroke(); }
      return;
    }
    g.beginPath(); capsule(x0, y0 + hh * 0.18, x1, y1 + hh * 0.18, hh);
    fillC(D, sh.sole); inkC(D, ink * 0.9, inkOf(sh.sole));
    g.beginPath(); capsule(x0, y0 - (sh.type === 'chunky' ? hh * 0.35 : 0.05), x1, y1 - (sh.type === 'chunky' ? hh * 0.35 : 0.05), hh * 0.86);
    fillC(D, sh.c);
    if (D.sil) return;
    if (D.lod >= 1) {
      g.globalAlpha = D.ga * 0.35; g.beginPath(); g.ellipse(lerp(x0, x1, 0.62), lerp(y0, y1, 0.62) - hh * 0.45, abs(x1 - x0) * 0.22 + 0.3, hh * 0.25, 0, 0, TAU); g.fillStyle = '#ffffff'; g.fill(); g.globalAlpha = D.ga;
      if (sh.type === 'mary') { g.beginPath(); g.moveTo(lerp(x0, x1, 0.4), y0 - hh * 0.8); g.lineTo(lerp(x0, x1, 0.4), y0 + hh * 0.5); g.lineWidth = 0.5; g.strokeStyle = dk(sh.c, 0.4); g.stroke(); }
      if ((sh.type === 'chunky' || sh.type === 'shoe') && sh.lace) { g.beginPath(); const mx = lerp(x0, x1, 0.45), my = lerp(y0, y1, 0.45) - hh * 0.7; g.moveTo(mx - 0.7, my - 0.3); g.lineTo(mx + 0.7, my + 0.3); g.moveTo(mx + 0.7, my - 0.3); g.lineTo(mx - 0.7, my + 0.3); g.lineWidth = 0.45; g.strokeStyle = sh.lace; g.stroke(); }
      if (sh.type === 'slipper') { g.beginPath(); g.arc(lerp(x0, x1, 0.72), lerp(y0, y1, 0.72) - hh * 0.55, hh * 0.45, 0, TAU); g.fillStyle = lt(sh.c, 0.4); g.fill(); }
    }
    g.lineWidth = ink * 0.8; g.strokeStyle = inkOf(sh.c); g.stroke();
  }
  /** 裤子的裆部（两腿之间） */
  function drawPelvis(D) {
    const g = D.g, O = D.O, J = D.j;
    if (!O.pants) return;
    ringAt(D, 0.0, RA);
    const a = J.hj[0], b = J.hj[1];
    g.beginPath();
    g.moveTo(RA[0] - D.nx * RA[4], RA[1] - D.ny * RA[4] - 0.5);
    g.lineTo(RA[0] + D.nx * RA[4], RA[1] + D.ny * RA[4] - 0.5);
    g.lineTo(max(a[0], b[0]) + 1, (a[1] + b[1]) / 2 + 2.2);
    g.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 5.5, min(a[0], b[0]) - 1, (a[1] + b[1]) / 2 + 2.2);
    g.closePath();
    fillC(D, O.pants.c);
  }

  /* ================================================================
   * 道具（角色空间；hand = 手心中心 [x, y]，dir = 前臂方向）
   * ================================================================ */
  const BACK_PROPS = { backpack: 1, cello: 1 };
  const HIP_PROPS = { satchel: 1, bag: 1 };
  const TWO_HAND = { hold: 1, read: 1, 'hold-up': 1, hug: 1, clasp: 1, record: 0, play: 1 };
  function propList(o) { const p = o.prop; if (!p) return null; return Array.isArray(p) ? p : [p]; }
  /** 服装自带的装备（玛格娜的野外装 = 背包 + 腰间的地质锤；卡提亚的野外装 = 挎包）；o.gear === false 可关掉 */
  function withGear(list, O, o) {
    if (!O.gear || o.gear === false) return list;
    const out = list ? list.slice() : [];
    for (const x of O.gear) if (!out.includes(x)) out.push(x);
    return out;
  }
  /** 腰间挂着的地质锤 */
  function drawBeltHammer(D) {
    const g = D.g, P = D.P, ink = D.ink;
    surf(D, 0.04, 1.25, 1.6, Q2);
    if (Q2[2] < -1.5 && !P.back) return;
    const x = Q2[0], y = Q2[1], sw = 0.12 * sin(P.t * 1.8) + (P.mv ? 0.2 * sin(2 * P.ph + 0.6) : 0) + D.clothX * 0.02;
    g.save(); g.translate(x, y); g.rotate(sw);
    g.beginPath(); g.moveTo(0, -0.5); g.lineTo(0, 9); g.lineCap = 'round'; g.lineWidth = 0.9 + ink * 2; g.strokeStyle = D.sil || '#3a2014'; g.stroke(); g.lineWidth = 0.9; g.strokeStyle = D.sil || '#a8784a'; g.stroke();
    g.beginPath(); g.moveTo(-3, 9.4); g.lineTo(0.8, 8.8); g.lineTo(2.6, 9.6); g.lineTo(0.8, 10.6); g.lineTo(-3, 10.2); g.closePath();
    g.fillStyle = D.sil || '#8e909c'; g.fill(); g.lineWidth = ink; g.strokeStyle = D.sil || '#3a3c46'; g.stroke();
    g.restore();
  }
  const LEAF_C = ['#e84a5a', '#5a8ee8', '#9a6ae0', '#f59ac0', '#7ad0e8', '#f07a4a'];
  function drawStaff(D, hx, hy, kind) {
    const g = D.g, P = D.P, t = P.t;
    const L = 96 * (D.B === BODIES.child ? 0.75 : 1);
    const ang = -HP + 0.13 + (P.mv ? 0.05 * sin(P.ph) : 0) + D.clothX * 0.004;
    const dx = cos(ang), dy = sin(ang);
    const bx = hx - dx * L * 0.4, by = hy - dy * L * 0.4, tx = hx + dx * L * 0.6, ty = hy + dy * L * 0.6;
    const nx = -dy, ny = dx;
    const white = kind === 'alter';
    const shaft = white ? '#efeef3' : kind === 'caster' ? '#2b2329' : '#8a6a44';
    const ink = white ? '#6a6878' : kind === 'caster' ? '#0c080c' : '#4a3420';
    g.lineCap = 'round'; g.lineJoin = 'round';
    // 杖身（微微扭曲）
    g.beginPath(); g.moveTo(bx, by);
    g.bezierCurveTo(bx + dx * L * 0.3 + nx * 0.8, by + dy * L * 0.3 + ny * 0.8, bx + dx * L * 0.7 - nx * 0.8, by + dy * L * 0.7 - ny * 0.8, tx, ty);
    g.lineWidth = 1.5 + D.ink * 2; g.strokeStyle = D.sil || ink; g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = D.sil || shaft; g.stroke();
    // 杖头的枝杈
    const br = (x0, y0, a, len, w, depth, k) => {
      const x1 = x0 + cos(a) * len, y1 = y0 + sin(a) * len;
      const mx = (x0 + x1) / 2 + cos(a + HP) * len * 0.12 * (k % 2 ? 1 : -1), my = (y0 + y1) / 2 + sin(a + HP) * len * 0.12 * (k % 2 ? 1 : -1);
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1);
      g.lineWidth = w + D.ink * 2; g.strokeStyle = D.sil || ink; g.stroke();
      g.lineWidth = w; g.strokeStyle = D.sil || shaft; g.stroke();
      if (depth > 0) {
        br(x1, y1, a - 0.45 - 0.1 * (k % 3), len * 0.62, w * 0.72, depth - 1, k * 2 + 1);
        br(x1, y1, a + 0.4 + 0.08 * (k % 2), len * 0.58, w * 0.7, depth - 1, k * 2 + 2);
      } else if (white && !D.sil && D.lod >= 1) {
        for (let q = 0; q < 3; q++) {
          const f = 0.35 + q * 0.3, lx = x0 + (x1 - x0) * f, ly = y0 + (y1 - y0) * f;
          const la = a + (q % 2 ? 1 : -1) * (0.9 + 0.1 * sin(t * 2 + k + q)), ll = 2.1;
          g.beginPath(); g.ellipse(lx + cos(la) * ll * 0.55, ly + sin(la) * ll * 0.55, ll * 0.6, ll * 0.24, la, 0, TAU);
          g.fillStyle = LEAF_C[(k * 3 + q) % LEAF_C.length]; g.fill(); g.lineWidth = 0.25; g.strokeStyle = '#ffffff'; g.stroke();
        }
      } else if (!white && !D.sil && D.lod >= 1) {
        // 黑色荆棘的尖刺 + 一点红光
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 + cos(a) * 1.8, y1 + sin(a) * 1.8); g.lineWidth = 0.5; g.strokeStyle = ink; g.stroke();
        g.beginPath(); g.arc(x0 + (x1 - x0) * 0.5, y0 + (y1 - y0) * 0.5, 0.35, 0, TAU); g.fillStyle = '#e8403a'; g.fill();
      }
    };
    if (white) {
      br(tx, ty, ang - 0.25, 7.5, 1.1, 2, 1);
      br(tx, ty, ang + 0.35, 6.5, 1.0, 1, 2);
      if (!D.sil) {
        // 小铃铛
        const bx2 = tx + cos(ang + 0.35) * 4 + nx * 0.5, by2 = ty + sin(ang + 0.35) * 4 + 2.6 + 0.4 * sin(t * 3);
        g.beginPath(); g.moveTo(bx2, by2 - 2); g.lineTo(bx2, by2); g.lineWidth = 0.25; g.strokeStyle = '#8a8898'; g.stroke();
        g.beginPath(); g.moveTo(bx2 - 0.9, by2 + 1.3); g.quadraticCurveTo(bx2 - 0.9, by2 - 0.4, bx2, by2 - 0.3); g.quadraticCurveTo(bx2 + 0.9, by2 - 0.4, bx2 + 0.9, by2 + 1.3); g.closePath();
        g.fillStyle = '#d8d8e2'; g.fill(); g.lineWidth = 0.3; g.strokeStyle = '#6a6878'; g.stroke();
      }
      if (!D.sil && D.o.glow) E.glow(g, tx, ty - 3, 14 * D.o.glow, '255,236,250', 0.4 * D.o.glow);
    } else if (kind === 'caster') {
      br(tx, ty, ang, 5.5, 1.3, 1, 3);
      br(tx - dx * 5, ty - dy * 5, ang - 0.7, 5, 1.0, 0, 4);
      br(tx - dx * 4, ty - dy * 4, ang + 0.75, 4.6, 1.0, 0, 5);
      if (!D.sil && D.o.glow) E.glow(g, tx + dx * 4, ty + dy * 4, 16 * D.o.glow, '255,120,70', 0.5 * D.o.glow);
    }
    return [tx + dx * 6, ty + dy * 6];
  }
  function roundRectP(g, x, y, w, h, r) { if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  /** 手里的道具。返回道具的“光点 / 尖端”位置（给 anchors 用） */
  /** Q 版道具要比真实比例大一些才看得清（手也很大） */
  const PROP_K = { cassette: 1.8, recorder: 1.55, popsicle: 1.8, letter: 1.7, stone: 1.75, wreath: 1.45, wreaths: 1.35, book: 1.65, notebook: 1.6, lantern: 1.3, flower: 1.8, trowel: 1.6, soda: 1.75, hammer: 1.45, basket: 1.6, tie: 1.5, mug: 1.8, box: 1.25, camera: 1.7, map: 1.45 };
  function drawHandProp(D, name, hx, hy, dx, dy, two) {
    const k = PROP_K[name] || 1, P = D.P;
    if (k === 1 || ((name === 'notebook' || name === 'book') && P.armsM === 'write')) return propInner(D, name, hx, hy, dx, dy, two, D.ink);
    const g = D.g;
    g.save(); g.translate(hx, hy); g.scale(k, k); g.translate(-hx, -hy);
    const r = propInner(D, name, hx, hy, dx, dy, two, D.ink / k);
    g.restore();
    return [hx + (r[0] - hx) * k, hy + (r[1] - hy) * k];
  }
  function propInner(D, name, hx, hy, dx, dy, two, ink) {
    const g = D.g, P = D.P, t = P.t, sil = D.sil;
    const F = (c) => sil || c;
    const I = (c) => sil || inkOf(c);
    g.lineJoin = 'round'; g.lineCap = 'round';
    switch (name) {
      case 'staff': return drawStaff(D, hx, hy, D.O.staff || (D.who === 'adele-alter' ? 'alter' : D.who === 'adele-caster' ? 'caster' : 'wood'));
      case 'cassette': {
        g.save(); g.translate(hx, hy - 0.4); g.rotate(two ? 0 : 0.2);
        g.beginPath(); roundRectP(g, -2.5, -1.6, 5, 3.2, 0.4); g.fillStyle = F('#3a3a44'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#141418'); g.stroke();
        if (!sil) { g.fillStyle = '#f6f0e2'; g.fillRect(-2.1, -1.3, 4.2, 1.5); g.fillStyle = '#d63a36'; g.fillRect(-2.1, -0.95, 4.2, 0.22); g.fillStyle = '#26262e'; g.beginPath(); g.arc(-1.05, 0.75, 0.5, 0, TAU); g.arc(1.05, 0.75, 0.5, 0, TAU); g.fill(); }
        g.restore(); return [hx, hy];
      }
      case 'recorder': {
        g.save(); g.translate(hx + dx * 1.5, hy - 1.2); g.rotate(-0.08);
        g.beginPath(); roundRectP(g, -3.6, -2.6, 7.2, 5, 0.8); g.fillStyle = F('#b9bcc6'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#4a4c58'); g.stroke();
        g.beginPath(); g.moveTo(-2.2, -2.6); g.quadraticCurveTo(0, -4.6, 2.2, -2.6); g.lineWidth = 0.7 + ink; g.strokeStyle = F('#4a4c58'); g.stroke();
        if (!sil) {
          g.fillStyle = '#6a6c78'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(-2.2 + i * 0.8, -1.2 + j * 0.8, 0.22, 0, TAU); g.fill(); }
          g.fillStyle = '#2a2a32'; g.fillRect(0.2, -1.8, 2.6, 1.9);
          g.fillStyle = '#e8e2d0'; g.fillRect(0.45, -1.55, 2.1, 1.4);
          const rec = P.armsM === 'record' || D.o.rec;
          g.beginPath(); g.arc(2.6, 1.5, 0.45, 0, TAU); g.fillStyle = rec && (t % 1.2) < 0.8 ? '#ff3a30' : '#7a2a2a'; g.fill();
          if (rec) E.glow(g, 2.6, 1.5, 3, '255,70,60', 0.5 * ((t % 1.2) < 0.8 ? 1 : 0.2));
        }
        // 麦克风
        g.beginPath(); g.moveTo(3.2, -1.6); g.lineTo(5.2, -3.4); g.lineWidth = 0.5 + ink; g.strokeStyle = F('#3a3a44'); g.stroke();
        g.beginPath(); g.ellipse(5.6, -3.8, 1.0, 1.2, -0.7, 0, TAU); g.fillStyle = F('#2e2e36'); g.fill();
        g.restore();
        return [hx + dx * 1.5 + 5.6, hy - 1.2 - 3.8];
      }
      case 'popsicle': {
        g.save(); g.translate(hx, hy); g.rotate(-0.25);
        g.beginPath(); g.moveTo(0, 1); g.lineTo(0, -3.2); g.lineWidth = 0.7 + ink; g.strokeStyle = F('#8a6a44'); g.stroke(); g.lineWidth = 0.7; g.strokeStyle = F('#e8c890'); g.stroke();
        g.beginPath(); g.moveTo(-1.3, -2.6); g.lineTo(-1.3, -6.4); g.quadraticCurveTo(-1.3, -7.6, 0, -7.6); g.lineTo(0.6, -7.6); g.arc(0.9, -7.2, 0.45, PI, 0); g.quadraticCurveTo(1.3, -7.4, 1.3, -6.4); g.lineTo(1.3, -2.6); g.closePath();
        g.fillStyle = F('#ff8fb0'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#b04a6a'); g.stroke();
        if (!sil) {
          g.fillStyle = '#ffc8d8'; g.fillRect(-0.9, -6.6, 0.6, 3.4);
          const f = fract(t * 0.45); g.globalAlpha = D.ga * (1 - f); g.beginPath(); g.ellipse(1.1, -2.4 + f * 3, 0.3, 0.45, 0, 0, TAU); g.fillStyle = '#ff9ab8'; g.fill(); g.globalAlpha = D.ga;
        }
        g.restore(); return [hx, hy - 6];
      }
      case 'letter': {
        g.save(); g.translate(hx, hy - 0.8); g.rotate(two ? 0.04 : -0.18);
        g.beginPath(); g.rect(-3, -2.1, 6, 4.2); g.fillStyle = F('#fbf1de'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#6a4a3a'); g.stroke();
        if (!sil) {
          g.beginPath(); g.moveTo(-3, -2.1); g.lineTo(0, 0.4); g.lineTo(3, -2.1); g.lineWidth = ink * 0.7; g.stroke();
          g.beginPath(); g.moveTo(0, -0.3); g.bezierCurveTo(0.9, 0.3, 0.9, 1.4, 0, 1.5); g.bezierCurveTo(-0.9, 1.4, -0.9, 0.3, 0, -0.3); g.fillStyle = '#c2342e'; g.fill();
        }
        g.restore(); return [hx, hy];
      }
      case 'stone': {
        const r = 1.55;
        g.beginPath();
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, rr = r * (0.82 + hash(5, k) * 0.3); const x = hx + cos(a) * rr * 1.15, y = hy - 0.6 + sin(a) * rr * 0.9; k ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.closePath(); g.fillStyle = F('#9a8a82'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#4a3e3a'); g.stroke();
        if (!sil) {
          g.fillStyle = '#6e625c'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(hx + (hash(9, k) - 0.5) * 2.2, hy - 0.6 + (hash(9, k, 2) - 0.5) * 1.6, 0.18 + hash(9, k, 3) * 0.15, 0, TAU); g.fill(); }
          if (D.o.glow) { E.glow(g, hx, hy - 0.6, 7 * D.o.glow, '255,150,90', 0.55 * D.o.glow); }
        }
        return [hx, hy - 0.6];
      }
      case 'wreath': case 'wreaths': {
        const n = name === 'wreaths' ? 2 : 1;
        for (let w = 0; w < n; w++) {
          const cx = hx + (n === 2 ? (w ? 2.6 : -2.6) : 0), cy = hy - 1 - (n === 2 ? w * 0.6 : 0), R = 3.1;
          g.beginPath(); g.ellipse(cx, cy, R, R * 0.9, 0, 0, TAU); g.lineWidth = 1.1 + ink * 2; g.strokeStyle = F('#3f6a3a'); g.stroke(); g.lineWidth = 1.1; g.strokeStyle = F('#6fa56a'); g.stroke();
          const cols = ['#ffffff', '#f7b8cb', '#ffe0a0', '#c9b3e8', '#ff9a6a'];
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * TAU + w, x = cx + cos(a) * R, y = cy + sin(a) * R * 0.9;
            g.beginPath(); g.arc(x, y, 0.75, 0, TAU); g.fillStyle = F(cols[(k + w) % cols.length]); g.fill();
            if (!sil) { g.lineWidth = 0.2; g.strokeStyle = '#b87090'; g.stroke(); g.beginPath(); g.arc(x, y, 0.25, 0, TAU); g.fillStyle = '#f0c040'; g.fill(); }
          }
        }
        return [hx, hy - 1];
      }
      case 'book': case 'notebook': {
        const open = P.armsM === 'read' || P.armsM === 'write';
        if (P.armsM === 'write') {
          // 桌上的本子（在手下面）+ 笔
          const y = -P.desk - 0.3;
          g.beginPath(); g.moveTo(-1, y); g.lineTo(9, y - 0.2); g.lineTo(12, y + 0.8); g.lineTo(2, y + 1.0); g.closePath();
          g.fillStyle = F('#fbf6ea'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#6a5a4a'); g.stroke();
          return [hx, hy];
        }
        g.save(); g.translate(hx, hy - (open ? 1.2 : 0.5));
        if (open) {
          g.rotate(-0.08 * D.P.cy);
          const w = 4.2 * (0.45 + 0.55 * abs(D.P.cy)) + 1.2;
          g.beginPath(); g.moveTo(0, 1.2); g.quadraticCurveTo(-w * 0.5, 0.2, -w, 0.9); g.lineTo(-w, -3.6); g.quadraticCurveTo(-w * 0.5, -4.3, 0, -3.2); g.quadraticCurveTo(w * 0.5, -4.3, w, -3.6); g.lineTo(w, 0.9); g.quadraticCurveTo(w * 0.5, 0.2, 0, 1.2); g.closePath();
          g.fillStyle = F('#fbf6ea'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#6a4a3a'); g.stroke();
          if (!sil) { g.beginPath(); g.moveTo(0, 1.2); g.lineTo(0, -3.2); g.lineWidth = ink * 0.6; g.stroke(); g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(-w * 0.85, -2.6 + k * 0.8); g.lineTo(-w * 0.2, -2.8 + k * 0.8); g.moveTo(w * 0.2, -2.8 + k * 0.8); g.lineTo(w * 0.85, -2.6 + k * 0.8); } g.lineWidth = 0.25; g.strokeStyle = '#b8a890'; g.stroke(); }
        } else {
          g.rotate(0.15);
          const c = name === 'notebook' ? '#5a8ab8' : '#a8423a';
          g.beginPath(); roundRectP(g, -2.3, -3.2, 4.6, 6.2, 0.4); g.fillStyle = F(c); g.fill(); g.lineWidth = ink; g.strokeStyle = I(c); g.stroke();
          if (!sil) { g.fillStyle = '#f0e2c0'; g.fillRect(-1.3, -2.2, 2.6, 1.0); g.fillStyle = '#fbf6ea'; g.fillRect(2.1, -3.0, 0.4, 5.8); }
        }
        g.restore(); return [hx, hy - 1.5];
      }
      case 'lantern': {
        // 手提的纸灯笼（提在前臂下方）
        const sw = 0.12 * sin(t * 2.2) + (P.mv ? 0.15 * sin(2 * P.ph) : 0);
        const lx = hx + sin(sw) * 5, ly = hy + cos(sw) * 5.5;
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(lx, ly - 3.2); g.lineWidth = 0.35; g.strokeStyle = F('#4a3a2a'); g.stroke();
        if (!sil) E.glow(g, lx, ly, 16 * (D.o.glow != null ? D.o.glow : 1), '255,190,110', 0.55 * (D.o.glow != null ? D.o.glow : 1));
        g.beginPath(); g.ellipse(lx, ly, 2.6, 3.2, 0, 0, TAU); g.fillStyle = F('#ffd89a'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#b86a3a'); g.stroke();
        if (!sil) {
          g.globalAlpha = D.ga * 0.6; g.beginPath(); g.ellipse(lx - 0.6, ly - 0.8, 1.2, 1.6, 0, 0, TAU); g.fillStyle = '#fff8e8'; g.fill(); g.globalAlpha = D.ga;
          g.beginPath(); g.ellipse(lx, ly, 1.3, 3.2, 0, 0, TAU); g.moveTo(lx - 2.6, ly); g.lineTo(lx + 2.6, ly); g.lineWidth = 0.25; g.strokeStyle = '#d88a4a'; g.stroke();
        }
        g.fillStyle = F('#5a3a2a'); g.fillRect(lx - 1.4, ly - 3.6, 2.8, 0.8); g.fillRect(lx - 1.2, ly + 2.9, 2.4, 0.7);
        return [lx, ly];
      }
      case 'flower': {
        const sx = hx, sy = hy - 0.5, tx2 = hx + 0.6, ty2 = hy - 6.5;
        g.beginPath(); g.moveTo(sx, sy + 1); g.quadraticCurveTo(sx - 0.8, (sy + ty2) / 2, tx2, ty2); g.lineWidth = 0.45 + ink; g.strokeStyle = F('#3f6a3a'); g.stroke(); g.lineWidth = 0.45; g.strokeStyle = F('#7aa85a'); g.stroke();
        g.beginPath(); g.ellipse(sx - 0.8, sy - 2.2, 1.2, 0.45, -0.6, 0, TAU); g.fillStyle = F('#7aa85a'); g.fill();
        for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.2 * sin(t * 1.5); g.beginPath(); g.ellipse(tx2 + cos(a) * 0.9, ty2 + sin(a) * 0.9, 0.9, 0.5, a, 0, TAU); g.fillStyle = F('#ff9a5a'); g.fill(); if (!sil) { g.lineWidth = 0.2; g.strokeStyle = '#c0582a'; g.stroke(); } }
        g.beginPath(); g.arc(tx2, ty2, 0.55, 0, TAU); g.fillStyle = F('#d63a36'); g.fill();
        return [tx2, ty2];
      }
      case 'trowel': {
        g.save(); g.translate(hx, hy); g.rotate(atan2(dy, dx) + 0.1);
        g.beginPath(); roundRectP(g, -1.8, -0.6, 3.2, 1.2, 0.5); g.fillStyle = F('#8a5a3a'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#4a2a18'); g.stroke();
        g.beginPath(); g.moveTo(1.3, -0.2); g.lineTo(2.2, -0.2); g.moveTo(2.2, -1.3); g.lineTo(6.4, 0); g.lineTo(2.2, 1.3); g.closePath(); g.fillStyle = F('#b8bcc8'); g.fill(); g.strokeStyle = F('#4a4c58'); g.stroke();
        g.restore(); return [hx + dx * 5, hy + dy * 5];
      }
      case 'soda': {
        g.save(); g.translate(hx, hy - 1.5); g.rotate(-0.1);
        g.beginPath(); g.moveTo(-1.3, 3); g.lineTo(-1.3, -1.2); g.quadraticCurveTo(-1.3, -2.2, -0.5, -2.9); g.lineTo(-0.5, -4.2); g.lineTo(0.5, -4.2); g.lineTo(0.5, -2.9); g.quadraticCurveTo(1.3, -2.2, 1.3, -1.2); g.lineTo(1.3, 3); g.closePath();
        g.fillStyle = sil || 'rgba(150,225,235,0.85)'; g.fill(); g.lineWidth = ink; g.strokeStyle = F('#3a7a88'); g.stroke();
        if (!sil) {
          g.fillStyle = '#ffffff'; g.fillRect(-1.3, 0, 2.6, 1.5); g.fillStyle = '#e84a8a'; g.fillRect(-1.3, 0.5, 2.6, 0.5);
          g.fillStyle = '#d63a36'; g.fillRect(-0.6, -4.7, 1.2, 0.6);
          g.fillStyle = 'rgba(255,255,255,0.8)'; for (let k = 0; k < 4; k++) { const f = fract(t * 0.7 + k * 0.25); g.beginPath(); g.arc(-0.5 + hash(3, k) * 1, 2.6 - f * 5, 0.2, 0, TAU); g.fill(); }
        }
        g.restore(); return [hx, hy - 5.5];
      }
      case 'hammer': {
        g.save(); g.translate(hx, hy); g.rotate(atan2(dy, dx) - HP + 0.35);
        g.beginPath(); g.moveTo(0, 2.5); g.lineTo(0, -8); g.lineWidth = 0.9 + ink * 2; g.strokeStyle = F('#4a2a18'); g.stroke(); g.lineWidth = 0.9; g.strokeStyle = F('#b07a4a'); g.stroke();
        g.beginPath(); g.moveTo(-3.2, -8.8); g.lineTo(0.8, -9.2); g.lineTo(2.6, -8.5); g.lineTo(0.8, -7.6); g.lineTo(-3.2, -8.0); g.closePath(); g.fillStyle = F('#8e909c'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#3a3c46'); g.stroke();
        g.restore(); return [hx, hy - 8];
      }
      case 'suitcase': {
        const cx = hx, cy = hy + 5.2;
        g.beginPath(); g.moveTo(cx - 1.4, hy + 0.2); g.lineTo(cx - 1.4, hy + 1.2); g.moveTo(cx + 1.4, hy + 0.2); g.lineTo(cx + 1.4, hy + 1.2); g.lineWidth = 0.6; g.strokeStyle = F('#3a2418'); g.stroke();
        g.beginPath(); roundRectP(g, cx - 6, cy - 4, 12, 8.4, 1.2); g.fillStyle = F('#9a6040'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#4a2a18'); g.stroke();
        if (!sil) { g.fillStyle = '#7a4a30'; g.fillRect(cx - 3.6, cy - 4, 1.2, 8.4); g.fillRect(cx + 2.4, cy - 4, 1.2, 8.4); g.fillStyle = '#e0c070'; g.fillRect(cx - 0.8, cy - 3.2, 1.6, 1); }
        return [cx, cy];
      }
      case 'umbrella': {
        // 伞面必须在头顶之上、比头宽（Q 版的头很大）
        const R = D.B.R, headTop = D.headY - R * 1.5;
        const topy = min(hy - 16, headTop), topx = hx + 0.5 + (D.headX - hx) * 0.25;
        const Wu = max(14, R * 1.75), Hu = Wu * 0.55;
        g.beginPath(); g.moveTo(hx, hy + 1.5); g.lineTo(topx, topy); g.lineWidth = 0.6 + ink; g.strokeStyle = F('#3a3a44'); g.stroke();
        const c = D.o.umbrellaColor || '#d64a4a';
        g.beginPath(); g.moveTo(topx - Wu, topy + Hu * 0.5); g.quadraticCurveTo(topx - Wu * 0.86, topy - Hu * 0.95, topx, topy - Hu); g.quadraticCurveTo(topx + Wu * 0.86, topy - Hu * 0.95, topx + Wu, topy + Hu * 0.5);
        for (let k = 3; k >= -3; k--) { const xk = topx + (k / 3.5) * Wu; g.quadraticCurveTo(xk + Wu / 7, topy + Hu * 0.26, xk - Wu / 7, topy + Hu * 0.5); }
        g.closePath(); g.fillStyle = F(c); g.fill(); g.lineWidth = ink; g.strokeStyle = I(c); g.stroke();
        if (!sil) { g.beginPath(); for (let k = -2; k <= 2; k++) { g.moveTo(topx, topy - Hu); g.quadraticCurveTo(topx + k * Wu * 0.25, topy - Hu * 0.6, topx + k * Wu * 0.4, topy + Hu * 0.45); } g.lineWidth = 0.3; g.strokeStyle = dk(c, 0.3); g.stroke(); g.beginPath(); g.arc(topx, topy - Hu - 0.8, 0.8, 0, TAU); g.fillStyle = '#3a3a44'; g.fill(); }
        return [topx, topy - Hu];
      }
      case 'basket': {
        const cx = hx + 0.5, cy = hy + 3.4;
        g.beginPath(); g.moveTo(cx - 3.2, cy - 1.2); g.quadraticCurveTo(cx, cy - 6.5, cx + 3.2, cy - 1.2); g.lineWidth = 0.6 + ink; g.strokeStyle = F('#6a4a2a'); g.stroke(); g.lineWidth = 0.6; g.strokeStyle = F('#c8965a'); g.stroke();
        g.beginPath(); g.moveTo(cx - 4, cy - 1.2); g.lineTo(cx + 4, cy - 1.2); g.lineTo(cx + 3.2, cy + 2.8); g.lineTo(cx - 3.2, cy + 2.8); g.closePath(); g.fillStyle = F('#d8a868'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#6a4a2a'); g.stroke();
        if (!sil) { g.beginPath(); for (let k = -3; k <= 3; k++) { g.moveTo(cx + k * 1.0, cy - 1.2); g.lineTo(cx + k * 0.85, cy + 2.8); } g.moveTo(cx - 3.8, cy + 0.6); g.lineTo(cx + 3.8, cy + 0.6); g.lineWidth = 0.25; g.strokeStyle = '#9a6a3a'; g.stroke(); g.fillStyle = '#e8403a'; g.beginPath(); g.moveTo(cx - 2.6, cy - 1.2); g.lineTo(cx - 0.8, cy - 2.6); g.lineTo(cx + 0.8, cy - 1.2); g.fill(); }
        return [cx, cy];
      }
      case 'tie': {
        const N = 6, xs = SX[3], ys = SY[3];
        for (let i = 0; i < N; i++) { const u = i / (N - 1); xs[i] = hx + (dx * 2 + 1.5 * sin(t * 7 - u * 3)) * u * 3; ys[i] = hy + (dy * 2 + 2.2) * u * 3.4 + 1.2 * cos(t * 7 - u * 3) * u; }
        g.beginPath(); smooth(g, xs, ys, N, false);
        g.lineWidth = 1.2 + ink * 2; g.strokeStyle = F('#6a1a16'); g.stroke(); g.lineWidth = 1.2; g.strokeStyle = F('#c4342e'); g.stroke();
        return [xs[N - 1], ys[N - 1]];
      }
      case 'mug': {
        g.beginPath(); roundRectP(g, hx - 1.8, hy - 3.4, 3.6, 3.8, 0.5); g.fillStyle = F('#f4f0ea'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#6a6068'); g.stroke();
        g.beginPath(); g.arc(hx + 2.1, hy - 1.6, 1.0, -HP, HP); g.lineWidth = 0.5; g.stroke();
        if (!sil) { g.globalAlpha = D.ga * 0.5; g.beginPath(); for (let k = 0; k < 2; k++) { const x = hx - 0.6 + k * 1.2; g.moveTo(x, hy - 3.8); g.quadraticCurveTo(x - 0.6, hy - 5 - sin(t * 2 + k) * 0.4, x + 0.1, hy - 6.2); } g.lineWidth = 0.35; g.strokeStyle = '#ffffff'; g.stroke(); g.globalAlpha = D.ga; }
        return [hx, hy - 5];
      }
      case 'box': {
        g.beginPath(); g.rect(hx - 5.5, hy - 5, 11, 8.2); g.fillStyle = F('#c8a070'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#6a4a2a'); g.stroke();
        if (!sil) { g.beginPath(); g.moveTo(hx - 5.5, hy - 3.2); g.lineTo(hx + 5.5, hy - 3.2); g.lineWidth = 0.4; g.stroke(); g.fillStyle = '#e8d4a8'; g.fillRect(hx - 1.8, hy - 1.8, 3.6, 2.2); }
        return [hx, hy - 5];
      }
      case 'camera': {
        g.beginPath(); roundRectP(g, hx - 3, hy - 2.8, 6, 4, 0.6); g.fillStyle = F('#2e2c34'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#0e0c12'); g.stroke();
        g.beginPath(); g.arc(hx + 0.3, hy - 0.8, 1.4, 0, TAU); g.fillStyle = F('#4a4a58'); g.fill(); g.stroke();
        if (!sil) { g.beginPath(); g.arc(hx + 0.3, hy - 0.8, 0.7, 0, TAU); g.fillStyle = '#7ab8e0'; g.fill(); g.fillStyle = '#c8c8d0'; g.fillRect(hx - 2.6, hy - 3.4, 1.4, 0.6); }
        return [hx, hy - 1];
      }
      case 'map': {
        g.save(); g.translate(hx, hy - 1.5);
        const w = 5 * (0.5 + 0.5 * abs(P.cy)) + 1.5;
        g.beginPath(); g.moveTo(-w, -3); g.lineTo(-w / 3, -3.4); g.lineTo(w / 3, -3); g.lineTo(w, -3.4); g.lineTo(w, 2.4); g.lineTo(w / 3, 2.8); g.lineTo(-w / 3, 2.4); g.lineTo(-w, 2.8); g.closePath();
        g.fillStyle = F('#f0e2c0'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#7a6040'); g.stroke();
        if (!sil) { g.beginPath(); g.moveTo(-w * 0.8, 1.5); g.quadraticCurveTo(0, -3, w * 0.7, 0.5); g.lineWidth = 0.35; g.strokeStyle = '#c05a3a'; g.setLineDash([0.6, 0.5]); g.stroke(); g.setLineDash([]); g.beginPath(); g.moveTo(w * 0.3, -1.6); g.lineTo(w * 0.5, -2.6); g.lineTo(w * 0.7, -1.6); g.fillStyle = '#8a7a6a'; g.fill(); }
        g.restore(); return [hx, hy];
      }
      case 'lamb': case 'lamb-pink': {
        const pink = name === 'lamb-pink';
        const S = D.P.S;
        const bm = D.g.getTransform();
        drawSheep(g, pink ? 'sheep-pink' : 'sheep-black', { x: hx - 0.5, y: hy + 8.2, h: 24, t: t + 0.4, pose: 'sit', flip: D.P.cy < 0, expr: 'happy', sil: D.sil, lod: D.lod, glow: pink ? D.o.glow : 0, nested: 1, heat: D.o.heat });
        g.setTransform(bm);
        void S;
        return [hx, hy];
      }
      default: return [hx, hy];
    }
  }
  /** 背在身上的道具：书包（挎在近侧髋部）、背包、大提琴盒、挎包 */
  function drawWornProp(D, name, layer) {
    const g = D.g, P = D.P, B = D.B, ink = D.ink, sil = D.sil;
    const F = (c) => sil || c;
    if (name === 'backpack') {
      ringAt(D, 0.62, RA);
      const off = -P.sy * (RA[3] + 3.5) * (P.back ? -1 : 1);
      const cx = RA[0] + (P.back ? 0 : off) + D.ax * 0, cy = RA[1];
      const w = 7.2 * abs(P.cy) + 4.4 * abs(P.sy) + 1.2, h = 12.5;
      g.beginPath(); roundRectP(g, cx - w, cy - h * 0.55, w * 2, h, 2.2); g.fillStyle = F('#6e6a4e'); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#34321f'); g.stroke();
      g.beginPath(); g.ellipse(cx, cy - h * 0.55 - 1.6, w * 1.05, 2.2, 0, 0, TAU); g.fillStyle = F('#9a4a3a'); g.fill(); g.stroke();
      if (!sil && D.lod >= 1) { g.beginPath(); roundRectP(g, cx - w * 0.6, cy + h * 0.05, w * 1.2, h * 0.3, 1); g.fillStyle = '#5e5a40'; g.fill(); g.stroke(); }
      return;
    }
    if (name === 'cello') {
      if (P.armsM === 'play') return;
      // 背在背上的琴盒：Q 版的头很大，琴盒要斜着背、琴颈从肩后探出头顶，才看得出是大提琴
      const R = B.R, Hd = D.headY;
      ringAt(D, 0.3, RA);
      const backX = P.back ? 0 : -P.sy * (RA[3] + 3);
      const bx = RA[0] + backX * 0.6 + (P.back ? 2 : 0), by = RA[1] + 3;
      const tx = D.headX + (P.back ? R * 0.75 : -R * (0.9 + 0.35 * abs(P.sy))), ty = Hd - R * 1.35;
      const L = hypot(tx - bx, ty - by), ang = atan2(ty - by, tx - bx);
      const sway = (P.mv ? 0.035 * sin(2 * P.ph) : 0) + D.clothX * 0.003;
      g.save(); g.translate(bx, by); g.rotate(ang + HP + sway);
      // 局部坐标：y 向上为负，琴盒从 0（底）到 -L（顶）
      const W = 10.5 * (0.75 + 0.25 * abs(P.cy)) * (L / 80);
      g.beginPath();
      g.moveTo(0, 2);
      g.bezierCurveTo(W * 1.05, 2, W * 1.15, -L * 0.2, W * 0.78, -L * 0.34);
      g.quadraticCurveTo(W * 0.62, -L * 0.42, W * 0.82, -L * 0.52);
      g.bezierCurveTo(W * 0.9, -L * 0.6, W * 0.45, -L * 0.66, W * 0.3, -L * 0.7);
      g.lineTo(W * 0.24, -L * 0.94);
      g.quadraticCurveTo(0, -L - 1.5, -W * 0.24, -L * 0.94);
      g.lineTo(-W * 0.3, -L * 0.7);
      g.bezierCurveTo(-W * 0.45, -L * 0.66, -W * 0.9, -L * 0.6, -W * 0.82, -L * 0.52);
      g.quadraticCurveTo(-W * 0.62, -L * 0.42, -W * 0.78, -L * 0.34);
      g.bezierCurveTo(-W * 1.15, -L * 0.2, -W * 1.05, 2, 0, 2);
      g.closePath();
      g.fillStyle = sil || linG('cellocase', -10, 0, 10, 0, [0, '#3a4a6a', 0.45, '#56688e', 1, '#2e3a56']); g.fill();
      g.lineWidth = ink; g.strokeStyle = F('#141a2a'); g.stroke();
      if (!sil && D.lod >= 1) {
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -L * 0.97); g.lineWidth = ink * 0.6; g.strokeStyle = '#8a9ac0'; g.stroke();
        g.beginPath(); g.moveTo(-W * 0.7, -L * 0.36); g.quadraticCurveTo(0, -L * 0.33, W * 0.7, -L * 0.36); g.lineWidth = 1.1; g.strokeStyle = '#c8a060'; g.stroke();
        g.beginPath(); g.ellipse(-W * 0.35, -L * 0.18, W * 0.22, W * 0.34, 0, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fill();
        // 贴纸：一颗小星星
        g.fillStyle = '#ffd66b'; g.beginPath(); for (let k = 0; k < 5; k++) { const a = -HP + k * TAU / 5, a2 = a + PI / 5; g.lineTo(W * 0.3 + cos(a) * 1.4, -L * 0.12 + sin(a) * 1.4); g.lineTo(W * 0.3 + cos(a2) * 0.6, -L * 0.12 + sin(a2) * 0.6); } g.fill();
      }
      g.restore();
      return;
    }
    if (name === 'satchel' || name === 'bag') {
      // 斜挎带：远侧肩 → 近侧髋
      if (!P.back) { g.beginPath(); surfLine(D, g, 1.02, -1.1, 0.12, 1.25, 0.8, 6); g.lineCap = 'round'; g.lineWidth = 0.9 + ink * 2; g.strokeStyle = F('#3a2418'); g.stroke(); g.lineWidth = 0.9; g.strokeStyle = F(name === 'bag' ? (D.O.strap || '#2c2c34') : '#8a5a3a'); g.stroke(); }
      surf(D, 0.05, 1.45, 1.8, Q2);
      const cx = Q2[0], cy = Q2[1] + 2.5;
      if (Q2[2] < -1 && !P.back) return;
      const w = name === 'bag' ? 3.4 : 4.2, h = name === 'bag' ? 4.2 : 5.2;
      const col = name === 'bag' ? (D.O.bag ? D.O.bag.c : '#2c2c34') : '#9a6040';
      g.beginPath(); roundRectP(g, cx - w, cy - h * 0.5, w * 2, h, 0.9); g.fillStyle = F(col); g.fill(); g.lineWidth = ink; g.strokeStyle = F(inkOf(col)); g.stroke();
      if (!sil && D.lod >= 1) {
        g.beginPath(); g.moveTo(cx - w, cy - h * 0.5 + 0.4); g.lineTo(cx - w, cy); g.quadraticCurveTo(cx, cy + 1, cx + w, cy); g.lineTo(cx + w, cy - h * 0.5 + 0.4); g.fillStyle = dk(col, 0.12); g.fill(); g.stroke();
        if (name === 'bag' && D.O.bag) { g.fillStyle = D.O.bag.dev; g.fillRect(cx - 1.6, cy + 0.4, 3.2, 1.6); } else { g.fillStyle = '#e0c070'; g.fillRect(cx - 0.6, cy - 0.3, 1.2, 1.1); }
      }
    }
  }
  /** 萨科塔的小翅膀（芳汀）：半透明的光羽 */
  /** 背带：背包的两条肩带 / 琴盒的一条斜挎带（正面看得见） */
  function drawWornFront(D, name) {
    const g = D.g, P = D.P, d = D.O.coat || D.O.jacket ? 1.2 : 0.6;
    if (P.back || (name !== 'backpack' && !(name === 'cello' && P.armsM !== 'play'))) return;
    g.lineCap = 'round';
    const col = name === 'cello' ? '#2e3a56' : '#6a5436';
    g.beginPath();
    if (name === 'backpack') { surfLine(D, g, 1.04, 0.5, 0.36, 0.98, d, 5); surfLine(D, g, 1.04, -0.5, 0.36, -0.98, d, 5); }
    else surfLine(D, g, 1.03, 0.62, 0.12, -1.15, d, 7);
    g.lineWidth = 1.5 + D.ink * 2; g.strokeStyle = D.sil || inkOf(col); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = D.sil || col; g.stroke();
    if (!D.sil && D.lod >= 1 && name === 'backpack') { for (const sg of [1, -1]) { surf(D, 0.62, sg * 0.8, d + 0.3, Q2); if (Q2[2] > 0) { g.beginPath(); roundRectP(g, Q2[0] - 0.9, Q2[1] - 0.6, 1.8, 1.2, 0.3); g.fillStyle = '#c8b070'; g.fill(); } } }
  }
  /** 萨科塔的光翼：背后一对由几片发光羽毛组成的小翅膀（半透明，随呼吸轻轻开合） */
  function drawWings(D) {
    const g = D.g, P = D.P, W = D.C.wings, t = P.t;
    ringAt(D, 0.86, RA);
    const flap = 0.1 * sin(t * 2.2) + (P.mv ? 0.12 * sin(2 * P.ph) : 0) + (P.air ? -P.vy * 0.3 : 0);
    for (const sg of [1, -1]) {
      const s = sg * 3.2, f = -(RA[3] + 0.8);
      const lx = -s * P.cy + f * P.sy;
      const bx = RA[0] + lx * D.nx, by = RA[1] + lx * D.ny;
      let dx = -sg * P.cy * 0.95 - 0.55 * P.sy, dy = -0.35;
      const dl = hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const base = atan2(dy, dx), side = dx >= 0 ? 1 : -1;
      const reach = 0.55 + 0.45 * max(abs(P.cy), 0.4);
      if (!D.sil && D.lod >= 1) { E.glow(g, bx + dx * 9, by + dy * 9 - 2, 17, W.glow || '255,240,200', 0.35); }
      for (let k = 0; k < 4; k++) {
        const a = base - side * (0.55 - k * 0.32) - side * flap * (1 - k * 0.2);
        const L = (15 - k * 2.4) * reach, w = 2.4 - k * 0.22;
        const cx = bx + cos(a) * L * 0.55, cy = by + sin(a) * L * 0.55;
        g.beginPath(); g.ellipse(cx, cy, L * 0.55, w, a, 0, TAU);
        g.globalAlpha = D.ga * (D.sil ? 1 : 0.62 - k * 0.07);
        g.fillStyle = D.sil || W.c; g.fill();
        if (!D.sil) { g.lineWidth = D.ink * 0.7; g.strokeStyle = W.edge; g.stroke(); g.beginPath(); g.moveTo(bx + cos(a) * 1.5, by + sin(a) * 1.5); g.lineTo(bx + cos(a) * L * 0.9, by + sin(a) * L * 0.9); g.lineWidth = D.ink * 0.45; g.stroke(); }
      }
      g.globalAlpha = D.ga;
    }
  }
  /** 大提琴（演奏时立在两膝之间） */
  function drawCelloPlay(D) {
    const g = D.g, P = D.P, sil = D.sil, ink = D.ink, C = P.cello;
    if (!C) return;
    const F = (c) => sil || c;
    const b = pj(P, C.b, Q2), bx = b[0], by = b[1];
    const tt = pj(P, C.t, Q3), tx = tt[0], ty = tt[1];
    const L = hypot(tx - bx, ty - by) || 1, ang = atan2(ty - by, tx - bx);
    const k = L / 44;        // 原图（下面的局部坐标）总长 44：琴身 -1..-19，琴颈到 -43
    g.save(); g.translate(bx, by); g.rotate(ang + HP); g.scale(k, k);
    const lw = ink / k;
    // 尾柱
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -2); g.lineWidth = 0.5; g.strokeStyle = F('#8a8a96'); g.stroke();
    // 琴身（葫芦形）
    g.beginPath(); g.moveTo(0, -2);
    g.bezierCurveTo(6.8, -2, 7.4, -7.5, 5.4, -10); g.quadraticCurveTo(4.2, -11.5, 5.1, -13.2); g.bezierCurveTo(6.2, -16.5, 3.5, -19.5, 0, -19.5);
    g.bezierCurveTo(-3.5, -19.5, -6.2, -16.5, -5.1, -13.2); g.quadraticCurveTo(-4.2, -11.5, -5.4, -10); g.bezierCurveTo(-7.4, -7.5, -6.8, -2, 0, -2); g.closePath();
    g.fillStyle = sil || linG('cellobody', -6, 0, 6, 0, [0, '#8a3e1e', 0.4, '#b86a38', 1, '#7a3418']); g.fill(); g.lineWidth = lw; g.strokeStyle = F('#4a200c'); g.stroke();
    // 指板 + 琴头
    g.beginPath(); g.moveTo(0, -8); g.lineTo(0, -40.5); g.lineCap = 'round'; g.lineWidth = 1.3 + lw * 2; g.strokeStyle = F('#1a0e08'); g.stroke(); g.lineWidth = 1.3; g.strokeStyle = F('#2e1c12'); g.stroke();
    g.beginPath(); g.arc(0.3, -42, 1.4, 0, TAU); g.fillStyle = F('#3a2418'); g.fill(); g.lineWidth = lw * 0.8; g.strokeStyle = F('#1a0e08'); g.stroke();
    if (!sil && D.lod >= 1) {
      g.beginPath(); g.moveTo(-1.4, -39.5); g.lineTo(-2.4, -39.8); g.moveTo(1.4, -38.5); g.lineTo(2.4, -38.2); g.lineWidth = 0.5; g.strokeStyle = '#1a0e08'; g.stroke();
      g.beginPath(); for (let q = -1.5; q <= 1.5; q += 1) { g.moveTo(q * 0.3, -39); g.lineTo(q * 0.55, -5); } g.lineWidth = 0.14; g.strokeStyle = '#f4e6c8'; g.stroke();
      g.beginPath(); g.moveTo(-2.2, -9.5); g.quadraticCurveTo(-2.9, -11, -2.2, -12.5); g.moveTo(2.2, -9.5); g.quadraticCurveTo(2.9, -11, 2.2, -12.5); g.lineWidth = 0.4; g.strokeStyle = '#2a1008'; g.stroke();
      g.beginPath(); g.moveTo(-1.6, -6.2); g.lineTo(1.6, -6.2); g.lineWidth = 0.5; g.strokeStyle = '#e8d0a0'; g.stroke();
      g.globalAlpha = D.ga * 0.3; g.beginPath(); g.ellipse(-2.6, -14.5, 1.1, 3, 0.2, 0, TAU); g.fillStyle = '#ffffff'; g.fill(); g.globalAlpha = D.ga;
    }
    g.restore();
    // 弓：在近侧手里，垂直于琴身横过琴弦
    const h = D.hc[0], bxd = cos(ang), byd = sin(ang);
    const px = -byd, py = bxd, bl = L * 0.5;
    g.beginPath(); g.moveTo(h[0] - px * bl * 0.62, h[1] - py * bl * 0.62); g.lineTo(h[0] + px * bl * 0.38, h[1] + py * bl * 0.38);
    g.lineCap = 'round'; g.lineWidth = 0.45 + ink * 1.4; g.strokeStyle = F('#2a1a10'); g.stroke();
    if (!sil) { g.lineWidth = 0.2; g.strokeStyle = '#f0e8d8'; g.stroke(); }
  }

  /* ================================================================
   * 人物：解析服装 → 解算骨架 → 按前 / 背两种视角的层次画
   * ================================================================ */
  const RES = new Map();
  function resolveOutfit(who, key, hood) {
    const k = who + ':' + key + ':' + (hood ? 1 : 0);
    let r = RES.get(k);
    if (r) return r;
    const C = CH[who], O0 = C.outfits[key] || C.outfits[C.def];
    const O = Object.assign({}, O0);
    let hair = C.hair ? Object.assign({}, C.hair) : null;
    if (O0.hair && hair) {
      for (const f of ['pony', 'back', 'locks', 'braid', 'ahoge']) if (f in O0.hair) hair[f] = O0.hair[f];
      if (O0.hair.headband) { O.headband = O0.hair.headband; O.headbandFrill = O0.hair.headbandFrill || false; }
      if (O0.hair.headdress) O.headdress = O0.hair.headdress;
    }
    if (hood && O.jacket && O.jacket.hood) O.hoodUp = { c: O.jacket.c };
    if (O.vest && !O.vest.knit && O.blazer) O.vest = Object.assign({}, O.vest);
    // “背心 / 西装”：躯干底色是背心，V 领里露出衬衫
    if (O.vest) { O.shirt = O.top; O.top = O.vest.c; }
    r = { O, hair, hkey: who + ':' + key };
    RES.set(k, r);
    return r;
  }
  const MIRH = new Map();
  function mirrorHair(key, h) {
    let m = MIRH.get(key);
    if (m) return m;
    m = Object.assign({}, h);
    m.bangs = h.bangs.map(([p, y, b]) => [-p, y, -(b || 0)]);
    if (h.pony) m.pony = Object.assign({}, h.pony, { psi: h.pony.low ? h.pony.psi : -h.pony.psi, bow: h.pony.bow ? [h.pony.bow[1] || h.pony.bow[0], h.pony.bow[0]] : null });
    if (h.braid) m.braid = Object.assign({}, h.braid, { psi: -h.braid.psi });
    if (h.ahoge) m.ahoge = Object.assign({}, h.ahoge, { psi: -h.ahoge.psi });
    MIRH.set(key, m);
    return m;
  }
  const PPOOL = newPose();
  const HST = { yaw: 0, cy: 1, sy: 0, pitch: 0, cp: 1, sp: 0, qk: '', front: true };
  const J2 = { sh: [v3(), v3()], el: [v3(), v3()], wr: [v3(), v3()], hj: [v3(), v3()], kn: [v3(), v3()], an: [v3(), v3()] };
  const HC = [[0, 0], [0, 0]], HD = [[0, 1], [0, 1]];
  const pj = (P, p, out) => { out[0] = -p[0] * P.cy + p[2] * P.sy; out[1] = p[1]; out[2] = p[0] * P.sy + p[2] * P.cy; return out; };

  /** 本次绘制的状态：矩阵、墨线宽度、细节等级、二次运动参数 */
  function setupHuman(g, who, o, base) {
    const C = CH[who];
    const outKey = C.outfits[o.outfit] ? o.outfit : C.def;
    const R0 = resolveOutfit(who, outKey, !!o.hood);
    const B = BODIES[C.body];
    let S = (o.h || 300) / 100, ox = o.x || 0, oy = o.y || 0;
    const crop = o.crop === 'bust' || o.crop === 'face' ? o.crop : null;
    if (crop === 'bust') { const bu = 100 - (B.leg + 0.38 * B.T); S = (o.h || 600) / bu; oy += (B.leg + 0.38 * B.T) * S; }
    else if (crop === 'face') { const hh = 2.08 * B.R; S = (o.h || 500) / hh; oy += -B.headY * S; }
    if (!C.seed) C.seed = floor(hash(who.length * 7 + who.charCodeAt(0), 3) * 100);
    const P = solve(B, C, o, S, PPOOL);
    // 朝向超过 π 时整个角色是镜像画的：不对称的发型（侧马尾、辫子、偏分刘海）要跟着换边，转身时才不会跳
    let hair = R0.hair, hkey = R0.hkey;
    if (P.mir && hair) { hair = mirrorHair(R0.hkey, hair); hkey += '#m'; }
    const bs = base ? sqrt(abs(base[0] * base[3] - base[1] * base[2])) : 1;
    const pxU = S * bs, hpx = 100 * pxU;
    const lod = o.lod != null ? o.lod : hpx < 95 ? 0 : hpx < 340 ? 1 : 2;
    const D = {
      g, o, P, B, C, O: R0.O, hair, hkey, who, crop, S, ox, oy, lod, sil: null, ga: 1,
      mC: [1, 0, 0, 1, 0, 0], mH: [1, 0, 0, 1, 0, 0], mE: [1, 0, 0, 1, 0, 0], mT: [1, 0, 0, 1, 0, 0],
      rx: new Float64Array(5), ry: new Float64Array(5), re: new Float64Array(5), bw: B.W, bd: B.Dp,
      H: HST, j: J2, hc: HC, hd: HD, pxU, hpx, bs,
    };
    const inkPx = clamp(0.5 + hpx * 0.0042, 0.8, 5.4) * (o.inkW || 1);
    D.inkPx = inkPx; D.ink = inkPx / pxU; D.inkH = inkPx / (pxU * B.R);
    D.sleeveK = R0.O.coat || R0.O.jacket ? 1.18 : 1;
    // 二次运动（头发：头部空间；衣摆：角色空间）
    const t = P.t, sy = P.sy;
    const wind = clamp(o.wind || 0, 0, 1.5);
    const wdir = o.windDir != null ? (o.windDir >= 0 ? 1 : -1) * P.fx : -1;
    D.trail = P.mv ? -(P.run ? 0.95 : 0.32) * sy : 0;
    D.windX = wind * wdir * 1.15;
    D.swingA = P.mv ? (P.run ? 0.14 : 0.09) : 0;
    D.idleA = 0.03;
    D.liftA = P.floaty * 0.45 + (P.air ? max(0, -P.vy) * P.air * 0.55 : 0) + P.twirl * 0.35 + (P.run ? 0.1 : 0);
    D.bobA = P.mv ? (P.run ? 0.1 : 0.06) : 0;
    D.clothX = (P.mv ? -(P.run ? 6.5 : 2.4) * sy : 0) + wind * wdir * 7.5 * (0.85 + 0.15 * sin(t * 2.7)) + (P.mv ? 1.1 * sin(2 * P.ph - 1) : 0) + 0.35 * sin(t * 1.1 + P.seed);
    if (P.twirl) D.clothX += 2.5 * sin(P.spin * 0.5);
    // 矩阵
    D.base = base; D.crop = crop;
    buildMatrices(D, base || [1, 0, 0, 1, 0, 0]);
    return D;
  }
  function buildMatrices(D, base) {
    const P = D.P, B = D.B, o = D.o, S = D.S;
    tm(D.mC, base, D.ox, D.oy, o.rot || 0, S * P.fx, S);
    if (P.lie) { tm(D.mT, D.mC, B.leg, -(B.Dp[3] + 1.5), -HP, 1, 1); D.mC.splice(0, 6, ...D.mT); }
    // 投影关节
    const J = D.j;
    for (let i = 0; i < 2; i++) {
      const A = P.A[i], L = P.L[i];
      pj(P, A.sh, J.sh[i]); pj(P, A.el, J.el[i]); pj(P, A.wr, J.wr[i]);
      pj(P, L.hj, J.hj[i]); pj(P, L.kn, J.kn[i]); pj(P, L.an, J.an[i]);
      let dx = J.wr[i][0] - J.el[i][0], dy = J.wr[i][1] - J.el[i][1];
      const l = hypot(dx, dy) || 1; dx /= l; dy /= l;
      D.hd[i][0] = dx; D.hd[i][1] = dy;
      D.hc[i][0] = J.wr[i][0] + dx * B.hand * 0.55; D.hc[i][1] = J.wr[i][1] + dy * B.hand * 0.55;
    }
    computeRings(D);
    D.hipX = D.rx[0]; D.hipY = D.ry[0];
    // 头
    pj(P, P.head3, Q3);
    const hx = Q3[0], hy = Q3[1];
    D.headX = hx; D.headY = hy;
    const H = D.H;
    const q = (v) => Math.round(v * 160) / 160;
    H.yaw = q(P.hyaw); H.pitch = q(P.hp);
    H.cy = cos(H.yaw); H.sy = sin(H.yaw); H.cp = cos(H.pitch); H.sp = sin(H.pitch);
    H.qk = H.yaw.toFixed(4) + ',' + H.pitch.toFixed(4);
    H.front = abs(H.yaw) < 1.62;
    const roll = P.hr + (P.lie ? 0 : 0);
    tm(D.mH, D.mC, hx, hy, roll, B.R, B.R);
    // 头部空间里的重力方向（头发下垂的方向）
    const m = D.mH, det = m[0] * m[3] - m[1] * m[2];
    const gx = -m[2] / det, gy = m[0] / det;
    const gr = -atan2(gx, gy);
    D.grot = abs(gr) < 0.02 ? 0 : gr;
  }

  /** 画一遍（color 或 sil）。D.mC / mH 已按偏移设好 */
  function paintHuman(D) {
    const g = D.g, P = D.P, O = D.O, C = D.C, H = D.H, hr = D.hair, o = D.o;
    const props = withGear(propList(o), O, o);
    const crop = D.crop;
    const handProp = [null, null], twoProp = [];
    const worn = [], hipP = [];
    if (props) {
      const two = TWO_HAND[P.armsM] === 1;
      let hi = o.propHand === 'far' ? 1 : 0;
      for (const p of props) {
        if (BACK_PROPS[p] && !(p === 'cello' && P.armsM === 'play')) { worn.push(p); continue; }
        if (HIP_PROPS[p]) { hipP.push(p); continue; }
        if (p === 'cello') continue;
        if (two && p !== 'staff' && p !== 'lantern' && p !== 'umbrella' && p !== 'suitcase') twoProp.push(p);
        else { if (!handProp[hi]) handProp[hi] = [p]; else handProp[hi].push(p); hi = 1 - hi; }
      }
    }
    D.propTip = null;
    const handPropDraw = (i) => {
      const L = handProp[i];
      if (!L) return;
      setT(g, D.mC);
      for (const p of L) { const r = drawHandProp(D, p, D.hc[i][0], D.hc[i][1], D.hd[i][0], D.hd[i][1], false); if (!D.propTip) D.propTip = r; }
    };
    const twoPropDraw = () => {
      if (!twoProp.length) return;
      setT(g, D.mC);
      const x = (D.hc[0][0] + D.hc[1][0]) / 2, y = (D.hc[0][1] + D.hc[1][1]) / 2;
      for (const p of twoProp) { const r = drawHandProp(D, p, x, y, 0, 1, true); if (!D.propTip) D.propTip = r; }
    };
    // 远侧手臂是否在胸前（要分两段画）
    const Af = P.A[1];
    const fr = (Af.wr[2] - P.H[2]) * P.F[2] + (Af.wr[1] - P.H[1]) * P.F[1];
    const farFront = !P.back && fr > D.B.Dp[3] * 0.4 && abs(Af.wr[0] - P.H[0]) < D.B.W[4] * 1.4;
    // 远侧手臂举过肩（欢呼 / 挥手）：画在头的后面会被 Q 版的大头挡住，改为画在头之后
    const farRaised0 = !P.back && J2.wr[1][1] < J2.sh[1][1] - D.B.R * 0.35;
    // 手放在脸上（捂嘴、擦眼泪、托腮、手搭凉棚、按在耳边）：手臂画在下巴后面，手画在脸上面
    const faceHand = [false, false];
    if (!P.back) for (let i = 0; i < 2; i++) { const hx = D.hc[i][0] - D.headX, hy = D.hc[i][1] - D.headY; faceHand[i] = hx * hx + hy * hy < (D.B.R * 1.12) * (D.B.R * 1.12) && P.A[i].wr[2] > P.head3[2] - D.B.R * 0.4; }
    const farRaised = farRaised0 && !faceHand[1];
    const noLegs = crop != null;
    const legOrder = J2.an[0][2] >= J2.an[1][2] ? [1, 0] : [0, 1];
    const pnLow = hr && hr.pony && hr.pony.low ? hr.pony : null;
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (!P.back) {
      // ---------- 前视（正面 / 3/4 / 侧面） ----------
      if (hr && crop !== 'face') { setT(g, D.mH); drawBackHair(D, H, hr.back); if (pnLow) drawPony(D, H, pnLow); }
      setT(g, D.mC);
      if (C.wings) drawWings(D);
      const coat = O.coat || O.jacket || O.cardigan && { c: O.cardigan.c, len: 0.18, open: 0.42 };
      if (O.jacket && O.jacket.hood && !O.hoodUp) drawHoodDown(D, O.jacket.c, O.jacket.sh);
      if (coat && !noLegs) drawCoatSkirt(D, coat, 'back');
      if (O.coat && O.coat.ribbons && !noLegs) drawRibbons(D, O.coat.ribbons);
      for (const p of worn) drawWornProp(D, p);
      if (!farRaised && !faceHand[1]) { handPropDraw(1); setT(g, D.mC); drawArm(D, 1, farFront ? 'upper' : 'all'); }
      setT(g, D.mC);
      if (!noLegs) {
        for (const i of legOrder) drawLeg(D, i);
        drawPelvis(D);
      }
      if (O.skirt && crop !== 'face') drawSkirt(D, O.skirt);
      drawTorso(D);
      if (coat) { drawCoatTorso(D, coat); if (!noLegs) drawCoatSkirt(D, coat, 'front'); }
      if (O.cords && !D.sil) {
        for (const sg of [1, -1]) { surf(D, 0.9, sg * 0.62, 0.9, Q2); if (Q2[2] > 0) drawCord(D, Q2[0], Q2[1], 30, 0.95, O.cords, sg * 2); }
      } else if (O.cords) { for (const sg of [1, -1]) { surf(D, 0.9, sg * 0.62, 0.9, Q2); if (Q2[2] > 0) drawCord(D, Q2[0], Q2[1], 30, 0.95, O.cords, sg * 2); } }
      for (const p of worn) drawWornFront(D, p);
      for (const p of hipP) drawWornProp(D, p);
      if (O.goggles) drawGoggles(D);
      if (O.hammerBelt && !hasProp(o, 'hammer')) drawBeltHammer(D);
      const hasCape = !!(O.cape || O.capelet || O.shawl);
      if (hasCape) { setT(g, D.mC); drawArm(D, 0, 'upper'); }
      if (O.cape) drawCape(D, O.cape, 'cape');
      if (O.capelet) drawCape(D, Object.assign({ len: 0.34 }, O.capelet), 'cape');
      if (O.shawl) drawCape(D, Object.assign({ len: 0.5 }, O.shawl), 'shawl');
      // 远侧的鬓发
      const farLockFirst = hr && hr.locks;
      if (farLockFirst) { setT(g, D.mH); drawLock(D, H, H.sy >= 0 ? -1 : 1, hr.locks); }
      setT(g, D.mC);
      if (P.armsM === 'play') drawCelloPlay(D);
      if (faceHand[1]) drawArm(D, 1, 'nohand');
      if (faceHand[0]) drawArm(D, 0, hasCape ? 'fore' : 'nohand');
      drawNeck(D);
      if (O.headphones) drawHeadphones(D);
      drawHead(D);
      if (hr) {
        setT(g, D.mH);
        if (hr.locks) drawLock(D, H, H.sy >= 0 ? 1 : -1, hr.locks);
        if (hr.braid) drawBraid(D, H, hr.braid);
      }
      setT(g, D.mC);
      // 双手捧着的东西：先画两条前臂，再画东西，最后画两只手（手握在东西外面）
      const twoLayer = twoProp.length && P.armsM !== 'hug';
      if (faceHand[1]) { handPropDraw(1); setT(g, D.mC); drawArm(D, 1, 'hand'); }
      else if (farRaised) { handPropDraw(1); setT(g, D.mC); drawArm(D, 1, 'all'); }
      else if (farFront) drawArm(D, 1, twoLayer ? 'fore-nohand' : 'fore');
      if (twoLayer) {
        setT(g, D.mC);
        if (!faceHand[0]) drawArm(D, 0, hasCape ? 'fore-nohand' : 'nohand');
        twoPropDraw();
        setT(g, D.mC);
        if (farFront) drawArm(D, 1, 'hand');
        drawArm(D, 0, 'hand');
      } else {
        twoPropDraw();
        handPropDraw(0);
        setT(g, D.mC);
        drawArm(D, 0, faceHand[0] ? 'hand' : hasCape ? 'fore' : 'all');
      }
    } else {
      // ---------- 背影 ----------
      if (P.armsM === 'play') { setT(g, D.mC); drawCelloPlay(D); }
      twoPropDraw();
      handPropDraw(0); handPropDraw(1);
      setT(g, D.mC);
      if (C.wings) { /* 翅膀在背上，后面画 */ }
      drawArm(D, 0, 'all'); drawArm(D, 1, 'all');
      if (!noLegs) { for (const i of legOrder) drawLeg(D, i); drawPelvis(D); }
      if (O.skirt) drawSkirt(D, O.skirt);
      drawTorso(D);
      const coat = O.coat || O.jacket || O.cardigan && { c: O.cardigan.c, len: 0.18, open: 0.42 };
      if (coat) { drawCoatTorso(D, coat); if (!noLegs) drawCoatSkirt(D, coat, 'full'); }
      if (O.coat && O.coat.ribbons && !noLegs) drawRibbons(D, O.coat.ribbons);
      if (O.cape) drawCape(D, O.cape, 'cape');
      if (O.capelet) drawCape(D, Object.assign({ len: 0.34 }, O.capelet), 'cape');
      if (O.shawl) drawCape(D, Object.assign({ len: 0.5 }, O.shawl), 'shawl');
      if (O.jacket && O.jacket.hood && !O.hoodUp) drawHoodDown(D, O.jacket.c, O.jacket.sh);
      for (const p of hipP) drawWornProp(D, p);
      if (C.wings) drawWings(D);
      setT(g, D.mC);
      drawNeck(D);
      if (O.headphones) drawHeadphones(D);
      if (hr) { setT(g, D.mH); drawBackHair(D, H, hr.back); if (pnLow) drawPony(D, H, pnLow); }
      setT(g, D.mC);
      for (const p of worn) drawWornProp(D, p);
      drawHead(D);
    }
  }
  function drawNeck(D) {
    const g = D.g, B = D.B, sk = D.C.skin;
    if (D.C.hooded) return;
    const x0 = D.headX, y0 = D.headY + B.R * 0.72;
    ringAt(D, 1, RA);
    const x1 = RA[0] + D.ax * 0.2, y1 = RA[1] + D.ay * 0.2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
    g.lineCap = 'round';
    const w = B.R * 0.36;
    g.lineWidth = w + D.ink * 2; g.strokeStyle = D.sil || sk.ink; g.stroke();
    g.lineWidth = w; g.strokeStyle = D.sil || sk.c; g.stroke();
    if (!D.sil && D.lod >= 1) { g.beginPath(); g.moveTo(x0, y0 + B.R * 0.12); g.lineTo(lerp(x0, x1, 0.55), lerp(y0, y1, 0.55)); g.lineWidth = w * 0.9; g.strokeStyle = rgba(sk.sh, 0.7); g.stroke(); }
  }
  /** 纯烬外套后腰飘着的红缎带 */
  function drawRibbons(D, c) {
    const g = D.g, P = D.P;
    for (const sg of [1, -1]) {
      surf(D, 0.3, sg * 2.0, 1.2, Q2);
      if (!P.back && Q2[2] > 1.5) continue;
      const N = 8, xs = SX[1], ys = SY[1], t = P.t;
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        xs[i] = Q2[0] + D.clothX * 1.6 * u * u + sg * 1.5 * u + 2.2 * sin(t * 2.4 + sg + u * 4) * u;
        ys[i] = Q2[1] + 34 * u * (1 - abs(D.clothX) * 0.012 * u) + 1.2 * cos(t * 2.1 + u * 3 + sg) * u;
      }
      g.beginPath(); smooth(g, xs, ys, N, false);
      g.lineCap = 'round';
      g.lineWidth = 1.5 + D.ink * 2; g.strokeStyle = D.sil || inkOf(c); g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = D.sil || c; g.stroke();
    }
  }

  /* ---- 离屏层（alpha < 1 时整体淡出） ---- */
  const LAYERS = new Map();
  function layerCanvas(w, h) {
    const bw = Math.ceil(w / 128) * 128, bh = Math.ceil(h / 128) * 128, k = bw + 'x' + bh;
    let c = LAYERS.get(k);
    if (c) { LAYERS.delete(k); LAYERS.set(k, c); return c; }
    // 最多留 6 张（最近用过的），旧的释放掉
    while (LAYERS.size >= 6) { const [k0, c0] = LAYERS.entries().next().value; c0.width = c0.height = 1; LAYERS.delete(k0); }
    c = E.mk(bw, bh); LAYERS.set(k, c);
    return c;
  }

  function drawHuman(g, who, o) {
    const bm = g.getTransform();
    const base = [bm.a, bm.b, bm.c, bm.d, bm.e, bm.f];
    const alpha = o.alpha == null ? 1 : clamp(o.alpha);
    if (alpha <= 0.003) return;
    if (alpha < 0.995 && !o._inLayer) {
      // 估算包围盒（设计坐标 → 设备像素）
      const S = (o.h || 300) / 100 * (o.crop === 'bust' ? 2 : o.crop === 'face' ? 4 : 1);
      const x0 = (o.x || 0) - 75 * S, x1 = (o.x || 0) + 75 * S, y0 = (o.y || 0) - 135 * S, y1 = (o.y || 0) + 25 * S;
      const cs = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [bm.a * x + bm.c * y + bm.e, bm.b * x + bm.d * y + bm.f]);
      let bx0 = Math.floor(min(...cs.map((c) => c[0]))), by0 = Math.floor(min(...cs.map((c) => c[1])));
      let bx1 = Math.ceil(max(...cs.map((c) => c[0]))), by1 = Math.ceil(max(...cs.map((c) => c[1])));
      const cw = g.canvas.width, ch = g.canvas.height;
      bx0 = max(0, bx0); by0 = max(0, by0); bx1 = min(cw, bx1); by1 = min(ch, by1);
      if (bx1 <= bx0 || by1 <= by0) return;
      const L = layerCanvas(bx1 - bx0, by1 - by0), q = L.getContext('2d');
      q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(0, 0, bx1 - bx0, by1 - by0);
      q.setTransform(bm.a, bm.b, bm.c, bm.d, bm.e - bx0, bm.f - by0);
      const o2 = Object.assign({}, o, { alpha: 1, _inLayer: 1 });
      drawHuman(q, who, o2);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha *= alpha;
      g.drawImage(L, 0, 0, bx1 - bx0, by1 - by0, bx0, by0, bx1 - bx0, by1 - by0);
      g.restore();
      return;
    }
    const D = setupHuman(g, who, o, base);
    D.ga = g.globalAlpha;
    const pc = g.globalCompositeOperation;
    if (o.shadow === true && !D.crop) {
      g.setTransform(bm);
      const S = D.S, spr = softSprite('0,0,0', 0.25);
      g.globalAlpha = D.ga * (o.shadowA != null ? o.shadowA : 0.26);
      g.drawImage(spr, D.ox - 22 * S, (o.shadowY != null ? o.shadowY : D.oy) - 3.2 * S, 44 * S, 6.4 * S);
      g.globalAlpha = D.ga;
    }
    D.blink = o.blink === false ? 0 : blinkAt(D.P.t, (o.seed != null ? o.seed : D.C.seed) + 0.5);
    if (o.rim) {
      const rimPx = clamp(D.hpx * 0.0065, 1.3, 7) * (o.rimW || 1);
      const dirs = o.rimDir != null ? [[cos(o.rimDir), sin(o.rimDir)]] : [[-0.75, -0.66], [0.75, -0.66]];
      const rc = 'rgb(' + o.rim + ')';
      const save = D.base;
      for (const [dx, dy] of dirs) {
        const b2 = [save[0], save[1], save[2], save[3], save[4] + dx * rimPx, save[5] + dy * rimPx];
        buildMatrices(D, b2);
        D.sil = rc; D.rimPass = true;
        paintHuman(D);
      }
      buildMatrices(D, save);
      D.rimPass = false;
    }
    D.sil = o.sil || null;
    D.rimC = o.rim && o.sil ? 'rgb(' + o.rim + ')' : null;
    paintHuman(D);
    if (o.rim && o.sil && (o.rimGlow == null || o.rimGlow > 0)) {
      g.setTransform(bm);
      const S = D.S;
      E.glow(g, D.ox, D.oy - 60 * S, 70 * S, o.rim, (o.rimGlow != null ? o.rimGlow : 0.18));
    }
    g.setTransform(bm);
    g.globalAlpha = D.ga; g.globalCompositeOperation = pc;
    return D;
  }

  /** 关键点（和 o.x / o.y 同一坐标系） */
  function anchorsHuman(who, o) {
    const D = setupHuman(null, who, o, null);
    const m = D.mC, h = D.mH, P = D.P, J = D.j, B = D.B;
    const pt = (mm, x, y) => [mapX(mm, x, y), mapY(mm, x, y)];
    const H = D.H;
    const eye = (sd) => { hsph(H, sd * EYE_PSI, EYE_Y, 1.0, T3); return pt(h, T3[0], T3[1]); };
    hproj(H, 0, 0.74, 0.8, T3); const mouth = pt(h, T3[0], T3[1]);
    const nearHand = pt(m, D.hc[0][0], D.hc[0][1]), farHand = pt(m, D.hc[1][0], D.hc[1][1]);
    ringAt(D, 0.7, RA); const chest = pt(m, RA[0], RA[1]);
    const out = {
      head: pt(h, 0, 0), face: pt(h, 0.3 * H.sy, 0.3), eyeN: eye(1), eyeF: eye(-1), mouth, top: pt(h, 0, -1.12),
      chest, hip: pt(m, D.hipX, D.hipY), handN: nearHand, handF: farHand,
      feet: pt(m, (J.an[0][0] + J.an[1][0]) / 2, 0),
    };
    // 道具的光点
    const props = propList(o) || [];
    out.prop = null;
    if (props.includes('staff')) {
      const hi = o.propHand === 'far' ? 1 : 0, L = 96 * (B === BODIES.child ? 0.75 : 1), ang = -HP + 0.13;
      out.prop = pt(m, D.hc[hi][0] + cos(ang) * (L * 0.6 + 6), D.hc[hi][1] + sin(ang) * (L * 0.6 + 6));
    } else if (props.includes('lantern')) {
      const hi = o.propHand === 'far' ? 1 : 0, sw = 0.12 * sin(P.t * 2.2) + (P.mv ? 0.15 * sin(2 * P.ph) : 0);
      out.prop = pt(m, D.hc[hi][0] + sin(sw) * 5, D.hc[hi][1] + cos(sw) * 5.5);
    }
    else if (props.length) {
      const two = TWO_HAND[P.armsM] === 1;
      out.prop = two ? [(nearHand[0] + farHand[0]) / 2, (nearHand[1] + farHand[1]) / 2] : nearHand;
    }
    const xs = [out.head[0], out.feet[0], nearHand[0], farHand[0]], ys = [out.top[1], out.feet[1], nearHand[1], farHand[1]];
    const pad = B.R * 1.2 * D.S;
    out.bounds = [min(...xs) - pad, min(...ys) - pad * 0.3, max(...xs) + pad, max(...ys)];
    return out;
  }

  /* ================================================================
   * 小羊（沿用本页 js/scenes.js 的 Q 版羊：墨线 + 径向渐变的毛团 + 金色羊角）
   * 羊的局部坐标 = scenes.js 的坐标（面朝左、脚底 y = 0），画的时候镜像成默认面朝右
   * ================================================================ */
  const SHEEP_PAL = {
    black: { w0: '#716270', w1: '#30282f', w2: '#141015', ol: '#0c090b', rim: '#4e4250', f0: '#fff6ec', f1: '#e6cfb9', h0: '#ffe0a3', h1: '#b8733a', hl: '#4b2a14', leg: '#261e24', legFar: '#141014', hoof: '#070506', eye: '#2b1a1a', blush: '255,140,120', hi: 'rgba(255,255,255,.22)' },
    pink: { w0: '#ffffff', w1: '#ffd2e2', w2: '#f39dbd', ol: '#d8739a', rim: null, f0: '#ffffff', f1: '#ffe2ec', h0: '#fdf9ff', h1: '#b49de8', hl: '#7c65b6', leg: '#ec93b4', legFar: '#d67a9e', hoof: '#b95c82', eye: '#4a2a3b', blush: '255,127,168', hi: 'rgba(255,255,255,.85)' },
  };
  const SH = {};
  (() => {
    const bx = 5, by = -21;
    const puffs = [[-15, -6, 6.8], [-8, -11, 7.4], [1, -13, 7.6], [10, -11.5, 7.4], [17, -5.5, 6.8], [18.5, 2.5, 6.4], [10, 7.5, 6.8], [0, 8.5, 7], [-9, 7.5, 6.6], [-15, 1.5, 6.4]];
    const circs = [[bx + 24.5, by - 5, 3.8], ...puffs.map(([x, y, r]) => [bx + x, by + y, r])];
    const wool = new Path2D();
    wool.ellipse(bx, by, 17, 12, 0, 0, TAU);
    for (const [x, y, r] of circs) { wool.moveTo(x + r, y); wool.arc(x, y, r, 0, TAU); }
    SH.wool = wool;
    const curls = new Path2D();
    const c = (x, y, n) => { curls.moveTo(x, y); for (let i = 0; i < n; i++) curls.quadraticCurveTo(x + 1.8 + i * 3.6, y - 2.4, x + 3.6 + i * 3.6, y); };
    c(bx - 9, by - 6, 2); c(bx + 5, by - 1, 2); c(bx - 2, by + 5, 1); c(bx + 12, by - 10, 1);
    SH.curls = curls;
    SH.bx = bx; SH.by = by;
  })();
  function sheepHead(hx, hy) {
    const k = hx + ',' + hy;
    return pathCache('sheephead:' + k, () => {
      const tuft = new Path2D();
      for (const [x, y, r] of [[hx - 4.6, hy - 7.2, 3.6], [hx + 0.4, hy - 9, 4.1], [hx + 5, hy - 6.6, 3.5]]) { tuft.moveTo(x + r, y); tuft.arc(x, y, r, 0, TAU); }
      const face = new Path2D(); face.ellipse(hx, hy, 8.2, 9, -6 * PI / 180, 0, TAU);
      const ear = new Path2D(); ear.ellipse(hx + 9, hy + 1.5, 4.4, 2.4, 28 * PI / 180, 0, TAU);
      const horn = new Path2D();
      horn.moveTo(hx + 2.5, hy - 6.5);
      horn.bezierCurveTo(hx + 8, hy - 14, hx + 17.5, hy - 9, hx + 15.2, hy - 1.5);
      horn.bezierCurveTo(hx + 13.6, hy + 3.4, hx + 7.4, hy + 2.2, hx + 8, hy - 2);
      horn.bezierCurveTo(hx + 8.4, hy - 4.6, hx + 11.2, hy - 5, hx + 12.1, hy - 2.8);
      const ridge = new Path2D(); ridge.moveTo(hx + 9.5, hy - 10.4); ridge.lineTo(hx + 10.7, hy - 8.8); ridge.moveTo(hx + 14.2, hy - 7.4); ridge.lineTo(hx + 14, hy - 5.4);
      const mouth = new Path2D(); mouth.moveTo(hx - 2.4, hy + 5.4); mouth.quadraticCurveTo(hx - 1.6, hy + 6.3, hx - 0.8, hy + 5.4); mouth.quadraticCurveTo(hx, hy + 6.3, hx + 0.8, hy + 5.4);
      return { tuft, face, ear, horn, ridge, mouth };
    });
  }
  function sheepGrads(C) {
    return {
      wool: radG('swool:' + C.w1, -3, -31, 1, 2, -24, 26, [0, C.w0, 0.55, C.w1, 1, C.w2]),
      face: radG('sface:' + C.f0, -18.5, -26, 0.5, -17, -23, 10, [0, C.f0, 1, C.f1]),
      horn: linG('shorn:' + C.h0, -15, -32, -1, -20, [0, C.h0, 1, C.h1]),
    };
  }
  function drawSheep(g, who, o) {
    const bm = g.getTransform();
    const alpha = o.alpha == null ? 1 : clamp(o.alpha);
    if (alpha <= 0.003) return;
    if (alpha < 0.995 && !o._inLayer && !o.nested) {
      const S = (o.h || 90) / 54;
      const x0 = (o.x || 0) - 45 * S, x1 = (o.x || 0) + 45 * S, y0 = (o.y || 0) - 60 * S, y1 = (o.y || 0) + 12 * S;
      const cs = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [bm.a * x + bm.c * y + bm.e, bm.b * x + bm.d * y + bm.f]);
      let bx0 = Math.floor(min(...cs.map((c) => c[0]))), by0 = Math.floor(min(...cs.map((c) => c[1])));
      let bx1 = Math.ceil(max(...cs.map((c) => c[0]))), by1 = Math.ceil(max(...cs.map((c) => c[1])));
      bx0 = max(0, bx0); by0 = max(0, by0); bx1 = min(g.canvas.width, bx1); by1 = min(g.canvas.height, by1);
      if (bx1 <= bx0 || by1 <= by0) return;
      const L = layerCanvas(bx1 - bx0, by1 - by0), q = L.getContext('2d');
      q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(0, 0, bx1 - bx0, by1 - by0);
      q.setTransform(bm.a, bm.b, bm.c, bm.d, bm.e - bx0, bm.f - by0);
      drawSheep(q, who, Object.assign({}, o, { alpha: 1, _inLayer: 1 }));
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha *= alpha;
      g.drawImage(L, 0, 0, bx1 - bx0, by1 - by0, bx0, by0, bx1 - bx0, by1 - by0);
      g.restore();
      return;
    }
    if (o.shadow === true && !o._inLayer) {
      const h = o.h || 90, spr = softSprite('0,0,0', 0.25), ga = g.globalAlpha;
      g.globalAlpha = ga * (o.shadowA != null ? o.shadowA : 0.24) * (o.air != null ? 1 - clamp(o.air) * 0.6 : 1);
      g.drawImage(spr, (o.x || 0) - h * 0.46, (o.shadowY != null ? o.shadowY : (o.y || 0)) - h * 0.07, h * 0.92, h * 0.14);
      g.globalAlpha = ga;
    }
    if (o.rim) {
      const bs = sqrt(abs(bm.a * bm.d - bm.b * bm.c)), S = (o.h || 90) / 54;
      const rimPx = clamp(o.h * bs * 0.012, 1.2, 6) * (o.rimW || 1);
      const dirs = o.rimDir != null ? [[cos(o.rimDir), sin(o.rimDir)]] : [[-0.75, -0.66], [0.75, -0.66]];
      for (const [dx, dy] of dirs) {
        g.setTransform(bm.a, bm.b, bm.c, bm.d, bm.e + dx * rimPx, bm.f + dy * rimPx);
        sheepPass(g, who, o, 'rgb(' + o.rim + ')');
      }
      g.setTransform(bm);
      void S;
    }
    sheepPass(g, who, o, o.sil || null);
    g.setTransform(bm);
  }
  function sheepPass(g, who, o, sil) {
    const pink = who === 'sheep-pink';
    const C = SHEEP_PAL[pink ? 'pink' : 'black'];
    const bm = g.getTransform();
    const t = (o.t || 0) + (o.phase || 0), sp = o.speed > 0 ? o.speed : 1;
    const S = (o.h || 90) / 54;
    const bs = sqrt(abs(bm.a * bm.d - bm.b * bm.c));
    const pxU = S * bs;
    const lod = o.lod != null ? o.lod : pxU * 54 < 40 ? 0 : pxU * 54 < 160 ? 1 : 2;
    const inkK = clamp(0.5 + pxU * 54 * 0.006, 0.7, 4) / pxU / 1.4;   // 线宽倍数（相对 scenes.js 的线宽）
    const pose = o.pose || 'stand';
    const seed = o.seed != null ? o.seed : pink ? 17 : 5;
    let sit = pose === 'sit' || pose === 'sleep' || pose === 'lie';
    const walk = pose === 'walk', run = pose === 'run' || pose === 'run-away', hop = pose === 'jump' || pose === 'bounce';
    let bob = 0, rot = 0, headDy = 0, headRot = 0, legPh = 0, legA = 0, lift = 0, air = 0;
    if (walk) { legPh = TAU * 1.6 * sp * t; legA = 2.6; bob = abs(sin(legPh)) * 1.2; headDy = sin(legPh * 2 - 0.6) * 0.5; }
    else if (run) { legPh = TAU * 2.4 * sp * t; legA = 4.2; bob = abs(sin(legPh)) * 3.2; rot = 0.08 * sin(legPh * 2); headDy = sin(legPh * 2 - 0.8) * 0.9; }
    else if (hop) { const q = fract(t * 1.3 * sp); air = o.air != null ? o.air : sin(PI * q); bob = air * 14; rot = -0.12 * cos(PI * q) * air; }
    else if (pose === 'float') { bob = 6 + 2 * sin(t * 1.4); rot = 0.05 * sin(t * 0.9); air = 0.6; }
    else if (pose === 'push') { rot = -0.18; headDy = 2.5; headRot = -0.15; legPh = TAU * 1.2 * t; legA = 1.8; }
    else if (pose === 'eat') { headDy = 6 + 0.6 * sin(t * 5); headRot = -0.35; }
    else if (pose === 'look-up') { headRot = 0.35; headDy = -1.2; }
    else if (!sit) { bob = 0.35 * sin(t * 2.2 + seed); }
    if (pose === 'sleep') { headDy = 2.5 + 0.4 * sin(t * 1.5); headRot = -0.18; }
    const breath = sit ? 0.5 * sin(t * (pose === 'sleep' ? 1.5 : 2.2)) : 0;
    // 矩阵：镜像（默认面朝右），脚底原点
    const fx = o.flip ? 1 : -1;
    const x0 = o.x || 0, y0 = (o.y || 0);
    const m0 = [bm.a, bm.b, bm.c, bm.d, bm.e, bm.f];
    const M = [0, 0, 0, 0, 0, 0];
    tm(M, m0, x0, y0, (o.rot || 0), S * fx, S);
    const Mb = [0, 0, 0, 0, 0, 0];
    tm(Mb, M, 0, -bob, rot, 1, 1);
    const F = (c) => sil || c;
    g.lineJoin = 'round'; g.lineCap = 'round';
    // 发光（粉色小羊在夜里）
    const glowK = o.glow || 0;
    if (glowK && !sil) { setT(g, Mb); E.glow(g, 4, -20, 40 * glowK, pink ? '255,170,210' : '255,150,90', 0.55 * glowK); }
    if (o.heat && !sil) { setT(g, Mb); E.glow(g, 4, -22, 34 * o.heat, '255,120,70', 0.35 * o.heat); }
    // 腿
    setT(g, Mb);
    const L = (x, dx, lf, col, w) => {
      g.beginPath(); g.moveTo(x, -9); g.lineTo(x + dx, -1.5 - lf);
      if (C.rim && !sil && lod >= 1) { g.lineWidth = w + 2; g.strokeStyle = C.rim; g.stroke(); }
      g.lineWidth = w; g.strokeStyle = F(col); g.stroke();
      g.beginPath(); g.arc(x + dx, -1.3 - lf, w / 2 + 0.15, 0, TAU); g.fillStyle = F(C.hoof); g.fill();
    };
    if (sit) {
      g.save();
      g.beginPath(); g.moveTo(-1, -4); g.lineTo(-9, -1.6); g.moveTo(22, -3.2); g.lineTo(25.5, -0.8); g.lineWidth = 3.5; g.strokeStyle = F(C.legFar); g.stroke();
      g.beginPath(); g.moveTo(4, -3.6); g.lineTo(-4.6, -0.4); g.lineWidth = 3.8; g.strokeStyle = F(C.leg); g.stroke();
      g.fillStyle = F(C.hoof); g.beginPath(); g.arc(-9.4, -1.5, 1.9, 0, TAU); g.arc(-5, -0.3, 2, 0, TAU); g.fill();
      g.restore();
    } else {
      // 对角步：近前腿 + 远后腿同相
      const sw = (p) => legA * sin(legPh + p), lf = (p) => (legA ? max(0, sin(legPh + p + HP)) * legA * 0.35 : 0);
      const tuck = air > 0.2 ? air * 3 : 0;
      L(-3, sw(PI) - tuck, lf(PI) + tuck * 0.6, C.legFar, 3.4);
      L(15, sw(0) + tuck, lf(0) + tuck * 0.6, C.legFar, 3.4);
      L(-8, sw(0) - tuck, lf(0) + tuck * 0.6, C.leg, 3.7);
      L(10, sw(PI) + tuck, lf(PI) + tuck * 0.6, C.leg, 3.7);
    }
    // 毛团
    const dyS = sit ? 5 : 0;
    const Mw = [0, 0, 0, 0, 0, 0];
    tm(Mw, Mb, 0, dyS - breath * 0.5, 0, 1, 1 + breath * 0.012);
    setT(g, Mw);
    const G = sheepGrads(C);
    if (C.rim && !sil && lod >= 1) { g.lineWidth = 5.6 * inkK * 1.3; g.strokeStyle = C.rim; g.stroke(SH.wool); }
    g.lineWidth = 3.4 * inkK * 1.2; g.strokeStyle = F(C.ol); g.stroke(SH.wool);
    g.fillStyle = sil || G.wool; g.fill(SH.wool);
    if (!sil && lod >= 1) { g.lineWidth = 1.1; g.strokeStyle = C.hi; g.stroke(SH.curls); }
    if (o.heat && !sil) { g.globalAlpha *= 0.3 * o.heat; g.fillStyle = '#ff5a3a'; g.fill(SH.wool); g.globalAlpha /= 0.3 * o.heat; }
    // 头
    const hx = -17, hy = -23 + (sit ? 3 : 0);
    const hp = sheepHead(hx, hy);
    const Mh = [0, 0, 0, 0, 0, 0];
    tm(Mh, Mw, hx, hy + headDy, headRot + 0.04 * sin(t * 1.3 + seed), 1, 1);
    tm(Mh, Mh, -hx, -hy, 0, 1, 1);
    setT(g, Mh);
    g.fillStyle = sil || G.face; g.fill(hp.ear); g.lineWidth = 1.4 * inkK; g.strokeStyle = F(C.ol); g.stroke(hp.ear);
    g.fillStyle = sil || G.face; g.fill(hp.face); g.lineWidth = 1.6 * inkK; g.stroke(hp.face);
    g.lineWidth = 3 * inkK * 1.2; g.strokeStyle = F(C.ol); g.stroke(hp.tuft); g.fillStyle = sil || G.wool; g.fill(hp.tuft);
    g.lineWidth = 5; g.strokeStyle = F(C.hl); g.stroke(hp.horn);
    g.lineWidth = 3.2; g.strokeStyle = sil || G.horn; g.stroke(hp.horn);
    if (!sil) {
      if (lod >= 1) { g.globalAlpha *= 0.6; g.lineWidth = 0.7; g.strokeStyle = C.hl; g.stroke(hp.ridge); g.globalAlpha /= 0.6; }
      // 眼睛
      const expr = o.expr || (pose === 'sleep' ? 'closed' : 'open');
      const bl = o.blink === false ? 0 : blinkAt(t, seed + 3);
      g.lineCap = 'round';
      if (expr === 'happy' || expr === 'laugh' || expr === 'smile') {
        g.beginPath(); g.moveTo(hx - 5.9, hy + 1.2); g.quadraticCurveTo(hx - 4.3, hy - 1.1, hx - 2.7, hy + 1.2); g.moveTo(hx + 0.7, hy + 0.9); g.quadraticCurveTo(hx + 2.2, hy - 1.3, hx + 3.7, hy + 0.9);
        g.lineWidth = 1.3; g.strokeStyle = C.eye; g.stroke();
      } else if (expr === 'closed' || expr === 'sleepy' || bl > 0.5) {
        g.beginPath(); g.moveTo(hx - 5.8, hy + 0.2); g.quadraticCurveTo(hx - 4.3, hy + 1.6, hx - 2.8, hy + 0.2); g.moveTo(hx + 0.8, hy); g.quadraticCurveTo(hx + 2.2, hy + 1.4, hx + 3.6, hy);
        g.lineWidth = 1.2; g.strokeStyle = C.eye; g.stroke();
      } else {
        const big = expr === 'surprise' ? 1.35 : 1;
        g.fillStyle = C.eye;
        g.beginPath(); g.ellipse(hx - 4.3, hy + 0.4, 1.35 * big, 1.8 * big, 0, 0, TAU); g.ellipse(hx + 2.2, hy + 0.2, 1.3 * big, 1.75 * big, 0, 0, TAU); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(hx - 4.8, hy - 0.3, 0.55, 0, TAU); g.arc(hx + 1.7, hy - 0.5, 0.5, 0, TAU); g.fill();
        if (expr === 'sad') { g.beginPath(); g.moveTo(hx - 6, hy - 2.6); g.lineTo(hx - 3, hy - 3.2); g.moveTo(hx + 0.8, hy - 3.2); g.lineTo(hx + 3.6, hy - 2.7); g.lineWidth = 0.7; g.strokeStyle = C.eye; g.stroke(); }
      }
      // 腮红 + 嘴
      const bspr = softSprite(C.blush, 0.3);
      g.globalAlpha *= 0.55; g.drawImage(bspr, hx - 7.9, hy + 3.3, 3.8, 2.2); g.drawImage(bspr, hx + 2.4, hy + 3.05, 3.6, 2.1); g.globalAlpha /= 0.55;
      g.lineWidth = 0.9; g.strokeStyle = C.eye;
      if (o.expr === 'surprise') { g.beginPath(); g.ellipse(hx - 1.6, hy + 5.9, 0.9, 1.1, 0, 0, TAU); g.fillStyle = C.eye; g.fill(); }
      else g.stroke(hp.mouth);
      // 配饰
      if (o.glasses) {
        g.lineWidth = 0.55; g.strokeStyle = '#3a2a2a'; g.beginPath();
        if (o.tie) { g.rect(hx - 6.3, hy - 1.6, 4, 3.6); g.rect(hx + 0.3, hy - 1.8, 3.8, 3.6); } else { g.moveTo(hx - 2.2, hy + 0.4); g.arc(hx - 4.3, hy + 0.4, 2.1, 0, TAU); g.moveTo(hx + 4.2, hy + 0.2); g.arc(hx + 2.2, hy + 0.2, 2.0, 0, TAU); }
        g.moveTo(hx - 2.3, hy); g.lineTo(hx + 0.2, hy - 0.1); g.stroke();
      }
      if (o.tie) {
        // 小红领带（爸爸羊）
        g.fillStyle = '#c4342e'; g.strokeStyle = '#5a1410'; g.lineWidth = 0.6;
        g.beginPath(); g.moveTo(hx + 3.4, hy + 8.2); g.lineTo(hx + 5.6, hy + 8.6); g.lineTo(hx + 5.0, hy + 10.2); g.lineTo(hx + 3.6, hy + 10); g.closePath(); g.fill(); g.stroke();
        const sw = 0.5 * sin(t * 2.3) + (walk || run ? 1.2 * sin(legPh * 2) : 0);
        g.beginPath(); g.moveTo(hx + 3.8, hy + 10); g.lineTo(hx + 2.6 + sw, hy + 15.6); g.lineTo(hx + 4.0 + sw, hy + 17); g.lineTo(hx + 5.4 + sw * 0.8, hy + 15.4); g.lineTo(hx + 5.0, hy + 10.2); g.closePath(); g.fill(); g.stroke();
      }
      if (o.scarf) {
        // 白围巾（妈妈羊）：外套的布料，一道红色条纹
        const sw = 0.6 * sin(t * 2.1) + (walk || run ? 1.4 * sin(legPh * 2 + 0.5) : 0);
        g.fillStyle = '#f2ece2'; g.strokeStyle = '#8a7a6a'; g.lineWidth = 0.6;
        g.beginPath(); g.moveTo(hx - 1, hy + 7.6); g.quadraticCurveTo(hx + 4, hy + 11.2, hx + 9, hy + 6.8); g.lineTo(hx + 9.4, hy + 9.4); g.quadraticCurveTo(hx + 4, hy + 13.6, hx - 1.2, hy + 10); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(hx + 6.4, hy + 9.6); g.lineTo(hx + 8.6 + sw, hy + 16.4); g.lineTo(hx + 11 + sw, hy + 15.6); g.lineTo(hx + 8.8, hy + 9); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(hx + 7.4 + sw * 0.5, hy + 13); g.lineTo(hx + 9.8 + sw * 0.8, hy + 12.4); g.lineWidth = 0.8; g.strokeStyle = '#c23b3b'; g.stroke();
      }
      if (o.bell) {
        g.beginPath(); g.moveTo(hx + 1, hy + 6.6); g.quadraticCurveTo(hx + 6, hy + 10.6, hx + 10.4, hy + 5); g.lineWidth = 2.2; g.strokeStyle = '#d63a36'; g.stroke();
        g.beginPath(); g.arc(hx + 5.6, hy + 10.4, 2.3, 0, TAU); g.fillStyle = '#ffd66b'; g.fill(); g.lineWidth = 0.8; g.strokeStyle = '#8a5a12'; g.stroke();
      }
      if (o.bow) {
        const x = hx - 1, y = hy - 11.5, bc = typeof o.bow === 'string' ? o.bow : '#ff7fa8';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4.4, y - 2.8); g.quadraticCurveTo(x - 5.4, y, x - 4.4, y + 2.8); g.closePath(); g.moveTo(x, y); g.lineTo(x + 4.4, y - 2.8); g.quadraticCurveTo(x + 5.4, y, x + 4.4, y + 2.8); g.closePath();
        g.fillStyle = bc; g.fill(); g.lineWidth = 0.8; g.strokeStyle = C.ol; g.stroke();
        g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill(); g.stroke();
      }
    }
    // 发烫时冒热气 / 睡觉的 Z
    if (!sil && o.heat) {
      setT(g, Mw);
      g.globalAlpha *= 0.85; g.lineWidth = 1.3; g.strokeStyle = '#ff9a5a';
      for (let k = 0; k < 3; k++) { const f = fract(t * 0.8 + k * 0.33), x = SH.bx - 3 + k * 8, y = SH.by - 23 - f * 8; g.globalAlpha = (1 - f) * 0.85 * (o.alpha ?? 1); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - 2, y - 2.2, x, y - 4.4); g.quadraticCurveTo(x + 2, y - 6.6, x, y - 8.8); g.stroke(); }
      g.globalAlpha = 1 * (o.alpha ?? 1);
    }
  }

  /* ================================================================
   * 多利（羊之兽主）：一大团粉色的羊形烟云 + 深色的羊脸、金色环形的眼、黑色荆棘的冠
   * 局部坐标：高 100，脚底 y = 0，面朝右
   * ================================================================ */
  const DOLLY_PUFFS = [];
  (() => {
    const R = E.rng(41);
    const core = [[-30, -52, 26], [-8, -62, 30], [18, -58, 27], [34, -44, 22], [-40, -34, 22], [-16, -30, 27], [12, -28, 26], [30, -26, 20], [-50, -52, 16], [-24, -76, 18], [4, -82, 18], [26, -76, 17], [-44, -70, 13], [44, -60, 14]];
    for (const c of core) DOLLY_PUFFS.push([c[0], c[1], c[2], R()]);
  })();
  function drawDolly(g, o) {
    const bm = g.getTransform();
    const alpha = o.alpha == null ? 1 : clamp(o.alpha);
    if (alpha <= 0.003) return;
    const t = (o.t || 0) + (o.phase || 0), S = (o.h || 200) / 100, fx = o.flip ? -1 : 1;
    const fade = clamp(o.fade || 0), cloud = o.form === 'cloud';
    if (o.shadow === true) {
      const spr = softSprite('0,0,0', 0.25), ga0 = g.globalAlpha;
      g.globalAlpha = ga0 * alpha * (o.shadowA != null ? o.shadowA : 0.2);
      g.drawImage(spr, (o.x || 0) - 60 * S, (o.shadowY != null ? o.shadowY : (o.y || 0)) - 5 * S, 120 * S, 10 * S);
      g.globalAlpha = ga0;
    }
    const floatY = (o.pose === 'stand' ? 0 : 6 + 4 * sin(t * 0.9)) ;
    const m = [0, 0, 0, 0, 0, 0];
    tm(m, [bm.a, bm.b, bm.c, bm.d, bm.e, bm.f], o.x || 0, (o.y || 0) - floatY * S, (o.rot || 0) + 0.03 * sin(t * 0.7), S * fx, S);
    const sil = o.sil || null, ga = g.globalAlpha * alpha;
    const glowK = o.glow != null ? o.glow : 1;
    setT(g, m);
    if (!sil && glowK > 0) { E.glow(g, 0, -50, 110 * glowK, '255,170,210', 0.45 * glowK * alpha * (1 - fade * 0.5)); E.glow(g, 30, -60, 50, '255,220,235', 0.25 * glowK * alpha); }
    // 云团（背面的暗一层 + 亮面）
    const puff = (k, p, dx, dy, grow) => {
      const drift = fade * (18 + p[3] * 30);
      const a = p[3] * TAU + t * 0.1;
      const x = p[0] + dx + cos(a) * drift + 1.6 * sin(t * 0.8 + k), y = p[1] + dy + sin(a) * drift * 0.6 - fade * 10 + 1.3 * cos(t * 0.7 + k * 1.3);
      return [x, y, p[2] * grow * (1 - fade * 0.4) * (1 + 0.03 * sin(t * 1.2 + k))];
    };
    const inkW = clamp(1.6 / (S * sqrt(abs(bm.a * bm.d - bm.b * bm.c))), 0.3, 3);
    g.globalAlpha = ga * (cloud ? 0.85 : 1) * (1 - fade * 0.6);
    g.beginPath();
    for (let k = 0; k < DOLLY_PUFFS.length; k++) { const [x, y, r] = puff(k, DOLLY_PUFFS[k], 0, 2, 1.04); g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
    // 先描一圈粗线再填色：只留下外轮廓，淡入淡出时也看不到里面的圆
    if (!sil && !cloud) { g.lineWidth = inkW * 2.8; g.strokeStyle = '#c0628a'; g.stroke(); }
    g.fillStyle = sil || '#e489ac'; g.fill();
    g.beginPath();
    for (let k = 0; k < DOLLY_PUFFS.length; k++) { const [x, y, r] = puff(k, DOLLY_PUFFS[k], -1.5, -1.5, 0.94); g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
    g.fillStyle = sil || radG('dolly', -20, -80, 5, 0, -50, 70, [0, '#fff6fa', 0.45, '#ffd0e2', 1, '#f29cc0']); g.fill();
    // 飘散的小云团
    for (let k = 0; k < 7; k++) {
      const per = 5 + hash(3, k) * 3, f = fract(t / per + hash(4, k));
      const x = -55 + hash(5, k) * 110 + f * 20 * (hash(6, k) - 0.5), y = -20 - hash(7, k) * 70 - f * 26;
      const r = (4 + hash(8, k) * 5) * (1 - f * 0.6);
      g.globalAlpha = ga * sin(PI * f) * 0.7;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = sil || '#ffd6e6'; g.fill();
    }
    g.globalAlpha = ga * (1 - fade * 0.8);
    if (fade > 0.95) { g.setTransform(bm); g.globalAlpha = ga / alpha; return; }
    // 羊脸：长长的深色脸 + 垂耳
    const hx = 46, hy = -50 + 1.5 * sin(t * 1.1), look = o.look ? o.look[0] * fx : 0;
    const face = sil || '#6e5c60', faceIn = '#8a777a', earC = sil || '#5c4a4e';
    const earSw = 0.08 * sin(t * 1.6);
    g.save(); g.translate(hx - 7, hy - 12); g.rotate(0.5 + earSw);
    g.beginPath(); g.ellipse(-2, 12, 5.5, 13, 0.2, 0, TAU); g.fillStyle = earC; g.fill(); if (!sil) { g.lineWidth = inkW; g.strokeStyle = '#2a1e22'; g.stroke(); }
    g.restore();
    g.beginPath(); g.moveTo(hx - 10, hy - 16); g.bezierCurveTo(hx + 4, hy - 22, hx + 16, hy - 12, hx + 17, hy + 4); g.bezierCurveTo(hx + 18, hy + 14, hx + 8, hy + 20, hx - 1, hy + 16); g.bezierCurveTo(hx - 12, hy + 12, hx - 16, hy - 8, hx - 10, hy - 16); g.closePath();
    g.fillStyle = face; g.fill();
    if (!sil) {
      g.lineWidth = inkW; g.strokeStyle = '#2a1e22'; g.stroke();
      g.beginPath(); g.ellipse(hx + 8, hy + 10, 7, 5, -0.3, 0, TAU); g.fillStyle = faceIn; g.fill();
      g.beginPath(); g.moveTo(hx + 7, hy + 9.5); g.lineTo(hx + 9, hy + 9); g.moveTo(hx + 5, hy + 12.5); g.quadraticCurveTo(hx + 8, hy + 14, hx + 11, hy + 12); g.lineWidth = inkW * 0.8; g.stroke();
      // 金色环形的眼
      const closed = o.expr === 'closed' || o.pose === 'sleep' || blinkAt(t, 71) > 0.5;
      const ex = hx + 2 + look * 1.2, ey = hy - 4;
      if (closed) { g.beginPath(); g.moveTo(ex - 3.4, ey); g.quadraticCurveTo(ex, ey + 2.4, ex + 3.4, ey); g.lineWidth = inkW * 1.2; g.strokeStyle = '#f2b640'; g.stroke(); }
      else {
        E.glow(g, ex, ey, 9, '255,200,90', 0.5 * glowK);
        g.beginPath(); g.arc(ex, ey, 3.4, 0, TAU); g.lineWidth = 1.5; g.strokeStyle = '#f2b640'; g.stroke();
        g.beginPath(); g.arc(ex, ey, 1.6, 0, TAU); g.fillStyle = '#2a1e22'; g.fill();
        g.beginPath(); g.arc(ex - 1.2, ey - 1.4, 0.7, 0, TAU); g.fillStyle = '#fff4d8'; g.fill();
      }
    }
    // 脸的后半截埋在云里：几团小云盖住后脑和脖子
    g.beginPath();
    for (const [dx, dy, r] of [[-19, 6, 7], [-18, -6, 6], [-13, 16, 6.5], [-20, -16, 5]]) { const x = hx + dx + 0.8 * sin(t * 0.9 + dx), y = hy + dy + 0.6 * cos(t * 0.8 + dy); g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
    if (!sil && !cloud) { g.lineWidth = inkW * 2.4; g.strokeStyle = '#c0628a'; g.stroke(); }
    g.fillStyle = sil || radG('dolly2', hx - 18, hy - 14, 2, hx - 10, hy, 20, [0, '#fff6fa', 0.5, '#ffd0e2', 1, '#f29cc0']); g.fill();
    // 黑色荆棘的冠
    const tines = [[-6, -0.5, 16], [-1, -0.2, 24], [4, 0.12, 20], [9, 0.45, 13], [-10, -0.9, 10]];
    for (const [dx, a, len] of tines) {
      const x0 = hx + dx * 0.8, y0 = hy - 17 + abs(dx) * 0.15, ang = -HP + a;
      const x1 = x0 + cos(ang) * len, y1 = y0 + sin(ang) * len;
      g.beginPath(); g.moveTo(x0 - 1.2, y0); g.lineTo(x1, y1); g.lineTo(x0 + 1.2, y0); g.closePath();
      g.fillStyle = sil || '#1c1418'; g.fill();
      if (!sil) {
        g.beginPath(); g.moveTo(lerp(x0, x1, 0.45), lerp(y0, y1, 0.45)); g.lineTo(lerp(x0, x1, 0.45) + cos(ang + 0.9) * len * 0.3, lerp(y0, y1, 0.45) + sin(ang + 0.9) * len * 0.3);
        g.moveTo(lerp(x0, x1, 0.62), lerp(y0, y1, 0.62)); g.lineTo(lerp(x0, x1, 0.62) + cos(ang - 0.9) * len * 0.24, lerp(y0, y1, 0.62) + sin(ang - 0.9) * len * 0.24);
        g.lineWidth = 0.9; g.strokeStyle = '#1c1418'; g.stroke();
        g.beginPath(); g.arc(lerp(x0, x1, 0.3), lerp(y0, y1, 0.3), 0.7, 0, TAU); g.fillStyle = '#e03a3a'; g.fill();
      }
    }
    // 云底下露出的小腿
    if (o.pose === 'stand' || o.pose === 'walk') {
      const ph = o.pose === 'walk' ? t * 6 : 0;
      g.lineCap = 'round';
      for (const [x, p] of [[-26, 0], [-10, PI], [16, PI], [30, 0]]) { g.beginPath(); g.moveTo(x, -14); g.lineTo(x + 2.5 * sin(ph + p), -1.5); g.lineWidth = 4.2; g.strokeStyle = sil || '#5c4a4e'; g.stroke(); }
    }
    g.setTransform(bm);
    g.globalAlpha = ga / alpha;
  }

  /* ================================================================
   * 路人：简化的剪影（按 seed 变化：外套 / 裙子 / 小孩 / 老人；泰拉各族的耳朵、角、光环、帽子）
   * ================================================================ */
  const CROWD_COL = ['#6a5f78', '#7a6a5a', '#5a6a7a', '#8a6a6a', '#5f7a6a', '#7a7a8a', '#6a5a4a', '#8a7a9a'];
  /* ---- 路人（大尺寸时）：按 seed 生成一个完整的人物设定，用同一套骨架画 ---- */
  const CROWD_HAIR = [
    { c: '#4a3a32', sh: '#2e221c', lt: '#6e5648', tip: '#5a463c', ink: '#1e140f' },
    { c: '#6e4a34', sh: '#4a3020', lt: '#94684c', tip: '#7e5a42', ink: '#2a180e' },
    { c: '#2f2b33', sh: '#1c1920', lt: '#4c4652', tip: '#3a3640', ink: '#0e0c10' },
    { c: '#caa066', sh: '#9c7640', lt: '#e8c890', tip: '#d8b27a', ink: '#5a4020' },
    { c: '#9a4a30', sh: '#6e2e1c', lt: '#c46a48', tip: '#b05a3a', ink: '#3a160a' },
    { c: '#8a8a96', sh: '#62626e', lt: '#b0b0bc', tip: '#9a9aa6', ink: '#34343e' },
    { c: '#dcd6ce', sh: '#aca69e', lt: '#f4f0ea', tip: '#e6e0d8', ink: '#5a5650' },
    { c: '#3c4a66', sh: '#262f44', lt: '#56688a', tip: '#465676', ink: '#121826' },
  ];
  const CROWD_CLOTH = ['#5e6f8c', '#8c5e5e', '#6f8c6a', '#8c7a5a', '#6a5e8c', '#4e5a6a', '#9a7a6a', '#5a7a82', '#a0885e', '#7a4e62', '#c8b89a', '#3e4452'];
  const CROWD_BANGS = [
    [[-1.1, 0.12, 0.1], [-0.7, 0.2, 0.2], [-0.3, 0.06, 0.3], [0.1, 0.18, 0.3], [0.5, 0.08, 0.25], [0.9, 0.16, 0.15]],
    [[-1.1, 0.3, -0.2], [-0.62, 0.3, -0.3], [-0.16, 0.26, -0.3], [0.3, 0.3, -0.3], [0.76, 0.28, -0.2], [1.1, 0.3, -0.1]],
    [[-1.1, 0.24, 0.3], [-0.72, -0.1, 0.6], [-0.3, -0.2, 0.7], [0.1, -0.16, 0.7], [0.5, 0.06, 0.55], [0.9, 0.26, 0.4]],
    [[-1.1, 0.02, 0.1], [-0.6, -0.08, 0.1], [0, -0.14, 0.1], [0.6, -0.08, 0.1], [1.1, 0.02, 0.1]],
  ];
  function crowdSpec(seed, color) {
    const key = 'crowd#' + seed + (color ? '#' + color : '');
    if (CH[key]) return key;
    const r = (k) => hash(seed * 31 + 7, k, 5);
    const pick = (arr, k) => arr[floor(r(k) * arr.length) % arr.length];
    const body = pick(['man', 'woman', 'man', 'woman', 'teen', 'teenM', 'elder', 'child', 'woman', 'man'], 1);
    const old = body === 'elder' || r(2) < 0.12;
    const hp = old ? CROWD_HAIR[pick([5, 6, 6], 3)] : CROWD_HAIR[floor(r(3) * 6)];
    const fem = BODIES[body].fem;
    const style = fem ? pick(['long', 'bob', 'pony', 'bob', 'long'], 4) : pick(['short', 'short', 'bob'], 4);
    const len = style === 'long' ? 2.0 + r(5) * 0.5 : style === 'bob' ? 1.28 : 1.0;
    const hair = {
      pal: hp, cap: 1.1, side: style === 'short' ? 0.62 : 0.84, sideW: 0.12, part: 0, curly: r(6) < 0.35 ? 1 : 0,
      bangs: CROWD_BANGS[floor(r(7) * CROWD_BANGS.length)],
      back: { len, w: style === 'long' ? 1.12 : 1.04, n: 5, wave: 0.04 + r(8) * 0.05, top: -0.15 },
      locks: style === 'long' && r(9) < 0.6 ? { len: 1.5, w: 0.2, psi: 1.36, y0: 0.44, wave: 0.05 } : null,
      ahoge: r(10) < 0.25 ? { psi: 0.1, len: 0.35, curl: 1 } : null,
      pony: style === 'pony' ? { psi: 3.14, y: 0.3, len: 1.9, w: 0.36, low: true, bow: null } : null, braid: null,
    };
    const sp = pick(['human', 'human', 'sheep', 'rabbit', 'fox', 'cat', 'feather', 'halo', 'wolf', 'bear', 'human'], 11);
    const c1 = color || pick(CROWD_CLOTH, 12), c2 = pick(CROWD_CLOTH, 13), c3 = pick(['#3a3844', '#4e4a44', '#5a5e6a', '#6a5a4a'], 14);
    const kind = pick(fem ? ['dress', 'coat', 'sweater', 'apron', 'dress'] : ['coat', 'suit', 'sweater', 'coat'], 15);
    const O = { top: c1, sleeve: [c1, c1], collar: { type: 'shirt', c: '#f4f2ee' }, shoes: { c: pick(['#4a3a30', '#2a2428', '#6a4a36'], 16), sole: '#1e1814', type: pick(['shoe', 'boot'], 17) } };
    if (kind === 'dress') { O.skirt = { c: c1, len: 0.5 + r(18) * 0.3, flare: 3.4, hem: 'plain', trim: dk(c1, 0.2) }; O.legs = { c: ['#f6e6dc', '#f6e6dc', r(19) < 0.5 ? '#3a3440' : '#f6e6dc'] }; if (r(20) < 0.5) O.cardigan = { c: c2 }; }
    else if (kind === 'apron') { O.skirt = { c: c1, len: 0.62, flare: 3, hem: 'plain', trim: c1 }; O.apron = '#f7f4ee'; O.bib = { c: '#f7f4ee' }; O.legs = { c: ['#f6e6dc', '#f6e6dc', '#f6e6dc'] }; }
    else if (kind === 'coat') { O.coat = { c: c2, sh: dk(c2, 0.15), lining: dk(c2, 0.3), len: 0.5 + r(21) * 0.2, open: 0.3, stripes: null, tatter: false }; O.sleeve = [c2, c2]; O.pants = { c: c3, w: [5.0, 4.4] }; if (fem && r(22) < 0.5) { O.pants = null; O.skirt = { c: c3, len: 0.45, flare: 2, hem: 'plain', trim: c3 }; O.legs = { c: ['#3a3440', '#3a3440', '#3a3440'] }; } }
    else if (kind === 'suit') { O.top = '#f6f4ef'; O.vest = { c: c1 }; O.sleeve = ['#f6f4ef', '#f6f4ef']; O.neck = { tie: c2 }; O.pants = { c: c3, w: [5.2, 4.6] }; }
    else { O.knit = dk(c1, 0.2); O.collar = { type: 'turtle', c: c1 }; O.pants = { c: c3, w: [5.0, 4.4] }; }
    if (body === 'child') { O.pants = null; O.skirt = fem ? { c: c1, len: 0.4, flare: 3, hem: 'plain', trim: c1 } : null; if (!fem) O.pants = { c: c3, w: [4.6, 4.2] }; O.legs = { c: ['#f6e6dc', '#f6e6dc', '#fbfaf6'], sock: 0.3 }; O.coat = null; O.sleeve = [c1, c1]; }
    if (r(23) < 0.18 && !old) O.hat = null;
    if (r(24) < 0.25) O.bag = { c: pick(['#6a4a36', '#3a3440', '#8a6a4a'], 25), dev: '#c8b89a' };
    const spec = {
      body, skin: r(26) < 0.2 ? SKIN_K : SKIN, eye: pick([EYES.katia, EYES.fontaine, EYES.liese, EYES.keller, EYES.adele], 27), eyeS: [0.94, 0.9],
      horn: sp === 'sheep' ? { pal: pick([HORNS.adele, HORNS.katia, HORNS.magna], 28), r: 0.42, turn: 1.4, out: 0.36, w: 0.25, psi: 1.1, y: -0.62 } : null,
      ear: sp === 'sheep' ? 'sheep' : sp === 'rabbit' ? 'rabbit' : sp === 'feather' ? 'feather' : sp === 'fox' || sp === 'cat' || sp === 'wolf' || sp === 'bear' ? 'animal' : 'human',
      animal: sp, sheepEar: 0.9, feather: { c: dk(hp.c, 0.3), tip: hp.lt },
      halo: sp === 'halo' ? { c: '#ffe38a', glow: '255,226,140' } : null,
      glasses: r(29) < (old ? 0.6 : 0.18) ? { shape: r(30) < 0.5 ? 'round' : 'rect', c: '#3a2a2a', thin: 1 } : null,
      wrinkles: old, hair, def: 'default', outfits: { default: O }, seed: seed % 97,
    };
    if (O.bag) { spec.outfits.default.strap = O.bag.c; }
    CH[key] = spec;
    return key;
  }
  function drawCrowd(g, o) {
    const bm0 = g.getTransform();
    const hpx = (o.h || 280) * sqrt(abs(bm0.a * bm0.d - bm0.b * bm0.c));
    if (hpx >= 90 && !o.simple) {
      const key = crowdSpec((o.seed != null ? o.seed : 1) | 0, o.color || null);
      const o2 = o.outfit ? Object.assign({}, o, { outfit: undefined }) : o;
      if (CH[key].outfits.default.bag && !hasProp(o, 'bag')) return drawHuman(g, key, Object.assign({}, o2, { prop: o.prop ? [].concat(o.prop, 'bag') : 'bag' }));
      return drawHuman(g, key, o2);
    }
    return drawCrowdSimple(g, o);
  }
  function drawCrowdSimple(g, o) {
    const bm = g.getTransform();
    const t = (o.t || 0) + (o.phase || 0), seed = (o.seed != null ? o.seed : 1) | 0;
    const hv = hash(seed, 1), kind = floor(hash(seed, 2) * 5), acc = floor(hash(seed, 3) * 7);
    const kid = kind === 3;
    const S = (o.h || 280) / 100 * (kid ? 0.66 : 0.92 + hv * 0.14);
    const fx = o.flip ? -1 : 1;
    const m = [0, 0, 0, 0, 0, 0];
    tm(m, [bm.a, bm.b, bm.c, bm.d, bm.e, bm.f], o.x || 0, o.y || 0, o.rot || 0, S * fx, S);
    setT(g, m);
    const alpha = o.alpha == null ? 1 : clamp(o.alpha);
    const ga = g.globalAlpha;
    g.globalAlpha = ga * alpha;
    const col = o.sil || o.color || CROWD_COL[seed % CROWD_COL.length];
    const dark = o.sil || dk(col, 0.35), light = o.sil || lt(col, 0.18), skin = o.sil || '#e8d2c4';
    const pose = o.pose || 'stand', walk = pose === 'walk' || pose === 'walk-away', run = pose === 'run' || pose === 'run-away';
    const side = o.view === 'front' || o.view === 'back' ? 0 : 1;
    const ph = TAU * (run ? 1.4 : 0.92) * (o.speed || 1) * t + seed;
    const A = walk ? 0.38 : run ? 0.7 : 0;
    const bob = walk ? abs(cos(ph)) * 1.2 : run ? abs(cos(ph)) * 2.6 : 0.3 * sin(t * 1.6 + seed);
    const hipY = -40 - bob + (kind === 4 ? 2 : 0);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // 腿
    for (let i = 0; i < 2; i++) {
      const a = side ? A * sin(ph + i * PI) : 0, lx = side ? 0 : (i ? -3.2 : 3.2);
      const k = side ? max(0, cos(ph + i * PI + 0.3)) * (run ? 1.2 : 0.6) : 0;
      const kx = lx + sin(a) * 19, ky = hipY + cos(a) * 19;
      const fx2 = kx + sin(a - k) * 18, fy = ky + cos(a - k) * 18;
      g.beginPath(); g.moveTo(lx, hipY); g.lineTo(kx, ky); g.lineTo(fx2, min(fy, -1.5));
      g.lineWidth = 5; g.strokeStyle = dark; g.stroke();
      g.beginPath(); g.ellipse(fx2 + (side ? 1.6 : 0), min(fy, -1.5) + 0.6, side ? 3.2 : 2.4, 1.8, 0, 0, TAU); g.fillStyle = dark; g.fill();
    }
    // 身体
    const W = kind === 1 ? 9 : 7.5, top = hipY - 22;
    g.beginPath();
    if (kind === 1) { g.moveTo(-6.5, top); g.quadraticCurveTo(-9, hipY - 4, -W - 2, hipY + 14); g.lineTo(W + 2, hipY + 14); g.quadraticCurveTo(9, hipY - 4, 6.5, top); }
    else if (kind === 0 || kind === 4) { g.moveTo(-7, top); g.lineTo(-W, hipY + (kind === 0 ? 10 : 4)); g.lineTo(W, hipY + (kind === 0 ? 10 : 4)); g.lineTo(7, top); }
    else { g.moveTo(-6.5, top); g.lineTo(-7, hipY + 2); g.lineTo(7, hipY + 2); g.lineTo(6.5, top); }
    g.closePath(); g.fillStyle = col; g.fill();
    // 手臂
    for (let i = 0; i < 2; i++) {
      const a = side ? -A * sin(ph + i * PI) * 0.9 : 0.12 * (i ? -1 : 1);
      const sx = side ? 0 : (i ? -7 : 7);
      g.beginPath(); g.moveTo(sx, top + 2); g.lineTo(sx + sin(a) * 16, top + 2 + cos(a) * 16);
      g.lineWidth = 4.4; g.strokeStyle = i ? dark : light; g.stroke();
    }
    // 头
    const hy = top - 13, hr = 11;
    g.beginPath(); g.arc(0, hy, hr, 0, TAU); g.fillStyle = o.sil || (o.view === 'back' ? dk(col, 0.5) : skin); g.fill();
    g.beginPath(); g.arc(0, hy - 2, hr + 0.8, PI * 1.02, PI * 1.98); g.lineTo(side ? -hr : hr * 0.9, hy + 2); g.closePath(); g.fillStyle = o.sil || dk(col, 0.55); g.fill();
    // 各族特征
    g.fillStyle = o.sil || dk(col, 0.55); g.strokeStyle = g.fillStyle; g.lineWidth = 3;
    if (acc === 0) { g.beginPath(); g.moveTo(-6, hy - 8); g.lineTo(-10, hy - 19); g.lineTo(-2, hy - 10); g.moveTo(6, hy - 8); g.lineTo(10, hy - 19); g.lineTo(2, hy - 10); g.fill(); }
    else if (acc === 1) { g.beginPath(); g.arc(-9, hy - 6, 5, PI * 0.9, PI * 1.9); g.stroke(); g.beginPath(); g.arc(9, hy - 6, 5, PI * 1.1, PI * 0.1); g.stroke(); }
    else if (acc === 2) { g.beginPath(); g.ellipse(0, hy - 10, 13, 3, 0, 0, TAU); g.fill(); g.beginPath(); g.rect(-7, hy - 18, 14, 8); g.fill(); }
    else if (acc === 3 && !o.sil) { g.beginPath(); g.ellipse(0, hy - 17, 7, 2, 0, 0, TAU); g.lineWidth = 1.4; g.strokeStyle = '#ffe38a'; g.stroke(); }
    else if (acc === 4) { g.beginPath(); g.ellipse(-4, hy - 17, 2.2, 7, -0.2, 0, TAU); g.ellipse(4, hy - 17, 2.2, 7, 0.2, 0, TAU); g.fill(); }
    // 伞 / 包 / 手杖
    if (hash(seed, 9) < 0.18 && !kid) { g.beginPath(); g.moveTo(8, top + 10); g.lineTo(8, hy - 20); g.lineWidth = 1; g.strokeStyle = dark; g.stroke(); g.beginPath(); g.moveTo(-8, hy - 16); g.quadraticCurveTo(8, hy - 34, 24, hy - 16); g.closePath(); g.fillStyle = o.sil || lt(col, 0.35); g.fill(); }
    else if (hash(seed, 9) < 0.4) { g.beginPath(); g.rect(-11, hipY - 6, 6, 7); g.fillStyle = o.sil || dk(col, 0.2); g.fill(); }
    if (o.rim && !o.sil) { /* 路人只做剪影轮廓光 */ }
    if (o.rim) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = ga * alpha * 0.5; g.lineWidth = 1.2; g.strokeStyle = 'rgb(' + o.rim + ')'; g.beginPath(); g.arc(0, hy, hr, PI * 1.1, PI * 1.9); g.stroke(); g.globalCompositeOperation = 'source-over'; }
    g.globalAlpha = ga;
    g.setTransform(bm);
  }

  /* ================================================================
   * 对外接口
   * ================================================================ */
  let warned = 0;
  const api = { meta: META, placeholder: false, version: 1, lastMs: 0 };
  function draw(g, who, o) {
    o = o || {};
    const t0 = performance.now();
    g.save();
    try {
      if (who === 'sheep-black' || who === 'sheep-pink') drawSheep(g, who, o);
      else if (who === 'dolly') drawDolly(g, o);
      else if (who === 'crowd' || !CH[who]) drawCrowd(g, o);
      else drawHuman(g, who, o);
    } catch (e) {
      if (warned < 3) { warned++; console.warn('[MV cast]', who, o && o.pose, e); }
    }
    g.restore();
    api.lastMs = performance.now() - t0;
  }
  function anchors(who, o) {
    o = o || {};
    try {
      if (CH[who]) return anchorsHuman(who, o);
    } catch (e) { if (warned < 3) { warned++; console.warn('[MV cast] anchors', who, e); } }
    // 羊 / 多利 / 路人：粗略的关键点
    const h = o.h || (who === 'dolly' ? 200 : who === 'crowd' ? 280 : 90), x = o.x || 0, y = o.y || 0, f = o.flip ? -1 : 1;
    if (who === 'dolly') return { head: [x + 46 * f * h / 100, y - 60 * h / 100], face: [x + 48 * f * h / 100, y - 54 * h / 100], top: [x, y - 100 * h / 100], chest: [x, y - 50 * h / 100], feet: [x, y], prop: null, bounds: [x - 60 * h / 100, y - 110 * h / 100, x + 70 * h / 100, y] };
    if (who === 'crowd') return { head: [x, y - 0.85 * h], top: [x, y - h], chest: [x, y - 0.55 * h], feet: [x, y], prop: null, bounds: [x - 0.2 * h, y - h, x + 0.2 * h, y] };
    const S = h / 54;
    return { head: [x + 17 * f * S, y - 23 * S], face: [x + 18 * f * S, y - 22 * S], top: [x, y - 40 * S], chest: [x + 8 * f * S, y - 16 * S], feet: [x, y], prop: null, bounds: [x - 30 * S, y - 42 * S, x + 27 * S, y] };
  }
  function gait(who, o) {
    o = o || {};
    const run = o.pose === 'run' || o.pose === 'run-away', sp = o.speed > 0 ? o.speed : 1;
    if (who === 'sheep-black' || who === 'sheep-pink') {
      const S = (o.h || 90) / 54, cyc = (run ? 2.4 : 1.6) * sp, stride = (run ? 4.2 : 2.6) * 4;
      return { speed: stride * cyc * S, period: 1 / cyc, stride: stride * S };
    }
    if (who === 'crowd') { const S = (o.h || 280) / 100, cyc = (run ? 1.4 : 0.92) * sp; const stride = 4 * 37 * sin(run ? 0.7 : 0.38); return { speed: stride * cyc * S, period: 1 / cyc, stride: stride * S }; }
    const C = CH[who];
    if (!C) return { speed: 0, period: 1, stride: 0 };
    const B = BODIES[C.body], L = B.thigh + B.shin, cyc = (run ? 1.38 : 0.92) * sp, amp = run ? 0.72 : 0.4;
    const yaw = o.yaw != null ? o.yaw : VIEW[o.view] != null ? VIEW[o.view] : VIEW[(PRESET[o.pose] || {}).view] != null ? VIEW[PRESET[o.pose].view] : VIEW.three;
    const S = (o.h || 300) / 100, stride = 4 * L * sin(amp) * (run ? 1.15 : 1);
    return { speed: stride * cyc * S * abs(sin(yaw)), period: 1 / cyc, stride: stride * S * abs(sin(yaw)) };
  }
  Object.assign(api, {
    draw, anchors, gait,
    poses: Object.keys(PRESET),
    exprs: Object.keys(EXPR),
    props: ['satchel', 'staff', 'cassette', 'popsicle', 'letter', 'stone', 'wreath', 'wreaths', 'book', 'notebook', 'lantern', 'backpack', 'flower', 'trowel', 'soda', 'cello', 'recorder', 'hammer', 'suitcase', 'umbrella', 'basket', 'tie', 'lamb', 'lamb-pink', 'mug', 'box', 'bag', 'camera', 'map'],
    outfits: Object.fromEntries(Object.entries(CH).map(([k, c]) => [k, Object.keys(c.outfits)])),
    views: Object.keys(VIEW),
    _internal: { CH, BODIES, PRESET },
  });
  E.cast = api;
})();
