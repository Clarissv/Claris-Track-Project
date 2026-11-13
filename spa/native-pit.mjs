import {KDTree} from '../red-bull-ring/track-geometry.mjs';
import {gridTree,sampleHeight,finishPoints} from '../red-bull-ring/reference.mjs';
import {simplify} from './reference-paths.mjs';

export function completeNativePit(reference,grid,core){
  const {nx,nz}=grid,factor=reference.raster.factor,main=reference.points.slice(0,-1),tree=new KDTree(main.map(p=>[p.pos[0]/factor,p.pos[2]/factor])),surface=gridTree(grid);
  const allowed=Uint8Array.from(grid.heights,h=>Number.isFinite(h)?1:0);for(let z=2;z<nz-2;z++)for(let x=2;x<nx-2;x++)if(Number.isFinite(grid.heights[z*nx+x]))for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(dx*dx+dz*dz<=4)allowed[(z+dz)*nx+x+dx]=1;
  const entryMainIndex=1365*4,exitMainIndex=95*4;
  const coordinate=p=>[p[0]/factor+nx/2,p[2]/factor+nz/2];
  const cell=p=>{const q=coordinate(p),h=sampleHeight(grid,surface,q[0]-nx/2,q[1]-nz/2),nearest=surface.nearest([q[0]-nx/2,q[1]-nz/2]).point;return Math.floor(nearest[1]+nz/2)*nx+Math.floor(nearest[0]+nx/2);};
  const position=i=>[i%nx+.5-nx/2,Math.floor(i/nx)+.5-nz/2];
  function connect(a,b){
    const start=cell(a),goal=cell(b),sa=position(start),sb=position(goal),dist=new Map([[start,0]]),parents=new Map(),heap=[[0,start]];
    const push=item=>{heap.push(item);let i=heap.length-1;while(i){const j=(i-1)>>1;if(heap[j][0]<=item[0])break;heap[i]=heap[j];i=j;}heap[i]=item;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1][0]<heap[j][0])j++;if(heap[j][0]>=last[0])break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;};
    const seen=new Set(),margin=90,minX=Math.min(sa[0],sb[0])+nx/2-margin,maxX=Math.max(sa[0],sb[0])+nx/2+margin,minZ=Math.min(sa[1],sb[1])+nz/2-margin,maxZ=Math.max(sa[1],sb[1])+nz/2+margin;
    while(heap.length){const [,i]=pop();if(seen.has(i))continue;seen.add(i);if(i===goal)break;const x=i%nx,z=Math.floor(i/nx);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const px=x+dx,pz=z+dz,k=pz*nx+px;if(px<0||px>=nx||pz<0||pz>=nz||px<minX||px>maxX||pz<minZ||pz>maxZ||!allowed[k]||seen.has(k))continue;
        const q=position(k),mainDistance=Math.sqrt(tree.nearest(q).distance),portal=Math.min(Math.hypot(q[0]-sa[0],q[1]-sa[1]),Math.hypot(q[0]-sb[0],q[1]-sb[1])),penalty=portal<28?0:Math.max(0,17-mainDistance)**2*2,cost=dist.get(i)+Math.hypot(dx,dz)*(1+penalty);
        if(cost<(dist.get(k)??Infinity)){dist.set(k,cost);parents.set(k,i);push([cost+Math.hypot(q[0]-sb[0],q[1]-sb[1]),k]);}
      }
    }
    if(!parents.has(goal))throw Error('Native pit connection has no source pavement path: '+JSON.stringify({sa,sb,seen:seen.size,start,goal}));
    const path=[];for(let i=goal;i!==undefined;i=parents.get(i))path.push(position(i));path.reverse();
    return simplify(path,1.2).flatMap((q,i,all)=>{if(!i)return [q];const a=all[i-1],n=Math.ceil(Math.hypot(q[0]-a[0],q[1]-a[1])/2);return Array.from({length:n},(_,j)=>a.map((v,k)=>v+(q[k]-v)*(j+1)/n));}).map(q=>{const h=sampleHeight(grid,surface,...q);return {pos:[q[0]*factor,h.height*factor,q[1]*factor],wr:9,wl:9,bank:0};});
  }
  const start=main[entryMainIndex],end=main[exitMainIndex],entry=connect(start.pos,core[0].pos),exit=connect(core.at(-1).pos,end.pos);
  const points=[{...start,wr:9,wl:9},...entry.slice(1,-1),...structuredClone(core),...exit.slice(1,-1),{...end,wr:9,wl:9}];finishPoints(points,false);
  return {points,route:{entryMainIndex,exitMainIndex,planeStartMainIndex:1330*4,planeEndMainIndex:123*4,straightStartIndex:entry.length,straightEndIndex:entry.length+core.length-1,entryConnectionSamples:entry.length,exitConnectionSamples:exit.length,nativeMaterials:[84,60,75,46,61,59],method:'GLB paved pit entry at the final chicane, native modern pit strip, paved hairpin bypass and rejoin just after La Source; old downhill pit straight excluded'}};
}
