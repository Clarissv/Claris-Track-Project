import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {rasterize} from './mesh-geometry.mjs';
import {loadSurfaces,surfaceMaterials} from './model.mjs';

// These overlay meshes bound the painted/tyre-marked apron where the model
// has no separate plain pavement triangle underneath. Use their footprint,
// while omitting the texture artwork from the block build.
export const loadTidySurfaces=filename=>loadSurfaces(filename,{...surfaceMaterials,runoff:[107,8,9,10,11]});

export function tidyFeatures(reference,scene,features){
  const margin=200,bounds={min:scene.bounds.min.map((x,k)=>x-(k===1?0:margin)),max:scene.bounds.max.map((x,k)=>x+(k===1?0:margin))},width=(bounds.max[0]-bounds.min[0])*reference.raster.scale;
  const kerbs=rasterize({...scene,bounds,primitives:scene.primitives.filter(p=>p.role==='kerb')},width,1),paved=rasterize({...scene,bounds,primitives:scene.primitives.filter(p=>['road','runoff','gravel'].includes(p.role))},width,1),factor=reference.raster.factor;
  const hit=(grid,x,z)=>{const a=Math.floor(x/factor+grid.nx/2),b=Math.floor(z/factor+grid.nz/2),i=b*grid.nx+a;if(!(a>=0&&b>=0&&a<grid.nx&&b<grid.nz&&Number.isFinite(grid.heights[i])))return false;if(grid.roles[i]==='gravel'){const rgb=[0,1,2].map(k=>grid.pixels[i*4+k]);return Math.max(...rgb)-Math.min(...rgb)<20;}return true;};
  const kerbRuns=[];
  for(const side of [-1,1]){
    const rows=features.records.filter(r=>r.side===side),presence=rows.map(r=>{
      const p=reference.points[r.index],h=Math.hypot(p.right[0],p.right[2]),edge=(side>0?p.wr:p.wl)/1.25;
      for(let d=-12;d<=12;d+=.5)if(hit(kerbs,p.pos[0]+p.right[0]/h*side*(edge+d),p.pos[2]+p.right[2]/h*side*(edge+d)))return true;
      return Boolean(r.kerb);
    });
    // Close short raster cracks only when kerb geometry bounds both ends.
    for(let i=0;i<presence.length;i++)if(!presence[i]){let j=i+1;while(j<presence.length&&!presence[j])j++;if(i>0&&j<presence.length&&j-i<=3)presence.fill(true,i,j);i=j-1;}
    for(let i=0;i<presence.length;i++)if(presence[i]){let j=i+1;while(j<presence.length&&presence[j])j++;const seeds=rows.slice(i,j).filter(r=>r.kerb).length;if(seeds)kerbRuns.push({side,start:rows[i].index,end:Math.min(reference.points.length-1,rows[j-1].index+4),sourceSeeds:seeds});i=j-1;}
  }
  const corners=[{turn:1,start:620,end:1000,color:4},{turn:3,start:2120,end:2480,color:3},{turn:9,start:5960,end:6320,color:3},{turn:10,start:6320,end:6740,color:3}],aprons=[];
  for(const corner of corners){
    const rows=[];
    for(let index=corner.start;index<=corner.end;index+=4){
      const p=reference.points[index],h=Math.hypot(p.right[0],p.right[2]),edge=Math.max(1,40/(p.wr+p.wl))*p.wr/1.5;
      let first=null,last=null,gap=0;
      for(let d=2;d<=220;d++){
        if(hit(paved,p.pos[0]+p.right[0]/h*(edge+d),p.pos[2]+p.right[2]/h*(edge+d))){if(first===null)first=d;last=d;gap=0;}else if(first!==null&&++gap>8&&corner.turn<9)break;
      }
      if(first!==null&&(first<=20||corner.turn>=9)&&last>=15)rows.push({index,inner:2.2,outer:last});else rows.push({index,inner:null,outer:null});
    }
    for(let i=0;i<rows.length;i++)if(rows[i].outer===null){let j=i+1;while(j<rows.length&&rows[j].outer===null)j++;if(i>0&&j<rows.length&&j-i<=(corner.turn===3?8:3))for(let k=i;k<j;k++){const t=(k-i+1)/(j-i+1);rows[k].inner=2.2;rows[k].outer=rows[i-1].outer*(1-t)+rows[j].outer*t;}i=j-1;}
    for(let i=0;i<rows.length;i++)if(rows[i].outer!==null){let j=i+1;while(j<rows.length&&rows[j].outer!==null)j++;if(j-i<8)for(let k=i;k<j;k++){rows[k].inner=null;rows[k].outer=null;}i=j-1;}
    // Suppress subpixel width noise; keep the measured footprint rather than
    // painting texture fragments as hundreds of isolated runoff pieces.
    const smooth=rows.map((r,i)=>r.outer===null?r:{...r,outer:rows.slice(Math.max(0,i-2),Math.min(rows.length,i+3)).filter(q=>q.outer!==null).map(q=>q.outer).sort((a,b)=>a-b).at(Math.floor(rows.slice(Math.max(0,i-2),Math.min(rows.length,i+3)).filter(q=>q.outer!==null).length/2))});
    aprons.push({...corner,side:1,records:smooth});
  }
  features.tidy={method:'Dedicated kerb geometry with bounded crack filling; native paved footprints at Turns 1, 3, 9 and 10',kerbRuns,aprons,sandKeepRange:[3200,5500]};
  return features;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const here=path.dirname(fileURLToPath(import.meta.url)),read=n=>JSON.parse(fs.readFileSync(path.join(here,'source',n))),reference=read('red-bull-ring-reference.json'),features=tidyFeatures(reference,loadTidySurfaces(path.join(here,'source/redbullring.glb')),read('red-bull-ring-features.json'));
  fs.writeFileSync(path.join(here,'source/red-bull-ring-features.json'),JSON.stringify(features));
  console.log(JSON.stringify({kerbs:features.tidy.kerbRuns,aprons:features.tidy.aprons.map(a=>({turn:a.turn,records:a.records.filter(r=>r.outer!==null).length,maxWidth:Math.max(...a.records.map(r=>r.outer??0))}))},null,2));
}
