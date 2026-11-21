// 地图向北为 -Z，向东为 +X。节点是可骑路面的中心，宽度均为全宽。
const nodes = [
  { id: 'square', x: -248, z: -144, label: '牛逼广场' },
  { id: 'plazaNorth', x: -248, z: -180, label: '钟亭北口' },
  { id: 'marketW', x: -248, z: 32, label: '菜市西口' },
  { id: 'westLink', x: -306, z: 32, label: '西市路口' },
  { id: 'marketFork', x: -164, z: 8, label: '菜市辅路入口' },
  { id: 'awningW', x: -132, z: 32 },
  { id: 'shop1', x: -72, z: 32, label: '红棚烧腊' },
  { id: 'awningE', x: -32, z: 32 },
  { id: 'marketMerge', x: 0, z: 8, label: '菜市东口' },
  { id: 'tower', x: 88, z: 32, label: '消防水塔' },
  { id: 'marketBack', x: -248, z: 132, label: '铅印厂后街' },
  { id: 'towerYard', x: 88, z: 132, label: '水塔南口' },
  { id: 'figBend', x: 136, z: 180, label: '榕树弯' },
  { id: 'home1', x: 216, z: 180, label: '机修里六号' },
  { id: 'mealCorner', x: 248, z: 180, label: '食堂街南口' },
  { id: 'shop2', x: 248, z: 116, label: '禾苗面馆' },
  { id: 'fork', x: 248, z: 36, label: '泵站门前路口' },
  { id: 'gateNorth', x: 248, z: -116, label: '门岗内街' },
  { id: 'depotTurn', x: 208, z: -180, label: '泵站北库' },
  { id: 'eastTurn', x: 312, z: 36, label: '东堤入口' },
  { id: 'leveeBend', x: 312, z: -204, label: '堤角南口' },
  { id: 'northEast', x: 278, z: -238, label: '堤角粮仓' },
  { id: 'northTurn', x: -80, z: -238, label: '北堤路口' },
  { id: 'northLink', x: -80, z: -268, label: '北堤外街口' },
  { id: 'yardMouth', x: 176, z: 36, label: '泵坊西口' },
  { id: 'yardCorner', x: 176, z: -28, label: '泵坊磅房' },
  { id: 'rampFoot', x: 132, z: -28, label: '东坡脚' },
  { id: 'rampCrest', x: 72, z: -28, label: '东坡顶' },
  { id: 'drumSouth', x: 8, z: -28, label: '卷扬房前门' },
  { id: 'drumWest', x: 8, z: -70, label: '卷扬房后门' },
  { id: 'drumEast', x: 48, z: -70, label: '滤池东口' },
  { id: 'pumpBack', x: 48, z: -110, label: '滤池北口' },
  { id: 'descentTop', x: 2, z: -110, label: '西坡顶' },
  { id: 'descentFoot', x: -58, z: -110, label: '西坡脚' },
  { id: 'westBend', x: -72.5, z: -110, label: '坡脚缓冲坪' },
  { id: 'pumpFork', x: -80, z: -180, label: '宿舍东口' },
  { id: 'home2', x: -120, z: -180, label: '北泵房宿舍二栋' },
];

// 一条街可以分段入图。交会处引用同一个节点，双向通行。
function street(name, kind, width, ids) {
  return ids.slice(1).map((b, index) => ({ a: ids[index], b, width, kind, name }));
}

const roads = [
  ...street('广场街', 'main', 20, ['plazaNorth', 'square', 'marketW']),
  ...street('菜市街', 'main', 18, ['westLink', 'marketW', 'marketFork', 'marketMerge', 'tower']),
  ...street('红棚门前街', 'alley', 11, ['marketFork', 'awningW', 'shop1', 'awningE', 'marketMerge']),
  ...street('水塔路', 'main', 18, ['tower', 'towerYard', 'figBend', 'home1']),
  ...street('铅印厂后街', 'main', 16, ['marketW', 'marketBack', 'towerYard']),
  ...street('食堂街', 'main', 16, ['home1', 'mealCorner', 'shop2', 'fork']),
  { a: 'fork', b: 'gateNorth', width: 16, kind: 'main', name: '泵站门岗便道', closedOn: 2 },
  ...street('泵站库街', 'main', 16, ['gateNorth', 'depotTurn', 'pumpFork']),
  ...street('东堤路', 'main', 22, ['fork', 'eastTurn', 'leveeBend', 'northEast']),
  ...street('北堤路', 'main', 22, ['northEast', 'northTurn', 'pumpFork']),
  ...street('北堤外街', 'main', 16, ['northTurn', 'northLink']),
  ...street('泵坊引道', 'alley', 15, ['fork', 'yardMouth', 'yardCorner', 'rampFoot']),
  ...street('泵坊东坡', 'ramp', 12, ['rampFoot', 'rampCrest']),
  ...street('卷扬房巷', 'alley', 11, ['rampCrest', 'drumSouth', 'drumWest', 'drumEast', 'pumpBack', 'descentTop']),
  ...street('泵坊西坡', 'ramp', 12, ['descentTop', 'descentFoot']),
  ...street('宿舍坡脚街', 'alley', 14, ['descentFoot', 'westBend', 'pumpFork']),
  ...street('泵房宿舍街', 'alley', 14, ['pumpFork', 'home2', 'plazaNorth']),
];

const stops = {
  square: { node: 'square', label: '牛逼广场' },
  shop1: { node: 'shop1', label: '红棚烧腊' },
  home1: { node: 'home1', label: '机修里六号' },
  shop2: { node: 'shop2', label: '禾苗面馆' },
  home2: { node: 'home2', label: '北泵房宿舍二栋' },
};

const hazards = [
  { id: 'marketShopper', type: 'walker', x: -240, z: -56, r: 1.35, axis: 'x', amplitude: 2.8, phase: 0.55 },
  { id: 'pumpPorter', type: 'walker', x: 181.5, z: 4, r: 1.25, axis: 'z', amplitude: 6, phase: 1.3, order: 2 },
  // 16 米活动闸和两段固定护栏共同填满 25 米门洞。晴天中间正常通车。
  { id: 'pumpGate', type: 'gate', x: 248, z: -12, r: 8, angle: 0, order: 2 },
  { id: 'westGuardRail', type: 'barrier', x: 237.9, z: -12, r: 2.45, angle: 0 },
  { id: 'eastGuardRail', type: 'barrier', x: 258.1, z: -12, r: 2.45, angle: 0 },
  { id: 'leveePuddle', type: 'puddle', x: 317, z: -108, r: 2.8, order: 2 },
  { id: 'filterPuddle', type: 'puddle', x: 29, z: -66.5, r: 1.9, order: 2 },
];

const items = [
  { id: 'marketKit', x: -42, z: 34.5, type: 'repair' },
  { id: 'leveeKit', x: 160, z: -234, type: 'repair' },
];

// 中心、底面宽深和楼高。显式地块保留前院、门洞、楼缝与路角视线。
function lot(x, z, w, d, h, style, label) {
  const block = { x, z, w, d, h, style };
  if (label) block.label = label;
  return block;
}

const blocks = [
  // 西侧沿街建筑和广场。东侧的小钟亭背后专门留出一片广场。
  lot(-285, -157, 30, 32, 14, 'residential'),
  lot(-292, -107, 42, 38, 20, 'residential'),
  lot(-285, -51, 34, 50, 18, 'residential'),
  lot(-282, 0, 32, 22, 8, 'shop'),
  lot(-287, 79, 40, 42, 7, 'market'),
  lot(-284, 158, 36, 38, 22, 'residential'),
  lot(-220, -144, 8, 8, 9, 'civic', '牛角钟亭'),
  lot(-201, -94, 42, 19, 9, 'civic', '工人俱乐部'),
  lot(-198, -48, 54, 24, 19, 'residential'),
  lot(-200, -16, 54, 16, 8, 'shop'),
  lot(-152, -130, 26, 46, 23, 'residential'),
  lot(-119, -128, 20, 42, 24, 'residential'),
  lot(-150, -71, 29, 36, 15, 'residential'),
  lot(-106, -65, 34, 48, 16, 'residential'),
  lot(-115, -20, 32, 19, 8, 'shop'),
  // 菜市门面朝辅路；后街的大开间是旧铅印厂房。
  lot(-209, 64, 48, 28, 7, 'market', '牛角菜市'),
  lot(-204, 105, 48, 24, 12, 'factory'),
  lot(-152, 70, 32, 24, 9, 'market'),
  lot(-150, 104, 36, 21, 10, 'factory'),
  lot(-101, 55, 24, 19, 7, 'shop'),
  lot(-72, 55, 20, 16, 7, 'shop', '红棚烧腊'),
  lot(-43, 56, 24, 18, 6, 'shop'),
  lot(-85, 94, 52, 36, 17, 'residential'),
  lot(-26, 95, 40, 30, 14, 'residential'),
  lot(4, 48, 37, 16, 8, 'shop'),
  lot(42, 89, 38, 43, 11, 'factory', '区铅印厂'),
  lot(-181, 169, 66, 39, 10, 'factory'),
  lot(-95, 169, 62, 37, 9, 'factory'),
  lot(-18, 172, 64, 42, 13, 'factory'),
  lot(48, 175, 40, 40, 15, 'residential'),
  // 水塔在转角外侧，机修里、面馆的建筑入口各朝自己的停靠直道。
  lot(112, 16, 10, 10, 24, 'tower', '消防水塔'),
  lot(118, 72, 28, 36, 6, 'factory'),
  lot(167, 80, 42, 37, 15, 'residential'),
  lot(206, 76, 25, 27, 9, 'shop'),
  lot(204, 113, 35, 24, 12, 'residential'),
  lot(143, 135, 31, 25, 17, 'residential'),
  lot(195, 150, 48, 20, 18, 'residential'),
  lot(155, 206, 36, 22, 16, 'residential'),
  lot(216, 206, 35, 22, 21, 'residential', '机修里六号'),
  lot(272, 116, 19, 24, 7, 'shop', '禾苗面馆'),
  lot(280, 163, 34, 37, 15, 'residential'),
  lot(302, 81, 42, 27, 9, 'market'),
  // 门洞净宽 25。闸杆、护栏与两侧库房相接，分流口到闸前留出观察和转向空间。
  lot(211.5, -39, 48, 96, 8, 'factory', '泵站西门房'),
  lot(278.5, -39, 36, 96, 7, 'factory', '泵站东库'),
  lot(274, -127, 31, 51, 12, 'factory'),
  lot(255, -175, 29, 33, 12, 'factory'),
  lot(149, -62, 16, 23, 7, 'factory'),
  lot(159, -111, 33, 49, 13, 'factory'),
  lot(195, -124, 22, 32, 8, 'factory'),
  // 台地的折返各围一座泵房。矮屋顶让骑手在东坡顶能看见下一处弯。
  lot(34, -49, 26, 17, 6, 'factory', '卷扬房'),
  lot(61, -49, 15, 16, 5, 'factory'),
  lot(25, -91, 21, 16, 6, 'factory', '二号滤池泵房'),
  lot(-36, -149, 49, 20, 11, 'factory'),
  lot(35, -150, 60, 21, 12, 'factory'),
  lot(106, -150, 55, 23, 9, 'factory'),
  // 北堤老粮仓与宿舍。水塔、粮仓、宿舍的天际线高低有别。
  lot(235, -209, 50, 26, 18, 'factory', '堤角粮仓'),
  lot(169, -210, 48, 25, 14, 'factory'),
  lot(108, -209, 46, 24, 11, 'factory'),
  lot(47, -207, 46, 24, 12, 'factory'),
  lot(-16, -208, 53, 26, 16, 'factory'),
  lot(-120, -208, 29, 25, 25, 'residential', '北泵房宿舍二栋'),
  lot(-168, -211, 40, 25, 21, 'residential'),
  lot(-222, -215, 48, 32, 17, 'residential'),
  lot(-173, -257, 47, 25, 19, 'residential'),
  lot(37, -262, 52, 16, 8, 'factory'),
  lot(120, -263, 62, 17, 9, 'factory'),
  lot(218, -264, 52, 16, 12, 'factory'),
  lot(335, -144, 14, 53, 8, 'factory'),
  lot(336, -68, 13, 62, 7, 'factory'),
];

export const district = {
  bounds: { minX: -328, maxX: 350, minZ: -282, maxZ: 228 },
  nodes, roads, stops, hazards, items, blocks,
};

// 原泵站台地两端各有 60 长的直坡，跨整个路宽保持同一标高。
// 另外两面在地块内部放坡收回到地面，堤路和取送点全程保持零标高。
export function elevationAt(x, z) {
  const terrace = Math.min((x + 58) / 60, (132 - x) / 60, (z + 134) / 14, (-8 - z) / 12);
  return 4.8 * Math.max(0, Math.min(1, terrace));
}
