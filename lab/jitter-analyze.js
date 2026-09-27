// 逐帧抖动分析（lab/jitter.html 的记录 → 问题列表）。浏览器里是全局函数 jitterAnalyze；node 里 require 它：
//   node -e "const A=require('./lab/jitter-analyze.js'); const r=require('out.json').out; console.log(A(r.frames, { dt: 1/30 }).counts)"
(function (root) {
  'use strict';
  function jitterAnalyze(frames, o) {
    o = o || {};
    const dt = o.dt || 1 / 60, thr = o.thr || 3, ptol = o.ptol || 0.006;
    const issues = [], byShot = {};
    const bump = (shot, kind, v) => { const b = (byShot[shot] = byShot[shot] || {}); const c = (b[kind] = b[kind] || { n: 0, max: 0 }); c.n++; c.max = Math.max(c.max, v); };
    const dist = (p, c) => Math.hypot(p.x - c.x, p.y - c.y);
    // 小羊（src 'lamb'）的 key 带着姿势（'enemy_1344_ddlamb:jump'）：配对时只看模型，换姿势不算换了一只羊
    const nk = (r) => (r.src === 'lamb' ? String(r.key).split(':')[0] : r.key);
    // 小羊的官方模型记录紧跟在它的 lamb 记录后面：把 lamb 的 id 传给它，配对时同 id 才算同一只（挤成一团的小羊不会配错）
    for (const fr of frames) for (let i = 1; i < fr.recs.length; i++) if (fr.recs[i].src === 'sd' && fr.recs[i - 1].src === 'lamb' && fr.recs[i - 1].id != null) fr.recs[i].id = fr.recs[i - 1].id;
    // 手绘角色 → 同一个人的官方模型 / 立绘（换模型检测只配对同一个人）
    const SAME = { 'adele-child': /amgoat/, 'adele-caster': /amgoat/, 'adele-alter': /agoat2|alter-e0/, fontaine: /spikes/, snowsant: /snsant|snowsant/, keller: /keller/, dolly: /shpkg|dolly/, 'sheep-pink': /enemy_13|lamb/ };
    /** 把 cur 的每条记录配到 prev 里同一个角色（同 src + key，最近的位置） */
    function match(prev, curr) {
      const used = new Set(), res = new Map();
      for (let i = 0; i < curr.recs.length; i++) {
        const c = curr.recs[i];
        let best = -1, bd = Infinity;
        prev.recs.forEach((p, j) => { if (used.has(j) || nk(p) !== nk(c) || p.src !== c.src || (p.id != null && c.id != null && p.id !== c.id)) return; const d = dist(p, c); if (d < bd) { bd = d; best = j; } });
        if (best >= 0 && bd < Math.max(60, (c.s || 100) * 0.6)) { used.add(best); res.set(i, best); }
      }
      return res;
    }
    const wrap1 = (d, per) => (per > 0 ? d - per * Math.round(d / per) : d);
    const flips = {};
    const M = [];
    for (let f = 1; f < frames.length; f++) {
      const P = frames[f - 1], Cc = frames[f];
      if (Cc.seg !== P.seg || Math.abs(Cc.t - P.t - dt) > 1e-6) { M.push(null); continue; }
      M.push(match(P, Cc));
    }
    for (let f = 1; f < frames.length; f++) {
      const P = frames[f - 1], Cc = frames[f], mm = M[f - 1];
      if (!mm) continue;
      const sameShot = P.shot === Cc.shot;
      for (const [ci, pi] of mm) {
        const c = Cc.recs[ci], p = P.recs[pi];
        if (c.src === 'sd') {
          // 频闪：动画一帧就走了四分之一圈以上（小人跑得太快、按距离锁步相却没有上限）——腿会糊成一团 / 闪
          if (c.anim === p.anim && !c.animB && !p.animB && sameShot && c.dur > 0) {
            const d1 = Math.abs(wrap1(c.tt - p.tt, c.dur));
            if (d1 > c.dur * 0.25 * (dt * 30)) { issues.push({ t: +Cc.t.toFixed(3), shot: Cc.shot, kind: 'strobe', key: c.key, anim: c.anim, v: +(d1 / c.dur).toFixed(2), x: Math.round(c.x), y: Math.round(c.y) }); bump(Cc.shot, 'strobe', d1 / c.dur); }
          }
          if (c.anim !== p.anim && !c.animB && !p.animB && sameShot) { issues.push({ t: +Cc.t.toFixed(3), shot: Cc.shot, kind: 'anim', key: c.key, from: p.anim, to: c.anim, x: Math.round(c.x), y: Math.round(c.y) }); bump(Cc.shot, 'anim', 1); }
        }
        // 朝向来回翻（同一个角色在 0.5 秒里翻面 3 次以上 → 频闪）
        if (sameShot && c.flip != null && p.flip != null && c.flip !== p.flip) {
          const k = Cc.shot + '|' + nk(c) + '|' + (c.id ?? '');
          const L = (flips[k] = (flips[k] || []).filter((tt) => Cc.t - tt < 0.5));
          L.push(Cc.t);
          if (L.length >= 3) { issues.push({ t: +Cc.t.toFixed(3), shot: Cc.shot, kind: 'flipflop', src: c.src, key: c.key, x: Math.round(c.x), y: Math.round(c.y) }); bump(Cc.shot, 'flipflop', L.length); }
        }
        if (c.src === 'card' && sameShot) {
          if (c.big !== p.big) { issues.push({ t: +Cc.t.toFixed(3), shot: Cc.shot, kind: 'res', key: c.key, big: c.big }); bump(Cc.shot, 'res', 1); }
        }
      }
      // 凭空出现 / 消失：同一个镜头里，画面中间（离边缘 > 120）的角色这一帧有、上一帧没有（或反过来）。蹦出来的小羊（带烟雾）也会记进来，要人工看
      if (sameShot) {
        const inside = (r) => r.x > 120 && r.x < 1800 && r.y > 150 && r.y < 1060 && (r.alpha ?? 1) > 0.5 && r.src !== 'ka' && r.src !== 'card';
        const hasC = new Set(mm.keys()), hasP = new Set(mm.values());
        Cc.recs.forEach((c, i) => { if (!hasC.has(i) && inside(c)) { issues.push({ t: +Cc.t.toFixed(3), shot: Cc.shot, kind: 'pop', src: c.src, key: c.key, v: 'in', x: Math.round(c.x), y: Math.round(c.y) }); bump(Cc.shot, 'pop', 1); } });
        P.recs.forEach((p, i) => { if (!hasP.has(i) && inside(p)) { issues.push({ t: +Cc.t.toFixed(3), shot: Cc.shot, kind: 'pop', src: p.src, key: p.key, v: 'out', x: Math.round(p.x), y: Math.round(p.y) }); bump(Cc.shot, 'pop', 1); } });
      }
      // 换模型：这一帧的手绘角色，上一帧同一位置附近是官方的（或反过来）
      if (sameShot) for (const c of Cc.recs) {
        if (c.src !== 'cast' || !SAME[c.key]) continue;
        const near = P.recs.find((p) => p.src !== 'cast' && SAME[c.key].test(p.key) && dist(p, c) < 80);
        if (near) { issues.push({ t: +Cc.t.toFixed(3), shot: Cc.shot, kind: 'swap', key: c.key, other: near.key, x: Math.round(c.x), y: Math.round(c.y) }); bump(Cc.shot, 'swap', 1); }
      }
      // 加速度（三帧）
      if (f + 1 < frames.length && M[f]) {
        const N = frames[f + 1], m2 = M[f];
        if (N.shot !== Cc.shot || P.shot !== Cc.shot) continue;
        for (const [ci, pi] of mm) {
          let ni = -1;
          for (const [a, b] of m2) if (b === ci) { ni = a; break; }
          if (ni < 0) continue;
          const c = Cc.recs[ci], p = P.recs[pi], n = N.recs[ni];
          const acc = Math.hypot(n.x - 2 * c.x + p.x, n.y - 2 * c.y + p.y);
          let bone = 0;
          if (c.pts && p.pts && n.pts && c.pts.length === p.pts.length && c.pts.length === n.pts.length) {
            for (let j = 0; j < c.pts.length; j += 2) bone = Math.max(bone, Math.hypot(n.pts[j] - 2 * c.pts[j] + p.pts[j], n.pts[j + 1] - 2 * c.pts[j + 1] + p.pts[j + 1]));
          }
          // 动画时间的二阶差分（按动画长度取模）：匀速、或者速度平滑变化（按距离锁步相）时 ≈ 0；相位 / 速度每帧跳就很大
          if (c.src === 'sd' && c.anim === p.anim && c.anim === n.anim && !c.animB && !p.animB && !n.animB) {
            const d1 = wrap1(c.tt - p.tt, c.dur), d2 = wrap1(n.tt - c.tt, c.dur), j2 = d2 - d1;
            if (Math.abs(j2) > ptol) { issues.push({ t: +Cc.t.toFixed(3), shot: Cc.shot, kind: 'phase', key: c.key, anim: c.anim, err: +j2.toFixed(3), sp: +c.sp.toFixed(3), tt: +c.tt.toFixed(3), x: Math.round(c.x), y: Math.round(c.y), s: +c.s.toFixed(3), cached: !!c.cached }); bump(Cc.shot, 'phase', Math.abs(j2)); }
          }
          const sc = c.s || 1;
          // 骨骼加速度按角色在画面上的尺寸归一：0.02 = 身高的 2%
          const rel = c.src === 'sd' ? bone / Math.max(1, sc * 300) : 0;
          if (acc > thr) { issues.push({ t: +Cc.t.toFixed(3), shot: Cc.shot, kind: 'jerk', src: c.src, key: c.key, acc: +acc.toFixed(2), x: Math.round(c.x), y: Math.round(c.y) }); bump(Cc.shot, 'jerk', acc); }
          if (c.src === 'ka') {
            const tj = Math.abs(n.turn0 - 2 * c.turn0 + p.turn0) + Math.abs(n.turn1 - 2 * c.turn1 + p.turn1);
            if (tj > 0.02) { issues.push({ t: +Cc.t.toFixed(3), shot: Cc.shot, kind: 'turn', key: c.key, v: +tj.toFixed(3) }); bump(Cc.shot, 'turn', tj); }
            const kx = Object.keys(Object.assign({}, p.ex, c.ex, n.ex));
            for (const e of kx) { const d2 = Math.abs((n.ex[e] || 0) - 2 * (c.ex[e] || 0) + (p.ex[e] || 0)); if (d2 > 0.5) { issues.push({ t: +Cc.t.toFixed(3), shot: Cc.shot, kind: 'expr', key: c.key, e, v: +d2.toFixed(2) }); bump(Cc.shot, 'expr', d2); } }
          }
          if (c.src === 'sd') bump(Cc.shot, 'boneMax', rel);
        }
      }
    }
    // 红线：画面上 ≥ 60 像素（1080p）的人物用了手绘版（不是剪影）——手绘的脸。羊不算人物，但也列出来（hand-sheep）
    const SHEEP = /^sheep-|^dolly$/;
    for (const fr of frames) for (const r of fr.recs) {
      if (r.src !== 'cast' || r.sil || (r.alpha ?? 1) < 0.3 || !(r.s >= 60) || /back/.test(r.view || '')) continue; // 背影不露脸，不算
      const k = SHEEP.test(r.key) ? 'hand-sheep' : 'hand';
      issues.push({ t: +fr.t.toFixed(3), shot: fr.shot, kind: k, key: r.key, pose: r.pose, h: Math.round(r.s), x: Math.round(r.x), y: Math.round(r.y) }); bump(fr.shot, k, r.s);
    }
    // 每个镜头里一帧最多画了几个（按来源）：官方小人实时渲染的开销主要看这个
    for (const fr of frames) {
      const b = (byShot[fr.shot] = byShot[fr.shot] || {}), c = {};
      for (const r of fr.recs) c[r.src] = (c[r.src] || 0) + 1;
      b.draws = b.draws || {};
      for (const k in c) b.draws[k] = Math.max(b.draws[k] || 0, c[k]);
    }
    const counts = issues.reduce((m, i) => ((m[i.kind] = (m[i.kind] || 0) + 1), m), {});
    return { issues, byShot, counts };
  }
  if (typeof module === 'object' && module.exports) module.exports = jitterAnalyze;
  else root.jitterAnalyze = jitterAnalyze;
})(typeof window !== 'undefined' ? window : globalThis);
