import {buildTerrain,constrainSurfaces,volumeAudit,clearanceAudit,topHeight,solidToDatum} from './bulk-terrain.mjs';
import {adaptiveSegments,boxCorners,round} from './geometry.mjs';
import {finishPoints} from './reference.mjs';
import {terrainSlab} from './terrain-slab.mjs';
import {unit} from './track-geometry.mjs';
import {smoothDrivingPoints} from './smooth-surface.mjs';
import {scaleGround} from './layout.mjs';
function sampler(ground){
  return (x,z,fallback)=>{
    const gx=(x-ground.x0)/ground.cell-.5,gz=(z-ground.z0)/ground.cell-.5,ix=Math.floor(gx),iz=Math.floor(gz);let sum=0,total=0;
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      const a=ix+dx,b=iz+dz;if(a<0||b<0||a>=ground.nx||b>=ground.nz)continue;const h=ground.heights[b*ground.nx+a];if(h===null)continue;const weight=1/(.2+(a-gx)**2+(b-gz)**2);sum+=h*weight;total+=weight;
    }
    return total?sum/total:fallback;
  };
}
export function addTerrain(base,rawGround,{rootCell=1024,minCell=256,edgeMaxLength=96,outerMaxLength=160,outerTolerance=2.5,outerMaxTurn=20,outerWidthVariation=4,margin=384,...options}={}){
  rawGround=scaleGround(rawGround,base.meta.layoutScale??1);
  const ground={...rawGround,trackPlanDatum:base.meta.groundLift,heights:rawGround.heights.map(h=>h===null?null:h+base.meta.groundLift)};
  const bulk=buildTerrain(base,ground,{rootCell,minCell,margin,sourceTolerance:12,maxRoadGap:5,maxSlope:.32,...options}),start=base.parts.length;
  const sample=sampler(ground),route=base.centerline.slice(0,-1).map(p=>({pos:p.slice(0,3),wr:p[3],wl:p[4],bank:0}));finishPoints(route);
  // Recover the crossfall from the actual recorded driving plane.
  for(let i=0;i<route.length;i++){
    const n=base.centerline[i].slice(6),r=route[i].right,h=Math.hypot(r[0],r[2]);route[i].bank=-(n[0]*r[0]+n[2]*r[2])/(n[1]*h);
  }
  route.pop();finishPoints(route);
  const radius=route.slice(0,-1).map((p,i)=>{
    const n=route.length-1,a=route[(i-16+n)%n].pos,b=p.pos,c=route[(i+16)%n].pos,u=[b[0]-a[0],b[2]-a[2]],v=[c[0]-b[0],c[2]-b[2]],turn=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);
    return {inner:turn>0?-1:1,value:(Math.hypot(...u)+Math.hypot(...v))/2/Math.max(1e-6,Math.abs(turn))};
  });
  const skirts=[],spans=[];
  for(const side of [-1,1])for(const [inner,outer] of [[-.25,18],[18,250],[250,500]]){
    let line=route.slice(0,-1).map((p,i)=>{
      const r=p.right,h=Math.hypot(r[0],r[2]),edge=side>0?p.wr:p.wl,normal=base.centerline[i].slice(6);
      const actualOuter=radius[i].inner===side?Math.min(outer,radius[i].value*.8-edge):outer,width=actualOuter-inner;
      if(width<.75)return null;
      const point=d=>{
        const offset=side*(edge+d),x=p.pos[0]+r[0]/h*offset,z=p.pos[2]+r[2]/h*offset,roadHeight=p.pos[1]-(normal[0]*(x-p.pos[0])+normal[2]*(z-p.pos[2]))/normal[1]-base.meta.settings.roadThickness/normal[1]-.07;
        const actual=sample(x,z,roadHeight),t=Math.max(0,Math.min(1,d/250)),weight=1-t*t*(3-2*t);
        if(d>250){const edgeOffset=side*(edge+250),bx=p.pos[0]+r[0]/h*edgeOffset,bz=p.pos[2]+r[2]/h*edgeOffset,baseHeight=sample(bx,bz,roadHeight),u=Math.min(1,(d-250)/250);return {x,z,y:baseHeight*(1-u)+.2*u};}
        return {x,z,y:actual*(1-weight)+roadHeight*weight};
      };
      const a=point(inner),b=point(actualOuter),bank=side*(b.y-a.y)/width;
      return {pos:[(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2],wr:width/2,wl:width/2,bank,sourceIndex:i,surfaceRight:[r[0]/h,0,r[2]/h]};
    });
    const narrow=inner<0;
    const closed=line.every(Boolean),runs=[];
    if(closed)runs.push(line);else{
      const first=line.findIndex(p=>p===null);line=[...line.slice(first+1),...line.slice(0,first+1)];let run=[];
      for(const p of line){if(p)run.push(p);else{if(run.length>1)runs.push(run);run=[];}}
    }
    for(let run of runs){
      finishPoints(run,closed);
      if(!narrow)run=smoothDrivingPoints(run,{heightSigma:120,bankSigma:120,closed});
      for(const [a,b] of adaptiveSegments(run,narrow?edgeMaxLength:outerMaxLength,narrow?.8:outerTolerance,(narrow?12:outerMaxTurn)*Math.PI/180,narrow?.65:outerTolerance,Infinity,narrow?4:outerWidthVariation)){
        spans.push({index:skirts.length,side,inner,outer,start:run[a].sourceIndex,end:run[b].sourceIndex});skirts.push(terrainSlab(run,a,b,{minimumHeight:narrow?-Infinity:.15}));
      }
    }
  }
  const constrained=constrainSurfaces(base,skirts,.04),foundationSet=new Set(bulk.meta.terrain.foundationIndices);
  const foundationTop=Math.min(...bulk.meta.terrain.foundationIndices.map(i=>topHeight(bulk.parts[i],bulk.parts[i][0],bulk.parts[i][2])));
  const patches=bulk.parts.slice(start).filter((_,i)=>!foundationSet.has(start+i));
  const dressed=constrainSurfaces({parts:constrained.parts.filter((_,i)=>spans[i].outer<=250)},patches,.01,false);
  const filled=constrainSurfaces(base,[...dressed.parts,...constrained.parts].map(p=>solidToDatum(p,foundationTop)),.04);
  // All foundation tiles share one datum. Expand them to cover the complete
  // solid footprint so the roadside slopes always land on continuous grass.
  const footprint=filled.parts.flatMap(boxCorners),xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[2]),minX=Math.min(...xs),minZ=Math.min(...zs),maxX=Math.max(...xs),maxZ=Math.max(...zs);
  const columns=Math.ceil((maxX-minX)/2000),rows=Math.ceil((maxZ-minZ)/2000),width=(maxX-minX)/columns,depth=(maxZ-minZ)/rows,foundations=[];
  for(let x=0;x<columns;x++)for(let z=0;z<rows;z++)foundations.push([round(minX+(x+.5)*width),round(foundationTop-1),round(minZ+(z+.5)*depth),round(width+.02),2,round(depth+.02),5,1,0,0,0,1,0]);
  bulk.parts.splice(start,bulk.parts.length-start,...filled.parts.slice(0,dressed.parts.length),...foundations,...filled.parts.slice(dressed.parts.length));
  bulk.meta.terrain.foundationIndices=foundations.map((_,i)=>start+dressed.parts.length+i);
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
  bulk.meta.terrain={...bulk.meta.terrain,solidToFoundation:true,foundationTop:foundationTop+lift,solidFitting:{modified:filled.modified,maximumLoweringStuds:filled.maximumLowering},basePartCount:start,addedParts:grass.length,bulkParts:dressed.parts.length+foundations.length,edgeParts:constrained.parts.length,edgeSpans:spans.map(s=>({...s,index:start+dressed.parts.length+foundations.length+s.index})),totalWithExistingGrass:bulk.parts.length+1,foundationLift:lift,clearanceAudit:clearance,volumeAudit:audit,edgeLowering:{modified:constrained.modified,maximumStuds:constrained.maximumLowering},bulkDressing:{modified:dressed.modified,maximumStuds:dressed.maximumLowering}};
  bulk.meta.limitations=bulk.meta.limitations.filter(s=>!s.startsWith('Terrain uses broad'));
  bulk.meta.limitations.push('Roadside grass uses narrow fitted slope strips; open areas use broad planar patches and foundation tiles. Outer terraces and rectangular borders remain.');
  return bulk;
}
