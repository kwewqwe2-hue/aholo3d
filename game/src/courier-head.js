import { MathUtils } from 'three';
import { TAU, sides, grid, loft } from './courier-geometry.js';

// Origin is the underside of the chin. Everything above the jacket's neck seam
// that must disappear with a replacement head is built under this one parent.
export function buildHead(k,m,head,headwear='helmet') {
  const { put,egg,tube,rod,box }=k;
  const rows=[
    [0,.031,.036,.018],[.008,.046,.048,.015],[.020,.057,.057,.014],[.038,.066,.064,.012],
    [.055,.070,.066,.010],[.064,.072,.068,.010],[.076,.074,.068,.007],
    [.090,.077,.072,.004],[.101,.079,.073,.003],[.113,.080,.073,.002],
    [.127,.080,.076,.000],[.140,.079,.076,-.001],[.153,.080,.078,-.003],
    [.168,.082,.079,-.004],[.186,.083,.081,-.007],[.204,.079,.075,-.009],
    [.221,.065,.061,-.011],[.235,.039,.038,-.011],
  ];
  function gauss(x,y,cx,cy,w,h) { return Math.exp(-(((x-cx)/w)**2+((y-cy)/h)**2)); }
  put(head,m.face,loft(rows,{cols:44,sculpt:([x,y,z],a)=>{
    const front=Math.max(0,Math.cos(a));
    const side=Math.abs(x);
    const relief=.022*gauss(x,y,0,.102,.016,.019)+.013*gauss(x,y,0,.129,.014,.037)
      +.009*gauss(side,y,.012,.097,.010,.011)-.006*gauss(side,y,.034,.137,.021,.010)
      +.006*gauss(side,y,.034,.154,.025,.009)+.008*gauss(side,y,.048,.103,.023,.022)
      +.008*gauss(x,y,0,.061,.031,.009)+.008*gauss(x,y,0,.023,.030,.016);
    return [x,y,z+relief*front**2];
  }}));
  for (const s of sides) {
    egg(head,m.skin,'#b98363',[s*.078,.086,-.003],[.013,.026,.017],[-.12,0,-s*.12]);
    egg(head,m.skin,'#906248',[s*.089,.088,-.002],[.003,.014,.009]);
    tube(head,m.skin,'#cc9675',[[s*.088,.071,.001],[s*.091,.081,-.008],
      [s*.091,.102,-.008],[s*.088,.108,.002],[s*.088,.093,.008]],.0027,13,5);
  }
  const hairLine=a=>.018+.151*MathUtils.smoothstep(Math.cos(a),-.40,.89)+.004*Math.sin(6*a+.9);
  function hair(a,v,extra=0) {
    const y=MathUtils.lerp(hairLine(a),.235,v);
    const r=Math.sqrt(Math.max(.015,1-((y-.125)/.152)**2));
    return [(.088*r+extra)*Math.sin(a),y,-.009+(.093*r+extra)*Math.cos(a)];
  }
  put(head,m.rubber,grid(36,7,(u,v)=>hair((u-.5)*TAU,v),{closed:true}),'#282320');
  for(let i=0;i<29;i++) {
    const a=(i/29-.5)*TAU, skew=.19+.080*Math.sin(i*2.4), length=.006+.008*(.5+.5*Math.sin(i*3.5));
    // Each tapered lock grows from the scalp and ends against the temple or nape.
    const lock=grid(3,3,(u,v)=>{
      const angle=a+(u-.5)*.23*(.19+.81*v)+skew*(1-v);
      const p=hair(angle,v*.29,.0015+.0013*Math.sin(Math.PI*u));
      p[1]-=length*(1-v); return p;
    });
    put(head,m.rubber,lock,['#352c27','#302925','#242121','#43362c'][i%4]);
  }
  if (headwear !== 'helmet') {
    if (headwear === 'cap') {
      put(head,m.cloth,loft([[.139,.084,.088,-.002],[.152,.089,.091,-.003],
        [.170,.092,.095,-.004],[.187,.099,.101,-.013],[.206,.099,.100,-.014],
        [.225,.085,.091,-.012],[.235,.051,.065,-.008]],{cols:32}),'#3b484b');
      put(head,m.rubber,loft([[.143,.088,.092,-.002],[.153,.090,.094,-.003],
        [.167,.091,.095,-.003]],{cols:32}),'#383c3c');
      put(head,m.rubber,grid(24,5,(u,v)=>{
        const a=(u-.5)*2.74, front=Math.cos(a);
        return [(.09+.007*v)*Math.sin(a),.152-.012*v*front-.005*v*v,
          (.091+.057*v*front)*front-.002];
      },{flip:true}),'#303637');
      egg(head,m.metal,'#bdad7a',[0,.183,.094],[.012,.016,.004]);
      egg(head,m.paint,'#465251',[0,.185,.098],[.007,.009,.002]);
    }
    return;
  }
  const lowerAngle=a=>2.27+.18*(1-Math.abs(Math.cos(a)))-1.04*MathUtils.smoothstep(Math.cos(a),.10,.81);
  function shell(a,v,margin=0) {
    const phi=MathUtils.lerp(lowerAngle(a),.012,v), sin=Math.sin(phi);
    return [(.110+margin)*Math.sin(a)*sin,.146+(.133+margin)*Math.cos(phi),
      -.013+(.119+margin)*Math.cos(a)*sin];
  }
  put(head,m.paint,grid(44,14,(u,v)=>shell((u-.5)*TAU,v),{closed:true}),'#eee7da');
  put(head,m.rubber,grid(44,4,(u,v)=>{
    const p=shell((u-.5)*TAU,(1-v)*.001+v*.045);
    return [p[0]*(1-.086*v),p[1]+.001*v,(p[2]+.013)*(1-.115*v)-.013];
  },{closed:true,flip:true}),'#534a40');
  const rim=[],welt=[];
  for(let i=0;i<76;i++) {
    const a=(i/76-.5)*TAU;
    rim.push(shell(a,0)); welt.push(shell(a,.015,.001));
  }
  tube(head,m.rubber,'#47403a',rim,.0038,65,6,true);
  tube(head,m.paint,'#c6b8a4',welt,.0016,59,4,true);
  // Shallow pressed lines and irregular exposed primer on the old shell.
  for(const s of sides) {
    const seam=[];
    for(let i=0;i<=15;i++) seam.push(shell(s*(2.56-.56*i/15),.06+.78*i/15,.0009));
    tube(head,m.paint,'#cec3b2',seam,.00085,21,4);
  }
  for(let i=0;i<48;i++) {
    const a=(i*.61803398875%1-.5)*TAU, h=.028+.41*((i*.414214+.2)%1);
    const len=.019+.095*((i*.732+.2)%1), tilt=(i%3-1)*.013;
    const scratch=grid(3,1,(u,v)=>shell(a+len*u,h+tilt*u+(.002+.006*Math.sin(u*Math.PI))*v,.0011));
    put(head,m.paint,scratch,i%4?'#bead94':'#93836e');
  }
  box(head,m.rubber,'#777568',[0,.083,-.119],[.044,.009,.002],.0008,[-.33,0,0]);
  box(head,m.paint,'#d4cbbc',[0,.085,-.121],[.029,.004,.001],0,[-.33,0,0]);
  function visor(u,v) {
    const a=(u-.5)*2.91, c=Math.max(0,Math.cos(a)), s=Math.sin(a);
    return [( .112+.003*v)*s,.151+.058*c**.83+v*(.014+.080*c**.85),
      .002+(.134-.018*v+.008*Math.sin(Math.PI*v))*c];
  }
  put(head,m.glass,grid(32,8,visor));
  for(const v of [0,1]) {
    const pts=[]; for(let i=0;i<=32;i++) pts.push(visor(i/32,v));
    tube(head,m.metal,v?'#7d7b77':'#928e83',pts,.0018,38,6);
  }
  for(const s of sides) {
    const p=[s*.109,.160,.012];
    rod(head,m.paint,'#d0a04e',[s*.100,.160,.012],p,.014,.014,16);
    rod(head,m.metal,'#77746e',p,[s*.112,.160,.012],.008,.008,12);
    const ribbon=grid(4,12,(u,v)=>{
      const x=s*(.046+.036*v+.005*Math.sin(Math.PI*v)), z=.046-.050*v;
      return [x,.004+.092*v,z+(u-.5)*.015];
    },{flip:s>0});
    // Both sides of the retention webbing are visible around the open face.
    put(head,m.cloth,ribbon,'#403630');
    tube(head,m.cloth,'#463a33',[[s*.079,.083,-.002],[s*.073,.041,.021],
      [s*.048,.007,.045],[s*.024,-.002,.043],[0,-.003,.042]],.0056,17);
  }
  box(head,m.paint,'#a73a2c',[.063,.023,.031],[.012,.016,.020],.003,[.32,0,-.35]);
}
