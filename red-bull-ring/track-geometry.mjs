import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readGlb, loadScene, selectTrackScene, rasterize, encodePng } from './mesh-geometry.mjs';

export const add = (a,b) => a.map((v,i)=>v+b[i]);
export const sub = (a,b) => a.map((v,i)=>v-b[i]);
export const mul = (a,n) => a.map(v=>v*n);
export const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit = a => { const n=Math.hypot(...a); if(n<1e-10)throw Error('Degenerate direction'); return mul(a,1/n); };

export function parseTrackCsv(text) {
  const rows=[];
  for(const [i,line] of text.replace(/^\uFEFF/,'').split(/\r?\n/).entries()) {
    if(!line.trim()||line.trim().startsWith('#'))continue;
    const values=line.split(',').map(v=>Number(v.trim()));
    if(values.length!==4||values.some(v=>!Number.isFinite(v))||values[2]<=0||values[3]<=0)throw Error(`Invalid centerline row ${i+1}; expected x,y,right width,left width`);
    rows.push(values);
  }
  if(rows.length<4)throw Error('Centerline requires at least four points');
  if(Math.hypot(rows[0][0]-rows.at(-1)[0],rows[0][1]-rows.at(-1)[1])<1e-6)rows.pop();
  for(let i=0;i<rows.length;i++)if(Math.hypot(rows[i][0]-rows[(i+1)%rows.length][0],rows[i][1]-rows[(i+1)%rows.length][1])<1e-6)throw Error('Repeated centerline point');
  return rows;
}

export class KDTree {
  constructor(points,depth=0) {
    this.axis=depth%2;
    if(!points.length)return;
    points=[...points].sort((a,b)=>a[this.axis]-b[this.axis]);
    const m=Math.floor(points.length/2); this.point=points[m];
    if(m)this.left=new KDTree(points.slice(0,m),depth+1);
    if(m+1<points.length)this.right=new KDTree(points.slice(m+1),depth+1);
  }
  nearest(point,best={distance:Infinity,point:null}) {
    if(!this.point)return best;
    const d=(this.point[0]-point[0])**2+(this.point[1]-point[1])**2;
    if(d<best.distance)best={distance:d,point:this.point};
    const delta=point[this.axis]-this.point[this.axis], near=delta<0?this.left:this.right, far=delta<0?this.right:this.left;
    if(near)best=near.nearest(point,best);
    if(far&&delta*delta<best.distance)best=far.nearest(point,best);
    return best;
  }
}

export function skeletonize(mask,nx,nz) {
  const out=mask.slice(), occupied=[];
  for(let z=1;z<nz-1;z++)for(let x=1;x<nx-1;x++)if(out[z*nx+x])occupied.push(z*nx+x);
  let changed=true;
  for(let iteration=0;changed&&iteration<200;iteration++) {
    changed=false;
    for(let phase=0;phase<2;phase++) {
      const remove=[];
      for(const at of occupied) {
        if(!out[at])continue;
        const n=[out[at-nx],out[at-nx+1],out[at+1],out[at+nx+1],out[at+nx],out[at+nx-1],out[at-1],out[at-nx-1]];
        const count=n.reduce((s,v)=>s+v,0);
        if(count<2||count>6)continue;
        let transitions=0;for(let k=0;k<8;k++)if(!n[k]&&n[(k+1)%8])transitions++;
        if(transitions!==1)continue;
        if(phase===0?(n[0]*n[2]*n[4]||n[2]*n[4]*n[6]):(n[0]*n[2]*n[6]||n[0]*n[4]*n[6]))continue;
        remove.push(at);
      }
      if(remove.length)changed=true;
      for(const at of remove)out[at]=0;
    }
  }
  return out;
}

export function transform2(point,fit) {
  const x=point[0]*fit.reflection,y=point[1],c=Math.cos(fit.angle),s=Math.sin(fit.angle);
  return [fit.scale*(c*x-s*y)+fit.tx,fit.scale*(s*x+c*y)+fit.ty];
}
const centroid=points=>[0,1].map(k=>points.reduce((s,p)=>s+p[k],0)/points.length);
export function fitSimilarity(points,matches,reflection=1) {
  const q=points.map(p=>[p[0]*reflection,p[1]]),cq=centroid(q),cp=centroid(matches);
  let a=0,b=0,den=0;
  for(let i=0;i<q.length;i++) {
    const x=q[i][0]-cq[0],y=q[i][1]-cq[1],u=matches[i][0]-cp[0],v=matches[i][1]-cp[1];
    a+=x*u+y*v;b+=x*v-y*u;den+=x*x+y*y;
  }
  const scale=Math.hypot(a,b)/den,angle=Math.atan2(b,a),c=Math.cos(angle),s=Math.sin(angle);
  return {scale,angle,reflection,tx:cp[0]-scale*(c*cq[0]-s*cq[1]),ty:cp[1]-scale*(s*cq[0]+c*cq[1])};
}

export function alignCenterline(rows,grid) {
  const mask=Uint8Array.from(grid.heights,h=>Number.isFinite(h)?1:0), thin=skeletonize(mask,grid.nx,grid.nz), points=[];
  for(let i=0;i<thin.length;i++)if(thin[i])points.push([(i%grid.nx+0.5)*grid.cell-grid.nx*grid.cell/2,(Math.floor(i/grid.nx)+0.5)*grid.cell-grid.nz*grid.cell/2]);
  const tree=new KDTree(points),source=rows.filter((_,i)=>i%4===0),cs=centroid(source),ct=centroid(points);
  const variance=(p,c)=>p.reduce((s,q)=>s+(q[0]-c[0])**2+(q[1]-c[1])**2,0)/p.length;
  const initial=Math.sqrt(variance(points,ct)/variance(source,cs));
  let best;
  for(const reflection of [1,-1])for(let seed=0;seed<24;seed++) {
    const angle=seed*Math.PI/12,c=Math.cos(angle),s=Math.sin(angle);
    let fit={scale:initial,angle,reflection,tx:ct[0]-initial*(c*cs[0]*reflection-s*cs[1]),ty:ct[1]-initial*(s*cs[0]*reflection+c*cs[1])};
    for(let it=0;it<50;it++) {
      const matches=source.map(p=>tree.nearest(transform2(p,fit)).point);
      const next=fitSimilarity(source,matches,reflection);
      if(next.scale<initial*0.75||next.scale>initial*1.25)break;
      const change=Math.abs(next.scale-fit.scale)+Math.abs(next.angle-fit.angle)+Math.hypot(next.tx-fit.tx,next.ty-fit.ty);
      fit=next;if(change<1e-5)break;
    }
    const distances=source.map(p=>Math.sqrt(tree.nearest(transform2(p,fit)).distance)).sort((a,b)=>a-b);
    const score=distances.reduce((s,d)=>s+Math.min(d,30)**2,0)/distances.length;
    if(!best||score<best.score)best={...fit,score,median:distances[Math.floor(distances.length/2)],p95:distances[Math.floor(distances.length*0.95)],skeletonPoints:points.length};
  }
  return best;
}

export function loadRoadGrid(source,width=1800,cell=2) {
  const glb=readGlb(source),full=loadScene(glb),scene=selectTrackScene(full);
  const road=rasterize({...scene,primitives:scene.primitives.filter(p=>p.role==='road')},width,cell);
  return {glb,full,scene,road};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const here=path.dirname(fileURLToPath(import.meta.url));
  const rows=parseTrackCsv(fs.readFileSync(path.join(here,'source/Monza.csv'),'utf8'));
  const {road}=loadRoadGrid(path.join(here,'source/monza.glb'));
  const fit=alignCenterline(rows,road);
  console.log(JSON.stringify({rows:rows.length,bounds:[0,1].map(k=>[Math.min(...rows.map(p=>p[k])),Math.max(...rows.map(p=>p[k]))]),lapMetres:rows.reduce((s,p,i)=>s+Math.hypot(p[0]-rows[(i+1)%rows.length][0],p[1]-rows[(i+1)%rows.length][1]),0),fit},null,2));
  fs.writeFileSync(path.join(here,'source/alignment.json'),JSON.stringify(fit,null,2));
  const pixels=Buffer.alloc(road.nx*road.nz*4);
  for(let i=0;i<road.heights.length;i++)pixels.set(Number.isFinite(road.heights[i])?[140,150,155,255]:[23,35,29,255],i*4);
  const plot=(x,z)=>{if(x>=0&&z>=0&&x<road.nx&&z<road.nz)pixels.set([255,65,65,255],(z*road.nx+x)*4);};
  for(let i=0;i<rows.length;i++) {
    const a=transform2(rows[i],fit),b=transform2(rows[(i+1)%rows.length],fit),steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/road.cell*2);
    for(let j=0;j<=steps;j++){const x=Math.floor((a[0]+(b[0]-a[0])*j/steps+road.nx*road.cell/2)/road.cell),z=Math.floor((a[1]+(b[1]-a[1])*j/steps+road.nz*road.cell/2)/road.cell);plot(x,z);plot(x+1,z);}
  }
  fs.writeFileSync(path.join(here,'source/alignment.png'),encodePng(road.nx,road.nz,pixels));
}
