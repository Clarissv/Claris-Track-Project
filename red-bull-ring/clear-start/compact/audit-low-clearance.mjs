import {collisionSampler} from '../../surface-audit.mjs';

// Compare the actual road with a rigid chassis supported by two tyre contacts.
// Sample a straight wheelbase chord in world space, including nose/tail
// overhang. A grade along a curved route alone is not a chassis bump.
export function auditLowClearance(plan,{wheelbase=16,overhang=4,stride=4,spacing=1,offsets=[-3,0,3],kinds=['main','pit']}={}){
  const surface=collisionSampler([...plan.meta.groups.asphalt,...plan.meta.groups.pitLane].map(i=>plan.parts[i]));
  let samples=0,missing=0,maxCrestRise=0,maxOverhangRise=0,worstCrest=null,worstOverhang=null;
  for(const [kind,line,closed] of [['main',plan.centerline,true],['pit',plan.meta.pitPoints.map(p=>[...p.pos,p.wr,p.wl,p.s]),false]]){
    if(!kinds.includes(kind))continue;
    const distances=[0];for(let i=1;i<line.length;i++)distances.push(distances.at(-1)+Math.hypot(line[i][0]-line[i-1][0],line[i][2]-line[i-1][2]));
    const length=distances.at(-1);
    const at=(s,offset)=>{
      if(closed)s=((s%length)+length)%length;
      let lo=0,hi=line.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(distances[m]<=s)lo=m;else hi=m;}
      const a=line[lo],b=line[hi],t=(s-distances[lo])/(distances[hi]-distances[lo]),dx=b[0]-a[0],dz=b[2]-a[2],d=Math.hypot(dx,dz);
      return [a[0]+dx*t+dz/d*offset,a[2]+dz*t-dx/d*offset];
    };
    const guard=wheelbase/2+overhang;
    for(let s=closed?0:guard;s<(closed?length:length-guard);s+=stride)for(const offset of offsets){
      const a=at(s-wheelbase/2,offset),b=at(s+wheelbase/2,offset),ha=surface(...a),hb=surface(...b);
      for(let d=-overhang;d<=wheelbase+overhang;d+=spacing){
        const t=d/wheelbase,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,h=surface(x,z);samples++;
        if(![h,ha,hb].every(Number.isFinite)){missing++;continue;}
        const rise=h-(ha+(hb-ha)*t),detail={kind,distanceStuds:s,offset,x,z,riseStuds:rise};
        if(d>=0&&d<=wheelbase){if(rise>maxCrestRise){maxCrestRise=rise;worstCrest=detail;}}
        else if(rise>maxOverhangRise){maxOverhangRise=rise;worstOverhang=detail;}
      }
    }
  }
  return {samples,missing,wheelbaseStuds:wheelbase,overhangStuds:overhang,maxCrestRiseStuds:maxCrestRise,maxOverhangRiseStuds:maxOverhangRise,worstCrest,worstOverhang};
}
