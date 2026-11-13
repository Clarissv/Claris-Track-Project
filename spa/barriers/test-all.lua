-- Exercise the actual one-load coordinator with fake stage builders.
local fullLoader=function(...)
    -- FULL_BUILD_SOURCE
end
local savedHttp,savedLoad,savedService=game.HttpGet,loadstring,game.GetService
local savedRoad,savedBarrier=_G.SpaBuilder,_G.SpaBarriersBuilder
local fullHeartbeat=signal()
local stageCalls,downloads={},{}
local pauseRoad,failRoad,failBarrier,unsavedRoad=false,false,false,false
local fullRoad,fullBarriers
warn=function() end
game.GetService=function(self,name)
    if name=="RunService" then return {IsClient=function() return true end,Heartbeat=fullHeartbeat} end
    return savedService(self,name)
end
game.HttpGet=function(self,url)
    downloads[#downloads+1]=url
    if url:find("/barriers/",1,true) then return url:match("builder.lua$") and "barrier-builder" or "barrier-plan" end
    return url:match("builder.lua$") and "road-builder" or "road-plan"
end
local function fakeBuilder(isBarrier)
    local b={State="ready",Count=isBarrier and 200 or 8173,NextIndex=1,ExpectedServerCount=isBarrier and 8174 or 1}
    function b.EnableAutoSave(slot,options) assert(slot==3);b.AutoSave={};b.Options=options end
    function b.VerifyServerCount() return {matches=true,serverCount=b.ExpectedServerCount} end
    function b.Show() b.Shown=true end
    function b.Pause() b.State="paused" end
    function b.Build()
        stageCalls[#stageCalls+1]=isBarrier and "barriers" or "road"
        if (isBarrier and failBarrier) or (not isBarrier and failRoad) then b.State="unconfirmed";error("Unconfirmed request") end
        if not isBarrier and pauseRoad then pauseRoad=false;b.State="paused";return end
        b.State,b.NextIndex="complete",b.Count+1
        b.ExpectedServerCount=isBarrier and _G.SpaFullBuild.TotalObjects or 8174
        if not (not isBarrier and unsavedRoad) then b.AutoSave.lastSuccess={confirmedPlanParts=b.Count,objectCount=b.ExpectedServerCount} end
    end
    return b
end
loadstring=function(body)
    if body=="road-builder" then return function(_,plan) assert(plan=="road-plan");fullRoad=fakeBuilder(false);_G.SpaBuilder=fullRoad;return fullRoad end end
    if body=="barrier-builder" then return function(_,plan)
        assert(plan=="barrier-plan" and fullRoad.State=="complete" and fullRoad.AutoSave.lastSuccess,"Barriers must wait for a completed, saved base")
        fullBarriers=fakeBuilder(true);_G.SpaBarriersBuilder=fullBarriers;return fullBarriers
    end end
    error(body)
end
local function resetFull()
    _G.SpaFullBuild,_G.SpaBuilder,_G.SpaBarriersBuilder=nil,nil,nil
    stageCalls,downloads={},{}
    pauseRoad,failRoad,failBarrier,unsavedRoad=false,false,false,false
    fullRoad,fullBarriers=nil,nil
    placedCountOverride=function() return 1 end
    manifest.InvokeServer=function() return {{name="Others75",guid="guid-road"},{name="Others68",guid="guid-road"}} end
end
resetFull()
local all=fullLoader(3)
assert(all.State=="complete" and #stageCalls==2 and stageCalls[1]=="road" and stageCalls[2]=="barriers","One load must complete both stages in order")
assert(fullBarriers.AutoSave.lastSuccess.objectCount==all.TotalObjects,"Complete must include the final combined slot save")
local beforeDownloads=#downloads
assert(fullLoader(3)==all and #stageCalls==2 and #downloads==beforeDownloads,"Repeated load must reuse full-build progress")
for _,url in ipairs(downloads) do assert(url:find("/releases/",1,true),"Both stages must use pinned releases") end
resetFull();pauseRoad=true
all=fullLoader(3)
assert(all.State=="paused" and not fullBarriers and #stageCalls==1,"Pausing the base must defer barriers")
fullRoad.Build();fullHeartbeat:Fire()
assert(all.State=="complete" and #stageCalls==3 and fullBarriers,"Resuming through the base panel must hand off automatically")
resetFull();failRoad=true;all=fullLoader(3)
assert(all.State=="stopped" and not fullBarriers and #stageCalls==1,"Unconfirmed road placement must stop the full build")
fullHeartbeat:Fire();assert(#stageCalls==1,"Heartbeat must never retry an unconfirmed request")
resetFull();unsavedRoad=true;all=fullLoader(3)
assert(all.State=="stopped" and not fullBarriers,"An unconfirmed final road save must block the handoff")
resetFull();failBarrier=true;all=fullLoader(3)
assert(all.State=="stopped" and #stageCalls==2 and fullRoad.State=="complete","Barrier failure must preserve the completed base")
resetFull();placedCountOverride=function() return 2 end
assert(not pcall(fullLoader,3) and #stageCalls==0,"Fresh-build loader must reject an existing build before placing")
resetFull();manifest.InvokeServer=function() return {{name="Others75",guid="guid-road"}} end
assert(not pcall(fullLoader,3) and #stageCalls==0,"Missing concrete must be caught before road placement")
game.HttpGet,loadstring,game.GetService=savedHttp,savedLoad,savedService
_G.SpaFullBuild=nil
_G.SpaBuilder,_G.SpaBarriersBuilder=savedRoad,savedBarrier
placedCountOverride=nil
print("PASS: one-load road/barrier completion and final save; pinned assets; pause/handoff; no retries after failure; fresh-build and catalog preflight")
