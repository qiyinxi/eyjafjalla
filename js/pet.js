/* =========================================================
 * 桌宠：Spine 小人沿浏览器四边自由活动
 *  - 地面：散步、放松、坐下、打盹、互动；有时好奇地走到鼠标旁边看看
 *  - 走到两侧会爬上墙，还能倒挂着走过顶边；在墙上、顶上随时可能松手跳下来
 *  - 可以拎起来甩出去：带重力下落，落地压扁回弹；甩向两侧会抓住墙，往上甩得够猛能粘在顶上
 *  - 平台：语音字幕条出现时，她会跳到字幕条上站着（不被挡住）；字幕条收起就落回地面
 *  - 小台阶：各区块标题右边那条细线。她会跳上去坐着、走来走去；这时她被挂进页面里（position: absolute），
 *    跟着页面一起滚动——由合成器直接移动，不需要每帧追着滚动位置改坐标，也就没有延迟。
 *    台阶滚出屏幕时她会跳下来（从顶上掉回屏幕里 / 从底下冒出来）
 *  - 很久没人动鼠标、键盘、滚动：她们会陆续睡着（冒 z），一有动静就惊醒
 *  - 滚动很快时：地上的晃一晃，挂在墙上、顶上的可能被甩下来
 *  - 页面切换形态：同形态的开心地跳一下，另一个形态的吓一跳
 * 路径：把视口四边连成一圈（四个内角用圆弧过渡），沿周长参数 s 行走。
 * 局部 +x 始终指向逆时针方向（地面向右 → 右墙向上 → 顶边向左 → 左墙向下），
 * 所以 dir = +1 / -1 同时决定行进方向和她的朝向。
 * 渲染与动画状态在 chibi.js（pet 模式，所有桌宠共用一个 rAF 与 WebGL 上下文），
 * 这里每帧通过 onTick 决定位置、朝向与动作。
 * ========================================================= */
window.PET = (() => {
  const G = 2000; // 重力 px/s²
  const SPEED = { floor: 72, plat: 62, wall: 44, ceil: 56, corner: 50 };
  const WALK_BASE = 72; // Move 动画原速对应的步速
  const D2R = Math.PI / 180;
  const SLEEP_AFTER = 45; // 秒：没有任何输入多久以后开始犯困
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const norm = (a) => ((((a + 180) % 360) + 360) % 360) - 180; // → [-180, 180)
  const chance = (p) => Math.random() < p;
  const touch = matchMedia('(hover: none)').matches;

  /* ---------- 全局输入：鼠标位置、最后一次输入、滚动速度（所有桌宠共用一套监听） ---------- */
  const IN = { x: -1, y: -1, mt: 0, input: performance.now(), sy: 0, st: 0, sv: 0, scrollT: 0 };
  let tracked = false;
  function track() {
    if (tracked) return;
    tracked = true;
    IN.sy = scrollY;
    const poke = () => { IN.input = performance.now(); };
    addEventListener('pointermove', (e) => { IN.x = e.clientX; IN.y = e.clientY; IN.mt = IN.input = performance.now(); }, { passive: true });
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => addEventListener(t, poke, { passive: true }));
    addEventListener('scroll', () => {
      const now = performance.now(), dt = Math.max(8, now - IN.st);
      const v = ((scrollY - IN.sy) / dt) * 1000;
      IN.sv = IN.st && now - IN.st < 200 ? IN.sv * 0.5 + v * 0.5 : v * 0.5;
      IN.sy = scrollY; IN.st = now; IN.scrollT = now; IN.input = now;
      // 手机上滚动时桌宠先变淡、不接收点击（不挡住正在读的内容）
      if (touch) { document.body.classList.add('pets-scrolling'); clearTimeout(IN.fadeT); IN.fadeT = setTimeout(() => document.body.classList.remove('pets-scrolling'), 900); }
    }, { passive: true });
  }
  /** 滚动速度（px/s，向下为正）；停下后很快衰减 */
  const scrollV = () => { const idle = performance.now() - IN.st; return idle > 400 ? 0 : IN.sv * Math.exp(-idle / 140); };

  function create(chibi, host, opts = {}) {
    track();
    const hit = document.createElement('div');
    hit.className = 'pet-hit';
    host.appendChild(hit);
    const close = host.querySelector('.pet-close');
    if (close) hit.appendChild(close); // 关闭按钮挂在身体上，悬停身体时出现
    // 睡着时头顶冒的 z、被吓到 / 惊醒时的感叹号
    const deco = document.createElement('div');
    deco.className = 'pet-deco';
    deco.innerHTML = '<i class="pz">z</i><i class="pz">z</i><i class="pz">Z</i><i class="pex">!</i>';
    host.appendChild(deco);

    let W = 1, H = 1, r = 36, canClimb = true;
    let M = null; // 身体尺寸（chibi.body()）
    let mode = 'spawn'; // spawn | path | plat | air | drag
    let s = 0, dir = 1; // 周长参数；+1 = 逆时针
    let px = 0, py = 0; // 脚底锚点（plat / air / drag）
    let cx = 0, cy = 0, vx = 0, vy = 0; // air：重心与速度
    let th = 0, om = 0; // air / drag：旋转角与角速度（度）
    let offX = 0, offY = 0, tilt = 0; // 换模式后残余的位移与角度，逐帧归零，让衔接连贯
    let squash = 0, squashV = 0; // 落地压扁
    let lean = 0, leanV = 0; // 页面滚动时晃一晃
    let task = null;
    let plat = null, platforms = [], pollT = 0, hopCool = 0;
    let facing = 1, aloft = 0, lastTouch = performance.now(), wasReady = false, meetCool = 4, greet = true, waveOnLand = false;
    let peekX = 0, peekY = 0, peekA = 0; // 探头时叠加在路径位置上的位移与角度
    let waveT = 0, waveDur = 0, waveCool = 0; // 挥手
    let vis = { x: 0, y: 0, a: 0, sx: 1, sy: 1 }; // 画出来的位置（抓取时据此反算；视口坐标）
    let lastT = '', lastSh = -1, onPage = false;
    let sleeping = false, sleptAt = 0, gripCool = 0, lookT = 0, curiousCool = rnd(6, 14), ledgeCool = rnd(8, 16);
    const reduce = !!opts.reduce;

    const hc = () => (M ? M.h * 0.5 : 70); // 重心到脚底
    const hw = () => (M ? M.w * 0.32 : 30); // 身体半宽
    const margin = () => (M ? M.w * 0.3 : 26); // 站在平台上离边缘的余量
    const say = (text, dy = 0) => { if (opts.say && M) opts.say(text, vis.x, vis.y - M.h * 0.95 * vis.sy + dy); };

    /* ---------- 周长路径 ---------- */
    const segs = () => {
      const a = (Math.PI * r) / 2, lf = Math.max(1, W - 2 * r), lw = Math.max(1, H - 2 * r);
      return [lf, a, lw, a, lf, a, lw, a];
    };
    const perim = () => segs().reduce((x, y) => x + y, 0);
    const wrap = (v) => { const p = perim(); return ((v % p) + p) % p; };
    /** s → { x, y（脚底）, a（旋转角，度）, k（所在边）, i（段号） } */
    function at(s0) {
      const L = segs();
      let u = wrap(s0), i = 0;
      while (i < 7 && u > L[i]) { u -= L[i]; i++; }
      switch (i) {
        case 0: return { x: r + u, y: H, a: 0, k: 'floor', i };
        case 2: return { x: W, y: H - r - u, a: -90, k: 'right', i };
        case 4: return { x: W - r - u, y: 0, a: -180, k: 'ceil', i };
        case 6: return { x: 0, y: r + u, a: -270, k: 'left', i };
      }
      // 内角：脚底沿圆弧滑过去，身体始终朝向圆心
      const C = [null, [W - r, H - r, 90], null, [W - r, r, 0], null, [r, r, -90], null, [r, H - r, -180]][i];
      const phi = C[2] - 90 * clamp(u / L[i], 0, 1);
      return { x: C[0] + r * Math.cos(phi * D2R), y: C[1] + r * Math.sin(phi * D2R), a: phi - 90, k: 'corner', i };
    }
    /** 某条边上的一点 → s（floor / ceil 用 x，left / right 用 y） */
    function sAt(kind, v) {
      const L = segs(), o = [0];
      for (let i = 0; i < 7; i++) o.push(o[i] + L[i]);
      if (kind === 'floor') return o[0] + clamp(v - r, 0, L[0]);
      if (kind === 'right') return o[2] + clamp(H - r - v, 0, L[2]);
      if (kind === 'ceil') return o[4] + clamp(W - r - v, 0, L[4]);
      return o[6] + clamp(v - r, 0, L[6]);
    }
    const distTo = (ts, d) => wrap(d > 0 ? ts - s : s - ts);

    function layout() {
      const old = mode === 'path' ? at(s) : null;
      W = document.documentElement.clientWidth || innerWidth;
      H = document.documentElement.clientHeight || innerHeight;
      r = M ? clamp(M.w * 0.42, 22, 56) : 36;
      canClimb = !reduce && W >= 720 && H >= 520;
      if (old) {
        // 视口变了：留在原来那条边上
        const k = old.k === 'corner' ? ['floor', 'floor', 'right', 'right', 'ceil', 'ceil', 'left', 'left'][old.i] : old.k;
        s = sAt(k, k === 'floor' || k === 'ceil' ? old.x : old.y);
        if (!canClimb && k !== 'floor') { render(); drop(); }
      } else {
        px = clamp(px, 0, W); if (!(plat && plat.doc)) py = clamp(py, 0, H);
        cx = clamp(cx, 0, W); cy = clamp(cy, 0, H);
      }
    }

    /** 身体尺寸变了（首次载入、换形态、转身）：更新点击区与旋转中心 */
    function syncBody() {
      const b = chibi.body();
      if (!b) return false;
      if (!M || b.x !== M.x || b.w !== M.w || b.h !== M.h || b.feetY !== M.feetY) {
        const first = !M;
        M = b;
        const w = b.w * 0.78, h = b.h * 0.94;
        hit.style.cssText = `left:${(b.x + (b.w - w) / 2).toFixed(1)}px;top:${(b.feetY - h).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px`;
        deco.style.cssText = `left:${(b.feetX - 10).toFixed(1)}px;top:${(b.feetY - b.h * 0.98).toFixed(1)}px`;
        host.style.transformOrigin = `${b.feetX}px ${b.feetY.toFixed(1)}px`;
        if (first) layout();
      }
      return true;
    }

    function face(d) { d = d < 0 ? -1 : 1; if (d !== facing) { facing = d; chibi.face(d); } }
    function anim(name, loop = true, then) { if (!chibi.anim(name, loop, then) && name !== 'Relax') chibi.anim('Relax'); }

    /* ---------- 任务 ---------- */
    function idle(name, secs) { task = { t: 'idle', until: secs }; anim(name); chibi.speed(1); }
    function once(name, secs = 2.2) { task = { t: 'idle', until: secs }; anim(name, false, 'Relax'); chibi.speed(1); }
    function walkTo(ts, d) {
      dir = d < 0 ? -1 : 1;
      task = { t: 'walk', rem: distTo(ts, dir) };
      face(dir);
      anim('Move');
    }
    function walkPlat(tx) { dir = tx < px ? -1 : 1; task = { t: 'walk', tx }; face(dir); anim('Move'); }
    const arrive = () => idle('Relax', rnd(0.8, 2));
    /** 先蹲一下再做 fn（起跳前的预备动作） */
    function crouch(fn) { task = { t: 'wait', until: 0.2, then: fn }; squashV -= 2.2; anim('Relax'); }
    /** 模型自带的动画时长（秒） */
    const animLen = (name) => { const i = chibi.info; const a = i && i.anims.find((x) => x[0] === name); return a ? a[1] : 0; };

    /* ---------- 睡觉 / 醒来 ---------- */
    function sleep() {
      sleeping = true; sleptAt = performance.now();
      task = { t: 'idle', until: 1e9, busy: true };
      anim('Sleep'); chibi.speed(1); chibi.setFps && chibi.setFps(15);
      host.classList.add('sleeping');
    }
    function wake(startle = true) {
      if (!sleeping) return;
      sleeping = false;
      host.classList.remove('sleeping');
      chibi.setFps && chibi.setFps(30);
      task = null;
      if (startle) { exclaim(); squashV -= 2.6; once('Interact', 1.8); }
      else arrive();
    }
    function exclaim() { host.classList.remove('startle'); void host.offsetWidth; host.classList.add('startle'); clearTimeout(host._exT); host._exT = setTimeout(() => host.classList.remove('startle'), 1100); }

    /* ---------- 挥手：程序化地抬起一条胳膊、摆动前臂，叠加在当前动画上 ---------- */
    function wave(d = 1.8) { if (waveCool > 0) return; waveT = 0; waveDur = d; waveCool = d + 2.5; }
    /** 找出右臂（上臂 + 前臂 + 手）；各款模型的骨骼命名不同，这里列出了实际见到的三种 */
    function findArm(sk) {
      const pick = (re) => sk.bones.find((b) => re.test(b.data.name));
      // opts.armSide：个别时装的右臂藏在长发后面，挥手看不见，改用左臂
      for (const S of armSide === 'L' ? ['L', 'R'] : ['R', 'L']) {
        const upper = pick(new RegExp(`^F_${S}_(arm_A|Arm|Arm_02)$`, 'i'));
        const fore = pick(new RegExp(`^F_${S}_(arm_B|Forearm|Forearm_01)$`, 'i'));
        if (!upper || !fore || fore.parent !== upper) continue;
        const hand = pick(new RegExp(`^F_${S}_(palm|Hand|Hand_01)$`, 'i'));
        // 手臂由 IK 约束驱动的模型（例如打伞的时装）：挥手期间把约束淡出，否则改了角度也会被 IK 拉回去
        const iks = sk.ikConstraints.filter((c) => c.bones.includes(upper) || c.bones.includes(fore));
        return { upper, fore, hand: hand && hand.parent === fore ? hand : null, iks, mix: iks.map((c) => c.mix), baseU: 0, baseF: 0, setU: NaN, setF: NaN };
      }
      return null;
    }
    const lerpDeg = (a, b, k) => a + norm(b - a) * k;
    let armSk = null, arm = null, armSide = opts.armSide || 'R';
    /**
     * 每帧叠加在动画上：两段式 IK 把手举到肩膀外上方（肘部朝外），前臂左右摆动。
     * 全部在世界坐标里算（翻转朝向也不用特殊处理），再换回各骨骼的局部角度。
     */
    chibi.onPose = (sk, dt) => {
      if (sk !== armSk) { armSk = sk; arm = findArm(sk); }
      const A = arm;
      if (!A) return;
      // 动画没打关键帧的骨骼不会被每帧重置：先恢复成上一帧改动前的值
      if (A.upper.rotation === A.setU) A.upper.rotation = A.baseU;
      if (A.fore.rotation === A.setF) A.fore.rotation = A.baseF;
      A.baseU = A.upper.rotation;
      A.baseF = A.fore.rotation;
      let e = 0;
      if (waveDur > 0) {
        waveT += dt;
        e = clamp(Math.min(waveT / 0.28, (waveDur - waveT) / 0.32), 0, 1);
        e = e * e * (3 - 2 * e);
        if (waveT >= waveDur) waveDur = 0;
      }
      A.iks.forEach((c, i) => { c.mix = A.mix[i] * (1 - e); });
      if (e <= 0) { A.setU = A.setF = NaN; return; }
      sk.updateWorldTransform();
      const U = A.upper, F = A.fore;
      const sx = U.worldX, sy = U.worldY, ex0 = F.worldX, ey0 = F.worldY;
      const L1 = Math.hypot(ex0 - sx, ey0 - sy) || U.data.length;
      const L2 = A.hand ? Math.hypot(A.hand.worldX - ex0, A.hand.worldY - ey0) : F.data.length * Math.hypot(F.a, F.c);
      const out = Math.sign(sx - sk.getRootBone().worldX) || (sk.scaleX < 0 ? -1 : 1); // 这条胳膊在身体哪一侧
      // Q 版的头很大，手举到头顶会被头和头发挡住：往外侧斜上方伸（约 30°），手露在头的轮廓外面
      const tx = sx + out * 0.84 * (L1 + L2), ty = sy + 0.5 * (L1 + L2);
      const d = Math.min(Math.hypot(tx - sx, ty - sy), (L1 + L2) * 0.97);
      const phi = Math.atan2(ty - sy, tx - sx);
      const alpha = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      const t1 = phi - out * alpha; // 肘部朝外
      const exT = sx + L1 * Math.cos(t1), eyT = sy + L1 * Math.sin(t1);
      const t2 = Math.atan2(ty - eyT, tx - exT) + out * 0.42 * Math.sin(waveT * Math.PI * 2 * 2.2); // 前臂左右摆
      const D = 180 / Math.PI;
      // 把骨骼在世界里的指向转到 want 度：局部角度改变多少，世界指向就跟着转多少；
      // 骨架镜像（朝左，scaleX<0）时方向相反。spine-ts 3.8 的 worldToLocalRotation 没考虑镜像，会差 180°
      const turn = (B, want) => { B.rotation += (B.a * B.d - B.b * B.c < 0 ? -1 : 1) * norm(want - B.getWorldRotationX()); };
      turn(U, lerpDeg(U.getWorldRotationX(), t1 * D, e));
      U.updateWorldTransform();
      F.updateWorldTransform();
      turn(F, lerpDeg(F.getWorldRotationX(), t2 * D, e));
      A.setU = U.rotation;
      A.setF = F.rotation;
    };

    /* ---------- 探头：从左右两边斜着探进来 / 从顶边倒挂着探下来 / 从底边冒出来 ----------
     * 阶段：out 藏出去 → hide 藏着 → in 探出来 → hold 张望（常常挥挥手）→ back 缩回去 → home 回原位 */
    const PEEK_T = { out: 0.8, hide: 0.45, in: 0.6, back: 0.45, home: 0.85 };
    const PEEK_NEXT = { out: 'hide', hide: 'in', in: 'hold', hold: 'back', back: 'home' };
    const ZERO = { x: 0, y: 0, a: 0 };
    /** kind：side / top / bottom；side：-1 左边、+1 右边（只对 side 有意义） */
    function startPeek(kind, side = 0) {
      task = { t: 'peek', kind, side, ph: 'out', k: 0, hold: rnd(2.2, 3.6), waved: false };
      if (kind === 'side') { face(side); anim('Move'); chibi.speed(1); } // 先朝外走出去
      else if (kind === 'top') { anim('Move'); chibi.speed(0.8); }
      else anim('Relax');
    }
    function tickPeek(dt) {
      const T = task, h = M.h, w = M.w;
      T.k += dt;
      const hid = T.kind === 'side' ? { x: T.side * (r + 0.62 * w), y: 0, a: 0 } : { x: 0, y: (T.kind === 'top' ? -1.05 : 1.05) * h, a: 0 };
      const pk = T.kind === 'side' ? { x: T.side * (r + 0.25 * h), y: 0, a: -T.side * 30 } : { x: 0, y: (T.kind === 'top' ? -0.55 : 0.55) * h, a: 0 };
      const span = { out: [ZERO, hid], hide: [hid, hid], in: [hid, pk], hold: [pk, pk], back: [pk, hid], home: [hid, ZERO] }[T.ph];
      const dur = T.ph === 'hold' ? T.hold : PEEK_T[T.ph];
      let u = clamp(T.k / dur, 0, 1);
      u = u * u * (3 - 2 * u);
      peekX = span[0].x + (span[1].x - span[0].x) * u;
      peekY = span[0].y + (span[1].y - span[0].y) * u;
      peekA = span[0].a + (span[1].a - span[0].a) * u;
      if (T.ph === 'hold') {
        peekA += (T.kind === 'side' ? 3 : 6) * Math.sin(T.k * 2.2); // 探着头轻轻晃
        if (!T.waved && T.k > 0.5) { T.waved = true; if (chance(0.65)) wave(1.7); }
        if (T.kind !== 'side' && T.k > T.hold * 0.5 && !T.looked) { T.looked = true; face(-facing); } // 左右张望
      }
      if (T.k < dur) return;
      T.k = 0;
      if (T.ph === 'home') { peekX = peekY = peekA = 0; task = null; arrive(); return; }
      T.ph = PEEK_NEXT[T.ph];
      if (T.ph === 'hide') {
        anim('Relax');
        if (T.kind === 'side') face(-T.side); // 转身朝向屏幕里
        if (T.kind === 'bottom') {
          // 打地鼠：藏在底下时换个地方冒出来（避开字幕条）
          for (let i = 0; i < 6; i++) { const x = rnd(r + 40, W - r - 40); if (!zoneAt(x)) { s = sAt('floor', x); break; } }
        }
      } else if (T.ph === 'home') {
        if (T.kind === 'side') { face(-T.side); anim('Move'); } else if (T.kind === 'top') anim('Move');
      }
    }

    /** 窄屏（手机）上尽量待在两边，不挡住中间正在读的内容 */
    const floorX = () => {
      if (W >= 720) return rnd(r + 20, W - r - 20);
      return chance(0.5) ? rnd(r + 10, W * 0.26) : rnd(W * 0.74, W - r - 10);
    };
    /** 能跳上去的小台阶（区块标题旁的细线），按离她多近排序 */
    const ledges = () => platforms.filter((q) => q.ledge);

    /** 自己决定下一件事 */
    function decide() {
      const now = performance.now();
      const idleFor = (now - lastTouch) / 1000, quiet = (now - IN.input) / 1000;
      if (mode === 'plat') {
        if (quiet > SLEEP_AFTER && chance(0.6)) return sleep();
        const lo = plat.x0 + margin(), hi = plat.x1 - margin();
        const out = plat.ledge ? [] : [plat.x0 - M.w * 0.7, plat.x1 + M.w * 0.7].filter((x) => x > r + 10 && x < W - r - 10);
        const roll = Math.random();
        if (plat.ledge) {
          // 坐在标题线上：走一走、坐着看、挥挥手，过一阵再跳下去
          if (roll < 0.1) return crouch(() => hopTo(clamp(px + rnd(-160, 160), r + 30, W - r - 30), H, 30));
          if (roll < 0.36 && hi - lo > 80) return walkPlat(rnd(lo, hi));
          if (roll < 0.62) return idle('Sit', rnd(6, 12));
          if (roll < 0.8) return idle('Relax', rnd(3, 6));
          if (roll < 0.9) { idle('Relax', 2.4); wave(1.8); return; }
          return once('Interact');
        }
        if (roll < 0.12 && out.length) return hopTo(out[(Math.random() * out.length) | 0], H, 30);
        if (roll < 0.5 && hi - lo > 80) return walkPlat(rnd(lo, hi));
        if (roll < 0.78) return idle('Relax', rnd(3, 6));
        if (roll < 0.92) return idle('Sit', rnd(5, 9));
        return once('Interact');
      }
      const p = at(s);
      const roll = Math.random();
      if (p.k === 'floor') {
        aloft = 0;
        // 很久没有动静：犯困，睡着（旁边有睡着的同伴，就走过去挨着睡）
        if (quiet > SLEEP_AFTER && chance(0.7)) {
          const bx = opts.sleeper ? opts.sleeper(p.x) : null;
          if (bx != null && Math.abs(bx - p.x) > 90 && Math.abs(bx - p.x) < 520) {
            const tx = clamp(bx + (p.x < bx ? -66 : 66), r + 10, W - r - 10);
            walkTo(sAt('floor', tx), tx > p.x ? 1 : -1);
            task.then = () => { face(bx > vis.x ? 1 : -1); sleep(); };
            return;
          }
          return sleep();
        }
        // 鼠标刚在屏幕下半部动过：好奇地走过去看看
        if (curiousCool <= 0 && IN.mt && now - IN.mt < 1500 && IN.y > H * 0.45 && IN.x > 0 && chance(0.35)) {
          curiousCool = rnd(10, 22);
          const tx = clamp(IN.x + (IN.x > p.x ? -70 : 70), r + 20, W - r - 20);
          if (Math.abs(tx - p.x) > 30) {
            walkTo(sAt('floor', tx), tx > p.x ? 1 : -1);
            task.then = () => { face(IN.x > vis.x ? 1 : -1); idle('Relax', 2.2); if (chance(0.6)) wave(1.8); };
            return;
          }
        }
        // 屏幕上有标题线：跳上去坐坐
        const L = ledges().filter((q) => q.y > H * 0.36 && q.y < H - 120 && q.x1 - q.x0 > 2 * margin() + 30);
        if (L.length && ledgeCool <= 0 && chance(0.3)) {
          ledgeCool = rnd(14, 26);
          const q = L[(Math.random() * L.length) | 0];
          const tx = clamp(p.x, q.x0 + margin() + 10, q.x1 - margin() - 10);
          return crouch(() => hopTo(tx, q.y, 40));
        }
        if (canClimb && roll < 0.16) {
          // 去爬墙：离哪边近就更可能去哪边
          const right = chance(p.x / W);
          return walkTo(sAt(right ? 'right' : 'left', rnd(H * 0.25, H * 0.7)), right ? 1 : -1);
        }
        if (roll < (W < 720 ? 0.4 : 0.25)) {
          // 走到较近的一侧，从屏幕边上探头（手机上更常这样：大部分时间藏在边上）
          const side = p.x > W / 2 ? 1 : -1;
          walkTo(sAt('floor', side > 0 ? W - r : r), side);
          task.then = () => startPeek('side', side);
          return;
        }
        if (roll < 0.46 && !zoneAt(p.x) && W >= 720) return startPeek('bottom');
        if (roll < 0.5 && chibi.has('Special')) return once('Special', Math.min(animLen('Special'), 16)); // 时装的特殊动作
        if (roll < 0.72) {
          let tx = floorX();
          if (W >= 720 && Math.abs(tx - p.x) < W * 0.15) tx = p.x > W / 2 ? rnd(r + 20, W * 0.4) : rnd(W * 0.6, W - r - 20);
          return walkTo(sAt('floor', tx), tx > p.x ? 1 : -1);
        }
        if (roll < 0.82) return idle('Relax', rnd(2.5, 5));
        if (roll < 0.9) return idle('Sit', rnd(5, 8));
        if (roll < 0.93) { idle('Relax', 2.2); wave(1.8); return; }
        if (roll < 0.97 || idleFor < 25) return once('Interact');
        idle('Sleep', rnd(8, 13)); // 很久没人理她才会打盹
        task.busy = true;
        return;
      }
      if (p.k === 'right' || p.k === 'left') {
        const up = p.k === 'right' ? 1 : -1; // 往上爬的方向
        if (quiet > SLEEP_AFTER) return drop(); // 困了：先下来
        // 旁边就有一条标题线：从墙上跳过去
        const near = ledges().find((q) => Math.abs(q.y - p.y) < 160 && q.y > 100 && (p.k === 'right' ? W - q.x1 < 320 : q.x0 < 320));
        if (near && ledgeCool <= 0 && chance(0.4)) {
          ledgeCool = rnd(14, 26);
          return hopTo(p.k === 'right' ? near.x1 - margin() - 20 : near.x0 + margin() + 20, near.y, 50);
        }
        const pDrop = 0.12 + aloft / 50;
        if (roll < pDrop) return drop();
        if (canClimb && roll < pDrop + 0.28) return walkTo(sAt('ceil', rnd(W * 0.25, W * 0.75)), up);
        if (roll < pDrop + 0.58) return walkTo(sAt('floor', p.k === 'right' ? rnd(W * 0.6, W - r - 20) : rnd(r + 20, W * 0.4)), -up);
        if (roll < pDrop + 0.78) {
          const ty = clamp(p.y + rnd(-H * 0.25, H * 0.25), r + 10, H - r - 10);
          return walkTo(sAt(p.k, ty), (ty < p.y) === (p.k === 'right') ? 1 : -1);
        }
        return idle('Relax', rnd(1.5, 3.5));
      }
      if (p.k === 'ceil') {
        if (quiet > SLEEP_AFTER) return drop();
        const pDrop = 0.2 + aloft / 40;
        if (roll < pDrop) return drop();
        if (roll < pDrop + 0.2) return startPeek('top'); // 爬出顶边，再倒挂着探头往下看
        if (roll < pDrop + 0.32) { const tx = rnd(r + 30, W - r - 30); return walkTo(sAt('ceil', tx), tx < p.x ? 1 : -1); }
        if (roll < pDrop + 0.55) { const left = chance(0.5); return walkTo(sAt('floor', left ? rnd(r + 20, W * 0.3) : rnd(W * 0.7, W - r - 20)), left ? 1 : -1); }
        return idle('Relax', rnd(1.2, 2.5));
      }
      walkTo(s + dir * 30, dir); // 在圆角上：接着走
    }

    /* ---------- 模式切换 ---------- */
    /** 挂进页面（跟着页面滚动）/ 回到固定在视口上 */
    function setPage(on) {
      if (on === onPage) return;
      onPage = on;
      host.classList.toggle('on-page', on);
      lastT = '';
    }
    /** 离开路径 / 平台，进入抛体运动（从当前画面上的位置与角度接续） */
    function enterAir(fx, fy, a, vx0, vy0, om0 = 0, name = 'Move') {
      mode = 'air'; task = null; plat = null;
      setPage(false);
      if (sleeping) { sleeping = false; host.classList.remove('sleeping'); if (chibi.setFps) chibi.setFps(30); }
      peekX = peekY = peekA = 0; // 传进来的 fx / fy / a 已经是画面上的位置（含探头位移）
      th = a; om = om0;
      cx = fx + hc() * Math.sin(a * D2R);
      cy = fy - hc() * Math.cos(a * D2R);
      px = fx; py = fy; vx = vx0; vy = vy0;
      offX = offY = tilt = 0;
      anim(name);
      chibi.speed(name === 'Move' ? 1.6 : 1);
    }
    /** 从当前位置跳到 (tx, ty)：先升到两者中较高者再往上 apex 像素，再落下 */
    function hopTo(tx, ty, apex = 36) {
      const topY = Math.min(vis.y, ty) - apex;
      const up = Math.max(1, vis.y - topY), down = Math.max(1, ty - topY);
      const t = Math.sqrt((2 * up) / G) + Math.sqrt((2 * down) / G);
      if (Math.abs(tx - vis.x) > 8) face(tx > vis.x ? 1 : -1);
      enterAir(vis.x, vis.y, vis.a, (tx - vis.x) / t, -Math.sqrt(2 * G * up), 0, 'Relax');
      hopCool = 0.4;
    }
    /** 松手：朝离开墙面的方向轻轻一蹬，翻个身落下去 */
    function drop() {
      const k = mode === 'path' ? at(s).k : 'floor';
      const push = k === 'left' ? 90 : k === 'right' ? -90 : rnd(-50, 50);
      enterAir(vis.x, vis.y, vis.a, push, k === 'ceil' ? 0 : -140, k === 'ceil' ? (chance(0.5) ? 260 : -260) : 0, 'Relax');
    }
    function land(q) {
      const impact = clamp(vy / 1400, 0, 1);
      const a = norm(th);
      if (q) {
        mode = 'plat'; plat = q;
        const x = clamp(px, q.x0 + margin(), q.x1 - margin());
        offX = px - x; offY = py - q.y; px = x; py = q.y;
        setPage(!!q.doc);
      } else {
        mode = 'path';
        s = sAt('floor', px);
        const p = at(s);
        offX = px - p.x; offY = Math.min(0, py - p.y);
      }
      tilt = a;
      vx = vy = om = 0;
      squashV -= 1.6 + impact * 4.5;
      hopCool = 0.6;
      if (opts.onLand && impact > 0.2) opts.onLand(px, q ? q.y : H, impact);
      if (greet) { greet = false; idle('Relax', 2.6); wave(2.2); } // 刚掉进来：先挥挥手打招呼
      else if (waveOnLand) { waveOnLand = false; idle('Relax', 2.4); wave(2); }
      else if (impact > 0.6) once('Interact', 1.8);
      else if (q && q.ledge) { idle('Relax', rnd(1, 2)); if (chance(0.5)) wave(1.6); }
      else idle('Relax', rnd(0.5, 1.2));
    }
    /** 甩到墙上 / 顶上：抓住，脚底贴过去 */
    function cling(kind) {
      const fx = cx - hc() * Math.sin(th * D2R), fy = cy + hc() * Math.cos(th * D2R);
      mode = 'path';
      s = kind === 'ceil' ? sAt('ceil', cx) : sAt(kind, cy);
      const p = at(s);
      offX = fx - p.x; offY = fy - p.y; tilt = norm(th - p.a);
      dir = kind === 'right' ? 1 : kind === 'left' ? -1 : vx > 0 ? -1 : 1;
      face(dir);
      vx = vy = om = 0;
      squashV -= 2.4;
      if (opts.onLand) opts.onLand(p.x, p.y, 0.45);
      idle('Relax', rnd(0.8, 1.6));
    }

    /* ---------- 平台（字幕条、标题线） ---------- */
    function poll() {
      try { platforms = (opts.platforms && opts.platforms()) || []; } catch (e) { platforms = []; }
      // 字幕条：太低（贴地）或太高的不算；标题线：离顶栏、底边太近的不算
      platforms = platforms.filter((q) => q.x1 - q.x0 > 40 && (q.ledge ? q.y > 96 && q.y < H - 36 : q.y < H - 12 && q.y > H * 0.35));
    }
    /** 地面上这一点会不会和（会挡住她的）平台重叠（重叠就得跳上去，否则会被挡住） */
    function zoneAt(x) {
      for (const q of platforms) if (!q.ledge && x > q.x0 - hw() * 1.3 && x < q.x1 + hw() * 1.3) return q;
      return null;
    }
    function hopOnto(q, x) {
      const lo = q.x0 + margin() + 8, hi = q.x1 - margin() - 8;
      const walking = task && task.t === 'walk';
      hopTo(clamp(x + (walking ? dir * 50 : 0), lo, Math.max(lo, hi)), q.y, 36);
    }

    /* ---------- 每帧 ---------- */
    function tickFollow(dt, p) {
      const T = task;
      T.until -= dt;
      const tx = T.getX();
      if (T.until <= 0 || tx == null || p.k !== 'floor') { task = null; return; }
      const gap = tx - p.x, want = Math.abs(gap) > (T.gap || 80);
      if (want) {
        dir = gap > 0 ? 1 : -1; face(dir);
        if (!T.moving) { T.moving = true; anim('Move'); }
        chibi.speed(SPEED.floor * 1.15 / WALK_BASE);
        s = wrap(s + dir * SPEED.floor * 1.15 * dt);
      } else if (T.moving) { T.moving = false; anim('Relax'); chibi.speed(1); face(gap > 0 ? 1 : -1); }
    }
    function tickPath(dt) {
      const p = at(s);
      if (p.k !== 'floor') aloft += dt;
      if (task && task.t === 'peek') return tickPeek(dt);
      if (task && task.t === 'follow') return tickFollow(dt, p);
      if (task && task.t === 'wait') { task.until -= dt; if (task.until <= 0) { const f = task.then; task = null; if (f) f(); } return; }
      if (p.k === 'floor' && hopCool <= 0) {
        const q = zoneAt(p.x);
        if (q) return hopOnto(q, p.x);
      }
      if (task && task.t === 'walk') {
        const v = SPEED[p.k === 'right' || p.k === 'left' ? 'wall' : p.k];
        chibi.speed(v / WALK_BASE);
        const step = v * dt;
        if (task.rem <= step) {
          s = wrap(s + dir * task.rem);
          const then = task.then;
          task = null;
          if (then) then(); else arrive();
        } else { s = wrap(s + dir * step); task.rem -= step; }
        return;
      }
      if (task) { task.until -= dt; if (task.until <= 0) task = null; }
      if (!task) decide();
    }
    function tickPlat(dt) {
      const q = platforms.find((x) => x.id === plat.id);
      if (!q) {
        // 平台没了：字幕条收起 → 落下去；标题线滚出屏幕 → 从顶上跳下来 / 被带到底下就从底边冒出来
        wake(false);
        if (plat.ledge && vis.y > H - 60) { enterAir(clamp(vis.x, r + 20, W - r - 20), H + M.h * 0.3, 0, 0, -620, 0, 'Relax'); waveOnLand = chance(0.5); return; }
        if (plat.ledge && vis.y < 140) say(chance(0.5) ? '哇——' : '要被卷走了！');
        return enterAir(vis.x, Math.max(vis.y, plat.ledge ? 60 : 0), vis.a, dir * 40, plat.ledge ? -60 : -80, 0, 'Relax');
      }
      plat = q; py = q.y;
      if (task && task.t === 'wait') { task.until -= dt; if (task.until <= 0) { const f = task.then; task = null; if (f) f(); } return; }
      if (task && task.t === 'walk') {
        chibi.speed(SPEED.plat / WALK_BASE);
        const step = SPEED.plat * dt, d = task.tx - px;
        if (Math.abs(d) <= step) { px = task.tx; task = null; arrive(); } else px += Math.sign(d) * step;
      } else if (task) { task.until -= dt; if (task.until <= 0) task = null; }
      px = clamp(px, q.x0 + margin() * 0.6, q.x1 - margin() * 0.6);
      if (!task) decide();
    }
    function tickAir(dt) {
      const pyPrev = py;
      vy += G * dt;
      vx *= Math.pow(0.7, dt);
      cx += vx * dt; cy += vy * dt;
      // 身体慢慢摆正（稍微朝运动方向倾斜）
      om += (-60 * norm(th - clamp(vx * 0.02, -25, 25)) - 9 * om) * dt;
      th += om * dt;
      const half = hw(), top = hc();
      if (cx < half && vx < 0) {
        if (canClimb && vx < -420 && cy > r + 20 && cy < H - r - 40) return cling('left');
        cx = half; vx = -vx * 0.3; om -= 120;
      } else if (cx > W - half && vx > 0) {
        if (canClimb && vx > 420 && cy > r + 20 && cy < H - r - 40) return cling('right');
        cx = W - half; vx = -vx * 0.3; om += 120;
      }
      if (cy - top < 0 && vy < 0) {
        if (canClimb && vy < -1500) return cling('ceil');
        if (cy - top < -M.h) { cy = top - M.h; vy = Math.max(vy, -200); } // 从底下冒上来时别飞出顶边太远
        else { cy = top; vy = -vy * 0.2; }
      }
      px = cx - hc() * Math.sin(th * D2R);
      py = cy + hc() * Math.cos(th * D2R);
      if (vy > 0) {
        for (const q of platforms) {
          if (pyPrev <= q.y + 2 && py >= q.y && px > q.x0 + margin() * 0.6 && px < q.x1 - margin() * 0.6) return land(q);
        }
        if (py >= H || cy + top * 0.3 >= H) return land(null);
      }
    }

    /* ---------- 拎起来、甩出去、戳一下 ---------- */
    let press = null, ptr = { x: 0, y: 0 }, hist = [], grab = { x: 0, y: -60 }, dvx = 0;
    /** 屏幕坐标 → 相对脚底的局部坐标（逆变换：屏幕 = 锚点 + R(a)·S·局部） */
    function toLocal(x, y) {
      const dx = x - vis.x, dy = y - vis.y, c = Math.cos(vis.a * D2R), sn = Math.sin(vis.a * D2R);
      return { x: (dx * c + dy * sn) / vis.sx, y: (-dx * sn + dy * c) / vis.sy };
    }
    function ptrVel() {
      if (hist.length < 2 || performance.now() - hist[hist.length - 1][2] > 90) return { x: 0, y: 0 };
      const a = hist[0], b = hist[hist.length - 1], dt = Math.max(16, b[2] - a[2]) / 1000;
      return { x: (b[0] - a[0]) / dt, y: (b[1] - a[1]) / dt };
    }
    function startDrag() {
      press.moved = true;
      grab = toLocal(press.x, press.y);
      th = vis.a; om = 0; dvx = 0;
      mode = 'drag'; task = null; plat = null;
      setPage(false);
      if (sleeping) { sleeping = false; host.classList.remove('sleeping'); chibi.setFps && chibi.setFps(30); exclaim(); }
      offX = offY = tilt = 0;
      peekX = peekY = peekA = 0;
      host.classList.add('dragging');
      anim('Move');
      chibi.speed(1.8);
      if (opts.onGrab) opts.onGrab(press.x, press.y);
    }
    function tickDrag(dt) {
      dvx += (ptrVel().x - dvx) * Math.min(1, dt * 12);
      // 以抓住的点为轴自然下垂：让重心落在抓点正下方，再按拖动速度甩开
      const gx = -grab.x, gy = -hc() - grab.y;
      const hang = Math.hypot(gx, gy) < 12 ? 0 : 90 - Math.atan2(gy, gx) / D2R;
      om += (-120 * norm(th - hang - clamp(dvx * 0.03, -40, 40)) - 12 * om) * dt;
      th += om * dt;
      const c = Math.cos(th * D2R), sn = Math.sin(th * D2R);
      px = ptr.x - (grab.x * c - grab.y * sn);
      py = ptr.y - (grab.x * sn + grab.y * c);
      if (Math.abs(dvx) > 80) face(dvx > 0 ? 1 : -1);
    }
    function throwIt() {
      host.classList.remove('dragging');
      const v = ptrVel();
      enterAir(vis.x, vis.y, vis.a, clamp(v.x, -2600, 2600), clamp(v.y, -2600, 2600), om, 'Move');
    }
    function poke(x, y) {
      if (mode !== 'path' && mode !== 'plat') return;
      if (sleeping) { wake(true); if (opts.onPoke) opts.onPoke(x, y); return; }
      once('Interact', 2.2);
      if (opts.onPoke) opts.onPoke(x, y);
    }
    hit.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !M || !chibi.ready || e.target.closest('.pet-close')) return;
      e.preventDefault();
      try { hit.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      ptr = { x: e.clientX, y: e.clientY };
      hist = [[e.clientX, e.clientY, performance.now()]];
      lastTouch = performance.now();
    });
    hit.addEventListener('pointermove', (e) => {
      if (!press || e.pointerId !== press.id) return;
      const now = performance.now();
      ptr = { x: e.clientX, y: e.clientY };
      hist.push([e.clientX, e.clientY, now]);
      while (hist.length > 2 && now - hist[0][2] > 110) hist.shift();
      if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) startDrag();
    });
    const endPress = (e) => {
      if (!press || e.pointerId !== press.id) return;
      const dragged = press.moved;
      press = null;
      lastTouch = performance.now();
      if (dragged) throwIt();
      else if (e.type === 'pointerup') poke(e.clientX, e.clientY);
    };
    hit.addEventListener('pointerup', endPress);
    hit.addEventListener('pointercancel', endPress);
    // 鼠标移到她身上：挥挥手（睡着的时候不理）
    hit.addEventListener('pointerenter', () => { if (!press && !sleeping && (mode === 'path' || mode === 'plat')) wave(1.6); });

    /** 鼠标在附近：闲着的时候转过去看（打盹、忙别的时不理）；用全局记下的指针位置，不单独监听 */
    function look() {
      if (!IN.mt || IN.mt <= lookT || !M) return;
      lookT = IN.mt;
      if (!(mode === 'path' || mode === 'plat') || !task || task.t !== 'idle' || task.busy) return;
      if (mode === 'path' && at(s).k !== 'floor') return;
      const dx = IN.x - vis.x, dy = IN.y - (vis.y - M.h * 0.6);
      if (Math.abs(dx) > 40 && Math.hypot(dx, dy) < 320) face(dx > 0 ? 1 : -1);
    }

    function render() {
      let x, y, a;
      if (mode === 'path') { const p = at(s); x = p.x; y = p.y; a = p.a; }
      else if (mode === 'plat') { x = px; y = plat ? plat.y : py; a = 0; }
      else { x = px; y = py; a = th; }
      x += offX + peekX; y += offY + peekY; a += tilt + peekA + lean;
      const sq = clamp(squash, -0.32, 0.22), sx = 1 - sq * 0.55, sy = 1 + sq;
      // 挂在页面里（站在标题线上）：纵坐标用页面坐标，滚动交给合成器；vis 仍记视口坐标
      let ty = y;
      if (onPage && plat && plat.doc != null) { ty = plat.doc + (y - plat.y); y = ty - scrollY; }
      vis = { x, y, a, sx, sy };
      if (!M) return;
      const t = `translate3d(${(x - M.feetX).toFixed(1)}px,${(ty - M.feetY).toFixed(1)}px,0) rotate(${a.toFixed(2)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
      if (t !== lastT) { host.style.transform = t; lastT = t; }
      // 地面阴影：站在地上 / 平台上才有，贴墙时淡一些，悬空时没有
      const k = mode === 'path' ? at(s).k : '';
      const peeking = task && task.t === 'peek';
      const sh = peeking ? 0 : mode === 'plat' || k === 'floor' ? 1 : mode === 'path' ? 0.3 : 0;
      if (sh !== lastSh) { host.style.setProperty('--sh', sh); lastSh = sh; }
    }

    function tick(dt) {
      if (!chibi.ready) { wasReady = false; return; }
      if (!syncBody()) return;
      if (!wasReady) {
        // 首次载入 / 换形态后：新骨架默认朝右、放松，按当前状态补上
        wasReady = true;
        chibi.face(facing);
        if (mode === 'path' || mode === 'plat') task = null;
        else if (mode === 'air' || mode === 'drag') anim('Move');
      }
      if (mode === 'spawn') {
        // 从屏幕上方掉进来
        layout();
        poll();
        enterAir(clamp(W * (opts.spawnX ?? 0.72), r + 60, W - r - 60), M.h + 24, 0, 0, 0, 0, 'Relax');
      }
      pollT -= dt;
      if (pollT <= 0) { pollT = 0.15; poll(); }
      hopCool -= dt; meetCool -= dt; waveCool -= dt; gripCool -= dt; curiousCool -= dt; ledgeCool -= dt;
      // 睡着以后：一有输入就醒
      if (sleeping && IN.input > sleptAt + 300) wake(true);
      look();
      // 页面滚得很快：地上 / 台阶上的晃一晃；挂在墙上、顶上的可能被甩下来
      const sv = scrollV();
      const k = mode === 'path' ? at(s).k : mode;
      const target = (k === 'floor' || mode === 'plat') && !reduce ? clamp(-sv * 0.005, -12, 12) : 0;
      leanV += (-(lean - target) * 70 - leanV * 9) * dt;
      lean += leanV * dt;
      if (gripCool <= 0 && Math.abs(sv) > 2600 && mode === 'path' && (k === 'left' || k === 'right' || k === 'ceil') && !(task && task.t === 'peek')) {
        gripCool = 4;
        if (chance(0.45)) { render(); drop(); say(chance(0.5) ? '哇——' : '抓、抓不住了！'); }
      }
      // 探头被打断（被戳、跳上字幕条……）：剩下的探头位移并入会慢慢归零的偏移，让她自然地回来
      if ((peekX || peekY || peekA) && !(task && task.t === 'peek')) {
        offX += peekX; offY += peekY; tilt += peekA;
        peekX = peekY = peekA = 0;
      }
      if (mode === 'path') tickPath(dt);
      else if (mode === 'plat') tickPlat(dt);
      else if (mode === 'air') tickAir(dt);
      else if (mode === 'drag') tickDrag(dt);
      const kk = 1 - Math.exp(-dt * 8);
      offX -= offX * kk; offY -= offY * kk; tilt -= tilt * kk;
      squashV += (-300 * squash - 18 * squashV) * dt;
      squash += squashV * dt;
      render();
    }
    chibi.onTick = tick;

    const onResize = () => { if (M) layout(); };
    addEventListener('resize', onResize);
    const onFloor = () => mode === 'path' && at(s).k === 'floor';
    const free = () => (mode === 'path' || mode === 'plat') && !(task && (task.t === 'peek' || task.t === 'wait'));

    return {
      destroy() {
        chibi.onTick = null;
        chibi.onPose = null;
        removeEventListener('resize', onResize);
        hit.remove();
        deco.remove();
      },
      get mode() { return mode; },
      /** 脚底的屏幕坐标（碰面检测、气泡定位用） */
      get x() { return vis.x; },
      get y() { return vis.y; },
      get head() { return M ? vis.y - M.h * 0.95 : vis.y - 120; },
      get onFloor() { return onFloor(); },
      get sleeping() { return sleeping; },
      /** 能不能和别的小人打招呼：站在地上、没在忙别的 */
      get canMeet() { return onFloor() && meetCool <= 0 && !sleeping && !(task && (task.busy || task.t === 'peek' || task.t === 'follow')); },
      /** 两只小人在地上碰面：转向对方，挥挥手或者互动一下；sit：之后并排坐一会儿 */
      meet(toward, how = 'interact', sit = false) {
        meetCool = rnd(14, 24);
        face(toward);
        if (how === 'wave') { idle('Relax', 2.4); wave(2); } else once('Interact', 2.4);
        task.busy = true;
        if (sit) { const t0 = task; t0.then = null; setTimeout(() => { if (task === t0) { idle('Sit', rnd(6, 10)); task.busy = true; } }, 2500); }
      },
      /** 走到地上某个横坐标，到了回调 then */
      goTo(x, then) {
        if (!onFloor() || sleeping) return false;
        const tx = clamp(x, r + 10, W - r - 10), p = at(s);
        if (Math.abs(tx - p.x) < 8) { if (then) then(); return true; }
        walkTo(sAt('floor', tx), tx > p.x ? 1 : -1);
        task.then = then || null;
        return true;
      },
      /** 跟在别人后面走一阵（getX 返回目标的横坐标；返回 null 就停下） */
      follow(getX, secs = 10, gap = 80) {
        if (!onFloor() || sleeping) return false;
        task = { t: 'follow', until: secs, getX, gap, moving: false, busy: true };
        return true;
      },
      face,
      wave: (d = 1.8) => wave(d),
      interact() { if (free()) once('Interact', 2.2); },
      wake: () => wake(true),
      sleep() { if (free() && (onFloor() || mode === 'plat')) sleep(); },
      /** 页面切换形态：match = 这只和新形态相同 → 开心地跳一下挥手；不同 → 吓一跳 */
      cheer(match) {
        if (sleeping) wake(true);
        if (!free()) return;
        if (match) { waveOnLand = true; crouch(() => hopTo(vis.x + rnd(-30, 30), mode === 'plat' ? plat.y : H, rnd(50, 80))); }
        else { exclaim(); squashV -= 3; once('Interact', 1.6); }
      },
      say,
      /** 调试：当前所在边 */
      get where() { return mode === 'path' ? at(s).k : mode; },
      /** 调试（?debug）：把她放到某条边上 / 某段路径上、甩出去、松手 */
      debug: {
        place(kind, v) { mode = 'path'; plat = null; setPage(false); s = sAt(kind, v); offX = offY = tilt = 0; idle('Relax', 4); },
        placeS(k) { mode = 'path'; plat = null; setPage(false); s = wrap(k * perim()); offX = offY = tilt = 0; idle('Relax', 4); },
        walk(kind, v, d) { if (mode === 'path') walkTo(sAt(kind, v), d); },
        fling(vx0, vy0) { enterAir(vis.x, vis.y, vis.a, vx0, vy0, 0, 'Move'); },
        drop: () => drop(),
        state: () => ({ mode, where: mode === 'path' ? at(s).k : mode, vis, task: task && task.t, W, H, r, M, onPage, sleeping, plat: plat && plat.id }),
        info: () => chibi.info,
        wave: (d = 2.5) => { waveCool = 0; idle('Relax', d + 0.5); wave(d); },
        armSide(side) { armSide = side; armSk = null; },
        /** 到某条边上直接开始探头（side：-1 左 / +1 右） */
        peek(kind, side = 1) {
          mode = 'path'; plat = null; offX = offY = tilt = 0;
          s = kind === 'side' ? sAt('floor', side > 0 ? W - r : r) : kind === 'top' ? sAt('ceil', W * 0.5) : sAt('floor', W * 0.3);
          startPeek(kind, side);
        },
        /** 跳上屏幕里的第一条标题线 */
        ledge() { poll(); const q = ledges()[0]; if (q) hopTo((q.x0 + q.x1) / 2, q.y, 40); return q && q.id; },
        sleep: () => sleep(),
        platforms: () => platforms,
        arm: () => arm && { upper: arm.upper.data.name, fore: arm.fore.data.name, hand: arm.hand && arm.hand.data.name, iks: arm.iks.length },
        armNow: () => arm && { waveT: +waveT.toFixed(2), waveDur, u: Math.round(arm.upper.getWorldRotationX()), f: Math.round(arm.fore.getWorldRotationX()), s: [Math.round(arm.upper.worldX), Math.round(arm.upper.worldY)], h: arm.hand && [Math.round(arm.hand.worldX), Math.round(arm.hand.worldY)] },
        get task() { return task && { t: task.t, ph: task.ph }; },
      },
    };
  }

  return { create, input: IN };
})();
