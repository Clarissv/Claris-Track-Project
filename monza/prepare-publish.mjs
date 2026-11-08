import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packageRuntime} from './package-ribbons.mjs';
import {makeRelease} from './make-github-release.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),checkout=path.resolve(here,'../Sepang Publish'),destination=path.join(checkout,'monza');
if(!fs.existsSync(path.join(checkout,'.git')))throw Error('Existing Sepang publishing checkout is missing');
packageRuntime(here);const manifest=makeRelease(here);
fs.mkdirSync(destination,{recursive:true});
for(const name of ['smooth-surface.mjs','surface-audit.mjs','analyze-build.mjs','placement-and-grass-report.json','ISSUES.md'])fs.copyFileSync(path.join(here,name),path.join(destination,name));
for(const name of ['README.md','THIRD-PARTY.txt','.gitignore','.gitattributes','package.json','model.mjs','reference.mjs','extract-surfaces.mjs','prepare-textures.ps1','compile-monza.mjs','prepare-publish.mjs','builder-template.luau','plan-loader.luau','launcher-template.luau','monza-builder.lua','monza-plan.json','monza-checkpoint.lua','monza-diagnose.lua','monza-resume.lua','monza-run.lua','geometry.mjs','mesh-geometry.mjs','track-geometry.mjs','tidy-runoff.mjs','render-ribbons.mjs','viewer-template.html','monza-3d-viewer.html','build-3d.png','build-3d-detail.png','build-topdown.png','build-kerb-detail.png','build-start-point.png','elevation-profile.svg','generation-report.json','package-ribbons.mjs','package-ribbons.ps1','github-loader-template.luau','make-github-release.mjs','loader.lua','release-manifest.json','test-monza.mjs','test-builder.lua','test-builder.ps1','test-http-loader.lua'])fs.copyFileSync(path.join(here,name),path.join(destination,name));
fs.mkdirSync(path.join(destination,'source'),{recursive:true});
for(const name of ['Monza.csv','Monza-raceline.csv','LICENSE','source-info.json','README.md','monza-reference.json','monza-surfaces.json'])fs.copyFileSync(path.join(here,'source',name),path.join(destination,'source',name));
for(const name of ['Monza-raceline.png','Monza-curvature.png','racetrack-database-README.md'])fs.copyFileSync(path.join(here,'source',name),path.join(destination,'source',name));
fs.copyFileSync(path.join(here,'source/jakarta-target.json'),path.join(destination,'source/jakarta-target.json'));
for(const name of ['build-pit-entry.png','build-pit-exit.png'])fs.copyFileSync(path.join(here,name),path.join(destination,name));
for(const file of manifest.files){fs.mkdirSync(path.dirname(path.join(destination,file.path)),{recursive:true});fs.copyFileSync(path.join(here,file.path),path.join(destination,file.path));}
console.log(JSON.stringify({directory:destination,parts:manifest.partCount,release:manifest.version,entry:'https://raw.githubusercontent.com/Clarissv/Sepang/main/monza/loader.lua'},null,2));
