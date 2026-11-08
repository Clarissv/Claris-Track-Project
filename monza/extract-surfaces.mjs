import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSurfaces} from './model.mjs';
import {rasterize} from './mesh-geometry.mjs';
import {gridIndex,sha} from './reference.mjs';
import {KDTree,dot,sub} from './track-geometry.mjs';
import {tidyRunoffProfiles} from './tidy-runoff.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
function color(rgb) {
  const [r,g,b]=rgb;
  if(r>60&&r>g*1.5&&r>b*1.5)return 9;
  if(g>r*1.15&&g>b*1.15)return 14;
  if(Math.min(r,g,b)>70&&Math.max(r,g,b)-Math.min(r,g,b)<45)return 4;
  return null;
}
export function extractSurfaces(reference) {
  const scene=loadSurfaces(path.join(here,'Autodromo Nazionale Monza.glb'));
  if(scene.sha256!==reference.sourceSha256)throw Error('Changed source model');
  const factor=reference.modelFrame.factor,points=reference.points,count=points.length-1,tree=new KDTree(points.slice(0,count).map((p,i)=>[p.pos[0],p.pos[2],i])),kerb=rasterize({...scene,primitives:scene.primitives.filter(p=>p.role==='kerb')},1800,.5);
  const bins={'-1':Array(count).fill(null),'1':Array(count).fill(null)};
  let evidence=0,rejected=0;
  for(let i=0;i<kerb.heights.length;i++) {
    if(!Number.isFinite(kerb.heights[i]))continue;const c=color([...kerb.pixels.subarray(i*4,i*4+3)]);if(!c)continue;
    const x=((i%kerb.nx+.5)*kerb.cell-kerb.nx*kerb.cell/2)*factor,z=((Math.floor(i/kerb.nx)+.5)*kerb.cell-kerb.nz*kerb.cell/2)*factor,near=tree.nearest([x,z]);if(near.distance>90**2){rejected++;continue;}
    const k=near.point[2],p=points[k],side=dot(sub([x,p.pos[1],z],p.pos),p.right)<0?-1:1;
    const bin=bins[side][k]??={votes:{},x:0,z:0,count:0};bin.votes[c]=(bin.votes[c]??0)+1;bin.x+=x;bin.z+=z;bin.count++;evidence++;
  }
  const zones=[];
  for(const side of [-1,1]) {
    const filled=bins[side].map(b=>b?{color:Number(Object.entries(b.votes).sort((a,b)=>b[1]-a[1])[0][0]),x:b.x/b.count,z:b.z/b.count,evidence:1}:null);
    for(let i=0;i<count;){if(filled[i]){i++;continue;}const first=i;while(i<count&&!filled[i])i++;if(!first||i===count||points[i].s-points[first-1].s>7)continue;for(let k=first;k<i;k++){const f=(k-first+1)/(i-first+1),a=filled[first-1],b=filled[i];filled[k]={color:f<.5?a.color:b.color,x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,evidence:0};}}
    for(let i=0;i<count;){if(!filled[i]){i++;continue;}const start=i;while(i<count&&filled[i])i++;const end=i;if(points[end].s-points[start].s<10)continue;const raw=filled.slice(start,end).map(p=>p.color);for(let j=1;j+1<raw.length;j++)if(raw[j-1]===raw[j+1])filled[start+j].color=raw[j-1];zones.push({id:'source-kerb-'+zones.length,side,start,end,samples:filled.slice(start,end).map((p,k)=>[start+k,p.x,p.z,p.color,p.evidence])});}
  }
  const road=rasterize({...scene,primitives:scene.primitives.filter(p=>p.role==='road')},1800,1),runoff=rasterize({...scene,primitives:scene.primitives.filter(p=>['runoff','sand'].includes(p.role)&&p.name!=='tarmac_nocol_road_monza_0')},1800,1),profiles=[];
  const at=(grid,q)=>gridIndex(grid,q[0]/factor,q[2]/factor),step=4,lateralStep=2;
  for(let i=0;i<count;i+=step) {
    const p=points[i],horizontal=Math.hypot(p.right[0],p.right[2]),right=p.right.map(v=>v/horizontal),q=d=>[p.pos[0]+right[0]*d,p.pos[1],p.pos[2]+right[2]*d];
    const lanes=[];let first=null;
    for(let d=-90;d<=92;d+=lateralStep){const n=at(road,q(d)),present=n>=0&&Number.isFinite(road.heights[n]);if(present&&first===null)first=d;if(!present&&first!==null){if(d-first>=12)lanes.push([first-1,d-1]);first=null;}}
    const lane=lanes.sort((a,b)=>Math.abs((a[0]+a[1])/2)-Math.abs((b[0]+b[1])/2))[0];if(!lane)continue;
    for(const side of [-1,1]) {
      const sourceEdge=side>0?lane[1]:lane[0];let run=null;
      const flush=()=>{if(run&&run.width>=4)profiles.push({side,start:i,end:Math.min(i+step,count),offset:Math.max(0,run.start-1),width:run.width,color:run.color,sourceEdge});run=null;};
      for(let d=2;d<=260;d+=lateralStep){const position=q(sourceEdge+side*d),n=at(runoff,position),nearest=tree.nearest([position[0],position[2]]),arc=Math.abs(points[nearest.point[2]].s-p.s),local=Math.min(arc,points.at(-1).s-arc)<180;let c=null;if(local&&n>=0&&Number.isFinite(runoff.heights[n]))c=runoff.roles[n]==='sand'?8:14;if(run&&c!==run.color)flush();if(c){if(!run)run={start:d,width:0,color:c};run.width+=lateralStep;}}
      flush();
    }
  }
  const tidy=tidyRunoffProfiles(points,profiles,{maximumGapSamples:12,minimumPatchLength:24,minimumPatchArea:240});
  const trace={format:'monza-surfaces-v1',sourceSha256:scene.sha256,referenceSha256:sha(JSON.stringify(reference)),method:'Named source kerb colours and gravel/astroturf footprints projected to the corrected, widened database route. Small grass slivers are filled and compatible bands merged.',zones,runoff:{sourceProfiles:profiles,profiles:tidy.profiles,sections:tidy.sections,report:tidy.report},statistics:{kerbZones:zones.length,kerbEvidenceCells:evidence,rejectedKerbCells:rejected,sourceRunoffProfiles:profiles.length,tidiedRunoffProfiles:tidy.profiles.length}};
  fs.writeFileSync(path.join(here,'source/monza-surfaces.json'),JSON.stringify(trace));return trace;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const r=JSON.parse(fs.readFileSync(path.join(here,'source/monza-reference.json')));console.log(JSON.stringify(extractSurfaces(r).statistics,null,2));}
