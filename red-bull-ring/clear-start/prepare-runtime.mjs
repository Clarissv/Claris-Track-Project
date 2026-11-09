import fs from 'node:fs';
const here=new URL('./',import.meta.url),parent=new URL('../',here);
const adapt=s=>s.replaceAll('RedBullRing','RedBullRingClearStart').replaceAll('red-bull-ring-jakarta-checkpoint','red-bull-ring-clear-start-jakarta-checkpoint');
for(const name of ['builder-template.luau','plan-loader.luau','launcher-template.luau','github-loader-template.luau','red-bull-ring-checkpoint.lua','red-bull-ring-diagnose.lua','test-builder.lua','test-http-loader.lua','test-builder.ps1','viewer-template.html']){
  let source=adapt(fs.readFileSync(new URL(name,parent),'utf8'));
  if(name==='builder-template.luau'){
    source=source.replace('Placed = {}, SentCount = 0','ExpectedServerCount = restoredCheckpoint and restoredCheckpoint.expectedServerCount or nil, Placed = {}, SentCount = 0');
    const helper=fs.readFileSync(new URL('red-bull-ring-save.lua',here),'utf8')
      .replace('return saveSlot(...)','return saveSlot(slot)')
      .replaceAll('api.State ~= "building"','(api.State ~= "building" or api == _savingBuilder)')
      .replaceAll('-- SAVE_CANCEL_CHECK','if _savingBuilder and paused then report.status="cancelled";return end');
    const plan=JSON.parse(fs.readFileSync(new URL('red-bull-ring-plan.json',here),'utf8'));
    const groups=Object.entries(plan.meta.groups).map(([name,indices])=>[name,indices[0]+1,indices.at(-1)+1]).sort((a,b)=>a[1]-b[1]);
    let autosave=fs.readFileSync(new URL('autosave-template.luau',here),'utf8')
      .replace('-- AUTO_SAVE_HELPER',()=>`local function requestSlotSave(slot,internal)\nlocal _savingBuilder=internal and api or nil\n${helper}\nend\nfunction api.Save(slot)\nassert(not busy,"Pause the builder and wait for its current placement or save")\nreturn requestSlotSave(slot,false)\nend`)
      .replace('-- AUTO_GROUP_RANGES',()=>'{'+groups.map(g=>'{'+JSON.stringify(g[0])+','+g[1]+','+g[2]+'}').join(',')+'}');
    source=source.replace('function api.Build()',()=>`${autosave}\nfunction api.Build()\n    assert(not (_G.RedBullRingSlotSave and _G.RedBullRingSlotSave.busy), "Wait for the current slot save before building")\n    assert(not (api.AutoSave and api.AutoSave.firstFailure), "Autosave stopped at a failed or unknown save. Inspect AutoSaveReport before explicitly disabling or re-arming it")`);
    source=source.replace('api.ExpectedServerCount = currentCount','api.ExpectedServerCount = currentCount\n    if api.AutoSave then api.AutoSave.nextObjectCount = api.AutoSave.nextObjectCount or nextSaveCount(api.AutoSave,currentCount) end');
    source=source.replace('    if api.NextIndex > #PLAN then','    if api.NextIndex > #PLAN and not (api.AutoSave and (not api.AutoSave.lastSuccess or api.AutoSave.lastSuccess.confirmedPlanParts < #PLAN)) then');
    source=source.replace('        while api.NextIndex <= #PLAN and not paused do','        autosaveCheckpoint()\n        while api.NextIndex <= #PLAN and not paused do');
    source=source.replace('            if index == 1 or index % 25 == 0 then','            autosaveCheckpoint()\n            if not paused and (index == 1 or index % 25 == 0) then');
    source=source.replace('    api.Phase = api.State\n    if not ok then error(reason, 0) end','    if ok and api.AutoSave and api.AutoSave.firstFailure then api.State = "save_" .. api.AutoSave.firstFailure.status end\n    if ok and api.AutoSave and api.AutoSave.status == "cancelled" then api.State = "paused" end\n    api.Phase = api.State\n    if not ok then error(reason, 0) end\n    if api.AutoSave and api.AutoSave.firstFailure then status(api.AutoSave.stopMessage); return api.AutoSave end');
    source=source.replace('"Complete: %d track parts; %d server objects verified. Save through the game\'s build-slot UI.", #PLAN, api.ServerCount','"Complete: %d track parts; %d server objects verified. %s", #PLAN, api.ServerCount, api.AutoSave and "Autosave confirmed." or "Save through the game\'s build-slot UI."');
    source=source.replaceAll('"pit-entry"','"clear-area"').replace('Your standing point maps to the pit-straight start. "center": legacy centre placement.','Your standing point maps to the empty grass area beside the pit.');
    source=source.replace('StartAt must be pit-entry or center','StartAt must be clear-area');
    source=source.replace('CONFIG.StartAt == "clear-area" or CONFIG.StartAt == "center"','CONFIG.StartAt == "clear-area"');
    source=source.replace('Lowest surfaces clear the grass; elevation and low kerbs are retained.','Your starting point stays inside a clear 400 x 400 stud grass area.');
    source=source.replace('local folder = workspace:FindFirstChild("EditableBuilds")\n    assert(folder, "EditableBuilds is missing; enable build tools")', 'assert(not (_G.RedBullRingBuilder and _G.RedBullRingBuilder.State == "building"), "Pause the standard Red Bull Ring builder before building this version")\n    local folder = workspace:FindFirstChild("EditableBuilds")\n    assert(folder, "EditableBuilds is missing; enable build tools")');
  }
  if(name==='test-builder.lua'){
    source=source.replace('StartAt="pit-entry"','StartAt="clear-area"').replace('StartAt = "pit-entry"','StartAt = "clear-area"');
    source=source.replace('assert(api.GetTarget(1).origin.X == 0 and api.GetTarget(1).origin.Z == 0, "Legacy centre placement must remain available")','assert(not pcall(function() return api.GetTarget(1) end), "Clear-start placement must reject centre mode")');
    source=source.replace('Pit-entry anchor must land','Clear-area anchor must land');
    source=source.replace('local api = fresh()',`local standardSentinel = {State="paused",preserved=true}
_G.RedBullRingBuilder = standardSentinel
local api = fresh()
standardSentinel.State = "building"
assert(not pcall(api.Build) and #calls == 0 and _G.RedBullRingBuilder == standardSentinel, "The clear-start builder must preserve and respect the standard builder")
standardSentinel.State = "paused"`);
    source=source.replace('fixtureDocument.meta.placementAnchor = nil\napi = fresh()',`fixtureDocument.meta.variant = "clear-start"
fixtureDocument.meta.placementAnchor = {name="clear-area",position={100,0,-40}}
fixtureDocument.meta.startDomain = {halfSize=200,center={100,-40}}
api = fresh()
fixtureDocument.meta.startDomain.center[1] = 101
assert(not pcall(loadBuilder) and _G.RedBullRingClearStartBuilder == api, "A mismatched domain must fail before replacing the current session")
fixtureDocument.meta.startDomain = nil
assert(not pcall(loadBuilder) and _G.RedBullRingClearStartBuilder == api, "Missing clear-start metadata must fail before replacing the current session")
fixtureDocument.meta.variant = nil
fixtureDocument.meta.placementAnchor = nil
api = fresh()`);
  }
  if(name==='test-http-loader.lua'){
    source=source.replace('/main/red%-bull%-ring/releases/','/main/red%-bull%-ring/clear%-start/releases/');
    source=source.replace('if url:match("/runtime%-plan%.json$")', 'if url:match("/red%-bull%-ring%-recovery%.lua$") then return string.dump(recoveryHelper) end\n    if url:match("/red%-bull%-ring%-save%.lua$") then return string.dump(saveSlotHelper) end\n    if url:match("/runtime%-plan%.json$")');
    source+=fs.readFileSync(new URL('test-save-loader.lua',here),'utf8');
    source+=fs.readFileSync(new URL('test-autosave-loader.lua',here),'utf8');
    source+=fs.readFileSync(new URL('test-recovery-loader.lua',here),'utf8');
  }
  if(name==='github-loader-template.luau'){
    source=source.replace('local mode = ...','local mode,slot = ...\nif mode == "autosave" then\n    slot=tonumber(slot)\n    assert(slot and slot>=1 and slot<=4 and slot%1==0,"Choose an autosave slot from 1 to 4")\nend');
    source=source.replace('assert(mode == nil or mode == "build" or mode == "resume" or mode == "checkpoint" or mode == "diagnose", "Red Bull Ring: expected build, resume, checkpoint or diagnose")',`local isSlot = type(mode) == "number" or type(mode) == "string" and mode:match("^[1-4]$")
if isSlot then mode = tonumber(mode); assert(mode and mode >= 1 and mode <= 4 and mode % 1 == 0, "Choose a save slot from 1 to 4") end
assert(isSlot or mode == nil or mode == "build" or mode == "resume" or mode == "checkpoint" or mode == "diagnose" or mode == "autosave" or mode == "recovery", "Red Bull Ring: expected build, resume, checkpoint, recovery, diagnose, autosave or a save slot from 1 to 4")
if mode == "recovery" then slot=tonumber(slot);assert(slot and slot>=1 and slot%1==0,"Choose the saved track-part count, excluding grass") end`);
    source=source.replace('if mode == "diagnose" then', 'if isSlot then return compile("red-bull-ring-save.lua")(mode) end\nif mode == "recovery" then return compile("red-bull-ring-recovery.lua")(slot,download("runtime-plan.json"),CHECKPOINT) end\nif mode == "diagnose" then');
    source=source.replace('return run(nil, plan, mode == "resume" and "resume" or nil, CHECKPOINT)','local api=run(nil, plan, mode == "resume" and "resume" or nil, CHECKPOINT)\nif mode == "autosave" then api.EnableAutoSave(slot) end\nreturn api');
  }
  if(name==='test-builder.ps1')source=source.replace('    if ($HttpLoader) {',`    $saveTests = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-save.lua')).Replace('-- SAVE_HELPER_SOURCE', [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'red-bull-ring-save.lua')))
    $fixture = $fixture.Replace('-- HTTP_LOADER_TESTS', $saveTests + "\n-- HTTP_LOADER_TESTS")
    $autoTests = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-autosave.lua'))
    $fixture = $fixture.Replace('-- HTTP_LOADER_TESTS', $autoTests + "\n-- HTTP_LOADER_TESTS")
    $recoveryTests = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-recovery.lua')).Replace('-- RECOVERY_HELPER_SOURCE', [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'red-bull-ring-recovery.lua')))
    $fixture = $fixture.Replace('-- HTTP_LOADER_TESTS', $recoveryTests + "\n-- HTTP_LOADER_TESTS")
    if ($HttpLoader) {`);
  if(name==='plan-loader.luau'){
    source=source.replace('    restoredCheckpoint = saved','    if saved.expectedServerCount ~= nil then assert(finite(saved.expectedServerCount) and saved.expectedServerCount % 1 == 0 and saved.expectedServerCount == saved.nextIndex, "Red Bull Ring: invalid recovery prefix count") end\n    restoredCheckpoint = saved');
    source=source.replace('local PALETTE = {}',`if meta.variant == "clear-start" then
    local domain = meta.startDomain
    assert(type(domain) == "table" and domain.halfSize == 200 and type(domain.center) == "table" and #domain.center == 2, "Red Bull Ring: missing clear starting area")
    assert(anchor and anchor.name == "clear-area" and anchor.position[1] == domain.center[1] and anchor.position[3] == domain.center[2], "Red Bull Ring: clear area and standing anchor differ")
end
local PALETTE = {}`);
  }
  if(name==='viewer-template.html')source=source.replaceAll('Red Bull Ring with terrain','Red Bull Ring with a clear starting area').replace('The red marker shows the pit standing position. Grass is kept below the original driving surfaces; the pit pavement retains its elevation.','The red marker is the centre of the empty 400 × 400-stud starting area beside the pit. The opening passes through terrain and foundation; your existing grass plate is the floor.');
  fs.writeFileSync(new URL(name,here),source);
}
let pack=fs.readFileSync(new URL('make-package.mjs',parent),'utf8').replace("from './render.mjs'","from '../render.mjs'").replaceAll('/main/red-bull-ring/releases/','/main/red-bull-ring/clear-start/releases/');
pack=pack.replace('placementAnchor,catalogRoles,gameTarget,nonCollidingPartIndices','placementAnchor,catalogRoles,gameTarget,nonCollidingPartIndices,startDomain');
pack=pack.replace('placementAnchor,catalogRoles,gameTarget,nonCollidingPartIndices},parts','placementAnchor,catalogRoles,gameTarget,nonCollidingPartIndices,startDomain},parts');
pack=pack.replace("  'red-bull-ring-checkpoint.lua':", "  'red-bull-ring-save.lua':Buffer.from(read('red-bull-ring-save.lua')),\n  'red-bull-ring-checkpoint.lua':");
pack=pack.replace("  'red-bull-ring-checkpoint.lua':", "  'red-bull-ring-recovery.lua':Buffer.from(read('red-bull-ring-recovery.lua')),\n  'red-bull-ring-checkpoint.lua':");
pack=pack.replace('writeArtifacts(here,plan);',`writeArtifacts(here,plan);
const {render}=await import('../render.mjs');
const a=plan.meta.placementAnchor.position,grass=[a[0],-.05,a[2],400,.1,400,5,1,0,0,0,1,0];
fs.writeFileSync(path.join(here,'build-domain.png'),render({...plan,parts:[...plan.parts,grass]},1300,900,{target:[a[0],10,a[2]],span:1100}));`);
fs.writeFileSync(new URL('make-package.mjs',here),pack);
console.log('Prepared the isolated clear-start runtime, checkpoint helpers and package script.');
