import * as THREE from 'three';
import { grid } from './courier-geometry.js';
import { canvas2d, sequence } from './estate-ground.js';

const resources=new WeakMap();
const zinc='#929b91', dark='#5b6157';

function patternedCotton(art, kind, main) {
  const [c,g]=canvas2d(256), rand=sequence(main==='#536d80'?735:421);
  g.fillStyle='#d6ceb2';g.fillRect(0,0,256,256);
  for(let x=0;x<256;x+=32) {
    g.fillStyle=main;g.fillRect(x,0,kind==='awning'?16:7,256);
    if(kind==='quilt') {
      g.globalAlpha=.57;g.fillRect(0,x,256,6);g.globalAlpha=1;
      g.fillRect(x+11,0,1,256);g.fillRect(0,x+10,256,1);
    }
  }
  for(let i=0;i<15000;i++){
    g.fillStyle=i%3?'rgba(255,245,214,.15)':'rgba(48,48,36,.13)';
    g.fillRect(rand()*256,rand()*256,1+rand()*3,.65);
  }
  g.strokeStyle='#a49a7e';g.lineWidth=2;g.strokeRect(2,2,252,252);
  const material=art.keepMaterial(new THREE.MeshStandardMaterial({
    map:art.texture(c),roughness:.94,side:THREE.DoubleSide,forceSinglePass:true,
  }));
  return material;
}

function fabrics(art) {
  if(resources.has(art))return resources.get(art);
  // The drying quilt folds over a rail; its shorter return has a separate silhouette.
  const quilt=art.keepGeometry(grid(18,12,(u,v)=>{
    const crossed=v<.22;
    const drop=crossed ? (.22-v)*2.20 : (v-.22)/.78;
    const bow=Math.sin(Math.PI*u), side=crossed?-.048:.048;
    return [u-.5,-drop-.039*bow-.035*drop*Math.sin(u*13+.3),
      side+drop*(.030*Math.cos(u*25)+.065*bow+.018*Math.sin(u*11+v))];
  }));
  const shade=art.keepGeometry(grid(32,6,(u,v)=>[u-.5,
    -.31*v-.029*Math.sin(Math.PI*v)-.020*Math.cos(u*24*Math.PI)*v,v]));
  const fringe=art.keepGeometry(grid(32,2,(u,v)=>[u-.5,
    -.31-v*(.087+.044*(.5+.5*Math.cos(u*14*Math.PI))),1+.012*v]));
  const result={quilt,shade,fringe,
    indigo:patternedCotton(art,'quilt','#536d80'),russet:patternedCotton(art,'quilt','#926456'),
    sage:patternedCotton(art,'awning','#718e78'),berry:patternedCotton(art,'awning','#a76e5e')};
  resources.set(art,result);return result;
}

function dryBedding(f,cloth,x,y,z,width,style) {
  const w=width*.74,slip=style%2===0?.16:-.18;
  for(const s of [-1,1]){
    const x0=x+s*w*.47;
    f.beam('metal',[x0,y-.48,z+.06],[x0,y,z+1.13],.031,zinc);
    f.beam('metal',[x0,y,z+.06],[x0,y,z+1.13],.032,zinc);
    f.box('metal',[x0,y-.15,z+.048],[.08,.41,.06],dark);
  }
  f.beam('metal',[x-w/2-.09,y,z+1.10],[x+w/2+.09,y,z+1.10],.034,zinc);
  f.shape(cloth.quilt,style%2?cloth.indigo:cloth.russet,[x+slip,y+.018,z+1.09],
    [w*.72,.87+.11*(style%3),1],'#f5efdf',[0,.012,style%2?.022:-.017]);
  for(const s of [-1,1])f.box('timber',[x+slip+s*w*.29,y+.018,z+1.15],[.039,.076,.028],'#c69b5c');
}
function windowShade(f,cloth,x,y,z,width,style) {
  const w=Math.min(3.1,width*.84),d=style%2?.97:.79,mat=style%3?cloth.sage:cloth.berry;
  f.shape(cloth.shade,mat,[x,y,z+.04],[w,d,d]);
  f.shape(cloth.fringe,mat,[x,y,z+.04],[w,d,d]);
  f.box('metal',[x,y-.31*d,z+d+.034],[w+.04,.042,.052],dark);
  for(const s of [-1,1]){
    const bx=x+s*w*.44;
    f.beam('metal',[bx,y-.60,z+.045],[bx,y-.31*d,z+d],.035,zinc);
    f.box('paint',[bx,y-.29,z+.047],[.087,.62,.065],dark);
  }
}
function serviceDrop(f,x,y,z,height) {
  f.drum('metal',[x,y+height*.5,z+.091],[.088,height,.088],'#948e80');
  const kx=x+.12;
  for(const level of [.56,height*.49,height-.43]){
    f.box('metal',[x,y+level,z+.112],[.14,.055,.067],dark);
    f.box('metal',[kx,y+level,z+.059],[.037,.037,.067],dark);
  }
  f.beam('metal',[x,y+.12,z+.09],[x+.16,y+.08,z+.20],.081,zinc);
  f.beam('metal',[kx,y+.37,z+.046],[kx,y+height-.14,z+.046],.029,'#78776a');
}

export function dressHousing(kit,block,f,w,d,h,floors,storey,portal) {
  const seed=({building7:1,northFlats:4,southFlats:2,westFlats:5})[block.id];
  if(seed===undefined||floors<2)return;
  const cloth=fabrics(kit.art);
  for(const side of [0,block.id==='westFlats'?1:3]){
    const frame=f.child([0,0,0],side*Math.PI/2),span=side?d:w,z=(side?w:d)/2;
    const bays=Math.floor(span/3.9),pitch=span/bays;
    for(let bay=0;bay<bays;bay++){
      const x=(bay+.5)*pitch-span/2;
      if(!side&&portal && x>portal.west-1.4 && x<portal.east+1.4)continue;
      // The streamed Aholo balconies occupy this part of the northern elevation.
      if(!side&&block.id==='northFlats'&&bay>=1&&bay<=9)continue;
      const variant=(bay+seed+(side?3:0))%7;
      if(variant===0 || variant===4) {
        const floor=variant===0?0:Math.min(1+seed%2,floors-1);
        windowShade(frame,cloth,x,floor*storey+2.67,z,pitch,seed+bay);
      } else if(variant===2 || (variant===5&&!side)) {
        const floor=variant===2?1:Math.min(2,floors-1);
        dryBedding(frame,cloth,x,floor*storey+1.84,z,pitch,seed+bay);
      } else if(variant===6 && !side) {
        serviceDrop(frame,x+pitch*.44,.09,z,h-.36);
      }
    }
  }
}

// One recessed bay and its side returns break the flat roof-to-ground silhouette
// of the neighbouring houses visible beyond the playable estate.
export function skylineBalconies(street,w,front,floors,index){
  if(index%3===1)return;
  const x=(index%2?-.5:1.5)*w*.22, width=Math.min(2.64,w*.21);
  const tint=index%4?'#a5b6ad':'#b9a58f';
  for(let level=1;level<floors;level++){
    const y=level*2.88+.66;
    street.box('plaster',[x,y,front+.44],[width+.24,.13,.92],'#bab09a');
    for(const s of [-1,1])street.box('paint',[x+s*width*.49,y+.49,front+.42],[.072,.90,.82],tint);
    street.box('paint',[x,y+.48,front+.84],[width,.73,.09],tint);
    street.box('metal',[x,y+.91,front+.84],[width+.04,.046,.069],'#7b8277');
    if((level+index)%3===0)street.shape('cloth','cloth',[x-.12,y+.50,front+.902],[.81,.68,.65],
      ['#d6c9af','#99aaa6','#a78471'][(index+Math.floor(level/3))%3],[.08,0,.055]);
  }
}
