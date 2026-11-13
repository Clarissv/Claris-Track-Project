import {boxBasis,boxCorners,round} from './lib/geometry.mjs';
import {removeParts} from './compact-runoff.mjs';

export function lowerDatum(plan) {
  if(plan.meta.heightProfile.datumLoweringStuds!==undefined)return plan;
  const {meta}=plan,drop=Math.min(...plan.centerline.map(p=>p[1]))-8;
  for(const p of plan.parts)p[1]=round(p[1]-drop);
  for(const p of plan.centerline)p[1]-=drop;
  for(const p of meta.pitPoints)p.pos[1]-=drop;
  meta.groundLift-=drop;meta.heightProfile.datumLoweringStuds=drop;
  const removed=new Set();
  for(const id of meta.groups.terrain){
    const p=plan.parts[id],basis=boxBasis(p),top=p.slice(0,3).map((v,k)=>v+basis.up[k]*p[4]/2),span=Math.abs(basis.right[1])*p[3]/2+Math.abs(basis.back[1])*p[5]/2;
    if(top[1]+span<0){removed.add(id);continue;}
    const maximum=(top[1]-span-0.1)/basis.up[1];
    if(maximum>=0.01&&maximum<p[4]){
      p[4]=Math.max(0.01,Math.floor(maximum*10000)/10000);
      for(let k=0;k<3;k++)p[k]=round(top[k]-basis.up[k]*p[4]/2);
    }
  }
  removeParts(plan,removed);meta.heightProfile.removedUndergroundTerrainParts=removed.size;
  const corners=plan.parts.flatMap(boxCorners);meta.planBounds={min:[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(p=>p[k])))};
  return plan;
}
