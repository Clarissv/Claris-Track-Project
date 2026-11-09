import {boxCorners,boxBasis} from '../geometry.mjs';

export function footprint(part){
  const points=boxCorners(part).map(p=>[p[0],p[2]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),half=[];
  for(const p of points){while(half.length>1&&cross(half.at(-2),half.at(-1),p)<=1e-10)half.pop();half.push(p);}
  const lower=half.slice(0,-1);half.length=0;
  for(const p of [...points].reverse()){while(half.length>1&&cross(half.at(-2),half.at(-1),p)<=1e-10)half.pop();half.push(p);}
  return [...lower,...half.slice(0,-1)];
}
export function intersectsDomain(part,domain){
  const poly=footprint(part),[x,z]=domain.center,r=domain.halfSize+(domain.guard??0),rect=[[x-r,z-r],[x+r,z-r],[x+r,z+r],[x-r,z+r]],axes=[[1,0],[0,1]];
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];axes.push([b[1]-a[1],a[0]-b[0]]);}
  for(const axis of axes){const a=poly.map(p=>p[0]*axis[0]+p[1]*axis[1]),b=rect.map(p=>p[0]*axis[0]+p[1]*axis[1]);if(Math.max(...a)<Math.min(...b)-1e-7||Math.max(...b)<Math.min(...a)-1e-7)return false;}
  return true;
}
export function distanceToPart(part,point){
  const poly=footprint(part),probe={center:point,halfSize:0};if(intersectsDomain(part,probe))return 0;
  return Math.min(...poly.map((a,i)=>{const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dz);}));
}
function slice(part,axis,from,to){
  const p=[...part],basis=boxBasis(p),direction=axis===3?basis.right:basis.back;
  for(let k=0;k<3;k++)p[k]+=direction[k]*(from+to)/2;
  p[axis]=to-from;return p;
}
export function carveTerrain(part,domain){
  if(!intersectsDomain(part,domain))return [[...part]];
  const [x,z]=domain.center,r=domain.halfSize+(domain.guard??0),basis=boxBasis(part),R=basis.right,B=basis.back,U=basis.up,det=R[0]*B[2]-R[2]*B[0],local=[];
  if(Math.abs(det)<.5)throw Error('A terrain solid is too steep to carve beside the start');
  // Project the complete vertical domain back to the slab's right/back
  // coordinates at both thickness faces. The resulting local rectangle
  // includes every potentially intersecting point, even a buried bottom
  // corner of a tall tilted solid. Four broad remnants keep clean straight
  // edges instead of making hundreds of little blocks around the opening.
  for(const q of [[x-r,z-r],[x+r,z-r],[x+r,z+r],[x-r,z+r]])for(const t of [-part[4]/2,part[4]/2]){
    const dx=q[0]-part[0]-U[0]*t,dz=q[1]-part[2]-U[2]*t;local.push([(dx*B[2]-dz*B[0])/det,(R[0]*dz-R[2]*dx)/det]);
  }
  const left=-part[3]/2,right=part[3]/2,front=-part[5]/2,back=part[5]/2,l=Math.max(left,Math.min(...local.map(p=>p[0]))),h=Math.min(right,Math.max(...local.map(p=>p[0]))),f=Math.max(front,Math.min(...local.map(p=>p[1]))),b=Math.min(back,Math.max(...local.map(p=>p[1]))),pieces=[];
  if(l>left+.001)pieces.push(slice(part,3,left,l));if(h<right-.001)pieces.push(slice(part,3,h,right));
  if(h-l>.001){const middle=slice(part,3,l,h);if(f>front+.001)pieces.push(slice(middle,5,front,f));if(b<back-.001)pieces.push(slice(middle,5,b,back));}
  return pieces;
}
