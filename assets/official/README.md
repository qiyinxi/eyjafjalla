# assets/official —— 官方素材的本站副本

《明日方舟》官方素材 © Hypergryph（上海鹰角网络科技有限公司）。全部取自 PRTS 资源站（torappu.prts.wiki / media.prts.wiki），**字节未改动**；
放在这里只是为了让小剧场、桌宠与 MV 不再受资源站速度与断连的影响。非商业的同人展示用途；权利方要求时即删除。

## 怎么用

- `spine/` 与 `https://torappu.prts.wiki/assets/` 的目录结构一一对应：`spine/char_spine/<干员>/<时装目录>/<视角>/…`、`spine/enemy_spine/<id>/<id>.*`，干员目录下的 `meta.json` 原样保留（里面的 `prefix` 仍是 PRTS 地址，加载器会把它换算成本地路径）。
- `avg/` 是 MV 的剧情立绘卡片（`MVE.sd.card`）：`<名字>.w512.webp` = PRTS 的 `?image_process=resize,w_512/format,webp/quality,Q_88`，`<名字>.webp` = `?image_process=format,webp/quality,Q_90`（原尺寸）。原文件名是 `Avg_<名字>$1.png`。
- 加载器（`js/mv/sd.js` 的 `localOf` / `cardLocal`，`js/chibi.js` 的 `localOf`）按脚本自己的位置解析本目录，先取本地，本地 404 / 出错时静默退回下表里的 PRTS 地址。所以要加新模型，只要照同样的路径放进来；不放也照样能用（走 PRTS）。
- PRTS 提供的图集 png 比 `.atlas` 里声明的尺寸小（约 2/3），加载器按声明尺寸放大后再上传显卡——这里保存的就是 PRTS 提供的原样文件。

共 163 个文件，15.85 MB。

## 来源

### `avg/` · 1,733 KB

凯勒 avg_npc_999_1（1–10 号表情）、多利 avg_npc_1014_1、雪雉夏装 avg_npc_1005_1（1–11）、小黑羊 avg_npc_1004_1。

| 本地文件 | 来源 |
|---|---|
| `avg_npc_1004_1.w512.webp` | <https://media.prts.wiki/3/3a/Avg_avg_npc_1004_1%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_1004_1.webp` | <https://media.prts.wiki/3/3a/Avg_avg_npc_1004_1%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_1005_1-1.w512.webp` | <https://media.prts.wiki/5/5f/Avg_avg_npc_1005_1-1%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_1005_1-1.webp` | <https://media.prts.wiki/5/5f/Avg_avg_npc_1005_1-1%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_1005_1-10.w512.webp` | <https://media.prts.wiki/8/83/Avg_avg_npc_1005_1-10%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_1005_1-10.webp` | <https://media.prts.wiki/8/83/Avg_avg_npc_1005_1-10%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_1005_1-11.w512.webp` | <https://media.prts.wiki/e/e8/Avg_avg_npc_1005_1-11%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_1005_1-11.webp` | <https://media.prts.wiki/e/e8/Avg_avg_npc_1005_1-11%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_1005_1-2.w512.webp` | <https://media.prts.wiki/e/e4/Avg_avg_npc_1005_1-2%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_1005_1-2.webp` | <https://media.prts.wiki/e/e4/Avg_avg_npc_1005_1-2%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_1005_1-3.w512.webp` | <https://media.prts.wiki/7/77/Avg_avg_npc_1005_1-3%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_1005_1-3.webp` | <https://media.prts.wiki/7/77/Avg_avg_npc_1005_1-3%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_1005_1-4.w512.webp` | <https://media.prts.wiki/4/4c/Avg_avg_npc_1005_1-4%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_1005_1-4.webp` | <https://media.prts.wiki/4/4c/Avg_avg_npc_1005_1-4%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_1005_1-5.w512.webp` | <https://media.prts.wiki/5/5b/Avg_avg_npc_1005_1-5%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_1005_1-5.webp` | <https://media.prts.wiki/5/5b/Avg_avg_npc_1005_1-5%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_1005_1-6.w512.webp` | <https://media.prts.wiki/a/ad/Avg_avg_npc_1005_1-6%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_1005_1-6.webp` | <https://media.prts.wiki/a/ad/Avg_avg_npc_1005_1-6%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_1005_1-7.w512.webp` | <https://media.prts.wiki/2/23/Avg_avg_npc_1005_1-7%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_1005_1-7.webp` | <https://media.prts.wiki/2/23/Avg_avg_npc_1005_1-7%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_1005_1-8.w512.webp` | <https://media.prts.wiki/c/c2/Avg_avg_npc_1005_1-8%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_1005_1-8.webp` | <https://media.prts.wiki/c/c2/Avg_avg_npc_1005_1-8%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_1005_1-9.w512.webp` | <https://media.prts.wiki/0/09/Avg_avg_npc_1005_1-9%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_1005_1-9.webp` | <https://media.prts.wiki/0/09/Avg_avg_npc_1005_1-9%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_1014_1.w512.webp` | <https://media.prts.wiki/7/7e/Avg_avg_npc_1014_1%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_1014_1.webp` | <https://media.prts.wiki/7/7e/Avg_avg_npc_1014_1%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_999_1-1.w512.webp` | <https://media.prts.wiki/8/8c/Avg_avg_npc_999_1-1%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_999_1-1.webp` | <https://media.prts.wiki/8/8c/Avg_avg_npc_999_1-1%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_999_1-10.w512.webp` | <https://media.prts.wiki/4/4b/Avg_avg_npc_999_1-10%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_999_1-10.webp` | <https://media.prts.wiki/4/4b/Avg_avg_npc_999_1-10%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_999_1-2.w512.webp` | <https://media.prts.wiki/e/e8/Avg_avg_npc_999_1-2%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_999_1-2.webp` | <https://media.prts.wiki/e/e8/Avg_avg_npc_999_1-2%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_999_1-3.w512.webp` | <https://media.prts.wiki/2/27/Avg_avg_npc_999_1-3%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_999_1-3.webp` | <https://media.prts.wiki/2/27/Avg_avg_npc_999_1-3%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_999_1-4.w512.webp` | <https://media.prts.wiki/f/fe/Avg_avg_npc_999_1-4%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_999_1-4.webp` | <https://media.prts.wiki/f/fe/Avg_avg_npc_999_1-4%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_999_1-5.w512.webp` | <https://media.prts.wiki/6/60/Avg_avg_npc_999_1-5%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_999_1-5.webp` | <https://media.prts.wiki/6/60/Avg_avg_npc_999_1-5%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_999_1-6.w512.webp` | <https://media.prts.wiki/0/0c/Avg_avg_npc_999_1-6%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_999_1-6.webp` | <https://media.prts.wiki/0/0c/Avg_avg_npc_999_1-6%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_999_1-7.w512.webp` | <https://media.prts.wiki/b/b1/Avg_avg_npc_999_1-7%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_999_1-7.webp` | <https://media.prts.wiki/b/b1/Avg_avg_npc_999_1-7%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_999_1-8.w512.webp` | <https://media.prts.wiki/1/18/Avg_avg_npc_999_1-8%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_999_1-8.webp` | <https://media.prts.wiki/1/18/Avg_avg_npc_999_1-8%241.png?image_process=format,webp/quality,Q_90> |
| `avg_npc_999_1-9.w512.webp` | <https://media.prts.wiki/4/48/Avg_avg_npc_999_1-9%241.png?image_process=resize,w_512/format,webp/quality,Q_88> |
| `avg_npc_999_1-9.webp` | <https://media.prts.wiki/4/48/Avg_avg_npc_999_1-9%241.png?image_process=format,webp/quality,Q_90> |

### `spine/char_spine/char_1016_agoat2/` · 6,032 KB

纯烬艾雅法拉：小剧场 / 桌宠（三套时装 × 基建、正面）；MV（默认与「后来的故事」的基建、背面，默认的正面）。

| 本地文件 | 来源 |
|---|---|
| `char_1016_agoat2_epoque_34/build/build_char_1016_agoat2_epoque_34.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_34/build/build_char_1016_agoat2_epoque_34.atlas> |
| `char_1016_agoat2_epoque_34/build/build_char_1016_agoat2_epoque_34.png` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_34/build/build_char_1016_agoat2_epoque_34.png> |
| `char_1016_agoat2_epoque_34/build/build_char_1016_agoat2_epoque_34.skel` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_34/build/build_char_1016_agoat2_epoque_34.skel> |
| `char_1016_agoat2_epoque_34/front/char_1016_agoat2_epoque_34.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_34/front/char_1016_agoat2_epoque_34.atlas> |
| `char_1016_agoat2_epoque_34/front/char_1016_agoat2_epoque_34.png` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_34/front/char_1016_agoat2_epoque_34.png> |
| `char_1016_agoat2_epoque_34/front/char_1016_agoat2_epoque_34.skel` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_34/front/char_1016_agoat2_epoque_34.skel> |
| `char_1016_agoat2_epoque_57/back/char_1016_agoat2_epoque_57.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_57/back/char_1016_agoat2_epoque_57.atlas> |
| `char_1016_agoat2_epoque_57/back/char_1016_agoat2_epoque_57.png` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_57/back/char_1016_agoat2_epoque_57.png> |
| `char_1016_agoat2_epoque_57/back/char_1016_agoat2_epoque_57.skel` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_57/back/char_1016_agoat2_epoque_57.skel> |
| `char_1016_agoat2_epoque_57/build/build_char_1016_agoat2_epoque_57.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_57/build/build_char_1016_agoat2_epoque_57.atlas> |
| `char_1016_agoat2_epoque_57/build/build_char_1016_agoat2_epoque_57.png` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_57/build/build_char_1016_agoat2_epoque_57.png> |
| `char_1016_agoat2_epoque_57/build/build_char_1016_agoat2_epoque_57.skel` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_57/build/build_char_1016_agoat2_epoque_57.skel> |
| `char_1016_agoat2_epoque_57/front/char_1016_agoat2_epoque_57.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_57/front/char_1016_agoat2_epoque_57.atlas> |
| `char_1016_agoat2_epoque_57/front/char_1016_agoat2_epoque_57.png` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_57/front/char_1016_agoat2_epoque_57.png> |
| `char_1016_agoat2_epoque_57/front/char_1016_agoat2_epoque_57.skel` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/char_1016_agoat2_epoque_57/front/char_1016_agoat2_epoque_57.skel> |
| `defaultskin/back/char_1016_agoat2.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/defaultskin/back/char_1016_agoat2.atlas> |
| `defaultskin/back/char_1016_agoat2.png` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/defaultskin/back/char_1016_agoat2.png> |
| `defaultskin/back/char_1016_agoat2.skel` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/defaultskin/back/char_1016_agoat2.skel> |
| `defaultskin/build/build_char_1016_agoat2.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/defaultskin/build/build_char_1016_agoat2.atlas> |
| `defaultskin/build/build_char_1016_agoat2.png` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/defaultskin/build/build_char_1016_agoat2.png> |
| `defaultskin/build/build_char_1016_agoat2.skel` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/defaultskin/build/build_char_1016_agoat2.skel> |
| `defaultskin/front/char_1016_agoat2.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/defaultskin/front/char_1016_agoat2.atlas> |
| `defaultskin/front/char_1016_agoat2.png` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/defaultskin/front/char_1016_agoat2.png> |
| `defaultskin/front/char_1016_agoat2.skel` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/defaultskin/front/char_1016_agoat2.skel> |
| `meta.json` | <https://torappu.prts.wiki/assets/char_spine/char_1016_agoat2/meta.json> |

### `spine/char_spine/char_1033_swire2/` · 439 KB

琳琅诗怀雅（MV 客串）。

| 本地文件 | 来源 |
|---|---|
| `defaultskin/build/build_char_1033_swire2.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_1033_swire2/defaultskin/build/build_char_1033_swire2.atlas> |
| `defaultskin/build/build_char_1033_swire2.png` | <https://torappu.prts.wiki/assets/char_spine/char_1033_swire2/defaultskin/build/build_char_1033_swire2.png> |
| `defaultskin/build/build_char_1033_swire2.skel` | <https://torappu.prts.wiki/assets/char_spine/char_1033_swire2/defaultskin/build/build_char_1033_swire2.skel> |
| `meta.json` | <https://torappu.prts.wiki/assets/char_spine/char_1033_swire2/meta.json> |

### `spine/char_spine/char_180_amgoat/` · 3,034 KB

艾雅法拉：小剧场 / 桌宠（三套时装 × 基建、正面）；MV「在夏天之前」（童年的阿黛尔，基建）。

| 本地文件 | 来源 |
|---|---|
| `char_180_amgoat_sanrio_2/build/build_char_180_amgoat_sanrio_2.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/char_180_amgoat_sanrio_2/build/build_char_180_amgoat_sanrio_2.atlas> |
| `char_180_amgoat_sanrio_2/build/build_char_180_amgoat_sanrio_2.png` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/char_180_amgoat_sanrio_2/build/build_char_180_amgoat_sanrio_2.png> |
| `char_180_amgoat_sanrio_2/build/build_char_180_amgoat_sanrio_2.skel` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/char_180_amgoat_sanrio_2/build/build_char_180_amgoat_sanrio_2.skel> |
| `char_180_amgoat_sanrio_2/front/char_180_amgoat_sanrio_2.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/char_180_amgoat_sanrio_2/front/char_180_amgoat_sanrio_2.atlas> |
| `char_180_amgoat_sanrio_2/front/char_180_amgoat_sanrio_2.png` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/char_180_amgoat_sanrio_2/front/char_180_amgoat_sanrio_2.png> |
| `char_180_amgoat_sanrio_2/front/char_180_amgoat_sanrio_2.skel` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/char_180_amgoat_sanrio_2/front/char_180_amgoat_sanrio_2.skel> |
| `char_180_amgoat_summer_5/build/build_char_180_amgoat_summer_5.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/char_180_amgoat_summer_5/build/build_char_180_amgoat_summer_5.atlas> |
| `char_180_amgoat_summer_5/build/build_char_180_amgoat_summer_5.png` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/char_180_amgoat_summer_5/build/build_char_180_amgoat_summer_5.png> |
| `char_180_amgoat_summer_5/build/build_char_180_amgoat_summer_5.skel` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/char_180_amgoat_summer_5/build/build_char_180_amgoat_summer_5.skel> |
| `char_180_amgoat_summer_5/front/char_180_amgoat_summer_5.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/char_180_amgoat_summer_5/front/char_180_amgoat_summer_5.atlas> |
| `char_180_amgoat_summer_5/front/char_180_amgoat_summer_5.png` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/char_180_amgoat_summer_5/front/char_180_amgoat_summer_5.png> |
| `char_180_amgoat_summer_5/front/char_180_amgoat_summer_5.skel` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/char_180_amgoat_summer_5/front/char_180_amgoat_summer_5.skel> |
| `defaultskin/build/build_char_180_amgoat.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/defaultskin/build/build_char_180_amgoat.atlas> |
| `defaultskin/build/build_char_180_amgoat.png` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/defaultskin/build/build_char_180_amgoat.png> |
| `defaultskin/build/build_char_180_amgoat.skel` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/defaultskin/build/build_char_180_amgoat.skel> |
| `defaultskin/front/char_180_amgoat.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/defaultskin/front/char_180_amgoat.atlas> |
| `defaultskin/front/char_180_amgoat.png` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/defaultskin/front/char_180_amgoat.png> |
| `defaultskin/front/char_180_amgoat.skel` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/defaultskin/front/char_180_amgoat.skel> |
| `meta.json` | <https://torappu.prts.wiki/assets/char_spine/char_180_amgoat/meta.json> |

### `spine/char_spine/char_271_spikes/` · 246 KB

芳汀（MV「在夏天之前」）。

| 本地文件 | 来源 |
|---|---|
| `defaultskin/build/build_char_271_spikes.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_271_spikes/defaultskin/build/build_char_271_spikes.atlas> |
| `defaultskin/build/build_char_271_spikes.png` | <https://torappu.prts.wiki/assets/char_spine/char_271_spikes/defaultskin/build/build_char_271_spikes.png> |
| `defaultskin/build/build_char_271_spikes.skel` | <https://torappu.prts.wiki/assets/char_spine/char_271_spikes/defaultskin/build/build_char_271_spikes.skel> |
| `meta.json` | <https://torappu.prts.wiki/assets/char_spine/char_271_spikes/meta.json> |

### `spine/char_spine/char_340_shwaz/` · 389 KB

黑（sd.js 的客串名单；目前的影片没有用到）。

| 本地文件 | 来源 |
|---|---|
| `defaultskin/build/build_char_340_shwaz.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_340_shwaz/defaultskin/build/build_char_340_shwaz.atlas> |
| `defaultskin/build/build_char_340_shwaz.png` | <https://torappu.prts.wiki/assets/char_spine/char_340_shwaz/defaultskin/build/build_char_340_shwaz.png> |
| `defaultskin/build/build_char_340_shwaz.skel` | <https://torappu.prts.wiki/assets/char_spine/char_340_shwaz/defaultskin/build/build_char_340_shwaz.skel> |
| `meta.json` | <https://torappu.prts.wiki/assets/char_spine/char_340_shwaz/meta.json> |

### `spine/char_spine/char_348_ceylon/` · 632 KB

锡兰 · 夏装 char_348_ceylon_summer_13（MV 客串）。

| 本地文件 | 来源 |
|---|---|
| `char_348_ceylon_summer_13/build/build_char_348_ceylon_summer_13.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_348_ceylon/char_348_ceylon_summer_13/build/build_char_348_ceylon_summer_13.atlas> |
| `char_348_ceylon_summer_13/build/build_char_348_ceylon_summer_13.png` | <https://torappu.prts.wiki/assets/char_spine/char_348_ceylon/char_348_ceylon_summer_13/build/build_char_348_ceylon_summer_13.png> |
| `char_348_ceylon_summer_13/build/build_char_348_ceylon_summer_13.skel` | <https://torappu.prts.wiki/assets/char_spine/char_348_ceylon/char_348_ceylon_summer_13/build/build_char_348_ceylon_summer_13.skel> |
| `meta.json` | <https://torappu.prts.wiki/assets/char_spine/char_348_ceylon/meta.json> |

### `spine/char_spine/char_383_snsant/` · 183 KB

雪雉（MV「晴日之约」「汽水」）。

| 本地文件 | 来源 |
|---|---|
| `defaultskin/build/build_char_383_snsant.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_383_snsant/defaultskin/build/build_char_383_snsant.atlas> |
| `defaultskin/build/build_char_383_snsant.png` | <https://torappu.prts.wiki/assets/char_spine/char_383_snsant/defaultskin/build/build_char_383_snsant.png> |
| `defaultskin/build/build_char_383_snsant.skel` | <https://torappu.prts.wiki/assets/char_spine/char_383_snsant/defaultskin/build/build_char_383_snsant.skel> |
| `meta.json` | <https://torappu.prts.wiki/assets/char_spine/char_383_snsant/meta.json> |

### `spine/char_spine/char_4106_bryota/` · 358 KB

苍苔（MV 客串）。

| 本地文件 | 来源 |
|---|---|
| `defaultskin/build/build_char_4106_bryota.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_4106_bryota/defaultskin/build/build_char_4106_bryota.atlas> |
| `defaultskin/build/build_char_4106_bryota.png` | <https://torappu.prts.wiki/assets/char_spine/char_4106_bryota/defaultskin/build/build_char_4106_bryota.png> |
| `defaultskin/build/build_char_4106_bryota.skel` | <https://torappu.prts.wiki/assets/char_spine/char_4106_bryota/defaultskin/build/build_char_4106_bryota.skel> |
| `meta.json` | <https://torappu.prts.wiki/assets/char_spine/char_4106_bryota/meta.json> |

### `spine/char_spine/char_488_buildr/` · 467 KB

青枳（sd.js 的简写 buildr；目前的影片没有用到）。

| 本地文件 | 来源 |
|---|---|
| `defaultskin/build/build_char_488_buildr.atlas` | <https://torappu.prts.wiki/assets/char_spine/char_488_buildr/defaultskin/build/build_char_488_buildr.atlas> |
| `defaultskin/build/build_char_488_buildr.png` | <https://torappu.prts.wiki/assets/char_spine/char_488_buildr/defaultskin/build/build_char_488_buildr.png> |
| `defaultskin/build/build_char_488_buildr.skel` | <https://torappu.prts.wiki/assets/char_spine/char_488_buildr/defaultskin/build/build_char_488_buildr.skel> |
| `meta.json` | <https://torappu.prts.wiki/assets/char_spine/char_488_buildr/meta.json> |

### `spine/enemy_spine/enemy_1344_ddlamb/` · 61 KB

「火山旅梦」的粉色小羊。

| 本地文件 | 来源 |
|---|---|
| `enemy_1344_ddlamb.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1344_ddlamb/enemy_1344_ddlamb.atlas> |
| `enemy_1344_ddlamb.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1344_ddlamb/enemy_1344_ddlamb.png> |
| `enemy_1344_ddlamb.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1344_ddlamb/enemy_1344_ddlamb.skel> |

### `spine/enemy_spine/enemy_1344_ddlamb_2/` · 60 KB

「火山旅梦」的粉色小羊（换色）。

| 本地文件 | 来源 |
|---|---|
| `enemy_1344_ddlamb_2.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1344_ddlamb_2/enemy_1344_ddlamb_2.atlas> |
| `enemy_1344_ddlamb_2.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1344_ddlamb_2/enemy_1344_ddlamb_2.png> |
| `enemy_1344_ddlamb_2.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1344_ddlamb_2/enemy_1344_ddlamb_2.skel> |

### `spine/enemy_spine/enemy_1345_tplamb/` · 92 KB

「火山旅梦」的粉色小羊。

| 本地文件 | 来源 |
|---|---|
| `enemy_1345_tplamb.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1345_tplamb/enemy_1345_tplamb.atlas> |
| `enemy_1345_tplamb.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1345_tplamb/enemy_1345_tplamb.png> |
| `enemy_1345_tplamb.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1345_tplamb/enemy_1345_tplamb.skel> |

### `spine/enemy_spine/enemy_1345_tplamb_2/` · 92 KB

「火山旅梦」的粉色小羊（换色）。

| 本地文件 | 来源 |
|---|---|
| `enemy_1345_tplamb_2.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1345_tplamb_2/enemy_1345_tplamb_2.atlas> |
| `enemy_1345_tplamb_2.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1345_tplamb_2/enemy_1345_tplamb_2.png> |
| `enemy_1345_tplamb_2.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1345_tplamb_2/enemy_1345_tplamb_2.skel> |

### `spine/enemy_spine/enemy_1346_ynshp/` · 199 KB

「火山旅梦」的粉色小羊。

| 本地文件 | 来源 |
|---|---|
| `enemy_1346_ynshp.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1346_ynshp/enemy_1346_ynshp.atlas> |
| `enemy_1346_ynshp.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1346_ynshp/enemy_1346_ynshp.png> |
| `enemy_1346_ynshp.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1346_ynshp/enemy_1346_ynshp.skel> |

### `spine/enemy_spine/enemy_1346_ynshp_2/` · 199 KB

「火山旅梦」的粉色小羊（换色）。

| 本地文件 | 来源 |
|---|---|
| `enemy_1346_ynshp_2.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1346_ynshp_2/enemy_1346_ynshp_2.atlas> |
| `enemy_1346_ynshp_2.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1346_ynshp_2/enemy_1346_ynshp_2.png> |
| `enemy_1346_ynshp_2.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1346_ynshp_2/enemy_1346_ynshp_2.skel> |

### `spine/enemy_spine/enemy_1347_fyshp/` · 362 KB

「火山旅梦」的粉色小羊。

| 本地文件 | 来源 |
|---|---|
| `enemy_1347_fyshp.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1347_fyshp/enemy_1347_fyshp.atlas> |
| `enemy_1347_fyshp.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1347_fyshp/enemy_1347_fyshp.png> |
| `enemy_1347_fyshp.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1347_fyshp/enemy_1347_fyshp.skel> |

### `spine/enemy_spine/enemy_1347_fyshp_2/` · 361 KB

「火山旅梦」的粉色小羊（换色）。

| 本地文件 | 来源 |
|---|---|
| `enemy_1347_fyshp_2.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1347_fyshp_2/enemy_1347_fyshp_2.atlas> |
| `enemy_1347_fyshp_2.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1347_fyshp_2/enemy_1347_fyshp_2.png> |
| `enemy_1347_fyshp_2.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1347_fyshp_2/enemy_1347_fyshp_2.skel> |

### `spine/enemy_spine/enemy_1348_rllamb/` · 95 KB

「火山旅梦」的粉色小羊。

| 本地文件 | 来源 |
|---|---|
| `enemy_1348_rllamb.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1348_rllamb/enemy_1348_rllamb.atlas> |
| `enemy_1348_rllamb.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1348_rllamb/enemy_1348_rllamb.png> |
| `enemy_1348_rllamb.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1348_rllamb/enemy_1348_rllamb.skel> |

### `spine/enemy_spine/enemy_1348_rllamb_2/` · 78 KB

「火山旅梦」的粉色小羊（换色）。

| 本地文件 | 来源 |
|---|---|
| `enemy_1348_rllamb_2.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1348_rllamb_2/enemy_1348_rllamb_2.atlas> |
| `enemy_1348_rllamb_2.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1348_rllamb_2/enemy_1348_rllamb_2.png> |
| `enemy_1348_rllamb_2.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1348_rllamb_2/enemy_1348_rllamb_2.skel> |

### `spine/enemy_spine/enemy_1349_rckshp/` · 115 KB

「火山旅梦」的粉色小羊。

| 本地文件 | 来源 |
|---|---|
| `enemy_1349_rckshp.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1349_rckshp/enemy_1349_rckshp.atlas> |
| `enemy_1349_rckshp.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1349_rckshp/enemy_1349_rckshp.png> |
| `enemy_1349_rckshp.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1349_rckshp/enemy_1349_rckshp.skel> |

### `spine/enemy_spine/enemy_1349_rckshp_2/` · 115 KB

「火山旅梦」的粉色小羊（换色）。

| 本地文件 | 来源 |
|---|---|
| `enemy_1349_rckshp_2.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1349_rckshp_2/enemy_1349_rckshp_2.atlas> |
| `enemy_1349_rckshp_2.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1349_rckshp_2/enemy_1349_rckshp_2.png> |
| `enemy_1349_rckshp_2.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1349_rckshp_2/enemy_1349_rckshp_2.skel> |

### `spine/enemy_spine/enemy_1350_mgcshp/` · 110 KB

「火山旅梦」的粉色小羊。

| 本地文件 | 来源 |
|---|---|
| `enemy_1350_mgcshp.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1350_mgcshp/enemy_1350_mgcshp.atlas> |
| `enemy_1350_mgcshp.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1350_mgcshp/enemy_1350_mgcshp.png> |
| `enemy_1350_mgcshp.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1350_mgcshp/enemy_1350_mgcshp.skel> |

### `spine/enemy_spine/enemy_1350_mgcshp_2/` · 110 KB

「火山旅梦」的粉色小羊（换色）。

| 本地文件 | 来源 |
|---|---|
| `enemy_1350_mgcshp_2.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1350_mgcshp_2/enemy_1350_mgcshp_2.atlas> |
| `enemy_1350_mgcshp_2.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1350_mgcshp_2/enemy_1350_mgcshp_2.png> |
| `enemy_1350_mgcshp_2.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1350_mgcshp_2/enemy_1350_mgcshp_2.skel> |

### `spine/enemy_spine/enemy_1545_shpkg/` · 672 KB

多利（MV「雾中回忆」）。

| 本地文件 | 来源 |
|---|---|
| `enemy_1545_shpkg.atlas` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1545_shpkg/enemy_1545_shpkg.atlas> |
| `enemy_1545_shpkg.png` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1545_shpkg/enemy_1545_shpkg.png> |
| `enemy_1545_shpkg.skel` | <https://torappu.prts.wiki/assets/enemy_spine/enemy_1545_shpkg/enemy_1545_shpkg.skel> |
