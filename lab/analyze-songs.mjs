// 用无头 Chrome 跑 lab/audio-analyze.html，把每首歌的结构写成 assets/music/<song>.json（MV 用的拍点 / 段落 / 包络）
// 用法：node lab/analyze-songs.mjs [song ...]    （需要本地服务：http://localhost:25568）
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const songs = process.argv.slice(2).length ? process.argv.slice(2) : ['before-summer', 'misty-memory-night', 'miss-you', 'misty-memory-day', 'effervescence'];
const base = process.env.BASE || 'http://localhost:25568';
const dir = join(tmpdir(), 'eyja-analyze');
mkdirSync(dir, { recursive: true });
for (const song of songs) {
  const sc = {
    url: `${base}/lab/audio-analyze.html?song=${song}`, width: 800, height: 600, gpu: false,
    steps: [
      { eval: "new Promise((r) => { const t0 = Date.now(); const iv = setInterval(() => { if (/^(DONE|ERR)/.test(document.title) || Date.now() - t0 > 120000) { clearInterval(iv); r(document.title); } }, 200); })", as: 'state' },
      { eval: 'JSON.stringify(window.__result || null)', as: 'json' },
      { eval: "document.getElementById('o').textContent", as: 'log' },
    ],
  };
  const f = join(dir, `${song}.json`);
  writeFileSync(f, JSON.stringify(sc));
  const out = JSON.parse(execFileSync('node', ['lab/cdp.mjs', f, dir], { encoding: 'utf8', maxBuffer: 1 << 28 }));
  console.log(`== ${song}: ${out.state}\n${out.log}`);
  if (out.json && out.json !== 'null') writeFileSync(`assets/music/${song}.json`, out.json);
}
