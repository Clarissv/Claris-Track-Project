import fs from 'node:fs';
import path from 'node:path';
import { encodePng } from './mesh-geometry.mjs';
import { boxCorners, boxBasis } from './geometry.mjs';
import { dot, unit } from './track-geometry.mjs';
const faces=[[[1,0,0],[1,3,7,5]],[[-1,0,0],[0,4,6,2]],[[0,1,0],[2,6,7,3]],[[0,-1,0],[0,1,5,4]],[[0,0,1],[4,5,7,6]],[[0,0,-1],[0,2,3,1]]];
export function previewParts(plan) {
  const b=plan.meta.planBounds;
  return [[(b.min[0]+b.max[0])/2,-0.52,(b.min[2]+b.max[2])/2,plan.meta.width+160,1,plan.meta.depth+160,5,1,0,0,0,1,0],...plan.parts];
}
export function render(plan,width=1400,height=900,view={}) {
  const parts=previewParts(plan),palette=plan.meta.palette;
  const right=view.top?[1,0,0]:[Math.SQRT1_2,0,-Math.SQRT1_2],up=view.top?[0,0,-1]:[-0.353553,0.866025,-0.353553],forward=view.top?[0,1,0]:[0.612372,0.5,0.612372];
  const projected=parts.map(p=>boxCorners(p).map(v=>[dot(v,right),dot(v,up),dot(v,forward)]));
  const min=[Infinity,Infinity],max=[-Infinity,-Infinity];
  for(const box of projected)for(const p of box)for(let k=0;k<2;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
  const cx=view.target?dot(view.target,right):(min[0]+max[0])/2,cy=view.target?dot(view.target,up):(min[1]+max[1])/2,scale=view.span?width/view.span:Math.min((width-60)/(max[0]-min[0]),(height-60)/(max[1]-min[1]));
  const pixels=Buffer.alloc(width*height*4),depths=new Float64Array(width*height).fill(-Infinity);
  for(let i=0;i<width*height;i++)pixels.set([23,30,35,255],i*4);
  function triangle(a,b,c,color) {
    const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9)return;
    const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0]))),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
      const wa=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den,wb=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den,wc=1-wa-wb;
      if(Math.min(wa,wb,wc)<-1e-7)continue;
      const d=wa*a[2]+wb*b[2]+wc*c[2],at=y*width+x;if(d<=depths[at])continue;depths[at]=d;pixels.set([...color,255],at*4);
    }
  }
  projected.forEach((box,i)=> {
    const vertices=box.map(p=>[(p[0]-cx)*scale+width/2,height/2-(p[1]-cy)*scale,p[2]]),basis=boxBasis(parts[i]);
    for(const [normal,face] of faces) {
      const world=[0,1,2].map(k=>basis.right[k]*normal[0]+basis.up[k]*normal[1]+basis.back[k]*normal[2]),light=.48+.52*Math.max(0,dot(world,unit([.6,1,.4]))),color=palette[parts[i][6]-1].rgb.map(c=>Math.round(c*light));
      triangle(vertices[face[0]],vertices[face[1]],vertices[face[2]],color);triangle(vertices[face[0]],vertices[face[2]],vertices[face[3]],color);
    }
  });
  return encodePng(width,height,pixels);
}
export function writeArtifacts(directory,plan) {
  fs.writeFileSync(path.join(directory,'build-3d.png'),render(plan));
  fs.writeFileSync(path.join(directory,'build-topdown.png'),render(plan,1400,1200,{top:true}));
  const start=plan.centerline[0].slice(0,3);
  fs.writeFileSync(path.join(directory,'build-3d-detail.png'),render(plan,1400,900,{target:start,span:450*(plan.meta.outputScale??1)}));
  const template=fs.readFileSync(path.join(directory,'viewer-template.html'),'utf8');
  fs.writeFileSync(path.join(directory,'sepang-3d-viewer.html'),template.replace('/* GENERATED_DATA */',()=>`const PLAN=${JSON.stringify(plan)};`));
  const heights=plan.centerline.map(p=>p[1]),lo=Math.min(...heights),hi=Math.max(...heights),total=plan.centerline.at(-1)[5],poly=plan.centerline.map(p=>`${(60+p[5]/total*1080).toFixed(2)},${(250-(p[1]-lo)/(hi-lo||1)*180).toFixed(2)}`).join(' ');
  fs.writeFileSync(path.join(directory,'elevation-profile.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="320" viewBox="0 0 1200 320"><rect width="1200" height="320" fill="#f5f7fa"/><g font-family="sans-serif" fill="#263541"><text x="60" y="35" font-size="22">Flat Sepang driving surface</text><path d="M60 60V250H1140" stroke="#75848e" fill="none"/><polyline points="${poly}" fill="none" stroke="#237d63" stroke-width="2.5"/><text x="60" y="287">0 km</text><text x="1060" y="287">${(plan.meta.lapLengthMetres/1000).toFixed(3)} km</text><text x="60" y="57">${(hi-lo).toFixed(1)} studs of retained elevation change</text></g></svg>`);
}
