import { writeFile } from 'node:fs/promises';
import { district } from '../src/district.js';
import { makeNavigator, routeLength } from '../src/navigation.js';

const navigation = makeNavigator(district);
const stop = key => ({ ...navigation.node(district.stops[key].node), label: district.stops[key].label });
const path = (from, to, order, mode) => navigation.route(stop(from), stop(to).id, order, mode);
const first = [...path('square', 'shop1', 1, 'safe'), ...path('shop1', 'home1', 1, 'safe').slice(1)];
const pickupTwo = path('home1', 'shop2', 2, 'safe');
const ring = path('shop2', 'home2', 2, 'safe'), short = path('shop2', 'home2', 2, 'short');
const numbers = ['square', 'shop1', 'home1', 'shop2', 'home2'];
const shades = ['#292d31', '#ad4228', '#95532b', '#1a646c', '#005047'];
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const meter = points => Math.round(routeLength(points));
const { minX, minZ, maxX, maxZ } = district.bounds;
const scale = Math.min(590 / (maxX - minX), 350 / (maxZ - minZ));
const px = xpos => 340 + (xpos - (minX + maxX) / 2) * scale;
const py = zpos => 247 + (zpos - (minZ + maxZ) / 2) * scale;
const points = route => route.map(item => [px(item.x).toFixed(1), py(item.z).toFixed(1)].join(',')).join(' ');
const stroke = (route, color, width, dash = '') => '<polyline points="' + points(route) + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="' + dash + '"/>';
const txt = (x,y,size,value,fill='#202628',weight=500) => '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + fill + '" font-weight="' + weight + '">' + escape(value) + '</text>';
function panel(order, offset) {
  let content = '<g transform="translate(' + offset + ' 138)"><rect width="675" height="510" rx="12" fill="#fff9e7" stroke="#222b28" stroke-width="2"/>';
  content += txt(24,37,22,order === 1 ? '01　晴天｜认街与第一次停靠' : '02　暴雨｜封闸后的两条推荐路线','#182a2a',800);
  content += txt(25,62,14,order === 1 ? '从广场，到店，再到住户。' : '先到第二家店；取餐后同一终点可走两条路。','#536463');
  for (const block of district.blocks) {
    content += '<rect x="' + px(block.x - block.w / 2) + '" y="' + py(block.z - block.d / 2) + '" width="' + (block.w * scale) + '" height="' + (block.d * scale) + '" fill="#dcdac7" stroke="#c0c7b7" stroke-width="0.6"/>';
  }
  for (const road of district.roads) {
    const edge = [navigation.node(road.a), navigation.node(road.b)];
    content += stroke(edge,'#acb2a6',Math.max(2,road.width*scale+1.8));
    content += stroke(edge,'#fffdf4',Math.max(1,road.width*scale-0.7));
  }
  if (order === 1) {
    content += stroke(first,'#b24b25',4.2);
  } else {
    content += stroke(pickupTwo,'#64516e',3.1,'2 6');
    content += stroke(ring,'#176d71',5);
    content += stroke(short,'#d39000',3.4,'6 4');
    for (const road of district.roads.filter(edge => edge.closedOn === 2)) {
      const endpoints=[navigation.node(road.a),navigation.node(road.b)];
      content += stroke(endpoints,'#c34738',2.5,'3 5');
      const x = px((endpoints[0].x + endpoints[1].x)/2), y = py((endpoints[0].z + endpoints[1].z)/2);
      content += '<circle cx="'+x+'" cy="'+y+'" r="8" fill="#b53c32"/><path d="M'+(x-3.3)+' '+(y-3.3)+'l6.6 6.6m0 -6.6 -6.6 6.6" stroke="#fff9ed" stroke-width="2"/>';
    }
  }
  for (const [index,key] of numbers.entries()) {
    if ((order === 1 && index > 2) || (order === 2 && index < 2)) continue;
    const node = stop(key), x=px(node.x), y=py(node.z);
    content += '<circle cx="'+x+'" cy="'+y+'" r="10" fill="'+shades[index]+'" stroke="#fffbec" stroke-width="2"/><text x="'+x+'" y="'+(y+4)+'" text-anchor="middle" fill="white" font-weight="800" font-size="11">'+(index+1)+'</text>';
  }
  content += txt(25,453,16,order===1 ? '实线路线：两段合计约 '+meter(first)+' 米' : '取餐后：主路约 '+meter(ring)+' 米　／　近路约 '+meter(short)+' 米','#152e30',700);
  content += txt(25,482,14,order===1 ? '棕实线 = 第一单导航　　编号对应下方站点表' : '绿实线 = 主路　 黄虚线 = 近路　 红 × = 门岗封路','#536463');
  return content + '</g>';
}
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="795" viewBox="0 0 1440 795"><title>牛逼外卖：第一天街区路线底图</title><g font-family="Microsoft YaHei, PingFang SC, sans-serif"><rect width="1440" height="795" fill="#eee6ca"/><path d="M0 0h1440v12H0z" fill="#f6bd22"/>';
svg+=txt(42,66,35,'牛逼外卖　/　第一天路书','#1c2c2d',900)+txt(44,103,16,'同一个街区，两次不同的驾驶决定。地图与游戏读取相同的道路、实际封路和导航算法。　北 ↑','#586866');
svg+=panel(1,38)+panel(2,727);
svg+=txt(44,694,19,'停靠站','#233630',800);
for (const [index,key] of numbers.entries()) {
  const x=44+index*270;
  svg+=txt(x,731,16,(index+1)+'　'+stop(key).label,shades[index],750);
}
svg+=txt(44,769,14,'线路长度按路网中心线计算；骑行时间另受刹车、雨天、转弯和等餐影响。','#586866')+'</g></svg>';
await writeFile(new URL('../街区线路图.svg',import.meta.url),svg,'utf8');
console.log('Route sheet:', { first:meter(first),secondPickup:meter(pickupTwo), safe:meter(ring),short:meter(short) });
