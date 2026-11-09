local function loadHttpLoader(...)
    -- HTTP_LOADER_SOURCE
end
local httpCalls, failHttp, badPlan = {}, false, false
function game:HttpGet(url)
    assert(url:match("^https://raw%.githubusercontent%.com/Clarissv/Claris%-Track%-Project/main/monza/terrain/releases/[a-f0-9]+/"), "Wrong GitHub release path")
    httpCalls[#httpCalls+1] = url
    if failHttp then error("HTTP unavailable") end
    if url:match("/monza%-terrain%-builder%.lua$") then return string.dump(loadBuilder) end
    if url:match("/monza%-terrain%-checkpoint%.lua$") then return string.dump(checkpointBuilder) end
    if url:match("/monza%-terrain%-diagnose%.lua$") then return string.dump(diagnoseBuilder) end
    if url:match("/runtime%-plan%.json$") then return badPlan and "bad-json" or "fixture-json" end
    error("Unexpected GitHub URL")
end
api = fresh()
local fileRead, fileLoad = readfile, loadfile
readfile, loadfile = nil, nil
api = loadHttpLoader()
assert(api == _G.MonzaTerrainBuilder and api.Count == 2 and #calls == 0 and #httpCalls == 2, "HTTP loader must open the builder without file APIs or publishing")
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
assert(not ok and _G.MonzaTerrainBuilder == api and #calls == 2, "Failed download must preserve the existing builder")
failHttp, badPlan = false, true
ok = pcall(loadHttpLoader)
assert(not ok and _G.MonzaTerrainBuilder == api, "Invalid remote data must preserve the existing builder")
badPlan = false
local before = #httpCalls
ok = pcall(loadHttpLoader,"unknown")
assert(not ok and #httpCalls == before, "Invalid modes must fail before download")
local originalSpawn, waiting = task.spawn, {}
local started = os.clock()
task.spawn = function(fn) waiting[#waiting+1] = fn end
ok = pcall(loadHttpLoader)
task.spawn = originalSpawn
assert(not ok and #waiting == 1 and os.clock()-started < 60.1 and _G.MonzaTerrainBuilder == api, "A stalled HTTP fetch must time out without replacing the builder")
print("PASS: GitHub loader without local files, checkpoint/resume, failed downloads and invalid modes")

api = fresh()
local originalRoad = api.GetTarget(1)
local savedRoad = instance("Part")
savedRoad.Name, savedRoad.CFrame, savedRoad.Size = "Block", originalRoad.cf, originalRoad.size
savedRoad.Color, savedRoad.Material, savedRoad.MaterialVariant = originalRoad.color, originalRoad.material, originalRoad.materialVariant
savedRoad.Anchored, savedRoad.CanCollide, savedRoad.Parent = true, true, builds
local httpBase = {Count=1,State="complete",VerifyServerCount=function() return {matches=true} end,RequestDiagnostics=function() return originalRoad end}
_G.MonzaBuilder = httpBase
loadHttpLoader("terrain-only")
assert(#calls == 1 and _G.MonzaTerrainBuilder.State == "complete", "HTTP terrain-only mode must start only the suffix placement")
assert(_G.MonzaBuilder == httpBase and savedRoad.Parent == builds, "HTTP terrain-only mode must preserve the original track")
_G.MonzaBuilder = nonTerrainSentinel
print("PASS: separate terrain loader, original builder isolation and terrain-only HTTP placement")
