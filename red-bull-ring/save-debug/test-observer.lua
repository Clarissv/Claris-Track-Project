local function loadObserver()
    -- OBSERVER_SOURCE
end
local originalBuilder={Count=9629,NextIndex=9630,ExpectedServerCount=9630,State="complete",Placed={}}
_G.RedBullRingBuilder=originalBuilder
placedCountOverride=function() return 9630 end
local messages=child(network:FindFirstChild("RemoteEvents"),"RemoteEvent","ChatMessage")
messages.OnClientEvent=signal()
local update=child(network:FindFirstChild("RemoteEvents"),"RemoteEvent","UpdateBuildSaverUI")
update.OnClientEvent=signal()
local part=child(builds,"Part","visible-test-part")
part.Size=vector(12,.5,12)
originalBuilder.Placed[5902]=part
local observer=loadObserver()
assert(observer==_G.RedBullRingSaveDebug and _G.RedBullRingBuilder==originalBuilder and #calls==0,"Observer must preserve the build and send no placement requests")
local first=observer.Report.snapshots[1]
assert(first.serverCount==9630 and first.visibleParts==1 and #first.invalidVisibleParts==0,"Snapshot must use the authoritative count and inspect visible geometry")
assert(first.visiblePlanGroups.pitLane==1 and first.unmatchedVisibleParts==0,"Matching visible pit references must be grouped")
local before=#observer.Report.events
messages.OnClientEvent:Fire("Unrelated system notice")
assert(#observer.Report.events==before,"Observer must exclude unrelated notifications")
messages.OnClientEvent:Fire("Please, do not leave until buildings are fully saved")
clock=clock+3
messages.OnClientEvent:Fire("Failed to save")
assert(observer.Report.events[before+2].kind=="ChatMessage","Observer must capture the raw server failure")
assert(observer.Report.events[before+2].data.elapsedSinceSaveNotice==3,"Observer must record result timing")
assert(observer.Report.snapshots[#observer.Report.snapshots].label=="save result","Failure must trigger a count snapshot")
part.Size=vector(0/0,1,12)
local invalid=observer.Snapshot("invalid numeric fixture")
assert(#invalid.invalidVisibleParts==1,"Visible non-finite sizes must be detected")
part.Size=vector(32,1,12)
observer.Stop()
before=#observer.Report.events
messages.OnClientEvent:Fire("Failed to save")
assert(#observer.Report.events==before,"Stopping must detach observation connections")
local refreshed=loadObserver()
assert(refreshed~=observer and _G.RedBullRingBuilder==originalBuilder and #calls==0,"Reloading the observer must preserve the original builder")
local raw=refreshed.Export()
assert(type(raw)=="string" and #calls==0,"Export must only produce diagnostic data")
return "PASS: read-only save observation, authoritative count, result timing, numeric checks, stop/reload and export"
