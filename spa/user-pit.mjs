import {catmull} from '../red-bull-ring/geometry.mjs';
import {finishPoints} from '../red-bull-ring/reference.mjs';
import {unit,sub} from '../red-bull-ring/track-geometry.mjs';
import {smoothDrivingPoints} from '../red-bull-ring/smooth-surface.mjs';

export function userPit(reference,route){
  const knots=route.path,points=[];
  for(let i=0;i<knots.length-1;i++){
    const count=Math.max(4,Math.ceil(Math.hypot(...sub(knots[i+1],knots[i]))/2));
    for(let j=0;j<count;j++){const q=catmull(knots[Math.max(0,i-1)],knots[i],knots[i+1],knots[Math.min(knots.length-1,i+2)],j/count);points.push({pos:[q[0],0,q[1]],wr:9,wl:9,bank:0});}
  }
  points.push({pos:[knots.at(-1)[0],0,knots.at(-1)[1]],wr:9,wl:9,bank:0});
  const entry=reference.points[route.entryMainIndex],end=reference.points[route.exitMainIndex];points[0].pos=[...entry.pos];
  // Filter both horizontal axes using the same original distance parameter.
  // Updating X before filtering Z introduces small steering kinks.
  const original=structuredClone(points);
  for(const axis of [0,2]){
    const filtered=smoothDrivingPoints(original.map(p=>({...p,pos:[p.pos[0],p.pos[axis],p.pos[2]]})),{heightSigma:40,bankSigma:40,closed:false});
    points.forEach((p,i)=>p.pos[axis]=filtered[i].pos[1]);
  }
  finishPoints(points,false);
  let distance=0,cut=points.length-1;
  while(cut>4&&distance<350){distance+=Math.hypot(points[cut].pos[0]-points[cut-1].pos[0],points[cut].pos[2]-points[cut-1].pos[2]);cut--;}
  const A=points[cut].pos,B=end.pos,u=unit([A[0]-points[cut-4].pos[0],0,A[2]-points[cut-4].pos[2]]),v=unit([-end.right[2],0,end.right[0]]),sign=Math.sign(u[0]*v[2]-u[2]*v[0]),radius=70;
  const center=[B[0]-v[2]*radius*sign,B[2]+v[0]*radius*sign],P=[center[0]+u[2]*radius*sign,0,center[1]-u[0]*radius*sign],L=Math.hypot(P[0]-A[0],P[2]-A[2]),c1=A.map((x,k)=>x+u[k]*L/3),c2=P.map((x,k)=>x-u[k]*L/3),arc=[];
  for(let i=0;i<40;i++){const t=i/40,w=1-t;arc.push({pos:A.map((x,k)=>w**3*x+3*w*w*t*c1[k]+3*w*t*t*c2[k]+t**3*P[k]),wr:9,wl:9,bank:0});}
  let angle0=Math.atan2(P[2]-center[1],P[0]-center[0]),angle1=Math.atan2(B[2]-center[1],B[0]-center[0]);if(sign>0)while(angle1<angle0)angle1+=2*Math.PI;else while(angle1>angle0)angle1-=2*Math.PI;
  for(let i=0;i<=160;i++){const angle=angle0+(angle1-angle0)*i/160;arc.push({pos:[center[0]+radius*Math.cos(angle),0,center[1]+radius*Math.sin(angle)],wr:9,wl:9,bank:0});}
  arc.at(-1).pos=[...B];points.splice(cut,points.length-cut,...arc);finishPoints(points,false);
  const coreStart=points.findIndex(p=>p.s>points.at(-1).s*.22),coreEnd=points.findIndex(p=>p.s>points.at(-1).s*.74);
  return {points,route:{...route,path:undefined,planeStartMainIndex:1330*4,planeEndMainIndex:123*4,straightStartIndex:coreStart,straightEndIndex:coreEnd,exitCurveRadiusStuds:70,exitApproachLengthStuds:350,nativeMaterials:[84,60,75,46,61,59]}};
}
