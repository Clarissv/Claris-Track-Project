import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {add,sub,mul,dot,unit} from './track-geometry.mjs';
import {round,catmull,boxBasis,boxCorners,makeSlab,adaptiveSegments} from './geometry.mjs';
import {palette as sourcePalette} from './mesh-geometry.mjs';
import {sha,finishPoints} from './reference.mjs';
import {writeArtifacts} from './render-ribbons.mjs';
import {packageRuntime} from './package-ribbons.mjs';
import {makeRelease} from './make-github-release.mjs';
import {smoothDrivingPoints,profileMetrics} from './smooth-surface.mjs';
import {auditJoins,collisionSampler} from './surface-audit.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const smoothstep=t=>t*t*(3-2*t);
export function offsetPoint(p,d) {return add(p.pos,mul(p.right,d/Math.hypot(p.right[0],p.right[2])));}
export function topAt(part,x,z) {return part[1]+part[11]*part[4]/2-(part[10]*(x-part[0])+part[12]*(z-part[2]))/part[11];}
function nearestOnLine(points) {
  const cells=new Map(),size=128;
  points.slice(0,-1).forEach((p,i)=>{const key=`${Math.floor(p.pos[0]/size)}:${Math.floor(p.pos[2]/size)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);});
  return position=>{
    const x=Math.floor(position[0]/size),z=Math.floor(position[2]/size);let nearest=0,best=Infinity;
    const consider=i=>{const p=points[i].pos,d=(p[0]-position[0])**2+(p[2]-position[2])**2;if(d<best){best=d;nearest=i;}};
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const i of cells.get(`${x+dx}:${z+dz}`)??[])consider(i);
    if(best>size**2)for(let i=0;i<points.length-1;i++)consider(i);
    const count=points.length-1;let result=null;
    for(const start of [(nearest-1+count)%count,nearest]) {
      const a=points[start],b=points[start+1],dx=b.pos[0]-a.pos[0],dz=b.pos[2]-a.pos[2],t=Math.max(0,Math.min(1,((position[0]-a.pos[0])*dx+(position[2]-a.pos[2])*dz)/(dx*dx+dz*dz)));
      const pos=a.pos.map((v,k)=>v+(b.pos[k]-v)*t),d=(pos[0]-position[0])**2+(pos[2]-position[2])**2;
      if(!result||d<result.d)result={d,index:nearest,point:{...a,pos,normal:unit(a.normal.map((v,k)=>v+(b.normal[k]-v)*t)),wr:a.wr+(b.wr-a.wr)*t,wl:a.wl+(b.wl-a.wl)*t},distance:Math.sqrt(d)};
    }
    return result;
  };
}
function alignPitOverlap(pit,main,width) {
  const nearest=nearestOnLine(main);
  for(let i=0;i<pit.length;i++) {
    const p=pit[i],{point:q,distance}=nearest(p.pos),n=q.normal;
    // Both entire rectangular widths can overlap until their centres are
    // farther apart than the combined half-widths. Keep one driving plane
    // throughout that area, then blend back outside it.
    const shared=Math.max(q.wr,q.wl)+width/2+4,w=1-smoothstep(Math.max(0,Math.min(1,(distance-shared)/40)));
    if(!w)continue;
    const height=q.pos[1]-(n[0]*(p.pos[0]-q.pos[0])+n[2]*(p.pos[2]-q.pos[2]))/n[1];
    const a=pit[Math.max(0,i-1)].pos,b=pit[Math.min(pit.length-1,i+1)].pos,dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),bank=-(n[0]*dz-n[2]*dx)/(n[1]*length);
    p.pos[1]=p.pos[1]*(1-w)+height*w;p.bank=p.bank*(1-w)+bank*w;
  }
  finishPoints(pit,false);
}
function smoothPitConnections(source,main) {
  const core=source.filter(p=>p.s>=140&&p.s<=source.at(-1).s-140),count=main.length-1,lap=main.at(-1).s;
  const nearest=p=>main.slice(0,count).reduce((best,q)=>Math.hypot(q.pos[0]-p.pos[0],q.pos[2]-p.pos[2])<Math.hypot(best.pos[0]-p.pos[0],best.pos[2]-p.pos[2])?q:best,main[0]);
  const shift=(p,d)=>{const s=(p.s+d+lap)%lap;return main.slice(0,count).reduce((best,q)=>Math.abs(q.s-s)<Math.abs(best.s-s)?q:best,main[0]);};
  const tangent=p=>unit([p.right[2]*-p.normal[1]+p.right[1]*p.normal[2],p.right[2]*p.normal[0]-p.right[0]*p.normal[2],p.right[0]*p.normal[1]-p.right[1]*p.normal[0]]);
  const entry=shift(nearest(core[0]),-220),exit=shift(nearest(core.at(-1)),220);
  const curve=(a,b)=>{const distance=Math.hypot(...sub(b.pos,a.pos)),handle=distance*.36,c1=add(a.pos,mul(tangent(a),handle)),c2=sub(b.pos,mul(tangent(b),handle)),n=Math.ceil(distance/.5),result=[];for(let i=0;i<n;i++){const t=i/n,u=1-t,f=smoothstep(t),pos=a.pos.map((v,k)=>v*u**3+3*c1[k]*u*u*t+3*c2[k]*u*t*t+b.pos[k]*t**3);result.push({...a,pos,wr:source[0].wr,wl:source[0].wl,bank:a.bank+(b.bank-a.bank)*f});}return result;};
  const result=[...curve(entry,core[0]),...structuredClone(core),...curve(core.at(-1),exit).slice(1),{...exit,pos:[...exit.pos],wr:source[0].wr,wl:source[0].wl}];
  finishPoints(result,false);return result;
}
export function compileMonza(reference,trace,options={}) {
  if(reference.format!=='monza-reference-v1'||trace.format!=='monza-surfaces-v1'||trace.referenceSha256!==sha(JSON.stringify(reference))||trace.sourceSha256!==reference.sourceSha256)throw Error('Mismatched Monza surface reference');
  const settings={maxParts:11000,outputScale:2,roadWidthMultiplier:1.25,pitWidthMultiplier:1.4,minimumRoadWidth:40,heightSmoothingStuds:80,bankSmoothingStuds:100,roadMaxLength:96,roadTolerance:.008,roadPlaneTolerance:.004,roadMaxPitchChangeDegrees:.075,roadMaxTurnDegrees:.75,roadThickness:1,paintHeight:.025,markingMaxLength:96,markingTolerance:.08,markingPlaneTolerance:.005,curbWidth:3.2,curbProfile:[0,.12],curbThickness:.12,curbTaperLength:12,curbMaxLength:16,curbPlaneTolerance:.003,runoffMaxLength:128,runoffPlaneTolerance:.06,groundClearance:.25,...options};
  if(settings.maxParts>11000)throw Error('Monza maximum budget is 11000');
  const smoothing={heightSigma:settings.heightSmoothingStuds,bankSigma:settings.bankSmoothingStuds};
  const points=smoothDrivingPoints(reference.points,smoothing),parts=[],groups={},roadSegments=[],edgeMarkingSegments=[],kerbSpans=[],kerbRuns=[],runoffSpans=[],pitSegments=[];
  for(const p of points){const factor=Math.max(1,settings.minimumRoadWidth/(p.wr+p.wl));p.wr*=factor;p.wl*=factor;}
  const push=(group,p)=>{(groups[group]??=[]).push(parts.length);parts.push(p);return parts.length-1;};
  const cover=(slab,line,a,b,width=false)=>{const basis=boxBasis(slab);for(let i=a;i<=b;i++)for(const d of width?[-line[i].wl,line[i].wr]:[0]){const delta=sub(offsetPoint(line[i],d),slab.slice(0,3));slab[5]=Math.max(slab[5],2*Math.abs(dot(delta,basis.back))+.02);if(width)slab[3]=Math.max(slab[3],2*Math.abs(dot(delta,basis.right))+.01);}slab[3]=round(slab[3]);slab[5]=round(slab[5]);return slab;};
  for(const [a,b] of adaptiveSegments(points,settings.roadMaxLength,settings.roadTolerance,settings.roadMaxTurnDegrees*Math.PI/180,settings.roadPlaneTolerance,settings.roadMaxPitchChangeDegrees*Math.PI/180)) {
    const wr=Math.max(...points.slice(a,b+1).map(p=>p.wr)),wl=Math.max(...points.slice(a,b+1).map(p=>p.wl));
    const index=push('asphalt',cover(makeSlab(points[a],points[b],wr+wl,(wr-wl)/2,settings.roadThickness,1,0,.02),points,a,b,true));roadSegments.push({index,start:a,end:b});
  }
  const paint=(line,group,spans)=>{for(const [a,b] of adaptiveSegments(line,settings.markingMaxLength,settings.markingTolerance,3*Math.PI/180,settings.markingPlaneTolerance)){const slab=cover(makeSlab(line[a],line[b],.36,0,.04,4,settings.paintHeight,.02),line,a,b);if(slab[11]<.98)continue;const index=push(group,slab);spans.push({index,start:a,end:b});}};
  for(const side of [-1,1])paint(points.map(p=>({...p,pos:offsetPoint(p,side*((side>0?p.wr:p.wl)-.5)),wr:.18,wl:.18})),'edgeMarkings',edgeMarkingSegments);
  for(const zone of trace.zones) {
    const {start,end,side}=zone;
    const line=points.slice(start,end+1).map(p=>({...p,pos:offsetPoint(p,side*((side>0?p.wr:p.wl)+settings.curbWidth/2)),wr:settings.curbWidth/2,wl:settings.curbWidth/2}));
    let arc=0;const arcs=[0];for(let i=1;i<line.length;i++){arc+=Math.hypot(...sub(line[i].pos,line[i-1].pos));arcs.push(arc);}
    for(let i=0;i<line.length;i++){const factor=smoothstep(Math.max(0,Math.min(1,arcs[i]/settings.curbTaperLength,(arc-arcs[i])/settings.curbTaperLength))),p=points[start+i],r=p.right,h=Math.hypot(r[0],r[2]),rise=side*.12/settings.curbWidth*factor;line[i].pos[1]+=.06*factor;line[i].bank+=rise;line[i].factor=factor;line[i].normal=unit([p.normal[0]-rise*r[0]/h*p.normal[1],p.normal[1],p.normal[2]-rise*r[2]/h*p.normal[1]]);line[i].right=unit([r[0]/h,r[1]/h+rise,r[2]/h]);}
    kerbRuns.push({side,start,end,referenceZone:zone.id,arc:arcs});
    for(let first=0;first<line.length-1;) {
      const color=zone.samples[first][3];let last=first+1;while(last<line.length-1&&zone.samples[last][3]===color)last++;
      for(const [a,b] of adaptiveSegments(line.slice(first,last+1),settings.curbMaxLength,.04,3*Math.PI/180,settings.curbPlaneTolerance)) {
        const index=push('curbs',cover(makeSlab(line[first+a],line[first+b],settings.curbWidth,0,settings.curbThickness,color,0,.015),line,first+a,first+b,true));kerbSpans.push({index,side,start:start+first+a,end:start+first+b,referenceZone:zone.id,color});
      }
      first=last;
    }
  }
  // Pair consecutive radial bands, then merge only when their driving-side
  // planes and outer footprint still fit the same broad rectangular section.
  const chains=[],tails=new Map();
  for(const profile of [...trace.runoff.profiles].sort((a,b)=>a.start-b.start||a.side-b.side||a.offset-b.offset)) {
    const key=[profile.side,profile.color,profile.start].join(':'),candidates=tails.get(key)??[];
    const chain=candidates.find(c=>Math.abs(c.at(-1).offset-profile.offset)<8&&Math.abs(c.at(-1).width-profile.width)<12)??[];
    if(!chain.length)chains.push(chain);else candidates.splice(candidates.indexOf(chain),1);chain.push(profile);
    const target=[profile.side,profile.color,profile.end].join(':');if(!tails.has(target))tails.set(target,[]);tails.get(target).push(chain);
  }
  for(const chain of chains)for(let i=0;i<chain.length;) {
    const first=i;let last=i;
    const build=end=>{const run=chain.slice(first,end+1),start=run[0].start,stop=run.at(-1).end,side=run[0].side,color=run[0].color,offset=run.reduce((s,p)=>s+p.offset,0)/run.length,outer=run.reduce((s,p)=>s+p.offset+p.width,0)/run.length,width=outer-offset;
      // Derive orientation from the driving ribbon, then translate within its
      // plane. An offset path can fold at a chicane and must not define a steep
      // or nearly vertical runoff slab.
      const slab=makeSlab(points[start],points[stop],width,0,.4,color,-.08,.03),basis=boxBasis(slab),edge=side>0?(points[start].wr+points[stop].wr)/2:(points[start].wl+points[stop].wl)/2,shift=side*(edge+offset+width/2)/Math.hypot(basis.right[0],basis.right[2]);
      for(let k=0;k<3;k++)slab[k]=round(slab[k]+basis.right[k]*shift);
      return {run,start,stop,side,color,offset,width,slab};};
    for(let end=first+1;end<chain.length;end++) {
      const candidate=build(end),{run,start,stop,side,slab}=candidate;
      if(points[stop].s-points[start].s>settings.runoffMaxLength||Math.max(...run.map(p=>p.width))-Math.min(...run.map(p=>p.width))>8||Math.max(...run.map(p=>p.offset))-Math.min(...run.map(p=>p.offset))>5||dot(points[start].right,points[stop].right)<Math.cos(2*Math.PI/180))break;
      let error=0;
      for(const profile of run)for(const k of [profile.start,profile.end])for(const d of [profile.offset,profile.offset+profile.width]){const p=offsetPoint(points[k],side*((side>0?points[k].wr:points[k].wl)+d));error=Math.max(error,Math.abs(topAt(slab,p[0],p[2])-(p[1]-.08)));}
      if(error>settings.runoffPlaneTolerance)break;last=end;
    }
    const {run,start,stop,side,color,offset,width,slab}=build(last),basis=boxBasis(slab);
    for(const profile of run)for(const k of [profile.start,profile.end])for(const d of [profile.offset,profile.offset+profile.width]){const q=offsetPoint(points[k],side*((side>0?points[k].wr:points[k].wl)+d)),delta=sub(q,slab.slice(0,3));slab[3]=Math.max(slab[3],2*Math.abs(dot(delta,basis.right))+.02);slab[5]=Math.max(slab[5],2*Math.abs(dot(delta,basis.back))+.02);}
    slab[3]=round(slab[3]);slab[5]=round(slab[5]);const index=push(color===8?'sand':'runoff',slab);runoffSpans.push({index,start,end:stop,side,color,offset,width,profileCount:run.length});i=last+1;
  }
  // Carry the softened local terrain into the pit core before connecting it.
  const adjustedPit=structuredClone(reference.pit.points);
  const nearestMain=nearestOnLine(points);
  for(const p of adjustedPit){const {index}=nearestMain(p.pos);p.pos[1]+=points[index].pos[1]-reference.points[index].pos[1];}
  finishPoints(adjustedPit,false);
  const sourcePit=smoothDrivingPoints(smoothPitConnections(adjustedPit,points),{...smoothing,closed:false}),pit=[];
  for(let i=0;i<sourcePit.length-1;i++)for(let j=0;j<2;j++)pit.push({...sourcePit[i],pos:catmull(sourcePit[Math.max(0,i-1)].pos,sourcePit[i].pos,sourcePit[i+1].pos,sourcePit[Math.min(sourcePit.length-1,i+2)].pos,j/2),bank:sourcePit[i].bank+(sourcePit[i+1].bank-sourcePit[i].bank)*j/2});
  pit.push(structuredClone(sourcePit.at(-1)));finishPoints(pit,false);
  alignPitOverlap(pit,points,reference.pit.width);
  for(const [a,b] of adaptiveSegments(pit,64,.008,1*Math.PI/180,settings.roadPlaneTolerance,settings.roadMaxPitchChangeDegrees*Math.PI/180)){const index=push('pitLane',cover(makeSlab(pit[a],pit[b],reference.pit.width,0,1,1,0,.02),pit,a,b,true));pitSegments.push({index,start:a,end:b});}
  for(const side of [-1,1])paint(pit.map(p=>({...p,pos:offsetPoint(p,side*(reference.pit.width/2-.5)),wr:.18,wl:.18})),'pitMarkings',[]);
  const start=points[0],next=points[1];
  const finish=makeSlab(start,next,start.wr+start.wl,0,.04,4,settings.paintHeight,.02);finish[5]=2;push('startFinish',finish);
  // Put the lowest represented surface above the user's existing platform.
  let datum=Infinity;for(const p of parts)for(const q of boxCorners(p).slice().filter((_,i)=>i&2))datum=Math.min(datum,q[1]);
  for(const p of parts)p[1]=round(p[1]-datum);for(const p of points)p.pos[1]-=datum;for(const p of pit)p.pos[1]-=datum;
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const p of parts){if(p.length!==13||p.some(v=>!Number.isFinite(v))||p.slice(3,6).some(v=>v<.001||v>2048))throw Error('Invalid Monza part');for(const q of boxCorners(p))for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],q[k]);bounds.max[k]=Math.max(bounds.max[k],q[k]);}}
  const groupCounts=Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length]));
  if(parts.length>settings.maxParts)throw Error('Monza exceeds budget: '+JSON.stringify({parts:parts.length,groups:groupCounts}));
  const palette=structuredClone(sourcePalette);palette[0].material='Concrete';palette.push({name:'green-painted-runoff',rgb:[55,118,62],material:'SmoothPlastic'});
  const anchor=reference.pit.anchor,anchorNearest=pit.reduce((best,p)=>Math.hypot(p.pos[0]-anchor[0],p.pos[2]-anchor[2])<Math.hypot(best.pos[0]-anchor[0],best.pos[2]-anchor[2])?p:best,pit[0]);
  const meta={format:'monza-elevated-v1',variant:'elevated',gameTarget:{name:'Jakarta',placeId:14005966837,saveObjectLimit:null},scope:'F1 circuit, pit lane, low smooth kerbs, markings, tidied astroturf and gravel; buildings and stands excluded',settings,sourceUrl:'https://github.com/TUMFTM/racetrack-database',sourceSha256:reference.sourceSha256,centerlineSha256:reference.centerlineSha256,referenceSha256:sha(JSON.stringify(reference)),surfaceTraceSha256:sha(JSON.stringify(trace)),modelFrame:reference.modelFrame,alignment:reference.alignment,studsPerMetre:reference.studsPerMetre,lapLengthMetres:reference.lapLengthMetres,lapLengthStuds:points.at(-1).s,partCount:parts.length,palette,planBounds:bounds,width:round(bounds.max[0]-bounds.min[0]),depth:round(bounds.max[2]-bounds.min[2]),outputScale:2,groupCounts,groups,roadSegments,edgeMarkingSegments,kerbSpans,kerbRuns,runoffSpans,pitSegments,pitPoints:pit,groundLift:-datum,retainedHeightRange:[Math.min(...points.map(p=>p.pos[1])),Math.max(...points.map(p=>p.pos[1]))],pitLane:{widthStuds:reference.pit.width,lengthStuds:pit.at(-1).s,layout:reference.pit.method+' Core retained; entry and exit replaced with gradual tangent curves.'},placementAnchor:{name:'pit-straight',label:'Pit straight standing position',position:[anchor[0],0,anchor[2]],roadHeight:anchorNearest.pos[1]},accessoryCleanup:{...trace.runoff.report,sourceStatistics:trace.statistics,parts:runoffSpans.length},catalogRoles:[{name:'Others75',appearance:'color',partIndices:[...groups.asphalt,...groups.pitLane]}],limitations:['Supplied GLB surface reconstruction, not a surveyed or exact 2026 layout; the AC extension is missing its base Monza files.','The display tilt is removed, source hills and smoothed banking retained; banking capped at 6 degrees.','Kerb placement and colours come from the model; the width and low ramp profile are adapted for driving.','Runoff is a simplified, tidied projection onto the widened circuit; small grass slivers are filled.','Rectangular pieces have small overlaps and angular perimeter edges. Surface joins and live vehicle handling still need in-game validation.','Standing anchor maps horizontal pit position; elevated pit pavement can be above your feet. Lowest surfaces clear the grass by 0.25 studs.']};
  meta.nonCollidingPartIndices=[...groups.edgeMarkings,...groups.pitMarkings,...groups.startFinish];
  meta.surfaceSmoothing={method:'Distance-weighted Gaussian, five-sigma support; height and banking only',heightSigmaStuds:smoothing.heightSigma,bankSigmaStuds:smoothing.bankSigma,before:profileMetrics(reference.points),after:profileMetrics(points),maxHeightAdjustmentStuds:Math.max(...points.map((p,i)=>Math.abs(p.pos[1]-meta.groundLift-reference.points[i].pos[1]))),markingsCollide:false};
  meta.surfaceSmoothing.roadJoins=auditJoins({parts},roadSegments,true);
  meta.surfaceSmoothing.pitJoins=auditJoins({parts},pitSegments);
  const visual=new Set(meta.nonCollidingPartIndices),collisionHeight=collisionSampler(parts.filter((_,i)=>!visual.has(i)));
  meta.surfaceSmoothing.tyrePathHeightErrorStuds={};
  for(const [name,line] of [['main',points],['pit',pit]]) {
    let maximum=0;
    for(const p of line)for(const d of [-12,-6,0,6,12]){const q=offsetPoint(p,d),height=collisionHeight(q[0],q[2]);if(!Number.isFinite(height))throw Error('Gap in '+name+' collision surface');maximum=Math.max(maximum,Math.abs(height-q[1]));}
    if(maximum>.02)throw Error('Raised collision surface in '+name+': '+maximum);
    meta.surfaceSmoothing.tyrePathHeightErrorStuds[name]=maximum;
  }
  meta.pitLane.layout+=' Overlapping pit connectors share the main road plane, then blend back over 40 studs of lateral separation.';
  meta.limitations[1]='The display tilt is removed. Broad hills and banking are retained, with distance-based height and banking smoothing for gentler crests.';
  return {meta,parts,centerline:points.map(p=>[...p.pos,p.wr,p.wl,p.s,...p.normal])};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const reference=JSON.parse(fs.readFileSync(path.join(here,'source/monza-reference.json'))),trace=JSON.parse(fs.readFileSync(path.join(here,'source/monza-surfaces.json'))),plan=compileMonza(reference,trace);
  fs.writeFileSync(path.join(here,'monza-plan.json'),JSON.stringify(plan));fs.writeFileSync(path.join(here,'generation-report.json'),JSON.stringify(plan.meta,null,2));writeArtifacts(here,plan);packageRuntime(here);const release=makeRelease(here);
  console.log(JSON.stringify({parts:plan.parts.length,groups:plan.meta.groupCounts,footprint:[plan.meta.width,plan.meta.depth],roadHeightRange:plan.meta.retainedHeightRange,release:release.version},null,2));
}
