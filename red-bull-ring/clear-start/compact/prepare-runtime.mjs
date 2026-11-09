import fs from 'node:fs';
const here=new URL('./',import.meta.url),parent=new URL('../',here);
const adapt=s=>s.replaceAll('RedBullRingClearStart','RedBullRingClearStartCompact')
  .replaceAll('RedBullRingAutoSave','RedBullRingCompactAutoSave')
  .replaceAll('red-bull-ring-clear-start-jakarta-checkpoint','red-bull-ring-clear-start-compact-jakarta-checkpoint')
  .replaceAll('clear%-start/releases/','clear%-start/compact/releases/');
const names=['builder-template.luau','plan-loader.luau','launcher-template.luau','github-loader-template.luau','red-bull-ring-save.lua','red-bull-ring-recovery.lua','red-bull-ring-checkpoint.lua','red-bull-ring-diagnose.lua','viewer-template.html','test-builder.lua','test-http-loader.lua','test-builder.ps1','test-save.lua','test-autosave.lua','test-recovery.lua'];
const plan=JSON.parse(fs.readFileSync(new URL('red-bull-ring-plan.json',here)));
for(const name of names){
  let source=adapt(fs.readFileSync(new URL(name,parent),'utf8'));
  if(name==='plan-loader.luau'||name==='test-builder.lua')source=source.replaceAll('"clear-start"','"clear-start-compact"');
  if(name==='builder-template.luau'){
    source=source.replace('MaxObjects = 9999','MaxObjects = 8998');
    source=source.replace(/local AUTO_GROUPS = [^\r\n]+/,()=>`local AUTO_GROUPS = {${Object.entries(plan.meta.groups).map(([name,indices])=>`{"${name}",${indices[0]+1},${indices.at(-1)+1}}`).join(',')}}`);
    source=source.replace('    local folder = workspace:FindFirstChild("EditableBuilds")\n    assert(folder, "EditableBuilds is missing; enable build tools")','    assert(not (_G.RedBullRingClearStartBuilder and _G.RedBullRingClearStartBuilder.State == "building"), "Pause the original clear-start builder before building compact terrain")\n    local folder = workspace:FindFirstChild("EditableBuilds")\n    assert(folder, "EditableBuilds is missing; enable build tools")');
    source=source.replace('    if CONFIG.SaveObjectLimit ~= nil then','    if not repairing then assert(currentCount + remainingCount < 9000, "Compact build exceeds its 8999 total-object target. Start with the grass plate or load a matching compact prefix.") end\n    if CONFIG.SaveObjectLimit ~= nil then');
    source=source.replace('Your starting point stays inside a clear 400 x 400 stud grass area.','Compact terrain: under 9000 total objects; clear 400 x 400 stud grass starting area.');
  }
  if(name==='red-bull-ring-save.lua'||name==='builder-template.luau'){
    source=source.replace('local builders = {_G.RedBullRingClearStartCompactBuilder,','local builders = {_G.RedBullRingClearStartCompactBuilder, _G.RedBullRingClearStartBuilder,');
  }
  if(name==='viewer-template.html')source=source.replaceAll('Red Bull Ring with a clear starting area','Red Bull Ring with compact terrain');
  if(name==='test-builder.lua')source=source.replace('local api = fresh()',`local originalClearStart = {State="paused",preserved=true}
_G.RedBullRingClearStartBuilder = originalClearStart
local api = fresh()
originalClearStart.State = "building"
assert(not pcall(api.Build) and #calls == 0 and _G.RedBullRingClearStartBuilder == originalClearStart, "Compact must preserve and respect the original clear-start session")
originalClearStart.State = "paused"`);
  if(name==='test-builder.lua')source=source.replace('originalClearStart.State = "paused"\nstandardSentinel.State',`originalClearStart.State = "paused"
placedCountOverride = function() return 8998 end
assert(not pcall(api.Build) and #calls == 0, "Compact must block placement when existing objects would exceed its target")
placedCountOverride = nil
standardSentinel.State`);
  if(name==='test-builder.ps1')source=source.replaceAll('RedBullRingClearStartLuaNative','RedBullRingClearStartCompactLuaNative');
  fs.writeFileSync(new URL(name,here),source);
}
const packageSource=fs.readFileSync(new URL('make-package.mjs',parent),'utf8')
  .replaceAll("'../render.mjs'","'../../render.mjs'")
  .replaceAll('/main/red-bull-ring/clear-start/releases/','/main/red-bull-ring/clear-start/compact/releases/')
  .replaceAll('nonCollidingPartIndices,startDomain','nonCollidingPartIndices,startDomain,compactTerrain');
fs.writeFileSync(new URL('make-package.mjs',here),packageSource);
console.log('Prepared compact builder, separate globals/checkpoints, shared save cooldown, and pinned release packaging.');
