local httpLoader=function(...)
    -- HTTP_LOADER_SOURCE
end
local beforeCalls,existing=#calls,_G.SpaBarriersBuilder
local originalHttp=game.HttpGet
game.HttpGet=function() error("Existing add-on should not be downloaded again") end
assert(httpLoader()==existing and #calls==beforeCalls,"Repeated loadstring must reuse existing barrier progress")
for _,mode in ipairs({"recovery","wrong"}) do assert(not pcall(httpLoader,mode) and #calls==beforeCalls,"Unsupported mode must be rejected") end
local originalLoad=loadstring
local downloaded={}
local continuations=0
game.HttpGet=function(self,url)
    downloaded[#downloaded+1]=url
    if url:match("spa%-save.lua$") then return "save-source" end
    if url:match("spa%-checkpoint.lua$") then return "checkpoint-source" end
    if url:match("runtime%-plan.json$") then return "fixture-json" end
    if url:match("spa%-builder.lua$") then return "builder-source" end
    if url:match("spa%-diagnose.lua$") then return "diagnose-source" end
    if url:match("spa%-continue.lua$") then return "continue-source" end
    error("Unexpected URL "..url)
end
loadstring=function(source)
    if source=="save-source" then return saveSlotHelper end
    if source=="checkpoint-source" then return checkpointBuilder end
    if source=="builder-source" then return loadBuilder end
    if source=="diagnose-source" then return diagnoseBuilder end
    if source=="continue-source" then return function() continuations=continuations+1;return _G.SpaBarriersBuilder end end
    error("Unexpected source "..source)
end
assert(httpLoader(3).status=="success" and #calls==beforeCalls,"HTTP save must use separate add-on")
local cp=httpLoader("checkpoint");assert(cp.expectedServerCount==8296 and cp.requiredBase.checksum=="base-checksum","HTTP checkpoint must include base requirements")
assert(httpLoader("continue")==existing and continuations==1 and #calls==beforeCalls,"HTTP continuation must load the helper and retain the current API and prefix")
existing.Unload();_G.SpaBuilder=nil
local resumed=httpLoader("resume")
assert(resumed.NextIndex==3 and resumed.ExpectedServerCount==8296 and #calls==beforeCalls,"HTTP resume must keep exact completed prefix")
assert(downloaded[1]:match("clear%-start/compact/barriers/releases/"),"HTTP assets must be pinned to barriers release")
game.HttpGet,loadstring=originalHttp,originalLoad
print("PASS: barrier HTTP loader reuses live progress, pins assets, saves/checkpoints/resumes separately")
