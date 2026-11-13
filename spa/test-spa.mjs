import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {intersectsDomain} from '../red-bull-ring/clear-start/domain.mjs';
import {auditLowClearance} from '../red-bull-ring/clear-start/compact/audit-low-clearance.mjs';
import {volumeAudit} from '../red-bull-ring/bulk-terrain.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL(n,import.meta.url))),plan=read('spa-plan.json'),barriers=read('barriers/barrier-plan.json'),source=read('source/spa-reference.json');

test('Spa uses the aligned 7 km route without the RBR layout enlargement',()=>{
  assert.equal(plan.meta.layoutScale,1);assert.equal(plan.meta.studsPerMetre,source.studsPerMetre);
  assert(source.alignment.p95<10);assert(source.lapLengthMetres>6990&&source.lapLengthMetres<7020);
  assert.equal(plan.centerline.length,(source.points.length-1)*2+1);
  for(let i=0;i<source.points.length;i+=13)for(const k of [0,2])assert(Math.abs(plan.centerline[i*2][k]-source.points[i].pos[k])<.0001);
  assert(plan.meta.retainedHeightRange[1]-plan.meta.retainedHeightRange[0]>270,'Keep Spa elevation');
  assert.equal(plan.meta.pitLane.widthStuds,18);
});

test('the yellow pit route enters at the final chicane and exits smoothly after La Source',()=>{
  const m=plan.meta,points=m.pitPoints.filter((_,i)=>i%2===0),B=points.at(-1).pos,A=points.at(-2).pos,q=plan.centerline[m.pitLayout.exitMainIndex],next=plan.centerline[m.pitLayout.exitMainIndex+1],u=[B[0]-A[0],B[2]-A[2]],v=[next[0]-q[0],next[2]-q[2]];
  assert.equal(m.pitLayout.entryMainIndex,5449*2);assert.equal(m.pitLayout.exitMainIndex,400*2);
  assert(Math.abs(Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]))*180/Math.PI<1);
  for(let i=2;i<points.length-2;i++)if(points[i].s>points.at(-1).s-500){
    const a=points[i-2].pos,b=points[i].pos,c=points[i+2].pos,u=[b[0]-a[0],b[2]-a[2]],v=[c[0]-b[0],c[2]-b[2]],turn=Math.abs(Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]));
    assert((Math.hypot(...u)+Math.hypot(...v))/2/Math.max(turn,1e-8)>60,'No tight steering kink before the exit arc');
  }
});

test('the GLB paved aprons include grey Eau Rouge and pale uphill runoff',()=>{
  assert(plan.meta.apronReferences.length>1000);
  const grey=plan.meta.apronReferences.filter(s=>s.part[6]===11),pale=plan.meta.apronReferences.filter(s=>s.part[6]===12);
  assert(grey.some(s=>s.start<200*8&&s.end>145*8));assert(pale.some(s=>s.start>200*8));
  for(const color of [8,11,12])assert(plan.meta.groups.terrain.some(i=>plan.parts[i][6]===color),'Integrated skin retains each apron appearance');
});

test('the racing surface and pit are complete and safe for a low chassis',()=>{
  const m=plan.meta;assert.equal(m.drivingAudit.uncovered,0);assert.equal(m.drivingAudit.maxLayerRiseStuds,0);
  assert(m.drivingAudit.maxRoadOverlapStuds<.025);
  for(const a of Object.values(m.pitConnections)){assert.equal(a.uncovered,0);assert(a.maxSurfaceStepStuds<.001);}
  const car=auditLowClearance(plan,{stride:8});assert.equal(car.missing,0);assert(car.maxCrestRiseStuds<.08);assert(car.maxOverhangRiseStuds<.08);
});

test('grass and runoff have complete recoverable edges and an empty starting square',()=>{
  const m=plan.meta;
  for(const a of [m.shoulderAudit,m.runoffTransitionAudit,m.pitShoulderAudit]){assert.equal(a.missing,0);assert(a.maxStepStuds<.4);assert(a.maxDropStuds<.4);}
  assert.equal(m.startDomain.halfSize,200);
  for(const p of [...plan.parts,...barriers.parts])assert(!intersectsDomain(p,{...m.startDomain,guard:0}));
});

test('real barrier paths produce concrete parts clear of all driving solids',()=>{
  assert.equal(barriers.meta.sourceSha256,plan.meta.sourceSha256);
  assert(barriers.parts.length>100);assert(barriers.meta.chains.length>20);
  assert(barriers.meta.catalogRoles.every(r=>r.name==='Others68'));
  const visual=new Set(plan.meta.nonCollidingPartIndices),roads=plan.parts.slice(0,plan.meta.groups.terrain[0]).filter((_,i)=>!visual.has(i));
  assert.equal(volumeAudit({parts:roads},barriers.parts).intersections.length,0);
  assert(barriers.meta.audit.maxGroundGap<0);assert(barriers.meta.audit.minVisible>=2.5);
  assert.equal(barriers.meta.audit.combinedObjects,plan.parts.length+barriers.parts.length+1);
  assert(barriers.meta.audit.combinedObjects<9500);
});
