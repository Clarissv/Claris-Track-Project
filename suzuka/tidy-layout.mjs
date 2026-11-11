import fs from 'node:fs';
import {parseTrackCsv,transform2,unit} from './lib/track-geometry.mjs';
import {catmull} from './lib/geometry.mjs';
import {finishPoints} from './lib/reference.mjs';
import {smoothDrivingPoints} from './lib/smooth-surface.mjs';
export function tidyLayout(reference){
  const rows=parseTrackCsv(fs.readFileSync(new URL('source/Suzuka.csv',import.meta.url),'utf8'));
  const width=1800,scale=width/(1021.81201171875),nz=Math.ceil(2010.9620361328125*scale);
  // Undo only the raster origin used by the original similarity fit. Keep the
  // database's clean horizontal route instead of snapping it to branch pixels.
  const raw=rows.map((r,i)=>{const q=transform2(r,reference.alignment),x=q[0]/scale+reference.center[0],z=(q[1]+(nz-2010.9620361328125*scale)/2)/scale+reference.center[2],source=reference.points[i*8];return {pos:[(x-reference.center[0])*reference.realScale,source.pos[1],(z-reference.center[2])*reference.realScale],wr:22,wl:22,bank:source.bank};});
  const straightX=(501.1269-reference.center[0])*reference.realScale;
  for(let i=0;i<raw.length;i++){
    const p=raw[i],z=p.pos[2]/reference.realScale+reference.center[2];
    if(i<135||i>1143){const w=i<128||i>1150?1:i<135?(135-i)/7:(i-1143)/7;p.pos[0]=p.pos[0]*(1-w)+straightX*w;}
  }
  // The CSV bends toward the older pit approach here. Follow the GLB's main
  // chicane (the two apex kerbs in the supplied reference) before the last curve.
  const chicaneStart=1065,chicaneEnd=1113,nativeChicane=[[233.8528,-73.7750],[250,-75.4],[270,-74.5],[290,-71],[310,-66],[330,-58.5],[345,-52.5],[356,-47.5],[360.5,-41],[358.5,-34],[354.5,-26],[354.5,-20],[359,-15],[370,-13],[385,-11.5],[401,-6],[416,1],[430.2409,10.3518]],path=[];
  for(let i=0;i<nativeChicane.length-1;i++)for(let j=0;j<24;j++){const t=j/24,p=catmull(nativeChicane[Math.max(0,i-1)],nativeChicane[i],nativeChicane[i+1],nativeChicane[Math.min(nativeChicane.length-1,i+2)],t);path.push(p);}path.push(nativeChicane.at(-1));
  const sourceArc=[0];for(let i=1;i<path.length;i++)sourceArc.push(sourceArc.at(-1)+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]));
  const sourcePath=path.map(p=>[...p]);for(let i=1;i<path.length-1;i++){let x=0,z=0,w=0;for(let j=Math.max(0,i-100);j<=Math.min(path.length-1,i+100);j++){const distance=sourceArc[j]-sourceArc[i],weight=Math.exp(-.5*(distance/10)**2)*(sourceArc[Math.min(path.length-1,j+1)]-sourceArc[Math.max(0,j-1)]);x+=sourcePath[j][0]*weight;z+=sourcePath[j][1]*weight;w+=weight;}let blend=Math.max(0,Math.min(1,Math.min(sourceArc[i],sourceArc.at(-1)-sourceArc[i])/35));blend=blend**3*(10+blend*(-15+6*blend));path[i]=[sourcePath[i][0]*(1-blend)+x/w*blend,sourcePath[i][1]*(1-blend)+z/w*blend];}
  const arc=[0];for(let i=1;i<path.length;i++)arc.push(arc.at(-1)+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]));
  for(let i=chicaneStart;i<=chicaneEnd;i++){const s=(i-chicaneStart)/(chicaneEnd-chicaneStart)*arc.at(-1);let k=0;while(k<path.length-2&&arc[k+1]<s)k++;const t=(s-arc[k])/(arc[k+1]-arc[k]),x=path[k][0]+(path[k+1][0]-path[k][0])*t,z=path[k][1]+(path[k+1][1]-path[k][1])*t;raw[i].pos[0]=(x-reference.center[0])*reference.realScale;raw[i].pos[2]=(z-reference.center[2])*reference.realScale;}
  const points=[];for(let i=0;i<raw.length;i++)for(let j=0;j<8;j++){const a=raw[i],b=raw[(i+1)%raw.length],t=j/8;points.push({pos:catmull(raw[(i+raw.length-1)%raw.length].pos,a.pos,b.pos,raw[(i+2)%raw.length].pos,t),wr:22,wl:22,bank:a.bank+(b.bank-a.bank)*t});}finishPoints(points);
  return {points,meta:{method:'Clean CSV route with a straight main straight and a GLB-aligned main chicane',mainStraightRanges:[[0,127*8],[1151*8,points.length-1]],chicaneRange:[1065*8,1113*8],chicaneNativeAnchors:nativeChicane,constantRoadWidthStuds:44}};
}
export function pitLayout(main,reference){
  const entry=1117*8,blendEnd=1151*8,exit=100*8,n=main.length-1,entryLength=main[blendEnd].s-main[entry].s,exitStart=main[80*8].s,exitLength=main[exit].s-exitStart,separation=(501.1269-480)*reference.realScale;
  const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
  const nearest=(x,z)=>{let best=0,d=Infinity;for(let i=0;i<main.length-1;i++){const p=main[i].pos,v=(p[0]-x)**2+(p[2]-z)**2;if(v<d){d=v;best=i;}}return main[best];};
  // One sweep follows the yellow line into the pit straight. Its heading
  // decreases continuously, with no intermediate inward/outward bend.
  const start=main[entry].pos,end=[(480-reference.center[0])*reference.realScale,0,main[blendEnd].pos[2]],r=main[entry].right,h=Math.hypot(r[0],r[2]),t=[-r[2]/h,r[0]/h];
  const left=main[entry-1],right=main[entry+1],distance=Math.hypot(right.pos[0]-left.pos[0],right.pos[2]-left.pos[2]),tangent=p=>{const h=Math.hypot(p.right[0],p.right[2]);return [-p.right[2]/h,p.right[0]/h];},lt=tangent(left),rt=tangent(right),curvature=rt.map((v,i)=>(v-lt[i])/distance),a=[start[0],start[2]],b=[end[0],end[2]];
  const travel=Math.hypot(b[0]-a[0],b[1]-a[1])*1.04,startTravel=Math.min(travel,(b[0]-a[0])*2/t[0]);
  const controls=[a,a.map((v,i)=>v+t[i]*startTravel/5),a.map((v,i)=>v+2*t[i]*startTravel/5+curvature[i]*startTravel*startTravel/20),[b[0],b[1]-travel*2/5],[b[0],b[1]-travel/5],b];
  const approach=s=>{const t=s/entryLength;let q=controls.map(p=>[...p]);for(let j=5;j>0;j--)q=Array.from({length:j},(_,i)=>q[i].map((v,k)=>v*(1-t)+q[i+1][k]*t));return q[0];};
  const points=[];for(let k=entry;k<=n+exit;k++){
    const i=k%n,p=main[i],s=k<n?p.s-main[entry].s:main[n].s-main[entry].s+p.s,merge=k>=n?1-ease((p.s-exitStart)/exitLength):1;
    const q=k<=blendEnd?approach(Math.max(0,Math.min(entryLength,s))):[(480-reference.center[0])*reference.realScale+separation*(1-merge),p.pos[2]],pos=[q[0],p.pos[1],q[1]];
    height(nearest(pos[0],pos[2]),pos);points.push({pos,wr:10.5,wl:10.5,bank:0});
  }finishPoints(points,false);
  for(const p of points){const q=nearest(p.pos[0],p.pos[2]),n=q.normal,r=p.right,h=Math.hypot(r[0],r[2]);p.bank=-(n[0]*r[0]+n[2]*r[2])/(n[1]*h);}
  const filtered=smoothDrivingPoints(points,{heightSigma:100,bankSigma:100,closed:false});
  const blendStart=filtered.find(p=>{const q=nearest(p.pos[0],p.pos[2]);return Math.hypot(q.pos[0]-p.pos[0],q.pos[2]-p.pos[2])>39;}).s,mergeStartIndex=n+80*8-entry;
  for(const [i,p] of filtered.entries()){let q=nearest(p.pos[0],p.pos[2]);const distance=Math.hypot(q.pos[0]-p.pos[0],q.pos[2]-p.pos[2]),t=Math.max(0,Math.min(1,(distance-39)/16));let weight=1-t*t*(3-2*t);if(i<mergeStartIndex){weight=1-ease((p.s-blendStart)/160);q=main[entry];}const n=q.normal,r=p.right,h=Math.hypot(r[0],r[2]),height=q.pos[1]-(n[0]*(p.pos[0]-q.pos[0])+n[2]*(p.pos[2]-q.pos[2]))/n[1],bank=-(n[0]*r[0]+n[2]*r[2])/(n[1]*h);p.pos[1]=p.pos[1]*(1-weight)+height*weight;p.bank=p.bank*(1-weight)+bank*weight;}
  finishPoints(filtered,false);
  const straightStartIndex=blendEnd-entry,taperStuds=40,straightS=filtered[straightStartIndex].s,exitS=filtered[mergeStartIndex].s;
  for(const [i,p] of filtered.entries()){const width=i<=straightStartIndex?16+5*(1-ease((p.s-straightS+taperStuds)/taperStuds)):i>=mergeStartIndex?16+5*ease((p.s-exitS)/taperStuds):16;p.wr=width/2;p.wl=width/2;}
  const branchIndex=filtered.findIndex((p,i)=>{const q=main[(entry+i)%n];return Math.hypot(p.pos[0]-q.pos[0],p.pos[2]-q.pos[2])>22-p.wr;});
  return {points:filtered,meta:{widthStuds:16,entryWidthStuds:21,exitWidthStuds:21,widthTaperStuds:taperStuds,entryMainIndex:entry,entryBranchMainIndex:entry+branchIndex,entryBlendEndMainIndex:blendEnd,exitMainIndex:exit,entryBlendLengthStuds:entryLength,separationStuds:separation,straightStartIndex,exitStartIndex:mergeStartIndex,entryNativeControls:[controls.map(p=>[p[0]/reference.realScale+reference.center[0],p[1]/reference.realScale+reference.center[2]])],method:'Single quintic pit-entry curve following fix/pit-entry-single-curve.png; 21-stud entry/exit taper into a 16-stud pit lane'}};
}
function height(q,pos){const n=q.normal;pos[1]=q.pos[1]-(n[0]*(pos[0]-q.pos[0])+n[2]*(pos[2]-q.pos[2]))/n[1];}
