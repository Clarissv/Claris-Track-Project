import {unit,cross,dot} from './lib/track-geometry.mjs';
import {round,boxBasis} from './lib/geometry.mjs';
import {topFootprint,topHeight,overlapVertices,inFootprint} from './lib/surface-audit.mjs';
import {constrainSurfaces,clearanceAudit} from './lib/bulk-terrain.mjs';
import {carveTerrain} from './lib/domain.mjs';
import {auditRunoff} from './audit-runoff.mjs';
import {compactRunoff} from './compact-runoff.mjs';
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function distance(poly,x,z){let positive=true,negative=true,best=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],c=dx*(z-a[1])-dz*(x-a[0]);positive&&=c>=-1e-6;negative&&=c<=1e-6;const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));best=Math.min(best,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));}return positive||negative?0:best;}
export function fitGrid(samples,right,color){const mean=[0,1,2].map(k=>samples.reduce((s,p)=>s+p[k],0)/samples.length);let xx=0,xz=0,zz=0,xy=0,zy=0;for(const p of samples){const x=p[0]-mean[0],z=p[2]-mean[2],y=p[1]-mean[1];xx+=x*x;xz+=x*z;zz+=z*z;xy+=x*y;zy+=z*y;}const det=xx*zz-xz*xz,gx=det>1e-12?(xy*zz-zy*xz)/det:0,gz=det>1e-12?(zy*xx-xy*xz)/det:0,up=unit([-gx,1,-gz]),r=unit([right[0],gx*right[0]+gz*right[2],right[2]]),back=cross(r,up);let width=0,length=0,error=0;
  for(const p of samples){const delta=[p[0]-mean[0],gx*(p[0]-mean[0])+gz*(p[2]-mean[2]),p[2]-mean[2]];width=Math.max(width,2*Math.abs(dot(delta,r)));length=Math.max(length,2*Math.abs(dot(delta,back)));error=Math.max(error,Math.abs(p[1]-mean[1]-delta[1]));}
  return {part:[...mean.map((v,k)=>round(v-up[k]*.15)),round(width+.025),.3,round(length+.025),color,...r,...up],error};
}
export function smoothRunoff(plan){const {parts,meta}=plan,before=auditRunoff(plan),roads=[...meta.roadSegments.map(s=>({...s,kind:'main'})),...meta.pitSegments.map(s=>({...s,kind:'pit'}))].map(s=>({...s,part:parts[s.index],poly:topFootprint(parts[s.index])})),buckets=new Map(),cell=128,n=plan.centerline.length-1,pitLine=meta.pitPoints.map(p=>[...p.pos,p.wr,p.wl,p.s,...p.normal]);
  for(const s of roads){const xs=s.poly.map(p=>p[0]),zs=s.poly.map(p=>p[1]);for(let x=Math.floor((Math.min(...xs)-80)/cell);x<=Math.floor((Math.max(...xs)+80)/cell);x++)for(let z=Math.floor((Math.min(...zs)-80)/cell);z<=Math.floor((Math.max(...zs)+80)/cell);z++){const key=`${x}:${z}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(s);}}
  const near=(x,z)=>buckets.get(`${Math.floor(x/cell)}:${Math.floor(z/cell)}`)??[],ranges=meta.bridge.pairs.flatMap(p=>[p.lower,p.upper]).map(i=>meta.roadSegments.find(s=>s.index===i)).map(s=>[s.start-240,s.end+240]),protectedLayer=(i,kind)=>kind==='main'&&ranges.some(([a,b])=>i>=a&&i<=b);
  function height(x,z,index,kind){const line=kind==='main'?plan.centerline:pitLine,p=line[index],a=line[Math.max(0,index-1)],b=line[Math.min(line.length-1,index+1)],h=Math.hypot(b[0]-a[0],b[2]-a[2]),baseline=p[1]-(p[6]*(x-p[0])+p[8]*(z-p[2]))/p[7],ownDistance=Math.max(0,Math.abs(((x-p[0])*(b[2]-a[2])-(z-p[2])*(b[0]-a[0]))/h)-(kind==='main'?22:13));let other;
    const candidates=near(x,z).map(s=>({...s,d:distance(s.poly,x,z),y:topHeight(s.part,x,z)})).filter(s=>!protectedLayer(index,kind)||Math.abs(s.y-baseline)<8).sort((a,b)=>a.d-b.d);
    const gap=s=>{if(s.kind!==kind)return Infinity;let d=Math.max(0,s.start-index,index-s.end);return kind==='main'?Math.min(d,n-d):d;};
    const first=candidates.find(s=>gap(s)<64);if(!first)return baseline;
    other=candidates.find(s=>gap(s)>500&&s.d<80);
    if(!other)return first.y;const w1=1/(first.d+.05)**2,w2=(1-other.d/80)**2/(other.d+.05)**2;return (first.y*w1+other.y*w2)/(w1+w2);
  }
  const remap=new Map(),recoverySpans=[],apronSpans=[],domain={center:[meta.placementAnchor.position[0],meta.placementAnchor.position[2]],halfSize:200,guard:.1};
  function refit(span,grass){const old=parts[span.index],poly=topFootprint(old),basis=boxBasis(old),kind=span.kind??'main',index=(span.start+span.end)>>1,ids=[];
    const affected=poly.some(([x,z])=>Math.abs(height(x,z,index,kind)-topHeight(old,x,z)-(grass?.032:.018))>.10);
    if(!affected){ids.push(span.index);(grass?recoverySpans:apronSpans).push(span);remap.set(span.index,ids);return;}
    function emit(u0,u1,v0,v1,depth=0){const samples=[];for(const u of [u0,(u0+u1)/2,u1])for(const v of [v0,(v0+v1)/2,v1]){const q=lerp(lerp(poly[0],poly[1],u),lerp(poly[3],poly[2],u),v);samples.push([q[0],height(q[0],q[1],index,kind)-(grass?.032:.018),q[1]]);}const fit=fitGrid(samples,basis.right,old[6]),candidateRoads=near(fit.part[0],fit.part[2]).filter(s=>overlapVertices(fit.part,s.part).length&&(!protectedLayer(index,kind)||Math.abs(topHeight(s.part,fit.part[0],fit.part[2])-topHeight(fit.part,fit.part[0],fit.part[2]))<8)),candidateSand=grass?apronSpans.filter(s=>parts[s.index][6]===8).map(s=>parts[s.index]).filter(p=>Math.abs(p[0]-fit.part[0])<(p[3]+p[5]+fit.part[3]+fit.part[5])/2&&Math.abs(p[2]-fit.part[2])<(p[3]+p[5]+fit.part[3]+fit.part[5])/2&&(!protectedLayer(index,kind)||Math.abs(topHeight(p,fit.part[0],fit.part[2])-topHeight(fit.part,fit.part[0],fit.part[2]))<8)):[],constrained=constrainSurfaces({parts:[...candidateRoads.map(s=>s.part),...candidateSand]},[fit.part],.008,false,true);
      const buried=grass&&samples.every(([x,y,z])=>candidateSand.some(p=>inFootprint(p,[x,z])&&topHeight(p,x,z)>topHeight(constrained.parts[0],x,z)));
      if(!buried&&(fit.error>.12||constrained.maximumLowering>.10)&&depth<7&&Math.min(fit.part[3],fit.part[5])>2.5){if((u1-u0)*old[3]>(v1-v0)*old[5]){const m=(u0+u1)/2;emit(u0,m,v0,v1,depth+1);emit(m,u1,v0,v1,depth+1);}else{const m=(v0+v1)/2;emit(u0,u1,v0,m,depth+1);emit(u0,u1,m,v1,depth+1);}return;}
      for(const p of grass?carveTerrain(constrained.parts[0],domain):[constrained.parts[0]]){const id=ids.length?parts.length:span.index;if(ids.length)parts.push(p);else parts[id]=p;ids.push(id);(grass?recoverySpans:apronSpans).push({...span,index:id,fitErrorStuds:fit.error});}
    }emit(0,1,0,1);remap.set(span.index,ids);
  }
  for(const s of meta.runoffSpans)refit(s,false);for(const s of meta.terrain.recoverySpans)refit(s,true);
  for(const group of ['gravel','runoff','terrain'])meta.groups[group]=meta.groups[group].flatMap(i=>remap.get(i)??[i]);for(const run of meta.apronRuns)run.indices=run.indices.flatMap(i=>remap.get(i)??[i]);meta.runoffSpans=apronSpans;meta.terrain.recoverySpans=recoverySpans;meta.terrain.recoveryPartIndices=recoverySpans.map(s=>s.index);
  const sand=meta.groups.gravel.map(i=>parts[i]),greenIds=[...meta.groups.runoff,...meta.terrain.recoveryPartIndices];
  const bulkIds=meta.groups.terrain.filter(i=>!meta.terrain.recoveryPartIndices.includes(i)),bulkFit=constrainSurfaces({parts:[...sand,...greenIds.map(i=>parts[i])]},bulkIds.map(i=>parts[i]),.008,false,true);bulkIds.forEach((id,i)=>parts[id]=bulkFit.parts[i]);
  meta.terrain.clearanceAudit=clearanceAudit({parts:roads.map(s=>s.part)},bulkIds.map(i=>parts[i]),.008,false,true);meta.partCount=parts.length;meta.groupCounts=Object.fromEntries(Object.entries(meta.groups).map(([k,v])=>[k,v.length]));meta.runoffRecovery={before,after:auditRunoff(plan),grassSurfaceParts:recoverySpans.length,refittedApronParts:apronSpans.length};
  compactRunoff(plan);meta.runoffRecovery.after=auditRunoff(plan);meta.runoffRecovery.grassSurfaceParts=meta.terrain.recoveryPartIndices.length;
  if(plan.parts.length+1>=9000)throw Error(`Runoff surfaces exceed 8999 total objects: ${plan.parts.length+1}`);return plan;
}



