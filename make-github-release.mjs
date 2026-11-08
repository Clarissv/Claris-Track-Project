import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {packageRuntime} from './package-ribbons.mjs';
export function makeRelease(directory) {
  const plan=JSON.parse(fs.readFileSync(path.join(directory,'sepang-plan.json'),'utf8'));
  const {format,partCount,palette,planBounds,sourceSha256,centerlineSha256}=plan.meta;
  const assets={
    'sepang-builder.lua':fs.readFileSync(path.join(directory,'sepang-builder.lua')),
    'runtime-plan.json':Buffer.from(JSON.stringify({meta:{format,partCount,palette,planBounds,sourceSha256,centerlineSha256},parts:plan.parts})),
    'sepang-checkpoint.lua':fs.readFileSync(path.join(directory,'sepang-checkpoint.lua')),
    'sepang-diagnose.lua':fs.readFileSync(path.join(directory,'sepang-diagnose.lua')),
  };
  const hash=crypto.createHash('sha256');
  for(const [name,body] of Object.entries(assets))hash.update(name).update('\0').update(body);
  const version=hash.digest('hex').slice(0,20),release=path.join(directory,'releases',version);
  fs.mkdirSync(release,{recursive:true});
  const files=[];
  for(const [name,body] of Object.entries(assets)) {
    fs.writeFileSync(path.join(release,name),body);
    files.push({path:`releases/${version}/${name}`,bytes:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex')});
  }
  const base=`https://raw.githubusercontent.com/Clarissv/Sepang/main/releases/${version}/`;
  const template=fs.readFileSync(path.join(directory,'github-loader-template.luau'),'utf8');
  if(template.split('__RELEASE_BASE__').length!==2)throw Error('Missing release marker');
  fs.writeFileSync(path.join(directory,'loader.lua'),template.replace('__RELEASE_BASE__',base));
  const manifest={format:'sepang-github-release-v1',version,partCount,footprint:[plan.meta.width,plan.meta.depth],files};
  fs.writeFileSync(path.join(directory,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const directory=path.dirname(fileURLToPath(import.meta.url));
  packageRuntime(directory);
  console.log(JSON.stringify(makeRelease(directory),null,2));
}
