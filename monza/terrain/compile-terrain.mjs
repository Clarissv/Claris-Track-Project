import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildTerrain} from './terrain.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(here,'..');
const original=JSON.parse(fs.readFileSync(path.join(base,'monza-plan.json'))),ground=JSON.parse(fs.readFileSync(path.join(here,'source/ground-reference.json')));
const result=buildTerrain(original,ground);
fs.writeFileSync(path.join(here,'monza-terrain-plan.json'),JSON.stringify(result));
fs.writeFileSync(path.join(here,'generation-report.json'),JSON.stringify(result.meta,null,2));
const baseline={};
for(const name of fs.readdirSync(base,{recursive:true}).filter(name=>!fs.statSync(path.join(base,name)).isDirectory())) {
  if(/^(terrain|save-debug)[\\/]/.test(name))continue;
  // Preserve all original files, including source and existing release files.
  baseline[name.replaceAll('\\','/')]=crypto.createHash('sha256').update(fs.readFileSync(path.join(base,name))).digest('hex');
}
fs.writeFileSync(path.join(here,'source/non-terrain-integrity.json'),JSON.stringify(baseline,null,2)+'\n');
let viewer=fs.readFileSync(path.join(base,'viewer-template.html'),'utf8');
viewer=viewer.replaceAll('Elevated Monza','Monza with terrain').replace('The green floor represents your existing platform.','Broad grass slopes and a tiled foundation are included in this terrain version.').replace('Lowest surfaces clear the green floor; the pit pavement retains its elevation.','Grass is kept below the original driving surfaces; the pit pavement retains its elevation.').replace('const visible=[ground,...PLAN.parts];','const visible=[...PLAN.parts];');
fs.writeFileSync(path.join(here,'viewer-template.html'),viewer);
let renderer=fs.readFileSync(path.join(base,'render-ribbons.mjs'),'utf8').replaceAll("from './", "from '../");
renderer=renderer.replace(/const parts=\[\[.*?\.\.\.plan\.parts\];/, 'const parts=[...plan.parts];');
fs.writeFileSync(path.join(here,'render-terrain.mjs'),renderer);
const {writeArtifacts}=await import('./render-terrain.mjs');
writeArtifacts(here,result);
fs.renameSync(path.join(here,'monza-3d-viewer.html'),path.join(here,'monza-terrain-3d-viewer.html'));
console.log(JSON.stringify({trackParts:original.parts.length,terrainParts:result.meta.terrain.addedParts,totalWithExistingGrass:result.meta.terrain.totalWithExistingGrass,patchSizes:Object.fromEntries([128,256,512].map(size=>[size,result.meta.terrain.patches.filter(p=>p.size===size).length])),clearance:result.meta.terrain.clearanceAudit},null,2));
