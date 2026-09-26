/* =========================================================
 * 声景（soundscape）：全部由 WebAudio 即时合成，不下载任何音频文件
 *
 * - 形态底色：术师＝火山低鸣、余烬噼啪、远处的风；医疗＝高处的风、细雨、鸟鸣与风铃
 * - 随滚动切换的场景：剧场的室内声、战场的远鼓与低鸣（技能生效时跟着变）、故事里每一章自己的声音
 *   （翻书与钟摆、碎屑流的咆哮、台灯下的信、渐远的声音、会浮起来的石头嗞嗞作响……）、足迹里跟在身后的羊蹄声、
 *   火山剖面随阶段变化；故事区的录音带每一轨都是一段合成出来的旧录音
 * - 生成式音乐底：术师 D 多利亚（暗、低、木琴），医疗 F 利底亚（亮、高、钢片琴）；和弦缓慢滑动，偶尔落下几个音
 * - 听觉：默认像隔着一层（两级低通 + 堵耳的低频鼓胀 + 微弱耳鸣）；助听器开机提示音之后，世界一点点变清晰
 * - 性能：噪声 / 纹理在 Worker 里只生成一次、循环播放；用不到的层淡出后整层拆除；算法混响没有声音送进来时断开；
 *   零散事件按“提前 0.3 秒排程”批量创建；关闭声音或切到后台时挂起整个音频上下文（音频线程零开销）
 *
 * 由 audio.js 在第一次用户手势时创建：SOUNDSCAPE.create(ac, master, hooks)
 * master 是 audio.js 的“开关 / 语音闪避”增益；这里接管它之后的整条链路。
 * ========================================================= */
window.SOUNDSCAPE = (() => {
  'use strict';
  const DEBUG = /[?&]debug\b/.test(location.search);

  /* ---------------------------------------------------- 设置（本机记忆） */
  const KEY = 'eyja.sound';
  const DEF = { vol: 0.8, amb: 0.9, mus: 0.7, sfx: 0.8, tin: true, hover: true, on: false, clear: false };
  const cfg = Object.assign({}, DEF);
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* 隐私模式 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* 无妨 */ } };

  const subs = new Set();
  const emit = (what) => subs.forEach((fn) => { try { fn(what); } catch (e) { /* 界面出错不影响声音 */ } });

  const idle = window.requestIdleCallback ? (fn) => requestIdleCallback(fn, { timeout: 900 }) : (fn) => setTimeout(fn, 60);

  /* ====================================================
   * 噪声与纹理的合成：纯函数（不引用任何外部变量），整段源码被放进 Worker 里运行，
   * 返回各声道的 Float32Array。循环都做了无缝处理：噪声首尾交叉淡化，纹理里的小事件环绕写入。
   * ==================================================== */
  function SYNTH(name, sr) {
    function norm(chs, peak) {
      let m = 1e-9;
      for (const d of chs) for (let i = 0; i < d.length; i++) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > m) m = v; }
      const k = peak / m;
      for (const d of chs) for (let i = 0; i < d.length; i++) d[i] *= k;
      return chs;
    }
    /** 立体声噪声：白 / 粉（Paul Kellet 滤波）/ 褐（漏积分） */
    function noise(type, secs) {
      const L = Math.round(sr * secs), X = Math.round(sr * 0.2), d = new Float32Array(L + X), chs = [];
      const T = type === 'white' ? 0 : type === 'pink' ? 1 : 2;
      // 褐噪声只用在 200Hz 以下的低鸣上，那里听不出立体声宽度：单声道，后面整条链路的开销减半
      for (let c = 0; c < (T === 2 ? 1 : 2); c++) {
        let x = ((0x9e3779b9 ^ (c * 7919 + type.length * 104729)) >>> 0) || 1;
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0, mean = 0;
        for (let i = 0; i < L + X; i++) {
          x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
          const w = (x >>> 0) / 2147483648 - 1;
          if (T === 0) d[i] = w;
          else if (T === 1) {
            b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
            b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
            d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
          } else { last = (last + 0.02 * w) / 1.02; d[i] = last; mean += last; }
        }
        if (T === 2) { mean /= L + X; for (let i = 0; i < L + X; i++) d[i] -= mean; }
        const out = new Float32Array(L);
        out.set(d.subarray(X, L), X);
        for (let i = 0; i < X; i++) { const k = i / X; out[i] = d[i] * Math.sqrt(k) + d[L + i] * Math.sqrt(1 - k); }
        chs.push(out);
      }
      return norm(chs, 0.95);
    }
    /** 纹理：在一段立体声循环里撒下许多短促的小事件 */
    function tex(secs, seed, fill) {
      const L = Math.round(sr * secs), chs = [new Float32Array(L), new Float32Array(L)];
      for (let c = 0; c < 2; c++) {
        let x = ((seed * 131 + c * 7919 + 1) >>> 0) || 1;
        const u = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
        fill(chs[c], L, u, c);
      }
      return norm(chs, 0.9);
    }
    const nextT = (u, rate) => -Math.log(1 - u() * 0.999) / rate;
    /** 衰减正弦（“嗒”的一声），环绕写入 */
    function ping(d, L, i0, f, tau, a) {
      const n = Math.min(L, (tau * sr * 7) | 0), w = (2 * Math.PI * f) / sr, k = Math.exp(-1 / (tau * sr));
      let e = a, ph = 0;
      for (let j = 0, i = i0 % L; j < n; j++) { d[i] += e * Math.sin(ph); ph += w; e *= k; if (++i === L) i = 0; }
    }
    /** 上扬的气泡音 */
    function chirp(d, L, i0, f0, f1, dur, tau, a) {
      const n = Math.min(L, ((dur + tau * 5) * sr) | 0), k = Math.exp(-1 / (tau * sr)), ds = dur * sr;
      let ph = 0, e = a;
      for (let j = 0, i = i0 % L; j < n; j++) {
        const f = f0 * Math.pow(f1 / f0, Math.min(1, j / ds));
        ph += (2 * Math.PI * f) / sr; d[i] += e * Math.sin(ph); e *= k;
        if (++i === L) i = 0;
      }
    }
    switch (name) {
      case 'white': return noise('white', 3);
      case 'pink': return noise('pink', 6);
      case 'brown': return noise('brown', 6);
      // 余烬：稀疏的噼啪，一簇里有 1~6 下，偶尔一下特别响
      case 'crackle': return tex(6, 3, (d, L, u) => {
        for (let t = u() * 0.05; t < 6; t += nextT(u, 11)) {
          const n = 1 + ((u() * u() * 6) | 0), big = u() < 0.08;
          let i = (t * sr) | 0;
          for (let k = 0; k < n; k++) {
            const a = (big ? 0.55 : 0.1) + u() * u() * u() * (big ? 0.45 : 0.5);
            ping(d, L, i, 1400 + u() * 5200, 0.00012 + u() * 0.0005, u() < 0.5 ? -a : a);
            i += ((0.0006 + u() * 0.007) * sr) | 0;
          }
        }
      });
      // 细雨：密密的小雨点 + 偶尔落在叶子上的大一点的水滴
      case 'rain': return tex(6, 5, (d, L, u) => {
        for (let t = 0; t < 6; t += nextT(u, 90)) ping(d, L, (t * sr) | 0, 2600 + u() * 6500, 0.00004 + u() * 0.00018, 0.04 + Math.pow(u(), 4) * 0.35);
        for (let t = 0; t < 6; t += nextT(u, 3.5)) ping(d, L, (t * sr) | 0, 700 + u() * 1500, 0.0008 + u() * 0.0022, 0.12 + u() * 0.3);
      });
      // 蟋蟀：三只，各自的音高、节奏与方位（周期整除循环长度，接缝处节奏不乱）
      case 'crickets': return tex(6, 7, (d, L, u, c) => {
        [[4480, 6, -0.6, 0.5], [4720, 5, 0.55, 0.36], [4250, 7, 0.1, 0.26]].forEach(([f0, k, p, amp], ci) => {
          const g = amp * (c === 0 ? (1 - p) / 2 : (1 + p) / 2) * 1.6, per = 6 / k, off = ((ci * 0.37) % 1) * per;
          for (let j = 0; j < k; j++) {
            const ts = off + j * per, pulses = 3 + (j % 2), w = (2 * Math.PI * f0 * (1 + (j % 3) * 0.002)) / sr, n = (0.016 * sr) | 0;
            for (let q = 0; q < pulses; q++) {
              const i0 = ((ts + q * 0.034) * sr) | 0;
              for (let s = 0; s < n; s++) { const e = Math.sin((Math.PI * s) / n); d[(i0 + s) % L] += g * e * e * Math.sin(w * s); }
            }
          }
        });
      });
      // 浮石在水里：细碎的嗞嗞声一阵紧一阵松 + 冒上来的气泡（“这即是生命之歌”）
      case 'fizz': return tex(5, 9, (d, L, u) => {
        for (let t = 0; t < 5; t += nextT(u, 170)) {
          if (u() > 0.55 + 0.45 * Math.sin((2 * Math.PI * t) / 1.25)) continue;
          ping(d, L, (t * sr) | 0, 4500 + u() * 7000, 0.00003 + u() * 0.00008, 0.05 + Math.pow(u(), 3) * 0.3);
        }
        for (let t = 0; t < 5; t += nextT(u, 6)) { const f0 = 450 + u() * 900; chirp(d, L, (t * sr) | 0, f0, f0 * (1.5 + u() * 0.6), 0.015 + u() * 0.025, 0.006 + u() * 0.008, 0.12 + u() * 0.25); }
      });
      // 掌声：许多次短促的共振噪声
      case 'claps': return tex(4, 13, (d, L, u) => {
        for (let t = 0; t < 4; t += nextT(u, 38)) {
          const i0 = (t * sr) | 0, n = ((0.006 + u() * 0.01) * sr) | 0, f = 900 + u() * 1400, r = 0.93, cw = 2 * r * Math.cos((2 * Math.PI * f) / sr), a = 0.2 + u() * 0.8;
          let y1 = 0, y2 = 0;
          for (let q = 0; q < n * 3; q++) {
            const x = q < n ? (u() * 2 - 1) * Math.exp((-4 * q) / n) : 0, y = x + cw * y1 - r * r * y2;
            y2 = y1; y1 = y; d[(i0 + q) % L] += a * y * 0.25;
          }
        }
      });
      default: return noise('white', 1);
    }
  }

  /* ====================================================
   * 场景表
   *  layers：持续的声层（数值为响度，1 ≈ 这一层的“正常音量”）
   *  ev：零散事件（每秒次数）
   *  bed：形态底色（上面 BED）保留多少；pad / mel：音乐垫与旋律的多少；wet：混响
   *  dark：音乐变暗；deaf：听力进一步下降（渐远的声音）
   *  base / alter：只在某一形态生效的覆盖
   * ==================================================== */
  const BED = {
    base: { layers: { rumble: 0.85, windLow: 0.55, crackle: 0.55 }, ev: { pop: 0.14 } },
    alter: { layers: { windHi: 0.75, drizzle: 0.4 }, ev: { bird: 0.085, chime: 0.1, drop: 0.3 } },
  };
  const ZONES = {
    hero: { lb: ['熔岩低鸣 · 余烬噼啪', '高处的风 · 细雨与风铃'], bed: 1, pad: 0.8, mel: 0.55, wet: 0.35 },
    theater: { lb: '剧场 · 室内', bed: 0.3, layers: { room: 0.9 }, pad: 0.75, mel: 0.45, wet: 0.55 },
    // 小剧场的八个布景（.th-stage 上的 sc-xxx 类）
    'th:study': { lb: '剧场 · 夜里的宿舍书房', bed: 0.1, layers: { room: 0.8, hearth: 0.2 }, ev: { clock: 0.8, page: 0.03 }, pad: 0.6, mel: 0.35, wet: 0.2 },
    'th:dusk': { lb: '剧场 · 黄昏的火山地带', bed: 0.3, layers: { rumble: 0.8, windLow: 0.7, crackle: 0.4 }, ev: { boomFar: 0.03, blorp: 0.1 }, pad: 0.6, mel: 0.3, wet: 0.45 },
    'th:museum': { lb: '剧场 · 午后的火山博物馆', bed: 0.15, layers: { room: 0.8 }, ev: { bird: 0.04, page: 0.02 }, pad: 0.8, mel: 0.6, wet: 0.7 },
    'th:meadow': { lb: '剧场 · 晴空下的草坡', bed: 0.3, layers: { windHi: 0.5 }, ev: { bird: 0.15, bee: 0.04, bell: 0.06 }, pad: 0.8, mel: 0.6, wet: 0.35 },
    'th:beach': { lb: '剧场 · 珊瑚海岸', bed: 0.15, layers: { sea: 1, windHi: 0.3 }, ev: { bird: 0.03 }, pad: 0.75, mel: 0.6, wet: 0.35 },
    'th:magic': { lb: '剧场 · 钟楼下的夜', bed: 0.15, layers: { windLow: 0.5, crickets: 0.35 }, ev: { chime: 0.05 }, pad: 0.9, mel: 0.7, inst: 'box', wet: 0.6 },
    'th:picnic': { lb: '剧场 · 云朵上的野餐', bed: 0.2, layers: { windTop: 0.45 }, ev: { bird: 0.08, chime: 0.08 }, pad: 0.9, mel: 0.7, wet: 0.5, bright: 1 },
    'th:home': { lb: '剧场 · 家', bed: 0.1, layers: { room: 0.7, hearth: 0.4 }, ev: { page: 0.02 }, pad: 0.7, mel: 0.45, inst: 'box', wet: 0.25 },
    combat: { lb: ['战场 · 远鼓与熔岩', '战场 · 远鼓与细雨'], bed: 0.45, layers: { drone: 0.7 }, ev: { war: 1 }, pad: 0.25, mel: 0, wet: 0.3 },
    story: { lb: '故事', bed: 0.75, pad: 0.9, mel: 0.45, wet: 0.35 },
    'ch:study': { lb: '学者之家 · 书页与钟摆', bed: 0.15, layers: { room: 0.8, hearth: 0.3 }, ev: { clock: 1, page: 0.07 }, pad: 0.6, mel: 0.35, wet: 0.18 },
    'ch:trophy': { lb: '宠物大赛 · 掌声与铃铛', bed: 0.25, layers: { crowd: 0.8 }, ev: { bell: 0.22 }, pad: 0.8, mel: 0.9, wet: 0.35 },
    'ch:eruption': { lb: '碎屑流 · 山在咆哮', bed: 0.5, layers: { rumble: 0.75, roar: 0.65, deep: 0.7 }, ev: { thud: 0.45, boomFar: 0.1 }, pad: 0.35, mel: 0, wet: 0.45, dark: 1 },
    'ch:letter': { lb: '夹在文件里的信 · 台灯下', bed: 0.12, layers: { room: 0.6, hearth: 0.22 }, ev: { page: 0.04 }, pad: 0.7, mel: 0.25, wet: 0.15, inst: 'box' },
    'ch:sound': { lb: '渐远的声音 · 世界在远去', bed: 0.55, layers: { windLow: 0.5 }, pad: 0.45, mel: 0, wet: 0.55, deaf: 1 },
    'ch:cake': { lb: '前辈 · 生日的熔岩蛋糕', bed: 0.15, layers: { room: 0.7, hearth: 0.15 }, pad: 0.8, mel: 1.1, inst: 'box', wet: 0.25 },
    'ch:field': { lb: '外勤三日 · 仪器与热地', bed: 0.55, layers: { steam: 0.6, windLow: 0.5 }, ev: { geiger: 1, thud: 0.05 }, pad: 0.4, mel: 0.15, wet: 0.3 },
    'ch:camp': { lb: '荒地营火 · 夜', bed: 0.15, layers: { hearth: 0.75, crickets: 0.65, windLow: 0.35 }, ev: { pop: 0.14 }, pad: 0.6, mel: 0.3, wet: 0.35 },
    'ch:parade': { lb: '汐斯塔 · 海浪与小羊', bed: 0.25, layers: { sea: 0.9, windHi: 0.25 }, ev: { bell: 0.2, bird: 0.05 }, pad: 0.8, mel: 0.85, wet: 0.35 },
    'ch:portrait': { lb: '梦与喷发之间', bed: 0.35, layers: { rumble: 0.5, deep: 0.4 }, ev: { chime: 0.08, boomFar: 0.03 }, pad: 1, mel: 0.4, wet: 0.7 },
    'ch:pumice': { lb: '会浮起来的石头 · 嗞嗞作响', bed: 0.25, layers: { fizz: 0.85, lapping: 0.6 }, ev: { drop: 0.25 }, pad: 0.7, mel: 0.4, wet: 0.3 },
    'ch:cassette': { lb: '想要留住的声音 · 一盘录音带', bed: 0.2, layers: { tape: 1 }, pad: 0.3, mel: 0, wet: 0.2 },
    'ch:letters': { lb: '两封信 · 笔尖沙沙', bed: 0.3, layers: { room: 0.55 }, ev: { pen: 0.1, page: 0.05 }, pad: 0.7, mel: 0.3, wet: 0.2 },
    'ch:flower': { lb: '预警花 · 花园里的风', bed: 0.55, layers: { windHi: 0.35 }, ev: { bird: 0.16, chime: 0.07, bee: 0.035 }, pad: 0.8, mel: 0.5, wet: 0.3 },
    'ch:night': { lb: '乌纳村 · 小羊领着她夜里上山', bed: 0.2, layers: { crickets: 0.8, windLow: 0.45 }, ev: { bell: 0.1, owl: 0.03, step: 0.5 }, pad: 0.6, mel: 0.3, wet: 0.4 },
    'ch:summit': { lb: '乌纳火山之巅 · 高处的风', bed: 0.25, layers: { windTop: 1 }, ev: { chime: 0.05 }, pad: 1.1, mel: 0.6, wet: 0.55, bright: 1 },
    journey: { lb: '足迹 · 一步，又一步', bed: 0.55, pad: 0.85, mel: 0.55, wet: 0.35 },
    'jn:trail': { lb: '足迹 · 小路上，一串羊蹄印跟着她', bed: 0.4, ev: { step: 1, bell: 0.05 }, pad: 0.7, mel: 0.45, wet: 0.3 },
    'jn:web': { lb: '足迹 · 她身边的星图', bed: 0.3, ev: { chime: 0.09 }, pad: 1, mel: 0.75, wet: 0.55, bright: 1 },
    // 影像区：放映厅里安静下来（MV 放映时整套声景让位，见 audio.js 的 hold）
    mv: { lb: '影像 · 放映厅', bed: 0.25, layers: { room: 0.5 }, pad: 0.45, mel: 0.15, wet: 0.45 },
    gallery: { lb: '画廊 · 展厅', bed: 0.3, layers: { room: 0.6 }, pad: 1, mel: 0.7, wet: 0.6 },
    archive: { lb: '档案室 · PRTS 终端', bed: 0.3, layers: { room: 0.6, hum: 0.6 }, ev: { blip: 0.07, page: 0.03 }, pad: 0.6, mel: 0.25, wet: 0.25 },
    voice: { lb: '语音 · 安静下来', bed: 0.3, pad: 0.3, mel: 0, wet: 0.3 },
    sheep: {
      lb: ['小羊 · 书房里的炉火', '小羊 · 休息室的窗外'], bed: 0.3, pad: 0.8, mel: 0.6, wet: 0.3,
      base: { layers: { room: 0.6, hearth: 0.45 }, ev: { bell: 0.1 } },
      alter: { layers: { sea: 0.3, windHi: 0.3 }, ev: { bird: 0.1, bell: 0.1 } },
    },
    volcano: {
      lb: ['火山 · 大地沸腾', '火山 · 地热与高空的风'], bed: 0.8, pad: 0.55, mel: 0.2, wet: 0.45,
      base: { layers: { rumble: 0.7, deep: 0.45, crackle: 0.5, roar: 0.15 }, ev: { blorp: 0.35, boomFar: 0.04, thud: 0.08 } },
      alter: { layers: { windTop: 0.5, steam: 0.45, rumble: 0.35 }, ev: { chime: 0.04 } },
    },
    vx: { lb: '火山剖面', bed: 0.5, pad: 0.4, mel: 0, wet: 0.45 },
    trivia: { lb: '冷知识', bed: 0.6, ev: { chime: 0.04 }, pad: 0.8, mel: 0.8, wet: 0.35 },
    footer: { lb: '尾声 · 风停下来', bed: 0.35, pad: 1, mel: 0.45, wet: 0.5 },
  };
  // 火山剖面：五个阶段各自的声音（蓄积的地震群 → 裂隙熔岩喷泉 → 冰下爆发的蒸汽 → 灰柱与火山闪电 → 平息后的水汽）
  const STAGES = [
    { layers: { rumble: 0.9, deep: 0.6 }, ev: { thud: 0.45 } },
    { layers: { rumble: 0.8, roar: 0.55, crackle: 0.9 }, ev: { blorp: 0.6, pop: 0.3 } },
    { layers: { rumble: 0.8, roar: 0.45, steam: 1 }, ev: { boomFar: 0.12 } },
    { layers: { rumble: 0.65, roar: 0.55, deep: 0.4 }, ev: { thunder: 0.1, boomFar: 0.08 } },
    { layers: { steam: 0.35, windLow: 0.6, rumble: 0.3 }, ev: {} },
  ];
  const STAGE_LB = ['蓄积 · 地下的震颤', '裂隙喷发 · 熔岩喷泉', '冰下爆发 · 蒸汽', '灰柱与闪电', '平息 · 只剩水汽'];

  /* 音乐：术师 D 多利亚（低、暗）；医疗 F 利底亚（高、亮）。每个和弦 = [低音, 四个声部]（MIDI） */
  const PAD = {
    base: {
      ch: [[38, 57, 60, 64, 65], [34, 57, 60, 62, 65], [41, 57, 60, 64, 67], [36, 55, 60, 62, 64], [43, 57, 58, 62, 65]],
      nx: [[1, 2, 3, 4], [0, 2, 3], [0, 3, 1], [0, 1, 4], [0, 1]], cut: 820, dur: [14, 22],
      sc: [62, 65, 67, 69, 72, 74, 77], inst: 'marimba', step: [0.42, 0.63, 0.84, 0.42, 1.05],
    },
    alter: {
      ch: [[41, 60, 64, 67, 69], [43, 59, 62, 67, 69], [38, 60, 64, 65, 69], [36, 62, 64, 67, 69], [45, 60, 64, 67, 71]],
      nx: [[1, 2, 3, 4], [0, 3], [0, 3, 1], [0, 1, 4], [0, 2]], cut: 2100, dur: [10, 17],
      sc: [72, 74, 77, 79, 81, 84, 86], inst: 'celesta', step: [0.3, 0.45, 0.6, 0.9, 0.45],
    },
  };
  /* 她名字的动机：Ey-ja-fjal-la。术师 D—A—F，停在 G 上没有落地（还在追着父母的足迹）；
   * 医疗 F—C—A—G，最后回到 F（一步，又一步，走到了）。[起点秒, MIDI] */
  const MOTIF = {
    base: [[0, 74], [0.36, 69], [0.72, 65], [1.25, 67]],
    alter: [[0, 77], [0.3, 84], [0.6, 81], [0.9, 79], [1.5, 77]],
  };
  /* 乐器：若干正弦分音 [频率比, 振幅, 衰减时间常数(秒)] */
  const INST = {
    marimba: [[1, 0.5, 0.3], [3.98, 0.1, 0.045], [9.9, 0.025, 0.012]],
    celesta: [[1, 0.42, 0.85], [2, 0.12, 0.32], [3.01, 0.045, 0.14]],
    box: [[1, 0.4, 0.55], [2, 0.14, 0.26], [4.2, 0.05, 0.07], [6.1, 0.02, 0.03]],
    bell: [[1, 0.36, 1.1], [2.76, 0.11, 0.45], [5.4, 0.045, 0.22], [8.93, 0.018, 0.1]],
    sbell: [[1, 0.3, 0.3], [2.32, 0.16, 0.16], [3.86, 0.08, 0.09], [5.4, 0.04, 0.05]],
    tickW: [[1, 0.35, 0.028], [4, 0.07, 0.008]],
    tickG: [[1, 0.26, 0.05], [2.76, 0.07, 0.018]],
    ping: [[1, 0.4, 0.06]],
  };
  const WET = { marimba: 0.45, celesta: 0.85, box: 0.6, bell: 0.9, sbell: 0.5, tickW: 0.15, tickG: 0.35, ping: 0.2 };

  let current = null;

  /* ====================================================
   * 引擎
   * ==================================================== */
  function create(ac, master, hooks = {}) {
    const sr = ac.sampleRate;
    const rnd = Math.random;
    const R = (a, b) => a + (b - a) * rnd();
    const pick = (a) => a[(rnd() * a.length) | 0];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const expo = (rate) => -Math.log(1 - rnd() * 0.999) / Math.max(rate, 1e-4);
    const T = () => ac.currentTime;
    const stats = { events: 0, notes: 0, sfx: 0, layersBuilt: 0, bufMs: {} };

    let enabled = false, form = hooks.form === 'alter' ? 'alter' : 'base', clear = !!hooks.clear;
    // 音效的整体响度修正（按实测峰值校准）：调用某个音效时临时设为 SFXT[种类]，事件与音符的振幅都乘以它
    let K = 1;
    const SFXT = { hover: 0.5, click: 0.3, tick: 0.63, tab: 0.7, select: 0.6, slide: 1.4, open: 0.7, close: 2.5, flip: 1, reveal: 0.7, whoosh: 0.85, boom: 0.55, sparkle: 0.7, erupt: 0.6, steam: 0.35, fizz: 0.7, splash: 0.7, glass: 0.7, throw: 1.5, bleat: 1.8, heal: 0.8, whistle: 2, heat: 0.45, blow: 1.4, strike: 0.5, bong: 0.6, bounce: 0.18 };
    let cueing = false;
    let zone = 'hero', cur = null, swallowUntil = 0, semanticUntil = 0, combatK = 0, combatHot = 0, vxStage = -1;

    /* ---------------------------------------------------- 节点小工具 */
    /** 双二阶滤波。参数一律 k-rate：否则只要频率在滑动（游移、扫频），浏览器就会逐个样本重算滤波系数，
     *  一个滤波器就能吃掉半个百分点的 CPU；k-rate 每 128 个样本算一次，慢速扫频听不出差别 */
    function biq(type, f, q = 0.7, g = 0) {
      const b = ac.createBiquadFilter();
      b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g;
      krate(b.frequency, b.Q, b.gain, b.detune);
      return b;
    }
    function krate(...ps) { for (const p of ps) { try { p.automationRate = 'k-rate'; } catch (e) { /* 旧浏览器：保持 a-rate */ } } }
    function gain(v = 1) { const g = ac.createGain(); g.gain.value = v; return g; }
    function pan(p) { const s = ac.createStereoPanner(); s.pan.value = p; return s; }
    /** 平滑地把参数移到新值（从当前值出发，时间常数 tau 秒） */
    function glide(p, v, tau, t = T()) { p.cancelScheduledValues(t); p.setTargetAtTime(v, t, Math.max(0.004, tau)); }
    /** 一次性声源在 tEnd 停止，结束后断开整条小链路 */
    function done(src, tEnd, nodes) {
      src.stop(tEnd);
      src.onended = () => { try { src.disconnect(); } catch (e) { /* 已断开 */ } for (const n of nodes) { try { n.disconnect(); } catch (e) { /* 已断开 */ } } };
    }

    /* ---------------------------------------------------- 总线与听觉链
     * [各声层 / 事件] → amb / mus / fxb → master(开关·闪避) → 两级低通(听觉) → 低频鼓胀 → 临场感峰 → 音量 → 软限幅 → 输出
     * 混响：各处的发送 → revIn → 算法混响 → revOut → master（所以混响也被“听觉”滤过）
     * 耳鸣与助听器提示音在她的耳朵里：直接进音量级，不被低通
     * 注意：WebAudio 的 lowpass / highpass 的 Q 是“共振分贝数”，-3 ≈ 巴特沃斯（无峰）；bandpass / peaking 的 Q 才是通常意义的 Q */
    const amb = gain(cfg.amb), mus = gain(cfg.mus), fxb = gain(cfg.sfx);
    amb.connect(master); mus.connect(master); fxb.connect(master);
    krate(amb.gain, mus.gain, fxb.gain);
    const revIn = gain(1), revOut = gain(0.35);
    revIn.channelCount = 1; revIn.channelCountMode = 'explicit';
    let revM = null, revOn = false, revUntil = 0, revHold = 0;
    if (!hooks.noRev) buildReverb();
    revOut.connect(master);
    const MUF = 560;
    const lp1 = biq('lowpass', clear ? 19000 : MUF, -3), lp2 = biq('lowpass', clear ? 19000 : MUF, -3);
    const occl = biq('lowshelf', 190, 0.7, clear ? 0 : 2), pres = biq('peaking', 2800, 0.9, clear ? 1.5 : 0);
    const vol = gain(volGain());
    krate(vol.gain);
    const lim = softLimiter();
    master.connect(lp1); lp1.connect(lp2); lp2.connect(occl); occl.connect(pres); pres.connect(vol);
    // 助听器开着、滤波器已经完全打开时，把两级低通与低频鼓胀从链路里摘掉（它们此时是透明的，却仍要逐样本计算）
    let hearFull = true;
    function hearPath(full) {
      if (full === hearFull) return;
      hearFull = full;
      if (full) { master.disconnect(pres); master.connect(lp1); occl.connect(pres); }
      else { master.disconnect(lp1); occl.disconnect(pres); master.connect(pres); }
    }
    vol.connect(lim); lim.connect(ac.destination);
    const ear = gain(0); ear.connect(vol);
    // 音量级同时把信号缩小一半送进软限幅（限幅曲线按 2 倍还原），所以 +6dB 以内的过载也能被圆滑地压住
    function volGain() { return Math.pow(cfg.vol / 0.8, 2) * 1.6 * 0.5; }
    /** 软限幅：|x| < 0.6 完全线性，之上平滑地逼近 0.98（WaveShaper 查表，比压缩器便宜得多） */
    function softLimiter() {
      const w = ac.createWaveShaper(), n = 2049, c = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = ((i / (n - 1)) * 2 - 1) * 2, ax = Math.abs(x);
        c[i] = Math.sign(x) * (ax < 0.6 ? ax : 0.6 + 0.38 * Math.tanh((ax - 0.6) / 0.38));
      }
      w.curve = c; w.oversample = 'none';
      return w;
    }
    /** 混响：JCRev 式的算法混响——单声道输入 → 预延迟 → 两个串联全通（扩散）→ 六个并联、带阻尼的梳状滤波 → 立体声输出。
     *  实测 2.6 秒的卷积混响约占一个 CPU 核的 3%。这里尽量少用节点（每个节点每 128 个样本都有固定开销）：
     *  - 求和直接接在 DelayNode 的输入上（多条连接自动相加），不另设求和节点
     *  - 梳状滤波的反馈增益并进阻尼的一阶低通系数里：每个梳状滤波只要 延迟 + IIR 两个节点
     *  - 全通 y = -g·x + (1-g²)·延迟(v)：输出不单设节点，以“一组节点”的形式交给下一级
     *  另外，没有声音送进来时整套混响与输出断开（浏览器便不再处理它），见 revWake() */
    function buildReverb() {
      const dly = (sec, max) => { const d = ac.createDelay(max); d.delayTime.value = Math.round(sec * sr) / sr; krate(d.delayTime); return d; };
      const pd = dly(0.016, 0.05);
      revIn.connect(pd);
      let X = [pd];
      for (const [d, g] of [[0.0061, 0.7], [0.0097, 0.65]]) {
        const dl = dly(d, 0.02), fb = gain(g), gx = gain(-g), gd = gain(1 - g * g);
        for (const x of X) { x.connect(dl); x.connect(gx); }
        dl.connect(fb); fb.connect(dl); dl.connect(gd);
        X = [gx, gd];
      }
      const L = gain(0.3), Rt = gain(0.3);
      revM = ac.createChannelMerger(2);
      L.connect(revM, 0, 0); Rt.connect(revM, 0, 1);
      const RT = 2.2;
      [0.0297, 0.0371, 0.0411, 0.0437, 0.0473, 0.0503].forEach((d, i) => {
        // 阻尼：一阶低通 y = b·x + 0.62·y'，直流增益 = 反馈增益 g < 1（不可能有共振峰，反馈环一定稳定）
        const g = Math.pow(10, (-3 * d) / RT), dl = dly(d, 0.06), damp = ac.createIIRFilter([0.38 * g], [1, -0.62]);
        for (const x of X) x.connect(dl);
        dl.connect(damp); damp.connect(dl); dl.connect(i % 2 ? Rt : L);
      });
    }
    /** 有声音要进混响（到 tEnd 为止）：接上混响；尾音结束 3 秒后由排程循环断开 */
    function revWake(tEnd) {
      revUntil = Math.max(revUntil, tEnd + 3);
      if (!revOn && revM) { revM.connect(revOut); revOn = true; }
    }
    function revIdle(now) { if (revOn && !revHold && now > revUntil) { revM.disconnect(); revOn = false; } }
    /** 把一个节点送进混响（tEnd：它最迟响到什么时候） */
    function toRev(node, tEnd) { node.connect(revIn); revWake(tEnd); }

    // 预先放好的声像通道：事件只需一个增益节点接到某个通道上，不必每次新建声像节点
    const panA = [-0.8, -0.4, 0, 0.4, 0.8].map((p) => { const s = pan(p); s.connect(amb); return s; });
    const panF = [-0.55, 0, 0.55].map((p) => { const s = pan(p); s.connect(fxb); return s; });
    const panM = [-0.45, 0, 0.45].map((p) => { const s = pan(p); s.connect(mus); return s; });
    const chan = (bus, p = 0) => {
      if (typeof p !== 'number' || !isFinite(p)) p = 0;
      if (bus === 'ear') return ear;
      if (bus === 'amb') return panA[Math.max(0, Math.min(4, Math.round((p + 0.8) / 0.4)))];
      const arr = bus === 'mus' ? panM : panF;
      return arr[p < -0.2 ? 0 : p > 0.2 ? 2 : 1];
    };

    /* ---------------------------------------------------- 缓冲：噪声、纹理、混响脉冲
     * 合成在 Worker 里做（见文件开头的 SYNTH），主线程只做一次拷贝；每种只生成一次，之后一直循环使用。
     * 还没到的声层先不建，缓冲到了再淡入；零散事件暂时用白噪声顶上。 */
    const bufs = {}, pending = {};
    const ORDER = {
      base: ['white', 'brown', 'pink', 'crackle', 'rain', 'fizz', 'crickets', 'claps'],
      alter: ['white', 'pink', 'rain', 'brown', 'crackle', 'fizz', 'crickets', 'claps'],
    };
    let worker = null, workerDead = false, remixT = 0;
    function want(name) {
      if (bufs[name] || pending[name]) return;
      pending[name] = 1;
      if (!worker && !workerDead) {
        try {
          const code = 'const SYNTH = ' + SYNTH.toString() + ';\nonmessage = (e) => { const t0 = performance.now(), ch = SYNTH(e.data.name, e.data.sr); postMessage({ name: e.data.name, ch, ms: performance.now() - t0 }, ch.map((c) => c.buffer)); };';
          const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
          worker = new Worker(url);
          worker.onmessage = (e) => { URL.revokeObjectURL(url); got(e.data.name, e.data.ch, e.data.ms); };
          worker.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); workerDead = true; worker = null; for (const n in pending) local(n); };
        } catch (e) { workerDead = true; worker = null; }
      }
      if (worker) worker.postMessage({ name, sr }); else local(name);
    }
    /** 没有 Worker 时：在主线程的空闲时间里生成 */
    function local(name) { idle(() => { if (bufs[name]) return; const t0 = performance.now(); got(name, SYNTH(name, sr), performance.now() - t0); }); }
    function got(name, ch, ms) {
      if (bufs[name]) return;
      const b = ac.createBuffer(ch.length, ch[0].length, sr);
      ch.forEach((c, i) => b.copyToChannel(c, i));
      bufs[name] = b;
      delete pending[name];
      stats.bufMs[name] = Math.round(ms * 10) / 10;
      if (worker && !Object.keys(pending).length && ORDER.base.every((n) => bufs[n])) { worker.terminate(); worker = null; }
      if (enabled) { clearTimeout(remixT); remixT = setTimeout(() => applyMix(0.9), 40); }
    }
    /** 取缓冲：还没有就先请求，暂时用白噪声顶上（白噪声也还没有就返回 null） */
    function B(name) { if (bufs[name]) return bufs[name]; want(name); return bufs.white || null; }
    // 缓冲还没到时，一次性声音返回这个“哑”对象：调用方照常设置参数，什么也不会发生
    const NOPP = { value: 0, setValueAtTime: () => NOPP, linearRampToValueAtTime: () => NOPP, exponentialRampToValueAtTime: () => NOPP, setTargetAtTime: () => NOPP, cancelScheduledValues: () => NOPP };
    const DUMMY = { s: { connect() {} }, f: { frequency: NOPP }, g: { gain: NOPP, connect() {} } };
    // 每个声层需要的缓冲
    const NEEDS = {
      rumble: ['brown'], windLow: ['pink'], windHi: ['pink'], windTop: ['pink'], drizzle: ['white', 'rain'], crackle: ['crackle'],
      hearth: ['brown', 'crackle'], roar: ['brown', 'pink'], room: ['pink'], hum: ['white'], sea: ['pink', 'brown'], tape: ['white', 'brown'],
      crickets: ['crickets'], fizz: ['fizz'], lapping: ['brown'], steam: ['white'], crowd: ['claps', 'pink'],
    };

    /* ---------------------------------------------------- 持续声层 */
    const layers = new Map();
    function loop(L, name, rate = 1) {
      const s = ac.createBufferSource(), b = bufs[name];
      s.buffer = b; s.loop = true; s.playbackRate.value = rate;
      s.start(T(), rnd() * b.duration * 0.95);
      L.srcs.push(s);
      return s;
    }
    function newLayer(name) {
      const out = gain(0);
      krate(out.gain); // 声层的响度只做慢速淡入淡出与游移：k-rate 足够，省去逐样本计算
      out.connect(amb);
      const L = { name, out, send: null, srcs: [], nodes: [], drifts: [], kill: 0, level: 0 };
      // 混响发送：只给有“颗粒”的纹理（蟋蟀、掌声）。稳定的噪声（风、雨、低鸣）加混响几乎听不出来，却会让混响一直开着
      L.wet = (v) => { if (v > 0 && !L.send) { L.send = gain(v); krate(L.send.gain); out.connect(L.send); L.send.connect(revIn); revHold++; revWake(T()); } };
      L.n = (node) => { if (node.gain && node.gain.automationRate) krate(node.gain); L.nodes.push(node); return node; };
      L.osc = (type, f) => {
        const o = ac.createOscillator();
        if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
        o.frequency.value = f; krate(o.frequency, o.detune); o.start(); L.srcs.push(o); return o;
      };
      /** 每隔 a~b 秒调用一次 fn(t)：随机游移，比周期性的 LFO 自然，而且不占音频节点 */
      L.every = (a, b, fn) => L.drifts.push({ a, b, fn, next: T() + R(0, b * 0.4) });
      return L;
    }
    // 把几个节点串起来，最后接到层的输出
    const chain = (L, ...ns) => { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); ns[ns.length - 1].connect(L.out); };
    const RECIPES = {
      // 火山低鸣：褐噪声压到 110Hz 以下，频率与响度缓慢游移
      rumble(L) {
        const f = L.n(biq('lowpass', 110, 0.9)), g = L.n(gain(0.4));
        chain(L, loop(L, 'brown'), f, g);
        L.every(3, 9, (t) => { glide(f.frequency, R(70, 170), R(1.5, 4), t); glide(g.gain, R(0.25, 0.47), R(2, 5), t); });
      },
      // 山体深处的“心跳”：极低的正弦，时有时无
      deep(L) {
        const g = L.n(gain(0.35)), g1 = L.n(gain(0.41)), g2 = L.n(gain(0.19));
        L.osc('sine', 33).connect(g1); L.osc('sine', 49.5).connect(g2); g1.connect(g); g2.connect(g); g.connect(L.out);
        L.every(2, 6, (t) => glide(g.gain, R(0.15, 0.7), R(1.2, 3), t));
      },
      // 远处的风（术师）
      windLow(L) {
        const f = L.n(biq('bandpass', 320, 1.1)), g = L.n(gain(1));
        chain(L, loop(L, 'pink'), f, g);
        L.every(3, 8, (t) => { glide(f.frequency, R(200, 480), R(1.5, 3.5), t); glide(g.gain, R(0.35, 1), R(1.5, 3), t); });
      },
      // 高处的风（医疗）：宽带的气流 + 一缕若有若无的哨音；阵风来时风铃也更容易响
      windHi(L) {
        const s = loop(L, 'pink'), f = L.n(biq('bandpass', 950, 0.6)), g = L.n(gain(0.6));
        const w = L.n(biq('bandpass', 2400, 6)), wg = L.n(gain(0.1));
        s.connect(f); f.connect(g); g.connect(L.out); s.connect(w); w.connect(wg); wg.connect(L.out);
        L.every(2.5, 7, (t) => {
          const k = R(0.2, 1);
          glide(g.gain, 0.23 + 0.54 * k, R(0.8, 2.5), t); glide(f.frequency, 600 + 900 * k, R(1, 2.5), t);
          glide(w.frequency, R(1800, 3400), R(1.5, 4), t); glide(wg.gain, k * 0.11, R(1, 3), t);
          if (k > 0.8 && gens.has('chime')) gens.get('chime').next = Math.min(gens.get('chime').next, t + R(0.4, 1.2));
        });
      },
      // 山顶的大风
      windTop(L) {
        const s = loop(L, 'pink'), f = L.n(biq('bandpass', 700, 0.5)), g = L.n(gain(0.7));
        const w = L.n(biq('bandpass', 1900, 5)), wg = L.n(gain(0.1));
        s.connect(f); f.connect(g); g.connect(L.out); s.connect(w); w.connect(wg); wg.connect(L.out);
        L.every(2, 6, (t) => {
          const k = R(0.3, 1);
          glide(g.gain, 0.3 + 0.54 * k, R(0.6, 2), t); glide(f.frequency, 450 + 900 * k, R(0.8, 2), t);
          glide(w.frequency, R(1300, 2800), R(1, 3), t); glide(wg.gain, k * 0.13, R(0.8, 2.5), t);
        });
      },
      // 细雨：高频的沙沙声 + 烘焙好的雨滴纹理
      drizzle(L) {
        const hp = L.n(biq('highpass', 2200, 0.5)), lp = L.n(biq('lowpass', 7500, 0.5)), g = L.n(gain(0.08));
        chain(L, loop(L, 'white'), hp, lp, g);
        const rg = L.n(gain(0.5)); chain(L, loop(L, 'rain'), rg);
        L.every(4, 10, (t) => glide(g.gain, R(0.05, 0.11), R(2, 4), t));
      },
      // 余烬的噼啪
      crackle(L) {
        const g = L.n(gain(0.55));
        chain(L, loop(L, 'crackle'), g);
        L.every(1, 4, (t) => glide(g.gain, R(0.3, 0.7), R(0.3, 1), t));
      },
      // 炉火 / 营火 / 台灯：低沉的呼呼声（忽明忽暗）+ 噼啪
      hearth(L) {
        const f = L.n(biq('lowpass', 380, 0.8)), g = L.n(gain(0.28)), cg = L.n(gain(0.45));
        chain(L, loop(L, 'brown'), f, g);
        chain(L, loop(L, 'crackle'), cg);
        L.every(0.4, 1.4, (t) => { glide(g.gain, R(0.14, 0.38), R(0.12, 0.5), t); glide(f.frequency, R(250, 520), R(0.2, 0.6), t); });
      },
      // 熔岩喷泉 / 碎屑流的轰鸣
      roar(L) {
        const f = L.n(biq('lowpass', 600, 0.6)), g = L.n(gain(0.4)), nf = L.n(biq('bandpass', 700, 0.8)), ng = L.n(gain(0.14));
        chain(L, loop(L, 'brown'), f, g); chain(L, loop(L, 'pink'), nf, ng);
        L.every(0.8, 3, (t) => { glide(g.gain, R(0.25, 0.56), R(0.3, 1.2), t); glide(f.frequency, R(350, 900), R(0.5, 1.5), t); glide(ng.gain, R(0.06, 0.2), R(0.4, 1.2), t); });
      },
      // 室内底噪：空气与远处设备的低声
      room(L) {
        const f = L.n(biq('lowpass', 260, 0.5)), g = L.n(gain(0.13));
        chain(L, loop(L, 'pink'), f, g);
      },
      // 终端的电源嗡鸣 + 极轻的高频电流声
      hum(L) {
        const f = L.n(biq('lowpass', 300, 0.8)), g = L.n(gain(0.016)), hf = L.n(biq('bandpass', 7800, 8)), hg = L.n(gain(0.005));
        chain(L, L.osc('sawtooth', 50), f, g); chain(L, loop(L, 'white'), hf, hg);
      },
      // 海浪：一浪一浪地涨落，涨的时候更亮
      sea(L) {
        const f = L.n(biq('lowpass', 420, 0.5)), g = L.n(gain(0.16)), bg = L.n(gain(0.45));
        const s = loop(L, 'pink'), b = loop(L, 'brown');
        s.connect(f); b.connect(bg); bg.connect(f); f.connect(g); g.connect(L.out);
        L.every(6, 10, (t) => {
          const k = R(0.6, 1), up = R(1.6, 2.6);
          glide(g.gain, 0.48 * k, up / 3, t); glide(f.frequency, 900 + 900 * k, up / 3, t);
          glide(g.gain, 0.14, R(1.2, 1.8), t + up); glide(f.frequency, 380, R(1.2, 2), t + up);
        });
      },
      // 录音带：嘶声、微微的抖动、电机低沉的转动
      tape(L) {
        const f = L.n(biq('bandpass', 5500, 0.35)), g = L.n(gain(0.032)), mf = L.n(biq('lowpass', 90, 1)), mg = L.n(gain(0.16));
        chain(L, loop(L, 'white'), f, g); chain(L, loop(L, 'brown'), mf, mg);
        L.every(0.6, 2, (t) => glide(g.gain, R(0.025, 0.038), 0.15, t));
      },
      crickets(L) { const g = L.n(gain(0.36)); chain(L, loop(L, 'crickets'), g); L.wet(0.35); },
      fizz(L) {
        const g = L.n(gain(0.4)); chain(L, loop(L, 'fizz'), g);
        L.every(1.5, 4, (t) => glide(g.gain, R(0.28, 0.7), R(0.4, 1.2), t));
      },
      // 轻拍的水
      lapping(L) {
        const f = L.n(biq('bandpass', 520, 1.6)), g = L.n(gain(0.5));
        chain(L, loop(L, 'brown'), f, g);
        L.every(0.35, 1.1, (t) => { glide(g.gain, R(0.08, 0.42), R(0.1, 0.35), t); glide(f.frequency, R(350, 800), R(0.15, 0.4), t); });
      },
      // 蒸汽 / 地热喷孔：一阵一阵地喷
      steam(L) {
        const f = L.n(biq('bandpass', 3200, 0.7)), g = L.n(gain(0.02));
        chain(L, loop(L, 'white'), f, g);
        L.every(3, 9, (t) => { const k = R(0.06, 0.18); glide(g.gain, k, R(0.3, 0.9), t); glide(g.gain, k * 0.15, R(1, 2.5), t + R(0.8, 2.5)); glide(f.frequency, R(2200, 4200), 1, t); });
      },
      // 战场的低鸣：略微失谐的锯齿波压得很暗；技能生效时滤波打开
      drone(L) {
        const f = L.n(biq('lowpass', 150, 3)), g = L.n(gain(0.05)), g3 = L.n(gain(0.4));
        L.osc('sawtooth', 55).connect(f); L.osc('sawtooth', 55.35).connect(f); L.osc('sawtooth', 82.6).connect(g3); g3.connect(f);
        f.connect(g); g.connect(L.out);
        L.every(0.8, 1.6, (t) => { glide(f.frequency, 130 + 420 * combatK + R(-15, 25), 0.9, t); glide(g.gain, 0.04 + 0.05 * combatK, 0.9, t); });
      },
      // 远处的掌声与人声（宠物大赛）
      crowd(L) {
        const g = L.n(gain(0)), bf = L.n(biq('bandpass', 650, 1.3)), bg = L.n(gain(0.4));
        chain(L, loop(L, 'claps'), g); chain(L, loop(L, 'pink'), bf, bg); L.wet(0.5);
        L.every(5, 14, (t) => { glide(g.gain, R(0.5, 1), 0.5, t); glide(g.gain, 0.04, 1.2, t + R(1.5, 3.5)); });
        L.every(0.3, 0.9, (t) => glide(bg.gain, R(0.2, 0.6), 0.15, t));
      },
    };
    function layer(name) {
      let L = layers.get(name);
      if (L) return L;
      if (!RECIPES[name]) return null;
      const need = NEEDS[name] || [];
      if (!need.every((n) => bufs[n])) { need.forEach(want); return null; } // 缓冲到了会重新混一次
      L = newLayer(name);
      RECIPES[name](L);
      layers.set(name, L);
      stats.layersBuilt++;
      return L;
    }
    function fadeLayer(L, level, tau) {
      L.level = level;
      glide(L.out.gain, level, tau);
      clearTimeout(L.kill); L.kill = 0;
      // 淡出完成后整层拆除，不再占音频线程
      if (level <= 0.0001) L.kill = setTimeout(() => destroy(L), tau * 6000 + 300);
    }
    function destroy(L) {
      for (const s of L.srcs) { try { s.stop(); } catch (e) { /* 未启动 */ } try { s.disconnect(); } catch (e) { /* 已断开 */ } }
      for (const n of L.nodes) { try { n.disconnect(); } catch (e) { /* 已断开 */ } }
      L.out.disconnect();
      if (L.send) { L.send.disconnect(); L.send = null; revHold--; }
      layers.delete(L.name);
    }

    /* ---------------------------------------------------- 一次性声音的小工具 */
    /** 从噪声缓冲里截一段，经滤波与包络（起音 atk，衰减时间常数 dec）送到 dst */
    function hiss(t, name, type, fc, q, a, atk, dec, dst, rate = 1) {
      const b = B(name);
      if (!b) return DUMMY;
      const s = ac.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = rate;
      const f = biq(type, fc, q), g = gain(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * K, t + atk); g.gain.setTargetAtTime(0, t + atk, dec);
      s.connect(f); f.connect(g); g.connect(dst);
      s.start(t, rnd() * (s.buffer.duration - 0.1));
      done(s, t + atk + dec * 7 + 0.02, [f, g]);
      stats.events++;
      return { s, f, g };
    }
    /** 单个振荡器的短音（可带音高滑动 f → f1） */
    function tone(t, f, a, dec, dst, type = 'sine', atk = 0.003, f1 = 0, glideT = 0) {
      const o = ac.createOscillator(), g = gain(0);
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glideT || atk + dec * 2));
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * K, t + atk); g.gain.setTargetAtTime(0, t + atk, dec);
      o.connect(g); g.connect(dst); o.start(t);
      done(o, t + atk + dec * 7 + 0.02, [g]);
      stats.events++;
      return { o, g };
    }
    /** 一个音符：乐器 = 若干正弦分音 */
    function note(t, midi, inst, vel, p, bus = 'mus', detuneSrc = null) {
      const f = mtof(midi), parts = INST[inst] || INST.ping, out = gain(vel * K), wet = gain(WET[inst] ?? 0.5);
      out.connect(chan(bus, p)); out.connect(wet);
      let last = null, tEnd = t;
      for (const [r, a, d] of parts) {
        const o = ac.createOscillator(), g = gain(0);
        o.frequency.value = f * r * (1 + (rnd() - 0.5) * 0.0015);
        if (detuneSrc) detuneSrc.connect(o.detune);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.004); g.gain.setTargetAtTime(0, t + 0.004, d);
        o.connect(g); g.connect(out); o.start(t);
        const e = t + 0.004 + d * 7;
        o.stop(e);
        o.onended = () => { o.disconnect(); g.disconnect(); };
        if (e >= tEnd) { tEnd = e; last = o; }
      }
      if (last) { const prev = last.onended; last.onended = () => { prev(); out.disconnect(); wet.disconnect(); }; }
      toRev(wet, tEnd);
      stats.notes++;
    }

    /* ---------------------------------------------------- 环境里的零散事件 */
    const EV = {
      // 松脂爆裂：比细碎的噼啪更响、更低
      pop(t) {
        const d = chan('amb', R(-0.8, 0.8));
        hiss(t, 'white', 'bandpass', R(900, 2400), R(1.5, 4), R(0.23, 0.76), 0.0008, R(0.003, 0.009), d);
        if (rnd() < 0.35) hiss(t + R(0.02, 0.07), 'white', 'bandpass', R(1500, 3500), 2, R(0.11, 0.38), 0.0008, 0.004, d);
      },
      // 水滴：落进水洼时音高向上一挑
      drop(t) { const f0 = R(900, 2200); tone(t, f0, R(0.05, 0.14), R(0.012, 0.03), chan('amb', R(-0.8, 0.8)), 'sine', 0.002, f0 * R(1.5, 2.2), R(0.02, 0.05)); },
      // 鸟鸣：四种“鸟”——上挑的短叫、两声口哨、颤音、婉转的啭鸣
      bird(t) {
        const o = ac.createOscillator(), g = gain(0), p = R(-0.85, 0.85), wet = gain(R(0.3, 1));
        o.connect(g); g.connect(chan('amb', p)); g.connect(wet); toRev(wet, t + 1.4);
        const k = R(0.85, 1.2), a = R(0.05, 0.13) * K, f = o.frequency, G = g.gain;
        let x = t, extra = null;
        G.setValueAtTime(0, t);
        const sp = pick(['chip', 'chip', 'fee', 'trill', 'warble']);
        if (sp === 'chip') {
          const n = 2 + ((rnd() * 4) | 0);
          for (let i = 0; i < n; i++) {
            const f0 = 3000 * k * R(0.95, 1.05);
            f.setValueAtTime(f0, x); f.exponentialRampToValueAtTime(f0 * 1.45, x + 0.06);
            G.setValueAtTime(0, x); G.linearRampToValueAtTime(a, x + 0.01); G.linearRampToValueAtTime(0, x + 0.065);
            x += R(0.1, 0.17);
          }
        } else if (sp === 'fee') {
          f.setValueAtTime(3950 * k, x); f.linearRampToValueAtTime(3850 * k, x + 0.26);
          G.linearRampToValueAtTime(a, x + 0.03); G.setValueAtTime(a, x + 0.22); G.linearRampToValueAtTime(0, x + 0.27);
          x += 0.34;
          f.setValueAtTime(3300 * k, x); f.linearRampToValueAtTime(3230 * k, x + 0.3);
          G.linearRampToValueAtTime(a * 0.9, x + 0.03); G.setValueAtTime(a * 0.9, x + 0.25); G.linearRampToValueAtTime(0, x + 0.31);
          x += 0.34;
        } else if (sp === 'trill') {
          const n = 10 + ((rnd() * 9) | 0);
          for (let i = 0; i < n; i++) {
            f.setValueAtTime(4800 * k * (1 - i * 0.006), x);
            G.setValueAtTime(0, x); G.linearRampToValueAtTime(a * 0.8, x + 0.008); G.linearRampToValueAtTime(0, x + 0.026);
            x += 0.038;
          }
        } else {
          const m = ac.createOscillator(), mg = gain(350 * k);
          m.frequency.value = R(9, 14); m.connect(mg); mg.connect(f); m.start(t);
          f.setValueAtTime(2800 * k, t); f.linearRampToValueAtTime(3100 * k, t + 0.6);
          G.linearRampToValueAtTime(a, t + 0.05); G.setValueAtTime(a, t + 0.5); G.linearRampToValueAtTime(0, t + 0.65);
          x = t + 0.7; extra = m;
          done(m, x + 0.05, [mg]);
        }
        o.start(t);
        done(o, x + 0.1, [g, wet]);
        stats.events++;
        void extra;
      },
      // 风铃：五声音阶，分音不谐和（管钟的分音比）
      chime(t) {
        const sc = PAD.alter.sc, n = 1 + ((rnd() * 4) | 0);
        let x = t;
        for (let i = 0; i < n; i++) { note(x, pick(sc) + (rnd() < 0.3 ? 12 : 0), 'bell', R(0.07, 0.17), R(-0.7, 0.7), 'amb'); x += R(0.08, 0.35); }
      },
      // 翻书：两段带通噪声，包络抖动
      page(t) {
        let x = t;
        const b = B('pink');
        if (!b) return;
        for (const [dt, a, fc, d] of [[0, 1, R(1800, 3000), R(0.12, 0.2)], [R(0.15, 0.3), 0.6, R(2500, 4200), R(0.08, 0.14)]]) {
          x = t + dt;
          const s = ac.createBufferSource(); s.buffer = b; s.loop = true;
          const f = biq('bandpass', fc, 0.8), g = gain(0);
          g.gain.setValueAtTime(0, x);
          for (let k = 0; k < 6; k++) { x += d / 6; g.gain.linearRampToValueAtTime(a * 0.14 * K * R(0.3, 1), x); }
          g.gain.linearRampToValueAtTime(0, x + 0.03);
          s.connect(f); f.connect(g); g.connect(chan('amb', R(-0.3, 0.3)));
          s.start(t + dt, rnd() * 5);
          done(s, x + 0.05, [f, g]);
          stats.events++;
        }
      },
      // 钟摆：嘀——嗒
      clock(t, g) {
        g.n = (g.n || 0) ^ 1;
        const d = chan('amb', 0.25);
        hiss(t, 'white', 'bandpass', g.n ? 2500 : 1900, 7, 0.18, 0.0005, 0.005, d);
        tone(t, g.n ? 760 : 640, 0.025, 0.012, d);
      },
      // 写字：一段噪声，笔画由增益包络刻出来（整段只用一个声源）
      pen(t) {
        const b = B('white');
        if (!b) return;
        const s = ac.createBufferSource(); s.buffer = b; s.loop = true;
        const f = biq('bandpass', R(3200, 5200), 2), g = gain(0), G = g.gain;
        let x = t;
        G.setValueAtTime(0, t);
        const n = 5 + ((rnd() * 9) | 0);
        for (let i = 0; i < n; i++) {
          const d = R(0.04, 0.12), a = R(0.02, 0.05) * K;
          G.linearRampToValueAtTime(a, x + d * 0.3); G.linearRampToValueAtTime(a * 0.6, x + d * 0.8); G.linearRampToValueAtTime(0, x + d);
          x += d + R(0.03, 0.14);
        }
        s.connect(f); f.connect(g); g.connect(chan('amb', 0.2));
        s.start(t, rnd() * 2);
        done(s, x + 0.05, [f, g]);
        stats.events++;
      },
      // 终端提示音：两三声细小的“嘀”
      blip(t) {
        const n = 2 + ((rnd() * 2) | 0), f0 = pick([1760, 2093, 2349, 2637]), d = chan('amb', R(-0.5, 0.5));
        for (let i = 0; i < n; i++) tone(t + i * 0.075, f0 * (i % 2 ? 1.25 : 1), 0.024, 0.012, d, 'sine', 0.002);
      },
      // 仪器读数：像盖革计数器那样一阵紧一阵松
      geiger(t, g) {
        hiss(t, 'white', 'highpass', 1500, 0.7, R(0.04, 0.1), 0.0003, 0.0012, chan('amb', R(-0.2, 0.3)));
        g.burst = g.burst > 0 ? g.burst - 1 : rnd() < 0.08 ? 4 + ((rnd() * 10) | 0) : 0;
      },
      // 落石 / 远处的闷响
      thud(t) {
        const d = chan('amb', R(-0.7, 0.7));
        tone(t, R(65, 85), R(0.05, 0.1), 0.07, d, 'sine', 0.004, 40);
        hiss(t, 'brown', 'lowpass', 320, 0.7, R(0.065, 0.145), 0.004, 0.05, d);
      },
      // 远处的喷发
      boomFar(t) {
        const d = chan('amb', R(-0.5, 0.5));
        const h = hiss(t, 'brown', 'lowpass', 260, 0.8, R(0.16, 0.28), 0.25, 1.1, d);
        h.f.frequency.setTargetAtTime(70, t + 0.3, 1);
        tone(t, 44, 0.1, 0.8, d, 'sine', 0.2, 28, 2);
      },
      // 岩浆冒泡：低沉的“咕嘟”
      blorp(t) {
        const d = chan('amb', R(-0.6, 0.6)), f0 = R(55, 110), dur = R(0.08, 0.18);
        const o = ac.createOscillator(), f = biq('lowpass', 420, 1), g = gain(0);
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * R(1.6, 2.4), t + dur);
        const pk = R(0.05, 0.1) * K;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.025); g.gain.setValueAtTime(pk, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
        o.connect(f); f.connect(g); g.connect(d); o.start(t); done(o, t + dur + 0.05, [f, g]);
        hiss(t + dur, 'white', 'bandpass', R(350, 650), 2, R(0.03, 0.07), 0.001, 0.008, d);
        stats.events++;
      },
      // 火山闪电：一声脆响，然后是翻滚的雷
      thunder(t) {
        const d = chan('amb', R(-0.6, 0.6));
        hiss(t, 'white', 'highpass', 1800, 0.7, R(0.05, 0.1), 0.002, 0.03, d);
        const h = hiss(t + 0.03, 'brown', 'lowpass', 420, 0.7, R(0.16, 0.28), 0.05, 0.9, d);
        h.f.frequency.setTargetAtTime(85, t + 0.1, 0.9);
        for (let i = 0; i < 3; i++) h.g.gain.setTargetAtTime(R(0.08, 0.2) * K, t + R(0.3, 1.4), 0.15);
        h.g.gain.setTargetAtTime(0, t + 1.6, 0.7);
      },
      // 小羊的铃铛：走动时叮叮两三下
      bell(t) {
        const f = R(1500, 2100), p = R(-0.7, 0.7), n = 2 + ((rnd() * 3) | 0);
        for (let i = 0; i < n; i++) note(t + i * R(0.06, 0.18), 12 * Math.log2(f / 440) + 69 + R(-0.3, 0.3), 'sbell', R(0.045, 0.1), p, 'amb');
      },
      // 猫头鹰：呼——呼呼
      owl(t) {
        const d = chan('amb', R(-0.8, 0.8)), f0 = R(360, 420);
        [[0, 0.42, 1], [0.75, 0.16, 0.7], [0.98, 0.5, 0.85]].forEach(([dt, len, a]) => {
          const x = t + dt, o = ac.createOscillator(), g = gain(0), lp = biq('lowpass', 900, 0.7);
          o.frequency.setValueAtTime(f0, x); o.frequency.linearRampToValueAtTime(f0 * 1.05, x + len * 0.3); o.frequency.linearRampToValueAtTime(f0 * 0.9, x + len);
          g.gain.setValueAtTime(0, x); g.gain.linearRampToValueAtTime(0.05 * a * K, x + len * 0.25); g.gain.linearRampToValueAtTime(0, x + len);
          o.connect(lp); lp.connect(g); g.connect(d); toRev(g, x + len); o.start(x); done(o, x + len + 0.05, [lp, g]);
        });
        stats.events++;
      },
      // 蜜蜂：嗡嗡地从一边飞到另一边
      bee(t) {
        const dur = R(1.6, 3.2), o = ac.createOscillator(), f = biq('bandpass', 420, 1.2), g = gain(0), sp = pan(R(-0.9, -0.3)), am = ac.createOscillator(), amg = gain(0.016);
        o.type = 'sawtooth'; o.frequency.setValueAtTime(R(190, 240), t); o.frequency.linearRampToValueAtTime(R(200, 250), t + dur);
        am.frequency.value = R(22, 30); am.connect(amg); amg.connect(g.gain);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.026, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.026, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
        sp.pan.setValueAtTime(sp.pan.value, t); sp.pan.linearRampToValueAtTime(R(0.3, 0.9), t + dur);
        o.connect(f); f.connect(g); g.connect(sp); sp.connect(amb);
        o.start(t); am.start(t); done(o, t + dur + 0.05, [f, g, sp]); done(am, t + dur + 0.05, [amg]);
        stats.events++;
      },
      // 远处的战鼓（节奏在生成器里）
      war(t, g, a) {
        const d = chan('amb', R(-0.3, 0.3));
        tone(t, 62, 0.45 * a, 0.09, d, 'sine', 0.003, 40, 0.25);
        hiss(t, 'brown', 'lowpass', 180, 0.8, 0.3 * a, 0.002, 0.04, d);
      },
      // 脚步踩在碎石上：脚跟的闷响 + 一串细碎的沙沙
      step(t, g) {
        const p = (g.side = -(g.side || 0.25)), d = chan('amb', p);
        hiss(t, 'brown', 'lowpass', 260, 0.7, R(0.14, 0.21), 0.003, 0.03, d);
        const h = hiss(t + 0.01, 'white', 'bandpass', R(1800, 3200), 1.2, R(0.03, 0.05), 0.004, 0.05, d);
        for (let i = 0; i < 4; i++) h.g.gain.setTargetAtTime(R(0.007, 0.042) * K, t + 0.02 + i * R(0.015, 0.03), 0.01);
        h.g.gain.setTargetAtTime(0, t + 0.12, 0.03);
        // 足迹那一段：小羊跟在后面，嗒嗒两下轻轻的蹄声
        if ((zone === 'jn:trail' || zone === 'ch:night') && rnd() < 0.55) EV.hoof(t + R(0.18, 0.3), -p * 0.6);
      },
      hoof(t, p = 0) {
        const d = chan('amb', p);
        for (const dt of [0, R(0.07, 0.1)]) {
          hiss(t + dt, 'white', 'bandpass', R(1700, 2600), 3, R(0.05, 0.08), 0.0008, 0.005, d);
          tone(t + dt, R(380, 460), 0.03, 0.012, d, 'sine', 0.002, 300, 0.03);
        }
      },
    };
    /** 生成器的时间间隔：默认是泊松过程（每秒 rate 次） */
    const IV = {
      clock: () => 1,
      war: () => 60 / 72 / 2,
      geiger: (g) => (g.burst > 0 ? R(0.02, 0.09) : expo(g.rate * 3)),
      step: (g) => {
        if (!g.left) { g.left = 6 + ((rnd() * 7) | 0); return R(4, 11) / Math.max(0.3, g.rate); }
        g.left--; return R(0.5, 0.6);
      },
    };
    const WAR = [1, 0, 0.35, 0, 0.8, 0, 0.3, 0.55];
    function fireGen(g, t) {
      stats.events++;
      if (g.name === 'war') {
        g.n = ((g.n || 0) + 1) % 8;
        const hot = combatK > 0.5 && g.n % 2 === 1 ? 0.3 : 0;
        const a = (WAR[g.n] + hot) * (0.55 + 0.45 * combatK);
        if (a > 0.05) EV.war(t, g, Math.min(1, a));
        return;
      }
      if (g.name === 'step' && !g.left) return;
      const fn = EV[g.name];
      if (fn) fn(t, g);
    }
    const gens = new Map();

    /* ---------------------------------------------------- 音乐：音乐垫 + 偶尔的旋律 */
    const M = {
      on: false, voices: [], ci: 0, next: 0, melNext: 0, level: 0, mel: 0.5, inst: null, breathNext: 0, breath: 1, cutK: 1,
      /** 音乐垫：每个声部两支略微失谐的振荡器（合唱感）。声部的轻重直接写进波表振幅（不归一化），
       *  所以七支振荡器直接接到一个低通上，不再各带增益节点；“呼吸”也并进输出增益里 */
      build() {
        if (this.on || hooks.noPad) return;
        const mk = (amps) => ac.createPeriodicWave(new Float32Array(amps.length), new Float32Array(amps), { disableNormalization: true });
        const H = [0, 1, 0.42, 0.2, 0.1, 0.05, 0.025];
        const WAVE = mk(H.map((v) => v * 0.107)), WAVE1 = mk(H.map((v) => v * 0.2)), BASS = mk([0, 0.55]);
        // 左右各一个低通：同一声部失谐的两支振荡器一左一右，拍频就成了缓慢的左右流动（比单声道的合唱宽得多）
        this.filt = biq('lowpass', PAD[form].cut, -3); this.filtR = biq('lowpass', PAD[form].cut, -3); this.out = gain(0);
        const merge = ac.createChannelMerger(2);
        krate(this.out.gain);
        this.filt.connect(merge, 0, 0); this.filtR.connect(merge, 0, 1); merge.connect(this.out); this.out.connect(mus);
        const ch = PAD[form].ch[0];
        // 低音与两个中声部各一支振荡器；最上面两个声部各两支、相差 14 音分（缓慢的拍频就是“合唱”的流动感）
        for (let i = 0; i < 5; i++) {
          const offs = i >= 3 ? [-7, 7] : [0];
          const oscs = offs.map((off, j) => {
            const o = ac.createOscillator();
            o.setPeriodicWave(i === 0 ? BASS : offs.length > 1 ? WAVE : WAVE1);
            o.frequency.value = 261.6256;
            o.detune.value = (ch[i] - 60) * 100 + off;
            krate(o.frequency, o.detune); // 和弦之间的滑音很慢，k-rate 听不出台阶
            if (offs.length > 1) o.connect(j ? this.filtR : this.filt); else { o.connect(this.filt); o.connect(this.filtR); }
            o.start(); return o;
          });
          this.voices.push({ oscs, offs });
        }
        this.on = true; this.ci = 0;
        this.next = T() + R(...PAD[form].dur); this.melNext = T() + R(3, 7);
      },
      chord(i, tau) {
        this.ci = i;
        const ch = PAD[form].ch[i], t = T();
        this.voices.forEach((v, k) => v.oscs.forEach((o, j) => glide(o.detune, (ch[k] - 60) * 100 + v.offs[j], k === 0 ? tau * 1.3 : tau * R(0.8, 1.2), t)));
      },
      set(level, mel, inst, cutK, tau) {
        if (!this.on) return;
        this.level = level; this.mel = mel; this.inst = inst; this.cutK = cutK;
        glide(this.out.gain, level * 0.1 * this.breath, tau);
        glide(this.filt.frequency, PAD[form].cut * cutK, tau * 1.5); glide(this.filtR.frequency, PAD[form].cut * cutK, tau * 1.5);
      },
      form() {
        if (!this.on) return;
        this.chord(0, 2.2);
        glide(this.filt.frequency, PAD[form].cut * this.cutK, 2); glide(this.filtR.frequency, PAD[form].cut * this.cutK, 2);
        this.next = T() + R(...PAD[form].dur);
        this.melNext = T() + R(2.5, 5);
      },
      tick(now, hz) {
        if (!this.on) return;
        const P = PAD[form];
        if (now >= this.next) { this.chord(pick(P.nx[this.ci]), R(1.6, 2.8)); this.next = now + R(...P.dur); }
        if (now >= this.breathNext) { this.breath = R(0.62, 1); glide(this.out.gain, this.level * 0.1 * this.breath, R(2, 4), now); this.breathNext = now + R(5, 11); }
        if (this.mel > 0.01 && this.melNext < hz) {
          const end = this.phrase(Math.max(now + 0.05, this.melNext));
          this.melNext = end + R(5, 13) / this.mel;
        }
      },
      /** 一句旋律：2~5 个音，偏爱当前和弦里的音 */
      phrase(t0) {
        const P = PAD[form], sc = P.sc, inst = this.inst || P.inst, ch = P.ch[this.ci].map((m) => m % 12);
        // 大约五句里有一句是她名字的动机（术师悬在半空，医疗落回主音）
        if (rnd() < 0.2 && this.ci === 0) {
          const mo = MOTIF[form];
          mo.forEach(([dt, m], k) => note(t0 + dt, m, inst, R(0.16, 0.22) * (k ? 0.85 : 1), R(-0.3, 0.3), 'mus'));
          return t0 + mo[mo.length - 1][0] + 1.2;
        }
        let idx = 1 + ((rnd() * 4) | 0), t = t0;
        const n = 2 + ((rnd() * 4) | 0);
        for (let k = 0; k < n; k++) {
          if (k > 0 && !ch.includes(sc[idx] % 12) && rnd() < 0.5) idx = Math.max(0, Math.min(sc.length - 1, idx + (rnd() < 0.5 ? -1 : 1)));
          note(t, sc[idx], inst, R(0.14, 0.24) * (k === 0 ? 1 : 0.85), R(-0.5, 0.5), 'mus');
          t += pick(P.step);
          idx = Math.max(0, Math.min(sc.length - 1, idx + pick([-2, -1, -1, 1, 1, 2, 0])));
        }
        return t;
      },
    };

    /* ---------------------------------------------------- 场景混合 */
    function mixFor(zn) {
      const Z = ZONES[zn] || ZONES.hero, zf = Z[form] || {}, B = BED[form];
      const bedK = zf.bed ?? Z.bed ?? 1;
      const lay = {}, ev = {};
      const add = (dst, src, k = 1) => { if (src) for (const n in src) dst[n] = (dst[n] || 0) + src[n] * k; };
      add(lay, B.layers, bedK); add(lay, Z.layers); add(lay, zf.layers);
      add(ev, B.ev, bedK); add(ev, Z.ev); add(ev, zf.ev);
      const v = (k, d) => zf[k] ?? Z[k] ?? d;
      const m = { lay, ev, pad: v('pad', 0.8), mel: v('mel', 0.5), wet: v('wet', 0.35), dark: v('dark', 0), bright: v('bright', 0), deaf: v('deaf', 0), inst: v('inst', null) };
      if (zn === 'combat') {
        // 技能生效：术师这边熔岩轰鸣起来，医疗这边下起「无声润物」的雨
        if (form === 'base') { m.lay.roar = (m.lay.roar || 0) + 0.7 * combatK; m.lay.crackle = (m.lay.crackle || 0) + 0.6 * combatK; }
        else { m.lay.drizzle = (m.lay.drizzle || 0) + 0.9 * combatK; m.ev.chime = (m.ev.chime || 0) + 0.25 * combatK; }
      }
      if (zn === 'vx' && vxStage >= 0 && STAGES[vxStage]) { add(m.lay, STAGES[vxStage].layers); add(m.ev, STAGES[vxStage].ev); }
      if (zn === 'ch:sound' && chAid) { m.deaf = 0; m.mel = 0.3; m.pad = 0.8; }
      // 剧场布景里的状态：关上台灯，窗外的夜声进来；下起「无声润物」的雨
      if (zn.startsWith('th:')) {
        if (thState & 1) { m.lay.room = (m.lay.room || 0) * 0.6; m.lay.crickets = (m.lay.crickets || 0) + 0.45; m.lay.windLow = (m.lay.windLow || 0) + 0.3; }
        if (thState & 2) m.lay.drizzle = (m.lay.drizzle || 0) + 0.9;
      }
      return m;
    }
    function applyMix(tau = 1.4) {
      if (!enabled) return;
      const m = mixFor(zone === 'theater' && thScene && ZONES['th:' + thScene] ? 'th:' + thScene : zone);
      cur = m;
      for (const [n, L] of layers) if (!(m.lay[n] > 0)) { if (L.level > 0) fadeLayer(L, 0, tau); }
      for (const n in m.lay) { if (m.lay[n] <= 0 || hooks.noLayers) continue; const L = layer(n); if (L) fadeLayer(L, m.lay[n], tau); }
      for (const n of [...gens.keys()]) if (!(m.ev[n] > 0)) gens.delete(n);
      for (const n in m.ev) {
        if (!(m.ev[n] > 0) || (!EV[n] && n !== 'war')) continue;
        const g = gens.get(n);
        if (g) g.rate = m.ev[n];
        else gens.set(n, { name: n, rate: m.ev[n], next: T() + (n === 'clock' || n === 'war' ? 0.4 : Math.min(expo(m.ev[n]), R(1, 4))) });
      }
      glide(revOut.gain, m.wet, tau);
      M.set(m.pad, m.mel, m.inst, m.dark ? 0.55 : m.bright ? 1.35 : 1, tau);
      hearing();
    }

    /* ---------------------------------------------------- 听觉：隔着一层 / 助听器 / 耳鸣 */
    let tin = null;
    function cutoff() { const deaf = cur && cur.deaf; return clear ? (deaf ? 1500 : 19000) : deaf ? 290 : MUF; }
    function hearing(mode) {
      const t = T(), cut = cutoff();
      if (!clear || (cur && cur.deaf)) hearPath(true);
      for (const b of [lp1, lp2]) {
        const p = b.frequency;
        if (mode === 'on') {
          // 助听器开机：先打开到语音频段（约 2.6kHz），校准片刻，再一点点完全打开
          p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
          p.setTargetAtTime(2600, t + 0.55, 0.18); p.setTargetAtTime(cut, t + 1.5, 1.1);
        } else if (mode === 'off') {
          p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.setTargetAtTime(cut, t + 0.35, 0.3);
        } else if (Math.abs(p.value - cut) > 5) glide(p, cut, cur && cur.deaf ? 2.2 : 1.4);
      }
      if (mode === 'on') {
        pres.gain.cancelScheduledValues(t); pres.gain.setTargetAtTime(5, t + 0.6, 0.3); pres.gain.setTargetAtTime(1.5, t + 2.6, 1.5);
      } else if (mode === 'off') glide(pres.gain, 0, 0.5);
      glide(occl.gain, clear ? 0 : 2, 0.9);
      tinnitus();
    }
    function tinnitus() {
      const deaf = cur && cur.deaf;
      const lvl = !enabled || !cfg.tin ? 0 : clear ? (deaf ? 0.0035 : 0) : deaf ? 0.009 : 0.0026;
      if (!tin && lvl === 0) return;
      if (!tin) {
        const o = ac.createOscillator(), g = gain(0), w = gain(0.6);
        krate(o.frequency, g.gain, w.gain);
        o.frequency.value = 4100; o.connect(g); g.connect(w); w.connect(ear); o.start();
        tin = { o, g, w, lvl: 0, next: 0 };
      }
      tin.lvl = lvl;
      glide(tin.g.gain, lvl, lvl > tin.g.gain.value ? 3 : 0.7);
      clearTimeout(tin.kill);
      if (lvl === 0) tin.kill = setTimeout(() => { if (!tin || tin.lvl) return; try { tin.o.stop(); } catch (e) { /* 已停 */ } tin.o.disconnect(); tin.g.disconnect(); tin.w.disconnect(); tin = null; }, 5000);
    }
    function aidJingle(on) {
      const t = T() + 0.03, notes = on ? [[1318.5, 0], [1568, 0.14], [2093, 0.28]] : [[2093, 0], [1568, 0.16]];
      for (const [f, dt] of notes) tone(t + dt, f, 0.045, 0.05, ear, 'sine', 0.004);
    }

    /* ---------------------------------------------------- 排程循环：每 0.18 秒排好接下来 0.3 秒里的事件 */
    let timer = 0, tickN = 0;
    function loopTick() {
      timer = 0;
      if (!enabled || document.hidden) return;
      if (ac.state === 'running') {
        const now = T(), hz = now + 0.32;
        for (const L of layers.values()) for (const d of L.drifts) if (now >= d.next) { d.fn(Math.max(now, d.next)); d.next = now + R(d.a, d.b); }
        for (const g of gens.values()) {
          if (g.next < now - 1) g.next = now + R(0.1, 1);
          let guard = 0;
          while (g.next < hz && guard++ < 30) { if (g.next >= now - 0.02) fireGen(g, Math.max(g.next, now + 0.01)); g.next += IV[g.name] ? IV[g.name](g) : expo(g.rate); }
        }
        M.tick(now, hz);
        if (seqs.length) runSeqs(now, hz);
        revIdle(now);
        if (hearFull && clear && !(cur && cur.deaf) && lp1.frequency.value > 18500 && Math.abs(occl.gain.value) < 0.05) hearPath(false);
        if (tin && tin.lvl > 0 && now >= tin.next) { glide(tin.w.gain, R(0.2, 1), R(1.5, 4), now); glide(tin.o.frequency, R(4060, 4140), 3, now); tin.next = now + R(3, 9); }
        zoneTick(now);
        const ext = window.SOUNDSCAPE && SOUNDSCAPE.hooks;
        if (++tickN % 16 === 0 && ext && ext.rescan) ext.rescan();
      }
      timer = setTimeout(loopTick, 180);
    }
    function startLoop() { if (!timer && enabled && !document.hidden) timer = setTimeout(loopTick, 30); }
    function stopLoop() { clearTimeout(timer); timer = 0; }
    function resetClocks() {
      const now = T();
      for (const g of gens.values()) g.next = now + R(0.2, 2);
      for (const L of layers.values()) for (const d of L.drifts) d.next = now + R(0, 1);
      if (M.on) { M.next = Math.max(M.next, now + 4); M.melNext = Math.max(M.melNext, now + 2); }
    }

    /* 音符序列（旋律片段、磁带里的歌）：同样按排程窗口逐步创建，不一次性建出几十个节点 */
    const seqs = [];
    function seq(items, t0, fn) { seqs.push({ items, i: 0, t0, fn }); }
    function runSeqs(now, hz) {
      for (let k = seqs.length - 1; k >= 0; k--) {
        const s = seqs[k];
        while (s.i < s.items.length && s.t0 + s.items[s.i][0] < hz) { const it = s.items[s.i++]; if (s.t0 + it[0] >= now - 0.05) s.fn(Math.max(now + 0.01, s.t0 + it[0]), it); }
        if (s.i >= s.items.length) seqs.splice(k, 1);
      }
    }

    /* ---------------------------------------------------- 场景里的特别时刻（进入时一次；45 秒内不重复） */
    const lastEnter = {}, lastKind = {};
    const ENTER = {
      // 熔岩蛋糕出炉：厨房计时器“叮”
      'ch:cake': () => { const t = T() + 2.2; note(t, 100, 'bell', 0.3, 0.4, 'amb'); note(t + 0.02, 88, 'ping', 0.1, 0.4, 'amb'); },
      // 母亲的信：她名字的动机，这一次落回了主音——像一首很轻的摇篮曲
      'ch:letter': () => {
        const t0 = T() + 2.4, mo = MOTIF.base.map(([dt, m]) => [dt * 1.6, m]);
        seq(mo.concat([[mo[mo.length - 1][0] + 1, 62]]), t0, (t, it) => note(t, it[1], 'box', 0.14, R(-0.2, 0.2), 'mus'));
        M.melNext = T() + 14;
      },
      // 山顶：一阵大风，然后是她名字的动机（医疗的版本，走到了）
      'ch:summit': () => {
        const t0 = T() + 1.6, mo = MOTIF.alter.map(([dt, m]) => [dt * 1.5, m]);
        seq(mo, t0, (t, it) => note(t, it[1], 'celesta', 0.2, R(-0.3, 0.3), 'mus'));
        seq(mo.map(([dt, m]) => [dt, m - 24]), t0, (t, it) => note(t, it[1], 'ping', 0.08, 0, 'mus'));
        const L = layers.get('windTop');
        if (L) { const t = T(); glide(L.out.gain, L.level * 1.6, 0.6, t); glide(L.out.gain, L.level, 2.5, t + 1.8); }
        M.melNext = T() + 14;
      },
      // 宠物大赛：远处裁判的哨子
      'ch:trophy': () => { K = 0.6; try { SFX.whistle(T() + 1.5); } finally { K = 1; } },
      // 碎屑流：山坡上压下来的一阵轰鸣
      'ch:eruption': () => {
        const t = T() + 0.6, d = chan('amb', 0);
        const h = hiss(t, 'brown', 'lowpass', 200, 0.7, 0.55, 1.4, 1.6, d);
        h.f.frequency.setTargetAtTime(900, t, 0.8); h.f.frequency.setTargetAtTime(120, t + 1.8, 1.2);
        EV.boomFar(t + 0.2);
        for (let i = 0; i < 6; i++) EV.thud(t + 0.4 + i * R(0.2, 0.5));
      },
      // 尾声：她名字的动机放慢一倍，这一次两个形态都落回主音
      footer: () => {
        const t0 = T() + 1.2, P = PAD[form], mo = MOTIF[form].map(([dt, m]) => [dt * 2, m]);
        const last = mo[mo.length - 1][0];
        const line = form === 'base' ? mo.concat([[last + 0.9, 65], [last + 1.9, 62]]) : mo.concat([[last + 1.2, 72], [last + 1.8, 77]]);
        seq(line, t0, (t, it) => note(t, it[1], P.inst, 0.22, R(-0.3, 0.3), 'mus'));
        M.chord(0, 2.5); M.next = T() + 16; M.melNext = T() + 12;
      },
      // 渐远的声音：只剩心跳一样的低音
      'ch:sound': () => { const t = T() + 1; for (let i = 0; i < 4; i++) { tone(t + i * 1.1, 58, 0.18, 0.08, chan('amb', 0), 'sine', 0.01, 44, 0.2); tone(t + i * 1.1 + 0.28, 55, 0.12, 0.08, chan('amb', 0), 'sine', 0.01, 42, 0.2); } },
    };

    /* ---------------------------------------------------- 录音带里的声音（想要留住的声音）
     * 故事区的录音带由 story.js 驱动（章节加上 x-play，正在放的那一轨 li.on）；这里只“听”它的状态，
     * 为每一轨合成一段走调、发抖的旧录音：火山的呼吸、蛋糕店里的即兴合唱、绿地上的研讨会、
     * 童年录像里的生日歌、乱成一团的欢迎会；最后一轨空着，只有磁带的嘶声。 */
    let tapeNow = -1, tapeRig = null;
    /** 旧录音的音色：高通 + 低通（廉价录音机的频带），整体随磁带的 wow / flutter 微微走调，偶尔掉一下 */
    function tapeChain(t0, secs, wobble = 1) {
      const hp = biq('highpass', 170, -3), lp = biq('lowpass', 4200, -3), tg = gain(0), out = gain(1);
      const lfo = ac.createOscillator(), lg = gain(14 * wobble), flut = ac.createOscillator(), fg = gain(4 * wobble), wow = gain(1);
      lfo.frequency.value = R(0.45, 0.7); flut.frequency.value = R(6.5, 8);
      lfo.connect(lg); flut.connect(fg); lg.connect(wow); fg.connect(wow);
      hp.connect(lp); lp.connect(tg); tg.connect(out); out.connect(chan('amb', 0.05)); toRev(out, t0 + secs + 1);
      tg.gain.setValueAtTime(0, t0); tg.gain.linearRampToValueAtTime(1, t0 + 0.25);
      for (let x = t0 + R(1, 2.5); x < t0 + secs - 0.8; x += R(1.6, 3.4) / wobble) { tg.gain.setTargetAtTime(R(0.3, 0.6), x, 0.02); tg.gain.setTargetAtTime(1, x + R(0.06, 0.18), 0.04); }
      tg.gain.setTargetAtTime(0, t0 + secs - 0.35, 0.12);
      lfo.start(t0); flut.start(t0);
      const rig = { in: hp, wow, t0, end: t0 + secs, nodes: [hp, lp, tg, out, lg, fg, wow], srcs: [lfo, flut], done: false };
      rig.stop = () => {
        if (rig.done) return;
        rig.done = true;
        const t = T();
        out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0, t, 0.05);
        setTimeout(() => {
          for (const s of rig.srcs) { try { s.stop(); } catch (e) { /* 已停 */ } try { s.disconnect(); } catch (e) { /* 已断开 */ } }
          rig.nodes.forEach((n) => { try { n.disconnect(); } catch (e) { /* 已断开 */ } });
        }, 500);
      };
      setTimeout(rig.stop, (secs + 1.2) * 1000);
      return rig;
    }
    /** 哼唱的人声：锯齿波（带颤音、随磁带走调）经过三个共振峰。notes = [[起点秒, MIDI, 时长秒], …] */
    const VOW = { a: [[800, 1], [1150, 0.5], [2900, 0.22]], o: [[500, 1], [900, 0.45], [2800, 0.18]], u: [[330, 1], [800, 0.3], [2600, 0.1]] };
    function sing(rig, t0, notes, vowel, amp, fshift = 1) {
      const o = ac.createOscillator(), vib = ac.createOscillator(), vg = gain(22), out = gain(0);
      o.type = 'sawtooth'; vib.frequency.value = R(4.8, 5.8);
      vib.connect(vg); vg.connect(o.detune); rig.wow.connect(o.detune);
      for (const [f, a] of VOW[vowel]) { const b = biq('bandpass', f * fshift, (f * fshift) / 90), g = gain(a * 3.2); o.connect(b); b.connect(g); g.connect(out); rig.nodes.push(b, g); }
      out.connect(rig.in);
      o.frequency.setValueAtTime(mtof(notes[0][1]), t0);
      out.gain.setValueAtTime(0, t0);
      for (const [dt, m, d] of notes) {
        const x = t0 + dt;
        o.frequency.setTargetAtTime(mtof(m), x, 0.03);
        out.gain.setTargetAtTime(amp, x, 0.04); out.gain.setTargetAtTime(amp * 0.25, x + d * 0.82, 0.05);
      }
      const last = notes[notes.length - 1], end = t0 + last[0] + last[2];
      out.gain.setTargetAtTime(0, end, 0.08);
      o.start(t0); vib.start(t0);
      rig.srcs.push(o, vib); rig.nodes.push(vg, out);
    }
    /** 说话声（听不清内容的那种）：粉噪声经过两个共振峰，按音节开合；几个人轮流说 */
    function babble(rig, t0, secs, n, amp, hi = 1) {
      for (let s = 0; s < n; s++) {
        const src = ac.createBufferSource(); src.buffer = bufs.pink; src.loop = true;
        const f1 = biq('bandpass', R(500, 800) * hi, 3), f2 = biq('bandpass', R(1300, 1900) * hi, 5), g = gain(0);
        src.connect(f1); src.connect(f2); f1.connect(g); f2.connect(g); g.connect(rig.in);
        let x = t0 + R(0, 1.4);
        while (x < t0 + secs - 0.3) {
          const turnEnd = Math.min(t0 + secs - 0.3, x + R(0.7, 2.2));
          while (x < turnEnd) {
            const syl = R(0.09, 0.2);
            g.gain.setTargetAtTime(amp * R(0.4, 1), x, 0.018);
            f1.frequency.setTargetAtTime(R(450, 900) * hi, x, 0.03);
            g.gain.setTargetAtTime(0, x + syl * 0.7, 0.025);
            x += syl + R(0.015, 0.07);
          }
          x += R(0.3, 1.4) * n / 2;
        }
        src.start(t0, rnd() * 5); rig.srcs.push(src); rig.nodes.push(f1, f2, g);
      }
    }
    /** 录音里的拨弦（像吉他）：两个分音，快速衰减，随磁带走调 */
    function pluck(rig, t, m, a) {
      for (const [r, k, d] of [[1, 1, 0.5], [2, 0.35, 0.18], [3, 0.12, 0.08]]) {
        const o = ac.createOscillator(), g = gain(0);
        o.type = 'triangle'; o.frequency.value = mtof(m) * r; rig.wow.connect(o.detune);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * k, t + 0.004); g.gain.setTargetAtTime(0, t + 0.004, d);
        o.connect(g); g.connect(rig.in); o.start(t); done(o, t + d * 6, [g]);
      }
    }
    const TAPE = [
      // 01 火山的呼吸：山在一起一伏地喘息，熔岩在深处涌动
      (rig, t0) => {
        const s = ac.createBufferSource(); s.buffer = bufs.brown; s.loop = true;
        const f = biq('lowpass', 380, -3), g = gain(0);
        s.connect(f); f.connect(g); g.connect(rig.in);
        for (const [a, b] of [[0.2, 2.6], [3.4, 6.2]]) { g.gain.setTargetAtTime(0.95, t0 + a, 0.7); f.frequency.setTargetAtTime(700, t0 + a, 0.8); g.gain.setTargetAtTime(0.25, t0 + b - 1, 0.5); f.frequency.setTargetAtTime(300, t0 + b - 1, 0.6); }
        s.start(t0, rnd() * 5); rig.srcs.push(s); rig.nodes.push(f, g);
        for (let i = 0; i < 5; i++) { const x = t0 + R(0.5, 6); const b = biq('bandpass', R(2500, 4500), 1.2); const h = gain(0); const n = ac.createBufferSource(); n.buffer = bufs.white; n.loop = true; h.gain.setValueAtTime(0, x); h.gain.linearRampToValueAtTime(R(0.025, 0.06), x + 0.1); h.gain.setTargetAtTime(0, x + 0.15, 0.25); n.connect(b); b.connect(h); h.connect(rig.in); n.start(x, rnd() * 2); done(n, x + 2, [b, h]); }
      },
      // 02 在蛋糕店唱歌了：乐手拨着弦唱，她记不得词，只好跟着哼
      (rig, t0) => {
        const mel = [[0.2, 72, 0.45], [0.7, 74, 0.45], [1.2, 72, 0.45], [1.7, 69, 0.9], [2.8, 67, 0.45], [3.3, 69, 0.45], [3.8, 65, 1.1], [5.1, 67, 0.45], [5.6, 69, 0.45], [6.1, 65, 0.5]];
        sing(rig, t0, mel, 'a', 0.13);
        sing(rig, t0 + 0.04, mel.map(([d, m, l]) => [d, m - (m === 72 || m === 69 ? 3 : 4), l]), 'u', 0.08, 1.1);
        const CH = [[53, 57, 60, 65], [48, 55, 60, 64], [50, 57, 62, 65], [46, 53, 58, 65]];
        for (let b = 0; b < 13; b++) { const c = CH[Math.floor(b / 4) % 4], x = t0 + 0.2 + b * 0.5; c.forEach((m, k) => pluck(rig, x + k * 0.012, m, b % 2 ? 0.04 : 0.065)); }
      },
      // 03 大学绿地上的研讨会：几个人你一言我一语，远处有鸟
      (rig, t0) => {
        babble(rig, t0, 6.8, 3, 0.5);
        for (let i = 0; i < 3; i++) { const x = t0 + R(0.8, 6); const o = ac.createOscillator(), g = gain(0); o.connect(g); g.connect(rig.in); const f0 = R(3000, 3800); for (let k = 0; k < 3; k++) { const y = x + k * 0.13; o.frequency.setValueAtTime(f0, y); o.frequency.exponentialRampToValueAtTime(f0 * 1.4, y + 0.06); g.gain.setValueAtTime(0, y); g.gain.linearRampToValueAtTime(0.05, y + 0.01); g.gain.linearRampToValueAtTime(0, y + 0.065); } o.start(x); done(o, x + 0.5, [g]); }
      },
      // 04 我还记得那时的愿望：旧光碟里，爸爸妈妈在唱生日歌
      (rig, t0) => {
        const HB = [[60, 0.75], [60, 0.25], [62, 1], [60, 1], [65, 1], [64, 2], [60, 0.75], [60, 0.25], [62, 1], [60, 1], [67, 1], [65, 1.6]];
        const notes = [];
        let b = 0;
        for (const [m, d] of HB) { notes.push([0.25 + b * 0.47, m, d * 0.47]); b += d; }
        sing(rig, t0, notes.map(([d, m, l]) => [d, m - 12, l]), 'a', 0.25);
        sing(rig, t0 + 0.03, notes, 'a', 0.2, 1.15);
      },
      // 05 大家为我举办了欢迎会：礼花放岔了，场面乱成一团，笑声也乱成一团
      (rig, t0) => {
        babble(rig, t0, 6.8, 4, 0.5, 1.1);
        const c = ac.createBufferSource(); c.buffer = bufs.claps; c.loop = true;
        const cg = gain(0); c.connect(cg); cg.connect(rig.in);
        cg.gain.setValueAtTime(0, t0); cg.gain.setTargetAtTime(0.7, t0 + 2.2, 0.3); cg.gain.setTargetAtTime(0.1, t0 + 4.5, 0.6);
        c.start(t0); rig.srcs.push(c); rig.nodes.push(cg);
        for (const x of [t0 + 1.1, t0 + 1.28]) {
          const n = ac.createBufferSource(); n.buffer = bufs.white; n.loop = true;
          const hp = biq('highpass', 900, -3), g = gain(0);
          g.gain.setValueAtTime(0, x); g.gain.linearRampToValueAtTime(0.9, x + 0.002); g.gain.setTargetAtTime(0, x + 0.002, 0.018);
          n.connect(hp); hp.connect(g); g.connect(rig.in); n.start(x, rnd() * 2); done(n, x + 0.3, [hp, g]);
          const k = ac.createBufferSource(); k.buffer = bufs.crackle; k.loop = true;
          const kg = gain(0); kg.gain.setValueAtTime(0, x + 0.03); kg.gain.linearRampToValueAtTime(0.8, x + 0.06); kg.gain.setTargetAtTime(0, x + 0.3, 0.35);
          k.connect(kg); kg.connect(rig.in); k.start(x, rnd() * 5); done(k, x + 2.5, [kg]);
        }
        babble(rig, t0 + 2.4, 4, 2, 0.45, 1.5);
      },
      // 06（空白）：还没有录——只有磁带在转
      () => {},
    ];
    function tapeTick() {
      const ch = document.querySelector('#story .st-ch.x-play');
      let i = -1;
      if (ch) { const lis = ch.querySelectorAll('.fr-tape li'); for (let k = 0; k < lis.length; k++) if (lis[k].classList.contains('on')) { i = k; break; } }
      if (i === tapeNow) return;
      if (tapeRig) { tapeRig.stop(); tapeRig = null; }
      tapeNow = i;
      if (i < 0 || !TAPE[i] || !bufs.pink || !bufs.brown || !bufs.white) return;
      const t0 = T() + 0.12;
      tapeRig = tapeChain(t0, i === 5 ? 5 : 6.9, i === 3 ? 2 : 1); // 旧光碟那一轨抖得更厉害
      try { TAPE[i](tapeRig, t0); } catch (e) { /* 一段录音失败不影响别的 */ }
    }

    /* ---------------------------------------------------- 场景的逐拍检查（只读 DOM 属性 / 文本，不读布局） */
    let zoneEl = null, chAid = false, thScene = null, thState = 0;
    function zoneTick(now) {
      if (zone === 'combat') {
        const b = document.querySelector('#combat .sim-cast');
        const live = !!(b && /生效|持续/.test(b.textContent));
        const target = live ? 1 : now < combatHot ? 0.7 : 0;
        if (Math.abs(target - combatK) > 0.05) { combatK += (target - combatK) * 0.35; if (Math.abs(target - combatK) < 0.06) combatK = target; applyMix(0.8); }
      }
      if (zone === 'vx') {
        if (!zoneEl || !zoneEl.isConnected) zoneEl = document.querySelector('#volcano .vx');
        const s = zoneEl ? +zoneEl.dataset.stage : -1;
        if (s !== vxStage) { const first = vxStage < 0; vxStage = s; applyMix(first ? 1.2 : 0.6); if (!first) stageCue(s); emit('zone'); }
      }
      if (zone === 'theater') {
        if (!zoneEl || !zoneEl.isConnected) zoneEl = document.querySelector('#theater .th-stage');
        const cl = zoneEl ? zoneEl.className : '', sm = /\bsc-(\w+)/.exec(cl), sc = sm ? sm[1] : null;
        const st = (/\blamp-off\b/.test(cl) ? 1 : 0) | (/\braining\b/.test(cl) ? 2 : 0);
        if (sc !== thScene || st !== thState) { thScene = sc; thState = st; applyMix(1.2); emit('zone'); }
      }
      if (zone === 'ch:cassette' || tapeRig) tapeTick();
      if (zone === 'ch:sound') {
        // 这一章自己的「戴上助听器」：摘掉这一章额外的听力下降；总的助听器还没开，就顺手打开它
        const on = !!document.querySelector('#story .st-ch.x-aid');
        if (on !== chAid) {
          chAid = on;
          if (on && !clear) { const hb = document.querySelector('.hear-btn'); if (hb) hb.click(); } else if (on) aidJingle(true);
          applyMix(1.2);
          emit('zone');
        }
      }
    }
    function stageCue(s) {
      const t = T() + 0.05;
      if (s === 0) { for (let i = 0; i < 4; i++) EV.thud(t + i * R(0.15, 0.4)); }
      else if (s === 1) { SFX.erupt(t, { k: 0.35 }); for (let i = 0; i < 8; i++) EV.pop(t + R(0.1, 1.2)); }
      else if (s === 2) { SFX.steam(t); EV.boomFar(t + 0.15); }
      else if (s === 3) { EV.thunder(t + 0.1); SFX.erupt(t, { k: 0.6 }); }
      else if (s === 4) { SFX.steam(t, { soft: 1 }); }
    }

    /* ---------------------------------------------------- 界面与互动音效 */
    const SC_HOVER = { base: [62, 65, 67, 69, 72, 74, 77, 79, 81, 84], alter: [74, 77, 79, 81, 84, 86, 89, 91, 93, 96] };
    const F = (p = 0) => chan('fx', p);
    const SFX = {
      // 悬停：按横坐标取五声音阶里的一个音——扫过导航栏就像拨过一排琴弦
      hover(t, o) {
        const sc = SC_HOVER[form], x = o.x ?? 0.5, i = Math.max(0, Math.min(sc.length - 1, Math.round(x * (sc.length - 1))));
        note(t, sc[i], form === 'base' ? 'tickW' : 'tickG', 0.11, x * 1.2 - 0.6, 'fx');
      },
      click(t) {
        if (form === 'base') { hiss(t, 'white', 'bandpass', 1300, 3, 0.12, 0.001, 0.006, F()); tone(t, 190, 0.1, 0.02, F()); }
        else { tone(t, 2400, 0.05, 0.012, F()); hiss(t, 'white', 'bandpass', 5200, 2, 0.06, 0.001, 0.004, F()); }
      },
      tick(t) { const sc = SC_HOVER[form]; note(t, sc[2 + ((rnd() * 5) | 0)], form === 'base' ? 'tickW' : 'tickG', 0.22, R(-0.3, 0.3), 'fx'); },
      tab(t) { const sc = SC_HOVER[form], i = 2 + ((rnd() * 4) | 0), ins = form === 'base' ? 'tickW' : 'tickG'; note(t, sc[i], ins, 0.18, -0.1, 'fx'); note(t + 0.06, sc[i + 1], ins, 0.16, 0.1, 'fx'); },
      select(t) { note(t, SC_HOVER[form][5], form === 'base' ? 'marimba' : 'celesta', 0.12, 0, 'fx'); hiss(t, 'white', 'bandpass', 3000, 2, 0.04, 0.001, 0.01, F()); },
      slide(t, o) {
        const dir = o.dir || 1, h = hiss(t, 'pink', 'bandpass', 700, 1.2, 0.2, 0.08, 0.1, F(dir * 0.5));
        h.f.frequency.exponentialRampToValueAtTime(2600, t + 0.28);
      },
      open(t) {
        const h = hiss(t, 'pink', 'bandpass', 600, 0.9, 0.14, 0.12, 0.15, F());
        h.f.frequency.exponentialRampToValueAtTime(2400, t + 0.35);
        note(t + 0.12, SC_HOVER[form][6], form === 'base' ? 'marimba' : 'celesta', 0.12, 0, 'fx');
      },
      close(t) { const h = hiss(t, 'pink', 'bandpass', 2200, 0.9, 0.12, 0.05, 0.1, F()); h.f.frequency.exponentialRampToValueAtTime(500, t + 0.3); },
      // 卡片翻面：纸片轻轻一弹
      flip(t) { hiss(t, 'white', 'bandpass', 2800, 1.4, 0.22, 0.002, 0.018, F(-0.2)); hiss(t + 0.05, 'white', 'bandpass', 1800, 1.4, 0.14, 0.002, 0.02, F(0.2)); },
      // 章节标题出现：一口气 + 一个音（音高随章节序号上行）
      reveal(t, o) {
        const h = hiss(t, 'pink', 'bandpass', 900, 0.7, 0.07, 0.25, 0.35, F());
        h.f.frequency.exponentialRampToValueAtTime(2200, t + 0.6);
        const sc = PAD[form].sc, i = (o.i || 0) % sc.length;
        note(t + 0.18, sc[i], form === 'base' ? 'marimba' : 'celesta', 0.12, 0, 'fx');
      },
      whoosh(t) {
        const h = hiss(t, 'pink', 'bandpass', 300, 0.9, form === 'base' ? 0.55 : 0.4, 0.12, 0.2, F(-0.5));
        h.f.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
        const h2 = hiss(t + 0.08, 'pink', 'bandpass', 500, 0.9, 0.3, 0.1, 0.18, F(0.5));
        h2.f.frequency.exponentialRampToValueAtTime(3600, t + 0.55);
        if (form === 'base') for (let i = 0; i < 4; i++) EV.pop(t + R(0.1, 0.6));
      },
      boom(t, o) {
        const d = F();
        tone(t, 110, 0.7, 0.35, d, 'sine', 0.004, 32, 0.7);
        const h = hiss(t, 'brown', 'lowpass', 1100, 0.7, 0.9, 0.006, 0.4, d);
        h.f.frequency.exponentialRampToValueAtTime(70, t + 0.9);
        toRev(h.g, t + 3);
        if (form === 'base' && !o.light) for (let i = 0; i < 8; i++) EV.pop(t + R(0.05, 1.2));
      },
      sparkle(t) {
        const sc = PAD.alter.sc, n = 4 + ((rnd() * 3) | 0), s0 = (rnd() * 2) | 0;
        for (let i = 0; i < n; i++) note(t + i * R(0.06, 0.09), sc[Math.min(sc.length - 1, s0 + i)] + (i > 4 ? 12 : 0), 'celesta', 0.16 * (1 - i * 0.08), -0.6 + (1.2 * i) / n, 'fx');
      },
      // 喷发（k：0 ~ 1）
      erupt(t, o) {
        const k = Math.max(0, Math.min(1, o.k ?? 0.6)), d = F();
        tone(t, 90 - 30 * k, 0.4 + 0.5 * k, 0.4 + 0.9 * k, d, 'sine', 0.01, 26, 0.6 + 1.5 * k);
        const h = hiss(t, 'brown', 'lowpass', 500 + 900 * k, 0.7, 0.5 + 0.5 * k, 0.02 + 0.2 * k, 0.4 + 1.2 * k, d);
        h.f.frequency.setTargetAtTime(70, t + 0.2, 0.5 + k); toRev(h.g, t + 2 + 4 * k);
        const n = Math.round(3 + 14 * k);
        for (let i = 0; i < n; i++) EV.pop(t + R(0.05, 0.6 + 1.6 * k));
        for (let i = 0; i < Math.round(1 + 4 * k); i++) EV.thud(t + R(0.5, 1 + 2 * k));
      },
      steam(t, o = {}) {
        const h = hiss(t, 'white', 'bandpass', 3400, 0.6, o.soft ? 0.06 : 0.16, 0.12, o.soft ? 0.8 : 0.5, F(R(-0.3, 0.3)));
        h.f.frequency.exponentialRampToValueAtTime(2200, t + 1.2);
      },
      // 浮石放进水里：扑通，然后嗞嗞嗞地冒泡
      fizz(t) {
        SFX.splash(t);
        for (let i = 0; i < 6; i++) EV.drop(t + R(0.3, 2.5));
        if (!bufs.fizz) { want('fizz'); return; }
        const s = ac.createBufferSource(); s.buffer = bufs.fizz; s.loop = true;
        const g = gain(0); g.gain.setValueAtTime(0, t + 0.15); g.gain.linearRampToValueAtTime(0.5 * K, t + 0.4); g.gain.setTargetAtTime(0, t + 1.6, 0.7);
        s.connect(g); g.connect(F(0.1)); toRev(g, t + 5.5); s.start(t + 0.15, rnd() * 4); done(s, t + 5.5, [g]);
      },
      splash(t) {
        const h = hiss(t, 'white', 'bandpass', 1500, 0.8, 0.3, 0.005, 0.07, F());
        h.f.frequency.exponentialRampToValueAtTime(500, t + 0.25);
        tone(t, 300, 0.12, 0.05, F(), 'sine', 0.003, 700, 0.06);
      },
      // 黑曜石对着光：玻璃般的长鸣
      glass(t) {
        note(t, 90, 'bell', 0.28, -0.2, 'fx'); note(t + 0.09, 97, 'bell', 0.14, 0.3, 'fx'); note(t + 0.2, 102, 'celesta', 0.1, 0, 'fx');
      },
      // 玄武岩冷却：细小的开裂声 + 一点点水汽
      crackle(t) {
        for (let i = 0; i < 9; i++) { const x = t + R(0, 1.6); tone(x, R(2500, 5500), R(0.03, 0.08), R(0.004, 0.01), F(R(-0.5, 0.5))); }
        SFX.steam(t, { soft: 1 });
      },
      // 抛出火山弹：呼——然后落地的闷响
      throw(t) {
        const h = hiss(t, 'pink', 'bandpass', 500, 1, 0.25, 0.15, 0.15, F(-0.4));
        h.f.frequency.exponentialRampToValueAtTime(1800, t + 0.45);
        EV.thud(t + 0.75); EV.thud(t + 0.9);
      },
      // 放大看看：镜头推近
      zoom(t) {
        tone(t, 300, 0.06, 0.25, F(), 'triangle', 0.15, 1200, 0.5);
        for (let i = 0; i < 3; i++) note(t + 0.4 + i * 0.07, 96 + i * 2, 'tickG', 0.12, R(-0.4, 0.4), 'fx');
      },
      // 播种：两下拍土
      seed(t) { hiss(t, 'brown', 'lowpass', 500, 0.7, 0.4, 0.003, 0.04, F()); hiss(t + 0.22, 'brown', 'lowpass', 450, 0.7, 0.35, 0.003, 0.04, F()); note(t + 0.5, 84, 'celesta', 0.1, 0, 'fx'); },
      // 预警花变色：上行的两声，带一点不安
      warn(t) { note(t, 79, 'celesta', 0.14, -0.2, 'fx'); note(t + 0.18, 80, 'celesta', 0.12, 0.2, 'fx'); note(t + 0.5, 84, 'celesta', 0.14, 0, 'fx'); },
      // 小羊：咩——（锯齿波 + 两个元音共振峰 + 羊叫特有的 12Hz 颤动）
      bleat(t, opt = {}) {
        // 小的粉色小羊（hi）：音更高、更短、共振峰整体上移
        const hi = opt.hi ? 1.45 : 1, fm = opt.hi ? 1.2 : 1;
        const f0 = R(330, 430) * hi, dur = R(0.4, 0.6) / (opt.hi ? 1.5 : 1), o = ac.createOscillator(), f1 = biq('bandpass', R(650, 750) * fm, 5), f2 = biq('bandpass', R(1500, 1750) * fm, 6), g = gain(0), am = ac.createOscillator(), amg = gain(0.035 * K);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0 * 1.06, t); o.frequency.linearRampToValueAtTime(f0, t + 0.08); o.frequency.linearRampToValueAtTime(f0 * 0.92, t + dur);
        am.frequency.value = R(11, 14); am.connect(amg); amg.connect(g.gain);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07 * K, t + 0.05); g.gain.setValueAtTime(0.07 * K, t + dur - 0.12); g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(F(R(-0.3, 0.3))); toRev(g, t + dur);
        o.start(t); am.start(t); done(o, t + dur + 0.05, [f1, f2, g]); done(am, t + dur + 0.05, [amg]);
        stats.events++;
      },
      bell(t) { EV.bell(t); },
      chime(t) { EV.chime(t); },
      thunder(t) { EV.thunder(t); },
      // 医疗：治疗的暖光（上行的大三和弦分解）
      heal(t) { const sc = [65, 69, 72, 77, 81]; sc.forEach((m, i) => note(t + i * 0.07, m + 12, 'celesta', 0.14, -0.4 + i * 0.2, 'fx')); },
      /* ---- 故事里的小动作 ---- */
      // 台灯开关：咔嗒
      switch(t) { hiss(t, 'white', 'bandpass', 3200, 4, 0.2, 0.0005, 0.004, F()); hiss(t + 0.018, 'white', 'bandpass', 1400, 3, 0.12, 0.0005, 0.006, F()); tone(t, 140, 0.06, 0.015, F()); },
      // 宠物大赛的哨子：带颤音的两声“哔——”
      whistle(t) {
        for (const [dt, len] of [[0, 0.3], [0.4, 0.55]]) {
          const x = t + dt, o = ac.createOscillator(), g = gain(0), am = ac.createOscillator(), amg = gain(180);
          o.frequency.setValueAtTime(2750, x); am.frequency.value = R(30, 36); am.connect(amg); amg.connect(o.frequency);
          g.gain.setValueAtTime(0, x); g.gain.linearRampToValueAtTime(0.05 * K, x + 0.02); g.gain.setValueAtTime(0.05 * K, x + len - 0.05); g.gain.linearRampToValueAtTime(0, x + len);
          o.connect(g); g.connect(F(0.2)); toRev(g, x + len + 1);
          o.start(x); am.start(x); done(o, x + len + 0.02, [g]); done(am, x + len + 0.02, [amg]);
        }
        stats.events++;
      },
      // 纸：拆开信封、翻开本子
      paper(t) { EV.page(t); hiss(t + 0.05, 'white', 'bandpass', 4200, 1.5, 0.08, 0.02, 0.05, F(0.2)); },
      // 感知热量：地面下涌上来的一股暖流（低沉的起伏 + 细细的嘶声）
      heat(t) {
        const h = hiss(t, 'brown', 'lowpass', 120, 0.7, 0.5, 0.5, 0.6, F());
        h.f.frequency.setTargetAtTime(420, t, 0.4);
        hiss(t + 0.2, 'white', 'bandpass', 5200, 1, 0.03, 0.4, 0.5, F(0.3));
      },
      // 袖口的灼痕：一小声嘶响
      sizzle(t) { hiss(t, 'white', 'highpass', 3000, -3, 0.07, 0.01, 0.22, F()); for (let i = 0; i < 4; i++) EV.pop(t + R(0, 0.4)); },
      // 磁带机的按键：咔，电机轻轻转起来
      deck(t) {
        hiss(t, 'white', 'bandpass', 2400, 3, 0.25, 0.0008, 0.006, F());
        hiss(t + 0.03, 'white', 'bandpass', 900, 2, 0.2, 0.001, 0.012, F());
        tone(t + 0.02, 95, 0.1, 0.03, F());
        hiss(t + 0.05, 'brown', 'lowpass', 90, 0.7, 0.2, 0.15, 0.3, F());
      },
      // 吹灭蜡烛：一口气，然后一缕烟
      blow(t) {
        const h = hiss(t, 'pink', 'bandpass', 900, 0.8, 0.25, 0.08, 0.18, F());
        h.f.frequency.exponentialRampToValueAtTime(1800, t + 0.35);
        hiss(t + 0.3, 'white', 'bandpass', 3000, 2, 0.03, 0.01, 0.2, F(0.2));
      },
      // 钟楼的钟：当——当——
      bong(t) {
        for (const [dt, m] of [[0, 55], [1.1, 50]]) { note(t + dt, m, 'bell', 0.5, 0, 'fx'); note(t + dt, m - 12, 'ping', 0.25, 0, 'fx'); }
      },
      // 杯子 / 罐子：瓷器轻轻一碰
      clink(t) {
        for (const [dt, a] of [[0, 1], [R(0.09, 0.14), 0.55]]) { const f = R(2900, 3400); tone(t + dt, f, 0.09 * a, 0.035, F(0.1)); tone(t + dt, f * 2.71, 0.04 * a, 0.018, F(0.1)); }
      },
      // 沙滩球：噗、噗、噗，越弹越低
      bounce(t) {
        let x = t, a = 0.5;
        for (let i = 0; i < 4; i++) { tone(x, 160 - i * 12, a, 0.05, F(R(-0.2, 0.2)), 'sine', 0.003, 90, 0.08); hiss(x, 'pink', 'bandpass', 900, 1.5, a * 0.5, 0.002, 0.02, F()); x += 0.34 * Math.pow(0.72, i); a *= 0.62; }
      },
      // 重新点亮：划一根火柴
      strike(t) {
        const h = hiss(t, 'white', 'bandpass', 2600, 1.2, 0.18, 0.01, 0.05, F());
        h.f.frequency.exponentialRampToValueAtTime(4200, t + 0.12);
        for (let i = 0; i < 3; i++) EV.pop(t + 0.05 + R(0, 0.15));
        const f = hiss(t + 0.12, 'brown', 'lowpass', 300, 0.7, 0.35, 0.06, 0.25, F());
        f.f.frequency.setTargetAtTime(700, t + 0.12, 0.1);
      },
    };

    /** 形态切换：术师＝一次喷发；医疗＝灰烬落下 */
    function transition(to) {
      const t = T() + 0.02, d = F();
      swallowUntil = T() + 0.3;
      K = to === 'base' ? 0.7 : 1.2;
      try { transitionBody(to, t, d); } finally { K = 1; }
    }
    function transitionBody(to, t, d) {
      if (to === 'base') {
        // 地底的压力涌上来……然后爆开
        const rise = hiss(t, 'brown', 'lowpass', 90, 0.7, 0.9, 0.32, 0.8, d);
        rise.f.frequency.setValueAtTime(90, t); rise.f.frequency.exponentialRampToValueAtTime(900, t + 0.34); rise.f.frequency.setTargetAtTime(70, t + 0.36, 0.7);
        toRev(rise.g, t + 3.5);
        tone(t + 0.3, 95, 0.75, 0.55, d, 'sine', 0.006, 28, 1.4);
        hiss(t + 0.3, 'white', 'highpass', 3500, 0.7, 0.07, 0.04, 0.5, d);
        for (let i = 0; i < 26; i++) EV.pop(t + 0.3 + Math.pow(rnd(), 1.6) * 2.2);
        for (let i = 0; i < 3; i++) EV.thud(t + R(0.8, 2));
      } else {
        // 一口气吹过，白色的灰像雪一样落下
        const h = hiss(t, 'pink', 'bandpass', 350, 0.8, 0.28, 0.5, 0.45, d);
        h.f.frequency.exponentialRampToValueAtTime(2600, t + 1.3); toRev(h.g, t + 3);
        const sc = PAD.alter.sc;
        for (let i = 0; i < 9; i++) note(t + 0.25 + i * R(0.07, 0.11), sc[sc.length - 1 - (i % sc.length)] + (i < 2 ? 12 : 0), 'celesta', 0.16 * (1 - i * 0.07), R(-0.8, 0.8), 'fx');
        tone(t + 0.2, mtof(41), 0.12, 0.9, d, 'sine', 0.8); tone(t + 0.2, mtof(48), 0.08, 0.9, d, 'sine', 0.8);
      }
    }

    /* ---------------------------------------------------- 长按“喷发”按钮时的蓄力声 */
    let riser = null;
    function charge(on) {
      if (!enabled) return;
      const t = T();
      if (on) {
        if (riser || !bufs.brown) return;
        const s = ac.createBufferSource(); s.buffer = bufs.brown; s.loop = true;
        const f = biq('lowpass', 70, 1.2), g = gain(0), o = ac.createOscillator(), og = gain(0);
        const t0 = t + 0.24, t1 = t0 + 1.25;
        f.frequency.setValueAtTime(70, t0); f.frequency.exponentialRampToValueAtTime(700, t1);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.75, t1); g.gain.setTargetAtTime(0, t1 + 0.05, 0.12);
        o.frequency.setValueAtTime(36, t0); o.frequency.exponentialRampToValueAtTime(64, t1);
        og.gain.setValueAtTime(0, t0); og.gain.linearRampToValueAtTime(0.35, t1); og.gain.setTargetAtTime(0, t1 + 0.05, 0.12);
        s.connect(f); f.connect(g); g.connect(F()); o.connect(og); og.connect(F());
        s.start(t, rnd() * 5); o.start(t);
        done(s, t1 + 1, [f, g]); done(o, t1 + 1, [og]);
        riser = { g, og, s, o, t1 };
        setTimeout(() => { riser = null; }, 1600);
      } else if (riser) {
        if (t < riser.t1) { for (const p of [riser.g.gain, riser.og.gain]) { p.cancelScheduledValues(t); p.setTargetAtTime(0, t, 0.06); } try { riser.s.stop(t + 0.5); riser.o.stop(t + 0.5); } catch (e) { /* 已停 */ } }
        riser = null;
      }
    }

    /* ---------------------------------------------------- 挂起 / 唤醒 */
    let sleepT = 0;
    function sleepSoon(ms = 1600) {
      clearTimeout(sleepT);
      sleepT = setTimeout(() => {
        if ((enabled && !document.hidden) || (hooks.voiceBusy && hooks.voiceBusy())) return;
        if (ac.state === 'running') ac.suspend().catch(() => {});
      }, ms);
    }
    function wake() { clearTimeout(sleepT); if (ac.state !== 'running' && ac.state !== 'closed') ac.resume().catch(() => {}); }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { stopLoop(); if (!(hooks.voiceBusy && hooks.voiceBusy())) sleepSoon(250); }
      else if (enabled) { wake(); resetClocks(); startLoop(); }
    });
    if (hooks.voice) {
      hooks.voice.addEventListener('play', () => clearTimeout(sleepT));
      for (const ev of ['pause', 'ended', 'error']) hooks.voice.addEventListener(ev, () => { if (!enabled) sleepSoon(1500); });
    }

    /* ---------------------------------------------------- 预生成：开启声音时按当前形态的优先顺序，把全部缓冲交给 Worker 逐个生成 */
    function warm() { ORDER[form].forEach(want); }

    /* ---------------------------------------------------- 公开接口 */
    const api = {
      cfg,
      get enabled() { return enabled; },
      get form() { return form; },
      get clear() { return clear; },
      get zone() { return zone; },
      get cutoff() { return lp1.frequency.value; },
      zoneLabel() {
        const Z = (zone === 'theater' && thScene && ZONES['th:' + thScene]) || ZONES[zone] || ZONES.hero;
        let lb = Array.isArray(Z.lb) ? Z.lb[form === 'base' ? 0 : 1] : Z.lb;
        if (zone === 'vx' && vxStage >= 0) lb = '火山剖面 · ' + STAGE_LB[vxStage];
        if (zone === 'combat' && combatK > 0.5) lb += form === 'base' ? ' · 技能生效：熔岩' : ' · 技能生效：无声润物';
        if (zone === 'ch:sound' && chAid) lb = '渐远的声音 · 戴上助听器，世界回来了一点';
        if (tapeNow >= 0) lb = '想要留住的声音 · ' + (tapeNow === 5 ? '空白的一轨' : `第 ${tapeNow + 1} 轨`);
        return lb;
      },
      setEnabled(on) {
        enabled = !!on;
        glide(ear.gain, enabled ? 1 : 0, 0.3);
        if (enabled) {
          wake();
          warm();
          M.build();
          if (M.dirty) { M.form(); M.dirty = false; }
          applyMix(1.1);
          resetClocks();
          startLoop();
        } else {
          stopLoop();
          tinnitus();
          sleepSoon(1600);
        }
        emit('state');
      },
      setForm(f) {
        f = f === 'alter' ? 'alter' : 'base';
        if (f === form) return;
        form = f;
        if (!enabled) { M.dirty = true; return; } // 声音关着时换了形态：下次打开时音乐垫直接换到新调式
        transition(f);
        M.form();
        applyMix(1.3);
        emit('zone');
      },
      setClarity(on) {
        on = !!on;
        if (on === clear) return;
        clear = on;
        if (enabled) { aidJingle(on); hearing(on ? 'on' : 'off'); }
        else hearing();
        // 助听器一打开，世界的细节先冒出来一下
        if (enabled && on) {
          const t = T() + 2.2;
          if (form === 'base') for (let i = 0; i < 6; i++) EV.pop(t + R(0, 1.2)); else { EV.bird(t); EV.chime(t + 0.8); }
        }
        emit('state');
      },
      setZone(z) {
        if (z === zone) return;
        zone = z;
        zoneEl = null;
        if (z !== 'vx') vxStage = -1;
        if (z !== 'theater') { thScene = null; thState = 0; }
        if (z !== 'combat') combatK = 0;
        if (!enabled) return;
        applyMix(z.startsWith('ch:') ? 1.1 : 1.5);
        const now = T();
        if (ENTER[z] && !(lastEnter[z] > now - 45)) { lastEnter[z] = now; ENTER[z](); }
        emit('zone');
      },
      sfx(kind, opt) {
        if (!enabled) return;
        const t = T() + 0.005;
        if ((kind === 'boom' || kind === 'sparkle') && T() < swallowUntil) return; // 形态切换已经有自己的过渡声
        if (!cueing && T() < semanticUntil) return; // 刚刚响过一个更贴切的语义音效：同一次点击里别处调用的通用音效就不再叠上去
        if (kind === 'tick' && T() - (lastKind.bleat ?? -9) < 0.1) return; // 小羊刚“咩”过：它那一声通用的“嗒”就省了
        if (zone === 'combat' && (kind === 'whoosh' || kind === 'sparkle' || kind === 'boom')) {
          combatHot = T() + 8;
          if (combatK < 0.7) { combatK = 0.7; applyMix(0.5); emit('zone'); }
        }
        const fn = SFX[kind] || SFX.tick;
        stats.sfx++;
        if (DEBUG) { (stats.recent || (stats.recent = [])).push(kind); if (stats.recent.length > 24) stats.recent.shift(); }
        // 同一种音效连着响（战斗里每 0.4 秒一次的熔岩、连着摸小羊）：后面的自动变轻、变简单，不会越叠越吵
        const dt = T() - (lastKind[kind] || -9);
        lastKind[kind] = T();
        const o = Object.assign({}, opt);
        if (dt < 1.2) o.light = 1;
        K = (SFXT[kind] ?? 1) * (dt < 1.2 ? 0.55 : dt < 2.5 ? 0.8 : 1);
        try { fn(t, o); } catch (e) { /* 某个音效失败不影响页面 */ } finally { K = 1; }
      },
      /** 语义音效（由界面映射触发）：之后 0.1 秒内、同一次点击里别处调用的音效会被吞掉，避免叠成一团 */
      cue(kind, opt) {
        if (!enabled) return;
        cueing = true;
        try { api.sfx(kind, opt); } finally { cueing = false; }
        semanticUntil = T() + 0.1;
      },
      charge,
      levels() {
        glide(amb.gain, cfg.amb, 0.08); glide(mus.gain, cfg.mus, 0.08); glide(fxb.gain, cfg.sfx, 0.08); glide(vol.gain, volGain(), 0.08);
        tinnitus();
      },
      /** 混音面板的频谱：她“听到”的声音（经过听觉滤镜之后） */
      analyser() {
        if (!api._an) { const a = ac.createAnalyser(); a.fftSize = 512; a.smoothingTimeConstant = 0.75; a.minDecibels = -100; a.maxDecibels = -22; pres.connect(a); api._an = a; }
        return api._an;
      },
      dropAnalyser() { if (api._an) { try { pres.disconnect(api._an); } catch (e) { /* 已断开 */ } api._an = null; } },
      stats,
    };

    if (DEBUG && !hooks.bench) {
      const taps = {};
      const tap = (name, node) => { const a = ac.createAnalyser(); a.fftSize = 2048; node.connect(a); taps[name] = a; };
      tap('out', lim); tap('pre', master); tap('amb', amb); tap('mus', mus); tap('fx', fxb); tap('ear', ear);
      const rms = (name = 'out') => {
        const a = taps[name], d = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(d);
        let s = 0, p = 0;
        for (const v of d) { s += v * v; const x = Math.abs(v); if (x > p) p = x; }
        return { rms: Math.sqrt(s / d.length), peak: p };
      };
      /** 在 ms 毫秒里反复采样，返回平均 RMS（dBFS）与峰值 */
      const meter = async (name = 'out', ms = 2000) => {
        let s = 0, n = 0, p = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < ms) { const r = rms(name); s += r.rms * r.rms; p = Math.max(p, r.peak); n++; await new Promise((ok) => setTimeout(ok, 40)); }
        const v = Math.sqrt(s / Math.max(1, n));
        return { db: v > 0 ? Math.round(200 * Math.log10(v)) / 10 : -Infinity, peakDb: p > 0 ? Math.round(200 * Math.log10(p)) / 10 : -Infinity, n };
      };
      window.__audioDbg = {
        ac, rms, meter, taps, stats, cfg,
        zone: () => zone, label: () => api.zoneLabel(),
        layers: () => [...layers.values()].map((L) => [L.name, +L.level.toFixed(2)]),
        gens: () => [...gens.values()].map((g) => [g.name, +g.rate.toFixed(3)]),
        setZone: (z) => api.setZone(z),
        cutoff: () => lp1.frequency.value,
        nodes: () => ({ layers: layers.size, layerNodes: [...layers.values()].reduce((s, L) => s + L.nodes.length + L.srcs.length + 2, 0), gens: gens.size, seqs: seqs.length }),
        bufs: () => Object.keys(bufs),
        /** 单独测一层在响度 1 时的电平（dBFS，未经听觉滤镜与总开关） */
        probe: async (name, ms = 2500) => {
          const L = layer(name);
          if (!L) return 'not ready';
          const a = ac.createAnalyser(); a.fftSize = 2048; L.out.connect(a);
          const prev = L.level; glide(L.out.gain, 1, 0.03);
          await new Promise((ok) => setTimeout(ok, 350));
          const d = new Float32Array(2048); let s = 0, n = 0, p = 0;
          const t0 = performance.now();
          while (performance.now() - t0 < ms) { a.getFloatTimeDomainData(d); for (const v of d) { s += v * v; p = Math.max(p, Math.abs(v)); } n += d.length; await new Promise((ok) => setTimeout(ok, 40)); }
          L.out.disconnect(a); glide(L.out.gain, prev, 0.05);
          return { db: Math.round(100 * Math.log10(s / n)) / 10, peakDb: Math.round(200 * Math.log10(p)) / 10 };
        },
        /** 触发一个事件 / 音效，测它在 amb 或 fx 总线上的峰值 */
        fire: async (kind, opt = {}, bus) => {
          const isEv = opt.ev || (!!EV[kind] && !SFX[kind]);
          const a = taps[bus || (isEv ? 'amb' : 'fx')], d = new Float32Array(2048);
          let p = 0, s = 0, n = 0;
          if (isEv) EV[kind](T() + 0.05, { rate: 1 }); else { K = SFXT[kind] ?? 1; try { SFX[kind](T() + 0.05, opt); } finally { K = 1; } }
          const t0 = performance.now();
          while (performance.now() - t0 < (opt.ms || 1600)) { a.getFloatTimeDomainData(d); for (const v of d) { p = Math.max(p, Math.abs(v)); s += v * v; } n += d.length; await new Promise((ok) => setTimeout(ok, 20)); }
          return { peakDb: Math.round(200 * Math.log10(p || 1e-9)) / 10, rmsDb: Math.round(100 * Math.log10(s / n || 1e-18)) / 10 };
        },
        mute: (on) => glide(master.gain, on ? 0 : 0.5, 0.05),
        /** 校准用：停掉所有持续声层、音乐与事件（之后 setZone 会恢复） */
        silence: () => { for (const L of layers.values()) glide(L.out.gain, 0, 0.03); if (M.on) glide(M.out.gain, 0, 0.03); gens.clear(); M.mel = 0; M.level = 0; },
        padProbe: async (ms = 2500) => { M.level = 1; M.breath = 1; M.breathNext = Infinity; glide(M.out.gain, 0.1, 0.03); M.mel = 0; await new Promise((ok) => setTimeout(ok, 400)); const r = await __audioDbg.meter('mus', ms); M.breathNext = 0; return r; },
        rev: () => ({ on: revOn, hold: revHold, until: +(revUntil - T()).toFixed(2) }),
        transition: (to) => transition(to),
      };
    }
    if (hooks.bench) { api.layers = () => [...layers.keys()]; return api; } // 离线基准测试用：不接管界面
    current = api;
    emit('create');
    return api;
  }

  return { create, cfg, save, ZONES, on: (fn) => { subs.add(fn); return () => subs.delete(fn); }, get current() { return current; } };
})();

/* =========================================================
 * 界面：混音面板、悬停 / 点击 / 标题出现的音效映射、滚动时的场景追踪
 * （全部在第一次开启声音之后才装上；从没开过声音的访客，这里只多了一个隐藏的按钮）
 * ========================================================= */
(() => {
  'use strict';
  const SS = window.SOUNDSCAPE, cfg = SS.cfg;
  const $ = (s, r = document) => r.querySelector(s);
  const narrow = () => matchMedia('(max-width: 640px)').matches;
  const eng = () => SS.current;
  const on = () => !!(window.AUDIO && AUDIO.enabled);

  /* ---------------------------------------------------- 场景追踪：视口中线附近是哪一段 / 哪一章 */
  const SEC = { hero: 'hero', theater: 'theater', combat: 'combat', story: 'story', journey: 'journey', mv: 'mv', gallery: 'gallery', profile: 'archive', files: 'archive', appendix: 'archive', voice: 'voice', sheep: 'sheep', volcano: 'volcano', trivia: 'trivia', footer: 'footer' };
  const SUB_SEL = '#story .chapter, #volcano .vx, #journey .jn-trail, #journey .jn-web';
  const vis = new Map();
  let io = null, pend = 0, zoneNow = 'hero';
  function keyOf(el) {
    if (el.classList.contains('chapter')) {
      // 章节的插画键：data-art，或者 cine-xxx（整屏的电影式章节）/ .ch-art.art-xxx 的类名
      if (el.dataset.art) return 'ch:' + el.dataset.art;
      const m = /\bcine-(?!stage|box|scrim|flow|card|head|p\b)([\w-]+)/.exec(el.className) || (() => { const a = el.querySelector('.ch-art'); return a && /\bart-([\w-]+)/.exec(a.className); })();
      return m ? 'ch:' + m[1] : 'story';
    }
    if (el.classList.contains('vx')) return 'vx';
    if (el.classList.contains('jn-trail')) return 'jn:trail';
    if (el.classList.contains('jn-web')) return 'jn:web';
    return SEC[el.id] || 'hero';
  }
  function decide() {
    let best = null, pri = -1;
    for (const [el, k] of vis) {
      if (!el.isConnected) { vis.delete(el); io.unobserve(el); continue; }
      const p = el.parentElement && el.parentElement.id === 'app' ? 0 : 1; // 章节 / 剖面 / 小路优先于整段
      if (p > pri) { pri = p; best = k; }
    }
    if (!best) return;
    clearTimeout(pend);
    pend = setTimeout(() => { if (best !== zoneNow) { zoneNow = best; if (eng()) eng().setZone(best); } }, 420);
  }
  let mo = null, moT = 0;
  if (/[?&]debug\b/.test(location.search)) window.__zoneVis = () => [...vis].map(([el, k]) => [k, el.id || el.className.slice(0, 40), Math.round(el.getBoundingClientRect().top), Math.round(el.getBoundingClientRect().bottom)]);
  function rescan() {
    if (!io) io = new IntersectionObserver((ens) => { for (const en of ens) { if (en.isIntersecting) vis.set(en.target, keyOf(en.target)); else vis.delete(en.target); } decide(); }, { rootMargin: '-42% 0px -42% 0px' });
    document.querySelectorAll('#hero, #app > section, #app > footer, ' + SUB_SEL).forEach((el) => io.observe(el));
    // 故事 / 火山两段切换形态时整段重绘：只看它们的直接子节点变化（不看子树），重绘后马上接上新的章节
    if (!mo) {
      mo = new MutationObserver(() => { clearTimeout(moT); moT = setTimeout(rescan, 120); });
      for (const id of ['story', 'volcano', 'journey', 'app']) { const el = document.getElementById(id); if (el) mo.observe(el, { childList: true }); }
    }
  }

  /* ---------------------------------------------------- 互动音效映射（页面上各处的按钮，不改动各自的脚本） */
  // 故事章节里的小动作（story.js 的 data-x）：点下去之前读一下章节的状态，决定是“吹灭”还是“点亮”
  const STORY_X = {
    lamp: 'switch', pet: 'bleat', whistle: 'whistle', letter: 'paper', 'env-a': 'paper', 'env-b': 'paper', book: 'paper',
    candle: (ch) => (ch && ch.classList.contains('x-blown') ? 'strike' : 'blow'),
    sense: 'heat', scorch: 'sizzle', drop: 'fizz', play: 'deck', track: 'deck', bloom: 'warn', plant: 'seed', deal: 'flip', check: 'select', obs: 'zoom',
    seek: () => ['bleat', {}, 'soft'], // 找到小羊时 story.js 自己还有一声亮晶晶的奖励音：这里不吞掉它
  };
  // 小剧场布景里可以点的道具（theater.js 的 data-prop）
  const THEATER_X = {
    lamp: 'switch', book: 'paper', photo: 'paper', poster: 'paper', pumice: 'fizz', crystal: 'glass', obsidian: 'glass',
    volcano: ['erupt', { k: 0.45 }], sheep: 'bleat', clock: 'bong', ball: 'bounce', cup: 'clink', cocoa: 'clink', jar: 'clink',
  };
  // 返回 音效名 / [音效名, 参数, 'soft']；'soft' 表示不压掉同一次点击里别处的音效；返回空则落到通用的“点按”
  const MAP = [
    ['#story [data-x]', (el) => { const v = STORY_X[el.dataset.x]; return typeof v === 'function' ? v(el.closest('.st-ch')) : v; }],
    ['#theater [data-prop]', (el) => THEATER_X[el.dataset.prop]],
    // 小羊：摸一下黑羊会“咩”；找到一只看不见的粉色小羊时，它也小小地“咩”一声（sheep.js 自己的音效照常响）
    ['#sheep .sb-main, #sheep [data-sb="pet"]', () => ['bleat', {}, 'soft']],
    ['#sheep .sa-spot', (el) => (el.classList.contains('found') ? null : ['bleat', { hi: 1 }, 'soft'])],
    ['[data-stone]', (el) => ({ basalt: 'crackle', obsidian: 'glass', bomb: 'throw', pumice: 'fizz', ash: 'zoom', soil: 'seed', flower: 'warn' })[el.dataset.stone] || 'select'],
    ['[data-vei]', (el) => ['erupt', { k: Math.min(1, (+el.dataset.vei || 0) / 8) }]],
    ['[data-ash]', () => 'slide'],
    ['.tv-card', () => 'flip'],
    ['.walk-sheep', () => 'bleat'],
    ['[data-simsk], [data-simspd], [data-thgroup], [data-thskin], [data-dynk]', () => 'select'],
    ['[data-lang], [data-vf], [data-vset], [data-axtab], .vx-steps [data-vx]', () => 'tab'],
    ['[data-gal], [data-act="gal-prev"], [data-act="gal-next"], [data-act="lb-prev"], [data-act="lb-next"]', (el) => ['slide', { dir: /prev/.test(el.dataset.act || '') ? -1 : 1 }]],
    ['[data-outfit], [data-act="gal-full"]', () => 'open'],
    ['[data-act="lb-close"]', () => 'close'],
  ];
  const GENERIC = 'button, a[href], [role="button"], summary, [data-act]';
  const HOVER = 'a[href], button:not([disabled]), [role="button"], summary, [data-act], .tv-card, [data-voice]';
  let lastHover = null, lastHoverT = 0, lastRevealT = 0, revealIO = null;
  const played = new WeakSet();
  function onClick(e) {
    if (!on() || !eng()) return;
    const t = e.target;
    if (!t || !t.closest || t.closest('.snd-btn, .mix-btn, .snd-panel, .hear-btn, .form-switch, [data-act="form"]')) return;
    for (const [sel, fn] of MAP) {
      const el = t.closest(sel);
      if (!el) continue;
      const r = fn(el);
      if (!r) break;
      const [k, o, soft] = Array.isArray(r) ? r : [r];
      if (soft) eng().sfx(k, o); else eng().cue(k, o);
      return;
    }
    if (t.closest(GENERIC)) eng().sfx('click');
  }
  function onHover(e) {
    if (!cfg.hover || e.pointerType !== 'mouse' || !on() || !eng()) return;
    const el = e.target && e.target.closest ? e.target.closest(HOVER) : null;
    if (!el) { lastHover = null; return; }
    if (el === lastHover) return;
    lastHover = el;
    const now = performance.now();
    if (now - lastHoverT < 55) return;
    lastHoverT = now;
    eng().sfx('hover', { x: e.clientX / innerWidth });
  }
  function watchReveals() {
    if (!revealIO) {
      revealIO = new IntersectionObserver((ens) => {
        for (const en of ens) {
          if (!en.isIntersecting || played.has(en.target)) continue;
          played.add(en.target);
          revealIO.unobserve(en.target);
          const now = performance.now();
          if (now - lastRevealT < 900 || !on() || !eng()) continue; // 快速滚动时只响第一个
          lastRevealT = now;
          const heads = [...document.querySelectorAll('.sec-head')];
          eng().sfx('reveal', { i: Math.max(0, heads.indexOf(en.target)) });
        }
      }, { threshold: 0.6 });
    }
    document.querySelectorAll('.sec-head').forEach((h) => { if (!played.has(h)) revealIO.observe(h); });
  }

  let installed = false;
  function install() {
    if (installed) return;
    installed = true;
    rescan();
    watchReveals();
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerover', onHover, { passive: true });
    // 长按首屏的切换按钮：地底的压力一点点涌上来
    document.addEventListener('pointerdown', (e) => { if (e.button > 0 || !on() || !e.target.closest) return; if (e.target.closest('[data-act="form"]')) eng() && eng().charge(true); }, { passive: true });
    const release = () => eng() && eng().charge(false);
    document.addEventListener('pointerup', release, { passive: true });
    document.addEventListener('pointercancel', release, { passive: true });
  }
  // 引擎自己的排程循环每 3 秒左右调一次：接上重新渲染后新出现的章节 / 标题
  const hooks = { rescan: () => { rescan(); watchReveals(); } };

  /* ---------------------------------------------------- 混音面板 */
  const ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M5 4 V 20 M12 4 V 20 M19 4 V 20"/><circle cx="5" cy="14" r="2.2" fill="currentColor"/><circle cx="12" cy="8" r="2.2" fill="currentColor"/><circle cx="19" cy="16" r="2.2" fill="currentColor"/></svg>';
  let btn = null, panel = null, open = false, raf = 0, viz = null, vctx = null, bins = null, lastDraw = 0;
  const ROWS = [['vol', '总音量'], ['amb', '环境'], ['mus', '音乐'], ['sfx', '音效']];
  function build() {
    const tools = $('.nav-tools'), snd = $('.snd-btn');
    if (!tools || !snd || btn) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn mix-btn';
    btn.hidden = true;
    btn.setAttribute('aria-label', '声音设置');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = '声音设置';
    btn.innerHTML = ICON;
    tools.insertBefore(btn, snd);
    panel = document.createElement('div');
    panel.className = 'snd-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '声音设置');
    panel.innerHTML = `
      <div class="sp-head"><span class="sp-t">声景<small>SOUNDSCAPE</small></span><span class="sp-now" aria-live="polite"></span></div>
      <div class="sp-viz"><canvas width="288" height="54" aria-hidden="true"></canvas><span class="sp-th"></span></div>
      <div class="sp-rows">${ROWS.map(([k, l]) => `<label class="sp-row"><span>${l}</span><input type="range" min="0" max="100" step="1" data-k="${k}" aria-label="${l}"><em data-v="${k}"></em></label>`).join('')}</div>
      <div class="sp-togs">
        <button type="button" class="sp-tog sp-hear" data-sp="hear" aria-pressed="false"><b>助听器</b><small>让声音清晰起来</small></button>
        <button type="button" class="sp-tog" data-sp="tin" aria-pressed="false"><b>耳鸣</b><small>隔着一层时的嗡鸣</small></button>
        <button type="button" class="sp-tog" data-sp="hover" aria-pressed="false"><b>悬停音</b><small>指针划过时</small></button>
        <button type="button" class="sp-tog sp-off" data-sp="off"><b>关闭声音</b><small>快捷键 M</small></button>
      </div>
      <p class="sp-note">所有声音都由浏览器即时合成：随形态、随你读到的段落与章节变化。没有下载任何音频文件。</p>`;
    document.body.appendChild(panel);
    viz = $('canvas', panel);
    ROWS.forEach(([k]) => { const r = $(`[data-k="${k}"]`, panel); r.value = Math.round(cfg[k] * 100); });
    panel.addEventListener('input', (e) => {
      const k = e.target.dataset && e.target.dataset.k;
      if (!k) return;
      cfg[k] = +e.target.value / 100;
      if (eng()) eng().levels();
      paintRows();
      SS.save();
    });
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sp]');
      if (!b) return;
      const k = b.dataset.sp;
      if (k === 'hear') { const h = $('.hear-btn'); if (h) h.click(); }
      else if (k === 'tin' || k === 'hover') { cfg[k] = !cfg[k]; if (eng()) eng().levels(); SS.save(); }
      else if (k === 'off') { setOpen(false); bypass = true; $('.snd-btn').click(); bypass = false; }
      sync();
    });
    btn.addEventListener('click', () => setOpen(!open));
    // 窄屏：导航栏放不下三个圆按钮——声音开着时，点声音按钮打开这个面板（面板里有助听器与“关闭声音”）
    snd.addEventListener('click', (e) => {
      if (bypass || !narrow() || !on()) return;
      e.stopPropagation();
      setOpen(!open);
    });
    document.addEventListener('pointerdown', (e) => { if (open && e.target.closest && !e.target.closest('.snd-panel, .mix-btn, .snd-btn')) setOpen(false); }, true);
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') setOpen(false); });
    sync();
  }
  let bypass = false;
  function paintRows() {
    ROWS.forEach(([k]) => {
      const v = $(`[data-v="${k}"]`, panel), r = $(`[data-k="${k}"]`, panel), n = Math.round(cfg[k] * 100);
      if (v) v.textContent = n;
      if (r) r.style.setProperty('--v', n + '%');
    });
  }
  function setOpen(v) {
    if (!panel) return;
    open = !!v && on();
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open);
    $('.snd-btn').setAttribute('aria-expanded', open);
    if (open) { sync(); colors(); if (!raf) raf = requestAnimationFrame(draw); }
    else { cancelAnimationFrame(raf); raf = 0; if (eng()) eng().dropAnalyser(); }
  }
  function sync() {
    if (!btn) return;
    const e = eng(), en = on(), clear = !!(window.AUDIO && AUDIO.clear);
    btn.hidden = !en;
    if (!en && open) setOpen(false);
    const set = (k, v) => { const b = $(`[data-sp="${k}"]`, panel); if (b) { b.setAttribute('aria-pressed', v); b.classList.toggle('on', v); } };
    set('hear', clear); set('tin', !!cfg.tin); set('hover', !!cfg.hover);
    panel.classList.toggle('muffled', !clear);
    const now = $('.sp-now', panel);
    if (now && e) now.textContent = '此刻 · ' + e.zoneLabel();
    paintRows();
  }
  const pal = { form: '', acc: '#ff4f8f', mut: '#999' };
  /** 频谱颜色跟随主题：打开面板或切换形态时读一次，不在每帧里读样式 */
  function colors() {
    if (!panel) return;
    const cs = getComputedStyle(panel);
    pal.acc = cs.getPropertyValue('--c-acc').trim() || pal.acc;
    pal.mut = cs.getPropertyValue('--c-muted').trim() || pal.mut;
    pal.form = eng() ? eng().form : '';
  }
  /** 频谱：对数频率轴 30Hz–16kHz，竖虚线是“她此刻的听阈”（低通截止频率） */
  function draw(ts) {
    raf = open ? requestAnimationFrame(draw) : 0;
    if (!open || document.hidden || ts - lastDraw < 45) return;
    lastDraw = ts;
    const e = eng();
    if (!e || !viz) return;
    const an = e.analyser();
    if (!bins || bins.length !== an.frequencyBinCount) bins = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(bins);
    if (!vctx) vctx = viz.getContext('2d');
    const W = viz.width, H = viz.height, N = 36, nyq = an.context.sampleRate / 2, lo = Math.log(30), hi = Math.log(16000);
    vctx.clearRect(0, 0, W, H);
    if (pal.form !== e.form) colors();
    const { acc, mut } = pal;
    const cutX = ((Math.log(Math.min(16000, Math.max(30, e.cutoff))) - lo) / (hi - lo)) * W;
    for (let i = 0; i < N; i++) {
      const f0 = Math.exp(lo + ((hi - lo) * i) / N), f1 = Math.exp(lo + ((hi - lo) * (i + 1)) / N);
      const b0 = Math.floor((f0 / nyq) * bins.length), b1 = Math.max(b0 + 1, Math.floor((f1 / nyq) * bins.length));
      let m = 0;
      for (let b = b0; b < b1 && b < bins.length; b++) m = Math.max(m, bins[b]);
      const h = Math.max(1.5, (m / 255) * (H - 4)), x = (i * W) / N;
      vctx.fillStyle = x > cutX ? mut : acc;
      vctx.globalAlpha = x > cutX ? 0.35 : 0.9;
      vctx.fillRect(x + 1, H - h, W / N - 2, h);
    }
    vctx.globalAlpha = 1;
    const th = $('.sp-th', panel);
    const lab = e.cutoff > 15000 ? '听阈：全频' : `她的听阈 ≈ ${Math.round(e.cutoff)}Hz`;
    if (th.textContent !== lab) th.textContent = lab;
    th.style.transform = `translateX(${Math.min(W - 90, Math.max(0, cutX - 4)).toFixed(0)}px)`;
    th.classList.toggle('full', e.cutoff > 15000);
  }

  /* ---------------------------------------------------- 记住上次开着声音：第一次用户手势时恢复（浏览器不允许无手势自动播放） */
  function armRestore() {
    if (!cfg.on) return;
    const go = (e) => {
      if (e.type === 'keydown' && (e.key === 'm' || e.key === 'M' || e.key === 'Escape' || e.key === 'Tab' || e.ctrlKey || e.metaKey || e.altKey)) return;
      if (e.target && e.target.closest && e.target.closest('.snd-btn, .mix-btn')) { disarm(); return; }
      disarm();
      if (on()) return;
      const s = $('.snd-btn');
      if (!s) return;
      const wantClear = cfg.clear; // 开声音时状态监听会先把 clear 记成 false，所以先记下来
      bypass = true; s.click(); bypass = false;
      if (wantClear && window.AUDIO && !AUDIO.clear) { const h = $('.hear-btn'); if (h) h.click(); }
    };
    const disarm = () => { removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); };
    addEventListener('pointerdown', go, true);
    addEventListener('keydown', go, true);
  }

  let firstOn = !cfg.seen;
  SS.on((what) => {
    if (what === 'create') return;
    if (what === 'state') {
      const en = on();
      if (en) install();
      // 记住开关与助听器（下次在第一次手势时恢复）
      const clear = !!(window.AUDIO && AUDIO.clear);
      if (cfg.on !== en || (en && cfg.clear !== clear)) { cfg.on = en; if (en) cfg.clear = clear; SS.save(); }
      // 窄屏上第一次开启声音：把面板打开，让人看见“助听器”在哪里（导航栏里放不下它）
      if (en && firstOn) {
        firstOn = false; cfg.seen = true; SS.save();
        if (narrow()) setTimeout(() => { if (on() && !AUDIO.clear) setOpen(true); }, 350);
      }
    }
    sync();
  });
  SS.hooks = hooks;

  function init() { build(); armRestore(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
