import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offsetPoint,topAt,compileMonza} from './compile-monza.mjs';
import {boxBasis,boxCorners} from './geometry.mjs';
import {dot,sub} from './track-geometry.mjs';
import {smoothDrivingPoints,profileMetrics} from './smooth-surface.mjs';
import {auditJoins,overlapVertices,topHeight,collisionSampler} from './surface-audit.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),read=name=>JSON.parse(fs.readFileSync(path.join(here,name))),plan=read('monza-plan.json'),reference=read('source/monza-reference.json'),trace=read('source/monza-surfaces.json');
const smoothed=smoothDrivingPoints(reference.points,{heightSigma:plan.meta.settings.heightSmoothingStuds,bankSigma:plan.meta.settings.bankSmoothingStuds});
const point=i=>({...smoothed[i],wr:plan.centerline[i][3],wl:plan.centerline[i][4],pos:[smoothed[i].pos[0],smoothed[i].pos[1]+plan.meta.groundLift,smoothed[i].pos[2]]});
function inside(part,q,tolerance=.001){const basis=boxBasis(part),delta=sub(q,part.slice(0,3));return Math.abs(dot(delta,basis.right))<=part[3]/2+tolerance&&Math.abs(dot(delta,basis.back))<=part[5]/2+tolerance;}
const roadAt=Array(reference.points.length);for(const span of plan.meta.roadSegments)for(let i=span.start;i<=span.end;i++)roadAt[i]=span.index;
test('part budget, dimensions, orientation and separate Monza runtime',()=>{
  assert.equal(plan.meta.format,'monza-elevated-v1');assert(plan.parts.length<=11000);assert.equal(plan.meta.partCount,plan.parts.length);
  assert.deepEqual(plan.meta.gameTarget,{name:'Jakarta',placeId:14005966837,saveObjectLimit:null});
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
  assert(maxStep<.009,`Road join step ${maxStep}`);assert.deepEqual(plan.centerline[0].slice(0,5),plan.centerline.at(-1).slice(0,5));
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
  assert.deepEqual(runtime.meta.gameTarget,plan.meta.gameTarget);
  assert.deepEqual(runtime.meta.nonCollidingPartIndices,plan.meta.nonCollidingPartIndices);
  const loader=fs.readFileSync(path.join(here,'loader.lua'),'utf8');assert(loader.includes(`https://raw.githubusercontent.com/Clarissv/Sepang/main/monza/releases/${manifest.version}/`));assert(!loader.includes('/main/flat/'));assert(loader.includes('monza-jakarta-checkpoint.json'));
});

test('crest smoothing reduces vertical curvature while preserving hills and the horizontal route',()=>{
  const before=profileMetrics(reference.points),after=profileMetrics(smoothed);
  assert(after.maxCurvature<before.maxCurvature*.03,`Curvature ${after.maxCurvature}`);
  assert(after.maxCurvature<.00025);assert(after.maxGrade<.045);
  assert(after.maxBankGradient<before.maxBankGradient*.4);
  assert(plan.meta.surfaceSmoothing.maxHeightAdjustmentStuds<1.2);
  for(let i=0;i<smoothed.length;i++){assert.equal(plan.centerline[i][0],reference.points[i].pos[0]);assert.equal(plan.centerline[i][2],reference.points[i].pos[2]);}
});

test('actual overlapping road and pit corners do not hide raised seams or sharp pitch changes',()=>{
  for(const [spans,closed] of [[plan.meta.roadSegments,true],[plan.meta.pitSegments,false]]) {
    const audit=auditJoins(plan,spans,closed);
    assert(audit.maxOverlapStep<.0085,`Overlap lip ${audit.maxOverlapStep}`);
    assert(audit.maxPitchChangeDegrees<.08,`Pitch crease ${audit.maxPitchChangeDegrees}`);
  }
  // A deliberate raised plate must be caught by the overlap test.
  const a=plan.parts[plan.meta.roadSegments[0].index],b=[...plan.parts[plan.meta.roadSegments[1].index]];b[1]+=.1;
  assert(overlapVertices(a,b).some(([x,z])=>Math.abs(topHeight(a,x,z)-topHeight(b,x,z))>.09));
});

test('all paint and the start line are noncolliding; driving surfaces retain collision',()=>{
  const expected=[...plan.meta.groups.edgeMarkings,...plan.meta.groups.pitMarkings,...plan.meta.groups.startFinish];
  assert.deepEqual(plan.meta.nonCollidingPartIndices,expected);
  const visual=new Set(expected);assert.equal(visual.size,expected.length);
  for(const name of ['asphalt','pitLane','curbs','runoff','sand'])assert(plan.meta.groups[name].every(i=>!visual.has(i)));
});

test('tyre paths include every collision layer and stay close to the smooth profile',()=>{
  const visual=new Set(plan.meta.nonCollidingPartIndices),height=collisionSampler(plan.parts.filter((_,i)=>!visual.has(i)));let maximum=0;
  for(const line of [smoothed,plan.meta.pitPoints])for(const p of line)for(const d of [-12,-6,0,6,12]) {
    const q=offsetPoint(p,d),expected=q[1]+(line===smoothed?plan.meta.groundLift:0),actual=height(q[0],q[2]);
    assert(Number.isFinite(actual),'Gap under a tyre path');maximum=Math.max(maximum,Math.abs(actual-expected));
  }
  // This is profile approximation error, including the curved pit merge;
  // the separate overlap test constrains instantaneous plate-edge lips.
  assert(maximum<.02,`Hidden collision protrusion ${maximum}`);
});

test('distance smoothing is independent of sample density and preserves open endpoint heights',()=>{
  const make=(count,warp)=>{const points=[];for(let i=0;i<count;i++){const t=2*Math.PI*warp(i/count);points.push({pos:[300*Math.cos(t),5*Math.cos(3*t),300*Math.sin(t)],bank:.02*Math.sin(t),wr:20,wl:20});}points.push(structuredClone(points[0]));return points;};
  const regular=smoothDrivingPoints(make(1200,t=>t)),uneven=smoothDrivingPoints(make(2400,t=>t+.08*Math.sin(2*Math.PI*t)));
  const angles=uneven.map((p,i)=>i===uneven.length-1?2*Math.PI:(Math.atan2(p.pos[2],p.pos[0])+2*Math.PI)%(2*Math.PI));let j=0;
  for(let i=0;i<regular.length-1;i++){const angle=i/(regular.length-1)*2*Math.PI;while(j+1<angles.length-1&&angles[j+1]<angle)j++;const t=(angle-angles[j])/(angles[j+1]-angles[j]),height=uneven[j].pos[1]*(1-t)+uneven[j+1].pos[1]*t;assert(Math.abs(regular[i].pos[1]-height)<.001);}
  const open=Array.from({length:501},(_,i)=>({pos:[i,3+.02*i+Math.sin(i/30),0],bank:0,wr:16,wl:16})),result=smoothDrivingPoints(open,{closed:false});
  assert.equal(result[0].pos[1],open[0].pos[1]);assert.equal(result.at(-1).pos[1],open.at(-1).pos[1]);
  assert(result.every(p=>p.pos.every(Number.isFinite)));
});
