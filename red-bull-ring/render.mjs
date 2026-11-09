import fs from 'node:fs';
import path from 'node:path';
import { encodePng } from './mesh-geometry.mjs';
import { boxCorners, boxBasis } from './geometry.mjs';
import { dot, unit } from './track-geometry.mjs';
const faces=[[[1,0,0],[1,3,7,5]],[[-1,0,0],[0,4,6,2]],[[0,1,0],[2,6,7,3]],[[0,-1,0],[0,1,5,4]],[[0,0,1],[4,5,7,6]],[[0,0,-1],[0,2,3,1]]];
export function previewParts(plan) {
  const b=plan.meta.planBounds;
  const parts=[...plan.parts];
  if(plan.meta.placementAnchor){const p=plan.meta.placementAnchor.position;parts.push([p[0],(plan.meta.placementAnchor.roadHeight??0)+2,p[2],8,4,8,9,1,0,0,0,1,0]);}
  return parts;
}
export function render(plan,width=1400,height=900,view={}) {
  const parts=previewParts(plan),palette=plan.meta.palette;
  const right=view.right??(view.top?[1,0,0]:[Math.SQRT1_2,0,-Math.SQRT1_2]),up=view.up??(view.top?[0,0,-1]:[-0.353553,0.866025,-0.353553]),forward=view.forward??(view.top?[0,1,0]:[0.612372,0.5,0.612372]);
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
  for(const [turn,index,span] of [[1,730,1250],[3,2230,1250],[9,6060,1100],[10,6440,1150]])fs.writeFileSync(path.join(directory,`build-turn-${turn}.png`),render(plan,1100,800,{top:true,target:plan.centerline[index*2].slice(0,3),span}));
  for(const [name,index] of [['final',13000],['middle',8500],['uphill',4400]]){
    const p=plan.centerline[Math.min(index,plan.centerline.length-1)];
    fs.writeFileSync(path.join(directory,`build-terrain-${name}.png`),render(plan,1200,800,{target:p.slice(0,3),span:1100,right:[Math.SQRT1_2,0,-Math.SQRT1_2],up:[-.09,.992,-.09],forward:[.7,.127,.7]}));
  }
  const joint=plan.meta.surfaceSmoothing.roadJoins.worst.map(i=>plan.parts[i]),target=[0,1,2].map(k=>(joint[0][k]+joint[1][k])/2),b=boxBasis(joint[0]),along=unit([b.back[0],0,b.back[2]]),side=[along[2],0,-along[0]];
  fs.writeFileSync(path.join(directory,'build-road-joint.png'),render(plan,1200,800,{target,span:100,right:along,up:[-side[0]*.28,.96,-side[2]*.28],forward:[side[0]*.96,.28,side[2]*.96]}));
  const start=plan.centerline[0].slice(0,3);
  fs.writeFileSync(path.join(directory,'build-3d-detail.png'),render(plan,1400,900,{target:start,span:450*(plan.meta.outputScale??1)}));
  const kerb=plan.meta.kerbRuns.find(run=>run.arc.at(-1)>100&&Math.abs(plan.centerline[run.start][0]-plan.centerline[run.end][0])>20);
  if(kerb){const index=(kerb.start+kerb.end)>>1,p=plan.centerline[index],a=plan.centerline[index-1],b=plan.centerline[index+1],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),offset=kerb.side*((kerb.side>0?p[3]:p[4])+plan.meta.settings.curbWidth/2);fs.writeFileSync(path.join(directory,'build-kerb-detail.png'),render(plan,1400,900,{target:[p[0]+dz/length*offset,p[1]+.06,p[2]-dx/length*offset],span:140}));}
  if(plan.meta.placementAnchor)fs.writeFileSync(path.join(directory,'build-start-point.png'),render(plan,1400,900,{top:true,target:plan.meta.placementAnchor.position,span:500}));
  if(plan.meta.pitEntry){const a=plan.meta.pitEntry.start,b=plan.meta.pitEntry.join;fs.writeFileSync(path.join(directory,'build-pit-entry.png'),render(plan,1400,800,{top:true,target:[(a[0]+b[0])/2,0,(a[2]+b[2])/2],span:1000}));}
  if(plan.meta.pitPoints){for(const [name,p] of [['entry',plan.meta.pitPoints[0]],['exit',plan.meta.pitPoints.at(-1)]]){const a=name==='exit'&&plan.meta.pitLayout?plan.meta.pitPoints[plan.meta.pitLayout.exitStartIndex].pos:p.pos,target=p.pos.map((v,k)=>(v+a[k])/2);fs.writeFileSync(path.join(directory,`build-pit-${name}.png`),render(plan,1200,900,{top:true,target,span:name==='exit'?750:600}));}}
  if(plan.meta.pitLayout){const l=plan.meta.pitLayout,a=plan.meta.pitPoints[l.straightStartIndex].pos,b=plan.meta.pitPoints[l.exitStartIndex].pos,[dx,dz]=l.straightDirection;fs.writeFileSync(path.join(directory,'build-pit-lane.png'),render(plan,1600,550,{target:a.map((v,k)=>(v+b[k])/2),span:Math.hypot(b[0]-a[0],b[2]-a[2])+500,right:[dx,0,dz],up:[dz,0,-dx],forward:[0,1,0]}));}
  if(plan.meta.banner){const b=plan.meta.banner,r=boxBasis(plan.parts[plan.meta.groups.banner[0]]).right;fs.writeFileSync(path.join(directory,'build-banner-front.png'),render(plan,1280,800,{target:b.position,span:b.width+16,right:r,up:b.imageTop,forward:[0,1,0]}));fs.writeFileSync(path.join(directory,'build-banner-location.png'),render(plan,1000,800,{target:b.position,span:500}));}
  const template=fs.readFileSync(path.join(directory,'viewer-template.html'),'utf8');
  fs.writeFileSync(path.join(directory,'red-bull-ring-3d-viewer.html'),template.replace('/* GENERATED_DATA */',()=>`const PLAN=${JSON.stringify(plan)};`));
  const heights=plan.centerline.map(p=>p[1]),lo=Math.min(...heights),hi=Math.max(...heights),total=plan.centerline.at(-1)[5],poly=plan.centerline.map(p=>`${(60+p[5]/total*1080).toFixed(2)},${(250-(p[1]-lo)/(hi-lo||1)*180).toFixed(2)}`).join(' ');
  fs.writeFileSync(path.join(directory,'elevation-profile.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="320" viewBox="0 0 1200 320"><rect width="1200" height="320" fill="#f5f7fa"/><g font-family="sans-serif" fill="#263541"><text x="60" y="35" font-size="22">Red Bull Ring driving surface driving surface</text><path d="M60 60V250H1140" stroke="#75848e" fill="none"/><polyline points="${poly}" fill="none" stroke="#237d63" stroke-width="2.5"/><text x="60" y="287">0 km</text><text x="1060" y="287">${(plan.meta.lapLengthMetres/1000).toFixed(3)} km</text><text x="60" y="57">${(hi-lo).toFixed(1)} studs of retained elevation change</text></g></svg>`);
}
