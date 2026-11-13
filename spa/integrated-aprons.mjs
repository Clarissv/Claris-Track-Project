import {auditRunoffTransitions} from '../red-bull-ring/clear-start/compact/audit-shoulders.mjs';

export function integrateAprons(plan){
  const m=plan.meta,removed=new Set([...(m.groups.runoff??[]),...(m.groups.sand??[])]),mapping=new Map();
  m.apronReferences=m.runoffSpans.map(({index,...span})=>({...span,part:plan.parts[index]}));
  plan.parts=plan.parts.filter((_,i)=>{if(removed.has(i))return false;mapping.set(i,mapping.size);return true;});
  const remap=ids=>ids.flatMap(i=>mapping.has(i)?[mapping.get(i)]:[]);
  m.runoffSpans=[];
  for(const [name,ids] of Object.entries(m.groups)){const kept=remap(ids);if(kept.length)m.groups[name]=kept;else delete m.groups[name];}
  m.groupCounts=Object.fromEntries(Object.entries(m.groups).map(([name,ids])=>[name,ids.length]));m.partCount=plan.parts.length;
  for(const key of ['roadSegments','edgeMarkingSegments','kerbSpans','pitSegments'])for(const span of m[key]??[])span.index=mapping.get(span.index);
  for(const role of m.catalogRoles)role.partIndices=remap(role.partIndices);
  m.nonCollidingPartIndices=remap(m.nonCollidingPartIndices);
  for(const joins of [m.surfaceSmoothing.roadJoins,m.surfaceSmoothing.pitJoins])if(joins.worst)joins.worst=remap(joins.worst);
  m.terrain.foundationIndices=remap(m.terrain.foundationIndices);
  m.terrain.edgeSpans=m.terrain.edgeSpans.map(s=>({...s,index:mapping.get(s.index)}));
  m.terrain.basePartCount-=removed.size;m.terrain.totalWithExistingGrass=plan.parts.length+1;
  m.compactTerrain.runoffRefit={integratedSourceFootprints:removed.size};
  return plan;
}

// Audit across the original apron footprints; the appended references are
// excluded from collision sampling because the fitted skins carry the car.
export function auditIntegratedAprons(plan){
  const refs=plan.meta.apronReferences,start=plan.parts.length;
  return auditRunoffTransitions({...plan,parts:[...plan.parts,...refs.map(r=>r.part)],meta:{...plan.meta,runoffSpans:refs.map((r,i)=>({...r,index:start+i})),nonCollidingPartIndices:[...plan.meta.nonCollidingPartIndices,...refs.map((_,i)=>start+i)]}});
}
