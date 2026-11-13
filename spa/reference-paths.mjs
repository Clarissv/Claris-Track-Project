import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {skeletonize} from '../red-bull-ring/track-geometry.mjs';

export const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function segmentDistance(q,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],den=dx*dx+dz*dz,t=den?Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dz)/den)):0;return Math.hypot(q[0]-a[0]-t*dx,q[1]-a[1]-t*dz);}
export function polygonDistance(q,poly){const signs=poly.map((a,i)=>{const b=poly[(i+1)%poly.length];return (b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]);});if(signs.some(v=>Math.abs(v)>1e-8)&&(signs.every(v=>v>=0)||signs.every(v=>v<=0)))return 0;return Math.min(...poly.map((a,i)=>segmentDistance(q,a,poly[(i+1)%poly.length])));}
export function simplify(points,tolerance){if(points.length<3)return points;let worst=0,index=0;for(let i=1;i<points.length-1;i++){const d=segmentDistance(points[i],points[0],points.at(-1));if(d>worst){worst=d;index=i;}}if(worst<=tolerance)return [points[0],points.at(-1)];return [...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)];}
export const readReference=()=>JSON.parse(fs.readFileSync(new URL('reference-review/barrier-reference.json',import.meta.url)));

// Thin complete projected GLB faces, then trace their graph. Endpoints remain
// endpoints: circuit gates are never connected by a generated perimeter.
export function referencePaths(reference=readReference(),cell=2){
  const result=[];
  for(const [role,triangles] of Object.entries(reference.groups)){
    const vertices=triangles.flat(),min=[0,2].map(k=>Math.floor(vertices.reduce((v,p)=>Math.min(v,p[k]),Infinity)/cell)*cell-4*cell),max=[0,2].map(k=>Math.ceil(vertices.reduce((v,p)=>Math.max(v,p[k]),-Infinity)/cell)*cell+4*cell),nx=Math.ceil((max[0]-min[0])/cell),nz=Math.ceil((max[1]-min[1])/cell),mask=new Uint8Array(nx*nz);
    for(const face of triangles){const poly=face.map(p=>[p[0],p[2]]),xs=poly.map(p=>p[0]),zs=poly.map(p=>p[1]);
      for(let z=Math.max(1,Math.floor((Math.min(...zs)-min[1]-1)/cell));z<=Math.min(nz-2,Math.floor((Math.max(...zs)-min[1]+1)/cell));z++)for(let x=Math.max(1,Math.floor((Math.min(...xs)-min[0]-1)/cell));x<=Math.min(nx-2,Math.floor((Math.max(...xs)-min[0]+1)/cell));x++)if(polygonDistance([min[0]+(x+.5)*cell,min[1]+(z+.5)*cell],poly)<=1)mask[z*nx+x]=1;
    }
    const thin=skeletonize(mask,nx,nz),graph=new Map();
    for(let at=0;at<thin.length;at++)if(thin[at]){
      const neighbours=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const q=at+dz*nx+dx;if(!thin[q])continue;if(dx&&dz&&(thin[at+dx]||thin[at+dz*nx]))continue;neighbours.push(q);}graph.set(at,neighbours);
    }
    const seen=new Set(),edge=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`,position=at=>[min[0]+(at%nx+.5)*cell,min[1]+(Math.floor(at/nx)+.5)*cell];
    function trace(start,next){const ids=[start];let previous=start,current=next;seen.add(edge(start,next));
      while(true){ids.push(current);const choices=graph.get(current);if(current===start||choices.length!==2)break;const q=choices.find(n=>n!==previous);if(seen.has(edge(current,q)))break;seen.add(edge(current,q));previous=current;current=q;}
      let path=ids.map(position),length=path.slice(1).reduce((n,p,i)=>n+distance(path[i],p),0);if(length<5)return;
      const closed=ids[0]===ids.at(-1);if(closed){const mid=path.reduce((best,p,i)=>distance(p,path[0])>distance(path[best],path[0])?i:best,1);path=[...simplify(path.slice(0,mid+1),5).slice(0,-1),...simplify(path.slice(mid),2)];}else path=simplify(path,5);
      result.push({role,closed,sourceLength:length,path});
    }
    for(const [at,neighbours] of graph)if(neighbours.length!==2)for(const q of neighbours)if(!seen.has(edge(at,q)))trace(at,q);
    for(const [at,neighbours] of graph)for(const q of neighbours)if(!seen.has(edge(at,q)))trace(at,q);
  }
  return result;
}
