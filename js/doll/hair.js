/* =========================================================
 * 3D 人偶 · 头发
 * 她的标志性发型：蓬松的长卷发 + 齐眉碎刘海 + 两缕鬓发 + 呆毛。
 * 所有时装都可以调用 DOLL.hair.build(k, rig, opts) 并按需改参数
 * （例如纯烬的侧马尾、泳装的高马尾、帽子下压缩发量等）。
 * 坐标：头心坐标系（rig.headC），R = DOLL.DIM.R。
 * ========================================================= */
(() => {
  const D = window.DOLL;
  const R = () => D.DIM.R;
  const rad = (d) => (d * Math.PI) / 180;

  /** 头皮坐标：az 从正前方转向她左侧（+X）为正（度）；pol 为离头顶的极角（度）；m 为半径倍数 */
  function scalp(az, pol, m = 1.06) {
    const r = R() * m, a = rad(az), p = rad(pol);
    const back = Math.cos(a) < 0 ? 1.06 : 1;
    return [r * Math.sin(p) * Math.sin(a) * 0.96, r * Math.cos(p) * 1.02, r * Math.sin(p) * Math.cos(a) * back];
  }
  D.scalp = scalp;

  const lerp = (a, b, t) => a + (b - a) * t;
  const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

  /**
   * 一缕垂发：从头皮 (az, pol0) 出发，先沿头部弧面到 pol1，再向下垂落到 yEnd（头心坐标）。
   * o = { m0, m1, spread(末端向外张开量), wave(波浪幅度), waves(波数), phase, curlEnd(末端内卷), fwd(前后偏移) }
   */
  function fallPath(az, pol0, yEnd, o = {}) {
    const pol1 = o.pol1 ?? 100, m0 = o.m0 ?? 1.0, m1 = o.m1 ?? 1.14, n = o.n ?? 7;
    const pts = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      pts.push(scalp(az, lerp(pol0, pol1, t), lerp(m0, m1, Math.sqrt(t))));
    }
    const base = pts[pts.length - 1];
    const a = rad(az), out = [Math.sin(a), 0, Math.cos(a)], side = [Math.cos(a), 0, -Math.sin(a)];
    const spread = o.spread ?? 0.06, wave = o.wave ?? 0.018, waves = o.waves ?? 2.2, ph = o.phase ?? 0;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      let p = [base[0], lerp(base[1], yEnd, t), base[2]];
      p = add(p, out, spread * Math.pow(t, 0.8) + (o.fwd ?? 0) * t);
      p = add(p, side, Math.sin(t * Math.PI * waves + ph) * wave * Math.min(1, t * 2.5));
      if (o.curlEnd && t > 0.8) p = add(p, out, -o.curlEnd * (t - 0.8) * 5);
      pts.push(p);
    }
    return pts;
  }

  /**
   * 构建头发。opts:
   *  color, light(发束中段颜色), tip(发梢颜色), tipFrom(发梢渐变起点 0~1), shade,
   *  length(后发末端 y，头心坐标，默认 -0.52 ≈ 腰臀), volume(1),
   *  bangs(true), locks(true), ahoge(true), back(true),
   *  ponytail: { az, pol, len, color? } 侧马尾
   *  skip: { az:[min,max] } 在某角度范围内不生成后发（给马尾让位）
   * 返回 { group, mat, sway, anchors: { tie } }
   */
  D.hair = {
    scalp, fallPath,
    build(k, rig, o = {}) {
      const T = k.T;
      const C = o.color || '#6d4b3e';
      const tip = o.tip || '#d98a8c';
      const tipFrom = o.tipFrom ?? 0.55;
      const vol = o.volume ?? 1;
      const group = k.node(rig.headC, [0, 0, 0], null, 'hair');
      const sw = k.sway('hair', rig.headC, { stiff: 26, damp: 5.5, gain: 1.4, len: 0.42, gravity: 0.55, wind: o.wind ?? 0.007, max: 0.14, flare: 0.5 });
      const mat = k.mat('#ffffff', { vertexColors: true, shade: o.shade || '#b99aae', rim: 0.32, sway: sw, line: o.line || '#2e1a18', lineW: 0.9 });
      const capMat = k.mat(C, { shade: o.shade || '#b99aae', rim: 0.25, line: o.line || '#2e1a18', lineW: 0.9 });
      const geoms = [];
      const Rr = R();
      const strand = (pts, so) => {
        const g = k.strand([0, 0, 0], pts, Object.assign({ colors: [so.c0 || C, so.c1 || tip, 1.4, so.t0 ?? tipFrom] }, so));
        geoms.push(g);
        return g;
      };

      // 发顶：略大的球，前额以下的部分收进头里（由刘海遮挡发际线）
      if (o.cap !== false) {
        const g = new T.SphereGeometry(Rr * 1.075, 48, 36);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const nx = x / (Rr * 1.075), ny = y / (Rr * 1.075), nz = z / (Rr * 1.075);
          // 前脸区域：z 为正且低于发际线
          const hair = ny > 0.42 - 0.35 * Math.max(0, -nz) - 0.25 * Math.abs(nx) || nz < -0.05;
          const s = hair ? 1 : 0.86;
          x *= s * 0.97; y *= s * 1.02; z *= s * (nz < 0 ? 1.07 : 1);
          if (ny < -0.3 && nz < 0.2) { y *= 1 + 0.25 * (-ny - 0.3); }
          p.setXYZ(i, x, y + Rr * 0.012, z - Rr * 0.012);
        }
        g.computeVertexNormals();
        k.mesh(g, capMat, group);
      }

      // 刘海：从头顶前部沿额头垂下，末端略向外翘
      if (o.bangs !== false) {
        const list = o.bangList || [
          [-58, 38, 84, 0.034], [-40, 26, 92, 0.04], [-22, 20, 97, 0.042], [-7, 18, 90, 0.038],
          [8, 18, 99, 0.04], [24, 20, 93, 0.042], [41, 26, 90, 0.04], [58, 38, 83, 0.034], [0, 14, 80, 0.03],
        ];
        list.forEach(([az, p0, p1, w], i) => {
          const pts = [];
          for (let j = 0; j <= 5; j++) {
            const t = j / 5;
            const pol = lerp(p0, p1, t), m = lerp(1.05, 1.12, t) + (t > 0.8 ? (t - 0.8) * 0.25 : 0);
            pts.push(scalp(az + Math.sin(t * 2.4 + i) * 4, pol, m));
          }
          strand(pts, { w0: w, tip: 0.05, bulge: 0.35, thick: 0.34, sway: (t) => 0.28 * t, t0: 2, seg: 16 });
        });
      }

      // 鬓发：耳前两缕，垂到胸前
      if (o.locks !== false) {
        for (const s of [-1, 1]) {
          const pts = [scalp(s * 60, 55, 1.04), scalp(s * 72, 80, 1.12), scalp(s * 78, 100, 1.2)];
          const b = pts[2];
          for (let i = 1; i <= 5; i++) {
            const t = i / 5;
            pts.push([b[0] + s * (0.012 * Math.sin(t * 5)), lerp(b[1], o.lockEnd ?? -0.3, t), b[2] + 0.03 * t + 0.012 * Math.sin(t * 6)]);
          }
          strand(pts, { w0: 0.03, tip: 0.1, bulge: 0.35, thick: 0.4, sway: (t) => 0.8 * t, seg: 24 });
          // 第二缕稍短，靠后
          const pts2 = [scalp(s * 75, 60, 1.04), scalp(s * 88, 90, 1.14), scalp(s * 92, 110, 1.2)];
          const b2 = pts2[2];
          for (let i = 1; i <= 4; i++) {
            const t = i / 4;
            pts2.push([b2[0] + s * 0.015 * t, lerp(b2[1], (o.lockEnd ?? -0.3) + 0.08, t), b2[2] + 0.012 * Math.sin(t * 5)]);
          }
          strand(pts2, { w0: 0.03, tip: 0.1, thick: 0.42, sway: (t) => 0.8 * t, seg: 20 });
        }
      }

      // 后发：蓬松长卷发
      if (o.back !== false) {
        const yEnd = o.length ?? -0.52;
        const n = Math.round((o.backCount ?? 17) * vol);
        const skip = o.skip;
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1);
          const az = lerp(98, 262, u);
          const azN = az > 180 ? az - 360 : az;
          if (skip && azN >= skip[0] && azN <= skip[1]) continue;
          const back = Math.cos(rad(az)); // −1 正后方
          const len = yEnd + (1 + back) * 0.1 * (o.sideShort ?? 1) + Math.sin(i * 2.7) * 0.03;
          const pts = fallPath(az, 22 + Math.abs(Math.sin(i * 1.9)) * 18, len, {
            spread: (0.05 + 0.05 * vol) * (0.8 + 0.4 * Math.abs(Math.sin(i * 3.1))), wave: 0.02 * (o.curl ?? 1), waves: 2 + (i % 3) * 0.4, phase: i * 1.3,
            m1: 1.13 + 0.03 * Math.sin(i * 2.1), curlEnd: 0.015,
          });
          strand(pts, { w0: 0.05 + 0.012 * Math.sin(i * 1.7), tip: 0.06, bulge: 0.45, thick: 0.34, sway: (t) => t, seg: 30, rad: 8 });
        }
        // 内层（填补缝隙，颜色更暗一点）
        for (let i = 0; i < 7; i++) {
          const az = lerp(120, 240, i / 6);
          const pts = fallPath(az, 40, yEnd + 0.1, { spread: 0.02, wave: 0.012, phase: i, m1: 1.05 });
          strand(pts, { w0: 0.06, tip: 0.2, thick: 0.4, sway: (t) => t * 0.9, c0: o.inner || '#5a3c32', c1: tip, t0: tipFrom + 0.1, seg: 20 });
        }
      }

      // 发顶短发束（增加层次）
      if (o.crown !== false) {
        for (let i = 0; i < 9; i++) {
          const az = i * 40 + 10;
          const pts = [scalp(az, 4, 1.05), scalp(az, 30, 1.1), scalp(az + 6, 58, 1.11)];
          strand(pts, { w0: 0.045, tip: 0.2, thick: 0.28, sway: () => 0, seg: 10, t0: 2 });
        }
      }

      // 呆毛
      if (o.ahoge !== false) {
        const a = scalp(-6, 8, 1.06);
        strand([a, [a[0] - 0.004, a[1] + 0.035, a[2] + 0.006], [a[0] + 0.012, a[1] + 0.06, a[2] + 0.03], [a[0] + 0.02, a[1] + 0.055, a[2] + 0.06]],
          { w0: 0.014, tip: 0.05, thick: 0.5, sway: (t) => 0.6 * t, seg: 14, t0: 2 });
        const b = scalp(8, 10, 1.06);
        strand([b, [b[0] + 0.01, b[1] + 0.03, b[2] - 0.004], [b[0] + 0.024, b[1] + 0.042, b[2] + 0.012]],
          { w0: 0.011, tip: 0.05, thick: 0.5, sway: (t) => 0.5 * t, seg: 10, t0: 2 });
      }

      // 马尾（侧马尾 / 双马尾 / 高马尾）：ponytail 为单个对象，ponytails 为数组
      // 每个 = { az, pol, end(末端 y), count(发束数), reach(向外甩出的距离), w0(发束宽) }
      const anchors = { ties: [] };
      const tails = [].concat(o.ponytail || [], o.ponytails || []);
      tails.forEach((pt) => {
        const s = Math.sign(pt.az || -1) || 1;
        const root = scalp(pt.az ?? -100, pt.pol ?? 42, 1.1);
        anchors.ties.push(root);
        if (!anchors.tie) anchors.tie = root;
        const n = pt.count ?? 7, reach = pt.reach ?? 1, back = Math.cos(rad(pt.az ?? -100)) < -0.5;
        // 横向：侧马尾甩向外侧；正后方的马尾甩向后方
        const ox = back ? 0 : s, oz = back ? -1 : -0.35;
        for (let i = 0; i < n; i++) {
          const ph = i * 1.7, spread = (i - (n - 1) / 2) * 0.012;
          const P = (dx, dy, dz) => [root[0] + ox * dx + (back ? spread * 1.5 : 0), root[1] + dy, root[2] + oz * dx + dz + (back ? 0 : spread)];
          const pts = [root, P(0.05 * reach, 0.035, 0), P(0.1 * reach, 0.0, -0.01), P(0.12 * reach, -0.08, -0.02)];
          const b = pts[3];
          for (let j = 1; j <= 5; j++) {
            const t = j / 5;
            pts.push([b[0] + ox * (0.02 * t) + 0.016 * Math.sin(t * 5 + ph), lerp(b[1], pt.end ?? -0.36, t), b[2] + oz * 0.02 * t + spread * 2 + 0.012 * Math.cos(t * 4 + ph)]);
          }
          strand(pts, { w0: pt.w0 ?? 0.034, tip: 0.06, bulge: 0.5, thick: 0.4, sway: (t) => Math.min(1, t * 1.1), seg: 30 });
        }
      });

      const g = k.merge(geoms);
      g.computeBoundingSphere();
      k.mesh(g, mat, group, { name: 'hairStrands' });
      return { group, mat, sway: sw, anchors };
    },
  };
})();
