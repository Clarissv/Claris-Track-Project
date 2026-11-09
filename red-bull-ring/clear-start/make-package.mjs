import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {writeArtifacts} from '../render.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const read=name=>fs.readFileSync(path.join(here,name),'utf8');
const plan=JSON.parse(read('red-bull-ring-plan.json'));
const template=read('builder-template.luau');
if(template.split('-- GENERATED_DATA').length!==2)throw Error('Missing runtime marker');
fs.writeFileSync(path.join(here,'red-bull-ring-builder.lua'),template.replace('-- GENERATED_DATA',()=>read('plan-loader.luau')));
fs.copyFileSync(path.join(here,'launcher-template.luau'),path.join(here,'red-bull-ring-run.lua'));
const {format,variant,partCount,palette,planBounds,sourceSha256,centerlineSha256,placementAnchor,catalogRoles,gameTarget,nonCollidingPartIndices,startDomain}=plan.meta;
const assets={
  'red-bull-ring-builder.lua':Buffer.from(read('red-bull-ring-builder.lua')),
  'runtime-plan.json':Buffer.from(JSON.stringify({meta:{format,variant,partCount,palette,planBounds,sourceSha256,centerlineSha256,placementAnchor,catalogRoles,gameTarget,nonCollidingPartIndices,startDomain},parts:plan.parts})),
  'red-bull-ring-save.lua':Buffer.from(read('red-bull-ring-save.lua')),
  'red-bull-ring-checkpoint.lua':Buffer.from(read('red-bull-ring-checkpoint.lua')),
  'red-bull-ring-diagnose.lua':Buffer.from(read('red-bull-ring-diagnose.lua')),
};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const hash=crypto.createHash('sha256');for(const [name,body] of Object.entries(assets))hash.update(name).update('\0').update(body);
const version=hash.digest('hex').slice(0,20),release=path.join(here,'releases',version);
fs.mkdirSync(release,{recursive:true});const files=[];
for(const [name,body] of Object.entries(assets)){fs.writeFileSync(path.join(release,name),body);files.push({path:`releases/${version}/${name}`,bytes:body.length,sha256:digest(body)});}
const marker=read('github-loader-template.luau');if(marker.split('__RELEASE_BASE__').length!==2)throw Error('Missing release marker');
const loader=Buffer.from(marker.replace('__RELEASE_BASE__',`https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/releases/${version}/`));
fs.writeFileSync(path.join(here,'loader.lua'),loader);fs.writeFileSync(path.join(release,'loader.lua'),loader);
files.push({path:`releases/${version}/loader.lua`,bytes:loader.length,sha256:digest(loader)});
fs.writeFileSync(path.join(here,'release-manifest.json'),JSON.stringify({format:'red-bull-ring-github-release-v1',version,partCount,totalWithExistingGrass:partCount+1,files},null,2)+'\n');
writeArtifacts(here,plan);
const {render}=await import('../render.mjs');
const a=plan.meta.placementAnchor.position,grass=[a[0],-.05,a[2],400,.1,400,5,1,0,0,0,1,0];
fs.writeFileSync(path.join(here,'build-domain.png'),render({...plan,parts:[...plan.parts,grass]},1300,900,{target:[a[0],10,a[2]],span:1100}));
console.log(JSON.stringify({version,partCount,totalWithExistingGrass:partCount+1},null,2));
