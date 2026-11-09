import {buildTerrain,constrainSurfaces,volumeAudit,clearanceAudit,topHeight} from './bulk-terrain.mjs';
import {adaptiveSegments,boxCorners,round} from './geometry.mjs';
import {finishPoints} from './reference.mjs';
import {fittedSlab} from './road-geometry.mjs';
import {unit} from './track-geometry.mjs';
import {smoothDrivingPoints} from './smooth-surface.mjs';
function sampler(ground){
  return (x,z,fallback)=>{
    const gx=(x-ground.x0)/ground.cell-.5,gz=(z-ground.z0)/ground.cell-.5,ix=Math.floor(gx),iz=Math.floor(gz);let sum=0,total=0;
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      const a=ix+dx,b=iz+dz;if(a<0||b<0||a>=ground.nx||b>=ground.nz)continue;const h=ground.heights[b*ground.nx+a];if(h===null)continue;const weight=1/(.2+(a-gx)**2+(b-gz)**2);sum+=h*weight;total+=weight;
    }
    return total?sum/total:fallback;
  };
}
export function addTerrain(base,rawGround,{rootCell=1024,minCell=256,edgeMaxLength=96,margin=384,...options}={}){
  const ground={...rawGround,trackPlanDatum:base.meta.groundLift,heights:rawGround.heights.map(h=>h===null?null:h+base.meta.groundLift)};
  const bulk=buildTerrain(base,ground,{rootCell,minCell,margin,sourceTolerance:12,maxRoadGap:5,maxSlope:.32,...options}),start=base.parts.length;
  const sample=sampler(ground),route=base.centerline.slice(0,-1).map(p=>({pos:p.slice(0,3),wr:p[3],wl:p[4],bank:0}));finishPoints(route);
  // Recover the crossfall from the actual recorded driving plane.
  for(let i=0;i<route.length;i++){
    const n=base.centerline[i].slice(6),r=route[i].right,h=Math.hypot(r[0],r[2]);route[i].bank=-(n[0]*r[0]+n[2]*r[2])/(n[1]*h);
  }
  route.pop();finishPoints(route);
  const skirts=[],spans=[];
  for(const side of [-1,1])for(const [inner,outer] of [[-.25,18],[18,250]]){
    const width=outer-inner;let line=route.map((p,i)=>{
      const r=p.right,h=Math.hypot(r[0],r[2]),edge=side>0?p.wr:p.wl,normal=base.centerline[i].slice(6);
      const point=d=>{
        const offset=side*(edge+d),x=p.pos[0]+r[0]/h*offset,z=p.pos[2]+r[2]/h*offset,roadHeight=p.pos[1]-(normal[0]*(x-p.pos[0])+normal[2]*(z-p.pos[2]))/normal[1]-base.meta.settings.roadThickness/normal[1]-.07;
        const actual=sample(x,z,roadHeight),t=Math.max(0,Math.min(1,d/250)),weight=1-t*t*(3-2*t);return {x,z,y:actual*(1-weight)+roadHeight*weight};
      };
      const a=point(inner),b=point(outer),bank=side*(b.y-a.y)/width;
      return {pos:[(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2],wr:width/2,wl:width/2,bank};
    });
    line.pop();finishPoints(line);
    const narrow=inner<0;
    if(!narrow)line=smoothDrivingPoints(line,{heightSigma:120,bankSigma:120});
    for(const [a,b] of adaptiveSegments(line,narrow?edgeMaxLength:160,narrow?.8:2.5,(narrow?12:20)*Math.PI/180,narrow?.65:2.5,Infinity,4)){
      spans.push({index:skirts.length,side,inner,outer,start:a,end:b});skirts.push(fittedSlab(line,a,b,{width,thickness:.25,color:5,guard:.04}));
    }
  }
  const constrained=constrainSurfaces(base,skirts,.04),dressed=constrainSurfaces({parts:constrained.parts},bulk.parts.slice(start),.01);
  bulk.parts.splice(start,bulk.parts.length-start,...dressed.parts,...constrained.parts);
  bulk.meta.groups.terrain=bulk.parts.slice(start).map((_,i)=>start+i);
  bulk.meta.groupCounts.terrain=bulk.parts.length-start;bulk.meta.partCount=bulk.parts.length;
  // Sloping solid undersides are buried beneath the foundation. Use the
  // visible foundation datum, rather than lifting the whole circuit to the
  // deepest buried corner of a tilted block.
  const foundation=bulk.meta.terrain.foundationIndices.map(i=>bulk.parts[i]),minimum=Math.min(...foundation.flatMap(boxCorners).map(p=>p[1])),lift=-minimum;
  // The bottom of the new foundation rests above the existing grass plate.
  if(Math.abs(lift)>1e-6){
    for(const p of bulk.parts)p[1]=round(p[1]+lift);
    for(const p of bulk.centerline)p[1]+=lift;
    for(const p of bulk.meta.pitPoints)p.pos[1]+=lift;
    bulk.meta.groundLift+=lift;bulk.meta.retainedHeightRange=bulk.meta.retainedHeightRange.map(h=>h+lift);bulk.meta.placementAnchor.roadHeight+=lift;
  }
  const bounds=bulk.parts.flatMap(boxCorners);bulk.meta.planBounds={min:[0,1,2].map(k=>Math.min(...bounds.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...bounds.map(p=>p[k])))};
  bulk.meta.width=round(bulk.meta.planBounds.max[0]-bulk.meta.planBounds.min[0]);bulk.meta.depth=round(bulk.meta.planBounds.max[2]-bulk.meta.planBounds.min[2]);
  const track={...base,parts:bulk.parts.slice(0,start)},grass=bulk.parts.slice(start),audit=volumeAudit(track,grass),clearance=clearanceAudit(track,grass,.035);
  if(audit.intersections.length)throw Error('Terrain enters the driving geometry: '+JSON.stringify(audit.intersections.slice(0,5)));
  if(clearance.maxProtrusionStuds>.0002)throw Error('Terrain rises through a track surface');
  if(bulk.parts.length+1>=10000)throw Error('Full terrain build exceeds the under-10000 budget: '+JSON.stringify({total:bulk.parts.length+1,bulk:dressed.parts.length,edges:constrained.parts.length,bands:spans.reduce((r,s)=>(r[`${s.side}:${s.inner}`]=(r[`${s.side}:${s.inner}`]??0)+1,r),{})}));
  bulk.meta.terrain={...bulk.meta.terrain,basePartCount:start,addedParts:grass.length,bulkParts:dressed.parts.length,edgeParts:constrained.parts.length,edgeSpans:spans.map(s=>({...s,index:start+dressed.parts.length+s.index})),totalWithExistingGrass:bulk.parts.length+1,foundationLift:lift,clearanceAudit:clearance,volumeAudit:audit,edgeLowering:{modified:constrained.modified,maximumStuds:constrained.maximumLowering},bulkDressing:{modified:dressed.modified,maximumStuds:dressed.maximumLowering}};
  bulk.meta.limitations=bulk.meta.limitations.filter(s=>!s.startsWith('Terrain uses broad'));
  bulk.meta.limitations.push('Roadside grass uses narrow fitted slope strips; open areas use broad planar patches and foundation tiles. Outer terraces and rectangular borders remain.');
  return bulk;
}
