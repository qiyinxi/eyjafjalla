// 离线导出 MV 的逐帧画面（开发用）：多开几个无头 Chrome（真实显卡）并行渲染 lab/export.html，存成 JPEG 序列，
// 之后用 ffmpeg 合成视频。画面是时间的纯函数，所以各个 Chrome 交错分帧即可。
// 用法：node lab/export.mjs <film> <输出目录> [并行数=6] [帧率=60] [宽=1920] [JPEG 质量=0.95]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [, , film = 'misty-memory-night', outDir = 'frames', W0 = '6', F0 = '60', WW = '1920', Q0 = '0.95'] = process.argv;
const workers = +W0, fps = +F0, width = +WW, height = Math.round((width * 9) / 16), quality = +Q0;
const base = process.env.BASE || 'http://localhost:25568';
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function worker(k) {
  const port = 9400 + k * 7 + Math.floor(Math.random() * 5);
  const prof = join(tmpdir(), `mvexp-${port}-${Date.now()}`);
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  let tabs;
  for (let i = 0; i < 80; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); break; } catch { await sleep(250); } }
  const page = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text); return r.result.result.value; };
  await send('Page.enable');
  await send('Page.navigate', { url: `${base}/lab/export.html?film=${film}&w=${width}&q=${quality}` });
  const t0 = Date.now();
  let title = '';
  while (Date.now() - t0 < 400000) { title = await ev('document.title').catch(() => ''); if (title === 'READY' || title.startsWith('ERR')) break; await sleep(500); }
  if (title !== 'READY') { console.log(`worker ${k}: ${title || 'timeout'} ${await ev('window.__err || ""').catch(() => '')}`); proc.kill(); return; }
  const info = await ev('__info()');
  const N = Math.ceil(info.dur * fps);
  if (k === 0) console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s · ${N} frames · models: ${info.sd.join(', ')}`);
  let done = 0; const s0 = Date.now();
  for (let i = k; i < N; i += workers) {
    const f = join(outDir, `f${String(i).padStart(6, '0')}.jpg`);
    if (existsSync(f)) { done++; continue; }
    const b64 = await ev(`__frame(${(i / fps).toFixed(6)})`);
    writeFileSync(f, Buffer.from(b64, 'base64'));
    done++;
    if (k === 0 && done % 300 === 0) { const rate = done / ((Date.now() - s0) / 1000); console.log(`worker0 ${done}/${Math.ceil(N / workers)} · ${rate.toFixed(1)} fps/worker · eta ${((Math.ceil(N / workers) - done) / rate / 60).toFixed(1)} min`); }
  }
  ws.close(); proc.kill(); await sleep(300); try { rmSync(prof, { recursive: true, force: true }); } catch {}
  console.log(`worker ${k} done (${done} frames)`);
}
await Promise.all(Array.from({ length: workers }, (_, k) => worker(k)));
console.log('ALL DONE');
