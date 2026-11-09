import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSurfaces} from './model.mjs';
import {rasterize,encodePng} from './mesh-geometry.mjs';
import {KDTree,skeletonize,sub,dot,unit} from './track-geometry.mjs';
import {finishPoints,gridTree,sampleHeight} from './reference.mjs';
import {extractPit} from './pit-reference.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const reference=JSON.parse(fs.readFileSync(path.join(here,'source/red-bull-ring-reference.json'))),scene=loadSurfaces(path.join(here,'source/redbullring.glb'));
if(scene.sha256!==reference.sourceSha256)throw Error('The feature source does not match the elevation reference');
const frame=reference.raster,factor=frame.factor,scale=frame.scale;
const main=reference.points.slice(0,-1);
const road=rasterize({...scene,primitives:scene.primitives.filter(p=>p.role==='road')},frame.width,1);
const completePit=extractPit(reference,scene);
const pitPoints=completePit.points;

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
fs.writeFileSync(path.join(here,'source/red-bull-ring-features.json'),JSON.stringify({format:'red-bull-ring-features-v1',sourceSha256:scene.sha256,referenceSha256:reference.sourceSha256,pitPoints,pitWidth:12,pitRoute:completePit.meta,records}));
const pixels=Buffer.alloc(road.nx*road.nz*4);for(let i=0;i<road.heights.length;i++)pixels.set(completePit.mask[i]?[240,169,65,255]:Number.isFinite(road.heights[i])?[100,112,118,255]:[27,40,32,255],i*4);
fs.writeFileSync(path.join(here,'source/pit-reference.png'),encodePng(road.nx,road.nz,pixels));
for(const p of pitPoints){const x=Math.round(p.pos[0]/factor+road.nx/2),z=Math.round(p.pos[2]/factor+road.nz/2);for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(x+dx>=0&&x+dx<road.nx&&z+dz>=0&&z+dz<road.nz)pixels.set([240,169,65,255],((z+dz)*road.nx+x+dx)*4);}
fs.writeFileSync(path.join(here,'source/pit-reference.png'),encodePng(road.nx,road.nz,pixels));
console.log(JSON.stringify(completePit.meta));
console.log(JSON.stringify({pitSamples:pitPoints.length,pitLengthStuds:pitPoints.at(-1).s,kerbSamples:records.filter(r=>r.kerb).length,runoffBands:records.reduce((s,r)=>s+r.bands.length,0),grassCells:ground.heights.filter(x=>x!==null).length}));
