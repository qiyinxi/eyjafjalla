/* =========================================================
 * 3D 人偶 · 身体
 * 骨架（Group 层级）+ 素体（皮肤）+ 画布绘制的脸 + 羊角 / 羊耳，
 * 以及把“姿势通道”应用到骨骼、自动贴地。
 * 时装只负责衣服、头发、道具；它们挂在这里导出的骨骼节点上。
 * ========================================================= */
(() => {
  const D = window.DOLL;

  /** 尺寸（米）。世界高度：胯 0.78 · 胸 1.02 · 颈 1.135 · 头支点 1.19 · 头心约 1.295 */
  const DIM = {
    HIP_Y: 0.78,
    spine: [0, 0.07, 0], chest: [0, 0.17, 0], neck: [0, 0.115, 0.005], head: [0, 0.055, 0],
    headC: [0, 0.105, 0.008], R: 0.118,
    shoulder: [0.105, 0.098, -0.008], UA: 0.215, FA: 0.195, HAND: 0.075,
    leg: [0.07, -0.035, 0], TH: 0.35, SH: 0.33, ANKLE: 0.065,
  };
  D.DIM = DIM;

  /** 所有姿势通道（弧度 / 米），默认 0 */
  const CHANNELS = [
    'hipsX', 'hipsY', 'hipsZ', 'hipsPitch', 'hipsRoll', 'hipsYaw',
    'spinePitch', 'spineRoll', 'spineYaw', 'chestPitch', 'chestRoll', 'chestYaw',
    'neckPitch', 'neckYaw', 'neckRoll', 'headPitch', 'headYaw', 'headRoll',
    'armLRaise', 'armLFwd', 'armLTwist', 'elbowL', 'foreLTwist', 'wristL', 'wristLRoll',
    'armRRaise', 'armRFwd', 'armRTwist', 'elbowR', 'foreRTwist', 'wristR', 'wristRRoll',
    'legLFwd', 'legLSpread', 'legLTwist', 'kneeL', 'ankleL', 'ankleLRoll',
    'legRFwd', 'legRSpread', 'legRTwist', 'kneeR', 'ankleR', 'ankleRRoll',
    'earL', 'earR', 'eyeX', 'eyeY', 'blink', 'happy', 'mouth', 'mouthOpen', 'blush', 'lift',
  ];
  D.CHANNELS = CHANNELS;
  /** 静止姿势（A 字站姿） */
  const REST = {
    armLRaise: 0.14, armRRaise: 0.14, elbowL: 0.14, elbowR: 0.14, armLFwd: 0.03, armRFwd: 0.03,
    foreLTwist: 0.2, foreRTwist: 0.2,
    legLSpread: 0.035, legRSpread: 0.035, legLTwist: 0.06, legRTwist: 0.06,
    blush: 0.5, mouth: 0.4,
  };
  D.REST = REST;
  D.pose = (base) => {
    const P = {};
    for (const c of CHANNELS) P[c] = 0;
    return Object.assign(P, REST, base || {});
  };
  D.lerpPose = (out, A, B, t) => {
    for (const c of CHANNELS) out[c] = A[c] + (B[c] - A[c]) * t;
    return out;
  };
  D.copyPose = (out, A) => { for (const c of CHANNELS) out[c] = A[c]; return out; };

  /* ------------------------------------------------------------------ 脸 */
  function makeFace(k, look) {
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const tex = new k.T.CanvasTexture(cv);
    tex.colorSpace = k.T.SRGBColorSpace;
    tex.anisotropy = 8;
    const L = Object.assign({
      skin: '#fde9e0', iris: ['#5e1a30', '#d24a6a', '#ffb0c0'], lash: '#3a2320', brow: '#6e4a3c',
      mouth: '#a24a4c', blush: 'rgba(255,120,140,0.32)', pupil: '#3a0b1c',
    }, look || {});
    let key = '';
    const EYE = L.eyeScale ?? 1.32;

    /** 画一只眼（局部坐标，s = −1 为她的右眼 / 画面左侧，+1 为左眼） */
    function eye(cx, cy, s, st) {
      const bl = Math.min(1, st.blink), hp = st.happy;
      g.save();
      g.translate(cx, cy);
      g.scale(s * EYE, EYE); // 镜像：局部 +x 总是指向外眼角
      g.lineCap = 'round';
      g.lineJoin = 'round';
      if (hp > 0.5 || bl > 0.82) {
        g.strokeStyle = L.lash;
        g.lineWidth = 6;
        g.beginPath();
        if (hp > 0.5) {
          // 开心：^
          g.moveTo(-24, 10);
          g.quadraticCurveTo(2, -22, 28, 8);
          g.stroke();
        } else {
          // 闭眼：‿ + 外眼角睫毛
          g.moveTo(-24, 0);
          g.quadraticCurveTo(2, 14, 28, -2);
          g.stroke();
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(24, 0);
          g.lineTo(34, -7);
          g.stroke();
        }
        g.restore();
        return;
      }
      const drop = bl * 44; // 上眼睑随眨眼下落
      const almond = () => {
        g.beginPath();
        g.moveTo(-26, -8 + drop * 0.6);
        g.quadraticCurveTo(-2, -36 + drop, 30, -22 + drop * 0.9);
        g.quadraticCurveTo(34, 0, 26, 24);
        g.quadraticCurveTo(4, 36, -22, 20);
        g.quadraticCurveTo(-30, 8, -26, -8 + drop * 0.6);
        g.closePath();
      };
      almond();
      g.fillStyle = '#fff8f9';
      g.fill();
      g.save();
      almond();
      g.clip();
      // 虹膜（大、竖长）
      const ix = 2 + s * st.eyeX * 8, iy = 6 - st.eyeY * 6;
      const gr = g.createLinearGradient(0, iy - 34, 0, iy + 32);
      gr.addColorStop(0, L.iris[0]);
      gr.addColorStop(0.42, L.iris[1]);
      gr.addColorStop(1, L.iris[2]);
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(ix, iy, 21, 30, 0, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 2.6;
      g.strokeStyle = 'rgba(60,10,28,0.9)';
      g.stroke();
      // 瞳孔 + 亮环
      g.fillStyle = L.pupil;
      g.beginPath();
      g.ellipse(ix, iy - 3, 9, 14, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,200,215,0.6)';
      g.lineWidth = 2.2;
      g.beginPath();
      g.ellipse(ix, iy + 8, 14, 14, 0, 0.12 * Math.PI, 0.88 * Math.PI);
      g.stroke();
      // 上眼睑阴影
      const sh = g.createLinearGradient(0, -34 + drop, 0, -6 + drop);
      sh.addColorStop(0, 'rgba(70,20,40,0.55)');
      sh.addColorStop(1, 'rgba(70,20,40,0)');
      g.fillStyle = sh;
      g.fillRect(-40, -44 + drop, 80, 40);
      // 高光
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(ix - 8, iy - 13, 6.5, 8.5, -0.3, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(ix + 9, iy + 13, 3.4, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.6;
      g.beginPath();
      g.arc(ix + 12, iy - 4, 2, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.restore();
      // 上睫毛：粗、外侧上翘
      g.fillStyle = L.lash;
      g.beginPath();
      g.moveTo(-30, -6 + drop * 0.6);
      g.quadraticCurveTo(-4, -44 + drop, 32, -26 + drop * 0.9);
      g.lineTo(44, -18 + drop * 0.8);
      g.lineTo(38, -13 + drop * 0.8);
      g.lineTo(31, -16 + drop * 0.9);
      g.quadraticCurveTo(-4, -32 + drop, -26, -4 + drop * 0.6);
      g.closePath();
      g.fill();
      // 双眼皮线
      if (bl < 0.4) {
        g.strokeStyle = 'rgba(120,56,60,0.6)';
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(-16, -42);
        g.quadraticCurveTo(6, -52, 28, -38);
        g.stroke();
      }
      // 下睫毛
      g.strokeStyle = 'rgba(80,36,40,0.85)';
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(8, 33);
      g.quadraticCurveTo(22, 30, 28, 20);
      g.stroke();
      g.restore();
    }

    function draw(st) {
      g.fillStyle = L.skin;
      g.fillRect(0, 0, S, S);
      // 腮红
      if (st.blush > 0.01) {
        for (const s of [-1, 1]) {
          const bx = 256 + s * 122, by = 342;
          const rg = g.createRadialGradient(bx, by, 2, bx, by, 46);
          rg.addColorStop(0, L.blush.replace(/[\d.]+\)$/, (0.34 * st.blush * 2).toFixed(3) + ')'));
          rg.addColorStop(1, 'rgba(255,140,160,0)');
          g.fillStyle = rg;
          g.beginPath();
          g.ellipse(bx, by, 46, 26, 0, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = `rgba(230,110,130,${0.5 * st.blush})`;
          g.lineWidth = 2;
          for (let i = -1; i <= 1; i++) {
            g.beginPath();
            g.moveTo(bx + i * 12 - 4, by + 6);
            g.lineTo(bx + i * 12 + 4, by - 6);
            g.stroke();
          }
        }
      }
      // 眉毛
      g.strokeStyle = L.brow;
      g.lineCap = 'round';
      for (const s of [-1, 1]) {
        g.lineWidth = 4;
        g.beginPath();
        const bx = 256 + s * 96, by = 176 - (st.brow || 0) * 8;
        g.moveTo(bx - s * 24, by + 6);
        g.quadraticCurveTo(bx, by - 4, bx + s * 26, by + 2);
        g.stroke();
      }
      eye(256 - 100, 272, -1, st);
      eye(256 + 100, 272, 1, st);
      // 鼻
      g.fillStyle = 'rgba(214,140,130,0.8)';
      g.beginPath();
      g.ellipse(258, 346, 3, 2.2, 0, 0, Math.PI * 2);
      g.fill();
      // 嘴
      const mo = st.mouthOpen, sm = st.mouth;
      const mx = 256, my = 392;
      g.lineCap = 'round';
      if (mo > 0.15) {
        const w = 11 + 6 * sm, h = 5 + 13 * mo;
        g.fillStyle = '#b8434f';
        g.beginPath();
        g.moveTo(mx - w, my - 2);
        g.quadraticCurveTo(mx, my + 2 * sm - 4, mx + w, my - 2);
        g.quadraticCurveTo(mx + w * 0.7, my + h, mx, my + h);
        g.quadraticCurveTo(mx - w * 0.7, my + h, mx - w, my - 2);
        g.fill();
        g.fillStyle = '#ef8a92';
        g.beginPath();
        g.ellipse(mx, my + h * 0.72, w * 0.5, h * 0.3, 0, 0, Math.PI * 2);
        g.fill();
      } else {
        g.strokeStyle = L.mouth;
        g.lineWidth = 3.4;
        g.beginPath();
        const w = 9 + 5 * sm;
        g.moveTo(mx - w, my - 2 * sm);
        g.quadraticCurveTo(mx, my + 3 + 6 * sm, mx + w, my - 2 * sm);
        g.stroke();
      }
    }

    function set(st) {
      const q = (v, n = 8) => Math.round(v * n);
      const kk = [q(st.blink, 10), q(st.happy, 2), q(st.eyeX, 10), q(st.eyeY, 10), q(st.mouth, 4), q(st.mouthOpen, 8), q(st.blush, 6), q(st.brow || 0, 4)].join(',');
      if (kk === key) return;
      key = kk;
      draw(st);
      tex.needsUpdate = true;
    }
    set({ blink: 0, happy: 0, eyeX: 0, eyeY: 0, mouth: 0.4, mouthOpen: 0, blush: 0.5 });
    return { tex, set, canvas: cv };
  }

  /** 头部几何：球体 + 下颌收窄；UV 为正面平面投影（背面映射到画布边缘的肤色） */
  function headGeo(k, R) {
    const T = k.T;
    const g = new T.SphereGeometry(R, 64, 48);
    g.rotateY(-Math.PI / 2); // 接缝移到后脑
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) / R, y = p.getY(i) / R, z = p.getZ(i) / R;
      if (y < 0) {
        // 下颌：两侧收窄、下巴略尖并微微前突
        const t = Math.pow(-y, 1.35);
        x *= 1 - 0.42 * t;
        z *= 1 - 0.16 * t;
        y *= 1.08;
        if (z > 0) z += 0.07 * t * z;
      }
      x *= 0.94;
      if (z < 0) z *= 1.06;
      if (y > 0) y *= 1.02;
      p.setXYZ(i, x * R, y * R, z * R);
    }
    g.computeVertexNormals();
    const FY = -0.1;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / R, y = p.getY(i) / R, z = p.getZ(i) / R;
      let u = 0.5 + x * 0.5, v = 0.5 + (y - FY) * 0.5;
      if (z < 0.05) u = x > 0 ? 0.995 : 0.005;
      uv.setXY(i, Math.min(0.998, Math.max(0.002, u)), Math.min(0.998, Math.max(0.002, v)));
    }
    return g;
  }

  /**
   * 构建素体。look = { skin, skinShade, horn, hornStripe, ear, earIn, eyes(iris 三色), hornStyle }
   */
  D.buildBody = function buildBody(k, look = {}) {
    const T = k.T, { node, mesh, mat } = k;
    const L = Object.assign({
      skin: '#fde9e0', skinShade: '#efc0c2', horn: '#f1ebe4', hornStripe: '#cfc3ba',
      ear: '#f3e2d6', earIn: '#f4b8bd', nail: '#f7cfd0',
    }, look);
    const rig = { dims: DIM, look: L, parts: {}, soleDepth: 0 };
    const root = (rig.root = node(null, [0, 0, 0], null, 'root'));
    const hips = (rig.hips = node(root, [0, DIM.HIP_Y, 0], null, 'hips'));
    const spine = (rig.spine = node(hips, DIM.spine, null, 'spine'));
    const chest = (rig.chest = node(spine, DIM.chest, null, 'chest'));
    const neck = (rig.neck = node(chest, DIM.neck, null, 'neck'));
    const head = (rig.head = node(neck, DIM.head, null, 'head'));
    const headC = (rig.headC = node(head, DIM.headC, null, 'headC'));
    [hips, spine, chest, neck, head].forEach((n) => (n.rotation.order = 'YXZ'));

    const skin = (rig.skinMat = mat(L.skin, { shade: L.skinShade, rim: 0.22 }));
    rig.mats = { skin };

    // 躯干
    rig.parts.pelvis = mesh(k.lathe([[0.02, -0.1], [0.07, -0.088], [0.098, -0.05], [0.103, 0], [0.092, 0.05], [0.079, 0.09]], { sz: 0.78 }), skin, hips);
    rig.parts.belly = mesh(k.lathe([[0.079, -0.04], [0.073, 0.03], [0.075, 0.1], [0.08, 0.15]], { sz: 0.76 }), skin, spine);
    rig.parts.torso = mesh(k.lathe([[0.078, -0.09], [0.086, -0.03], [0.093, 0.03], [0.094, 0.068], [0.086, 0.1], [0.058, 0.122], [0.032, 0.13]], { sz: 0.74 }), skin, chest);
    rig.parts.neck = mesh(k.capsule(0.085, 0.029, 0.031), skin, neck, { p: [0, 0.085, 0] });

    // 头
    const face = (rig.face = makeFace(k, look.faceLook));
    rig.faceMat = mat('#ffffff', { map: face.tex, shade: L.skinShade, flat: 0.62, rim: 0.12 });
    rig.parts.head = mesh(headGeo(k, DIM.R), rig.faceMat, headC);

    // 手臂
    rig.shoulder = {}; rig.elbow = {}; rig.hand = {}; rig.grip = {};
    for (const [s, sg] of [['L', 1], ['R', -1]]) {
      const sh = (rig.shoulder[s] = node(chest, [sg * DIM.shoulder[0], DIM.shoulder[1], DIM.shoulder[2]], null, 'arm' + s));
      sh.rotation.order = 'XZY';
      mesh(k.ellipsoid(0.038, 0.036, 0.034), skin, sh, { p: [sg * -0.004, -0.004, 0] });
      rig.parts['upperArm' + s] = mesh(k.limb(DIM.UA, [0.034, 0.031, 0.027]), skin, sh);
      const el = (rig.elbow[s] = node(sh, [0, -DIM.UA, 0], null, 'elbow' + s));
      el.rotation.order = 'YXZ';
      rig.parts['foreArm' + s] = mesh(k.limb(DIM.FA, [0.027, 0.026, 0.02]), skin, el);
      const hd = (rig.hand[s] = node(el, [0, -DIM.FA, 0], null, 'hand' + s));
      hd.rotation.order = 'XZY';
      // 手：掌 + 拇指（掌心朝内）
      const hand = node(hd, [0, 0, 0], null, 'handMesh' + s);
      rig.parts['hand' + s] = hand;
      mesh(k.ellipsoid(0.013, 0.037, 0.025), skin, hand, { p: [0, -0.035, 0.002] });
      mesh(k.ellipsoid(0.009, 0.021, 0.009), skin, hand, { p: [-sg * 0.006, -0.028, 0.022], r: [0.5, 0, -sg * 0.35] });
      rig.grip[s] = node(hd, [-sg * 0.002, -0.042, 0.004], null, 'grip' + s);
    }

    // 腿
    rig.leg = {}; rig.knee = {}; rig.ankle = {}; rig.sole = {};
    for (const [s, sg] of [['L', 1], ['R', -1]]) {
      const lg = (rig.leg[s] = node(hips, [sg * DIM.leg[0], DIM.leg[1], DIM.leg[2]], null, 'leg' + s));
      lg.rotation.order = 'XZY';
      rig.parts['thigh' + s] = mesh(k.limb(DIM.TH, [0.062, 0.058, 0.05, 0.043, 0.04], { sz: 0.95 }), skin, lg);
      const kn = (rig.knee[s] = node(lg, [0, -DIM.TH, 0], null, 'knee' + s));
      rig.parts['shin' + s] = mesh(k.limb(DIM.SH, [0.04, 0.044, 0.038, 0.03, 0.026], { sz: 0.95 }), skin, kn);
      const an = (rig.ankle[s] = node(kn, [0, -DIM.SH, 0], null, 'ankle' + s));
      an.rotation.order = 'XZY';
      rig.parts['foot' + s] = mesh(k.rbox(0.058, 0.05, 0.15, 0.024), skin, an, { p: [0, -0.04, 0.035] });
      const heel = node(an, [0, -DIM.ANKLE, -0.03], null, 'heel' + s);
      const toe = node(an, [0, -DIM.ANKLE, 0.1], null, 'toe' + s);
      rig.sole[s] = [heel, toe];
    }

    // 羊耳：下垂向外，挂在可摆动的枢轴上
    rig.ear = {};
    for (const [s, sg] of [['L', 1], ['R', -1]]) {
      const ep = (rig.ear[s] = node(headC, [sg * 0.112, 0.012, -0.006], null, 'ear' + s));
      ep.rotation.order = 'ZYX';
      const earMat = mat(L.ear, { shade: '#d8b8b8', rim: 0.2 });
      const earIn = mat(L.earIn, { shade: '#e09aa2', rim: 0.1, outline: false });
      // 羊耳：细长的叶形，向外下垂
      const eg = k.ellipsoid(0.021, 0.058, 0.01);
      eg.translate(0, -0.052, 0);
      const e = mesh(eg, earMat, ep);
      const ig = k.ellipsoid(0.013, 0.042, 0.005);
      ig.translate(0, -0.056, 0.0065);
      mesh(ig, earIn, e, { outline: false });
      rig.parts['ear' + s] = e;
    }

    // 羊角
    rig.horn = {};
    if (L.hornStyle !== 'none') {
      const hornMat = mat('#ffffff', { vertexColors: true, shade: '#c8b8b8', rim: 0.3, line: '#5a4a48' });
      for (const [s, sg] of [['L', 1], ['R', -1]]) {
        const hg = k.curl([sg * 0.07, 0.092, 0.02], sg, Object.assign({
          r0: 0.052, turns: 1.12, shrink: 0.18, spread: 0.06, thick0: 0.025, thick1: 0.007, tilt: 0.62, yaw: -0.25, ridges: 13,
          stripe: [L.horn, L.hornStripe],
        }, L.hornOpts || {}));
        rig.horn[s] = mesh(hg, hornMat, headC);
      }
    }

    /* ---------------------------------------------------------- 姿势应用 */
    const V = new T.Vector3(), V2 = new T.Vector3();
    rig.rest = D.pose();
    rig.apply = function apply(P) {
      hips.position.set(P.hipsX, DIM.HIP_Y + P.hipsY, P.hipsZ);
      hips.rotation.set(P.hipsPitch, P.hipsYaw, -P.hipsRoll);
      spine.rotation.set(P.spinePitch, P.spineYaw, -P.spineRoll);
      chest.rotation.set(P.chestPitch, P.chestYaw, -P.chestRoll);
      neck.rotation.set(P.neckPitch, P.neckYaw, -P.neckRoll);
      head.rotation.set(P.headPitch, P.headYaw, -P.headRoll);
      const A = rig.shoulder, E = rig.elbow, H = rig.hand;
      A.L.rotation.set(-P.armLFwd, P.armLTwist, P.armLRaise);
      A.R.rotation.set(-P.armRFwd, -P.armRTwist, -P.armRRaise);
      E.L.rotation.set(-P.elbowL, P.foreLTwist, 0);
      E.R.rotation.set(-P.elbowR, -P.foreRTwist, 0);
      H.L.rotation.set(-P.wristL, 0, P.wristLRoll);
      H.R.rotation.set(-P.wristR, 0, -P.wristRRoll);
      const G = rig.leg, K = rig.knee, N = rig.ankle;
      G.L.rotation.set(-P.legLFwd, P.legLTwist, P.legLSpread);
      G.R.rotation.set(-P.legRFwd, -P.legRTwist, -P.legRSpread);
      K.L.rotation.x = P.kneeL;
      K.R.rotation.x = P.kneeR;
      N.L.rotation.set(-P.ankleL, 0, -P.ankleLRoll);
      N.R.rotation.set(-P.ankleR, 0, P.ankleRRoll);
      rig.ear.L.rotation.set(0.25, 0.3, 1.3 + P.earL);
      rig.ear.R.rotation.set(0.25, -0.3, -1.3 - P.earR);
      rig.face.set(P);
    };
    /** 让较低的一只脚踩在地面上（lift 为额外离地高度，如跳跃），返回调整量 */
    rig.ground = function ground(P, enabled = true) {
      root.updateMatrixWorld(true);
      let min = Infinity;
      for (const s of ['L', 'R']) for (const m of rig.sole[s]) { m.getWorldPosition(V); min = Math.min(min, V.y); }
      const base = root.position.y;
      const off = enabled ? -(min - base) + rig.soleDepth : 0;
      hips.position.y += off + (P.lift || 0);
      root.updateMatrixWorld(true);
      return off;
    };
    /** 衣摆碰撞胶囊（世界坐标） */
    rig.updateCaps = function updateCaps(caps) {
      let i = 0;
      for (const s of ['L', 'R']) {
        rig.leg[s].getWorldPosition(V);
        rig.knee[s].getWorldPosition(V2);
        caps[i].set(V.x, V.y + 0.02, V.z, 0.072); caps[i + 1].set(V2.x, V2.y, V2.z, 0);
        i += 2;
        rig.ankle[s].getWorldPosition(V);
        caps[i].set(V2.x, V2.y, V2.z, 0.058); caps[i + 1].set(V.x, V.y, V.z, 0);
        i += 2;
      }
    };
    return rig;
  };

  /**
   * 让道具被某只手握住：在静止姿势下，使道具的 +Y 轴指向世界方向 dir，
   * 道具局部坐标 at 处落在手心。side = 'L' | 'R'。
   */
  D.holdProp = function holdProp(k, rig, obj, side, restPose, o = {}) {
    const T = k.T;
    rig.root.position.set(0, 0, 0);
    rig.root.rotation.set(0, 0, 0);
    rig.apply(D.pose(restPose));
    rig.root.updateMatrixWorld(true);
    const grip = rig.grip[side];
    const gq = grip.getWorldQuaternion(new T.Quaternion()).invert();
    const want = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(...(o.dir || [0, 1, 0])).normalize());
    if (o.roll) want.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), o.roll));
    obj.quaternion.copy(gq.multiply(want));
    obj.position.copy(new T.Vector3(...(o.at || [0, 0, 0])).applyQuaternion(obj.quaternion).negate());
    grip.add(obj);
    return obj;
  };
})();
