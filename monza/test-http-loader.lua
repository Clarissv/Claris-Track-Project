local function loadHttpLoader(...)
    -- HTTP_LOADER_SOURCE
end
local httpCalls, failHttp, badPlan = {}, false, false
function game:HttpGet(url)
    assert(url:match("^https://raw%.githubusercontent%.com/Clarissv/Claris%-Track%-Project/main/monza/releases/[a-f0-9]+/"), "Wrong GitHub release path")
    httpCalls[#httpCalls+1] = url
    if failHttp then error("HTTP unavailable") end
    if url:match("/monza%-builder%.lua$") then return string.dump(loadBuilder) end
    if url:match("/monza%-checkpoint%.lua$") then return string.dump(checkpointBuilder) end
    if url:match("/monza%-diagnose%.lua$") then return string.dump(diagnoseBuilder) end
    if url:match("/runtime%-plan%.json$") then return badPlan and "bad-json" or "fixture-json" end
    error("Unexpected GitHub URL")
end
api = fresh()
local fileRead, fileLoad = readfile, loadfile
readfile, loadfile = nil, nil
api = loadHttpLoader()
assert(api == _G.MonzaBuilder and api.Count == 2 and #calls == 0 and #httpCalls == 2, "HTTP loader must open the builder without file APIs or publishing")
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
assert(not ok and _G.MonzaBuilder == api and #calls == 2, "Failed download must preserve the existing builder")
failHttp, badPlan = false, true
ok = pcall(loadHttpLoader)
assert(not ok and _G.MonzaBuilder == api, "Invalid remote data must preserve the existing builder")
badPlan = false
local before = #httpCalls
ok = pcall(loadHttpLoader,"unknown")
assert(not ok and #httpCalls == before, "Invalid modes must fail before download")
local originalSpawn, waiting = task.spawn, {}
local started = os.clock()
task.spawn = function(fn) waiting[#waiting+1] = fn end
ok = pcall(loadHttpLoader)
task.spawn = originalSpawn
assert(not ok and #waiting == 1 and os.clock()-started < 60.1 and _G.MonzaBuilder == api, "A stalled HTTP fetch must time out without replacing the builder")
print("PASS: GitHub loader without local files, checkpoint/resume, failed downloads and invalid modes")
