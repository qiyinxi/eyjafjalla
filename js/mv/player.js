/* =========================================================
 * 05 影像 · MUSIC VIDEO —— 原创 MV 三部曲「三个夏天」与两支「汐斯塔番外」的放映厅
 *
 * 页面里的区块、播放器、迷你播放条（影片本身见 js/mv/films/*.js，引擎见 js/mv/engine.js）
 *
 * 性能约定
 *  - 区块平时只有文字与占位海报；离区块约 1.5 屏以内才按需加载 js/mv/engine.js、js/mv/cast.js 与各支影片脚本，
 *    然后在空闲时逐张画出海报帧、预告缩略图与人物小像（画完即丢掉临时渲染器）
 *  - 逐帧循环只在「正在播放 + 舞台看得见 + 页面在前台」时存在；暂停时只在拖动 / 换片 / 改分辨率时画一帧；
 *    没在播放、离区块很远时丢掉渲染器（连同它按分辨率缓存的整张位图）
 *  - 进度条与迷你播放条的进度交给合成器（Web Animations 按剩余时长走），逐帧循环里不写它们
 *  - 画布 16:9：默认 1280×720；全屏且设备跟得上时 1920×1080；帧耗时高时自动降到 960×540 / 640×360，最后降到 30 帧
 *
 * 声音
 *  - 服务器支持 Range（本站 serve.py）时边下边播、随意拖动；网络卡住时画面跟着声音停，不会跑到前面去；
 *    不支持 Range 的静态服务器上改为整段下载成 Blob 再播放（带下载进度）；录制视频始终用整段下载的 Blob
 *  - 画面时间 = audio.currentTime，两次更新之间用 performance.now() 补间，并缓慢锁相（不会来回跳）
 *  - 开始播放时停掉语音、环境声景让位（AUDIO.hold），暂停 / 播完后恢复；有人点开语音时 MV 自动暂停
 *  - 资源加载失败一律不提示：按钮回到可以再点一次的状态
 * ========================================================= */
window.MVP = (() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ric = window.requestIdleCallback ? (fn, t = 1500) => requestIdleCallback(fn, { timeout: t }) : (fn) => setTimeout(fn, 60);
  const idleP = (t) => new Promise((r) => ric(r, t));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const DEBUG = /[?&]debug\b/.test(location.search);
  // 开发期：影片脚本还没写好时借示例影片顶上（只在 ?debug 下）
  const FALLBACK = DEBUG ? '_example' : null;
  // ?debug 时把悄悄吞掉的失败记下来（window.__mvlog），平时什么也不做
  const dlog = DEBUG ? (...a) => { (window.__mvlog = window.__mvlog || []).push(a.map((x) => (x && x.stack) || String(x)).join(' ')); } : () => {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem('eyja.mv.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('eyja.mv.' + k, JSON.stringify(v)); } catch (e) { /* 隐私模式 */ } },
  };
  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

  /* ---------------------------------------------------- 图标（与全站同一套线性风格；播放类用实心） */
  const svg = (d) => `<svg class="mvi" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    play: svg('<path d="M8.2 5.7 C 8.2 4.9, 9 4.5, 9.7 4.9 L 18.5 11.1 C 19.1 11.5, 19.1 12.5, 18.5 12.9 L 9.7 19.1 C 9 19.5, 8.2 19.1, 8.2 18.3 Z" fill="currentColor" stroke="none"/>'),
    pause: svg('<rect x="6.6" y="5" width="3.8" height="14" rx="1.1" fill="currentColor" stroke="none"/><rect x="13.6" y="5" width="3.8" height="14" rx="1.1" fill="currentColor" stroke="none"/>'),
    prev: svg('<path d="M6.5 5.5 V 18.5"/><path d="M18 6.3 C 18 5.6, 17.4 5.3, 16.9 5.7 L 9.7 11.2 C 9.2 11.6, 9.2 12.4, 9.7 12.8 L 16.9 18.3 C 17.4 18.7, 18 18.4, 18 17.7 Z" fill="currentColor" stroke="none"/>'),
    next: svg('<path d="M17.5 5.5 V 18.5"/><path d="M6 6.3 C 6 5.6, 6.6 5.3, 7.1 5.7 L 14.3 11.2 C 14.8 11.6, 14.8 12.4, 14.3 12.8 L 7.1 18.3 C 6.6 18.7, 6 18.4, 6 17.7 Z" fill="currentColor" stroke="none"/>'),
    vol: svg('<path d="M4 9.5 H 7.5 L 12 5.6 V 18.4 L 7.5 14.5 H 4 Z" fill="currentColor"/><path d="M15.5 9 C 16.8 10.4, 16.8 13.6, 15.5 15 M18.2 6.5 C 21 9.3, 21 14.7, 18.2 17.5"/>'),
    volLow: svg('<path d="M4 9.5 H 7.5 L 12 5.6 V 18.4 L 7.5 14.5 H 4 Z" fill="currentColor"/><path d="M15.5 9 C 16.8 10.4, 16.8 13.6, 15.5 15"/>'),
    mute: svg('<path d="M4 9.5 H 7.5 L 12 5.6 V 18.4 L 7.5 14.5 H 4 Z" fill="currentColor"/><path d="M16 9.5 L 21 14.5 M21 9.5 L 16 14.5"/>'),
    cc: svg('<rect x="3" y="5.5" width="18" height="13" rx="2.6"/><path d="M10.6 10.3 A 2.3 2.3 0 1 0 10.6 13.7 M17 10.3 A 2.3 2.3 0 1 0 17 13.7"/>'),
    fs: svg('<path d="M4.5 9 V 4.5 H 9 M15 4.5 H 19.5 V 9 M19.5 15 V 19.5 H 15 M9 19.5 H 4.5 V 15"/>'),
    fsx: svg('<path d="M9 4.5 V 9 H 4.5 M19.5 9 H 15 V 4.5 M15 19.5 V 15 H 19.5 M4.5 15 H 9 V 19.5"/>'),
    replay: svg('<path d="M4.8 12 A 7.2 7.2 0 1 0 6.9 6.9"/><path d="M4.6 4.4 V 8.9 H 9.1"/>'),
    rec: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none"/>'),
    dl: svg('<path d="M12 4 V 15 M7.5 10.5 L 12 15 L 16.5 10.5"/><path d="M5 19.5 H 19"/>'),
    x: svg('<path d="M6.5 6.5 L 17.5 17.5 M17.5 6.5 L 6.5 17.5"/>'),
    up: svg('<path d="M12 19 V 6 M6.5 11.5 L 12 6 L 17.5 11.5"/>'),
    film: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="1.6"/><path d="M7.5 4.5 V 19.5 M16.5 4.5 V 19.5 M3.5 9 H 7.5 M3.5 15 H 7.5 M16.5 9 H 20.5 M16.5 15 H 20.5"/>'),
    list: svg('<path d="M10 6.5 H 20 M10 12 H 20 M10 17.5 H 16"/><path d="M4 4.8 L 7 6.5 L 4 8.2 Z M4 10.3 L 7 12 L 4 13.7 Z" fill="currentColor"/>'),
    leaf: svg('<path d="M5 19 C 5 10.5, 10.5 5, 19.5 4.5 C 19 13, 13.5 19, 5 19 Z"/><path d="M5 19 L 13.5 10.5"/>'),
  };

  /* ---------------------------------------------------- 各支影片的默认资料（影片脚本里的 film.meta 会覆盖这些）
   * I–III 是三部曲；IV、V 是番外（extra: true）：汐斯塔的同一天，两个视角 */
  const FILMS = [
    {
      id: 'before-summer', n: 1, cn: '夏天之前', en: 'Before Summer', artists: '塞壬唱片-MSR / Adam Gubman / Matilda Stray',
      form: 'base', era: '童年 · 莱塔尼亚', dur: 240.7, accent: '#ffb35c', poster: 0.3,
      logline: '莱塔尼亚，六月的某一天。明天，爸爸妈妈就要出发去乌纳火山。',
      synopsis: [
        '威廉大学所在的学院城，一个平凡得不能再平凡的六月。十来岁的阿黛尔已经在大学里旁听课程，书包里塞满了笔记，身后跟着一只一高兴就发烫的小黑羊。',
        '晨间广播、下课铃、午后化在指尖的冰棍、和同学们挤在一起的课间——这一天，她第一次用磁带录下了家里的声音。',
        '爸爸答应她：从乌纳火山带一块石头回来。妈妈的外套挂在门口，一封信被悄悄夹进了文件里。',
        '第二天黎明，她站在门口送他们出发。夏天才刚刚开始。',
      ],
      cast: [
        { who: 'adele-child', o: { outfit: 'school', prop: 'satchel' }, role: '主角 · 十来岁的小学者' },
        { who: 'katia', o: { outfit: 'suit' }, role: '父亲' },
        { who: 'magna', o: { outfit: 'home' }, role: '母亲' },
        { who: 'fontaine', role: '同学' },
        { who: 'liese', o: { prop: 'cello' }, role: '同学（本页原创）' },
        { who: 'sheep-black', role: '一高兴就发烫' },
      ],
    },
    {
      id: 'misty-memory-night', n: 2, cn: '雾中之忆', en: 'Misty Memory (Night Version)', artists: '塞壬唱片-MSR / Elvin Shen / ZT / Erik Castro / David Lin / 左乙',
      form: 'alter', era: '梦 · 汐斯塔', dur: 242.1, accent: '#ff8cc6', poster: 0.42,
      logline: '多年后的汐斯塔之夜。货箱一歪，滚出一群粉色小羊——她跟着它们，走进一场粉色的夜雾之梦。',
      synopsis: [
        '汐斯塔的夏天。纯烬时期的她在火山博物馆整理标本到深夜，不知不觉趴在桌上睡着了。',
        '角落的货箱一歪，一群粉色小羊滚了出来；汽水瓶被打翻，气泡冒成了雾。灯笼街、羊群旋转木马、汽水海、会数羊的集市——这场梦慵懒、贪吃，又有点调皮。',
        '雾最浓的时候，两只小黑羊出现了：一只打着小红领带，一只围着白色的小围巾。它们陪她走了一段路，还把一块石头推到她的手心。',
        '梦里的旧汐斯塔火山亮了起来。她穿上母亲的外套冲上山；在火山口的光里，两只羊有一瞬变回了两个人的剪影，向她挥手，然后被雾温柔地收走。',
        '天亮了。她在博物馆的桌上醒来，汽水还在冒泡，标签上多了一个粉色的小蹄印。',
      ],
      cast: [
        { who: 'adele-alter', o: { outfit: 'coat' }, role: '主角 · 在博物馆睡着了' },
        { who: 'sheep-pink', o: { glow: 0.8 }, role: '领她走进梦里' },
        { who: 'dolly', role: '雾里的大粉羊' },
        { who: 'sheep-black', o: { tie: true }, role: '打着小红领带的小黑羊' },
        { who: 'sheep-black', o: { scarf: true }, role: '围着白围巾的小黑羊' },
      ],
    },
    {
      id: 'miss-you', n: 3, cn: '想你', en: 'Miss You', artists: '塞壬唱片-MSR / Erik Castro / David Lin / 左乙',
      form: 'alter', era: '登顶 · 乌纳火山', dur: 233.7, accent: '#6cb4ff', poster: 0.55,
      logline: '熔化的石头汇成同一股炽热。晴空与白灰之下，她一步一步，走上乌纳火山的山顶。',
      synopsis: [
        '开篇在地底：一滴滴岩浆从各处汇聚，冲上地面——切到晴天下的城市，白色的灰像雪一样落下，她拄着开花的法杖走在街上。',
        '在罗德岛，她录下身边人的声音，学着读唇语，给卡恩前辈和凯勒老师写信；信化作纸鸟飞走。',
        '然后她出发去乌纳火山。重建后的乌纳村，夜里粉色小羊为她引路、种下预警花；白天，她一步一步登上灰色的山坡，身后仿佛有父母当年的身影同行。',
        '山顶在云海之上。她埋下一块小石头，怀里的两个花环在无风的山顶自己飞了起来。',
        '最后是一场“喷发”——不是灾难，是光：熔岩色的极光、白灰与花瓣，灰落下的地方开出了花。',
      ],
      cast: [
        { who: 'adele-alter', o: { outfit: 'coat', prop: 'staff' }, role: '主角 · 穿着母亲的外套' },
        { who: 'keller', role: '收信的凯勒老师' },
        { who: 'doctor', role: '她口中的“前辈”' },
        { who: 'sheep-pink', o: { glow: 0.8 }, role: '夜里为她引路' },
        { who: 'magna', o: { outfit: 'field' }, role: '母亲（回忆）' },
        { who: 'katia', o: { outfit: 'field' }, role: '父亲（回忆）' },
      ],
    },
    {
      id: 'misty-memory-day', n: 4, extra: true, cn: '晴日之约', en: 'Misty Memory (Day Version)', artists: '塞壬唱片-MSR / Erik Castro / Elvin Shen / David Lin / 左乙',
      form: 'alter', era: '番外 · 汐斯塔的白天', dur: 283.5, accent: '#3fcfbf', poster: 92.2,
      logline: '汐斯塔的夏日白天。只有她看得见的粉色小羊聚成一朵大羊云，向她提出了一笔交易：北风、种子和羊毛。',
      synopsis: [
        '凯勒老师来信：汐斯塔的夏天到了，火山博物馆就要开馆，来帮帮忙吧——老火山也在等你。船靠岸的那天，海是青绿色的，白房子晒得发亮。',
        '开馆日的博物馆里，粉色的小羊一只接一只冒了出来——只有她看得见。游客们只看见她对着空长椅训话，手里的冰淇淋却一口一口地没了。',
        '小羊们在灯塔崖上聚成一朵巨大的粉云：多利提出交易——带来北风、种子和羊毛，就把她在找的东西给她。北风装进了空瓶子，预警花的种子种进了门前的花坛；可羊毛，跑遍了小镇也找不到。',
        '黄昏的栈桥上，海风凉了，她裹紧母亲的外套，忽然明白：要找的“羊毛”，一直都穿在身上。那天夜里，满城灯火与羊形的烟花之后，博物馆的门被轻轻敲响——门外只有一只写着 SIESTA、冒着泡的木箱。',
      ],
      cast: [
        { who: 'adele-alter', o: { outfit: 'coat' }, role: '主角 · 来汐斯塔帮忙' },
        { who: 'keller', role: '邀她来汐斯塔的凯勒老师' },
        { who: 'dolly', role: '提出交易的大粉羊' },
        { who: 'sheep-pink', o: { glow: 0.8 }, role: '只有她看得见' },
      ],
    },
    {
      id: 'effervescence', n: 5, extra: true, cn: '汽水', en: 'Effervescence', artists: '塞壬唱片-MSR / Kirara Magic',
      form: 'alter', era: '番外 · 汐斯塔的下午', dur: 179.7, accent: '#ff7fb6', poster: 128.9,
      logline: '汐斯塔最热的那个下午，一群谁也看不见的粉色小羊，盯上了海边的汽水摊。',
      synopsis: [
        '汐斯塔最热的那个下午。海边汽水摊的老板在遮阳篷下打盹，冰柜里的汽水瓶在太阳下冒汗——热浪里，浮出一个粉色的小鼻子。',
        '一群谁也看不见的粉色小羊踮着脚溜过老板，叠成一座“羊塔”打开工坊的门，拉下了灌装机的拉杆。流水线一拍一个瓶盖，小羊们偷喝、打嗝、把瓶子排成队运走；老板只看见汽水自己飘走。',
        '压力表爬进红区，“砰”——粉色的汽水喷泉冲破屋顶。它们踩着泡沫冲浪，骑着摇过的汽水瓶飞上天，掠过港口和集市，在白色的屋顶上开了一场汽水派对。',
        '天黑了。它们顶着装满剩下汽水的 7 号货箱穿过灯笼街，敲响火山博物馆的门，一溜烟钻进箱子。门开了，她只看见一只嗡嗡冒泡的货箱——那天深夜，它在博物馆里翻倒了。',
      ],
      cast: [
        { who: 'sheep-pink', o: { bow: '#ff4f8f' }, role: '带头的小羊（系蝴蝶结）' },
        { who: 'sheep-pink', o: { bell: true }, role: '一走就响的铃铛' },
        { who: 'sheep-pink', o: { glasses: true }, role: '会看压力表的“工程师”' },
        { who: 'eff-vendor', role: '汽水摊老板（本片原创）' },
        { who: 'adele-alter', o: { outfit: 'coat' }, role: '收到一箱会冒泡的货' },
      ],
    },
  ];
  const byId = Object.fromEntries(FILMS.map((f) => [f.id, f]));
  // 每个形态的排序与推荐：术师从第一部看起（I、II 在前）；纯烬把第三部放在最前面；三部始终都在。
  // 番外（IV、V）单独一组，永远排在三部曲后面
  const ORDER = { base: ['before-summer', 'misty-memory-night', 'miss-you'], alter: ['miss-you', 'before-summer', 'misty-memory-night'] };
  const EXTRAS = FILMS.filter((f) => f.extra).map((f) => f.id);
  const FEATURED = { base: 'before-summer', alter: 'miss-you' };
  // 编号顺序：连播、上一部 / 下一部、“从第一部连播”都按它走（I → II → III → 番外 IV → V）
  const CHRONO = FILMS.map((f) => f.id);
  const LAST_MAIN = FILMS.filter((f) => !f.extra).pop().id;
  const NAMES = { 'adele-child': '阿黛尔（童年）', 'adele-caster': '艾雅法拉', 'adele-alter': '纯烬艾雅法拉', magna: '玛格娜', katia: '卡提亚', fontaine: '芳汀', liese: '莉瑟', keller: '阿黛尔·凯勒', dolly: '多利', 'sheep-black': '小黑羊', 'sheep-pink': '粉色小羊', doctor: '博士', crowd: '路人', 'eff-vendor': '老板' };
  const COPY = {
    head: {
      base: '为五首歌创作的五支原创 MV，同一个世界、同一个主题：三部曲「她的三个夏天」，外加两支发生在汐斯塔的番外。术师篇先放映第一部「夏天之前」。可以拖动、跳章节、全屏观看，也能导出成视频。',
      alter: '为五首歌创作的五支原创 MV，同一个世界、同一个主题：三部曲「她的三个夏天」，外加两支发生在汐斯塔的番外。医疗篇先放映第三部「想你」。可以拖动、跳章节、全屏观看，也能导出成视频。',
    },
    lede: '一块会浮在水面上的火山浮石、一盘录着家里声音的磁带、一件挂在门口的外套——它们从第一个夏天出发，被一路带到了最后一个夏天。',
    sub: {
      base: '术师篇从第一部看起：莱塔尼亚的六月，出发前平凡的一天；多年以后的一场粉色夜雾之梦；最后，是她自己走上的那座山顶。',
      alter: '医疗篇先看第三部：她穿着母亲的外套，一步一步走上那座山顶。再回到开头——莱塔尼亚的六月，和汐斯塔夜里的一场梦。',
    },
    extra: '两支番外是汐斯塔的同一天：白天，她替一只大粉羊跑遍了小镇；下午，看不见的小羊们把海边的汽水铺闹翻了天。两部都停在夜里博物馆门口的那只货箱上——箱子里滚出来的，就是第二部的那场梦。',
    extraSub: '同一天，两个视角：她的白天，小羊们的下午',
    // 番外那一天的时间线：[时间, 发生了什么, 在哪几部里]
    day: [
      ['上午', '船靠岸；粉色小羊一只接一只冒了出来', ['misty-memory-day']],
      ['下午', '海边的汽水铺被闹翻了天', ['effervescence']],
      ['傍晚', '码头上，她裹紧了母亲的外套', ['misty-memory-day']],
      ['夜里', '博物馆的门被轻轻敲响', ['misty-memory-day', 'effervescence']],
      ['深夜', '货箱一歪——那场梦开始了', ['misty-memory-night']],
    ],
    dayNote: '番外可以单独看；按时间线接着看第二部，会发现那只箱子是怎么来的。',
    tech: '五支 MV 都是本页用代码即时画出来的动画（Canvas 2D），镜头随音乐的拍点与段落切换；几个情绪最浓的特写，用的是本站分层绑定好的官方立绘——她会眨眼、呼吸，头发随风飘。',
    note: 'MV 为本页原创同人影像，与官方无关；部分特写使用官方立绘（© Hypergryph）；音乐版权归 塞壬唱片-MSR / 鹰角网络',
  };

  /* ---------------------------------------------------- 模块状态 */
  let root = null, form = 'base', ctx = {}, el = {}, stage = null, canvas = null, mini = null;
  let cur = null, touched = false, state = 'poster';
  let R = null, Rid = null, rTok = 0;          // 舞台渲染器
  let PR = null, PRid = null;                  // 进度条悬停预览的渲染器（只在桌面端）
  const data = {};                             // id → { def, an }
  const filmP = {}, prepP = {}, bad = {}, prepared = new Set();
  const art = {};                              // id → { poster, thumbs: [{ t, url }] }
  const figs = new Map();                      // 人物小像 key → Promise<url>
  const posMem = {};                           // id → 上次看到的位置（秒）；本机记住，下次来可以“继续观看”
  try { const saved = store.get('pos', {}); for (const id of Object.keys(saved)) if (byId[id] && Number.isFinite(+saved[id]) && +saved[id] > 0) posMem[id] = +saved[id]; } catch (e) { /* 无妨 */ }
  const savePos = () => store.set('pos', Object.fromEntries(Object.entries(posMem).filter(([, v]) => v > 2).map(([k, v]) => [k, Math.round(v)])));
  let near = false, vis = false, ratio = 0, sleepT = 0;

  /* ---------------------------------------------------- 加载：引擎、角色、影片脚本、节拍分析 */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => res(); s.onerror = () => { s.remove(); rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }
  let libP = null;
  function lib() {
    if (!libP) libP = (async () => {
      if (!window.MVE) await loadScript('js/mv/engine.js');
      if (!window.MVE.cast) { try { await loadScript('js/mv/cast.js'); } catch (e) { /* 没有角色库也能放：影片自己会画占位 */ } }
      const c = window.MVE.cast;
      // 角色库若拆成了多个文件：cast.files 列出其余部分（相对站点根目录），或给出 cast.ready（Promise）
      if (c && Array.isArray(c.files)) await Promise.all(c.files.map((f) => loadScript(f).catch(() => {})));
      if (c && c.ready && typeof c.ready.then === 'function') await Promise.race([c.ready.catch(() => {}), wait(8000)]);
      return window.MVE;
    })().catch((e) => { libP = null; throw e; });
    return libP;
  }
  /** 影片定义 + 节拍分析。失败先等一下重试一次；仍失败则（只在 ?debug）借示例影片顶上 */
  function filmData(id) {
    if (data[id]) return Promise.resolve(data[id]);
    if (!filmP[id]) filmP[id] = (async () => {
      const E = await lib();
      let def;
      try { def = await E.load(id); }
      catch (e) {
        await wait(1200);
        try { def = await E.load(id); }
        catch (e2) { if (!FALLBACK) throw e2; def = await E.load(FALLBACK); }
      }
      const own = def.id === id;
      const an = await E.analysis(`assets/music/${(own && def.analysisId) || id}.json`);
      delete bad[id];
      data[id] = { def, an, own };
      try { paintText(id); } catch (e) { dlog('paintText', e); }
      return data[id];
    })().catch((e) => { delete filmP[id]; bad[id] = true; try { paintText(id); } catch (er) { /* 无妨 */ } throw e; });
    return filmP[id];
  }
  /** 影片级的准备（字体、影片自己的 prepare：SVG 栅格化等）每支只做一次：用一张 4×4 的小画布跑 */
  function prepFilm(id) {
    if (!prepP[id]) prepP[id] = (async () => {
      const { def, an } = await filmData(id);
      const r = window.MVE.renderer(window.MVE.mk(4, 4), def, an, { reduced: reduce });
      await r.prepare();
      prepared.add(id);
    })().catch((e) => { delete prepP[id]; throw e; });
    return prepP[id];
  }
  const audioUrl = (id) => { const d = data[id]; return (d && d.own && d.def.audio) || `assets/music/${id}.mp3`; };

  /** 影片资料：默认值 ← 影片脚本的 film.meta（容忍缺字段） */
  function meta(id) {
    const b = byId[id], d = data[id], m = Object.assign({}, b);
    const fm = d && d.own && d.def.meta;
    if (fm) {
      for (const k of ['cn', 'en', 'artists', 'form', 'logline', 'era', 'poster', 'thumbs']) if (fm[k] != null && fm[k] !== '') m[k] = fm[k];
      if (fm.no != null) m.n = typeof fm.no === 'number' ? fm.no : ROMAN.indexOf(String(fm.no).toUpperCase()) > 0 ? ROMAN.indexOf(String(fm.no).toUpperCase()) : b.n;
      if (Array.isArray(fm.synopsis) && fm.synopsis.length) m.synopsis = fm.synopsis;
      else if (typeof fm.synopsis === 'string' && fm.synopsis) m.synopsis = [fm.synopsis];
      if (Array.isArray(fm.cast) && fm.cast.length) m.cast = fm.cast.map((c) => (typeof c === 'string' ? { who: c } : c)).filter((c) => c && c.who);
      if (fm.accent) m.accent = /^\d+\s*,\s*\d+\s*,\s*\d+$/.test(String(fm.accent)) ? `rgb(${fm.accent})` : String(fm.accent);
    }
    m.no = ROMAN[m.n] || String(m.n);
    m.dur = d ? d.an.duration : b.dur;
    return m;
  }
  const chapters = (id) => {
    const d = data[id];
    if (!d) return [];
    return d.def.shots.filter((s) => s.title).map((s) => ({ t: s.t0, title: s.title, id: s.id }));
  };
  const chapterAt = (id, t) => { let c = null; for (const x of chapters(id)) { if (x.t <= t + 0.01) c = x; else break; } return c; };
  const posterT = (m) => { const p = +m.poster; const D = m.dur || 1; return !(p > 0) ? D * 0.3 : p <= 1 ? p * D : Math.min(p, D - 0.5); };

  /* ---------------------------------------------------- 音频：服务器支持分段（Range）时边下边播；否则整段下载成 Blob（带进度）
   * 本站的 serve.py 支持 Range：点“放映”后一两秒就能开始，手机隔着外网也不用等整首歌下完。
   * 录制视频时始终用整段下载的 Blob（中途卡顿会录进视频里）。 */
  const audio = new Audio();
  audio.preload = 'auto';
  let audioId = null;
  const blobP = {}, blobUrl = {}, prog = {}, srcUrl = {}, streamBad = {};
  let rangeP = null;
  /** 服务器是否支持分段请求（只探测一次：请求两个字节，看是不是 206） */
  function rangeOK() {
    if (!rangeP) rangeP = (async () => {
      try {
        const r = await fetch(audioUrl(cur || FILMS[0].id), { headers: { Range: 'bytes=0-1' }, cache: 'no-store' });
        const ok = r.status === 206;
        try { if (r.body) r.body.cancel(); } catch (e) { /* 无妨 */ }
        return ok;
      } catch (e) { rangeP = null; return false; }
    })();
    return rangeP;
  }
  /** 这一部可以直接交给 <audio> 的地址：能边下边播就给原地址，否则（或 full）等整段下载完的 Blob */
  function audioSrc(id, full) {
    if (blobUrl[id]) return Promise.resolve(blobUrl[id]);
    if (full || streamBad[id]) return fetchAudio(id);
    if (srcUrl[id]) return Promise.resolve(srcUrl[id]);
    return rangeOK().then((ok) => {
      if (!ok) return fetchAudio(id);
      prog[id] = 1;
      return (srcUrl[id] = new URL(audioUrl(id), location.href).href);
    });
  }
  const isSrc = (id) => !!id && (audio.src === blobUrl[id] || audio.src === srcUrl[id]);
  function fetchAudio(id) {
    if (blobUrl[id]) return Promise.resolve(blobUrl[id]);
    if (!blobP[id]) blobP[id] = (async () => {
      const r = await fetch(audioUrl(id));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const total = +r.headers.get('content-length') || 0;
      let blob;
      if (r.body && r.body.getReader) {
        const rd = r.body.getReader(), chunks = [];
        let got = 0, lastUi = 0;
        for (;;) {
          const { done, value } = await rd.read();
          if (done) break;
          chunks.push(value);
          got += value.length;
          prog[id] = total ? got / total : 1 - Math.exp(-got / 4e6);
          const now = performance.now();
          if (now - lastUi > 90) { lastUi = now; onProg(id); }
        }
        blob = new Blob(chunks, { type: r.headers.get('content-type') || 'audio/mpeg' });
      } else blob = await r.blob();
      prog[id] = 1; onProg(id);
      return (blobUrl[id] = URL.createObjectURL(blob));
    })().catch((e) => { delete blobP[id]; prog[id] = 0; throw e; });
    return blobP[id];
  }
  function metaReady() {
    if (audio.readyState >= 1) return Promise.resolve();
    return new Promise((res) => {
      const ok = () => { audio.removeEventListener('loadedmetadata', ok); audio.removeEventListener('error', ok); clearTimeout(to); res(); };
      const to = setTimeout(ok, 5000);
      audio.addEventListener('loadedmetadata', ok);
      audio.addEventListener('error', ok);
    });
  }
  // iOS：<audio> 第一次 play() 必须在手势里同步调用；等下载完再播会被拦下。先在手势里播一段空白声音“解锁”这个元素
  const SILENT = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQQAAAAAAAAA';
  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    if (!ios || audio.src) return;
    try { audio.src = SILENT; const p = audio.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 无妨 */ }
  }

  /* ---------------------------------------------------- 时钟：audio.currentTime + performance.now() 补间，缓慢锁相 */
  let playing = false, wantPlay = false, pos = 0, dur = 0, playTok = 0;
  const clk = { t: 0, at: 0, last: -1 };
  // 边下边播时网络跟不上会卡住（waiting）：画面也停在声音的位置，等声音接上再走，不会跑到前面去
  let stalled = false;
  function clockReset(t) { clk.t = t; clk.at = performance.now(); clk.last = audio.currentTime; }
  function now() {
    if (!playing) return pos;
    if (stalled) return clamp(audio.currentTime, 0, dur || 1e9);
    const pn = performance.now();
    let t = clk.t + (pn - clk.at) / 1000;
    const ct = audio.currentTime;
    if (ct !== clk.last) {
      clk.last = ct;
      const err = ct - t;
      if (Math.abs(err) > 0.25) { clk.t = ct; clk.at = pn; t = ct; }
      else { clk.t += err * 0.1; t += err * 0.1; }
    }
    return clamp(t, 0, dur || 1e9);
  }

  /* ---------------------------------------------------- 渲染：分辨率档位、逐帧循环、性能自适应 */
  const LV = [[1920, 1080], [1280, 720], [960, 540], [640, 360]];
  let lv = -1, floor = 0, hdOK = false, fpsCap = 60, raf = 0, lastFrame = 0, stillRaf = 0, fsOn = false, pseudo = false;
  // 省电模式（访客自己选，本机记住）：960×540、30 帧，显卡与风扇都安静下来
  let saver = store.get('saver', false) === true;
  const cap = () => (saver ? 30 : fpsCap);
  let exporting = false;
  const pf = { n: 0, ms: 0, dts: [], skip: 0, hist: [] };
  const live = () => !!R && Rid === cur && (playing || exporting) && (vis || exporting || fsOn || pseudo) && !document.hidden;
  function kick() { if (!raf && live()) { lastFrame = 0; raf = requestAnimationFrame(frame); } }
  function halt() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function frame(ts) {
    raf = 0;
    if (!live()) return;
    raf = requestAnimationFrame(frame);
    if (lastFrame && ts - lastFrame < 1000 / cap() - 3) return; // 高刷屏上 60 帧封顶（省电模式 30 帧）
    const dt = lastFrame ? ts - lastFrame : 16.7;
    lastFrame = ts;
    const t = now();
    draw(t);
    tickUI(t);
    perfSample(dt);
  }
  let drawnFor = null;
  function draw(t) {
    if (!R || Rid !== cur) return;
    try { R.render(t); } catch (e) { if (DEBUG) console.warn('[MVP]', e); }
    if (drawnFor !== cur) { drawnFor = cur; stage.classList.add('has-frame'); }
    // 舞台外圈的氛围光：跟着这一首歌的响度起伏（只改透明度，交给合成器）
    if (playing && el.glow) {
      const e = R.timing ? R.timing.env('rms', t) : 0.5;
      const v = (0.3 + 0.7 * clamp(e * 1.4, 0, 1)).toFixed(2);
      if (v !== el.glow._v) { el.glow._v = v; el.glow.style.opacity = v; }
    }
  }
  const stillT = () => (state === 'poster' ? posterT(meta(cur)) : clamp(pos, 0, Math.max(0, dur - 0.02)));
  /** 暂停时只画一帧（合并到下一个动画帧） */
  function requestStill() {
    if (stillRaf || playing) return;
    stillRaf = requestAnimationFrame(() => { stillRaf = 0; if (!playing) draw(stillT()); });
  }
  function wantLevel() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), full = fsOn || pseudo;
    const w = (full ? innerWidth : stage.clientWidth || 800) * dpr;
    const L = full && hdOK && w >= 1700 ? 0 : w >= 1000 ? 1 : 2;
    return clamp(Math.max(L, floor, saver ? 2 : 0), 0, 3);
  }
  function applyLevel(force) {
    if (!R || exporting) return;
    const L = wantLevel();
    if (L === lv && !force && canvas.width === LV[L][0]) return;
    lv = L;
    const [w, h] = LV[L];
    if (canvas.width !== w || canvas.height !== h) {
      R.resize(w, h);
      pf.skip = 40;
      // resize 会清空画布：同一个任务里马上补画，不闪黑
      draw(playing ? now() : stillT());
    }
    hud();
  }
  function perfSample(dt) {
    if (exporting || !R || saver) return;
    if (pf.skip > 0) { pf.skip--; return; }
    pf.n++; pf.ms += R.lastMs; pf.dts.push(dt);
    if (pf.n < 120) return;
    const avg = pf.ms / pf.n, s = pf.dts.sort((a, b) => a - b), p90 = s[Math.floor(s.length * 0.9)];
    pf.n = 0; pf.ms = 0; pf.dts = [];
    if (DEBUG) { pf.hist.push([lv, +avg.toFixed(2), +p90.toFixed(1)]); if (pf.hist.length > 60) pf.hist.shift(); }
    // 画一帧本身不慢、帧间隔却长期很长：显卡跟不上（手机上常见），同样降档
    if (avg > 9 || (p90 > 28 && avg > 5.5) || p90 > 40) {
      // 跟不上：降一档分辨率（本次会话内不再升回来）；已经最低就降到 30 帧
      if (lv < 3) { floor = lv + 1; hdOK = false; applyLevel(); }
      else if (fpsCap > 30) { fpsCap = 30; hud(); }
      pf.skip = 45;
    } else if (!hdOK && lv === 1 && floor <= 1 && avg < 4.5 && p90 < 18.5) {
      hdOK = true;
      if (fsOn || pseudo) applyLevel();
    }
  }
  function hud() {
    if (!el.hud) return;
    const t = R ? `${canvas.width}×${canvas.height} · ${cap()} FPS · 实时渲染` : '实时渲染 · Canvas 2D';
    if (el.hud.textContent !== t) el.hud.textContent = t;
    const b = el.saver;
    if (b) { b.setAttribute('aria-pressed', String(saver)); b.classList.toggle('on', saver); }
  }
  function toggleSaver() {
    saver = !saver;
    store.set('saver', saver);
    pf.n = 0; pf.ms = 0; pf.dts = []; pf.skip = 40;
    if (R && !exporting) applyLevel(true);
    hud();
    flash(saver ? '省电模式：960×540 · 30 帧' : '省电模式：关（画质自动）');
  }

  /** 舞台渲染器：换片后第一次需要时创建；创建与第一帧在同一个任务里完成（画布不会闪空） */
  async function ensureRenderer() {
    if (R && Rid === cur) return R;
    const id = cur, tok = ++rTok;
    await filmData(id);
    await prepFilm(id);
    if (tok !== rTok || id !== cur) return null;
    const d = data[id];
    const r = window.MVE.renderer(canvas, d.def, d.an, { reduced: reduce });
    r.captions = cc;
    R = r; Rid = id; lv = -1; drawnFor = null;
    dur = d.an.duration || dur;
    applyLevel(true);
    if (drawnFor !== id) draw(playing ? now() : stillT());
    marks();
    info();
    paintNow();
    tickUI(playing ? now() : pos, true);
    return R;
  }
  function dropRenderers() {
    if (playing || exporting || wantPlay) return;
    R = null; Rid = null; PR = null; PRid = null; ++rTok;
    for (const id of Object.keys(data)) release(id);
  }
  /** 影片若提供 film.release()（可选）：换片或长时间离开时调用，让它丢掉自己的位图缓存（下次需要时重画） */
  function release(id) {
    const d = data[id];
    if (d && d.own && typeof d.def.release === 'function') { try { d.def.release(); } catch (e) { dlog('release', id, e); } }
  }

  /* ---------------------------------------------------- 状态与界面 */
  let cc = store.get('cc', true) !== false;
  let auto = store.get('auto', !reduce) === true;
  let vol = clamp(+store.get('vol', 0.9), 0, 1);
  if (!Number.isFinite(vol)) vol = 0.9;
  let muted = store.get('muted', false) === true;
  audio.volume = vol; audio.muted = muted;

  const STATE_LB = { poster: '待映', loading: '载入中', playing: '放映中', paused: '已暂停', ended: '已放完' };
  function setState(s) {
    state = s;
    if (!stage) return;
    stage.dataset.state = s;
    const pl = s === 'playing' || s === 'loading';
    for (const b of $$('[data-mv="toggle"]', root).concat(mini ? $$('[data-mv="toggle"]', mini) : [])) {
      const want = pl ? 'pause' : 'play';
      if (b._ico !== want) { b._ico = want; const i = b.querySelector('.mvi'); if (i) i.outerHTML = I[want]; }
      b.setAttribute('aria-label', pl ? '暂停（空格）' : s === 'ended' ? '重新播放' : '播放（空格）');
    }
    if (s === 'loading') el.big.setAttribute('aria-label', '载入中，点一下取消');
    if (s !== 'loading') { el.big.style.removeProperty('--p'); el.bigT.textContent = ''; }
    paintPill();
    root.classList.toggle('mv-live', playing || wantPlay || fsOn || exporting);
    $$('.mv-card', root).forEach((c) => c.classList.toggle('playing', c.dataset.mvCard === cur && s === 'playing'));
    paintNow();
    miniSync();
    if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = s === 'playing' ? 'playing' : s === 'poster' ? 'none' : 'paused'; } catch (e) { /* 旧浏览器 */ }
    if (s !== 'playing') { clearTimeout(idleT); setIdle(false); }
  }
  function announce(msg) { if (el.sr) el.sr.textContent = msg; }
  /** 待映胶囊上的字：第一次看是“放映 4:00”；上次看到一半是“继续观看 1:23 / 4:00”（旁边多一个“从头”） */
  function paintPill() {
    if (!el.big || state === 'loading' || !cur) return;
    const D = dur || meta(cur).dur, resume = state === 'poster' && pos > 2 && pos < D - 3;
    const l = resume ? '继续观看' : '放映', d = resume ? `${fmt(pos)} / ${fmt(D)}` : fmt(D);
    if (el.bigL.textContent !== l) el.bigL.textContent = l;
    if (el.bigD.textContent !== d) el.bigD.textContent = d;
    stage.classList.toggle('resume', resume);
    el.big.setAttribute('aria-label', resume ? `从 ${fmt(pos)} 继续观看` : state === 'ended' ? '重新播放' : '播放');
  }
  function onProg(id) {
    if (id !== cur || state !== 'loading' || !el.big) return;
    const p = prog[id] || 0;
    el.big.style.setProperty('--p', p.toFixed(3));
    el.bigT.textContent = p < 1 ? `${Math.round(p * 100)}%` : '';
    el.bigL.textContent = p > 0 && p < 1 ? `载入 ${Math.round(p * 100)}%` : '载入中';
  }
  let lastSec = -1;
  function tickUI(t, force) {
    const s = Math.floor(t);
    if (s === lastSec && !force) return;
    lastSec = s;
    const D = dur || meta(cur).dur;
    const tt = `${fmt(t)} / ${fmt(D)}`;
    if (el.time.textContent !== tt) el.time.textContent = tt;
    const ch = chapterAt(cur, t), cl = ch ? ch.title : '';
    if (el.chap.textContent !== cl) { el.chap.textContent = cl; el.nowCh.textContent = cl ? `· ${cl}` : ''; }
    // 本片资料里的章节表：当前章节高亮（只在章节变化时改）
    const ct = ch ? ch.t.toFixed(2) : '';
    if (el.info && el.info._ch !== cur + ct) {
      el.info._ch = cur + ct;
      $$('.mi-chs button', el.info).forEach((b) => b.classList.toggle('on', b.dataset.t === ct && state !== 'poster'));
    }
    el.bar.setAttribute('aria-valuemax', String(Math.round(D)));
    el.bar.setAttribute('aria-valuenow', String(s));
    el.bar.setAttribute('aria-valuetext', `${fmt(t)} / ${fmt(D)}${cl ? '，' + cl : ''}`);
    // 播放中进度条交给 Web Animations；减少动态效果时不用它，改为每秒跳一格
    if (!playing || force || reduce) progress();
  }
  /** 进度条（主进度条 + 迷你条）：写当前位置；播放中交给 Web Animations 按剩余时长走到头，逐帧循环不再碰它 */
  function progress() {
    const D = dur || meta(cur).dur || 1, t = playing ? now() : pos, k = clamp(t / D, 0, 1);
    const run = playing && !reduce ? (1 - k) * D * 1000 : 0;
    const set = (node, fn) => {
      if (!node) return;
      if (node._pa) { node._pa.cancel(); node._pa = null; }
      node.style.transform = fn(k);
      if (run > 0) node._pa = node.animate([{ transform: fn(k) }, { transform: fn(1) }], { duration: run, easing: 'linear', fill: 'forwards' });
    };
    const sx = (v) => `scaleX(${v.toFixed(5)})`, tx = (v) => `translateX(${(v * 100).toFixed(3)}%)`;
    // 舞台看不见时主进度条的动画也停掉（回到视野时 visIO 会重新对齐）
    if (vis || fsOn || pseudo) { set(el.fill, sx); set(el.knobw, tx); }
    else for (const n of [el.fill, el.knobw]) if (n && n._pa) { n._pa.cancel(); n._pa = null; }
    if (mini && mini.classList.contains('on')) set(el.mProg, sx);
    else if (el.mProg && el.mProg._pa) { el.mProg._pa.cancel(); el.mProg._pa = null; }
  }

  /* ---------------------------------------------------- 播放控制 */
  function siteAudio(on) {
    pageHold(on);
    const A = window.AUDIO;
    if (!A) return;
    try {
      if (on) { if (A.voice && !A.voice.paused) A.stopVoice(); if (A.hold) A.hold('mv', true); }
      else if (A.hold) A.hold('mv', false);
    } catch (e) { /* 页面的声音出错不影响放映 */ }
  }
  /** 全屏（或伪全屏）放映时，背后的页面看不见：让背景着色器与前景特效层停下来，省 GPU */
  let pageHeld = false;
  function pageHold(on = playing || wantPlay || exporting) {
    const want = !!on && (fsOn || pseudo);
    if (want === pageHeld) return;
    pageHeld = want;
    try { if (window.BG && BG.hold) BG.hold(want); if (window.FX && FX.hold) FX.hold(want); } catch (e) { /* 无妨 */ }
  }
  async function playCur() {
    if (!cur || playing) return;
    const id = cur, tok = ++playTok;
    touched = true;
    stopCountdown();
    unlock();
    wantPlay = true;
    if (state === 'ended' || pos >= dur - 0.3) pos = 0;
    setState('loading');
    onProg(id);
    try {
      const [url] = await Promise.all([audioSrc(id, exporting), ensureRenderer()]);
      if (tok !== playTok || id !== cur) return;
      if (audioId !== id || audio.src !== url) { audio.src = url; audioId = id; await metaReady(); }
      if (tok !== playTok || id !== cur) return;
      audio.currentTime = clamp(pos, 0, Math.max(0, (dur || 1) - 0.3));
      await audio.play();
    } catch (e) {
      dlog('playCur', e);
      // 失败不提示：回到可以再点一次的状态（被新的播放 / 暂停打断时 tok 已变，什么也不做）；
      // 之前若是“安静地”暂停（换片、拖动进度条），环境声还在让位：还回去
      if (tok === playTok) { wantPlay = false; siteAudio(false); setState(pos > 0 ? 'paused' : 'poster'); requestStill(); }
      return;
    }
    if (tok !== playTok || id !== cur) { if (!wantPlay) audio.pause(); return; }
    onPlaying();
  }
  function onPlaying() {
    if (playing) return;
    playing = true; wantPlay = false;
    siteAudio(true);
    clockReset(audio.currentTime);
    pf.skip = 30;
    setState('playing');
    progress();
    applyLevel();
    kick(); poke();
    if (exp && exp.rec && exp.rec.state === 'paused') try { exp.rec.resume(); } catch (e) { /* 无妨 */ }
    announce(`正在放映：${meta(cur).no} · ${meta(cur).cn}`);
    prefetchNext();
    msPosition();
  }
  /** 连播开着时：放到七成左右先把下一部的音乐下好（远程访问时，下一部能无缝接上） */
  let prefT = 0;
  function prefetchNext() {
    clearTimeout(prefT);
    const n = nextId(cur);
    if (!auto || !n || blobUrl[n] || blobP[n] || srcUrl[n] || exporting) return;
    const wait = Math.max(0, (dur || 240) * 0.7 - (playing ? now() : pos)) * 1000;
    // 能边下边播时不必提前下整首（省手机流量）；只把影片脚本先载好
    prefT = setTimeout(() => { if (playing && auto && nextId(cur) === n) { audioSrc(n).catch(() => {}); filmData(n).catch(() => {}); } }, wait);
  }
  /** 系统媒体控件（锁屏、耳机、浏览器的媒体中心）上的进度 */
  function msPosition() {
    const ms = navigator.mediaSession;
    if (!ms || !ms.setPositionState || !dur) return;
    try { ms.setPositionState({ duration: dur, playbackRate: 1, position: clamp(playing ? now() : pos, 0, dur) }); } catch (e) { /* 无妨 */ }
  }
  /** 暂停。quiet：马上还要接着放（拖动进度条、换片），不把环境声还回去 */
  function pause(opt = {}) {
    ++playTok;
    const was = playing || wantPlay;
    wantPlay = false;
    if (playing) { pos = now(); playing = false; }
    if (was && !opt.quiet && cur && !exporting) { posMem[cur] = pos; savePos(); }
    try { audio.pause(); } catch (e) { /* 无妨 */ }
    halt();
    if (!opt.quiet) siteAudio(false);
    if (exp && exp.rec && exp.rec.state === 'recording') try { exp.rec.pause(); } catch (e) { /* 无妨 */ }
    clearTimeout(prefT);
    if (was || state === 'loading') setState(pos > 0.05 ? 'paused' : 'poster');
    tickUI(pos, true);
    requestStill();
    msPosition();
    if (was && !opt.quiet) announce('已暂停');
  }
  function toggle() {
    if (state === 'playing' || state === 'loading' || wantPlay) pause();
    else { if (state === 'ended') pos = 0; playCur(); }
  }
  function seek(t, opt = {}) {
    if (!cur || exporting) return;
    const D = dur || meta(cur).dur;
    t = clamp(t, 0, Math.max(0, D - 0.05));
    pos = t;
    touched = true;
    stopCountdown();
    if (playing) { try { audio.currentTime = t; } catch (e) { /* 无妨 */ } clockReset(t); pf.skip = 20; draw(t); }
    else {
      if (state === 'poster' || state === 'ended') setState('paused');
      if (!R || Rid !== cur) { if (near) ensureRenderer(); } else requestStill();
    }
    tickUI(t, true);
    if (playing) prefetchNext();
    msPosition();
    if (opt.flash) flash(opt.flash);
  }
  const seekBy = (d) => { if (!cur) return; seek((playing ? now() : pos) + d, { flash: d > 0 ? `+${d} 秒` : `−${-d} 秒` }); };
  function setVol(v, fl = true) {
    vol = clamp(v, 0, 1);
    audio.volume = vol;
    if (vol > 0 && muted) { muted = false; audio.muted = false; }
    store.set('vol', +vol.toFixed(2)); store.set('muted', muted);
    paintVol();
    if (fl) flash(`音量 ${Math.round(vol * 100)}%`);
  }
  function toggleMute() {
    muted = !muted;
    if (!muted && vol < 0.05) { vol = 0.6; audio.volume = vol; }
    audio.muted = muted;
    store.set('muted', muted); store.set('vol', +vol.toFixed(2));
    paintVol();
    flash(muted ? '静音' : `音量 ${Math.round(vol * 100)}%`);
  }
  function toggleCC() {
    cc = !cc;
    store.set('cc', cc);
    if (R) R.captions = cc;
    paintToggles();
    flash(cc ? '旁白字幕：开' : '旁白字幕：关');
    if (!playing) requestStill();
  }
  function toggleAuto() {
    auto = !auto;
    store.set('auto', auto);
    paintToggles();
    flash(auto ? '连播：开' : '连播：关');
    if (playing) prefetchNext(); else clearTimeout(prefT);
  }
  const nextId = (id) => CHRONO[CHRONO.indexOf(id) + 1] || null;
  const prevId = (id) => CHRONO[CHRONO.indexOf(id) - 1] || null;
  function step(d) {
    if (exporting) return;
    const id = d > 0 ? nextId(cur) : prevId(cur);
    if (!id) { if (d < 0) seek(0); return; }
    select(id, { play: playing || wantPlay, t: 0 });
  }

  /** 选片。opt.play：选中后马上播放；opt.t：从哪里开始 */
  function select(id, opt = {}) {
    if (!byId[id] || exporting) return;
    touched = true;
    if (id !== cur) {
      if (cur) { posMem[cur] = state === 'ended' ? 0 : playing ? now() : pos; savePos(); }
      stopCountdown();
      if (playing || wantPlay) pause({ quiet: !!opt.play });
      if (cur) release(cur);
      cur = id;
      ++rTok; R = null; Rid = null; PR = null; PRid = null; drawnFor = null;
      const m = meta(id);
      dur = m.dur;
      const mem = posMem[id] || 0;
      pos = opt.t != null ? opt.t : mem > 2 && mem < dur - 3 ? mem : 0;
      stage.classList.remove('has-frame');
      paintFilm();
      // 指定了时间（章节、拖动）就停在那一帧；否则是待映海报（上次看到一半时，胶囊上写“继续观看”）
      setState(opt.t != null && pos > 0.05 ? 'paused' : 'poster');
      tickUI(pos, true);
    } else if (opt.t != null) seek(opt.t);
    if (opt.play) playCur();
    else if (near) ensureRenderer().catch((e) => dlog('select', e));
  }

  /* ---------------------------------------------------- 播完：下一部 / 三部曲完（接着是番外）/ 全部放完 */
  let cdT = 0;
  function stopCountdown() { clearTimeout(cdT); cdT = 0; if (el.end) el.end.classList.remove('count'); }
  function endCard() {
    const n = nextId(cur), m = meta(cur);
    if (n) {
      const nm = meta(n), fin = cur === LAST_MAIN;
      // 三部曲放完：先落一行“三个夏天 · 完”，下一部是番外
      el.end.classList.toggle('fin', fin);
      el.end.innerHTML = `
        ${fin ? '<p class="me-k mono">THE END · THREE SUMMERS</p><p class="me-fin sm">三个夏天 · 完</p><p class="me-k me-k2 mono">EXTRA · 番外 · 下一部</p>' : `<p class="me-k mono">UP NEXT · ${nm.extra ? '番外 · ' : ''}下一部</p>`}
        <div class="me-card" style="--acc:${esc(nm.accent)}">
          <span class="me-img">${art[n] && art[n].poster ? `<img src="${art[n].poster}" alt="">` : `<b>${nm.no}</b>`}</span>
          <span class="me-tt"><small class="mono">No. ${nm.no} · ${esc(nm.era)}</small><b>${esc(nm.cn)}</b><em>${esc(nm.en)}</em></span>
        </div>
        <div class="me-acts">
          <button type="button" class="me-go" data-mv="next-now"><svg class="me-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" pathLength="100"/></svg>${I.play}<span>立即播放</span></button>
          <button type="button" class="me-no" data-mv="next-cancel">${auto && !exporting ? '取消连播' : '留在这里'}</button>
          <button type="button" class="me-no" data-mv="replay">${I.replay}<span>重看</span></button>
        </div>`;
      if (auto && !exporting) {
        void el.end.offsetWidth;
        el.end.classList.add('count');
        cdT = setTimeout(() => { cdT = 0; if (state === 'ended' && !exporting) select(n, { play: true, t: 0 }); }, 7000);
      }
    } else {
      const x = !!m.extra;
      el.end.classList.remove('fin');
      el.end.innerHTML = `
        <p class="me-k mono">${x ? 'THE END · SIESTA EXTRAS' : 'THE END · THREE SUMMERS'}</p>
        <p class="me-fin">${x ? '番外 · 完' : '三个夏天 · 完'}</p>
        <p class="me-sub">谢谢你看到这里。${x ? '那只货箱，后来就放在了博物馆的角落里。' : cur === LAST_MAIN ? '她把一块小石头留在了山顶。' : ''}</p>
        <div class="me-acts">
          <button type="button" class="me-go" data-mv="replay">${I.replay}<span>重看这一部</span></button>
          <button type="button" class="me-no" data-mv="play-first">${I.list}<span>从第一部开始</span></button>
        </div>`;
    }
  }
  function onEnded() {
    if (!playing && !wantPlay) return;
    playing = false; wantPlay = false;
    pos = dur; posMem[cur] = 0; savePos();
    halt();
    const wasExp = exporting;
    if (exporting) expFinish();
    siteAudio(false);
    draw(Math.max(0, dur - 0.01));
    setState('ended');
    tickUI(dur, true);
    endCard();
    if (!wasExp) announce(`${meta(cur).cn} 放映结束`);
  }

  /* ---------------------------------------------------- 全屏（手机上尽量锁横屏；不支持元素全屏的 iPhone 用铺满视口的“伪全屏”） */
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  async function toggleFS() {
    if (pseudo) { setPseudo(false); return; }
    if (fsEl()) { try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* 无妨 */ } return; }
    const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (req) { try { await req.call(stage, { navigationUI: 'hide' }); return; } catch (e) { /* 退回伪全屏 */ } }
    setPseudo(true);
  }
  let home = null;
  function setPseudo(on) {
    if (on === pseudo) return;
    pseudo = on;
    // 伪全屏：把舞台临时挪到 <body> 下（#app 有 will-change: transform、区块有 content-visibility，固定定位会被它们“接住”）
    if (on) { home = [stage.parentNode, stage.nextSibling]; document.body.appendChild(stage); }
    else if (home) { home[0].insertBefore(stage, home[1]); home = null; }
    document.documentElement.classList.toggle('mv-lock', on);
    stage.classList.toggle('pseudo', on);
    onFSChange();
    // 节点挪动会丢掉焦点：进出伪全屏后都把焦点放回舞台（键盘快捷键接着能用）
    stage.focus({ preventScroll: true });
  }
  function onFSChange() {
    fsOn = fsEl() === stage;
    const full = fsOn || pseudo;
    stage.classList.toggle('full', full);
    const b = $('[data-mv="fs"]', stage);
    if (b) { b.innerHTML = full ? I.fsx : I.fs; b.setAttribute('aria-label', full ? '退出全屏（F / Esc）' : '全屏（F）'); }
    const o = screen.orientation;
    if (fsOn && !fine && o && o.lock) o.lock('landscape').catch(() => {});
    else if (!full && o && o.unlock) try { o.unlock(); } catch (e) { /* 无妨 */ }
    root.classList.toggle('mv-live', playing || wantPlay || full || exporting);
    pageHold();
    applyLevel();
    kick(); poke(); miniSync();
    if (!playing) requestStill();
  }
  document.addEventListener('fullscreenchange', () => stage && onFSChange());
  document.addEventListener('webkitfullscreenchange', () => stage && onFSChange());

  /* ---------------------------------------------------- 控制条自动隐藏、点按反馈 */
  let idleT = 0, overCtrl = false;
  let inside = false; // 鼠标是否在舞台上（只有这时才连全站的自定义光标一起藏起来）
  function setIdle(on) { if (!stage) return; stage.classList.toggle('idle', on); document.documentElement.classList.toggle('mv-idle', on && inside); }
  function poke() {
    if (!stage) return;
    setIdle(false);
    clearTimeout(idleT);
    if (state === 'playing') idleT = setTimeout(() => {
      if (state !== 'playing' || overCtrl || drag) return;
      const a = document.activeElement;
      if (a && stage.contains(a) && a !== stage && a.matches(':focus-visible')) return; // 键盘用户正停在某个按钮上
      setIdle(true);
    }, 2600);
  }
  let flashT = 0;
  function flash(txt) {
    if (!el.flash) return;
    el.flash.textContent = txt;
    el.flash.classList.remove('on');
    void el.flash.offsetWidth;
    el.flash.classList.add('on');
    clearTimeout(flashT);
    flashT = setTimeout(() => el.flash.classList.remove('on'), 900);
  }

  /* ---------------------------------------------------- 进度条：拖动、悬停预览（章节名 + 实时预览帧） */
  let drag = null;
  const barT = (e) => { const r = el.track.getBoundingClientRect(); return clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1) * (dur || meta(cur).dur); };
  function tipAt(e) {
    const r = el.track.getBoundingClientRect(), t = barT(e);
    const w = el.tip.offsetWidth || 160;
    el.tip.style.transform = `translateX(${clamp(e.clientX - r.left, w / 2, r.width - w / 2) - w / 2}px)`;
    el.tipT.textContent = fmt(t);
    const ch = chapterAt(cur, t);
    el.tipC.textContent = ch ? ch.title : '';
    if (fine && !drag) previewAt(t);
    return t;
  }
  let prevRaf = 0, prevWant = 0;
  function previewAt(t) {
    prevWant = Math.round(t * 5) / 5;
    if (prevRaf) return;
    prevRaf = requestAnimationFrame(() => {
      prevRaf = 0;
      const d = data[cur];
      if (!d || !prepared.has(cur)) return;
      if (!PR || PRid !== cur) {
        PR = window.MVE.renderer(el.tipCv, d.def, d.an, { reduced: reduce });
        PR.captions = false; PR.resize(256, 144); PRid = cur;
      }
      try { PR.render(prevWant); el.tip.classList.add('has-cv'); } catch (e) { /* 无妨 */ }
    });
  }
  function bindBar() {
    const bar = el.bar;
    bar.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !cur || exporting) return;
      e.preventDefault();
      try { bar.setPointerCapture(e.pointerId); } catch (er) { /* 无妨 */ }
      drag = { was: playing || wantPlay };
      if (playing || wantPlay) pause({ quiet: true });
      bar.classList.add('drag');
      bar.focus({ preventScroll: true });
      pos = tipAt(e);
      if (state === 'poster' || state === 'ended') setState('paused');
      if (R && Rid === cur) requestStill(); else if (near) ensureRenderer();
      tickUI(pos, true);
    });
    bar.addEventListener('pointermove', (e) => {
      if (drag) { pos = tipAt(e); requestStill(); tickUI(pos, true); return; }
      if (e.pointerType === 'mouse') { bar.classList.add('hov'); tipAt(e); }
    });
    const end = () => {
      if (!drag) return;
      const was = drag.was;
      drag = null;
      bar.classList.remove('drag');
      seek(pos);
      if (was) playCur(); else siteAudio(false);
      poke();
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
    bar.addEventListener('lostpointercapture', end);
    bar.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') bar.classList.remove('hov'); });
  }
  function marks() {
    const D = dur || meta(cur).dur || 1;
    el.marks.innerHTML = chapters(cur).filter((c) => c.t > 1 && c.t < D - 1).map((c) => `<i style="left:${((c.t / D) * 100).toFixed(3)}%" title="${esc(c.title)}"></i>`).join('');
  }

  /* ---------------------------------------------------- 舞台上的点按：桌面单击播放 / 暂停、双击全屏；触屏单击显隐控制条、双击左右两侧快退 / 快进 */
  let clickT = 0, tapT = 0, lastTap = null;
  const onSurface = (e) => !e.target.closest('.mv-ctrl, .mv-big, .mv-restart, .mv-end, .mv-recbar, button, input, a');
  function bindStage() {
    stage.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { inside = true; poke(); } }, { passive: true });
    stage.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      inside = false;
      document.documentElement.classList.remove('mv-idle');
      if (state !== 'playing') return;
      clearTimeout(idleT);
      idleT = setTimeout(() => { if (state === 'playing' && !drag) setIdle(true); }, 700);
    });
    el.ctrl.addEventListener('pointerenter', () => { overCtrl = true; });
    el.ctrl.addEventListener('pointerleave', () => { overCtrl = false; poke(); });
    stage.addEventListener('focusin', poke);
    stage.addEventListener('click', (e) => {
      if (!onSurface(e)) return;
      if (e.pointerType === 'touch' || (e.pointerType == null && tapT)) return; // 触屏在 pointerup 里处理
      if (e.detail > 1) { clearTimeout(clickT); clickT = 0; toggleFS(); return; }
      if (state === 'poster' || state === 'ended') { if (state === 'ended') pos = 0; playCur(); return; }
      clearTimeout(clickT);
      clickT = setTimeout(() => { clickT = 0; toggle(); }, 210);
    });
    stage.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'touch' || !onSurface(e)) return;
      tapT = 1; setTimeout(() => { tapT = 0; }, 400);
      const r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      const side = x < 0.33 ? -1 : x > 0.67 ? 1 : 0;
      const t = performance.now();
      if (lastTap && t - lastTap.t < 320 && side && side === lastTap.side && state !== 'poster') {
        clearTimeout(clickT); clickT = 0; lastTap = { t, side };
        seekBy(side * 10);
        const fx = side < 0 ? el.sfxL : el.sfxR;
        fx.classList.remove('on'); void fx.offsetWidth; fx.classList.add('on');
        return;
      }
      lastTap = { t, side };
      if (state === 'poster') { playCur(); return; }
      // 在这里（聚焦之前）记下控制条是不是藏着的：点一下舞台会让它获得焦点，focusin 会先把控制条叫出来
      const wasIdle = stage.classList.contains('idle') || state !== 'playing';
      clearTimeout(clickT);
      clickT = setTimeout(() => {
        clickT = 0;
        if (wasIdle) poke();
        else { clearTimeout(idleT); setIdle(true); }
      }, 260);
    });
    stage.addEventListener('keydown', onKey);
    el.volr.addEventListener('input', () => setVol(+el.volr.value / 100, false));
    bindBar();
  }
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key, t = e.target;
    if (t && t.matches && t.matches('input[type="range"]') && /^Arrow|^Home$|^End$/.test(k)) return; // 音量滑块自己处理方向键
    let ok = true;
    switch (k.length === 1 ? k.toLowerCase() : k) {
      case ' ':
        if (t && t.closest && t.closest('button, a')) { ok = false; break; } // 空格按在按钮上：让按钮自己响应
        toggle(); break;
      case 'k': toggle(); break;
      case 'ArrowLeft': seekBy(-5); break;
      case 'ArrowRight': seekBy(5); break;
      case 'j': seekBy(-10); break;
      case 'l': seekBy(10); break;
      case 'ArrowUp': setVol(vol + 0.05); break;
      case 'ArrowDown': setVol(vol - 0.05); break;
      case 'm': toggleMute(); break;
      case 'f': toggleFS(); break;
      case 'c': toggleCC(); break;
      case 'n': step(1); break;
      case 'p': step(-1); break;
      case 'Home': seek(0, { flash: '回到开头' }); break;
      case 'End': seek((dur || 1) - 1); break;
      case 'Escape': if (pseudo) setPseudo(false); else ok = false; break;
      // 全屏时别让全站快捷键（T 切换形态会整页重绘）打断放映
      case 't': case 'e': ok = fsOn || pseudo; break;
      default:
        if (/^[0-9]$/.test(k)) seek(((dur || meta(cur).dur) * +k) / 10, { flash: `${k}0%` });
        else ok = false;
    }
    if (ok) { e.preventDefault(); e.stopPropagation(); poke(); }
  }

  /* ---------------------------------------------------- 点击动作（区块与迷你条共用） */
  function onAction(e) {
    const b = e.target.closest && e.target.closest('[data-mv]');
    if (!b) return;
    const a = b.dataset.mv, id = b.dataset.id;
    switch (a) {
      case 'toggle': if (state === 'ended') { pos = 0; playCur(); } else toggle(); break;
      case 'prev': step(-1); break;
      case 'next': step(1); break;
      case 'mute': toggleMute(); break;
      case 'cc': toggleCC(); break;
      case 'auto': toggleAuto(); break;
      case 'fs': toggleFS(); break;
      case 'select': select(id); toStage(); break;
      case 'play-card': select(id, { play: true }); toStage(); break;
      case 'play-all': if (!auto) { auto = true; store.set('auto', true); paintToggles(); } select(CHRONO[0], { play: true, t: 0 }); toStage(); break;
      case 'chapter': select(id || cur, { t: +b.dataset.t, play: playing || wantPlay }); toStage(); break;
      case 'next-now': { const n = nextId(cur); if (n) select(n, { play: true, t: 0 }); break; }
      case 'next-cancel': stopCountdown(); el.end.classList.add('stay'); break;
      case 'replay': case 'restart': pos = 0; playCur(); break;
      case 'play-first': select(CHRONO[0], { play: true, t: 0 }); break;
      case 'saver': toggleSaver(); break;
      case 'export': expStart(); break;
      case 'export-cancel': expCancel(); break;
      case 'back': toStage(true); break;
      case 'mini-close': miniClosed = true; pause(); miniSync(); break;
      default: return;
    }
    if (stage && stage.contains(b)) poke();
  }
  /** 舞台不在视野里时把它滚到视口中间（到站后再校正一次：沿途区块的估计高度可能变化） */
  function toStage(force) {
    if (!stage || (!force && vis && ratio > 0.6)) return;
    const go = (behavior) => {
      const r = stage.getBoundingClientRect();
      const top = scrollY + r.top - Math.max(64, (innerHeight - r.height) / 2);
      scrollTo({ top, behavior });
    };
    go(reduce ? 'auto' : 'smooth');
    setTimeout(() => { const r = stage.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) go('auto'); }, 1100);
    if (force) setTimeout(() => stage.focus({ preventScroll: true }), 700);
  }

  /* ---------------------------------------------------- 迷你播放条（舞台滚出视野、仍在放映时出现） */
  let miniClosed = false, miniSticky = false, miniTimer = 0;
  function buildMini() {
    if (mini) return;
    mini = document.createElement('div');
    mini.className = 'mv-mini';
    mini.setAttribute('role', 'region');
    mini.setAttribute('aria-label', 'MV 迷你播放条');
    mini.innerHTML = `
      <button type="button" class="mm-art" data-mv="back" aria-label="回到影像"><img alt=""><b class="mm-no"></b></button>
      <div class="mm-tt"><b></b><small class="mono"></small></div>
      <button type="button" class="mm-b" data-mv="toggle" aria-label="暂停">${I.pause}</button>
      <button type="button" class="mm-b mm-back" data-mv="back" aria-label="回到影像">${I.up}<span>回到影像</span></button>
      <button type="button" class="mm-b mm-x" data-mv="mini-close" aria-label="停止放映并关闭">${I.x}</button>
      <span class="mm-prog" aria-hidden="true"><i></i></span>`;
    document.body.appendChild(mini);
    mini.addEventListener('click', onAction);
    el.mProg = $('.mm-prog i', mini);
  }
  function miniSync() {
    if (!stage) return;
    const inView = vis && ratio >= 0.3;
    if (inView) { miniClosed = false; miniSticky = false; }
    const show = !!cur && !inView && !fsOn && !pseudo && !miniClosed && (playing || wantPlay || (state === 'paused' && miniSticky));
    if (show) buildMini();
    if (!mini) return;
    const was = mini.classList.contains('on');
    if (show) miniSticky = true;
    mini.classList.toggle('on', show);
    mini.inert = !show;
    clearInterval(miniTimer); miniTimer = 0;
    if (!show) { if (was) progress(); return; }
    const m = meta(cur);
    $('.mm-tt b', mini).textContent = `${m.no} · ${m.cn}`;
    $('.mm-no', mini).textContent = m.no;
    const img = $('.mm-art img', mini);
    if (art[cur] && art[cur].poster) { if (img.getAttribute('src') !== art[cur].poster) img.src = art[cur].poster; img.hidden = false; } else img.hidden = true;
    mini.style.setProperty('--acc', m.accent);
    const tick = () => { const s = $('.mm-tt small', mini); const t = `${fmt(playing ? now() : pos)} / ${fmt(dur || m.dur)}`; if (s.textContent !== t) s.textContent = t; };
    tick();
    if (playing) miniTimer = setInterval(tick, 1000);
    progress();
  }

  /* ---------------------------------------------------- 导出视频：MediaRecorder 实时录下画布与声音，生成 WebM（只在本地） */
  let exp = null;
  const canRec = () => !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream && (audio.captureStream || audio.mozCaptureStream));
  function pickMime() {
    for (const m of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
    return '';
  }
  async function expStart() {
    if (exporting || !cur || !canRec()) return;
    const id = cur;
    touched = true;
    stopCountdown();
    expUI('prep');
    try { await Promise.all([fetchAudio(id), ensureRenderer()]); } catch (e) { expUI('idle'); return; }
    if (id !== cur) { expUI('idle'); return; }
    if (playing || wantPlay) pause({ quiet: true });
    if (exp && exp.url) { URL.revokeObjectURL(exp.url); }
    exp = { id, chunks: [], cancel: false, rec: null, url: null, size: 0, tracks: [] };
    // 录制期间锁定分辨率（至少 1280×720，除非这台设备已经降过档）
    const L = Math.max(1, floor);
    if (canvas.width !== LV[L][0]) { R.resize(LV[L][0], LV[L][1]); lv = L; hud(); }
    exporting = true;
    root.classList.add('mv-exporting');
    stage.classList.add('rec');
    pos = 0;
    tickUI(0, true);
    expUI('rec');
    const startRec = () => {
      audio.removeEventListener('playing', startRec);
      if (!exp || exp.rec || !exporting) return;
      try {
        const vs = canvas.captureStream(30);
        const as = audio.captureStream ? audio.captureStream() : audio.mozCaptureStream();
        exp.tracks = [...vs.getVideoTracks(), ...as.getAudioTracks()];
        const mime = pickMime();
        const rec = new MediaRecorder(new MediaStream(exp.tracks), Object.assign({ videoBitsPerSecond: canvas.width >= 1280 ? 8e6 : 5e6, audioBitsPerSecond: 192000 }, mime ? { mimeType: mime } : {}));
        exp.rec = rec;
        rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) exp.chunks.push(ev.data); };
        rec.onstop = () => expDone();
        rec.start(1000);
      } catch (e) { expAbort(); }
    };
    audio.addEventListener('playing', startRec);
    if (audioId !== id || audio.src !== blobUrl[id]) { audio.src = blobUrl[id]; audioId = id; await metaReady(); }
    try { audio.currentTime = 0; } catch (e) { /* 无妨 */ }
    await playCur();
    if (!playing) { audio.removeEventListener('playing', startRec); expAbort(); return; }
    if (!exp.rec) startRec();
    expTick();
  }
  let expT = 0;
  function expTick() {
    clearTimeout(expT);
    if (!exporting) return;
    const t = playing ? now() : pos, D = dur || 1;
    if (el.recT) el.recT.textContent = `${fmt(t)} / ${fmt(D)}`;
    if (el.expBar) el.expBar.style.transform = `scaleX(${clamp(t / D, 0, 1).toFixed(4)})`;
    expT = setTimeout(expTick, 500);
  }
  function expFinish() { if (exp && exp.rec && exp.rec.state !== 'inactive') try { exp.rec.stop(); } catch (e) { expDone(); } else expDone(); }
  function expCancel() {
    if (!exporting || !exp) return;
    exp.cancel = true;
    pause();
    expFinish();
  }
  function expAbort() { if (exp) exp.cancel = true; expFinish(); }
  function expDone() {
    if (!exp) return;
    const e = exp;
    exporting = false;
    clearTimeout(expT);
    root.classList.remove('mv-exporting');
    stage.classList.remove('rec');
    for (const t of e.tracks) try { t.stop(); } catch (er) { /* 无妨 */ }
    e.tracks = [];
    if (!e.cancel && e.chunks.length) {
      const blob = new Blob(e.chunks, { type: 'video/webm' });
      e.size = blob.size;
      e.url = URL.createObjectURL(blob);
      e.chunks = [];
      expUI('done');
    } else { e.chunks = []; expUI('idle'); }
    applyLevel();
  }
  function expUI(s) {
    const box = el.info && $('.mi-exp', el.info);
    if (!box) return;
    box.dataset.s = s;
    const m = meta(cur);
    const btn = $('[data-mv="export"], [data-mv="export-cancel"]', box), st = $('.mx-st', box), dl = $('.mx-dl', box);
    if (s === 'rec' || s === 'prep') {
      btn.dataset.mv = 'export-cancel';
      btn.innerHTML = `${I.x}<span>取消录制</span>`;
      st.innerHTML = s === 'prep' ? '准备中…' : `录制中 <b class="mono mx-t">0:00 / ${fmt(dur)}</b> · 请停留在本页<i class="mx-bar"><i></i></i>`;
      el.recT = $('.mx-t', box); el.expBar = $('.mx-bar i', box);
      dl.hidden = true;
    } else {
      btn.dataset.mv = 'export';
      btn.innerHTML = `${I.rec}<span>导出视频 · WebM</span>`;
      el.recT = null; el.expBar = null;
      if (s === 'done' && exp && exp.url && exp.id === cur) {
        const name = `Eyjafjalla-MV-${m.no}-${m.en.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}.webm`;
        dl.hidden = false; dl.href = exp.url; dl.download = name;
        $('span', dl).textContent = `保存视频（${(exp.size / 1048576).toFixed(1)} MB）`;
        st.textContent = '已生成：视频只在你的浏览器里，关闭页面后就会释放。';
      } else {
        dl.hidden = true;
        st.textContent = `把这支 MV 实时录成视频（约 ${Math.round((m.dur || 240) / 60)} 分钟，${LV[Math.max(1, floor)][0]}×${LV[Math.max(1, floor)][1]} · 30 帧，含音乐，仅供个人欣赏）。录制期间请停留在本页。`;
      }
    }
    if (el.recbar) {
      el.recbar.hidden = !(s === 'rec');
    }
  }

  /* ---------------------------------------------------- 媒体会话：锁屏 / 耳机 / 系统媒体键 */
  let msBound = false;
  function mediaSession() {
    if (!('mediaSession' in navigator) || !cur) return;
    const m = meta(cur), ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({ title: `${m.no} · ${m.cn}（${m.en}）`, artist: m.artists, album: m.extra ? '三个夏天 · 汐斯塔番外 · 本页原创 MV' : '三个夏天 · 本页原创 MV', artwork: art[cur] && art[cur].poster ? [{ src: art[cur].poster, sizes: '640x360', type: 'image/jpeg' }] : [] });
      if (!msBound) {
        msBound = true;
        const on = (a, fn) => { try { ms.setActionHandler(a, fn); } catch (e) { /* 不支持的动作 */ } };
        on('play', () => playCur());
        on('pause', () => pause());
        on('seekbackward', (d) => seekBy(-((d && d.seekOffset) || 10)));
        on('seekforward', (d) => seekBy((d && d.seekOffset) || 10));
        on('previoustrack', () => step(-1));
        on('nexttrack', () => step(1));
        on('seekto', (d) => d && d.seekTime != null && seek(d.seekTime));
      }
    } catch (e) { /* 旧浏览器 */ }
  }

  /* ---------------------------------------------------- 空闲时生成：海报帧、预告缩略图、人物小像 */
  const toUrl = (cv, type = 'image/jpeg', q = 0.86) => new Promise((res) => { try { cv.toBlob((b) => res(b ? URL.createObjectURL(b) : null), type, q); } catch (e) { res(null); } });
  let artOn = false;
  async function makeArt() {
    if (artOn) return;
    artOn = true;
    const ids = ORDER[form].concat(EXTRAS);
    if (cur && ids[0] !== cur) { ids.splice(ids.indexOf(cur), 1); ids.unshift(cur); }
    for (const id of ids) {
      if (art[id] && art[id].done) continue;
      try {
        await filmData(id);
        await prepFilm(id);
        await idleP();
        const d = data[id], m = meta(id), E = window.MVE;
        const cv = E.mk(640, 360);
        const r = E.renderer(cv, d.def, d.an, { reduced: true });
        r.captions = false;
        r.render(posterT(m));
        const a = (art[id] = art[id] || { thumbs: [] });
        a.poster = await toUrl(cv);
        applyArt(id);
        if (id === cur) { info(); paintNow(); marks(); tickUI(pos, true); }
        for (const t of thumbTimes(id, m)) {
          await idleP();
          r.render(t);
          const url = await toUrl(cv, 'image/jpeg', 0.8);
          if (url) a.thumbs.push({ t, url });
        }
        a.done = true;
      } catch (e) { dlog('makeArt', id, e); /* 影片还没准备好：保持占位海报，下次靠近时再试 */ }
    }
    artOn = false;
  }
  function thumbTimes(id, m) {
    const D = m.dur || 240;
    if (Array.isArray(m.thumbs) && m.thumbs.length) return m.thumbs.slice(0, 6).map((t) => (t <= 1 ? t * D : t)).filter((t) => t > 0 && t < D);
    const ch = chapters(id).filter((c) => c.t > 3 && c.t < D - 8);
    if (ch.length >= 3) { const k = Math.max(1, Math.floor(ch.length / 5)); return ch.filter((_, i) => i % k === 0).slice(0, 5).map((c) => c.t + 2.2); }
    return [0.14, 0.32, 0.5, 0.68, 0.84].map((f) => f * D);
  }
  function applyArt(id) {
    if (!root || !art[id] || !art[id].poster) return;
    const img = $(`.mv-card[data-mv-card="${id}"] .mc-img`, root);
    if (img && img.getAttribute('src') !== art[id].poster) { img.onload = () => img.classList.add('ok'); img.src = art[id].poster; }
    if (id === cur) { miniSync(); mediaSession(); }
  }
  /** 人物小像：人物用角色库的胸像取景（240×300）；羊与多利画全身，按不透明像素裁切后缩进 120×150。都转成 PNG 的 Blob URL 缓存 */
  function figure(c) {
    const key = c.who + '|' + JSON.stringify(c.o || {});
    if (!figs.has(key)) figs.set(key, (async () => {
      await lib();
      const E = window.MVE;
      if (!E.cast || !E.cast.draw) return null;
      await idleP();
      const sheep = /sheep|dolly/.test(c.who);
      // 人物：角色库的胸像取景（crop: 'bust'，y = 画面底边，h = 底边到头顶；角 / 呆毛 / 光环在上面留出余量）
      if (!sheep) {
        const PW = 240, PH = 300, pc = E.mk(PW, PH), pg = pc.getContext('2d');
        const po = Object.assign({ x: PW / 2, y: PH + 2, h: PH * 0.74, t: 1.3, pose: 'stand', expr: 'smile', look: [0.3, -0.05] }, c.o || {}, { crop: 'bust' });
        try { E.cast.draw(pg, c.who, po); } catch (e) { return null; }
        return toUrl(pc, 'image/png');
      }
      const W = 420, H = 520, cv = E.mk(W, H), g = cv.getContext('2d', { willReadFrequently: true });
      const o = Object.assign({ x: W / 2, y: H - 24, h: c.who === 'dolly' ? 150 : sheep ? 150 : 420, t: 1.3, pose: 'stand', expr: 'smile', look: [0.3, 0] }, c.o || {});
      try { E.cast.draw(g, c.who, o); } catch (e) { return null; }
      const im = g.getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (im[(y * W + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) return null;
      x0 = Math.max(0, x0 - 6); y0 = Math.max(0, y0 - 6); x1 = Math.min(W, x1 + 8); y1 = Math.min(H, y1 + 8);
      const out = E.mk(120, 150), q = out.getContext('2d'), s = Math.min(120 / (x1 - x0), 150 / (y1 - y0)), w = (x1 - x0) * s, h = (y1 - y0) * s;
      q.imageSmoothingQuality = 'high';
      q.drawImage(cv, x0, y0, x1 - x0, y1 - y0, (120 - w) / 2, 150 - h, w, h);
      return toUrl(out, 'image/png');
    })().catch(() => null));
    return figs.get(key);
  }

  /* ---------------------------------------------------- 区块 HTML */
  function stageHTML() {
    return `
      <div class="mv-ph" aria-hidden="true"><b class="mv-ph-no"></b></div>
      <canvas class="mv-cv" width="1280" height="720" aria-hidden="true"></canvas>
      <div class="mv-shade" aria-hidden="true"></div>
      <div class="mv-poster" aria-hidden="true">
        <p class="mp-k mono"><b class="mp-no"></b><i></i><span class="mp-era"></span></p>
        <h3 class="mp-cn"></h3>
        <p class="mp-en"></p>
        <p class="mp-by mono"></p>
        <p class="mp-log"></p>
      </div>
      <div class="mv-cta">
        <button type="button" class="mv-big" data-mv="toggle" aria-label="播放">
          <svg class="mv-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47" class="r0"/><circle cx="50" cy="50" r="47" class="r1" pathLength="100"/></svg>
          ${I.play}<span class="mv-big-l"><b>放映</b><em class="mono"></em></span><span class="mv-big-t mono"></span>
        </button>
        <button type="button" class="mv-restart" data-mv="restart" aria-label="从头开始放映">${I.replay}<span>从头</span></button>
      </div>
      <div class="mv-top" aria-hidden="true"><b class="mono"></b><span></span><em></em></div>
      <div class="mv-flash mono" aria-hidden="true"></div>
      <div class="mv-sfx l mono" aria-hidden="true">−10 秒</div><div class="mv-sfx r mono" aria-hidden="true">+10 秒</div>
      <div class="mv-end" role="group" aria-label="放映结束"></div>
      <div class="mv-recbar mono" hidden><i></i>REC · 正在录制</div>
      <div class="mv-ctrl">
        <div class="mv-bar" role="slider" tabindex="0" aria-label="播放进度（左右方向键 ±5 秒）" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
          <div class="mv-track"><i class="mv-fill"></i><span class="mv-marks"></span><span class="mv-knobw"><i class="mv-knob"></i></span></div>
          <div class="mv-tip" aria-hidden="true"><canvas class="mv-tipcv" width="256" height="144"></canvas><span class="mv-tipx"><b class="mv-tipt mono"></b><span class="mv-tipc"></span></span></div>
        </div>
        <div class="mv-row">
          <button type="button" class="mv-b" data-mv="toggle" aria-label="播放（空格）">${I.play}</button>
          <button type="button" class="mv-b mv-sm" data-mv="prev" aria-label="上一部（P）">${I.prev}</button>
          <button type="button" class="mv-b mv-sm" data-mv="next" aria-label="下一部（N）">${I.next}</button>
          <div class="mv-vol"><button type="button" class="mv-b" data-mv="mute" aria-label="静音（M）">${I.vol}</button><input class="mv-volr" type="range" min="0" max="100" step="1" aria-label="音量"></div>
          <span class="mv-time mono">0:00 / 0:00</span>
          <span class="mv-chap"></span>
          <span class="mv-sp"></span>
          <button type="button" class="mv-b mv-auto" data-mv="auto" aria-pressed="false" aria-label="连播下一部"><i class="mv-sw" aria-hidden="true"></i><span>连播</span></button>
          <button type="button" class="mv-b" data-mv="cc" aria-pressed="true" aria-label="旁白字幕（C）">${I.cc}</button>
          <button type="button" class="mv-b" data-mv="fs" aria-label="全屏（F）">${I.fs}</button>
        </div>
      </div>
      <p class="mv-sr sr" aria-live="polite"></p>`;
  }
  function introHTML() {
    const li = (id) => { const m = meta(id); return `<li><button type="button" data-mv="select" data-id="${id}" class="${id === FEATURED[form] ? 'feat' : ''}" style="--acc:${esc(m.accent)}"><b>${m.no}</b><span>${esc(m.cn)}</span></button></li>`; };
    const main = CHRONO.filter((id) => !byId[id].extra);
    const total = CHRONO.reduce((s, id) => s + (meta(id).dur || 0), 0);
    return `<div class="mv-intro" data-reveal>
      <div class="mvi-lock">
        <p class="mvi-k mono">THREE SUMMERS · AN ORIGINAL MV TRILOGY${EXTRAS.length ? ' + EXTRAS' : ''}</p>
        <h3 class="mvi-t">三个夏天</h3>
        <ol class="mvi-toc">${main.map(li).join('')}</ol>
        ${EXTRAS.length ? `<ol class="mvi-toc mvi-toc-x" aria-label="番外"><li class="mvi-xk mono" aria-hidden="true">番外</li>${EXTRAS.map(li).join('')}</ol>` : ''}
      </div>
      <div class="mvi-text">
        <p class="mvi-lede">${COPY.lede}</p>
        <p>${COPY.sub[form]}</p>
        ${EXTRAS.length ? `<p>${COPY.extra}</p>` : ''}
        <p class="mvi-tech">${COPY.tech}</p>
        <div class="mvi-acts">
          <button type="button" class="btn btn-primary" data-mv="play-all">${I.list}<span>从第一部连播</span></button>
          <span class="mono mvi-run">${main.length} 部${EXTRAS.length ? ` + 番外 ${EXTRAS.length} 部` : ''} · 约 ${Math.round(total / 60)} 分钟</span>
        </div>
      </div>
    </div>`;
  }
  function listHTML() {
    const card = (id, i) => {
      const m = meta(id), feat = id === FEATURED[form], p = posMem[id] && m.dur ? clamp(posMem[id] / m.dur, 0, 1) : 0;
      const tag = (m.extra ? '番外 · ' : '') + (m.form === 'alter' ? '医疗篇' : '术师篇');
      return `<div class="mv-cw" data-reveal style="--i:${i}"><article class="mv-card${feat ? ' feat' : ''}${id === cur ? ' on' : ''}" data-mv-card="${id}" style="--acc:${esc(m.accent)}">
        <button type="button" class="mc-shot" data-mv="play-card" data-id="${id}" aria-label="放映 ${m.no} · ${esc(m.cn)}">
          <span class="mc-ph" aria-hidden="true"><b>${m.no}</b></span>
          <img class="mc-img${art[id] && art[id].poster ? ' ok' : ''}" alt=""${art[id] && art[id].poster ? ` src="${art[id].poster}"` : ''}>
          <span class="mc-reel" aria-hidden="true"><img alt=""><img alt=""></span>
          <span class="mc-no" aria-hidden="true">${m.no}</span>
          <span class="mc-dur mono">${fmt(m.dur)}</span>
          <span class="mc-play" aria-hidden="true">${I.play}</span>
          <span class="mc-eq" aria-hidden="true"><i></i><i></i><i></i></span>
          ${p > 0.01 ? `<i class="mc-prog" style="--p:${p.toFixed(3)}" aria-hidden="true"></i>` : ''}
        </button>
        <div class="mc-body">
          <p class="mc-k mono">No. ${m.no} · ${esc(m.era)}</p>
          <h4 class="mc-t"><button type="button" data-mv="select" data-id="${id}">${esc(m.cn)}</button></h4>
          <p class="mc-en">${esc(m.en)}</p>
          <p class="mc-by">${esc(m.artists)}</p>
          <p class="mc-log">${esc(m.logline)}</p>
          <p class="mc-tags">${feat ? '<span class="t-feat">先看这一部</span>' : ''}<span>${tag}</span>${bad[id] && !data[id] ? '<span class="t-wait">放映准备中</span>' : ''}</p>
        </div>
      </article></div>`;
    };
    const n = ORDER[form].length;
    // 番外那一行的第三格：那一天的时间线（每一行末尾的编号能直接选片）
    const day = COPY.day.filter((r) => r[2].every((id) => byId[id])).map((r) => `<li style="--acc:${esc(meta(r[2][0]).accent)}"><b class="mono">${esc(r[0])}</b><span>${esc(r[1])}</span><span class="xn-go">${r[2].map((id) => `<button type="button" data-mv="select" data-id="${id}" aria-label="${esc(`${meta(id).no} · ${meta(id).cn}`)}">${meta(id).no}</button>`).join('')}</span></li>`).join('');
    return `<div class="mv-list" data-reveal>
      <div class="ml-h"><h4>三部曲<small class="mono">EPISODES</small></h4><span class="ml-sub">点海报直接放映<span class="ml-hov">；鼠标停在海报上能看到几个镜头</span></span></div>
      <div class="ml-grid">${ORDER[form].map(card).join('')}</div>
      ${EXTRAS.length ? `<div class="ml-h ml-hx"><h4>汐斯塔番外<small class="mono">EXTRAS</small></h4><span class="ml-sub">${esc(COPY.extraSub)}</span></div>
      <div class="ml-grid ml-x">${EXTRAS.map((id, i) => card(id, n + i)).join('')}
        <div class="mv-cw" data-reveal style="--i:${n + EXTRAS.length}"><aside class="ml-xn" aria-label="番外的那一天">
          <p class="mc-k mono">ONE DAY IN SIESTA · 那一天</p>
          <ol class="xn-tl">${day}</ol>
          <p class="xn-p">${esc(COPY.dayNote)}</p>
        </aside></div>
      </div>` : ''}
    </div>`;
  }
  function castHTML(m) {
    const E = window.MVE, meta0 = (E && E.cast && E.cast.meta) || {};
    return m.cast.map((c, i) => {
      const mm = meta0[c.who] || {}, name = mm.name || NAMES[c.who] || c.who;
      const role = c.role || mm.species || '', desc = c.desc || mm.desc || '';
      return `<li class="mi-c" data-fig="${i}"><span class="mi-cf" aria-hidden="true"><img alt=""><b>${esc(name.slice(0, 1))}</b></span>
        <span class="mi-ct"><b>${esc(name)}</b>${role ? `<small>${esc(role)}</small>` : ''}${desc ? `<em>${esc(desc)}</em>` : ''}</span></li>`;
    }).join('');
  }
  function infoHTML() {
    const m = meta(cur), ch = chapters(cur);
    const chs = ch.length ? `<ol class="mi-chs">${ch.map((c) => `<li><button type="button" data-mv="chapter" data-id="${cur}" data-t="${c.t.toFixed(2)}"><b class="mono">${fmt(c.t)}</b><span>${esc(c.title)}</span></button></li>`).join('')}</ol>`
      : `<p class="mi-wait">${data[cur] ? '这一部没有分章节。' : '章节会在影片载入后出现。'}</p>`;
    return `<div class="mv-info panel" data-reveal style="--acc:${esc(m.accent)}">
      <div class="mi-main">
        <p class="mi-k mono">ABOUT · 本片 · No. ${m.no}</p>
        <h3 class="mi-t">${esc(m.cn)}<small>${esc(m.en)}</small></h3>
        <p class="mi-log">${esc(m.logline)}</p>
        <div class="mi-syn">${m.synopsis.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        <h4 class="mi-h">章节<small class="mono">CHAPTERS</small></h4>
        ${chs}
      </div>
      <div class="mi-side">
        <h4 class="mi-h">登场人物<small class="mono">CAST</small></h4>
        <ul class="mi-cast">${castHTML(m)}</ul>
        <h4 class="mi-h">制作<small class="mono">CREDITS</small></h4>
        <dl class="mi-cr">
          <div><dt>歌曲</dt><dd>${esc(m.en)}<small>${esc(m.artists)}</small></dd></div>
          <div><dt>影像</dt><dd>本页原创<small>Canvas 2D 实时渲染 · 画面随音乐的拍点与段落生成</small></dd></div>
          ${data[cur] && data[cur].own && Array.isArray(data[cur].def.needs) && data[cur].def.needs.includes('keyart') ? '<div><dt>立绘特写</dt><dd>官方原画<small>© Hypergryph · 本页分层绑定，实时驱动</small></dd></div>' : ''}
          <div><dt>角色与世界观</dt><dd>《明日方舟》<small>© Hypergryph · 鹰角网络</small></dd></div>
        </dl>
        <p class="mi-note">${COPY.note}</p>
        <div class="mi-exp" data-s="idle"${canRec() ? '' : ' hidden'}>
          <button type="button" class="btn btn-ghost" data-mv="export">${I.rec}<span>导出视频 · WebM</span></button>
          <a class="btn btn-primary mx-dl" hidden>${I.dl}<span>保存视频</span></a>
          <p class="mx-st"></p>
        </div>
      </div>
    </div>`;
  }
  function nowHTML() {
    return `<span class="mn-st"><i></i><b></b></span>
      <span class="mn-t"><b class="mn-no"></b><span class="mn-cn"></span><span class="mn-en"></span></span>
      <span class="mn-ch"></span>
      <span class="mn-hud mono"></span>
      <button type="button" class="mn-q" data-mv="saver" aria-pressed="false" title="降到 960×540 · 30 帧：显卡更安静、更省电">${I.leaf}<span>省电</span></button>`;
  }

  /* ---------------------------------------------------- 把当前影片画到各处 */
  /** 影片脚本载入（或载入失败）后：卡片与舞台上的文字换成影片自己的 film.meta */
  function paintText(id) {
    if (!root) return;
    const m = meta(id), card = $(`.mv-card[data-mv-card="${id}"]`, root);
    const set = (sel, v, scope = card) => { const n = scope && $(sel, scope); if (n && n.textContent !== v) n.textContent = v; };
    if (card) {
      card.style.setProperty('--acc', m.accent);
      set('.mc-k', `No. ${m.no} · ${m.era}`); set('.mc-t button', m.cn); set('.mc-en', m.en); set('.mc-by', m.artists);
      set('.mc-log', m.logline); set('.mc-dur', fmt(m.dur));
      const tags = $('.mc-tags', card), wait = tags && $('.t-wait', tags);
      if (bad[id] && !data[id] && tags && !wait) tags.insertAdjacentHTML('beforeend', '<span class="t-wait">放映准备中</span>');
      else if (wait && data[id]) wait.remove();
    }
    const b = $(`.mvi-toc [data-id="${id}"]`, root);
    if (b) { b.style.setProperty('--acc', m.accent); set('span', m.cn, b); }
    if (id === cur && stage) {
      $('.mv-screen', root).style.setProperty('--mv-film', m.accent);
      stage.style.setProperty('--mv-film', m.accent);
      set('.mp-era', m.era, stage); set('.mp-cn', m.cn, stage); set('.mp-en', m.en, stage); set('.mp-by', m.artists, stage); set('.mp-log', m.logline, stage);
      set('.mv-top span', m.cn, stage); set('.mv-top em', m.en, stage);
      paintPill();
      paintNow();
    }
  }
  function paintFilm() {
    if (!root || !cur) return;
    const m = meta(cur);
    const scr = $('.mv-screen', root);
    scr.style.setProperty('--mv-film', m.accent);
    stage.style.setProperty('--mv-film', m.accent);
    $('.mv-ph-no', stage).textContent = m.no;
    $('.mp-no', stage).textContent = `No. ${m.no}`;
    $('.mp-era', stage).textContent = m.era;
    $('.mp-cn', stage).textContent = m.cn;
    $('.mp-en', stage).textContent = m.en;
    $('.mp-by', stage).textContent = m.artists;
    $('.mp-log', stage).textContent = m.logline;
    $('.mv-top b', stage).textContent = `No. ${m.no}`;
    $('.mv-top span', stage).textContent = m.cn;
    $('.mv-top em', stage).textContent = m.en;
    paintPill();
    stage.setAttribute('aria-label', `MV 放映：${m.no} · ${m.cn}（${m.en}）`);
    $$('.mv-card', root).forEach((c) => { c.classList.toggle('on', c.dataset.mvCard === cur); c.classList.toggle('playing', c.dataset.mvCard === cur && state === 'playing'); });
    $$('.mvi-toc button, .xn-go button', root).forEach((b) => b.classList.toggle('on', b.dataset.id === cur));
    const pb = $('[data-mv="prev"]', stage), nb = $('[data-mv="next"]', stage);
    pb.disabled = !prevId(cur); nb.disabled = !nextId(cur);
    marks();
    info();
    paintNow();
    mediaSession();
    el.end.innerHTML = '';
    el.end.classList.remove('count', 'stay', 'fin');
  }
  let infoFor = null;
  function info(force) {
    if (!el.info || !cur) return;
    const key = cur + '|' + (data[cur] ? 1 : 0) + '|' + form;
    if (!force && infoFor === key) return;
    const was = el.info.querySelector('[data-reveal].in');
    infoFor = key;
    unreveal(el.info);
    el.info.innerHTML = infoHTML();
    el.info._ch = null; // 章节高亮在下一次 tickUI 时重新标上
    if (was) $$('[data-reveal]', el.info).forEach((x) => x.classList.add('in'));
    reveal(el.info);
    expUI(exporting ? 'rec' : exp && exp.url && exp.id === cur ? 'done' : 'idle');
    paintFigs();
  }
  /** 人物小像：已生成的直接用，没生成的在空闲时画（角色库没加载前什么也不做，不提前触发加载） */
  function paintFigs() {
    if (!el.info || !cur || !(window.MVE && window.MVE.cast)) return;
    const m = meta(cur), id = cur;
    m.cast.forEach((c, i) => {
      figure(c).then((url) => {
        if (!url || id !== cur) return;
        const li = $(`.mi-c[data-fig="${i}"]`, el.info);
        const img = li && $('img', li);
        if (img && img.getAttribute('src') !== url) { img.onload = () => li.classList.add('ok'); img.src = url; }
      });
    });
  }
  function paintNow() {
    if (!el.now || !cur) return;
    const m = meta(cur);
    el.now.dataset.state = state;
    $('.mn-st b', el.now).textContent = STATE_LB[state] || '';
    $('.mn-no', el.now).textContent = m.no;
    $('.mn-cn', el.now).textContent = m.cn;
    $('.mn-en', el.now).textContent = m.en;
    hud();
  }
  function paintVol() {
    if (!el.volr) return;
    const v = muted ? 0 : vol;
    el.volr.value = String(Math.round(v * 100));
    el.volr.style.setProperty('--v', v.toFixed(3));
    const b = $('[data-mv="mute"]', stage);
    b.innerHTML = muted || vol === 0 ? I.mute : vol < 0.5 ? I.volLow : I.vol;
    b.setAttribute('aria-label', muted ? '取消静音（M）' : '静音（M）');
  }
  function paintToggles() {
    if (!stage) return;
    const c = $('[data-mv="cc"]', stage), a = $('[data-mv="auto"]', stage);
    c.setAttribute('aria-pressed', String(cc)); c.classList.toggle('on', cc);
    a.setAttribute('aria-pressed', String(auto)); a.classList.toggle('on', auto);
  }

  /* ---------------------------------------------------- 卡片悬停：几个镜头轮流闪过（只在悬停期间计时） */
  let reelT = 0, reelEl = null;
  function reelStart(shot) {
    const card = shot.closest('.mv-card'), id = card && card.dataset.mvCard, a = id && art[id];
    if (!a || !a.thumbs || a.thumbs.length < 2 || reduce) return;
    reelStop();
    reelEl = shot;
    const imgs = $$('.mc-reel img', shot);
    let i = 0, k = 0;
    const next = () => {
      const im = imgs[k % 2];
      im.onload = () => { imgs.forEach((x) => x.classList.toggle('on', x === im)); };
      im.src = a.thumbs[i % a.thumbs.length].url;
      i++; k++;
    };
    next();
    reelT = setInterval(next, 1100);
  }
  function reelStop() {
    clearInterval(reelT); reelT = 0;
    if (reelEl) $$('.mc-reel img', reelEl).forEach((x) => x.classList.remove('on'));
    reelEl = null;
  }

  /* ---------------------------------------------------- 可见性：靠近时加载，离远了释放；舞台看不见时停画、出迷你条 */
  let nearIO = null, visIO = null;
  function observe() {
    if (!nearIO) nearIO = new IntersectionObserver((ens) => {
      const en = ens[ens.length - 1];
      near = en.isIntersecting;
      clearTimeout(sleepT);
      if (near) wake();
      else sleepT = setTimeout(() => { if (!near) dropRenderers(); }, 20000);
    }, { rootMargin: '150% 0px' });
    nearIO.disconnect(); nearIO.observe(root);
    if (!visIO) visIO = new IntersectionObserver((ens) => {
      const en = ens[ens.length - 1];
      const was = vis;
      vis = en.isIntersecting; ratio = en.intersectionRatio;
      if (vis) { kick(); if (!playing && R && Rid === cur && drawnFor !== cur) requestStill(); }
      else halt();
      if (was !== vis && playing) { lastSec = -1; progress(); }
      miniSync();
    }, { threshold: [0, 0.3, 0.6] });
    visIO.disconnect(); visIO.observe(stage);
  }
  let libSeen = false;
  function wake() {
    lib().then(() => {
      // 角色库到了：人物名与简介换成角色库里的版本，并画出人物小像
      if (!libSeen) { libSeen = true; infoFor = null; info(); }
      if (!near) return;
      ensureRenderer().catch((e) => dlog('ensureRenderer', e));
      ric(() => makeArt(), 2500);
    }).catch((e) => dlog('wake', e)); /* 引擎没加载出来：保持占位，下次靠近时再试 */
  }
  let expHidden = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      halt();
      // 录制期间切到后台：画面停了、声音还在走，会录坏——先暂停，回来再接着录
      if (exporting && playing) { expHidden = true; pause({ quiet: true }); }
    } else {
      if (playing) { clockReset(audio.currentTime); kick(); }
      else if (exporting && expHidden) playCur();
      expHidden = false;
    }
  });
  let rzT = 0;
  addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (R) applyLevel(); }, 250); });
  // 关页面 / 切走时记下正在看的位置（下次来是“继续观看”）
  addEventListener('pagehide', () => { if (cur && playing && !exporting) { posMem[cur] = now(); savePos(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && cur && playing && !exporting) { posMem[cur] = now(); savePos(); } });

  /* ---------------------------------------------------- 与页面其他声音的协调 */
  audio.addEventListener('pause', () => { if (playing && !audio.ended) { pos = audio.currentTime; playing = false; halt(); siteAudio(false); if (cur && !exporting) { posMem[cur] = pos; savePos(); } setState('paused'); tickUI(pos, true); requestStill(); } });
  audio.addEventListener('playing', () => {
    if (stalled) { stalled = false; clockReset(audio.currentTime); }
    if (!playing && isSrc(audioId) && audioId === cur && !audio.paused) onPlaying();
  });
  audio.addEventListener('waiting', () => { if (playing && !stalled) { stalled = true; clockReset(audio.currentTime); } });
  audio.addEventListener('ended', onEnded);
  audio.addEventListener('seeked', () => { if (playing) clockReset(audio.currentTime); });
  audio.addEventListener('error', () => {
    if (!isSrc(audioId)) return; // 解锁用的空白声音
    const was = playing || wantPlay;
    playing = false; wantPlay = false; stalled = false; halt();
    if (was) { siteAudio(false); setState(pos > 0 ? 'paused' : 'poster'); }
    // 播放出错不提示：丢掉这份音频，下次点播放重新下载（边下边播出过错的这一部改为整段下载）
    const id = audioId;
    if (blobUrl[id]) try { URL.revokeObjectURL(blobUrl[id]); } catch (e) { /* 无妨 */ }
    if (srcUrl[id]) { delete srcUrl[id]; streamBad[id] = true; }
    delete blobUrl[id]; delete blobP[id]; audioId = null;
  });
  // 有人点开语音（语音区、首屏的“干员报到”……）：MV 先停下
  function bindVoice() {
    const v = window.AUDIO && AUDIO.voice;
    if (!v || v._mvBound) return;
    v._mvBound = true;
    v.addEventListener('play', () => { if (playing || wantPlay) pause(); });
  }

  /* ---------------------------------------------------- 区块渲染（main.js 的 SECTION_RENDER 调用；切换形态时重绘文字，舞台原封不动） */
  const fallbackHead = (no, en, zh, d) => `<div class="wrap"><div class="sec-head" data-reveal><span class="sec-no" data-n="${no}">${no}</span><div class="sec-tt"><p class="sec-en">${en}</p><h2 class="sec-title">${zh}</h2><p class="sec-desc">${d}</p></div><span class="sec-line"></span></div></div>`;
  function keepIn(slot, html) {
    const was = slot.querySelector('[data-reveal].in');
    unreveal(slot);
    slot.innerHTML = html;
    if (was) $$('[data-reveal]', slot).forEach((x) => x.classList.add('in'));
    reveal(slot);
  }
  /** 本区块自己重绘出来的 [data-reveal]（main.js 的揭示观察器只管它调用那一刻已有的元素） */
  let revIO = null;
  function reveal(scope) {
    if (!revIO) revIO = new IntersectionObserver((ens) => { for (const en of ens) if (en.isIntersecting) { en.target.classList.add('in'); revIO.unobserve(en.target); } }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('[data-reveal]:not(.in)', scope).forEach((x) => revIO.observe(x));
  }
  /** 重绘之前：还没揭示的旧节点先停止观察（观察器会一直引用已经移出文档的节点） */
  function unreveal(scope) { if (revIO) $$('[data-reveal]:not(.in)', scope).forEach((x) => revIO.unobserve(x)); }
  function build(host) {
    root = host;
    host.innerHTML = `<div class="mv-hd"></div>
      <div class="wrap mv">
        <div class="mv-intro-s"></div>
        <div class="mv-screen">
          <div class="mv-glow" aria-hidden="true"></div>
          <div class="mv-stage" tabindex="0" role="region" aria-roledescription="视频播放器" data-state="poster">${stageHTML()}</div>
          <i class="mv-cn tl" aria-hidden="true"></i><i class="mv-cn br" aria-hidden="true"></i>
        </div>
        <div class="mv-now" aria-live="off">${nowHTML()}</div>
        <div class="mv-list-s"></div>
        <div class="mv-info-s"></div>
        <p class="mv-keys" aria-hidden="true"><span><kbd>空格</kbd>播放 / 暂停</span><span><kbd>←</kbd><kbd>→</kbd>5 秒</span><span><kbd>J</kbd><kbd>L</kbd>10 秒</span><span><kbd>↑</kbd><kbd>↓</kbd>音量</span><span><kbd>M</kbd>静音</span><span><kbd>F</kbd>全屏</span><span><kbd>C</kbd>旁白字幕</span><span><kbd>N</kbd><kbd>P</kbd>下一部 / 上一部</span><span class="mv-keys-t">先点一下舞台</span></p>
      </div>`;
    stage = $('.mv-stage', host);
    canvas = $('.mv-cv', stage);
    el = {
      glow: $('.mv-glow', host), big: $('.mv-big', stage), bigT: $('.mv-big-t', stage), bigL: $('.mv-big-l b', stage), bigD: $('.mv-big-l em', stage), flash: $('.mv-flash', stage), end: $('.mv-end', stage),
      sfxL: $('.mv-sfx.l', stage), sfxR: $('.mv-sfx.r', stage), ctrl: $('.mv-ctrl', stage), bar: $('.mv-bar', stage), track: $('.mv-track', stage),
      fill: $('.mv-fill', stage), knobw: $('.mv-knobw', stage), marks: $('.mv-marks', stage), tip: $('.mv-tip', stage), tipCv: $('.mv-tipcv', stage),
      tipT: $('.mv-tipt', stage), tipC: $('.mv-tipc', stage), time: $('.mv-time', stage), chap: $('.mv-chap', stage), volr: $('.mv-volr', stage),
      sr: $('.mv-sr', stage), recbar: $('.mv-recbar', stage), now: $('.mv-now', host), nowCh: $('.mn-ch', host), hud: $('.mn-hud', host),
      info: $('.mv-info-s', host), list: $('.mv-list-s', host), intro: $('.mv-intro-s', host), hd: $('.mv-hd', host), mProg: el.mProg || null,
      saver: $('.mn-q', host),
    };
    bindStage();
    // 舞台自己接点击（伪全屏时它被挪到 <body> 下，区块的事件委托收不到）；区块只处理舞台以外的按钮
    stage.addEventListener('click', onAction);
    host.addEventListener('click', (e) => { if (!stage.contains(e.target)) onAction(e); });
    host.addEventListener('pointerover', (e) => { const s = e.pointerType === 'mouse' && e.target.closest && e.target.closest('.mc-shot'); if (s && s !== reelEl) reelStart(s); });
    host.addEventListener('pointerout', (e) => { const s = e.target.closest && e.target.closest('.mc-shot'); if (s && s === reelEl && !(e.relatedTarget && s.contains(e.relatedTarget))) reelStop(); });
    bindVoice();
    paintVol(); paintToggles();
    observe();
  }
  function render(host, f, c) {
    if (!host) return;
    if (c) ctx = c;
    form = f === 'alter' ? 'alter' : 'base';
    const fresh = root !== host || !host.querySelector('.mv-stage');
    if (fresh) build(host);
    // 还没动过播放器：跟着形态换推荐的那一部
    const want = !touched && !playing && !wantPlay ? FEATURED[form] : cur || FEATURED[form];
    const head = (ctx.head || fallbackHead)('05', 'MUSIC VIDEO', '影像', COPY.head[form]);
    keepIn(el.hd, head);
    keepIn(el.intro, introHTML());
    keepIn(el.list, listHTML());
    root.classList.toggle('f-alter', form === 'alter');
    if (want !== cur) {
      const t = touched; select(want); touched = t;
    } else { infoFor = null; paintFilm(); }
    for (const id of Object.keys(art)) applyArt(id);
    if (fresh) { setState(state); tickUI(pos, true); hud(); }
  }

  const api = { render };
  if (DEBUG) {
    window.__mvp = api;
    const def = (o) => Object.defineProperties(api, Object.getOwnPropertyDescriptors(o)); // 保留 getter（Object.assign 只会拷贝当时的值）
    def({
      get state() { return { cur, state, playing, pos: +pos.toFixed(2), now: +now().toFixed(3), dur, lv, floor, hdOK, fpsCap, saver, vis, ratio, near, raf: !!raf, exporting, canvas: canvas && [canvas.width, canvas.height], pf: pf.hist.slice(-8), stats: R && R.stats, art: Object.fromEntries(Object.entries(art).map(([k, v]) => [k, { poster: !!v.poster, thumbs: v.thumbs.length }])) }; },
      select, play: playCur, pause, seek, toggleFS, step, audio, get R() { return R; },
      exportTest: async (sec = 3) => { await expStart(); await wait(sec * 1000); if (exp) { exp.cancel = false; pause(); expFinish(); } await wait(800); return exp ? { size: exp.size, url: !!exp.url } : null; },
      clock: () => ({ now: now(), ct: audio.currentTime }),
    });
  }
  return api;
})();
