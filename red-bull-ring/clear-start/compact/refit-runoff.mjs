import {terrainSlab} from '../../terrain-slab.mjs';
import {constrainSurfaces} from '../../bulk-terrain.mjs';
import {round} from '../../geometry.mjs';
export function refitRunoff(plan){
  const changed=[],line=plan.centerline;
  const frame=i=>{const p=line[i],a=line[Math.max(0,i-1)],b=line[Math.min(line.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);return {p,right:[dz/length,0,-dx/length]};};
  for(const span of plan.meta.runoffSpans){
    const old=plan.parts[span.index],mid=frame((span.start+span.end)>>1),offset=(old[0]-mid.p[0])*mid.right[0]+(old[2]-mid.p[2])*mid.right[2],width=old[3]*Math.hypot(old[7],old[9]);
    const points=[];
    for(let i=span.start;i<=span.end;i++){
      const {p,right}=frame(i),x=p[0]+right[0]*offset,z=p[2]+right[2]*offset,y=p[1]-(p[6]*(x-p[0])+p[8]*(z-p[2]))/p[7]-.025;
      points.push({pos:[x,y,z],wr:width/2,wl:width/2,bank:-(p[6]*right[0]+p[8]*right[2])/p[7],surfaceRight:right});
    }
    const fitted=terrainSlab(points,0,points.length-1);
    for(let k=0;k<3;k++)fitted[k]=round(fitted[k]+fitted[10+k]*(.25-old[4])/2);
    fitted[4]=old[4];fitted[6]=old[6];plan.parts[span.index]=fitted;changed.push(span.index);
  }
  const roads={parts:[...plan.meta.groups.asphalt,...plan.meta.groups.pitLane].map(i=>plan.parts[i])},fit=constrainSurfaces(roads,changed.map(i=>plan.parts[i]),.006,false,true);
  changed.forEach((index,i)=>plan.parts[index]=fit.parts[i]);
  return {changedIndices:changed,modifiedForRoadClearance:fit.modified,maximumLoweringStuds:fit.maximumLowering};
}
