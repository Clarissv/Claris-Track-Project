import {makeSlab,boxBasis,round} from './geometry.mjs';
import {add,sub,mul,dot} from './track-geometry.mjs';
import {overlapVertices,topHeight,topFootprint} from './surface-audit.mjs';

// Fit the smallest oriented rectangle containing the lane samples. This replaces
// the extra overlap allowance and angle-based extension in the previous builder.
export function fittedSlab(points,a,b,{width,bias=0,thickness=.5,color=1,lift=0,guard=.006}={}){
  const p=makeSlab(points[a],points[b],width??Math.max(...points.slice(a,b+1).map(p=>p.wr+p.wl)),bias,thickness,color,lift,0),basis=boxBasis(p),top=add(p.slice(0,3),mul(basis.up,thickness/2));
  let w=0,l=0;
  for(let i=a;i<=b;i++){
    const q=points[i],h=Math.hypot(q.right[0],q.right[2]);
    for(const d of width===undefined?[-q.wl,q.wr]:[bias-width/2,bias+width/2]){
      const sample=add(q.pos,mul(q.right,d/h)),delta=sub(sample,top);w=Math.max(w,2*Math.abs(dot(delta,basis.right)));l=Math.max(l,2*Math.abs(dot(delta,basis.back)));
    }
  }
  p[3]=round(w+guard);p[5]=round(l+guard);
  return p;
}
export function joinStep(a,b){let maximum=0;for(const [x,z] of overlapVertices(a,b))maximum=Math.max(maximum,Math.abs(topHeight(a,x,z)-topHeight(b,x,z)));return maximum;}
function overlappingPairs(parts){
  const cells=new Map(),pairs=[],size=64;
  for(const [j,p] of parts.entries()){
    const v=topFootprint(p),xs=v.map(q=>q[0]),zs=v.map(q=>q[1]),keys=[],near=new Set();
    for(let x=Math.floor(Math.min(...xs)/size);x<=Math.floor(Math.max(...xs)/size);x++)for(let z=Math.floor(Math.min(...zs)/size);z<=Math.floor(Math.max(...zs)/size);z++){const k=`${x}:${z}`;keys.push(k);for(const i of cells.get(k)??[])near.add(i);}
    for(const i of near)if(overlapVertices(parts[i],p).length)pairs.push([i,j]);
    for(const k of keys){if(!cells.has(k))cells.set(k,[]);cells.get(k).push(j);}
  }
  return pairs;
}
export function refineRoad(points,initial,{closed=true,maxStep=.012,maxParts=4500,...options}={}){
  let spans=initial.map(([a,b])=>({a,b}));
  for(let iteration=0;iteration<14;iteration++){
    const parts=spans.map(s=>fittedSlab(points,s.a,s.b,options)),split=new Set();
    const pairs=overlappingPairs(parts);
    for(const [i,j] of pairs){
      if(joinStep(parts[i],parts[j])<=maxStep)continue;
      const a=spans[i],b=spans[j],candidate=a.b-a.a>=b.b-b.a?i:j;
      if(spans[candidate].b-spans[candidate].a>1)split.add(candidate);
    }
    if(!split.size){
      const maximum=Math.max(...pairs.map(([i,j])=>joinStep(parts[i],parts[j])));
      if(maximum>maxStep+.0002){const worst=pairs.reduce((a,p)=>joinStep(parts[p[0]],parts[p[1]])>joinStep(parts[a[0]],parts[a[1]])?p:a,pairs[0]);throw Error('Source corner needs a shared plane before road fitting: '+JSON.stringify({maximum,worst:worst.map(i=>spans[i]),positions:worst.map(i=>parts[i].slice(0,3))}));}
      return {parts,spans:spans.map((s,i)=>({index:i,start:s.a,end:s.b})),maxStep:maximum};
    }
    spans=spans.flatMap((s,i)=>split.has(i)?[{a:s.a,b:(s.a+s.b)>>1},{a:(s.a+s.b)>>1,b:s.b}]:[s]);
    if(spans.length>maxParts)throw Error('Road joint refinement exceeds the road budget');
  }
  throw Error('Road joint refinement did not converge');
}
