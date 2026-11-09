import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {boxCorners,boxBasis} from './geometry.mjs';
import {dot} from './track-geometry.mjs';
import {auditJoins,topHeight} from './surface-audit.mjs';
import {clearanceAudit,volumeAudit,boxesOverlap,constrainSurfaces} from './bulk-terrain.mjs';
import {auditDriving} from './audit-driving.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),read=name=>JSON.parse(fs.readFileSync(path.join(here,name)));
const plan=read('red-bull-ring-plan.json'),terrainStart=plan.meta.terrain.basePartCount;
const track={parts:plan.parts.slice(0,terrainStart)},grass=plan.parts.slice(terrainStart);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

test('the separate elevated circuit has finite valid geometry below the total object budget',()=>{
  assert.equal(plan.meta.format,'red-bull-ring-elevated-v1');assert.equal(plan.meta.partCount,plan.parts.length);
  assert.equal(plan.meta.terrain.totalWithExistingGrass,plan.parts.length+1);assert(plan.parts.length+1<10000);
  assert(plan.meta.retainedHeightRange[1]-plan.meta.retainedHeightRange[0]>160);
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
  assert(main.maxOverlapStep<=.0142,JSON.stringify(main));assert(pit.maxOverlapStep<=.0142,JSON.stringify(pit));
  assert(main.maxPitchChangeDegrees<.2);assert(pit.maxPitchChangeDegrees<.5);
  assert.equal(plan.meta.surfaceSmoothing.overlapGuardStuds,.006);
  const altered=structuredClone(plan);altered.parts[plan.meta.roadSegments[0].index][1]+=.5;
  assert(auditJoins(altered,altered.meta.roadSegments,true).maxOverlapStep>.45,'Raised road must fail the joint audit');
});

test('dense tyre-path samples cover both roads and detect raised collision layers',()=>{
  const report=auditDriving(plan);assert(report.samples>200000);assert.equal(report.uncovered,0);
  assert(report.maxLayerRiseStuds<=.001,JSON.stringify(report));assert(report.maxRoadOverlapStuds<.025,JSON.stringify(report));
  assert.deepEqual(report,plan.meta.drivingAudit);
  const altered=structuredClone(plan),obstacle=[...plan.parts[0]];obstacle[1]+=1;
  altered.meta.groups.obstacle=[altered.parts.length];altered.parts.push(obstacle);
  assert(auditDriving(altered).maxLayerRiseStuds>.9,'An obstruction must be detected');
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
