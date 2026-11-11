import {adaptiveSegments,boxBasis} from './lib/geometry.mjs';
import {fittedSlab} from './lib/road-geometry.mjs';
import {add,mul,unit,sub} from './lib/track-geometry.mjs';
import {finishPoints} from './lib/reference.mjs';
import {inFootprint} from './lib/surface-audit.mjs';
import {tidyBarrierLine} from './tidy-barriers.mjs';
export const offset=(p,d)=>add(p.pos,mul(p.right,d/Math.hypot(p.right[0],p.right[2])));
export function kerbRanges(points,reference){
  const n=points.length-1,ranges=[];
  for(const side of [-1,1]){
    const records=reference.records.filter(r=>r.side===side),flags=records.map(r=>Boolean(r.kerb));
    // Bridge only tiny sampling holes; leave the model's intentional breaks.
    for(let i=0;i<flags.length;){if(flags[i]){i++;continue;}const a=i;while(i<flags.length&&!flags[i])i++;if(a>0&&i<flags.length&&points[Math.min(n,records[i].index)].s-points[records[a-1].index].s<12)for(let j=a;j<i;j++)flags[j]=true;}
    for(let i=0;i<flags.length;){if(!flags[i]){i++;continue;}let j=i+1;while(j<flags.length&&flags[j])j++;let start=Math.max(0,records[i].index-1),end=Math.min(n,records[j-1].index+1);if(points[end].s-points[start].s>12)ranges.push({side,start,end});i=j;}
  }
  return mergeRanges(ranges);
}
function mergeRanges(ranges){const out=[];for(const side of [-1,1]){const list=ranges.filter(r=>r.side===side).sort((a,b)=>a.start-b.start);for(const r of list){const last=out.at(-1);if(last&&last.side===side&&r.start<=last.end+1)last.end=Math.max(last.end,r.end);else out.push({...r});}}return out;}
export function createKerbs(points,ranges,push,pitParts=[]){
  const spans=[],runs=[];
  const expandedPit=pitParts.map(p=>{const q=[...p];q[3]+=5;q[5]+=2;return q;}),cleanRanges=[];
  for(const range of ranges){const flags=[];for(let i=range.start;i<=range.end;i++){const q=offset(points[i],range.side*23.6);flags.push(!expandedPit.some(p=>inFootprint(p,[q[0],q[2]])));}
    for(let i=0;i<flags.length;){if(!flags[i]){i++;continue;}const a=i;while(i<flags.length&&flags[i])i++;if(points[range.start+i-1].s-points[range.start+a].s>12)cleanRanges.push({side:range.side,start:range.start+a,end:range.start+i-1});}
  }
  for(const range of cleanRanges){const {start,end,side}=range,line=points.slice(start,end+1).map(p=>({...p,pos:offset(p,side*(22+1.6)),wr:1.6,wl:1.6})),arc=[0];for(let i=1;i<line.length;i++)arc.push(arc.at(-1)+Math.hypot(...sub(line[i].pos,line[i-1].pos)));
    // One fade per complete run. Stripe transitions never restart the ramp.
    for(let i=0;i<line.length;i++){const p=line[i],fade=Math.min(1,arc[i]/8,(arc.at(-1)-arc[i])/8),rise=.12*Math.max(0,fade),r=p.right,h=Math.hypot(r[0],r[2]);p.pos[1]+=rise/2;p.bank+=(side*rise/3.2);p.right=unit([r[0]/h,p.bank,r[2]/h]);delete p.surfacePlane;}
    finishPoints(line,false);const ids=[];let a=0;
    while(a<line.length-1){const stripe=Math.floor((arc[a]+1e-5)/10);let b=a+1;while(b<line.length-1&&arc[b]<(stripe+1)*10)b++;for(const [u,v] of adaptiveSegments(line.slice(a,b+1),24,.12,5*Math.PI/180,.01)){const part=fittedSlab(line,a+u,a+v,{width:3.2,thickness:.12,color:stripe%2?4:9,guard:.03});part[5]+=.65;const index=push('curbs',part);ids.push(index);spans.push({index,side,start:start+a+u,end:start+a+v,run:runs.length});}a=b;}
    runs.push({...range,arc,indices:ids});
  }
  return {spans,runs};
}
export function apronZones(points,reference){
  const zones=[];
  for(const side of [-1,1]){
    const records=reference.records.filter(r=>r.side===side).map(r=>{let band=r.band&&{...r.band};if(band){const a=points[Math.max(0,r.index-16)],b=points[Math.min(points.length-1,r.index+16)],turn=Math.atan2(a.right[0]*b.right[2]-a.right[2]*b.right[0],a.right[0]*b.right[0]+a.right[2]*b.right[2]),radius=Math.hypot(b.pos[0]-a.pos[0],b.pos[2]-a.pos[2])/Math.max(1e-7,Math.abs(turn));if((turn>0?-1:1)===side){band.outer=Math.min(band.outer,radius*.65);if(band.outer-band.inner<8)band=null;}}return {...r,band};});
    for(let i=0;i<records.length;){if(records[i].band){i++;continue;}const a=i;while(i<records.length&&!records[i].band)i++;if(a===0||i===records.length||points[records[i].index].s-points[records[a-1].index].s>85)continue;for(let j=a;j<i;j++){const t=(j-a+1)/(i-a+1),left=records[a-1].band,right=records[i].band;records[j].band={inner:left.inner*(1-t)+right.inner*t,outer:left.outer*(1-t)+right.outer*t};}}
    for(let i=0;i<records.length;){if(!records[i].band){i++;continue;}const a=i;while(i<records.length&&records[i].band)i++;const list=records.slice(a,i),start=list[0].index,end=list.at(-1).index,hairpinOuter=side===-1&&start>=575*8&&end<=600*8;if(points[end].s-points[start].s<(hairpinOuter?48:180))continue;
      const profile=list.map((r,j)=>{let inner=0,outer=0,w=0;for(let k=Math.max(0,j-7);k<=Math.min(list.length-1,j+7);k++){const weight=Math.exp(-.5*((k-j)/2.5)**2);inner+=list[k].band.inner*weight;outer+=list[k].band.outer*weight;w+=weight;}return {index:r.index,inner:Math.max(25.25,inner/w),outer:outer/w};});
      zones.push({start,end,side,width:Math.max(...profile.map(p=>p.outer-p.inner)),profile,color:8,source:'GRVL01',...(hairpinOuter?{endTaperStuds:8}:{})});
    }
  }
  zones.push({start:1080*8,end:1141*8,side:-1,width:35,color:5});return zones;
}
function apronProfile(zone,index,points){
  if(!zone.profile){const t=(points[index].s-points[zone.start].s)/(points[zone.end].s-points[zone.start].s),width=Math.max(3,zone.width*Math.min(1,t*6,(1-t)*6));return {inner:25.25,outer:25.25+width};}
  const k=Math.min(zone.profile.length-2,Math.max(0,Math.floor((index-zone.start)/8))),a=zone.profile[k],b=zone.profile[k+1],t=(index-a.index)/(b.index-a.index),inner=a.inner+(b.inner-a.inner)*t,outer=a.outer+(b.outer-a.outer)*t,taper=zone.endTaperStuds??30,fade=Math.min(1,(points[index].s-points[zone.start].s)/taper,(points[zone.end].s-points[index].s)/taper);return {inner,outer:inner+Math.max(2,(outer-inner)*fade)};
}
export function createAprons(points,zones,push){const spans=[],runs=[];
  for(const zone of zones){const {start,end,side}=zone,line=points.slice(start,end+1).map((p,k)=>{const {inner,outer}=apronProfile(zone,start+k,points),width=outer-inner;return {...p,pos:offset(p,side*(inner+width/2)),wr:width/2,wl:width/2,width};}),ids=[];
    const segments=adaptiveSegments(line,35,.2,3*Math.PI/180,.06,Infinity,2).flatMap(([a,b])=>{const out=[];let u=a;while(u<b){let v=u+1;while(v<b&&v-u<12&&Math.abs(line[v+1].width-line[u].width)<2)v++;out.push([u,v]);u=v;}return out;});
    for(const [a,b] of segments){const p=fittedSlab(line,a,b,{thickness:.3,color:zone.color,lift:-.018,guard:.15});p[5]+=.6;const index=push(zone.color===8?'gravel':'runoff',p);ids.push(index);spans.push({index,side,start:start+a,end:start+b});}runs.push({...zone,indices:ids});
  }return {spans,runs};
}
export function barrierOffsets(points,zones){const fields={};
  for(const side of [-1,1])fields[side]=points.map((p,i)=>{let width=0;for(const z of zones)if(z.side===side&&i>=z.start&&i<=z.end)width=Math.max(width,apronProfile(z,i,points).outer-22+16);const a=points[Math.max(0,i-24)].pos,b=points[Math.min(points.length-1,i+24)].pos,dx=b[0]-a[0],dz=b[2]-a[2],ds=Math.hypot(dx,dz),r1=points[Math.max(0,i-24)].right,r2=points[Math.min(points.length-1,i+24)].right,turn=Math.atan2(r1[0]*r2[2]-r1[2]*r2[0],r1[0]*r2[0]+r1[2]*r2[2]),radius=Math.abs(turn)>1e-4?ds/Math.abs(turn):1e6,inside=(turn>0?-1:1)===side;return Math.min(22+Math.max(18,width+12),inside?Math.max(30,radius*.65):1e6);});
  // Smooth offsets over arc distance so runoff transitions cannot kink a wall.
  for(const side of [-1,1]){const raw=fields[side],n=raw.length-1;fields[side]=raw.map((_,i)=>{let sum=0,w=0;for(let j=-40;j<=40;j++){const k=(i+j+n)%n,weight=Math.exp(-.5*(j/14)**2);sum+=raw[k]*weight;w+=weight;}return Math.max(raw[i],sum/w);});fields[side][n]=fields[side][0];}
  return fields;
}
export function createBarriers(points,fields,pitMeta,push,pit){const spans=[],runs=[];
  for(const side of [-1,1]){
    const allowed=points.map((p,i)=>!(side===-1&&(i>=pitMeta.entryMainIndex-75&&i<=pitMeta.entryMainIndex+140||i>=pitMeta.exitMainIndex-130&&i<=pitMeta.exitMainIndex+75)));
    if(pit)for(let i=0;i<points.length;i++){if(i<pitMeta.entryMainIndex&&i>pitMeta.exitMainIndex+160)continue;const p=points[i],r=p.right,h=Math.hypot(r[0],r[2]);let q=pit[0],d=Infinity;for(let j=0;j<pit.length;j+=6){const v=pit[j],distance=(p.pos[0]-v.pos[0])**2+(p.pos[2]-v.pos[2])**2;if(distance<d){d=distance;q=v;}}if(d>200**2)continue;const lateral=((q.pos[0]-p.pos[0])*r[0]+(q.pos[2]-p.pos[2])*r[2])/h*side;if(lateral<=0)continue;if(lateral<22+q.wr+19)allowed[i]=false;else fields[side][i]=Math.min(fields[side][i],(22+lateral-q.wr)/2);}
    for(let i=0;i<allowed.length-1;){if(!allowed[i]){i++;continue;}const start=i;while(i<allowed.length-1&&allowed[i])i++;const end=i,raw=points.slice(start,end+1).map((p,k)=>({...p,pos:offset(p,side*fields[side][start+k]),wr:.9,wl:.9,sourceIndex:start+k})),tidied=tidyBarrierLine(raw),line=tidied.points,ids=[];
      for(const [a,b] of adaptiveSegments(line,100,.4,7*Math.PI/180,.05)){const p=fittedSlab(line,a,b,{width:1.8,thickness:5,color:3,lift:4.95,guard:.3});p[5]+=1;const index=push('barriers',p);ids.push(index);spans.push({index,side,start:line[a].sourceIndex,end:line[b].sourceIndex,run:runs.length});}runs.push({side,start,end,indices:ids,path:line.map(p=>p.pos),removedLoops:tidied.removedLoops});
    }
  }return {spans,runs};
}
