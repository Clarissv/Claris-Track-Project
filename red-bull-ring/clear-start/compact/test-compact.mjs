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
test('road fitting reduces joints and chassis clearance bumps while retaining hills',()=>{
  assert.deepEqual(auditLowClearance(plan),plan.meta.lowClearanceAudit);
  const audit=plan.meta.lowClearanceAudit,old=auditLowClearance(source);
  assert.equal(audit.missing,0);assert(audit.maxCrestRiseStuds<.015);assert(audit.maxOverhangRiseStuds<.02);
  assert(audit.maxCrestRiseStuds<old.maxCrestRiseStuds);assert(audit.maxOverhangRiseStuds<old.maxOverhangRiseStuds);
  assert(plan.meta.surfaceSmoothing.roadJoins.maxOverlapStep<.0061);
  assert(plan.meta.surfaceSmoothing.roadJoins.maxPitchChangeDegrees<.062);
  assert(plan.meta.groups.asphalt.length<source.meta.groups.asphalt.length);
  assert(plan.meta.retainedHeightRange[1]-plan.meta.retainedHeightRange[0]>200);
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
