import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseTrackCsv, loadRoadGrid, alignCenterline, transform2, KDTree, add, sub, mul, dot, cross, unit } from './track-geometry.mjs';
import { rasterize, classify, palette } from './mesh-geometry.mjs';
import { writeArtifacts } from './render-ribbons.mjs';
import { packageRuntime } from './package-ribbons.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export const round=n=>Math.round(n*10000)/10000;
export function catmull(a,b,c,d,t) {
  return b.map((v,k)=>0.5*((2*v)+(-a[k]+c[k])*t+(2*a[k]-5*v+4*c[k]-d[k])*t*t+(-a[k]+3*v-3*c[k]+d[k])*t*t*t));
}
export function boxBasis(p) {return {right:p.slice(7,10),up:p.slice(10,13),back:cross(p.slice(7,10),p.slice(10,13))};}
export function boxCorners(p) {
  const {right,up,back}=boxBasis(p);
  return Array.from({length:8},(_,i)=>[0,1,2].map(k=>p[k]+((i&1)?1:-1)*right[k]*p[3]/2+((i&2)?1:-1)*up[k]*p[4]/2+((i&4)?1:-1)*back[k]*p[5]/2));
}
export function scalePlan(plan,scale) {
  if(!Number.isFinite(scale)||scale<=0)throw Error('Output scale must be positive and finite');
  const result=structuredClone(plan);
  for(const p of result.parts) {
    for(let k=0;k<6;k++)p[k]*=scale;
    if(p.slice(3,6).some(v=>v<0.001||v>2048))throw Error('Scaled part exceeds game client size limits');
  }
  for(const p of result.centerline)for(let k=0;k<6;k++)p[k]*=scale;
  const meta=result.meta,corners=result.parts.flatMap(boxCorners);
  meta.planBounds={min:[0,1,2].map(k=>Math.min(...corners.map(v=>v[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(v=>v[k])))};
  meta.width=round(meta.planBounds.max[0]-meta.planBounds.min[0]);
  meta.depth=round(meta.planBounds.max[2]-meta.planBounds.min[2]);
  meta.outputScale=(meta.outputScale??1)*scale;
  meta.settings.outputScale=meta.outputScale;
  meta.lapLengthStuds*=scale;
  meta.groundLift*=scale;
  meta.retainedHeightRange=meta.retainedHeightRange.map(h=>h*scale);
  if(meta.pitLane){meta.pitLane.widthStuds*=scale;meta.pitLane.lengthStuds*=scale;}
  return result;
}
export function makeSlab(a,b,width,bias,thickness,color,height=0,overlap=0.12) {
  const normal=unit(add(a.normal,b.normal)),initialAlong=unit(sub(b.pos,a.pos)),initialRight=unit(cross(normal,initialAlong));
  const ar=a.right??initialRight,br=b.right??initialRight;
  const ap=add(a.pos,mul(ar,bias/Math.hypot(ar[0],ar[2]))),bp=add(b.pos,mul(br,bias/Math.hypot(br[0],br[2])));
  const axis=sub(bp,ap);
  let along=unit(axis),right=unit(cross(normal,along)),up=unit(cross(along,right)),length=Math.hypot(...axis);
  if(up[1]<0.5) {
    // An inside offset can briefly fold at a hairpin. Keep its tiny strip on
    // the road plane instead of turning the height difference into a vertical fin.
    const projected=sub(axis,mul(normal,dot(axis,normal)));
    length=Math.hypot(...projected);
    along=length>1e-6?unit(projected):initialAlong;
    right=unit(cross(normal,along));up=unit(cross(along,right));
  }
  const horizontal=Math.hypot(right[0],right[2]);
  const cosine=(ar[0]*br[0]+ar[2]*br[2])/(Math.hypot(ar[0],ar[2])*Math.hypot(br[0],br[2]));
  const turn=Math.acos(Math.max(-1,Math.min(1,cosine)));
  const join=width/horizontal*Math.tan(Math.min(turn,0.35)/2);
  const top=add(mul(add(ap,bp),0.5),mul(up,height));
  const center=sub(top,mul(up,thickness/2));
  return [...center,width/horizontal,thickness,length+overlap+join,color,...right,...up].map(round);
}
export function adaptiveSegments(points,maxLength=24,tolerance=0.07,maxTurn=Infinity,planeTolerance=tolerance) {
  const segments=[];let i=0;
  while(i<points.length-1) {
    let last=i+1;
    for(let j=i+2;j<points.length;j++) {
      const a=points[i],b=points[j],axis=sub(b.pos,a.pos),length=Math.hypot(...axis);
      if(length>maxLength)break;
      const direction=unit(axis);let error=0,widthVariation=0,bankVariation=0;
      if(a.right&&b.right) {
        const cosine=(a.right[0]*b.right[0]+a.right[2]*b.right[2])/(Math.hypot(a.right[0],a.right[2])*Math.hypot(b.right[0],b.right[2]));
        if(Math.acos(Math.max(-1,Math.min(1,cosine)))>maxTurn)break;
      }
      for(let k=i+1;k<=j;k++) {
        const offset=sub(points[k].pos,a.pos),projection=dot(offset,direction);
        error=Math.max(error,Math.hypot(...sub(offset,mul(direction,projection))));
        widthVariation=Math.max(widthVariation,Math.abs(points[k].wr-a.wr),Math.abs(points[k].wl-a.wl));
        bankVariation=Math.max(bankVariation,Math.hypot(...sub(points[k].normal,a.normal)));
      }
      if(error>tolerance||widthVariation>0.18||bankVariation>0.025)break;
      const wr=Math.max(a.wr,b.wr),wl=Math.max(a.wl,b.wl),candidate=makeSlab(a,b,wr+wl,(wr-wl)/2,.5,1),basis=boxBasis(candidate),top=add(candidate.slice(0,3),mul(basis.up,.25));
      let surfaceError=0;
      for(let k=i;k<=j;k++) {
        const p=points[k],right=p.right??basis.right,horizontal=Math.hypot(right[0],right[2]);
        for(const side of [-1,0,1]) {
          const offset=side*(side>0?p.wr:p.wl)/horizontal,sample=add(p.pos,mul(right,offset));
          surfaceError=Math.max(surfaceError,Math.abs(dot(sub(sample,top),basis.up)));
        }
      }
      if(surfaceError>planeTolerance)break;
      last=j;
    }
    segments.push([i,last]);i=last;
  }
  return segments;
}
function colorAt(grid,x,z) {
  const ix=Math.floor((x+grid.nx*grid.cell/2)/grid.cell),iz=Math.floor((z+grid.nz*grid.cell/2)/grid.cell);
  if(ix<0||iz<0||ix>=grid.nx||iz>=grid.nz)return null;
  const at=iz*grid.nx+ix;
  if(!Number.isFinite(grid.heights[at]))return null;
  return {color:classify(...grid.pixels.subarray(at*4,at*4+3)),role:grid.roles[at]};
}
export function compilePlan(csvText,meshSource,options={}) {
  const settings={width:1800,samplesPerCsv:16,curbWidth:1.6,curbStripe:4,plateThickness:0.5,maxParts:11000,outputScale:2,roadWidthMultiplier:1.25,pitWidthMultiplier:1.4,surfaceTolerance:0.01,maxTurnDegrees:0.75,markingTolerance:0.04,markingSurfaceTolerance:0.006,markingMaxLength:48,markingMaxTurnDegrees:2,...options};
  if(!Number.isFinite(settings.outputScale)||settings.outputScale<=0)throw Error('Output scale must be positive and finite');
  if(!Number.isFinite(settings.surfaceTolerance)||settings.surfaceTolerance<=0||!Number.isFinite(settings.maxTurnDegrees)||settings.maxTurnDegrees<=0)throw Error('Invalid surface or turn tolerance');
  if(['markingTolerance','markingSurfaceTolerance','markingMaxLength','markingMaxTurnDegrees'].some(key=>!Number.isFinite(settings[key])||settings[key]<=0))throw Error('Invalid edge marking settings');
  if(!Number.isFinite(settings.roadWidthMultiplier)||settings.roadWidthMultiplier<1||settings.roadWidthMultiplier>2||!Number.isFinite(settings.pitWidthMultiplier)||settings.pitWidthMultiplier<1||settings.pitWidthMultiplier>3)throw Error('Invalid road or pit width multiplier');
  if(!Number.isFinite(settings.width)||settings.width<=0||!Number.isInteger(settings.samplesPerCsv)||settings.samplesPerCsv<1||settings.samplesPerCsv>16||settings.curbWidth<=0||settings.curbStripe<=0||settings.plateThickness<=0||settings.maxParts<1||settings.maxParts>15000)throw Error('Invalid ribbon settings; budget must be at most 15000');
  const rows=parseTrackCsv(csvText),{glb,scene,road}=loadRoadGrid(meshSource,settings.width,2);
  const fit=alignCenterline(rows,road);
  const roadPoints=[];
  for(let i=0;i<road.heights.length;i++)if(Number.isFinite(road.heights[i]))roadPoints.push([(i%road.nx+0.5)*road.cell-road.nx*road.cell/2,(Math.floor(i/road.nx)+0.5)*road.cell-road.nz*road.cell/2,i]);
  const roadTree=new KDTree(roadPoints);
  const fullGrid=rasterize({...scene,primitives:scene.primitives.filter(p=>['road','runoff','curb','marking'].includes(p.role))},settings.width,2);
  const points=[],matches=[];
  for(let i=0;i<rows.length;i++)for(let j=0;j<settings.samplesPerCsv;j++) {
    const t=j/settings.samplesPerCsv,xy=catmull(rows[(i-1+rows.length)%rows.length],rows[i],rows[(i+1)%rows.length],rows[(i+2)%rows.length],t),[x,z]=transform2(xy,fit);
    const nearest=roadTree.nearest([x,z]),index=nearest.point[2],gx=road.slopesX[index],gz=road.slopesZ[index];
    const height=road.heights[index]+gx*(x-nearest.point[0])+gz*(z-nearest.point[1]);
    const wr=(rows[i][2]*(1-t)+rows[(i+1)%rows.length][2]*t)*fit.scale,wl=(rows[i][3]*(1-t)+rows[(i+1)%rows.length][3]*t)*fit.scale;
    points.push({pos:[x,height,z],gx,gz,wr:fit.reflection===1?wr:wl,wl:fit.reflection===1?wl:wr,sourceWr:fit.reflection===1?wr:wl,sourceWl:fit.reflection===1?wl:wr});
    matches.push(Math.sqrt(nearest.distance));
  }
  // Smooth sampled grades, without integer-height quantization. Retain the mesh's
  // hills while filtering texture/triangle seams. Banking is capped at 6 degrees.
  const original=points.map(p=>({...p,pos:[...p.pos]}));
  const smoothingScale=settings.samplesPerCsv/4,smoothingRadius=Math.round(6*smoothingScale);
  for(let i=0;i<points.length;i++) {
    let height=0,gx=0,gz=0,total=0;
    for(let k=-smoothingRadius;k<=smoothingRadius;k++){const w=Math.exp(-k*k/(12*smoothingScale*smoothingScale)),p=original[(i+k+points.length)%points.length];height+=p.pos[1]*w;gx+=p.gx*w;gz+=p.gz*w;total+=w;}
    points[i].pos[1]=height/total;points[i].normal=unit([-gx/total,1,-gz/total]);
  }
  let distance=0;
  for(let i=0;i<points.length;i++) {
    const prev=points[(i-1+points.length)%points.length],next=points[(i+1)%points.length];
    const along=unit(sub(next.pos,prev.pos)),flatRight=unit([along[2],0,-along[0]]),p=points[i];
    const bank=Math.max(-0.105,Math.min(0.105,-(p.normal[0]*flatRight[0]+p.normal[2]*flatRight[2])/p.normal[1]));
    const right=unit([flatRight[0],bank,flatRight[2]]);p.normal=unit(cross(along,right));
    const a=unit([p.pos[0]-prev.pos[0],p.pos[2]-prev.pos[2]]),b=unit([next.pos[0]-p.pos[0],next.pos[2]-p.pos[2]]);
    p.curvature=Math.atan2(a[0]*b[1]-a[1]*b[0],dot(a,b))/((Math.hypot(...sub(p.pos,prev.pos))+Math.hypot(...sub(next.pos,p.pos)))/2);
    p.right=unit(cross(p.normal,along));p.s=distance;
    distance+=Math.hypot(...sub(next.pos,p.pos));
  }
  // Filter the capped banking too: clamping raw mesh gradients can otherwise
  // produce abrupt roll changes even when centerline elevation is smooth.
  const banks=points.map(p=>p.right[1]/Math.hypot(p.right[0],p.right[2]));
  const bankRadius=Math.round(12*smoothingScale);
  for(let i=0;i<points.length;i++) {
    let bank=0,total=0;
    for(let k=-bankRadius;k<=bankRadius;k++){const w=Math.exp(-k*k/(48*smoothingScale*smoothingScale));bank+=banks[(i+k+points.length)%points.length]*w;total+=w;}
    const prev=points[(i-1+points.length)%points.length],next=points[(i+1)%points.length],along=unit(sub(next.pos,prev.pos)),flatRight=unit([along[2],0,-along[0]]);
    points[i].right=unit([flatRight[0],bank/total,flatRight[2]]);
    points[i].normal=unit(cross(along,points[i].right));
  }
  for(const p of points){p.wr*=settings.roadWidthMultiplier;p.wl*=settings.roadWidthMultiplier;}
  points.push({...points[0],pos:[...points[0].pos],s:distance});
  const parts=[],groups={};
  const push=(group,p)=>{(groups[group]??=[]).push(parts.length);parts.push(p);};
  const segments=adaptiveSegments(points,24,settings.surfaceTolerance,settings.maxTurnDegrees*Math.PI/180);
  for(const [i,j] of segments) {
    const a=points[i],b=points[j],wr=Math.max(a.wr,b.wr),wl=Math.max(a.wl,b.wl);
    // makeSlab already closes outside corners; do not add a second turn overlap.
    const overlap=0.02;
    push('asphalt',makeSlab(a,b,wr+wl,(wr-wl)/2,settings.plateThickness,1,0,overlap));
  }
  // Paint follows its own narrow offset path. Its horizontal approximation can
  // be looser than the full road while a separate, tighter plane tolerance keeps
  // it visible above the asphalt. Road/curb geometry is unchanged by this merge.
  const edgeMarkingSegments=[];
  for(const side of [-1,1]) {
    const line=points.map(p=>{
      const edge=side>0?p.wr:p.wl,bias=side*(edge-0.25)/Math.hypot(p.right[0],p.right[2]);
      return {...p,pos:add(p.pos,mul(p.right,bias)),wr:0.09,wl:0.09};
    });
    for(const [i,j] of adaptiveSegments(line,settings.markingMaxLength,settings.markingTolerance,settings.markingMaxTurnDegrees*Math.PI/180,settings.markingSurfaceTolerance)) {
      const slab=makeSlab(line[i],line[j],0.18,0,0.025,4,0.018,0.02),basis=boxBasis(slab);
      // Offset paths can briefly reverse at the inside of a tight bend. Include
      // their intermediate longitudinal extrema, not just the two endpoints.
      for(let k=i;k<=j;k++)slab[5]=Math.max(slab[5],2*Math.abs(dot(sub(line[k].pos,slab.slice(0,3)),basis.back))+0.02);
      slab[5]=round(slab[5]);
      push('edgeMarkings',slab);
      edgeMarkingSegments.push([side,i,j]);
    }
  }
  // Corner curbs are separate strips. Their route follows the centerline and
  // widths, rather than painting large road cells. Zones are inferred from bends.
  for(let i=0;i<points.length-1;) {
    const a=points[i];if(Math.abs(a.curvature)<0.0035){i++;continue;}
    const color=Math.floor((a.s+points[i+1].s)/2/settings.curbStripe)%2?4:9;
    let j=i+1;
    while(j+1<points.length&&points[j+1].s-a.s<5&&Math.abs(points[j].curvature)>=0.0035&&(Math.floor((points[j].s+points[j+1].s)/2/settings.curbStripe)%2?4:9)===color)j++;
    const run=points.slice(i,j+1);
    const curbRun=run.map(p=>({...p,wr:settings.curbWidth/2,wl:settings.curbWidth/2}));
    for(const [first,last] of adaptiveSegments(curbRun,3,settings.surfaceTolerance,2*Math.PI/180)) {
      const ca=run[first],cb=run[last];
      for(const side of [-1,1]) {
        const edge=side===1?(ca.wr+cb.wr)/2:(ca.wl+cb.wl)/2;
        push('curbs',makeSlab(ca,cb,settings.curbWidth,side*(edge+settings.curbWidth/2),0.25,color,0.10,0.02));
      }
    }
    i=j;
  }
  // Runoff strips come from the source's runoff groups or beige texture regions.
  // Grass is deliberately supplied by the user's existing platform.
  const runoffBySide={1:[],[-1]:[]};
  for(const [i,j] of segments) {
    const a=points[i],b=points[j],middle=points[Math.floor((i+j)/2)];
    for(const side of [-1,1]) {
      const edge=side===1?middle.wr:middle.wl,sourceEdge=side===1?middle.sourceWr:middle.sourceWl;let width=0,color=8;
      for(let offset=2;offset<=32;offset+=2) {
        const p=add(middle.pos,mul(middle.right,side*(sourceEdge+settings.curbWidth+offset))),sample=colorAt(fullGrid,p[0],p[2]);
        if(sample&&(sample.color===7||sample.role==='runoff')){width=offset;color=sample.color===7?8:3;}else if(width)break;
      }
      runoffBySide[side].push({a,b,edge,width,color});
    }
  }
  for(const side of [-1,1]) {
    const strips=runoffBySide[side];
    for(let i=0;i<strips.length;) {
      if(strips[i].width<=2){i++;continue;}
      let j=i+1;while(j<strips.length&&strips[j].width>2&&strips[j].color===strips[i].color)j++;
      const run=strips.slice(i,j),length=run.at(-1).b.s-run[0].a.s;
      if(length>=30) {
        const widths=run.map(p=>p.width).sort((a,b)=>a-b),width=widths[Math.floor(widths.length/2)];
        for(const p of run)push('runoff',makeSlab(p.a,p.b,width,side*(p.edge+settings.curbWidth+width/2),0.4,p.color,-0.08,0.15));
      }
      i=j;
    }
  }
  // The CSV starts on the main straight. Build an approximate pit lane alongside
  // its straight portion; entry/exit blend back into the road. No garage objects.
  const count=points.length-1;
  let start=0,end=0;
  while(start>-count/3&&Math.abs(points[(start-1+count)%count].curvature)<0.0015)start--;
  while(end<count/3&&Math.abs(points[(end+1)%count].curvature)<0.0015)end++;
  const straight=[];
  for(let i=start;i<=end;i++)straight.push(points[(i+count)%count]);
  let pitInfo=null;
  if(straight.length>30) {
    const coverage=side=>straight.reduce((sum,p)=>{const edge=side>0?p.sourceWr:p.sourceWl,q=add(p.pos,mul(p.right,side*(edge+12)));return sum+Number(colorAt(fullGrid,q[0],q[2])!==null);},0);
    const side=coverage(1)>coverage(-1)?1:-1,pitWidth=6*fit.scale*settings.pitWidthMultiplier,pit=[];
    let arc=0;for(let i=0;i<straight.length;i++){if(i)arc+=Math.hypot(...sub(straight[i].pos,straight[i-1].pos));pit.push({...straight[i],arc});}
    const length=arc;
    for(const p of pit) {
      const entry=Math.min(1,p.arc/70),exit=Math.min(1,(length-p.arc)/70),blend=Math.min(entry,exit),smooth=blend*blend*(3-2*blend),edge=side>0?p.wr:p.wl;
      p.offset=side*(edge+pitWidth/2+6)*smooth;p.pos=add(p.pos,mul(p.right,p.offset));p.wr=p.wl=pitWidth/2;
    }
    for(const [i,j] of adaptiveSegments(pit,18,settings.surfaceTolerance,settings.maxTurnDegrees*Math.PI/180)) {
      const a=pit[i],b=pit[j];push('pitLane',makeSlab(a,b,pitWidth,0,0.5,1,-0.025,0.02));
      if(Math.min(Math.abs(a.offset),Math.abs(b.offset))>pitWidth+2) {
        push('pitWall',makeSlab(a,b,0.45,-side*(pitWidth/2+1),2.2,3,1.0,0.08));
        push('pitMarkings',makeSlab(a,b,0.15,side*(pitWidth/2-0.2),0.025,4,0.008,0.1));
      }
    }
    pitInfo={side,widthStuds:pitWidth,lengthStuds:length,layout:'approximate parallel pit lane with blended entry/exit; not a surveyed pit route'};
  }
  // A compact checkerboard at the CSV's origin gives a visible start/finish cue.
  const a=points[0],b=points[1],width=a.wr+a.wl,tiles=Math.ceil(width/1.5),tile=width/tiles;
  for(let row=0;row<2;row++)for(let column=0;column<tiles;column++) {
    const center=add(a.pos,mul(unit(sub(b.pos,a.pos)),(row-0.5)*1.5));
    const ca={...a,pos:sub(center,mul(unit(sub(b.pos,a.pos)),0.7))},cb={...a,pos:add(center,mul(unit(sub(b.pos,a.pos)),0.7))};
    push('startFinish',makeSlab(ca,cb,tile,(column+0.5)*tile-a.wl,0.02,(row+column)%2?4:2,0.045,0.01));
  }
  // Raise the complete ribbon build so its lowest underside meets the grass
  // platform. This retains hills and banking rather than flattening to the floor.
  const minimum=Math.min(...parts.map(p=>Math.min(...boxCorners(p).map(v=>v[1]))));
  for(const p of parts)p[1]=round(p[1]-minimum);
  const corners=parts.flatMap(boxCorners),bounds={min:[0,1,2].map(k=>Math.min(...corners.map(v=>v[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(v=>v[k])))};
  if(parts.length>settings.maxParts)throw Error(`Ribbon plan exceeds budget: ${parts.length}`);
  for(const p of parts)if(p.length!==13||p.some(v=>!Number.isFinite(v))||p.slice(3,6).some(v=>v<0.001||v>2048))throw Error('Invalid ribbon part');
  const csvHash=crypto.createHash('sha256').update(csvText).digest('hex');
  const meta={format:'sepang-ribbons-v1',scope:'main circuit, separate corner curbs, edge lines, source-derived runoff, approximate pit lane and pit wall; existing grass platform; no buildings or stands',sourceUrl:'https://github.com/TUMFTM/racetrack-database',centerlineFile:'source/Sepang.csv',centerlineSha256:csvHash,sourceSha256:glb.sha256,settings,alignment:fit,lapLengthMetres:rows.reduce((s,p,i)=>s+Math.hypot(p[0]-rows[(i+1)%rows.length][0],p[1]-rows[(i+1)%rows.length][1]),0),lapLengthStuds:distance,partCount:parts.length,palette,planBounds:bounds,width:round(bounds.max[0]-bounds.min[0]),depth:round(bounds.max[2]-bounds.min[2]),groupCounts:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),groups,groundLift:round(-minimum),sourceHeightRange:[Math.min(...original.map(p=>p.pos[1])),Math.max(...original.map(p=>p.pos[1]))],retainedHeightRange:[Math.min(...points.map(p=>p.pos[1])),Math.max(...points.map(p=>p.pos[1]))],roadSampling:{outsideDistanceMedian:matches.sort((a,b)=>a-b)[Math.floor(matches.length/2)],outsideDistanceP95:matches[Math.floor(matches.length*0.95)]},pitLane:pitInfo,limitations:['CSV contains a smoothed 2D centerline and estimated widths, not a survey of the 2025 layout.','GLB supplies elevation after a similarity alignment; local surface samples and banking are smoothed.','Corner curb zones are inferred from curvature; exact paint and curb extents are approximations.','Pit lane is a parallel approximation; buildings, stands and a new grass floor are omitted.','Rectangular segments still have small overlapping joins; no wedges or mesh uploads are used.','Placement and driving require live verification with the current catalog.']};
  meta.retainedHeightRange = meta.retainedHeightRange.map(h=>h-minimum);
  meta.roadSegments=segments;
  meta.edgeMarkingSegments=edgeMarkingSegments;
  return scalePlan({meta,parts,centerline:points.map(p=>[p.pos[0],p.pos[1]-minimum,p.pos[2],p.wr,p.wl,p.s,...p.normal])},settings.outputScale);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const csv=fs.readFileSync(path.join(here,'source/Sepang.csv'),'utf8');
  const plan=compilePlan(csv,path.join(here,'source/sepang.glb'));
  fs.writeFileSync(path.join(here,'sepang-plan.json'),JSON.stringify(plan));
  fs.writeFileSync(path.join(here,'generation-report.json'),JSON.stringify(plan.meta,null,2));
  writeArtifacts(here,plan);packageRuntime(here);
  console.log(JSON.stringify({parts:plan.parts.length,groups:plan.meta.groupCounts,footprint:[plan.meta.width,plan.meta.depth],heightRange:plan.meta.retainedHeightRange},null,2));
}
