import fs from 'node:fs';
const root=new URL('./',import.meta.url),road=new URL('../red-bull-ring/clear-start/compact/',root),walls=new URL('barriers/',road);
const adapt=s=>s.replaceAll('RedBullRingClearStartBuilder','SpaLegacyClearStartBuilder').replaceAll('RedBullRingBuilder','SpaLegacyBuilder').replaceAll('RedBullRingClearStartCompact','Spa').replaceAll('RedBullRingCompact','Spa').replaceAll('RedBullRingBarriers','SpaBarriers').replaceAll('RedBullRing','Spa').replaceAll('Red Bull Ring','Spa-Francorchamps').replaceAll('RED BULL RING','SPA-FRANCORCHAMPS').replaceAll('red-bull-ring','spa').replaceAll('under 9000','under 9500').replaceAll('8999','9499').replaceAll('8998','9498').replaceAll('< 9000','< 9500');
const crossGuard=`    for _,other in ipairs({_G.RedBullRingBuilder or false,_G.RedBullRingClearStartBuilder or false,_G.RedBullRingClearStartCompactBuilder or false,_G.RedBullRingBarriersBuilder or false,_G.MonzaBuilder or false,_G.MonzaTerrainBuilder or false,_G.SepangBuilder or false,_G.SepangFlatBuilder or false}) do
        assert(not other or other.State~="building", "Pause the other circuit builder before building Spa")
    end
`;
fs.mkdirSync(new URL('barriers/',root),{recursive:true});
for(const [target,source] of [[root,road],[new URL('barriers/',root),walls]]){
  const planName=target===root?'spa-plan.json':'barrier-plan.json',planPath=new URL(planName,target);
  const plan=fs.existsSync(planPath)?JSON.parse(fs.readFileSync(planPath)):null;
  const names=['builder-template.luau','plan-loader.luau','github-loader-template.luau','red-bull-ring-save.lua','red-bull-ring-checkpoint.lua','red-bull-ring-diagnose.lua','red-bull-ring-continue.lua'];
  if(target===root)names.push('red-bull-ring-recovery.lua');else names.push('build-all-template.luau');
  for(const name of names){let s=adapt(fs.readFileSync(new URL(name,source),'utf8'));
    if(name==='builder-template.luau'){
      s=s.replace('    local folder = workspace:FindFirstChild("EditableBuilds")\n    assert(folder, "EditableBuilds is missing; enable build tools")',crossGuard+'    local folder = workspace:FindFirstChild("EditableBuilds")\n    assert(folder, "EditableBuilds is missing; enable build tools")');
      if(plan)s=s.replace(/MaxObjects = \d+/,`MaxObjects = ${target===root?9498:plan.parts.length}`).replace(/local AUTO_GROUPS = [^\r\n]+/,()=>`local AUTO_GROUPS = {${Object.entries(plan.meta.groups).map(([key,ids])=>`{"${key}",${ids[0]+1},${ids.at(-1)+1}}`).join(',')}}`);
    }
    fs.writeFileSync(new URL(name.replaceAll('red-bull-ring','spa'),target),s);
  }
}
console.log('Prepared separate Spa road/barrier sessions, matching checkpoints and automatic handoff.');
