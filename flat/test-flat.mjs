import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {flatPoints,kerbFactor,compileFlat} from './compile-flat.mjs';
import {boxBasis,boxCorners} from './geometry.mjs';
import {add,mul,sub,dot} from './track-geometry.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const plan=JSON.parse(fs.readFileSync(path.join(here,'sepang-plan.json'))),reference=JSON.parse(fs.readFileSync(path.join(here,'source/sepang-reference.json'))),points=flatPoints(reference);
const sha=body=>crypto.createHash('sha256').update(body).digest('hex');
const height=(box,q)=>{const u=boxBasis(box).up,top=add(box.slice(0,3),mul(u,box[4]/2));return top[1]-(u[0]*(q[0]-top[0])+u[2]*(q[2]-top[2]))/u[1];};

test('flat Sepang preserves horizontal layout, widened lanes and an 8–11k budget',()=>{
  assert.equal(plan.meta.format,'sepang-flat-v1');assert.equal(plan.meta.variant,'flat');
  assert.ok(plan.parts.length>=8000&&plan.parts.length<=11000);assert.equal(plan.parts.length,plan.meta.partCount);
  assert.equal(plan.meta.outputScale,2);assert.equal(plan.meta.settings.roadWidthMultiplier,1.25);assert.equal(plan.meta.settings.pitWidthMultiplier,1.4);
  assert.deepEqual(plan.meta.retainedHeightRange,[0,0]);assert.equal(plan.meta.groupCounts.grass,undefined);
  for(let i=0;i<plan.centerline.length;i++) {
    const p=plan.centerline[i],r=reference.centerline[i];
    assert.equal(p[0],r[0]);assert.equal(p[2],r[2]);assert.equal(p[3],r[3]);assert.equal(p[4],r[4]);assert.equal(p[1],0);assert.deepEqual(p.slice(6),[0,1,0]);
  }
  assert.deepEqual(plan.centerline[0].slice(0,5),plan.centerline.at(-1).slice(0,5));
  assert.equal(plan.meta.pitLane.widthStuds,reference.meta.pitLane.widthStuds);
});
test('asphalt, pit lane and runoff share the same horizontal top surface',()=>{
  for(const group of ['asphalt','pitLane','runoff'])for(const index of plan.meta.groups[group]) {
    const p=plan.parts[index];assert.deepEqual(p.slice(10),[0,1,0]);assert.equal(p[8],0);
    assert.ok(Math.abs(p[1]+p[4]/2)<1e-8,group+' is above or below the level road');
  }
  for(const p of plan.parts) {
    assert.equal(p.length,13);assert.ok(p.every(Number.isFinite));assert.ok(p.slice(3,6).every(n=>n>=.001&&n<=2048));
    const {right,up}=boxBasis(p);assert.ok(Math.abs(dot(right,up))<.0002);assert.ok(Math.abs(Math.hypot(...right)-1)<.0002);assert.ok(Math.abs(Math.hypot(...up)-1)<.0002);
    assert.ok(boxCorners(p).every(c=>c.every(Number.isFinite)));
  }
});
test('dense road samples have asphalt coverage through both lane edges and every turn',()=>{
  const road=plan.meta.groups.asphalt.map(i=>plan.parts[i]).map(p=>({p,basis:boxBasis(p)}));
  let checked=0;
  for(let i=0;i<points.length-1;i+=4)for(const fraction of [-.98,0,.98]) {
    const p=points[i],q=add(p.pos,mul(p.right,fraction*(fraction>0?p.wr:p.wl)));
    assert.ok(road.some(({p,basis})=>{const d=sub(q,p.slice(0,3));return Math.abs(dot(d,basis.right))<=p[3]/2+.06&&Math.abs(dot(d,basis.back))<=p[5]/2+.06;}),`No asphalt at sample ${i}, side ${fraction}`);
    checked++;
  }
  assert.ok(checked>5000);
});
test('road joins have zero height steps and bounded rectangular overlap',()=>{
  const road=plan.meta.groups.asphalt.map(i=>plan.parts[i]);let step=0,overlap=0;
  for(let i=0;i<road.length;i++) {
    const [a,b]=plan.meta.roadSegments[i],p=points[b];
    overlap=Math.max(overlap,road[i][5]-Math.hypot(...sub(points[b].pos,points[a].pos)));
    for(const f of [-1,0,1]){const q=add(p.pos,mul(p.right,f*(f>0?p.wr:p.wl)));step=Math.max(step,Math.abs(height(road[i],q)-height(road[(i+1)%road.length],q)));}
  }
  assert.ok(step<1e-8);assert.ok(overlap<1,`Road overlap ${overlap}`);
});
test('actual raised kerbs stay low, follow their ramp and taper into the road',()=>{
  const profile=plan.meta.settings.curbProfile,prior=new Map(),runs=new Map(plan.meta.kerbRuns.map(run=>[[run.side,run.start].join(':'),run]));
  let minimum=Infinity,maximum=-Infinity,maxError=0,maxStep=0,maxEndStep=0,maxAngle=0,sideMiss=0,alongMiss=0;
  for(const span of plan.meta.kerbSpans) {
    const p=plan.parts[span.index],basis=boxBasis(p),width=plan.meta.settings.curbWidth/(profile.length-1),low=profile[span.band],high=profile[span.band+1];
    maxAngle=Math.max(maxAngle,Math.acos(Math.min(1,basis.up[1]))*180/Math.PI);
    const sample=(i,f)=>{const point=points[i];return add(point.pos,mul(point.right,span.side*((span.side>0?point.wr:point.wl)+(span.band+f)*width)));};
    const run=runs.get([span.side,span.zoneStart].join(':'));
    for(let i=span.start;i<=span.end;i++)for(const f of [0,.5,1]) {
      const q=sample(i,f),factor=kerbFactor(run.arc[i-span.zoneStart],0,run.arc.at(-1),plan.meta.settings.curbTaperLength),actual=height(p,q),expected=(low+(high-low)*f)*factor,d=sub(q,p.slice(0,3));
      minimum=Math.min(minimum,actual);maximum=Math.max(maximum,actual);maxError=Math.max(maxError,Math.abs(actual-expected));
      sideMiss=Math.max(sideMiss,Math.abs(dot(d,basis.right))-p[3]/2);alongMiss=Math.max(alongMiss,Math.abs(dot(d,basis.back))-p[5]/2);
    }
    const key=[span.side,span.band,span.zoneStart].join(':'),previous=prior.get(key);
    if(previous)for(const f of [0,.5,1]){const q=sample(span.start,f);maxStep=Math.max(maxStep,Math.abs(height(p,q)-height(plan.parts[previous.index],q)));}
    prior.set(key,span);
    if(span.start===span.zoneStart||span.end===span.zoneEnd)for(const f of [0,.5,1])maxEndStep=Math.max(maxEndStep,Math.abs(height(p,sample(span.start===span.zoneStart?span.start:span.end,f))));
  }
  const measurements={minimum,maximum,maxError,maxStep,maxEndStep,maxAngle,sideMiss,alongMiss};
  assert.ok(maximum>.1,'Kerbs should be raised, not flush painted strips');
  assert.ok(minimum>-.015&&maximum<.15,JSON.stringify(measurements));
  assert.ok(maxError<.02&&maxStep<.025&&maxEndStep<.01,JSON.stringify(measurements));
  assert.ok(maxAngle<6&&sideMiss<.08&&alongMiss<.001,JSON.stringify(measurements));
  console.log('Kerb measurements: '+JSON.stringify(measurements));
});
test('paint has only the tiny visibility lift and the flat preview contains finite heights',()=>{
  for(const group of ['edgeMarkings','pitMarkings','startFinish'])for(const i of plan.meta.groups[group])assert.ok(Math.abs(plan.parts[i][1]+plan.parts[i][4]/2-.004)<1e-8);
  const svg=fs.readFileSync(path.join(here,'elevation-profile.svg'),'utf8');assert.ok(!svg.includes('NaN')&&!svg.includes('Infinity'));
  const viewer=fs.readFileSync(path.join(here,'sepang-3d-viewer.html'),'utf8');assert.ok(viewer.includes('Flat Sepang'));assert.ok(!viewer.includes('/* GENERATED_DATA */'));
});
test('flat release has independent paths, checkpoint name and identical runtime geometry',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(here,'release-manifest.json'))),loader=fs.readFileSync(path.join(here,'loader.lua'),'utf8');
  assert.ok(loader.includes(`/main/flat/releases/${manifest.version}/`));assert.ok(loader.includes('sepang-flat-checkpoint.json'));assert.ok(loader.includes('_G.SepangFlatBuilder'));
  assert.equal(manifest.partCount,plan.parts.length);
  const runtime=JSON.parse(fs.readFileSync(path.join(here,'releases',manifest.version,'runtime-plan.json')));assert.deepEqual(runtime.parts,plan.parts);assert.equal(runtime.meta.format,'sepang-flat-v1');
  for(const file of manifest.files){const body=fs.readFileSync(path.join(here,file.path));assert.equal(body.length,file.bytes);assert.equal(sha(body),file.sha256);}
  assert.equal(fs.readFileSync(path.join(here,'releases',manifest.version,'loader.lua'),'utf8'),loader);
});
test('invalid kerb heights and part budgets fail before producing a plan',()=>{
  assert.throws(()=>compileFlat(reference,{curbProfile:[0,1]}));assert.throws(()=>compileFlat(reference,{maxParts:15000}));assert.throws(()=>compileFlat(reference,{curbTaperLength:0}));
});
test('all captured original Sepang files remain unchanged',t=>{
  const snapshot=path.join(here,'source/protected-files.json');
  if(!fs.existsSync(snapshot)){t.skip('Local preservation inventory is omitted from the published project');return;}
  for(const [relative,expected] of Object.entries(JSON.parse(fs.readFileSync(snapshot))))assert.equal(sha(fs.readFileSync(path.join(here,'..',relative))),expected,relative+' was modified');
});
