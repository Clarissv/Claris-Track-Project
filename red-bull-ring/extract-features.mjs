import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSurfaces} from './model.mjs';
import {rasterize,encodePng} from './mesh-geometry.mjs';
import {KDTree,skeletonize,sub,dot,unit} from './track-geometry.mjs';
import {finishPoints,gridTree,sampleHeight} from './reference.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const reference=JSON.parse(fs.readFileSync(path.join(here,'source/red-bull-ring-reference.json'))),scene=loadSurfaces(path.join(here,'source/redbullring.glb'));
if(scene.sha256!==reference.sourceSha256)throw Error('The feature source does not match the elevation reference');
const frame=reference.raster,factor=frame.factor,scale=frame.scale;
const main=reference.points.slice(0,-1),route=new KDTree(main.filter((_,i)=>i%8===0).map(p=>[p.pos[0]/factor,p.pos[2]/factor,p.s,p.wr/factor,p.wl/factor]));
const road=rasterize({...scene,primitives:scene.primitives.filter(p=>p.role==='road')},frame.width,1);
const candidate=new Uint8Array(road.nx*road.nz),lap=reference.points.at(-1).s;
for(let i=0;i<candidate.length;i++)if(Number.isFinite(road.heights[i])){
  const q=[i%road.nx+.5-road.nx/2,Math.floor(i/road.nx)+.5-road.nz/2],nearest=route.nearest(q),p=nearest.point,d=Math.sqrt(nearest.distance);
  if((p[2]<lap*.10||p[2]>lap*.87)&&d>Math.max(p[3],p[4])/1.25+8&&d<100)candidate[i]=1;
}
function diameter(mask){
  const visited=new Uint8Array(mask.length);let best=[];
  for(let start=0;start<mask.length;start++)if(mask[start]&&!visited[start]){
    const component=[start];visited[start]=1;
    for(let j=0;j<component.length;j++){
      const i=component[j],x=i%road.nx,z=Math.floor(i/road.nx);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const px=x+dx,pz=z+dz;if(px<0||pz<0||px>=road.nx||pz>=road.nz)continue;const k=pz*road.nx+px;if(mask[k]&&!visited[k]){visited[k]=1;component.push(k);}}
    }
    if(component.length>best.length)best=component;
  }
  if(best.length<200)throw Error('The model pit lane could not be isolated');
  const retained=new Uint8Array(mask.length);for(const i of best)retained[i]=1;
  const thin=skeletonize(retained,road.nx,road.nz);
  function traverse(start){
    const queue=[start],distance=new Map([[start,0]]),parent=new Map();let far=start;
    for(let j=0;j<queue.length;j++){
      const i=queue[j],x=i%road.nx,z=Math.floor(i/road.nx);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const px=x+dx,pz=z+dz;if(px<0||pz<0||px>=road.nx||pz>=road.nz)continue;const k=pz*road.nx+px;if(thin[k]&&!distance.has(k)){distance.set(k,distance.get(i)+Math.hypot(dx,dz));parent.set(k,i);queue.push(k);if(distance.get(k)>distance.get(far))far=k;}}
    }
    return {far,parent};
  }
  const start=thin.findIndex(x=>x),end=traverse(traverse(start).far),indices=[];
  for(let i=end.far;i!==undefined;i=end.parent.get(i))indices.push(i);
  return {indices,mask:retained};
}
const pit=diameter(candidate),roadTree=gridTree(road);
let vertices=pit.indices.map(i=>[i%road.nx+.5-road.nx/2,Math.floor(i/road.nx)+.5-road.nz/2]);
vertices=vertices.map((_,i)=>{const a=vertices.slice(Math.max(0,i-8),Math.min(vertices.length,i+9));return [0,1].map(k=>a.reduce((s,p)=>s+p[k],0)/a.length);}).filter((_,i,a)=>i%4===0||i===a.length-1);
const nearestIndex=p=>{let best=0,d=Infinity;for(let i=0;i<main.length;i+=8){const q=main[i].pos,n=(q[0]/factor-p[0])**2+(q[2]/factor-p[1])**2;if(n<d){d=n;best=i;}}return best;};
const middle=nearestIndex(vertices[Math.floor(vertices.length/2)]),heading=main[(middle+8)%main.length].pos.map((v,k)=>v-main[middle].pos[k]);
if(dot([vertices.at(-1)[0]-vertices[0][0],0,vertices.at(-1)[1]-vertices[0][1]],heading)<0)vertices.reverse();
const pitPoints=vertices.map(q=>({pos:[q[0]*factor,sampleHeight(road,roadTree,...q).height*factor,q[1]*factor],wr:13,wl:13,bank:0}));
finishPoints(pitPoints,false);

// A shared world frame keeps road, grass and runoff rasters aligned even at the perimeter.
const margin=160,bounds={min:[scene.bounds.min[0]-margin,scene.bounds.min[1],scene.bounds.min[2]-margin],max:[scene.bounds.max[0]+margin,scene.bounds.max[1],scene.bounds.max[2]+margin]};
const width=(bounds.max[0]-bounds.min[0])*scale;
const features=rasterize({...scene,bounds,primitives:scene.primitives.filter(p=>p.role!=='road'&&p.role!=='grass'&&p.role!=='edge')},width,1);
const offsetX=(scene.bounds.min[0]-bounds.min[0])*scale+road.nx/2,offsetZ=(scene.bounds.min[2]-bounds.min[2])*scale+road.nz/2;
const at=(grid,x,z)=>{const ix=Math.floor(x/factor+offsetX),iz=Math.floor(z/factor+offsetZ);return ix>=0&&iz>=0&&ix<grid.nx&&iz<grid.nz?iz*grid.nx+ix:-1;};
const records=[];
for(let i=0;i<main.length;i+=4){
  const p=main[i],horizontal=Math.hypot(p.right[0],p.right[2]),right=[p.right[0]/horizontal,p.right[2]/horizontal];
  for(const side of [-1,1]){
    const edge=(side>0?p.wr:p.wl)/1.25,samples=[];
    for(let d=-2;d<=160;d+=2){
      const x=p.pos[0]+right[0]*side*(edge+d),z=p.pos[2]+right[1]*side*(edge+d),index=at(features,x,z);
      if(index<0||!Number.isFinite(features.heights[index])){samples.push({d,style:null});continue;}
      const rgb=[0,1,2].map(k=>features.pixels[index*4+k]),role=features.roles[index];
      const style=role==='gravel'?'sand':rgb[0]>rgb[1]*1.25&&rgb[0]>90?'red':Math.min(...rgb)>145?'white':Math.max(...rgb)<100?'asphalt':'runoff';
      samples.push({d,style,role});
    }
    const near=samples.filter(s=>s.d<=12&&s.role==='kerb'&&(s.style==='red'||s.style==='white')),kerb=near.length?near.reduce((a,b)=>a.style==='red'?a:b).style:null;
    const bands=[];
    for(let k=0;k<samples.length;){const a=samples[k];let end=k+1;while(end<samples.length&&samples[end].style===a.style&&samples[end].role===a.role)end++;if(a.style&&a.role!=='kerb'&&samples[end-1].d-a.d>=4)bands.push({inner:Math.max(3.2,a.d),outer:samples[end-1].d+2,style:a.style});k=end;}
    records.push({index:i,side,kerb,bands:bands.filter(b=>b.outer>b.inner)});
  }
}
const grass=rasterize({...scene,bounds,primitives:scene.primitives.filter(p=>p.role==='grass')},width,8);
const ground={format:'red-bull-ring-ground-v1',sourceSha256:scene.sha256,cell:8*factor,x0:-offsetX*factor,z0:-offsetZ*factor,nx:grass.nx,nz:grass.nz,heights:Array.from(grass.heights,h=>Number.isFinite(h)?Math.round(h*factor*100)/100:null),mesh:'Acuredbullring1211Mtl.002',rasterScale:scale};
fs.writeFileSync(path.join(here,'source/ground-reference.json'),JSON.stringify(ground));
fs.writeFileSync(path.join(here,'source/red-bull-ring-features.json'),JSON.stringify({format:'red-bull-ring-features-v1',sourceSha256:scene.sha256,referenceSha256:reference.sourceSha256,pitPoints,pitWidth:26,records}));
const pixels=Buffer.alloc(road.nx*road.nz*4);for(let i=0;i<road.heights.length;i++)pixels.set(pit.mask[i]?[240,169,65,255]:Number.isFinite(road.heights[i])?[100,112,118,255]:[27,40,32,255],i*4);
fs.writeFileSync(path.join(here,'source/pit-reference.png'),encodePng(road.nx,road.nz,pixels));
console.log(JSON.stringify({pitSamples:pitPoints.length,pitLengthStuds:pitPoints.at(-1).s,kerbSamples:records.filter(r=>r.kerb).length,runoffBands:records.reduce((s,r)=>s+r.bands.length,0),grassCells:ground.heights.filter(x=>x!==null).length}));
