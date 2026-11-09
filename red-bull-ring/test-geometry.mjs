import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {boxCorners,boxBasis,makeSlab} from './geometry.mjs';
import {dot} from './track-geometry.mjs';
import {auditJoins,topHeight} from './surface-audit.mjs';
import {collisionSampler} from './surface-audit.mjs';
import {clearanceAudit,volumeAudit,boxesOverlap,constrainSurfaces,solidToDatum} from './bulk-terrain.mjs';
import {terrainSlab} from './terrain-slab.mjs';
import {auditDriving,auditPitConnections,auditKerbCoverage} from './audit-driving.mjs';
import {finishPoints} from './reference.mjs';
import {fitKerbsToLane} from './track-tidy.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),read=name=>JSON.parse(fs.readFileSync(path.join(here,name)));
const plan=read('red-bull-ring-plan.json'),terrainStart=plan.meta.terrain.basePartCount;
const track={parts:plan.parts.slice(0,terrainStart)},grass=plan.parts.slice(terrainStart);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

test('the separate elevated circuit has finite valid geometry below the total object budget',()=>{
  assert.equal(plan.meta.format,'red-bull-ring-elevated-v1');assert.equal(plan.meta.partCount,plan.parts.length);
  assert.equal(plan.meta.terrain.totalWithExistingGrass,plan.parts.length+1);assert(plan.parts.length+1<10000);
  assert.equal(plan.meta.layoutScale,1.5);
  assert(Math.abs(plan.meta.retainedHeightRange[1]-plan.meta.retainedHeightRange[0]-254.6154)<.001);
  assert(Math.abs(plan.meta.lapLengthMetres-4320.8675)<.01);
  assert.equal(plan.meta.gameTarget.saveObjectLimit,null);
  assert.deepEqual(plan.centerline[0].slice(0,5),plan.centerline.at(-1).slice(0,5));
  const assigned=Object.values(plan.meta.groups).flat().sort((a,b)=>a-b);assert.deepEqual(assigned,plan.parts.map((_,i)=>i));
  for(const [i,p] of plan.parts.entries()){
    assert.equal(p.length,13);assert(p.every(Number.isFinite));assert(p.slice(3,6).every(v=>v>=.001&&v<=2048),`part ${i}`);
    const b=boxBasis(p);assert(Math.abs(Math.hypot(...b.up)-1)<.00001);assert(Math.abs(Math.hypot(...b.right)-1)<.00001);assert(Math.abs(dot(b.right,b.up))<.00001);assert(b.up[1]>.5);
    for(const q of boxCorners(p))for(let k=0;k<3;k++)assert(q[k]>=plan.meta.planBounds.min[k]-.0001&&q[k]<=plan.meta.planBounds.max[k]+.0001);
  }
  assert(plan.meta.catalogRoles.every(r=>r.appearance==='color'&&r.name==='Others75'));
  assert.deepEqual([...plan.meta.catalogRoles[0].partIndices].sort((a,b)=>a-b),[...plan.meta.groups.asphalt,...plan.meta.groups.pitLane].sort((a,b)=>a-b));
});

test('neighbouring road planes have small essential overlaps and gentle pitch changes',()=>{
  const main=auditJoins(plan,plan.meta.roadSegments,true),pit=auditJoins(plan,plan.meta.pitSegments,false);
  assert(main.maxOverlapStep<=.0082,JSON.stringify(main));assert(pit.maxOverlapStep<=.0082,JSON.stringify(pit));
  assert(main.maxPitchChangeDegrees<.09);assert(pit.maxPitchChangeDegrees<.5);
  assert.equal(plan.meta.surfaceSmoothing.overlapGuardStuds,.006);
  const altered=structuredClone(plan);altered.parts[plan.meta.roadSegments[0].index][1]+=.5;
  assert(auditJoins(altered,altered.meta.roadSegments,true).maxOverlapStep>.45,'Raised road must fail the joint audit');
});

test('dense tyre-path samples cover both roads and detect raised collision layers',()=>{
  const report=auditDriving(plan);assert(report.samples>200000);assert.equal(report.uncovered,0);
  assert(report.maxLayerRiseStuds<=.001,JSON.stringify(report));assert(report.maxRoadOverlapStuds<.01,JSON.stringify(report));
  assert.deepEqual(report,plan.meta.drivingAudit);
  const altered=structuredClone(plan),obstacle=[...plan.parts[0]];obstacle[1]+=1;
  altered.meta.groups.obstacle=[altered.parts.length];altered.parts.push(obstacle);
  assert(auditDriving(altered).maxLayerRiseStuds>.9,'An obstruction must be detected');
});

test('the larger layout retains road widths and the long native pit entry',()=>{
  const raw=read('source/red-bull-ring-reference.json'),features=read('source/red-bull-ring-features.json'),scale=plan.meta.layoutScale;
  for(let i=0;i<raw.points.length-1;i+=48){
    const a=raw.points[i],b=plan.centerline[i*2];
    assert(Math.abs(b[0]-a.pos[0]*scale)<.0001);assert(Math.abs(b[2]-a.pos[2]*scale)<.0001);
    const widthFactor=Math.max(1,40/(a.wr+a.wl));
    assert.equal(b[3],a.wr*widthFactor);assert.equal(b[4],a.wl*widthFactor);
  }
  assert.equal(plan.meta.pitLane.widthStuds,12);
  assert.deepEqual(features.pitRoute.nativeTriangleCounts,[459,782,343,55]);
  assert.equal(features.pitRoute.entryMainIndex,6171);assert.equal(features.pitRoute.exitMainIndex,814);
  assert(features.pitRoute.maxPavementDistancePixels<1.5);
  for(const q of plan.meta.pitPoints){assert.equal(q.wr,6);assert.equal(q.wl,6);}
  for(const i of [80,100,120,140]){
    const source=features.pitPoints[i].pos;
    assert(Math.min(...plan.meta.pitPoints.map(q=>Math.hypot(q.pos[0]-source[0]*scale,q.pos[2]-source[2]*scale)))<5,'Retain the long inner entry branch');
  }
});

test('the pit straight holds its line and the exit has one rounded L turn',()=>{
  const layout=plan.meta.pitLayout,line=plan.meta.pitPoints,[dx,dz]=layout.straightDirection,[x,z]=layout.straightOrigin;
  for(let i=layout.straightStartIndex;i<=layout.exitStartIndex;i++)assert(Math.abs((line[i].pos[0]-x)*dz-(line[i].pos[2]-z)*dx)<.00001,'No sideways jog before the exit');
  let total=0;
  for(let i=layout.exitStartIndex+1;i<line.length-1;i++){
    const a=line[i-1].pos,b=line[i].pos,c=line[i+1].pos,u=[b[0]-a[0],b[2]-a[2]],v=[c[0]-b[0],c[2]-b[2]],turn=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);
    assert(turn>-.000001,'The exit cannot reverse turn direction into an S');total+=turn;
  }
  assert(Math.abs(total*180/Math.PI-layout.exitTurnDegrees)<.5);assert(layout.exitTurnDegrees>60&&layout.exitTurnDegrees<90);assert.equal(layout.exitRadiusStuds,90);
});

test('both pit portals have full car-width overlap with the racing asphalt',()=>{
  const report=auditPitConnections(plan);assert.deepEqual(report,plan.meta.pitConnections);
  for(const end of Object.values(report)){assert(end.samples>=30);assert.equal(end.uncovered,0);assert(end.maxSurfaceStepStuds<.01);}
  const features=read('source/red-bull-ring-features.json'),altered={...plan,meta:{...plan.meta,pitPoints:features.pitPoints.map(p=>({...p,pos:p.pos.map(v=>v*plan.meta.layoutScale)}))}};
  assert(Object.values(auditPitConnections(altered)).some(end=>end.uncovered>0),'The old disconnected native endpoints must fail');
});

test('recovered kerb runs are continuous across their full width',()=>{
  const report=auditKerbCoverage(plan);assert.deepEqual(report,plan.meta.kerbCoverage);assert(report.samples>30000);assert.equal(report.uncovered,0);assert(report.maxRiseStuds<.14);assert(report.minRiseStuds>-.04);
  assert(report.bodySamples>19000);assert.equal(report.buriedBodySamples,0,JSON.stringify(report));assert(report.minBodyRiseStuds>.01);
  assert.equal(plan.meta.kerbRuns.length,15);
  assert(plan.meta.kerbRuns.some(r=>r.side===1&&r.start<=6172*2&&r.end>=6268*2));
  const altered=structuredClone(plan),hole=6200*2,missing=new Set(plan.meta.kerbSpans.filter(s=>s.side===1&&s.end>=hole&&s.start<=hole+12).map(s=>s.index));
  altered.meta.groups.curbs=altered.meta.groups.curbs.filter(i=>!missing.has(i));
  assert(auditKerbCoverage(altered).uncovered>0,'Removing a stripe must expose a kerb coverage failure');
});

test('kerb height checks reject continuous strips buried beneath the asphalt',()=>{
  const old=read('releases/5621c5d15b709af33602/runtime-plan.json'),buried=structuredClone(plan);
  for(const id of plan.meta.groups.curbs)buried.parts[id]=old.parts[id];
  const report=auditKerbCoverage(buried);
  assert.equal(report.uncovered,0,'The previous strips covered the footprint despite being buried');
  assert(report.buriedBodySamples>1000,'The visible height check must catch the old whole-strip lowering');
  assert(report.minBodyRiseStuds<-.05);
  assert.equal(plan.meta.surfaceTidying.kerbSurfaceFit.method,'nominal-lane-overlap');
});

test('kerb fitting protects an asymmetric lane without burying its raised body',()=>{
  const lane=[0,20].map(z=>({pos:[0,0,z],wr:14,wl:10,bank:0}));finishPoints(lane,false);
  // This broad asphalt rectangle also covers the kerb outside the 10-stud
  // left lane. Only the kerb's small intrusion into that lane needs lowering.
  const road=makeSlab(lane[0],lane[1],28,0,.5,1,0,0);
  const line=[0,20].map(z=>({pos:[-11.4,.06,z],wr:1.6,wl:1.6,bank:-.0375}));finishPoints(line,false);
  const kerb=makeSlab(line[0],line[1],3.2,0,.12,9,0,0),fitted=fitKerbsToLane([road],[kerb],lane);
  assert.equal(fitted.modified,1);assert(fitted.maximumLowering<.015);
  assert(topHeight(fitted.parts[0],-9.9,10)<=topHeight(road,-9.9,10));
  assert(topHeight(fitted.parts[0],-11.4,10)>.045,'The coloured centre must stay above asphalt');
});

test('four broad runoff aprons replace the marked sand fragments',()=>{
  const features=read('source/red-bull-ring-features.json'),patches=plan.meta.surfaceTidying.cornerAprons;
  assert.deepEqual(patches.map(p=>p.turn),[1,3,9,10]);assert.equal(plan.meta.groupCounts.sand,207);
  const sand=new Set(plan.meta.groups.sand);
  for(const span of plan.meta.runoffSpans.filter(s=>sand.has(s.index))){assert(span.start>=3200*2);assert(span.end<=5500*2);}
  for(const patch of patches){
    assert(patch.indices.length>=15);const surface=collisionSampler(patch.indices.map(i=>plan.parts[i])),apron=features.tidy.aprons.find(a=>a.turn===patch.turn),records=apron.records.filter(r=>r.outer!==null),r=records[Math.floor(records.length/2)],i=r.index*2,q=plan.centerline[i],a=plan.centerline[i-1],b=plan.centerline[i+1],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
    for(const fraction of [.2,.5,.8]){const d=q[3]+3.25+(r.outer*plan.meta.layoutScale-3.25)*fraction;assert(Number.isFinite(surface(q[0]+dz/length*d,q[2]-dx/length*d)),`Turn ${patch.turn} apron must cover its body`);}
  }
});

test('surface tidying preserves the corrected racing road and pit geometry',()=>{
  const old=read('releases/28512ec3da8a3bb5d8d0/runtime-plan.json'),oldRoads=old.meta.catalogRoles[0].partIndices.map(i=>old.parts[i]),roads=[...plan.meta.groups.asphalt,...plan.meta.groups.pitLane].map(i=>plan.parts[i]);
  assert.deepEqual(roads,oldRoads);
});

test('grass reaches a continuous level foundation and folded offsets cannot become fins',()=>{
  const datum=plan.meta.terrain.foundationTop,foundations=plan.meta.terrain.foundationIndices.map(i=>plan.parts[i]);
  assert(plan.meta.terrain.solidToFoundation);assert.equal(datum,2);
  for(const p of foundations){assert.deepEqual(p.slice(7),[1,0,0,0,1,0]);assert.equal(p[1]+p[4]/2,datum);assert.equal(p[1]-p[4]/2,0);}
  const reaches=p=>Math.max(...boxCorners(p).filter((_,i)=>!(i&2)).map(q=>q[1]))<=datum+.0002;
  assert(grass.every(reaches),'Every grass solid must reach the foundation at every bottom corner');
  const cap=[0,10,0,20,.25,10,5,1,0,0,0,1,0];assert(!reaches(cap));assert(reaches(solidToDatum(cap,datum)));
  const folded=[{pos:[0,100,0],wr:.5,wl:.5,bank:.2,surfaceRight:[1,0,0]},{pos:[0,110,.01],wr:.5,wl:.5,bank:.2,surfaceRight:[1,0,0]}];
  const fitted=terrainSlab(folded,0,1);assert(fitted.every(Number.isFinite));assert(fitted[11]>=.76);assert(reaches(solidToDatum(fitted,datum)));
  const minX=Math.min(...foundations.map(p=>p[0]-p[3]/2)),maxX=Math.max(...foundations.map(p=>p[0]+p[3]/2)),minZ=Math.min(...foundations.map(p=>p[2]-p[5]/2)),maxZ=Math.max(...foundations.map(p=>p[2]+p[5]/2));
  for(const p of grass)for(const q of boxCorners(p)){assert(q[0]>=minX-.0001&&q[0]<=maxX+.0001);assert(q[2]>=minZ-.0001&&q[2]<=maxZ+.0001);}
});

test('grass top planes and full solids remain below every track underside',()=>{
  const clearance=clearanceAudit(track,grass,.035),volumes=volumeAudit(track,grass);
  assert(clearance.maxProtrusionStuds<=0,JSON.stringify(clearance));assert.equal(volumes.intersections.length,0);
  assert.deepEqual(clearance,plan.meta.terrain.clearanceAudit);assert.deepEqual(volumes,plan.meta.terrain.volumeAudit);
  assert(boxesOverlap(plan.parts[0],plan.parts[0]));
  for(const p of grass)for(const [i,q] of boxCorners(p).entries())if(i&2)assert(Math.abs(topHeight(p,q[0],q[2])-q[1])<.00003);
  const raised=[...grass[clearance.worst.terrainIndex]];raised[1]+=2;
  assert(clearanceAudit(track,[raised],.035).maxProtrusionStuds>1.5);
});

test('the final foundation fitting handles a low kerb beneath the source datum',()=>{
  const kerb=[0,-.3,0,10,.12,10,4,1,0,0,0,1,0],foundation=[0,-1,0,100,2,100,5,1,0,0,0,1,0];
  assert(clearanceAudit({parts:[kerb]},[foundation]).maxProtrusionStuds>0);
  const fitted=constrainSurfaces({parts:[kerb]},[foundation]);
  assert.equal(fitted.modified,1);assert(clearanceAudit({parts:[kerb]},fitted.parts).maxProtrusionStuds<0);
  assert.equal(volumeAudit({parts:[kerb]},fitted.parts).intersections.length,0);
});

test('release hashes, runtime data and circuit-specific names match the generated plan',()=>{
  const manifest=read('release-manifest.json');assert.equal(manifest.partCount,plan.parts.length);
  for(const f of manifest.files){const bytes=fs.readFileSync(path.join(here,f.path));assert.equal(bytes.length,f.bytes);assert.equal(sha(bytes),f.sha256);}
  const runtime=read(`releases/${manifest.version}/runtime-plan.json`);assert.deepEqual(runtime.parts,plan.parts);
  assert.equal(runtime.meta.format,'red-bull-ring-elevated-v1');
  const builder=fs.readFileSync(path.join(here,'red-bull-ring-builder.lua'),'utf8'),loader=fs.readFileSync(path.join(here,'loader.lua'),'utf8');
  assert(builder.includes('_G.RedBullRingBuilder = api'));assert(!builder.includes('_G.MonzaBuilder = api'));
  assert(builder.includes('red-bull-ring-jakarta-checkpoint.json'));assert(loader.includes(`/red-bull-ring/releases/${manifest.version}/`));
});
