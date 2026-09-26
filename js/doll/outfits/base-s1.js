/* =========================================================
 * 时装 · 艾雅法拉 · 夏卉 FA018（珊瑚海岸 / V）
 * 夏日泳装：粉色格纹荷叶边比基尼（扇贝边抹胸 + 荷叶边泳裤）、
 * 白粉色薄纱荷叶边披肩（露肩、喇叭荷叶袖）、腰间系着的粉色雪纺开襟纱裙
 * （大荷叶边下摆 + 两条长飘带）、右大腿荷叶边腿环、左脚踝黑底青纹脚环，赤足；
 * 双马尾 + 右侧扶桑花发饰；右手握缀着扶桑花与粉丝带的荆棘细杖。
 * ========================================================= */
(() => {
  const D = window.DOLL;

  D.outfit('base-s1', {
    form: 'base', name: '夏卉 FA018', series: '珊瑚海岸 / V', order: 30,
    look: {
      horn: '#efe7df', hornStripe: '#c2b3a8', ear: '#f3e2d6', earIn: '#f4b0bc',
      faceLook: { iris: ['#6a1936', '#e0587c', '#ffc2d0'] },
    },
    build(k, rig) {
      const T = k.T, DIM = D.DIM;
      const C = {
        hair: '#6d4b3e', hairTip: '#ec9fb0',
        gLight: '#fff3f6', gStripe: 'rgba(232,112,150,0.55)',
        shrug: '#fdf1f6', shrugShade: '#c9b2d8', shrugLine: '#8c6a86',
        chiffon: '#f7a6c2', chiffonTop: '#fbd0de', hem: '#fde6ef',
        ribbon: '#f29ab8', ribbonDark: '#d9668f',
        staff: '#3a262c', thorn: '#b4486a',
        petal: '#ffd3df', petalIn: '#f06d92', flowerC: '#c42e52', pollen: '#f7d56a',
        anklet: '#1e1b24', ankletLine: '#48d0e0',
      };
      const lerp = (a, b, t) => a + (b - a) * t;
      const clamp01 = (v) => Math.min(1, Math.max(0, v));

      /* ---------------- 小工具 ---------------- */
      /** UV 缩放（配合重复贴图，让格纹大小与实物一致） */
      const uvScale = (g, su, sv) => {
        const a = g.attributes.uv;
        for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv);
        return g;
      };
      /** 顶点变形：fn(x, y, z) → [x, y, z]，之后重算法线 */
      const warp = (g, fn) => {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const v = fn(p.getX(i), p.getY(i), p.getZ(i));
          p.setXYZ(i, v[0], v[1], v[2]);
        }
        g.computeVertexNormals();
        return g;
      };
      /**
       * 荷叶边：从 yT（缝合边，半径 r0）到 yB（自由边，半径 r1）的环形带，
       * 半径按 sin(nψ) 起伏形成波浪褶，越靠自由边起伏越大。yB 可高于 yT（向上翻的荷叶边）。
       * o = { sx, sz, gap, rows, pw, ph, bulge2(ψ, t)→额外半径系数 }
       */
      function frill(r0, r1, yT, yB, n, amp, o = {}) {
        const rows = o.rows ?? 5, prof = [];
        for (let i = 0; i <= rows; i++) {
          const t = i / rows;
          prof.push([lerp(r0, r1, Math.pow(t, o.pw ?? 1.3)), lerp(yT, yB, t)]);
        }
        if (yB < yT) prof.reverse(); // 车削轮廓须从下到上
        return k.shell(prof, {
          seg: o.seg ?? 96, sx: o.sx, sz: o.sz, gap: o.gap,
          bulge: (q, y) => {
            const t = clamp01((yT - y) / (yT - yB));
            return (1 + amp * Math.sin(q * n + (o.ph ?? 0)) * Math.pow(t, 1.1)) * (o.bulge2 ? o.bulge2(q, t) : 1);
          },
        });
      }
      /** 扶桑花（花面朝 +Z）：五片花瓣（花心深粉→瓣尖浅粉）+ 红色花心 + 花柱与黄色花粉，合并为一个顶点色几何 */
      function hibiscus(r, o = {}) {
        const parts = [];
        const cIn = k.color(o.inner || C.petalIn), cOut = k.color(o.outer || C.petal), tmp = new T.Color();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + (o.rot ?? 0);
          const g = k.ellipsoid(r * 0.36, r * 0.56, r * 0.07, { seg: 14, segY: 10 });
          g.translate(0, r * 0.5, 0);
          g.rotateX(o.cup ?? 0.45);
          g.rotateZ(a);
          k.paint(g, (x, y, z) => tmp.copy(cIn).lerp(cOut, clamp01(Math.hypot(x, y) / r * 1.25 - 0.1)));
          parts.push(g);
        }
        const ctr = k.ellipsoid(r * 0.14, r * 0.14, r * 0.08, { seg: 10, segY: 8 });
        k.paint(ctr, () => k.color(C.flowerC));
        parts.push(ctr);
        const sty = k.sweep([[0, 0, 0], [r * 0.08, r * 0.1, r * 0.35], [r * 0.18, r * 0.2, r * 0.7]], { seg: 6, rad: 5, w: r * 0.035, sway: () => 0 });
        k.paint(sty, () => k.color(C.flowerC));
        parts.push(sty);
        const pol = k.ellipsoid(r * 0.07, r * 0.07, r * 0.07, { seg: 8, segY: 6 });
        pol.translate(r * 0.19, r * 0.21, r * 0.72);
        k.paint(pol, () => k.color(C.pollen));
        parts.push(pol);
        return k.merge(parts);
      }
      /** 按位置 + 朝向（+Z 指向 dir）摆放几何 */
      const orient = (g, p, dir, roll = 0) => {
        const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(...dir).normalize());
        if (roll) q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), roll));
        g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p), q, new T.Vector3(1, 1, 1)));
        return g;
      };

      /* ---------------- 贴图：粉色格纹 / 脚环 / 腿环 ---------------- */
      const ging = k.canvasTex(64, 64, (g, w, h) => {
        g.fillStyle = C.gLight;
        g.fillRect(0, 0, w, h);
        g.fillStyle = C.gStripe;
        g.fillRect(0, 0, w / 2, h);
        g.fillRect(0, 0, w, h / 2); // 交叠处自然加深
      });
      ging.wrapS = ging.wrapT = T.RepeatWrapping;
      const gMat = (o = {}) => k.mat('#ffffff', Object.assign({ map: ging, shade: '#d9a3bd', rim: 0.2, line: '#7a2e48' }, o));
      const ankTex = k.canvasTex(128, 32, (g, w, h) => {
        g.fillStyle = C.anklet;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = C.ankletLine;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(0, 5); g.lineTo(w, 5); g.moveTo(0, h - 5); g.lineTo(w, h - 5);
        for (let i = 0; i < 2; i++) {
          const x0 = i * 64;
          g.moveTo(x0 + 6, 5); g.lineTo(x0 + 58, h - 5);
          g.moveTo(x0 + 58, 5); g.lineTo(x0 + 6, h - 5);
          g.moveTo(x0 + 1.5, 5); g.lineTo(x0 + 1.5, h - 5);
        }
        g.stroke();
      });
      ankTex.wrapS = T.RepeatWrapping;
      const garTex = k.canvasTex(128, 32, (g, w, h) => {
        g.fillStyle = '#fbf3f6';
        g.fillRect(0, 0, w, h);
        g.fillStyle = C.ribbonDark;
        for (let i = 0; i < 4; i++) g.fillRect(i * 32 + 6, 12, 18, 8); // 穿过蕾丝的丝带
      });
      garTex.wrapS = T.RepeatWrapping;

      /* ---------------- 头发：双马尾 ---------------- */
      const hair = D.hair.build(k, rig, {
        color: C.hair, tip: C.hairTip, tipFrom: 0.58, length: -0.3, sideShort: 0.6, backCount: 15,
        ponytails: [
          { az: 100, pol: 38, end: -0.56, count: 8, reach: 1.0, w0: 0.038 },
          { az: -100, pol: 38, end: -0.56, count: 8, reach: 1.0, w0: 0.038 },
        ],
      });
      // 发圈（粉色格纹）
      {
        const sc = gMat();
        hair.anchors.ties.forEach((p, i) => {
          const s = i === 0 ? 1 : -1;
          const g = uvScale(new T.TorusGeometry(0.019, 0.01, 10, 24), 6, 1);
          k.mesh(g, sc, rig.headC, { p: [p[0] + s * 0.004, p[1], p[2]], r: [0, Math.PI / 2, 0.35 * s] });
        });
      }
      // 右侧扶桑花发饰（靠近右角根部）+ 两片小叶
      {
        const p = D.scalp(-58, 46, 1.1);
        const dir = [p[0] * 1.1, p[1] * 0.5, p[2] + 0.06];
        const fg = orient(hibiscus(0.034, { rot: 0.3 }), p, dir, 0.4);
        k.mesh(fg, k.mat('#ffffff', { vertexColors: true, rim: 0.3, line: '#8a3050', lineW: 0.7 }), rig.headC);
        const leaf = k.mat('#6fae7a', { rim: 0.2, line: '#2c4a30', lineW: 0.6 });
        [[-0.9, 1], [0.6, -1]].forEach(([a, s]) => {
          const g = k.ellipsoid(0.008, 0.02, 0.003, { seg: 10, segY: 8 });
          g.translate(0, 0.03, -0.004);
          g.rotateZ(a + Math.PI * 0.75 * s);
          orient(g, p, dir, 0.4);
          k.mesh(g, leaf, rig.headC);
        });
      }

      /* ---------------- 比基尼上装：扇贝边抹胸 + 露肩格纹泡泡袖 ---------------- */
      {
        const yTop = 0.078;
        const top = k.lathe([[0.088, -0.012], [0.097, -0.002], [0.1, 0.028], [0.1, 0.058], [0.096, yTop]], { sz: 0.8, seg: 64 });
        // 上缘扇贝
        const p = top.attributes.position;
        for (let i = 0; i < p.count; i++) {
          if (Math.abs(p.getY(i) - yTop) > 1e-4) continue;
          const psi = Math.atan2(p.getX(i), p.getZ(i));
          p.setY(i, yTop - 0.009 + 0.009 * Math.abs(Math.sin(psi * 7)) - 0.01 * Math.exp(-psi * psi * 30));
        }
        uvScale(top, 14, 2);
        const tm = gMat();
        k.mesh(top, tm, rig.chest);
        // 胸前中央的抽褶结
        k.mesh(k.ellipsoid(0.009, 0.016, 0.006), k.mat('#e27ca0', { rim: 0.2, line: '#7a2e48' }), rig.chest, { p: [0, 0.03, 0.078], r: [-0.25, 0, 0] });
        // 露肩泡泡袖（格纹，套在上臂）
        for (const s of ['L', 'R']) {
          const g = uvScale(k.lathe([[0.036, -0.068], [0.047, -0.056], [0.05, -0.036], [0.045, -0.018], [0.037, -0.01]], { seg: 32 }), 6, 1);
          k.mesh(g, tm, rig.shoulder[s]);
        }
      }

      /* ---------------- 薄纱披肩：露肩荷叶领 + 开襟短身 + 喇叭荷叶袖 ---------------- */
      {
        const shrugSw = k.sway('shrug', rig.chest, { stiff: 22, damp: 4.5, gain: 1.2, len: 0.2, gravity: 0.4, wind: 0.008, max: 0.1, flare: 1.0 });
        const sm = k.mat(C.shrug, { shade: C.shrugShade, rim: 0.35, line: C.shrugLine, lineW: 0.8, double: true, sway: shrugSw });
        const body = k.shell([[0.123, -0.07], [0.115, -0.035], [0.109, 0.0], [0.108, 0.04], [0.11, 0.07]],
          { seg: 64, sx: 1.06, sz: 0.86, gap: (y) => 2.2 + (y < 0 ? -y * 2 : 0) });
        k.swayY(body, 0.07, -0.07, 0.25);
        const hemF = frill(0.121, 0.142, -0.064, -0.108, 18, 0.1, { sx: 1.06, sz: 0.86, gap: 2.4, rows: 4 });
        k.swayY(hemF, -0.06, -0.11, 0.5);
        const collarF = frill(0.108, 0.136, 0.086, 0.032, 16, 0.08, { sx: 1.08, sz: 0.88, gap: 1.9, rows: 4, ph: 0.6 });
        k.swayY(collarF, 0.09, 0.03, 0.2);
        k.mesh(k.merge([body, hemF, collarF]), sm, rig.chest);
        // 喇叭荷叶袖：靠身体一侧收窄，避免插进躯干
        const slm = k.mat(C.shrug, { shade: C.shrugShade, rim: 0.35, line: C.shrugLine, lineW: 0.8, double: true });
        for (const [s, sg] of [['L', 1], ['R', -1]]) {
          const g = frill(0.047, 0.086, -0.02, -0.165, 11, 0.13, {
            rows: 6, pw: 1.5, seg: 64,
            bulge2: (q, t) => 1 - 0.3 * t * Math.max(0, -sg * Math.sin(q)),
          });
          k.mesh(g, slm, rig.shoulder[s]);
        }
      }

      /* ---------------- 比基尼泳裤 + 腰间荷叶边 ---------------- */
      {
        const bm = gMat();
        const g = k.lathe([[0.001, -0.108], [0.02, -0.106], [0.074, -0.094], [0.1, -0.06], [0.107, -0.03], [0.108, -0.005], [0.106, 0.014]], { sz: 0.77, sx: 1.17, seg: 64 });
        uvScale(g, 14, 3);
        k.mesh(g, bm, rig.hips);
        const f = frill(0.107, 0.118, 0.02, -0.018, 22, 0.07, { sx: 1.17, sz: 0.79, rows: 3, seg: 110 });
        uvScale(f, 16, 0.6);
        k.mesh(f, gMat({ double: true }), rig.hips);
      }

      /* ---------------- 雪纺开襟纱裙（系在腰间，前开，后长） ---------------- */
      const wrapSw = k.sway('wrap', rig.hips, { stiff: 13, damp: 3.4, gain: 1.9, len: 0.42, gravity: 0.7, wind: 0.014, max: 0.22, flare: 1.8 });
      {
        const Y0 = 0.052, YH = -0.33;
        const gapF = (y) => 1.2 + Math.max(0, Y0 - y) * 3.4;
        const wave = (q, y) => 1 + 0.05 * Math.sin(q * 9 + 0.5) * clamp01((Y0 - y) / (Y0 - YH));
        const drop = (x, y, z) => {
          const psi = Math.atan2(x, z), t = Math.max(0, (Y0 - y) / (Y0 - YH));
          return (1 - Math.cos(psi)) / 2 * 0.1 * t * t + 0.012 * Math.sin(psi * 7) * t;
        };
        const skirtG = k.shell([[0.3, YH], [0.26, -0.24], [0.215, -0.14], [0.172, -0.055], [0.147, 0.0], [0.125, 0.033], [0.108, Y0]],
          { seg: 80, sx: 1.1, sz: 0.9, gap: gapF, bulge: wave });
        warp(skirtG, (x, y, z) => [x, y - drop(x, y, z), z]);
        k.swayY(skirtG, Y0, YH - 0.2, 1, 1.15);
        k.grad(skirtG, 'y', Y0, YH - 0.1, C.chiffonTop, C.chiffon);
        // 两遍绘制：先画背面（远侧内面），再画正面，透明叠加顺序正确
        const common = { vertexColors: true, sway: wrapSw, collide: true, transparent: true, opacity: 0.8, rim: 0.35, outline: false, shade: '#e08fb0' };
        k.mesh(skirtG, k.mat('#ffffff', Object.assign({ side: T.BackSide }, common)), rig.hips, { order: 1 });
        k.mesh(skirtG, k.mat('#ffffff', Object.assign({ side: T.FrontSide }, common)), rig.hips, { order: 2 });
        // 下摆大荷叶边（不透明浅粉）
        const hemG = frill(0.296, 0.345, YH + 0.005, YH - 0.085, 26, 0.11, {
          sx: 1.1, sz: 0.9, gap: (y) => gapF(y), rows: 5, seg: 140,
        });
        warp(hemG, (x, y, z) => [x, y - drop(x, y, z), z]);
        k.swayY(hemG, Y0, YH - 0.2, 1, 1.15);
        k.mesh(hemG, k.mat(C.hem, { sway: wrapSw, collide: true, double: true, shade: '#d7a8c6', rim: 0.35, line: '#a0607e', lineW: 0.7 }), rig.hips);
        // 腰带（细丝带）+ 左腰侧蝴蝶结
        const rib = k.mat(C.ribbon, { rim: 0.25, line: '#7a2644', lineW: 0.7 });
        const bandG = k.shell([[0.11, Y0 - 0.006], [0.112, Y0 + 0.004], [0.11, Y0 + 0.012]], { seg: 56, sx: 1.1, sz: 0.9, gap: 1.1 });
        k.mesh(bandG, rib, rig.hips);
        const bow = k.node(rig.hips, [0.108, Y0 + 0.002, 0.052], [0, 1.0, 0], 'wrapBow');
        const bowParts = [];
        for (const s of [-1, 1]) {
          const loop = new T.TorusGeometry(0.017, 0.005, 8, 18);
          loop.scale(1, 0.62, 1);
          k.place(loop, [s * 0.017, 0.002, 0], [0, 0, s * 0.25]);
          bowParts.push(loop);
        }
        bowParts.push(k.ellipsoid(0.008, 0.009, 0.006));
        k.mesh(k.merge(bowParts), rib, bow);
        // 两条长飘带（从蝴蝶结垂下，随风飘动）
        const ribSw = k.sway('wrapRibbon', rig.hips, { stiff: 8, damp: 2.2, gain: 2.4, len: 0.45, gravity: 0.8, wind: 0.024, max: 0.26, flare: 1.6 });
        const rm = k.mat(C.ribbon, { sway: ribSw, double: true, rim: 0.25, line: '#7a2644', lineW: 0.6 });
        [[0.118, 0.05, 1], [0.12, 0.03, -1]].forEach(([x0, z0, s], i) => {
          const pts = [[x0, Y0, z0], [x0 + 0.02, Y0 - 0.09, z0 - 0.02 * s], [x0 + 0.04, Y0 - 0.2, z0 - 0.04], [x0 + 0.05, Y0 - 0.32, z0 - 0.02 - 0.03 * s], [x0 + 0.07, Y0 - 0.44 - i * 0.05, z0 - 0.07]];
          const g = k.sweep(pts, { seg: 40, rad: 6, w: (t) => 0.013 * (1 - t * 0.25), h: 0.0018, up: [1, 0, 0.3], sway: (t) => t });
          k.mesh(g, rm, rig.hips);
        });
      }

      /* ---------------- 腿：右大腿荷叶边腿环 / 左脚踝脚环 / 赤足 ---------------- */
      {
        const leg = rig.leg.R, y = -0.085;
        const band = k.lathe([[0.0602, y - 0.008], [0.0612, y], [0.0602, y + 0.008]], { sz: 0.95, seg: 40 });
        uvScale(band, 3, 1);
        k.mesh(band, k.mat('#ffffff', { map: garTex, rim: 0.2, line: '#8a4a64', lineW: 0.7 }), leg);
        const lace = k.mat('#fdf4f7', { shade: '#d9b8cc', rim: 0.3, line: '#9a6a84', lineW: 0.6, double: true });
        const up = frill(0.06, 0.07, y + 0.007, y + 0.022, 14, 0.09, { sz: 0.95, rows: 3, seg: 64 });
        const dn = frill(0.06, 0.068, y - 0.007, y - 0.02, 14, 0.09, { sz: 0.95, rows: 3, seg: 64, ph: 1 });
        k.mesh(k.merge([up, dn]), lace, leg);
        // 腿环外侧的小蝴蝶结
        const bow = k.node(leg, [-0.061, y, 0.012], [0, -Math.PI / 2, 0]);
        const parts = [];
        for (const s of [-1, 1]) {
          const loop = new T.TorusGeometry(0.009, 0.003, 6, 14);
          loop.scale(1, 0.6, 1);
          k.place(loop, [s * 0.009, 0, 0.002], [0, 0, s * 0.3]);
          parts.push(loop);
        }
        parts.push(k.ellipsoid(0.004, 0.005, 0.004));
        k.mesh(k.merge(parts), k.mat(C.ribbonDark, { rim: 0.2, line: '#6a2040', lineW: 0.6 }), bow);
      }
      {
        // 脚环（左脚踝）：黑底 + 青色交叉纹
        const g = k.lathe([[0.03, -0.312], [0.0315, -0.3], [0.0315, -0.286], [0.03, -0.276]], { sz: 0.95, seg: 36 });
        uvScale(g, 3, 1);
        k.mesh(g, k.mat('#ffffff', { map: ankTex, rim: 0.4, rimColor: '#7ee6f0', line: '#0e0c12' }), rig.knee.L);
      }
      // 赤足：隐藏素体的方块脚，换成有足弓、脚跟与脚趾的脚
      for (const [s, sg] of [['L', 1], ['R', -1]]) {
        rig.parts['foot' + s].visible = false;
        const W = [0.021, 0.023, 0.027, 0.029, 0.026], H = [0.028, 0.027, 0.02, 0.012, 0.009];
        const smoothArr = (A) => (t) => {
          const f = t * (A.length - 1), i = Math.min(A.length - 2, Math.floor(f)), u = f - i, e = u * u * (3 - 2 * u);
          return A[i] * (1 - e) + A[i + 1] * e;
        };
        const parts = [];
        parts.push(k.sweep([[sg * -0.001, -0.037, -0.03], [0, -0.038, 0.0], [sg * -0.002, -0.044, 0.04], [sg * -0.003, -0.052, 0.075], [sg * -0.004, -0.055, 0.097]],
          { seg: 24, rad: 14, w: smoothArr(W), h: smoothArr(H), up: [0, 1, 0], sway: () => 0 }));
        // 脚跟 + 脚踝连接
        parts.push(k.place(k.ellipsoid(0.022, 0.025, 0.024, { seg: 18, segY: 12 }), [0, -0.04, -0.028]));
        parts.push(k.place(k.ellipsoid(0.025, 0.03, 0.03, { seg: 18, segY: 12 }), [0, -0.02, -0.006]));
        // 脚趾：大脚趾在内侧（靠身体中线）
        const toes = [[-0.015, 0.108, 0.0085, 0.0075, 0.011], [-0.003, 0.108, 0.0062, 0.006, 0.009], [0.007, 0.104, 0.0058, 0.0055, 0.008], [0.015, 0.098, 0.0054, 0.005, 0.0075], [0.022, 0.09, 0.005, 0.0048, 0.007]];
        toes.forEach(([x, z, rx, ry, rz]) => parts.push(k.place(k.ellipsoid(rx, ry, rz, { seg: 10, segY: 8 }), [sg * x, -0.0575, z])));
        k.mesh(k.merge(parts), rig.skinMat, rig.ankle[s]);
      }

      /* ---------------- 法杖：荆棘细杖 + 扶桑花 + 粉丝带 ---------------- */
      const staff = new T.Group();
      staff.name = 'staff';
      const bark = k.mat(C.staff, { rim: 0.35, rimColor: '#ff9ab8', line: '#140a0d' });
      const L0 = 1.12; // 分叉点高度
      const woodGeo = [];
      woodGeo.push(k.sweep([[0, 0, 0], [0.003, 0.3, 0.002], [-0.004, 0.66, 0.003], [0.003, 0.98, -0.002], [0, L0 + 0.02, 0]],
        { seg: 50, rad: 8, w: (t) => 0.0025 + 0.0075 * Math.min(1, t * 5), sway: () => 0 }));
      const branches = [
        [[0, L0, 0], [0.035, L0 + 0.07, 0.005], [0.075, L0 + 0.15, 0.0], [0.09, L0 + 0.25, -0.01], [0.07, L0 + 0.33, 0], [0.035, L0 + 0.35, 0.01]],
        [[0, L0, 0], [-0.04, L0 + 0.05, -0.005], [-0.085, L0 + 0.11, 0], [-0.11, L0 + 0.19, 0.01], [-0.1, L0 + 0.27, 0], [-0.07, L0 + 0.29, -0.01]],
        [[0, L0 + 0.01, 0], [0.006, L0 + 0.1, 0.01], [-0.008, L0 + 0.18, 0.0], [0.004, L0 + 0.23, -0.004]],
      ];
      const thornGeo = [];
      branches.forEach((br, bi) => {
        woodGeo.push(k.sweep(br, { seg: 30, rad: 7, w: (t) => 0.0075 * (1 - t * 0.65), sway: () => 0 }));
        const curve = new T.CatmullRomCurve3(br.map((p) => new T.Vector3(...p)));
        const n = bi === 2 ? 3 : 6;
        for (let j = 1; j <= n; j++) {
          const t = (j - 0.4) / n, P = curve.getPointAt(t), Tn = curve.getTangentAt(t);
          const side = new T.Vector3().crossVectors(Tn, new T.Vector3(0, 0, 1)).multiplyScalar(j % 2 ? 1 : -1);
          side.z += (j % 3 - 1) * 0.6;
          const dir = side.normalize().addScaledVector(Tn, 0.6).normalize();
          const c = new T.ConeGeometry(0.0035, 0.016, 6);
          c.translate(0, 0.008, 0);
          c.applyMatrix4(new T.Matrix4().compose(P, new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir), new T.Vector3(1, 1, 1)));
          thornGeo.push(c);
        }
      });
      // 杖身上段也有几根刺
      for (let j = 0; j < 5; j++) {
        const y = 0.72 + j * 0.08, a = j * 2.3;
        const dir = new T.Vector3(Math.cos(a), 0.7, Math.sin(a)).normalize();
        const c = new T.ConeGeometry(0.003, 0.013, 6);
        c.translate(0, 0.0065, 0);
        c.applyMatrix4(new T.Matrix4().compose(new T.Vector3(Math.cos(a) * 0.006, y, Math.sin(a) * 0.006), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir), new T.Vector3(1, 1, 1)));
        thornGeo.push(c);
      }
      k.mesh(k.merge(woodGeo), bark, staff);
      k.mesh(k.merge(thornGeo), k.mat(C.thorn, { rim: 0.3, line: '#3a0e1c', lineW: 0.6 }), staff);
      // 扶桑花（花面朝前）
      const flowers = [
        [[0.0, L0 + 0.015, 0.022], [0.1, 0.1, 1], 0.042, 0],
        [[0.082, L0 + 0.2, 0.012], [0.5, 0.3, 1], 0.034, 1],
        [[-0.104, L0 + 0.16, 0.014], [-0.5, 0.2, 1], 0.03, 2],
        [[0.012, L0 - 0.13, 0.014], [0.3, -0.2, 1], 0.027, 3],
      ];
      k.mesh(k.merge(flowers.map(([p, d, r, i]) => orient(hibiscus(r, { rot: i * 0.7 }), p, d, i))),
        k.mat('#ffffff', { vertexColors: true, rim: 0.3, glow: 0.06, line: '#8a3050', lineW: 0.7 }), staff);
      // 花苞
      {
        const buds = [[[-0.07, L0 + 0.29, 0.0], 0.4], [[0.035, L0 + 0.355, 0.012], -0.3]].map(([p, a]) => {
          const g = k.ellipsoid(0.008, 0.016, 0.008, { seg: 10, segY: 8 });
          k.grad(g, 'y', -0.016, 0.016, C.petalIn, C.petal);
          return k.place(g, p, [0, 0, a]);
        });
        k.mesh(k.merge(buds), k.mat('#ffffff', { vertexColors: true, rim: 0.25, line: '#8a3050', lineW: 0.6 }), staff);
      }
      // 粉丝带：分叉下方打结，两条长尾垂下飘动
      {
        const sRib = k.sway('staffRibbon', staff, { stiff: 9, damp: 2.4, gain: 2.2, len: 0.3, gravity: 0.9, wind: 0.02, max: 0.2, flare: 0.6 });
        const knotY = L0 - 0.05;
        const rb = k.mat(C.ribbon, { rim: 0.25, line: '#7a2644', lineW: 0.6, double: true });
        const bowParts = [];
        for (const s of [-1, 1]) {
          const loop = new T.TorusGeometry(0.02, 0.0055, 8, 18);
          loop.scale(1, 0.6, 1);
          k.place(loop, [s * 0.021, knotY + 0.004, 0.012], [0, 0, s * 0.35]);
          bowParts.push(loop);
        }
        bowParts.push(k.place(k.ellipsoid(0.009, 0.01, 0.008), [0, knotY, 0.01]));
        k.mesh(k.merge(bowParts), rb, staff);
        const rt = k.mat(C.ribbon, { sway: sRib, double: true, rim: 0.25, line: '#7a2644', lineW: 0.6 });
        for (const s of [-1, 1]) {
          const pts = [[s * 0.004, knotY, 0.012], [s * 0.025, knotY - 0.06, 0.02], [s * 0.02, knotY - 0.14, 0.012], [s * 0.04, knotY - 0.22, 0.02], [s * 0.035, knotY - 0.3 - (s > 0 ? 0.04 : 0), 0.01]];
          k.mesh(k.sweep(pts, { seg: 30, rad: 6, w: (t) => 0.011 * (1 - t * 0.2), h: 0.0016, up: [0, 0, 1], sway: (t) => t }), rt, staff);
        }
      }
      const tip = k.node(staff, [0, L0 + 0.2, 0.01], null, 'staffTip');
      const rest = {
        armRFwd: 0.16, armRRaise: 0.26, elbowR: 0.62, foreRTwist: 0.15, wristR: 0.05,
        armLRaise: 0.22, elbowL: 0.2,
      };
      D.holdProp(k, rig, staff, 'R', rest, { at: [0, 0.46, 0], dir: [-0.12, 1, 0.05] });

      return {
        rest, arms: { L: 1, R: 0.32 }, freeHand: 'L', soleDepth: 0,
        props: { staff, staffTip: tip, staffHand: 'R' },
      };
    },
  });
})();
