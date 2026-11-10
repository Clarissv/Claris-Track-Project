import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readGlb,accessor,nodeMatrix,multiply,transform,encodePng} from '../../../../mesh-geometry.mjs';
import {readBase} from '../generate.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),source=process.argv[2]??path.resolve(here,'../../../../../../Red Bull Ring/source/redbullring.glb');
const glb=readGlb(source),g=glb.json,base=readBase(),reference=JSON.parse(fs.readFileSync(path.resolve(here,'../../../../source/red-bull-ring-reference.json')));
if(glb.sha256!==base.meta.sourceSha256)throw Error('Different GLB source');
const raster=reference.raster,factor=raster.scale*raster.factor*base.meta.layoutScale;
const toPlan=p=>[(p[0]-raster.bounds.min[0])*factor-raster.nx*raster.cell/2*raster.factor*base.meta.layoutScale,p[1]*factor+base.meta.groundLift,(p[2]-raster.bounds.min[2])*factor-raster.nz*raster.cell/2*raster.factor*base.meta.layoutScale];
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],roles=new Map([[56,'steel'],[88,'concrete']]),groups={steel:[],concrete:[]};
function visit(index,parent){const n=g.nodes[index],matrix=multiply(parent,nodeMatrix(n));if(n.mesh!==undefined&&n.name!=='Plane')for(const prim of g.meshes[n.mesh].primitives){const role=roles.get(prim.material);if(!role)continue;const pos=accessor(glb,prim.attributes.POSITION),indices=accessor(glb,prim.indices);
  for(let t=0;t<indices.length;t+=3){const triangle=[0,1,2].map(k=>toPlan(transform(matrix,...pos.subarray(indices[t+k]*3,indices[t+k]*3+3))));
    // Keep complete reference faces here, including wall tops and return ends.
    groups[role].push(triangle.map(p=>p.map(v=>Math.round(v*10000)/10000)));
  }
}for(const c of n.children??[])visit(c,matrix);}
for(const i of g.scenes[g.scene??0].nodes)visit(i,identity);
const metadata={format:'red-bull-ring-glb-barriers-v1',sourceSha256:glb.sha256,baseRelease:JSON.parse(fs.readFileSync(path.resolve(here,'../../release-manifest.json'))).version,factor,materials:[...roles].map(([index,role])=>({index,role,name:g.materials[index].name,triangles:groups[role].length})),note:'GLB reference geometry only. Game identities: Others88 steel (composite), Others68 concrete (Part). Final fitted paths are in the barrier plan.'};
fs.writeFileSync(path.join(here,'barrier-reference.json'),JSON.stringify({meta:metadata,groups}));
const b=base.meta.planBounds,ox=b.min[0],oz=b.min[2],w=b.max[0]-ox,h=b.max[2]-oz;
const route=base.centerline.filter((_,i)=>i%8===0).map(p=>`${p[0]-ox},${p[2]-oz}`).join(' ');
const overlay=Object.entries(groups).map(([role,triangles])=>{const d=triangles.map(t=>`M${t.map(p=>`${(p[0]-ox).toFixed(2)},${(p[2]-oz).toFixed(2)}`).join('L')}Z`).join('');return `<path d="${d}" fill="${role==='steel'?'#6dc4ef':'#ffcf79'}" stroke="${role==='steel'?'#6dc4ef':'#ffcf79'}" stroke-width="2"/>`;}).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#253b29"/><polyline points="${route}" fill="none" stroke="#747b7e" stroke-width="40"/>${overlay}<g fill="white" font-size="85" font-family="sans-serif"><text x="120" y="150">GLB barrier reference: steel in blue; concrete in gold</text><text x="120" y="260">Source layout before clearance fitting to the revised road and pit</text></g></svg>`;
fs.writeFileSync(path.join(here,'reference-overview.svg'),svg);
const width=1800,height=1300,scale=Math.min((width-50)/w,(height-50)/h),pixels=Buffer.alloc(width*height*4);
for(let i=0;i<pixels.length;i+=4)pixels.set([37,59,41,255],i);
const project=p=>[25+(p[0]-ox)*scale,25+(p[2]-oz)*scale];
function line(a,b,color,radius){const dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy;for(let y=Math.max(0,Math.floor(Math.min(a[1],b[1])-radius));y<=Math.min(height-1,Math.ceil(Math.max(a[1],b[1])+radius));y++)for(let x=Math.max(0,Math.floor(Math.min(a[0],b[0])-radius));x<=Math.min(width-1,Math.ceil(Math.max(a[0],b[0])+radius));x++){const t=L?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/L)):0;if(Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)<=radius)pixels.set([...color,255],(y*width+x)*4);}}
const road=base.centerline.filter((_,i)=>i%8===0);for(let i=1;i<road.length;i++)line(project(road[i-1]),project(road[i]),[116,123,126],20*scale);
for(const [role,triangles] of Object.entries(groups))for(const t of triangles)for(let k=0;k<3;k++)line(project(t[k]),project(t[(k+1)%3]),role==='steel'?[109,196,239]:[255,207,121],.85);
fs.writeFileSync(path.join(here,'reference-overview.png'),encodePng(width,height,pixels));
console.log(JSON.stringify(metadata,null,2));
