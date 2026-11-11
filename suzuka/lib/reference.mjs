import crypto from 'node:crypto';
import {unit,sub,cross} from './track-geometry.mjs';
export const sha=body=>crypto.createHash('sha256').update(body).digest('hex');
export function finishPoints(points,closed=true){
  let s=0;const n=points.length;
  for(let i=0;i<n;i++){
    const p=points[i],a=points[closed?(i+n-1)%n:Math.max(0,i-1)],b=points[closed?(i+1)%n:Math.min(n-1,i+1)],along=unit(sub(b.pos,a.pos)),flatRight=unit([along[2],0,-along[0]]);
    p.right=unit([flatRight[0],p.bank??0,flatRight[2]]);p.normal=unit(cross(along,p.right));p.s=s;
    if(i+1<n)s+=Math.hypot(...sub(points[i+1].pos,p.pos));
  }
  if(closed){s+=Math.hypot(...sub(points[0].pos,points.at(-1).pos));points.push({...points[0],pos:[...points[0].pos],s});}
  return points;
}
