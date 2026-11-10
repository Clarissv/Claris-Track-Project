local legacyRoad=function(...)
    -- LEGACY_ROAD_SCRIPT
end
local continueRoad=function(...)
    -- ROAD_CONTINUE_SCRIPT
end
local previousSaveCalls,previousReply,previousNotify=saveCalls,reply,notifyUI
local function rotationDifference(o)
    local u=o.CFrame.UpVector
    o.CFrame=CFrame.fromMatrix(o.Position,o.CFrame.RightVector,vector(u.X,u.Y,u.Z+.0001).Unit)
end
local function failedLegacy(failSecond)
    saveCalls,reply,notifyUI={},"Your buildings were successfully saved",false
    api=withRoadRole()
    fixtureDocument.meta.catalogRoles[1].partIndices={0,1}
    api.Unload();api=legacyRoad(nil,"fixture-json")
    api.EnableAutoSave(3)
    placementOverride=function(o) if not failSecond or #calls==2 then rotationDifference(o) end end
    assert(not pcall(api.Build) and api.State=="unconfirmed","Reproduce the old published strict-rotation failure")
    return api
end
local old=failedLegacy(true)
assert(old.NextIndex==2 and old.SentCount==1 and #calls==2,"Legacy must retain its prefix and the accepted pending object")
local prefix,pending=builds:GetChildren()[1],builds:GetChildren()[2]
local oldAuto,position=old.AutoSave,root.Position
local coordinator={Stage="road",State="stopped",Running=false,Active=old,Error="old rotation tolerance"}
function coordinator.Resume()
    assert(not coordinator.Running and coordinator.Active==_G.RedBullRingClearStartCompactBuilder and coordinator.Active.AutoSave.lastSuccess,"Full-build handoff must use the replacement and its confirmed save")
    coordinator.resumed=true
end
_G.RedBullRingFullBuild=coordinator
local upgraded=continueRoad(loadBuilder,"fixture-json")
assert(upgraded~=old and upgraded==_G.RedBullRingClearStartCompactBuilder and upgraded.State=="complete" and #calls==2,"Upgrade the old live matcher without resending the accepted object")
assert(upgraded.Placed[1]==prefix and upgraded.Placed[2]==pending and upgraded.SentCount==2 and upgraded.ReusedCount==0,"Retain exact prefix ownership and count the accepted request once")
assert(upgraded.AutoSave==oldAuto and upgraded.AutoSave.lastSuccess.objectCount==2 and coordinator.resumed and coordinator.Active==upgraded,"Preserve slot/autosave history and resume the original full-build coordinator")
assert(not root.Anchored and (root.Position-position).Magnitude<1e-6,"Restore the user's position and anchoring")
_G.RedBullRingFullBuild=nil
continueRoad(loadBuilder,"fixture-json")
assert(#calls==2,"A repeated completed continuation must not place again")

old=failedLegacy(false)
upgraded=continueRoad(loadBuilder,"fixture-json")
assert(upgraded.State=="complete" and #calls==2,"The new matcher must also accept subsequent small rotation differences")

old=failedLegacy(false)
local savedParts=fixtureDocument.parts
fixtureDocument.parts={}
for i,p in ipairs(savedParts) do local copy={};for k,v in ipairs(p) do copy[k]=v end;fixtureDocument.parts[i]=copy end
fixtureDocument.parts[2][1]=fixtureDocument.parts[2][1]+1
assert(not pcall(continueRoad,loadBuilder,"fixture-json") and _G.RedBullRingClearStartCompactBuilder==old and #calls==1,"A changed future road part must fail before replacing the live API or sending placements")
fixtureDocument.parts=savedParts
placedCountOverride=function() return old.ExpectedServerCount+2 end
assert(not pcall(continueRoad,loadBuilder,"fixture-json") and _G.RedBullRingClearStartCompactBuilder==old and #calls==1,"An ambiguous extra server count must preserve the old API")
placedCountOverride=nil
local o=builds:GetChildren()[1]
o.CFrame=CFrame.fromMatrix(o.Position,o.CFrame.RightVector,vector(-.02,1,-.02).Unit)
assert(not pcall(continueRoad,loadBuilder,"fixture-json") and _G.RedBullRingClearStartCompactBuilder==old and #calls==1,"A genuine surface error must not be falsely adopted or resent")
humanoid.SeatPart=instance("Seat")
assert(not pcall(continueRoad,loadBuilder,"fixture-json") and not root.Anchored,"Require the user to leave the car before continuing")
humanoid.SeatPart=nil
api=fresh()
saveCalls,reply,notifyUI=previousSaveCalls,previousReply,previousNotify
print("PASS: published road rotation failure, same-geometry live upgrade, no duplicate resend, ownership/counts, autosave/coordinator handoff, bad-geometry and count guards")
