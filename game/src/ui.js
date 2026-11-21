import './ui.css';
import estateOverhead from './ui-assets/estate-overhead.webp?inline';
import { lookAhead, makeNavigator, routeLength } from './navigation.js';
import { createPhoneNavigation } from './ui-navigation.js';
import { bindTouchControls } from './ui-touch.js';
import { createPocketMap } from './pocket-map.js';

const ink = '#211f19';
const paper = '#fff7df';
const yellow = '#ffd236';
const svgNS = 'http://www.w3.org/2000/svg';
let edition = 0;

const marks = {
  brand: '<path d="M2 16h19M4 14c0-5 3-8.5 8-9l-2.8 5.5 4.8-2-2 5.5H4ZM15 5.3c3.7 1.2 5.2 4 5.4 7.7h-5.8M6 19h11"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  turn: '<path d="M12 21V4m-7 8 7-8 7 8"/>',
  left: '<path d="m14.5 5-7 7 7 7"/>',
  right: '<path d="m9.5 5 7 7-7 7"/>',
  map: '<path d="m2.5 5 6-2 7 3 6-2v15l-6 2-7-3-6 2zm6-2v15m7-12v15"/>',
  clock: '<circle cx="12" cy="14" r="7.5"/><path d="M12 10v4l3 1M9 2.5h6M12 3v3m5.5 1.5 2-2"/>',
  bag: '<path d="M4 8h16l1 13H3zm4 0V7a4 4 0 0 1 8 0v1m-8 6h8"/>',
  home: '<path d="m2 11 10-8 10 8m-17-2v12h14V9m-9 12v-7h4v7"/>',
  wrench: '<path d="M20.6 3.5a6 6 0 0 1-7.1 8.1L6 19.2a2.4 2.4 0 0 1-3.4-3.4l7.6-7.5a6 6 0 0 1 8-7l-4 4 3 3z"/>',
  pause: '<path d="M7 4h3v16H7zm7 0h3v16h-3z" fill="currentColor" stroke="none"/>',
  volume: '<path d="M3 9h4l5-4v14l-5-4H3zm12 0q3 3 0 6m3-9q6 6 0 12"/>',
  quiet: '<path d="M3 9h4l5-4v14l-5-4H3zm13 0 5 6m0-6-5 6"/>',
  swap: '<path d="M3 8h17l-4-4m5 12H4l4 4"/>',
  flag: '<path d="M5 22V3m1 1q4-3 8 0t7 0v9q-3 3-7 0t-8 0"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  wet: '<path d="M12 2C10 6 5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-5-9-7-13zm-3 13q0 3 3 3"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  straight: '<path fill="currentColor" stroke="none" d="M12 1 21 11h-6v12H9V11H3z"/>',
  bendRight: '<path fill="currentColor" stroke="none" d="m14 1 9 7-9 7v-4H9a3 3 0 0 0-3 3v9H1V13a7 7 0 0 1 7-7h6z"/>',
  bendLeft: '<path fill="currentColor" stroke="none" d="m10 1-9 7 9 7v-4h5a3 3 0 0 1 3 3v9h5V13a7 7 0 0 0-7-7h-6z"/>',
  forkRight: '<path d="M5 22v-5q0-4 3-7l7-7" stroke-width="4"/><path fill="currentColor" stroke="none" d="M9 1h12v12z"/>',
  forkLeft: '<path d="M19 22v-5q0-4-3-7l-7-7" stroke-width="4"/><path fill="currentColor" stroke="none" d="M15 1H3v12z"/>',
  uTurn: '<path d="M5 22V10a6.5 6.5 0 0 1 13 0v6" stroke-width="4"/><path fill="currentColor" stroke="none" d="m12 13 6 9 6-9z"/>',
  stairsUp: '<path d="M2 21h6v-5h5v-5h5V6h4M3 12l8-9M5 3h6v6"/>',
  stairsDown: '<path d="M2 21h6v-5h5v-5h5V6h4M11 3l-8 9m0-6v6h6"/>',
  door: '<path d="M4 21V3h14v18m-16 0h19M8 20V6l7-1v16m-3-8h.1"/>',
  exitDoor: '<path d="M12 4V2H3v20h9v-3m-4-7h14m-5-5 5 5-5 5"/>',
  pin: '<path fill="currentColor" fill-rule="evenodd" stroke="none" d="M12 1a8.5 8.5 0 0 0-8.5 8.5C3.5 16 12 23 12 23s8.5-7 8.5-13.5A8.5 8.5 0 0 0 12 1Zm0 5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z"/>',
  fold: '<path d="m5 13 7-7 7 7m-14 6 7-7 7 7" stroke-width="2.5"/>',
  expand: '<path d="M14 3h7v7m0-7-8 8M4 8v12h12" stroke-width="2.5"/>',
  run: '<circle cx="16.5" cy="3.5" r="2" fill="currentColor" stroke="none"/><path d="m5 11 3-4 5 1 3 5 5 1m-8-6-4 7 5 3v4m-5-7-3 5H2"/>',
  mount: '<circle cx="5" cy="17" r="3.2"/><circle cx="19" cy="17" r="3.2"/><path d="M4 12h6l2 4h4l-2-9h-3m-8 2h5"/>',
};

function icon(name) {
  return '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + marks[name] + '</svg>';
}

export function brandIconDataUrl() {
  const badge = `<svg xmlns="${svgNS}" viewBox="-2 -2 28 28" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="-1" y="-1" width="26" height="26" rx="3" fill="${yellow}"/>${marks.brand}</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(badge);
}

const panels = [
  { place: '上午 · 牛逼科技', title: '我的工位，先下班了。', voice: '“恭喜！您的岗位已实现零人工。”',
    caption: '离职通知是 AI 写的。末尾还请我给本次服务打分。',
    scene: '高楼的整面广告屏亮起了算法的笑脸，下面的办公窗口仍排得整整齐齐。',
    detail: '职员抱着纸箱，身前的工牌上盖着停用章。' },
  { place: '楼下 · 配送站', title: '工牌换头盔。', voice: '“头盔拿稳。路是你跑，表是它掐。”',
    caption: '工牌交回去了。车钥匙递过来时，手里倒重了几分。',
    scene: '柜台两边伸出两双手，交接一顶带黑色闪电条纹的黄色头盔。',
    detail: '带配送站吊牌的车钥匙从旧工牌前垂下。' },
  { place: '第一天 · 牛逼广场', title: '广场见，骑手上线。', voice: '“成功送达两单，今天才能收工。”',
    caption: '我把车停在广场，掏出手机。先看取送地点，再决定接单。',
    scene: '戴黄头盔的骑手跨上鬼火摩托，后座外卖箱朝向广场上的楼群。',
    detail: '手机上的接单通知亮起，取餐与收餐地点由一条路线连在一起。' },
];

// Each plate is hand-drawn in a shared three-ink print palette.
function plate(id, width, body, description) {
  const drawing = body.replaceAll('@dots', 'url(#' + id + '-d)').replaceAll('@hatch', 'url(#' + id + '-h)').replaceAll('@win', 'url(#' + id + '-w)');
  return `<svg viewBox="0 0 ${width} 340" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${description}" xmlns="${svgNS}">
    <defs>
      <pattern id="${id}-d" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.25" fill="${ink}" opacity=".48"/></pattern>
      <pattern id="${id}-h" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0v9" stroke="${ink}" stroke-width="2" opacity=".65"/></pattern>
      <pattern id="${id}-w" width="29" height="22" patternUnits="userSpaceOnUse"><path fill="${ink}" d="M2 3h19v12H2z"/><path d="M5 5h12" stroke="${paper}" opacity=".55" stroke-width="2"/></pattern>
    </defs>
    <g stroke="${ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${drawing}</g>
  </svg>`;
}

const tower = `
  <path fill="#e6dcba" stroke="none" d="M0 0h560v340H0z"/><path fill="@dots" stroke="none" d="M0 0h560v183L0 248z"/>
  <path fill="${paper}" stroke="none" d="m-24 130 140-47-35 20 115-16-167 57zm403-83 38-17-5 9 103-19-79 24z"/>
  <g fill="#b9b295" stroke-width="2"><path d="M-12 199h39v-27l38-8v39l24-2v94h-101zm403-18 32-7 2-16 20-4 3 18 22-4v86h-79zm72-28 26-4v-28l23-5v28l39-4v110h-88z"/></g>
  <path fill="${ink}" d="m52 340 38-115 114-23 3 104z"/><path fill="@win" d="m71 325 30-91 91-18-9 80z"/>
  <path fill="${yellow}" d="m100 340 87-280 147-40 67 45-10 211z"/><path fill="${paper}" d="m100 340 87-280 147-40-42 254z"/>
  <path fill="@win" d="m125 305 71-233 122-33-36 223z"/>
  <path fill="${ink}" d="m329 32 61 39-11 186-74 17z"/><path fill="@hatch" stroke="none" d="m317 234 64-160 7 8-12 156z"/>
  <g stroke="${paper}" stroke-width="3" opacity=".75"><path d="m335 54-25 183m41-177-19 177m33-168-10 159"/></g>
  <path fill="${ink}" d="m172 106 141-39-12 91-155 38z"/><path fill="${yellow}" d="m178 111 127-34-11 73-137 34z"/>
  <g transform="matrix(1,-.24,-.14,1,189,126)" fill="${ink}" stroke="none"><rect x="7" y="0" width="12" height="16" rx="5"/><rect x="62" y="0" width="12" height="16" rx="5"/><path d="M18 23q23 16 43-1-12 27-34 16z"/></g>
  <path d="m211 52 4-18 68-18-2 16m-46-5 3-17m18 13 2-15" fill="none"/>
  <path d="m-16 296 132-39m267-16 177-50m-121 37 64-22M-5 310l83-26" stroke-width="2"/>
  <path fill="${ink}" d="m0 322 560-122v140H0z"/><path fill="#a8a38a" d="m0 339 560-129v24L67 340z"/>
  <path stroke="${paper}" stroke-width="3" d="m186 310 329-77m-277 88 203-49"/>
  <g transform="translate(410 229) rotate(-11)"><path fill="${yellow}" d="M0 2h118v30H0z"/><path fill="${ink}" d="M18 32v48h-5V32m92 0v34h-5V32"/>
  <text x="59" y="23" text-anchor="middle" fill="${ink}" stroke="none" font-size="17" font-weight="900">牛逼科技</text></g>
  <path stroke="${ink}" stroke-width="1.5" d="m26 90 59-18m-69 28 43-12m372 11 54-16m-44 23 32-10"/>
`;

const worker = `
  <path fill="${yellow}" stroke="none" d="M0 0h330v340H0z"/><path fill="@dots" stroke="none" d="m0 0 300 340H0z"/>
  <path fill="${paper}" d="M-16 346q7-78 76-102l31-14 57 5 49 39 32 72z"/><path fill="@hatch" d="m-6 332 65-73 18 36-12 50H-6z"/>
  <path fill="#dfc69b" d="m92 197 45-1-1 35 17 15-31 20-41-28 15-11z"/>
  <path fill="${paper}" d="M72 152q-5-43 40-53 49-13 61 24l-2 41 11 15-13 5q-4 35-30 40-22 2-43-23l-10-19q-12 0-15-13-3-12 7-13z"/>
  <path fill="${ink}" d="m73 156-12-9 8-11-9 2 6-18-6-5 17-10-3-9 17-1q11-17 30-9l18-9 2 8q33-4 39 12l-5 6 7 7-6 18-14-11-16 8 1-12-17 17-1-10-18 16-10-3-4 23-7 3-5-10-7 2z"/>
  <g fill="none" stroke-width="2.5"><path d="m123 150 14-4m16-1 13-2m-22 8 3 16-6 3m-12 20q12-1 20-5m-66-18 7 6"/></g>
  <g fill="${ink}" stroke="none"><ellipse cx="133" cy="154" rx="2.5" ry="4"/><ellipse cx="160" cy="149" rx="2.5" ry="4"/></g>
  <path fill="${yellow}" d="m80 235 22 19-9 21-21-34zm60-5 19 10-26 28-10-15z"/>
  <path fill="none" stroke-width="4" d="m94 256 17 47 26-43"/><path fill="${ink}" d="m98 299 28-2 2 20-29 4z"/>
  <path fill="#ceb98b" d="m84 296 129-51 116 30-20 70H100z"/><path fill="${paper}" d="m85 296 107 34 138-55-109-33z"/>
  <path fill="${ink}" d="m106 281-12-45 21-6 14 40zm15-12 10-33 17 5-9 24z"/><path fill="${yellow}" d="m144 271-7-45 45-5 7 38z"/><path fill="${paper}" d="m153 245 24-3 3 12-25 2z"/>
  <path d="m193 330 2 14m25-103-20-22-29 37m74 64 28-10" fill="none"/>
  <g transform="translate(238 189) rotate(13)"><rect x="-16" y="-23" width="76" height="62" rx="4" fill="${paper}"/><path d="M8-23q8-14 13 0" fill="none"/><rect x="-10" y="-6" width="62" height="33" fill="${yellow}"/><text x="21" y="17" text-anchor="middle" fill="${ink}" stroke="none" font-size="20" font-weight="900">停用</text></g>
`;

const handoff = `
  <path fill="${paper}" stroke="none" d="M0 0h560v340H0z"/><path fill="@dots" stroke="none" d="M0 0h560v165L0 281z"/>
  <path fill="${yellow}" d="m-9 202 569-131v49L0 253z"/><path fill="${ink}" d="m-9 241 569-130v9L0 253z"/>
  <g fill="none" stroke-width="2"><path d="m11 102 106 22m-82-38 89 30m243-41 121-38m-115 46 71-18m-324 152-92 28m111-23-65 27"/></g>
  <path fill="${ink}" d="m-6 126 88 5 79 36-15 44-93-10-59-6z"/><path fill="@hatch" stroke="${paper}" d="m6 143 75 5 59 25-6 22-72-11-56-4z"/>
  <path fill="${paper}" d="m139 160 32 8 24-7 43-27q11-5 14 3 1 4-5 9l-22 15 33-11q10-3 12 3 1 5-7 9l-29 13-23 16-41 4-24 8z"/>
  <path fill="${paper}" d="m121 155 25 5-1 47-26-6z"/><circle cx="132" cy="192" r="4" fill="${ink}"/>
  <g transform="rotate(-9 285 196)">
    <path fill="${ink}" d="M174 215q-3-62 38-100 33-34 88-33 78 0 103 80l12 36-21 13-30-6-14 45-38 16-83-23-41-8z"/>
    <path fill="${yellow}" d="M179 209q0-66 46-101 45-32 95-16 49 16 69 64l-34 9-15 38-47 28-77-8z"/>
    <path fill="@hatch" stroke="none" d="M190 199q6-65 68-98-42 37-37 109z"/>
    <path fill="${paper}" d="m208 177 56-59-16 34 65-39-38 52 46-21-69 63 15-36-50 27z"/>
    <path fill="${ink}" d="m300 166 86-14 15 35-16 11-47-4-16 22-24-3z"/>
    <path fill="#979988" d="m311 171 71-12 10 22-22 6-46-3-10 14z"/>
    <path d="m344 170 24-5m-39 16 19-4" stroke="${paper}" stroke-width="3"/>
    <circle cx="302" cy="195" r="11" fill="${yellow}"/><circle cx="302" cy="195" r="4" fill="${ink}"/>
    <path fill="${yellow}" d="m341 210 32-8 24 4-19 30-35 13-15-8z"/><path d="m352 223 22-8m-27 17 21-8" stroke-width="4"/>
  </g>
  <path fill="${paper}" d="m448 236-32-15-46-5-20-8q-9-4-12 4-1 6 10 11l13 6-41-3-27-11q-9-2-11 5-1 4 8 9l15 11-24-8q-10-2-11 5-1 4 9 9l43 18 41 6 59-2 32 13z"/>
  <path d="m302 239 26 10 30 4m-8-23 27 5" fill="none" stroke-width="2"/>
  <path fill="${yellow}" d="m444 224 38 15-12 55-41-15z"/><path fill="${ink}" d="m475 221 92 19v92l-108-43z"/><path stroke="${yellow}" stroke-width="6" d="m481 245 81 23m-85-14 82 24"/>
  <path fill="${ink}" d="m0 317 560-33v56H0z"/><path stroke="${paper}" stroke-width="2" d="m29 325 491-28"/>
`;

const keys = `
  <path fill="#d7cda9" stroke="none" d="M0 0h330v340H0z"/><path fill="@hatch" stroke="none" d="m-5 70 137-70h61L0 207z"/>
  <path fill="${ink}" stroke="none" d="m26 301 247-43-29 56-207 26z"/>
  <g transform="rotate(-15 145 211)"><rect x="37" y="140" width="175" height="108" rx="6" fill="${paper}"/><path fill="${yellow}" d="M38 152h174v19H38z"/><rect x="56" y="178" width="44" height="52" fill="#d5c7a7"/><circle cx="78" cy="192" r="9" fill="${ink}"/><path fill="${ink}" d="M61 224q2-28 17-28t18 28z"/><path d="M111 188h74m-74 12h49m-49 18h67" stroke-width="4"/><path d="m42 239 155-91" stroke-width="6"/></g>
  <g transform="rotate(15 212 182)"><ellipse cx="203" cy="129" rx="29" ry="41" fill="none" stroke-width="9"/><ellipse cx="203" cy="128" rx="26" ry="39" stroke="${paper}" fill="none" stroke-width="2"/>
  <path fill="${yellow}" d="m178 151 34 3 12 19-11 26-35-2-10-22z"/><circle cx="192" cy="163" r="5" fill="${ink}"/>
  <path fill="${paper}" d="m183 196 18 1-4 76-10 9-9-9 4-11-4-8 5-7-4-6z"/>
  <path fill="${ink}" d="m213 159 37-8 18 23-27 58-37-15z"/><path d="m234 173-8 18 11-3-11 23" fill="none" stroke="${yellow}" stroke-width="4"/></g>
  <g stroke-width="2"><path d="m255 114 17-15m-10 26 24-7m-9 16 13 1m-129-37-16-9"/></g>
`;

function wheel(cx, cy, r) {
  const spokes = Array.from({ length: 8 }, (_, i) => `<path transform="rotate(${i * 45})" d="M0 -7 -5 -${r - 11}l6 -3 7 23z" fill="${ink}" stroke="none"/>`).join('');
  return `<g transform="translate(${cx} ${cy})"><circle r="${r}" fill="${ink}"/><circle r="${r - 6}" fill="none" stroke="@hatch" stroke-width="5"/><circle r="${r - 11}" fill="#c4bba0" stroke="${paper}"/>${spokes}<circle r="9" fill="${yellow}"/><circle r="3" fill="${ink}"/></g>`;
}

const rider = `
  <path fill="${yellow}" stroke="none" d="M0 0h560v340H0z"/><path fill="@dots" stroke="none" d="M0 0h560v115L0 203z"/>
  <path fill="#d2c8a5" d="m-5 187 7-88 41-8v55l29-4 3-47 46-7-3 41 31-6 2 73zm342-37 3-54 37-8V64l28-4 2 50 27-3 2-54 59-7 2 62 24-7 2-23 39-6v93z"/>
  <path fill="@win" stroke="none" d="M10 105h27v40H10zm432-40h39v43h-39zm83 17h30v33h-30z"/>
  <path fill="${paper}" d="M0 196 560 115v225H0z"/><path fill="@dots" stroke="none" d="m0 277 560-109v43L0 325z"/>
  <path fill="${ink}" stroke="none" d="m0 323 560-125v12L0 338z"/><path d="m0 230 89-12m322-67 117-18m-68 22 89-13m-427 144-83 20" stroke-width="2"/>
  <ellipse cx="287" cy="306" rx="188" ry="13" fill="${ink}" opacity=".89" stroke="none"/>
  ${wheel(173, 267, 45)}${wheel(392, 265, 48)}
  <path fill="${ink}" d="m118 230 39-34 83-3 55 46 42-32 35-5-47 78-88 1-39-50z"/>
  <path fill="${yellow}" d="m130 218 32-18 82-4 43 41-27 15-42-17-39-4-6-9z"/>
  <path fill="${paper}" d="m150 229 81 2 27 35-21 11-38-28-39-8z"/><path stroke="#9a9a86" stroke-width="8" d="m168 262 63-13 32 21h61"/>
  <path fill="${yellow}" d="m327 242 18-55 28-25 19 16-5 25-35 24-20 35-33 11-38-1 3-10 48-3z"/>
  <path fill="${paper}" d="m368 172 14-10 14 6-8 14-18 2z"/><path stroke="${ink}" stroke-width="8" d="m365 205 27 58"/><path stroke="${paper}" stroke-width="3" d="m376 223 16 34"/>
  <path fill="${ink}" d="m343 183 10-27 18-5 5 6-16 5-3 21z"/><path d="m356 156 7-18m0-1 17-4" fill="none"/>
  <path fill="${ink}" d="m184 194 41-6 23 11-2 9-59-5z"/>
  <g transform="rotate(-4 157 176)"><path fill="${yellow}" d="M100 139h83l11 13v41H98z"/><path fill="${ink}" d="M96 137h87l7 11H94z"/><path fill="${paper}" d="M108 155h59v26h-59z"/><text x="137" y="174" text-anchor="middle" fill="${ink}" stroke="none" font-size="15" font-weight="900">外 卖</text><path d="M180 153v34"/></g>
  <path fill="${ink}" d="m219 173 29-8 40 24q10 6 8 15l-14 31 13 8-4 9-29-2-1-9 12-37-42-7-20-8z"/>
  <path fill="${yellow}" d="M213 179q-3-24 12-47l20-24 28 4 9 16-18 21-12 33-15 8z"/>
  <path fill="@hatch" d="m215 173 22-41 15 3-17 47z"/><path fill="${paper}" d="m260 122 12-1 19 25 33 9-3 12-42-6-23-24z"/>
  <path fill="${ink}" d="m318 153 17-1 13 6-1 8-27 1z"/><path fill="${ink}" d="m244 116 4-18 21 3 5 15-11 10z"/>
  <path fill="${yellow}" d="M239 101q-9-29 15-43 24-12 39 7 11 13 7 28l-12 9-16 8-25-1z"/><path fill="${ink}" d="m264 79 35-7 6 13-23 12-15-3z"/>
  <path fill="${paper}" d="m241 85 14-17-3 10 15-9-13 17 3-9z"/><path fill="${yellow}" d="m280 98 21-10-4 13-18 7-6-4z"/>
  <path d="m70 247 41-8m-67 22 56-12m332-34 49-12" stroke-width="2"/>
`;

const handset = `
  <path fill="${paper}" stroke="none" d="M0 0h330v340H0z"/><path fill="@dots" stroke="none" d="M0 57 330 0v340H0z"/>
  <path fill="${yellow}" d="m0 229 330-67v58L0 310z"/><path fill="${ink}" d="m27 340 36-76 42-26 45 31-5 71z"/>
  <path fill="${paper}" d="m75 271-1-44 20-44q4-8 11-4l7 10-5 38 29 24-15 37-26 3z"/>
  <g transform="rotate(12 172 200)"><rect x="111" y="76" width="125" height="231" rx="17" fill="${ink}"/><rect x="118" y="85" width="111" height="210" rx="12" fill="${yellow}"/>
  <path d="M149 87h48" stroke-width="7"/><path fill="${paper}" d="M126 124h95v93h-95z"/><g stroke="#c7bc96" stroke-width="5"><path d="m128 147 92 17m-76-39 31 89m9-90 15 91m-71-16 90-33"/></g>
  <path d="m141 186 20-5-5-19 41-8" fill="none" stroke-width="5"/><circle cx="141" cy="186" r="6" fill="${yellow}"/><path fill="${ink}" d="m189 148 7-8 8 5-2 9-7 8z"/>
  <text x="173" y="242" text-anchor="middle" stroke="none" fill="${ink}" font-size="20" font-weight="900">有新订单</text>
  <rect x="137" y="254" width="74" height="19" rx="3" fill="${ink}"/><path stroke="${yellow}" d="M155 264h35m-6-4 6 4-6 4"/></g>
  <path fill="${paper}" d="m231 212 17 7q8 5 1 14l-20-6q-8-5 2-15zm-3 21 17 6q8 4 1 12l-19-5q-9-4 1-13zm-5 19 15 5q8 4 1 12l-17-5q-8-4 1-12z"/>
  <path d="m250 123 20-8m-18 20 26-4m-24 16 16 1" fill="none"/>
`;

const artwork = [[tower, worker], [handoff, keys], [rider, handset]];

const pointOK = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const money = n => Number.isFinite(n) ? (n < 0 ? '−' : '') + '¥' + Math.abs(n) : '—';
function duration(n) {
  if (!Number.isFinite(n)) return '—';
  const s = Math.max(0, Math.ceil(n));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function write(node, value) {
  const next = String(value ?? '');
  if (node.textContent !== next) node.textContent = next;
}
function attr(node, key, value) {
  const next = String(value);
  if (node.getAttribute(key) !== next) node.setAttribute(key, next);
}
function svg(tag, attributes, parent) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  parent.append(node);
  return node;
}

function readDistrict(district) {
  const nodes = new Map(district.nodes.filter(pointOK).map(node => [node.id, node]));
  const roads = district.roads.map(road => ({ ...road, start: nodes.get(road.a), end: nodes.get(road.b) }))
    .filter(road => road.start && road.end);
  const stops = Object.entries(district.stops).map(([key, stop]) => ({ ...nodes.get(stop.node), key, label: stop.label }))
    .filter(pointOK);
  const navigator = makeNavigator(district);
  const previews = new Map();
  function deliveryPreview(order, mode) {
    const key = order + '/' + mode;
    if (!previews.has(key)) {
      const shop = nodes.get(district.stops['shop' + order]?.node);
      const home = district.stops['home' + order]?.node;
      const points = shop && nodes.has(home) ? navigator.route(shop, home, order, mode) : [];
      previews.set(key, { points, meters: points.length ? Math.round(routeLength(points)) : null });
    }
    return previews.get(key);
  }
  return { bounds: district.bounds, blocks: district.blocks ?? [], roads, stops, deliveryPreview };
}

// Labels and symbols use screen-space sizes. The basemap keeps one uniform world scale.
function mountMap(element, atlas, id, campaign, handset = false) {
  const map = svg('svg', { class: 'nb-cartography', role: 'img', 'aria-label': '城区全图，上北下南。' }, element);
  const terrain = svg('g', {}, map);
  const reference = campaign ? svg('image', {
    class: 'nb-map-reference', href: estateOverhead, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true',
  }, terrain) : null;
  if (!reference) {
    const defs = svg('defs', {}, map);
    const pattern = svg('pattern', { id, width: 6, height: 6, patternUnits: 'userSpaceOnUse' }, defs);
    svg('path', { d: 'M-1 1 1 -1M0 6 6 0M5 7 7 5', stroke: '#b0a787', 'stroke-width': 0.8 }, pattern);
  }
  const route = svg('g', { fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, map);
  const previewStrokes = (reference ? [[ink, 4], [paper, 1.7]] : [[ink, 2.6]]).map(([stroke, width]) =>
    svg('polyline', { class: 'nb-map-preview', stroke, 'stroke-width': width, 'stroke-dasharray': '4 5' }, route));
  const continuationStrokes = handset ? [[ink, 6.4], [yellow, 4]].map(([stroke, width]) =>
    svg('polyline', { stroke, 'stroke-width': width }, route)) : [];
  const routeStrokes = [[ink, 6.4], [yellow, 4]].map(([stroke, width]) =>
    svg('polyline', { class: 'nb-map-current', stroke, 'stroke-width': width }, route));
  const places = svg('g', {}, map);
  const riderMark = svg('g', { 'aria-label': '骑手及车头方向' }, map);
  if (handset) {
    svg('path', { d: 'M0 -12 9 9 0 5 -9 9Z', fill: '#fffdf5', stroke: ink, 'stroke-width': 2.4,
      'stroke-linejoin': 'round', class: 'nb-map-cursor' }, riderMark);
  } else {
    svg('circle', { r: 12, fill: paper, stroke: ink, 'stroke-width': 1.4 }, riderMark);
    svg('path', { d: 'M0 -10 7 7 0 3 -7 7Z', fill: ink, stroke: paper, 'stroke-width': 1 }, riderMark);
  }
  let width = 0, height = 0, scale = 1, offsetX = 0, offsetZ = 0, view, nav, layoutKey = '';

  function project(p) { return { x: offsetX + p.x * scale, y: offsetZ + p.z * scale }; }
  function roadPath(road) {
    const a = project(road.start), b = project(road.end);
    return 'M' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + 'L' + b.x.toFixed(2) + ' ' + b.y.toFixed(2);
  }
  function base() {
    const b = atlas.bounds;
    const dx = Math.max(1, b.maxX - b.minX), dz = Math.max(1, b.maxZ - b.minZ);
    const margin = reference ? 0 : width < 400 ? 17 : 27;
    scale = Math.min((width - 2 * margin) / dx, (height - 2 * margin) / dz);
    offsetX = (width - dx * scale) / 2 - b.minX * scale;
    offsetZ = (height - dz * scale) / 2 - b.minZ * scale;
    if (reference) {
      // campaign-course.js defines these world bounds at the four edges of the 1536 × 1024 drawing.
      const corner = project({ x: b.minX, z: b.minZ });
      attr(reference, 'x', corner.x); attr(reference, 'y', corner.y);
      attr(reference, 'width', dx * scale); attr(reference, 'height', dz * scale);
      return;
    }
    terrain.replaceChildren();
    for (const block of atlas.blocks) {
      const p = project({ x: block.x - block.w / 2, z: block.z - block.d / 2 });
      svg('rect', { x: p.x, y: p.y, width: block.w * scale, height: block.d * scale,
        rx: 1.3, fill: 'url(#' + id + ')', stroke: '#a69f84', 'stroke-width': 0.8 }, terrain);
    }
    const streetWidth = road => Math.max(road.kind === 'main' ? 4.5 : 2.4, Math.min(17, road.width * scale));
    // Two passes join adjacent open roads without a black seam at every intersection.
    for (const casing of [true, false]) {
      for (const road of atlas.roads) {
        const closed = road.closedOn === view.order;
        const stroke = casing ? '#817d6b' : closed ? '#cbc1a4' : road.kind === 'main' ? '#fffcf0' : '#f5ecd2';
        svg('path', { d: roadPath(road), fill: 'none', stroke, 'stroke-linecap': 'round',
          'stroke-width': streetWidth(road) + (casing ? 1.8 : 0) }, terrain);
      }
    }
    for (const road of atlas.roads.filter(r => r.closedOn === view.order)) {
      svg('path', { d: roadPath(road), stroke: ink, 'stroke-width': 2, 'stroke-dasharray': '3 4' }, terrain);
      const p = project({ x: (road.start.x + road.end.x) / 2, z: (road.start.z + road.end.z) / 2 });
      const sign = svg('g', { transform: 'translate(' + p.x + ' ' + p.y + ')' }, terrain);
      svg('rect', { x: -7, y: -7, width: 14, height: 14, fill: paper, stroke: ink, rx: 2 }, sign);
      svg('path', { d: 'm-4 -4 8 8m0-8-8 8', fill: 'none', stroke: ink, 'stroke-width': 2.6 }, sign);
    }
  }
  function labels() {
    places.replaceChildren();
    if (handset) {
      // The original drawing already depicts the shop, house and gate.
      // Only the active destination needs another visible symbol.
      const stops = [...atlas.stops];
      if (pointOK(view.target) && !stops.some(s => s.id === view.target.id)) stops.push(view.target);
      for (const stop of stops) {
        const p = project(stop);
        const poi = svg('g', { transform: 'translate(' + p.x + ' ' + p.y + ')' }, places);
        write(svg('title', {}, poi), stop.label);
        svg('circle', { r: 10, fill: 'transparent' }, poi);
      }
      const end = nav?.end;
      if (!pointOK(end)) return;
      const at = project(end);
      const marker = svg('g', { class: 'nb-map-flag', transform: 'translate(' + at.x + ' ' + at.y + ')' }, places);
      write(svg('title', {}, marker), nav.continuation.length ? '7号楼 · 单元门' : view.targetLabel);
      svg('circle', { r: 3.5, fill: yellow, stroke: ink, 'stroke-width': 2 }, marker);
      svg('path', { d: 'M0 -2V-21L14 -16L0 -11Z', stroke: ink, 'stroke-width': 2,
        fill: yellow, 'stroke-linejoin': 'round' }, marker);
      return;
    }
    const pickup = view.leg !== 'dropoff';
    const stops = [...atlas.stops];
    const via = view.campaign && pointOK(view.target) && !stops.some(stop => stop.id === view.target.id);
    if (via) stops.push({ ...view.target, key: 'via', label: view.targetLabel });
    const targetKey = via ? 'via' : (pickup ? 'shop' : 'home') + view.order;
    const originKey = pickup ? (view.order === 2 ? 'home1' : 'square') : 'shop' + view.order;
    const nextKey = pickup || via ? 'home' + view.order : null;
    stops.sort((a, b) => priority(a) - priority(b));
    function priority(stop) {
      return stop.key === targetKey ? 0 : stop.key === originKey ? 1 : stop.key === nextKey ? 2 : 3;
    }
    const reserved = stops.map(s => { const p = project(s); return { x: p.x - 10, y: p.y - 10, w: 20, h: 20 }; });
    const overlaps = r => reserved.some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
    // Place the most important names first and keep them inside small map viewports.
    for (const stop of stops) {
      const p = project(stop), rank = priority(stop);
      const g = svg('g', { 'data-stop': stop.key, transform: 'translate(' + p.x + ' ' + p.y + ')' }, places);
      const kind = rank === 1 ? '起' : stop.key === 'via' ? '经' : stop.key.startsWith('shop') ? '取' : stop.key.startsWith('home') ? '送' : '场';
      write(svg('title', {}, g), kind + ' · ' + stop.label);
      if (rank < 3) {
        svg('rect', { x: -8.5, y: -8.5, width: 17, height: 17, rx: rank === 1 ? 8.5 : 2,
          fill: rank === 0 ? yellow : paper, stroke: ink, 'stroke-width': rank === 0 ? 2 : 1.3 }, g);
        write(svg('text', { x: 0, y: 4, 'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 900, fill: ink }, g), kind);
      } else {
        svg('circle', { r: 3.5, fill: paper, stroke: '#615e50', 'stroke-width': 1.4 }, g);
      }
      if (rank > 2 && width < 550) continue;
      const title = (rank < 3 ? kind + ' · ' : '') + stop.label;
      const font = rank === 0 ? 12 : 10.5;
      const tw = Array.from(title).reduce((sum, c) => sum + (c.charCodeAt(0) < 128 ? 0.55 : 1), 0) * font + 9;
      const th = font + 7;
      const candidates = [[12, -th / 2], [-tw - 12, -th / 2], [-tw / 2, -th - 12],
        [-tw / 2, 12], [12, 9], [-tw - 12, 9], [12, -th - 8], [-tw - 12, -th - 8]];
      const boxes = candidates.map(([x, y]) => ({
        x: Math.min(Math.max(3, p.x + x), Math.max(3, width - tw - 3)),
        y: Math.min(Math.max(3, p.y + y), Math.max(3, height - th - 3)), w: tw, h: th,
      }));
      const box = boxes.find(r => !overlaps(r));
      if (!box) continue;
      reserved.push(box);
      svg('rect', { x: box.x - p.x, y: box.y - p.y, width: tw, height: th, rx: 2,
        fill: rank === 0 ? ink : paper, opacity: rank < 3 ? 1 : 0.87 }, g);
      write(svg('text', { x: box.x - p.x + 4.5, y: box.y - p.y + font + 1.5,
        'font-size': font, 'font-weight': rank < 3 ? 800 : 500, fill: rank === 0 ? paper : ink }, g), title);
    }
    if (reference) return;
    const named = new Set();
    const streets = atlas.roads.filter(r => r.kind === 'main' && r.name && r.closedOn !== view.order)
      .map(r => ({ ...r, length: Math.hypot(r.start.x - r.end.x, r.start.z - r.end.z) * scale }))
      .sort((a, b) => b.length - a.length);
    for (const street of streets) {
      if (named.has(street.name) || named.size >= (width < 400 ? 3 : 6)) continue;
      const length = street.name.length * 10 + 6;
      if (street.length < length + 15) continue;
      const a = project(street.start), b = project(street.end);
      const vertical = Math.abs(a.y - b.y) > Math.abs(a.x - b.x);
      const x = (a.x + b.x) / 2 - (vertical ? 10 : 0), y = (a.y + b.y) / 2 - (vertical ? 0 : 10);
      const w = vertical ? 12 : length, h = vertical ? length : 12;
      const box = { x: x - w / 2, y: y - h / 2, w, h };
      if (overlaps(box) || box.x < 1 || box.y < 1 || box.x + w > width || box.y + h > height) continue;
      named.add(street.name); reserved.push(box);
      write(svg('text', { transform: 'translate(' + x + ' ' + y + ') rotate(' + (vertical ? -90 : 0) + ')',
        y: 3, 'text-anchor': 'middle', 'font-size': 10, fill: '#5b5546', stroke: paper, 'stroke-width': 2.6,
        'paint-order': 'stroke', 'font-weight': 650 }, places), street.name);
    }
  }
  function polyline(points) {
    const precision = reference ? 3 : 1;
    return points.filter(pointOK).map(p => {
      const at = project(p);
      return at.x.toFixed(precision) + ',' + at.y.toFixed(precision);
    }).join(' ');
  }
  function draw(next, guidance) {
    view = next; nav = guidance;
    if (width < 50 || height < 50) return;
    const key = [width, height, view.order, view.leg, view.targetLabel, nav?.end?.x, nav?.end?.z].join('/');
    if (key !== layoutKey) {
      layoutKey = key;
      base(); labels();
      attr(map, 'aria-label', '城区全图，上北下南。当前目的地为' + (view.targetLabel || '停靠区'));
    }
    const preview = !handset && view.leg !== 'dropoff' ? atlas.deliveryPreview(view.order, view.routeMode) : null;
    const previewPoints = preview ? polyline(preview.points) : '';
    for (const path of previewStrokes) attr(path, 'points', previewPoints);
    if (continuationStrokes.length) {
      const tail = polyline(nav?.continuation ?? []);
      for (const path of continuationStrokes) attr(path, 'points', tail);
    }
    const points = polyline(nav?.path ?? view.route ?? []);
    for (const path of routeStrokes) attr(path, 'points', points);
    const actor = nav?.actor ?? view.actor ?? (view.travelMode === 'foot' ? view.walker : view.bike);
    if (pointOK(actor)) {
      const at = project(actor);
      // On the north-up map, +Z faces down; positive heading turns the rider clockwise.
      const angle = 180 + (actor.heading || 0) * 180 / Math.PI;
      attr(riderMark, 'aria-label', view.travelMode === 'foot' ? '步行位置及朝向' : '骑手及车头方向');
      attr(riderMark, 'transform', 'translate(' + at.x.toFixed(2) + ' ' + at.y.toFixed(2) + ') rotate(' + angle.toFixed(2) + ')');
      attr(riderMark, 'visibility', 'visible');
    } else attr(riderMark, 'visibility', 'hidden');
  }
  function resize() {
    width = element.clientWidth; height = element.clientHeight;
    attr(map, 'viewBox', '0 0 ' + Math.max(1, width) + ' ' + Math.max(1, height));
    if (view) draw(view, nav);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(element); resize();
  return { draw, dispose: () => observer.disconnect() };
}

function mountFloorMap(element, stairs) {
  const map = svg('svg', { viewBox: '0 0 600 400', role: 'img', class: 'nb-floor-plan nb-cartography' }, element);
  const plate = svg('g', {}, map);
  const line = svg('g', { fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, map);
  const tracks = [[ink, 10], [yellow, 6]].map(([stroke, width]) => svg('polyline',
    { class: 'nb-map-current', stroke, 'stroke-width': width }, line));
  const arrows = svg('g', { fill: ink, 'aria-hidden': 'true' }, map);
  const rider = svg('g', { 'aria-label': '步行位置及朝向' }, map);
  svg('path', { d: 'M0 -16 12 13 0 8 -12 13Z', fill: '#fffdf5', stroke: ink, 'stroke-width': 3,
    'stroke-linejoin': 'round', class: 'nb-map-cursor' }, rider);
  const s = Math.min(286 / (2 * stairs.halfWidth), 306 / stairs.depth);
  const x = localX => 369 + localX * s, y = depth => 348 - depth * s;
  function project(p) {
    const local = stairs.local(p);
    return [x(local.x), y(local.d)];
  }
  const label = (text, px, py, size, color = ink) => write(svg('text', {
    x: px, y: py, fill: color, 'font-size': size, 'font-weight': 750 }, plate), text);
  const path = (d, stroke, width, fill = 'none') => svg('path', {
    d, stroke, 'stroke-width': width, fill, 'stroke-linejoin': 'round' }, plate);
  const topFloor = stairs.floorAt(stairs.door302.y);
  let shownFloor, previousPath;
  function floorPlate(floor) {
    plate.replaceChildren();
    const left = x(-stairs.halfWidth), right = x(stairs.halfWidth);
    const top = y(stairs.depth), front = y(stairs.front), back = y(stairs.back), bottom = y(0);
    svg('rect', { width: 600, height: 400, fill: '#e9e1c8' }, plate);
    for (let i = 0; i < 600; i += 20) path('M' + i + ' 0v400', '#d9d1b9', .8);
    for (let i = 0; i < 400; i += 20) path('M0 ' + i + 'h600', '#d9d1b9', .8);
    svg('rect', { x: 0, y: 0, width: 161, height: 400, fill: '#213d37' }, plate);
    label('本层平面', 24, 45, 22, '#eee7d0');
    label(floor + 'F', 21, 121, 70, '#ffe082');
    path('M25 150h108', '#a4ae96', 1.5);
    const levels = Array.from({ length: topFloor }, (_, i) => topFloor - i);
    levels.forEach((level, i) => {
      const row = 198 + i * 63, active = level === floor;
      svg('circle', { cx: 35, cy: row - 5, r: active ? 6 : 3.5, fill: active ? yellow : '#a5b6a6' }, plate);
      if (i < levels.length - 1) path('M35 ' + (row + 6) + 'v40', '#819489', 1.2);
      label(level + ' 楼', 56, row + 1, 22, active ? '#ffdf75' : '#ced6c7');
    });
    svg('rect', { x: left, y: top, width: right - left, height: bottom - top,
      fill: '#fcf7e5', stroke: '#314b43', 'stroke-width': 6, rx: 1 }, plate);
    svg('rect', { x: left + 3, y: back, width: right - left - 6, height: front - back, fill: '#b8c9b8' }, plate);
    const westRail = x(-stairs.divider), eastRail = x(stairs.divider);
    for (let i = 0; i <= stairs.treads; i++) {
      const at = back + (front - back) * i / stairs.treads;
      path('M' + left + ' ' + at + 'H' + westRail + 'M' + eastRail + ' ' + at + 'H' + right, '#698174', 1.7);
    }
    svg('rect', { x: westRail, y: back, width: eastRail - westRail, height: front - back,
      rx: 3, fill: '#385548' }, plate);
    label('半层平台', x(0) - 34, top + 22, 17, '#526859');
    label('楼梯', right + 11, (front + back) / 2 + 7, 18, '#456054');
    const entering = project(stairs.entrance);
    if (floor === 1) {
      path('M' + x(-stairs.doorHalf) + ' ' + bottom + 'H' + x(stairs.doorHalf), '#fcf7e5', 7);
      label('入口', entering[0] - 19, bottom + 32, 20, '#405749');
    }
    if (floor === topFloor) {
      const [px, py] = project(stairs.door302);
      path('M' + px + ' ' + (py - 11) + 'v22', '#b16a28', 7);
      path('M' + px + ' ' + py + 'h14', ink, 2);
      svg('rect', { x: px + 14, y: py - 15, width: 59, height: 30, rx: 4, fill: ink }, plate);
      label('302', px + 23, py + 7, 21, yellow);
    }
    path('m550 53 9-22 9 22-9-5z', '#56675a', 1.5, '#56675a');
    label('北', 549, 77, 18, '#536354');
    attr(map, 'aria-label', '7号楼，第' + floor + '层平面。显示楼梯、骑手位置与当前楼层路线' +
      (floor === topFloor ? '以及302房门。' : '。'));
  }
  function draw(view, nav) {
    if (nav.floor !== shownFloor) { shownFloor = nav.floor; floorPlate(nav.floor); }
    const points = nav.path.map(p => project(p).map(n => n.toFixed(2)).join(',')).join(' ');
    if (points !== previousPath) {
      previousPath = points;
      for (const track of tracks) attr(track, 'points', points);
      arrows.replaceChildren();
      for (let i = 1; i < nav.path.length; i++) {
        const a = nav.path[i - 1], b = nav.path[i];
        if (Math.abs(b.y - a.y) < .42) continue;
        const [ax, ay] = project(a), [bx, by] = project(b);
        const angle = Math.atan2(bx - ax, ay - by) * 180 / Math.PI;
        svg('path', { d: 'M-8 4 0 -6 8 4 8 8 0 0 -8 8Z', stroke: yellow, 'stroke-width': 1.5,
          transform: 'translate(' + (ax + bx) / 2 + ' ' + (ay + by) / 2 + ') rotate(' + angle + ')' }, arrows);
      }
    }
    const [px, py] = project(nav.actor);
    attr(rider, 'transform', 'translate(' + px.toFixed(2) + ' ' + py.toFixed(2) + ') rotate(' +
      (180 + nav.actor.heading * 180 / Math.PI).toFixed(2) + ')');
  }
  return { draw };
}

function button(type, content, css = 'nb-button', attrs = '') {
  return `<button type="button" class="${css}" data-act="${type}" ${attrs}>${content}</button>`;
}
const keycap = key => '<kbd>' + key + '</kbd>';
const field = (name, tag = 'span') => '<' + tag + ' data-field="' + name + '"></' + tag + '>';
const brandMark = '<i class="nb-brand-mark" aria-hidden="true">' + icon('brand') + '</i>';
const brand = '<span class="nb-brand">' + brandMark + '<b>牛逼外卖</b></span>';
const routeToggle = () => button('route', icon('swap') + field('routeMode'), 'nb-inline-action', 'data-field="routeButton"');
const dialog = 'role="dialog" aria-modal="true" aria-labelledby="';

function orderCount(view) {
  return view.totalOrders ?? view.orders?.length ?? (view.campaign ? 1 : 2);
}

function comicMarkup(view, prefix) {
  const i = Math.min(2, Math.max(0, Math.trunc(view.page || 0)));
  const script = panels[i], art = artwork[i];
  const voice = i === 2 && view.campaign && orderCount(view) === 1 ? script.voice.replace('两单', '一单') : script.voice;
  return `<div class="nb-surface nb-comic" ${dialog}${prefix}-title" tabindex="-1">
    <div class="nb-print">
      <header class="nb-mast">${brand}<span class="nb-edition">第一天<span>／</span>开场漫画</span>
        ${button('skip', '跳过漫画 ' + icon('right'), 'nb-quiet')}</header>
      <div class="nb-strip">
        <figure class="nb-frame nb-wide">${plate(prefix + '-wide', 560, art[0], script.scene)}<figcaption>${script.place}</figcaption></figure>
        <figure class="nb-frame nb-detail">${plate(prefix + '-detail', 330, art[1], script.detail)}<blockquote>${voice}</blockquote></figure>
      </div>
      <footer class="nb-comic-foot"><div class="nb-prose"><h1 id="${prefix}-title">${script.title}</h1><p>${script.caption}</p></div>
        <div class="nb-pager"><span aria-label="第 ${i + 1} 页，共 3 页"><b>0${i + 1}</b> / 03</span>
          ${button('next', (i === 2 ? '到广场看单' : '翻一页') + icon('arrow'), 'nb-button nb-primary')}</div></footer>
    </div></div>`;
}

function mapBoard(prefix, full, campaign) {
  return `<section class="nb-map-board${campaign ? ' nb-map-illustrated' : ''}" aria-label="城区地图">
    <header class="nb-map-head"><h2 id="${prefix}-map-title">${icon('map')}城区全图</h2>
      ${full ? button('map', keycap('M') + ' 收起', 'nb-quiet') : '<span class="nb-north-note">上北 · 下南</span>'}</header>
    <div class="nb-map-paper"><div class="nb-map-vectors" data-field="map"></div><span class="nb-north" aria-hidden="true"><b>北</b>▴</span></div>
    <div class="nb-legend"><span><i class="nb-key-line"></i>当前路线</span><span data-field="previewLegend"><i class="nb-key-preview"></i>送餐预览</span><span><i class="nb-key-rider"></i>我的车头</span><span><i class="nb-key-stop">取</i>取餐</span><span><i class="nb-key-stop">送</i>送达</span>
      <span data-field="closedLegend"><i class="nb-key-stop">×</i>封路</span></div>
    ${full ? '<div class="nb-map-bottom"><span>' + icon('flag') + field('target') + '</span>' + routeToggle() + '</div>' : ''}
  </section>`;
}

function offerMarkup(prefix, campaign) {
  return `<div class="nb-surface nb-dispatch" ${dialog}${prefix}-${campaign ? 'day' : 'offer'}-title" tabindex="-1"><div class="nb-dispatch-inner">
    <header class="nb-mast">${brand}<span class="nb-edition">第一天<span>／</span>派单</span></header>
    <div class="nb-offer-spread">${mapBoard(prefix, false, campaign)}
      <article class="nb-phone"><div class="nb-phone-glass"><div class="nb-phone-top"><span>${icon('brand')} 骑手端</span><i aria-hidden="true"></i></div>
        ${campaign ? `<div class="nb-phone-body nb-days" data-field="dayPicker"><h1 id="${prefix}-day-title">选择关卡</h1>
          ${button('selectDay', '<b>第一天</b>' + icon('arrow') + field('dayRoute'), 'nb-day-choice', 'data-field="dayButton"')}</div>` : ''}
        <div class="nb-phone-body" data-field="orderBody" ${campaign ? 'hidden' : ''}><div class="nb-offer-status"><i></i> 待接单
          ${campaign ? button('days', icon('left') + '第一天 · ' + field('orderTag'), 'nb-day-back', 'aria-label="返回关卡选择"') : field('orderTag')}</div>
          <h1 id="${prefix}-offer-title" data-field="title" tabindex="-1"></h1>
          <div class="nb-price-line"><span>${campaign ? '基础工资' : '本单工资'}</span><strong data-field="pay"></strong></div>
          <div class="nb-itinerary">
            <div><i>取</i><span data-field="shop"></span><small data-field="pickupMeters"></small></div><div><i>送</i><span data-field="home"></span><small data-field="deliveryMeters"></small></div>
          </div>
          <div class="nb-terms"><span>${icon('clock')} ${campaign ? '准时奖' + field('offerBonus', 'b') + ' · ' : '限时'} <b data-field="limit"></b>${campaign ? ' 内' : ''}</span><span>失败罚款 <b data-field="fine"></b></span></div>
          ${routeToggle()}
        </div><div class="nb-phone-foot" data-field="orderFoot" ${campaign ? 'hidden' : ''}>${button('accept', '确认接单' + icon('arrow'), 'nb-button nb-primary')}</div>
      </div></article>
    </div></div></div>`;
}

function control(key, text, label) {
  return `<button type="button" class="nb-drive-key" data-control="${key}" aria-label="${label}" tabindex="-1">${text}</button>`;
}
function phoneMarkup(prefix) {
  return `<div class="nb-surface nb-live-nav" ${dialog}${prefix}-map-title" tabindex="-1">
    <article class="nb-nav-device">
      <i class="nb-case-switch" aria-hidden="true"></i><i class="nb-case-volume" aria-hidden="true"></i>
      <div class="nb-case-rim" aria-hidden="true"><div class="nb-case-rubber"></div></div>
      <div class="nb-nav-glass">
        <div class="nb-phone-status" aria-hidden="true"><time data-field="phoneClock"></time><i class="nb-lens"></i><i class="nb-phone-radio"></i></div>
        <header class="nb-nav-mast">${brandMark}<h1 id="${prefix}-map-title">骑手导航</h1></header>
        <div class="nb-next-turn"><span data-field="direction" aria-hidden="true"></span><strong data-field="guide"></strong></div>
        <figure class="nb-nav-sheet">
          <div class="nb-device-map" data-field="map"></div>
          <figcaption><span data-field="legInfo"></span>${button('route', icon('swap') + field('routeMode'), 'nb-route-choice', 'data-field="routeButton"')}</figcaption>
        </figure>
        <div class="nb-address">${icon('pin')}<strong>7号楼 · 302</strong></div>
        ${button('map', icon('fold') + '收起手机' + keycap('M'), 'nb-stow', 'aria-keyshortcuts="M"')}
      </div>
    </article></div>`;
}

function campaignHUD(foot, prefix) {
  const pocketScreen = `<span class="nb-pocket-glass">
    <span class="nb-pocket-mast nb-nav-label">${brandMark}<b>骑手导航</b>
      <span id="${prefix}-travel" class="nb-pocket-mode" data-field="pocketStatus"></span>${keycap('M')}${icon('expand')}</span>
    <span class="nb-pocket-window" data-field="pocketMap"><i class="nb-pocket-north" aria-hidden="true">北</i></span>
    <span class="nb-pocket-guide"><span class="nb-pocket-turn" data-field="direction" aria-hidden="true"></span>
      <strong id="${prefix}-guide" data-field="guide"></strong></span></span>`;
  const touchPad = foot ? `<button type="button" class="nb-walk-stick" data-stick aria-label="步行摇杆，向上推为前进" tabindex="-1">
      <span class="nb-stick-axis" aria-hidden="true"></span><i aria-hidden="true"></i></button>
    <div class="nb-run-pad">${control('run', icon('run') + '<span>按住跑</span>', '按住跑步')}</div>` :
    `<div class="nb-steer-pad"><div class="nb-kick-pad" data-field="kicks" hidden>
      ${button('left', '左踢', 'nb-drive-key', 'data-field="kickLeft" aria-keyshortcuts="Q"')}
      ${button('right', '右踢', 'nb-drive-key', 'data-field="kickRight" aria-keyshortcuts="E"')}</div>
      ${control('left', icon('left'), '向左转向')}${control('right', icon('right'), '向右转向')}</div>
     <div class="nb-pedals">${button('boost', '冲刺', 'nb-drive-key', 'data-field="boostButton" aria-keyshortcuts="Shift"')}
      ${control('handbrake', '手刹', '拉手刹')}${control('brake', '刹车', '刹车或倒车')}${control('throttle', '油门', '给油')}</div>`;
  return `<section class="nb-hud nb-campaign nb-live-hud" data-travel="${foot ? 'foot' : 'bike'}" aria-label="配送中">
    <div class="nb-hud-top">
      ${button('map', pocketScreen, 'nb-pocket-nav', 'title="展开手机导航 (M)" aria-label="打开手机导航" aria-describedby="' + prefix + '-travel ' + prefix + '-guide" aria-keyshortcuts="M"')}
      <div class="nb-hud-aside"><div class="nb-gauges">
        <div class="nb-health"><span>车况</span><meter data-field="hpMeter" aria-label="车辆耐久" min="0" max="100" value="100"></meter><b data-field="hp"></b></div>
        <div class="nb-timer" data-field="timerFace">${icon('clock')}<span data-field="timerLabel"></span><strong data-field="time"></strong></div>
      </div>${button('pause', icon('pause'), 'nb-tool nb-pause-key', 'aria-label="暂停游戏" title="暂停与操作 (Esc)"')}</div>
    </div>
    <div class="nb-hud-bottom"><span class="nb-toast" data-field="toast" role="status" hidden></span>
      <div class="nb-road-info">${foot ? '<span class="nb-foot-hint">' + keycap('WASD') + ' 移动 ' + keycap('Shift') + ' 跑</span>' :
        '<span class="nb-speed">' + field('speed', 'b') + ' 公里/时</span>'}
        <span class="nb-cargo" data-field="cargo" hidden></span><span class="nb-side" data-field="side" hidden></span></div>
    </div>
    <div class="nb-context">
      ${button('mount', icon('mount') + field('mountLabel') + keycap('F'), 'nb-mount-key', 'data-field="mountButton" aria-keyshortcuts="F" hidden')}
      ${button('interact', field('interaction') + keycap('Enter'), 'nb-interact', 'data-field="interactButton" aria-keyshortcuts="Enter" hidden')}
      <span class="nb-action-progress" data-field="motion" role="status" hidden>${field('motionLabel')}</span>
    </div><div class="nb-touch nb-live-touch" data-field="touchPad">${touchPad}</div>
    <div class="nb-reader">${field('objective')}${field('target')}</div>
  </section>`;
}

function classicHUD() {
  const interactKey = 'E';
  return `<section class="nb-hud" aria-label="牛逼外卖骑行界面">
    <div class="nb-hud-top"><div class="nb-navigation"><div class="nb-turn" aria-hidden="true" data-field="direction">${icon('turn')}</div>
      <div class="nb-nav-copy"><div class="nb-nav-label">${brandMark}<small data-field="objective"></small></div><strong data-field="target"></strong><div class="nb-guide" data-field="guide"></div></div></div>
      <div class="nb-hud-aside"><div class="nb-gauges">
        <div class="nb-timer" data-field="timerFace">${icon('clock')}<span data-field="timerLabel"></span><strong data-field="time"></strong></div>
        <div class="nb-health"><span aria-hidden="true">车况</span><meter data-field="hpMeter" aria-label="车辆耐久" min="0" max="100" value="0"></meter><b data-field="hp" aria-hidden="true"></b></div>
        <div class="nb-wallet"><span>当前余额</span>${field('cash', 'b')}</div>
      </div><div class="nb-tools">
        ${button('map', icon('map') + '<span>地图</span>' + keycap('M'), 'nb-tool', 'aria-label="地图" aria-keyshortcuts="M" title="地图 (M)"')}
        ${button('item', icon('wrench') + '<span>修理包</span>' + field('inventory', 'b') + keycap('Q'), 'nb-tool', 'data-field="itemButton"')}
        ${button('pause', icon('pause') + '<span>暂停</span>', 'nb-tool', 'aria-label="暂停游戏" title="暂停游戏 (Esc)"')}
      </div></div></div>
    <div class="nb-hud-bottom"><div class="nb-road-info"><span class="nb-speed"><b data-field="speed"></b> 公里/时</span><span class="nb-wet" data-field="wet">${icon('wet')}湿滑</span></div>
      <div class="nb-toast" data-field="toast" role="status"></div>
      ${button('interact', keycap(interactKey) + field('interaction'), 'nb-interact', `data-field="interactButton" aria-keyshortcuts="${interactKey}"`)}
      <div class="nb-shortcuts"><span>${keycap('W/S')} 油门/刹车</span><span>${keycap('A/D')} 转向</span><span>${keycap('空格')} 手刹</span><span>${keycap(interactKey)} 取送餐</span></div></div>
    <div class="nb-touch"><div>
      ${control('left', icon('left'), '向左转向')}${control('right', icon('right'), '向右转向')}</div>
      <div>${control('handbrake', '手刹', '拉手刹')}${control('brake', '刹车', '刹车或倒车')}${control('throttle', '油门', '给油')}</div></div>
    </section>`;
}

function pauseMarkup(prefix, view) {
  const { campaign, travelMode } = view;
  const foot = travelMode === 'foot';
  return `<div class="nb-surface nb-scrim" ${dialog}${prefix}-title" tabindex="-1"><article class="nb-slip nb-pause">
    <div class="nb-slip-head">${brand}<span>骑手端</span></div>
    <h1 id="${prefix}-title">暂歇一脚。</h1><p>${foot ? '步行' : '骑行'}和${campaign ? '奖金' : '订单'}倒计时已暂停。</p>
    <dl class="nb-lines"><div><dt>当前目的地</dt><dd data-field="target"></dd></div><div><dt>${campaign ? '准时奖剩余时间' : '剩余时间'}</dt><dd data-field="time"></dd></div></dl>
    ${campaign ? '<div class="nb-pause-controls">' + (foot ? '<span>' + keycap('WASD') + ' 移动</span><span>' + keycap('Shift') + ' 按住跑</span>' :
      '<span>' + keycap('W/S') + ' 油门 / 刹车</span><span>' + keycap('A/D') + ' 转向</span><span>' + keycap('空格') + ' 手刹</span><span>' + keycap('Q/E') + ' 侧踢</span><span>' + keycap('Shift') + ' 冲刺</span>') +
      '<span>' + keycap('F') + ' 上下车</span><span>' + keycap('Enter') + ' 当前动作</span><span>' + keycap('M') + ' 手机</span></div>' : ''}
    ${button('mute', '<span data-field="soundIcon"></span>' + field('sound') + keycap('V'), 'nb-sound', 'data-field="soundButton"')}
    ${button('pause', (foot ? '继续步行' : '继续骑行') + icon('arrow'), 'nb-button nb-primary')}</article></div>`;
}
function receiptMarkup(mode, prefix, view) {
  const dayend = mode === 'dayend', failed = mode === 'failed';
  const splitPay = view.campaign && !failed && (!dayend || orderCount(view) === 1);
  const title = dayend ? '收工结账。' : failed ? '这一单，没送成。' : '送到了！';
  const action = dayend ? 'restart' : failed ? 'retry' : 'continue';
  return `<div class="nb-surface nb-scrim nb-settlement" ${dialog}${prefix}-title" tabindex="-1"><article class="nb-slip nb-receipt">
    <div class="nb-slip-head">${brand}<span>${dayend ? '当天账单' : '订单回执'}</span></div>
    <div class="nb-receipt-title"><h1 id="${prefix}-title">${title}</h1><i class="nb-stamp">${dayend ? '日结' : failed ? '未送达' : '签收'}</i></div>
    <p data-field="reason"></p>
    <div class="nb-total"><span>${dayend ? '当天实得' : failed ? '本单罚款' : view.campaign ? '本单实得' : '本单工资'}</span><strong data-field="amount"></strong></div>
    <dl class="nb-lines"><div><dt>成功送达</dt><dd data-field="completed"></dd></div>
      ${splitPay ? '<div><dt>基础工资</dt><dd data-field="basePay"></dd></div><div><dt>准时奖</dt><dd data-field="bonus"></dd></div>' : '<div><dt>累计工资</dt><dd data-field="earn"></dd></div>'}
      <div><dt>累计罚款</dt><dd data-field="spend"></dd></div>
      ${dayend ? '' : '<div><dt>当前余额</dt><dd data-field="cash"></dd></div>'}</dl>
    ${button(action, field('resultAction') + icon('arrow'), 'nb-button nb-primary')}
  </article></div>`;
}

function screenFor(view) {
  if (view.stage === 'ride' || view.stage === 'pickup') {
    if (view.mapOpen) return 'map';
    return view.paused ? 'pause' : 'ride';
  }
  return view.stage;
}

function remainingTime(view) {
  if (!view.campaign || !Number.isFinite(view.bonusTime)) return view.timeLeft;
  if (Number.isFinite(view.timeLeft)) return Math.max(0, Math.min(view.bonusTime, view.timeLeft));
  return Math.max(0, view.bonusTime - (view.elapsed ?? 0));
}

function upcomingTurn(path, bike, roadNodes) {
  if (path.length < 3 || !pointOK(bike)) return '';
  // The optional link from the bike to the road centre is not a junction.
  const first = roadNodes.has(path[1].x + ',' + path[1].z) ? 1 : 2;
  let meters = 0;
  for (let i = first; i + 1 < path.length; i++) {
    const before = path[i - 1], corner = path[i], after = path[i + 1];
    const ax = corner.x - before.x, az = corner.z - before.z;
    const bx = after.x - corner.x, bz = after.z - corner.z;
    const length = Math.hypot(ax, az);
    if (!length) continue;
    meters += i === first ? ((corner.x - bike.x) * ax + (corner.z - bike.z) * az) / length : length;
    if (meters > 45) break;
    // With +Z south, north to east has a positive signed turn.
    const degrees = Math.atan2(ax * bz - az * bx, ax * bx + az * bz) * 180 / Math.PI;
    if (Math.abs(degrees) < 40) continue;
    if (meters <= 8 || Math.abs(degrees) >= 165) break;
    return '前方 ' + Math.round(meters) + ' 米' + (degrees > 0 ? '右转' : '左转');
  }
  return '';
}

export function createUI(root, district, action) {
  const prefix = 'nb-' + ++edition;
  const atlas = readDistrict(district);
  const roadNodes = new Set(district.nodes.map(node => node.x + ',' + node.z));
  const phone = district.campaign ? createPhoneNavigation(district) : null;
  const host = document.createElement('div');
  host.className = 'nb-ui';
  root.append(host);
  let mode, layout, map, pocket, inputContext, fields = {};

  function rendered(nextMode, view) {
    if (nextMode === 'intro') return comicMarkup(view, prefix);
    if (nextMode === 'offer') return offerMarkup(prefix, view.campaign);
    if (nextMode === 'map') return view.campaign ? phoneMarkup(prefix) : `<div class="nb-surface nb-scrim nb-full-map" ${dialog}${prefix}-map-title" tabindex="-1">${mapBoard(prefix, true, false)}</div>`;
    if (nextMode === 'ride') return view.campaign ? campaignHUD(view.travelMode === 'foot', prefix) : classicHUD();
    if (nextMode === 'pause') return pauseMarkup(prefix, view);
    return receiptMarkup(nextMode, prefix, view);
  }
  const touchControls = bindTouchControls(host, action, type => {
    if (type === 'selectDay' || type === 'days') {
      const selected = type === 'selectDay';
      fields.dayPicker.hidden = selected;
      fields.orderBody.hidden = fields.orderFoot.hidden = !selected;
      attr(host.firstElementChild, 'aria-labelledby', prefix + (selected ? '-offer-title' : '-day-title'));
      (selected ? fields.title : fields.dayButton).focus({ preventScroll: true });
      return;
    }
    action(type);
  });
  function buttonKeys(event) {
    if (event.target.closest('button') && (event.key === ' ' || event.key === 'Enter')) {
      event.stopPropagation(); // Keep native button activation and the game's global shortcuts from both firing.
      if (event.repeat) event.preventDefault();
    }
  }
  host.addEventListener('keydown', event => {
    buttonKeys(event);
    if (mode === 'ride' || event.key !== 'Tab') return;
    const buttons = [...host.querySelectorAll('button:not(:disabled)')].filter(b => b.getClientRects().length);
    const first = buttons[0], last = buttons.at(-1);
    if (first && ((event.shiftKey && (event.target === first || !buttons.includes(event.target))) ||
        (!event.shiftKey && event.target === last))) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  });
  host.addEventListener('keyup', buttonKeys);

  function set(name, value) { if (fields[name]) write(fields[name], value); }
  function updateHealth(view) {
    const max = view.hpMax > 0 ? view.hpMax : 100;
    const hp = Number.isFinite(view.hp) ? Math.min(max, Math.max(0, Math.ceil(view.hp))) : null;
    attr(fields.hpMeter, 'max', max); attr(fields.hpMeter, 'value', hp ?? 0);
    attr(fields.hpMeter, 'aria-valuetext', hp === null ? '车况未知' : hp + ' / ' + max);
    set('hp', hp ?? '—');
  }
  function showGuide(nav) {
    set('guide', nav.text);
    if (fields.direction.dataset.icon !== nav.icon) {
      fields.direction.dataset.icon = nav.icon;
      fields.direction.innerHTML = icon(nav.icon);
    }
  }
  function refreshCampaignHUD(view, nav, target, order) {
    const foot = view.travelMode === 'foot';
    pocket.update(view, nav);
    set('pocketStatus', nav.indoors ? nav.floor + ' 楼' : nav.location || (foot ? '步行' : '骑行'));
    const collecting = view.leg === 'pickup';
    const motion = view.motion?.type ?? 'none';
    const busy = motion !== 'none';
    fields.touchPad.inert = busy;
    showGuide(nav); updateHealth(view);
    set('target', target);
    set('objective', collecting && !foot ? '到店取餐' : nav.waypoint);
    const time = remainingTime(view);
    fields.timerFace.hidden = collecting;
    fields.timerFace.classList.toggle('nb-time-low', time <= 8 && time > 0);
    set('time', duration(time));
    set('timerLabel', time > 0 ? '准时奖 ' + money(order.bonusPay ?? view.bonusPay) : '准时奖截止');
    set('speed', view.speedKph ?? Math.round(Math.abs(view.bike?.speed ?? 0) * 3.6));
    const side = !foot && (view.side === 'left' || view.side === 'right');
    fields.side.hidden = !side;
    if (side) set('side', view.side === 'left' ? '左侧并排' : '右侧并排');
    const cargo = view.cargo === 'hand' ? '手持餐袋' : foot && view.cargo === 'box' ? '餐袋在后箱' : '';
    fields.cargo.hidden = !cargo; set('cargo', cargo);
    if (!foot) {
      fields.kicks.hidden = view.guard ? view.guard.phase !== 'chasing' : collecting;
      fields.kickLeft.classList.toggle('nb-in-reach', view.side === 'left');
      fields.kickRight.classList.toggle('nb-in-reach', view.side === 'right');
      fields.boostButton.disabled = busy || view.boostReady === false;
    }
    fields.mountButton.hidden = busy || !(foot ? view.canMount : view.canDismount);
    set('mountLabel', foot ? '上车' : '下车');
    const interaction = view.interaction;
    fields.interactButton.hidden = busy || !interaction || interaction.near === false;
    fields.interactButton.disabled = interaction?.enabled === false;
    fields.interactButton.dataset.context = interaction?.kind ?? '';
    set('interaction', interaction?.label);
    fields.motion.hidden = !busy;
    if (busy) {
      set('motionLabel', { mount: '正在上车', dismount: '正在下车', takeBag: '取出餐袋', knock: '正在敲门', handoff: '住户接餐' }[motion]);
      fields.motion.style.setProperty('--progress', (Math.min(1, Math.max(0, view.motion.progress)) * 100).toFixed(1) + '%');
    }
    let toast = view.toast ?? '';
    if (touchControls.isTouch()) toast = toast.replace(/按\s*Enter\s*/g, '点按').replace(/按\s*F\s*/g, '点按')
      .replace(/按住\s*Shift\s*/gi, '按住跑步键');
    fields.toast.hidden = busy || !toast;
    set('toast', toast);
  }
  function refreshClassicHUD(view, destination, order) {
    const loading = view.serving > 0;
    const collecting = view.leg !== 'dropoff';
    const handoffLabel = collecting ? '停稳取餐' : '停稳交餐';
    const touch = touchControls.isTouch();
    const handoffHint = message => touch && message
      ? message.replace(/按\s*(?:Enter|E)\s*(?:停车取餐|取餐|交给顾客|交餐|交接)/g, '点『' + handoffLabel + '』')
      : message;
    const orderTag = '第 ' + view.order + ' 单';
    const objective = collecting ? '到店取餐' : '送往顾客';
    set('objective', orderTag + ' ／ ' + objective);
    set('target', destination);
    const path = view.route ?? [];
    const meters = Number.isFinite(view.routeMeters) ? view.routeMeters : path.length ? Math.round(routeLength(path)) : null;
    const ahead = path.length ? lookAhead(path, 14) : null;
    const dx = ahead && view.bike ? ahead.x - view.bike.x : 0;
    const dz = ahead && view.bike ? ahead.z - view.bike.z : 0;
    const hasBearing = Math.hypot(dx, dz) > 0.25;
    const angle = hasBearing ? Math.atan2(dx, -dz) * 180 / Math.PI - 180 - (view.bike.heading || 0) * 180 / Math.PI : 0;
    const arrow = fields.direction.firstElementChild;
    arrow.style.transform = 'rotate(' + Math.round(angle) + 'deg)';
    fields.direction.classList.toggle('nb-at-stop', !!view.near || !hasBearing);
    const relative = ((angle + 540) % 360 + 360) % 360 - 180;
    const turn = !hasBearing ? '' : Math.abs(relative) < 22.5 ? '前行' : Math.abs(relative) > 145 ? '往身后' : relative > 0 ? '往右前方' : '往左前方';
    const instruction = Array.isArray(view.instructions) ? view.instructions.join(' · ') : view.instructions;
    const arrival = loading ? '商家封袋中 · ' + Math.ceil(view.serving) + ' 秒' : instruction || '到达停靠区，请停稳交接';
    const preview = hasBearing && Math.abs(relative) < 85 ? upcomingTurn(path, view.bike, roadNodes) : '';
    const guide = loading || view.near ? arrival : [preview || turn, meters !== null ? '沿线 ' + meters + ' 米' : ''].filter(Boolean).join(' · ') || instruction;
    set('guide', handoffHint(guide));
    const time = remainingTime(view);
    const limit = order.limit ?? view.timeLimit;
    set('time', duration(time));
    set('timerLabel', '剩余时间');
    fields.timerFace.classList.toggle('nb-time-low', limit > 0 && time / limit <= 0.2);
    updateHealth(view);
    set('cash', money(view.cash));
    set('speed', Number.isFinite(view.speedKph) ? view.speedKph : Number.isFinite(view.bike?.speed) ? Math.round(Math.abs(view.bike.speed) * 3.6) : '—');
    set('inventory', '×' + (view.inventory ?? 0));
    fields.itemButton.disabled = !view.inventory;
    attr(fields.itemButton, 'aria-label', '使用修理包，剩余 ' + (view.inventory ?? 0) + ' 个');
    fields.wet.hidden = !view.wet;
    set('toast', handoffHint(view.toast));
    fields.toast.hidden = !view.toast || (loading && view.near);
    fields.interactButton.hidden = !view.near && !loading;
    fields.interactButton.disabled = loading;
    fields.interactButton.firstElementChild.hidden = touch;
    set('interaction', loading ? '封袋 ' + Math.ceil(view.serving) + ' 秒' : handoffLabel);
  }
  function update(view) {
    const nextMode = screenFor(view);
    const total = orderCount(view);
    const handset = nextMode === 'map' && view.campaign;
    const indoorMap = handset && view.travelMode === 'foot' && view.walker?.indoors;
    const nextLayout = [nextMode, view.campaign ? total : 'classic', nextMode === 'intro' ? view.page : '',
      nextMode === 'ride' ? view.travelMode : '', indoorMap ? 'inside' : ''].join('/');
    const nextInput = [nextLayout, view.leg, view.motion?.type].join('/');
    if (inputContext !== nextInput) { touchControls.clear(); inputContext = nextInput; }
    if (nextLayout !== layout) {
      const focused = host.contains(document.activeElement);
      const formerAction = document.activeElement?.dataset?.act;
      map?.dispose?.(); map = null;
      layout = nextLayout; mode = nextMode;
      host.dataset.screen = mode;
      host.innerHTML = rendered(mode, view);
      fields = Object.fromEntries([...host.querySelectorAll('[data-field]')].map(el => [el.dataset.field, el]));
      if (fields.pocketMap) {
        pocket ??= createPocketMap(district, phone.stairs, estateOverhead);
        fields.pocketMap.prepend(pocket.chart);
      }
      if (fields.map) map = indoorMap ? mountFloorMap(fields.map, phone.stairs) :
        mountMap(fields.map, atlas, prefix + '-blocks', view.campaign, handset);
      if (mode !== 'ride' && (focused || document.activeElement === document.body)) {
        const destination = focused && mode === 'intro' && formerAction === 'next' ? host.querySelector('[data-act="next"]') : fields.dayButton ?? host.firstElementChild;
        destination.focus({ preventScroll: true });
      }
    }
    const order = view.orders?.[view.order - 1] ?? {};
    const target = view.targetLabel || (view.leg === 'dropoff' ? order.home : order.shop) || '停靠区';
    if (mode === 'offer') {
      set('orderTag', view.campaign ? view.order + '/' + total + ' 单' : '第 ' + view.order + ' 单');
      set('dayRoute', [order.shop, order.home].filter(Boolean).join(' → '));
      const award = order.bonusPay ?? view.bonusPay;
      set('offerBonus', Number.isFinite(award) ? money(award) : '');
      set('title', order.title); set('shop', order.shop); set('home', order.home);
      set('pay', money(order.pay)); set('fine', money(order.fine)); set('limit', duration(order.limit ?? view.timeLimit));
      const pickup = view.routeMeters ?? (view.route?.length ? Math.round(routeLength(view.route)) : null);
      const delivery = atlas.deliveryPreview(view.order, view.routeMode).meters;
      set('pickupMeters', pickup == null ? '' : pickup + ' 米');
      set('deliveryMeters', delivery == null ? '' : delivery + ' 米');
    }
    if (handset) {
      const nav = phone.describe(view);
      map.draw(view, nav); showGuide(nav);
      const now = new Date();
      set('phoneClock', String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'));
      set('legInfo', nav.waypoint + ' · ' + Math.round(nav.meters) + ' 米');
      const short = view.routeMode === 'short';
      fields.routeButton.hidden = nav.indoors || (view.travelMode === 'foot' && view.cargo === 'box');
      set('routeMode', short ? '花架优先' : '外圈优先');
      attr(fields.routeButton, 'aria-label', short ? '配送优先紫藤近路，切换为球场外圈' : '配送优先球场外圈，切换为紫藤近路');
    } else if (map) {
      map.draw(view); set('target', target);
      fields.routeButton.hidden = !view.campaign && view.order !== 2;
      fields.previewLegend.hidden = view.leg === 'dropoff' || !atlas.deliveryPreview(view.order, view.routeMode).points.length;
      fields.closedLegend.hidden = !atlas.roads.some(r => r.closedOn === view.order);
      set('routeMode', view.routeMode === 'short' ? '推荐近路' : '推荐主路');
      attr(fields.routeButton, 'aria-label', view.routeMode === 'short' ? '当前推荐近路，切换为推荐主路' : '当前推荐主路，切换为推荐近路');
    } else if (mode === 'ride') {
      if (view.campaign) refreshCampaignHUD(view, phone.describe(view), target, order);
      else refreshClassicHUD(view, target, order);
    }
    else if (mode === 'pause') {
      set('target', target); set('time', duration(remainingTime(view)));
      set('sound', view.muted ? '声音已关闭' : '声音已开启');
      const muteKey = String(!!view.muted);
      if (fields.soundIcon.dataset.muted !== muteKey) {
        fields.soundIcon.dataset.muted = muteKey;
        fields.soundIcon.innerHTML = icon(view.muted ? 'quiet' : 'volume');
      }
      attr(fields.soundButton, 'aria-label', view.muted ? '开启游戏声音' : '关闭游戏声音');
      attr(fields.soundButton, 'aria-pressed', !!view.muted);
    } else if (mode !== 'intro') {
      const daily = mode === 'dayend', failed = mode === 'failed';
      const signed = view.campaign && view.medal ? view.medal : '已交给顾客';
      set('reason', daily ? '平台已完成派单，骑手可以下线。' : failed ? view.reason : order.home ? order.home + ' · ' + signed : '顾客已签收。');
      const earned = view.campaign ? (view.earned ?? order.pay + (view.bonus ?? 0)) : order.pay;
      set('amount', money(daily ? view.cash : failed ? -order.fine : earned));
      set('completed', (view.completed ?? 0) + ' / ' + total + ' 单'); set('cash', money(view.cash));
      set('basePay', money(order.pay)); set('bonus', money(view.bonus));
      set('earn', money(view.earn ?? view.earned)); set('spend', money(view.spend));
      set('resultAction', daily ? '重新开工' : failed ? '重试本单' : view.completed >= total ? '查看当天账单' : '查看下一单');
    }
  }
  return { update };
}
