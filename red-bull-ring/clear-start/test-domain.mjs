import fs from 'node:fs';
import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {boxCorners,boxBasis} from '../geometry.mjs';
import {dot} from '../track-geometry.mjs';
import {auditDriving,auditKerbCoverage,auditPitConnections} from '../audit-driving.mjs';
import {volumeAudit,clearanceAudit} from '../bulk-terrain.mjs';
import {topFootprint} from '../surface-audit.mjs';
import {carveTerrain,intersectsDomain,distanceToPart} from './domain.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url))),plan=read('red-bull-ring-plan.json'),source=read('../red-bull-ring-plan.json'),domain=plan.meta.startDomain;
test('the new standing anchor is beside the pit and its 400-stud square is clear at every height',()=>{
  assert.equal(plan.meta.variant,'clear-start');assert.equal(plan.meta.placementAnchor.name,'clear-area');assert.equal(domain.halfSize,200);
  assert.deepEqual(plan.meta.placementAnchor.position,[domain.center[0],0,domain.center[1]]);
  for(const [i,p] of plan.parts.entries())assert(!intersectsDomain(p,{...domain,guard:0}),`part ${i+1} enters the domain`);
  assert(Math.min(...plan.parts.map(p=>distanceToPart(p,domain.center)))>=200);
  assert(domain.nearestPitRoadStuds>200&&domain.nearestPitRoadStuds<320);
  const foundationIds=new Set(plan.meta.terrain.foundationIndices);assert(foundationIds.size>0);
  for(const i of foundationIds)assert(!intersectsDomain(plan.parts[i],{...domain,guard:0}));
});
test('only terrain changes and the elevated driving geometry remains identical',()=>{
  assert.deepEqual(plan.parts.slice(0,source.meta.terrain.basePartCount),source.parts.slice(0,source.meta.terrain.basePartCount));assert.deepEqual(plan.centerline,source.centerline);
  assert.deepEqual(plan.meta.pitPoints,source.meta.pitPoints);assert.equal(plan.meta.layoutScale,1.5);assert.equal(plan.meta.pitLane.widthStuds,12);
  assert.equal(plan.meta.startDomain.sourcePartsSha256,crypto.createHash('sha256').update(JSON.stringify(source.parts)).digest('hex'));
  assert.equal(plan.parts.length,9623);assert.equal(plan.meta.terrain.totalWithExistingGrass,9624);
  assert.equal(plan.meta.partCount,plan.parts.length);assert(plan.parts.length+1<10000);
  assert.deepEqual(Object.values(plan.meta.groups).flat().sort((a,b)=>a-b),plan.parts.map((_,i)=>i));
  for(const p of plan.parts){assert(p.length===13&&p.every(Number.isFinite));assert(p.slice(3,6).every(n=>n>=.001&&n<=2048));const b=boxBasis(p);assert(Math.abs(dot(b.right,b.up))<.00002);assert(b.up[1]>.5);}
});
test('all driving, kerb and terrain collision checks still pass',()=>{
  assert.deepEqual(auditDriving(plan),plan.meta.drivingAudit);assert.equal(plan.meta.drivingAudit.uncovered,0);assert.equal(plan.meta.drivingAudit.maxLayerRiseStuds,0);
  assert.deepEqual(auditKerbCoverage(plan),plan.meta.kerbCoverage);assert.equal(plan.meta.kerbCoverage.buriedBodySamples,0);assert.equal(plan.meta.kerbCoverage.uncovered,0);
  assert.deepEqual(auditPitConnections(plan),plan.meta.pitConnections);
  const start=plan.meta.terrain.basePartCount,track={parts:plan.parts.slice(0,start)},terrain=plan.parts.slice(start);
  assert.deepEqual(volumeAudit(track,terrain),plan.meta.terrain.volumeAudit);assert.deepEqual(clearanceAudit(track,terrain,.035),plan.meta.terrain.clearanceAudit);
  assert.equal(plan.meta.terrain.volumeAudit.intersections.length,0);assert(plan.meta.terrain.clearanceAudit.maxProtrusionStuds<=0);
});
test('the cut handles a flat foundation and the buried face of a tilted solid',()=>{
  const d={center:[0,0],halfSize:50,guard:.15},flat=[0,1,0,300,2,300,5,1,0,0,0,1,0],pieces=carveTerrain(flat,d);
  assert.equal(pieces.length,4);assert(pieces.every(p=>!intersectsDomain(p,{...d,guard:0})));assert(pieces.every(p=>p[1]===1&&p[4]===2));
  const angle=.18,tilted=[150,20,0,100,200,300,5,Math.cos(angle),-Math.sin(angle),0,Math.sin(angle),Math.cos(angle),0];
  const hole={center:[85,0],halfSize:10,guard:.15};assert(intersectsDomain(tilted,hole));
  assert(topFootprint(tilted).every(p=>p[0]>95),'Only the buried face reaches this domain');
  const kept=carveTerrain(tilted,hole);assert(kept.length>0&&kept.length<=4);assert(kept.every(p=>!intersectsDomain(p,{...hole,guard:0})));
  const basis=boxBasis(tilted);for(const p of kept)for(const corner of boxCorners(p)){const delta=corner.map((v,k)=>v-tilted[k]);assert(Math.abs(dot(delta,basis.right))<=tilted[3]/2+1e-7);assert(Math.abs(dot(delta,basis.up))<=tilted[4]/2+1e-7);assert(Math.abs(dot(delta,basis.back))<=tilted[5]/2+1e-7);}
});
test('a rotated clear square keeps all carved remnants outside its full vertical footprint',()=>{
  const domain={center:[12,-8],halfSize:50,guard:.15,yawRadians:-.28},part=[0,1,0,300,2,300,5,1,0,0,0,1,0];
  assert(intersectsDomain(part,domain));
  const pieces=carveTerrain(part,domain);assert(pieces.length===4);for(const p of pieces)assert(!intersectsDomain(p,{...domain,guard:0}));
  assert(!intersectsDomain([95,1,0,10,2,10,5,1,0,0,0,1,0],domain));
});
test('the variant loader pins matching assets and uses a separate builder and checkpoint',()=>{
  const manifest=read('release-manifest.json'),runtime=read(`releases/${manifest.version}/runtime-plan.json`);assert.deepEqual(runtime.parts,plan.parts);assert.deepEqual(runtime.meta.startDomain,domain);
  for(const f of manifest.files){const bytes=fs.readFileSync(new URL(f.path,import.meta.url));assert.equal(bytes.length,f.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),f.sha256);}
  const loader=fs.readFileSync(new URL('loader.lua',import.meta.url),'utf8'),builder=fs.readFileSync(new URL('red-bull-ring-builder.lua',import.meta.url),'utf8');
  assert(loader.includes(`/red-bull-ring/clear-start/releases/${manifest.version}/`));assert(loader.includes('red-bull-ring-clear-start-jakarta-checkpoint.json'));
  assert(builder.includes('_G.RedBullRingClearStartBuilder = api'));assert(!builder.includes('_G.RedBullRingBuilder = api'));
});
