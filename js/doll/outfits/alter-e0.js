/* =========================================================
 * 时装 · 纯烬艾雅法拉 · 默认服装（参考实现，其他时装可照此结构编写）
 * 母亲留下的白色考察外套（红色内衬、袖口红条、破损下摆）、淡紫针织背心、
 * 胸前三色丝带与工作证、腰包、黑色短裤 + 缠绕红绳的黑色裤袜、厚底运动鞋，
 * 侧马尾系红丝带；右手握白枝晶叶法杖。
 * ========================================================= */
(() => {
  const D = window.DOLL;

  D.outfit('alter-e0', {
    form: 'alter', name: '默认服装', series: 'DEFAULT', order: 10,
    look: {
      horn: '#f3eee8', hornStripe: '#cbbfb7', ear: '#f1ddd2', earIn: '#f2aab4',
      faceLook: { iris: ['#5a1830', '#d9506f', '#ffb3c3'] },
    },
    build(k, rig) {
      const T = k.T, DIM = D.DIM;
      const C = {
        coat: '#f5f2f4', lining: '#c8323f', stripe: '#d23a48', vest: '#8b7cb8', shirt: '#2b2632',
        shorts: '#26222e', tights: '#2c2631', strap: '#c93a46', belt: '#1f1c22', pouch: '#a88a6f',
        metal: '#d6d2da', shoe: '#f7f3f5', sole: '#f2a2bf', cuff: '#4db6c6', ribbon: '#d23445',
      };

      /* ---------------- 头发 ---------------- */
      const hair = D.hair.build(k, rig, {
        color: '#6d4b3e', tip: '#e59ca2', tipFrom: 0.55, length: -0.54,
        ponytail: { az: -104, pol: 40, end: -0.34, count: 7 }, skip: [-128, -96],
      });
      // 马尾上的红丝带蝴蝶结 + 蓝红晶花
      {
        const tie = k.node(rig.headC, hair.anchors.tie, [0, 0, 0.3], 'tie');
        const rib = k.mat(C.ribbon, { rim: 0.2, double: true });
        for (const s of [-1, 1]) {
          const loop = new T.TorusGeometry(0.022, 0.0065, 8, 18);
          k.mesh(loop, rib, tie, { p: [0, 0.012 * s, 0.018 * s], r: [0.4 * s, 1.2, 0], s: [1, 0.7, 1] });
          k.mesh(k.sweep([[0, 0, 0], [-0.01, -0.03, 0.01 * s], [-0.004, -0.07, 0.02 * s], [-0.012, -0.1, 0.03 * s]], { w: (t) => 0.009 * (1 - t * 0.4), h: 0.0022, up: [1, 0, 0], sway: (t) => t }), rib, tie);
        }
        k.mesh(k.ellipsoid(0.011, 0.012, 0.011), rib, tie);
        const gem = [['#5a8cf0', 0], ['#e0485e', 1.3], ['#9a6ee0', 2.5], ['#ffffff', 3.8]];
        gem.forEach(([c, a]) => {
          const m = k.mat(c, { glow: 0.25, rim: 0.5, line: '#302040' });
          k.mesh(new T.OctahedronGeometry(1, 0), m, tie, { p: [0.004 + Math.cos(a) * 0.014, 0.025 + Math.sin(a) * 0.012, 0.02], r: [0, 0, a], s: [0.006, 0.02, 0.005] });
        });
      }

      /* ---------------- 上身：衬衫 / 背心 / 丝带 / 工作证 ---------------- */
      const shirt = k.mat(C.shirt, { rim: 0.15 });
      k.mesh(k.lathe([[0.092, 0.05], [0.083, 0.105], [0.062, 0.126], [0.036, 0.136]], { sz: 0.76 }), shirt, rig.chest);
      // 衬衫立领 + 领尖
      k.mesh(k.lathe([[0.034, -0.01], [0.034, 0.012], [0.032, 0.022]], { seg: 28 }), shirt, rig.neck, { p: [0, 0.0, 0] });
      for (const s of [-1, 1]) k.mesh(k.rbox(0.026, 0.02, 0.004, 0.0015), shirt, rig.neck, { p: [s * 0.016, -0.004, 0.03], r: [0.35, s * 0.35, s * 0.5] });
      const vest = k.mat(C.vest, { rim: 0.25 });
      k.mesh(k.shell([[0.088, -0.095], [0.094, -0.03], [0.1, 0.03], [0.1, 0.068], [0.093, 0.1], [0.07, 0.12], [0.05, 0.13]],
        { sz: 0.77, gap: (y) => (y > 0.055 ? Math.min(1.5, (y - 0.055) * 22) : 0) }), vest, rig.chest);
      k.mesh(k.lathe([[0.086, -0.045], [0.081, 0.03], [0.083, 0.1], [0.088, 0.155]], { sz: 0.79 }), vest, rig.spine);
      // 针织罗纹（背心下摆）
      k.mesh(k.lathe([[0.088, -0.05], [0.09, -0.03], [0.087, -0.015]], { sz: 0.8 }), k.mat('#7a6ba6', { rim: 0.2 }), rig.spine);
      // 三色丝带：环绕 + 胸前交叉
      {
        const band = k.lathe([[0.1005, -0.066], [0.1015, -0.05], [0.1005, -0.034]], { sz: 0.775, seg: 48 });
        k.grad(band, 'y', -0.066, -0.034, '#3b62c6', '#d33a45');
        const bm = k.mat('#ffffff', { vertexColors: true, rim: 0.2 });
        k.mesh(band, bm, rig.chest);
        const stripe = (c) => k.mat(c, { rim: 0.15, outline: false });
        const cols = [C.ribbon, '#f4f4f6', '#3b62c6'];
        for (const s of [-1, 1]) {
          const g = k.node(rig.chest, [0, -0.05, 0.081], [0, 0, s * 0.62]);
          cols.forEach((c, i) => k.mesh(k.rbox(0.0065, 0.1, 0.004, 0.0015), stripe(c), g, { p: [(i - 1) * 0.0066, 0, 0.001 * s] }));
        }
        k.mesh(k.rbox(0.018, 0.014, 0.008, 0.003), k.mat(C.ribbon, {}), rig.chest, { p: [0, -0.05, 0.083] });
      }
      // 工作证（她的左胸）
      {
        const g = k.node(rig.chest, [0.052, 0.035, 0.074], [0.12, 0.5, 0.05]);
        k.mesh(k.rbox(0.036, 0.05, 0.004, 0.003), k.mat('#f7f7f9', { rim: 0.2 }), g);
        k.mesh(k.rbox(0.036, 0.011, 0.005, 0.002), k.mat('#4a74c9', { outline: false }), g, { p: [0, 0.019, 0.0005] });
        k.mesh(k.rbox(0.013, 0.016, 0.005, 0.001), k.mat('#c9ced8', { outline: false }), g, { p: [-0.008, -0.004, 0.0005] });
        k.mesh(k.rbox(0.008, 0.01, 0.006, 0.002), k.mat(C.metal, {}), g, { p: [0, 0.028, 0] });
      }

      /* ---------------- 外套 ---------------- */
      const coatSw = k.sway('coat', rig.chest, { stiff: 18, damp: 4.2, gain: 1.7, len: 0.62, gravity: 0.85, wind: 0.009, max: 0.2, flare: 1.4 });
      const coatMat = k.mat(C.coat, { sway: coatSw, collide: true, rim: 0.3, line: '#4a3a44' });
      const coatG = k.shell(
        [[0.25, -0.72], [0.215, -0.58], [0.182, -0.44], [0.152, -0.3], [0.13, -0.19], [0.12, -0.1], [0.119, 0.0], [0.121, 0.06], [0.113, 0.1], [0.086, 0.128], [0.06, 0.142]],
        {
          seg: 64, sx: 1.12, sz: 0.84,
          gap: (y) => (y > 0.05 ? 0.95 + (y - 0.05) * 8 : 0.95 + -y * 0.95),
          jag: (q) => 0.028 * Math.abs(Math.sin(q * 5 + 0.7)) + 0.02 * Math.max(0, Math.sin(q * 11 + 2)) + 0.035 * (1 - Math.cos(q)) / 2,
          jagH: 0.1,
        });
      k.swayY(coatG, 0.06, -0.76, 1, 1.25);
      const coat = k.mesh(coatG, coatMat, rig.chest);
      k.lining(coat, C.lining, { sway: coatSw, collide: true, inset: 0.985 });
      // 翻领（白面红底）
      const collarG = k.shell([[0.09, 0.115], [0.082, 0.14], [0.07, 0.165]], { seg: 40, gap: 1.5, sx: 1.08, sz: 0.9 });
      const collar = k.mesh(collarG, k.mat(C.coat, { rim: 0.3, line: '#4a3a44' }), rig.chest);
      k.lining(collar, C.lining, { inset: 0.97 });
      // 前襟红色滚边（沿开口两侧）
      for (const s of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const y = 0.1 - i * 0.082;
          const gap = y > 0.05 ? 0.95 + (y - 0.05) * 8 : 0.95 + -y * 0.95;
          const r = y > -0.1 ? 0.121 : y > -0.3 ? 0.12 + (-0.1 - y) * 0.16 : 0.152 + (-0.3 - y) * 0.235;
          const q = gap / 2 + 0.015;
          pts.push([s * Math.sin(q) * r * 1.12 * 1.004, y, Math.cos(q) * r * 0.84 * 1.004]);
        }
        const g = k.sweep(pts, { w: 0.007, h: 0.0035, seg: 40, rad: 5, up: (t, P) => new T.Vector3(P.x, 0, P.z).normalize(), sway: (t) => Math.pow(Math.min(1, t * 1.05), 1.25) });
        k.mesh(g, k.mat(C.stripe, { sway: coatSw, rim: 0.15, outline: false }), rig.chest);
      }

      /* ---------------- 袖子 ---------------- */
      const sleeve = k.mat(C.coat, { rim: 0.3, line: '#4a3a44' });
      for (const s of ['L', 'R']) {
        k.mesh(k.limb(DIM.UA + 0.03, [0.053, 0.051, 0.05, 0.049], { capB: 0.4 }), sleeve, rig.shoulder[s], { p: [0, 0.018, 0] });
        const cuffG = k.lathe([[0.063, -0.19], [0.058, -0.13], [0.052, -0.05], [0.05, 0.03]], { seg: 32 });
        const cuff = k.mesh(cuffG, k.mat(C.coat, { rim: 0.3, line: '#4a3a44', double: false }), rig.elbow[s]);
        k.lining(cuff, C.lining, { inset: 0.97 });
        const red = k.mat(C.stripe, { rim: 0.15, outline: false });
        for (const y of [-0.132, -0.152]) k.mesh(k.lathe([[0.0595, y - 0.006], [0.0605, y], [0.0595, y + 0.006]], { seg: 32 }), red, rig.elbow[s]);
      }

      /* ---------------- 腰：腰带 / 腰包 / 短裤 ---------------- */
      const belt = k.mat(C.belt, { rim: 0.2 });
      k.mesh(k.lathe([[0.1, 0.035], [0.102, 0.06], [0.099, 0.082]], { sz: 0.83, seg: 44 }), belt, rig.hips);
      k.mesh(k.rbox(0.032, 0.026, 0.008, 0.004), k.mat(C.metal, { rim: 0.4 }), rig.hips, { p: [0, 0.058, 0.084] });
      const pouch = k.mat(C.pouch, { rim: 0.2 });
      [[0.083, 0.038, 0.052, 0.55], [-0.09, 0.035, 0.03, -0.9], [0.05, 0.03, -0.075, 2.6]].forEach(([x, y, z, ry]) => {
        const g = k.node(rig.hips, [x, y, z], [0, ry, 0]);
        k.mesh(k.rbox(0.05, 0.048, 0.028, 0.008), pouch, g);
        k.mesh(k.rbox(0.052, 0.018, 0.03, 0.006), k.mat('#8d7059', {}), g, { p: [0, 0.018, 0.001] });
      });
      const skirtSw = k.sway('shorts', rig.hips, { stiff: 30, damp: 6, gain: 0.8, len: 0.15, gravity: 0.3, wind: 0.004, flare: 0.6 });
      const shortsG = k.shell([[0.142, -0.155], [0.124, -0.085], [0.11, -0.02], [0.101, 0.045]], { sz: 0.86, seg: 48, jag: (q) => 0.006 * Math.sin(q * 16), jagH: 0.02 });
      k.swayY(shortsG, 0.0, -0.16, 1);
      k.mesh(shortsG, k.mat(C.shorts, { sway: skirtSw, collide: true, rim: 0.2 }), rig.hips);
      // 外套腰侧垂下的两条长红带（随步伐飘动）
      {
        const ribSw = k.sway('ribbon', rig.chest, { stiff: 9, damp: 2.4, gain: 2.4, len: 0.5, gravity: 0.8, wind: 0.022, max: 0.26, flare: 1.4 });
        const rm = k.mat(C.ribbon, { sway: ribSw, double: true, rim: 0.25, line: '#5a1820', lineW: 0.6 });
        for (const s of [-1, 1]) {
          const x0 = s * 0.14;
          const pts = [[x0, -0.2, -0.035], [x0 + s * 0.02, -0.3, -0.05], [x0 + s * 0.03, -0.42, -0.04], [x0 + s * 0.05, -0.56, -0.07], [x0 + s * 0.06, -0.7, -0.06], [x0 + s * 0.09, -0.82, -0.09]];
          const g = k.sweep(pts, { seg: 48, rad: 6, w: (t) => 0.016 * (1 - t * 0.3), h: 0.002, up: [s, 0, 0], sway: (t) => t });
          k.mesh(g, rm, rig.chest);
        }
      }

      /* ---------------- 腿：裤袜 + 红绳 + 鞋 ---------------- */
      const tights = k.mat(C.tights, { rim: 0.3, rimColor: '#8a7aa8' });
      const strap = k.mat(C.strap, { rim: 0.15, outline: false });
      for (const s of ['L', 'R']) {
        k.mesh(k.limb(DIM.TH, [0.064, 0.06, 0.052, 0.045, 0.042], { sz: 0.95 }), tights, rig.leg[s]);
        k.mesh(k.limb(DIM.SH, [0.042, 0.046, 0.04, 0.032, 0.029], { sz: 0.95 }), tights, rig.knee[s]);
        k.mesh(k.helix(-0.08, -0.29, (t) => 0.043 - t * 0.011, 2.2, { sz: 0.95, w: 0.006, dir: s === 'L' ? 1 : -1 }), strap, rig.knee[s]);
        if (s === 'L') k.mesh(k.helix(-0.06, -0.3, (t) => 0.061 - t * 0.016, 1.6, { sz: 0.95, w: 0.007, a0: 1 }), strap, rig.leg[s]);
        // 鞋
        const an = rig.ankle[s];
        k.mesh(k.rbox(0.07, 0.062, 0.152, 0.028), k.mat(C.shoe, { rim: 0.25 }), an, { p: [0, -0.034, 0.03] });
        k.mesh(k.rbox(0.076, 0.03, 0.162, 0.012), k.mat(C.sole, { rim: 0.2 }), an, { p: [0, -0.075, 0.032] });
        k.mesh(k.lathe([[0.041, -0.004], [0.043, 0.01], [0.04, 0.024]], { seg: 24 }), k.mat(C.cuff, { rim: 0.2 }), an);
        const lace = k.mat(C.ribbon, { outline: false });
        for (let i = 0; i < 3; i++) k.mesh(k.rbox(0.042, 0.005, 0.009, 0.002), lace, an, { p: [0, -0.006 - i * 0.009, 0.046 + i * 0.02], r: [0.6, 0, 0] });
      }

      /* ---------------- 法杖：白色枝干 + 晶叶 ---------------- */
      const staff = new T.Group();
      staff.name = 'staff';
      const wood = k.mat('#ece8ee', { rim: 0.35, line: '#5a5060' });
      const shaftPts = [[0, 0, 0], [0.004, 0.35, 0.002], [-0.006, 0.7, 0.004], [0.004, 1.02, -0.004], [0.012, 1.28, 0.006], [0.02, 1.42, 0.01]];
      k.mesh(k.sweep(shaftPts, { seg: 60, rad: 10, w: (t) => 0.0135 - 0.005 * t + 0.0015 * Math.sin(t * 40), h: (t) => 0.0135 - 0.005 * t, sway: () => 0 }), wood, staff);
      const leafCols = ['#e0485e', '#5a8cf0', '#9a6ee0', '#ffffff', '#f7a8c8', '#6fc8f0'];
      const leafMats = leafCols.map((c) => k.mat(c, { glow: 0.28, rim: 0.55, line: '#3a2a48', lineW: 0.7 }));
      const twigs = [
        [[0.004, 1.02, -0.004], [0.08, 1.14, 0.01], [0.15, 1.2, 0.03], [0.2, 1.29, 0.02]],
        [[-0.002, 0.95, 0], [-0.07, 1.06, -0.01], [-0.12, 1.15, 0.02], [-0.16, 1.26, 0.0]],
        [[0.012, 1.28, 0.006], [0.07, 1.36, -0.02], [0.1, 1.46, 0.0]],
        [[0.012, 1.25, 0.006], [-0.05, 1.36, 0.02], [-0.07, 1.47, 0.03]],
        [[0.0, 0.86, 0.0], [0.07, 0.94, 0.03], [0.12, 0.98, 0.05]],
      ];
      let li = 0;
      twigs.forEach((tw, ti) => {
        k.mesh(k.sweep(tw, { seg: 16, rad: 6, w: (t) => 0.007 * (1 - t * 0.6), sway: () => 0 }), wood, staff);
        const curve = new T.CatmullRomCurve3(tw.map((p) => new T.Vector3(...p)));
        const n = 5 + (ti % 2);
        for (let j = 1; j <= n; j++) {
          const t = j / n;
          const P = curve.getPointAt(t), Tn = curve.getTangentAt(Math.min(t, 0.999));
          const side = j % 2 ? 1 : -1;
          const leaf = k.mesh(new T.OctahedronGeometry(1, 0), leafMats[li++ % leafMats.length], staff, { s: [0.016, 0.062 - t * 0.014, 0.006] });
          leaf.position.copy(P);
          const dir = new T.Vector3().copy(Tn).applyAxisAngle(new T.Vector3(0, 0, 1), side * 0.7).add(new T.Vector3(0, 0.3, side * 0.2)).normalize();
          leaf.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
          leaf.position.addScaledVector(dir, 0.03);
        }
      });
      const tip = k.node(staff, [0.02, 1.45, 0.01], null, 'staffTip');
      const rest = {
        armRFwd: 0.16, armRRaise: 0.22, elbowR: 0.62, foreRTwist: 0.15, wristR: 0.05,
        armLRaise: 0.16, elbowL: 0.18,
      };
      D.holdProp(k, rig, staff, 'R', rest, { at: [0, 0.5, 0], dir: [-0.12, 1, 0.05] });

      return {
        rest, arms: { L: 1, R: 0.32 }, freeHand: 'L', soleDepth: 0.025,
        props: { staff, staffTip: tip, staffHand: 'R' },
      };
    },
  });
})();
