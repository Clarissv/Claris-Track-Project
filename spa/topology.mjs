import {skeletonize} from '../red-bull-ring/track-geometry.mjs';

// Extract connected skeletons separately: nearby service roads never create
// a manufactured connection across the racing circuit.
export function skeletonPaths(mask,nx,nz){
  const thin=skeletonize(mask,nx,nz),seen=new Uint8Array(thin.length),paths=[];
  const neighbours=i=>{const x=i%nx,z=Math.floor(i/nx),out=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)if(dx||dz){const a=x+dx,b=z+dz,k=b*nx+a;if(a>=0&&a<nx&&b>=0&&b<nz&&thin[k])out.push(k);}return out;};
  function walk(start){const queue=[start],parent=new Map([[start,null]]);for(let j=0;j<queue.length;j++)for(const k of neighbours(queue[j]))if(!parent.has(k)){parent.set(k,queue[j]);queue.push(k);}return {far:queue.at(-1),parent,queue};}
  for(let i=0;i<thin.length;i++)if(thin[i]&&!seen[i]){const first=walk(i);for(const k of first.queue)seen[k]=1;const end=walk(first.far),path=[];for(let k=end.far;k!==null;k=end.parent.get(k))path.push(k);if(path.length>20)paths.push(path);}
  return paths.sort((a,b)=>b.length-a.length);
}
