/* =========================================================
 * 职业演示 · 战术地图（第二版）
 * 用她的实际数值演示「术师」与「医疗」各自在做什么：
 *  - 术师：两条路线上的敌人向保护目标推进，她站在中间的高台上打法术伤害（无视防御、吃法术抗性、可对空）；
 *          二重咏唱 / 点燃 / 火山 按游戏规则生效。火山的攻击范围是以她为中心、半径 3 的菱形（范围 x-3）
 *  - 医疗：近卫、重装在两条路上阻挡敌人，承受物理 / 法术攻击与灼燃损伤；
 *          她治疗、回复元素损伤，「氤氲」叠加持续回复；无声润物 / 云霭荫佑 / 火山回响
 * 数值：精英2 · 90级 · 满信赖 · 技能专精三；模组（3 级）与潜能可切换（见 data.js / PRTS）。
 *       敌人为 PRTS 敌人图鉴 0 级数值，移动速度按比例放慢；友军为演示用约数。
 * 画面：
 *  - 地形、单位、弹道都是按当前格子尺寸预渲染好的精灵，每帧只贴图（不用 shadowBlur、不逐帧建渐变）
 *  - 大型特效（熔岩弹、火柱、爆炸、回声、大数字）画在全屏特效层 FX 上，会飞出地图的画框
 *  - 干员本人是游戏里的作战小人（Spine）；没载入之前先画一枚带头像的部署标记
 * 性能：只在看得见时运行（IntersectionObserver），60 帧封顶，粒子 / 数字 / 特效都有上限；
 *       高倍速时交给特效层的熔岩按倍速降低粒子量
 * ========================================================= */
window.SIM = (() => {
  'use strict';
  const COLS = 10, ROWS = 5, TOPB = 0.5, SQ = 0.8; // TOPB：地图上方留给 HUD 的一条（以格宽计）；SQ：格子纵向压扁的比例（俯视镜头）
  // v 场外（本体：熔岩池 / 纯烬：花草地）· h 高台 · g 地面（路线）· b 保护目标 · r 敌人入口
  const MAP = ['vhhhhhhhhv', 'gggggggggr', 'bhhhhhhhhv', 'gggggggggr', 'vhhhhhhhhv'];
  const tile = (i, j) => (j >= 0 && j < ROWS && i >= 0 && i < COLS ? MAP[j][i] : 'x');
  const isHigh = (i, j) => tile(i, j) === 'h';
  // 路线：两条地面路线汇向左侧的保护目标；空中单位从右上角直线飞向目标
  const PATHS = [
    [[9.8, 1.5], [0.5, 1.5], [0.5, 2.5]],
    [[9.8, 3.5], [0.5, 3.5], [0.5, 2.5]],
    [[10.3, 1.12], [1.15, 1.12], [0.5, 2.5]], // 空中：贴着上路上空飞，最后折向目标
  ];
  const SEGL = PATHS.map((P) => P.slice(1).map((p, k) => Math.hypot(p[0] - P[k][0], p[1] - P[k][1])));
  const TAU = Math.PI * 2;
  // ?simprof：统计每帧模拟 / 绘制耗时（window.__simProf），调性能用
  const PROF = /[?&]simprof\b/.test(location.search) ? (window.__simProf = { step: 0, draw: 0, n: 0 }) : null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const fmt = (v) => Math.round(v).toLocaleString();
  const fmtK = (v) => (v >= 100000 ? (v / 1000).toFixed(0) + 'k' : v >= 10000 ? (v / 1000).toFixed(1) + 'k' : fmt(v));

  /* ---------------- 敌人：PRTS 敌人图鉴 0 级数值（移动速度为演示放慢，单位：格/秒） ----------------
   * rank：0 普通 / 1 精英；top：血条高度（以体型 r 计）；range：远程攻击半径；burn：灼燃损伤（攻击力倍数） */
  const FOES = {
    slug: { name: '源石虫', hp: 550, atk: 130, def: 0, res: 0, iv: 1.0, spd: 0.62, r: 0.22, rank: 0, top: 1.45 },
    soldier: { name: '士兵', hp: 1650, atk: 200, def: 100, res: 0, iv: 1.1, spd: 0.62, r: 0.25, rank: 0, top: 2.45 },
    caster: { name: '术师', hp: 1600, atk: 200, def: 50, res: 50, iv: 4.0, spd: 0.48, r: 0.25, rank: 0, top: 2.55, range: 1.8, arts: true },
    casterL: { name: '术师组长', hp: 2400, atk: 300, def: 80, res: 50, iv: 4.0, spd: 0.46, r: 0.27, rank: 0, top: 2.6, range: 2.0, arts: true },
    heavy: { name: '重装防御者', hp: 6000, atk: 600, def: 800, res: 0, iv: 2.6, spd: 0.4, r: 0.3, rank: 1, top: 2.35 },
    heavyL: { name: '重装防御组长', hp: 10000, atk: 600, def: 1000, res: 0, iv: 2.6, spd: 0.38, r: 0.33, rank: 1, top: 2.6 },
    drone: { name: '妖怪', hp: 800, atk: 0, def: 50, res: 0, iv: 0.9, spd: 0.8, r: 0.24, rank: 0, top: 1.0, fly: true },
    chaser: { name: '深池逐火战士', hp: 5000, atk: 150, def: 50, res: 50, iv: 2.0, spd: 0.4, r: 0.26, rank: 0, top: 2.5, arts: true, burn: 1 },
  };
  const RANK = ['普通', '精英'];

  /* ---------------- 关卡预设：出怪顺序 [种类, 路线 0 上 / 1 下 / 2 空中]；surge 为「火山」「火山回响」前的大波 ---------------- */
  const L = (s) => s.split(' ').map((x) => { const [k, l] = x.split(':'); return [k, +l]; });
  const SCEN = {
    base: [
      { id: 'mix', name: '混编', desc: '源石虫、士兵、术师、重装与无人机轮番上阵', gap: [1.4, 2.1], air: true,
        seq: L('slug:0 soldier:1 caster:0 heavy:1 drone:2 soldier:0 slug:1 slug:0 heavy:0 casterL:1 soldier:1 drone:2'),
        surge: L('heavy:0 soldier:1 heavyL:0 caster:1 heavy:1 soldier:0 slug:1 heavy:0 casterL:1 soldier:0 drone:2'),
        surge2: L('heavy:1 heavyL:0 soldier:1 heavy:0 caster:1 heavyL:1') },
      { id: 'armor', name: '重甲', desc: '防御 800~1000 的重装：物理攻击只剩保底伤害，她的法术却照单全收', gap: [1.7, 2.4], compare: true,
        seq: L('heavy:0 soldier:1 heavyL:1 soldier:0 heavy:1 heavy:0 slug:1 heavyL:0'),
        surge: L('heavy:0 heavy:1 heavyL:0 heavy:1 heavyL:1 heavy:0 heavy:1 heavyL:0 heavy:0 heavy:1'),
        surge2: L('heavyL:0 heavy:1 heavy:0 heavyL:1 heavy:0 heavy:1') },
      { id: 'res', name: '法抗', desc: '法术抗性 50 的敌人：她的伤害只剩一半——点燃的法抗 −25% 与 X 模组的无视 10 点法抗正好派上用场', gap: [1.6, 2.2],
        seq: L('caster:0 caster:1 chaser:0 casterL:1 soldier:0 chaser:1 caster:0 casterL:0'),
        surge: L('chaser:0 casterL:1 caster:0 chaser:1 casterL:0 caster:1 chaser:0 caster:1 casterL:0 soldier:1'),
        surge2: L('casterL:1 chaser:0 caster:1 casterL:0 chaser:1 caster:0') },
      { id: 'air', name: '空袭', desc: '成群的无人机「妖怪」直线飞向目标：近战干员够不着，术师可以对空', gap: [1.2, 1.8], air: true,
        seq: L('drone:2 drone:2 slug:0 drone:2 soldier:1 drone:2 drone:2 slug:1'),
        surge: L('drone:2 soldier:0 drone:2 heavy:1 drone:2 slug:0 drone:2 soldier:1 drone:2 heavy:0'),
        surge2: L('drone:2 drone:2 soldier:0 drone:2 heavy:1 drone:2') },
    ],
    alter: [
      { id: 'burn', name: '灼燃', desc: '芦苇丛在燃烧：深池逐火战士站在火边时，每一击都附带等同攻击力的灼燃损伤', gap: [3.0, 3.6], reeds: true,
        seq: L('chaser:0 soldier:1 soldier:0 chaser:1 slug:0 soldier:1 soldier:0 caster:1 chaser:0 slug:1'),
        surge: L('chaser:0 soldier:1 soldier:0 chaser:1 soldier:1 slug:0') },
      { id: 'siege', name: '围攻', desc: '士兵、源石虫与远程术师：纯粹的生命值压力，看「氤氲」一层层叠上去', gap: [2.1, 2.8],
        seq: L('soldier:0 soldier:1 caster:0 slug:1 soldier:0 casterL:1 slug:0 soldier:1 caster:1 slug:0'),
        surge: L('soldier:0 soldier:1 casterL:0 soldier:1 caster:0 slug:1 soldier:0 caster:1') },
      { id: 'mix', name: '混编', desc: '灼燃与围攻一起来', gap: [2.5, 3.2], reeds: true,
        seq: L('chaser:0 soldier:1 caster:0 soldier:0 slug:1 chaser:1 casterL:0 soldier:1 slug:0'),
        surge: L('chaser:0 soldier:1 casterL:0 soldier:0 chaser:1 caster:1') },
    ],
  };
  // 燃烧的芦苇丛（纯烬「灼燃」关）：逐火战士离它 1.5 格以内时攻击附带灼燃损伤
  const REEDS = [[5, 0], [6, 0], [5, 4], [6, 4]];

  /** 攻击范围字符串（data.js range）→ 相对格子列表 */
  const cells = (str) => str.split(' ').map((p) => p.split(',').map(Number));
  // 「火山」范围 x-3：以她为中心、曼哈顿距离不超过 3 的菱形（PRTS / range_table）
  const DIAMOND3 = [];
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) if (Math.abs(dx) + Math.abs(dy) <= 3) DIAMOND3.push([dx, dy]);

  /* ---------------- 数值模型：模组（3 级）/ 潜能 ---------------- */
  function model(F, form, cfg) {
    const medic = form === 'alter';
    const trust = +((String(F.stats.trust).match(/攻击\s*\+(\d+)/) || [])[1] || 0);
    const potAtk = cfg.pot ? ((F.potFx || []).find((p) => p.atk) || {}).atk || 0 : 0;
    const mod = cfg.mod === 'x' || cfg.mod === 'y' ? (F.modules || []).find((m) => m.kind === cfg.mod.toUpperCase()) : null;
    const modAtk = mod ? mod.stages[2].atk : 0;
    const M = { medic, mod: mod ? mod.code : '', modName: mod ? mod.name : '', base: F.stats.atk[3] + trust + potAtk + modAtk, raw: F.stats.atk[3], trust, potAtk, modAtk, iv: medic ? 2.85 : 1.6 };
    if (!medic) {
      // 炎息：精英2 +14%；X 模组 3 级 +22%；潜能 6 再 +2%
      M.tal = (cfg.mod === 'x' ? 0.22 : 0.14) + (cfg.pot ? 0.02 : 0);
      // 乱火：部署后随机 7~15 技力（潜能 3：10~19）；Y 模组 2 级：范围内有精英 / 领袖时取最大值；3 级：再随机 +6~15 攻速
      M.spLo = cfg.pot ? 10 : 7; M.spHi = cfg.pot ? 19 : 15;
      M.eliteMax = cfg.mod === 'y';
      M.aspdLo = cfg.mod === 'y' ? 6 : 0; M.aspdHi = cfg.mod === 'y' ? 15 : 0;
      M.ignore = cfg.mod === 'x' ? 10 : 0; // X 模组特性：无视 10 点法术抗性
      M.spOnElite = cfg.mod === 'y' ? 1 : 0; // Y 模组特性：普通攻击命中精英 / 领袖 +1 技力
    } else {
      M.tal = 0;
      M.elemK = cfg.mod === 'x' ? 0.6 : 0.5; // 特性：回复攻击力 50% 的元素损伤（X 模组 60%）
      M.hotPct = cfg.mod === 'y' ? 0.13 : 0.1; M.hotDur = cfg.mod === 'y' ? 8 : 6; // 氤氲
      M.hpUp = (cfg.mod === 'x' ? 0.08 : 0.06) + (cfg.pot ? 0.02 : 0); // 火山灰疗愈：生命上限
      M.elemCut = cfg.mod === 'x' ? 0.14 : 0.12; // 火山灰疗愈：元素损伤减免
      M.aspdElem = cfg.mod === 'y' ? 8 : 0; // Y 模组特性：范围内有受元素损伤的友方时攻速 +8
    }
    return M;
  }
  /** 法术伤害：max(5%, 攻击力 × (1 − 法抗/100))；法抗先吃百分比削减，再减去无视的点数 */
  function artsVs(A, res, resMul = 1, ignore = 0) {
    const r = Math.max(0, res * resMul - ignore);
    return Math.max(A * 0.05, A * (1 - r / 100));
  }
  const physVs = (A, def) => Math.max(A * 0.05, A - def);
  const m3 = (s) => ({ id: s.id, name: s.name, icon: s.icon, trig: s.trig, init: s.init[9], cost: s.cost[9], dur: s.dur, v: Object.fromEntries(Object.entries(s.v).map(([k, a]) => [k, a[9]])) });

  /** 三个技能的理论账（给「技能数学」面板与技能说明用） */
  function math(F, form, cfg, tgt) {
    const M = model(F, form, cfg), sk = F.skills.map(m3);
    if (!M.medic) {
      const d = FOES[tgt] || FOES.heavy;
      const aspd = 100 + M.aspdHi; // Y 模组 3 级按「取最大值」算
      const A0 = M.base * (1 + M.tal), iv0 = M.iv / (aspd / 100);
      const hit = (A, rm = 1) => artsVs(A, d.res, rm, M.ignore);
      const normal = { per: hit(A0), iv: iv0, n: 1, dps: hit(A0) / iv0 };
      const rows = sk.map((s) => {
        if (s.id === 'chant') {
          const A = M.base * (1 + M.tal + s.v.a / 100), iv = M.iv / ((aspd + s.v.a) / 100), dps = hit(A) / iv;
          return { id: s.id, name: s.name, atk: A, per: hit(A), phys: physVs(A, d.def), iv, n: 1, dps, total: dps, dur: s.dur, cost: s.cost, cycle: (dps * s.dur + normal.dps * s.cost) / (s.dur + s.cost), note: `第二次施放起 · 攻速 +${s.v.a} · 攻击力 +${s.v.a}%` };
        }
        if (s.id === 'ignite') {
          // 每 cost 秒回满一层，攻击间隔更短所以回一层就放一层；法抗 −25% 持续 6 秒，比回一层的时间长——目标始终处于削弱中
          const rm = 1 - s.v.r / 100, per5 = (s.cost / iv0 - 1) * hit(A0, rm) + hit(A0 * s.v.d / 100, rm);
          const dps = per5 / s.cost, splash = hit(A0 * s.v.d / 200, rm) / s.cost;
          return { id: s.id, name: s.name, atk: A0, per: hit(A0 * s.v.d / 100, rm), phys: physVs(A0 * s.v.d / 100, d.def), iv: iv0, n: 1, dps, total: dps + splash * 2, dur: null, cost: s.cost, cycle: dps, splash, note: `每 ${s.cost} 秒一发 ${s.v.d}% · 周围一半 · 法抗 −${s.v.r}%` };
        }
        const A = M.base * (1 + M.tal + s.v.a / 100), iv = (M.iv - 1.1) / (aspd / 100), dps = hit(A) / iv;
        return { id: s.id, name: s.name, atk: A, per: hit(A), phys: physVs(A, d.def), iv, n: s.v.n, dps, total: dps * s.v.n, dur: s.dur, cost: s.cost, cycle: (dps * s.dur + normal.dps * s.cost) / (s.dur + s.cost), note: `攻击力 +${s.v.a}% · 间隔 0.5s · 至多 ${s.v.n} 名` };
      });
      return { M, medic: false, tgt: d, normal: { ...normal, atk: A0, phys: physVs(A0, d.def) }, rows };
    }
    // 医疗：按「范围内 2 名友方都需要治疗」估算（演示地图的情况）
    const A0 = M.base, iv0 = M.iv, hot = M.hotPct * M.hotDur; // 每次普通治疗附带的氤氲总量（占本次治疗量的比例）
    const normal = { per: A0, el: A0 * M.elemK, iv: iv0, n: 1, hps: A0 * (1 + hot) / iv0, eps: A0 * M.elemK * (1 + hot) / iv0 };
    const rows = sk.map((s) => {
      if (s.id === 'rain') {
        const A = A0 * (1 + s.v.a / 100);
        return { id: s.id, name: s.name, atk: A, per: A, el: A * M.elemK, iv: iv0, n: 2, hps: 2 * A * (1 + hot) / iv0, eps: 2 * A * M.elemK * (1 + hot) / iv0 + 2 * A * s.v.e / 100, dur: '∞', cost: s.cost, note: `攻击力 +${s.v.a}% · 多治疗 1 名 · 范围内每秒回复 ${s.v.e}% 攻击力的元素损伤` };
      }
      if (s.id === 'shield') {
        return { id: s.id, name: s.name, atk: A0, per: A0, el: A0 * M.elemK, iv: iv0, n: '全体', hps: normal.hps + 2 * A0 / s.v.t, eps: normal.eps, absorb: A0 * s.v.s / 100, dur: s.v.t, cost: s.cost, note: `立即治疗全体 · 屏障 ${fmt(A0 * s.v.s / 100)} · ${s.v.t} 秒 · 消耗 ${s.cost}` };
      }
      const k = s.v.h / 100;
      return { id: s.id, name: s.name, atk: A0, per: A0 * k, el: A0 * k * M.elemK, iv: iv0, n: 5, hps: 5 * A0 * k * (1 + hot) / iv0, eps: 5 * A0 * k * M.elemK * (1 + hot) / iv0, dur: s.dur, cost: s.cost, note: `全场 · 每发 ${s.v.h}% × 5 · 第二天赋 ×${s.v.m}` };
    });
    return { M, medic: true, normal: { ...normal, atk: A0 }, rows };
  }

  /* ---------------- 共用精灵（与尺寸无关） ---------------- */
  function mk(w, h, draw) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); draw(c.getContext('2d'), c.width, c.height); return c; }
  const glowSpr = (rgb, hot) => mk(64, 64, (q, s) => {
    const r = s / 2, gr = q.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, hot ? 'rgba(255,255,255,1)' : `rgba(${rgb},1)`); gr.addColorStop(0.2, `rgba(${rgb},.9)`); gr.addColorStop(0.5, `rgba(${rgb},.3)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    q.fillStyle = gr; q.fillRect(0, 0, s, s);
  });
  const softSpr = (rgb, a = 0.9) => mk(64, 64, (q, s) => {
    const r = s / 2, gr = q.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.55, `rgba(${rgb},${a * 0.4})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    q.fillStyle = gr; q.fillRect(0, 0, s, s);
  });
  const ellSpr = (stops) => mk(128, 64, (q, w, h) => {
    q.scale(1, 0.5);
    const gr = q.createRadialGradient(w / 2, h, 0, w / 2, h, w / 2);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    q.fillStyle = gr; q.fillRect(0, 0, w, h * 2);
  });
  let SPR = null;
  function sprites() {
    if (SPR) return SPR;
    SPR = {
      ember: glowSpr('255,118,38', true), pink: glowSpr('255,127,216', true), gold: glowSpr('255,200,110', true), red: glowSpr('255,60,30', false),
      mint: glowSpr('110,230,160', true), sky: glowSpr('140,190,255', true), white: glowSpr('255,255,255', false), violet: glowSpr('200,140,255', true),
      smoke: softSpr('40,26,28', 0.6), ash: softSpr('70,62,66', 0.85), ashL: softSpr('150,156,172', 0.8), mist: softSpr('255,255,255', 0.7),
      pool: ellSpr([[0, 'rgba(255,244,200,1)'], [0.22, 'rgba(255,160,60,.95)'], [0.55, 'rgba(210,50,20,.6)'], [1, 'rgba(90,0,0,0)']]),
      scorch: ellSpr([[0, 'rgba(20,6,6,.75)'], [0.6, 'rgba(30,10,8,.4)'], [1, 'rgba(0,0,0,0)']]),
      shadow: ellSpr([[0, 'rgba(0,0,0,.5)'], [0.6, 'rgba(0,0,0,.22)'], [1, 'rgba(0,0,0,0)']]),
      shadowL: ellSpr([[0, 'rgba(40,50,90,.34)'], [0.6, 'rgba(40,50,90,.14)'], [1, 'rgba(40,50,90,0)']]),
      puddle: ellSpr([[0, 'rgba(200,230,255,.8)'], [0.6, 'rgba(140,190,240,.3)'], [1, 'rgba(140,190,240,0)']]),
      healPool: ellSpr([[0, 'rgba(160,255,200,.7)'], [0.6, 'rgba(90,220,150,.25)'], [1, 'rgba(90,220,150,0)']]),
    };
    return SPR;
  }

  /* ---------------- 单位的画法（矢量画一次，按帧预渲染成图） ----------------
   * 坐标：脚底在 (0,0)，向上为负；r 为体型半径（像素）。敌人面朝左，友军面朝右 */
  const OL = 'rgba(14,8,12,.9)';
  function pen(q, r) { q.lineJoin = 'round'; q.lineCap = 'round'; q.strokeStyle = OL; q.lineWidth = Math.max(1.1, r * 0.085); }
  const RR = (q, x, y, w, h, k) => { q.beginPath(); q.roundRect(x, y, w, h, k); };
  const EL = (q, x, y, a, b, rot = 0) => { q.beginPath(); q.ellipse(x, y, Math.max(0.1, a), Math.max(0.1, b), rot, 0, TAU); };
  const CI = (q, x, y, a) => { q.beginPath(); q.arc(x, y, Math.max(0.1, a), 0, TAU); };
  const PO = (q, pts) => { q.beginPath(); pts.forEach(([x, y], i) => (i ? q.lineTo(x, y) : q.moveTo(x, y))); q.closePath(); };
  const FS = (q, fill) => { q.fillStyle = fill; q.fill(); q.stroke(); };
  const LG = (q, y0, y1, c0, c1) => { const gr = q.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; };
  const LN = (q, x0, y0, x1, y1, w, col) => { q.strokeStyle = col; q.lineWidth = w; q.beginPath(); q.moveTo(x0, y0); q.lineTo(x1, y1); q.stroke(); };

  function crystal(q, r, x, y, w, h, rot) {
    q.save(); q.translate(x, y); q.rotate(rot);
    PO(q, [[0, -h], [w / 2, -h * 0.62], [w / 2, 0], [-w / 2, 0], [-w / 2, -h * 0.62]]);
    q.fillStyle = '#2b1d33'; q.fill(); q.strokeStyle = '#ff8a3d'; q.lineWidth = Math.max(1, r * 0.06); q.stroke();
    q.fillStyle = 'rgba(255,170,100,.6)'; PO(q, [[0, -h * 0.9], [w * 0.2, -h * 0.6], [0, -h * 0.22]]); q.fill();
    q.restore(); pen(q, r);
  }
  /** 双腿（走路两帧） */
  function legs(q, r, f, col, w = 0.26, h = 0.62, gap = 0.2) {
    const s = f ? 1 : -1;
    q.fillStyle = col;
    RR(q, -gap * r - w * r + s * 0.1 * r, -h * r, w * r, h * r, 0.08 * r); q.fill(); q.stroke();
    RR(q, gap * r * 0.3 - s * 0.1 * r, -h * r, w * r, h * r, 0.08 * r); q.fill(); q.stroke();
  }
  const PAINT = {
    slug(q, r, f) {
      pen(q, r);
      const sq = f ? 1.07 : 0.94;
      q.fillStyle = '#2a1d28';
      for (const x of [-0.62, -0.12, 0.38]) { EL(q, x * r + (f ? 0.05 : -0.05) * r, -0.07 * r, 0.14 * r, 0.08 * r); q.fill(); }
      EL(q, 0, -0.46 * r, 1.08 * r * sq, 0.48 * r / sq); FS(q, LG(q, -0.95 * r, -0.05 * r, '#a07a95', '#573a50'));
      q.strokeStyle = 'rgba(20,8,16,.38)'; q.lineWidth = Math.max(1, r * 0.06);
      for (let i = 0; i < 3; i++) { const x = (-0.3 + i * 0.34) * r; q.beginPath(); q.moveTo(x, -0.9 * r / sq); q.quadraticCurveTo(x + 0.14 * r, -0.46 * r, x, -0.04 * r); q.stroke(); }
      pen(q, r);
      q.fillStyle = 'rgba(255,255,255,.18)'; EL(q, -0.2 * r, -0.68 * r, 0.6 * r, 0.13 * r); q.fill();
      crystal(q, r, 0.05 * r, -0.8 * r, 0.3 * r, 0.62 * r, -0.25);
      crystal(q, r, 0.52 * r, -0.66 * r, 0.22 * r, 0.46 * r, 0.35);
      q.fillStyle = 'rgba(255,190,110,.35)'; CI(q, -0.86 * r, -0.5 * r, 0.2 * r); q.fill();
      q.fillStyle = '#ffc060'; CI(q, -0.86 * r, -0.5 * r, 0.1 * r); q.fill();
    },
    soldier(q, r, f) {
      pen(q, r);
      legs(q, r, f, '#221d29');
      q.fillStyle = '#4a4258'; RR(q, 0.12 * r, -1.3 * r, 0.3 * r, 0.6 * r, 0.12 * r); q.fill(); q.stroke(); // 后臂
      RR(q, -0.58 * r, -1.42 * r, 1.16 * r, 0.95 * r, 0.26 * r); FS(q, LG(q, -1.42 * r, -0.47 * r, '#625672', '#3b3446'));
      q.fillStyle = '#2b2533'; q.fillRect(-0.56 * r, -0.64 * r, 1.12 * r, 0.12 * r);
      q.fillStyle = '#d63a45'; RR(q, -0.54 * r, -1.5 * r, 1.08 * r, 0.2 * r, 0.08 * r); q.fill(); q.stroke();
      PO(q, [[0.28 * r, -1.42 * r], [0.66 * r, -1.02 * r], [0.44 * r, -0.98 * r]]); FS(q, '#b82e38');
      CI(q, 0.04 * r, -1.84 * r, 0.5 * r); FS(q, LG(q, -2.34 * r, -1.34 * r, '#4c445a', '#302a3a'));
      EL(q, -0.17 * r, -1.8 * r, 0.3 * r, 0.36 * r); FS(q, '#f1ece6');
      q.fillStyle = '#1a1420'; q.fillRect(-0.38 * r, -1.9 * r, 0.14 * r, 0.06 * r); q.fillRect(-0.15 * r, -1.9 * r, 0.14 * r, 0.06 * r);
      q.fillStyle = '#d63a45'; q.fillRect(-0.25 * r, -1.66 * r, 0.16 * r, 0.05 * r);
      // 前臂 + 短刀
      LN(q, -0.72 * r, -0.74 * r, -1.36 * r, -1.08 * r, r * 0.2, OL);
      LN(q, -0.72 * r, -0.74 * r, -1.36 * r, -1.08 * r, r * 0.1, '#e6ecf4');
      pen(q, r);
      q.fillStyle = '#4a4258'; RR(q, -0.84 * r, -1.22 * r, 0.3 * r, 0.54 * r, 0.12 * r); q.fill(); q.stroke();
    },
    caster(q, r, f, pal) {
      const P = pal || { robe: ['#6a3f8e', '#3d2257'], trim: '#2a1640', hood: '#442560', orb: '#f0d0ff', ring: '#c070ff' };
      pen(q, r);
      const sw = f ? 0.05 * r : -0.05 * r;
      LN(q, -0.72 * r, 0.02 * r, -0.95 * r + sw, -2.02 * r, r * 0.2, OL);
      LN(q, -0.72 * r, 0.02 * r, -0.95 * r + sw, -2.02 * r, r * 0.11, '#9a7650');
      pen(q, r);
      PO(q, [[-0.66 * r + sw, 0], [0.66 * r - sw, 0], [0.36 * r, -1.36 * r], [-0.36 * r, -1.36 * r]]); FS(q, LG(q, -1.36 * r, 0, P.robe[0], P.robe[1]));
      q.fillStyle = P.trim; q.fillRect(-0.64 * r + sw, -0.16 * r, 1.28 * r - sw * 2, 0.14 * r);
      q.fillStyle = P.trim; PO(q, [[-0.08 * r, -1.3 * r], [0.08 * r, -1.3 * r], [0.05 * r, -0.2 * r], [-0.05 * r, -0.2 * r]]); q.fill();
      CI(q, 0, -1.66 * r, 0.47 * r); FS(q, P.hood);
      q.fillStyle = '#140a1c'; EL(q, -0.16 * r, -1.62 * r, 0.25 * r, 0.28 * r); q.fill();
      q.fillStyle = P.orb; CI(q, -0.27 * r, -1.64 * r, 0.055 * r); q.fill(); CI(q, -0.1 * r, -1.64 * r, 0.055 * r); q.fill();
      q.fillStyle = 'rgba(255,255,255,.2)'; CI(q, -0.96 * r + sw, -2.12 * r, 0.34 * r); q.fill();
      q.fillStyle = P.orb; CI(q, -0.96 * r + sw, -2.12 * r, 0.17 * r); q.fill();
      q.strokeStyle = P.ring; q.lineWidth = Math.max(1, r * 0.06); CI(q, -0.96 * r + sw, -2.12 * r, 0.26 * r); q.stroke();
      pen(q, r);
      q.fillStyle = P.robe[1]; RR(q, -0.84 * r, -1.1 * r, 0.3 * r, 0.44 * r, 0.12 * r); q.fill(); q.stroke();
    },
    casterL(q, r, f) { PAINT.caster(q, r, f, { robe: ['#9a2f4e', '#57182c'], trim: '#e8b64a', hood: '#6d1d34', orb: '#ffe29a', ring: '#ffb040' }); },
    heavy(q, r, f, pal) {
      const P = pal || { body: ['#5c6778', '#3a4250'], helm: '#353c48', visor: '#9fd6ff', shield: ['#b5c1d3', '#7d889a'], leg: '#1f2229' };
      pen(q, r);
      legs(q, r, f, P.leg, 0.36, 0.62, 0.28);
      RR(q, -0.72 * r, -1.62 * r, 1.44 * r, 1.12 * r, 0.26 * r); FS(q, LG(q, -1.62 * r, -0.5 * r, P.body[0], P.body[1]));
      q.fillStyle = 'rgba(255,255,255,.13)'; q.fillRect(-0.56 * r, -1.52 * r, 1.12 * r, 0.14 * r);
      q.fillStyle = 'rgba(0,0,0,.25)'; q.fillRect(-0.7 * r, -0.72 * r, 1.4 * r, 0.12 * r);
      RR(q, -0.46 * r, -2.18 * r, 0.92 * r, 0.66 * r, 0.24 * r); FS(q, P.helm);
      q.fillStyle = P.visor; q.fillRect(-0.42 * r, -1.94 * r, 0.52 * r, 0.1 * r);
      if (pal) { // 组长：角盔
        PO(q, [[-0.1 * r, -2.16 * r], [0.12 * r, -2.52 * r], [0.3 * r, -2.12 * r]]); FS(q, '#c0392b');
        PO(q, [[0.18 * r, -2.12 * r], [0.46 * r, -2.4 * r], [0.44 * r, -2.0 * r]]); FS(q, '#c0392b');
      }
      // 塔盾（在前）
      RR(q, -1.26 * r, -1.86 * r, 0.58 * r, 1.72 * r, 0.16 * r); FS(q, LG(q, -1.86 * r, -0.14 * r, P.shield[0], P.shield[1]));
      q.strokeStyle = 'rgba(0,0,0,.35)'; q.lineWidth = Math.max(1, r * 0.05);
      q.beginPath(); q.moveTo(-0.97 * r, -1.7 * r); q.lineTo(-0.97 * r, -0.3 * r); q.stroke();
      q.fillStyle = 'rgba(255,255,255,.55)'; for (const y of [-1.6, -0.45]) { CI(q, -1.13 * r, y * r, 0.045 * r); q.fill(); CI(q, -0.81 * r, y * r, 0.045 * r); q.fill(); }
      if (pal) { q.fillStyle = '#a02020'; PO(q, [[-0.97 * r, -1.25 * r], [-0.82 * r, -1.02 * r], [-0.97 * r, -0.8 * r], [-1.12 * r, -1.02 * r]]); q.fill(); }
      pen(q, r);
    },
    heavyL(q, r, f) { PAINT.heavy(q, r, f, { body: ['#6f453a', '#452a24'], helm: '#3d2622', visor: '#ff8a3a', shield: ['#dcb257', '#9c7328'], leg: '#221815' }); },
    drone(q, r, f) {
      pen(q, r);
      const a = (f / 3) * Math.PI;
      q.strokeStyle = OL; q.lineWidth = r * 0.14;
      for (const [x, y] of [[-0.95, -0.28], [0.95, -0.28], [-0.62, -0.62], [0.62, -0.62]]) { q.beginPath(); q.moveTo(0, -0.2 * r); q.lineTo(x * r, y * r); q.stroke(); }
      for (const [x, y] of [[-0.95, -0.28], [0.95, -0.28], [-0.62, -0.62], [0.62, -0.62]]) {
        q.fillStyle = 'rgba(230,236,245,.28)'; EL(q, x * r, y * r - 0.08 * r, 0.44 * r, 0.12 * r); q.fill();
        q.strokeStyle = 'rgba(30,26,30,.8)'; q.lineWidth = Math.max(1, r * 0.06);
        q.beginPath(); q.moveTo(x * r - Math.cos(a) * 0.42 * r, y * r - 0.08 * r - Math.sin(a) * 0.1 * r); q.lineTo(x * r + Math.cos(a) * 0.42 * r, y * r - 0.08 * r + Math.sin(a) * 0.1 * r); q.stroke();
      }
      pen(q, r);
      RR(q, -0.62 * r, -0.44 * r, 1.24 * r, 0.58 * r, 0.26 * r); FS(q, LG(q, -0.44 * r, 0.14 * r, '#f2c64a', '#b8871e'));
      q.fillStyle = '#2a2420'; for (const x of [-0.18, 0.12, 0.42]) { PO(q, [[x * r, -0.43 * r], [(x + 0.12) * r, -0.43 * r], [(x - 0.04) * r, 0.13 * r], [(x - 0.16) * r, 0.13 * r]]); q.fill(); }
      q.fillStyle = 'rgba(255,60,60,.35)'; CI(q, -0.44 * r, -0.14 * r, 0.22 * r); q.fill();
      q.fillStyle = '#ff3b3b'; CI(q, -0.44 * r, -0.14 * r, 0.11 * r); q.fill(); q.fillStyle = '#fff'; CI(q, -0.47 * r, -0.17 * r, 0.035 * r); q.fill();
      LN(q, 0.3 * r, -0.44 * r, 0.42 * r, -0.72 * r, Math.max(1, r * 0.05), OL);
      q.fillStyle = '#ff5a5a'; CI(q, 0.42 * r, -0.74 * r, 0.05 * r); q.fill();
    },
    chaser(q, r, f) {
      pen(q, r);
      legs(q, r, f, '#2b221c');
      q.fillStyle = '#23372f'; RR(q, 0.14 * r, -1.28 * r, 0.3 * r, 0.6 * r, 0.12 * r); q.fill(); q.stroke();
      PO(q, [[-0.6 * r, -1.42 * r], [0.6 * r, -1.42 * r], [0.7 * r, -0.28 * r], [-0.66 * r, -0.28 * r]]); FS(q, LG(q, -1.42 * r, -0.28 * r, '#3f6358', '#243b34'));
      q.fillStyle = '#a3402c'; q.fillRect(-0.62 * r, -0.94 * r, 1.26 * r, 0.14 * r);
      q.fillStyle = 'rgba(255,255,255,.12)'; q.fillRect(-0.05 * r, -1.4 * r, 0.1 * r, 1.08 * r);
      CI(q, 0.02 * r, -1.84 * r, 0.47 * r); FS(q, '#2c4239');
      EL(q, -0.16 * r, -1.72 * r, 0.3 * r, 0.2 * r); FS(q, '#cdbb9f');
      q.fillStyle = '#ffcf7a'; CI(q, -0.3 * r, -1.94 * r, 0.06 * r); q.fill(); CI(q, -0.1 * r, -1.94 * r, 0.06 * r); q.fill();
      q.fillStyle = '#1b2a24'; PO(q, [[-0.46 * r, -2.1 * r], [0.52 * r, -2.12 * r], [0.2 * r, -2.4 * r], [-0.28 * r, -2.36 * r]]); q.fill(); q.stroke();
      // 火把
      LN(q, -0.7 * r, -0.78 * r, -0.96 * r, -1.62 * r, r * 0.18, OL);
      LN(q, -0.7 * r, -0.78 * r, -0.96 * r, -1.62 * r, r * 0.09, '#7a5230');
      const fl = f ? 1.08 : 0.92;
      q.fillStyle = 'rgba(255,150,60,.35)'; CI(q, -0.98 * r, -1.86 * r, 0.34 * r); q.fill();
      q.fillStyle = '#ff8a2c'; q.beginPath(); q.moveTo(-0.98 * r, -2.2 * r * fl); q.quadraticCurveTo(-0.74 * r, -1.78 * r, -0.98 * r, -1.62 * r); q.quadraticCurveTo(-1.22 * r, -1.78 * r, -0.98 * r, -2.2 * r * fl); q.fill();
      q.fillStyle = '#ffe28a'; q.beginPath(); q.moveTo(-0.98 * r, -1.98 * r * fl); q.quadraticCurveTo(-0.86 * r, -1.76 * r, -0.98 * r, -1.66 * r); q.quadraticCurveTo(-1.1 * r, -1.76 * r, -0.98 * r, -1.98 * r * fl); q.fill();
      pen(q, r);
      q.fillStyle = '#2f4a42'; RR(q, -0.86 * r, -1.2 * r, 0.3 * r, 0.5 * r, 0.12 * r); q.fill(); q.stroke();
    },
    /* ---- 友军（面朝右）---- */
    guard(q, r, f) {
      pen(q, r);
      // 披风（身后，出手时扬起）
      PO(q, [[-0.46 * r, -1.36 * r], [0.2 * r, -1.36 * r], [-0.2 * r, -0.36 * r], [-(f ? 1.0 : 0.78) * r, -(f ? 0.62 : 0.3) * r]]); FS(q, LG(q, -1.36 * r, -0.3 * r, '#2b4f86', '#16294a'));
      legs(q, r, 0, '#1d2230');
      q.fillStyle = '#e9eef7'; for (const x of [-0.46, 0.0]) q.fillRect(x * r + 0.02 * r, -0.2 * r, 0.26 * r, 0.1 * r);
      // 剑：待机时斜举在身后，出手帧横扫向前
      if (!f) {
        LN(q, 0.4 * r, -0.96 * r, 1.04 * r, -2.28 * r, r * 0.22, OL); LN(q, 0.4 * r, -0.96 * r, 1.04 * r, -2.28 * r, r * 0.11, '#eef3fb');
        LN(q, 0.52 * r, -1.2 * r, 1.0 * r, -2.2 * r, r * 0.04, '#7fc0ff');
        LN(q, 0.26 * r, -0.96 * r, 0.56 * r, -0.88 * r, r * 0.12, '#d9a93c');
      }
      pen(q, r);
      RR(q, -0.56 * r, -1.44 * r, 1.12 * r, 0.97 * r, 0.24 * r); FS(q, LG(q, -1.44 * r, -0.47 * r, '#3a4870', '#1e2538'));
      q.fillStyle = '#f2f5fb'; PO(q, [[-0.1 * r, -1.44 * r], [0.2 * r, -1.44 * r], [0.06 * r, -1.02 * r]]); q.fill();
      q.fillStyle = '#4f9fe0'; q.fillRect(-0.56 * r, -1.2 * r, 0.22 * r, 0.12 * r);
      q.fillStyle = '#131a2a'; q.fillRect(-0.54 * r, -0.66 * r, 1.08 * r, 0.1 * r);
      // 头：银白短发 + 呆毛
      CI(q, 0.02 * r, -1.86 * r, 0.46 * r); FS(q, '#f4dccb');
      q.fillStyle = '#e8ecf4'; q.beginPath(); q.arc(0.02 * r, -1.92 * r, 0.5 * r, Math.PI * 0.95, Math.PI * 2.02); q.lineTo(0.3 * r, -1.78 * r); q.lineTo(0.1 * r, -1.9 * r); q.closePath(); q.fill(); q.stroke();
      LN(q, -0.02 * r, -2.38 * r, 0.14 * r, -2.56 * r, r * 0.07, '#e8ecf4');
      q.fillStyle = '#2a4f9a'; CI(q, 0.24 * r, -1.8 * r, 0.06 * r); q.fill();
      if (f) {
        q.strokeStyle = 'rgba(200,225,255,.55)'; q.lineWidth = r * 0.3; q.beginPath(); q.arc(0.2 * r, -1.0 * r, 1.3 * r, -1.25, 0.4); q.stroke();
        q.strokeStyle = 'rgba(255,255,255,.8)'; q.lineWidth = r * 0.08; q.beginPath(); q.arc(0.2 * r, -1.0 * r, 1.42 * r, -1.1, 0.3); q.stroke();
        LN(q, 0.36 * r, -1.0 * r, 1.7 * r, -0.74 * r, r * 0.22, OL); LN(q, 0.36 * r, -1.0 * r, 1.7 * r, -0.74 * r, r * 0.11, '#ffffff');
      }
      pen(q, r);
      q.fillStyle = '#3a4870'; RR(q, 0.24 * r, -1.24 * r, 0.3 * r, 0.48 * r, 0.12 * r); q.fill(); q.stroke();
    },
    defender(q, r, f) {
      pen(q, r);
      legs(q, r, 0, '#1b2130', 0.34, 0.6, 0.26);
      RR(q, -0.72 * r, -1.6 * r, 1.44 * r, 1.12 * r, 0.26 * r); FS(q, LG(q, -1.6 * r, -0.48 * r, '#50668f', '#28344e'));
      q.fillStyle = 'rgba(255,255,255,.18)'; q.fillRect(-0.56 * r, -1.5 * r, 1.12 * r, 0.12 * r);
      q.fillStyle = '#e8edf6'; RR(q, -0.72 * r, -1.62 * r, 0.42 * r, 0.3 * r, 0.1 * r); q.fill(); q.stroke();
      // 头盔：白色，面罩一道青光
      RR(q, -0.44 * r, -2.2 * r, 0.9 * r, 0.68 * r, 0.28 * r); FS(q, LG(q, -2.2 * r, -1.52 * r, '#ffffff', '#c9d3e4'));
      q.fillStyle = '#1d2740'; q.fillRect(-0.04 * r, -1.96 * r, 0.5 * r, 0.14 * r);
      q.fillStyle = '#7fe6ff'; q.fillRect(0.02 * r, -1.93 * r, 0.4 * r, 0.06 * r);
      PO(q, [[-0.1 * r, -2.2 * r], [0.06 * r, -2.44 * r], [0.2 * r, -2.2 * r]]); FS(q, '#4f9fe0');
      // 大盾（在前）：白底蓝纹，出手帧向前一推
      const bx = f ? 0.2 * r : 0;
      RR(q, 0.38 * r + bx, -1.98 * r, 0.7 * r, 1.88 * r, 0.2 * r); FS(q, LG(q, -1.98 * r, -0.1 * r, '#f6f8fc', '#aab6ca'));
      q.fillStyle = '#4f9fe0'; PO(q, [[0.73 * r + bx, -1.62 * r], [0.95 * r + bx, -1.08 * r], [0.73 * r + bx, -0.54 * r], [0.51 * r + bx, -1.08 * r]]); q.fill();
      q.fillStyle = '#e8f4ff'; PO(q, [[0.73 * r + bx, -1.36 * r], [0.84 * r + bx, -1.08 * r], [0.73 * r + bx, -0.8 * r], [0.62 * r + bx, -1.08 * r]]); q.fill();
      q.fillStyle = 'rgba(40,60,100,.5)'; for (const y of [-1.86, -0.24]) { CI(q, 0.5 * r + bx, y * r, 0.04 * r); q.fill(); CI(q, 0.96 * r + bx, y * r, 0.04 * r); q.fill(); }
      if (f) { q.strokeStyle = 'rgba(160,210,255,.6)'; q.lineWidth = r * 0.12; q.beginPath(); q.moveTo(1.2 * r + bx, -1.8 * r); q.lineTo(1.2 * r + bx, -0.3 * r); q.stroke(); }
      pen(q, r);
    },
  };
  /** 小黑羊（本体）/ 白羊（纯烬）：蹲在她身后的高台上 */
  function paintSheep(q, r, dark) {
    pen(q, r);
    const wool = dark ? '#2e2429' : '#f6f3ef', wool2 = dark ? '#1c1519' : '#dcd6d0';
    q.fillStyle = wool2; for (const x of [-0.5, 0.35]) { RR(q, x * r, -0.42 * r, 0.18 * r, 0.42 * r, 0.06 * r); q.fill(); q.stroke(); }
    q.fillStyle = wool;
    q.beginPath();
    for (const [x, y, a] of [[-0.55, -0.7, 0.42], [-0.1, -0.92, 0.48], [0.42, -0.74, 0.42], [0.1, -0.52, 0.5], [-0.4, -0.46, 0.38], [0.5, -0.45, 0.34]]) { q.moveTo(x * r + a * r, y * r); q.arc(x * r, y * r, a * r, 0, TAU); }
    q.fill(); q.stroke(); q.fill();
    EL(q, -0.82 * r, -0.86 * r, 0.3 * r, 0.26 * r, -0.2); FS(q, dark ? '#171114' : '#3a3033');
    q.fillStyle = '#c9ae86'; q.beginPath(); q.arc(-0.66 * r, -1.08 * r, 0.16 * r, Math.PI * 0.9, Math.PI * 2.3); q.lineWidth = r * 0.1; q.strokeStyle = '#c9ae86'; q.stroke();
    q.fillStyle = dark ? '#ffb347' : '#fff'; CI(q, -0.9 * r, -0.9 * r, 0.05 * r); q.fill();
  }
  /** 精英徽记（小菱形 + 金边） */
  const eliteBadge = (s) => mk(s, s, (q, w) => {
    q.translate(w / 2, w / 2); const a = w * 0.42;
    PO(q, [[0, -a], [a, 0], [0, a], [-a, 0]]); q.fillStyle = '#7a1420'; q.fill(); q.strokeStyle = '#ffcf6a'; q.lineWidth = Math.max(1.2, w * 0.1); q.stroke();
    q.fillStyle = '#ffcf6a'; PO(q, [[0, -a * 0.45], [a * 0.45, 0], [0, a * 0.45], [-a * 0.45, 0]]); q.fill();
  });

  /* ================================================================ */
  function create(host, opts) {
    const f = opts.form; // 'base' | 'alter'
    const F = opts.data; // D.forms[form]
    const medic = f === 'alter';
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const FXS = () => (!reduce && window.FX && FX.sim) || null;
    const SP = sprites();
    let cfg = Object.assign({ mod: 'none', pot: 0, scen: SCEN[f][0].id, tips: true }, opts.config || {});
    let M = model(F, f, cfg);
    let scen = SCEN[f].find((s) => s.id === cfg.scen) || SCEN[f][0];

    /* ---------------- DOM ---------------- */
    const el = (tag, cls, parent = host) => { const e = document.createElement(tag); if (cls) e.className = cls; parent.appendChild(e); return e; };
    const cam = el('div', 'sim-cam'); // 画布 + 小人一起抖（镜头震动只动这一层的 transform）
    const cv = el('canvas', 'sim-canvas', cam);
    const g = cv.getContext('2d');
    const stage = el('div', 'sim-op', cam);
    const hud = el('div', 'sim-hud');
    const hit = el('div', 'sim-hit');
    const cut = el('div', 'sim-cutin');
    const logEl = el('div', 'sim-log'); logEl.setAttribute('aria-live', 'polite');
    const tipEl = el('div', 'sim-tip'); tipEl.setAttribute('role', 'note');
    const card = el('div', 'sim-card');
    const result = el('div', 'sim-result');
    const tag = el('div', 'sim-tag'); tag.innerHTML = `<i></i>SIMULATION · 模拟作战 · ${medic ? 'LN10' : 'LN02'}`;
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', medic ? '战术地图演示：纯烬艾雅法拉在高台上治疗两条路上的近卫与重装' : '战术地图演示：艾雅法拉在两条路之间的高台上用法术攻击来袭的敌人');
    let chibi = null;

    const OP = medic ? [2, 2] : [3, 2]; // 干员所在格
    const ALLY = [[4, 1, 'guard', 0], [4, 3, 'defender', 1]]; // 医疗演示：近卫守上路，重装守下路
    const SHEEP = medic ? [1.32, 2.52] : [2.3, 2.52];

    const sk = F.skills.map(m3);
    const skImg = sk.map((s) => { const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = s.icon; return im; });
    const VOX = (F.voices || []).filter((v) => /作战中/.test(v[1]));
    const DEPLOY_VOX = (F.voices || []).filter((v) => /^部署/.test(v[1]));

    let W = 1, H = 1, T = 1, TH = 1, dpr = 1, oy = 0, ox = 0, E = 1; // T：格宽；TH：格子在画面上的高度（镜头略微俯视，纵向压扁）；E：高台抬高的像素
    let t = 0, speed = 1, auto = true, skillIdx = medic ? 0 : 2;
    let sp = 0, active = null, casts = 0, charges = 0, fullFor = 0, atkCd = 0.6, aspdTal = 0, spTal = 0;
    let foes = [], allies = [], shots = [], nums = [], rings = [], parts = [], decals = [], drops = [], barrier = null;
    let waveI = 0, spawnCd = 1, pending = [], pendCd = 0, surge = 0, heat = 0, pale = 0, crackT = 0, deployT = 0, gloomOn = false;
    let warnT = 0, hitLeft = 0, combo = 0, comboT = 0, shake = 0, shakeT = 0, lastBoom = 0, uid = 0, opFade = 1, sheepT = 6, sheepHop = 0;
    let skillRun = null;
    const stat = { dmg: 0, kills: 0, leaks: 0, heal: 0, elem: 0, absorb: 0, downs: 0, bursts: 0, best: 0, spawned: 0, log: [] };
    // 曲线：每 0.5 秒一格，保留 60 秒
    const NB = 120, BK = 0.5;
    let bucks = [], bNow = null, marks = [];
    let running = false, raf = 0, last = 0, visible = false, destroyed = false;

    /* ---------------- 布局与预渲染 ---------------- */
    let mapCv = null, rangeCv = { n: null, s: null }, crackCv = null, foeSpr = {}, allySpr = {}, sheepSpr = null, badge = null, bubble = null, opTok = null, avatar = null;
    let pitSpr = null, flameSpr = [];
    let lastSize = '';
    function layout(force, staged) {
      const r = host.getBoundingClientRect();
      if (!r.width) return false;
      const key = Math.round(r.width) + 'x' + Math.round(r.height);
      if (!force && key === lastSize) return;
      lastSize = key;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = r.width; H = r.height;
      T = Math.min(W / COLS, H / (ROWS * SQ + TOPB + 0.12));
      TH = T * SQ;
      E = Math.round(T * 0.1);
      ox = (W - T * COLS) / 2;
      oy = TOPB * T + (H - T * (ROWS * SQ + TOPB + 0.12)) / 2 + E;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      // 小人：脚踩在高台那一格偏下的位置
      const sw = T * 2.3, sh = T * 2.5, fx = ox + (OP[0] + 0.5) * T, fy = oy + (OP[1] + 0.74) * TH - E;
      Object.assign(stage.style, { left: fx - sw / 2 + 'px', top: fy - sh * 0.88 + 'px', width: sw + 'px', height: sh + 'px' });
      if (staged) return true; // 首次初始化：预渲染由 init() 分几次空闲时间做
      buildMap();
      buildRanges();
      buildUnits();
      if (opts.graph) sizeGraph();
      return true;
    }
    const px = (x) => ox + x * T; // 格坐标 → 画布 CSS 像素
    const py = (y) => oy + y * TH;
    const hy = (i, j) => (isHigh(i, j) ? E : 0); // 高台格的抬高量
    // 格坐标 → 视口坐标（给全屏特效层用）；每帧最多读一次宿主位置
    let rc = null, rcF = -1, fid = 0;
    function vp(x, y) {
      if (rcF !== fid) { rc = host.getBoundingClientRect(); rcF = fid; }
      return [rc.left + px(x), rc.top + py(y)];
    }

    const C = medic
      ? { bg0: '#e4eaf3', bg1: '#f3f6fb', ground: '#cdd4e0', ground2: '#c7cfdc', lane: '#bfc7d5', laneMid: 'rgba(255,255,255,.35)', seam: 'rgba(60,72,110,.16)', grain: 'rgba(60,70,100,.07)',
          top: '#fbfcff', top2: '#e9eef7', side: '#aab5ca', edge: 'rgba(90,110,160,.5)', rim: 'rgba(255,255,255,.95)', text: '#2a2f45', shade: 'rgba(60,72,120,.22)',
          range: '110,200,150', rangeS: '130,175,255', lanes: 'rgba(80,100,150,.2)', dark: false }
      : { bg0: '#140709', bg1: '#1f0c12', ground: '#2b161b', ground2: '#271319', lane: '#1d0e12', laneMid: 'rgba(255,120,150,.05)', seam: 'rgba(0,0,0,.4)', grain: 'rgba(255,170,190,.05)',
          top: '#55303b', top2: '#3f222b', side: '#1c0d12', edge: 'rgba(255,150,180,.38)', rim: 'rgba(255,210,222,.28)', text: '#ffe6ee', shade: 'rgba(0,0,0,.45)',
          range: '255,120,90', rangeS: '255,90,40', lanes: 'rgba(255,120,150,.16)', dark: true };

    /** 伪随机（地形细节每次布局都一样） */
    let seed = 7;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    /** 地形：整张画一次，每帧整张贴上去 */
    function buildMap() {
      seed = 11;
      mapCv = mk(cv.width, cv.height, (q) => {
        q.setTransform(dpr, 0, 0, dpr, 0, 0);
        // 背景（画框内、地图外）：本体是暗色玄武岩，纯烬是落着白灰的原野
        const bg = q.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, C.bg1); bg.addColorStop(1, C.bg0);
        q.fillStyle = bg; q.fillRect(0, 0, W, H);
        for (let k = 0; k < 480; k++) { q.fillStyle = C.grain; q.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2); }
        // 场外：本体是熔岩池、纯烬是长着「棉花糖」预警花的草地
        for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) if (tile(i, j) === 'v') paintVoid(q, i, j);
        // 地面（路线）先画，高台后画（高台的投影落在路面上）
        for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) { const k = tile(i, j); if (k === 'g' || k === 'b' || k === 'r') paintGround(q, i, j); }
        // 路线中间被踩亮的一道
        for (const j of [1, 3]) {
          const gr = q.createLinearGradient(0, py(j), 0, py(j + 1));
          gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, C.laneMid); gr.addColorStop(1, 'rgba(0,0,0,0)');
          q.fillStyle = gr; q.fillRect(px(0), py(j), T * COLS, TH);
        }
        for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) if (isHigh(i, j)) paintHighShadow(q, i, j);
        for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) if (isHigh(i, j)) paintHigh(q, i, j);
        paintMarkers(q);
        if (scen.air) paintAirRoute(q);
        if (scen.reeds) REEDS.forEach(([i, j]) => paintReeds(q, i, j));
        // 四周压一圈暗角，视线收向中间
        const vg = q.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.72);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, C.dark ? 'rgba(0,0,0,.38)' : 'rgba(80,96,140,.14)');
        q.fillStyle = vg; q.fillRect(0, 0, W, H);
      });
      // 熔岩池的光（本体）、芦苇丛的火苗（纯烬）：小精灵，每帧只按位置贴几张
      if (!medic) pitSpr = mk(T * dpr * 1.2, T * dpr * 1.2, (q, s) => {
        const gr = q.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        gr.addColorStop(0, 'rgba(255,220,150,.9)'); gr.addColorStop(0.3, 'rgba(255,120,40,.5)'); gr.addColorStop(0.65, 'rgba(200,40,10,.16)'); gr.addColorStop(1, 'rgba(120,0,0,0)');
        q.fillStyle = gr; q.fillRect(0, 0, s, s);
      });
      if (scen.reeds) flameSpr = [0, 1, 2].map((k) => mk(T * 0.36 * dpr, T * 0.6 * dpr, (q, w, h) => {
        const x = w / 2, sw = (k - 1) * w * 0.08;
        q.fillStyle = 'rgba(255,120,40,.85)'; q.beginPath(); q.moveTo(x + sw, h * 0.04); q.quadraticCurveTo(x + w * 0.5, h * 0.62, x, h * 0.98); q.quadraticCurveTo(x - w * 0.5, h * 0.62, x + sw, h * 0.04); q.fill();
        q.fillStyle = 'rgba(255,220,120,.95)'; q.beginPath(); q.moveTo(x + sw * 0.6, h * 0.36); q.quadraticCurveTo(x + w * 0.26, h * 0.74, x, h * 0.96); q.quadraticCurveTo(x - w * 0.26, h * 0.74, x + sw * 0.6, h * 0.36); q.fill();
      }));
      // 裂缝层不急着用：空闲时再画（第一次放火山时还没画好就当场补上）
      crackCv = null;
      if (inited && !medic) idle(() => { if (!destroyed && !crackCv) buildCrack(); });
    }
    /** 火山期间范围内的地面裂开、透出熔岩（只有术师用；按菱形范围）：主裂缝 + 分叉，三层线宽叠出发光 */
    function buildCrack() {
      if (medic || T <= 1) return;
      crackCv = mk(cv.width, cv.height, (q) => {
        q.setTransform(dpr, 0, 0, dpr, 0, 0);
        seed = 23;
        q.lineCap = 'round'; q.lineJoin = 'round';
        const paths = [];
        const walk = (x, y, ang, n, x0, y0, depth) => {
          const pts = [[x, y]];
          for (let s = 0; s < n; s++) {
            ang += (R() - 0.5) * 0.9;
            x = clamp(x + Math.cos(ang) * T * 0.1, x0 + 2, x0 + T - 2); y = clamp(y + Math.sin(ang) * TH * 0.1, y0 + 2, y0 + TH - 3);
            pts.push([x, y]);
            if (depth < 1 && s > 1 && R() < 0.3) walk(x, y, ang + (R() < 0.5 ? 1 : -1) * (0.6 + R() * 0.6), 3 + ((R() * 3) | 0), x0, y0, depth + 1);
          }
          paths.push([pts, depth]);
        };
        DIAMOND3.forEach(([dx, dy]) => {
          const i = OP[0] + dx, j = OP[1] + dy;
          if (tile(i, j) === 'x') return;
          const x0 = px(i), y0 = py(j) - hy(i, j);
          // 裂缝朝远离她的方向延伸
          const base = Math.atan2(dy * SQ, dx || 0.001);
          for (let n = 0; n < 2; n++) walk(x0 + (0.2 + R() * 0.6) * T, y0 + (0.2 + R() * 0.6) * TH, base + (R() - 0.5) * 1.6, 6 + ((R() * 3) | 0), x0, y0, 0);
        });
        for (const [w, c] of [[7, 'rgba(255,70,15,.16)'], [3.2, 'rgba(255,120,40,.75)'], [1.3, 'rgba(255,236,190,.95)']]) {
          q.strokeStyle = c;
          for (const [pts, depth] of paths) {
            q.lineWidth = depth ? w * 0.6 : w;
            q.beginPath(); pts.forEach(([a, b], k) => (k ? q.lineTo(a, b) : q.moveTo(a, b))); q.stroke();
          }
        }
      });
    }
    function paintGround(q, i, j) {
      const x = px(i), y = py(j), lane = j === 1 || j === 3;
      q.fillStyle = lane ? C.lane : (i + j) % 2 ? C.ground : C.ground2;
      q.fillRect(x, y, T, TH);
      // 石板的明暗斑
      for (let k = 0; k < 3; k++) { q.fillStyle = R() < 0.5 ? C.grain : C.seam; q.globalAlpha = 0.5; q.beginPath(); q.ellipse(x + R() * T, y + R() * TH, T * (0.08 + R() * 0.14), TH * (0.05 + R() * 0.08), 0, 0, TAU); q.fill(); }
      q.globalAlpha = 1;
      // 石板缝 + 细纹
      q.strokeStyle = C.seam; q.lineWidth = 1;
      q.strokeRect(x + 0.5, y + 0.5, T - 1, TH - 1);
      q.strokeStyle = C.grain;
      for (let k = 0; k < 4; k++) { const a = x + R() * T, b = y + R() * TH; q.beginPath(); q.moveTo(a, b); q.lineTo(a + T * (0.06 + R() * 0.1), b + TH * (R() - 0.5) * 0.06); q.stroke(); }
      if (!medic) {
        // 本体：路面的细裂缝里透出一点暗红
        if (R() < 0.45) { q.strokeStyle = 'rgba(255,80,40,.16)'; q.lineWidth = 1.2; let a = x + R() * T, b = y + R() * TH; q.beginPath(); q.moveTo(a, b); for (let s = 0; s < 4; s++) { a += (R() - 0.5) * T * 0.3; b += (R() - 0.5) * TH * 0.3; q.lineTo(a, b); } q.stroke(); }
      } else if (R() < 0.5) {
        // 纯烬：一层薄薄的白灰
        q.fillStyle = 'rgba(255,255,255,.45)'; q.beginPath(); q.ellipse(x + R() * T, y + R() * TH, T * 0.14, TH * 0.05, 0, 0, TAU); q.fill();
      }
    }
    function paintHighShadow(q, i, j) {
      // 高台落在下方地面上的投影
      if (tile(i, j + 1) === 'h') return;
      const x = px(i), y = py(j + 1);
      const gr = q.createLinearGradient(0, y, 0, y + TH * 0.32);
      gr.addColorStop(0, C.shade); gr.addColorStop(1, 'rgba(0,0,0,0)');
      q.fillStyle = gr; q.fillRect(x, y, T, TH * 0.32);
    }
    function paintHigh(q, i, j) {
      const x = px(i), y = py(j) - E;
      // 前侧面（带一道竖纹，像游戏里的高台侧壁）
      q.fillStyle = C.side; q.fillRect(x + 1, y + TH - 2, T - 2, E + 2);
      q.fillStyle = C.dark ? 'rgba(255,120,150,.12)' : 'rgba(255,255,255,.45)'; q.fillRect(x + 1, y + TH - 2, T - 2, 1);
      q.fillStyle = C.dark ? 'rgba(0,0,0,.3)' : 'rgba(60,72,110,.12)'; for (let k = 1; k < 4; k++) q.fillRect(x + (k * T) / 4, y + TH, 1, E);
      // 顶面
      const gr = q.createLinearGradient(0, y, 0, y + TH);
      gr.addColorStop(0, C.top); gr.addColorStop(1, C.top2);
      q.fillStyle = gr; q.fillRect(x + 1, y, T - 2, TH - 2);
      // 部署格的边框、内框与四角
      q.strokeStyle = C.edge; q.lineWidth = 1; q.strokeRect(x + 1.5, y + 0.5, T - 3, TH - 3);
      q.strokeStyle = C.rim; q.beginPath(); q.moveTo(x + 2, y + 1.5); q.lineTo(x + T - 2, y + 1.5); q.stroke();
      q.globalAlpha = 0.4; q.strokeRect(x + T * 0.12, y + TH * 0.14, T * 0.76, TH * 0.72 - 2); q.globalAlpha = 1;
      q.fillStyle = C.edge;
      const c = T * 0.09;
      for (const [a, b, sx, sy] of [[x + 4, y + 3, 1, 1], [x + T - 4, y + 3, -1, 1], [x + 4, y + TH - 5, 1, -1], [x + T - 4, y + TH - 5, -1, -1]]) {
        q.beginPath(); q.moveTo(a, b); q.lineTo(a + c * sx, b); q.lineTo(a, b + c * sy * SQ); q.closePath(); q.fill();
      }
      // 细节：本体的源石结晶与碎石；纯烬的花草
      const roll = R();
      if (!medic) {
        if (roll < 0.16) crystalCluster(q, x + T * (0.22 + R() * 0.56), y + TH * (0.74 + R() * 0.12), T * 0.2);
        else if (roll < 0.45) { q.fillStyle = 'rgba(0,0,0,.3)'; for (let k = 0; k < 3; k++) { q.beginPath(); q.ellipse(x + T * (0.15 + R() * 0.7), y + TH * (0.2 + R() * 0.6), T * 0.035, TH * 0.022, 0, 0, TAU); q.fill(); } }
      } else if (roll < 0.35) paintTuft(q, x + T * (0.18 + R() * 0.64), y + TH * (0.72 + R() * 0.16), T * 0.16, R() < 0.5);
    }
    /** 一簇源石结晶：暗色晶体、橙色棱边，底下一小片光 */
    function crystalCluster(q, x, y, s) {
      const gl = q.createRadialGradient(x, y, 0, x, y, s * 0.9);
      gl.addColorStop(0, 'rgba(255,120,50,.35)'); gl.addColorStop(1, 'rgba(255,120,50,0)');
      q.fillStyle = gl; q.beginPath(); q.ellipse(x, y, s * 0.9, s * 0.45, 0, 0, TAU); q.fill();
      const set = [[-0.34, 0.55, 0.2, -0.42], [0.02, 1, 0.26, 0.04], [0.32, 0.7, 0.2, 0.38], [-0.12, 0.42, 0.14, -0.1]];
      for (const [dx, h, w, rot] of set) {
        q.save(); q.translate(x + dx * s, y); q.rotate(rot);
        const H0 = s * h, W0 = s * w;
        PO(q, [[0, -H0], [W0 / 2, -H0 * 0.7], [W0 / 2, 0], [-W0 / 2, 0], [-W0 / 2, -H0 * 0.7]]);
        const cg = q.createLinearGradient(-W0 / 2, 0, W0 / 2, 0); cg.addColorStop(0, '#3b2230'); cg.addColorStop(1, '#1d1119');
        q.fillStyle = cg; q.fill();
        q.strokeStyle = 'rgba(255,150,70,.95)'; q.lineWidth = Math.max(1, s * 0.05); q.stroke();
        q.fillStyle = 'rgba(255,190,120,.7)'; PO(q, [[0, -H0 * 0.94], [W0 * 0.18, -H0 * 0.68], [0, -H0 * 0.18]]); q.fill();
        q.restore();
      }
    }
    function paintTuft(q, x, y, s, flower) {
      q.strokeStyle = 'rgba(96,160,118,.85)'; q.lineWidth = Math.max(1, s * 0.09);
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.3; q.beginPath(); q.moveTo(x, y); q.quadraticCurveTo(x + Math.cos(a) * s * 0.4, y + Math.sin(a) * s * 0.5, x + Math.cos(a) * s * 0.8, y + Math.sin(a) * s); q.stroke(); }
      if (flower) {
        // 「棉花糖」3 号：一团白绒绒的花冠，茎秆会变色预警喷发
        q.strokeStyle = 'rgba(214,120,160,.9)'; q.beginPath(); q.moveTo(x + s * 0.1, y); q.lineTo(x + s * 0.25, y - s * 1.2); q.stroke();
        q.fillStyle = '#ffffff'; for (const [a, b] of [[0, 0], [0.16, -0.08], [-0.14, -0.06], [0.04, -0.18]]) { q.beginPath(); q.arc(x + s * (0.25 + a), y - s * (1.3 - b), s * 0.18, 0, TAU); q.fill(); }
        q.strokeStyle = 'rgba(160,170,200,.5)'; q.lineWidth = 0.8; q.beginPath(); q.arc(x + s * 0.25, y - s * 1.3, s * 0.3, 0, TAU); q.stroke();
        q.fillStyle = 'rgba(255,190,215,.85)'; q.beginPath(); q.arc(x + s * 0.27, y - s * 1.32, s * 0.08, 0, TAU); q.fill();
      }
    }
    function paintVoid(q, i, j) {
      const x = px(i), y = py(j), cx = x + T / 2, cy = y + TH / 2;
      if (!medic) {
        // 熔岩池：玄武岩围着一汪不规则的熔岩，表面结着暗色硬壳，缝里透出光
        q.fillStyle = '#0c0506'; q.fillRect(x, y, T, TH);
        for (let k = 0; k < 6; k++) { q.fillStyle = k % 2 ? '#1a0b0c' : '#140809'; q.beginPath(); q.ellipse(x + R() * T, y + R() * TH, T * (0.1 + R() * 0.14), TH * (0.08 + R() * 0.1), R() * 3, 0, TAU); q.fill(); }
        const blob = [], n = 16;
        for (let k = 0; k < n; k++) { const a = (k / n) * TAU, rr = 0.37 + R() * 0.08; blob.push([cx + Math.cos(a) * T * rr, cy + Math.sin(a) * TH * rr]); }
        const path = () => { q.beginPath(); for (let k = 0; k <= n; k++) { const [a, b] = blob[k % n], [c, d] = blob[(k + 1) % n]; k ? q.quadraticCurveTo(a, b, (a + c) / 2, (b + d) / 2) : q.moveTo((a + c) / 2, (b + d) / 2); } q.closePath(); };
        const gr = q.createRadialGradient(cx, cy, 0, cx, cy, T * 0.44);
        gr.addColorStop(0, '#ffe3a0'); gr.addColorStop(0.3, '#ff9433'); gr.addColorStop(0.62, '#d23a14'); gr.addColorStop(1, '#4a0c08');
        q.fillStyle = gr; path(); q.fill();
        // 硬壳：几块暗色的板，边缘亮起来
        q.save(); path(); q.clip();
        for (let k = 0; k < 8; k++) {
          const a = R() * TAU, d = 0.14 + R() * 0.26, px0 = cx + Math.cos(a) * T * d, py0 = cy + Math.sin(a) * TH * d, rr = T * (0.03 + R() * 0.04), m = 5 + ((R() * 3) | 0);
          q.beginPath();
          for (let s = 0; s < m; s++) { const aa = (s / m) * TAU + R() * 0.5, r2 = rr * (0.7 + R() * 0.4); s ? q.lineTo(px0 + Math.cos(aa) * r2, py0 + Math.sin(aa) * r2 * SQ) : q.moveTo(px0 + Math.cos(aa) * r2, py0 + Math.sin(aa) * r2 * SQ); }
          q.closePath();
          q.fillStyle = `rgba(${60 + ((R() * 30) | 0)},16,10,.62)`; q.fill();
          q.strokeStyle = 'rgba(255,214,140,.8)'; q.lineWidth = 1; q.stroke();
        }
        q.restore();
        q.strokeStyle = 'rgba(40,12,10,.9)'; q.lineWidth = Math.max(2, T * 0.03); path(); q.stroke();
        q.strokeStyle = 'rgba(255,150,70,.35)'; q.lineWidth = 1; path(); q.stroke();
      } else {
        // 花草地：浅绿的草甸、几丛草和预警花，落着一层白灰
        const gr = q.createLinearGradient(0, y, 0, y + TH);
        gr.addColorStop(0, '#e1ebe5'); gr.addColorStop(1, '#cfded6');
        q.fillStyle = gr; q.fillRect(x, y, T, TH);
        for (let k = 0; k < 5; k++) paintTuft(q, x + T * (0.12 + R() * 0.76), y + TH * (0.34 + R() * 0.6), T * (0.14 + R() * 0.08), R() < 0.55);
        q.fillStyle = 'rgba(255,255,255,.5)'; for (let k = 0; k < 4; k++) { q.beginPath(); q.ellipse(x + R() * T, y + R() * TH, T * 0.12, TH * 0.04, 0, 0, TAU); q.fill(); }
      }
    }
    function paintMarkers(q) {
      // 入侵点（右，两个）与保护目标（左）：发光方框，画一次就好
      const box = (i, j, col, label) => {
        const x = px(i + 0.5), y = py(j + 0.5), w = T * 0.3, h = TH * 0.3;
        q.save(); q.shadowColor = col; q.shadowBlur = 16; q.strokeStyle = col; q.lineWidth = 3;
        q.strokeRect(x - w, y - h, w * 2, h * 2); q.restore();
        q.fillStyle = col; q.globalAlpha = 0.14; q.fillRect(x - w, y - h, w * 2, h * 2);
        q.globalAlpha = 0.45; q.strokeStyle = col; q.lineWidth = 1; q.strokeRect(x - w * 0.72, y - h * 0.72, w * 1.44, h * 1.44); q.globalAlpha = 1;
        q.fillStyle = col; q.font = `700 ${Math.max(9, T * 0.105)}px "Noto Sans SC", sans-serif`; q.textAlign = 'center';
        q.globalAlpha = 0.95; q.fillText(label, x, y + h + T * 0.13); q.globalAlpha = 1;
      };
      box(0, 2, '#3b8cff', '保护目标');
      box(9, 1, '#ff3b4f', '入口');
      box(9, 3, '#ff3b4f', '入口');
      // 路线上的淡箭头（静态；每帧只画流动的一小段高光）
      q.strokeStyle = C.lanes; q.lineWidth = Math.max(1.5, T * 0.03);
      for (const j of [1, 3]) for (let i = 1; i < 9; i++) { const x = px(i + 0.5), y = py(j + 0.5); q.beginPath(); q.moveTo(x + T * 0.08, y - TH * 0.08); q.lineTo(x - T * 0.02, y); q.lineTo(x + T * 0.08, y + TH * 0.08); q.stroke(); }
    }
    function paintAirRoute(q) {
      // 空中单位的航线（游戏里是黄色虚线）
      const P = PATHS[2];
      q.save(); q.setLineDash([T * 0.12, T * 0.1]); q.strokeStyle = 'rgba(255,208,80,.6)'; q.lineWidth = Math.max(1.5, T * 0.022);
      q.beginPath(); P.forEach(([a, b], k) => (k ? q.lineTo(px(a), py(b)) : q.moveTo(px(a), py(b)))); q.stroke(); q.restore();
      q.fillStyle = 'rgba(255,208,80,.9)'; q.font = `700 ${Math.max(9, T * 0.095)}px "Noto Sans SC", sans-serif`; q.textAlign = 'right';
      q.fillText('空中航线 ✈', px(8.9), py(P[0][1]) - 5);
    }
    function paintReeds(q, i, j) {
      // 燃烧的芦苇丛：焦黑的茎秆（火苗每帧另画）
      const x = px(i), y = py(j) - E;
      q.fillStyle = 'rgba(60,40,30,.25)'; q.beginPath(); q.ellipse(x + T / 2, y + TH * 0.72, T * 0.4, TH * 0.16, 0, 0, TAU); q.fill();
      for (let k = 0; k < 11; k++) {
        const bx = x + T * (0.14 + R() * 0.72), by = y + TH * (0.62 + R() * 0.24), h = T * (0.3 + R() * 0.3), lean = (R() - 0.5) * T * 0.12;
        q.strokeStyle = k % 3 ? '#6b5a3e' : '#3a2c1f'; q.lineWidth = Math.max(1, T * 0.018);
        q.beginPath(); q.moveTo(bx, by); q.quadraticCurveTo(bx + lean * 0.3, by - h * 0.6, bx + lean, by - h); q.stroke();
        if (R() < 0.5) { q.fillStyle = '#8a7650'; q.beginPath(); q.ellipse(bx + lean, by - h - T * 0.03, T * 0.018, T * 0.05, lean / T, 0, TAU); q.fill(); }
      }
    }
    /** 攻击范围：每格淡淡铺一层，只在范围外沿描边（和游戏里选中干员时一样） */
    function rangeCells(skill) {
      if (medic && skill) return null; // 火山回响：全场
      const rel = medic || !skill ? cells(F.range[2]).concat([[0, 0]]) : DIAMOND3;
      return new Set(rel.map(([dx, dy]) => `${OP[0] + dx},${OP[1] + dy}`).filter((k) => { const [i, j] = k.split(',').map(Number); return tile(i, j) !== 'x'; }));
    }
    const RS = { n: rangeCells(false), s: rangeCells(true) };
    function buildRanges() {
      for (const k of ['n', 's']) {
        const set = RS[k], col = k === 's' ? C.rangeS : C.range;
        rangeCv[k] = mk(cv.width, cv.height, (q) => {
          q.setTransform(dpr, 0, 0, dpr, 0, 0);
          const has = (i, j) => !set || set.has(`${i},${j}`);
          for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
            if (!has(i, j) || tile(i, j) === 'x') continue;
            const x = px(i), y = py(j) - hy(i, j);
            q.fillStyle = `rgba(${col},${set ? 0.2 : 0.1})`; q.fillRect(x + 1, y + 1, T - 2, TH - 2);
            q.strokeStyle = `rgba(${col},.95)`; q.lineWidth = 2;
            q.beginPath();
            if (!has(i, j - 1)) { q.moveTo(x + 1, y + 1); q.lineTo(x + T - 1, y + 1); }
            if (!has(i, j + 1)) { q.moveTo(x + 1, y + TH - 1); q.lineTo(x + T - 1, y + TH - 1); }
            if (!has(i - 1, j)) { q.moveTo(x + 1, y + 1); q.lineTo(x + 1, y + TH - 1); }
            if (!has(i + 1, j)) { q.moveTo(x + T - 1, y + 1); q.lineTo(x + T - 1, y + TH - 1); }
            q.stroke();
          }
        });
      }
    }
    function buildUnits() {
      foeSpr = {};
      for (const key of Object.keys(FOES)) {
        const d = FOES[key], r = T * d.r, S = r * 4.4, frames = d.fly ? 3 : 2;
        const list = [];
        for (let k = 0; k < frames; k++) {
          const n = mk(S * dpr, S * dpr, (q) => { q.scale(dpr, dpr); q.translate(S / 2, d.fly ? S / 2 : S * 0.74); PAINT[key](q, r, k); });
          const w = mk(n.width, n.height, (q) => { q.drawImage(n, 0, 0); q.globalCompositeOperation = 'source-in'; q.fillStyle = '#fff'; q.fillRect(0, 0, n.width, n.height); });
          list.push({ n, w });
        }
        foeSpr[key] = { list, S, ay: d.fly ? 0.5 : 0.74 };
      }
      allySpr = {};
      for (const kind of ['guard', 'defender']) {
        const r = T * (kind === 'defender' ? 0.33 : 0.3), S = r * 4.6;
        const frames = [0, 1].map((k) => mk(S * dpr, S * dpr, (q) => { q.scale(dpr, dpr); q.translate(S / 2, S * 0.74); PAINT[kind](q, r, k); }));
        const lit = mk(frames[0].width, frames[0].height, (q) => { q.drawImage(frames[0], 0, 0); q.globalCompositeOperation = 'source-atop'; q.fillStyle = 'rgba(150,255,200,.55)'; q.fillRect(0, 0, frames[0].width, frames[0].height); });
        const w = mk(frames[0].width, frames[0].height, (q) => { q.drawImage(frames[0], 0, 0); q.globalCompositeOperation = 'source-in'; q.fillStyle = '#fff'; q.fillRect(0, 0, frames[0].width, frames[0].height); });
        allySpr[kind] = { frames, lit, w, S, r };
      }
      { const r = T * 0.2, S = r * 3; sheepSpr = { S, img: mk(S * dpr, S * dpr, (q) => { q.scale(dpr, dpr); q.translate(S / 2, S * 0.8); paintSheep(q, r, !medic); }) }; }
      badge = eliteBadge(Math.round(T * 0.16 * dpr));
      buildOpToken();
      // 云霭荫佑的六边形泡泡
      const B = T * 1.3;
      bubble = mk(B * dpr, B * dpr, (q) => {
        q.scale(dpr, dpr); q.translate(B / 2, B / 2);
        const Rr = B * 0.46;
        const gr = q.createRadialGradient(0, 0, Rr * 0.2, 0, 0, Rr);
        gr.addColorStop(0, 'rgba(210,232,255,0.05)'); gr.addColorStop(0.85, 'rgba(150,200,250,0.35)'); gr.addColorStop(1, 'rgba(150,200,250,0)');
        q.fillStyle = gr; q.beginPath(); q.arc(0, 0, Rr, 0, TAU); q.fill();
        q.save(); q.beginPath(); q.arc(0, 0, Rr * 0.96, 0, TAU); q.clip();
        const s = Rr * 0.22, hh = Math.sqrt(3) * s;
        q.strokeStyle = 'rgba(110,170,235,.55)'; q.lineWidth = 1;
        for (let c = -5; c <= 5; c++) for (let rr = -5; rr <= 5; rr++) {
          const cx = c * 1.5 * s, cy = rr * hh + (c & 1 ? hh / 2 : 0);
          q.beginPath(); for (let k = 0; k < 6; k++) { const an = (k * TAU) / 6; q.lineTo(cx + Math.cos(an) * (s - 1), cy + Math.sin(an) * (s - 1)); } q.closePath(); q.stroke();
        }
        q.restore();
        q.strokeStyle = 'rgba(255,255,255,.85)'; q.lineWidth = 2; q.beginPath(); q.arc(0, 0, Rr * 0.96, 0, TAU); q.stroke();
        q.strokeStyle = 'rgba(255,255,255,.7)'; q.lineWidth = 2.5; q.beginPath(); q.arc(0, 0, Rr * 0.8, -2.4, -1.6); q.stroke();
      });
    }
    /** 小人没载入之前的部署标记：菱形底座上立一张头像卡（头像来自 PRTS，约 10 KB） */
    function buildOpToken() {
      const S = T * 1.25;
      opTok = { S, img: mk(S * dpr, S * 1.3 * dpr, (q) => {
        q.scale(dpr, dpr);
        const cx = S / 2, base = S * 1.12;
        // 地上的菱形部署光圈
        q.save(); q.translate(cx, base); q.scale(1, 0.42);
        const gr = q.createRadialGradient(0, 0, 0, 0, 0, S * 0.5);
        gr.addColorStop(0, medic ? 'rgba(120,180,255,.55)' : 'rgba(255,90,140,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        q.fillStyle = gr; q.beginPath(); q.arc(0, 0, S * 0.5, 0, TAU); q.fill();
        q.strokeStyle = medic ? '#6aa8ff' : '#ff7aa8'; q.lineWidth = 2.4; PO(q, [[0, -S * 0.42], [S * 0.42, 0], [0, S * 0.42], [-S * 0.42, 0]]); q.stroke();
        q.restore();
        // 立着的头像卡
        const w = S * 0.62, h = S * 0.78, x = cx - w / 2, y = base - h - S * 0.12;
        q.fillStyle = medic ? '#f4f7fc' : '#2a0f18'; q.strokeStyle = medic ? '#5b7fc4' : '#ff8ab4'; q.lineWidth = 2;
        RR(q, x, y, w, h, 4); q.fill(); q.stroke();
        if (avatar) { q.save(); RR(q, x + 3, y + 3, w - 6, w - 6, 3); q.clip(); q.drawImage(avatar, x + 3, y + 3, w - 6, w - 6); q.restore(); }
        else {
          // 头像还没到：画职业图形（医疗十字 / 术师火焰）+ 干员编号
          const gr = q.createLinearGradient(0, y, 0, y + w);
          gr.addColorStop(0, medic ? '#eef3fb' : '#5a1f33'); gr.addColorStop(1, medic ? '#cfdcf0' : '#2a0c16');
          q.fillStyle = gr; RR(q, x + 3, y + 3, w - 6, w - 6, 3); q.fill();
          const cx2 = cx, cy2 = y + w * 0.46, r2 = w * 0.26;
          q.fillStyle = medic ? '#4f9fe0' : '#ff7aa8';
          if (medic) { const k = r2 * 0.34; q.fillRect(cx2 - k, cy2 - r2, k * 2, r2 * 2); q.fillRect(cx2 - r2, cy2 - k, r2 * 2, k * 2); }
          else { q.beginPath(); q.moveTo(cx2, cy2 - r2); q.bezierCurveTo(cx2 + r2 * 0.8, cy2 - r2 * 0.2, cx2 + r2 * 0.8, cy2 + r2 * 0.6, cx2, cy2 + r2); q.bezierCurveTo(cx2 - r2 * 0.8, cy2 + r2 * 0.6, cx2 - r2 * 0.6, cy2, cx2, cy2 - r2); q.fill(); }
          q.fillStyle = medic ? '#6b7a99' : '#ffb0c8'; q.font = `700 ${Math.max(7, S * 0.07)}px "JetBrains Mono", monospace`; q.textAlign = 'center';
          q.fillText(medic ? 'LN10' : 'LN02', cx, y + w * 0.9);
        }
        q.fillStyle = medic ? '#3fb07a' : '#ff4f8f'; q.fillRect(x + 3, y + w - 1, w - 6, 3);
        q.fillStyle = medic ? '#2a2f45' : '#ffe6ee'; q.font = `700 ${Math.max(8, S * 0.1)}px "Noto Sans SC", sans-serif`; q.textAlign = 'center';
        q.fillText(medic ? '医疗' : '术师', cx, y + h - S * 0.06);
      }) };
    }
    if (F.avatar) {
      // 头像（约 10 KB 的缩略图）；资源站偶尔失败：换原图再试一次
      const src0 = F.avatar.replace(/\?image_process=.*$/, '');
      const loadAv = (src, again) => {
        const im = new Image();
        im.referrerPolicy = 'no-referrer';
        im.onload = () => { avatar = im; if (!destroyed && T > 1) buildOpToken(); };
        im.onerror = () => { if (again && !destroyed) setTimeout(() => loadAv(src0, false), 2500); };
        im.src = src;
      };
      loadAv(src0 + '?image_process=resize,w_128/format,webp/quality,Q_85', true);
    }

    /* ---------------- 当前技能状态下的各项属性 ---------------- */
    const S = () => sk[skillIdx];
    const on = (id) => active && S().id === id;
    function atkNow() {
      let pct = M.tal;
      if (on('chant') && casts >= 2) pct += S().v.a / 100; // 二重咏唱：第二次起攻击力 +60%
      if (on('volcano')) pct += S().v.a / 100;
      if (on('rain')) pct += S().v.a / 100;
      return M.base * (1 + pct);
    }
    let elemAspd = false; // 医疗 Y 模组：范围内有受元素损伤的友方
    function aspdNow() {
      let a = 100 + aspdTal;
      if (on('chant')) a += S().v.a;
      if (medic && elemAspd) a += M.aspdElem;
      return a;
    }
    function interval() {
      let iv = M.iv;
      if (on('volcano')) iv -= 1.1;
      return iv / (aspdNow() / 100);
    }
    const rangeSet = (skill = on('volcano') || on('echo')) => (skill ? RS.s : RS.n);
    const cellOf = (x, y) => `${Math.floor(x)},${Math.floor(y)}`;
    const inRange = (x, y, set = rangeSet()) => !set || set.has(cellOf(x, y));
    const foeIn = (e, set) => !e.dead && e.born > 0.2 && inRange(e.x, e.y, set);
    /** 医疗第二天赋：火山回响期间 ×N */
    const t2mul = () => (on('echo') ? S().v.m : 1);
    const allyMaxHp = (a) => a.hpBase * (1 + (inRange(a.x, a.y) ? M.hpUp * t2mul() : 0));
    const IGN_R = ((sk.find((s) => s.id === 'ignite') || { v: { r: 0 } }).v.r || 0) / 100; // 点燃：法术抗性 −25%
    const artsHitVal = (A, e) => artsVs(A, e.d.res, e.resDown > 0 ? 1 - IGN_R : 1, M.ignore || 0);

    /* ---------------- 单位 ---------------- */
    function spawn(key, lane, at) {
      const d = FOES[key];
      if (!d) return null;
      const P = PATHS[lane];
      const e = { id: ++uid, key, d, lane, seg: 0, x: P[0][0], y: P[0][1], dy: d.fly ? 0 : rnd(-0.13, 0.13), hpMax: d.hp, hp: d.hp, cd: rnd(0.3, 1), resDown: 0, hitT: 0,
        blockedBy: null, dead: 0, born: 0, walk: Math.random() * 10, lunge: 0, bob: Math.random() * TAU, z: d.fly ? 0.62 : 0, stop: 0 };
      if (at) advance(e, at);
      else if (!d.fly && T > 1) ring(P[0][0] - 0.3, P[0][1], 0.42, 'rgba(255,70,90,', 0.5, 1.4); // 入口冒出一圈红光
      foes.push(e);
      stat.spawned++;
      return e;
    }
    function advance(e, dist) {
      const P = PATHS[e.lane];
      while (dist > 0 && e.seg < P.length - 1) {
        const [x1, y1] = P[e.seg + 1], dx = x1 - e.x, dy = y1 - e.y, Ls = Math.hypot(dx, dy);
        if (Ls <= dist) { e.x = x1; e.y = y1; e.seg++; dist -= Ls; } else { e.x += (dx / Ls) * dist; e.y += (dy / Ls) * dist; dist = 0; }
      }
      return e.seg >= P.length - 1;
    }
    /** 离保护目标还有多远（游戏里默认优先攻击最靠近目标的敌人） */
    function remain(e) {
      const P = PATHS[e.lane];
      if (e.seg >= P.length - 1) return 0;
      let d = Math.hypot(P[e.seg + 1][0] - e.x, P[e.seg + 1][1] - e.y);
      for (let k = e.seg + 1; k < P.length - 1; k++) d += SEGL[e.lane][k];
      return d;
    }
    function makeAllies() {
      allies = medic ? ALLY.map(([x, y, kind, lane]) => {
        const d = kind === 'guard' ? { name: '近卫', hp: 2600, def: 420, res: 10, atk: 820, iv: 1.2, block: 2 } : { name: '重装', hp: 3400, def: 700, res: 10, atk: 520, iv: 1.2, block: 3 };
        return { kind, lane, ...d, x: x + 0.5, y: y + 0.5, hpBase: d.hp, hp: d.hp, elem: 0, burnT: 0, hot: [], cd: rnd(0.2, 0.8), down: 0, flash: 0, swing: 0, hurt: 0, shieldHit: 0 };
      }) : [];
    }

    /* ---------------- 数字、粒子、战报 ---------------- */
    function num(x, y, text, color, big, sub) { nums.push({ x: x + rnd(-0.08, 0.08), y, text: String(text), color, big: big || 0, sub, t: 0 }); if (nums.length > 70) nums.shift(); } // big：1 大号、-1 小号
    /** 大数字交给全屏特效层（会飘出画框）；没有特效层时退回画布 */
    function bigNum(x, y, text, color, size = 22) {
      const fx = FXS();
      if (!fx) return num(x, y, text, color, true);
      const [a, b] = vp(x + rnd(-0.26, 0.26), y + rnd(-0.16, 0.1));
      fx.text(a, b, String(text), color, { size: size * clamp(T / 110, 0.72, 1.15), max: 1.05, vx: rnd(-26, 26), vy: rnd(-90, -55), outline: medic ? 'rgba(255,255,255,.9)' : 'rgba(20,6,10,.85)' });
    }
    function ring(x, y, r, color, dur = 0.5, w = 1, flat = 0.5) { rings.push({ x, y, r, color, t: 0, dur, w, flat }); if (rings.length > 40) rings.shift(); }
    function part(o) { if (parts.length < 300) parts.push(Object.assign({ vx: 0, vy: 0, ay: 0, t: 0, max: 0.6, s0: 0.12, s1: 0.02, a: 1, spr: SP.ember, add: true, sw: 0 }, o)); }
    function logDmg(v) { stat.dmg += v; stat.log.push([t, v]); if (skillRun) { skillRun.dmg += v; skillRun.hits++; } if (bNow) bNow.v += v; }
    function logHeal(v, elem) { if (elem) { stat.elem += v; if (bNow) bNow.e += v; if (skillRun) skillRun.elem += v; } else { stat.heal += v; if (bNow) bNow.v += v; if (skillRun) skillRun.heal += v; } stat.log.push([t, v]); }
    function perSec() {
      const from = t - 5;
      while (stat.log.length && stat.log[0][0] < from) stat.log.shift();
      let s = 0; for (const x of stat.log) s += x[1];
      return s / Math.min(5, Math.max(1, t));
    }
    function say(html, kind = '') {
      const p = document.createElement('p');
      if (kind) p.className = kind;
      p.innerHTML = html;
      logEl.prepend(p);
      while (logEl.children.length > 4) logEl.lastChild.remove();
    }
    function cutIn(s, line) {
      const vo = VOX.length ? pick(VOX) : null;
      cut.innerHTML = `<i><img src="${s.icon}" alt="" referrerpolicy="no-referrer" onerror="this.remove()"></i><div><small>SKILL · ${medic ? 'MEDIC' : 'CASTER'}</small><b>${s.name}</b><span>${line}</span>${vo ? `<q>${vo[1]} · ${vo[2]}</q>` : ''}</div>`;
      cut.classList.remove('on');
      void cut.offsetWidth;
      cut.classList.add('on');
      cutLeft = 2.6;
      if (tipCur && tipCur.left > 400) tipCur.left = 400; // 正在显示的解说让位
    }
    function showHit(n, dmg, label = '同时命中') {
      hit.innerHTML = `<b>×${n}</b><span>${label}</span><em>${fmt(dmg)}</em>${combo > 1 ? `<i>连击 ${combo}${skillRun ? ` · 累计 ${fmtK(skillRun.dmg)}` : ''}</i>` : ''}`;
      hit.classList.remove('pop');
      void hit.offsetWidth;
      hit.classList.add('pop', 'on');
      hitLeft = 2.2;
    }
    function kick(a) { if (!reduce) { shake = Math.max(shake * Math.max(0, 1 - shakeT / 0.4), a); shakeT = 0; } }
    function sfx(kind) { if (opts.sfx) opts.sfx(kind); }

    /* ---------------- 解说：第一次发生某件事时，在画面里指给你看 ---------------- */
    const tipSeen = new Set();
    let tipQ = [], tipCur = null, tipGap = 0;
    function tip(id, html, at, ms = 4600) {
      if (!cfg.tips || tipSeen.has(id)) return;
      tipSeen.add(id);
      tipQ.push({ id, html, at, ms });
      if (tipQ.length > 4) tipQ.shift();
    }
    let cutLeft = 0; // 技能切入还要显示多久：期间先不出解说，免得叠在一起
    function tickTip(rdt) {
      if (cutLeft > 0) cutLeft -= rdt;
      if (tipCur) {
        tipCur.left -= rdt * 1000;
        if (tipCur.left <= 0) { tipEl.classList.remove('on'); tipCur = null; tipGap = 0.5; }
        else placeTip();
      } else if ((tipGap -= rdt) <= 0 && tipQ.length && cutLeft <= 0) {
        tipCur = tipQ.shift();
        tipCur.left = tipCur.ms;
        tipEl.innerHTML = tipCur.html;
        tipEl.classList.add('on');
        placeTip(true);
      }
    }
    let tipW = 0, tipH = 0;
    function placeTip(measure) {
      const at = typeof tipCur.at === 'function' ? tipCur.at() : tipCur.at;
      if (!at) return;
      if (measure) { tipW = tipEl.offsetWidth; tipH = tipEl.offsetHeight; }
      const ax = px(at[0]), ay = py(at[1]);
      const x = clamp(ax - tipW / 2, 6, W - tipW - 6);
      const below = ay - tipH - 16 < 4;
      const y = below ? ay + 22 : ay - tipH - 14;
      tipEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      tipEl.style.setProperty('--ax', clamp(ax - x, 12, tipW - 12).toFixed(0) + 'px');
      tipEl.classList.toggle('below', below);
    }

    /* ---------------- 术师：打人 ---------------- */
    function artsHit(e, mult, show = 'num') {
      const A = atkNow() * mult;
      const dmg = artsHitVal(A, e);
      e.hp -= dmg;
      e.hitT = 0.14;
      logDmg(dmg);
      const cmp = scen.compare || (cfg.tips && e.d.def >= 400);
      const phys = physVs(A, e.d.def);
      // 同一个敌人连续挨打：数字错开高度，免得叠成一团
      if (show === 'big') { e.nk = ((e.nk || 0) + 1) % 3; bigNum(e.x + (e.nk - 1) * 0.22, e.y + e.dy - e.z - 0.6 - e.nk * 0.2, fmt(dmg), 'rgb(255,130,215)', mult > 1.5 ? 26 : 22); }
      else if (show === 'num') num(e.x, e.y - e.z - 0.5, fmt(dmg), '#ff7fd8', mult > 1.5, cmp ? `物理 ${fmt(phys)}` : '');
      // 第一次见到重甲 / 法抗 / 空中单位：解说
      if (e.d.def >= 800) tip('def', `<b>${e.d.name}</b> · 防御 ${e.d.def}<br>同样 ${fmt(A)} 攻击力：物理只打得出 <s>${fmt(phys)}</s>（保底 5%）<br>她的法术伤害无视防御：<b>${fmt(dmg)}</b>`, () => [e.x, e.y - 0.55]);
      else if (e.d.res >= 50) tip('res', `<b>${e.d.name}</b> · 法术抗性 ${e.d.res}<br>法术伤害 = 攻击力 × (1 − 法抗%)：这一下只剩 <b>${fmt(dmg)}</b>${M.ignore ? `<br>X 模组：无视 ${M.ignore} 点法抗` : ''}<br>「点燃」的爆炸能让法抗 −25%`, () => [e.x, e.y - 0.55]);
      else if (e.d.fly) tip('air', `<b>${e.d.name}</b> · 空中单位<br>近战干员够不着——术师<b>可以对空</b>`, () => [e.x, e.y - e.z - 0.3]);
      else tip('arts', `法术伤害：<b>无视防御</b>，只受法术抗性减免<br>${e.d.name} · 防御 ${e.d.def} · 法抗 ${e.d.res} → <b>${fmt(dmg)}</b>`, () => [e.x, e.y - 0.5]);
      if (e.hp <= 0 && !e.dead) kill(e);
      return dmg;
    }
    function kill(e) {
      e.dead = 0.001; stat.kills++; if (skillRun) skillRun.kills++;
      for (let i = 0; i < 10; i++) {
        const a = rnd(0, TAU), v = rnd(0.6, 1.8);
        part({ x: e.x, y: e.y + e.dy - e.z - 0.2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.8, ay: 3, max: rnd(0.4, 0.8), s0: rnd(0.1, 0.2), spr: medic ? SP.ashL : pick([SP.ember, SP.gold]), add: !medic, a: medic ? 0.8 : 1 });
      }
      if (e.d.rank) say(`击破 <b>${e.d.name}</b>`, 'k');
    }
    function casterAttack() {
      const set = rangeSet();
      const tgt = foes.filter((e) => foeIn(e, set));
      if (!tgt.length) return false;
      tgt.sort((a, b) => remain(a) - remain(b)); // 优先打离保护目标最近的
      const s = S();
      const ox0 = OP[0] + 0.66, oy0 = OP[1] - 0.2;
      if (on('volcano')) {
        // 火山：向范围内随机至多 N 名敌人投射熔岩
        const pick6 = tgt.slice().sort(() => Math.random() - 0.5).slice(0, s.v.n);
        const vo = { n: pick6.length, dmg: 0, left: pick6.length };
        stat.best = Math.max(stat.best, pick6.length);
        if (skillRun) skillRun.best = Math.max(skillRun.best, pick6.length);
        if (pick6.length >= 5) tip('six', `一轮熔岩同时砸中 <b>${pick6.length}</b> 名敌人<br>专精三：每次攻击随机选范围内至多 <b>${s.v.n}</b> 名`, [OP[0] + 1.6, OP[1] - 0.6], 3800);
        const fx = FXS();
        const q = 1 / Math.max(1, speed * 0.8);
        pick6.forEach((e, i) => {
          const dur = 0.44 + i * 0.05;
          const lead = Math.min(dur * e.d.spd, 0.4) * (e.blockedBy ? 0 : 1);
          const [tx, ty] = leadPos(e, lead);
          const sh = { kind: 'lava', e, vo, tx, ty: ty + e.dy, x: tx - rnd(0.2, 1.1), y: -1.8 - rnd(0, 0.8), t: 0, dur };
          if (fx && fx.lava) {
            const [x0, y0] = vp(sh.x, sh.y), [x1, y1] = vp(tx, sh.ty - e.z);
            if (fx.lava(x0 - rnd(0, 90), y0 - rnd(60, 200), x1, y1, dur / speed, { size: T / 108, q }) !== false) sh.fx = true;
          }
          shots.push(sh);
        });
        chibiAttack();
        return true;
      }
      const e = tgt[0];
      const ign = s.id === 'ignite' && charges > 0;
      if (ign) {
        charges--;
        const sh = { kind: 'ignite', e, x: ox0, y: oy0, t: 0, dur: 0.42 };
        const fx = FXS();
        if (fx) { const [x0, y0] = vp(sh.x, sh.y), [lx, ly] = leadPos(e, 0.42 * e.d.spd), [x1, y1] = vp(lx, ly + e.dy - e.z); fx.bolt(x0, y0, x1, y1, 0.42 / speed, { size: T / 120, arc: T * 0.7 }); sh.fx = true; }
        shots.push(sh);
      } else {
        shots.push({ kind: 'orb', e, x: ox0, y: oy0, t: 0, dur: 0.28, twin: on('chant') });
      }
      chibiAttack();
      return true;
    }
    /** 敌人沿路线再走 d 格后的位置（给熔岩 / 火球预判落点） */
    function leadPos(e, d) {
      if (!d) return [e.x, e.y];
      const c = { lane: e.lane, seg: e.seg, x: e.x, y: e.y };
      advance(c, d);
      return [c.x, c.y];
    }
    function landShot(sh) {
      const e = sh.e;
      if (sh.kind === 'orb') {
        if (e.dead) return;
        artsHit(e, 1);
        if (M.spOnElite && e.d.rank && !active && S().id !== 'ignite') { sp = Math.min(S().cost, sp + M.spOnElite); num(OP[0] + 0.5, OP[1] - 0.9, '+1 技力', '#6cc3ff'); tip('ysp', `CCR-Y 模组：普通攻击命中<b>精英</b>敌人 → 技力 +1`, [OP[0] + 0.5, OP[1] - 0.6]); }
        for (let i = 0; i < 5; i++) part({ x: e.x, y: e.y + e.dy - e.z - 0.2, vx: rnd(-1.2, 1.2), vy: rnd(-1.4, -0.2), ay: 2, max: rnd(0.25, 0.45), s0: 0.14, spr: sh.twin ? SP.gold : SP.pink });
        return;
      }
      if (sh.kind === 'lava') {
        const x = sh.tx, y = sh.ty;
        decals.push({ x, y: y + 0.12, t: 0, s: rnd(0.75, 1.05) });
        if (decals.length > 40) decals.shift();
        if (!sh.fx) ring(x, y, 0.55, 'rgba(255,120,60,', 0.45, 2);
        for (let i = 0; i < 5; i++) part({ x, y, vx: rnd(-1.6, 1.6), vy: rnd(-2.6, -0.8), ay: 7, max: rnd(0.35, 0.6), s0: rnd(0.1, 0.18), spr: pick([SP.ember, SP.gold]) });
        const vo = sh.vo;
        if (!e.dead) { vo.dmg += artsHit(e, 1, 'big'); combo++; comboT = 1.2; e.knock = 0.2; }
        if (--vo.left <= 0) { if (vo.n >= 2) showHit(vo.n, vo.dmg); kick(clamp(vo.n * 0.8, 1.5, 5)); { const now = performance.now(); if (now - lastBoom > 420) { lastBoom = now; sfx('boom'); } } }
        return;
      }
      if (sh.kind === 'ignite') {
        // 点燃：370% 法术伤害并引发爆炸——结算是“主目标半额 + 范围半额”两段，所以主目标头上跳两个数；6 秒内法术抗性 −25%
        const s = S(), x = e.x, y = e.y + e.dy;
        const fx = FXS();
        if (fx) { const [a, b] = vp(x, y - e.z); fx.burst(a, b, T * 1.5); } else ring(x, y, 1.5, 'rgba(255,90,40,', 0.6, 3);
        decals.push({ x, y: y + 0.12, t: 0, s: 1.6 });
        kick(3.5);
        let n = 0, dmg = 0;
        foes.forEach((o) => {
          if (o.dead || Math.hypot(o.x - x, o.y + o.dy - y) > 1.5) return;
          n++;
          o.resDown = 6;
          dmg += artsHit(o, s.v.d / 200, 'big');
        });
        if (!e.dead) setTimeout(() => { if (!destroyed && !e.dead) artsHit(e, s.v.d / 200, 'big'); }, 90 / speed);
        combo += n; comboT = 1.5;
        if (n >= 2) showHit(n, dmg, '爆炸波及');
        bigNum(x, y + 0.2, `法抗 −${s.v.r}%`, 'rgb(255,190,120)', 16);
        say(`点燃爆炸 · 波及 <b>${n}</b> 名 · 法抗 −${s.v.r}%`, 'f');
        tip('ign', `点燃：主目标 <b>${s.v.d}%</b>，周围 1.5 格内的敌人吃一半<br>6 秒内法术抗性 <b>−${s.v.r}%</b>——每 ${s.cost} 秒回一层，削弱几乎不断`, [x, y - 0.6]);
        sfx('boom');
      }
    }

    /* ---------------- 医疗：治疗 ---------------- */
    function healAmt(a, amount, elemAmt, hot = true) {
      if (a.down) return;
      const mx = allyMaxHp(a);
      const h = Math.min(amount, mx - a.hp);
      a.hp += h;
      const el = a.burnT > 0 ? 0 : Math.min(a.elem, elemAmt);
      a.elem -= el;
      if (h > 0.5) { if (hot) num(a.x, a.y - 0.62, '+' + Math.round(h), '#3fd07a', amount > 900); logHeal(h); }
      if (el > 0.5) { logHeal(el, true); if (hot) num(a.x + 0.28, a.y - 0.36, '−' + Math.round(el) + ' 灼燃', '#e6a12a'); }
      if (hot && h < 1 && el > 1) tip('elem', `<b>${a.name}</b> 满血，她照样出手：<br>回复相当于攻击力 <b>${Math.round(M.elemK * 100)}%</b> 的元素损伤（−${Math.round(el)} 灼燃）`, () => [a.x, a.y - 0.8]);
      if (hot) {
        // 第一天赋「氤氲」：每秒 +10%（治疗量与元素回复量），6 秒，最多 3 层（Y 模组 3 级：13% · 8 秒）
        a.hot.push({ h: amount * M.hotPct, e: elemAmt * M.hotPct, left: M.hotDur, tick: 1 });
        if (a.hot.length > 3) a.hot.shift();
        if (a.hot.length === 3) tip('hot', `「氤氲」叠满 <b>3</b> 层：每层每秒再回复本次治疗量的 ${Math.round(M.hotPct * 100)}%，持续 ${M.hotDur} 秒`, () => [a.x, a.y - 0.8]);
        a.flash = 0.35;
      }
      for (let i = 0; i < (hot ? 5 : 2); i++) part({ x: a.x + rnd(-0.25, 0.25), y: a.y + rnd(-0.1, 0.2), vy: rnd(-1.4, -0.6), max: rnd(0.5, 0.9), s0: rnd(0.1, 0.16), s1: 0.03, spr: SP.mint, add: false, a: 0.9 });
    }
    function medicAttack() {
      const set = rangeSet();
      const cand = allies.filter((a) => !a.down && inRange(a.x, a.y, set));
      const need = cand.filter((a) => a.hp < allyMaxHp(a) - 1 || (a.elem > 1 && a.burnT <= 0));
      if (!need.length) return false; // 没人需要治疗就不出手
      // 优先生命比例最低；都满血时优先元素损伤最高
      need.sort((a, b) => a.hp / allyMaxHp(a) - b.hp / allyMaxHp(b) || b.elem - a.elem);
      const s = S(), atk = atkNow();
      let list;
      if (on('echo')) list = Array.from({ length: 5 }, (_, i) => need[i % need.length]); // 5 连发，优先不同目标
      else if (on('rain')) list = need.slice(0, 2); // 无声润物：多治疗 1 名
      else list = need.slice(0, 1);
      const k = on('echo') ? s.v.h / 100 : 1;
      list.forEach((a, i) => shots.push({ kind: 'heal', a, x: OP[0] + 0.66, y: OP[1] - 0.25, t: -i * (on('echo') ? 0.12 : 0.07), dur: 0.38, h: atk * k, e: atk * M.elemK * k, echo: on('echo') }));
      if (on('echo')) {
        ring(OP[0] + 0.5, OP[1] + 0.5, 5, 'rgba(255,255,255,', 0.9, 2);
        const fx = FXS(); if (fx) { const [a, b] = vp(OP[0] + 0.5, OP[1] + 0.3); fx.ping(a, b, T * 4.5); }
      }
      chibiAttack();
      return true;
    }

    /* ---------------- 技能 ---------------- */
    function canCast() { const s = S(); return !active && sp >= s.cost && s.id !== 'ignite'; }
    const foesInVolcano = () => foes.filter((e) => foeIn(e, RS.s)).length;
    /** 自动释放时像玩家一样挑时机：火山等敌人扎堆，治疗技能等有人受伤 */
    function wantCast() {
      const s = S();
      if (s.id === 'volcano') return foesInVolcano() >= Math.min(5, s.v.n) || fullFor > 4;
      if (s.id === 'chant') return foes.some((e) => foeIn(e, RS.n)) || fullFor > 3;
      if (s.id === 'shield') return allies.some((a) => !a.down && (a.hp < allyMaxHp(a) * 0.8 || a.elem > 300)) || fullFor > 4;
      if (s.id === 'echo') return allies.some((a) => !a.down && (a.hp < allyMaxHp(a) * 0.75 || a.elem > 400)) || fullFor > 3;
      return true;
    }
    function cast() {
      if (!canCast()) return false;
      const s = S();
      sp -= s.cost;
      casts++;
      fullFor = 0;
      marks.push([t, s.id]);
      if (marks.length > 12) marks.shift();
      if (opts.onCast) opts.onCast(s);
      const fx = FXS();
      const [ax, ay] = fx ? vp(OP[0] + 0.5, OP[1] + 0.6 - E / TH) : [0, 0];
      if (s.id === 'shield') {
        // 云霭荫佑：立即治疗范围内全体友方，展开共享屏障（吸收元素损伤）；再次释放会重置屏障
        const atk = atkNow();
        allies.filter((a) => !a.down && inRange(a.x, a.y)).forEach((a) => healAmt(a, atk, atk * M.elemK));
        barrier = { pool: atk * s.v.s / 100, max: atk * s.v.s / 100, left: s.v.t, absorbed: 0 };
        chibiSkill('shield');
        ring(4.5, 2.5, 2.4, 'rgba(160,200,255,', 0.8, 3);
        if (fx) { const [bx, by] = vp(4.5, 2.45); fx.shield(bx, by, T * 1.9); }
        cutIn(s, `立即治疗范围内全体 · 共享屏障 ${fmt(barrier.pool)} · ${s.v.t} 秒`);
        say(`<b>${s.name}</b> · 屏障 ${fmt(barrier.pool)}`, 's');
        tip('shield', `屏障<b>共享</b>：范围内友方受到的元素损伤先由它吸收<br>专三 ${s.v.t} 秒 · 消耗 ${s.cost} 技力——可以无缝续上`, [4.5, 1.9]);
        return true;
      }
      active = { left: s.dur === '∞' ? Infinity : s.dur };
      skillRun = { dmg: 0, heal: 0, elem: 0, best: 0, kills: 0, hits: 0, t0: t, bursts: stat.bursts };
      combo = 0;
      chibiSkill(s.id);
      if (s.id === 'volcano') {
        if (fx) { fx.erupt(ax, ay, { size: T / 110 }); if (fx.gloom) { fx.gloom(host, s.dur / speed); gloomOn = true; } }
        crackT = 0;
        if (!crackCv) buildCrack();
        kick(8);
        sfx('boom');
        for (let i = 0; i < 26; i++) part({ x: OP[0] + 0.5 + rnd(-0.3, 0.3), y: OP[1] + 0.5, vx: rnd(-1.5, 1.5), vy: rnd(-5, -2), ay: 5, max: rnd(0.6, 1.1), s0: rnd(0.14, 0.26), spr: pick([SP.ember, SP.gold, SP.red]) });
        cutIn(s, `攻击力 +${s.v.a}% · 攻击间隔 1.6 → 0.5 秒 · 每次向至多 <b>${s.v.n}</b> 名敌人投下熔岩 · ${s.dur} 秒`);
        tip('vrange', `火山：攻击范围变成以她为中心、半径 3 格的<b>菱形</b><br>连她<b>身后</b>的路段也在范围内`, [OP[0] + 3.4, OP[1] - 0.3], 4600);
        if (opts.onVolcano) opts.onVolcano();
      } else if (s.id === 'chant') {
        if (fx) fx.runes(ax, ay + T * 0.05, T * 0.95, casts >= 2);
        cutIn(s, `攻击速度 +${s.v.a}` + (casts >= 2 ? ` · 第 ${casts} 次施放：攻击力 <b>+${s.v.a}%</b>` : ` · 第 1 次施放（下一次起攻击力 +${s.v.a}%）`) + ` · ${s.dur} 秒`);
        if (casts >= 2) tip('chant2', `第 <b>${casts}</b> 次施放：同一次部署里，从第二次起攻击力 <b>+${s.v.a}%</b>`, [OP[0] + 0.5, OP[1] - 0.8]);
        else tip('chant1', `二重咏唱第一次只加攻速——<b>第二次起</b>才额外 +${s.v.a}% 攻击力（重新部署会清零）`, [OP[0] + 0.5, OP[1] - 0.8]);
      } else if (s.id === 'rain') {
        if (fx && fx.drizzle) { const [rx, ry] = vp(OP[0] + 1.5, OP[1] - 2); fx.drizzle(rx, ry, T * 4, T * 5); }
        cutIn(s, `攻击力 +${s.v.a}% · 每次多治疗 1 名 · 范围内每秒回复元素损伤 · 持续无限`);
        tip('rain', `无声润物是<b>自动触发</b>、持续<b>无限</b>：<br>范围内每秒回复 ${s.v.e}% 攻击力的元素损伤——无视禁疗`, [OP[0] + 1.5, OP[1] - 0.8]);
      } else if (s.id === 'echo') {
        if (fx) fx.echo(ax, ay);
        cutIn(s, `攻击范围：整个战场 · 治疗 5 连发 · 第二天赋 ×${s.v.m} · ${s.dur} 秒`);
        tip('echo', `火山回响：范围扩展到<b>整个战场</b><br>第二天赋 ×${s.v.m}：生命上限 <b>+${Math.round(M.hpUp * s.v.m * 100)}%</b>、元素损伤 <b>−${Math.round(M.elemCut * s.v.m * 100)}%</b>`, [OP[0] + 2.2, OP[1] - 0.7]);
      }
      say(`<b>${s.name}</b> 发动`, 's');
      return true;
    }
    function endSkill() {
      const s = S();
      if (skillRun) {
        const R_ = skillRun, secs = Math.max(1, t - R_.t0);
        if (s.id === 'volcano') say(`火山结束 · 共 <b>${fmt(R_.dmg)}</b> 伤害 · 单轮最多命中 ${R_.best} 名`, 'f');
        else if (s.id === 'chant') say(`二重咏唱结束 · 共 <b>${fmt(R_.dmg)}</b> 伤害`, '');
        else if (s.id === 'echo') say(`火山回响结束 · 共治疗 <b>${fmt(R_.heal)}</b>`, 's');
        // 结算卡：技能期间的总账
        const rows = medic
          ? [['总治疗', fmt(R_.heal)], ['元素回复', fmt(R_.elem)], ['平均每秒', fmt((R_.heal + R_.elem) / secs)], ['灼燃爆发', stat.bursts - R_.bursts + ' 次']]
          : [['总伤害', fmt(R_.dmg)], ['击破', R_.kills + ' 名'], ['平均每秒', fmt(R_.dmg / secs)], s.id === 'volcano' ? ['单轮最多', R_.best + ' 名'] : ['攻击次数', R_.hits + ' 次']];
        // 晚半拍再弹出：让最后一轮熔岩的数字先飘走
        clearTimeout(resultT);
        resultT = setTimeout(() => {
          if (destroyed) return;
          result.innerHTML = `<small>SKILL RESULT · ${Math.round(secs)} 秒</small><b>${s.name}</b><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
          result.classList.remove('on'); clearTimeout(resultT); void result.offsetWidth; result.classList.add('on');
          cutLeft = Math.max(cutLeft, 3.4); if (tipCur && tipCur.left > 300) tipCur.left = 300;
        }, 650);
      }
      active = null;
      skillRun = null;
      surge = 0;
      gloom(false);
      chibiSkillEnd();
    }
    function gloom(onOff) { if (!onOff && gloomOn) { gloomOn = false; const fx = FXS(); if (fx && fx.gloom) fx.gloom(host, 0); } }

    /* ---------------- 小人动作 ---------------- */
    const has = (n) => chibi && chibi.ready && chibi.has(n);
    function chibiAttack() {
      if (!chibi || !chibi.ready) return;
      if (on('volcano') && has('Skill_Loop')) return; // 火山期间一直是施法循环
      if (on('rain') && has('Skill_1_Loop')) return chibi.anim('Skill_1_Loop', false, 'Skill_1_Idle');
      if (on('echo') && has('Skill_3_Loop')) return chibi.anim('Skill_3_Loop', false, 'Skill_3_Idle');
      chibi.anim('Attack', false, 'Idle');
    }
    function chibiSkill(id) {
      if (!chibi || !chibi.ready) return;
      if (!medic && id === 'volcano' && has('Skill_Start')) chibi.anim('Skill_Start', false, 'Skill_Loop');
      else if (medic && id === 'rain' && has('Skill_1_Begin')) chibi.anim('Skill_1_Begin', false, 'Skill_1_Idle');
      else if (medic && id === 'shield' && has('Skill_2')) chibi.anim('Skill_2', false, 'Idle');
      else if (medic && id === 'echo' && has('Skill_3_Begin')) chibi.anim('Skill_3_Begin', false, 'Skill_3_Idle');
    }
    function chibiSkillEnd() {
      if (!chibi || !chibi.ready) return;
      if (!medic && has('Skill_End') && S().id === 'volcano') chibi.anim('Skill_End', false, 'Idle');
      else if (medic && S().id === 'echo' && has('Skill_3_End')) chibi.anim('Skill_3_End', false, 'Idle');
      else chibi.anim('Idle');
    }

    /* ---------------- 一步模拟 ---------------- */
    function spawnTick(dt) {
      const s = S();
      // 「火山」「火山回响」：技力快满时来一大波，技能中途再来一波——看清“同时向 6 名敌人投下熔岩”
      if (s.id === 'volcano' || s.id === 'echo') {
        // 重装走得慢：提前 14 秒放出一长串，技能期间陆续进入范围
        if (!active && !surge && sp >= s.cost - 14) { surge = 1; warnT = 3.2; pending.push(...scen.surge, ...(scen.surge2 || [])); say('大批敌人接近——', 'w'); }
      }
      pendCd -= dt;
      if (pending.length && pendCd <= 0) { const [k, l] = pending.shift(); spawn(k, l); pendCd = 0.42; }
      spawnCd -= dt;
      if (spawnCd <= 0 && foes.length < 26) { const [k, l] = scen.seq[waveI++ % scen.seq.length]; spawn(k, l); spawnCd = rnd(scen.gap[0], scen.gap[1]); }
    }
    function foesTick(dt) {
      for (const e of foes) {
        if (e.dead) { e.dead += dt; continue; }
        e.born += dt;
        e.hitT = Math.max(0, e.hitT - dt);
        e.resDown = Math.max(0, e.resDown - dt);
        e.lunge = Math.max(0, e.lunge - dt);
        e.knock = Math.max(0, (e.knock || 0) - dt);
        let move = true;
        if (medic && !e.d.fly) {
          // 被挡住：停下来打挡住它的人；远程敌人射程里有友军就停下来攻击
          if (e.blockedBy && e.blockedBy.down) e.blockedBy = null;
          if (!e.blockedBy && e.seg === 0) {
            const a = allies.find((o) => !o.down && o.lane === e.lane && e.x > o.x - 0.05 && e.x - o.x <= 0.6);
            if (a) { const n = foes.filter((o) => !o.dead && o.blockedBy === a).length; if (n < a.block) { e.blockedBy = a; tip('block', `<b>阻挡</b>：近卫挡 2 名、重装挡 3 名<br>被挡住的敌人停下来攻击他们——医疗的活就来了`, () => [a.x, a.y - 0.9]); } }
          }
          let target = e.blockedBy;
          if (!target && e.d.range) target = allies.find((o) => !o.down && Math.hypot(o.x - e.x, o.y - e.y) <= e.d.range) || null;
          if (target) {
            if (e.blockedBy) move = false;
            e.cd -= dt;
            if (e.cd <= 0) { e.cd = e.d.iv; e.lunge = 0.18; enemyAttack(e, target); if (!e.blockedBy) e.stop = 0.5; }
          }
          if (e.stop > 0) { e.stop -= dt; move = false; }
        }
        if (move) {
          e.walk += dt * e.d.spd * 7;
          if (advance(e, e.d.spd * dt)) { e.dead = 0.001; e.leak = true; stat.leaks++; say(`漏过 1 名${e.d.name}`, 'w'); ring(0.5, 2.5, 0.62, 'rgba(90,150,255,', 0.6, 2.2); ring(0.5, 2.5, 0.4, 'rgba(255,80,90,', 0.45, 1.6); }
        }
      }
      foes = foes.filter((e) => !e.dead || e.dead < 0.6);
    }
    function enemyAttack(e, a) {
      if (e.d.range && !e.blockedBy) {
        shots.push({ kind: 'efire', a, e, x: e.x - 0.2, y: e.y + e.dy - 0.7, t: 0, dur: 0.5 });
        return;
      }
      hurtAlly(a, e, e.d.atk, !!e.d.arts);
      // 深池逐火战士：站在燃烧的芦苇丛 1.5 格以内时，攻击附带等同攻击力的灼燃损伤
      if (e.d.burn && scen.reeds && REEDS.some(([i, j]) => Math.hypot(i + 0.5 - e.x, j + 0.5 - e.y) <= 1.5)) {
        burnAlly(a, e.d.atk * e.d.burn);
        tip('burn', `<b>灼燃损伤</b>积满 1000 就会爆发：<br>1200 点法术伤害，10 秒内法术抗性 −20`, () => [a.x, a.y - 0.95]);
      }
      for (let i = 0; i < 3; i++) part({ x: a.x + 0.22, y: a.y - 0.2, vx: rnd(-0.6, 0.6), vy: rnd(-1, -0.3), max: 0.25, s0: 0.18, s1: 0.05, spr: e.d.arts ? SP.violet : SP.white, add: false, a: 0.9 });
    }
    function hurtAlly(a, e, atk, arts) {
      if (a.down) return;
      const res = Math.max(0, a.res - (a.burnT > 0 ? 20 : 0));
      const dmg = arts ? artsVs(atk, res) : physVs(atk, a.def);
      a.hp -= dmg; a.hurt = 0.18;
      num(a.x - 0.26, a.y - 0.3, Math.round(dmg), arts ? '#a869e0' : '#5a6480', -1);
    }
    function burnAlly(a, amt) {
      if (a.down || a.burnT > 0) return;
      let el = amt * (1 - (inRange(a.x, a.y) ? M.elemCut * t2mul() : 0));
      if (barrier && inRange(a.x, a.y)) {
        const ab = Math.min(barrier.pool, el); barrier.pool -= ab; barrier.absorbed += ab; el -= ab; stat.absorb += ab;
        if (ab > 0) { num(a.x - 0.25, a.y - 0.8, '屏障 ' + Math.round(ab), '#5b95e0'); a.shieldHit = 0.3; }
      }
      a.elem += el;
      for (let i = 0; i < 4; i++) part({ x: a.x, y: a.y - 0.1, vx: rnd(-1, 1), vy: rnd(-1.6, -0.4), ay: 2, max: rnd(0.3, 0.5), s0: 0.14, spr: SP.ember, add: true, a: 0.8 });
    }
    function alliesTick(dt) {
      elemAspd = false;
      for (const a of allies) {
        a.flash = Math.max(0, a.flash - dt);
        a.swing = Math.max(0, a.swing - dt);
        a.hurt = Math.max(0, a.hurt - dt);
        a.shieldHit = Math.max(0, a.shieldHit - dt);
        if (a.down) { a.down -= dt; if (a.down <= 0) { a.down = 0; a.hp = allyMaxHp(a); a.elem = 0; a.burnT = 0; a.hot = []; say(`${a.name} 再部署`, ''); } continue; }
        if (a.burnT > 0) { a.burnT -= dt; if (Math.random() < dt * 14) part({ x: a.x + rnd(-0.2, 0.2), y: a.y - rnd(0, 0.3), vy: rnd(-1.4, -0.7), max: rnd(0.4, 0.7), s0: rnd(0.1, 0.18), s1: 0.02, spr: pick([SP.ember, SP.red]), add: true, a: 0.85 }); }
        if (a.elem > 1 && inRange(a.x, a.y)) elemAspd = true;
        a.cd -= dt;
        if (a.cd <= 0) {
          a.cd = a.iv;
          const e = foes.find((o) => !o.dead && o.blockedBy === a);
          if (e) {
            const dmg = physVs(a.atk, e.d.def);
            e.hp -= dmg; e.hitT = 0.12; a.swing = 0.22;
            num(e.x, e.y + e.dy - 0.55, fmt(dmg), '#f4f7ff');
            if (e.hp <= 0) kill(e);
          }
        }
        // 氤氲：每秒一跳
        for (const h of a.hot) {
          h.left -= dt; h.tick -= dt;
          if (h.tick <= 0) { h.tick += 1; healAmt(a, h.h, h.e, false); }
        }
        if (a.hot.length && a.hot.some((h) => h.left <= 0)) a.hot = a.hot.filter((h) => h.left > 0);
        // 无声润物：范围内全体友方每秒回复元素损伤
        if (on('rain') && inRange(a.x, a.y) && a.burnT <= 0) { const el = Math.min(a.elem, atkNow() * S().v.e / 100 * dt); a.elem -= el; logHeal(el, true); }
        // 灼燃积满：爆发——1200 点法术伤害，10 秒内法抗 −20，期间不再积累
        if (a.elem >= 1000) {
          a.elem = 0; a.burnT = 10;
          const dmg = artsVs(1200, Math.max(0, a.res - 20));
          a.hp -= dmg;
          stat.bursts++;
          const fx = FXS();
          if (fx) { const [bx, by] = vp(a.x, a.y); fx.flame(bx, by); }
          ring(a.x, a.y, 0.8, 'rgba(255,120,40,', 0.55, 3);
          bigNum(a.x, a.y - 0.8, `灼燃爆发 −${fmt(dmg)}`, 'rgb(255,120,50)', 18);
          say(`<b>${a.name}</b> 灼燃爆发 −${fmt(dmg)}`, 'w');
          kick(3);
        }
        a.hp = Math.min(a.hp, allyMaxHp(a));
        if (a.hp <= 0) { a.down = 10; a.hp = 0; stat.downs++; num(a.x, a.y - 0.6, '撤退', '#ff5d6c', true); say(`<b>${a.name}</b> 撤退（演示中 10 秒后再部署）`, 'w'); foes.forEach((e) => { if (e.blockedBy === a) e.blockedBy = null; }); }
      }
    }
    function step(dt) {
      t += dt;
      const s = S();
      // 技力：自动回复 1/秒；技能持续期间不回复；点燃按层充能
      if (!active) {
        if (s.id === 'ignite') {
          if (charges < s.v.c) { sp += dt; if (sp >= s.cost) { sp -= s.cost; charges++; } } else sp = s.cost;
        } else sp = Math.min(s.cost, sp + dt);
      }
      fullFor = !active && sp >= s.cost ? fullFor + dt : 0;
      if (active) { active.left -= dt; if (active.left <= 0) endSkill(); }
      // 自动触发的技能（技力满了就自己放）不受「自动释放」开关影响
      if (canCast() && (s.trig === '自动触发' || (auto && wantCast()))) cast();
      if (barrier) {
        barrier.left -= dt;
        if (barrier.left <= 0 || barrier.pool <= 0) { say(`屏障消散 · 共吸收 <b>${fmt(barrier.absorbed)}</b>`, 's'); barrier = null; }
      }
      spawnTick(dt);
      foesTick(dt);
      alliesTick(dt);

      // 干员出手
      atkCd -= dt;
      if (atkCd <= 0) {
        const did = medic ? medicAttack() : casterAttack();
        atkCd = did ? interval() : 0.1;
      }

      // 弹道
      for (const sh of shots) {
        sh.t += dt;
        if (sh.t < 0) continue;
        if ((sh.kind === 'orb' || sh.kind === 'heal' || sh.kind === 'efire') && Math.random() < 0.7) {
          const [x, y] = shotPos(sh, clamp(sh.t / sh.dur, 0, 1));
          part({ x, y, vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), max: rnd(0.2, 0.35), s0: sh.kind === 'heal' ? 0.13 : 0.1, s1: 0.02, spr: sh.kind === 'heal' ? (sh.echo ? pick([SP.pink, SP.sky, SP.gold, SP.mint]) : SP.mint) : sh.kind === 'efire' ? SP.violet : sh.twin ? SP.gold : SP.pink, add: !(medic && sh.kind === 'heal'), a: 0.8 });
        }
        if (sh.t >= sh.dur && !sh.done) {
          sh.done = true;
          if (sh.kind === 'heal') {
            healAmt(sh.a, sh.h, sh.e);
            if (sh.echo) { const fx = FXS(); if (fx) { const [a, b] = vp(sh.a.x, sh.a.y); fx.heal(a, b, true); } }
          } else if (sh.kind === 'efire') {
            if (!sh.a.down) hurtAlly(sh.a, sh.e, sh.e.d.atk, true);
          } else landShot(sh);
        }
      }
      if (shots.some((sh) => sh.done)) shots = shots.filter((sh) => !sh.done);

      // 粒子、数字、环、地面痕迹
      for (const p of parts) { p.t += dt; p.vy += p.ay * dt; p.x += (p.vx + (p.sw ? Math.cos(p.t * 2 + p.ph) * p.sw : 0)) * dt; p.y += p.vy * dt; }
      if (parts.length && parts.some((p) => p.t >= p.max)) parts = parts.filter((p) => p.t < p.max);
      for (const n of nums) n.t += dt;
      if (nums.length && nums[0].t >= 1.1) nums = nums.filter((n) => n.t < 1.1);
      for (const r of rings) r.t += dt;
      if (rings.length && rings.some((r) => r.t >= r.dur)) rings = rings.filter((r) => r.t < r.dur);
      for (const d of decals) d.t += dt;
      if (decals.length && decals[0].t >= 5) decals = decals.filter((d) => d.t < 5);
      comboT -= dt; if (comboT <= 0 && !active) combo = 0;
      // 小羊偶尔叫一声
      if ((sheepT -= dt) <= 0) { sheepT = rnd(10, 18); sheepHop = 0.5; num(SHEEP[0] + 0.1, SHEEP[1] - 0.75, '咩～', medic ? '#7d86a8' : '#ffb0c8', -1); }
      if (sheepHop > 0) sheepHop -= dt;

      // 火山期间：地面发烫、脚下喷出火星、灰烬落下；火山回响期间：整张地图泛起白光
      heat += ((on('volcano') ? 1 : 0) - heat) * Math.min(1, dt * 2.5);
      pale += ((on('echo') ? 1 : 0) - pale) * Math.min(1, dt * 2.5);
      crackT += dt;
      if (on('volcano')) {
        if (Math.random() < dt * 30) part({ x: OP[0] + 0.5 + rnd(-0.35, 0.35), y: OP[1] + 0.6, vx: rnd(-0.4, 0.4), vy: rnd(-2.6, -1.2), max: rnd(0.6, 1.1), s0: rnd(0.08, 0.16), s1: 0.02, spr: pick([SP.ember, SP.gold]) });
        if (Math.random() < dt * 16) part({ x: rnd(0, COLS), y: rnd(-0.6, 1), vx: rnd(-0.1, 0.25), vy: rnd(0.35, 0.7), max: rnd(3, 5), s0: rnd(0.05, 0.1), s1: 0.03, spr: SP.ash, add: false, a: 0.9, sw: 0.25, ph: rnd(0, TAU) });
      }
      // 环境：熔岩池冒火星 / 纯烬的灰羽飘过
      if (!medic) { if (Math.random() < dt * 3) { const v = pick([[0, 0], [0, 4], [9, 0], [9, 2], [9, 4]]); part({ x: v[0] + rnd(0.25, 0.75), y: v[1] + rnd(0.3, 0.7), vx: rnd(-0.1, 0.1), vy: rnd(-0.9, -0.4), max: rnd(0.8, 1.4), s0: rnd(0.05, 0.09), s1: 0.01, spr: pick([SP.ember, SP.gold]) }); } }
      else if (Math.random() < dt * 1.6) part({ x: rnd(-0.5, COLS), y: -0.4, vx: rnd(0.05, 0.3), vy: rnd(0.25, 0.45), max: rnd(6, 9), s0: rnd(0.06, 0.1), s1: 0.05, spr: SP.mist, add: false, a: 0.85, sw: 0.3, ph: rnd(0, TAU) });
      if (scen.reeds && Math.random() < dt * 5) { const [i, j] = pick(REEDS); part({ x: i + rnd(0.2, 0.8), y: j + rnd(0.2, 0.6) - E / TH, vx: rnd(-0.1, 0.2), vy: rnd(-1, -0.5), max: rnd(0.6, 1.1), s0: rnd(0.05, 0.1), s1: 0.01, spr: pick([SP.ember, SP.gold]), add: false, a: 0.9 }); }
      // 无声润物：范围里下起细雨
      if (on('rain') && Math.random() < dt * 40) {
        const arr = [...RS.n], cl = arr[(Math.random() * arr.length) | 0].split(',').map(Number);
        drops.push({ x: cl[0] + rnd(0.1, 0.9), y: cl[1] + rnd(0.2, 0.9) - hy(cl[0], cl[1]) / TH, t: 0, fall: 0.32 });
      }
      for (const d of drops) d.t += dt;
      if (drops.length && drops[0].t >= drops[0].fall + 0.5) drops = drops.filter((d) => d.t < d.fall + 0.5);
      if (hitLeft > 0 && (hitLeft -= dt) <= 0) hit.classList.remove('on');
      if (warnT > 0) warnT -= dt;

      // 曲线：每 0.5 秒收一格
      if (!bNow || t - bNow.t0 >= BK) {
        if (bNow) { bucks.push(bNow); if (bucks.length > NB) bucks.shift(); }
        bNow = { t0: t, v: 0, e: 0, sk: active || barrier ? skillIdx + 1 : 0 };
      } else if (active || barrier) bNow.sk = skillIdx + 1;
    }
    function shotPos(sh, k) {
      const tgt = sh.kind === 'heal' || sh.kind === 'efire' ? sh.a : sh.e;
      const tx = tgt.x, ty = sh.kind === 'heal' || sh.kind === 'efire' ? tgt.y - 0.3 : tgt.y + tgt.dy - tgt.z - 0.3;
      return [sh.x + (tx - sh.x) * k, sh.y + (ty - sh.y) * k - Math.sin(Math.PI * k) * (sh.kind === 'heal' ? 0.5 : sh.kind === 'efire' ? 0.3 : 0.25)];
    }

    /* ---------------- 画 ---------------- */
    function spr(img, x, y, s, a = 1) { g.globalAlpha = a; g.drawImage(img, px(x) - (s * T) / 2, py(y) - (s * T) / 2, s * T, s * T); }
    function drawEnv(now) {
      if (!medic && pitSpr) {
        g.globalCompositeOperation = 'lighter';
        const PITS = [[0, 0], [0, 4], [9, 0], [9, 2], [9, 4]];
        for (let k = 0; k < PITS.length; k++) {
          const [i, j] = PITS[k], s = T * 1.1 * (0.92 + 0.08 * Math.sin(now * 1.7 + k * 1.3));
          g.globalAlpha = 0.45 + 0.25 * Math.sin(now * 2.3 + k) + heat * 0.35;
          g.drawImage(pitSpr, px(i + 0.5) - s / 2, py(j + 0.5) - (s * SQ) / 2, s, s * SQ);
        }
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      }
      if (scen.reeds && flameSpr.length) {
        for (let k = 0; k < REEDS.length; k++) {
          const [i, j] = REEDS[k];
          for (let n = 0; n < 3; n++) {
            const fx = px(i + 0.22 + n * 0.28), fy = py(j + 0.7) - E, fr = flameSpr[((now * 9 + n * 1.7 + k) | 0) % 3];
            const h = T * (0.46 + 0.1 * Math.sin(now * 7 + n + k * 2)), w = h * 0.6;
            g.globalAlpha = 0.9; g.drawImage(fr, fx - w / 2, fy - h, w, h);
          }
        }
        g.globalAlpha = 1;
      }
    }
    function drawRange(now) {
      const img = on('volcano') || on('echo') ? rangeCv.s : rangeCv.n;
      if (!img) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = (on('volcano') ? 0.95 : 0.7) + 0.2 * Math.sin(now * 2.6);
      g.drawImage(img, 0, 0);
      g.globalAlpha = 1;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function drawHeat(now) {
      if (heat > 0.01) {
        // 天色暗下来：整张地图压暗、泛红，只剩熔岩在发光
        g.globalAlpha = heat * 0.5; g.fillStyle = '#1a0406';
        g.fillRect(0, 0, W, H);
        g.globalAlpha = heat * 0.18; g.fillStyle = '#ff3a10';
        g.fillRect(px(0), py(0) - E, T * COLS, TH * ROWS + E);
        g.globalAlpha = 1;
        if (crackCv) {
          // 裂缝从她脚下向外蔓延
          const cx = px(OP[0] + 0.5), cy = py(OP[1] + 0.5), rad = T * 4.2 * clamp(crackT / 0.7, 0, 1);
          g.save();
          g.beginPath(); g.ellipse(cx, cy, Math.max(1, rad), Math.max(1, rad * 0.8), 0, 0, TAU); g.clip();
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = heat * (0.65 + 0.3 * Math.sin(now * 5));
          g.drawImage(crackCv, 0, 0);
          g.restore();
        }
      }
      if (pale > 0.01) {
        g.globalAlpha = pale * (0.2 + 0.05 * Math.sin(now * 2));
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, W, H);
        g.globalAlpha = 1;
      }
    }
    function drawDecals() {
      for (const d of decals) {
        const w = T * 0.95 * d.s, h = w * 0.5, x = px(d.x) - w / 2, y = py(d.y) - h / 2;
        if (d.t < 1.4) {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = (1 - d.t / 1.4) * 0.95;
          g.drawImage(SP.pool, x, y, w, h);
          g.globalCompositeOperation = 'source-over';
        }
        g.globalAlpha = Math.min(1, d.t / 0.4) * (1 - Math.max(0, (d.t - 3) / 2)) * 0.7;
        g.drawImage(SP.scorch, x, y, w, h);
      }
      g.globalAlpha = 1;
    }
    /** 大波敌人来袭：两个入口闪红光、打出警示 */
    function drawWarn(now) {
      if (warnT <= 0) return;
      const a = Math.min(1, warnT / 0.6) * (0.55 + 0.45 * Math.sin(now * 12));
      for (const j of [1, 3]) {
        const x = px(9.5), y = py(j + 0.5);
        g.globalCompositeOperation = medic ? 'source-over' : 'lighter'; g.globalAlpha = a * 0.8;
        g.drawImage(SP.red, x - T * 0.9, y - TH * 0.9, T * 1.8, TH * 1.8);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = a;
        g.fillStyle = '#ff3b4f'; g.beginPath(); g.moveTo(x, y - TH * 0.62); g.lineTo(x + T * 0.17, y - TH * 0.3); g.lineTo(x - T * 0.17, y - TH * 0.3); g.closePath(); g.fill();
        g.fillStyle = '#fff'; g.font = `900 ${Math.max(10, T * 0.13)}px "JetBrains Mono", monospace`; g.textAlign = 'center'; g.fillText('!', x, y - TH * 0.34);
      }
      g.globalAlpha = 1;
    }
    function drawLaneFlow(now) {
      // 路线上一小段流动的高光：看得出敌人从哪边来
      g.globalCompositeOperation = medic ? 'source-over' : 'lighter';
      for (const j of [1, 3]) {
        const k = ((now * 0.18 + j * 0.3) % 1), x = px(9.5 - k * 9), y = py(j + 0.5);
        g.globalAlpha = 0.35 * Math.sin(k * Math.PI);
        g.drawImage(medic ? SP.sky : SP.red, x - T * 0.8, y - T * 0.3, T * 1.6, T * 0.6);
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    function drawAura(now) {
      const cx = px(OP[0] + 0.5), cy = py(OP[1] + 0.74) - E;
      if (on('volcano')) {
        g.globalCompositeOperation = 'lighter';
        const s = T * (1.7 + 0.18 * Math.sin(now * 6));
        g.globalAlpha = 0.6; g.drawImage(SP.ember, cx - s / 2, cy - s / 2, s, s);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      }
      if (on('chant')) runeRing(cx, cy, T * 0.62, now, casts >= 2 ? 'rgba(255,110,60,' : 'rgba(255,190,110,');
      if (on('rain') || on('echo')) {
        const s = T * (1.3 + 0.1 * Math.sin(now * 2));
        g.globalAlpha = 0.6; g.drawImage(on('rain') ? SP.sky : SP.white, cx - s / 2, cy - s / 2, s, s); g.globalAlpha = 1;
        if (on('echo')) runeRing(cx, cy, T * 0.55, now * 0.6, 'rgba(255,170,210,');
      }
      if (deployT < 1.2) {
        // 部署：脚下一圈光
        const k = deployT / 1.2;
        g.globalCompositeOperation = medic ? 'source-over' : 'lighter';
        g.strokeStyle = medic ? `rgba(90,150,230,${1 - k})` : `rgba(255,140,190,${1 - k})`; g.lineWidth = 3 * (1 - k) + 1;
        g.beginPath(); g.ellipse(cx, cy, T * (0.3 + k * 0.7), T * (0.12 + k * 0.28), 0, 0, TAU); g.stroke();
        g.globalCompositeOperation = 'source-over';
      }
    }
    /** 地面上的法阵（压扁的圆，像画在地上） */
    function runeRing(cx, cy, r, now, col) {
      g.save();
      g.translate(cx, cy); g.scale(1, 0.42);
      g.strokeStyle = col + '0.85)'; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
      g.lineWidth = 1; g.beginPath(); g.arc(0, 0, r * 0.8, 0, TAU); g.stroke();
      g.rotate(now * 0.9);
      g.beginPath();
      for (let tri = 0; tri < 2; tri++) for (let k = 0; k <= 3; k++) { const a = -Math.PI / 2 + tri * Math.PI + (k * TAU) / 3; const x = Math.cos(a) * r * 0.78, y = Math.sin(a) * r * 0.78; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      g.restore();
    }
    function bar(x, y, w, v, color, back = 'rgba(0,0,0,.5)', h = 4) {
      g.fillStyle = back; g.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
      g.fillStyle = color; g.fillRect(x - w / 2, y, w * clamp(v, 0, 1), h);
    }
    function drawShadowOf(x, y, w) {
      const h = w * 0.34;
      g.drawImage(medic ? SP.shadowL : SP.shadow, x - w / 2, y - h / 2, w, h);
    }
    function drawFoe(e) {
      const sp_ = foeSpr[e.key];
      if (!sp_) return;
      const d = e.d, r = T * d.r;
      const x = px(e.x) + (e.lunge > 0 ? -Math.sin((e.lunge / 0.18) * Math.PI) * r * 0.3 : 0) + (e.knock > 0 ? Math.sin(e.knock * 60) * 2 : 0);
      const gy = py(e.y + e.dy + 0.16);
      const a = e.dead ? 1 - e.dead / 0.6 : Math.min(1, e.born / 0.35);
      const z = e.z * T + (d.fly ? Math.sin(t * 3 + e.bob) * T * 0.04 : 0);
      const bob = d.fly ? 0 : Math.abs(Math.sin(e.walk * Math.PI)) * -T * 0.012;
      const fr = sp_.list[d.fly ? ((t * 24) | 0) % 3 : (e.blockedBy || e.stop > 0 ? 0 : (e.walk | 0) & 1)];
      // 脚下的影子
      g.globalAlpha = a * (d.fly ? 0.55 : 0.9);
      drawShadowOf(x, gy, r * (d.fly ? 1.9 : 2.3));
      g.globalAlpha = a;
      const S_ = sp_.S, top = gy - z - S_ * sp_.ay + bob;
      if (e.dead && e.leak) { g.globalAlpha = a * 0.8; g.drawImage(fr.n, x - S_ / 2, top, S_, S_); g.globalAlpha = 1; return; } // 漏过去的：直接淡出
      if (e.dead) {
        g.save(); g.translate(x, gy - z); g.scale(1 + e.dead * 0.6, 1 - e.dead * 1.3);
        g.drawImage(fr.w, -S_ / 2, -S_ * sp_.ay, S_, S_); g.restore();
        g.globalAlpha = 1;
        return;
      }
      g.drawImage(fr.n, x - S_ / 2, top, S_, S_);
      if (e.hitT > 0) { g.globalAlpha = a * 0.6 * (e.hitT / 0.14); g.drawImage(fr.w, x - S_ / 2, top, S_, S_); }
      g.globalAlpha = 1;
      if (e.resDown > 0) {
        g.strokeStyle = 'rgba(255,120,40,.9)'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(x, gy, r * 1.25, r * 0.38, 0, 0, TAU); g.stroke();
      }
      // 血条（精英带徽记）
      const bw = T * (d.rank ? 0.62 : 0.48), by = gy - z - d.top * r - 8;
      bar(x, by, bw, e.hp / e.hpMax, d.rank ? '#ffae3d' : '#ff4d6a', medic ? 'rgba(30,36,60,.35)' : 'rgba(0,0,0,.55)');
      if (d.rank && badge) { const bs = badge.width / dpr; g.drawImage(badge, x - bw / 2 - bs - 1, by - bs / 2 + 2, bs, bs); }
      if (e.resDown > 0) { g.fillStyle = '#ff9a3d'; g.font = `800 ${Math.max(9, T * 0.09)}px "JetBrains Mono", monospace`; g.textAlign = 'left'; g.fillText('RES↓', x + bw / 2 + 3, by + 5); }
      if (e.blockedBy) { g.strokeStyle = 'rgba(80,140,255,.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - r * 0.9, gy + 2); g.lineTo(x - r * 0.9, gy - r * 1.6); g.stroke(); }
    }
    function drawAlly(a) {
      const s = allySpr[a.kind];
      if (!s) return;
      const x = px(a.x), gy = py(a.y + 0.16);
      g.globalAlpha = a.down ? 0.3 : 0.9; drawShadowOf(x, gy, s.r * 2.4); g.globalAlpha = a.down ? 0.25 : 1;
      const lunge = a.swing > 0 ? Math.sin((a.swing / 0.22) * Math.PI) * T * 0.07 : 0;
      const fr = a.swing > 0.08 ? s.frames[1] : s.frames[0];
      const top = gy - s.S * 0.74;
      g.drawImage(fr, x - s.S / 2 + lunge, top, s.S, s.S);
      if (a.flash > 0 && !a.down) { g.globalAlpha = (a.flash / 0.35) * 0.55; g.drawImage(s.lit, x - s.S / 2 + lunge, top, s.S, s.S); g.globalAlpha = 1; } // 受到治疗：淡淡一层绿光
      if (a.hurt > 0) { g.globalAlpha = 0.5 * a.hurt / 0.18; g.drawImage(s.w, x - s.S / 2 + lunge, top, s.S, s.S); }
      g.globalAlpha = 1;
      if (a.down) {
        g.fillStyle = C.text; g.font = `700 ${Math.max(10, T * 0.12)}px "Noto Sans SC", sans-serif`; g.textAlign = 'center';
        g.fillText('再部署 ' + Math.ceil(a.down) + 's', x, gy + T * 0.3);
        return;
      }
      // 氤氲：一层一圈淡绿色的雾
      for (let i = 0; i < a.hot.length; i++) {
        const k = (t * 0.6 + i / 3) % 1;
        g.globalAlpha = 0.45 * (1 - k); g.strokeStyle = '#3fcf85'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(x, gy, T * (0.3 + k * 0.25), T * (0.08 + k * 0.06), 0, 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
      if (barrier && inRange(a.x, a.y) && bubble) {
        const B = T * 1.3 * (1 + (a.shieldHit ? a.shieldHit * 0.3 : 0));
        g.globalAlpha = (0.45 + 0.4 * barrier.pool / barrier.max) * (0.9 + 0.1 * Math.sin(t * 4)) + (a.shieldHit ? 0.3 : 0);
        g.drawImage(bubble, x - B / 2, gy - T * 0.45 - B / 2, B, B);
        g.globalAlpha = 1;
      }
      const by = gy - s.r * 2.4 - 12;
      bar(x, by, T * 0.62, a.hp / allyMaxHp(a), '#34c878', 'rgba(30,40,70,.3)');
      if (a.burnT > 0) bar(x, by + 6, T * 0.62, a.burnT / 10, '#ff5a2a', 'rgba(30,40,70,.15)', 3);
      else bar(x, by + 6, T * 0.62, a.elem / 1000, '#ff8a2c', 'rgba(30,40,70,.15)', 3);
      if (a.hot.length) { g.fillStyle = '#34c878'; for (let i = 0; i < a.hot.length; i++) g.fillRect(x + T * 0.34 + i * 5, by - 1, 3, 10); }
      g.fillStyle = C.text; g.globalAlpha = 0.8; g.font = `700 ${Math.max(10, T * 0.105)}px "Noto Sans SC", sans-serif`; g.textAlign = 'center';
      g.fillText(a.name + (a.burnT > 0 ? ' · 灼燃' : ''), x, gy + T * 0.3); g.globalAlpha = 1;
    }
    function drawSheep(now) {
      if (!sheepSpr) return;
      const x = px(SHEEP[0]), y = py(SHEEP[1]) - E;
      const hop = (on('volcano') || on('echo') ? Math.abs(Math.sin(now * 7)) * T * 0.08 : sheepHop > 0 ? Math.sin((sheepHop / 0.5) * Math.PI) * T * 0.1 : Math.abs(Math.sin(now * 1.3)) * T * 0.012);
      g.globalAlpha = 0.8; drawShadowOf(x, y, sheepSpr.S * 0.7); g.globalAlpha = 1;
      g.drawImage(sheepSpr.img, x - sheepSpr.S / 2, y - sheepSpr.S * 0.8 - hop, sheepSpr.S, sheepSpr.S);
      if (!medic && heat > 0.05) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = heat * 0.6; g.drawImage(SP.ember, x - T * 0.25, y - T * 0.35 - hop, T * 0.5, T * 0.5); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    }
    function drawShots() {
      g.globalCompositeOperation = 'lighter';
      for (const sh of shots) {
        if (sh.t < 0) continue;
        const k = clamp(sh.t / sh.dur, 0, 1);
        if (sh.kind === 'lava') {
          if (sh.fx) continue; // 全屏特效层画了
          const kk = k * k, x = sh.x + (sh.tx - sh.x) * kk, y = sh.y + (sh.ty - sh.y) * kk;
          spr(SP.ember, x, y, 0.5); spr(SP.gold, x, y, 0.2);
          continue;
        }
        if (sh.kind === 'ignite' && sh.fx) continue;
        const [x, y] = shotPos(sh, k);
        if (sh.kind === 'heal') {
          g.globalCompositeOperation = medic ? 'source-over' : 'lighter';
          spr(sh.echo ? SP.white : SP.mint, x, y, 0.42, 0.9); spr(SP.white, x, y, 0.16);
          g.globalCompositeOperation = 'lighter';
        } else if (sh.kind === 'efire') { g.globalCompositeOperation = 'source-over'; spr(SP.violet, x, y, 0.4, 0.9); spr(SP.white, x, y, 0.12); g.globalCompositeOperation = 'lighter'; }
        else if (sh.kind === 'ignite') { spr(SP.ember, x, y, 0.7); spr(SP.gold, x, y, 0.25); }
        else if (sh.twin) {
          const a = sh.t * 40, r = 0.1;
          spr(SP.gold, x + Math.cos(a) * r, y + Math.sin(a) * r, 0.3); spr(SP.pink, x - Math.cos(a) * r, y - Math.sin(a) * r, 0.3);
        } else { spr(SP.pink, x, y, 0.36); spr(SP.white, x, y, 0.1); }
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    function drawParts() {
      for (const pass of [false, true]) {
        g.globalCompositeOperation = pass ? 'lighter' : 'source-over';
        for (const p of parts) {
          if (p.add !== pass) continue;
          const k = p.t / p.max, s = (p.s0 + (p.s1 - p.s0) * k) * T;
          g.globalAlpha = p.a * (1 - k * k) * Math.min(1, p.t * 8);
          g.drawImage(p.spr, px(p.x) - s / 2, py(p.y) - s / 2, s, s);
        }
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      if (drops.length) {
        g.strokeStyle = medic ? 'rgba(90,140,210,.7)' : 'rgba(200,220,255,.7)'; g.lineWidth = 1.2;
        g.beginPath();
        for (const d of drops) {
          if (d.t >= d.fall) continue;
          const k = d.t / d.fall, y = py(d.y) - (1 - k) * T * 0.7, x = px(d.x) - (1 - k) * T * 0.06;
          g.moveTo(x, y - T * 0.12); g.lineTo(x + T * 0.012, y);
        }
        g.stroke();
        for (const d of drops) {
          if (d.t < d.fall) continue;
          const k = (d.t - d.fall) / 0.5;
          g.globalAlpha = 0.6 * (1 - k);
          g.beginPath(); g.ellipse(px(d.x), py(d.y), T * (0.04 + k * 0.16), T * (0.015 + k * 0.05), 0, 0, TAU); g.stroke();
        }
        g.globalAlpha = 1;
      }
    }
    function drawRings() {
      for (const r of rings) {
        const k = r.t / r.dur;
        g.strokeStyle = r.color + ((1 - k) * 0.9).toFixed(3) + ')';
        g.lineWidth = Math.max(1.5, T * 0.05 * (1 - k) * r.w);
        const rr = T * r.r * (0.3 + 0.7 * (1 - Math.pow(1 - k, 3)));
        g.beginPath(); g.ellipse(px(r.x), py(r.y), rr, rr * r.flat, 0, 0, TAU); g.stroke();
      }
    }
    function drawNums() {
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.lineWidth = 3; g.strokeStyle = medic ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.65)';
      for (const n of nums) {
        const k = n.t / 1.1;
        const pop = k < 0.12 ? 0.7 + (k / 0.12) * 0.45 : 1.15 - Math.min(0.15, (k - 0.12) * 0.6);
        g.globalAlpha = 1 - Math.max(0, (k - 0.6) / 0.4);
        const fs = Math.round(Math.max(10, T * (n.big === -1 ? 0.105 : n.big ? 0.2 : 0.14)) * pop);
        g.font = `900 ${fs}px "JetBrains Mono", monospace`;
        const x = px(n.x), y = py(n.y) - k * T * 0.45;
        g.strokeText(n.text, x, y); g.fillStyle = n.color; g.fillText(n.text, x, y);
        if (n.sub) {
          // 对照：同攻击力的物理伤害（灰色、划掉）
          g.font = `700 ${Math.max(9, fs * 0.62) | 0}px "JetBrains Mono", "Noto Sans SC", monospace`;
          const w = g.measureText(n.sub).width, sy = y + fs * 0.72;
          g.globalAlpha *= 0.9;
          g.strokeText(n.sub, x, sy); g.fillStyle = medic ? '#6b7285' : '#b9a9b0'; g.fillText(n.sub, x, sy);
          g.fillRect(x - w / 2, sy - fs * 0.2, w, 1.5);
        }
      }
      g.globalAlpha = 1;
    }
    function drawOpUI(now) {
      // 干员脚下的技力条（自动触发的「点燃」显示充能层数）
      const s = S(), x = px(OP[0] + 0.5), y = py(OP[1] + 0.95) - E;
      const w = T * 0.8;
      const v = active ? (active.left === Infinity ? 1 : active.left / s.dur) : sp / s.cost;
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x - w / 2 - 1, y - 1, w + 2, 8);
      g.fillStyle = active ? '#ffcf5a' : '#6cc3ff'; g.fillRect(x - w / 2, y, w * clamp(v, 0, 1), 6);
      if (!active && sp >= s.cost && s.id !== 'ignite') {
        g.globalAlpha = 0.5 + 0.5 * Math.sin(now * 10); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(x - w / 2 - 2.5, y - 2.5, w + 5, 11); g.globalAlpha = 1;
      }
      if (s.id === 'ignite') {
        for (let i = 0; i < s.v.c; i++) {
          const cx = x - w / 2 + 7 + i * 13, cy = y + 15;
          if (i < charges) { g.globalCompositeOperation = 'lighter'; g.drawImage(SP.ember, cx - 10, cy - 10, 20, 20); g.globalCompositeOperation = 'source-over'; }
          else { g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(cx, cy, 4, 0, TAU); g.fill(); }
        }
      }
      if (s.id === 'chant' && casts) {
        g.fillStyle = C.text; g.font = `700 ${Math.max(10, T * 0.11)}px "JetBrains Mono", monospace`; g.textAlign = 'center';
        g.fillText(`咏唱 ×${casts}`, x, y + 22);
      }
      // 技力满了：头顶浮出技能图标（和游戏里一样，点她就能放）
      if (canCast()) {
        const img = skImg[skillIdx], sz = T * 0.42, bx = x, by = py(OP[1] + 0.74) - E - T * 2.2 + Math.sin(now * 3) * T * 0.04;
        g.globalCompositeOperation = medic ? 'source-over' : 'lighter';
        g.globalAlpha = 0.55 + 0.25 * Math.sin(now * 6);
        g.drawImage(medic ? SP.sky : SP.gold, bx - sz, by - sz, sz * 2, sz * 2);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.save(); g.translate(bx, by); g.rotate(Math.PI / 4);
        g.fillStyle = medic ? '#f4f7fc' : '#2a0f18'; g.strokeStyle = medic ? '#4f9fe0' : '#ffcf5a'; g.lineWidth = 2;
        g.fillRect(-sz * 0.5, -sz * 0.5, sz, sz); g.strokeRect(-sz * 0.5, -sz * 0.5, sz, sz);
        g.restore();
        if (img && img.complete && img.naturalWidth) g.drawImage(img, bx - sz * 0.42, by - sz * 0.42, sz * 0.84, sz * 0.84);
        g.font = `800 ${Math.max(9, T * 0.09)}px "Noto Sans SC", sans-serif`; g.textAlign = 'center';
        g.lineWidth = 3; g.strokeStyle = medic ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.7)'; const label = auto ? '等待时机' : '点她释放';
        g.strokeText(label, bx, by + sz * 0.95); g.fillStyle = medic ? '#2a5fa8' : '#ffcf5a'; g.fillText(label, bx, by + sz * 0.95);
      }
    }
    let flip = [];
    function draw(now) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (mapCv) g.drawImage(mapCv, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawEnv(now);
      drawRange(now);
      drawHeat(now);
      drawLaneFlow(now);
      drawWarn(now);
      drawDecals();
      drawAura(now);
      // 部署标记：小人没载入时画；载入后淡出
      if (opTok && opFade > 0.01) {
        const x = px(OP[0] + 0.5), y = py(OP[1] + 0.74) - E + Math.sin(now * 2.4) * T * 0.02;
        g.globalAlpha = opFade;
        g.drawImage(opTok.img, x - opTok.S / 2, y - opTok.S * 1.12, opTok.S, opTok.S * 1.3);
        if (!(chibi && chibi.ready)) {
          g.strokeStyle = medic ? 'rgba(90,130,210,.8)' : 'rgba(255,170,200,.85)'; g.lineWidth = 2;
          g.beginPath(); g.arc(x, y - opTok.S * 0.6, opTok.S * 0.46, now * 3, now * 3 + 1.2); g.stroke();
        }
        g.globalAlpha = 1;
      }
      // 地面单位按纵深排序；空中单位最后画
      flip.length = 0;
      for (const e of foes) if (!e.d.fly) flip.push(e);
      for (const a of allies) flip.push(a);
      flip.sort((a, b) => (a.y + (a.dy || 0)) - (b.y + (b.dy || 0)));
      drawSheep(now);
      for (const u of flip) (u.d ? drawFoe(u) : drawAlly(u));
      for (const e of foes) if (e.d.fly) drawFoe(e);
      drawShots();
      drawParts();
      drawRings();
      drawNums();
      drawOpUI(now);
    }

    /* ---------------- 曲线（输出 / 治疗随时间） ---------------- */
    const gcv = opts.graph || null, gg = gcv ? gcv.getContext('2d') : null;
    let gW = 1, gH = 1, gdpr = 1;
    function sizeGraph() {
      if (!gcv) return;
      const r = gcv.getBoundingClientRect();
      if (!r.width) return;
      gdpr = Math.min(window.devicePixelRatio || 1, 1.5);
      gW = r.width; gH = r.height;
      gcv.width = Math.round(gW * gdpr); gcv.height = Math.round(gH * gdpr);
    }
    const GC = medic
      ? { bar: '#9fb0c8', hot: '#34c878', el: '#f0a93a', band: ['rgba(90,160,240,.12)', 'rgba(52,200,120,.14)', 'rgba(110,150,255,.14)', 'rgba(255,170,210,.18)'], text: '#6b6884', grid: 'rgba(90,100,140,.18)', line: '#d2334f' }
      : { bar: 'rgba(255,127,216,.45)', hot: '#ff7fd8', el: '#ffb35c', band: ['rgba(255,190,110,.1)', 'rgba(255,190,110,.14)', 'rgba(255,120,60,.14)', 'rgba(255,60,30,.2)'], text: '#c19aab', grid: 'rgba(255,140,170,.14)', line: '#ffd36a' };
    function drawGraph() {
      if (!gg || !gcv.width) return;
      const q = gg;
      q.setTransform(gdpr, 0, 0, gdpr, 0, 0);
      q.clearRect(0, 0, gW, gH);
      const pad = 4, top = 16, h = gH - top - 14, w = gW - pad * 2;
      const all = bucks.concat(bNow ? [bNow] : []);
      let mx = 1;
      for (const b of all) mx = Math.max(mx, (b.v + b.e) / BK);
      mx = niceMax(mx);
      q.strokeStyle = GC.grid; q.lineWidth = 1;
      for (let k = 0; k <= 2; k++) { const y = top + h - (h * k) / 2; q.beginPath(); q.moveTo(pad, y + 0.5); q.lineTo(gW - pad, y + 0.5); q.stroke(); }
      const bw = w / NB, x0 = gW - pad - all.length * bw;
      // 技能生效的时段：底色
      for (let i = 0; i < all.length; i++) { const b = all[i]; if (b.sk) { q.fillStyle = GC.band[b.sk] || GC.band[0]; q.fillRect(x0 + i * bw, top, bw + 0.5, h); } }
      for (let i = 0; i < all.length; i++) {
        const b = all[i], x = x0 + i * bw, hv = (b.v / BK / mx) * h, he = (b.e / BK / mx) * h;
        q.fillStyle = b.sk ? GC.hot : GC.bar; q.fillRect(x + 0.5, top + h - hv, Math.max(1, bw - 1), hv);
        if (he > 0) { q.fillStyle = GC.el; q.fillRect(x + 0.5, top + h - hv - he, Math.max(1, bw - 1), he); }
      }
      // 近 5 秒平均
      q.strokeStyle = GC.line; q.lineWidth = 1.5; q.beginPath();
      for (let i = 0; i < all.length; i++) {
        let s = 0, n = 0; for (let k = Math.max(0, i - 9); k <= i; k++) { s += all[k].v + all[k].e; n++; }
        const y = top + h - (s / n / BK / mx) * h, x = x0 + (i + 0.5) * bw;
        i ? q.lineTo(x, y) : q.moveTo(x, y);
      }
      q.stroke();
      // 施放标记
      q.font = '700 10px "Noto Sans SC", sans-serif'; q.textAlign = 'center';
      for (const [mt, id] of marks) {
        const age = t - mt, x = gW - pad - (age / BK) * bw;
        if (x < pad) continue;
        q.fillStyle = GC.line; q.beginPath(); q.moveTo(x, top - 1); q.lineTo(x - 4, top - 7); q.lineTo(x + 4, top - 7); q.closePath(); q.fill();
        q.fillStyle = GC.text; q.fillText((sk.find((s) => s.id === id) || {}).name || '', clamp(x, 24, gW - 24), top - 8);
      }
      q.fillStyle = GC.text; q.font = '10px "JetBrains Mono", monospace';
      q.textAlign = 'left'; q.fillText(fmtK(mx) + '/s', pad + 2, top + 9);
      q.fillText('−60s', pad + 2, gH - 2);
      q.textAlign = 'right'; q.fillText('现在', gW - pad - 2, gH - 2);
    }
    function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p; return 10 * p; }

    /* ---------------- 悬停查看：敌人 / 友军 / 她本人 ---------------- */
    let ptr = null, lastPtr = null, cardFor = null, cardT = 0, pinT = 0;
    function onMove(ev) {
      const r = host.getBoundingClientRect();
      ptr = lastPtr = [ev.clientX - r.left, ev.clientY - r.top];
      if (ev.type === 'pointerdown' && ev.pointerType !== 'mouse') pinT = 3;
      cardT = 0;
    }
    function onLeave() { ptr = null; if (pinT <= 0) hideCard(); }
    function hideCard() { card.classList.remove('on'); cardFor = null; host.classList.remove('peek'); }
    function pickUnit() {
      if (!ptr) return null;
      const [mx, my] = ptr;
      let best = null, bd = 1e9;
      for (const e of foes) {
        if (e.dead) continue;
        const r = T * e.d.r, x = px(e.x), y = py(e.y + e.dy + 0.16) - e.z * T - r * 1.1;
        const d = Math.hypot(mx - x, (my - y) * 0.8);
        if (d < Math.max(18, r * 1.5) && d < bd) { bd = d; best = e; }
      }
      for (const a of allies) { const x = px(a.x), y = py(a.y) - T * 0.3; const d = Math.hypot(mx - x, my - y); if (d < T * 0.42 && d < bd) { bd = d; best = a; } }
      if (!best) { const x = px(OP[0] + 0.5), y = py(OP[1] + 0.2) - E; if (Math.abs(mx - x) < T * 0.5 && Math.abs(my - y) < T * 0.75) best = 'op'; }
      return best;
    }
    function cardHTML(u) {
      if (u === 'op') {
        const s = S();
        return `<b>${F.name}</b><i>${F.profession} · ${F.branch}</i>
          <dl><dt>攻击力</dt><dd>${fmt(atkNow())}</dd><dt>攻击间隔</dt><dd>${interval().toFixed(2)}s</dd>
          <dt>技力</dt><dd>${active ? (active.left === Infinity ? '持续中' : '生效 ' + active.left.toFixed(1) + 's') : Math.floor(sp) + ' / ' + s.cost}</dd>
          ${medic ? `<dt>元素回复</dt><dd>${Math.round(M.elemK * 100)}% 攻击力</dd><dt>氤氲</dt><dd>${Math.round(M.hotPct * 100)}% · ${M.hotDur}s × 3</dd>` : `<dt>炎息</dt><dd>+${Math.round(M.tal * 100)}%</dd>${aspdTal ? `<dt>乱火攻速</dt><dd>+${aspdTal}</dd>` : ''}`}
          ${M.mod ? `<dt>模组</dt><dd>${M.mod}</dd>` : ''}</dl>`;
      }
      if (u.d) {
        const e = u, d = e.d, A = atkNow();
        const res = Math.max(0, d.res * (e.resDown > 0 ? 1 - IGN_R : 1) - (M.ignore || 0));
        return `<b>${d.name}</b><i>${RANK[d.rank]}${d.fly ? ' · 空中' : ''}${d.range ? ' · 远程' : ''}</i>
          <em style="--v:${(e.hp / e.hpMax).toFixed(3)}"></em>
          <dl><dt>生命</dt><dd>${fmt(Math.max(0, e.hp))} / ${fmt(e.hpMax)}</dd><dt>防御</dt><dd>${d.def}</dd>
          <dt>法术抗性</dt><dd>${d.res}${res !== d.res ? ` → ${+res.toFixed(1)}` : ''}</dd>
          ${medic ? `<dt>攻击</dt><dd>${d.atk}${d.arts ? ' 法术' : ' 物理'}${d.burn ? ' + 灼燃' : ''}</dd>${e.blockedBy ? `<dt>状态</dt><dd>被${e.blockedBy.name}阻挡</dd>` : ''}`
            : `<dt>她的一击</dt><dd class="hi">${fmt(artsHitVal(A, e))} 法术</dd><dt>同攻物理</dt><dd><s>${fmt(physVs(A, d.def))}</s></dd>`}</dl>`;
      }
      const a = u;
      return `<b>${a.name}</b><i>友军 · 阻挡 ${a.block}（演示约数）</i>
        <em style="--v:${(a.hp / allyMaxHp(a)).toFixed(3)}" class="ok"></em>
        <dl><dt>生命</dt><dd>${fmt(a.hp)} / ${fmt(allyMaxHp(a))}</dd><dt>防御 · 法抗</dt><dd>${a.def} · ${a.res}${a.burnT > 0 ? ' (−20)' : ''}</dd>
        <dt>灼燃</dt><dd>${a.burnT > 0 ? '爆发中 ' + a.burnT.toFixed(1) + 's' : fmt(a.elem) + ' / 1000'}</dd>
        <dt>氤氲</dt><dd>${a.hot.length} 层</dd>${barrier && inRange(a.x, a.y) ? `<dt>屏障</dt><dd>${fmt(barrier.pool)}</dd>` : ''}</dl>`;
    }
    function tickCard(rdt) {
      if (pinT > 0) pinT -= rdt;
      if (!ptr && pinT <= 0) { if (cardFor) hideCard(); return; }
      if ((cardT -= rdt) > 0) return;
      cardT = 0.2;
      const u = ptr ? pickUnit() : cardFor;
      if (!u || (u.d && u.dead)) { if (cardFor) hideCard(); return; }
      cardFor = u;
      card.innerHTML = cardHTML(u);
      card.classList.add('on');
      host.classList.add('peek');
      const cw = card.offsetWidth, ch = card.offsetHeight;
      const [mx, my] = ptr || lastPtr || [W / 2, H / 2];
      const x = mx + 16 + cw > W ? mx - cw - 14 : mx + 16, y = clamp(my - ch / 2, 4, H - ch - 4);
      card.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
    }
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerdown', onMove);
    host.addEventListener('pointerleave', onLeave);
    // 点她（或她头顶的技能图标）释放技能
    function onClick(ev) {
      if (!canCast()) return;
      const r = host.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
      const x = px(OP[0] + 0.5), feet = py(OP[1] + 0.74) - E;
      if (Math.abs(mx - x) < T * 0.6 && my < feet + T * 0.2 && my > feet - T * 2.6) cast();
    }
    host.addEventListener('click', onClick);

    /* ---------------- HUD ---------------- */
    let hudKey = '';
    function tickHud() {
      const k = `${stat.kills}|${stat.spawned}|${stat.leaks}|${scen.id}|${M.mod}`;
      if (k === hudKey) return;
      hudKey = k;
      hud.innerHTML = `<span class="hud-scen">${scen.name}</span><span>击破 <b>${stat.kills}</b><i>/</i>${stat.spawned}</span><span class="${stat.leaks ? 'bad' : ''}">漏过 <b>${stat.leaks}</b></span>${M.mod ? `<span class="hud-mod">${M.mod}</span>` : ''}`;
    }

    /* ---------------- 循环：60 帧封顶，看不见就停 ---------------- */
    let acc = 0, uiT = 0, gT = 0, lastDraw = 0, readyMark = false;
    function frame(now) {
      raf = 0;
      if (destroyed || !visible || document.hidden) { running = false; return; }
      raf = requestAnimationFrame(frame);
      if (now - lastDraw < 1000 / 60 - 1.5) return;
      lastDraw = now;
      fid++;
      const rdt = clamp((now - last) / 1000 || 0, 0, 0.1); // rAF 的时间戳可能比 start() 时的 performance.now() 还早
      last = now;
      acc += rdt * speed;
      let n = 0;
      const pt0 = PROF ? performance.now() : 0;
      while (acc >= 1 / 60 && n++ < 8) { step(1 / 60); acc -= 1 / 60; }
      if (acc > 1 / 60) acc = 0;
      if (PROF) { const p1 = performance.now(); PROF.step += p1 - pt0; draw(now / 1000); PROF.draw += performance.now() - p1; PROF.n++; PROF.parts = parts.length; PROF.foes = foes.length; PROF.nums = nums.length; }
      deployT += rdt;
      if (deployPending && (fid & 7) === 0) playDeploy();
      // 小人载入后，部署标记淡出
      opFade = chibi && chibi.ready ? Math.max(0, opFade - rdt * 2.5) : 1;
      // 镜头震动（只动 .sim-cam 这一层）
      if (shake > 0.05) {
        shakeT += rdt;
        const a = shake * Math.max(0, 1 - shakeT / 0.4);
        if (a <= 0.05) { shake = 0; cam.style.transform = ''; }
        else cam.style.transform = `translate3d(${rnd(-a, a).toFixed(1)}px, ${rnd(-a, a).toFixed(1)}px, 0)`;
      }
      if (!PROF) draw(now / 1000);
      if (!readyMark) { readyMark = true; host.classList.add('ready'); }
      tickTip(rdt);
      tickCard(rdt);
      uiT -= rdt;
      if (uiT <= 0) { uiT = 0.25; tickHud(); if (opts.onStats) opts.onStats(snapshot()); }
      gT -= rdt;
      if (gT <= 0) { gT = 0.25; drawGraph(); }
    }
    function start() { if (!running && !destroyed) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } }
    function snapshot() {
      const s = S();
      return {
        medic, perSec: perSec(), stat, sp, cost: s.cost, active: !!active, left: active ? active.left : 0, ready: canCast(), casts, combo,
        atk: Math.round(atkNow()), iv: interval(), charges, skill: s, cfg, mod: M.mod, allies: allies.map((a) => ({ name: a.name, hp: a.hp / allyMaxHp(a), elem: a.elem, down: a.down })),
      };
    }

    function reset() {
      t = 0; foes = []; shots = []; nums = []; rings = []; parts = []; decals = []; drops = []; barrier = null; waveI = 0; spawnCd = 1.2;
      pending = []; pendCd = 0; surge = 0; heat = 0; pale = 0; hitLeft = 0; skillRun = null; fullFor = 0; combo = 0; deployT = 0;
      bucks = []; bNow = null; marks = [];
      tipSeen.clear(); tipQ = []; if (tipCur) { tipEl.classList.remove('on'); tipCur = null; } tipGap = 1.2;
      gloom(false);
      Object.assign(stat, { dmg: 0, kills: 0, leaks: 0, heal: 0, elem: 0, absorb: 0, downs: 0, bursts: 0, best: 0, spawned: 0, log: [] });
      const s = S();
      active = null; casts = 0; charges = 0; atkCd = 0.8; aspdTal = 0; spTal = 0;
      makeAllies();
      logEl.innerHTML = '';
      hit.classList.remove('on', 'pop');
      cut.classList.remove('on');
      result.classList.remove('on'); clearTimeout(resultT);
      hudKey = '';
      // 部署：本体的第二天赋「乱火」——随机获得技力（Y 模组：范围内有精英时取最大值，3 级另加攻速）
      let eliteNear = false;
      if (!medic && M.eliteMax) {
        // 为了看清 Y 模组的效果：部署时正好有一名重装防御者（精英）走进她的范围
        const e = spawn('heavy', 0, 4.7); if (e) { e.born = 1; eliteNear = true; }
      }
      if (!medic) {
        spTal = eliteNear ? M.spHi : Math.round(rnd(M.spLo, M.spHi));
        aspdTal = M.aspdHi ? (eliteNear ? M.aspdHi : Math.round(rnd(M.aspdLo, M.aspdHi))) : 0;
      }
      sp = Math.min(s.cost, s.init + spTal);
      const dv = DEPLOY_VOX.length ? pick(DEPLOY_VOX) : null;
      if (dv) say(`<i>「${dv[1].replace(/\d$/, '')}」${dv[2]}</i>`, 'v');
      say(`部署 · 携带 <b>${s.name}</b> · 初始技力 ${s.init}${spTal ? ` <b>+${spTal}</b>（乱火${eliteNear ? ' · 精英在场取最大值' : ''}）` : ''} / ${s.cost}`, '');
      if (!medic) tip('deploy', `部署：第二天赋「乱火」随机给 <b>${M.spLo}~${M.spHi}</b> 点技力——这次 <b>+${spTal}</b>${aspdTal ? `，攻速 +${aspdTal}` : ''}${eliteNear ? '<br>Y 模组：范围内有<b>精英</b>，直接取最大值' : ''}<br>第一天赋「炎息」：全体术师攻击力 <b>+${Math.round(M.tal * 100)}%</b>`, [OP[0] + 0.5, OP[1] - 0.9], 5200);
      else tip('deploy', `第二天赋「火山灰疗愈」：她范围内的友方<br>生命上限 <b>+${Math.round(M.hpUp * 100)}%</b>，受到的元素损伤 <b>−${Math.round(M.elemCut * 100)}%</b>`, [OP[0] + 1.6, OP[1] - 0.9], 5200);
      deployPending = true; // 部署演出：等画框真的出现在屏幕上再播（见 frame）
    }
    let deployPending = false;
    function playDeploy() {
      const r = host.getBoundingClientRect();
      if (r.bottom < 40 || r.top > innerHeight - 40 || T <= 1) return; // 还没滚到这里
      deployPending = false;
      deployT = 0;
      if (chibi && chibi.ready) chibi.anim('Start', false, 'Idle');
      const fx = FXS();
      if (fx && fx.deploy) { const [a, b] = vp(OP[0] + 0.5, OP[1] + 0.74 - E / TH); fx.deploy(a, b, T, medic); }
    }

    // 干员小人：资源站慢的时候会加载失败——悄悄重试几次，没出来之前地图上先画一枚部署标记
    let opFails = 0, opRetryT = 0, resultT = 0;
    function loadOp() {
      if (!chibi || destroyed) return;
      chibi.load(f, '默认', 'front').then((ok) => {
        if (destroyed) return;
        if (ok) { chibi.speed(speed); return; }
        if (opFails < 4) opRetryT = setTimeout(loadOp, [4, 10, 25, 60][opFails++] * 1000);
      });
    }
    /* ---- 延迟初始化：画框接近视口（上下约一屏）、加载页也退场了，才在空闲时间预渲染地形 / 单位、载入小人。
     *      在那之前这里什么都不做：不建精灵、不跑动画循环，页面加载时不和别人抢主线程 ---- */
    let inited = false, initPending = false, initTimer = 0;
    const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 60));
    const loaderUp = () => { const ld = document.getElementById('loader'); return !!ld && !ld.classList.contains('out'); };
    function tryInit() {
      if (inited || initPending || destroyed) return;
      initPending = true;
      const go = () => {
        if (destroyed) return;
        if (loaderUp() || document.hidden) { initTimer = setTimeout(go, 500); return; }
        idle(() => { initPending = false; init(); });
      };
      go();
    }
    /* 预渲染分成几步、各占一段空闲时间：一口气做完是一个近半秒的长任务，正好撞上用户往下滚动时会卡一下。
     * 同一段空闲时间里还有余量（>12ms）就顺手做下一步 */
    let initing = false;
    function init() {
      if (inited || initing || destroyed) return;
      initing = true;
      const steps = [
        () => layout(true, true),
        () => buildMap(),
        () => buildRanges(),
        () => buildUnits(),
        () => { if (opts.graph) sizeGraph(); },
        () => {
          inited = true; initing = false;
          reset();
          idle(() => { if (!destroyed && !crackCv) buildCrack(); });
          if (window.CHIBI && opts.chars) {
            chibi = CHIBI.create(stage, { chars: opts.chars, pma: true, shared: true, ground: 0.12, fill: 0.78 });
            chibi.setAuto(false);
            loadOp();
          }
          if (visible) start();
        },
      ];
      let i = 0;
      const next = (dl) => {
        if (destroyed) return;
        do {
          // 宿主还没有尺寸（被 content-visibility 跳过等）：稍后从头再来
          if (i === 0 && steps[0]() === false) { idle(next); return; }
          if (i > 0) steps[i]();
          i++;
        } while (i < steps.length && dl && dl.timeRemaining && dl.timeRemaining() > 12);
        if (i < steps.length) idle(next);
      };
      next();
    }
    const nearIO = new IntersectionObserver(([en]) => { if (en.isIntersecting) tryInit(); }, { rootMargin: '900px 0px' });
    nearIO.observe(host);
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && inited) start(); else if (!visible) gloom(false); }, { rootMargin: '100px 0px' });
    io.observe(host);
    // 尺寸变化：防抖后再重建（加载 / 字体到位 / 旁边区块重绘时会连着变好几次）
    let roT = 0;
    const ro = new ResizeObserver(() => { clearTimeout(roT); roT = setTimeout(() => { if (!inited || destroyed) return; layout(); sizeGraph(); }, 160); });
    ro.observe(host);
    if (gcv) ro.observe(gcv);
    const onVis = () => { if (!document.hidden && inited) start(); };
    document.addEventListener('visibilitychange', onVis);

    const api = {
      skills: sk,
      get skillIdx() { return skillIdx; },
      get config() { return { ...cfg }; },
      setSkill(i) { skillIdx = clamp(i, 0, sk.length - 1); if (inited) reset(); },
      cast,
      setAuto(v) { auto = !!v; },
      setSpeed(v) { speed = v; if (chibi && chibi.ready) chibi.speed(v); },
      /** 模组 / 潜能 / 关卡 / 解说；改了就重新部署 */
      setConfig(c) {
        const prevScen = cfg.scen;
        cfg = Object.assign({}, cfg, c);
        M = model(F, f, cfg);
        scen = SCEN[f].find((s) => s.id === cfg.scen) || SCEN[f][0];
        if (!inited) return;
        if (scen.id !== prevScen) layout(true);
        if (!cfg.tips && tipCur) { tipEl.classList.remove('on'); tipCur = null; tipQ = []; }
        if ('tips' in c && Object.keys(c).length === 1) return; // 只是开关解说：不重来
        reset();
      },
      reset: () => { if (inited) reset(); },
      destroy() {
        destroyed = true;
        gloom(false);
        clearTimeout(opRetryT); clearTimeout(resultT); clearTimeout(initTimer); clearTimeout(roT);
        if (raf) cancelAnimationFrame(raf);
        io.disconnect(); nearIO.disconnect(); ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerdown', onMove); host.removeEventListener('pointerleave', onLeave); host.removeEventListener('click', onClick);
        if (chibi) chibi.destroy();
        cam.remove(); tag.remove(); result.remove(); hud.remove(); cut.remove(); hit.remove(); logEl.remove(); tipEl.remove(); card.remove();
      },
    };
    // 调试（?debug）：给 lab/cdp.mjs 用——敌人 / 友军 / 她本人在视口里的位置
    if (/[?&]debug\b/.test(location.search)) {
      api.peek = () => ({
        foes: foes.filter((e) => !e.dead && e.born > 0.5).map((e) => [e.key, ...vp(e.x, e.y + e.dy - e.z - 0.2)]),
        allies: allies.map((a) => [a.kind, ...vp(a.x, a.y - 0.3)]),
        op: vp(OP[0] + 0.5, OP[1] + 0.2),
        sp, active: !!active, t, kills: stat.kills, leaks: stat.leaks, spawned: stat.spawned, downs: stat.downs, bursts: stat.bursts,
      });
      window.__sim = api;
    }
    return api;
  }

  return { create, math, model, SCEN, FOES, DIAMOND3 };
})();
