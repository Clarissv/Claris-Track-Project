import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),checkout=path.resolve(here,'..'),destination=path.join(checkout,'monza-terrain');
if(!fs.existsSync(path.join(checkout,'.git')))throw Error('The existing publishing checkout is missing');
fs.mkdirSync(destination,{recursive:true});
const files=['README.md','THIRD-PARTY.txt','terrain.mjs','extract-ground.mjs','compile-terrain.mjs','render-terrain.mjs','make-package.mjs','prepare-publish.mjs','test-terrain.mjs','test-builder.lua','test-builder.ps1','test-http-loader.lua','builder-template.luau','plan-loader.luau','monza-terrain-builder.lua','monza-terrain-plan.json','monza-terrain-checkpoint.lua','monza-terrain-diagnose.lua','monza-terrain-run.lua','monza-terrain-resume.lua','loader.lua','release-manifest.json','package-terrain.ps1','viewer-template.html','monza-terrain-3d-viewer.html','generation-report.json','build-3d.png','build-3d-detail.png','build-topdown.png','build-kerb-detail.png','build-pit-entry.png','build-pit-exit.png','build-start-point.png','elevation-profile.svg','source/LICENSE','source/Monza.csv','source/ground-reference.json','source/non-terrain-integrity.json'];
const manifest=JSON.parse(fs.readFileSync(path.join(here,'release-manifest.json')));files.push(...manifest.files.map(f=>f.path));
for(const name of files) {
  const source=path.join(here,name),target=path.join(destination,name);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  if(name.endsWith('.mjs')) {
    let code=fs.readFileSync(source,'utf8').replaceAll('../monza/','../monza/').replaceAll("'../monza'","'../monza'");
    // Inside the publishing checkout, the generator's separate destination is
    // the current monza-terrain folder, rather than a nested publishing tree.
    if(name==='prepare-publish.mjs')code=code.replace("path.resolve(here,'../Sepang Publish')","path.resolve(here,'..')");
    if(name==='test-terrain.mjs')code=code.replace("'../Sepang Publish/monza'","'../monza'");
    fs.writeFileSync(target,code);
  } else if(name==='source/non-terrain-integrity.json') {
    const baseline=JSON.parse(fs.readFileSync(source));
    const published=Object.fromEntries(Object.entries(baseline).filter(([file])=>fs.existsSync(path.join(checkout,'monza',file))));
    fs.writeFileSync(target,JSON.stringify(published,null,2)+'\n');
  } else fs.copyFileSync(source,target);
}
fs.writeFileSync(path.join(destination,'.gitignore'),'monza-terrain-executor.zip\nruntime-tests.txt\n');
console.log(JSON.stringify({directory:destination,trackParts:manifest.partCount-manifest.terrainPartCount,terrainParts:manifest.terrainPartCount,totalWithExistingGrass:manifest.totalWithExistingGrass,release:manifest.version},null,2));
