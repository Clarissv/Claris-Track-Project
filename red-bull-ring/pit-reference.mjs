import {rasterize} from './mesh-geometry.mjs';
import {skeletonize,KDTree,dot} from './track-geometry.mjs';
import {finishPoints,gridTree,sampleHeight} from './reference.mjs';

function components(primitive){
  const {positions,indices}=primitive,weld=new Map(),ids=new Map(),triangles=[],edges=new Map(),adj=[];
  for(let t=0;t<indices.length;t+=3){
    const vertices=[];
    for(let j=0;j<3;j++){const i=indices[t+j];if(!ids.has(i)){const k=[0,1,2].map(a=>Math.round(positions[i*3+a]*1000)).join(':');if(!weld.has(k))weld.set(k,weld.size);ids.set(i,weld.get(k));}vertices.push(ids.get(i));}
    const index=triangles.length;triangles.push(Array.from(indices.subarray(t,t+3)));adj.push([]);
    for(let j=0;j<3;j++){const k=[vertices[j],vertices[(j+1)%3]].sort((a,b)=>a-b).join(':');for(const other of edges.get(k)??[]){adj[index].push(other);adj[other].push(index);}if(!edges.has(k))edges.set(k,[]);edges.get(k).push(index);}
  }
  const seen=new Set(),result=[];
  for(let start=0;start<triangles.length;start++)if(!seen.has(start)){
    const list=[start];seen.add(start);for(let j=0;j<list.length;j++)for(const t of adj[list[j]])if(!seen.has(t)){seen.add(t);list.push(t);}
    result.push({triangles:list.length,indices:Uint32Array.from(list.flatMap(t=>triangles[t]))});
  }
  return result;
}
function diameter(mask,nx,nz){
  const thin=skeletonize(mask,nx,nz);
  function traverse(start){
    const queue=[start],distance=new Map([[start,0]]),parent=new Map();let far=start;
    for(let j=0;j<queue.length;j++){
      const i=queue[j],x=i%nx,z=Math.floor(i/nx);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const px=x+dx,pz=z+dz;if(px<0||pz<0||px>=nx||pz>=nz)continue;const k=pz*nx+px;if(thin[k]&&!distance.has(k)){distance.set(k,distance.get(i)+Math.hypot(dx,dz));parent.set(k,i);queue.push(k);if(distance.get(k)>distance.get(far))far=k;}}
    }
    return {far,parent,count:queue.length};
  }
  const first=thin.findIndex(Boolean),end=traverse(traverse(first).far),indices=[];
  for(let i=end.far;i!==undefined;i=end.parent.get(i))indices.push(i);
  if(end.count!==thin.reduce((s,n)=>s+n,0))throw Error('Native pit components are disconnected in the raster');
  return indices;
}
function joinPavedSeams(mask,grid,scene,reference){
  const {nx,nz}=grid,seen=new Uint8Array(mask.length),islands=[];
  for(let start=0;start<mask.length;start++)if(mask[start]&&!seen[start]){
    const list=[start];seen[start]=1;for(let j=0;j<list.length;j++){const i=list[j],x=i%nx,z=Math.floor(i/nx);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const px=x+dx,pz=z+dz;if(px<0||px>=nx||pz<0||pz>=nz)continue;const k=pz*nx+px;if(mask[k]&&!seen[k]){seen[k]=1;list.push(k);}}}islands.push(list);
  }
  islands.sort((a,b)=>b.length-a.length);if(islands.length===1)return [];
  const paved=rasterize({...scene,primitives:scene.primitives.filter(p=>p.role==='road'||p.role==='runoff')},reference.raster.width,1),merged=[...islands[0]],bridges=[];
  const racingLine=new KDTree(reference.points.slice(0,-1).filter((_,i)=>i%4===0).map(p=>[p.pos[0]/reference.raster.factor+nx/2,p.pos[2]/reference.raster.factor+nz/2]));
  for(const island of islands.slice(1)){
    const tree=new KDTree(merged.filter(i=>Number.isFinite(paved.heights[i])).map(i=>[i%nx,Math.floor(i/nx),i]));let closest;
    for(const i of island){if(!Number.isFinite(paved.heights[i]))continue;const q=tree.nearest([i%nx,Math.floor(i/nx)]);if(!closest||q.distance<closest.distance)closest={from:q.point[2],to:i,distance:q.distance};}
    if(Math.sqrt(closest.distance)>80)throw Error('A pit component is too far from native pavement');
    const goal=closest.to,ax=closest.from%nx,az=Math.floor(closest.from/nx),gx=goal%nx,gz=Math.floor(goal/nx),frontier=[[0,closest.from]],distance=new Map([[closest.from,0]]),parent=new Map();let found=false;
    while(frontier.length){frontier.sort((a,b)=>b[0]-a[0]);const [,i]=frontier.pop();if(i===goal){found=true;break;}const x=i%nx,z=Math.floor(i/nx);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const px=x+dx,pz=z+dz;if(px<Math.min(ax,gx)-24||px>Math.max(ax,gx)+24||pz<Math.min(az,gz)-24||pz>Math.max(az,gz)+24||px<0||px>=nx||pz<0||pz>=nz)continue;const k=pz*nx+px;if(!Number.isFinite(paved.heights[k]))continue;const mainDistance=Math.sqrt(racingLine.nearest([px,pz]).distance),penalty=(paved.roles[k]==='road'?1:30)+Math.max(0,16-mainDistance)*12,cost=distance.get(i)+Math.hypot(dx,dz)*penalty;if(cost<(distance.get(k)??Infinity)){distance.set(k,cost);parent.set(k,i);frontier.push([cost+Math.hypot(px-gx,pz-gz),k]);}}
    }
    if(!found)throw Error('Native pit seam has no existing pavement path: '+JSON.stringify({from:[ax,az],to:[gx,gz],islandSize:island.length}));
    const path=[];for(let i=goal;i!==undefined;i=parent.get(i)){path.push(i);mask[i]=1;grid.heights[i]=paved.heights[i];grid.slopesX[i]=paved.slopesX[i];grid.slopesZ[i]=paved.slopesZ[i];}
    bridges.push({pixels:path.length,method:'Follow the narrow grey pavement around the turn; avoid the main-racing-road shortcut'});merged.push(...island,...path);
  }
  return bridges;
}
export function extractPit(reference,scene){
  if(reference.sourceSha256!=='4eefb175d9d3644549c781c96f0ecdb4bdd7983b601acc9bf06442bad81a1bde')throw Error('Reinspect native pit components for a changed model');
  const road=scene.primitives.find(p=>p.role==='road');
  // Reviewed native strips: long inner entry, pit straight and Turn 1 exit.
  // Exclude the disconnected 397-triangle strip and short 246-triangle entry.
  const counts=[459,782,343,55],selected=components(road).filter(c=>counts.includes(c.triangles));
  if(selected.length!==counts.length)throw Error('Native pit pieces could not be identified');
  const grid=rasterize({...scene,primitives:selected.map(c=>({...road,indices:c.indices}))},reference.raster.width,1),mask=Uint8Array.from(grid.heights,h=>Number.isFinite(h)?1:0);
  // Join subpixel seams for skeletonization only; measured paving is intact.
  const joined=mask.slice();for(let z=1;z<grid.nz-1;z++)for(let x=1;x<grid.nx-1;x++)if(mask[z*grid.nx+x])for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)joined[(z+dz)*grid.nx+x+dx]=1;
  const seams=joinPavedSeams(joined,grid,scene,reference);
  let vertices=diameter(joined,grid.nx,grid.nz).map(i=>[i%grid.nx+.5-grid.nx/2,Math.floor(i/grid.nx)+.5-grid.nz/2]);
  vertices=vertices.map((p,i)=>{if(i===0||i===vertices.length-1)return p;const radius=p[0]+grid.nx/2>940?7:3,a=vertices.slice(Math.max(0,i-radius),Math.min(vertices.length,i+radius+1));return [0,1].map(k=>a.reduce((s,q)=>s+q[k],0)/a.length);}).filter((_,i,a)=>i%2===0||i===a.length-1);
  const frame=reference.raster,main=reference.points,routeTree=new KDTree(main.slice(0,-1).filter((_,i)=>i%4===0).map(p=>[p.pos[0]/frame.factor,p.pos[2]/frame.factor,p.s]));
  const middle=routeTree.nearest(vertices[Math.floor(vertices.length/2)]).point[2],near=main.reduce((a,b)=>Math.abs(b.s-middle)<Math.abs(a.s-middle)?b:a,main[0]);
  const forward=[-near.right[2],0,near.right[0]],delta=[vertices.at(-1)[0]-vertices[0][0],0,vertices.at(-1)[1]-vertices[0][1]];
  if(dot(forward,delta)<0)vertices.reverse();
  const tree=gridTree(grid);let maxPavementDistance=0;
  const points=vertices.map(q=>{const h=sampleHeight(grid,tree,...q);maxPavementDistance=Math.max(maxPavementDistance,h.distance);return {pos:[q[0]*frame.factor,h.height*frame.factor,q[1]*frame.factor],wr:6,wl:6,bank:0};});
  finishPoints(points,false);
  const nearestIndex=p=>{let index=0,d=Infinity;for(let i=0;i<main.length-1;i++){const q=main[i].pos,n=(q[0]-p.pos[0])**2+(q[2]-p.pos[2])**2;if(n<d){d=n;index=i;}}return index;};
  return {points,mask,meta:{entryMainIndex:nearestIndex(points[0]),exitMainIndex:nearestIndex(points.at(-1)),nativeTriangleCounts:counts,paintedSeams:seams,maxPavementDistancePixels:maxPavementDistance,sourceLengthStuds:points.at(-1).s,method:'Native narrow-road components; existing entry and exit; no added connectors'}};
}
