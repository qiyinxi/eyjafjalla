# 后期工具箱 · `MVE.finish`（给写片的人）

目标：官方 MV 的"精致度"——景深、辉光 / 胶片光晕、分段调色、纸 / 水彩 / 水纹纹理、细颗粒、漏光 / 眩光、空气透视、讲究的标题字。
全部是 `t` 的纯函数；精灵与纹理只生成一次；**不读回像素（无 getImageData）、运行时不用 shadowBlur / CSS filter**（`ctx.filter` 只在建缓存时用）。
实验页：`lab/finish.html`（单帧 / 前后对比表 / 风格总览 / 分项效果 / 性能，用法见文件头）。

## 1. 接入

```js
E.film({ id: 'miss-you', needs: ['finish'], /* … */
  prepare() { E.finish.warm(['paper', 'grain', 'dirt']); },          // 可选：提前生成纹理，免得第一次用时卡一帧
  overlay(g, s) {
    const F = E.finish;
    F.frame(g, s, F.look(s.t, [[0, 'ember'], [22, 'rain-cool'], [70, 'summer-noon'], [130, 'dawn']], 1.5)); // ① 成片放最前
    s.post.letterbox(g, lb);                                          // ② 然后才是黑边、片名（不被调色 / 辉光影响）
  },
});
```
- `F.frame` 自带颗粒 / 暗角时，**去掉影片里原来的 `s.post.grain / vignette`**，不要叠两层。字幕由引擎在 overlay 之后画，不受影响。
- `F.look(t, cues, fade)`：分段时间线，进入新一段后的 `fade` 秒内交叉淡化（数值插值 + 调色按权重混合）。
- `F.quality = 'high' | 'low' | 'auto'`（默认 auto：触屏 / 内存 < 4G / 少于 4 核 → low）。`F.enabled = false` 整体关闭。
- 每项出错只跳过该项并警告一次，不会打断影片。

## 2. 成片风格（`F.LOOKS`，= 辉光 + 调色 + 纹理 + 漏光 + 暗角 + 颗粒）

| 风格 | 样子（对应官方参考） | 适合 |
|---|---|---|
| `rain-cool` | 冷灰去饱和、**只留红色**（Miss You 雨中街道） | III 街道 / 城市段；任何"克制的思念" |
| `duotone-magenta` | 洋红单色 + 紫黑暗部（Miss You 副歌的粉色城市） | III 副歌的高潮一两句；配 `F.graded` 只染背景 |
| `siesta-sunset` | 紫粉晚霞、青色暗部（火山旅梦 PV 黄昏） | I 132s 桥上落日；IV 傍晚码头；V 黄昏 |
| `summer-noon` | 饱和、通透、蓝天更深（火山旅梦 PV 码头） | IV、V 白天全段；III 乌纳村山谷 |
| `golden-hour` | 暖、琥珀高光、红橙光晕 | I 白天（图书馆、广场、集市）；V 汽水工厂 |
| `dream-pink` | 粉紫梦境、柔光（逐通道辉光，粉雾也会发光） | II 全段（梦里）；III 回忆泡泡 |
| `night-blue` | 冷蓝夜色，但窗灯 / 灯笼仍然暖 | I 屋顶夜；III 写信夜；IV 夜里的博物馆 |
| `dawn` | 蓝紫天顶 → 桃色地平线 | III 山顶日出；II 结尾日出；I 黎明离别 |
| `ember` | 只留暖色（熔岩）、其余压暗 + 红色光晕 | III 开头地底岩浆 / 最后的"喷发"；II 火山口 |
| `memory-sepia` | 棕褐单色 + 纸纹 + 灰尘划痕 | 旧照片、回忆闪回、信 |
| `film` | 中性胶片底：一点对比、暖中间调、哑光黑 | 不想明显调色时的通用底子 |

自定义：`F.frame(g, s, { bloom: { strength: .4, threshold: .7, tint: '255,220,200', halation: .2 }, grade: 'rain-cool', texture: [{ kind: 'paper', a: .2 }], leak: { palette: 'pink', side: 'tr', a: .25 }, vignette: { a: .4, rgb: '20,10,30' }, grain: .08 })`。
调色也可以直接写操作串：`F.grade(g, s, [['curve', 'soft-light', .3], ['accent', { key: 'red' }], ['fill', 'soft-light', '#56708f', .35]])`（操作说明见 `finish.js` 里 GRADES 上方的注释；`curve` 必须放第一个）。

## 3. 各部推荐配方（前后对比表：`lab/finish.html?sheet=<id>`）

- **I · Before Summer**：白天 `golden-hour`（图书馆加 `F.rays` 窗光）；132s 落日 `siesta-sunset`；夜里屋顶 `night-blue` + 少量 `F.bokeh`（远处灯光，n≈14、a≈0.3）；结尾黎明 `dawn`；回忆 / 信 `memory-sepia`。片名可用 `serif-ink`（纸面）或 `display`。
- **II · Misty Memory (Night)**：通篇 `dream-pink`，街灯段加 `F.bokeh`；火山喷发 `ember`；日出 `dawn`；醒来的博物馆 `golden-hour`。片名 `vertical` 或 `serif`（带小红印）。
- **III · Miss You**：地底 `ember` → 街道 `rain-cool`（地面 `F.texture('ripple', { squash: .35 })` 雨滴涟漪、`F.title` 'bold' 的 "MISS YOU"）→ 乌纳村 `summer-noon` → 夜 `night-blue` → 山顶 `dawn`（`F.flare` 放在太阳上 + streak）→ 喷发 `ember`；副歌一两句 `F.graded(g, s, 'duotone-magenta', drawBackground)`。
- **IV · Misty Memory (Day)**：白天 `summer-noon`（太阳 `F.flare`，海面 `F.bokeh` 小而亮），傍晚 `siesta-sunset`，夜 `night-blue`。片名 `vertical`（晴日之约）。
- **V · Effervescence**：`summer-noon` 为主，工厂内 `golden-hour`；汽水喷发加 `F.bloom({ key: 'rgb', strength: .5 })` 和白色 `F.bokeh`（气泡）；黄昏 `siesta-sunset`。

## 4. 景深、辉光、标题

- **景深**
  - `F.dof(g, s, 'bg-city', (q) => drawCity(q), { radius: 12, cam, depth: 0.4, opaque: true })`：静态平面只画、只模糊一次，按分辨率缓存。贴图成本约等于一次 drawImage。
    - 越糊存得越小。
    - `opaque: true` 用于满幅背景，把边缘外延，画面边上不发暗。
  - 前景失焦（花、栏杆）同样用，给 `depth > 1`。
  - 动的东西要虚化：`{ live: true, radius: 14 }`。每帧画到 1/f 分辨率再放大，成本 = drawFn 本身 + 4 次贴图。
  - 只要画布：`F.dofLayer(s, key, w, h, drawFn, radius)`，外边宽度在 `c.__m`。
- **辉光** `F.bloom(g, s, { strength, threshold, radius, key, tint, halation, dirt })`
  - 原理：整帧缩到 1/2，用 `color-burn` 常数灰提取亮部，逐级缩小再放大相加，最后用 `screen` 叠回。
  - `key`：
    - 默认 `'luma'` 按亮度取阈值，蓝天不会整片泛光。
    - `'rgb'` 逐通道取阈值，适合红灯笼、熔岩、粉雾这类饱和光（夜景用）。
  - `halation` 是胶片红晕；`dirt` 让亮处显出镜头脏污。
  - 只想给几个光源加光（或在低档上）：`F.bloom(g, s, { frame: false, lights: [[x, y, r, 'r,g,b', a]] })`，不读画面。
- **只调一层** `F.graded(g, s, spec, drawFn)`：例如背景洋红双色调、人物保持原色。
- **标题** `F.title(g, s, { text, sub, label, seal, style, x, y, size, anim, t0, dur, out })`
  - 样式：
    - `bold`：「MISS YOU」式粗白字 + 上细线 + 标签 + 宽字距副标题 + 短线；`ghost` 为回声字。
    - `serif` / `serif-ink`：中文衬线 + 发丝线 + Cinzel 副标题 + 小红印。
    - `vertical` / `vertical-ink`：竖排。
    - `display`：Cinzel 两侧细线。
  - 动画 `anim`：`letters`（逐字浮现）、`ink`（逐字自上而下写出）、`wipe`（柔边擦出）、`fade`。
  - 主字位图在建缓存时一次做好（渐变 + 纹理 + 做旧 + 两层柔和投影），副标题也缓存成精灵，每帧只贴图。
  - 字体用站点已加载的 Noto Sans SC 700、Noto Serif SC 900、Cinzel、JetBrains Mono；未加载完时自动等字体再重建。
  - 可以用 `F.warmTitle(s, o)` 提前建好。
- **其他**
  - `F.texture(g, s, kind, o)`：`paper` / `watercolor` / `ripple` / `ripple-field` / `halftone` / `grain-fine` / `dust` / `scratches` / `topo-lines`（纯烬 PV 的红色等高线地图，`reveal` 0..1 圆形展开）。
  - `F.lens`（`leak` / `dirt` / `flare` / `streak` / `chroma`）、`F.bokeh`、`F.haze`（放在远景层之后 = 空气透视）、`F.rays`（柔边光束）。

## 5. 成本（实测：`lab/finish.html?bench=1` / `?perf=1`，真实显卡 RTX 4070 SUPER，Chrome 153）

每帧 CPU 平均毫秒（桌面 1280×720 高档 ｜ 手机模拟 4×降速、低档 960×540）：

| 项 | 桌面 | 手机 | 说明 |
|---|---|---|---|
| `frame(look)` 整套 | **0.28–0.42** | **0.09–0.23** | 最重的是 rain-cool（色彩隔离）与 ember |
| bloom（整帧金字塔） | 0.24 | 0（低档不读画面） | 读画面那一次占大头；`F.lowFrameRead = true` 让低档也做：约 1.2 |
| bloom 精灵（4 个光源） | 0.03 | 0.11 | |
| grade（fill 类预设） | 0.14–0.16 | 0.06–0.12 | 含 curve 时与 bloom 共用同一次读画面 |
| grade accent（只留红） | 0.29 | 0.12（退化为整体降饱和） | |
| 纹理 paper / watercolor / halftone / topo | ≤ 0.012 | ≤ 0.06 | 一次图案填充 |
| ripple（14 个）/ dust / scratches | 0.03 / 0.005 / 0.005 | 0.14 / 0.07 / 0.04 | |
| grain / vignette / leak | 0.01 / 0.008 / 0.02 | 0.06 / 0.06 / 0.08 | |
| flare+streak / dirt(光源) / bokeh 24 | 0.04 / 0.06 / 0.035 | 0.19 / 0.34 / 0.19 | |
| haze / haze+wisps / rays 6 | 0.008 / 0.03 / 0.02 | 0.08 / 0.16 / 0.13 | |
| chroma（边缘色散，仅高档） | 0.15 | 0 | 8 次整帧绘制，默认不开 |
| title letters / ink / wipe | 0.06 / 0.07 / 0.09 | 0.32 / 0.37 / 0.56 | 出现的那几秒 |
| dofLayer（缓存平面）/ dof live | 0.012 / 0.075 | 0.06 / 0.32 | |

- **整片实测（桌面 1280×720）**：成片使 render() 平均增加 0.29–0.40 ms（p95 0.5–0.7）。帧间隔 p95 始终 6.1 ms。
  - Miss You：0.64 → 0.98 ms。
  - Misty Memory Night：0.85 → 1.26 ms。
  - 偶发的长帧来自影片自己的首次建缓存，与成片无关。
- **手机模拟** 960×540 与 640×360 的全部分项：帧间隔 p95 ≤ 12 ms。
- **GPU**
  - 整帧操作都是 1/2–1/32 小图，或几次整帧填充（高档每帧约 8–12 次整帧合成）。
  - 低档不读画面，只剩约 5 次整帧填充。
  - 播放器降分辨率时成本随之下降。
