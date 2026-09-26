/* =========================================================
 * 立绘关键画面（key-art）演示影片——给写 MV 的人看 MVE.keyart 的用法；不在页面里出现
 * 实验页：lab/mv.html?film=_keyart-demo&strip=auto（联系表）、&t=10（单帧）、&perf=1（性能）、&play=1（实时）
 *
 * 要点
 *  - needs: ['keyart']：引擎在影片脚本注册后自动加载 js/mv/keyart.js（加载失败也照样放行）
 *  - prepare 里预载要用的立绘（下载 + 上传显卡）；ctx.keyart 只会 resolve(true / false)，最多等 8 秒
 *  - draw 里在用的时候才取 MVE.keyart（影片脚本执行时它还没加载）。立绘没加载好 / 设备不支持时，shot() 照样画背景与氛围，
 *    并调用 o.fallback（这里用角色库的 Q 版人物）；keyart.js 本身都没加载成功时，由下面的 shot() 包装铺底色 + 替代画面
 *  - release() 里释放显存；片尾字幕必须注明立绘版权（MVE.keyart.credit）
 * 借用 Miss You 的节拍分析（134 BPM，一小节 ≈ 1.79 秒），镜头边界对齐小节线
 * ========================================================= */
(() => {
  const E = window.MVE;
  const KA = () => window.MVE && window.MVE.keyart;
  const CREDIT = '角色立绘 © Hypergryph（官方原画，本页分层绑定）'; // 与 MVE.keyart.credit 相同（字幕表在 keyart.js 加载前就要定下来）

  /** 立绘不可用时的替代：角色库的 Q 版人物（shot() 已经画好了背景、粒子与调色） */
  function fallback(outfit) {
    return (g, s) => {
      try { if (E.cast) E.cast.draw(g, 'adele-alter', { x: 960, y: 1010, h: 820, t: s.t, outfit }); } catch (e) { /* 只留氛围 */ }
    };
  }
  /**
   * 所有镜头都经过这里：keyart.js 本身没加载成功时（MVE.keyart 不存在），画布不会被清空，
   * 所以自己铺一层底色 + 替代画面，不能什么都不画
   */
  function shot(g, s, o) {
    const K = KA();
    if (K) return K.shot(g, s, o);
    E.post.fill(g, '#16121a');
    if (o.fallback) o.fallback(g, s);
    return false;
  }

  E.film({
    id: '_keyart-demo',
    needs: ['keyart'],
    analysisId: 'miss-you',
    audio: 'assets/music/miss-you.mp3',
    title: 'Key Art Demo',
    fadeIn: 1.2,
    prepare: (ctx) => ctx.keyart(['alter-e0', 'base-e2', 'base-s1']),
    release() { const K = KA(); if (K) K.release(); },
    captions: [
      [9.2, 14.2, '「等我回来，就把山顶的风也录给你听。」', { style: 'narration' }],
      [24.2, 29.4, CREDIT, { style: 'side', size: 26, y: 1010, fade: 0.8 }],
    ],
    shots: [
      {
        // I：全身 → 半身，缓慢推近；她在第 4.5 秒睁开眼睛。暖色晨光、花瓣、散景
        id: 'ka-awake', t0: 0, title: '睁眼',
        draw(g, s) {
          shot(g, s, {
            key: 'alter-e0', crop: 'full',
            from: { crop: 'full', z: 1.02, y: 0.03, look: [-0.25, 0.12] }, to: { crop: 'upper', z: 1.0, look: [0.08, 0] },
            ease: 'inOut', grade: 'warm', wind: 0.35, windDir: 1,
            eyes: 1 - s.at(4.3, 5.1, 'sine'), // 闭着眼，慢慢睁开（数值 = 闭合程度）
            sweep: s.at(5.0, 6.3, 'inOut'),   // 睁眼的同时，一道光从她身上掠过
            particles: [{ type: 'petals', n: 36 }, { type: 'dust', n: 40 }], dof: 0.6, leak: true,
            fallback: fallback('coat'),
          });
          // 片名（左下角的标题卡，不挡人物）
          const a = s.window01(s.lt, 0.8, 6.8, 1.2, 1.0);
          if (a > 0) {
            const x = 150, y = 850, rise = (1 - E.ease.out(s.at(0.8, 2.2))) * 14;
            g.save(); g.globalAlpha = a * 0.75; g.fillStyle = '#fff4e8'; g.fillRect(x + 2, y + 26, 300 * E.ease.inOut(s.at(1.0, 2.6)), 2); g.restore();
            s.text(g, 'KEY  ART', x, y + rise, { font: 'display', size: 80, weight: 700, spacing: 14, align: 'left', color: '#fff8f0', alpha: a, stroke: 'rgba(60,30,20,.22)', strokeW: 6 });
            s.text(g, '官方立绘 · 关键画面', x + 4, y + 74 + rise * 0.6, { size: 30, weight: 600, spacing: 8, align: 'left', color: '#fff2e4', alpha: a * 0.9 });
          }
        },
      },
      {
        // II：脸部特写。视线从画外慢慢转过来，脸红，最后眯眼笑（梦幻的粉紫调、闪光、前景散景）
        id: 'ka-face', t0: 8.053, in: { type: 'fade', dur: 1.0 }, title: '特写',
        draw(g, s) {
          shot(g, s, {
            key: 'alter-e0', crop: 'face',
            from: { crop: 'face', z: 1.0, x: -0.012, look: [0.42, 0.06] }, to: { crop: 'face', z: 1.1, x: 0.01, look: [0, 0] },
            ease: 'sine', grade: 'dream',
            blush: 0.85 * s.at(1.5, 4.5, 'sine'), smile: s.at(5.4, 5.9, 'sine'), wind: 0.3,
            particles: [{ type: 'sparkle', n: 26 }], dof: 0.8, bloom: 0.2,
            // 立绘坐标系里的锚点：拍点上，一只眼睛的高光闪一下
            over: (q, s2, A) => { if (A && A.eyeR) s2.glow(q, A.eyeR[0] + 10, A.eyeR[1] - 14, 26 + 20 * s2.pulse(9), '255,240,250', 0.28 * s2.pulse(9)); },
            fallback: fallback('coat'),
          });
        },
      },
      {
        // III：副歌前的爆发——精英二，熔岩与羊群。大风从右边吹来，火光随低音起伏
        id: 'ka-ember', t0: 15.221, in: { type: 'flash', dur: 0.6, color: '#ffd9b0' }, title: '熔岩',
        draw(g, s) {
          shot(g, s, {
            key: 'base-e2', crop: 'upper',
            from: { crop: 'upper', z: 1.0, x: -0.025, r: -0.01 }, to: { crop: 'bust', z: 1.02, x: 0.015, r: 0.004 },
            ease: 'inOut', grade: 'ember', wind: 0.95, windDir: -1,
            glow: 1.2 + 1.4 * s.lo, cast: 0.3 + 0.4 * s.pulse(5),
            particles: [{ type: 'embers', n: 70 }, { type: 'ash', n: 40 }], dof: 0.5,
            leak: { x: 240, y: 1020, r: 1000, rgb: '255,110,50', a: 0.38 },
            fallback: fallback('coat'),
          });
        },
      },
      {
        // IV：黄昏的海边，从半身推到脸——她笑起来。片尾署名
        id: 'ka-sunset', t0: 22.389, t1: 29.557, in: { type: 'white', dur: 1.2 }, title: '黄昏',
        draw(g, s) {
          // 夕阳在她身后偏左：逆光从左边来，暖色；原画本身已经很粉，人物上的调色放轻、柔光放少
          shot(g, s, {
            key: 'base-s1', crop: 'upper',
            from: { crop: 'upper', z: 1.0, y: 0.02 }, to: { crop: 'face', z: 1.0 },
            ease: 'inOut',
            grade: { base: 'warm', tint: ['#fff4ee', 0.12], contrast: 1.08, overlay: ['#ff9a80', 0.1, 'soft-light'], light: { color: '#ffcaa0', dir: [-0.9, -0.25], rim: 0.9, wash: 0.1 }, leak: '255,160,120', bokeh: '255,196,170' },
            bloom: 0.25, leak: { x: 260, y: 520, r: 900, a: 0.32 },
            wind: 0.6, windDir: 1, smile: s.at(4.6, 5.2, 'sine'), blush: 0.5,
            particles: [{ type: 'petals', n: 44 }], dof: 0.6, fade: [0, 1.6],
            fallback: fallback('picnic'),
          });
        },
      },
    ],
  });
})();
