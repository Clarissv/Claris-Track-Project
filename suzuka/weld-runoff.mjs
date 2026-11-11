import {auditRunoff,auditPitRunoff,runoffSampler} from './audit-runoff.mjs';
import {topFootprint,topHeight,overlapVertices} from './lib/surface-audit.mjs';
import {constrainSurfaces} from './lib/bulk-terrain.mjs';
import {fitGrid} from './smooth-runoff.mjs';
import {carveTerrain} from './lib/domain.mjs';
export function weldRunoff(plan){const {parts,meta}=plan,roadIds=[...meta.groups.asphalt,...meta.groups.pitLane,...meta.groups.curbs],welds=[],done=new Set(),domain={center:[meta.placementAnchor.position[0],meta.placementAnchor.position[2]],halfSize:200,guard:.1};
  for(let pass=0;pass<3;pass++){const audit=auditRunoff(plan,{stride:1,spacing:.5}),pitAudit=auditPitRunoff(plan),sample=runoffSampler(plan);for(const lip of [...audit.boundaryLips,...pitAudit.boundaryLips].filter(l=>l.lip>.20)){const higher=topHeight(parts[lip.from],lip.x,lip.z)>topHeight(parts[lip.to],lip.x,lip.z)?lip.from:lip.to,lower=higher===lip.from?lip.to:lip.from,part=parts[higher],poly=topFootprint(part);let edge,best=Infinity;
      for(let j=0;j<4;j++){const a=poly[j],b=poly[(j+1)%4],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((lip.x-a[0])*dx+(lip.z-a[1])*dz)/(dx*dx+dz*dz))),d=Math.hypot(lip.x-a[0]-t*dx,lip.z-a[1]-t*dz);if(d<best){best=d;edge=j;}}
      const key=`${higher}:${edge}`;if(best>.05||done.has(key))continue;done.add(key);const a=poly[edge],b=poly[(edge+1)%4],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),area=poly.reduce((s,q,i)=>{const r=poly[(i+1)%4];return s+q[0]*r[1]-q[1]*r[0];},0),out=[Math.sign(area)*dz/length,-Math.sign(area)*dx/length],color=meta.groups.gravel.includes(lower)?8:5;
      function emit(t0,t1,depth=0){const samples=[];for(const t of [t0,(t0+t1)/2,t1]){const x=a[0]+dx*t,z=a[1]+dz*t,hy=topHeight(part,x,z),ox=x+out[0]*4,oz=z+out[1]*4,outer=sample(ox,oz,hy),ly=outer?.height??topHeight(parts[lower],ox,oz);for(const u of [0,.5,1]){const d=-.035+4.035*u;samples.push([x+out[0]*d,hy+(ly-hy)*u-.018,z+out[1]*d]);}}
        const fit=fitGrid(samples,[out[0],0,out[1]],color),nearRoads=roadIds.map(i=>parts[i]).filter(p=>Math.abs(p[0]-fit.part[0])<(p[3]+p[5]+fit.part[3]+fit.part[5])/2&&Math.abs(p[2]-fit.part[2])<(p[3]+p[5]+fit.part[3]+fit.part[5])/2&&overlapVertices(p,fit.part).length&&Math.abs(topHeight(p,fit.part[0],fit.part[2])-topHeight(fit.part,fit.part[0],fit.part[2]))<8),constrained=constrainSurfaces({parts:nearRoads},[fit.part],.008,false,true);
        if((fit.error>.065||constrained.maximumLowering>.07)&&depth<5&&(t1-t0)*length>4){const m=(t0+t1)/2;emit(t0,m,depth+1);emit(m,t1,depth+1);return;}
        for(const p of carveTerrain(constrained.parts[0],domain)){const index=parts.length;parts.push(p);meta.groups[color===8?'gravel':'terrain'].push(index);welds.push({index,higher,lower,edge,sourceIndex:lip.i,fitErrorStuds:fit.error});}
      }
      const segments=Math.ceil(length/32);for(let k=0;k<segments;k++)emit(k/segments,(k+1)/segments);
    }}
  meta.terrain.boundaryWelds=welds;meta.partCount=parts.length;meta.groupCounts=Object.fromEntries(Object.entries(meta.groups).map(([k,v])=>[k,v.length]));meta.runoffRecovery.after=auditRunoff(plan,{stride:1,spacing:.5});return plan;
}

