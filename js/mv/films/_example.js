/* =========================================================
 * 示例影片（给写 MV 的人看的最小用法；不在页面里出现）
 * 实验页：lab/mv.html?film=_example&strip=auto
 * ========================================================= */
(() => {
  const E = window.MVE;
  E.film({
    id: '_example',
    analysisId: 'before-summer', // 借用 Before Summer 的节拍分析
    title: 'Example',
    audio: 'assets/music/before-summer.mp3',
    captions: [
      [2, 7, '莱塔尼亚，六月。一个平凡的早晨。'],
      [9, 13, '「等夏天过去，我们去海边。」', { style: 'quote' }],
    ],
    overlay(g, s) { s.post.grain(g, s.t, 0.05); s.post.vignette(g, 0.45); },
    shots: [
      {
        id: 'sky', t0: 0, title: '清晨',
        draw(g, s) {
          // 静态天空缓存成位图，每帧只贴图
          g.drawImage(s.cache('sky', (q) => s.kit.sky(q, [[0, '#8fc3ff'], [0.7, '#ffe2c0'], [1, '#ffd0a0']])), 0, 0, 1920, 1080);
          const cam = { x: 960 + s.lt * 12, y: 540, z: 1 + s.p * 0.05, ...s.handheld(1, s.t, 4) };
          s.layer(g, cam, 0.2, (q) => { for (let i = 0; i < 4; i++) q.drawImage(s.kit.cloudSprite(10 + i), 200 + i * 450 - s.t * 8, 180 + (i % 2) * 90, 520, 220); });
          s.layer(g, cam, 1, (q) => {
            q.fillStyle = '#6b8a5a'; q.fillRect(0, 820, 1920, 260);
            E.cast.draw(q, 'adele-child', { x: 700 + s.lt * 60, y: 860, h: 320, pose: 'walk', t: s.t });
            E.cast.draw(q, 'sheep-black', { x: 560 + s.lt * 60, y: 860, h: 110, pose: 'walk', t: s.t + 0.2 });
          });
          s.kit.particles(g, s.t, 'dust', { n: 40 });
          // 拍点联动：每拍一次小光点
          s.glow(g, 1600, 200, 120 + 60 * s.pulse(), '255,230,180', 0.5);
        },
      },
      {
        id: 'night', t0: 8, in: { type: 'iris', dur: 1.2, x: 1600, y: 200 },
        draw(g, s) {
          g.drawImage(s.cache('night', (q) => s.kit.sky(q, [[0, '#0b1030'], [1, '#2a1a3a']])), 0, 0, 1920, 1080);
          s.kit.stars(g, s.t, { n: 160 });
          s.kit.fog(g, s.t, { rgb: '255,180,220', alpha: 0.5, y0: 700 });
          s.text(g, 'Before Summer', 960, 520, { font: 'display', size: 110, weight: 700, color: '#fff', spacing: 10, alpha: s.at(0.5, 2) });
          s.kit.particles(g, s.t, 'fireflies');
        },
      },
      { id: 'tear', t0: 14, in: { type: 'tear', dur: 1 }, draw(g, s) { s.post.fill(g, '#f4efe6'); s.text(g, 'MISS YOU', 960, 600, { font: 'display', size: 200, weight: 900, color: '#6aa0d8', spacing: 20 }); s.kit.particles(g, s.t, 'petals', { n: 40 }); } },
      { id: 'end', t0: 18, t1: 24, in: { type: 'ash', dur: 1.5, embers: true }, draw(g, s) { s.post.fill(g, '#140a0e'); s.kit.particles(g, s.t, 'embers'); s.kit.particles(g, s.t, 'ash'); } },
    ],
  });
})();
