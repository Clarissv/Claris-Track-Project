import {boxCorners} from './geometry.mjs';

const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
export const topHeight=(p,x,z)=>p[1]+p[4]/(2*p[11])-(p[10]*(x-p[0])+p[12]*(z-p[2]))/p[11];
export const topFootprint=p=>[2,3,7,6].map(i=>{const c=boxCorners(p)[i];return [c[0],c[2]];});
function inPolygon(poly,q,tolerance=1e-6) {
  const signs=poly.map((a,i)=>cross(sub(poly[(i+1)%4],a),sub(q,a)));
  return signs.every(d=>d>=-tolerance)||signs.every(d=>d<=tolerance);
}
export const inFootprint=(p,q,tolerance=1e-6)=>inPolygon(topFootprint(p),q,tolerance);
export function collisionSampler(parts) {
  const cells=new Map(),size=64;
  for(const part of parts){const polygon=topFootprint(part),xs=polygon.map(q=>q[0]),zs=polygon.map(q=>q[1]),surface={part,polygon};
    for(let x=Math.floor(Math.min(...xs)/size);x<=Math.floor(Math.max(...xs)/size);x++)for(let z=Math.floor(Math.min(...zs)/size);z<=Math.floor(Math.max(...zs)/size);z++){const key=`${x}:${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(surface);}}
  return (x,z)=>{let height=-Infinity;for(const {part,polygon} of cells.get(`${Math.floor(x/size)}:${Math.floor(z/size)}`)??[])if(inPolygon(polygon,[x,z]))height=Math.max(height,topHeight(part,x,z));return height;};
}
export function overlapVertices(a,b) {
  const pa=topFootprint(a),pb=topFootprint(b),vertices=[...pa.filter(q=>inPolygon(pb,q)),...pb.filter(q=>inPolygon(pa,q))];
  for(let i=0;i<4;i++)for(let j=0;j<4;j++) {
    const p=pa[i],q=pb[j],r=sub(pa[(i+1)%4],p),s=sub(pb[(j+1)%4],q),den=cross(r,s);
    if(Math.abs(den)<1e-12)continue;
    const t=cross(sub(q,p),s)/den,u=cross(sub(q,p),r)/den;
    if(t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8)vertices.push([p[0]+t*r[0],p[1]+t*r[1]]);
  }
  return vertices;
}

// Clip a convex surface footprint against another convex footprint. This lets
// kerb fitting distinguish the lane from a rectangular road's spare corners.
export function clipPolygon(polygon,clip) {
  const area=clip.reduce((sum,p,i)=>sum+cross(p,clip[(i+1)%clip.length]),0),sign=Math.sign(area);
  let result=polygon;
  for(let i=0;i<clip.length&&result.length;i++) {
    const a=clip[i],edge=sub(clip[(i+1)%clip.length],a),distance=p=>sign*cross(edge,sub(p,a)),next=[];
    for(let j=0;j<result.length;j++) {
      const p=result[j],q=result[(j+1)%result.length],dp=distance(p),dq=distance(q);
      if(dp>=-1e-8)next.push(p);
      if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);next.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
    }
    result=next;
  }
  return result;
}

// The difference of two top planes is linear, so its largest magnitude
// across their overlap occurs at a polygon vertex. This also checks extended
// corners, which testing the nominal shared centreline misses.
export function auditJoins(plan,spans,closed=false) {
  let maxOverlapStep=0,maxPitchChangeDegrees=0,worst=null;
  for(let i=0;i<spans.length-(closed?0:1);i++) {
    const a=plan.parts[spans[i].index],b=plan.parts[spans[(i+1)%spans.length].index],vertices=overlapVertices(a,b);
    if(!vertices.length)throw Error(`No surface overlap at ${spans[i].index}`);
    for(const [x,z] of vertices){const step=Math.abs(topHeight(a,x,z)-topHeight(b,x,z));if(step>maxOverlapStep){maxOverlapStep=step;worst=[spans[i].index,spans[(i+1)%spans.length].index];}}
    // Pitch change along the shared route's horizontal tangent, excluding
    // horizontal turn and banking from this vertical-crease measurement.
    const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),pitch=p=>Math.atan(-(p[10]*dx+p[12]*dz)/(p[11]*length));
    maxPitchChangeDegrees=Math.max(maxPitchChangeDegrees,Math.abs(pitch(a)-pitch(b))*180/Math.PI);
  }
  return {maxOverlapStep,maxPitchChangeDegrees,worst};
}
