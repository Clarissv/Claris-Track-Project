import {scaleReference,scaleGround,densifyDriving} from './layout.mjs';
import {connectedPitLayout} from './pit-layout.mjs';
import {addContinuousKerbs,addCornerAprons,fitKerbsToLane} from './track-tidy.mjs';
import {smoothWorldSurface} from './world-surface.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {smoothDrivingPoints,profileMetrics} from './smooth-surface.mjs';
import {finishPoints,sha} from './reference.mjs';
import {adaptiveSegments,boxBasis,boxCorners,round,makeSlab} from './geometry.mjs';
import {add,sub,mul,dot,unit} from './track-geometry.mjs';
import {fittedSlab,refineRoad} from './road-geometry.mjs';
import {auditJoins,topHeight,overlapVertices} from './surface-audit.mjs';
import {constrainSurfaces} from './bulk-terrain.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export const palette=[
  {name:'asphalt',rgb:[65,66,66],material:'Concrete'},
  {name:'dark',rgb:[31,33,34],material:'SmoothPlastic'},
  {name:'concrete',rgb:[130,132,133],material:'Concrete'},
  {name:'white',rgb:[220,220,216],material:'SmoothPlastic'},
  {name:'grass',rgb:[76,112,50],material:'Grass'},
  {name:'grass-light',rgb:[90,123,58],material:'Grass'},
  {name:'trees',rgb:[40,64,30],material:'Grass'},
  {name:'sand',rgb:[174,156,122],material:'Sand'},
  {name:'red',rgb:[179,44,40],material:'SmoothPlastic'}
];
const nearestPoint=(points,q)=>{
  const count=points.length-1;let best=0,distance=Infinity;
  for(let i=0;i<count;i+=4){const p=points[i].pos,d=(p[0]-q[0])**2+(p[2]-q[2])**2;if(d<distance){distance=d;best=i;}}
  let result;
  for(let offset=-5;offset<=5;offset++){
    const index=(best+offset+count)%count,a=points[index],b=points[index+1],dx=b.pos[0]-a.pos[0],dz=b.pos[2]-a.pos[2],t=Math.max(0,Math.min(1,((q[0]-a.pos[0])*dx+(q[2]-a.pos[2])*dz)/(dx*dx+dz*dz))),pos=a.pos.map((v,k)=>v+(b.pos[k]-v)*t),d=(pos[0]-q[0])**2+(pos[2]-q[2])**2;
    if(!result||d<result.d)result={d,index,point:{...a,pos,s:a.s+(b.s-a.s)*t,wr:a.wr+(b.wr-a.wr)*t,wl:a.wl+(b.wl-a.wl)*t,bank:a.bank+(b.bank-a.bank)*t,normal:unit(a.normal.map((v,k)=>v+(b.normal[k]-v)*t)),right:unit(a.right.map((v,k)=>v+(b.right[k]-v)*t))},distance:Math.sqrt(d)};
  }
  return result;
};
function pitRoute(source,main,rawMain,width,route,separation=0,singleTurns=false){
  const layout=connectedPitLayout(source,main,{width,separation,singleTurns,entryMainIndex:route.entryMainIndex*2,exitMainIndex:route.exitMainIndex*2}),points=layout.points;
  for(const p of points){const adjusted=nearestPoint(main,p.pos).point,raw=nearestPoint(rawMain,p.pos).point;p.pos[1]+=adjusted.pos[1]-raw.pos[1];}
  if(separation>0)for(const p of points){
    const q=nearestPoint(main,p.pos).point,n=q.normal,r=p.right,h=Math.hypot(r[0],r[2]);
    p.pos[1]=q.pos[1]-(n[0]*(p.pos[0]-q.pos[0])+n[2]*(p.pos[2]-q.pos[2]))/n[1];
    p.bank=-(n[0]*r[0]+n[2]*r[2])/(n[1]*h);
  }
  const filtered=smoothDrivingPoints(points,{heightSigma:separation>0?180:65,bankSigma:separation>0?180:100,closed:false});
  for(const p of filtered){
    const {point:q,distance}=nearestPoint(main,p.pos),shared=Math.max(q.wr,q.wl)+width/2+(singleTurns?70:35);
    const t=Math.max(0,Math.min(1,(distance-shared)/70)),weight=1-t*t*(3-2*t),n=q.normal;
    const h=q.pos[1]-(n[0]*(p.pos[0]-q.pos[0])+n[2]*(p.pos[2]-q.pos[2]))/n[1],r=p.right,rh=Math.hypot(r[0],r[2]),bank=-(n[0]*r[0]+n[2]*r[2])/(n[1]*rh);
    p.pos[1]=p.pos[1]*(1-weight)+h*weight;p.bank=p.bank*(1-weight)+bank*weight;
  }
  const density=separation>0?4:2;
  finishPoints(filtered,false);const meta={...layout.meta};for(const key of ['straightStartIndex','exitStartIndex','exitArcEndIndex','exitApproachStartIndex','entryArcStartIndex','buildingStartIndex','buildingEndIndex'])if(meta[key]!==undefined)meta[key]*=density;return {points:densifyDriving(filtered,density,false),meta};
}
export function compileTrack(reference,features,ground,options={}){
  if(reference.format!=='red-bull-ring-reference-v1'||features.sourceSha256!==reference.sourceSha256||ground.sourceSha256!==reference.sourceSha256)throw Error('Mismatched Red Bull Ring sources');
  const settings={maxParts:9999,layoutScale:1.5,pitWidth:12,roadMaxLength:80,roadTolerance:.035,roadPlaneTolerance:.006,roadMaxTurnDegrees:1.5,roadMaxPitchChangeDegrees:.08,roadThickness:.5,jointMaxStep:.008,heightSigma:100,bankSigma:40,worldGradientSigma:150,curbWidth:3.2,curbHeight:.12,groundClearance:.25,...options};
  const sourceReferenceSha=sha(JSON.stringify(reference));
  reference=scaleReference(reference,settings.layoutScale);ground=scaleGround(ground,settings.layoutScale);features=structuredClone(features);
  for(const p of features.pitPoints)p.pos=p.pos.map(v=>v*settings.layoutScale);
  for(const r of features.records){r.index*=2;for(const b of r.bands){b.inner*=settings.layoutScale;b.outer*=settings.layoutScale;}}
  let points=smoothDrivingPoints(reference.points,{heightSigma:settings.heightSigma*settings.layoutScale,bankSigma:settings.bankSigma*settings.layoutScale});
  const worldGradientSmoothing=smoothWorldSurface(points,settings.worldGradientSigma*settings.layoutScale,settings.layoutScale);
  points=densifyDriving(points,2);
  for(const p of points){const factor=Math.max(1,40/(p.wr+p.wl));p.wr*=factor;p.wl*=factor;}
  const revisedPit=pitRoute(features.pitPoints,points,reference.points,settings.pitWidth,features.pitRoute,settings.pitSeparation??0,settings.pitSingleTurns??false),pit=revisedPit.points;
  const parts=[],groups={},push=(group,p)=>{(groups[group]??=[]).push(parts.length);parts.push(p);return parts.length-1;};
  const initial=adaptiveSegments(points,settings.roadMaxLength,settings.roadTolerance,settings.roadMaxTurnDegrees*Math.PI/180,settings.roadPlaneTolerance,settings.roadMaxPitchChangeDegrees*Math.PI/180,1.25);
  const fitted=refineRoad(points,initial,{thickness:settings.roadThickness,maxStep:settings.jointMaxStep});
  const roadSegments=fitted.spans.map((s,i)=>({...s,index:push('asphalt',fitted.parts[i])}));
  const pitInitial=settings.pitSingleTurns?adaptiveSegments(pit,80,.06,2*Math.PI/180,.004,.06*Math.PI/180):adaptiveSegments(pit,96,.06,2*Math.PI/180,.014,.13*Math.PI/180),pitFit=refineRoad(pit,pitInitial,{closed:false,thickness:settings.roadThickness,maxStep:settings.jointMaxStep});
  const offset=(p,d)=>add(p.pos,mul(p.right,d/Math.hypot(p.right[0],p.right[2])));
  const paint=(line,group)=>{const spans=[];for(const [a,b] of adaptiveSegments(line,128,.12,4*Math.PI/180,.012)){const part=fittedSlab(line,a,b,{width:.36,thickness:.04,color:4,lift:.012});spans.push({index:push(group,part),start:a,end:b});}return spans;};
  const edgeMarkingSegments=[];
  for(const side of [-1,1])edgeMarkingSegments.push(...paint(points.map(p=>({...p,pos:offset(p,side*((side>0?p.wr:p.wl)-.45)),wr:.18,wl:.18})),'edgeMarkings'));
  const kerbSpans=[],kerbRuns=[],runoffSpans=[];
  if(features.tidy){const kerbs=addContinuousKerbs(points,features.tidy.kerbRuns,pitFit.parts,settings,push);kerbSpans.push(...kerbs.spans);kerbRuns.push(...kerbs.runs);}
  for(const side of [-1,1]){
    const records=features.records.filter(r=>r.side===side),step=8;
    for(let i=0;!features.tidy&&i<records.length;){
      const first=records[i];if(!first.kerb){i++;continue;}let end=i+1;while(end<records.length&&records[end].kerb)end++;
      const start=first.index,last=Math.min(points.length-1,records[end-1].index+step);
      const line=points.slice(start,last+1).map(p=>({...p,pos:offset(p,side*((side>0?p.wr:p.wl)+settings.curbWidth/2)),wr:settings.curbWidth/2,wl:settings.curbWidth/2}));
      const arc=[0];for(let k=1;k<line.length;k++)arc.push(arc.at(-1)+Math.hypot(...sub(line[k].pos,line[k-1].pos)));
      for(let k=0;k<line.length;k++){
        const f=Math.min(1,arc[k]/6,(arc.at(-1)-arc[k])/6),rise=side*settings.curbHeight/settings.curbWidth*Math.max(0,f),p=line[k],h=Math.hypot(p.right[0],p.right[2]);
        p.pos[1]+=settings.curbHeight/2*Math.max(0,f);p.bank+=rise;p.right=unit([p.right[0]/h,p.right[1]/h+rise,p.right[2]/h]);
      }
      finishPoints(line,false);
      for(let run=i;run<end;){
        let next=run+1;while(next<end&&records[next].kerb===records[run].kerb)next++;
        const a0=records[run].index-start,b0=Math.min(line.length-1,records[next-1].index+step-start),color=records[run].kerb==='red'?9:4;
        for(const [a,b] of adaptiveSegments(line.slice(a0,b0+1),28,.12,4*Math.PI/180,.014)){
          const part=fittedSlab(line,a0+a,a0+b,{width:settings.curbWidth,thickness:.12,color});
          if(pitFit.parts.some(p=>overlapVertices(part,p).length))continue;
          kerbSpans.push({index:push('curbs',part),side,start:start+a0+a,end:start+a0+b});
        }
        run=next;
      }
      kerbRuns.push({side,start,end:last,arc});i=end;
    }
    // Track each radial surface band through successive cross-sections and
    // merge small texture fragments before converting it into broad strips.
    const tidy=records.map(r=>({...r,bands:r.bands.map(b=>({...b,style:b.style==='runoff'?'asphalt':b.style})).filter(b=>b.outer-b.inner>=6)}));
    const used=new Set();
    for(let i=0;i<tidy.length;i++)for(let slot=0;slot<tidy[i].bands.length;slot++){
      const key=`${i}:${slot}`;if(used.has(key))continue;
      const first=tidy[i].bands[slot],matches=[{record:tidy[i],band:first}];used.add(key);let last=i;
      for(let j=i+1;j<tidy.length;j++){
        const r=tidy[j],previous=matches.at(-1).band,index=r.bands.findIndex((b,k)=>!used.has(`${j}:${k}`)&&b.style===first.style&&Math.abs(b.inner-previous.inner)<=5&&Math.abs(b.outer-previous.outer)<=5);
        if(index<0||points[r.index].s-points[tidy[i].index].s>160)break;
        matches.push({record:r,band:r.bands[index]});used.add(`${j}:${index}`);last=j;
      }
      const start=tidy[i].index,end=Math.min(points.length-1,tidy[last].index+step),inner=matches.reduce((s,m)=>s+m.band.inner,0)/matches.length,outer=matches.reduce((s,m)=>s+m.band.outer,0)/matches.length,width=outer-inner;
      if(features.tidy&&(first.style!=='sand'||start<features.tidy.sandKeepRange[0]*2||end>features.tidy.sandKeepRange[1]*2))continue;
      if(width<5)continue;
      // Isolated atlas fragments are merged into the surrounding ground.
      if(first.style!=='sand'&&(matches.length<6||points[end].s-points[start].s<35))continue;
      const line=points.slice(start,end+1).map(p=>({...p,pos:offset(p,side*((side>0?p.wr:p.wl)+(inner+outer)/2)),wr:width/2,wl:width/2})),color={sand:8,red:9,white:4,asphalt:1}[first.style]??3,group=first.style==='sand'?'sand':'runoff';
      for(const [a,b] of adaptiveSegments(line,120,.35,6*Math.PI/180,.08))runoffSpans.push({index:push(group,fittedSlab(line,a,b,{width,thickness:.12,color,lift:-.04,guard:.03})),side,start:start+a,end:start+b});
    }
  }
  const aprons=features.tidy?addCornerAprons(points,features.tidy.aprons,settings.layoutScale,push):null;
  if(aprons)runoffSpans.push(...aprons.spans);
  const pitSegments=pitFit.spans.map((s,i)=>({...s,index:push('pitLane',pitFit.parts[i])}));
  const pitMarkingSegments=[];for(const side of [-1,1])pitMarkingSegments.push(...paint(pit.map(p=>({...p,pos:offset(p,side*(settings.pitWidth/2-.4)),wr:.18,wl:.18})),'pitMarkings'));
  const finish=makeSlab(points[0],points[2],points[0].wr+points[0].wl,0,.04,4,.012,.003);finish[5]=1.2;push('startFinish',finish);
  const paved={parts:[...groups.asphalt,...groups.pitLane].map(i=>parts[i])},ancillary=[...(groups.runoff??[]),...(groups.sand??[])];
  const runoffFit=constrainSurfaces(paved,ancillary.map(i=>parts[i]),.006,false);
  ancillary.forEach((id,i)=>parts[id]=runoffFit.parts[i]);
  const curbIds=groups.curbs??[],curbFit=fitKerbsToLane(paved.parts,curbIds.map(i=>parts[i]),points);
  curbIds.forEach((id,i)=>parts[id]=curbFit.parts[i]);
  const grassHeights=ground.heights.filter(h=>h!==null).sort((a,b)=>a-b),datum=grassHeights[Math.floor(grassHeights.length*.002)]-2;
  for(const p of parts)p[1]=round(p[1]-datum);for(const p of points)p.pos[1]-=datum;for(const p of pit)p.pos[1]-=datum;
  const corners=parts.flatMap(boxCorners),bounds={min:[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(p=>p[k])))};
  const anchor=pit[Math.floor(pit.length*.34)].pos;
  const meta={format:'red-bull-ring-elevated-v1',variant:'terrain',name:'Red Bull Ring',gameTarget:{name:'Jakarta',placeId:14005966837,saveObjectLimit:null},scope:'Elevated Spielberg circuit, pit lane, low kerbs, edge lines, gravel and runoff; scenery excluded',partCount:parts.length,palette,planBounds:bounds,width:round(bounds.max[0]-bounds.min[0]),depth:round(bounds.max[2]-bounds.min[2]),sourceSha256:reference.sourceSha256,centerlineSha256:reference.centerlineSha256,referenceSha256:sourceReferenceSha,layoutScale:settings.layoutScale,lapLengthMetres:reference.lapLengthMetres,lapLengthStuds:points.at(-1).s,studsPerMetre:reference.studsPerMetre,pitRoute:features.pitRoute,groundLift:-datum,retainedHeightRange:[Math.min(...points.map(p=>p.pos[1])),Math.max(...points.map(p=>p.pos[1]))],settings,groups,groupCounts:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),roadSegments,edgeMarkingSegments,kerbSpans,kerbRuns,runoffSpans,pitSegments,pitPoints:pit,pitLane:{widthStuds:settings.pitWidth,lengthStuds:pit.at(-1).s},placementAnchor:{name:'pit-entry',position:[anchor[0],0,anchor[2]],roadHeight:anchor[1]},outputScale:2*settings.layoutScale,catalogRoles:[{name:'Others75',appearance:'color',partIndices:[...groups.asphalt,...groups.pitLane],preserveTemplateMaterial:true,color:[65,66,66]}],nonCollidingPartIndices:[...(groups.edgeMarkings??[]),...(groups.pitMarkings??[]),...(groups.startFinish??[])],limitations:['Road pieces are fitted rectangular blocks with small essential overlaps at bends.','The source pit route is smoothed and its connection is adapted to the widened racing road.','Kerbs and runoff use model material/colour cross-sections, with tiny texture fragments merged.','Stored byte/object limits cannot be inferred from the client export.']};
  meta.pitLayout=revisedPit.meta;
  if(features.tidy)meta.surfaceTidying={kerbRuns:features.tidy.kerbRuns,cornerAprons:aprons.patches,sandKeepRange:features.tidy.sandKeepRange,kerbSurfaceFit:{method:'nominal-lane-overlap',modified:curbFit.modified,maximumLoweringStuds:curbFit.maximumLowering}};
  const plan={meta,parts,centerline:points.map(p=>[...p.pos,p.wr,p.wl,p.s,...p.normal])};
  meta.surfaceSmoothing={before:profileMetrics(reference.points),after:profileMetrics(points),worldGradientSmoothing,roadJoins:auditJoins(plan,roadSegments,true),pitJoins:auditJoins(plan,pitSegments,false),roadCount:groups.asphalt.length,medianRoadLengthStuds:groups.asphalt.map(i=>parts[i][5]).sort((a,b)=>a-b)[Math.floor(groups.asphalt.length/2)],overlapGuardStuds:.006};
  if(parts.length>settings.maxParts)throw Error('Track alone exceeds the part budget: '+parts.length);
  return plan;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const read=name=>JSON.parse(fs.readFileSync(path.join(here,'source',name))),plan=compileTrack(read('red-bull-ring-reference.json'),read('red-bull-ring-features.json'),read('ground-reference.json'));
  fs.writeFileSync(path.join(here,'red-bull-ring-track-plan.json'),JSON.stringify(plan));console.log(JSON.stringify({parts:plan.parts.length,groups:plan.meta.groupCounts,smoothing:plan.meta.surfaceSmoothing},null,2));
}
