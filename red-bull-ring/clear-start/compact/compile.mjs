import fs from 'node:fs';
import crypto from 'node:crypto';
import {addTerrain} from '../../terrain.mjs';
import {boxCorners,round} from '../../geometry.mjs';
import {volumeAudit,clearanceAudit} from '../../bulk-terrain.mjs';
import {auditDriving,auditKerbCoverage,auditPitConnections} from '../../audit-driving.mjs';
import {carveTerrain,intersectsDomain,distanceToPart} from '../domain.mjs';
import {refitRunoff} from './refit-runoff.mjs';
import {auditShoulders,auditRunoffTransitions,auditPitShoulders,auditPitGap} from './audit-shoulders.mjs';
import {compileTrack} from '../../compile-track.mjs';
import {auditLowClearance} from './audit-low-clearance.mjs';

const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const source=read('../red-bull-ring-plan.json');
const drivingSettings={pitWidth:18,pitSeparation:25,worldGradientSigma:300,heightSigma:180,bankSigma:100,jointMaxStep:.006,roadMaxPitchChangeDegrees:.06,pitKerbTrimResolutionStuds:.06};
const base=compileTrack(read('../../source/red-bull-ring-reference.json'),read('../../source/red-bull-ring-features.json'),read('../../source/ground-reference.json'),drivingSettings),start=base.parts.length;
const runoffRefit=refitRunoff(base);

const settings={edgeMaxLength:96,outerMaxLength:512,outerTolerance:10,outerMaxTurn:35,outerWidthVariation:20,recoveryShoulders:true,pitShoulders:true,pitShoulderWidth:24};
const generated=addTerrain(base,read('../../source/ground-reference.json'),settings);
const terrain=generated.parts.slice(start),domain=source.meta.startDomain,mapping=new Map();
const plan=structuredClone(generated);plan.parts=plan.parts.slice(0,start);
for(const [i,p]of terrain.entries()){
  const ids=[];
  for(const piece of carveTerrain(p,domain)){ids.push(plan.parts.length);plan.parts.push(piece);}
  mapping.set(start+i,ids);
}
if(plan.parts.length+1>=9000)throw Error(`Compact terrain exceeds the under-9000 target: ${plan.parts.length+1}`);
const meta=plan.meta,t=generated.meta.terrain,remap=ids=>ids.flatMap(i=>mapping.get(i)??[]);
meta.variant='clear-start-compact';meta.scope+='; smooth grass recovery shoulders and runoff; compact outer terrain under 9000 objects';
meta.groups.terrain=plan.parts.slice(start).map((_,i)=>start+i);
meta.groupCounts.terrain=plan.parts.length-start;meta.partCount=plan.parts.length;
meta.terrain={...t,foundationIndices:remap(t.foundationIndices),edgeSpans:t.edgeSpans.flatMap(s=>remap([s.index]).map(index=>({...s,index}))),addedParts:plan.parts.length-start,totalWithExistingGrass:plan.parts.length+1};
meta.terrain.edgeParts=meta.terrain.edgeSpans.length;meta.terrain.bulkParts=meta.terrain.addedParts-meta.terrain.edgeParts;
meta.compactTerrain={settings,drivingSettings,sourcePartCount:source.parts.length,sourcePartsSha256:crypto.createHash('sha256').update(JSON.stringify(source.parts)).digest('hex'),preservedMainHorizontalLayout:true,savedParts:source.parts.length-plan.parts.length,totalObjectTargetExclusive:9000,runoffRefit};
meta.placementAnchor=structuredClone(source.meta.placementAnchor);
meta.startDomain={...domain,sourcePartCount:generated.parts.length,sourcePartsSha256:crypto.createHash('sha256').update(JSON.stringify(generated.parts)).digest('hex'),changedTerrain:terrain.flatMap((p,i)=>{const pieces=mapping.get(start+i);return pieces.length===1&&JSON.stringify(plan.parts[pieces[0]])===JSON.stringify(p)?[]:[{sourcePart:start+i+1,retainedPieces:pieces.length}];}),terrainPartsDelta:plan.parts.length-generated.parts.length,nearestPlacedPartStuds:Math.min(...plan.parts.map(p=>distanceToPart(p,domain.center))),nearestPitRoadStuds:domain.nearestPitRoadStuds};
if(plan.parts.some(p=>intersectsDomain(p,{...domain,guard:0})))throw Error('Compact terrain enters the clear starting area');
const corners=plan.parts.flatMap(boxCorners);
meta.planBounds={min:[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(p=>p[k])))};
meta.width=round(meta.planBounds.max[0]-meta.planBounds.min[0]);meta.depth=round(meta.planBounds.max[2]-meta.planBounds.min[2]);
meta.drivingAudit=auditDriving(plan);meta.kerbCoverage=auditKerbCoverage(plan);meta.pitConnections=auditPitConnections(plan);
meta.terrain.volumeAudit=volumeAudit({parts:plan.parts.slice(0,start)},plan.parts.slice(start));
meta.terrain.clearanceAudit=clearanceAudit({parts:plan.parts.slice(0,start)},plan.parts.slice(start),.005,false,true);
if(meta.drivingAudit.uncovered||meta.drivingAudit.maxLayerRiseStuds>.001||meta.drivingAudit.maxRoadOverlapStuds>.01||meta.kerbCoverage.uncovered||meta.kerbCoverage.buriedBodySamples||meta.terrain.clearanceAudit.maxProtrusionStuds>0)throw Error('Compact terrain failed collision/coverage checks: '+JSON.stringify({driving:meta.drivingAudit,kerbs:meta.kerbCoverage,terrain:meta.terrain.clearanceAudit}));
meta.shoulderAudit=auditShoulders(plan);
meta.runoffTransitionAudit=auditRunoffTransitions(plan);
meta.pitShoulderAudit=auditPitShoulders(plan);meta.pitGapAudit=auditPitGap(plan);
meta.lowClearanceAudit=auditLowClearance(plan);
if(meta.pitGapAudit.minimumGapStuds<25||meta.pitGapAudit.pitWidthStuds!==18)throw Error('The pit building corridor is too narrow');
if(meta.lowClearanceAudit.missing||meta.lowClearanceAudit.maxCrestRiseStuds>.015||meta.lowClearanceAudit.maxOverhangRiseStuds>.02)throw Error(`Low-clearance road check failed: ${JSON.stringify(meta.lowClearanceAudit)}`);
for(const [name,audit] of [['shoulder',meta.shoulderAudit],['runoff',meta.runoffTransitionAudit],['pit shoulder',meta.pitShoulderAudit]]){
  if(audit.missing||audit.maxStepStuds>.35||audit.maxDropStuds>.35)throw Error(`Unsafe ${name} transition: ${JSON.stringify(audit)}`);
}
for(const [name,audit] of Object.entries(meta.pitConnections))if(audit.uncovered||audit.maxSurfaceStepStuds>.01)throw Error(`Unsafe pit ${name}`);
meta.limitations=meta.limitations.filter(s=>!s.startsWith('Roadside grass uses'));
meta.limitations.push('Grass shoulders follow the driving plane for at least 48 studs and extend beyond runoff/gravel aprons. Buried terrain overlaps road solids beneath the driving surface. Farther terrain retains broad planar joins. Live vehicle handling has not been measured.');
fs.writeFileSync(new URL('red-bull-ring-plan.json',import.meta.url),JSON.stringify(plan));
fs.writeFileSync(new URL('generation-report.json',import.meta.url),JSON.stringify(meta,null,2)+'\n');
console.log(JSON.stringify({parts:plan.parts.length,totalWithGrass:plan.parts.length+1,track:start,terrain:meta.terrain.addedParts,edges:meta.terrain.edgeParts,saved:meta.compactTerrain.savedParts,shoulders:meta.shoulderAudit}));
