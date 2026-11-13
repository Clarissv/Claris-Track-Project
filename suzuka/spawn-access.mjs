import assert from 'node:assert/strict';
import {boxCorners} from './lib/geometry.mjs';
import {carveTerrain, intersectsDomain} from './lib/domain.mjs';
import {collisionSampler, topHeight, overlapVertices} from './lib/surface-audit.mjs';
import {solidToDatum} from './lib/bulk-terrain.mjs';
import {fitGrid} from './smooth-runoff.mjs';

export function addSpawnAccess(plan) {
  if (plan.meta.spawnAccess) return plan;
  const {parts, meta} = plan, anchor = meta.placementAnchor.position;
  const half = 110, run = 220, overlap = 2, start = 201;
  const obstacles = [...meta.groups.asphalt, ...meta.groups.pitLane, ...meta.groups.barriers, ...meta.groups.bridgeDeck, ...meta.pitBase.spans.map(s => s.index)].map(i => parts[i]);
  const direction = [[0,-1],[0,1],[1,0],[-1,0]].find(([dx,dz]) => {
    const domain = {center: [anchor[0]+dx*(start+half), anchor[2]+dz*(start+half)], halfSize: half+overlap+1};
    return !obstacles.some(p => intersectsDomain(p, domain));
  });
  assert.ok(direction, 'No clear exit from the starting square');
  const [dx,dz] = direction, right = [-dz,0,dx];
  const domain = {center: [anchor[0]+dx*(start+half), anchor[2]+dz*(start+half)], halfSize: half+0.05};
  const oldTerrain = meta.groups.terrain.map(i => parts[i]);
  const terrain = collisionSampler(oldTerrain), free = [];
  const point = (s,d) => [anchor[0]+dx*s+right[0]*d, anchor[2]+dz*s+right[2]*d];
  const far = point(start+run+overlap,0), rise = terrain(...far);
  assert.ok(Number.isFinite(rise) && rise > 0 && rise < 45, 'Spawn exit must meet low terrain');
  for (const id of [...meta.groups.terrain]) {
    const pieces = carveTerrain(parts[id], domain);
    if (!pieces.length) { free.push(id); continue; }
    parts[id] = pieces[0];
    for (const p of pieces.slice(1)) { meta.groups.terrain.push(parts.length); parts.push(p); }
  }
  const indices = [], spans = [];
  let maxFitError = 0;
  const height = (s,d) => {
    const t = Math.max(0,Math.min(1,(s-start)/run)), w = t*t*(3-2*t), [x,z] = point(s,d);
    const h = terrain(x,z);
    assert.ok(Number.isFinite(h), 'Spawn ramp must have a terrain destination');
    return 0.25*(1-w)+h*w;
  };
  // Extend the last row into uncarved grass. Carving tilted solids removes
  // slightly more than the nominal domain because their bottom faces project
  // sideways; this overlap closes that gap at the terrain destination.
  for (let s=start;s<start+run;s+=10) for (let d=-half;d<half;d+=20) {
    const end = Math.min(s+10,start+run)+(s+10>=start+run?overlap:0), outer = Math.min(d+20,half), samples = [];
    for (const u of [s,(s+end)/2,end]) for (const v of [d,(d+outer)/2,outer]) {
      const [x,z] = point(u,v); samples.push([x,height(u,v),z]);
    }
    const fitted = fitGrid(samples,right,5), p = solidToDatum(fitted.part,0);
    maxFitError = Math.max(maxFitError,fitted.error);
    const index = free.length ? free.pop() : parts.length;
    if (index === parts.length) meta.groups.terrain.push(index);
    parts[index] = p; indices.push(index); spans.push({index,start:s,end,lateralStart:d,lateralEnd:outer});
  }
  assert.equal(free.length,0,'Every carved terrain slot must be used');
  let maxJoin = 0;
  for (let i=0;i<indices.length;i++) for (let j=i+1;j<indices.length;j++) {
    const a=parts[indices[i]], b=parts[indices[j]];
    for (const [x,z] of overlapVertices(a,b)) maxJoin=Math.max(maxJoin,Math.abs(topHeight(a,x,z)-topHeight(b,x,z)));
  }
  assert.ok(maxFitError<0.04 && maxJoin<0.08,`Spawn ramp has an exposed step: fit=${maxFitError}, join=${maxJoin}`);
  meta.spawnAccess = {direction, widthStuds:half*2, lengthStuds:run+overlap, startDistanceStuds:start, endHeightStuds:rise, indices, spans, maxFitErrorStuds:maxFitError, maxJoinStepStuds:maxJoin, maximumSlope:Math.max(...indices.map(i=>Math.hypot(parts[i][10],parts[i][12])/parts[i][11]))};
  meta.partCount=parts.length;meta.groupCounts=Object.fromEntries(Object.entries(meta.groups).map(([name,ids])=>[name,ids.length]));
  const corners=parts.flatMap(boxCorners);meta.planBounds={min:[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(p=>p[k])))};
  return plan;
}
