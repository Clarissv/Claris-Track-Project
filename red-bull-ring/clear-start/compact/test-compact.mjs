import fs from 'node:fs';
import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {boxBasis} from '../../geometry.mjs';
import {volumeAudit,clearanceAudit} from '../../bulk-terrain.mjs';
import {auditDriving,auditKerbCoverage,auditPitConnections} from '../../audit-driving.mjs';
import {intersectsDomain} from '../domain.mjs';
import {auditShoulders,auditRunoffTransitions,auditPitShoulders,auditPitGap} from './audit-shoulders.mjs';
import {auditLowClearance} from './audit-low-clearance.mjs';
import {auditJoins} from '../../surface-audit.mjs';
import {gradeSurface} from '../../graded-surface.mjs';
import {finishPoints} from '../../reference.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url))),plan=read('red-bull-ring-plan.json'),source=read('../red-bull-ring-plan.json');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),start=plan.meta.terrain.basePartCount;

test('the revised compact track keeps its horizontal racing layout, scale and clear starting position',()=>{
  const horizontal=p=>p.centerline.map(q=>[q[0],q[2],q[3],q[4]]);
  assert.deepEqual(horizontal(plan),horizontal(source));
  for(const key of ['placementAnchor','groundLift','layoutScale','lapLengthMetres'])assert.deepEqual(plan.meta[key],source.meta[key],key);
  assert.equal(plan.meta.compactTerrain.preservedMainHorizontalLayout,true);
  assert.equal(plan.meta.compactTerrain.sourcePartsSha256,sha(JSON.stringify(source.parts)));
  assert.deepEqual(plan.meta.compactTerrain.runoffRefit.changedIndices,plan.meta.runoffSpans.map(s=>s.index));
  assert.equal(plan.meta.terrain.recoveryShoulders,true);
  assert.equal(plan.meta.terrain.shoulderWidthStuds,48);
  assert.equal(plan.meta.terrain.pitShoulderWidthStuds,24);
  assert.deepEqual(new Set(plan.meta.nonCollidingPartIndices),new Set([...plan.meta.groups.edgeMarkings,...plan.meta.groups.pitMarkings,...plan.meta.groups.startFinish]));
});
test('the compact terrain is valid and the complete build including grass is below 9000',()=>{
  assert.equal(plan.meta.variant,'clear-start-compact');assert.equal(plan.meta.partCount,plan.parts.length);
  assert(plan.parts.length+1<9000);assert(plan.parts.length<source.parts.length);
  assert.equal(plan.meta.terrain.totalWithExistingGrass,plan.parts.length+1);
  assert.equal(plan.meta.terrain.addedParts,plan.parts.length-start);
  assert.deepEqual(Object.values(plan.meta.groups).flat().sort((a,b)=>a-b),plan.parts.map((_,i)=>i));
  for(const p of plan.parts){assert(p.length===13&&p.every(Number.isFinite));assert(p.slice(3,6).every(n=>n>=.001&&n<=2048));const b=boxBasis(p);assert(Math.abs(Math.hypot(...b.right)-1)<.00002);assert(Math.abs(Math.hypot(...b.up)-1)<.00002);assert(Math.abs(b.right.reduce((s,v,i)=>s+v*b.up[i],0))<.00002);}
  for(const p of plan.parts)assert(!intersectsDomain(p,{...plan.meta.startDomain,guard:0}));
  assert.equal(plan.meta.startDomain.halfSize,200);
});
test('recovery terrain stays beneath the driving surfaces even where buried solids overlap',()=>{
  assert.deepEqual(auditDriving(plan),plan.meta.drivingAudit);assert.equal(plan.meta.drivingAudit.uncovered,0);assert.equal(plan.meta.drivingAudit.maxLayerRiseStuds,0);
  assert(plan.meta.drivingAudit.maxRoadOverlapStuds<.01);
  assert.deepEqual(auditKerbCoverage(plan),plan.meta.kerbCoverage);assert.equal(plan.meta.kerbCoverage.uncovered,0);assert.equal(plan.meta.kerbCoverage.buriedBodySamples,0);
  assert.deepEqual(auditPitConnections(plan),plan.meta.pitConnections);
  const track={parts:plan.parts.slice(0,start)},grass=plan.parts.slice(start);
  assert.deepEqual(volumeAudit(track,grass),plan.meta.terrain.volumeAudit);
  assert.deepEqual(clearanceAudit(track,grass,.005,false,true),plan.meta.terrain.clearanceAudit);assert(plan.meta.terrain.clearanceAudit.maxProtrusionStuds<=0);
});
test('both grass shoulders and entire runoff aprons have small steps with continuous coverage',()=>{
  assert.deepEqual(auditShoulders(plan),plan.meta.shoulderAudit);
  assert.deepEqual(auditRunoffTransitions(plan),plan.meta.runoffTransitionAudit);
  for(const audit of [plan.meta.shoulderAudit,plan.meta.runoffTransitionAudit]){
    assert(audit.samples>800000);assert.equal(audit.missing,0);
    assert(audit.maxStepStuds<.35,JSON.stringify(audit.worst));
    assert(audit.maxDropStuds<.35,JSON.stringify(audit.worstDrop));
  }
  const old=auditShoulders(source);
  assert(plan.meta.shoulderAudit.maxDropStuds<old.maxDropStuds/50,'Remove large roadside cliffs');
});
test('the complete pit entry and widened lane have fitted grass shoulders',()=>{
  assert.deepEqual(auditPitShoulders(plan),plan.meta.pitShoulderAudit);
  const audit=plan.meta.pitShoulderAudit;
  assert(audit.samples>500000);assert.equal(audit.missing,0);
  assert(audit.maxStepStuds<.35,JSON.stringify(audit.worst));
  assert(audit.maxDropStuds<.35,JSON.stringify(audit.worstDrop));
});
test('the pit building straight reserves at least 25 studs beside an 18-stud lane',()=>{
  assert.deepEqual(auditPitGap(plan),plan.meta.pitGapAudit);
  assert(plan.meta.pitGapAudit.minimumGapStuds>=25);
  assert.equal(plan.meta.pitGapAudit.pitWidthStuds,18);
  assert.equal(plan.meta.pitLayout.requestedGapStuds,25);
  assert.equal(plan.meta.compactTerrain.drivingSettings.pitSeparation,25);
});
test('the pit has one turn at each end with a continuous straight and no sideways return',()=>{
  const l=plan.meta.pitLayout,points=plan.meta.pitPoints;
  assert.equal(l.singleTurns,true);
  const normal=[-l.straightDirection[1],l.straightDirection[0]];
  for(let i=l.straightStartIndex;i<=l.exitStartIndex;i++)assert(Math.abs((points[i].pos[0]-l.straightOrigin[0])*normal[0]+(points[i].pos[2]-l.straightOrigin[1])*normal[1])<1e-7);
  for(const [start,end] of [[l.entryArcStartIndex,l.straightStartIndex],[l.exitStartIndex,l.exitArcEndIndex]]){
    let turns=0;
    for(let i=start+1;i<end;i++){const a=points[i-1].pos,b=points[i].pos,c=points[i+1].pos,u=[b[0]-a[0],b[2]-a[2]],v=[c[0]-b[0],c[2]-b[2]],angle=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);assert(angle>=-1e-6,'An extra reverse bend remains');turns+=angle;}
    assert(turns>1&&turns<2,'Expected one continuous turn');
  }
  assert.deepEqual(points[0].pos.filter((_,i)=>i!==1),l.entry);assert.deepEqual(points.at(-1).pos.filter((_,i)=>i!==1),l.exit);
});
test('road fitting reduces joints and chassis clearance bumps while retaining hills',()=>{
  assert.deepEqual(auditLowClearance(plan),plan.meta.lowClearanceAudit);
  const audit=plan.meta.lowClearanceAudit,main=auditLowClearance(plan,{kinds:['main']}),old=auditLowClearance(source,{kinds:['main']});
  assert.equal(audit.missing,0);assert(audit.maxCrestRiseStuds<.015);assert(audit.maxOverhangRiseStuds<.02);
  assert(main.maxCrestRiseStuds<old.maxCrestRiseStuds);assert(main.maxOverhangRiseStuds<old.maxOverhangRiseStuds);
  assert(plan.meta.surfaceSmoothing.roadJoins.maxOverlapStep<.0061);
  assert(plan.meta.surfaceSmoothing.roadJoins.maxPitchChangeDegrees<.062);
  assert(plan.meta.groups.asphalt.length<source.meta.groups.asphalt.length);
  assert(plan.meta.retainedHeightRange[1]-plan.meta.retainedHeightRange[0]>200);
});
test('connected ramps are longer and smoother than the preceding published compact road',()=>{
  const published=read('releases/f78205c653c1bc354f82/runtime-plan.json');
  const roadIds=published.meta.catalogRoles.find(r=>r.name==='Others75').partIndices;
  const old={...plan,parts:published.parts,meta:{...plan.meta,groups:{asphalt:roadIds,pitLane:[]}}};
  const oldAudit=auditLowClearance(old),current=plan.meta.lowClearanceAudit;
  assert(current.maxCrestRiseStuds<oldAudit.maxCrestRiseStuds/2);
  assert(current.maxOverhangRiseStuds<oldAudit.maxOverhangRiseStuds/2);
  assert(plan.meta.groups.asphalt.length<2687/2);
  assert(plan.meta.surfaceSmoothing.medianRoadLengthStuds>5.0645*1.8);
  assert.deepEqual(auditJoins(plan,plan.meta.roadSegments,true),plan.meta.surfaceSmoothing.roadJoins);
  assert(plan.meta.surfaceSmoothing.roadJoins.maxOverlapStep<.001);
  assert(plan.meta.surfaceSmoothing.roadJoins.maxPitchChangeDegrees<.062);
  const g=plan.meta.compactTerrain.gradedSurface;
  assert.equal(g.lengthStuds,40);assert(g.gradientConstraintResidual<.00002);assert(Math.abs(g.closureResidualStuds)<1e-7);
  assert(Math.abs(plan.meta.retainedHeightRange[1]-plan.meta.retainedHeightRange[0]-250.72107256986556)<1e-6);
  // Checking all overlap vertices must detect an edge lip, including banking.
  const raised=structuredClone(plan);raised.parts[plan.meta.roadSegments[20].index][1]+=.02;
  assert(auditJoins(raised,raised.meta.roadSegments,true).maxOverlapStep>.019);
});
test('ramp fitting handles a level closed circuit and rejects invalid profiles',()=>{
  const points=[],push=(x,z)=>points.push({pos:[x,12.3,z],wr:20,wl:20,bank:0});
  for(let x=-500;x<500;x+=10)push(x,-100);
  for(let i=0;i<64;i++){const a=-Math.PI/2+i*Math.PI/64;push(500+100*Math.cos(a),100*Math.sin(a));}
  for(let x=500;x>-500;x-=10)push(x,100);
  for(let i=0;i<64;i++){const a=Math.PI/2+i*Math.PI/64;push(-500+100*Math.cos(a),100*Math.sin(a));}
  finishPoints(points);
  const horizontal=points.map(p=>[p.pos[0],p.pos[2]]),lap=points.at(-1).s;
  gradeSurface(points,{length:40});
  assert.deepEqual(points.map(p=>[p.pos[0],p.pos[2]]),horizontal);assert.equal(points.at(-1).s,lap);
  for(const p of points){assert.equal(p.pos[1],12.3);assert(p.normal.every(Number.isFinite));}
  assert.throws(()=>gradeSurface(points,{length:-1}),/positive/);
  assert.throws(()=>gradeSurface(points.slice(0,-1)),/closed/);
});
test('compact has matching pinned release assets and independent builder/checkpoint names',()=>{
  const manifest=read('release-manifest.json'),runtime=read(`releases/${manifest.version}/runtime-plan.json`);
  assert.deepEqual(runtime.parts,plan.parts);assert.deepEqual(runtime.meta.compactTerrain,plan.meta.compactTerrain);
  for(const file of manifest.files){const bytes=fs.readFileSync(new URL(file.path,import.meta.url));assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);}
  const loader=fs.readFileSync(new URL('loader.lua',import.meta.url),'utf8'),builder=fs.readFileSync(new URL('red-bull-ring-builder.lua',import.meta.url),'utf8');
  assert(loader.includes(`/red-bull-ring/clear-start/compact/releases/${manifest.version}/`));
  assert(loader.includes('red-bull-ring-clear-start-compact-jakarta-checkpoint.json'));
  assert(builder.includes('_G.RedBullRingClearStartCompactBuilder = api'));assert(!builder.includes('_G.RedBullRingClearStartBuilder = api'));
  assert(builder.includes('currentCount + remainingCount < 9000'));assert(builder.includes('_G.RedBullRingSaveClock'));
});
