import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offsetPoint,topAt,compileMonza} from './compile-monza.mjs';
import {boxBasis,boxCorners} from './geometry.mjs';
import {dot,sub} from './track-geometry.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),read=name=>JSON.parse(fs.readFileSync(path.join(here,name))),plan=read('monza-plan.json'),reference=read('source/monza-reference.json'),trace=read('source/monza-surfaces.json');
const point=i=>({...reference.points[i],wr:plan.centerline[i][3],wl:plan.centerline[i][4],pos:[reference.points[i].pos[0],reference.points[i].pos[1]+plan.meta.groundLift,reference.points[i].pos[2]]});
function inside(part,q,tolerance=.001){const basis=boxBasis(part),delta=sub(q,part.slice(0,3));return Math.abs(dot(delta,basis.right))<=part[3]/2+tolerance&&Math.abs(dot(delta,basis.back))<=part[5]/2+tolerance;}
const roadAt=Array(reference.points.length);for(const span of plan.meta.roadSegments)for(let i=span.start;i<=span.end;i++)roadAt[i]=span.index;
test('part budget, dimensions, orientation and separate Monza runtime',()=>{
  assert.equal(plan.meta.format,'monza-elevated-v1');assert(plan.parts.length<=11000);assert.equal(plan.meta.partCount,plan.parts.length);
  for(const p of plan.parts){assert.equal(p.length,13);assert(p.every(Number.isFinite));assert(p.slice(3,6).every(d=>d>=.001&&d<=2048));const b=boxBasis(p);assert(Math.abs(Math.hypot(...b.right)-1)<.0002);assert(Math.abs(Math.hypot(...b.up)-1)<.0002);assert(Math.abs(dot(b.right,b.up))<.0002);assert(b.up[1]>.98);assert(plan.meta.palette[p[6]-1]);}
  const builder=fs.readFileSync(path.join(here,'monza-builder.lua'),'utf8');assert(builder.includes('_G.MonzaBuilder = api'));assert(!builder.includes('_G.SepangBuilder ='));assert(!builder.includes('_G.SepangFlatBuilder ='));assert(builder.includes('FollowBuild = true'));assert(builder.includes('No automatic retry'));
});
test('every main-road sample is covered across the entire driving width',()=>{
  let maxError=0;
  for(const span of plan.meta.roadSegments)for(let i=span.start;i<=span.end;i++){const p=point(i),part=plan.parts[span.index];for(const d of [-p.wl,0,p.wr]){const q=offsetPoint(p,d);assert(inside(part,q),`Road gap at sample ${i}`);maxError=Math.max(maxError,Math.abs(topAt(part,q[0],q[2])-q[1]));}}
  assert(maxError<.025,`Road plane error ${maxError}`);
});
test('road joins, including the closing lap, have very small height steps',()=>{
  let maxStep=0;const spans=plan.meta.roadSegments;
  for(let i=0;i<spans.length;i++){const span=spans[i],next=spans[(i+1)%spans.length];if(i+1<spans.length)assert.equal(span.end,next.start);const p=point(span.end);for(const d of [-p.wl,0,p.wr]){const q=offsetPoint(p,d);maxStep=Math.max(maxStep,Math.abs(topAt(plan.parts[span.index],q[0],q[2])-topAt(plan.parts[next.index],q[0],q[2])));}}
  assert(maxStep<.03,`Road join step ${maxStep}`);assert.deepEqual(plan.centerline[0].slice(0,5),plan.centerline.at(-1).slice(0,5));
});
test('model elevation and accepted Sepang vehicle scale are retained',()=>{
  assert.equal(plan.meta.studsPerMetre,2.6884487795629512);assert.equal(plan.meta.settings.roadWidthMultiplier,1.25);assert.equal(plan.meta.settings.pitWidthMultiplier,1.4);
  assert(plan.meta.retainedHeightRange[1]-plan.meta.retainedHeightRange[0]>60);assert(plan.meta.modelFrame.presentationTiltRemovedDegrees>2&&plan.meta.modelFrame.presentationTiltRemovedDegrees<2.1);
  const widths=plan.centerline.map(p=>p[3]+p[4]);assert(Math.min(...widths)>28);assert(Math.max(...widths)<80);assert.equal(plan.meta.pitLane.widthStuds,32);
  for(let i=0;i<plan.centerline.length;i++)assert(Math.abs(plan.centerline[i][1]-point(i).pos[1])<.00001);
});
test('kerbs follow source zones and have low ramps with small joins',()=>{
  let maxInner=0,maxRise=0,maxStep=0;
  assert(trace.zones.length>=20);assert(plan.meta.kerbRuns.length===trace.zones.length);
  for(let n=0;n<plan.meta.kerbSpans.length;n++){const span=plan.meta.kerbSpans[n],zone=trace.zones.find(z=>z.id===span.referenceZone);assert(zone);assert.equal(span.side,zone.side);assert(span.start>=zone.start&&span.end<=zone.end);assert([4,9,14].includes(span.color));for(const i of [span.start,span.end]){const p=point(i),edge=span.side*(span.side>0?p.wr:p.wl),inner=offsetPoint(p,edge),outer=offsetPoint(p,edge+span.side*3.2),part=plan.parts[span.index];maxInner=Math.max(maxInner,Math.abs(topAt(part,inner[0],inner[2])-inner[1]));maxRise=Math.max(maxRise,topAt(part,outer[0],outer[2])-outer[1]);const next=plan.meta.kerbSpans[n+1];if(i===span.end&&next?.referenceZone===span.referenceZone&&next.start===span.end)for(const q of [inner,outer])maxStep=Math.max(maxStep,Math.abs(topAt(part,q[0],q[2])-topAt(plan.parts[next.index],q[0],q[2])));}}
  assert(maxInner<.012,`Kerb inner mismatch ${maxInner}`);assert(maxRise<.13,`Kerb rise ${maxRise}`);assert(maxStep<.012,`Kerb join ${maxStep}`);
});
test('source runoff is tidied and broad areas use merged parts',()=>{
  const cleanup=plan.meta.accessoryCleanup;assert(cleanup.tidiedProfiles>0);assert(cleanup.parts<cleanup.sourceProfiles/2);assert(plan.meta.groupCounts.sand>0&&plan.meta.groupCounts.runoff>0);
  assert(plan.meta.runoffSpans.some(p=>p.profileCount>10));assert(trace.runoff.sections.every(s=>s.boundaries[0]<0));
  let protrusion=-Infinity;
  for(const span of plan.meta.runoffSpans)for(let i=span.start;i<=span.end;i++){const p=point(i),q=offsetPoint(p,span.side*(span.side>0?p.wr:p.wl)),part=plan.parts[span.index];if(inside(part,q))protrusion=Math.max(protrusion,topAt(part,q[0],q[2])-topAt(plan.parts[roadAt[i]],q[0],q[2]));}
  assert(protrusion<.025,`Runoff protrudes above driving edge ${protrusion}`);
});
test('pit lane connects to the circuit and its own joins remain smooth',()=>{
  const points=plan.meta.pitPoints,spans=plan.meta.pitSegments;assert(spans.length>0);
  for(const endpoint of [points[0],points.at(-1)]){const distances=plan.centerline.map(q=>Math.hypot(q[0]-endpoint.pos[0],q[1]-endpoint.pos[1],q[2]-endpoint.pos[2]));assert(Math.min(...distances)<.00001);}
  for(const [endpoint,neighbor,sign] of [[points[0],points[1],1],[points.at(-1),points.at(-2),-1]]){const index=plan.centerline.findIndex(q=>Math.hypot(q[0]-endpoint.pos[0],q[2]-endpoint.pos[2])<.00001),a=plan.centerline[(index-1+plan.centerline.length-1)%(plan.centerline.length-1)],b=plan.centerline[(index+1)%(plan.centerline.length-1)],x=(neighbor.pos[0]-endpoint.pos[0])*sign,z=(neighbor.pos[2]-endpoint.pos[2])*sign,dx=b[0]-a[0],dz=b[2]-a[2];assert((x*dx+z*dz)/(Math.hypot(x,z)*Math.hypot(dx,dz))>.995,'Pit connector must be tangent to circuit');}
  let maxStep=0,maxError=0;
  for(let n=0;n<spans.length;n++){const span=spans[n],part=plan.parts[span.index];for(let i=span.start;i<=span.end;i++)for(const d of [-16,0,16]){const q=offsetPoint(points[i],d);assert(inside(part,q));maxError=Math.max(maxError,Math.abs(topAt(part,q[0],q[2])-q[1]));}if(n+1<spans.length){assert.equal(span.end,spans[n+1].start);for(const d of [-16,0,16]){const q=offsetPoint(points[span.end],d);maxStep=Math.max(maxStep,Math.abs(topAt(part,q[0],q[2])-topAt(plan.parts[spans[n+1].index],q[0],q[2])));}}}
  assert(maxError<.025,`Pit plane error ${maxError}`);assert(maxStep<.04,`Pit seam ${maxStep}`);
});
test('grass clearance, bounds and asphalt catalog assignments match the build',()=>{
  let minimum=Infinity;
  for(const p of plan.parts)for(const [i,q] of boxCorners(p).entries()){if(i&2)minimum=Math.min(minimum,q[1]);for(let k=0;k<3;k++)assert(q[k]>=plan.meta.planBounds.min[k]-.00001&&q[k]<=plan.meta.planBounds.max[k]+.00001);}
  assert(minimum>=-.0001&&minimum<.0001);assert.equal(plan.meta.settings.groundClearance,.25);assert.equal(plan.meta.placementAnchor.position[1],0);
  assert.deepEqual(plan.meta.palette[0].rgb,[65,66,66]);const role=plan.meta.catalogRoles[0];assert.equal(role.name,'Others75');assert.deepEqual(role.partIndices,[...plan.meta.groups.asphalt,...plan.meta.groups.pitLane]);
});
test('generation is reproducible and rejects mismatched source geometry',()=>{
  const hash=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');assert.equal(hash(compileMonza(reference,trace)),hash(plan));assert.throws(()=>compileMonza({...reference,sourceSha256:'changed'},trace),/Mismatched/);
});
test('immutable GitHub release has matching files and runtime geometry',()=>{
  const manifest=read('release-manifest.json');assert.equal(manifest.partCount,plan.parts.length);
  for(const f of manifest.files){const bytes=fs.readFileSync(path.join(here,f.path));assert.equal(bytes.length,f.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),f.sha256);}
  const runtime=read(`releases/${manifest.version}/runtime-plan.json`);assert.deepEqual(runtime.parts,plan.parts);assert.deepEqual(runtime.meta.catalogRoles,plan.meta.catalogRoles);
  const loader=fs.readFileSync(path.join(here,'loader.lua'),'utf8');assert(loader.includes(`https://raw.githubusercontent.com/Clarissv/Sepang/main/monza/releases/${manifest.version}/`));assert(!loader.includes('/main/flat/'));assert(loader.includes('monza-elevated-checkpoint.json'));
});
