import { createStairLayout } from '../src/stair-layout.js';
import { createWalkController } from '../src/walk-controller.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = n => Number.isFinite(n) ? +n.toFixed(4) : null;

// Exact distance from a road segment to a solid axis-aligned footprint.
// The two closest points are an intersection, an endpoint or a box corner.
export function segmentBoxDistance(a, b, box) {
  let near = 0, far = 1;
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [p, d, centre, half] of [[a.x,dx,box.x,box.w/2],[a.z,dz,box.z,box.d/2]]) {
    if (d === 0) { if (Math.abs(p-centre) > half) { far = -1; break; } continue; }
    const t1 = (centre-half-p)/d, t2 = (centre+half-p)/d;
    near = Math.max(near, Math.min(t1,t2)); far = Math.min(far, Math.max(t1,t2));
  }
  if (near <= far) return 0;
  const endpoint = p => Math.hypot(Math.max(0,Math.abs(p.x-box.x)-box.w/2), Math.max(0,Math.abs(p.z-box.z)-box.d/2));
  let gap = Math.min(endpoint(a), endpoint(b));
  for (const x of [box.x-box.w/2,box.x+box.w/2]) for (const z of [box.z-box.d/2,box.z+box.d/2]) {
    const t = clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz || 1), 0, 1);
    gap = Math.min(gap, Math.hypot(x-a.x-t*dx, z-a.z-t*dz));
  }
  return gap;
}

export function checkClearance(course, previous = []) {
  const nodes = new Map(course.nodes.map(n => [n.id,n]));
  const roads = course.roads.map(r => ({ ...r, start:nodes.get(r.a), end:nodes.get(r.b) }));
  const stairs = createStairLayout(course), walk = createWalkController(course, stairs);
  const prior = new Map(previous.map(s => [s.id,s]));
  const fields = ['x','z','w','d','h'];
  const items = course.blocks.map(block => {
    let gap = Infinity, nearest;
    for (const r of roads) {
      const margin = segmentBoxDistance(r.start,r.end,block) - r.width/2;
      if (margin < gap) { gap = margin; nearest = r; }
    }
    const old = prior.get(block.id);
    const outside = stairs.world(0,-5), inside = stairs.world(0,stairs.front);
    const doorGap = block.id === course.landmarks.door.id ? null : segmentBoxDistance(outside,inside,block)-stairs.doorHalf;
    return { id:block.id, style:block.style, ...Object.fromEntries(fields.map(k => [k,round(block[k])])),
      road:nearest.name, segment:[nearest.a,nearest.b], edgeGap:round(gap), doorGap:doorGap === null ? null : round(doorGap),
      changed:!old || fields.some(k => Math.abs(block[k]-old[k]) > 0.001) };
  });
  // Sweep the actual foot disk in both directions at 5 cm lateral intervals
  // across the full portal. Leave the motorcycle at the square during this test.
  const feetRadius = 0.26, half = stairs.doorHalf-feetRadius, passes = [];
  const count = Math.ceil(half*2 / 0.05);
  for (let i=0; i<=count; i++) {
    const x = -half + 1e-6 + i*(2*half-2e-6)/count;
    const p = { ...stairs.world(x,-5), heading:Math.PI, speed:0, indoors:false, floor:0 };
    for (let step=0; step<210; step++) walk.step(p,1/60,{throttle:true},Math.PI,course.square);
    const entered = p.indoors && p.floor === 1 && stairs.local(p).d > 1;
    for (let step=0; step<210; step++) walk.step(p,1/60,{throttle:true},0,course.square);
    passes.push({ x:round(x), entered, exited:!p.indoors && stairs.local(p).d < -3 });
  }
  const changed = items.filter(v => v.changed), byGap = (a,b) => a.edgeGap-b.edgeGap;
  const byStyle = Object.fromEntries([...new Set(changed.map(b=>b.style))].map(style=>{
    const list=changed.filter(b=>b.style===style).sort(byGap);
    return [style,{count:list.length, nearest:list[0].id, road:list[0].road, edgeGap:list[0].edgeGap}];
  }));
  return { solids:items, roadSegments:roads.length, changed:changed.length, byStyle,
    removed:previous.filter(p=>!items.some(b=>b.id===p.id)).map(p=>p.id), nearestChanged:changed.toSorted(byGap).slice(0,6),
    intrusions:changed.filter(v => v.edgeGap < -0.001 || (v.doorGap !== null && v.doorGap < -0.001)),
    door:{ width:stairs.doorHalf*2, centreWidth:half*2, tracks:passes.length, blocked:passes.filter(p=>!p.entered||!p.exited) } };
}

// campaignQA.district is created before some GLB fixtures have finished
// attaching. Read the already-loaded course module after the real order.
export async function liveCourse(page) {
  return page.evaluate(async () => {
    const mod = performance.getEntriesByType('resource').find(e => new URL(e.name).pathname.endsWith('/src/campaign-course.js'));
    if (!mod) throw Error('Loaded course resource missing');
    const { campaignDistrict } = await import(mod.name);
    return structuredClone(campaignDistrict);
  });
}

// After the receipt only: read the built meshes by their authored lot IDs.
// Project geometry in the 0.08–2.20 m height band; this keeps paint and
// overhead awnings out of the clearance check. Clip sloping edges at both ends.
export async function renderedFootprints(page, course) {
  const lots = course.blocks.filter(b => ['marketLife','courtLife','streetFixture'].includes(b.style));
  if (!lots.length) return null;
  const shapes = await page.evaluate(ids => {
    const scene = window.portalScenes?.find(s => s.getObjectByName('estate-stair-interior'));
    if (!scene) throw Error('Game scene missing from renderer observations');
    const groups = new Map();
    scene.traverse(o => { for (const id of [o.userData.blockId,o.name]) if (ids.includes(id) && !groups.has(id)) groups.set(id,o); });
    const low=.08, high=2.2;
    return ids.map(id => {
      const root=groups.get(id);
      if (!root) return {id, missing:true};
      let x0=Infinity, z0=Infinity, x1=-Infinity, z1=-Infinity;
      const include=(x,z)=>{ x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z); };
      root.traverse(mesh => {
        const geo=mesh.geometry, pos=geo?.attributes.position;
        if (!mesh.isMesh || !pos) return;
        const world=mesh.matrixWorld.clone(), vertex=mesh.position.clone(), xyz=new Float64Array(3*pos.count);
        const instances=mesh.isInstancedMesh ? mesh.count : 1;
        for(let inst=0;inst<instances;inst++) {
          if(mesh.isInstancedMesh) { mesh.getMatrixAt(inst,world);world.premultiply(mesh.matrixWorld); }
          for(let i=0;i<pos.count;i++) {
            mesh.getVertexPosition(i,vertex).applyMatrix4(world).toArray(xyz,3*i);
            if(vertex.y>=low && vertex.y<=high) include(vertex.x,vertex.z);
          }
          const index=geo.index, count=index?.count ?? pos.count;
          for(let i=0;i<count;i+=3) for(let k=0;k<3;k++) {
            const ia=i+k, ib=i+(k+1)%3, a=3*(index?index.getX(ia):ia), b=3*(index?index.getX(ib):ib);
            const y=xyz[a+1], other=xyz[b+1];
            if((y>=low && y<=high && other>=low && other<=high) || y===other) continue;
            for(const plane of [low,high]) {
              const t=(plane-y)/(other-y);
              if(t>0 && t<1) include(xyz[a]+t*(xyz[b]-xyz[a]),xyz[a+2]+t*(xyz[b+2]-xyz[a+2]));
            }
          }
        }
      });
      return Number.isFinite(x0) ? {id,x:(x0+x1)/2,z:(z0+z1)/2,w:x1-x0,d:z1-z0} : {id, aboveOrBelow:true};
    });
  }, lots.map(b=>b.id));
  const nodes = new Map(course.nodes.map(p=>[p.id,p])), stairs=createStairLayout(course);
  return shapes.map(s => {
    if (!Number.isFinite(s.x)) return s;
    const edgeGap = Math.min(...course.roads.map(r => segmentBoxDistance(nodes.get(r.a),nodes.get(r.b),s)-r.width/2));
    const doorGap = segmentBoxDistance(stairs.world(0,-5),stairs.world(0,stairs.front),s)-stairs.doorHalf;
    return { ...s, edgeGap:round(edgeGap), doorGap:round(doorGap) };
  });
}
