import fs from 'node:fs';
import {loadSurfaces} from '../red-bull-ring/model.mjs';
import {rasterize,encodePng} from '../red-bull-ring/mesh-geometry.mjs';
import {parseTrackCsv,alignCenterline,transform2,KDTree,unit,sub} from '../red-bull-ring/track-geometry.mjs';
import {catmull} from '../red-bull-ring/geometry.mjs';
import {finishPoints,gridTree,sampleHeight,sha,STUDS_PER_METRE} from '../red-bull-ring/reference.mjs';
import {skeletonPaths} from './topology.mjs';
import {completeNativePit} from './native-pit.mjs';
import {userPit} from './user-pit.mjs';
import {referencePaths} from './reference-paths.mjs';
const here=new URL('./source/',import.meta.url),write=(name,data)=>fs.writeFileSync(new URL(name,here),JSON.stringify(data));
fs.mkdirSync(here,{recursive:true});
const selection={road:[84,60,75],pit:[46,61,59],kerb:[26,69],gravel:[13,64],grass:[65,62],runoff:[3,41,63,66,68],steel:[21],concrete:[6,7,24]};
const scene=loadSurfaces(new URL('../../Spa-Francorchamps/source/spa.glb',import.meta.url),selection);
const csv=fs.readFileSync(new URL('../../Sepang New/source/racetrack-database/tracks/Spa.csv',import.meta.url)),rows=parseTrackCsv(csv.toString());
fs.writeFileSync(new URL('Spa.csv',here),csv);
const road=rasterize({...scene,primitives:scene.primitives.filter(p=>p.role==='road')},2000,1),tree=gridTree(road);
const fit=alignCenterline(rows,road),factor=STUDS_PER_METRE/fit.scale;
if(fit.p95>10)throw Error('Spa CSV alignment failed');
const normalized=rows.map(p=>transform2(p,fit)),points=[],distances=[];
for(let i=0;i<rows.length;i++)for(let j=0;j<4;j++){
  const t=j/4,q=catmull(normalized[(i+rows.length-1)%rows.length],normalized[i],normalized[(i+1)%rows.length],normalized[(i+2)%rows.length],t),h=sampleHeight(road,tree,...q),along=unit(sub(normalized[(i+1)%rows.length],normalized[(i+rows.length-1)%rows.length]));
  const wr=(rows[i][2]*(1-t)+rows[(i+1)%rows.length][2]*t)*STUDS_PER_METRE,wl=(rows[i][3]*(1-t)+rows[(i+1)%rows.length][3]*t)*STUDS_PER_METRE;
  points.push({pos:[q[0]*factor,h.height*factor,q[1]*factor],wr:fit.reflection===1?wr:wl,wl:fit.reflection===1?wl:wr,bank:Math.max(-.06,Math.min(.06,h.gx*along[1]-h.gz*along[0]))});distances.push(h.distance);
}
finishPoints(points);
const frame={width:2000,cell:1,nx:road.nx,nz:road.nz,scale:road.scale,factor,bounds:scene.bounds};
const reference={format:'spa-reference-v1',sourceSha256:scene.sha256,centerlineSha256:sha(csv),sourceFile:'spa.glb',studsPerMetre:STUDS_PER_METRE,alignment:fit,raster:frame,points,lapLengthMetres:points.at(-1).s/STUDS_PER_METRE,sampling:{maxDistanceNormalized:Math.max(...distances)},surfaceMaterials:selection};
write('spa-reference.json',reference);
const mainTree=new KDTree(points.slice(0,-1).map((p,i)=>[p.pos[0]/factor,p.pos[2]/factor,i]));
const pitGrid=rasterize({...scene,primitives:scene.primitives.filter(p=>p.role==='pit')},2000,1),mask=Uint8Array.from(pitGrid.heights,h=>Number.isFinite(h)?1:0),paths=skeletonPaths(mask,pitGrid.nx,pitGrid.nz);
const candidates=paths.map(path=>{const qs=path.map(i=>[i%pitGrid.nx+.5-pitGrid.nx/2,Math.floor(i/pitGrid.nx)+.5-pitGrid.nz/2]),indices=qs.map(q=>mainTree.nearest(q).point[2]);return {qs,indices,length:path.length,nearStart:indices.filter(i=>i<400||i>points.length-800).length/path.length};});
console.log('Pit candidates',candidates.map(p=>({length:p.length,nearStart:p.nearStart,ends:[p.indices[0],p.indices.at(-1)]})));
const chosen=candidates.filter(p=>p.nearStart>.5).sort((a,b)=>b.length-a.length)[0];if(!chosen)throw Error('No modern pit strip identified');
let vertices=chosen.qs;const n=points.length-1,forwardLength=(chosen.indices.at(-1)-chosen.indices[0]+n)%n;if(forwardLength>n/2)vertices.reverse();
vertices=vertices.filter((_,i,a)=>i%4===0||i===a.length-1);
const pitTree=gridTree(pitGrid),pitPoints=vertices.map((q,i,a)=>{const near=a.slice(Math.max(0,i-3),Math.min(a.length,i+4)),smooth=[0,1].map(k=>near.reduce((s,p)=>s+p[k],0)/near.length),h=sampleHeight(pitGrid,pitTree,...smooth);return {pos:[smooth[0]*factor,h.height*factor,smooth[1]*factor],wr:9,wl:9,bank:0};});
finishPoints(pitPoints,false);
const pavedGrid=rasterize({...scene,primitives:scene.primitives.filter(p=>['road','pit','kerb'].includes(p.role)||[3,41,63].includes(p.materialIndex))},2000,1),nativePit=fs.existsSync(new URL('user-pit-route.json',here))?userPit(reference,JSON.parse(fs.readFileSync(new URL('user-pit-route.json',here)))):completeNativePit(reference,pavedGrid,pitPoints),pitRoute=nativePit.route;
  pitPoints.splice(0,pitPoints.length,...nativePit.points);
const featuresGrid=rasterize({...scene,primitives:scene.primitives.filter(p=>['road','kerb','gravel','runoff'].includes(p.role))},2000,1),records=[];
const at=(grid,x,z)=>{const ix=Math.floor(x/factor+grid.nx/2),iz=Math.floor(z/factor+grid.nz/2);return ix>=0&&ix<grid.nx&&iz>=0&&iz<grid.nz?iz*grid.nx+ix:-1;};
for(let i=0;i<points.length-1;i+=4){const p=points[i],h=Math.hypot(p.right[0],p.right[2]),right=[p.right[0]/h,p.right[2]/h];for(const side of [-1,1]){
  const edge=side>0?p.wr:p.wl,samples=[];for(let d=-4;d<=220;d+=2){const k=at(featuresGrid,p.pos[0]+right[0]*side*(edge+d),p.pos[2]+right[1]*side*(edge+d));const role=k>=0?featuresGrid.roles[k]:null;const rgb=k>=0?Array.from(featuresGrid.pixels.subarray(k*4,k*4+3)):[];const sourceHeight=k>=0?featuresGrid.heights[k]*factor:Infinity,expected=p.pos[1]+p.bank*side*(edge+d),sameLevel=Math.abs(sourceHeight-expected)<=4+Math.max(0,d)*.05;samples.push({d,role:sameLevel?(role==='road'?'runoff':role):null,rgb});}
  const kerb=samples.some(s=>s.d<=16&&s.role==='kerb')?'red':null,bands=[];
  for(let a=0;a<samples.length;){let b=a+1;while(b<samples.length&&samples[b].role===samples[a].role)b++;const role=samples[a].role;if(['gravel','runoff'].includes(role)&&samples[b-1].d-samples[a].d>=6)bands.push({inner:Math.max(3.2,samples[a].d),outer:samples[b-1].d+2,style:role==='gravel'?'sand':i>=145*4&&i<=200*4?'runoff-grey':'runoff-white'});a=b;}
  records.push({index:i,side,kerb,bands});
}}
const kerbRuns=[];
for(const side of [-1,1]){const list=records.filter(r=>r.side===side);let start=null,last=null;for(const r of list){if(r.kerb){if(start===null)start=r.index;last=r.index;}else if(start!==null&&r.index-last>16){if(last-start>=8)kerbRuns.push({side,start,end:Math.min(n,last+4)});start=last=null;}}if(start!==null&&last-start>=8)kerbRuns.push({side,start,end:Math.min(n,last+4)});}
write('spa-features.json',{format:'spa-features-v1',sourceSha256:scene.sha256,pitPoints,pitWidth:18,pitRoute,records,tidy:{kerbRuns,aprons:[],sandKeepRange:[0,n]}});
const margin=80,bounds={min:[scene.bounds.min[0]-margin,scene.bounds.min[1],scene.bounds.min[2]-margin],max:[scene.bounds.max[0]+margin,scene.bounds.max[1],scene.bounds.max[2]+margin]},width=(bounds.max[0]-bounds.min[0])*road.scale;
const grass=rasterize({...scene,bounds,primitives:scene.primitives.filter(p=>p.role==='grass')},width,10);
write('ground-reference.json',{format:'spa-ground-v1',sourceSha256:scene.sha256,cell:10*factor,x0:-grass.nx*10*factor/2,z0:-grass.nz*10*factor/2,nx:grass.nx,nz:grass.nz,heights:Array.from(grass.heights,h=>Number.isFinite(h)?Math.round(h*factor*100)/100:null)});
// Trace real barrier footprints; do not generate a perimeter from road offsets.
const groups={steel:[],concrete:[]};for(const p of scene.primitives)if(groups[p.role])for(let i=0;i<p.indices.length;i+=3){const face=Array.from(p.indices.subarray(i,i+3),j=>[(p.positions[j*3]-scene.bounds.min[0])*road.scale-road.nx/2,p.positions[j*3+1]*road.scale,(p.positions[j*3+2]-scene.bounds.min[2])*road.scale-road.nz/2].map(v=>v*factor));groups[p.role].push(face);}
const barriers=referencePaths({groups},3);write('barrier-paths.json',{sourceSha256:scene.sha256,materials:{steel:[21],concrete:[6,7,24]},paths:barriers});
console.log(JSON.stringify({fit,points:points.length,lapMetres:reference.lapLengthMetres,scale:STUDS_PER_METRE,extraLayoutScale:1,kerbRuns:kerbRuns.length,pitRoute,pitPoints:pitPoints.length,barrierPaths:barriers.length}));
