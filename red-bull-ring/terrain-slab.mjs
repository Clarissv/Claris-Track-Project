import {boxCorners,round} from './geometry.mjs';
import {cross,dot,unit} from './track-geometry.mjs';

// Fit world-space edge samples. An offset line can reverse at an inside bend;
// its tangent must never turn a grass crossfall into an almost vertical plane.
export function terrainSlab(points,a,b,{minimumHeight=-Infinity}={}){
  const samples=[];
  for(let i=a;i<=b;i++){
    const q=points[i],r=q.surfaceRight;
    for(const d of [-q.wl,q.wr])samples.push([q.pos[0]+r[0]*d,q.pos[1]+q.bank*d,q.pos[2]+r[2]*d]);
  }
  const mean=[0,1,2].map(k=>samples.reduce((s,p)=>s+p[k],0)/samples.length);
  let xx=0,xz=0,zz=0,xy=0,zy=0;
  for(const p of samples){const x=p[0]-mean[0],z=p[2]-mean[2],y=p[1]-mean[1];xx+=x*x;xz+=x*z;zz+=z*z;xy+=x*y;zy+=z*y;}
  const determinant=xx*zz-xz*xz;
  let gx=determinant>1e-8?(xy*zz-zy*xz)/determinant:0,gz=determinant>1e-8?(zy*xx-xy*xz)/determinant:0;
  const slope=Math.hypot(gx,gz);if(slope>.85){gx*=.85/slope;gz*=.85/slope;}
  const r=points[(a+b)>>1].surfaceRight,up=unit([-gx,1,-gz]),right=unit([r[0],gx*r[0]+gz*r[2],r[2]]),back=cross(right,up);
  let width=0,length=0;
  for(const p of samples){const v=[p[0]-mean[0],gx*(p[0]-mean[0])+gz*(p[2]-mean[2]),p[2]-mean[2]];width=Math.max(width,2*Math.abs(dot(v,right)));length=Math.max(length,2*Math.abs(dot(v,back)));}
  const part=[...mean.map((v,k)=>v-up[k]*.125),Math.max(.001,width+.04),.25,Math.max(.001,length+.04),5,...right,...up].map((v,i)=>i>=7?Math.round(v*1e8)/1e8:round(v));
  const low=Math.min(...boxCorners(part).filter((_,i)=>i&2).map(p=>p[1]));
  if(low<minimumHeight)part[1]=round(part[1]+minimumHeight-low);
  return part;
}
