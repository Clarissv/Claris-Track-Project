import {finishPoints} from '../red-bull-ring/reference.mjs';
import {densifyDriving} from '../red-bull-ring/layout.mjs';

export function spaPitRoute(source,main,width,route){
  const core=structuredClone(source);
  const plane=main[0].surfacePlane;if(!plane)throw Error('Spa pit requires its shared chicane/start/La Source plane');
  const entry=route.entryMainIndex*2,exit=route.exitMainIndex*2;
  core[0].pos=[...main[entry].pos];core.at(-1).pos=[...main[exit].pos];
  finishPoints(core,false);
  for(const p of core){p.pos[1]=plane.height+plane.gx*(p.pos[0]-plane.x)+plane.gz*(p.pos[2]-plane.z);p.wr=p.wl=width/2;const r=p.right;p.bank=(plane.gx*r[0]+plane.gz*r[2])/Math.hypot(r[0],r[2]);}
  finishPoints(core,false);const points=densifyDriving(core,2,false),start=route.straightStartIndex*2,end=route.straightEndIndex*2,A=points[start].pos,B=points[end].pos,dx=B[0]-A[0],dz=B[2]-A[2],L=Math.hypot(dx,dz);
  return {points,meta:{...route,entryMainIndex:entry,exitMainIndex:exit,straightStartIndex:start,exitStartIndex:end,straightOrigin:[A[0],A[2]],straightDirection:[dx/L,dz/L],buildingStartIndex:start,buildingEndIndex:end}};
}
