import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadSurfaces} from './model.mjs';
import {rasterize,encodePng} from './mesh-geometry.mjs';
import {parseTrackCsv,alignCenterline,transform2,KDTree,add,sub,mul,cross,unit} from './track-geometry.mjs';
import {catmull} from './geometry.mjs';
export const STUDS_PER_METRE=2.6884487795629512;
export const sha=body=>crypto.createHash('sha256').update(body).digest('hex');
const here=path.dirname(fileURLToPath(import.meta.url));
export function finishPoints(points,closed=true){
  let s=0;const n=points.length;
  for(let i=0;i<n;i++){
    const p=points[i],a=points[closed?(i+n-1)%n:Math.max(0,i-1)],b=points[closed?(i+1)%n:Math.min(n-1,i+1)],along=unit(sub(b.pos,a.pos)),flatRight=unit([along[2],0,-along[0]]);
    p.right=unit([flatRight[0],p.bank??0,flatRight[2]]);p.normal=unit(cross(along,p.right));p.s=s;
    if(i+1<n)s+=Math.hypot(...sub(points[i+1].pos,p.pos));
  }
  if(closed){s+=Math.hypot(...sub(points[0].pos,points.at(-1).pos));points.push({...points[0],pos:[...points[0].pos],s});}
  return points;
}
export function gridTree(grid){
  const points=[];for(let i=0;i<grid.heights.length;i++)if(Number.isFinite(grid.heights[i]))points.push([(i%grid.nx+.5)*grid.cell-grid.nx*grid.cell/2,(Math.floor(i/grid.nx)+.5)*grid.cell-grid.nz*grid.cell/2,i]);
  return new KDTree(points);
}
export function sampleHeight(grid,tree,x,z){
  const nearest=tree.nearest([x,z]),p=nearest.point,i=p[2];
  return {height:grid.heights[i]+grid.slopesX[i]*(x-p[0])+grid.slopesZ[i]*(z-p[1]),gx:grid.slopesX[i],gz:grid.slopesZ[i],distance:Math.sqrt(nearest.distance)};
}
export function generateReference(){
  const scene=loadSurfaces(path.join(here,'source/redbullring.glb')),csv=fs.readFileSync(path.join(here,'source/Spielberg.csv')),rows=parseTrackCsv(csv.toString());
  const road=rasterize({...scene,primitives:scene.primitives.filter(p=>p.role==='road')},1800,1),tree=gridTree(road),fit=alignCenterline(rows,road),factor=STUDS_PER_METRE/fit.scale;
  if(fit.p95>12||fit.scale<.5||fit.scale>3)throw Error('The Spielberg route does not align with this GLB: '+JSON.stringify(fit));
  const normalized=rows.map(p=>transform2(p,fit)),points=[],distances=[];
  for(let i=0;i<rows.length;i++)for(let j=0;j<8;j++){
    const t=j/8,q=catmull(normalized[(i+rows.length-1)%rows.length],normalized[i],normalized[(i+1)%rows.length],normalized[(i+2)%rows.length],t),h=sampleHeight(road,tree,...q),a=normalized[(i+rows.length-1)%rows.length],b=normalized[(i+1)%rows.length],along=unit(sub(b,a));
    const wr=(rows[i][2]*(1-t)+rows[(i+1)%rows.length][2]*t)*STUDS_PER_METRE*1.25,wl=(rows[i][3]*(1-t)+rows[(i+1)%rows.length][3]*t)*STUDS_PER_METRE*1.25;
    points.push({pos:[q[0]*factor,h.height*factor,q[1]*factor],wr:fit.reflection===1?wr:wl,wl:fit.reflection===1?wl:wr,bank:Math.max(-.09,Math.min(.09,h.gx*along[1]-h.gz*along[0]))});distances.push(h.distance);
  }
  finishPoints(points);
  const pixels=Buffer.from(road.pixels??road.image??Buffer.alloc(road.nx*road.nz*4));
  for(let i=0;i<road.heights.length;i++)pixels.set(Number.isFinite(road.heights[i])?[130,139,144,255]:[29,44,35,255],i*4);
  for(const p of points){const x=Math.floor((p.pos[0]/factor+road.nx*road.cell/2)/road.cell),z=Math.floor((p.pos[2]/factor+road.nz*road.cell/2)/road.cell);if(x>=0&&z>=0&&x<road.nx&&z<road.nz)pixels.set([255,68,68,255],(z*road.nx+x)*4);}
  fs.writeFileSync(path.join(here,'source/alignment.png'),encodePng(road.nx,road.nz,pixels));
  const reference={format:'red-bull-ring-reference-v1',sourceSha256:scene.sha256,centerlineSha256:sha(csv),sourceFile:'redbullring.glb',studsPerMetre:STUDS_PER_METRE,alignment:fit,raster:{width:1800,cell:1,nx:road.nx,nz:road.nz,scale:road.scale,factor,bounds:scene.bounds},points,lapLengthMetres:points.at(-1).s/STUDS_PER_METRE,sampling:{maxDistanceNormalized:Math.max(...distances)},surfaceMaterials:scene.surfaceMaterials};
  fs.writeFileSync(path.join(here,'source/red-bull-ring-reference.json'),JSON.stringify(reference));
  console.log(JSON.stringify({points:points.length,fit,lapMetres:reference.lapLengthMetres,roadHeightRange:[Math.min(...points.map(p=>p.pos[1])),Math.max(...points.map(p=>p.pos[1]))],sampling:reference.sampling},null,2));
  return {reference,scene,road};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))generateReference();
