import {add,sub,mul,dot,cross,unit} from './track-geometry.mjs';
export const round=n=>Math.round(n*10000)/10000;
export function catmull(a,b,c,d,t) {
  return b.map((v,k)=>0.5*((2*v)+(-a[k]+c[k])*t+(2*a[k]-5*v+4*c[k]-d[k])*t*t+(-a[k]+3*v-3*c[k]+d[k])*t*t*t));
}
export function boxBasis(p) {return {right:p.slice(7,10),up:p.slice(10,13),back:cross(p.slice(7,10),p.slice(10,13))};}
export function boxCorners(p) {
  const {right,up,back}=boxBasis(p);
  return Array.from({length:8},(_,i)=>[0,1,2].map(k=>p[k]+((i&1)?1:-1)*right[k]*p[3]/2+((i&2)?1:-1)*up[k]*p[4]/2+((i&4)?1:-1)*back[k]*p[5]/2));
}
export function scalePlan(plan,scale) {
  if(!Number.isFinite(scale)||scale<=0)throw Error('Output scale must be positive and finite');
  const result=structuredClone(plan);
  for(const p of result.parts) {
    for(let k=0;k<6;k++)p[k]*=scale;
    if(p.slice(3,6).some(v=>v<0.001||v>2048))throw Error('Scaled part exceeds game client size limits');
  }
  for(const p of result.centerline)for(let k=0;k<6;k++)p[k]*=scale;
  const meta=result.meta,corners=result.parts.flatMap(boxCorners);
  meta.planBounds={min:[0,1,2].map(k=>Math.min(...corners.map(v=>v[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(v=>v[k])))};
  meta.width=round(meta.planBounds.max[0]-meta.planBounds.min[0]);
  meta.depth=round(meta.planBounds.max[2]-meta.planBounds.min[2]);
  meta.outputScale=(meta.outputScale??1)*scale;
  meta.settings.outputScale=meta.outputScale;
  meta.lapLengthStuds*=scale;
  meta.groundLift*=scale;
  meta.retainedHeightRange=meta.retainedHeightRange.map(h=>h*scale);
  if(meta.pitLane){meta.pitLane.widthStuds*=scale;meta.pitLane.lengthStuds*=scale;}
  return result;
}
export function makeSlab(a,b,width,bias,thickness,color,height=0,overlap=0.12) {
  const normal=unit(add(a.normal,b.normal)),initialAlong=unit(sub(b.pos,a.pos)),initialRight=unit(cross(normal,initialAlong));
  const ar=a.right??initialRight,br=b.right??initialRight;
  const ap=add(a.pos,mul(ar,bias/Math.hypot(ar[0],ar[2]))),bp=add(b.pos,mul(br,bias/Math.hypot(br[0],br[2])));
  const axis=sub(bp,ap);
  let along=unit(axis),right=unit(cross(normal,along)),up=unit(cross(along,right)),length=Math.hypot(...axis);
  if(up[1]<0.5) {
    // An inside offset can briefly fold at a hairpin. Keep its tiny strip on
    // the road plane instead of turning the height difference into a vertical fin.
    const projected=sub(axis,mul(normal,dot(axis,normal)));
    length=Math.hypot(...projected);
    along=length>1e-6?unit(projected):initialAlong;
    right=unit(cross(normal,along));up=unit(cross(along,right));
  }
  const horizontal=Math.hypot(right[0],right[2]);
  const cosine=(ar[0]*br[0]+ar[2]*br[2])/(Math.hypot(ar[0],ar[2])*Math.hypot(br[0],br[2]));
  const turn=Math.acos(Math.max(-1,Math.min(1,cosine)));
  const join=width/horizontal*Math.tan(Math.min(turn,0.35)/2);
  const top=add(mul(add(ap,bp),0.5),mul(up,height));
  const center=sub(top,mul(up,thickness/2));
  return [...center,width/horizontal,thickness,length+overlap+join,color,...right,...up].map(round);
}
export function adaptiveSegments(points,maxLength=24,tolerance=0.07,maxTurn=Infinity,planeTolerance=tolerance) {
  const segments=[];let i=0;
  while(i<points.length-1) {
    let last=i+1;
    for(let j=i+2;j<points.length;j++) {
      const a=points[i],b=points[j],axis=sub(b.pos,a.pos),length=Math.hypot(...axis);
      if(length>maxLength)break;
      const direction=unit(axis);let error=0,widthVariation=0,bankVariation=0;
      if(a.right&&b.right) {
        const cosine=(a.right[0]*b.right[0]+a.right[2]*b.right[2])/(Math.hypot(a.right[0],a.right[2])*Math.hypot(b.right[0],b.right[2]));
        if(Math.acos(Math.max(-1,Math.min(1,cosine)))>maxTurn)break;
      }
      for(let k=i+1;k<=j;k++) {
        const offset=sub(points[k].pos,a.pos),projection=dot(offset,direction);
        error=Math.max(error,Math.hypot(...sub(offset,mul(direction,projection))));
        widthVariation=Math.max(widthVariation,Math.abs(points[k].wr-a.wr),Math.abs(points[k].wl-a.wl));
        bankVariation=Math.max(bankVariation,Math.hypot(...sub(points[k].normal,a.normal)));
      }
      if(error>tolerance||widthVariation>0.18||bankVariation>0.025)break;
      const wr=Math.max(a.wr,b.wr),wl=Math.max(a.wl,b.wl),candidate=makeSlab(a,b,wr+wl,(wr-wl)/2,.5,1),basis=boxBasis(candidate),top=add(candidate.slice(0,3),mul(basis.up,.25));
      let surfaceError=0;
      for(let k=i;k<=j;k++) {
        const p=points[k],right=p.right??basis.right,horizontal=Math.hypot(right[0],right[2]);
        for(const side of [-1,0,1]) {
          const offset=side*(side>0?p.wr:p.wl)/horizontal,sample=add(p.pos,mul(right,offset));
          surfaceError=Math.max(surfaceError,Math.abs(dot(sub(sample,top),basis.up)));
        }
      }
      if(surfaceError>planeTolerance)break;
      last=j;
    }
    segments.push([i,last]);i=last;
  }
  return segments;
}
