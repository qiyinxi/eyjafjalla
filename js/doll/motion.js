/* =========================================================
 * 3D 人偶 · 动作
 * 程序化步行（按速度自动匹配步幅与步频，不滑步）、待机呼吸与重心转移、
 * 视线 / 头部跟随、眨眼、动作队列（淡入淡出混合）。
 * 动作注册：DOLL.action(id, { label, dur, loop, ground, fadeIn, fadeOut, hand, start(ctx), pose(t, P, ctx), end(ctx) })
 *   pose 在“基础姿势”副本上修改通道，运行器按权重混合回去。
 * ========================================================= */
(() => {
  const D = window.DOLL;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  /** 动作里常用的缓动工具 */
  D.ease = {
    clamp, lerp, smooth,
    inOut: (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    out: (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3),
    in: (t) => Math.pow(clamp(t, 0, 1), 3),
    /** 梯形窗口：a→b 升到 1，c→d 降到 0 */
    win: (t, a, b, c, d) => (t <= a || t >= d ? 0 : t < b ? smooth((t - a) / (b - a)) : t <= c ? 1 : 1 - smooth((t - c) / (d - c))),
    /** 钟形：a→m→b */
    bell: (t, a, m, b) => (t <= a || t >= b ? 0 : t < m ? smooth((t - a) / (m - a)) : 1 - smooth((t - m) / (b - m))),
    osc: (t, hz, ph = 0) => Math.sin(t * hz * TAU + ph),
  };

  /**
   * 单腿步态：φ ∈ [0,1)，0 = 脚跟着地（腿在前）；0~0.6 支撑相，0.6~1 摆动相。
   * 返回 { fwd, knee, pitch }（pitch 为脚掌期望俯仰，脚尖朝上为正）
   */
  function legCycle(ph, A, lift = 1) {
    ph = ((ph % 1) + 1) % 1;
    if (ph < 0.6) {
      const s = ph / 0.6;
      let pitch = 0;
      if (ph < 0.08) pitch = lerp(0.22, 0, ph / 0.08);
      else if (ph > 0.42) pitch = -0.6 * Math.pow((ph - 0.42) / 0.18, 1.6);
      return { fwd: lerp(A, -A, s), knee: 0.16 * Math.sin(Math.PI * s) * (0.5 + A), pitch };
    }
    const s = (ph - 0.6) / 0.4;
    const kneeS = Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.18)), 1.1);
    return {
      fwd: -A + 2 * A * (0.5 - 0.5 * Math.cos(Math.PI * s)),
      knee: (0.35 + 1.5 * A) * kneeS * lift,
      pitch: lerp(-0.6, 0.22, smooth(s * 1.3)),
    };
  }

  /**
   * 创建动作控制器
   * opts = { rest: 静止姿势覆盖, arms: { L: 摆臂系数, R: 摆臂系数 }, freeHand: 'L'|'R', props }
   */
  D.makeMotion = function makeMotion(rig, opts = {}) {
    const P = D.pose(); // 输出
    const base = D.pose();
    const tmp = D.pose();
    const rest = D.pose(opts.rest || {});
    const LEG = D.DIM.TH + D.DIM.SH + D.DIM.ANKLE;
    const st = {
      x: 0, z: 0, heading: 0, speed: 0, phase: 0, turnRate: 0,
      target: null, faceTo: null, maxSpeed: 0.78,
      look: null, lookYaw: 0, lookPitch: 0, headYaw: 0, headPitch: 0,
      blinkT: 1.5, blink: 0, t: 0, act: null, queue: [], flare: 0, idleT: 0,
      arms: Object.assign({ L: 1, R: 1 }, opts.arms || {}),
    };
    const listeners = { action: [], arrive: [] };
    const V = new D.T.Vector3();

    /* ---------------------------------------------------------- 待机 */
    function idle(t, out) {
      D.copyPose(out, rest);
      const br = Math.sin((t / 3.8) * TAU);
      out.chestPitch += -0.018 * br;
      out.armLRaise += 0.012 * br; out.armRRaise += 0.012 * br;
      out.neckPitch += 0.01 * br;
      // 慢速重心转移：偶尔换到另一条腿
      const ws = Math.sin((t / 9) * TAU) * 0.8 + Math.sin((t / 23) * TAU) * 0.2;
      out.hipsX += 0.012 * ws;
      out.hipsRoll += -0.035 * ws;
      out.chestRoll += 0.02 * ws;
      out.headRoll += 0.03 * ws + 0.02 * Math.sin(t * 0.37);
      out.kneeL += 0.09 * Math.max(0, -ws); out.legLFwd += 0.05 * Math.max(0, -ws);
      out.kneeR += 0.09 * Math.max(0, ws); out.legRFwd += 0.05 * Math.max(0, ws);
      out.legLSpread += -0.012 * ws; out.legRSpread += 0.012 * ws;
      out.headYaw += 0.04 * Math.sin(t * 0.23);
      out.earL += 0.05 * Math.sin(t * 0.9); out.earR += 0.05 * Math.sin(t * 0.9 + 1.4);
      return out;
    }

    /* ---------------------------------------------------------- 步行 */
    function walk(out, speed) {
      const vN = clamp(speed / 0.8, 0, 1.4);
      const A = 0.1 + 0.27 * Math.min(1, vN);
      const ph = st.phase;
      const L = legCycle(ph, A), R = legCycle(ph + 0.5, A);
      out.legLFwd += L.fwd; out.kneeL += L.knee;
      out.legRFwd += R.fwd; out.kneeR += R.knee;
      out._pitchL = L.pitch; out._pitchR = R.pitch;
      const c = Math.cos(ph * TAU), s = Math.sin(ph * TAU);
      out.hipsX += 0.014 * s * Math.min(1, vN);
      out.hipsRoll += -0.05 * s * Math.min(1, vN);
      out.hipsYaw += -0.09 * c * vN;
      out.spineYaw += 0.06 * c * vN;
      out.chestYaw += 0.07 * c * vN;
      out.neckYaw += -0.02 * c * vN;
      out.headYaw += -0.02 * c * vN;
      out.chestRoll += 0.03 * s * Math.min(1, vN);
      out.spinePitch += 0.03 + 0.04 * vN;
      out.headPitch += -0.03 - 0.02 * vN;
      out.hipsPitch += 0.03 * vN;
      // 摆臂（与同侧腿相反）
      const B = (0.22 + 0.2 * vN);
      out.armLFwd += -B * c * st.arms.L; out.armRFwd += B * c * st.arms.R;
      out.elbowL += (0.12 + 0.28 * Math.max(0, -c)) * st.arms.L;
      out.elbowR += (0.12 + 0.28 * Math.max(0, c)) * st.arms.R;
      out.armLRaise += 0.04 * vN; out.armRRaise += 0.04 * vN;
      // 转弯时身体内倾
      out.hipsRoll += clamp(st.turnRate * speed * 0.12, -0.12, 0.12);
      out.earL += 0.12 * Math.abs(s) * vN; out.earR += 0.12 * Math.abs(c) * vN;
      return out;
    }

    /** 脚掌放平：根据链上的俯仰把脚掌调成期望角度（pitchL/R 缺省为 0） */
    function levelFeet(out, wL = 1, wR = 1) {
      const pL = out._pitchL || 0, pR = out._pitchR || 0;
      out.ankleL = lerp(out.ankleL, pL - out.legLFwd + out.kneeL + out.hipsPitch, wL);
      out.ankleR = lerp(out.ankleR, pR - out.legRFwd + out.kneeR + out.hipsPitch, wR);
      out._pitchL = 0; out._pitchR = 0;
    }

    /* ---------------------------------------------------------- 动作 */
    function makeCtx(def, o = {}) {
      const ctx = {
        def, t: 0, dur: def.dur, k: 0, side: o.side ?? (Math.random() < 0.5 ? -1 : 1),
        hand: o.hand || def.hand || opts.freeHand || 'L', rig, motion: api, props: opts.props || {}, data: {}, opts: o,
        kit: opts.kit, T: D.T, attached: [],
        fx: (name, o2) => api.emit('fx', name, o2),
        /** 粒子：p = { x,y,z(世界), vx,vy,vz, life(秒), s(大小，米), c(颜色), g(重力), drag(每帧阻尼 0.9~1) } */
        particle: (p) => api.emit('fx', 'particle', p),
        turn: (a) => { st.heading += a; },
        flare: (v) => { st.flare = Math.max(st.flare, v); },
        /** 临时道具：挂到某个节点上，动作结束时自动移除 */
        attach: (obj, parent) => { parent.add(obj); ctx.attached.push(obj); return obj; },
        /** 当前角色在世界中的位置与朝向 */
        where: () => ({ x: st.x, z: st.z, heading: st.heading }),
        E: D.ease,
      };
      return ctx;
    }
    function act(id, o = {}) {
      const def = D.actions[id];
      if (!def) return false;
      if (st.act && st.act.def.id === id && !def.restart) return true;
      if (def.needs && !def.needs.every((n) => (opts.props || {})[n])) return false;
      if (st.act) finish(st.act, true);
      st.target = null;
      const ctx = makeCtx(def, o);
      st.act = { def, ctx, t: 0, stopping: -1 };
      def.start && def.start(ctx);
      listeners.action.forEach((f) => f(id, 'start'));
      return true;
    }
    function finish(a, cut) {
      a.def.end && a.def.end(a.ctx, cut);
      a.ctx.attached.forEach((o) => o.parent && o.parent.remove(o));
      a.ctx.attached.length = 0;
      listeners.action.forEach((f) => f(a.def.id, 'end'));
      if (st.act === a) st.act = null;
      st.idleT = 0;
    }
    function stopAct() {
      if (st.act && st.act.stopping < 0) st.act.stopping = st.act.t;
    }

    /* ---------------------------------------------------------- 更新 */
    function update(dt, env = {}) {
      st.t += dt;
      const t = st.t;
      // 移动
      let desired = 0;
      if (st.target) {
        const dx = st.target[0] - st.x, dz = st.target[1] - st.z, dist = Math.hypot(dx, dz);
        if (dist < 0.04) {
          st.target = null;
          listeners.arrive.forEach((f) => f());
        } else {
          const want = Math.atan2(dx, dz);
          let da = ((want - st.heading + Math.PI * 3) % TAU) - Math.PI;
          const turn = clamp(da, -4.5 * dt, 4.5 * dt);
          st.heading += turn;
          st.turnRate = lerp(st.turnRate, turn / Math.max(dt, 1e-3), 0.2);
          desired = Math.min(st.maxSpeed, dist * 2.4) * clamp(1 - Math.abs(da) / 1.6, 0.15, 1);
        }
      } else {
        st.turnRate = lerp(st.turnRate, 0, 0.2);
        if (st.faceTo != null && !st.act) {
          let da = ((st.faceTo - st.heading + Math.PI * 3) % TAU) - Math.PI;
          if (Math.abs(da) < 0.02) st.faceTo = null;
          else {
            const turn = clamp(da, -2.4 * dt, 2.4 * dt);
            st.heading += turn;
            st.turnRate = turn / Math.max(dt, 1e-3);
          }
        }
      }
      const acc = desired > st.speed ? 1.6 : 2.6;
      st.speed += clamp(desired - st.speed, -acc * dt, acc * dt);
      st.x += Math.sin(st.heading) * st.speed * dt;
      st.z += Math.cos(st.heading) * st.speed * dt;
      // 步频：支撑相内脚相对髋的位移 = 2·L·sin(A)，与速度匹配
      const vN = clamp(st.speed / 0.8, 0, 1.4);
      const A = 0.1 + 0.27 * Math.min(1, vN);
      const turning = Math.abs(st.turnRate) > 0.6;
      const freq = st.speed > 0.02 ? (0.6 * st.speed) / (2 * LEG * Math.sin(A)) : turning ? 1.4 : 0;
      const walkW = smooth(Math.max(st.speed / 0.22, turning ? 0.5 : 0));
      if (walkW > 0.001) st.phase = (st.phase + freq * dt) % 1;
      else st.phase = 0;

      // 基础姿势：待机 ⊕ 步行
      idle(t, base);
      base._pitchL = 0; base._pitchR = 0;
      if (walkW > 0.001) {
        D.copyPose(tmp, base);
        walk(tmp, Math.max(st.speed, turning ? 0.12 : 0));
        D.lerpPose(base, base, tmp, walkW);
        base._pitchL = tmp._pitchL * walkW; base._pitchR = tmp._pitchR * walkW;
      }
      if (walkW > 0.05) st.idleT = 0; else st.idleT += dt;

      // 视线：头跟随慢，眼睛领先
      let ly = 0, lp = 0;
      if (st.look) {
        rig.headC.getWorldPosition(V);
        const dx = st.look.x - V.x, dy = st.look.y - V.y, dz = st.look.z - V.z;
        const c = Math.cos(-st.heading), s = Math.sin(-st.heading);
        const lx = dx * c + dz * s, lz = -dx * s + dz * c;
        ly = clamp(Math.atan2(lx, Math.max(0.05, lz)), -1.1, 1.1);
        lp = clamp(Math.atan2(dy, Math.hypot(lx, lz)), -0.5, 0.5);
        if (lz < -0.2) { ly = 0; lp = 0; }
      }
      st.lookYaw = lerp(st.lookYaw, ly, Math.min(1, dt * 10));
      st.lookPitch = lerp(st.lookPitch, lp, Math.min(1, dt * 10));
      st.headYaw = lerp(st.headYaw, st.lookYaw * 0.75, Math.min(1, dt * 3.2));
      st.headPitch = lerp(st.headPitch, st.lookPitch * 0.6, Math.min(1, dt * 3.2));
      base.neckYaw += st.headYaw * 0.4; base.headYaw += st.headYaw * 0.6;
      base.neckPitch -= st.headPitch * 0.35; base.headPitch -= st.headPitch * 0.65;
      base.eyeX += clamp((st.lookYaw - st.headYaw) * 2.2, -1, 1);
      base.eyeY += clamp((st.lookPitch - st.headPitch) * 2.4, -0.8, 0.8);

      // 眨眼
      st.blinkT -= dt;
      if (st.blinkT <= 0) {
        st.blink = 0.001;
        st.blinkT = 2 + Math.random() * 4;
        if (Math.random() < 0.2) st.blinkT = 0.28;
      }
      if (st.blink > 0) {
        st.blink += dt / 0.16;
        if (st.blink >= 1) st.blink = 0;
      }
      base.blink = Math.max(base.blink, st.blink > 0 ? Math.sin(Math.PI * st.blink) : 0);

      // 动作
      D.copyPose(P, base);
      P._pitchL = base._pitchL; P._pitchR = base._pitchR;
      let ground = true, level = true;
      const a = st.act;
      if (a) {
        a.t += dt;
        const def = a.def, ctx = a.ctx;
        ctx.t = a.t; ctx.dt = dt; ctx.k = def.dur ? clamp(a.t / def.dur, 0, 1) : 0;
        const fin = def.fadeIn ?? 0.28, fout = def.fadeOut ?? 0.32;
        let w = smooth(a.t / fin);
        if (a.stopping >= 0) w *= 1 - smooth((a.t - a.stopping) / fout);
        else if (!def.loop && def.dur) w *= smooth((def.dur - a.t) / fout);
        D.copyPose(tmp, base);
        tmp._pitchL = 0; tmp._pitchR = 0;
        def.pose(a.t, tmp, ctx);
        D.lerpPose(P, base, tmp, w);
        P._pitchL = lerp(base._pitchL || 0, tmp._pitchL || 0, w);
        P._pitchR = lerp(base._pitchR || 0, tmp._pitchR || 0, w);
        if (def.ground === false) ground = w < 0.5;
        if (def.level === false) level = w < 0.5;
        const done = (a.stopping >= 0 && a.t - a.stopping >= fout) || (!def.loop && def.dur && a.t >= def.dur);
        if (done) finish(a, false);
      }
      if (level) levelFeet(P);
      st.flare *= Math.max(0, 1 - dt * 2.5);

      // 应用到骨骼
      rig.root.position.set(st.x, 0, st.z);
      rig.root.rotation.y = st.heading;
      rig.apply(P);
      rig.ground(P, ground);
      return P;
    }

    const api = {
      st, P, update, act, stopAct, levelFeet,
      walkTo(x, z, face) {
        if (st.act) { if (st.act.def.lock) return false; stopAct(); }
        st.target = [x, z];
        st.faceTo = face ?? null;
        return true;
      },
      stop() { st.target = null; },
      face(angle) { st.faceTo = angle; },
      lookAt(v) { st.look = v ? (st.look || new D.T.Vector3()).copy(v) : null; },
      setRest(r) { D.copyPose(rest, D.pose(r)); },
      setArms(a) { Object.assign(st.arms, a); },
      busy: () => !!st.act,
      moving: () => !!st.target || st.speed > 0.03,
      current: () => (st.act ? st.act.def.id : null),
      on(ev, f) { (listeners[ev] = listeners[ev] || []).push(f); },
      emit(ev, ...args) { (listeners[ev] || []).forEach((f) => f(...args)); },
      place(x, z, h) { st.x = x; st.z = z; if (h != null) st.heading = h; st.speed = 0; st.target = null; },
    };
    return api;
  };

  /* ------------------------------------------------------------------ 内置动作 */
  const E = D.ease;
  /** 取“空闲的手”对应通道名 */
  const H = (ctx) => (ctx.hand === 'R' ? { raise: 'armRRaise', fwd: 'armRFwd', tw: 'armRTwist', el: 'elbowR', fore: 'foreRTwist', wr: 'wristR', roll: 'wristRRoll', s: -1 } : { raise: 'armLRaise', fwd: 'armLFwd', tw: 'armLTwist', el: 'elbowL', fore: 'foreLTwist', wr: 'wristL', roll: 'wristLRoll', s: 1 });
  D.handCh = H;

  D.action('wave', {
    label: '挥手', dur: 2.6,
    pose(t, P, ctx) {
      const h = H(ctx), w = E.win(t, 0, 0.35, 2.1, 2.6);
      P[h.raise] = lerp(P[h.raise], 2.45, w);
      P[h.fwd] = lerp(P[h.fwd], 0.35, w);
      P[h.el] = lerp(P[h.el], 0.55 + 0.3 * E.osc(t, 2.6), w);
      P[h.roll] = lerp(P[h.roll], 0.25 * E.osc(t, 2.6, 0.6), w);
      P[h.fore] = lerp(P[h.fore], 1.3, w);
      P.headRoll += 0.12 * h.s * w;
      P.chestRoll += -0.05 * h.s * w;
      P.happy = E.win(t, 0.3, 0.5, 1.9, 2.1);
      P.mouth = 1; P.mouthOpen = 0.35 * w;
    },
  });

  D.action('bow', {
    label: '鞠躬', dur: 2.4,
    pose(t, P) {
      const w = E.win(t, 0, 0.6, 1.4, 2.2);
      P.spinePitch += 0.32 * w; P.chestPitch += 0.2 * w; P.headPitch += 0.22 * w; P.hipsPitch += 0.12 * w;
      P.armLFwd = lerp(P.armLFwd, 0.32, w); P.armRFwd = lerp(P.armRFwd, 0.32, w);
      P.armLRaise = lerp(P.armLRaise, -0.14, w); P.armRRaise = lerp(P.armRRaise, -0.14, w);
      P.elbowL = lerp(P.elbowL, 0.5, w); P.elbowR = lerp(P.elbowR, 0.5, w);
      P.foreLTwist = lerp(P.foreLTwist, 1.2, w); P.foreRTwist = lerp(P.foreRTwist, 1.2, w);
      P.blink = Math.max(P.blink, 0.9 * E.win(t, 0.5, 0.7, 1.3, 1.5));
      P.happy = E.win(t, 1.6, 1.8, 2.2, 2.4);
      P.mouth = 1;
    },
  });

  D.action('jump', {
    label: '跳一下', dur: 1.25, ground: true,
    pose(t, P) {
      // 预备下蹲 → 起跳 → 落地缓冲
      const crouch = E.bell(t, 0, 0.22, 0.34) + 0.8 * E.bell(t, 0.78, 0.9, 1.2);
      const air = t > 0.32 && t < 0.8 ? Math.sin(Math.PI * (t - 0.32) / 0.48) : 0;
      P.kneeL += 0.9 * crouch + 0.5 * air; P.kneeR += 0.9 * crouch + 0.5 * air;
      P.legLFwd += 0.45 * crouch + 0.2 * air; P.legRFwd += 0.45 * crouch + 0.2 * air;
      P.spinePitch += 0.18 * crouch - 0.06 * air;
      P.lift = 0.16 * air;
      P.armLRaise += 0.9 * air; P.armRRaise += 0.9 * air;
      P.armLFwd += -0.3 * crouch + 0.4 * air; P.armRFwd += -0.3 * crouch + 0.4 * air;
      P.elbowL += 0.4 * air; P.elbowR += 0.4 * air;
      P.happy = E.win(t, 0.3, 0.4, 1.0, 1.2);
      P.mouthOpen = 0.5 * air; P.mouth = 1;
      P._pitchL = -0.5 * air; P._pitchR = -0.5 * air;
      P.earL += 0.5 * air; P.earR += 0.5 * air;
    },
  });

  D.action('spin', {
    label: '转圈', dur: 1.9, lock: true,
    start(ctx) { ctx.data.last = 0; },
    pose(t, P, ctx) {
      const k = E.inOut(clamp((t - 0.15) / 1.5, 0, 1));
      ctx.turn((k - ctx.data.last) * TAU * ctx.side);
      ctx.data.last = k;
      const w = E.win(t, 0, 0.25, 1.5, 1.9);
      const sp = Math.sin(Math.PI * k);
      ctx.flare(0.05 * sp);
      P.armLRaise = lerp(P.armLRaise, 1.25, w); P.armRRaise = lerp(P.armRRaise, 1.25, w);
      P.elbowL = lerp(P.elbowL, 0.25, w); P.elbowR = lerp(P.elbowR, 0.25, w);
      P.foreLTwist = lerp(P.foreLTwist, -0.6, w); P.foreRTwist = lerp(P.foreRTwist, -0.6, w);
      const step = Math.sin(k * TAU * 3);
      P.kneeL += 0.45 * Math.max(0, step) * sp; P.kneeR += 0.45 * Math.max(0, -step) * sp;
      P.legLFwd += 0.12 * Math.max(0, step) * sp; P.legRFwd += 0.12 * Math.max(0, -step) * sp;
      P.headRoll += -0.15 * ctx.side * sp; P.chestRoll += 0.06 * ctx.side * sp;
      P.happy = E.win(t, 0.2, 0.4, 1.5, 1.8); P.mouth = 1; P.mouthOpen = 0.3 * sp;
    },
  });

  D.action('cast', {
    label: '施法', dur: 3.2,
    start(ctx) { ctx.data.fired = false; },
    pose(t, P, ctx) {
      // 持杖手（非空闲手）高举，空闲手向前张开
      const staff = ctx.props.staffHand || (ctx.hand === 'L' ? 'R' : 'L');
      const S = H({ hand: staff }), F = H({ hand: staff === 'L' ? 'R' : 'L' });
      const up = E.win(t, 0.1, 0.8, 2.4, 3.1);
      P[S.fwd] = lerp(P[S.fwd], 2.3, up); P[S.raise] = lerp(P[S.raise], 0.35, up); P[S.el] = lerp(P[S.el], 0.35, up);
      P[F.fwd] = lerp(P[F.fwd], 1.05, up); P[F.raise] = lerp(P[F.raise], 0.5, up); P[F.el] = lerp(P[F.el], 0.3, up);
      P[F.fore] = lerp(P[F.fore], 1.4, up); P[F.wr] = lerp(P[F.wr], -0.5, up);
      P.chestPitch += -0.12 * up; P.headPitch += -0.22 * up; P.spinePitch += -0.04 * up;
      P.legLFwd += 0.12 * up * S.s; P.legRFwd += -0.12 * up * S.s; P.kneeL += 0.08 * up; P.kneeR += 0.08 * up;
      P.blink = Math.max(P.blink, 0.85 * E.win(t, 0.6, 0.8, 1.4, 1.6));
      P.mouthOpen = 0.25 * E.win(t, 0.8, 1.0, 1.6, 1.8) * (0.6 + 0.4 * E.osc(t, 5));
      P.brow = 0.6 * up;
      if (!ctx.data.fired && t > 1.3) { ctx.data.fired = true; ctx.fx('cast', { hand: staff }); }
      ctx.flare(0.02 * E.bell(t, 1.2, 1.5, 2.4));
      P.earL += 0.3 * up; P.earR += 0.3 * up;
    },
  });

  D.action('look', {
    label: '张望', dur: 3.4,
    pose(t, P, ctx) {
      const s = ctx.side;
      const y = 0.75 * s * E.win(t, 0.2, 0.7, 1.3, 1.7) - 0.75 * s * E.win(t, 1.7, 2.2, 2.7, 3.2);
      P.headYaw += y * 0.6; P.neckYaw += y * 0.35; P.chestYaw += y * 0.15;
      P.eyeX = clamp(y * 1.4, -1, 1);
      // 手搭凉棚
      const h = H(ctx), w = E.win(t, 0.3, 0.8, 2.6, 3.2);
      P[h.fwd] = lerp(P[h.fwd], 1.35, w); P[h.raise] = lerp(P[h.raise], 0.55, w);
      P[h.el] = lerp(P[h.el], 1.95, w); P[h.fore] = lerp(P[h.fore], 1.5, w); P[h.wr] = lerp(P[h.wr], -0.3, w);
      P.headPitch += -0.06 * w;
      P.earL += 0.25 * w; P.earR += 0.25 * w;
    },
  });

  D.action('nod', {
    label: '点头', dur: 1.2,
    pose(t, P) {
      const v = Math.max(0, Math.sin(t * TAU * 1.6)) * (1 - t / 1.2);
      P.headPitch += 0.2 * v; P.neckPitch += 0.06 * v;
      P.happy = E.win(t, 0.1, 0.2, 0.9, 1.1); P.mouth = 1;
    },
  });

  D.action('tilt', {
    label: '歪头', dur: 2.2,
    pose(t, P, ctx) {
      const w = E.win(t, 0, 0.4, 1.6, 2.1);
      P.headRoll += 0.28 * ctx.side * w; P.neckRoll += 0.08 * ctx.side * w;
      P.eyeX += -0.3 * ctx.side * w;
      P.mouth = lerp(P.mouth, 0.2, w); P.brow = 0.5 * w;
      P.earL += (ctx.side > 0 ? -0.2 : 0.3) * w; P.earR += (ctx.side > 0 ? 0.3 : -0.2) * w;
    },
  });

  /** 行走中也能播放的“叠加”小动作（不打断移动）：暂不使用 */
  D.clamp = clamp;
})();
