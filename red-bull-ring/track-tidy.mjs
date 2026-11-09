import {finishPoints} from './reference.mjs';
import {adaptiveSegments} from './geometry.mjs';
import {fittedSlab} from './road-geometry.mjs';
import {add,mul,sub,unit} from './track-geometry.mjs';
import {overlapVertices,topHeight,topFootprint} from './surface-audit.mjs';

export function fitKerbsBelowRoad(roads,parts){
  const bounds=p=>{const q=topFootprint(p);return [Math.min(...q.map(v=>v[0])),Math.max(...q.map(v=>v[0])),Math.min(...q.map(v=>v[1])),Math.max(...q.map(v=>v[1]))];},indexed=roads.map(p=>({p,b:bounds(p)}));let modified=0,maximumLowering=0;
  const result=parts.map(part=>{const p=[...part],a=bounds(p);let lower=0;for(const {p:road,b} of indexed){if(a[0]>b[1]||a[1]<b[0]||a[2]>b[3]||a[3]<b[2])continue;for(const [x,z] of overlapVertices(p,road))lower=Math.max(lower,topHeight(p,x,z)-topHeight(road,x,z)+.002);}if(lower>0){p[1]-=lower+.0002;modified++;maximumLowering=Math.max(maximumLowering,lower);}return p;});
  return {parts:result,modified,maximumLowering};
}

export function addContinuousKerbs(points,ranges,pitParts,settings,push){
  const spans=[],runs=[];
  for(const range of ranges){
    const side=range.side,start=range.start*2,end=range.end*2,line=points.slice(start,end+1).map(p=>({...p,pos:add(p.pos,mul(p.right,side*((side>0?p.wr:p.wl)+settings.curbWidth/2)/Math.hypot(p.right[0],p.right[2]))),wr:settings.curbWidth/2,wl:settings.curbWidth/2})),arc=[0];
    for(let i=1;i<line.length;i++)arc.push(arc.at(-1)+Math.hypot(...sub(line[i].pos,line[i-1].pos)));
    for(let i=0;i<line.length;i++){
      const p=line[i],fade=Math.max(0,Math.min(1,arc[i]/6,(arc.at(-1)-arc[i])/6)),rise=side*settings.curbHeight/settings.curbWidth*fade,h=Math.hypot(p.right[0],p.right[2]);
      p.pos[1]+=settings.curbHeight/2*fade;p.bank+=rise;p.right=unit([p.right[0]/h,p.right[1]/h+rise,p.right[2]/h]);
    }
    finishPoints(line,false);
    // Even physical stripes cover the recovered run without restarting a
    // ramp at every missing texture sample.
    let a=0;
    while(a<line.length-1){let b=a+1;const stripe=Math.floor((arc[a]+.0001)/10);while(b<line.length-1&&arc[b]<(stripe+1)*10)b++;const color=stripe%2?4:9;
      for(const [u,v] of adaptiveSegments(line.slice(a,b+1),28,.12,4*Math.PI/180,.014)){
        const part=fittedSlab(line,a+u,a+v,{width:settings.curbWidth,thickness:.12,color,guard:.02});
        part[5]+=.75;
        if(pitParts.some(p=>overlapVertices(part,p).length))continue;
        spans.push({index:push('curbs',part),side,start:start+a+u,end:start+a+v});
      }
      a=b;
    }
    runs.push({side,start,end,arc});
  }
  return {spans,runs};
}

export function addCornerAprons(points,aprons,scale,push){
  const spans=[],patches=[];
  for(const apron of aprons){
    let run=[];
    const flush=()=>{
      if(run.length<2){run=[];return;}
      const line=[];
      for(let i=0;i<run.length-1;i++)for(let index=run[i].index*2;index<run[i+1].index*2;index++){
        const p=points[index],t=(index/2-run[i].index)/(run[i+1].index-run[i].index),inner=3.25,outer=(run[i].outer*(1-t)+run[i+1].outer*t)*scale,width=Math.max(1,outer-inner),d=(sideEdge(p,apron.side)+(inner+outer)/2)*apron.side,h=Math.hypot(p.right[0],p.right[2]);
        line.push({...p,pos:add(p.pos,mul(p.right,d/h)),wr:width/2,wl:width/2,sourceIndex:index});
      }
      const last=run.at(-1),p=points[last.index*2],inner=3.25,outer=last.outer*scale,width=Math.max(1,outer-inner),h=Math.hypot(p.right[0],p.right[2]),d=(sideEdge(p,apron.side)+(inner+outer)/2)*apron.side;
      line.push({...p,pos:add(p.pos,mul(p.right,d/h)),wr:width/2,wl:width/2,sourceIndex:last.index*2});
      for(const [a,b] of adaptiveSegments(line,100,.5,5*Math.PI/180,.1,Infinity,10))spans.push({index:push('runoff',fittedSlab(line,a,b,{thickness:.16,color:apron.color,lift:-.14,guard:.03})),side:apron.side,start:line[a].sourceIndex,end:line[b].sourceIndex,turn:apron.turn});
      run=[];
    };
    for(const record of apron.records){if(record.outer===null)flush();else run.push(record);}flush();
    patches.push({turn:apron.turn,indices:spans.filter(s=>s.turn===apron.turn).map(s=>s.index)});
  }
  return {spans,patches};
}
const sideEdge=(p,side)=>side>0?p.wr:p.wl;
