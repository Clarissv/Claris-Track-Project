import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTerrain,clearanceAudit,volumeAudit,boxesOverlap,topHeight} from './terrain.mjs';
import {boxBasis,boxCorners} from '../geometry.mjs';
import {collisionSampler} from '../surface-audit.mjs';
import {dot} from '../track-geometry.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),baseDir=path.resolve(here,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(here,file))),base=JSON.parse(fs.readFileSync(path.join(baseDir,'monza-plan.json'))),plan=read('monza-terrain-plan.json'),ground=read('source/ground-reference.json');
const terrain=plan.parts.slice(base.parts.length),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

test('the complete original track, elevation and collision assignments are preserved',()=>{
  assert.deepEqual(plan.parts.slice(0,base.parts.length),base.parts);
  assert.deepEqual(plan.centerline,base.centerline);
  assert.deepEqual(plan.meta.pitPoints,base.meta.pitPoints);
  assert.deepEqual(plan.meta.nonCollidingPartIndices,base.meta.nonCollidingPartIndices);
  assert.deepEqual(plan.meta.catalogRoles,base.meta.catalogRoles);
  assert.deepEqual(plan.meta.placementAnchor,base.meta.placementAnchor);
  for(const name of Object.keys(base.meta.groups))assert.deepEqual(plan.meta.groups[name],base.meta.groups[name]);
});

test('terrain count includes the original grass and stays within 11000',()=>{
  assert.equal(base.parts.length,10047);assert.equal(terrain.length,703);
  assert.equal(plan.meta.partCount,10750);assert.equal(plan.meta.terrain.totalWithExistingGrass,10751);
  assert(plan.parts.length+1<=11000);
  assert.equal(plan.meta.groups.terrain.length,terrain.length);
  for(const p of terrain) {
    assert.equal(p.length,13);assert(p.every(Number.isFinite));assert(p.slice(3,6).every(d=>d>=.001&&d<=2048));
    const basis=boxBasis(p);assert(Math.abs(Math.hypot(...basis.up)-1)<.00001);assert(Math.abs(dot(basis.right,basis.up))<.00001);
    assert.equal(plan.meta.palette[p[6]-1].material,'Grass');
    for(const q of boxCorners(p))for(let k=0;k<3;k++)assert(q[k]>=plan.meta.planBounds.min[k]-.0001&&q[k]<=plan.meta.planBounds.max[k]+.0001);
  }
});

test('GLB grass heights use the complete original raster transform',()=>{
  assert.equal(ground.sourceSha256,base.meta.sourceSha256);assert.equal(ground.trackPlanDatum,base.meta.groundLift);
  assert(ground.sampledCells>50000);assert(ground.modelToStuds>5.8&&ground.modelToStuds<5.82);
  assert.equal(ground.meshes.length,2);assert(ground.meshes.every(m=>!m.name.includes('collider')));
  assert.equal(ground.meshes.reduce((sum,m)=>sum+m.triangles,0),13638);
  assert(plan.meta.terrain.sourceSamples>plan.meta.terrain.fallbackSamples);
});

test('all terrain overlap vertices stay below every original part underside',()=>{
  const report=clearanceAudit(base,terrain);
  assert(report.overlapVerticesChecked>90000);
  assert(report.maxProtrusionStuds<=0,JSON.stringify(report));
  assert.deepEqual(report,plan.meta.terrain.clearanceAudit);
  const raised=[...terrain[report.worst.terrainIndex]];raised[1]+=2;
  assert(clearanceAudit(base,[raised]).maxProtrusionStuds>1.5,'Deliberately raised grass must fail the clearance audit');
});

test('full rotated grass volumes do not intersect roads, kerbs or runoff',()=>{
  const report=volumeAudit(base,terrain);
  assert(report.pairsChecked>10000);
  assert.equal(report.intersections.length,0,JSON.stringify(report.intersections.slice(0,8)));
  assert(boxesOverlap(base.parts[0],base.parts[0]),'The volume audit must detect an identical colliding box');
});

test('the terrain height calculation agrees with actual thick box top corners',()=>{
  for(const p of terrain)for(const [i,q] of boxCorners(p).entries())if(i&2)assert(Math.abs(topHeight(p,q[0],q[2])-q[1])<.00002);
});

test('terrain cannot change any of the original tyre collision heights',()=>{
  const visual=new Set(base.meta.nonCollidingPartIndices),original=collisionSampler(base.parts.filter((_,i)=>!visual.has(i))),combined=collisionSampler(plan.parts.filter((_,i)=>!visual.has(i)));
  for(const line of [plan.centerline,plan.meta.pitPoints.map(p=>[...p.pos,p.wr,p.wl])])for(let i=0;i<line.length;i+=16) {
    const p=line[i],a=line[Math.max(0,i-1)],b=line[Math.min(line.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
    for(const offset of [-12,0,12]){const x=p[0]+dz/length*offset,z=p[2]-dx/length*offset;assert.equal(combined(x,z),original(x,z));}
  }
});

test('terrain generation is deterministic and rejects a different track source',()=>{
  assert.equal(sha(JSON.stringify(buildTerrain(base,ground))),sha(JSON.stringify(plan)));
  assert.throws(()=>buildTerrain(base,{...ground,sourceSha256:'different'}),/not aligned/);
});

test('the separate immutable loader has correct hashes and independent checkpoint names',()=>{
  const manifest=read('release-manifest.json');assert.equal(manifest.partCount,plan.parts.length);
  for(const f of manifest.files){const bytes=fs.readFileSync(path.join(here,f.path));assert.equal(bytes.length,f.bytes);assert.equal(sha(bytes),f.sha256);}
  const runtime=read(`releases/${manifest.version}/runtime-plan.json`);assert.deepEqual(runtime.parts,plan.parts);assert.equal(runtime.meta.variant,'terrain');assert.equal(runtime.meta.terrainBasePartCount,10047);
  const loader=fs.readFileSync(path.join(here,'loader.lua'),'utf8'),builder=fs.readFileSync(path.join(here,'monza-terrain-builder.lua'),'utf8');
  assert(loader.includes(`/monza/terrain/releases/${manifest.version}/`));assert(loader.includes('monza-terrain-jakarta-checkpoint.json'));
  assert(builder.includes('_G.MonzaTerrainBuilder = api'));assert(!builder.includes('_G.MonzaBuilder = api'));
  assert(builder.includes('function api.AddTerrain()'));assert(builder.includes('MONZA TERRAIN BUILDER'));
});

test('every non-terrain source file and published base entry is unchanged',()=>{
  const baseline=read('source/non-terrain-integrity.json');
  for(const [name,hash] of Object.entries(baseline))assert.equal(sha(fs.readFileSync(path.join(baseDir,name))),hash,name);
  for(const name of ['loader.lua','monza-plan.json','monza-builder.lua'])assert.equal(sha(fs.readFileSync(path.join(here,'..',name))),baseline[name],name);
});
