import {finishPoints} from './reference.mjs';
import {unit} from './track-geometry.mjs';
import {smoothDrivingPoints} from './smooth-surface.mjs';

export function smoothPlanarPath(points,sigma){
  for(const axis of [0,2]){
    const filtered=smoothDrivingPoints(points.map(p=>({...p,pos:[p.pos[0],p.pos[axis],p.pos[2]]})),{heightSigma:sigma,bankSigma:sigma,closed:false});
    points.forEach((p,i)=>p.pos[axis]=filtered[i].pos[1]);
  }
  return points;
}

export function scaleReference(raw,scale){
  const result=structuredClone(raw);result.points.pop();for(const p of result.points)p.pos=p.pos.map(v=>v*scale);
  finishPoints(result.points);result.studsPerMetre*=scale;return result;
}
export function scaleGround(raw,scale){
  return {...raw,cell:raw.cell*scale,x0:raw.x0*scale,z0:raw.z0*scale,heights:raw.heights.map(h=>h===null?null:h*scale)};
}
export function densifyDriving(points,factor=2,closed=true){
  const result=[];
  for(let i=0;i<points.length-1;i++)for(let j=0;j<factor;j++){
    const a=points[i],b=points[i+1],t=j/factor,p={...a,pos:a.pos.map((v,k)=>v+(b.pos[k]-v)*t),wr:a.wr+(b.wr-a.wr)*t,wl:a.wl+(b.wl-a.wl)*t,bank:a.bank+(b.bank-a.bank)*t,s:a.s+(b.s-a.s)*t};
    p.normal=unit(a.normal.map((v,k)=>v+(b.normal[k]-v)*t));p.right=unit(a.right.map((v,k)=>v+(b.right[k]-v)*t));result.push(p);
  }
  result.push(structuredClone(points.at(-1)));if(closed)result.at(-1).pos=[...result[0].pos];return result;
}
