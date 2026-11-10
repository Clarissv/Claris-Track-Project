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
    source=source.replace('local function matches(object, request, reuse)',fs.readFileSync(new URL('road-surface-template.luau',here),'utf8')+'\nlocal function matches(object, request, reuse)');
    source=source.replace('    if request.verifyAppearance then',`    local surfaceOk,surfaceReason=roadSurfaceMatches(object,request,positionError,sizeError)
    if not surfaceOk then return false,surfaceReason end
    if request.verifyAppearance then`);
    source=source.replace('    api.Placed[index] = object',`    local measurementRequest = makeRequest(index, origin, buildScale, appearance)
    local topError,cornerError = roadSurfaceError(object, measurementRequest)
    if topError then
        roadMeasurements.confirmed = roadMeasurements.confirmed + 1
        roadMeasurements.maxPositionErrorStuds = math.max(roadMeasurements.maxPositionErrorStuds, (object.Position-measurementRequest.cf.Position).Magnitude)
        roadMeasurements.maxCornerErrorStuds = math.max(roadMeasurements.maxCornerErrorStuds,cornerError)
        if topError >= roadMeasurements.maxTopErrorStuds then roadMeasurements.maxTopErrorStuds, roadMeasurements.worstIndex = topError, index end
    end
    api.Placed[index] = object`);
    source=source.replace('local function queryServerCount()',`if launchMode=="handoff" then
    api.SentCount,api.ReusedCount=liveCheckpoint.sentCount,liveCheckpoint.reusedCount
    for index,object in pairs(liveCheckpoint.placed) do
        api.Placed[index],owners[object]=object,index
        local uuid=objectUuid(object);if uuid then uuidOwners[uuid]=index end
    end
end
local function queryServerCount()`);
    source=source.replace('MaxObjects = 9999','MaxObjects = 8998');
    source=source.replace(/local AUTO_GROUPS = [^\r\n]+/,()=>`local AUTO_GROUPS = {${Object.entries(plan.meta.groups).map(([name,indices])=>`{"${name}",${indices[0]+1},${indices.at(-1)+1}}`).join(',')}}`);
    source=source.replace('    local folder = workspace:FindFirstChild("EditableBuilds")\n    assert(folder, "EditableBuilds is missing; enable build tools")','    assert(not (_G.RedBullRingClearStartBuilder and _G.RedBullRingClearStartBuilder.State == "building"), "Pause the original clear-start builder before building compact terrain")\n    local folder = workspace:FindFirstChild("EditableBuilds")\n    assert(folder, "EditableBuilds is missing; enable build tools")');
    source=source.replace('    if CONFIG.SaveObjectLimit ~= nil then','    if not repairing then assert(currentCount + remainingCount < 9000, "Compact build exceeds its 8999 total-object target. Start with the grass plate or load a matching compact prefix.") end\n    if CONFIG.SaveObjectLimit ~= nil then');
    source=source.replace('Your starting point stays inside a clear 400 x 400 stud grass area.','Compact terrain: under 9000 total objects; clear 400 x 400 stud grass starting area.');
  }
  if(name==='plan-loader.luau'){
    source=source.replace('local dataPath, inlineJson, launchMode, checkpointPath = ...','local dataPath, inlineJson, launchMode, checkpointPath, liveCheckpoint = ...');
    source=source.replace('if launchMode == "resume" then\n    local ok, contents',`if launchMode == "resume" or launchMode == "handoff" then
    local saved
    if launchMode=="handoff" then
        assert(type(liveCheckpoint)=="table" and liveCheckpoint.previous==_G.RedBullRingClearStartCompactBuilder and liveCheckpoint.previous.State~="building", "Keep the stopped road session loaded for handoff")
        saved=liveCheckpoint
        assert(type(saved.placed)=="table" and finite(saved.sentCount) and saved.sentCount>=0 and saved.sentCount%1==0 and finite(saved.reusedCount) and saved.reusedCount>=0 and saved.reusedCount%1==0,"Invalid live road ownership/counts")
        for index,object in pairs(saved.placed) do assert(finite(index) and index%1==0 and index>=1 and index<saved.nextIndex and object:IsA("BasePart"),"Invalid live road ownership") end
    else
    local ok, contents`);
    source=source.replace('local decoded, saved = pcall(function() return game:GetService("HttpService"):JSONDecode(contents) end)','local decoded;decoded,saved = pcall(function() return game:GetService("HttpService"):JSONDecode(contents) end)');
    source=source.replace('    assert(saved.placeId == TARGET_PLACE_ID',`    end
    assert(type(saved)=="table" and saved.format=="red-bull-ring-checkpoint-v2","Invalid road handoff/checkpoint")
    assert(saved.placeId == TARGET_PLACE_ID`);
    source=source.replace('saved.expectedServerCount == saved.nextIndex','(launchMode=="handoff" and saved.expectedServerCount>=saved.nextIndex-1 or launchMode~="handoff" and saved.expectedServerCount == saved.nextIndex)');
  }
  if(name==='github-loader-template.luau'){
    source=source.replace(' or mode == "recovery"',' or mode == "recovery" or mode == "continue"');
    source=source.replace('expected build, resume, checkpoint, recovery, diagnose, autosave','expected build, resume, checkpoint, recovery, continue, diagnose, autosave');
    source=source.replace('if mode == "diagnose" then',`if mode == "continue" then return compile("red-bull-ring-continue.lua")(compile("red-bull-ring-builder.lua"),download("runtime-plan.json")) end
if mode == "diagnose" then`);
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
  if(name==='test-builder.lua')source=source.replace('-- HTTP_LOADER_TESTS',fs.readFileSync(new URL('test-road-surface.lua',here),'utf8')+'\n-- HTTP_LOADER_TESTS');
  if(name==='test-builder.ps1'){
    source=source.replaceAll('RedBullRingClearStartLuaNative','RedBullRingClearStartCompactLuaNative');
    source=source.replace('    $autoTests = [IO.File]::ReadAllText',`    $continueTests = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-road-continue.lua'))
    $continueTests = $continueTests.Replace('-- LEGACY_ROAD_SCRIPT', [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'releases\\c8e791ad3efdfa73e337\\red-bull-ring-builder.lua')))
    $continueTests = $continueTests.Replace('-- ROAD_CONTINUE_SCRIPT', [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'red-bull-ring-continue.lua')))
    $autoTests = [IO.File]::ReadAllText`);
    source=source.replace('$autoTests + "\r\n-- HTTP_LOADER_TESTS"','$autoTests + "\r\n" + $continueTests + "\r\n-- HTTP_LOADER_TESTS"');
    source=source.replace('$autoTests + "\n-- HTTP_LOADER_TESTS"','$autoTests + "\n" + $continueTests + "\n-- HTTP_LOADER_TESTS"');
  }
  fs.writeFileSync(new URL(name,here),source);
}
const packageSource=fs.readFileSync(new URL('make-package.mjs',parent),'utf8')
  .replaceAll("'../render.mjs'","'../../render.mjs'")
  .replaceAll('/main/red-bull-ring/clear-start/releases/','/main/red-bull-ring/clear-start/compact/releases/')
  .replaceAll('nonCollidingPartIndices,startDomain','nonCollidingPartIndices,startDomain,compactTerrain');
fs.writeFileSync(new URL('make-package.mjs',here),packageSource.replace("  'red-bull-ring-diagnose.lua':Buffer.from(read('red-bull-ring-diagnose.lua')),","  'red-bull-ring-diagnose.lua':Buffer.from(read('red-bull-ring-diagnose.lua')),\n  'red-bull-ring-continue.lua':Buffer.from(read('red-bull-ring-continue.lua')),").replace('const a=plan.meta.placementAnchor.position,grass=[a[0],-.05,a[2],400,.1,400,5,1,0,0,0,1,0];','const a=plan.meta.placementAnchor.position,angle=plan.meta.startDomain.yawRadians??0,grass=[a[0],-.05,a[2],400,.1,400,5,Math.cos(angle),0,Math.sin(angle),0,1,0];'));
console.log('Prepared compact builder, separate globals/checkpoints, shared save cooldown, and pinned release packaging.');
