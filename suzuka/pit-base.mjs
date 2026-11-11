import assert from 'node:assert/strict';
import {round} from './lib/geometry.mjs';
import {topHeight,topFootprint,inFootprint,collisionSampler,auditJoins,overlapVertices} from './lib/surface-audit.mjs';
import {constrainSurfaces,clearanceAudit,solidToDatum} from './lib/bulk-terrain.mjs';
import {fitGrid} from './smooth-runoff.mjs';

// Keep the garage apron level across its width, matching each pit road's
// longitudinal plane at the building-side edge. Its slabs share the road's
// ramp boundaries rather than approximating the full downhill pit straight.
export function addPitBase(plan){
  const {parts,meta}=plan,{straightStartIndex:start,exitStartIndex:end}=meta.pitLayout;
  const width=80,overlap=.025,edgeX=meta.pitPoints[start].pos[0]-meta.pitPoints[start].wl;
  const spans=[],supports=[],transitions=[];
  for(const road of meta.pitSegments){
    const a=Math.max(start,road.start),b=Math.min(end,road.end);if(a>=b)continue;
    const z0=meta.pitPoints[a].pos[2],z1=meta.pitPoints[b].pos[2],z=(z0+z1)/2;
    const lane=parts[road.index],gz=-lane[12]/lane[11],uy=1/Math.hypot(1,gz),up=[0,uy,-gz*uy];
    const x=edgeX-(width-overlap)/2,y=topHeight(lane,edgeX,z)-.025;
    const slab=[x,round(y-up[1]*.3),round(z-up[2]*.3),width+overlap,.6,round((z1-z0)/uy+.008),3,1,0,0,...up];
    const index=parts.length;parts.push(slab);meta.groups.terrain.push(index);
    spans.push({index,start:a,end:b,roadIndex:road.index});
    const support=[...slab];support[6]=5;support[1]-=.602;
    supports.push(solidToDatum(support,.25));
  }
  // Blend the flat apron back to the banked recovery grass over forty studs
  // at each end. Subdivide the changing bank so these are smooth ramps.
  const roadSample=collisionSampler(meta.groups.pitLane.map(i=>parts[i]));
  for(const [join,direction] of [[start,-1],[end,1]]){
    const far=join+direction*24,lo=Math.min(join,far),hi=Math.max(join,far);
    for(let k=lo;k<hi;k+=6)for(let d0=0;d0<width;d0+=10){
      const samples=[];
      for(const i of [k,k+3,k+6])for(const d of [d0,d0+5,d0+10]){
        const q=meta.pitPoints[i],r=q.right,h=Math.hypot(r[0],r[2]);
        const x=q.pos[0]-r[0]/h*(q.wl+d),z=q.pos[2]-r[2]/h*(q.wl+d);
        const blend=Math.abs(i-join)/24,edgeY=roadSample(q.pos[0]-r[0]/h*q.wl,q.pos[2]-r[2]/h*q.wl);
        const y=edgeY-.032+(q.normal[0]*r[0]+q.normal[2]*r[2])/q.normal[1]/h*d*blend;
        samples.push([x,y,z]);
      }
      const fit=fitGrid(samples,[1,0,0],5),index=parts.length;
      const fitted=constrainSurfaces({parts:[...slabsFor(spans,parts),...meta.groups.pitLane.map(i=>parts[i])]},[fit.part],.008,false,true);
      parts.push(fitted.parts[0]);meta.groups.terrain.push(index);transitions.push({index,start:k,end:k+6,side:-1,kind:'pit',fitErrorStuds:fit.error});
    }
  }
  const newIds=new Set([...spans,...transitions].map(s=>s.index));
  const existing=meta.groups.terrain.filter(i=>!newIds.has(i));
  const fit=constrainSurfaces({parts:[...spans,...transitions].map(s=>parts[s.index])},existing.map(i=>parts[i]),.008,false,true);
  existing.forEach((id,i)=>parts[id]=fit.parts[i]);
  const supportIndices=supports.map(p=>{const index=parts.length;parts.push(p);meta.groups.terrain.push(index);return index;});
  meta.pitBase={widthStuds:width,lengthStuds:meta.pitPoints[end].s-meta.pitPoints[start].s,side:-1,
    edgeX,outerX:edgeX-width,startIndex:start,endIndex:end,spans,supportIndices,transitions,
    laneOverlapStuds:overlap,laneDropStuds:.025,loweredGrassParts:fit.modified,
    maximumGrassLoweringStuds:fit.maximumLowering,
    method:'Connected concrete garage base, level across its width and following the pit straight grade, with grass support below'};
  meta.partCount=parts.length;meta.groupCounts=Object.fromEntries(Object.entries(meta.groups).map(([k,v])=>[k,v.length]));
  meta.settings.pitBaseWidth=width;
  meta.pitBase.audit=verifyPitBase(plan);return plan;
}

const slabsFor=(spans,parts)=>spans.map(s=>parts[s.index]);

export function verifyPitBase(plan){
  const {parts,meta}=plan,base=meta.pitBase;assert.ok(base,'Pit building base is missing');
  const slabs=base.spans.map(s=>parts[s.index]),sample=collisionSampler(slabs),lane=collisionSampler(meta.groups.pitLane.map(i=>parts[i]));
  const excluded=new Set([...base.spans.map(s=>s.index),...meta.nonCollidingPartIndices]);
  const others=parts.filter((_,i)=>!excluded.has(i));
  const buildingSlabs=slabs.map(p=>{const q=[...p];q[0]-=.05;q[3]-=.1;return q;});
  const clear=clearanceAudit({parts:buildingSlabs},others,0,false,true);
  assert.ok(clear.maxProtrusionStuds<.001,'Grass or an accessory protrudes through the garage base: '+JSON.stringify(clear));
  const joins=auditJoins(plan,base.spans);assert.ok(joins.maxOverlapStep<.008,'Garage base slabs are disconnected or have a lip');
  const connected=[...base.spans,...base.transitions].map(s=>parts[s.index]);let transitionStep=0,transitionPairs=0;
  for(let i=0;i<connected.length;i++)for(let j=i+1;j<connected.length;j++){
    const vertices=overlapVertices(connected[i],connected[j]);if(vertices.length)transitionPairs++;
    for(const [x,z] of vertices)transitionStep=Math.max(transitionStep,Math.abs(topHeight(connected[i],x,z)-topHeight(connected[j],x,z)));
  }
  assert.ok(transitionStep<.06,'A garage-base grass transition has an exposed lip');
  let samples=0,maxLaneStep=0,maxCrossSlope=0;
  const z0=meta.pitPoints[base.startIndex].pos[2],z1=meta.pitPoints[base.endIndex].pos[2];
  for(let z=z0;z<=z1;z+=.5){
    const edge=sample(base.edgeX,z),road=lane(base.edgeX,z);assert.ok(Number.isFinite(edge)&&Number.isFinite(road),'Garage base does not reach the pit lane');
    maxLaneStep=Math.max(maxLaneStep,Math.abs(edge-road));
    for(let d=0;d<=base.widthStuds;d+=2){const y=sample(base.edgeX-d,z);assert.ok(Number.isFinite(y),'Garage building area has a missing slab');maxCrossSlope=Math.max(maxCrossSlope,Math.abs(y-edge));samples++;}
  }
  for(const s of base.spans){const p=parts[s.index];assert.equal(p[10],0,'Garage apron is banked');assert.equal(p[6],3);}
  assert.ok(maxLaneStep<.04,'Garage base has a raised pit-lane join');assert.ok(maxCrossSlope<.008,'Garage base is uneven across its width');
  // Test the exact outer corners, including the final endpoint omitted by the grid.
  for(const z of [z0,z1])for(const x of [base.edgeX,base.outerX])assert.ok(Number.isFinite(sample(x,z)),'Garage base corner is uncovered');
  const occupied=meta.groups.barriers.map(i=>parts[i]).filter(p=>topFootprint(p).some(q=>slabs.some(s=>inFootprint(s,q))));
  assert.equal(occupied.length,0,'A barrier obstructs the pit building area');
  return {samples,maxLaneStepStuds:maxLaneStep,maxCrossWidthVariationStuds:maxCrossSlope,joins,
    transitionPairs,maxTransitionOverlapStepStuds:transitionStep,
    clearBuildingArea:clear.maxProtrusionStuds<=.001,maxProtrusionStuds:clear.maxProtrusionStuds};
}
