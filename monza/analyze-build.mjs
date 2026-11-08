import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {boxCorners} from './geometry.mjs';

// Reproduce the old builder's pre-existing-object matcher against this plan.
export function auditReuse(plan,{positionTolerance=.25,sizeTolerance=.05}={}) {
  const buckets=new Map(),visual=new Set(plan.meta.nonCollidingPartIndices),roles=new Map();
  for(const [roleIndex,role] of plan.meta.catalogRoles.entries())for(const i of role.partIndices)roles.set(i,roleIndex);
  const key=(x,y,z)=>`${Math.floor(x)}:${Math.floor(y)}:${Math.floor(z)}`;
  const length=(a,b,start,end)=>Math.hypot(...a.slice(start,end).map((v,i)=>v-b[start+i]));
  const dot=(a,b,start)=>a.slice(start,start+3).reduce((sum,v,i)=>sum+v*b[start+i],0);
  const matches=(i,j)=>{
    const a=plan.parts[i],b=plan.parts[j];
    if(roles.get(i)!==roles.get(j)||visual.has(i)!==visual.has(j))return false;
    if(length(a,b,0,3)>positionTolerance||length(a,b,3,6)>sizeTolerance||dot(a,b,7)<.999||dot(a,b,10)<.999)return false;
    const ca=plan.meta.palette[a[6]-1],cb=plan.meta.palette[b[6]-1];
    return ca.material===cb.material&&Math.hypot(...ca.rgb.map((v,k)=>(v-cb.rgb[k])/255))<=.03;
  };
  const reused=[],placed=[];
  for(let i=0;i<plan.parts.length;i++) {
    const a=plan.parts[i];let found;
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const j of buckets.get(key(a[0]+x,a[1]+y,a[2]+z))??[])if(matches(i,j))found=j;
    if(found!==undefined)reused.push({index:i+1,reusedIndex:found+1,group:Object.keys(plan.meta.groups).find(g=>plan.meta.groups[g].includes(i)),positionDifference:length(a,plan.parts[found],0,3),sizeDifference:length(a,plan.parts[found],3,6)});
    else {const k=key(...a);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);placed.push(i);}
  }
  return {planParts:plan.parts.length,oldMatcherUniquePlacements:placed.length,skippedByOldMatcher:reused.length,withOneExistingGrass:placed.length+1,reused};
}

export function estimateGrass(plan,margin=150) {
  const min=[plan.meta.planBounds.min[0]-margin,plan.meta.planBounds.min[2]-margin],max=[plan.meta.planBounds.max[0]+margin,plan.meta.planBounds.max[2]+margin];
  const width=max[0]-min[0],depth=max[1]-min[1];
  const fullCoverage={marginStuds:margin,widthStuds:width,depthStuds:depth,maxPartDimensionStuds:2048,columns:Math.ceil(width/2048),rows:Math.ceil(depth/2048)};
  fullCoverage.additionalParts=fullCoverage.columns*fullCoverage.rows;
  const driving=[...plan.meta.groups.asphalt,...plan.meta.groups.pitLane];
  const terraces=[];
  for(const cellSize of [2048,1024,512,256]) {
    const cells=new Set();
    for(const i of driving) {
      const corners=boxCorners(plan.parts[i]),x0=Math.min(...corners.map(p=>p[0]))-margin,x1=Math.max(...corners.map(p=>p[0]))+margin,z0=Math.min(...corners.map(p=>p[2]))-margin,z1=Math.max(...corners.map(p=>p[2]))+margin;
      for(let x=Math.floor(x0/cellSize);x<=Math.floor(x1/cellSize);x++)for(let z=Math.floor(z0/cellSize);z<=Math.floor(z1/cellSize);z++)cells.add(`${x}:${z}`);
    }
    terraces.push({cellSizeStuds:cellSize,additionalParts:cells.size,totalWithTrackAndExistingGrass:plan.parts.length+cells.size+1});
  }
  return {fullCoverage,totalWithTrackAndExistingGrass:plan.parts.length+fullCoverage.additionalParts+1,coarseSideCoverage:terraces,notes:['Part counts estimate coverage only; no grass has been added.','A flat base covers the ground but leaves elevated sections above it.','Raised coarse terraces need clearance checks against every road and runoff footprint; these counts do not promise contact with the track.']};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const here=path.dirname(fileURLToPath(import.meta.url)),plan=JSON.parse(fs.readFileSync(path.join(here,'monza-plan.json')));
  const report={format:'monza-placement-and-grass-audit-v1',groups:plan.meta.groupCounts,reuse:auditReuse(plan),grass:estimateGrass(plan)};
  fs.writeFileSync(path.join(here,'placement-and-grass-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
