import {finishPoints} from './reference.mjs';
import {adaptiveSegments,boxBasis} from './geometry.mjs';
import {fittedSlab} from './road-geometry.mjs';
import {add,mul,sub,unit} from './track-geometry.mjs';
import {overlapVertices,topHeight,topFootprint,clipPolygon} from './surface-audit.mjs';

export function fitKerbsToLane(roads,parts,points){
  const bounds=q=>[Math.min(...q.map(v=>v[0])),Math.max(...q.map(v=>v[0])),Math.min(...q.map(v=>v[1])),Math.max(...q.map(v=>v[1]))],overlaps=(a,b)=>a[0]<=b[1]&&a[1]>=b[0]&&a[2]<=b[3]&&a[3]>=b[2];
  const index=entries=>{
    const cells=new Map(),size=64;
    for(const entry of entries)for(let x=Math.floor(entry.b[0]/size);x<=Math.floor(entry.b[1]/size);x++)for(let z=Math.floor(entry.b[2]/size);z<=Math.floor(entry.b[3]/size);z++){const key=`${x}:${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(entry);}
    return b=>{const near=new Set();for(let x=Math.floor(b[0]/size);x<=Math.floor(b[1]/size);x++)for(let z=Math.floor(b[2]/size);z<=Math.floor(b[3]/size);z++)for(const entry of cells.get(`${x}:${z}`)??[])if(overlaps(b,entry.b))near.add(entry);return [...near];};
  };
  const roadIndex=index(roads.map(p=>{const polygon=topFootprint(p);return {p,polygon,b:bounds(polygon)};}));
  const lanes=points.slice(0,-1).map((a,i)=>{
    const b=points[i+1],dx=b.pos[0]-a.pos[0],dz=b.pos[2]-a.pos[2],length=Math.hypot(dx,dz),edge=(p,d)=>[p.pos[0]+dz/length*d,p.pos[2]-dx/length*d];
    // Keep the native left/right widths: a symmetric bounding rectangle can
    // include the complete kerb when the two road shoulders differ in width.
    const polygon=[edge(a,-a.wl-.003),edge(a,a.wr+.003),edge(b,b.wr+.003),edge(b,-b.wl-.003)];return {polygon,b:bounds(polygon)};
  }),laneIndex=index(lanes);
  let modified=0,maximumLowering=0;
  const result=parts.map(part=>{
    const p=[...part],polygon=topFootprint(p),a=bounds(polygon),nearRoads=roadIndex(a);let lower=0;
    // Protect the full nominal lane, including its edge. Road rectangles can
    // extend across the entire kerb on inside bends; those spare corners must
    // not pull the raised, coloured body below the asphalt.
    for(const lane of laneIndex(a)){
      const shared=clipPolygon(polygon,lane.polygon);if(!shared.length)continue;
      for(const road of nearRoads)for(const [x,z] of clipPolygon(shared,road.polygon))lower=Math.max(lower,topHeight(p,x,z)-topHeight(road.p,x,z)+.002);
    }
    if(lower>0){p[1]-=lower+.0002;modified++;maximumLowering=Math.max(maximumLowering,lower);}return p;
  });
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
        if(pitParts.some(p=>overlapVertices(part,p).length)){
          if(!settings.pitKerbTrimResolutionStuds)continue;
          for(const piece of trimKerbAtPit(part,pitParts,settings.pitKerbTrimResolutionStuds,settings.pitKerbMerge??false))spans.push({index:push('curbs',piece),side,start:start+a+u,end:start+a+v});
        }else spans.push({index:push('curbs',part),side,start:start+a+u,end:start+a+v});
      }
      a=b;
    }
    runs.push({side,start,end,arc});
  }
  return {spans,runs};
}

// Retain the portions of a stripe outside the pit. Removing an entire
// overlapping stripe leaves a visible kerb gap well beyond the pit opening.
export function trimKerbAtPit(part,pitParts,resolution=.06,merge=false){
  const nearby=pitParts.filter(p=>overlapVertices(part,p).length),pieces=[];
  const split=p=>{
    if(!nearby.some(q=>overlapVertices(p,q).length)){pieces.push(p);return;}
    const axis=p[3]>p[5]?3:5;
    if(p[axis]<=resolution)return;
    const basis=boxBasis(p),direction=axis===3?basis.right:basis.back;
    for(const sign of [-1,1]){
      const piece=[...p];piece[axis]/=2;
      for(let k=0;k<3;k++)piece[k]+=sign*direction[k]*p[axis]/4;
      split(piece);
    }
  };
  split([...part]);
  if(!merge)return pieces;
  // Combine adjacent cells back into maximal rectangular strips. This keeps
  // fine clipping at pit openings without hundreds of spare quadtree cells.
  const basis=boxBasis(part),local=p=>{const d=p.slice(0,3).map((v,k)=>v-part[k]),x=d.reduce((s,v,k)=>s+v*basis.right[k],0),z=d.reduce((s,v,k)=>s+v*basis.back[k],0);return [x-p[3]/2,x+p[3]/2,z-p[5]/2,z+p[5]/2];};
  let rectangles=pieces.map(local),changed=true;
  while(changed){changed=false;for(const axis of [0,2]){const other=2-axis,groups=new Map();for(const r of rectangles){const key=[r[other],r[other+1]].map(v=>v.toFixed(7)).join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}const next=[];
    for(const row of groups.values()){row.sort((a,b)=>a[axis]-b[axis]);let active=[...row[0]];for(const r of row.slice(1)){if(Math.abs(active[axis+1]-r[axis])<1e-7){active[axis+1]=r[axis+1];changed=true;}else{next.push(active);active=[...r];}}next.push(active);}rectangles=next;
  }}
  return rectangles.map(r=>{const p=[...part],x=(r[0]+r[1])/2,z=(r[2]+r[3])/2;for(let k=0;k<3;k++)p[k]+=x*basis.right[k]+z*basis.back[k];p[3]=r[1]-r[0];p[5]=r[3]-r[2];return p;});
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
