local function loadHttpLoader(...)
    -- HTTP_LOADER_SOURCE
end
local httpCalls, failHttp, badPlan = {}, false, false
function game:HttpGet(url)
    assert(url:match("^https://raw%.githubusercontent%.com/Clarissv/Claris%-Track%-Project/main/red%-bull%-ring/clear%-start/releases/[a-f0-9]+/"), "Wrong GitHub release path")
    httpCalls[#httpCalls+1] = url
    if failHttp then error("HTTP unavailable") end
    if url:match("/red%-bull%-ring%-builder%.lua$") then return string.dump(loadBuilder) end
    if url:match("/red%-bull%-ring%-checkpoint%.lua$") then return string.dump(checkpointBuilder) end
    if url:match("/red%-bull%-ring%-diagnose%.lua$") then return string.dump(diagnoseBuilder) end
    if url:match("/red%-bull%-ring%-recovery%.lua$") then return string.dump(recoveryHelper) end
    if url:match("/red%-bull%-ring%-save%.lua$") then return string.dump(saveSlotHelper) end
    if url:match("/runtime%-plan%.json$") then return badPlan and "bad-json" or "fixture-json" end
    error("Unexpected GitHub URL")
end
api = fresh()
local fileRead, fileLoad = readfile, loadfile
readfile, loadfile = nil, nil
api = loadHttpLoader()
assert(api == _G.RedBullRingClearStartBuilder and api.Count == 2 and #calls == 0 and #httpCalls == 2, "HTTP loader must open the builder without file APIs or publishing")
readfile, loadfile = fileRead, fileLoad
api.Inspect()
pauseAfterFirst = true
api.Build()
local saved = loadHttpLoader("checkpoint")
assert(saved.nextIndex == 2 and #calls == 1, "Remote checkpoint must preserve progress without local plan files")
api = loadHttpLoader("resume")
assert(api.NextIndex == 2 and #calls == 1, "Remote resume must restore the checkpoint before publication")
pauseAfterFirst = false
api.Build()
assert(#calls == 2 and api.State == "complete", "Remote resume must publish only the remaining part")
local beforeDiagnostic = #httpCalls
local diagnostic = loadHttpLoader("diagnose")
assert(type(diagnostic) == "string" and diagnostic:find("State=complete",1,true) and #calls == 2 and #httpCalls == beforeDiagnostic+1, "Remote diagnostics must fetch only the helper and send no placements")
failHttp = true
local ok = pcall(loadHttpLoader)
assert(not ok and _G.RedBullRingClearStartBuilder == api and #calls == 2, "Failed download must preserve the existing builder")
failHttp, badPlan = false, true
ok = pcall(loadHttpLoader)
assert(not ok and _G.RedBullRingClearStartBuilder == api, "Invalid remote data must preserve the existing builder")
badPlan = false
local before = #httpCalls
ok = pcall(loadHttpLoader,"unknown")
assert(not ok and #httpCalls == before, "Invalid modes must fail before download")
local originalSpawn, waiting = task.spawn, {}
local started = os.clock()
task.spawn = function(fn) waiting[#waiting+1] = fn end
ok = pcall(loadHttpLoader)
task.spawn = originalSpawn
assert(not ok and #waiting == 1 and os.clock()-started < 60.1 and _G.RedBullRingClearStartBuilder == api, "A stalled HTTP fetch must time out without replacing the builder")
print("PASS: GitHub loader without local files, checkpoint/resume, failed downloads and invalid modes")

-- Numeric save mode fetches only the helper and leaves the loaded builder alone.
api=fresh();api.Build()
saveCalls={}
reply="Failed to save";notifyUI=false;fireError=false
local existingApi=_G.RedBullRingClearStartBuilder
for slot=1,4 do
    local beforeHttp,beforePlacement,beforeSaves=#httpCalls,#calls,#saveCalls
    local result=loadHttpLoader(slot)
    assert(result.slot==slot and result.status=="failed" and #saveCalls==beforeSaves+1,"Numeric save mode must choose the requested slot and keep the failure reply")
    assert(#httpCalls==beforeHttp+1 and #calls==beforePlacement and _G.RedBullRingClearStartBuilder==existingApi,"Save mode must fetch only its helper and preserve the existing builder")
end
local beforeHttp=#httpCalls
assert(not pcall(loadHttpLoader,0) and not pcall(loadHttpLoader,5) and not pcall(loadHttpLoader,1.5) and #httpCalls==beforeHttp,"Invalid slot numbers must fail before download")
local beforePlacement=#calls
local direct=api.Save(4)
assert(direct.slot==4 and direct.status=="failed" and #calls==beforePlacement,"The builder Save method must use the same slot helper")
_G.RedBullRingClearStartBuilder=nil
local afterRejoin=loadHttpLoader(1)
assert(afterRejoin.status=="failed" and _G.RedBullRingClearStartBuilder==nil,"Saving a loaded circuit must work without recreating the builder")
_G.RedBullRingClearStartBuilder=existingApi
print("PASS: numeric loadstring slots 1-4, helper-only download, invalid slots, direct Save method and post-rejoin save")

api=fresh()
local beforeHttp=#httpCalls
assert(not pcall(loadHttpLoader,"autosave") and not pcall(loadHttpLoader,"autosave",5) and #httpCalls==beforeHttp,"Autosave requires a valid explicit slot before download")
api=loadHttpLoader("autosave",3)
assert(api==_G.RedBullRingClearStartBuilder and api.AutoSave.slot==3 and api.AutoSave.every==500 and api.AutoSave.fineFrom==8500 and api.AutoSave.fineEvery==100 and #calls==0,"Autosave mode must arm the requested slot without building")
local beforeSaves=#saveCalls
reply="Your buildings were successfully saved"
api.Build()
assert(api.State=="complete" and #saveCalls==beforeSaves+1 and saveCalls[#saveCalls][2]==3,"Autosave mode must save the completed small build to the selected slot")
print("PASS: explicit autosave loadstring, slot validation, defaults and final automatic save")

api=fresh();pauseAfterFirst=true;api.Build()
local oldApi=api
local beforeHttp,beforePlacement=#httpCalls,#calls
local recovered=loadHttpLoader("recovery",1)
assert(recovered.nextIndex==2 and recovered.expectedServerCount==2 and _G.RedBullRingClearStartBuilder==oldApi and #calls==beforePlacement and #httpCalls==beforeHttp+2,"Recovery mode must fetch only its helper and plan, preserving the original builder")
beforeHttp=#httpCalls
assert(not pcall(loadHttpLoader,"recovery") and not pcall(loadHttpLoader,"recovery",0) and not pcall(loadHttpLoader,"recovery",1.5) and #httpCalls==beforeHttp,"Bad recovery arguments must fail before download")
api=fresh();_G.RedBullRingSlotSave=nil;_G.RedBullRingSaveClock=nil
print("PASS: recovery loadstring preserves the original builder and validates its saved-prefix argument")
