import fs from 'node:fs';
import {sha} from './lib/reference.mjs';
import {unit} from './lib/track-geometry.mjs';
import {fitSourceRamps} from './source-ramps.mjs';
import {lowerReference} from './low-height-profile.mjs';
export function sourceElevation(points,reference,{profile,output}={}){
  let elevation=JSON.parse(fs.readFileSync(new URL('source/elevation-reference.json',import.meta.url)));
  if(elevation.sourceSha256!==reference.sourceSha256||elevation.routeSha256!==sha(JSON.stringify(points.slice(0,-1).map(p=>[p.pos[0],p.pos[2]]))))throw Error('GLB elevation reference does not match the cleaned route; run extract-elevation.mjs');
  if(elevation.records.length!==points.length-1)throw Error('Incomplete GLB elevation reference');
  if(profile){elevation=lowerReference(elevation,points,profile);fs.mkdirSync(new URL('source/',output),{recursive:true});fs.writeFileSync(new URL('source/elevation-reference.json',output),JSON.stringify(elevation));}
  for(const r of elevation.records){const p=points[r.index],h=Math.hypot(p.right[0],p.right[2]);p.pos[1]=r.height;p.normal=unit([-r.gx,1,-r.gz]);p.bank=r.bank;p.right=unit([p.right[0]/h,r.bank,p.right[2]/h]);}
  Object.assign(points.at(-1),structuredClone(points[0]),{s:points.at(-1).s});
  const options={length:40,maxGradientChange:.01,maxJoinStep:.006,sharedBranchRanges:[[1115*8,1148*8]]},key=sha(JSON.stringify({reference:elevation,options,solver:sha(fs.readFileSync(new URL('source-ramps.mjs',import.meta.url)))})),cacheUrl=new URL('source/elevation-ramps.json',output??new URL('./',import.meta.url));
  let cache=fs.existsSync(cacheUrl)&&JSON.parse(fs.readFileSync(cacheUrl));
  if(cache?.key===key){for(let j=0;j<cache.meta.knots.length;j++)for(let i=cache.meta.knots[j];i<(cache.meta.knots[j+1]??points.length-1);i++){const p=points[i],plane=cache.planes[j],{gx,gz}=plane,h=Math.hypot(p.right[0],p.right[2]);p.pos[1]=plane.height+gx*(p.pos[0]-plane.x)+gz*(p.pos[2]-plane.z);p.bank=(gx*p.right[0]+gz*p.right[2])/h;p.right=unit([p.right[0]/h,p.bank,p.right[2]/h]);p.normal=unit([-gx,1,-gz]);p.surfacePlane=plane;}
    Object.assign(points.at(-1),structuredClone(points[0]),{s:points.at(-1).s});return cache.meta;}
  const meta=fitSourceRamps(points,options);cache={key,meta,planes:meta.knots.map(i=>points[i].surfacePlane)};fs.writeFileSync(cacheUrl,JSON.stringify(cache));return meta;
}
