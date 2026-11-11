import {finishPoints} from './lib/reference.mjs';
import {unit,cross,sub} from './lib/track-geometry.mjs';
export function tidyBarrierLine(source){
  let points=source.map((p,i)=>({...p,pos:[...p.pos],sourceIndex:p.sourceIndex??i})),removedLoops=0;
  for(let pass=0;pass<30;pass++){
    const cells=new Map();let found;
    for(let i=0;i<points.length-1&&!found;i++){
      const a=points[i].pos,b=points[i+1].pos,keys=[],near=new Set();
      for(let x=Math.floor(Math.min(a[0],b[0])/80);x<=Math.floor(Math.max(a[0],b[0])/80);x++)for(let z=Math.floor(Math.min(a[2],b[2])/80);z<=Math.floor(Math.max(a[2],b[2])/80);z++){const k=`${x}:${z}`;keys.push(k);for(const j of cells.get(k)??[])near.add(j);}
      for(const j of near){if(i-j<3||points[i].sourceIndex-points[j].sourceIndex>700)continue;const c=points[j].pos,d=points[j+1].pos,rx=b[0]-a[0],rz=b[2]-a[2],sx=d[0]-c[0],sz=d[2]-c[2],den=rx*sz-rz*sx;if(Math.abs(den)<1e-9)continue;const t=((c[0]-a[0])*sz-(c[2]-a[2])*sx)/den,u=((c[0]-a[0])*rz-(c[2]-a[2])*rx)/den;if(t<=1e-5||t>=1-1e-5||u<=1e-5||u>=1-1e-5)continue;const heightA=a[1]+(b[1]-a[1])*t,heightB=c[1]+(d[1]-c[1])*u;if(Math.abs(heightA-heightB)>4)continue;found={i,j,pos:[a[0]+rx*t,(heightA+heightB)/2,a[2]+rz*t]};break;}
      for(const k of keys){if(!cells.has(k))cells.set(k,[]);cells.get(k).push(i);}
    }
    if(!found)break;
    const p={...points[found.j],pos:found.pos,sourceIndex:(points[found.j].sourceIndex+points[found.i].sourceIndex)/2};points.splice(found.j+1,found.i-found.j,p);removedLoops++;
  }
  const dense=[];
  for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],steps=Math.max(1,Math.ceil(Math.hypot(b.pos[0]-a.pos[0],b.pos[2]-a.pos[2])/2));for(let j=0;j<steps;j++){const t=j/steps;dense.push({...a,pos:a.pos.map((v,k)=>v+(b.pos[k]-v)*t),sourceIndex:a.sourceIndex+(b.sourceIndex-a.sourceIndex)*t});}}
  dense.push({...points.at(-1),pos:[...points.at(-1).pos]});
  const positions=dense.map(p=>p.pos);
  for(let i=1;i<dense.length-1;i++){const p=dense[i];let x=0,z=0,total=0;for(let j=Math.max(0,i-18);j<=Math.min(dense.length-1,i+18);j++){const distance=Math.hypot(positions[j][0]-positions[i][0],positions[j][2]-positions[i][2]),w=Math.exp(-.5*(distance/10)**2);x+=positions[j][0]*w;z+=positions[j][2]*w;total+=w;}p.pos=[x/total,p.pos[1],z/total];const plane=p.surfacePlane;if(plane)p.pos[1]=plane.height+plane.gx*(p.pos[0]-plane.x)+plane.gz*(p.pos[2]-plane.z);}
  finishPoints(dense,false);
  for(let i=0;i<dense.length;i++){const p=dense[i],plane=p.surfacePlane;if(!plane)continue;p.normal=unit([-plane.gx,1,-plane.gz]);const a=dense[Math.max(0,i-1)].pos,b=dense[Math.min(dense.length-1,i+1)].pos;p.right=unit(cross(p.normal,unit(sub(b,a))));}
  return {points:dense,removedLoops};
}
