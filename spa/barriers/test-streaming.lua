-- Reproduce the user's +1 server count and missing streamed child, including
-- their already-published builder, then continue without replacing its API.
local continueBarriers=function(...)
    -- CONTINUE_SOURCE
end
local legacyBarrier=function(...)
    -- LEGACY_BARRIER_SOURCE
end
local normalWait,normalStream=task.wait,methods.RequestStreamAroundAsync
local hidden,hideArmed,revealAt
task.wait=function(dt)
    normalWait(dt)
    if hideArmed and #calls==2 and not hidden then
        hidden=builds:GetChildren()[2]
        if hidden then hidden.Parent=nil end
    end
    if hidden and revealAt and clock>=revealAt and not hidden.Parent then hidden.Parent=builds end
end
function methods:RequestStreamAroundAsync(position,timeout)
    assert(self==player and typeof(position)=="Vector3" and timeout>=1 and timeout<=20)
    streamCalls=streamCalls+1
    if onStream then onStream(position) end
end
local function acceptedButHidden(useLegacy)
    hidden,hideArmed,revealAt=nil,false,nil
    saves={}
    api=newSession()
    if useLegacy then api.Unload();api=legacyBarrier(nil,"fixture-json") end
    api.Config.FollowBuild=false
    api.Config.PlacementTimeout=1
    workspace.StreamingEnabled=true
    hideArmed=true
    placedCountOverride=function() return 8294+#builds:GetChildren()+(hidden and not hidden.Parent and 1 or 0) end
    return api
end
api=acceptedButHidden(true)
api.EnableAutoSave(3)
assert(not pcall(api.Build) and api.NextIndex==2 and api.ExpectedServerCount==8295 and #calls==2,"Legacy build must retain the confirmed prefix and stop at its hidden accepted request")
assert(api.VerifyServerCount().serverCount==8296 and hidden and not hidden.Parent,"Server must be +1 while its accepted child is streamed out")
local legacyApi=api
local initialPosition=root.CFrame.Position
onStream=function() revealAt=clock+2 end
assert(continueBarriers()==legacyApi and api.State=="complete" and api.NextIndex==3 and #calls==2,"Continuation must reconcile the old pending request without any placement resend")
assert(_G.SpaBarriersBuilder==legacyApi and _G.SpaBuilder==road,"Continuation must preserve both live APIs")
assert(api.ExpectedServerCount==8296 and api.AutoSave.lastSuccess.objectCount==8296,"Continuation must retain the combined count and finish its existing autosave")
assert(not root.Anchored and (root.CFrame.Position-initialPosition).Magnitude<1e-6,"Continuation must restore the user's character")
assert(continueBarriers()==legacyApi and #calls==2,"A repeated completed continuation must never place again")

api=acceptedButHidden(false)
assert(not pcall(api.Build) and api.NextIndex==2 and #calls==2,"Current builder must also stop on an accepted hidden request")
api.Config.FollowBuild=true;api.Config.PlacementTimeout=5
onStream=function() revealAt=clock+2 end
api.Build()
assert(api.State=="complete" and #calls==2 and api.ExpectedServerCount==8296,"Pending reconciliation must wait beyond teleport settle for delayed replication, without resending")
assert(streamCalls>0 and not root.Anchored,"Forced pending streaming must work with character follow and restore anchoring")
hidden,hideArmed,revealAt=nil,false,nil
task.wait,methods.RequestStreamAroundAsync=normalWait,normalStream

api=newSession();reject=true
assert(not pcall(api.Build) and #calls==1,"Set up a rejected pending placement")
local beforePivots=pivotCalls
assert(not pcall(continueBarriers) and #calls==1 and pivotCalls==beforePivots,"An absent accepted-object count must not move or resend")
placedCountOverride=function() return api.ExpectedServerCount+2 end
assert(not pcall(continueBarriers) and #calls==1 and pivotCalls==beforePivots,"An ambiguous extra count must not resume or resend")
api=newSession();humanoid.SeatPart=instance("Seat")
assert(not pcall(continueBarriers) and #calls==0 and not root.Anchored,"Continuation must require stepping out of the car before following")
humanoid.SeatPart=nil
print("PASS: old live API streamed +1 continuation and autosave; delayed pending replication; no duplicate resend; character restoration; ambiguous count and seated guards")
