import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {boxBasis} from '../geometry.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function inspectPlan(plan){
  const invalid=[],visual=new Set(plan.meta.nonCollidingPartIndices??[]),roles=new Map();
  for(const role of plan.meta.catalogRoles??[])for(const i of role.partIndices)roles.set(i,role.name);
  for(const [i,p] of plan.parts.entries()){
    const issues=[];
    if(p.length!==13||!p.every(Number.isFinite))issues.push('non-finite or malformed geometry');
    if(p.slice(3,6).some(n=>n<.001||n>2048))issues.push('size outside client contract');
    if(!plan.meta.palette[p[6]-1])issues.push('unknown palette');
    const {right,up}=boxBasis(p),dot=right.reduce((sum,n,k)=>sum+n*up[k],0);
    if(Math.abs(Math.hypot(...right)-1)>.00002||Math.abs(Math.hypot(...up)-1)>.00002||Math.abs(dot)>.00002||up[1]<=0)issues.push('invalid rotation basis');
    if(issues.length)invalid.push({part:i+1,issues});
  }
  const groups=Object.fromEntries(Object.entries(plan.meta.groups).map(([group,ids])=>{
    const parts=ids.map(i=>plan.parts[i]);
    return [group,{parts:ids.length,firstPart:Math.min(...ids)+1,lastPart:Math.max(...ids)+1,
      catalogs:[...new Set(ids.map(i=>roles.get(i)??'selected plain block'))],
      styles:[...new Set(parts.map(p=>p[6]))].map(i=>plan.meta.palette[i-1]),
      sizeRanges:[3,4,5].map(k=>[Math.min(...parts.map(p=>p[k])),Math.max(...parts.map(p=>p[k]))]),
      minUpY:Math.min(...parts.map(p=>p[11])),nonColliding:ids.filter(i=>visual.has(i)).length,
      geometryJsonBytes:Buffer.byteLength(JSON.stringify(parts))}];
  }));
  return {parts:plan.parts.length,totalWithOneGrass:plan.parts.length+1,planPartsSha256:sha(JSON.stringify(plan.parts)),
    geometryJsonBytes:Buffer.byteLength(JSON.stringify(plan.parts)),invalid,groups};
}
export function comparePlans({projectRoot}={}){
  const base=projectRoot??root,rbrFolder=projectRoot?'red-bull-ring':'Red Bull Ring',monzaFolder=projectRoot?'monza':'Monza';
  const load=name=>JSON.parse(fs.readFileSync(path.join(base,name))),rbr=load(`${rbrFolder}/red-bull-ring-plan.json`),monza=load(`${monzaFolder}/monza-plan.json`);
  const runtime=name=>fs.readFileSync(path.join(base,name),'utf8'),a=runtime(`${rbrFolder}/builder-template.luau`),b=runtime(`${monzaFolder}/builder-template.luau`);
  const requestCode=s=>s.slice(s.indexOf('local function geometry('),s.indexOf('local function validate('));
  const placementCode=s=>s.match(/endpoint:FireServer\([^\n]+/)?.[0];
  const report={format:'circuit-save-comparison-v1',generatedFrom:'Current local numeric plans and builder source; no live server state.',
    byteCountNote:'geometryJsonBytes measures our compact numeric plan arrays. The server save schema, encoding, compression and datastore key arrangement are unknown; these are not server save payload bytes.',
    knownMonzaEvidence:{successfulTrackPrefix:9519,successfulObjectsWithGrass:9520,failedCompletedObjects:10048,pitRoadPartsInSuccessfulPrefix:13},
    sharedRuntime:{geometryAndAppearanceRequestsIdentical:requestCode(a)===requestCode(b),placementCallIdentical:placementCode(a)!==undefined&&placementCode(a)===placementCode(b)},
    redBullRing:inspectPlan(rbr),monza:inspectPlan(monza)};
  fs.writeFileSync(path.join(here,'plan-comparison.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const flag=process.argv.indexOf('--project-root');if(flag>=0&&!process.argv[flag+1])throw Error('--project-root requires the checkout path');
  const report=comparePlans({projectRoot:flag>=0?path.resolve(process.argv[flag+1]):undefined});console.log(JSON.stringify({runtime:report.sharedRuntime,...Object.fromEntries(['redBullRing','monza'].map(k=>[k,{parts:report[k].parts,invalid:report[k].invalid,pit:report[k].groups.pitLane,pitPaint:report[k].groups.pitMarkings,geometryJsonBytes:report[k].geometryJsonBytes}]))},null,2));
}
