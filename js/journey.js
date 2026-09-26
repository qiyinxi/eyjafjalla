/* =========================================================
 * 04 足迹 · FOOTPRINTS —— 她在官方故事里走过的路，与陪她走过这些路的人
 * - 年表丝带：2018 → 2026 的登场、歌曲、时装与宣传（时装读自 D.forms，不重复录入）
 * - 登场记录：一条带羊蹄印的小路，按形态讲不同的一段（术师：早年；医疗：火山旅梦之后）
 *   路中间有一只「跟着你走」的小羊（position: sticky，零脚本）；滚动时进度线只改 transform
 * - 星图：以她为中心的关系网。静态 SVG 连线 + HTML 头像；漂浮、流光都是 transform / opacity 动画
 * 全部内容为本页对 PRTS Wiki（剧情、档案、语音、模组、邮件、活动页）的概述改写，不是原文。
 * 性能：动画只在各自的块进入视野时运行（.anim-off 闸门）；滚动监听只在小路可见时挂上，rAF 合并
 * ========================================================= */
window.JOURNEY = (() => {
  'use strict';
  const D = window.EYJA, A = window.ART;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------- 图片（media.prts.wiki，路径按文件名 md5 计算并逐一 HEAD 核对过） */
  const M = 'https://media.prts.wiki/';
  const P = {
    // 头像
    'av:艾雅法拉': 'c/cc/%E5%A4%B4%E5%83%8F_%E8%89%BE%E9%9B%85%E6%B3%95%E6%8B%89.png',
    'av:纯烬艾雅法拉': 'f/f0/%E5%A4%B4%E5%83%8F_%E7%BA%AF%E7%83%AC%E8%89%BE%E9%9B%85%E6%B3%95%E6%8B%89.png',
    'av:普罗旺斯': '7/72/%E5%A4%B4%E5%83%8F_%E6%99%AE%E7%BD%97%E6%97%BA%E6%96%AF.png',
    'av:天火': 'f/fa/%E5%A4%B4%E5%83%8F_%E5%A4%A9%E7%81%AB.png',
    'av:地灵': '5/57/%E5%A4%B4%E5%83%8F_%E5%9C%B0%E7%81%B5.png',
    'av:慕斯': 'f/fc/%E5%A4%B4%E5%83%8F_%E6%85%95%E6%96%AF.png',
    'av:古米': '0/07/%E5%A4%B4%E5%83%8F_%E5%8F%A4%E7%B1%B3.png',
    'av:霜叶': '2/29/%E5%A4%B4%E5%83%8F_%E9%9C%9C%E5%8F%B6.png',
    'av:锡兰': '3/39/%E5%A4%B4%E5%83%8F_%E9%94%A1%E5%85%B0.png',
    'av:诗怀雅': '5/50/%E5%A4%B4%E5%83%8F_%E8%AF%97%E6%80%80%E9%9B%85.png',
    'av:琳琅诗怀雅': '7/74/%E5%A4%B4%E5%83%8F_%E7%90%B3%E7%90%85%E8%AF%97%E6%80%80%E9%9B%85.png',
    'av:苍苔': '9/95/%E5%A4%B4%E5%83%8F_%E8%8B%8D%E8%8B%94.png',
    'av:雪雉': '2/24/%E5%A4%B4%E5%83%8F_%E9%9B%AA%E9%9B%89.png',
    'av:伊芙利特': 'e/ed/%E5%A4%B4%E5%83%8F_%E4%BC%8A%E8%8A%99%E5%88%A9%E7%89%B9.png',
    'av:薄绿': '3/30/%E5%A4%B4%E5%83%8F_%E8%96%84%E7%BB%BF.png',
    'av:蜜蜡': '1/1d/%E5%A4%B4%E5%83%8F_%E8%9C%9C%E8%9C%A1.png',
    'av:铸铁': '8/84/%E5%A4%B4%E5%83%8F_%E9%93%B8%E9%93%81.png',
    'av:苏苏洛': '6/63/%E5%A4%B4%E5%83%8F_%E8%8B%8F%E8%8B%8F%E6%B4%9B.png',
    'av:凯尔希': 'c/c5/%E5%A4%B4%E5%83%8F_%E5%87%AF%E5%B0%94%E5%B8%8C.png',
    'av:阿米娅': '3/36/%E5%A4%B4%E5%83%8F_%E9%98%BF%E7%B1%B3%E5%A8%85.png',
    'av:安洁莉娜': 'c/ca/%E5%A4%B4%E5%83%8F_%E5%AE%89%E6%B4%81%E8%8E%89%E5%A8%9C.png',
    'av:星熊': '0/07/%E5%A4%B4%E5%83%8F_%E6%98%9F%E7%86%8A.png',
    'av:红': 'a/ac/%E5%A4%B4%E5%83%8F_%E7%BA%A2.png',
    'av:蓝毒': '6/63/%E5%A4%B4%E5%83%8F_%E8%93%9D%E6%AF%92.png',
    'av:芳汀': '6/6a/%E5%A4%B4%E5%83%8F_%E8%8A%B3%E6%B1%80.png',
    'av:三角初华': 'b/b4/%E5%A4%B4%E5%83%8F_%E4%B8%89%E8%A7%92%E5%88%9D%E5%8D%8E.png',
    // 半身像
    'hf:艾雅法拉': '3/36/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E8%89%BE%E9%9B%85%E6%B3%95%E6%8B%89_1.png',
    'hf:纯烬艾雅法拉': 'b/bd/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E7%BA%AF%E7%83%AC%E8%89%BE%E9%9B%85%E6%B3%95%E6%8B%89_1.png',
    'hf:普罗旺斯': '9/9a/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E6%99%AE%E7%BD%97%E6%97%BA%E6%96%AF_1.png',
    'hf:天火': '1/1d/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E5%A4%A9%E7%81%AB_1.png',
    'hf:地灵': '0/0e/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E5%9C%B0%E7%81%B5_1.png',
    'hf:慕斯': '9/9d/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E6%85%95%E6%96%AF_1.png',
    'hf:古米': 'd/d3/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E5%8F%A4%E7%B1%B3_1.png',
    'hf:霜叶': '1/11/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E9%9C%9C%E5%8F%B6_1.png',
    'hf:锡兰': 'a/a9/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E9%94%A1%E5%85%B0_1.png',
    'hf:诗怀雅': 'f/ff/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E8%AF%97%E6%80%80%E9%9B%85_1.png',
    'hf:琳琅诗怀雅': '9/99/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E7%90%B3%E7%90%85%E8%AF%97%E6%80%80%E9%9B%85_1.png',
    'hf:苍苔': '1/1d/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E8%8B%8D%E8%8B%94_1.png',
    'hf:雪雉': 'f/fd/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E9%9B%AA%E9%9B%89_1.png',
    'hf:伊芙利特': '2/23/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E4%BC%8A%E8%8A%99%E5%88%A9%E7%89%B9_1.png',
    'hf:薄绿': '6/6b/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E8%96%84%E7%BB%BF_1.png',
    'hf:蜜蜡': '9/9b/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E8%9C%9C%E8%9C%A1_1.png',
    'hf:铸铁': '9/93/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E9%93%B8%E9%93%81_1.png',
    'hf:苏苏洛': '7/79/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E8%8B%8F%E8%8B%8F%E6%B4%9B_1.png',
    'hf:凯尔希': 'c/c0/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E5%87%AF%E5%B0%94%E5%B8%8C_1.png',
    'hf:阿米娅': 'a/a0/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E9%98%BF%E7%B1%B3%E5%A8%85_1.png',
    'hf:安洁莉娜': '3/30/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E5%AE%89%E6%B4%81%E8%8E%89%E5%A8%9C_1.png',
    'hf:蓝毒': 'a/ac/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E8%93%9D%E6%AF%92_1.png',
    'hf:芳汀': 'd/dc/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E8%8A%B3%E6%B1%80_1.png',
    'hf:三角初华': '4/4b/%E5%8D%8A%E8%BA%AB%E5%83%8F_%E4%B8%89%E8%A7%92%E5%88%9D%E5%8D%8E_1.png',
    // 剧情角色立绘（全身，透明底）
    'npc:凯勒': '8/8c/Avg_avg_npc_999_1-1%241.png',
    'npc:卡恩': 'a/a9/Avg_avg_npc_996_1-1%241.png',
    'npc:多利': '7/7e/Avg_avg_npc_1014_1%241.png',
    'npc:伯德': 'd/d3/Avg_avg_npc_993_1-1%241.png',
    'npc:科斯达': '8/83/Avg_avg_npc_997_1-1%241.png',
    // 活动主视觉
    'kv:如我所见': 'd/d6/%E6%B4%BB%E5%8A%A8%E9%A2%84%E5%91%8A_%E5%A6%82%E6%88%91%E6%89%80%E8%A7%81_01.jpg',
    'kv:火蓝之心': '3/34/%E6%B4%BB%E5%8A%A8%E9%A2%84%E5%91%8A-%E7%81%AB%E8%93%9D%E4%B9%8B%E5%BF%83%E6%B4%BB%E5%8A%A8.png',
    'kv:多索雷斯假日': '5/55/%E6%B4%BB%E5%8A%A8%E9%A2%84%E5%91%8A_%E5%A4%8F%E6%97%A5%E5%98%89%E5%B9%B4%E5%8D%8E_02.jpg',
    'kv:无忧梦呓': '3/3f/%E6%B4%BB%E5%8A%A8%E9%A2%84%E5%91%8A_%E6%97%A0%E5%BF%A7%E6%A2%A6%E5%91%93_01.jpg',
    'kv:尘影余音': '4/47/%E6%B4%BB%E5%8A%A8%E9%A2%84%E5%91%8A_%E5%B0%98%E5%BD%B1%E4%BD%99%E9%9F%B3_01.jpg',
    'kv:火山旅梦': '1/1c/%E6%B4%BB%E5%8A%A8%E9%A2%84%E5%91%8A_%E5%A4%8F%E6%B4%BB2023_02.jpg',
    'kv:火山旅梦复刻': 'e/ee/%E6%B4%BB%E5%8A%A8%E9%A2%84%E5%91%8A_%E7%81%AB%E5%B1%B1%E6%97%85%E6%A2%A62024_01.jpg',
    'kv:云间清醒梦': '6/69/%E4%BA%91%E9%97%B4%E6%B8%85%E9%86%92%E6%A2%A6.jpg',
    'kv:梦源之地': '6/6f/%E9%9F%B3%E5%BE%8B%E8%81%94%E8%A7%89_kv_%E6%A2%A6%E6%BA%90%E4%B9%8B%E5%9C%B0.jpg',
    'logo:火山旅梦': 'b/b7/%E6%B4%BB%E5%8A%A8%E5%90%8D%E7%A7%B0_%E7%81%AB%E5%B1%B1%E6%97%85%E6%A2%A6.png',
    // 剧情 CG 与剧情背景
    'cg:41_i02': '9/95/Avg_41_i02.png', 'cg:41_i03': '9/91/Avg_41_i03.png', 'cg:41_i05': '2/2d/Avg_41_i05.png',
    'cg:41_i06': '7/77/Avg_41_i06.png', 'cg:41_i07': '8/8e/Avg_41_i07.png', 'cg:41_i08': 'e/e0/Avg_41_i08.png',
    'cg:41_i10': 'd/dc/Avg_41_i10.png', 'cg:41_i13': '6/69/Avg_41_i13_1.png',
    'cg:ac3_volcano': '4/4b/Avg_ac3_volcano.png', 'cg:ac3_report': '1/17/Avg_ac3_report.png',
    'bg:bridge': 'e/ef/Avg_bg_bg_bridge.png', 'bg:rhodescom': '5/53/Avg_bg_bg_rhodescom.png', 'bg:room_2': '4/48/Avg_bg_bg_room_2.png',
    'bg:laccolith': 'b/b9/Avg_bg_bg_laccolith.png', 'bg:desert_3': 'd/d2/Avg_bg_bg_desert_3.png', 'bg:caveentrance': '3/38/Avg_bg_bg_caveentrance.png',
    'bg:wilderness_n': 'a/a7/Avg_bg_bg_wilderness_n.png', 'bg:skystarry': 'f/fc/Avg_bg_38_g21_skystarry_L2.png',
    'bg:islandharbor': '0/0c/Avg_bg_65_g3_islandharbor.png', 'bg:livingroom': '8/86/Avg_bg_34_g6_noblelivingroom.png',
    'bg:siesta_night': '8/8f/Avg_bg_41_g4_siestanewstreet_n.png', 'bg:mountainside': '5/57/Avg_bg_41_g11_volcanomountainside.png',
    'bg:museum': '4/4b/Avg_bg_41_g8_siestavolcanomuseum_inside.png',
    'it:熔岩蛋糕': '9/9e/%E9%81%93%E5%85%B7_%E5%B8%A6%E6%A1%86_%E7%81%AB%E5%B1%B1%E7%86%94%E5%B2%A9%E8%9B%8B%E7%B3%95.png',
  };
  /** 服务端缩图：webp，按显示宽度取（半透明的剧情立绘也保留透明通道） */
  const u = (k, w, q = 80) => (P[k] ? `${M}${P[k]}?image_process=resize,w_${w}/format,webp/quality,Q_${q}` : '');
  const srcset = (k, ws) => ws.map((w) => `${u(k, w)} ${w}w`).join(', ');
  const IMG_ATTR = 'loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" onerror="this.classList.add(\'err\')"';

  /* ---------------------------------------------------- 小图标 */
  const svg = (inner, vb = '0 0 24 24', cls = 'ico') => `<svg class="${cls}" viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const HOOF = '<path d="M5.4 1.2C3.2 1.6 1.8 4.6 2.1 7.6c.2 2.3 1.5 3.4 2.7 3 .8-.3 1-1.3 1-2.4V1.6z"/><path d="M6.6 1.2c2.2.4 3.6 3.4 3.3 6.4-.2 2.3-1.5 3.4-2.7 3-.8-.3-1-1.3-1-2.4V1.6z"/>';
  const hoof = (cls = '') => `<svg class="hoof ${cls}" viewBox="0 0 12 12" aria-hidden="true">${HOOF}</svg>`;
  const ICO = {
    moons: '<path d="M8.5 3.2a4.6 4.6 0 1 0 4.1 6.6 3.7 3.7 0 0 1-4.1-6.6z"/><path d="M16.2 3.6a4.2 4.2 0 1 0 3.9 6 3.4 3.4 0 0 1-3.9-6z"/><path d="M12 14.2l1 2.3 2.4.3-1.8 1.6.5 2.4-2.1-1.2-2.1 1.2.5-2.4-1.8-1.6 2.4-.3z"/>',
    hood: '<path d="M5 20c0-6 2.5-12 7-14 4.5 2 7 8 7 14"/><path d="M8.2 20c.4-3.6 1.8-6.4 3.8-7.6 2 1.2 3.4 4 3.8 7.6"/><path d="M4 20h16"/>',
    shield: '<path d="M12 3l7 3v5c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    garland: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="5.5" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/><circle cx="12" cy="18.5" r="1.6"/><circle cx="5.5" cy="12" r="1.6"/><circle cx="16.6" cy="7.4" r="1.2"/><circle cx="7.4" cy="16.6" r="1.2"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
    cap: '<path d="M6 9h12l-1 9H7z"/><path d="M5 9h14"/><path d="M7 9V7.5h10V9"/><path d="M9 12v3M12 12v3M15 12v3"/>',
    coat: '<path d="M8 3l-4 3 1.5 5 2-1V21h9V10l2 1L20 6l-4-3c-.8 1.6-2.2 2.4-4 2.4S8.8 4.6 8 3z"/><path d="M12 5.4V21"/><path d="M9.5 15.5l1.4-.8M14 13.4l1.2.9"/>',
    flower: '<circle cx="12" cy="9" r="2.2"/><path d="M12 6.8C11 4 13 2.6 14 4.6M14.2 9c2.8-1 4.2 1 2.2 2M12 11.2c1 2.8-1 4.2-2 2.2M9.8 9C7 10 5.6 8 7.6 7"/><path d="M12 11.5V21M12 17c-2.6 0-4-1.6-4.4-3.4 2.4-.2 3.9.9 4.4 3.4z"/>',
    radio: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l9-5"/><circle cx="8.5" cy="14" r="2.6"/><path d="M14 12h4M14 15h4M14 18h2"/>',
    tape: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8" cy="11" r="2.2"/><circle cx="16" cy="11" r="2.2"/><path d="M8 13.2h8M6 19l1.6-3.4h8.8L18 19"/>',
    letter: '<rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="M3 7l9 6 9-6"/>',
    piano: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7.5 5v14M12 5v14M16.5 5v14"/><path d="M6 5v7h3V5M10.5 5v7h3V5M15 5v7h3V5" fill="currentColor" stroke="none"/>',
    rec: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
    note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    mask: '<path d="M4 7c3-2 13-2 16 0 0 6-3 10-8 10S4 13 4 7z"/><path d="M8 10.5c1 .7 2 .7 3 0M13 10.5c1 .7 2 .7 3 0"/>',
    stage: '<path d="M3 20h18M5 20V9M19 20V9"/><path d="M3 9c3 2 6 2 9 0 3 2 6 2 9 0"/><path d="M3 5h18"/>',
    cake: '<path d="M4 12h16v8H4z"/><path d="M4 15c3 2 5-2 8 0s5-2 8 0"/><path d="M12 12V8"/><path d="M12 4c1 1.4 1 2.4 0 3-1-.6-1-1.6 0-3z"/>',
    sprout: '<path d="M12 21V11"/><path d="M12 13c-5 0-7-3-7-7 4 0 7 3 7 7zM12 11c0-4 3-7 7-7 0 4-3 7-7 7z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    book: '<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6v14"/>',
    play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>',
    pin: '<path d="M12 21s-6-5.4-6-10a6 6 0 1 1 12 0c0 4.6-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  };
  const ico = (n) => svg(ICO[n] || '');

  /* ====================================================
   * 人物（两个形态共用同一张名册；各形态的星图只取其中一部分，说法也按那段时期写）
   * av：头像键；hf：详情里的半身像；npc：剧情立绘（全身，用 --fx/--fy/--fz 裁出脸）；icon：没有立绘时画一个
   * ==================================================== */
  const PEOPLE = {
    parents: { name: '玛格娜 & 卡提亚', short: '爸爸妈妈', icon: 'moons' },
    sheep: { name: '小黑羊', short: '小黑羊', sheep: 'black' },
    lambs: { name: '看不见的小羊', short: '小羊们', sheep: 'pink' },
    dolly: { name: '多利', short: '多利', npc: 'npc:多利', face: [50, 44, 1.9], role0: '羊之兽主' },
    doctor: { name: '博士', short: '博士', icon: 'hood' },
    kaltsit: { name: '凯尔希', short: '凯尔希', av: 'av:凯尔希', hf: 'hf:凯尔希' },
    amiya: { name: '阿米娅', short: '阿米娅', av: 'av:阿米娅', hf: 'hf:阿米娅' },
    kahn: { name: '卡恩', short: '卡恩', npc: 'npc:卡恩', face: [47, 12, 4.2] },
    keller: { name: '阿黛尔·凯勒', short: '凯勒', npc: 'npc:凯勒', face: [50, 10, 4.4] },
    earthspirit: { name: '地灵', short: '地灵', av: 'av:地灵', hf: 'hf:地灵' },
    provence: { name: '普罗旺斯', short: '普罗旺斯', av: 'av:普罗旺斯', hf: 'hf:普罗旺斯' },
    skyfire: { name: '天火', short: '天火', av: 'av:天火', hf: 'hf:天火' },
    mousse: { name: '慕斯', short: '慕斯', av: 'av:慕斯', hf: 'hf:慕斯' },
    gummy: { name: '古米', short: '古米', av: 'av:古米', hf: 'hf:古米' },
    frostleaf: { name: '霜叶', short: '霜叶', av: 'av:霜叶', hf: 'hf:霜叶' },
    ceylon: { name: '锡兰', short: '锡兰', av: 'av:锡兰', hf: 'hf:锡兰' },
    ifrit: { name: '伊芙利特', short: '伊芙利特', av: 'av:伊芙利特', hf: 'hf:伊芙利特' },
    mint: { name: '薄绿', short: '薄绿', av: 'av:薄绿', hf: 'hf:薄绿' },
    beeswax: { name: '蜜蜡', short: '蜜蜡', av: 'av:蜜蜡', hf: 'hf:蜜蜡' },
    batty: { name: '巴蒂', short: '巴蒂', icon: 'shield' },
    fontaine: { name: '芳汀', short: '芳汀', av: 'av:芳汀', hf: 'hf:芳汀' },
    sideroca: { name: '铸铁', short: '铸铁', av: 'av:铸铁', hf: 'hf:铸铁' },
    sussurro: { name: '苏苏洛', short: '苏苏洛', av: 'av:苏苏洛', hf: 'hf:苏苏洛' },
    red: { name: '红', short: '红', av: 'av:红' },
    hoshiguma: { name: '星熊', short: '星熊', av: 'av:星熊' },
    swire: { name: '诗怀雅', short: '诗怀雅', av: 'av:诗怀雅', hf: 'hf:诗怀雅' },
    swire2: { name: '诗怀雅', short: '诗怀雅', av: 'av:琳琅诗怀雅', hf: 'hf:琳琅诗怀雅' },
    snowsant: { name: '雪雉', short: '雪雉', av: 'av:雪雉', hf: 'hf:雪雉' },
    hatsuka: { name: '三角初华', short: '初华', av: 'av:三角初华', hf: 'hf:三角初华' },
    angelina: { name: '安洁莉娜', short: '安洁莉娜', av: 'av:安洁莉娜', hf: 'hf:安洁莉娜' },
    bluepoison: { name: '蓝毒', short: '蓝毒', av: 'av:蓝毒', hf: 'hf:蓝毒' },
    ennis: { name: '埃尼斯', short: '埃尼斯', av: 'av:苍苔', hf: 'hf:苍苔', alias: '苍苔' },
    costa: { name: '科斯达', short: '科斯达', npc: 'npc:科斯达', face: [52, 11, 4.4] },
    bird: { name: '伯德', short: '伯德', npc: 'npc:伯德', face: [44, 11, 4.2] },
    hope: { name: '小藿普', short: '小藿普', icon: 'garland' },
  };

  /* 环：0 家人 · 1 师长与前辈 · 2 罗德岛 · 3 旅途 */
  const RINGS = [
    { k: 'fam', zh: '家人', en: 'FAMILY', r: 0.37 },
    { k: 'eld', zh: '师长与前辈', en: 'MENTORS', r: 0.61 },
    { k: 'ri', zh: '罗德岛', en: 'RHODES ISLAND', r: 0.86 },
    { k: 'trip', zh: '旅途', en: 'ON THE ROAD', r: 0.86 },
  ];

  /* ----------------------------------------------------
   * 星图节点。a：角度（0 = 右，90 = 下）；call：[她怎么叫对方, 对方怎么叫她]；
   * text：一两句话的关系说明（概述改写）；src：出处；stops：同框的足迹；voice：[语音目录, 序号, 这句话的大意]
   * ---------------------------------------------------- */
  const CHAR = { base: 'char_180_amgoat', alter: 'char_1016_agoat2' };
  const WEB = {
    base: [
      { id: 'parents', ring: 0, a: 250, role: '父母 · 威廉大学的学者', call: ['爸爸 · 妈妈', '阿黛尔'],
        text: '父亲是源石技艺学院的教授，母亲研究自然环境与生态；两人共同起草了一项泰拉天灾调查项目，火山是其中的重点。一次火山实地考察中，他们遭遇碎屑流，再没有回来。她带上罗德岛、最珍视的，是他们留下的火山学报告。',
        src: '档案资料二 · 模组「错过的声音」', stops: ['r2'], voice: ['base', 6, '说起父母遭遇的那场碎屑流，和她要继承的学说'] },
      { id: 'sheep', ring: 0, a: 286, role: '妈妈留下的礼物', call: ['小黑羊', ''],
        text: '温顺迟缓，最爱找个宽敞地方睡觉，会帮她搬书、递东西，还能当枕头。平时几乎不见踪影，只在吃草或被需要时忽然出现；生气或高兴时会烫得吓人——档案里还特意拿它和慕斯的「猫猫」做了对照。',
        src: '晋升记录 · 语音「精英化晋升2」', stops: [], voice: ['base', 14, '提醒前辈：不戴隔热手套摸小羊会被烫伤'] },
      { id: 'doctor', ring: 1, a: 177, role: '天灾研究的「前辈」', call: ['前辈', '艾雅法拉'], addr: '前辈',
        text: '全舰只有她管博士叫「前辈」——在天灾研究上，博士确实是她的前辈。是博士特批了她加入行动部门的申请，还把一本自己写的天灾研究笔记交到她手里。录音的最后她说，心里「学者」的样子，如今又多了一位。',
        src: '语音「交谈1」· 如我所见 · 干员密录「学者之心」', stops: ['vi', 'r1'], voice: ['base', 2, '解释为什么要叫博士「前辈」'] },
      { id: 'kahn', ring: 1, a: 228, role: '远方的守护者', call: ['', '瑙曼小姐 · 阿黛尔'],
        text: '母亲最欣赏的学生。自己困在莱塔尼亚脱不开身，便托凯尔希找到曾受他帮助的巴蒂，请他在外勤里替自己看着她——他担心的不只是她的病，还有父母那些研究招来的目光。',
        src: '干员密录「火山」', stops: ['r2'] },
      { id: 'kaltsit', ring: 1, a: 126, role: '主治 · 定期检查', call: ['凯尔希医生', ''], addr: '医生',
        text: '做完前辈安排的工作，她还要抽空去凯尔希那里检查；也是从凯尔希口中，她得知自己的视力同样在慢慢丧失。卡恩那封请人照看她的信，也是经凯尔希转交的。',
        src: '语音「交谈3」「信赖提升后交谈2」· 干员密录「火山」', stops: ['vi', 'r2'], voice: ['base', 4, '说起要抽空去凯尔希医生那里做检查'] },
      { id: 'earthspirit', ring: 1, a: 23, role: '同族的前辈 · 地质学家', call: ['地灵前辈', '阿黛尔'], addr: '前辈',
        text: '同是莱塔尼亚出身的卡普里尼，地质学家兼天灾信使，工作上对这个同族后辈多有照顾，还教她弹琴。微风说，她从前整天跟在地灵身后「前辈、前辈」地喊。',
        src: '地灵档案 · 干员密录「额外的工作」· 艾丝黛尔密录', stops: ['vi', 'es'] },
      { id: 'provence', ring: 2, a: 61, role: '天灾信使 · 同行', call: ['普罗旺斯姐姐', '艾雅法拉'], addr: '姐姐',
        text: '火蓝之心里，是她在汐斯塔火山脚下替艾雅法拉采回岩样，又隔着通讯线听完了那四十分钟的分析；后来在洞窟深处撞见一只大得离谱的源石虫时，她说自己有点想念艾雅法拉了。',
        src: 'OF-ST2 冲破藩篱 · OF-8 汐斯塔狂想曲 · 地灵密录', stops: ['of', 'es'] },
      { id: 'skyfire', ring: 2, a: 87, role: '学姐 · 源石技艺学者', call: ['天火学姐', '艾雅法拉'], addr: '学姐',
        text: '火蓝之心里带着她事先准备好的检测符文上山；听完那四十分钟的分析，连一向骄傲的天火也说自己「重新上了一课」。',
        src: 'OF-1 火山制造 · OF-ST2 冲破藩篱', stops: ['of'] },
      { id: 'ceylon', ring: 2, a: 113, role: '学者懂学者', call: ['锡兰小姐', '艾雅法拉'], addr: '小姐',
        text: '在汐斯塔第一次听她讲火山，恨不得拿笔全部记下来；后来加入了罗德岛医疗部。所有人都反对她带病出外勤时，是锡兰说了一句「让她去吧」——时间不多、真相还远，所以才更要抓紧。',
        src: 'OF-ST2 冲破藩篱 · 干员密录「学者之心」', stops: ['of', 'r1'] },
      { id: 'ifrit', ring: 2, a: 138, role: '小队长', call: ['伊芙利特', '慢吞吞的小羊'],
        text: '第一次当队长，就是护送她去洞窟做地质探查。虫潮里一边喊她「慢吞吞的小羊」，一边说撑不住就扛着她走；她则拦住了想放火的队长——岩层太松，会塌。',
        src: '伊芙利特 干员密录「小队长」', stops: ['ifr'] },
      { id: 'mint', ring: 2, a: 164, role: '叫她「前辈」的后辈', call: ['', '艾雅法拉前辈'],
        text: '跟着她一起下洞窟、喊她「艾雅法拉前辈」的薄绿，说和她聊天总能冒出新灵感；地质层的深层分析终于做出来时，最想炫耀的一件事，是连艾雅法拉小姐都夸了她。',
        src: '薄绿语音 · 薄绿密录 · 伊芙利特密录', stops: ['ifr'] },
      { id: 'batty', ring: 2, a: 216, role: '外勤护卫', call: ['巴蒂先生', '艾雅法拉小姐'], addr: '先生',
        text: '一路替她挡风、搬设备、防着落石，嘴上总念叨「别勉强」。受恩人卡恩所托，他也在暗中留意她的近况；给卡恩的回信里他说，这份担心也许多余——她的心是被岩浆炼过的。',
        src: '干员密录「学者之心」「火山」', stops: ['r1', 'r2'] },
      { id: 'fontaine', ring: 2, a: 241, role: '大学同窗', call: ['', ''],
        text: '两人在大学里选修过同一位知名教授的课——芳汀的档案说，勉强算得上有同窗之谊；比起拉特兰同乡，他和几位莱塔尼亚干员反倒更聊得来。',
        src: '芳汀档案', stops: [] },
      { id: 'mousse', ring: 2, a: 267, role: '好朋友', call: ['慕斯', ''], addr: '名字',
        text: '她说自己和慕斯她们处得很好，一点也不寂寞，还想借前辈的办公室办一场读书会。前辈生日那天的熔岩蛋糕，也是她向古米和慕斯请教着做出来的。',
        src: '语音「信赖提升后交谈1」「生日」', stops: [], voice: ['base', 7, '说起和慕斯她们关系很好，想办读书会'] },
      { id: 'gummy', ring: 2, a: 293, role: '熔岩蛋糕的老师', call: ['古米', ''], addr: '名字',
        text: '教她做熔岩蛋糕的人之一——切开会流出巧克力的那种，取名和灵感都来自火山。',
        src: '语音「生日」', stops: [], voice: ['base', 43, '给前辈端来切开会流出巧克力的熔岩蛋糕'] },
      { id: 'amiya', ring: 2, a: 190, role: '罗德岛的领袖', call: ['阿米娅小姐', ''], addr: '小姐',
        text: '她递交加入行动部门的申请时，大家都说博士和阿米娅一定会因为她的病情拒绝——最后是博士说服了阿米娅。',
        src: '故事集「如我所见」· 我不会全部遗忘', stops: ['vi'] },
      { id: 'hatsuka', ring: 3, a: 318, role: '梦里的邻居', call: ['初华小姐', '艾雅法拉'], addr: '小姐',
        text: '三角初华梦中的小岛上，初华替她做听力测试、陪她看星星；是她读出初华没说出口的心愿，推着初华去找那个一直在等的人。',
        src: '无忧梦呓 · SS-4 名为客房区的迷宫', stops: ['mu'] },
      { id: 'swire', ring: 3, a: 344, role: '初次见面', call: ['', '艾雅法拉'],
        text: '在多索雷斯的看台上第一次见到她。听说艾雅法拉也来了，诗怀雅说一直没机会见面、这回可得好好认识一下——坐下没多久，就拉着她试起了面霜。',
        src: 'DH-5 曲径求胜 · DH-6 紧追猛赶', stops: ['dh'] },
      { id: 'sideroca', ring: 3, a: 10, role: '假期的发起人', call: ['', '我们艾雅法拉'],
        text: '在玻利瓦尔出完任务、顺道陪她做完地质考察，是铸铁给小队申请了多索雷斯的假期：博士那边都在度假了，「我们艾雅法拉」也该歇一歇。',
        src: 'DH-4 铁人三项 · DH-5 曲径求胜', stops: ['dh'] },
      { id: 'sussurro', ring: 3, a: 36, role: '随行的医生', call: ['', '艾雅法拉小姐'],
        text: '以医生的身份赞成带她出来：她比谁都更久待在室内，这对身体和精神都不好——每个人都应该拥有享受阳光的权利。',
        src: 'DH-4 铁人三项 行动前', stops: ['dh'] },
    ],
    alter: [
      { id: 'parents', ring: 0, a: 270, role: '父母 · 1051 / 1053 — 1095', call: ['爸爸 · 妈妈', '小阿黛尔'],
        text: '在汐斯塔的咖啡馆里拉着一个写论文的学生去爬火山；喜欢亮色的挂饰，会在流淌的岩浆边扎营。她过生日那天，他们指着天上的双月和下方最亮的那颗星说：像我们三个。',
        src: '火山旅梦 · 干员密录「夜色中的第一步」', stops: ['sl', 'uno', 'after'], voice: ['alter', 3, '说起妈妈防护服袖口那道灼痕的来历'] },
      { id: 'dolly', ring: 0, a: 218, role: '羊之兽主 · 父母的老朋友', call: ['多利先生', '孩子 · 阿黛尔'], addr: '先生',
        text: '她身边的小黑羊，其实是多利受瑙曼夫妇之托留下的分身。多利爱在沸腾的岩浆里冲浪，说这是世上第二快乐的事；在汐斯塔，他用一场寻宝游戏，换她一个真正开心的夏天。',
        src: '火山旅梦 · PRTS 剧情角色', stops: ['sl', 'rerun'], voice: ['char_1016_agoat2_epoque__34', 2, '（时装语音）一眼看穿：前辈兜帽里藏着小羊，一定又是多利的恶作剧'] },
      { id: 'lambs', ring: 0, a: 322, role: '只有被选中的人才看得见', call: ['小羊', ''],
        text: '舰上接连出现冰淇淋失踪、玩具乱飞、唱片被抢的怪事，医疗部的档案结论被一大串蹄印盖住了。她只好一边挨个道歉，一边领着大家去摸那些看不见的小家伙——看得出，她也有些乐在其中。',
        src: '档案资料二 · 语音「交谈1」', stops: ['sl', 'uno'], voice: ['alter', 2, '提醒小羊别站在博士头上，再手把手教前辈摸到它'] },
      { id: 'keller', ring: 1, a: 244, role: '恩师 · 汐斯塔火山博物馆馆长', call: ['凯勒老师', '阿黛尔'], addr: '老师',
        text: '当年在知更鸟咖啡店被瑙曼夫妇拉去爬火山的地质系学生，此后一路同行；乌纳火山考察的前一天，她为替两人挡下莱塔尼亚的使者离开了队伍，从此背着自责。阿黛尔从没怀疑过她——后来在一封旧信的落款里发现，老师的名字也叫阿黛尔。',
        src: '火山旅梦 · 档案资料三', stops: ['sl', 'tape'], voice: ['alter', 8, '笑着说卡恩前辈来信生气：她和凯勒老师没做防护就在硫酸湖上划了船'] },
      { id: 'kahn', ring: 1, a: 296, role: '母亲最欣赏的学生', call: ['卡恩前辈', '阿黛尔'], addr: '前辈',
        text: '当年帮她争取到罗德岛的医疗条件，又独自追查瑙曼夫妇离世的真相多年，甚至在喷发前夕的火山上当面质问凯勒。误会解开后，他会因为她们在硫酸湖上划船写信来生气；她则写信感谢他，说想听他讲讲爸爸妈妈当年的趣事。',
        src: '档案资料三 · 火山旅梦 · 语音「信赖提升后交谈2」', stops: ['sl', 'tape'] },
      { id: 'doctor', ring: 1, a: 170, role: '前辈', call: ['前辈', ''], addr: '前辈',
        text: '她已经能纠正博士比错的手语了——有一回，博士比出来的意思是「我已经被火山压住了」。生日时她送来一枚黑曜石胸针：石头来自前辈还没登过的火山，剩下的半份礼物，要自己爬上山顶去拿。',
        src: '语音「信赖提升后交谈3」「生日」· 新春邮件', stops: ['mail'], voice: ['alter', 9, '换助听器电池时，顺手纠正了前辈比错的手语'] },
      { id: 'kaltsit', ring: 2, a: 192, role: '回舰后先去见的人', call: ['凯尔希医生', ''], addr: '医生',
        text: '从汐斯塔回来的那天，她带了一堆礼物，说等下就拿去送给凯尔希医生和阿米娅；还有这次火山喷发得来的新数据和标本，要拉前辈一起看。',
        src: '语音「干员报到」', stops: [], voice: ['alter', 11, '回舰报到：给大家带了礼物，还有汐斯塔火山的新数据'] },
      { id: 'provence', ring: 2, a: 120, role: '仍在大地上奔走', call: ['普罗旺斯姐姐', ''], addr: '姐姐',
        text: '她回舰那天的欢迎会上，普罗旺斯和安洁莉娜的礼花筒出了差错，推倒了一整座布偶山，小羊们又不知从哪儿窜了出来——录音带的第五轨，就是那一片笑声。',
        src: '模组「想要留住的声音」· 语音「信赖提升后交谈1」', stops: ['tape'] },
      { id: 'angelina', ring: 2, a: 96, role: '欢迎会的「共犯」', call: ['安洁莉娜小姐', ''], addr: '小姐',
        text: '欢迎会礼花筒事故的另一位「主犯」。场面一下子乱成一团，但大家都笑得很开心。',
        src: '模组「想要留住的声音」', stops: ['tape'] },
      { id: 'skyfire', ring: 2, a: 168, role: '学姐', call: ['天火学姐', ''], addr: '学姐',
        text: '有一次她在荒野里迷了路，把天火他们吓得半死；可她明明就出现在了大家所在的路口——据她说，是一只粉粉的、毛绒绒的小东西把她领了出来。',
        src: '档案资料二', stops: [] },
      { id: 'earthspirit', ring: 2, a: 144, role: '同族的前辈', call: ['地灵前辈', ''], addr: '前辈',
        text: '说起身边人的近况，她提到地灵前辈还和普罗旺斯姐姐一样在各地奔走，而她自己也去了更多火山——语气像在清点一份珍贵的名单。',
        src: '语音「信赖提升后交谈1」', stops: [], voice: ['alter', 7, '清点身边人的近况：霜叶、慕斯、地灵前辈、普罗旺斯姐姐'] },
      { id: 'mousse', ring: 2, a: 240, role: '办起了读书会', call: ['慕斯', ''], addr: '名字',
        text: '一开始紧张得连话都不敢说的慕斯，如今办起了读书会。',
        src: '语音「信赖提升后交谈1」', stops: [] },
      { id: 'frostleaf', ring: 2, a: 264, role: '不再总是一个人', call: ['霜叶', ''], addr: '名字',
        text: '以前总是一个人的霜叶，最近常去慕斯的读书会。她说起这件事，只轻轻感叹了一句：真好呀。',
        src: '语音「信赖提升后交谈1」', stops: [] },
      { id: 'bluepoison', ring: 2, a: 216, role: '甜点课的帮手', call: ['蓝毒小姐', ''], addr: '小姐',
        text: '2024 年的除夕，她在蓝毒的帮助下，做了自己平时最喜欢的甜点——随新年问候一起寄给了前辈。',
        src: '邮件 · 来自纯烬艾雅法拉的祝福', stops: ['mail'] },
      { id: 'hope', ring: 3, a: 288, role: '乌纳村的小女孩', call: ['小藿普', '姐姐'], addr: '名字',
        text: '偷偷往山上跑的小女孩，怀里揣着一个皱巴巴的花环，想放到山顶，送给再也没有回来的爷爷奶奶。那一夜，她们一起被小羊邀请。',
        src: '干员密录「夜色中的第一步」', stops: ['uno'] },
      { id: 'costa', ring: 3, a: 312, role: '知更鸟咖啡店', call: ['店主先生', ''], addr: '先生',
        text: '知更鸟咖啡店老店主的孙子，替凯勒保管了一本《泰拉火山图志》很多年。她替他把书还回去，隔了这么多年，两位旧友又在那家店里坐到了一起。',
        src: 'SL-4 一个水手出海了 · SL-5 我会唱一首彩虹', stops: ['sl'] },
      { id: 'bird', ring: 3, a: 336, role: '旅行歌手', call: ['伯德小姐', ''], addr: '小姐',
        text: '以「一个故事」为报酬驻唱的哥伦比亚歌手。她弹唱的一首汐斯塔老歌里，藏着多利一直想不起来的「北风」；她也看得见那只背着矿灯、到处啃路牌的小羊。',
        src: 'SL-3 手指之家 · SL-6 林中小木屋', stops: ['sl'] },
      { id: 'swire2', ring: 3, a: 0, role: '「小艾雅」', call: ['诗怀雅小姐', '小艾雅'], addr: '小姐',
        text: '名义上来新汐斯塔度假、实则来谈生意的诗怀雅，给她起了个昵称「小艾雅」，非拉她去泡温泉——那片温泉后来成了风情街的水上乐园。',
        src: 'SL-2 小蓝孩 · SL-5 我会唱一首彩虹', stops: ['sl'] },
      { id: 'snowsant', ring: 3, a: 24, role: '龙门的天才工程师', call: ['雪雉', '艾雅法拉小姐'], addr: '名字',
        text: '给水上乐园设计了会飞的冲浪皮艇。她追着叼走硬币的小羊一路冲过风情街时，撞散了雪雉正在谈的旧币生意，只来得及喊一声抱歉。',
        src: 'SL-4 一个水手出海了 · SL-5 我会唱一首彩虹', stops: ['sl'] },
      { id: 'ceylon', ring: 3, a: 48, role: '汐斯塔的医生', call: ['锡兰医生', '艾雅法拉'], addr: '医生',
        text: '罗德岛驻汐斯塔办事处的医生、市长的女儿。那只背着矿灯、到处找路的小羊，最后把头靠在了锡兰胸口——它迷路了很久，找的原来是一颗心跳。',
        src: 'SL-2 小蓝孩 · SL-6 林中小木屋 · SL-7 靠着我的肩膀哭泣', stops: ['sl'] },
      { id: 'ennis', ring: 3, a: 72, role: '纯白火山酒吧的长子', call: ['埃尼斯先生', '阿黛尔小姐'], addr: '先生',
        text: '为了弟弟妹妹同时打好几份工，把她撞晕后又掏光身上的钱付医药费。她把一张地址被啃掉的照片交给了他——是他那个四处探险的父亲从乌纳火山寄来的。后来他说想去那艘开往很多地方的船上看看。',
        src: 'SL-2 ~ SL-ST-3 · 苍苔档案', stops: ['sl'] },
    ],
  };
  /* 人物之间的连线（彼此的关系，不经过她） */
  const LINKS = {
    base: [['parents', 'sheep'], ['parents', 'kahn'], ['kahn', 'batty'], ['kahn', 'kaltsit'], ['doctor', 'amiya'], ['doctor', 'kaltsit'],
      ['earthspirit', 'provence'], ['provence', 'skyfire'], ['provence', 'ceylon'], ['mousse', 'gummy'], ['ifrit', 'mint'], ['sideroca', 'sussurro'], ['earthspirit', 'doctor']],
    alter: [['parents', 'dolly'], ['parents', 'keller'], ['parents', 'kahn'], ['dolly', 'lambs'], ['keller', 'kahn'], ['keller', 'costa'], ['swire2', 'snowsant'],
      ['swire2', 'ennis'], ['ennis', 'ceylon'], ['ceylon', 'lambs'], ['provence', 'angelina'], ['provence', 'earthspirit'], ['mousse', 'frostleaf'], ['doctor', 'kaltsit']],
  };

  /* ====================================================
   * 登场记录（小路上的每一站）
   * kind：story 剧情 · record 干员密录 · event 活动 · stage 演出 · sim 悖论模拟 · mail 邮件 · module 模组 · song 歌曲 · skin 时装
   * ==================================================== */
  const KIND = {
    story: ['SIDESTORY', '支线故事'], coll: ['STORYSET', '故事集'], record: ['OPERATOR RECORD', '干员密录'], stage: ['LIVE', '音乐会'],
    collab: ['COLLAB', '联动活动'], sim: ['PARADOX', '悖论模拟'], mail: ['MAIL', '邮件'], module: ['MODULE', '模组'], songs: ['EP', '歌曲'],
    promo: ['PREVIEW', '前瞻'], skin: ['OUTFIT', '时装'],
  };
  const TRAIL = {
    base: [
      { id: 'vi', kind: 'coll', code: 'VIGILO · 如我所见', date: '2021-07-13', title: '我不会全部遗忘', en: 'THE STORM & THE SIGNATURE', where: '罗德岛本舰 · 离开龙门之后的荒地',
        role: '一份简报，一张批准书', img: 'bg:bridge', kv: 'kv:如我所见', pos: '50% 50%',
        text: [
          '离开龙门不久，罗德岛在荒地上迎面撞进一场超级雷沙暴。地灵的预警、博士的实时演算，带着本舰从两道气旋的夹缝里全速冲了出去。',
          '让博士提前警觉的，是当天清晨交上来的一份简报：一位新来的干员在舷窗沾上的沙尘里，看出了地表源石正在迅速增殖——同样的现象，她在莱塔尼亚南部的火山附近见过。',
          '当晚，她被叫进指挥室：加入行动部门的申请批准了。大家都说因为病情，博士和阿米娅一定不会同意；是博士说服了阿米娅，还把一本自己的天灾研究笔记交给了她。',
        ],
        feat: 'stamp', aside: { big: '2021', imgs: [['bg:rhodescom', '罗德岛本舰 · 指挥室：她被叫来的那个晚上']] }, cast: ['doctor', 'earthspirit', 'amiya', 'kaltsit'], src: '故事集「如我所见」· 我不会全部遗忘' },
      { id: 'of', kind: 'story', code: 'HEART OF SURGING FLAME', date: '2019-08-27', title: '火蓝之心', en: 'FORTY MINUTES ON THE LINE', where: '汐斯塔 ⇄ 罗德岛（远程通讯）',
        role: '隔着通讯线的火山学家', img: 'kv:火蓝之心', pos: '22% 36%',
        text: [
          '黑曜石节正热闹，普罗旺斯和天火在汐斯塔火山脚下闻到刺鼻的气味、摸到反常的地温，顺手替她采回了岩样——天火手里的检测符文，也是她事先交给的。',
          '人在罗德岛的她对着样本讲了整整四十分钟：火山活动正在异常爬升，二到四周内就会到达临界点，最好立刻让市民准备避难。人不在现场、找不到更确切的契机，她为此向大家道了歉。',
          '决战前夕，她又一次接进通讯：分析完成了——只要照她的办法去做，喷发还能推迟。',
        ],
        feat: 'comm', aside: { big: '2019', imgs: [['cg:ac3_report', '剧情 CG · 观测站那份“没有异常”的报告'], ['cg:ac3_volcano', '剧情 CG · 活动频率异常攀升的汐斯塔火山']] }, cast: ['provence', 'skyfire', 'ceylon', 'doctor'], src: 'OF-ST2 冲破藩篱 · OF-7 一锤定音 行动后' },
      { id: 'es', kind: 'record', code: '地灵 · 干员密录', date: '', title: '额外的工作', en: 'THE THIRD LESSON', where: '罗德岛 · 地灵的房间',
        role: '第三堂钢琴课', img: 'bg:room_2', pos: '50% 60%',
        text: [
          '地灵在教「阿黛尔」弹一架改小了尺寸的琴。琴键沉，速度一快就跟不上；可才第三堂课，她已经能断断续续弹下一整首《月光曲》。',
          '普罗旺斯回舰塞来一堆报告，三个人聊起地灵的老师巴赫曼教授——那位地质学家兼音乐家，恰好在她小时候的生日上即兴弹过一曲。',
          '地灵嘱咐她早点休息：后天，她就要和巴蒂一起出外勤了。',
        ],
        feat: 'piano', aside: { big: 'III', bust: ['hf:地灵', '地灵 · 同族的前辈'] }, cast: ['earthspirit', 'provence'], src: '地灵 · 干员密录「额外的工作」' },
      { id: 'r1', kind: 'record', code: '精英2 · 信赖 50%', date: '', title: '学者之心', en: "A SCHOLAR'S HEART", where: '外勤第三天 · 古火山留下的火成岩地带',
        role: '一个嘴硬的向导，一个护着她的巴蒂', img: 'bg:laccolith', pos: '50% 55%', motto: '黑暗追着她，她追着光。', story: 'b7',
        text: [
          '三天的外勤：前面带路的是个嘴上不饶人的向导，一路替她挡风、搬设备的是外勤干员巴蒂。向导嫌她耳朵不灵、走不稳，她还是跟去了异常带的中心——那里得靠她的源石技艺把检测精度提上去。',
          '石块砸向向导的那一瞬，她先一步从热量的变化里察觉，把它熔成了碎片。向导后来说，剩下的向导费不要了；她其实没听全，只看懂了那一脸诚恳，就收下了这份谢意——巴蒂笑说，大概这就是真正的学者。',
        ],
        feat: 'rec', aside: { big: 'REC', bust: ['hf:锡兰', '锡兰 · 医疗部里说「让她去吧」的人'] }, cast: ['batty', 'ceylon', 'doctor'], src: '艾雅法拉 · 干员密录「学者之心」' },
      { id: 'r2', kind: 'record', code: '精英2 60级 · 信赖 200%', date: '', title: '火山', en: 'THE VOLCANO', where: '莱塔尼亚北部荒原 · 火山带 7 号采样点',
        role: '两封她不知道的信', img: 'bg:desert_3', pos: '50% 45%', motto: '经火烧过的是真理，亦是永恒。', story: 'b8',
        text: [
          '收工时，她跟巴蒂讲起第一次看见活火山的那天——那段往事，「故事」里有完整的一章。这张卡片记的是同一趟外勤里的另一条线。',
          '卡恩在莱塔尼亚脱不开身，便托凯尔希找到曾受他帮助的巴蒂，请他替自己看着「瑙曼小姐」：他担心的不只是她的病，还有那些盯着她父母研究的目光。巴蒂回信说，这份担心也许并不必要。',
        ],
        feat: 'letters', aside: { big: 'Nº7', figure: ['npc:卡恩', '卡恩 · 托人照看她的前辈'] }, cast: ['batty', 'kahn', 'kaltsit', 'parents'], src: '艾雅法拉 · 干员密录「火山」' },
      { id: 'ifr', kind: 'record', code: '伊芙利特 · 干员密录', date: '', title: '小队长', en: 'THE SQUAD LEADER', where: '一处比测算更深的洞窟',
        role: '被护在身后的「慢吞吞的小羊」', img: 'bg:caveentrance', pos: '50% 60%',
        text: [
          '伊芙利特第一次当队长，要护着她、薄绿和蜜蜡探查一处洞窟。洞的位置和规模都和她的测算有些出入：湿度偏高、土层松散、裂口大得不像天然形成。',
          '她很快想通了——是源石虫群在岩层里繁衍。虫潮涌来时，她拦住想放火的队长：岩层不稳，火太猛会塌。伊芙利特让大家先走、自己断后；可谁都没有走远，最后几个人一起，差点把洞口都填平了。',
        ],
        aside: { big: 'LEAD', bust: ['hf:伊芙利特', '伊芙利特 · 第一次当队长'] }, cast: ['ifrit', 'mint', 'beeswax'], src: '伊芙利特 · 干员密录「小队长」' },
      { id: 'dh', kind: 'story', code: 'DOSSOLES HOLIDAY', date: '2021-08-03', title: '多索雷斯假日', en: 'HER TURN FOR A HOLIDAY', where: '多索雷斯 · 铁人三项的看台',
        role: '终于轮到她的假期', img: 'kv:多索雷斯假日', pos: '50% 35%',
        text: [
          '在玻利瓦尔出完任务、又顺道陪她做完地质考察，铸铁替小队申请了假期：听说博士他们在度假，「我们艾雅法拉也该歇一歇」。罗德岛想在这里设办事处，他们也顺便来当一回说客。',
          '海边的看台上，她还在担心感染者的身份会给这里的人添麻烦。苏苏洛以医生的身份告诉她：你比谁都更久待在室内——每个人都有享受阳光的权利。',
          '同一片看台上，诗怀雅第一次见到她，坐下没多久就拉着她试起了面霜；星熊则一直在为押了注的陈念叨。',
        ],
        aside: { big: '2021', bust: ['hf:苏苏洛', '苏苏洛 · 每个人都有享受阳光的权利'] }, cast: ['sideroca', 'sussurro', 'swire', 'hoshiguma', 'red'], src: 'DH-4 铁人三项 行动前 · DH-5 曲径求胜 行动后 · DH-6 紧追猛赶 行动前' },
      { id: 'amb', kind: 'stage', code: '音律联觉 2022 · 灯下定影', date: '2022-10-30', title: '梦源之地', en: 'DREAMLAND', where: '线上直播 · 上海（2023 年线下返场）',
        role: '音乐会里的微型剧场', img: 'kv:梦源之地', pos: '50% 30%',
        text: [
          '年度音乐会「灯下定影」以《梦源之地》开场。在它的微型剧场里，她和阿米娅、初雪、琴柳、莱恩哈特、年一同登台（日配：种田梨沙）。',
          '2023 年 5 月，这场演出在上海做了线下返场。',
        ],
        aside: { big: '2022', bust: ['hf:阿米娅', '阿米娅 · 同台的主演之一'] }, cast: ['amiya'], src: '音律联觉 2022：灯下定影' },
      { id: 'mu', kind: 'collab', code: 'SOMNILOQUIUM SERENUM · 无忧梦呓', date: '2025-09-04', title: '名为客房区的迷宫', en: 'AN ISLAND IN SOMEONE\'S DREAM', where: '三角初华的梦 · 一座远离陆地的小岛',
        role: '梦里的邻居', img: 'bg:islandharbor', kv: 'kv:无忧梦呓', pos: '50% 55%',
        text: [
          '《BanG Dream! Ave Mujica》联动。在三角初华的梦境里，有一座渡船很少靠岸的小岛：梦中的她为了火山的最后一组数据迟迟不肯走，初华每天替她做听力测试——她们是在一个她迷了路、而初华正好在山上看星星的夜里认识的。',
          '初华守着一栋空荡荡的别墅，等一个连名字都记不起来的人。是她读出了初华没说出口的那句「我想找到她」，推着初华朝码头跑去；随后赶到的丰川祥子，只在别墅里遇见了她。',
        ],
        aside: { big: '2025', bust: ['hf:三角初华', '三角初华 · 梦中小岛上的邻居'] }, cast: ['hatsuka'], src: '无忧梦呓 · SS-4 名为客房区的迷宫 行动前 / 行动后' },
      { id: 'px', kind: 'sim', code: '悖论模拟', date: '', title: '一个人的包围圈', en: 'A ONE-WOMAN SIEGE', where: '模拟战场 · 岩浆喷射口',
        role: '最可靠的决战力量',
        text: [
          '模拟档案里写道：越是了解她，越是清楚那小小的身体里藏着火山般的能量。如果可以选，她只想把源石技艺全部用在学术上；可在战场上，她的法术是最可靠的决战力量——队友只需在最好的时机，把敌人引进她的爆发范围。',
          '关卡里的岩浆喷射口每隔一段时间就会喷发，熔掉周围的障碍物。',
        ],
        feat: 'vents', aside: { big: 'SIM', bust: ['hf:艾雅法拉', '艾雅法拉 · 一个人的包围圈'] }, cast: [], src: '艾雅法拉 · 悖论模拟' },
      { id: 'ep', kind: 'songs', code: 'EP · 印象曲', date: '', title: '她的歌', en: 'SONGS', where: '塞壬唱片 · 日服周年纪念乐曲集',
        role: '三首歌',
        songs: [
          ['A Sweet Rendez-vous', '2022.10.05', '「时代」系列 EP，与天火、普罗旺斯同列'],
          ['焦がれるひととき', '2025.01.11', '日服 5 周年纪念乐曲集 · 艾雅法拉（CV 種田梨沙）'],
          ['Faraway Holiday', '2025.01.11', '同一乐曲集 · 与龙舌兰、鸿雪、W 合唱'],
        ],
        aside: { big: 'EP' }, cast: ['skyfire', 'provence'], src: '衍生作品 / 音乐' },
    ],
    alter: [
      { id: 'kv', kind: 'promo', code: 'HVÍT ASKA · 干员前瞻', date: '2023-07-28', title: '白色的灰烬', en: 'CLOUDTOP LUCID DREAMS', where: '前瞻 PV · 夏季限定寻访「云间清醒梦」',
        role: '纯烬艾雅法拉登场', img: 'kv:云间清醒梦', pos: '50% 40%',
        text: [
          '7 月 28 日，官方公开纯烬艾雅法拉的前瞻 PV 与干员档案预告：从汐斯塔旅行回来后，她穿上了一件略显宽大、满是旧裂口的防护外套，抚过袖口那块发黄的灼痕。',
          '8 月 1 日，她随夏季限定寻访「云间清醒梦」登场，与琳琅诗怀雅并列；同一天，SideStory「火山旅梦」开幕，她的 EP《Miss You》也随之发布。',
        ],
        aside: { big: '2023', bust: ['hf:纯烬艾雅法拉', '纯烬艾雅法拉 · 母亲的外套如今正好合身'] }, cast: ['swire2'], src: '干员预告 · 云间清醒梦 · 衍生作品/影像' },
      { id: 'sl', kind: 'story', code: 'SO LONG, ADELE: HOME AWAY FROM HOME', date: '2023-08-01', title: '火山旅梦', en: 'SIESTA · THE SUMMER OF 1099', where: '新汐斯塔 · 1099 年夏',
        role: '汐斯塔火山喷发前的最后一个夏天', img: 'kv:火山旅梦', wide: true,
        text: [
          '1099 年夏，搬上移动地块的新汐斯塔离旧火山已有一百公里。恩师凯勒邀她来火山博物馆整理资料、一起观测即将喷发的旧火山——两年前，凯勒在资料里读到过她写的一份意见报告。',
        ],
        feat: 'sl', cast: ['keller', 'kahn', 'dolly', 'swire2', 'snowsant', 'ceylon', 'ennis', 'costa', 'bird'], src: 'SideStory「火山旅梦」SL-ST-1 ~ SL-ST-3' },
      { id: 'tape', kind: 'module', code: '模组 · WDM-X', date: '', title: '想要留住的声音', en: 'SOUNDS WORTH KEEPING', where: '一盘录音带',
        role: '录音带上的人', story: 'a4',
        text: [
          '听力还在变差，她开始把声音录下来——六条音轨，「故事」里一轨一轨都有。这一站只数一数录音带上的人：',
          '陪她在喷发后的火山顶上多坐了一会儿的凯勒老师；在威廉大学的草坪上，从拘谨寒暄聊到火山研究的卡恩前辈；还有欢迎会上礼花筒放岔、推倒了一整座布偶山的普罗旺斯和安洁莉娜。最后一轨空着，留给下一次考察，也留给身边人的声音。',
        ],
        feat: 'reels', aside: { big: 'SIDE A', figure: ['npc:凯勒', '凯勒 · 第一轨里陪她坐在山顶的人'] }, cast: ['keller', 'kahn', 'provence', 'angelina'], src: '纯烬艾雅法拉 · 模组「想要留住的声音」' },
      { id: 'uno', kind: 'record', code: '精英2 · 信赖 50%', date: '', title: '夜色中的第一步', en: 'FIRST STEP IN THE DARK', where: '乌纳村新址 · 乌纳火山',
        role: '一个想念爷爷奶奶的孩子', img: 'bg:wilderness_n', pos: '50% 60%', story: 'a7',
        text: [
          '重建的乌纳村搬到了望不见火山的地方，村民一听见「火山」便冷了脸。她没有争辩，只在山坡上育起预警花苗，一页一页地写观测日志。',
          '小藿普是第一个肯跟她说话的孩子：给她指过路，摔进过她的试验田，怀里揣着一个皱巴巴的花环，想放上山顶送给再也没回来的爷爷奶奶。村民们后来也给她送过药膏和炒野菜——那味道，和小时候爸爸妈妈带回家的一样。那个夜晚的全部，在「故事」里。',
        ],
        feat: 'log', aside: { big: '10.18', imgs: [['bg:skystarry', '双月与一颗星：像我们三个']] }, cast: ['hope', 'parents', 'lambs'], src: '纯烬艾雅法拉 · 干员密录「夜色中的第一步」' },
      { id: 'px2', kind: 'sim', code: '悖论模拟', date: '', title: '学者的实力', en: "A SCHOLAR'S STRENGTH", where: '模拟战场',
        role: '站在需要她的地方',
        text: [
          '模拟档案问：人们会怎么形容她？醉心火山、在背后提供帮助的科学家，诸位老研究者的学生，还是许多人的前辈？',
          '她并不在意这些答案，只是站在需要她的地方，握紧自己的法杖，做每一件她想做完的事。',
        ],
        feat: 'vents', aside: { big: 'SIM' }, cast: [], src: '纯烬艾雅法拉 · 悖论模拟' },
      { id: 'mail', kind: 'mail', code: '2024 · 除夕特别登录', date: '2024-02-09', title: '来自纯烬艾雅法拉的祝福', en: 'A LETTER FOR THE NEW YEAR', where: '罗德岛 · 邮件',
        role: '一块火山熔岩蛋糕',
        text: [
          '她给前辈寄来新年问候：在罗德岛这么久，认识前辈和大家，是很幸运的事；真希望明年这个时候，还能一起看新年夜的烟花。',
          '信里也写到了多利说过的那个意思——过去的事总会换一种方式陪在身边，所以就轻轻松松地和过去告别吧。随信附上的，是她在蓝毒的帮助下亲手做的、自己最喜欢的甜点。',
        ],
        feat: 'mail', aside: { big: '2024', bust: ['hf:蓝毒', '蓝毒 · 甜点课的帮手'] }, cast: ['bluepoison', 'doctor'], src: '邮件记录 · 2024 辞旧迎新' },
      { id: 'rerun', kind: 'story', code: 'IN RETROSPECT · 复刻', date: '2024-08-22', title: '一年之后', en: 'A YEAR LATER', where: '日服上线 · 时装 · 复刻',
        role: '汐斯塔的夏天又来了一次', img: 'kv:火山旅梦复刻', pos: '50% 35%',
        text: [
          '2024 年 1 月，日服以「火山と雲と夢色の旅路」为名推出火山旅梦，PV 由她旁白（CV 种田梨沙）。',
          '同年 8 月，她的第一套 EPOQUE 动态时装「远行前的野餐」上架——多利一个恶作剧，把所有人都变小了；8 月 22 日，「火山旅梦」开启复刻。',
        ],
        aside: { big: '2024', figure: ['npc:多利', '多利 · 又一个恶作剧'] }, cast: ['dolly'], src: '火山旅梦 · 复刻 · 衍生作品/影像 · 时装回廊' },
      { id: 'ep2', kind: 'songs', code: 'EP', date: '', title: '她的歌', en: 'SONGS', where: '塞壬唱片',
        role: '两首歌',
        songs: [
          ['Miss You', '2023.08.01', '「火山旅梦」EP'],
          ['Grow on My Time', '2025.06.08', '高考应援曲 · 与华法琳、林同列'],
        ],
        aside: { big: 'EP' }, cast: [], src: '衍生作品 / 音乐' },
      { id: 'after', kind: 'skin', code: 'EPOQUE · 时代 / LVII', date: '2026-08-01', title: '后来的故事', en: 'WHAT CAME AFTER', where: '家',
        role: '一个讲给爸爸妈妈的童话', skin: 's2',
        text: [
          '阿黛尔最喜欢的一套便服：柔软的家居服、绒绒拖鞋。这套时装的语音里，她像小时候那样挤在爸爸妈妈中间，讲了一个童话：两朵暖洋洋的火山云，一颗被它们弄丢、后来也变成了云的小石头。',
          '讲完了，热巧克力也喝到了，她说自己今天很满足，可以安心睡了。',
        ],
        aside: { big: '2026' }, cast: ['parents', 'dolly'], src: '纯烬艾雅法拉 · 时装「后来的故事」语音' },
    ],
  };

  /* 客串与侧影：她在别人的故事里被提到的时刻 */
  const CAMEO = {
    base: [
      ['2018.10.31', '公测前的万圣节', '官方微博的节日贺图里，她和安洁莉娜一起画南瓜，被「幽灵」吓得直问还要不要继续画。'],
      ['2022.06.09', '尘影余音 · LE-TR-2', '教学关「作品849」的预设编队里有她，还顺口替博士解释了「谐振器」为什么在充能。'],
      ['生息演算', 'RA2-END-3', '工程干员说：把「艾雅法拉小姐她们」带回的数据导入后，开采模块的程序重新设计好了。'],
    ],
    alter: [
      ['档案资料二', '舰上的怪事', '食堂里有人说，粉色毛球对音乐很有品位——就是爱啃琴弦；教官坚雷贴出警告，追查满天飞的玩具和不翼而飞的冰淇淋原料；墙上还多了一行企鹅脚印：把我的限量唱片还来！'],
      ['语音 · 新年祝福', '一颗小石头', '她说一颗小石头一生会遇见无数小石头：碰撞、成为岩浆、在最热烈时喷发，再化作灰烬滋养生灵——说到一半，才发现烟花早就放起来了。'],
      ['苍苔档案', '那个夏天之后', '和她、和那群神秘生物的奇遇，改变了埃尼斯对人生的消极看法：矿石病不该是放弃的借口。'],
    ],
  };

  /* 年表丝带（时装另从 D.forms 读取） */
  const RIBBON = [
    ['2018-10-31', 'base', 'promo', '万圣节贺图', '公测前的官方节日贺图'],
    ['2019-04-30', 'base', 'rel', '公测实装', '术师 · 中坚寻访'],
    ['2019-08-27', 'base', 'story', '火蓝之心', '远程分析汐斯塔火山', 'of'],
    ['2021-07-13', 'base', 'story', '如我所见', '故事集 · 我不会全部遗忘', 'vi'],
    ['2021-08-03', 'base', 'story', '多索雷斯假日', '终于轮到她的假期', 'dh'],
    ['2022-06-09', 'base', 'cameo', '尘影余音', '教学关预设编队'],
    ['2022-10-05', 'base', 'song', 'A Sweet Rendez-vous', 'EP · 与天火、普罗旺斯', 'ep'],
    ['2022-10-30', 'base', 'stage', '灯下定影', '梦源之地 · 微型剧场', 'amb'],
    ['2023-07-28', 'alter', 'promo', '纯烬前瞻', '前瞻 PV 与档案预告', 'kv'],
    ['2023-08-01', 'alter', 'story', '火山旅梦', '纯烬实装 · Miss You', 'sl'],
    ['2024-01-13', 'alter', 'promo', '日服 PV', '火山と雲と夢色の旅路', 'rerun'],
    ['2024-02-09', 'alter', 'mail', '除夕邮件', '一块火山熔岩蛋糕', 'mail'],
    ['2024-08-22', 'alter', 'story', '火山旅梦 · 复刻', '一年之后', 'rerun'],
    ['2025-01-11', 'base', 'song', '焦がれるひととき', '日服 5 周年纪念乐曲', 'ep'],
    ['2025-06-08', 'alter', 'song', 'Grow on My Time', '高考应援曲', 'ep2'],
    ['2025-09-04', 'base', 'story', '无忧梦呓', 'Ave Mujica 联动', 'mu'],
  ];
  const RIB_T0 = Date.UTC(2018, 8, 1), RIB_T1 = Date.UTC(2026, 11, 31);
  const NOW = '2026-09-25';

  /* 形态文案 */
  const COPY = {
    base: {
      desc: '官方故事里的术师：一次远程通讯、两段外勤录音、一个假期、一场别人的梦——以及陪她走过这些路的人。',
      lede: ['她说，心里「学者」的样子，从前是爸爸妈妈，后来又多了一位前辈。', '下面是术师时期的她，在官方故事、密录与演出里留下的脚印——一站一站走下去，小羊会跟着你。'],
      trailSub: 'APPEARANCES · 术师篇', webSub: 'CONSTELLATION · 早年',
      next: ['alter', '汐斯塔的最后一个夏天，乌纳火山的夜晚——她后来的路。'],
    },
    alter: {
      desc: '汐斯塔火山喷发前的最后一个夏天、乌纳村的夜晚，和一张越来越大、也越来越温暖的网。',
      lede: ['她在纪录片《一步，又一步》的开场白里说：自己是踩着父母留下的脚印往前走的；而后来的人，终会踩上她的脚印，继续走下去。', '这是纯烬之后的她走过的路。'],
      trailSub: 'APPEARANCES · 医疗篇', webSub: 'CONSTELLATION · 后来',
      next: ['base', '在这一切之前：罗德岛的舰桥、四十分钟的通讯、荒原上的录音机。'],
    },
  };

  /* ====================================================
   * 渲染
   * ==================================================== */
  let form = 'base', root = null, ctx = {};
  const offs = []; // 本次渲染挂上的监听 / 观察者，重绘前统一拆掉
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };

  const pad2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => (d ? d.replace(/-/g, '.') : '');
  const person = (id) => PEOPLE[id] || { name: id, short: id };

  /** 头像：官方头像 / 剧情立绘裁出的脸 / 小羊 / 线稿图标 */
  function avatar(id, w = 120) {
    const p = person(id);
    if (p.av) return `<img class="jav-img" src="${u(p.av, w)}" alt="" ${IMG_ATTR}>`;
    if (p.npc) return `<img class="jav-img jav-npc" style="--fx:${p.face[0]}%;--fy:${p.face[1]}%;--fz:${p.face[2]}" src="${u(p.npc, 360)}" alt="" ${IMG_ATTR}>`;
    if (p.sheep) return `<span class="jav-sheep">${A.sheep(p.sheep)}</span>`;
    return `<span class="jav-ico">${ico(p.icon)}</span>`;
  }
  /** 详情面板的大图：半身像 / 剧情全身立绘 / 图标 */
  function portrait(id) {
    const p = person(id);
    if (p.hf) return `<img class="jp-half" src="${u(p.hf, 360)}" alt="${esc(p.name)}" ${IMG_ATTR}>`;
    if (p.npc) return `<img class="jp-full" src="${u(p.npc, 480)}" alt="${esc(p.name)}" ${IMG_ATTR}>`;
    if (p.sheep) return `<span class="jp-sheep">${A.sheep(p.sheep)}${A.sheep(p.sheep)}</span>`;
    return `<span class="jp-ico">${ico(p.icon)}</span>`;
  }

  function lede() {
    const c = COPY[form];
    // 一串往右上走的蹄印：左右脚交替错开，依次亮起又淡去
    const prints = Array.from({ length: 9 }, (_, k) => `<i style="--k:${k};--l:${k * 34}px;--t:${(k % 2 ? 52 : 28) - k * 3}px;--r:${k % 2 ? 98 : 82}deg">${hoof()}</i>`).join('');
    return `<div class="jn-lede" data-reveal>
      <div class="jl-prints" aria-hidden="true">${prints}</div>
      <p class="jl-text">${c.lede.map((s, i) => `<span class="${i ? 'jl-sub' : 'jl-main'}">${s}</span>`).join('')}</p>
    </div>`;
  }

  /* ---------- 年表丝带 ---------- */
  function ribbon() {
    const xOf = (d) => clamp((Date.parse(d + 'T00:00:00Z') - RIB_T0) / (RIB_T1 - RIB_T0), 0, 1) * 100;
    const ticks = RIBBON.map(([d, f, k, t, s, stop]) => ({ d, f, k, t, s, stop }));
    // 时装从数据层读取（画廊与这里共用同一份日期）
    for (const f of ['base', 'alter']) {
      for (const o of (D.forms[f].outfits || [])) if (o.key && o.key[0] === 's' && o.date) ticks.push({ d: o.date, f, k: 'skin', t: o.name, s: `时装 · ${o.series || ''}`, stop: f === 'alter' && o.key === 's2' ? 'after' : '' });
    }
    ticks.sort((a, b) => (a.d < b.d ? -1 : 1));
    // 标签分三行错开，避免挤在一起
    // 只有当前形态的刻度显示标签：按顺序放进离上一个标签足够远的那一行
    let lastX = [-99, -99, -99];
    const html = ticks.map((t, i) => {
      const x = xOf(t.d);
      const mine = t.f === form;
      let row = 1;
      if (mine) {
        row = [0, 1, 2].find((r) => x - lastX[r] > 8.5);
        if (row == null) row = i % 3;
        lastX[row] = x;
      }
      const go = mine && t.stop ? ` data-jn-go="${t.stop}"` : '';
      return `<button type="button" class="jr-tick k-${t.k} f-${t.f} row-${row}${mine ? ' mine' : ''}" style="--x:${x.toFixed(2)}%"${go} aria-label="${esc(`${ymd(t.d)} ${t.t} · ${t.s}`)}">
        <i class="jr-dot"></i><span class="jr-lbl"><b>${esc(t.t)}</b><small class="mono">${ymd(t.d).slice(2)}</small></span>
        <span class="jr-tip"><b>${esc(t.t)}</b>${esc(t.s)}<small class="mono">${ymd(t.d)}${mine ? (t.stop ? ' · 点击前往' : '') : ` · ${D.forms[t.f].mood}`}</small></span>
      </button>`;
    }).join('');
    const years = [];
    for (let y = 2019; y <= 2026; y++) years.push(`<span class="jr-year" style="--x:${xOf(`${y}-01-01`).toFixed(2)}%"><b class="mono">${y}</b></span>`);
    const now = xOf(NOW);
    const legend = [['story', '剧情 · 活动'], ['song', '歌曲'], ['skin', '时装'], ['promo', '前瞻 · 宣传'], ['stage', '演出 · 客串']];
    return `<div class="jn-rib panel" data-reveal>
      <div class="jr-head"><span class="mono">TIMELINE · 2018 — ${NOW.slice(0, 4)}</span><b>七年的足迹</b><em>亮着的是${D.forms[form].mood}的足迹；暗着的属于另一种形态</em></div>
      <div class="jr-scroll"><div class="jr-track">
        <i class="jr-axis"></i>${years.join('')}
        <span class="jr-now" style="--x:${now.toFixed(2)}%"><i></i><small class="mono">NOW</small></span>
        ${html}
      </div></div>
      <div class="jr-legend">${legend.map(([k, t]) => `<span class="k-${k}"><i></i>${t}</span>`).join('')}</div>
    </div>`;
  }

  /* ---------- 登场记录 ---------- */
  function castRow(ids) {
    if (!ids || !ids.length) return '';
    const inWeb = new Set(WEB[form].map((n) => n.id));
    return `<div class="jt-cast"><span class="mono">同行</span>${ids.map((id) => {
      const p = person(id), linked = inWeb.has(id);
      return `<${linked ? 'button type="button"' : 'span'} class="jt-mate${linked ? ' link' : ''}"${linked ? ` data-jn-node="${id}"` : ''} title="${esc(p.name)}${linked ? ' · 在星图中查看' : ''}"><span class="jav">${avatar(id, 96)}</span><em>${esc(p.short)}</em></${linked ? 'button' : 'span'}>`;
    }).join('')}</div>`;
  }
  function figure(s) {
    if (s.skin) {
      const o = (D.forms.alter.outfits || []).find((x) => x.key === s.skin);
      if (o && o.src) return `<figure class="jt-fig is-skin"><img src="${o.src.replace(/\?.*$/, '')}?image_process=resize,w_720/format,webp/quality,Q_80" alt="${esc(o.name)}" ${IMG_ATTR}></figure>`;
      return '';
    }
    if (!s.img) return '';
    return `<figure class="jt-fig"><img src="${u(s.img, 720)}" srcset="${srcset(s.img, [560, 960, 1280])}" sizes="(max-width: 820px) 92vw, 600px" style="object-position:${s.pos || '50% 50%'}" alt="" ${IMG_ATTR}>
      ${s.kv && s.kv !== s.img ? `<span class="jt-kv"><img src="${u(s.kv, 320)}" alt="活动主视觉" ${IMG_ATTR}></span>` : ''}</figure>`;
  }
  const FEAT = {
    stamp: () => `<div class="jf jf-stamp" aria-label="行动部门申请书：已批准">
        <div class="jf-doc"><span class="mono">RHODES ISLAND · 行动部门</span><b>入职申请书</b><i></i><i></i><i class="s"></i><small class="mono">申请人：艾雅法拉 · 天灾研究</small></div>
        <span class="jf-seal"><b>批准</b><small class="mono">APPROVED</small></span>
      </div>`,
    comm: () => `<div class="jf jf-comm" role="img" aria-label="远程通讯记录（概述）">
        <div class="jc-top mono"><span>${ico('radio')} RHODES ISLAND ⇄ SIESTA</span><span class="jc-live"><i></i>40 MIN</span></div>
        <div class="jc-wave" aria-hidden="true">${Array.from({ length: 28 }, (_, k) => `<i style="--k:${k};--h:${(0.25 + Math.abs(Math.sin(k * 1.7)) * 0.75).toFixed(2)}"></i>`).join('')}</div>
        <ol class="jc-log mono">
          <li style="--i:0"><em>样本</em>汐斯塔火山岩样 · 同位素比对</li>
          <li style="--i:1"><em>现象</em>火山活动频率异常爬升</li>
          <li style="--i:2"><em>判断</em>由休眠进入活化</li>
          <li style="--i:3"><em>临界</em>二至四周之内</li>
          <li style="--i:4"><em>建议</em>立即准备避难<b class="jc-caret"></b></li>
        </ol>
      </div>`,
    piano: () => `<div class="jf jf-piano" aria-hidden="true">${Array.from({ length: 15 }, (_, k) => `<i class="w" style="--k:${k}"></i>`).join('')}${[0, 1, 3, 4, 5, 7, 8, 10, 11, 12].map((k) => `<i class="b" style="--k:${k}"></i>`).join('')}<small class="mono">第三堂课 · 《月光曲》</small></div>`,
    rec: () => `<div class="jf jf-rec">
        <div class="jr-dev mono"><span class="jr-led"></span>REC<em>外勤 · 第 3 天</em></div>
        <ol class="mono">
          <li><b>10:32</b>抵达目标地块，检测符文就绪</li>
          <li><b>12:25</b>前往最后一个采样点</li>
          <li><b>15:14</b>数据采集稳步推进</li>
        </ol>
      </div>`,
    letters: () => `<div class="jf jf-letters">
        <div class="jl-env" style="--r:-3deg"><span class="mono">FROM 卡恩 · VIA 凯尔希</span><p>拜托多照看她：不只是身体，还有她的研究。</p></div>
        <div class="jl-env" style="--r:2deg"><span class="mono">FROM 巴蒂 · TO 卡恩</span><p>这份担心也许不必要：她的心是被岩浆炼过的。</p></div>
      </div>`,
    vents: () => `<div class="jf jf-vents" aria-hidden="true">
        <div class="jv-grid">${Array.from({ length: 40 }, (_, k) => `<i class="${[9, 30].includes(k) ? 'v' : [14, 15, 16, 22, 25].includes(k) ? 'r' : k === 21 ? 'me' : ''}"></i>`).join('')}</div>
        <span class="jv-burst" style="--c:1;--r:1"></span><span class="jv-burst" style="--c:6;--r:3"></span>
      </div>`,
    mail: () => `<div class="jf jf-mail"><div class="jm-env">${ico('letter')}<span><b>来自纯烬艾雅法拉的祝福</b><small class="mono">2024.02.09 · 附件</small></span></div>
        <span class="jm-item"><img src="${u('it:熔岩蛋糕', 160)}" alt="火山熔岩蛋糕" ${IMG_ATTR}><em>火山熔岩蛋糕</em></span></div>`,
    // 乌纳：预警花的观测日志（日期出自密录，内容为概述）
    log: () => `<div class="jf jf-log">
        <span class="jg-sky" aria-hidden="true"><i class="m1"></i><i class="m2"></i><i class="st"></i></span>
        <ol>${[
          ['08.24', '抵达乌纳村新址。村民以为她是迷路的旅人，一听是来考察火山，便不再多说。'],
          ['09.03', '在山坡上找到合适的育苗地——预警花在乌纳火山适应得很好。'],
          ['09.23', '冒雨下山摔了一跤，被村民送回住处；他们送来了当地的药膏。'],
          ['10.05', '分组实验排除了一部分物质。晚饭的炒野菜，是小时候的味道。'],
        ].map(([d, t], i) => `<li style="--i:${i}"><b class="mono">${d}</b><span>${t}</span></li>`).join('')}</ol>
      </div>`,
    // 想要留住的声音：一盘转着的录音带（六条音轨，最后一条空着）
    reels: () => `<div class="jf jf-reels" aria-hidden="true">
        <div class="jt-cas"><span class="jt-lbl mono">SOUNDS WORTH KEEPING · SIDE A</span><i class="reel l"><b></b></i><i class="reel r"><b></b></i><span class="jt-win"></span></div>
        <ol class="jt-marks">${TAPE.map((t, i) => `<li class="${i === TAPE.length - 1 ? 'empty' : ''}"><i></i><span class="mono">${pad2(i + 1)}</span>${t}</li>`).join('')}</ol>
      </div>`,
    sl: () => slFeature(),
  };
  /* 模组「想要留住的声音」的六条音轨（原名；每一轨的内容在「故事」里） */
  const TAPE = ['火山的呼吸', '在蛋糕店唱歌了', '大学绿地上的研讨会', '我还记得那时的愿望', '大家为我举办了欢迎会！', '暂未命名'];
  /* 火山旅梦：八个片段（剧情 CG 轮播）+ 多利的三个谜题 */
  const SL_BEATS = [
    ['cg:41_i02', 'SL-ST-1', '玻璃后的外套', '博物馆的展柜里挂着一件满是焦痕的火山防护服，立牌上写着卡提亚与玛格娜的生卒年。她伸手碰到玻璃，又像被烫到一样缩了回来。', '50% 35%'],
    ['cg:41_i03', 'SL-1', '月光与毛绒绒', '夜路上，一团「小黑羊」落在信箱上开口说话——羊之主多利，说自己算是看着她长大的。他提出一场寻宝游戏：找回北风、种子和皮毛，报酬是「你一直在找的东西」。', '50% 40%'],
    ['bg:siesta_night', 'SL-1 / SL-3', '卡恩的怀疑', '送她回住所的路上，卡恩前辈说起瑙曼夫妇离世前的那一年，莱塔尼亚某位选帝侯的军队频繁出入他们的研究室——而那时还能接触研究的人，只有凯勒。', '50% 50%'],
    ['cg:41_i05', 'SL-5', '小羊热浪', '商品博览会上，诗怀雅和雪雉把温泉改成了水上乐园；看不见的小羊们卷着冲浪板和泳圈飞过风情街。别人只当是节目，只有她知道是谁干的。', '50% 40%'],
    ['cg:41_i06', 'SL-5', '知更鸟咖啡店', '她替店主科斯达把一本《泰拉火山图志》还给凯勒，隔着起雾的玻璃，看见老师和旧友重新坐到一起——当年凯勒就是在这家店遇见了她的父母。', '55% 40%'],
    ['cg:41_i07', 'SL-ST-2', '雨落之前', '梦里她穿着妈妈的外套，被一只温和、一只严肃的小羊领着去买「知识」「勇气」和「好运」，听它们讲一颗小石头怎样变成岩浆，再化作能让土地开花的火山灰。然后它们说：到时间了，要在下雨前上山。', '50% 35%'],
    ['cg:41_i08', 'SL-8', '最后的皮毛', '监测站数据异常，她借回妈妈的防护服和凯勒上山；卡恩追来对质，落石如雨，她护着两人，外套上又添了一道焦痕——那正是多利要的最后一样「皮毛」。汐斯塔火山喷发，火山灰落成了白色。', '50% 45%'],
    ['cg:41_i13', 'SL-ST-3', '给爸爸妈妈的信', '凯勒终于讲出「阵雨计划」和乌纳火山的那一天；旧信的落款揭开了老师的全名——也叫阿黛尔。她给爸爸妈妈写信：我在这里很好。你们要在汐斯塔找的东西，我也找到啦。', '50% 40%'],
  ];
  // 三样东西，各有一个帮她找到的人
  const RIDDLE = [
    ['wind', '北风', 'bird', '旅行歌手伯德在「纯白火山」弹唱一首汐斯塔老歌，歌里有北风——正是多利一直哼不全的那段旋律。'],
    ['cap', '种子', 'costa', '知更鸟咖啡店门外，小羊们从汽水瓶上叼走了瓶盖：在它们眼里，那是被羽兽带去远方、长成各种模样的「种子」。咖啡兑汽水的「火山咖啡」，正是科斯达年轻时的发明。'],
    ['coat', '皮毛', 'keller', '妈妈当年的火山防护服，一直被凯勒老师收在博物馆的展柜里。上山那天她把它借了回来——外套上新添的焦痕，就是最后的「皮毛」。'],
  ];
  function slFeature() {
    const slides = SL_BEATS.map(([k, code, t, d, pos], i) => `<figure class="js-slide${i ? '' : ' on'}" data-i="${i}">
        <img ${i < 2 ? `src="${u(k, 1280, 76)}"` : `data-src="${u(k, 1280, 76)}"`} srcset="" style="object-position:${pos}" alt="${esc(t)}" ${IMG_ATTR}>
        <figcaption><span class="mono">${code}</span><b>${t}</b><p>${d}</p></figcaption>
      </figure>`).join('');
    const tabs = SL_BEATS.map(([, , t], i) => `<button type="button" class="js-tab${i ? '' : ' on'}" data-jn-beat="${i}"><span class="mono">${pad2(i + 1)}</span><b>${t}</b><i class="js-bar"></i></button>`).join('');
    const cards = RIDDLE.map(([ic, t, who, d], i) => `<button type="button" class="jq-card" data-jn-riddle="${i}" aria-pressed="false">
        <span class="jq-face jq-front"><em class="mono">谜题 ${i + 1}</em>${ico(ic)}<b>${t}</b><small>点一下，看看是谁帮她找到的</small></span>
        <span class="jq-face jq-back"><span class="jq-who"><span class="jav">${avatar(who, 96)}</span><em class="mono">多亏了 · ${esc(person(who).name)}</em></span><b>${t}</b><small>${d}</small></span>
      </button>`).join('');
    return `<div class="jf jf-sl">
      <div class="js-car" tabindex="0" aria-roledescription="轮播" aria-label="火山旅梦的八个片段">
        <div class="js-slides">${slides}</div>
        <div class="js-ctl"><button type="button" class="js-arrow" data-jn-step="-1" aria-label="上一个片段">${ico('arrow')}</button><button type="button" class="js-arrow" data-jn-step="1" aria-label="下一个片段">${ico('arrow')}</button></div>
      </div>
      <div class="js-tabs" role="tablist">${tabs}</div>
      <div class="jq">
        <div class="jq-head"><span class="mono">DOLLY'S TREASURE HUNT</span><b>三样东西，三个人</b><em>多利的寻宝游戏：北风、种子、皮毛——每一样，都是汐斯塔的某个人帮她找到的。</em></div>
        <div class="jq-cards">${cards}</div>
        <div class="jq-reward" aria-live="polite"><span class="jq-flower" aria-hidden="true">${ico('flower')}</span><p><small class="mono">报酬</small><b>火山预警花</b>多利瞒着小羊们，把最后一片预警花偷偷种在火山的后山坡——喷发之后，还有一株活着：埃尼斯偷挖黑曜石时顺手挖下的那一株。它也是她父母当年来汐斯塔想找的东西。</p></div>
      </div>
    </div>`;
  }
  function songs(list) {
    return `<div class="jf jf-songs">${list.map(([t, d, n], i) => `<div class="jg-disc" style="--i:${i}"><span class="jg-vinyl" aria-hidden="true"><i></i></span><p><b>${esc(t)}</b><small class="mono">${d}</small><em>${esc(n)}</em></p></div>`).join('')}</div>`;
  }

  /** 小路另一侧的旁注：大号的年份 / 标记，配一张半身像、剧情立绘或剧情 CG */
  function asideHTML(s) {
    const a = s.aside;
    if (!a || s.wide) return '';
    let art = '';
    if (a.bust) art = `<figure class="ja-bust"><span class="ja-bi"><img src="${u(a.bust[0], 420)}" alt="" ${IMG_ATTR}></span><figcaption>${esc(a.bust[1])}</figcaption></figure>`;
    else if (a.figure) art = `<figure class="ja-figure"><img src="${u(a.figure[0], 560)}" alt="" ${IMG_ATTR}><figcaption>${esc(a.figure[1])}</figcaption></figure>`;
    else if (a.imgs) art = a.imgs.map(([k, c], j) => `<figure class="ja-shot" style="--j:${j}"><img src="${u(k, 560)}" alt="" ${IMG_ATTR}><figcaption>${esc(c)}</figcaption></figure>`).join('');
    return `<aside class="jt-aside${art ? '' : ' only-big'}" aria-hidden="true"><b class="jt-big">${esc(a.big)}</b>${art}</aside>`;
  }
  function stopHTML(s, i) {
    const k = KIND[s.kind] || ['', ''];
    const side = s.wide ? 'wide' : i % 2 ? 'r' : 'l';
    return `<article class="jt-stop s-${side} k-${s.kind}" id="jn-${s.id}" data-stop="${s.id}">
      <div class="jt-pin" aria-hidden="true"><b class="mono">${pad2(i + 1)}</b><span class="jt-date mono">${s.date ? ymd(s.date) : k[1]}</span></div>
      ${asideHTML(s)}
      <div class="jt-card panel" data-reveal>
        ${figure(s)}
        <div class="jt-body">
          <p class="jt-kicker mono"><span class="jt-kind">${k[1]}</span>${esc(s.code)}${s.date ? ` · ${ymd(s.date)}` : ''}</p>
          <h4 class="jt-title">${esc(s.title)}<small>${esc(s.en)}</small></h4>
          <p class="jt-where">${ico('pin')}${esc(s.where)}<span class="jt-role">${esc(s.role)}</span></p>
          ${s.motto ? `<p class="jt-motto">${esc(s.motto)}</p>` : ''}
          ${(s.text || []).map((t) => `<p class="jt-p">${t}</p>`).join('')}
          ${s.story ? `<button type="button" class="jt-story" data-jn-story="${s.story}">${ico('book')}<span>这段往事的全貌在「故事」里<small class="mono">READ THE CHAPTER</small></span>${ico('arrow')}</button>` : ''}
          ${s.feat && FEAT[s.feat] ? FEAT[s.feat]() : ''}
          ${s.songs ? songs(s.songs) : ''}
          ${castRow(s.cast)}
          <p class="jt-src mono">出处 · ${esc(s.src)}</p>
        </div>
      </div>
    </article>`;
  }
  function trail() {
    const c = COPY[form], stops = TRAIL[form];
    const other = c.next[0], of = D.forms[other];
    const cameo = CAMEO[form];
    return `<h3 class="sub-h jn-h" data-reveal>登场记录 <small>${c.trailSub}</small></h3>
      <div class="jn-trail">
        <div class="jt-rail" aria-hidden="true"><i class="jt-prints"></i><i class="jt-fill"></i>
          <button type="button" class="jt-walker" data-jn-walker tabindex="-1" aria-hidden="true">${A.sheep(form === 'base' ? 'black' : 'pink', 'jt-sheep')}<span class="jt-baa">咩</span></button>
        </div>
        ${stops.map(stopHTML).join('')}
        <div class="jt-stop s-wide jt-tail">
          <div class="jt-pin end" aria-hidden="true"><b class="mono">…</b></div>
          <div class="jt-cameo panel" data-reveal>
            <p class="jt-kicker mono"><span class="jt-kind">侧影</span>CAMEOS · 别人故事里的她</p>
            <ul>${cameo.map(([a, b, t]) => `<li><span class="mono">${esc(a)}</span><b>${esc(b)}</b><p>${esc(t)}</p></li>`).join('')}</ul>
          </div>
          <div class="jt-next" data-reveal>
            <span class="jt-next-av">${avatar(other === 'alter' ? 'x-alter' : 'x-base')}</span>
            <p><small class="mono">${other === 'alter' ? 'TO BE CONTINUED' : 'BEFORE ALL THIS'}</small>${esc(c.next[1])}</p>
            <button type="button" class="btn btn-primary" data-act="form" data-then="journey">${A.icon('swap')}切换至「${esc(of.mood)}」，看另一段足迹</button>
          </div>
        </div>
      </div>`;
  }

  /* ---------- 星图 ---------- */
  const R_PX = 500; // SVG 坐标：1000 × 1000，中心 (500, 500)
  function nodePos(n) {
    const r = RINGS[n.ring].r + (n.dr || 0), a = (n.a * Math.PI) / 180;
    return [0.5 + (r / 2) * Math.cos(a), 0.5 + (r / 2) * Math.sin(a)];
  }
  function addrOf(n) {
    if (n.addr) return n.addr;
    const s = n.call[0] || '';
    if (/爸爸|妈妈/.test(s)) return '家人';
    return s ? '名字' : '';
  }
  function web() {
    const nodes = WEB[form];
    const pos = Object.fromEntries(nodes.map((n) => [n.id, nodePos(n)]));
    const col = ['var(--jn-c0)', 'var(--jn-c1)', 'var(--jn-c2)', 'var(--jn-c3)'];
    const spokes = nodes.map((n) => {
      const [x, y] = pos[n.id];
      return `<line class="jw-spoke r${n.ring}" data-e="${n.id}" x1="${R_PX}" y1="${R_PX}" x2="${(x * 1000).toFixed(1)}" y2="${(y * 1000).toFixed(1)}" style="stroke:${col[n.ring]}"/>`;
    }).join('');
    const links = LINKS[form].filter(([a, b]) => pos[a] && pos[b]).map(([a, b]) => {
      const [x1, y1] = pos[a], [x2, y2] = pos[b];
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const cx = mx + (0.5 - mx) * 0.38, cy = my + (0.5 - my) * 0.38;
      return `<path class="jw-link" data-l="${a} ${b}" d="M${(x1 * 1000).toFixed(1)} ${(y1 * 1000).toFixed(1)} Q${(cx * 1000).toFixed(1)} ${(cy * 1000).toFixed(1)} ${(x2 * 1000).toFixed(1)} ${(y2 * 1000).toFixed(1)}"/>`;
    }).join('');
    const rings = RINGS.slice(0, 3).map((r, i) => `<circle class="jw-ring r${i}" cx="500" cy="500" r="${(r.r * 500).toFixed(1)}"/>`).join('');
    const ticks = Array.from({ length: 72 }, (_, k) => { const a = (k * 5 * Math.PI) / 180, r1 = 0.95 * 500, r2 = (k % 6 ? 0.965 : 0.985) * 500; return `<line x1="${(500 + r1 * Math.cos(a)).toFixed(1)}" y1="${(500 + r1 * Math.sin(a)).toFixed(1)}" x2="${(500 + r2 * Math.cos(a)).toFixed(1)}" y2="${(500 + r2 * Math.sin(a)).toFixed(1)}"/>`; }).join('');
    const nodeHTML = nodes.map((n, i) => {
      const [x, y] = pos[n.id], p = person(n.id);
      return `<button type="button" class="jw-node r${n.ring}" data-jn-node="${n.id}" data-addr="${addrOf(n)}" style="--x:${(x * 100).toFixed(2)}%;--y:${(y * 100).toFixed(2)}%;--d:${(3.2 + (i % 5) * 0.55).toFixed(2)}s;--dl:${(-(i * 0.73) % 4).toFixed(2)}s" aria-label="${esc(p.name)}：${esc(n.role)}">
        <span class="jav">${avatar(n.id)}</span><span class="jw-name"><b class="nm">${esc(p.short)}</b><b class="cl">${esc(n.call[0] || p.short)}</b></span>
      </button>`;
    }).join('');
    // 流光：沿半径往返的小光点（只动 transform）
    const sparkIds = nodes.filter((_, i) => i % 2 === 0).slice(0, 9);
    const sparks = sparkIds.map((n, i) => {
      const r = RINGS[n.ring].r + (n.dr || 0);
      return `<i class="jw-spark r${n.ring}${i % 3 === 1 ? ' in' : ''}" style="--a:${n.a}deg;--len:${(r * 50).toFixed(2)}%;--t:${(3.6 + (i % 4) * 0.9).toFixed(2)}s;--dl:${(-i * 1.37).toFixed(2)}s"><b></b></i>`;
    }).join('');
    const groups = RINGS.map((r, i) => [i, r]).filter(([i]) => nodes.some((n) => n.ring === i));
    const addrs = {};
    nodes.forEach((n) => { const a = addrOf(n); if (a && a !== '家人') addrs[a] = (addrs[a] || 0) + 1; });
    const self = form === 'base' ? 'x-base' : 'x-alter';
    return `<h3 class="sub-h jn-h" data-reveal>她身边的星图 <small>${COPY[form].webSub}</small></h3>
      <p class="jw-intro" data-reveal>越靠近中心，越早走进她的生活。点一个名字：连线会亮起来，右边会告诉你他们怎么称呼彼此、在哪一站同行。</p>
      <div class="jn-web" data-reveal>
        <div class="jw-stage">
          <div class="jw-deco" aria-hidden="true"><div class="jw-spin"><svg viewBox="0 0 1000 1000">${ticks}</svg></div></div>
          <svg class="jw-lines" viewBox="0 0 1000 1000" aria-hidden="true">${rings}<g class="jw-links">${links}</g><g class="jw-spokes">${spokes}</g></svg>
          <div class="jw-sparks" aria-hidden="true">${sparks}<i class="jw-spark jw-selsp"><b></b></i></div>
          <div class="jw-core"><span class="jw-halo" aria-hidden="true"><i></i></span><span class="jav">${avatar(self, 160)}</span><b>${esc(D.forms[form].name)}</b></div>
          ${nodeHTML}
          <span class="jw-pill" aria-hidden="true"></span>
        </div>
        <aside class="jw-panel panel" aria-live="polite"></aside>
        <div class="jw-filters">
          <div class="jw-seg" role="group" aria-label="按关系筛选"><button type="button" class="on" data-jn-ring="all">全部</button>${groups.map(([i, r]) => `<button type="button" data-jn-ring="${i}"><i class="r${i}"></i>${r.zh}</button>`).join('')}</div>
          <div class="jw-seg jw-mode" role="group" aria-label="节点上显示"><button type="button" class="on" data-jn-mode="name">名字</button><button type="button" data-jn-mode="call">她的称呼</button></div>
          <div class="jw-addr" role="group" aria-label="她怎么称呼他们"><span class="mono">她这样称呼 →</span>${Object.entries(addrs).map(([a, c]) => `<button type="button" data-jn-addr="${a}">${a}<small>×${c}</small></button>`).join('')}</div>
        </div>
      </div>`;
  }
  // 中心的自己：两个形态各用自己的头像
  PEOPLE['x-base'] = { name: '艾雅法拉', short: '艾雅法拉', av: 'av:艾雅法拉' };
  PEOPLE['x-alter'] = { name: '纯烬艾雅法拉', short: '纯烬', av: 'av:纯烬艾雅法拉' };

  function panelHTML(n) {
    const p = person(n.id);
    const [me, them] = n.call;
    const stops = (n.stops || []).map((sid) => TRAIL[form].find((s) => s.id === sid)).filter(Boolean);
    const v = n.voice;
    return `<div class="jp-art r${n.ring}">${portrait(n.id)}<span class="jp-ring mono">${RINGS[n.ring].en}</span></div>
      <div class="jp-body">
        <p class="jp-role mono">${esc(n.role)}</p>
        <h4 class="jp-name">${esc(p.name)}${p.alias ? `<small>干员代号 · ${esc(p.alias)}</small>` : ''}</h4>
        ${me || them ? `<div class="jp-call">
          ${me ? `<span><small>她叫对方</small><b>${esc(me)}</b></span>` : ''}
          ${me && them ? '<i aria-hidden="true">⇄</i>' : ''}
          ${them ? `<span><small>对方叫她</small><b>${esc(them)}</b></span>` : ''}
        </div>` : ''}
        <p class="jp-text">${n.text}</p>
        ${v ? `<button type="button" class="jp-voice" data-jn-voice="${v[0]}|${v[1]}">${ico('play')}<span><b>听她说</b><small>${esc(v[2])}</small></span><i class="jp-eq" aria-hidden="true"><b></b><b></b><b></b><b></b></i></button>` : ''}
        ${stops.length ? `<div class="jp-stops"><span class="mono">同框的足迹</span>${stops.map((s) => `<button type="button" data-jn-go="${s.id}">${ico('arrow')}${esc(s.title)}</button>`).join('')}</div>` : ''}
        <p class="jp-src mono">出处 · ${esc(n.src)}</p>
      </div>`;
  }

  /* ====================================================
   * 交互
   * ==================================================== */
  let sel = null, stage = null, panel = null, pill = null;
  function select(id, opt = {}) {
    const n = WEB[form].find((x) => x.id === id);
    if (!n || !stage) return;
    sel = id;
    const rel = new Set([id]);
    LINKS[form].forEach(([a, b]) => { if (a === id) rel.add(b); if (b === id) rel.add(a); });
    stage.classList.add('has-sel');
    $$('.jw-node', stage).forEach((el) => { el.classList.toggle('sel', el.dataset.jnNode === id); el.classList.toggle('rel', rel.has(el.dataset.jnNode)); });
    $$('.jw-spoke', stage).forEach((el) => el.classList.toggle('rel', el.dataset.e === id));
    $$('.jw-link', stage).forEach((el) => el.classList.toggle('rel', el.dataset.l.split(' ').includes(id)));
    panel.innerHTML = panelHTML(n);
    panel.classList.remove('swap'); void panel.offsetWidth; panel.classList.add('swap');
    placePill(n);
    // 选中的那条连线上，一颗更亮的光点从她身边一遍遍跑向对方
    const sp = $('.jw-selsp', stage);
    if (sp) {
      const r = RINGS[n.ring].r + (n.dr || 0);
      sp.style.setProperty('--a', n.a + 'deg');
      sp.style.setProperty('--len', (r * 50).toFixed(2) + '%');
      sp.className = `jw-spark jw-selsp r${n.ring}`;
    }
    if (opt.fx && window.FX && !reduce) {
      const el = $(`.jw-node[data-jn-node="${id}"]`, stage);
      if (el) { const r = el.getBoundingClientRect(); if (form === 'base') FX.emberBurst(r.left + r.width / 2, r.top + r.height / 2, 10, [30, 110], { g: -30 }); else FX.ashBurst(r.left + r.width / 2, r.top + r.height / 2, 10, [30, 110]); }
    }
    if (opt.sfx && window.AUDIO) AUDIO.sfx('select');
  }
  /** 称呼的小胶囊：浮在那个人的头像上方（她怎么叫对方 ⇄ 对方怎么叫她） */
  function placePill(n) {
    if (!pill) return;
    const [x, y] = nodePos(n);
    const [me, them] = n.call;
    const txt = me && them ? `${me} ⇄ ${them}` : me || them || person(n.id).short;
    pill.textContent = txt;
    pill.style.setProperty('--px', (x * 100).toFixed(2) + '%');
    pill.style.setProperty('--py', (y * 100).toFixed(2) + '%');
    pill.classList.remove('on'); void pill.offsetWidth; pill.classList.add('on');
  }
  function filterRing(v) {
    $$('[data-jn-ring]', root).forEach((b) => b.classList.toggle('on', b.dataset.jnRing === v));
    $$('[data-jn-addr]', root).forEach((b) => b.classList.remove('on'));
    stage.classList.toggle('filtering', v !== 'all');
    $$('.jw-node', stage).forEach((el) => {
      const n = WEB[form].find((x) => x.id === el.dataset.jnNode);
      el.classList.toggle('out', v !== 'all' && String(n.ring) !== v);
    });
    $$('.jw-spoke', stage).forEach((el) => { const n = WEB[form].find((x) => x.id === el.dataset.e); el.classList.toggle('out', v !== 'all' && String(n.ring) !== v); });
  }
  function filterAddr(a) {
    const btn = $(`[data-jn-addr="${a}"]`, root);
    const was = btn && btn.classList.contains('on');
    $$('[data-jn-addr]', root).forEach((b) => b.classList.toggle('on', !was && b === btn));
    $$('[data-jn-ring]', root).forEach((b) => b.classList.toggle('on', b.dataset.jnRing === 'all'));
    stage.classList.toggle('filtering', !was);
    $$('.jw-node', stage).forEach((el) => el.classList.toggle('out', !was && el.dataset.addr !== a));
    $$('.jw-spoke', stage).forEach((el) => { const n = WEB[form].find((x) => x.id === el.dataset.e); el.classList.toggle('out', !was && addrOf(n) !== a); });
  }
  /**
   * 滚到某个元素。沿途没渲染过的区块（content-visibility）用的是估计高度，渲染出来会变——
   * 平滑滚动停下后再量一次，不对就直接对齐（最多几次），和 main.js 的 jumpTo 同一个思路
   */
  let scrollTok = 0;
  /** target 可以是元素，也可以是每次重新查找元素的函数（目标区块可能在途中才按新形态重绘） */
  function scrollToEl(target, dy = 90) {
    const get = typeof target === 'function' ? target : () => target;
    if (!get()) return;
    const tok = ++scrollTok;
    const go = (b) => { const el = get(); if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY - dy, behavior: b }); };
    go(reduce ? 'instant' : 'smooth');
    let n = 0;
    const fix = () => {
      if (tok !== scrollTok) return;
      const el = get();
      if (el && Math.abs(el.getBoundingClientRect().top - dy) > 3 && n++ < 8) { go('instant'); setTimeout(fix, 220); }
    };
    if ('onscrollend' in window) addEventListener('scrollend', () => setTimeout(fix, 60), { once: true });
    setTimeout(fix, 1500);
  }

  /* ---------- 语音（用页面共用的播放器；语言跟随语音区的选择） ---------- */
  let playingBtn = null;
  function voiceLang() { try { const v = JSON.parse(localStorage.getItem('eyja.lang')); return ['jp', 'cn', 'kr', 'en'].includes(v) ? v : 'jp'; } catch (e) { return 'jp'; } }
  function playVoice(btn) {
    if (!window.AUDIO) return;
    if (playingBtn === btn) { AUDIO.stopVoice(); return; }
    const [dir, n] = btn.dataset.jnVoice.split('|');
    let lang = voiceLang();
    const charDir = dir === 'base' || dir === 'alter' ? CHAR[dir] : dir;
    if (/epoque__57/.test(charDir) && !['cn', 'jp'].includes(lang)) lang = 'jp';
    const url = D.voiceUrl(lang, charDir, +n);
    if (playingBtn) playingBtn.classList.remove('playing');
    playingBtn = btn;
    btn.classList.add('playing');
    AUDIO.playVoice(url, (st) => {
      if (st === 'playing') return;
      if (playingBtn === btn && st !== 'playing') { btn.classList.remove('playing'); playingBtn = null; }
    });
  }

  /* ---------- 火山旅梦轮播 ---------- */
  let beat = 0;
  function setBeat(i, user) {
    const car = $('.js-car', root);
    if (!car) return;
    const slides = $$('.js-slide', car), tabs = $$('.js-tab', root);
    const n = slides.length;
    beat = (i + n) % n;
    [beat, (beat + 1) % n].forEach((k) => { const im = $('img', slides[k]); if (im && im.dataset.src) { im.src = im.dataset.src; im.removeAttribute('data-src'); } });
    slides.forEach((s, k) => s.classList.toggle('on', k === beat));
    tabs.forEach((t, k) => { t.classList.toggle('on', k === beat); t.classList.toggle('done', k < beat); });
    // 进度条动画重新开始（animationend 驱动自动翻页）
    const bar = $('.js-bar', tabs[beat]);
    if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    const js = $('.jf-sl', root);
    if (js) js.classList.toggle('held', !!user);
    if (user && window.AUDIO) AUDIO.sfx('slide');
  }

  /* ---------- 小路：进度线、当前站、小羊 ---------- */
  let trailEl = null, fillEl = null, walker = null, pinTops = [], stopEls = [], curStop = -1, raf = 0, walkT = 0, lastY = 0;
  function measureTrail() {
    if (!trailEl) return;
    const top = trailEl.getBoundingClientRect().top;
    stopEls = $$('.jt-stop[data-stop]', trailEl);
    pinTops = stopEls.map((s) => $('.jt-pin', s).getBoundingClientRect().top - top);
  }
  function trailFrame() {
    raf = 0;
    if (!trailEl) return;
    const r = trailEl.getBoundingClientRect();
    const mid = innerHeight * 0.5 - r.top;
    const f = clamp(mid / r.height, 0, 1);
    fillEl.style.transform = `scaleY(${f.toFixed(4)})`;
    let cur = -1;
    for (let i = 0; i < pinTops.length; i++) if (pinTops[i] < mid + 40) cur = i;
    if (cur !== curStop) {
      if (stopEls[curStop]) stopEls[curStop].classList.remove('cur');
      if (stopEls[cur]) stopEls[cur].classList.add('cur');
      curStop = cur;
    }
    const y = scrollY;
    if (walker && Math.abs(y - lastY) > 1) {
      walker.classList.add('walk');
      walker.classList.toggle('up', y < lastY);
      clearTimeout(walkT);
      walkT = setTimeout(() => walker && walker.classList.remove('walk'), 220);
    }
    lastY = y;
  }
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(trailFrame); };

  function mount() {
    stage = $('.jw-stage', root);
    panel = $('.jw-panel', root);
    pill = $('.jw-pill', root);
    trailEl = $('.jn-trail', root);
    fillEl = $('.jt-fill', root);
    walker = $('.jt-walker', root);
    curStop = -1;
    select(form === 'base' ? 'doctor' : 'keller');

    // 动画闸门：各块只在接近视野时播放（整段有上万像素，区块级闸门太粗）
    const gate = new IntersectionObserver((ens) => ens.forEach((en) => en.target.classList.toggle('anim-off', !en.isIntersecting)), { rootMargin: '15% 0px' });
    $$('.jn-lede, .jn-rib, .jn-web, .jt-stop, .jt-rail', root).forEach((el) => gate.observe(el));
    offs.push(() => gate.disconnect());

    // 小路可见时才挂滚动监听
    let live = false;
    const tio = new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !live) { live = true; measureTrail(); lastY = scrollY; addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
      else if (!en.isIntersecting && live) { live = false; removeEventListener('scroll', onScroll); }
    });
    tio.observe(trailEl);
    offs.push(() => { tio.disconnect(); removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); raf = 0; });
    // 图片加载、字体到位后站点位置会变：尺寸变化时重新量一次
    if (window.ResizeObserver) {
      let t = 0;
      const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { measureTrail(); onScroll(); }, 120); });
      ro.observe(trailEl);
      offs.push(() => { ro.disconnect(); clearTimeout(t); });
    }

    // 轮播：进度条动画结束就翻页（离屏时 .anim-off 暂停动画，自然就不翻了）
    const car = $('.jf-sl', root);
    if (car) {
      beat = 0;
      on(car, 'animationend', (e) => { if (e.target.classList.contains('js-bar') && e.target.closest('.js-tab.on')) setBeat(beat + 1); });
      on($('.js-car', car), 'keydown', (e) => { if (e.key === 'ArrowLeft') setBeat(beat - 1, true); if (e.key === 'ArrowRight') setBeat(beat + 1, true); });
      let sx = 0;
      on($('.js-car', car), 'pointerdown', (e) => { sx = e.clientX; });
      on($('.js-car', car), 'pointerup', (e) => { const dx = e.clientX - sx; if (Math.abs(dx) > 40) setBeat(beat + (dx < 0 ? 1 : -1), true); });
    }
  }

  /* 事件委托：挂一次，跨重绘复用（#journey 这个节点不会被替换） */
  function bindOnce(el) {
    if (el.__jnBound) return;
    el.__jnBound = true;
    el.addEventListener('click', (e) => {
      const t = e.target;
      // 「切换形态，看另一段足迹」：切换本身由 main.js 处理；等新形态渲染好、上方区块的高度稳定后，把视口对准新小路的开头
      if (t.closest('.jt-next [data-act="form"]')) {
        const f0 = form;
        let k = 0, fixes = 0;
        const fix = () => {
          if (form === f0) { if (++k < 16) setTimeout(fix, 250); return; }
          const h = $('.jn-trail', root) && $('.jn-trail', root).previousElementSibling;
          if (!h) return;
          const d = h.getBoundingClientRect().top - 90;
          if (Math.abs(d) > 4) scrollTo({ top: scrollY + d, behavior: fixes ? 'instant' : reduce ? 'instant' : 'smooth' });
          if (++fixes < 6) setTimeout(fix, fixes === 1 ? 900 : 350);
        };
        setTimeout(fix, 1500);
        return;
      }
      const node = t.closest('[data-jn-node]');
      if (node) {
        const id = node.dataset.jnNode;
        const inStage = node.closest('.jw-stage');
        select(id, { fx: true, sfx: true });
        if (!inStage) scrollToEl($('.jn-web', root), 70);
        return;
      }
      const go = t.closest('[data-jn-go]');
      if (go) { scrollToEl(document.getElementById('jn-' + go.dataset.jnGo), 80); if (window.AUDIO) AUDIO.sfx('tick'); return; }
      const ring = t.closest('[data-jn-ring]');
      if (ring) { filterRing(ring.dataset.jnRing); if (window.AUDIO) AUDIO.sfx('tab'); return; }
      const md = t.closest('[data-jn-mode]');
      if (md) {
        $$('[data-jn-mode]', root).forEach((b) => b.classList.toggle('on', b === md));
        stage.classList.toggle('show-call', md.dataset.jnMode === 'call');
        if (window.AUDIO) AUDIO.sfx('tab');
        return;
      }
      const ad = t.closest('[data-jn-addr]');
      if (ad) { filterAddr(ad.dataset.jnAddr); if (window.AUDIO) AUDIO.sfx('tab'); return; }
      const vb = t.closest('[data-jn-voice]');
      if (vb) { playVoice(vb); return; }
      const bt = t.closest('[data-jn-beat]');
      if (bt) { setBeat(+bt.dataset.jnBeat, true); return; }
      const st = t.closest('[data-jn-step]');
      if (st) { setBeat(beat + +st.dataset.jnStep, true); return; }
      const rd = t.closest('[data-jn-riddle]');
      if (rd) {
        rd.classList.add('on');
        rd.setAttribute('aria-pressed', 'true');
        if (window.AUDIO) AUDIO.sfx('flip');
        const q = rd.closest('.jq');
        if (q && !q.classList.contains('solved') && $$('.jq-card.on', q).length === RIDDLE.length) {
          q.classList.add('solved');
          setTimeout(() => {
            const fl = $('.jq-flower', q);
            if (window.AUDIO) AUDIO.sfx('reveal');
            if (fl && window.FX && !reduce) { const r = fl.getBoundingClientRect(); FX.ashBurst(r.left + r.width / 2, r.top + r.height / 2, 22, [40, 160]); }
          }, 380);
        }
        return;
      }
      const sl = t.closest('[data-jn-story]');
      if (sl) {
        // 「故事」若还停在另一形态（切换后看不见的区块稍后才重绘），先滚向区块，重绘出来后再对准那一章
        const id = 'st-' + sl.dataset.jnStory;
        scrollToEl(() => document.getElementById(id) || document.getElementById('story'), 70);
        if (window.AUDIO) AUDIO.sfx('tick');
        return;
      }
      const wk = t.closest('[data-jn-walker]');
      if (wk) {
        wk.classList.remove('baa'); void wk.offsetWidth; wk.classList.add('baa');
        if (window.AUDIO) AUDIO.sfx('bleat');
        const r = wk.getBoundingClientRect();
        if (window.FX && !reduce) { if (form === 'base') FX.emberBurst(r.left + r.width / 2, r.top + r.height / 3, 12, [30, 120], { g: -30 }); else FX.ashBurst(r.left + r.width / 2, r.top + r.height / 3, 12, [30, 120]); }
      }
    });
    // 鼠标经过星图节点：临时亮起它的连线与称呼（不改面板）
    el.addEventListener('pointerover', (e) => {
      const node = e.target.closest && e.target.closest('.jw-stage [data-jn-node]');
      if (!node || e.pointerType === 'touch') return;
      const n = WEB[form].find((x) => x.id === node.dataset.jnNode);
      if (!n) return;
      stage.classList.add('hovering');
      $$('.jw-spoke', stage).forEach((l) => l.classList.toggle('hov', l.dataset.e === n.id));
      $$('.jw-link', stage).forEach((l) => l.classList.toggle('hov', l.dataset.l.split(' ').includes(n.id)));
      placePill(n);
    });
    el.addEventListener('pointerout', (e) => {
      const node = e.target.closest && e.target.closest('.jw-stage [data-jn-node]');
      if (!node || (e.relatedTarget && node.contains(e.relatedTarget))) return;
      stage.classList.remove('hovering');
      $$('.jw-spoke.hov, .jw-link.hov', stage).forEach((l) => l.classList.remove('hov'));
      const n = WEB[form].find((x) => x.id === sel);
      if (n) placePill(n);
    });
    // 键盘：焦点移到节点上就显示它
    el.addEventListener('focusin', (e) => {
      const node = e.target.closest && e.target.closest('.jw-stage [data-jn-node]');
      if (node && e.target.matches(':focus-visible')) select(node.dataset.jnNode);
    });
  }

  function render(el, f, c) {
    if (!el) return;
    offs.splice(0).forEach((fn) => { try { fn(); } catch (e) { /* 已拆 */ } });
    if (playingBtn && window.AUDIO) { AUDIO.stopVoice(); playingBtn = null; }
    root = el; form = f === 'alter' ? 'alter' : 'base'; ctx = c || {};
    const head = ctx.head || ((no, en, zh, d) => `<div class="wrap"><h2>${zh}</h2><p>${d}</p></div>`);
    el.innerHTML = head('04', 'FOOTPRINTS', '足迹', COPY[form].desc) + `
      <div class="wrap jn f-${form}">
        ${lede()}
        ${ribbon()}
        ${trail()}
        ${web()}
      </div>`;
    bindOnce(el);
    mount();
  }

  return { render, TRAIL, WEB, PEOPLE };
})();
