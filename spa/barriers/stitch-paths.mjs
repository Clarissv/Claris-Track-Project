import {distance} from '../reference-paths.mjs';

// Rail posts branch the footprint skeleton every few metres. Continue through
// an existing shared junction in its straightest direction, leaving post spurs
// and genuine gate endpoints separate. No road-offset perimeter is generated.
export function stitchPaths(source){
  const paths=structuredClone(source),key=q=>q.map(v=>Math.floor(v/9)).join(':');let changed=true,joins=0;
  while(changed){
    changed=false;const endpoints=new Map();
    for(let i=0;i<paths.length;i++)if(paths[i]&&!paths[i].closed)for(const end of [0,1]){const q=end?paths[i].path.at(-1):paths[i].path[0],cell=q.map(v=>Math.floor(v/9));for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const k=paths[i].role+':'+[cell[0]+dx,cell[1]+dz].join(':');if(!endpoints.has(k))endpoints.set(k,[]);endpoints.get(k).push({i,end});}}
    let best;
    for(const cluster of endpoints.values())for(let a=0;a<cluster.length;a++)for(let b=a+1;b<cluster.length;b++){
      const A=cluster[a],B=cluster[b];if(A.i===B.i)continue;
      const pa=paths[A.i].path,pb=paths[B.i].path,q=A.end?pa.at(-1):pa[0],join=B.end?pb.at(-1):pb[0];if(distance(q,join)>6.5)continue;const before=A.end?pa.at(-2):pa[1],after=B.end?pb.at(-2):pb[1],u=q.map((v,k)=>v-before[k]),v=after.map((x,k)=>x-join[k]),bridge=join.map((x,k)=>x-q[k]),gap=Math.hypot(...bridge),aligned=gap<.01||(u[0]*bridge[0]+u[1]*bridge[1])/(Math.hypot(...u)*gap)>.5&&(v[0]*bridge[0]+v[1]*bridge[1])/(Math.hypot(...v)*gap)>.5,dot=(u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*Math.hypot(...v));
      if(aligned&&dot>.65&&(!best||dot>best.dot))best={A,B,dot};
    }
    if(best){const {A,B}=best,a=paths[A.i],b=paths[B.i],pa=A.end?a.path:[...a.path].reverse(),pb=B.end?[...b.path].reverse():b.path;
      a.path=[...pa,...(distance(pa.at(-1),pb[0])<.01?pb.slice(1):pb)];a.sourceLength+=b.sourceLength;a.closed=distance(a.path[0],a.path.at(-1))<.01;paths[B.i]=null;joins++;changed=true;
    }
  }
  return {paths:paths.filter(Boolean),joins};
}
