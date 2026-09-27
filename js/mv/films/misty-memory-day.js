/* =========================================================
 * 影像 IV（番外）· 晴日之约 —— Misty Memory (Day Version)
 * 本页原创的同人 MV（Canvas 2D 实时渲染；画面是时间 t 的纯函数），与官方无关。
 *
 * 故事（「雾中之忆」的白天；与番外 V「汽水」是汐斯塔同一天的两个视角）
 *   清晨的海上，她读着凯勒老师的信：汐斯塔的夏天到了，火山博物馆就要开馆，来帮帮忙吧——老火山也在等你。
 *   船靠岸：青绿色的海、晒得发亮的白房子、棕榈与海鸥。博物馆开馆日，凯勒老师在门口等她。
 *   粉色的小羊一只接一只冒了出来——只有她看得见：游客们只看见她对着空气训话，手里的冰淇淋却一口一口地没了。
 *   小羊们聚成一朵巨大的粉色羊形云：多利提出一笔交易——带来北风、种子和羊毛，就把她在找的东西给她。
 *   北风：灯塔崖上的风车田、找不着北的风向标、羊形风筝；她把一阵北风装进了空瓶子。
 *   种子：凯勒老师花房里的预警花种子，被小羊叼走、在集市上一路追、被啃掉了一半；剩下的种进了博物馆门前的花坛。
 *   羊毛：毛线店、棉花糖、蒲公英、云……小羊们献上的“羊毛”没有一样是对的。傍晚的节日准备被小羊们搅得一团糟。
 *   黄昏的栈桥上，海风凉了，她裹紧母亲的外套，忽然明白：要找的“羊毛”，一直穿在身上。多利笑了，小羊们围着她跳舞。
 *   入夜，灯一盏盏亮起，海湾上放起羊形的烟花；她和凯勒老师在博物馆的露台上碰了碰汽水瓶。
 *   尾声：最后的烟花散了。门被轻轻敲响——门外没有人，只有一只写着 SIESTA 的木箱，在嗡嗡地冒着泡。
 *   她把箱子拖进标本室的角落，坐下来整理标本，打了个哈欠，趴在桌上……（接「雾中之忆」的开头）
 *
 * 连续性：博物馆的立面、标本室、书桌与台灯、SIESTA 货箱、汽水瓶、外套的画法都照「雾中之忆」重画（不引用它的代码）。
 * 结构：镜头边界对齐小节线（D[i] = 第 i 小节的起点；≈104.86 BPM，一小节 ≈2.29s），各段能量见 assets/music/misty-memory-day.json。
 * 性能：静态大图层走自带的 LRU 位图缓存（按分辨率区分、总量有上限，切镜头前预热下一个镜头）；
 *       小羊用角色库画好的精灵图；所有粒子 / 摆动 / 跳跃都由 t 解析地算出来；film.release() 放掉全部缓存。
 * ========================================================= */
(() => {
  'use strict';
  const E = window.MVE;
  if (!E) return;
  const { VW, VH, TAU, clamp, lerp, ease, hash, wobble } = E;
  const PI = Math.PI;
  const fract = (x) => x - Math.floor(x);
  const sst = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  /** 梯形窗：a→b 升起，c→d 落下 */
  const win = (x, a, b, c, d) => Math.min(sst(a, b, x), 1 - sst(c, d, x));
  const pick = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

  /* 小节线（assets/music/misty-memory-day.json 的 downbeats；≈104.86 BPM，一小节 ≈2.29s） */
  const D = [0.565, 2.848, 5.184, 7.467, 9.749, 12.032, 14.304, 16.576, 18.88, 21.152, 23.445, 25.717, 27.851, 30.037, 32.331, 34.613, 36.896, 39.179, 41.461, 43.755, 46.037, 48.32, 50.603, 52.896, 55.179, 57.461, 59.744, 62.037, 64.32, 66.603, 68.896, 71.296, 73.685, 76.043, 78.325, 80.608, 82.891, 85.184, 87.477, 89.728, 92.011, 94.304, 96.587, 98.88, 101.184, 103.456, 105.728, 108.021, 110.293, 112.597, 114.869, 117.163, 119.445, 121.739, 124.043, 126.325, 128.608, 130.891, 133.173, 135.456, 137.749, 140.032, 142.315, 144.587, 146.656, 148.896, 151.179, 153.461, 155.755, 158.037, 160.32, 162.603, 164.896, 167.179, 169.461, 171.744, 174.037, 176.32, 178.603, 180.896, 183.179, 185.461, 187.755, 190.037, 192.32, 194.613, 196.896, 199.179, 201.461, 203.744, 206.037, 208.32, 210.603, 212.896, 215.179, 217.461, 219.744, 222.037, 224.32, 226.613, 228.885, 231.179, 233.461, 235.755, 238.037, 240.331, 242.603, 244.896, 247.179, 249.461, 251.755, 254.037, 256.32, 258.603, 260.885, 263.179, 265.461, 267.755, 270.037, 272.309, 274.603, 276.907, 279.189, 281.472];
  const BEAT = 60 / 104.86;
  const DUR = 283.429;

  const cast = (g, who, o) => { if (E.cast && E.cast.draw) E.cast.draw(g, who, o); };
  /*
   * 后期工具箱（MVE.finish，needs: ['finish']）：有它时由片级 overlay 统一做成片（辉光 + 分段调色 + 漏光 + 暗角 + 颗粒），
   * 镜头里原来的暗角就不再叠第二层；没有它（加载失败 / 被关掉）时一切照旧
   */
  const FIN = () => { const F = E.finish; return F && F.enabled !== false ? F : null; };
  function vig(g, s, a) { if (!FIN()) s.post['vignette'](g, a); }
  /** 镜头里的电影黑边：有后期工具箱时改由 overlay 在调色之后统一画（否则黑边会被调色抬成灰蓝） */
  function lbox(g, s, a) { if (!FIN()) s.post['letterbox'](g, a); }
  // 帧戳：镜头画的时候登记“这一帧里太阳在画面哪里 / 这一帧是官方立绘镜头”，片级 overlay 读同一个戳
  let FST = 0;
  const SUNP = { st: -1, x: 0, y: 0, a: 0 };
  let KAST = -1;
  /*
   * 官方 Q 版小人（MVE.sd，needs: ['sd']）：阿黛尔用游戏里的纯烬基建小人（站 Relax / 走跑 Move / 坐 Sit / 挥手 Interact / 背面 Idle）。
   * 手绘版里官方小人演不了的手势，在这里统一“改戏”成它能演的（用户的决定：手绘小人太粗糙）：
   *   指 / 叉腰 / 捂脸 / 想 / 捧着 / 递 / 鞠躬 / 擦眼睛 / 手搭凉棚 → 站着（Relax）；举高 / 欢呼 / 转圈 / 拍手 → 挥手（Interact）；
   *   回头看的背影（turn）→ 作战背面 Idle；跪 / 蹲 / 坐地上 → 坐（镜头里给她一个座：木箱、台阶、长椅）；
   *   手里拿的东西（手提箱、甜筒、瓶子、种子袋、风筝线、卡片、天灯）由影片画在 anchors().handN 上。
   * 姿势按镜头整段统一决定，同一个镜头里不会一会儿官方小人、一会儿手绘版（sd.js 也会等到下一个镜头才换上中途加载好的模型）。
   * 官方小人不可用（?sd=off / 没有 WebGL）时，一切照手绘版原来的戏演。
   */
  const SDON = () => { const S = E.sd; try { return !!(S && S.enabled !== false && (!S.supported || S.supported())); } catch (e) { return false; } };
  const POSE_SD = {
    hold: 'stand', point: 'stand', hips: 'stand', think: 'stand', cover: 'stand', clasp: 'stand', shade: 'stand', bow: 'stand', wipe: 'stand',
    reach: 'stand', crouch: 'stand', talk: 'stand', pout: 'stand', listen: 'stand', 'look-up': 'look-up', stand: 'stand', idle: 'stand',
    'hold-up': 'wave', 'reach-up': 'wave', cheer: 'wave', twirl: 'wave', clap: 'wave', wave: 'wave', joy: 'wave',
    walk: 'walk', run: 'run', jump: 'jump', sit: 'sit', 'sit-ground': 'sit', kneel: 'sit', dig: 'sit', write: 'sit', sleep: 'sit',
  };
  const SD_PROP = { staff: 1, satchel: 1, backpack: 1, bag: 1, stone: 1 };
  function sdo(o) {
    if (!o || o.sd === false || o.crop || !SDON()) return o;
    const q = Object.assign({}, o);
    const p = o.pose || 'stand';
    if (p === 'turn') { q.pose = 'stand'; q.view = 'back'; delete q.turn; }
    else if (POSE_SD[p]) q.pose = POSE_SD[p];
    else q.pose = 'stand';
    if (q.pose === 'sit') { if (q.view === 'back3' || q.view === 'back') delete q.view; delete q.desk; delete q.headPose; }
    if (q.pose !== 'stand' && q.view === 'back3') delete q.view;
    if (q.view === 'back3') q.view = 'back';
    delete q.arms; delete q.legs; delete q.aim;
    if (q.pose !== 'jump') delete q.air;
    const props = [].concat(o.prop || []).filter((x) => SD_PROP[x]);
    if (props.length) q.prop = props.length === 1 ? props[0] : props; else delete q.prop;
    return q;
  }
  /**
   * 换姿势时交叉淡化（官方小人，js/mv/sd.js 的 mixFrom / mixK；手绘版忽略）：在 [t0, t0 + d] 秒里从 from 姿势过渡到 o 的姿势。
   * 官方小人从走换成站、从站换成挥手时不再一帧硬切（游戏里切动作也有 0.2 秒左右的过渡）
   */
  function mixIn(o, from, t0, d, t) {
    if (!(t >= t0 && t < t0 + d)) return o;
    const f = typeof from === 'string' ? { pose: from } : from;
    return Object.assign(o, { mixFrom: Object.assign({}, f, { pose: POSE_SD[f.pose] || 'stand' }), mixK: sst(t0, t0 + d, t) });
  }
  /**
   * 官方小人“举起来”的东西（种子袋、天灯）放在哪：官方的挥手（Interact）只把一只手伸到身侧，没有举过头顶的动作——
   * 放在头顶上方、稍微偏向伸出去的那只手（handF）。旧写法挂在近处那只手（handN）上：那只手就在下巴底下，纸袋 / 天灯正好盖住脸
   */
  function liftAt(o, fb) {
    try { const A = E.cast.anchors('adele-alter', sdo(Object.assign({ outfit: 'coat' }, o))); if (A && A.top && A.handF) return [lerp(A.top[0], A.handF[0], 0.35), A.top[1] - 6]; } catch (e) { /* 用估计值 */ }
    return fb;
  }
  /** 角色身上的关键点（角色库提供 anchors；没有时用估计值 fb）；阿黛尔按“改过戏”的姿势取（道具要贴在官方小人的手上） */
  function anchor(who, o, key, fb) {
    try { if (E.cast && E.cast.anchors) { const A = E.cast.anchors(who, who === 'adele-alter' ? sdo(Object.assign({ outfit: 'coat' }, o)) : o); if (A && A[key]) return A[key]; } } catch (e) { /* 用估计值 */ }
    return fb;
  }
  /** 推荐的相对身高（卡提亚 = 1） */
  const scaleOf = (who, fb) => (E.cast && E.cast.meta && E.cast.meta[who] && E.cast.meta[who].scale) || fb;
  /** 凯勒相对阿黛尔（纯烬）的身高比 */
  const KH = () => scaleOf('keller', 0.97) / scaleOf('adele-alter', 0.84);
  /** 走路不打滑的横向速度（像素 / 秒） */
  const gaitSpeed = (who, o, fb) => { try { if (E.cast && E.cast.gait) return E.cast.gait(who, o).speed || fb; } catch (e) { /* 估计 */ } return fb; };
  /**
   * 反过来：想以 v 像素 / 秒移动时，步频倍数 speed 该是多少（脚底不打滑）
   * 路人（大尺寸时用完整的人物骨架）按人类的步幅估算
   */
  function stepRate(who, h, v, run) {
    const w = who === 'crowd' ? 'adele-alter' : who;
    const base = gaitSpeed(w, { h, pose: run ? 'run' : 'walk', speed: 1 }, (run ? 0.78 : 0.27) * h);
    return clamp(Math.abs(v) / Math.max(1, base), 0.3, 3);
  }
  /** 脚下的一团软阴影 */
  const shadowSpr = () => spr('shadow', 128, 32, (q) => { q.scale(1, 0.25); q.fillStyle = rg(q, 64, 64, 0, 64, [[0, 'rgba(40,50,80,1)'], [0.55, 'rgba(40,50,80,0.55)'], [1, 'rgba(40,50,80,0)']]); q.fillRect(0, 0, 128, 128); });
  function groundShadow(g, x, y, w, a) { if (a <= 0.01) return; withAlpha(g, a, (q) => q.drawImage(shadowSpr(), x - w, y - w * 0.16, w * 2, w * 0.32)); }
  /** 阿黛尔（纯烬）：默认穿外套、脚下有影子 */
  function adele(g, o) {
    if (o.shadow !== false && !o.sil) groundShadow(g, o.x, o.shadowY ?? o.y, (o.h || 300) * 0.27, (o.shadowA ?? 0.22) * (o.alpha ?? 1));
    cast(g, 'adele-alter', sdo(Object.assign({ outfit: 'coat' }, o, { shadow: false })));
  }
  /*
   * 官方剧情立绘做的“人物剪纸”（MVE.sd.card）：凯勒老师（用户选的：对话与近景用她的官方立绘，10 种表情）、多利。
   * 每个镜头开头决定一次用不用（那时图已经加载好才用），同一个镜头里不会从手绘突然换成立绘
   */
  const KEXPR = [1, 2, 3, 4, 9];
  const CARDDEC = new Map();
  function cardOn(s, key) {
    const S = E.sd;
    if (!S || !S.card || S.enabled === false) return false;
    const id = ((s.shot && s.shot.id) || '') + '|' + key, now = performance.now();
    let d = CARDDEC.get(id);
    if (!d || now - d.at > 1500) {
      let ready = false;
      try { const info = S.card.info(key); ready = !!(info && info.ready); if (!ready) S.card.load(key, key === 'keller' ? KEXPR : 1); } catch (e) { ready = false; }
      d = { on: ready };
    }
    d.at = now; CARDDEC.set(id, d);
    return d.on;
  }
  /*
   * 客串的官方小人（汐斯塔街上的人，全是那个夏天在汐斯塔的《火山旅梦》活动干员）：同样在镜头开头决定一次用不用。
   * 雪雉（休闲街上开杂货铺——毛线铺的店主就是她）、琳琅诗怀雅、苍苔、锡兰（夏装）。全片模型 ≤ 8 个
   */
  const CAMEOS = ['char_383_snsant/build', 'char_1033_swire2/build', 'char_4106_bryota/build', 'char_348_ceylon_summer_13/build'];
  const CAMEO = CAMEOS[0];
  const POSE_INTERACT = { cheer: 1, clap: 1, point: 1, 'reach-up': 1, 'hold-up': 1, wave: 1, reach: 1, cover: 1, joy: 1 };
  /**
   * 手绘路人 → 官方客串小人：o 是原来 person() 的选项（x, y, h, pose, flip, t, speed…），k 选第几个模型；
   * 姿势：walk → Move（按步速反推播放速度，脚底不打滑）、指 / 拍手 / 举手 / 捂嘴 → Interact、坐 → Sit、其余 → Relax。
   * 屏幕上矮于约 60 像素的远景小人，仍用手绘剪影
   */
  function townsfolk(q, s, o, k = 0) {
    const key = CAMEOS[((k % CAMEOS.length) + CAMEOS.length) % CAMEOS.length], h = o.h || 300;
    let big = true;
    try { const M = q.getTransform(), sc = Math.hypot(M.a, M.b) / (q.canvas.width / VW); big = h * sc >= 60; } catch (e) { /* 按大的画 */ }
    if (big && sdOn(s, key)) {
      const pose = o.pose || 'stand';
      const anim = o.anim || (pose === 'walk' || pose === 'run' ? 'Move' : POSE_INTERACT[pose] ? 'Interact' : pose === 'sit' ? 'Sit' : 'Relax');
      let speed = 1;
      if (anim === 'Move') {
        const v = o.walkV || gaitSpeed('crowd', { h, pose: 'walk', speed: o.speed || 1 }, 0.3 * h);
        try { const G = E.sd.gait(key, { h: h * 0.94 }); if (G && G.speed > 1) speed = v / G.speed; } catch (e) { /* 默认 */ }
      }
      if (o.shadow !== false) groundShadow(q, o.x, o.y, h * 0.25, 0.17 * (o.alpha ?? 1));
      // 相位只跟“这是谁”有关（seed / 第几个模型），不能跟位置有关：走路的人 x 每帧都在变，
      // 旧写法 hash(…, round(x)) 让动画时间每帧随机跳 0～3 秒（客串干员“抽搐”）
      const ph = hash(k * 13 + 7, (o.seed ?? 0) + 101, 3) * 3;
      const so = { x: o.x, y: o.y, h: h * 0.94, flip: o.flip, t: o.t ?? s.t, anim, speed, phase: ph, alpha: o.alpha, seat: o.seat, sil: o.sil, rim: o.rim };
      // 换动作时交叉淡化（mixIn 给的 mixFrom / mixK）：站 → 鼓掌 / 欢呼不再一帧硬切
      if (o.mixFrom && o.mixK < 1) {
        const fp = o.mixFrom.pose || 'stand', fa = fp === 'walk' || fp === 'run' ? 'Move' : POSE_INTERACT[fp] || fp === 'wave' ? 'Interact' : fp === 'sit' ? 'Sit' : 'Relax';
        if (fa !== anim) { so.from = { anim: fa, t: so.t, speed: fa === 'Move' ? speed : 1, phase: ph }; so.to = { anim, t: so.t, speed, phase: ph }; so.k = o.mixK; }
      }
      if (E.sd.draw(q, key, so)) return true;
    }
    person(q, o);
    return false;
  }
  function sdOn(s, key) {
    const S = E.sd;
    if (!S || !S.ready || !SDON()) return false;
    const id = ((s.shot && s.shot.id) || '') + '|sd|' + key, now = performance.now();
    let d = CARDDEC.get(id);
    if (!d || now - d.at > 1500) { let r = false; try { r = !!S.ready(key); if (!r) S.load(key); } catch (e) { r = false; } d = { on: r }; }
    d.at = now; CARDDEC.set(id, d);
    return d.on;
  }
  /*
   * [v3] 凯勒老师 / 多利：官方剧情立绘的分层绑定（MVE.keyart：眨眼、转头、头发与衣摆随风、官方差分的表情与嘴型、镜片反光）。
   * 与立绘剪纸一样，每个镜头开头决定一次用不用（已上传显卡才用）；没准备好 → 立绘剪纸 → 剪影
   */
  const RIGDEC = new Map();
  function rigOn(s, key) {
    const K = E.keyart;
    if (!K || !K.ready) return false;
    const id = ((s.shot && s.shot.id) || '') + '|rig|' + key, now = performance.now();
    let d = RIGDEC.get(id);
    if (!d || now - d.at > 1500) { d = { on: !!K.ready(key) }; if (!d.on && K.load) K.load(key, 0); }
    d.at = now; RIGDEC.set(id, d);
    return d.on;
  }
  /** 与立绘剪纸同一块构图（原画像素）：upper = 膝上，full = 整个人（脚底在底边） */
  const KR_CROP = { upper: [226, -20, 572, 635], bust: [347, -20, 332, 369], full: [330, 0, 330, 1004] };
  /** 手绘版的表情名 → 官方差分编号（1 平常 2 闭眼 3 皱眉张嘴 4 担心 5 柔和 6 严肃 7 思索 8 微笑 9 眯眼笑 10 温和） */
  const KEX = { laugh: 9, smile: 8, surprise: 4, talk: 8, neutral: 1, think: 7, closed: 2, content: 10, sad: 5 };
  /** 说话的嘴型：spans 为绝对秒 */
  const talkK = (spans, seed) => (E.keyart && E.keyart.talk ? E.keyart.talk(spans, { seed }) : 0);
  /** 绑定版凯勒：o 同立绘剪纸（x, y 构图块底边中点，h，crop，expr，flip，light，alpha）+ look / mouth / glint / tilt / rim */
  function kellerRig(q, s, o) {
    const K = E.keyart;
    if (!K) return false;
    const L = o.light;
    return !!K.draw(q, 'keller', {
      t: s.t, crop: KR_CROP[o.crop] || (Array.isArray(o.crop) ? o.crop : KR_CROP.upper), x: o.x, y: o.y, h: o.h, ax: o.ax ?? 0.5, ay: 1,
      flip: !!o.flip, alpha: o.alpha, expr: o.expr, xfade: 0.25, look: o.look, mouth: o.mouth, glint: o.glint, tilt: o.tilt, nod: o.nod,
      wind: o.wind ?? 0.2, windDir: o.windDir, tint: Array.isArray(L) ? L : L ? [L.color || '#ffe8d0', L.amount ?? 0.3] : o.tint, light: o.rim, sat: o.sat,
    });
  }
  /** 凯勒老师：绑定 → 立绘剪纸（o: { x, y 构图块底边中点, h, crop, expr, flip, light, alpha }）→ 手绘替代（fb：剪影） */
  function kellerCard(q, s, o, fb) {
    if (rigOn(s, 'keller') && kellerRig(q, s, o)) return true;
    if (cardOn(s, 'keller') && E.sd.card(q, 'keller', Object.assign({ t: s.t, breath: 1 }, o, { expr: Array.isArray(o.expr) ? o.expr.map((e) => [e[0], e[1] === 8 || e[1] === 10 ? 1 : e[1]]) : o.expr }))) return true;
    if (fb) fb(q);
    return false;
  }
  /** 手里提着的东西（官方小人不带手绘道具：影片画在 handN 上）——手提箱 */
  function suitcaseAt(q, s, o, a = 1) {
    if (!SDON()) return; // 手绘版自己画箱子
    const hp = anchor('adele-alter', o, 'handN', [o.x + (o.flip ? -1 : 1) * o.h * 0.12, o.y - o.h * 0.35]);
    const w = o.h * 0.3, h = w * 110 / 120;
    const c = LC(s, 'suitcase', 120, 110, suitcaseArt, 1.2);
    q.save(); q.translate(hp[0], hp[1] - h * 0.06); q.rotate(Math.sin((o.t || 0) * 6.2) * 0.04 * (o.pose === 'walk' ? 1 : 0));
    if (a < 1) q.globalAlpha *= a;
    q.drawImage(c, -w * 0.5, 0 - h * 0.05, w, h);
    q.restore();
  }
  /**
   * 凯勒老师（远景，整个人；x, y 脚底，h 身高）：[v3] 分层绑定（站姿；o.rig = { expr, look, mouth, glint, flip, rim, light } 按镜头给）
   * → 立绘剪纸（整身）→ 剪影。手绘的脸已经不画了；o.pose 等手绘参数只在剪影里用
   */
  function keller(g, o, s) {
    const R = o.rig || {}, a = o.alpha ?? 1;
    const expr = R.expr ?? KEX[o.expr] ?? 1;
    if (s && !o.sil) {
      const rig = rigOn(s, 'keller');
      if (rig || cardOn(s, 'keller')) {
        if (o.shadow !== false) groundShadow(g, o.x, o.y, (o.h || 300) * 0.25, 0.2 * a);
        if (rig && kellerRig(g, s, { crop: 'full', ax: 0.545, x: o.x, y: o.y + (o.h || 300) * 0.004, h: (o.h || 300) * 1.004, alpha: a, flip: R.flip, expr, look: R.look, mouth: R.mouth, glint: R.glint, tilt: R.tilt, rim: R.rim, light: R.light, wind: R.wind })) return;
        if (E.sd.card(g, 'keller', { t: s.t, crop: 'full', x: o.x, y: o.y + (o.h || 300) * 0.02, h: (o.h || 300) * 1.02, flip: R.flip, alpha: a, breath: 1, expr: typeof expr === 'number' && [1, 2, 3, 4, 9].includes(expr) ? expr : 1, light: R.light })) return;
      }
    }
    // 官方立绘都不可用：逆光的剪影（不画手绘的脸）
    cast(g, 'keller', Object.assign({}, o, { shadow: false, sil: o.sil || '#3c3650' }));
  }
  /** 手绘路人（只给远景的小剪影、以及官方小人不可用时的替代）；近一点的路人用 townsfolk() */
  function person(g, o) {
    if (o.shadow !== false && !o.sil && (o.h || 0) > 60) groundShadow(g, o.x, o.y, (o.h || 300) * 0.24, 0.16 * (o.alpha ?? 1));
    cast(g, 'crowd', Object.assign({}, o, { shadow: false }));
  }

  /* =========================================================
   * 缓存
   * ========================================================= */
  // 大图层：按分辨率 k 区分，最近最少使用的先丢（上限约 12 个整屏；切走时 release() 全部释放）
  const LRU = new Map();
  let lruPx = 0, maxK = 0; // maxK：见过的最大分辨率系数（海报 / 缩略图这类小渲染器不会把主播放器的缓存挤掉）
  function lcBuild(ck, w, h, fn, k, sk) {
    const c = E.mk(w * k, h * k);
    const q = c.getContext('2d');
    q.setTransform(k, 0, 0, k, 0, 0);
    try { fn(q, k); } catch (e) { if (!lcBuild.warned) { lcBuild.warned = true; console.warn('[MV day] layer', ck, e); } }
    LRU.set(ck, c);
    lruPx += c.width * c.height;
    if (sk > maxK) maxK = sk;
    const max = 12 * VW * VH * maxK * maxK;
    for (const [kk, cc] of LRU) {
      if (lruPx <= max || kk === ck) break;
      LRU.delete(kk); lruPx -= cc.width * cc.height; cc.width = cc.height = 1;
    }
    return c;
  }
  // 预热：切镜头前约 2.6 秒，把下一个镜头“空跑”一遍（画到 2×2 的假画布上），
  // 记下它缺的图层，之后每帧只花几毫秒把它们一张张建好——切过去的那一帧就不会卡
  const DUMMY = E.mk(1, 1);
  let warmMode = false;
  const warmQ = [];
  function LC(s, key, w, h, fn, res = 1) {
    const k = s.k * res, ck = key + '@' + k.toFixed(3);
    const c = LRU.get(ck);
    if (c) { LRU.delete(ck); LRU.set(ck, c); return c; }
    if (warmMode) { if (!warmQ.some((it) => it.ck === ck)) warmQ.push({ ck, w, h, fn, k, sk: s.k }); return DUMMY; }
    return lcBuild(ck, w, h, fn, k, s.k);
  }
  /** 播放器切走 / 区块远离视口时调用：放掉所有自建的位图（之后用到时再懒建） */
  function release() {
    for (const c of LRU.values()) c.width = c.height = 1;
    LRU.clear(); lruPx = 0; maxK = 0; warmQ.length = 0; warmedAt.clear();
    for (const c of SPM.values()) c.width = c.height = 1;
    SPM.clear();
  }
  function warmStep(ms, sk) {
    const t0 = performance.now();
    while (warmQ.length && performance.now() - t0 < ms) { const it = warmQ.shift(); if (it.sk === sk && !LRU.has(it.ck)) lcBuild(it.ck, it.w, it.h, it.fn, it.k, it.sk); }
  }
  const warmedAt = new Map(), dummyCtx = E.mk(2, 2).getContext('2d');
  /** 与引擎 state() 同样的字段（给预热空跑用） */
  function fakeState(s, shot, t) {
    const T = s.T, lt = t - shot.t0, dur = (Number.isFinite(shot.t1) ? shot.t1 : T.duration) - shot.t0;
    const beat = T.beatAt(t), bar = T.barAt(t), bp = beat - Math.floor(beat), barp = bar - Math.floor(bar);
    return Object.assign({}, s, {
      t, lt, dur, p: clamp(lt / dur), shot, beat, bar, bp, barp,
      pulse: (sh = 6) => Math.exp(-bp * sh), barPulse: (sh = 4) => Math.exp(-barp * sh),
      e: T.env('rms', t), lo: T.env('low', t), mid: T.env('mid', t), hi: T.env('high', t),
      raw: (key) => T.raw(key, t), acc: (d) => T.accent(t, d),
      at: (a, b, e) => E.span(lt, a, b, e), abs: (a, b, e) => E.span(t, a, b, e),
    });
  }
  function warmAhead(s) {
    if (s.k < 0.45) return; // 海报、缩略图：只画一帧，不必预热
    warmStep(4, s.k);
    const S = s.film.shots, i = S.indexOf(s.shot), nx = S[i + 1];
    if (!nx || nx.t0 - s.t > 2.6 || nx.t0 <= s.t) return;
    const wk = nx.id + '@' + s.k.toFixed(3), now = performance.now();
    if (warmedAt.has(wk) && now - warmedAt.get(wk) < 20000) return;
    warmedAt.set(wk, now);
    warmMode = true;
    try { dummyCtx.setTransform(s.k, 0, 0, s.k, 0, 0); nx.draw(dummyCtx, fakeState(s, nx, nx.t0 + 0.05)); } catch (e) { /* 空跑失败不影响正片 */ }
    warmMode = false;
  }
  // 小精灵：固定像素尺寸（柔光、雾团这类糊的东西不必跟着分辨率走）
  const SPM = new Map();
  function spr(key, w, h, fn) { let c = SPM.get(key); if (!c) { c = E.mk(w, h); fn(c.getContext('2d'), w, h); SPM.set(key, c); } return c; }

  /* =========================================================
   * 相机：与引擎 s.layer 相同的视差变换；baked() 把静态层按“基准机位”烘焙，机位小幅移动时直接贴图
   * ========================================================= */
  function camT(q, c, d) {
    const z = 1 + ((c.z ?? 1) - 1) * d;
    q.translate(960 + (c.sx || 0) * d, 540 + (c.sy || 0) * d);
    if (c.r) q.rotate(c.r * Math.min(1, d));
    q.scale(z, z);
    q.translate(-960 - ((c.x ?? 960) - 960) * d, -540 - ((c.y ?? 540) - 540) * d);
  }
  function inCam(g, c, d, fn) { g.save(); camT(g, c, d); fn(g); g.restore(); }
  const BM = 0.1;
  /** crop = [x0, y0, x1, y1]（世界坐标，可选）：只烘焙这一块 */
  function baked(g, s, key, base, cam, d, fn, res = 1, crop = null) {
    const W = VW * (1 + 2 * BM), H = VH * (1 + 2 * BM);
    const zb = 1 + ((base.z ?? 1) - 1) * d, zc = 1 + ((cam.z ?? 1) - 1) * d;
    const dbx = ((base.x ?? 960) - 960) * d, dby = ((base.y ?? 540) - 540) * d;
    const dcx = ((cam.x ?? 960) - 960) * d, dcy = ((cam.y ?? 540) - 540) * d;
    let u0 = 0, v0 = 0, u1 = W, v1 = H;
    if (crop) {
      const sx = (x) => 960 + zb * (x - 960 - dbx) + VW * BM, sy = (y) => 540 + zb * (y - 540 - dby) + VH * BM;
      u0 = Math.max(0, Math.floor(sx(crop[0]))); v0 = Math.max(0, Math.floor(sy(crop[1]))); u1 = Math.min(W, Math.ceil(sx(crop[2]))); v1 = Math.min(H, Math.ceil(sy(crop[3])));
      if (u1 <= u0 || v1 <= v0) return;
    }
    const cw = u1 - u0, ch = v1 - v0;
    const c = LC(s, key, cw, ch, (q) => { q.translate(-u0, -v0); q.translate(VW * BM, VH * BM); camT(q, base, d); fn(q); }, res);
    g.save();
    g.translate(960 + (cam.sx || 0) * d, 540 + (cam.sy || 0) * d);
    if (cam.r) g.rotate(cam.r * Math.min(1, d));
    g.translate(zc * (dbx - dcx), zc * (dby - dcy));
    g.scale(zc / zb, zc / zb);
    g.translate(-960 - VW * BM, -540 - VH * BM);
    const kk = s.k * res;
    g.drawImage(c, 0, 0, Math.min(c.width, cw * kk), Math.min(c.height, ch * kk), u0, v0, cw, ch);
    g.restore();
  }
  /** 视差层 d 在相机 cam 下可见的世界 x 范围 */
  function visRange(cam, d) { const z = 1 + ((cam.z ?? 1) - 1) * d, cx = 960 + ((cam.x ?? 960) - 960) * d; return [cx - 960 / z - 80, cx + 960 / z + 80]; }
  /** 分块的世界图层：只画与视野相交的块（每块单独缓存，走 LRU） */
  function tiled(g, s, key, cam, d, x0, x1, tw, fn, res = 1, y0 = 0, h = VH) {
    const z = 1 + ((cam.z ?? 1) - 1) * d, cx = 960 + ((cam.x ?? 960) - 960) * d;
    const vx0 = cx - 960 / z - 40, vx1 = cx + 960 / z + 40;
    inCam(g, cam, d, (q) => {
      const M = q.getTransform(), a = M.a, e = M.e, kk = s.k * res;
      for (let tx = x0; tx < x1; tx += tw) {
        if (tx + tw < vx0 || tx > vx1) continue;
        const c = LC(s, key + ':' + tx, tw, h, (qq) => { qq.translate(-tx, -y0); fn(qq, tx, tx + tw); }, res);
        const X0 = Math.round(a * tx + e), X1 = Math.round(a * (tx + tw) + e);
        q.drawImage(c, 0, 0, Math.min(c.width, tw * kk), Math.min(c.height, h * kk), (X0 - e) / a, y0, (X1 - X0) / a, h);
      }
    });
  }
  /** 减少动态效果时，闪白 / 抖动减弱 */
  const flashK = (s) => (s.reduced ? 0.35 : 1);
  const shake = (s, amp, seed = 3, sp = 18) => (s.reduced ? { sx: 0, sy: 0 } : { sx: wobble(seed, s.t * sp) * amp, sy: wobble(seed + 5, s.t * sp) * amp * 0.8 });
  const hand = (s, seed, amp = 5, sp = 0.35) => (s.reduced ? { sx: 0, sy: 0 } : s.handheld(seed, s.t, amp, sp));
  /** 镜头开始那一拍的拍号 */
  const T0beat = (s) => s.T.beatAt(s.shot.t0);

  /* =========================================================
   * 常用画法
   * ========================================================= */
  function vg(q, y0, y1, stops) { const gr = q.createLinearGradient(0, y0, 0, y1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function hg(q, x0, x1, stops) { const gr = q.createLinearGradient(x0, 0, x1, 0); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function rg(q, x, y, r0, r1, stops) { const gr = q.createRadialGradient(x, y, r0, x, y, r1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function rrect(q, x, y, w, h, r) { q.beginPath(); q.moveTo(x + r, y); q.arcTo(x + w, y, x + w, y + h, r); q.arcTo(x + w, y + h, x, y + h, r); q.arcTo(x, y + h, x, y, r); q.arcTo(x, y, x + w, y, r); q.closePath(); }
  /** 闭合的平滑曲线（Catmull-Rom → 贝塞尔） */
  function blob(q, pts, close = true) {
    const n = pts.length;
    q.beginPath(); q.moveTo(pts[0][0], pts[0][1]);
    const N = close ? n : n - 1;
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const a = close || i > 0 ? p0 : p1, d = close || i < n - 2 ? p3 : p2;
      q.bezierCurveTo(p1[0] + (p2[0] - a[0]) / 6, p1[1] + (p2[1] - a[1]) / 6, p2[0] - (d[0] - p1[0]) / 6, p2[1] - (d[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (close) q.closePath();
  }
  function rockPts(cx, cy, rx, ry, seed, n = 9, j = 0.22) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = 1 - j + hash(seed, i, 7) * j * 2; pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]); }
    return pts;
  }
  function poly(q, pts) { q.beginPath(); q.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) q.lineTo(pts[i][0], pts[i][1]); q.closePath(); }
  function withAlpha(g, a, fn) { if (a <= 0.003) return; const A = g.globalAlpha; g.globalAlpha = A * Math.min(1, a); fn(g); g.globalAlpha = A; }
  function additive(g, fn) { const m = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter'; fn(g); g.globalCompositeOperation = m; }
  function hexRgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mixC(a, b, k) { const A = hexRgb(a), B = hexRgb(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`; }
  function archPath(q, cx, cy, w, h) { const r = w / 2, top = cy - h / 2 + r; q.beginPath(); q.moveTo(cx - r, cy + h / 2); q.lineTo(cx - r, top); q.arc(cx, top, r, PI, 0); q.lineTo(cx + r, cy + h / 2); q.closePath(); }

  /* ---------- 柔光 / 雾团 / 散景 / 星芒 / 气泡 ---------- */
  function puff(i, rgb) {
    const v = ((i % 4) + 4) % 4;
    return spr('puff' + v + rgb, 256, 128, (q) => {
      const R = E.rng(71 + v * 31);
      for (let j = 0; j < 11; j++) {
        const cx = 64 + R() * 128, cy = 54 + R() * 20, r = 26 + R() * 28;
        q.fillStyle = rg(q, cx, cy, 0, r, [[0, `rgba(${rgb},0.26)`], [0.5, `rgba(${rgb},0.13)`], [1, `rgba(${rgb},0)`]]);
        q.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    });
  }
  /** 横向漂移的雾带（中心 x 在 [x0, x1] 之间循环） */
  function fogBand(g, t, o) {
    const n = o.n || 8, w = o.w || 900, h = o.h || 300, seed = o.seed || 1, x0 = (o.x0 ?? 0) - w * 0.7, span = (o.x1 ?? VW) - (o.x0 ?? 0) + w * 1.4;
    const A = g.globalAlpha, rgb = o.rgb || '255,255,255';
    for (let i = 0; i < n; i++) {
      const sp = (o.speed ?? 20) * (0.6 + 0.8 * hash(seed, i, 1));
      const x = x0 + ((((hash(seed, i, 2) * span + t * sp) % span) + span) % span);
      const y = lerp(o.y0, o.y1, hash(seed, i, 3)) + Math.sin(t * 0.25 + i * 1.7) * (o.bob ?? 10);
      const sc = 0.7 + 0.6 * hash(seed, i, 4);
      g.globalAlpha = A * (o.a ?? 0.5) * (0.5 + 0.5 * hash(seed, i, 5));
      g.drawImage(puff(i + seed, rgb), x - (w * sc) / 2, y - (h * sc) / 2, w * sc, h * sc);
    }
    g.globalAlpha = A;
  }
  const hazeSpr = (rgb) => spr('haze' + rgb, 4, 256, (q) => { q.fillStyle = vg(q, 0, 256, [[0, `rgba(${rgb},0)`], [1, `rgba(${rgb},1)`]]); q.fillRect(0, 0, 4, 256); });
  /** 高度雾：从 y0（透明）到 y1（a）的竖直渐变 */
  function haze(g, rgb, x, y0, w, y1, a) { withAlpha(g, a, (q) => q.drawImage(hazeSpr(rgb), x, y0, w, y1 - y0)); }
  const bokehSpr = (rgb) => spr('bok' + rgb, 64, 64, (q) => {
    q.fillStyle = rg(q, 32, 32, 0, 31, [[0, `rgba(${rgb},0.28)`], [0.72, `rgba(${rgb},0.36)`], [0.9, `rgba(${rgb},0.55)`], [1, `rgba(${rgb},0)`]]);
    q.beginPath(); q.arc(32, 32, 31, 0, TAU); q.fill();
  });
  function bokeh(g, x, y, r, rgb, a) { if (a <= 0.01) return; const A = g.globalAlpha, m = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter'; g.globalAlpha = A * a; g.drawImage(bokehSpr(rgb), x - r, y - r, r * 2, r * 2); g.globalAlpha = A; g.globalCompositeOperation = m; }
  const sparkSpr = (rgb) => spr('spk' + rgb, 96, 96, (q) => {
    q.fillStyle = rg(q, 48, 48, 0, 48, [[0, `rgba(${rgb},0.6)`], [0.28, `rgba(${rgb},0.16)`], [1, `rgba(${rgb},0)`]]);
    q.fillRect(0, 0, 96, 96);
    q.fillStyle = '#fff'; q.beginPath();
    for (let j = 0; j < 4; j++) { const a = j * PI / 2 - PI / 2, b = a + PI / 4; q.lineTo(48 + Math.cos(a) * 45, 48 + Math.sin(a) * 45); q.lineTo(48 + Math.cos(b) * 6.5, 48 + Math.sin(b) * 6.5); }
    q.closePath(); q.fill();
  });
  function sparkle(g, x, y, r, a, rot = 0, rgb = '255,236,180') {
    if (a <= 0.01 || r <= 0.5) return;
    const A = g.globalAlpha, m = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = A * Math.min(1, a);
    if (rot) { g.translate(x, y); g.rotate(rot); g.drawImage(sparkSpr(rgb), -r, -r, 2 * r, 2 * r); g.rotate(-rot); g.translate(-x, -y); }
    else g.drawImage(sparkSpr(rgb), x - r, y - r, 2 * r, 2 * r);
    g.globalAlpha = A; g.globalCompositeOperation = m;
  }
  /** 不发光的实心四角星（白天用：金色 / 白色的小星星） */
  function star4(g, x, y, r, rot, col, a = 1) {
    if (a <= 0.01) return;
    withAlpha(g, a, (q) => {
      q.fillStyle = col; q.beginPath();
      for (let j = 0; j < 4; j++) { const an = rot + j * PI / 2, b = an + PI / 4; q.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); q.lineTo(x + Math.cos(b) * r * 0.2, y + Math.sin(b) * r * 0.2); }
      q.closePath(); q.fill();
    });
  }
  const bubbleSpr = () => spr('bubble', 48, 48, (q) => {
    q.fillStyle = rg(q, 24, 24, 12, 22, [[0, 'rgba(255,255,255,0.04)'], [0.78, 'rgba(255,255,255,0.42)'], [0.92, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]);
    q.beginPath(); q.arc(24, 24, 22, 0, TAU); q.fill();
    q.fillStyle = 'rgba(255,255,255,0.95)'; q.beginPath(); q.ellipse(16.5, 15.5, 5, 3.2, -0.65, 0, TAU); q.fill();
    q.fillStyle = 'rgba(255,255,255,0.5)'; q.beginPath(); q.arc(31, 32, 2, 0, TAU); q.fill();
  });
  function bubble(g, x, y, r, a) { if (a <= 0.01 || r < 0.6) return; const A = g.globalAlpha; g.globalAlpha = A * a; g.drawImage(bubbleSpr(), x - r, y - r, r * 2, r * 2); g.globalAlpha = A; }
  /** 一股气泡（汽水）：从 (x, y) 沿 ang 方向喷出后上浮；t0 起喷，持续 dur，n 颗 */
  function fizz(g, t, o) {
    const n = o.n || 30, rel0 = t - o.t0;
    if (rel0 < 0) return;
    for (let i = 0; i < n; i++) {
      const birth = (i / n) * (o.dur || 2) + hash(o.seed || 5, i, 1) * 0.08;
      const age = rel0 - birth;
      const life = (o.life || 1.6) * (0.6 + 0.6 * hash(o.seed || 5, i, 2));
      if (age < 0 || age > life) continue;
      const k = age / life;
      const sp = (o.speed || 420) * (0.5 + hash(o.seed || 5, i, 3)), ang = (o.ang ?? -PI / 2) + (hash(o.seed || 5, i, 4) - 0.5) * (o.spread ?? 0.7);
      const damp = 1 - Math.exp(-age * 3.2);
      const x = o.x + Math.cos(ang) * sp * damp / 3.2 + Math.sin(age * 7 + i) * 6;
      const y = o.y + Math.sin(ang) * sp * damp / 3.2 - age * age * (o.rise ?? 90);
      bubble(g, x, y, (o.r || 7) * (0.5 + hash(o.seed || 5, i, 5)) * (0.6 + k * 0.7), (o.a ?? 0.9) * Math.sin(PI * Math.min(1, k * 1.1 + 0.05)));
    }
  }
  function sparkles(g, t, n, seed, rgb, o = {}) {
    for (let i = 0; i < n; i++) {
      const life = 1.6 + hash(seed, i, 1) * 1.4, ph = fract(t / life + hash(seed, i, 2));
      const cyc = Math.floor(t / life + hash(seed, i, 2));
      const x = (o.x ?? 0) + hash(seed, i * 7 + cyc, 3) * (o.w ?? VW), y = (o.y ?? 0) + hash(seed, i * 7 + cyc, 4) * (o.h ?? VH * 0.9);
      sparkle(g, x, y, (o.r ?? 10) + hash(seed, i, 5) * (o.r2 ?? 16), Math.sin(PI * ph) * (o.a ?? 0.8), ph * 1.5, rgb);
    }
  }
  /** 拟声字 / 小字（白底描边，一拍弹出） */
  function pop(g, str, x, y, k, o = {}) {
    if (k <= 0.01) return;
    const sc = ease.back(clamp(k * 1.6)) * (o.sc || 1);
    g.save(); g.translate(x, y); g.rotate(o.rot || 0); g.scale(sc, sc);
    E.text(g, str, 0, 0, { size: o.size || 44, weight: 900, font: o.font || 'serif', color: o.color || '#ff6f9c', stroke: o.stroke || 'rgba(255,255,255,0.95)', strokeW: o.strokeW || 10, alpha: clamp(k * 3) * (o.a ?? 1), spacing: o.spacing || 2 });
    g.restore();
  }
  /** 对话气泡：(x, y) 为尾巴尖；w×h 的圆角框在上方 */
  function speech(g, str, x, y, k, o = {}) {
    if (k <= 0.01) return;
    const w = o.w || 300, h = o.h || 110, sc = ease.back(clamp(k * 1.4)), dx = o.dx ?? -w * 0.3;
    g.save(); g.translate(x, y); g.scale(sc, sc); g.globalAlpha *= clamp(k * 3);
    g.fillStyle = '#fffdf8'; g.strokeStyle = o.ink || '#3a3050'; g.lineWidth = 4; g.lineJoin = 'round';
    rrect(g, dx - w / 2, -h - 36, w, h, 34); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(dx - 26, -38); g.lineTo(0, 0); g.lineTo(dx + 14, -38); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(dx - 26, -38); g.lineTo(0, 0); g.lineTo(dx + 14, -38); g.stroke();
    g.fillStyle = '#fffdf8'; g.fillRect(dx - 24, -44, 36, 10);
    E.text(g, str, dx, -36 - h / 2 + (o.size || 48) * 0.36, { size: o.size || 48, weight: 900, color: o.color || '#3a3050', spacing: 2 });
    g.restore();
  }

  /* =========================================================
   * 白天的自然：天、太阳、云、海、海鸥、棕榈、草
   * ========================================================= */
  /** 积云（平底）：暗面 → 中间调 → 亮面（向光一侧），底部渐暗 */
  function cumulus(q, cx, by, w, h, seed, P) {
    const R = E.rng(seed), puffs = [];
    const n = Math.max(5, Math.round(w / 52));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, hump = Math.pow(Math.sin(u * PI), 0.8);
      const r = h * (0.2 + 0.22 * hump) * (0.8 + R() * 0.45);
      puffs.push([cx - w / 2 + u * w + (R() - 0.5) * (w / n) * 0.6, by - r * 0.6 - hump * h * 0.36 * (0.7 + R() * 0.5), r]);
    }
    for (let i = 0; i < n * 0.7; i++) { const u = 0.18 + R() * 0.64, hump = Math.sin(u * PI); puffs.push([cx - w / 2 + u * w, by - h * 0.28 - h * 0.42 * hump * (0.6 + R() * 0.5), h * (0.13 + 0.15 * R())]); }
    const lx = P.lx ?? -0.35, ly = P.ly ?? -0.55;
    q.save();
    q.beginPath(); q.rect(cx - w, by - h * 2, w * 2, h * 2); q.clip();
    q.fillStyle = P.shade; q.beginPath(); for (const [x, y, r] of puffs) { q.moveTo(x + r, y); q.arc(x, y, r, 0, TAU); } q.fill();
    q.fillStyle = P.mid || P.lit; q.beginPath(); for (const [x, y, r] of puffs) { const ox = x + lx * r * 0.18, oy = y + ly * r * 0.18; q.moveTo(ox + r * 0.9, oy); q.arc(ox, oy, r * 0.9, 0, TAU); } q.fill();
    q.fillStyle = P.lit; q.beginPath(); for (const [x, y, r] of puffs) { const ox = x + lx * r * 0.34, oy = y + ly * r * 0.34; q.moveTo(ox + r * 0.72, oy); q.arc(ox, oy, r * 0.72, 0, TAU); } q.fill();
    if (P.rim) { q.strokeStyle = P.rim; q.lineWidth = 2.5; q.beginPath(); for (const [x, y, r] of puffs) { if (y > by - h * 0.25) continue; const a0 = Math.atan2(ly, lx) - 0.7; q.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r); q.arc(x, y, r, a0, a0 + 1.4); } q.stroke(); }
    q.globalCompositeOperation = 'source-atop';
    q.fillStyle = vg(q, by - h * 0.55, by, [[0, 'rgba(0,0,0,0)'], [1, P.base || 'rgba(150,170,205,.55)']]);
    q.fillRect(cx - w, by - h, w * 2, h);
    q.restore();
  }
  const CLOUD = {
    day: { lit: '#ffffff', mid: '#f4f8fd', shade: '#c9d8ee', base: 'rgba(140,166,206,.5)' },
    morn: { lit: '#fffaf0', mid: '#f7f1ec', shade: '#d4d2e6', base: 'rgba(170,160,200,.45)', lx: -0.6, ly: -0.3 },
    pink: { lit: '#fff6fa', mid: '#ffe4ee', shade: '#f2b8cf', base: 'rgba(214,140,180,.45)' },
    aft: { lit: '#fff7e6', mid: '#fbeedc', shade: '#dcc8d8', base: 'rgba(190,150,170,.45)', lx: 0.5, ly: -0.4 },
    dusk: { lit: '#ffd8cc', mid: '#f4a2bc', shade: '#8a6aaa', base: 'rgba(80,56,140,.55)', lx: 0.75, ly: 0.35, rim: 'rgba(255,236,200,0.95)' },
  };
  /** 一朵积云的精灵（w×h，云底在 h*0.92） */
  const cloud = (s, seed, w, h, pal) => LC(s, `cu:${seed}:${w}:${h}:${pal}`, w, h, (q) => cumulus(q, w / 2, h * 0.92, w * 0.9, h * 0.8, seed, CLOUD[pal] || CLOUD.day), 0.6);
  /** 羊形的云（设计 320×200，脚底中心 (160,190)）：身体几团 + 头 + 四条腿 */
  function sheepCloudArt(q, top, bottom, face, shade) {
    const body = () => {
      q.beginPath();
      for (const [x, y, r] of [[92, 104, 44], [138, 80, 50], [190, 84, 46], [228, 110, 40], [196, 132, 44], [140, 134, 46], [96, 136, 38], [60, 118, 30]]) { q.moveTo(x + r, y); q.arc(x, y, r, 0, TAU); }
      q.moveTo(290, 92); q.ellipse(262, 92, 28, 30, 0.2, 0, TAU);
      for (const x of [92, 124, 182, 214]) { q.moveTo(x + 13, 176); q.ellipse(x, 168, 13, 20, 0, 0, TAU); }
    };
    if (shade) { q.save(); q.translate(4, 6); body(); q.fillStyle = shade; q.fill(); q.restore(); }
    body(); q.fillStyle = vg(q, 30, 190, [[0, top], [1, bottom]]); q.fill();
    if (face) { q.fillStyle = face; q.beginPath(); q.arc(270, 88, 4.5, 0, TAU); q.fill(); q.fillStyle = 'rgba(255,150,180,0.5)'; q.beginPath(); q.ellipse(262, 104, 8, 4, 0, 0, TAU); q.fill(); }
  }
  const sheepCloud = (s, pal) => LC(s, 'sheepcloud-' + pal, 330, 210, (q) => {
    q.translate(4, 4);
    if (pal === 'dusk') sheepCloudArt(q, '#ffe2c6', '#f4a6b4', 'rgba(110,60,90,0.7)', 'rgba(140,90,150,0.55)');
    else if (pal === 'night') sheepCloudArt(q, 'rgba(200,180,240,0.9)', 'rgba(255,170,210,0.95)', null, null);
    else sheepCloudArt(q, '#ffffff', '#ffe2ec', 'rgba(90,60,90,0.75)', 'rgba(214,190,226,0.8)');
  }, 0.8);

  /** 太阳：柔光 + 光芒；flare 为镜头光斑强度 */
  function sun(g, x, y, r, a = 1, rgb = '255,244,214') {
    // 登记太阳在画面上的位置（设计坐标），片级 overlay 在那里加镜头眩光；只认主画面 / 转场缓冲（16:9 的整帧画布）
    const cv = g.canvas;
    if (cv && cv.width >= 320 && Math.abs(cv.width / cv.height - VW / VH) < 0.02) {
      const M = g.getTransform(), kk = cv.width / VW;
      SUNP.x = (M.a * x + M.c * y + M.e) / kk; SUNP.y = (M.b * x + M.d * y + M.f) / kk; SUNP.a = a; SUNP.st = FST;
    }
    E.glow(g, x, y, r * 6, rgb, 0.35 * a, 'lighter', false);
    E.glow(g, x, y, r * 2.6, '255,250,236', 0.7 * a);
    withAlpha(g, a, (q) => { q.fillStyle = '#fffdf4'; q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); });
  }
  /** 镜头光斑：沿太阳 → 画面中心的直线分布几个圆斑 */
  function flare(g, sx, sy, a = 1) {
    if (a <= 0.02) return;
    const dx = 960 - sx, dy = 540 - sy;
    for (const [k, r, rgb, aa] of [[0.35, 50, '255,230,190', 0.18], [0.7, 26, '190,230,255', 0.22], [1.1, 90, '255,210,230', 0.1], [1.5, 38, '200,255,230', 0.16], [1.9, 140, '255,240,210', 0.07]]) bokeh(g, sx + dx * k, sy + dy * k, r, rgb, aa * a);
  }

  /** 海面上的碎金（太阳倒影）与白色碎光：y0 海平线，y1 画面底；sunX 太阳的 x；vx 光斑的横向漂移（船在走时用） */
  function glints(g, t, o) {
    const n = o.n || 120, seed = o.seed || 17, A = g.globalAlpha;
    const x0 = o.x0 ?? -100, x1 = o.x1 ?? VW + 100, span = x1 - x0;
    g.fillStyle = o.col || '#fffbea';
    for (let i = 0; i < n; i++) {
      const v = Math.pow(hash(seed, i, 2), 1.5), y = o.y0 + v * (o.y1 - o.y0);
      const path = hash(seed, i, 3) < (o.path ?? 0.55);
      const bx = path ? (o.sunX ?? 960) + (hash(seed, i, 4) - 0.5) * ((o.pw0 ?? 60) + v * (o.pw1 ?? 700)) : x0 + hash(seed, i, 1) * span;
      const x = x0 + ((((bx - x0 + (o.vx || 0) * t * (0.4 + v)) % span) + span) % span) + Math.sin(t * 0.8 + i) * 5;
      const tw = Math.sin(t * (1.6 + hash(seed, i, 5) * 3.4) + i * 2.3);
      if (tw < 0.2) continue;
      const a = (tw - 0.2) / 0.8 * (path ? 1 : 0.45) * (o.a ?? 1) * (1 - v * 0.35);
      const w = (5 + v * (o.wmax ?? 38)) * (0.5 + hash(seed, i, 6)), h = 1.2 + v * (o.hmax ?? 3.2);
      g.globalAlpha = A * a; g.fillRect(x - w / 2, y, w, h);
      if (path && tw > 0.93 && v > 0.08 && o.stars !== false) { g.globalAlpha = A; sparkle(g, x, y, 10 + v * 26, (tw - 0.93) / 0.07 * 0.9 * (o.a ?? 1), 0, o.rgb || '255,248,220'); }
    }
    g.globalAlpha = A;
  }
  /** 浪花线：一条条短弧，向 vx 方向漂（近大远小） */
  function waveLines(g, t, o) {
    const n = o.n || 40, seed = o.seed || 23, A = g.globalAlpha;
    const x0 = o.x0 ?? -100, x1 = o.x1 ?? VW + 100, span = x1 - x0;
    g.strokeStyle = o.col || 'rgba(255,255,255,0.8)'; g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const v = Math.pow(hash(seed, i, 1), 1.3), y = o.y0 + v * (o.y1 - o.y0);
      const x = x0 + ((((hash(seed, i, 2) * span + (o.vx || 0) * t * (0.3 + v * 1.2)) % span) + span) % span);
      const life = fract(t * (0.15 + hash(seed, i, 3) * 0.2) + hash(seed, i, 4));
      const a = Math.sin(PI * life) * (o.a ?? 0.6);
      if (a < 0.03) continue;
      const w = (14 + v * (o.wmax ?? 90)) * (0.6 + hash(seed, i, 5) * 0.8);
      g.globalAlpha = A * a; g.lineWidth = 1 + v * (o.lw ?? 3);
      g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x, y - 3 - v * 6, x + w / 2, y); g.stroke();
    }
    g.globalAlpha = A; g.lineCap = 'butt';
  }
  /** 海鸥（近景）：身体 + 两只拍动的翅膀；dir = 1 向右飞 */
  function gull(g, x, y, sc, flap, dir = 1, o = {}) {
    g.save(); g.translate(x, y); g.scale(sc * dir, sc);
    const up = Math.sin(flap), wy = -up * 26, wy2 = -up * 10;
    const ink = o.ink || '#3a4458';
    if (o.sil) {
      g.fillStyle = o.sil; g.beginPath(); g.moveTo(-40, wy - 4); g.quadraticCurveTo(-18, wy2 - 12, 0, 0); g.quadraticCurveTo(18, wy2 - 12, 40, wy - 4); g.quadraticCurveTo(18, wy2 - 4, 0, 5); g.quadraticCurveTo(-18, wy2 - 4, -40, wy - 4); g.fill();
      g.restore(); return;
    }
    // 远翼
    g.fillStyle = '#c9d2de'; g.beginPath(); g.moveTo(-4, -2); g.quadraticCurveTo(-16, wy2 - 14, -42, wy - 6); g.quadraticCurveTo(-24, wy2 - 2, -2, 4); g.closePath(); g.fill();
    g.fillStyle = '#2a2e38'; g.beginPath(); g.moveTo(-42, wy - 6); g.lineTo(-34, wy - 2); g.lineTo(-36, wy - 7.5); g.closePath(); g.fill();
    // 身体
    g.fillStyle = '#fbfcfe'; g.beginPath(); g.ellipse(0, 2, 20, 7.5, -0.05, 0, TAU); g.fill();
    g.beginPath(); g.arc(17, -1, 6.5, 0, TAU); g.fill();
    g.fillStyle = '#f4b83a'; g.beginPath(); g.moveTo(22, -1); g.lineTo(31, 1); g.lineTo(22, 2.5); g.closePath(); g.fill();
    g.fillStyle = '#1e2230'; g.beginPath(); g.arc(19, -2.5, 1.4, 0, TAU); g.fill();
    g.fillStyle = '#e7ecf2'; g.beginPath(); g.moveTo(-18, 2); g.lineTo(-30, -1); g.lineTo(-29, 7); g.closePath(); g.fill();
    // 近翼
    g.fillStyle = '#dde4ec'; g.beginPath(); g.moveTo(2, -1); g.quadraticCurveTo(-8, wy2 - 16, -34, wy - 12); g.quadraticCurveTo(-14, wy2 - 4, 6, 5); g.closePath(); g.fill();
    g.fillStyle = '#2a2e38'; g.beginPath(); g.moveTo(-34, wy - 12); g.lineTo(-25, wy - 7); g.lineTo(-27, wy - 13); g.closePath(); g.fill();
    g.strokeStyle = ink; g.lineWidth = 1.4; g.globalAlpha *= 0.5; g.beginPath(); g.ellipse(0, 2, 20, 7.5, -0.05, 0.2, PI - 0.2); g.stroke();
    g.restore();
  }
  /** 一群海鸥：沿各自的路线循环飞过（x0→x1），远的小、用 V 字 */
  function gulls(g, t, o) {
    const n = o.n || 6, seed = o.seed || 31;
    for (let i = 0; i < n; i++) {
      const sp = (o.speed || 90) * (0.7 + 0.6 * hash(seed, i, 1)), span = (o.x1 ?? 2200) - (o.x0 ?? -300);
      const u = fract((t * sp) / span + hash(seed, i, 2));
      const x = (o.x0 ?? -300) + u * span, y = lerp(o.y0 ?? 150, o.y1 ?? 400, hash(seed, i, 3)) + Math.sin(t * 0.9 + i * 1.7) * 18;
      const sc = (o.s ?? 1) * (0.55 + 0.7 * hash(seed, i, 4));
      const flap = t * (5 + hash(seed, i, 5) * 3) + i * 2 + Math.sin(t * 0.7 + i) * 2;
      if (sc * 40 < 16 || o.far) {
        g.strokeStyle = o.col || 'rgba(60,70,90,0.75)'; g.lineWidth = Math.max(1.2, sc * 2.4); g.lineCap = 'round';
        const w = sc * 22, up = Math.sin(flap) * w * 0.4;
        g.beginPath(); g.moveTo(x - w, y - up); g.quadraticCurveTo(x - w * 0.4, y - w * 0.35 - up * 0.3, x, y); g.quadraticCurveTo(x + w * 0.4, y - w * 0.35 - up * 0.3, x + w, y - up); g.stroke(); g.lineCap = 'butt';
      } else gull(g, x, y, sc, flap, o.dir || 1, o);
    }
  }
  /** 一片棕榈叶（一条路径填充） */
  function frond(g, x, y, a, L, droop) {
    const N = 16, ca = Math.cos(a), sa = Math.sin(a), dr = droop * 0.6;
    g.beginPath();
    const ex = x + ca * L, ey = y + sa * L + dr * L;
    const w0 = L * 0.018;
    g.moveTo(x - sa * w0, y + ca * w0); g.quadraticCurveTo(x + ca * L * 0.5, y + sa * L * 0.5, ex, ey); g.quadraticCurveTo(x + ca * L * 0.5, y + sa * L * 0.5, x + sa * w0, y - ca * w0);
    for (let i = 1; i <= N; i++) {
      const u = i / (N + 1);
      const px = x + ca * L * u, py = y + sa * L * u + dr * L * u * u;
      let tx = ca, ty = sa + 2 * dr * u; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const len = L * 0.32 * Math.pow(Math.sin(PI * Math.min(1, u * 0.92 + 0.08)), 0.7) * (1 - u * 0.35);
      const bw = L * 0.022 * (1 - u * 0.5);
      for (const sd of [-1, 1]) {
        let dx = tx * 0.55 + -ty * sd * 0.84, dy = ty * 0.55 + tx * sd * 0.84 + 0.75;
        const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
        const tipx = px + dx * len, tipy = py + dy * len;
        g.moveTo(px - tx * bw, py - ty * bw);
        g.quadraticCurveTo(px + dx * len * 0.5 + tx * bw * 2, py + dy * len * 0.5 + ty * bw * 2 - len * 0.08, tipx, tipy);
        g.lineTo(px + tx * bw, py + ty * bw);
      }
    }
    g.fill();
  }
  /** 棕榈树（白天上色）：(x, y) 树根，h 树高；o: { lean, bend, seed, n, wind, col(剪影色), leaf, leaf2, trunk } */
  function palm(g, x, y, h, t, o = {}) {
    const lean = o.lean ?? 0.12, seed = o.seed || 1;
    const sway = wobble(seed * 13, t * 0.35) * 0.04 + (o.wind || 0) * 0.05;
    const cx = x + (lean + sway * 0.5) * h, cy = y - h;
    const mx = x + lean * h * 0.3 + (o.bend ?? 0.1) * h, my = y - h * 0.5;
    const w0 = h * 0.042, w1 = h * 0.022;
    const sil = o.col;
    // 树干
    g.fillStyle = sil || o.trunk || '#b08a62';
    g.beginPath(); g.moveTo(x - w0, y); g.quadraticCurveTo(mx - w0 * 0.8, my, cx - w1, cy + 4); g.lineTo(cx + w1, cy + 4); g.quadraticCurveTo(mx + w0 * 0.8, my, x + w0, y); g.closePath(); g.fill();
    if (!sil && h > 120) {
      // 树干上的环纹（沿二次曲线取点）
      g.strokeStyle = 'rgba(90,60,40,0.45)'; g.lineWidth = Math.max(1, h * 0.005);
      for (let i = 1; i < 14; i++) { const u = i / 14, bx = (1 - u) * (1 - u) * x + 2 * u * (1 - u) * mx + u * u * cx, by = (1 - u) * (1 - u) * y + 2 * u * (1 - u) * my + u * u * cy, ww = lerp(w0, w1, u); g.beginPath(); g.moveTo(bx - ww, by + 2); g.quadraticCurveTo(bx, by + 5, bx + ww, by + 1); g.stroke(); }
      g.fillStyle = 'rgba(255,240,210,0.25)'; g.beginPath(); g.moveTo(x - w0 * 0.2, y); g.quadraticCurveTo(mx - w0 * 0.1, my, cx, cy + 4); g.lineTo(cx + w1 * 0.8, cy + 4); g.quadraticCurveTo(mx + w0 * 0.6, my, x + w0 * 0.8, y); g.closePath(); g.fill();
    }
    const n = o.n || 9;
    // 远处的叶子（暗）→ 近处的叶子（亮）
    for (let pass = 0; pass < (sil ? 1 : 2); pass++) {
      g.fillStyle = sil || (pass ? o.leaf || '#4fa86a' : o.leaf2 || '#2f7a55');
      for (let i = 0; i < n; i++) {
        if (!sil && (i % 2) !== pass) continue;
        const side = i / (n - 1) - 0.5;
        const a0 = -PI / 2 + side * PI * 1.55 + (hash(seed, i, 1) - 0.5) * 0.3;
        const sw = wobble(seed * 7 + i, t * 0.5) * 0.08 + sway * 1.4;
        frond(g, cx, cy, a0 + sw, h * (0.4 + hash(seed, i, 2) * 0.18), 0.7 + Math.abs(side) * 0.9 + hash(seed, i, 3) * 0.4);
      }
    }
    g.fillStyle = sil || '#7a5a38';
    g.beginPath(); g.arc(cx - h * 0.012, cy + h * 0.02, h * 0.022, 0, TAU); g.arc(cx + h * 0.02, cy + h * 0.025, h * 0.02, 0, TAU); g.fill();
  }

  /* =========================================================
   * 小羊：用角色库（MVE.cast）画进精灵图；包围盒量一次
   * ========================================================= */
  const LAMB = { pink: ['sheep-pink', {}], black: ['sheep-black', {}] };
  const BOX = new Map();
  function castBox(who, o) {
    const key = who + '|' + JSON.stringify(o);
    let b = BOX.get(key);
    if (b) return b;
    b = { x0: -70, y0: -100, x1: 70, y1: 8 };
    try {
      const c = E.mk(900, 700), q = c.getContext('2d', { willReadFrequently: true });
      cast(q, who, Object.assign({ x: 450, y: 520, h: 100, t: 0 }, o));
      const d = q.getImageData(0, 0, 900, 700).data;
      let x0 = 900, y0 = 700, x1 = -1, y1 = -1;
      for (let y = 0; y < 700; y += 2) for (let x = 0; x < 900; x += 2) if (d[(y * 900 + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 > x0) b = { x0: x0 - 450 - 6, y0: y0 - 520 - 6, x1: x1 - 450 + 6, y1: y1 - 520 + 6 };
    } catch (e) { /* 角色库不可用：用默认框 */ }
    BOX.set(key, b);
    return b;
  }
  function lambSpr(s, kind, pose, expr) {
    const L = LAMB[kind] || LAMB.pink;
    const po = Object.assign({ pose }, L[1]);
    const b = castBox(L[0], po);
    const c = LC(s, `lamb:${kind}:${pose}:${expr}`, b.x1 - b.x0, b.y1 - b.y0, (q) => cast(q, L[0], Object.assign({ x: -b.x0, y: -b.y0, h: 100, t: 0, expr }, po)), 2);
    return { c, b };
  }
  /**
   * 画一只（精灵图）小羊：(x, y) 脚底，V 可见高度
   * o: { kind, pose, expr, flip, sq(挤压 -1..1), spin(绕身体中心转), rot(绕脚底转), alpha, glow, shadow }
   */
  /*
   * 官方的粉色小羊（「火山旅梦」的敌人模型 enemy_1345_tplamb：戴耳机、叼飞盘的粉羊）：角色库的 opt-in（sd: true）。
   * 全片只用这一种（控制下载量）；姿势：站 / 坐 / 睡 / 吃 / 飘 → Idle，走 / 跑 / 跳 → Move（跳的高度仍由影片自己算）
   */
  const LAMB_SD = 'enemy_1345_tplamb';
  // 蹦跳（jump / bounce）也用 Idle：离地的弧线由影片自己算。旧写法 jump → Move，而蹦跳的小羊按 hy > 0.3 在 jump / stand 之间来回切，
  // 于是每一跳都在 Idle 与 Move 两个动画之间硬切一次（dance 镜头 4.5 秒里 127 次）——看起来就是在抽搐
  const LAMB_POSE = { stand: 'stand', sit: 'stand', sleep: 'stand', eat: 'stand', float: 'stand', 'look-up': 'stand', open: 'stand', walk: 'walk', run: 'run', jump: 'stand', bounce: 'stand', push: 'push' };
  function lambSD(g, s, x, y, V, o) {
    const S = E.sd;
    if (!S || !S.drawCast || !SDON()) return false;
    const pose = LAMB_POSE[o.pose || 'stand'] || 'stand';
    // 相位按这只羊是谁（o.id：调用处 + 循环序号）定，不跟位置走：旧写法 (x * 0.013) % 3 让走动 / 蹦跳的小羊一边移动一边快进动画，
    // 每走 230 像素还整段跳一次
    const q = { x, y, h: V * 1.28, t: s.t, phase: hash(o.id ?? Math.round(V), 29, 5) * 3, pose, sd: true, variant: LAMB_SD, flip: !o.flip, alpha: o.alpha, rot: (o.rot || 0) + (o.spin || 0) * 0.6, speed: pose === 'walk' ? 1.3 : 1 };
    if (o.shadow) groundShadow(g, x, o.shadowY ?? y, V * 0.62, 0.16 * (o.alpha ?? 1) * clamp(1 - ((o.shadowY ?? y) - y) / 300));
    if (o.glow) E.glow(g, x, y - V * 0.45, V * 1.1, o.glowRgb || '255,170,215', 0.26 * o.glow * (o.alpha ?? 1));
    // 调试（lab/jitter.html）：这只羊是谁（紧跟着的官方小人记录按它配对）；MVE.sd.trace 平时为 null
    if (S.trace) { const m = g.getTransform(); S.trace({ src: 'lamb', key: LAMB_SD + ':' + pose, cv: g.canvas, x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, s: V * Math.hypot(m.a, m.b) / 300, V, id: q.phase != null ? o.id : null }); }
    try { return !!S.drawCast(g, 'sheep-pink', q); } catch (e) { return false; }
  }
  function lamb(g, s, x, y, V, o = {}) {
    if ((o.kind || 'pink') === 'pink' && lambSD(g, s, x, y, V, o)) return;
    const L = lambSpr(s, o.kind || 'pink', o.pose || 'stand', o.expr || 'neutral');
    const b = L.b, bh = b.y1 - b.y0, sc = V / bh, sq = o.sq || 0;
    if (o.shadow) groundShadow(g, x, o.shadowY ?? y, V * 0.62, 0.16 * (o.alpha ?? 1) * clamp(1 - ((o.shadowY ?? y) - y) / 300));
    if (o.glow) E.glow(g, x, y - V * 0.45, V * 1.1, o.glowRgb || '255,170,215', 0.26 * o.glow * (o.alpha ?? 1));
    g.save();
    g.translate(x, y);
    if (o.rot) g.rotate(o.rot);
    if (o.spin) { g.translate(0, -V * 0.45); g.rotate(o.spin); g.translate(0, V * 0.45); }
    g.scale((o.flip ? -1 : 1) * sc * (1 + sq * 0.2), sc * (1 - sq * 0.2));
    if (o.alpha != null) g.globalAlpha *= clamp(o.alpha);
    g.drawImage(L.c, b.x0, b.y0, b.x1 - b.x0, bh);
    g.restore();
  }
  /** 一拍一跳：ph ∈ [0,1) → [离地高度 0..1, 挤压] */
  function hop(ph) {
    const y = 4 * ph * (1 - ph);
    const sq = ph < 0.1 ? 0.7 * (1 - ph / 0.1) : ph > 0.92 ? 0.5 * ((ph - 0.92) / 0.08) : -0.28 * Math.sin(PI * ((ph - 0.1) / 0.82));
    return [y, sq];
  }
  /** 抛物线 + 落地弹跳（解析算）：返回 { x, y, vy, n(第几段), sq } */
  function bounce(age, x0, y0, vx, vy, floor, grav = 2600, e = 0.52, fr = 0.7) {
    let x = x0, y = y0, v = vy, u = vx, tt = age, n = 0;
    for (; n < 6; n++) {
      const disc = v * v + 2 * grav * (floor - y);
      const tl = disc > 0 ? (-v + Math.sqrt(disc)) / grav : 0;
      if (tt < tl || tl <= 0.02) {
        const yy = Math.min(floor, y + v * tt + 0.5 * grav * tt * tt);
        return { x: x + u * tt, y: yy, vy: v + grav * tt, n, sq: 0 };
      }
      tt -= tl; x += u * tl; y = floor; v = -(v + grav * tl) * e; u *= fr;
      if (tt < 0.09) return { x: x + u * tt, y: floor, vy: 0, n: n + 1, sq: (1 - tt / 0.09) * Math.min(1, Math.abs(v) / 500) };
    }
    return { x: x + u * Math.min(tt, 0.3), y: floor, vy: 0, n, sq: 0 };
  }
  /** “噗”：小羊出现 / 消失时的一团粉雾 + 星星（k 0..1） */
  function poof(g, x, y, r, k, seed = 1) {
    if (k <= 0 || k >= 1) return;
    const a = Math.sin(PI * k);
    for (let i = 0; i < 6; i++) {
      const an = (i / 6) * TAU + seed, d = r * (0.3 + k * 0.9);
      withAlpha(g, a * 0.8, (q) => q.drawImage(puff(i + seed, i % 2 ? '255,214,234' : '255,240,246'), x + Math.cos(an) * d - r * 0.9, y + Math.sin(an) * d * 0.7 - r * 0.45, r * 1.8, r * 0.9));
    }
    for (let i = 0; i < 4; i++) { const an = (i / 4) * TAU + seed * 2 + k; star4(g, x + Math.cos(an) * r * (0.6 + k), y + Math.sin(an) * r * (0.6 + k) * 0.8, r * 0.22 * (1 - k), k * 3, i % 2 ? '#ffd24a' : '#ff8fbf', a); }
  }

  /* =========================================================
   * 道具（与「雾中之忆」同一套设计）
   * ========================================================= */
  // ---- 汽水瓶（粉色汽水，玻璃瓶，羊标签）；精灵图设计尺寸 60×150，瓶底中心在 (30,146)
  function bottleArt(q) {
    q.save();
    const ink = '#1f3a44';
    const body = () => { q.beginPath(); q.moveTo(22, 10); q.lineTo(38, 10); q.lineTo(38, 36); q.bezierCurveTo(38, 52, 52, 56, 52, 72); q.lineTo(52, 136); q.quadraticCurveTo(52, 146, 42, 146); q.lineTo(18, 146); q.quadraticCurveTo(8, 146, 8, 136); q.lineTo(8, 72); q.bezierCurveTo(8, 56, 22, 52, 22, 36); q.closePath(); };
    body(); q.fillStyle = 'rgba(170,236,232,0.55)'; q.fill();
    q.save(); body(); q.clip();
    q.fillStyle = vg(q, 64, 146, [[0, 'rgba(255,140,190,0.85)'], [1, 'rgba(236,80,150,0.95)']]); q.fillRect(0, 64, 60, 90);
    q.fillStyle = 'rgba(255,220,236,0.9)'; q.fillRect(0, 62, 60, 4);
    q.fillStyle = 'rgba(255,255,255,0.75)'; for (let i = 0; i < 9; i++) { q.beginPath(); q.arc(14 + hash(9, i, 1) * 32, 74 + hash(9, i, 2) * 64, 1 + hash(9, i, 3) * 1.6, 0, TAU); q.fill(); }
    q.fillStyle = '#fff4f8'; q.fillRect(0, 92, 60, 30);
    q.fillStyle = '#ff7eb0'; q.fillRect(0, 92, 60, 4); q.fillRect(0, 118, 60, 4);
    q.fillStyle = '#ffffff'; for (const [x, y, r] of [[26, 107, 6], [32, 104, 6.5], [37, 108, 5.5], [30, 111, 6]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); }
    q.strokeStyle = '#e46a9c'; q.lineWidth = 1.2; for (const [x, y, r] of [[26, 107, 6], [32, 104, 6.5], [37, 108, 5.5], [30, 111, 6]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.stroke(); }
    q.fillStyle = '#fff4f8'; for (const [x, y, r] of [[26, 107, 5], [32, 104, 5.5], [37, 108, 4.5], [30, 111, 5]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); }
    q.fillStyle = '#3a2430'; q.beginPath(); q.ellipse(21, 106, 3.4, 4, -0.3, 0, TAU); q.fill();
    q.fillStyle = 'rgba(255,255,255,0.7)'; q.fillRect(12, 70, 4, 60); q.fillRect(24, 14, 3, 30);
    q.fillStyle = 'rgba(255,255,255,0.35)'; q.fillRect(44, 76, 3, 50);
    q.restore();
    body(); q.strokeStyle = ink; q.lineWidth = 2.2; q.stroke();
    q.fillStyle = '#e0424e'; rrect(q, 19, 3, 22, 10, 3); q.fill(); q.strokeStyle = '#6a1a22'; q.lineWidth = 1.6; q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.5)'; q.fillRect(22, 5, 6, 2);
    q.restore();
  }
  function bottle(g, s, x, y, h, rot = 0, a = 1) {
    const c = LC(s, 'bottle', 60, 150, bottleArt, 2.4), sc = h / 150;
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(sc, sc); if (a < 1) g.globalAlpha *= a; g.drawImage(c, -30, -146, 60, 150); g.restore();
  }
  const bottleMouth = (x, y, h, rot) => [x + Math.sin(rot) * h * 0.92, y - Math.cos(rot) * h * 0.92];

  // ---- 货箱（设计尺寸 300×230，箱底中心 (150,226)；盖子单独画）——与「雾中之忆」一致
  function crateArt(q) {
    const planks = ['#c08a58', '#b47e4e', '#c6915f', '#b98452'];
    for (let i = 0; i < 4; i++) {
      q.fillStyle = planks[i]; q.fillRect(6, 8 + i * 54, 288, 54);
      q.strokeStyle = 'rgba(90,50,24,0.35)'; q.lineWidth = 1.2;
      for (let j = 0; j < 3; j++) { q.beginPath(); const yy = 20 + i * 54 + j * 13 + hash(4, i, j) * 6; q.moveTo(20, yy); q.bezierCurveTo(90, yy - 4, 180, yy + 5, 280, yy - 2); q.stroke(); }
      q.fillStyle = 'rgba(60,30,14,0.55)'; q.fillRect(6, 8 + i * 54 + 51, 288, 3);
    }
    q.fillStyle = '#8a5a34'; q.fillRect(0, 0, 30, 230); q.fillRect(270, 0, 30, 230); q.fillRect(0, 0, 300, 18); q.fillRect(0, 212, 300, 18);
    q.fillStyle = 'rgba(255,220,170,0.25)'; q.fillRect(0, 0, 300, 4); q.fillRect(0, 0, 4, 230);
    q.save(); q.beginPath(); q.rect(30, 18, 240, 194); q.clip();
    q.strokeStyle = '#94643c'; q.lineWidth = 20; q.beginPath(); q.moveTo(30, 212); q.lineTo(270, 18); q.stroke();
    q.strokeStyle = 'rgba(60,30,14,0.4)'; q.lineWidth = 2; q.beginPath(); q.moveTo(24, 204); q.lineTo(264, 10); q.stroke();
    q.restore();
    q.fillStyle = '#3a2a24'; for (const [x, y] of [[15, 10], [285, 10], [15, 220], [285, 220], [15, 115], [285, 115]]) { q.beginPath(); q.arc(x, y, 3, 0, TAU); q.fill(); }
    q.save(); q.globalAlpha = 0.78;
    E.text(q, 'SIESTA', 150, 88, { font: 'sans', size: 44, weight: 700, color: '#4a2616', spacing: 6 });
    E.text(q, '易碎 · FRAGILE', 150, 150, { font: 'sans', size: 24, weight: 700, color: '#6a2a20', spacing: 3 });
    E.text(q, 'No.7', 244, 196, { font: 'mono', size: 18, weight: 700, color: '#4a2616' });
    q.restore();
    q.strokeStyle = '#6a2a20'; q.lineWidth = 3; q.beginPath(); q.moveTo(58, 170); q.lineTo(62, 190); q.lineTo(74, 190); q.lineTo(78, 170); q.stroke(); q.beginPath(); q.moveTo(68, 190); q.lineTo(68, 202); q.moveTo(60, 202); q.lineTo(76, 202); q.stroke();
    q.fillStyle = '#ff8fbf'; q.beginPath(); q.ellipse(214, 176, 7, 9, -0.2, 0, TAU); q.ellipse(228, 174, 7, 9, 0.2, 0, TAU); q.fill();
    q.strokeStyle = '#4a2616'; q.lineWidth = 3; q.strokeRect(1.5, 1.5, 297, 227);
  }
  function lidArt(q) {
    q.fillStyle = '#b98452'; q.fillRect(0, 4, 308, 22); q.fillStyle = '#8a5a34'; q.fillRect(0, 0, 308, 6); q.fillRect(0, 22, 308, 6);
    q.strokeStyle = '#4a2616'; q.lineWidth = 3; q.strokeRect(1.5, 1.5, 305, 25);
  }
  /** 货箱：(x, y) 箱底中心，sc 缩放；o: { hum(嗡嗡的微颤 0..1), lid(掀起 0..1), leak(粉光) } */
  function crate(g, s, x, y, sc, o = {}) {
    const body = LC(s, 'crate', 300, 230, crateArt, 1.6), lid = LC(s, 'crate-lid', 308, 28, lidArt, 1.6);
    const hum = o.hum || 0, t = s.t;
    g.save(); g.translate(x + (hum ? Math.sin(t * 57) * 1.4 * hum : 0), y); g.rotate(o.rot || 0); g.scale(sc, sc);
    g.drawImage(body, -150, -230, 300, 230);
    const lift = (o.lid || 0) + (hum ? Math.max(0, Math.sin(t * 23)) * 0.12 * hum : 0);
    g.save(); g.translate(-154, -230 - lift * 16); g.rotate(-lift * 0.1); g.drawImage(lid, 0, -24, 308, 28); g.restore();
    if (o.leak) additive(g, (q) => { q.globalAlpha = o.leak; q.fillStyle = hg(q, -150, 150, [[0, 'rgba(255,150,210,0)'], [0.5, 'rgba(255,170,220,0.9)'], [1, 'rgba(255,150,210,0)']]); q.fillRect(-150, -236 - lift * 16, 300, 8 + lift * 10); q.globalAlpha = 1; });
    g.restore();
  }

  // ---- 母亲的外套：布料轮廓（u ∈ [-1,1] 横向，v ∈ [0,1] 领口→下摆），由映射函数决定形状（与「雾中之忆」一致）
  const COAT_OUT = [[-0.34, 0], [-0.62, 0.05], [-0.98, 0.42], [-0.98, 0.5], [-0.78, 0.52], [-0.58, 0.3], [-0.64, 1], [-0.05, 1], [0.05, 1], [0.64, 1], [0.58, 0.3], [0.78, 0.52], [0.98, 0.5], [0.98, 0.42], [0.62, 0.05], [0.34, 0], [0.16, 0.09], [0, 0.18], [-0.16, 0.09]];
  function coatCloth(g, map, o = {}) {
    const P = COAT_OUT.map(([u, v]) => map(u, v));
    g.save();
    g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); g.closePath();
    g.fillStyle = o.fill || '#f3ece2'; g.fill();
    g.save(); g.clip();
    g.strokeStyle = o.fold || 'rgba(150,120,110,0.35)'; g.lineWidth = o.lw || 3;
    for (const u of [-0.3, 0.02, 0.32]) { g.beginPath(); for (let i = 0; i <= 8; i++) { const p = map(u + Math.sin(i) * 0.03, 0.2 + i * 0.1); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke(); }
    g.strokeStyle = '#c8323a'; g.lineWidth = (o.lw || 3) * 3.2;
    g.beginPath(); for (let i = 0; i <= 12; i++) { const p = map(-0.7 + i * (1.4 / 12), 0.9); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke();
    for (const sd of [-1, 1]) { const a = map(sd * 0.98, 0.44), b = map(sd * 0.8, 0.5); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    g.restore();
    g.strokeStyle = o.ink || '#3a2228'; g.lineWidth = o.lw || 3; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); g.closePath(); g.stroke();
    const w0 = map(-0.1, 0.44), w1 = map(0.1, 0.44), wl = map(-0.16, 0.66), wr = map(0.12, 0.7);
    g.strokeStyle = '#d13a44'; g.lineWidth = (o.lw || 3) * 1.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w0[0], w0[1]); g.quadraticCurveTo((w0[0] + wl[0]) / 2 - 6, (w0[1] + wl[1]) / 2, wl[0], wl[1]); g.moveTo(w1[0], w1[1]); g.quadraticCurveTo((w1[0] + wr[0]) / 2 + 6, (w1[1] + wr[1]) / 2, wr[0], wr[1]); g.stroke();
    g.restore();
  }

  /* =========================================================
   * 标题
   * ========================================================= */
  function titleArt(q, variant) {
    // 设计尺寸 1400×560，中心 (700, 250)。variant：'day'（金色字 + 白描边）| 'night'（片尾：暖白字 + 深色描边）
    q.save();
    if (variant === 'night') {
      E.text(q, '晴日之约', 700, 236, { size: 150, weight: 900, spacing: 40, color: 'rgba(20,20,60,0.45)', stroke: 'rgba(20,20,60,0.35)', strokeW: 18 });
      const gr = vg(q, 100, 240, [[0, '#fffbe8'], [0.55, '#ffe6a6'], [1, '#ffc27a']]);
      E.text(q, '晴日之约', 700, 230, { size: 150, weight: 900, spacing: 40, color: gr });
      E.text(q, 'MISTY  MEMORY', 700, 322, { font: 'display', size: 50, weight: 700, spacing: 20, color: '#bfe8f0' });
      E.text(q, 'DAY VERSION', 700, 368, { font: 'display', size: 24, weight: 500, spacing: 16, color: 'rgba(255,226,236,0.9)' });
      q.strokeStyle = 'rgba(255,226,170,0.7)'; q.lineWidth = 2;
      q.beginPath(); q.moveTo(470, 396); q.lineTo(640, 396); q.moveTo(760, 396); q.lineTo(930, 396); q.stroke();
      q.restore();
      return;
    }
    // 阴影
    E.text(q, '晴日之约', 706, 250, { size: 164, weight: 900, spacing: 42, color: 'rgba(120,70,40,0.28)', stroke: 'rgba(120,70,40,0.22)', strokeW: 26 });
    const gr = vg(q, 90, 250, [[0, '#fffdf0'], [0.42, '#ffe28e'], [0.72, '#ffc454'], [1, '#f39a38']]);
    E.text(q, '晴日之约', 700, 240, { size: 164, weight: 900, spacing: 42, color: gr, stroke: '#fffdf6', strokeW: 20 });
    // 字里一道高光
    q.save(); q.globalCompositeOperation = 'source-atop'; q.fillStyle = 'rgba(255,255,255,0.35)'; q.fillRect(0, 118, 1400, 30); q.restore();
    E.text(q, 'MISTY  MEMORY', 700, 328, { font: 'display', size: 52, weight: 700, spacing: 20, color: '#2e8fb0', stroke: 'rgba(255,255,255,0.95)', strokeW: 12 });
    E.text(q, 'DAY VERSION', 700, 374, { font: 'display', size: 26, weight: 700, spacing: 16, color: '#e8678e', stroke: 'rgba(255,255,255,0.95)', strokeW: 8 });
    const ly = 418;
    q.strokeStyle = 'rgba(255,255,255,0.95)'; q.lineWidth = 7; q.lineCap = 'round';
    q.beginPath(); q.moveTo(470, ly); q.lineTo(632, ly); q.moveTo(768, ly); q.lineTo(930, ly); q.stroke();
    q.strokeStyle = '#f0a848'; q.lineWidth = 3;
    q.beginPath(); q.moveTo(470, ly); q.lineTo(632, ly); q.moveTo(768, ly); q.lineTo(930, ly); q.stroke();
    // 小火山 + 太阳（线描）
    q.save(); q.translate(700, ly + 4);
    q.fillStyle = '#fffdf6'; q.beginPath(); q.moveTo(-42, 14); q.lineTo(-12, -16); q.lineTo(12, -16); q.lineTo(42, 14); q.closePath(); q.fill();
    q.strokeStyle = '#e8678e'; q.lineWidth = 3.5; q.lineJoin = 'round'; q.beginPath(); q.moveTo(-34, 10); q.lineTo(-10, -12); q.lineTo(-3, -6); q.lineTo(4, -12); q.lineTo(10, -12); q.lineTo(34, 10); q.stroke();
    q.fillStyle = '#ffc454'; q.beginPath(); q.arc(18, -20, 5, 0, TAU); q.fill();
    q.restore();
    E.text(q, 'MV · 本页原创', 700, 478, { font: 'sans', size: 24, weight: 700, spacing: 8, color: '#3a7a96', stroke: 'rgba(255,255,255,0.9)', strokeW: 6 });
    q.restore();
  }

  /* =========================================================
   * 镜头 1 · 信（0 → 5.18）：船舷上，凯勒老师的信在晨风里扑簌簌地动
   * ========================================================= */
  function letterBg(q) {
    // 失焦的海与天（设计 2200×1300，从 (-140,-110) 开始铺）
    q.fillStyle = vg(q, 0, 1300, [[0, '#8cc6ea'], [0.3, '#c8e6f2'], [0.43, '#fff0dc'], [0.47, '#ffe2bf'], [0.5, '#9ad6d8'], [0.7, '#4cb4c4'], [1, '#2a8cb0']]);
    q.fillRect(0, 0, 2200, 1300);
    // 远处的岛（糊）
    q.fillStyle = 'rgba(140,150,190,0.45)'; q.beginPath(); q.moveTo(1500, 640); q.quadraticCurveTo(1700, 520, 1790, 500); q.quadraticCurveTo(1900, 520, 2200, 620); q.lineTo(2200, 660); q.lineTo(1500, 660); q.closePath(); q.fill();
    q.fillStyle = 'rgba(255,255,255,0.5)'; q.fillRect(1560, 628, 520, 10);
    // 横向的反光带
    for (let i = 0; i < 40; i++) { const y = 660 + Math.pow(hash(3, i), 1.4) * 620; q.fillStyle = `rgba(255,255,255,${0.05 + hash(4, i) * 0.08})`; q.fillRect(hash(5, i) * 2200 - 100, y, 200 + hash(6, i) * 600, 6 + hash(7, i) * 16); }
  }
  function letterArt(q) {
    // 设计 820×560：信纸（米白，横线），凯勒的字，羽毛印章
    q.save();
    q.fillStyle = 'rgba(40,40,60,0.18)'; q.save(); q.translate(14, 18); rrect(q, 20, 20, 780, 520, 10); q.fill(); q.restore();
    q.fillStyle = '#fffaf0'; rrect(q, 20, 20, 780, 520, 10); q.fill();
    q.fillStyle = 'rgba(240,226,200,0.6)'; q.fillRect(20, 20, 780, 60);
    q.strokeStyle = 'rgba(120,160,190,0.35)'; q.lineWidth = 2;
    for (let y = 150; y < 500; y += 66) { q.beginPath(); q.moveTo(60, y); q.lineTo(760, y); q.stroke(); }
    q.strokeStyle = 'rgba(220,120,120,0.4)'; q.beginPath(); q.moveTo(96, 90); q.lineTo(96, 520); q.stroke();
    E.text(q, 'SIESTA VOLCANO MUSEUM', 410, 62, { font: 'display', size: 22, weight: 700, spacing: 6, color: '#b0784e' });
    E.text(q, '阿黛尔：', 120, 136, { size: 40, weight: 700, color: '#2c3350', align: 'left' });
    E.text(q, '汐斯塔的夏天到了，博物馆就要开馆。', 120, 202, { size: 36, weight: 600, color: '#2c3350', align: 'left' });
    E.text(q, '来帮帮我吧——老火山也在等你。', 120, 268, { size: 36, weight: 600, color: '#2c3350', align: 'left' });
    E.text(q, '凯勒', 640, 400, { size: 42, weight: 700, color: '#2c3350', align: 'left' });
    // 羽毛（凯勒的署名小画）
    q.save(); q.translate(600, 380); q.rotate(-0.5);
    q.strokeStyle = '#6a7090'; q.lineWidth = 3; q.beginPath(); q.moveTo(0, 24); q.lineTo(0, -34); q.stroke();
    q.fillStyle = 'rgba(120,130,170,0.5)'; q.beginPath(); q.moveTo(0, -34); q.quadraticCurveTo(16, -10, 2, 18); q.quadraticCurveTo(-16, -10, 0, -34); q.fill();
    q.restore();
    // 小火山邮戳
    q.save(); q.translate(690, 470); q.rotate(-0.12);
    q.strokeStyle = 'rgba(214,90,90,0.75)'; q.lineWidth = 4; q.beginPath(); q.arc(0, 0, 50, 0, TAU); q.stroke(); q.lineWidth = 2; q.beginPath(); q.arc(0, 0, 40, 0, TAU); q.stroke();
    q.beginPath(); q.moveTo(-26, 16); q.lineTo(-8, -10); q.lineTo(8, -10); q.lineTo(26, 16); q.stroke();
    q.beginPath(); q.moveTo(-4, -16); q.quadraticCurveTo(2, -30, 12, -30); q.stroke();
    E.text(q, 'SIESTA', 0, 34, { font: 'sans', size: 14, weight: 700, color: 'rgba(214,90,90,0.85)', spacing: 2 });
    q.restore();
    q.strokeStyle = 'rgba(160,130,100,0.6)'; q.lineWidth = 2; rrect(q, 20, 20, 780, 520, 10); q.stroke();
    q.restore();
  }
  /**
   * 第一人称的一只手，捏着纸 / 卡片的一个下角：(x, y) 为那个角；side = 1 右手（右下角）/ -1 左手（左下角）
   * 局部坐标里纸在 x ≤ 0、y ≤ 0（往左上）；front = false 画纸后面的部分（袖子、手背、弯过去的食指），先画；
   * front = true 画压在纸面上的拇指（带指甲），后画
   */
  function gripHand(g, x, y, sc, side, front) {
    g.save(); g.translate(x, y); g.scale(sc * side, sc);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const ink = '#8a4a3e', skin = '#ffe8da', shade = 'rgba(232,150,132,0.34)';
    if (!front) {
      // 袖子（外套：米白 + 红 / 藏青两道袖口），从画面右下斜着伸上来
      g.fillStyle = '#efe7da'; g.strokeStyle = '#6a5a50'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(-10, 150); g.lineTo(98, 124); g.quadraticCurveTo(170, 280, 270, 470); g.lineTo(60, 470); g.quadraticCurveTo(20, 300, -10, 150); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(150,120,100,0.26)'; g.beginPath(); g.moveTo(98, 124); g.quadraticCurveTo(170, 280, 270, 470); g.lineTo(226, 470); g.quadraticCurveTo(140, 290, 76, 140); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(106,90,80,0.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(22, 262); g.quadraticCurveTo(70, 270, 128, 236); g.moveTo(44, 340); g.quadraticCurveTo(110, 350, 170, 318); g.stroke();
      g.lineCap = 'butt'; g.strokeStyle = '#c23b3b'; g.lineWidth = 10; g.beginPath(); g.moveTo(-6, 170); g.lineTo(104, 144); g.stroke();
      g.strokeStyle = '#26324e'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(-3, 183); g.lineTo(108, 157); g.stroke();
      g.lineCap = 'round';
      // 手背：拇指根的鱼际 → （纸后面）→ 食指从纸的侧边弯过去的一个指节 → 一排指节 → 掌外缘 → 手腕
      g.fillStyle = skin; g.strokeStyle = ink; g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(-2, 146);
      g.bezierCurveTo(-22, 126, -40, 74, -34, 24);
      g.lineTo(-34, -40); g.lineTo(0, -46);
      g.bezierCurveTo(16, -52, 32, -36, 34, -16);
      g.bezierCurveTo(40, 4, 46, 30, 48, 56);
      g.bezierCurveTo(52, 84, 58, 110, 64, 136);
      g.closePath(); g.fill(); g.stroke();
      // 掌外缘的阴影、弯着的食指的折线、两个小指节
      g.fillStyle = shade; g.beginPath(); g.moveTo(34, -16); g.bezierCurveTo(40, 4, 46, 30, 48, 56); g.bezierCurveTo(52, 84, 58, 110, 64, 136); g.lineTo(46, 140); g.bezierCurveTo(42, 100, 36, 60, 24, 0); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(138,74,62,0.5)'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(2, -24); g.quadraticCurveTo(18, -16, 30, -12); g.stroke();
      g.beginPath(); g.moveTo(36, 12); g.quadraticCurveTo(42, 18, 40, 26); g.moveTo(40, 40); g.quadraticCurveTo(46, 46, 44, 54); g.stroke();
    } else {
      // 拇指：从纸的下沿外面伸上来，斜着压在纸面上，指尖朝左上
      g.fillStyle = skin; g.strokeStyle = ink; g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(-6, 36);
      g.bezierCurveTo(-18, 4, -42, -30, -66, -56);
      g.bezierCurveTo(-76, -68, -96, -58, -90, -44);
      g.bezierCurveTo(-72, -20, -56, 8, -44, 42);
      g.closePath(); g.fill(); g.stroke();
      // 指腹一侧的阴影
      g.fillStyle = shade; g.beginPath(); g.moveTo(-90, -44); g.bezierCurveTo(-72, -20, -56, 8, -44, 42); g.lineTo(-34, 40); g.bezierCurveTo(-48, 8, -64, -18, -80, -40); g.closePath(); g.fill();
      // 指甲 + 高光
      g.fillStyle = 'rgba(255,224,216,0.96)'; g.strokeStyle = 'rgba(138,74,62,0.55)'; g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(-73, -46, 11, 7.5, 1.0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(-75, -50, 4, 1.8, 1.0, 0, TAU); g.fill();
      // 指节的一道纹
      g.strokeStyle = 'rgba(138,74,62,0.42)'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-54, -14); g.quadraticCurveTo(-44, -20, -36, -12); g.stroke();
    }
    g.restore();
  }
  function shotLetter(g, s) {
    const t = s.t, lt = s.lt;
    const up = ease.inOut(clamp((lt - 2.7) / 2.4));
    const cam = { x: 960 + lt * 8, y: lerp(560, 330, up), z: lerp(1.08, 1.0, clamp(lt / 5)), r: -0.012 + 0.01 * Math.sin(t * 0.8), ...hand(s, 3, 3, 0.3) };
    // 背景：失焦的海（随镜头轻微视差）
    inCam(g, cam, 0.12, (q) => q.drawImage(LC(s, 'lt-bg', 2200, 1300, letterBg, 0.3), -140, -110 - up * 120, 2200, 1300));
    inCam(g, cam, 0.15, (q) => {
      sun(q, 360, 300 - up * 110, 34, 0.9);
      // 海面上的碎光（失焦成一个个小光斑，一闪一闪）
      for (let i = 0; i < 16; i++) { const x = hash(11, i) * 2000, y = 580 + hash(12, i) * 170 + Math.sin(t * 0.6 + i) * 6; const tw = Math.max(0, Math.sin(t * (1.1 + hash(14, i)) + i * 1.7)); bokeh(q, x + Math.sin(t * 0.3 + i) * 20, y - up * 100, 14 + hash(13, i) * 26, '255,244,214', 0.1 + 0.3 * tw * tw); }
    });
    // 船舷（木扶手 + 白色的栏杆柱，失焦的前景）
    inCam(g, cam, 0.9, (q) => {
      q.fillStyle = '#f4f2ee'; for (let i = 0; i < 7; i++) { const x = -60 + i * 360, y = 1010 - (x + 200) * 0.054; q.fillRect(x, y + 20, 30, 420); q.fillStyle = 'rgba(120,140,170,0.35)'; q.fillRect(x + 20, y + 20, 10, 420); q.fillStyle = '#f4f2ee'; }
      q.fillStyle = vg(q, 880, 1100, [[0, '#c0844e'], [0.25, '#9a5e34'], [1, '#6a3c22']]);
      q.beginPath(); q.moveTo(-200, 996); q.quadraticCurveTo(1000, 930, 2200, 866); q.lineTo(2200, 960); q.quadraticCurveTo(1000, 1024, -200, 1090); q.closePath(); q.fill();
      q.fillStyle = 'rgba(255,236,200,0.55)'; q.beginPath(); q.moveTo(-200, 996); q.quadraticCurveTo(1000, 930, 2200, 866); q.lineTo(2200, 878); q.quadraticCurveTo(1000, 942, -200, 1010); q.closePath(); q.fill();
    });
    // 信：被风吹得一颤一颤（第一人称：两只手捏着信的下角）
    const flut = Math.sin(t * 9) * 0.01 + Math.sin(t * 13.7) * 0.005;
    inCam(g, cam, 1, (q) => {
      q.save(); q.translate(930, 520 + up * 80); q.rotate(-0.04 + flut);
      gripHand(q, 410, 280, 1.35, 1, false); gripHand(q, -410, 280, 1.35, -1, false);
      q.drawImage(LC(s, 'letter', 820, 560, letterArt, 1), -410, -280, 820, 560);
      // 纸的一角被风掀起
      const lift = 0.5 + 0.5 * Math.sin(t * 6.5);
      q.fillStyle = '#f2e8d6'; q.beginPath(); q.moveTo(390, -260); q.lineTo(300, -260); q.quadraticCurveTo(330 + lift * 20, -250 - lift * 30, 390, -170); q.closePath(); q.fill();
      q.strokeStyle = 'rgba(160,130,100,0.6)'; q.lineWidth = 2; q.stroke();
      gripHand(q, 410, 280, 1.35, 1, true); gripHand(q, -410, 280, 1.35, -1, true);
      // 阳光在纸上（暖）
      additive(q, (qq) => withAlpha(qq, 0.22, (q3) => { q3.fillStyle = hg(q3, -410, 410, [[0, 'rgba(255,220,160,0.9)'], [1, 'rgba(255,220,160,0)']]); q3.fillRect(-410, -280, 820, 560); }));
      q.restore();
    });
    // 飞过镜头前的一只真海鸥（离焦）
    inCam(g, cam, 1.4, (q) => { const gk = clamp((lt - 2.2) / 1.4); if (gk > 0 && gk < 1) gull(q, lerp(-300, 2300, gk), lerp(260, 120, gk) - up * 80, 2.4, t * 7.5, 1); });
    s.post.leak(g, t, { x: 260, y: 160, r: 1100, rgb: '255,196,130', a: 0.3 });
    vig(g, s, 0.4);
  }

  /* =========================================================
   * 汐斯塔（远景，从海上看）：旧火山、山脚的白色小镇、岬角上的灯塔与博物馆
   * 世界坐标 1920×1080，海平线 y = 604
   * ========================================================= */
  const SEA_HZ = 604;
  function isleVolcano(q, pal) {
    const N = pal === 'night';
    const cx = 1470, top = 318, base = SEA_HZ + 4;
    const slope = (x) => { const d = Math.abs(x - cx) / 640; return base - (base - top) * Math.pow(Math.max(0, 1 - d), 1.55); };
    q.beginPath(); q.moveTo(760, base);
    for (let x = 760; x <= 2180; x += 20) q.lineTo(x, Math.min(base, slope(x) + (Math.abs(x - cx) < 34 ? 10 * (1 - Math.abs(x - cx) / 34) : 0)));
    q.lineTo(2180, base + 4); q.lineTo(760, base + 4); q.closePath();
    q.fillStyle = N ? vg(q, top, base, [[0, '#3a3060'], [1, '#2a2448']]) : vg(q, top, base, [[0, '#9a8a9c'], [0.45, '#8e8494'], [0.7, '#7e9a78'], [1, '#6a9a6e']]);
    q.fill();
    if (!N) {
      q.save(); q.clip();
      // 阳光一侧（左）亮、右侧暗
      q.fillStyle = hg(q, 900, 2000, [[0, 'rgba(255,244,226,0.3)'], [0.5, 'rgba(255,244,226,0)'], [0.6, 'rgba(60,50,110,0)'], [1, 'rgba(60,50,110,0.28)']]); q.fillRect(760, top, 1420, base - top);
      // 山坡上的沟壑
      q.strokeStyle = 'rgba(90,70,100,0.25)'; q.lineWidth = 3;
      for (let i = 0; i < 12; i++) { const x0 = cx - 20 + (i - 6) * 9, x1 = cx + (i - 6) * 70 + hash(5, i) * 30; q.beginPath(); q.moveTo(x0, top + 16); q.quadraticCurveTo((x0 + x1) / 2 + (i - 6) * 8, (top + base) / 2, x1, base - 60 - hash(6, i) * 40); q.stroke(); }
      // 山脚的树丛
      q.fillStyle = 'rgba(70,130,80,0.55)'; for (let i = 0; i < 50; i++) { const x = 820 + hash(7, i) * 1300, y = base - 10 - hash(8, i) * 60 * (1 - Math.abs(x - cx) / 900); q.beginPath(); q.ellipse(x, y, 14 + hash(9, i) * 16, 8 + hash(9, i) * 6, 0, 0, TAU); q.fill(); }
      q.restore();
    }
    // 火山口一圈淡淡的亮边
    q.fillStyle = N ? 'rgba(255,170,210,0.35)' : 'rgba(255,240,230,0.6)'; q.beginPath(); q.ellipse(cx, top + 4, 30, 5, 0, 0, TAU); q.fill();
  }
  function isleTown(q, pal) {
    const N = pal === 'night';
    const R = E.rng(13);
    // 地面（小镇所在的山脚）
    q.fillStyle = N ? '#241c40' : '#9cb88a'; q.beginPath(); q.moveTo(930, 610); q.quadraticCurveTo(1100, 560, 1300, 552); q.lineTo(2000, 548); q.lineTo(2000, 610); q.closePath(); q.fill();
    let x = 1000;
    while (x < 1960) {
      const w = 16 + R() * 26, h = 10 + R() * 18 + (x > 1250 && x < 1500 ? 8 : 0), y0 = 598 - h - Math.max(0, (1500 - Math.abs(x - 1450)) / 1500) * 34 * R();
      const col = N ? (R() < 0.5 ? '#2e2650' : '#3a2e5c') : pick(['#fbf6ee', '#fbf6ee', '#f7d6c8', '#fbe8b8', '#f2c8d8', '#d8e8f4', '#fff8f0'], R());
      q.fillStyle = col; q.fillRect(x, y0, w, 612 - y0);
      if (!N) { q.fillStyle = 'rgba(80,100,150,0.22)'; q.fillRect(x + w * 0.62, y0, w * 0.38, 612 - y0); }
      const roof = R();
      if (roof < 0.45) { q.fillStyle = N ? '#241a40' : '#e0795a'; q.beginPath(); q.moveTo(x - 2, y0); q.lineTo(x + w / 2, y0 - 5 - R() * 5); q.lineTo(x + w + 2, y0); q.closePath(); q.fill(); }
      else if (roof < 0.55) { q.fillStyle = N ? '#241a40' : '#4a8ed0'; q.beginPath(); q.arc(x + w / 2, y0, w * 0.3, PI, 0); q.fill(); }
      for (let wy = y0 + 4; wy < 600; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 6) {
        const r = R();
        if (N) { if (r < 0.3) { q.fillStyle = r < 0.08 ? '#ffe2a8' : '#ffc27a'; q.fillRect(wx, wy, 2.4, 3); } }
        else if (r < 0.3) { q.fillStyle = r < 0.12 ? '#4a7ab0' : '#6a8aa8'; q.fillRect(wx, wy, 2.2, 3); }
      }
      if (R() < 0.2) palm(q, x + w + 3, 604, 26 + R() * 18, 0, { seed: x | 0, col: N ? '#150e28' : '#3f8a58', n: 7 });
      x += w + 1 + R() * 8;
    }
    // 岬角 + 灯塔（左）
    q.fillStyle = N ? '#1a1430' : '#b0a08a'; q.beginPath(); q.moveTo(880, 612); q.lineTo(900, 586); q.lineTo(960, 572); q.lineTo(1010, 578); q.lineTo(1040, 612); q.closePath(); q.fill();
    if (!N) { q.fillStyle = '#7cae6e'; q.beginPath(); q.moveTo(898, 588); q.lineTo(960, 572); q.lineTo(1010, 578); q.lineTo(1000, 584); q.lineTo(930, 588); q.closePath(); q.fill(); }
    q.fillStyle = N ? '#e9e0f0' : '#fbfaf6'; q.beginPath(); q.moveTo(950, 576); q.lineTo(954, 530); q.lineTo(966, 530); q.lineTo(970, 576); q.closePath(); q.fill();
    q.fillStyle = '#d04a52'; q.fillRect(952, 552, 16, 7); q.fillRect(953, 536, 14, 5);
    q.fillStyle = N ? '#2a2040' : '#3a4a60'; q.fillRect(951, 522, 18, 8); q.beginPath(); q.moveTo(950, 522); q.lineTo(960, 514); q.lineTo(970, 522); q.closePath(); q.fill();
    // 小山包上的博物馆（蓝色圆顶）
    q.fillStyle = N ? '#241c40' : '#8fb080'; q.beginPath(); q.moveTo(1150, 600); q.quadraticCurveTo(1240, 520, 1330, 600); q.closePath(); q.fill();
    q.fillStyle = N ? '#3a3058' : '#f4e8d4'; q.fillRect(1206, 528, 64, 26); q.fillStyle = N ? '#4a5a7a' : '#5a8ec8'; q.beginPath(); q.arc(1216, 530, 12, PI, 0); q.fill();
    if (!N) { q.fillStyle = '#c86a4a'; q.fillRect(1204, 526, 68, 3); }
    // 摩天轮（码头边）
    const fx = 1740, fy = 556, fr = 34;
    q.strokeStyle = N ? '#2e2450' : 'rgba(250,250,255,0.9)'; q.lineWidth = 2; q.beginPath(); q.arc(fx, fy, fr, 0, TAU); q.stroke();
    q.lineWidth = 1; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; q.beginPath(); q.moveTo(fx, fy); q.lineTo(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr); q.stroke(); }
    q.lineWidth = 3; q.beginPath(); q.moveTo(fx - 16, 600); q.lineTo(fx, fy); q.lineTo(fx + 16, 600); q.stroke();
    if (!N) for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; q.fillStyle = pick(['#ff8fb0', '#8ad0ff', '#ffd27a', '#b8f0c8'], hash(3, i)); q.fillRect(fx + Math.cos(a) * fr - 3, fy + Math.sin(a) * fr - 2, 6, 5); }
    // 防波堤
    q.fillStyle = N ? '#1c1634' : '#c8c0b0'; q.fillRect(1480, 606, 280, 5);
  }
  function isleSky(q, pal) {
    if (pal === 'dawn') q.fillStyle = vg(q, 0, SEA_HZ, [[0, '#4a98d8'], [0.35, '#86c0e8'], [0.62, '#cfe4ee'], [0.82, '#fdeedd'], [1, '#ffdcb8']]);
    else q.fillStyle = vg(q, 0, SEA_HZ, [[0, '#3a92da'], [0.4, '#78bdea'], [0.75, '#c4e6f4'], [1, '#eef8f6']]);
    q.fillRect(-300, -400, VW + 600, SEA_HZ + 900);
  }
  function isleSea(q, pal) {
    q.fillStyle = pal === 'dawn'
      ? vg(q, SEA_HZ, 1300, [[0, '#b8e2e2'], [0.05, '#8ed4d8'], [0.25, '#4ab8c8'], [0.6, '#2a98bc'], [1, '#17709a']])
      : vg(q, SEA_HZ, 1300, [[0, '#a8e4e6'], [0.05, '#6ed2d6'], [0.25, '#36bcc8'], [0.6, '#1f9cc0'], [1, '#12729e']]);
    q.fillRect(-300, SEA_HZ, VW + 600, 1300 - SEA_HZ);
    const R = E.rng(8);
    for (let i = 0; i < 420; i++) {
      const v = Math.pow(R(), 1.7), y = SEA_HZ + 3 + v * 680, x = R() * (VW + 600) - 300, w = 10 + R() * 70 * (0.3 + v);
      q.fillStyle = R() < 0.6 ? `rgba(255,255,255,${0.06 + R() * 0.12})` : `rgba(10,70,120,${0.05 + R() * 0.08})`;
      q.fillRect(x, y, w, 1 + v * 3);
    }
    // 海平线上一道亮线
    q.fillStyle = 'rgba(255,255,255,0.6)'; q.fillRect(-300, SEA_HZ - 1, VW + 600, 2);
  }
  // ---- 渡轮（侧面，面朝右）：设计 520×230，吃水线 y=180，船头在右；精灵图
  function ferryArt(q) {
    const ink = '#2a3048';
    // 船身
    q.beginPath(); q.moveTo(20, 120); q.lineTo(470, 120); q.quadraticCurveTo(505, 122, 512, 104); q.lineTo(500, 150); q.quadraticCurveTo(480, 196, 420, 200); q.lineTo(70, 200); q.quadraticCurveTo(30, 196, 18, 160); q.closePath();
    q.fillStyle = '#fbfbf8'; q.fill();
    q.save(); q.clip();
    q.fillStyle = '#2f6f96'; q.fillRect(0, 168, 520, 40);
    q.fillStyle = '#e0505a'; q.fillRect(0, 156, 520, 9);
    q.fillStyle = 'rgba(80,110,150,0.18)'; q.fillRect(0, 120, 520, 16);
    q.restore();
    q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
    for (let i = 0; i < 12; i++) { q.fillStyle = '#9ad0e8'; q.beginPath(); q.arc(70 + i * 32, 140, 5, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = 1.5; q.stroke(); }
    // 甲板建筑（两层）
    q.fillStyle = '#fbfbf8'; q.fillRect(110, 74, 260, 46); q.fillRect(160, 40, 170, 34);
    q.fillStyle = '#e8eef4'; q.fillRect(110, 110, 260, 10);
    q.fillStyle = '#5a8ab0'; for (let i = 0; i < 8; i++) q.fillRect(122 + i * 31, 84, 20, 16); for (let i = 0; i < 5; i++) q.fillRect(172 + i * 31, 50, 20, 14);
    q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(110, 74, 260, 46); q.strokeRect(160, 40, 170, 34);
    // 栏杆
    q.strokeStyle = 'rgba(42,48,72,0.7)'; q.lineWidth = 1.5; q.beginPath(); q.moveTo(24, 106); q.lineTo(480, 106); q.moveTo(170, 30); q.lineTo(320, 30); q.stroke();
    for (let x = 30; x < 480; x += 14) { q.beginPath(); q.moveTo(x, 106); q.lineTo(x, 120); q.stroke(); }
    // 烟囱（青绿色 + 白色波浪纹）
    q.fillStyle = '#3fb0b4'; q.beginPath(); q.moveTo(236, 40); q.lineTo(244, 0); q.lineTo(282, 0); q.lineTo(286, 40); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 2.5; q.stroke();
    q.fillStyle = '#2a2e3a'; q.fillRect(243, 0, 40, 6);
    q.strokeStyle = '#ffffff'; q.lineWidth = 3; q.beginPath(); q.moveTo(242, 22); q.quadraticCurveTo(252, 16, 262, 22); q.quadraticCurveTo(272, 28, 284, 22); q.stroke();
    // 救生艇
    q.fillStyle = '#f07a3a'; rrect(q, 126, 62, 50, 12, 6); q.fill(); rrect(q, 312, 62, 50, 12, 6); q.fill();
    // 桅杆
    q.strokeStyle = ink; q.lineWidth = 2.5; q.beginPath(); q.moveTo(420, 120); q.lineTo(420, 44); q.moveTo(60, 120); q.lineTo(60, 70); q.stroke();
  }
  /** 渡轮：(x, y) 为吃水线中点，sc 缩放；尾迹、烟、旗 */
  function ferry(g, s, x, y, sc, t, o = {}) {
    const bob = Math.sin(t * 1.3) * 3 * sc, rock = Math.sin(t * 1.1 + 0.5) * 0.012;
    // 尾迹：船后一道白色的 V
    withAlpha(g, 0.9, (q) => {
      for (let i = 0; i < 28; i++) {
        const u = i / 28, ph = fract(t * 0.6 + u);
        const xx = x - 250 * sc - u * 900 * sc, spread = u * 60 * sc;
        q.fillStyle = `rgba(255,255,255,${0.55 * (1 - u)})`;
        q.beginPath(); q.ellipse(xx, y + 4 * sc + spread * 0.12, 40 * sc * (1 - u * 0.4), (3 + spread * 0.08) * sc * 0.6, 0, 0, TAU); q.fill();
        if (i % 3 === 0) { q.fillStyle = `rgba(255,255,255,${0.35 * (1 - u) * (0.5 + 0.5 * Math.sin(ph * TAU))})`; q.fillRect(xx - 30 * sc, y + 10 * sc + spread * 0.4, 50 * sc, 2 * sc); q.fillRect(xx - 30 * sc, y - 2 * sc - spread * 0.1, 40 * sc, 1.5 * sc); }
      }
    });
    // 烟
    for (let i = 0; i < 7; i++) { const ph = fract(t * 0.35 + i / 7); withAlpha(g, (1 - ph) * 0.5, (q) => q.drawImage(puff(i, '255,255,255'), x + (-5 - ph * 160) * sc - 60 * sc * (0.5 + ph), y + (-205 - ph * 60) * sc - 30 * sc * (0.5 + ph), 120 * sc * (0.5 + ph), 60 * sc * (0.5 + ph))); }
    if (o.horn) { const k = o.horn; for (let i = 0; i < 5; i++) withAlpha(g, Math.sin(PI * k) * 0.9, (q) => q.drawImage(puff(i + 3, '255,255,255'), x + (-20 - k * 120 - i * 20) * sc - 70 * sc, y + (-230 - k * 60 - i * 12) * sc - 35 * sc, 140 * sc * (0.6 + k), 70 * sc * (0.6 + k))); }
    g.save(); g.translate(x, y + bob); g.rotate(rock); g.scale(sc, sc);
    g.drawImage(LC(s, 'ferry', 520, 210, ferryArt, Math.max(0.5, Math.min(2, sc * 1.4))), -260, -200, 520, 210);
    // 桅杆上的旗
    g.fillStyle = '#e0505a'; g.beginPath(); g.moveTo(160, -156); for (let i = 0; i <= 6; i++) g.lineTo(160 + i * 6, -156 + Math.sin(t * 9 + i) * 2.4); for (let i = 6; i >= 0; i--) g.lineTo(160 + i * 6, -142 + Math.sin(t * 9 + i + 0.5) * 2.4); g.fill();
    g.fillStyle = '#3fb0b4'; g.beginPath(); g.moveTo(-200, -130); for (let i = 0; i <= 5; i++) g.lineTo(-200 + i * 6, -130 + Math.sin(t * 9 + i + 2) * 2); for (let i = 5; i >= 0; i--) g.lineTo(-200 + i * 6, -118 + Math.sin(t * 9 + i + 2.5) * 2); g.fill();
    // 船头的浪
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(240, -2, 34 + Math.sin(t * 5) * 4, 7, 0, 0, TAU); g.fill();
    g.restore();
  }
  /** 火山口的一缕烟（白里透粉） */
  function plume(g, t, cx, cy, sc, o = {}) {
    const n = o.n || 18, A = g.globalAlpha;
    for (let i = 0; i < n; i++) {
      const u = fract(t * (o.speed || 0.02) + i / n);
      const px = cx - u * 260 * sc - u * u * 120 * sc + Math.sin(u * 7 + i) * 14 * sc;
      const py = cy - u * 300 * sc + u * u * 60 * sc;
      const r = (18 + u * 150) * sc * (0.85 + 0.3 * hash(5, i));
      g.globalAlpha = A * (o.a || 0.6) * Math.sin(PI * Math.min(1, u * 1.1 + 0.03)) * (0.7 + 0.3 * hash(3, i));
      g.drawImage(puff(i, u > 0.45 && i % 3 === 0 ? (o.rgb2 || '255,214,232') : (o.rgb || '255,255,255')), px - r, py - r * 0.6, r * 2, r * 1.2);
    }
    g.globalAlpha = A;
  }
  function shotSea(g, s) {
    const t = s.t, lt = s.lt, k = ease.inOut(clamp(lt / 9.2));
    const cam = { x: lerp(900, 1010, k), y: lerp(520, 560, k), z: lerp(1.0, 1.1, k), ...hand(s, 5, 2, 0.25) };
    inCam(g, cam, 0.02, (q) => q.drawImage(LC(s, 'isle-sky2-dawn', VW + 600, SEA_HZ + 900, (qq) => { qq.translate(300, 400); isleSky(qq, 'dawn'); }, 0.25), -300, -400, VW + 600, SEA_HZ + 900));
    inCam(g, cam, 0.05, (q) => {
      sun(q, 520, 250, 40, 1);
      for (const [seed, x, y, w, h, sp] of [[11, 180, 470, 420, 150, 5], [12, 760, 520, 300, 110, 7], [13, 1180, 420, 520, 190, 4], [14, 1650, 500, 360, 120, 6], [15, -200, 380, 380, 140, 3]]) q.drawImage(cloud(s, seed, w, h, 'morn'), x + t * sp - 60, y - h, w, h);
      // 羊形的云（多利的预兆）：12 秒左右眨一下眼
      q.save(); q.translate(1360 + t * 6, 110); q.drawImage(sheepCloud(s, 'day'), 0, 0, 330 * 1.05, 210 * 1.05);
      const blink = win(t, 11.6, 11.7, 11.85, 11.95);
      if (blink > 0) { q.fillStyle = '#ffffff'; q.fillRect(274 * 1.05, 80 * 1.05, 14, 12 * blink); }
      q.restore();
    });
    baked(g, s, 'isle-volc-day', { x: 960, y: 540, z: 1 }, cam, 0.16, (q) => isleVolcano(q, 'day'), 0.7, [740, 300, 2200, 620]);
    inCam(g, cam, 0.16, (q) => plume(q, t, 1470, 318, 0.8, { a: 0.55, speed: 0.018 }));
    baked(g, s, 'isle-town-day', { x: 960, y: 540, z: 1 }, cam, 0.2, (q) => isleTown(q, 'day'), 1, [860, 500, 2020, 616]);
    baked(g, s, 'isle-sea-dawn', { x: 960, y: 540, z: 1 }, cam, 0.3, (q) => isleSea(q, 'dawn'), 0.6, [-300, SEA_HZ - 2, VW + 300, 1300]);
    inCam(g, cam, 0.3, (q) => {
      glints(q, t, { y0: SEA_HZ + 2, y1: 1200, sunX: 520, n: 150, seed: 17, pw0: 40, pw1: 900, a: 1 });
      waveLines(q, t, { y0: SEA_HZ + 10, y1: 1200, n: 36, vx: -6, a: 0.45 });
    });
    inCam(g, cam, 0.5, (q) => {
      ferry(q, s, lerp(560, 780, lt / 9.2), 790, 0.62, t);
      gulls(q, t, { n: 5, seed: 41, y0: 300, y1: 520, s: 0.5, speed: 60, far: true });
    });
    inCam(g, cam, 1.1, (q) => gulls(q, t + 3, { n: 3, seed: 43, y0: 200, y1: 420, s: 1.3, speed: 150 }));
    s.post.leak(g, t, { x: 520, y: 260, r: 1300, rgb: '255,200,140', a: 0.28 });
    flare(g, 520 - (cam.x - 960) * 0.05, 250 - (cam.y - 540) * 0.05, 0.9);
    vig(g, s, 0.3);
  }

  /* =========================================================
   * 镜头 3 · 船头（14.30 → 18.88）：风、浪花、海鸥；她在船头挥手
   * ========================================================= */
  function bowDeck(q) {
    // 设计：甲板（木板，透视）+ 右侧的白色舷墙（青绿色扶手）向船头收拢
    q.fillStyle = vg(q, 820, 1080, [[0, '#c89a68'], [1, '#a47444']]);
    q.beginPath(); q.moveTo(-200, 850); q.lineTo(1500, 820); q.lineTo(1880, 900); q.lineTo(2100, 1080); q.lineTo(-200, 1080); q.closePath(); q.fill();
    q.strokeStyle = 'rgba(90,50,24,0.35)'; q.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const y = 850 + Math.pow(i / 11, 1.5) * 230; q.beginPath(); q.moveTo(-200, y); q.lineTo(1500 + (y - 820) * 1.6, y - 30 + (y - 850) * 0.1); q.stroke(); }
    q.fillStyle = 'rgba(255,240,210,0.25)'; q.fillRect(-200, 850, 1700, 4);
    // 舷墙（船头在右）
    q.beginPath(); q.moveTo(-200, 760); q.lineTo(1540, 700); q.quadraticCurveTo(1760, 700, 1900, 820); q.lineTo(1920, 900); q.lineTo(1880, 900); q.lineTo(1500, 820); q.lineTo(-200, 850); q.closePath();
    q.fillStyle = '#fbfbf8'; q.fill(); q.strokeStyle = '#2a3048'; q.lineWidth = 3; q.stroke();
    q.fillStyle = 'rgba(90,120,170,0.16)'; q.beginPath(); q.moveTo(-200, 800); q.lineTo(1500, 760); q.lineTo(1500, 820); q.lineTo(-200, 850); q.closePath(); q.fill();
    // 扶手
    q.strokeStyle = '#3fb0b4'; q.lineWidth = 12; q.lineCap = 'round'; q.beginPath(); q.moveTo(-200, 752); q.lineTo(1540, 692); q.quadraticCurveTo(1770, 694, 1910, 816); q.stroke();
    q.strokeStyle = 'rgba(255,255,255,0.6)'; q.lineWidth = 3; q.beginPath(); q.moveTo(-200, 747); q.lineTo(1540, 687); q.quadraticCurveTo(1770, 689, 1910, 811); q.stroke();
    q.lineCap = 'butt';
    // 救生圈
    q.save(); q.translate(820, 764); q.scale(1, 0.96);
    q.lineWidth = 22; for (let i = 0; i < 8; i++) { q.strokeStyle = i % 2 ? '#ffffff' : '#e0505a'; q.beginPath(); q.arc(0, 0, 40, (i / 8) * TAU, ((i + 1) / 8) * TAU); q.stroke(); }
    q.strokeStyle = '#2a3048'; q.lineWidth = 2; q.beginPath(); q.arc(0, 0, 51, 0, TAU); q.stroke(); q.beginPath(); q.arc(0, 0, 29, 0, TAU); q.stroke();
    q.restore();
    // 缆绳卷
    q.strokeStyle = '#d8c090'; q.lineWidth = 7; for (let i = 0; i < 4; i++) { q.beginPath(); q.ellipse(640, 990, 80 - i * 15, 24 - i * 4.5, 0, 0, TAU); q.stroke(); }
    q.strokeStyle = 'rgba(120,90,50,0.5)'; q.lineWidth = 2; for (let i = 0; i < 4; i++) { q.beginPath(); q.ellipse(640, 990, 80 - i * 15, 24 - i * 4.5, 0, 0.2, 1.4); q.stroke(); }
    // 系缆桩
    q.fillStyle = '#5a6478'; q.fillRect(1500, 850, 44, 36); q.fillRect(1486, 846, 72, 12); q.fillStyle = 'rgba(255,255,255,0.3)'; q.fillRect(1500, 850, 8, 36);
    // 旗杆（船头）
    q.strokeStyle = '#2a3048'; q.lineWidth = 6; q.beginPath(); q.moveTo(1820, 780); q.lineTo(1840, 420); q.stroke();
  }
  function shotBow(g, s) {
    const t = s.t, lt = s.lt;
    const kick = s.barPulse(5);
    const roll = Math.sin(t * 1.3) * 0.008;
    const cam = { x: 960 + lt * 10, y: 540, z: 1.0 + 0.012 * kick, r: roll, ...hand(s, 7, 4, 0.5) };
    inCam(g, cam, 0.02, (q) => q.drawImage(LC(s, 'isle-sky2-day', VW + 600, SEA_HZ + 900, (qq) => { qq.translate(300, 400); isleSky(qq, 'day'); }, 0.25), -300, -400 + 30, VW + 600, SEA_HZ + 900));
    inCam(g, cam, 0.06, (q) => {
      sun(q, 360, 170, 36, 1);
      for (const [seed, x, y, w, h, sp] of [[21, 60, 420, 460, 170, 14], [22, 700, 360, 380, 150, 12], [23, 1300, 300, 560, 210, 10], [24, 1800, 420, 300, 110, 16]]) { const xx = ((x - t * sp * 2 + 2400) % 2600) - 400; q.drawImage(cloud(s, seed, w, h, 'day'), xx, y - h + 30, w, h); }
    });
    // 远方的汐斯塔（比上个镜头近了）
    inCam(g, cam, 0.12, (q) => { q.save(); q.translate(1250, 628); q.scale(1.45, 1.45); q.translate(-1470, -SEA_HZ); q.drawImage(LC(s, 'isle-far-day', 1500, 330, (qq) => { qq.translate(-740, -300); isleVolcano(qq, 'day'); isleTown(qq, 'day'); }, 0.8), 740, 300, 1500, 330); plume(q, t, 1470, 318, 0.8, { a: 0.5 }); q.restore(); });
    baked(g, s, 'bow-sea', { x: 960, y: 540, z: 1 }, cam, 0.3, (q) => { q.translate(0, 30); isleSea(q, 'day'); }, 0.6, [-300, SEA_HZ + 26, VW + 300, 1300]);
    inCam(g, cam, 0.3, (q) => {
      glints(q, t, { y0: SEA_HZ + 32, y1: 1150, sunX: 360, n: 150, seed: 19, pw0: 40, pw1: 800, vx: -140 });
      waveLines(q, t, { y0: SEA_HZ + 40, y1: 1150, n: 44, vx: -260, a: 0.55 });
    });
    inCam(g, cam, 0.7, (q) => gulls(q, t, { n: 4, seed: 45, y0: 260, y1: 420, s: 0.9, speed: 40, dir: 1 }));
    // 甲板
    baked(g, s, 'bow-deck', { x: 960, y: 540, z: 1 }, cam, 1, bowDeck, 1, [-220, 400, 2140, 1100]);
    inCam(g, cam, 1, (q) => {
      // 船头的小旗（风里猎猎地飘）
      q.fillStyle = '#e0505a'; q.beginPath(); q.moveTo(1840, 424); for (let i = 0; i <= 10; i++) q.lineTo(1840 - i * 14, 424 + Math.sin(t * 11 - i * 0.8) * (3 + i * 1.2) + i * 1.5); for (let i = 10; i >= 0; i--) q.lineTo(1840 - i * 14, 468 + Math.sin(t * 11 - i * 0.8 + 0.4) * (3 + i * 1.2) - i * 1.2); q.closePath(); q.fill();
      q.fillStyle = '#ffffff'; q.beginPath(); q.arc(1800, 446, 8, 0, TAU); q.fill();
      // 同船的游客：一个举着相机，一个指着岛
      // 同船的旅客：琳琅诗怀雅（看风景）、苍苔（指着岸上）
      townsfolk(q, s, { x: 250, y: 900, h: 450, seed: 13, pose: 'hold', prop: 'camera', t, flip: false, look: [1, -0.2], expr: 'smile', wind: 0.6, windDir: -1 }, 1);
      townsfolk(q, s, { x: 440, y: 880, h: 330, seed: 0, pose: 'point', aim: -0.25, t: t + 0.5, flip: false, look: [1, -0.4], expr: 'laugh', wind: 0.6, windDir: -1 }, 2);
      // 她：先手搭凉棚远望，第二小节开始挥手
      const waveOn = t > D[7] - 0.05;
      adele(q, mixIn({ x: 1180, y: 846, h: 470, pose: waveOn ? 'wave' : 'shade', t, expr: waveOn ? 'laugh' : 'smile', look: [1, -0.3], wind: 0.85, windDir: -1 }, 'shade', D[7] - 0.05, 0.25, t));
      // 船头溅起的浪花：一拍一簇，从舷墙外飞上来、向后洒
      const bt = s.beat - T0beat(s);
      for (let j = 0; j < 4; j++) {
        const b0 = Math.floor(bt) - j, age = (bt - b0) * BEAT;
        if (b0 < -1) continue;
        const big = 0.7 + 0.5 * s.T.env('low', s.shot.t0 + b0 * BEAT);
        for (let i = 0; i < 16; i++) {
          const vx = -(160 + hash(b0 * 13 + 3, i) * 520), vy = -(420 + hash(b0 * 13 + 4, i) * 520) * big;
          const x = 1880 + vx * age, y = 790 + vy * age + 1500 * age * age;
          const a = 1 - age / 1.2;
          if (a <= 0 || y > 1120) continue;
          const r = (5 + hash(b0, i) * 9) * (1 - age * 0.3);
          q.fillStyle = `rgba(255,255,255,${0.9 * a})`; q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill();
          if (i % 4 === 0) withAlpha(q, a * 0.6, (qq) => qq.drawImage(puff(i, '255,255,255'), x - 40, y - 20, 80, 40));
        }
      }
    });
    // 前景：掠过镜头的海鸥（大、离焦）
    inCam(g, cam, 1.5, (q) => { const gk = clamp((lt - 1.2) / 1.3); if (gk > 0 && gk < 1) gull(q, lerp(2300, -400, gk), lerp(360, 200, gk), 3.6, t * 6, -1); });
    // 喇叭声：开场那一下，画面左上方喷一团白汽
    const hk = clamp(lt / 1.4);
    if (hk < 1) inCam(g, cam, 0.9, (q) => { for (let i = 0; i < 5; i++) withAlpha(q, Math.sin(PI * hk) * 0.85, (qq) => qq.drawImage(puff(i + 7, '255,255,255'), 120 - hk * 160 - i * 40, 80 - hk * 120 - i * 16, 300 * (0.6 + hk), 150 * (0.6 + hk))); });
    flare(g, 360 - (cam.x - 960) * 0.06, 170, 0.8);
    vig(g, s, 0.3);
  }

  /* =========================================================
   * 汐斯塔的白天（街景）：一整条山脚下的彩色小房子（立面图，分 3 层视差）+ 远处的火山
   * 世界宽 -300..4600；近层房子的地面 y = 880（街面），街面往前是步道 / 码头 / 沙滩
   * ========================================================= */
  const PASTEL_D = ['#f9c0d0', '#ffd6b8', '#d9c6f4', '#bfe8dc', '#fbe6aa', '#c0d8f6', '#fbf6ee', '#f6b8ae', '#fff9f0', '#fbf6ee', '#e8d8f8', '#fdf2e2'];
  const SHUT_D = ['#35a3a3', '#4a7ac8', '#8a6ac0', '#d0607a', '#4a9a6a', '#e0a040', '#3a8ad0'];
  function mkRowD(seed, x0, x1, base, hmin, hmax, wmin, wmax) {
    const R = E.rng(seed), out = [];
    let x = x0;
    while (x < x1) {
      const w = wmin + R() * (wmax - wmin), h = hmin + R() * (hmax - hmin);
      out.push({ x, w, top: base - h, base, col: pick(PASTEL_D, R()), roof: R(), style: R(), seed: (R() * 1e6) | 0 });
      x += w + (R() < 0.3 ? 10 + R() * 30 : -R() * 10);
    }
    return out;
  }
  const TOWN = {
    far: mkRowD(401, -300, 4700, 610, 90, 200, 80, 150),
    mid: mkRowD(402, -300, 4700, 745, 190, 350, 140, 240),
    near: mkRowD(403, -300, 4700, 880, 300, 500, 220, 330),
  };
  const INK_D = 'rgba(52,52,86,0.8)';
  /** 一栋房子（白天）：阳光从左上方来，右侧和屋檐下是偏蓝紫的阴影 */
  function drawHouseD(q, h, detail, R, sign) {
    const { x, w, top, base } = h, ink = INK_D, H = base - top;
    const flat = h.roof >= 0.55;
    // 屋顶
    if (h.roof < 0.42) {
      const rc = h.style < 0.5 ? '#e27b5c' : '#d4646c';
      q.fillStyle = rc; q.beginPath(); q.moveTo(x - 12, top + 2); q.lineTo(x + w / 2, top - w * 0.24); q.lineTo(x + w + 12, top + 2); q.closePath(); q.fill();
      q.fillStyle = 'rgba(255,236,210,0.28)'; q.beginPath(); q.moveTo(x - 12, top + 2); q.lineTo(x + w / 2, top - w * 0.24); q.lineTo(x + w / 2, top + 2); q.closePath(); q.fill();
      if (detail > 0.5) { q.strokeStyle = 'rgba(110,40,30,0.3)'; q.lineWidth = 2; for (let i = 1; i < 6; i++) { const yy = top - w * 0.24 * (1 - i / 6); q.beginPath(); q.moveTo(x + w / 2 - (w / 2 + 12) * (i / 6), yy + 2); q.lineTo(x + w / 2 + (w / 2 + 12) * (i / 6), yy + 2); q.stroke(); } }
      q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.moveTo(x - 12, top + 2); q.lineTo(x + w / 2, top - w * 0.24); q.lineTo(x + w + 12, top + 2); q.stroke();
      if (h.style > 0.72) { q.fillStyle = '#c86a58'; q.fillRect(x + w * 0.68, top - w * 0.28, 18, w * 0.2); q.strokeRect(x + w * 0.68, top - w * 0.28, 18, w * 0.2); q.fillStyle = '#8a4a3a'; q.fillRect(x + w * 0.68 - 3, top - w * 0.28 - 5, 24, 6); }
    } else if (h.roof < 0.55) {
      const dc = h.style < 0.55 ? '#4a8ed0' : '#f6f2ea';
      q.fillStyle = dc; q.beginPath(); q.arc(x + w / 2, top - 14, w * 0.3, PI, 0); q.fill();
      q.fillStyle = h.style < 0.55 ? 'rgba(200,230,255,0.5)' : 'rgba(255,255,255,0.8)'; q.beginPath(); q.arc(x + w / 2, top - 14, w * 0.3 - 5, PI * 1.08, PI * 1.45); q.lineTo(x + w / 2, top - 14); q.closePath(); q.fill();
      q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.arc(x + w / 2, top - 14, w * 0.3, PI, 0); q.stroke();
      q.fillStyle = '#fbf6ee'; q.fillRect(x + w / 2 - 2, top - 14 - w * 0.3 - 16, 4, 16); q.fillRect(x + w / 2 - 7, top - 14 - w * 0.3 - 11, 14, 3);
    }
    // 墙
    const wt = top - (flat || h.roof >= 0.42 ? 14 : 0);
    q.fillStyle = h.col; q.fillRect(x, wt, w, base - wt);
    q.fillStyle = vg(q, wt, base, [[0, 'rgba(255,255,255,0.16)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(120,90,110,0.08)']]); q.fillRect(x, wt, w, base - wt);
    q.fillStyle = 'rgba(80,90,160,0.13)'; q.fillRect(x + w * 0.84, wt, w * 0.16, base - wt);
    if (flat || h.roof >= 0.42) { q.fillStyle = '#fbf6ee'; q.fillRect(x - 6, top - 18, w + 12, 8); q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(x - 6, top - 18, w + 12, 8); q.fillStyle = 'rgba(80,90,160,0.16)'; q.fillRect(x, top - 10, w, 10); }
    else { q.fillStyle = 'rgba(80,90,160,0.16)'; q.fillRect(x, top, w, 12); }
    if (detail > 0.4) { for (let i = 0; i < 24; i++) { q.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(120,100,120,0.06)'; q.fillRect(x + R() * w, top + R() * H, 4 + R() * 16, 2 + R() * 4); } }
    // 窗
    const floors = Math.max(1, Math.floor((H - (detail > 0.7 ? 150 : 40)) / 100)), cols = Math.max(1, Math.round(w / 95));
    const shut = pick(SHUT_D, h.style);
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const wx = x + ((c + 0.5) * w) / cols, wy = top + 36 + f * 100, ww = Math.min(42, (w / cols) * 0.46), wh = 58;
      const arch = h.style > 0.45;
      const win = () => { q.beginPath(); if (arch) { q.moveTo(wx - ww / 2, wy + wh); q.lineTo(wx - ww / 2, wy + ww / 2); q.arc(wx, wy + ww / 2, ww / 2, PI, 0); q.lineTo(wx + ww / 2, wy + wh); q.closePath(); } else q.rect(wx - ww / 2, wy, ww, wh); };
      win(); q.fillStyle = '#44668c'; q.fill();
      if (detail > 0.3) { q.save(); win(); q.clip(); q.fillStyle = 'rgba(170,215,245,0.55)'; q.beginPath(); q.moveTo(wx - ww / 2, wy + wh * 0.7); q.lineTo(wx + ww / 2, wy + wh * 0.2); q.lineTo(wx + ww / 2, wy + wh * 0.45); q.lineTo(wx - ww / 2, wy + wh * 0.95); q.closePath(); q.fill(); q.fillStyle = 'rgba(30,40,80,0.35)'; q.fillRect(wx - ww / 2, wy, ww, 7); q.restore(); }
      q.strokeStyle = '#fbf6ee'; q.lineWidth = 3; win(); q.stroke();
      q.strokeStyle = ink; q.lineWidth = 2; win(); q.stroke();
      if (detail > 0.5) {
        q.strokeStyle = 'rgba(250,246,238,0.9)'; q.lineWidth = 2; q.beginPath(); q.moveTo(wx, wy + (arch ? 4 : 0)); q.lineTo(wx, wy + wh); q.moveTo(wx - ww / 2, wy + wh * 0.5); q.lineTo(wx + ww / 2, wy + wh * 0.5); q.stroke();
        if (R() < 0.7) {
          q.fillStyle = shut; q.fillRect(wx - ww / 2 - 15, wy + 3, 13, wh - 3); q.fillRect(wx + ww / 2 + 2, wy + 3, 13, wh - 3);
          q.strokeStyle = 'rgba(20,30,60,0.35)'; q.lineWidth = 1.2; for (let yy = wy + 9; yy < wy + wh - 2; yy += 6) { q.beginPath(); q.moveTo(wx - ww / 2 - 14, yy); q.lineTo(wx - ww / 2 - 3, yy); q.moveTo(wx + ww / 2 + 3, yy); q.lineTo(wx + ww / 2 + 14, yy); q.stroke(); }
          q.strokeStyle = ink; q.lineWidth = 1.6; q.strokeRect(wx - ww / 2 - 15, wy + 3, 13, wh - 3); q.strokeRect(wx + ww / 2 + 2, wy + 3, 13, wh - 3);
        }
        if (R() < 0.5) { q.fillStyle = '#9a6a4a'; q.fillRect(wx - ww / 2 - 4, wy + wh, ww + 8, 9); for (let i = 0; i < 6; i++) { q.fillStyle = R() < 0.35 ? '#3e8a4a' : R() < 0.6 ? '#ff4a7a' : '#ffb0c8'; q.beginPath(); q.arc(wx - ww / 2 + 2 + i * (ww / 5), wy + wh - 2 - R() * 5, 4 + R() * 3, 0, TAU); q.fill(); } }
      }
    }
    // 近层：门、雨篷、阳台、招牌、三角梅
    if (detail > 0.7) {
      const dx = x + w * (0.3 + R() * 0.4);
      q.fillStyle = pick(['#3a7ab8', '#2f8a7c', '#b85a6a', '#6a5a8a', '#3a9aa8'], R()); archPath(q, dx, base - 62, 64, 124); q.fill();
      q.fillStyle = 'rgba(255,255,255,0.18)'; q.fillRect(dx - 32, base - 90, 8, 90);
      q.strokeStyle = ink; q.lineWidth = 3; archPath(q, dx, base - 62, 64, 124); q.stroke();
      q.strokeStyle = 'rgba(20,30,60,0.35)'; q.lineWidth = 1.6; q.beginPath(); q.moveTo(dx, base - 110); q.lineTo(dx, base); q.stroke();
      q.fillStyle = '#e8c060'; q.beginPath(); q.arc(dx + 16, base - 58, 4, 0, TAU); q.fill();
      q.fillStyle = '#d8ccb8'; q.fillRect(dx - 44, base - 6, 88, 6);
      if (sign) sign(q, h, dx);
      else if (R() < 0.45) {
        const ay = base - 150, aw = Math.min(w - 20, 170), ax = x + (w - aw) / 2, cA = pick(['#e0506a', '#3a9ad0', '#f09a3a', '#8a60c0', '#3aaa8a'], R());
        for (let i = 0; i < 7; i++) { q.fillStyle = i % 2 ? '#fffaf2' : cA; q.beginPath(); q.moveTo(ax + (i * aw) / 7, ay); q.lineTo(ax + ((i + 1) * aw) / 7, ay); q.lineTo(ax + ((i + 1) * aw) / 7 + 6, ay + 34); q.lineTo(ax + (i * aw) / 7 + 6, ay + 34); q.closePath(); q.fill(); }
        q.fillStyle = 'rgba(60,60,110,0.2)'; q.fillRect(ax + 6, ay + 34, aw, 16);
        q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(ax, ay, aw + 6, 34);
      } else if (floors > 1) {
        const by = top + 36 + 100 + 64, bw = Math.min(w - 30, 150), bx = x + (w - bw) / 2;
        q.fillStyle = 'rgba(60,60,110,0.18)'; q.fillRect(bx - 8, by + 8, bw + 16, 14);
        q.fillStyle = '#fbf6ee'; q.fillRect(bx - 8, by, bw + 16, 8);
        q.strokeStyle = '#fbf6ee'; q.lineWidth = 3; for (let i = 0; i <= 10; i++) { q.beginPath(); q.moveTo(bx + (i * bw) / 10, by); q.lineTo(bx + (i * bw) / 10, by - 32); q.stroke(); }
        q.beginPath(); q.moveTo(bx - 8, by - 32); q.lineTo(bx + bw + 8, by - 32); q.stroke();
        q.strokeStyle = ink; q.lineWidth = 1.5; q.strokeRect(bx - 8, by, bw + 16, 8);
        for (let i = 0; i < 5; i++) { q.fillStyle = i % 2 ? '#ff5a8a' : '#3e8a4a'; q.beginPath(); q.arc(bx + 10 + i * (bw / 5), by - 38, 9, 0, TAU); q.fill(); }
      }
      if (R() < 0.4) bougainvillea(q, R() < 0.5 ? x + 6 : x + w - 6, base, 60 + R() * 60, H * (0.5 + R() * 0.4), R);
    }
    q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.moveTo(x, base); q.lineTo(x, wt); q.moveTo(x + w, wt); q.lineTo(x + w, base); q.stroke();
  }
  /** 三角梅：沿墙角爬上去的一丛（先铺叶子，再点花） */
  function bougainvillea(q, x, base, r, hgt, R) {
    const n = Math.round(hgt / 30);
    for (let i = 0; i < n; i++) {
      const cy = base - (i / n) * hgt, cx = x + Math.sin(i * 1.3) * r * 0.25, rr = r * (0.5 + 0.5 * Math.sin(PI * (0.2 + 0.8 * i / n)));
      for (let j = 0; j < 7; j++) { const a = R() * TAU, d = R() * rr; q.fillStyle = j % 3 ? '#3a7a4a' : '#4e9a5a'; q.beginPath(); q.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6, 10, 6, a, 0, TAU); q.fill(); }
      for (let j = 0; j < 9; j++) { const a = R() * TAU, d = Math.pow(R(), 0.7) * rr * 0.9; q.fillStyle = R() < 0.55 ? '#e0409a' : '#ff78b8'; q.beginPath(); q.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6, 4 + R() * 3, 0, TAU); q.fill(); }
    }
  }
  /** 一层房子（白天）：远层加一层淡蓝的空气透视 */
  function townLayerD(q, which, hazeA, detail, x0, x1, signs) {
    const row = TOWN[which];
    for (const h of row) { if (h.x + h.w < x0 - 60 || h.x > x1 + 60) continue; drawHouseD(q, h, detail, E.rng(h.seed), signs && signs(h)); }
    if (hazeA > 0) {
      q.globalCompositeOperation = 'source-atop';
      const base = row[0].base;
      q.fillStyle = vg(q, base - 460, base, [[0, `rgba(214,232,246,${hazeA})`], [1, `rgba(236,244,248,${Math.min(1, hazeA * 1.3)})`]]);
      q.fillRect(x0 - 100, base - 520, x1 - x0 + 200, 540);
      q.globalCompositeOperation = 'source-over';
    }
  }
  /** 远山：绿色的山坡（上面散落着小白房子）+ 火山 */
  function townHill(q, a, b) {
    q.fillStyle = vg(q, 380, 640, [[0, '#a8c8a0'], [1, '#8ab88a']]);
    q.beginPath(); q.moveTo(a - 10, 640);
    for (let x = a - 10; x <= b + 10; x += 40) q.lineTo(x, 470 + Math.sin(x * 0.0021) * 50 + Math.sin(x * 0.0053 + 1) * 24);
    q.lineTo(b + 10, 640); q.closePath(); q.fill();
    const R = E.rng(Math.round(a) + 77);
    for (let i = 0; i < (b - a) / 26; i++) {
      const x = a + R() * (b - a), yT = 470 + Math.sin(x * 0.0021) * 50 + Math.sin(x * 0.0053 + 1) * 24, y = yT + 20 + R() * 120, w = 12 + R() * 16;
      if (R() < 0.35) { q.fillStyle = 'rgba(90,140,90,0.6)'; q.beginPath(); q.ellipse(x, y, 14, 8, 0, 0, TAU); q.fill(); continue; }
      q.fillStyle = pick(['#fbf6ee', '#fbf6ee', '#f6dccc', '#fbeccc', '#e8e0f4'], R()); q.fillRect(x, y - w * 0.7, w, w * 0.7);
      q.fillStyle = R() < 0.6 ? '#e2896a' : '#6a9ad0'; q.fillRect(x - 1, y - w * 0.7 - 3, w + 2, 3);
    }
    q.globalCompositeOperation = 'source-atop'; q.fillStyle = 'rgba(214,232,246,0.45)'; q.fillRect(a - 20, 380, b - a + 40, 280); q.globalCompositeOperation = 'source-over';
  }
  function townSkyD(q) {
    q.fillStyle = vg(q, 0, VH, [[0, '#3a92da'], [0.35, '#6cb6ea'], [0.62, '#b8e0f4'], [0.8, '#e6f4f8'], [1, '#f4f8f4']]); q.fillRect(0, 0, VW, VH);
  }
  function townVolc(q) {
    // 1920×700 的精灵：火山在 (1300, 90) 顶
    const cx = 1300, top = 90, base = 700;
    q.fillStyle = vg(q, top, base, [[0, '#a898ac'], [0.5, '#9a94a8'], [1, '#b8c8c4']]);
    q.beginPath(); q.moveTo(200, base); q.quadraticCurveTo(900, base - 60, cx - 60, top); q.lineTo(cx - 30, top - 6); q.lineTo(cx - 6, top + 8); q.lineTo(cx + 22, top + 3); q.lineTo(cx + 54, top - 4); q.quadraticCurveTo(1700, base - 80, 2100, base); q.closePath(); q.fill();
    q.save(); q.clip();
    q.fillStyle = hg(q, 600, 2000, [[0, 'rgba(255,248,236,0.35)'], [0.45, 'rgba(255,248,236,0)'], [0.55, 'rgba(80,70,130,0)'], [1, 'rgba(80,70,130,0.25)']]); q.fillRect(200, top - 10, 1900, base);
    q.strokeStyle = 'rgba(110,90,120,0.22)'; q.lineWidth = 4;
    for (let i = 0; i < 10; i++) { const x0 = cx - 30 + i * 8, x1 = cx + (i - 5) * 150; q.beginPath(); q.moveTo(x0, top + 20); q.quadraticCurveTo((x0 + x1) / 2 + (i - 5) * 20, 300, x1, 560); q.stroke(); }
    q.fillStyle = 'rgba(230,240,246,0.55)'; q.fillRect(0, 420, 2200, 300);
    q.restore();
    q.fillStyle = 'rgba(255,245,240,0.7)'; q.beginPath(); q.ellipse(cx - 3, top + 3, 50, 7, 0, 0, TAU); q.fill();
  }
  /** 街景的公共部分（相机 cam；o: { far(q), mid(q), near(q), street(q), front(q), volcX, clouds, signs } ） */
  function townD(g, s, cam, o = {}) {
    const t = s.t;
    g.drawImage(LC(s, 'town-sky-d', VW, VH, townSkyD, 0.25), 0, 0, VW, VH);
    inCam(g, cam, 0.04, (q) => {
      if (o.sun) sun(q, o.sun[0], o.sun[1], 38, 1);
      for (let i = 0; i < 6; i++) { const w = 380 + hash(501, i) * 360, h = w * 0.36, span = 3200; const x = ((hash(502, i) * span + t * (6 + hash(503, i) * 8)) % span) - 600; q.drawImage(cloud(s, 510 + i, Math.round(w), Math.round(h), 'day'), x, 80 + hash(504, i) * 200, w, h); }
    });
    inCam(g, cam, 0.1, (q) => {
      const vx = o.volcX ?? 1200;
      q.drawImage(LC(s, 'town-volc', 1920, 700, townVolc, 0.5), vx - 1300, 170, 1920, 700);
      plume(q, t, vx, 262, 1.3, { a: 0.55, speed: 0.016 });
    });
    tiled(g, s, 'town-hill', cam, 0.2, -400, 5200, 1400, townHill, 0.5, 360, 290);
    tiled(g, s, 'town-far-d', cam, 0.3, -300, 4700, 1200, (q, a, b) => townLayerD(q, 'far', 0.5, 0.25, a, b), 0.6, 330, 290);
    if (o.far) inCam(g, cam, 0.3, o.far);
    tiled(g, s, 'town-mid-d', cam, 0.55, -300, 4700, 1100, (q, a, b) => townLayerD(q, 'mid', 0.22, 0.55, a, b), 0.8, 300, 450);
    if (o.mid) inCam(g, cam, 0.55, o.mid);
    tiled(g, s, 'town-near-d', cam, 0.85, -300, 4700, 960, (q, a, b) => townLayerD(q, 'near', 0, 1, a, b, o.signs), 1.1, 180, 704);
    if (o.near) inCam(g, cam, 0.85, o.near);
    if (o.street) o.street(g);
    if (o.front) inCam(g, cam, 1.3, o.front);
    if (o.fg) for (const f of o.fg) fgFrame(g, s, cam, f[0], f[1], f[2] || {});
  }
  /** 石板步道（全局网格，分块画也严丝合缝） */
  function paving(q, a, b, y0, y1, seed) {
    q.fillStyle = vg(q, y0, y1, [[0, '#efe4d0'], [1, '#e2d2b8']]); q.fillRect(a - 2, y0, b - a + 4, y1 - y0);
    for (let r = 0, y = y0; y < y1; r++) {
      const rowH = 18 + r * 5, colW = 70 + r * 16, off = (r % 2) * colW / 2;
      q.strokeStyle = 'rgba(150,120,90,0.28)'; q.lineWidth = 1.6; q.beginPath(); q.moveTo(a, y); q.lineTo(b, y); q.stroke();
      for (let ci = Math.floor((a - off) / colW) - 1; ci * colW + off < b + colW; ci++) {
        const x = ci * colW + off;
        q.beginPath(); q.moveTo(x, y); q.lineTo(x, y + rowH); q.stroke();
        if (hash(seed, r, ci) < 0.3) { q.fillStyle = `rgba(${hash(seed + 1, r, ci) < 0.5 ? '255,255,255' : '160,130,100'},0.12)`; q.fillRect(x + 2, y + 2, colW - 4, rowH - 4); }
      }
      y += rowH;
    }
  }
  /** 路灯（白天不亮；lit 0..1） */
  function streetLamp(q, x, y, h, lit = 0) {
    q.fillStyle = '#3a4a5a'; q.fillRect(x - 5, y - h, 10, h); q.fillRect(x - 14, y - 16, 28, 16);
    q.beginPath(); q.moveTo(x - 20, y - h); q.lineTo(x + 20, y - h); q.lineTo(x + 13, y - h - 42); q.lineTo(x - 13, y - h - 42); q.closePath(); q.fill();
    q.fillStyle = lit > 0 ? mixC('#dfe8ee', '#ffe2a8', lit) : '#dfe8ee'; q.fillRect(x - 11, y - h - 36, 22, 30);
    q.fillStyle = '#3a4a5a'; q.beginPath(); q.moveTo(x - 16, y - h - 42); q.lineTo(x, y - h - 56); q.lineTo(x + 16, y - h - 42); q.closePath(); q.fill();
    if (lit > 0) { E.glow(q, x, y - h - 22, 120, '255,200,130', 0.5 * lit); E.glow(q, x, y - h - 22, 30, '255,240,210', 0.8 * lit); }
  }
  /** 沙滩遮阳伞（斜着插在沙里） */
  function umbrella(q, x, y, r, c1, c2, tilt = 0) {
    q.save(); q.translate(x, y); q.rotate(tilt);
    q.strokeStyle = '#6a5a4a'; q.lineWidth = r * 0.05; q.beginPath(); q.moveTo(0, 0); q.lineTo(0, -r * 1.3); q.stroke();
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a0 = PI + (i / n) * PI, a1 = PI + ((i + 1) / n) * PI;
      q.fillStyle = i % 2 ? c1 : c2; q.beginPath(); q.moveTo(0, -r * 1.3 - r * 0.28); q.lineTo(Math.cos(a0) * r, -r * 1.3 + Math.sin(a0) * r * 0.1 + r * 0.12); q.quadraticCurveTo(Math.cos((a0 + a1) / 2) * r * 1.02, -r * 1.3 + r * 0.02, Math.cos(a1) * r, -r * 1.3 + Math.sin(a1) * r * 0.1 + r * 0.12); q.closePath(); q.fill();
    }
    q.strokeStyle = INK_D; q.lineWidth = 2; q.beginPath(); q.moveTo(-r, -r * 1.3 + r * 0.12); q.lineTo(0, -r * 1.3 - r * 0.28); q.lineTo(r, -r * 1.3 + r * 0.12); q.stroke();
    q.restore();
  }
  /** 彩旗串：从 (x0,y0) 到 (x1,y1)，下垂 sag，一拍一晃 */
  function bunting(g, t, x0, y0, x1, y1, sag, n, seed, o = {}) {
    const wob = wobble(seed, t * 0.5) * 8 + (o.wind || 0) * 6;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag + wob;
    g.strokeStyle = o.wire || 'rgba(60,60,90,0.8)'; g.lineWidth = o.lw || 2;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
    const cols = o.cols || ['#ff6a8a', '#ffd24a', '#4ac0e0', '#7ad08a', '#b890f0', '#ffffff'];
    const sz = o.size || 34;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, x = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * mx + u * u * x1, y = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * my + u * u * y1;
      const fl = Math.sin(t * 5 + i * 0.9 + seed) * 0.18 + (o.flap || 0);
      g.save(); g.translate(x, y); g.rotate(fl);
      g.fillStyle = cols[(i + seed) % cols.length]; g.beginPath(); g.moveTo(-sz * 0.4, 0); g.lineTo(sz * 0.4, 0); g.lineTo(0, sz); g.closePath(); g.fill();
      g.restore();
    }
  }

  /* ---------- 镜头 4 · 码头（18.88 → 23.45）：船靠岸，她提着箱子走下舷梯 ---------- */
  function harborFront(q, s, t, x0, x1) {
    // 码头的石岸（y 880..940）+ 港湾的水（940..1100）+ 系缆桩
    q.fillStyle = vg(q, 880, 950, [[0, '#d8ccb4'], [1, '#b8a888']]); q.fillRect(x0, 880, x1 - x0, 64);
    q.strokeStyle = 'rgba(110,90,70,0.35)'; q.lineWidth = 2;
    for (let x = Math.floor(x0 / 90) * 90; x < x1; x += 90) { q.beginPath(); q.moveTo(x, 900); q.lineTo(x, 944); q.stroke(); }
    q.beginPath(); q.moveTo(x0, 900); q.lineTo(x1, 900); q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.35)'; q.fillRect(x0, 880, x1 - x0, 4);
    q.fillStyle = vg(q, 944, 1100, [[0, '#2aa4b4'], [0.4, '#1f8eaa'], [1, '#166e90']]); q.fillRect(x0, 944, x1 - x0, 160);
    q.fillStyle = 'rgba(20,60,90,0.35)'; q.fillRect(x0, 944, x1 - x0, 10);
  }
  function fishingBoat(g, x, y, sc, t, col, seed) {
    const bob = Math.sin(t * 1.4 + seed) * 4, rock = Math.sin(t * 1.1 + seed * 2) * 0.03;
    g.save(); g.translate(x, y + bob); g.rotate(rock); g.scale(sc, sc);
    g.fillStyle = col; g.beginPath(); g.moveTo(-110, -34); g.lineTo(110, -34); g.quadraticCurveTo(128, -34, 132, -50); g.lineTo(120, 0); g.quadraticCurveTo(110, 16, 80, 18); g.lineTo(-80, 18); g.quadraticCurveTo(-112, 12, -118, -20); g.closePath(); g.fill();
    g.fillStyle = '#fbf6ee'; g.fillRect(-110, -34, 240, 10);
    g.strokeStyle = INK_D; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = '#fbf6ee'; g.fillRect(-30, -80, 60, 46); g.strokeRect(-30, -80, 60, 46); g.fillStyle = '#4a7ab0'; g.fillRect(-20, -70, 16, 14); g.fillRect(4, -70, 16, 14);
    g.strokeStyle = '#6a5a4a'; g.lineWidth = 3; g.beginPath(); g.moveTo(-70, -34); g.lineTo(-70, -150); g.stroke();
    g.fillStyle = '#ffd24a'; g.beginPath(); g.moveTo(-70, -150); g.lineTo(-40 + Math.sin(t * 6 + seed) * 3, -142); g.lineTo(-70, -134); g.closePath(); g.fill();
    g.restore();
    // 倒影
    withAlpha(g, 0.25, (q) => { q.fillStyle = col; q.fillRect(x - 100 * sc, y + 22 * sc + bob, 200 * sc, 6 * sc); });
  }
  /** 舷梯：从 (x0,y0)（船上的门）斜到 (x1,y1)（码头），两侧白栏杆 */
  function gangway(q, x0, y0, x1, y1) {
    const ink = INK_D;
    q.fillStyle = '#9aa4b8'; q.beginPath(); q.moveTo(x0, y0); q.lineTo(x1, y1); q.lineTo(x1, y1 + 16); q.lineTo(x0, y0 + 16); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 2.5; q.stroke();
    q.fillStyle = '#d8dce6'; q.beginPath(); q.moveTo(x0, y0); q.lineTo(x1, y1); q.lineTo(x1 - 6, y1 - 8); q.lineTo(x0 - 6, y0 - 8); q.closePath(); q.fill();
    q.strokeStyle = '#fbfbf8'; q.lineWidth = 5; q.beginPath(); q.moveTo(x0, y0 - 70); q.lineTo(x1, y1 - 70); q.stroke();
    q.lineWidth = 3; for (let i = 0; i <= 6; i++) { const u = i / 6; q.beginPath(); q.moveTo(lerp(x0, x1, u), lerp(y0, y1, u)); q.lineTo(lerp(x0, x1, u), lerp(y0, y1, u) - 70); q.stroke(); }
    q.strokeStyle = 'rgba(52,52,86,0.6)'; q.lineWidth = 1.5; q.beginPath(); q.moveTo(x0, y0 - 73); q.lineTo(x1, y1 - 73); q.stroke();
  }
  function shotHarbor(g, s) {
    const t = s.t, lt = s.lt, k = ease.inOut(clamp((lt - 0.4) / 4.0));
    const cam = { x: lerp(860, 1180, k), y: 560, z: 1.02, ...hand(s, 9, 4, 0.4) };
    townD(g, s, cam, {
      volcX: 1500, fg: [['palm', 'tr', { depth: 1.6 }]],
      street: (q0) => inCam(q0, cam, 1, (q) => {
        const vr = visRange(cam, 1);
        harborFront(q, s, t, vr[0] - 40, vr[1] + 40);
        // 港里的小渔船与水面碎光
        fishingBoat(q, 1260, 1012, 0.85, t, '#3a8ad0', 1); fishingBoat(q, 2020, 1030, 1.0, t, '#e05a5a', 2);
        glints(q, t, { x0: vr[0], x1: vr[1], y0: 952, y1: 1090, sunX: 900, n: 60, seed: 29, path: 0.3, a: 0.8, wmax: 30, stars: false });
        // 迎客的拱门（码头上）
        const bx0 = 1380, bx1 = 1900;
        q.fillStyle = '#fbf6ee'; q.fillRect(bx0, 560, 22, 325); q.fillRect(bx1, 560, 22, 325);
        q.strokeStyle = INK_D; q.lineWidth = 2.5; q.strokeRect(bx0, 560, 22, 325); q.strokeRect(bx1, 560, 22, 325);
        q.fillStyle = '#3fb0b4'; rrect(q, bx0 - 30, 520, bx1 - bx0 + 82, 74, 16); q.fill(); q.stroke();
        q.fillStyle = 'rgba(255,255,255,0.25)'; q.fillRect(bx0 - 20, 526, bx1 - bx0 + 62, 8);
        E.text(q, '欢迎来到汐斯塔', (bx0 + bx1) / 2 + 11, 566, { size: 34, weight: 900, color: '#fffdf6', spacing: 6 });
        E.text(q, 'WELCOME TO SIESTA', (bx0 + bx1) / 2 + 11, 588, { font: 'display', size: 16, weight: 700, color: '#e8fbfb', spacing: 6 });
        bunting(q, t, bx0 + 22, 610, bx1, 610, 46, 11, 3);
        // 船（左边，很大）+ 舷梯
        ferry(q, s, 150, 935, 1.75, t);
        gangway(q, 520, 736, 830, 884);
        // 系缆桩与缆绳
        for (const bx of [760, 1240, 2100]) { q.fillStyle = '#4a5468'; rrect(q, bx - 16, 856, 32, 30, 8); q.fill(); q.fillRect(bx - 24, 850, 48, 10); q.fillStyle = 'rgba(255,255,255,0.25)'; q.fillRect(bx - 12, 858, 6, 24); }
        q.strokeStyle = '#d8c090'; q.lineWidth = 4; q.beginPath(); q.moveTo(760, 858); q.quadraticCurveTo(640, 910, 480, 850); q.stroke();
        // 行李推车
        q.fillStyle = '#6a7488'; q.fillRect(1560, 850, 150, 10); q.fillRect(1560, 790, 8, 64); for (const wx of [1580, 1690]) { q.beginPath(); q.arc(wx, 868, 12, 0, TAU); q.fill(); }
        for (const [x, y, w, h, c] of [[1580, 790, 60, 60, '#c86a4a'], [1644, 800, 56, 50, '#3a7ab8'], [1596, 752, 74, 40, '#e0b060']]) { q.fillStyle = c; rrect(q, x, y, w, h, 6); q.fill(); q.strokeStyle = INK_D; q.lineWidth = 2; q.stroke(); }
        // 先下船的游客（在码头上往右走）
        // 游客：匀速往右走（步频按移动速度算，脚底不打滑）
        const tv = 118;
        for (let i = 0; i < 4; i++) {
          const seed = [13, 0, 26, 58][i], st = [-6.9, -5.0, -3.0, 3.4][i], u = lt - st;
          if (u < 0) continue;
          const d = u * tv, ramp = 310, x = d < ramp ? 520 + d : 830 + (d - ramp);
          // 下了舷梯再往前一步踩到码头上（y 连续，不瞬移）
          const y = d < ramp ? lerp(736, 884, d / ramp) : 884 + (4 + (i % 2) * 14) * E.smooth(0, 60, d - ramp);
          if (x > vr[1] + 100) continue;
          // 从船舱门口出来：前 0.35 秒淡入（旧写法在舷梯顶上凭空出现）
          townsfolk(q, s, { x, y, h: 300, seed, pose: 'walk', speed: stepRate('crowd', 300, tv), walkV: tv, t: t + i * 0.37, prop: i % 2 ? 'suitcase' : 'bag', arms: i % 2 ? 'carry' : undefined, expr: 'smile', alpha: clamp(u / 0.35) }, i + 1);
        }
        // 她：从舷梯上走下来（提着箱子），到了码头上，抬头看见迎客的拱门
        const av = 128, walkT = clamp(lt - 0.9, 0, 3.6), ax = 540 + walkT * av, done = lt > 4.5;
        // 舷梯尽头比码头高 16 像素：走下最后一步时平滑落下（旧写法在 x = 830 处瞬移 16 像素）
        const ay = ax < 830 ? lerp(736, 884, (ax - 520) / 310) : 884 + 16 * E.smooth(830, 890, ax);
        const ao = { x: ax, y: ay, h: 360, pose: lt > 0.9 && !done ? 'walk' : done ? 'look-up' : 'stand', speed: stepRate('adele-alter', 360, av), arms: !done ? 'carry' : undefined, prop: 'suitcase', t, expr: done ? 'laugh' : 'smile', look: done ? [0.8, -0.8] : [1, -0.1], wind: 0.3 };
        mixIn(ao, 'stand', 0.9, 0.25, lt); mixIn(ao, 'walk', 4.5, 0.25, lt);
        adele(q, ao); suitcaseAt(q, s, ao);
        // 系缆桩上的一只海鸥
        gull(q, 1240, 846, 0.9, 0.4 + Math.sin(t * 3) * 0.1, -1);
      }),
      front: (q) => { gulls(q, t, { n: 3, seed: 51, y0: 120, y1: 300, s: 1.1, speed: 110, dir: -1 }); },
    });
    vig(g, s, 0.3);
  }

  /* ---------- 镜头 5 · 海滨步道（23.45 → 27.85）：跟着她走过一整排彩色的房子 ---------- */
  function beachFront(q, a, b) {
    // 沙滩（步道栏杆往下，画面底部）
    q.fillStyle = vg(q, 960, 1100, [[0, '#f6e2b8'], [1, '#ecd09c']]); q.fillRect(a - 2, 960, b - a + 4, 140);
    q.fillStyle = 'rgba(200,160,110,0.3)'; for (let i = 0; i < (b - a) / 12; i++) { const x = a + hash(611, i + Math.round(a)) * (b - a), y = 970 + hash(612, i + Math.round(a)) * 120; q.fillRect(x, y, 3, 2); }
  }
  function promenadeRail(q, a, b, y) {
    q.fillStyle = '#fbf8f2'; q.fillRect(a - 2, y - 58, b - a + 4, 10);
    q.fillStyle = 'rgba(80,90,140,0.2)'; q.fillRect(a - 2, y - 48, b - a + 4, 4);
    for (let x = Math.floor(a / 40) * 40; x < b; x += 40) { q.fillStyle = '#fbf8f2'; q.fillRect(x, y - 48, 9, 48); q.fillStyle = 'rgba(80,90,140,0.18)'; q.fillRect(x + 6, y - 48, 3, 48); }
    q.fillStyle = '#e2d6c0'; q.fillRect(a - 2, y, b - a + 4, 12);
  }
  const TOURISTS = [0, 1, 3, 4, 6, 11, 13, 14, 19, 20, 22, 23, 26, 27, 29, 37, 40, 44, 47, 48, 49, 52, 54, 57, 58, 59];
  function shotPromenade(g, s) {
    const t = s.t, lt = s.lt;
    const wo = { h: 380, pose: 'walk', arms: 'carry', prop: 'suitcase', speed: 1 };
    const v = gaitSpeed('adele-alter', wo, 150);
    const ax = 900 + lt * v;
    const cam = { x: ax + 160, y: 560, z: 1.0, ...hand(s, 11, 4, 0.5) };
    townD(g, s, cam, {
      volcX: 1900 + lt * 20, fg: [['palm', 'tl', { depth: 1.7, sc: 0.9 }]],
      signs: (h) => (h.x > 1400 && h.x < 1700 ? (q, hh, dx) => shopSign(q, hh, dx, '冰淇淋', '#ff8ab8') : h.x > 2300 && h.x < 2600 ? (q, hh, dx) => shopSign(q, hh, dx, 'CAFÉ', '#3a9ad0') : null),
      street: (q0) => {
        tiled(q0, s, 'prom-walk', cam, 1, -300, 4700, 1100, (q, a, b) => { paving(q, a, b, 880, 1000, 71); promenadeRail(q, a, b, 1000); beachFront(q, a, b); }, 1, 870, 240);
        inCam(q0, cam, 1, (q) => {
          const vr = visRange(cam, 1);
          // 步道后排的行人（来来往往，比她远、小一些）
          for (let i = 0; i < 7; i++) {
            // 循环的接缝放在画面外（镜头从 x≈1060 移到 ≈1720，看得见 100…2680）：旧写法的接缝 x = 100 正好在开头画面的左边缘，往左走的人半个身子一闪就没了
            const dir = i % 2 ? 1 : -1, sp = 60 + hash(71, i) * 40, span = 4200, x0 = hash(72, i) * span;
            const x = ((x0 + dir * sp * t) % span + span) % span - 700;
            if (x < vr[0] - 100 || x > vr[1] + 100) continue;
            const po = { x, y: 896 + (i % 2) * 10, h: 272 + (i % 2) * 10, seed: TOURISTS[(i * 5 + 3) % TOURISTS.length], pose: 'walk', speed: stepRate('crowd', 272 + (i % 2) * 10, sp), flip: dir < 0, t: t + i, expr: 'smile', prop: i % 3 === 0 ? 'umbrella' : i % 3 === 1 ? 'bag' : undefined, umbrellaColor: pick(['#ff9ab8', '#8ad0ff', '#ffd27a'], hash(73, i)) };
            // 步道上散步的客串干员（官方 Q 版小人）
            townsfolk(q, s, Object.assign(po, { walkV: sp }), i);
          }
          // 步道靠房子一侧的棕榈与路灯（在她身后，不会挡脸）
          for (let i = 0; i < 9; i++) {
            const x = -100 + i * 640 + hash(81, i) * 80;
            if (x < vr[0] - 300 || x > vr[1] + 300) continue;
            if (i % 2) streetLamp(q, x, 888, 470);
            else palm(q, x, 890, 600 + hash(82, i) * 80, t + i, { seed: 90 + i, lean: (hash(83, i) - 0.5) * 0.3, n: 9 });
          }
          // 路边的冰淇淋车（伏笔）
          iceCart(q, 1680, 925, 1, t);
          const ao = Object.assign({ x: ax, y: 972, t, expr: 'laugh', look: [0.6, -0.5] }, wo);
          adele(q, ao); suitcaseAt(q, s, ao);
        });
      },
      front: (q) => {
        const vr = visRange(cam, 1.3);
        for (let i = 0; i < 9; i++) { const x = hash(84, i) * 4400 - 200; if (x < vr[0] - 200 || x > vr[1] + 200) continue; umbrella(q, x, 1230, 150 + hash(85, i) * 40, pick(['#ff7a9a', '#3ab0d0', '#ffcc4a', '#8ad07a'], hash(86, i)), '#fffaf2', (hash(87, i) - 0.5) * 0.3); }
      },
    });
    vig(g, s, 0.3);
  }
  /** 店招（挂在门的上方） */
  function shopSign(q, h, dx, str, col) {
    const y = h.base - 170, w = Math.max(120, str.length * 34 + 40);
    q.fillStyle = col; rrect(q, dx - w / 2, y, w, 48, 12); q.fill(); q.strokeStyle = INK_D; q.lineWidth = 2.5; q.stroke();
    E.text(q, str, dx, y + 35, { size: 28, weight: 900, color: '#fffdf6', spacing: 2, font: /[a-zA-Z]/.test(str) ? 'display' : 'serif' });
  }
  /** 冰淇淋车 */
  function iceCart(q, x, y, sc, t) {
    q.save(); q.translate(x, y); q.scale(sc, sc);
    q.fillStyle = '#fbf6ee'; rrect(q, -90, -110, 180, 90, 14); q.fill(); q.strokeStyle = INK_D; q.lineWidth = 3; q.stroke();
    q.fillStyle = '#ff8ab8'; q.fillRect(-90, -76, 180, 16);
    q.fillStyle = '#4a4a5a'; for (const wx of [-56, 56]) { q.beginPath(); q.arc(wx, -16, 16, 0, TAU); q.fill(); }
    q.strokeStyle = '#6a6a7a'; q.lineWidth = 4; q.beginPath(); q.moveTo(0, -110); q.lineTo(0, -200); q.stroke();
    for (let i = 0; i < 8; i++) { const a0 = PI + (i / 8) * PI, a1 = PI + ((i + 1) / 8) * PI; q.fillStyle = i % 2 ? '#fffaf2' : '#ff8ab8'; q.beginPath(); q.moveTo(0, -226); q.lineTo(Math.cos(a0) * 120, -196); q.lineTo(Math.cos(a1) * 120, -196); q.closePath(); q.fill(); }
    q.strokeStyle = INK_D; q.lineWidth = 2; q.beginPath(); q.moveTo(-120, -196); q.lineTo(0, -226); q.lineTo(120, -196); q.stroke();
    // 招牌上的甜筒
    q.fillStyle = '#e8b870'; q.beginPath(); q.moveTo(-12, -30); q.lineTo(12, -30); q.lineTo(0, 0); q.closePath(); q.fill();
    q.fillStyle = '#ffb0cc'; q.beginPath(); q.arc(0, -36, 13, 0, TAU); q.fill();
    q.restore();
  }

  /* ---------- 镜头 6 · 台阶街（27.85 → 32.33）：白色的台阶一路往上，三角梅，猫；台阶顶上露出博物馆 ---------- */
  const STAIR = { x0: 560, y0: 1000, run: 62, rise: 38, n: 18 };
  const stairY = (x) => STAIR.y0 - clamp((x - STAIR.x0) / STAIR.run, 0, STAIR.n) * STAIR.rise;
  function stairArt(q) {
    // 1920×1080 世界：左边一面白墙（带蓝门与三角梅），台阶从左下往右上爬，右边矮墙 + 花盆
    const { x0, y0, run, rise, n } = STAIR, ink = INK_D;
    // 背后的房子（台阶边的高墙，左）
    q.fillStyle = '#fbf6ee'; q.fillRect(-100, 120, 520, 960); q.fillStyle = 'rgba(80,90,160,0.12)'; q.fillRect(330, 120, 90, 960);
    q.strokeStyle = ink; q.lineWidth = 3; q.strokeRect(-100, 120, 520, 960);
    q.fillStyle = '#e27b5c'; q.beginPath(); q.moveTo(-120, 124); q.lineTo(160, 20); q.lineTo(440, 124); q.closePath(); q.fill(); q.stroke();
    q.fillStyle = '#3a7ab8'; archPath(q, 170, 880, 130, 250); q.fill(); q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.2)'; q.fillRect(108, 780, 10, 220);
    for (const wy of [260, 480]) { q.fillStyle = '#44668c'; q.fillRect(120, wy, 90, 120); q.strokeStyle = '#fbf6ee'; q.lineWidth = 5; q.strokeRect(120, wy, 90, 120); q.fillStyle = '#35a3a3'; q.fillRect(88, wy, 28, 120); q.fillRect(214, wy, 28, 120); q.strokeStyle = ink; q.lineWidth = 2; q.strokeRect(88, wy, 28, 120); q.strokeRect(214, wy, 28, 120); q.fillStyle = '#9a6a4a'; q.fillRect(110, wy + 120, 110, 12); for (let i = 0; i < 7; i++) { q.fillStyle = i % 3 ? '#ff4a7a' : '#3e8a4a'; q.beginPath(); q.arc(118 + i * 15, wy + 114, 8, 0, TAU); q.fill(); } }
    bougainvillea(q, 400, 1000, 110, 780, E.rng(61));
    // 台阶两侧的墙（右侧矮墙沿台阶上升）
    const wall = () => { q.beginPath(); q.moveTo(x0 - 20, y0 + 90); for (let i = 0; i <= n; i++) q.lineTo(x0 + i * run + run + 60, y0 - i * rise + 60); q.lineTo(x0 + n * run + run + 400, y0 - n * rise + 60); q.lineTo(x0 + n * run + run + 400, 1200); q.lineTo(x0 - 20, 1200); q.closePath(); };
    for (let i = 0; i < n; i++) {
      const x = x0 + i * run, y = y0 - (i + 1) * rise;
      q.fillStyle = '#fbfaf6'; q.fillRect(x, y, run + 140, rise); q.fillStyle = '#d6dcea'; q.fillRect(x, y + rise - 8, run + 140, 8);
      q.fillStyle = '#3a8ad0'; q.fillRect(x, y, run + 140, 3);
      q.strokeStyle = ink; q.lineWidth = 2; q.strokeRect(x, y, run + 140, rise);
    }
    wall(); q.fillStyle = '#f6f2ea'; q.fill();
    q.save(); wall(); q.clip();
    q.fillStyle = vg(q, 300, 1100, [[0, 'rgba(80,90,160,0.04)'], [1, 'rgba(80,90,160,0.2)']]); q.fillRect(0, 0, 2400, 1300);
    // 台阶下面是一栋粉色的房子（台阶贴着它的侧墙往上爬）：窗、花箱、晾着的小毛巾、一扇蓝门
    q.fillStyle = '#f9c8d4'; q.fillRect(1180, 560, 1300, 800);
    q.fillStyle = 'rgba(80,90,160,0.12)'; q.fillRect(1180, 560, 60, 800);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const wx = 1320 + c * 150, wy = 640 + r * 150;
      if (wy + 90 < stairY(wx) + 70) continue;
      q.fillStyle = '#44668c'; archPath(q, wx, wy + 40, 60, 90); q.fill();
      q.fillStyle = 'rgba(170,215,245,0.5)'; q.fillRect(wx - 30, wy + 20, 60, 14);
      q.strokeStyle = '#fbf6ee'; q.lineWidth = 5; archPath(q, wx, wy + 40, 60, 90); q.stroke();
      q.fillStyle = '#35a3a3'; q.fillRect(wx - 50, wy, 16, 86); q.fillRect(wx + 34, wy, 16, 86);
      q.fillStyle = '#9a6a4a'; q.fillRect(wx - 36, wy + 86, 72, 9); for (let i = 0; i < 5; i++) { q.fillStyle = i % 2 ? '#ff4a7a' : '#3e8a4a'; q.beginPath(); q.arc(wx - 28 + i * 14, wy + 82, 7, 0, TAU); q.fill(); }
    }
    q.fillStyle = '#3a8ad0'; archPath(q, 1860, 1030, 110, 200); q.fill(); q.strokeStyle = '#fbf6ee'; q.lineWidth = 8; archPath(q, 1860, 1030, 110, 200); q.stroke();
    q.strokeStyle = 'rgba(90,90,120,0.8)'; q.lineWidth = 2; q.beginPath(); q.moveTo(1500, 1000); q.quadraticCurveTo(1640, 1030, 1780, 1000); q.stroke();
    for (const [x, c] of [[1540, '#8ac0e8'], [1600, '#ffffff'], [1680, '#ffd24a'], [1740, '#ffb0c8']]) { q.fillStyle = c; q.fillRect(x, 1010 + Math.abs(x - 1640) * 0.05, 36, 50); }
    // 石块砌缝（很淡）+ 几块剥落露出的石头
    q.strokeStyle = 'rgba(120,110,140,0.2)'; q.lineWidth = 2;
    for (let y = 300, r = 0; y < 1200; y += 46, r++) { q.beginPath(); q.moveTo(0, y); q.lineTo(2400, y); q.stroke(); for (let x = 500 + (r % 2) * 55; x < 2400; x += 110) { q.beginPath(); q.moveTo(x, y); q.lineTo(x, y + 46); q.stroke(); } }
    for (let i = 0; i < 14; i++) { const x = 700 + hash(63, i) * 1300, y = stairY(x) + 120 + hash(64, i) * 400; q.fillStyle = 'rgba(214,200,180,0.7)'; blob(q, rockPts(x, y, 26 + hash(65, i) * 20, 14 + hash(66, i) * 8, 70 + i, 7, 0.25)); q.fill(); }
    // 墙上的拱形壁龛（里面一盆花）+ 一盏壁灯
    const nx = 1500, ny = stairY(1500) + 330;
    q.fillStyle = 'rgba(80,90,150,0.25)'; archPath(q, nx, ny, 110, 170); q.fill();
    q.fillStyle = '#c8684a'; q.beginPath(); q.moveTo(nx - 24, ny + 80); q.lineTo(nx - 18, ny + 44); q.lineTo(nx + 18, ny + 44); q.lineTo(nx + 24, ny + 80); q.closePath(); q.fill();
    q.fillStyle = '#4e9a5a'; q.beginPath(); q.arc(nx, ny + 28, 26, 0, TAU); q.fill(); q.fillStyle = '#ff5a8a'; for (let j = 0; j < 6; j++) { q.beginPath(); q.arc(nx - 18 + j * 7, ny + 16 + (j % 2) * 10, 5, 0, TAU); q.fill(); }
    q.restore();
    wall(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
    // 墙根垂下来的一片三角梅
    bougainvillea(q, 1150, stairY(1150) + 130, 90, 120, E.rng(67));
    // 矮墙上的花盆
    for (let i = 0; i < 7; i++) { const px = x0 + 160 + i * 150, py = stairY(px) + 56; q.fillStyle = '#c8684a'; q.beginPath(); q.moveTo(px - 22, py); q.lineTo(px - 16, py - 36); q.lineTo(px + 16, py - 36); q.lineTo(px + 22, py); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke(); q.fillStyle = i % 2 ? '#3e8a4a' : '#4e9a5a'; q.beginPath(); q.arc(px, py - 50, 24, 0, TAU); q.fill(); for (let j = 0; j < 5; j++) { q.fillStyle = pick(['#ff4a7a', '#ffd24a', '#ff8ab8', '#ffffff'], hash(62, i, j)); q.beginPath(); q.arc(px - 14 + j * 7, py - 62 + (j % 2) * 10, 5, 0, TAU); q.fill(); } }
  }
  function shotStairs(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const k = ease.inOut(clamp(lt / 4.4));
    const cam = { x: lerp(900, 1180, k), y: lerp(640, 420, k), z: lerp(1.12, 1.0, k), ...hand(s, 13, 4, 0.4) };
    // 天 + 台阶顶上的博物馆（远景）
    g.drawImage(LC(s, 'town-sky-d', VW, VH, townSkyD, 0.25), 0, 0, VW, VH);
    inCam(g, cam, 0.06, (q) => { for (let i = 0; i < 4; i++) q.drawImage(cloud(s, 520 + i, 420, 150, 'day'), 200 + i * 520 + t * 8, 120 + (i % 2) * 110, 420, 150); });
    inCam(g, cam, 0.25, (q) => {
      q.drawImage(LC(s, 'town-volc', 1920, 700, townVolc, 0.5), 1700 - 1300, -90, 1920, 700);
      plume(q, t, 1700, 2, 1.3, { a: 0.5 });
      q.drawImage(LC(s, 'mz-far', 700, 420, museumFar, 0.8), 1050, 120, 700, 420);
    });
    baked(g, s, 'stairway', { x: 1040, y: 530, z: 1.06 }, cam, 1, stairArt, 1, [-140, 0, 2400, 1200]);
    inCam(g, cam, 1, (q) => {
      // 墙头上晒太阳的猫（尾巴一拍一甩）
      const cx = 1320, cy = stairY(cx) + 58 - 36;
      q.fillStyle = '#f0a860'; q.beginPath(); q.ellipse(cx, cy, 34, 16, 0, 0, TAU); q.fill(); q.beginPath(); q.arc(cx + 30, cy - 10, 14, 0, TAU); q.fill();
      q.beginPath(); q.moveTo(cx + 22, cy - 20); q.lineTo(cx + 26, cy - 34); q.lineTo(cx + 32, cy - 22); q.moveTo(cx + 34, cy - 22); q.lineTo(cx + 40, cy - 32); q.lineTo(cx + 42, cy - 18); q.fill();
      q.strokeStyle = '#f0a860'; q.lineWidth = 7; q.lineCap = 'round'; const tw = Math.sin(bt * PI) * 0.6; q.beginPath(); q.moveTo(cx - 30, cy + 4); q.quadraticCurveTo(cx - 60, cy + 10 + tw * 20, cx - 70, cy - 10 + tw * 30); q.stroke(); q.lineCap = 'butt';
      q.strokeStyle = '#3a2a2a'; q.lineWidth = 2; q.beginPath(); q.moveTo(cx + 30, cy - 10); q.lineTo(cx + 36, cy - 10); q.stroke();
      // 她：提着箱子一拍一级半地往上爬（箱子在台阶上磕一下）；步频跟着移动速度走
      const per = 1.5, step = Math.max(0, bt * 1 + 0.3), si = Math.floor(step), f = fract(step);
      const ax = STAIR.x0 - 40 + (si + ease.inOut(f)) * STAIR.run * per, ay = stairY(ax) + 2 - Math.sin(PI * f) * 10;
      const ao = { x: ax, y: ay, h: 330, pose: 'walk', arms: 'carry', prop: 'suitcase', t, speed: stepRate('adele-alter', 330, (STAIR.run * per) / BEAT), expr: lt > 3.4 ? 'surprise' : 'determined', look: lt > 3.4 ? [0.7, -0.8] : [1, -0.3], wind: 0.25 };
      adele(q, ao); suitcaseAt(q, s, ao);
      if (f < 0.15 && si > 0) pop(q, '咚', ax + 70, ay - 60, 1 - f / 0.15, { size: 30, color: '#6a7aa0', rot: 0.2 });
    });
    fgFrame(g, s, cam, 'flowers', 'br', { depth: 1.5 });
    vig(g, s, 0.3);
  }
  /** 远处台阶顶上的博物馆（设计 700×420） */
  function museumFar(q) {
    q.fillStyle = '#8fb080'; q.beginPath(); q.moveTo(0, 420); q.quadraticCurveTo(350, 300, 700, 420); q.closePath(); q.fill();
    q.fillStyle = '#f4e8d4'; q.fillRect(170, 190, 380, 150); q.fillStyle = 'rgba(80,90,160,0.14)'; q.fillRect(470, 190, 80, 150);
    q.fillStyle = '#5a8ec8'; q.beginPath(); q.arc(230, 190, 70, PI, 0); q.fill(); q.fillStyle = 'rgba(210,235,255,0.5)'; q.beginPath(); q.arc(230, 190, 64, PI * 1.1, PI * 1.45); q.lineTo(230, 190); q.closePath(); q.fill();
    q.fillStyle = '#c86a4a'; q.fillRect(160, 184, 400, 10);
    q.fillStyle = '#2f7a78'; q.fillRect(300, 200, 240, 22);
    for (const x of [320, 380, 440, 500]) { q.fillStyle = '#44668c'; archPath(q, x, 280, 30, 70); q.fill(); }
    q.strokeStyle = INK_D; q.lineWidth = 2.5; q.strokeRect(170, 190, 380, 150); q.beginPath(); q.arc(230, 190, 70, PI, 0); q.stroke();
    for (let i = 0; i < 3; i++) { q.strokeStyle = 'rgba(60,60,90,0.6)'; q.lineWidth = 1.5; q.beginPath(); q.moveTo(560, 196); q.lineTo(640, 150 + i * 4); q.stroke(); }
    palm(q, 110, 360, 150, 0, { seed: 5, n: 8 }); palm(q, 610, 370, 130, 0, { seed: 6, n: 8, lean: -0.1 });
  }

  /* =========================================================
   * 火山博物馆（立面与门前广场）：与「雾中之忆」同一栋楼——左边的圆顶观测台、拱窗、拱门、门牌
   * 世界坐标：楼 450..1600 × 250..1040；门 (1250, 900)；广场地面 y ≥ 1040
   * pal：'day'（开馆日）| 'night'（入夜：窗里的灯）
   * ========================================================= */
  const MZ = { win: { x: 1020, y: 560, w: 190, h: 330 }, door: [1250, 900], plaque: [1415, 850] };
  function mzSkyD(q) {
    q.fillStyle = vg(q, 0, 1400, [[0, '#2f86d2'], [0.35, '#62b0e6'], [0.65, '#b6def2'], [0.85, '#e4f3f6'], [1, '#f2f7f2']]); q.fillRect(0, 0, 2400, 1400);
  }
  function mzSkyN(q) {
    q.fillStyle = vg(q, 0, 1400, [[0, '#070a26'], [0.4, '#141a4a'], [0.7, '#2a2a66'], [0.88, '#4a3a78'], [1, '#6a4a86']]); q.fillRect(0, 0, 2400, 1400);
    const R = E.rng(19); for (let i = 0; i < 380; i++) { const y = Math.pow(R(), 1.5) * 1100; q.fillStyle = `rgba(255,244,250,${(0.15 + R() * 0.5) * (1 - y / 1300)})`; q.fillRect(R() * 2400, y, 1.6, 1.6); }
  }
  function mzVolcanoD(q, night) {
    const cx = 1880, top = 0, base = 1150;
    q.fillStyle = night ? vg(q, top, base, [[0, '#2e2656'], [1, '#1e1a3c']]) : vg(q, top, base, [[0, '#a89aae'], [0.55, '#9aa0ac'], [1, '#a8c0a8']]);
    q.beginPath(); q.moveTo(1150, base); q.quadraticCurveTo(1700, 600, cx - 70, top); q.lineTo(cx - 34, top - 8); q.lineTo(cx - 6, top + 10); q.lineTo(cx + 24, top + 4); q.lineTo(cx + 64, top - 6); q.quadraticCurveTo(2400, 560, 2900, base); q.closePath(); q.fill();
    if (!night) {
      q.save(); q.clip();
      q.fillStyle = hg(q, 1300, 2800, [[0, 'rgba(255,248,236,0.3)'], [0.45, 'rgba(255,248,236,0)'], [0.55, 'rgba(80,70,130,0)'], [1, 'rgba(80,70,130,0.28)']]); q.fillRect(1150, top - 10, 1750, base);
      q.strokeStyle = 'rgba(110,90,120,0.22)'; q.lineWidth = 5;
      for (let i = 0; i < 10; i++) { const x0 = cx - 40 + i * 10, x1 = cx + (i - 5) * 190; q.beginPath(); q.moveTo(x0, top + 30); q.quadraticCurveTo((x0 + x1) / 2 + (i - 5) * 30, 400, x1, 800); q.stroke(); }
      q.fillStyle = 'rgba(120,170,120,0.5)'; for (let i = 0; i < 60; i++) { const x = 1300 + hash(71, i) * 1500, y = 800 + hash(72, i) * 300; q.beginPath(); q.ellipse(x, y, 30 + hash(73, i) * 30, 14 + hash(73, i) * 8, 0, 0, TAU); q.fill(); }
      q.fillStyle = 'rgba(226,238,246,0.5)'; q.fillRect(1100, 700, 1900, 500);
      q.restore();
    } else { q.strokeStyle = 'rgba(255,160,200,0.3)'; q.lineWidth = 3; q.beginPath(); q.moveTo(1500, 700); q.quadraticCurveTo(1760, 500, cx - 70, top); q.stroke(); }
    q.fillStyle = night ? 'rgba(255,170,210,0.35)' : 'rgba(255,246,240,0.7)'; q.beginPath(); q.ellipse(cx - 3, top + 4, 60, 9, 0, 0, TAU); q.fill();
  }
  function mzFacadeD(q, pal) {
    const N = pal === 'night', ink = N ? '#120a1c' : 'rgba(52,52,86,0.85)';
    const wall = N ? vg(q, 250, 1040, [[0, '#4a3a66'], [0.5, '#3a2c56'], [1, '#2a2042']]) : vg(q, 250, 1040, [[0, '#fbf1de'], [0.6, '#f4e6cc'], [1, '#ecdcc0']]);
    // 圆顶观测台（左）
    q.fillStyle = N ? vg(q, 250, 1000, [[0, '#3a3058'], [1, '#221a38']]) : vg(q, 330, 1040, [[0, '#f6e8d0'], [1, '#e8d6b8']]); q.fillRect(130, 330, 320, 710);
    if (!N) { q.fillStyle = 'rgba(80,90,160,0.14)'; q.fillRect(380, 330, 70, 710); }
    q.fillStyle = N ? vg(q, 150, 330, [[0, '#4a5a7a'], [1, '#26304a']]) : vg(q, 150, 330, [[0, '#7ec0cc'], [1, '#4a94a8']]); q.beginPath(); q.arc(290, 330, 170, PI, 0); q.fill();
    q.strokeStyle = N ? 'rgba(200,210,255,0.45)' : 'rgba(235,255,255,0.8)'; q.lineWidth = 6; q.beginPath(); q.arc(290, 330, 156, PI * 1.08, PI * 1.5); q.stroke();
    q.strokeStyle = N ? 'rgba(0,0,0,0.2)' : 'rgba(40,90,110,0.3)'; q.lineWidth = 2; for (let i = 1; i < 6; i++) { const a = PI + (i / 6) * PI; q.beginPath(); q.moveTo(290, 330); q.lineTo(290 + Math.cos(a) * 170, 330 + Math.sin(a) * 170); q.stroke(); }
    q.fillStyle = N ? '#141024' : '#2a3a4a'; q.beginPath(); q.moveTo(270, 164); q.lineTo(310, 164); q.lineTo(316, 330); q.lineTo(264, 330); q.closePath(); q.fill();
    q.strokeStyle = ink; q.lineWidth = 4; q.beginPath(); q.arc(290, 330, 170, PI, 0); q.stroke();
    q.fillStyle = N ? '#2a2244' : '#d8805a'; q.fillRect(120, 322, 340, 18);
    for (const wy of [520, 760]) { q.fillStyle = N ? '#1a1432' : '#4a6a90'; archPath(q, 290, wy, 90, 160); q.fill(); q.strokeStyle = N ? '#4a3c6a' : '#fbf6ee'; q.lineWidth = 7; archPath(q, 290, wy, 90, 160); q.stroke(); }
    // 主楼
    q.fillStyle = wall; q.fillRect(450, 280, 1150, 760);
    const R = E.rng(4);
    for (let i = 0; i < 700; i++) { q.fillStyle = N ? `rgba(${R() < 0.5 ? '255,230,255' : '20,10,30'},${0.02 + R() * 0.04})` : `rgba(${R() < 0.5 ? '255,255,255' : '150,120,90'},${0.04 + R() * 0.05})`; q.fillRect(450 + R() * 1150, 280 + R() * 760, 2 + R() * 6, 1 + R() * 3); }
    // 檐口 + 招牌带
    q.fillStyle = N ? '#2a2044' : '#d8805a'; q.fillRect(430, 250, 1190, 34); q.fillStyle = N ? '#5a4a7e' : '#fbf6ee'; q.fillRect(430, 250, 1190, 6);
    q.fillStyle = N ? '#34284e' : '#2f7a78'; q.fillRect(450, 284, 1150, 60);
    E.text(q, 'SIESTA  VOLCANO  MUSEUM', 1025, 328, { font: 'display', size: 36, weight: 700, spacing: 10, color: N ? '#b9a8d8' : '#ffe08a' });
    // 壁柱
    for (const x of [470, 800, 1250, 1570]) { q.fillStyle = N ? '#3e3260' : '#fbf5e8'; q.fillRect(x - 14, 344, 28, 700); q.fillStyle = N ? 'rgba(210,200,255,0.12)' : 'rgba(80,90,160,0.16)'; q.fillRect(x + 6, 344, 8, 700); }
    // 窗（左右两扇 + 中间的大拱窗）
    for (const cx of [630, 1420]) {
      archPath(q, cx, 560, 170, 310); q.fillStyle = N ? '#1a1432' : '#4a6a90'; q.fill();
      q.save(); archPath(q, cx, 560, 170, 310); q.clip();
      q.fillStyle = N ? 'rgba(160,140,220,0.18)' : 'rgba(180,220,245,0.55)'; q.beginPath(); q.moveTo(cx - 85, 470); q.lineTo(cx + 85, 400); q.lineTo(cx + 85, 470); q.lineTo(cx - 85, 560); q.closePath(); q.fill();
      q.restore();
      q.strokeStyle = N ? '#4a3c6a' : '#fbf6ee'; q.lineWidth = 10; archPath(q, cx, 560, 170, 310); q.stroke();
      q.lineWidth = 5; q.beginPath(); q.moveTo(cx, 420); q.lineTo(cx, 715); q.moveTo(cx - 85, 560); q.lineTo(cx + 85, 560); q.stroke();
      q.strokeStyle = ink; q.lineWidth = 2; archPath(q, cx, 560, 180, 320); q.stroke();
      q.fillStyle = N ? '#2e2448' : '#e8d8bc'; q.fillRect(cx - 100, 712, 200, 16);
    }
    const W = MZ.win;
    archPath(q, W.x, W.y, W.w, W.h); q.fillStyle = N ? '#2a1c24' : '#4a6a90'; q.fill();
    if (!N) { q.save(); archPath(q, W.x, W.y, W.w, W.h); q.clip(); q.fillStyle = 'rgba(180,220,245,0.55)'; q.beginPath(); q.moveTo(W.x - 95, 480); q.lineTo(W.x + 95, 400); q.lineTo(W.x + 95, 470); q.lineTo(W.x - 95, 560); q.closePath(); q.fill(); q.restore(); }
    q.strokeStyle = N ? '#4a3c6a' : '#fbf6ee'; q.lineWidth = 12; archPath(q, W.x, W.y, W.w, W.h); q.stroke();
    q.lineWidth = 6; q.beginPath(); q.moveTo(W.x, W.y - W.h / 2 + 10); q.lineTo(W.x, W.y + W.h / 2); q.moveTo(W.x - W.w / 2, W.y); q.lineTo(W.x + W.w / 2, W.y); q.stroke();
    q.fillStyle = N ? '#2e2448' : '#e8d8bc'; q.fillRect(W.x - 118, W.y + W.h / 2 - 4, 236, 20);
    // 门 + 门牌
    const [dx, dy] = MZ.door;
    q.fillStyle = N ? '#1e1630' : '#2a8a9c'; archPath(q, dx, dy, 150, 250); q.fill();
    q.strokeStyle = N ? '#4a3c6a' : '#fbf6ee'; q.lineWidth = 12; archPath(q, dx, dy, 162, 258); q.stroke();
    q.strokeStyle = ink; q.lineWidth = 2; archPath(q, dx, dy, 174, 266); q.stroke();
    q.fillStyle = N ? '#2a1e3c' : '#24788a'; q.fillRect(dx - 72, dy - 70, 68, 190); q.fillRect(dx + 4, dy - 70, 68, 190);
    if (!N) { q.strokeStyle = 'rgba(255,255,255,0.25)'; q.lineWidth = 2; q.strokeRect(dx - 64, dy - 50, 52, 70); q.strokeRect(dx + 12, dy - 50, 52, 70); q.strokeRect(dx - 64, dy + 30, 52, 80); q.strokeRect(dx + 12, dy + 30, 52, 80); }
    q.fillStyle = N ? '#6a5a8a' : '#e8c060'; q.beginPath(); q.arc(dx - 12, dy + 30, 5, 0, TAU); q.arc(dx + 12, dy + 30, 5, 0, TAU); q.fill();
    q.fillStyle = N ? '#b8a88a' : '#d8c8a8'; rrect(q, 1340, 820, 150, 60, 6); q.fill(); q.strokeStyle = '#6a5040'; q.lineWidth = 3; q.stroke();
    E.text(q, '汐斯塔火山博物馆', 1415, 858, { font: 'serif', size: 17, weight: 700, color: '#4a3020', spacing: 1 });
    // 壁灯（门两侧）
    for (const lx of [1150, 1350]) { q.fillStyle = N ? '#2a2040' : '#3a4a5a'; q.fillRect(lx - 3, 760, 6, 30); q.fillStyle = N ? '#ffd48e' : '#e4ecf0'; rrect(q, lx - 12, 730, 24, 34, 6); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke(); }
    // 台阶
    q.fillStyle = N ? '#2a2240' : '#e6dcc8'; q.fillRect(1150, 1020, 200, 24); q.fillStyle = N ? '#342a4e' : '#dcd0b8'; q.fillRect(1130, 1040, 240, 40);
    q.strokeStyle = ink; q.lineWidth = 2; q.strokeRect(1150, 1020, 200, 24); q.strokeRect(1130, 1040, 240, 40);
    // 砌缝
    q.strokeStyle = N ? 'rgba(20,10,40,0.18)' : 'rgba(150,120,90,0.14)'; q.lineWidth = 2;
    for (let y = 380; y < 1040; y += 44) { q.beginPath(); q.moveTo(450, y); q.lineTo(1600, y); q.stroke(); for (let x = 450 + ((y / 44) % 2) * 60; x < 1600; x += 120) { q.beginPath(); q.moveTo(x, y); q.lineTo(x, y + 44); q.stroke(); } }
    // 光：白天是左上来的阳光（右边的壁柱投下影子）；夜里是月光 + 门灯的暖光
    if (N) {
      q.fillStyle = vg(q, 280, 1080, [[0, 'rgba(200,190,255,0.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(10,4,20,0.35)']]); q.fillRect(450, 280, 1150, 800);
      q.globalCompositeOperation = 'lighter';
      q.fillStyle = rg(q, W.x, W.y + 60, 0, 380, [[0, 'rgba(255,170,100,0.32)'], [1, 'rgba(255,170,100,0)']]); q.fillRect(W.x - 380, W.y - 320, 760, 760);
      q.fillStyle = rg(q, 1250, 800, 0, 300, [[0, 'rgba(255,190,120,0.35)'], [1, 'rgba(255,190,120,0)']]); q.fillRect(950, 500, 600, 600);
      q.globalCompositeOperation = 'source-over';
    } else {
      q.fillStyle = vg(q, 344, 400, [[0, 'rgba(80,80,150,0.22)'], [1, 'rgba(80,80,150,0)']]); q.fillRect(450, 344, 1150, 56);
      q.fillStyle = hg(q, 450, 1600, [[0, 'rgba(255,250,236,0.18)'], [1, 'rgba(90,90,160,0.08)']]); q.fillRect(450, 280, 1150, 760);
    }
    // 三角梅（墙角与右边的壁柱）
    const Rb = E.rng(88);
    bougainvillea(q, 470, 1040, 120, 380, Rb); bougainvillea(q, 1590, 1040, 110, 700, Rb); bougainvillea(q, 700, 1040, 90, 200, Rb);
    if (N) { q.globalCompositeOperation = 'source-atop'; q.fillStyle = 'rgba(20,10,40,0.55)'; q.fillRect(400, 300, 1300, 800); q.globalCompositeOperation = 'source-over'; }
    q.strokeStyle = ink; q.lineWidth = 4; q.strokeRect(450, 280, 1150, 800);
  }
  /** 门前广场（地面 y ≥ 1040）：石板、花坛、长椅、路灯 */
  function mzPlaza(q, pal) {
    const N = pal === 'night';
    q.fillStyle = N ? vg(q, 1040, 1700, [[0, '#3a3050'], [1, '#221a34']]) : vg(q, 1040, 1700, [[0, '#ece0ca'], [1, '#e0cfb0']]);
    q.fillRect(-700, 1040, 3400, 700);
    // 透视石板
    q.strokeStyle = N ? 'rgba(10,0,20,0.25)' : 'rgba(150,120,90,0.25)'; q.lineWidth = 2;
    for (let i = -30; i < 40; i++) { const x0 = 1000 + i * 70, x1 = 1000 + i * 150; q.beginPath(); q.moveTo(x0, 1040); q.lineTo(x1, 1700); q.stroke(); }
    for (let j = 0; j < 12; j++) { const y = 1040 + Math.pow(j / 11, 1.5) * 660; q.beginPath(); q.moveTo(-700, y); q.lineTo(2700, y); q.stroke(); }
    // 楼前的一道阴影
    q.fillStyle = N ? 'rgba(0,0,0,0.25)' : 'rgba(90,90,160,0.14)'; q.fillRect(130, 1040, 1470, 26);
    // 花坛（左右各一）
    for (const [x, w] of [[560, 420], [1460, 360]]) {
      q.fillStyle = N ? '#3a3050' : '#fbf6ee'; q.fillRect(x, 1090, w, 50); q.strokeStyle = N ? '#120a1c' : INK_D; q.lineWidth = 2.5; q.strokeRect(x, 1090, w, 50);
      q.fillStyle = N ? '#2a2020' : '#8a5a3a'; q.fillRect(x + 6, 1084, w - 12, 12);
    }
    // 长椅
    for (const bx of [-260, 2020]) {
      q.fillStyle = N ? '#2a2040' : '#6a8aa8'; q.fillRect(bx, 1200, 260, 16); q.fillRect(bx, 1140, 260, 14); q.fillRect(bx, 1164, 260, 14);
      q.fillStyle = N ? '#1a1430' : '#3a4a5a'; q.fillRect(bx + 16, 1216, 12, 60); q.fillRect(bx + 232, 1216, 12, 60); q.fillRect(bx + 16, 1140, 10, 76); q.fillRect(bx + 234, 1140, 10, 76);
    }
  }
  /** 开馆的布置：横幅、彩旗、气球（白天） */
  function mzOpening(q, s, t, k = 1) {
    if (k <= 0) return;
    withAlpha(q, k, (g) => {
      // 挂在招牌带下面的布横幅
      g.fillStyle = '#fffaf2'; g.beginPath(); g.moveTo(830, 352); g.lineTo(1230, 352); g.lineTo(1226, 420 + Math.sin(t * 2) * 3); g.quadraticCurveTo(1030, 432, 834, 420 + Math.sin(t * 2 + 1) * 3); g.closePath(); g.fill();
      g.strokeStyle = '#e05a7a'; g.lineWidth = 4; g.stroke();
      E.text(g, '夏日开馆 · GRAND OPENING', 1030, 400, { size: 30, weight: 900, color: '#e05a7a', spacing: 2 });
      // 彩旗：从檐口斜挂下来
      bunting(g, t, 440, 262, 120, 700, 60, 10, 5);
      bunting(g, t, 1610, 262, 1900, 720, 60, 10, 7);
      bunting(g, t, 460, 350, 1590, 350, 120, 22, 9, { size: 30 });
      // 门边的气球（一拍一晃）
      for (let i = 0; i < 7; i++) {
        const side = i < 4 ? -1 : 1, bx = 1250 + side * (110 + (i % 4) * 22), by = 640 - (i % 3) * 50 + Math.sin(t * 1.6 + i) * 8 + s.pulse(4) * 4;
        g.strokeStyle = 'rgba(80,80,110,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(1250 + side * 96, 820); g.quadraticCurveTo(bx - side * 10, (by + 820) / 2, bx, by + 34); g.stroke();
        const col = pick(['#ff8ab8', '#4ac0e0', '#ffd24a', '#8ad08a', '#b890f0'], hash(33, i));
        g.fillStyle = col; g.beginPath(); g.ellipse(bx, by, 26, 32, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(bx - 9, by - 11, 6, 9, -0.4, 0, TAU); g.fill();
        g.fillStyle = col; g.beginPath(); g.moveTo(bx - 5, by + 34); g.lineTo(bx + 5, by + 34); g.lineTo(bx, by + 28); g.closePath(); g.fill();
      }
    });
  }
  /** 博物馆一整套（相机 cam；o: { pal, opening, mid(q), front(q), plaza(q) } ） */
  function museumD(g, s, cam, o = {}) {
    const t = s.t, N = o.pal === 'night';
    inCam(g, cam, 0.02, (q) => q.drawImage(LC(s, N ? 'mz-sky-n' : 'mz-sky-d', 2400, 1400, N ? mzSkyN : mzSkyD, 0.3), -240, -600, 2400, 1800));
    inCam(g, cam, 0.06, (q) => {
      if (N) { E.glow(q, 1650, 60, 200, '255,236,220', 0.3); q.fillStyle = '#fff6ee'; q.beginPath(); q.arc(1650, 60, 34, 0, TAU); q.fill(); }
      else for (let i = 0; i < 5; i++) { const w = 420 + hash(701, i) * 300, x = ((hash(702, i) * 3400 + t * (7 + hash(703, i) * 6)) % 3400) - 900; q.drawImage(cloud(s, 710 + i, Math.round(w), Math.round(w * 0.36), 'day'), x, -300 + hash(704, i) * 380, w, w * 0.36); }
      if (o.sky) o.sky(q);
    });
    baked(g, s, N ? 'mz-volc-n' : 'mz-volc-d', { x: 960, y: 540, z: 1 }, cam, 0.3, (q) => mzVolcanoD(q, N), 0.6, [1100, 20, 2950, 1160]);
    inCam(g, cam, 0.3, (q) => plume(q, t, 1880, 0, 1.9, { a: N ? 0.3 : 0.55, rgb: N ? '255,190,220' : '255,255,255', speed: 0.015 }));
    inCam(g, cam, 0.7, (q) => {
      // 楼后面的棕榈（远）
      palm(q, -80, 1040, 520, t, { seed: 31, lean: -0.08, col: N ? '#140c22' : undefined });
      palm(q, 1800, 1040, 560, t + 2, { seed: 32, lean: 0.1, col: N ? '#140c22' : undefined });
    });
    // 立面按“这个镜头的基准机位”烘焙（远景 / 近景各一张，缩放时不糊）
    baked(g, s, (N ? 'mz-facade-n:' : 'mz-facade-d:') + (o.bk || 'n'), o.base || { x: 960, y: 540, z: 1 }, cam, 1, (q) => { mzPlaza(q, o.pal); mzFacadeD(q, o.pal); }, 1, [-720, 140, 2720, 1740]);
    inCam(g, cam, 1, (q) => {
      if (o.opening) mzOpening(q, s, t, o.opening);
      if (o.mid) o.mid(q);
    });
    if (o.front) inCam(g, cam, 1.3, o.front);
    if (o.fg) for (const f of o.fg) fgFrame(g, s, cam, f[0], f[1], Object.assign({ pal: N ? 'night' : 'day' }, f[2] || {}));
  }

  /* ---------- 镜头 7 · 博物馆（32.33 → 36.90）：开馆日，门口排着队；凯勒老师在门口招手 ---------- */
  function shotMuseum(g, s) {
    const t = s.t, lt = s.lt, k = ease.inOut(clamp(lt / 4.6));
    const cam = { x: lerp(860, 980, k), y: lerp(620, 660, k), z: lerp(0.8, 0.88, k), ...hand(s, 15, 3, 0.35) };
    museumD(g, s, cam, {
      pal: 'day', opening: 1, bk: 'wide', base: { x: 920, y: 640, z: 0.8 },
      mid: (q) => {
        // 排队的游客（在门口）：客串的干员们（官方 Q 版小人）排成一排，一个指着门口的彩旗
        const qpo = (i, tt) => { const x = 1110 - i * 190, y = 1092 + (i % 2) * 16; return { x, y, h: 330, seed: TOURISTS[(i * 3 + 1) % TOURISTS.length], pose: i === 3 ? 'point' : 'stand', aim: -0.4, t: tt + i * 0.7, flip: false, expr: i % 2 ? 'smile' : 'laugh', look: [1, -0.3], prop: i % 4 === 1 ? 'camera' : undefined }; };
        [0, 1, 2, 3].map((i) => [i, qpo(i, t)]).sort((a, b) => a[1].y - b[1].y).forEach(([i, po]) => townsfolk(q, s, po, i));
        // 凯勒老师：站在门口，转过头看她走进来，笑了（绑定：转头、眨眼、官方差分表情）
        const kt0 = s.shot.t0;
        keller(q, { x: 1330, y: 1034, h: 360 * KH(), pose: 'wave', t, expr: 'laugh', flip: true, look: [-1, 0.1],
          rig: { flip: true, expr: [[kt0 - 1, 1], [kt0 + 1.4, 8], [kt0 + 3.3, 9]], look: E.keyart && E.keyart.path ? E.keyart.path([[kt0 + 0.3, [0.1, 0]], [kt0 + 1.3, [0.75, 0.15]], [kt0 + 4, [0.55, 0.12]]]) : [0.5, 0.1], mouth: talkK([[kt0 + 3.5, kt0 + 4.4]], 7) } }, s);
        // 她：从左边走进来（匀速，脚底不打滑），走到广场上停下挥手
        const av = 140, ax = -170 + Math.min(lt, 3.9) * av;
        const ao = { x: ax, y: 1200, h: 400, pose: lt < 3.9 ? 'walk' : 'wave', speed: stepRate('adele-alter', 400, av), arms: lt < 3.9 ? 'carry' : undefined, prop: lt < 3.9 ? 'suitcase' : null, t, expr: 'laugh', look: [1, -0.2] };
        mixIn(ao, 'walk', 3.9, 0.25, lt);
        // 官方小人：走到广场上，把箱子放在脚边，腾出手来挥手
        if (SDON() && lt >= 3.9) { q.save(); q.translate(ax - 70, 1200); q.drawImage(LC(s, 'suitcase', 120, 110, suitcaseArt, 1.2), -60, -104, 120, 110); q.restore(); }
        adele(q, ao);
        if (lt < 3.9) suitcaseAt(q, s, ao);
      },
      front: (q) => { gulls(q, t, { n: 3, seed: 61, y0: -200, y1: 100, s: 1.3, speed: 90 }); },
    });
    vig(g, s, 0.3);
  }

  /* ---------- 镜头 8 · 凯勒老师（36.90 → 41.46）：鞠躬、别上“馆员”徽章 ---------- */
  function badge(g, x, y, sc, pop = 1) {
    if (pop <= 0) return;
    const k = ease.back(clamp(pop));
    g.save(); g.translate(x, y); g.scale(sc * k, sc * k);
    g.fillStyle = '#ffd24a'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -PI / 2 + (i / 10) * TAU, r = i % 2 ? 9 : 20; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
    g.strokeStyle = '#b07a20'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#2f7a78'; rrect(g, -24, 16, 48, 14, 4); g.fill();
    E.text(g, 'STAFF', 0, 27, { font: 'sans', size: 10, weight: 700, color: '#fffdf6' });
    g.restore();
  }
  function shotKeller(g, s) {
    const t = s.t, lt = s.lt, k = ease.inOut(clamp(lt / 4.5));
    const cam = { x: lerp(1270, 1250, k), y: lerp(880, 860, k), z: lerp(1.75, 1.9, k), ...hand(s, 17, 3, 0.35) };
    const bowOn = lt > 0.35 && lt < 1.45, pin = clamp((lt - 1.9) / 0.35), laugh = lt > 2.4;
    const ao = mixIn({ x: 1420, y: 1052, h: 380, pose: bowOn ? 'bow' : laugh ? 'cheer' : 'stand', t, flip: true, expr: bowOn ? 'closed' : laugh ? 'laugh' : 'smile', look: [-1, -0.2] }, 'stand', 2.4, 0.25, lt);
    museumD(g, s, cam, {
      pal: 'day', opening: 1, bk: 'kel', base: { x: 1260, y: 870, z: 1.8 }, fg: [['flowers', 'bl', { sc: 0.9 }]],
      mid: (q) => {
        q.save(); q.translate(1500, 1052); q.drawImage(LC(s, 'suitcase-sp', 120, 110, suitcaseArt, 1.4), -150, -96, 108, 99); q.restore();
        // 凯勒老师：官方立绘的剪纸（膝上构图，站在画面左边）；说“欢迎！”时张嘴，徽章别上之后眯眼笑
        const t0 = s.shot.t0;
        // [v3] 绑定：说“欢迎！”时是官方差分的张嘴，别徽章时低头看，别好之后眯眼笑、镜片一闪
        const useCard = kellerCard(q, s, {
          x: 1060, y: 1150, h: 520, crop: 'upper', flip: true, expr: [[t0 - 1, 8], [t0 + 1.55, 10], [t0 + 2.3, 9]],
          mouth: talkK([[t0 + 0.12, t0 + 1.35]], 3), look: E.keyart && E.keyart.path ? E.keyart.path([[t0, [-0.45, 0.05]], [t0 + 1.5, [-0.55, 0.1]], [t0 + 2.0, [-0.5, 0.45]], [t0 + 2.6, [-0.4, 0.15]]]) : [-0.5, 0.1],
          glint: (tt) => E.window01(tt, t0 + 2.45, t0 + 3.2, 0.2, 0.4), tilt: (tt) => -0.5 * sst(t0 + 2.3, t0 + 2.9, tt),
        }, (qq) => keller(qq, { x: 1120, y: 1052, h: 380 * KH(), pose: lt < 1.6 ? 'wave' : lt < 2.4 ? 'reach' : 'clap', aim: -0.1, t, expr: 'laugh', look: [1, 0] }, s));
        adele(q, ao);
        // 徽章：从凯勒老师那边飞过来（立绘剪纸够不着她），“叮”地别在外套上
        const ch = anchor('adele-alter', ao, 'chest', [1400, 900]);
        const fly = useCard ? clamp((lt - 1.55) / 0.4) : 1, bx = lerp(1150, ch[0] + 6, ease.inOut(fly)), by = lerp(820, ch[1] - 6, ease.inOut(fly)) - Math.sin(PI * fly) * 60;
        if (useCard && fly > 0 && fly < 1) badge(q, bx, by, 0.9, 1);
        badge(q, ch[0] + 6, ch[1] - 6, 0.9, useCard ? (fly >= 1 ? pin : 0) : pin);
        if (pin > 0 && pin < 1) sparkle(q, ch[0] + 6, ch[1] - 6, 60 * pin, 1 - pin, pin * 2, '255,236,160');
        if (laugh) for (let i = 0; i < 3; i++) star4(q, ch[0] + 40 + i * 26, ch[1] - 180 - i * 20 + Math.sin(t * 4 + i) * 6, 12, t + i, '#ffd24a', 0.9 * clamp((lt - 2.4) / 0.3));
        if (lt < 1.6) speech(q, '欢迎！', useCard ? 1240 : 1170, useCard ? 720 : 700, clamp(lt / 0.2) * (1 - clamp((lt - 1.4) / 0.2)), { w: 220, h: 96, dx: useCard ? -70 : 60, size: 44 });
      },
    });
    vig(g, s, 0.32);
  }
  /** 行李箱（设计 120×110，底在 (60,104)） */
  function suitcaseArt(q) {
    q.fillStyle = '#c86a4a'; rrect(q, 8, 22, 104, 82, 10); q.fill(); q.strokeStyle = INK_D; q.lineWidth = 3; q.stroke();
    q.fillStyle = '#e8b870'; q.fillRect(8, 56, 104, 8); q.fillStyle = '#f4ecdc'; q.beginPath(); q.arc(34, 46, 10, 0, TAU); q.fill(); q.fillStyle = '#4ac0e0'; q.fillRect(70, 34, 30, 16);
    q.strokeStyle = '#6a3a2a'; q.lineWidth = 5; q.beginPath(); q.moveTo(44, 22); q.lineTo(44, 10); q.lineTo(76, 10); q.lineTo(76, 22); q.stroke();
  }

  /* =========================================================
   * 失焦的前景（景深）：先画到低分辨率的缓存里，再放大贴回去——双线性插值就是一次柔和的模糊
   * 不用 filter / shadowBlur；两级降采样，边缘不会有锯齿块
   * ========================================================= */
  function soft(s, key, w, h, fn, r = 0.07) {
    const hi = LC(s, key + '#hi', w, h, fn, 0.3);
    return LC(s, key + '#lo', w, h, (q) => { q.imageSmoothingQuality = 'high'; q.drawImage(hi, 0, 0, w, h); }, r);
  }
  /** 失焦的一丛前景花叶（设计 600×400） */
  function fgLeaves(q, seed, flowers, pal) {
    const R = E.rng(seed), dk = pal === 'night' || pal === 'dusk';
    for (let i = 0; i < 26; i++) { const x = 60 + R() * 480, y = 80 + R() * 300, a = R() * TAU; q.fillStyle = dk ? (R() < 0.5 ? '#1e1430' : '#2a1c3a') : R() < 0.5 ? '#2f6a44' : '#3f8a54'; q.beginPath(); q.ellipse(x, y, 60 + R() * 40, 26 + R() * 14, a, 0, TAU); q.fill(); }
    if (flowers) for (let i = 0; i < 36; i++) { const x = 60 + R() * 480, y = 60 + R() * 280; q.fillStyle = dk ? (R() < 0.6 ? '#6a2a5a' : '#8a3a6a') : R() < 0.6 ? '#e8409a' : '#ff8ac0'; q.beginPath(); q.arc(x, y, 12 + R() * 12, 0, TAU); q.fill(); }
  }
  /** 失焦的棕榈叶（从画面一角探进来；设计 900×600，叶柄在 (0,0)） */
  function fgFronds(q, pal) {
    const dk = pal === 'night' || pal === 'dusk';
    for (let pass = 0; pass < 2; pass++) {
      q.fillStyle = dk ? (pass ? '#2a1838' : '#1a0e26') : pass ? '#4ea868' : '#2f7a52';
      for (let i = 0; i < 5; i++) { if (i % 2 !== pass) continue; q.save(); q.translate(-40, -30); frond(q, 0, 0, 0.05 + i * 0.3, 700 - i * 40, 0.25 + i * 0.1); q.restore(); }
    }
  }
  /**
   * 前景的景深框：kind = 'palm'（棕榈叶从角上探进来）| 'flowers'（一丛三角梅）| 'leaves'
   * corner = 'tl' | 'tr' | 'bl' | 'br'；depth 越大、镜头移动时晃得越多；sway 跟着风轻轻摆
   */
  function fgFrame(g, s, cam, kind, corner, o = {}) {
    const pal = o.pal || 'day', t = s.t, sc = o.sc || 1;
    const bw = kind === 'palm' ? 900 : 600, bh = kind === 'palm' ? 600 : 400;
    const draw = kind === 'palm' ? (q) => fgFronds(q, pal) : (q) => fgLeaves(q, kind === 'flowers' ? 77 : 78, kind === 'flowers', pal);
    // 有后期工具箱时用它的预模糊景深层（真正的模糊，只算一次、按分辨率缓存）；否则用自带的降采样
    const F = FIN();
    let c, m = 0;
    if (F && F.dofLayer) { c = F.dofLayer(s, 'mmd-fg-' + kind + '-' + pal, bw, bh, draw, 14); m = c.__m || 0; }
    else c = soft(s, (kind === 'palm' ? 'fgp-' : 'fgl-' + kind + '-') + pal, bw, bh, draw, 0.09);
    const w = bw * sc, h = bh * sc, mm = m * sc;
    const d = o.depth ?? 1.5, px = -((cam.x ?? 960) - 960) * (d - 1) * 0.35, py = -((cam.y ?? 540) - 540) * (d - 1) * 0.35;
    const sway = Math.sin(t * 0.9 + (o.seed || 0)) * 0.025 + (o.wind || 0) * 0.04 * Math.sin(t * 3);
    g.save();
    const right = corner[1] === 'r', bottom = corner[0] === 'b';
    g.translate((right ? VW : 0) + px + (o.dx || 0), (bottom ? VH : 0) + py + (o.dy || 0));
    g.rotate(sway * (right ? -1 : 1));
    g.scale(right ? -1 : 1, bottom ? -1 : 1);
    if (o.a != null) g.globalAlpha *= o.a;
    if (kind === 'palm') g.drawImage(c, -60 - mm, -60 - mm, w + 2 * mm, h + 2 * mm);
    else g.drawImage(c, -w * 0.3 - mm, -h * 0.35 - mm, w + 2 * mm, h + 2 * mm);
    g.restore();
  }

  /* =========================================================
   * 露台（博物馆门前、面朝海湾）：天、海湾、灯塔岬、摩天轮码头、层层下降的屋顶、石栏杆
   * 世界坐标 1920×1080（左右各多画 400）；海平线 y = 470；栏杆扶手 y ≈ 830；露台地面 y ≥ 950
   * pal：'day' | 'night'
   * ========================================================= */
  const BAY_HZ = 470;
  function baySky(q, pal) {
    if (pal === 'night') {
      q.fillStyle = vg(q, -400, BAY_HZ, [[0, '#050822'], [0.45, '#10164a'], [0.75, '#2a2466'], [0.92, '#4a3278'], [1, '#6a3c80']]); q.fillRect(-400, -400, VW + 800, BAY_HZ + 900);
      const R = E.rng(21); for (let i = 0; i < 360; i++) { const y = -400 + Math.pow(R(), 1.4) * 820; q.fillStyle = `rgba(255,244,250,${(0.15 + R() * 0.5) * (1 - (y + 400) / 900)})`; q.fillRect(R() * (VW + 800) - 400, y, 1.6, 1.6); }
    } else {
      q.fillStyle = vg(q, -400, BAY_HZ, [[0, '#2c84d0'], [0.45, '#5aace4'], [0.8, '#aad8f0'], [1, '#e2f2f4']]); q.fillRect(-400, -400, VW + 800, BAY_HZ + 900);
    }
  }
  function baySea(q, pal) {
    const N = pal === 'night';
    q.fillStyle = N ? vg(q, BAY_HZ, 800, [[0, '#3a2c6a'], [0.1, '#221e52'], [1, '#0e1030']]) : vg(q, BAY_HZ, 800, [[0, '#a8e2e6'], [0.08, '#62cad4'], [0.5, '#2eaec4'], [1, '#1a90b4']]);
    q.fillRect(-400, BAY_HZ, VW + 800, 900);
    const R = E.rng(23);
    for (let i = 0; i < 300; i++) { const v = Math.pow(R(), 1.5), y = BAY_HZ + 2 + v * 320, x = R() * (VW + 800) - 400; q.fillStyle = N ? `rgba(160,150,230,${0.05 + R() * 0.08})` : `rgba(255,255,255,${0.06 + R() * 0.14})`; q.fillRect(x, y, 10 + R() * 60 * (0.3 + v), 1 + v * 2); }
    q.fillStyle = N ? 'rgba(200,170,255,0.35)' : 'rgba(255,255,255,0.7)'; q.fillRect(-400, BAY_HZ - 1, VW + 800, 2);
    // 左边的灯塔岬
    q.fillStyle = N ? '#161232' : '#8aa878'; q.beginPath(); q.moveTo(-400, 640); q.lineTo(-400, 470); q.quadraticCurveTo(-60, 400, 180, 410); q.quadraticCurveTo(330, 416, 420, 470); q.quadraticCurveTo(520, 530, 560, 600); q.lineTo(560, 640); q.closePath(); q.fill();
    if (!N) { q.fillStyle = '#b8a088'; q.beginPath(); q.moveTo(420, 470); q.quadraticCurveTo(520, 530, 560, 600); q.lineTo(560, 640); q.lineTo(380, 640); q.quadraticCurveTo(420, 540, 380, 480); q.closePath(); q.fill(); q.fillStyle = 'rgba(255,255,255,0.5)'; q.fillRect(380, 600, 190, 5); }
    q.fillStyle = N ? '#e9e0f0' : '#fbfaf6'; q.beginPath(); q.moveTo(186, 414); q.lineTo(194, 318); q.lineTo(222, 318); q.lineTo(230, 414); q.closePath(); q.fill();
    q.fillStyle = '#d04a52'; q.fillRect(190, 370, 36, 12); q.fillRect(193, 334, 30, 9);
    q.fillStyle = N ? '#2a2040' : '#3a4a60'; q.fillRect(188, 300, 40, 18); q.beginPath(); q.moveTo(186, 300); q.lineTo(208, 284); q.lineTo(230, 300); q.closePath(); q.fill();
    // 右边的码头 + 摩天轮
    q.fillStyle = N ? '#1a1636' : '#d8ccb4'; q.fillRect(1260, 600, 700, 16); q.fillStyle = N ? '#120e28' : '#a89880'; for (let x = 1270; x < 1960; x += 40) q.fillRect(x, 616, 8, 30);
    const fx = 1560, fy = 480, fr = 100;
    q.strokeStyle = N ? '#2e2450' : '#fbfbf8'; q.lineWidth = 5; q.beginPath(); q.arc(fx, fy, fr, 0, TAU); q.stroke();
    q.lineWidth = 2; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; q.beginPath(); q.moveTo(fx, fy); q.lineTo(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr); q.stroke(); }
    q.lineWidth = 7; q.beginPath(); q.moveTo(fx - 50, 600); q.lineTo(fx, fy); q.lineTo(fx + 50, 600); q.stroke();
  }
  /** 从高处看下去的一排房子：正面墙 + 屋顶（瓦 / 平顶 / 圆顶）；夜里窗子亮 */
  function roofRow(q, seed, x0, x1, yb, sc, pal) {
    const N = pal === 'night', R = E.rng(seed), ink = N ? 'rgba(10,6,24,0.85)' : 'rgba(52,52,86,0.7)';
    let x = x0 + R() * 40;
    while (x < x1) {
      const w = (90 + R() * 120) * sc, hW = (60 + R() * 70) * sc, rD = (26 + R() * 30) * sc, y = yb + (R() - 0.5) * 30 * sc;
      const col = pick(PASTEL_D, R()), kind = R();
      // 墙
      q.fillStyle = N ? mixC(col, '#141030', 0.72) : col; q.fillRect(x, y - hW, w, hW);
      if (!N) { q.fillStyle = 'rgba(80,90,160,0.14)'; q.fillRect(x + w * 0.8, y - hW, w * 0.2, hW); }
      // 窗
      const cols = Math.max(1, Math.round(w / (38 * sc))), rows = Math.max(1, Math.round(hW / (40 * sc)));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const wx = x + (c + 0.5) * w / cols - 7 * sc, wy = y - hW + 10 * sc + r * 36 * sc, lit = R() < 0.55;
        q.fillStyle = N ? (lit ? (R() < 0.3 ? '#ffe6b0' : '#ffc27a') : '#2a2448') : '#44668c'; q.fillRect(wx, wy, 14 * sc, 20 * sc);
        if (!N && R() < 0.5) { q.fillStyle = pick(SHUT_D, R()); q.fillRect(wx - 6 * sc, wy, 5 * sc, 20 * sc); q.fillRect(wx + 15 * sc, wy, 5 * sc, 20 * sc); }
      }
      // 屋顶
      if (kind < 0.45) {
        q.fillStyle = N ? '#3a1e36' : (R() < 0.5 ? '#e27b5c' : '#d4646c');
        q.beginPath(); q.moveTo(x - 6 * sc, y - hW); q.lineTo(x + w + 6 * sc, y - hW); q.lineTo(x + w - 10 * sc, y - hW - rD); q.lineTo(x + 10 * sc, y - hW - rD); q.closePath(); q.fill();
        if (!N) { q.strokeStyle = 'rgba(110,40,30,0.3)'; q.lineWidth = 1.5; for (let i = 1; i < 4; i++) { const yy = y - hW - rD * i / 4; q.beginPath(); q.moveTo(x + 10 * sc * i / 4 - 6 * sc, yy); q.lineTo(x + w - 10 * sc * i / 4 + 6 * sc, yy); q.stroke(); } q.fillStyle = 'rgba(255,236,210,0.25)'; q.fillRect(x, y - hW - rD, w * 0.5, rD); }
      } else if (kind < 0.55) {
        q.fillStyle = N ? '#2a3050' : '#4a8ed0'; q.beginPath(); q.ellipse(x + w / 2, y - hW, w * 0.32, rD * 1.3, 0, PI, 0); q.fill();
        if (!N) { q.fillStyle = 'rgba(210,235,255,0.5)'; q.beginPath(); q.ellipse(x + w / 2 - w * 0.08, y - hW - rD * 0.4, w * 0.12, rD * 0.5, -0.3, 0, TAU); q.fill(); }
      } else {
        q.fillStyle = N ? '#2a2444' : '#f2ece0'; q.beginPath(); q.moveTo(x - 4 * sc, y - hW); q.lineTo(x + w + 4 * sc, y - hW); q.lineTo(x + w - 6 * sc, y - hW - rD); q.lineTo(x + 6 * sc, y - hW - rD); q.closePath(); q.fill();
        q.fillStyle = N ? '#1e1a36' : '#fbfaf6'; q.fillRect(x - 4 * sc, y - hW - 5 * sc, w + 8 * sc, 5 * sc);
        if (R() < 0.5) { q.fillStyle = N ? '#3a3050' : '#9ab0c8'; q.fillRect(x + w * 0.6, y - hW - rD * 0.9, 18 * sc, 14 * sc); }
        if (!N && R() < 0.5) { q.fillStyle = '#4e9a5a'; q.beginPath(); q.arc(x + w * 0.25, y - hW - rD * 0.5, 8 * sc, 0, TAU); q.fill(); q.fillStyle = '#ff5a8a'; q.beginPath(); q.arc(x + w * 0.25 + 3, y - hW - rD * 0.6, 3 * sc, 0, TAU); q.fill(); }
      }
      q.strokeStyle = ink; q.lineWidth = 1.5 * Math.max(1, sc); q.strokeRect(x, y - hW, w, hW);
      if (!N && R() < 0.25) palm(q, x + w + 8 * sc, y, 110 * sc, 0, { seed: (x | 0) + seed, n: 8 });
      if (!N && R() < 0.3) bougainvillea(q, x + 6 * sc, y, 26 * sc, hW * 0.8, R);
      x += w + (R() < 0.3 ? 10 * sc : -4 * sc);
    }
  }
  function bayTown(q, pal) {
    // 三层屋顶：远（海边）→ 近（露台下面），越近越大；最后一层空气透视
    // 最底下先铺一层“更近处的墙和小巷”（从栏杆缝里看下去不会是空的）
    q.fillStyle = pal === 'night' ? '#1a1432' : '#d8c8c0'; q.fillRect(-440, 820, VW + 880, 200);
    q.fillStyle = pal === 'night' ? 'rgba(255,190,120,0.25)' : 'rgba(80,90,160,0.18)'; for (let x = -440; x < VW + 440; x += 70) q.fillRect(x, 860 + (Math.abs(x) % 3) * 12, 26, 34);
    roofRow(q, 811, -440, 2360, 660, 0.5, pal);
    roofRow(q, 812, -440, 2360, 760, 0.75, pal);
    roofRow(q, 813, -440, 2360, 890, 1.05, pal);
    if (pal !== 'night') { q.globalCompositeOperation = 'source-atop'; q.fillStyle = vg(q, 560, 900, [[0, 'rgba(220,236,246,0.45)'], [1, 'rgba(220,236,246,0)']]); q.fillRect(-440, 500, VW + 880, 420); q.globalCompositeOperation = 'source-over'; }
  }
  /** 石栏杆 + 露台地面（最前） */
  function bayRail(q, pal) {
    const N = pal === 'night';
    q.fillStyle = N ? vg(q, 940, 1100, [[0, '#2a2240'], [1, '#18122a']]) : vg(q, 940, 1100, [[0, '#ece0ca'], [1, '#dccaa8']]); q.fillRect(-440, 940, VW + 880, 180);
    q.strokeStyle = N ? 'rgba(0,0,0,0.25)' : 'rgba(150,120,90,0.25)'; q.lineWidth = 2;
    for (let i = -20; i < 40; i++) { q.beginPath(); q.moveTo(960 + i * 90, 940); q.lineTo(960 + i * 170, 1100); q.stroke(); }
    q.beginPath(); q.moveTo(-440, 1000); q.lineTo(VW + 440, 1000); q.stroke();
    // 栏杆
    const top = 820, bot = 944, col = N ? '#3a3052' : '#f8f2e6', sh = N ? '#241c3a' : '#d6cdbc';
    q.fillStyle = col; q.fillRect(-440, top, VW + 880, 22); q.fillStyle = sh; q.fillRect(-440, top + 22, VW + 880, 8);
    q.fillStyle = col; q.fillRect(-440, bot - 16, VW + 880, 16);
    for (let x = -440; x < VW + 440; x += 46) {
      q.fillStyle = col; q.beginPath(); q.moveTo(x + 12, top + 30); q.quadraticCurveTo(x + 2, top + 64, x + 12, top + 76); q.quadraticCurveTo(x + 4, top + 96, x + 12, bot - 16); q.lineTo(x + 30, bot - 16); q.quadraticCurveTo(x + 38, top + 96, x + 30, top + 76); q.quadraticCurveTo(x + 40, top + 64, x + 30, top + 30); q.closePath(); q.fill();
      q.fillStyle = sh; q.fillRect(x + 24, top + 32, 6, bot - top - 48);
    }
    for (let x = -440; x < VW + 440; x += 460) { q.fillStyle = col; q.fillRect(x, top - 10, 44, bot - top + 10); q.fillStyle = sh; q.fillRect(x + 32, top - 10, 12, bot - top + 10); }
    q.strokeStyle = N ? 'rgba(10,6,24,0.8)' : 'rgba(52,52,86,0.6)'; q.lineWidth = 2; q.beginPath(); q.moveTo(-440, top); q.lineTo(VW + 440, top); q.moveTo(-440, bot); q.lineTo(VW + 440, bot); q.stroke();
    // 栏杆上的花盆
    for (const px of [-230, 690, 1610]) { q.fillStyle = '#c8684a'; q.beginPath(); q.moveTo(px - 30, top); q.lineTo(px - 22, top - 44); q.lineTo(px + 22, top - 44); q.lineTo(px + 30, top); q.closePath(); q.fill(); q.fillStyle = N ? '#1e3028' : '#4e9a5a'; q.beginPath(); q.arc(px, top - 62, 30, 0, TAU); q.fill(); if (!N) for (let j = 0; j < 7; j++) { q.fillStyle = j % 2 ? '#ff4a7a' : '#ffd24a'; q.beginPath(); q.arc(px - 22 + j * 7, top - 74 + (j % 2) * 12, 6, 0, TAU); q.fill(); } }
  }
  /** 露台一整套（相机 cam；o: { pal, sky(q), sea(q), town(q), terrace(q), front(q), base, bk } ） */
  function terraceB(g, s, cam, o = {}) {
    const t = s.t, pal = o.pal || 'day', N = pal === 'night';
    inCam(g, cam, 0.03, (q) => q.drawImage(LC(s, 'bay-sky2-' + pal, VW + 800, BAY_HZ + 900, (qq) => { qq.translate(400, 400); baySky(qq, pal); }, 0.3), -400, -400, VW + 800, BAY_HZ + 900));
    inCam(g, cam, 0.05, (q) => {
      if (!N) {
        if (o.sun) sun(q, o.sun[0], o.sun[1], 40, 1);
        for (let i = 0; i < 5; i++) { const w = 400 + hash(801, i) * 300, x = ((hash(802, i) * 3200 + t * (8 + hash(803, i) * 6)) % 3200) - 700; q.drawImage(cloud(s, 810 + i, Math.round(w), Math.round(w * 0.36), o.cloudPal || 'day'), x, 140 + hash(804, i) * 240 - w * 0.36, w, w * 0.36); }
      }
      if (o.sky) o.sky(q);
    });
    // dof：近景时远处的海和屋顶用低分辨率烘焙（放大贴回去就是一层柔和的虚化，人物更跳）
    const dof = o.dof ? '#dof' : '';
    baked(g, s, 'bay-sea2-' + pal + dof, { x: 960, y: 540, z: 1 }, cam, 0.25, (q) => baySea(q, pal), o.dof ? 0.16 : 0.6, [-420, 280, VW + 420, 1360]);
    inCam(g, cam, 0.25, (q) => {
      if (!N) glints(q, t, { x0: -400, x1: VW + 400, y0: BAY_HZ + 2, y1: 800, sunX: o.sun ? o.sun[0] : 700, n: 110, seed: 37, pw1: 600, a: 0.9, stars: !o.dof });
      if (o.sea) o.sea(q);
    });
    baked(g, s, 'bay-town-' + pal + ':' + (o.bk || 'n') + dof, o.base || { x: 960, y: 540, z: 1 }, cam, 0.55, (q) => bayTown(q, pal), o.dof ? 0.16 : 0.8, [-440, 520, VW + 440, 1020]);
    if (o.dof && !N) inCam(g, cam, 0.55, (q) => haze(q, '236,244,250', -400, 480, VW + 800, 900, 0.3));
    if (o.town) inCam(g, cam, 0.55, o.town);
    baked(g, s, 'bay-rail-' + pal + ':' + (o.bk || 'n'), o.base || { x: 960, y: 540, z: 1 }, cam, 1, (q) => bayRail(q, pal), 1, [-440, 700, VW + 440, 1200]);
    if (o.terrace) inCam(g, cam, 1, o.terrace);
    if (o.front) inCam(g, cam, 1.3, o.front);
    if (o.fg) for (const f of o.fg) fgFrame(g, s, cam, f[0], f[1], Object.assign({ pal }, f[2] || {}));
  }

  /* =========================================================
   * 展厅（博物馆里）：高高的拱窗与斜射的阳光、火山剖面模型、标本柜、“浮石会浮起来”的水盆
   * 世界坐标 1920×1080（左右各多画 300）；地面 y = 900
   * ========================================================= */
  const HALL_FLOOR = 900;
  const CASES = [[1330, 560], [1620, 560]]; // 标本柜（左边缘 x、柜顶 y），宽 250
  function specimenD(q, type, x, y, R) {
    const ink = 'rgba(40,30,40,0.8)'; q.lineWidth = 2; q.strokeStyle = ink;
    if (type === 'rock') { const w = 36 + R() * 30, h = 22 + R() * 22, col = pick(['#cfc4b4', '#3a3440', '#7a7080', '#a88a70', '#8a5a4a', '#e0d28a'], R()); blob(q, rockPts(x + w / 2, y - h / 2, w / 2, h / 2, (R() * 1000) | 0, 9, 0.2).map(([a, b]) => [a, Math.min(y, b)])); q.fillStyle = col; q.fill(); q.stroke(); q.fillStyle = 'rgba(255,255,255,0.3)'; q.beginPath(); q.ellipse(x + w * 0.36, y - h * 0.7, w * 0.14, h * 0.1, -0.4, 0, TAU); q.fill(); q.fillStyle = '#fbf5e8'; q.fillRect(x + w / 2 - 9, y - 7, 18, 7); return w; }
    if (type === 'crystal') { const w = 50, col = pick([['#b48ae0', '#7a52b0'], ['#f0e070', '#b09a30'], ['#9ae0f0', '#4aa0c0']], R()); q.fillStyle = '#5a4a50'; blob(q, rockPts(x + w / 2, y - 8, w / 2, 10, 5, 7, 0.15)); q.fill(); for (let i = 0; i < 4; i++) { const cx = x + w * (0.2 + i * 0.2), hh = 20 + R() * 26, ww = 6 + R() * 4; q.save(); q.translate(cx, y - 10); q.rotate((i - 1.5) * 0.2); q.beginPath(); q.moveTo(-ww, 0); q.lineTo(-ww, -hh); q.lineTo(0, -hh - ww * 1.5); q.lineTo(ww, -hh); q.lineTo(ww, 0); q.closePath(); q.fillStyle = col[0]; q.fill(); q.stroke(); q.fillStyle = col[1]; q.fillRect(0, -hh, ww, hh); q.restore(); } return w; }
    const w = 34 + R() * 10, h = 54 + R() * 16; rrect(q, x, y - h, w, h, 6); q.fillStyle = 'rgba(210,225,235,0.4)'; q.fill(); q.save(); rrect(q, x, y - h, w, h, 6); q.clip(); q.fillStyle = pick(['#9a8a92', '#c8a878', '#e2b8c8', '#b8c8a0'], R()); q.fillRect(x, y - h * 0.5, w, h); q.restore(); rrect(q, x, y - h, w, h, 6); q.stroke(); q.fillStyle = pick(['#8a3a3a', '#3a4a5a'], R()); q.fillRect(x - 2, y - h - 8, w + 4, 9); return w;
  }
  function hallArt(q) {
    const ink = 'rgba(52,48,70,0.85)';
    // 墙：暖白灰泥 + 护墙板；天花板的梁
    q.fillStyle = vg(q, -100, 900, [[0, '#f2e6d2'], [1, '#e8d8c0']]); q.fillRect(-300, -100, VW + 600, 1000);
    q.fillStyle = '#d9c4a4'; q.fillRect(-300, -100, VW + 600, 120);
    for (let x = -300; x < VW + 300; x += 240) { q.fillStyle = '#b8946a'; q.fillRect(x, -100, 40, 150); }
    q.fillStyle = '#b8946a'; q.fillRect(-300, 20, VW + 600, 24);
    q.fillStyle = '#8a6a50'; q.fillRect(-300, 700, VW + 600, 200); q.fillStyle = '#a0805e'; q.fillRect(-300, 700, VW + 600, 10);
    for (let x = -280; x < VW + 300; x += 160) { q.strokeStyle = 'rgba(40,20,16,0.35)'; q.lineWidth = 3; q.strokeRect(x, 730, 130, 150); }
    // 两扇高高的拱窗（透出蓝天与棕榈叶）
    for (const wx of [80, 520]) {
      q.fillStyle = vg(q, 120, 640, [[0, '#7cc4f0'], [1, '#d8f0f8']]); archPath(q, wx + 130, 380, 260, 520); q.fill();
      q.save(); archPath(q, wx + 130, 380, 260, 520); q.clip();
      q.fillStyle = '#4e9a5a'; for (let i = 0; i < 5; i++) { q.save(); q.translate(wx + 260, 180); q.rotate(0.6 + i * 0.25); frond(q, 0, 0, 0, 200, 0.8); q.restore(); }
      q.fillStyle = 'rgba(255,255,255,0.35)'; q.beginPath(); q.moveTo(wx, 500); q.lineTo(wx + 260, 300); q.lineTo(wx + 260, 360); q.lineTo(wx, 560); q.closePath(); q.fill();
      q.restore();
      q.strokeStyle = '#fbf6ee'; q.lineWidth = 14; archPath(q, wx + 130, 380, 260, 520); q.stroke();
      q.lineWidth = 6; q.beginPath(); q.moveTo(wx + 130, 120); q.lineTo(wx + 130, 640); q.moveTo(wx, 380); q.lineTo(wx + 260, 380); q.stroke();
      q.strokeStyle = ink; q.lineWidth = 2; archPath(q, wx + 130, 380, 276, 536); q.stroke();
      q.fillStyle = '#e0d0b4'; q.fillRect(wx - 16, 636, 292, 18);
    }
    // 挂在墙上的火山剖面海报
    q.fillStyle = '#6a4a3a'; q.fillRect(930, 150, 330, 250); q.fillStyle = '#f6ecd8'; q.fillRect(944, 164, 302, 222);
    q.save(); q.beginPath(); q.rect(944, 164, 302, 222); q.clip();
    q.fillStyle = '#a8d4ec'; q.fillRect(944, 164, 302, 80);
    for (let i = 0; i < 4; i++) { q.fillStyle = ['#c8a07a', '#b08a64', '#9a7654', '#c8b08a'][i]; q.fillRect(944, 250 + i * 36, 302, 40); }
    q.fillStyle = '#6a5a58'; q.beginPath(); q.moveTo(990, 260); q.quadraticCurveTo(1080, 240, 1086, 190); q.lineTo(1106, 190); q.quadraticCurveTo(1112, 240, 1200, 260); q.closePath(); q.fill();
    q.fillStyle = '#e0603a'; q.fillRect(1090, 190, 12, 170); q.beginPath(); q.ellipse(1096, 362, 56, 16, 0, 0, TAU); q.fill();
    q.restore();
    E.text(q, '旧汐斯塔火山 · 剖面', 1095, 424, { size: 22, weight: 700, color: '#5a3a2a', spacing: 2 });
    // 标本柜（右边两座）
    for (const [cx, cy] of CASES) {
      q.fillStyle = '#6a4630'; q.fillRect(cx - 10, cy - 20, 270, 360); q.fillStyle = '#8a5e40'; q.fillRect(cx - 16, cy - 30, 282, 16);
      q.fillStyle = 'rgba(200,226,240,0.35)'; q.fillRect(cx, cy, 250, 300);
      const R = E.rng(cx | 0);
      for (const sy of [cy + 100, cy + 200, cy + 296]) { q.fillStyle = '#8a5e40'; q.fillRect(cx, sy, 250, 8); let x = cx + 12; while (x < cx + 200) { const tp = pick(['rock', 'crystal', 'jar', 'rock'], R()); x += specimenD(q, tp, x, sy, R) + 12; } }
      q.fillStyle = 'rgba(255,255,255,0.35)'; q.beginPath(); q.moveTo(cx + 20, cy); q.lineTo(cx + 80, cy); q.lineTo(cx + 10, cy + 300); q.lineTo(cx, cy + 300); q.lineTo(cx, cy + 40); q.closePath(); q.fill();
      q.strokeStyle = ink; q.lineWidth = 3; q.strokeRect(cx - 10, cy - 20, 270, 360); q.strokeRect(cx, cy, 250, 300);
      q.fillStyle = '#6a4630'; q.fillRect(cx, cy + 340, 14, 60); q.fillRect(cx + 236, cy + 340, 14, 60);
    }
    // 地面：打过蜡的木地板（窗户的倒影）
    q.fillStyle = vg(q, HALL_FLOOR, 1200, [[0, '#b8845a'], [1, '#9a6a44']]); q.fillRect(-300, HALL_FLOOR, VW + 600, 300);
    for (let i = -25; i < 45; i++) { q.strokeStyle = 'rgba(70,40,20,0.3)'; q.lineWidth = 2; q.beginPath(); q.moveTo(960 + i * 80, HALL_FLOOR); q.lineTo(960 + i * 150, 1200); q.stroke(); }
    q.fillStyle = 'rgba(40,20,10,0.35)'; q.fillRect(-300, HALL_FLOOR - 4, VW + 600, 8);
    q.fillStyle = 'rgba(255,240,210,0.22)'; for (const wx of [80, 520]) { q.beginPath(); q.moveTo(wx + 40, HALL_FLOOR + 10); q.lineTo(wx + 220, HALL_FLOOR + 10); q.lineTo(wx + 300, 1200); q.lineTo(wx + 60, 1200); q.closePath(); q.fill(); }
    // 天花板上垂下来的特展横幅
    q.fillStyle = '#2f7a78'; q.beginPath(); q.moveTo(760, 44); q.lineTo(1160, 44); q.lineTo(1160, 110); q.lineTo(960, 126); q.lineTo(760, 110); q.closePath(); q.fill();
    E.text(q, '夏季特展 · 火山与我们', 960, 92, { size: 30, weight: 900, color: '#ffe08a', spacing: 4 });
  }
  /** 展厅中央的火山剖面模型（圆台上；设计 520×520，底中心 (260, 500)） */
  function modelArt(q) {
    const ink = 'rgba(52,48,70,0.9)';
    q.fillStyle = '#6a4a3a'; q.beginPath(); q.ellipse(260, 470, 240, 36, 0, 0, TAU); q.fill(); q.fillRect(20, 470, 480, 30); q.beginPath(); q.ellipse(260, 500, 240, 36, 0, 0, TAU); q.fill();
    q.fillStyle = '#8a6448'; q.beginPath(); q.ellipse(260, 470, 240, 36, 0, 0, TAU); q.fill();
    q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.ellipse(260, 470, 240, 36, 0, 0, TAU); q.stroke();
    // 山体：左半边是外观，右半边切开露出岩层与岩浆通道
    q.save();
    q.beginPath(); q.moveTo(50, 470); q.quadraticCurveTo(200, 430, 236, 150); q.lineTo(284, 150); q.quadraticCurveTo(320, 430, 470, 470); q.closePath();
    q.fillStyle = vg(q, 150, 470, [[0, '#9a8a94'], [1, '#7a9a70']]); q.fill(); q.clip();
    q.fillStyle = '#e8c89a'; q.fillRect(260, 140, 240, 340);
    for (let i = 0; i < 5; i++) { q.fillStyle = ['#d8a878', '#c08a60', '#a87450', '#d8b48a', '#b88a64'][i]; q.fillRect(260, 220 + i * 50, 240, 50); }
    q.fillStyle = '#e8603a'; q.fillRect(252, 150, 18, 260); q.beginPath(); q.ellipse(262, 420, 70, 26, 0, 0, TAU); q.fill();
    q.fillStyle = '#ffb060'; q.beginPath(); q.ellipse(262, 420, 40, 12, 0, 0, TAU); q.fill(); q.fillRect(258, 150, 8, 260);
    q.restore();
    q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.moveTo(50, 470); q.quadraticCurveTo(200, 430, 236, 150); q.lineTo(284, 150); q.quadraticCurveTo(320, 430, 470, 470); q.stroke();
    q.beginPath(); q.moveTo(260, 150); q.lineTo(260, 470); q.stroke();
    q.fillStyle = '#fbf5e8'; rrect(q, 170, 486, 180, 28, 6); q.fill(); q.stroke();
    E.text(q, 'OLD SIESTA · 1:5000', 260, 506, { font: 'sans', size: 14, weight: 700, color: '#5a3a2a' });
  }
  /** 浮石水盆（底座 + 玻璃盆 + 水） */
  function basinArt(q) {
    q.fillStyle = '#e8dcc8'; q.fillRect(70, 120, 120, 180); q.strokeStyle = INK_D; q.lineWidth = 3; q.strokeRect(70, 120, 120, 180);
    q.fillStyle = '#d8ccb4'; q.fillRect(56, 110, 148, 16);
    q.fillStyle = 'rgba(200,230,245,0.45)'; rrect(q, 30, 30, 200, 84, 16); q.fill(); q.stroke();
    q.fillStyle = 'rgba(80,180,210,0.55)'; q.fillRect(34, 56, 192, 54);
    q.fillStyle = 'rgba(255,255,255,0.7)'; q.fillRect(34, 54, 192, 4);
    q.fillStyle = '#fffaf0'; rrect(q, 60, 180, 140, 60, 8); q.fill(); q.stroke();
    E.text(q, '浮石会浮起来！', 130, 206, { size: 17, weight: 900, color: '#2f7a78' });
    E.text(q, 'PUMICE FLOATS', 130, 228, { font: 'sans', size: 12, weight: 700, color: '#6a5a4a' });
  }
  function pumice(g, x, y, r, o = {}) {
    const pts = rockPts(x, y, r, r * 0.78, o.seed || 27, 11, 0.16);
    g.save();
    blob(g, pts); g.fillStyle = rg(g, x - r * 0.35, y - r * 0.4, r * 0.1, r * 1.3, [[0, '#f2e8dc'], [0.6, '#cfc2b2'], [1, '#9a8c80']]); g.fill();
    g.clip(); g.fillStyle = 'rgba(90,72,64,0.55)';
    for (let i = 0; i < 12; i++) { const a = hash(31, i, 1) * TAU, d = Math.sqrt(hash(31, i, 2)) * r * 0.85; g.beginPath(); g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, r * (0.04 + hash(31, i, 3) * 0.06), r * (0.03 + hash(31, i, 4) * 0.04), a, 0, TAU); g.fill(); }
    g.restore();
    blob(g, pts); g.strokeStyle = '#4a3a36'; g.lineWidth = Math.max(1.2, r * 0.07); g.stroke();
  }
  /** 从高窗斜射进来的光柱（加法混合；一拍一呼吸） */
  function hallShafts(q, t, a = 1) {
    q.save(); q.globalCompositeOperation = 'lighter';
    for (const wx of [80, 520]) for (let i = 0; i < 3; i++) {
      const al = (0.07 + 0.03 * Math.sin(t * 0.5 + i * 1.7 + wx)) * a;
      q.fillStyle = `rgba(255,236,190,${al})`;
      const x0 = wx + 30 + i * 70;
      q.beginPath(); q.moveTo(x0, 160); q.lineTo(x0 + 70, 160); q.lineTo(x0 + 560, 1100); q.lineTo(x0 + 400, 1100); q.closePath(); q.fill();
    }
    q.restore();
  }
  function hallDust(q, t, n = 36) {
    for (let i = 0; i < n; i++) {
      const u = fract(hash(91, i) + t * 0.012 * (0.4 + hash(92, i))), x = 160 + u * 700 + hash(93, i) * 300 + Math.sin(t * 0.6 + i) * 12, y = 200 + fract(hash(94, i) + t * 0.01) * 700;
      const a = 0.4 + 0.4 * Math.sin(t * 1.7 + i * 2.1);
      q.globalAlpha = a; q.fillStyle = '#fff4d8'; q.fillRect(x, y, 2.4, 2.4);
    }
    q.globalAlpha = 1;
  }
  function hallD(g, s, cam, o = {}) {
    const t = s.t;
    g.fillStyle = '#e8d8c0'; g.fillRect(0, 0, VW, VH);
    baked(g, s, 'hall:' + (o.bk || 'n'), o.base || { x: 960, y: 540, z: 1 }, cam, 1, hallArt, 1, [-320, -120, VW + 320, 1220]);
    inCam(g, cam, 1, (q) => {
      q.drawImage(LC(s, 'hall-model', 520, 520, modelArt, 1), 700, 380, 520, 520);
      // 模型的火山口冒一缕白汽
      for (let i = 0; i < 6; i++) { const ph = fract(t * 0.3 + i / 6); withAlpha(q, Math.sin(PI * ph) * 0.5, (qq) => qq.drawImage(puff(i, '255,255,255'), 960 - 40 - ph * 60, 520 - ph * 160, 80 + ph * 80, 40 + ph * 40)); }
      q.drawImage(LC(s, 'hall-basin', 260, 310, basinArt, 1), 240, 600, 260, 310);
      if (o.mid) o.mid(q);
      // 高窗斜射进来的光柱：有后期工具箱时用它的柔边光束（每扇窗一束，一拍一呼吸），否则用自带的平面光柱
      const F = FIN();
      if (F) for (const wx of [80, 520]) F.rays(q, s, { x: wx + 110, y: 170, angle: 1.1, spread: 0.3, n: 4, len: 1150, width: [70, 170], rgb: '255,234,190', a: 0.3, seed: 11 + wx });
      else hallShafts(q, t);
      hallDust(q, t);
      if (o.after) o.after(q);
    });
    if (o.front) inCam(g, cam, 1.35, o.front);
  }

  /* ---------- 镜头 9 · 展厅（41.46 → 46.04）：她拿法杖当教鞭给游客讲火山；小朋友把浮石丢进水盆——浮起来了 ---------- */
  function shotHall(g, s) {
    const t = s.t, lt = s.lt, k = ease.inOut(clamp(lt / 4.5));
    const cam = { x: lerp(820, 900, k), y: lerp(600, 620, k), z: lerp(1.0, 1.08, k), ...hand(s, 19, 3, 0.35) };
    const drop = s.shot.t0 + BEAT * 5 + 0.05; // 第 6 拍：扑通
    hallD(g, s, cam, {
      mid: (q) => {
        // 听讲的游客（背对镜头一点）
        for (const i of [0, 2, 1, 3]) townsfolk(q, s, { x: 1160 + i * 150 + (i % 2) * 16, y: 1010 + (i % 2) * 22, h: 330 - (i === 3 ? 60 : 0), seed: TOURISTS[(i * 4 + 5) % TOURISTS.length], pose: i === 1 ? 'point' : 'stand', aim: -0.5, t: t + i, flip: true, look: [-1, -0.4], expr: t > drop + 0.2 && i === 0 ? 'surprise' : 'smile' }, i + 1);
        // 她：拿法杖指着模型讲解
        // （官方小人：抬手讲解——Interact；手绘版：拿法杖指着模型）
        adele(q, { x: 620 - 40, y: 1030, h: 400, pose: SDON() ? 'wave' : 'point', aim: 0.1, prop: 'staff', t, expr: 'talk', talk: 1, look: [1, -0.2] });
        // 小朋友和浮石
        const kx = 470, ky = 990;
        // 丢浮石的是雪雉（站在水盆边，“扑通”之后开心地挥手）
        townsfolk(q, s, mixIn({ x: kx, y: ky, h: 250, seed: 48, pose: t < drop ? 'stand' : 'cheer', aim: -0.2, t, expr: t < drop ? 'smile' : 'laugh', flip: false, look: [1, -0.5] }, 'stand', drop, 0.25, t), 0);
        const a = t - drop;
        if (a < 0) pumice(q, kx + 60, ky - 150, 16);
        else {
          const fall = clamp(a / 0.28), y = lerp(ky - 150, 656 + Math.sin(t * 3) * 3, ease.in(fall)), x = lerp(kx + 60, 360, fall);
          pumice(q, x, y, 16 + (1 - fall) * 2, { seed: 27 });
          if (a > 0.28) { const sp = a - 0.28; for (let i = 0; i < 10; i++) { const ang = -PI / 2 + (i / 9 - 0.5) * 2.2, v = 180 + hash(95, i) * 160; const px = 360 + Math.cos(ang) * v * sp, py = 650 + Math.sin(ang) * v * sp + 700 * sp * sp; if (sp < 0.6) { q.fillStyle = `rgba(160,220,240,${1 - sp / 0.6})`; q.beginPath(); q.arc(px, py, 5, 0, TAU); q.fill(); } } pop(q, '哇！', 470, 560, clamp((a - 0.3) / 0.2) * (1 - clamp((a - 1.8) / 0.3)), { size: 46, color: '#2f9ab0' }); }
        }
      },
    });
    vig(g, s, 0.32);
  }

  /* ---------- 镜头 10 · 观测台（46.04 → 50.60）：望远镜对准老火山——火山口的白汽里，一只粉色的羊眨了眨眼 ---------- */
  function domeArt(q) {
    // 圆顶观测室（设计 1920×1080）：弧形的墙、书架、星图；圆顶开着一道缝，外面是蓝天
    q.fillStyle = vg(q, 0, 1080, [[0, '#3a3a5a'], [0.6, '#5a5470'], [1, '#6a5a60']]); q.fillRect(-200, -200, VW + 400, 1400);
    // 圆顶的肋
    q.strokeStyle = 'rgba(20,20,40,0.4)'; q.lineWidth = 10;
    for (let i = -6; i <= 6; i++) { q.beginPath(); q.moveTo(960 + i * 60, -200); q.quadraticCurveTo(960 + i * 220, 300, 960 + i * 330, 700); q.stroke(); }
    // 开着的缝：一条蓝天
    q.save(); q.beginPath(); q.moveTo(900, -200); q.lineTo(1080, -200); q.lineTo(1120, 420); q.lineTo(860, 420); q.closePath(); q.clip();
    q.fillStyle = vg(q, -200, 420, [[0, '#3a92da'], [1, '#bfe4f4']]); q.fillRect(800, -200, 400, 700);
    q.fillStyle = '#ffffff'; for (const [x, y, r] of [[960, 150, 40], [1000, 130, 46], [1040, 160, 34], [920, 170, 26]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); }
    q.restore();
    q.strokeStyle = '#2a2a44'; q.lineWidth = 8; q.beginPath(); q.moveTo(900, -200); q.lineTo(860, 420); q.moveTo(1080, -200); q.lineTo(1120, 420); q.stroke();
    // 下半圈墙：书架与星图
    q.fillStyle = '#6a4a3a'; q.fillRect(-200, 560, VW + 400, 520);
    for (let s2 = 0; s2 < 3; s2++) { const y = 620 + s2 * 110; q.fillStyle = '#4a3024'; q.fillRect(-200, y + 80, 760, 12); let x = -180; const R = E.rng(40 + s2); while (x < 540) { const bw = 16 + R() * 14, bh = 50 + R() * 30; q.fillStyle = pick(['#7a2e3a', '#2e4a6a', '#3e5a3a', '#8a6a3a', '#4a3a6a'], R()); q.fillRect(x, y + 80 - bh, bw, bh); x += bw + 2; } }
    q.fillStyle = '#e8dcc0'; q.fillRect(1360, 600, 360, 250); q.strokeStyle = '#4a3024'; q.lineWidth = 8; q.strokeRect(1360, 600, 360, 250);
    q.fillStyle = '#2a3050'; for (let i = 0; i < 30; i++) q.fillRect(1380 + hash(41, i) * 320, 620 + hash(42, i) * 210, 3, 3);
    q.strokeStyle = 'rgba(42,48,80,0.6)'; q.lineWidth = 1.5; q.beginPath(); q.arc(1540, 725, 90, 0, TAU); q.stroke();
    q.fillStyle = '#4a3a3a'; q.fillRect(-200, 900, VW + 400, 300);
    q.fillStyle = 'rgba(255,255,255,0.08)'; q.fillRect(-200, 900, VW + 400, 6);
    // 天光从缝里落到地上
    q.globalCompositeOperation = 'lighter';
    q.fillStyle = 'rgba(190,220,255,0.12)'; q.beginPath(); q.moveTo(870, 420); q.lineTo(1110, 420); q.lineTo(1300, 1100); q.lineTo(700, 1100); q.closePath(); q.fill();
    q.globalCompositeOperation = 'source-over';
  }
  function telescope(q, x, y, sc, ang) {
    // 三脚架 + 黄铜镜筒（ang：镜筒仰角，镜筒从 (x,y) 往左上）
    q.save(); q.translate(x, y); q.scale(sc, sc);
    q.strokeStyle = '#3a3040'; q.lineWidth = 12; q.lineCap = 'round';
    q.beginPath(); q.moveTo(0, 0); q.lineTo(-110, 300); q.moveTo(0, 0); q.lineTo(100, 300); q.moveTo(0, 0); q.lineTo(20, 320); q.stroke();
    q.fillStyle = '#5a4a5a'; q.beginPath(); q.arc(0, 0, 22, 0, TAU); q.fill();
    q.rotate(-ang);
    q.fillStyle = vg(q, -40, 40, [[0, '#f0cc70'], [0.5, '#c89a3a'], [1, '#8a6420']]);
    q.beginPath(); q.moveTo(-60, -26); q.lineTo(420, -40); q.lineTo(420, 40); q.lineTo(-60, 26); q.closePath(); q.fill();
    q.strokeStyle = '#5a4020'; q.lineWidth = 3; q.stroke();
    q.fillStyle = '#8a6420'; q.fillRect(410, -46, 26, 92); q.fillRect(100, -34, 16, 68); q.fillRect(-70, -18, 20, 36);
    q.fillStyle = 'rgba(255,255,255,0.4)'; q.fillRect(-50, -18, 460, 7);
    q.restore(); q.lineCap = 'butt';
  }
  function scopeView(q, s, t, lt, wink) {
    // 望远镜里的火山口（圆形视野）
    const cx = 960, cy = 540, R = 430;
    q.fillStyle = '#05060c'; q.fillRect(0, 0, VW, VH);
    q.save(); q.beginPath(); q.arc(cx, cy, R, 0, TAU); q.clip();
    q.fillStyle = vg(q, 100, 1000, [[0, '#6aaee0'], [0.5, '#b8def0'], [1, '#e8f0f0']]); q.fillRect(0, 0, VW, VH);
    // 火山口的边
    q.fillStyle = vg(q, 560, 1000, [[0, '#8a7a84'], [1, '#6a5a64']]);
    q.beginPath(); q.moveTo(400, 1000); q.lineTo(460, 700); q.quadraticCurveTo(700, 620, 840, 660); q.quadraticCurveTo(960, 700, 1080, 660); q.quadraticCurveTo(1240, 610, 1480, 720); q.lineTo(1540, 1000); q.closePath(); q.fill();
    q.fillStyle = '#4a3a44'; q.beginPath(); q.ellipse(960, 690, 150, 34, 0, 0, TAU); q.fill();
    q.strokeStyle = 'rgba(40,30,40,0.35)'; q.lineWidth = 4; for (let i = 0; i < 8; i++) { q.beginPath(); q.moveTo(480 + i * 120, 700 + (i % 2) * 20); q.lineTo(520 + i * 110, 1000); q.stroke(); }
    // 白汽：往上飘；很快聚成一只羊
    const form = sst(0.25, 1.1, lt);
    for (let i = 0; i < 14; i++) { const ph = fract(t * 0.25 + i / 14); withAlpha(q, (1 - form * 0.7) * Math.sin(PI * ph) * 0.8, (qq) => qq.drawImage(puff(i, '255,255,255'), 960 - 150 + hash(97, i) * 200 - ph * 80, 680 - ph * 520, 220 + ph * 200, 110 + ph * 100)); }
    if (form > 0) {
      q.save(); q.translate(820, 170 + (1 - form) * 120); q.scale(1.3 * (0.7 + 0.3 * form), 1.3 * (0.7 + 0.3 * form)); q.globalAlpha = form;
      sheepCloudArt(q, '#ffffff', '#ffd6e6', null, 'rgba(240,190,214,0.8)');
      // 眼睛（会眨）+ 脸红
      q.fillStyle = 'rgba(80,40,70,0.9)'; q.beginPath(); q.ellipse(270, 88, 5, 7 * (1 - wink) + 0.8, 0, 0, TAU); q.fill();
      q.fillStyle = 'rgba(255,140,180,0.6)'; q.beginPath(); q.ellipse(262, 106, 9, 5, 0, 0, TAU); q.fill();
      q.restore();
      if (wink > 0.5) star4(q, 1180, 230, 26, t * 2, '#ffd24a', 1);
    }
    q.restore();
    // 镜筒的暗角 + 十字线
    q.fillStyle = rg(q, cx, cy, R * 0.7, R, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.75)']]); q.beginPath(); q.arc(cx, cy, R, 0, TAU); q.fill();
    q.strokeStyle = 'rgba(20,20,30,0.45)'; q.lineWidth = 2; q.beginPath(); q.moveTo(cx - R, cy); q.lineTo(cx + R, cy); q.moveTo(cx, cy - R); q.lineTo(cx, cy + R); q.stroke();
    q.strokeStyle = '#1a1a24'; q.lineWidth = 16; q.beginPath(); q.arc(cx, cy, R + 6, 0, TAU); q.stroke();
  }
  function shotScope(g, s) {
    const t = s.t, lt = s.lt;
    const pov0 = BEAT * 4 - 0.05, pov1 = BEAT * 8 - 0.3;
    if (lt >= pov0 && lt < pov1) {
      const u = lt - pov0;
      const wink = win(u, 1.3, 1.37, 1.55, 1.65);
      const cam = { x: 960 + Math.sin(t * 0.7) * 6, y: 540 + Math.cos(t * 0.6) * 5, z: 1.0 + u * 0.03 };
      inCam(g, cam, 1, (q) => scopeView(q, s, t, u, wink));
      return;
    }
    const after = lt >= pov1;
    const cam = { x: after ? 1000 : lerp(900, 980, clamp(lt / pov0)), y: 560, z: after ? 1.35 : lerp(1.0, 1.12, clamp(lt / pov0)), ...(after ? shake(s, 8 * Math.exp(-(lt - pov1) * 6), 21) : hand(s, 21, 3, 0.3)) };
    g.fillStyle = '#4a4458'; g.fillRect(0, 0, VW, VH);
    inCam(g, cam, 1, (q) => q.drawImage(LC(s, 'dome', VW + 400, VH + 400, (qq) => { qq.translate(200, 200); domeArt(qq); }, 0.8), -200, -200, VW + 400, VH + 400));
    inCam(g, cam, 1, (q) => {
      // 凯勒老师在转圆顶的摇柄
      kellerCard(q, s, { x: 1500, y: 1085, h: 540, crop: 'upper', expr: after ? 9 : 10, look: after ? [-0.55, 0.25] : [-0.4, 0.35], mouth: after ? 0 : talkK([[s.shot.t0 + 0.3, s.shot.t0 + 1.4]], 21) },
        (qq) => keller(qq, { x: 1480, y: 1000, h: 400 * KH(), pose: 'point', aim: 0.8, t, flip: true, expr: 'smile', look: [-1, -0.6], rig: { look: [-0.5, 0.3], expr: after ? 9 : 10 } }, s));
      telescope(q, 1010, 690, 0.9, 0.62);
      // 她：弯腰凑到目镜上；回过神来时往后一仰
      adele(q, { x: 880, y: 1000, h: 400, pose: after ? 'cover' : 'stand', t, expr: after ? 'surprise' : 'closed', look: after ? [0.4, -0.3] : [1, -0.2], headPose: after ? undefined : 'down', rot: after ? -0.08 * Math.exp(-(lt - pov1) * 3) : 0.06 });
      if (after) pop(q, '！', 860, 520, clamp((lt - pov1) / 0.12), { size: 90, color: '#ff6f9c' });
    });
    vig(g, s, 0.5);
  }

  /* =========================================================
   * 看不见的小羊（50.60 → 73.69）
   * ========================================================= */
  /* ---------- 镜头 11 · 标本柜里的小羊（50.60 → 55.18） ---------- */
  function shotLambPop(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const k = ease.inOut(clamp(lt / 4.5));
    const cam = { x: lerp(1420, 1480, k), y: lerp(640, 660, k), z: lerp(1.55, 1.65, k), ...hand(s, 23, 3, 0.4) };
    const pops = [[0, 1450, 760, 70, 'eat'], [2, 1700, 555, 64, 'stand'], [4, 1880, 860, 70, 'stand'], [5, 1395, 660, 58, 'jump']];
    const rub = bt > 5.6;
    hallD(g, s, cam, {
      bk: 'case', base: { x: 1450, y: 650, z: 1.6 },
      mid: (q) => {
        // 背后路过、什么也没看见的游客
        // （旧写法 x = 180 + (t·80 % 820)：走到 x = 1000——画面左侧四分之一处——就凭空消失、从左边重来。镜头只有 4.5 秒，直接走过去，不循环）
        for (let i = 0; i < 2; i++) townsfolk(q, s, { x: 700 + i * 260 + lt * 80, y: 960, h: 280, seed: TOURISTS[(i * 9 + 4) % TOURISTS.length], pose: 'walk', speed: stepRate('crowd', 300, 80), walkV: 80, t: t + i, expr: 'smile' }, i + 2);
        // 小羊：一拍冒出一只（柜子里的那只在啃标签）
        for (const [b, x, y, V, pose] of pops) {
          const a = bt - b;
          if (a < 0) continue;
          const bob = pose === 'eat' ? Math.sin(t * 9) * 2 : hop(fract(s.beat * (b % 2 ? 1 : 0.5)))[0] * 10;
          lamb(q, s, x, y - bob, V, { id: 2561 * 16 + b, pose: a < 0.3 ? 'jump' : pose, expr: rub && b === 4 ? 'happy' : a < 0.4 ? 'surprise' : 'happy', flip: x > 1600, sq: a < 0.15 ? 0.5 : 0, glow: 0.6 });
          // （旧写法在柜子里的小羊身上盖一块半透明的“玻璃”方块：边缘硬，看起来像小羊被框在一个白框里；柜顶上那只也被误盖了。
          //  柜子底图里标本本来就画在玻璃色之上，小羊和标本一样不加这层）
          poof(q, x, y - V * 0.5, V * 0.9, clamp(a / 0.5), b + 3);
          if (pose === 'eat' && a > 0.4) { q.fillStyle = '#fbf5e8'; q.save(); q.translate(x + 30, y - 10); q.rotate(Math.sin(t * 9) * 0.1); q.fillRect(-10, -6, 20, 10); q.restore(); }
        }
        // 她：擦柜子的玻璃 → 看见了 → 揉揉眼睛
        adele(q, { x: 1220, y: 1010, h: 420, pose: rub ? 'wipe' : bt < 1 ? 'reach' : 'stand', aim: 0.2, t, expr: rub ? 'closed' : bt < 1 ? 'neutral' : 'surprise', look: [1, -0.2], flip: false });
        if (bt > 1 && bt < 5.5) pop(q, '？', 1150, 560, clamp((bt - 1) / 0.3), { size: 70, color: '#3a8ad0' });
      },
    });
    vig(g, s, 0.35);
  }

  /* ---------- 镜头 12 · 冰淇淋（55.18 → 59.74）：她一转头，冰淇淋就一口一口地没了 ---------- */
  function iceCream(g, x, y, sc, bites, o = {}) {
    // (x, y) 为甜筒尖；bites 0..3 被咬掉的层数（可以是小数：正在咬）
    g.save(); g.translate(x, y); g.scale(sc, sc); g.rotate(o.rot || 0);
    g.fillStyle = '#e8b870'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-22, -58); g.lineTo(22, -58); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(150,100,40,0.6)'; g.lineWidth = 1.5; g.save(); g.clip(); for (let i = -4; i < 5; i++) { g.beginPath(); g.moveTo(i * 10 - 30, -60); g.lineTo(i * 10 + 30, 0); g.moveTo(i * 10 + 30, -60); g.lineTo(i * 10 - 30, 0); g.stroke(); } g.restore();
    g.strokeStyle = '#8a5a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(-22, -58); g.lineTo(22, -58); g.closePath(); g.stroke();
    // 奶油：从下往上四层；被咬掉 b 口时只剩下面几层
    const tiers = [[0, -64, 30, 14], [0, -84, 24, 12], [0, -100, 16, 10], [3, -112, 6, 6]];
    const keep = [4, 2, 1, 0][Math.max(0, Math.min(3, bites | 0))];
    for (let i = 0; i < keep; i++) {
      const [dx, dy, rx, ry] = tiers[i];
      g.fillStyle = i % 2 ? '#ffd0e0' : '#ff9ec0'; g.beginPath(); g.ellipse(dx, dy, rx, ry, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(dx - rx * 0.3, dy - ry * 0.3, rx * 0.35, ry * 0.3, 0, 0, TAU); g.fill();
    }
    // 被咬过的那层：顶上一道齿痕（深一点的粉）
    if (keep > 0 && keep < 4) { const [dx, dy, rx, ry] = tiers[keep - 1]; g.strokeStyle = '#e06a98'; g.lineWidth = 2; g.beginPath(); for (let j = 0; j <= 4; j++) { const xx = dx - rx * 0.7 + j * rx * 0.35; g.lineTo(xx, dy - ry * 0.6 + (j % 2) * 4); } g.stroke(); }
    g.restore();
  }
  function shotIceCream(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: 930, y: 700, z: 1.5 + lt * 0.012, ...hand(s, 25, 3, 0.35) };
    const turned = bt > 1.5 && bt < 6.4;            // 她转过身去看海
    const bites = bt > 2.2 ? Math.min(3, Math.floor(bt - 2.2) + 1) : 0;
    const back = bt >= 6.4;
    terraceB(g, s, cam, {
      pal: 'day', sun: [1500, 60], bk: 'ice', base: { x: 930, y: 700, z: 1.5 }, dof: 1, fg: [['flowers', 'br', {}]],
      terrace: (q) => {
        // 凯勒老师（左）：递过冰淇淋，然后自己也看海；回头时一脸问号
        // （官方立绘剪纸：凯勒老师一直笑着和她聊天，什么也没察觉；最后一脸问号）
        const b0 = s.shot.t0 + 6.4 * BEAT;
        const it0 = s.shot.t0, KP = E.keyart && E.keyart.path;
        const kc = kellerCard(q, s, {
          x: 560, y: 1150, h: 620, crop: 'upper', flip: true, expr: [[it0 - 1, 8], [it0 + 1.2, 9], [it0 + 2.6, 8], [b0, 4]],
          // 一直笑着和她聊天（看着她 → 也转头看海），什么也没察觉；最后低头看着空甜筒，一脸问号
          mouth: talkK([[it0 + 0.1, it0 + 1.1], [it0 + 2.7, it0 + 3.9]], 11),
          look: KP ? KP([[it0, [-0.5, 0.1]], [it0 + 2.4, [-0.45, 0.1]], [it0 + 3.0, [0.35, -0.15]], [b0 - 0.2, [0.3, -0.15]], [b0 + 0.3, [-0.5, 0.45]]]) : [-0.4, 0.1],
          tilt: (tt) => 0.8 * sst(b0, b0 + 0.4, tt),
        }, (qq) => keller(qq, { x: 600, y: 1060, h: 400 * KH(), pose: back ? 'think' : bt < 1.5 ? 'reach' : 'turn', turn: 0.9, aim: -0.1, t, expr: back ? 'surprise' : 'smile', look: back ? [1, 0.3] : bt < 1.5 ? [1, 0] : [0, -0.1], flip: false }, s));
        if (back) pop(q, '？', kc ? 640 : 560, kc ? 520 : 560, clamp((bt - 6.5) / 0.25), { size: 64, color: '#3a8ad0' });
        // 她：接过冰淇淋 → 转身看海（甜筒还举在身边）→ 转回来：只剩甜筒
        // （官方小人：转过去和凯勒老师说话——甜筒举在身边，小羊们在她背后一口一口地啃）
        const ao = turned
          ? (SDON() ? { x: 1000, y: 1060, h: 420, pose: 'wave', t, flip: true } : { x: 1000, y: 1060, h: 420, pose: 'turn', turn: 0.25, t, flip: false, arms: 'hold', expr: 'content' })
          : { x: 1000, y: 1060, h: 420, pose: 'hold', t, expr: back ? 'surprise' : 'laugh', look: back ? [0.3, 0.6] : [-1, 0.2], flip: false };
        // 转身的那一帧（官方小人转身是瞬间的）起 0.2 秒里拿着 → 挥手交叉淡化；转回来时反过来
        if (SDON()) { mixIn(ao, 'hold', 1.5, 0.2, bt); mixIn(ao, 'wave', 6.4, 0.2, bt); }
        adele(q, ao);
        const hn = anchor('adele-alter', ao, 'handN', [1060, 800]);
        const cx = hn[0] + (turned && !SDON() ? 60 : 4), cy = hn[1] + 20;
        // 栏杆上的三只小羊：趁她转身，一拍一口
        for (let i = 0; i < 3; i++) {
          const vis = win(bt, 1.3 + i * 0.25, 1.6 + i * 0.25, 6.1, 6.4);
          if (vis <= 0.01) continue;
          const biting = bt > 2.2 + i && bt < 2.9 + i;
          const x = biting ? cx + 70 : 1240 + i * 120, y = biting ? cy - 60 : 822;
          lamb(q, s, x, y - (biting ? 0 : hop(fract(s.beat + i * 0.3))[0] * 12), 118, { id: 2628 * 16 + i, pose: biting ? 'eat' : 'stand', expr: biting ? 'happy' : 'open', flip: true, alpha: vis, glow: 0.5, sq: biting && fract(bt) < 0.15 ? 0.5 : 0 });
          if (biting && fract(bt - 0.2) < 0.35) pop(q, '啊呜', x + 20, y - 130, 1 - fract(bt - 0.2) / 0.35, { size: 36, color: '#ff6f9c' });
          poof(q, 1250 + i * 95, 790, 70, clamp((bt - 6.1) / 0.4), i + 11);
        }
        if (bt > 0.5) iceCream(q, cx, cy, 1.8, back ? 3 : bites, { rot: turned ? 0.2 : 0.05 });
        if (back) for (let i = 0; i < 3; i++) star4(q, cx - 36 + i * 36, cy - 190 - (i % 2) * 14, 12, t * 3 + i, '#ffd24a', 0.9);
      },
    });
    vig(g, s, 0.3);
  }

  /* ---------- 镜头 13 · 到处都是（59.74 → 62.04）：四格漫画，一拍一格 ---------- */
  function panelBg(q, x, y, w, h, c1, c2) { q.fillStyle = vg(q, y, y + h, [[0, c1], [1, c2]]); q.fillRect(x, y, w, h); }
  function shotEverywhere(g, s) {
    const t = s.t, bt = s.beat - T0beat(s);
    // 底：粉色网点
    g.fillStyle = '#ffe4ee'; g.fillRect(0, 0, VW, VH);
    g.fillStyle = 'rgba(255,150,190,0.35)'; for (let y = 0; y < VH; y += 36) for (let x = (y / 36) % 2 * 18; x < VW; x += 36) { g.beginPath(); g.arc(x + Math.sin(t) * 4, y, 6, 0, TAU); g.fill(); }
    const P = [[90, 70, 850, 440], [980, 70, 850, 440], [90, 560, 850, 440], [980, 560, 850, 440]];
    for (let i = 0; i < 4; i++) {
      const a = bt - i + 0.05;
      if (a < 0) continue;
      const [x, y, w, h] = P[i], k = ease.back(clamp(a / 0.35)), rot = (i % 2 ? 1 : -1) * 0.02;
      g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(rot * (1 - clamp(a))); g.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); g.translate(-w / 2, -h / 2);
      g.fillStyle = 'rgba(120,60,90,0.25)'; g.fillRect(10, 12, w, h);
      g.save(); g.beginPath(); g.rect(0, 0, w, h); g.clip();
      const cx = w / 2, cy = h / 2;
      if (i === 0) {
        // 游客的遮阳帽上坐着一只
        panelBg(g, 0, 0, w, h, '#7cc4ee', '#dff2f8');
        // 游客（客串的锡兰，夏装）：近景，头顶的遮阳帽上坐着一只小羊（她一点也没察觉）
        const ck = CAMEOS[3];
        if (!(sdOn(s, ck) && E.sd.draw(g, ck, { x: cx - 70, y: 800, h: 650, t, anim: 'Relax', flip: false })))
          cast(g, 'crowd', { x: cx - 60, y: h + 80, h: 460, crop: 'bust', seed: 54, t, expr: 'smile', look: [0.6, 0] });
        const hd = [cx - 70, 200];
        g.fillStyle = '#f4d88a'; g.beginPath(); g.ellipse(hd[0], hd[1], 200, 38, -0.05, 0, TAU); g.fill(); g.beginPath(); g.ellipse(hd[0], hd[1] - 34, 104, 70, 0, PI, 0); g.fill();
        g.fillStyle = '#ff6a8a'; g.fillRect(hd[0] - 104, hd[1] - 44, 208, 16);
        g.strokeStyle = 'rgba(150,110,40,0.6)'; g.lineWidth = 3; g.beginPath(); g.ellipse(hd[0], hd[1], 200, 38, -0.05, 0, TAU); g.stroke();
        lamb(g, s, hd[0] + 20, hd[1] - 96 - hop(fract(s.beat))[0] * 18, 150, { id: 2666 * 16, pose: 'sit', expr: 'happy', glow: 0.5 });
      } else if (i === 1) {
        // 花盆里探出头
        panelBg(g, 0, 0, w, h, '#fbe6c8', '#f6d0b0');
        g.fillStyle = '#fbf6ee'; g.fillRect(0, h - 90, w, 90);
        for (let j = 0; j < 9; j++) { g.fillStyle = j % 3 ? '#4e9a5a' : '#3e8a4a'; g.beginPath(); g.ellipse(cx - 170 + j * 42, h - 250 - (j % 2) * 24, 34, 18, (j - 4) * 0.2, 0, TAU); g.fill(); }
        lamb(g, s, cx + 10, h - 240 + Math.sin(t * 6) * 6, 190, { id: 2672 * 16, pose: 'stand', expr: 'open', glow: 0.5 });
        for (let j = 0; j < 7; j++) { g.fillStyle = pick(['#ff4a7a', '#ffd24a', '#ff8ab8'], hash(5, j)); g.beginPath(); g.arc(cx - 150 + j * 50, h - 236 - (j % 3) * 8, 15, 0, TAU); g.fill(); }
        g.fillStyle = '#c8684a'; g.beginPath(); g.moveTo(cx - 170, h - 40); g.lineTo(cx - 140, h - 230); g.lineTo(cx + 140, h - 230); g.lineTo(cx + 170, h - 40); g.closePath(); g.fill(); g.strokeStyle = INK_D; g.lineWidth = 4; g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(cx - 120, h - 220, 30, 170);
      } else if (i === 2) {
        // 骑着海鸥
        panelBg(g, 0, 0, w, h, '#5aaae4', '#b8e0f4');
        for (let j = 0; j < 3; j++) g.drawImage(cloud(s, 900 + j, 300, 110, 'day'), ((j * 320 - t * 200) % 1100 + 1100) % 1100 - 200, 260 + j * 40, 300, 110);
        const gx = cx + Math.sin(t * 1.5) * 40, gy = cy + 40 + Math.cos(t * 1.2) * 20;
        for (let j = 0; j < 5; j++) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 5; g.beginPath(); g.moveTo(gx - 260 - j * 40, gy - 60 + j * 26); g.lineTo(gx - 160 - j * 40, gy - 60 + j * 26); g.stroke(); }
        gull(g, gx, gy, 5, t * 6, 1);
        lamb(g, s, gx - 10, gy - 34, 128, { id: 2683 * 16, pose: 'sit', expr: 'happy', glow: 0.4 });
      } else {
        // 火山模型的山顶上
        panelBg(g, 0, 0, w, h, '#f2e6d2', '#e8d8c0');
        g.drawImage(LC(s, 'hall-model', 520, 520, modelArt, 1), cx - 300, h - 540, 600, 600);
        for (let j = 0; j < 5; j++) { const ph = fract(t * 0.8 + j / 5); withAlpha(g, Math.sin(PI * ph) * 0.7, (qq) => qq.drawImage(puff(j, '255,230,240'), cx - 70 - ph * 40, h - 440 - ph * 120, 140 + ph * 80, 70 + ph * 40)); }
        lamb(g, s, cx, h - 366 - hop(fract(s.beat * 2))[0] * 26, 140, { id: 2689 * 16, pose: 'jump', expr: 'happy', glow: 0.5 });
      }
      g.restore();
      g.strokeStyle = '#3a3050'; g.lineWidth = 8; g.strokeRect(0, 0, w, h);
      g.restore();
    }
    vig(g, s, 0.2);
  }

  /* ---------- 镜头 14 · 训话（62.04 → 66.60）：她叉着腰对长椅训话；游客们看着她（对着空长椅说话？） ---------- */
  function bench(q, x, y, w) {
    q.fillStyle = '#6a8aa8'; q.fillRect(x, y - 54, w, 16); q.fillRect(x, y - 110, w, 14); q.fillRect(x, y - 88, w, 14);
    q.fillStyle = '#3a4a5a'; q.fillRect(x + 16, y - 38, 12, 38); q.fillRect(x + w - 28, y - 38, 12, 38); q.fillRect(x + 16, y - 110, 10, 72); q.fillRect(x + w - 26, y - 110, 10, 72);
    q.strokeStyle = INK_D; q.lineWidth = 2; q.strokeRect(x, y - 54, w, 16);
  }
  const BENCH = { x: 1200, y: 1040, w: 500 };
  function benchLambs(q, s, t, alpha = 1) {
    for (let i = 0; i < 4; i++) {
      const x = BENCH.x + 70 + i * 118;
      lamb(q, s, x, BENCH.y - 52 + Math.sin(t * 2 + i) * 2, 108, { id: 2708 * 16 + i, pose: 'sit', expr: i === 2 ? 'closed' : 'sad', flip: i % 2 === 1, alpha, glow: 0.4 });
      if (i === 1) { q.fillStyle = `rgba(255,158,192,${alpha})`; q.beginPath(); q.ellipse(x + 26, BENCH.y - 82, 14, 7, 0, 0, TAU); q.fill(); }
    }
  }
  function scoldScene(g, s, cam, o) {
    const t = s.t, bt = s.beat - T0beat(s);
    terraceB(g, s, cam, {
      pal: 'day', sun: [1500, 60], bk: 'scold', base: { x: 1180, y: 700, z: 1.45 }, fg: [['flowers', 'bl', { sc: 0.9 }]],
      terrace: (q) => {
        // 身后看热闹的游客
        townsfolk(q, s, { x: 615, y: 1000, h: 270, seed: 1, pose: o.whisper ? 'cover' : 'stand', t, flip: false, expr: 'surprise', look: [1, 0] }, 1);
        townsfolk(q, s, { x: 755, y: 1012, h: 250, seed: 22, pose: 'point', aim: -0.1, t: t + 1, flip: false, expr: 'surprise', look: [1, 0] }, 2);
        bench(q, BENCH.x, BENCH.y, BENCH.w);
        if (o.lambs) o.lambs(q);
        // 她：叉腰 → 竖起手指（一拍一换）
        const wag = fract(bt * 0.5) > 0.5;
        // （官方小人：一直抬着手“训话”——Interact；手绘版：叉腰 / 竖手指一拍一换）
        adele(q, { x: 1010, y: 1060, h: 440, pose: SDON() ? 'wave' : wag ? 'point' : 'hips', aim: -0.3, t, expr: 'talk', talk: 1, flip: false, look: [1, 0.3] });
        speech(q, '不许偷吃！', 1090, 590, clamp((bt - 0.3) / 0.25), { w: 330, h: 104, dx: 70, size: 48, color: '#e0506a' });
        if (bt > 3) for (let i = 0; i < 2; i++) pop(q, '？', 560 + i * 110, 600 - i * 20, clamp((bt - 3 - i * 0.3) / 0.25), { size: 60, color: '#3a8ad0', rot: (i - 0.5) * 0.3 });
      },
    });
  }
  function shotScold(g, s) {
    const lt = s.lt;
    const cam = { x: lerp(1160, 1200, lt / 4.5), y: 700, z: lerp(1.42, 1.5, lt / 4.5), ...hand(s, 27, 3, 0.35) };
    scoldScene(g, s, cam, { lambs: (q) => benchLambs(q, s, s.t) });
    vig(g, s, 0.3);
  }
  /* ---------- 镜头 15 · 两个世界（66.60 → 71.30）：分屏——左边是游客看到的，右边是她看到的；分界线一拍一挪 ---------- */
  function shotTwoWorlds(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: 1180, y: 700, z: 1.45, ...hand(s, 29, 2, 0.3) };
    // 分界线：一拍一跳（缓动），在长椅上来回扫——扫过的地方，小羊时隐时现
    const stops = [1440, 1330, 1560, 1290, 1500, 1370, 1610, 1400, 1450]; // 长椅（1200..1700）中间来回扫：一半看得见、一半看不见
    const i0 = Math.max(0, Math.min(stops.length - 1, Math.floor(bt))), f = ease.out(clamp(fract(bt) / 0.35));
    const div = lerp(stops[Math.max(0, i0 - 1)], stops[i0], f);
    scoldScene(g, s, cam, { whisper: true, lambs: (q) => { q.save(); q.beginPath(); q.rect(div, -400, 4000, 2000); q.clip(); benchLambs(q, s, t); q.restore(); } });
    // 左半边（游客看到的）稍微灰一点；右半边（她看到的）亮一点、飘着星星
    const sx = 960 + (div - cam.x) * cam.z;
    g.fillStyle = 'rgba(40,50,80,0.14)'; g.fillRect(0, 0, sx, VH);
    g.save(); g.beginPath(); g.rect(sx, 0, VW - sx, VH); g.clip(); additive(g, (q) => withAlpha(q, 0.12, (qq) => { qq.fillStyle = '#ffd0e8'; qq.fillRect(sx, 0, VW, VH); })); sparkles(g, t, 10, 51, '255,220,240', { x: sx, w: VW - sx, r: 14 }); g.restore();
    g.fillStyle = '#ffffff'; g.fillRect(sx - 5, 0, 10, VH);
    g.fillStyle = '#ff8ab8'; g.beginPath(); g.arc(sx, 540, 26, 0, TAU); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(sx - 16, 540); g.lineTo(sx - 6, 530); g.lineTo(sx - 6, 550); g.closePath(); g.moveTo(sx + 16, 540); g.lineTo(sx + 6, 530); g.lineTo(sx + 6, 550); g.closePath(); g.fill();
    E.text(g, '大家看到的', sx / 2, 120, { size: 52, weight: 900, color: '#3a5a8a', stroke: 'rgba(255,255,255,0.95)', strokeW: 12, spacing: 4 });
    E.text(g, '她看到的', sx + (VW - sx) / 2, 120, { size: 52, weight: 900, color: '#e0508a', stroke: 'rgba(255,255,255,0.95)', strokeW: 12, spacing: 4 });
    void lt;
    vig(g, s, 0.3);
  }
  /* ---------- 镜头 16 · 会飞的玩具（71.30 → 73.69）：沙滩球自己飘起来，游客们以为是魔术，鼓起掌来 ---------- */
  function beachBall(g, x, y, r, rot) {
    const cols = ['#ff5a6a', '#ffd24a', '#4ab0e8', '#ffffff', '#6ad07a', '#ffffff'];
    g.save(); g.translate(x, y); g.rotate(rot);
    for (let i = 0; i < 6; i++) { g.fillStyle = cols[i]; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, (i / 6) * TAU, ((i + 1) / 6) * TAU); g.closePath(); g.fill(); }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, r * 0.18, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(-r * 0.35, -r * 0.4, r * 0.3, r * 0.18, -0.6, 0, TAU); g.fill();
    g.strokeStyle = INK_D; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
    g.restore();
  }
  function shotToys(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: 960, y: lerp(620, 560, ease.inOut(clamp(lt / 2.4))), z: 1.12, ...hand(s, 31, 3, 0.4) };
    terraceB(g, s, cam, {
      pal: 'day', sun: [1500, 60], bk: 'toys', base: { x: 960, y: 600, z: 1.12 },
      terrace: (q) => {
        // 游客们围成半圈：先惊讶，再鼓掌
        const clap = bt > 2.2;
        // 围观的游客（客串干员）：先站着看，球飘起来以后一起拍手（Interact）
        for (const i of [0, 2, 4, 1, 3]) townsfolk(q, s, mixIn({ x: 230 + i * 170 + (i > 2 ? 650 : 0), y: 1000 + (i % 2) * 20, h: 290, seed: TOURISTS[(i * 6 + 7) % TOURISTS.length], pose: clap ? 'clap' : 'stand', aim: -0.6, t: t + i, flip: i > 2, expr: clap ? 'laugh' : 'surprise', look: [i > 2 ? -0.3 : 0.3, -0.8] }, 'stand', 2.2, 0.3, bt), i);
        // 沙滩球：底下两只小羊顶着，飘起来转圈
        const up = ease.out(clamp(lt / 1.6)), bx = 960 + Math.sin(t * 2.2) * 60, by = lerp(1000, 520, up) + Math.sin(t * 3) * 14;
        beachBall(q, bx, by - 70, 70, t * 2);
        lamb(q, s, bx - 40, by + 10, 60, { id: 2781 * 16, pose: 'jump', expr: 'happy', glow: 0.6, spin: Math.sin(t * 4) * 0.2 });
        lamb(q, s, bx + 44, by + 16, 56, { id: 2782 * 16, pose: 'jump', expr: 'happy', flip: true, glow: 0.6, spin: -Math.sin(t * 4) * 0.2 });
        // 风车自己转（一拍一圈）
        pinwheel(q, 1540, 760 + Math.sin(t * 2) * 10, 44, s.beat * PI, ['#ff8ab8', '#8ad0ff', '#ffe08a', '#c8a8ff']);
        lamb(q, s, 1540, 840, 50, { id: 2785 * 16, pose: 'float', expr: 'happy', glow: 0.5 });
        // 她：捂脸
        adele(q, { x: 820, y: 1060, h: 420, pose: 'cover', t, expr: 'shy', look: [0.2, -0.4], flip: false });
        if (clap) for (let i = 0; i < 3; i++) pop(q, '啪啪', 300 + i * 620, 620 - (i % 2) * 40, clamp((bt - 2.2 - i * 0.2) / 0.2), { size: 34, color: '#f0a040', rot: (i - 1) * 0.2 });
      },
    });
    vig(g, s, 0.3);
  }
  /** 风车（纸风车：四片三角） */
  function pinwheel(g, x, y, r, a, cols) {
    g.strokeStyle = '#8a6a50'; g.lineWidth = Math.max(2, r * 0.08); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + r * 2.6); g.stroke();
    for (let i = 0; i < 4; i++) {
      const b = a + (i * PI) / 2;
      g.fillStyle = cols[i % cols.length];
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); g.lineTo(x + Math.cos(b + 0.9) * r * 0.62, y + Math.sin(b + 0.9) * r * 0.62); g.closePath(); g.fill();
    }
    g.fillStyle = '#fff4d0'; g.beginPath(); g.arc(x, y, r * 0.12, 0, TAU); g.fill();
  }

  /* =========================================================
   * 灯塔崖（北风）：灯塔、看守小屋、风车田、风铃架；崖外是海
   * 世界坐标 1920×1080（左右各多画 500）；草地顶边 ≈ y 740；海平线 y = 560
   * ========================================================= */
  const CLIFF_HZ = 560;
  const cliffTop = (x) => 742 + Math.sin(x * 0.0024 + 0.6) * 22 + (x < 300 ? (300 - x) * -0.05 : 0);
  const LH = { x: 260, base: 752, top: 140 };
  function cliffSky(q) {
    // 天一直铺到海平线下面很深的地方：和海（视差不同）之间永远不会露缝
    q.fillStyle = vg(q, -500, CLIFF_HZ, [[0, '#2a7ccc'], [0.45, '#4ea4e2'], [0.8, '#9ad2f0'], [1, '#dcf0f6']]); q.fillRect(-500, -500, VW + 1000, CLIFF_HZ + 900);
  }
  function cliffSea(q) {
    // 海一直铺到崖下很深的地方（镜头仰起来时，海和崖之间不会露缝）
    q.fillStyle = vg(q, CLIFF_HZ, 900, [[0, '#9adce4'], [0.1, '#56c2d0'], [0.6, '#2aa4c2'], [1, '#1a88b0']]); q.fillRect(-500, CLIFF_HZ, VW + 1000, 1000);
    const R = E.rng(41); for (let i = 0; i < 260; i++) { const v = Math.pow(R(), 1.5), y = CLIFF_HZ + 2 + v * 260; q.fillStyle = `rgba(255,255,255,${0.06 + R() * 0.14})`; q.fillRect(R() * (VW + 1000) - 500, y, 10 + R() * 50, 1 + v * 2); }
    q.fillStyle = 'rgba(255,255,255,0.7)'; q.fillRect(-500, CLIFF_HZ - 1, VW + 1000, 2);
    // 远处海湾对面的小镇（淡）
    q.fillStyle = 'rgba(150,170,200,0.55)'; q.beginPath(); q.moveTo(1300, CLIFF_HZ + 4); q.quadraticCurveTo(1600, 520, 1900, 530); q.lineTo(2400, 540); q.lineTo(2400, CLIFF_HZ + 4); q.closePath(); q.fill();
    q.fillStyle = 'rgba(255,255,255,0.6)'; for (let i = 0; i < 40; i++) q.fillRect(1500 + hash(43, i) * 900, 536 + hash(44, i) * 20, 6 + hash(45, i) * 10, 5);
  }
  function cliffGround(q) {
    const ink = INK_D;
    // 草地
    q.beginPath(); q.moveTo(-500, 1200); for (let x = -500; x <= VW + 500; x += 20) q.lineTo(x, cliffTop(x)); q.lineTo(VW + 500, 1200); q.closePath();
    q.fillStyle = vg(q, 700, 1200, [[0, '#8cd06a'], [0.4, '#6ab85a'], [1, '#4a9a4a']]); q.fill();
    q.save(); q.clip();
    for (let i = 0; i < 40; i++) { const x = hash(51, i) * (VW + 1000) - 500, y = 780 + hash(52, i) * 400; q.fillStyle = `rgba(${hash(53, i) < 0.5 ? '255,255,200' : '40,110,60'},0.12)`; q.beginPath(); q.ellipse(x, y, 120 + hash(54, i) * 200, 20 + hash(55, i) * 30, 0, 0, TAU); q.fill(); }
    for (let i = 0; i < 260; i++) { const x = hash(56, i) * (VW + 1000) - 500, y = 790 + Math.pow(hash(57, i), 0.8) * 400; q.fillStyle = pick(['#ffffff', '#ffe46a', '#ff9ac0', '#ffffff', '#c8b0ff'], hash(58, i)); q.beginPath(); q.arc(x, y, 2.5 + (y - 780) * 0.012, 0, TAU); q.fill(); }
    q.restore();
    // 灯塔下的小路
    q.fillStyle = 'rgba(240,226,190,0.8)'; q.beginPath(); q.moveTo(330, 760); q.quadraticCurveTo(600, 860, 520, 1200); q.lineTo(760, 1200); q.quadraticCurveTo(760, 880, 380, 752); q.closePath(); q.fill();
    // 看守小屋
    q.fillStyle = '#fbf6ee'; q.fillRect(420, 640, 180, 120); q.fillStyle = 'rgba(80,90,160,0.14)'; q.fillRect(560, 640, 40, 120);
    q.fillStyle = '#e27b5c'; q.beginPath(); q.moveTo(404, 644); q.lineTo(510, 574); q.lineTo(616, 644); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
    q.fillStyle = '#3a8ad0'; archPath(q, 470, 722, 44, 76); q.fill(); q.fillStyle = '#44668c'; q.fillRect(526, 670, 40, 36); q.strokeStyle = '#fbf6ee'; q.lineWidth = 3; q.strokeRect(526, 670, 40, 36);
    q.strokeStyle = ink; q.lineWidth = 2.5; q.strokeRect(420, 640, 180, 120);
    // 灯塔
    const { x, base, top } = LH, w0 = 70, w1 = 50;
    q.beginPath(); q.moveTo(x - w0, base); q.lineTo(x - w1, top + 70); q.lineTo(x + w1, top + 70); q.lineTo(x + w0, base); q.closePath();
    q.fillStyle = '#fbfaf6'; q.fill();
    q.save(); q.clip();
    q.fillStyle = '#e0505a'; for (const [y0, y1] of [[560, 620], [380, 440], [220, 270]]) q.fillRect(x - w0, y0, w0 * 2, y1 - y0);
    q.fillStyle = 'rgba(80,90,160,0.16)'; q.fillRect(x + 20, top, w0, base - top);
    q.fillStyle = 'rgba(255,255,255,0.35)'; q.fillRect(x - 40, top, 14, base - top);
    q.restore();
    q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.moveTo(x - w0, base); q.lineTo(x - w1, top + 70); q.lineTo(x + w1, top + 70); q.lineTo(x + w0, base); q.stroke();
    q.fillStyle = '#3a8ad0'; archPath(q, x, base - 40, 40, 80); q.fill(); q.strokeStyle = ink; q.lineWidth = 2; q.stroke();
    for (const wy of [480, 320]) { q.fillStyle = '#44668c'; archPath(q, x, wy, 22, 40); q.fill(); }
    // 瞭望台 + 灯室 + 红顶
    q.fillStyle = '#3a4a5a'; q.fillRect(x - 78, top + 60, 156, 12);
    q.strokeStyle = '#3a4a5a'; q.lineWidth = 3; q.beginPath(); q.moveTo(x - 78, top + 30); q.lineTo(x + 78, top + 30); q.stroke(); for (let i = 0; i <= 12; i++) { q.beginPath(); q.moveTo(x - 78 + i * 13, top + 30); q.lineTo(x - 78 + i * 13, top + 60); q.stroke(); }
    q.fillStyle = 'rgba(200,236,255,0.85)'; q.fillRect(x - 42, top - 30, 84, 90); q.strokeStyle = ink; q.lineWidth = 3; q.strokeRect(x - 42, top - 30, 84, 90);
    q.beginPath(); q.moveTo(x - 14, top - 30); q.lineTo(x - 14, top + 60); q.moveTo(x + 14, top - 30); q.lineTo(x + 14, top + 60); q.stroke();
    q.fillStyle = '#ffe8a8'; q.beginPath(); q.arc(x, top + 14, 16, 0, TAU); q.fill();
    q.fillStyle = '#e0505a'; q.beginPath(); q.moveTo(x - 56, top - 30); q.quadraticCurveTo(x, top - 110, x + 56, top - 30); q.closePath(); q.fill(); q.stroke();
    q.strokeStyle = ink; q.lineWidth = 4; q.beginPath(); q.moveTo(x, top - 86); q.lineTo(x, top - 130); q.stroke();
    // 崖边的石头（右）
    q.fillStyle = '#b8a890'; for (let i = 0; i < 6; i++) { const rx = 1760 + i * 110, ry = cliffTop(rx) + 20; blob(q, rockPts(rx, ry, 60, 26, 60 + i, 8, 0.2)); q.fill(); }
  }
  /** 风车田的一排（row 0 最远）：每个风车的根在 (x, y)，大小 r */
  const PINS = (() => { const out = []; for (let r = 0; r < 5; r++) { const y = 810 + r * 78, sc = 0.6 + r * 0.22; for (let x = 620 + (r % 2) * 70; x < 1900; x += 150 * sc + 40) out.push({ x: x + hash(61, r, x | 0) * 40, y, r: 50 * sc, seed: (x | 0) + r * 77, col: r }); } return out; })();
  const PIN_COLS = [['#ff8ab8', '#ffd24a', '#8ad0ff', '#ffffff'], ['#b890f0', '#ffffff', '#ff8ab8', '#8ae0c0'], ['#ffd24a', '#ff6a8a', '#4ac0e0', '#ffffff']];
  function pinField(q, t, spin, x0 = -9999, x1 = 9999, y0 = -9999, y1 = 9999) {
    for (const p of PINS) {
      if (p.x < x0 - 100 || p.x > x1 + 100 || p.y < y0 || p.y >= y1) continue;
      const a = spin * (0.8 + hash(62, p.seed) * 0.5) + hash(63, p.seed) * TAU;
      const lean = Math.sin(t * 2 + p.seed) * 0.02 + (spin > 0 ? 0 : 0);
      q.save(); q.translate(p.x, p.y); q.rotate(lean); pinwheel(q, 0, -p.r * 2.6, p.r, a, PIN_COLS[p.seed % 3]); q.restore();
    }
  }
  /** 草尖（顶边一排随风摆的草叶）：wind 0..2 */
  function grassTips(q, t, wind, x0, x1, yOff = 0, n = 90) {
    q.strokeStyle = '#4e9a4a'; q.lineWidth = 3; q.lineCap = 'round';
    q.beginPath();
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + hash(64, i)) * (x1 - x0) / n, y = cliffTop(x) + 6 + yOff, hgt = 14 + hash(65, i) * 18;
      const sw = (wobble(66 + i, t * 1.4) * 0.3 + wind * 0.8) * hgt;
      q.moveTo(x, y); q.quadraticCurveTo(x + sw * 0.4, y - hgt * 0.6, x + sw, y - hgt * (1 - Math.min(0.5, wind * 0.2)));
    }
    q.stroke(); q.lineCap = 'butt';
  }
  /** 风筝（菱形 + 飘带）：(x, y) 为风筝中心，线拉到 (sx, sy) */
  function kite(q, t, x, y, sc, sx, sy, cols, seed, o = {}) {
    q.strokeStyle = 'rgba(255,255,255,0.85)'; q.lineWidth = 1.5; q.beginPath(); q.moveTo(x, y + 30 * sc); q.quadraticCurveTo((x + sx) / 2 + 40, (y + sy) / 2 + 60, sx, sy); q.stroke();
    // 飘带
    q.strokeStyle = cols[2] || '#ff6a8a'; q.lineWidth = 3 * sc; q.beginPath(); q.moveTo(x, y + 40 * sc);
    for (let i = 1; i <= 8; i++) q.lineTo(x - i * 16 * sc + Math.sin(t * 6 + i + seed) * 6 * sc, y + 40 * sc + i * 12 * sc);
    q.stroke();
    for (let i = 1; i <= 3; i++) { const bx = x - i * 40 * sc + Math.sin(t * 6 + i * 2.5 + seed) * 6 * sc, by = y + 40 * sc + i * 30 * sc; q.fillStyle = cols[i % 2]; q.beginPath(); q.moveTo(bx - 8 * sc, by - 6 * sc); q.lineTo(bx + 8 * sc, by + 6 * sc); q.lineTo(bx + 8 * sc, by - 6 * sc); q.lineTo(bx - 8 * sc, by + 6 * sc); q.closePath(); q.fill(); }
    q.save(); q.translate(x, y); q.rotate(Math.sin(t * 2 + seed) * 0.12 + (o.rot || 0)); q.scale(sc, sc);
    if (o.sheep) {
      // 羊形风筝：白色的云朵身体 + 粉脸
      q.fillStyle = '#fffaf6'; q.beginPath(); for (const [cx, cy, r] of [[-30, 0, 28], [0, -14, 32], [30, 0, 28], [0, 16, 28], [-20, 18, 22], [22, 18, 22]]) { q.moveTo(cx + r, cy); q.arc(cx, cy, r, 0, TAU); } q.fill();
      q.strokeStyle = '#e08ab0'; q.lineWidth = 3; q.stroke();
      q.fillStyle = '#ffb0cc'; q.beginPath(); q.ellipse(48, -6, 18, 20, 0.2, 0, TAU); q.fill(); q.stroke();
      q.fillStyle = '#3a2430'; q.beginPath(); q.arc(52, -10, 3, 0, TAU); q.fill();
      q.strokeStyle = '#8a6a50'; q.lineWidth = 4; for (const lx of [-24, -6, 12, 28]) { q.beginPath(); q.moveTo(lx, 36); q.lineTo(lx, 52); q.stroke(); }
    } else {
      q.fillStyle = cols[0]; q.beginPath(); q.moveTo(0, -46); q.lineTo(34, 0); q.lineTo(0, 46); q.lineTo(-34, 0); q.closePath(); q.fill();
      q.fillStyle = cols[1]; q.beginPath(); q.moveTo(0, -46); q.lineTo(34, 0); q.lineTo(0, 0); q.closePath(); q.fill(); q.beginPath(); q.moveTo(0, 46); q.lineTo(-34, 0); q.lineTo(0, 0); q.closePath(); q.fill();
      q.strokeStyle = INK_D; q.lineWidth = 2; q.beginPath(); q.moveTo(0, -46); q.lineTo(34, 0); q.lineTo(0, 46); q.lineTo(-34, 0); q.closePath(); q.stroke();
    }
    q.restore();
  }
  /** 风铃架（木拱 + 一串串玻璃风铃）：wind 0..2 */
  function chimes(q, t, x, y, wind) {
    q.fillStyle = '#9a6a44'; q.fillRect(x - 130, y - 230, 14, 230); q.fillRect(x + 116, y - 230, 14, 230);
    q.beginPath(); q.moveTo(x - 150, y - 222); q.quadraticCurveTo(x, y - 290, x + 150, y - 222); q.lineTo(x + 150, y - 206); q.quadraticCurveTo(x, y - 272, x - 150, y - 206); q.closePath(); q.fill();
    for (let i = 0; i < 6; i++) {
      const cx = x - 100 + i * 40, cy = y - 236 + Math.abs(i - 2.5) * 8, sw = Math.sin(t * (3 + i * 0.4) + i) * (0.1 + wind * 0.35) + wind * 0.3;
      q.save(); q.translate(cx, cy); q.rotate(sw);
      q.strokeStyle = 'rgba(80,60,50,0.8)'; q.lineWidth = 1.5; q.beginPath(); q.moveTo(0, 0); q.lineTo(0, 50); q.stroke();
      q.fillStyle = ['rgba(150,220,240,0.8)', 'rgba(255,170,200,0.8)', 'rgba(255,230,140,0.8)'][i % 3]; q.beginPath(); q.moveTo(-12, 50); q.quadraticCurveTo(0, 30, 12, 50); q.lineTo(12, 64); q.lineTo(-12, 64); q.closePath(); q.fill();
      q.strokeStyle = 'rgba(80,60,50,0.8)'; q.beginPath(); q.moveTo(0, 64); q.lineTo(0, 86); q.stroke();
      q.fillStyle = '#fffaf2'; q.fillRect(-6, 86, 12, 20);
      q.restore();
    }
  }
  /** 羊形风向标（灯塔顶上）：ang = 朝向（0 = 北 = 画面里朝右） */
  function sheepVane(q, x, y, sc, ang, t) {
    q.save(); q.translate(x, y); q.scale(sc, sc);
    q.strokeStyle = '#3a4a5a'; q.lineWidth = 4; q.beginPath(); q.moveTo(0, 0); q.lineTo(0, -80); q.stroke();
    // 方向字（N E S W 的十字）
    q.lineWidth = 3; q.beginPath(); q.moveTo(-50, -24); q.lineTo(50, -24); q.moveTo(-26, -10); q.lineTo(26, -38); q.stroke();
    E.text(q, 'N', 62, -18, { font: 'display', size: 20, weight: 700, color: '#3a4a5a' }); E.text(q, 'S', -62, -18, { font: 'display', size: 20, weight: 700, color: '#3a4a5a' });
    // 羊（侧影）：cos(ang) 决定它看向左还是右（假 3D）
    const c = Math.cos(ang), sx = Math.abs(c) < 0.08 ? 0.08 : c;
    q.save(); q.translate(0, -84); q.scale(sx, 1);
    q.fillStyle = '#2a3440'; q.beginPath(); for (const [cx, cy, r] of [[-20, 0, 18], [0, -8, 20], [20, 0, 16], [0, 8, 16]]) { q.moveTo(cx + r, cy); q.arc(cx, cy, r, 0, TAU); } q.fill();
    q.beginPath(); q.ellipse(40, -6, 12, 14, 0.2, 0, TAU); q.fill();
    q.lineWidth = 4; q.strokeStyle = '#2a3440'; for (const lx of [-16, 16]) { q.beginPath(); q.moveTo(lx, 14); q.lineTo(lx, 30); q.stroke(); }
    q.fillStyle = '#ffd24a'; q.beginPath(); q.arc(44, -10, 3, 0, TAU); q.fill();
    q.restore();
    q.restore();
    void t;
  }
  /** 灯塔崖一整套（相机 cam；o: { wind(风力 0..2), spin(风车转角), front(q), mid(q), sky(q) } ） */
  function cliffW(g, s, cam, o = {}) {
    const t = s.t, wind = o.wind ?? 0.3;
    inCam(g, cam, 0.03, (q) => q.drawImage(LC(s, 'cliff-sky2', VW + 1000, CLIFF_HZ + 900, (qq) => { qq.translate(500, 500); cliffSky(qq); }, 0.3), -500, -500, VW + 1000, CLIFF_HZ + 900));
    inCam(g, cam, 0.06, (q) => {
      sun(q, 1560, -80, 44, 1);
      for (let i = 0; i < 7; i++) { const w = 380 + hash(901, i) * 360, sp = 10 + hash(903, i) * 8 + wind * 40, x = ((hash(902, i) * 3600 + t * sp) % 3600) - 900; q.drawImage(cloud(s, 910 + i, Math.round(w), Math.round(w * 0.36), 'day'), x, -300 + hash(904, i) * 700 - w * 0.36, w, w * 0.36); }
      if (o.sky) o.sky(q);
    });
    baked(g, s, 'cliff-sea2', { x: 960, y: 540, z: 1 }, cam, 0.25, cliffSea, 0.6, [-520, 380, VW + 520, 1560]);
    inCam(g, cam, 0.25, (q) => glints(q, t, { x0: -500, x1: VW + 500, y0: CLIFF_HZ + 2, y1: 900, sunX: 1560, n: 90, seed: 47, pw1: 500, a: 0.9 }));
    if (o.far) inCam(g, cam, 0.5, o.far);
    baked(g, s, 'cliff-ground:' + (o.bk || 'n'), o.base || { x: 960, y: 540, z: 1 }, cam, 1, cliffGround, 1, [-520, -40, VW + 520, 1240]);
    inCam(g, cam, 1, (q) => {
      const vr = visRange(cam, 1);
      grassTips(q, t, wind, Math.max(-500, vr[0]), Math.min(VW + 500, vr[1]));
      sheepVane(q, LH.x, LH.top - 130, 1, o.vane ?? 0.3 + Math.sin(t * 0.5) * 0.3, t);
      chimes(q, t, 1560, 900, wind);
      // 风车田：人身后的几排先画，人前面的几排后画（按脚底的 y 分开）
      const spin = o.spin ?? t * (1 + wind * 6), split = o.split ?? 960;
      pinField(q, t, spin, vr[0], vr[1], -9999, split);
      if (o.mid) o.mid(q);
      pinField(q, t, spin, vr[0], vr[1], split, 9999);
    });
    if (o.front) inCam(g, cam, 1.3, o.front);
    if (o.fg) for (const f of o.fg) fgFrame(g, s, cam, f[0], f[1], Object.assign({ wind }, f[2] || {}));
  }

  /* =========================================================
   * 多利（白天）：一大团粉白的羊形云（几十团雾 + 角色库的多利脸）
   * ========================================================= */
  function dollyCloudD(g, s, cx, cy, sc, form, o = {}) {
    const t = s.t;
    const P = [[-150, -20, 120], [-60, -70, 130], [50, -80, 130], [150, -40, 115], [110, 40, 120], [0, 50, 130], [-110, 40, 115], [-200, 10, 80], [230, -120, 90], [260, -160, 70]];
    for (let i = 0; i < 36; i++) {
      const p = P[i % P.length], sp = 1 - form;
      const ox = (hash(111, i, 1) - 0.5) * 500 * sp + Math.sin(t * 0.5 + i) * 10, oy = (hash(111, i, 2) - 0.5) * 300 * sp + Math.cos(t * 0.4 + i) * 8;
      const x = cx + (p[0] + (hash(111, i, 3) - 0.5) * 60 + ox) * sc, y = cy + (p[1] + (hash(111, i, 4) - 0.5) * 50 + oy) * sc, r = p[2] * sc * (0.8 + 0.4 * hash(111, i, 5));
      withAlpha(g, (o.a ?? 0.75) * (0.4 + 0.6 * form), (q) => q.drawImage(puff(i, i % 3 ? (o.rgb || '255,206,228') : (o.rgb2 || '255,246,250')), x - r * 1.6, y - r * 0.9, r * 3.2, r * 1.8));
    }
  }
  function dollyD(g, s, x, y, h, form, o = {}) {
    // 多利：雾团身体 + 角色库画的羊脸与荆棘冠（云形）
    const t = s.t;
    E.glow(g, x, y - h * 0.5, h * 1.4, '255,190,220', 0.18 * form);
    dollyCloudD(g, s, x - h * 0.08, y - h * 0.45, h / 280, form, o);
    // 多利本体：官方剧情立绘（avg_npc_1014_1：一大团粉云、黑脸、荆棘冠），雾团从它身后聚过来；没有立绘时用角色库的脸
    if (form > 0.25) {
      const ka = sst(0.3, 1, form) * (o.alpha ?? 1);
      // [v3] 首选多利立绘的分层绑定（云团起伏、飘散的小云朵、王冠与耳朵、眨眼、转头看她）
      const lk = o.look || [-0.4, 0.6];
      const rigD = rigOn(s, 'dolly') && E.keyart.draw(g, 'dolly', { t, crop: 'full', ax: 0.5, ay: 1, x: x - h * 0.02, y: y + h * 0.16, h: h * 1.18, alpha: ka, eyes: o.expr === 'closed' ? 'closed' : 'open', look: [lk[0] * 0.7, lk[1] * 0.5], wind: 0.3, tint: o.light ? [o.light.color, o.light.amount ?? 0.3] : undefined });
      if (!rigD && !(cardOn(s, 'dolly') && E.sd.card(g, 'dolly', { x: x - h * 0.02, y: y + h * 0.16, h: h * 1.18, t, breath: 1.6, bob: h * 0.012, alpha: ka, light: o.light })))
        cast(g, 'dolly', { x, y, h, t, glow: 0.6, form: 'cloud', fade: 1 - sst(0.3, 1, form), expr: o.expr || 'smile', look: o.look || [-0.4, 0.6], alpha: o.alpha ?? 1 });
    }
  }

  /* ---------- 镜头 17 · 聚拢（73.69 → 78.33）：小羊们领她上了灯塔崖，叠成一堆，“噗”地变成一朵粉云升上天 ---------- */
  function shotGather(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const up = ease.inOut(clamp((lt - 2.3) / 2.2));
    const cam = { x: lerp(820, 1000, clamp(lt / 2.4)), y: lerp(640, 380, up), z: lerp(1.05, 0.92, up), ...hand(s, 33, 3, 0.35) };
    const pile = [1150, 840];
    cliffW(g, s, cam, {
      wind: 0.25, fg: [['flowers', 'bl', {}]],
      sky: (q) => { if (lt > 2.4) dollyCloudD(q, s, 1150, lerp(600, 250, up), 1.1, clamp((lt - 2.4) / 2) * 0.6, { a: 0.6 }); },
      mid: (q) => {
        // 小羊：一拍一跳地穿过风车田，到中间叠成一堆
        for (let i = 0; i < 9; i++) {
          const arrive = 0.8 + i * 0.13, a = clamp(lt / arrive);
          const x0 = 300 + i * 40, px = pile[0] + ((i % 3) - 1) * 50, py = pile[1] - Math.floor(i / 3) * 44;
          const x = lerp(x0, px, ease.inOut(a)), yb = lerp(cliffTop(x0) + 60, py, ease.inOut(a)) - (a < 1 ? hop(fract(bt * 2 + i * 0.2))[0] * 50 : 0);
          const merge = clamp((lt - 2.3 - i * 0.05) / 0.5);
          if (merge >= 1) continue;
          lamb(q, s, x, yb - merge * 80, 70 * (1 - merge * 0.5), { id: 3014 * 16 + i, pose: a < 1 ? 'jump' : 'stand', expr: 'happy', glow: 0.5 + merge, flip: false, alpha: 1 - merge });
        }
        poof(q, pile[0], pile[1] - 60, 160, clamp((lt - 2.3) / 0.8), 7);
        // 她：匀速跑上来，停下，抬头
        const rv = 320, ax = -40 + Math.min(lt, 2.5) * rv;
        adele(q, mixIn({ x: ax, y: cliffTop(ax) + 110, h: 400, pose: lt < 2.5 ? 'run' : 'look-up', speed: stepRate('adele-alter', 400, rv, true), t, expr: lt < 2.5 ? 'determined' : 'surprise', look: [0.6, -1], wind: 0.4 }, 'run', 2.5, 0.25, lt));
      },
    });
    vig(g, s, 0.3);
  }

  /* ---------- 镜头 18 · 多利（78.33 → 82.89）：天上的大粉羊开口了——北风、种子、羊毛，一拍亮一个 ---------- */
  const TRADE = [['北风', 'wind'], ['种子', 'seed'], ['羊毛', 'wool']];
  function tradeIcon(q, kind, x, y, r, t) {
    q.save(); q.translate(x, y);
    if (kind === 'wind') {
      q.strokeStyle = '#4a9ad8'; q.lineWidth = r * 0.12; q.lineCap = 'round';
      for (let i = 0; i < 3; i++) { q.beginPath(); const yy = -r * 0.35 + i * r * 0.35, len = r * (0.9 - i * 0.15); q.moveTo(-len * 0.6, yy); q.lineTo(len * 0.35, yy); q.arc(len * 0.35, yy - r * 0.16, r * 0.16, PI / 2, -PI * 0.9, true); q.stroke(); }
      q.lineCap = 'butt';
    } else if (kind === 'seed') {
      q.fillStyle = '#b07a3a'; q.beginPath(); q.ellipse(0, r * 0.1, r * 0.3, r * 0.44, 0.3, 0, TAU); q.fill();
      q.fillStyle = 'rgba(255,255,255,0.35)'; q.beginPath(); q.ellipse(-r * 0.08, -r * 0.05, r * 0.08, r * 0.2, 0.3, 0, TAU); q.fill();
      q.strokeStyle = '#4ea84e'; q.lineWidth = r * 0.08; q.beginPath(); q.moveTo(r * 0.1, -r * 0.3); q.quadraticCurveTo(r * 0.2, -r * 0.6, r * 0.05, -r * 0.7); q.stroke();
      q.fillStyle = '#6ac86a'; q.beginPath(); q.ellipse(r * 0.26, -r * 0.62, r * 0.2, r * 0.1, -0.5, 0, TAU); q.fill();
    } else {
      q.fillStyle = '#fffaf4'; q.beginPath(); for (const [cx, cy, rr] of [[-0.3, 0.1, 0.3], [0, -0.15, 0.34], [0.3, 0.08, 0.3], [0, 0.25, 0.28]]) { q.moveTo(cx * r + rr * r, cy * r); q.arc(cx * r, cy * r, rr * r, 0, TAU); } q.fill();
      q.strokeStyle = '#d8b0c0'; q.lineWidth = r * 0.05; q.stroke();
      q.strokeStyle = 'rgba(200,160,180,0.6)'; q.lineWidth = r * 0.04; q.beginPath(); q.arc(-r * 0.05, 0, r * 0.18, 0.5, 4); q.stroke();
    }
    q.restore();
    void t;
  }
  /** 发光的圆形徽记（图标 + 名字）：k 0..1 出现 */
  function tradeBadge(q, kind, label, x, y, r, k, t) {
    if (k <= 0.01) return;
    const sc = ease.back(clamp(k * 1.3));
    E.glow(q, x, y, r * 2.2, '255,240,200', 0.35 * k);
    q.save(); q.translate(x, y); q.scale(sc, sc);
    q.fillStyle = 'rgba(255,255,255,0.92)'; q.beginPath(); q.arc(0, 0, r, 0, TAU); q.fill();
    q.strokeStyle = '#ffc454'; q.lineWidth = r * 0.08; q.stroke();
    q.strokeStyle = 'rgba(255,196,84,0.5)'; q.lineWidth = r * 0.03; q.beginPath(); q.arc(0, 0, r * 1.14, 0, TAU); q.stroke();
    tradeIcon(q, kind, 0, 0, r * 0.8, t);
    E.text(q, label, 0, r + 50, { size: r * 0.46, weight: 900, color: '#e0508a', stroke: 'rgba(255,255,255,0.95)', strokeW: 10, spacing: 6 });
    q.restore();
    for (let i = 0; i < 4; i++) { const a = t * 1.2 + i * PI / 2 + x; star4(q, x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35, r * 0.12 * k, a, '#ffd24a', k); }
  }
  function shotDolly(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: 1000, y: lerp(360, 400, lt / 4.6), z: 0.9 + lt * 0.01, ...hand(s, 35, 3, 0.3) };
    cliffW(g, s, cam, {
      wind: 0.5, base: { x: 1000, y: 380, z: 0.92 }, bk: 'sky', fg: [['flowers', 'br', { sc: 0.9 }]],
      sky: (q) => {
        // 整颗头（连同荆棘冠）都在画里；脸在三个徽记的右边，不被挡住
        dollyD(q, s, 1310, 600, 620, clamp(0.6 + lt * 0.3), { expr: lt > 1 ? 'smile' : 'closed', look: [-0.5, 0.6] });
      },
      mid: (q) => {
        adele(q, { x: 760, y: cliffTop(760) + 110, h: 400, pose: 'look-up', t, expr: bt > 4 ? 'determined' : 'surprise', look: [0.6, -1], wind: 0.7, windDir: -1 });
      },
    });
    // 三个“要交换的东西”：一拍一个（第 1、3、5 拍）
    for (let i = 0; i < 3; i++) {
      const k = clamp((bt - (0.95 + i * 2)) / 0.5);
      tradeBadge(g, TRADE[i][1], TRADE[i][0], 500 + i * 390, 330 + Math.sin(t * 1.6 + i) * 10, 110, k, t);
    }
    vig(g, s, 0.3);
  }

  /* ---------- 交换卡（三个空圆圈；集齐三个蹄印章） ---------- */
  function tradeCardArt(q) {
    // 设计 720×440（中心 360,220）
    q.fillStyle = 'rgba(80,40,60,0.2)'; rrect(q, 18, 22, 690, 404, 26); q.fill();
    q.fillStyle = '#fffaf2'; rrect(q, 10, 10, 690, 404, 26); q.fill();
    q.fillStyle = '#ffe4ee'; rrect(q, 10, 10, 690, 84, 26); q.fill(); q.fillRect(10, 60, 690, 34);
    q.strokeStyle = '#e8709a'; q.lineWidth = 5; rrect(q, 10, 10, 690, 404, 26); q.stroke();
    q.setLineDash([10, 8]); q.strokeStyle = 'rgba(232,112,154,0.5)'; q.lineWidth = 3; rrect(q, 26, 26, 658, 372, 18); q.stroke(); q.setLineDash([]);
    E.text(q, '多利的交易', 355, 70, { size: 40, weight: 900, color: '#c0406a', spacing: 8 });
    for (let i = 0; i < 3; i++) {
      const cx = 140 + i * 215, cy = 230;
      q.strokeStyle = 'rgba(192,64,106,0.55)'; q.lineWidth = 4; q.setLineDash([12, 8]); q.beginPath(); q.arc(cx, cy, 78, 0, TAU); q.stroke(); q.setLineDash([]);
      q.globalAlpha = 0.35; tradeIcon(q, TRADE[i][1], cx, cy, 56, 0); q.globalAlpha = 1;
      E.text(q, TRADE[i][0], cx, cy + 128, { size: 34, weight: 900, color: '#6a4a5a', spacing: 6 });
    }
  }
  /** 蹄印章（粉色的一对小椭圆） */
  function hoofStamp(q, x, y, r, rot, a = 1) {
    if (a <= 0.01) return;
    withAlpha(q, a, (g) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = 'rgba(236,80,140,0.88)';
      g.beginPath(); g.ellipse(-r * 0.36, 0, r * 0.3, r * 0.5, -0.2, 0, TAU); g.ellipse(r * 0.36, -r * 0.04, r * 0.3, r * 0.5, 0.2, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(236,80,140,0.5)'; g.lineWidth = r * 0.06; g.beginPath(); g.arc(0, 0, r * 1.05, 0, TAU); g.stroke();
      g.restore();
    });
  }
  /** 画一张交换卡：stamps = 已盖的章数（可以是小数：正在盖），thump = 刚盖下去的弹一下 */
  function tradeCard(q, s, x, y, sc, rot, stamps, t) {
    q.save(); q.translate(x, y); q.rotate(rot); q.scale(sc, sc);
    q.drawImage(LC(s, 'trade-card', 720, 440, tradeCardArt, 1.2), -360, -220, 720, 440);
    for (let i = 0; i < 3; i++) {
      const k = clamp(stamps - i);
      if (k <= 0) continue;
      const pk = k < 1 ? ease.out(k) : 1, sz = 1 + (1 - pk) * 0.8;
      hoofStamp(q, -220 + i * 215, 10, 62 * sz, -0.2 + i * 0.15, pk);
      if (k < 1) sparkle(q, -220 + i * 215, 10, 140 * k, (1 - k) * 1.2, t, '255,210,230');
    }
    q.restore();
  }

  /* ---------- 镜头 19 · 成交（82.89 → 87.48）：三个图标飞进一张卡片，落到她手里；她用力点头 ---------- */
  function shotDeal(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: 920, y: lerp(560, 640, lt / 4.6), z: lerp(1.5, 1.62, lt / 4.6), ...hand(s, 37, 3, 0.35) };
    const fly = clamp(lt / 1.3), land = clamp((lt - 1.3) / 1.0);
    // （官方小人：整个镜头都举着手——先去够、再举着卡片——Interact；卡片贴在举起的那只手上）
    const SDk = SDON();
    const ao = { x: 900, y: cliffTop(900) + 130, h: 440, pose: SDk ? 'wave' : land >= 1 ? (bt > 5 ? 'cheer' : 'hold') : 'reach-up', t, expr: land >= 1 ? (bt > 5 ? 'laugh' : 'determined') : 'surprise', look: [0, -1], wind: 0.5, windDir: -1 };
    cliffW(g, s, cam, {
      wind: 0.35, base: { x: 920, y: 600, z: 1.55 }, bk: 'deal',
      sky: (q) => { withAlpha(q, 0.8, (qq) => dollyCloudD(qq, s, 1200, 120, 1.0, 0.9, { a: 0.55 })); },
      mid: (q) => {
        adele(q, ao);
        const hp = anchor('adele-alter', SDk ? ao : Object.assign({}, ao, { pose: 'hold' }), 'handN', [900, 800]);
        // 卡片：从空中飘下来（左右摆），落到手上
        // 落点：手绘版在胸前（卡片上沿低于下巴，不挡脸）；官方小人在举起的手上（手的外侧，不挡脸）
        const cx = lerp(1040, hp[0] + (SDk ? 70 : 10), land), cy = lerp(260, hp[1] + (SDk ? -30 : 62), ease.out(land)) + (land < 1 ? Math.sin(lt * 5) * 20 * (1 - land) : 0);
        const rot = land < 1 ? Math.sin(lt * 4) * 0.3 * (1 - land) : -0.05;
        if (lt > 1.0) tradeCard(q, s, cx, cy, lerp(0.24, 0.34, land), rot, 0, t);
        // 三个图标从天上飞向卡片
        for (let i = 0; i < 3; i++) {
          const k = clamp((fly - i * 0.12) / 0.8);
          if (k >= 1) continue;
          const x = lerp(500 + i * 390, cx, ease.in(k)), y = lerp(-40, cy, ease.in(k)) + Math.sin(k * PI) * -80;
          tradeBadge(q, TRADE[i][1], TRADE[i][0], x, y, 110 * (1 - k * 0.8), 1 - k, t);
        }
        if (bt > 5) pop(q, '好！', ao.x + 140, 520, clamp((bt - 5) / 0.2), { size: 64, color: '#e0508a' });
      },
    });
    vig(g, s, 0.3);
  }

  /* ---------- 镜头 20 · 屏住呼吸（87.48 → 89.73）：卡片的特写；风停了；一只小羊从卡片边上探头眨眼 ---------- */
  function shotHush(g, s) {
    const t = s.t, lt = s.lt;
    const suck = clamp((lt - 1.5) / 0.75);
    g.fillStyle = vg(g, 0, VH, [[0, '#5aaee6'], [1, '#bfe6f4']]); g.fillRect(0, 0, VW, VH);
    inCam(g, { x: 960, y: 540, z: 1 + suck * 0.1 }, 0.3, (q) => { for (let i = 0; i < 4; i++) q.drawImage(cloud(s, 920 + i, 520, 190, 'day'), -100 + i * 520, 150 + (i % 2) * 300, 520, 190); });
    const cam = { x: 960, y: 560, z: 1 + lt * 0.04 + suck * 0.1 };
    inCam(g, cam, 1, (q) => {
      // 捏着卡片的两只手（第一人称）：手掌与四指在卡片后面（先画），拇指压在卡片前面（后画）
      q.save(); q.translate(960, 540); q.rotate(-0.04);
      gripHand(q, 576, 352, 1.8, 1, false); gripHand(q, -576, 352, 1.8, -1, false);
      q.restore();
      tradeCard(q, s, 960, 540, 1.6, -0.04, 0, t);
      q.save(); q.translate(960, 540); q.rotate(-0.04);
      gripHand(q, 576, 352, 1.8, 1, true); gripHand(q, -576, 352, 1.8, -1, true);
      q.restore();
      const peek = win(lt, 0.4, 0.8, 1.7, 1.9);
      if (peek > 0) {
        // 从卡片上沿后面探出头（卡片顶边 y ≈ 188）
        q.save(); q.beginPath(); q.rect(0, -200, VW, 200 + 190); q.clip();
        lamb(q, s, 1250, 330 + (1 - peek) * 260, 280, { id: 3174 * 16, pose: 'stand', expr: win(lt, 1.0, 1.05, 1.2, 1.25) > 0.5 ? 'closed' : 'happy', flip: true, glow: 0.3 });
        q.restore();
      }
    });
    // 最后半拍：风从四面八方吸进来（下一拍——北风！）
    if (suck > 0) additive(g, (q) => { for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU + hash(99, i), r0 = 1100 - suck * 700 * (0.6 + hash(98, i) * 0.6), len = 160 * suck; q.strokeStyle = `rgba(255,255,255,${0.5 * suck})`; q.lineWidth = 3; q.beginPath(); q.moveTo(960 + Math.cos(a) * r0, 540 + Math.sin(a) * r0); q.lineTo(960 + Math.cos(a) * (r0 + len), 540 + Math.sin(a) * (r0 + len)); q.stroke(); } });
    vig(g, s, 0.4);
  }

  /* =========================================================
   * 北风（89.73 → 108.02）
   * ========================================================= */
  /** 阵风：t0 起风力从 base 猛增到 peak，再慢慢回落 */
  const gustAt = (t, t0, base = 0.3, peak = 1.8, dec = 2.2) => (t < t0 ? base : base + (peak - base) * Math.exp(-(t - t0) / dec) * clamp((t - t0) / 0.15));
  /* ---------- 镜头 21 · 一阵风（89.73 → 94.30）：风车田里所有的风车一齐转起来 ---------- */
  function shotGust(g, s) {
    const t = s.t, lt = s.lt, t0 = s.shot.t0;
    const wind = gustAt(t, t0 + 0.02, 0.2, 1.9, 3.2) + 0.25 * s.lo;
    const spin = t * 1.5 + (1 - Math.exp(-Math.max(0, lt) * 0.6)) * 60 + lt * 14;
    const cam = { x: lerp(1080, 1180, lt / 4.6), y: 620, z: 1.08, ...shake(s, 10 * Math.exp(-lt * 3), 41) };
    cliffW(g, s, cam, {
      wind, spin, base: { x: 1130, y: 620, z: 1.08 }, bk: 'gust', fg: [['leaves', 'br', {}]],
      sky: (q) => { kite(q, t, 1500 + Math.sin(t) * 30, 150 - wind * 30, 1.1, 1700, 900, ['#ff6a8a', '#ffd24a', '#4ac0e0'], 1); kite(q, t, 700, 240 - wind * 40, 0.8, 1640, 900, ['#4ac0e0', '#ffffff', '#ff8ab8'], 2); },
      mid: (q) => {
        // 放风筝的两个小孩
        // 放风筝的两个人（客串：雪雉拉着线，锡兰在旁边欢呼）
        townsfolk(q, s, { x: 1700, y: 960, h: 250, seed: 40, pose: 'stand', t, flip: true, expr: 'laugh', look: [-0.2, -1] }, 0);
        townsfolk(q, s, { x: 1640, y: 990, h: 230, seed: 57, pose: 'cheer', t, flip: true, expr: 'laugh' }, 3);
        // 被风吹得打滚的小羊
        for (let i = 0; i < 6; i++) {
          const a = lt - 0.1 - i * 0.12;
          if (a < 0) { lamb(q, s, 700 + i * 90, 900 + (i % 2) * 30, 64, { id: 3205 * 16 + i, pose: 'stand', expr: 'open', flip: true }); continue; }
          const x = 700 + i * 90 + a * 260 * (1 + i * 0.1), y = 900 + (i % 2) * 30 - Math.abs(Math.sin(a * 5 + i)) * 40;
          lamb(q, s, x, y, 64, { id: 3205 * 16 + i, pose: 'jump', expr: 'surprise', spin: a * 9, flip: true });
        }
        // 她：举着一只空玻璃罐迎着风
        const ao = { x: 1000, y: 1030, h: 440, pose: 'hold-up', t, expr: lt < 0.4 ? 'determined' : 'laugh', look: [-0.6, -0.8], wind: Math.min(1.4, wind * 0.8), windDir: 1 };
        adele(q, ao);
        const hp = anchor('adele-alter', ao, 'handN', [1000, 560]);
        windJar(q, hp[0] - 10, hp[1] - 30, 1.0, t, 0);
      },
      front: (q) => {
        // 风里飞过的花瓣与草叶
        for (let i = 0; i < 40; i++) { const u = fract(t * (0.5 + hash(71, i) * 0.4) * (0.5 + wind * 0.5) + hash(72, i)); const x = -300 + u * 2600, y = 200 + hash(73, i) * 800 + Math.sin(u * 8 + i) * 40; q.fillStyle = pick(['#ff9ac0', '#ffffff', '#ffe46a', '#8ad06a'], hash(74, i)); q.save(); q.translate(x, y); q.rotate(u * 12 + i); q.fillRect(-7, -3, 14, 6); q.restore(); }
      },
    });
    // 风的线条
    additive(g, (q) => { for (let i = 0; i < 14; i++) { const u = fract(t * 0.9 + hash(75, i)), y = 150 + hash(76, i) * 700, x = -400 + u * 2800; withAlpha(q, Math.sin(PI * u) * 0.35 * Math.min(1, wind), (qq) => { qq.strokeStyle = '#ffffff'; qq.lineWidth = 3; qq.beginPath(); qq.moveTo(x, y); qq.bezierCurveTo(x + 120, y - 30, x + 240, y + 30, x + 380, y); qq.stroke(); }); } });
    vig(g, s, 0.3);
  }
  /* ---------- 镜头 22 · 找不着北的风向标（94.30 → 98.88）：灯塔顶上的羊形风向标一拍转一个方向，最后停在“北” ---------- */
  const VANE_SEQ = [2.4, 4.3, 1.1, 5.4, 2.9, 3.9, 0, 0, 0, 0];
  function vaneAngle(bt) {
    const i = Math.max(0, Math.floor(bt)), f = fract(bt), a0 = VANE_SEQ[Math.max(0, Math.min(VANE_SEQ.length - 1, i - 1))], a1 = VANE_SEQ[Math.min(VANE_SEQ.length - 1, i)];
    const k = ease.elastic(clamp(f / 0.6));
    return a0 + (a1 - a0) * k;
  }
  function shotVane(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const north = bt >= 6;
    const cam = { x: 330, y: lerp(210, 170, lt / 4.6), z: 1.75, r: -0.03, ...hand(s, 39, 3, 0.4) };
    cliffW(g, s, cam, {
      wind: north ? 1.2 : 0.5, vane: vaneAngle(bt), base: { x: 330, y: 190, z: 1.75 }, bk: 'vane',
      sky: (q) => { if (north) for (let i = 0; i < 8; i++) { const u = fract(t * 1.2 + i / 8); withAlpha(q, Math.sin(PI * u) * 0.6, (qq) => { qq.strokeStyle = '#ffffff'; qq.lineWidth = 4; qq.beginPath(); const y = -150 + i * 70; qq.moveTo(-400 + u * 1600, y); qq.lineTo(-200 + u * 1600, y - 10); qq.stroke(); }); } },
    });
    // 每一拍风向标转向时冒一个问号；最后一下“北！”
    inCam(g, cam, 1, (q) => {
      const vx = LH.x, vy = LH.top - 214;
      if (!north) { const k = fract(bt); if (bt > 0.3) pop(q, '？', vx + 90 + (Math.floor(bt) % 2) * 40, vy - 60 - (Math.floor(bt) % 3) * 16, clamp(k / 0.2) * (1 - clamp((k - 0.6) / 0.3)), { size: 54, color: '#3a8ad0', rot: (Math.floor(bt) % 2 ? 0.2 : -0.2) }); }
      else { pop(q, '北！', vx + 130, vy - 70, clamp((bt - 6) / 0.25), { size: 64, color: '#e0508a' }); sparkle(q, vx + 60, vy - 10, 80 * clamp((bt - 6) / 0.4), 1 - clamp((bt - 6.3) / 1.2), t, '255,236,160'); }
    });
    // 前景：她抬头看（胸像，画面右下；屏幕坐标，跟着手持轻轻晃）
    // 官方立绘（纯烬 · 精英零）的半身：抬头望着风向标，风越刮越大；指到“北”的那一拍笑起来。没有立绘时用官方 Q 版小人站在右下角
    g.save(); g.translate((cam.sx || 0) * 1.5, (cam.sy || 0) * 1.5);
    const K = KA();
    // 立绘在镜头开头就绪才用（镜头中途才加载好不换，免得从小人跳成立绘）
    const kid = 'vane|ka', now = performance.now();
    let kd = CARDDEC.get(kid);
    if (!kd || now - kd.at > 1500) kd = { on: !!(K && K.ready && K.ready('alter-e0')) };
    kd.at = now; CARDDEC.set(kid, kd);
    const kaOk = kd.on && K.draw(g, 'alter-e0', {
      crop: 'bust', x: 1500, y: 840, h: 640, t, look: [-0.55, -0.55], gaze: [-0.8, -0.7], smile: north ? ease.out(clamp((bt - 6) / 0.4)) : 0, mouth: north ? 0 : 0.15,
      wind: north ? 1.1 : 0.5, windDir: -1, light: { color: '#fff2dc', dir: [-0.7, -0.7], rim: 0.6, wash: 0.06 },
    });
    if (kaOk) { /* 立绘已画 */ } else if (SDON()) adele(g, { x: 1560, y: 1150, h: 600, pose: north ? 'wave' : 'stand', t, flip: true, shadow: false });
    else adele(g, { x: 1480, y: 1120, h: 620, crop: 'bust', t, pose: 'shade', expr: north ? 'laugh' : 'pout', look: [-0.7, -1], wind: north ? 1 : 0.5, windDir: -1, shadow: false });
    g.restore();
    vig(g, s, 0.3);
  }

  /* ---------- 镜头 23 · 羊形风筝（98.88 → 103.46）：北风来了，大羊风筝一口气升上天，尾巴上挂着一串小羊 ---------- */
  function shotKite(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const rise = ease.inOut(clamp(lt / 4.2));
    const kx = 1100 + rise * 200 + Math.sin(t * 1.3) * 40, ky = lerp(640, -180, rise) + Math.sin(t * 2.1) * 20;
    const cam = { x: lerp(900, 1100, rise), y: lerp(620, 160, rise), z: lerp(1.05, 0.95, rise), ...hand(s, 41, 4, 0.4) };
    cliffW(g, s, cam, {
      wind: 1.1, base: { x: 1000, y: 400, z: 1.0 }, bk: 'kite',
      mid: (q) => {
        // 她：拉着线往前走几步，被拽得踮起脚
        const wv = 100, ax = 760 + Math.min(lt, 2.2) * wv;
        const ao = mixIn({ x: ax, y: cliffTop(ax) + 120, h: 400, pose: lt < 2.2 ? 'walk' : 'reach-up', speed: stepRate('adele-alter', 400, wv), t, expr: 'laugh', look: [0.4, -1], wind: 1.1, windDir: -1 }, 'walk', 2.2, 0.25, lt);
        adele(q, ao);
        const hp = anchor('adele-alter', ao, 'handN', [ax + 40, 600]);
        kite(q, t, kx, ky, 2.2, hp[0], hp[1], ['#ffffff', '#ffe4ee', '#ff8ab8'], 5, { sheep: true, rot: 0.1 });
        // 挂在风筝尾巴上的一串小羊
        for (let i = 0; i < 4; i++) { const tx = kx - 60 - i * 60 + Math.sin(t * 5 + i) * 16, ty = ky + 150 + i * 70; q.strokeStyle = '#ff8ab8'; q.lineWidth = 4; q.beginPath(); q.moveTo(tx + 40, ty - 70); q.lineTo(tx, ty - 20); q.stroke(); lamb(q, s, tx, ty + 30, 70, { id: 3280 * 16 + i, pose: 'jump', expr: 'happy', spin: Math.sin(t * 4 + i) * 0.3, glow: 0.5 }); }
        if (bt > 0.1 && bt < 1.4) pop(q, '起飞！', 1260, 520, clamp((bt - 0.1) / 0.2) * (1 - clamp((bt - 1.1) / 0.3)), { size: 56, color: '#e0508a' });
      },
    });
    vig(g, s, 0.3);
  }

  /* ---------- 镜头 24 · 装进瓶子里的北风（103.46 → 108.02）：灯塔顶的瞭望台上，她把一阵北风装进空汽水瓶；卡片盖上第一个章 ---------- */
  function galleryArt(q) {
    // 瞭望台（设计 1920×1080）：天 + 远处的海与海岸（在下面很远）+ 灯室的玻璃 + 铁栏杆 + 台面
    q.fillStyle = vg(q, -200, 1100, [[0, '#2a7ccc'], [0.5, '#6ab4e8'], [0.75, '#bfe4f4'], [0.76, '#8adae0'], [1, '#2aa0c0']]); q.fillRect(-300, -200, VW + 600, 1400);
    q.fillStyle = 'rgba(255,255,255,0.6)'; q.fillRect(-300, 808, VW + 600, 3);
    const R = E.rng(71); for (let i = 0; i < 120; i++) { const v = R(), y = 812 + v * 300; q.fillStyle = `rgba(255,255,255,${0.1 + R() * 0.15})`; q.fillRect(R() * (VW + 600) - 300, y, 20 + R() * 60, 1 + v * 3); }
    q.fillStyle = 'rgba(150,170,200,0.6)'; q.beginPath(); q.moveTo(1200, 812); q.quadraticCurveTo(1500, 770, 1800, 780); q.lineTo(2300, 800); q.lineTo(2300, 812); q.closePath(); q.fill();
    // 台面（瞭望台的铁板地）
    q.fillStyle = vg(q, 960, 1100, [[0, '#6a7a8a'], [1, '#4a5868']]); q.fillRect(-300, 960, VW + 600, 240); q.fillStyle = '#8a9aaa'; q.fillRect(-300, 960, VW + 600, 10);
    q.strokeStyle = 'rgba(30,40,56,0.35)'; q.lineWidth = 2; for (let x = -300; x < VW + 300; x += 150) { q.beginPath(); q.moveTo(x, 970); q.lineTo(x - 60, 1200); q.stroke(); }
    // 铁栏杆（在瞭望台的外缘）
    q.strokeStyle = '#2a3440'; q.lineWidth = 10; q.beginPath(); q.moveTo(-300, 760); q.lineTo(VW + 300, 760); q.stroke();
    q.lineWidth = 6; q.beginPath(); q.moveTo(-300, 860); q.lineTo(VW + 300, 860); q.stroke();
    for (let x = -300; x < VW + 300; x += 60) { q.lineWidth = 5; q.beginPath(); q.moveTo(x, 760); q.lineTo(x, 962); q.stroke(); }
    q.strokeStyle = 'rgba(255,255,255,0.35)'; q.lineWidth = 2; q.beginPath(); q.moveTo(-300, 756); q.lineTo(VW + 300, 756); q.stroke();
    // 灯室（左边，立在台面上；比栏杆离镜头近）：白色的墙基 + 红色腰线，上面是玻璃罩和里面的大透镜，再上面是红色的圆顶
    const L0 = -320, L1 = 540, base = 1010;
    q.fillStyle = 'rgba(30,40,60,0.28)'; q.beginPath(); q.ellipse(L1 - 60, base + 4, 260, 22, 0, 0, TAU); q.fill();
    // 墙基
    q.fillStyle = hg(q, L0, L1, [[0, '#e6e0d8'], [0.55, '#fbf8f2'], [0.9, '#e2dcd4'], [1, '#c8c0b8']]); q.fillRect(L0, 720, L1 - L0, base - 720);
    q.fillStyle = '#d8434e'; q.fillRect(L0, 720, L1 - L0, 34); q.fillStyle = 'rgba(0,0,0,0.12)'; q.fillRect(L0, 754, L1 - L0, 8);
    q.strokeStyle = 'rgba(90,80,70,0.35)'; q.lineWidth = 2; for (let yy = 800; yy < base; yy += 60) { q.beginPath(); q.moveTo(L0, yy); q.lineTo(L1, yy); q.stroke(); }
    q.strokeStyle = '#3a3440'; q.lineWidth = 3; q.strokeRect(L0, 720, L1 - L0, base - 720);
    // 玻璃罩：里面暗一些（灯室里），反着天光
    q.fillStyle = vg(q, 110, 720, [[0, '#3c6478'], [0.6, '#5a8ea2'], [1, '#6aa0b0']]); q.fillRect(L0, 110, L1 - L0, 610);
    // 透镜（菲涅耳透镜：一圈圈横向的棱镜带 + 中间的靶心）
    const lx = 130, ly = 420;
    q.save(); q.beginPath(); q.ellipse(lx, ly, 190, 250, 0, 0, TAU); q.clip();
    q.fillStyle = vg(q, ly - 250, ly + 250, [[0, '#d8b870'], [0.5, '#fff0c0'], [1, '#c8a060']]); q.fillRect(lx - 200, ly - 260, 400, 520);
    for (let i = -12; i <= 12; i++) { const yy = ly + i * 20; q.fillStyle = i % 2 ? 'rgba(255,255,240,0.55)' : 'rgba(170,130,60,0.35)'; q.fillRect(lx - 200, yy - 4, 400, 8); }
    for (let r = 110; r > 10; r -= 20) { q.fillStyle = (r / 20) % 2 ? 'rgba(255,250,220,0.95)' : 'rgba(210,170,90,0.9)'; q.beginPath(); q.arc(lx, ly, r, 0, TAU); q.fill(); }
    q.fillStyle = 'rgba(255,255,255,0.9)'; q.beginPath(); q.arc(lx - 20, ly - 24, 16, 0, TAU); q.fill();
    q.restore();
    q.strokeStyle = 'rgba(120,90,40,0.8)'; q.lineWidth = 4; q.beginPath(); q.ellipse(lx, ly, 190, 250, 0, 0, TAU); q.stroke();
    q.fillStyle = '#4a4a50'; q.fillRect(lx - 60, ly + 250, 120, 720 - ly - 250);
    // 玻璃上的反光（斜着的几道亮带）
    q.fillStyle = 'rgba(255,255,255,0.16)'; for (let i = 0; i < 4; i++) { const x0 = L0 + 60 + i * 230; q.beginPath(); q.moveTo(x0, 110); q.lineTo(x0 + 70, 110); q.lineTo(x0 - 30, 720); q.lineTo(x0 - 100, 720); q.closePath(); q.fill(); }
    // 玻璃罩的窗框
    q.strokeStyle = '#2a3440'; q.lineWidth = 14; for (const x of [L0 + 120, 20, 290, L1 - 7]) { q.beginPath(); q.moveTo(x, 104); q.lineTo(x, 722); q.stroke(); }
    q.lineWidth = 8; q.beginPath(); q.moveTo(L0, 415); q.lineTo(L1, 415); q.stroke();
    q.fillStyle = hg(q, L1 - 90, L1, [[0, 'rgba(20,30,50,0)'], [1, 'rgba(20,30,50,0.3)']]); q.fillRect(L1 - 90, 110, 90, 610);
    // 圆顶（红）+ 檐口
    q.fillStyle = '#2a3440'; q.fillRect(L0 - 20, 92, L1 - L0 + 40, 20);
    q.fillStyle = vg(q, -260, 92, [[0, '#b83440'], [1, '#e0505a']]); q.beginPath(); q.moveTo(L0 - 30, 92); q.quadraticCurveTo(L0 + 40, -170, 110, -250); q.quadraticCurveTo(L1 - 20, -170, L1 + 30, 92); q.closePath(); q.fill();
    q.strokeStyle = 'rgba(255,255,255,0.3)'; q.lineWidth = 6; q.beginPath(); q.moveTo(L1 - 20, 80); q.quadraticCurveTo(L1 - 80, -120, 180, -220); q.stroke();
  }
  /** 空的玻璃瓶（瓶底中心 (x,y)，高 h）；wind 0..1 里面一团小旋风；cork 0..1 塞子 */
  function emptyBottle(q, x, y, h, rot, t, wind, cork) {
    q.save(); q.translate(x, y); q.rotate(rot); q.scale(h / 150, h / 150);
    const body = () => { q.beginPath(); q.moveTo(-8, -140); q.lineTo(8, -140); q.lineTo(8, -114); q.bezierCurveTo(8, -98, 22, -94, 22, -78); q.lineTo(22, -14); q.quadraticCurveTo(22, -4, 12, -4); q.lineTo(-12, -4); q.quadraticCurveTo(-22, -4, -22, -14); q.lineTo(-22, -78); q.bezierCurveTo(-22, -94, -8, -98, -8, -114); q.closePath(); };
    body(); q.fillStyle = 'rgba(200,240,240,0.35)'; q.fill();
    if (wind > 0) {
      q.save(); body(); q.clip();
      q.strokeStyle = `rgba(150,210,255,${0.9 * wind})`; q.lineWidth = 3; q.lineCap = 'round';
      for (let i = 0; i < 3; i++) { q.beginPath(); for (let j = 0; j <= 18; j++) { const a = t * 7 + j * 0.55 + i * 2.1, r = 4 + j * 0.9; q.lineTo(Math.cos(a) * r, -50 + Math.sin(a) * r * 0.45 - j * 1.4); } q.stroke(); }
      q.restore();
    }
    q.fillStyle = 'rgba(255,255,255,0.7)'; q.fillRect(-16, -74, 4, 58); q.fillRect(-4, -134, 3, 24);
    body(); q.strokeStyle = '#1f3a44'; q.lineWidth = 2.4; q.stroke();
    // 标签（和汽水瓶同一款）
    q.fillStyle = '#fff4f8'; q.fillRect(-22, -58, 44, 26); q.fillStyle = '#ff7eb0'; q.fillRect(-22, -58, 44, 4); q.fillRect(-22, -36, 44, 4);
    if (cork > 0) { q.fillStyle = '#c8a070'; q.fillRect(-9, -150 + (1 - cork) * -40, 18, 16); q.strokeStyle = '#6a4a2a'; q.lineWidth = 1.5; q.strokeRect(-9, -150 + (1 - cork) * -40, 18, 16); }
    q.restore();
    if (wind > 0) E.glow(q, x - Math.sin(rot) * h * 0.35, y - Math.cos(rot) * h * 0.35, h * 0.5, '190,230,255', 0.45 * wind);
  }
  function shotBottleWind(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: lerp(1000, 1060, lt / 4.6), y: 560, z: lerp(1.2, 1.3, lt / 4.6), ...hand(s, 43, 3, 0.4) };
    const catchK = clamp((bt - 1.2) / 2.2), cork = clamp((bt - 4.2) / 0.3), stampK = clamp((bt - 6) / 0.35);
    g.fillStyle = '#6ab4e8'; g.fillRect(0, 0, VW, VH);
    inCam(g, cam, 0.5, (q) => { for (let i = 0; i < 5; i++) { const w = 420 + hash(931, i) * 300; q.drawImage(cloud(s, 930 + i, Math.round(w), Math.round(w * 0.36), 'day'), ((hash(932, i) * 3000 + t * 60) % 3000) - 700, 60 + hash(933, i) * 500, w, w * 0.36); } });
    inCam(g, cam, 1, (q) => {
      q.drawImage(LC(s, 'gallery', VW + 600, 1400, (qq) => { qq.translate(300, 200); galleryArt(qq); }, 0.8), -300, -200, VW + 600, 1400);
      // （官方小人：整段都把瓶子举在手上——Interact）
      const ao = { x: 1060, y: 980, h: 480, pose: SDON() ? 'wave' : cork >= 1 ? (bt > 6 ? 'cheer' : 'hold') : 'hold-up', t, expr: cork >= 1 ? 'laugh' : 'determined', look: [0.5, -0.8], wind: 1.0, windDir: -1 };
      adele(q, ao);
      const hp = anchor('adele-alter', ao, 'handN', [1100, 560]);
      if (bt < 6) emptyBottle(q, hp[0], hp[1] + 30, 170, 0.1, t, catchK * (cork >= 1 ? 1 : 0.6 + 0.4 * Math.sin(t * 8)), cork);
      // 北风：一条条螺旋的风线，从右上方盘旋着收进瓶口（线从粗到细），夹着几片花瓣
      const mx = hp[0] + 12, my = hp[1] - 132;
      if (bt > 0.8 && cork < 1) {
        const k = clamp((bt - 0.8) / 0.6);
        q.lineCap = 'butt'; q.lineJoin = 'round';
        for (let i = 0; i < 7; i++) {
          const ph = t * 1.6 + i * (TAU / 7);
          for (let j = 0; j < 30; j++) {
            const u0 = j / 30, u1 = (j + 1) / 30;
            const P = (u) => { const r = (1 - u) * (420 + 60 * Math.sin(i)), a = ph + u * 5.5; return [mx + Math.cos(a) * r + (1 - u) * 260, my + Math.sin(a) * r * 0.42 - (1 - u) * 180]; };
            const [x0, y0] = P(u0), [x1, y1] = P(u1);
            q.strokeStyle = `rgba(236,248,255,${0.75 * k * Math.sin(PI * Math.min(1, u0 * 1.2 + 0.1))})`; q.lineWidth = 2 + (1 - u0) * 7;
            q.beginPath(); q.moveTo(x0, y0); q.lineTo(x1, y1); q.stroke();
          }
        }
        q.lineCap = 'butt';
        for (let i = 0; i < 10; i++) { const u = fract(t * 0.7 + i / 10), r = (1 - u) * 380, a = t * 1.6 + i + u * 5.5; q.save(); q.translate(mx + Math.cos(a) * r + (1 - u) * 260, my + Math.sin(a) * r * 0.42 - (1 - u) * 180); q.rotate(u * 9); q.fillStyle = i % 2 ? '#ff9ac0' : '#ffffff'; q.globalAlpha = Math.sin(PI * u) * k; q.fillRect(-7, -3, 14, 6); q.restore(); }
        E.glow(q, mx, my, 70, '220,240,255', 0.5 * k);
      }
      if (cork >= 1 && bt < 6) pop(q, '啵！', hp[0] + 80, hp[1] - 200, clamp((bt - 4.2) / 0.2) * (1 - clamp((bt - 5.6) / 0.3)), { size: 52, color: '#3a8ad0' });
    });
    // 最后一拍：卡片从右边插进来（停在她身边，不挡人），盖上第一个蹄印章
    if (bt > 5.4) {
      const k = ease.out(clamp((bt - 5.4) / 0.4));
      g.save(); g.fillStyle = `rgba(20,30,60,${0.2 * k})`; g.fillRect(0, 0, VW, VH); g.restore();
      tradeCard(g, s, lerp(2500, 1500, k), 400, 0.92, -0.06, stampK, t);
      if (stampK > 0 && stampK < 1) pop(g, '咚！', 1210, 190, 1, { size: 60, color: '#e0508a' });
    }
    vig(g, s, 0.3);
  }

  /* =========================================================
   * 种子（108.02 → 128.61）
   * ========================================================= */
  /** 种子纸袋（(x, y) 中心；torn 0..1 被咬掉的上半截） */
  function seedPacket(q, x, y, sc, rot, torn = 0) {
    q.save(); q.translate(x, y); q.rotate(rot); q.scale(sc, sc);
    q.fillStyle = '#fffaf0'; q.beginPath(); q.moveTo(-40, 56); q.lineTo(-40, -50 + torn * 40); for (let i = 0; i <= 6; i++) q.lineTo(-40 + i * 13.3, -56 + torn * 40 + (torn > 0 ? (i % 2) * 10 : 0)); q.lineTo(40, 56); q.closePath(); q.fill();
    q.strokeStyle = '#6a5a4a'; q.lineWidth = 2.5; q.stroke();
    // 包装上的花（橘红的小铃铛花）
    q.save(); q.clip();
    q.fillStyle = '#f6e2c0'; q.fillRect(-40, -20, 80, 60);
    q.strokeStyle = '#4e9a5a'; q.lineWidth = 3; q.beginPath(); q.moveTo(0, 36); q.quadraticCurveTo(-4, 10, 4, -14); q.stroke();
    for (const [fx, fy] of [[4, -16], [-14, 0], [16, 4]]) { q.fillStyle = '#ff6a4a'; q.beginPath(); q.moveTo(fx - 8, fy - 6); q.quadraticCurveTo(fx, fy + 12, fx + 8, fy - 6); q.quadraticCurveTo(fx, fy - 10, fx - 8, fy - 6); q.fill(); }
    q.restore();
    E.text(q, '预警花', 0, -28 + torn * 30, { size: 16, weight: 900, color: '#c0402a' });
    q.restore();
  }
  function greenhouseArt(q) {
    // 凯勒老师的小花房（博物馆后院）：玻璃房、木架子上的一盆盆花、门口的小路
    q.fillStyle = vg(q, -200, 1100, [[0, '#3a8ad8'], [0.5, '#8ccaf0'], [0.8, '#d8f0f8'], [1, '#e8f4f0']]); q.fillRect(-300, -200, VW + 600, 1400);
    q.fillStyle = '#9ac88a'; q.fillRect(-300, 820, VW + 600, 400);
    // 玻璃房
    q.fillStyle = 'rgba(210,240,250,0.5)'; q.beginPath(); q.moveTo(200, 900); q.lineTo(200, 330); q.lineTo(960, 120); q.lineTo(1720, 330); q.lineTo(1720, 900); q.closePath(); q.fill();
    q.strokeStyle = '#fbfaf6'; q.lineWidth = 14; q.stroke();
    q.lineWidth = 7; for (let x = 200; x <= 1720; x += 190) { q.beginPath(); q.moveTo(x, 900); q.lineTo(x, x < 960 ? 330 - (x - 200) / 760 * 210 : 120 + (x - 960) / 760 * 210); q.stroke(); }
    q.beginPath(); q.moveTo(200, 560); q.lineTo(1720, 560); q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.28)'; for (let i = 0; i < 5; i++) { q.beginPath(); q.moveTo(260 + i * 300, 340); q.lineTo(340 + i * 300, 340); q.lineTo(240 + i * 300, 880); q.lineTo(200 + i * 300, 880); q.closePath(); q.fill(); }
    // 架子与花盆
    for (const sy of [700, 880]) {
      q.fillStyle = '#9a6a44'; q.fillRect(230, sy, 1460, 16);
      for (let i = 0; i < 14; i++) {
        const px = 280 + i * 104, R = E.rng(sy + i);
        q.fillStyle = '#c8684a'; q.beginPath(); q.moveTo(px - 26, sy); q.lineTo(px - 20, sy - 40); q.lineTo(px + 20, sy - 40); q.lineTo(px + 26, sy); q.closePath(); q.fill();
        q.fillStyle = R() < 0.5 ? '#4e9a5a' : '#3e8a4a'; q.beginPath(); q.arc(px, sy - 60, 30, 0, TAU); q.fill();
        const fc = pick(['#ff6a4a', '#ff8ab8', '#ffd24a', '#b890f0', '#ffffff'], R());
        for (let j = 0; j < 5; j++) { q.fillStyle = fc; q.beginPath(); q.arc(px - 18 + j * 9, sy - 74 + (j % 2) * 12, 7, 0, TAU); q.fill(); }
      }
    }
    // 地面上的小路
    q.fillStyle = '#e8dcc4'; q.beginPath(); q.moveTo(700, 1200); q.lineTo(860, 900); q.lineTo(1060, 900); q.lineTo(1220, 1200); q.closePath(); q.fill();
  }
  /* ---------- 镜头 25 · 花房（108.02 → 112.60）：凯勒老师从架子上拿下一包“预警花”的种子 ---------- */
  function shotGarden(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: lerp(900, 960, lt / 4.6), y: 640, z: lerp(1.25, 1.34, lt / 4.6), ...hand(s, 45, 3, 0.35) };
    g.fillStyle = '#8ccaf0'; g.fillRect(0, 0, VW, VH);
    inCam(g, cam, 1, (q) => {
      q.drawImage(LC(s, 'greenhouse', VW + 600, 1400, (qq) => { qq.translate(300, 200); greenhouseArt(qq); }, 1), -300, -200, VW + 600, 1400);
      // 花房里的阳光
      additive(q, (qq) => { for (let i = 0; i < 4; i++) { qq.fillStyle = `rgba(255,240,200,${0.08 + 0.03 * Math.sin(t + i)})`; qq.beginPath(); qq.moveTo(300 + i * 360, 200); qq.lineTo(420 + i * 360, 200); qq.lineTo(620 + i * 360, 1100); qq.lineTo(460 + i * 360, 1100); qq.closePath(); qq.fill(); } });
      const give = clamp((bt - 1) / 1.2);
      const ko = { x: 760, y: 1010, h: 440 * KH(), pose: give < 1 ? 'hold' : 'point', aim: 0.1, t, expr: 'smile', flip: false, look: [1, 0], talk: bt < 2 ? 1 : 0 };
      // 凯勒老师：官方立绘剪纸（膝上构图，画面左边），说着话把种子递过来
      const gt0 = s.shot.t0;
      const kc = kellerCard(q, s, {
        x: 760, y: 1105, h: 600, crop: 'upper', flip: true, expr: [[gt0 - 1, 8], [gt0 + 2.2, 9]], mouth: talkK([[gt0 + 0.1, gt0 + 1.0], [gt0 + 1.25, gt0 + 1.95]], 17),
        look: E.keyart && E.keyart.path ? E.keyart.path([[gt0 + 0.2, [-0.45, 0.15]], [gt0 + 1.4, [-0.5, 0.25]], [gt0 + 2.4, [-0.45, -0.2]]]) : [-0.45, 0.1],
        glint: (tt) => E.window01(tt, gt0 + 2.4, gt0 + 3.4, 0.25, 0.5),
      }, (qq) => keller(qq, ko, s));
      const ao = mixIn({ x: 1180, y: 1020, h: 440, pose: give >= 1 ? 'hold-up' : 'stand', t, expr: give >= 1 ? 'laugh' : 'smile', flip: true, look: [-1, give >= 1 ? -0.6 : 0.1] }, 'stand', 2.2, 0.45, bt);
      adele(q, ao);
      const kh = kc ? [880, 800] : anchor('keller', ko, 'handN', [820, 740]), ah = SDON() ? liftAt(ao, [1150, 560]) : anchor('adele-alter', ao, 'handN', [1150, 560]);
      // 举过头顶（纸袋的下沿在手上 / 官方小人的头顶上方，不挡脸）
      const px = lerp(kh[0], ah[0], ease.inOut(give)), py = lerp(kh[1], ah[1] - (SDON() ? 70 : 92), ease.inOut(give)) - Math.sin(PI * give) * 60;
      seedPacket(q, px, py, 1.3, Math.sin(t * 3) * 0.1, 0);
      if (give >= 1) { sparkle(q, px, py - 40, 70, 0.7 + 0.3 * Math.sin(t * 5), t, '255,236,160'); for (let i = 0; i < 3; i++) star4(q, px - 60 + i * 60, py - 110 - (i % 2) * 20, 12, t * 2 + i, '#ffd24a', 0.9); }
    });
    fgFrame(g, s, cam, 'leaves', 'tl', { depth: 1.5 });
    vig(g, s, 0.3);
  }

  /* ---------- 镜头 26 · 抢走了！（112.60 → 117.16）：一只小羊叼走种子，在集市上一拍一跳地逃 ---------- */
  const STALLS_D = [
    { x: 300, w: 360, c: '#ff8a5a', sign: '水果', kind: 'fruit' },
    { x: 780, w: 360, c: '#3aa0d0', sign: '鲜鱼', kind: 'fish' },
    { x: 1260, w: 360, c: '#e0609a', sign: '花', kind: 'flower' },
    { x: 1740, w: 360, c: '#f0b040', sign: '草帽', kind: 'hat' },
    { x: 2220, w: 360, c: '#6ab870', sign: '陶器', kind: 'pot' },
    { x: 2700, w: 360, c: '#8a70d0', sign: '冰淇淋', kind: 'ice' },
  ];
  function stallD(q, st) {
    const { x, w } = st, base = 900, top = base - 360, ink = INK_D;
    q.fillStyle = mixC(st.c, '#fffaf2', 0.75); q.fillRect(x + 12, top + 40, w - 24, 220);
    q.fillStyle = 'rgba(60,60,110,0.15)'; q.fillRect(x + 12, top + 40, w - 24, 50);
    q.fillStyle = '#9a6a44'; q.fillRect(x + 20, top + 150, w - 40, 8);
    const R = E.rng(x | 0);
    for (let i = 0; i < 7; i++) { const gx = x + 40 + i * ((w - 80) / 6), gy = top + 150; if (st.kind === 'hat') { q.fillStyle = pick(['#f4d88a', '#fff4d8', '#e8c070'], R()); q.beginPath(); q.ellipse(gx, gy - 10, 20, 6, 0, 0, TAU); q.fill(); q.beginPath(); q.ellipse(gx, gy - 16, 11, 10, 0, PI, 0); q.fill(); } else if (st.kind === 'pot') { q.fillStyle = pick(['#c8684a', '#4a8ed0', '#fbf6ee'], R()); q.beginPath(); q.ellipse(gx, gy - 16, 14, 16, 0, 0, TAU); q.fill(); } else { q.fillStyle = pick(['#ffd24a', '#ff8ab8', '#8ad0ff', '#b8f0c8'], R()); q.beginPath(); q.arc(gx, gy - 12, 12, 0, TAU); q.fill(); } }
    // 柜台 + 货
    q.fillStyle = '#b07a50'; q.fillRect(x, base - 130, w, 130); q.fillStyle = '#c89a6a'; q.fillRect(x - 10, base - 142, w + 20, 14);
    q.strokeStyle = 'rgba(60,30,20,0.3)'; q.lineWidth = 2; for (let i = 1; i < 5; i++) { q.beginPath(); q.moveTo(x, base - 130 + i * 26); q.lineTo(x + w, base - 130 + i * 26); q.stroke(); }
    q.strokeStyle = ink; q.lineWidth = 3; q.strokeRect(x - 10, base - 142, w + 20, 14); q.strokeRect(x, base - 128, w, 128);
    for (let i = 0; i < 9; i++) {
      const gx = x + 30 + i * ((w - 60) / 8), gy = base - 150;
      if (st.kind === 'fruit') { q.fillStyle = pick(['#ff6a4a', '#ffb030', '#ffd24a', '#8ad050'], R()); q.beginPath(); q.arc(gx, gy - 6 - (i % 2) * 10, 16, 0, TAU); q.fill(); q.fillStyle = 'rgba(255,255,255,0.4)'; q.beginPath(); q.arc(gx - 5, gy - 12 - (i % 2) * 10, 5, 0, TAU); q.fill(); }
      else if (st.kind === 'fish') { q.fillStyle = pick(['#9ab0c8', '#c8d8e8', '#e0a0a0'], R()); q.beginPath(); q.ellipse(gx, gy - 8, 22, 8, 0.1, 0, TAU); q.fill(); q.beginPath(); q.moveTo(gx + 20, gy - 8); q.lineTo(gx + 32, gy - 16); q.lineTo(gx + 32, gy); q.closePath(); q.fill(); }
      else if (st.kind === 'flower') { q.fillStyle = '#4e9a5a'; q.fillRect(gx - 2, gy - 40, 4, 40); q.fillStyle = pick(['#ff4a7a', '#ffd24a', '#ff8ab8', '#b890f0', '#ffffff'], R()); for (let j = 0; j < 5; j++) { const a = j * TAU / 5; q.beginPath(); q.arc(gx + Math.cos(a) * 8, gy - 44 + Math.sin(a) * 8, 7, 0, TAU); q.fill(); } q.fillStyle = '#ffd24a'; q.beginPath(); q.arc(gx, gy - 44, 5, 0, TAU); q.fill(); }
      else if (st.kind === 'hat') { q.fillStyle = pick(['#f4d88a', '#fff4d8'], R()); q.beginPath(); q.ellipse(gx, gy - 4, 24, 7, 0, 0, TAU); q.fill(); q.beginPath(); q.ellipse(gx, gy - 12, 13, 12, 0, PI, 0); q.fill(); q.fillStyle = pick(['#ff6a8a', '#4ac0e0'], R()); q.fillRect(gx - 13, gy - 15, 26, 4); }
      else if (st.kind === 'pot') { q.fillStyle = pick(['#c8684a', '#4a8ed0', '#fbf6ee', '#e0b060'], R()); q.beginPath(); q.moveTo(gx - 14, gy); q.quadraticCurveTo(gx - 22, gy - 26, gx - 8, gy - 34); q.lineTo(gx + 8, gy - 34); q.quadraticCurveTo(gx + 22, gy - 26, gx + 14, gy); q.closePath(); q.fill(); }
      else { q.fillStyle = '#e8b870'; q.beginPath(); q.moveTo(gx - 10, gy - 20); q.lineTo(gx + 10, gy - 20); q.lineTo(gx, gy + 6); q.closePath(); q.fill(); q.fillStyle = pick(['#ffb0cc', '#fff4d8', '#b8e0ff'], R()); q.beginPath(); q.arc(gx, gy - 26, 12, 0, TAU); q.fill(); }
    }
    // 招牌
    q.fillStyle = '#fffaf2'; rrect(q, x + w / 2 - 90, base - 110, 180, 60, 14); q.fill(); q.strokeStyle = st.c; q.lineWidth = 5; q.stroke();
    E.text(q, st.sign, x + w / 2, base - 66, { size: st.sign.length > 2 ? 32 : 38, weight: 900, color: mixC(st.c, '#2a2040', 0.4), spacing: 4 });
    // 柱子 + 条纹雨篷
    q.fillStyle = '#8a6a50'; q.fillRect(x + 6, top + 10, 12, base - top - 10); q.fillRect(x + w - 18, top + 10, 12, base - top - 10);
    const n = 9, x0 = x - 16, x1 = x + w + 16, bx0 = x - 36, bx1 = x + w + 36, ay = top - 20, by = top + 44;
    for (let i = 0; i < n; i++) { const a0 = lerp(x0, x1, i / n), a1 = lerp(x0, x1, (i + 1) / n), b0 = lerp(bx0, bx1, i / n), b1 = lerp(bx0, bx1, (i + 1) / n); q.fillStyle = i % 2 ? '#fffaf2' : st.c; q.beginPath(); q.moveTo(a0, ay); q.lineTo(a1, ay); q.lineTo(b1, by); q.arc((b0 + b1) / 2, by, (b1 - b0) / 2, 0, PI); q.closePath(); q.fill(); }
    q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.moveTo(x0, ay); q.lineTo(x1, ay); q.lineTo(bx1, by); for (let i = n - 1; i >= 0; i--) { const b0 = lerp(bx0, bx1, i / n), b1 = lerp(bx0, bx1, (i + 1) / n); q.arc((b0 + b1) / 2, by, (b1 - b0) / 2, 0, PI); } q.lineTo(x0, ay); q.stroke();
    q.fillStyle = 'rgba(60,60,110,0.18)'; q.fillRect(x - 20, by + 20, w + 40, 26);
  }
  function marketStreet(q, a, b) {
    paving(q, a, b, 880, 1100, 81);
    for (const st of STALLS_D) if (st.x + st.w + 60 > a && st.x - 60 < b) stallD(q, st);
  }
  function shotSnatch(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const lx0 = 360, hopLen = 170;
    const hb = Math.max(0, bt - 0.8), hi = Math.floor(hb), hf = fract(hb);
    const lxa = lx0 + hi * hopLen, lxb = lxa + hopLen;
    const lamX = bt < 0.8 ? lx0 : lerp(lxa, lxb, hf);
    const cam = { x: Math.max(900, lamX + 80), y: 600, z: 1.1, ...hand(s, 47, 4, 0.5) };
    townD(g, s, cam, {
      volcX: 1700,
      street: (q0) => {
        tiled(q0, s, 'market', cam, 1, -300, 3400, 1100, marketStreet, 1, 500, 620);
        inCam(q0, cam, 1, (q) => {
          // 叼着种子逃跑的小羊：在摊子的柜台上一拍一跳（跳过摊子之间的空隙）
          const onStall = (x) => STALLS_D.some((st) => x > st.x && x < st.x + st.w);
          const ya = onStall(lxa) ? 758 : 900, yb = onStall(lxb) ? 758 : 900;
          const ly = bt < 0.8 ? (onStall(lx0) ? 758 : 900) : lerp(ya, yb, hf) - Math.sin(PI * hf) * 130;
          lamb(q, s, lamX, ly, 96, { id: 3526 * 16, pose: bt < 0.8 ? 'stand' : 'jump', expr: 'happy', flip: false, glow: 0.5, sq: hop(hf)[1] });
          seedPacket(q, lamX + 44, ly - 50, 0.9, 0.5 + Math.sin(t * 8) * 0.2, 0);
          // 游客：只看见一包种子在空中飞
          // （客串干员：种子袋从头顶飞过时吓一跳——Interact）
          for (let i = 0; i < 3; i++) { const px = 700 + i * 700; townsfolk(q, s, { x: px, y: 1000, h: 330, seed: TOURISTS[(i * 11 + 6) % TOURISTS.length], pose: Math.abs(px - lamX) < 300 ? 'cover' : 'stand', mixFrom: { pose: 'stand' }, mixK: clamp((300 - Math.abs(px - lamX)) / 70), t: t + i, expr: Math.abs(px - lamX) < 300 ? 'surprise' : 'smile', flip: px > lamX, look: [px > lamX ? -1 : 1, -0.5] }, i + 1); }
          // 她：在后面追
          const ax = Math.max(120, lamX - 420);
          adele(q, { x: ax, y: 1040, h: 440, pose: 'run', t, speed: stepRate('adele-alter', 440, hopLen / BEAT, true), expr: 'determined', look: [1, -0.3], wind: 0.5 });
          if (bt < 1.2) pop(q, '啊——！', ax + 60, 540, clamp(bt / 0.2), { size: 50, color: '#e0508a' });
        });
      },
    });
    vig(g, s, 0.3);
  }

  /* ---------- 镜头 27 · 抓住了（117.16 → 121.74）：她扑进花摊；种子袋被啃掉了一半；小羊打了个嗝，头上冒出一棵芽 ---------- */
  function shotCatch(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const dive = clamp((lt - 0.3) / 0.5), land = lt > 0.8;
    const cam = { x: 1440, y: 700, z: 1.55, ...(lt > 0.8 && lt < 1.3 ? shake(s, 12 * (1 - (lt - 0.8) / 0.5), 49) : hand(s, 49, 3, 0.4)) };
    townD(g, s, cam, {
      volcX: 1700,
      street: (q0) => {
        tiled(q0, s, 'market', cam, 1, -300, 3400, 1100, marketStreet, 1, 500, 620);
        inCam(q0, cam, 1, (q) => {
          // 她扑过去（被花埋住），举起抢回来的种子袋
          // （官方小人：扑进花摊前的一只木花箱，坐在箱子上；第 4 拍花瓣一炸，跳起来把种子袋举在手上）
          const SDk = SDON();
          const ao = land ? { x: 1400, y: 1040, h: 440, pose: bt > 3 ? 'hold-up' : 'sit-ground', seat: SDk ? 118 : undefined, t, expr: bt > 3 ? 'laugh' : 'surprise', look: [0.4, -0.5], flip: false } : { x: lerp(1100, 1380, dive), y: 1040 - Math.sin(PI * dive) * 120, h: 440, pose: 'jump', t, expr: 'determined', rot: 0.5 * Math.sin(PI * dive), flip: false }; // 扑出去身子前倾、落地时回正（旧写法落地那一帧从 0.5 弧度一下子弹正）
          if (land) { mixIn(ao, 'jump', 0.8, 0.2, lt); mixIn(ao, 'sit-ground', 3, 0.3, bt); }
          if (SDk) {
            // 花箱（座）：木板 + 满满的花
            const cx = 1400, cy = 1040, w = 230, hh = 118;
            q.fillStyle = '#a06a44'; q.fillRect(cx - w / 2, cy - hh, w, hh); q.fillStyle = '#86542f'; for (let i = 0; i < 3; i++) q.fillRect(cx - w / 2, cy - hh + 8 + i * 38, w, 6);
            q.strokeStyle = INK_D; q.lineWidth = 3; q.strokeRect(cx - w / 2, cy - hh, w, hh);
            for (let i = 0; i < 16; i++) { q.fillStyle = pick(['#ff4a7a', '#ffd24a', '#ff8ab8', '#ffffff', '#b890f0'], hash(117, i)); q.beginPath(); q.arc(cx - w / 2 + 10 + hash(118, i) * (w - 20), cy - hh - 4 - hash(119, i) * 16, 11, 0, TAU); q.fill(); }
          }
          adele(q, ao);
          if (SDk && bt > 2.8 && bt < 3.6) { const k = clamp((bt - 2.8) / 0.8); for (let i = 0; i < 20; i++) { const an = (i / 20) * TAU, r = 60 + k * 260; q.fillStyle = pick(['#ff4a7a', '#ffd24a', '#ff8ab8', '#ffffff'], hash(114, i)); q.globalAlpha = 1 - k; q.beginPath(); q.arc(1400 + Math.cos(an) * r, 860 + Math.sin(an) * r * 0.7 + 200 * k * k, 9, 0, TAU); q.fill(); } q.globalAlpha = 1; }
          if (land) { for (let i = 0; i < 18; i++) { const a = lt - 0.8, ang = -PI / 2 + (hash(111, i) - 0.5) * 2.4, v = 300 + hash(112, i) * 300; const px = 1420 + Math.cos(ang) * v * a, py = 860 + Math.sin(ang) * v * a + 900 * a * a; if (py < 1100 && a < 1.2) { q.fillStyle = pick(['#ff4a7a', '#ffd24a', '#ff8ab8', '#ffffff'], hash(113, i)); q.beginPath(); q.arc(px, py, 7, 0, TAU); q.fill(); } } }
          const hp = SDk ? liftAt(ao, [1440, 600]) : anchor('adele-alter', ao, 'handN', [1440, 700]);
          if (land && bt > 3) seedPacket(q, hp[0], hp[1] - (SDk ? 74 : 96), 1.4, SDk ? 0.2 : -0.1, 0.5);
          // 旁边的小羊：打嗝，头上“噗”地长出一棵芽
          const burp = clamp((bt - 5) / 0.3);
          lamb(q, s, 1700, 1000, 120, { id: 3569 * 16, pose: 'sit', expr: bt > 5 ? 'closed' : 'happy', flip: true, glow: 0.4, sq: burp > 0 && burp < 1 ? 0.4 : 0 });
          if (bt > 1.2 && bt < 5) { for (let i = 0; i < 3; i++) { q.fillStyle = '#b07a3a'; q.beginPath(); q.ellipse(1660 + i * 14, 960 + (i % 2) * 4, 4, 6, 0.4, 0, TAU); q.fill(); } }
          if (burp > 0) {
            pop(q, '嗝', 1790, 870, burp, { size: 44, color: '#8a6ac0' });
            const gk = ease.back(clamp((bt - 5.2) / 0.4));
            if (gk > 0) { q.strokeStyle = '#4ea84e'; q.lineWidth = 5; q.beginPath(); q.moveTo(1700, 905); q.lineTo(1700, 905 - 40 * gk); q.stroke(); q.fillStyle = '#6ac86a'; q.beginPath(); q.ellipse(1686, 905 - 40 * gk, 14 * gk, 7 * gk, -0.4, 0, TAU); q.ellipse(1714, 905 - 44 * gk, 14 * gk, 7 * gk, 0.4, 0, TAU); q.fill(); }
          }
        });
      },
    });
    vig(g, s, 0.3);
  }

  /* ---------- 镜头 28 · 种下去（121.74 → 126.33）：博物馆门前的花坛，剩下的种子种下去、浇水，一拍冒出芽；盖上第二个章 ---------- */
  function wateringCan(q, x, y, sc, tilt) {
    q.save(); q.translate(x, y); q.rotate(tilt); q.scale(sc, sc);
    q.fillStyle = '#4ab0c8'; rrect(q, -40, -30, 80, 60, 10); q.fill(); q.strokeStyle = INK_D; q.lineWidth = 3; q.stroke();
    q.strokeStyle = '#4ab0c8'; q.lineWidth = 10; q.beginPath(); q.moveTo(36, 0); q.lineTo(90, -40); q.stroke(); q.fillStyle = '#3a90a8'; q.beginPath(); q.ellipse(94, -44, 12, 8, -0.6, 0, TAU); q.fill();
    q.strokeStyle = '#3a90a8'; q.lineWidth = 6; q.beginPath(); q.arc(-10, -30, 26, PI, 0); q.stroke();
    q.restore();
  }
  function shotSprout(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: 780, y: 900, z: 1.7, ...hand(s, 51, 3, 0.35) };
    const pour = clamp((bt - 2) / 2), grow = ease.back(clamp((bt - 4) / 0.5)), stampK = clamp((bt - 6) / 0.35);
    museumD(g, s, cam, {
      pal: 'day', opening: 1, bk: 'bed', base: { x: 780, y: 900, z: 1.7 },
      mid: (q) => {
        // 花坛里的新土
        q.fillStyle = '#7a4a2a'; q.fillRect(600, 1080, 400, 14);
        // （官方小人：坐在花坛的石沿上，先把种子埋好、再拿起喷壶浇水）
        const ao = { x: 700, y: 1170, h: 440, pose: bt < 2 ? 'dig' : 'kneel', seat: 90, prop: bt < 2 ? 'trowel' : null, t, expr: 'content', look: [1, 0.6], flip: false };
        adele(q, ao);
        if (SDON() && bt < 2) { const hp = anchor('adele-alter', ao, 'handN', [760, 900]); q.save(); q.translate(hp[0] + 10, hp[1]); q.rotate(0.9 + Math.sin(t * 8) * 0.15); q.fillStyle = '#8a8f9a'; q.beginPath(); q.moveTo(0, 0); q.lineTo(34, -8); q.lineTo(44, 0); q.lineTo(34, 8); q.closePath(); q.fill(); q.fillStyle = '#7a4a2a'; q.fillRect(-26, -4, 26, 8); q.restore(); }
        if (bt >= 2) { const hp = anchor('adele-alter', ao, 'handN', [760, 900]); wateringCan(q, hp[0] + 30, hp[1] - 10, 1.1, 0.3 + pour * 0.5 * (bt < 4.2 ? 1 : 0)); if (pour > 0 && bt < 4.2) for (let i = 0; i < 14; i++) { const u = fract(t * 2 + i / 14); q.fillStyle = 'rgba(150,210,240,0.9)'; q.beginPath(); q.arc(hp[0] + 130 + u * 30 + (i % 3) * 6, hp[1] - 40 + u * 170, 3.5, 0, TAU); q.fill(); } }
        // 芽：一拍冒出来
        if (grow > 0) {
          const sx = 880, sy = 1082;
          q.strokeStyle = '#4ea84e'; q.lineWidth = 7; q.beginPath(); q.moveTo(sx, sy); q.quadraticCurveTo(sx - 6, sy - 40 * grow, sx + 4, sy - 70 * grow); q.stroke();
          q.fillStyle = '#6ac86a'; q.beginPath(); q.ellipse(sx - 22 * grow, sy - 70 * grow, 22 * grow, 11 * grow, -0.5, 0, TAU); q.ellipse(sx + 26 * grow, sy - 76 * grow, 22 * grow, 11 * grow, 0.5, 0, TAU); q.fill();
          sparkle(q, sx, sy - 80, 60 * grow, 0.8 * (1 - clamp((bt - 5) / 1.5)), t, '220,255,200');
        }
        // 旁边帮忙浇水的小羊（在喷壶底下接水玩）
        lamb(q, s, 1000, 1120, 90, { id: 3612 * 16, pose: 'sit', expr: 'happy', flip: true, glow: 0.4 });
      },
    });
    if (bt > 5.4) {
      // 第二张：从上面掉下来，停在右上（她和小羊都露在外面）
      const k = ease.back(clamp((bt - 5.4) / 0.45));
      g.save(); g.fillStyle = `rgba(20,30,60,${0.2 * clamp((bt - 5.4) / 0.4)})`; g.fillRect(0, 0, VW, VH); g.restore();
      tradeCard(g, s, 1470, lerp(-400, 360, k), 0.92, 0.05, 1 + stampK, t);
      if (stampK > 0 && stampK < 1) pop(g, '咚！', 1780, 170, 1, { size: 60, color: '#e0508a' });
    }
    vig(g, s, 0.3);
  }

  /* ---------- 镜头 29 · 下午了（126.33 → 128.61）：露台上看出去，云飞快地走，太阳偏西；卡片上还空着“羊毛” ---------- */
  function shotAfternoon(g, s) {
    const t = s.t, lt = s.lt, k = clamp(lt / 2.28);
    const cam = { x: 960, y: 540, z: 1.0 + lt * 0.02 };
    terraceB(g, s, cam, {
      pal: 'day', sun: [lerp(1300, 1700, k), lerp(80, 240, k)], cloudPal: 'aft',
      sky: (q) => { for (let i = 0; i < 6; i++) { const w = 500; q.drawImage(cloud(s, 950 + i, w, 180, 'aft'), ((i * 520 + t * 380) % 3200) - 700, 100 + (i % 3) * 110, w, 180); } },
      town: (q) => { q.fillStyle = `rgba(60,70,140,${0.12 * k})`; q.fillRect(-400, 500, VW + 800, 500); },
    });
    s.post.grade(g, '#ffb070', 0.18 * k, 'soft-light');
    const cardK = clamp((lt - 0.6) / 0.5);
    if (cardK > 0) {
      tradeCard(g, s, 960, lerp(1400, 700, ease.out(cardK)), 1.0, -0.03, 2, t);
      // 第三个圈（羊毛）一闪一闪
      const p = 0.5 + 0.5 * Math.sin(t * 8);
      g.save(); g.translate(960, lerp(1400, 700, ease.out(cardK))); g.rotate(-0.03); g.strokeStyle = `rgba(255,120,170,${0.6 * p})`; g.lineWidth = 8; g.beginPath(); g.arc(215, 10, 90, 0, TAU); g.stroke(); g.restore();
      pop(g, '羊毛……？', 1300, 480, clamp((lt - 1.2) / 0.3), { size: 48, color: '#8a6ac0' });
    }
    vig(g, s, 0.3);
  }

  /* =========================================================
   * 度假区（海滨木栈道 + 泳池 + 复古的流线型建筑）：下午（aft）/ 黄昏（dusk）两套光
   * 世界 x -400..4400；栈道地面 y ≈ 1000；泳池 y 880..960；建筑底 y = 860
   * ========================================================= */
  const RESORT = [
    { x: -300, w: 420, kind: 'hotel', h: 470, col: '#fbf6ee' },
    { x: 200, w: 300, kind: 'tower', h: 560, col: '#f07aa0' },
    { x: 580, w: 520, kind: 'diner', h: 300, col: '#3ab8b8', sign: 'CAFÉ 海风' },
    { x: 1180, w: 380, kind: 'hotel', h: 520, col: '#ffe6c8' },
    { x: 1640, w: 460, kind: 'shop', h: 330, col: '#ff9a7a', sign: '毛线铺' },
    { x: 2180, w: 280, kind: 'tower', h: 600, col: '#8ad0e0' },
    { x: 2540, w: 540, kind: 'diner', h: 320, col: '#f7b8d0', sign: 'HOTEL SIESTA' },
    { x: 3160, w: 420, kind: 'hotel', h: 480, col: '#e8f0ff' },
    { x: 3660, w: 300, kind: 'tower', h: 540, col: '#ffd27a' },
    { x: 4040, w: 460, kind: 'shop', h: 320, col: '#b8e8c8', sign: '冰淇淋' },
  ];
  function resortPal(pal) {
    return pal === 'dusk'
      ? { tint: 'rgba(255,120,150,0.3)', shade: 'rgba(80,40,120,0.34)', win: '#8a5aa0', winHi: 'rgba(255,190,220,0.6)', ink: 'rgba(60,30,70,0.8)', rim: 'rgba(255,210,170,0.8)' }
      : { tint: 'rgba(255,220,170,0.12)', shade: 'rgba(70,90,160,0.16)', win: '#44668c', winHi: 'rgba(180,220,245,0.6)', ink: 'rgba(52,52,86,0.8)', rim: 'rgba(255,255,255,0.7)' };
  }
  function retroBuilding(q, b, pal) {
    const P = resortPal(pal), base = 860, top = base - b.h, { x, w } = b, ink = P.ink;
    q.lineJoin = 'round';
    if (b.kind === 'tower') {
      // 圆柱形的塔楼：一圈圈横向的窗带，顶上一个圆盘
      q.fillStyle = b.col; q.fillRect(x, top, w, b.h);
      q.fillStyle = hg(q, x, x + w, [[0, 'rgba(255,255,255,0.35)'], [0.35, 'rgba(255,255,255,0.05)'], [0.7, 'rgba(0,0,0,0)'], [1, P.shade]]); q.fillRect(x, top, w, b.h);
      for (let y = top + 50; y < base - 60; y += 70) { q.fillStyle = P.win; q.fillRect(x + 6, y, w - 12, 26); q.fillStyle = P.winHi; q.fillRect(x + 6, y, w * 0.35, 26); q.strokeStyle = '#fbf6ee'; q.lineWidth = 4; for (let i = 1; i < 6; i++) { q.beginPath(); q.moveTo(x + i * w / 6, y); q.lineTo(x + i * w / 6, y + 26); q.stroke(); } }
      q.fillStyle = '#fbf6ee'; q.beginPath(); q.ellipse(x + w / 2, top, w * 0.62, 20, 0, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
      q.fillStyle = b.col; q.fillRect(x + w / 2 - 6, top - 70, 12, 60); q.beginPath(); q.arc(x + w / 2, top - 74, 12, 0, TAU); q.fill();
      q.strokeStyle = ink; q.lineWidth = 3; q.strokeRect(x, top, w, b.h);
    } else if (b.kind === 'diner') {
      // 流线型的餐厅：一侧是圆角，横向的装饰线，屋顶上竖着招牌
      q.fillStyle = b.col; q.beginPath(); q.moveTo(x, base); q.lineTo(x, top + 40); q.quadraticCurveTo(x, top, x + 40, top); q.lineTo(x + w - 120, top); q.arc(x + w - 120, top + 120, 120, -PI / 2, 0); q.lineTo(x + w, base); q.closePath(); q.fill();
      q.fillStyle = '#fbf6ee'; for (const yy of [top + 36, top + 52]) q.fillRect(x + 20, yy, w - 60, 8);
      q.fillStyle = P.win; rrect(q, x + 30, top + 110, w - 80, b.h - 170, 18); q.fill(); q.fillStyle = P.winHi; q.beginPath(); q.moveTo(x + 40, top + 240); q.lineTo(x + 240, top + 120); q.lineTo(x + 300, top + 120); q.lineTo(x + 100, top + 240); q.closePath(); q.fill();
      q.strokeStyle = '#fbf6ee'; q.lineWidth = 5; for (let i = 1; i < 6; i++) { q.beginPath(); q.moveTo(x + 30 + i * (w - 80) / 6, top + 110); q.lineTo(x + 30 + i * (w - 80) / 6, base - 60); q.stroke(); }
      // 条纹雨篷
      for (let i = 0; i < 10; i++) { q.fillStyle = i % 2 ? '#fffaf2' : '#e0506a'; q.fillRect(x + 20 + i * (w - 40) / 10, top + 76, (w - 40) / 10, 30); }
      q.fillStyle = P.shade; q.fillRect(x + 20, top + 106, w - 40, 14);
      q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.moveTo(x, base); q.lineTo(x, top + 40); q.quadraticCurveTo(x, top, x + 40, top); q.lineTo(x + w - 120, top); q.arc(x + w - 120, top + 120, 120, -PI / 2, 0); q.lineTo(x + w, base); q.stroke();
      // 屋顶的招牌（霓虹灯管的字，白天不亮）
      const sw = Math.max(220, b.sign.length * 44 + 60);
      q.fillStyle = '#2a3048'; q.fillRect(x + 60, top - 90, 8, 90); q.fillRect(x + 60 + sw - 8, top - 90, 8, 90);
      q.fillStyle = '#fffaf2'; rrect(q, x + 50, top - 150, sw, 76, 18); q.fill(); q.strokeStyle = ink; q.stroke();
      E.text(q, b.sign, x + 50 + sw / 2, top - 97, { size: 40, weight: 900, font: /[A-Z]/.test(b.sign) ? 'display' : 'serif', color: '#e0506a', spacing: 2 });
    } else if (b.kind === 'shop') {
      q.fillStyle = b.col; q.fillRect(x, top, w, b.h);
      q.fillStyle = P.shade; q.fillRect(x + w * 0.85, top, w * 0.15, b.h);
      q.fillStyle = '#fbf6ee'; q.fillRect(x - 8, top - 14, w + 16, 16);
      q.fillStyle = P.win; q.fillRect(x + 40, top + 150, w - 180, b.h - 190); q.fillStyle = P.winHi; q.fillRect(x + 50, top + 160, 60, b.h - 210);
      q.fillStyle = '#3a8ad0'; archPath(q, x + w - 80, base - 80, 80, 160); q.fill(); q.strokeStyle = ink; q.lineWidth = 2.5; q.stroke();
      for (let i = 0; i < 8; i++) { q.fillStyle = i % 2 ? '#fffaf2' : '#3ab0a0'; q.beginPath(); q.moveTo(x + 20 + i * (w - 40) / 8, top + 110); q.lineTo(x + 20 + (i + 1) * (w - 40) / 8, top + 110); q.lineTo(x + 26 + (i + 1) * (w - 40) / 8, top + 148); q.lineTo(x + 26 + i * (w - 40) / 8, top + 148); q.closePath(); q.fill(); }
      q.fillStyle = '#fffaf2'; rrect(q, x + w / 2 - 120, top + 30, 240, 64, 14); q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
      E.text(q, b.sign, x + w / 2, top + 76, { size: 38, weight: 900, color: '#c0406a', spacing: 6 });
      q.strokeStyle = ink; q.lineWidth = 3; q.strokeRect(x, top, w, b.h);
    } else {
      // 白色的旅馆：圆窗 + 一层层阳台
      q.fillStyle = b.col; q.fillRect(x, top, w, b.h);
      q.fillStyle = P.shade; q.fillRect(x + w * 0.8, top, w * 0.2, b.h);
      q.fillStyle = '#fbf6ee'; q.fillRect(x - 10, top - 12, w + 20, 14);
      for (let f = 0; f < Math.floor((b.h - 80) / 110); f++) {
        const y = top + 40 + f * 110;
        for (let c = 0; c < 3; c++) { const wx = x + 60 + c * (w - 120) / 2; q.fillStyle = P.win; q.beginPath(); q.arc(wx, y + 26, 20, 0, TAU); q.fill(); q.strokeStyle = '#fbf6ee'; q.lineWidth = 5; q.stroke(); q.fillStyle = P.winHi; q.beginPath(); q.arc(wx - 6, y + 20, 7, 0, TAU); q.fill(); }
        q.fillStyle = 'rgba(255,255,255,0.9)'; q.fillRect(x - 6, y + 70, w + 12, 8); q.strokeStyle = '#fbf6ee'; q.lineWidth = 3; for (let i = 0; i <= 14; i++) { q.beginPath(); q.moveTo(x + i * w / 14, y + 70); q.lineTo(x + i * w / 14, y + 50); q.stroke(); } q.beginPath(); q.moveTo(x - 6, y + 50); q.lineTo(x + w + 6, y + 50); q.stroke();
        q.fillStyle = P.shade; q.fillRect(x, y + 78, w, 10);
      }
      q.strokeStyle = ink; q.lineWidth = 3; q.strokeRect(x, top, w, b.h);
    }
    if (pal === 'dusk') { q.fillStyle = P.tint; q.fillRect(x - 10, top - 160, w + 20, b.h + 160); }
  }
  function resortRow(q, a, b, pal) {
    for (const bd of RESORT) if (bd.x + bd.w + 200 > a && bd.x - 200 < b) retroBuilding(q, bd, pal);
    // 楼前的泳池平台（白）
    q.fillStyle = pal === 'dusk' ? '#e8c8d8' : '#fbf8f2'; q.fillRect(a - 2, 856, b - a + 4, 30);
  }
  function resortPool(q, a, b, pal) {
    const D2 = pal === 'dusk';
    q.fillStyle = D2 ? vg(q, 880, 970, [[0, '#6ac0d8'], [1, '#3a90c0']]) : vg(q, 880, 970, [[0, '#6ae0e8'], [1, '#2ab8d8']]); q.fillRect(a - 2, 884, b - a + 4, 86);
    q.fillStyle = D2 ? '#f0d0e0' : '#ffffff'; q.fillRect(a - 2, 880, b - a + 4, 8); q.fillRect(a - 2, 966, b - a + 4, 8);
    // 池边的躺椅（白色的架子 + 条纹垫子 + 立起来的靠背），隔一张放一条毛巾
    for (let x = Math.floor(a / 360) * 360 + 120; x < b; x += 360) {
      const n = Math.round(x / 360), stripe = D2 ? ['#f4c0d8', '#fff0f6'] : n % 2 ? ['#3ab8c8', '#ffffff'] : ['#f07aa0', '#ffffff'];
      q.strokeStyle = D2 ? '#8a6a8a' : '#8a96a8'; q.lineWidth = 3; q.lineCap = 'round';
      q.beginPath(); q.moveTo(x + 10, 878); q.lineTo(x + 14, 866); q.moveTo(x + 104, 878); q.lineTo(x + 100, 866); q.moveTo(x + 128, 878); q.lineTo(x + 122, 862); q.stroke();
      q.fillStyle = D2 ? '#e8d8e8' : '#fbfaf6'; rrect(q, x, 858, 124, 9, 4); q.fill();
      for (let i = 0; i < 8; i++) { q.fillStyle = stripe[i % 2]; q.fillRect(x + 4 + i * 11, 851, 11, 8); }
      q.save(); q.translate(x + 92, 858); q.rotate(-0.95);
      for (let i = 0; i < 4; i++) { q.fillStyle = stripe[i % 2]; q.fillRect(i * 11, -8, 11, 8); }
      q.strokeStyle = 'rgba(40,40,70,0.5)'; q.lineWidth = 1.5; q.strokeRect(0, -8, 44, 8);
      q.restore();
      q.strokeStyle = 'rgba(40,40,70,0.5)'; q.lineWidth = 1.5; q.strokeRect(x + 4, 851, 88, 8);
      if (n % 2) { q.fillStyle = D2 ? '#ffd0a0' : '#ffd24a'; rrect(q, x + 20, 846, 40, 7, 3); q.fill(); }
      q.lineCap = 'butt';
    }
  }
  function boardwalk(q, a, b, pal) {
    const D2 = pal === 'dusk';
    q.fillStyle = D2 ? vg(q, 974, 1100, [[0, '#c8806a'], [1, '#8a4a5a']]) : vg(q, 974, 1100, [[0, '#d8a070'], [1, '#b87c50']]); q.fillRect(a - 2, 974, b - a + 4, 140);
    q.strokeStyle = 'rgba(90,40,30,0.35)'; q.lineWidth = 2;
    for (let y = 990; y < 1110; y += 18) { q.beginPath(); q.moveTo(a, y); q.lineTo(b, y); q.stroke(); }
    for (let r = 0; r < 7; r++) { const y = 974 + r * 18, off = (r % 2) * 90; for (let x = Math.floor((a - off) / 180) * 180 + off; x < b; x += 180) { q.beginPath(); q.moveTo(x, y); q.lineTo(x, y + 18); q.stroke(); } }
    q.fillStyle = D2 ? 'rgba(255,200,170,0.3)' : 'rgba(255,240,210,0.4)'; q.fillRect(a - 2, 974, b - a + 4, 4);
  }
  function resortSky(q, pal) {
    q.fillStyle = pal === 'dusk'
      ? vg(q, 0, 900, [[0, '#3a3080'], [0.25, '#7a4a9a'], [0.5, '#d86aa0'], [0.72, '#ff9aa0'], [0.88, '#ffc0a0'], [1, '#ffd8b8']])
      : vg(q, 0, 900, [[0, '#3a8ad8'], [0.45, '#78bcea'], [0.8, '#cfe8f2'], [1, '#f6eede']]);
    q.fillRect(0, 0, VW, 900);
  }
  /** 度假区一整套（相机 cam；o: { pal, walk(q), front(q), sky(q), far(q) } ） */
  function resortW(g, s, cam, o = {}) {
    const t = s.t, pal = o.pal || 'aft', DU = pal === 'dusk';
    g.drawImage(LC(s, 'resort-sky-' + pal, VW, 900, (q) => resortSky(q, pal), 0.25), 0, 0, VW, 1080);
    inCam(g, cam, 0.05, (q) => {
      if (DU) { E.glow(q, 1500, 700, 500, '255,190,150', 0.5, 'screen', false); q.fillStyle = '#fff2d8'; q.beginPath(); q.arc(1500, 720, 60, 0, TAU); q.fill(); }
      else sun(q, 1650, 120, 42, 1);
      for (let i = 0; i < 6; i++) { const w = 420 + hash(961, i) * 320, x = ((hash(962, i) * 3400 + t * (6 + hash(963, i) * 6)) % 3400) - 800; q.drawImage(cloud(s, 960 + i, Math.round(w), Math.round(w * 0.36), DU ? 'dusk' : 'aft'), x, 60 + hash(964, i) * 320, w, w * 0.36); }
      if (o.sky) o.sky(q);
    });
    // 远处：火山（黄昏时冒着一大柱粉色的烟）
    inCam(g, cam, 0.12, (q) => {
      q.drawImage(LC(s, DU ? 'town-volc-dusk' : 'town-volc', 1920, 700, DU ? townVolcDusk : townVolc, 0.5), 1500 - 1300, 190, 1920, 700);
      if (DU) bigPlume(q, t, 1500, 282, 1.3); else plume(q, t, 1500, 282, 1.2, { a: 0.5 });
    });
    if (o.far) inCam(g, cam, 0.12, o.far);
    tiled(g, s, 'resort-row-' + pal, cam, 0.7, -400, 4600, 1250, (q, a, b) => resortRow(q, a, b, pal), 0.9, 120, 780);
    inCam(g, cam, 0.7, (q) => {
      const vr = visRange(cam, 0.7);
      for (let i = 0; i < 8; i++) { const x = -150 + i * 640 + hash(971, i) * 120; if (x < vr[0] - 300 || x > vr[1] + 300) continue; if (o.palmSkip && x > o.palmSkip[0] && x < o.palmSkip[1]) continue; palm(q, x, 866, 540 + hash(972, i) * 140, t + i, { seed: 970 + i, lean: (hash(973, i) - 0.5) * 0.3, col: DU ? '#3a1e40' : undefined }); }
      if (DU) { // 霓虹灯亮了
        for (const b of RESORT) { if (b.kind !== 'diner' || b.x > vr[1] || b.x + b.w < vr[0]) continue; const sw = Math.max(220, b.sign.length * 44 + 60), sx = b.x + 50 + sw / 2, sy = 860 - b.h - 112; E.glow(q, sx, sy, sw * 0.8, '255,120,170', 0.4 + 0.1 * Math.sin(t * 7)); }
      }
    });
    tiled(g, s, 'resort-pool-' + pal, cam, 0.92, -400, 4600, 1250, (q, a, b) => resortPool(q, a, b, pal), 1, 830, 150);
    inCam(g, cam, 0.92, (q) => {
      // 池水的光纹（焦散）：几条随时间扭动的亮线
      const vr = visRange(cam, 0.92);
      q.strokeStyle = DU ? 'rgba(255,220,240,0.35)' : 'rgba(255,255,255,0.55)'; q.lineWidth = 2;
      for (let i = 0; i < 26; i++) { const x0 = Math.floor(vr[0] / 160) * 160 + i * 160, y = 896 + (i % 4) * 18; if (x0 > vr[1]) break; q.beginPath(); for (let j = 0; j <= 6; j++) { const x = x0 + j * 26, yy = y + Math.sin(t * 2 + x * 0.05 + i) * 4; j ? q.lineTo(x, yy) : q.moveTo(x, yy); } q.stroke(); }
      if (o.pool) o.pool(q);
    });
    tiled(g, s, 'resort-walk-' + pal, cam, 1, -400, 4600, 1250, (q, a, b) => boardwalk(q, a, b, pal), 1, 964, 150);
    if (o.walk) inCam(g, cam, 1, o.walk);
    if (o.front) inCam(g, cam, 1.3, o.front);
    if (o.fg) for (const f of o.fg) fgFrame(g, s, cam, f[0], f[1], Object.assign({ pal: DU ? 'dusk' : 'day' }, f[2] || {}));
    if (DU) { s.post.grade(g, '#ff8aa0', 0.18, 'soft-light'); }
    else s.post.grade(g, '#ffd0a0', 0.12, 'soft-light');
  }
  function townVolcDusk(q) {
    const cx = 1300, top = 90, base = 700;
    q.fillStyle = vg(q, top, base, [[0, '#6a4a8a'], [1, '#8a5a9a']]);
    q.beginPath(); q.moveTo(200, base); q.quadraticCurveTo(900, base - 60, cx - 60, top); q.lineTo(cx - 30, top - 6); q.lineTo(cx - 6, top + 8); q.lineTo(cx + 22, top + 3); q.lineTo(cx + 54, top - 4); q.quadraticCurveTo(1700, base - 80, 2100, base); q.closePath(); q.fill();
    q.save(); q.clip(); q.fillStyle = hg(q, 600, 2000, [[0, 'rgba(255,170,150,0.4)'], [0.5, 'rgba(255,170,150,0)'], [1, 'rgba(40,20,80,0.3)']]); q.fillRect(200, top, 1900, base); q.restore();
    q.fillStyle = 'rgba(255,200,170,0.8)'; q.beginPath(); q.ellipse(cx - 3, top + 3, 50, 7, 0, 0, TAU); q.fill();
  }
  /** 黄昏的火山：一大柱粉色的烟（像官方 PV 里那样直直地升上去，再在高处散开） */
  function bigPlume(q, t, cx, cy, sc) {
    const A = q.globalAlpha;
    for (let i = 0; i < 30; i++) {
      const u = fract(t * 0.03 + i / 30);
      const px = cx + Math.sin(u * 5 + i) * 30 * sc * u + (u > 0.6 ? (u - 0.6) * (hash(981, i) - 0.5) * 900 * sc : 0);
      const py = cy - u * 620 * sc;
      const r = (40 + u * 260) * sc * (0.8 + 0.4 * hash(982, i));
      q.globalAlpha = A * 0.55 * Math.sin(PI * Math.min(1, u * 1.05 + 0.04)) * (0.7 + 0.3 * hash(983, i));
      q.drawImage(puff(i, u < 0.4 ? '255,220,236' : i % 2 ? '255,170,210' : '255,200,226'), px - r, py - r * 0.7, r * 2, r * 1.4);
    }
    q.globalAlpha = A;
    E.glow(q, cx, cy - 200 * sc, 360 * sc, '255,170,210', 0.3);
  }

  /* ---------- 羊毛（128.61 → 144.59）：毛线铺、小羊们献上的“羊毛”、泳池边的午后 ---------- */
  function yarnBall(q, x, y, r, col, rot) {
    q.save(); q.translate(x, y); q.rotate(rot);
    q.fillStyle = col; q.beginPath(); q.arc(0, 0, r, 0, TAU); q.fill();
    q.strokeStyle = 'rgba(0,0,0,0.18)'; q.lineWidth = Math.max(1.5, r * 0.08);
    for (let i = 0; i < 4; i++) { q.beginPath(); q.ellipse(0, 0, r * 0.95, r * (0.25 + i * 0.2), i * 0.8, 0, TAU); q.stroke(); }
    q.fillStyle = 'rgba(255,255,255,0.3)'; q.beginPath(); q.arc(-r * 0.35, -r * 0.35, r * 0.25, 0, TAU); q.fill();
    q.restore();
  }
  function woolShopArt(q) {
    // 毛线铺的里面（设计 1920×1080 + 边）：墙上一格格的毛线球、柜台、窗外的街
    q.fillStyle = vg(q, -100, 1100, [[0, '#f6e0cc'], [1, '#ecd0b8']]); q.fillRect(-300, -100, VW + 600, 1300);
    // 窗（右）：外面是阳光下的街
    q.fillStyle = vg(q, 160, 700, [[0, '#8ccaf0'], [1, '#e0f2f8']]); q.fillRect(1320, 160, 520, 540);
    q.fillStyle = '#f9c0d0'; q.fillRect(1360, 420, 180, 280); q.fillStyle = '#fbe6aa'; q.fillRect(1560, 380, 200, 320);
    q.fillStyle = '#44668c'; for (const [x, y] of [[1400, 460], [1470, 460], [1600, 420], [1680, 420], [1600, 520], [1680, 520]]) q.fillRect(x, y, 36, 50);
    q.strokeStyle = '#9a6a44'; q.lineWidth = 16; q.strokeRect(1320, 160, 520, 540); q.lineWidth = 8; q.beginPath(); q.moveTo(1580, 160); q.lineTo(1580, 700); q.moveTo(1320, 430); q.lineTo(1840, 430); q.stroke();
    // 墙上的格子架
    q.fillStyle = '#b07a50'; q.fillRect(-100, 100, 1300, 640);
    const cols = ['#ff8ab8', '#ffd24a', '#8ad0ff', '#b890f0', '#8ad08a', '#ff7a5a', '#fffaf2', '#f6b8d0', '#4ab0c8'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
      const x = -80 + c * 160, y = 120 + r * 155;
      q.fillStyle = '#8a5a3a'; q.fillRect(x, y, 150, 145); q.fillStyle = '#6a4228'; q.fillRect(x + 6, y + 6, 138, 133);
      for (let k = 0; k < 3; k++) yarnBall(q, x + 34 + k * 40, y + 110 - (k === 1 ? 26 : 0), 26, cols[(r * 8 + c + k) % cols.length], k);
    }
    // 柜台
    q.fillStyle = '#c89a6a'; q.fillRect(-100, 820, 1100, 40); q.fillStyle = '#a0764c'; q.fillRect(-100, 860, 1100, 240);
    q.strokeStyle = 'rgba(60,30,20,0.3)'; q.lineWidth = 3; for (let x = -60; x < 1000; x += 110) q.strokeRect(x, 880, 90, 180);
    // 地板
    q.fillStyle = '#b8845a'; q.fillRect(1000, 900, VW + 400, 300);
    q.fillStyle = 'rgba(255,240,210,0.25)'; q.beginPath(); q.moveTo(1330, 900); q.lineTo(1830, 900); q.lineTo(2100, 1200); q.lineTo(1400, 1200); q.closePath(); q.fill();
    E.text(q, '毛线铺 · 手工羊毛', 560, 70, { size: 40, weight: 900, color: '#8a4a3a', spacing: 6 });
  }
  function shotWoolShop(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: lerp(980, 1060, lt / 4.6), y: 600, z: 1.12, ...hand(s, 53, 3, 0.35) };
    g.fillStyle = '#ecd0b8'; g.fillRect(0, 0, VW, VH);
    inCam(g, cam, 1, (q) => {
      q.drawImage(LC(s, 'woolshop', VW + 600, 1300, (qq) => { qq.translate(300, 100); woolShopArt(qq); }, 1), -300, -100, VW + 600, 1300);
      additive(q, (qq) => { qq.fillStyle = 'rgba(255,236,200,0.14)'; qq.beginPath(); qq.moveTo(1320, 160); qq.lineTo(1840, 160); qq.lineTo(1500, 1100); qq.lineTo(900, 1100); qq.closePath(); qq.fill(); });
      // 店主（柜台后；金发、围裙——和银发的凯勒老师区分开）
      // 店主：雪雉（她在休闲街上开杂货铺，也卖毛线）；“卖光了”的时候摆摆手（Interact）
      townsfolk(q, s, mixIn({ x: 520, y: 1000, h: 400, seed: 54, pose: bt > 4 ? 'cover' : 'hold', prop: bt > 4 ? null : 'basket', t, flip: false, expr: bt > 4 ? 'surprise' : 'smile', look: [1, 0] }, 'hold', 4, 0.3, bt), 0);
      q.fillStyle = '#c89a6a'; q.fillRect(-100, 820, 1100, 40); q.fillStyle = '#a0764c'; q.fillRect(-100, 860, 1100, 240);
      // 她：指着毛线问
      adele(q, { x: 1180, y: 1060, h: 440, pose: bt < 4 ? 'point' : 'think', aim: -0.2, t, expr: bt < 4 ? 'talk' : 'pout', talk: bt < 4 ? 1 : 0, flip: true, look: [-1, -0.2] });
      if (bt < 3.5) speech(q, '有羊毛吗？', 1100, 560, clamp((bt - 0.3) / 0.25), { w: 320, h: 100, dx: -40, size: 44 });
      // 小羊们：一只被毛线缠住滚来滚去，一只把毛线拉成一条长线满地跑，一只看着毛线球摇头
      const r1 = t * 2.2, rx = 1480 + Math.sin(t * 1.3) * 160;
      yarnBall(q, rx, 1020, 70, '#ff8ab8', r1);
      lamb(q, s, rx, 1040, 90, { id: 3868 * 16, pose: 'jump', expr: 'happy', spin: r1, glow: 0.4 });
      q.strokeStyle = '#ffd24a'; q.lineWidth = 5; q.beginPath(); q.moveTo(900, 700); q.bezierCurveTo(1100, 1000, 1300, 900, 1700 + Math.sin(t * 2) * 80, 1000); q.stroke();
      lamb(q, s, 1700 + Math.sin(t * 2) * 80, 1010 - hop(fract(s.beat * 2))[0] * 30, 84, { id: 3870 * 16, pose: 'jump', expr: 'happy', flip: false, glow: 0.4 });
      const shake2 = bt > 4 ? Math.sin(t * 20) * 0.25 : 0;
      yarnBall(q, 760, 800, 40, '#8ad0ff', 0.3);
      lamb(q, s, 700, 818, 80, { id: 3873 * 16, pose: 'stand', expr: bt > 4 ? 'sad' : 'open', flip: true, rot: shake2, glow: 0.4 });
      if (bt > 4.2) pop(q, '不对不对', 640, 690, clamp((bt - 4.2) / 0.25), { size: 36, color: '#8a6ac0' });
    });
    vig(g, s, 0.35);
  }
  /* ---------- 镜头 31 · 这些都不是羊毛（133.17 → 137.75）：小羊们一拍一个地献上“羊毛”，一拍一个大红叉 ---------- */
  const OFFERS = ['candy', 'cloud', 'dandelion', 'pillow', 'fluff'];
  function offerItem(q, kind, x, y, sc, t) {
    q.save(); q.translate(x, y); q.scale(sc, sc);
    if (kind === 'candy') { q.strokeStyle = '#f4ecdc'; q.lineWidth = 5; q.beginPath(); q.moveTo(0, 40); q.lineTo(0, -10); q.stroke(); q.fillStyle = '#ffb6d2'; blob(q, rockPts(0, -40, 44, 36, 5, 10, 0.18)); q.fill(); q.fillStyle = 'rgba(255,255,255,0.5)'; q.beginPath(); q.arc(-14, -54, 12, 0, TAU); q.fill(); }
    else if (kind === 'cloud') { q.strokeStyle = 'rgba(80,80,110,0.7)'; q.lineWidth = 2; q.beginPath(); q.moveTo(0, 50); q.lineTo(0, 0); q.stroke(); q.fillStyle = '#ffffff'; q.beginPath(); for (const [cx, cy, r] of [[-30, -20, 24], [0, -34, 30], [30, -20, 24], [0, -10, 26]]) { q.moveTo(cx + r, cy); q.arc(cx, cy, r, 0, TAU); } q.fill(); q.strokeStyle = '#c8d8ee'; q.lineWidth = 3; q.stroke(); }
    else if (kind === 'dandelion') { q.strokeStyle = '#6ab86a'; q.lineWidth = 4; q.beginPath(); q.moveTo(0, 50); q.lineTo(0, -20); q.stroke(); q.strokeStyle = 'rgba(255,255,255,0.95)'; q.lineWidth = 2; for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; q.beginPath(); q.moveTo(0, -30); q.lineTo(Math.cos(a) * 34, -30 + Math.sin(a) * 34); q.stroke(); } q.fillStyle = '#fff'; for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; q.beginPath(); q.arc(Math.cos(a) * 34, -30 + Math.sin(a) * 34, 3, 0, TAU); q.fill(); } }
    else if (kind === 'pillow') { q.fillStyle = '#fffaf2'; rrect(q, -50, -60, 100, 70, 26); q.fill(); q.strokeStyle = '#c8b0a0'; q.lineWidth = 3; q.stroke(); q.strokeStyle = 'rgba(200,170,150,0.6)'; q.beginPath(); q.moveTo(-30, -40); q.quadraticCurveTo(0, -24, 30, -40); q.stroke(); }
    else { q.fillStyle = '#ffd0e0'; q.beginPath(); for (const [cx, cy, r] of [[-10, -20, 14], [8, -26, 16], [2, -10, 14]]) { q.moveTo(cx + r, cy); q.arc(cx, cy, r, 0, TAU); } q.fill(); }
    q.restore();
    void t;
  }
  function bigX(q, x, y, r, k) {
    if (k <= 0.01) return;
    const sc = ease.back(clamp(k * 1.5));
    q.save(); q.translate(x, y); q.scale(sc, sc); q.rotate(-0.1);
    q.strokeStyle = 'rgba(255,255,255,0.95)'; q.lineWidth = r * 0.34; q.lineCap = 'round'; q.beginPath(); q.moveTo(-r, -r); q.lineTo(r, r); q.moveTo(r, -r); q.lineTo(-r, r); q.stroke();
    q.strokeStyle = '#e8384a'; q.lineWidth = r * 0.22; q.beginPath(); q.moveTo(-r, -r); q.lineTo(r, r); q.moveTo(r, -r); q.lineTo(-r, r); q.stroke();
    q.restore(); q.lineCap = 'butt';
  }
  function shotOffers(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: 1200 + lt * 12, y: 690, z: 1.42, ...hand(s, 55, 3, 0.35) };
    resortW(g, s, cam, {
      pal: 'aft', fg: [['palm', 'tl', { depth: 1.6 }]],
      walk: (q) => {
        // 她坐在栈道边的长椅上
        bench(q, 760, 1040, 380);
        adele(q, { x: 950, y: 1040 + 60, h: 440, pose: 'sit', seat: 112, t, expr: bt > 8 ? 'laugh' : bt > 1 ? 'pout' : 'smile', flip: false, look: [1, 0.2] });
        // 小羊们排队献宝：每拍一只走上前举起，下一拍被打一个大红叉
        for (let i = 0; i < OFFERS.length; i++) {
          const b0 = i * 1.5 + 0.3, a = bt - b0;
          if (a < -0.8 || a > 3.2) continue;
          const x = 1200 + (a < 0 ? (-a) * 200 : 0) + (a > 1.4 ? (a - 1.4) * 260 : 0), y = 1070;
          const up = clamp(a / 0.3) * (a > 1.4 ? 0 : 1);
          const bald = OFFERS[i] === 'fluff';
          lamb(q, s, x, y - hop(fract(bt * 2 + i * 0.3))[0] * 10, 110, { id: 3914 * 16 + i, pose: a > 1.4 ? 'walk' : 'stand', expr: a > 1.2 ? 'sad' : 'happy', flip: a > 1.4 ? false : true, glow: 0.4 });
          if (bald && a > 0) { q.fillStyle = '#ffe8d8'; q.beginPath(); q.ellipse(x + 14, y - 74, 16, 12, 0, 0, TAU); q.fill(); q.strokeStyle = '#e8a0b8'; q.lineWidth = 2; q.stroke(); }
          if (a < 1.4) offerItem(q, OFFERS[i], x - 40, y - 130 - up * 40, 1.1, t);
          bigX(q, x - 40, y - 190, 60, clamp((a - 0.75) / 0.2) * (1 - clamp((a - 1.3) / 0.2)));
        }
      },
    });
    vig(g, s, 0.3);
  }
  /* ---------- 镜头 32 · 午后（137.75 → 142.32）：泳池边的长椅，热得发晕；远处汽水铺那边“啵”地冒起一串粉泡泡 ---------- */
  function heatShimmer(g, t, y0, y1, a = 0.5) {
    // 热浪：几条缓慢上升、左右扭动的半透明亮带
    for (let i = 0; i < 10; i++) {
      const u = fract(t * 0.25 + i / 10), y = lerp(y1, y0, u);
      withAlpha(g, Math.sin(PI * u) * a * 0.35, (q) => { q.strokeStyle = 'rgba(255,250,236,1)'; q.lineWidth = 6; q.beginPath(); for (let x = -40; x <= VW + 40; x += 60) { const yy = y + Math.sin(x * 0.012 + t * 3 + i) * 6; x === -40 ? q.moveTo(x, yy) : q.lineTo(x, yy); } q.stroke(); });
    }
  }
  function shotPoolside(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: 2300 + lt * 10, y: 660, z: 1.28, ...hand(s, 57, 2, 0.25) };
    resortW(g, s, cam, {
      pal: 'aft', fg: [['palm', 'tl', { depth: 1.6 }]],
      far: (q) => {
        // 远处（汽水铺那边）：“啵”地冒起一串粉泡泡（番外 V 的事，这里只是远远一瞥）
        const pk = clamp((bt - 3) / 2.5);
        if (pk > 0) for (let i = 0; i < 16; i++) { const u = clamp(pk * 1.3 - i * 0.04), bx = 2900 + hash(991, i) * 120 - 40, by = 700 - u * 420 - hash(992, i) * 60; if (u > 0 && u < 1) bubble(q, bx + Math.sin(u * 8 + i) * 16, by, 8 + hash(993, i) * 14, Math.sin(PI * u) * 0.9); }
      },
      walk: (q) => {
        bench(q, 2150, 1040, 380);
        const look = bt > 3.2 && bt < 6;
        adele(q, { x: 2330, y: 1100, h: 440, pose: 'sit', seat: 112, arms: look ? 'rest' : 'wave', t, expr: look ? 'surprise' : 'sleepy', flip: false, look: look ? [1, -0.6] : [0.2, 0.4] });
        // 摊在地上的小羊（晒化了）
        for (let i = 0; i < 3; i++) lamb(q, s, 2560 + i * 110, 1060, 80, { id: 3946 * 16 + i, pose: 'sleep', expr: 'closed', flip: i % 2 === 0, glow: 0.3, sq: 0.25 + 0.05 * Math.sin(t * 2 + i) });
        if (bt > 3.2) pop(q, '啵！', 2860, 540, clamp((bt - 3.2) / 0.25) * (1 - clamp((bt - 5.2) / 0.4)), { size: 40, color: '#ff6f9c' });
      },
    });
    heatShimmer(g, t, 300, 900, 0.8);
    vig(g, s, 0.3);
  }
  /* ---------- 镜头 33 · 打个盹（142.32 → 144.59）：她靠在椅背上睡着了，膝上蜷着两只小羊；卡片滑下去，被一只小羊叼住 ---------- */
  function shotDoze(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 2330, y: 780, z: 2.2 + lt * 0.03, ...hand(s, 59, 2, 0.25) };
    resortW(g, s, cam, {
      pal: 'aft', palmSkip: [1700, 2000], // 特写里那棵棕榈（x ≈ 1770..1890，景深 0.7）的树干正好竖在她头顶上：这个镜头里不画它

      walk: (q) => {
        bench(q, 2150, 1040, 380);
        // 正面坐着，头歪向一边睡着了（看得见闭着的眼睛）
        adele(q, { x: 2330, y: 1100, h: 440, pose: 'sit', seat: 112, arms: 'lap', view: 'front', headPose: 'tilt', t, expr: 'closed', flip: false });
        // 膝上蜷着的两只小羊（官方小羊大一圈：放低一点、小一点，不挡她的脸）
        for (let i = 0; i < 2; i++) lamb(q, s, 2290 + i * 80, SDON() ? 1004 + i * 6 : 900 + i * 6, SDON() ? 50 : 64, { id: 3965 * 16 + i, pose: 'sleep', expr: 'closed', flip: i === 1, glow: 0.3 });
        const fall = clamp((lt - 0.6) / 0.6);
        const cx = lerp(2360, 2480, fall), cy = lerp(930, 1040, ease.in(fall));
        tradeCard(q, s, cx, cy, 0.16, fall * 1.2, 2, t);
        if (fall >= 1) lamb(q, s, 2500, 1080, 70, { id: 3969 * 16, pose: 'stand', expr: 'happy', flip: true, glow: 0.4 });
        for (let i = 0; i < 3; i++) { const u = fract(lt * 0.6 + i / 3); withAlpha(q, Math.sin(PI * u) * 0.8, (qq) => E.text(qq, 'z', 2380 + u * 50 + i * 6, 700 - u * 80, { font: 'hand', size: 22 + u * 20, color: '#6a7aa0' })); }
      },
    });
    heatShimmer(g, t, 300, 900, 0.5);
    vig(g, s, 0.35);
  }

  /* =========================================================
   * 手忙脚乱（144.59 → 162.60）：广场上正在为晚上的灯会做准备，小羊们来“帮忙”
   * ========================================================= */
  const LANTERN_COL = [['#ff6a5a', '#b82a3a', '255,150,90'], ['#ffb0cc', '#d0507a', '255,160,200'], ['#ffd27a', '#c8842a', '255,210,130'], ['#c9a8ff', '#7a5ac0', '210,170,255']];
  /** 纸灯笼（与「雾中之忆」同款）：lit 0..1（白天不点，夜里点亮） */
  const lanternArt = (ci, lit) => (q) => {
    const [c1, c2] = LANTERN_COL[ci];
    q.strokeStyle = '#3a1a22'; q.lineWidth = 2; q.beginPath(); q.moveTo(32, 0); q.lineTo(32, 16); q.stroke();
    q.fillStyle = '#3a1a22'; q.fillRect(20, 14, 24, 7); q.fillRect(22, 72, 20, 6);
    q.fillStyle = lit ? rg(q, 27, 40, 2, 34, [[0, '#fff6d8'], [0.4, c1], [1, c2]]) : rg(q, 24, 36, 2, 34, [[0, '#ffffff'], [0.3, mixC(c1, '#ffffff', 0.3)], [1, mixC(c2, c1, 0.4)]]);
    q.beginPath(); q.ellipse(32, 46, 26, 28, 0, 0, TAU); q.fill();
    q.strokeStyle = 'rgba(90,30,30,0.55)'; q.lineWidth = 1.6; for (const k of [0.4, 0.75]) { q.beginPath(); q.ellipse(32, 46, 26 * k, 28, 0, 0, TAU); q.stroke(); } q.beginPath(); q.moveTo(32, 18); q.lineTo(32, 74); q.stroke();
    q.strokeStyle = '#3a1a22'; q.lineWidth = 2; q.beginPath(); q.ellipse(32, 46, 26, 28, 0, 0, TAU); q.stroke();
    q.strokeStyle = '#e0404a'; q.lineWidth = 3; q.beginPath(); q.moveTo(32, 78); q.lineTo(32, 90); q.stroke();
  };
  function lanternD(g, s, x, y, h, ci, swing, lit = 0) {
    const sc = h / 92;
    g.save(); g.translate(x, y); g.rotate(swing); g.scale(sc, sc);
    g.drawImage(LC(s, 'lantern-d' + ci, 64, 92, lanternArt(ci, false), 2), -32, 0, 64, 92);
    if (lit > 0) { g.globalAlpha *= lit; g.drawImage(LC(s, 'lantern-n' + ci, 64, 92, lanternArt(ci, true), 2), -32, 0, 64, 92); }
    g.restore();
    if (lit > 0) { const gx = x - Math.sin(swing) * h * 0.5, gy = y + Math.cos(swing) * h * 0.5; E.glow(g, gx, gy, h * 1.5, LANTERN_COL[ci][2], 0.5 * lit); E.glow(g, gx, gy, h * 0.45, '255,245,220', 0.5 * lit); }
  }
  function lanternString(g, s, t, x0, y0, x1, y1, sag, n, seed, o = {}) {
    const wob = wobble(seed, t * 0.4) * 10 + (o.wind || 0);
    g.strokeStyle = o.wire || 'rgba(60,40,50,0.8)'; g.lineWidth = o.lw || 2;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag + wob;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
    for (let i = 1; i <= n; i++) {
      if (o.skip && o.skip(i)) continue;
      const u = i / (n + 1), x = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * mx + u * u * x1, y = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * my + u * u * y1;
      lanternD(g, s, x, y, (o.size || 40) * (0.85 + 0.3 * hash(seed, i, 1)), (seed + i) % 4, Math.sin(t * 1.3 + i * 0.9 + seed) * 0.08 + wob * 0.004, o.lit ? o.lit(i, x) : 0);
    }
  }
  /** 广场上的小舞台 */
  function stage(q, x, y, w) {
    q.fillStyle = '#b07a50'; q.fillRect(x, y - 90, w, 90); q.fillStyle = '#c89a6a'; q.fillRect(x - 10, y - 100, w + 20, 14);
    q.strokeStyle = 'rgba(60,30,20,0.35)'; q.lineWidth = 3; for (let i = 1; i < 4; i++) { q.beginPath(); q.moveTo(x, y - 90 + i * 22); q.lineTo(x + w, y - 90 + i * 22); q.stroke(); }
    q.fillStyle = '#e0506a'; q.fillRect(x, y - 100, w, 12);
    q.strokeStyle = INK_D; q.lineWidth = 3; q.strokeRect(x - 10, y - 100, w + 20, 14); q.strokeRect(x, y - 88, w, 88);
  }
  /** 装灯笼的纸箱 */
  function lanternBox(q, x, y, sc, open) {
    q.save(); q.translate(x, y); q.scale(sc, sc);
    q.fillStyle = '#d8b07a'; q.fillRect(-60, -70, 120, 70); q.strokeStyle = '#8a6a40'; q.lineWidth = 3; q.strokeRect(-60, -70, 120, 70);
    q.fillStyle = '#c8a06a'; q.save(); q.translate(-60, -70); q.rotate(-open * 1.2); q.fillRect(0, -4, 60, 8); q.restore(); q.save(); q.translate(60, -70); q.rotate(open * 1.2); q.fillRect(-60, -4, 60, 8); q.restore();
    E.text(q, '灯笼 · 小心轻放', 0, -28, { size: 13, weight: 900, color: '#8a4a2a' });
    q.restore();
  }
  function squareSigns(h) { return h.x > 3000 && h.x < 3300 ? (q, hh, dx) => shopSign(q, hh, dx, '面包', '#e0a040') : null; }
  /* ---------- 镜头 34 · 灯会准备（144.59 → 148.90）：广场上挂灯笼、搭台子；她抱着一箱灯笼——箱子里冒出一群小羊 ---------- */
  function shotPrep(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: lerp(3300, 3460, lt / 4.3), y: 600, z: 1.05, ...hand(s, 61, 4, 0.4) };
    const burst = s.shot.t0 + BEAT * 4;
    townD(g, s, cam, {
      volcX: 3200, signs: squareSigns,
      mid: (q) => { for (let i = 0; i < 3; i++) lanternString(q, s, t, 2700 + i * 420, 420 + (i % 2) * 30, 3100 + i * 420, 430, 60, 5, 20 + i, { size: 30 }); },
      street: (q0) => {
        tiled(q0, s, 'square', cam, 1, 2400, 4700, 1150, (q, a, b) => paving(q, a, b, 880, 1100, 91), 1, 870, 240);
        inCam(q0, cam, 1, (q) => {
          stage(q, 3620, 940, 520);
          bunting(q, t, 3600, 780, 4160, 780, 40, 14, 11);
          // 梯子上挂灯笼的人
          q.strokeStyle = '#8a6a50'; q.lineWidth = 8; q.beginPath(); q.moveTo(2930, 1000); q.lineTo(3010, 660); q.moveTo(3010, 1000); q.lineTo(3090, 660); q.stroke(); q.lineWidth = 5; for (let i = 1; i < 7; i++) { const u = i / 7; q.beginPath(); q.moveTo(2930 + u * 80, 1000 - u * 340); q.lineTo(3010 + u * 80, 1000 - u * 340); q.stroke(); }
          // 扶着梯子、抬手指挥挂灯笼的苍苔（官方小人爬不了梯子：站在梯子旁边）
          if (sdOn(s, CAMEOS[2])) townsfolk(q, s, { x: 3120, y: 1010, h: 320, pose: 'reach-up', t, flip: true }, 2);
          else person(q, { x: 3050, y: 760, h: 300, seed: 4, pose: 'reach-up', t, flip: false, expr: 'smile' });
          lanternString(q, s, t, 2980, 540, 3500, 520, 50, 5, 31, { size: 44 });
          // 凯勒老师拿着单子指挥
          // 凯勒老师拿着单子指挥（抬头看灯笼 → 转头招呼她）；箱子里冒出小羊时一愣
          const pt0 = s.shot.t0;
          kellerCard(q, s, {
            x: 3760, y: 1085, h: 560, crop: 'upper', expr: [[pt0 - 1, 3], [pt0 + 1.0, 8], [burst + 0.1, 4]], mouth: talkK([[pt0 + 0.05, pt0 + 0.9], [pt0 + 1.1, burst - 0.15]], 5),
            look: E.keyart && E.keyart.path ? E.keyart.path([[pt0, [-0.2, -0.45]], [pt0 + 0.9, [-0.3, -0.4]], [pt0 + 1.4, [-0.6, 0.1]], [burst, [-0.6, 0.1]], [burst + 0.3, [-0.5, 0.35]]]) : [-0.5, 0],
          }, (qq) => keller(qq, { x: 3700, y: 1000, h: 420 * KH(), pose: 'point', aim: -0.3, prop: 'notebook', t, expr: 'talk', flip: true, look: [-1, -0.2] }, s));
          // 她：抱着一箱灯笼走过来；第 5 拍，箱子里“噗”地冒出一群小羊，每只抢一个灯笼
          const ax = lerp(3160, 3380, clamp(lt / 1.7));
          const ao = { x: ax, y: 1030, h: 440, pose: lt < 1.7 ? 'walk' : t < burst ? 'hold' : 'cover', speed: stepRate('adele-alter', 440, 220 / 1.7), arms: lt < 1.7 ? 'hold' : undefined, t, expr: t < burst ? 'smile' : 'surprise', flip: false, look: [1, 0.3] };
          mixIn(ao, 'walk', 1.7, 0.25, lt);
          adele(q, ao);
          // （官方小人：箱子提在手边）
          const hp = anchor('adele-alter', SDON() ? ao : Object.assign({}, ao, { pose: 'hold' }), 'handN', [ax + 20, 820]);
          lanternBox(q, hp[0] + 10, hp[1] + (SDON() ? 62 : 40), SDON() ? 1.05 : 1.3, t > burst ? 1 : 0);
          const a = t - burst;
          if (a > 0) {
            poof(q, hp[0] + 10, hp[1] - 40, 140, clamp(a / 0.6), 13);
            for (let i = 0; i < 5; i++) {
              const ang = -PI / 2 + (i - 2) * 0.45, v = 500 + i * 30;
              const lx = hp[0] + 10 + Math.cos(ang) * v * Math.min(a, 1.2), ly = hp[1] - 40 + Math.sin(ang) * v * Math.min(a, 1.2) + 380 * Math.min(a, 1.2) * Math.min(a, 1.2);
              lamb(q, s, lx, ly, 74, { id: 4066 * 16 + i, pose: 'jump', expr: 'happy', glow: 0.5, spin: a * 3 * (i % 2 ? 1 : -1) });
              lanternD(q, s, lx + 20, ly - 90, 44, i % 4, Math.sin(t * 5 + i) * 0.2);
            }
          }
        });
      },
    });
    vig(g, s, 0.3);
  }
  /* ---------- 镜头 35 · 灯笼气球（148.90 → 153.46）：小羊抓着灯笼，像气球一样一个接一个飘上天；游客们以为是表演 ---------- */
  function shotLanternRide(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const up = ease.inOut(clamp((lt - 0.4) / 3.8));
    const cam = { x: 3400, y: lerp(640, 240, up), z: 1.0, ...hand(s, 63, 4, 0.4) };
    townD(g, s, cam, {
      volcX: 3200, signs: squareSigns,
      far: (q) => void q,
      street: (q0) => {
        tiled(q0, s, 'square', cam, 1, 2400, 4700, 1150, (q, a, b) => paving(q, a, b, 880, 1100, 91), 1, 870, 240);
        inCam(q0, cam, 1, (q) => {
          stage(q, 3620, 940, 520);
          // 围观鼓掌的游客
          for (const i of [0, 2, 4, 1, 3]) townsfolk(q, s, mixIn({ x: 2780 + i * 165 + (i > 2 ? 420 : 0), y: 1010 + (i % 2) * 20, h: 300, seed: TOURISTS[(i * 5 + 8) % TOURISTS.length], pose: bt > 2 ? 'clap' : 'stand', aim: -0.8, t: t + i, flip: i > 2, expr: 'laugh', look: [0, -1] }, 'stand', 2, 0.3, bt), i + 1);
          // 她：跳起来去够最后一只（没够着）
          // （官方小人：先抬手去够，第 2 拍起一拍一跳）
          const jump = SDON() ? bt > 1 : fract(bt * 0.5) < 0.5 && bt > 1;
          // 伸手够 → 跳起来够（官方小人）：起跳的那一拍交叉淡化（离地弧线从 0 开始，正好接得上）
          adele(q, mixIn({ x: 3380, y: 1030, h: 440, pose: jump ? 'jump' : 'reach-up', air: jump ? (SDON() ? Math.abs(Math.sin(PI * bt)) : Math.sin(PI * fract(bt * 0.5) * 2)) : 0, t, expr: jump ? 'determined' : 'surprise', look: [0.3, -1], flip: false }, { pose: 'reach-up', air: 0 }, 1, 0.2, bt)); // from 的 air 要清零：离地的非 jump 姿势官方小人不接
          // 一串抓着灯笼往上飘的小羊（一拍一颠）
          for (let i = 0; i < 7; i++) {
            const st = i * 0.35, a = Math.max(0, lt - st);
            const x = 3300 + i * 70 + Math.sin(t * 1.6 + i) * 40, y = 700 - a * 170 - i * 20 + hop(fract(s.beat + i * 0.2))[0] * -10;
            if (a <= 0) continue;
            lanternD(q, s, x, y - 110, 56, i % 4, Math.sin(t * 2 + i) * 0.15);
            q.strokeStyle = 'rgba(60,40,50,0.6)'; q.lineWidth = 1.5; q.beginPath(); q.moveTo(x, y - 110); q.lineTo(x, y - 60); q.stroke();
            lamb(q, s, x, y, 70, { id: 4100 * 16 + i, pose: 'float', expr: 'happy', glow: 0.5 });
          }
        });
      },
    });
    vig(g, s, 0.3);
  }
  /* ---------- 镜头 36 · 彩旗（153.46 → 158.04）：小羊在彩旗绳上荡秋千；绳子一断，彩旗落了她一身 ---------- */
  function shotBunting(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const snap = s.shot.t0 + BEAT * 5, a = t - snap;
    const cam = { x: 3440, y: 620, z: 1.25, ...(a > 0 && a < 0.4 ? shake(s, 10, 65) : hand(s, 65, 3, 0.4)) };
    townD(g, s, cam, {
      volcX: 3200, signs: squareSigns,
      street: (q0) => {
        tiled(q0, s, 'square', cam, 1, 2400, 4700, 1150, (q, a2, b) => paving(q, a2, b, 880, 1100, 91), 1, 870, 240);
        inCam(q0, cam, 1, (q) => {
          // 三条彩旗绳，小羊一拍荡到下一条
          for (let r = 0; r < 3; r++) {
            const y = 440 + r * 110, broken = r === 2 && a > 0;
            if (!broken) bunting(q, t, 2900, y, 3980, y + 20, 80, 18, 21 + r, { size: 40 });
            const bi = Math.floor(bt), f = fract(bt);
            const lx = 3000 + ((bi + r * 2) % 6) * 160 + f * 160, ly = y + 70 + Math.sin(f * PI) * 20;
            if (!broken && r < 2) { lamb(q, s, lx, ly + 70, 76, { id: 4123 * 16 + r, pose: 'float', expr: 'happy', glow: 0.4, rot: Math.sin(t * 6 + r) * 0.3 }); q.strokeStyle = 'rgba(60,60,90,0.6)'; q.lineWidth = 2; q.beginPath(); q.moveTo(lx, ly - 4); q.lineTo(lx - 4, ly + 20); q.stroke(); }
          }
          // 断掉的那条：彩旗纷纷落下，盖在她身上
          const ao = mixIn({ x: 3440, y: 1040, h: 440, pose: a > 0.6 ? 'cheer' : 'look-up', t, expr: a > 0.6 ? 'laugh' : 'surprise', look: [0, -1], flip: false }, 'look-up', 0.6, 0.25, a);
          adele(q, ao);
          if (a > 0) {
            for (let i = 0; i < 18; i++) {
              const u = i / 17, x0 = 2900 + u * 1080, y0 = 660 + Math.sin(PI * u) * 80;
              const fall = clamp(a / (0.5 + hash(151, i) * 0.4)), tx = 3440 + (hash(152, i) - 0.5) * 160, ty = 700 + hash(153, i) * 260;
              const x = lerp(x0, tx, ease.in(fall)) + Math.sin(a * 6 + i) * 20 * (1 - fall), y = lerp(y0, ty, ease.in(fall));
              q.save(); q.translate(x, y); q.rotate(a * 4 * (1 - fall) + hash(154, i) * 2); q.fillStyle = ['#ff6a8a', '#ffd24a', '#4ac0e0', '#7ad08a', '#b890f0', '#ffffff'][i % 6]; q.beginPath(); q.moveTo(-16, 0); q.lineTo(16, 0); q.lineTo(0, 40); q.closePath(); q.fill(); q.restore();
            }
            pop(q, '哗啦', 3660, 620, clamp(a / 0.2) * (1 - clamp((a - 1) / 0.3)), { size: 46, color: '#3a8ad0' });
          }
          // 彩旗绳“啪”地断了：她抬头 → 一愣 → 看着撒了她一身彩旗的阿黛尔笑出来
          kellerCard(q, s, {
            x: 3830, y: 1110, h: 580, crop: 'upper', expr: [[s.shot.t0 - 1, 10], [snap + 0.1, 4], [snap + 0.7, 9]],
            look: E.keyart && E.keyart.path ? E.keyart.path([[s.shot.t0, [-0.35, -0.5]], [snap, [-0.4, -0.5]], [snap + 0.35, [-0.6, 0.15]]]) : [-0.5, 0],
            tilt: (tt) => -0.6 * sst(snap + 0.7, snap + 1.2, tt), glint: (tt) => E.window01(tt, snap + 0.8, snap + 1.7, 0.2, 0.5),
          }, (qq) => keller(qq, { x: 3800, y: 1030, h: 420 * KH(), pose: a > 0.6 ? 'clap' : 'point', aim: -0.5, t, expr: a > 0.6 ? 'laugh' : 'surprise', flip: true, look: [-1, -0.3] }, s));
        });
      },
    });
    vig(g, s, 0.3);
  }
  /* ---------- 镜头 37 · 沙滩球（158.04 → 162.60）：一个个沙滩球载着小羊从台阶上一拍一级地弹下来 ---------- */
  function shotBalls(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: lerp(1300, 1100, lt / 4.6), y: lerp(420, 560, lt / 4.6), z: 1.0, ...hand(s, 67, 4, 0.45) };
    g.drawImage(LC(s, 'town-sky-d', VW, VH, townSkyD, 0.25), 0, 0, VW, VH);
    inCam(g, cam, 0.06, (q) => { for (let i = 0; i < 4; i++) q.drawImage(cloud(s, 520 + i, 420, 150, 'aft'), 200 + i * 520 + t * 8, 120 + (i % 2) * 110, 420, 150); });
    inCam(g, cam, 0.25, (q) => { q.drawImage(LC(s, 'town-volc', 1920, 700, townVolc, 0.5), 1700 - 1300, -90, 1920, 700); plume(q, t, 1700, 2, 1.3, { a: 0.5 }); q.drawImage(LC(s, 'mz-far', 700, 420, museumFar, 0.8), 1050, 120, 700, 420); });
    baked(g, s, 'stairway', { x: 1040, y: 560, z: 1.06 }, cam, 1, stairArt, 1, [-140, 0, 2400, 1200]);
    inCam(g, cam, 1, (q) => {
      // 球：从台阶顶上一个接一个弹下来（每拍一级 × 2），球上坐着小羊
      const { x0, run, n } = STAIR;
      for (let j = 0; j < 6; j++) {
        const b = bt * 2 - j * 1.4;
        if (b < 0) continue;
        const i = Math.floor(b), f = fract(b), sx0 = x0 + (n - i) * run + 40, sx1 = sx0 - run;
        if (sx1 < x0 - 400) continue;
        const x = lerp(sx0, sx1, f), y = lerp(stairY(sx0), stairY(sx1), f) - Math.sin(PI * f) * 70 - 48, r = 48;
        beachBall(q, x, y, r, -b * 1.2);
        lamb(q, s, x, y - r + 6, 58, { id: 4166 * 16 + j, pose: 'sit', expr: 'happy', glow: 0.4 });
      }
      // 她：一边躲一边往下跑
      const rv = 185, ax = 1320 - Math.min(lt, 4.4) * rv, dodge = Math.abs(Math.sin(bt * PI)) * 30;
      adele(q, { x: ax, y: stairY(ax) + 2 - dodge, h: 360, pose: 'run', t, flip: true, expr: 'surprise', look: [1, -0.4], speed: stepRate('adele-alter', 360, rv, true) });
      // 台阶下鼓掌的游客（“今天的游行真热闹！”）
      townsfolk(q, s, { x: 380, y: 1000, h: 300, seed: 44, pose: 'clap', t, expr: 'laugh', flip: false, look: [1, -0.5] }, 1);
    });
    vig(g, s, 0.3);
  }

  /* =========================================================
   * 还差羊毛（162.60 → 183.18）：沙滩、晾衣绳、叠罗汉够云、奔向栈桥
   * ========================================================= */
  function beachArt(q) {
    // 沙滩（设计 1920×1080 + 边）：海在上半，沙在下半，遮阳伞与毛巾
    q.fillStyle = vg(q, -200, 560, [[0, '#3a8ad8'], [0.6, '#8ccaf0'], [1, '#e8f4f0']]); q.fillRect(-300, -200, VW + 600, 760);
    q.fillStyle = vg(q, 540, 760, [[0, '#8adce4'], [0.3, '#3ac0d0'], [1, '#6ad8d8']]); q.fillRect(-300, 540, VW + 600, 220);
    q.fillStyle = 'rgba(255,255,255,0.7)'; q.fillRect(-300, 538, VW + 600, 3);
    q.fillStyle = vg(q, 740, 1300, [[0, '#f6e2b8'], [1, '#ecd09c']]); q.beginPath(); q.moveTo(-300, 760); for (let x = -300; x <= VW + 300; x += 60) q.lineTo(x, 750 + Math.sin(x * 0.01) * 10); q.lineTo(VW + 300, 1300); q.lineTo(-300, 1300); q.closePath(); q.fill();
    q.fillStyle = 'rgba(200,160,110,0.3)'; for (let i = 0; i < 200; i++) q.fillRect(hash(161, i) * (VW + 600) - 300, 780 + hash(162, i) * 500, 3, 2);
    for (const [x, y, c] of [[-100, 1000, '#ff7a9a'], [1700, 960, '#3ab0d0'], [2000, 1100, '#ffcc4a'], [260, 830, '#8ad07a'], [1180, 820, '#ff9a5a']]) umbrella(q, x, y, y < 900 ? 110 : 180, c, '#fffaf2', 0.1);
    q.fillStyle = '#ff9ac0'; q.save(); q.translate(1500, 1060); q.rotate(-0.1); q.fillRect(-90, -30, 180, 60); q.fillStyle = '#fff'; for (let i = 0; i < 4; i++) q.fillRect(-90 + i * 50, -30, 20, 60); q.restore();
    q.fillStyle = '#6ab8e8'; q.save(); q.translate(360, 900); q.rotate(0.08); q.fillRect(-70, -22, 140, 44); q.fillStyle = '#fffaf2'; q.fillRect(-70, -6, 140, 12); q.restore();
    // 救生员的高椅（远处）
    q.strokeStyle = '#fbfaf6'; q.lineWidth = 8; q.beginPath(); q.moveTo(820, 790); q.lineTo(850, 640); q.moveTo(900, 790); q.lineTo(870, 640); q.stroke(); q.fillStyle = '#e0505a'; q.fillRect(830, 610, 60, 34); q.fillStyle = '#fbfaf6'; q.fillRect(826, 640, 68, 8);
    // 沙堡
    q.fillStyle = '#e2c080'; q.fillRect(560, 1010, 120, 50); q.fillRect(580, 976, 30, 34); q.fillRect(630, 966, 30, 44); q.beginPath(); q.moveTo(626, 966); q.lineTo(645, 940); q.lineTo(664, 966); q.closePath(); q.fill(); q.fillStyle = '#ff5a6a'; q.beginPath(); q.moveTo(645, 940); q.lineTo(645, 912); q.lineTo(668, 920); q.closePath(); q.fill();
    // 脚印
    q.fillStyle = 'rgba(190,150,100,0.35)'; for (let i = 0; i < 12; i++) { q.beginPath(); q.ellipse(300 + i * 70, 1140 - i * 12 + (i % 2) * 14, 9, 5, 0.2, 0, TAU); q.fill(); }
  }
  /** 海里游泳的人（露出的脑袋 + 游泳圈），一上一下 */
  function swimmers(q, t) {
    for (let i = 0; i < 7; i++) {
      const x = 200 + i * 240 + Math.sin(t * 0.4 + i) * 30, y = 620 + (i % 3) * 30 + Math.sin(t * 1.6 + i * 1.3) * 5, r = 12 + (i % 3) * 3;
      if (i % 2) { q.fillStyle = pick(['#ff5a6a', '#ffd24a', '#4ac0e0'], hash(181, i)); q.beginPath(); q.ellipse(x, y + 6, r * 2.2, r * 0.8, 0, 0, TAU); q.fill(); q.fillStyle = 'rgba(255,255,255,0.8)'; q.fillRect(x - r * 2, y + 4, r * 0.8, 4); }
      q.fillStyle = pick(['#4a3a32', '#caa066', '#2f2b33', '#9a4a30'], hash(182, i)); q.beginPath(); q.arc(x, y - 4, r, PI, 0); q.fill(); q.fillStyle = '#ffe2d0'; q.beginPath(); q.arc(x, y - 1, r * 0.8, 0, PI); q.fill();
      q.strokeStyle = 'rgba(255,255,255,0.8)'; q.lineWidth = 2; q.beginPath(); q.ellipse(x, y + 8, r * 2.6, r * 0.5, 0, 0, PI); q.stroke();
    }
  }
  /** 沙子堆的羊（sculpt 0..1 堆起来的程度；wash 0..1 被浪冲掉） */
  function sandSheep(q, x, y, sc, wash) {
    q.save(); q.translate(x, y); q.scale(sc, sc * (1 - wash * 0.7));
    q.fillStyle = '#e8c890'; q.beginPath(); for (const [cx, cy, r] of [[-40, -40, 44], [0, -60, 50], [44, -40, 42], [0, -20, 46]]) { q.moveTo(cx + r, cy); q.arc(cx, cy, r, 0, TAU); } q.fill();
    q.beginPath(); q.ellipse(80, -70, 30, 34, 0.2, 0, TAU); q.fill();
    q.strokeStyle = 'rgba(160,120,70,0.5)'; q.lineWidth = 3; q.stroke();
    q.fillStyle = '#6a4a2a'; q.beginPath(); q.arc(88, -76, 4, 0, TAU); q.fill();
    q.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { q.beginPath(); q.arc(-30 + i * 22, -80 + (i % 2) * 10, 5, 0, TAU); q.fill(); }
    q.restore();
  }
  function shotBeach(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: lerp(900, 1000, lt / 4.6), y: 640, z: 1.18, ...hand(s, 69, 3, 0.4) };
    const wave = clamp((bt - 5) / 1.2);
    g.fillStyle = '#8ccaf0'; g.fillRect(0, 0, VW, VH);
    inCam(g, cam, 1, (q) => {
      q.drawImage(LC(s, 'beach', VW + 600, 1500, (qq) => { qq.translate(300, 200); beachArt(qq); }, 1), -300, -200, VW + 600, 1500);
      glints(q, t, { x0: -300, x1: VW + 300, y0: 545, y1: 740, sunX: 1400, n: 60, seed: 171, path: 0.3, a: 0.8, wmax: 26 });
      swimmers(q, t);
      gulls(q, t, { n: 4, seed: 187, y0: 150, y1: 380, s: 0.9, speed: 70, x0: -300, x1: 2300 });
      // 一道浪冲上来（第 6 拍）
      if (wave > 0) { const wy = 760 + Math.sin(PI * wave) * 190; q.fillStyle = 'rgba(120,220,230,0.75)'; q.beginPath(); q.moveTo(-300, 740); for (let x = -300; x <= VW + 300; x += 40) q.lineTo(x, wy + Math.sin(x * 0.02 + t * 4) * 12); q.lineTo(VW + 300, 740); q.closePath(); q.fill(); q.strokeStyle = 'rgba(255,255,255,0.9)'; q.lineWidth = 6; q.beginPath(); for (let x = -300; x <= VW + 300; x += 40) { const yy = wy + Math.sin(x * 0.02 + t * 4) * 12; x === -300 ? q.moveTo(x, yy) : q.lineTo(x, yy); } q.stroke(); }
      sandSheep(q, 1020, 930, 1.3, clamp((bt - 5.4) / 0.8));
      // 堆沙羊的是锡兰（夏装）和琳琅诗怀雅：浪冲上来的时候吓一跳
      townsfolk(q, s, mixIn({ x: 1260, y: 990, h: 260, seed: 49, pose: bt > 5.4 ? 'cover' : 'stand', t, flip: true, expr: 'smile', look: [-1, 0.4] }, 'stand', 5.4, 0.3, bt), 3);
      townsfolk(q, s, { x: 820, y: 1010, h: 250, seed: 3, pose: bt > 5.4 ? 'cover' : 'point', aim: 0.2, t, flip: false, expr: bt > 5.4 ? 'surprise' : 'laugh' }, 1);
      // 她：蹲下来看沙子做的羊（毛是沙子……）；官方小人：坐在冰桶上看
      if (SDON()) {
        const cx = 620, cy = 1070, w = 200, hh = 112;
        q.fillStyle = 'rgba(120,90,60,0.25)'; q.beginPath(); q.ellipse(cx, cy, w * 0.62, 16, 0, 0, TAU); q.fill();
        q.fillStyle = '#4ab0d8'; rrect(q, cx - w / 2, cy - hh, w, hh, 12); q.fill(); q.fillStyle = '#fbfaf6'; rrect(q, cx - w / 2 - 6, cy - hh - 6, w + 12, 30, 10); q.fill();
        q.strokeStyle = INK_D; q.lineWidth = 3; rrect(q, cx - w / 2, cy - hh, w, hh, 12); q.stroke(); rrect(q, cx - w / 2 - 6, cy - hh - 6, w + 12, 30, 10); q.stroke();
        q.fillStyle = 'rgba(255,255,255,0.35)'; q.fillRect(cx - w / 2 + 14, cy - hh + 34, 12, hh - 44);
      }
      adele(q, { x: 620, y: 1070, h: 440, pose: SDON() ? 'sit' : bt < 3 ? 'crouch' : bt > 5.4 ? 'cover' : 'think', seat: 116, t, flip: false, expr: bt > 5.4 ? 'surprise' : 'pout', look: [1, 0.4] });
      // 在沙里打滚的小羊
      for (let i = 0; i < 2; i++) lamb(q, s, 1450 + i * 120, 1000 + i * 30, 80, { id: 4242 * 16 + i, pose: 'sleep', expr: 'happy', spin: Math.sin(t * 3 + i) * 0.6, glow: 0.3 });
      if (bt > 1 && bt < 5) pop(q, '羊毛……是沙子', 1060, 680, clamp((bt - 1) / 0.3) * (1 - clamp((bt - 4.6) / 0.3)), { size: 38, color: '#8a6a40' });
    });
    fgFrame(g, s, cam, 'palm', 'tr', { depth: 1.6 });
    s.post.grade(g, '#ffc890', 0.1, 'soft-light');
    vig(g, s, 0.3);
  }
  /* ---------- 镜头 39 · 晾衣绳（167.18 → 171.74）：小巷里晾着一排白床单；她抓起一条毛巾——“羊毛？”——床单后面一拍钻出一只小羊 ---------- */
  /** 晾着的一块布（床单 / 条纹毛巾）：顶边夹在绳上，下摆在风里飘；几道竖褶（亮暗交替） */
  function sheet(q, t, x, y, w, h, seed, lift = 0, col = '#fbfaf6', stripe = null) {
    const path = () => {
      q.beginPath(); q.moveTo(x, y);
      for (let i = 0; i <= 8; i++) q.lineTo(x + i * w / 8, y + Math.sin(i * 0.8 + seed) * 3);
      for (let i = 8; i >= 0; i--) { const u = i / 8; q.lineTo(x + u * w + Math.sin(t * 3 + u * 5 + seed) * 12 * (1 + lift), y + h - lift * h * 0.4 * Math.sin(PI * u) + Math.sin(t * 2.4 + u * 4 + seed) * 8); }
      q.closePath();
    };
    path(); q.fillStyle = col; q.fill();
    q.save(); path(); q.clip();
    if (stripe) { q.fillStyle = stripe; for (const yy of [0.18, 0.28, 0.78]) q.fillRect(x - 20, y + h * yy, w + 40, h * 0.05); }
    // 竖褶：随风慢慢移动的亮暗条
    for (let i = 0; i < 5; i++) {
      const fx = x + ((i + 0.5) / 5) * w + Math.sin(t * 2 + i + seed) * 10;
      q.fillStyle = hg(q, fx - 22, fx + 22, [[0, 'rgba(120,130,180,0)'], [0.5, 'rgba(120,130,180,0.22)'], [1, 'rgba(120,130,180,0)']]); q.fillRect(fx - 22, y, 44, h + 20);
      q.fillStyle = 'rgba(255,255,255,0.35)'; q.fillRect(fx + 14, y, 6, h + 20);
    }
    // 阳光从背后透过来（布有点透）
    q.fillStyle = vg(q, y, y + h, [[0, 'rgba(255,250,230,0.25)'], [1, 'rgba(160,170,210,0.18)']]); q.fillRect(x - 20, y, w + 40, h + 20);
    q.restore();
    path(); q.strokeStyle = 'rgba(140,150,190,0.7)'; q.lineWidth = 2; q.stroke();
    q.fillStyle = '#d06a5a'; q.fillRect(x + 10, y - 6, 8, 16); q.fillRect(x + w - 18, y - 6, 8, 16);
  }
  /** 晾着的小衬衫 */
  function shirt(q, t, x, y, w, col, seed) {
    const sw = Math.sin(t * 3 + seed) * 6;
    q.fillStyle = col; q.beginPath(); q.moveTo(x, y); q.lineTo(x + w, y); q.lineTo(x + w + 26, y + 30); q.lineTo(x + w + 10, y + 44); q.lineTo(x + w - 6, y + 30); q.lineTo(x + w - 4 + sw, y + w * 1.2); q.lineTo(x + 4 + sw, y + w * 1.2); q.lineTo(x + 6, y + 30); q.lineTo(x - 10, y + 44); q.lineTo(x - 26, y + 30); q.closePath(); q.fill();
    q.strokeStyle = 'rgba(40,40,80,0.4)'; q.lineWidth = 2; q.stroke();
    q.fillStyle = '#d06a5a'; q.fillRect(x + 4, y - 6, 7, 14); q.fillRect(x + w - 11, y - 6, 7, 14);
  }
  function shotLaundry(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: lerp(1500, 1640, lt / 4.6), y: 560, z: 1.25, ...hand(s, 71, 3, 0.4) };
    townD(g, s, cam, {
      volcX: 1400,
      street: (q0) => {
        tiled(q0, s, 'prom-walk', cam, 1, -300, 4700, 1100, (q, a, b) => { paving(q, a, b, 880, 1000, 71); promenadeRail(q, a, b, 1000); beachFront(q, a, b); }, 1, 870, 240);
        inCam(q0, cam, 1, (q) => {
          // 晾衣绳：从左右两栋房子的窗口拉过来（前后两排），挂着床单、条纹毛巾和小衬衫
          for (let r = 0; r < 2; r++) {
            const y = 360 + r * 90;
            q.fillStyle = '#6a5a4a'; q.fillRect(1086, y - 12, 18, 20); q.fillRect(2096, y - 12, 18, 20);
            q.strokeStyle = '#6a6a7a'; q.lineWidth = 2.5; q.beginPath(); q.moveTo(1100, y); q.quadraticCurveTo(1600, y + 40, 2100, y); q.stroke();
            for (let i = 0; i < 4; i++) {
              const x = 1150 + i * 230 + r * 110, lift = r === 1 && Math.floor(bt) % 4 === i ? Math.sin(PI * fract(bt)) : 0;
              const yy = y + 14 + Math.sin(PI * (x - 1100) / 1000) * 30;
              const kind = (i + r * 2) % 4;
              if (kind === 3 && r === 0) { shirt(q, t, x + 40, yy, 90, '#8ac0e8', i); shirt(q, t, x + 150, yy + 4, 70, '#ffb0c8', i + 3); continue; }
              sheet(q, t, x, yy, 190, 300 - r * 30, i + r * 5, lift, kind === 1 ? '#fff4f6' : '#fbfaf6', kind === 2 ? 'rgba(90,150,220,0.55)' : kind === 1 ? 'rgba(240,120,150,0.45)' : null);
              if (lift > 0.05) lamb(q, s, x + 95, yy + 316 - r * 30, 90, { id: 4299 * 16 + r * 4 + i, pose: 'stand', expr: 'happy', glow: 0.4, alpha: lift });
            }
          }
          // 她：抓起一条毛巾——“羊毛？”——不对
          const ao = { x: 1480, y: 1000, h: 440, pose: bt < 4 ? 'hold' : 'think', t, flip: false, expr: bt < 2 ? 'surprise' : bt < 4 ? 'smile' : 'pout', look: [0.8, -0.2] };
          adele(q, ao);
          const hp = anchor('adele-alter', ao, 'handN', [1520, 760]);
          if (bt < 4) { q.fillStyle = '#fffaf2'; rrect(q, hp[0] - 50, hp[1] - 10, 110, 70, 16); q.fill(); q.strokeStyle = '#d8c8c0'; q.lineWidth = 3; q.stroke(); for (let i = 0; i < 5; i++) { q.fillStyle = 'rgba(220,210,210,0.8)'; q.beginPath(); q.arc(hp[0] - 34 + i * 20, hp[1] + 12 + (i % 2) * 18, 6, 0, TAU); q.fill(); } }
          if (bt > 0.5 && bt < 3.5) pop(q, '羊毛？', 1560, 520, clamp((bt - 0.5) / 0.25), { size: 50, color: '#8a6ac0' });
          if (bt > 4) bigX(q, 1560, 760, 50, clamp((bt - 4) / 0.2) * (1 - clamp((bt - 5.5) / 0.3)));
        });
      },
    });
    s.post.grade(g, '#ffc890', 0.14, 'soft-light');
    vig(g, s, 0.3);
  }
  /* ---------- 镜头 40 · 叠罗汉（171.74 → 176.32）：山坡上，羊形的云就在头顶；小羊们一拍一只地叠上去——再差一点——塌了 ---------- */
  function shotLambTower(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const topple = s.shot.t0 + BEAT * 7, a = t - topple;
    const cam = { x: 900, y: lerp(560, 460, lt / 4.6), z: 1.0, ...(a > 0 ? shake(s, 8 * Math.exp(-a * 3), 73) : hand(s, 73, 3, 0.35)) };
    cliffW(g, s, cam, {
      wind: 0.4, base: { x: 900, y: 500, z: 1 }, bk: 'tower', fg: [['flowers', 'bl', {}]],
      sky: (q) => {
        q.save(); q.translate(760, 60 + Math.sin(t * 0.8) * 10); q.scale(1.3, 1.3); q.drawImage(sheepCloud(s, 'day'), 0, 0, 330, 210); q.restore();
        s.post.grade(q, '#ffc890', 0.0, 'soft-light');
      },
      mid: (q) => {
        const bx = 960, by = cliffTop(960) + 120;
        const n = Math.min(7, Math.max(0, Math.floor(bt + 0.4)));
        for (let i = 0; i < n; i++) {
          const land = clamp((bt + 0.4 - i) / 0.3);
          const wob = Math.sin(t * 5) * (i * 4) * (1 + clamp(bt - 5));
          let x = bx + wob + (i % 2 ? 6 : -6), y = by - i * 62 - (1 - land) * 120;
          let rot = 0;
          if (a > 0) { const fall = a * (1 + i * 0.15); x += fall * fall * 600 * (i / 7) + fall * 120; y += fall * fall * 900 * (i / 7); rot = fall * (2 + i * 0.3); }
          lamb(q, s, x, y, 84, { id: 4335 * 16 + i, pose: a > 0 ? 'jump' : 'stand', expr: a > 0 ? 'surprise' : 'happy', rot, glow: 0.4, sq: land < 1 ? 0.4 : 0, flip: i % 2 === 1 });
        }
        adele(q, { x: 700, y: cliffTop(700) + 130, h: 440, pose: a > 0 ? 'cover' : 'clasp', t, flip: false, expr: a > 0 ? 'surprise' : 'laugh', look: [0.5, -1] });
        if (a > 0) pop(q, '哎呀', 1200, 420, clamp(a / 0.2), { size: 54, color: '#e0508a' });
      },
    });
    s.post.grade(g, '#ffb880', 0.14, 'soft-light');
    vig(g, s, 0.3);
  }
  /* ---------- 镜头 41 · 奔向栈桥（176.32 → 183.18）：天变成粉紫色；她沿着木栈道跑向海边的栈桥，小羊们跟在后面 ---------- */
  function shotRunSunset(g, s) {
    const t = s.t, lt = s.lt;
    const wo = { h: 400, pose: 'run', speed: 1.0 };
    const v = gaitSpeed('adele-alter', wo, 310);
    const ax = 900 + lt * v;
    const cam = { x: ax + 200, y: 640, z: 1.05, ...hand(s, 75, 4, 0.5) };
    resortW(g, s, cam, {
      pal: 'dusk', fg: [['palm', 'tr', { depth: 1.6 }]],
      walk: (q) => {
        for (let i = 0; i < 6; i++) { const lx = ax - 220 - i * 110, ph = fract(s.beat * 2 + i * 0.3); lamb(q, s, lx, 1080 - hop(ph)[0] * 50, 74, { id: 4354 * 16 + i, pose: 'jump', expr: 'happy', glow: 0.6, sq: hop(ph)[1] }); }
        // 长长的影子
        q.fillStyle = 'rgba(60,30,80,0.25)'; q.beginPath(); q.ellipse(ax - 200, 1086, 220, 14, 0, 0, TAU); q.fill();
        adele(q, Object.assign({ x: ax, y: 1080, t, expr: 'determined', look: [1, -0.2], wind: 0.5, rim: '255,210,170', rimDir: 0.3 }, wo));
      },
    });
    lbox(g, s, ease.inOut(clamp((lt - 3.5) / 2)));
    vig(g, s, 0.35);
  }

  /* =========================================================
   * 黄昏的栈桥（183.18 → 217.46）：粉紫色的天、火山上一大柱粉色的烟、落日、长长的木栈桥
   * 世界坐标 1920×1080（左右各多画 500）；海平线 y = 600；栈桥桥面 y = 790（从左边一直伸到 x = 1560）
   * 片段 192.32 → 203.74（第 84–88 小节）是情绪最高的地方：以后可以整段换成官方立绘的特写（MVE.keyart）
   * ========================================================= */
  const PIER_HZ = 600, PIER_Y = 790, PIER_END = 1560;
  const PIER_LAMPS = [-160, 440, 1010];
  const SUN_P = [1240, 598];
  function pierSky(q, pal) {
    const N = pal === 'blue';
    q.fillStyle = N
      ? vg(q, -500, PIER_HZ, [[0, '#0e1240'], [0.4, '#262a6a'], [0.7, '#4a3c86'], [0.88, '#8a5a9a'], [1, '#d88aa0']])
      : vg(q, -500, PIER_HZ, [[0, '#2a2a70'], [0.25, '#5a3a8a'], [0.48, '#a04a9a'], [0.66, '#e0709e'], [0.82, '#ff9a90'], [0.93, '#ffc49a'], [1, '#ffe2b0']]);
    q.fillRect(-500, -500, VW + 1000, PIER_HZ + 900);
    // 高空的一缕缕卷云（被落日从下面照亮）
    const R = E.rng(211);
    for (let i = 0; i < 16; i++) {
      const cx = R() * (VW + 1000) - 500, cy = -300 + R() * 700, w = 300 + R() * 600, h = 8 + R() * 18;
      q.fillStyle = vg(q, cy - h, cy + h, N ? [[0, 'rgba(120,110,200,0)'], [1, 'rgba(200,150,220,0.45)']] : [[0, 'rgba(160,90,170,0)'], [0.6, 'rgba(255,150,170,0.5)'], [1, 'rgba(255,210,170,0.8)']]);
      q.beginPath(); for (let j = 0; j < 6; j++) q.ellipse(cx - w / 2 + (j + 0.5) * w / 6, cy + (R() - 0.5) * h, w / 6 * (0.9 + R() * 0.5), h * (0.7 + R() * 0.6), 0, 0, TAU); q.fill();
    }
    if (N) { for (let i = 0; i < 160; i++) { const y = -500 + Math.pow(R(), 1.5) * 800; q.fillStyle = `rgba(255,244,250,${(0.2 + R() * 0.5) * (1 - (y + 500) / 900)})`; q.fillRect(R() * (VW + 1000) - 500, y, 1.8, 1.8); } }
  }
  function pierIsland(q, pal) {
    // 左边的海岛：火山 + 山脚的小镇（剪影，边缘被落日镶上一道亮边）
    const N = pal === 'blue', cx = 180, top = 330, base = PIER_HZ + 4;
    q.fillStyle = N ? '#241c4a' : '#5a3a78';
    q.beginPath(); q.moveTo(-600, base); q.quadraticCurveTo(-120, base - 40, cx - 50, top); q.lineTo(cx - 20, top - 6); q.lineTo(cx + 6, top + 8); q.lineTo(cx + 30, top); q.lineTo(cx + 60, top - 4); q.quadraticCurveTo(460, base - 60, 820, base); q.closePath(); q.fill();
    q.strokeStyle = N ? 'rgba(200,170,255,0.4)' : 'rgba(255,190,170,0.7)'; q.lineWidth = 3; q.beginPath(); q.moveTo(cx + 60, top - 4); q.quadraticCurveTo(460, base - 60, 820, base); q.stroke();
    // 山脚的房子
    const R = E.rng(221); let x = -500;
    while (x < 900) { const w = 16 + R() * 26, h = 10 + R() * 20; q.fillStyle = N ? '#2a2250' : '#6a4480'; q.fillRect(x, base - h - 4, w, h + 6); x += w + 2 + R() * 8; }
  }
  function pierSea(q, pal) {
    const N = pal === 'blue';
    q.fillStyle = N ? vg(q, PIER_HZ, 1300, [[0, '#8a6aa8'], [0.08, '#4a3a86'], [0.5, '#221e56'], [1, '#100e30']]) : vg(q, PIER_HZ, 1300, [[0, '#ffc8b0'], [0.06, '#f09ab0'], [0.25, '#a86aa8'], [0.6, '#5a4288'], [1, '#2a2458']]);
    q.fillRect(-500, PIER_HZ, VW + 1000, 700);
    const R = E.rng(231);
    for (let i = 0; i < 360; i++) { const v = Math.pow(R(), 1.6), y = PIER_HZ + 2 + v * 560, x = R() * (VW + 1000) - 500; q.fillStyle = N ? `rgba(180,160,255,${0.05 + R() * 0.08})` : `rgba(255,200,210,${0.06 + R() * 0.12})`; q.fillRect(x, y, 10 + R() * 70 * (0.3 + v), 1 + v * 2.5); }
    q.fillStyle = N ? 'rgba(220,180,255,0.4)' : 'rgba(255,230,200,0.8)'; q.fillRect(-500, PIER_HZ - 1, VW + 1000, 2);
  }
  function pierDeck(q, pal) {
    // 栈桥：木桥面 + 一排排木桩 + 两侧的矮栏杆 + 路灯（剪影色，朝落日一面镶亮边）
    const N = pal === 'blue', dark = N ? '#1a1434' : '#3a2240', rim = N ? 'rgba(170,150,240,0.6)' : 'rgba(255,190,150,0.85)';
    // 木桩（伸进水里，水面上有倒影）
    for (let x = -480; x < PIER_END; x += 110) { q.fillStyle = dark; q.fillRect(x, PIER_Y, 18, 190); q.fillStyle = N ? 'rgba(60,50,120,0.4)' : 'rgba(120,70,120,0.4)'; q.fillRect(x, PIER_Y + 190, 18, 90); }
    // 横梁
    q.fillStyle = dark; q.fillRect(-500, PIER_Y + 60, PIER_END + 520, 12);
    // 桥面
    q.fillStyle = N ? '#2a2248' : '#5a3456'; q.fillRect(-500, PIER_Y - 16, PIER_END + 520, 36);
    q.fillStyle = rim; q.fillRect(-500, PIER_Y - 18, PIER_END + 520, 4);
    q.strokeStyle = 'rgba(0,0,0,0.25)'; q.lineWidth = 2; for (let x = -480; x < PIER_END; x += 60) { q.beginPath(); q.moveTo(x, PIER_Y - 14); q.lineTo(x, PIER_Y + 18); q.stroke(); }
    // 栏杆
    q.strokeStyle = dark; q.lineWidth = 7; q.beginPath(); q.moveTo(-500, PIER_Y - 120); q.lineTo(PIER_END - 80, PIER_Y - 120); q.stroke();
    q.lineWidth = 6; for (let x = -480; x < PIER_END - 60; x += 110) { q.beginPath(); q.moveTo(x + 9, PIER_Y - 16); q.lineTo(x + 9, PIER_Y - 124); q.stroke(); }
    q.strokeStyle = rim; q.lineWidth = 2; q.beginPath(); q.moveTo(-500, PIER_Y - 123); q.lineTo(PIER_END - 80, PIER_Y - 123); q.stroke();
    // 桥头的路灯（每隔一段一盏；避开她坐的桥尽头）
    for (const lx of PIER_LAMPS) { q.fillStyle = dark; q.fillRect(lx - 5, PIER_Y - 330, 10, 314); q.beginPath(); q.moveTo(lx - 22, PIER_Y - 330); q.lineTo(lx + 22, PIER_Y - 330); q.lineTo(lx + 14, PIER_Y - 372); q.lineTo(lx - 14, PIER_Y - 372); q.closePath(); q.fill(); q.fillStyle = N ? '#4a4070' : '#8a6070'; q.fillRect(lx - 10, PIER_Y - 364, 20, 28); }
  }
  /** 落日：一道从太阳延伸到脚下的金色光路（竖着的碎光条） */
  function sunPath(q, t, a = 1) {
    const [sx] = SUN_P;
    for (let i = 0; i < 70; i++) {
      const v = Math.pow(hash(241, i), 1.2), y = PIER_HZ + 4 + v * 480, w = (20 + v * 140) * (0.5 + hash(242, i));
      const x = sx + (hash(243, i) - 0.5) * (40 + v * 380) + Math.sin(t * 0.8 + i) * 8;
      const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + hash(244, i) * 3) + i);
      q.globalAlpha = a * (0.25 + 0.6 * tw) * (1 - v * 0.4); q.fillStyle = v < 0.3 ? '#fff0c8' : '#ffc890'; q.fillRect(x - w / 2, y, w, 1.5 + v * 4);
    }
    q.globalAlpha = 1;
  }
  /** 落日的光芒（几道斜射的光柱，加法混合） */
  function sunRays(q, t, a = 1) {
    q.save(); q.globalCompositeOperation = 'lighter';
    const [sx, sy] = SUN_P;
    for (let i = 0; i < 9; i++) {
      const ang = -PI / 2 + (i - 4) * 0.28 + Math.sin(t * 0.2 + i) * 0.03, len = 900 + hash(251, i) * 500, wd = 0.02 + hash(252, i) * 0.03;
      const gr = q.createLinearGradient(sx, sy, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      gr.addColorStop(0, `rgba(255,220,180,${(0.07 + 0.05 * Math.sin(t * 0.7 + i * 1.3)) * a})`); gr.addColorStop(1, 'rgba(255,200,180,0)');
      q.fillStyle = gr; q.beginPath(); q.moveTo(sx, sy); q.lineTo(sx + Math.cos(ang - wd) * len, sy + Math.sin(ang - wd) * len); q.lineTo(sx + Math.cos(ang + wd) * len, sy + Math.sin(ang + wd) * len); q.closePath(); q.fill();
    }
    q.restore();
  }
  /** 栈桥一整套（相机 cam；o: { pal: 'sunset'|'blue', sunK(太阳高度 0 落下 → 1 未落), mid(q), front(q), sky(q), lamps(0..1) } ） */
  function pierW(g, s, cam, o = {}) {
    const t = s.t, pal = o.pal || 'sunset', N = pal === 'blue';
    inCam(g, cam, 0.02, (q) => q.drawImage(LC(s, 'pier-sky2-' + pal, VW + 1000, PIER_HZ + 900, (qq) => { qq.translate(500, 500); pierSky(qq, pal); }, 0.3), -500, -500, VW + 1000, PIER_HZ + 900));
    inCam(g, cam, 0.05, (q) => {
      const sk = o.sunK ?? 1;
      if (!N) {
        const sy = SUN_P[1] + (1 - sk) * 40;
        E.glow(q, SUN_P[0], sy, 900, '255,170,150', 0.35 * sk + 0.1, 'screen', false);
        E.glow(q, SUN_P[0], sy, 260, '255,230,190', 0.6 * sk);
        q.save(); q.beginPath(); q.rect(-500, -500, VW + 1000, PIER_HZ + 500); q.clip(); q.fillStyle = '#fff4dc'; q.beginPath(); q.arc(SUN_P[0], sy, 58, 0, TAU); q.fill(); q.restore();
        sunRays(q, t, sk);
      }
      for (let i = 0; i < 6; i++) { const w = 460 + hash(261, i) * 360, x = ((hash(262, i) * 3400 + t * (5 + hash(263, i) * 4)) % 3400) - 900; q.drawImage(cloud(s, 270 + i, Math.round(w), Math.round(w * 0.36), 'dusk'), x, -140 + hash(264, i) * 520, w, w * 0.36); }
      if (o.sky) o.sky(q);
    });
    inCam(g, cam, 0.1, (q) => {
      q.drawImage(LC(s, 'pier-isle-' + pal, 1500, 320, (qq) => { qq.translate(620, -300); pierIsland(qq, pal); }, 0.6), -620, 300, 1500, 320);
      if (!N) bigPlume(q, t, 186, 330, 1.25); else plume(q, t, 186, 330, 1.3, { a: 0.35, rgb: '255,190,220' });
      if (o.isle) o.isle(q);
    });
    baked(g, s, 'pier-sea-' + pal, { x: 960, y: 540, z: 1 }, cam, 0.3, (q) => pierSea(q, pal), 0.6, [-520, PIER_HZ - 4, VW + 520, 1300]);
    inCam(g, cam, 0.3, (q) => {
      if (!N) sunPath(q, t, o.sunK ?? 1);
      glints(q, t, { x0: -500, x1: VW + 500, y0: PIER_HZ + 4, y1: 1100, sunX: SUN_P[0], n: 70, seed: 271, path: 0.7, pw1: 500, a: N ? 0.4 : 0.9, col: N ? '#d8c8ff' : '#fff0d0', rgb: '255,220,200' });
      if (o.sea) o.sea(q);
    });
    if (o.far) inCam(g, cam, 0.6, o.far);
    baked(g, s, 'pier-deck-' + pal + ':' + (o.bk || 'n'), o.base || { x: 960, y: 540, z: 1 }, cam, 1, (q) => pierDeck(q, pal), 1, [-520, 300, VW + 520, 1300]);
    inCam(g, cam, 1, (q) => {
      const L = o.lamps || 0;
      if (L > 0) for (let i = 0; i < PIER_LAMPS.length; i++) { const lx = PIER_LAMPS[i], k = clamp(L * 3 - i); if (k <= 0) continue; q.fillStyle = mixC('#8a6070', '#ffe2a8', k); q.fillRect(lx - 10, PIER_Y - 364, 20, 28); E.glow(q, lx, PIER_Y - 350, 150, '255,200,130', 0.55 * k); E.glow(q, lx, PIER_Y - 350, 36, '255,244,220', 0.9 * k); }
      if (o.mid) o.mid(q);
    });
    if (o.front) inCam(g, cam, 1.3, o.front);
    if (o.fg) for (const f of o.fg) fgFrame(g, s, cam, f[0], f[1], Object.assign({ pal: N ? 'night' : 'dusk' }, f[2] || {}));
  }
  /** 失焦的前景棕榈剪影（左上角，预先模糊） */
  const fgPalm = (s) => soft(s, 'fg-palm', 900, 700, (q) => { q.fillStyle = '#2a1430'; for (let i = 0; i < 7; i++) { q.save(); q.translate(-60, 60); frond(q, 0, 0, -0.2 + i * 0.28, 620 + i * 20, 0.35 + i * 0.12); q.restore(); } }, 0.12);

  /* ---------- 镜头 42 · 黄昏的栈桥（183.18 → 187.76）：她坐在栈桥尽头，小羊们安静地挨着她 ---------- */
  function sitAdele(o) { return Object.assign({ pose: 'sit', seat: 170 }, o); }
  function shotPier(g, s) {
    const t = s.t, lt = s.lt;
    const k = ease.inOut(clamp(lt / 4.6));
    const cam = { x: lerp(1000, 1160, k), y: lerp(560, 600, k), z: lerp(1.0, 1.12, k), ...hand(s, 81, 2, 0.2) };
    pierW(g, s, cam, {
      mid: (q) => {
        // 她坐在栈桥尽头，双腿悬在水面上（脚在桥面下方）
        // （官方小人：侧身坐在栈桥边上，面朝落日；手绘版：背影）
        adele(q, sitAdele({ x: 1440, y: PIER_Y + 150, h: 300, t, expr: 'content', look: [-0.2, -0.2], flip: SDON(), view: 'back3', wind: 0.4, windDir: -1, rim: '255,200,160', rimDir: SDON() ? PI : -0.4, shadow: false }));
        for (let i = 0; i < 3; i++) lamb(q, s, 1320 - i * 70, PIER_Y - 16, 52, { id: 4497 * 16 + i, pose: 'sit', expr: 'closed', flip: false, glow: 0.4 });
        gulls(q, t, { n: 4, seed: 283, x0: -300, x1: 2300, y0: 120, y1: 360, s: 0.8, speed: 50, far: true, col: 'rgba(60,30,70,0.8)' });
      },
      front: (q) => { q.drawImage(fgPalm(s), -300, -240, 1200, 933); },
    });
    lbox(g, s, 1);
    vig(g, s, 0.4);
  }
  /* ---------- 镜头 43 · 起风了（187.76 → 192.32）：海风凉了；她把外套裹紧了一点 ---------- */
  function shotBreeze(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: lerp(1380, 1400, lt / 4.6), y: 700, z: lerp(2.0, 2.12, lt / 4.6), ...hand(s, 83, 2, 0.25) };
    const wrap = bt > 3;
    pierW(g, s, cam, {
      base: { x: 1390, y: 700, z: 2.06 }, bk: 'breeze',
      mid: (q) => {
        lamb(q, s, 1300, PIER_Y - 16, 58, { id: 4513 * 16, pose: 'sit', expr: 'closed', flip: false, glow: 0.4 });
        adele(q, sitAdele({ x: 1440, y: PIER_Y + 150, h: 300, t, arms: wrap ? 'hug' : 'lap', expr: wrap ? 'content' : 'neutral', look: [1, -0.1], flip: SDON(), wind: 0.9, windDir: -1, rim: '255,200,160', rimDir: SDON() ? PI : 0.1, shadow: false }));
        lamb(q, s, 1540, PIER_Y - 16, 58, { id: 4515 * 16, pose: 'sit', expr: 'closed', flip: true, glow: 0.4 });
        // 风：几缕花瓣
        for (let i = 0; i < 12; i++) { const u = fract(t * 0.5 + i / 12); q.save(); q.translate(1700 - u * 700, 560 + hash(291, i) * 200 + Math.sin(u * 7 + i) * 20); q.rotate(u * 8); q.fillStyle = i % 2 ? 'rgba(255,190,210,0.9)' : 'rgba(255,240,230,0.9)'; q.fillRect(-5, -2, 10, 4); q.restore(); }
      },
    });
    lbox(g, s, 1);
    vig(g, s, 0.45);
  }
  /* ---------- 镜头 44 · 外套（192.32 → 196.90）：特写——外套的下摆在风里翻飞；米白的厚呢子、红色的条纹、一道缝线 ---------- */
  function coatFabricArt(q) {
    // 设计 1920×1080：一大片外套的布（几道褶），下摆的红条纹，布纹与缝线
    q.fillStyle = vg(q, 0, 1080, [[0, '#f6ece0'], [1, '#e2d2c0']]); q.fillRect(-200, -100, VW + 400, 1300);
    q.strokeStyle = 'rgba(160,130,110,0.4)'; q.lineWidth = 26; q.lineCap = 'round';
    for (let i = 0; i < 6; i++) { q.beginPath(); q.moveTo(200 + i * 300, -100); q.bezierCurveTo(300 + i * 280, 300, 100 + i * 330, 700, 260 + i * 300, 1200); q.stroke(); }
    q.strokeStyle = 'rgba(255,255,255,0.5)'; q.lineWidth = 14;
    for (let i = 0; i < 6; i++) { q.beginPath(); q.moveTo(240 + i * 300, -100); q.bezierCurveTo(340 + i * 280, 300, 140 + i * 330, 700, 300 + i * 300, 1200); q.stroke(); }
    q.lineCap = 'butt';
    // 布纹：很细的斜纹（厚呢子的质感）
    q.strokeStyle = 'rgba(150,120,100,0.07)'; q.lineWidth = 2;
    for (let x = -600; x < VW + 400; x += 14) { q.beginPath(); q.moveTo(x, -100); q.lineTo(x + 700, 1200); q.stroke(); }
    // 一道缝线（接缝 + 一排针脚），顺着布的褶子走
    const seam = (y) => 1180 + Math.sin(y * 0.004) * 40 - y * 0.12;
    q.strokeStyle = 'rgba(140,110,90,0.45)'; q.lineWidth = 5; q.beginPath(); for (let y = -100; y <= 1200; y += 40) q.lineTo(seam(y), y); q.stroke();
    q.strokeStyle = 'rgba(255,255,255,0.55)'; q.lineWidth = 2; q.beginPath(); for (let y = -100; y <= 1200; y += 40) q.lineTo(seam(y) + 6, y); q.stroke();
    q.strokeStyle = 'rgba(120,90,70,0.6)'; q.lineWidth = 2.5; q.setLineDash([12, 9]); q.beginPath(); for (let y = -100; y <= 1200; y += 40) q.lineTo(seam(y) + 22, y); q.stroke(); q.setLineDash([]);
  }
  /** 落日海面（预先虚化，给特写当背景） */
  const sunsetBg = (s) => soft(s, 'realize-bg', VW, VH, (q) => {
    q.save(); q.translate(960, 560); q.scale(1.5, 1.5); q.translate(-SUN_P[0] - 120, -PIER_HZ);
    pierSky(q, 'sunset'); pierSea(q, 'sunset');
    q.fillStyle = rg(q, SUN_P[0], SUN_P[1], 0, 420, [[0, 'rgba(255,240,210,1)'], [0.2, 'rgba(255,200,170,0.7)'], [1, 'rgba(255,160,160,0)']]); q.fillRect(SUN_P[0] - 420, SUN_P[1] - 420, 840, 840);
    q.fillStyle = '#fff4dc'; q.beginPath(); q.arc(SUN_P[0], SUN_P[1], 58, 0, TAU); q.fill();
    q.fillStyle = '#3a2240'; q.fillRect(-600, PIER_Y - 30, 3000, 60);
    q.restore();
  }, 0.06);
  function shotCoat(g, s) {
    const t = s.t, lt = s.lt;
    inCam(g, { x: 960 - lt * 14, y: 540, z: 1.05 }, 0.3, (q) => q.drawImage(sunsetBg(s), -60, -40, VW + 120, VH + 80));
    for (let i = 0; i < 12; i++) bokeh(g, hash(341, i) * VW, 420 + hash(342, i) * 460, 30 + hash(343, i) * 60, i % 2 ? '255,210,180' : '255,170,200', 0.2 + 0.2 * Math.sin(t * 1.3 + i));
    if (lt < 2.3) {
      // A：外套的下摆在风里翻飞——米白的布、红色的条纹、一道缝线
      const cam = { x: 960 + lt * 20, y: 520, z: 1.06 + lt * 0.02, r: 0.03 };
      inCam(g, cam, 1, (q) => {
        const hem = (x) => 780 + Math.sin(x * 0.004 + t * 3.2) * 46 + Math.sin(x * 0.011 + t * 5.3) * 14;
        q.save();
        q.beginPath(); q.moveTo(-300, -200); q.lineTo(VW + 300, -200); for (let x = VW + 300; x >= -300; x -= 40) q.lineTo(x, hem(x)); q.closePath(); q.clip();
        q.drawImage(LC(s, 'coat-fabric', VW + 400, 1300, (qq) => { qq.translate(200, 100); coatFabricArt(qq); }, 0.8), -300, -140, VW + 600, 1100);
        // 布被风吹得一起一伏（亮暗交替）
        for (let i = 0; i < 4; i++) { const x = ((t * 220 + i * 620) % 2600) - 400; additive(q, (qq) => withAlpha(qq, 0.2, (q3) => { q3.fillStyle = hg(q3, x - 220, x + 220, [[0, 'rgba(255,200,160,0)'], [0.5, 'rgba(255,200,160,1)'], [1, 'rgba(255,200,160,0)']]); q3.fillRect(x - 220, -200, 440, 1400); })); }
        q.restore();
        // 红色的条纹：沿着下摆，跟着一起飘
        q.fillStyle = '#c8323a'; q.beginPath(); for (let x = -300; x <= VW + 300; x += 40) q.lineTo(x, hem(x) - 70); for (let x = VW + 300; x >= -300; x -= 40) q.lineTo(x, hem(x) - 16); q.closePath(); q.fill();
        q.strokeStyle = 'rgba(255,230,210,0.5)'; q.lineWidth = 3; q.setLineDash([14, 10]); q.beginPath(); for (let x = -300; x <= VW + 300; x += 40) q.lineTo(x, hem(x) - 92); q.stroke(); q.setLineDash([]);
        q.strokeStyle = 'rgba(80,40,50,0.7)'; q.lineWidth = 4; q.beginPath(); for (let x = -300; x <= VW + 300; x += 40) q.lineTo(x, hem(x)); q.stroke();
        // 腰间的红系带
        for (let i = 0; i < 2; i++) { q.strokeStyle = '#d13a44'; q.lineWidth = 16; q.lineCap = 'round'; q.beginPath(); const x0 = 1320 + i * 60, y0 = 120; q.moveTo(x0, y0); for (let j = 1; j <= 10; j++) q.lineTo(x0 + j * 36, y0 + j * 22 + Math.sin(t * 7 - j * 0.7 + i) * 18 * j * 0.3); q.stroke(); q.lineCap = 'butt'; }
      });
      s.post.leak(g, t, { x: 1700, y: 160, r: 1300, rgb: '255,150,130', a: 0.4 });
    } else {
      // B：她闭上眼睛，风把外套和头发一起吹起来（官方立绘 · 半身，慢慢推近；没有立绘时用角色库的胸像：抱紧外套）
      const u = lt - 2.3;
      // 没有立绘：官方 Q 版小人侧身坐着（近景）；连官方小人也没有时，用手绘的胸像
      const fallback = (q) => inCam(q, { x: 960, y: 540, z: 1 + u * 0.02 }, 1, (qq) => SDON()
        ? adele(qq, { x: 1000, y: 1250, h: 780, pose: 'sit', seat: 330, t, flip: true, rim: '255,190,150', rimDir: PI, shadow: false })
        : adele(qq, { x: 980, y: 1090, h: 820, crop: 'bust', pose: 'hug', t, expr: 'content', look: [-0.3, 0.3], headPose: 'tilt', wind: 0.9, windDir: -1, rim: '255,190,150', rimDir: -0.5, shadow: false }));
      const K = KA();
      const ok = K && K.shot(g, s, {
        key: 'alter-e0', crop: 'upper',
        from: { crop: 'upper', z: 1.0, y: 0.015, look: [-0.2, 0.3], nod: 0.25 }, to: { crop: 'upper', z: 1.06, y: -0.005, look: [-0.12, 0.35], nod: 0.3 },
        ease: 'sine', span: [2.3, 4.58],
        eyes: 'closed', smile: 0.35 * s.at(3.2, 4.2, 'sine'), blush: 0.35, wind: 1, windDir: -1,
        grade: { base: 'warm', tint: ['#fff0ea', 0.16], overlay: ['#ff9a8a', 0.16, 'soft-light'] },
        light: { color: '#ffc8a0', dir: [0.85, -0.35], rim: 0.8, wash: 0.1 },
        bg: (q, s2) => sunsetCloseBg(q, s2),
        particles: [{ type: 'petals', n: 18, rgb: '255,190,210' }], dof: 0.15, bloom: 0.2,
        leak: { x: 1720, y: 160, r: 1200, rgb: '255,150,130', a: 0.32 }, letterbox: FIN() ? 0 : 1, vignette: 0.45,
        fallback,
      });
      if (!K) { sunsetCloseBg(g, s); fallback(g); }
      if (ok) { KAST = FST; lbox(g, s, 1); return; }
    }
    s.post.grade(g, '#ff9a8a', 0.18, 'soft-light');
    lbox(g, s, 1);
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 45 · 云里的身影（196.90 → 199.18）：晚霞里浮现出一个穿着同样外套的身影，风吹起衣摆 ---------- */
  function shotMemory(g, s) {
    const t = s.t, lt = s.lt;
    const k = win(lt, 0, 0.7, 1.8, 2.28);
    const cam = { x: 980, y: 400 - lt * 10, z: 1.1, ...hand(s, 85, 2, 0.2) };
    pierW(g, s, cam, {
      sky: (q) => {
        // 云做的身影：一大团粉色的雾 + 剪影（不画脸，只是一个轮廓），风吹起外套的下摆
        // 一个很淡、发着光的轮廓（像是晚霞自己聚成的），和她一样背对着我们看落日——在天色偏紫的高处，才看得清
        withAlpha(q, k, (qq) => {
          E.glow(qq, 700, 180, 380, '255,236,240', 0.45);
          dollyCloudD(qq, s, 700, 330, 0.9, 0.3, { a: 0.35, rgb: '255,214,230', rgb2: '255,240,246' });
          cast(qq, 'magna', { x: 700, y: 470, h: 520, outfit: 'field', t, pose: 'stand', view: 'back3', sil: '#fff0f4', rim: '255,255,250', rimW: 1.8, rimGlow: 0.6, wind: 1, windDir: -1, gear: false, alpha: 0.72 });
        });
        for (let i = 0; i < 16; i++) { const u = fract(t * 0.2 + i / 16), x = 560 + hash(351, i) * 300, y = 520 - u * 420; E.glow(q, x, y, 10, '255,240,220', Math.sin(PI * u) * 0.7 * k); }
      },
      mid: (q) => { adele(q, sitAdele({ x: 1440, y: PIER_Y + 150, h: 300, t, expr: 'content', flip: SDON(), view: 'back3', wind: 1, windDir: -1, sil: '#3a2040', rim: '255,200,160', shadow: false })); },
    });
    lbox(g, s, 1);
    vig(g, s, 0.45);
  }
  /* ---------- 镜头 46 · 原来如此（199.18 → 203.74）：她的脸（特写）；睁大眼睛——眼眶一热——笑了；膝上的卡片，第三个圈自己亮了 ---------- */
  /** 落日特写的背景（给立绘镜头当 bg 用；也是角色库替代画面的背景） */
  function sunsetCloseBg(g, s) {
    const t = s.t, lt = s.lt;
    inCam(g, { x: 960 - lt * 12, y: 540, z: 1.05 }, 0.3, (q) => q.drawImage(sunsetBg(s), -60, -40, VW + 120, VH + 80));
    g.fillStyle = 'rgba(80,40,90,0.12)'; g.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 14; i++) bokeh(g, hash(301, i) * VW, 300 + hash(302, i) * 500, 40 + hash(303, i) * 70, i % 2 ? '255,200,180' : '255,170,200', 0.25 + 0.2 * Math.sin(t * 1.5 + i));
  }
  /** 官方立绘（MVE.keyart，按需加载；不可用时返回 undefined） */
  const KA = () => window.MVE && window.MVE.keyart;
  function shotRealize(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    // 情绪最高的一刻：官方立绘（纯烬 · 精英零）从半身推到脸——先低头看着外套，再慢慢抬起眼睛，脸红，笑了
    // 立绘不可用（没加载完 / 没有 WebGL）时，用角色库的胸像画同一个画面
    const fallback = (q, s2) => {
      const phase = bt < 2 ? 'surprise' : bt < 4.5 ? 'tearful' : 'smile';
      inCam(q, { x: 960, y: 540, z: 1 + lt * 0.015 }, 1, (qq) => SDON()
        ? adele(qq, { x: 900, y: 1250, h: 800, pose: 'sit', seat: 330, t: s2.t, flip: true, rim: '255,190,150', rimDir: PI, shadow: false })
        : adele(qq, { x: 880, y: 1100, h: 900, crop: 'bust', t: s2.t, expr: phase, look: bt < 2 ? [0.1, 0.1] : [0.3, 0.6], wind: 0.7, windDir: -1, rim: '255,190,150', rimDir: -0.6, shadow: false }));
    };
    const K = KA();
    const ok = K && K.shot(g, s, {
      key: 'alter-e0', crop: 'bust',
      from: { crop: 'bust', z: 1.0, x: 0.02, look: [0.25, 0.4], nod: 0.35 }, to: { crop: 'face', z: 1.04, x: -0.01, look: [0, 0], nod: 0 },
      ease: 'inOut', span: [0, 3.6],
      eyes: 0.45 * (1 - s.at(0.3, 1.2, 'sine')), blush: 0.75 * s.at(1.2, 3.2, 'sine'), smile: s.at(3.0, 3.7, 'sine'),
      wind: 0.65, windDir: -1,
      grade: { base: 'dream', tint: ['#fff0ea', 0.18], overlay: ['#ff9a8a', 0.16, 'soft-light'] },
      light: { color: '#ffc8a0', dir: [0.8, -0.3], rim: 0.7, wash: 0.12 },
      bg: (q, s2) => sunsetCloseBg(q, s2),
      particles: [{ type: 'petals', n: 26, rgb: '255,190,210' }, { type: 'sparkle', n: 16 }], dof: 0.2, bloom: 0.22,
      leak: { x: 1720, y: 160, r: 1200, rgb: '255,150,130', a: 0.35 }, letterbox: FIN() ? 0 : 1, vignette: 0.4,
      fallback,
    });
    if (!K) { sunsetCloseBg(g, s); fallback(g, s); }
    if (ok) KAST = FST; // 片级调色在立绘镜头上放轻（立绘已经调过色；脸和头发保持原色）
    // 画面右下：膝上的卡片（插入的一个小画面，不挡脸），第三个圈亮起、盖上蹄印
    const ck = clamp((bt - 5) / 0.4), stampK = clamp((bt - 5.8) / 0.35);
    if (ck > 0) {
      const x = lerp(2300, 1640, ease.out(ck));
      E.glow(g, x, 720, 380, '255,220,190', 0.4 * ck);
      tradeCard(g, s, x, 720, 0.72, 0.06, 2 + stampK, t);
    }
    if (!ok) { s.post.grade(g, '#ff9a8a', 0.16, 'soft-light'); lbox(g, s, 1); vig(g, s, 0.45); }
    else lbox(g, s, 1);
  }
  /* ---------- 镜头 47 · 多利笑了（203.74 → 208.32）：落日里巨大的粉云羊眯起眼睛；她站起来，抱紧外套 ---------- */
  function shotDollySunset(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 1100, y: lerp(460, 420, lt / 4.6), z: 1.0, ...hand(s, 87, 2, 0.2) };
    pierW(g, s, cam, {
      sunK: 0.7,
      sky: (q) => {
        dollyD(q, s, 1150, 640, 700, 1, { expr: 'closed', look: [-0.6, 0.6], rgb: '255,190,210', rgb2: '255,226,210', a: 0.7, light: { color: '#ffc4c8', amount: 0.3 } });
        // 从云里飘下来的暖光粒子（落在她身上）
        for (let i = 0; i < 26; i++) { const u = fract(t * 0.18 + i / 26), x = 1000 + hash(311, i) * 500 + Math.sin(u * 6 + i) * 30, y = 200 + u * 560; E.glow(q, x, y, 12, '255,236,200', Math.sin(PI * u) * 0.8); }
      },
      mid: (q) => {
        // （官方小人：逆光里的一个剪影，镶着落日的亮边，面朝多利；手绘版：抱紧外套）
        if (SDON()) adele(q, { x: 1420, y: PIER_Y - 16, h: 300, pose: 'stand', t, flip: true, sil: '#3a2040', rim: '255,214,176', rimGlow: 0.35, shadow: false });
        else adele(q, { x: 1420, y: PIER_Y - 16, h: 300, pose: 'hug', t, expr: 'content', look: [-0.3, -1], flip: true, wind: 0.8, windDir: -1, rim: '255,200,160', rimDir: 0.2 });
        E.glow(q, 1420, PIER_Y - 170, 260, '255,220,190', 0.35 + 0.1 * Math.sin(t * 2));
        for (let i = 0; i < 4; i++) lamb(q, s, 1250 + i * 70 + (i > 1 ? 240 : 0), PIER_Y - 16, 52, { id: 4683 * 16 + i, pose: 'look-up', expr: 'happy', flip: i > 1, glow: 0.6 });
      },
    });
    lbox(g, s, 1);
    vig(g, s, 0.4);
  }
  /* ---------- 镜头 48 · 小羊们的舞（208.32 → 212.90）：小羊围着她一拍一跳地转圈，她也跟着转起来；太阳沉下去了 ---------- */
  function shotDance(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: 1330, y: 640, z: 1.6, ...hand(s, 89, 2, 0.25) };
    pierW(g, s, cam, {
      sunK: lerp(0.5, 0.15, lt / 4.6), base: { x: 1330, y: 640, z: 1.6 }, bk: 'dance',
      mid: (q) => {
        const cx = 1380, cy = PIER_Y - 16, n = 8;
        const items = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + s.beat * (PI / 4), ph = fract(s.beat + i * 0.125), [hy, sq] = hop(ph);
          items.push({ z: Math.sin(a), draw: () => lamb(q, s, cx + Math.cos(a) * 220, cy - hy * 60 + Math.sin(a) * 6, 60 + Math.sin(a) * 8, { id: 4700 * 16 + i, pose: hy > 0.3 ? 'jump' : 'stand', expr: 'happy', flip: Math.cos(a + PI / 2) < 0, glow: 0.7, sq }) });
        }
        items.push({ z: 0.001, draw: () => adele(q, { x: cx, y: cy, h: 300, pose: bt > 2 ? 'twirl' : 'clap', t, expr: 'laugh', look: [0, -0.2], flip: false, wind: 0.6, windDir: -1, rim: '255,190,160' }) });
        items.sort((a2, b2) => a2.z - b2.z).forEach((it) => it.draw());
        sparkles(q, t, 12, 321, '255,220,230', { x: 1000, w: 760, y: 360, h: 420, r: 12 });
      },
    });
    lbox(g, s, 1);
    vig(g, s, 0.4);
  }
  /* ---------- 镜头 49 · 灯亮了（212.90 → 217.46）：天暗成了蓝紫色；她回头望——沿着海岸，灯一盏盏亮起来，一直亮到山坡上的博物馆 ---------- */
  function shotLightsOn(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: lerp(800, 700, lt / 4.6), y: 520, z: lerp(1.25, 1.35, lt / 4.6), ...hand(s, 91, 2, 0.2) };
    pierW(g, s, cam, {
      pal: 'blue', lamps: clamp((bt - 0.5) / 3),
      isle: (q) => {
        // 海岸上的灯：按 x 从右往左一拍一拍地亮（最后亮起山坡上的博物馆）；每一簇灯在水里拖出一道倒影
        for (let i = 0; i < 90; i++) {
          const x = 800 - (i / 90) * 1400, y = PIER_HZ - 6 - hash(331, i) * 44 - (x < 250 ? (250 - x) * 0.14 : 0);
          const on = clamp((bt - (i / 90) * 6) / 0.3);
          if (on <= 0) continue;
          q.fillStyle = hash(332, i) < 0.3 ? '#ffe6b0' : '#ffc27a'; q.globalAlpha = on; q.fillRect(x - 2, y - 2, 4, 4); q.globalAlpha = 1;
          E.glow(q, x, y, 22, '255,200,130', 0.5 * on);
          if (i % 3 === 0) { q.globalAlpha = 0.35 * on; q.fillStyle = '#ffc27a'; for (let j = 0; j < 5; j++) q.fillRect(x - 2 + Math.sin(t * 2 + i + j) * 2, PIER_HZ + 6 + j * 10, 3, 6); q.globalAlpha = 1; }
        }
        const mk = clamp((bt - 6.2) / 0.4);
        if (mk > 0) { E.glow(q, 20, 470, 90, '255,210,150', 0.9 * mk); q.fillStyle = `rgba(255,230,180,${mk})`; q.fillRect(4, 462, 32, 16); sparkle(q, 20, 468, 50 * mk, mk, t, '255,236,180'); }
      },
      mid: (q) => {
        // （官方小人：转过身，面朝海岸上一盏盏亮起来的灯；手绘版：回头望）
        if (SDON()) adele(q, { x: 1180, y: PIER_Y - 16, h: 300, pose: 'stand', t, flip: bt > 0.5, rim: '200,180,255', rimDir: PI });
        else adele(q, { x: 1180, y: PIER_Y - 16, h: 300, pose: 'turn', turn: clamp((bt - 0.5) / 1.5) * 0.6, t, expr: 'smile', flip: false, wind: 0.5, windDir: -1, rim: '200,180,255' });
        for (let i = 0; i < 3; i++) lamb(q, s, 1300 + i * 70, PIER_Y - 16, 52, { id: 4733 * 16 + i, pose: 'stand', expr: 'happy', flip: true, glow: 0.9 });
        // 最后一拍：第一支烟花“咻”地升空
        const ra = lt - 3.9;
        if (ra > 0) { const y = lerp(700, 150, ease.out(clamp(ra / 0.6))); q.strokeStyle = 'rgba(255,220,180,0.6)'; q.lineWidth = 3; q.beginPath(); q.moveTo(560, y); q.lineTo(560, y + 90); q.stroke(); E.glow(q, 560, y, 18, '255,240,210', 0.9); }
      },
    });
    lbox(g, s, 1 - ease.inOut(clamp((lt - 3.6) / 0.9)));
    vig(g, s, 0.45);
  }

  /* =========================================================
   * 灯与烟火（217.46 → 256.32）
   * ========================================================= */
  // 烟花的“单位图案”（与「雾中之忆」同款）：圆形两圈；羊形（身子一圈 + 头 + 耳朵 + 四条腿）
  const FW_RING = (() => { const p = []; for (let i = 0; i < 30; i++) { const a = (i / 30) * TAU; p.push([Math.cos(a), Math.sin(a)]); } for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + 0.2; p.push([Math.cos(a) * 0.55, Math.sin(a) * 0.55]); } return p; })();
  const FW_SHEEP = (() => {
    const p = [];
    for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU; p.push([Math.cos(a) * 0.82 - 0.12, Math.sin(a) * 0.55 * (1 + 0.1 * Math.cos(a * 6))]); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; p.push([0.86 + Math.cos(a) * 0.24, -0.34 + Math.sin(a) * 0.27]); }
    p.push([0.66, -0.52], [0.6, -0.58]);
    for (const lx of [-0.62, -0.3, 0.18, 0.46]) p.push([lx, 0.62], [lx, 0.8]);
    return p;
  })();
  const FW_COL = ['255,160,210', '255,210,140', '160,236,220', '200,170,255', '255,236,246', '255,190,120'];
  /** 一朵烟花：(x, y) 炸开点，R 半径，a = 炸开后的秒数（负数时是升空的火箭） */
  function firework(g, x, y, R, a, hue, sheep, launch = 0.5, yb = 1040) {
    if (a < -launch || a > 2.4) return;
    const col = FW_COL[hue % FW_COL.length];
    if (a < 0) {
      const u = 1 + a / launch, sy = lerp(yb, y, ease.out(u));
      g.strokeStyle = `rgba(${col},0.5)`; g.lineWidth = 3; g.beginPath(); g.moveTo(x, sy); g.lineTo(x + Math.sin(u * 20) * 3, sy + 70); g.stroke();
      E.glow(g, x, sy, 16, '255,244,220', 0.9);
      return;
    }
    const k = 1 - Math.exp(-a * 4.2), k0 = 1 - Math.exp(-Math.max(0, a - 0.1) * 4.2), fade = Math.pow(1 - a / 2.4, 1.3), drop = 46 * a * a;
    if (a < 0.3) E.glow(g, x, y, R * 1.1 * (1 - a / 0.3), '255,250,240', 0.9);
    E.glow(g, x, y + drop * 0.4, R * 1.7 * k, col, 0.2 * fade);
    const pts = sheep ? FW_SHEEP : FW_RING;
    g.save(); g.globalCompositeOperation = 'lighter';
    g.strokeStyle = `rgba(${col},${0.8 * fade})`; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath();
    for (const [ux, uy] of pts) { g.moveTo(x + ux * R * k0, y + uy * R * k0 + drop * 0.8); g.lineTo(x + ux * R * k, y + uy * R * k + drop); }
    g.stroke(); g.restore();
    const tw = a > 1.2 ? 0.5 + 0.5 * Math.sin(a * 40 + x) : 1;
    for (const [ux, uy] of pts) E.glow(g, x + ux * R * k, y + uy * R * k + drop, 11, col, fade * tw);
  }
  /** 一串烟花：t0 起每 step 秒一朵，every 朵里有一朵是羊形；返回“最近一朵炸开的亮度”（给人物 / 水面打光用） */
  function fireworkShow(q, t, t0, n, step, seed, o = {}) {
    let flash = 0, fcol = '255,220,200';
    for (let i = 0; i < n; i++) {
      const bt = t0 + i * step + 0.45, a = t - bt;
      if (a < -0.5 || a > 2.4) continue;
      const x = (o.x0 ?? 280) + hash(seed, i, 1) * (o.w ?? 1400), y = (o.y0 ?? 150) + hash(seed, i, 2) * (o.h ?? 250), R = (o.r ?? 110) * (0.75 + 0.6 * hash(seed, i, 3));
      firework(q, x, y, R, a, i + seed, i % (o.every ?? 3) === 1, 0.5, o.yb ?? 1040);
      if (a >= 0 && a < 1) { const f = Math.exp(-a * 3); if (f > flash) { flash = f; fcol = FW_COL[(i + seed) % FW_COL.length]; } }
    }
    return [flash, fcol];
  }
  /** 从海湾的船上、屋顶上升起的天灯（一盏盏往上飘） */
  function skyLanterns(q, s, t, o = {}) {
    const n = o.n || 24;
    for (let i = 0; i < n; i++) {
      const st = (o.t0 ?? 0) + hash(o.seed || 401, i, 1) * (o.spread ?? 6), a = t - st;
      if (a < 0) continue;
      const life = 14, u = (a % life) / life;
      const x = (o.x0 ?? -200) + hash(o.seed || 401, i, 2) * (o.w ?? 2300) + Math.sin(a * 0.6 + i) * 30, y = (o.y0 ?? 760) - u * (o.rise ?? 900);
      const sc = (o.sc ?? 1) * (0.5 + hash(o.seed || 401, i, 3) * 0.8) * (1 - u * 0.4);
      const fl = 0.85 + 0.15 * Math.sin(t * 9 + i);
      E.glow(q, x, y, 44 * sc, '255,180,110', 0.4 * fl * (1 - u * 0.5));
      q.fillStyle = `rgba(255,${200 + (i % 3) * 14},140,${0.95 * (1 - u * 0.3)})`; q.beginPath(); q.moveTo(x - 10 * sc, y - 14 * sc); q.lineTo(x + 10 * sc, y - 14 * sc); q.lineTo(x + 8 * sc, y + 12 * sc); q.lineTo(x - 8 * sc, y + 12 * sc); q.closePath(); q.fill();
      E.glow(q, x, y + 6 * sc, 8 * sc, '255,244,220', 0.9 * fl);
    }
  }
  /* ---------- 镜头 50 · 海湾的夜（217.46 → 222.04）：第一朵烟花炸开；海湾的船上升起天灯 ---------- */
  function shotBay(g, s) {
    const t = s.t, lt = s.lt, t0 = s.shot.t0;
    const cam = { x: 960, y: lerp(520, 470, lt / 4.6), z: lerp(1.0, 1.05, lt / 4.6), ...hand(s, 101, 2, 0.25) };
    let F = [0, '255,220,200'];
    terraceB(g, s, cam, {
      pal: 'night', fg: [['palm', 'tl', { depth: 1.5 }]],
      sky: (q) => {
        q.save(); q.translate(1480, 60); q.globalAlpha = 0.5; q.drawImage(sheepCloud(s, 'night'), 0, 0, 330, 210); q.restore();
        F = fireworkShow(q, t, t0 - 0.46, 14, BEAT, 411, { x0: 200, w: 1500, y0: 60, h: 260, r: 150, yb: 700 });
      },
      sea: (q) => { skyLanterns(q, s, t, { t0: t0 - 8, spread: 10, x0: -200, w: 2300, y0: 700, rise: 700, sc: 0.8, n: 28 }); for (let i = 0; i < 6; i++) { const x = 200 + i * 300 + Math.sin(t * 0.3 + i) * 20, y = 640 + (i % 2) * 40; q.fillStyle = '#140e2a'; q.beginPath(); q.ellipse(x, y, 40, 8, 0, 0, TAU); q.fill(); E.glow(q, x, y - 10, 30, '255,190,120', 0.7); } },
      town: (q) => { q.fillStyle = `rgba(${F[1]},${0.12 * F[0]})`; q.fillRect(-400, 500, VW + 800, 500); },
      terrace: (q) => {
        // 她靠着栏杆看海湾（背影）；凯勒老师背靠栏杆站在她身边，侧过脸看着她笑（官方立绘绑定：烟花在她身后，轮廓被照亮）
        const bt0 = s.shot.t0;
        keller(q, { x: 760, y: 1010, h: 380 * KH(), pose: 'turn', turn: 0.85, t, expr: 'smile', flip: false, shadow: false,
          rig: { flip: false, expr: [[bt0 - 1, 10], [bt0 + 2.2, 9]], look: [0.7, 0.2], tilt: 0.3, glint: (tt) => 0.8 * F[0], light: { color: '#c4bcf0', amount: 0.4 }, rim: { color: F[1], dir: [0.1, -1], rim: 0.5 + 0.6 * F[0], wash: 0.02 }, wind: 0.3 } }, s);
        adele(q, { x: 1000, y: 1010, h: 380, pose: 'turn', turn: 0.15 + 0.2 * clamp((lt - 2) / 1), t, flip: false, shadow: false });
        for (let i = 0; i < 5; i++) lamb(q, s, 1200 + i * 80, 822, 58, { id: 4825 * 16 + i, pose: 'sit', expr: 'happy', flip: false, glow: 0.8 });
      },
    });
    s.post.fill(g, `rgb(${F[1]})`, 0.08 * F[0], 'lighter');
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 51 · 碰杯（222.04 → 226.61）：凯勒老师递给她一瓶汽水；两只瓶子“叮”地碰在一起 ---------- */
  function shotClink(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: 910, y: 680, z: 1.6, ...hand(s, 103, 2, 0.3) };
    let F = [0, '255,220,200'];
    terraceB(g, s, cam, {
      pal: 'night', dof: 1, bk: 'clink', base: { x: 910, y: 680, z: 1.6 },
      sky: (q) => { F = fireworkShow(q, t, s.shot.t0 - 2 * BEAT, 12, BEAT, 421, { x0: 300, w: 1300, y0: 40, h: 200, r: 120, yb: 700 }); },
      terrace: (q) => {
        // 凯勒老师递来一瓶汽水 → 两人伸手，瓶子在中间“叮”地碰在一起（瓶子始终拿在手里）
        const clinkOn = bt > 3.3 && bt < 5.6, clink = win(bt, 3.9, 4.0, 4.6, 5.2);
        const ko = { x: 760, y: 1060, h: 440 * KH(), pose: clinkOn ? 'reach' : 'hold', aim: -0.15, t, expr: 'laugh', flip: false, look: [1, -0.1] };
        const SDk = SDON();
        const ao = { x: SDk ? 990 : 1060, y: 1060, h: 440, pose: SDk ? 'wave' : clinkOn ? 'reach' : 'hold', aim: -0.15, t, expr: bt > 4 ? 'laugh' : 'smile', flip: true, look: [-1, -0.1], rim: F[1], rimGlow: 0.1 * F[0] };
        // 凯勒老师：官方立绘剪纸（膝上构图）——汽水瓶握在她胸前那只手里；碰杯时两只瓶子往中间一凑
        const ct0 = s.shot.t0;
        const kc = kellerCard(q, s, {
          x: 700, y: 1170, h: 700, crop: 'upper', flip: true, expr: [[ct0 - 1, 8], [ct0 + BEAT * 3.8, 9]], light: { color: '#c8b8f0', amount: 0.28 },
          // 递汽水时说了句什么，碰杯时眯眼笑；烟花一亮，镜片上跟着一闪、轮廓被照亮
          mouth: talkK([[ct0 + 0.15, ct0 + BEAT * 3.1]], 13), look: [-0.5, 0.12], tilt: (tt) => -0.4 * sst(ct0 + BEAT * 3.8, ct0 + BEAT * 3.8 + 0.5, tt),
          glint: (tt) => Math.max(0.7 * F[0], E.window01(tt, ct0 + BEAT * 4, ct0 + BEAT * 5.6, 0.15, 0.5)), rim: { color: F[1], dir: [0.3, -1], rim: 0.35 + 0.6 * F[0], wash: 0.03 },
        }, (qq) => keller(qq, ko, s));
        adele(q, ao);
        const kh0 = kc ? [845, 850] : anchor('keller', ko, 'handN', [860, 800]), ah0 = anchor('adele-alter', ao, 'handN', [960, 800]);
        const ce = kc || SDk ? ease.inOut(clinkOn ? clamp((bt - 3.3) / 0.6) : 0) : 0, m0 = lerp(kh0[0], ah0[0], kc ? 0.38 : 0.5);
        const kh = [lerp(kh0[0], m0 - 34, ce), lerp(kh0[1], Math.min(kh0[1], ah0[1]) - 10, ce)], ah = [lerp(ah0[0], m0 + 34, ce), lerp(ah0[1], Math.min(kh0[1], ah0[1]) - 10, ce)];
        bottle(q, s, kh[0] + 6, kh[1] + 44, 110, clinkOn ? 0.3 : 0, 1);
        bottle(q, s, ah[0] - 6, ah[1] + 44, 110, clinkOn ? -0.3 : 0, 1);
        const mid = (kh[0] + ah[0]) / 2, my = Math.min(kh[1], ah[1]) - 50;
        if (clink > 0) { sparkle(q, mid, my, 80 * clink, clink, t * 2, '255,240,220'); pop(q, '叮！', mid, my - 90, clink, { size: 52, color: '#ffd24a', stroke: 'rgba(60,30,70,0.8)' }); }
        fizz(q, t, { t0: s.shot.t0 + BEAT * 4, x: mid, y: my, n: 18, dur: 2, speed: 160, r: 5, rise: 60, life: 1.4, spread: 1.2, seed: 431 });
      },
    });
    s.post.fill(g, `rgb(${F[1]})`, 0.1 * F[0], 'lighter');
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 52 · 栏杆上的小羊（226.61 → 231.18）：一排小羊看烟花；一只张嘴去接落下来的火星 ---------- */
  function shotRailLambs(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const cam = { x: 1100 + lt * 20, y: 700, z: 2.1, ...hand(s, 105, 2, 0.3) };
    let F = [0, '255,220,200'];
    terraceB(g, s, cam, {
      pal: 'night', dof: 1, bk: 'rail', base: { x: 1140, y: 700, z: 2.1 },
      sky: (q) => { F = fireworkShow(q, t, s.shot.t0 - BEAT, 10, BEAT, 441, { x0: 700, w: 1000, y0: 200, h: 260, r: 110, yb: 800 }); },
      terrace: (q) => {
        for (let i = 0; i < 6; i++) {
          const x = 860 + i * 90, catchIt = i === 3 && bt > 4.5 && bt < 6;
          lamb(q, s, x, 822 - (catchIt ? Math.sin(PI * clamp((bt - 4.5) / 1)) * 40 : 0), 70, { id: 4878 * 16 + i, pose: catchIt ? 'jump' : 'sit', expr: catchIt ? 'open' : 'happy', flip: i % 2 === 0, glow: 0.6 + 0.6 * F[0], glowRgb: F[1] });
          if (i === 1) lanternD(q, s, x, 700, 40, 1, Math.sin(t * 2) * 0.1, 1);
        }
        // 落下来的一颗火星 → 被接住（嘴里亮了一下）
        const fk = clamp((bt - 3.6) / 1.1);
        if (fk > 0 && fk < 1) E.glow(q, lerp(1180, 1130, fk), lerp(560, 780, ease.in(fk)), 14, '255,220,150', 1);
        if (bt > 4.7 && bt < 5.4) { E.glow(q, 1130, 780, 40, '255,220,150', 0.8); pop(q, '啊呜', 1130, 690, clamp((bt - 4.7) / 0.2), { size: 34, color: '#ffd24a', stroke: 'rgba(60,30,70,0.8)' }); }
      },
    });
    s.post.fill(g, `rgb(${F[1]})`, 0.1 * F[0], 'lighter');
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 53 · 羊形的烟花（231.18 → 235.76）：一拍一朵，广场上的人群欢呼 ---------- */
  function shotSheepFireworks(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: 960, y: lerp(420, 380, lt / 4.6), z: 1.0, ...hand(s, 107, 2, 0.3) };
    let F = [0, '255,220,200'];
    terraceB(g, s, cam, {
      pal: 'night',
      sky: (q) => { F = fireworkShow(q, t, s.shot.t0 - 0.46, 10, BEAT, 451, { x0: 300, w: 1300, y0: 40, h: 240, r: 190, every: 1, yb: 700 }); },
      sea: (q) => { skyLanterns(q, s, t, { t0: 205, spread: 10, x0: -200, w: 2300, y0: 700, rise: 700, sc: 0.8, n: 22, seed: 402 }); },
      town: (q) => {
        // 屋顶上、广场上欢呼的人群（小小的剪影，举起手）
        for (let i = 0; i < 40; i++) { const x = hash(461, i) * 2000 - 40, y = 700 + hash(462, i) * 160, jump = Math.max(0, Math.sin(t * 6 + i)) * 6; q.fillStyle = '#120c26'; q.beginPath(); q.arc(x, y - 22 - jump, 6, 0, TAU); q.fill(); q.fillRect(x - 5, y - 16 - jump, 10, 16); q.strokeStyle = '#120c26'; q.lineWidth = 3; q.beginPath(); q.moveTo(x - 4, y - 14 - jump); q.lineTo(x - 9, y - 30 - jump); q.moveTo(x + 4, y - 14 - jump); q.lineTo(x + 9, y - 30 - jump); q.stroke(); }
        q.fillStyle = `rgba(${F[1]},${0.14 * F[0]})`; q.fillRect(-400, 500, VW + 800, 500);
      },
    });
    s.post.fill(g, `rgb(${F[1]})`, 0.1 * F[0], 'lighter');
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 54 · 她的脸（235.76 → 240.33）：烟花的颜色一下一下映在她脸上；她笑着 ---------- */
  /** 烟花的虚化背景（夜空 + 大光斑）；返回 [最近一朵的亮度, 颜色] */
  function fireBokehBg(g, s) {
    const t = s.t;
    g.fillStyle = vg(g, 0, VH, [[0, '#0a0c2a'], [1, '#2a2050']]); g.fillRect(0, 0, VW, VH);
    let flash = 0, fcol = '255,200,220';
    for (let i = 0; i < 8; i++) {
      const bt0 = s.shot.t0 + i * BEAT - 0.2, a = t - bt0;
      if (a < 0 || a > 2) continue;
      const col = FW_COL[(i + 3) % FW_COL.length], x = 300 + hash(471, i) * 1300, y = 200 + hash(472, i) * 300, R = 200 + a * 140;
      bokeh(g, x, y, R, col, 0.5 * (1 - a / 2));
      for (let j = 0; j < 10; j++) { const an = (j / 10) * TAU + i; bokeh(g, x + Math.cos(an) * R * 0.9, y + Math.sin(an) * R * 0.9 + a * a * 40, 26, col, 0.6 * (1 - a / 2)); }
      const f = Math.exp(-a * 3); if (f > flash) { flash = f; fcol = col; }
    }
    return [flash, fcol];
  }
  const rgbHex = (rgb) => '#' + rgb.split(',').map((v) => (+v).toString(16).padStart(2, '0')).join('');
  function shotFireFace(g, s) {
    const t = s.t, lt = s.lt;
    let F = [0, '255,200,220'];
    // 官方立绘的脸：烟花的颜色一下一下映在脸上（补光的颜色跟着最近的一朵走）；没有立绘时用角色库的胸像
    const probe = (() => { let flash = 0, fcol = '255,200,220'; for (let i = 0; i < 8; i++) { const a = t - (s.shot.t0 + i * BEAT - 0.2); if (a < 0 || a > 2) continue; const f = Math.exp(-a * 3); if (f > flash) { flash = f; fcol = FW_COL[(i + 3) % FW_COL.length]; } } return [flash, fcol]; })();
    const fallback = (q, s2) => inCam(q, { x: 960, y: 540, z: 1 + lt * 0.02 }, 1, (qq) => adele(qq, { x: 960, y: 1240, h: 940, crop: 'bust', t: s2.t, expr: 'smile', look: [0.2, -0.6], wind: 0.3, windDir: -1, rim: probe[1], rimGlow: 0.2 + 0.4 * probe[0], shadow: false }));
    const K = KA();
    const ok = K && K.shot(g, s, {
      key: 'alter-e0', crop: 'face',
      from: { crop: 'face', z: 1.0, y: 0.01, look: [0.15, -0.25] }, to: { crop: 'face', z: 1.07, y: -0.01, look: [0.05, -0.35] },
      ease: 'sine', smile: 0.6 + 0.4 * s.at(1.5, 2.2, 'sine'), blush: 0.5, wind: 0.3, windDir: -1,
      // 夜里：整体压暗一点、偏冷（正片叠底），保住肤色的饱和度与线稿的对比，别让脸发白
      grade: { base: 'night', tint: ['#e8e0ff', 0.12] },
      light: { color: rgbHex(probe[1]), dir: [0.3, -0.9], rim: 0.35 + 0.45 * probe[0], wash: 0.02 + 0.05 * probe[0] },
      tint: ['#b4acdc', 0.24], sat: 1.04, contrast: 1.1,
      bg: (q, s2) => { F = fireBokehBg(q, s2); },
      // 前景散景（dof）和原地闪烁的星点（sparkle）都会停在脸上变成一团白斑：这里都不要；背景里已经有烟花的大光斑
      particles: [{ type: 'fireflies', n: 8 }], dof: 0, bloom: 0.05, vignette: 0.5,
      fallback,
    });
    if (!K) { F = fireBokehBg(g, s); fallback(g, s); }
    if (ok) KAST = FST;
    if (!ok) { F = probe; s.post.fill(g, `rgb(${F[1]})`, 0.12 * F[0], 'soft-light'); s.post.fill(g, `rgb(${F[1]})`, 0.05 * F[0], 'lighter'); vig(g, s, 0.5); }
    else s.post.fill(g, `rgb(${F[1]})`, 0.08 * F[0], 'soft-light');
  }
  /* ---------- 镜头 55 · 整个汐斯塔（240.33 → 244.90）：从海上远远看——满城的灯、升起的天灯、烟花，火山上空淡淡的粉色羊形云 ---------- */
  function shotTownWide(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: lerp(1400, 1460, lt / 4.6), y: lerp(450, 470, lt / 4.6), z: lerp(2.05, 1.95, lt / 4.6) };
    g.drawImage(LC(s, 'tw-sky', VW, VH, (q) => { q.fillStyle = vg(q, 0, VH, [[0, '#050822'], [0.45, '#141a4a'], [0.75, '#3a2a6a'], [1, '#6a3a78']]); q.fillRect(0, 0, VW, VH); const R = E.rng(5); for (let i = 0; i < 260; i++) { q.fillStyle = `rgba(255,244,250,${0.2 + R() * 0.5})`; q.fillRect(R() * VW, Math.pow(R(), 1.4) * 700, 1.6, 1.6); } }, 0.3), 0, 0, VW, VH);
    let F = [0, '255,220,200'];
    const show = (q) => fireworkShow(q, t, s.shot.t0 - 1, 12, BEAT * 0.75, 481, { x0: 1040, w: 820, y0: 150, h: 140, r: 70, yb: 600 });
    inCam(g, cam, 1, (q) => {
      q.save(); q.translate(1380, 110); q.scale(1.2, 1.2); q.globalAlpha = 0.5; q.drawImage(sheepCloud(s, 'night'), 0, 0, 330, 210); q.restore();
      E.glow(q, 1470, 330, 200, '255,160,210', 0.35);
      F = show(q);
      q.drawImage(LC(s, 'isle-volc-night-hi', 1460, 330, (qq) => { qq.translate(-740, -300); isleVolcano(qq, 'night'); }, 2.1), 740, 300, 1460, 330);
      plume(q, t, 1470, 318, 0.8, { a: 0.4, rgb: '255,180,220' });
      q.drawImage(LC(s, 'isle-town-night-hi', 1160, 130, (qq) => { qq.translate(-860, -500); isleTown(qq, 'night'); }, 2.1), 860, 500, 1160, 130);
      // 满城的窗：一闪一闪
      for (let i = 0; i < 90; i++) { const x = 1000 + hash(491, i) * 900, y = 560 + hash(492, i) * 40 - Math.max(0, (1500 - Math.abs(x - 1450)) / 1500) * 20; const a = 0.5 + 0.5 * Math.sin(t * (1 + hash(493, i) * 2) + i); q.fillStyle = hash(494, i) < 0.3 ? '#ffe6b0' : '#ffc27a'; q.globalAlpha = 0.5 + 0.5 * a; q.fillRect(x, y, 2.5, 2.5); }
      q.globalAlpha = 1;
      E.glow(q, 1236, 540, 34, '255,210,150', 0.9);
      skyLanterns(q, s, t, { t0: 200, spread: 12, x0: 1000, w: 900, y0: 600, rise: 520, sc: 0.35, n: 40, seed: 403 });
      // 海：城里的灯与烟花的倒影
      q.fillStyle = vg(q, SEA_HZ, 800, [[0, '#3a2a6a'], [0.3, '#1c1a4a'], [1, '#0a0a24']]); q.fillRect(700, SEA_HZ, 1500, 300);
      // 倒影：以海平线为轴上下翻转、压扁
      q.save(); q.beginPath(); q.rect(700, SEA_HZ, 1500, 300); q.clip(); q.translate(0, SEA_HZ); q.scale(1, -0.6); q.translate(0, -SEA_HZ); q.globalAlpha = 0.35; show(q); q.restore();
      for (let i = 0; i < 40; i++) { const x = 1000 + hash(495, i) * 900; for (let j = 0; j < 5; j++) { q.globalAlpha = (0.32 - j * 0.05) * (0.6 + 0.4 * Math.sin(t * 2.6 + i + j * 1.7)); q.fillStyle = '#ffc27a'; q.fillRect(x + Math.sin(t * 1.9 + j + i) * 2, SEA_HZ + 6 + j * 6, 1.6 + (5 - j) * 0.4, 3); } }
      q.globalAlpha = 1;
      // 海上几条挂着灯的小船
      for (let i = 0; i < 5; i++) { const x = 1060 + i * 170 + Math.sin(t * 0.3 + i) * 10, y = 640 + (i % 2) * 22; q.fillStyle = '#0e0a22'; q.beginPath(); q.ellipse(x, y, 26, 5, 0, 0, TAU); q.fill(); E.glow(q, x + 4, y - 8, 18, '255,190,120', 0.8); }
      q.fillStyle = `rgba(${F[1]},${0.15 * F[0]})`; q.fillRect(700, SEA_HZ, 1500, 300);
    });
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 56 · 天灯（244.90 → 249.46）：她和小羊们一起放起一盏天灯；灯从镜头前升过去 ---------- */
  function shotReleaseLantern(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const rise = clamp((bt - 2) / 6);
    const cam = { x: 1000, y: lerp(700, 380, ease.inOut(rise)), z: 1.4, ...hand(s, 109, 2, 0.3) };
    let F = [0, '255,220,200'];
    terraceB(g, s, cam, {
      pal: 'night', dof: 1, bk: 'release', base: { x: 1000, y: 560, z: 1.4 },
      sky: (q) => { F = fireworkShow(q, t, s.shot.t0 - BEAT * 2, 10, BEAT, 501, { x0: 300, w: 1300, y0: -200, h: 300, r: 110, yb: 700 }); skyLanterns(q, s, t, { t0: 230, spread: 8, x0: 200, w: 1600, y0: 700, rise: 1000, sc: 1, n: 26, seed: 404 }); },
      terrace: (q) => {
        // （官方小人：整段抬着手——先托着天灯，放手之后朝它挥手）
        const ao = { x: 1000, y: 1060, h: 440, pose: SDON() ? 'wave' : rise > 0.05 ? 'look-up' : 'hold-up', t, expr: 'laugh', look: [0, -1], flip: false };
        adele(q, ao);
        const hp = SDON() ? liftAt(ao, [1000, 560]) : anchor('adele-alter', Object.assign({}, ao, { pose: 'hold-up' }), 'handN', [1000, 560]);
        const ly = lerp(hp[1] - (SDON() ? 70 : 60), -400, ease.in(rise)), lx = hp[0] + Math.sin(t * 0.8) * 20 * rise;
        // 天灯（大）
        E.glow(q, lx, ly, 160, '255,180,110', 0.6); q.fillStyle = '#ffd6a0'; q.beginPath(); q.moveTo(lx - 50, ly - 70); q.lineTo(lx + 50, ly - 70); q.lineTo(lx + 40, ly + 60); q.lineTo(lx - 40, ly + 60); q.closePath(); q.fill();
        q.strokeStyle = 'rgba(160,90,40,0.6)'; q.lineWidth = 2; q.stroke(); E.glow(q, lx, ly + 40, 40, '255,244,220', 0.9);
        E.text(q, '晴', lx, ly + 10, { size: 40, weight: 900, color: 'rgba(200,90,60,0.8)' });
        // 两只小羊扒着天灯一起飞了一小段
        for (let i = 0; i < 2; i++) if (rise < 0.5) lamb(q, s, lx - 40 + i * 80, ly + 90, 56, { id: 5001 * 16 + i, pose: 'float', expr: 'happy', glow: 0.8, flip: i === 1 });
      },
    });
    s.post.fill(g, `rgb(${F[1]})`, 0.08 * F[0], 'lighter');
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 57 · 最大的一朵（249.46 → 254.04）：金色的大羊烟花；她和凯勒老师大笑；天上的多利眨了眨眼 ---------- */
  function shotFinale(g, s) {
    const t = s.t, lt = s.lt, t0 = s.shot.t0;
    const big = t0 + BEAT * 3, a = t - big;
    const cam = { x: 960, y: 500, z: 1.0 + clamp(a / 3) * 0.06, ...(a > 0 && a < 0.5 ? shake(s, 6 * (1 - a / 0.5), 111) : hand(s, 111, 2, 0.3)) };
    let F = [0, '255,220,200'];
    terraceB(g, s, cam, {
      pal: 'night', fg: [['palm', 'tr', { depth: 1.5 }]],
      sky: (q) => {
        withAlpha(q, 0.35 + 0.3 * clamp(a / 1), (qq) => dollyD(qq, s, 1500, 520, 520, 1, { expr: a > 1.5 && a < 1.8 ? 'closed' : 'smile', look: [-0.6, 0.5], rgb: '200,150,220', rgb2: '240,200,240', a: 0.5, light: { color: '#a898d8', amount: 0.45 } }));
        F = fireworkShow(q, t, t0 - 1, 8, BEAT * 0.5, 511, { x0: 200, w: 1500, y0: 60, h: 300, r: 110, yb: 700 });
        if (a > -0.5) { firework(q, 900, 260, 330, a, 1, true, 0.5, 700); if (a > 0 && a < 1) { F = [Math.exp(-a * 2.5), '255,210,140']; } }
      },
      sea: (q) => skyLanterns(q, s, t, { t0: 238, spread: 10, x0: -200, w: 2300, y0: 700, rise: 700, sc: 0.8, n: 24, seed: 405 }),
      terrace: (q) => {
        // 凯勒老师背靠栏杆，看着她和小羊们跳起来，笑出了声（官方立绘绑定；烟花在身后，轮廓被照亮）
        keller(q, { x: 700, y: 1010, h: 380 * KH(), pose: a > 0.2 ? 'cheer' : 'turn', turn: 0.8, t, expr: 'laugh', flip: false, shadow: false,
          rig: { expr: [[big - 3, 8], [big + 0.2, 9]], look: (tt) => [0.65, 0.15 - 0.4 * sst(big + 0.2, big + 0.45, tt)], mouth: talkK([[big + 0.3, big + 1.1]], 19), glint: () => 0.8 * F[0], light: { color: '#c4bcf0', amount: 0.4 }, rim: { color: F[1], dir: [0.1, -1], rim: 0.5 + 0.6 * F[0], wash: 0.02 }, wind: 0.3 } }, s);
        adele(q, { x: 1000, y: 1010, h: 380, pose: a > 0.2 ? 'cheer' : 'turn', turn: 0.3, t, expr: 'laugh', flip: false, shadow: false });
        for (let i = 0; i < 5; i++) lamb(q, s, 1220 + i * 80, 822 - (a > 0.2 ? hop(fract(s.beat + i * 0.2))[0] * 30 : 0), 58, { id: 5026 * 16 + i, pose: a > 0.2 ? 'jump' : 'sit', expr: 'happy', flip: false, glow: 0.8 });
      },
    });
    s.post.fill(g, `rgb(${F[1]})`, 0.12 * F[0], 'lighter');
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 58 · 最后一点火星（254.04 → 256.32）：火星慢慢落下；她手里的卡片，三个蹄印都亮着 ---------- */
  function shotLastSpark(g, s) {
    const t = s.t, lt = s.lt;
    g.fillStyle = vg(g, 0, VH, [[0, '#070a26'], [1, '#221a48']]); g.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 40; i++) { const u = clamp((lt + hash(521, i) * 1.5) / 3), x = hash(522, i) * VW, y = 100 + u * 900 + Math.sin(t + i) * 10; E.glow(g, x, y, 10, '255,210,150', (1 - u) * 0.9); }
    const cam = { x: 960, y: 540, z: 1 + lt * 0.03 };
    inCam(g, cam, 1, (q) => {
      // 手掌在卡片后面（先画），拇指压在卡片前面（后画）
      q.save(); q.translate(960, 560); q.rotate(-0.03); gripHand(q, 504, 308, 1.6, 1, false); gripHand(q, -504, 308, 1.6, -1, false); q.restore();
      tradeCard(q, s, 960, 560, 1.4, -0.03, 3, t);
      q.save(); q.translate(960, 560); q.rotate(-0.03); gripHand(q, 504, 308, 1.6, 1, true); gripHand(q, -504, 308, 1.6, -1, true); q.restore();
      E.glow(q, 960, 560, 700, '255,200,220', 0.2 + 0.1 * Math.sin(t * 2));
    });
    s.post.fill(g, '#1a1040', 0.15, 'multiply');
    vig(g, s, 0.55);
  }

  /* =========================================================
   * 尾声 · 晚安（256.32 → 283.43）：接「雾中之忆」的开头
   * ========================================================= */
  /* ---------- 镜头 59 · 晚安（256.32 → 260.89）：博物馆门口，凯勒老师提着灯下山；最后的烟花散了，城里的灯还亮着 ---------- */
  function shotGoodnight(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: lerp(1120, 1180, lt / 4.6), y: 760, z: 1.2, ...hand(s, 121, 2, 0.25) };
    museumD(g, s, cam, {
      pal: 'night', bk: 'gn', base: { x: 1150, y: 760, z: 1.2 }, fg: [['palm', 'tl', { depth: 1.5 }]],
      sky: (q) => { const a = t - 256.2; if (a > -0.5) firework(q, 1500, -150, 160, a, 2, false, 0.5, 400); if (a > 0.9) firework(q, 700, -60, 110, a - 0.9, 4, true, 0.5, 400); },
      mid: (q) => {
        // 门灯亮着
        for (const lx of [1150, 1350]) { E.glow(q, lx, 747, 90, '255,200,130', 0.7); E.glow(q, lx, 747, 20, '255,240,210', 0.9); }
        // 凯勒老师提着灯站在台阶下，对她说了声“晚安”，笑着转身走进夜色里（官方立绘绑定：人淡出，灯还往前走了一段才看不见）
        const gt = s.shot.t0, kgo = clamp((lt - 2.0) / 1.3), kh = 400 * KH();
        const kx = 1500 + ease.inOut(kgo) * 40, ky = 1140 + ease.inOut(kgo) * 14;
        const ko = { x: kx, y: ky, h: kh, pose: 'wave', t, flip: true, expr: 'smile', look: [-1, 0], prop: 'lantern', alpha: 1 - ease.in(kgo),
          rig: { flip: true, expr: [[gt - 1, 8], [gt + 1.1, 9]], look: [0.6, 0.1], mouth: talkK([[gt + 0.25, gt + 1.0]], 23), light: { color: '#b8b0e8', amount: 0.45 }, rim: { color: '255,200,130', dir: [0.9, 0.2], rim: 0.7, wash: 0.1 }, wind: 0.25 } };
        if (kgo < 1) keller(q, ko, s);
        let lp = null;
        const KA0 = E.keyart;
        if (KA0 && KA0.anchors && rigOn(s, 'keller')) { const A = KA0.anchors('keller', { t, crop: KR_CROP.full, ax: 0.545, ay: 1, x: kx, y: ky + kh * 0.004, h: kh * 1.004, flip: true }); if (A && A.handR) lp = [A.handR[0], A.handR[1] + kh * 0.05]; }
        if (!lp) lp = anchor('keller', ko, 'prop', [kx + 40, 900]);
        // 提灯：细绳 + 纸灯笼；她走远时灯先往前晃着走，再慢慢暗下去
        const lx = lp[0] + ease.inOut(kgo) * 150, ly = lp[1] + ease.inOut(kgo) * 40 + Math.sin(t * 2.2) * 3, la = 1 - clamp((lt - 2.6) / 1.4);
        if (la > 0) {
          withAlpha(q, la, (qq) => {
            qq.strokeStyle = 'rgba(40,30,50,0.8)'; qq.lineWidth = 2; qq.beginPath(); qq.moveTo(lx, ly - 44); qq.lineTo(lx + Math.sin(t * 2.2) * 2, ly - 18); qq.stroke();
            qq.fillStyle = '#ffb35c'; qq.beginPath(); qq.ellipse(lx, ly, 17, 21, 0, 0, TAU); qq.fill();
            qq.fillStyle = '#6a3a2a'; qq.fillRect(lx - 9, ly - 24, 18, 5); qq.fillRect(lx - 9, ly + 19, 18, 5);
            qq.strokeStyle = 'rgba(160,80,40,0.55)'; qq.lineWidth = 1.5; for (const d of [-8, 0, 8]) { qq.beginPath(); qq.ellipse(lx, ly, Math.abs(d) + 1, 20, 0, 0, TAU); qq.stroke(); }
            E.glow(qq, lx, ly, 120, '255,200,130', 0.6); E.glow(qq, lx, ly, 26, '255,244,220', 0.9);
          });
        }
        // 她：在门口挥手，然后回头找小羊（它们都不见了）
        adele(q, mixIn({ x: 1180, y: 1034, h: 400, pose: lt < 2.2 ? 'wave' : 'look-up', t, flip: false, expr: lt < 2.2 ? 'smile' : 'neutral', look: lt < 2.2 ? [1, 0] : [-1, 0.2] }, 'wave', 2.2, 0.25, lt));
        if (lt > 2.8) pop(q, '？', 1110, 560, clamp((lt - 2.8) / 0.25), { size: 50, color: '#c8b8ff', stroke: 'rgba(30,20,60,0.8)' });
      },
    });
    vig(g, s, 0.5);
  }
  /* ---------- 镜头 60 · 敲门声（260.89 → 265.46）：“叩、叩”——门开了，门外没有人，只有一只写着 SIESTA 的木箱，嗡嗡地冒着泡 ---------- */
  function shotKnock(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const open = ease.inOut(clamp((bt - 2.2) / 0.8));
    const cam = { x: 1250, y: 880, z: 2.1 + lt * 0.02, ...hand(s, 123, 2, 0.25) };
    museumD(g, s, cam, {
      pal: 'night', bk: 'door', base: { x: 1250, y: 880, z: 2.1 },
      mid: (q) => {
        const [dx, dy] = MZ.door;
        // 门里的暖光（门开得越大，光越多）
        if (open > 0) {
          q.save(); archPath(q, dx, dy, 150, 250); q.clip();
          q.fillStyle = vg(q, dy - 125, dy + 125, [[0, '#ffcf86'], [1, '#e8a060']]); q.fillRect(dx - 80, dy - 130, 160, 260);
          // 门扇向里转（左右两扇变窄）
          q.fillStyle = '#1e1630'; const w = 68 * (1 - open * 0.8); q.fillRect(dx - 72, dy - 70, w, 190); q.fillRect(dx + 72 - w, dy - 70, w, 190);
          q.restore();
          // 光铺到门口的台阶上
          additive(q, (qq) => { qq.fillStyle = `rgba(255,200,130,${0.35 * open})`; qq.beginPath(); qq.moveTo(dx - 70, dy + 120); qq.lineTo(dx + 70, dy + 120); qq.lineTo(dx + 200, 1180); qq.lineTo(dx - 200, 1180); qq.closePath(); qq.fill(); });
          // 她：站在门里，歪着头，笑了
          adele(q, { x: dx, y: dy + 118, h: 250, pose: 'stand', t, flip: false, expr: bt > 4.5 ? 'smile' : 'surprise', headPose: bt > 4 ? 'tilt' : undefined, look: [0, 0.8], alpha: open, rim: '255,200,140', shadow: false });
        }
        // 门外台阶上的木箱（嗡嗡地微微发抖，冒一个气泡）
        crate(q, s, dx + 10, 1062, 0.5, { hum: 1, leak: 0.25 + 0.15 * Math.sin(t * 5) });
        const bu = fract(lt * 0.35);
        bubble(q, dx + 40 + Math.sin(bu * 6) * 8, 940 - bu * 240, 9, Math.sin(PI * bu) * 0.9);
        // 一小撮粉色的毛（挂在箱子的钉子上）+ 台阶上一个粉色的小蹄印
        q.fillStyle = '#ffc0dc'; for (const [x, y, r] of [[dx + 82, 972, 7], [dx + 90, 966, 6], [dx + 88, 976, 5]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); }
        q.fillStyle = 'rgba(255,140,190,0.8)'; q.beginPath(); q.ellipse(dx - 70, 1068, 7, 9, -0.2, 0, TAU); q.ellipse(dx - 56, 1066, 7, 9, 0.2, 0, TAU); q.fill();
        // “叩、叩”
        if (bt < 2.2) for (let i = 0; i < 2; i++) pop(q, '叩', dx + 110 + i * 40, 820 - i * 20, clamp((bt - 0.5 - i * 0.5) / 0.15) * (1 - clamp((bt - 1.8) / 0.3)), { size: 34, color: '#ffe6c8', stroke: 'rgba(30,20,60,0.85)' });
      },
    });
    vig(g, s, 0.55);
  }

  /* =========================================================
   * 标本室（夜）——与「雾中之忆」同一间：门在左、标本柜、火山剖面画、钟、右墙的窗、书桌与台灯、椅背上的外套、窗下角落的货箱
   * 世界坐标 1920×1080
   * ========================================================= */
  // 与「雾中之忆」的标本室同一套布局：货箱立在书桌右前方的地板上（比桌腿更靠近镜头），椅子（搭着外套）在书桌左边
  const RM = { lamp: [1330, 598], desk: [800, 1560, 740], crate: [1730, 1062], door: [60, 250], chair: [640, 752], adele: [1150, 985], win: [1560, 160, 300, 470], seat: 196 };
  function specimenN(q, type, x, y, R) {
    const ink = 'rgba(40,20,24,0.85)';
    q.lineWidth = 2; q.strokeStyle = ink;
    if (type === 'rock') {
      const w = 44 + R() * 40, h = 26 + R() * 30, col = pick(['#cfc4b4', '#2a2430', '#6a6070', '#a88a70', '#8a5a4a', '#e0d28a'], R());
      const pts = rockPts(x + w / 2, y - h / 2, w / 2, h / 2, (R() * 1000) | 0, 9, 0.2).map(([a, b]) => [a, Math.min(y, b)]);
      blob(q, pts); q.fillStyle = col; q.fill(); q.stroke();
      q.fillStyle = 'rgba(255,255,255,0.28)'; q.beginPath(); q.ellipse(x + w * 0.36, y - h * 0.7, w * 0.16, h * 0.12, -0.4, 0, TAU); q.fill();
      if (col === '#cfc4b4') { q.fillStyle = 'rgba(80,60,60,0.45)'; for (let i = 0; i < 7; i++) { q.beginPath(); q.arc(x + w * (0.2 + R() * 0.6), y - h * (0.2 + R() * 0.6), 1.5 + R() * 2, 0, TAU); q.fill(); } }
      q.fillStyle = '#f4ecdc'; q.fillRect(x + w / 2 - 10, y - 8, 20, 8);
      return w;
    }
    if (type === 'jar') {
      const w = 40 + R() * 16, h = 70 + R() * 30, fill = pick(['#9a8a92', '#c8a878', '#e2b8c8', '#6a5a60', '#b8c8a0'], R());
      rrect(q, x, y - h, w, h, 8); q.fillStyle = 'rgba(210,225,235,0.35)'; q.fill();
      q.save(); rrect(q, x, y - h, w, h, 8); q.clip(); q.fillStyle = fill; q.fillRect(x, y - h * (0.45 + R() * 0.3), w, h); q.restore();
      rrect(q, x, y - h, w, h, 8); q.stroke();
      q.fillStyle = pick(['#8a3a3a', '#6a5a3a', '#3a4a5a'], R()); q.fillRect(x - 3, y - h - 10, w + 6, 12); q.strokeRect(x - 3, y - h - 10, w + 6, 12);
      q.fillStyle = '#f4ecdc'; q.fillRect(x + 6, y - h * 0.62, w - 12, 16); q.fillStyle = 'rgba(60,40,30,0.6)'; q.fillRect(x + 10, y - h * 0.62 + 6, w - 20, 2);
      q.fillStyle = 'rgba(255,255,255,0.4)'; q.fillRect(x + 5, y - h + 6, 4, h - 14);
      return w;
    }
    if (type === 'crystal') {
      const w = 60 + R() * 20, col = pick([['#b48ae0', '#7a52b0'], ['#f0e070', '#b09a30'], ['#e8e4f4', '#a8a0c0']], R());
      q.fillStyle = '#5a4a50'; blob(q, rockPts(x + w / 2, y - 10, w / 2, 12, 5, 7, 0.15)); q.fill(); q.stroke();
      for (let i = 0; i < 5; i++) { const cx = x + w * (0.2 + i * 0.15), hh = 30 + R() * 40, ww = 7 + R() * 6, a = (i - 2) * 0.22; q.save(); q.translate(cx, y - 12); q.rotate(a); q.beginPath(); q.moveTo(-ww, 0); q.lineTo(-ww, -hh); q.lineTo(0, -hh - ww * 1.6); q.lineTo(ww, -hh); q.lineTo(ww, 0); q.closePath(); q.fillStyle = col[0]; q.fill(); q.stroke(); q.fillStyle = col[1]; q.fillRect(0, -hh, ww, hh); q.restore(); }
      return w;
    }
    if (type === 'books') {
      let w = 0; const n = 3 + ((R() * 3) | 0);
      for (let i = 0; i < n; i++) { const bw = 13 + R() * 7, bh = 80 + R() * 40, col = pick(['#7a2e3a', '#2e4a6a', '#3e5a3a', '#6a4a2a', '#4a3a6a', '#8a6a3a'], R()); q.fillStyle = col; q.fillRect(x + w, y - bh, bw, bh); q.strokeRect(x + w, y - bh, bw, bh); q.fillStyle = '#d8b060'; q.fillRect(x + w + 2, y - bh + 10, bw - 4, 3); q.fillRect(x + w + 2, y - 16, bw - 4, 3); w += bw; }
      return w;
    }
    if (type === 'dome') {
      const w = 64, h = 96;
      q.fillStyle = '#4a2c24'; q.fillRect(x - 4, y - 10, w + 8, 10);
      blob(q, rockPts(x + w / 2, y - 26, 18, 14, 3, 8, 0.2)); q.fillStyle = '#1e1a24'; q.fill();
      q.beginPath(); q.moveTo(x, y - 10); q.lineTo(x, y - h + w / 2); q.arc(x + w / 2, y - h + w / 2, w / 2, PI, 0); q.lineTo(x + w, y - 10);
      q.fillStyle = 'rgba(200,220,240,0.14)'; q.fill(); q.stroke();
      return w;
    }
    if (type === 'model') {
      const w = 110, h = 70;
      q.fillStyle = '#6a4a3a'; q.fillRect(x - 4, y - 8, w + 8, 8);
      q.beginPath(); q.moveTo(x, y - 8); q.quadraticCurveTo(x + w * 0.38, y - 18, x + w * 0.44, y - h); q.lineTo(x + w * 0.56, y - h); q.quadraticCurveTo(x + w * 0.62, y - 18, x + w, y - 8); q.closePath();
      q.fillStyle = '#5a4a58'; q.fill(); q.stroke();
      q.fillStyle = '#e0603a'; q.beginPath(); q.moveTo(x + w * 0.44, y - h); q.lineTo(x + w * 0.56, y - h); q.lineTo(x + w * 0.53, y - h + 22); q.lineTo(x + w * 0.49, y - h + 34); q.closePath(); q.fill();
      return w;
    }
    const w = 76;
    q.fillStyle = '#7a4a34'; q.fillRect(x, y - 18, w, 18); q.strokeRect(x, y - 18, w, 18);
    for (let i = 0; i < 6; i++) { q.fillStyle = pick(['#cfc4b4', '#2a2430', '#a88a70', '#e0d28a', '#8a5a4a'], R()); q.beginPath(); q.ellipse(x + 8 + (i % 3) * 24 + 4, y - 14 + ((i / 3) | 0) * 3, 7, 4, 0, 0, TAU); q.fill(); }
    return w;
  }
  function roomBackN(q) {
    const ink = '#2a1418';
    q.fillStyle = vg(q, 0, 900, [[0, '#a88a92'], [1, '#b89aa0']]); q.fillRect(-400, -200, VW + 800, 1100);
    q.fillStyle = 'rgba(120,80,90,0.12)'; for (let x = -414; x < VW + 400; x += 46) q.fillRect(x, 30, 16, 720);
    q.fillStyle = 'rgba(255,255,255,0.08)'; for (let x = -391; x < VW + 400; x += 46) for (let y = 60; y < 740; y += 70) { q.beginPath(); q.arc(x + 8, y + (Math.abs(Math.round(x / 46)) % 2) * 35, 4, 0, TAU); q.fill(); }
    q.fillStyle = '#7a5a54'; q.fillRect(-400, -200, VW + 800, 230); q.fillStyle = '#9a7a70'; q.fillRect(-400, 30, VW + 800, 6);
    q.fillStyle = '#6e4a3e'; q.fillRect(-400, 740, VW + 800, 160); q.fillStyle = '#8a6050'; q.fillRect(-400, 740, VW + 800, 8);
    for (let x = -280; x < VW + 400; x += 150) { q.strokeStyle = 'rgba(40,20,16,0.5)'; q.lineWidth = 3; q.strokeRect(x, 770, 120, 110); q.strokeStyle = 'rgba(255,220,190,0.15)'; q.lineWidth = 2; q.strokeRect(x + 3, 773, 120, 110); }
    q.fillStyle = '#6a4638'; q.fillRect(-400, 900, VW + 800, 500);
    for (let i = -20; i < 40; i++) { const x0 = 960 + i * 110, x1 = 960 + i * 190; q.strokeStyle = 'rgba(40,20,16,0.45)'; q.lineWidth = 2.5; q.beginPath(); q.moveTo(x0, 900); q.lineTo(x1, 1080); q.stroke(); }
    for (let j = 0; j < 8; j++) { const y = 900 + Math.pow(j / 5, 1.3) * 180; q.strokeStyle = 'rgba(40,20,16,0.25)'; q.lineWidth = 1.5; q.beginPath(); q.moveTo(-400, y); q.lineTo(VW + 400, y); q.stroke(); }
    q.fillStyle = '#3a2420'; q.fillRect(-400, 896, VW + 800, 8);
    q.fillStyle = '#7a3a4a'; q.beginPath(); q.moveTo(760, 940); q.lineTo(1500, 940); q.lineTo(1600, 1060); q.lineTo(680, 1060); q.closePath(); q.fill();
    q.strokeStyle = '#d8a060'; q.lineWidth = 4; q.beginPath(); q.moveTo(780, 950); q.lineTo(1482, 950); q.lineTo(1570, 1050); q.lineTo(708, 1050); q.closePath(); q.stroke();
    // 门（左）
    q.fillStyle = '#5a3a30'; q.fillRect(60, 300, 190, 600); q.strokeStyle = ink; q.lineWidth = 4; q.strokeRect(60, 300, 190, 600);
    q.fillStyle = '#4a2e26'; q.fillRect(84, 330, 142, 160); q.fillRect(84, 520, 142, 350);
    q.fillStyle = '#8a86b0'; q.fillRect(98, 344, 114, 132);
    q.strokeStyle = '#4a2e26'; q.lineWidth = 5; q.beginPath(); q.moveTo(155, 344); q.lineTo(155, 476); q.moveTo(98, 410); q.lineTo(212, 410); q.stroke();
    q.fillStyle = '#d8b060'; q.beginPath(); q.arc(222, 620, 9, 0, TAU); q.fill();
    q.fillStyle = '#8a6a50'; q.fillRect(44, 290, 222, 14); q.fillRect(44, 290, 14, 610); q.fillRect(252, 290, 14, 610);
    // 标本柜
    const SX0 = 300, SX1 = 770, rows = [250, 420, 590, 750];
    q.fillStyle = '#5a3428'; q.fillRect(SX0 - 22, 92, SX1 - SX0 + 44, 808); q.fillStyle = '#3a2018'; q.fillRect(SX0, 112, SX1 - SX0, 640);
    q.fillStyle = '#7a4a34'; q.fillRect(SX0 - 30, 84, SX1 - SX0 + 60, 18);
    const R = E.rng(17);
    const types = ['rock', 'jar', 'crystal', 'books', 'rock', 'dome', 'box', 'rock', 'jar', 'model'];
    rows.forEach((y, r) => {
      q.fillStyle = '#7a4a34'; q.fillRect(SX0 - 10, y, SX1 - SX0 + 20, 16); q.fillStyle = '#9a6448'; q.fillRect(SX0 - 10, y, SX1 - SX0 + 20, 4);
      if (r === 3) return;
      let x = SX0 + 12 + R() * 10;
      while (x < SX1 - 70) { const tp = types[(R() * types.length) | 0]; if (tp === 'model' && x > SX1 - 150) continue; const w = specimenN(q, tp, x, y, R); x += w + 10 + R() * 16; }
    });
    q.fillStyle = '#5a3428'; q.fillRect(SX0, 766, SX1 - SX0, 134); q.strokeStyle = ink; q.lineWidth = 3; q.strokeRect(SX0 + 8, 774, (SX1 - SX0) / 2 - 12, 118); q.strokeRect(SX0 + (SX1 - SX0) / 2 + 4, 774, (SX1 - SX0) / 2 - 12, 118);
    q.strokeStyle = ink; q.lineWidth = 4; q.strokeRect(SX0 - 22, 92, SX1 - SX0 + 44, 808);
    // 火山剖面（画框）
    q.fillStyle = '#4a2c24'; q.fillRect(826, 136, 368, 312); q.fillStyle = '#efe4cf'; q.fillRect(842, 152, 336, 280);
    q.save(); q.beginPath(); q.rect(842, 152, 336, 280); q.clip();
    q.fillStyle = '#a8c8e0'; q.fillRect(842, 152, 336, 110);
    for (let i = 0; i < 5; i++) { q.fillStyle = ['#b89070', '#a07858', '#8a6848', '#c8a880', '#9a7a60'][i]; q.beginPath(); q.moveTo(842, 290 + i * 30); for (let x = 842; x <= 1178; x += 24) q.lineTo(x, 290 + i * 30 + Math.sin(x * 0.03 + i) * 6); q.lineTo(1178, 440); q.lineTo(842, 440); q.closePath(); q.fill(); }
    q.fillStyle = '#6a5a58'; q.beginPath(); q.moveTo(900, 300); q.quadraticCurveTo(990, 280, 1000, 200); q.lineTo(1024, 200); q.quadraticCurveTo(1034, 280, 1120, 300); q.closePath(); q.fill();
    q.fillStyle = '#e0603a'; q.beginPath(); q.ellipse(1012, 400, 70, 22, 0, 0, TAU); q.fill(); q.fillRect(1006, 200, 12, 200);
    q.fillStyle = '#ffb060'; q.beginPath(); q.ellipse(1012, 400, 40, 11, 0, 0, TAU); q.fill();
    q.restore();
    E.text(q, '火山剖面 · SIESTA', 1010, 176, { font: 'hand', size: 18, color: '#5a3020' });
    q.strokeStyle = ink; q.lineWidth = 4; q.strokeRect(826, 136, 368, 312);
    // 钟
    q.fillStyle = '#5a3428'; q.beginPath(); q.arc(1340, 214, 64, 0, TAU); q.fill(); q.fillStyle = '#f4ecdc'; q.beginPath(); q.arc(1340, 214, 52, 0, TAU); q.fill();
    q.strokeStyle = ink; q.lineWidth = 3; q.beginPath(); q.arc(1340, 214, 64, 0, TAU); q.stroke();
    q.strokeStyle = '#3a2420'; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; q.lineWidth = i % 3 ? 2 : 4; q.beginPath(); q.moveTo(1340 + Math.cos(a) * 42, 214 + Math.sin(a) * 42); q.lineTo(1340 + Math.cos(a) * 50, 214 + Math.sin(a) * 50); q.stroke(); }
    // 窗（右墙）：夜
    const [wx, wy, ww, wh] = RM.win;
    q.save(); q.beginPath(); q.rect(wx, wy, ww, wh); q.clip();
    q.fillStyle = vg(q, wy, wy + wh, [[0, '#0e0c2c'], [0.7, '#2a1c4e'], [1, '#5a2a62']]); q.fillRect(wx, wy, ww, wh);
    for (let i = 0; i < 60; i++) { q.fillStyle = `rgba(255,240,250,${0.2 + hash(2, i) * 0.6})`; q.fillRect(wx + hash(3, i) * ww, wy + hash(4, i) * wh * 0.7, 1.6, 1.6); }
    q.fillStyle = '#fff4f0'; q.beginPath(); q.arc(wx + 70, wy + 90, 24, 0, TAU); q.fill(); q.fillStyle = '#0e0c2c'; q.beginPath(); q.arc(wx + 80, wy + 84, 22, 0, TAU); q.fill();
    q.fillStyle = '#140c24'; q.beginPath(); q.moveTo(wx - 20, wy + wh); q.quadraticCurveTo(wx + 150, wy + wh - 16, wx + 166, wy + 300); q.lineTo(wx + 178, wy + 294); q.lineTo(wx + 190, wy + 302); q.quadraticCurveTo(wx + 206, wy + wh - 26, wx + ww + 30, wy + wh - 8); q.lineTo(wx + ww, wy + wh); q.closePath(); q.fill();
    q.restore();
    q.fillStyle = '#7a5448'; q.fillRect(wx - 18, wy - 18, ww + 36, 18); q.fillRect(wx - 18, wy + wh, ww + 36, 22); q.fillRect(wx - 18, wy, 18, wh); q.fillRect(wx + ww, wy, 18, wh);
    q.fillRect(wx + ww / 2 - 6, wy, 12, wh); q.fillRect(wx, wy + wh * 0.46, ww, 12);
    q.strokeStyle = ink; q.lineWidth = 4; q.strokeRect(wx - 18, wy - 18, ww + 36, wh + 40);
    q.fillStyle = '#9a7060'; q.fillRect(wx - 30, wy + wh + 14, ww + 60, 14);
    for (const sd of [-1, 1]) {
      const x0 = sd < 0 ? wx - 70 : wx + ww + 6;
      q.fillStyle = '#a86078'; q.beginPath(); q.moveTo(x0, wy - 40); q.lineTo(x0 + 64, wy - 40); q.bezierCurveTo(x0 + 50, wy + 200, x0 + 70, wy + 400, x0 + 60, wy + wh + 60); q.lineTo(x0, wy + wh + 60); q.closePath(); q.fill();
      q.strokeStyle = 'rgba(60,20,30,0.35)'; q.lineWidth = 3; for (let i = 1; i < 4; i++) { q.beginPath(); q.moveTo(x0 + i * 15, wy - 30); q.bezierCurveTo(x0 + i * 13, wy + 200, x0 + i * 16, wy + 400, x0 + i * 14, wy + wh + 50); q.stroke(); }
    }
    q.fillStyle = '#6a4a3a'; q.fillRect(wx - 90, wy - 52, ww + 180, 12);
    q.fillStyle = '#b86a4a'; q.beginPath(); q.moveTo(1480, 900); q.lineTo(1546, 900); q.lineTo(1536, 960); q.lineTo(1490, 960); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
    q.fillStyle = '#3e6a4a';
    for (let i = 0; i < 7; i++) { const a = -PI / 2 + (i - 3) * 0.36; q.save(); q.translate(1513, 900); q.rotate(a + PI / 2); q.beginPath(); q.ellipse(0, -60 - (i % 2) * 20, 22, 56, 0, 0, TAU); q.fill(); q.restore(); }
  }
  function roomFrontN(q) {
    const ink = '#2a1418';
    const [x0, x1, y] = RM.desk;
    q.fillStyle = '#9a6a4c'; q.beginPath(); q.moveTo(x0 + 20, y - 18); q.lineTo(x1 - 20, y - 18); q.lineTo(x1, y + 8); q.lineTo(x0, y + 8); q.closePath(); q.fill();
    q.fillStyle = '#7a4c36'; q.fillRect(x0, y + 8, x1 - x0, 22);
    q.fillStyle = '#5e3a2a'; q.fillRect(x0 + 16, y + 30, x1 - x0 - 32, 230);
    for (const dx of [0.08, 0.56]) { const dxx = x0 + (x1 - x0) * dx; q.fillStyle = '#6e4632'; q.fillRect(dxx, y + 50, (x1 - x0) * 0.36, 86); q.strokeStyle = 'rgba(30,14,10,0.6)'; q.lineWidth = 3; q.strokeRect(dxx, y + 50, (x1 - x0) * 0.36, 86); q.fillStyle = '#d8b060'; q.fillRect(dxx + (x1 - x0) * 0.18 - 20, y + 88, 40, 8); }
    q.fillStyle = '#4a2c20'; q.fillRect(x0 + 16, y + 260, 30, 40); q.fillRect(x1 - 46, y + 260, 30, 40);
    q.strokeStyle = ink; q.lineWidth = 4; q.strokeRect(x0, y + 8, x1 - x0, 22); q.strokeRect(x0 + 16, y + 30, x1 - x0 - 32, 230);
    q.fillStyle = 'rgba(255,230,190,0.25)'; q.fillRect(x0, y + 8, x1 - x0, 3);
    for (let i = 0; i < 3; i++) { q.fillStyle = ['#3e5a3a', '#7a2e3a', '#2e4a6a'][i]; q.fillRect(x0 + 60, y - 30 - i * 16, 150 - i * 12, 15); q.strokeStyle = ink; q.lineWidth = 2; q.strokeRect(x0 + 60, y - 30 - i * 16, 150 - i * 12, 15); }
    // 标本盘（一盘小石头）
    q.fillStyle = '#5a3428'; q.fillRect(x0 + 250, y - 26, 150, 18); q.strokeRect(x0 + 250, y - 26, 150, 18);
    for (let i = 0; i < 5; i++) { q.fillStyle = pick(['#cfc4b4', '#2a2430', '#a88a70', '#e0d28a', '#8a5a4a'], hash(7, i)); q.beginPath(); q.ellipse(x0 + 268 + i * 28, y - 28, 11, 7, 0, 0, TAU); q.fill(); }
    q.fillStyle = '#3a4a6a'; q.fillRect(x0 + 440, y - 64, 40, 50); q.strokeRect(x0 + 440, y - 64, 40, 50);
    for (let i = 0; i < 4; i++) { q.strokeStyle = ['#c8323a', '#2a2a2a', '#d8b060', '#4a7ab0'][i]; q.lineWidth = 4; q.beginPath(); q.moveTo(x0 + 448 + i * 8, y - 62); q.lineTo(x0 + 440 + i * 12, y - 100 - i * 5); q.stroke(); }
    q.fillStyle = '#f6efe2'; for (let i = 0; i < 4; i++) { q.save(); q.translate(x0 + 520 + i * 3, y - 16 - i * 2); q.rotate(-0.05 + i * 0.02); q.fillRect(0, 0, 70, 12); q.restore(); }
    // 台灯（黄铜摇臂 + 墨绿灯罩）
    const [lx, ly] = RM.lamp;
    q.fillStyle = '#7a5a30'; q.beginPath(); q.ellipse(lx + 110, y - 8, 46, 12, 0, 0, TAU); q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
    q.strokeStyle = '#c8a060'; q.lineWidth = 9; q.lineCap = 'round'; q.beginPath(); q.moveTo(lx + 110, y - 14); q.lineTo(lx + 150, y - 150); q.lineTo(lx + 50, ly - 40); q.stroke();
    q.strokeStyle = '#7a5a30'; q.lineWidth = 3; q.beginPath(); q.moveTo(lx + 120, y - 14); q.lineTo(lx + 156, y - 146); q.stroke();
    q.fillStyle = '#d8b060'; q.beginPath(); q.arc(lx + 150, y - 150, 9, 0, TAU); q.fill();
    q.save(); q.translate(lx + 30, ly - 20); q.rotate(0.55);
    q.fillStyle = '#2e4a40'; q.beginPath(); q.moveTo(-26, -40); q.lineTo(26, -40); q.lineTo(62, 30); q.lineTo(-62, 30); q.closePath(); q.fill(); q.strokeStyle = ink; q.lineWidth = 3; q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.18)'; q.beginPath(); q.moveTo(-20, -36); q.lineTo(-8, -36); q.lineTo(-30, 26); q.lineTo(-48, 26); q.closePath(); q.fill();
    q.fillStyle = '#fff2c8'; q.beginPath(); q.ellipse(0, 30, 60, 10, 0, 0, TAU); q.fill();
    q.restore();
    q.lineCap = 'butt';
    q.strokeStyle = '#3a2420'; q.lineWidth = 8; q.beginPath(); q.moveTo(x1 - 150, y - 6); q.lineTo(x1 - 100, y - 20); q.stroke();
    q.strokeStyle = '#c8a060'; q.lineWidth = 5; q.beginPath(); q.ellipse(x1 - 178, y - 4, 30, 9, 0, 0, TAU); q.stroke();
  }
  function roomLightN(q) {
    q.fillStyle = '#34294e'; q.fillRect(-400, -300, VW + 800, VH + 600);
    q.globalCompositeOperation = 'lighter';
    q.fillStyle = rg(q, 1290, 690, 0, 820, [[0, 'rgba(255,210,150,1)'], [0.3, 'rgba(210,140,100,0.75)'], [0.65, 'rgba(110,60,60,0.35)'], [1, 'rgba(60,30,40,0)']]); q.fillRect(-400, -300, VW + 800, VH + 600);
    q.fillStyle = 'rgba(70,70,140,0.55)'; q.beginPath(); q.moveTo(1560, 160); q.lineTo(1860, 160); q.lineTo(1560, 1080); q.lineTo(1080, 1080); q.closePath(); q.fill();
    q.fillStyle = '#fff'; q.fillRect(RM.win[0], RM.win[1], RM.win[2], RM.win[3]);
    q.globalCompositeOperation = 'source-over';
  }
  function roomLitN(g, s, cam) {
    const c = LC(s, 'rm-light-n2', VW + 800, VH + 600, (q) => { q.translate(400, 300); roomLightN(q); }, 0.25);
    inCam(g, cam, 1, (q) => { const m = q.globalCompositeOperation; q.globalCompositeOperation = 'multiply'; q.drawImage(c, 0, 0, Math.min(c.width, (VW + 800) * s.k * 0.25), Math.min(c.height, (VH + 600) * s.k * 0.25), -400, -300, VW + 800, VH + 600); q.globalCompositeOperation = m; });
  }
  function chairBack(g, x, y) {
    g.fillStyle = '#5a3428'; g.strokeStyle = '#2a1418'; g.lineWidth = 3;
    g.fillRect(x - 70, y - 150, 14, 330); g.fillRect(x + 56, y - 150, 14, 330);
    g.fillRect(x - 76, y - 166, 152, 22); g.strokeRect(x - 76, y - 166, 152, 22);
    g.fillRect(x - 60, y - 90, 120, 12);
  }
  /*
   * 搭在椅背上的外套：照「雾中之忆」的画法重画（同样的衣身轮廓、两只垂下的袖子与红袖口、敞开前襟的红里子、
   * 下摆两道红条、腰侧红系带、同样的尺寸与位置），两部片子接起来时是同一件外套、同一把椅子
   */
  const COATC = { c: '#f1e9dd', sh: '#d6c9b6', fold: 'rgba(150,126,104,0.55)', lining: '#b8323b', stripe: '#c23b3b', ink: '#3a2228' };
  const COAT_OUTLINE = [[-0.3, -0.01], [-0.64, 0.02], [-1, 0.08], [-1.02, 0.24], [-0.95, 0.44], [-1.0, 0.72], [-1.06, 1], [-0.7, 1.012], [-0.35, 0.995], [0, 1.01], [0.35, 0.995], [0.7, 1.012], [1.06, 1], [1.0, 0.72], [0.95, 0.44], [1.02, 0.24], [1, 0.08], [0.64, 0.02], [0.3, -0.01], [0.13, 0.035], [0, 0.05], [-0.13, 0.035]];
  function coatHang(g, t, o) {
    const L = o.L, C = o.C, seed = o.seed || 0, flap = o.flap ?? 0.5, face = o.face || 1;
    const dx = 0, dy = 1, ax = 1, ay = 0;
    const sw = 0.25 * L, hw = 0.35 * L, A = flap * 0.075 * L;
    const P = (u, v) => {
      const vv = Math.max(0, v), half = sw + (hw - sw) * Math.pow(vv, 0.9);
      const w1 = Math.sin(t * 6.3 + seed + u * 1.6 + v * 3.3) * A * vv * vv, w2 = Math.sin(t * 4.7 + seed * 1.7 + v * 4.1 + u * 0.8) * A * 0.9 * vv * vv;
      return [C[0] + ax * u * half + dx * v * L + dx * w1 + ax * w2, C[1] + ay * u * half + dy * v * L + dy * w1 + ay * w2];
    };
    const lw = Math.max(1.2, L * 0.014);
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    // 袖子（先画，衣身压住袖根）
    const sleeve = (sd) => {
      const sh = P(sd, 0.08), ap = P(sd, 0.26), R = [(sh[0] + ap[0]) / 2, (sh[1] + ap[1]) / 2];
      const sway = Math.sin(t * 3.1 + seed + sd) * flap * 0.06 * L;
      const K = [R[0] + dx * 0.48 * L + ax * sd * (0.16 * L + sway), R[1] + dy * 0.48 * L + ay * sd * (0.16 * L + sway)];
      const sag = 0.03 * L, M = [(R[0] + K[0]) / 2 + dx * sag, (R[1] + K[1]) / 2 + dy * sag];
      const w0 = 0.088 * L, wc = 0.064 * L, N = 9, left = [], right = [];
      for (let k = 0; k <= N; k++) {
        const a = k / N, b = 1 - a;
        const px = b * b * R[0] + 2 * a * b * M[0] + a * a * K[0], py = b * b * R[1] + 2 * a * b * M[1] + a * a * K[1];
        let tx = 2 * b * (M[0] - R[0]) + 2 * a * (K[0] - M[0]), ty = 2 * b * (M[1] - R[1]) + 2 * a * (K[1] - M[1]); const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const w = lerp(w0, wc, a) * (1 + 0.08 * Math.sin(a * 9 + t * 4 + seed));
        left.push([px - ty * w, py + tx * w]); right.push([px + ty * w, py - tx * w]);
      }
      const tube = () => { g.beginPath(); g.moveTo(left[0][0], left[0][1]); for (const p of left) g.lineTo(p[0], p[1]); for (let k = right.length - 1; k >= 0; k--) g.lineTo(right[k][0], right[k][1]); g.closePath(); };
      tube(); g.fillStyle = COATC.c; g.fill();
      g.save(); tube(); g.clip();
      g.strokeStyle = COATC.fold; g.lineWidth = lw * 1.1; g.beginPath(); g.moveTo(right[1][0], right[1][1]); for (let k = 2; k < N; k++) g.lineTo((right[k][0] * 2 + left[k][0]) / 3, (right[k][1] * 2 + left[k][1]) / 3); g.stroke();
      g.fillStyle = COATC.stripe; g.beginPath(); g.moveTo(left[7][0], left[7][1]); g.lineTo(left[8][0], left[8][1]); g.lineTo(right[8][0], right[8][1]); g.lineTo(right[7][0], right[7][1]); g.closePath(); g.fill();
      g.restore();
      tube(); g.strokeStyle = COATC.ink; g.lineWidth = lw; g.stroke();
      const e0 = left[N], e1 = right[N];
      g.fillStyle = COATC.lining; g.beginPath(); g.ellipse((e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2, Math.hypot(e1[0] - e0[0], e1[1] - e0[1]) / 2, wc * 0.35, Math.atan2(e1[1] - e0[1], e1[0] - e0[0]), 0, TAU); g.fill(); g.stroke();
    };
    sleeve(-1); sleeve(1);
    // 衣身
    const pts = COAT_OUTLINE.map(([u, v]) => P(u, v));
    blob(g, pts); { const p0 = P(0, 0), p1 = P(0, 1), gr = g.createLinearGradient(p0[0], p0[1], p1[0], p1[1]); gr.addColorStop(0, COATC.c); gr.addColorStop(1, COATC.sh); g.fillStyle = gr; } g.fill();
    g.save(); blob(g, pts); g.clip();
    g.strokeStyle = COATC.fold; g.lineWidth = lw * 1.3;
    for (const u of [-0.55, 0.5]) { g.beginPath(); for (let k = 0; k <= 6; k++) { const p = P(u + Math.sin(k + seed) * 0.05, 0.3 + k * 0.12); k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke(); }
    if (face < 0) {
      // 敞开的前襟：露出红里子
      const l = [P(-0.05, 0.1), P(-0.08, 0.55), P(-0.15, 1.02)], r = [P(0.05, 0.1), P(0.08, 0.55), P(0.15, 1.02)];
      g.fillStyle = COATC.lining; g.beginPath(); g.moveTo(l[0][0], l[0][1]); g.quadraticCurveTo(l[1][0], l[1][1], l[2][0], l[2][1]); g.lineTo(r[2][0], r[2][1]); g.quadraticCurveTo(r[1][0], r[1][1], r[0][0], r[0][1]); g.closePath(); g.fill();
      g.strokeStyle = COATC.ink; g.lineWidth = lw * 0.8; g.stroke();
    }
    g.strokeStyle = COATC.stripe;
    for (const [v, w] of [[0.86, 0.04], [0.93, 0.018]]) { g.lineWidth = w * L; g.beginPath(); for (let k = 0; k <= 8; k++) { const p = P(-1.2 + k * 0.3, v); k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke(); }
    g.restore();
    blob(g, pts); g.strokeStyle = COATC.ink; g.lineWidth = lw; g.stroke();
    // 翻领 + 一道红边
    blob(g, [P(-0.32, -0.005), P(-0.36, -0.075), P(0, -0.1), P(0.36, -0.075), P(0.32, -0.005), P(0.13, 0.035), P(0, 0.05), P(-0.13, 0.035)]);
    g.fillStyle = COATC.c; g.fill(); g.strokeStyle = COATC.ink; g.lineWidth = lw; g.stroke();
    { const c0 = P(-0.26, -0.03), c1 = P(0, -0.06), c2 = P(0.26, -0.03); g.strokeStyle = COATC.lining; g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(c0[0], c0[1]); g.quadraticCurveTo(c1[0], c1[1], c2[0], c2[1]); g.stroke(); }
    // 腰两侧的红系带
    const tw = Math.max(1.6, 0.03 * L);
    for (const sd of [-1, 1]) {
      const a = P(sd * 0.97, 0.43);
      for (let j = 0; j < 2; j++) {
        const fl = Math.sin(t * 8 + seed + sd * 2 + j * 1.3) * flap * 0.05 * L, len = (0.2 + j * 0.06) * L;
        const ex = a[0] + dx * len * 0.9 + ax * sd * (0.05 + j * 0.03) * L + ax * fl, ey = a[1] + dy * len * 0.9 + ay * sd * (0.05 + j * 0.03) * L + ay * fl;
        g.strokeStyle = COATC.ink; g.lineWidth = tw + lw * 1.4; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(a[0] + dx * len * 0.4 + ax * sd * 0.06 * L - ax * fl, a[1] + dy * len * 0.4 + ay * sd * 0.06 * L - ay * fl, ex, ey); g.stroke();
        g.strokeStyle = COATC.stripe; g.lineWidth = tw; g.stroke();
      }
      g.fillStyle = COATC.stripe; g.strokeStyle = COATC.ink; g.lineWidth = lw * 0.8; g.beginPath(); g.ellipse(a[0], a[1], 0.035 * L, 0.028 * L, Math.atan2(ay, ax), 0, TAU); g.fill(); g.stroke();
    }
    g.restore();
  }
  function coatOnChair(g, x, y, t) {
    coatHang(g, t, { C: [x, y - 160], L: 282, face: -1, flap: 0.06, seed: 3 });
  }
  function clockHands(g, s) {
    const cx = 1340, cy = 214, beat = Math.floor(s.beat);
    const sec = beat * (TAU / 60), min = (TAU * 47) / 60 + s.t * 0.002, hr = (TAU * 1.8) / 12;
    g.strokeStyle = '#2a1418'; g.lineCap = 'round';
    g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(hr) * 26, cy - Math.cos(hr) * 26); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(min) * 40, cy - Math.cos(min) * 40); g.stroke();
    g.strokeStyle = '#c8323a'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(sec) * 46, cy - Math.cos(sec) * 46); g.stroke();
    g.lineCap = 'butt';
  }
  function roomDust(q, t, o) {
    for (let i = 0; i < o.n; i++) {
      const x = o.x + fract(hash(61, i, 1) + t * 0.01 * (hash(61, i, 2) - 0.5)) * o.w + Math.sin(t * 0.5 + i) * 10;
      const y = o.y + fract(hash(61, i, 3) - t * 0.012 * (0.3 + hash(61, i, 4))) * o.h;
      q.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.7 + i * 2.3); q.fillStyle = `rgb(${o.rgb})`; q.fillRect(x, y, 2.2, 2.2);
    }
    q.globalAlpha = 1;
  }
  /** 标本室（夜）：o: { adele(对象或 false), coat(椅背上挂着外套), crate: { x, y, hum, leak }, behind(q), onDesk(q), after(q), base, bk } */
  function roomN(g, s, cam, o = {}) {
    const t = s.t, base = o.base || { x: 960, y: 540, z: 1 };
    g.fillStyle = '#1c1218'; g.fillRect(0, 0, VW, VH);
    baked(g, s, 'rm-back-n:' + (o.bk || 'w'), base, cam, 1, roomBackN, 1.1);
    inCam(g, cam, 1, (q) => {
      clockHands(q, s);
      chairBack(q, RM.chair[0], RM.chair[1]);
      if (o.coat) coatOnChair(q, RM.chair[0], RM.chair[1], t);
      if (o.behind) o.behind(q);
      // （官方小人：家居服的纯烬坐在书桌后面——Sit；写标签、伸懒腰、趴下都改成坐着，眼睛眯着打盹）
      if (o.adele) cast(q, 'adele-alter', sdo(Object.assign({ x: RM.adele[0], y: RM.adele[1], h: 560, pose: 'write', outfit: 'home', t, expr: 'neutral', desk: RM.adele[1] - RM.desk[2] + 6, seat: RM.seat }, o.adele)));
    });
    baked(g, s, 'rm-front-n:' + (o.bk || 'w'), base, cam, 1, roomFrontN, 1.1, [778, 476, 1622, 1052]);
    inCam(g, cam, 1, (q) => {
      // 货箱：书桌右前方的地板上（在桌子前面画，和「雾中之忆」一样）
      const c = o.crate || {}, cx = c.x ?? RM.crate[0], cy = c.y ?? RM.crate[1];
      if (cx > -1000) { groundShadow(q, cx, cy + 2, 150 * 0.86 * 1.08, 0.9); crate(q, s, cx, cy, 0.86, { hum: c.hum || 0, leak: c.leak ?? 0.12 + 0.1 * Math.sin(t * 2) }); }
      if (o.onDesk) o.onDesk(q);
    });
    roomLitN(g, s, cam);
    inCam(g, cam, 1, (q) => {
      const [lx, ly] = RM.lamp;
      E.glow(q, lx + 18, ly + 6, 60, '255,236,200', 0.9);
      E.glow(q, lx, ly + 60, 380, '255,190,120', 0.22);
      q.save(); q.globalCompositeOperation = 'lighter';
      q.fillStyle = vg(q, ly, RM.desk[2], [[0, 'rgba(255,220,160,0.45)'], [1, 'rgba(255,200,130,0.12)']]);
      q.globalAlpha = 0.5; q.beginPath(); q.moveTo(lx - 10, ly + 2); q.lineTo(lx + 50, ly + 30); q.lineTo(lx + 60, RM.desk[2] - 6); q.lineTo(lx - 250, RM.desk[2] - 6); q.closePath(); q.fill();
      q.restore();
      roomDust(q, t, { x: lx - 260, y: ly, w: 330, h: RM.desk[2] - ly, n: 26, rgb: '255,220,170' });
      if (o.after) o.after(q);
    });
  }
  /** 桌上的标签卡（小卡片） */
  function labelCard(g, x, y, sc, write) {
    g.save(); g.translate(x, y); g.rotate(-0.06); g.scale(sc, sc);
    g.fillStyle = '#fbf5e8'; rrect(g, -60, -40, 120, 40, 4); g.fill(); g.strokeStyle = '#6a5040'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#c8323a'; g.fillRect(-60, -40, 6, 40);
    g.fillStyle = 'rgba(60,40,40,0.6)'; g.fillRect(-44, -30, 60, 3); g.fillRect(-44, -18, 44 * clamp(write + 0.3), 3);
    g.restore();
  }
  /* ---------- 镜头 61 · 拖进来（265.46 → 270.04）：她把木箱推进标本室，一直推到书桌旁、窗下的角落 ---------- */
  function shotDrag(g, s) {
    const t = s.t, lt = s.lt;
    const u = sst(0.2, 3.9, lt);
    // 路线：从书桌前面推过去，最后推进窗下的角落（书桌右边，不会被桌子挡住）；推得不快（箱子挺沉）
    const cx = lerp(1060, RM.crate[0], u), cy = lerp(1070, RM.crate[1], sst(0.7, 1, u));
    // 官方小人在箱子前面倒退着拉：镜头往右多带一点，把她和箱子都框进来
    const sdDrag = sdOn(s, 'char_1016_agoat2/build');
    const cam = { x: sdDrag ? lerp(1200, 1480, u) : lerp(1080, 1300, u), y: 620, z: 1.3, ...hand(s, 125, 2, 0.25) };
    roomN(g, s, cam, {
      bk: sdDrag ? 'drag-sd' : 'drag', base: { x: sdDrag ? 1340 : 1070, y: 620, z: 1.3 },
      crate: { x: -2000, y: RM.crate[1] }, // 箱子改在书桌前面画（下面 onDesk）
      adele: false,
      onDesk: (q) => {
        const moving = u > 0.02 && u < 0.98;
        crate(q, s, cx, cy, 0.86, { hum: 1, leak: 0.2 });
        const AK = 'char_1016_agoat2/build';
        if (sdOn(s, AK)) {
          // 官方小人：站在箱子右边、面朝箱子，拉着绳子倒退着走（Move 倒放）；动画时间 = 箱子走过的路 ÷ 模型的步速（脚底不打滑，速度跟着箱子一起加减）
          const h = 470, ax = cx + 129 + 150, ay = cy + 8;
          let G = 0; try { const gg = E.sd.gait(AK, { h }); G = gg && gg.speed > 1 ? gg.speed : 0; } catch (e) { G = 0; }
          // 起步 / 停下时 Relax ↔ Move 交叉淡化（不硬切）
          const travel = cx - 1060, mk = G ? sst(0.0, 0.06, u) * (1 - sst(0.94, 1.0, u)) : 0;
          const o2 = { x: ax, y: ay, h, flip: true, from: { anim: 'Relax', t, speed: 1, phase: 0 }, to: { anim: 'Move', t: G ? -travel / G : 0, speed: 1, phase: 0 }, k: mk, solo: true };
          groundShadow(q, ax, ay, h * 0.27, 0.22);
          E.sd.draw(q, AK, o2);
          const A = E.sd.anchors(AK, o2), hp = (A && A.handN) || [ax - 60, ay - h * 0.4];
          // 绳子：手 → 箱子右上角的把手（微微下垂）
          const ex = cx + 122, ey = cy - 150;
          q.strokeStyle = '#8a6a4a'; q.lineWidth = 4; q.lineCap = 'round';
          q.beginPath(); q.moveTo(hp[0], hp[1]); q.quadraticCurveTo((hp[0] + ex) / 2, Math.max(hp[1], ey) + (moving ? 6 : 18), ex, ey); q.stroke(); q.lineCap = 'butt';
          q.fillStyle = '#6a4a30'; q.fillRect(ex - 6, ey - 8, 12, 16);
        } else {
          const v = 670 * 1.5 / 3.7 * Math.sin(PI * u);
          adele(q, { x: cx - 250, y: cy + 8, h: 470, pose: moving ? 'walk' : 'stand', arms: moving ? 'reach' : undefined, aim: -0.3, rot: moving ? 0.1 : 0, t, speed: stepRate('adele-alter', 470, Math.max(40, v)), expr: moving ? 'determined' : 'smile', flip: false, look: [1, 0.3], shadow: false });
        }
        if (lt > 3.9) { const bu = fract((lt - 3.9) * 0.5); bubble(q, RM.crate[0] + 20, RM.crate[1] - 210 - bu * 200, 10, Math.sin(PI * bu)); }
      },
    });
    vig(g, s, 0.55);
  }
  /* ---------- 镜头 62 · 趴下了（270.04 → 274.60）：夜深了——她换了家居服，外套挂在椅背上；整理标本、打个哈欠、趴在桌上（接「雾中之忆」） ---------- */
  function shotDozeDesk(g, s) {
    const t = s.t, lt = s.lt, bt = s.beat - T0beat(s);
    const k = ease.inOut(clamp(lt / 4.5));
    const cam = { x: lerp(1040, 1120, k), y: lerp(560, 580, k), z: lerp(1.08, 1.16, k), ...hand(s, 127, 2, 0.25) };
    const pose = bt < 2 ? { pose: 'write', expr: 'neutral', look: [0.6, 0.5] } : bt < 4 ? { pose: 'sit', arms: 'stretch', expr: 'sleepy', look: [0.3, -0.6] } : bt < 5.5 ? { pose: 'write', expr: 'sleepy', look: [0.6, 0.5] } : { pose: 'sleep', expr: 'closed' };
    roomN(g, s, cam, {
      bk: 'desk', coat: true,
      adele: pose,
      onDesk: (q) => { bottle(q, s, 1440, RM.desk[2] - 4, 120, 0); fizz(q, t, { t0: s.shot.t0 - 1, x: 1440, y: RM.desk[2] - 118, n: 10, dur: 6, speed: 30, r: 3, rise: 30, life: 2.4, ang: -PI / 2, spread: 0.3, seed: 561 }); labelCard(q, 1238, RM.desk[2] - 8, 0.9, 0.2); },
      after: (q) => {
        if (bt > 2 && bt < 4) pop(q, '哈——啊', 1240, 400, clamp((bt - 2.2) / 0.3) * (1 - clamp((bt - 3.6) / 0.3)), { size: 36, color: '#ffe0c8', stroke: 'rgba(40,20,40,0.8)' });
        if (bt > 5.8) for (let i = 0; i < 3; i++) { const u = fract(lt * 0.7 + i / 3); withAlpha(q, Math.sin(PI * u) * 0.8, (qq) => E.text(qq, 'z', 1220 + u * 60 + i * 8, 470 - u * 90, { font: 'hand', size: 22 + u * 26, color: '#ffe8f0' })); }
      },
    });
    // 慢慢沉进夜的蓝色
    s.post.fill(g, '#0a1030', clamp((lt - 3.2) / 1.3) * 0.85);
    vig(g, s, 0.55);
  }
  /* ---------- 镜头 63 · 片尾（274.60 → 283.43）：夜里的博物馆，只有一扇窗亮着；片名与字幕 ---------- */
  function shotEnd(g, s) {
    const t = s.t, lt = s.lt;
    const cam = { x: lerp(1000, 1020, lt / 9), y: lerp(380, 400, lt / 9), z: lerp(0.66, 0.69, lt / 9) };
    museumD(g, s, cam, {
      pal: 'night', bk: 'end', base: { x: 1010, y: 390, z: 0.67 },
      sky: (q) => { q.save(); q.translate(1320, -60); q.globalAlpha = 0.45; q.drawImage(sheepCloud(s, 'night'), 0, 0, 330, 210); q.restore(); },
      mid: (q) => {
        const W = MZ.win, wl = 0.85 + 0.15 * wobble(8, t * 2);
        q.save(); archPath(q, W.x, W.y, W.w, W.h); q.clip();
        q.fillStyle = vg(q, W.y - W.h / 2, W.y + W.h / 2, [[0, '#6a3a2a'], [0.5, '#c07840'], [1, '#e8a860']]); q.fillRect(W.x - 100, W.y - 170, 200, 340);
        cast(q, 'adele-alter', sdo({ x: W.x - 16, y: W.y + 170, h: 190, pose: 'sleep', outfit: 'home', t, sil: '#3a1c12', rim: '255,210,150', expr: 'closed', seat: 70 }));
        E.glow(q, W.x + 55, W.y + 55, 70, '255,230,170', 0.7 * wl);
        E.glow(q, W.x + 78, W.y + 150, 34, '255,140,210', 0.25 + 0.25 * Math.max(0, Math.sin(t * 5.3)) * Math.max(0, Math.sin(t * 1.7)));
        q.restore();
        q.strokeStyle = '#4a3c6a'; q.lineWidth = 12; archPath(q, W.x, W.y, W.w, W.h); q.stroke();
        q.lineWidth = 6; q.beginPath(); q.moveTo(W.x, W.y - W.h / 2 + 10); q.lineTo(W.x, W.y + W.h / 2); q.moveTo(W.x - W.w / 2, W.y); q.lineTo(W.x + W.w / 2, W.y); q.stroke();
        E.glow(q, W.x, W.y + 40, 260, '255,180,110', 0.28);
        for (const lx of [1150, 1350]) { E.glow(q, lx, 747, 80, '255,200,130', 0.6); }
        // 萤火一样的几点粉光
        for (let i = 0; i < 10; i++) { const x = 900 + hash(571, i) * 600 + Math.sin(t * 0.5 + i) * 30, y = 700 + hash(572, i) * 300 + Math.cos(t * 0.4 + i) * 20; E.glow(q, x, y, 8, '255,190,220', 0.3 + 0.3 * Math.sin(t * 2 + i)); }
      },
    });
    s.post.fill(g, '#0a1030', 0.25 * (1 - clamp(lt / 1.5)) + 0.1);
    // 片名
    const ta = win(t, 275.3, 276.8, 282.2, 283.4);
    if (ta > 0) {
      const c = LC(s, 'title-night', 1400, 560, (q) => titleArt(q, 'night'), 1);
      g.save(); g.globalAlpha = ta; g.translate(960, 190 - (1 - ease.out(clamp((t - 275.3) / 1.6))) * 14); g.scale(0.6, 0.6);
      E.glow(g, 0, -40, 700, '255,236,220', 0.2);
      g.drawImage(c, -700, -250, 1400, 560); g.restore();
    }
    // 字幕（歌曲信息 + 非官方声明）：放在画面下方（门前广场的位置），不挡亮着的那扇窗
    const ca = win(t, 276.2, 277.2, 282.4, 283.4);
    if (ca > 0) {
      g.save(); g.globalAlpha = ca;
      g.fillStyle = 'rgba(14,12,40,0.7)'; rrect(g, 380, 758, 1160, 302, 24); g.fill(); g.strokeStyle = 'rgba(200,220,255,0.3)'; g.lineWidth = 2; rrect(g, 392, 770, 1136, 278, 18); g.stroke();
      E.text(g, '歌曲　Misty Memory (Day Version)', 960, 812, { size: 30, weight: 700, color: '#fff6f0', spacing: 2 });
      E.text(g, '塞壬唱片-MSR / Erik Castro / Elvin Shen / David Lin / 左乙（《火山旅梦》OST）', 960, 852, { font: 'sans', size: 21, weight: 500, color: '#e6ecff', maxW: 1080 });
      E.text(g, 'MV：本页原创同人影像，与官方无关　·　角色与世界观 © Hypergryph', 960, 894, { font: 'sans', size: 22, weight: 700, color: '#fff0c8', spacing: 1, maxW: 1080 });
      E.text(g, '角色立绘 © Hypergryph（官方原画，本页分层绑定）', 960, 930, { font: 'sans', size: 19, weight: 500, color: '#d8def8', spacing: 1, maxW: 1080 });
      E.text(g, 'Q版小人 © Hypergryph（官方 Spine 模型）', 960, 962, { font: 'sans', size: 19, weight: 500, color: '#d8def8', spacing: 1, maxW: 1080 });
      E.text(g, '这一夜的梦，见「雾中之忆」', 960, 1004, { font: 'serif', size: 22, weight: 600, color: 'rgba(255,200,230,0.92)', spacing: 4 });
      g.restore();
    }
    vig(g, s, 0.45);
  }

  /** 装风的玻璃罐（木塞；caught 0..1 里面有一团小旋风） */
  function windJar(q, x, y, sc, t, caught) {
    q.save(); q.translate(x, y); q.scale(sc, sc);
    q.fillStyle = 'rgba(210,236,250,0.45)'; rrect(q, -34, -60, 68, 86, 16); q.fill(); q.strokeStyle = '#3a5a7a'; q.lineWidth = 3; q.stroke();
    q.fillStyle = 'rgba(255,255,255,0.6)'; q.fillRect(-24, -50, 7, 64);
    q.fillStyle = '#c8a070'; q.fillRect(-18, -76, 36, 18); q.strokeRect(-18, -76, 36, 18);
    if (caught > 0) {
      q.strokeStyle = `rgba(120,190,240,${0.9 * caught})`; q.lineWidth = 3; q.lineCap = 'round';
      for (let i = 0; i < 3; i++) { q.beginPath(); for (let j = 0; j <= 20; j++) { const a = t * 6 + j * 0.5 + i * 2.1, r = 6 + j * 1.1; q.lineTo(Math.cos(a) * r, -18 + Math.sin(a) * r * 0.5 - j * 0.6); } q.stroke(); }
      q.lineCap = 'butt';
      E.glow(q, 0, -18, 60, '200,236,255', 0.4 * caught);
    }
    q.restore();
  }

  /* =========================================================
   * 片级叠加层：颗粒、标题、预热
   * ========================================================= */
  /*
   * 成片调色的时间线（MVE.finish 的 look）：白天 summer-noon → 下午 golden-hour → 黄昏栈桥 siesta-sunset →
   * 入夜 night-blue（逐通道辉光，灯笼、烟花发光）→ 台灯下的标本室（golden-hour 与 night-blue 各半）→ 片尾 night-blue。
   * 各段的强度按这部片子本来的画面调过（画面里已经有自己的光与色，成片只做统一与“通透”）
   */
  let LOOKQ = null;
  function lookCues(F) {
    if (LOOKQ) return LOOKQ;
    const L = (name, o) => Object.assign({}, F.LOOKS[name], o);
    const noon = L('summer-noon', { amount: 0.75, bloom: { strength: 0.26, threshold: 0.82, tint: '255,248,230' }, vignette: 0.24, grain: 0.045 });
    const gold = L('golden-hour', { amount: 0.6, bloom: { strength: 0.32, threshold: 0.78, tint: '255,214,160', halation: 0.15 }, leak: { palette: 'warm', a: 0.2, side: 'tr' }, vignette: { a: 0.3, rgb: '30,14,4' }, grain: 0.05 });
    const dusk = L('siesta-sunset', { amount: 0.55, bloom: { strength: 0.42, threshold: 0.64, tint: '255,196,170', halation: 0.2 }, leak: { palette: 'pink', a: 0.2, side: 'tr' }, vignette: { a: 0.34, rgb: '30,10,40' }, grain: 0.055 });
    const night = L('night-blue', { amount: 0.7, bloom: { strength: 0.5, threshold: 0.7, radius: 5, key: 'rgb' }, vignette: { a: 0.46, rgb: '2,4,16' }, grain: 0.07 }); // 阈值抬高：灯笼、烟花发光，凯勒老师的银发和白外套不跟着泛白
    const study = Object.assign(F.mixLook(L('golden-hour', { amount: 0.6, leak: null }), night, 0.5), { amount: 0.6 });
    LOOKQ = [[0, noon], [D[55], gold], [D[77], dusk], [D[93] + 1.4, night], [D[116], study], [D[120], night]];
    return LOOKQ;
  }
  /** 黄昏栈桥一段的电影黑边（跑向栈桥时合上，灯亮起、看烟花之前打开） */
  function sunsetLB(t) {
    const a = D[77] + 3.5, b = D[93] + 3.6;
    if (t < a || t > b + 0.9) return 0;
    return t < b ? ease.inOut(clamp((t - a) / 2)) : 1 - ease.inOut(clamp((t - b) / 0.9));
  }
  const FW_SHOTS = new Set(['bay', 'sheep-fireworks', 'town-wide', 'release', 'finale']);
  let overlayWarned = false;
  function overlay(g, s) {
    const t = s.t, st = FST; FST++;
    const F = FIN();
    // ① 成片（辉光 → 调色 → 漏光 → 暗角 → 颗粒）放在最前面；立绘镜头上放轻（立绘已经调过色，脸和头发保持原色）
    if (F) {
      try {
        let look = F.look(t, lookCues(F), 1.5);
        if (look) {
          look = Object.assign({}, look);
          if (KAST === st) {
            look.amount = (look.amount ?? 1) * 0.3;
            if (look.bloom) look.bloom = Object.assign({}, look.bloom, { strength: (look.bloom.strength ?? 0.4) * 0.3 });
            look.leak = null; look.vignette = null;
            if (look.grain) look.grain = typeof look.grain === 'number' ? look.grain * 0.5 : Object.assign({}, look.grain, { a: (look.grain.a ?? 0.06) * 0.5 });
          } else if (SUNP.st === st && SUNP.x > -300 && SUNP.x < VW + 300 && SUNP.y > -300 && SUNP.y < VH * 0.8) {
            // 白天：太阳在画里时加一组镜头眩光（光芒 + 鬼影 + 一点横向拉丝）
            const day = t < D[77];
            look.lens = { flare: { x: SUNP.x, y: SUNP.y, a: (day ? 0.42 : 0.3) * SUNP.a, size: 0.8, rgb: day ? '255,240,214' : '255,214,170', streak: 0.25 } };
          }
          F.frame(g, s, look);
        }
        // 烟花段：画面前面飘几颗失焦的彩色光斑
        if (FW_SHOTS.has(s.shot.id)) F.bokeh(g, s, { n: 10, seed: 17, colors: ['255,196,150', '255,150,200', '180,200,255', '255,232,170'], depth: [0.35, 1], size: [30, 110], a: 0.26, drift: [6, -4], twinkle: 0.5 });
      } catch (e) { if (!overlayWarned) { overlayWarned = true; console.warn('[MV day] finish', e); } }
    }
    warmAhead(s);
    if (!F) s.post.grain(g, t, 0.035);
    // 序章（海上的早晨）用 2.35:1 的电影黑边；副歌一进来（14.30 的闪白）画面整个打开；黄昏栈桥一段（有后期工具箱时在这里、调色之后画）
    const lb = Math.max(1 - sst(13.95, 14.4, t), F ? sunsetLB(t) : 0);
    if (lb > 0) s.post['letterbox'](g, lb);
    // 片头标题（音乐的第二句进来时浮现）
    // 有后期工具箱：竖排的衬线标题（逐字“写”出来，底下一枚小红印），放在海天之间的左边空处；标题位图在开头的黑场里就先建好
    // 太阳就在左上角：用墨色版（深色字 + 浅色光晕），逆光里也读得清
    const TT = { text: '晴日之约', sub: 'MISTY MEMORY · DAY VERSION', style: 'vertical-ink', seal: '晴', x: 230, y: 470, size: 104, anim: 'ink', t0: 7.4, dur: 2.0, out: 12.9, outDur: 1.2 };
    if (F && F.title) {
      if (t > 0.2 && t < 7 && F.warmTitle) try { F.warmTitle(s, TT); } catch (e) { /* 第一次出现时再建 */ }
      if (t > 7.3 && t < 14.2) {
        try { F.title(g, s, TT); } catch (e) { if (!overlayWarned) { overlayWarned = true; console.warn('[MV day] title', e); } }
        const ta2 = win(t, 7.6, 9.2, 12.9, 14.1);
        for (let i = 0; i < 5; i++) { const a = ta2 * Math.max(0, Math.sin(t * 1.8 + i * 1.3)); star4(g, 250 + (hash(81, i) - 0.5) * 360, 470 + (hash(82, i) - 0.5) * 520, 8 + hash(83, i) * 12, t * 0.4 + i, i % 2 ? '#ffe28e' : '#ffffff', a); }
      }
      return;
    }
    if (t > 0.2 && t < 7) LC(s, 'title', 1400, 560, (q) => titleArt(q, 'day'), 1);
    const ta = win(t, 7.4, 8.8, 12.9, 14.1);
    if (ta > 0) {
      const c = LC(s, 'title', 1400, 560, (q) => titleArt(q, 'day'), 1);
      const y = 350 - (1 - ease.out(clamp((t - 7.4) / 2.2))) * 18;
      g.save(); g.globalAlpha = ta; g.translate(960, y); g.scale(0.9, 0.9);
      E.glow(g, 0, -30, 620, '255,250,235', 0.3 * ta, 'lighter', false);
      g.drawImage(c, -700, -250, 1400, 560);
      g.restore();
      for (let i = 0; i < 7; i++) { const a = ta * Math.max(0, Math.sin(t * 1.8 + i * 1.3)); star4(g, 960 + (hash(81, i) - 0.5) * 1100, y - 40 + (hash(82, i) - 0.5) * 300, 10 + hash(83, i) * 14, t * 0.4 + i, i % 2 ? '#ffe28e' : '#ffffff', a); }
    }
  }

  /* =========================================================
   * 镜头表
   * ========================================================= */
  const shots = [
    { id: 'letter', t0: 0, title: '海上的早晨', draw: shotLetter },
    { id: 'sea', t0: D[2], in: { type: 'fade', dur: 1.4 }, draw: shotSea },
    { id: 'bow', t0: D[6], title: '抵达汐斯塔', in: { type: 'flash', dur: 0.5, color: '#fffbe8' }, draw: shotBow },
    { id: 'harbor', t0: D[8], draw: shotHarbor },
    { id: 'promenade', t0: D[10], in: { type: 'slide', dur: 0.5, dir: 'left' }, draw: shotPromenade },
    { id: 'stairs', t0: D[12], draw: shotStairs },
    { id: 'museum', t0: D[14], title: '火山博物馆', in: { type: 'wipe', dur: 0.6, edge: '255,250,230' }, draw: shotMuseum },
    { id: 'keller', t0: D[16], draw: shotKeller },
    { id: 'hall', t0: D[18], in: { type: 'fade', dur: 0.5 }, draw: shotHall },
    { id: 'scope', t0: D[20], draw: shotScope },
    { id: 'lamb-pop', t0: D[22], title: '看不见的小羊', in: { type: 'flash', dur: 0.45, color: '#ffd0e4' }, draw: shotLambPop },
    { id: 'ice-cream', t0: D[24], draw: shotIceCream },
    { id: 'everywhere', t0: D[26], draw: shotEverywhere },
    { id: 'scold', t0: D[27], draw: shotScold },
    { id: 'two-worlds', t0: D[29], draw: shotTwoWorlds },
    { id: 'toys', t0: D[31], draw: shotToys },
    { id: 'gather', t0: D[32], title: '多利的交易', in: { type: 'fade', dur: 0.8 }, draw: shotGather },
    { id: 'dolly', t0: D[34], draw: shotDolly },
    { id: 'deal', t0: D[36], draw: shotDeal },
    { id: 'hush', t0: D[38], in: { type: 'fade', dur: 0.4 }, draw: shotHush },
    { id: 'gust', t0: D[39], title: '北风', in: { type: 'flash', dur: 0.45, color: '#ffffff' }, draw: shotGust },
    { id: 'vane', t0: D[41], draw: shotVane },
    { id: 'kite', t0: D[43], draw: shotKite },
    { id: 'bottle-wind', t0: D[45], draw: shotBottleWind },
    { id: 'garden', t0: D[47], title: '种子', in: { type: 'wipe', dur: 0.6, edge: '220,255,210' }, draw: shotGarden },
    { id: 'snatch', t0: D[49], draw: shotSnatch },
    { id: 'catch', t0: D[51], draw: shotCatch },
    { id: 'sprout', t0: D[53], draw: shotSprout },
    { id: 'afternoon', t0: D[55], draw: shotAfternoon },
    { id: 'wool-shop', t0: D[56], title: '羊毛', in: { type: 'fade', dur: 0.8 }, draw: shotWoolShop },
    { id: 'offers', t0: D[58], draw: shotOffers },
    { id: 'poolside', t0: D[60], in: { type: 'fade', dur: 0.5 }, draw: shotPoolside },
    { id: 'doze', t0: D[62], draw: shotDoze },
    { id: 'prep', t0: D[63], in: { type: 'flash', dur: 0.45, color: '#fff4e0' }, draw: shotPrep },
    { id: 'lantern-ride', t0: D[65], draw: shotLanternRide },
    { id: 'bunting', t0: D[67], draw: shotBunting },
    { id: 'balls', t0: D[69], draw: shotBalls },
    { id: 'beach', t0: D[71], in: { type: 'slide', dur: 0.5, dir: 'left' }, draw: shotBeach },
    { id: 'laundry', t0: D[73], draw: shotLaundry },
    { id: 'lamb-tower', t0: D[75], draw: shotLambTower },
    { id: 'run-sunset', t0: D[77], in: { type: 'fade', dur: 0.7 }, draw: shotRunSunset },
    { id: 'pier', t0: D[80], title: '黄昏的栈桥', in: { type: 'fade', dur: 1.4 }, draw: shotPier },
    { id: 'breeze', t0: D[82], in: { type: 'fade', dur: 0.8 }, draw: shotBreeze },
    { id: 'coat', t0: D[84], in: { type: 'fade', dur: 0.8 }, draw: shotCoat },
    { id: 'memory', t0: D[86], in: { type: 'fade', dur: 0.6 }, draw: shotMemory },
    { id: 'realize', t0: D[87], in: { type: 'fade', dur: 0.5 }, draw: shotRealize },
    { id: 'dolly-sunset', t0: D[89], in: { type: 'white', dur: 0.8, color: '#ffe8e0' }, draw: shotDollySunset },
    { id: 'dance', t0: D[91], draw: shotDance },
    { id: 'lights-on', t0: D[93], in: { type: 'fade', dur: 0.8 }, draw: shotLightsOn },
    { id: 'bay', t0: D[95], title: '灯与烟火', in: { type: 'flash', dur: 0.5, color: '#ffe8c0' }, draw: shotBay },
    { id: 'clink', t0: D[97], draw: shotClink },
    { id: 'rail-lambs', t0: D[99], draw: shotRailLambs },
    { id: 'sheep-fireworks', t0: D[101], draw: shotSheepFireworks },
    { id: 'fire-face', t0: D[103], draw: shotFireFace },
    { id: 'town-wide', t0: D[105], in: { type: 'fade', dur: 0.5 }, draw: shotTownWide },
    { id: 'release', t0: D[107], draw: shotReleaseLantern },
    { id: 'finale', t0: D[109], draw: shotFinale },
    { id: 'last-spark', t0: D[111], in: { type: 'fade', dur: 0.6 }, draw: shotLastSpark },
    { id: 'goodnight', t0: D[112], title: '晚安', in: { type: 'fade', dur: 1.2 }, draw: shotGoodnight },
    { id: 'knock', t0: D[114], in: { type: 'fade', dur: 0.8 }, draw: shotKnock },
    { id: 'drag', t0: D[116], in: { type: 'fade', dur: 0.6 }, draw: shotDrag },
    { id: 'doze-desk', t0: D[118], in: { type: 'black', dur: 0.9, color: '#0a0818' }, draw: shotDozeDesk },
    { id: 'end', t0: D[120], t1: DUR + 0.05, in: { type: 'fade', dur: 1.2 }, draw: shotEnd },
  ];

  /* =========================================================
   * 旁白（本页原创；不是歌词）
   * ========================================================= */
  const captions = [
    [19.4, 23.2, '船靠岸的时候，整座小镇都在晒太阳。'],
    [51.3, 55.0, '小羊们一只接一只冒了出来——只有我看得见。'],
    [79.2, 82.7, '拿北风、种子和羊毛来换吧——多利说。'],
    [129.3, 133.0, '北风装进了瓶子，种子也种下了。可是羊毛……'],
    [184.0, 187.9, '跑了一整天。海风凉下来了。'],
    [193.0, 196.6, '外套被风吹得鼓起来，暖暖的。'],
    [200.1, 203.5, '原来要找的“羊毛”，一直都穿在身上。'],
    [227.0, 230.8, '那天晚上，汐斯塔所有的灯都亮了。'],
    [262.3, 265.2, '门外没有人，只有一只轻轻冒着泡的木箱。'],
    [270.4, 273.9, '今晚，大概会做一个很长的梦。'],
  ];

  E.film({
    id: 'misty-memory-day',
    title: 'Misty Memory (Day Version)',
    audio: 'assets/music/misty-memory-day.mp3',
    fadeIn: 1.0,
    fadeOut: 1.6,
    meta: {
      no: 'IV', cn: '晴日之约', en: 'Misty Memory (Day Version)',
      artists: '塞壬唱片-MSR / Erik Castro / Elvin Shen / David Lin / 左乙',
      form: 'alter', era: '番外 · 汐斯塔的白天',
      logline: '汐斯塔的夏日白天。只有她看得见的粉色小羊聚成一朵大羊云，向她提出了一笔交易：北风、种子和羊毛。',
      synopsis: [
        '凯勒老师来信：汐斯塔的夏天到了，火山博物馆就要开馆，来帮帮忙吧——老火山也在等你。船靠岸的那天，海是青绿色的，白房子晒得发亮。',
        '开馆日的博物馆里，粉色的小羊一只接一只冒了出来——只有她看得见。游客们只看见她对着空长椅训话，手里的冰淇淋却一口一口地没了。',
        '小羊们在灯塔崖上聚成一朵巨大的粉云：多利提出交易——带来北风、种子和羊毛，就把她在找的东西给她。北风装进了空瓶子，预警花的种子种进了门前的花坛；可羊毛，跑遍了小镇也找不到。',
        '黄昏的栈桥上，海风凉了，她裹紧母亲的外套，忽然明白：要找的“羊毛”，一直都穿在身上。那天夜里，满城灯火与羊形的烟花之后，博物馆的门被轻轻敲响——门外只有一只写着 SIESTA、冒着泡的木箱。',
      ],
      cast: [
        { who: 'adele-alter', o: { outfit: 'coat' }, role: '主角 · 来汐斯塔帮忙' },
        { who: 'keller', role: '邀她来汐斯塔的凯勒老师' },
        { who: 'dolly', role: '提出交易的大粉羊' },
        { who: 'sheep-pink', o: { sd: true, variant: 'enemy_1350_mgcshp_2' }, role: '只有她看得见' },
      ],
      poster: 92.2, thumbs: [57.6, 101.5, 186.2, 220.8],
      accent: '#3fcfbf',
    },
    // 官方立绘（情绪最高的两个特写：黄昏的“原来如此”、烟花映在脸上）；加载失败也照样放行，镜头会自动换成角色库的画面
    needs: ['keyart', 'finish', 'sd'],
    // 本片用到的官方 Q 版小人（引擎在 prepare 时预载；≤ 8 个模型控制下载量）：纯烬（基建 / 作战背面）、纯烬家居服、粉色小羊、
    // 客串的汐斯塔街坊（雪雉、琳琅诗怀雅、苍苔、锡兰·夏装）。多利与凯勒老师用官方剧情立绘（MVE.sd.card），不占模型
    sd: ['char_1016_agoat2/build', 'char_1016_agoat2/back', 'char_1016_agoat2_epoque_57/build', LAMB_SD, ...CAMEOS],
    prepare: async (ctx) => {
      // 立绘剪纸（凯勒老师的几种表情、多利）：和模型一起预载，最多等 6 秒
      const S = E.sd, cards = S && S.card ? Promise.race([Promise.all([S.card.load('keller', KEXPR), S.card.load('dolly', 1)]), new Promise((r) => setTimeout(r, 6000))]).catch(() => null) : null;
      // 后期工具箱的纹理 / 颗粒 / 脏污精灵先生成（免得第一次用时卡一帧）
      const F = FIN();
      if (F && F.warm) try { F.warm(['grain', 'dirt']); } catch (e) { /* 用到时再生成 */ }
      // 立绘在开播前预载好（图集上传显卡会卡一下，放在开播前，不在正片里卡）；ctx.keyart 只会 resolve(true / false)，没好就先用角色库的画面
      const K = KA();
      const ka = ctx && ctx.keyart ? Promise.resolve(ctx.keyart(['alter-e0', 'keller', 'dolly'])).catch(() => false) : K && K.load ? K.load(['alter-e0', 'keller', 'dolly'], 6000).catch(() => false) : Promise.resolve(false);
      const fonts = document.fonts ? Promise.race([Promise.all(['900 160px "Noto Serif SC"', '700 40px "Noto Serif SC"', '600 36px "Noto Serif SC"', '700 52px Cinzel', '700 24px "Noto Sans SC"'].map((f) => document.fonts.load(f, '晴日之约阿黛尔汐斯塔的夏天到了博物馆就要开馆来帮帮我吧老火山也在等你凯勒本页原创MISTYDAY'))), new Promise((r) => setTimeout(r, 2500))]).catch(() => null) : null;
      for (const pose of ['stand', 'jump', 'sit', 'walk', 'run', 'eat', 'sleep', 'look-up', 'push', 'float', 'bounce']) castBox('sheep-pink', { pose });
      await Promise.all([ka, fonts, cards]);
    },
    captions,
    overlay,
    release() { release(); const K = KA(); if (K) try { K.release(); } catch (e) { /* 立绘模块自己会重建 */ } },
    shots,
  });
})();
