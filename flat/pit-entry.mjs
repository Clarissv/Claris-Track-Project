import {makeSlab,boxBasis,adaptiveSegments,round} from './geometry.mjs';
import {add,sub,mul,unit,dot} from './track-geometry.mjs';
const smooth=line=>line.map((p,i)=>i===0||i===line.length-1?p:[0,1].map(k=>(line[i-1][k]+2*p[k]+line[i+1][k])/4));
function cubic(a,b,ta,tb) {
  const length=Math.hypot(...sub(b,a)),handle=length*.38,result=[];
  const c=add(a,mul(ta,handle)),d=sub(b,mul(tb,handle));
  for(let i=0;i<=Math.ceil(length);i++){const t=i/Math.ceil(length);result.push([0,1,2].map(k=>(1-t)**3*a[k]+3*(1-t)**2*t*c[k]+3*(1-t)*t*t*d[k]+t**3*b[k]));}
  return result;
}
export function replacePitEntry(reference,trace,settings,layout) {
  if(trace.format!=='sepang-pit-entry-trace-v1'||trace.sourceSha256!==reference.meta.sourceSha256||trace.samples?.length<100)throw Error('Invalid pit-entry model trace');
  if(layout?.format!=='sepang-flat-pit-layout-v1'||layout.anchor!=='pit-straight-start'||layout.removeOldApron!==true||layout.entrance?.length!==3||layout.straightStart?.length!==3||![...layout.entrance,...layout.straightStart].every(Number.isFinite)||!Number.isFinite(layout.transitionStartDistanceX)||layout.transitionStartDistanceX<120)throw Error('Invalid confirmed pit layout');
  const width=reference.meta.pitLane.widthStuds,old=reference.auxiliary;
  const retainedStart=old.pitLane.reduce((best,p,i)=>Math.hypot(p[0]-layout.straightStart[0],p[2]-layout.straightStart[2])<Math.hypot(old.pitLane[best][0]-layout.straightStart[0],old.pitLane[best][2]-layout.straightStart[2])?i:best,0);
  const next=old.pitLane[retainedStart],oldAxis=boxBasis(next).back,axis=unit([oldAxis[0],0,oldAxis[2]]),join=[next[0],0,next[2]];
  if(Math.hypot(...sub(join,layout.straightStart))>.001)throw Error('Confirmed pit-straight start differs from the frozen lane');
  // The blue marker was at the original slab centre. Trim its first half so
  // the retained straight starts exactly at that point, rather than before it.
  const trimmed=[...next];trimmed[0]=round(next[0]+axis[0]*next[5]/4);trimmed[2]=round(next[2]+axis[2]*next[5]/4);trimmed[5]=round(next[5]/2);
  const retained=[trimmed,...old.pitLane.slice(retainedStart+1)];
  if(retained.length<100)throw Error('Pit-entry replacement would remove too much of the retained pit lane');
  const nearest=reference.centerline.slice(0,-1).reduce((best,p,i,all)=>Math.hypot(p[0]-layout.entrance[0],p[2]-layout.entrance[2])<Math.hypot(all[best][0]-layout.entrance[0],all[best][2]-layout.entrance[2])?i:best,0);
  const main=reference.centerline,first=[main[nearest][0],0,main[nearest][2]],tangent=unit([main[nearest+1][0]-main[nearest-1][0],0,main[nearest+1][2]-main[nearest-1][2]]);
  if(Math.hypot(...sub(first,layout.entrance))>.001)throw Error('Confirmed entrance differs from the frozen circuit');
  let model=trace.samples;for(let pass=0;pass<4;pass++)model=smooth(model);
  const firstSample=10,lastSample=model.findLastIndex(p=>p[0]<join[0]-layout.transitionStartDistanceX),source=model.slice(firstSample,lastSample+1).map(p=>[p[0],0,p[1]]);
  const start=cubic(first,source[0],tangent,unit(sub(source[1],source[0]))),end=cubic(source.at(-1),join,unit(sub(source.at(-1),source.at(-2))),unit(axis));
  const path=[...start.slice(0,-1),...source,...end.slice(1)],line=[];let distance=0;
  for(let i=0;i<path.length;i++) {
    if(i)distance+=Math.hypot(...sub(path[i],path[i-1]));
    const along=unit(sub(path[Math.min(i+1,path.length-1)],path[Math.max(0,i-1)]));
    line.push({pos:path[i],s:distance,wr:width/2,wl:width/2,normal:[0,1,0],right:[along[2],0,-along[0]]});
  }
  const parts=adaptiveSegments(line,32,.04,Math.PI/180).map(([a,b])=>makeSlab(line[a],line[b],width,0,settings.roadThickness,1,0,.04));
  const markings=[];
  for(const side of [-1,1]) {
    const edge=line.map(p=>({...p,pos:add(p.pos,mul(p.right,side*(width/2-.5))),wr:.18,wl:.18}));
    for(const [a,b] of adaptiveSegments(edge,64,.08,3*Math.PI/180)) {
      const slab=makeSlab(edge[a],edge[b],.36,0,.04,4,settings.paintHeight,.04),basis=boxBasis(slab);
      for(let i=a;i<=b;i++)slab[5]=Math.max(slab[5],2*Math.abs(dot(sub(edge[i].pos,slab.slice(0,3)),basis.back))+.02);
      slab[5]=round(slab[5]);markings.push(slab);
    }
  }
  const clip=(p,margin=0)=>{
    const basis=boxBasis(p),along=unit([basis.back[0],0,basis.back[2]]),offset=dot(sub([p[0],0,p[2]],join),axis)-margin,half=p[5]/2,alignment=dot(along,axis);
    const radius=half*Math.abs(alignment)+p[3]/2*Math.abs(dot(basis.right,axis));
    if(offset+radius<=0)return [];
    if(offset-radius>=0)return [[...p]];
    if(alignment<.98)throw Error('Unexpected pit accessory heading at the new cut');
    const firstAlong=-offset/alignment,length=half-firstAlong,centerShift=(firstAlong+half)/2,q=[...p];
    q[0]=round(q[0]+along[0]*centerShift);q[2]=round(q[2]+along[2]*centerShift);q[5]=round(length);return [q];
  };
  const auxiliary={...old,pitLane:[...parts,...retained],pitMarkings:[...markings,...old.pitMarkings.flatMap(p=>clip(p))],pitWall:old.pitWall.flatMap(p=>clip(p,12))};
  return {auxiliary,line,parts,meta:{sourceFile:'source/sepang-pit-entry.json',layoutFile:'source/pit-layout.json',sourceSha256:trace.sourceSha256,modelMaterial:trace.material,method:'Continue from the confirmed middle-of-corner point into the model outer curve; shorten the approach and blend into the retained pit straight at the confirmed former-apron position.',widthStuds:width,entryLengthStuds:distance,entryParts:parts.length,retainedPitLaneParts:retained.length,retainedStartOriginalIndex:retainedStart,retainedMinimumX:join[0],start:first.map(round),join:join.map(round),startTangent:tangent.map(round),joinTangent:axis.map(round),route:line.map(p=>p.pos.map(round)),removedOldLaneParts:old.pitLane.length-retained.length,removedOldWallParts:old.pitWall.length-auxiliary.pitWall.length,removedOldApron:true}};
}
