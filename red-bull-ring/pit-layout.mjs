import {finishPoints} from './reference.mjs';
import {smoothPlanarPath} from './layout.mjs';

const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const normalized=v=>{const length=Math.hypot(...v);return v.map(x=>x/length);};
const tangent=(points,i)=>normalized([points[Math.min(points.length-1,i+1)].pos[0]-points[Math.max(0,i-1)].pos[0],points[Math.min(points.length-1,i+1)].pos[2]-points[Math.max(0,i-1)].pos[2]]);

export function connectedPitLayout(source,main,{entryMainIndex,exitMainIndex,width=12,radius=90,separation=0}={}){
  const native=smoothPlanarPath(finishPoints(structuredClone(source),false),24),positions=[];
  const portal=index=>{
    const q=main[index],v=tangent(main,index),nearest=native.reduce((a,b)=>Math.hypot(b.pos[0]-q.pos[0],b.pos[2]-q.pos[2])<Math.hypot(a.pos[0]-q.pos[0],a.pos[2]-q.pos[2])?b:a),right=[v[1],-v[0]],side=(nearest.pos[0]-q.pos[0])*right[0]+(nearest.pos[2]-q.pos[2])*right[1]>0?1:-1,offset=side*((side>0?q.wr:q.wl)-width/2-2);
    return {index,position:[q.pos[0]+right[0]*offset,q.pos[2]+right[1]*offset],tangent:v,side};
  };
  const entry=portal(entryMainIndex-70),exit=portal(exitMainIndex+80);
  // The reviewed middle section is the native pit straight. Fit one line to
  // it and continue that line past the unwanted sideways jog near its end.
  const stable=native.slice(180,431),mean=[0,2].map(k=>stable.reduce((s,p)=>s+p.pos[k],0)/stable.length);
  let xx=0,xz=0,zz=0;for(const p of stable){const x=p.pos[0]-mean[0],z=p.pos[2]-mean[1];xx+=x*x;xz+=x*z;zz+=z*z;}
  const theta=.5*Math.atan2(2*xz,xx-zz);let along=[Math.cos(theta),Math.sin(theta)];if(along[0]<0)along=along.map(x=>-x);
  const nativeMean=[...mean];let straightShift=0;
  if(separation>0){
    const normal=[-along[1],along[0]],first=[native[180].pos[0],native[180].pos[2]],last=[native[430].pos[0],native[430].pos[2]],coordinate=q=>q[0]*along[0]+q[1]*along[1],lo=coordinate(first),hi=coordinate(last);
    const road=main.slice(0,-1).filter(p=>{const s=coordinate([p.pos[0],p.pos[2]]);return s>=Math.min(lo,hi)&&s<=Math.max(lo,hi)&&Math.abs((p.pos[0]-mean[0])*normal[0]+(p.pos[2]-mean[1])*normal[1])<150;});
    if(!road.length)throw Error('The pit straight has no neighbouring racing straight');
    const side=Math.sign(road.reduce((sum,p)=>sum+(mean[0]-p.pos[0])*normal[0]+(mean[1]-p.pos[2])*normal[1],0));
    const required=Math.max(...road.map(p=>separation+Math.max(p.wr,p.wl)+width/2-side*((mean[0]-p.pos[0])*normal[0]+(mean[1]-p.pos[2])*normal[1])));
    straightShift=Math.max(0,required+.5);
    for(let k=0;k<2;k++)mean[k]+=normal[k]*side*straightShift;
  }
  const project=q=>{const s=(q[0]-mean[0])*along[0]+(q[1]-mean[1])*along[1];return mean.map((x,k)=>x+along[k]*s);};
  const straightStart=project([native[180].pos[0],native[180].pos[2]]),exitOrigin=separation>0?nativeMean:mean,delta=exit.position.map((x,k)=>x-exitOrigin[k]),distance=cross(delta,exit.tangent)/cross(along,exit.tangent),corner=exitOrigin.map((x,k)=>x+along[k]*distance),angle=Math.atan2(cross(along,exit.tangent),along[0]*exit.tangent[0]+along[1]*exit.tangent[1]);
  if(angle<=0||angle>=Math.PI*.75)throw Error('The pit exit requires one forward L turn');
  const trim=radius*Math.tan(angle/2),arcStart=corner.map((x,k)=>x-along[k]*trim),arcEnd=corner.map((x,k)=>x+exit.tangent[k]*trim),center=[arcStart[0]-along[1]*radius,arcStart[1]+along[0]*radius];
  const append=q=>{if(!positions.length||Math.hypot(q[0]-positions.at(-1)[0],q[1]-positions.at(-1)[1])>1e-7)positions.push(q);};
  const line=(a,b)=>{const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/1.2);for(let i=0;i<=count;i++)append(a.map((x,k)=>x+(b[k]-x)*i/count));};
  const curve=(a,b,u,v)=>{const handle=Math.hypot(b[0]-a[0],b[1]-a[1])/3,c=a.map((x,k)=>x+u[k]*handle),d=b.map((x,k)=>x-v[k]*handle),count=Math.ceil(handle*3/1.0);for(let i=0;i<=count;i++){const t=i/count,s=1-t;append(a.map((x,k)=>s*s*s*x+3*s*s*t*c[k]+3*s*t*t*d[k]+t*t*t*b[k]));}};
  const at=i=>[native[i].pos[0],native[i].pos[2]];
  curve(entry.position,at(35),entry.tangent,tangent(native,35));
  for(let i=35;i<150;i++)line(at(i),at(i+1));
  curve(at(150),straightStart,tangent(native,150),along);
  const straightStartIndex=positions.length-1;
  let exitApproachStartIndex;
  if(separation>0){
    const approach=arcStart.map((x,k)=>x-along[k]*300+mean[k]-nativeMean[k]);
    line(straightStart,approach);exitApproachStartIndex=positions.length-1;
    curve(approach,arcStart,along,along);
  }else line(straightStart,arcStart);
  const exitStartIndex=positions.length-1,steps=Math.ceil(radius*angle/1.2),startAngle=Math.atan2(arcStart[1]-center[1],arcStart[0]-center[0]);
  for(let i=1;i<=steps;i++){const t=startAngle+angle*i/steps;append([center[0]+radius*Math.cos(t),center[1]+radius*Math.sin(t)]);}
  const exitArcEndIndex=positions.length-1;line(arcEnd,exit.position);
  const points=positions.map(q=>{let nearest=native[0],best=Infinity;for(const p of native){const d=(p.pos[0]-q[0])**2+(p.pos[2]-q[1])**2;if(d<best){best=d;nearest=p;}}return {pos:[q[0],nearest.pos[1],q[1]],wr:width/2,wl:width/2,bank:0};});
  return {points:finishPoints(points,false),meta:{method:'Long native entry, fitted straight, one rounded L exit, both portals inside racing asphalt',entryMainIndex:entry.index,exitMainIndex:exit.index,entry:entry.position,exit:exit.position,straightStartIndex,exitStartIndex,exitArcEndIndex,straightOrigin:mean,straightDirection:along,exitRadiusStuds:radius,exitTurnDegrees:angle*180/Math.PI,...(separation>0?{requestedGapStuds:separation,straightShiftStuds:straightShift,exitApproachStartIndex}:{} )}};
}
