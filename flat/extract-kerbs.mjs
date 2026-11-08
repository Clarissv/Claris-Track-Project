import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readGlb,loadScene,selectTrackScene,rasterize,sample} from './mesh-geometry.mjs';
import {KDTree,dot,sub} from './track-geometry.mjs';
import {flatPoints} from './compile-flat.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const round=n=>Math.round(n*10000)/10000;
export function kerbColor(rgb) {
  if(rgb[0]>.2&&rgb[0]>rgb[1]*1.6&&rgb[0]>rgb[2]*1.6)return 9;
  if(Math.min(...rgb.slice(0,3))>.25&&Math.max(...rgb.slice(0,3))-Math.min(...rgb.slice(0,3))<.12)return 4;
  return null;
}
function traceRunoff(full,scene,points,road,frame) {
  const {outputScale,nx,nz,sourceCell}=frame,materials=['Sepang1641Mtl','Sepang1631Mtl'];
  const grid=rasterize({...scene,primitives:full.primitives.filter(p=>materials.includes(p.material.name)).map(p=>({...p,material:{...p.material,alphaMode:'OPAQUE'},role:p.material.name==='Sepang1641Mtl'?'gravel':'painted'}))},1800,1);
  const at=(grid,q)=>{
    const x=Math.floor((q[0]/outputScale+nx*sourceCell/2)/grid.cell),z=Math.floor((q[2]/outputScale+nz*sourceCell/2)/grid.cell);
    return x>=0&&x<grid.nx&&z>=0&&z<grid.nz?z*grid.nx+x:-1;
  };
  const profiles=[],step=4,lateralStep=2,drivingEdges=new Map();
  for(let i=0;i<points.length-1;i+=step) {
    const point=points[i],q=d=>[point.pos[0]+point.right[0]*d,0,point.pos[2]+point.right[2]*d],roadRuns=[];
    let first=null;
    for(let d=-100;d<=102;d+=lateralStep){const n=at(road,q(d)),occupied=n>=0&&Number.isFinite(road.heights[n]);if(occupied&&first===null)first=d;if(!occupied&&first!==null){roadRuns.push([first-lateralStep/2,d-lateralStep/2]);first=null;}}
    const lanes=roadRuns.filter(([a,b])=>b-a>=16);
    if(!lanes.length)continue;
    const driving=lanes.sort((a,b)=>Math.abs((a[0]+a[1])/2)-Math.abs((b[0]+b[1])/2))[0];
    drivingEdges.set(i,driving);
  }
  const sourceTree=new KDTree([...drivingEdges].map(([i,edge])=>{const p=points[i],d=(edge[0]+edge[1])/2;return [p.pos[0]+p.right[0]*d,p.pos[2]+p.right[2]*d,i];}));
  for(const [i,driving] of drivingEdges) {
    const point=points[i],q=d=>[point.pos[0]+point.right[0]*d,0,point.pos[2]+point.right[2]*d];
    for(const side of [-1,1]) {
      const sourceEdge=side>0?driving[1]:driving[0];let run=null;
      for(let distance=2;distance<=222;distance+=lateralStep) {
        const position=q(sourceEdge+side*distance),n=at(grid,position),near=sourceTree.nearest([position[0],position[2]]),arc=Math.abs(points[near.point[2]].s-point.s),sameSection=Math.min(arc,points.at(-1).s-arc)<=120;let color=null;
        // A long outward ray can reach a different straight or hairpin. Keep
        // only areas associated with this local section of the model road.
        if(sameSection&&n>=0&&Number.isFinite(grid.heights[n])) {
          if(grid.roles[n]==='gravel')color=8;
          else {const rgb=[...grid.pixels.subarray(n*4,n*4+3)].map(v=>v/255);color=kerbColor(rgb);if(!color&&rgb[2]>rgb[0]*1.2&&rgb[2]>rgb[1]*1.2)color=10;if(!color&&rgb[0]>.3&&rgb[1]>.3&&Math.min(rgb[0],rgb[1])>rgb[2]*1.5)color=11;}
        }
        if(run&&run.color!==color){if(run.width>=4)profiles.push({side,start:i,end:Math.min(i+step,points.length-1),offset:run.start-1,width:run.width,color:run.color,sourceEdge});run=null;}
        if(color){if(!run)run={start:distance,width:0,color};run.width+=lateralStep;}
      }
    }
  }
  return {materialNames:materials,profileStepSamples:step,lateralStepStuds:lateralStep,maximumSampleDistanceStuds:220,maximumAssociationArcStuds:120,method:'Sample each runoff colour band outward from the model driving-strip boundary; exclude areas nearer a different track section and relocate the boundary to the wider flat road edge. Pale textured runoff is represented as gravel.',profiles};
}
export function extractKerbs(filename,reference) {
  const glb=readGlb(filename);
  if(glb.sha256!==reference.meta.sourceSha256)throw Error('Kerb model differs from the frozen layout reference');
  const full=loadScene(glb),scene=selectTrackScene(full);
  // This atlas contains actual strips of red/white concrete, their grooves and
  // blue edge paint. The broad tricolour runoff and grey border are excluded.
  const material='Sepang101Mtl',primitives=full.primitives.filter(p=>p.material.name===material);
  if(!primitives.length)throw Error('Expected red/white kerb atlas is missing');
  const sourceWidth=1800,sourceCell=2,scale=sourceWidth/(scene.bounds.max[0]-scene.bounds.min[0]),nx=Math.ceil(sourceWidth/sourceCell),nz=Math.ceil((scene.bounds.max[2]-scene.bounds.min[2])*scale/sourceCell),outputScale=reference.meta.outputScale;
  const map=p=>[(p[0]-scene.bounds.min[0])*scale*outputScale-nx*sourceCell/2*outputScale,0,(p[2]-scene.bounds.min[2])*scale*outputScale-nz*sourceCell/2*outputScale];
  const points=flatPoints(reference),count=points.length-1,tree=new KDTree(points.slice(0,count).map((p,i)=>[p.pos[0],p.pos[2],i]));
  // The large Sepang271Mtl polygon is the broad circuit base. The narrower
  // grey Sepang1401Mtl strip follows the driving surface and pit lane.
  const road=rasterize({...scene,primitives:full.primitives.filter(p=>p.material.name==='Sepang1401Mtl').map(p=>({...p,material:{...p.material,alphaMode:'OPAQUE'},role:'road'}))},sourceWidth,1);
  const roadAt=q=>{
    const x=Math.floor((q[0]/outputScale+nx*sourceCell/2)/road.cell),z=Math.floor((q[2]/outputScale+nz*sourceCell/2)/road.cell);
    return x>=0&&x<road.nx&&z>=0&&z<road.nz&&Number.isFinite(road.heights[z*road.nx+x]);
  };
  const votes={'-1':Array(count).fill(null),'1':Array(count).fill(null)};
  let triangles=0,topTriangles=0,accepted=0,rejected=0,ambiguous=0;
  const spacing=.9;
  for(const p of primitives)for(let t=0;t<p.indices.length;t+=3) {
    triangles++;
    const ids=[...p.indices.subarray(t,t+3)],raw=ids.map(j=>[...p.positions.subarray(j*3,j*3+3)]),[a,b,c]=raw;
    const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
    if(Math.abs(den)<1e-8)continue;
    const gx=((b[1]-a[1])*(c[2]-a[2])-(c[1]-a[1])*(b[2]-a[2]))/den,gz=((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/den;
    if(Math.hypot(gx,gz)>.5)continue;
    topTriangles++;
    const pos=raw.map(map),edge=Math.max(...[0,1,2].map(i=>Math.hypot(...sub(pos[i],pos[(i+1)%3])))),steps=Math.max(1,Math.ceil(edge/spacing));
    for(let u=0;u<steps;u++)for(let v=0;v<steps-u;v++) {
      const wa=(u+1/3)/steps,wb=(v+1/3)/steps,wc=1-wa-wb;
      const color=kerbColor(sample(p,...ids,wa,wb,wc));if(!color)continue;
      const q=[0,1,2].map(k=>wa*pos[0][k]+wb*pos[1][k]+wc*pos[2][k]),nearest=tree.nearest([q[0],q[2]]);
      if(nearest.distance>100**2){rejected++;continue;}
      const i=nearest.point[2],point=points[i];
      // Use asphalt on either side of the *mesh* strip to infer its outward
      // side. CSV alignment can drift across a narrow road, so lateral sign
      // alone is not sufficient. Borderline samples fall back to that sign.
      let left=0,right=0;
      for(let d=3;d<=23;d+=2){left+=roadAt([q[0]-point.right[0]*d,0,q[2]-point.right[2]*d]);right+=roadAt([q[0]+point.right[0]*d,0,q[2]+point.right[2]*d]);}
      let side;
      if(Math.abs(left-right)>=3)side=left>right?1:-1;
      else{ambiguous++;side=dot(sub(q,point.pos),point.right)<0?-1:1;}
      const bin=votes[side][i]??={red:0,white:0,x:0,z:0,n:0};
      bin[color===9?'red':'white']++;bin.x+=q[0];bin.z+=q[2];bin.n++;accepted++;
    }
  }
  const zones=[];
  for(const side of [-1,1]) {
    const bins=votes[side],filled=bins.map(b=>b?{color:b.red>b.white?9:4,x:b.x/b.n,z:b.z/b.n,evidence:true}:null);
    // Close sampling/shadow grooves only; do not create kerbs at empty bends.
    const gapLimit=5;
    for(let i=0;i<count;) {
      if(filled[i]){i++;continue;}const first=i;while(i<count&&!filled[i])i++;
      if(first===0||i===count||points[i].s-points[first-1].s>gapLimit)continue;
      for(let k=first;k<i;k++){
        const f=(points[k].s-points[first-1].s)/(points[i].s-points[first-1].s),a=filled[first-1],b=filled[i];
        filled[k]={color:f<.5?a.color:b.color,x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,evidence:false};
      }
    }
    for(let i=0;i<count;) {
      if(!filled[i]){i++;continue;}const start=i;while(i<count&&filled[i])i++;const end=i;
      if(points[end].s-points[start].s<12)continue;
      // Remove single-bin colour noise without resetting the source pattern.
      const colors=filled.slice(start,end).map(b=>b.color);
      for(let k=1;k+1<colors.length;k++)if(colors[k-1]===colors[k+1])filled[start+k].color=colors[k-1];
      zones.push({id:'mesh-'+zones.length,side,start,end,samples:filled.slice(start,end).map((b,k)=>[start+k,round(b.x),round(b.z),b.color,b.evidence?1:0])});
    }
  }
  const runoff=traceRunoff(full,scene,points,road,{nx,nz,sourceCell,outputScale});
  return {format:'sepang-kerb-trace-v1',sourceUrl:reference.meta.sourceUrl,sourceSha256:glb.sha256,centerlineSha256:sha(JSON.stringify(reference.centerline)),materialNames:[material],excludedMaterials:{Sepang1631Mtl:'broad coloured runoff bands',Sepang1401Mtl:'grey driving strip; used only to infer side'},coordinateFrame:{bounds:scene.bounds,sourceWidth,sourceCell,outputScale},method:{sampleSpacingStuds:spacing,maxSlope:.5,maxProjectionDistanceStuds:100,closeGapStuds:5,minimumZoneStuds:12,side:'source grey driving strip occupancy along projected right vector; lateral fallback',opacity:'ignored for baked shading in kerb atlas; only horizontal red/white faces included',adjustment:'Longitudinal position, side and colour are projected onto the frozen CSV centreline; kerb width/profile follow the widened flat layout.'},statistics:{triangles,topTriangles,accepted,rejected,ambiguous,zones:zones.length,evidenceSamples:zones.reduce((n,z)=>n+z.samples.filter(p=>p[4]).length,0),runoffProfiles:runoff.profiles.length},zones,runoff};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const reference=JSON.parse(fs.readFileSync(path.join(here,'source/sepang-reference.json'))),filename=process.argv[2]??path.join(here,'../Sepang Old/source/sepang.glb');
  const trace=extractKerbs(filename,reference);
  fs.writeFileSync(path.join(here,'source/sepang-kerbs.json'),JSON.stringify(trace));
  console.log(JSON.stringify(trace.statistics,null,2));
}
