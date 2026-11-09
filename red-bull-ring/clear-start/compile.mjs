import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {boxCorners} from '../geometry.mjs';
import {auditDriving,auditKerbCoverage,auditPitConnections} from '../audit-driving.mjs';
import {volumeAudit,clearanceAudit} from '../bulk-terrain.mjs';
import {carveTerrain,intersectsDomain,distanceToPart} from './domain.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),source=JSON.parse(fs.readFileSync(path.join(here,'../red-bull-ring-plan.json'))),originalAnchor=source.meta.placementAnchor.position;
const pit=source.meta.pitPoints,i=pit.reduce((best,p,i)=>Math.hypot(p.pos[0]-originalAnchor[0],p.pos[2]-originalAnchor[2])<Math.hypot(pit[best].pos[0]-originalAnchor[0],pit[best].pos[2]-originalAnchor[2])?i:best,0),a=pit[i-1].pos,b=pit[i+1].pos,dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),baseCount=source.meta.terrain.basePartCount;
let domain;
for(const distance of [300,320,340,360,400]){
  const candidate={center:[originalAnchor[0]-dz/length*distance,originalAnchor[2]+dx/length*distance],halfSize:200,guard:.15,side:'grass on the inner side of the pit straight',pitOffsetStuds:distance};
  if(source.parts.slice(0,baseCount).every(p=>!intersectsDomain(p,candidate))){domain=candidate;break;}
}
if(!domain)throw Error('No clear 400-stud square beside the pit; do not cut the road to create one');
const plan=structuredClone(source),mapping=new Map(),changed=[];plan.parts=plan.parts.slice(0,baseCount);
for(const old of source.meta.groups.terrain){const pieces=carveTerrain(source.parts[old],domain),ids=[];for(const p of pieces){ids.push(plan.parts.length);plan.parts.push(p);}mapping.set(old,ids);if(pieces.length!==1||JSON.stringify(pieces[0])!==JSON.stringify(source.parts[old]))changed.push({sourcePart:old+1,retainedPieces:pieces.length});}
if(plan.parts.length+1>=10000)throw Error('The domain cut exceeds the total object budget');
const m=plan.meta,oldTerrain=source.meta.terrain;m.variant='clear-start';m.scope+='; clear grass starting area beside the pit';
m.placementAnchor={name:'clear-area',position:[domain.center[0],0,domain.center[1]],roadHeight:0,label:'Centre of the empty grass area beside the pit'};
m.groups.terrain=plan.parts.slice(baseCount).map((_,i)=>baseCount+i);m.groupCounts.terrain=m.groups.terrain.length;m.partCount=plan.parts.length;
const remap=ids=>ids.flatMap(i=>mapping.get(i)??[]),oldEdges=oldTerrain.edgeSpans.map(s=>s.index);
m.terrain={...oldTerrain,foundationIndices:remap(oldTerrain.foundationIndices),addedParts:m.groups.terrain.length,bulkParts:m.groups.terrain.length-remap(oldEdges).length,edgeParts:remap(oldEdges).length,edgeSpans:oldTerrain.edgeSpans.flatMap(s=>(mapping.get(s.index)??[]).map(index=>({...s,index}))),totalWithExistingGrass:plan.parts.length+1};
m.startDomain={...domain,sizeStuds:[400,400],emptyThroughAllHeights:true,sourcePartCount:source.parts.length,sourcePartsSha256:crypto.createHash('sha256').update(JSON.stringify(source.parts)).digest('hex'),changedTerrain:changed,terrainPartsDelta:plan.parts.length-source.parts.length,nearestPlacedPartStuds:Math.min(...plan.parts.map(p=>distanceToPart(p,domain.center))),nearestPitRoadStuds:Math.min(...m.groups.pitLane.map(i=>distanceToPart(plan.parts[i],domain.center)))};
const collisions=plan.parts.flatMap((p,i)=>intersectsDomain(p,{...domain,guard:0})?[i+1]:[]);if(collisions.length)throw Error('Parts still enter the clear start area: '+JSON.stringify(collisions));
const corners=plan.parts.flatMap(boxCorners);m.planBounds={min:[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(p=>p[k])))};m.width=m.planBounds.max[0]-m.planBounds.min[0];m.depth=m.planBounds.max[2]-m.planBounds.min[2];
m.drivingAudit=auditDriving(plan);m.kerbCoverage=auditKerbCoverage(plan);m.pitConnections=auditPitConnections(plan);
if(m.drivingAudit.uncovered||m.drivingAudit.maxLayerRiseStuds>.001||m.kerbCoverage.uncovered||m.kerbCoverage.buriedBodySamples)throw Error('The domain variant failed a driving or kerb audit');
const track={parts:plan.parts.slice(0,baseCount)},terrain=plan.parts.slice(baseCount);m.terrain.volumeAudit=volumeAudit(track,terrain);m.terrain.clearanceAudit=clearanceAudit(track,terrain,.035);
if(m.terrain.volumeAudit.intersections.length||m.terrain.clearanceAudit.maxProtrusionStuds>0)throw Error('A carved terrain solid enters the track');
fs.writeFileSync(path.join(here,'red-bull-ring-plan.json'),JSON.stringify(plan));fs.writeFileSync(path.join(here,'generation-report.json'),JSON.stringify(m,null,2)+'\n');
console.log(JSON.stringify({parts:plan.parts.length,totalWithGrass:plan.parts.length+1,domain:m.startDomain,driving:m.drivingAudit.maxLayerRiseStuds},null,2));
