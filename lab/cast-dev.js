/* =========================================================
 * MV 角色库 v2 —— Q 版角色（墨线 + 两色赛璐璐，照官方立绘 / 小人的配色与五官画）
 * 几支 MV 共用。所有动作都是 t 的纯函数（不存状态），可以任意跳帧。
 * v2：成人 1:3.1–3.3 头身、小孩 1:2.25；每个人有自己的脸型 / 眼型 / 眉 / 鼻 / 嘴；
 *     头发是一绺一绺的（刘海、鬓发、后发、发梢卷曲）；躯干有胸和背的厚度、四肢是锥形的；
 *     裙摆 / 大衣下摆跟着腿走（坐下时搭在大腿上）；走 / 跑时着地的脚不打滑。
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
 *                 | 'fiddle'（拉小提琴：琴架在远侧肩上，配合 prop 'violin'；琴的位置见 anchors().prop）
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
 *                 | 'bag'（挎包）| 'camera' | 'map' | 'violin'（小提琴：pose 'fiddle' 时架在肩上拉，否则提在手里）
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
 *     light       两色赛璐璐的主光方向：'left'（默认，左上）| 'right' | 'top' | 'none'（不画阴影面）| 角度（屏幕弧度）
 *                 不给 light 但给了 rim + rimDir 时，阴影面自动放在背着 rimDir 的那一侧
 *     shade       0..1 阴影面的浓度（默认 1）
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
 * MVE.cast.anchors(who, o) → { head, face, eyeN, eyeF, mouth, top, chest, hip, handN, handF, prop, feet, bounds,
 *                               chin, neck, shoulderN, shoulderF, elbowN, elbowF, kneeN, kneeF, footN, footF, headR }
 *     同一坐标系（和 o.x / o.y 一样）里的关键点，方便贴光效（灯笼的光、石头的光、法杖尖）；headR = 颅骨半径（像素）
 * MVE.cast.gait(who, o) → { speed, period, stride }：走 / 跑时脚底不打滑的横向速度（像素 / 秒）
 * MVE.cast.poses / exprs / props / outfits / views：可用值列表
 * MVE.cast.lastMs：最近一次 draw 的 CPU 毫秒数（调试用）
 *
 * MVE.cast.gait(who, o).speed 就是“着地的脚在画面上不动”所需的横向速度（v2 的步子比 v1 小一些）
 *
 * 性能：典型尺寸下每次 draw ≈ 0.1–0.3ms（胸像 / 剪影 + 逆光 / alpha 淡出更贵一些；羊 ≈ 0.04ms；
 * 远景路人剪影 ≈ 0.02ms）。不用 shadowBlur / filter；Path2D 与渐变都有缓存；细节等级按屏幕像素高度自动切换。
 * 实验页：lab/cast.html（?sheet=turn | outfits | poses | expr | busts | walk | sil | sizes | props | sheep | sheepbig
 * | group | yaw | one | perf | bench），说明见该页开头的注释。
 * ========================================================= */
(() => {
  'use strict';
  const E = window.MVE;
  if (!E) return;
  const PI = Math.PI, TAU = PI * 2, HP = PI / 2;
  const { sin, cos, abs, min, max, sqrt, atan2, hypot, floor, pow, exp } = Math;
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
   *   头身比：小孩 ≈ 1:2.25，少年少女 1:2.4–2.6，大人 1:3.1–3.3（官方 Q 版小人的比例）
   *   W：躯干五个截面（髋 → 肩）的半宽；DF / DB：向前 / 向后的半厚（胸口比背更鼓）；FO：截面中心前后偏移
   *   armW：[肩, 肘, 腕] 全宽；legW：[大腿, 小腿, 膝, 踝] 全宽
   *   seatDef / deskSit / deskStand：v1 的默认座高与桌高（保持不变，影片里的椅子才对得上）
   * ================================================================ */
  const RING_U = [0, 0.28, 0.52, 0.78, 1];
  function mkBody(b, capTop, chin) {
    const R = 100 / b.heads / 2.08;
    const headY = -100 + capTop * R, chinY = headY + chin * R;
    const shY = chinY + b.neck;
    const hipY = -b.leg;
    const T = hipY - shY;
    const ank = b.leg * 0.085;
    const thigh = (b.leg - ank) * 0.52, shin = (b.leg - ank) * 0.48;
    const Dp = b.DF.map((f, i) => (f + b.DB[i]) / 2);
    return Object.assign({ R, headY, chinY, shY, hipY, T, ank, thigh, shin, Dp, capTop, chin }, b);
  }
  const BODY = {
    child: { heads: 2.25, leg: 30, neck: 1.7, W: [7.3, 6.9, 6.9, 7.4, 8.2], DF: [5.4, 5.3, 5.3, 5.5, 4.9], DB: [5.6, 5.0, 4.8, 4.9, 4.7], FO: [-0.3, 0.1, 0.3, 0.4, -0.2], shJ: 7.9, up: 9.4, fo: 8.4, hand: 2.9, armW: [4.7, 3.9, 3.4], hipJ: 3.6, legW: [5.8, 4.7, 4.4, 3.5], foot: 5.8, fem: 1, seatDef: 16.05, deskSit: 29.06, deskStand: 39.54 },
    teen: { heads: 2.45, leg: 36.5, neck: 2.0, W: [7.5, 6.6, 6.3, 7.4, 8.9], DF: [5.6, 5.0, 4.9, 5.8, 5.0], DB: [5.8, 4.8, 4.5, 4.9, 4.8], FO: [-0.4, 0.1, 0.4, 0.8, -0.2], shJ: 8.6, up: 10.3, fo: 9.2, hand: 2.55, armW: [4.4, 3.5, 3.0], hipJ: 3.6, legW: [5.8, 4.4, 4.2, 3.2], foot: 6.0, fem: 1, seatDef: 19.16, deskSit: 32.15, deskStand: 45.52 },
    teenM: { heads: 2.6, leg: 39, neck: 2.3, W: [7.5, 7.1, 7.3, 8.3, 9.6], DF: [5.4, 5.2, 5.3, 5.8, 5.2], DB: [5.6, 5.1, 5.0, 5.4, 5.1], FO: [-0.3, 0, 0.3, 0.5, -0.2], shJ: 9.2, up: 10.8, fo: 9.6, hand: 2.55, armW: [4.5, 3.6, 3.1], hipJ: 3.8, legW: [5.8, 4.5, 4.3, 3.3], foot: 6.2, fem: 0, seatDef: 19.67, deskSit: 32.41, deskStand: 46.36 },
    young: { heads: 2.6, leg: 38.5, neck: 2.3, W: [7.6, 6.5, 6.1, 7.5, 9.0], DF: [5.7, 5.0, 4.8, 6.1, 5.1], DB: [5.9, 4.8, 4.4, 4.9, 4.8], FO: [-0.5, 0.1, 0.5, 1.0, -0.2], shJ: 8.9, up: 10.7, fo: 9.5, hand: 2.45, armW: [4.3, 3.4, 2.9], hipJ: 3.7, legW: [5.9, 4.4, 4.3, 3.2], foot: 6.0, fem: 1, seatDef: 21.22, deskSit: 34.10, deskStand: 49.45 },
    woman: { heads: 3.1, leg: 41.5, neck: 3.0, W: [8.1, 6.7, 6.3, 7.9, 9.5], DF: [6.1, 5.2, 4.9, 6.6, 5.3], DB: [6.3, 5.0, 4.6, 5.1, 5.0], FO: [-0.6, 0.1, 0.6, 1.3, -0.2], shJ: 9.3, up: 12.0, fo: 10.6, hand: 2.35, armW: [4.4, 3.3, 2.8], hipJ: 3.9, legW: [6.3, 4.5, 4.4, 3.2], foot: 6.3, fem: 1, seatDef: 21.22, deskSit: 34.10, deskStand: 49.45 },
    man: { heads: 3.3, leg: 42.5, neck: 3.4, W: [8.3, 8.1, 8.5, 9.9, 11.3], DF: [6.1, 5.9, 6.2, 7.0, 6.0], DB: [6.2, 5.8, 5.9, 6.4, 6.0], FO: [-0.3, 0, 0.3, 0.6, -0.3], shJ: 10.7, up: 12.6, fo: 11.2, hand: 2.65, armW: [5.1, 4.0, 3.4], hipJ: 4.3, legW: [6.8, 5.1, 5.0, 3.8], foot: 6.9, fem: 0, seatDef: 22.0, deskSit: 34.74, deskStand: 50.86 },
    elder: { heads: 3.2, leg: 42.5, neck: 3.2, W: [7.7, 6.7, 6.5, 7.9, 9.3], DF: [5.8, 5.1, 4.9, 6.2, 5.2], DB: [6.0, 5.0, 4.7, 5.2, 5.1], FO: [-0.4, 0.1, 0.5, 0.9, -0.2], shJ: 9.3, up: 12.2, fo: 10.8, hand: 2.35, armW: [4.4, 3.3, 2.8], hipJ: 3.9, legW: [6.1, 4.5, 4.4, 3.3], foot: 6.5, fem: 1, seatDef: 22.26, deskSit: 35.19, deskStand: 51.49 },
    kid: { heads: 2.3, leg: 31, neck: 1.7, W: [7.2, 6.8, 6.8, 7.3, 8.1], DF: [5.3, 5.2, 5.2, 5.3, 4.8], DB: [5.5, 4.9, 4.7, 4.8, 4.6], FO: [-0.3, 0.1, 0.3, 0.3, -0.2], shJ: 7.8, up: 9.3, fo: 8.3, hand: 2.85, armW: [4.6, 3.8, 3.3], hipJ: 3.5, legW: [5.7, 4.6, 4.3, 3.4], foot: 5.8, fem: 1, seatDef: 16.05, deskSit: 29.06, deskStand: 39.54 },
  };

  /* ================================================================
   * 调色板（照官方立绘 / 小人取色）
   * ================================================================ */
  const SKIN = { c: '#fff1e8', sh: '#f3cfc2', sh2: '#e6b4a8', ink: '#9a5c4e', blush: '255,128,130', mouth: '#7b2733', tongue: '#ee8a8c', lip: '#d88a86' };
  const SKIN_K = { c: '#fcefe8', sh: '#ecccc0', sh2: '#dcb2a6', ink: '#8a5a50', blush: '236,150,146', mouth: '#6e2a30', tongue: '#e08888', lip: '#c88880' };
  const HAIR = {
    caster: { c: '#9a7c6a', sh: '#6c5244', dk: '#523c32', lt: '#c8ab98', tip: '#dca0a2', ink: '#4a2e26' },
    alter: { c: '#9d7f6c', sh: '#6e5446', dk: '#553e34', lt: '#ceb4a2', tip: '#e97683', ink: '#4a2e26' },
    child: { c: '#a8826a', sh: '#7a5a48', dk: '#5e4234', lt: '#d4b69e', tip: '#caa28c', ink: '#4e3024' },
    magna: { c: '#8f604c', sh: '#633f31', dk: '#4b2e24', lt: '#bf8f76', tip: '#a06c56', ink: '#3e2218' },
    katia: { c: '#5e4034', sh: '#3e2a22', dk: '#2c1d17', lt: '#906c5a', tip: '#6a4a3c', ink: '#21140e' },
    fontaine: { c: '#8e929b', sh: '#60646d', dk: '#4a4d55', lt: '#cdd1d9', tip: '#9ca0a8', ink: '#303238' },
    liese: { c: '#b4613a', sh: '#843f20', dk: '#662e16', lt: '#df8d5a', tip: '#e59a66', ink: '#4c2110' },
    keller: { c: '#dfdfe5', sh: '#a9a9b6', dk: '#8a8a98', lt: '#ffffff', tip: '#ececf2', ink: '#5a5a6e' },
  };
  // 虹膜：top 上沿深色 → mid → bot 下部亮色；pupil 瞳孔；ring 描边；lash 睫毛；hi2 下部反光
  const EYES = {
    adele: { top: '#561426', mid: '#b24a62', bot: '#f59faa', pupil: '#380816', ring: '#4a0e1e', lash: '#2e1612', hi2: '#ffdde3' },
    child: { top: '#5e1628', mid: '#c0485c', bot: '#f8a2a8', pupil: '#3c0818', ring: '#4e0e1e', lash: '#301612', hi2: '#ffe0e4' },
    magna: { top: '#551822', mid: '#a84654', bot: '#ea949c', pupil: '#360a12', ring: '#44101a', lash: '#2c1612', hi2: '#ffd8dc' },
    katia: { top: '#4a2622', mid: '#9a5e56', bot: '#e2b2a4', pupil: '#2a1210', ring: '#3a1a16', lash: '#1e1210', hi2: '#ffe4dc' },
    keller: { top: '#3c3f4a', mid: '#7d818f', bot: '#c9cdd7', pupil: '#1e2028', ring: '#2e3240', lash: '#3a3a46', hi2: '#f2f4f8' },
    fontaine: { top: '#3a4618', mid: '#8ba03c', bot: '#dfee8c', pupil: '#1e2608', ring: '#2e3a10', lash: '#2a2c30', hi2: '#f2ffd4' },
    liese: { top: '#1a4e34', mid: '#389a5e', bot: '#98dea6', pupil: '#0c2818', ring: '#154028', lash: '#3a1c10', hi2: '#dcffe6' },
    crowd: { top: '#3a2a22', mid: '#7a5a48', bot: '#c8a488', pupil: '#1e140e', ring: '#2e1e16', lash: '#2a1a14', hi2: '#fff0dc' },
  };
  // 角：spiral = 阿黛尔（白色、带节、向外向下弯成钩）；big = 玛格娜（大卷角）；bar = 卡提亚（深灰、向后向下、角尖向外翘）
  const HORNS = {
    adele: { c0: '#fcfaf6', c1: '#dcd5ce', c2: '#aaa19b', ink: '#6f6761' },
    magna: { c0: '#e6d9cd', c1: '#bfac9a', c2: '#8f7d6d', ink: '#5a4c42' },
    katia: { c0: '#8a807b', c1: '#5c5350', c2: '#a8a09c', ink: '#2c2624' },
  };
  const EARS = {
    adele: { c: '#fbf3ec', in: '#f3adb2', ink: '#9a6a5c' },
    child: { c: '#d8b4a2', in: '#f0a4a8', ink: '#7a4e40' },
    magna: { c: '#bc9684', in: '#eab0b0', ink: '#6e4a3c' },
    katia: { c: '#917669', in: '#d8a8a0', ink: '#4e362c' },
  };

  /* ================================================================
   * 脸型（头部空间：颅骨半径 = 1）
   *   chin 下巴到颅心的距离；jaw 下颌半宽；eye：psi 眼距、y 高度、w/h 眼框大小、shape 眼型、lash 睫毛粗细
   *   nose：dot（小孩）| tick（少年 / 女性）| line（成年男性 / 长者）；noseTip 侧面鼻尖的前伸
   * ================================================================ */
  const FACE = {
    child: { chin: 1.0, jaw: 0.82, eye: { psi: 0.44, y: 0.37, w: 0.38, h: 0.54, shape: 'round', lash: 1.15 }, brow: { y: 0.0, len: 0.14, w: 0.8, arch: 0.05 }, nose: 'dot', noseTip: 1.02, mouth: { y: 0.76, w: 0.068 } },
    caster: { chin: 1.02, jaw: 0.8, eye: { psi: 0.43, y: 0.35, w: 0.36, h: 0.51, shape: 'round', lash: 1.08 }, brow: { y: -0.01, len: 0.15, w: 0.85, arch: 0.05 }, nose: 'dot', noseTip: 1.03, mouth: { y: 0.76, w: 0.066 } },
    alter: { chin: 1.04, jaw: 0.77, cheek: 0.04, eye: { psi: 0.43, y: 0.34, w: 0.35, h: 0.49, shape: 'almond', lash: 1.05 }, brow: { y: -0.02, len: 0.155, w: 0.85, arch: 0.05 }, nose: 'dot', noseTip: 1.04, mouth: { y: 0.77, w: 0.066 } },
    magna: { chin: 1.15, jaw: 0.68, cheek: 0.16, blushK: 0.7, eye: { psi: 0.4, y: 0.31, w: 0.3, h: 0.36, shape: 'soft', lash: 0.98 }, brow: { y: -0.04, len: 0.17, w: 0.8, arch: 0.06 }, nose: 'tick', noseTip: 1.06, mouth: { y: 0.85, w: 0.068 }, freckles: '#c98a72' },
    katia: { chin: 1.2, jaw: 0.66, square: 0.5, cheek: 0.2, blushK: 0.3, eye: { psi: 0.39, y: 0.27, w: 0.3, h: 0.27, shape: 'calm', lash: 0.9 }, brow: { y: -0.03, len: 0.19, w: 1.2, arch: 0.02 }, nose: 'line', noseTip: 1.09, mouth: { y: 0.9, w: 0.078 } },
    keller: { chin: 1.17, jaw: 0.66, cheek: 0.18, blushK: 0.4, eye: { psi: 0.4, y: 0.31, w: 0.29, h: 0.31, shape: 'calm', lash: 0.9 }, brow: { y: -0.04, len: 0.17, w: 0.8, arch: 0.03, tilt: 0.04 }, nose: 'tick', noseTip: 1.06, mouth: { y: 0.86, w: 0.06 }, age: 0.5 },
    fontaine: { chin: 1.07, jaw: 0.74, cheek: 0.08, blushK: 0.35, eye: { psi: 0.42, y: 0.34, w: 0.32, h: 0.4, shape: 'cool', lash: 0.82 }, brow: { y: -0.02, len: 0.16, w: 0.9, arch: 0.03 }, nose: 'tick', noseTip: 1.05, mouth: { y: 0.78, w: 0.058 } },
    liese: { chin: 1.0, jaw: 0.81, eye: { psi: 0.44, y: 0.36, w: 0.37, h: 0.52, shape: 'round', lash: 1.1 }, brow: { y: -0.01, len: 0.14, w: 0.85, arch: 0.06 }, nose: 'dot', noseTip: 1.02, mouth: { y: 0.76, w: 0.075 }, freckles: '#d9926e' },
    adultF: { chin: 1.13, jaw: 0.7, cheek: 0.13, blushK: 0.7, eye: { psi: 0.42, y: 0.3, w: 0.31, h: 0.4, shape: 'almond', lash: 0.95 }, brow: { y: -0.05, len: 0.16, w: 0.85, arch: 0.05 }, nose: 'tick', noseTip: 1.06, mouth: { y: 0.83, w: 0.07 } },
    adultM: { chin: 1.16, jaw: 0.7, square: 0.7, cheek: 0.16, blushK: 0.3, eye: { psi: 0.42, y: 0.29, w: 0.3, h: 0.35, shape: 'calm', lash: 0.8 }, brow: { y: -0.07, len: 0.19, w: 1.25, arch: 0.02 }, nose: 'line', noseTip: 1.09, mouth: { y: 0.85, w: 0.082 } },
    old: { chin: 1.13, jaw: 0.71, cheek: 0.12, eye: { psi: 0.42, y: 0.3, w: 0.29, h: 0.33, shape: 'soft', lash: 0.85 }, brow: { y: -0.06, len: 0.17, w: 1.0, arch: 0.04 }, nose: 'line', noseTip: 1.08, mouth: { y: 0.84, w: 0.075 }, age: 1 },
    kidF: { chin: 1.0, jaw: 0.81, eye: { psi: 0.44, y: 0.36, w: 0.36, h: 0.5, shape: 'round', lash: 1.05 }, brow: { y: 0.0, len: 0.14, w: 0.8, arch: 0.05 }, nose: 'dot', noseTip: 1.02, mouth: { y: 0.76, w: 0.07 } },
  };

  /* ================================================================
   * 发型：一束一束的头发
   *   cap 发顶的蓬松半径（也是身高 h 的顶）；lobes / lobeAmp 发顶轮廓的起伏；hl 发际线；part 分线
   *   bangs：[发梢方位 ψ, 发梢高度 y, 半宽（弧度）, 发梢弯向] —— 从分线附近长出来，一绺一绺盖在额头上
   *   temple：鬓角那一绺（贴着脸颊垂下）；sides：鬓边垂到胸前的长发束（会随风摆）
   *   back：后发（n 束，len 长，w 每束半宽，spread 发梢张开，wave 波浪，curl 发梢卷，var 长短差）
   *   tuft 头顶的小揪揪（术师）；pony 马尾；braid 麻花辫；ahoge 呆毛；plume 黎博利的耳羽
   * ================================================================ */
  const ADELE_BANGS = [[-1.05, 0.22, 0.13, -0.28], [-0.85, 0.38, 0.12, -0.24], [-0.65, 0.12, 0.12, -0.18], [-0.45, 0.04, 0.11, -0.12], [-0.25, 0.3, 0.11, -0.06], [-0.05, 0.44, 0.1, 0.02], [0.15, 0.24, 0.11, 0.1], [0.34, 0.04, 0.11, 0.14], [0.54, 0.1, 0.12, 0.2], [0.76, 0.36, 0.12, 0.24], [0.98, 0.24, 0.13, 0.28]];
  const HAIR_ADELE = (pal, o = {}) => Object.assign({
    pal, cap: 1.15, lobes: 11, lobeAmp: 0.032, hl: -0.4, part: 0.2, curly: 1,
    bangs: ADELE_BANGS,
    temple: { y: 0.7, w: 0.13, curl: 0.35 },
    sides: [{ psi: 1.36, y0: 0.2, len: 1.95, w: 0.14, wave: 0.07, curl: 1.0, out: 0.12 }, { psi: 1.56, y0: 0.08, len: 1.55, w: 0.125, wave: 0.08, curl: 0.9, out: 0.24 }],
    back: { n: 8, top: -0.28, len: 2.65, w: 0.2, spread: 1.22, wave: 0.085, curl: 0.95, var: 0.22 },
    ahoge: { psi: 0.16, len: 0.5, curl: 1.35 },
    pony: null, braid: null,
  }, o);

  // 服装字段见身体部分的各函数；颜色都写成字面值
  const CH = {
    'adele-child': {
      body: 'child', face: FACE.child, skin: SKIN, eye: EYES.child, ear: 'sheep', ears: EARS.child, sheepEar: 1.05,
      horn: { style: 'spiral', pal: HORNS.adele, r: 0.38, turn: 1.3, out: 0.3, w: 0.25, psi: 1.08, y: -0.58 },
      hair: HAIR_ADELE(HAIR.child, { cap: 1.16, back: { n: 7, top: -0.28, len: 2.0, w: 0.2, spread: 1.16, wave: 0.09, curl: 1.0, var: 0.2 }, sides: [{ psi: 1.38, y0: 0.2, len: 1.4, w: 0.14, wave: 0.07, curl: 0.95, out: 0.12 }], ahoge: { psi: 0.16, len: 0.62, curl: 1.3 } }),
      def: 'school',
      outfits: {
        school: {
          top: '#2f3a5e', sleeve: ['#f7f5f0', '#f7f5f0'], collar: { type: 'peter', c: '#fbfaf6' }, neck: { bow: '#d63a36' },
          skirt: { c: '#2f3a5e', len: 0.44, flare: 3.2, hem: 'pleat', trim: '#27304e' },
          cape: { c: '#c7976a', trim: '#8a5f3c', len: 0.42, clasp: '#d63a36' },
          legs: { c: ['#fff1e8', '#fff1e8', '#fbfaf6'], sock: 0.22 },
          shoes: { c: '#6b3f2a', sole: '#3a2216', type: 'mary' },
        },
        summer: {
          top: '#fbf7ee', sleeve: ['#fbf7ee', '#fff1e8'], collar: { type: 'square', c: '#8ec3e6' }, neck: { bow: '#8ec3e6' },
          skirt: { c: '#fbf7ee', len: 0.52, flare: 5.2, hem: 'scallop', trim: '#8ec3e6' }, sash: '#8ec3e6',
          legs: { c: ['#fff1e8', '#fff1e8', '#fff1e8'] },
          shoes: { c: '#b07a4a', sole: '#6e4426', type: 'sandal' },
          hat: { type: 'straw', c: '#f0d58c', band: '#d63a36' },
        },
        pajama: {
          top: '#bcd4f0', sleeve: ['#bcd4f0', '#bcd4f0'], collar: { type: 'peter', c: '#fbfaf6' }, dots: '#ffffff', buttons: '#fbfaf6',
          pants: { c: '#bcd4f0', w: [6.2, 5.2], cuff: '#fbfaf6' },
          shoes: { c: '#f6e6ee', sole: '#e0b8c8', type: 'slipper' },
          bedhair: true,
        },
      },
    },
    'adele-caster': {
      body: 'teen', face: FACE.caster, skin: SKIN, eye: EYES.adele, ear: 'sheep', ears: EARS.adele, sheepEar: 1,
      horn: { style: 'spiral', pal: HORNS.adele, r: 0.44, turn: 1.3, out: 0.36, w: 0.28, psi: 1.08, y: -0.58 },
      hair: HAIR_ADELE(HAIR.caster, { tuft: { psi: 0.95, y: -0.72, len: 0.52, tie: '#d63a36' } }),
      def: 'default',
      outfits: {
        default: {
          top: '#8f879f', sleeve: ['#f4f1ed', '#f4f1ed'], cuff: '#e3ddd4', collar: { type: 'jabot', c: '#fbfaf6' }, buttons: '#d63a36',
          skirt: { c: '#8f879f', c2: '#eddfe4', len: 0.4, flare: 3.4, hem: 'soot', trim: '#2c2433' },
          jacket: { c: '#f4f1ed', sh: '#d8d1c8', open: 0.5, len: 0.36, hood: true, lining: '#e2dbd0', flare: 3.2 },
          capeTail: { c: '#f4f1ed', len: 0.62 },
          cords: '#d63a36', headphones: true, goggles: true,
          legs: { c: ['#fff1e8', '#2a2330', '#2a2330'], stock: 0.2 },
          shoes: { c: '#6d4230', sole: '#3a2216', type: 'boot', shaft: '#f2eeea', lace: '#d63a36' },
          staff: 'caster',
        },
      },
    },
    'adele-alter': {
      body: 'young', face: FACE.alter, skin: SKIN, eye: EYES.adele, ear: 'sheep', ears: EARS.adele, sheepEar: 1,
      horn: { style: 'spiral', pal: HORNS.adele, r: 0.45, turn: 1.32, out: 0.38, w: 0.28, psi: 1.08, y: -0.58 },
      hair: HAIR_ADELE(HAIR.alter, {
        pony: { psi: 1.12, y: -0.5, len: 2.15, w: 0.52, curl: 1.2, orn: 'leaves' },
        back: { n: 7, top: -0.28, len: 2.35, w: 0.2, spread: 1.2, wave: 0.085, curl: 1.0, var: 0.2 },
        sides: [{ psi: 1.36, y0: 0.2, len: 2.0, w: 0.14, wave: 0.075, curl: 1.05, out: 0.14 }, { psi: -1.56, y0: 0.08, len: 1.7, w: 0.125, wave: 0.08, curl: 0.95, out: 0.26, one: 1 }],
      }),
      def: 'coat',
      outfits: {
        coat: {
          top: '#a596c8', sleeve: ['#f2eee8', '#f2eee8'], collar: { type: 'shirt', c: '#a596c8' }, neck: { tie: '#1c1a22', thin: 1 },
          tricolor: true, corset: { c: '#2d2733', y0: 0.16, y1: 0.46 }, pouches: '#3a3340',
          skirt: { c: '#2e3050', len: 0.3, flare: 2.2, hem: 'plain', trim: '#24263e' },
          coat: { c: '#f2eee8', sh: '#d7cfc4', lining: '#b8323b', len: 0.72, open: 0.4, stripes: '#c23b3b', tatter: true, ribbons: '#d23a44', cords: ['#6a7ae0', '#c070c0'] },
          legs: { c: ['#2a2430', '#2a2430', '#2a2430'], straps: '#c8323c', band2: '#3aa8c8' },
          shoes: { c: '#f5e8ee', sole: '#e8a2ba', type: 'chunky', lace: '#d63a36' },
          hearing: true, staff: 'alter',
        },
        picnic: {
          top: '#5fb3dd', sleeve: ['#fbfaf6', '#fff1e8'], puff: true, collar: { type: 'off', c: '#fbfaf6' }, neck: { bow: '#3f8fd0', bell: '#f2d060' },
          corset: { c: '#27365a', y0: 0.2, y1: 0.46 }, apron: '#fbfaf6',
          skirt: { c: '#5fb3dd', len: 0.46, flare: 6.5, hem: 'frill', trim: '#fbfaf6', check: ['#d63a36', '#fbfaf6'] },
          legs: { c: ['#fbfaf6', '#fbfaf6', '#fbfaf6'], ribbons: '#3f8fd0' },
          shoes: { c: '#26222e', sole: '#141118', type: 'mary' },
          hair: { pony: { psi: 3.14, y: -0.62, len: 2.5, w: 0.5, curl: 1.1, high: true }, bows: '#3f8fd0' },
          hearing: true, staff: 'alter',
        },
        home: {
          top: '#2a2632', sleeve: ['#2a2632', '#2a2632'], cuff: '#b8a8e8', collar: { type: 'ruffle', c: '#b8a8e8' }, neck: { bow: '#8fb4e8' },
          skirt: { c: '#6e5aa0', len: 0.34, flare: 3.2, hem: 'lace', trim: '#f4f0f8', plaid: '#8e80c8' },
          legs: { c: ['#fff1e8', '#fff1e8', '#f4f0f0'], sock: 0.1, bows: '#f2a2bc', band: '#3aa8c8' },
          shoes: { c: '#c8b8ec', sole: '#a898d2', type: 'slipper' },
          hair: { pony: null, headband: '#7d8de8', headbandNotch: 1 },
          hearing: true,
        },
      },
    },
    magna: {
      body: 'woman', face: FACE.magna, skin: SKIN, eye: EYES.magna, ear: 'sheep', ears: EARS.magna, sheepEar: 1.05,
      horn: { style: 'big', pal: HORNS.magna, r: 0.5, turn: 1.6, out: 0.3, w: 0.3, psi: 1.12, y: -0.64 },
      glasses: { shape: 'round', c: '#6a4a36', thin: 1 },
      hair: {
        pal: HAIR.magna, cap: 1.14, lobes: 9, lobeAmp: 0.024, hl: -0.42, part: -0.55, curly: 1,
        bangs: [[-1.05, 0.34, 0.13, 0.12], [-0.86, 0.44, 0.13, 0.16], [-0.64, 0.18, 0.12, 0.22], [-0.42, 0.06, 0.12, 0.28], [-0.2, 0.2, 0.12, 0.32], [0.02, 0.34, 0.12, 0.36], [0.24, 0.12, 0.12, 0.36], [0.44, 0.06, 0.12, 0.34], [0.64, 0.24, 0.12, 0.32], [0.84, 0.44, 0.13, 0.3], [1.04, 0.36, 0.13, 0.26]],
        temple: { y: 0.82, w: 0.13, curl: 0.3 },
        sides: [{ psi: 1.36, y0: 0.2, len: 2.3, w: 0.15, wave: 0.09, curl: 0.8, out: 0.14 }, { psi: 1.56, y0: 0.08, len: 2.0, w: 0.13, wave: 0.1, curl: 0.7, out: 0.26 }],
        back: { n: 9, top: -0.28, len: 3.05, w: 0.2, spread: 1.3, wave: 0.1, curl: 0.75, var: 0.2 },
        ahoge: null, pony: null, braid: null,
      },
      def: 'field',
      outfits: {
        field: {
          top: '#f8f6f2', sleeve: ['#f2eee8', '#f2eee8'], collar: { type: 'jabot', c: '#fbfaf6' }, neck: { bow: '#1e1c24' },
          corset: { c: '#2e3450', y0: 0.12, y1: 0.5, buttons: '#c8b070' },
          skirt: { c: '#3a3446', len: 0.72, flare: 3.0, hem: 'plain', trim: '#2c2836' },
          coat: { c: '#f2eee8', sh: '#d7cfc4', lining: '#b8323b', len: 0.66, open: 0.36, stripes: '#c23b3b', tatter: false },
          legs: { c: ['#3a3040', '#3a3040', '#3a3040'] },
          shoes: { c: '#4a372c', sole: '#241812', type: 'boot' },
          gear: ['backpack'], hammerBelt: true,
        },
        home: {
          top: '#7a4a66', sleeve: ['#6a3e58', '#6a3e58'], collar: { type: 'turtle', c: '#7a4a66' },
          skirt: { c: '#7a4a66', len: 0.86, flare: 3.0, hem: 'plain', trim: '#5e3a50' }, lacing: '#5e3a50',
          legs: { c: ['#5a2e40', '#5a2e40', '#5a2e40'] },
          shoes: { c: '#d8c8ec', sole: '#b9a8d2', type: 'slipper' },
          pendant: '#e8c060',
        },
      },
    },
    katia: {
      body: 'man', face: FACE.katia, skin: SKIN, eye: EYES.katia, ear: 'sheep', ears: EARS.katia, sheepEar: 1.0,
      horn: { style: 'bar', pal: HORNS.katia, r: 0.55, turn: 1.0, out: 0.9, w: 0.2, psi: 1.02, y: -0.66 },
      glasses: { shape: 'hex', c: '#2a201c', thin: 1 },
      hair: {
        pal: HAIR.katia, cap: 1.16, lobes: 8, lobeAmp: 0.05, hl: -0.36, part: 0.3, curly: 1, messy: 1,
        bangs: [[-1.06, 0.4, 0.12, -0.35], [-0.86, 0.5, 0.12, -0.4], [-0.64, 0.2, 0.11, -0.3], [-0.44, 0.06, 0.11, -0.2], [-0.22, 0.3, 0.11, -0.05], [-0.02, 0.42, 0.1, 0.15], [0.18, 0.26, 0.11, 0.3], [0.38, 0.06, 0.11, 0.35], [0.58, 0.18, 0.11, 0.38], [0.8, 0.5, 0.12, 0.4], [1.02, 0.38, 0.12, 0.32]],
        temple: { y: 0.8, w: 0.14, curl: 0.5 },
        sides: [{ psi: 1.36, y0: 0.2, len: 1.55, w: 0.15, wave: 0.1, curl: 0.6, out: 0.18 }],
        back: { n: 8, top: -0.28, len: 2.05, w: 0.2, spread: 1.3, wave: 0.11, curl: 0.55, var: 0.3 },
        ahoge: { psi: 0.1, len: 0.52, curl: 1.4 }, pony: null, braid: null,
      },
      def: 'suit',
      outfits: {
        suit: {
          top: '#f6f4ef', vest: { c: '#6e5a4c', knit: '#5e4c40' }, sleeve: ['#f6f4ef', '#f6f4ef'], cuff: '#ffffff', collar: { type: 'shirt', c: '#ffffff' }, neck: { tie: '#c4342e' },
          pants: { c: '#3b3745', w: [6.6, 5.2] },
          shoes: { c: '#5a3a2a', sole: '#2a1a12', type: 'shoe' },
        },
        field: {
          top: '#f6f4ef', vest: { c: '#5e4a40', knit: '#4e3c34' }, sleeve: ['#f2f0ec', '#f2f0ec'], cuff: '#c23b3b', collar: { type: 'open', c: '#ffffff' },
          coat: { c: '#f2f0ec', sh: '#d6d2cc', lining: '#dcd8d2', len: 0.62, open: 0.42, stripes: '#c23b3b', tatter: false, cords: ['#7a7ae8', '#9a8ae8'], lab: 1 },
          gear: ['bag'], bag: { c: '#6a4a36', dev: '#c8a060' }, strap: '#5a3e2c',
          pants: { c: '#3e3a44', w: [6.6, 5.2], tuck: true },
          shoes: { c: '#4a372c', sole: '#241812', type: 'boot' },
        },
        home: {
          top: '#2f3552', sleeve: ['#cdbfb3', '#cdbfb3'], collar: { type: 'shirt', c: '#2f3552' },
          cardigan: { c: '#cdbfb3', knit: '#b4a698', argyle: '#b8a898' }, pendant: '#e8c060',
          pants: { c: '#8e87b5', w: [6.8, 5.4] },
          shoes: { c: '#c9c2e0', sole: '#a89fc8', type: 'slipper' },
        },
      },
    },
    fontaine: {
      body: 'teenM', face: FACE.fontaine, skin: SKIN, eye: EYES.fontaine, ear: 'human', hideEye: 1,
      halo: { c: '#e4e6ec', gem: '#ffffff', glow: '236,240,255' }, wings: { c: '#1c1c22', edge: '#5a5e68', glow: '190,255,120' },
      hair: {
        pal: HAIR.fontaine, cap: 1.11, lobes: 0, lobeAmp: 0, hl: -0.4, part: -0.62, straight: 1,
        bangs: [[-1.04, 0.3, 0.14, 0.3], [-0.8, 0.14, 0.13, 0.34], [-0.56, 0.06, 0.13, 0.4], [-0.32, 0.12, 0.13, 0.46], [-0.08, 0.28, 0.14, 0.5], [0.16, 0.44, 0.15, 0.5], [0.4, 0.56, 0.16, 0.44], [0.66, 0.6, 0.16, 0.36], [0.92, 0.52, 0.15, 0.26], [1.12, 0.44, 0.14, 0.18]],
        temple: { y: 0.84, w: 0.15, curl: -0.3 },
        sides: null,
        back: { n: 8, top: -0.28, len: 1.1, w: 0.24, spread: 0.98, wave: 0.02, curl: -0.12, var: 0.05 },
        ahoge: null, pony: null, braid: null,
      },
      def: 'default',
      outfits: {
        default: {
          top: '#1f1f26', blazer: true, sleeve: ['#24242c', '#24242c'], cuff: '#2c2c34', collar: { type: 'high', c: '#f2f2f6' }, neck: { choker: '#1a1a20' }, studs: '#e8ecf4',
          strap: '#b8f040', limeBelt: '#b8f040',
          pants: { c: '#1c1c22', w: [6.0, 5.0], shorts: 1 },
          legs: { c: ['#fff1e8', '#1a1a20', '#1a1a20'], stock: 0.35 },
          shoes: { c: '#1a1a20', sole: '#0c0c10', type: 'boot', shaft: '#1a1a20', lace: '#c8ccd4' },
        },
      },
    },
    liese: {
      body: 'teen', bodyK: { heads: 2.4, leg: 35.5 }, face: FACE.liese, skin: SKIN, eye: EYES.liese, ear: 'rabbit',
      hair: {
        pal: HAIR.liese, cap: 1.13, lobes: 8, lobeAmp: 0.02, hl: -0.4, part: 0.1,
        bangs: [[-1.02, 0.26, 0.15, -0.2], [-0.72, 0.32, 0.15, -0.15], [-0.42, 0.16, 0.15, -0.1], [-0.12, 0.32, 0.14, 0.05], [0.18, 0.16, 0.14, 0.15], [0.48, 0.32, 0.15, 0.2], [0.78, 0.2, 0.15, 0.22], [1.04, 0.3, 0.14, 0.2]],
        temple: { y: 0.66, w: 0.13, curl: 0.3 },
        sides: [{ psi: 1.38, y0: 0.2, len: 1.0, w: 0.13, wave: 0.05, curl: 0.4, out: 0.06 }],
        back: { n: 6, top: -0.28, len: 1.25, w: 0.21, spread: 1.12, wave: 0.05, curl: 0.4, var: 0.12 },
        ahoge: null, pony: null, braid: { psi: 1.9, y: 0.5, len: 2.35, w: 0.3, tie: '#2f6a52' },
      },
      def: 'default',
      outfits: {
        default: {
          top: '#f6eee0', sleeve: ['#f6eee0', '#f6eee0'], puff: true, collar: { type: 'peter', c: '#ffffff' }, neck: { bow: '#2f6a52' },
          pinafore: '#7a2e42', skirt: { c: '#7a2e42', len: 0.5, flare: 4.2, hem: 'plain', trim: '#5e2233' },
          legs: { c: ['#fff1e8', '#fff1e8', '#f6f2ea'], sock: 0.3 },
          shoes: { c: '#6b3f2a', sole: '#3a2216', type: 'boot' },
        },
      },
    },
    keller: {
      body: 'elder', face: FACE.keller, skin: SKIN_K, eye: EYES.keller, ear: 'human', plume: { c: '#34343e', tip: '#8e8e9c' },
      glasses: { shape: 'hexround', c: '#d9ad4a', thin: 1 }, earring: '#f2eee6',
      hair: {
        pal: HAIR.keller, cap: 1.1, lobes: 0, lobeAmp: 0, hl: -0.44, part: 0.55, straight: 1,
        bangs: [[-1.04, 0.28, 0.13, -0.12], [-0.82, 0.14, 0.13, -0.2], [-0.6, 0.04, 0.13, -0.26], [-0.38, 0.0, 0.13, -0.3], [-0.14, 0.04, 0.13, -0.32], [0.1, 0.1, 0.13, -0.3], [0.32, 0.2, 0.12, -0.24], [0.54, 0.36, 0.12, -0.14], [0.78, 0.5, 0.12, -0.04], [1.0, 0.44, 0.12, 0.04]],
        temple: { y: 0.9, w: 0.13, curl: 0 },
        sides: [{ psi: 1.38, y0: 0.2, len: 2.1, w: 0.15, wave: 0.02, curl: 0.1, out: 0.06 }],
        back: { n: 7, top: -0.28, len: 2.85, w: 0.2, spread: 1.1, wave: 0.02, curl: 0.1, var: 0.1 },
        ahoge: null, pony: null, braid: null,
      },
      def: 'default',
      outfits: {
        default: {
          top: '#f7f7f4', sleeve: ['#f7f7f4', '#f7f7f4'], cuff: '#ffffff', collar: { type: 'shirt', c: '#ffffff' }, neck: { kerchief: '#2f8a7c', pat: '#c8423c' },
          capelet: { c: '#c79a5c', sh: '#a87c44' },
          pants: { c: '#9c7d50', w: [6.4, 5.2], cargo: '#86683e', tuck: false },
          shoes: { c: '#27232b', sole: '#121014', type: 'boot', lace: '#8a5ab8' },
          strap: '#8a5ab8', bag: { c: '#2c2c34', dev: '#3f7fc4' }, pendant: '#f2f2f2',
        },
      },
    },
    doctor: {
      body: 'man', face: FACE.adultM, skin: SKIN, eye: EYES.katia, ear: 'none', hooded: true,
      hair: null,
      def: 'default',
      outfits: {
        default: {
          top: '#1a1c24', sleeve: ['#1e2029', '#1e2029'], cuff: '#16181f', collar: { type: 'none' },
          coat: { c: '#c4c6cc', sh: '#9ea2aa', lining: '#8e9298', len: 0.6, open: 0.16, stripes: null, tatter: false, hoodie: true },
          jacket: { c: '#1e2029', sh: '#14161c', open: 0.12, len: 0.2, pockets: true, lining: '#14161c', teal: '#3ac8c8', badge: '#e88a3a' },
          pants: { c: '#23242e', w: [6.4, 5.4] },
          shoes: { c: '#1a1a20', sole: '#0c0c10', type: 'boot' },
          hood: { c: '#1e2029', sh: '#101218', face: '#0b0c12', visor: 1, k: 0.86 },
        },
      },
    },
  };

  const META = {
    'adele-child': { name: '阿黛尔（童年）', species: '卡普里尼', scale: 0.6, desc: '十来岁的小学者。长长的浅棕色卷发、一对白色的小羊角，背着塞满笔记的书包。' },
    'adele-caster': { name: '艾雅法拉', species: '卡普里尼', scale: 0.8, desc: '罗德岛术师干员。白色兜帽外套、红色系带、毛绒领与呼吸面罩、黑色法杖。' },
    'adele-alter': { name: '纯烬艾雅法拉', species: '卡普里尼', scale: 0.84, desc: '穿着母亲的火山防护外套，粉色发梢，法杖上开着白色的枝与彩色的叶。' },
    magna: { name: '玛格娜', species: '卡普里尼', scale: 0.94, desc: '母亲。自然环境与生态学者，大卷角、圆眼镜，穿那件后来留给女儿的火山防护外套。' },
    katia: { name: '卡提亚', species: '卡普里尼', scale: 1, desc: '父亲。源石技艺学院的教授，眼镜、蓬松的长卷发、深色的角，喜欢逗女儿笑。' },
    fontaine: { name: '芳汀', species: '萨科塔', scale: 0.76, desc: '同一位教授课上的同学：灰色短发、光环、黑色的翼。' },
    liese: { name: '莉瑟', species: '卡特斯（本页原创）', scale: 0.7, original: true, desc: '莱塔尼亚的同学，背着大提琴，麻花辫，爱笑。本页原创角色。' },
    keller: { name: '阿黛尔·凯勒', species: '黎博利', scale: 0.97, desc: '汐斯塔火山博物馆馆长，瑙曼夫妇的挚友。银色长发、金框眼镜。' },
    dolly: { name: '多利', species: '羊之兽主', scale: 1.2, desc: '守护着她的羊之兽主，化作一群看不见的小羊。' },
    'sheep-black': { name: '小黑羊', species: '', scale: 0.3, desc: '温顺、嗜睡，一高兴就发烫。' },
    'sheep-pink': { name: '粉色小羊', species: '', scale: 0.28, desc: '多利的化身，时隐时现，爱啃东西。' },
    doctor: { name: '博士', species: '', scale: 1, desc: '她口中的“前辈”。' },
    crowd: { name: '路人', species: '', scale: 0.95, desc: '' },
  };
  // 每个角色自己的体型（头的大小、发顶高度、下巴位置都不同）
  function bodyOf(C) {
    if (C._B) return C._B;
    const base = Object.assign({}, BODY[C.body], C.bodyK || {});
    const capTop = C.hooded ? 1.22 : C.hair ? C.hair.cap : 1.12;
    C._B = mkBody(base, capTop, (C.face || FACE.adultM).chin);
    return C._B;
  }
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
    fiddle: { legs: 'stand', arms: 'fiddle', head: 'tilt', expr: 'content' },
  };

  function legSet(L, a, b, k, fp) { L.a = a; L.b = b; L.k = k; L.fp = fp; L.ik = 0; }
  function legIK(L, s, v, f, ps, pv, pf, fp) { L.ik = 1; L.tg[0] = s; L.tg[1] = v; L.tg[2] = f; L.pole[0] = ps; L.pole[1] = pv; L.pole[2] = pf; L.fp = fp || 0; L.a = 0; L.b = 0; L.k = 0; }
  /** 鞋底最低点在踝关节下方多远（fp：脚掌俯仰，负 = 踮脚 / 蹬地）—— 和画鞋的几何完全一致，鞋底才正好落在 y = 0 */
  function footDrop(B, fp) {
    const sf = sin(fp), cf = cos(fp), len = B.foot, rr = B.ank * 0.47;
    return max(0.22 * len * sf + cf * (B.ank - rr) + rr, -0.74 * len * sf + cf * (B.ank - rr * 1.08) + rr * 1.08);
  }
  /**
   * 走 / 跑（脚踩实）：每只脚在支撑期（周期的前 beta）贴着地面、相对髋部匀速向后滑 2s，
   * 摆动期抬起来往前送；髋的高度取“两条腿都够得着”的最高处 → 自然的起伏。
   * 角色以 gait().speed 横移时，着地的那只脚在画面上一动不动。
   */
  const GAIT = { walk: { cyc: 0.92, beta: 0.6, s: 0.34, lift: 0.12, reach: 0.985, fly: 0 }, run: { cyc: 1.38, beta: 0.38, s: 0.4, lift: 0.26, reach: 0.95, fly: 0.035 } };
  function gaitLegs(B, P, ph, G) {
    const Lg = B.thigh + B.shin, s = G.s * Lg, R = Lg * G.reach, hS = sqrt(max(1, R * R - s * s));
    let hH = R;
    for (let i = 0; i < 2; i++) {
      const u = fract(ph / TAU + i * 0.5), L = P.L[i], sd = i ? -1 : 1;
      let z, lift = 0, fp, req;
      if (u < G.beta) {
        const w = u / G.beta;
        z = s * (1 - 2 * w);
        fp = 0.16 * (1 - sstep(0, 0.14, w)) - 0.5 * sstep(0.7, 1, w);
        req = sqrt(max(1, R * R - z * z));
      } else {
        const w = (u - G.beta) / (1 - G.beta);
        z = -s + 2 * s * (0.5 - 0.5 * cos(PI * w));
        lift = G.lift * Lg * sin(PI * w);
        fp = lerp(-0.5, 0.16, sstep(0.15, 0.95, w));
        req = w < 0.25 ? lerp(hS, R, sstep(0, 0.25, w)) : w > 0.75 ? lerp(R, hS, sstep(0.75, 1, w)) : R;
      }
      hH = min(hH, req);
      legIK(L, sd * (B.hipJ + 0.2), -footDrop(B, fp) - lift, z, 0, -0.25, 1, fp);
    }
    if (G.beta < 0.5) { const uu = fract(ph / TAU) % 0.5; if (uu >= G.beta) { const w = (uu - G.beta) / (0.5 - G.beta); hH += G.fly * Lg * 4 * w * (1 - w); } }
    P.ground = 0; P.hipV = -(B.ank + hH);
  }

  const LEGS = {
    stand(B, o, P, t) {
      const sw = sin(t * 0.8 + P.seed * 6);
      legSet(P.L[0], 0.07 + 0.015 * sw, 0.045, 0.05, 0);
      legSet(P.L[1], -0.06 - 0.015 * sw, 0.065, 0.08, 0);
      P.hipS = 0.3 * sw;
    },
    tiptoe(B, o, P, t) {
      LEGS.stand(B, o, P, t);
      P.L[0].fp = -0.8; P.L[1].fp = -0.8;
    },
    walk(B, o, P, t, sp) {
      const G = GAIT.walk, cyc = G.cyc * sp, ph = TAU * cyc * t;
      P.mv = 1; P.ph = ph + HP; P.cyc = cyc;
      gaitLegs(B, P, ph, G);
      P.lean = 0.05;
    },
    run(B, o, P, t, sp) {
      const G = GAIT.run, cyc = G.cyc * sp, ph = TAU * cyc * t;
      P.mv = 1; P.run = 1; P.ph = ph + HP; P.cyc = cyc;
      gaitLegs(B, P, ph, G);
      P.lean = 0.2;
    },
    sit(B, o, P, t) {
      const kneeH = B.shin + B.ank;
      const seat = o.seat != null ? o.seat / P.S : B.seatDef;
      P.ground = 0; P.hipV = -(seat + B.legW[0] * 0.45);
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
      P.ground = 0; P.hipV = -(B.legW[0] * 0.45 + 0.1); P.seatV = 0;
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; legIK(P.L[i], sd * (B.hipJ + 0.9), -B.ank * 0.8, B.thigh + B.shin * 0.78 - i * 2.5, 0, -1, 0.2, 0.25); }
      P.lean = -0.1;
    },
    'hug-knees'(B, o, P, t) {
      P.ground = 0; P.hipV = -(B.legW[0] * 0.45 + 0.1); P.seatV = 0;
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
  /**
   * 角色坐标里的目标点；离肩太远时沿“肩 → 目标”的方向拉回到够得着的地方
   * （Q 版小孩的短手臂不会被拉成一根横穿画面的棍子，大人则是手肘自然弯着）
   */
  function reachW(P, B, i, x, y, z, ps, pv, pf, hand, kMax = 1.08) {
    const A = P.A[i], S0 = A.sh;
    let dx = x - S0[0], dy = y - S0[1], dz = z - S0[2];
    const d = hypot(dx, dy, dz), lim = (B.up + B.fo) * 0.96 * kMax;
    if (d > lim) { const k = lim / d; dx *= k; dy *= k; dz *= k; }
    ikW(A, S0[0] + dx, S0[1] + dy, S0[2] + dz, ps, pv, pf, hand);
  }
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
      // 手在脸的外侧挥：目标点按头的大小算，够不着就沿肩的方向收回来（小孩在腮边挥，大人举到耳朵旁边）
      const Hd = P.head3, R = B.R, w = sin(t * 8.5);
      // 越接近正侧面，手越往脸前面挪（否则会被头挡住）
      const a = min(1, abs(P.cy) * 1.6);
      reachW(P, B, 0, Hd[0] + R * (1.3 + 0.1 * w) * a, Hd[1] + R * (0.22 - 0.08 * w), Hd[2] + R * (1.2 * (1 - a) + 0.1), 1, 0.9, -0.3, 'flat');
      ARMS.restF(B, o, P, t);
    },
    restF(B, o, P, t) { fk(P.A[1], 0.03 + P.br * 0.025, 0.15, 0.26, 0.1, 'open'); },
    restN(B, o, P, t) { fk(P.A[0], 0.07 + P.br * 0.025, 0.17, 0.3, 0.1, 'open'); },
    wave2(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1, w = sin(t * 8 + i * PI); const a = min(1, abs(P.cy) * 1.6); reachW(P, B, i, Hd[0] + sd * R * (1.32 + 0.12 * w) * a, Hd[1] + R * (0.2 - 0.08 * w), Hd[2] + R * (1.2 * (1 - a) + 0.1), sd, 0.9, -0.3, 'flat'); }
    },
    point(B, o, P, t) {
      // 近侧手臂横过身体指向面朝的方向（Q 版手臂短，允许拉长一点）
      const aim = o.aim != null ? o.aim : 0.15, L = (B.up + B.fo) * 1.4, Sh = P.A[0].sh;
      const cross = 0.42 * abs(P.cy);
      ikW(P.A[0], Sh[0] - L * cross, Sh[1] - L * sin(aim), Sh[2] + L * cos(aim) * (1 - cross * 0.3), 1, 0.8, -0.3, 'point');
      P.A[0].maxSt = 1.45;
      ARMS.restF(B, o, P, t);
    },
    hug(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, -1.4, 0.6 * B.T, (B.DF[3] + B.FO[3]) + 6.5, 1, -0.3, -0.3, 'open'); }
    },
    reach(B, o, P, t) {
      const aim = o.aim != null ? o.aim : 0.35, L = (B.up + B.fo) * 1.3, cross = 0.35 * abs(P.cy);
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1, Sh = P.A[i].sh, a = aim - i * 0.2; ikW(P.A[i], Sh[0] + (i ? L * 0.1 : -L * cross), Sh[1] - L * sin(a), Sh[2] + L * cos(a), sd, 0.6, -0.4, 'open'); P.A[i].maxSt = 1.35; }
    },
    'reach-up'(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      reachW(P, B, 0, Hd[0] + R * 1.25, Hd[1] - R * 1.2, Hd[2] + R * 0.25, 1, 0.8, -0.3, 'open', 1.12);
      reachW(P, B, 1, Hd[0] - R * 1.3, Hd[1] - R * 0.5, Hd[2] + R * 0.2, -1, 0.8, -0.3, 'open', 1.1);
    },
    cheer(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1, b = 0.1 * sin(t * 6 + i); reachW(P, B, i, Hd[0] + sd * R * 1.38, Hd[1] - R * (0.62 + b), Hd[2] + R * 0.1, sd, 0.9, -0.3, 'fist', 1.1); }
    },
    stretch(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; reachW(P, B, i, Hd[0] + sd * R * 1.3, Hd[1] - R * 0.9, Hd[2] - R * 0.1, sd, 0.9, -0.2, 'open', 1.12); }
    },
    hold(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, 1.7, 0.56 * B.T, B.DF[3] + 5.2, 1, -1, -0.2, 'grip'); }
    },
    'hold-up'(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      const kk = armK(B);
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; reachW(P, B, i, Hd[0] + sd * R * lerp(0.35, 0.8, kk), Hd[1] + R * lerp(0.95, -1.4, kk), Hd[2] + R * lerp(1.1, 0.3, kk), sd, 0.6, -0.4, 'grip', 1.1); }
    },
    read(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, 2.5, 0.5 * B.T, B.DF[3] + 5.6, 1, -1, 0, 'grip'); }
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
      ikT(P, P.A[0], 1, 0.9, 0.86 * B.T, (B.DF[3] + B.FO[3]) + 7.8, 1, -1, -0.2, 'grip');
      ARMS.listenF(B, o, P, t);
    },
    listenF(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      reachW(P, B, 1, Hd[0] - R * 0.98, Hd[1] + R * 0.18, Hd[2] - R * 0.05, -1, 0.6, -0.6, 'flat', 1.12);
    },
    listen(B, o, P, t) { ARMS.restN(B, o, P, t); ARMS.listenF(B, o, P, t); },
    clap(B, o, P, t) {
      const k = pow(max(0, sin(t * 8)), 2);
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, 0.45 + 1.9 * k, 0.66 * B.T, (B.DF[3] + B.FO[3]) + 5, 1, -1, 0, 'flat'); }
    },
    think(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      reachW(P, B, 0, Hd[0] + R * 0.18, Hd[1] + R * (P.face.chin + 0.1), Hd[2] + R * 0.62, 1, 0.8, -0.2, 'fist', 1.1);
      ikT(P, P.A[1], -1, -1.8, 0.46 * B.T, (B.DF[3] + B.FO[3]) + 2.6, 1, -1, 0.2, 'flat');
    },
    clasp(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, 0.45, 0.72 * B.T, (B.DF[3] + B.FO[3]) + 2.8, 1, -1, -0.1, 'grip'); }
    },
    'clasp-low'(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, 0.6, 0.08 * B.T, (B.DF[1] + B.FO[1]) + 2.6, 1, -0.5, -0.4, 'grip'); }
    },
    carry(B, o, P, t) {
      fk(P.A[0], 0.04, 0.25, 0.05, 0.22, 'grip');
      ARMS.restF(B, o, P, t);
    },
    shade(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      reachW(P, B, 0, Hd[0] + R * 0.25, Hd[1] - R * 0.42, Hd[2] + R * 1.15, 1, 0.3, -0.3, 'flat', 1.12);
      ARMS.restF(B, o, P, t);
    },
    cover(B, o, P, t) {
      const Hd = P.head3, R = B.R;
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; reachW(P, B, i, Hd[0] + sd * R * 0.26, Hd[1] + R * (P.face.mouth.y - 0.02), Hd[2] + R * 1.02, sd, 0.8, -0.2, 'flat', 1.12); }
    },
    wipe(B, o, P, t) {
      const Hd = P.head3, R = B.R, rub = 0.12 * sin(t * 9);
      reachW(P, B, 0, Hd[0] + R * (0.42 + rub), Hd[1] + R * (P.face.eye.y + 0.04), Hd[2] + R * 1.02, 1, 0.8, -0.2, 'fist', 1.12);
      ARMS.restF(B, o, P, t);
    },
    hips(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, B.W[0] + 1.3, 0.2 * B.T, 0.4, 1, 0, -1, 'fist'); }
    },
    conduct(B, o, P, t) {
      // 爸爸挥着领带指挥：近侧手在头的外侧上方画拍子（领带往外甩，不会挡住脸和眼镜），远侧手在胸前打拍子
      const Hd = P.head3, R = B.R, q = t * 6.8, a = min(1, abs(P.cy) * 1.6), b = max(0, sin(q));
      reachW(P, B, 0, Hd[0] + R * (1.35 + 0.12 * sin(q + 0.9)) * a, Hd[1] - R * (0.15 + 0.4 * b), Hd[2] + R * (0.35 + 1.1 * (1 - a)), 1, 0.7, -0.2, 'grip', 1.1);
      ikT(P, P.A[1], -1, 2.2, 0.66 * B.T + sin(q + PI), B.DF[3] + 4.2, 1, -1, 0, 'flat');
    },
    fiddle(B, o, P, t) {
      // 小提琴架在远侧的肩上、下巴托着；远侧手向前握着琴颈，近侧手拉弓
      const Sh = P.A[1].sh;
      const V = P.violin || (P.violin = { b: v3(), n: v3() });
      V.b[0] = Sh[0] * 0.5; V.b[1] = Sh[1] - 1.6; V.b[2] = Sh[2] + 3.6;
      V.n[0] = Sh[0] - 2.5; V.n[1] = Sh[1] - 3.2; V.n[2] = Sh[2] + 3.6 + (B.up + B.fo) * 0.78;
      reachW(P, B, 1, V.n[0], V.n[1] + 1.4, V.n[2] - 2.2, -1, 0.7, -0.3, 'grip', 1.05);
      const bw = sin(t * 2.6);
      ikW(P.A[0], V.b[0] + 5 + 5.5 * bw, V.b[1] + 4.5 - 1.2 * bw, V.b[2] + 3.5 + 2 * bw, 1, 0.5, -0.4, 'grip');
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
        if (want === 'both' || (want === 'left') === left) { ikT(P, P.A[i], sd, 12.5, 0.02 * B.T, 1.8, 0.3, -1, -0.5, 'grip'); P.A[i].maxSt = 1.4; }
        else if (i) ARMS.restF(B, o, P, t); else ARMS.restN(B, o, P, t);
      }
    },
    pocket(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, B.W[0] + 0.2, 0.06 * B.T, 1.2, 1, 0, -1, 'hide'); }
    },
    cross(B, o, P, t) {
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; ikT(P, P.A[i], sd, -3.4, 0.62 * B.T, (B.DF[3] + B.FO[3]) + 2.4 - i * 0.6, 1, -0.4, 0.2, 'fist'); }
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
    P.kid = C.body === 'child' || C.body === 'kid';
    P.face = C.face || FACE.adultM;
    P.lean = pre.lean || 0; P.hipS = 0; P.hipF = 0; P.ground = 1; P.lift = 0; P.hipV = B.hipY; P.seatV = null;
    P.mv = 0; P.run = 0; P.ph = 0; P.cyc = 0; P.air = 0; P.vy = 0; P.floaty = 0; P.twirl = 0; P.lie = 0; P.spin = 0;
    P.A[0].maxSt = 0; P.A[1].maxSt = 0;
    P.br = sin(TAU * t / 3.6 + P.seed * 3.1);
    P.hp = 0; P.hr = 0; P.hy = 0;
    // 桌面默认高度（与 v1 相同，影片里的桌子才对得上）
    P.desk = o.desk != null ? o.desk / S : P.legsM === 'sit' ? B.deskSit : B.deskStand;

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
        const c = L.an[1] + footDrop(B, L.fp);
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
    // 呼吸 / 走路时头的微动（走路的起伏已经在髋上了，这里只留一点点滞后）
    if (P.mv) { P.head3[1] += (P.run ? 0.35 : 0.15) * cos(2 * P.ph - 0.6); P.hp += (P.run ? -0.05 : 0.02) * sin(2 * P.ph); }
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
    if (!o.arms && (P.armsM === 'rest') && firstHandProp(o)) ikT(P, P.A[0], 1, 1.4, 0.3 * B.T, B.DF[3] + 3.6, 1, 0, -1, 'grip');
    // 撑伞：近侧手举高
    if (hasProp(o, 'umbrella') && !['wave', 'wave2', 'cheer', 'reach-up', 'stretch'].includes(P.armsM)) ikT(P, P.A[0], 1, 1.2, B.T + 1.5, B.DF[3] + 4, 1, -1, -0.2, 'grip');
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
      const st = clamp(d / ((B.up + B.fo) * 0.96), 1, A.maxSt || 1.12);
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
   * 头部 v2（头部空间：颅骨半径 = 1，原点在颅骨中心，y 向下）
   * 五官、发际线、角都定义在球面上，按头的偏航 / 俯仰投影 —— 正面、3/4、侧面、背面同一套画法
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
  let FKN = 0;
  const keyOf = (o) => o._k || (o._k = 'k' + (++FKN));

  /* ---- 小工具：凸包、闭合平滑曲线 ---- */
  function convexHull(pts) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  function smoothClosedPts(p, pts) {
    const n = pts.length;
    const m = (i) => { const a = pts[i % n], b = pts[(i + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    const s0 = m(n - 1);
    p.moveTo(s0[0], s0[1]);
    for (let i = 0; i < n; i++) { const q = m(i); p.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]); }
    p.closePath();
  }

  /* ---- 脸：颅骨 ∪ 下颌（凸包）∪ 侧面时的轮廓线（眉骨、鼻尖、嘴唇、下巴）---- */
  /** 脸正中线在高度 y 处的前表面（头部空间 f）：颅骨球面 → 下颌 / 下巴那一段（与正面的凸包一致） */
  function faceFront(F, y) {
    if (y < 0.3) return sqrt(max(0, 1 - y * y));
    const yc = F.chin - 0.06, fe = 0.6 + (F.chin - 1) * 0.8;
    if (y < yc) return lerp(0.954, fe, pow((y - 0.3) / (yc - 0.3), 1.4));
    return lerp(fe, 0.5, clamp((y - yc) / 0.06));
  }
  /** 鼻尖在中线上的位置：[y, f] */
  function noseY(F) { return (F.eye.y + F.mouth.y) / 2 + 0.02; }
  function noseBump(F) { return (F.noseTip || 1.03) - 0.97; }
  function faceParts(D, H) {
    const F = D.F;
    return pathCache('face2:' + keyOf(F) + ':' + H.qk, () => {
      const pts = [];
      const ck = (F.cheek || 0) * abs(H.cy);
      for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU, s = sin(a); pts.push([cos(a) * (1 - ck * max(0, s - 0.15) * 1.3), s]); }
      const jw = F.jaw, c = F.chin, sq = F.square || 0, ext = c - 1;
      const side = [[0.97 - ck * 0.1, 0.16, -0.1], [0.94 - ck * 0.3, 0.38, 0.04], [jw + 0.06 + 0.05 * sq, 0.6 + 0.04 * sq + ext * 0.2, 0.2], [jw * (0.8 + 0.05 * sq), 0.77 + ext * 0.55 + 0.05 * sq, 0.33], [jw * (0.52 + 0.08 * sq), 0.9 + ext * 0.82, 0.43], [jw * (0.22 + 0.06 * sq), c - 0.025, 0.49]];
      for (const [s, v, f] of side) { hproj(H, s, v, f, T3); pts.push([T3[0], T3[1]]); hproj(H, -s, v, f, T3); pts.push([T3[0], T3[1]]); }
      hproj(H, 0, c, 0.52, T3); pts.push([T3[0], T3[1]]);
      const hull = new Path2D();
      smoothClosedPts(hull, convexHull(pts));
      let prof = null;
      if (abs(H.sy) > 0.42) {
        // 侧脸的轮廓：只在脸的前表面上加一点点起伏（眉骨、鼻尖、嘴唇、下巴），不会变成“长嘴”
        const ny = noseY(F), my = F.mouth.y, nb = noseBump(F), A = c > 1.08 ? 1 : 0.55;
        const cl = [[-0.35, 0], [0.02, 0], [F.eye.y - 0.1, 0.02 * A], [F.eye.y + 0.05, -0.01], [ny - 0.1, nb * 0.35], [ny, nb], [ny + 0.05, nb * 0.2], [my - 0.05, 0.035 * A], [my, 0.012], [my + 0.04, 0.03 * A], [my + 0.1, 0], [c - 0.07, 0.025 * (1 + sq)]];
        prof = new Path2D();
        for (let i = 0; i < cl.length; i++) { const y = cl[i][0]; hproj(H, 0, y, faceFront(F, y) + cl[i][1], T3); if (i) prof.lineTo(T3[0], T3[1]); else prof.moveTo(T3[0], T3[1]); }
        for (const [y, f] of [[c, 0.5], [c - 0.1, 0.3], [0.0, 0.3]]) { hproj(H, 0, y, f, T3); prof.lineTo(T3[0], T3[1]); }
        prof.closePath();
      }
      return { hull, prof };
    });
  }
  function skinGrad(sk) {
    return radG('skin2:' + sk.c, -0.34, -0.3, 0.05, 0.0, 0.12, 1.42, [0, lt(sk.c, 0.5), 0.45, sk.c, 0.8, mix(sk.c, sk.sh, 0.4), 1, sk.sh]);
  }
  /** 本次绘制的光：屏幕空间里光从哪边来（默认左上）→ 头部 / 角色空间的方向 */
  function lightIn(D) { return D.Lc; }

  /* ---- 一束头发：沿中心线的锥形带子（发梢尖、可卷），加到 p 上（Path2D 或 ctx）---- */
  const LXs = new Float64Array(32), LYs = new Float64Array(32), LWs = new Float64Array(32), NXs = new Float64Array(32), NYs = new Float64Array(32);
  function lockWidth(u, kind) {
    if (kind === 1) return u < 0.2 ? 0.78 + 0.22 * (u / 0.2) : 1 - pow((u - 0.2) / 0.8, 1.35);   // 刘海
    if (kind === 2) return u < 0.3 ? 0.7 + 0.3 * (u / 0.3) : 1 - 0.9 * pow((u - 0.3) / 0.7, 1.2) - (u > 0.97 ? 0.1 : 0); // 卷发梢留一点宽
    return u < 0.25 ? 0.62 + 0.38 * (u / 0.25) : 1 - pow((u - 0.25) / 0.75, 1.45);
  }
  /** 把中心线的尾巴卷起来：from 之后的每一段按递增的角度转，段长逐渐缩短 → 发梢打一个卷 */
  function curlTail(xs, ys, n, amount, dir, from) {
    if (!amount) return;
    const i0 = max(1, floor(from * (n - 1)));
    let ang = 0, px = xs[i0], py = ys[i0];
    for (let i = i0; i < n - 1; i++) {
      const dx = xs[i + 1] - xs[i], dy = ys[i + 1] - ys[i];
      const k = (i - i0 + 1) / (n - 1 - i0);
      ang += dir * amount * 1.6 * k / (n - 1 - i0) * 2.2;
      const s = 1 - 0.38 * k, c = cos(ang), sn = sin(ang);
      const nx = px + (dx * c - dy * sn) * s, ny = py + (dx * sn + dy * c) * s;
      xs[i] = px; ys[i] = py;
      px = nx; py = ny;
    }
    xs[n - 1] = px; ys[n - 1] = py;
  }
  /** 由中心线 + 宽度画带子；同时算出每点法线（给阴影带 / 发丝线用） */
  function ribbon(p, xs, ys, ws, n) {
    for (let i = 0; i < n; i++) {
      const a = max(0, i - 1), b = min(n - 1, i + 1);
      let tx = xs[b] - xs[a], ty = ys[b] - ys[a];
      const tl = hypot(tx, ty) || 1e-6; tx /= tl; ty /= tl;
      NXs[i] = -ty; NYs[i] = tx;
    }
    p.moveTo(xs[0] + NXs[0] * ws[0], ys[0] + NYs[0] * ws[0]);
    for (let i = 1; i < n - 1; i++) {
      const x = xs[i] + NXs[i] * ws[i], y = ys[i] + NYs[i] * ws[i], x2 = xs[i + 1] + NXs[i + 1] * ws[i + 1], y2 = ys[i + 1] + NYs[i + 1] * ws[i + 1];
      p.quadraticCurveTo(x, y, (x + x2) / 2, (y + y2) / 2);
    }
    const e = n - 1;
    p.lineTo(xs[e] + NXs[e] * ws[e], ys[e] + NYs[e] * ws[e]);
    if (ws[e] > 1e-3) p.quadraticCurveTo(xs[e] + (xs[e] - xs[e - 1]) * 0.6, ys[e] + (ys[e] - ys[e - 1]) * 0.6, xs[e] - NXs[e] * ws[e], ys[e] - NYs[e] * ws[e]);
    for (let i = e - 1; i >= 1; i--) {
      const x = xs[i] - NXs[i] * ws[i], y = ys[i] - NYs[i] * ws[i], x2 = xs[i - 1] - NXs[i - 1] * ws[i - 1], y2 = ys[i - 1] - NYs[i - 1] * ws[i - 1];
      p.quadraticCurveTo(x, y, (x + x2) / 2, (y + y2) / 2);
    }
    p.lineTo(xs[0] - NXs[0] * ws[0], ys[0] - NYs[0] * ws[0]);
    p.closePath();
  }
  /** 带子阴影的那一侧（背光面）：边缘向内 frac 宽度的一条 */
  function ribbonShade(p, xs, ys, ws, n, lx, ly, frac, u0 = 0.06, u1 = 0.94) {
    let sgn = 0;
    for (let i = 0; i < n; i++) sgn += NXs[i] * lx + NYs[i] * ly;
    sgn = sgn > 0 ? -1 : 1;
    const a = max(0, floor(u0 * (n - 1))), b = min(n - 1, ceil(u1 * (n - 1)));
    for (let i = a; i <= b; i++) { const x = xs[i] + NXs[i] * ws[i] * sgn, y = ys[i] + NYs[i] * ws[i] * sgn; if (i === a) p.moveTo(x, y); else p.lineTo(x, y); }
    for (let i = b; i >= a; i--) { const k = ws[i] * sgn * (1 - 2 * frac); p.lineTo(xs[i] + NXs[i] * k, ys[i] + NYs[i] * k); }
    p.closePath();
    return sgn;
  }
  /** 发丝线：在带子内侧离中心 off 的地方，从 u0 画到 u1 */
  function ribbonStrand(p, xs, ys, ws, n, off, u0, u1) {
    const a = max(0, floor(u0 * (n - 1))), b = min(n - 1, ceil(u1 * (n - 1)));
    p.moveTo(xs[a] + NXs[a] * ws[a] * off, ys[a] + NYs[a] * ws[a] * off);
    for (let i = a + 1; i <= b; i++) p.lineTo(xs[i] + NXs[i] * ws[i] * off, ys[i] + NYs[i] * ws[i] * off);
  }
  const ceil = Math.ceil;

  /* ---- 发顶（颅骨上的头发）+ 刘海 + 鬓角：按偏航 / 俯仰缓存 ---- */
  function capParts(D, H) {
    const lx = D.LcH[0] >= 0 ? 0.55 : -0.55, ly = D.LcH[1];
    return pathCache('cap2:' + D.hkey + ':' + H.qk + (lx > 0 ? 'R' : 'L'), () => buildCap2(H, D.hair, lx, ly));
  }
  function buildCap2(H, hr, lx, ly) {
    const rc = hr.cap, cy0 = -0.04, lobes = hr.lobes || 0, la = hr.lobeAmp || 0;
    const Rr = (a) => rc * (1 + (lobes ? la * (0.55 + 0.45 * cos(a * lobes + 0.9)) : 0));
    const dome = new Path2D(), bangs = new Path2D(), strands = new Path2D(), sheen = new Path2D(), bandSh = new Path2D();
    // 发旋（头顶偏后）
    hsph(H, PI, -0.72, 1.0, T3b);
    const wx = T3b[0], wy = T3b[1];
    if (!H.front) {
      const N = 30;
      for (let i = 0; i <= N; i++) { const a = (i / N) * TAU, r = Rr(a); if (i) dome.lineTo(cos(a) * r, cy0 + sin(a) * r); else dome.moveTo(cos(a) * r, cy0 + sin(a) * r); }
      dome.closePath();
      for (let k = 0; k < 11; k++) {
        const a = -0.25 + (k / 10) * (PI + 0.5), ex = wx + cos(a) * rc * 0.97, ey = wy + sin(a) * rc * 1.3 + 0.25;
        const ey2 = min(ey, cy0 + sqrt(max(0, rc * rc - ex * ex)) * 0.95);
        strands.moveTo(wx + cos(a) * 0.1, wy + sin(a) * 0.08);
        strands.quadraticCurveTo(wx + cos(a) * rc * 0.55 + (k % 2 ? 0.07 : -0.07), wy + sin(a) * rc * 0.42 + 0.1, ex * 0.93, ey2);
      }
      strands.moveTo(wx + 0.1, wy); strands.arc(wx, wy, 0.1, 0, PI * 1.5);
      addSheen(H, sheen, rc, true);
      return { dome, bangs: null, strands, sheen, bandSh: null };
    }
    // 正面：发顶的外轮廓（右 → 头顶 → 左）+ 发际线（左 → 额头 → 右）
    const side = hr.temple ? min(0.5, hr.temple.y - 0.2) : 0.5;
    const yb = min(0.92, cy0 + rc * 0.98);
    const a0 = Math.asin(clamp((yb - cy0) / rc, -1, 1));
    const N = 26;
    // 画外轮廓：角度从 a0（右下）逆时针经过顶部（-π/2）到 π - a0（左下）
    for (let i = 0; i <= N; i++) {
      const a = a0 - (i / N) * (PI + 2 * a0), r = Rr(a);
      if (i) dome.lineTo(cos(a) * r, cy0 + sin(a) * r); else dome.moveTo(cos(a) * r, cy0 + sin(a) * r);
    }
    // 发际线的点（从 ψ>0 一侧到 ψ<0 一侧；转到脑后的点压到轮廓上）
    const hl = hr.hl != null ? hr.hl : -0.38;
    const hlY = (psi) => hl + (0.12 - hl) * pow(min(1, abs(psi) / 1.16), 2);
    const pts = [];
    const push = (psi, y, rho) => {
      hsph(H, psi, y, rho, T3);
      let x = T3[0], yy = T3[1];
      if (T3[2] < 0.02) {
        const rr = lerp(1.0, rc, sstep(0.15, 0.7, -y));
        const edge = sqrt(max(0, rr * rr - (yy - cy0) * (yy - cy0)));
        x = x >= 0 ? edge : -edge;
      }
      pts.push(x, yy);
    };
    push(1.2, side, 1.02); push(1.17, 0.12, 1.03);
    for (let k = 0; k <= 12; k++) { const psi = 1.1 - (k / 12) * 2.2; push(psi, hlY(psi), 1.04); }
    push(-1.17, 0.12, 1.03); push(-1.2, side, 1.02);
    const xl = pts[0], yl = pts[1];
    dome.quadraticCurveTo(-rc * 0.95, yb + 0.1, xl, yl);
    for (let i = 2; i < pts.length; i += 2) dome.lineTo(pts[i], pts[i + 1]);
    dome.quadraticCurveTo(rc * 0.95, yb + 0.1, cos(a0) * Rr(a0), cy0 + sin(a0) * Rr(a0));
    dome.closePath();
    // 刘海：从分线附近长出来，沿球面垂到额头
    const part = hr.part || 0;
    const bl = hr.bangs || [];
    const bx = LXs, by = LYs, bw = LWs;
    const M = 7;
    const addBang = (psiT, yT, wHalf, curl, rootPsi, rootY, kind) => {
      let vis = 0;
      for (let i = 0; i < M; i++) {
        const u = i / (M - 1);
        const psi = lerp(rootPsi, psiT + curl * 0.1 * u * u, pow(u, 0.9)) + curl * 0.05 * sin(PI * u);
        const y = lerp(rootY, yT, pow(u, 0.85));
        hsph(H, psi, y, 1.045 + 0.015 * u, T3);
        bx[i] = T3[0]; by[i] = T3[1];
        if (T3[2] > -0.05) vis++;
        // 半宽：按这一点在屏幕上的横向缩放
        hsph(H, psi + wHalf, y, 1.045, T3c);
        bw[i] = hypot(T3c[0] - T3[0], T3c[1] - T3[1]) * lockWidth(u, kind);
      }
      if (vis < 2) return false;
      ribbon(bangs, bx, by, bw, M);
      ribbonShade(bandSh, bx, by, bw, M, lx, ly, 0.34, 0.1, 0.95);
      ribbonStrand(strands, bx, by, bw, M, 0.25 * (curl >= 0 ? 1 : -1), 0.12, 0.72);
      return true;
    };
    for (const [psiT, yT, wHalf, curl] of bl) {
      const rootPsi = part + (psiT - part) * 0.34, rootY = hlY(rootPsi) - 0.2;
      addBang(psiT, yT, wHalf, curl, rootPsi, rootY, 1);
    }
    if (hr.temple) {
      // 鬓角：贴着脸颊垂下来（发梢在下颌外侧，不往脸上勾）
      const tp = hr.temple;
      for (const sd of [1, -1]) {
        hsph(H, sd * 1.1, -0.08, 1.045, T3);
        if (T3[2] < -0.08) continue;
        const x0 = T3[0], y0 = T3[1];
        hproj(H, sd * 1.02, tp.y * 0.45, 0.34, T3b);
        hproj(H, sd * (0.9 + 0.08 * tp.curl), tp.y, 0.4, T3c);
        for (let i = 0; i < M; i++) {
          const u = i / (M - 1), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
          bx[i] = a * x0 + b * T3b[0] + c * T3c[0] + sd * tp.curl * 0.06 * sin(PI * u) * (H.cy);
          by[i] = a * y0 + b * T3b[1] + c * T3c[1];
          bw[i] = tp.w * (0.55 + 0.45 * abs(H.cy)) * lockWidth(u, 0) + 0.01;
        }
        ribbon(bangs, bx, by, bw, M);
        ribbonShade(bandSh, bx, by, bw, M, lx, ly, 0.34, 0.1, 0.95);
        ribbonStrand(strands, bx, by, bw, M, 0.2 * sd, 0.12, 0.7);
      }
    }
    // 从发旋到刘海的几道发丝
    for (const [psiT, yT] of bl) {
      hsph(H, part + (psiT - part) * 0.2, -0.78, 1.1, T3);
      hsph(H, part + (psiT - part) * 0.55, hlY(psiT) - 0.12, 1.06, T3c);
      if (T3[2] > 0 && T3c[2] > 0) { strands.moveTo(T3[0], T3[1]); strands.quadraticCurveTo((T3[0] + T3c[0]) / 2 + 0.04 * (psiT - part), (T3[1] + T3c[1]) / 2 - 0.05, T3c[0], T3c[1]); }
    }
    addSheen(H, sheen, rc, false);
    return { dome, bangs, strands, sheen, bandSh };
  }
  /** 头顶的高光：沿纬线的一圈短笔触（跟着头的弧度走） */
  function addSheen(H, p, rc, back) {
    const n = 15;
    for (let k = 0; k < n; k++) {
      const psi = (back ? PI : 0) + (-1.25 + (k / (n - 1)) * 2.5);
      hsph(H, psi, -0.58, rc * 0.99, T3);
      if (T3[2] < 0.12) continue;
      hsph(H, psi + 0.035, -0.7, rc * 0.99, T3b);
      hsph(H, psi - 0.03, -0.43 - (k % 2) * 0.05, rc * 0.99, T3c);
      const w = 0.035 + 0.02 * (k % 3 === 0 ? 1 : 0);
      p.moveTo(T3b[0] - w, T3b[1]); p.lineTo(T3b[0] + w, T3b[1]); p.lineTo(T3c[0] + w * 0.4, T3c[1]); p.lineTo(T3c[0] - w * 0.4, T3c[1]); p.closePath();
    }
  }
  function hairGrad(pal) {
    return linG('hcap2:' + pal.c, 0, -1.2, 0, 0.95, [0, lt(pal.c, 0.16), 0.42, pal.c, 1, pal.sh]);
  }
  function bangGrad(pal) {
    return linG('bang2:' + pal.c, 0, -0.55, 0, 0.5, [0, mix(pal.c, pal.sh, 0.3), 0.55, pal.c, 1, mix(pal.c, pal.lt, 0.18)]);
  }
  function hairTipGrad(pal, len) {
    return linG('hback2:' + pal.c + ':' + pal.tip + ':' + len.toFixed(2), 0, -0.3, 0, len, [0, pal.sh, 0.25, pal.c, 0.6, pal.c, 0.86, mix(pal.c, pal.tip, 0.72), 1, pal.tip]);
  }

  /* ---- 一组头发（后发 / 鬓发 / 马尾）：一次描外轮廓、一次填色、一次阴影、一次发丝线 ---- */
  function hairGroupBegin(D) {
    const HG = D.HG || (D.HG = { p: null, sh: null, st: null, hi: null });
    HG.p = new Path2D(); HG.sh = new Path2D(); HG.st = new Path2D(); HG.hi = new Path2D();
    return HG;
  }
  function hairGroupEnd(D, HG, grad, pal, inkK = 1) {
    const g = D.g;
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.lineWidth = D.inkO * 2 * inkK; g.strokeStyle = D.sil || pal.ink; g.stroke(HG.p);
    g.fillStyle = D.sil || grad; g.fill(HG.p);
    if (D.sil) return;
    if (D.shade > 0 && D.lod >= 1) { g.globalAlpha = D.ga * 0.55 * D.shade; g.fillStyle = pal.dk || pal.sh; g.fill(HG.sh); g.globalAlpha = D.ga; }
    if (D.lod >= 1) { g.lineWidth = D.inkI; g.strokeStyle = rgba(pal.ink, 0.5); g.stroke(HG.st); }
    if (D.lod >= 2) { g.globalAlpha = D.ga * 0.45; g.fillStyle = pal.lt; g.fill(HG.hi); g.globalAlpha = D.ga; }
  }
  /** 一束会动的头发：给 3 个控制点（头部空间，已投影），生成中心线 → 摆动 → 卷 → 带子 */
  function hairLock(D, HG, x0, y0, x1, y1, x2, y2, len, wMax, k, o) {
    const n = D.lod >= 2 ? 13 : D.lod >= 1 ? 10 : 7;
    const xs = LXs, ys = LYs, ws = LWs;
    const wave = o.wave || 0, ph = o.ph || 0, t = D.P.t;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      let X = a * x0 + b * x1 + c * x2, Y = a * y0 + b * y1 + c * y2;
      if (D.grot) { const dx = X - x0, dy = Y - y0, cr = cos(D.grot), sr = sin(D.grot); X = x0 + dx * cr - dy * sr; Y = y0 + dx * sr + dy * cr; }
      X += swayX(D, u, k) * (o.swayK || 1) + wave * sin(u * 7.2 + ph + 0.35 * sin(t * 0.8 + k)) * (0.25 + u);
      Y += swayY(D, u, k) * (o.swayK || 1);
      xs[i] = X; ys[i] = Y;
    }
    if (o.curl) curlTail(xs, ys, n, o.curl, o.curlDir || 1, o.curlFrom || 0.66);
    for (let i = 0; i < n; i++) { const u = i / (n - 1); ws[i] = wMax * lockWidth(u, o.curl ? 2 : 0) * (o.thinRoot ? 0.4 + 0.6 * sstep(0, 0.22, u) : 1); }
    ribbon(HG.p, xs, ys, ws, n);
    if (D.lod >= 1) {
      ribbonShade(HG.sh, xs, ys, ws, n, D.LcH[0], D.LcH[1], 0.3, 0.08, 0.92);
      ribbonStrand(HG.st, xs, ys, ws, n, (k % 2 ? 0.3 : -0.3), 0.14, 0.8);
      if (D.lod >= 2) { const a = 1, b2 = min(n - 2, 4); HG.hi.moveTo(xs[a] + NXs[a] * ws[a] * 0.1, ys[a]); for (let i = a + 1; i <= b2; i++) HG.hi.lineTo(xs[i] + NXs[i] * ws[i] * 0.5, ys[i]); for (let i = b2; i >= a; i--) HG.hi.lineTo(xs[i] + NXs[i] * ws[i] * 0.15, ys[i]); HG.hi.closePath(); }
    }
    return xs;
  }
  /* 头发的二次运动（纯函数）：u 为沿发束的位置（0 根部 → 1 发梢），k 为发束编号 */
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

  /** 后发：n 束，从脑后垂到背上（下半段跟着身体朝向） */
  function drawBackHair(D, H) {
    const hr = D.hair, bk = hr && hr.back;
    if (!bk) return;
    const n = D.lod === 0 ? max(3, bk.n - 3) : bk.n;
    const HG = hairGroupBegin(D);
    const cyb = D.P.cy, syb = D.P.sy;
    const SH = BSH;
    let ns = 0;
    for (let k = 0; k < n; k++) {
      const q = n > 1 ? -1 + (2 * k) / (n - 1) : 0;
      hsph(H, PI + q * 1.38, bk.top + 0.12 * q * q, 1.03, T3);
      const rx = T3[0], ry = T3[1];
      const lenK = bk.len * (1 - bk.var * hash(k + 3, 11)) * (1 - 0.1 * q * q);
      // 根部在 ψ = π + 1.38q（s = -sin(1.38q)）：中段和发梢要在同一侧，发束才不会在脑后交叉
      const sm = -q * (hr.cap * 1.02), fm = -0.62 - 0.1 * (1 - q * q);
      const mx = -sm * cyb + fm * syb, my = min(1.1, 0.46 * lenK);
      const st = -q * bk.spread, ft = -0.52 - 0.2 * (1 - q * q);
      const tx = -st * cyb + ft * syb, ty = lenK;
      const w = bk.w * 1.22 * (0.9 + 0.2 * hash(k, 5));
      const dir = (tx - rx) >= 0 ? 1 : -1;
      const xs = hairLock(D, HG, rx, ry, mx, my, tx, ty, lenK, w, k, { wave: bk.wave, ph: k * 1.7, curl: bk.curl ? bk.curl * (0.75 + 0.5 * hash(k, 9)) : 0, curlDir: bk.curl < 0 ? -dir : dir, curlFrom: 0.62 });
      // 记下根部与 60% 处，拼成后面那一整片头发（发束之间不会露出空隙）
      const nn = D.lod >= 2 ? 13 : D.lod >= 1 ? 10 : 7, im = Math.round(0.6 * (nn - 1));
      SH[ns * 4] = xs[0]; SH[ns * 4 + 1] = LYs[0]; SH[ns * 4 + 2] = xs[im]; SH[ns * 4 + 3] = LYs[im]; ns++;
    }
    if (ns >= 2) {
      const pts = BSP; pts.length = 0;
      for (let k = 0; k < ns; k++) pts.push(SH[k * 4], SH[k * 4 + 1]);
      for (let k = ns - 1; k >= 0; k--) pts.push(SH[k * 4 + 2], SH[k * 4 + 3]);
      polySign(HG.p, pts, -1);
    }
    hairGroupEnd(D, HG, hairTipGrad(hr.pal, bk.len), hr.pal);
  }
  const BSH = new Float64Array(96), BSP = [];
  /** 多边形（扁平数组），按指定方向加入：sign = -1 与发束带子同向（非零规则下取并集） */
  function polySign(p, a, sign) {
    let s = 0;
    const n = a.length >> 1;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += a[i * 2] * a[j * 2 + 1] - a[j * 2] * a[i * 2 + 1]; }
    if (s * sign >= 0) { p.moveTo(a[0], a[1]); for (let i = 1; i < n; i++) p.lineTo(a[i * 2], a[i * 2 + 1]); }
    else { p.moveTo(a[(n - 1) * 2], a[(n - 1) * 2 + 1]); for (let i = n - 2; i >= 0; i--) p.lineTo(a[i * 2], a[i * 2 + 1]); }
    p.closePath();
  }
  /** 鬓边垂到胸前的长发束（sd = +1 角色右侧 / -1 左侧） */
  function drawSideLocks(D, H, sd) {
    const hr = D.hair, list = hr && hr.sides;
    if (!list) return;
    const HG = hairGroupBegin(D);
    let any = 0;
    for (let k = 0; k < list.length; k++) {
      const lk = list[k];
      if (lk.one) { if (sd !== (lk.psi > 0 ? 1 : -1)) continue; }
      const psi = sd * abs(lk.psi);
      // 根部藏在发顶的头发里（从耳朵上方长出来），根部细、往下变宽再收尖
      hsph(H, psi, lk.y0 - 0.32, 1.06, T3);
      if (T3[2] < -0.35) continue;
      const r0x = T3[0], r0y = T3[1];
      hproj(H, sd * (1.02 + lk.out * 0.5), lk.y0 + (lk.len - lk.y0) * 0.4, 0.22, T3b);
      hproj(H, sd * (0.86 + lk.out), lk.len, 0.34, T3c);
      const outward = T3c[0] - r0x >= 0 ? 1 : -1;
      hairLock(D, HG, r0x, r0y, T3b[0], T3b[1], T3c[0], T3c[1], lk.len, lk.w * 1.1, 10 + k * 3 + (sd > 0 ? 0 : 1), { wave: lk.wave, ph: k * 2.1 + (sd > 0 ? 0 : 1.3), curl: lk.curl, curlDir: lk.curl < 0 ? -outward : outward, curlFrom: 0.6, swayK: 0.85, thinRoot: 1 });
      any++;
    }
    if (any) hairGroupEnd(D, HG, hairTipGrad(hr.pal, 2.2), hr.pal);
  }

  /** 马尾：侧马尾（纯烬）/ 高马尾（野餐）/ 低马尾；orn：装饰 */
  function drawPony(D, H, pn, part) {
    const g = D.g, pal = D.hair.pal;
    hsph(H, pn.psi, pn.y, 1.05, T3);
    const x0 = T3[0], y0 = T3[1];
    const HG = hairGroupBegin(D);
    if (part !== 'orn') {
      let c1, c2;
      if (pn.high) { hproj(H, 0, pn.y - 0.2, -1.25, T3b); hproj(H, 0, pn.len * 0.6, -1.25, T3c); }
      else if (pn.low) { hproj(H, 0, pn.y + 0.35, -1.1, T3b); hproj(H, 0, pn.len, -0.95, T3c); }
      else { const sd = pn.psi >= 0 ? 1 : -1; hproj(H, sd * 1.46, pn.y + 0.15, -0.15, T3b); hproj(H, sd * 1.22, pn.len, -0.55, T3c); }
      c1 = [T3b[0], T3b[1]]; c2 = [T3c[0], T3c[1]];
      const n = 3;
      for (let k = 0; k < n; k++) {
        const q = k - 1, spread = pn.w * 0.4 * q;
        const outward = c2[0] - x0 >= 0 ? 1 : -1;
        hairLock(D, HG, x0 + spread * 0.2, y0, c1[0] + spread, c1[1], c2[0] + spread * 1.6, c2[1] - abs(q) * 0.15, pn.len, pn.w * 0.5, 20 + k, { wave: 0.09, ph: k * 1.9, curl: (pn.curl || 0) * (0.8 + 0.2 * k), curlDir: outward * (k === 1 ? -1 : 1), curlFrom: 0.58, swayK: 1.2 });
      }
      hairGroupEnd(D, HG, hairTipGrad(pal, pn.len + 0.4), pal);
    }
    if (part === 'body') return;
    if (pn.orn === 'leaves') drawLeafOrnament(D, x0, y0, pn.psi >= 0 ? 1 : -1);
  }
  /** 纯烬的发饰：两片红叶、一片粉紫、两片蓝（和法杖上的叶子一样） */
  function drawLeafOrnament(D, x, y, sd) {
    const g = D.g, t = D.P.t;
    const leaves = [[-2.2, 0.62, '#d8323c'], [-1.75, 0.56, '#e8505a'], [-1.25, 0.46, '#b0409a'], [-0.85, 0.44, '#4a78d8'], [-0.5, 0.38, '#6aa6ee']];
    for (const [a0, L, c] of leaves) {
      const a = (sd > 0 ? a0 : -PI - a0) + 0.05 * sin(t * 1.7 + a0 * 3);
      const ex = x + cos(a) * L, ey = y + sin(a) * L, nx = -sin(a), ny = cos(a), w = L * 0.34;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + cos(a) * L * 0.5 + nx * w, y + sin(a) * L * 0.5 + ny * w, ex, ey);
      g.quadraticCurveTo(x + cos(a) * L * 0.5 - nx * w, y + sin(a) * L * 0.5 - ny * w, x, y);
      fillC(D, c); inkC(D, D.inkH * 0.7, inkOf(c));
      if (!D.sil && D.lod >= 2) { g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.lineWidth = D.inkH * 0.4; g.strokeStyle = rgba('#ffffff', 0.5); g.stroke(); }
    }
    g.beginPath(); g.arc(x, y, 0.08, 0, TAU); fillC(D, '#c8323c'); inkC(D, D.inkH * 0.6, '#5a1418');
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
      if (!D.sil && D.lod >= 1) { g.beginPath(); g.moveTo(sg * 0.25, -0.05); g.quadraticCurveTo(sg * 0.7, -0.2, sg * 0.95, 0.02); g.lineWidth = lw * 0.6; g.strokeStyle = rgba(ink, 0.6); g.stroke(); }
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
    hsph(H, ah.psi, -0.97, D.hair.cap * 0.99, T3);
    const x0 = T3[0], y0 = T3[1];
    const bob = (P.mv ? (P.run ? 0.35 : 0.2) * sin(2 * P.ph - 1.4) : 0) + 0.08 * sin(P.t * 2.3) + (P.air ? -P.vy * 0.3 : 0) + D.windX * 0.25;
    const dir = H.sy >= 0 ? 1 : -1, L = ah.len, c = ah.curl || 1;
    const a = -HP + 0.25 * dir + bob;
    const x1 = x0 + cos(a) * L * 0.62, y1 = y0 + sin(a) * L * 0.62;
    const a2 = a + 1.15 * c * dir + bob * 0.8;
    const x2 = x1 + cos(a2) * L * 0.55, y2 = y1 + sin(a2) * L * 0.55;
    const a3 = a2 + 0.9 * c * dir;
    const x3 = x2 + cos(a3) * L * 0.25, y3 = y2 + sin(a3) * L * 0.25;
    g.beginPath();
    g.moveTo(x0 - 0.045, y0 + 0.03);
    g.bezierCurveTo(x1 - 0.035 * dir, y1 - 0.015, x2 - 0.02 * dir, y2 - 0.01, x3, y3);
    g.bezierCurveTo(x2 + 0.03 * dir, y2 + 0.04, x1 + 0.06 * dir, y1 + 0.05, x0 + 0.05, y0 + 0.03);
    g.closePath();
    fillC(D, pal.c); inkC(D, D.inkH * 0.8, pal.ink);
  }
  /** 术师头顶一侧的小揪揪（红色发绳） */
  function drawTuft(D, H, tf) {
    const g = D.g, pal = D.hair.pal, P = D.P;
    hsph(H, tf.psi, tf.y, D.hair.cap * 1.0, T3);
    if (T3[2] < -0.4) return;
    const x0 = T3[0], y0 = T3[1], sd = T3[0] >= 0 ? 1 : -1;
    const sw = 0.06 * sin(P.t * 2.1) + (P.mv ? 0.1 * sin(2 * P.ph - 1) : 0) + D.windX * 0.2;
    const L = tf.len;
    g.beginPath();
    g.moveTo(x0 - 0.07, y0 + 0.03);
    g.bezierCurveTo(x0 + sd * L * 0.2 - 0.05, y0 - L * 0.55, x0 + sd * L * 0.9, y0 - L * 0.62 + sw, x0 + sd * L * 1.05, y0 - L * 0.1 + sw);
    g.bezierCurveTo(x0 + sd * L * 0.8, y0 - L * 0.3 + sw, x0 + sd * L * 0.35, y0 - L * 0.28, x0 + 0.07, y0 + 0.04);
    g.closePath();
    fillC(D, pal.c); inkC(D, D.inkH * 0.8, pal.ink);
    if (!D.sil) { g.beginPath(); g.ellipse(x0, y0 - 0.02, 0.075, 0.06, 0.3 * sd, 0, TAU); g.fillStyle = tf.tie; g.fill(); g.lineWidth = D.inkH * 0.5; g.strokeStyle = inkOf(tf.tie); g.stroke(); }
  }
  /** 卡提亚的乱发：两侧翻出来的几缕 */
  function drawTufts(D, H, n, seed) {
    const g = D.g, pal = D.hair.pal, rc = D.hair.cap;
    const t = D.P.t, sway = 0.05 * sin(t * 1.7 + seed) + (D.P.mv ? 0.06 * sin(2 * D.P.ph) : 0);
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const side0 = k % 2 ? 1 : -1, a = side0 > 0 ? -0.1 - (k >> 1) * 0.4 - hash(seed, k) * 0.12 : -PI + 0.1 + (k >> 1) * 0.4 + hash(seed, k) * 0.12;
      const r0 = rc * 0.95, x = cos(a) * r0, y = -0.04 + sin(a) * r0;
      const l = 0.3 + hash(seed, k, 2) * 0.16, wdt = 0.05 + hash(seed, k, 4) * 0.03;
      const side = cos(a) >= 0 ? 1 : -1;
      const ang = a + side * (1.0 + hash(seed, k, 3) * 0.4) + sway;
      const ex = x + cos(ang) * l, ey = y + sin(ang) * l;
      const nx = -sin(a), ny = cos(a);
      g.moveTo(x + nx * wdt, y + ny * wdt);
      g.quadraticCurveTo(x + cos(a) * l * 0.9 + nx * wdt * 0.2, y + sin(a) * l * 0.9 + ny * wdt * 0.2, ex, ey);
      g.quadraticCurveTo(x + cos(a) * l * 0.35 - nx * wdt * 0.3, y + sin(a) * l * 0.35 - ny * wdt * 0.3, x - nx * wdt, y - ny * wdt);
      g.closePath();
    }
    fillC(D, pal.c); inkC(D, D.inkH * 0.7, pal.ink);
  }

  /* ---- 羊角 ---- */
  function hornPaths(D, H, hs, sd) {
    return pathCache('horn2:' + keyOf(hs) + ':' + sd + ':' + H.qk, () => {
      const N = hs.style === 'bar' ? 22 : 28, cx = [], cyy = [], cz = [], w = [];
      const psi = sd * hs.psi, y0 = hs.y;
      const rr = sqrt(max(0, 1 - y0 * y0)) * 0.95;
      const s0 = rr * sin(psi), v0 = y0 * 0.95, f0 = rr * cos(psi);
      if (hs.style === 'bar') {
        // 卡提亚：先向后上方，再向下，角尖向外翘
        // 卡提亚：从头顶两侧向外、向后压下去，角尖在耳朵上方往外翘（像车把）
        const P1 = [s0 + sd * 0.42, v0 - 0.08, f0 - 0.3], P2 = [s0 + sd * 0.7, v0 + 0.66, f0 - 0.5], P3 = [s0 + sd * 0.92, v0 + 0.5, f0 - 0.1];
        for (let i = 0; i <= N; i++) {
          const u = i / N, a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
          hproj(H, a * s0 + b * P1[0] + c * P2[0] + d * P3[0], a * v0 + b * P1[1] + c * P2[1] + d * P3[1], a * f0 + b * P1[2] + c * P2[2] + d * P3[2], T3);
          cx.push(T3[0]); cyy.push(T3[1]); cz.push(T3[2]);
          w.push(hs.w * (1 - 0.72 * pow(u, 1.1)) + 0.02);
        }
      } else {
        const phi0 = -0.5, Phi = hs.turn * PI, r0 = hs.r;
        const cF = f0 - r0 * cos(phi0), cV = v0 - r0 * sin(phi0);
        for (let i = 0; i <= N; i++) {
          const u = i / N, ph = phi0 - Phi * u, r = r0 * (1 - (hs.style === 'big' ? 0.62 : 0.52) * pow(u, 1.2));
          const s = s0 + sd * (hs.out * pow(u, 0.5));
          const f = cF + r * cos(ph), v = cV + r * sin(ph);
          hproj(H, s, v, f, T3);
          cx.push(T3[0]); cyy.push(T3[1]); cz.push(T3[2]);
          w.push(hs.w * (1 - 0.78 * pow(u, 1.15)) + 0.02);
        }
      }
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
      const turnSign = t0x * t1y - t0y * t1x;
      const IN = turnSign > 0 ? R : L, OUT = turnSign > 0 ? L : R;
      const out = new Path2D();
      out.moveTo(L[0][0], L[0][1]);
      for (let i = 1; i <= N; i++) out.lineTo(L[i][0], L[i][1]);
      const ex = cx[N] - cx[N - 1], ey = cyy[N] - cyy[N - 1], el = hypot(ex, ey) || 1e-6;
      out.quadraticCurveTo(cx[N] + (ex / el) * w[N] * 1.1, cyy[N] + (ey / el) * w[N] * 1.1, R[N][0], R[N][1]);
      for (let i = N - 1; i >= 0; i--) out.lineTo(R[i][0], R[i][1]);
      { const tx0 = cx[1] - cx[0], ty0 = cyy[1] - cyy[0], tl0 = hypot(tx0, ty0) || 1e-6; out.quadraticCurveTo(cx[0] - tx0 / tl0 * w[0] * 0.7, cyy[0] - ty0 / tl0 * w[0] * 0.7, L[0][0], L[0][1]); }
      out.closePath();
      const i3 = 4, grad = gctx.createLinearGradient(cx[0], cyy[0], cx[i3], cyy[i3]);
      grad.addColorStop(0, hs.pal.c1); grad.addColorStop(0.7, hs.pal.c0); grad.addColorStop(1, hs.pal.c0);
      const sh = new Path2D();
      sh.moveTo(IN[0][0], IN[0][1]);
      for (let i = 1; i <= N; i++) sh.lineTo(IN[i][0], IN[i][1]);
      for (let i = N; i >= 0; i--) sh.lineTo(cx[i] * 0.55 + IN[i][0] * 0.45, cyy[i] * 0.55 + IN[i][1] * 0.45);
      sh.closePath();
      const edge = new Path2D();
      edge.moveTo(OUT[1][0], OUT[1][1]);
      for (let i = 2; i <= N; i++) edge.lineTo(OUT[i][0], OUT[i][1]);
      const hi = new Path2D();
      hi.moveTo(cx[2] * 0.4 + OUT[2][0] * 0.6, cyy[2] * 0.4 + OUT[2][1] * 0.6);
      for (let i = 3; i < N - 3; i++) hi.lineTo(cx[i] * 0.4 + OUT[i][0] * 0.6, cyy[i] * 0.4 + OUT[i][1] * 0.6);
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
    g.lineJoin = 'round';
    g.lineWidth = D.inkH * 1.9; g.strokeStyle = D.sil || pal.ink; g.stroke(hp.out);
    fillP(D, hp.out, D.sil ? null : D.lod >= 1 ? hp.grad : pal.c0);
    if (!D.sil && D.lod >= 1) {
      g.globalAlpha = D.ga * 0.9; g.fillStyle = pal.c1; g.fill(hp.sh); g.globalAlpha = D.ga;
      g.lineCap = 'round';
      g.lineWidth = D.inkH * (D.lod >= 2 ? 0.75 : 0.6); g.strokeStyle = pal.c2; g.stroke(hp.rid);
      if (D.lod >= 2) { g.lineWidth = D.inkH * 0.9; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.stroke(hp.hi); }
    }
    if (D.sil && D.rimC && !D.rimPass) { g.lineCap = 'round'; g.lineWidth = D.inkH * 1.3; g.strokeStyle = D.rimC; g.globalAlpha = D.ga * 0.85; g.stroke(hp.edge); g.globalAlpha = D.ga; }
  }

  /* ---- 耳朵 ---- */
  function drawEar(D, H, sd) {
    const C = D.C, g = D.g, P = D.P;
    if (C.ear === 'sheep') {
      const EC = C.ears || EARS.adele;
      hsph(H, sd * (HP + 0.14), 0.1, 0.97, T3);
      const rx = T3[0], ry = T3[1];
      hproj(H, sd * 0.82, 0.5, -0.32, T3b);
      const flop = (P.mv ? (P.run ? 0.28 : 0.14) * sin(2 * P.ph - 0.9 + sd) : 0) + 0.05 * sin(P.t * 1.7 + sd * 2) + (P.floaty ? -0.2 : 0);
      let dx = T3b[0], dy = T3b[1];
      const dl = hypot(dx, dy) || 1e-6; dx /= dl; dy /= dl;
      const fa = flop * (dx >= 0 ? 1 : -1);
      const cdx = dx * cos(fa) - dy * sin(fa), cdy = dx * sin(fa) + dy * cos(fa);
      const len = 0.52 * (C.sheepEar || 1) * (0.55 + 0.45 * min(1, dl / 0.8)), wid = 0.2 * (C.sheepEar || 1);
      const nx = -cdy, ny = cdx;
      const tx = rx + cdx * len, ty = ry + cdy * len;
      g.beginPath();
      g.moveTo(rx + nx * wid * 0.45, ry + ny * wid * 0.45);
      g.quadraticCurveTo(rx + cdx * len * 0.55 + nx * wid, ry + cdy * len * 0.55 + ny * wid, tx, ty);
      g.quadraticCurveTo(rx + cdx * len * 0.55 - nx * wid * 0.9, ry + cdy * len * 0.55 - ny * wid * 0.9, rx - nx * wid * 0.45, ry - ny * wid * 0.45);
      g.closePath();
      g.lineWidth = D.inkH * 1.6; g.strokeStyle = D.sil || EC.ink; g.stroke();
      fillC(D, EC.c);
      if (!D.sil && D.lod >= 1) {
        g.beginPath();
        g.moveTo(rx + cdx * len * 0.12, ry + cdy * len * 0.12);
        g.quadraticCurveTo(rx + cdx * len * 0.55 + nx * wid * 0.45, ry + cdy * len * 0.55 + ny * wid * 0.45, rx + cdx * len * 0.86, ry + cdy * len * 0.86);
        g.quadraticCurveTo(rx + cdx * len * 0.5 - nx * wid * 0.3, ry + cdy * len * 0.5 - ny * wid * 0.3, rx + cdx * len * 0.12, ry + cdy * len * 0.12);
        g.fillStyle = EC.in; g.fill();
      }
    } else if (C.ear === 'rabbit') {
      hsph(H, sd * 0.42, -0.86, 1.02, T3);
      const bx = T3[0], by = T3[1];
      const bounce = (P.mv ? (P.run ? 0.22 : 0.1) * sin(2 * P.ph - 0.6 + sd) : 0) + 0.04 * sin(P.t * 1.9 + sd);
      const tilt = sd * 0.22 * H.cy - 0.18 * H.sy + bounce + (P.expr === 'sad' ? sd * 0.5 : 0);
      const L1 = 0.72, L2 = 0.62, wd = 0.2;
      const fold = sd < 0 ? 1.05 : 0.18;
      const a1 = -HP + tilt, a2 = a1 + fold * (sd < 0 ? 1 : -1) * (H.sy >= 0 ? 1 : -1);
      const mx = bx + cos(a1) * L1, my = by + sin(a1) * L1;
      const ex = mx + cos(a2) * L2, ey = my + sin(a2) * L2;
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
      g.lineWidth = D.inkH * 1.6; g.strokeStyle = D.sil || D.hair.pal.ink; g.stroke();
      fillC(D, earC);
      if (!D.sil && D.lod >= 1) { g.save(); g.translate(bx, by); g.scale(0.55, 0.78); g.translate(-bx, -by); g.beginPath(); earPath(0.8); g.restore(); g.fillStyle = '#f5b8bc'; g.fill(); }
    } else if (C.ear === 'animal') {
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
      hsph(H, sd * (HP - 0.05), 0.26, 1.0, T3);
      if (T3[2] < -0.3) return;
      const w = 0.13 * (0.3 + 0.7 * abs(H.sy)) + 0.04, h = 0.2;
      g.beginPath(); g.ellipse(T3[0], T3[1], w, h, 0, 0, TAU);
      fillC(D, D.C.skin.c); inkC(D, D.inkH * 0.7, D.C.skin.ink);
      if (D.C.earring && !D.sil && sd < 0 && T3[2] > -0.1) {
        g.beginPath(); roundRectP(g, T3[0] - 0.025, T3[1] + h * 0.85, 0.05, 0.3, 0.02); g.fillStyle = D.C.earring; g.fill(); g.lineWidth = D.inkH * 0.4; g.strokeStyle = '#8a8478'; g.stroke();
      }
    }
  }
  /** 黎博利的耳羽（凯勒）：从鬓边向后上方翘起的深色羽毛 */
  function drawPlume(D, H) {
    const pl = D.C.plume, g = D.g, P = D.P;
    if (!pl) return;
    hsph(H, -1.05, -0.5, D.hair.cap * 1.0, T3);
    const bx = T3[0], by = T3[1];
    const flut = 0.05 * sin(P.t * 2.1) + (P.mv ? 0.07 * sin(2 * P.ph) : 0);
    const back = H.sy >= 0 ? 1 : -1;
    for (let k = 0; k < 3; k++) {
      const a = -PI * 0.5 + back * (0.9 - k * 0.3) + flut * (k + 1) * 0.5;
      const len = 0.62 - k * 0.14, wd = 0.13 - k * 0.025;
      const ex = bx + cos(a) * len, ey = by + sin(a) * len, nx = -sin(a), ny = cos(a);
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(bx + cos(a) * len * 0.5 + nx * wd, by + sin(a) * len * 0.5 + ny * wd, ex, ey);
      g.quadraticCurveTo(bx + cos(a) * len * 0.5 - nx * wd, by + sin(a) * len * 0.5 - ny * wd, bx, by);
      fillC(D, k === 0 ? pl.c : mix(pl.c, pl.tip, 0.3 * k)); inkC(D, D.inkH * 0.6, '#16161c');
      if (!D.sil && D.lod >= 1) { g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + cos(a) * len * 0.85, by + sin(a) * len * 0.85); g.lineWidth = D.inkH * 0.35; g.strokeStyle = rgba(pl.tip, 0.8); g.stroke(); }
    }
  }

  /* ---- 眼睛 v2（眼睛局部空间：单位方框，外眼角朝 +x）---- */
  const EYESHAPE = {
    round: { lid: [-0.54, 0.16, -0.44, -0.46, 0.36, -0.56, 0.66, -0.04], low: [0.6, 0.5, 0.02, 0.6, -0.46, 0.5], iris: [0.02, 0.1, 0.44, 0.53], flick: 1, pupil: 0.21 },
    almond: { lid: [-0.54, 0.12, -0.38, -0.42, 0.4, -0.5, 0.68, -0.08], low: [0.6, 0.46, 0.02, 0.56, -0.46, 0.44], iris: [0.03, 0.08, 0.41, 0.5], flick: 1, pupil: 0.19 },
    soft: { lid: [-0.52, 0.04, -0.3, -0.38, 0.42, -0.36, 0.68, 0.12], low: [0.6, 0.46, 0.02, 0.5, -0.46, 0.38], iris: [0.05, 0.1, 0.38, 0.46], flick: 0.55, pupil: 0.17 },
    calm: { lid: [-0.54, 0.06, -0.3, -0.28, 0.38, -0.32, 0.68, 0.02], low: [0.6, 0.34, 0.02, 0.42, -0.46, 0.3], iris: [0.04, 0.1, 0.36, 0.43], flick: 0, pupil: 0.15, lidK: 0.16 },
    sharp: { lid: [-0.52, 0.1, -0.3, -0.32, 0.38, -0.42, 0.68, -0.16], low: [0.6, 0.28, 0.02, 0.4, -0.46, 0.32], iris: [0.05, 0.07, 0.35, 0.41], flick: 0.35, pupil: 0.15 },
    cool: { lid: [-0.54, 0.08, -0.34, -0.36, 0.38, -0.42, 0.68, -0.02], low: [0.6, 0.42, 0.02, 0.48, -0.46, 0.36], iris: [0.05, 0.09, 0.39, 0.46], flick: 0, pupil: 0.17, lidK: 0.08 },
  };
  const EYEP = new Map();
  function eyePaths(shapeKey, lashK) {
    const key = shapeKey + ':' + lashK;
    let E2 = EYEP.get(key);
    if (E2) return E2;
    const S = EYESHAPE[shapeKey] || EYESHAPE.round, [x0, y0, c1x, c1y, c2x, c2y, x3, y3] = S.lid, lw = S.low;
    const cub = (u) => { const a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3; return [a * x0 + b * c1x + c * c2x + d * x3, a * y0 + b * c1y + c * c2y + d * y3]; };
    const open = new Path2D();
    open.moveTo(x0, y0); open.bezierCurveTo(c1x, c1y, c2x, c2y, x3, y3);
    open.quadraticCurveTo(lw[0], lw[1], lw[2], lw[3]); open.quadraticCurveTo(lw[4], lw[5], x0, y0); open.closePath();
    // 上睫毛：沿上眼睑的一条月牙，外眼角带一个上挑
    const N = 14, P = [], O = [];
    const th0 = 0.13 * lashK;
    for (let i = 0; i <= N; i++) {
      const u = i / N, p = cub(u), q = cub(min(1, u + 0.02)), r = cub(max(0, u - 0.02));
      let tx = q[0] - r[0], ty = q[1] - r[1]; const tl = hypot(tx, ty) || 1e-6; tx /= tl; ty /= tl;
      let nx = ty, ny = -tx; if (ny > 0) { nx = -nx; ny = -ny; }
      const th = th0 * (0.28 + 0.72 * pow(sin(PI * min(1, u * 1.08)), 0.55)) + (u > 0.8 ? th0 * 0.25 * (u - 0.8) / 0.2 : 0);
      P.push(p); O.push([p[0] + nx * th, p[1] + ny * th]);
    }
    const lash = new Path2D();
    lash.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i <= N; i++) lash.lineTo(P[i][0], P[i][1]);
    const fl = S.flick;
    if (fl > 0) lash.lineTo(x3 + 0.2 * fl, y3 - 0.15 * fl);
    for (let i = N; i >= 0; i--) lash.lineTo(O[i][0], O[i][1]);
    lash.closePath();
    // 细节：外眼角的几根睫毛、双眼皮、下睫毛
    const spikes = new Path2D();
    if (fl > 0) for (const u of [0.72, 0.86]) { const i = Math.round(u * N), o = O[i]; spikes.moveTo(o[0] - 0.03, o[1] + 0.01); spikes.lineTo(o[0] + 0.12 * fl, o[1] - 0.12 * fl); spikes.lineTo(o[0] + 0.05, o[1] + 0.02); spikes.closePath(); }
    const crease = new Path2D();
    for (let i = 3; i <= N - 2; i++) { const p = P[i], o = O[i]; const x = p[0] + (o[0] - p[0]) * 2.2, y = p[1] + (o[1] - p[1]) * 2.2 - 0.05; if (i === 3) crease.moveTo(x, y); else crease.lineTo(x, y); }
    const lower = new Path2D();
    lower.moveTo(lw[2] + 0.02, lw[3] - 0.02); lower.quadraticCurveTo(lw[0], lw[1], x3 - 0.04, y3 + 0.1);
    const closed = new Path2D();
    closed.moveTo(x0, y0 + 0.06); closed.quadraticCurveTo(0.05, 0.3 + (y0 + y3) * 0.3, x3 + 0.02, y3 + 0.02); if (fl > 0) closed.lineTo(x3 + 0.16 * fl, y3 - 0.08 * fl);
    const happy = new Path2D();
    happy.moveTo(x0 + 0.02, y0 + 0.14); happy.quadraticCurveTo(0.06, -0.32, x3, y3 + 0.2);
    E2 = { S, open, lash, spikes, crease, lower, closed, happy, iris: S.iris };
    EYEP.set(key, E2);
    return E2;
  }
  function irisGrad(ey) {
    return linG('iris2:' + ey.top, 0, -0.45, 0, 0.55, [0, ey.top, 0.42, ey.mid, 1, ey.bot]);
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
  function drawEye(D, H, sd, ex) {
    const g = D.g, C = D.C, P = D.P, ey = C.eye, FE = D.F.eye;
    hsph(H, sd * FE.psi, FE.y, 1.0, T3);
    const z = T3[2];
    if (z < 0.04) return;
    const fs = clamp(z / 0.87, 0.2, 1.12);
    const ew = FE.w * pow(fs, 0.85) * (ex.big || 1), eh = FE.h * (ex.big || 1);
    const cx = T3[0], cy = T3[1] + (ex.big ? -0.02 : 0);
    const m = sd > 0 ? -1 : 1;
    tm(D.mE, D.mH, cx, cy, 0, ew * m, eh);
    setT(g, D.mE);
    const EP = eyePaths(FE.shape, FE.lash || 1), S = EP.S;
    let shape = ex.eye;
    const blink = D.blink;
    if (ex.wink && sd < 0) shape = 'happy';
    const lw = D.inkH / eh;
    if (D.lod === 0 || D.sil) {
      if (D.sil) return;
      if (shape === 'open' && blink < 0.6 && (ex.lid || 0) < 0.6) {
        g.beginPath(); g.ellipse(0.05 * m * P.lookX, 0.08, 0.32, 0.44 * (1 - blink) * (S.lidK ? 0.8 : 1), 0, 0, TAU); g.fillStyle = ey.lash; g.fill();
      } else {
        g.beginPath(); g.moveTo(-0.45, 0.1); g.quadraticCurveTo(0, shape === 'happy' ? -0.2 : 0.32, 0.5, 0.1); g.lineWidth = 0.22; g.strokeStyle = ey.lash; g.lineCap = 'round'; g.stroke();
      }
      return;
    }
    if (shape === 'closed' || shape === 'happy' || blink > 0.92) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.lineWidth = lw * 2.1 * (FE.lash || 1); g.strokeStyle = ey.lash;
      g.stroke(shape === 'happy' ? EP.happy : EP.closed);
      if (ex.tears && shape !== 'happy') drawTears(D, ex, m, true);
      return;
    }
    const lidK = S.lidK || 0;
    const lid = clamp((ex.lid || 0) + lidK + blink * (1 - max(0, (ex.lid || 0) + lidK)), -0.12, 1);
    const low = ex.low || 0, tilt = ex.tilt || 0;
    const [x0, y0, c1x, c1y, c2x, c2y, x3, y3] = S.lid, LW = S.low;
    const lt0 = lid * 0.5, ls = 1 - lid * 0.72;
    const ct = cos(tilt), st = sin(tilt);
    const L = (x, y) => { const yy = lt0 + y * ls; return [x * ct - yy * st, x * st + yy * ct]; };
    const p0 = L(x0, y0), q1 = L(c1x, c1y), q2 = L(c2x, c2y), p1 = L(x3, y3);
    g.save();
    g.beginPath();
    g.moveTo(p0[0], p0[1]);
    g.bezierCurveTo(q1[0], q1[1], q2[0], q2[1], p1[0], p1[1]);
    g.quadraticCurveTo(LW[0], LW[1] - low * 0.8, LW[2], LW[3] - low * 0.95);
    g.quadraticCurveTo(LW[4], LW[5] - low * 0.62, p0[0], p0[1]);
    g.closePath();
    g.clip();
    g.fillStyle = '#fffaf7'; g.fillRect(-0.8, -0.8, 1.7, 1.6);
    const [icx, icy, irx, iry] = S.iris;
    const elx = ex.look ? ex.look[0] * 0.2 : 0, ely = ex.look ? ex.look[1] * 0.2 : 0;
    const ix = icx + clamp((P.lookX * 0.24 + D.H.sy * 0.08 + elx) * m, -0.2, 0.2), iy = icy + clamp(P.lookY * 0.2 + ely, -0.14, 0.16);
    // 虹膜：上深下浅；瞳孔；下部的亮色反光；上眼睑的影子
    g.beginPath(); g.ellipse(ix, iy, irx, iry, 0, 0, TAU);
    g.fillStyle = irisGrad(ey); g.fill();
    if (D.lod >= 2) {
      g.globalAlpha = D.ga * 0.55; g.beginPath(); g.ellipse(ix, iy + iry * 0.42, irx * 0.72, iry * 0.4, 0, 0, TAU); g.fillStyle = ey.hi2; g.fill(); g.globalAlpha = D.ga;
      g.beginPath(); g.ellipse(ix, iy, irx * 0.78, iry * 0.8, 0, 0, TAU); g.lineWidth = lw * 0.5; g.strokeStyle = rgba(ey.top, 0.55); g.stroke();
    }
    const pk = (ex.pupil || 1) * S.pupil / 0.2;
    g.beginPath(); g.ellipse(ix, iy - iry * 0.06, 0.2 * pk * (irx / 0.44), 0.27 * pk * (iry / 0.53), 0, 0, TAU); g.fillStyle = ey.pupil; g.fill();
    g.beginPath(); g.ellipse(ix, iy, irx, iry, 0, 0, TAU); g.lineWidth = lw * 0.8; g.strokeStyle = ey.ring; g.stroke();
    // 上眼睑投下的影子
    g.globalAlpha = D.ga * 0.38; g.fillStyle = ey.top;
    g.beginPath(); g.moveTo(p0[0], p0[1]); g.bezierCurveTo(q1[0], q1[1], q2[0], q2[1], p1[0], p1[1]); g.lineTo(p1[0], p1[1] + 0.22); g.bezierCurveTo(q2[0], q2[1] + 0.3, q1[0], q1[1] + 0.3, p0[0], p0[1] + 0.14); g.fill();
    g.globalAlpha = D.ga;
    // 高光：朝光的一侧一大一小（两只眼在屏幕上同一侧 —— 眼睛的局部 x 是按 m 镜像过的）
    const hs = (D.LcH[0] >= 0 ? 1 : -1) * m;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(ix + hs * irx * 0.32, iy - iry * 0.38, irx * 0.36, iry * 0.27, -0.35 * hs, 0, TAU);
    const sx2 = ix - hs * irx * 0.4, sy2 = iy + iry * 0.4;
    g.moveTo(sx2 + irx * 0.14, sy2); g.arc(sx2, sy2, irx * 0.14, 0, TAU);
    g.fill();
    if (D.lod >= 2) { g.globalAlpha = D.ga * 0.8; g.beginPath(); g.arc(ix + hs * irx * 0.05, iy + iry * 0.18, irx * 0.07, 0, TAU); g.fill(); g.globalAlpha = D.ga; }
    if (ex.gloss) { g.globalAlpha = D.ga * 0.8; g.beginPath(); g.ellipse(ix + 0.05, iy + iry * 0.55, 0.2, 0.06, 0, 0, TAU); g.fill(); g.globalAlpha = D.ga; }
    if (ex.tears) { g.globalAlpha = D.ga * 0.7; g.fillStyle = '#bfe4ff'; g.beginPath(); g.moveTo(-0.42, 0.34); g.quadraticCurveTo(0, 0.62, 0.46, 0.3); g.quadraticCurveTo(0, 0.48, -0.42, 0.34); g.fill(); g.globalAlpha = D.ga; }
    g.restore();
    // 上睫毛（随眼睑移动）+ 细节
    g.save();
    g.rotate(tilt);
    if (lid > 0.02) { g.translate(0, lt0); g.scale(1, ls); }
    g.fillStyle = ey.lash; g.fill(EP.lash);
    if (D.lod >= 2) { g.fill(EP.spikes); g.lineWidth = lw * 0.5; g.strokeStyle = rgba(ey.lash, 0.55); g.lineCap = 'round'; g.stroke(EP.crease); }
    g.restore();
    g.lineCap = 'round';
    g.save(); g.translate(0, -low * 0.8);
    g.lineWidth = lw * 0.7 * (FE.lash || 1); g.strokeStyle = rgba(ey.lash, 0.85); g.stroke(EP.lower);
    g.restore();
    if (ex.tears > 1 || ex.cryDrops) drawTears(D, ex, m, false);
  }
  function drawTears(D, ex, m, closed) {
    const g = D.g;
    g.globalAlpha = D.ga * 0.75;
    g.fillStyle = '#bfe4ff'; g.beginPath(); g.moveTo(-0.42, 0.34); g.quadraticCurveTo(0, 0.62, 0.46, 0.3); g.quadraticCurveTo(0, 0.48, -0.42, 0.34); g.fill();
    g.globalAlpha = D.ga;
    if (ex.tears > 1 || closed) {
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
  /** 眉毛：一条内粗外细的小弧（画在刘海上面，半透明） */
  function drawBrow(D, H, sd, ex) {
    const g = D.g, C = D.C, FB = D.F.brow;
    hsph(H, sd * (D.F.eye.psi - 0.02), D.F.eye.y - 0.33 + FB.y - (ex.brow > 0.5 ? 0.06 : 0) - (ex.brow < 0 ? 0.02 : 0), 1.04, T3);
    if (T3[2] < 0.1) return;
    const fs = clamp(T3[2] / 0.88, 0.25, 1.1);
    const L = FB.len * fs;
    const m = sd > 0 ? -1 : 1;
    let inner = 0, outer = 0;
    const b = ex.brow || 0;
    if (b < 0) { inner = -0.07 * -b; outer = 0.03 * -b; }
    else if (ex.angry) { inner = 0.06 * b; outer = -0.04 * b; }
    else { inner = -0.02 * b; outer = -0.02 * b; }
    outer -= (FB.tilt || 0);
    const x0 = T3[0] - m * L, y0 = T3[1] + inner, x1 = T3[0] + m * L, y1 = T3[1] + outer;
    const mx = T3[0], my = T3[1] - FB.arch + (inner + outer) * 0.3;
    const th = D.inkH * 1.1 * FB.w;
    const strong = abs(b) >= 0.75 || ex.angry ? 1 : 0;
    g.beginPath();
    g.moveTo(x0, y0 - th * 0.6); g.quadraticCurveTo(mx, my - th * 0.5, x1, y1);
    g.quadraticCurveTo(mx, my + th * 0.5, x0, y0 + th * 0.6); g.closePath();
    g.globalAlpha = D.ga * (0.58 + 0.34 * strong);
    g.fillStyle = C.browC || mix(D.hair ? D.hair.pal.ink : '#3a2a22', D.hair ? D.hair.pal.sh : '#5a4a42', 0.25); g.fill();
    g.globalAlpha = D.ga;
  }
  function drawNose(D, H) {
    const g = D.g, C = D.C, F = D.F, type = F.nose || 'dot';
    const ny = noseY(F);
    hproj(H, 0, ny, faceFront(F, ny) + noseBump(F) * 0.85, T3);
    if (T3[2] < 0.25) return;
    const x = T3[0], y = T3[1], side = H.sy >= 0 ? 1 : -1, turn = abs(H.sy);
    g.lineCap = 'round';
    if (type === 'dot' || D.lod < 2) {
      g.fillStyle = rgba(C.skin.ink, 0.45); g.beginPath(); g.ellipse(x + side * 0.01, y + 0.01, 0.022 + 0.01 * turn, 0.014, 0, 0, TAU); g.fill();
      return;
    }
    g.strokeStyle = rgba(C.skin.ink, 0.55); g.lineWidth = D.inkH * 0.55;
    g.beginPath();
    if (type === 'tick') { g.moveTo(x - side * 0.035, y - 0.1 * turn); g.quadraticCurveTo(x - side * 0.05, y - 0.02, x - side * 0.01, y + 0.02); }
    else { g.moveTo(x - side * 0.02, y - 0.16); g.quadraticCurveTo(x - side * 0.04, y - 0.05, x - side * 0.035, y); g.lineTo(x + side * 0.02, y + 0.025); }
    g.stroke();
  }
  function drawMouth(D, H, ex) {
    const g = D.g, C = D.C, P = D.P, sk = C.skin, FM = D.F.mouth;
    const ff = faceFront(D.F, FM.y) + 0.02;
    hproj(H, 0, FM.y, ff, T3);
    if (T3[2] < 0.05) return;
    const fs = clamp(T3[2] / ff, 0.3, 1);
    const mx = T3[0], my = T3[1];
    const sx = fs * (FM.w / 0.07), lw = D.inkH * 0.95;
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
    // 成年人：下唇下面一点阴影
    if (D.lod >= 2 && D.F.chin > 1.08 && shape !== 'open' && shape !== 'o') { g.beginPath(); g.moveTo(mx - 0.035 * sx, my + 0.06); g.quadraticCurveTo(mx, my + 0.08, mx + 0.035 * sx, my + 0.06); g.lineWidth = lw * 0.5; g.strokeStyle = rgba(sk.lip, 0.6); g.stroke(); }
  }
  function drawBlush(D, H, ex) {
    const a = (ex.blush || 0) * (D.F.blushK != null ? D.F.blushK : 1);
    if (D.sil || D.lod === 0) return;
    const g = D.g, spr = softSprite(D.C.skin.blush, 0.3), F = D.F;
    const by = min(F.mouth.y - 0.1, F.eye.y + 0.3);
    if (a > 0.02) for (let sd = -1; sd <= 1; sd += 2) {
      hsph(H, sd * 0.66, by, 1.0, T3);
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
    if (F.freckles && D.lod >= 1) {
      g.fillStyle = F.freckles; g.globalAlpha = D.ga * 0.7;
      for (let sd = -1; sd <= 1; sd += 2) for (let k = 0; k < 3; k++) {
        hsph(H, sd * (0.5 + k * 0.08), by - 0.06 + (k % 2) * 0.05, 1.0, T3);
        if (T3[2] < 0.15) continue;
        g.beginPath(); g.arc(T3[0], T3[1], 0.018, 0, TAU); g.fill();
      }
      g.globalAlpha = D.ga;
    }
    if (F.age && D.lod >= 1) {
      // 岁月的痕迹：眼下一道、法令纹一点（很淡）
      g.globalAlpha = D.ga * 0.3; g.strokeStyle = D.C.skin.ink; g.lineWidth = D.inkH * 0.45; g.beginPath();
      for (let sd = -1; sd <= 1; sd += 2) {
        hsph(H, sd * F.eye.psi, F.eye.y + F.eye.h * 0.62, 1.0, T3);
        if (T3[2] > 0.2) { g.moveTo(T3[0] - 0.08, T3[1]); g.quadraticCurveTo(T3[0], T3[1] + 0.035, T3[0] + 0.08, T3[1] - 0.01); }

      }
      g.stroke(); g.globalAlpha = D.ga;
    }
  }
  /** 眼镜：round 圆框 | hex 圆角六边形（卡提亚）| hexround 圆八角（凯勒） */
  function drawGlasses(D, H) {
    const gl = D.C.glasses, g = D.g, FE = D.F.eye;
    const pos = [];
    for (let sd = -1; sd <= 1; sd += 2) {
      hsph(H, sd * FE.psi, FE.y + 0.02, 1.1, T3);
      if (T3[2] < 0.08) { pos.push(null); continue; }
      pos.push([T3[0], T3[1], clamp(T3[2] / 0.95, 0.2, 1.1), sd]);
    }
    const lw = D.inkH * (gl.thin ? 0.8 : 1.15);
    g.lineWidth = lw; g.strokeStyle = D.sil || gl.c; g.lineJoin = 'round';
    const rxB = FE.w * 0.7 + 0.045, ryB = max(FE.h * 0.52 + 0.03, rxB * (gl.shape === 'hex' ? 0.72 : 0.86));
    for (const q of pos) {
      if (!q) continue;
      const [x, y, fs] = q;
      const rx = rxB * fs, ry = ryB;
      g.beginPath();
      if (gl.shape === 'hex' || gl.shape === 'hexround') {
        const k = gl.shape === 'hex' ? 0.34 : 0.3;
        g.moveTo(x - rx * (1 - k), y - ry); g.lineTo(x + rx * (1 - k), y - ry); g.lineTo(x + rx, y - ry * (1 - k * 1.4)); g.lineTo(x + rx, y + ry * (1 - k * 1.2));
        g.lineTo(x + rx * (1 - k), y + ry); g.lineTo(x - rx * (1 - k), y + ry); g.lineTo(x - rx, y + ry * (1 - k * 1.2)); g.lineTo(x - rx, y - ry * (1 - k * 1.4)); g.closePath();
      } else g.ellipse(x, y, rx, ry, 0, 0, TAU);
      if (!D.sil) { g.fillStyle = 'rgba(255,255,255,0.1)'; g.fill(); }
      g.stroke();
      if (!D.sil && D.lod >= 1) {
        g.save(); g.globalAlpha = D.ga * 0.55; g.strokeStyle = '#ffffff'; g.lineWidth = lw * 0.9;
        g.beginPath(); g.moveTo(x - rx * 0.5, y + ry * 0.1); g.lineTo(x - rx * 0.05, y - ry * 0.55); g.stroke(); g.restore();
        g.strokeStyle = gl.c; g.lineWidth = lw;
      }
    }
    if (pos[0] && pos[1]) {
      const a = pos[0], b = pos[1];
      const ax = a[0] + (b[0] > a[0] ? 1 : -1) * rxB * a[2], bx = b[0] - (b[0] > a[0] ? 1 : -1) * rxB * b[2];
      g.beginPath(); g.moveTo(ax, a[1] - 0.04); g.quadraticCurveTo((ax + bx) / 2, a[1] - 0.1, bx, b[1] - 0.04); g.stroke();
    }
    for (const q of pos) {
      if (!q) continue;
      const [x, y, fs, sd] = q;
      hsph(H, sd * 1.45, FE.y - 0.05, 1.0, T3b);
      if (T3b[2] < 0.15) continue;
      const ox = x + (T3b[0] > x ? 1 : -1) * rxB * fs;
      g.beginPath(); g.moveTo(ox, y - 0.06); g.lineTo(ox + (T3b[0] - ox) * 0.42, y - 0.06 + (T3b[1] - y) * 0.42); g.stroke();
    }
  }
  /** 纯烬的助听器：左耳（她的左边）一枚白色、带深色横纹的椭圆 */
  function drawHearingAid(D, H) {
    const g = D.g;
    hsph(H, -(HP + 0.02), 0.3, 1.07, T3);
    if (T3[2] < -0.1) return;
    const x = T3[0], y = T3[1], w = 0.1 * (0.45 + 0.55 * abs(H.sy)) + 0.04, h = 0.17;
    g.beginPath(); g.ellipse(x, y, w, h, 0, 0, TAU);
    fillC(D, '#f2f2f4'); inkC(D, D.inkH * 0.7, '#5a5c68');
    if (!D.sil && D.lod >= 1) {
      g.beginPath();
      for (const k of [-0.45, 0, 0.45]) { g.moveTo(x - w * 0.8, y + h * k); g.lineTo(x + w * 0.8, y + h * k); }
      g.lineWidth = D.inkH * 1.1; g.strokeStyle = '#3a3c46'; g.stroke();
    }
  }
  /** 头带（纯烬 home：中间有个 V 形缺口）/ 花边头饰 */
  function drawHeadband(D, H, color, frill, notch) {
    const g = D.g, xs = SX[1], ys = SY[1];
    let n = 0;
    for (let i = 0; i <= 12; i++) {
      const psi = -1.45 + (i / 12) * 2.9;
      hsph(H, psi, -0.6 + 0.04 * abs(psi) + (notch ? 0.07 * exp(-psi * psi * 30) : 0), D.hair ? D.hair.cap * 0.99 : 1.1, T3);
      if (T3[2] < -0.15) continue;
      xs[n] = T3[0]; ys[n] = T3[1]; n++;
    }
    if (n < 2) return;
    const fc = typeof frill === 'string' ? frill : color;
    if (frill && !D.sil && D.lod >= 1) {
      g.beginPath();
      for (let i = 0; i < n; i++) { g.moveTo(xs[i] + 0.075, ys[i] - 0.05); g.arc(xs[i], ys[i] - 0.05, 0.075, 0, PI, true); }
      g.fillStyle = fc; g.fill(); g.lineWidth = D.inkH * 0.5; g.strokeStyle = inkOf(fc); g.stroke();
    }
    g.lineCap = 'round';
    g.beginPath(); smooth(g, xs, ys, n, false);
    g.lineWidth = D.inkH * (frill ? 4.4 : 3.8); g.strokeStyle = D.sil || inkOf(color); g.stroke();
    g.lineWidth = D.inkH * (frill ? 3.0 : 2.4); g.strokeStyle = D.sil || color; g.stroke();
  }
  function drawStrawHat(D, H, hat) {
    const g = D.g, cx = 0.08 * H.sy, cy = -0.74 - 0.1 * H.pitch;
    const tilt = -0.08 * H.sy;
    const brimRy = 0.26 + 0.14 * abs(H.sp);
    g.save(); g.translate(cx, cy); g.rotate(tilt);
    g.beginPath(); g.ellipse(0, 0.08, 1.66, brimRy, 0, 0, TAU);
    fillC(D, hat.c); inkC(D, D.inkH, dk(hat.c, 0.45));
    g.beginPath(); g.moveTo(-0.84, 0.06); g.bezierCurveTo(-0.86, -0.64, 0.86, -0.64, 0.84, 0.06); g.quadraticCurveTo(0, 0.2, -0.84, 0.06);
    fillC(D, lt(hat.c, 0.12)); inkC(D, D.inkH, dk(hat.c, 0.45));
    if (!D.sil) {
      g.beginPath(); g.moveTo(-0.84, 0.0); g.quadraticCurveTo(0, 0.16, 0.84, 0.0); g.lineTo(0.85, -0.14); g.quadraticCurveTo(0, 0.02, -0.85, -0.14); g.closePath();
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
  /** 萨科塔的光环：银色的双环，正前方一颗菱形的宝石（芳汀） */
  function drawHalo(D, H, halo) {
    if (D.rimPass) return;
    const g = D.g, t = D.P.t;
    const x = 0.14 * H.sy, y = -1.52 + 0.04 * sin(t * 1.6), rx = 0.72, ry = 0.17 + 0.13 * abs(H.sp);
    const rot = -0.12 * H.sy;
    E.glow(g, x, y, 1.15, halo.glow, 0.22 * (D.o.glow != null ? D.o.glow + 0.5 : 1));
    for (const k of [1, 0.9]) {
      g.beginPath(); g.ellipse(x, y + (1 - k) * 0.12, rx * k, ry * k, rot, 0, TAU);
      g.lineWidth = D.inkH * 1.6; g.strokeStyle = '#8a8e9c'; g.stroke();
      g.lineWidth = D.inkH * 0.9; g.strokeStyle = halo.c; g.stroke();
    }
    // 宝石：在光环正前方（随头的朝向移动）
    const gx = x + sin(H.yaw) * rx * 0.9 * 0, gy = y + ry * 0.95;
    const gpx = x + rx * sin(-H.yaw * 0) * 0 + rx * sin(0) * 0;
    void gpx;
    const ga = H.yaw, px = x + rx * sin(ga) * 0.98 * cos(rot), py = y + ry * cos(ga) * 0.98;
    if (cos(ga) > -0.2) {
      const s = 0.1;
      g.beginPath(); g.moveTo(px, py - s * 1.4); g.lineTo(px + s * 0.8 * (0.4 + 0.6 * abs(cos(ga))), py); g.lineTo(px, py + s * 1.4); g.lineTo(px - s * 0.8 * (0.4 + 0.6 * abs(cos(ga))), py); g.closePath();
      g.fillStyle = halo.gem || '#ffffff'; g.fill(); g.lineWidth = D.inkH * 0.6; g.strokeStyle = '#8a8e9c'; g.stroke();
    }
    void gx; void gy;
  }
  /** 兜帽（戴上时）：尖顶、向下垂的帽身；博士的兜帽有一道面罩 */
  function drawHoodUp(D, H, hc, inner) {
    const k = hc.k || 1;
    if (k === 1) return drawHoodUp0(D, H, hc, inner);
    D.g.save(); D.g.translate(0, (1 - k) * 0.5); D.g.scale(k, k); drawHoodUp0(D, H, hc, inner); D.g.restore();
  }
  function drawHoodUp0(D, H, hc, inner) {
    const g = D.g, sy = H.sy;
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
    g.lineWidth = D.inkO * 2; g.strokeStyle = D.sil || inkOf(hc.c); g.stroke();
    g.fillStyle = D.sil || (D.lod >= 1 ? linG('hood2:' + hc.c, 0, -1.4, 0, 1.5, [0, lt(hc.c, 0.14), 0.6, hc.c, 1, dk(hc.c, 0.3)]) : hc.c); g.fill('evenodd');
    if (!D.sil && D.lod >= 1) {
      g.beginPath();
      if (H.front) {
        g.ellipse(fx, 0.36, rx + 0.07, 0.97, 0, PI * 1.08, PI * 1.92);
        g.lineWidth = D.inkH * 2.2; g.strokeStyle = rgba(lt(hc.c, 0.3), 0.55); g.stroke();
        g.beginPath();
        g.moveTo(bx - 0.62, -1.0); g.quadraticCurveTo(bx - 1.2, -0.1, bx - 1.12, 1.1);
        g.moveTo(bx + 0.66, -0.98); g.quadraticCurveTo(bx + 1.22, -0.1, bx + 1.15, 1.1);
      } else {
        g.moveTo(bx + pk + 0.05, -1.32); g.bezierCurveTo(bx + pk * 0.5, -0.5, bx + 0.02, 0.6, bx, 1.48);
        g.moveTo(bx - 0.75, -0.9); g.quadraticCurveTo(bx - 1.15, 0.2, bx - 0.95, 1.3);
        g.moveTo(bx + 0.8, -0.88); g.quadraticCurveTo(bx + 1.18, 0.2, bx + 0.98, 1.3);
      }
      g.lineWidth = D.inkI; g.strokeStyle = rgba(inkOf(hc.c), 0.55); g.stroke();
    }
    if (inner && H.front) {
      g.beginPath(); g.ellipse(fx, 0.36, rx, 0.9, 0, 0, TAU);
      fillC(D, inner);
      if (!D.sil) {
        g.globalAlpha = D.ga * 0.35; g.beginPath(); g.ellipse(fx, 0.2, rx * 0.95, 0.55, 0, PI, TAU); g.fillStyle = hc.sh || '#000'; g.fill(); g.globalAlpha = D.ga;
        if (hc.visor) {
          // 博士的面罩：一道横过脸的深色护目镜，上沿一条亮边
          g.beginPath(); g.moveTo(fx - rx * 0.92, 0.12); g.quadraticCurveTo(fx, -0.02 + 0.06 * abs(sy), fx + rx * 0.92, 0.12); g.lineTo(fx + rx * 0.86, 0.46); g.quadraticCurveTo(fx, 0.56, fx - rx * 0.86, 0.46); g.closePath();
          g.fillStyle = '#1c2230'; g.fill(); g.lineWidth = D.inkH * 0.6; g.strokeStyle = '#3c4658'; g.stroke();
          g.beginPath(); g.moveTo(fx - rx * 0.7, 0.14); g.quadraticCurveTo(fx, 0.04, fx + rx * 0.7, 0.14); g.lineWidth = D.inkH * 0.9; g.strokeStyle = 'rgba(160,230,240,0.55)'; g.stroke();
        }
      }
    }
  }

  /** 整个头：远侧的角 / 耳 → 脸 → 五官 → 眼镜 → 头发（发顶 + 刘海）→ 眉 → 近侧的耳 / 角 / 饰品 */
  function drawHead(D) {
    const g = D.g, C = D.C, H = D.H, P = D.P, hr = D.hair;
    setT(g, D.mH);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const ex = EXPR[P.expr] || EXPR.neutral;
    const hornsBehind = [], hornsFront = [];
    if (C.horn) for (let sd = -1; sd <= 1; sd += 2) { const hp = hornPaths(D, H, C.horn, sd); (hp.z > 0.1 ? hornsFront : hp.z < -0.1 ? hornsBehind : hp.zm < 0 ? hornsBehind : hornsFront).push(sd); }
    const earSides = [];
    for (let sd = -1; sd <= 1; sd += 2) { hsph(H, sd * (HP + 0.14), 0.1, 0.97, T3); earSides.push([sd, T3[2]]); }
    for (const sd of hornsBehind) drawHorn(D, H, sd);
    if (C.ear === 'sheep') for (const [sd, z] of earSides) if (z < 0) drawEar(D, H, sd);
    const pn = hr && hr.pony;
    let ponyFront = false;
    if (pn && !pn.low) { hsph(H, pn.psi, pn.y, 1.05, T3); if (T3[2] < 0) drawPony(D, H, pn, 'body'); else ponyFront = true; }
    if (C.plume) { hsph(H, -1.05, -0.5, 1.0, T3); if (T3[2] < 0) drawPlume(D, H); }
    if (C.hooded) {
      drawHoodUp(D, H, D.O.hood, D.O.hood.face);
      if (!D.sil && H.front && D.lod >= 1 && !D.O.hood.visor) {
        const fx = 0.45 * H.sy;
        g.globalAlpha = D.ga * 0.5; g.fillStyle = '#6a7090';
        g.beginPath(); g.ellipse(fx - 0.22 * H.cy, 0.3, 0.07 * H.cy + 0.02, 0.025, 0, 0, TAU); g.ellipse(fx + 0.22 * H.cy, 0.3, 0.07 * H.cy + 0.02, 0.025, 0, 0, TAU); g.fill();
        g.globalAlpha = D.ga;
      }
      return;
    }
    if (H.front) {
      const fp = faceParts(D, H);
      g.lineWidth = D.inkO * 2; g.strokeStyle = D.sil || C.skin.ink;
      g.stroke(fp.hull); if (fp.prof) g.stroke(fp.prof);
      g.fillStyle = D.sil || skinGrad(C.skin);
      g.fill(fp.hull); if (fp.prof) g.fill(fp.prof);
      if (!D.sil && D.lod >= 1 && hr) {
        const cp = capParts(D, H);
        g.save(); g.clip(fp.hull);
        // 刘海在额头上投下的影子
        if (cp.bangs) { g.globalAlpha = D.ga * 0.5; g.fillStyle = C.skin.sh; g.translate(0.03, 0.1); g.fill(cp.bangs); g.fill(cp.dome); g.translate(-0.03, -0.1); }
        if (D.lod >= 2 && D.shade > 0) {
          // 背光一侧的脸颊（很淡的一层）
          g.globalAlpha = D.ga * 0.22 * D.shade; g.fillStyle = C.skin.sh;
          g.beginPath(); g.rect(-2, -2, 4, 4); g.ellipse(D.LcH[0] * 0.2, D.LcH[1] * 0.2 + 0.1, 1.02, 1.08, 0, 0, TAU); g.fill('evenodd');
          hsph(H, 0.55, 0.5, 1.0, T3);
          if (T3[2] > 0.3) { g.globalAlpha = D.ga * 0.45; g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(T3[0] + 0.02, T3[1] - 0.06, 0.09 * clamp(T3[2], 0.4, 1), 0.05, -0.3, 0, TAU); g.fill(); }
        }
        g.globalAlpha = D.ga; g.restore();
      }
      if (C.ear === 'human') for (const [sd, z] of earSides) if (z > -0.3) drawEar(D, H, sd);
      if (!D.sil) {
        drawBlush(D, H, ex);
        drawNose(D, H);
        drawMouth(D, H, ex);
        const eyeOrder = H.sy >= 0 ? [-1, 1] : [1, -1];
        for (const sd of eyeOrder) drawEye(D, H, sd, ex);
        setT(g, D.mH);
      }
    }
    if (hr) {
      const cp = capParts(D, H), pal = hr.pal;
      g.lineWidth = D.inkO * 2; g.strokeStyle = D.sil || pal.ink;
      g.stroke(cp.dome); if (cp.bangs) g.stroke(cp.bangs);
      const hg = D.sil ? null : hairGrad(pal);
      g.fillStyle = D.sil || hg; g.fill(cp.dome);
      if (!D.sil && D.lod >= 1 && D.shade > 0) {
        g.save(); g.clip(cp.dome);
        g.globalAlpha = D.ga * 0.5 * D.shade; g.fillStyle = pal.dk || pal.sh;
        g.beginPath(); g.rect(-3, -3, 6, 6);
        g.ellipse(D.LcH[0] * 0.26, -0.04 + D.LcH[1] * 0.26, hr.cap * 1.02, hr.cap * 1.02, 0, 0, TAU);
        g.fill('evenodd');
        g.restore(); g.globalAlpha = D.ga;
      }
      if (cp.bangs) {
        g.fillStyle = D.sil || bangGrad(pal); g.fill(cp.bangs);
        if (!D.sil && D.lod >= 1 && D.shade > 0) { g.globalAlpha = D.ga * 0.32 * D.shade; g.fillStyle = pal.sh; g.fill(cp.bandSh); g.globalAlpha = D.ga; }
      }
      if (!D.sil && D.lod >= 1) {
        g.globalAlpha = D.ga * 0.55; g.fillStyle = pal.lt; g.fill(cp.sheen); g.globalAlpha = D.ga;
        g.lineWidth = D.inkI; g.strokeStyle = rgba(pal.ink, 0.32); g.stroke(cp.strands);
      }
      if (hr.messy && D.lod >= 1) drawTufts(D, H, 4, 11);
      if (D.O.bedhair && D.lod >= 1) drawTufts(D, H, 4, 23);
      // 背影：后面的头发从发旋往下盖住后脑勺（不再是一个“球”）
      if (!H.front && D.bhLate) { drawBackHair(D, H); if (hr.pony && hr.pony.low) drawPony(D, H, hr.pony); setT(g, D.mH); }
    }
    if (H.front && !D.sil && D.lod >= 1) for (let sd = -1; sd <= 1; sd += 2) drawBrow(D, H, sd, ex);
    if (H.front && C.glasses) drawGlasses(D, H);
    if (C.ear === 'sheep') for (const [sd, z] of earSides) if (z >= 0) drawEar(D, H, sd);
    if (D.O.hearing) drawHearingAid(D, H);
    if (C.plume) { hsph(H, -1.05, -0.5, 1.0, T3); if (T3[2] >= 0) drawPlume(D, H); }
    if (ponyFront) drawPony(D, H, pn, 'body');
    if (pn && !pn.low && !pn.high && pn.orn) { hsph(H, pn.psi, pn.y, 1.05, T3); if (T3[2] > -0.25) drawLeafOrnament(D, T3[0], T3[1], pn.psi >= 0 ? 1 : -1); }
    if (D.O.bows) for (const sd of [1, -1]) { hsph(H, sd * 0.95, -0.66, D.hair.cap, T3); if (T3[2] > -0.35) drawBow(D, T3[0], T3[1] - 0.05, 0.4, D.O.bows, D.O.bows, sd * 0.35); }
    for (const sd of hornsFront) drawHorn(D, H, sd);
    if (D.O.hat) drawStrawHat(D, H, D.O.hat);
    if (C.ear === 'rabbit' || C.ear === 'animal') for (let sd = -1; sd <= 1; sd += 2) drawEar(D, H, sd);
    if (hr && hr.tuft) drawTuft(D, H, hr.tuft);
    if (hr && hr.ahoge && !D.O.hat) drawAhoge(D, H, hr.ahoge);
    if (D.O.headband) drawHeadband(D, H, D.O.headband, D.O.headbandFrill, D.O.headbandNotch);
    if (D.O.headdress) drawHeadband(D, H, D.O.headdress, true);
    if (D.O.hoodUp) drawHoodUp(D, H, D.O.hoodUp, null);
    if (C.halo) drawHalo(D, H, C.halo);
  }
  /* ================================================================
   * 身体 v2（角色空间：单位 = 身高 1/100，脚底原点，y 向下）
   *   躯干截面是“蛋形”：前半厚 DF（胸口）、后半厚 DB（背），截面中心前移 FO —— 侧面能看出胸和背
   *   四肢是锥形胶囊（肩 → 肘 → 腕、髋 → 膝 → 小腿肚 → 踝）：先把几段一起描粗墨线、再分别填色 → 只剩外轮廓
   *   两色赛璐璐：亮面 + 背光一侧的一条阴影带（光默认从左上来）
   * ================================================================ */
  const RA = new Float64Array(8), RB = new Float64Array(8), Q2 = [0, 0, 0], Q3 = [0, 0, 0], Q4 = [0, 0, 0];
  const TSTEPS = [];
  const MX = [1, 0, 0, 1, 0, 0];
  function computeRings(D) {
    const P = D.P, B = D.B, cy = P.cy, sy = P.sy;
    for (let i = 0; i < 5; i++) {
      const u = RING_U[i] * B.T;
      const s = P.H[0], v = P.H[1] + P.U[1] * u, f = P.H[2] + P.U[2] * u;
      D.rx[i] = -s * cy + f * sy; D.ry[i] = v; D.rz[i] = s * sy + f * cy;
      const W = B.W[i], fo = B.FO[i], df = B.DF[i], db = B.DB[i];
      D.reF[i] = fo * sy + sqrt(W * W * cy * cy + df * df * sy * sy);
      D.reB[i] = -fo * sy + sqrt(W * W * cy * cy + db * db * sy * sy);
    }
    let ax = D.rx[4] - D.rx[0], ay = D.ry[4] - D.ry[0];
    const al = hypot(ax, ay) || 1; ax /= al; ay /= al;
    D.nx = -ay; D.ny = ax;
    D.ax = ax; D.ay = ay;
  }
  /** 躯干在高度 u（0 髋 → 1 肩，可外推）处的截面：[cx, cy, W, DF, DB, FO, 前侧外延, 后侧外延] */
  function ringAt(D, u, out) {
    let i = 0;
    while (i < 3 && u > RING_U[i + 1]) i++;
    const k = (u - RING_U[i]) / (RING_U[i + 1] - RING_U[i]), B = D.B;
    out[0] = lerp(D.rx[i], D.rx[i + 1], k); out[1] = lerp(D.ry[i], D.ry[i + 1], k);
    out[2] = lerp(B.W[i], B.W[i + 1], k); out[3] = lerp(B.DF[i], B.DF[i + 1], k); out[4] = lerp(B.DB[i], B.DB[i + 1], k);
    out[5] = lerp(B.FO[i], B.FO[i + 1], k); out[6] = lerp(D.reF[i], D.reF[i + 1], k); out[7] = lerp(D.reB[i], D.reB[i + 1], k);
    return out;
  }
  /** 躯干表面的点：u 高度，phi 方位（0 = 正前，+ = 角色右侧 = 近侧），d 向外膨胀 → [x, y, z] */
  function surf(D, u, phi, d, out) {
    ringAt(D, u, RB);
    const P = D.P, c = cos(phi);
    const s = (RB[2] + d) * sin(phi), f = RB[5] + ((c >= 0 ? RB[3] : RB[4]) + d) * c;
    const lx = -s * P.cy + f * P.sy;
    out[0] = RB[0] + lx * D.nx; out[1] = RB[1] + lx * D.ny;
    out[2] = s * P.sy + f * P.cy;
    return out;
  }
  /** 角色坐标的 3D 点 → 投影（x, y, 朝镜头的深度） */
  function pj3(P, X, Y, Z, out) { out[0] = -X * P.cy + Z * P.sy; out[1] = Y; out[2] = X * P.sy + Z * P.cy; return out; }
  /** 躯干外轮廓（u0 → u1），inf 为向外膨胀量，shoulder = 肩线隆起到脖子根的高度 */
  function torsoPath(D, g, u0, u1, inf, shoulder) {
    const xs = SX[1], ys = SY[1];
    TSTEPS.length = 0; TSTEPS.push(u0);
    for (const u of RING_U) if (u > u0 + 0.02 && u < u1 - 0.02) TSTEPS.push(u);
    TSTEPS.push(u1);
    let n = 0;
    for (let i = 0; i < TSTEPS.length; i++) { ringAt(D, TSTEPS[i], RA); const e = RA[7] + inf; xs[n] = RA[0] - D.nx * e; ys[n] = RA[1] - D.ny * e; n++; }
    const nL = n;
    for (let i = TSTEPS.length - 1; i >= 0; i--) { ringAt(D, TSTEPS[i], RA); const e = RA[6] + inf; xs[n] = RA[0] + D.nx * e; ys[n] = RA[1] + D.ny * e; n++; }
    g.moveTo(xs[0], ys[0]);
    for (let i = 1; i < nL; i++) g.lineTo(xs[i], ys[i]);
    if (shoulder) {
      ringAt(D, u1, RA);
      const nw = D.neckW * 0.55 + inf * 0.5, up = shoulder;
      const cx = RA[0] + D.nx * (RA[6] - RA[7]) * 0.25, cy = RA[1];
      const lx = xs[nL - 1], ly = ys[nL - 1], rx = xs[nL], ry = ys[nL];
      g.quadraticCurveTo(lx + D.ax * up * 0.95, ly + D.ay * up * 0.95, cx - D.nx * nw + D.ax * up, cy - D.ny * nw + D.ay * up);
      g.lineTo(cx + D.nx * nw + D.ax * up, cy + D.ny * nw + D.ay * up);
      g.quadraticCurveTo(rx + D.ax * up * 0.95, ry + D.ay * up * 0.95, rx, ry);
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
    if (!gr) { gr = linG('cloth:' + c + ':' + D.B.T.toFixed(1), -9, -D.B.T - 2, 9, 4, [0, lt(c, 0.16), 0.5, c, 1, mix(c, '#2a1a2a', 0.14)]); CLOTHG.set(key, gr); }
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
  /** 躯干表面的一块多边形（点列 [u, phi]），全部不可见时返回 0 */
  function surfPoly(D, g, pts, d) {
    let vis = 0;
    for (let i = 0; i < pts.length; i++) { surf(D, pts[i][0], pts[i][1], d, Q2); if (Q2[2] > 0) vis++; if (i) g.lineTo(Q2[0], Q2[1]); else g.moveTo(Q2[0], Q2[1]); }
    g.closePath();
    return vis;
  }

  /* ---- 两色赛璐璐 ---- */
  const SHC = new Map();
  /** 阴影色：往冷紫偏一点（官方立绘的暗面） */
  function shadeOf(c) { let v = SHC.get(c); if (!v) { v = mix(c, '#3b2d52', 0.3); SHC.set(c, v); } return v; }
  function bandGrad(c, a) {
    return linG('band:' + c + ':' + a.toFixed(2), -1, 0, 1, 0, [0, rgba(c, 0), 0.58, rgba(c, 0), 0.585, rgba(c, a), 1, rgba(c, a)]);
  }
  /**
   * 在当前路径上叠一条背光一侧的阴影带：部件中心 (cx, cy)、横向单位向量 (ux, uy)、半宽 half
   * 渐变定义在单位空间里（可缓存），用变换放到部件上
   */
  function celBand(D, cx, cy, ux, uy, half, c, k = 1) {
    if (D.sil || D.lod === 0 || D.shade <= 0) return;
    const g = D.g, m = D.mC;
    const side = (ux * D.Lc[0] + uy * D.Lc[1]) >= 0 ? -1 : 1;
    const a = ux * half * side, b = uy * half * side, c2 = -uy * half, d2 = ux * half;
    g.setTransform(m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c2 + m[2] * d2, m[1] * c2 + m[3] * d2, m[0] * cx + m[2] * cy + m[4], m[1] * cx + m[3] * cy + m[5]);
    g.fillStyle = bandGrad(shadeOf(c), min(1, D.celA * k)); g.fill();
    setT(g, m);
  }
  /** 一段肢体（a → b，半宽 r）上的阴影带 */
  function celSeg(D, ax, ay, bx, by, r, c, k) {
    let dx = bx - ax, dy = by - ay;
    const l = hypot(dx, dy) || 1; dx /= l; dy /= l;
    celBand(D, (ax + bx) * 0.5, (ay + by) * 0.5, -dy, dx, r, c, k);
  }

  /* ---- 路径小工具（都按顺时针加：和圆 / 椭圆一起用非零规则取并集时不会互相抵消） ---- */
  /** 锥形胶囊：两圆（a, ra）（b, rb）的凸包 */
  function capsule(p, ax, ay, ra, bx, by, rb) {
    const dx = bx - ax, dy = by - ay, d = hypot(dx, dy);
    if (d < 1e-4 || d <= abs(ra - rb) + 1e-4) {
      const big = ra >= rb, r = big ? ra : rb, x = big ? ax : bx, y = big ? ay : by;
      p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU);
      return;
    }
    const th = atan2(dy, dx), be = Math.asin(clamp((ra - rb) / d, -1, 1));
    const a0 = th + HP - be, a1 = th + 3 * HP + be;
    p.moveTo(ax + cos(a0) * ra, ay + sin(a0) * ra);
    p.arc(ax, ay, ra, a0, a1);
    p.arc(bx, by, rb, a1, a0 + TAU);
    p.closePath();
  }
  function ellP(p, x, y, rx, ry, rot) { p.moveTo(x + rx * cos(rot), y + rx * sin(rot)); p.ellipse(x, y, rx, ry, rot, 0, TAU); }
  function circP(p, x, y, r) { p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); }
  /** 多边形（扁平数组 [x0,y0,x1,y1,...]），按顺时针方向加入 */
  function polyCW(p, a) {
    let s = 0;
    const n = a.length >> 1;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += a[i * 2] * a[j * 2 + 1] - a[j * 2] * a[i * 2 + 1]; }
    if (s >= 0) { p.moveTo(a[0], a[1]); for (let i = 1; i < n; i++) p.lineTo(a[i * 2], a[i * 2 + 1]); }
    else { p.moveTo(a[(n - 1) * 2], a[(n - 1) * 2 + 1]); for (let i = n - 2; i >= 0; i--) p.lineTo(a[i * 2], a[i * 2 + 1]); }
    p.closePath();
  }
  const MIXK = new Map();
  function dimC(c, k) { if (!k) return c; const key = c + k; let v = MIXK.get(key); if (!v) { v = mix(c, shadeOf(c), k); MIXK.set(key, v); } return v; }

  /* ---- 脖子（画在躯干前面之前：领口会盖住脖子根） ---- */
  function drawNeck(D) {
    const g = D.g, B = D.B, sk = D.C.skin;
    if (D.C.hooded) return;
    const x0 = D.headX, y0 = D.headY + B.R * min(0.82, B.chin * 0.7);
    ringAt(D, 1, RA);
    const x1 = RA[0] + D.ax * 0.8 + D.nx * (RA[6] - RA[7]) * 0.25, y1 = RA[1] + D.ay * 0.8 + D.ny * (RA[6] - RA[7]) * 0.25;
    const w = D.neckW * 0.5;
    g.beginPath(); capsule(g, x0, y0, w * 0.9, x1, y1, w);
    g.lineWidth = D.inkB * 2; g.strokeStyle = D.sil || sk.ink; g.stroke();
    g.fillStyle = D.sil || sk.c; g.fill();
    if (D.sil || D.lod === 0) return;
    // 头在脖子上投下的影子
    g.beginPath(); capsule(g, x0, y0, w * 0.9, lerp(x0, x1, 0.55), lerp(y0, y1, 0.55), w * 0.95);
    g.fillStyle = sk.sh; g.fill();
    const ne = D.O.neck;
    if (ne && ne.choker) {
      const f = 0.62, x = lerp(x0, x1, f), y = lerp(y0, y1, f);
      g.beginPath(); capsule(g, x - D.nx * w * 0.98, y - D.ny * w * 0.98 - 0.55, 0.8, x + D.nx * w * 0.98, y + D.ny * w * 0.98 - 0.55, 0.8);
      g.fillStyle = ne.choker; g.fill();
      g.beginPath(); g.arc(x + D.nx * w * 0.2 * D.P.sy, y + 0.6, 0.55, 0, TAU); g.lineWidth = 0.35; g.strokeStyle = '#c8ccd4'; g.stroke();
    }
  }

  /* ---- 躯干 + 衣服细节 ---- */
  function celTorso(D, c, u0 = 0, u1 = 1, inf = 0) {
    if (D.sil || D.lod === 0 || D.shade <= 0) return;
    ringAt(D, (u0 + u1) * 0.5, RA);
    const mid = (RA[6] - RA[7]) * 0.5, half = (RA[6] + RA[7]) * 0.5 + inf;
    celBand(D, RA[0] + D.nx * mid, RA[1] + D.ny * mid, D.nx, D.ny, half, c);
  }
  function drawTorso(D) {
    const g = D.g, O = D.O, P = D.P, B = D.B;
    const top = O.top;
    g.beginPath();
    torsoPath(D, g, 0, 1, 0, D.shoulderUp);
    if (O.collar && O.collar.type === 'off') {
      fillAtHip(D, D.C.skin.c);
      inkC(D, D.inkB, D.C.skin.ink);
      g.beginPath(); torsoPath(D, g, 0, 0.84, 0.05, 0);
    }
    fillAtHip(D, clothGrad(D, top));
    celTorso(D, top);
    inkC(D, D.inkB, inkOf(top));
    if (D.sil) return;
    const inkW = D.ink;
    // 裤腰（衬衫 / 马甲下面露出一截裤子）
    if (O.pants && !O.skirt && !O.pinafore) {
      g.beginPath(); torsoPath(D, g, -0.02, O.vest || O.blazer ? 0.1 : 0.16, 0.25, 0);
      fillC(D, O.pants.c); inkC(D, inkW * 0.8, inkOf(O.pants.c));
      if (O.limeBelt) { g.beginPath(); torsoPath(D, g, 0.05, 0.13, 0.35, 0); fillC(D, O.limeBelt); inkC(D, inkW * 0.6, inkOf(O.limeBelt)); }
      else if (D.lod >= 1) { g.beginPath(); surfLine(D, g, 0.13, -1.6, 0.13, 1.6, 0.3, 8); lineC(D, inkW * 0.6, rgba(inkOf(O.pants.c), 0.7)); }
    }
    if (P.back) {
      if (O.bib) { g.beginPath(); surfLine(D, g, 0.72, 2.4, 1.0, 2.6, 0.1); surfLine(D, g, 0.72, -2.4, 1.0, -2.6, 0.1); lineC(D, 1.1, O.bib.strap || top); }
      if (O.corset) { g.beginPath(); torsoPath(D, g, O.corset.y0, O.corset.y1, 0.25, 0); fillC(D, O.corset.c); inkC(D, inkW * 0.8, dk(O.corset.c, 0.3)); }
      return;
    }
    // 背心裙（莉瑟）：前片 + 两条肩带
    if (O.pinafore) {
      const pc = O.pinafore;
      g.beginPath();
      if (surfPoly(D, g, [[0.0, -0.9], [0.62, -0.72], [0.66, -0.4], [0.64, 0], [0.66, 0.4], [0.62, 0.72], [0.0, 0.9]], 0.12)) { fillAtHip(D, clothGrad(D, pc)); inkC(D, inkW * 0.8, inkOf(pc)); }
      g.beginPath(); surfLine(D, g, 0.62, 0.55, 1.03, 0.62, 0.12, 3); surfLine(D, g, 0.62, -0.55, 1.03, -0.62, 0.12, 3);
      g.lineCap = 'round'; g.lineWidth = 1.6 + inkW * 1.6; g.strokeStyle = inkOf(pc); g.stroke(); g.lineWidth = 1.6; g.strokeStyle = pc; g.stroke();
      if (D.lod >= 1) { for (const sg of [1, -1]) { surf(D, 0.6, sg * 0.55, 0.3, Q2); if (Q2[2] > 0.3) { g.beginPath(); g.arc(Q2[0], Q2[1], 0.55, 0, TAU); g.fillStyle = '#e8c060'; g.fill(); } } }
    }
    if (O.bib) {
      g.beginPath();
      if (surfPoly(D, g, [[1.02, -0.66], [0.8, -0.56], [0.72, -0.3], [0.7, 0], [0.72, 0.3], [0.8, 0.56], [1.02, 0.66]], 0.05)) { fillC(D, O.bib.c); inkC(D, inkW * 0.8, inkOf(O.bib.c)); }
    }
    // 毛衣背心 / 西装马甲：V 领露出衬衫
    if (O.vest) {
      g.beginPath();
      if (surfPoly(D, g, [[1.03, -0.52], [0.52, 0], [1.03, 0.52]], 0.08)) { fillC(D, O.shirt || '#f6f4ef'); inkC(D, inkW * 0.8, inkOf(O.vest.c)); }
      if (D.lod >= 1) {
        // 马甲的前襟 + 两颗扣子
        g.beginPath(); surfLine(D, g, 0.52, 0, 0.04, 0, 0.1, 4); lineC(D, inkW * 0.7, inkOf(O.vest.c));
        g.fillStyle = dk(O.vest.c, 0.35);
        for (const u of [0.38, 0.22]) { surf(D, u, 0.05, 0.2, Q2); if (Q2[2] > 0.3) { g.beginPath(); g.arc(Q2[0], Q2[1], 0.42, 0, TAU); g.fill(); } }
      }
    }
    // 黑色西装外套（芳汀）：前襟敞开、翻领，领口别着银钉
    if (O.blazer) {
      g.beginPath();
      if (surfPoly(D, g, [[1.02, -0.36], [0.62, -0.08], [0.3, 0.02], [0.62, 0.1], [1.02, 0.36]], 0.1)) { fillC(D, '#f2f2f6'); inkC(D, inkW * 0.7, '#6a6c78'); }
      if (D.lod >= 1) {
        for (const sg of [1, -1]) {
          g.beginPath();
          if (surfPoly(D, g, [[1.02, sg * 0.36], [0.62, sg * 0.1], [0.72, sg * 0.5], [0.96, sg * 0.62]], 0.2)) { fillC(D, '#2c2c36'); inkC(D, inkW * 0.6, '#0c0c10'); }
        }
        if (O.studs) { g.fillStyle = O.studs; for (const [u, ph] of [[0.9, 0.5], [0.84, 0.46], [0.9, -0.5], [0.84, -0.46], [0.97, 1.0], [0.97, -1.0]]) { surf(D, u, ph, 0.3, Q2); if (Q2[2] > 0.3) { g.beginPath(); g.arc(Q2[0], Q2[1], 0.36, 0, TAU); g.fill(); } } }
      }
    }
    drawCollar(D);
    if (O.buttons && D.lod >= 1) {
      g.fillStyle = O.buttons;
      for (const u of [0.66, 0.5, 0.34]) { surf(D, u, 0, 0.15, Q2); if (Q2[2] > 0.3) { g.beginPath(); g.arc(Q2[0], Q2[1], 0.45, 0, TAU); g.fill(); } }
    }
    if (O.dots && D.lod >= 1) {
      g.fillStyle = O.dots; g.globalAlpha = D.ga * 0.8;
      for (let k = 0; k < 9; k++) { surf(D, 0.15 + (k % 3) * 0.28 + (k > 2 ? 0.1 : 0), -1.0 + (k * 0.75) % 2.1, 0.1, Q2); if (Q2[2] > 0.2) { g.beginPath(); g.arc(Q2[0], Q2[1], 0.55, 0, TAU); g.fill(); } }
      g.globalAlpha = D.ga;
    }
    // 腰封 / 束腰（玛格娜：一排金色扣子）
    if (O.corset) {
      g.beginPath(); torsoPath(D, g, O.corset.y0, O.corset.y1, 0.25, 0);
      fillC(D, O.corset.c); celTorso(D, O.corset.c, O.corset.y0, O.corset.y1, 0.25); inkC(D, inkW * 0.8, dk(O.corset.c, 0.3));
      if (O.corset.buttons && D.lod >= 1) {
        g.fillStyle = O.corset.buttons;
        for (let k = 0; k < 4; k++) { const u = lerp(O.corset.y0 + 0.05, O.corset.y1 - 0.05, k / 3); for (const ph of [-0.16, 0.16]) { surf(D, u, ph, 0.35, Q2); if (Q2[2] > 0.3) { g.beginPath(); g.arc(Q2[0], Q2[1], 0.38, 0, TAU); g.fill(); } } }
      }
      if (O.pouches && D.lod >= 1) {
        for (const ph of [0.5, 0.95, -0.7]) {
          surf(D, (O.corset.y0 + O.corset.y1) / 2 - 0.06, ph, 0.7, Q2);
          if (Q2[2] < 0.4) continue;
          g.beginPath(); roundRectP(g, Q2[0] - 1.1, Q2[1] - 1.1, 2.2, 2.6, 0.4);
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
      for (const sgn of [1, -1]) for (const [c, o] of bands) { g.beginPath(); surfLine(D, g, 0.97, sgn * -1.05 + o * 0.12, 0.44, sgn * 0.62 + o * 0.12, 0.35, 5); lineC(D, 0.75, c); }
      g.lineCap = 'round';
    }
    // 荧光绿的斜挎带（芳汀）
    if (O.strap && O.blazer && D.lod >= 1) { g.beginPath(); surfLine(D, g, 0.98, -0.9, 0.2, 0.9, 0.4, 6); g.lineCap = 'round'; lineC(D, 1.3 + inkW, '#1a1a20'); lineC(D, 1.3, O.strap); }
    if (O.lacing && D.lod >= 2) { g.beginPath(); for (let k = 0; k < 5; k++) { surf(D, 0.2 + k * 0.1, -0.12, 0.1, Q2); g.moveTo(Q2[0], Q2[1]); surf(D, 0.25 + k * 0.1, 0.12, 0.1, Q2); g.lineTo(Q2[0], Q2[1]); } lineC(D, 0.35, O.lacing); }
    if (O.pendant && !O.cardigan) drawPendant(D, O.pendant);
    if ((O.vest && O.vest.knit || O.knit) && D.lod >= 2) {
      g.beginPath();
      for (let k = -3; k <= 3; k++) surfLine(D, g, 0.05, k * 0.32, 0.5, k * 0.32, 0.05, 3);
      lineC(D, 0.2, O.vest ? O.vest.knit || dk(O.top, 0.2) : O.knit);
    }
  }
  function drawPendant(D, c) {
    const g = D.g;
    g.beginPath(); surfLine(D, g, 0.99, -0.45, 0.76, 0, 0.12, 4); surfLine(D, g, 0.76, 0, 0.99, 0.45, 0.12, 4); lineC(D, 0.25, '#b8903a');
    surf(D, 0.74, 0, 0.35, Q2);
    if (Q2[2] > 0.3) { g.beginPath(); g.arc(Q2[0], Q2[1], 0.62, 0, TAU); fillC(D, c); inkC(D, D.ink * 0.5, inkOf(c)); if (!D.sil && D.lod >= 2) { g.beginPath(); g.arc(Q2[0] - 0.2, Q2[1] - 0.2, 0.2, 0, TAU); g.fillStyle = '#ffffff'; g.fill(); } }
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
      } else if (cl.type === 'open') {
        // 敞开的衬衫领：V 字领口露出皮肤，两片领尖向外翻
        if (surfPoly(D, g, [[1.04, -0.34], [0.74, 0], [1.04, 0.34]], 0.12)) { fillC(D, D.C.skin.c); inkC(D, inkW * 0.6, D.C.skin.ink); }
        for (const sg of [1, -1]) {
          g.beginPath();
          if (surfPoly(D, g, [[1.06, sg * 0.3], [0.76, sg * 0.04], [0.86, sg * 0.5], [1.02, sg * 0.72]], 0.3)) { fillC(D, c); inkC(D, inkW * 0.75, inkOf(c)); }
        }
      } else if (cl.type === 'high') {
        // 立领：绕脖子一圈的白色高领
        ringAt(D, 1, RA);
        const w = D.neckW * 0.62, h = 3.2 * (D.B.R / 17);
        const cx = RA[0] + D.nx * (RA[6] - RA[7]) * 0.25, cy = RA[1];
        g.moveTo(cx - D.nx * w, cy - D.ny * w + 0.6);
        g.lineTo(cx - D.nx * w * 0.92 + D.ax * h, cy - D.ny * w * 0.92 + D.ay * h);
        g.quadraticCurveTo(cx + D.ax * (h + 0.8), cy + D.ay * (h + 0.8), cx + D.nx * w * 0.92 + D.ax * h, cy + D.ny * w * 0.92 + D.ay * h);
        g.lineTo(cx + D.nx * w, cy + D.ny * w + 0.6);
        g.quadraticCurveTo(cx - D.ax * 0.8, cy - D.ay * 0.8, cx - D.nx * w, cy - D.ny * w + 0.6);
        fillC(D, c); inkC(D, inkW * 0.75, '#7a7c88');
        if (!D.sil && D.lod >= 1) { g.beginPath(); g.moveTo(cx + D.ax * (h - 0.2), cy + D.ay * (h - 0.2)); g.lineTo(cx, cy + 0.2); lineC(D, inkW * 0.5, '#9a9ca8'); }
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
        const w = D.neckW * 0.62, cx = RA[0] + D.nx * (RA[6] - RA[7]) * 0.25, cy = RA[1];
        g.moveTo(cx - D.nx * w, cy - D.ny * w); g.lineTo(cx - D.nx * w + D.ax * 2.8, cy - D.ny * w + D.ay * 2.8);
        g.quadraticCurveTo(cx + D.ax * 3.5, cy + D.ay * 3.5, cx + D.nx * w + D.ax * 2.8, cy + D.ny * w + D.ay * 2.8);
        g.lineTo(cx + D.nx * w, cy + D.ny * w); g.closePath();
        fillC(D, lt(c, 0.06)); inkC(D, inkW * 0.7, inkOf(c));
        if (!D.sil && D.lod >= 1) { g.beginPath(); for (const f of [0.35, 0.7]) { g.moveTo(cx - D.nx * w * 0.9 + D.ax * 2.8 * f, cy - D.ny * w * 0.9 + D.ay * 2.8 * f); g.lineTo(cx + D.nx * w * 0.9 + D.ax * 2.8 * f, cy + D.ny * w * 0.9 + D.ay * 2.8 * f); } lineC(D, 0.25, dk(c, 0.15)); }
      } else if (cl.type === 'square') {
        if (surfPoly(D, g, [[1.04, -0.55], [0.84, -0.5], [0.8, 0], [0.84, 0.5], [1.04, 0.55]], 0.06)) { fillC(D, D.C.skin.c); inkC(D, inkW * 0.7, c); }
      }
    }
    if (!ne) return;
    if (ne.bow) {
      surf(D, 0.93, 0, 0.6, Q2);
      if (Q2[2] > 0.2) {
        const s = D.B.R * (D.P.kid ? 0.12 : 0.085) * (0.5 + 0.5 * min(1, Q2[2] / 4));
        g.save(); g.translate(Q2[0], Q2[1]); g.scale(s * (0.4 + 0.6 * abs(D.P.cy)), s);
        bowShape(g, D, ne.bow, D.ink / s);
        g.restore();
        if (ne.bell && !D.sil) { g.beginPath(); g.arc(Q2[0], Q2[1] + s * 1.6, s * 0.55, 0, TAU); fillC(D, ne.bell); inkC(D, D.ink * 0.6, inkOf(ne.bell)); }
      }
    } else if (ne.tie) {
      const tie = ne.tie, thin = ne.thin ? 0.55 : 1;
      const xs = SX[1], ys = SY[1];
      let n = 0;
      const sway = D.clothX * 0.12;
      for (const [u, ph] of [[0.97, 0.07 * thin], [0.9, 0.05 * thin], [0.5, 0.1 * thin], [0.4, 0], [0.5, -0.1 * thin], [0.9, -0.05 * thin], [0.97, -0.07 * thin]]) { surf(D, u, ph, 0.5, Q2); xs[n] = Q2[0] + (u < 0.6 ? sway : 0); ys[n] = Q2[1]; n++; }
      surf(D, 0.6, 0, 0.5, Q2);
      if (Q2[2] > 0.3) {
        g.beginPath(); g.moveTo(xs[0], ys[0]); for (let i = 1; i < n; i++) g.lineTo(xs[i], ys[i]); g.closePath();
        fillC(D, tie); inkC(D, D.ink * 0.8, inkOf(tie));
        surf(D, 0.96, 0, 0.6, Q2); g.beginPath(); g.ellipse(Q2[0], Q2[1], 1.0 * thin + 0.2, 0.9, 0, 0, TAU); fillC(D, dk(tie, 0.12)); inkC(D, D.ink * 0.7, inkOf(tie));
        if (!D.sil && D.lod >= 2 && !ne.thin) { g.beginPath(); surfLine(D, g, 0.86, 0.06, 0.62, -0.08, 0.55, 2); surfLine(D, g, 0.76, 0.08, 0.52, -0.06, 0.55, 2); lineC(D, 0.25, lt(tie, 0.3)); }
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

  /* ================================================================
   * 布料的下摆：腰圈 → 下摆圈（蛋形，前后会被腿撑开；坐 / 跪时搭在大腿上，从膝盖往下垂；落地会铺开）
   * 裙子、大衣下摆、披风尾巴共用
   * ================================================================ */
  const HN = 20;
  const HM = { cx: 0, wy: 0, cz: 0, W: 0, DF: 0, DB: 0, Wh: 0, DFh: 0, DBh: 0, yF: 0, yB: 0, lap: 0, KX: 0, KY: 0, KZ: 0, lie: 0 };
  function hemRing(D, u0, len, flare, inf, lift) {
    const P = D.P, B = D.B, O = D.O, T = B.T;
    ringAt(D, u0, RA);
    const W = RA[2] + inf, DF = RA[3] + inf, DB = RA[4] + inf, FO = RA[5];
    const cx = P.H[0], wy = P.H[1] + P.U[1] * u0 * T, cz = P.H[2] + P.U[2] * u0 * T + FO;
    const yH = wy + len * (1 - lift);
    let Wh = W + flare, DFh = DF + flare * 0.75, DBh = DB + flare * 0.75, lapN = 0, lapY = 0;
    const r = (O.pants && !O.pants.shorts ? O.pants.w[0] : B.legW[0]) * 0.5 + 0.8;
    HM.lap = 0;
    for (let i = 0; i < 2; i++) {
      const L = P.L[i], J = L.hj, K = L.kn, A = L.an;
      const tl = hypot(K[0] - J[0], K[1] - J[1], K[2] - J[2]) || 1;
      if ((K[2] - J[2]) / tl > 0.6 && K[1] < yH - 1) {
        // 大腿抬平（坐 / 跪 / 蹲）：布从腰搭过大腿，在膝盖前面往下垂
        const along = hypot(K[2] + r - (cz + DF), K[1] - wy);
        const rest = max(0, len - along);
        lapY += K[1] - r * 0.35 + rest * 0.85; lapN++;
        DFh = max(DFh, K[2] + r * 0.9 - cz); Wh = max(Wh, abs(K[0] - cx) + r);
        if (!HM.lap || K[2] > HM.KZ) { HM.lap = 1; HM.KX = K[0]; HM.KY = K[1] - r * 0.95; HM.KZ = K[2] + r * 0.6; }
      } else {
        // 垂着：下摆那个高度以上的那段腿把布撑开
        const y = yH;
        let x, z;
        if (y <= J[1]) { x = J[0]; z = J[2]; }
        else if (y <= K[1]) { const f = (y - J[1]) / max(1e-6, K[1] - J[1]); x = lerp(J[0], K[0], f); z = lerp(J[2], K[2], f); }
        else if (y <= A[1]) { const f = (y - K[1]) / max(1e-6, A[1] - K[1]); x = lerp(K[0], A[0], f); z = lerp(K[2], A[2], f); }
        else { x = A[0]; z = A[2]; }
        let zmin = min(J[2], z), zmax = max(J[2], z), xm = max(abs(J[0] - cx), abs(x - cx));
        if (K[1] < y) { zmin = min(zmin, K[2]); zmax = max(zmax, K[2]); xm = max(xm, abs(K[0] - cx)); }
        DFh = max(DFh, zmax + r - cz); DBh = max(DBh, cz - (zmin - r)); Wh = max(Wh, xm + r);
      }
    }
    let yF = lapN ? lapY / lapN : yH, yB = yH;
    if (P.seatV != null) { yB = min(yB, P.seatV - 0.3); DBh = max(DBh, DB + 1.2); }
    HM.cx = cx; HM.wy = wy; HM.cz = cz; HM.W = W; HM.DF = DF; HM.DB = DB;
    HM.Wh = Wh; HM.DFh = DFh; HM.DBh = DBh; HM.yF = yF; HM.yB = yB; HM.lie = P.lie;
    return HM;
  }
  /** 下摆圈上 φ 处、从腰（k = 0）到下摆（k = 1）的 3D 点 */
  function hemPt(H, phi, k, out) {
    const c = cos(phi), s = sin(phi);
    const wx = H.cx + H.W * s, wz = H.cz + (c >= 0 ? H.DF : H.DB) * c;
    let X = H.cx + H.Wh * s, Z = H.cz + (c >= 0 ? H.DFh : H.DBh) * c, Y = lerp(H.yB, H.yF, (1 + c) * 0.5);
    if (Y > -0.3 && !H.lie) { const ex = Y + 0.3; Y = -0.3; X += s * ex * 0.55; Z += c * ex * 0.55; }
    // 中间一段略向外鼓（布落在臀部上）
    const bul = sin(PI * k) * 0.45;
    out[0] = lerp(wx, X, k) + s * bul; out[1] = lerp(H.wy, Y, k); out[2] = lerp(wz, Z, k) + c * bul;
    return out;
  }
  const HX = new Float64Array(HN), HYs = new Float64Array(HN), HZ = new Float64Array(HN);
  const ARC = [];
  /** 投影一圈（level k），返回可见弧（从最左到最右，经过朝镜头的那一半）的下标写进 ARC */
  function hemProject(D, H, k, dx, tilt) {
    const P = D.P;
    let jMin = 0, jMax = 0;
    for (let j = 0; j < HN; j++) {
      hemPt(H, (j / HN) * TAU, k, Q4);
      pj3(P, Q4[0], Q4[1], Q4[2], Q3);
      HX[j] = Q3[0] + dx; HZ[j] = Q3[2]; HYs[j] = Q3[1] + max(0, Q3[2]) * tilt;
      if (HX[j] < HX[jMin]) jMin = j;
      if (HX[j] > HX[jMax]) jMax = j;
    }
    let zA = 0, nA = 0, zB = 0, nB = 0;
    for (let j = jMin; j !== jMax; j = (j + 1) % HN) { zA += HZ[j]; nA++; }
    for (let j = jMin; j !== jMax; j = (j - 1 + HN) % HN) { zB += HZ[j]; nB++; }
    const st = !nB || (nA && zA / nA >= zB / nB) ? 1 : -1;
    ARC.length = 0;
    for (let j = jMin; ; j = (j + st + HN) % HN) { ARC.push(j); if (j === jMax || ARC.length > HN) break; }
    return ARC;
  }

  /* ---- 裙子 ---- */
  function skirtC2Grad(D, sk, len) {
    return linG('sk2:' + sk.c + sk.c2 + len.toFixed(0), 0, 2, 0, len + 2, [0, sk.c, 0.45, sk.c, 1, sk.c2]);
  }
  function drawSkirt(D, sk, lenK = 1, colorOverride, noHem) {
    const g = D.g, P = D.P, B = D.B, t = P.t;
    const lenF = sk.len * lenK;
    const len = lenF * B.leg * (P.twirl ? 0.8 : 1);
    const flare = sk.flare * (P.twirl ? 2.2 : 1) + (P.run ? 1.2 : P.mv ? 0.4 : 0) + (P.air ? P.air * 1.5 : 0) + (P.floaty ? 1.4 : 0);
    const lift = (P.twirl ? 0.25 : 0) + (P.air ? -P.vy * 0.12 : 0) + (P.floaty ? 0.1 : 0) + abs(D.clothX) * 0.012;
    const H = hemRing(D, 0.28, len, flare, 0.3, lift);
    const dx = D.clothX * (0.45 + lenF) + (P.floaty ? 1.2 * sin(t * 1.1) : 0);
    const arc = hemProject(D, H, 1, dx, 0.22);
    const hemType = noHem ? 'plain' : sk.hem;
    const na = arc.length;
    const ax = SX[2], ay = SY[2];
    for (let i = 0; i < na; i++) {
      const j = arc[i];
      let y = HYs[j];
      if (hemType === 'pleat') y += (i % 2) * 0.6;
      else if (hemType === 'soot') y += 0.9 * sin(i * 2.1 + t * 0.8) + 0.6;
      ax[i] = HX[j]; ay[i] = y;
    }
    // 腰的两端
    ringAt(D, 0.28, RA);
    const eB = RA[7] + 0.3, eF = RA[6] + 0.3;
    let wLx = RA[0] - D.nx * eB, wLy = RA[1] - D.ny * eB, wRx = RA[0] + D.nx * eF, wRy = RA[1] + D.ny * eF;
    if (wLx > wRx) { let q = wLx; wLx = wRx; wRx = q; q = wLy; wLy = wRy; wRy = q; }
    // 坐着时：前面那条边沿着大腿顶搭到膝盖
    let knee = null;
    if (H.lap) { pj3(P, H.KX, H.KY, H.KZ, Q3); if (Q3[0] + dx * 0.5 > wRx + 1.2 && abs(P.sy) > 0.25) knee = [Q3[0] + dx * 0.5, Q3[1]]; }
    const col = colorOverride || sk.c;
    const path = (p, grow, down) => {
      p.moveTo(wLx - grow * 0.3, wLy);
      p.quadraticCurveTo(lerp(wLx, ax[0], 0.3) - 0.8 - grow, lerp(wLy, ay[0], 0.62), ax[0] - grow, ay[0] + down);
      for (let i = 1; i < na; i++) {
        const mx = (ax[i - 1] + ax[i]) * 0.5, my = (ay[i - 1] + ay[i]) * 0.5 + down;
        if (hemType === 'scallop' || hemType === 'lace') p.quadraticCurveTo(mx, my + 1.1, ax[i] + (i === na - 1 ? grow : 0), ay[i] + down);
        else p.quadraticCurveTo(ax[i - 1], ay[i - 1] + down, mx, my);
      }
      p.lineTo(ax[na - 1] + grow, ay[na - 1] + down);
      if (knee) {
        p.quadraticCurveTo(max(ax[na - 1], knee[0]) + 0.6, knee[1] + 0.6, knee[0], knee[1] - grow * 0.2);
        p.quadraticCurveTo(lerp(knee[0], wRx, 0.5), min(knee[1], wRy) - 0.4, wRx + grow * 0.3, wRy);
      } else p.quadraticCurveTo(lerp(wRx, ax[na - 1], 0.3) + 0.8 + grow, lerp(wRy, ay[na - 1], 0.62), wRx + grow * 0.3, wRy);
      p.closePath();
    };
    // 衬裙褶边（在裙子后面）
    if (hemType === 'frill' && !colorOverride) {
      g.beginPath(); path(g, 0.6, 1.6);
      fillC(D, sk.trim); inkC(D, D.ink * 0.8, '#9a9aa8');
      if (!D.sil && D.lod >= 1) { g.beginPath(); for (let i = 1; i < na; i++) { const x = (ax[i - 1] + ax[i]) * 0.5, y = (ay[i - 1] + ay[i]) * 0.5 + 1.5; g.moveTo(x, y); g.lineTo(x + 0.2, y - 1.1); } lineC(D, D.ink * 0.4, '#b8b8c8'); }
    }
    g.beginPath(); path(g, 0, 0);
    if (sk.c2 && !colorOverride && !D.sil) { const hx = D.hipX, hy = D.hipY; g.translate(hx, hy); g.fillStyle = skirtC2Grad(D, sk, len); g.fill(); g.translate(-hx, -hy); }
    else fillAtHip(D, clothGrad(D, col));
    celBand(D, (ax[0] + ax[na - 1]) * 0.5, (wLy + ay[0]) * 0.5, 1, 0, max(1, (ax[na - 1] - ax[0]) * 0.5), col, 0.9);
    inkC(D, D.inkB, inkOf(col));
    if (D.sil || D.lod === 0 || colorOverride) return;
    // 褶线：从腰到下摆
    if (hemType === 'pleat' || sk.plaid || D.lod >= 2) {
      g.beginPath();
      const step = hemType === 'pleat' ? 2 : 3;
      for (let i = step; i < na - 1; i += step) { const f = i / (na - 1); g.moveTo(lerp(wLx, wRx, f), lerp(wLy, wRy, f) + 1.2); g.quadraticCurveTo(lerp(lerp(wLx, wRx, f), ax[i], 0.5) + (f - 0.5) * 1.2, lerp(wLy, ay[i], 0.5), ax[i], ay[i] - 0.4); }
      lineC(D, D.inkT, rgba(inkOf(col), hemType === 'pleat' ? 0.6 : 0.35));
    }
    if (sk.plaid && D.lod >= 2) {
      g.beginPath();
      for (let k = 1; k < 4; k++) { const f = k / 4; g.moveTo(lerp(wLx, ax[0], f), lerp(wLy, ay[0], f)); g.lineTo(lerp(wRx, ax[na - 1], f), lerp(wRy, ay[na - 1], f)); }
      lineC(D, 0.35, sk.plaid);
    }
    if (hemType === 'lace') {
      g.beginPath();
      for (let i = 0; i < na - 1; i++) { const x = (ax[i] + ax[i + 1]) / 2, y = (ay[i] + ay[i + 1]) / 2 + 0.6; g.moveTo(x + 1, y - 0.3); g.arc(x, y - 0.3, 1, 0, PI); }
      fillC(D, sk.trim); inkC(D, D.ink * 0.5, '#b8b0c0');
    }
    if (hemType === 'soot') {
      // 被火山灰熏黑、撕破的裙摆
      g.beginPath();
      for (let i = 0; i < na; i++) { const r = 1.5 + 0.7 * sin(i * 1.7 + t * 0.6); g.moveTo(ax[i] + r, ay[i] - 0.9); g.arc(ax[i], ay[i] - 0.9, r, 0, TAU); }
      g.moveTo(ax[0], ay[0] - 2);
      for (let i = 1; i < na; i++) g.lineTo(ax[i], ay[i] - 2.2);
      for (let i = na - 1; i >= 0; i--) g.lineTo(ax[i], ay[i] - 0.5);
      fillC(D, sk.trim);
      g.globalAlpha = D.ga * 0.5;
      for (let k = 0; k < 4; k++) { const f = fract(t * 0.25 + k * 0.25), i = (k * 4 + 2) % na; g.beginPath(); g.arc(ax[i] + (k - 1.5) * 1.2, ay[i] + 1 + f * 3, 0.6 * (1 - f) + 0.2, 0, TAU); g.fillStyle = sk.trim; g.fill(); }
      g.globalAlpha = D.ga;
    }
    if (sk.check && D.lod >= 2) {
      const [c1, c2] = sk.check;
      for (let i = 1; i < na - 1; i++) { g.fillStyle = i % 2 ? c1 : c2; g.fillRect(ax[i] - 0.7, ay[i] - 3.1, 1.4, 1.4); }
    }
    if (D.O.apron) {
      g.beginPath();
      const i0 = floor(na * 0.25), i1 = ceil(na * 0.75) - 1;
      g.moveTo(lerp(wLx, wRx, 0.28), wLy);
      g.lineTo(ax[i0], ay[i0] - 3);
      for (let i = i0 + 1; i <= i1; i++) g.quadraticCurveTo(ax[i - 1], ay[i - 1] - 1.2, (ax[i - 1] + ax[i]) * 0.5, (ay[i - 1] + ay[i]) * 0.5 - 2.4);
      g.lineTo(lerp(wLx, wRx, 0.72), wRy);
      g.closePath();
      fillC(D, D.O.apron); inkC(D, D.ink * 0.6, '#a8a8b8');
    }
  }

  /* ---- 长外套 / 短外套（前襟敞开）：背片 / 两侧前片 / 躯干部分 ---- */
  const LVX = [], LVY = [], LVZ = [];
  for (let k = 0; k < 5; k++) { LVX.push(new Float64Array(HN)); LVY.push(new Float64Array(HN)); LVZ.push(new Float64Array(HN)); }
  function coatGeom(D, co) {
    const P = D.P, B = D.B;
    const len = co.len * B.leg;
    const flare = (co.flare != null ? co.flare : 2.2) + (P.run ? 1.6 : P.mv ? 0.5 : 0) + (P.floaty ? 1.5 : 0);
    const lift = abs(D.clothX) * 0.02 + (P.air ? -P.vy * 0.1 : 0);
    return hemRing(D, 0, len, flare, 0.7, lift);
  }
  function coatSway(D, k) { const P = D.P; return D.clothX * k * k * 1.15 + (P.floaty ? 1.4 * sin(P.t * 1.1) * k : 0); }
  /** 大衣下摆的一个点（level k、方位 φ）→ 投影，写进 out */
  function coatPt(D, H, phi, k, out) {
    hemPt(H, phi, k, Q4);
    pj3(D.P, Q4[0], Q4[1], Q4[2], out);
    out[0] += coatSway(D, k); out[1] += max(0, out[2]) * 0.2 * k;
    return out;
  }
  /** 破破烂烂的下摆：沿一串点加锯齿（纯烬的外套） */
  function hemJag(xs, ys, n, seed, amp) {
    for (let i = 1; i < n - 1; i++) ys[i] += (hash(seed, i) - 0.3) * amp * (i % 2 ? 1 : 0.35);
  }
  /** part: 'back'（背片，前视时看到的是里子）| 'front'（两侧前片）| 'full'（背影） */
  function drawCoatSkirt(D, co, part) {
    const g = D.g, P = D.P;
    const H = coatGeom(D, co);
    const tat = co.tatter && D.lod >= 1;
    const xs = SX[2], ys = SY[2];
    if (part === 'back' || part === 'full') {
      // 每一层的最左 / 最右点 + 最下面一层朝镜头的弧
      let n = 0;
      const R = SX[3], RY = SY[3];
      let nr = 0;
      for (let k = 0; k < 4; k++) {
        const kk = k / 4;
        let iL = 0, iR = 0, xL = 1e9, xR = -1e9, yL = 0, yR = 0;
        for (let j = 0; j < HN; j++) { coatPt(D, H, (j / HN) * TAU, kk, Q3); if (Q3[0] < xL) { xL = Q3[0]; yL = Q3[1]; iL = j; } if (Q3[0] > xR) { xR = Q3[0]; yR = Q3[1]; iR = j; } }
        xs[n] = xL; ys[n] = yL; n++;
        R[nr] = xR; RY[nr] = yR; nr++;
        void iL; void iR;
      }
      const arc = hemProject(D, H, 1, 0, 0.2);
      const sw = coatSway(D, 1);
      const n0 = n;
      for (let i = 0; i < arc.length; i++) { xs[n] = HX[arc[i]] + sw; ys[n] = HYs[arc[i]]; n++; }
      if (tat) { const ys2 = SY[2]; for (let i = n0 + 1; i < n - 1; i++) ys2[i] += (hash(7, i) - 0.3) * 2.4 * (i % 2 ? 1 : 0.35); }
      for (let i = nr - 1; i >= 0; i--) { xs[n] = R[i]; ys[n] = RY[i]; n++; }
      g.beginPath(); g.moveTo(xs[0], ys[0]);
      for (let i = 1; i < n; i++) g.lineTo(xs[i], ys[i]);
      g.closePath();
      const low = D.hipY > -D.B.leg * 0.62;
      const col = part === 'back' && !low ? co.lining : co.c;
      fillAtHip(D, clothGrad(D, col));
      if (part === 'full') celBand(D, (xs[0] + R[0]) * 0.5, D.hipY, 1, 0, max(1, (R[0] - xs[0]) * 0.5 + 2), col, 0.8);
      inkC(D, D.inkB, inkOf(co.c));
      if (part === 'full' && co.stripes && !D.sil && D.lod >= 1) {
        g.beginPath(); for (let i = n0 + 1; i < n0 + arc.length - 1; i++) { const x = xs[i], y = ys[i] - 3.2; if (i === n0 + 1) g.moveTo(x, y); else g.lineTo(x, y); }
        g.lineWidth = 0.9; g.strokeStyle = co.stripes; g.stroke();
      }
      if (part === 'full' && !D.sil && D.lod >= 1) {
        // 背后的中缝 + 两道褶
        g.beginPath(); coatPt(D, H, PI, 0.05, Q3); g.moveTo(Q3[0], Q3[1]); coatPt(D, H, PI, 0.95, Q3); g.lineTo(Q3[0], Q3[1]);
        for (const ph of [PI - 0.8, PI + 0.8]) { coatPt(D, H, ph, 0.3, Q3); g.moveTo(Q3[0], Q3[1]); coatPt(D, H, ph, 0.95, Q3); g.lineTo(Q3[0], Q3[1]); }
        lineC(D, D.inkT, rgba(inkOf(co.c), 0.5));
      }
      return;
    }
    // 前片：近侧（φ>0）与远侧。每层：前襟那条边（看得见时）→ 这一侧的轮廓最外点
    for (const sg of [1, -1]) {
      const dirX = sg > 0 ? -1 : 1;
      const FX = SX[3], FY = SY[3], EX = SX[0], EY = SY[0];
      const EPH = RB;
      let vis = 0;
      for (let k = 0; k < 5; k++) {
        const kk = k / 4, op = (co.open || 0.35) + 0.3 * kk + (P.run ? 0.25 * kk : 0);
        const phF = sg * op;
        coatPt(D, H, phF, kk, Q3);
        const fx = Q3[0], fy = Q3[1], fz = Q3[2];
        let ex = fx, ey = fy, ephi = phF;
        for (let q = 1; q <= 8; q++) {
          const ph = sg * (op + (PI * 0.98 - op) * q / 8);
          coatPt(D, H, ph, kk, Q2);
          if (Q2[0] * dirX > ex * dirX) { ex = Q2[0]; ey = Q2[1]; ephi = ph; }
        }
        if (fz > 0) { FX[k] = fx; FY[k] = fy; vis++; } else { FX[k] = ex; FY[k] = ey; }
        EX[k] = ex; EY[k] = ey; if (k < 8) EPH[k] = ephi;
      }
      if (!vis) continue;
      // 轮廓：外侧边（腰 → 下摆）→ 下摆（外 → 前襟）→ 前襟边（下摆 → 腰）
      g.beginPath();
      g.moveTo(EX[0], EY[0]);
      for (let k = 1; k < 5; k++) g.lineTo(EX[k], EY[k]);
      const phE = EPH[4], opH = (co.open || 0.35) + 0.3 + (P.run ? 0.25 : 0);
      const nh = 7;
      xs.length; let m = 0;
      for (let q = 1; q < nh; q++) { const ph = lerp(phE, sg * opH, q / nh); coatPt(D, H, ph, 1, Q2); xs[m] = Q2[0]; ys[m] = Q2[1]; m++; }
      if (tat) hemJag(xs, ys, m, sg > 0 ? 11 : 13, 2.4);
      for (let i = 0; i < m; i++) g.lineTo(xs[i], ys[i]);
      for (let k = 4; k >= 0; k--) g.lineTo(FX[k], FY[k]);
      g.closePath();
      fillAtHip(D, clothGrad(D, co.c));
      celBand(D, (EX[2] + FX[2]) * 0.5, EY[2], 1, 0, max(0.8, abs(EX[2] - FX[2]) * 0.5), co.c, 0.8);
      inkC(D, D.inkB, inkOf(co.c));
      if (D.sil || D.lod === 0) continue;
      // 前襟内侧翻出来的里子
      if (co.lining && vis >= 2) {
        const dir = sg > 0 ? -1 : 1;
        g.beginPath(); g.moveTo(FX[1], FY[1]);
        for (let k = 2; k < 5; k++) g.lineTo(FX[k], FY[k]);
        for (let k = 4; k >= 1; k--) g.lineTo(FX[k] + dir * (0.35 + 1.1 * k / 4) * (D.P.cy >= 0 ? 1 : -1), FY[k] - 0.2);
        g.closePath(); g.fillStyle = co.lining; g.fill();
      }
      if (co.stripes) {
        const kk = 1 - 3.2 / max(8, co.len * D.B.leg);
        g.beginPath();
        for (let q = 0; q <= 6; q++) { const ph = lerp(EPH[4], sg * ((co.open || 0.35) + 0.3 * kk), q / 6); coatPt(D, H, ph, kk, Q2); if (q) g.lineTo(Q2[0], Q2[1]); else g.moveTo(Q2[0], Q2[1]); }
        g.lineWidth = 0.9; g.strokeStyle = co.stripes; g.stroke();
      }
      if (co.lab && D.lod >= 1) {
        // 白大褂的口袋
        coatPt(D, H, sg * 1.0, 0.28, Q2);
        if (Q2[2] > 0.5) { g.beginPath(); g.moveTo(Q2[0] - 2.2, Q2[1]); g.lineTo(Q2[0] + 2.2, Q2[1]); g.lineTo(Q2[0] + 2.0, Q2[1] + 3.4); g.lineTo(Q2[0] - 2.0, Q2[1] + 3.4); g.closePath(); lineC(D, D.inkT * 1.2, inkOf(co.c)); }
      }
    }
  }
  function drawCoatTorso(D, co) {
    const g = D.g, P = D.P;
    const inf = 0.55;
    if (P.back) {
      g.beginPath(); torsoPath(D, g, 0, 1, inf, D.shoulderUp + 0.3); fillAtHip(D, clothGrad(D, co.c)); celTorso(D, co.c, 0, 1, inf); inkC(D, D.inkB, inkOf(co.c));
      if (co.hoodie && !D.sil && D.lod >= 1) { ringAt(D, 1, RA); g.beginPath(); g.ellipse(RA[0], RA[1] + 2.4, (RA[6] + RA[7]) * 0.4, 3, 0, 0, PI); lineC(D, D.inkT, rgba(inkOf(co.c), 0.6)); }
      return;
    }
    for (const sg of [1, -1]) {
      const pts = [];
      let vis = 0;
      for (const u of [0, 0.28, 0.52, 0.78, 1.0]) {
        const phe = sg * ((co.open || 0.35) + (1 - u) * 0.05 + (u > 0.8 ? (u - 0.8) * 1.5 : 0));
        surf(D, u, phe, inf, Q2);
        ringAt(D, u, RA);
        const near = (sg > 0) === (P.cy >= 0);
        const e = (near ? RA[7] : RA[6]) + inf;
        const sideX = near ? RA[0] - D.nx * e : RA[0] + D.nx * e;
        const sideY = near ? RA[1] - D.ny * e : RA[1] + D.ny * e;
        if (Q2[2] > 0) vis++;
        pts.push([sideX, sideY, Q2[2] > 0 ? Q2[0] : sideX, Q2[2] > 0 ? Q2[1] : sideY, u]);
      }
      if (!vis) continue;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      ringAt(D, 1, RA);
      const nw = D.neckW * 0.62;
      const sgx = (sg > 0) === (P.cy >= 0) ? -1 : 1;
      const up = D.shoulderUp + 0.3;
      g.quadraticCurveTo(pts[4][0] + D.ax * up, pts[4][1] + D.ay * up, RA[0] + sgx * D.nx * nw + D.ax * (up + 0.3), RA[1] + sgx * D.ny * nw + D.ay * (up + 0.3));
      g.lineTo(pts[4][2], pts[4][3]);
      for (let i = pts.length - 2; i >= 0; i--) g.lineTo(pts[i][2], pts[i][3]);
      g.closePath();
      fillAtHip(D, clothGrad(D, co.c));
      celBand(D, (pts[2][0] + pts[2][2]) * 0.5, pts[2][1], D.nx, D.ny, max(0.6, abs(pts[2][0] - pts[2][2]) * 0.5), co.c, 0.8);
      inkC(D, D.inkB, inkOf(co.c));
      if (!D.sil && D.lod >= 1 && pts[4][2] !== pts[4][0]) {
        // 翻领
        g.beginPath(); g.moveTo(pts[4][2], pts[4][3]); g.lineTo(pts[2][2] + sgx * -0.2, pts[2][3]); g.lineTo(lerp(pts[3][2], pts[3][0], 0.38), pts[3][3]); g.closePath();
        g.fillStyle = co.lapel || co.sh || dk(co.c, 0.12); g.fill(); g.lineWidth = D.ink * 0.6; g.strokeStyle = inkOf(co.c); g.stroke();
      }
      if (!D.sil && co.pockets && D.lod >= 1) {
        const px = lerp(pts[1][0], pts[1][2], 0.5), py = pts[1][1] + 1.5;
        g.beginPath(); g.rect(px - 1.6, py - 1.2, 3.2, 2.6); g.lineWidth = D.ink * 0.6; g.strokeStyle = inkOf(co.c); g.stroke();
      }
      if (!D.sil && co.teal && D.lod >= 1) {
        // 博士的外套：肩上的青色条纹
        g.beginPath(); surfLine(D, g, 0.98, sg * 0.9, 0.84, sg * 1.25, inf + 0.1, 3); lineC(D, 0.8, co.teal);
      }
    }
    if (co.cords && !D.sil) drawCoatCords(D, co);
  }
  /** 外套前襟垂下的一对渐变系带（纯烬：蓝 → 紫；卡提亚：蓝紫色） */
  function drawCoatCords(D, co) {
    const g = D.g, P = D.P;
    for (const sg of [1, -1]) {
      surf(D, 0.8, sg * ((co.open || 0.35) + 0.12), 1.0, Q2);
      if (Q2[2] < 0.5) continue;
      const N = 7, xs = SX[3], ys = SY[3], len = D.B.T * 0.95 + 6;
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        xs[i] = Q2[0] + D.clothX * 1.1 * u * u + 0.7 * sin(P.t * 2.1 + sg + u * 3) * u + (P.mv ? 0.6 * sin(2 * P.ph - u * 2 + sg) * u : 0);
        ys[i] = min(P.lie ? 1e9 : -0.5, Q2[1] + len * u * (1 - abs(D.clothX) * 0.01 * u));
      }
      g.lineCap = 'round';
      g.beginPath(); smooth(g, xs, ys, N, false);
      g.lineWidth = 0.95 + D.ink * 1.6; g.strokeStyle = inkOf(co.cords[1]); g.stroke();
      g.beginPath(); smooth(g, xs, ys, 4, false); g.lineWidth = 0.95; g.strokeStyle = co.cords[0]; g.stroke();
      g.beginPath(); g.moveTo(xs[3], ys[3]); for (let i = 4; i < N; i++) g.lineTo(xs[i], ys[i]); g.strokeStyle = co.cords[1]; g.stroke();
      g.beginPath(); g.ellipse(xs[N - 1], ys[N - 1] + 0.4, 0.55, 0.9, 0, 0, TAU); g.fillStyle = co.cords[1]; g.fill();
    }
  }
  /** 纯烬外套腰侧飘着的红色火焰状缎带（两条一组，末端卷起） */
  function drawRibbons(D, c) {
    const g = D.g, P = D.P, t = P.t;
    for (const sg of [1, -1]) {
      surf(D, 0.22, sg * 1.75, 1.4, Q2);
      if (!P.back && Q2[2] > 2.5) continue;
      for (let q = 0; q < 2; q++) {
        const N = 9, xs = LXs, ys = LYs, ws = LWs, len = (q ? 13 : 18) * (D.B.leg / 40);
        for (let i = 0; i < N; i++) {
          const u = i / (N - 1);
          xs[i] = Q2[0] + D.clothX * 1.3 * u * u + (sg * 0.9 + (q ? 1.2 : -0.6)) * u + 1.8 * sin(t * 2.4 + sg + q * 1.7 + u * 5) * u;
          ys[i] = min(-0.4, Q2[1] + len * u * (1 - abs(D.clothX) * 0.012 * u));
          ws[i] = (q ? 0.8 : 1.05) * (1 - 0.75 * u) + 0.12;
        }
        curlTail(xs, ys, N, 1.1, sg * (q ? -1 : 1), 0.62);
        g.beginPath(); ribbon(g, xs, ys, ws, N);
        g.lineWidth = D.ink * 1.6; g.strokeStyle = D.sil || inkOf(c); g.stroke();
        g.fillStyle = D.sil || (q ? lt(c, 0.12) : c); g.fill();
      }
    }
  }
  /** 术师外套后面的长尾摆 */
  function drawCapeTail(D, ct) {
    const g = D.g, P = D.P, B = D.B, t = P.t;
    ringAt(D, 0.36, RA);
    surf(D, 0.36, PI, 0.5, Q2);
    const x0 = Q2[0], y0 = Q2[1];
    const len = ct.len * B.leg, N = 9, xs = LXs, ys = LYs, ws = LWs;
    const w0 = RA[2] * (0.5 + 0.5 * abs(P.cy)) + 0.8;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      xs[i] = x0 + D.clothX * 1.35 * u * u + 1.1 * sin(t * 1.5 + u * 3.2) * u - P.sy * 1.8 * u;
      ys[i] = min(-0.5, y0 + len * u * (1 - abs(D.clothX) * 0.008 * u) - (P.floaty ? 4 * u * u : 0));
      ws[i] = w0 * (1 - 0.62 * pow(u, 1.2)) + 0.25;
    }
    g.beginPath(); ribbon(g, xs, ys, ws, N);
    fillAtHip(D, clothGrad(D, ct.c)); inkC(D, D.inkB, inkOf(ct.c));
    if (!D.sil && D.lod >= 1) { g.beginPath(); ribbonStrand(g, xs, ys, ws, N, 0.2, 0.1, 0.85); ribbonStrand(g, xs, ys, ws, N, -0.35, 0.3, 0.9); lineC(D, D.inkT, rgba(inkOf(ct.c), 0.5)); }
  }
  /** 放下的兜帽（在脖子后面） */
  function drawHoodDown(D, c, sh) {
    const g = D.g, P = D.P;
    ringAt(D, 1, RA);
    const e = (RA[6] + RA[7]) * 0.5;
    const cx = RA[0] - D.nx * P.sy * 1.5 * (P.back ? -1 : 1), cy = RA[1] + D.ay * 1.0;
    const rx = e * 0.95 + 1.2, ry = 5.2;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, P.back ? 0 : PI, P.back ? PI * 2 : TAU);
    g.ellipse(cx, cy - 1.2, rx, ry * 0.7, 0, 0, TAU);
    fillC(D, c); inkC(D, D.ink, inkOf(c));
    if (!D.sil && D.lod >= 1) { g.beginPath(); g.ellipse(cx, cy - 1.6, rx * 0.72, ry * 0.42, 0, PI + 0.2, TAU - 0.2); lineC(D, D.ink * 0.6, sh || dk(c, 0.2)); }
  }
  /** 小斗篷 / 披肩 / 披巾 */
  function drawCape(D, cp, kind) {
    const g = D.g, P = D.P;
    const uB = 1 - (cp.len || 0.36);
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
    let minI = 0, maxI = 0;
    for (let i = 1; i < k; i++) { if (xs[i] < xs[minI]) minI = i; if (xs[i] > xs[maxI]) maxI = i; }
    const xl = xs[minI], yl = ys[minI], xr = xs[maxI], yr = ys[maxI];
    const e = (RA[6] + RA[7]) * 0.5 + (kind === 'shawl' ? 2.8 : D.B.armW[0] + 1.2);
    const nw = D.neckW * 0.6;
    g.moveTo(xl, yl);
    g.quadraticCurveTo(RA[0] - D.nx * (e + 0.8), topY + 2, RA[0] - D.nx * nw, topY - 1.2);
    g.lineTo(RA[0] + D.nx * nw, topY - 1.2);
    g.quadraticCurveTo(RA[0] + D.nx * (e + 0.8), topY + 2, xr, yr);
    const hemPts = [];
    for (let i = 0; i < k; i++) hemPts.push([xs[i], ys[i]]);
    hemPts.sort((a, b) => b[0] - a[0]);
    for (const [x, y] of hemPts) g.lineTo(x, y + 0.6);
    g.closePath();
    fillAtHip(D, clothGrad(D, cp.c));
    celBand(D, (xl + xr) * 0.5, topY + 3, 1, 0, max(1, (xr - xl) * 0.5), cp.c, 0.8);
    inkC(D, D.inkB, inkOf(cp.c));
    if (D.sil || D.lod === 0) return;
    if (cp.trim) { g.beginPath(); for (let i = 0; i < hemPts.length; i++) { const [x, y] = hemPts[i]; if (i) g.lineTo(x, y - 0.4); else g.moveTo(x, y - 0.4); } lineC(D, 0.7, cp.trim); }
    if (cp.fringe && D.lod >= 1) { g.beginPath(); for (const [x, y] of hemPts) { g.moveTo(x, y + 0.6); g.lineTo(x + 0.2, y + 2); } lineC(D, 0.35, cp.fringe); }
    if (!P.back) {
      const op = kind === 'shawl' ? 0.62 : cp.open != null ? cp.open : 0.4;
      const strip = new Path2D();
      const pts2 = [[1.08, -op * 0.8], [uB - 0.02, -op * 1.15], [uB - 0.06, 0], [uB - 0.02, op * 1.15], [1.08, op * 0.8]];
      let vis = 0;
      for (let i = 0; i < pts2.length; i++) { surf(D, pts2[i][0], pts2[i][1], 2.0, Q2); if (Q2[2] > 0) vis++; if (i) strip.lineTo(Q2[0], Q2[1]); else strip.moveTo(Q2[0], Q2[1]); }
      strip.closePath();
      if (vis >= 2) {
        g.save(); g.clip(strip);
        g.beginPath(); torsoPath(D, g, 0, 1, 0, D.shoulderUp); fillAtHip(D, clothGrad(D, D.O.top));
        const O = D.O;
        if (O.bib) { g.beginPath(); if (surfPoly(D, g, [[1.02, -0.66], [0.8, -0.56], [0.72, -0.3], [0.7, 0], [0.72, 0.3], [0.8, 0.56], [1.02, 0.66]], 0.05)) { fillC(D, O.bib.c); inkC(D, D.ink * 0.8, inkOf(O.bib.c)); } }
        if (O.vest) { g.beginPath(); if (surfPoly(D, g, [[1.02, -0.5], [0.56, 0], [1.02, 0.5]], 0.08)) { fillC(D, O.shirt || '#f6f4ef'); inkC(D, D.ink * 0.8, inkOf(O.vest.c)); } }
        g.restore();
        g.beginPath(); for (const sg of [1, -1]) { surf(D, 1.08, sg * op * 0.8, 2.0, Q2); g.moveTo(Q2[0], Q2[1]); surf(D, uB - 0.02, sg * op * 1.15, 2.0, Q2); g.lineTo(Q2[0], Q2[1]); }
        lineC(D, D.ink, inkOf(cp.c));
      }
      drawCollar(D);
      if (cp.clasp && !D.O.neck) { surf(D, 0.97, 0, 2.6, Q2); if (Q2[2] > 0.5) { g.beginPath(); g.arc(Q2[0], Q2[1], 0.8, 0, TAU); fillC(D, cp.clasp); inkC(D, D.ink * 0.6, inkOf(cp.clasp)); } }
      if (D.O.pendant && kind !== 'cape') drawPendant(D, D.O.pendant);
    }
  }
  /**
   * 术师的颈部装备（照精英零立绘）：一圈灰色的毛绒领、挂在下巴下面的白色呼吸面罩（红色点缀），
   * 远侧颈边一个黑色的装置
   */
  function drawHeadphones(D) {
    const g = D.g, P = D.P, ink = D.ink;
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
    surf(D, 1.12, -1.05, 2.4, Q2);
    if (Q2[2] > -3 || P.back) {
      g.beginPath(); roundRectP(g, Q2[0] - 1.4, Q2[1] - 2.3, 2.8, 4.4, 0.6);
      g.fillStyle = D.sil || '#26232c'; g.fill(); g.lineWidth = ink * 0.8; g.strokeStyle = D.sil || '#0c0a10'; g.stroke();
      if (!D.sil && D.lod >= 1) { g.fillStyle = '#4a4656'; g.fillRect(Q2[0] - 0.8, Q2[1] - 1.6, 1.6, 0.5); g.fillRect(Q2[0] - 0.8, Q2[1] - 0.7, 1.6, 0.5); }
    }
    ring(front);
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
  /** 从胸前垂下的一条带子（术师的红色系带），随风飘 */
  function drawCord(D, x0, y0, len, w, color, k) {
    const g = D.g, N = 7, xs = SX[1], ys = SY[1];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      xs[i] = x0 + D.clothX * 0.9 * u * u * 1.4 + 0.8 * sin(D.P.t * 2.2 + k + u * 3) * u + (D.P.mv ? 0.6 * sin(2 * D.P.ph - u * 2 + k) * u : 0);
      ys[i] = min(D.P.lie ? 1e9 : -0.5, y0 + len * u * (1 - abs(D.clothX) * 0.01 * u));
    }
    g.beginPath(); smooth(g, xs, ys, N, false);
    g.lineCap = 'round';
    g.lineWidth = w + D.ink * 1.6; g.strokeStyle = D.sil || inkOf(color); g.stroke();
    g.lineWidth = w; g.strokeStyle = D.sil || color; g.stroke();
    if (!D.sil && D.lod >= 1) { g.beginPath(); g.arc(xs[N - 1], ys[N - 1] + 0.3, w * 0.75, 0, TAU); g.fillStyle = color; g.fill(); }
  }

  /* ================================================================
   * 手臂：锥形胶囊（肩 → 肘 → 腕），袖口、条纹、褶；手：手掌 + 四指 + 拇指
   * ================================================================ */
  function armPath(D, g, i, seg) {
    const B = D.B, J = D.j, O = D.O, k = D.sleeveK;
    const sh = J.sh[i], el = J.el[i], wr = J.wr[i];
    const rS = B.armW[0] * 0.5 * k, rE = B.armW[1] * 0.5 * k * D.foreK, rW = B.armW[2] * 0.5 * k * D.foreK * D.cuffK;
    if (seg & 1) {
      capsule(g, sh[0], sh[1], rS, el[0], el[1], rE);
      if (O.puff) { const a = atan2(el[1] - sh[1], el[0] - sh[0]); ellP(g, lerp(sh[0], el[0], 0.3), lerp(sh[1], el[1], 0.3), rS * 1.45, rS * 1.2, a); }
    }
    if (seg & 2) capsule(g, el[0], el[1], rE, wr[0], wr[1], rW);
  }
  function drawArm(D, i, part) {
    const g = D.g, B = D.B, O = D.O, J = D.j;
    if (part === 'hand') { drawHand(D, i); return; }
    const doU = part === 'all' || part === 'upper' || part === 'nohand';
    const doF = part !== 'upper';
    const doH = part === 'all' || part === 'fore';
    const dim = i === 1 ? D.farDim : 0;
    let cU = O.sleeve ? O.sleeve[0] : O.top, cF = O.sleeve ? O.sleeve[1] : O.top;
    if (dim && !D.sil) { cU = dimC(cU, dim); cF = dimC(cF, dim); }
    const seg = (doU ? 1 : 0) | (doF ? 2 : 0);
    const sh = J.sh[i], el = J.el[i], wr = J.wr[i], k = D.sleeveK;
    g.lineJoin = 'round'; g.lineCap = 'round';
    // 1. 墨线：几段一起描（粗一倍），填色会盖住里面那一半 → 只剩外轮廓，肘部没有接缝
    g.beginPath(); armPath(D, g, i, seg);
    const co = O.coat || O.jacket;
    let cuffPts = null;
    if (doF && co && D.lod >= 1) {
      // 大衣的喇叭袖口
      let dx = wr[0] - el[0], dy = wr[1] - el[1];
      const l = hypot(dx, dy) || 1; dx /= l; dy /= l;
      const nx = -dy, ny = dx, rW = B.armW[2] * 0.5 * k * D.foreK * D.cuffK;
      cuffPts = [wr[0] + nx * rW * 0.95 - dx * 1.6, wr[1] + ny * rW * 0.95 - dy * 1.6, wr[0] + nx * rW * 1.42 + dx * 0.7, wr[1] + ny * rW * 1.42 + dy * 0.7,
        wr[0] - nx * rW * 1.42 + dx * 0.7, wr[1] - ny * rW * 1.42 + dy * 0.7, wr[0] - nx * rW * 0.95 - dx * 1.6, wr[1] - ny * rW * 0.95 - dy * 1.6];
      polyCW(g, cuffPts);
    }
    g.lineWidth = D.inkB * 2; g.strokeStyle = D.sil || inkOf(doF ? cF : cU); g.stroke();
    // 2. 填色
    if (doU) {
      g.beginPath(); armPath(D, g, i, 1); fillC(D, cU);
      celSeg(D, sh[0], sh[1], el[0], el[1], B.armW[0] * 0.5 * k * 1.05, cU);
    }
    if (doF) {
      g.beginPath(); armPath(D, g, i, 2); if (cuffPts) polyCW(g, cuffPts); fillC(D, cF);
      celSeg(D, el[0], el[1], wr[0], wr[1], B.armW[1] * 0.5 * k * D.foreK * 1.1, cF);
    }
    if (!D.sil && D.lod >= 1) {
      let dx = wr[0] - el[0], dy = wr[1] - el[1];
      const l = hypot(dx, dy) || 1; dx /= l; dy /= l;
      const nx = -dy, ny = dx;
      const rE = B.armW[1] * 0.5 * k * D.foreK, rW = B.armW[2] * 0.5 * k * D.foreK * D.cuffK;
      const band = (f0, f1, c, grow) => {
        const r0 = lerp(rE, rW, f0) * grow, r1 = lerp(rE, rW, f1) * grow;
        const x0 = el[0] + (wr[0] - el[0]) * f0, y0 = el[1] + (wr[1] - el[1]) * f0, x1 = el[0] + (wr[0] - el[0]) * f1, y1 = el[1] + (wr[1] - el[1]) * f1;
        g.beginPath(); g.moveTo(x0 + nx * r0, y0 + ny * r0); g.lineTo(x1 + nx * r1, y1 + ny * r1); g.lineTo(x1 - nx * r1, y1 - ny * r1); g.lineTo(x0 - nx * r0, y0 - ny * r0); g.closePath();
        g.fillStyle = c; g.fill();
      };
      if (doF) {
        if (co && co.stripes) { band(0.46, 0.54, co.stripes, 0.98); band(0.6, 0.68, co.stripes, 0.98); }
        if (O.cuff && !cuffPts) { band(0.82, 1.0, O.cuff, 1.02); g.beginPath(); g.moveTo(el[0] + (wr[0] - el[0]) * 0.82 + nx * rW, el[1] + (wr[1] - el[1]) * 0.82 + ny * rW); g.lineTo(el[0] + (wr[0] - el[0]) * 0.82 - nx * rW, el[1] + (wr[1] - el[1]) * 0.82 - ny * rW); lineC(D, D.inkT, inkOf(O.cuff)); }
        if (cuffPts) {
          // 袖口的里子 + 一道边
          g.beginPath(); g.moveTo(cuffPts[2], cuffPts[3]); g.quadraticCurveTo(wr[0] + dx * 0.2, wr[1] + dy * 0.2, cuffPts[4], cuffPts[5]); g.lineTo(wr[0] - nx * rW * 1.2 + dx * 0.9, wr[1] - ny * rW * 1.2 + dy * 0.9); g.lineTo(wr[0] + nx * rW * 1.2 + dx * 0.9, wr[1] + ny * rW * 1.2 + dy * 0.9); g.closePath();
          g.fillStyle = co.lining || shadeOf(co.c); g.fill();
          if (O.cuff) { g.beginPath(); g.moveTo(cuffPts[0], cuffPts[1]); g.lineTo(cuffPts[6], cuffPts[7]); lineC(D, D.inkT * 1.4, O.cuff); }
        }
        // 肘弯处的一道褶
        if (D.lod >= 2) {
          const ux = el[0] - sh[0], uy = el[1] - sh[1], cr = ux * dy - uy * dx;
          if (abs(cr) > 0.25 * hypot(ux, uy)) {
            const s = cr > 0 ? 1 : -1;
            g.beginPath(); g.moveTo(el[0] - nx * s * rE * 0.2 - dx * rE * 0.6, el[1] - ny * s * rE * 0.2 - dy * rE * 0.6); g.quadraticCurveTo(el[0] + nx * s * rE * 0.1, el[1] + ny * s * rE * 0.1, el[0] - nx * s * rE * 0.3 + dx * rE * 0.8, el[1] - ny * s * rE * 0.3 + dy * rE * 0.8);
            lineC(D, D.inkT, rgba(inkOf(cF), 0.55));
          }
        }
      }
      if (doU && D.lod >= 2 && !O.puff) {
        // 上臂袖子的一道垂褶
        let ux = el[0] - sh[0], uy = el[1] - sh[1];
        const ul = hypot(ux, uy) || 1; ux /= ul; uy /= ul;
        const rS = B.armW[0] * 0.5 * k;
        const s = (-uy * D.Lc[0] + ux * D.Lc[1]) >= 0 ? -1 : 1;
        g.beginPath(); g.moveTo(sh[0] + ux * ul * 0.35 - uy * s * rS * 0.4, sh[1] + uy * ul * 0.35 + ux * s * rS * 0.4); g.lineTo(sh[0] + ux * ul * 0.75 - uy * s * rS * 0.3, sh[1] + uy * ul * 0.75 + ux * s * rS * 0.3);
        lineC(D, D.inkT, rgba(inkOf(cU), 0.45));
      }
    }
    if (doH && doF) drawHand(D, i);
  }
  function handPath(g, type, px, py, dx, dy, nx, ny, ang, r, ts) {
    if (type === 'fist' || type === 'grip' || type === 'point') {
      ellP(g, px, py, r * 0.86, r * 0.76, ang);
      ellP(g, px + nx * r * 0.5 + dx * r * 0.14, py + ny * r * 0.5 + dy * r * 0.14, r * 0.4, r * 0.27, ang + ts * 0.35);
      if (type === 'point') ellP(g, px + dx * r * 1.02 + nx * r * 0.18, py + dy * r * 1.02 + ny * r * 0.18, r * 0.68, r * 0.22, ang);
    } else {
      const flat = type === 'flat';
      ellP(g, px, py, r * 0.8, r * 0.72, ang);
      ellP(g, px + dx * r * 0.72 - nx * r * 0.06, py + dy * r * 0.72 - ny * r * 0.06, r * (flat ? 0.66 : 0.6), r * (flat ? 0.56 : 0.64), ang);
      ellP(g, px + nx * r * 0.62 + dx * r * 0.08, py + ny * r * 0.62 + dy * r * 0.08, r * 0.42, r * 0.21, ang + ts * (flat ? 0.45 : 0.85));
    }
  }
  function drawHand(D, i) {
    const P = D.P, A = P.A[i], type = A.hand;
    if (type === 'hide') return;
    const g = D.g, B = D.B, J = D.j, sk = D.C.skin;
    const wr = J.wr[i], el = J.el[i];
    let dx = wr[0] - el[0], dy = wr[1] - el[1];
    const l = hypot(dx, dy) || 1; dx /= l; dy /= l;
    const r = B.hand;
    const ts = ((-dy >= 0 ? 1 : -1) * (dx >= 0 ? 1 : -1)) >= 0 ? 1 : -1;
    const nx = -dy * ts, ny = dx * ts, ang = atan2(dy, dx);
    const px = wr[0] + dx * r * 0.55, py = wr[1] + dy * r * 0.55;
    const gl = D.O.gloves;
    let skc = gl || sk.c;
    if (i === 1 && D.farDim && !D.sil) skc = dimC(skc, D.farDim * 0.7);
    g.beginPath(); handPath(g, type, px, py, dx, dy, nx, ny, ang, r, ts);
    g.lineWidth = D.ink * 1.9; g.strokeStyle = D.sil || (gl ? inkOf(gl) : sk.ink); g.stroke();
    g.fillStyle = D.sil || skc; g.fill();
    if (D.sil || D.lod < 2) return;
    g.beginPath();
    if (type === 'open' || type === 'flat') {
      const spread = type === 'open' ? 0.3 : 0.2;
      for (let q = -1; q <= 0; q++) {
        const o = (q + 0.5) * r * spread * 2 - r * 0.08;
        const fx = px + dx * r * 1.02 - nx * o, fy = py + dy * r * 1.02 - ny * o;
        g.moveTo(fx, fy); g.lineTo(fx + dx * r * 0.32, fy + dy * r * 0.32);
      }
    } else {
      g.moveTo(px + dx * r * 0.62 - nx * r * 0.45, py + dy * r * 0.62 - ny * r * 0.45);
      g.quadraticCurveTo(px + dx * r * 0.82, py + dy * r * 0.82, px + dx * r * 0.62 + nx * r * 0.2, py + dy * r * 0.62 + ny * r * 0.2);
    }
    g.lineWidth = D.inkT; g.strokeStyle = rgba(gl ? '#6a6c78' : sk.ink, 0.5); g.stroke();
  }

  /* ================================================================
   * 腿：髋 → 膝 → 小腿肚 → 踝（锥形胶囊链）；丝袜 / 袜子 / 裤子是同一条腿的一段；鞋底正好落在 y = 0
   * ================================================================ */
  const LG = { hx: 0, hy: 0, kx: 0, ky: 0, cx: 0, cy: 0, ax: 0, ay: 0, rT: 0, rK: 0, rC: 0, rA: 0 };
  function legGeom(D, i) {
    const B = D.B, O = D.O, J = D.j, P = D.P;
    const hj = J.hj[i], kn = J.kn[i], an = J.an[i];
    const pants = O.pants && !O.pants.shorts ? O.pants : null;
    if (pants) { LG.rT = pants.w[0] * 0.5; LG.rK = (pants.w[0] + pants.w[1]) * 0.25; LG.rC = pants.w[1] * 0.52; LG.rA = pants.w[1] * 0.48; }
    else { LG.rT = B.legW[0] * 0.5; LG.rK = B.legW[2] * 0.5; LG.rC = B.legW[1] * 0.5; LG.rA = B.legW[3] * 0.5; }
    LG.hx = hj[0]; LG.hy = hj[1]; LG.kx = kn[0]; LG.ky = kn[1]; LG.ax = an[0]; LG.ay = an[1];
    // 小腿肚：在小腿的后面（小腿方向的法线，膝盖朝前弯时正好是后侧）
    let dx = an[0] - kn[0], dy = an[1] - kn[1];
    const l = hypot(dx, dy) || 1; dx /= l; dy /= l;
    const bulge = pants ? 0 : (LG.rC - (LG.rK + LG.rA) * 0.5) * 0.7 * min(1, abs(P.sy) * 1.4);
    LG.cx = kn[0] + (an[0] - kn[0]) * 0.3 - dy * bulge; LG.cy = kn[1] + (an[1] - kn[1]) * 0.3 + dx * bulge;
    return LG;
  }
  /** 沿腿的参数 u（0 髋，0.5 膝，0.65 小腿肚，1 踝）上的点 → [x, y, r] */
  function legAt(L, u, out) {
    if (u <= 0.5) { const f = u / 0.5; out[0] = lerp(L.hx, L.kx, f); out[1] = lerp(L.hy, L.ky, f); out[2] = lerp(L.rT, L.rK, f); }
    else if (u <= 0.65) { const f = (u - 0.5) / 0.15; out[0] = lerp(L.kx, L.cx, f); out[1] = lerp(L.ky, L.cy, f); out[2] = lerp(L.rK, L.rC, f); }
    else { const f = (u - 0.65) / 0.35; out[0] = lerp(L.cx, L.ax, f); out[1] = lerp(L.cy, L.ay, f); out[2] = lerp(L.rC, L.rA, f); }
    return out;
  }
  /** 腿从 u0 到脚踝的那一段（胶囊链） */
  function legPath(g, L, u0) {
    legAt(L, u0, Q3);
    if (u0 < 0.5) { capsule(g, Q3[0], Q3[1], Q3[2], L.kx, L.ky, L.rK); capsule(g, L.kx, L.ky, L.rK, L.cx, L.cy, L.rC); capsule(g, L.cx, L.cy, L.rC, L.ax, L.ay, L.rA); }
    else if (u0 < 0.65) { capsule(g, Q3[0], Q3[1], Q3[2], L.cx, L.cy, L.rC); capsule(g, L.cx, L.cy, L.rC, L.ax, L.ay, L.rA); }
    else capsule(g, Q3[0], Q3[1], Q3[2], L.ax, L.ay, L.rA);
  }
  /** u 处横过腿的一道线（袜口 / 裤脚） */
  function legCross(g, L, u, bow) {
    const ua = min(1, u + 0.02), ub = max(0, u - 0.02);
    legAt(L, ua, Q4); const x2 = Q4[0], y2 = Q4[1];
    legAt(L, ub, Q4); const x1 = Q4[0], y1 = Q4[1];
    legAt(L, u, Q3);
    let dx = x2 - x1, dy = y2 - y1;
    const l = hypot(dx, dy) || 1; dx /= l; dy /= l;
    const r = Q3[2] * 0.98;
    g.moveTo(Q3[0] - dy * r, Q3[1] + dx * r);
    g.quadraticCurveTo(Q3[0] + dx * bow, Q3[1] + dy * bow, Q3[0] + dy * r, Q3[1] - dx * r);
  }
  function drawLeg(D, i) {
    const g = D.g, O = D.O, P = D.P;
    const L = legGeom(D, i);
    const pants = O.pants && !O.pants.shorts ? O.pants : null;
    const lg = O.legs;
    const dim = i === 1 ? D.farDim : 0;
    const skin = D.C.skin.c;
    const c0 = pants ? pants.c : lg ? lg.c[0] : skin;
    const st = !pants && lg && lg.stock != null ? lg.stock : 0;
    const c1 = pants ? pants.c : lg ? lg.c[1] : c0;
    const cShin = pants ? pants.c : lg ? (lg.sock ? lg.c[1] : lg.c[2]) : c0;
    const D0 = (c) => dim && !D.sil ? dimC(c, dim) : c;
    g.lineCap = 'round'; g.lineJoin = 'round';
    // 1. 整条腿：先描外轮廓
    g.beginPath(); legPath(g, L, 0);
    g.lineWidth = D.inkB * 2; g.strokeStyle = D.sil || inkOf(c1 === skin ? D.C.skin.ink : c1); g.stroke();
    g.fillStyle = D.sil || D0(c0); g.fill();
    if (!D.sil) {
      // 2. 颜色分段：长筒袜 / 小腿 / 袜子
      if (st > 0 && c1 !== c0) { g.beginPath(); legPath(g, L, st * 0.5); g.fillStyle = D0(c1); g.fill(); g.beginPath(); legCross(g, L, st * 0.5, 0.6); lineC(D, D.ink * 0.9, dk(c1, 0.3)); }
      const cAbove = st > 0 ? c1 : c0;
      if (cShin !== cAbove) { g.beginPath(); legPath(g, L, 0.5); g.fillStyle = D0(cShin); g.fill(); }
      if (lg && lg.sock) {
        const u = 0.5 + 0.5 * lg.sock;
        g.beginPath(); legPath(g, L, u); g.fillStyle = D0(lg.c[2]); g.fill();
        g.beginPath(); legCross(g, L, u, 0.5); lineC(D, D.ink * 0.9, dk(lg.c[2], 0.18));
      }
      // 3. 阴影带（大腿、小腿各一条）
      if (D.lod >= 1 && D.shade > 0) {
        g.beginPath(); capsule(g, L.hx, L.hy, L.rT, L.kx, L.ky, L.rK); celSeg(D, L.hx, L.hy, L.kx, L.ky, L.rT, c0, 0.85);
        g.beginPath(); capsule(g, L.kx, L.ky, L.rK, L.cx, L.cy, L.rC); capsule(g, L.cx, L.cy, L.rC, L.ax, L.ay, L.rA); celSeg(D, L.kx, L.ky, L.ax, L.ay, L.rC, cShin, 0.85);
      }
      if (lg && D.lod >= 1) {
        if (lg.straps) {
          g.beginPath();
          for (let k = 1; k <= 3; k++) { legAt(L, 0.56 + k * 0.1, Q3); const x = Q3[0], y = Q3[1], w = Q3[2] * 0.95; g.moveTo(x - w, y - 0.7); g.lineTo(x + w, y + 0.7); g.moveTo(x + w, y - 0.7); g.lineTo(x - w, y + 0.7); }
          lineC(D, 0.42, lg.straps);
        }
        if (lg.bows) { legAt(L, 0.6, Q3); g.save(); g.translate(Q3[0], Q3[1]); g.scale(0.72, 0.72); bowShape(g, D, lg.bows, D.ink / 0.72); g.restore(); }
        if (lg.band) { g.beginPath(); legAt(L, 0.9, Q3); capsule(g, Q3[0], Q3[1], Q3[2] * 1.06, L.ax + (Q3[0] - L.ax) * 0.3, L.ay + (Q3[1] - L.ay) * 0.3, L.rA * 1.06); g.fillStyle = lg.band; g.fill(); }
        if (lg.band2) { g.beginPath(); legAt(L, 0.93, Q3); capsule(g, Q3[0], Q3[1], Q3[2] * 1.05, L.ax + (Q3[0] - L.ax) * 0.4, L.ay + (Q3[1] - L.ay) * 0.4, L.rA * 1.05); g.fillStyle = lg.band2; g.fill(); }
        if (lg.ribbons) { g.beginPath(); g.ellipse(L.ax, L.ay - 0.6, L.rA * 1.2, 0.7, 0, 0, TAU); g.fillStyle = lg.ribbons; g.fill(); }
      }
      if (pants && D.lod >= 1) {
        if (pants.cuff) { g.beginPath(); legPath(g, L, 0.9); g.fillStyle = pants.cuff; g.fill(); }
        if (pants.cargo && D.lod >= 1) { legAt(L, 0.28, Q3); const s = (P.sy >= 0 ? 1 : -1) * 0; g.beginPath(); roundRectP(g, Q3[0] - Q3[2] * 0.55 + s, Q3[1] - 1.2, Q3[2] * 1.1, 3.2, 0.4); g.fillStyle = pants.cargo; g.fill(); lineC(D, D.inkT, inkOf(pants.c)); }
        // 膝盖的褶
        if (D.lod >= 2) { g.beginPath(); legCross(g, L, 0.52, -0.8); lineC(D, D.inkT, rgba(inkOf(pants.c), 0.45)); }
      }
    }
    // 短裤（芳汀）：盖住大腿根
    if (O.pants && O.pants.shorts) {
      const pc = O.pants.c;
      legAt(L, 0.2, Q3);
      g.beginPath(); capsule(g, L.hx, L.hy - 0.6, L.rT * 1.18, Q3[0], Q3[1], Q3[2] * 1.14);
      g.lineWidth = D.ink * 1.6; g.strokeStyle = D.sil || inkOf(pc); g.stroke(); g.fillStyle = D.sil || D0(pc); g.fill();
    }
    drawShoe(D, i, L);
  }
  function drawShoe(D, i, LGe) {
    const g = D.g, O = D.O, B = D.B, P = D.P, L = P.L[i], J = D.j;
    const sh = O.shoes || { c: '#4a3a30', sole: '#221812', type: 'shoe' };
    const an = J.an[i], kn = J.kn[i];
    const dim = i === 1 ? D.farDim : 0;
    const Dc = (c) => dim && !D.sil ? dimC(c, dim) : c;
    // 脚（3D）：前方 fdir、脚底方向 down；鞋底正好在踝关节下方 B.ank
    const fp = L.fp, sf = sin(fp), cf = cos(fp);
    const len = B.foot * (sh.type === 'slipper' ? 1.08 : sh.type === 'chunky' ? 1.06 : 1);
    const rr = B.ank * 0.47;
    const A3 = L.an;
    const hb = B.ank - rr;
    // 脚跟、脚尖的 3D → 投影
    pj3(P, A3[0], A3[1] + cf * hb - sf * (-len * 0.22), A3[2] + sf * hb + cf * (-len * 0.22), Q3);
    let x0 = Q3[0], y0 = Q3[1];
    pj3(P, A3[0], A3[1] + cf * (B.ank - rr * 1.08) - sf * (len * 0.74), A3[2] + sf * (B.ank - rr * 1.08) + cf * (len * 0.74), Q3);
    let x1 = Q3[0], y1 = Q3[1];
    // 以投影后的踝为基准（腿的 J 数组已经算好）
    const ox = an[0] - (-A3[0] * P.cy + A3[2] * P.sy), oy = an[1] - A3[1];
    x0 += ox; x1 += ox; y0 += oy; y1 += oy;
    const wLat = (LGe.rA * 2 + 1.4) * abs(P.cy);
    const d = hypot(x1 - x0, y1 - y0);
    if (d < wLat) { const cx = (x0 + x1) / 2, e = wLat / 2, dir = x1 >= x0 ? 1 : -1; x0 = cx - e * dir; x1 = cx + e * dir; const yy = max(y0, y1); y0 = yy; y1 = yy; }
    const ink = D.ink;
    // 靴筒（长靴）
    if (sh.type === 'boot' && !(O.pants && !O.pants.tuck && !O.pants.shorts)) {
      const top = sh.shaft && O.legs && O.legs.stock != null ? 0.42 : 0.42;
      const tx = lerp(an[0], kn[0], top), ty = lerp(an[1], kn[1], top), rw = LGe.rA + 0.55;
      g.beginPath(); capsule(g, an[0], an[1] + B.ank * 0.2, rw, tx, ty, rw * 1.08);
      g.lineWidth = D.inkB * 2; g.strokeStyle = D.sil || inkOf(sh.shaft || sh.c); g.stroke();
      g.fillStyle = D.sil || Dc(sh.shaft || sh.c); g.fill();
      if (!D.sil && D.lod >= 1) {
        // 靴口的翻边 + 交叉的鞋带
        g.beginPath(); g.moveTo(tx - rw * 1.1, ty + 0.2); g.lineTo(tx + rw * 1.1, ty + 0.2); lineC(D, 0.8, dk(sh.shaft || sh.c, 0.15));
        if (sh.lace) { g.beginPath(); for (let k = 1; k <= 3; k++) { const f = k / 4 * top; const x = lerp(an[0], kn[0], f), y = lerp(an[1], kn[1], f); g.moveTo(x - 0.8, y - 0.45); g.lineTo(x + 0.8, y + 0.45); g.moveTo(x + 0.8, y - 0.45); g.lineTo(x - 0.8, y + 0.45); } lineC(D, 0.42, sh.lace); }
      }
    }
    if (sh.type === 'sandal') {
      g.beginPath(); capsule(g, x0, y0, rr * 0.85, x1, y1, rr * 0.9); fillC(D, D.C.skin.c); inkC(D, ink * 0.8, D.C.skin.ink);
      g.beginPath(); capsule(g, x0, y0 + rr * 0.75, rr * 0.34, x1, y1 + rr * 0.75, rr * 0.34); fillC(D, sh.c); inkC(D, ink * 0.6, inkOf(sh.c));
      if (!D.sil) { g.beginPath(); g.moveTo(lerp(x0, x1, 0.55), y0 - rr * 0.8); g.lineTo(lerp(x0, x1, 0.62), y0 + rr * 0.6); g.moveTo(lerp(x0, x1, 0.25), y0 - rr * 0.7); g.lineTo(lerp(x0, x1, 0.2), y0 + rr * 0.6); lineC(D, 0.6, sh.c); }
      return;
    }
    const soleK = sh.type === 'chunky' ? 0.62 : sh.type === 'boot' ? 0.4 : 0.32;
    // 鞋底（底边正好落地）→ 鞋面（往上挪一点，露出鞋底的一条边）
    g.beginPath(); capsule(g, x0, y0, rr, x1, y1, rr * 1.08);
    g.lineWidth = D.inkB * 2; g.strokeStyle = D.sil || inkOf(sh.c); g.stroke();
    g.fillStyle = D.sil || Dc(sh.sole); g.fill();
    const up = rr * soleK;
    g.beginPath(); capsule(g, x0, y0 - up, rr * 0.94, x1, y1 - up, rr * 1.0);
    g.fillStyle = D.sil || Dc(sh.c); g.fill();
    if (D.sil) return;
    if (D.lod >= 1) {
      celSeg(D, x0, y0 - up, x1, y1 - up, rr, sh.c, 0.7);
      g.globalAlpha = D.ga * 0.4; g.beginPath(); g.ellipse(lerp(x0, x1, 0.64), lerp(y0, y1, 0.64) - up - rr * 0.42, abs(x1 - x0) * 0.2 + 0.3, rr * 0.24, 0, 0, TAU); g.fillStyle = '#ffffff'; g.fill(); g.globalAlpha = D.ga;
      if (sh.type === 'mary') { g.beginPath(); g.moveTo(lerp(x0, x1, 0.42), y0 - up - rr * 0.85); g.lineTo(lerp(x0, x1, 0.46), y0 - up + rr * 0.45); lineC(D, 0.55, dk(sh.c, 0.4)); }
      if ((sh.type === 'chunky' || sh.type === 'shoe') && sh.lace) { g.beginPath(); const mx = lerp(x0, x1, 0.45), my = lerp(y0, y1, 0.45) - up - rr * 0.72; g.moveTo(mx - 0.7, my - 0.3); g.lineTo(mx + 0.7, my + 0.3); g.moveTo(mx + 0.7, my - 0.3); g.lineTo(mx - 0.7, my + 0.3); lineC(D, 0.45, sh.lace); }
      if (sh.type === 'slipper') { g.beginPath(); g.arc(lerp(x0, x1, 0.74), lerp(y0, y1, 0.74) - up - rr * 0.5, rr * 0.45, 0, TAU); g.fillStyle = lt(sh.c, 0.4); g.fill(); }
      if (sh.type === 'shoe' && D.lod >= 2) { g.beginPath(); g.moveTo(lerp(x0, x1, 0.3), y0 - up - rr * 0.6); g.quadraticCurveTo(lerp(x0, x1, 0.5), y0 - up - rr * 1.0, lerp(x0, x1, 0.72), y1 - up - rr * 0.55); lineC(D, D.inkT, rgba(inkOf(sh.c), 0.6)); }
    }
  }
  /** 裤子的裆部（两腿之间） */
  function drawPelvis(D) {
    const g = D.g, O = D.O, J = D.j;
    if (!O.pants) return;
    ringAt(D, 0.0, RA);
    const a = J.hj[0], b = J.hj[1];
    g.beginPath();
    g.moveTo(RA[0] - D.nx * RA[7], RA[1] - D.ny * RA[7] - 0.5);
    g.lineTo(RA[0] + D.nx * RA[6], RA[1] + D.ny * RA[6] - 0.5);
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
    const L = 96 * (P.kid ? 0.75 : 1);
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
  const PROP_K = { cassette: 1.8, recorder: 1.55, popsicle: 1.8, letter: 1.7, stone: 1.75, wreath: 1.45, wreaths: 1.35, book: 1.65, notebook: 1.6, lantern: 1.3, flower: 1.8, trowel: 1.6, soda: 1.75, hammer: 1.45, basket: 1.6, tie: 1.5, mug: 1.8, box: 1.25, camera: 1.7, map: 1.45, violin: 1.15 };
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
        // 攥在手里甩的领带：永远朝“离开脸”的方向（从头中心指向手）往外、往下飘，不会横过眼镜
        let ox = hx - D.headX, oy = hy - D.headY;
        const ol = hypot(ox, oy) || 1; ox /= ol; oy /= ol;
        let ex = ox * 0.75, ey = oy * 0.75 + 0.55;
        const el = hypot(ex, ey) || 1; ex /= el; ey /= el;
        const N = 7, xs = SX[3], ys = SY[3], Lt = 7.5;
        for (let i = 0; i < N; i++) {
          const u = i / (N - 1), wv = sin(t * 7 - u * 3.2) * u;
          xs[i] = hx + ex * Lt * u - ey * 1.3 * wv; ys[i] = hy + ey * Lt * u + ex * 1.3 * wv;
        }
        g.beginPath(); smooth(g, xs, ys, N, false);
        g.lineWidth = 1.25 + ink * 2; g.strokeStyle = F('#6a1a16'); g.stroke(); g.lineWidth = 1.25; g.strokeStyle = F('#c4342e'); g.stroke();
        if (!sil) { g.beginPath(); g.moveTo(xs[N - 2], ys[N - 2]); g.lineTo(xs[N - 1] + ex * 0.8, ys[N - 1] + ey * 0.8); g.lineWidth = 2.1; g.strokeStyle = '#c4342e'; g.stroke(); }
        return [xs[N - 1], ys[N - 1]];
      }
      case 'violin': {
        // 拿在手里的小提琴（握着琴颈，琴身垂在下面）
        g.save(); g.translate(hx, hy); g.rotate(atan2(dy, dx) - HP + 0.25);
        violinShape(g, D, -1, 0.55 + 0.45 * abs(P.cy), ink);
        g.restore();
        return [hx, hy + 14];
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
      surf(D, 0.62, PI, 3.2, Q2);
      const cx = Q2[0], cy = Q2[1];
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
      surf(D, 0.3, PI, 3, Q2);
      const bx = lerp(D.rx[1], Q2[0], 0.6) + (P.back ? 2 : 0), by = Q2[1] + 3;
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
      const s = sg * 3.2, f = RA[5] - (RA[4] + 0.8);
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
  /**
   * 小提琴（局部坐标：x 从琴身下端 0 → 琴头 dir·33，宽度按 w 压扁）。dir = +1 朝 +x，-1 朝 +y（挂在手里时琴头朝上）
   */
  function violinShape(g, D, dir, w, ink) {
    const sil = D.sil, F = (c) => sil || c;
    g.save();
    if (dir < 0) g.rotate(HP);   // 挂在手里：琴头在手这边（局部 x = 0 → 33 变成向下），这里把琴头放在原点
    if (dir < 0) { g.translate(33, 0); g.scale(-1, 1); }
    g.scale(1, w);
    // 琴身：下半宽、腰细、上半略窄
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(0, -4.6, 5.2, -4.8, 6, -3.1); g.quadraticCurveTo(6.8, -2.1, 7.7, -2.6); g.bezierCurveTo(8.6, -4.2, 13.4, -4.0, 13.6, 0);
    g.bezierCurveTo(13.4, 4.0, 8.6, 4.2, 7.7, 2.6); g.quadraticCurveTo(6.8, 2.1, 6, 3.1); g.bezierCurveTo(5.2, 4.8, 0, 4.6, 0, 0); g.closePath();
    g.fillStyle = sil || linG('violin', 0, -4, 0, 4, [0, '#c8743a', 0.5, '#a8522a', 1, '#7a3416']); g.fill(); g.lineWidth = ink; g.strokeStyle = F('#4a1a08'); g.stroke();
    // 指板、琴颈、琴头
    g.beginPath(); g.moveTo(6.5, 0); g.lineTo(28.5, 0); g.lineCap = 'round'; g.lineWidth = 1.1 + ink * 2; g.strokeStyle = F('#120a06'); g.stroke(); g.lineWidth = 1.1; g.strokeStyle = F('#2a1810'); g.stroke();
    g.beginPath(); g.ellipse(30.3, 0, 2.1, 1.25, 0, 0, TAU); g.fillStyle = F('#7a3a18'); g.fill(); g.lineWidth = ink * 0.8; g.strokeStyle = F('#3a1408'); g.stroke();
    if (!sil && D.lod >= 1) {
      g.beginPath(); g.arc(31.4, 0, 0.8, 0, TAU); g.lineWidth = 0.35; g.strokeStyle = '#3a1408'; g.stroke();
      g.beginPath(); for (const px of [28.6, 29.8]) { g.moveTo(px, -1.3); g.lineTo(px, -2.1); g.moveTo(px, 1.3); g.lineTo(px, 2.1); } g.lineWidth = 0.5; g.strokeStyle = '#1a0e08'; g.stroke();
      // f 孔、琴码、拉弦板、腮托
      g.beginPath(); g.moveTo(4.8, -1.6); g.quadraticCurveTo(4.1, -1.2, 4.6, -0.6); g.moveTo(4.8, 1.6); g.quadraticCurveTo(4.1, 1.2, 4.6, 0.6); g.lineWidth = 0.35; g.strokeStyle = '#2a0c04'; g.stroke();
      g.beginPath(); g.moveTo(4.2, -1.3); g.lineTo(4.2, 1.3); g.lineWidth = 0.4; g.strokeStyle = '#e8d0a0'; g.stroke();
      g.beginPath(); g.moveTo(0.6, -0.8); g.lineTo(2.8, -0.5); g.lineTo(2.8, 0.5); g.lineTo(0.6, 0.8); g.closePath(); g.fillStyle = '#1a1010'; g.fill();
      g.beginPath(); g.ellipse(1.6, -2.4, 1.6, 1.1, 0, 0, TAU); g.fillStyle = '#241816'; g.fill();
      g.beginPath(); for (const q of [-0.5, -0.17, 0.17, 0.5]) { g.moveTo(2.8, q * 0.9); g.lineTo(28.3, q * 0.5); } g.lineWidth = 0.1; g.strokeStyle = '#f4ead0'; g.stroke();
      g.globalAlpha = D.ga * 0.35; g.beginPath(); g.ellipse(10.5, -1.6, 1.8, 0.8, 0, 0, TAU); g.fillStyle = '#ffffff'; g.fill(); g.globalAlpha = D.ga;
    }
    g.restore();
  }
  /** 拉小提琴（pose 'fiddle'）：part 'body' = 琴（架在肩上、在头的下面），'bow' = 弓（在近侧手里，横过琴码） */
  function drawViolinPlay(D, part) {
    const g = D.g, P = D.P, V = P.violin, sil = D.sil, ink = D.ink;
    if (!V) return;
    const b = pj(P, V.b, Q2), bx = b[0], by = b[1];
    const n = pj(P, V.n, Q3), nx = n[0], ny = n[1];
    const L = hypot(nx - bx, ny - by) || 1, ang = atan2(ny - by, nx - bx);
    const k = max(L, 10) / 31;
    if (part === 'body') {
      g.save(); g.translate(bx, by); g.rotate(ang); g.scale(k, k);
      violinShape(g, D, 1, 0.5 + 0.5 * abs(P.cy), ink / k);
      g.restore();
      return;
    }
    // 弓：从近侧手（弓根）穿过琴码（琴身 x ≈ 4.5 处）往外伸
    const h = D.hc[0];
    const brx = bx + cos(ang) * 4.5 * k, bry = by + sin(ang) * 4.5 * k;
    let dx = brx - h[0], dy = bry - h[1];
    const dl = hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const bl = 31 * k;
    g.beginPath(); g.moveTo(h[0] - dx * 1.2, h[1] - dy * 1.2); g.lineTo(h[0] + dx * bl, h[1] + dy * bl);
    g.lineCap = 'round'; g.lineWidth = 0.42 + ink * 1.4; g.strokeStyle = sil || '#2a1a10'; g.stroke();
    if (!sil) { g.lineWidth = 0.4; g.strokeStyle = '#6a3a1a'; g.stroke(); g.beginPath(); g.moveTo(h[0] + dy * 0.5, h[1] - dx * 0.5); g.lineTo(h[0] + dx * bl + dy * 0.35, h[1] + dy * bl - dx * 0.35); g.lineWidth = 0.18; g.strokeStyle = '#f2ead8'; g.stroke(); }
  }

  /* ================================================================
   * 人物：解析服装 → 解算骨架 → 按深度排好的图层顺序画（前视 / 背影两套）
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
      for (const f of ['pony', 'back', 'sides', 'braid', 'ahoge', 'bangs', 'tuft', 'temple']) if (f in O0.hair) hair[f] = O0.hair[f];
      if (O0.hair.headband) { O.headband = O0.hair.headband; O.headbandFrill = O0.hair.headbandFrill || false; O.headbandNotch = O0.hair.headbandNotch || 0; }
      if (O0.hair.headdress) O.headdress = O0.hair.headdress;
      if (O0.hair.bows) O.bows = O0.hair.bows;
    }
    if (hood && O.jacket && O.jacket.hood) O.hoodUp = { c: O.jacket.c };
    // “背心 / 西装”：躯干底色是背心，V 领里露出衬衫
    if (O.vest) { O.shirt = O.top; O.top = O.vest.c; }
    r = { O, hair, hkey: who + ':' + key };
    RES.set(k, r);
    return r;
  }
  const MIRH = new Map();
  /** 朝向超过 π 时整个角色镜像画：不对称的发型（侧马尾、辫子、偏分刘海、小揪揪）跟着换边，转身时才不会跳 */
  function mirrorHair(key, h) {
    let m = MIRH.get(key);
    if (m) return m;
    m = Object.assign({}, h);
    if (h.bangs) m.bangs = h.bangs.map(([p, y, w, c]) => [-p, y, w, -(c || 0)]);
    m.part = -(h.part || 0);
    if (h.sides) m.sides = h.sides.map((s) => (s.one ? Object.assign({}, s, { psi: -s.psi }) : s));
    if (h.pony) m.pony = Object.assign({}, h.pony, { psi: h.pony.low || h.pony.high ? h.pony.psi : -h.pony.psi });
    if (h.braid) m.braid = Object.assign({}, h.braid, { psi: -h.braid.psi });
    if (h.ahoge) m.ahoge = Object.assign({}, h.ahoge, { psi: -h.ahoge.psi });
    if (h.tuft) m.tuft = Object.assign({}, h.tuft, { psi: -h.tuft.psi });
    MIRH.set(key, m);
    return m;
  }
  const PPOOL = newPose();
  const HST = { yaw: 0, cy: 1, sy: 0, pitch: 0, cp: 1, sp: 0, qk: '', front: true };
  const J2 = { sh: [v3(), v3()], el: [v3(), v3()], wr: [v3(), v3()], hj: [v3(), v3()], kn: [v3(), v3()], an: [v3(), v3()] };
  const HC = [[0, 0], [0, 0]], HD = [[0, 1], [0, 1]];
  const pj = (P, p, out) => { out[0] = -p[0] * P.cy + p[2] * P.sy; out[1] = p[1]; out[2] = p[0] * P.sy + p[2] * P.cy; return out; };

  /** 本次绘制的状态：矩阵、墨线宽度、细节等级、光、二次运动参数 */
  function setupHuman(g, who, o, base) {
    const C = CH[who];
    const outKey = C.outfits[o.outfit] ? o.outfit : C.def;
    const R0 = resolveOutfit(who, outKey, !!o.hood);
    const B = bodyOf(C);
    let S = (o.h || 300) / 100, ox = o.x || 0, oy = o.y || 0;
    const crop = o.crop === 'bust' || o.crop === 'face' ? o.crop : null;
    if (crop === 'bust') { const bu = 100 - (B.leg + 0.38 * B.T); S = (o.h || 600) / bu; oy += (B.leg + 0.38 * B.T) * S; }
    else if (crop === 'face') { const hh = (B.capTop + B.chin) * B.R; S = (o.h || 500) / hh; oy += -B.headY * S; }
    if (!C.seed) C.seed = floor(hash(who.length * 7 + who.charCodeAt(0), 3) * 100);
    const P = solve(B, C, o, S, PPOOL);
    let hair = R0.hair, hkey = R0.hkey;
    if (P.mir && hair) { hair = mirrorHair(R0.hkey, hair); hkey += '#m'; }
    const bs = base ? sqrt(abs(base[0] * base[3] - base[1] * base[2])) : 1;
    const pxU = S * bs, hpx = 100 * pxU;
    const lod = o.lod != null ? o.lod : hpx < 95 ? 0 : hpx < 340 ? 1 : 2;
    const O = R0.O;
    const D = {
      g, o, P, B, C, O, hair, hkey, who, crop, S, ox, oy, lod, sil: null, ga: 1,
      F: C.face || FACE.adultM,
      mC: [1, 0, 0, 1, 0, 0], mH: [1, 0, 0, 1, 0, 0], mE: [1, 0, 0, 1, 0, 0], mT: [1, 0, 0, 1, 0, 0],
      rx: new Float64Array(5), ry: new Float64Array(5), rz: new Float64Array(5), reF: new Float64Array(5), reB: new Float64Array(5),
      H: HST, j: J2, hc: HC, hd: HD, pxU, hpx, bs, HG: null,
    };
    // 墨线：外轮廓粗一点（1.25×），衣褶 / 发丝细一点（0.5×）
    const inkPx = clamp(0.5 + hpx * 0.0042, 0.8, 5.4) * (o.inkW || 1);
    D.inkPx = inkPx; D.ink = inkPx / pxU; D.inkB = D.ink * 1.25; D.inkT = D.ink * 0.5;
    D.inkH = inkPx / (pxU * B.R); D.inkO = D.inkH * 1.25; D.inkI = D.inkH * 0.5;
    const co = O.coat || O.jacket;
    D.sleeveK = co ? 1.14 : O.cardigan ? 1.06 : 1;
    D.foreK = co ? 1.06 : 1; D.cuffK = co ? 1.1 : 1;
    D.neckW = B.R * (B.fem ? 0.33 : 0.4);
    D.shoulderUp = 1.5;
    // 光：默认左上；o.light 'left' | 'right' | 'top' | 'none' | 角度；逆光（rimDir）时跟着光源那一侧
    let lx = -0.55, ly = -0.83;
    const Lo = o.light;
    if (Lo === 'right') lx = 0.55;
    else if (Lo === 'top') { lx = 0; ly = -1; }
    else if (typeof Lo === 'number') { lx = cos(Lo); ly = sin(Lo); }
    else if (Lo == null && o.rim && o.rimDir != null) lx = cos(o.rimDir) >= 0 ? 0.55 : -0.55;
    D.shade = Lo === 'none' || lod === 0 ? 0 : o.shade != null ? clamp(o.shade) : 1;
    D.Lc = [lx * P.fx, ly]; D.LcH = D.Lc;
    D.celA = 0.55 * D.shade;
    D.farDim = lod >= 1 ? 0.16 * min(1, abs(P.sy) * 1.6 + (P.back ? 0.4 : 0)) : 0;
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
    D.base = base;
    buildMatrices(D, base || [1, 0, 0, 1, 0, 0]);
    return D;
  }
  function buildMatrices(D, base) {
    const P = D.P, B = D.B, o = D.o, S = D.S;
    tm(D.mC, base, D.ox, D.oy, o.rot || 0, S * P.fx, S);
    if (P.lie) { tm(D.mT, D.mC, B.leg, -(B.DB[3] + 1.5), -HP, 1, 1); D.mC.splice(0, 6, ...D.mT); }
    const J = D.j;
    for (let i = 0; i < 2; i++) {
      const A = P.A[i], L = P.L[i];
      pj(P, A.sh, J.sh[i]); pj(P, A.el, J.el[i]); pj(P, A.wr, J.wr[i]);
      pj(P, L.hj, J.hj[i]); pj(P, L.kn, J.kn[i]); pj(P, L.an, J.an[i]);
      let dx = J.wr[i][0] - J.el[i][0], dy = J.wr[i][1] - J.el[i][1];
      const l = hypot(dx, dy) || 1; dx /= l; dy /= l;
      D.hd[i][0] = dx; D.hd[i][1] = dy;
      D.hc[i][0] = J.wr[i][0] + dx * B.hand * 0.6; D.hc[i][1] = J.wr[i][1] + dy * B.hand * 0.6;
    }
    computeRings(D);
    D.hipX = D.rx[0]; D.hipY = D.ry[0];
    pj(P, P.head3, Q3);
    D.headX = Q3[0]; D.headY = Q3[1]; D.headZ = Q3[2];
    const H = D.H;
    const q = (v) => Math.round(v * 160) / 160;
    H.yaw = q(P.hyaw); H.pitch = q(P.hp);
    H.cy = cos(H.yaw); H.sy = sin(H.yaw); H.cp = cos(H.pitch); H.sp = sin(H.pitch);
    H.qk = H.yaw.toFixed(4) + ',' + H.pitch.toFixed(4);
    H.front = abs(H.yaw) < 1.62;
    tm(D.mH, D.mC, D.headX, D.headY, P.hr, B.R, B.R);
    // 头部空间里的重力方向（头发下垂的方向）
    const m = D.mH, det = m[0] * m[3] - m[1] * m[2];
    const gx = -m[2] / det, gy = m[0] / det;
    const gr = -atan2(gx, gy);
    D.grot = abs(gr) < 0.02 ? 0 : gr;
  }

  /** 画一遍（彩色或剪影）。D.mC / mH 已按偏移设好 */
  function paintHuman(D) {
    const g = D.g, P = D.P, O = D.O, C = D.C, H = D.H, hr = D.hair, o = D.o, B = D.B, J = D.j;
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
        if (p === 'violin' && P.armsM === 'fiddle') continue;
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
    // 手臂的深度：在胸前（要画在躯干前面）/ 举过肩（画在大头后面会被挡）/ 手在脸上
    const inFront = [false, false], raised = [false, false], faceHand = [false, false];
    for (let i = 0; i < 2; i++) {
      const A = P.A[i];
      const fr = (A.wr[2] - P.H[2]) * P.F[2] + (A.wr[1] - P.H[1]) * P.F[1];
      inFront[i] = !P.back && fr > B.DF[3] * 0.5 && abs(A.wr[0] - P.H[0]) < B.W[4] * 1.45;
      raised[i] = !P.back && J.wr[i][1] < J.sh[i][1] - B.R * 0.35;
      if (!P.back) { const hx = D.hc[i][0] - D.headX, hy = D.hc[i][1] - D.headY; faceHand[i] = hx * hx + hy * hy < (B.R * 1.12) * (B.R * 1.12) && A.wr[2] > P.head3[2] - B.R * 0.4; }
    }
    const farFront = inFront[1] && !faceHand[1], farRaised = raised[1] && !faceHand[1];
    const nearLate = !faceHand[0] && (inFront[0] || raised[0] || TWO_HAND[P.armsM] === 1 || P.armsM === 'play' || P.armsM === 'fiddle');
    const noLegs = crop != null;
    const legOrder = J.an[0][2] >= J.an[1][2] ? [1, 0] : [0, 1];
    const pnLow = hr && hr.pony && hr.pony.low ? hr.pony : null;
    const nearSd = H.sy >= 0 ? 1 : -1;
    const hasCape = !!(O.cape || O.capelet || O.shawl);
    const coat = O.coat || O.jacket || (O.cardigan && { c: O.cardigan.c, sh: O.cardigan.knit, lining: dk(O.cardigan.c, 0.12), len: 0.2, open: 0.42, flare: 0.8 });
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (!P.back) {
      // ---------- 前视（正面 / 3/4 / 侧面） ----------
      if (hr) { setT(g, D.mH); drawBackHair(D, H); if (pnLow) drawPony(D, H, pnLow); }
      setT(g, D.mC);
      if (C.wings) drawWings(D);
      if (O.jacket && O.jacket.hood && !O.hoodUp) drawHoodDown(D, O.jacket.c, O.jacket.sh);
      if (O.capeTail && !noLegs) drawCapeTail(D, O.capeTail);
      if (coat && !noLegs) drawCoatSkirt(D, coat, 'back');
      if (O.coat && O.coat.ribbons && !noLegs) drawRibbons(D, O.coat.ribbons);
      for (const p of worn) drawWornProp(D, p);
      setT(g, D.mC);
      if (!farRaised && !faceHand[1]) { handPropDraw(1); setT(g, D.mC); drawArm(D, 1, farFront ? 'upper' : 'all'); }
      setT(g, D.mC);
      if (!noLegs) {
        for (const i of legOrder) drawLeg(D, i);
        drawPelvis(D);
      }
      if (O.skirt && crop !== 'face') drawSkirt(D, O.skirt);
      drawNeck(D);
      drawTorso(D);
      if (coat) { drawCoatTorso(D, coat); if (!noLegs) drawCoatSkirt(D, coat, 'front'); }
      if (O.cords) { for (const sg of [1, -1]) { surf(D, 0.9, sg * 0.62, 0.9, Q2); if (Q2[2] > 0) drawCord(D, Q2[0], Q2[1], D.B.T * 1.3, 0.95, O.cords, sg * 2); } }
      for (const p of worn) drawWornFront(D, p);
      for (const p of hipP) drawWornProp(D, p);
      if (O.goggles) drawGoggles(D);
      if (O.hammerBelt && !hasProp(o, 'hammer')) drawBeltHammer(D);
      setT(g, D.mC);
      // 近侧手臂（垂着的）：画在躯干前面、头发和头的后面
      if (!nearLate && !faceHand[0]) {
        if (hasCape) drawArm(D, 0, 'upper');
        else { handPropDraw(0); setT(g, D.mC); drawArm(D, 0, 'all'); }
      } else if (hasCape) drawArm(D, 0, 'upper');
      setT(g, D.mC);
      if (O.cape) drawCape(D, O.cape, 'cape');
      if (O.capelet) drawCape(D, Object.assign({ len: 0.34 }, O.capelet), 'cape');
      if (O.shawl) drawCape(D, Object.assign({ len: 0.5 }, O.shawl), 'shawl');
      if (hasCape && !nearLate && !faceHand[0]) { handPropDraw(0); setT(g, D.mC); drawArm(D, 0, 'fore'); }
      if (hr && hr.sides) { setT(g, D.mH); drawSideLocks(D, H, -nearSd); }
      setT(g, D.mC);
      if (P.armsM === 'play') drawCelloPlay(D);
      if (P.armsM === 'fiddle') drawViolinPlay(D, 'body');
      if (faceHand[1]) drawArm(D, 1, 'nohand');
      if (faceHand[0]) drawArm(D, 0, hasCape ? 'fore-nohand' : 'nohand');
      if (O.headphones) drawHeadphones(D);
      drawHead(D);
      if (hr) {
        setT(g, D.mH);
        if (hr.sides) drawSideLocks(D, H, nearSd);
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
        if (P.armsM === 'fiddle') { setT(g, D.mC); drawViolinPlay(D, 'bow'); }
        if (nearLate || faceHand[0]) { handPropDraw(0); setT(g, D.mC); drawArm(D, 0, faceHand[0] ? 'hand' : hasCape ? 'fore' : 'all'); }
      }
    } else {
      // ---------- 背影（3/4 背影时近侧手臂在躯干外侧、画在躯干前面） ----------
      const nearOver = P.sy > 0.35;
      if (P.armsM === 'play') { setT(g, D.mC); drawCelloPlay(D); }
      if (P.armsM === 'fiddle') { setT(g, D.mC); drawViolinPlay(D, 'body'); drawViolinPlay(D, 'bow'); }
      twoPropDraw();
      handPropDraw(1);
      if (!nearOver) handPropDraw(0);
      setT(g, D.mC);
      drawArm(D, 1, 'all');
      if (!nearOver) drawArm(D, 0, 'all');
      if (hr && (hr.braid || hr.sides)) { setT(g, D.mH); if (hr.braid) drawBraid(D, H, hr.braid); if (hr.sides) { drawSideLocks(D, H, -1); drawSideLocks(D, H, 1); } setT(g, D.mC); }
      if (!noLegs) { for (const i of legOrder) drawLeg(D, i); drawPelvis(D); }
      if (O.skirt) drawSkirt(D, O.skirt);
      drawNeck(D);
      drawTorso(D);
      if (coat) { drawCoatTorso(D, coat); if (!noLegs) drawCoatSkirt(D, coat, 'full'); }
      if (O.capeTail && !noLegs) drawCapeTail(D, O.capeTail);
      if (O.coat && O.coat.ribbons && !noLegs) drawRibbons(D, O.coat.ribbons);
      if (O.cape) drawCape(D, O.cape, 'cape');
      if (O.capelet) drawCape(D, Object.assign({ len: 0.34 }, O.capelet), 'cape');
      if (O.shawl) drawCape(D, Object.assign({ len: 0.5 }, O.shawl), 'shawl');
      if (O.jacket && O.jacket.hood && !O.hoodUp) drawHoodDown(D, O.jacket.c, O.jacket.sh);
      for (const p of hipP) drawWornProp(D, p);
      if (O.goggles) drawGoggles(D);
      if (C.wings) drawWings(D);
      setT(g, D.mC);
      if (O.headphones) drawHeadphones(D);
      // 背包 / 琴盒先画：长发垂在背包上面
      for (const p of worn) drawWornProp(D, p);
      D.bhLate = !H.front;
      if (hr && H.front) { setT(g, D.mH); drawBackHair(D, H); if (pnLow) drawPony(D, H, pnLow); }
      setT(g, D.mC);
      drawHead(D);
      D.bhLate = false;
      if (nearOver) { setT(g, D.mC); handPropDraw(0); setT(g, D.mC); drawArm(D, 0, 'all'); }
    }
  }

  /* ---- 离屏层（alpha < 1 时整体淡出） ---- */
  const LAYERS = new Map();
  function layerCanvas(w, h) {
    const bw = Math.ceil(w / 128) * 128, bh = Math.ceil(h / 128) * 128, k = bw + 'x' + bh;
    let c = LAYERS.get(k);
    if (c) { LAYERS.delete(k); LAYERS.set(k, c); return c; }
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
      const save = D.base || base;
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
    const m = D.mC, h = D.mH, P = D.P, J = D.j, B = D.B, F = D.F;
    const pt = (mm, x, y) => [mapX(mm, x, y), mapY(mm, x, y)];
    const H = D.H;
    const eye = (sd) => { hsph(H, sd * F.eye.psi, F.eye.y, 1.0, T3); return pt(h, T3[0], T3[1]); };
    hproj(H, 0, F.mouth.y, faceFront(F, F.mouth.y) + 0.02, T3); const mouth = pt(h, T3[0], T3[1]);
    hproj(H, 0, F.chin - 0.02, 0.5, T3); const chin = pt(h, T3[0], T3[1]);
    const nearHand = pt(m, D.hc[0][0], D.hc[0][1]), farHand = pt(m, D.hc[1][0], D.hc[1][1]);
    ringAt(D, 0.7, RA); const chest = pt(m, RA[0], RA[1]);
    ringAt(D, 1.0, RA); const neck = pt(m, RA[0] + D.ax * 1.5, RA[1] + D.ay * 1.5);
    const cap = D.hair ? D.hair.cap : C0CAP(D);
    const out = {
      head: pt(h, 0, 0), face: pt(h, 0.3 * H.sy, 0.3), eyeN: eye(1), eyeF: eye(-1), mouth, top: pt(h, 0, -cap),
      chest, hip: pt(m, D.hipX, D.hipY), handN: nearHand, handF: farHand,
      feet: pt(m, (J.an[0][0] + J.an[1][0]) / 2, 0),
      chin, neck,
      shoulderN: pt(m, J.sh[0][0], J.sh[0][1]), shoulderF: pt(m, J.sh[1][0], J.sh[1][1]),
      elbowN: pt(m, J.el[0][0], J.el[0][1]), elbowF: pt(m, J.el[1][0], J.el[1][1]),
      kneeN: pt(m, J.kn[0][0], J.kn[0][1]), kneeF: pt(m, J.kn[1][0], J.kn[1][1]),
      footN: pt(m, J.an[0][0], 0), footF: pt(m, J.an[1][0], 0),
      headR: B.R * D.S * (o.crop ? 1 : 1),
    };
    const props = propList(o) || [];
    out.prop = null;
    if (props.includes('staff')) {
      const hi = o.propHand === 'far' ? 1 : 0, L = 96 * (P.kid ? 0.75 : 1), ang = -HP + 0.13;
      out.prop = pt(m, D.hc[hi][0] + cos(ang) * (L * 0.6 + 6), D.hc[hi][1] + sin(ang) * (L * 0.6 + 6));
    } else if (props.includes('lantern')) {
      const hi = o.propHand === 'far' ? 1 : 0, sw = 0.12 * sin(P.t * 2.2) + (P.mv ? 0.15 * sin(2 * P.ph) : 0);
      out.prop = pt(m, D.hc[hi][0] + sin(sw) * 5, D.hc[hi][1] + cos(sw) * 5.5);
    } else if (props.includes('violin') && P.armsM === 'fiddle' && P.violin) {
      pj(P, P.violin.b, Q3); out.prop = pt(m, Q3[0], Q3[1]);
    } else if (props.length) {
      const two = TWO_HAND[P.armsM] === 1;
      out.prop = two ? [(nearHand[0] + farHand[0]) / 2, (nearHand[1] + farHand[1]) / 2] : nearHand;
    }
    const xs = [out.head[0], out.feet[0], nearHand[0], farHand[0]], ys = [out.top[1], out.feet[1], nearHand[1], farHand[1]];
    const pad = B.R * 1.2 * D.S;
    out.bounds = [min(...xs) - pad, min(...ys) - pad * 0.3, max(...xs) + pad, max(...ys)];
    return out;
  }
  const C0CAP = (D) => (D.C.hooded ? 1.22 : 1.12);
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
  // 刘海（v2 格式：[发梢方位 ψ, 发梢高度 y, 半宽, 弯向]）
  const CROWD_BANGS = [
    [[-1.0, 0.14, 0.16, -0.15], [-0.62, 0.22, 0.17, -0.1], [-0.24, 0.1, 0.17, 0.05], [0.14, 0.2, 0.17, 0.12], [0.52, 0.1, 0.16, 0.18], [0.9, 0.18, 0.15, 0.2]],
    [[-1.0, 0.28, 0.16, -0.25], [-0.6, 0.3, 0.17, -0.3], [-0.18, 0.26, 0.17, -0.3], [0.26, 0.3, 0.17, -0.3], [0.7, 0.28, 0.16, -0.2], [1.05, 0.3, 0.14, -0.1]],
    [[-1.0, 0.16, 0.16, 0.3], [-0.66, -0.06, 0.18, 0.5], [-0.28, -0.14, 0.18, 0.55], [0.1, -0.1, 0.18, 0.55], [0.48, 0.04, 0.17, 0.45], [0.86, 0.2, 0.15, 0.35]],
    [[-1.0, -0.02, 0.2, 0.05], [-0.5, -0.1, 0.22, 0.05], [0, -0.14, 0.22, 0.05], [0.5, -0.1, 0.22, 0.05], [1.0, -0.02, 0.2, 0.05]],
  ];
  function crowdSpec(seed, color) {
    const key = 'crowd#' + seed + (color ? '#' + color : '');
    if (CH[key]) return key;
    const r = (k) => hash(seed * 31 + 7, k, 5);
    const pick = (arr, k) => arr[floor(r(k) * arr.length) % arr.length];
    const body = pick(['man', 'woman', 'man', 'woman', 'teen', 'teenM', 'elder', 'kid', 'woman', 'man'], 1);
    const old = body === 'elder' || r(2) < 0.12;
    const hp = old ? CROWD_HAIR[pick([5, 6, 6], 3)] : CROWD_HAIR[floor(r(3) * 6)];
    const fem = BODY[body].fem;
    const style = fem ? pick(['long', 'bob', 'pony', 'bob', 'long'], 4) : pick(['short', 'short', 'bob'], 4);
    const len = style === 'long' ? 2.0 + r(5) * 0.5 : style === 'bob' ? 1.22 : style === 'pony' ? 1.0 : 0.92;
    const curly = r(6) < 0.35;
    const hair = {
      pal: Object.assign({ dk: hp.sh }, hp), cap: 1.1, lobes: curly ? 9 : 0, lobeAmp: 0.026, hl: -0.4, part: (r(20) - 0.5) * 0.8, curly: curly ? 1 : 0,
      bangs: CROWD_BANGS[floor(r(7) * CROWD_BANGS.length)],
      temple: style === 'short' ? { y: 0.46, w: 0.12, curl: 0 } : { y: 0.7, w: 0.13, curl: 0.15 },
      sides: style === 'long' && r(9) < 0.6 ? [{ psi: 1.36, y0: 0.2, len: 1.6, w: 0.14, wave: 0.05, curl: curly ? 0.6 : 0.2, out: 0.08 }] : null,
      back: { n: style === 'short' ? 5 : 7, top: -0.28, len, w: 0.21, spread: style === 'short' ? 1.0 : 1.12, wave: 0.03 + r(8) * 0.05, curl: curly ? 0.7 : 0.15, var: 0.12 },
      ahoge: r(10) < 0.25 ? { psi: 0.1, len: 0.35, curl: 1 } : null,
      pony: style === 'pony' ? { psi: 3.14, y: 0.3, len: 1.9, w: 0.36, low: true, curl: 0.3 } : null, braid: null,
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
    if (body === 'kid') { O.pants = null; O.skirt = fem ? { c: c1, len: 0.4, flare: 3, hem: 'plain', trim: c1 } : null; if (!fem) O.pants = { c: c3, w: [5.4, 4.6] }; O.legs = { c: ['#f6e6dc', '#f6e6dc', '#fbfaf6'], sock: 0.3 }; O.coat = null; O.sleeve = [c1, c1]; }
    if (O.pants) O.pants.w = [O.pants.w[0] + 1.2, O.pants.w[1] + 0.6];
    if (r(23) < 0.18 && !old) O.hat = null;
    if (r(24) < 0.25) O.bag = { c: pick(['#6a4a36', '#3a3440', '#8a6a4a'], 25), dev: '#c8b89a' };
    const face = old ? FACE.old : body === 'kid' ? FACE.kidF : fem ? FACE.adultF : FACE.adultM;
    const spec = {
      body, face, skin: r(26) < 0.2 ? SKIN_K : SKIN, eye: old ? EYES.keller : pick([EYES.crowd, EYES.katia, EYES.fontaine, EYES.liese, EYES.crowd, EYES.magna], 27),
      horn: sp === 'sheep' ? { style: 'spiral', pal: pick([HORNS.adele, HORNS.katia, HORNS.magna], 28), r: 0.42, turn: 1.2, out: 0.5, w: 0.25, psi: 1.1, y: -0.58 } : null,
      ear: sp === 'sheep' ? 'sheep' : sp === 'rabbit' ? 'rabbit' : sp === 'feather' ? 'none' : sp === 'fox' || sp === 'cat' || sp === 'wolf' || sp === 'bear' ? 'animal' : 'human',
      ears: sp === 'sheep' ? pick([EARS.adele, EARS.magna, EARS.katia], 31) : null,
      animal: sp, sheepEar: 0.9, plume: sp === 'feather' ? { c: dk(hp.c, 0.3), tip: hp.lt } : null,
      halo: sp === 'halo' ? { c: '#ffe38a', gem: '#fff6d0', glow: '255,226,140' } : null,
      glasses: r(29) < (old ? 0.6 : 0.18) ? { shape: r(30) < 0.5 ? 'round' : 'hex', c: '#3a2a2a', thin: 1 } : null,
      hair, def: 'default', outfits: { default: O }, seed: seed % 97,
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
  const api = { meta: META, placeholder: false, version: 2, lastMs: 0 };
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
      if (warned < 8) { warned++; console.warn('[MV cast]', who, o && o.pose, e); }
    }
    g.restore();
    api.lastMs = performance.now() - t0;
  }
  function anchors(who, o) {
    o = o || {};
    try {
      if (CH[who]) return anchorsHuman(who, o);
    } catch (e) { if (warned < 8) { warned++; console.warn('[MV cast] anchors', who, e); } }
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
    // 与 LEGS.walk / run 的“踩实”步态一致：支撑期里脚相对髋匀速后移 2s，历时 beta 个周期
    const B = bodyOf(C), G = run ? GAIT.run : GAIT.walk, Lg = B.thigh + B.shin, cyc = G.cyc * sp;
    const yaw = o.yaw != null ? o.yaw : VIEW[o.view] != null ? VIEW[o.view] : VIEW[(PRESET[o.pose] || {}).view] != null ? VIEW[PRESET[o.pose].view] : VIEW.three;
    const S = (o.h || 300) / 100, stride = 2 * G.s * Lg / G.beta;
    return { speed: stride * cyc * S * abs(sin(yaw)), period: 1 / cyc, stride: stride * S * abs(sin(yaw)) };
  }
  Object.assign(api, {
    draw, anchors, gait,
    poses: Object.keys(PRESET),
    exprs: Object.keys(EXPR),
    props: ['satchel', 'staff', 'cassette', 'popsicle', 'letter', 'stone', 'wreath', 'wreaths', 'book', 'notebook', 'lantern', 'backpack', 'flower', 'trowel', 'soda', 'cello', 'recorder', 'hammer', 'suitcase', 'umbrella', 'basket', 'tie', 'lamb', 'lamb-pink', 'mug', 'box', 'bag', 'camera', 'map', 'violin'],
    outfits: Object.fromEntries(Object.entries(CH).map(([k, c]) => [k, Object.keys(c.outfits)])),
    views: Object.keys(VIEW),
    _internal: { CH, BODY, PRESET, bodyOf },
  });
  E.cast = api;
})();
