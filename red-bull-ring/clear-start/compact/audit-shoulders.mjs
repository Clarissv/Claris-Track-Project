import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collisionSampler,topFootprint} from '../../surface-audit.mjs';
import {KDTree} from '../../track-geometry.mjs';
export function auditShoulders(plan,{stride=1,width=40,spacing=1}={}){
  const visual=new Set(plan.meta.nonCollidingPartIndices),surface=collisionSampler(plan.parts.filter((_,i)=>!visual.has(i)));
  let samples=0,missing=0,maxStep=0,worst=null,maxDrop=0,worstDrop=null;
  const drops=[],steps=[];
  for(let i=0;i<plan.centerline.length-1;i+=stride){
    const p=plan.centerline[i],a=plan.centerline[Math.max(0,i-1)],b=plan.centerline[Math.min(plan.centerline.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);
    for(const side of [-1,1]){
      let previous;
      for(let d=0;d<=width;d+=spacing){
        const offset=side*((side>0?p[3]:p[4])+d),x=p[0]+dz/len*offset,z=p[2]-dx/len*offset;
        const height=surface(x,z),road=p[1]-(p[6]*(x-p[0])+p[8]*(z-p[2]))/p[7];samples++;
        if(!Number.isFinite(height)){missing++;previous=null;continue;}
        const drop=road-height;drops.push(drop);
        if(drop>maxDrop){maxDrop=drop;worstDrop={index:i,side,d,x,z,drop};}
        if(previous){const step=Math.abs(height-previous.height);steps.push(step);if(step>maxStep){maxStep=step;worst={index:i,side,d,x,z,step,from:previous.height,to:height};}}
        previous={height};
      }
    }
  }
  const percentile=(values,f)=>values.sort((a,b)=>a-b)[Math.floor((values.length-1)*f)]??0;
  return {samples,missing,widthStuds:width,sampleSpacingStuds:spacing,maxStepStuds:maxStep,stepP99Studs:percentile(steps,.99),maxDropStuds:maxDrop,dropP99Studs:percentile(drops,.99),worst,worstDrop};
}
// Cross every retained gravel/runoff section from the asphalt to eight studs
// beyond its outer perimeter, so an apron cannot end at a hidden grass cliff.
export function auditRunoffTransitions(plan,{stride=1,margin=8,spacing=1}={}){
  const line=plan.centerline,traces=new Map(),visual=new Set(plan.meta.nonCollidingPartIndices);
  const surface=collisionSampler(plan.parts.filter((_,i)=>!visual.has(i)));
  const frame=i=>{const p=line[i],a=line[Math.max(0,i-1)],b=line[Math.min(line.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);return {p,rx:dz/length,rz:-dx/length};};
  for(const span of plan.meta.runoffSpans){
    const polygon=topFootprint(plan.parts[span.index]);
    for(let i=span.start;i<=span.end&&i<line.length-1;i+=stride){
      const {p,rx,rz}=frame(i),edge=span.side>0?p[3]:p[4];
      const width=Math.max(...polygon.map(([x,z])=>span.side*((x-p[0])*rx+(z-p[2])*rz)-edge))+margin,key=`${i}:${span.side}`;
      traces.set(key,Math.max(traces.get(key)??0,width));
    }
  }
  let samples=0,missing=0,maxStep=0,maxDrop=0,worst=null,worstDrop=null;
  for(const [key,width] of traces){
    const [index,side]=key.split(':').map(Number),{p,rx,rz}=frame(index);let previous;
    for(let d=0;d<=width;d+=spacing){
      const offset=side*((side>0?p[3]:p[4])+d),x=p[0]+rx*offset,z=p[2]+rz*offset,height=surface(x,z);samples++;
      if(!Number.isFinite(height)){missing++;previous=undefined;continue;}
      const drop=p[1]-(p[6]*(x-p[0])+p[8]*(z-p[2]))/p[7]-height;
      if(drop>maxDrop){maxDrop=drop;worstDrop={index,side,d,x,z,drop};}
      if(previous!==undefined&&Math.abs(height-previous)>maxStep){maxStep=Math.abs(height-previous);worst={index,side,d,x,z,step:maxStep};}
      previous=height;
    }
  }
  return {samples,traces:traces.size,missing,marginStuds:margin,sampleSpacingStuds:spacing,maxStepStuds:maxStep,maxDropStuds:maxDrop,worst,worstDrop};
}
export function auditPitShoulders(plan){
  const centerline=plan.meta.pitPoints.map(p=>[...p.pos,p.wr,p.wl,p.s,...p.normal]);
  return auditShoulders({...plan,centerline},{width:20});
}
export function auditPitGap(plan){
  const line=plan.centerline,tree=new KDTree(line.slice(0,-1).map((p,i)=>[p[0],p[2],i])),gaps=[];
  const start=plan.meta.pitLayout.straightStartIndex,end=plan.meta.pitLayout.exitApproachStartIndex??plan.meta.pitLayout.exitStartIndex;
  for(let i=start;i<=end;i++){
    const p=plan.meta.pitPoints[i],j=tree.nearest([p.pos[0],p.pos[2]]).point[2],q=line[j],a=line[Math.max(0,j-1)],b=line[Math.min(line.length-1,j+1)],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
    const offset=((p.pos[0]-q[0])*dz-(p.pos[2]-q[2])*dx)/length;
    gaps.push(Math.abs(offset)-(offset>0?q[3]:q[4])-(p.wr+p.wl)/2);
  }
  gaps.sort((a,b)=>a-b);
  return {samples:gaps.length,minimumGapStuds:gaps[0],medianGapStuds:gaps[(gaps.length/2)>>1],maximumGapStuds:gaps.at(-1),pitWidthStuds:plan.meta.pitLane.widthStuds};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const file=process.argv[2];
  if(file)console.log(JSON.stringify(auditShoulders(JSON.parse(fs.readFileSync(file))),null,2));
}
