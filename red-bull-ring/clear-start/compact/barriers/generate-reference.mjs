import fs from 'node:fs';
import {boxCorners,boxBasis,round} from '../../../geometry.mjs';
import {collisionSampler,topFootprint,topHeight,overlapVertices} from '../../../surface-audit.mjs';
import {volumeAudit,boxesOverlap} from '../../../bulk-terrain.mjs';
import {intersectsDomain} from '../../domain.mjs';
import {readReference,referencePaths,distance,segmentDistance,polygonDistance} from './reference-paths.mjs';
const here=new URL('./',import.meta.url);
export const readBase=()=>JSON.parse(fs.readFileSync(new URL('../red-bull-ring-plan.json',here)));
export function checksum(parts){let n=0;for(const p of parts)for(const v of p)n=(n*65599+Math.floor(v*10000+.5))%2147483647;return n.toFixed(0);}
export function pitStraightExclusion(base){const l=base.meta.pitLayout,a=base.meta.pitPoints[l.straightStartIndex].pos,b=base.meta.pitPoints[l.exitStartIndex].pos;return {origin:l.straightOrigin,direction:l.straightDirection,start:(a[0]-l.straightOrigin[0])*l.straightDirection[0]+(a[2]-l.straightOrigin[1])*l.straightDirection[1],end:(b[0]-l.straightOrigin[0])*l.straightDirection[0]+(b[2]-l.straightOrigin[1])*l.straightDirection[1],halfWidth:65};}
export function excluded(q,e,margin=0){const dx=q[0]-e.origin[0],dz=q[1]-e.origin[1],s=dx*e.direction[0]+dz*e.direction[1],d=-dx*e.direction[1]+dz*e.direction[0];return s>=e.start-margin&&s<=e.end+margin&&Math.abs(d)<=e.halfWidth+margin;}
function obstacles(base,ground){const cell=128,buckets=new Map();
  const safeGround=q=>{const h=ground(...q);if(!Number.isFinite(h))return false;return [[3,0],[-3,0],[0,3],[0,-3]].every(d=>Math.abs(ground(q[0]+d[0],q[1]+d[1])-h)<.8);};
  for(const [name,padding] of [['asphalt',30],['pitLane',10],['sand',5],['runoff',5],['curbs',3]])for(const index of base.meta.groups[name]){const poly=topFootprint(base.parts[index]),xs=poly.map(q=>q[0]),zs=poly.map(q=>q[1]),center=[xs.reduce((n,v)=>n+v,0)/4,zs.reduce((n,v)=>n+v,0)/4],item={name,index,poly,center,padding};for(let x=Math.floor((Math.min(...xs)-padding-8)/cell);x<=Math.floor((Math.max(...xs)+padding+8)/cell);x++)for(let z=Math.floor((Math.min(...zs)-padding-8)/cell);z<=Math.floor((Math.max(...zs)+padding+8)/cell);z++){const key=`${x}:${z}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(item);}}
  const near=q=>buckets.get(`${Math.floor(q[0]/cell)}:${Math.floor(q[1]/cell)}`)??[];
  const clear=q=>safeGround(q)&&near(q).every(item=>polygonDistance(q,item.poly)>=item.padding-1e-6);
  const fit=q=>{const original=[...q];q=[...q];for(let pass=0;pass<60;pass++){let moved=false;for(const item of near(q)){if(polygonDistance(q,item.poly)>=item.padding+4)continue;let best;for(let i=0;i<item.poly.length;i++){const a=item.poly[i],b=item.poly[(i+1)%item.poly.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dz)/(dx*dx+dz*dz))),p=[a[0]+t*dx,a[1]+t*dz],d=distance(q,p);if(!best||d<best.d)best={p,d,a,b};}let v=q.map((n,k)=>n-best.p[k]);if(polygonDistance(q,item.poly)===0||Math.hypot(...v)<1e-8){v=[best.b[1]-best.a[1],best.a[0]-best.b[0]];if(v[0]*(best.p[0]-item.center[0])+v[1]*(best.p[1]-item.center[1])<0)v=v.map(n=>-n);}const length=Math.hypot(...v);q=best.p.map((n,k)=>n+v[k]/length*(item.padding+4.3));moved=true;}if(distance(q,original)>180)break;if(!moved){if(clear(q))return q;break;}}for(let radius=5;radius<=200;radius+=5)for(let i=0;i<64;i++){const t=i*Math.PI/32,candidate=[original[0]+radius*Math.cos(t),original[1]+radius*Math.sin(t)];if(clear(candidate))return candidate;}throw Error(`Cannot fit GLB barrier clear of road: ${q}`);};return {fit,clear,ground};
}
const lineClear=(a,b,avoid)=>{if(Math.abs(avoid.ground(...a)-avoid.ground(...b))>distance(a,b)*.2+.01)return false;const steps=Math.max(1,Math.ceil(distance(a,b)/1.5));for(let i=0;i<=steps;i++)if(!avoid.clear(a.map((v,k)=>v+(b[k]-v)*i/steps)))return false;return true;};
export function generate(base=readBase()){
  const reference=readReference();if(reference.meta.sourceSha256!==base.meta.sourceSha256)throw Error('Different GLB reference');
  const paths=referencePaths(reference).filter(p=>p.role==='concrete'||p.sourceLength>=40),visual=new Set(base.meta.nonCollidingPartIndices),ground=collisionSampler(base.parts.filter((_,i)=>!visual.has(i))),avoid=obstacles(base,ground),exclusion=pitStraightExclusion(base),parts=[],chains=[];
  let maxReferenceShift=0,removedPitLength=0,removedStartLength=0,omittedCrossings=0;
  for(const [referenceChain,source] of paths.entries()){
    const dense=[];for(let i=1;i<source.path.length;i++){const a=source.path[i-1],b=source.path[i],steps=Math.ceil(distance(a,b)/3);for(let k=i===1?0:1;k<=steps;k++){const q=a.map((n,j)=>n+(b[j]-n)*k/steps),fitted=avoid.fit(q);maxReferenceShift=Math.max(maxReferenceShift,distance(q,fitted));dense.push(fitted);}}
    const runs=[];let active=[];
    for(let i=0;i<dense.length;i++){const q=dense[i],inPit=excluded(q,exclusion,3),inStart=intersectsDomain([q[0],0,q[1],12,.1,12,1,1,0,0,0,1,0],base.meta.startDomain);if(inPit||inStart){if(i){const n=distance(q,dense[i-1]);if(inPit)removedPitLength+=n;else removedStartLength+=n;}if(active.length>1)runs.push(active);active=[];}else active.push(q);}if(active.length>1)runs.push(active);
    // Keep the source's direction. Nearest-free fitting can jump across an
    // apron or reverse along a cliff; leave an opening instead of an A* loop.
    const fittedRuns=[];for(const raw of runs){let active=[];for(const q of raw){const last=active.at(-1),previous=active.at(-2),reverse=previous&&distance(last,q)>1&&((last[0]-previous[0])*(q[0]-last[0])+(last[1]-previous[1])*(q[1]-last[1]))<-.1;
      if(last&&(!lineClear(last,q,avoid)||distance(last,q)>30||reverse)){omittedCrossings++;if(active.length>1)fittedRuns.push(active);active=[q];}else if(!last||distance(last,q)>.5)active.push(q);}if(active.length>1)fittedRuns.push(active);}
    for(const run of fittedRuns){const indices=[],path=[];let start=0;
      if(run.slice(1).reduce((n,q,i)=>n+distance(q,run[i]),0)<(source.role==='steel'?35:8))continue;
      while(start<run.length-1){let end=start+1;for(let candidate=start+2;candidate<run.length;candidate++){const a=run[start],b=run[candidate],length=distance(a,b);if(length>320)break;const h0=ground(...a),h1=ground(...b);let valid=Number.isFinite(h0+h1);
          for(let k=start+1;valid&&k<candidate;k++){const q=run[k],t=((q[0]-a[0])*(b[0]-a[0])+(q[1]-a[1])*(b[1]-a[1]))/(length*length);if(t<-.01||t>1.01||segmentDistance(q,a,b)>12||Math.abs(ground(...q)-(h0+t*(h1-h0)))>.8)valid=false;}
          for(let k=0;valid&&k<=Math.ceil(length/3);k++){const t=k/Math.ceil(length/3),q=a.map((n,j)=>n+(b[j]-n)*t);if(!avoid.clear(q)||excluded(q,exclusion,2))valid=false;}
          if(valid)end=candidate;
        }
        const a=run[start],b=run[end],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.01){start=end;continue;}
        const h0=ground(...a),h1=ground(...b);if(!Number.isFinite(h0+h1))throw Error(`Reference barrier outside ground: ${a} / ${b}`);
        const dy=h1-h0,L=Math.hypot(length,dy),right=[dz/length,0,-dx/length],up=[-dx*dy/(length*L),length/L,-dz*dy/(length*L)],height=6.5,center=[(a[0]+b[0])/2,(h0+h1)/2,(a[1]+b[1])/2].map((v,k)=>v+up[k]*(height/2-2.3)),p=[...center,1.5,height,L+2.2,source.role==='steel'?1:2,...right,...up].map((n,i)=>i>=7?Math.round(n*1e8)/1e8:round(n));
        if(intersectsDomain(p,base.meta.startDomain))throw Error('Barrier blocks clear starting area');indices.push(parts.length);parts.push(p);if(!path.length)path.push(a);path.push(b);start=end;
      }
      for(const q of path)maxReferenceShift=Math.max(maxReferenceShift,Math.min(...source.path.slice(1).map((b,i)=>segmentDistance(q,source.path[i],b))));
      if(indices.length)chains.push({role:source.role,referenceChain,closed:source.closed&&runs.length===1&&distance(run[0],run.at(-1))<.01,indices,path});
    }
  }
  // Check complete fitted rectangles against the pit corridor too; source
  // point clipping alone does not account for a rectangle's extended ends.
  const e=exclusion,a=e.direction,mid=(e.start+e.end)/2,pitBox=[e.origin[0]+a[0]*mid,0,e.origin[1]+a[1]*mid,e.halfWidth*2,1,e.end-e.start,1,a[1],0,-a[0],0,1,0],kept=[],keptChains=[];
  let removedStrayConcrete=0,removedShortHooks=0;
  const steelSegments=chains.filter(c=>c.role==='steel').flatMap(c=>c.path.slice(1).flatMap((b,i)=>parts[c.indices[i]][5]>=25?[[c.path[i],b]]:[]));
  for(const chain of chains){let ids=[],path=[];const cut=chain.indices.some(i=>overlapVertices(parts[i],pitBox).length);
    const flush=()=>{if(ids.length)keptChains.push({...chain,closed:chain.closed&&!cut,indices:ids,path});ids=[];path=[];};
    for(let j=0;j<chain.indices.length;j++){const p=parts[chain.indices[j]];if(overlapVertices(p,pitBox).length){removedPitLength+=p[5];flush();continue;}if(chain.role==='steel'&&p[5]<25){removedShortHooks++;flush();continue;}if(chain.role==='concrete'&&Math.min(...steelSegments.map(([a,b])=>segmentDistance([p[0],p[2]],a,b)))>25){removedStrayConcrete++;flush();continue;}if(!path.length)path.push(chain.path[j]);path.push(chain.path[j+1]);ids.push(kept.length);kept.push(p);}flush();
  }
  parts.splice(0,parts.length,...kept);chains.splice(0,chains.length,...keptChains);
  const driving=base.parts.slice(0,base.meta.groups.terrain[0]).filter((_,i)=>!visual.has(i)),blocked=volumeAudit({parts:driving},parts);
  if(blocked.intersections.length)throw Error(`Barriers intersect driving solids: ${JSON.stringify(blocked.intersections.slice(0,5).map(i=>({...i,wall:parts[i.terrainIndex],road:driving[i.trackIndex]})))}`);
  let maxGroundGap=-Infinity,minVisible=Infinity,maxBuried=-Infinity;
  for(const p of parts){const basis=boxBasis(p),steps=Math.ceil(p[5]/2);for(let i=0;i<=steps;i++)for(const side of [-.5,0,.5]){const along=(i/steps-.5)*p[5],x=p[0]+basis.back[0]*along+basis.right[0]*side*p[3]+basis.up[0]*p[4]/2,z=p[2]+basis.back[2]*along+basis.right[2]*side*p[3]+basis.up[2]*p[4]/2,h=ground(x,z),top=topHeight(p,x,z),bottom=top-p[4]/basis.up[1];if(!Number.isFinite(h))throw Error(`Missing ground under barrier ${parts.indexOf(p)}`);maxGroundGap=Math.max(maxGroundGap,bottom-h);maxBuried=Math.max(maxBuried,h-bottom);minVisible=Math.min(minVisible,top-h);}}
  if(maxGroundGap>=0||minVisible<2.5)throw Error(`Barrier grounding failed: ${JSON.stringify({maxGroundGap,minVisible,maxBuried})}`);
  for(const chain of chains)for(let i=1;i<chain.indices.length;i++)if(!boxesOverlap(parts[chain.indices[i-1]],parts[chain.indices[i]],0))throw Error(`Open barrier join ${chain.indices[i]}`);
  if(base.parts.length+parts.length+1>=9500)throw Error('Full build exceeds the 9500 physical-part budget');
  const corners=parts.flatMap(boxCorners),manifest=JSON.parse(fs.readFileSync(new URL('../release-manifest.json',here))),refs=[...new Set([1,Math.ceil(base.meta.groups.asphalt.length/2),base.meta.groups.asphalt.at(-1)+1,base.meta.groups.pitLane[0]+1,base.meta.groups.pitLane.at(-1)+1,base.parts.length])],requiredBase={version:manifest.version,count:base.parts.length,checksum:checksum(base.parts),references:refs.map(index=>({index,part:base.parts[index-1]}))},groups={grey:[],concrete:[]};for(const [i,p] of parts.entries())groups[p[6]===1?'grey':'concrete'].push(i);
  return {meta:{
    format:base.meta.format,variant:'clear-start-compact-barriers',name:'Red Bull Ring tidy concrete barrier paths',gameTarget:base.meta.gameTarget,partCount:parts.length,
    palette:[{name:'grey-concrete',rgb:[164,166,165],material:'Concrete'},{name:'reference-concrete',rgb:[180,181,176],material:'Concrete'}],
    planBounds:{min:[0,1,2].map(k=>Math.min(...corners.map(q=>q[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(q=>q[k])))},
    catalogRoles:[{name:'Others68',appearance:'color',partIndices:groups.grey},{name:'Others68',appearance:'template',partIndices:groups.concrete}],
    nonCollidingPartIndices:[],requiredBase,groups,chains,pitStraightExclusion:exclusion,
    reference:{sourceSha256:reference.meta.sourceSha256,materials:reference.meta.materials,
      method:'GLB footprints thinned at 2 studs; omit bracket spurs under 40 studs; simplify fitted runs without loops or sharp terrain detours; remove isolated concrete beyond 25 studs from the main runs',
      implementation:'Long rectangular Others68 concrete Parts: grey on the former steel runs, native appearance on retained concrete terminals. No Others88 or steel material.',
      maxReferenceShiftStuds:maxReferenceShift,removedPitStraightLengthStuds:removedPitLength,removedStartAreaLengthStuds:removedStartLength,removedStrayConcrete,removedShortHooks,omittedCrossings},
    audit:{combinedObjects:base.parts.length+parts.length+1,physicalBaseParts:base.parts.length+parts.length+1,drivingSolidIntersections:blocked.intersections.length,maxGroundGap,maxBuried,minVisible},
    sourceSha256:reference.meta.sourceSha256,centerlineSha256:base.meta.centerlineSha256,placementAnchor:base.meta.placementAnchor},parts};
}
