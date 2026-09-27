// 用 Chrome DevTools 协议驱动无头 Chrome：按时间点截图、测量卡顿（开发用）
// 用法：node lab/cdp.mjs <scenario.json> <输出目录>
// scenario = {
//   url, width, height, gpu: true|false（true 用真实显卡 d3d11，false 用 SwiftShader）,
//   mobile: true（模拟手机：触屏、移动端视口；dpr 默认 3）, dpr, ua: "用户代理", cpu: 4（CPU 降速倍数，近似中端手机）,
//   steps: [ { wait: ms } | { eval: "js 表达式（可 await）", as: "名字" } | { shot: "文件名.png" } | { perf: "start" | "stop", as: "名字" }
//          | { tap: true, x, y } 或 { tap: true, expr: "js，返回 [x, y]" }（触屏点按） | { cpu: 倍数 }（中途改 CPU 降速）
//          | { size: [宽, 高] }（中途改视口，比如手机横过来） | { dump: "js 表达式", file: "文件名.json" }（大结果分块写进文件）
//          | { grab: "css 选择器", file: "前缀" }（页面里的画布逐个存成 PNG） ]
// }
// perf start/stop：在页面里记录每一帧间隔与 longtask，stop 时返回统计。
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [, , scenarioPath, outDir = '.'] = process.argv;
const sc = JSON.parse(readFileSync(scenarioPath, 'utf8'));
mkdirSync(outDir, { recursive: true });
const port = 9300 + Math.floor(Math.random() * 500);
const prof = join(tmpdir(), 'cdp-' + port);
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const gpuFlags = sc.gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const proc = spawn(chrome, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${sc.width || 1600},${sc.height || 900}`,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', ...gpuFlags, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(path) {
  for (let i = 0; i < 60; i++) {
    try { return await (await fetch(`http://127.0.0.1:${port}${path}`)).json(); } catch { await sleep(250); }
  }
  throw new Error('chrome did not start');
}

const results = {};
let traceEvents = [], traceDone = null, traceT0 = 0;
/** 按线程合并顶层耗时区间，得到窗口内各线程的忙碌毫秒数与最耗时的事件名 */
function summarizeTrace(evs, wallMs) {
  const names = new Map(), procs = new Map();
  for (const e of evs) {
    if (e.ph === 'M' && e.name === 'thread_name') names.set(e.pid + ':' + e.tid, e.args.name);
    if (e.ph === 'M' && e.name === 'process_name') procs.set(e.pid, e.args.name);
  }
  const byThread = new Map(), byName = new Map();
  for (const e of evs) {
    if (e.ph !== 'X' || !e.dur) continue;
    const k = e.pid + ':' + e.tid;
    if (!byThread.has(k)) byThread.set(k, []);
    byThread.get(k).push([e.ts, e.ts + e.dur]);
    const nk = (names.get(k) || '?') + ' / ' + e.name;
    byName.set(nk, (byName.get(nk) || 0) + e.dur);
  }
  const busy = {};
  for (const [k, iv] of byThread) {
    iv.sort((a, b) => a[0] - b[0]);
    let tot = 0, cs = -1, ce = -1;
    for (const [s, e] of iv) { if (s > ce) { if (ce > cs) tot += ce - cs; cs = s; ce = e; } else ce = Math.max(ce, e); }
    if (ce > cs) tot += ce - cs;
    const pid = +k.split(':')[0];
    const label = (procs.get(pid) || 'proc') + ' · ' + (names.get(k) || k);
    busy[label] = (busy[label] || 0) + tot / 1000;
  }
  const top = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n, d]) => [n, Math.round(d / 1000)]);
  const busyR = Object.fromEntries(Object.entries(busy).filter(([, v]) => v > 5).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)]));
  // 细项：主线程帧数、各 JS 回调（按文件:函数）耗时、被重绘的节点
  let frames = 0;
  const fn = new Map(), paints = new Map();
  for (const e of evs) {
    if (e.ph !== 'X') continue;
    const d = e.args && e.args.data;
    if (e.name === 'BeginMainFrame') frames++;
    else if (e.name === 'FunctionCall' && d) {
      const k = String(d.url || '').split('/').pop() + ':' + (d.functionName || '?');
      const v = fn.get(k) || [0, 0]; v[0] += e.dur || 0; v[1]++; fn.set(k, v);
    } else if (e.name === 'Paint' && d && d.nodeId != null) {
      const v = paints.get(d.nodeId) || [0, 0]; v[0] += e.dur || 0; v[1]++; paints.set(d.nodeId, v);
    }
  }
  const fnTop = [...fn.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 8).map(([k, v]) => [k, Math.round(v[0] / 1000), v[1]]);
  const paintTop = [...paints.entries()].sort((a, b) => b[1][1] - a[1][1]).slice(0, 8).map(([k, v]) => [k, Math.round(v[0] / 1000), v[1]]);
  // 动画能否交给合成器：Chrome 在尝试把动画放上合成器时记录失败原因（compositeFailed 位掩码 + 不支持的属性）
  const animInfo = new Map(), animFail = new Map();
  for (const e of evs) {
    if (e.name !== 'Animation' || !e.args || !e.args.data) continue;
    const d = e.args.data;
    if (d.name != null || d.nodeName != null) animInfo.set(e.id2?.local ?? e.id ?? e.id2, d);
    if (d.compositeFailed != null) animFail.set(e.id2?.local ?? e.id ?? e.id2, d);
  }
  const compFail = {};
  for (const [id, f] of animFail) {
    const info = animInfo.get(id) || {};
    const k = (info.name || info.displayName || '?') + ' @' + (info.nodeName || '?') + ' fail=' + f.compositeFailed + (f.unsupportedProperties && f.unsupportedProperties.length ? ' props=' + f.unsupportedProperties.join('|') : '');
    compFail[k] = (compFail[k] || 0) + 1;
  }
  return { wallMs, busyMs: busyR, top, frames, fnTop, paintTop, compFail };
}
try {
  const tabs = await json('/json/list');
  const page = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (d.method === 'Tracing.dataCollected') traceEvents.push(...d.params.value);
    else if (d.method === 'Tracing.tracingComplete' && traceDone) traceDone();
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { return (${expr}); })()`, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || '') };
    return r.result && r.result.result ? r.result.result.value : r;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  const metrics = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: sc.dpr || (sc.mobile ? 3 : 1), mobile: !!sc.mobile, screenOrientation: sc.mobile ? { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } : undefined });
  await metrics(sc.width || 1600, sc.height || 900);
  if (sc.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (sc.ua) await send('Emulation.setUserAgentOverride', { userAgent: sc.ua });
  if (sc.cpu) await send('Emulation.setCPUThrottlingRate', { rate: sc.cpu });
  await send('Page.navigate', { url: sc.url });
  await sleep(500);
  for (const st of sc.steps) {
    if (st.wait) await sleep(st.wait);
    else if (st.eval) { const v = await evaluate(st.eval); if (st.as) results[st.as] = v; }
    else if (st.grab) {
      // 画布存成 PNG：{ grab: "css 选择器", file: "前缀" } → 前缀-000.png …（按 400 KB 分块取回；超高的整页截图在软件渲染下会卡住，逐个画布取就没事）
      const sel = JSON.stringify(st.grab), n = await evaluate(`document.querySelectorAll(${sel}).length`);
      for (let i = 0; i < n; i++) {
        const len = await evaluate(`(window.__g = document.querySelectorAll(${sel})[${i}].toDataURL('image/png')).length`);
        let url = '';
        for (let k = 0; k < len; k += 4e5) url += await evaluate(`window.__g.slice(${k}, ${k + 4e5})`);
        writeFileSync(join(outDir, `${st.file || 'grab'}-${String(i).padStart(3, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
      }
      await evaluate('(window.__g = null, 0)');
      if (st.as) results[st.as] = n;
    }
    else if (st.dump) {
      // 大结果（几十 MB 的 JSON）：先在页面里 JSON.stringify，再按 500 KB 分块取回、写进文件（一次 returnByValue 太大会卡住）
      const n = await evaluate(`(window.__dump = JSON.stringify(${st.dump})).length`);
      const parts = [];
      for (let i = 0; i < n; i += 5e5) parts.push(await evaluate(`window.__dump.slice(${i}, ${i + 5e5})`));
      await evaluate('(window.__dump = null, 0)');
      writeFileSync(join(outDir, st.file || 'dump.json'), parts.join(''));
      if (st.as) results[st.as] = n;
    }
    else if (st.tap) {
      let [x, y] = [st.x, st.y];
      if (st.expr) [x, y] = await evaluate(st.expr);
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(60);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    else if (st.cpu) await send('Emulation.setCPUThrottlingRate', { rate: st.cpu });
    else if (st.size) await metrics(st.size[0], st.size[1]);
    else if (st.mouse) {
      // 鼠标：{ mouse: 'down' | 'move' | 'up', x, y } 或 { mouse, expr: 'js，返回 [x, y]' }；页面会收到对应的 pointer 事件
      let [x, y] = [st.x, st.y];
      if (st.expr) [x, y] = await evaluate(st.expr);
      const type = { down: 'mousePressed', move: 'mouseMoved', up: 'mouseReleased' }[st.mouse];
      await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: st.mouse === 'up' ? 0 : 1, clickCount: 1 });
    }
    else if (st.shot) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(outDir, st.shot), Buffer.from(r.result.data, 'base64'));
    } else if (st.trace === 'start') {
      // 追踪各线程（主线程 / 合成器 / 光栅化 / GPU 进程）的忙碌时间
      traceEvents = [];
      await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,viz,cc,gpu,blink,blink.animations,toplevel', transferMode: 'ReportEvents' });
      traceT0 = Date.now();
    } else if (st.trace === 'stop') {
      const done = new Promise((r) => (traceDone = r));
      await send('Tracing.end');
      await done;
      const sum = summarizeTrace(traceEvents, Date.now() - traceT0);
      // 把被重绘节点的 backendNodeId 翻译成 标签.类名
      if (sum.paintTop.length) {
        await send('DOM.getDocument', { depth: 0 });
        for (const p of sum.paintTop) {
          const r = await send('DOM.describeNode', { backendNodeId: p[0] });
          const n = r.result && r.result.node;
          if (n) { const a = n.attributes || []; const ci = a.indexOf('class'); const ii = a.indexOf('id'); p[0] = n.nodeName.toLowerCase() + (ii >= 0 ? '#' + a[ii + 1] : '') + (ci >= 0 ? '.' + a[ci + 1].split(' ').join('.') : ''); }
        }
      }
      results[st.as || 'trace'] = sum;
    } else if (st.perf === 'start') {
      await evaluate(`(() => {
        window.__pf = { frames: [], slow: [], long: [], t0: performance.now() };
        window.__marks = [];
        let last = performance.now();
        const tick = (t) => {
          const p = window.__pf; if (!p) return;
          const d = t - last; p.frames.push(d); if (d > 33.4) p.slow.push([Math.round(last - p.t0), Math.round(d)]);
          last = t; requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        try { window.__pfo = new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__pf && window.__pf.long.push([Math.round(e.startTime - window.__pf.t0), Math.round(e.duration)]))); window.__pfo.observe({ entryTypes: ['longtask'] }); } catch (e) {}
        // 长动画帧（LoAF）：给出脚本 / 样式布局 / 绘制各占多少
        window.__pf.loaf = [];
        try {
          window.__pfl = new PerformanceObserver((l) => l.getEntries().forEach((e) => {
            const p = window.__pf; if (!p || e.duration < 50) return;
            p.loaf.push({ at: Math.round(e.startTime - p.t0), dur: Math.round(e.duration),
              script: Math.round((e.scripts || []).reduce((s, x) => s + x.duration, 0)),
              style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0),
              render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0),
              top: [...(e.scripts || [])].sort((a, b) => b.duration - a.duration).slice(0, 3).map((x) => Math.round(x.duration) + 'ms ' + (x.invoker || '') + ' ' + (x.sourceFunctionName || '') + ' ' + (x.sourceURL || '').split('/').pop() + ':' + (x.sourceCharPosition ?? '')) });
          }));
          window.__pfl.observe({ type: 'long-animation-frame', buffered: false });
        } catch (e) {}
        return true;
      })()`);
    } else if (st.perf === 'stop') {
      const v = await evaluate(`(() => {
        const p = window.__pf; window.__pf = null; if (window.__pfo) window.__pfo.disconnect(); if (window.__pfl) window.__pfl.disconnect();
        const f = p.frames.slice(1).sort((a, b) => a - b);
        const q = (x) => f.length ? +f[Math.min(f.length - 1, Math.floor(x * f.length))].toFixed(1) : 0;
        return { ms: Math.round(performance.now() - p.t0), frames: f.length, avg: f.length ? +(f.reduce((s, v) => s + v, 0) / f.length).toFixed(2) : 0,
          p50: q(0.5), p95: q(0.95), max: f.length ? +f[f.length - 1].toFixed(1) : 0, over33: f.filter((v) => v > 33.4).length, over50: f.filter((v) => v > 50).length,
          slowFrames: p.slow, longtasks: p.long, loaf: p.loaf,
          marks: (window.__marks || []).map((m) => [m.name, Math.round(m.t - p.t0), m.ms]).filter((m) => m[1] >= 0) };
      })()`);
      results[st.as || 'perf'] = v;
    }
  }
  ws.close();
} catch (e) {
  results.error = String(e && e.stack || e);
} finally {
  proc.kill();
  await sleep(300);
  try { rmSync(prof, { recursive: true, force: true }); } catch {}
}
console.log(JSON.stringify(results, null, 1));
