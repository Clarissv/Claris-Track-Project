import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {add,sub,mul,dot,unit} from './track-geometry.mjs';
import {round,boxBasis,boxCorners,makeSlab,adaptiveSegments} from './geometry.mjs';
import {writeArtifacts} from './render-ribbons.mjs';
import {packageRuntime} from './package-ribbons.mjs';
import {makeRelease} from './make-github-release.mjs';
import {tidyRunoffProfiles,runoffHeight} from './tidy-runoff.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));

export function flatPoints(reference) {
  const count=reference.centerline.length-1;
  let distance=0;
  const points=reference.centerline.slice(0,count).map((p,i)=>{
    const prev=reference.centerline[(i-1+count)%count],next=reference.centerline[(i+1)%count];
    const along=unit([next[0]-prev[0],0,next[2]-prev[2]]);
    const a=unit([p[0]-prev[0],0,p[2]-prev[2]]),b=unit([next[0]-p[0],0,next[2]-p[2]]);
    const curvature=Math.atan2(a[0]*b[2]-a[2]*b[0],dot(a,b))/((Math.hypot(p[0]-prev[0],p[2]-prev[2])+Math.hypot(next[0]-p[0],next[2]-p[2]))/2);
    const point={pos:[p[0],0,p[2]],wr:p[3],wl:p[4],s:distance,normal:[0,1,0],right:[along[2],0,-along[0]],curvature};
    const following=reference.centerline[i+1];
    distance+=Math.hypot(following[0]-p[0],following[2]-p[2]);
    return point;
  });
  points.push({...points[0],pos:[...points[0].pos],s:distance});
  return points;
}
const smoothstep=t=>t*t*(3-2*t);
export function kerbFactor(s,start,end,taperLength) {
  return smoothstep(Math.max(0,Math.min(1,(s-start)/taperLength,(end-s)/taperLength)));
}
export function coverLongitudinal(slab,line,start,end) {
  const basis=boxBasis(slab);
  for(let i=start;i<=end;i++)slab[5]=Math.max(slab[5],2*Math.abs(dot(sub(line[i].pos,slab.slice(0,3)),basis.back))+.02);
  slab[5]=round(slab[5]);
  return slab;
}
export function placementAnchor(parts,groups) {
  const entry=parts[groups.pitLane[0]],concrete=groups.runoff.filter(i=>parts[i][6]===3&&parts[i][3]>=16&&parts[i][5]>=8);
  const nearest=concrete.sort((a,b)=>Math.hypot(parts[a][0]-entry[0],parts[a][2]-entry[2])-Math.hypot(parts[b][0]-entry[0],parts[b][2]-entry[2]))[0];
  if(nearest===undefined)throw Error('No concrete apron beside pit entry');
  const runoff=groups.runoff,seed=runoff.indexOf(nearest);
  const connected=(a,b)=>{
    const p=parts[a],q=parts[b];
    return q[6]===3&&Math.abs(p[3]-q[3])<2&&dot(boxBasis(p).right,boxBasis(q).right)>.98&&Math.hypot(p[0]-q[0],p[2]-q[2])<(p[5]+q[5])/2+1.5;
  };
  let first=seed,last=seed;
  while(first>0&&connected(runoff[first],runoff[first-1]))first--;
  while(last+1<runoff.length&&connected(runoff[last],runoff[last+1]))last++;
  let x=0,z=0,total=0;
  const partIndices=runoff.slice(first,last+1);
  for(const i of partIndices){const p=parts[i],weight=p[3]*p[5];x+=p[0]*weight;z+=p[2]*weight;total+=weight;}
  let point=[x/total,0,z/total];
  const lane=groups.pitLane.map(i=>parts[i]).sort((a,b)=>Math.hypot(a[0]-point[0],a[2]-point[2])-Math.hypot(b[0]-point[0],b[2]-point[2]))[0];
  const right=boxBasis(lane).right,side=dot(sub(point,lane.slice(0,3)),right)<0?-1:1;
  point=add(point,mul(right,side*12));
  return {name:'pit-entry-apron',label:'Grey apron beside pit entry',position:[round(point[0]),0,round(point[2])],partIndices,pitEntry:[entry[0],0,entry[2]]};
}
export function makeKerbSlab(a,b,width,rise,side,thickness,color) {
  const dx=b.pos[0]-a.pos[0],dz=b.pos[2]-a.pos[2],length=Math.hypot(dx,dz);
  const along=[dx/length,0,dz/length],right=[along[2],0,-along[0]],grade=(b.pos[1]-a.pos[1])/length;
  const intendedRight=unit(add(a.right,b.right)),alignment=dot(right,intendedRight);
  const bank=(side*rise/width*(a.factor+b.factor)/2-grade*dot(along,intendedRight))/alignment;
  const normal=unit([-right[0]*bank-along[0]*grade,1,-right[2]*bank-along[2]*grade]);
  return makeSlab({...a,normal},{...b,normal},width,0,thickness,color,0,.02);
}
function safeSideRuns(points,start,end,side,curbWidth) {
  const offset=p=>add(p.pos,mul(p.right,side*((side>0?p.wr:p.wl)+curbWidth/2)));
  const result=[];let runStart=null;
  for(let i=start;i<end;i++) {
    const delta=sub(offset(points[i+1]),offset(points[i])),source=sub(points[i+1].pos,points[i].pos);
    const stable=Math.hypot(...delta)>.02&&dot(unit(delta),unit(source))>.5;
    if(stable&&runStart===null)runStart=i;
    if(!stable&&runStart!==null){if(points[i].s-points[runStart].s>=2)result.push([runStart,i]);runStart=null;}
  }
  if(runStart!==null&&points[end].s-points[runStart].s>=2)result.push([runStart,end]);
  return result;
}
function coverKerb(slab,line,start,end,width,rise,side) {
  const basis=boxBasis(slab);
  for(let i=start;i<=end;i++)for(const offset of [-width/2,0,width/2]) {
    const q=add(line[i].pos,mul(line[i].right,offset));
    q[1]+=side*rise/width*line[i].factor*offset;
    slab[5]=Math.max(slab[5],2*Math.abs(dot(sub(q,slab.slice(0,3)),basis.back))+.02);
  }
  slab[5]=round(slab[5]);return slab;
}
function limitFactor(segments,line,maxVariation=.18) {
  const result=[];
  for(const [first,last] of segments) {
    let start=first,lo=line[first].factor,hi=lo;
    for(let i=first+1;i<=last;i++) {
      const nextLo=Math.min(lo,line[i].factor),nextHi=Math.max(hi,line[i].factor);
      if(nextHi-nextLo>maxVariation&&i>start+1) {
        result.push([start,i-1]);start=i-1;lo=line[start].factor;hi=lo;
      }
      lo=Math.min(lo,line[i].factor);hi=Math.max(hi,line[i].factor);
    }
    if(start<last)result.push([start,last]);
  }
  return result;
}
function compileRunoff(points,profiles,settings,push) {
  const chains=[],tails=new Map();
  for(const profile of [...profiles].sort((a,b)=>a.start-b.start||a.side-b.side||a.offset-b.offset)) {
    const {side,start,end,offset,width,color}=profile;
    if(![-1,1].includes(side)||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>=points.length||start>=end||![4,8,9,10,11].includes(color)||!Number.isFinite(offset)||!Number.isFinite(width)||width<2||offset<-.2)throw Error('Invalid tidied runoff profile');
    const key=[side,color,start].join(':'),candidates=tails.get(key)??[];
    const chain=candidates.sort((a,b)=>Math.abs(a.at(-1).offset-offset)+Math.abs(a.at(-1).width-width)-Math.abs(b.at(-1).offset-offset)-Math.abs(b.at(-1).width-width)).find(c=>Math.abs(c.at(-1).offset-offset)<=10&&Math.abs(c.at(-1).width-width)<=12);
    const next=chain??[];
    if(!chain)chains.push(next);else candidates.splice(candidates.indexOf(chain),1);
    next.push(profile);
    const target=[side,color,end].join(':');
    if(!tails.has(target))tails.set(target,[]);
    tails.get(target).push(next);
  }
  const spans=[];
  for(const chain of chains) {
    for(let i=0;i<chain.length;) {
      const first=i;let last=i+1,lo=chain[i].offset,hi=lo,minWidth=chain[i].width,maxWidth=minWidth;
      while(last<chain.length&&points[chain[last].end].s-points[chain[first].start].s<=settings.runoffMaxLength&&Math.max(hi,chain[last].offset)-Math.min(lo,chain[last].offset)<=settings.runoffWidthVariation&&Math.max(maxWidth,chain[last].width)-Math.min(minWidth,chain[last].width)<=settings.runoffWidthVariation&&dot(points[chain[first].start].right,points[chain[last].end].right)>Math.cos(settings.runoffMaxTurnDegrees*Math.PI/180)) {
        lo=Math.min(lo,chain[last].offset);hi=Math.max(hi,chain[last].offset);minWidth=Math.min(minWidth,chain[last].width);maxWidth=Math.max(maxWidth,chain[last].width);last++;
      }
      const run=chain.slice(first,last),{side,start,color}=run[0],end=run.at(-1).end,offset=run.reduce((n,p)=>n+p.offset,0)/run.length,outer=run.reduce((n,p)=>n+p.offset+p.width,0)/run.length,width=outer-offset;
      i=last;if(width<2)continue;
      let profileIndex=0;
      const line=points.slice(start,end+1).map((p,k)=>{
        while(profileIndex+1<run.length&&start+k>=run[profileIndex+1].start)profileIndex++;
        const section=run[profileIndex],shift=section.offset+section.width/2;
        return {...p,pos:add(p.pos,mul(p.right,side*((side>0?p.wr:p.wl)+shift))),wr:section.width/2,wl:section.width/2};
      });
      const delta=sub(line.at(-1).pos,line[0].pos),source=sub(points[end].pos,points[start].pos);
      if(Math.hypot(...delta)<.02||dot(unit(delta),unit(source))<.3)continue;
      const slab=makeSlab(line[0],line.at(-1),width,0,.4,color,runoffHeight(color),.04),basis=boxBasis(slab);
      for(const p of line)for(const across of [-p.wl,p.wr]) {
        const d=sub(add(p.pos,mul(p.right,across)),slab.slice(0,3));
        slab[3]=Math.max(slab[3],2*Math.abs(dot(d,basis.right))+.02);
        slab[5]=Math.max(slab[5],2*Math.abs(dot(d,basis.back))+.02);
      }
      slab[3]=round(slab[3]);slab[5]=round(slab[5]);
      const index=push(slab);spans.push({index,side,start,end,offset:round(offset),width:round(width),color,height:runoffHeight(color),profileCount:run.length});
    }
  }
  return spans;
}
export function compileFlat(reference,options={}) {
  const {kerbTrace:providedTrace,...settingOptions}=options;
  const settings={maxParts:11000,roadMaxLength:48,roadTolerance:.02,roadMaxTurnDegrees:.75,markingTolerance:.12,markingMaxLength:96,markingMaxTurnDegrees:3,curbWidth:3.2,curbMaxLength:16,curbTolerance:.06,curbMaxTurnDegrees:4,curbTaperLength:12,curbProfile:[0,.12],curbThickness:.12,roadThickness:1,paintHeight:.004,groundClearance:.25,runoffMaxLength:128,runoffWidthVariation:8,runoffMaxTurnDegrees:4.5,...settingOptions};
  for(const key of ['maxParts','roadMaxLength','roadTolerance','roadMaxTurnDegrees','markingTolerance','markingMaxLength','markingMaxTurnDegrees','curbWidth','curbMaxLength','curbTolerance','curbMaxTurnDegrees','curbTaperLength','curbThickness','roadThickness','paintHeight','groundClearance','runoffMaxLength','runoffWidthVariation','runoffMaxTurnDegrees'])if(!Number.isFinite(settings[key])||settings[key]<=0)throw Error('Invalid flat setting: '+key);
  if(settings.maxParts>11000||settings.curbProfile.length<2||settings.curbProfile[0]!==0||settings.curbProfile.some(h=>!Number.isFinite(h)||h<0||h>.2))throw Error('Invalid flat budget or low kerb profile');
  const points=flatPoints(reference),parts=[],groups={},roadSegments=[],edgeMarkingSegments=[],kerbSpans=[],kerbZones=[],kerbRuns=[],sideArcs={};
  const trace=providedTrace??JSON.parse(fs.readFileSync(path.join(here,'source/sepang-kerbs.json'),'utf8'));
  if(trace.format!=='sepang-kerb-trace-v1'||trace.sourceSha256!==reference.meta.sourceSha256||trace.centerlineSha256!==crypto.createHash('sha256').update(JSON.stringify(reference.centerline)).digest('hex')||!trace.zones?.length||!trace.runoff?.profiles?.length)throw Error('Missing or incompatible model surface trace');
  const traceSha256=crypto.createHash('sha256').update(JSON.stringify(trace)).digest('hex');
  for(const side of [-1,1]) {
    const offset=p=>add(p.pos,mul(p.right,side*((side>0?p.wr:p.wl)+settings.curbWidth/2)));
    const arc=[0];
    for(let i=1;i<points.length;i++)arc.push(arc.at(-1)+Math.hypot(...sub(offset(points[i]),offset(points[i-1]))));
    sideArcs[side]=arc;
  }
  const push=(group,part)=>{(groups[group]??=[]).push(parts.length);parts.push(part);return parts.length-1;};
  const segments=adaptiveSegments(points,settings.roadMaxLength,settings.roadTolerance,settings.roadMaxTurnDegrees*Math.PI/180);
  for(const [a,b] of segments) {
    const wr=Math.max(points[a].wr,points[b].wr),wl=Math.max(points[a].wl,points[b].wl);
    push('asphalt',makeSlab(points[a],points[b],wr+wl,(wr-wl)/2,settings.roadThickness,1,0,.04));
    roadSegments.push([a,b]);
  }
  for(const side of [-1,1]) {
    const line=points.map(p=>({...p,pos:add(p.pos,mul(p.right,side*((side>0?p.wr:p.wl)-.5))),wr:.18,wl:.18}));
    for(const [a,b] of adaptiveSegments(line,settings.markingMaxLength,settings.markingTolerance,settings.markingMaxTurnDegrees*Math.PI/180)) {
      push('edgeMarkings',coverLongitudinal(makeSlab(line[a],line[b],.36,0,.04,4,settings.paintHeight,.04),line,a,b));
      edgeMarkingSegments.push([side,a,b]);
    }
  }
  for(const zone of trace.zones) {
    const {start,end,side}=zone;
    if(![-1,1].includes(side)||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>=points.length||end<=start||zone.samples.length!==end-start||zone.samples.some((p,i)=>p[0]!==start+i||![4,9].includes(p[3])))throw Error('Invalid reference kerb zone');
    kerbZones.push([start,end,side,zone.id]);
    for(const [sideStart,sideEnd] of safeSideRuns(points,start,end,side,settings.curbWidth)) {
      const arc=sideArcs[side];
      kerbRuns.push({side,start:sideStart,end:sideEnd,referenceZone:zone.id,arc:arc.slice(sideStart,sideEnd+1).map(s=>s-arc[sideStart])});
      const bands=settings.curbProfile.length-1,bandWidth=settings.curbWidth/bands;
      for(let band=0;band<bands;band++) {
        const low=settings.curbProfile[band],high=settings.curbProfile[band+1],bandOffset=(band+.5)*bandWidth;
        const line=points.map((p,i)=>{
          const factor=kerbFactor(arc[i],arc[sideStart],arc[sideEnd],settings.curbTaperLength);
          const pos=add(p.pos,mul(p.right,side*((side>0?p.wr:p.wl)+bandOffset)));
          pos[1]=(low+high)/2*factor;
          return {...p,pos,wr:bandWidth/2,wl:bandWidth/2,factor};
        });
        for(let first=sideStart;first<sideEnd;) {
          const color=zone.samples[first-start][3];
          let last=first+1;
          while(last<sideEnd&&zone.samples[last-start][3]===color)last++;
          const run=line.slice(first,last+1);
          const spans=limitFactor(adaptiveSegments(run,settings.curbMaxLength,settings.curbTolerance,settings.curbMaxTurnDegrees*Math.PI/180,.002),run);
          for(const [a,b] of spans) {
            const index=push('curbs',coverKerb(makeKerbSlab(run[a],run[b],bandWidth,high-low,side,settings.curbThickness,color),run,a,b,bandWidth,high-low,side));
            kerbSpans.push({index,side,start:first+a,end:first+b,band,zoneStart:sideStart,zoneEnd:sideEnd,referenceZone:zone.id,color});
          }
          first=last;
        }
      }
    }
  }
  const auxiliary=[],auxGroups={};
  for(const [group,list] of Object.entries(reference.auxiliary)) {
    for(const old of list) {
      const p=[...old],horizontal=Math.hypot(old[7],old[9]);
      p[3]=round(old[3]*horizontal);p[7]=round(old[7]/horizontal);p[8]=0;p[9]=round(old[9]/horizontal);p[10]=0;p[11]=1;p[12]=0;
      p[1]=group==='pitWall'?p[4]/2:-p[4]/2+(['pitMarkings','startFinish'].includes(group)?settings.paintHeight:0);
      (auxGroups[group]??=[]).push(auxiliary.length);auxiliary.push(p);
    }
  }
  const apron=placementAnchor(auxiliary,auxGroups),apronSet=new Set(apron.partIndices),apronIndices=[];
  const tidiedRunoff=tidyRunoffProfiles(points,trace.runoff.profiles);
  const runoffSpans=compileRunoff(points,tidiedRunoff.profiles,settings,p=>push('runoff',p));
  for(const [group,indices] of Object.entries(auxGroups))for(const i of indices){if(group==='runoff'&&!apronSet.has(i))continue;const index=push(group,auxiliary[i]);if(group==='runoff')apronIndices.push(index);}
  for(const p of parts)if(p.length!==13||p.some(v=>!Number.isFinite(v))||p.slice(3,6).some(v=>v<.001||v>2048))throw Error('Invalid flat part');
  const corners=parts.flatMap(boxCorners),bounds={min:[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(p=>p[k])))};
  const groupCounts=Object.fromEntries(Object.entries(groups).map(([name,list])=>[name,list.length]));
  if(parts.length>settings.maxParts)throw Error('Flat plan exceeds budget: '+JSON.stringify({parts:parts.length,groups:groupCounts}));
  const meta={format:'sepang-flat-v1',variant:'flat',scope:'level circuit and pit lane, white lines, model-derived low kerbs and gravel/painted runoff, pit wall; no new grass, buildings or stands',settings:{...reference.meta.settings,...settings,flat:true,banking:false},sourceUrl:reference.meta.sourceUrl,sourceSha256:reference.meta.sourceSha256,sourcePlanSha256:reference.sourcePlanSha256,centerlineSha256:reference.meta.centerlineSha256,alignment:reference.meta.alignment,lapLengthMetres:reference.meta.lapLengthMetres,lapLengthStuds:points.at(-1).s,partCount:parts.length,palette:reference.meta.palette,planBounds:bounds,width:round(bounds.max[0]-bounds.min[0]),depth:round(bounds.max[2]-bounds.min[2]),outputScale:reference.meta.outputScale,groupCounts,groups,roadSegments,edgeMarkingSegments,kerbSpans,kerbZones,kerbRuns,runoffSpans,surfaceTrace:{file:'source/sepang-kerbs.json',sha256:traceSha256,kerbMaterials:trace.materialNames,runoffMaterials:trace.runoff.materialNames,statistics:trace.statistics},groundReference:'asphalt top; surface is 0.25 studs above the grass plate',groundLift:0,retainedHeightRange:[0,0],pitLane:reference.meta.pitLane,limitations:['Flat racing variant; source banking and elevation are intentionally absent.','Rectangular pieces retain small overlaps and angular outside edges; the asphalt top planes are level.','Kerb side, extent and stripe colour and runoff bands come from the supplied model, projected onto the widened CSV layout; no survey or recent imagery validation.','Kerbs retain a custom low ramp and tapered ends for driving; widths, profiles and runoff boundaries are approximations.','Paint is 0.004 studs above the road to remain visible.','Game server saving and live driving still need verification.']};
  meta.runoffSections=tidiedRunoff.sections;
  meta.accessoryCleanup={...tidiedRunoff.report,runoffParts:runoffSpans.length,runoffHeightRange:[-.008,-.004],method:'Close road-to-runoff and inter-band slivers, discard isolated thin fragments, smooth sampled boundaries and combine compatible sections into larger blocks. Runoff overlaps sit just below the asphalt and kerbs.'};
  meta.limitations.push('Runoff footprints are tidied adaptations of the model, including filled grass slivers; horizontal colour bands use 0.001-stud offsets between -0.008 and -0.004 to avoid flicker at overlaps.');
  meta.placementAnchor=placementAnchor(parts,{...groups,runoff:apronIndices});
  return {meta,parts,centerline:points.map(p=>[...p.pos,p.wr,p.wl,p.s,0,1,0])};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const reference=JSON.parse(fs.readFileSync(path.join(here,'source/sepang-reference.json'),'utf8'));
  const plan=compileFlat(reference);
  fs.writeFileSync(path.join(here,'sepang-plan.json'),JSON.stringify(plan));
  fs.writeFileSync(path.join(here,'generation-report.json'),JSON.stringify(plan.meta,null,2));
  writeArtifacts(here,plan);packageRuntime(here);
  const release=makeRelease(here);
  console.log(JSON.stringify({parts:plan.parts.length,groups:plan.meta.groupCounts,footprint:[plan.meta.width,plan.meta.depth],roadHeightRange:plan.meta.retainedHeightRange,kerbHeight:Math.max(...plan.meta.settings.curbProfile),release:release.version},null,2));
}
