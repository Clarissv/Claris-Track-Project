import fs from 'node:fs';
import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {boxBasis} from '../../geometry.mjs';
import {volumeAudit,clearanceAudit} from '../../bulk-terrain.mjs';
import {auditDriving,auditKerbCoverage,auditPitConnections} from '../../audit-driving.mjs';
import {intersectsDomain} from '../domain.mjs';
import {auditShoulders,auditRunoffTransitions} from './audit-shoulders.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url))),plan=read('red-bull-ring-plan.json'),source=read('../red-bull-ring-plan.json');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),start=source.meta.terrain.basePartCount;

test('compact keeps road, pit, kerbs, markings, elevation and starting position exactly',()=>{
  const changed=new Set(source.meta.runoffSpans.map(s=>s.index));
  const preserved=source.parts.slice(0,start).flatMap((_,i)=>changed.has(i)?[]:[i]);
  for(const i of preserved)assert.deepEqual(plan.parts[i],source.parts[i],`Part ${i}`);
  assert.deepEqual(plan.centerline,source.centerline);assert.deepEqual(plan.meta.pitPoints,source.meta.pitPoints);
  for(const key of ['placementAnchor','groundLift','retainedHeightRange','catalogRoles','nonCollidingPartIndices','surfaceSmoothing','kerbRuns'])assert.deepEqual(plan.meta[key],source.meta[key],key);
  assert.deepEqual(plan.meta.compactTerrain.preservedTrackIndices,preserved);
  assert.equal(plan.meta.compactTerrain.preservedTrackParts,preserved.length);
  assert.equal(plan.meta.compactTerrain.preservedTrackSha256,sha(JSON.stringify(preserved.map(i=>source.parts[i]))));
  assert.equal(plan.meta.compactTerrain.sourcePartsSha256,sha(JSON.stringify(source.parts)));
  assert.deepEqual(plan.meta.compactTerrain.runoffRefit.changedIndices,[...changed]);
  assert.equal(plan.meta.terrain.recoveryShoulders,true);
  assert.equal(plan.meta.terrain.shoulderWidthStuds,48);
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
