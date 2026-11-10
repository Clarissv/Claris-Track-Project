import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {readBase,checksum,excluded} from './generate.mjs';
import {readReference,segmentDistance} from './reference-paths.mjs';
import {boxCorners,boxBasis} from '../../../geometry.mjs';
import {boxesOverlap,volumeAudit} from '../../../bulk-terrain.mjs';
import {collisionSampler,overlapVertices,topHeight} from '../../../surface-audit.mjs';
import {intersectsDomain} from '../../domain.mjs';
import {KDTree} from '../../../track-geometry.mjs';
const base=readBase(),plan=JSON.parse(fs.readFileSync(new URL('barrier-plan.json',import.meta.url))),reference=readReference();
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

test('tidy concrete barriers match the GLB and current base, below 9500 total parts',()=>{
  assert.equal(plan.meta.requiredBase.count,base.parts.length);
  assert.equal(plan.meta.requiredBase.checksum,checksum(base.parts));
  assert.equal(JSON.parse(fs.readFileSync(new URL('../release-manifest.json',import.meta.url))).version,plan.meta.requiredBase.version);
  assert.equal(plan.meta.sourceSha256,reference.meta.sourceSha256);assert.equal(reference.meta.sourceSha256,base.meta.sourceSha256);
  assert.deepEqual(plan.meta.reference.materials,reference.meta.materials);
  assert.equal(plan.meta.audit.combinedObjects,base.parts.length+plan.parts.length+1);assert(plan.meta.audit.combinedObjects<9500);
  assert.equal(plan.meta.audit.physicalBaseParts,plan.meta.audit.combinedObjects);
  assert(plan.meta.groups.grey.length>100);assert(plan.meta.groups.concrete.length>10);
  assert.deepEqual(Object.values(plan.meta.groups).flat().sort((a,b)=>a-b),plan.parts.map((_,i)=>i));
  assert(plan.meta.palette.every(p=>p.material==='Concrete'&&!p.materialVariant));
  assert(plan.meta.catalogRoles.every(r=>r.name==='Others68'&&!r.kind));
  assert.equal(plan.meta.catalogRoles[0].appearance,'color');assert.deepEqual(plan.meta.catalogRoles[0].partIndices,plan.meta.groups.grey);
  assert.equal(plan.meta.catalogRoles[1].appearance,'template');assert.deepEqual(plan.meta.catalogRoles[1].partIndices,plan.meta.groups.concrete);
  // Earlier published road releases must stay byte-for-byte intact.
  assert.equal(sha(fs.readFileSync(new URL('../releases/66f1e928fd2d56c70976/runtime-plan.json',import.meta.url))),'fe743c5d9d77fbe67135022423f1d7ebb374ce619c96b148fce763dcd9393302');
});

test('cleaned reference runs have no tiny hooks or backtracking, and concrete terminals stay beside them',()=>{
  const runs=plan.meta.chains.filter(c=>c.role==='steel');
  const segments=runs.flatMap(c=>c.path.slice(1).map((b,i)=>[c.path[i],b]));
  for(const index of plan.meta.groups.grey)assert(plan.parts[index][5]>=25,'Short hook left in main barrier runs');
  for(const chain of runs)for(let i=1;i<chain.path.length-1;i++){
    const [a,b,c]=chain.path.slice(i-1,i+2),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-b[k]);
    assert(u[0]*v[0]+u[1]*v[1]>=0,'Barrier reverses along a fitted detour');
  }
  for(const index of plan.meta.groups.concrete){const p=plan.parts[index];assert(Math.min(...segments.map(([a,b])=>segmentDistance([p[0],p[2]],a,b)))<=25,'Stray concrete in the infield');}
  assert(plan.meta.reference.removedShortHooks>0&&plan.meta.reference.removedStrayConcrete>0);
});

test('reference chains retain openings, connect fitted sections, and leave all driving solids clear',()=>{
  assert(plan.meta.chains.length>10);assert(plan.meta.chains.some(c=>!c.closed));
  assert.deepEqual(plan.meta.chains.flatMap(c=>c.indices),plan.parts.map((_,i)=>i));
  for(const chain of plan.meta.chains){assert.equal(chain.path.length,chain.indices.length+1);for(let i=1;i<chain.indices.length;i++)assert(boxesOverlap(plan.parts[chain.indices[i-1]],plan.parts[chain.indices[i]],0),`Open join ${chain.indices[i]}`);}
  for(const p of plan.parts){const b=boxBasis(p);assert(p.length===13&&p.every(Number.isFinite));assert(p.slice(3,6).every(n=>n>=.001&&n<=2048));assert(Math.abs(Math.hypot(...b.up)-1)<1e-7);assert(!intersectsDomain(p,base.meta.startDomain));}
  const visual=new Set(base.meta.nonCollidingPartIndices),driving=base.parts.slice(0,base.meta.groups.terrain[0]).filter((_,i)=>!visual.has(i));
  assert.equal(volumeAudit({parts:driving},plan.parts).intersections.length,0);
});

test('the full pit straight has no barriers, while the entry and exit keep reference sections',()=>{
  const e=plan.meta.pitStraightExclusion,L=e.end-e.start,mid=(e.end+e.start)/2,a=e.direction,box=[e.origin[0]+a[0]*mid,0,e.origin[1]+a[1]*mid,2*e.halfWidth,1,L,1,a[1],0,-a[0],0,1,0];
  for(const p of plan.parts){assert.equal(overlapVertices(p,box).length,0,'Barrier extends into the pit straight');assert(!excluded([p[0],p[2]],e));}
  const l=base.meta.pitLayout,tree=new KDTree(base.meta.pitPoints.map((p,i)=>[p.pos[0],p.pos[2],i]));let entry=0,exit=0;
  for(const p of plan.parts){const nearest=tree.nearest([p[0],p[2]]);if(nearest.distance>120**2)continue;const i=nearest.point[2];if(i<l.straightStartIndex)entry++;if(i>l.exitStartIndex)exit++;}
  assert(entry>=3,`Only ${entry} pit entry sections remain`);assert(exit>=3,`Only ${exit} pit exit sections remain`);
  assert(plan.meta.reference.removedPitStraightLengthStuds>0);
});

test('barrier undersides remain grounded over their full width and length',()=>{
  const visual=new Set(base.meta.nonCollidingPartIndices),ground=collisionSampler(base.parts.filter((_,i)=>!visual.has(i)));let gap=-Infinity,visible=Infinity;
  for(const p of plan.parts){const b=boxBasis(p),steps=Math.ceil(p[5]/2);for(let j=0;j<=steps;j++)for(const side of [-.5,0,.5]){const along=(j/steps-.5)*p[5],x=p[0]+b.back[0]*along+b.right[0]*side*p[3]+b.up[0]*p[4]/2,z=p[2]+b.back[2]*along+b.right[2]*side*p[3]+b.up[2]*p[4]/2,h=ground(x,z),top=topHeight(p,x,z);assert(Number.isFinite(h));gap=Math.max(gap,top-p[4]/b.up[1]-h);visible=Math.min(visible,top-h);}}
  assert(gap<0,`Floating section: ${gap}`);assert(visible>=2.5,`Buried section: ${visible}`);
  assert.equal(gap,plan.meta.audit.maxGroundGap);assert.equal(visible,plan.meta.audit.minVisible);
});

test('current barrier release assets are pinned and match the prepared plan',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('release-manifest.json',import.meta.url))),runtime=JSON.parse(fs.readFileSync(new URL(`releases/${manifest.version}/runtime-plan.json`,import.meta.url)));
  assert.deepEqual(runtime.parts,plan.parts);assert.deepEqual(runtime.meta.requiredBase,plan.meta.requiredBase);
  for(const item of manifest.files){const bytes=fs.readFileSync(new URL(item.path,import.meta.url));assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256);}
  const builder=fs.readFileSync(new URL('red-bull-ring-builder.lua',import.meta.url),'utf8');assert(builder.includes('(style[3] or "")'));assert(builder.includes('entry.name == "Others68" and concreteBlock(template)'));
  const all=fs.readFileSync(new URL('../build-all.lua',import.meta.url),'utf8');
  assert.equal(all,fs.readFileSync(new URL(`releases/${manifest.version}/build-all.lua`,import.meta.url),'utf8'));
  assert(all.includes(`compact/releases/${plan.meta.requiredBase.version}/`)&&all.includes(`barriers/releases/${manifest.version}/`));
  assert(all.includes(`local TOTAL_OBJECTS = ${plan.meta.audit.combinedObjects}`)&&!all.includes('Others88'));
});
