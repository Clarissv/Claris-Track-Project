import {finishPoints} from '../red-bull-ring/reference.mjs';
import {adaptiveSegments} from '../red-bull-ring/geometry.mjs';
import {fittedSlab} from '../red-bull-ring/road-geometry.mjs';
import {add,mul,sub,unit} from '../red-bull-ring/track-geometry.mjs';
import {overlapVertices} from '../red-bull-ring/surface-audit.mjs';
import {trimKerbAtPit} from '../red-bull-ring/track-tidy.mjs';
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
    for(let i=0;i<line.length;i++){const p=line[i],plane=p.roadPlane;if(!plane)continue;const h=Math.hypot(p.right[0],p.right[2]),r=[p.right[0]/h,p.right[2]/h],rise=side*settings.curbHeight/settings.curbWidth*Math.max(0,Math.min(1,arc[i]/6,(arc.at(-1)-arc[i])/6));p.surfacePlane={id:plane.id+(arc[i]<6||arc.at(-1)-arc[i]<6?i/100000:0),x:p.pos[0],z:p.pos[2],height:p.pos[1],gx:plane.gx+rise*r[0],gz:plane.gz+rise*r[1]};}
    // Even physical stripes cover the recovered run without restarting a
    // ramp at every missing texture sample.
    for(const [u,v] of adaptiveSegments(line,80,.25,6*Math.PI/180,.025)){
      const color=Math.floor((arc[u]+arc[v])/40)%2?4:9,part=fittedSlab(line,u,v,{width:settings.curbWidth,thickness:.12,color,guard:.03});part[5]+=.75;
      if(pitParts.some(p=>overlapVertices(part,p).length)){
        for(const piece of trimKerbAtPit(part,pitParts,settings.pitKerbTrimResolutionStuds??.06,true))spans.push({index:push('curbs',piece),side,start:start+u,end:start+v});
      }else spans.push({index:push('curbs',part),side,start:start+u,end:start+v});
    }
    runs.push({side,start,end,arc});
  }
  return {spans,runs};
}

