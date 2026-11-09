import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readGlb,loadScene} from './mesh-geometry.mjs';
import {round} from './geometry.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const sha=body=>crypto.createHash('sha256').update(body).digest('hex');
function components(scene,map,material) {
  const vertices=[],triangles=[],lookup=new Map(),parents=[];
  function root(i){while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;}
  for(const p of scene.primitives.filter(p=>p.material.name===material)) {
    const ids=[];
    for(let i=0;i<p.positions.length;i+=3){const raw=[...p.positions.subarray(i,i+3)],key=raw.map(v=>Math.round(v*1000)).join(':');if(!lookup.has(key)){lookup.set(key,vertices.length);parents.push(vertices.length);vertices.push(map(raw));}ids.push(lookup.get(key));}
    for(let i=0;i<p.indices.length;i+=3){const t=[...p.indices.subarray(i,i+3)].map(j=>ids[j]);parents[root(t[0])]=root(t[1]);parents[root(t[1])]=root(t[2]);triangles.push(t);}
  }
  const groups=new Map();for(const t of triangles){const r=root(t[0]);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(t);}
  return [...groups.values()].map(tris=>{const ids=[...new Set(tris.flat())],index=new Map(ids.map((v,i)=>[v,i]));return {vertices:ids.map(i=>vertices[i]),triangles:tris.map(t=>t.map(i=>index.get(i)))}}).sort((a,b)=>b.vertices.length-a.vertices.length);
}
function boundary(component) {
  const edges=new Map();
  for(const t of component.triangles)for(let j=0;j<3;j++){const a=t[j],b=t[(j+1)%3],key=[a,b].sort((a,b)=>a-b).join(':');if(!edges.has(key))edges.set(key,{a,b,n:0});edges.get(key).n++;}
  const adj=new Map();for(const e of [...edges.values()].filter(e=>e.n===1))for(const [a,b] of [[e.a,e.b],[e.b,e.a]]){if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b);}
  if([...adj.values()].some(a=>a.length!==2))throw Error('Pit boundary is not a closed simple ring');
  const seen=new Set(),loops=[];for(const first of adj.keys()){if(seen.has(first))continue;const loop=[];let at=first,prev=-1;while(!seen.has(at)){seen.add(at);loop.push(component.vertices[at]);const next=adj.get(at).find(i=>i!==prev);prev=at;at=next;}loops.push(loop);}
  return loops.sort((a,b)=>b.length-a.length)[0];
}
function boundarySection(ring,start,end,direction) {
  const closest=q=>ring.reduce((best,p,i)=>Math.hypot(p[0]-q[0],p[1]-q[1])<Math.hypot(ring[best][0]-q[0],ring[best][1]-q[1])?i:best,0);
  const a=closest(start),b=closest(end),result=[];
  if(Math.hypot(ring[a][0]-start[0],ring[a][1]-start[1])>.02||Math.hypot(ring[b][0]-end[0],ring[b][1]-end[1])>.02)throw Error('Inspected pit boundary landmarks differ');
  for(let i=a;result.length<=ring.length;i=(i+direction+ring.length)%ring.length){result.push(ring[i]);if(i===b)return result;}
  throw Error('Pit boundary traversal failed');
}
function arc(line){const result=[0];for(let i=1;i<line.length;i++)result.push(result.at(-1)+Math.hypot(line[i][0]-line[i-1][0],line[i][1]-line[i-1][1]));return result;}
function at(line,lengths,f){const s=lengths.at(-1)*f;let i=1;while(i<line.length-1&&lengths[i]<s)i++;const t=(s-lengths[i-1])/(lengths[i]-lengths[i-1]);return [0,1].map(k=>line[i-1][k]*(1-t)+line[i][k]*t);}
export function extractFeatures(filename,reference,frame) {
  const glb=readGlb(filename);if(glb.sha256!==reference.meta.sourceSha256)throw Error('Feature model differs from the frozen reference');
  const scene=loadScene(glb),{bounds,sourceWidth,sourceCell,outputScale}=frame,scale=sourceWidth/(bounds.max[0]-bounds.min[0]),nx=Math.ceil(sourceWidth/sourceCell),nz=Math.ceil((bounds.max[2]-bounds.min[2])*scale/sourceCell);
  const map=p=>[(p[0]-bounds.min[0])*scale*outputScale-nx*sourceCell/2*outputScale,(p[2]-bounds.min[2])*scale*outputScale-nz*sourceCell/2*outputScale];
  const road=components(scene,map,'Sepang1401Mtl'),ring=boundary(road[1]);
  // Landmarks are vertices inspected on the outside entry branch of T15,
  // excluding the diagonal service road and the full main straight.
  const inner=boundarySection(ring,[-1099.7592,15.4895],[-455.6074,16.3390],-1);
  const outer=boundarySection(ring,[-1124.1177,8.4860],[-451.5327,34.2868],1);
  const ia=arc(inner),oa=arc(outer),samples=[];
  for(let i=0;i<=240;i++){const a=at(inner,ia,i/240),b=at(outer,oa,i/240);samples.push(a.map((v,k)=>round((v+b[k])/2)));}
  const approach=[-1116.3925,-44.7040];
  const seats=scene.primitives.filter(p=>p.material.name==='Sepang1621Mtl').flatMap(p=>{const points=[];for(let i=0;i<p.positions.length;i+=3)points.push(map([...p.positions.subarray(i,i+3)]));return points;});
  const mainStand=seats.filter(p=>p[0]>-1100&&p[0]<1000&&p[1]>-430&&p[1]<-70);
  if(mainStand.length<1000)throw Error('Main grandstand reference is missing');
  const facingTarget=[0,1].map(k=>round(mainStand.reduce((s,p)=>s+p[k],0)/mainStand.length));
  const top=reference.centerline.reduce((a,b)=>a[2]<b[2]?a:b);
  return {
    pit:{format:'sepang-pit-entry-trace-v1',sourceSha256:glb.sha256,centerlineSha256:sha(JSON.stringify(reference.centerline)),coordinateFrame:frame,material:'Sepang1401Mtl',approach,inner:inner.map(p=>p.map(round)),outer:outer.map(p=>p.map(round)),samples,method:'Midpoints of corresponding normalized boundary arcs on the inspected outer T15 pit-entry branch. Start joins the widened CSV road; end blends into the retained parallel pit straight.',retainedLaneMinimumX:-430},
    banner:{format:'sepang-banner-placement-v1',sourceSha256:glb.sha256,corner:[round(top[0]),round(top[2])],facingTarget,grandstandMaterial:'Sepang1621Mtl',grandstandVertexCount:mainStand.length,method:'One rectangular banner laid flat on the grass inside the topmost corner shown in banner area.png, readable from the model main-grandstand side.',placementZone:'inside-corner',orientation:'ground',width:128,height:72,clearanceFromTrack:24}
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const reference=JSON.parse(fs.readFileSync(path.join(here,'source/sepang-reference.json'))),frame=JSON.parse(fs.readFileSync(path.join(here,'source/sepang-kerbs.json'))).coordinateFrame;
  const feature=extractFeatures(process.argv[2]??path.join(here,'../Sepang Old/source/sepang.glb'),reference,frame);
  for(const [name,value] of [['sepang-pit-entry.json',feature.pit],['bluenight-placement.json',feature.banner]])fs.writeFileSync(path.join(here,'source',name),JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify({pitSamples:feature.pit.samples.length,banner:feature.banner},null,2));
}
