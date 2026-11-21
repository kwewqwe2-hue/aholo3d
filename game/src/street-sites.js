// Public-space furniture uses the same metre coordinates for its model and footprint.
export function streetLots(course) {
  const {square,gate,pickup,finish}=course, {court,courtEntry}=course.landmarks;
  const lamp=(id,x,z,yaw,street)=>({
    id:'fixture-'+id,style:'streetFixture',kind:street?'roadLamp':'yardLamp',x,z,yaw,
    w:street?.42:.36,d:street?.42:.36,h:street?5.65:3.55,
  });
  const markerYaw=.24, width=4.70, depth=1.54;
  return [
    {id:'fixture-plaza-name',style:'streetFixture',kind:'plazaName',x:square.x-10.65,z:square.z-8.95,
      yaw:markerYaw,w:Math.cos(markerYaw)*width+Math.sin(markerYaw)*depth,
      d:Math.sin(markerYaw)*width+Math.cos(markerYaw)*depth,h:1.36},
    lamp('plaza-lamp',square.x-10.45,square.z-16.60,Math.PI*.44,true),
    lamp('high-street',square.x+8.45,square.z-35.40,-Math.PI*.52,true),
    lamp('repair-lamp',square.x-15.85,square.z-45.4,Math.PI*.45,true),
    lamp('shop-lamp',92.77,pickup.z+14.4,Math.PI*.49,true),
    lamp('gate-walk',gate.x-11.4,gate.z+11.8,Math.PI*.96,false),
    lamp('court-walk',court.x-3.0,courtEntry.z+10.1,Math.PI,false),
    lamp('west-walk',-119.30,-10.40,Math.PI/2,false),
    lamp('home-walk',finish.x-6.70,finish.z+10.2,Math.PI*.46,false),
  ];
}
