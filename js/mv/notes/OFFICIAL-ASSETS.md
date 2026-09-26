# 官方素材目录：MV 角色（PRTS 运行时加载）

核对日期：2026-09-26。以下每个 URL 都实际请求过。Spine 数据是用 spine-core 3.8 解析真实 `.skel` 得到的（动画名与时长），贴图尺寸取自 PNG 文件头。
我还在无头 Chrome 里用 spine-webgl 3.8 从 PRTS 加载并渲染了每个敌人 / 客串模型，全部能正常绘制（截图在草稿目录：`oa/shots/spines.png`）。

## 0. 通用规则（先读这一节）

| 项目 | 事实 |
|---|---|
| 干员 Spine | `https://torappu.prts.wiki/assets/char_spine/<id>/meta.json` → `{prefix, name, skin:{<时装名>:{正面|背面|基建:{file}}}}`。模型 = `prefix + file + ".skel" / ".atlas"`；贴图页列在 atlas 里，和 atlas 放在同一目录。`js/chibi.js` 已经按这个结构读取。 |
| 敌人 Spine | `https://torappu.prts.wiki/assets/enemy_spine/<id>/<id>.skel`、`.atlas`、`.png`。**敌人没有 `meta.json`（返回 404）**，只有一个皮肤，也没有正面、背面、基建之分。PRTS 页面里内嵌的元数据是 `{"prefix":".../enemy_spine/<id>/","skin":{"默认":{"战斗":{"file":"<id>"}}}}`。 |
| 运行时版本 | 目录里所有模型都是 **3.8.99**，和 chibi.js 现在用的 spine-ts 3.8 一致。 |
| CORS（torappu） | 检查了本目录列出的全部 **267 个 skel / atlas / png 文件**，外加 10 个 `meta.json`：都返回 200，并带 `Access-Control-Allow-Origin: *`、`Access-Control-Allow-Credentials: true`、`Access-Control-Allow-Methods: *`，可以直接用作 WebGL 纹理，canvas 也能导出。 |
| CORS（media.prts.wiki） | 原图、`/thumb/…` 缩略图、`?image_process=…` 变体都带 `Access-Control-Allow-Origin: *`。 |
| CORS（arknights.wiki.gg） | **没有 ACAO 头。** `js/data.js:746` 里凯勒的图 `https://arknights.wiki.gg/images/Adele_Keller.png`（359 KB）一旦画进 canvas 就会污染画布。它和 PRTS 上的 `avg_npc_999_1` 是同一张立绘，建议换成下面第 3 节的 media.prts.wiki URL。 |
| 压缩 | `.skel` 和 `.atlas` 以 `Content-Encoding: br` 分块传输，HEAD 请求里没有 Content-Length；`.png` 不压缩，有 Content-Length。表格里 skel 一列写作“原始 / 传输（br）”，“合计 传输”即手机实际要下载的字节数。 |
| 贴图缩小 | 基建模型的 PNG 是图集声明尺寸的 2/3（如 384×384 对 576×576）。chibi.js 已经会先把贴图放大回声明尺寸。 |
| 背面 | 干员的**作战**模型才有 `背面`（正面、背面各一个模型）；**基建**模型只有侧视（用 `scaleX=-1` 翻转）。背面模型没有 `Die`。敌人没有背面。 |
| media.prts.wiki 路径 | `https://media.prts.wiki/<h0>/<h0h1>/<文件名>`，其中 h 是文件名（空格换成 `_`）的 MD5，`$` 编码为 `%24`（`js/journey.js` 已经这么算）。媒体参数可以用：`?image_process=resize,w_400/format,webp/quality,Q_85`。例如凯勒的立绘 PNG 237 KB，转 webp 后 35 KB；CG `i01` 用 w_800 的 webp 是 64 KB。 |

---

## 1. 艾雅法拉（`char_180_amgoat`）与纯烬艾雅法拉（`char_1016_agoat2`）

meta：`https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/meta.json`（ACAO *）
prefix：`https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/`

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 正面 | `defaultskin/front/char_180_amgoat` | 186 KB / 40 KB | 7 KB | 66 KB 512×512 | **107 KB** | Attack 1.2, Die 1.2, Idle 3, Skill_End 2, Skill_Loop 1.2, Skill_Start 1.6, Start 1.2 |
| 默认 | 背面 | `defaultskin/back/char_180_amgoat` | 70 KB / 23 KB | 4 KB | 51 KB 512×512 | **75 KB** | Attack 1.2, Idle 1, Start 1.2 |
| 默认 | 基建 | `defaultskin/build/build_char_180_amgoat` | 110 KB / 34 KB | 8 KB | 120 KB 384×384 / 576×576 | **156 KB** | Interact 1.2, Move 3, Relax 2, Sit 3.33, Sleep 3.33 |
| 夏卉 FA018 | 正面 | `char_180_amgoat_summer_5/front/char_180_amgoat_summer_5` | 272 KB / 63 KB | 9 KB | 88 KB 512×512 | **153 KB** | Attack 1.2, Die 1.1, Idle 3.6, Skill_End 2, Skill_Loop 1.2, Skill_Start 1.6, Start 1.2 |
| 夏卉 FA018 | 背面 | `char_180_amgoat_summer_5/back/char_180_amgoat_summer_5` | 107 KB / 35 KB | 5 KB | 73 KB 512×512 | **109 KB** | Attack 1.2, Idle 1.2, Start 1.2 |
| 夏卉 FA018 | 基建 | `char_180_amgoat_summer_5/build/build_char_180_amgoat_summer_5` | 410 KB / 100 KB | 11 KB | 177 KB 448×448 / 672×672 | **279 KB** | Interact 1.67, Move 1, Relax 4, Sit 5.33, Sleep 3, Special 19 |
| 绵绒小魔女 | 正面 | `char_180_amgoat_sanrio_2/front/char_180_amgoat_sanrio_2` | 406 KB / 110 KB | 12 KB | 156 KB 428×428 | **268 KB** | Attack 1.2, Die 1.2, Idle 4.67, Skill_End 2, Skill_Loop 1.2, Skill_Start 1.6, Start 1 |
| 绵绒小魔女 | 背面 | `char_180_amgoat_sanrio_2/back/char_180_amgoat_sanrio_2` | 175 KB / 55 KB | 7 KB | 128 KB 388×388 | **184 KB** | Attack 1.2, Idle 4.67, Start 1 |
| 绵绒小魔女 | 基建 | `char_180_amgoat_sanrio_2/build/build_char_180_amgoat_sanrio_2` | 669 KB / 169 KB | 16 KB | 310 KB 592×592 / 888×888 | **482 KB** | Interact 4.77, Move 3.33, Relax 4.67, Sit 4.67, Sleep 4.67, Special 17.73 |

meta：`https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/meta.json`（ACAO *）
prefix：`https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/`

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 远行前的野餐 | 正面 | `char_1016_agoat2_epoque_34/front/char_1016_agoat2_epoque_34` | 1106 KB / 169 KB | 16 KB | 153 KB 416×416 | **324 KB** | Attack 1.33, Die 1, Idle 12, Skill_1_Begin 0.5, Skill_1_Idle 8, Skill_1_Loop 1.33, Skill_2 1, Skill_3_Begin 0.4, Skill_3_End 0.33, Skill_3_Idle 3.67, Skill_3_Loop 2.83, Start 1 |
| 远行前的野餐 | 背面 | `char_1016_agoat2_epoque_34/back/char_1016_agoat2_epoque_34` | 466 KB / 86 KB | 10 KB | 129 KB 400×400 | **217 KB** | Attack 1.33, Idle 2, Skill_1_Begin 0.5, Skill_1_Idle 2, Skill_1_Loop 1.33, Skill_2 1, Skill_3_Begin 0.4, Skill_3_End 0.33, Skill_3_Idle 2, Skill_3_Loop 2.83, Start 1 |
| 远行前的野餐 | 基建 | `char_1016_agoat2_epoque_34/build/build_char_1016_agoat2_epoque_34` | 1159 KB / 221 KB | 21 KB | 378 KB 688×688 / 1032×1032 | **603 KB** | Interact 6.67, Move 5.33, Relax 4, Sit 8, Sleep 2.67, Special 12.03 |
| 默认 | 正面 | `defaultskin/front/char_1016_agoat2` | 375 KB / 67 KB | 11 KB | 117 KB 512×512 | **185 KB** | Attack 1.33, Die 0.67, Idle 2.67, Skill_1_Begin 0.5, Skill_1_Idle 2.67, Skill_1_Loop 1.33, Skill_2 1, Skill_3_Begin 0.4, Skill_3_End 0.33, Skill_3_Idle 2.67, Skill_3_Loop 2.83, Start 1 |
| 默认 | 背面 | `defaultskin/back/char_1016_agoat2` | 257 KB / 46 KB | 7 KB | 95 KB 512×512 | **142 KB** | Attack 1.33, Idle 2.67, Skill_1_Begin 0.5, Skill_1_Idle 2.67, Skill_1_Loop 1.33, Skill_2 1, Skill_3_Begin 0.4, Skill_3_End 0.33, Skill_3_Idle 2.67, Skill_3_Loop 2.83, Start 1 |
| 默认 | 基建 | `defaultskin/build/build_char_1016_agoat2` | 156 KB / 39 KB | 10 KB | 189 KB 480×480 / 716×716 | **230 KB** | Interact 3, Move 1.2, Relax 3.33, Sit 3.33, Sleep 2.33 |
| 后来的故事 | 正面 | `char_1016_agoat2_epoque_57/front/char_1016_agoat2_epoque_57` | 459 KB / 66 KB | 15 KB | 179 KB 428×428 | **247 KB** | Attack 1.33, Die 1, Idle 4, Skill_1_Begin 0.5, Skill_1_Idle 2.67, Skill_1_Loop 1.33, Skill_2 1, Skill_3_Begin 0.4, Skill_3_End 0.33, Skill_3_Idle 2.67, Skill_3_Loop 2.83, Start 1 |
| 后来的故事 | 背面 | `char_1016_agoat2_epoque_57/back/char_1016_agoat2_epoque_57` | 353 KB / 51 KB | 12 KB | 158 KB 416×416 | **211 KB** | Attack 1.33, Idle 4, Skill_1_Begin 0.5, Skill_1_Idle 2.67, Skill_1_Loop 1.33, Skill_2 1, Skill_3_Begin 0.4, Skill_3_End 0.33, Skill_3_Idle 2.67, Skill_3_Loop 2.83, Start 1 |
| 后来的故事 | 基建 | `char_1016_agoat2_epoque_57/build/build_char_1016_agoat2_epoque_57` | 459 KB / 92 KB | 17 KB | 332 KB 568×568 / 852×852 | **427 KB** | Interact 2.6, Move 2.93, Relax 3.33, Sit 3.73, Sleep 4, Special 22.5 |

说明
- 两种形态的每套时装都有背面（作战）模型。背面动画：本体是 Attack/Idle/Start；纯烬还包括 Skill_1/2/3。
- 各时装的基建模型带 `Special`，是一段很长的待机表演（夏卉 19 秒、绵绒 17.7 秒、e34 12 秒、e57 22.5 秒）；两个默认基建模型没有 `Special`。
- **「后来的故事」（e57）的基建模型里自带一群粉色毛绒绒的羊**（其中一只打着伞），「远行前的野餐」（e34）的基建模型里有一只白色小羊，见 `oa/shots/spines.png`。
- 剧情立绘（avg，1024×1024 PNG，ACAO *）：
  - `Avg_avg_180_amgoat_1-{1..13}$1.png`，例如 `https://media.prts.wiki/e/ed/Avg_avg_180_amgoat_1-1%241.png`（484 KB）
  - `Avg_avg_1016_agoat2_1-{1..11}${1,2}.png`，例如 `https://media.prts.wiki/1/15/Avg_avg_1016_agoat2_1-1%241.png`（631 KB）、`…/3/3e/Avg_avg_1016_agoat2_1-1%242.png`
  - `avg_npc_989_1` 是 SL-5 梦境里的泳装纯烬造型（12 种表情 × `$1`/`$2`），例如 `https://media.prts.wiki/2/24/Avg_avg_npc_989_1-1%241.png`（457 KB）

## 2. 多利（羊之主）与毛绒绒生物（SideStory「火山旅梦」，2023-08-01 至 08-22）

来源：PRTS「火山旅梦」页面的 `{{登场敌人}}` 列表共 16 个敌人，每个敌人页面都内嵌 Spine 元数据。基础路径：`https://torappu.prts.wiki/assets/enemy_spine/<id>/<id>.{skel,atlas,png}`。

| id | 名称 | 外观（已渲染核对） |
|---|---|---|
| `enemy_1545_shpkg` | **多利，“羊之主”**（领袖） | 一大团粉色云朵，黑色羊脸，头戴黑色尖刺王冠。形态 A = 轻飘飘的多利（浮空），形态 B = 急匆匆的多利。 |
| `enemy_1344_ddlamb` / `_2` | 温泉“淘气包” / 温泉“乐淘淘气包” | 粉白色小羊，头顶交通锥（_2 的锥是红色的） |
| `enemy_1345_tplamb` / `_2` | 风情街“操盘手” / “健美操盘手” | 粉色小羊，戴耳机，叼着飞盘 |
| `enemy_1346_ynshp` / `_2` | 温泉“流浪汉” / “泥石流浪汉” | 戴头盔、趴在滑板上的粉色羊；`2_*` 动画是两只叠在一起（“叠叠乐”） |
| `enemy_1347_fyshp` / `_2` | 风情街“飞空员” / “满天飞空员” | 头顶竹蜻蜓、戴护目镜的羊；`B_*`、`C_*` 是叠起来 / 掉下来的状态 |
| `enemy_1348_rllamb` / `_2` | 城市“风行者” / “龙卷风行者” | 一团尘云里夹着羊的碎片（_2 是暗红色） |
| `enemy_1349_rckshp` / `_2` | “大个子” / “大哥大个子” | 巨大的长毛羊（_2 是深色、红毛尖） |
| `enemy_1350_mgcshp` / `_2` | 风情街“星术师” / “超新星术师” | 戴巫师帽、拿星星魔杖的羊（帽子紫色 / 红色） |
| `enemy_1351_yhhshp` | “好朋友” | 白色的云朵羊（静态：只有 Idle 0 秒和 Die 4 秒） |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1545_shpkg` | 596 KB / 105 KB | 3 KB | 73 KB 512×512 | **178 KB** | Attack_A 2, Default_A 0, Default_B 0, Die_A_Awake 1.5, Die_A_Begin 1.73, Die_A_Loop 1, Die_B 2.57, Fall_A_Begin 0.83, Fall_A_End 0.67, Fall_A_Loop 1, Fall_B_Begin 0.83, Fall_B_End 0.67, Fall_B_Loop 1, Idle_A 1.5, Idle_B 1, Move_A 1, Move_B 1, Skill_A_1 2, Skill_A_2_Begin 2.33, Skill_A_2_End 2.33, Skill_A_2_Loop 1, Skill_B_2_Begin 2.33, Skill_B_2_End 2.33, Skill_B_2_Loop 1 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1344_ddlamb` | 31 KB / 8 KB | 1 KB | 28 KB 512×512 | **37 KB** | Attack 1, Die 1, Idle 1, Move 0.8 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1344_ddlamb_2` | 31 KB / 8 KB | 1 KB | 28 KB 512×512 | **36 KB** | Attack 1, Die 1, Idle 1, Move 0.8 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1345_tplamb` | 51 KB / 18 KB | 2 KB | 39 KB 512×512 | **57 KB** | Attack 1.1, Die 1, Idle 1, Move 0.93 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1345_tplamb_2` | 51 KB / 18 KB | 2 KB | 39 KB 512×512 | **57 KB** | Attack 1.1, Die 1, Idle 1, Move 0.93 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1346_ynshp` | 145 KB / 24 KB | 4 KB | 51 KB 512×512 | **76 KB** | 2_Attack 1.2, 2_Default 0, 2_Die 1.33, 2_Idle 3, 2_Move 2.4, Attack 1, Die 1, Idle 1, Move 0.8 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1346_ynshp_2` | 145 KB / 24 KB | 4 KB | 50 KB 512×512 | **75 KB** | 2_Attack 1.2, 2_Default 0, 2_Die 1.33, 2_Idle 3, 2_Move 2.4, Attack 1, Die 1, Idle 1, Move 0.8 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1347_fyshp` | 295 KB / 63 KB | 4 KB | 63 KB 512×512 | **126 KB** | B_Attack 1.27, B_Default 0, B_Die 1, B_Idle 1, B_Move 0.93, B_Start 1, C_Attack 1.23, C_Default 0, C_Die 1, C_Idle 1.33, C_Move 1.33, C_Stun 1, Die 1, Idle 1.33, Move 1 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1347_fyshp_2` | 295 KB / 63 KB | 4 KB | 62 KB 512×512 | **126 KB** | B_Attack 1.27, B_Default 0, B_Die 1, B_Idle 1, B_Move 0.93, B_Start 1, C_Attack 1.23, C_Default 0, C_Die 1, C_Idle 1.33, C_Move 1.33, C_Stun 1, Die 1, Idle 1.33, Move 1 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1348_rllamb` | 40 KB / 6 KB | 2 KB | 53 KB 512×512 | **59 KB** | Attack 1.33, Die 0.67, Idle 1.33, Move 1.33 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1348_rllamb_2` | 35 KB / 5 KB | 1 KB | 41 KB 512×512 | **47 KB** | Attack 1.33, Die 0.67, Idle 1.33, Move 1.33 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1349_rckshp` | 77 KB / 22 KB | 1 KB | 37 KB 512×512 | **59 KB** | Attack_A 1.13, Attack_B 1.47, Die 1, Idle 1.67, Move 1 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1349_rckshp_2` | 77 KB / 22 KB | 1 KB | 37 KB 512×512 | **59 KB** | Attack_A 1.13, Attack_B 1.47, Die 1, Idle 1.67, Move 1 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1350_mgcshp` | 78 KB / 21 KB | 1 KB | 31 KB 512×512 | **53 KB** | Attack 1, Die 1, Idle 1, Move 0.93 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1350_mgcshp_2` | 78 KB / 21 KB | 2 KB | 31 KB 512×512 | **52 KB** | Attack 1, Die 1, Idle 1, Move 0.93 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `enemy_1351_yhhshp` | 27 KB / 8 KB | 2 KB | 75 KB 512×512 | **84 KB** | Die 4, Idle 0 |

剧情立绘（静态 PNG，ACAO *）：多利和剧情里的毛绒绒“生物”（名字取自剧本里的说话人，是按上下文推断的）

| 精灵 | 说话人 | 外观 | URL | 尺寸 |
|---|---|---|---|---|
| avg_npc_1014_1 | 多利 | 粉色云团，黑脸，王冠 | https://media.prts.wiki/7/7e/Avg_avg_npc_1014_1%241.png | 1024²，534 KB |
| avg_npc_1004_1 | 外形小巧的生物 / 被落下的生物 | **小黑羊**（结局 CG i13 里陪着阿黛尔的那只） | https://media.prts.wiki/3/3a/Avg_avg_npc_1004_1%241.png | 512²，164 KB |
| avg_npc_1006_1 | 严肃的生物 | 火山形状的奶油色羊 | https://media.prts.wiki/c/c6/Avg_avg_npc_1006_1%241.png | 1024²，336 KB |
| avg_npc_1007_1 | 温和的生物 | 粉色羊，打伞，带着雨云 | https://media.prts.wiki/b/b3/Avg_avg_npc_1007_1%241.png | 512²，132 KB |
| avg_npc_1008_1 | 着急的生物 | 粉色羊，头顶交通锥，带生气符号 | https://media.prts.wiki/4/4d/Avg_avg_npc_1008_1%241.png | 512²，127 KB |
| avg_npc_1009_1 | 咖啡色的生物 | 粉色羊，头上是帽子和咖啡杯 | https://media.prts.wiki/b/b0/Avg_avg_npc_1009_1%241.png | 512²，142 KB |
| avg_npc_1010_1 | 开朗的 / 快乐的生物 | 粉色羊，彩虹加花 | https://media.prts.wiki/0/04/Avg_avg_npc_1010_1%241.png | 512²，140 KB |
| avg_npc_1011_1 | 精明的 / 迷糊的生物 | 粉色羊，算盘，“$$”眼镜 | https://media.prts.wiki/7/79/Avg_avg_npc_1011_1%241.png | 512²，137 KB |
| avg_npc_1012_1 | 迷糊的生物 | 粉色羊，酒瓶，晕乎乎的星星 | https://media.prts.wiki/9/9b/Avg_avg_npc_1012_1%241.png | 512²，134 KB |
| avg_npc_1013_1 | 迷路的 / 背着矿灯的生物 | 粉色羊，矿工头盔、矿灯、书 | https://media.prts.wiki/f/fe/Avg_avg_npc_1013_1%241.png | 512²，137 KB |

多利也出现在 CG `i08`（在岩浆里冲浪，周围是羊群）：https://media.prts.wiki/e/e0/Avg_41_i08.png （1600×900，2.4 MB；建议用 `?image_process=resize,w_800/format,webp`）。
模组图 `模组_宠物大赛第一名.png` 上有一只戴王冠的粉色大羊：https://media.prts.wiki/4/4a/%E6%A8%A1%E7%BB%84_%E5%AE%A0%E7%89%A9%E5%A4%A7%E8%B5%9B%E7%AC%AC%E4%B8%80%E5%90%8D.png （511²，370 KB）。

## 3. 阿黛尔·凯勒（凯勒）

PRTS「剧情角色一览」：“全名阿黛尔·凯勒，汐斯塔人，阿黛尔的老师，现任汐斯塔火山博物馆馆长”，立绘是 `avg npc 999 1-1$1`。在「火山旅梦」里有 194 句台词。

| 素材 | URL | 尺寸 | CORS |
|---|---|---|---|
| 剧情立绘 1（默认） | https://media.prts.wiki/8/8c/Avg_avg_npc_999_1-1%241.png | 1024²，237 KB（转 webp 35 KB） | * |
| 立绘 2 | https://media.prts.wiki/e/e8/Avg_avg_npc_999_1-2%241.png | 1024²，236 KB | * |
| 立绘 3 | https://media.prts.wiki/2/27/Avg_avg_npc_999_1-3%241.png | 同上 | * |
| 立绘 4 | https://media.prts.wiki/f/fe/Avg_avg_npc_999_1-4%241.png | 同上 | * |
| 立绘 5 | https://media.prts.wiki/6/60/Avg_avg_npc_999_1-5%241.png | 同上 | * |
| 立绘 6 | https://media.prts.wiki/0/0c/Avg_avg_npc_999_1-6%241.png | 同上 | * |
| 立绘 7 | https://media.prts.wiki/b/b1/Avg_avg_npc_999_1-7%241.png | 同上 | * |
| 立绘 8 | https://media.prts.wiki/1/18/Avg_avg_npc_999_1-8%241.png | 同上 | * |
| 立绘 9 | https://media.prts.wiki/4/48/Avg_avg_npc_999_1-9%241.png | 同上 | * |
| 立绘 10 | https://media.prts.wiki/4/4b/Avg_avg_npc_999_1-10%241.png | 同上 | * |
| CG i02（博物馆：阿黛尔在母亲外套的展柜前；左侧前景的人物应该是凯勒） | https://media.prts.wiki/9/95/Avg_41_i02.png | 1600×900，1.96 MB | * |
| CG i06（咖啡馆：左边戴眼镜、拿杯子的人可能是凯勒，窗边是阿黛尔） | https://media.prts.wiki/7/77/Avg_41_i06.png | 1600×900，1.67 MB | * |

十张立绘是同一个全身站姿（白色长发，戴眼镜，背包，卡其工装裤），只有表情不同，文件大小几乎一样。**凯勒没有 Spine 小人，也没有专属 CG。** wiki.gg 上的 `Adele_Keller.png` 和立绘 1 是同一张图，但没有 CORS。

## 4. 艾雅法拉的父母：卡提亚·瑙曼 与 玛格娜·瑙曼

名字已核对。SL-ST-1 博物馆展牌的原文是“卡提亚·瑙曼（1051—1095）”和“玛格娜·瑙曼（1053—1095）”，SL-4 BEG 的考察记录写着“考察队成员：卡提亚、玛格娜、凯勒”。

- **没有剧情立绘，没有 Spine，没有 CG。** 他们在 SL-8 BEG 里只作为画外音说话（灰度闪回、背景 `bg_beach_1` 和 `41_g11_volcanomountainside`、没有立绘），在纯烬的干员密录里也一样（“玛格娜”12 句、“卡提亚”9 句、“小阿黛尔”6 句，也都没有立绘和 CG）。「剧情角色一览」里没有两人的条目。
- 前瞻 PV 里的全家福：**PRTS 上没有对应的图片文件。** 我搜了文件命名空间（“纯烬艾雅法拉”“全家福”“瑙曼”），也检查了纯烬页面用到的全部图片，只有技能、道具、头像和立绘文件。
- **唯一找到的官方形象**：艾雅法拉 ccr-Y 模组图「宠物大赛第一名」里的一个小相框。照片里是两个大人和一个孩子，应该就是瑙曼一家在宠物大赛上的合影，这正是该模组故事的内容（这一点是推断）。
  - 图片：https://media.prts.wiki/4/4a/%E6%A8%A1%E7%BB%84_%E5%AE%A0%E7%89%A9%E5%A4%A7%E8%B5%9B%E7%AC%AC%E4%B8%80%E5%90%8D.png （511×511，370 KB，ACAO *）
  - 照片在原图中的大致位置：x 118–268，y 328–418（约 150×90 像素，略带透视）；连同相框约为 x 100–275，y 316–435。分辨率很低，只能当很小的道具用。
  - 模组图 `模组_想要留下的生命.png` 里还有一张更小的拍立得照片，辨认不出内容。

## 5. 芳汀（`char_271_spikes`）

PRTS 已核对：芳汀是**男性**干员（萨科塔“少年”、父母的“独生子”，英文代号 Arene），不是女同学。档案资料三写道：他和艾雅法拉“在大学甚至选修过同一位知名教授的课程，勉强算得上是有同窗之谊”。所以两人是**大学**时期的同窗（芳汀在莱塔尼亚求学），不是中小学同学。

meta：`https://torappu.prts.wiki/assets/char_spine/char_271_spikes/meta.json`

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 随性 | 正面 | `char_271_spikes_winter_2/front/char_271_spikes_winter_2` | 253 KB / 56 KB | 9 KB | 101 KB 512×512 | **158 KB** | Attack_01 1.33, Combat 1.33, Die 0.8, Idle 6, Skill_01 1.33, Skill_02 1.33, Start 0.83 |
| 随性 | 背面 | `char_271_spikes_winter_2/back/char_271_spikes_winter_2` | 154 KB / 36 KB | 6 KB | 64 KB 512×512 | **101 KB** | Attack_01 1.33, Combat 1.33, Die 0.8, Idle 6, Skill_01 1.33, Skill_02 1.33, Start 0.83 |
| 随性 | 基建 | `char_271_spikes_winter_2/build/build_char_271_spikes_winter_2` | 305 KB / 74 KB | 14 KB | 289 KB 568×568 / 852×852 | **366 KB** | Interact 1.5, Move 1.33, Relax 2, Sit 8, Sleep 3, Special 9.33 |
| 危险邀约 | 正面 | `char_271_spikes_unveiling_1/front/char_271_spikes_unveiling_1` | 282 KB / 64 KB | 10 KB | 81 KB 288×288 | **147 KB** | Attack_01 1.33, Combat 1.33, Die 0.8, Idle 6, Skill_01 1.33, Skill_02 1.33, Start 0.83 |
| 危险邀约 | 背面 | `char_271_spikes_unveiling_1/back/char_271_spikes_unveiling_1` | 147 KB / 32 KB | 6 KB | 65 KB 264×264 | **98 KB** | Attack_01 1.33, Combat 1.33, Die 0.7, Idle 2, Skill_01 1.33, Skill_02 1.33, Start 0.83 |
| 危险邀约 | 基建 | `char_271_spikes_unveiling_1/build/build_char_271_spikes_unveiling_1` | 274 KB / 69 KB | 10 KB | 198 KB 488×488 / 732×732 | **268 KB** | Interact 1.7, Move 1.33, Relax 4.67, Sit 9, Sleep 3.33, Special 12.7 |
| 默认 | 正面 | `defaultskin/front/char_271_spikes` | 227 KB / 53 KB | 6 KB | 48 KB 256×256 | **102 KB** | Attack_01 1.33, Combat 1.33, Die 0.8, Idle 4, Skill_01 1.33, Skill_02 1.33, Start 0.83 |
| 默认 | 背面 | `defaultskin/back/char_271_spikes` | 144 KB / 34 KB | 4 KB | 39 KB 256×256 | **74 KB** | Attack_01 1.33, Combat 1.33, Die 0.8, Idle 4, Skill_01 1.33, Skill_02 1.33, Start 0.83 |
| 默认 | 基建 | `defaultskin/build/build_char_271_spikes` | 148 KB / 40 KB | 6 KB | 91 KB 328×328 / 488×488 | **132 KB** | Interact 1.5, Move 1.33, Relax 2, Sit 8, Sleep 3 |

注意：这个模型的动画名和常见的不一样（`Attack_01`、`Combat`、`Skill_01/02`），chibi.js 的 `buildActions` 需要单独映射一下。

## 6. 博士

- **没有 Spine 小人**：PRTS 上没有「博士/spine」页面，也没有已知的 char_spine id。
- 官方图片（「剧情角色一览」里博士一栏用的两张，ACAO *）：
  - 剧情立绘（兜帽）：https://media.prts.wiki/0/09/Avg_avg_npc_048.png （1024²，167 KB）
  - 全身图：https://media.prts.wiki/a/aa/Npc_doctor.png （1024²，206 KB；黑色兜帽大衣加面罩）

## 7. 「火山旅梦」里出场的干员（可以做客串）

依据：扫描了 PRTS 上全部 19 页剧情（SL-ST-1…3 的 NBT，SL-1…8 的 BEG/END），按立绘和说话人统计。

| 干员 | Spine id | 剧中身份 / 台词数 | 剧情立绘 | 时装（meta 里有的） |
|---|---|---|---|---|
| 琳琅诗怀雅 | `char_1033_swire2` | “诗怀雅”，250 句 | avg_1033_swire2_1（11 种） | 默认，律动方格 |
| 苍苔 | `char_4106_bryota` | “埃尼斯”，321 句（哈莉的养子） | avg_4106_bryota_1（20 种） | 默认，动感 |
| 雪雉 | `char_383_snsant` | “雪雉”，89 句（剧中用夏装 NPC 立绘） | avg_npc_1005_1（11 种，夏装）；另有 avg_383_snsant_1 | 默认，天命勇者 |
| 锡兰 | `char_348_ceylon` | “锡兰”，139 句 | avg_348_ceylon_1、avg_npc_1003_1（夏装） | 默认，**悠然假日 HD49（夏装）** |
| 黑 | `char_340_shwaz` | “黑”，11 句（SL-8 END、SL-ST-3） | avg_340_shwaz_1 | 默认，厚礼，天际线 |
| 大帝 | `trap_035_emperor`（装置 Spine，没有 meta.json） | “大帝”，24 句 | （剧情里用 `char_105_emper`） | 只有一个 |
| 青枳 | `char_488_buildr` | **不在活动剧情里**（0 句）。她是活动预告里的新干员，她的干员密录「复还的羽兽」也发生在汐斯塔（有科斯达）。 | —— | 默认，晚风休憩 |
| （诗怀雅本体） | `char_308_swire` | 剧情用的是琳琅诗怀雅的立绘 | —— | 默认，富贵荣华 |

剧中其他只有立绘、没有 Spine 的 NPC：拜松 avg_npc_990_1，卡恩 996，科斯达 997，哈莉 994，伯德 993，佩利佩 995，赫尔曼 544，欧厄尔 539，路特 991，丽芙 992，冷饮店店主 1002，乐器店老板 1000/1001，贫穷的少女（安麦尔）1015。魏彦吾只在 SL-ST-3 出现。

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 正面 | `defaultskin/front/char_1033_swire2` | 503 KB / 102 KB | 11 KB | 98 KB 512×512 | **202 KB** | Attack 1, Die 1, Idle 4, Skill_1 1, Skill_2 1, Skill_3_Begin 0.33, Skill_3_End 1.33, Skill_3_Idle 2.13, Skill_3_Loop 1, Start 1 |
| 默认 | 背面 | `defaultskin/back/char_1033_swire2` | 298 KB / 64 KB | 7 KB | 75 KB 512×512 | **141 KB** | Attack 1, Idle 4, Skill_1 1, Skill_2 1, Skill_3_Begin 0.33, Skill_3_End 1.33, Skill_3_Idle 2.13, Skill_3_Loop 1, Start 1 |
| 默认 | 基建 | `defaultskin/build/build_char_1033_swire2` | 235 KB / 69 KB | 11 KB | 192 KB 488×488 / 732×732 | **263 KB** | Interact 3.5, Move 1.33, Relax 5.33, Sit 5.33, Sleep 2.67 |
| 律动方格 | 正面 | `char_1033_swire2_ambiencesynesthesia_4/front/char_1033_swire2_ambienceSynesthesia_4` | 272 KB / 65 KB | 8 KB | 97 KB 340×340 | **163 KB** | Attack 1, Die 1, Idle 4, Skill_1 1, Skill_2 1, Skill_3_Begin 0.33, Skill_3_End 1.33, Skill_3_Idle 2.13, Skill_3_Loop 1, Start 1 |
| 律动方格 | 背面 | `char_1033_swire2_ambiencesynesthesia_4/back/char_1033_swire2_ambienceSynesthesia_4` | 193 KB / 46 KB | 7 KB | 75 KB 300×300 | **123 KB** | Attack 1, Idle 4, Skill_1 1, Skill_2 1, Skill_3_Begin 0.33, Skill_3_End 1.33, Skill_3_Idle 2.13, Skill_3_Loop 1, Start 1 |
| 律动方格 | 基建 | `char_1033_swire2_ambiencesynesthesia_4/build/build_char_1033_swire2_ambienceSynesthesia_4` | 285 KB / 71 KB | 13 KB | 312 KB 628×628 / 940×940 | **385 KB** | Interact 2.67, Move 1.33, Relax 4, Sit 2.67, Sleep 2, Special 12 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 正面 | `defaultskin/front/char_4106_bryota` | 285 KB / 49 KB | 8 KB | 67 KB 512×512 | **118 KB** | Attack 1.07, Attack_Down 1.07, Die 1, Idle 4, Skill 1.07, Skill_Down 1.07, Start 1 |
| 默认 | 背面 | `defaultskin/back/char_4106_bryota` | 164 KB / 34 KB | 4 KB | 51 KB 512×512 | **86 KB** | Attack 1.07, Idle 4, Skill 1.07, Start 1 |
| 默认 | 基建 | `defaultskin/build/build_char_4106_bryota` | 231 KB / 43 KB | 8 KB | 118 KB 336×336 / 500×500 | **162 KB** | Interact 1.53, Move 1.2, Relax 4, Sit 4, Sleep 2.67 |
| 动感 | 正面 | `char_4106_bryota_epoque_34/front/char_4106_bryota_epoque_34` | 216 KB / 43 KB | 9 KB | 77 KB 276×276 | **122 KB** | Attack 1.07, Attack_Down 1.07, Die 0.97, Idle 4.5, Skill 1.07, Skill_Down 1.07, Start 1 |
| 动感 | 背面 | `char_4106_bryota_epoque_34/back/char_4106_bryota_epoque_34` | 90 KB / 25 KB | 5 KB | 55 KB 240×240 | **81 KB** | Attack 1.07, Idle 1.5, Skill 1.07, Start 1 |
| 动感 | 基建 | `char_4106_bryota_epoque_34/build/build_char_4106_bryota_epoque_34` | 280 KB / 69 KB | 11 KB | 151 KB 396×396 / 592×592 | **222 KB** | Interact 1.57, Move 1.2, Relax 3.33, Sit 4.67, Sleep 3, Special 16.9 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 天命勇者 | 正面 | `char_383_snsant_witch_2/front/char_383_snsant_witch_2` | 210 KB / 39 KB | 12 KB | 115 KB 512×512 | **156 KB** | Attack 1.5, Die 1, Idle 1, Skill_2_Begin 1.4, Skill_2_End 1, Skill_2_Loop 0.6, Skill_Begin 1, Skill_End 0.8, Skill_Loop 0.6, Start 1 |
| 天命勇者 | 背面 | `char_383_snsant_witch_2/back/char_383_snsant_witch_2` | 176 KB / 29 KB | 9 KB | 98 KB 512×512 | **128 KB** | Attack 1.5, Idle 1, Skill_2_Begin 1.4, Skill_2_End 1, Skill_2_Loop 0.6, Skill_Begin 1, Skill_End 0.8, Skill_Loop 0.6, Start 1 |
| 天命勇者 | 基建 | `char_383_snsant_witch_2/build/build_char_383_snsant_witch_2` | 160 KB / 36 KB | 9 KB | 163 KB 408×408 / 608×608 | **201 KB** | Interact 1.67, Move 1.13, Relax 4, Sit 6, Sleep 4, Special 9.83 |
| 默认 | 正面 | `defaultskin/front/char_383_snsant` | 145 KB / 26 KB | 7 KB | 95 KB 512×512 | **123 KB** | Attack 1.5, Die 1, Idle 1, Skill_2_Begin 1.4, Skill_2_End 1, Skill_2_Loop 0.6, Skill_Begin 1, Skill_End 0.8, Skill_Loop 0.6, Start 1 |
| 默认 | 背面 | `defaultskin/back/char_383_snsant` | 118 KB / 18 KB | 5 KB | 74 KB 512×512 | **92 KB** | Attack 1.5, Idle 1, Skill_2_Begin 1.4, Skill_2_End 1, Skill_2_Loop 0.6, Skill_Begin 1, Skill_End 0.8, Skill_Loop 0.6, Start 1 |
| 默认 | 基建 | `defaultskin/build/build_char_383_snsant` | 58 KB / 15 KB | 5 KB | 120 KB 356×356 / 532×532 | **136 KB** | Interact 1, Move 1.13, Relax 1, Sit 8, Sleep 3 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 正面 | `defaultskin/front/char_348_ceylon` | 162 KB / 55 KB | 10 KB | 124 KB 512×512 | **181 KB** | Attack 1.43, Die 1, Idle 2.67, Start 1 |
| 默认 | 背面 | `defaultskin/back/char_348_ceylon` | 115 KB / 45 KB | 5 KB | 104 KB 512×512 | **150 KB** | Attack 1.43, Idle 1.33, Start 1 |
| 默认 | 基建 | `defaultskin/build/build_char_348_ceylon` | 179 KB / 51 KB | 10 KB | 233 KB 532×532 / 796×796 | **286 KB** | Interact 1, Move 1.07, Relax 6, Sit 4, Sleep 2.67, Special 3.5 |
| 悠然假日 HD49 | 正面 | `char_348_ceylon_summer_13/front/char_348_ceylon_summer_13` | 310 KB / 74 KB | 11 KB | 136 KB 512×512 | **212 KB** | Attack 1.43, Die 1, Idle 4, Start 1 |
| 悠然假日 HD49 | 背面 | `char_348_ceylon_summer_13/back/char_348_ceylon_summer_13` | 197 KB / 51 KB | 6 KB | 92 KB 512×512 | **144 KB** | Attack 1.43, Idle 4, Start 1 |
| 悠然假日 HD49 | 基建 | `char_348_ceylon_summer_13/build/build_char_348_ceylon_summer_13` | 411 KB / 87 KB | 10 KB | 210 KB 500×500 / 748×748 | **299 KB** | Interact 2.67, Move 5.33, Relax 4, Sit 2, Sleep 4, Special 14 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 厚礼 | 正面 | `char_340_shwaz_snow_1/front/char_340_shwaz_snow_1` | 196 KB / 49 KB | 12 KB | 128 KB 512×512 | **179 KB** | Attack_Begin 0.23, Attack_End 0.23, Attack_Loop 1.6, Die 1, Idle 4, Skill_Begin 0.23, Skill_End 0.23, Skill_Idle 4, Skill_Loop 1.83, Start 1 |
| 厚礼 | 背面 | `char_340_shwaz_snow_1/back/char_340_shwaz_snow_1` | 135 KB / 36 KB | 9 KB | 107 KB 512×512 | **145 KB** | Attack_Begin 0.23, Attack_End 0.23, Attack_Loop 1.6, Idle 4, Skill_Begin 0.23, Skill_End 0.23, Skill_Idle 4, Skill_Loop 1.83, Start 1 |
| 厚礼 | 基建 | `char_340_shwaz_snow_1/build/build_char_340_shwaz_snow_1` | 198 KB / 57 KB | 14 KB | 275 KB 532×532 / 796×796 | **335 KB** | Interact 1, Move 1.33, Relax 5, Sit 3.33, Sleep 12, Special 11.17 |
| 天际线 | 正面 | `char_340_shwaz_striker_1/front/char_340_shwaz_striker_1` | 167 KB / 41 KB | 11 KB | 101 KB 512×512 | **143 KB** | Attack_Begin 0.23, Attack_End 0.23, Attack_Loop 1.6, Die 1, Idle 4, Skill_Begin 0.23, Skill_End 0.23, Skill_Idle 4, Skill_Loop 1.83, Start 1 |
| 天际线 | 背面 | `char_340_shwaz_striker_1/back/char_340_shwaz_striker_1` | 122 KB / 29 KB | 8 KB | 85 KB 512×512 | **116 KB** | Attack_Begin 0.23, Attack_End 0.23, Attack_Loop 1.6, Idle 4, Skill_Begin 0.23, Skill_End 0.23, Skill_Idle 4, Skill_Loop 1.83, Start 1 |
| 天际线 | 基建 | `char_340_shwaz_striker_1/build/build_char_340_shwaz_striker_1` | 165 KB / 41 KB | 8 KB | 150 KB 396×396 / 592×592 | **193 KB** | Interact 1.33, Move 2.67, Relax 5, Sit 3.33, Sleep 4, Special 11.53 |
| 默认 | 正面 | `defaultskin/front/char_340_shwaz` | 208 KB / 49 KB | 13 KB | 136 KB 512×512 | **188 KB** | Attack_Begin 0.23, Attack_End 0.23, Attack_Loop 1.6, Die 1, Idle 4, Skill_Begin 0.23, Skill_End 0.23, Skill_Idle 4, Skill_Loop 1.83, Start 1 |
| 默认 | 背面 | `defaultskin/back/char_340_shwaz` | 149 KB / 39 KB | 9 KB | 111 KB 512×512 | **152 KB** | Attack_Begin 0.23, Attack_End 0.23, Attack_Loop 1.6, Idle 4, Skill_Begin 0.23, Skill_End 0.23, Skill_Idle 4, Skill_Loop 1.83, Start 1 |
| 默认 | 基建 | `defaultskin/build/build_char_340_shwaz` | 119 KB / 40 KB | 13 KB | 257 KB 520×520 / 780×780 | **300 KB** | Interact 1, Move 1.33, Relax 5, Sit 3.33, Sleep 4 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 战斗 | `trap_035_emperor` | 263 KB / 47 KB | 3 KB | 38 KB 256×256 | **85 KB** | Idle 37, Skill 2 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 晚风休憩 | 正面 | `char_488_buildr_epoque_34/front/char_488_buildr_epoque_34` | 161 KB / 34 KB | 7 KB | 70 KB 276×276 | **105 KB** | Attack 1.27, Die 1, Idle 2, Skill_2_Begin 0.17, Skill_2_End 0.17, Skill_2_Idle 2, Skill_2_Loop 1.27, Start 1 |
| 晚风休憩 | 背面 | `char_488_buildr_epoque_34/back/char_488_buildr_epoque_34` | 99 KB / 21 KB | 4 KB | 56 KB 252×252 | **78 KB** | Attack 1.27, Idle 2, Skill_2_Begin 0.17, Skill_2_End 0.17, Skill_2_Idle 2, Skill_2_Loop 1.27, Start 1 |
| 晚风休憩 | 基建 | `char_488_buildr_epoque_34/build/build_char_488_buildr_epoque_34` | 174 KB / 45 KB | 10 KB | 164 KB 476×476 / 712×712 | **211 KB** | Interact 2, Move 1.33, Relax 3.07, Sit 2.93, Sleep 1.67, Special 6.33 |
| 默认 | 正面 | `defaultskin/front/char_488_buildr` | 401 KB / 86 KB | 8 KB | 83 KB 512×512 | **170 KB** | Attack 1.27, Die 1, Idle 2.67, Skill_2_Begin 0.17, Skill_2_End 0.17, Skill_2_Idle 2.67, Skill_2_Loop 1.27, Start 1 |
| 默认 | 背面 | `defaultskin/back/char_488_buildr` | 152 KB / 29 KB | 5 KB | 71 KB 512×512 | **101 KB** | Attack 1.27, Idle 2.67, Skill_2_Begin 0.17, Skill_2_End 0.17, Skill_2_Idle 2.67, Skill_2_Loop 1.27, Start 1 |
| 默认 | 基建 | `defaultskin/build/build_char_488_buildr` | 320 KB / 85 KB | 8 KB | 139 KB 384×384 / 576×576 | **225 KB** | Interact 2.33, Move 1, Relax 8.33, Sit 4, Sleep 3 |

| 时装 | 组 | 文件（相对 prefix） | skel 原始/传输 | atlas | 贴图 png（实际尺寸 / 图集声明） | 合计 传输 | 动画（秒） |
|---|---|---|---|---|---|---|---|
| 默认 | 正面 | `defaultskin/front/char_308_swire` | 210 KB / 60 KB | 9 KB | 97 KB 512×512 | **158 KB** | Attack 1.33, Attack_Down 1.33, Die 1, Idle 2, Start 1 |
| 默认 | 背面 | `defaultskin/back/char_308_swire` | 111 KB / 32 KB | 6 KB | 81 KB 512×512 | **114 KB** | Attack 1.33, Attack_Up 1.33, Idle 2, Start 1 |
| 默认 | 基建 | `defaultskin/build/build_char_308_swire` | 131 KB / 46 KB | 6 KB | 132 KB 376×376 / 564×564 | **179 KB** | Interact 1, Move 1, Relax 2, Sit 2.67, Sleep 2 |
| 富贵荣华 | 正面 | `char_308_swire_nian_2/front/char_308_swire_nian_2` | 162 KB / 52 KB | 10 KB | 123 KB 512×512 | **177 KB** | Attack 1.33, Attack_Down 1.33, Die 1, Idle 2.67, Start 1 |
| 富贵荣华 | 背面 | `char_308_swire_nian_2/back/char_308_swire_nian_2` | 90 KB / 29 KB | 5 KB | 88 KB 512×512 | **117 KB** | Attack 1.33, Attack_Up 1.33, Idle 2.67, Start 1 |
| 富贵荣华 | 基建 | `char_308_swire_nian_2/build/build_char_308_swire_nian_2` | 181 KB / 57 KB | 8 KB | 195 KB 428×428 / 640×640 | **254 KB** | Interact 1, Move 2, Relax 4, Sit 4, Sleep 5.33, Special 4.33 |

## 8. 附带：「火山旅梦」的 CG 和背景（media.prts.wiki，ACAO *）

CG 都是 1600×900 的 PNG，1.6–2.7 MB，**一定要用 `?image_process=resize,w_800/format,webp/quality,Q_85`**（约 60 KB）。

| key | 内容 | URL |
|---|---|---|
| i01 | 汐斯塔喷泉广场，纯烬艾雅法拉和琳琅诗怀雅的背影 | https://media.prts.wiki/1/1d/Avg_41_i01.png |
| i02 | 博物馆展柜（母亲的外套），前景是凯勒 | https://media.prts.wiki/9/95/Avg_41_i02.png |
| i03 | 夜里的港口，阿黛尔追着一群羊 | https://media.prts.wiki/9/91/Avg_41_i03.png |
| i04 | 车窗旁：猫耳吉他手和阿黛尔 | https://media.prts.wiki/2/27/Avg_41_i04.png |
| i05 | 海滩梦境：泳装阿黛尔、诗怀雅、羊群、多利 | https://media.prts.wiki/2/2d/Avg_41_i05.png |
| i06 | 咖啡馆：凯勒（？），窗边的阿黛尔 | https://media.prts.wiki/7/77/Avg_41_i06.png |
| i07 | 纯烬艾雅法拉持杖施法 | https://media.prts.wiki/8/8e/Avg_41_i07.png |
| i08 | 多利在岩浆里冲浪，周围是羊群 | https://media.prts.wiki/e/e0/Avg_41_i08.png |
| i09 | 埃尼斯（苍苔）在涨潮的海水里抱起丽芙 | https://media.prts.wiki/6/66/Avg_41_i09.png |
| i10 | 火山喷发，诗怀雅和阿黛尔的背影，人群 | https://media.prts.wiki/d/dc/Avg_41_i10.png |
| i11 | 长角的青年在书桌前（可能是卡恩） | https://media.prts.wiki/c/cd/Avg_41_i11.png |
| i12_1 / i12_2 | 摄像机取景框里的琳琅诗怀雅 | https://media.prts.wiki/6/6b/Avg_41_i12_1.png / https://media.prts.wiki/4/40/Avg_41_i12_2.png |
| i13_1 / i13_2 | 结局：阿黛尔坐在书桌前，小黑羊和一株花 | https://media.prts.wiki/6/69/Avg_41_i13_1.png / https://media.prts.wiki/a/ac/Avg_41_i13_2.png |
| i14 | 诗怀雅开敞篷车 | https://media.prts.wiki/4/47/Avg_41_i14.png |

背景都是 1024×576，约 1 MB，文件名 `Avg_bg_41_g*`：
g1 商业街白天 https://media.prts.wiki/6/65/Avg_bg_41_g1_siestacommercialstreet_d.png ·
g2 商业街夜晚 https://media.prts.wiki/b/b6/Avg_bg_41_g2_siestacommercialstreet_n.png ·
g3 新街白天 https://media.prts.wiki/a/ab/Avg_bg_41_g3_siestanewstreet_d.png ·
g4 新街夜晚 https://media.prts.wiki/8/8f/Avg_bg_41_g4_siestanewstreet_n.png ·
g5 未开发区白天 https://media.prts.wiki/2/27/Avg_bg_41_g5_siestaunbuiltland_d.png ·
g6 未开发区夜晚 https://media.prts.wiki/f/f6/Avg_bg_41_g6_siestaunbuiltland_n.png ·
g7 高科技旅游区 https://media.prts.wiki/5/5e/Avg_bg_41_g7_siestahightechtouristzone.png ·
g8 火山博物馆内部 https://media.prts.wiki/4/4b/Avg_bg_41_g8_siestavolcanomuseum_inside.png ·
g9 “纯白火山”酒吧内部 https://media.prts.wiki/5/58/Avg_bg_41_g9_purewhitevolcano_inside.png ·
g10 高级酒店 https://media.prts.wiki/0/04/Avg_bg_41_g10_siestapremiumhotel.png ·
g11 火山山腰 https://media.prts.wiki/5/57/Avg_bg_41_g11_volcanomountainside.png ·
g12 黑曜石温泉酒店 https://media.prts.wiki/8/81/Avg_bg_41_g12_obsidianhotspringshotel.png ·
g13 汐斯塔初印象 https://media.prts.wiki/7/76/Avg_bg_41_g13_siestafirstimpression.png

## 9. 各角色的建议

| 角色 | 建议 |
|---|---|
| 艾雅法拉 / 纯烬 | 用官方 Spine。平时走动、坐下、睡觉用基建模型（Move/Relax/Sit/Sleep/Interact）；面对镜头用作战正面；看火山之类需要背对镜头的镜头用**作战背面**（每套时装都有）。手机上优先用默认时装（每个模型传输约 110–230 KB）；e34 基建模型较大（传输 603 KB）。 |
| 粉色小羊 | 用敌人 Spine。它们都很小（传输 37–126 KB），而且全部是粉色毛绒绒的：人群场景用 1344/1345/1350/1351（每只 36–84 KB），可以复用 skel 实例化多份；e57 基建模型里本身就带粉色羊。 |
| 多利 | `enemy_1545_shpkg`（传输 178 KB）：A 形态有 Idle_A、Move_A、Attack_A、Skill_A_*、Fall_A_*、Die_A_*；B 形态有 Idle_B、Move_B。特写或对话画面可以配 avg_npc_1014_1 立绘。 |
| 凯勒 | 只有静态立绘（10 种表情），做成 2D 立绘卡片或剪影（加一点呼吸 / 上下浮动 / 视差），加载 webp 版本（35 KB）。不要用 wiki.gg 那个 URL。 |
| 父母 | 没有可用的官方形象。按游戏本身的处理方式保持**画外音**（剧中他们只在灰度闪回里以声音出现），或者用模组图里那张很小的全家福裁出来当相框道具。 |
| 芳汀 | 如果要用，Spine 是 `char_271_spikes`，但要注意他是男性、是大学同窗；动画名需要单独映射。 |
| 博士 | 没有小人。保持第一人称视角或画外（游戏惯例），需要时用兜帽立绘 `Avg_avg_npc_048.png` 做剪影。 |
| 客串 | 琳琅诗怀雅、苍苔、雪雉、锡兰（夏装）、黑，再加大帝的装置 Spine，都是剧中原有人物。青枳不在剧情里，放在汐斯塔人群中勉强说得过去。 |
