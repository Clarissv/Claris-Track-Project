import fs from 'node:fs';
import {sourceElevation} from './source-elevation.mjs';
import {adaptiveSegments,boxBasis,boxCorners,round} from './lib/geometry.mjs';
import {fittedSlab,refineRoad} from './lib/road-geometry.mjs';
import {unit} from './lib/track-geometry.mjs';
import {auditJoins,overlapVertices,topHeight,inFootprint} from './lib/surface-audit.mjs';
import {constrainSurfaces,clearanceAudit,solidToDatum} from './lib/bulk-terrain.mjs';
import {carveTerrain,intersectsDomain} from './lib/domain.mjs';
import {tidyLayout,pitLayout} from './tidy-layout.mjs';
import {offset,kerbRanges,createKerbs,apronZones,createAprons,barrierOffsets,createBarriers} from './tidy-features.mjs';
const here=new URL('./',import.meta.url),reference=JSON.parse(fs.readFileSync(new URL('source/suzuka-reference.json',here))),gravelReference=JSON.parse(fs.readFileSync(new URL('source/gravel-reference.json',here))),kerbReference=JSON.parse(fs.readFileSync(new URL('source/kerb-reference.json',here)));
const layout=tidyLayout(reference),points=layout.points;
const gradedSurface=sourceElevation(points,reference);
const palette=[{name:'asphalt',rgb:[65,66,66],material:'Concrete'},{name:'dark',rgb:[31,33,34],material:'SmoothPlastic'},{name:'concrete',rgb:[130,132,133],material:'Concrete'},{name:'white',rgb:[220,220,216],material:'SmoothPlastic'},{name:'grass',rgb:[76,112,50],material:'Grass'},{name:'grass-light',rgb:[90,123,58],material:'Grass'},{name:'trees',rgb:[40,64,30],material:'Grass'},{name:'gravel',rgb:[174,156,122],material:'Sand'},{name:'red',rgb:[179,44,40],material:'SmoothPlastic'}];
const parts=[],groups={},push=(group,p)=>{(groups[group]??=[]).push(parts.length);parts.push(p);return parts.length-1;};
const spans=adaptiveSegments(points,110,.08,1.8*Math.PI/180,.008,.07*Math.PI/180,1.5);
const roadSegments=spans.map(([a,b])=>({start:a,end:b,index:push('asphalt',fittedSlab(points,a,b,{thickness:.5}))}));
const crossing=[];
for(let i=0;i<roadSegments.length;i++)for(let j=i+10;j<roadSegments.length;j++){
  if(i===0&&j>roadSegments.length-10)continue;
  const a=parts[roadSegments[i].index],b=parts[roadSegments[j].index];
  if(Math.abs(a[0]-b[0])>a[5]+b[5]+100||Math.abs(a[2]-b[2])>a[5]+b[5]+100)continue;
  const vertices=overlapVertices(a,b);if(!vertices.length)continue;
  const delta=topHeight(a,...vertices[0])-topHeight(b,...vertices[0]);
  if(Math.abs(delta)>8)crossing.push({lower:delta>0?roadSegments[j].index:roadSegments[i].index,upper:delta>0?roadSegments[i].index:roadSegments[j].index,clearance:Math.min(...vertices.map(v=>Math.abs(topHeight(a,...v)-topHeight(b,...v))))-.51});
}
if(!crossing.length)throw Error('Suzuka crossover lost its separate road levels');
const pitResult=pitLayout(points,reference),pit=pitResult.points,pitSegments=[];
const pitInitial=adaptiveSegments(pit,100,.08,2.5*Math.PI/180,.007,.08*Math.PI/180),pitFit=refineRoad(pit,pitInitial,{closed:false,width:26,thickness:.5,maxStep:.006});
for(const [i,s] of pitFit.spans.entries())pitSegments.push({...s,index:push('pitLane',pitFit.parts[i])});
const edgeMarkingSegments=[],pitMarkingSegments=[];
for(const [line,group,target] of [[points,'edgeMarkings',edgeMarkingSegments],[pit,'pitMarkings',pitMarkingSegments]])for(const side of [-1,1]){
  const edge=line.map(p=>({...p,pos:offset(p,side*((line===pit?13:22)-.45)),wr:.18,wl:.18}));
  const allowed=edge.map(p=>line===pit||side===1||!groups.pitLane.some(i=>inFootprint(parts[i],[p.pos[0],p.pos[2]])));
  for(let i=0;i<edge.length-1;){if(!allowed[i]){i++;continue;}const start=i;while(i<edge.length-1&&allowed[i+1])i++;const end=i;if(end===start){i++;continue;}for(const [u,v] of adaptiveSegments(edge.slice(start,end+1),128,.3,5*Math.PI/180,.014)){const a=start+u,b=start+v,p=fittedSlab(edge,a,b,{width:.36,thickness:.04,color:4,lift:.014});p[5]+=.12;target.push({start:a,end:b,index:push(group,p)});}i++;}
}
const kerbs=createKerbs(points,kerbRanges(points,kerbReference),push,groups.pitLane.map(i=>parts[i])),zones=apronZones(points,gravelReference),aprons=createAprons(points,zones,push);
const roads=[...groups.asphalt,...groups.pitLane].map(i=>parts[i]),apronIds=[...(groups.gravel??[]),...(groups.runoff??[])];
const apronFit=constrainSurfaces({parts:roads},apronIds.map(i=>parts[i]),.06,false);apronIds.forEach((id,i)=>parts[id]=apronFit.parts[i]);
const greenRunoffFit=constrainSurfaces({parts:groups.gravel.map(i=>parts[i])},(groups.runoff??[]).map(i=>parts[i]),.06,true);(groups.runoff??[]).forEach((id,i)=>parts[id]=greenRunoffFit.parts[i]);
const offsets=barrierOffsets(points,zones);
const bridgeUpperSpans=roadSegments.filter(s=>crossing.some(c=>c.upper===s.index)),bridgeFirst=Math.min(...bridgeUpperSpans.map(s=>s.start)),bridgeLast=Math.max(...bridgeUpperSpans.map(s=>s.end));
for(const side of [-1,1])for(let i=Math.max(0,bridgeFirst-250);i<=Math.min(points.length-1,bridgeLast+250);i++){const d=Math.max(0,bridgeFirst-i,i-bridgeLast),t=Math.max(0,Math.min(1,d/250)),w=t*t*(3-2*t);offsets[side][i]=28*(1-w)+offsets[side][i]*w;}
const barriers=createBarriers(points,offsets,pitResult.meta,push,pit);
const upperIds=new Set(crossing.map(c=>c.upper)),upperSpans=roadSegments.filter(s=>upperIds.has(s.index));
for(const s of upperSpans){const p=[...parts[s.index]],basis=boxBasis(p);for(let k=0;k<3;k++)p[k]-=basis.up[k]*.75;p[4]=1;p[3]+=18;p[5]+=.15;p[6]=3;push('bridgeDeck',p);}
let bridgeClearance=Math.min(...crossing.map(c=>c.clearance))-1.1;
for(const id of groups.bridgeDeck)for(const road of groups.asphalt){const a=parts[id],b=parts[road];if(Math.abs(a[0]-b[0])>a[3]+a[5]+b[3]+b[5]||Math.abs(a[2]-b[2])>a[3]+a[5]+b[3]+b[5])continue;const vertices=overlapVertices(a,b);if(vertices.length&&topHeight(a,...vertices[0])-topHeight(b,...vertices[0])>8)bridgeClearance=Math.min(bridgeClearance,...vertices.map(v=>topHeight(a,...v)-a[4]/a[11]-topHeight(b,...v)));}
if(bridgeClearance<14)throw Error(`Suzuka underpass clearance below 14 studs: ${bridgeClearance}`);
const midpoint=pit[Math.floor(pit.length*.72)],standing=[400,-400,600,-600,800,-800].map(d=>offset(midpoint,d)).find(q=>!parts.some(p=>intersectsDomain(p,{center:[q[0],q[2]],halfSize:200,guard:.1})));
if(!standing)throw Error('Cannot fit the starting area beside the pit');const startDomain={center:[standing[0],standing[2]],halfSize:200,guard:.1};
const terrain=[],solidBase={parts:[...roads,...apronIds.map(i=>parts[i]),...groups.bridgeDeck.map(i=>parts[i])]};
for(const side of [-1,1]){
  const line=points.map((p,i)=>{const outer=Math.max(70,offsets[side][i]+6),width=outer-21.8;return {...p,pos:offset(p,side*(21.8+width/2)),wr:width/2,wl:width/2};});
  for(const [a,b] of adaptiveSegments(line,180,1.5,8*Math.PI/180,.1,Infinity,20))terrain.push(fittedSlab(line,a,b,{thickness:.5,color:5,lift:-.14,guard:.1}));
}
for(const side of [-1,1]){const line=pit.map(p=>({...p,pos:offset(p,side*25),wr:12,wl:12}));for(const [a,b] of adaptiveSegments(line,180,.8,7*Math.PI/180,.1))terrain.push(fittedSlab(line,a,b,{width:24,thickness:.5,color:5,lift:-.14,guard:.1}));}
const upperStart=Math.max(0,Math.min(...upperSpans.map(s=>s.start))-600),upperEnd=Math.min(points.length-1,Math.max(...upperSpans.map(s=>s.end))+600);
for(const [a,b] of adaptiveSegments(points.slice(upperStart,upperEnd+1),150,.7,6*Math.PI/180,.1))terrain.push(fittedSlab(points,upperStart+a,upperStart+b,{width:76,thickness:.5,color:5,lift:-.55,guard:.08}));
const nearest=(x,z)=>{let best=points[0],d=Infinity;for(let i=0;i<points.length-1;i+=8){const p=points[i],distance=(p.pos[0]-x)**2+(p.pos[2]-z)**2;if(distance<d){d=distance;best=p;}}return best;},tiles=new Set();
for(let i=0;i<points.length-1;i+=24){const p=points[i].pos;for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)tiles.add(`${Math.round(p[0]/160)*160+dx*160}:${Math.round(p[2]/160)*160+dz*160}`);}
for(const key of tiles){const [x,z]=key.split(':').map(Number),p=nearest(x,z),n=p.normal,y=p.pos[1]-(n[0]*(x-p.pos[0])+n[2]*(z-p.pos[2]))/n[1],r=unit([1,-n[0]/n[1],0]);terrain.push([x,y-.8,z,164,.5,164,5,...r,...n]);}
const bottom=Math.min(...points.map(p=>p.pos[1]))-10,fittedTerrain=constrainSurfaces(solidBase,terrain.map(p=>solidToDatum(p,bottom)),.03,true),terrainStart=parts.length;
for(const p of fittedTerrain.parts)for(const q of carveTerrain(p,startDomain))push('terrain',q);
const bound={min:[Math.min(...terrain.map(p=>p[0]))-200,Math.min(...terrain.map(p=>p[2]))-200],max:[Math.max(...terrain.map(p=>p[0]))+200,Math.max(...terrain.map(p=>p[2]))+200]},floorY=Math.min(bottom-1,...fittedTerrain.parts.flatMap(boxCorners).map(p=>p[1]))-1;
for(let x=bound.min[0];x<bound.max[0];x+=1800)for(let z=bound.min[1];z<bound.max[1];z+=1800){const w=Math.min(1800,bound.max[0]-x),d=Math.min(1800,bound.max[1]-z);for(const p of carveTerrain([x+w/2,floorY-1,z+d/2,w,2,d,5,1,0,0,0,1,0],startDomain))push('terrain',p);}
if(parts.some(p=>intersectsDomain(p,{...startDomain,guard:0})))throw Error('The starting area is obstructed');
const clearance=clearanceAudit(solidBase,parts.slice(terrainStart),.03),groundLift=.25-Math.min(...parts.flatMap(boxCorners).map(p=>p[1]));
for(const p of parts)p[1]=round(p[1]+groundLift);for(const p of points)p.pos[1]+=groundLift;for(const p of pit)p.pos[1]+=groundLift;
const corners=parts.flatMap(boxCorners),planBounds={min:[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(p=>p[k])))};
const meta={format:'suzuka-elevated-v1',variant:'tidied-connected-ramps',partCount:parts.length,palette,planBounds,sourceSha256:reference.sourceSha256,centerlineSha256:reference.centerlineSha256,gameTarget:{placeId:14005966837,name:'Jakarta'},placementAnchor:{position:[standing[0],0,standing[2]],roadHeight:0},catalogRoles:[{name:'Others75',appearance:'color',partIndices:[...groups.asphalt,...groups.pitLane]}],nonCollidingPartIndices:[...groups.edgeMarkings,...groups.pitMarkings],groups,groupCounts:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),lapLengthMetres:points.at(-1).s/reference.studsPerMetre,lapLengthStuds:points.at(-1).s,groundLift,sourceLayout:2001,layoutTidy:layout.meta,gradedSurface,bridge:{minimumClearanceStuds:bridgeClearance,pairs:crossing,deckIndices:groups.bridgeDeck,abutmentSourceRange:[upperStart,upperEnd]},terrain:{addedParts:parts.length-terrainStart,clearanceAudit:clearance},settings:{curbWidth:3.2,pitWidth:26,minimumRoadWidth:44,gradedRampLength:40},surfaceSmoothing:{roadJoins:auditJoins({parts},roadSegments,true),pitJoins:auditJoins({parts},pitSegments,false)},roadSegments,pitSegments,pitPoints:pit,pitLayout:pitResult.meta,kerbRuns:kerbs.runs,kerbSpans:kerbs.spans,runoffSpans:aprons.spans,apronRuns:aprons.runs,barrierRuns:barriers.runs,barrierSpans:barriers.spans,barrierOffsets:offsets,edgeMarkingSegments,pitMarkingSegments,width:planBounds.max[0]-planBounds.min[0],depth:planBounds.max[2]-planBounds.min[2],limitations:['Block adaptation of the supplied 2001 model with tidied horizontal road geometry.','Outer terrain retains broad planar terraces. Live driving and saving require an in-game check.']};
console.log(JSON.stringify({parts:parts.length,groups:meta.groupCounts,bridge:bridgeClearance,roadJoins:meta.surfaceSmoothing.roadJoins,pitJoins:meta.surfaceSmoothing.pitJoins}));
if(parts.length+1>=9000)throw Error('Suzuka exceeds its 8999 total-object target');if(meta.surfaceSmoothing.roadJoins.maxOverlapStep>.008)throw Error('Road joints failed');if(clearance.maxProtrusionStuds>0)throw Error('Terrain clearance failed');
fs.writeFileSync(new URL('suzuka-plan.json',here),JSON.stringify({meta,parts,centerline:points.map(p=>[...p.pos,p.wr,p.wl,p.s,...p.normal])}));fs.writeFileSync(new URL('generation-report.json',here),JSON.stringify(meta,null,2));
