// These are occupied AABBs in metres. The paired benches, rack and fences have
// individual footprints so that a walker can use the gaps between them.
export function courtyardLots(base) {
  const {court,tree,door,pergola,courtExit}=base.landmarks;
  const south=base.blocks.find(b=>b.id==='southFlats');
  const lot=(name,x,z,w,d,h)=>({id:'courtLife-'+name,style:'courtLife',x,z,w,d,h});
  const east=tree.x+tree.w/2, courtSouth=court.z+court.d/2, front=door.z+door.d/2;
  return [
    lot('cycle-pocket',base.gate.x-18.16,base.gate.z+12.46,5.0,2.10,2.43),
    lot('drying',south.x+15.8,south.z-south.d/2-4.4,3.25,1.66,1.72),
    lot('bench',east+2.63,tree.z+.92,3.15,1.12,1.05),
    lot('reading',east+5.28,tree.z+.70,1.46,1.06,1.65),
    lot('chess',tree.x-7.10,tree.z+20.18,2.68,2.64,2.55),
    lot('ball-corral',court.x+court.w/2+1.56,courtSouth-5.06,1.72,2.28,1.31),
    lot('courtside',court.x-9.21,courtSouth+1.23,3.65,1.65,1.05),
    lot('sideline',court.x-2.48,courtSouth+.55,7.84,.59,1.71),
    lot('backstop',court.x,court.z-court.d/2-.56,11.80,.45,2.76),
    lot('maintenance',courtExit.x+10.76,courtExit.z+4.06,2.46,1.20,1.36),
    lot('watering',pergola[1].x+4.85,pergola[1].z-6.5,2.35,1.52,1.95),
    lot('parcels',base.finish.x+7.15,front+1.44,3.82,1.65,2.56),
    lot('home-cycles',base.finish.x-7.19,front+1.38,3.55,1.66,1.33),
    lot('herb-stand',base.finish.x+6.68,base.finish.z+7.20,1.47,2.94,1.66),
  ];
}
