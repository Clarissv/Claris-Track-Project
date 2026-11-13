import fs from 'node:fs';
import crypto from 'node:crypto';
import {render} from '../red-bull-ring/render.mjs';
const root=new URL('./',import.meta.url),read=(name,dir=root)=>fs.readFileSync(new URL(name,dir),'utf8'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function packageStage(dir,plan,route,extras){
  const builder=read('builder-template.luau',dir).replace('-- GENERATED_DATA',()=>read('plan-loader.luau',dir));
  fs.writeFileSync(new URL('spa-builder.lua',dir),builder);
  const {groups,chains,audit,centerline,...meta}=plan.meta;
  const assets={'spa-builder.lua':Buffer.from(builder),'runtime-plan.json':Buffer.from(JSON.stringify({meta,parts:plan.parts}))};
  for(const name of extras)assets[name]=Buffer.from(read(name,dir));
  const hash=crypto.createHash('sha256');for(const [name,body]of Object.entries(assets))hash.update(name).update('\0').update(body);
  const version=hash.digest('hex').slice(0,20),release=new URL(`releases/${version}/`,dir);fs.mkdirSync(release,{recursive:true});
  const files=[];for(const [name,body]of Object.entries(assets)){const dest=new URL(name,release);if(fs.existsSync(dest)&&sha(fs.readFileSync(dest))!==sha(body))throw Error('Immutable release changed');fs.writeFileSync(dest,body);files.push({path:`releases/${version}/${name}`,bytes:body.length,sha256:sha(body)});}
  const base=`https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/${route}/releases/${version}/`;
  const loader=Buffer.from(read('github-loader-template.luau',dir).replace('__RELEASE_BASE__',base));
  fs.writeFileSync(new URL('loader.lua',dir),loader);fs.writeFileSync(new URL('loader.lua',release),loader);files.push({path:`releases/${version}/loader.lua`,bytes:loader.length,sha256:sha(loader)});
  const manifest={format:'spa-github-release-v1',version,partCount:plan.parts.length,totalWithExistingGrass:plan.parts.length+1,...(plan.meta.requiredBase?{combinedObjects:plan.meta.audit.combinedObjects,requiredBase:plan.meta.requiredBase.version}:{}),files};
  fs.writeFileSync(new URL('release-manifest.json',dir),JSON.stringify(manifest,null,2)+'\n');return {base,manifest,release};
}
const road=JSON.parse(read('spa-plan.json'));
const packaged=packageStage(root,road,'spa',['spa-save.lua','spa-checkpoint.lua','spa-diagnose.lua','spa-continue.lua','spa-recovery.lua']);
fs.writeFileSync(new URL('build-topdown.png',root),render(road,1800,2600,{top:true}));
fs.writeFileSync(new URL('build-3d.png',root),render(road,1600,1100));
fs.writeFileSync(new URL('build-eau-rouge.png',root),render(road,1600,1000,{target:road.centerline[180*8].slice(0,3),span:1000}));
fs.writeFileSync(new URL('build-pit-exit.png',root),render(road,1200,1000,{top:true,target:road.meta.pitPoints.at(-1).pos,span:700}));
console.log(JSON.stringify({version:packaged.manifest.version,parts:road.parts.length}));
