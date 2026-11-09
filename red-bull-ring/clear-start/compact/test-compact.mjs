import fs from 'node:fs';
import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {boxBasis} from '../../geometry.mjs';
import {volumeAudit,clearanceAudit} from '../../bulk-terrain.mjs';
import {auditDriving,auditKerbCoverage,auditPitConnections} from '../../audit-driving.mjs';
import {intersectsDomain} from '../domain.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url))),plan=read('red-bull-ring-plan.json'),source=read('../red-bull-ring-plan.json');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),start=source.meta.terrain.basePartCount;

test('compact keeps the complete road, details, elevation and starting position exactly',()=>{
  assert.deepEqual(plan.parts.slice(0,start),source.parts.slice(0,start));
  assert.deepEqual(plan.centerline,source.centerline);assert.deepEqual(plan.meta.pitPoints,source.meta.pitPoints);
  for(const key of ['placementAnchor','groundLift','retainedHeightRange','catalogRoles','nonCollidingPartIndices','surfaceSmoothing','kerbRuns'])assert.deepEqual(plan.meta[key],source.meta[key],key);
  assert.equal(plan.meta.compactTerrain.preservedTrackSha256,sha(JSON.stringify(source.parts.slice(0,start))));
  assert.equal(plan.meta.compactTerrain.sourcePartsSha256,sha(JSON.stringify(source.parts)));
  const narrow=p=>p.meta.terrain.edgeSpans.filter(s=>s.inner<0).map(({side,inner,outer,start,end})=>({side,inner,outer,start,end}));
  assert.deepEqual(narrow(plan),narrow(source),'Retain all narrow roadside strip spans');
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
test('coarser terrain stays below the complete driving, kerb and pit geometry',()=>{
  assert.deepEqual(auditDriving(plan),plan.meta.drivingAudit);assert.equal(plan.meta.drivingAudit.uncovered,0);assert.equal(plan.meta.drivingAudit.maxLayerRiseStuds,0);
  assert.deepEqual(auditKerbCoverage(plan),plan.meta.kerbCoverage);assert.equal(plan.meta.kerbCoverage.uncovered,0);assert.equal(plan.meta.kerbCoverage.buriedBodySamples,0);
  assert.deepEqual(auditPitConnections(plan),plan.meta.pitConnections);
  const track={parts:plan.parts.slice(0,start)},grass=plan.parts.slice(start);
  assert.deepEqual(volumeAudit(track,grass),plan.meta.terrain.volumeAudit);assert.equal(plan.meta.terrain.volumeAudit.intersections.length,0);
  assert.deepEqual(clearanceAudit(track,grass,.035),plan.meta.terrain.clearanceAudit);assert(plan.meta.terrain.clearanceAudit.maxProtrusionStuds<=0);
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
