import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadSurfaces} from './model.mjs';
import {rasterize,encodePng} from './mesh-geometry.mjs';
import {parseTrackCsv,alignCenterline,fitSimilarity,transform2,KDTree,skeletonize,add,sub,mul,dot,cross,unit} from './track-geometry.mjs';
import {catmull,round} from './geometry.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const STUDS_PER_METRE=2.6884487795629512; // Sepang's accepted 2x scale.
export function gridIndex(grid,x,z) {
  const ix=Math.floor((x+grid.nx*grid.cell/2)/grid.cell),iz=Math.floor((z+grid.nz*grid.cell/2)/grid.cell);
  return ix>=0&&iz>=0&&ix<grid.nx&&iz<grid.nz?iz*grid.nx+ix:-1;
}
function gridTree(grid) {
  const samples=[];
  for(let i=0;i<grid.heights.length;i++)if(Number.isFinite(grid.heights[i]))samples.push([(i%grid.nx+.5)*grid.cell-grid.nx*grid.cell/2,(Math.floor(i/grid.nx)+.5)*grid.cell-grid.nz*grid.cell/2,i]);
  return new KDTree(samples);
}
function sampleHeight(grid,tree,x,z) {
  const p=tree.nearest([x,z]).point,i=p[2];
  return {height:grid.heights[i]+grid.slopesX[i]*(x-p[0])+grid.slopesZ[i]*(z-p[1]),gx:grid.slopesX[i],gz:grid.slopesZ[i]};
}
function lane(grid,p,right,limit=60) {
  const runs=[];let first=null;
  for(let d=-limit;d<=limit+1;d+=1){const i=gridIndex(grid,p[0]+right[0]*d,p[1]+right[1]*d),occupied=i>=0&&Number.isFinite(grid.heights[i]);if(occupied&&first===null)first=d;if(!occupied&&first!==null){if(d-first>=5)runs.push([first-.5,d-.5]);first=null;}}
  return runs.sort((a,b)=>Math.abs((a[0]+a[1])/2)-Math.abs((b[0]+b[1])/2))[0];
}
function refineFit(rows,road,initial) {
  let fit={...initial};
  for(let iteration=0;iteration<8;iteration++) {
    const sources=[],targets=[];
    for(let i=0;i<rows.length;i+=3) {
      const p=transform2(rows[i],fit),a=transform2(rows[(i-1+rows.length)%rows.length],fit),b=transform2(rows[(i+1)%rows.length],fit),along=unit(sub(b,a)),right=[along[1],-along[0]],run=lane(road,p,right,45);
      if(!run||run[1]-run[0]>40||Math.abs((run[0]+run[1])/2)>24)continue;
      sources.push(rows[i]);targets.push(add(p,mul(right,(run[0]+run[1])/2)));
    }
    const next=fitSimilarity(sources,targets,fit.reflection);
    fit={...fit,...next};
  }
  return fit;
}
function smoothClosed(values,radius,sigma) {
  return values.map((_,i)=>{let s=0,w=0;for(let j=-radius;j<=radius;j++){const weight=Math.exp(-j*j/(2*sigma*sigma));s+=values[(i+j+values.length)%values.length]*weight;w+=weight;}return s/w;});
}
export function finishPoints(points,closed=true) {
  let s=0;
  for(let i=0;i<points.length;i++) {
    const p=points[i],prev=points[closed?(i-1+points.length)%points.length:Math.max(0,i-1)],next=points[closed?(i+1)%points.length:Math.min(points.length-1,i+1)],along=unit(sub(next.pos,prev.pos)),flatRight=unit([along[2],0,-along[0]]),bank=p.bank??0;
    p.right=unit([flatRight[0],bank,flatRight[2]]);p.normal=unit(cross(along,p.right));p.s=s;
    if(i+1<points.length)s+=Math.hypot(...sub(points[i+1].pos,p.pos));
  }
  if(closed){s+=Math.hypot(...sub(points.at(-1).pos,points[0].pos));points.push({...points[0],pos:[...points[0].pos],s});}
  return points;
}
function longestPitPath(grid) {
  const thin=skeletonize(Uint8Array.from(grid.heights,h=>Number.isFinite(h)?1:0),grid.nx,grid.nz),all=[];
  for(let i=0;i<thin.length;i++)if(thin[i])all.push(i);
  const traverse=start=>{const queue=[start],dist=new Map([[start,0]]),parent=new Map();let far=start;for(let n=0;n<queue.length;n++){const i=queue[n],x=i%grid.nx,z=Math.floor(i/grid.nx);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz||x+dx<0||x+dx>=grid.nx||z+dz<0||z+dz>=grid.nz)continue;const j=i+dz*grid.nx+dx;if(!thin[j]||dist.has(j))continue;dist.set(j,dist.get(i)+Math.hypot(dx,dz));parent.set(j,i);queue.push(j);if(dist.get(j)>dist.get(far))far=j;}}return {far,parent,count:dist.size};};
  let best;
  const visited=new Set();
  for(const start of all){if(visited.has(start))continue;const component=traverse(start);for(const i of component.parent.keys())visited.add(i);visited.add(start);if(!best||component.count>best.count)best=component;}
  const route=traverse(best.far),indices=[];for(let i=route.far;i!==undefined;i=route.parent.get(i))indices.push(i);
  return indices.map(i=>[(i%grid.nx+.5)*grid.cell-grid.nx*grid.cell/2,(Math.floor(i/grid.nx)+.5)*grid.cell-grid.nz*grid.cell/2]);
}
function pitReference(pit,mainPoints,factor,road,roadTree) {
  let route=longestPitPath(pit);
  // Remove staircase noise before fitting an open smooth ribbon.
  route=route.map((q,i)=>{let a=[0,0],n=0;for(let j=Math.max(0,i-6);j<=Math.min(route.length-1,i+6);j++){a=add(a,route[j]);n++;}return mul(a,1/n);}).filter((_,i)=>i%6===0||i===route.length-1);
  const tree=new KDTree(mainPoints.slice(0,-1).map((p,i)=>[p.pos[0]/factor,p.pos[2]/factor,i]));
  const mid=route[Math.floor(route.length/2)],nearest=tree.nearest(mid).point[2],p=mainPoints[nearest],mainAlong=[-p.right[2],p.right[0]];
  if(dot(sub(route.at(-1),route[0]),mainAlong)<0)route.reverse();
  const widths=route.map((p,i)=>{const a=route[Math.max(0,i-1)],b=route[Math.min(route.length-1,i+1)],v=unit(sub(b,a)),run=lane(pit,p,[v[1],-v[0]],35);return run?(run[1]-run[0])*factor:0;}).filter(w=>w>5).sort((a,b)=>a-b);
  const width=Math.max(22.582969748328793,Math.min(32,widths[Math.floor(widths.length/2)]*1.4));
  const entry=mainPoints[tree.nearest(route[0]).point[2]],exit=mainPoints[tree.nearest(route.at(-1)).point[2]],pitTree=gridTree(pit);
  const vertices=route.map(q=>{const h=sampleHeight(pit,pitTree,...q);return [q[0]*factor,h.height*factor,q[1]*factor];});
  vertices[0]=[...entry.pos];vertices[vertices.length-1]=[...exit.pos];
  const dense=[];
  for(let i=0;i<vertices.length-1;i++)for(let j=0;j<12;j++){const q=catmull(vertices[Math.max(0,i-1)],vertices[i],vertices[i+1],vertices[Math.min(vertices.length-1,i+2)],j/12);dense.push({pos:q,wr:width/2,wl:width/2,bank:0});}
  dense.push({pos:vertices.at(-1),wr:width/2,wl:width/2,bank:0});
  // Blend endpoint heights and banking into the main road, retaining the middle pit grade.
  finishPoints(dense,false);
  for(const [anchor,fromStart] of [[entry,true],[exit,false]])for(const q of dense){const distance=fromStart?q.s:dense.at(-1).s-q.s,f=Math.max(0,1-distance/50),w=f*f*(3-2*f),h=anchor.pos[1]-(anchor.normal[0]*(q.pos[0]-anchor.pos[0])+anchor.normal[2]*(q.pos[2]-anchor.pos[2]))/anchor.normal[1];q.pos[1]=q.pos[1]*(1-w)+h*w;q.bank=anchor.bank*w;}
  finishPoints(dense,false);
  const straight=route.map((q,i)=>({q,i,d:tree.nearest(q).distance})).sort((a,b)=>b.d-a.d)[0];
  return {points:dense,width,entry:entry.pos,exit:exit.pos,anchor:vertices[Math.max(1,Math.floor(vertices.length*.2))],sourceMedianWidth:widths[Math.floor(widths.length/2)],method:'Longest connected medial path of the named pitlane mesh, smoothed, widened and joined to the main road.'};
}
export function generateReference() {
  const scene=loadSurfaces(path.join(here,'Autodromo Nazionale Monza.glb')),csv=fs.readFileSync(path.join(here,'source/Monza.csv')),rows=parseTrackCsv(csv.toString());
  const road=rasterize({...scene,primitives:scene.primitives.filter(p=>p.role==='road')},1800,1),roadTree=gridTree(road),initial=alignCenterline(rows,road),fit=refineFit(rows,road,initial),factor=STUDS_PER_METRE/fit.scale;
  const original=rows.map(p=>transform2(p,fit));
  // Small medial corrections keep the CSV route inside the actual driving mesh.
  const shifts=original.map((p,i)=>{const a=original[(i-1+rows.length)%rows.length],b=original[(i+1)%rows.length],v=unit(sub(b,a)),r=[v[1],-v[0]],run=lane(road,p,r,35);return run&&run[1]-run[0]<40?Math.max(-18,Math.min(18,(run[0]+run[1])/2)):0;});
  const smooth=smoothClosed(shifts,5,2),corrected=original.map((p,i)=>{const v=unit(sub(original[(i+1)%rows.length],original[(i-1+rows.length)%rows.length]));return add(p,mul([v[1],-v[0]],smooth[i]));});
  const points=[],normalized=[];
  for(let i=0;i<rows.length;i++)for(let j=0;j<24;j++){const t=j/24,q=catmull(corrected[(i-1+rows.length)%rows.length],corrected[i],corrected[(i+1)%rows.length],corrected[(i+2)%rows.length],t),h=sampleHeight(road,roadTree,...q),wr=(rows[i][2]*(1-t)+rows[(i+1)%rows.length][2]*t)*STUDS_PER_METRE*1.25,wl=(rows[i][3]*(1-t)+rows[(i+1)%rows.length][3]*t)*STUDS_PER_METRE*1.25;points.push({pos:[q[0]*factor,h.height*factor,q[1]*factor],wr:fit.reflection===1?wr:wl,wl:fit.reflection===1?wl:wr,gx:h.gx,gz:h.gz});normalized.push(q);}
  const heights=smoothClosed(points.map(p=>p.pos[1]),36,12);
  for(let i=0;i<points.length;i++){points[i].pos[1]=heights[i];const a=normalized[(i-1+points.length)%points.length],b=normalized[(i+1)%points.length],v=unit(sub(b,a));points[i].bank=Math.max(-Math.tan(Math.PI/30),Math.min(Math.tan(Math.PI/30),points[i].gx*v[1]-points[i].gz*v[0]));}
  const banks=smoothClosed(points.map(p=>p.bank),72,24);points.forEach((p,i)=>p.bank=banks[i]);finishPoints(points);
  const pitGrid=rasterize({...scene,primitives:scene.primitives.filter(p=>p.role==='pit')},1800,1),pit=pitReference(pitGrid,points,factor,road,roadTree);
  const reference={format:'monza-reference-v1',sourceSha256:scene.sha256,centerlineSha256:sha(csv),studsPerMetre:STUDS_PER_METRE,alignment:{initial,refined:fit,maximumMedialCorrectionStuds:Math.max(...smooth.map(Math.abs))*factor},modelFrame:{bounds:scene.bounds,presentationTiltRemovedDegrees:scene.presentationTiltDegrees,normalizedWidth:1800,factor},lapLengthMetres:rows.reduce((s,p,i)=>s+Math.hypot(p[0]-rows[(i+1)%rows.length][0],p[1]-rows[(i+1)%rows.length][1]),0),points,pit};
  fs.writeFileSync(path.join(here,'source/monza-reference.json'),JSON.stringify(reference));
  const pix=Buffer.alloc(road.nx*road.nz*4);for(let i=0;i<road.heights.length;i++)pix.set(Number.isFinite(road.heights[i])?[100,110,120,255]:[35,55,38,255],i*4);for(const p of points){const i=gridIndex(road,p.pos[0]/factor,p.pos[2]/factor);if(i>=0)pix.set([255,70,65,255],i*4);}for(const p of pit.points){const i=gridIndex(road,p.pos[0]/factor,p.pos[2]/factor);if(i>=0)pix.set([80,160,255,255],i*4);}fs.writeFileSync(path.join(here,'reference-review/aligned-layout.png'),encodePng(road.nx,road.nz,pix));
  return {reference,scene,road,roadTree};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const {reference:r}=generateReference();console.log(JSON.stringify({alignment:r.alignment,scale:r.studsPerMetre,tiltRemoved:r.modelFrame.presentationTiltRemovedDegrees,heightRange:[Math.min(...r.points.map(p=>p.pos[1])),Math.max(...r.points.map(p=>p.pos[1]))],pit:{width:r.pit.width,points:r.pit.points.length,entry:r.pit.entry,exit:r.pit.exit}},null,2));}
