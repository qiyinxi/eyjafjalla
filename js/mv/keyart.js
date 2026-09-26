/* =========================================================
 * MV · 官方立绘关键画面（key-art）渲染器   →  window.MVE.keyart
 *
 * 把首屏用的「原画分层绑定」（assets/puppet/<key>/{rig.json, atlas.webp}，由 tools/puppet/build.py 生成）
 * 画进 MV 的 Canvas 2D 画面里：像官方「Miss You」MV、纯烬艾雅法拉 PV 那样让官方立绘本身动起来——
 * 缓慢推镜、2.5D 视差、呼吸眨眼、发梢与飘带随风、转头的惯性、补光与轮廓光、调色。
 * 给影片在情绪最高的几个镜头里用。js/puppet.js（首屏）一行都没改：这里是 MV 专用的独立实现（着色器同源）。
 *
 * 可用的绑定（key）与构图预设（crops(key) 给出 [x, y, w, h]，原画像素；除 full 外都是 16:9）
 *   'alter-e0'  纯烬艾雅法拉 · 精英零（全身站姿，白花法杖）   2048²  full upper bust face eyes hands staff
 *   'base-e0'   艾雅法拉 · 精英零（全身站姿，黑色枝杈法杖）   1024²  full upper bust face eyes hands staff   ← 原图小：face 以上的特写会软
 *   'base-e2'   艾雅法拉 · 精英二（动态构图，羊群与熔岩）     2048²  full upper bust face eyes sheep lava    ← 脸在图里偏小：face 会软
 *   'base-s1'   时装 夏卉 FA018（粉色黄昏的海边，自带画框）   2048²  full scene upper bust face eyes sheep
 *   'base-s2'   时装 绵绒小魔女（夜色钟面，自带画框）          2376²  full scene upper bust face eyes wand plush
 *   锚点（anchors）：都有 head face eyeL eyeR eyes mouth chest；另有 hand(s) staffTip feet crystal bell lava sheep plush clock（按图）
 *
 * ---------------------------------------------------------------- 在影片里用（最常见的写法）
 *   E.film({
 *     id: 'miss-you', needs: ['keyart'],                // ← 引擎在影片脚本注册后自动加载 js/mv/keyart.js（失败也放行）
 *     prepare: (ctx) => ctx.keyart(['alter-e0']),       // ← 预载（下载 + 上传显卡 + 预模糊）；只会 resolve(true/false)，最多等 8 秒
 *     release() { window.MVE.keyart && MVE.keyart.release(); },   // ← 换片 / 离开时释放显存（推迟 1.5 秒；之后用到会自动重新加载）
 *     shots: [{ id: 'peak', t0: 120, draw(g, s) {
 *       const K = window.MVE.keyart;                    // ← 在 draw 里取（影片脚本执行时它还没加载）
 *       if (K) K.shot(g, s, { key: 'alter-e0', crop: 'bust', to: { crop: 'face' }, grade: 'warm',
 *                             particles: 'petals', look: [0.2, 0], fallback: drawMyFallback });   // 立绘没好时 shot 会调 fallback
 *       else { drawMyBackground(g, s); drawMyFallback(g, s); }   // keyart.js 本身没加载成功：画布不会自动清空，自己铺满
 *     } }],
 *     captions: [[200, 206, '角色立绘 © Hypergryph（官方原画，本页分层绑定）', { style: 'side' }]],
 *   });
 *   用了立绘的影片，片尾必须注明版权：MVE.keyart.credit ===「角色立绘 © Hypergryph（官方原画，本页分层绑定）」
 *   （字幕表在影片注册时就定下来了，那时 keyart.js 还没加载，所以字幕里直接写这串字）。
 *   完整示例：js/mv/films/_keyart-demo.js（lab/mv.html?film=_keyart-demo&strip=auto）。
 *
 * ---------------------------------------------------------------- 一、成片镜头：shot(g, s, o) → boolean
 *   一次画完一个完整、精修过的立绘镜头：背景（渐变 + 立绘自身的模糊放大版，视差）→ 背后的散景 → 立绘（WebGL）
 *   → 高光溢出 → 前景粒子与散景 → 漏光、调色、暗角、颗粒。全部是 Canvas 2D 贴图与混合（没有 filter / shadowBlur；
 *   模糊只在加载时算一次）。t 的纯函数。
 *   返回 true = 立绘已画出；false = 立绘不可用（没加载完 / 设备没有 WebGL）——此时背景与氛围照样画了，并调用了 o.fallback。
 *   o = {
 *     key: 'alter-e0',
 *     crop: 'bust',                 基础构图：预设名或 [x, y, w, h]。fit: 'cover'（铺满画面，默认）| 'contain'（'full' 默认 contain）
 *     from: { crop, z, x, y, r, look, gaze, tilt, nod, lean, blush, mouth, smile, glow, cast, wind, breath, sway },  镜头起点
 *     to:   { ... },                镜头终点。z 推拉倍数；x / y 平移（画面宽 / 高的比例）；r 滚转（弧度）；crop 换构图（bust → face 就是推近）
 *                                   其余字段按同一进度插值；look / gaze / tilt / nod / lean / cast 插值成时间函数，头发带惯性
 *     ease: 'inOut',                缓动（MVE.ease 的名字或函数）；span: [a, b] 只在镜头内 a..b 秒运动（默认整个镜头）
 *     look, gaze, tilt, nod, lean, eyes, blink, smile, mouth, blush, glow, cast, wind, windDir, breath, sway, seed,
 *     sweep, alpha, flip, sharpen, saccade …   直接传给 draw()（见下）
 *     grade: 'warm' | 'cool' | 'dream' | 'ember' | 'night' | 'memory' | 'none'
 *            | { base: 'warm', tint, sat, contrast, light, overlay, leak, vig, grain, bg, bokeh, bloom }   （见 grades）
 *     tint, sat, contrast, light    覆盖调色预设里对应的值
 *     bg: 'blur'（默认）| 'gradient' | [[0,'#123'],[1,'#456']] | false（影片自己先画了背景）| (g, s, cam) => {}
 *         plateScale: 1.3, plateAlpha: 0.7（模糊背景板的放大倍数与不透明度）
 *     bloom: 按调色 0.35–0.6        高光溢出（加载时从亮部取出、模糊好的同一构图，滤色叠上；只从亮处溢出，不蒙雾）；0 关闭
 *     particles: 'petals' | 'embers' | 'ash' | 'snow' | 'sparkle' | 'dust' | 'fireflies' | 'bubbles' | 'bokeh'
 *                | { type, n, rgb, depth, ... } | [多个]            前景粒子（引擎预设，确定性）
 *     dof: 0.5,                     景深：画面前后的散景光斑数量（0..1）
 *     leak: true | { x, y, r, rgb, a }，rays: true | { x, y, ... }（丁达尔光），vignette, grain, letterbox: 0..1
 *     pulse: 0.5,                   随拍点的微动（推近一点点、柔光与光斑一亮）；handheld: 3（手持漂移像素）
 *     fade: [入, 出]（秒，镜头首尾淡入淡出黑）
 *     under(g, s, cam), over(g, s, A)   自定义：立绘之下 / 之上（over 与立绘同一坐标系，A = anchors(key, …)，例如在眼睛上放闪光）
 *     fallback(g, s)                立绘不可用时画的替代内容
 *   }
 *   s.reduced（减少动态效果）时：不手持、不随拍点推近、不画散景、粒子减半。
 *
 * ---------------------------------------------------------------- 二、只画立绘：draw(g, key, o) → boolean
 *   画进 MV 的 2D 画布 g（当前变换 = 设计坐标 1920×1080 × 相机，能与 s.layer 组合；旋转、镜像也行）。
 *   内部：共享的一张离屏 WebGL 画布，只渲染屏幕上看得见的那一块、按它在屏幕上的实际像素渲染（轴对齐时像素一一对应），
 *   再 g.drawImage 贴回。返回 false = 什么也没画（没加载完 / 没有 WebGL / 出错），影片自己画替代；第一次 draw 会自动开始加载。
 *   构图
 *     crop: 'full'（默认）| 预设名 | [x, y, w, h]（原画像素）    只画这一块
 *     x, y: 960, 540                这块的锚点落在哪里（当前坐标系）；ax, ay: 0.5 锚点在块内的比例位置（0 左 / 上，1 右 / 下）
 *     h: 1080                       这块在当前坐标系里的高度（或 w 宽度，或 scale = 每原画像素多少单位）
 *     fit: 'cover' | 'contain', box: [x, y, w, h]   直接把这块铺进 box（默认整个画面）
 *     flip: true                    水平镜像（注意 base-s2 钟面上的罗马数字也会反过来）
 *   动作（全部是 t 与参数的纯函数：任意跳转，同一时刻永远同一帧）
 *     t                             秒（一般传 s.t）；驱动呼吸、眨眼、风、发光……
 *     look: [dx, dy] | (t) => [dx, dy]    转头（-1..1；dx > 0 转向画面右边，dy > 0 低头）。传函数时，头发、飘带按各自绑定的
 *                                   弹簧参数滞后（解析卷积：取样 t 之前 3 秒内的 look），转头停下后会轻轻晃一下。path() 可生成这种函数
 *     gaze: [gx, gy]                眼珠（默认跟着 look）；saccade: 0.5 眼神的细微扫动（0 关闭）
 *     tilt: -1..1 歪头 · nod: 0..1 低头 · lean: -1..1 整体倾斜 · cast: 0..1 施法（抬杖、杖头发光） —— 都可以是 (t) => 数
 *                                   幅度都已限制在各绑定验证过的安全范围里（再大图层之间会露缝）
 *     eyes: 'open' | 'closed' | 'smile' | 'winkL' | 'winkR' | 0..1（闭合程度，做睁眼 / 闭眼动画用）
 *     blink: 'auto'（默认：由 t 与 seed 决定的眨眼时刻表，偶尔连眨 / 慢眨）| 0..1 | 0（不眨）
 *     smile: 0..1（开心眯眼）· mouth: 0..1（张嘴）· blush: 0..1（脸红）
 *     wind: 0.25（风力 0..1；0 = 无风只剩极轻的飘动，1 = 大风：发梢、飘带、衣摆被吹向一侧并快速抖动，阵风起伏；最大 1.6）
 *     windDir: 1（1 吹向右，-1 吹向左；或 [dx, dy]）
 *     breath: 1 · sway: 1（待机摆动幅度倍数）· glow: 1（熔岩 / 晶叶 / 星星发光倍数）· seed（眨眼、阵风、眼神的随机种子）
 *     alpha: 1 · mode: 'source-over'（贴回 2D 画布时的混合模式）
 *   光与调色（在 WebGL 里一遍做完；都不需要时省掉这一遍）
 *     tint: '#ffe8d8' | ['#ffe8d8', 0.4] | { color, amount }   正片叠底调色
 *     sat: 1 饱和度 · contrast: 1 对比度
 *     light: { color: '#ffd8a8', dir: [0.7, -0.7], rim: 0.6, wash: 0.1, width: 3, amount: 1 }
 *                                   dir 指向光源（屏幕方向，y 向下；或角度）；rim = 轮廓光（逆光勾边，沿轮廓朝光的一侧）；
 *                                   wash = 朝光一侧提亮（以增益为主，线稿不发灰）；width = 轮廓光宽度（720p 下的像素）；amount 总强度
 *     sweep: 0..1 | { at, color, width: 0.045, strength: 0.55, angle: -0.4 }   扫光：一道斜光掠过（at 为进度，0 / 1 时不画）
 *     sharpen: 1                    放大显示时的自动锐化倍数（0 关闭）
 *
 * ---------------------------------------------------------------- 三、其它
 *   load(key | [keys], timeoutMs = 8000) → Promise<boolean>   预载；只 resolve，不 reject。超时 resolve(false)，加载仍在后台继续
 *   ready(key) → boolean；supported() → boolean（有没有可用的 WebGL）
 *   anchors(key, o) → { face, eyeL, eyeR, eyes, mouth, head, chest, hand, hands, staffTip, …, k } | null
 *                                   与 draw(g, key, o) 同样构图、同一时刻（含转头、呼吸）各部位在当前坐标系里的位置；k = 每原画像素多少单位。
 *                                   没加载时也能用（按静止姿势）
 *   crops(key) → { full: [x,y,w,h], bust, face, … }；info(key) → { w, h, label, crops, anchors, ready, palette }
 *   palette(key) → { avg, light, dark, accent }（'r,g,b'，加载后可用）——背景、粒子取色用
 *   path([[t, [x, y]], …], ease) → (t) => [x, y]   关键帧路径（给 look / gaze 用，绝对时间）
 *   grades → 调色预设表（可改、可加）；credit → 片尾署名字符串；keys → 五个 key
 *   release(key?, immediate?) → 释放显存（纹理、网格、缓存）；不传 key 全部。默认推迟 1.5 秒，期间又 draw / load 就取消
 *                                   （换片时新片用同一张图不必重新上传）；immediate = true 立即释放。之后再 draw 会自动重新加载
 *   stats → { draws, lastMs, avgMs, canvas, gpuMB, keys, load: { key: { upload, maxTask } } }
 *   opts → { maxDim: 2048（离屏画布上限）, texScale: 0（0 = 自动：内存 ≤ 2GB 的设备图集减半）, idleSec: 300,
 *            software: false（允许软件 WebGL，只给实验页用）, repair: true, debug: false }
 *   调试开关（页面地址）：?keyart=off 当作不支持（检查替代画面）；?keyart=webgl1 强制走 WebGL1
 *
 * 实现要点
 *   - 与 js/puppet.js 同一套网格变形（骨骼、转头视差 + 头部球面、发束弯曲、眨眼压扁、虹膜跟随与裁剪、状态图层、发光）；
 *     puppet.js 里的弹簧（有状态）全部换成 t 的解析函数，所以任意跳转都一致。
 *   - 每个图层 10 个 vec4 的参数，一次 uniform4fv + 一次 drawElements；所有图层共用一个顶点 / 索引缓冲。
 *     被裁掉的、透明的（表情层）图层直接跳过。所有 key 共用一个 WebGL 上下文；图集每个 key 只上传一次（WebGL2 带 mipmap）。
 *   - 加载时在显卡上修补图集：硬边切层留下的单像素空洞（放大特写时会变成额头上的一串灰点）用邻居补上。
 *   - 显存：各图 13–100MB（alter-e0 60、base-e0 13、base-e2 95、base-s1 44、base-s2 62）；超过预算（桌面 420MB、触屏 220MB）
 *     时释放最久没画的；5 分钟没有 draw 全部释放。上下文丢失后自动重建、重新加载。
 *   - 实测（1280×720，桌面 GPU）：draw() 平均 0.11–0.13ms（含 drawImage），整个 shot() 平均约 0.3ms；
 *     手机模拟（CPU 降速 4 倍，960×540）：draw() 0.6ms，shot() 约 2ms；帧间隔 p95 4.3ms。
 *   - 设备不支持（或只有软件渲染的 WebGL）时 draw 返回 false，什么也不画、不报错；页面上永远不显示错误。
 * 实验页：lab/keyart.html（?key=alter-e0&crop=face&t=3 单帧、?sheet=all 联系表、?sheet=wind 风、?times=… 运动、?perf=1 性能）
 * ========================================================= */
(() => {
  'use strict';
  const E = window.MVE;
  if (!E || E.keyart) return;
  const VW = E.VW || 1920, VH = E.VH || 1080;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const sm = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = E.hash, wobble = E.wobble;
  const EMPTY = Object.freeze({});
  const CREDIT = '角色立绘 © Hypergryph（官方原画，本页分层绑定）';
  const now = () => performance.now();

  /* 资源路径：相对本脚本解析（首页 index.html 与实验页 lab/*.html 都对） */
  const BASE = (() => {
    try { const s = document.currentScript && document.currentScript.src; if (s) return new URL('../../assets/puppet/', s).href; } catch (e) { /* 退回相对路径 */ }
    return 'assets/puppet/';
  })();
  const opts = { software: false, maxDim: 2048, texScale: 0, idleSec: 300, windK: 1 };

  /* ---------------------------------------------------------------- 各张立绘的构图预设与锚点（原画像素）
   * crops: [x, y, w, h]；anchors: [骨骼, x, y, 视差深度]（深度用于转头时跟着脸走） */
  const INFO = {
    'alter-e0': {
      w: 2048, h: 2048, label: '纯烬艾雅法拉 · 精英零',
      crops: { full: [0, 0, 2048, 2048], upper: [104, 70, 1840, 1035], bust: [212, 110, 1600, 900], face: [639, 196, 747, 420], eyes: [834, 290, 356, 200], hands: [795, 900, 500, 281], staff: [950, 150, 800, 450] },
      anchors: { head: ['head', 1015, 250, 0.3], face: ['head', 1012, 405, 0.25], eyeL: ['head', 967, 381, 0.35], eyeR: ['head', 1057, 381, 0.35], mouth: ['head', 1015, 440, 0.25], chest: ['chest', 1010, 640, 0], hands: ['chest', 1045, 1045, 0], staffTip: ['staff', 1327, 270, 0], crystal: ['staff', 1340, 450, 0], bell: ['bell', 1272, 740, 0], feet: ['body', 1000, 1960, 0] },
    },
    'base-e0': {
      w: 1024, h: 1024, label: '艾雅法拉 · 精英零',
      crops: { full: [0, 0, 1024, 1024], upper: [52, 16, 920, 518], bust: [105, 25, 800, 450], face: [292, 58, 427, 240], eyes: [416, 115, 178, 100], hands: [474, 452, 320, 180], staff: [560, 180, 400, 225] },
      anchors: { head: ['head', 505, 75, 0.2], face: ['head', 505, 172, 0.16], eyeL: ['head', 481, 166.5, 0.2], eyeR: ['head', 530, 162.5, 0.2], mouth: ['head', 507, 197, 0.16], chest: ['chest', 505, 330, 0], hand: ['body', 634, 542, 0], staffTip: ['staff', 781, 297, 0], feet: ['body', 515, 985, 0] },
    },
    'base-e2': {
      w: 2048, h: 2048, label: '艾雅法拉 · 精英二',
      crops: { full: [0, 0, 2048, 2048], upper: [120, 60, 1810, 1018], bust: [450, 170, 1440, 810], face: [799, 253, 711, 400], eyes: [1004, 353, 300, 169], sheep: [100, 150, 1000, 562], lava: [150, 1050, 1000, 562] },
      anchors: { head: ['head', 1140, 330, 0.2], face: ['head', 1154, 452, 0.35], eyeL: ['head', 1123.5, 446, 0.42], eyeR: ['head', 1185, 427, 0.42], mouth: ['head', 1178, 472, 0.36], chest: ['chest', 1250, 700, 0], hand: ['chest', 975, 870, 0], staffTip: ['staff', 770, 1330, 0], lava: ['chest', 700, 1330, 0] },
    },
    'base-s1': {
      w: 2048, h: 2048, label: '夏卉 FA018',
      crops: { full: [0, 0, 2048, 2048], scene: [180, 440, 1690, 950], upper: [330, 360, 1390, 782], bust: [400, 390, 1200, 675], face: [660, 403, 676, 380], eyes: [848, 495, 300, 169], sheep: [1150, 1080, 600, 338] },
      anchors: { head: ['head', 1000, 470, 0.22], face: ['head', 998, 592, 0.26], eyeL: ['head', 968.5, 571, 0.3], eyeR: ['head', 1028, 569.5, 0.3], mouth: ['head', 1000, 607, 0.26], chest: ['chest', 1005, 780, 0], hand: ['staff', 893, 940, 0], staffTip: ['staff', 598, 1166, 0], sheep: ['sheep', 1445, 1265, 0], feet: ['body', 1074, 1585, 0] },
    },
    'base-s2': {
      w: 2376, h: 2376, label: '绵绒小魔女',
      crops: { full: [0, 0, 2376, 2376], scene: [220, 560, 1940, 1091], upper: [520, 600, 1330, 748], bust: [560, 640, 1240, 698], face: [830, 724, 676, 380], eyes: [1018, 820, 300, 169], wand: [1350, 950, 700, 394], plush: [600, 1000, 560, 315] },
      anchors: { head: ['head', 1150, 760, 0.26], face: ['head', 1165, 905, 0.3], eyeL: ['head', 1142, 884.5, 0.42], eyeR: ['head', 1194, 897, 0.42], mouth: ['head', 1163, 922, 0.3], chest: ['chest', 1215, 1050, 0], hand: ['parasol', 1266, 976, 0], staffTip: ['keyWand', 1822, 1166, 0], plush: ['plush', 878, 1150, 0.05], clock: ['sheepClock', 1705, 1090, 0] },
    },
  };
  /** 没有预设的新绑定：按 params.sphere / headHit 推出脸、半身的构图 */
  function autoInfo(key, rig) {
    const P = rig.params || {}, w = rig.w, h = rig.h;
    const hc = P.sphere ? [P.sphere[0], P.sphere[1], P.sphere[3] || P.sphere[2]] : P.headHit || [w / 2, h * 0.2, w * 0.08];
    const fh = hc[2] * 2.6, bh = hc[2] * 6;
    const box = (cx, cy, hh) => [cx - (hh * 16) / 18, cy - hh / 2, (hh * 16) / 9, hh];
    return {
      w, h, label: key,
      crops: { full: [0, 0, w, h], bust: box(hc[0], hc[1] + bh * 0.3, bh), face: box(hc[0], hc[1] + fh * 0.05, fh) },
      anchors: { face: [P.headBone || 'head', hc[0], hc[1], 0.25], head: [P.headBone || 'head', hc[0], hc[1] - hc[2] * 0.6, 0.25] },
    };
  }
  const infoOf = (key) => INFO[key] || (rigs.get(key) && rigs.get(key).info) || null;
  function cropRect(info, c) {
    if (Array.isArray(c) && c.length >= 4) return c;
    if (!info) return null;
    return (typeof c === 'string' && info.crops[c]) || info.crops.full;
  }

  /* ---------------------------------------------------------------- 小工具 */
  const val = (v, t, d) => (typeof v === 'function' ? v(t) : v == null ? d : v);
  const LK = [0, 0];
  /** look / gaze：[x, y] | 数（只转左右）| (t) => [x, y] → 写进 out */
  function val2(v, t, out) {
    if (typeof v === 'function') v = v(t);
    if (typeof v === 'number') { out[0] = v; out[1] = 0; return out; }
    if (v && v.length >= 2) { out[0] = +v[0] || 0; out[1] = +v[1] || 0; return out; }
    out[0] = 0; out[1] = 0; return out;
  }
  const strSeed = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };
  const COLC = new Map();
  /** 颜色 → [r, g, b]（0..1）：'#rgb' | '#rrggbb' | 'r,g,b' | [r, g, b]（0..255） */
  function rgb01(c) {
    if (Array.isArray(c)) return [clamp(c[0] / 255), clamp(c[1] / 255), clamp(c[2] / 255)];
    const k = String(c == null ? '#ffffff' : c);
    let v = COLC.get(k);
    if (v) return v;
    if (k[0] === '#') {
      let h = k.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      v = [0, 2, 4].map((i) => (parseInt(h.slice(i, i + 2), 16) || 0) / 255);
    } else v = k.split(',').map((x) => clamp((parseFloat(x) || 0) / 255));
    if (v.length < 3) v = [1, 1, 1];
    if (COLC.size > 200) COLC.clear();
    COLC.set(k, v);
    return v;
  }
  const easeOf = (e) => (typeof e === 'function' ? e : E.ease[e] || E.ease.inOut);

  /* ---------------------------------------------------------------- 着色器（GLSL ES 1.00：WebGL2 / WebGL1 通用）
   * 每个图层的参数打包成 10 个 vec4（uL），每层一次 uniform4fv + 一次 drawElements：
   *   0: 骨骼矩阵 (a, b, c, d)          1: (e, f, 转头视差 shiftX, shiftY)
   *   2: 头部球面 (cx, cy, rx, ry)       3: 摆动根部 (x, y) + 根部→末端 (dx, dy)
   *   4: (波幅, 相位, 波沿发束的相位差, 幂)   5: (整体弯曲 = 惯性 + 风, 抬起, 阵风抖动幅度, 抖动相位)
   *   6: (眨眼压扁量, 压扁枢轴 y, 张嘴, 嘴枢轴 y)   7: (嘴最小, 虹膜 x, 虹膜 y, 不透明度)
   *   8: 虹膜裁剪椭圆 (cx, cy, rx, ry)   9: 发光 rgb（已乘强度） */
  const VS = `
precision highp float;
attribute vec2 aPos;
attribute vec2 aUv;
uniform vec4 uView;
uniform vec4 uL[10];
varying vec2 vUv;
varying vec2 vQ;
varying vec4 vG;
void main(){
  vUv = aUv;
  vec4 L6 = uL[6];
  vec4 L7 = uL[7];
  vec4 C = uL[8];
  vec2 p = aPos + L7.yz;
  vQ = C.z > 0.0 ? (p - C.xy) / C.zw : vec2(0.0);
  p.y = L6.w + (p.y - L6.w) * mix(L7.x, 1.0, L6.z);
  p.y = L6.y + (p.y - L6.y) * (1.0 - L6.x);
  vec4 S = uL[3];
  float len2 = dot(S.zw, S.zw);
  if (len2 > 0.0) {
    vec4 W = uL[4];
    vec4 X = uL[5];
    float k = clamp(dot(p - S.xy, S.zw) / len2, 0.0, 1.0);
    float w = pow(k, W.w);
    vec2 dir = S.zw * inversesqrt(len2);
    vec2 perp = vec2(-dir.y, dir.x);
    float ph = W.y - W.z * k;
    float b = ((sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.25) * W.x + sin(X.w - W.z * 1.6 * k) * X.z + X.x) * w;
    p += perp * b + dir * (abs(b) * 0.12 - X.y * w);
  }
  vec2 sh = uL[1].zw;
  vec4 sp = uL[2];
  if (sp.z > 0.0) {
    vec2 q = (p - sp.xy) / sp.zw;
    sh *= 0.3 + 0.7 * sqrt(max(0.0, 1.0 - q.x * q.x)) * sqrt(max(0.0, 1.0 - q.y * q.y));
  }
  p += sh;
  vec4 m = uL[0];
  p = vec2(m.x * p.x + m.z * p.y, m.y * p.x + m.w * p.y) + uL[1].xy;
  gl_Position = vec4(p * uView.xy + uView.zw, 0.0, 1.0);
  vG = vec4(uL[9].rgb, L7.w);
}`;
  const PREC = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
  const FS = PREC + `
uniform sampler2D uTex;
varying vec2 vUv;
varying vec2 vQ;
varying vec4 vG;
void main(){
  vec4 c = texture2D(uTex, vUv);
  c.rgb += vG.rgb * c.a;
  gl_FragColor = c * (vG.a * (1.0 - smoothstep(0.86, 1.0, dot(vQ, vQ))));
}`;
  /* 后期（可选，一次全屏四边形）：锐化、饱和度、正片叠底调色、朝光一侧的滤色、轮廓光（沿光的方向取样合成后的 alpha） */
  const PVS = `
precision highp float;
attribute vec2 aQ;
uniform vec4 uRect;
varying vec2 vUv;
varying vec2 vS;
void main(){
  vUv = mix(uRect.xy, uRect.zw, aQ);
  vS = vec2(aQ.x, 1.0 - aQ.y);
  gl_Position = vec4(aQ * 2.0 - 1.0, 0.0, 1.0);
}`;
  const PFS = PREC + `
uniform sampler2D uTex;
uniform vec4 uRect;
uniform vec4 uPx;
uniform vec4 uTint;
uniform vec4 uWash;
uniform vec4 uRim;
uniform vec4 uDir;
uniform vec4 uSweep;
uniform vec3 uSweepC;
varying vec2 vUv;
varying vec2 vS;
vec4 tap(vec2 uv){ return texture2D(uTex, clamp(uv, uRect.xy + uPx.xy * 0.5, uRect.zw - uPx.xy * 0.5)); }
void main(){
  vec4 c = texture2D(uTex, vUv);
  if (uPx.z > 0.0) {
    vec4 n = tap(vUv + vec2(uPx.x, 0.0)) + tap(vUv - vec2(uPx.x, 0.0)) + tap(vUv + vec2(0.0, uPx.y)) + tap(vUv - vec2(0.0, uPx.y));
    c += (c - n * 0.25) * uPx.z;
    c.a = clamp(c.a, 0.0, 1.0);
    c.rgb = clamp(c.rgb, vec3(0.0), vec3(c.a));
  }
  if (c.a < 0.002) { gl_FragColor = vec4(0.0); return; }
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  c.rgb = mix(vec3(l), c.rgb, uPx.w);
  c.rgb = clamp((c.rgb - 0.5 * c.a) * uWash.a + 0.5 * c.a, vec3(0.0), vec3(c.a));
  c.rgb = mix(c.rgb, c.rgb * uTint.rgb, uTint.a);
  float side = smoothstep(-0.55, 0.75, dot(vS - 0.5, uDir.zw) * 2.0);
  // 朝光一侧：以增益为主（线稿、暗部保持深度），少量滤色
  c.rgb = min(c.rgb * (vec3(1.0) + uWash.rgb * side * 1.6) + uWash.rgb * side * 0.25 * max(vec3(0.0), vec3(c.a) - c.rgb), vec3(c.a));
  if (uRim.a > 0.0) {
    vec2 o = uDir.xy * uRim.a * uPx.xy;
    float a = tap(vUv + o * 0.45).a + tap(vUv + o).a + tap(vUv + o * 1.8).a;
    float rim = c.a * clamp(1.0 - a * 0.3333, 0.0, 1.0) * (0.35 + 0.65 * side);
    c.rgb = min(c.rgb + uRim.rgb * rim, vec3(c.a));
  }
  // 扫光：一道斜着掠过人物的亮带（uSweep = 位置, 半宽, 强度, 角度）
  if (uSweep.z > 0.0) {
    float u = dot(vS - 0.5, vec2(cos(uSweep.w), sin(uSweep.w)));
    float d = (u - uSweep.x) / uSweep.y;
    float band = exp(-d * d) + 0.35 * exp(-(d + 2.4) * (d + 2.4) * 4.0);
    float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114)) / max(c.a, 0.001);
    c.rgb = min(c.rgb + uSweepC * band * uSweep.z * c.a * (0.35 + 0.65 * lum), vec3(c.a));
  }
  gl_FragColor = c;
}`;

  /*
   * 图集修补（加载时在显卡上跑一次）：部分绑定是硬边切层（alter-e0：band 0、feather 0），
   * 上层（例如刘海）边界那一排像素下面，下层（脸）留着单像素的洞。静止时被盖住，放大显示时双线性插值会把洞
   * 「抹」出来（额头上一串灰点）。把「四邻里至少三个不透明」的近透明像素，用这些邻居的平均色垫在它下面（预乘 over）
   */
  const RVS = `
precision highp float;
attribute vec2 aQ;
void main(){ gl_Position = vec4(aQ * 2.0 - 1.0, 0.0, 1.0); }`;
  const RFS = PREC + `
uniform sampler2D uTex;
uniform vec2 uPx;
void main(){
  vec2 uv = gl_FragCoord.xy * uPx;
  vec4 c = texture2D(uTex, uv);
  if (c.a < 0.9) {
    vec4 n0 = texture2D(uTex, uv + vec2(uPx.x, 0.0));
    vec4 n1 = texture2D(uTex, uv - vec2(uPx.x, 0.0));
    vec4 n2 = texture2D(uTex, uv + vec2(0.0, uPx.y));
    vec4 n3 = texture2D(uTex, uv - vec2(0.0, uPx.y));
    float k0 = step(0.9, n0.a), k1 = step(0.9, n1.a), k2 = step(0.9, n2.a), k3 = step(0.9, n3.a);
    float k = k0 + k1 + k2 + k3;
    if (k >= 3.0) c += (n0 * k0 + n1 * k1 + n2 * k2 + n3 * k3) / k * (1.0 - c.a);
  }
  gl_FragColor = c;
}`;

  /* ---------------------------------------------------------------- WebGL：一个共享的离屏上下文 */
  let cv = null, gl = null, gl2 = false, glOK = null, gen = 0;
  let progL = null, progP = null, progR = null, UL = null, UP = null, UR = null, quad = null;
  let fbo = null, fboTex = null, fboW = 0, fboH = 0, fboOK = false;
  let CW = 1, CH = 1, MAXDIM = 2048, MAXTEX = 4096, aniso = null;
  function initGL() {
    if (glOK !== null) return glOK;
    glOK = false;
    // 页面地址带 ?keyart=off：当作设备不支持（检查各影片的替代画面用）
    if (opts.disable || /[?&]keyart=off\b/.test(location.search)) return false;
    try {
      cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      // 网格边缘都落在透明区域里，不需要 MSAA；failIfMajorPerformanceCaveat：只有软件渲染的 WebGL 时不用（太慢），影片走替代画面
      const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: !opts.software };
      // ?keyart=webgl1：强制走 WebGL1（检查旧设备上的退路）
      gl = /[?&]keyart=webgl1\b/.test(location.search) ? null : cv.getContext('webgl2', attrs);
      gl2 = !!gl;
      if (!gl) gl = cv.getContext('webgl', attrs) || cv.getContext('experimental-webgl', attrs);
      if (!gl) return false;
      cv.addEventListener('webglcontextlost', onLost, false);
      cv.addEventListener('webglcontextrestored', onRestored, false);
      if (!buildGL()) { gl = null; return false; }
      glOK = true;
    } catch (e) { gl = null; glOK = false; }
    return glOK;
  }
  function buildGL() {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const link = (vs, fs, attrs) => {
      const a = sh(gl.VERTEX_SHADER, vs), b = sh(gl.FRAGMENT_SHADER, fs);
      if (!a || !b) return null;
      const p = gl.createProgram();
      gl.attachShader(p, a); gl.attachShader(p, b);
      attrs.forEach((n, i) => gl.bindAttribLocation(p, i, n));
      gl.linkProgram(p);
      return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
    };
    progL = link(VS, FS, ['aPos', 'aUv']);
    progP = link(PVS, PFS, ['aQ']);
    progR = link(RVS, RFS, ['aQ']); // 图集修补；编译不过也不影响其它功能
    if (!progL || !progP) return false;
    UL = { uView: gl.getUniformLocation(progL, 'uView'), uL: gl.getUniformLocation(progL, 'uL'), uTex: gl.getUniformLocation(progL, 'uTex') };
    UP = {};
    ['uTex', 'uRect', 'uPx', 'uTint', 'uWash', 'uRim', 'uDir', 'uSweep', 'uSweepC'].forEach((k) => (UP[k] = gl.getUniformLocation(progP, k)));
    gl.useProgram(progL); gl.uniform1i(UL.uTex, 0);
    gl.useProgram(progP); gl.uniform1i(UP.uTex, 0);
    if (progR) { UR = { uTex: gl.getUniformLocation(progR, 'uTex'), uPx: gl.getUniformLocation(progR, 'uPx') }; gl.useProgram(progR); gl.uniform1i(UR.uTex, 0); }
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    MAXTEX = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [4096, 4096];
    MAXDIM = Math.max(256, Math.min(opts.maxDim || 2048, MAXTEX, vp[0], vp[1]));
    aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);
    fbo = null; fboTex = null; fboW = fboH = 0; fboOK = false;
    CW = cv.width; CH = cv.height;
    return true;
  }
  function onLost(e) {
    e.preventDefault(); // 允许恢复
    gen++;
    for (const R of rigs.values()) dropGPU(R, true);
    fbo = null; fboTex = null; fboW = fboH = 0;
  }
  function onRestored() {
    gen++;
    try { if (!buildGL()) { glOK = false; gl = null; } } catch (e) { glOK = false; gl = null; }
    // 各张图在下次 draw 时自动重新加载（图集走浏览器缓存）
  }
  const glLive = () => !!gl && !gl.isContextLost();
  /** 离屏画布按需增大（按 256 取整，不频繁重建）；最大 MAXDIM */
  function ensureSize(w, h) {
    if (w <= CW && h <= CH) return;
    const nw = Math.min(MAXDIM, Math.max(CW, Math.ceil(w / 256) * 256));
    const nh = Math.min(MAXDIM, Math.max(CH, Math.ceil(h / 256) * 256));
    if (nw === CW && nh === CH) return;
    cv.width = CW = nw; cv.height = CH = nh;
  }
  function ensureFBO() {
    if (fbo && fboW === CW && fboH === CH) return fboOK;
    if (!fbo) { fbo = gl.createFramebuffer(); fboTex = gl.createTexture(); }
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, CW, CH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
    fboOK = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fboW = CW; fboH = CH;
    return fboOK;
  }

  /* ---------------------------------------------------------------- 每个 key 的资源 */
  const rigs = new Map();
  function rec(key) {
    let R = rigs.get(key);
    if (!R) {
      R = { key, info: INFO[key] || null, rig: null, ready: false, loading: null, fails: 0, retryAt: 0, tok: 0, gen: -1, tex: null, vb: null, ib: null, L: null, bytes: 0, last: 0, plate: null, dropAt: 0, seed: strSeed(key) };
      rigs.set(key, R);
    }
    return R;
  }
  const withTimeout = (p, ms) => (ms > 0 ? Promise.race([p, new Promise((r) => setTimeout(() => r(false), ms))]) : p);
  /** 预载：key 或 [keys]；只 resolve（true = 全部就绪） */
  function load(key, timeout = 8000) {
    try {
      if (Array.isArray(key)) return Promise.all(key.map((k) => load(k, timeout))).then((a) => a.every(Boolean));
      if (typeof key !== 'string' || !/^[\w-]+$/.test(key)) return Promise.resolve(false);
      if (!initGL()) return Promise.resolve(false);
      const R = rec(key);
      R.dropAt = 0; // 取消待释放
      shrinkAt = 0;
      if (R.ready && glLive() && R.gen === gen) return Promise.resolve(true);
      if (R.ready && R.gen !== gen) dropGPU(R, true);
      if (!R.loading) {
        if (R.fails && now() < R.retryAt) return Promise.resolve(false);
        if (!glLive()) return Promise.resolve(false); // 上下文丢了：等恢复后再加载
        R.loading = doLoad(R).catch(() => false).then((ok) => {
          R.loading = null;
          // null = 中途作废（上下文丢失 / 被 release）：不算失败，下次用到时直接重来
          if (ok === false) { R.fails++; R.retryAt = now() + Math.min(120000, 12000 * R.fails); }
          if (ok) R.fails = 0;
          return !!ok;
        });
      }
      return withTimeout(R.loading, timeout);
    } catch (e) { return Promise.resolve(false); }
  }
  /** draw() 用到还没加载的图：在后台开始加载（失败后按退避重试） */
  function want(key) {
    if (glOK === false || typeof key !== 'string' || (gl && gl.isContextLost())) return;
    const R = rigs.get(key);
    if (R && (R.loading || (R.fails && now() < R.retryAt))) return;
    load(key, 0);
  }
  /** → true 成功；false 失败（按退避重试）；null 中途作废（上下文丢失、被 release），不算失败 */
  async function doLoad(R) {
    const tok = R.tok, g0 = gen;
    const stale = () => tok !== R.tok || g0 !== gen || !glLive();
    if (!R.rig) {
      const res = await fetch(BASE + R.key + '/rig.json', { cache: 'no-cache' });
      if (!res.ok) return false;
      const rig = await res.json();
      if (!rig || !Array.isArray(rig.layers) || !rig.w || !rig.atlasW) return false;
      R.rig = rig;
      if (!R.info) R.info = autoInfo(R.key, rig);
    }
    if (stale()) return null;
    const src = await fetchAtlas(R.rig, R.key);
    if (!src) return stale() ? null : false;
    const s0 = now();
    try {
      if (stale()) return null;
      if (!upload(R, src) || !buildGeom(R)) { dropGPU(R); return glLive() ? false : null; }
    } finally { if (src.bitmap && src.img.close) src.img.close(); }
    R.ready = true;
    R.gen = gen;
    R.last = now();
    budget(R);
    const s1 = now();
    // 预模糊（每张一个任务）与预热：不和上传挤在同一个任务里，播放中途重新加载时也不会卡一大下
    let busy = 0;
    try { busy = await makePlates(R); } catch (e) { /* 没有背景板 / 柔光也能画 */ }
    if (R.ready) { const w0 = now(); try { warmGL(R); } catch (e) { /* 无妨 */ } busy = Math.max(busy, now() - w0); }
    stats.load[R.key] = { upload: Math.round(s1 - s0), maxTask: Math.round(busy) };
    idleWatch();
    return R.ready ? true : null;
  }
  /** 预热：两套着色器、离屏帧缓冲都真正用一次（驱动常常到第一次绘制才编译），播放中第一次出现立绘时不卡顿 */
  let warmed = -1;
  function warmGL(R) {
    if (warmed === gen || !glLive()) return;
    warmed = gen;
    ensureSize(64, 64);
    const pp = postOf({ light: { rim: 0.5, wash: 0.1 }, sat: 0.9, sweep: 0.5 }, 2, 0.7, -0.7, 1, 1);
    renderGL(R, { blink: 0, saccade: 0 }, 0, 0, 0, R.info.w, R.info.h, 64, 64, pp);
    gl.flush();
  }
  /** 图集纹理的缩放：超过 MAX_TEXTURE_SIZE 时缩小；opts.texScale 可强制（0 = 自动；内存 ≤ 2GB 的设备用 0.5） */
  function texScaleFor(rig) {
    let s = opts.texScale > 0 ? opts.texScale : (navigator.deviceMemory && navigator.deviceMemory <= 2 ? 0.5 : 1);
    s = Math.min(s, MAXTEX / Math.max(rig.atlasW, rig.atlasH));
    return clamp(s, 0.1, 1);
  }
  async function fetchAtlas(rig, key) {
    const url = BASE + key + '/' + rig.atlas + (rig.v ? '?v=' + rig.v : '');
    const sc = texScaleFor(rig);
    const tw = Math.max(1, Math.floor(rig.atlasW * sc)), th = Math.max(1, Math.floor(rig.atlasH * sc));
    // 优先 createImageBitmap：后台线程解码并预乘，主线程只剩一次上传
    if (window.createImageBitmap && !opts.noBitmap) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          const o = { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' };
          if (sc < 1) { o.resizeWidth = tw; o.resizeHeight = th; o.resizeQuality = 'high'; }
          let bm = await createImageBitmap(blob, o);
          if (bm.width !== tw || bm.height !== th) { const c = resizeTo(bm, tw, th); bm.close(); return c ? { img: c, bitmap: false, w: tw, h: th, sc } : null; }
          return { img: bm, bitmap: true, w: tw, h: th, sc };
        }
      } catch (e) { /* 退回 <img> */ }
    }
    const img = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
    if (!img) return null;
    if (sc < 1) { const c = resizeTo(img, tw, th); return c ? { img: c, bitmap: false, w: tw, h: th, sc } : null; }
    return { img, bitmap: false, w: img.naturalWidth, h: img.naturalHeight, sc: 1 };
  }
  function resizeTo(src, w, h) {
    try { const c = E.mk(w, h), q = c.getContext('2d'); q.imageSmoothingQuality = 'high'; q.drawImage(src, 0, 0, w, h); return c; } catch (e) { return null; }
  }
  function upload(R, src) {
    for (let i = 0; i < 16 && gl.getError() !== gl.NO_ERROR; i++) { /* 清掉旧错误 */ }
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !src.bitmap);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src.img);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (opts.repair !== false) { try { repairAtlas(tex, src.w, src.h); } catch (e) { /* 修不了就用原图集 */ } }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (gl2) {
      // 立绘多半缩小显示：三线性 mipmap 让细线在动起来时不闪
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1));
    } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // WebGL1：非 2 的幂不能 mipmap
    if (gl.getError() !== gl.NO_ERROR) { gl.deleteTexture(tex); return false; }
    R.tex = tex;
    R.texScale = src.sc;
    R.bytes = src.w * src.h * 4 * (gl2 ? 4 / 3 : 1);
    return true;
  }

  /** 图集修补：两遍（能补上两个像素宽的缝）；来回渲染，结果回到原纹理里。做不了（视口太小、帧缓冲不完整）就原样返回 */
  function repairAtlas(tex, w, h) {
    if (!progR) return false;
    const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [0, 0];
    if (w > vp[0] || h > vp[1]) return false;
    const nearest = (t) => {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    gl.activeTexture(gl.TEXTURE0);
    nearest(tex);
    const tmp = gl.createTexture();
    nearest(tmp);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    let ok = true;
    gl.useProgram(progR);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(1);
    gl.uniform2f(UR.uPx, 1 / w, 1 / h);
    gl.viewport(0, 0, w, h);
    let from = tex, to = tmp;
    for (let pass = 0; pass < 2 && ok; pass++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, to, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { ok = false; break; }
      gl.bindTexture(gl.TEXTURE_2D, from);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const x = from; from = to; to = x;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tmp); // 两遍之后结果回到 tex；第一遍就失败时 tex 没被改动
    gl.enable(gl.BLEND);
    gl.enable(gl.SCISSOR_TEST);
    return ok;
  }

  /* ---------------------------------------------------------------- 网格与图层参数（每张图只建一次） */
  const NTAP = 40, TAP = 0.075; // 惯性：回看 3 秒（40 个取样点）
  function kernel(stiff, damp) {
    // 弹簧 x'' = -k (x - u) - c x' 的阶跃响应误差 E(τ) = 1 - x_step(τ)；惯性 e(t) = -Σ E(τ_j) Δu_j
    const w = Math.sqrt(Math.max(0.01, stiff)), z = damp / (2 * w), out = new Float32Array(NTAP);
    let n = NTAP;
    for (let j = 0; j < NTAP; j++) {
      const tau = (j + 0.5) * TAP;
      let v;
      if (z < 0.999) { const wd = w * Math.sqrt(1 - z * z); v = Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau)); }
      else if (z > 1.001) { const wh = w * Math.sqrt(z * z - 1); v = Math.exp(-z * w * tau) * (Math.cosh(wh * tau) + ((z * w) / wh) * Math.sinh(wh * tau)); }
      else v = Math.exp(-w * tau) * (1 + w * tau);
      out[j] = v;
    }
    while (n > 1 && Math.abs(out[n - 1]) < 2e-3) n--;
    return { k: out, n };
  }
  function buildGeom(R) {
    const rig = R.rig, P = rig.params || {};
    R.P = P;
    // 骨骼：0 = root，其余按 rig.bones 的顺序
    const bdef = rig.bones || {};
    const names = Object.keys(bdef).filter((n) => n !== 'root');
    const bi = { root: 0 };
    names.forEach((n, i) => (bi[n] = i + 1));
    const nb = names.length + 1;
    const parent = new Int32Array(nb), pivot = new Float64Array(nb * 2);
    const rp = (bdef.root && bdef.root.pivot) || [rig.w / 2, rig.h];
    parent[0] = -1; pivot[0] = rp[0]; pivot[1] = rp[1];
    const idle = [];
    names.forEach((n, i) => {
      const b = bdef[n] || {}, j = i + 1;
      parent[j] = b.parent && bi[b.parent] != null && b.parent !== n ? bi[b.parent] : 0;
      pivot[j * 2] = (b.pivot && b.pivot[0]) || 0; pivot[j * 2 + 1] = (b.pivot && b.pivot[1]) || 0;
      if (b.idle) idle.push({ i: j, rot: b.idle.rot || 0, tx: b.idle.tx || 0, ty: b.idle.ty || 0, f: (b.idle.freq ?? 1) * Math.PI * 2, ph: b.idle.phase ?? 0, spin: b.idle.spin || 0 });
    });
    const order = [], seen = new Uint8Array(nb);
    const visit = (i, d) => { if (seen[i] || d > 40) return; if (parent[i] > 0) visit(parent[i], d + 1); seen[i] = 1; order.push(i); };
    for (let i = 0; i < nb; i++) visit(i, 0);
    const B = {
      names, bi, nb, parent, pivot, idle, order,
      rot: new Float64Array(nb), tx: new Float64Array(nb), ty: new Float64Array(nb), sx: new Float64Array(nb), sy: new Float64Array(nb),
      W: new Float64Array(nb * 6),
      head: bi[P.headBone || 'head'] ?? -1, chest: bi[P.chestBone || 'chest'] ?? -1, body: bi[P.bodyBone || 'body'] ?? -1,
      cast: P.castArm && bi[P.castArm] != null ? bi[P.castArm] : -1,
      turn0: 0, turn1: 0,
    };
    R.B = B;
    // 图层网格：所有图层拼进一个顶点缓冲 + 一个索引缓冲（Uint16，每张图都不到 65536 个顶点）
    const layers = rig.layers;
    let nv = 0, ni = 0;
    for (const L of layers) {
      const cols = L.cols, rows = L.rows, occ = L.occ || '';
      const used = new Uint8Array((cols + 1) * (rows + 1));
      for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
        if (occ.charCodeAt(r * cols + q) !== 49) continue;
        ni += 6;
        used[r * (cols + 1) + q] = used[r * (cols + 1) + q + 1] = used[(r + 1) * (cols + 1) + q] = used[(r + 1) * (cols + 1) + q + 1] = 1;
      }
      for (let i = 0; i < used.length; i++) nv += used[i];
    }
    if (nv > 65535) return false;
    const V = new Float32Array(nv * 4), I = new Uint16Array(ni);
    const U = new Float32Array(layers.length * 40);
    const aw = rig.atlasW, ah = rig.atlasH;
    const sphere = P.sphere || null, headName = P.headBone || 'head';
    const swayPx = P.swayPx ?? 6;
    const out = [];
    let vi = 0, ii = 0;
    layers.forEach((L, li) => {
      const [x0, y0, rw, rh] = L.rect, s = L.step, cols = L.cols, rows = L.rows, occ = L.occ || '';
      const ax = L.at[0] - x0, ay = L.at[1] - y0;
      const map = new Int32Array((cols + 1) * (rows + 1)).fill(-1);
      const v = (q, r) => {
        const k = r * (cols + 1) + q;
        if (map[k] < 0) {
          const px = x0 + Math.min(q * s, rw), py = y0 + Math.min(r * s, rh);
          V[vi * 4] = px; V[vi * 4 + 1] = py; V[vi * 4 + 2] = (px + ax) / aw; V[vi * 4 + 3] = (py + ay) / ah;
          map[k] = vi++;
        }
        return map[k];
      };
      const first = ii;
      for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
        if (occ.charCodeAt(r * cols + q) !== 49) continue;
        const a = v(q, r), b = v(q + 1, r), c = v(q, r + 1), d = v(q + 1, r + 1);
        I[ii++] = a; I[ii++] = b; I[ii++] = c; I[ii++] = b; I[ii++] = d; I[ii++] = c;
      }
      const n = ii - first;
      if (!n) return;
      const u = U.subarray(li * 40, li * 40 + 40);
      const bone = bi[L.bone || 'root'] ?? 0;
      const d = L.depth || 0;
      const o = { id: L.id, n, off: first * 2, u, bone, depth: d, depthBody: L.depthBody || 0, x0, y0, x1: x0 + rw, y1: y0 + rh, pad: 6 };
      // 头部球面
      const sp = L.sphere === false ? null : Array.isArray(L.sphere) ? L.sphere : (L.sphere || (sphere && (L.bone || 'root') === headName && d > 0)) ? sphere : null;
      if (sp) { u[8] = sp[0]; u[9] = sp[1]; u[10] = sp[2]; u[11] = sp[3] ?? sp[2]; }
      if (d) o.pad += 16;
      // 摆动
      if (L.sway && L.sway.dir && (L.sway.dir[0] || L.sway.dir[1])) {
        const Sw = L.sway, len = Math.hypot(Sw.dir[0], Sw.dir[1]);
        const amp = (Sw.amp ?? 1) * swayPx;
        const kick = Sw.kick ?? 1;
        const kr = kernel(Sw.stiff ?? 30, Sw.damp ?? 5);
        o.sw = {
          A: amp * (Sw.side ?? 1), amp: Math.abs(amp), f: Sw.freq ?? 1.1, ph: Sw.phase ?? hash(R.seed, li, 3) * 6, len,
          follow: Sw.follow ?? 1, lagF: Sw.lag ?? 0.7, kern: kr.k, kn: kr.n,
          px: -Sw.dir[1] / len, py: Sw.dir[0] / len,
          wk: kick > 0 ? 0.35 + 0.65 * Math.min(1, kick) : 0, // 对风的响应（绑定里对冲量不响应的：水面、晶叶……只保留原有的飘动）
          calm: kick <= 0,
          lag: 0,
        };
        u[12] = Sw.root[0]; u[13] = Sw.root[1]; u[14] = Sw.dir[0]; u[15] = Sw.dir[1];
        u[18] = Sw.wave ?? 0; u[19] = Sw.pow ?? 1.6;
        o.pad += amp * 4 + len * 0.14 + 36;
      } else u[19] = 1;
      // 眨眼压扁
      if (L.squash) { o.squash = L.squash.amount ?? 0.85; u[25] = L.squash.pivotY; }
      o.eye = L.eye === 'L' ? 1 : L.eye === 'R' ? 2 : 0;
      // 张嘴
      if (L.mouth) { o.mouth = true; u[27] = L.mouth.pivotY; u[28] = L.mouth.min ?? 0.25; } else { u[26] = 1; u[28] = 1; }
      // 虹膜：跟随视线 + 眼眶裁剪
      if (L.look) {
        const a = L.look.amp || [4, 2.5];
        o.look = [a[0], a[1]];
        const c = L.look.clip;
        if (c) { u[32] = c[0]; u[33] = c[1]; u[34] = c[2]; u[35] = c[3] ?? c[2]; }
      } else if (L.clip) { u[32] = L.clip[0]; u[33] = L.clip[1]; u[34] = L.clip[2]; u[35] = L.clip[3] ?? L.clip[2]; }
      // 状态显隐
      const spec = (x) => {
        if (!x) return null;
        const st = typeof x === 'string' ? x : x.state;
        const blink = /^blink/.test(st);
        return { st, lo: (typeof x === 'object' && x.lo != null) ? x.lo : blink ? 0.5 : 0, hi: (typeof x === 'object' && x.hi != null) ? x.hi : blink ? 0.9 : 1 };
      };
      o.show = spec(L.show);
      o.hide = spec(L.hide);
      // 发光
      if (L.glow) {
        const c = rgb01(L.glow.color || '#ffffff');
        o.glow = { r: c[0], g: c[1], b: c[2], amp: L.glow.amp ?? 0.25, f: (L.glow.freq ?? 0.6) * Math.PI * 2, ph: L.glow.phase ?? hash(R.seed, li, 5) * 6, cast: L.glow.cast ?? 0.6, base: L.glow.base ?? 0 };
      }
      out.push(o);
    });
    R.L = out;
    R.U = U;
    // 惯性：摆动图层所在骨骼 → 到 root 的骨骼链
    const swayBones = [], chains = [];
    for (const o of out) {
      if (!o.sw) continue;
      let s = swayBones.indexOf(o.bone);
      if (s < 0) {
        s = swayBones.length;
        swayBones.push(o.bone);
        const ch = [];
        let b = o.bone, guard = 0;
        while (b > 0 && guard++ < 40) { ch.push(b); b = parent[b]; }
        chains.push(ch);
      }
      o.sw.slot = s;
    }
    const drive = new Uint8Array(nb);
    chains.forEach((ch) => ch.forEach((b) => (drive[b] = 1)));
    B.drive = drive;
    B.swayBones = swayBones; B.chains = chains;
    R.tapRot = new Float64Array((NTAP + 1) * Math.max(1, swayBones.length));
    R.tapTurn = new Float64Array(NTAP + 1);
    // 上传
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, V, gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, I, gl.STATIC_DRAW);
    R.vb = vb; R.ib = ib;
    R.bytes += V.byteLength + I.byteLength;
    return true;
  }
  function dropGPU(R, lostCtx) {
    if (!lostCtx && glLive()) {
      if (R.tex) gl.deleteTexture(R.tex);
      if (R.vb) gl.deleteBuffer(R.vb);
      if (R.ib) gl.deleteBuffer(R.ib);
    }
    R.tex = R.vb = R.ib = null;
    R.ready = false;
    R.bytes = 0;
    R.plate = null;
    R.tok++;
  }
  /** 显存预算：超出时释放最久没画过的图（2 秒内画过的不动） */
  function budget(keep) {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const limit = (coarse ? 220 : 420) * 1048576;
    let total = 0;
    for (const R of rigs.values()) total += R.ready ? R.bytes : 0;
    if (total <= limit) return;
    const list = [...rigs.values()].filter((R) => R.ready && R !== keep && now() - R.last > 2000).sort((a, b) => a.last - b.last);
    for (const R of list) { if (total <= limit) break; total -= R.bytes; dropGPU(R); }
  }
  let idleT = 0, lastDraw = 0;
  function idleWatch() {
    if (idleT) return;
    idleT = setTimeout(function chk() {
      idleT = 0;
      const any = [...rigs.values()].some((R) => R.ready);
      if (!any) return;
      if (now() - lastDraw > opts.idleSec * 1000) { release(undefined, true); return; }
      idleT = setTimeout(chk, 30000);
    }, 30000);
  }

  /* ---------------------------------------------------------------- 姿势（t 的纯函数） */
  /**
   * 骨骼局部变换 + 转头量。lite = true 时只算惯性要用的骨骼转角与转头（回看取样用）
   * 与 js/puppet.js 的 frameState 同一套数：呼吸、待机摆动、重心、骨骼自带的 idle；
   * 鼠标 / 动作换成了参数：look（转头）、tilt、nod、lean、cast
   */
  function pose(R, t, o, lite) {
    const B = R.B, P = R.P, nb = B.nb, rot = B.rot;
    if (lite) { const dr = B.drive; for (let i = 0; i < nb; i++) if (dr[i]) rot[i] = 0; rot[0] = 0; }
    else { rot.fill(0); B.tx.fill(0); B.ty.fill(0); B.sx.fill(1); B.sy.fill(1); }
    const idle = B.idle;
    for (let k = 0; k < idle.length; k++) {
      const d = idle[k];
      if (lite && !B.drive[d.i]) continue;
      const w = t * d.f + d.ph;
      rot[d.i] += d.rot * Math.sin(w) + d.spin * t;
      if (!lite) { B.tx[d.i] += d.tx * Math.sin(w * 0.9 + 1.3); B.ty[d.i] += d.ty * Math.sin(w + 0.6); }
    }
    const swa = val(o.sway, t, 1), head = B.head, body = B.body, chest = B.chest;
    if (!lite) {
      const br = Math.sin(t * 1.55) * val(o.breath, t, 1), lift = P.breathLift ?? 0.8;
      if (chest >= 0) { B.sy[chest] += (P.breath ?? 0.004) * br; B.ty[chest] -= lift * br; }
      if (head >= 0) B.ty[head] -= lift * 0.8 * br;
    }
    if (head >= 0) rot[head] += Math.sin(t * 0.7) * 0.004 * swa;
    if (body >= 0) rot[body] += Math.sin(t * 0.45 + 1) * 0.0015 * swa;
    let turn0 = Math.sin(t * 0.33) * 0.1 * swa, turn1 = 0;
    let rr = (Math.sin(t * 0.23 + 0.7) * 0.7 + Math.sin(t * 0.61) * 0.3) * 0.0032 * (P.hop === 0 ? 0.5 : 1) * swa;
    val2(o.look, t, LK);
    const lx = clamp(LK[0], -1.2, 1.2), ly = clamp(LK[1], -1, 1);
    turn0 += lx * 1.1; turn1 += ly * 0.9;
    if (head >= 0) rot[head] += lx * 0.012;
    const tl = clamp(+val(o.tilt, t, 0) || 0, -1.3, 1.3);
    if (tl) { if (head >= 0) rot[head] += (P.tilt ?? 0.04) * tl; turn0 += 0.3 * tl; }
    const nd = clamp(+val(o.nod, t, 0) || 0, -0.6, 1.2);
    if (nd) { if (!lite && head >= 0) B.ty[head] += (P.nod ?? 5) * 1.5 * nd; turn1 += 0.6 * nd; }
    const ln = clamp(+val(o.lean, t, 0) || 0, -1.2, 1.2);
    if (ln) rr += (P.lean ?? (P.tilt ?? 0.04) * 2) * ln;
    const cs = clamp(+val(o.cast, t, 0) || 0, 0, 1.2);
    if (cs && B.cast >= 0) rot[B.cast] += (P.castRot ?? -0.1) * cs;
    // 带画框的场景图：整体倾斜只作用在人物身上（bodyBone），画框不动
    if (P.rootIsScene) { if (body >= 0) rot[body] += rr; rot[0] = 0; } else rot[0] = rr;
    B.turn0 = clamp(turn0, -1.2, 1.2);
    B.turn1 = clamp(turn1, -1, 1);
    if (lite) return;
    // 世界矩阵（canvas 约定：x' = a x + c y + e，y' = b x + d y + f）
    const W = B.W, pv = B.pivot, par = B.parent;
    for (let k = 0; k < B.order.length; k++) {
      const i = B.order[k];
      const c = Math.cos(rot[i]), s = Math.sin(rot[i]);
      const a = c * B.sx[i], b = s * B.sx[i], cc = -s * B.sy[i], d = c * B.sy[i];
      const px = pv[i * 2], py = pv[i * 2 + 1];
      const e = px + B.tx[i] - (a * px + cc * py), f = py + B.ty[i] - (b * px + d * py);
      const j = i * 6, p = par[i];
      if (p < 0) { W[j] = a; W[j + 1] = b; W[j + 2] = cc; W[j + 3] = d; W[j + 4] = e; W[j + 5] = f; }
      else {
        const q = p * 6, A = W[q], Bb = W[q + 1], C = W[q + 2], D = W[q + 3], Ee = W[q + 4], F = W[q + 5];
        W[j] = A * a + C * b; W[j + 1] = Bb * a + D * b;
        W[j + 2] = A * cc + C * d; W[j + 3] = Bb * cc + D * d;
        W[j + 4] = A * e + C * f + Ee; W[j + 5] = Bb * e + D * f + F;
      }
    }
  }
  const rotSum = (B, ch) => { let a = B.rot[0]; for (let k = 0; k < ch.length; k++) a += B.rot[ch[k]]; return a; };
  /** 发束 / 飘带的惯性：弹簧对「驱动量」（骨骼转角 × 发束长度 + 转头视差）的响应，用过去 3 秒的取样解析地卷积出来 */
  function lags(R, t, o) {
    const B = R.B, ns = B.swayBones.length;
    if (!ns) return;
    const P = R.P, turnPx = P.turnPx ?? 6;
    const T = R.tapRot, TT = R.tapTurn;
    const t0 = B.turn0, t1 = B.turn1;
    for (let s = 0; s < ns; s++) T[s] = rotSum(B, B.chains[s]);
    TT[0] = t0;
    let need = 0;
    for (const L of R.L) if (L.sw && L.sw.kn > need) need = L.sw.kn;
    for (let j = 1; j <= need; j++) {
      pose(R, t - j * TAP, o, true);
      for (let s = 0; s < ns; s++) T[j * ns + s] = rotSum(B, B.chains[s]);
      TT[j] = B.turn0;
    }
    B.turn0 = t0; B.turn1 = t1;
    for (const L of R.L) {
      const w = L.sw;
      if (!w) continue;
      const s = w.slot, k = w.kern, dk = L.depth * turnPx;
      let e = 0;
      let prev = (T[s] * w.len + dk * TT[0]) * w.follow;
      for (let j = 0; j < w.kn; j++) {
        const nx = (T[(j + 1) * ns + s] * w.len + dk * TT[j + 1]) * w.follow;
        e -= k[j] * (prev - nx);
        prev = nx;
      }
      w.lag = e * w.lagF;
    }
  }

  /* ---------------------------------------------------------------- 眨眼 / 眼神（由 t 与种子决定） */
  function blinkShape(x, slow) {
    if (slow) { const k = x / 0.62; if (k <= 0 || k >= 1) return 0; return k < 0.3 ? sm(k / 0.3) : k < 0.5 ? 1 : sm((1 - k) / 0.5); }
    const k = x / 0.19;
    if (k <= 0 || k >= 1) return 0;
    return k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55;
  }
  /** 自动眨眼：每 3.6 秒一个时段，时段里随机一个时刻眨一下；偶尔连眨两下、偶尔慢慢眨 */
  function blinkAuto(t, seed) {
    const Pd = 3.6, i0 = Math.floor(t / Pd);
    let v = 0;
    for (let i = i0 - 1; i <= i0; i++) {
      const tb = i * Pd + 0.3 + hash(seed, i, 7) * (Pd - 1.0);
      const slow = hash(seed, i, 8) > 0.88;
      v = Math.max(v, blinkShape(t - tb, slow));
      if (!slow && hash(seed, i, 9) > 0.8) v = Math.max(v, blinkShape(t - tb - 0.3, false));
    }
    return v;
  }
  const SAC = [0, 0];
  /** 眼神的细微扫动：约每 1.9 秒换一个落点，0.06 秒跳过去 */
  function saccade(t, seed, amt) {
    const Pd = 1.9, x = t / Pd, i = Math.floor(x), f = (x - i) * Pd;
    const k = sm(f / 0.06);
    const ax = (hash(seed, i - 1, 21) - 0.5) * 0.5, ay = (hash(seed, i - 1, 22) - 0.5) * 0.24;
    const bx = (hash(seed, i, 21) - 0.5) * 0.5, by = (hash(seed, i, 22) - 0.5) * 0.24;
    SAC[0] = lerp(ax, bx, k) * amt; SAC[1] = lerp(ay, by, k) * amt;
    return SAC;
  }

  /* ---------------------------------------------------------------- 构图 */
  const FR = { cx: 0, cy: 0, cw: 1, ch: 1, lx0: 0, ly0: 0, kx: 1, k: 1 };
  /** crop（原画像素）→ 当前坐标系：local = (lx0 + kx·ax, ly0 + k·ay) */
  function framing(info, o, out) {
    const c = cropRect(info, o.crop) || [0, 0, 1, 1];
    const cx = c[0], cy = c[1], cw = c[2], ch = c[3];
    const ax = o.ax ?? 0.5, ay = o.ay ?? 0.5;
    let k, px, py;
    if (o.fit) {
      const bx = o.box || [0, 0, VW, VH];
      k = o.fit === 'contain' ? Math.min(bx[2] / cw, bx[3] / ch) : Math.max(bx[2] / cw, bx[3] / ch);
      px = bx[0] + bx[2] * ax; py = bx[1] + bx[3] * ay;
    } else {
      k = o.scale > 0 ? o.scale : o.h > 0 ? o.h / ch : o.w > 0 ? o.w / cw : VH / ch;
      px = o.x ?? VW / 2; py = o.y ?? VH / 2;
    }
    out.cx = cx; out.cy = cy; out.cw = cw; out.ch = ch; out.k = k;
    out.ly0 = py - (cy + ch * ay) * k;
    if (o.flip) { out.kx = -k; out.lx0 = px + (cx + cw * ax) * k; }
    else { out.kx = k; out.lx0 = px - (cx + cw * ax) * k; }
    return out;
  }

  /* ---------------------------------------------------------------- 绘制 */
  const S = { blinkL: 0, blinkR: 0, blink: 0, happy: 0, talk: 0, sleepy: 0, cast: 0, blush: 0, smile: 0 };
  const GZ = [0, 0];
  const stateA = (sp, dflt) => (sp ? sm(((S[sp.st] || 0) - sp.lo) / Math.max(1e-3, sp.hi - sp.lo)) : dflt);
  const stats = { draws: 0, lastMs: 0, avgMs: 0, canvas: [1, 1], gpuMB: 0, keys: [], load: {} };
  function states(R, o, t) {
    const eyes = o.eyes ?? 'open';
    let bl = 0, br = 0, happy = clamp(+val(o.smile, t, 0) || 0);
    let open = true;
    if (eyes === 'closed') { bl = br = 1; open = false; }
    else if (eyes === 'smile') { happy = 1; open = false; }
    else if (eyes === 'winkL') { bl = 1; }
    else if (eyes === 'winkR') { br = 1; }
    else if (typeof eyes === 'number') { bl = br = clamp(eyes); }
    if (open) {
      const b = o.blink ?? 'auto';
      const v = b === 'auto' ? blinkAuto(t, o.seed ?? R.seed) : clamp(+val(b, t, 0) || 0);
      bl = Math.max(bl, v); br = Math.max(br, v);
    }
    S.blinkL = bl; S.blinkR = br; S.blink = Math.max(bl, br);
    S.happy = happy; S.smile = happy;
    S.talk = clamp(+val(o.mouth, t, 0) || 0);
    S.blush = clamp(+val(o.blush, t, 0) || 0);
    S.cast = clamp(+val(o.cast, t, 0) || 0);
    // 视线：默认跟着转头，加上细微扫动
    if (o.gaze != null) val2(o.gaze, t, GZ); else { val2(o.look, t, GZ); GZ[0] *= 1.0; GZ[1] *= 0.9; }
    const sa = o.saccade ?? 0.5;
    if (sa > 0) { const q = saccade(t, (o.seed ?? R.seed) + 17, sa); GZ[0] += q[0]; GZ[1] += q[1]; }
    GZ[0] = clamp(GZ[0], -1, 1); GZ[1] = clamp(GZ[1], -1, 1);
  }
  const WD = [1, 0];
  function windDir(v) {
    if (Array.isArray(v)) { const l = Math.hypot(v[0], v[1]) || 1; WD[0] = v[0] / l; WD[1] = v[1] / l; }
    else { WD[0] = (v ?? 1) < 0 ? -1 : 1; WD[1] = 0; }
    return WD;
  }
  /** 把一帧画进离屏 WebGL 画布左上角 rw×rh 的区域；view = 原画坐标里的可见矩形 */
  function renderGL(R, o, t, vx0, vy0, vx1, vy1, rw, rh, post) {
    const P = R.P;
    pose(R, t, o, false);
    lags(R, t, o);
    states(R, o, t);
    const B = R.B, W = B.W, turn0 = B.turn0, turn1 = B.turn1;
    const turnPx = P.turnPx ?? 6, turnPxY = P.turnPxY ?? 3;
    // 风
    const wind = clamp(+val(o.wind, t, 0.25) || 0, 0, 1.6) * opts.windK; // 1 = 验证过的大风；再大发梢后面会露出没补画的地方
    const wd = windDir(o.windDir);
    const seed = o.seed ?? R.seed;
    const gust = 0.55 + 0.45 * (0.5 + 0.5 * wobble(seed + 91, t * 0.35, 2));
    const waveK = 0.15 + 0.85 * Math.min(1, wind / 0.25) + 0.9 * Math.max(0, wind - 0.25);
    const glowK = Math.max(0, +val(o.glow, t, 1));
    // 目标
    const usePost = post && ensureFBO();
    if (usePost) { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, rw, rh); gl.scissor(0, 0, rw, rh); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, CH - rh, rw, rh); gl.scissor(0, CH - rh, rw, rh); }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(progL);
    const vw = vx1 - vx0, vh = vy1 - vy0;
    gl.uniform4f(UL.uView, 2 / vw, -2 / vh, -1 - (2 * vx0) / vw, 1 + (2 * vy0) / vh);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, R.tex);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.vb);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.ib);
    const gx = GZ[0], gy = GZ[1];
    let drawn = 0;
    const only = opts.only;
    for (const L of R.L) {
      if (only && only.indexOf(L.id) < 0) continue; // 调试：只画这些图层
      // 状态显隐
      let alpha = 1;
      const eb = L.eye === 1 ? S.blinkL : L.eye === 2 ? S.blinkR : S.blink;
      if (L.squash) alpha *= 1 - sm((eb - 0.6) / 0.35);
      if (L.show) alpha *= stateA(L.show, 1);
      if (L.hide) alpha *= 1 - stateA(L.hide, 0);
      if (alpha <= 0.002) continue;
      // 裁掉看不见的图层（按骨骼变换后的包围盒 + 形变余量）
      const j = L.bone * 6, a = W[j], b = W[j + 1], c = W[j + 2], d = W[j + 3], e = W[j + 4], f = W[j + 5];
      const X0 = L.x0 - L.pad, X1 = L.x1 + L.pad, Y0 = L.y0 - L.pad, Y1 = L.y1 + L.pad;
      const ex = (Math.abs(a) * (X1 - X0) + Math.abs(c) * (Y1 - Y0)) / 2, ey = (Math.abs(b) * (X1 - X0) + Math.abs(d) * (Y1 - Y0)) / 2;
      const mx = (X0 + X1) / 2, my = (Y0 + Y1) / 2, cxw = a * mx + c * my + e, cyw = b * mx + d * my + f;
      if (cxw + ex < vx0 || cxw - ex > vx1 || cyw + ey < vy0 || cyw - ey > vy1) continue;
      const u = L.u;
      u[0] = a; u[1] = b; u[2] = c; u[3] = d; u[4] = e; u[5] = f;
      const dd = L.depth;
      u[6] = dd * turn0 * turnPx + L.depthBody * turn0 * turnPx * 0.4;
      u[7] = dd * turn1 * turnPxY;
      const w = L.sw;
      if (w) {
        u[16] = w.A * (w.calm ? Math.min(1, waveK) : waveK);
        u[17] = t * w.f + w.ph;
        const bend = w.wk ? (wd[0] * w.px + wd[1] * w.py) * w.amp * 4.4 * wind * gust * w.wk : 0;
        u[20] = w.lag + bend;
        u[22] = w.wk ? w.amp * 0.7 * wind * (0.35 + 0.65 * gust) * w.wk : 0;
        u[23] = t * w.f * 3.1 + w.ph * 1.7;
      }
      if (L.squash) u[24] = eb * L.squash;
      if (L.mouth) u[26] = S.talk;
      if (L.look) { u[29] = gx * L.look[0]; u[30] = gy * L.look[1]; }
      u[31] = alpha;
      if (L.glow) {
        const g = L.glow, kk = Math.max(0, (g.base + g.amp * (0.5 + 0.5 * Math.sin(t * g.f + g.ph)) + g.cast * S.cast) * glowK);
        u[36] = g.r * kk; u[37] = g.g * kk; u[38] = g.b * kk;
      }
      gl.uniform4fv(UL.uL, u);
      gl.drawElements(gl.TRIANGLES, L.n, gl.UNSIGNED_SHORT, L.off);
      drawn++;
    }
    if (usePost) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, CH - rh, rw, rh);
      gl.scissor(0, CH - rh, rw, rh);
      gl.useProgram(progP);
      gl.disable(gl.BLEND);
      gl.bindTexture(gl.TEXTURE_2D, fboTex);
      gl.disableVertexAttribArray(1);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const pp = post;
      gl.uniform4f(UP.uRect, 0, 0, rw / fboW, rh / fboH);
      gl.uniform4f(UP.uPx, 1 / fboW, 1 / fboH, pp.sharpen, pp.sat);
      gl.uniform4f(UP.uTint, pp.tint[0], pp.tint[1], pp.tint[2], pp.tintA);
      gl.uniform4f(UP.uWash, pp.wash[0], pp.wash[1], pp.wash[2], pp.contrast);
      gl.uniform4f(UP.uRim, pp.rim[0], pp.rim[1], pp.rim[2], pp.rimW);
      gl.uniform4f(UP.uDir, pp.dx, -pp.dy, pp.dx, pp.dy);
      gl.uniform4f(UP.uSweep, pp.sw[0], pp.sw[1], pp.sw[2], pp.sw[3]);
      gl.uniform3f(UP.uSweepC, pp.swc[0], pp.swc[1], pp.swc[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.enable(gl.BLEND);
    }
    return drawn;
  }
  /* 后期参数（复用，不在每帧分配） */
  const PP = { sharpen: 0, sat: 1, contrast: 1, tint: [1, 1, 1], tintA: 0, wash: [0, 0, 0], rim: [0, 0, 0], rimW: 0, dx: 0.7, dy: -0.7, sw: [0, 1, 0, 0], swc: [1, 1, 1] };
  /**
   * 后期参数；返回 null = 不需要后期（直接画到画布，省一遍）。
   * mag：每个纹理像素在屏幕上占几个像素（放大时自动锐化）；texelPerDev：离屏像素 / 屏幕像素；hk：画布高 / 720
   */
  function postOf(o, mag, dirX, dirY, texelPerDev, hk) {
    let need = false;
    const sh = o.sharpen ?? 1;
    PP.sharpen = sh > 0 && mag > 1.12 ? clamp((mag - 1) * 0.25, 0, 0.5) * sh : 0;
    if (PP.sharpen > 0.01) need = true; else PP.sharpen = 0;
    PP.sat = o.sat ?? 1;
    if (Math.abs(PP.sat - 1) > 0.01) need = true;
    PP.contrast = clamp(o.contrast ?? 1, 0.5, 1.6);
    if (Math.abs(PP.contrast - 1) > 0.005) need = true;
    // tint：'#hex' | [颜色, 强度] | { color, amount }
    PP.tintA = 0;
    const ti = o.tint;
    if (ti) {
      const col = typeof ti === 'object' && !Array.isArray(ti) ? ti.color : Array.isArray(ti) && typeof ti[0] !== 'number' ? ti[0] : ti;
      const amt = typeof ti === 'object' && !Array.isArray(ti) ? ti.amount : Array.isArray(ti) && typeof ti[0] !== 'number' ? ti[1] : 1;
      const c = rgb01(col);
      PP.tint[0] = c[0]; PP.tint[1] = c[1]; PP.tint[2] = c[2]; PP.tintA = clamp(amt ?? 1);
      if (PP.tintA > 0.005) need = true;
    }
    PP.wash[0] = PP.wash[1] = PP.wash[2] = 0; PP.rimW = 0;
    const L = o.light;
    if (L) {
      const c = rgb01(L.color || '#fff4e0'), am = L.amount ?? 1;
      const wa = (L.wash ?? 0.1) * am, ra = (L.rim ?? 0.6) * am;
      PP.wash[0] = c[0] * wa; PP.wash[1] = c[1] * wa; PP.wash[2] = c[2] * wa;
      PP.rim[0] = c[0] * ra; PP.rim[1] = c[1] * ra; PP.rim[2] = c[2] * ra;
      // 轮廓光宽度：按画布上的像素（720p 下约 3 像素），特写时略宽
      PP.rimW = ra > 0 ? (L.width ?? 3) * texelPerDev * clamp(Math.sqrt(mag), 0.7, 1.8) * (hk || 1) : 0;
      if (wa > 0.003 || PP.rimW > 0) need = true;
    }
    // 扫光：sweep = 进度 0..1 | { at, color, width, strength, angle }
    PP.sw[2] = 0;
    const sw = o.sweep;
    if (sw != null && sw !== false) {
      const so = typeof sw === 'object' ? sw : { at: sw };
      const at = +so.at;
      if (at > 0 && at < 1) {
        const c = rgb01(so.color || '#fffaf0');
        PP.sw[0] = lerp(-0.9, 0.9, at); PP.sw[1] = so.width ?? 0.045; PP.sw[2] = so.strength ?? 0.55; PP.sw[3] = so.angle ?? -0.4;
        PP.swc[0] = c[0]; PP.swc[1] = c[1]; PP.swc[2] = c[2];
        need = true;
      }
    }
    PP.dx = dirX; PP.dy = dirY;
    return need ? PP : null;
  }

  /**
   * draw(g, key, o) → boolean：见文件头
   */
  function draw(g, key, o) {
    o = o || EMPTY;
    let R;
    try {
      if (!g || !g.canvas) return false;
      R = rigs.get(key);
      if (!R || !R.ready || !glLive() || R.gen !== gen) { if (R && R.ready && R.gen !== gen) dropGPU(R, true); want(key); return false; }
      if (R.dropAt) { R.dropAt = 0; shrinkAt = 0; } // 又用到了：取消待释放
    } catch (e) { return false; }
    let saved = false;
    try {
      const c0 = now();
      const fr = framing(R.info, o, FR);
      // 原画 → 设备像素 的仿射（当前变换 × 构图）
      let a = 1, b = 0, c = 0, d = 1, e = 0, f = 0;
      const M = g.getTransform ? g.getTransform() : null;
      if (M) { a = M.a; b = M.b; c = M.c; d = M.d; e = M.e; f = M.f; }
      else { const s = g.canvas.width / VW; a = d = s; }
      const A = a * fr.kx, Bm = b * fr.kx, C = c * fr.k, D = d * fr.k;
      const Ex = a * fr.lx0 + c * fr.ly0 + e, Fy = b * fr.lx0 + d * fr.ly0 + f;
      const det = A * D - Bm * C;
      if (!(Math.abs(det) > 1e-12)) return true;
      const Wc = g.canvas.width, Hc = g.canvas.height;
      const cx0 = fr.cx, cy0 = fr.cy, cx1 = fr.cx + fr.cw, cy1 = fr.cy + fr.ch;
      let vx0, vy0, vx1, vy1, pw, ph, axis = false, X0 = 0, Y0 = 0;
      const mag = Math.sqrt(Math.abs(det)) / (R.texScale || 1); // 每个纹理像素在屏幕上占几个像素
      if (Math.abs(Bm) < 1e-9 && Math.abs(C) < 1e-9 && A > 0 && D > 0) {
        // 轴对齐（最常见）：可见区域对齐到整像素，贴回时一一对应、不再插值
        axis = true;
        X0 = Math.max(0, Math.floor(A * cx0 + Ex + 1e-4)); const X1 = Math.min(Wc, Math.ceil(A * cx1 + Ex - 1e-4));
        Y0 = Math.max(0, Math.floor(D * cy0 + Fy + 1e-4)); const Y1 = Math.min(Hc, Math.ceil(D * cy1 + Fy - 1e-4));
        if (X1 <= X0 || Y1 <= Y0) return true;
        pw = X1 - X0; ph = Y1 - Y0;
        vx0 = (X0 - Ex) / A; vx1 = (X1 - Ex) / A; vy0 = (Y0 - Fy) / D; vy1 = (Y1 - Fy) / D;
      } else {
        // 旋转 / 镜像：画布四角反算到原画坐标，取包围盒与裁剪框的交集
        const ia = D / det, ib = -Bm / det, ic = -C / det, id = A / det;
        let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
        for (let q = 0; q < 4; q++) {
          const X = q & 1 ? Wc : 0, Y = q & 2 ? Hc : 0, dx = X - Ex, dy = Y - Fy;
          const ux = ia * dx + ic * dy, uy = ib * dx + id * dy;
          if (ux < mnx) mnx = ux; if (ux > mxx) mxx = ux; if (uy < mny) mny = uy; if (uy > mxy) mxy = uy;
        }
        vx0 = Math.max(cx0, mnx); vx1 = Math.min(cx1, mxx); vy0 = Math.max(cy0, mny); vy1 = Math.min(cy1, mxy);
        if (vx1 <= vx0 || vy1 <= vy0) return true;
        const sc = Math.sqrt(Math.abs(det));
        pw = Math.ceil((vx1 - vx0) * sc); ph = Math.ceil((vy1 - vy0) * sc);
      }
      if (pw < 1 || ph < 1) return true;
      // 离屏分辨率 = 屏幕上的像素，封顶 MAXDIM
      const rs = Math.min(1, MAXDIM / pw, MAXDIM / ph);
      const rw = Math.max(1, Math.round(pw * rs)), rh = Math.max(1, Math.round(ph * rs));
      ensureSize(rw, rh);
      // 光的方向（屏幕 → 原画坐标系）
      let ldx = 0.7, ldy = -0.7;
      if (o.light && o.light.dir != null) {
        const dv = o.light.dir;
        if (Array.isArray(dv)) { ldx = dv[0]; ldy = dv[1]; } else { ldx = Math.cos(dv); ldy = Math.sin(dv); }
      }
      {
        const ia = D / det, ib = -Bm / det, ic = -C / det, id = A / det;
        const ux = ia * ldx + ic * ldy, uy = ib * ldx + id * ldy, l = Math.hypot(ux, uy) || 1;
        ldx = ux / l; ldy = uy / l;
      }
      const post = postOf(o, mag, ldx, ldy, rw / pw, Hc / 720);
      renderGL(R, o, +o.t || 0, vx0, vy0, vx1, vy1, rw, rh, post);
      // 贴回 2D 画布
      g.save(); saved = true;
      if (axis) g.setTransform(1, 0, 0, 1, 0, 0);
      else g.setTransform(A, Bm, C, D, Ex, Fy);
      const al = o.alpha ?? 1;
      if (al < 1) g.globalAlpha *= clamp(al);
      if (o.mode) g.globalCompositeOperation = o.mode;
      g.imageSmoothingEnabled = true;
      if (axis) g.drawImage(cv, 0, 0, rw, rh, X0, Y0, pw, ph);
      else g.drawImage(cv, 0, 0, rw, rh, vx0, vy0, vx1 - vx0, vy1 - vy0);
      g.restore(); saved = false;
      R.last = now();
      lastDraw = R.last;
      const ms = now() - c0;
      stats.draws++; stats.lastMs = ms; stats.avgMs = stats.avgMs ? stats.avgMs * 0.95 + ms * 0.05 : ms;
      stats.canvas[0] = CW; stats.canvas[1] = CH;
      return true;
    } catch (err) {
      if (saved) { try { g.restore(); } catch (e2) { /* 无妨 */ } }
      if (opts.debug) console.warn('[keyart]', err);
      return false;
    }
  }

  /* ---------------------------------------------------------------- 锚点 */
  function anchors(key, o) {
    try {
      o = o || EMPTY;
      const R = rigs.get(key);
      const info = infoOf(key);
      if (!info) return null;
      const fr = framing(info, o, { cx: 0, cy: 0, cw: 1, ch: 1, lx0: 0, ly0: 0, kx: 1, k: 1 });
      const out = { k: fr.k };
      const live = R && R.rig && R.B;
      const t = +o.t || 0;
      if (live) pose(R, t, o, false);
      const P = live ? R.P : {};
      const turnPx = P.turnPx ?? 6, turnPxY = P.turnPxY ?? 3;
      const t0 = live ? R.B.turn0 : 0, t1 = live ? R.B.turn1 : 0;
      for (const name in info.anchors) {
        const [bone, x, y, dep] = info.anchors[name];
        let px = x + (dep || 0) * t0 * turnPx, py = y + (dep || 0) * t1 * turnPxY;
        if (live) {
          const bi = R.B.bi[bone] ?? 0, W = R.B.W, j = bi * 6;
          const qx = W[j] * px + W[j + 2] * py + W[j + 4], qy = W[j + 1] * px + W[j + 3] * py + W[j + 5];
          px = qx; py = qy;
        }
        out[name] = [fr.lx0 + fr.kx * px, fr.ly0 + fr.k * py];
      }
      // rig.anchors 里有、预设里没有的（例如 staffTip）
      if (live && R.rig.anchors) {
        for (const name in R.rig.anchors) {
          if (out[name]) continue;
          const a = R.rig.anchors[name], bi = R.B.bi[a.bone] ?? 0, W = R.B.W, j = bi * 6;
          const qx = W[j] * a.p[0] + W[j + 2] * a.p[1] + W[j + 4], qy = W[j + 1] * a.p[0] + W[j + 3] * a.p[1] + W[j + 5];
          out[name] = [fr.lx0 + fr.kx * qx, fr.ly0 + fr.k * qy];
        }
      }
      if (out.eyeL && out.eyeR) out.eyes = [(out.eyeL[0] + out.eyeR[0]) / 2, (out.eyeL[1] + out.eyeR[1]) / 2];
      if (!out.hands && out.hand) out.hands = out.hand;
      return out;
    } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------- 预模糊的立绘（背景板 / 柔光），一次算好 */
  /**
   * 预乘后的三次盒式模糊（≈ 高斯）；只在加载时对小图做一次。
   * th：只保留亮度高于 th 的部分（柔光只从亮处溢出，不会把暗部蒙上一层雾）
   * edge：四周按这个比例渐隐到透明（放大、平移后缓存图的边界不会露出一道硬边）
   */
  function blurCanvas(src, w, h, r, th, edge) {
    const q0 = src.getContext('2d', { willReadFrequently: true });
    const im = q0.getImageData(0, 0, w, h), dt = im.data, n = w * h;
    const A = new Float32Array(n * 4), T = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      let al = dt[i * 4 + 3] / 255;
      if (th) al *= sm(((0.299 * dt[i * 4] + 0.587 * dt[i * 4 + 1] + 0.114 * dt[i * 4 + 2]) / 255 - th) / (1 - th));
      A[i * 4] = dt[i * 4] * al; A[i * 4 + 1] = dt[i * 4 + 1] * al; A[i * 4 + 2] = dt[i * 4 + 2] * al; A[i * 4 + 3] = al * 255;
    }
    const iw = 1 / (2 * r + 1);
    const pass = (s, d2, len, cnt, step, stride) => {
      for (let l = 0; l < cnt; l++) {
        const base = l * stride;
        for (let ch = 0; ch < 4; ch++) {
          let acc = 0;
          for (let x = -r; x <= r; x++) acc += s[base + Math.min(len - 1, Math.max(0, x)) * step + ch];
          for (let x = 0; x < len; x++) {
            d2[base + x * step + ch] = acc * iw;
            acc += s[base + Math.min(len - 1, x + r + 1) * step + ch] - s[base + Math.max(0, x - r) * step + ch];
          }
        }
      }
    };
    for (let p = 0; p < 3; p++) { pass(A, T, w, h, 4, w * 4); pass(T, A, h, w, w * 4, 4); }
    const out = new ImageData(w, h), od = out.data;
    const mx = Math.max(1, (edge || 0) * w), my = Math.max(1, (edge || 0) * h);
    for (let i = 0; i < n; i++) {
      const al = A[i * 4 + 3];
      if (al > 0.5) { const k = 255 / al; od[i * 4] = A[i * 4] * k; od[i * 4 + 1] = A[i * 4 + 1] * k; od[i * 4 + 2] = A[i * 4 + 2] * k; }
      if (edge) { const x = i % w, y = (i / w) | 0; od[i * 4 + 3] = al * sm(Math.min(x, w - 1 - x) / mx) * sm(Math.min(y, h - 1 - y) / my); }
      else od[i * 4 + 3] = al;
    }
    const c = E.mk(w, h);
    c.getContext('2d').putImageData(out, 0, 0);
    return c;
  }
  /** 调色板：加权平均色、亮部、暗部、最饱和的点缀色（'r,g,b'） */
  function paletteOf(im) {
    const d = im.data, n = d.length / 4;
    const bins = [];
    let sr = 0, sg = 0, sb = 0, sa = 0;
    for (let i = 0; i < n; i += 2) {
      const a = d[i * 4 + 3];
      if (a < 160) continue;
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      sr += r; sg += g; sb += b; sa++;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      bins.push([0.299 * r + 0.587 * g + 0.114 * b, mx ? (mx - mn) / mx : 0, r, g, b]);
    }
    if (!sa) return { avg: '200,200,210', light: '245,240,240', dark: '40,36,44', accent: '230,120,120' };
    const avg = [sr / sa, sg / sa, sb / sa];
    const mean = (arr) => { let r = 0, g = 0, b = 0; for (const x of arr) { r += x[2]; g += x[3]; b += x[4]; } const k = arr.length || 1; return [r / k, g / k, b / k]; };
    bins.sort((x, y) => x[0] - y[0]);
    const q = Math.max(1, Math.floor(bins.length * 0.15));
    const dark = mean(bins.slice(0, q)), light = mean(bins.slice(-q));
    const bySat = bins.filter((x) => x[0] > 60 && x[0] < 235).sort((x, y) => y[1] - x[1]);
    const accent = mean(bySat.slice(0, Math.max(1, Math.floor(bySat.length * 0.05))));
    const s = (c) => c.map((v) => Math.round(v)).join(',');
    return { avg: s(avg), light: s(light), dark: s(dark), accent: s(accent) };
  }
  /**
   * 加载完成后：用静止姿势渲染整图（小尺寸）→ 两级模糊（背景板、柔光）+ 调色板；各常用构图也各做一张柔光。
   * 每张一个任务（中间让出主线程）；先做好的先能用。返回单个任务最长的毫秒数
   */
  async function makePlates(R) {
    const info = R.info, sz = 320, sc = sz / Math.max(info.w, info.h), tok = R.tok;
    const w = Math.max(8, Math.round(info.w * sc)), h = Math.max(8, Math.round(info.h * sc));
    const TH = 0.6, still = { ax: 0, ay: 0, x: 0, y: 0, t: 0, blink: 0, saccade: 0, sharpen: 0, wind: 0.2 };
    const yieldT = () => new Promise((r) => setTimeout(r, 0));
    let busy = 0;
    await yieldT();
    if (tok !== R.tok || !R.ready) return busy;
    let t0 = now();
    const c = E.mk(w, h), q = c.getContext('2d', { willReadFrequently: true });
    if (!draw(q, R.key, Object.assign({ crop: 'full', scale: sc }, still))) return busy;
    const pal = paletteOf(q.getImageData(0, 0, w, h));
    // 背景板：更小、更糊（一张 128 的图放大到全屏也只是色块）
    const w2 = Math.max(8, Math.round(w * 0.4)), h2 = Math.max(8, Math.round(h * 0.4));
    const c2 = E.mk(w2, h2);
    c2.getContext('2d').drawImage(c, 0, 0, w2, h2);
    const plate = { far: blurCanvas(c2, w2, h2, 4, 0, 0.2), soft: { full: { c: blurCanvas(c, w, h, 3, TH, 0.04), rect: [0, 0, info.w, info.h] } }, pal };
    R.plate = plate;
    busy = now() - t0;
    // 常用构图的柔光：只渲染那一块（320 宽），特写里柔光才跟得上轮廓
    for (const name of ['upper', 'bust', 'face', 'scene']) {
      const cr = info.crops[name];
      if (!cr) continue;
      await yieldT();
      if (tok !== R.tok || !R.ready) return busy;
      t0 = now();
      const k = 320 / cr[2], cw = 320, ch = Math.max(8, Math.round(cr[3] * k));
      const cc = E.mk(cw, ch), qq = cc.getContext('2d', { willReadFrequently: true });
      if (draw(qq, R.key, Object.assign({ crop: cr, scale: k }, still))) plate.soft[name] = { c: blurCanvas(cc, cw, ch, 3, TH, 0.04), rect: cr };
      busy = Math.max(busy, now() - t0);
    }
    return busy;
  }

  /* ---------------------------------------------------------------- 成片镜头 */
  /*
   * 调色预设：tint 正片叠底（颜色, 强度）· sat 饱和度 · contrast 对比度 · light 补光与轮廓光（dir 指向光源）
   * overlay 整个画面的柔光叠色 · leak 漏光颜色 · vig 暗角 · grain 颗粒 · bg 背景渐变 · bokeh 散景颜色 · bloom 高光溢出强度
   * 原则：人物身上只轻轻染色（官方原画本身的颜色要留住），情绪主要交给背景、光与前景
   */
  const GRADES = {
    none: { tint: null, sat: 1, contrast: 1, light: null, overlay: null, leak: null, vig: 0.35, grain: 0.035, bg: null, bokeh: '255,244,230', bloom: 0.35 },
    warm: { tint: ['#fff4ea', 0.18], contrast: 1.05, light: { color: '#ffd9a8', dir: [0.75, -0.66], rim: 0.75, wash: 0.08 }, overlay: ['#ffb070', 0.1, 'soft-light'], leak: '255,176,108', vig: 0.4, grain: 0.04, bg: [[0, '#2a1c1f'], [0.55, '#6d4a45'], [1, '#d8a888']], bokeh: '255,214,170', bloom: 0.45 },
    cool: { tint: ['#eef5ff', 0.18], contrast: 1.05, light: { color: '#d0e6ff', dir: [0.7, -0.7], rim: 0.7, wash: 0.06 }, overlay: ['#6aa0ff', 0.1, 'soft-light'], leak: '165,205,255', vig: 0.4, grain: 0.04, bg: [[0, '#101826'], [0.55, '#34496a'], [1, '#a8c4e8']], bokeh: '205,228,255', bloom: 0.4 },
    dream: { tint: ['#fff2f8', 0.14], contrast: 1.03, sat: 1.04, light: { color: '#ffd6ee', dir: [-0.62, -0.78], rim: 0.8, wash: 0.07 }, overlay: ['#ff8cc6', 0.1, 'soft-light'], leak: '255,150,210', vig: 0.38, grain: 0.04, bg: [[0, '#26142c'], [0.55, '#6a3a6e'], [1, '#e8a0c8']], bokeh: '255,205,236', bloom: 0.6 },
    ember: { tint: ['#fff1e8', 0.14], contrast: 1.08, light: { color: '#ff9a52', dir: [-0.5, 0.86], rim: 1, wash: 0.09 }, overlay: ['#ff6a30', 0.13, 'soft-light'], leak: '255,120,60', vig: 0.5, grain: 0.05, bg: [[0, '#0e0808'], [0.55, '#3a1510'], [1, '#9a3418']], bokeh: '255,160,90', bloom: 0.5 },
    night: { tint: ['#c2ccff', 0.34], sat: 0.88, contrast: 1.04, light: { color: '#a9c2ff', dir: [0.6, -0.8], rim: 0.9, wash: 0.04 }, overlay: ['#2a3a8a', 0.18, 'soft-light'], leak: '120,150,255', vig: 0.55, grain: 0.05, bg: [[0, '#060918'], [0.55, '#182048'], [1, '#48488a']], bokeh: '170,190,255', bloom: 0.45 },
    memory: { tint: ['#fff4e2', 0.3], sat: 0.55, contrast: 0.96, light: { color: '#fff0d6', dir: [0.7, -0.7], rim: 0.45, wash: 0.12 }, overlay: ['#d8b890', 0.18, 'soft-light'], leak: '255,222,172', vig: 0.5, grain: 0.07, bg: [[0, '#221b17'], [0.55, '#5a4a3e'], [1, '#d8c4a8']], bokeh: '255,236,210', bloom: 0.6 },
  };
  function gradeOf(v) {
    if (!v) return GRADES.none;
    if (typeof v === 'string') return GRADES[v] || GRADES.none;
    if (v._ka) return v;
    const b = GRADES[v.base] || GRADES.none;
    const o = Object.assign({}, b, v);
    o._ka = true;
    return o;
  }
  const PARAMS = ['look', 'gaze', 'tilt', 'nod', 'lean', 'cast', 'blush', 'mouth', 'smile', 'glow', 'wind', 'breath', 'sway'];
  const TIMED = { look: 1, gaze: 1, tilt: 1, nod: 1, lean: 1, cast: 1 };
  const sprites = new Map();
  /** 散景光斑精灵：柔边圆盘，边缘略亮（镜头的圆形光圈） */
  function bokehSprite(rgb) {
    let c = sprites.get('bk:' + rgb);
    if (c) return c;
    c = E.mk(96, 96);
    const q = c.getContext('2d'), gr = q.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, `rgba(${rgb},0.5)`); gr.addColorStop(0.7, `rgba(${rgb},0.58)`); gr.addColorStop(0.86, `rgba(${rgb},0.78)`);
    gr.addColorStop(0.94, `rgba(${rgb},0.3)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    q.fillStyle = gr; q.fillRect(0, 0, 96, 96);
    sprites.set('bk:' + rgb, c);
    return c;
  }
  function bokeh(g, t, P, rgb) {
    const spr = bokehSprite(P.rgb || rgb || '255,240,220');
    const size = P.size ?? 1, amt = P.a ?? 1, drift = P.drift ?? 14;
    E.field(g, t, {
      n: P.n ?? 12, every: P.every ?? 0.8, life: P.life ?? 9, seed: P.seed ?? 41, prewarm: true,
      make: (r) => ({ x: r(1) * (VW + 400) - 200, y: r(2) * (VH + 240) - 120, vx: (r(3) - 0.5) * 26 + drift, vy: (r(4) - 0.5) * 14 - 5, s: (46 + r(5) * 130) * size, a: 0.07 + r(6) * 0.16 }),
      draw: (q, p, age, k) => {
        const a = p.a * Math.sin(Math.PI * k) * amt;
        if (a < 0.004) return;
        q.globalAlpha = a; q.globalCompositeOperation = 'lighter';
        q.drawImage(spr, p.x + p.vx * age - p.s, p.y + p.vy * age - p.s, p.s * 2, p.s * 2);
        q.globalAlpha = 1; q.globalCompositeOperation = 'source-over';
      },
    });
  }
  /** 镜头关键帧 → 相机（设计坐标里看向 x, y，缩放 z，滚转 r） */
  function camOf(info, base, S0, kf, out) {
    let x = VW / 2, y = VH / 2, z = 1;
    if (kf && kf.crop) {
      const K = cropRect(info, kf.crop);
      if (K) {
        x = VW / 2 + (K[0] + K[2] / 2 - (base[0] + base[2] / 2)) * S0;
        y = VH / 2 + (K[1] + K[3] / 2 - (base[1] + base[3] / 2)) * S0;
        const SK = (kf.fit || (kf.crop === 'full' ? 'contain' : 'cover')) === 'contain' ? Math.min(VW / K[2], VH / K[3]) : Math.max(VW / K[2], VH / K[3]);
        z = SK / S0;
      }
    }
    out.x = x + ((kf && kf.x) || 0) * VW; out.y = y + ((kf && kf.y) || 0) * VH;
    out.z = z * ((kf && kf.z) || 1); out.r = (kf && kf.r) || 0;
    return out;
  }
  const CA = { x: 0, y: 0, z: 1, r: 0 }, CB = { x: 0, y: 0, z: 1, r: 0 };
  /**
   * shot(g, s, o) → boolean：见文件头
   */
  function shot(g, s, o) {
    o = o || EMPTY;
    const key = o.key;
    const R = rigs.get(key);
    const info = infoOf(key);
    const gp = gradeOf(o.grade);
    const t = s.t;
    const red = !!s.reduced;
    let ok = false;
    try {
      // 进度与相机
      const span = o.span;
      const dur = span ? span[1] - span[0] : s.dur || 1;
      const kOf = (lt) => easeOf(o.ease || 'inOut')(clamp((lt - (span ? span[0] : 0)) / Math.max(1e-3, dur)));
      const k = kOf(s.lt);
      const base = info ? cropRect(info, o.crop || 'bust') : [0, 0, VW, VH];
      const fit = o.fit || (o.crop === 'full' ? 'contain' : 'cover');
      const S0 = fit === 'contain' ? Math.min(VW / base[2], VH / base[3]) : Math.max(VW / base[2], VH / base[3]);
      camOf(info, base, S0, o.from, CA);
      camOf(info, base, S0, o.to || o.from, CB);
      const cam = { x: lerp(CA.x, CB.x, k), y: lerp(CA.y, CB.y, k), z: Math.exp(lerp(Math.log(CA.z), Math.log(CB.z), k)), r: lerp(CA.r, CB.r, k), sx: 0, sy: 0 };
      if (!red) {
        const hh = s.handheld((o.seed ?? 7) + 3, t, o.handheld ?? 3);
        cam.sx = hh.sx; cam.sy = hh.sy;
        cam.z *= 1 + (o.pulse ?? 0.5) * 0.006 * s.pulse(7);
      }
      // 传给 draw 的参数（from / to 里的表情、转头按同一进度插值；look 等做成时间函数，头发才有惯性）
      const p = {
        t, crop: 'full', ax: (base[0] + base[2] / 2) / (info ? info.w : 1), ay: (base[1] + base[3] / 2) / (info ? info.h : 1), x: VW / 2, y: VH / 2, scale: S0,
        eyes: o.eyes, blink: o.blink, seed: o.seed, windDir: o.windDir, saccade: o.saccade, flip: o.flip, sharpen: o.sharpen, sweep: o.sweep, alpha: o.alpha,
        tint: o.tint !== undefined ? o.tint : gp.tint, sat: o.sat ?? gp.sat, contrast: o.contrast ?? gp.contrast, light: o.light !== undefined ? o.light : gp.light,
      };
      const t0 = s.shot ? s.shot.t0 : t - s.lt;
      for (const name of PARAMS) {
        const fv = o.from && o.from[name], tv = o.to && o.to[name];
        if (fv == null && tv == null) { if (o[name] !== undefined) p[name] = o[name]; continue; }
        const A0 = fv != null ? fv : o[name] != null ? o[name] : tv, B0 = tv != null ? tv : A0;
        const at = (tt) => {
          const kk = kOf(tt - t0);
          if (Array.isArray(A0)) return [lerp(A0[0], B0[0], kk), lerp(A0[1], B0[1], kk)];
          return lerp(+A0 || 0, +B0 || 0, kk);
        };
        p[name] = TIMED[name] ? at : at(t);
      }
      const ready = !!(R && R.ready && info);
      const plate = ready ? R.plate : null;
      const pal = plate ? plate.pal : null;
      // 1) 背景
      const bg = o.bg === undefined ? 'blur' : o.bg;
      if (typeof bg === 'function') bg(g, s, cam);
      else if (bg) {
        const stops = Array.isArray(bg) ? bg : gp.bg || (pal ? [[0, `rgb(${pal.dark})`], [0.6, `rgb(${pal.avg})`], [1, `rgb(${pal.light})`]] : [[0, '#1a1620'], [1, '#6a5a70']]);
        const hl = pal ? pal.light : '255,240,230';
        // 缓存键由内容决定（影片常在 draw 里现写调色 / 渐变对象，每帧都是新对象）
        let ck = 'ka:bg:' + hl;
        for (let i = 0; i < stops.length; i++) ck += '|' + stops[i][0] + stops[i][1];
        g.drawImage(s.cache(ck, (q) => {
          const gr = q.createLinearGradient(0, 0, 0, VH);
          for (const [of, col] of stops) gr.addColorStop(of, col);
          q.fillStyle = gr; q.fillRect(0, 0, VW, VH);
          const rg = q.createRadialGradient(VW * 0.56, VH * 0.36, 0, VW * 0.56, VH * 0.36, VW * 0.62);
          rg.addColorStop(0, `rgba(${hl},0.32)`); rg.addColorStop(0.5, `rgba(${hl},0.1)`); rg.addColorStop(1, `rgba(${hl},0)`);
          q.fillStyle = rg; q.fillRect(0, 0, VW, VH);
        }), 0, 0, VW, VH);
        if (bg === 'blur' && plate && info) {
          // 立绘自身的模糊放大版（视差 0.35）：颜色与人物一致的「景深背景」
          E.layer(g, cam, 0.35, (q) => {
            const f = o.plateScale ?? 1.3, cx = base[0] + base[2] / 2, cy = base[1] + base[3] / 2;
            q.globalAlpha = o.plateAlpha ?? 0.7;
            q.drawImage(plate.far, VW / 2 - cx * S0 * f, VH / 2 - cy * S0 * f, info.w * S0 * f, info.h * S0 * f);
            q.globalAlpha = 1;
          });
        }
      }
      if (o.rays) s.kit.rays(g, t, Object.assign({ rgb: gp.leak || '255,240,220', alpha: 0.14 }, o.rays === true ? {} : o.rays));
      const dof = red ? 0 : o.dof ?? 0.5;
      if (dof > 0) E.layer(g, { x: VW / 2 + (cam.x - VW / 2) * 0.2, y: VH / 2 + (cam.y - VH / 2) * 0.2, z: 1 + (cam.z - 1) * 0.1 }, 1, (q) => bokeh(q, t, { n: Math.round(16 * dof), size: 0.45, a: 0.7, seed: 43 }, gp.bokeh));
      if (o.under) E.layer(g, cam, 1, (q) => o.under(q, s, cam));
      // 2) 立绘
      if (ready) {
        E.layer(g, cam, 1, (q) => {
          ok = draw(q, key, p);
          if (ok) {
            const bl = o.bloom ?? gp.bloom ?? 0.4;
            const soft = plate && (plate.soft[typeof o.crop === 'string' ? o.crop : ''] || plate.soft.full);
            if (bl > 0 && soft) {
              // 高光溢出：预先按亮度取出亮部并模糊好的同一构图，以滤色叠一层
              const r = soft.rect, cx = base[0] + base[2] / 2, cy = base[1] + base[3] / 2;
              q.globalCompositeOperation = 'screen';
              q.globalAlpha = bl * (1 + 0.25 * (o.pulse ?? 0.5) * s.pulse(5));
              q.drawImage(soft.c, VW / 2 + (r[0] - cx) * S0, VH / 2 + (r[1] - cy) * S0, r[2] * S0, r[3] * S0);
              q.globalAlpha = 1; q.globalCompositeOperation = 'source-over';
            }
            if (o.over) o.over(q, s, anchors(key, p));
          }
        });
      }
      if (!ok && o.fallback) { try { o.fallback(g, s); } catch (e) { /* 无妨 */ } }
      // 3) 前景
      if (o.particles) {
        const list = Array.isArray(o.particles) ? o.particles : [o.particles];
        for (const it of list) {
          const P0 = typeof it === 'string' ? { type: it } : it;
          if (!P0 || !P0.type) continue;
          const dep = P0.depth ?? 1.25;
          const pc = { x: VW / 2 + (cam.x - VW / 2) * 0.25 * dep, y: VH / 2 + (cam.y - VH / 2) * 0.25 * dep, z: 1 + (cam.z - 1) * 0.12 * dep, r: cam.r * 0.5, sx: cam.sx * dep, sy: cam.sy * dep };
          E.layer(g, pc, 1, (q) => { if (P0.type === 'bokeh') bokeh(q, t, P0, gp.bokeh); else s.kit.particles(q, t, P0.type, red ? Object.assign({}, P0, { n: Math.round((P0.n || 40) * 0.5) }) : P0); });
        }
      }
      if (dof > 0) E.layer(g, { x: VW / 2 + (cam.x - VW / 2) * 0.45, y: VH / 2 + (cam.y - VH / 2) * 0.45, z: 1 + (cam.z - 1) * 0.3 }, 1, (q) => bokeh(q, t, { n: Math.round(7 * dof), size: 1.25, a: 0.8 + 0.4 * s.pulse(6) * (o.pulse ?? 0.5), seed: 47, drift: 22 }, gp.bokeh));
      // 4) 后期
      const lk = o.leak === undefined ? !!gp.leak : o.leak;
      if (lk) s.post.leak(g, t, Object.assign({ x: VW * 0.9, y: VH * 0.08, r: 950, rgb: gp.leak || '255,190,140', a: 0.3 }, lk === true ? {} : lk));
      if (gp.overlay) s.post.grade(g, gp.overlay[0], gp.overlay[1], gp.overlay[2]);
      const vg = o.vignette ?? gp.vig;
      if (vg > 0) s.post.vignette(g, vg);
      const gn = o.grain ?? gp.grain;
      if (gn > 0) s.post.grain(g, t, gn);
      if (o.letterbox) s.post.letterbox(g, o.letterbox);
      if (o.fade) {
        const fi = o.fade[0] || 0, fo = o.fade[1] || 0;
        if (fi > 0 && s.lt < fi) s.post.fill(g, '#000', 1 - E.ease.sine(clamp(s.lt / fi)));
        if (fo > 0 && s.dur - s.lt < fo) s.post.fill(g, '#000', 1 - E.ease.sine(clamp((s.dur - s.lt) / fo)));
      }
    } catch (e) {
      if (opts.debug) console.warn('[keyart.shot]', e);
    }
    return ok;
  }

  /* ---------------------------------------------------------------- 其它接口 */
  /**
   * 释放显存。默认推迟 1.5 秒：播放器换片时先 release 旧片、紧接着准备新片——新片若用到同一张图
   * （draw / load 会取消待释放），就不必重新上传。now = true 立即释放
   */
  let relT = 0, shrinkAt = 0;
  function shrink() {
    if (!gl) return;
    if (fbo && glLive()) { gl.deleteFramebuffer(fbo); gl.deleteTexture(fboTex); }
    fbo = null; fboTex = null; fboW = fboH = 0;
    cv.width = cv.height = 1; CW = CH = 1;
    stats.canvas[0] = stats.canvas[1] = 1;
  }
  function flushRelease() {
    relT = 0;
    const t = now();
    let pending = false;
    for (const R of rigs.values()) {
      if (!R.dropAt) continue;
      if (R.dropAt <= t) { R.dropAt = 0; dropGPU(R); } else pending = true;
    }
    if (shrinkAt && shrinkAt <= t) { shrinkAt = 0; if (![...rigs.values()].some((R) => R.ready || R.loading)) shrink(); }
    if (pending || shrinkAt) relT = setTimeout(flushRelease, 300);
  }
  function release(key, immediate) {
    try {
      const list = key ? [rigs.get(key)].filter(Boolean) : [...rigs.values()];
      if (immediate === true) {
        for (const R of list) { R.dropAt = 0; dropGPU(R); }
        if (!key) { shrinkAt = 0; shrink(); }
        return;
      }
      const at = now() + 1500;
      for (const R of list) if (R.ready || R.loading) R.dropAt = at;
      if (!key) shrinkAt = at;
      if (!relT) relT = setTimeout(flushRelease, 1600);
    } catch (e) { /* 无妨 */ }
  }
  /** 关键帧路径：[[t, [x, y]], …]（绝对秒）→ (t) => [x, y]；ease 为段内缓动 */
  function path(keys, ease = 'inOut') {
    const K = (keys || []).slice().sort((a, b) => a[0] - b[0]), ef = easeOf(ease);
    return (t) => {
      if (!K.length) return [0, 0];
      if (t <= K[0][0]) return K[0][1];
      for (let i = 1; i < K.length; i++) {
        if (t < K[i][0]) {
          const a = K[i - 1], b = K[i], k = ef((t - a[0]) / Math.max(1e-6, b[0] - a[0]));
          return [lerp(a[1][0], b[1][0], k), lerp(a[1][1], b[1][1], k)];
        }
      }
      return K[K.length - 1][1];
    };
  }
  const API = {
    credit: CREDIT,
    keys: Object.keys(INFO),
    grades: GRADES,
    opts,
    stats,
    supported: () => initGL(),
    load,
    ready: (key) => { const R = rigs.get(key); return !!(R && R.ready && glLive() && R.gen === gen); },
    draw,
    shot,
    anchors,
    crops: (key) => { const i = infoOf(key); return i ? JSON.parse(JSON.stringify(i.crops)) : null; },
    info: (key) => {
      const i = infoOf(key), R = rigs.get(key);
      if (!i) return null;
      return { w: i.w, h: i.h, label: i.label, crops: JSON.parse(JSON.stringify(i.crops)), anchors: Object.keys(i.anchors), ready: API.ready(key), palette: R && R.plate ? Object.assign({}, R.plate.pal) : null };
    },
    palette: (key) => { const R = rigs.get(key); return R && R.plate ? Object.assign({}, R.plate.pal) : null; },
    path,
    release,
    /** 调试用（实验页）：内部状态 */
    _rig: (key) => rigs.get(key) || null,
    _gl: () => gl,
  };
  Object.defineProperty(stats, 'gpuMB', { enumerable: true, get: () => Math.round([...rigs.values()].reduce((s2, R) => s2 + (R.ready ? R.bytes : 0), 0) / 1048576) });
  Object.defineProperty(stats, 'keys', { enumerable: true, get: () => [...rigs.values()].filter((R) => R.ready).map((R) => R.key) });
  E.keyart = API;
})();
