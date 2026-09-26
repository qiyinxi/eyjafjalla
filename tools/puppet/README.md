# 原画分层绑定（类 Live2D）

把官方立绘切成若干图层，给被遮住的部分补画，再在网页里用网格变形让它动起来。
画质就是原画像素本身；动作幅度保持小而自然（眨眼、呼吸、转头、歪头、发梢衣摆飘动、小幅抬手）。

```
tools/puppet/rigs/<key>.json   ← 手写的绑定源文件（多边形、骨骼、参数）
tools/puppet/build.py          ← 切层 + 补画 + 打包 → assets/puppet/<key>/{atlas.webp, rig.json}
tools/puppet/preview.py        ← 在原画上叠加网格 / 多边形 / 骨骼，用于描点
js/puppet.js                   ← 运行时（WebGL 网格变形）
lab/puppet.html + lab/shot.ps1 ← 无头截图检查动作效果
```

## 工作流

1. 描点前先看原画局部（带坐标网格）：
   `python tools/puppet/preview.py base-e0 --raw --crop 300 60 700 420 --scale 2 --out <png>`
2. 在 `rigs/<key>.json` 里写图层多边形，随时叠加检查：
   `python tools/puppet/preview.py base-e0 --crop ... --scale 2 --dim 0.3 --out <png>`
3. 构建并校验（静止合成必须与原图一致；`--check` 会输出每层的切图到 `tools/puppet/.cache/<key>-check/`）：
   `python tools/puppet/build.py base-e0 --check`
4. 截图看动作（`frames` 用逗号分隔，`动作@秒`，末尾 `-` 表示反方向）：
   `pwsh -NoProfile -File lab/shot.ps1 -Page puppet.html -Query "key=base-e0&orig=1&frames=rest,tilt@1.1,tilt@1.1-,look@1.5,blink@0.09,cast@1.4&cols=4" -Out <png> -Width 1600 -Height 900`
   可加 `crop=x0,y0,x1,y1` 放大局部，`px=0.9&py=0` 模拟鼠标在右侧（转头）。

## 源文件格式 `rigs/<key>.json`

坐标一律是**原画像素**（左上角为原点，y 向下）。

```jsonc
{
  "src": "c/c0/立绘_艾雅法拉_1.png",          // PRTS 媒体路径（构建时缓存到 .cache/<key>.png）
  "band": 10,                                  // 自动补画带宽（像素）：每层在被上层遮住的边缘向内补画这么宽
  "step": 20,                                  // 默认网格步长（像素）；小部件可在图层里设更小的 step
  "params": {
    "turnPx": 6, "turnPxY": 3,                 // 转头视差：depth=±1 的图层最多平移多少像素
    "tilt": 0.06, "nod": 6, "sway": 0.012, "hop": 14,   // 各动作幅度（弧度 / 像素）
    "breath": 0.006, "breathLift": 1.2,        // 呼吸
    "swayPx": 6,                               // 发梢摆动基准幅度（像素），乘以各层 sway.amp
    "castArm": "armR", "castRot": -0.12,       // 「施法」时抬起的手臂骨骼与角度（可省略）
    "headBone": "head", "chestBone": "chest", "bodyBone": "body"
  },
  "bones": {                                   // 2D 骨骼：绕 pivot 旋转；parent 缺省为 root（整张图）
    "body":  { "pivot": [x, y] },              // 腰胯
    "chest": { "parent": "body", "pivot": [x, y] },
    "head":  { "parent": "chest", "pivot": [x, y] },   // 颈部（下巴下方）
    "armR":  { "parent": "chest", "pivot": [x, y] },   // 肩
    "sheep1": { "pivot": [x, y], "idle": { "rot": 0.03, "ty": 4, "freq": 0.4, "phase": 1.2 } }
                                               // idle：该骨骼自己的待机摆动（弧度 / 像素 / 赫兹），适合飘浮的小羊、道具
  },
  "layers": [                                  // 从下到上
    { "id": "base", "rest": true, "bone": "body" },     // rest：拿走所有没被其他层认领的像素（通常是身体 / 背景物）
    {
      "id": "hair_back_L", "bone": "head",
      "poly": [[x,y], ...],                    // 本层认领的区域；也可以是多个多边形 [[[x,y],...],[...]]
      "minus": [...],                          // 可选：从 poly 中扣掉的区域
      "feather": 1.5,                          // 切边羽化（像素）
      "depth": -0.6,                           // 转头视差：−1（最后面）… +1（最前面）；脸约 0.2，刘海约 0.6，后发约 −0.6
      "sway": { "root": [x,y], "dir": [dx,dy], "amp": 1, "freq": 1.1, "side": 1, "pow": 1.6, "follow": 1, "lag": 0.7 },
                                               // 发束 / 衣摆摆动：root 为根部，dir 为“根部→末端”的向量（长度=发束长度）
      "fill": [                                // 本层被上层挡住、动起来可能露出来的区域 → 补画
        [[x,y], ...],                          //   纯多边形：用本层可见像素做平滑插值
        { "poly": [...], "inpaint": true, "minLum": 0.78 },   // 只用足够亮的像素插值（眼睑下的肤色）
        { "poly": [...], "sample": [x,y] }     //   或取样某点颜色平涂
      ],
      "step": 12
    },
    { "id": "eyeL", "bone": "head", "depth": 0.5, "step": 8, "squash": { "pivotY": 390 }, "poly": [...] },
                                               // 眨眼：朝 pivotY（下眼睑）压扁并淡出；下层的 fill 要补好肤色
    { "id": "lidL", "bone": "head", "depth": 0.5, "show": "blink",
      "paint": { "strokes": [{ "pts": [[x,y],...], "width": 4, "color": "#4a2a28" }],
                 "fills": [{ "poly": [...], "sample": [x,y] }] } }
                                               // 合成图层（原画没有的东西，例如闭眼的睫毛线）；show: "blink" | "cast"
  ]
}
```

## 进阶功能（v2，全部可选）

| 字段 | 位置 | 作用 |
| --- | --- | --- |
| `params.sphere: [cx, cy, rx, ry]` | params | 头部球面：挂在 head 骨骼、depth > 0 的图层转头时按球面分布位移（脸中间动得多、轮廓动得少），比平移更像真的转头。单个图层也可写 `"sphere": [...]` 或 `"sphere": false` |
| `params.headHit: [cx, cy, r]` | params | 头部命中圆：戳头 → 开心眯眼 / 眨单眼；在头上来回划动 → 「摸头」（眯眼 + 脸红 + 往手上蹭） |
| `params.dozeAfter: 40` | params | 多少秒没人理她就开始打盹（眼皮半垂、头一点一点），鼠标一动就惊醒 |
| `"eye": "L" \| "R"` | 图层 | 眨眼分左右（用于眨单眼）；与 `squash` 配合 |
| `"look": { "amp": [4, 2.5], "clip": [cx, cy, rx, ry] }` | 图层 | 虹膜 / 瞳孔跟随视线平移 amp 像素，并被眼眶椭圆 clip 裁剪。眼睛要拆成三层：眼白（fill 补白）→ 虹膜（look）→ 上下睫毛（在最上面） |
| `"show": "blink" \| "blinkL" \| "blinkR" \| "happy" \| "talk" \| "blush" \| "cast" \| "sleepy"` | 图层 | 只在该状态出现（淡入淡出）；可写 `{ "state": "talk", "lo": 0.05, "hi": 0.3 }` 自定阈值 |
| `"hide": "happy"` | 图层 | 该状态时隐去（例如开心眯眼时隐藏睁开的眼睛） |
| `"mouth": { "pivotY": y, "min": 0.3 }` | 图层 | 说话时按音量纵向展开（配合 `show: talk` 的张嘴合成图层） |
| `"glow": { "color": "#ff7a3d", "amp": 0.25, "freq": 0.6, "cast": 0.6 }` | 图层 | 发光呼吸：熔岩、晶叶、法杖宝石；施法时更亮 |
| `"sway": { ..., "wave": 2.5, "kick": 1, "stiff": 30, "damp": 5 }` | 图层 | wave：风沿发束传播的相位差（弧度，越大越像波浪）；kick：对滚动 / 摸头冲量的响应 |
| `"anchors": { "staffTip": { "bone": "chest", "p": [x, y] } }` | 顶层 | 命名锚点，网页据此在法杖尖、手心等处放粒子特效 |
| `bones.<name>.idle` | bones | 骨骼自带待机摆动 `{ rot, tx, ty, freq, phase }`；`spin`（弧度/秒）为匀速旋转，适合钟表指针、风车 |
| fill `{ "poly", "smear": [dx, dy], "reach": 80 }` | fill | 沿方向拉丝补画：发束、衣褶后面露出来的部分延续笔触，比插值自然 |
| fill `{ "poly", "cv": "telea" \| "ns" \| "patch" }` | fill | OpenCV 补画（可选，只在用到时导入）：`telea` / `ns` 沿等照度线延续，比推拉插值锐利；`patch` 从本层完好的区域整块复制纹理（布料褶皱、发丝），适合法杖挥开后露出的大片区域。可调 `radius`、`patch`、`search`、`guide`、`vote`、`stride` |
| paint fill `{ "ellipse": [cx, cy, rx, ry, rot] }`、`"color2"`、`"axis"`、`"alpha"` | paint | 椭圆、线性渐变、半透明（腮红、张嘴） |

表情需要的合成图层（原画里没有，要自己画）：
- **闭眼线**（`show: blinkL/blinkR`）：沿下眼睑的弧线，颜色取睫毛色。
- **开心眯眼**（`show: happy`，同时睁眼图层 `hide: happy`）：∩ 形弧线，下层要补好肤色。
- **张嘴**（`show: talk` + `mouth`）：深红口腔 + 浅色舌头 / 上唇线，渐变。
- **腮红**（`show: blush`）：半透明粉色椭圆 + 可选的几道斜线。

调试页状态：`happy@1`、`talk@0.4`、`sleepy@4`、`pet@2`、`wink@0.3`；`px=±1` 看转头 + 眼神。

## 切层要点（画质的关键）

- **边界放在自然的分界上**：发束之间的暗缝、衣服与皮肤的交界、描线上。沿描线切，动起来最不显眼。
- **与背景相邻的边要留余量**：多边形往透明背景外扩 5–10 像素（透明像素不会被认领，放心外扩）。
- **内部交界要让下层能补画**：自动补画带（`band`）通常够用；转头 / 歪头会露出较大区域时（例如下巴下面的脖子、头后面的头发），给下层加 `fill`。
- **层级顺序 = 前后遮挡**：后发 → 身体 → 后侧手臂 → 外套 → 前侧手臂 → 脸 → 眼睛 → 刘海 → 前发 / 鬓发 → 飘带 / 法杖。
- **动作要克制**：歪头 ≤ 0.07 rad、转头视差 ≤ 8 px、发梢摆动 ≤ 8 px。宁可小，不要露馅。
- **检查**：`--check` 的 `error.png` 应接近全黑（静止与原图一致）；每个动作至少截两帧（进行中、最大幅度），放大看接缝和补画。
