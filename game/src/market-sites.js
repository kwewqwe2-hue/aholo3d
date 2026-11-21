// Metres, Y up. A prop's local front is +Z. These placements are shared by
// Three.js and the Node driving/collision tests. No renderer or asset imports.
const quarter=Math.PI/2;

function kitchen(base) {
  const b=base.landmarks.market, stop=base.landmarks.pickup || base.pickup;
  const count=Math.max(1,Math.min(5,Math.round(b.d/6.8))), bay=b.d/count;
  const south=b.z+b.d/2, i=Math.max(0,Math.min(count-1,Math.floor((stop.z-south+b.d)/bay)));
  const center=south-b.d+(i+.5)*bay;
  return {face:b.x-b.w/2, center, seam:center+bay*.5};
}

export function marketStaffStations(base) {
  const {face,center,seam}=kitchen(base);
  return {
    chef:{x:face+.64,y:.185,z:center-1.50,heading:quarter},
    packer:{x:face-.73,y:.159,z:seam-.27,heading:1.43},
    packingPoint:{x:face-1.17,y:.94,z:seam-.20},
  };
}

export function marketSites(base) {
  const l=base.landmarks;
  if(!l?.market || !l.square || !l.turnNorth || !(l.pickup || base.pickup))return [];
  const s=l.square, u=l.turnNorth, gate=base.gate || l.gate;
  const {face,center,seam}=kitchen(base);
  const rows=[];
  // [width, depth, top above grade] describes the solid plan, not the shadow
  // of an overhead canopy. Roofs and wall fittings have no extra ground box.
  function add(zone,id,kind,x,z,yaw,size,variation=0) {
    rows.push({zone,id:'market-'+id,kind,x,z,yaw,size,variation});
  }
  const sx=s.x+9.65,sz=s.z-13.25;
  add('station','rest-canopy','shelter',sx,sz,0,null);
  for(const dx of [-2.63,2.63])for(const dz of [-1.24,1.24])
    add('station','leg-'+(dx<0?'w':'e')+(dz<0?'n':'s'),'post',sx+dx,sz+dz,0,[.23,.23,2.84]);
  add('station','rest-screen','screen',sx,sz-1.25,0,[5.24,.14,2.39]);
  add('station','rest-bench','bench',sx-.61,sz-.66,0,[2.47,.58,.91]);
  add('station','battery-exchange','locker',sx+1.72,sz-.69,0,[1.10,.66,1.84]);
  add('station','water-dispenser','water',sx-2.02,sz-.57,0,[.60,.60,1.39]);
  add('station','jade-moped','moped',s.x+7.18,s.z-7.44,-.79,[.69,1.89,1.22]);
  add('station','work-moped','moped',s.x+9.32,s.z-7.06,-.96,[.72,1.96,1.23],1);
  add('station','cycle-stand','stand',s.x+8.93,s.z-9.42,-.09,[3.10,.47,.48]);

  const rx=s.x-13.37,rz=s.z-38.60;
  add('repair','repair-shop','repair',rx,rz,1.38,[4.15,2.32,3.21]);
  add('repair','service-rack','wheelstand',rx+2.50,rz-.71,.45,[.93,.67,1.34]);
  add('repair','air-pump','compressor',rx+1.99,rz+1.53,-.21,[.79,.50,.78]);
  if(gate){
    add('corner','cargo-tricycle','tricycle',gate.x+12.13,gate.z+14.86,-.24,[1.05,2.46,1.27]);
    add('corner','crate-return','crates',gate.x+11.49,gate.z+18.06,1.15,[1.33,.70,1.11],1);
  }
  // The actual carriageways run on both sides of this part of the high street.
  // Put fittings on the fence's street face; leave both lanes and the turning bulb open.
  const fence=base.blocks?.find(b=>b.id==='northFence');
  const fenceFace=fence?fence.x+fence.w/2:l.marketTurn.x-6.30;
  add('west','street-meters','meters',fenceFace+.23,center+16.00,quarter,[3.55,.43,2.05]);
  add('west','produce-dolly','dolly',fenceFace+.39,center+2.66,quarter,[.78,.50,1.33]);

  add('turn','grain-shop','grocer',u.x+.52,u.z-10.67,0,[7.14,3.14,3.75]);
  add('turn','grain-scale','grain',u.x+1.68,u.z-8.20,-.16,[1.64,.94,1.03]);
  add('turn','grain-baskets','crates',u.x-2.05,u.z-8.13,.09,[1.33,.70,.93]);
  add('kitchen','packing-table','packing',face-1.46,seam,-quarter,[1.52,.74,1.41]);
  add('kitchen','roast-window','roasts',face-.11,center-.15,-quarter,null);
  add('kitchen','exhaust','extractor',face+.16,center-4.04,-quarter,null);
  for(const [i,at] of [center-6.82,center+8.14].entries()){
    const x=face-1.82;
    add('dining','meal-table-'+i,'table',x,at,-quarter,[1.10,.82,.94],i);
    add('dining','stool-'+i+'n','stool',x-.015,at-.87,.12+.13*i,[.39,.41,.452],i);
    add('dining','stool-'+i+'s','stool',x+.10,at+.92,-.19+.06*i,[.39,.41,.452],1-i);
  }
  const southMarket=base.blocks?.find(b=>b.id==='southMarket');
  const southFace=southMarket?southMarket.x-southMarket.w/2:face+1.44;
  add('corner','vegetable-cart','vegetables',southFace-3.53,l.marketTurn.z-1.84,-quarter,[2.18,.97,2.58]);
  add('dining','produce-crates','crates',face-1.05,center+17.48,-1.40,[1.33,.70,1.03],2);
  if(southMarket)
    add('corner','wet-market-pipes','drain',southFace+1.67,southMarket.z+southMarket.d/2+.10,0,null);
  return rows;
}

export function marketLots(base) {
  return marketSites(base).filter(s=>s.size).map(({id,x,z,yaw,size:[width,depth,h]})=>{
    const c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw));
    return {id,style:'marketLife',x,z,w:c*width+s*depth,d:s*width+c*depth,h};
  });
}
