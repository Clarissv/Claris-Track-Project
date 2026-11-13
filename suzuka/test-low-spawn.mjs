import fs from 'node:fs';
import assert from 'node:assert/strict';
import {collisionSampler,topHeight,overlapVertices} from './lib/surface-audit.mjs';
import {intersectsDomain} from './lib/domain.mjs';

const root=new URL('./',import.meta.url),here=new URL('low-spawn/',root);
const original=JSON.parse(fs.readFileSync(new URL('suzuka-plan.json',root)));
const plan=JSON.parse(fs.readFileSync(new URL('suzuka-plan.json',here))),{meta,parts}=plan;
assert.equal(meta.heightProfile.name,'low-spawn');
assert.equal(meta.sourceSha256,original.meta.sourceSha256);
assert.equal(plan.centerline.length,original.centerline.length);
for(let i=0;i<plan.centerline.length;i++){
  assert.ok(Math.abs(plan.centerline[i][0]-original.centerline[i][0])<1e-8);
  assert.ok(Math.abs(plan.centerline[i][2]-original.centerline[i][2])<1e-8);
}
const pit=meta.pitPoints[Math.floor(meta.pitPoints.length*.72)],oldPit=original.meta.pitPoints[Math.floor(original.meta.pitPoints.length*.72)];
assert.ok(pit.pos[1]<15 && oldPit.pos[1]-pit.pos[1]>75,'Pit access height was not lowered enough');
assert.ok(Math.min(...plan.centerline.map(p=>p[1]))>=7.99,'A driving section is below the spawn ground');
assert.ok(Math.max(...plan.centerline.map(p=>p[1]))<45,'The rebuilt circuit still sits too high');
assert.ok(meta.bridge.minimumClearanceStuds>=14,'The lowered crossover must still fit vehicles');
assert.ok(parts.length+1<9000);assert.equal(meta.partCount,parts.length);
assert.equal(meta.terrain.totalWithExistingGrass,parts.length+1);
assert.equal(meta.terrain.addedParts,meta.groups.terrain.length);
for(const weld of meta.terrain.boundaryWelds)for(const key of ['index','higher','lower'])assert.ok(parts[weld[key]],`Invalid weld ${key}`);
const anchor=meta.placementAnchor.position,access=meta.spawnAccess,ramps=access.indices.map(i=>parts[i]);
assert.ok(!parts.some(p=>intersectsDomain(p,{center:[anchor[0],anchor[2]],halfSize:200,guard:0})),'The spawn square must remain clear');
assert.ok(access.maximumSlope<0.1,'The spawn exit must have a gentle driving slope');
assert.ok(access.maxJoinStepStuds<0.08);
const sample=collisionSampler(ramps),[dx,dz]=access.direction,right=[-dz,dx];
let samples=0,maxStep=0;
for(let d=-access.widthStuds/2+2;d<access.widthStuds/2;d+=10){
  let previous;
  for(let s=access.startDistanceStuds;s<=access.startDistanceStuds+access.lengthStuds;s+=0.5){
    const x=anchor[0]+dx*s+right[0]*d,z=anchor[2]+dz*s+right[1]*d,y=sample(x,z);
    assert.ok(Number.isFinite(y),'The spawn ramp has a missing surface');
    if(previous!==undefined)maxStep=Math.max(maxStep,Math.abs(y-previous));
    previous=y;samples++;
  }
}
assert.ok(maxStep<0.08,'The spawn ramp has a driving lip');
const start=sample(anchor[0]+dx*access.startDistanceStuds,anchor[2]+dz*access.startDistanceStuds);
assert.ok(start>=0 && start<0.3,'The spawn ramp must start at ground height');
const rampIds=new Set(access.indices),oldTerrain=meta.groups.terrain.filter(i=>!rampIds.has(i)).map(i=>parts[i]);
let joins=0,maxEndJoin=0;
for(const a of access.spans.filter(s=>s.end===access.startDistanceStuds+access.lengthStuds).map(s=>parts[s.index]))for(const b of oldTerrain){
  if(Math.abs(a[0]-b[0])>(a[3]+a[5]+b[3]+b[5])/2||Math.abs(a[2]-b[2])>(a[3]+a[5]+b[3]+b[5])/2)continue;
  for(const [x,z] of overlapVertices(a,b)){
  const along=(x-anchor[0])*dx+(z-anchor[2])*dz;
  if(along<access.startDistanceStuds+access.lengthStuds-1)continue;
  joins++;maxEndJoin=Math.max(maxEndJoin,Math.abs(topHeight(a,x,z)-topHeight(b,x,z)));
  }
}
assert.ok(joins>0 && maxEndJoin<0.08,'The spawn ramp must join the surrounding terrain');
const connected=collisionSampler([...ramps,...oldTerrain]);
for(let d=-access.widthStuds/2+2;d<access.widthStuds/2;d+=10){
  let previous;
  for(let s=access.startDistanceStuds+access.lengthStuds-3;s<=access.startDistanceStuds+access.lengthStuds+3;s+=0.1){
    const y=connected(anchor[0]+dx*s+right[0]*d,anchor[2]+dz*s+right[1]*d);
    assert.ok(Number.isFinite(y),'The ramp destination has a gap');
    if(previous!==undefined)assert.ok(Math.abs(y-previous)<0.08,'The ramp destination has a step');
    previous=y;
  }
}
const report={parts:parts.length,totalWithGrass:parts.length+1,pitBeforeStuds:oldPit.pos[1],pitAfterStuds:pit.pos[1],crossoverClearanceStuds:meta.bridge.minimumClearanceStuds,spawnRampSamples:samples,maxRampStepStuds:maxStep,maxRampEndJoinStuds:maxEndJoin,maximumRampSlope:access.maximumSlope};
fs.writeFileSync(new URL('spawn-height-audit.json',here),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
