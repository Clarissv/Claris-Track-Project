import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseTrackCsv, fitSimilarity, transform2, KDTree, unit, sub, dot, cross } from './track-geometry.mjs';
import { compilePlan, scalePlan, makeSlab, boxBasis, boxCorners, adaptiveSegments, catmull } from './compile-ribbons.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const plan=JSON.parse(fs.readFileSync(path.join(here,'sepang-plan.json'),'utf8'));
test('TUM parser reads the centerline and separate widths and rejects invalid input',()=> {
  const rows=parseTrackCsv('# x,y,right,left\n0,0,3,4\n10,0,4,5\n10,10,5,6\n0,10,6,7\n0,0,3,4');
  assert.equal(rows.length,4);assert.deepEqual(rows[0],[0,0,3,4]);
  assert.throws(()=>parseTrackCsv('0,0,-1,3\n1,0,3,3\n1,1,3,3\n0,1,3,3'));
  assert.throws(()=>parseTrackCsv('0,0\n1,0\n1,1\n0,1'));
});
test('similarity fit handles a reflected, rotated and scaled centerline',()=> {
  const points=[[0,0],[10,0],[8,9],[-4,7]],fit={reflection:-1,angle:0.63,scale:2.4,tx:17,ty:-5},mapped=points.map(p=>transform2(p,fit)),result=fitSimilarity(points,mapped,-1);
  points.forEach((p,i)=>assert.ok(Math.hypot(...sub(transform2(p,result),mapped[i]))<1e-8));
});
test('nearest mesh samples use both horizontal dimensions',()=> {
  const tree=new KDTree([[0,0,7],[2,2,8],[-3,1,9],[2,-3,10]]);
  assert.equal(tree.nearest([1.9,2.1]).point[2],8);assert.equal(tree.nearest([2,-2.9]).point[2],10);
});
test('ribbon basis retains yaw, pitch and banking and offsets the top correctly',()=> {
  const a={pos:[0,0,0],normal:unit([-.05,1,-.1])},b={pos:[10,2,10],normal:a.normal},p=makeSlab(a,b,8,0,.5,1),basis=boxBasis(p);
  assert.ok(Math.abs(basis.right[2])>.5&&Math.abs(basis.back[1])>.1);
  assert.ok(Math.abs(dot(basis.right,basis.up))<0.0002);
  const top=p.slice(0,3).map((v,i)=>v+basis.up[i]*p[4]/2);
  assert.ok(Math.hypot(...sub(top,[5,1,5]))<0.0002);
});
test('offset strips follow their own curved endpoints so outer joins are not too short',()=> {
  const a={pos:[0,0,0],normal:[0,1,0],right:[0,0,-1]},b={pos:[10,0,2],normal:[0,1,0],right:unit([.4,0,-1])};
  const center=makeSlab(a,b,2,0,.5,1),outer=makeSlab(a,b,2,15,.5,1);
  assert.ok(outer[5]>center[5]+4,'Outside strip length ignored its bend offset');
});
test('a folded inside offset stays on the road plane instead of forming a vertical fin',()=> {
  const a={pos:[0,0,0],normal:[0,1,0],right:[0,0,-1]},b={pos:[1,0,0],normal:[0,1,0],right:unit([-.1,.1,-1])};
  const strip=makeSlab(a,b,.18,10,.025,4);
  assert.ok(boxBasis(strip).up[1]>.99);
});
test('adaptive ribbons use fewer straight segments while retaining a bend',()=> {
  const line=Array.from({length:31},(_,i)=>({pos:[i,0,0],normal:[0,1,0],wr:4,wl:4}));
  assert.equal(adaptiveSegments(line,20).length,2);
  const bend=line.map((p,i)=>({...p,pos:[20*Math.sin(i/30),0,20*(1-Math.cos(i/30))]}));
  assert.ok(adaptiveSegments(bend,20).length>2);
  assert.deepEqual(catmull([0,0],[1,0],[2,0],[3,0],0),[1,0]);
});
test('current output preserves source identity, count limits, closure and usable dimensions',()=> {
  assert.equal(plan.meta.format,'sepang-ribbons-v1');assert.equal(plan.parts.length,plan.meta.partCount);assert.ok(plan.parts.length>=8000&&plan.parts.length<=11000);
  assert.equal(plan.meta.settings.maxParts,11000);
  const csv=fs.readFileSync(path.join(here,'source/Sepang.csv'));
  assert.equal(crypto.createHash('sha256').update(csv).digest('hex'),plan.meta.centerlineSha256);
  assert.ok(Math.abs(plan.meta.lapLengthMetres-5543)<10);
  assert.ok(Math.hypot(...sub(plan.centerline[0].slice(0,3),plan.centerline.at(-1).slice(0,3)))<1e-8);
  assert.ok(plan.meta.groupCounts.asphalt<4000);assert.equal(plan.meta.groupCounts.grass,undefined);
  let low=Infinity;
  for(const p of plan.parts) {
    assert.equal(p.length,13);assert.ok(p.every(Number.isFinite));assert.ok(p.slice(3,6).every(v=>v>=.001&&v<=2048));
    const {right,up,back}=boxBasis(p);
    assert.ok(Math.abs(Math.hypot(...right)-1)<.0002&&Math.abs(Math.hypot(...up)-1)<.0002);
    assert.ok(Math.abs(dot(right,up))<.0002&&up[1]>0&&Math.abs(Math.hypot(...back)-1)<.0003);
    for(const v of boxCorners(p))low=Math.min(low,v[1]);
  }
  assert.ok(Math.abs(low)<.002,'Lowest underside does not meet the ground reference');
  const heights=plan.centerline.map(p=>p[1]);assert.ok(Math.max(...heights)-Math.min(...heights)>20,'Grades were flattened');
});
test('merged edge markings stay continuous, visible and close to the unchanged asphalt',()=> {
  const marks=plan.meta.groups.edgeMarkings.map(i=>plan.parts[i]),roadByPoint=[];
  assert.ok(marks.length<plan.meta.groupCounts.asphalt,'Paint should no longer require two parts per road segment');
  assert.equal(plan.meta.edgeMarkingSegments.length,marks.length);
  plan.meta.roadSegments.forEach(([a,b],i)=>{for(let k=a;k<=b;k++)roadByPoint[k]=plan.parts[plan.meta.groups.asphalt[i]];});
  const surfaceHeight=(box,q)=>{
    const u=boxBasis(box).up,top=box.slice(0,3).map((v,k)=>v+u[k]*box[4]/2);
    return top[1]-(u[0]*(q[0]-top[0])+u[2]*(q[2]-top[2]))/u[1];
  };
  const count=plan.centerline.length-1,scale=plan.meta.outputScale,lastBySide={[-1]:0,1:0};
  let minimum=Infinity,maximum=-Infinity;
  for(let m=0;m<marks.length;m++) {
    const [side,a,b]=plan.meta.edgeMarkingSegments[m],box=marks[m],basis=boxBasis(box);
    assert.equal(a,lastBySide[side],'Edge line has a skipped interval');lastBySide[side]=b;
    for(let i=a;i<=b;i++) {
      const p=plan.centerline[i],prev=plan.centerline[(i-1+count)%count],next=plan.centerline[(i+1)%count],along=unit(sub(next.slice(0,3),prev.slice(0,3))),flat=unit([along[2],0,-along[0]]),normal=p.slice(6,9);
      const bank=-(normal[0]*flat[0]+normal[2]*flat[2])/normal[1],right=unit([flat[0],bank,flat[2]]);
      const offset=side*((side>0?p[3]:p[4])-.25*scale)/Math.hypot(right[0],right[2]);
      const q=p.slice(0,3).map((v,k)=>v+right[k]*offset),d=sub(q,box.slice(0,3));
      assert.ok(Math.abs(dot(d,basis.right))<box[3]/2,'Edge line wandered away from its route');
      assert.ok(Math.abs(dot(d,basis.back))<=box[5]/2+.001,`Edge line ${m}, sample ${i}: length excess ${Math.abs(dot(d,basis.back))-box[5]/2}`);
      const height=surfaceHeight(box,q)-surfaceHeight(roadByPoint[i],q);
      minimum=Math.min(minimum,height);maximum=Math.max(maximum,height);
    }
  }
  assert.equal(lastBySide[-1],count);assert.equal(lastBySide[1],count);
  assert.ok(minimum>.002,`Edge paint disappears into asphalt: ${minimum}`);
  assert.ok(maximum<.075,`Edge paint rises too far above asphalt: ${maximum}`);
});
test('road slabs cover dense samples throughout the lane, including tight bends',()=> {
  const asphalt=plan.meta.groups.asphalt.map(i=>plan.parts[i]);
  const scale=plan.meta.outputScale??1;
  let missing=0,total=0;const missed=[];
  // The intended centerline and near-edge samples must lie within an asphalt slab
  // allowing only the documented sub-stud seam/plane approximation tolerance.
  for(let i=0;i<plan.centerline.length-1;i+=6) {
    const p=plan.centerline[i],a=plan.centerline[(i-1+plan.centerline.length-1)%(plan.centerline.length-1)],b=plan.centerline[i+1],tangent=unit(sub(b.slice(0,3),a.slice(0,3))),flat=unit([tangent[2],0,-tangent[0]]),normal=p.slice(6,9);
    const bank=-(normal[0]*flat[0]+normal[2]*flat[2])/normal[1],right=unit([flat[0],bank,flat[2]]),horizontal=Math.hypot(right[0],right[2]);
    for(const f of [-.98,0,.98]) {
      const offset=f*(f>0?p[3]:p[4])/horizontal,sample=p.slice(0,3).map((v,k)=>v+right[k]*offset);total++;
      const covered=asphalt.some(box=> {
        const basis=boxBasis(box),d=sub(sample,box.slice(0,3));
        return Math.abs(dot(d,basis.right))<=box[3]/2+.03*scale&&Math.abs(dot(d,basis.back))<=box[5]/2+.03*scale&&Math.abs(dot(d,basis.up)-box[4]/2)<=.05;
      });
      if(!covered){missing++;const nearby=asphalt.map(box=>{const basis=boxBasis(box),d=sub(sample,box.slice(0,3));return {side:Math.abs(dot(d,basis.right))-box[3]/2,along:Math.abs(dot(d,basis.back))-box[5]/2,height:Math.abs(dot(d,basis.up))-box[4]/2};}).filter(p=>p.side<.16&&p.along<.16).sort((a,b)=>a.height-b.height);missed.push({i,f,nearby:nearby.slice(0,1)});}
    }
  }
  assert.equal(missing,0,`${missing}/${total} lane samples have no road slab: ${JSON.stringify(missed)}`);
});
test('road joins limit exposed surface steps and protruding overlap at both lane edges',()=> {
  const road=plan.meta.groups.asphalt.map(i=>plan.parts[i]);
  assert.equal(plan.meta.roadSegments.length,road.length);
  const surfaceHeight=(p,q)=> {
    const u=boxBasis(p).up,top=p.slice(0,3).map((v,k)=>v+u[k]*p[4]/2);
    return top[1]-(u[0]*(q[0]-top[0])+u[2]*(q[2]-top[2]))/u[1];
  };
  let worstStep=0,worstOverlap=0;
  for(let i=0;i<road.length;i++) {
    const [start,j]=plan.meta.roadSegments[i],p=plan.centerline[j],prev=plan.centerline[j-1],next=plan.centerline[(j+1)%(plan.centerline.length-1)],tangent=unit(sub(next.slice(0,3),prev.slice(0,3))),flat=unit([tangent[2],0,-tangent[0]]);
    worstOverlap=Math.max(worstOverlap,road[i][5]-Math.hypot(...sub(p.slice(0,3),plan.centerline[start].slice(0,3))));
    for(const f of [-1,0,1]) {
      const offset=f*(f>0?p[3]:p[4]),q=p.slice(0,3).map((v,k)=>v+flat[k]*offset);
      worstStep=Math.max(worstStep,Math.abs(surfaceHeight(road[i],q)-surfaceHeight(road[(i+1)%road.length],q)));
    }
  }
  assert.ok(worstStep<.075,`Road seam step ${worstStep.toFixed(4)} studs`);
  assert.ok(worstOverlap<1,`Road overlap ${worstOverlap.toFixed(4)} studs`);
});
test('2x layout has separately widened roads and pit lane while preserving slopes and size limits',()=> {
  assert.equal(plan.meta.outputScale,2);
  assert.equal(plan.meta.settings.roadWidthMultiplier,1.25);
  assert.equal(plan.meta.settings.pitWidthMultiplier,1.4);
  assert.ok(plan.meta.width>1609.3598*2&&plan.meta.width<1609.3598*2+100);
  assert.ok(plan.meta.depth>1329.0518*2&&plan.meta.depth<1329.0518*2+100);
  const csv=parseTrackCsv(fs.readFileSync(path.join(here,'source/Sepang.csv'),'utf8'));
  for(let i=0;i<csv.length;i++) {
    const source=csv[i],p=plan.centerline[i*plan.meta.settings.samplesPerCsv],fit=plan.meta.alignment;
    const [x,z]=transform2(source,fit);
    assert.ok(Math.abs(p[0]-x*2)<1e-8&&Math.abs(p[2]-z*2)<1e-8,'Centerline must use the 2x layout');
    assert.ok(Math.abs(p[3]+p[4]-(source[2]+source[3])*fit.scale*2*1.25)<1e-8,'Lane width did not get the independent widening');
  }
  assert.ok(Math.abs(plan.meta.pitLane.widthStuds-8.065346338688855*2*1.4)<1e-8);
  assert.ok(plan.meta.retainedHeightRange[1]-plan.meta.retainedHeightRange[0]>55&&plan.meta.retainedHeightRange[1]-plan.meta.retainedHeightRange[0]<65);
  const smaller=scalePlan(plan,1/2),restored=scalePlan(smaller,2);
  assert.equal(smaller.meta.outputScale,1);
  assert.equal(smaller.meta.lapLengthMetres,plan.meta.lapLengthMetres);
  assert.equal(smaller.meta.sourceSha256,plan.meta.sourceSha256);
  assert.deepEqual(smaller.meta.alignment,plan.meta.alignment);
  for(let i=0;i<plan.parts.length;i++) {
    assert.deepEqual(restored.parts[i].slice(6),plan.parts[i].slice(6),'Colors or orientations changed');
    for(let k=0;k<6;k++)assert.ok(Math.abs(restored.parts[i][k]-plan.parts[i][k])<1e-8);
  }
  for(let i=0;i<plan.centerline.length;i++) {
    for(let k=0;k<6;k++)assert.ok(Math.abs(restored.centerline[i][k]-plan.centerline[i][k])<1e-8);
    assert.deepEqual(restored.centerline[i].slice(6),plan.centerline[i].slice(6));
  }
  assert.throws(()=>scalePlan(plan,Infinity));
  assert.throws(()=>scalePlan(plan,0));
  assert.throws(()=>scalePlan(plan,5000),/size limits/);
});
test('generated viewer/runtime share the complete basis and portable workspace paths',()=> {
  const runtime=fs.readFileSync(path.join(here,'sepang-builder.lua'),'utf8'),viewer=fs.readFileSync(path.join(here,'sepang-3d-viewer.html'),'utf8'),launcher=fs.readFileSync(path.join(here,'sepang-run.lua'),'utf8');
  assert.ok(runtime.includes('Vector3.new(p[8],p[9],p[10])')&&runtime.includes('workspace:Raycast'));
  assert.ok(viewer.includes('in vec3 rightAxis')&&viewer.includes('in vec3 upAxis'));
  assert.ok(launcher.includes('SepangRibbon/'));assert.ok(Buffer.byteLength(runtime)<40000);
  assert.ok(!runtime.includes('-- GENERATED_DATA')&&!viewer.includes('/* GENERATED_DATA */'));
});
