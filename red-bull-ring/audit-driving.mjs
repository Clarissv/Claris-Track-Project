import {collisionSampler,inFootprint,overlapVertices,topHeight} from './surface-audit.mjs';
import {boxCorners} from './geometry.mjs';

export function auditKerbCoverage(plan){
  const kerbs=collisionSampler(plan.meta.groups.curbs.map(i=>plan.parts[i])),pit=collisionSampler(plan.meta.groups.pitLane.map(i=>plan.parts[i])),asphalt=collisionSampler(plan.meta.groups.asphalt.map(i=>plan.parts[i]));let samples=0,uncovered=0,pitOpenings=0,worst=null,maxRise=-Infinity,minRise=Infinity,bodySamples=0,buriedBodySamples=0,minBodyRise=Infinity,worstBody=null;
  for(const run of plan.meta.kerbRuns)for(let i=run.start;i<run.end;i++){
    const a=plan.centerline[i],b=plan.centerline[i+1],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),count=Math.max(1,Math.ceil(length/.5));
    for(let j=0;j<count;j++){
      const t=j/count,q=a.map((v,k)=>v+(b[k]-v)*t);
      for(const fraction of [-.8,0,.8]){
        const d=run.side*((run.side>0?q[3]:q[4])+plan.meta.settings.curbWidth/2+fraction*plan.meta.settings.curbWidth/2),x=q[0]+dz/length*d,z=q[2]-dx/length*d,h=kerbs(x,z);samples++;
        if(!Number.isFinite(h)){if(Number.isFinite(pit(x,z)))pitOpenings++;else{uncovered++;worst??={index:i,side:run.side,fraction,x,z};}continue;}
        const road=q[1]-(q[6]*(x-q[0])+q[8]*(z-q[2]))/q[7],rise=h-road;maxRise=Math.max(maxRise,rise);minRise=Math.min(minRise,rise);
        const arc=run.arc[i-run.start]+(run.arc[i-run.start+1]-run.arc[i-run.start])*t;
        if(fraction>=0&&arc>=6&&run.arc.at(-1)-arc>=6){
          // The inner transition and end ramps meet the road; the raised body
          // must remain visible over both the reference plane and any asphalt
          // rectangle that extends beyond the nominal lane on an inside bend.
          const bodyRise=h-Math.max(road,asphalt(x,z),pit(x,z));bodySamples++;
          if(bodyRise<minBodyRise){minBodyRise=bodyRise;worstBody={index:i,side:run.side,fraction,x,z};}
          if(bodyRise<=.01)buriedBodySamples++;
        }
      }
    }
  }
  return {samples,uncovered,pitOpenings,worst,maxRiseStuds:maxRise,minRiseStuds:minRise,bodySamples,buriedBodySamples,minBodyRiseStuds:minBodyRise,worstBody};
}

export function auditPitConnections(plan){
  const main=collisionSampler(plan.meta.groups.asphalt.map(i=>plan.parts[i])),pit=collisionSampler(plan.meta.groups.pitLane.map(i=>plan.parts[i])),points=plan.meta.pitPoints;
  const ends={};
  for(const [name,line] of [['entry',points],['exit',[...points].reverse()]]){
    let distance=0,samples=0,uncovered=0,maximumStep=0;
    for(let i=0;i<line.length-1&&distance<5;i++){
      const a=line[i],b=line[i+1],dx=b.pos[0]-a.pos[0],dz=b.pos[2]-a.pos[2],length=Math.hypot(dx,dz),count=Math.max(1,Math.ceil(Math.min(length,5-distance)/.5));
      for(let j=0;j<count;j++){
        const t=j/count,p=a.pos.map((x,k)=>x+(b.pos[k]-x)*t);
        for(const offset of [-.98*a.wl,0,.98*a.wr]){
          const x=p[0]+dz/length*offset,z=p[2]-dx/length*offset,mainHeight=main(x,z),pitHeight=pit(x,z);samples++;
          if(!Number.isFinite(mainHeight)||!Number.isFinite(pitHeight)){uncovered++;continue;}
          maximumStep=Math.max(maximumStep,Math.abs(mainHeight-pitHeight));
        }
      }
      distance+=length;
    }
    ends[name]={samples,uncovered,maxSurfaceStepStuds:maximumStep};
  }
  return ends;
}

export function auditDriving(plan){
  const groups=plan.meta.groups,visual=new Set(plan.meta.nonCollidingPartIndices);
  const roadIndices=[...groups.asphalt,...groups.pitLane],roads=roadIndices.map(i=>plan.parts[i]);
  const roadSurface=collisionSampler(roads),allSurface=collisionSampler(plan.parts.filter((_,i)=>!visual.has(i)));
  let samples=0,uncovered=0,maxLayerRise=0,worst=null;
  for(const [kind,line] of [['main',plan.centerline],['pit',plan.meta.pitPoints.map(p=>[...p.pos,p.wr,p.wl])]]){
    for(let i=0;i<line.length-1;i++){
      const a=line[i],b=line[i+1],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),count=Math.max(1,Math.ceil(length/.5));
      for(let j=0;j<count;j++){
        const t=j/count,p=a.map((v,k)=>v+(b[k]-v)*t);
        for(const f of [-.98,-.9,-.6,0,.6,.9,.98]){
          const offset=f*(f>0?p[3]:p[4]),x=p[0]+dz/length*offset,z=p[2]-dx/length*offset,h=roadSurface(x,z);samples++;
          if(!Number.isFinite(h)){uncovered++;continue;}
          const rise=allSurface(x,z)-h;if(rise>maxLayerRise){maxLayerRise=rise;worst={kind,index:i,f,x,z,h};}
        }
      }
    }
  }
  // Check all road-road overlaps, including non-neighbours and pit crossings.
  const cells=new Map(),cell=64;let pairs=0,maxRoadOverlap=0,worstOverlap=null;
  const keys=p=>{const c=boxCorners(p),xs=c.map(q=>q[0]),zs=c.map(q=>q[2]),r=[];for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let z=Math.floor(Math.min(...zs)/cell);z<=Math.floor(Math.max(...zs)/cell);z++)r.push(`${x}:${z}`);return r;};
  for(const [j,p] of roads.entries()){
    const buckets=keys(p),near=new Set(buckets.flatMap(k=>cells.get(k)??[]));
    for(const i of near){const a=roads[i],vertices=overlapVertices(a,p);if(!vertices.length)continue;pairs++;
      for(const [x,z] of vertices){const d=Math.abs(topHeight(a,x,z)-topHeight(p,x,z));if(d>maxRoadOverlap){maxRoadOverlap=d;worstOverlap={parts:[roadIndices[i],roadIndices[j]],x,z};}}
    }
    for(const k of buckets){if(!cells.has(k))cells.set(k,[]);cells.get(k).push(j);}
  }
  if(worst){worst.layers=[];for(const [group,ids] of Object.entries(groups))if(!['asphalt','pitLane'].includes(group))for(const i of ids)if(!visual.has(i)&&inFootprint(plan.parts[i],[worst.x,worst.z])&&topHeight(plan.parts[i],worst.x,worst.z)>worst.h+.001)worst.layers.push({group,index:i,rise:topHeight(plan.parts[i],worst.x,worst.z)-worst.h});}
  return {samples,uncovered,maxLayerRiseStuds:maxLayerRise,worst,roadOverlapPairs:pairs,maxRoadOverlapStuds:maxRoadOverlap,worstOverlap};
}
