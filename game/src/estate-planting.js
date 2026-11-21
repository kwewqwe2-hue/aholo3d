// Soft planting follows the accepted overhead drawing. The road surface and
// every hard object still come from the course, including the tree pits.
const outlines = [
  [[393,2],[716,0],[706,169],[632,222],[536,194],[447,194],[403,161]],
  [[14,133],[109,156],[130,212],[113,246],[23,256]],
  [[215,207],[401,203],[411,265],[372,311],[251,317]],
  [[0,314],[82,316],[85,387],[45,435],[42,607],[0,664]],
  [[24,577],[123,569],[132,642],[165,671],[170,706],[31,688]],
  [[472,290],[556,289],[597,343],[621,365],[578,387],[488,360]],
  [[644,267],[714,278],[750,334],[751,397],[713,426],[667,360]],
  [[749,228],[1155,230],[1160,340],[1091,378],[954,356],[850,411],[779,373]],
  [[785,391],[1049,357],[1151,369],[1156,465],[1042,490],[870,523],[802,500]],
  [[1000,497],[1172,481],[1229,486],[1214,510],[1118,530],[997,528]],
  [[1179,0],[1258,0],[1259,450],[1244,449],[1226,302],[1211,166]],
  [[1204,558],[1256,552],[1258,1018],[1173,1018],[1180,835],[1224,734]],
  [[44,702],[337,687],[377,717],[374,749],[340,768],[205,743]],
  [[376,877],[509,877],[667,887],[695,985],[405,988]],
  [[625,690],[713,634],[721,679],[704,799],[671,816],[657,760]],
  [[342,979],[1168,981],[1195,1023],[344,1023]],
  [[1409,565],[1527,560],[1535,714],[1478,673],[1419,688]],
];

export function plantingPolygons(course) {
  if(!course.campaign)return [];
  return outlines.map(loop=>loop.map(([px,py])=>[(px-768)*.18,(py-512)*.18]));
}

// Shared by campaign collision and art. The coordinates are artist-picked on
// the source drawing; the clearance check is against the actual sampled road.
export function estateTreeLots(nodes, roads, blocks) {
  const candidates=[
    [418,89],[463,43],[585,66],[650,113],[599,170],[64,187],[111,216],
    [780,290],[850,319],[972,279],[1041,268],[1102,402],[995,424],
    [45,408],[53,496],[88,551],[230,481],[228,548],[633,464],
    [358,704],[421,717],[526,719],[607,726],[678,898],
    [815,618],[1004,620],[1150,610],[1211,619],[1214,710],[1219,913],
    [1475,611],[1500,919],[1319,872],[687,63],[1209,251],[71,683],
  ];
  const points=new Map(nodes.map(n=>[n.id,n]));
  const occupied=blocks.filter(b=>b.style!=='estateTree');
  return candidates.flatMap(([px,py],i)=>{
    const x=(px-768)*.18,z=(py-512)*.18, width=1.10+(i%3)*.16;
    if(occupied.some(b=>Math.abs(x-b.x)<b.w*.5+1.05&&Math.abs(z-b.z)<b.d*.5+1.05))return [];
    for(const r of roads){
      const a=points.get(r.a),b=points.get(r.b);
      const dx=b.x-a.x,dz=b.z-a.z,ax=x-a.x,az=z-a.z;
      const t=Math.max(0,Math.min(1,(dx*ax+dz*az)/(dx*dx+dz*dz||1)));
      if(Math.hypot(ax-dx*t,az-dz*t)<r.width*.5+4.0) return [];
    }
    return [{id:'estateTree'+(i+1),style:'estateTree',x,z,w:width,d:width,h:4.8}];
  });
}

function inside(x,z,poly){
  let hit=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [a,b]=poly[i],[c,d]=poly[j];
    if((b>z)!==(d>z)&&x<(c-a)*(z-b)/(d-b)+a)hit=!hit;
  }
  return hit;
}

export function softPlantPositions(course,random){
  const nodes=new Map(course.nodes.map(n=>[n.id,n]));
  const roads=course.roads.map(r=>{
    const a=nodes.get(r.a),b=nodes.get(r.b);
    const dx=b.x-a.x,dz=b.z-a.z;
    return {a,dx,dz,length2:dx*dx+dz*dz,radius:r.width*.5+.90};
  });
  const result=[];
  for(const polygon of plantingPolygons(course)){
    const xs=polygon.map(v=>v[0]),zs=polygon.map(v=>v[1]);
    const xMin=Math.min(...xs),xMax=Math.max(...xs),zMin=Math.min(...zs),zMax=Math.max(...zs);
    for(let gx=xMin;gx<xMax;gx+=2.15)for(let gz=zMin;gz<zMax;gz+=2.15){
      const x=gx+random()*1.65,z=gz+random()*1.65;
      if(!inside(x,z,polygon))continue;
      if(course.blocks.some(b=>{
        const margin=b.style==='courtLife'?1.20:.37;
        return Math.abs(x-b.x)<b.w/2+margin && Math.abs(z-b.z)<b.d/2+margin;
      }))continue;
      if(roads.some(r=>{
        const ax=x-r.a.x,az=z-r.a.z,t=Math.max(0,Math.min(1,(ax*r.dx+az*r.dz)/(r.length2||1)));
        return (ax-r.dx*t)**2+(az-r.dz*t)**2<r.radius**2;
      }))continue;
      result.push([x,z]);
    }
  }
  return result;
}
