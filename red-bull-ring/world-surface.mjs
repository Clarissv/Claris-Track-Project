import {smoothDrivingPoints} from './smooth-surface.mjs';
import {finishPoints} from './reference.mjs';

export function smoothWorldSurface(points,sigma=150,lengthScale=1){
  const original=points.slice(0,-1),n=original.length;
  const gradients=original.map(p=>({pos:[p.pos[0],-p.normal[0]/p.normal[1],p.pos[2]],bank:-p.normal[2]/p.normal[1],wr:p.wr,wl:p.wl}));
  finishPoints(gradients);
  const filtered=smoothDrivingPoints(gradients,{heightSigma:sigma,bankSigma:sigma});
  const distances=[0],lengths=[],zones=[];
  for(let i=0;i<n;i++){
    const a=original[i].pos,b=original[(i+1)%n].pos;lengths.push(Math.hypot(b[0]-a[0],b[2]-a[2]));if(i<n-1)distances.push(distances.at(-1)+lengths.at(-1));
    const c=original[(i-1+n)%n].pos,u=[a[0]-c[0],a[2]-c[2]],v=[b[0]-a[0],b[2]-a[2]],turn=Math.abs(Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]));
    if(turn>.25*Math.PI/180){const previous=zones.at(-1);if(previous&&original[i].s-original[previous.end].s<180*lengthScale)previous.end=i;else zones.push({start:i,end:i});}
  }
  const closureWeights=new Array(n).fill(1);
  for(const zone of zones){
    const start=distances[zone.start]-40*lengthScale,end=distances[zone.end]+40*lengthScale,indices=distances.map((s,i)=>s>=start&&s<=end?i:-1).filter(i=>i>=0);
    const total=indices.reduce((s,i)=>s+lengths[i],0),gx=indices.reduce((s,i)=>s+filtered[i].pos[1]*lengths[i],0)/total,gz=indices.reduce((s,i)=>s+filtered[i].bank*lengths[i],0)/total;
    zone.gradient=[gx,gz];
    for(let i=0;i<n;i++){
      const distance=Math.max(start-distances[i],distances[i]-end,0);if(distance>=300*lengthScale)continue;const t=distance/(300*lengthScale),w=1-t*t*(3-2*t);
      filtered[i].pos[1]=filtered[i].pos[1]*(1-w)+gx*w;filtered[i].bank=filtered[i].bank*(1-w)+gz*w;closureWeights[i]=Math.min(closureWeights[i],1-w);
    }
  }
  const deltas=[];let drift=0,weightedLength=0;
  for(let i=0;i<n;i++){
    const j=(i+1)%n,a=original[i].pos,b=original[j].pos,dh=(filtered[i].pos[1]+filtered[j].pos[1])*(b[0]-a[0])/2+(filtered[i].bank+filtered[j].bank)*(b[2]-a[2])/2;
    deltas.push(dh);drift+=dh;weightedLength+=lengths[i]*(closureWeights[i]+closureWeights[j])/2;
  }
  const heights=[0];let integrated=0;
  for(let i=0;i<n-1;i++){integrated+=deltas[i]-drift*lengths[i]*(closureWeights[i]+closureWeights[(i+1)%n])/2/weightedLength;heights.push(integrated);}
  const sourceMin=Math.min(...original.map(p=>p.pos[1])),sourceMax=Math.max(...original.map(p=>p.pos[1])),lo=Math.min(...heights),hi=Math.max(...heights),scale=(sourceMax-sourceMin)/(hi-lo);let maximumAdjustment=0;
  points.pop();
  for(let i=0;i<n;i++){
    const p=points[i],right=p.right,h=Math.hypot(right[0],right[2]),value=sourceMin+(heights[i]-lo)*scale;
    maximumAdjustment=Math.max(maximumAdjustment,Math.abs(value-p.pos[1]));p.pos[1]=value;p.bank=(filtered[i].pos[1]*right[0]+filtered[i].bank*right[2])/h*scale;
  }
  finishPoints(points);
  return {method:'Smooth world gradients; shared planar gradients through tight corners; close the elevation profile through the intervening sections',sigmaStuds:sigma,cornerZones:zones,closureDriftStuds:drift,heightRangeScale:scale,maximumAdjustmentStuds:maximumAdjustment};
}
