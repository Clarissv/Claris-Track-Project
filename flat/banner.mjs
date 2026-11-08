import crypto from 'node:crypto';
import {decodePng,encodePng} from './mesh-geometry.mjs';
import {boxCorners,round} from './geometry.mjs';
import {unit} from './track-geometry.mjs';
export function bannerPixels(bytes,width=320) {
  const image=decodePng(bytes),height=Math.round(width*image.height/image.width),mask=new Uint8Array(width*height);
  const navy=[...image.pixels.subarray(0,3)],colors=[navy,[255,255,255],[130,151,169]];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    let brightness=0;
    for(let sy=0;sy<3;sy++)for(let sx=0;sx<3;sx++){const ix=Math.floor((x+(sx+.5)/3)*image.width/width),iy=Math.floor((y+(sy+.5)/3)*image.height/height),at=(iy*image.width+ix)*4;brightness+=(image.pixels[at]+image.pixels[at+1]+image.pixels[at+2])/3/9;}
    mask[y*width+x]=brightness>=185?1:brightness>=100?2:0;
  }
  const rectangles=[],active=new Map();
  for(let y=0;y<height;y++) {
    const next=new Map();
    for(let x=0;x<width;) {
      const color=mask[y*width+x];if(!color){x++;continue;}
      const start=x;while(x<width&&mask[y*width+x]===color)x++;
      const key=[start,x-start,color].join(':'),prior=active.get(key);
      if(prior){prior.h++;next.set(key,prior);}else{const rect={x:start,y,w:x-start,h:1,color};rectangles.push(rect);next.set(key,rect);}
    }
    active.clear();for(const [key,r] of next)active.set(key,r);
  }
  const pixels=Buffer.alloc(width*height*4);for(let i=0;i<mask.length;i++)pixels.set([...colors[mask[i]],255],i*4);
  return {width,height,colors,rectangles,preview:encodePng(width,height,pixels),sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
export function makeBanner(bytes,placement,existing,palette,groundClearance=.25) {
  const art=bannerPixels(bytes),colorBase=palette.length;
  palette.push(...art.colors.map((rgb,i)=>({name:['Bluenight navy','Bluenight white','Bluenight logo grey'][i],rgb,material:'SmoothPlastic'})));
  const {width,height}=placement,corner=placement.corner;
  const facing=unit([placement.facingTarget[0]-corner[0],0,placement.facingTarget[1]-corner[1]]),right=[facing[2],0,-facing[0]],up=[0,1,0];
  if(placement.placementZone!=='inside-corner'||!Number.isFinite(placement.clearanceFromTrack)||placement.clearanceFromTrack<12)throw Error('Invalid inside-corner banner placement');
  const footprints=existing.map(p=>{
    const corners=boxCorners(p).map(v=>[v[0],v[2]]),axes=[[p[7],p[9]],[-p[9],p[7]]].map(v=>{const n=Math.hypot(...v);return v.map(x=>x/n);});
    return {corners,axes,min:[0,1].map(k=>Math.min(...corners.map(q=>q[k]))),max:[0,1].map(k=>Math.max(...corners.map(q=>q[k])))};
  });
  const clear=position=>{
    const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,z])=>[position[0]+right[0]*x*width/2+facing[0]*z*height/2,position[2]+right[2]*x*width/2+facing[2]*z*height/2]);
    const min=[0,1].map(k=>Math.min(...corners.map(q=>q[k]))),max=[0,1].map(k=>Math.max(...corners.map(q=>q[k]))),gap=placement.clearanceFromTrack;
    return footprints.every(p=>{
      if([0,1].some(k=>p.min[k]-max[k]>=gap||min[k]-p.max[k]>=gap))return true;
      return [[right[0],right[2]],[facing[0],facing[2]],...p.axes].some(axis=>{
        const a=corners.map(q=>q[0]*axis[0]+q[1]*axis[1]),b=p.corners.map(q=>q[0]*axis[0]+q[1]*axis[1]);
        return Math.min(...a)-Math.max(...b)>=gap||Math.min(...b)-Math.max(...a)>=gap;
      });
    });
  };
  const backingTop=-groundClearance+.015,letteringTop=backingTop+.025;
  let center,inwardOffset;
  // Move toward the corner's interior until the full rectangle clears the
  // actual generated road, kerbs and runoff, including their merged slabs.
  for(let offset=0;offset<=400;offset+=4){const q=[corner[0]+facing[0]*offset,backingTop,corner[1]+facing[2]*offset];if(clear(q)){center=q;inwardOffset=offset;break;}}
  if(!center)throw Error('The banner does not fit on the inside-corner grass with the requested clearance');
  // Image top points away from the grandstand. From that side the lettering
  // reads upright on the grass, with image rows running along the ground.
  const box=(cx,cy,w,h,thickness,top,color)=>[center[0]+right[0]*cx-facing[0]*cy,top-thickness/2,center[2]+right[2]*cx-facing[2]*cy,w,thickness,h,color,...right,...up].map(round);
  const parts=[box(0,0,width,height,.06,backingTop,colorBase+1)];
  for(const r of art.rectangles)parts.push(box((r.x+r.w/2)/art.width*width-width/2,height/2-(r.y+r.h/2)/art.height*height,r.w/art.width*width+.003,r.h/art.height*height+.003,.025,letteringTop,colorBase+r.color+1));
  return {parts,preview:art.preview,meta:{...placement,orientation:'ground',position:center.map(round),inwardOffsetStuds:inwardOffset,front:up,imageTop:facing.map(v=>round(-v)),partCount:parts.length,backingHeightAboveGrass:.015,letteringHeightAboveGrass:.04,imageFile:'Bluenight.png',imageSha256:art.sourceSha256,pixelResolution:[art.width,art.height],approximation:'Three-colour bitmap sampled from the supplied image and merged into horizontal rectangular plain Parts on the inside-corner grass. No uploaded image or decal is required.'}};
}
