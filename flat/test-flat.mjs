import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {flatPoints,kerbFactor,compileFlat} from './compile-flat.mjs';
import {boxBasis,boxCorners} from './geometry.mjs';
import {add,mul,sub,dot,unit,KDTree} from './track-geometry.mjs';
import {kerbColor} from './extract-kerbs.mjs';
import {tidyRunoffProfiles,runoffHeight} from './tidy-runoff.mjs';
import {bannerPixels} from './banner.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const plan=JSON.parse(fs.readFileSync(path.join(here,'sepang-plan.json'))),reference=JSON.parse(fs.readFileSync(path.join(here,'source/sepang-reference.json'))),points=flatPoints(reference);
const sha=body=>crypto.createHash('sha256').update(body).digest('hex');
const trace=JSON.parse(fs.readFileSync(path.join(here,'source/sepang-kerbs.json')));
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
test('road surfaces stay level and runoff overlaps stay just below them',()=>{
  const runoffHeights=new Map(plan.meta.runoffSpans.map(s=>[s.index,s.height]));
  for(const group of ['asphalt','pitLane','runoff'])for(const index of plan.meta.groups[group]) {
    const p=plan.parts[index];assert.deepEqual(p.slice(10),[0,1,0]);assert.equal(p[8],0);
    const expected=runoffHeights.get(index)??0;
    assert.ok(Math.abs(p[1]+p[4]/2-expected)<1e-8,group+' has an unexpected surface height');
  }
  for(const p of plan.parts) {
    assert.equal(p.length,13);assert.ok(p.every(Number.isFinite));assert.ok(p.slice(3,6).every(n=>n>=.001&&n<=2048));
    const {right,up}=boxBasis(p);assert.ok(Math.abs(dot(right,up))<.0002);assert.ok(Math.abs(Math.hypot(...right)-1)<.0002);assert.ok(Math.abs(Math.hypot(...up)-1)<.0002);
    assert.ok(boxCorners(p).every(c=>c.every(Number.isFinite)));
  }
});
test('the standing anchor is exactly the pit-straight start and the grey apron is removed',()=>{
  const anchor=plan.meta.placementAnchor,q=anchor.position;
  assert.equal(anchor.name,'pit-straight-start');assert.equal(q[1],0);
  assert.deepEqual(q,[-690.8542,0,29.9084],'The straight must begin at the confirmed blue point');
  assert.deepEqual(q,plan.meta.pitEntry.join);
  assert.ok(Math.hypot(q[0]-anchor.pitEntry[0],q[2]-anchor.pitEntry[2])<500);
  assert.ok(anchor.partIndices.some(i=>{
    const p=plan.parts[i],basis=boxBasis(p),d=sub(q,p.slice(0,3));
    return p[6]===1&&Math.abs(dot(d,basis.right))<=p[3]/2+.05&&Math.abs(dot(d,basis.back))<=p[5]/2+.05;
  }),'The anchor is outside the pit road');
  assert.ok(plan.meta.groups.runoff.every(i=>plan.parts[i][6]!==3),'The old grey apron must be absent');
  const first=plan.parts[plan.meta.groups.pitLane[plan.meta.pitEntry.entryParts]],basis=boxBasis(first);
  assert.ok(Math.hypot(...sub(sub(first.slice(0,3),mul(basis.back,first[5]/2)),[q[0],first[1],q[2]]))<.025,'The retained straight must start at the anchor');
  assert.ok(fs.existsSync(path.join(here,'build-start-point.png')));
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
test('kerb placement and stripe colours come from compatible model evidence',()=>{
  assert.equal(trace.sourceSha256,reference.meta.sourceSha256);
  assert.equal(trace.centerlineSha256,sha(JSON.stringify(reference.centerline)));
  assert.equal(plan.meta.surfaceTrace.sha256,sha(JSON.stringify(trace)));
  assert.deepEqual(trace.materialNames,['Sepang101Mtl']);
  assert.ok(trace.statistics.evidenceSamples>10000&&trace.statistics.ambiguous/trace.statistics.accepted<.02);
  const zones=new Map(trace.zones.map(z=>[z.id,z]));
  let straightSamples=0;
  for(const span of plan.meta.kerbSpans) {
    const zone=zones.get(span.referenceZone);assert.ok(zone);
    assert.equal(span.side,zone.side);assert.ok(span.start>=zone.start&&span.end<=zone.end);
    for(let i=span.start;i<span.end;i++) {
      assert.equal(plan.parts[span.index][6],zone.samples[i-zone.start][3]);
      if(Math.abs(points[i].curvature)<.00175)straightSamples++;
    }
  }
  assert.ok(straightSamples>1000,'Source kerbs must include actual straight-side extensions');
  assert.equal(kerbColor([.65,.15,.12,1]),9);assert.equal(kerbColor([.75,.75,.73,.4]),4);
  assert.equal(kerbColor([.2,.3,.7,1]),null);assert.equal(kerbColor([.6,.6,.1,1]),null);
  assert.throws(()=>compileFlat(reference,{kerbTrace:{...trace,sourceSha256:'wrong-model'}}),/incompatible/);
});
test('model runoff retains broad gravel and coloured bands below the racing road',()=>{
  assert.deepEqual(trace.runoff.materialNames,['Sepang1641Mtl','Sepang1631Mtl']);
  const colors=new Set(plan.meta.runoffSpans.map(p=>p.color));
  for(const color of [4,8,9,10,11])assert.ok(colors.has(color));
  assert.ok(plan.meta.runoffSpans.some(p=>p.width>96),'Broad source runoff must not retain the former 64-stud width cap');
  for(const span of plan.meta.runoffSpans) {
    const p=plan.parts[span.index],basis=boxBasis(p);assert.equal(p[6],span.color);
    assert.ok(span.offset>=-.2001);
    assert.equal(span.height,runoffHeight(span.color));
    assert.ok(basis.up[1]===1&&p[1]+p[4]/2<-.0039&&p[1]+p[4]/2>=-.0081,'Runoff overlap must not cover or flicker with asphalt');
  }
});
test('tidied runoff has coverage from the road through every retained colour band',()=>{
  const boxes=plan.meta.runoffSpans.map(span=>({span,p:plan.parts[span.index],basis:boxBasis(plan.parts[span.index])}));
  let checked=0;
  for(const section of plan.meta.runoffSections) {
    assert.equal(section.boundaries[0],-.2);
    for(let i=1;i<section.boundaries.length;i++)assert.ok(section.boundaries[i]>section.boundaries[i-1]);
    const candidates=boxes.filter(({span})=>span.side===section.side&&span.end>=section.start-12&&span.start<=section.end+12);
    for(let i=section.start;i<=section.end;i+=2) {
      const point=points[i],edge=section.side>0?point.wr:point.wl;
      for(let distance=.4;distance<section.boundaries.at(-1);distance+=4) {
        const q=add(point.pos,mul(point.right,section.side*(edge+distance)));
        assert.ok(candidates.some(({p,basis})=>{const d=sub(q,p.slice(0,3));return Math.abs(dot(d,basis.right))<=p[3]/2+.05&&Math.abs(dot(d,basis.back))<=p[5]/2+.05;}),`Gap at sample ${i}, side ${section.side}, offset ${distance}`);
        checked++;
      }
    }
  }
  assert.ok(checked>150000);
  assert.ok(plan.meta.groupCounts.runoff<900&&plan.meta.groupCounts.edgeMarkings<1800);
  assert.ok(plan.meta.runoffSpans.some(s=>plan.parts[s.index][5]>96),'Compatible straight sections should use large blocks');
  console.log('Runoff coverage samples: '+checked);
});
test('cleanup bridges small cracks while removing detached details and preserving source data',()=>{
  const fixturePoints=Array.from({length:200},(_,i)=>({s:i})),input=[];
  for(const start of [0,4,8,16,20,24,28,32,36]) {
    input.push({side:1,start,end:start+4,offset:8,width:12,color:9});
    input.push({side:1,start,end:start+4,offset:22,width:16,color:4});
    input.push({side:1,start,end:start+4,offset:180,width:10,color:10});
  }
  input.push({side:-1,start:100,end:104,offset:20,width:4,color:8});
  const original=structuredClone(input),result=tidyRunoffProfiles(fixturePoints,input);
  assert.deepEqual(input,original);
  assert.ok(result.sections.some(s=>s.start===12),'Small missing sections should be bridged');
  assert.ok(result.sections.every(s=>s.side===1&&s.colors.join(':')==='9:4'&&s.boundaries[0]===-.2&&s.boundaries.at(-1)===38));
  assert.ok(result.report.discardedDetachedBands>0&&result.report.removedProfiles>0);
});
test('larger white edge markings still cover their complete intended path',()=>{
  let checked=0;
  plan.meta.edgeMarkingSegments.forEach(([side,a,b],j)=>{
    const p=plan.parts[plan.meta.groups.edgeMarkings[j]],basis=boxBasis(p);
    for(let i=a;i<=b;i++) {
      const point=points[i],q=add(point.pos,mul(point.right,side*((side>0?point.wr:point.wl)-.5))),d=sub(q,p.slice(0,3));
      assert.ok(Math.abs(dot(d,basis.right))<=p[3]/2+.001&&Math.abs(dot(d,basis.back))<=p[5]/2+.001,`White line gap at sample ${i}`);checked++;
    }
  });
  assert.ok(checked>35000);
});
test('the default slight clearance agrees between the plan and executor',()=>{
  assert.equal(plan.meta.settings.groundClearance,.25);
  assert.match(fs.readFileSync(path.join(here,'builder-template.luau'),'utf8'),/GroundClearance = 0\.25/);
  assert.match(plan.meta.groundReference,/0\.25 studs/);
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
  const runtime=JSON.parse(fs.readFileSync(path.join(here,'releases',manifest.version,'runtime-plan.json')));assert.deepEqual(runtime.parts,plan.parts);assert.equal(runtime.meta.format,'sepang-flat-v1');assert.deepEqual(runtime.meta.placementAnchor,plan.meta.placementAnchor);
  for(const file of manifest.files){const body=fs.readFileSync(path.join(here,file.path));assert.equal(body.length,file.bytes);assert.equal(sha(body),file.sha256);}
  assert.equal(fs.readFileSync(path.join(here,'releases',manifest.version,'loader.lua'),'utf8'),loader);
});
test('invalid kerb heights and part budgets fail before producing a plan',()=>{
  assert.throws(()=>compileFlat(reference,{curbProfile:[0,1]}));assert.throws(()=>compileFlat(reference,{maxParts:15000}));assert.throws(()=>compileFlat(reference,{curbTaperLength:0}));
});
test('model pit entry has full lane coverage, a clear driving surface and a retained straight/exit',()=>{
  const entry=plan.meta.pitEntry,source=JSON.parse(fs.readFileSync(path.join(here,entry.sourceFile))),lane=plan.meta.groups.pitLane.map(i=>plan.parts[i]);
  assert.equal(source.sourceSha256,reference.meta.sourceSha256);assert.equal(source.centerlineSha256,sha(JSON.stringify(reference.centerline)));
  assert.equal(entry.widthStuds,reference.meta.pitLane.widthStuds);
  assert.ok(entry.entryLengthStuds>500&&entry.entryLengthStuds<750&&entry.removedOldLaneParts<reference.auxiliary.pitLane.length/2);
  assert.deepEqual(entry.start,[-1104.1646,0,-105.0607]);
  const retained=reference.auxiliary.pitLane.slice(entry.retainedStartOriginalIndex);
  assert.equal(entry.retainedPitLaneParts,retained.length);
  assert.deepEqual(lane.slice(entry.entryParts+1).map(p=>[p[0],p[2],p[5]]),retained.slice(1).map(p=>[p[0],p[2],p[5]]),'Straight/exit after the trimmed first piece must be retained');
  assert.ok(Math.abs(lane[entry.entryParts][5]-retained[0][5]/2)<.0001);
  const boxes=lane.map(p=>({p,b:boxBasis(p)})),obstacles=['curbs','pitWall'].flatMap(g=>plan.meta.groups[g].map(i=>({p:plan.parts[i],b:boxBasis(plan.parts[i])})));
  const contains=({p,b},q)=>{const d=sub(q,p.slice(0,3));return Math.abs(dot(d,b.right))<=p[3]/2+.05&&Math.abs(dot(d,b.back))<=p[5]/2+.05;};
  let checked=0,modelSamples=0;
  for(let i=1;i<entry.route.length-1;i++) {
    const q=entry.route[i],a=entry.route[i-1],b=entry.route[i+1],t=unit(sub(b,a)),r=[t[2],0,-t[0]];
    if(source.samples.some(p=>Math.hypot(q[0]-p[0],q[2]-p[1])<2))modelSamples++;
    for(const f of [-.98,0,.98]) {const sample=add(q,mul(r,f*entry.widthStuds/2));assert.ok(boxes.some(box=>contains(box,sample)),`Pit entry gap ${i}/${f}`);assert.ok(!obstacles.some(box=>contains(box,sample)),`Raised obstacle across pit entry ${i}/${f}`);checked++;}
  }
  assert.ok(checked>700&&modelSamples>100);
  assert.ok(dot(unit(sub(entry.route[1],entry.route[0])),entry.startTangent)>.9999,'Entrance must continue along the corner tangent');
  assert.ok(dot(unit(sub(entry.route.at(-1),entry.route.at(-2))),entry.joinTangent)>.9999,'Pit straight must receive a smooth approach');
  for(const f of [-.98,0,.98]) {
    const next=lane[entry.entryParts],r=boxBasis(next).right,q=add(entry.join,mul(r,f*entry.widthStuds/2));
    assert.ok(contains(boxes[entry.entryParts-1],q)&&contains(boxes[entry.entryParts],q),'Pit connection must overlap both sides of the retained lane');
  }
});
test('Others75 is assigned only to road surfaces with the requested grey colour',()=>{
  assert.deepEqual(plan.meta.palette[0].rgb,[65,66,66]);
  assert.deepEqual(plan.meta.catalogRoles,[{name:'Others75',appearance:'color',partIndices:[...plan.meta.groups.asphalt,...plan.meta.groups.pitLane]}]);
  const manifest=JSON.parse(fs.readFileSync(path.join(here,'release-manifest.json'))),runtime=JSON.parse(fs.readFileSync(path.join(here,'releases',manifest.version,'runtime-plan.json')));
  assert.deepEqual(runtime.meta.catalogRoles,plan.meta.catalogRoles);
});
test('one Bluenight banner lies on the inside-corner grass and clears the racing surfaces',()=>{
  const banner=plan.meta.banner,art=bannerPixels(fs.readFileSync(path.join(here,'Bluenight.png'))),indices=plan.meta.groups.banner;
  assert.equal(banner.imageSha256,art.sourceSha256);assert.equal(indices.length,art.rectangles.length+1);
  assert.ok(indices.length<800);assert.equal(banner.width/banner.height,16/9);
  assert.equal(banner.orientation,'ground');assert.deepEqual(banner.front,[0,1,0]);
  const away=unit([banner.position[0]-banner.facingTarget[0],0,banner.position[2]-banner.facingTarget[1]]);assert.ok(dot(away,banner.imageTop)>.9999);
  assert.equal(banner.grandstandMaterial,'Sepang1621Mtl');assert.ok(banner.grandstandVertexCount>1000);
  const backing=plan.parts[indices[0]],backingBasis=boxBasis(backing);
  assert.equal(banner.placementZone,'inside-corner');assert.ok(banner.position[2]>banner.corner[1]+100);
  const inside=q=>{
    let hit=false;
    for(let i=0,j=plan.centerline.length-1;i<plan.centerline.length;j=i++) {
      const a=plan.centerline[i],b=plan.centerline[j];
      if((a[2]>q[2])!==(b[2]>q[2])&&q[0]<(b[0]-a[0])*(q[2]-a[2])/(b[2]-a[2])+a[0])hit=!hit;
    }
    return hit;
  };
  const backingCorners=boxCorners(backing),bounds={min:[0,2].map(k=>Math.min(...backingCorners.map(q=>q[k]))-28),max:[0,2].map(k=>Math.max(...backingCorners.map(q=>q[k]))+28)};
  const occupied=['asphalt','pitLane','runoff','curbs'].flatMap(g=>plan.meta.groups[g].map(i=>plan.parts[i])).map(p=>({p,corners:boxCorners(p)})).filter(({corners})=>[0,2].every((k,i)=>Math.max(...corners.map(q=>q[k]))>=bounds.min[i]&&Math.min(...corners.map(q=>q[k]))<=bounds.max[i])).map(({p,corners})=>{
    const r=unit([p[7],0,p[9]]),b=[-r[2],0,r[0]],center=[p[0],0,p[2]];
    return {center,r,b,rx:Math.max(...corners.map(q=>Math.abs(dot(sub(q,center),r)))),rz:Math.max(...corners.map(q=>Math.abs(dot(sub(q,center),b))))};
  });
  for(let x=-backing[3]/2;x<=backing[3]/2;x+=8)for(let z=-backing[5]/2;z<=backing[5]/2;z+=8) {
    const q=add(add(backing.slice(0,3),mul(backingBasis.right,x)),mul(backingBasis.back,z));
    assert.ok(inside(q),'The full banner must lie inside the circuit');
    for(const o of occupied){const d=sub(q,o.center),distance=Math.hypot(Math.max(0,Math.abs(dot(d,o.r))-o.rx),Math.max(0,Math.abs(dot(d,o.b))-o.rz));assert.ok(distance>=23.9,'Banner footprint must clear the road, kerbs and runoff by 24 studs');}
  }
  const grass=-plan.meta.settings.groundClearance;
  assert.ok(Math.abs(backing[1]+backing[4]/2-grass-.015)<1e-8);
  for(const index of indices.slice(1)) {
    const p=plan.parts[index],basis=boxBasis(p),d=sub(p.slice(0,3),backing.slice(0,3));
    assert.deepEqual(basis.up,[0,1,0]);assert.ok(Math.abs(p[1]+p[4]/2-grass-.04)<1e-8);
    assert.ok(Math.abs(dot(d,backingBasis.right))+p[3]/2<=backing[3]/2+.01);
    assert.ok(Math.abs(dot(d,backingBasis.back))+p[5]/2<=backing[5]/2+.01);
  }
  assert.ok(art.rectangles.some(r=>r.x<art.width*.4)&&art.rectangles.some(r=>r.x>art.width*.7),'Image text and right-hand logo must both survive sampling');
  for(const name of ['build-pit-entry.png','build-banner-front.png','build-banner-location.png'])assert.ok(fs.existsSync(path.join(here,name)));
});
test('all captured original Sepang files remain unchanged',t=>{
  const snapshot=path.join(here,'source/protected-files.json');
  if(!fs.existsSync(snapshot)){t.skip('Local preservation inventory is omitted from the published project');return;}
  for(const [relative,expected] of Object.entries(JSON.parse(fs.readFileSync(snapshot))))assert.equal(sha(fs.readFileSync(path.join(here,'..',relative))),expected,relative+' was modified');
});
