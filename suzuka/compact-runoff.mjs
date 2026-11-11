import {topFootprint,topHeight,overlapVertices} from './lib/surface-audit.mjs';
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function clip(poly,a,b,sign){const out=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],dp=sign*cross(a,b,p),dq=sign*cross(a,b,q);if(dp>=-1e-9)out.push(p);if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}return out;}
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
function subtract(poly,cover){const sign=Math.sign(cover.reduce((s,a,i)=>{const b=cover[(i+1)%cover.length];return s+a[0]*b[1]-a[1]*b[0];},0)),out=[];let remainder=poly;for(let i=0;i<cover.length&&remainder.length;i++){const a=cover[i],b=cover[(i+1)%cover.length],outside=clip(remainder,a,b,-sign);if(outside.length>=3&&area(outside)>.00001)out.push(outside);remainder=clip(remainder,a,b,sign);}return out;}
export function compactRunoff(plan){const {parts,meta}=plan,coverIds=[...meta.groups.gravel,...meta.groups.runoff,...meta.groups.asphalt,...meta.groups.pitLane],removed=new Set();
  for(const id of meta.terrain.recoveryPartIndices){const p=parts[id],poly=topFootprint(p);let visible=[poly];for(const cid of coverIds){const q=parts[cid];if(Math.abs(p[0]-q[0])>(p[3]+p[5]+q[3]+q[5])/2||Math.abs(p[2]-q[2])>(p[3]+p[5]+q[3]+q[5])/2)continue;const vertices=overlapVertices(p,q);if(!vertices.length||vertices.some(([x,z])=>topHeight(q,x,z)<topHeight(p,x,z)+.001))continue;visible=visible.flatMap(poly=>subtract(poly,topFootprint(q)));if(!visible.length)break;}if(!visible.length)removed.add(id);}
  const indices=new Map();plan.parts=parts.filter((p,i)=>{if(removed.has(i))return false;indices.set(i,indices.size);return true;});const map=i=>{if(!indices.has(i))throw Error(`Missing surviving part ${i}`);return indices.get(i);};
  for(const key of Object.keys(meta.groups))meta.groups[key]=meta.groups[key].filter(i=>!removed.has(i)).map(map);
  for(const key of ['roadSegments','pitSegments','runoffSpans','kerbSpans','barrierSpans','edgeMarkingSegments','pitMarkingSegments'])meta[key]=meta[key].filter(s=>!removed.has(s.index)).map(s=>({...s,index:map(s.index)}));
  for(const key of ['apronRuns','kerbRuns','barrierRuns'])for(const run of meta[key])run.indices=run.indices.filter(i=>!removed.has(i)).map(map);
  meta.terrain.recoverySpans=meta.terrain.recoverySpans.filter(s=>!removed.has(s.index)).map(s=>({...s,index:map(s.index)}));meta.terrain.recoveryPartIndices=meta.terrain.recoveryPartIndices.filter(i=>!removed.has(i)).map(map);
  meta.nonCollidingPartIndices=meta.nonCollidingPartIndices.map(map);for(const role of meta.catalogRoles)role.partIndices=role.partIndices.map(map);
  for(const pair of meta.bridge.pairs){pair.lower=map(pair.lower);pair.upper=map(pair.upper);}meta.bridge.deckIndices=meta.bridge.deckIndices.map(map);for(const joins of Object.values(meta.surfaceSmoothing))joins.worst=joins.worst.map(map);
  meta.partCount=plan.parts.length;meta.groupCounts=Object.fromEntries(Object.entries(meta.groups).map(([k,v])=>[k,v.length]));meta.terrain.removedBuriedRecoveryParts=removed.size;return plan;
}
