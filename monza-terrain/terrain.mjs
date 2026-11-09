import {boxCorners,boxBasis,round} from '../monza/geometry.mjs';
import {dot,sub,mul,cross,unit} from '../monza/track-geometry.mjs';
import {topFootprint,overlapVertices} from '../monza/surface-audit.mjs';

// Thick sloped terrain needs the exact box plane. Its top-plane intercept at
// the box centre's X/Z is half the thickness divided by the normal's Y.
export const topHeight=(p,x,z)=>p[1]+p[4]/(2*p[11])-(p[10]*(x-p[0])+p[12]*(z-p[2]))/p[11];

const key=(x,z)=>`${x}:${z}`;
const cross2=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function projectedHull(part) {
  const points=boxCorners(part).map(p=>[p[0],p[2]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const lower=[],upper=[];
  for(const p of points){while(lower.length>=2&&cross2(lower.at(-2),lower.at(-1),p)<=1e-10)lower.pop();lower.push(p);}
  for(const p of [...points].reverse()){while(upper.length>=2&&cross2(upper.at(-2),upper.at(-1),p)<=1e-10)upper.pop();upper.push(p);}
  return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
function polygonIntersection(subject,clip) {
  let output=subject;
  for(let i=0;i<clip.length;i++) {
    const a=clip[i],b=clip[(i+1)%clip.length],input=output;output=[];
    if(!input.length)break;
    for(let j=0;j<input.length;j++) {
      const p=input[j],q=input[(j+1)%input.length],dp=cross2(a,b,p),dq=cross2(a,b,q),pin=dp>=-1e-8,qin=dq>=-1e-8;
      if(pin)output.push(p);
      if(pin!==qin){const t=dp/(dp-dq);output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
    }
  }
  return output;
}
function spatialIndex(parts,cell=128,full=false) {
  const buckets=new Map();
  for(const [index,part] of parts.entries()) {
    const points=full?projectedHull(part):topFootprint(part),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
    for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let z=Math.floor(Math.min(...zs)/cell);z<=Math.floor(Math.max(...zs)/cell);z++) {
      const k=key(x,z);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(index);
    }
  }
  return part=>{
    const points=full?projectedHull(part):topFootprint(part),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),found=new Set();
    for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let z=Math.floor(Math.min(...zs)/cell);z<=Math.floor(Math.max(...zs)/cell);z++)for(const i of buckets.get(key(x,z))??[])found.add(i);
    return [...found];
  };
}
export function boxesOverlap(a,b,tolerance=.00001) {
  const ba=boxBasis(a),bb=boxBasis(b),aa=[ba.right,ba.up,ba.back],ab=[bb.right,bb.up,bb.back];
  const axes=[...aa,...ab,...aa.flatMap(x=>ab.map(y=>cross(x,y)))],delta=sub(b.slice(0,3),a.slice(0,3));
  for(const axis of axes) {
    if(Math.hypot(...axis)<1e-7)continue;
    const ra=aa.reduce((sum,v,i)=>sum+a[i+3]/2*Math.abs(dot(v,axis)),0);
    const rb=ab.reduce((sum,v,i)=>sum+b[i+3]/2*Math.abs(dot(v,axis)),0);
    if(Math.abs(dot(delta,axis))>=ra+rb-tolerance)return false;
  }
  return true;
}
export function volumeAudit(base,terrain) {
  const cell=128,buckets=new Map();
  for(const [i,p] of base.parts.entries()) {
    const corners=boxCorners(p),xs=corners.map(c=>c[0]),zs=corners.map(c=>c[2]);
    for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let z=Math.floor(Math.min(...zs)/cell);z<=Math.floor(Math.max(...zs)/cell);z++) {
      const k=key(x,z);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);
    }
  }
  const intersections=[];let pairsChecked=0;
  for(const [ti,p] of terrain.entries()) {
    const corners=boxCorners(p),xs=corners.map(c=>c[0]),zs=corners.map(c=>c[2]),indices=new Set();
    for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let z=Math.floor(Math.min(...zs)/cell);z<=Math.floor(Math.max(...zs)/cell);z++)for(const i of buckets.get(key(x,z))??[])indices.add(i);
    for(const i of indices){pairsChecked++;if(boxesOverlap(p,base.parts[i]))intersections.push({terrainIndex:ti,trackIndex:i});}
  }
  return {pairsChecked,intersections};
}
function groundSampler(ground,base,bottom) {
  const route=base.centerline.filter((_,i)=>i%16===0);
  const sample=(x,z)=>{
    let nearest=route[0],nearestDistance=Infinity;
    for(const p of route){const d=(p[0]-x)**2+(p[2]-z)**2;if(d<nearestDistance){nearestDistance=d;nearest=p;}}
    const distance=Math.max(0,Math.sqrt(nearestDistance)-Math.max(nearest[3],nearest[4]));
    const t=Math.max(0,Math.min(1,(distance-140)/260)),weight=1-t*t*(3-2*t);
    const ix=Math.floor((x-ground.x0)/ground.cell),iz=Math.floor((z-ground.z0)/ground.cell);let sum=0,weights=0;
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++) {
      const a=ix+dx,b=iz+dz;if(a<0||a>=ground.nx||b<0||b>=ground.nz)continue;
      const h=ground.heights[b*ground.nx+a];if(h===null)continue;
      const distance=Math.hypot(ground.x0+(a+.5)*ground.cell-x,ground.z0+(b+.5)*ground.cell-z),weight=1/(1+distance**2);
      sum+=h*weight;weights+=weight;
    }
    const height=weights?sum/weights:nearest[1]-1.1;
    return {height:bottom+.2+Math.max(0,height-bottom-.2)*weight,source:weights>0};
  };
  return sample;
}
function planeTile(x,z,size,height,gx,gz,bottom,color=5) {
  const up=unit([-gx,1,-gz]),right=unit([1,gx,0]),back=cross(right,up),top=[x,height,z];
  let width=0,depth=0;
  for(const dx of [-size/2,size/2])for(const dz of [-size/2,size/2]) {
    const delta=[dx,gx*dx+gz*dz,dz];width=Math.max(width,2*Math.abs(dot(delta,right)));depth=Math.max(depth,2*Math.abs(dot(delta,back)));
  }
  // Extend the solid down to the foundation, including the highest corner.
  const thickness=Math.max(2,(height+(Math.abs(gx)+Math.abs(gz))*size/2-bottom+.5)*up[1]);
  const center=sub(top,mul(up,thickness/2));
  return [...center,width+.04,thickness,depth+.04,color,...right,...up].map((v,i)=>i>=7?Math.round(v*1e8)/1e8:round(v));
}
export function clearanceAudit(base,terrain,clearance=.05) {
  const nearby=spatialIndex(base.parts);let maxProtrusion=-Infinity,overlaps=0,worst=null;
  for(const [ti,p] of terrain.entries())for(const i of nearby(p))for(const [x,z] of overlapVertices(p,base.parts[i])) {
    const b=base.parts[i],difference=topHeight(p,x,z)-(topHeight(b,x,z)-b[4]/b[11]-clearance);
    overlaps++;if(difference>maxProtrusion){maxProtrusion=difference;worst={terrainIndex:ti,trackIndex:i,x,z};}
  }
  return {clearanceStuds:clearance,overlapVerticesChecked:overlaps,maxProtrusionStuds:maxProtrusion,worst};
}
export function buildTerrain(base,ground,options={}) {
  if(ground.sourceSha256!==base.meta.sourceSha256||ground.trackPlanDatum!==base.meta.groundLift)throw Error('Terrain source is not aligned to this track plan');
  const settings={margin:384,rootCell:512,minCell:128,maxRoadGap:2.5,sourceTolerance:4,clearance:.05,maxSlope:.18,...options};
  const baseBottom=Math.min(...base.parts.flatMap(boxCorners).map(p=>p[1]))-.15;
  const nearby=spatialIndex(base.parts),sample=groundSampler(ground,base,baseBottom),roadParts=[...base.meta.groups.asphalt,...base.meta.groups.pitLane].map(i=>base.parts[i]);
  const volumeNearby=spatialIndex(base.parts,128,true),baseHulls=base.parts.map(projectedHull);
  const occupied=new Set(),roots=new Set();
  // Mark all grid cells in a broad corridor around both main and pit roads.
  for(const p of roadParts) {
    const polygon=topFootprint(p),xs=polygon.map(q=>q[0]),zs=polygon.map(q=>q[1]);
    for(let x=Math.floor((Math.min(...xs)-settings.margin)/settings.minCell);x<=Math.floor((Math.max(...xs)+settings.margin)/settings.minCell);x++)for(let z=Math.floor((Math.min(...zs)-settings.margin)/settings.minCell);z<=Math.floor((Math.max(...zs)+settings.margin)/settings.minCell);z++) {
      occupied.add(key(x,z));roots.add(key(Math.floor(x*settings.minCell/settings.rootCell),Math.floor(z*settings.minCell/settings.rootCell)));
    }
  }
  const terrain=[],patches=[];let sourceSamples=0,fallbackSamples=0;
  function tile(x0,z0,size) {
    let hasCoverage=false;
    for(let x=Math.floor(x0/settings.minCell);x<Math.ceil((x0+size)/settings.minCell);x++)for(let z=Math.floor(z0/settings.minCell);z<Math.ceil((z0+size)/settings.minCell);z++)if(occupied.has(key(x,z)))hasCoverage=true;
    if(!hasCoverage)return;
    const x=x0+size/2,z=z0+size/2,offset=size*.4,samples=[];
    for(const dx of [-offset,0,offset])for(const dz of [-offset,0,offset]) {
      const s=sample(x+dx,z+dz);samples.push({dx,dz,h:s.height});if(s.source)sourceSamples++;else fallbackSamples++;
    }
    const mean=samples.reduce((sum,p)=>sum+p.h,0)/samples.length;
    if(samples.every(p=>p.h<baseBottom+.4))return; // The shared foundation covers flat outer cells.
    const denominator=samples.reduce((sum,p)=>sum+p.dx**2,0);
    const gx=Math.max(-settings.maxSlope,Math.min(settings.maxSlope,samples.reduce((sum,p)=>sum+p.dx*p.h,0)/denominator));
    const gz=Math.max(-settings.maxSlope,Math.min(settings.maxSlope,samples.reduce((sum,p)=>sum+p.dz*p.h,0)/denominator));
    const sourceError=Math.max(...samples.map(p=>Math.abs(p.h-(mean+gx*p.dx+gz*p.dz))));
    let part=planeTile(x,z,size,mean,gx,gz,baseBottom),lower=0,gaps=[];
    for(const i of nearby(part)) {
      const b=base.parts[i];
      for(const [px,pz] of overlapVertices(part,b)) {
        const gap=topHeight(b,px,pz)-b[4]/b[11]-settings.clearance-topHeight(part,px,pz);
        lower=Math.max(lower,-gap);gaps.push(gap);
      }
    }
    const worstGap=gaps.length?Math.max(...gaps)+lower:0;
    if(size>settings.minCell&&(sourceError>settings.sourceTolerance||worstGap>settings.maxRoadGap)) {
      for(const dx of [0,size/2])for(const dz of [0,size/2])tile(x0+dx,z0+dz,size/2);
      return;
    }
    part=planeTile(x,z,size,Math.max(baseBottom+.2,mean-lower-.002),gx,gz,baseBottom);
    // Refit thickness changed horizontal centre; constrain the final top plane.
    let correction=0;
    for(const i of nearby(part))for(const [px,pz] of overlapVertices(part,base.parts[i])) {
      const b=base.parts[i];correction=Math.max(correction,topHeight(part,px,pz)-(topHeight(b,px,pz)-b[4]/b[11]-settings.clearance));
    }
    if(correction>0)part[1]=round(part[1]-correction-.002);
    // A thick sloping box also projects sideways below its top rectangle.
    // Constrain its entire projected volume, so those sides cannot enter a
    // neighbouring road even when its top footprint does not overlap it.
    const hull=projectedHull(part);let volumeLowering=0;
    for(const i of volumeNearby(part))for(const [px,pz] of polygonIntersection(hull,baseHulls[i])) {
      const b=base.parts[i];volumeLowering=Math.max(volumeLowering,topHeight(part,px,pz)-(topHeight(b,px,pz)-b[4]/b[11]-settings.clearance));
    }
    if(volumeLowering>0)part[1]=round(part[1]-volumeLowering-.002);
    patches.push({index:terrain.length,x0,z0,size,sourceErrorStuds:sourceError,loweredStuds:lower,volumeLoweredStuds:volumeLowering,estimatedMaxGapStuds:worstGap+volumeLowering});terrain.push(part);
  }
  for(const root of [...roots].sort()){const [x,z]=root.split(':').map(Number);tile(x*settings.rootCell,z*settings.rootCell,settings.rootCell);}
  // Broad flat foundation fills the infield and outer footprint, beneath the
  // sloping patches. It also hides their undersides when viewed from ground.
  const bounds=terrain.flatMap(boxCorners),min=[Math.min(...bounds.map(p=>p[0])),Math.min(...bounds.map(p=>p[2]))],max=[Math.max(...bounds.map(p=>p[0])),Math.max(...bounds.map(p=>p[2]))];
  const columns=Math.ceil((max[0]-min[0])/2000),rows=Math.ceil((max[1]-min[1])/2000),width=(max[0]-min[0])/columns,depth=(max[1]-min[1])/rows;
  const foundationIndices=[];
  for(let x=0;x<columns;x++)for(let z=0;z<rows;z++) {
    foundationIndices.push(terrain.length);terrain.push([round(min[0]+(x+.5)*width),round(baseBottom-1),round(min[1]+(z+.5)*depth),round(width+.02),2,round(depth+.02),5,1,0,0,0,1,0]);
  }
  const audit=clearanceAudit(base,terrain,settings.clearance);
  if(audit.maxProtrusionStuds>.0002)throw Error('Grass protrudes through existing track surfaces: '+JSON.stringify(audit));
  const volumes=volumeAudit(base,terrain);
  if(volumes.intersections.length)throw Error('Terrain volume intersects the original track: '+JSON.stringify(volumes.intersections.slice(0,8)));
  const total=base.parts.length+terrain.length+1;
  if(total>11000)throw Error('Terrain exceeds 11000 including the existing grass: '+total);
  const result=structuredClone(base),start=result.parts.length;
  result.parts.push(...terrain);
  result.meta.groups.terrain=terrain.map((_,i)=>start+i);result.meta.groupCounts.terrain=terrain.length;
  result.meta.partCount=result.parts.length;result.meta.variant='terrain';
  const corners=result.parts.flatMap(boxCorners);
  result.meta.planBounds={min:[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(p=>p[k])))};
  result.meta.width=round(result.meta.planBounds.max[0]-result.meta.planBounds.min[0]);result.meta.depth=round(result.meta.planBounds.max[2]-result.meta.planBounds.min[2]);
  result.meta.scope+='; broad model-derived grass slopes and foundation';
  result.meta.terrain={settings,basePartCount:start,addedParts:terrain.length,totalWithExistingGrass:total,sourceMeshes:ground.meshes,sourceSha256:ground.sourceSha256,patches,foundationIndices:foundationIndices.map(i=>start+i),sourceSamples,fallbackSamples,clearanceAudit:audit,volumeAudit:volumes};
  result.meta.limitations.push('Terrain uses broad sloping boxes rather than every model crest. Perimeter corners and terrace seams remain visible; high-detail scenery is excluded.');
  return result;
}
