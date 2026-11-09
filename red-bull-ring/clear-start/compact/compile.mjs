import fs from 'node:fs';
import crypto from 'node:crypto';
import {addTerrain} from '../../terrain.mjs';
import {boxCorners,round} from '../../geometry.mjs';
import {volumeAudit,clearanceAudit} from '../../bulk-terrain.mjs';
import {auditDriving,auditKerbCoverage,auditPitConnections} from '../../audit-driving.mjs';
import {carveTerrain,intersectsDomain,distanceToPart} from '../domain.mjs';

const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const source=read('../red-bull-ring-plan.json'),base=structuredClone(source),start=source.meta.terrain.basePartCount;
base.parts=base.parts.slice(0,start);
delete base.meta.groups.terrain;delete base.meta.groupCounts.terrain;
const originalLift=source.meta.terrain.foundationLift;
for(const p of base.parts)p[1]=round(p[1]-originalLift);
for(const p of base.centerline)p[1]-=originalLift;
for(const p of base.meta.pitPoints)p.pos[1]-=originalLift;
base.meta.groundLift-=originalLift;
base.meta.retainedHeightRange=base.meta.retainedHeightRange.map(h=>h-originalLift);
base.meta.placementAnchor.roadHeight-=originalLift;
base.meta.partCount=start;
delete base.meta.terrain;delete base.meta.startDomain;

const settings={edgeMaxLength:96,outerMaxLength:512,outerTolerance:10,outerMaxTurn:35,outerWidthVariation:20};
const generated=addTerrain(base,read('../../source/ground-reference.json'),settings);
// Keep all driving geometry and its vertical datum exactly as in clear-start.
const delta=source.parts[0][1]-generated.parts[0][1];
for(const p of generated.parts.slice(start))p[1]=round(p[1]+delta);
generated.meta.terrain.foundationTop+=delta;
const terrain=generated.parts.slice(start),domain=source.meta.startDomain,mapping=new Map();
const plan=structuredClone(source);plan.parts=source.parts.slice(0,start).map(p=>[...p]);
for(const [i,p]of terrain.entries()){
  const ids=[];
  for(const piece of carveTerrain(p,domain)){ids.push(plan.parts.length);plan.parts.push(piece);}
  mapping.set(start+i,ids);
}
if(plan.parts.length+1>=9000)throw Error(`Compact terrain exceeds the under-9000 target: ${plan.parts.length+1}`);
const meta=plan.meta,t=generated.meta.terrain,remap=ids=>ids.flatMap(i=>mapping.get(i)??[]);
meta.variant='clear-start-compact';meta.scope+='; compact outer terrain under 9000 objects';
meta.groups.terrain=plan.parts.slice(start).map((_,i)=>start+i);
meta.groupCounts.terrain=plan.parts.length-start;meta.partCount=plan.parts.length;
meta.terrain={...t,foundationIndices:remap(t.foundationIndices),edgeSpans:t.edgeSpans.flatMap(s=>remap([s.index]).map(index=>({...s,index}))),addedParts:plan.parts.length-start,totalWithExistingGrass:plan.parts.length+1};
meta.terrain.edgeParts=meta.terrain.edgeSpans.length;meta.terrain.bulkParts=meta.terrain.addedParts-meta.terrain.edgeParts;
meta.compactTerrain={settings,sourcePartCount:source.parts.length,sourcePartsSha256:crypto.createHash('sha256').update(JSON.stringify(source.parts)).digest('hex'),preservedTrackParts:start,preservedTrackSha256:crypto.createHash('sha256').update(JSON.stringify(source.parts.slice(0,start))).digest('hex'),savedParts:source.parts.length-plan.parts.length,totalObjectTargetExclusive:9000};
meta.startDomain={...domain,sourcePartCount:generated.parts.length,sourcePartsSha256:crypto.createHash('sha256').update(JSON.stringify(generated.parts)).digest('hex'),changedTerrain:terrain.flatMap((p,i)=>{const pieces=mapping.get(start+i);return pieces.length===1&&JSON.stringify(plan.parts[pieces[0]])===JSON.stringify(p)?[]:[{sourcePart:start+i+1,retainedPieces:pieces.length}];}),terrainPartsDelta:plan.parts.length-generated.parts.length,nearestPlacedPartStuds:Math.min(...plan.parts.map(p=>distanceToPart(p,domain.center))),nearestPitRoadStuds:domain.nearestPitRoadStuds};
if(plan.parts.some(p=>intersectsDomain(p,{...domain,guard:0})))throw Error('Compact terrain enters the clear starting area');
const corners=plan.parts.flatMap(boxCorners);
meta.planBounds={min:[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(p=>p[k])))};
meta.width=round(meta.planBounds.max[0]-meta.planBounds.min[0]);meta.depth=round(meta.planBounds.max[2]-meta.planBounds.min[2]);
meta.drivingAudit=auditDriving(plan);meta.kerbCoverage=auditKerbCoverage(plan);meta.pitConnections=auditPitConnections(plan);
meta.terrain.volumeAudit=volumeAudit({parts:plan.parts.slice(0,start)},plan.parts.slice(start));
meta.terrain.clearanceAudit=clearanceAudit({parts:plan.parts.slice(0,start)},plan.parts.slice(start),.035);
if(meta.drivingAudit.uncovered||meta.kerbCoverage.uncovered||meta.kerbCoverage.buriedBodySamples||meta.terrain.volumeAudit.intersections.length||meta.terrain.clearanceAudit.maxProtrusionStuds>0)throw Error('Compact terrain failed collision/coverage checks');
fs.writeFileSync(new URL('red-bull-ring-plan.json',import.meta.url),JSON.stringify(plan));
fs.writeFileSync(new URL('generation-report.json',import.meta.url),JSON.stringify(meta,null,2)+'\n');
console.log(JSON.stringify({parts:plan.parts.length,totalWithGrass:plan.parts.length+1,track:start,terrain:meta.terrain.addedParts,edges:meta.terrain.edgeParts,saved:meta.compactTerrain.savedParts}));
