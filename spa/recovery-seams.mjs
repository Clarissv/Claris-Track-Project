import {topFootprint,topHeight} from '../red-bull-ring/surface-audit.mjs';
import {boxBasis} from '../red-bull-ring/geometry.mjs';
import {terrainSlab} from '../red-bull-ring/terrain-slab.mjs';
import {polygonDistance} from './reference-paths.mjs';

// Wide aprons can overlap on the outside of a bend. Extend the taller
// surface with a gradual ramp instead of exposing its rectangle's lip.
export function reconcileRecovery(parts,spans,paint,fitRoad){
  const buckets=new Map(),cell=64,reach=96;
  for(let i=0;i<parts.length;i++)if(spans[i].inner<0){
    const p=parts[i],poly=topFootprint(p),xs=poly.map(q=>q[0]),zs=poly.map(q=>q[1]);
    for(let x=Math.floor((Math.min(...xs)-reach)/cell);x<=Math.floor((Math.max(...xs)+reach)/cell);x++)for(let z=Math.floor((Math.min(...zs)-reach)/cell);z<=Math.floor((Math.max(...zs)+reach)/cell);z++){
      const key=x+':'+z;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({p,poly,index:i});
    }
  }
  const field=(x,z,fallback,index)=>{
    let value=fallback;
    for(const {p,poly,index:other} of buckets.get(Math.floor(x/cell)+':'+Math.floor(z/cell))??[]){
      if(Math.abs(spans[other].start-spans[index].start)>400)continue;
      const d=polygonDistance([x,z],poly);if(d>reach)continue;
      value=Math.max(value,topHeight(p,x,z)-.2-.12*d);
    }
    return value;
  };
  const result=[],outSpans=[];
  for(let i=0;i<parts.length;i++){
    const original=parts[i],span=spans[i];
    if(span.inner>=0){result.push(original);outSpans.push({...span,index:result.length-1});continue;}
    const basis=boxBasis(original),rx=basis.right[0],rz=basis.right[2],rh=Math.hypot(rx,rz),R=[rx/rh,rz/rh],T=[-R[1],R[0]],W=original[3]*rh,D=original[5]*Math.hypot(basis.back[0],basis.back[2]);
    const emit=(cx,cz,w,d)=>{
      const at=(a,b)=>{const x=cx+R[0]*a+T[0]*b,z=cz+R[1]*a+T[1]*b;return field(x,z,topHeight(original,x,z),i);};
      const probes=[];let widthError=0,lengthError=0;
      for(const a of [-.5,-.25,0,.25,.5])for(const b of [-.5,-.25,0,.25,.5]){const x=a*w,z=b*d;probes.push({x,z,actual:at(x,z)});}
      const center=probes.reduce((v,q)=>v+q.actual,0)/probes.length,bank=probes.reduce((v,q)=>v+q.x*q.actual,0)/probes.reduce((v,q)=>v+q.x*q.x,0),along=probes.reduce((v,q)=>v+q.z*q.actual,0)/probes.reduce((v,q)=>v+q.z*q.z,0);
      for(const q of probes){q.predicted=center+bank*q.x+along*q.z;if(!q.z)widthError=Math.max(widthError,Math.abs(q.actual-q.predicted));if(!q.x)lengthError=Math.max(lengthError,Math.abs(q.actual-q.predicted));}
      const error=Math.max(...probes.map(q=>Math.abs(q.actual-q.predicted)));
      const colors=paint?new Set(probes.map(q=>paint(cx+R[0]*q.x+T[0]*q.z,cz+R[1]*q.x+T[1]*q.z)??5)):null;
      const refineHeight=error>.15&&(w>8||d>8),refineColor=colors?.size>1&&(w>160||d>200);
      if(refineHeight||refineColor){
        const across=refineHeight?w>8&&(d<=8||widthError>=lengthError):w>160&&(d<=200||w>=d);
        for(const sign of [-1,1])emit(cx+(across?R[0]*w:T[0]*d)*sign/4,cz+(across?R[1]*w:T[1]*d)*sign/4,across?w/2:w,across?d:d/2);
        return;
      }
      const lowering=Math.max(0,...probes.map(q=>q.predicted-q.actual)),height=center-lowering;
      const line=[-1,1].map(sign=>({pos:[cx+T[0]*d*sign/2,height+along*d*sign/2,cz+T[1]*d*sign/2],bank,wr:w/2,wl:w/2,surfaceRight:[R[0],0,R[1]]}));
      const p=terrainSlab(line,0,1,{minimumHeight:-Infinity});p[6]=original[6];
      const fit=fitRoad([p]);
      if(fit.maximumLowering>.08&&(w>8||d>8)){
        const across=w>8&&(d<=8||w>=d);
        for(const sign of [-1,1])emit(cx+(across?R[0]*w:T[0]*d)*sign/4,cz+(across?R[1]*w:T[1]*d)*sign/4,across?w/2:w,across?d:d/2);
        return;
      }
      result.push(fit.parts[0]);outSpans.push({...span,index:result.length-1});
    };
    emit(original[0],original[2],W,D);
  }
  return {parts:result,spans:outSpans};
}
