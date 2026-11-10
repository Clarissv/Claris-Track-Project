-- Continue the existing barrier API, including the older streaming-sensitive
-- release. Confirm its pending object first; never resend that placement.
assert(game.PlaceId == 14005966837, "Run in the current Jakarta session")
local api = assert(_G.RedBullRingBarriersBuilder, "Keep the current barriers builder loaded")
assert(api.State ~= "building", "Pause and wait for the current build before continuing")
local previous = _G.RedBullRingBarrierContinue
assert(not (previous and previous.busy), "Barrier continuation is already running")
local player = game:GetService("Players").LocalPlayer
local character = assert(player.Character, "Spawn your character first")
local root = assert(character:FindFirstChild("HumanoidRootPart"), "Spawn your character first")
local humanoid = character:FindFirstChildOfClass("Humanoid")
assert(not humanoid or (humanoid.Health > 0 and not humanoid.SeatPart), "Step out of the car before continuing; your character will follow the barriers")
local folder = assert(workspace:FindFirstChild("EditableBuilds"), "Enable Build Tools first")
local request = api.RequestDiagnostics()
local pending = request and request.index == api.NextIndex and request.observed ~= nil
local report = api.VerifyServerCount()
if pending then
    assert(report.serverCount == api.ExpectedServerCount + 1, "Pending placement is not the only extra server object. Run diagnose; no duplicate was sent")
else
    assert(report.matches, "Builder/server count mismatch. Run diagnose before continuing")
end
local run = {busy=true,nextIndex=api.NextIndex,expectedServerCount=api.ExpectedServerCount}
_G.RedBullRingBarrierContinue = run
local start, anchored = character:GetPivot(), root.Anchored
api.Config.FollowBuild = true
api.Config.FollowSettleTime = .75
api.Config.PlacementTimeout = 30
api.Config.StreamingTimeout = 10
local function matches(object)
    if object.ClassName ~= "Part" or object.Shape ~= Enum.PartType.Block then return false end
    if (object.Position-request.cf.Position).Magnitude > .01 or (object.Size-request.size).Magnitude > .01 then return false end
    if object.CFrame.RightVector:Dot(request.cf.RightVector) < .999 or object.CFrame.UpVector:Dot(request.cf.UpVector) < .999 then return false end
    if not object.Anchored or object.CanCollide ~= request.canCollide then return false end
    if request.verifyAppearance then
        if object.Material ~= request.material or (object.MaterialVariant or "") ~= request.materialVariant then return false end
        local a,b=object.Color,request.color
        if Vector3.new(a.R-b.R,a.G-b.G,a.B-b.B).Magnitude > .03 then return false end
    end
    for index,owned in pairs(api.Placed) do if owned == object and index ~= request.index then return false end end
    return true
end
local ok, reason = pcall(function()
    if pending then
        print("[Red Bull Ring continue] Server accepted barrier "..request.index..". Moving nearby and waiting for its replication; no placement resend.")
        root.Anchored = true
        character:PivotTo(CFrame.new(request.cf.Position + Vector3.new(0, request.size.Y/2 + api.Config.FollowHeight, 0)))
        if workspace.StreamingEnabled then
            task.spawn(function() pcall(function() player:RequestStreamAroundAsync(request.cf.Position,10) end) end)
        end
        local deadline, found = os.clock()+30, nil
        repeat
            assert(api.State ~= "building" and api.NextIndex == run.nextIndex and api.ExpectedServerCount == run.expectedServerCount, "The active build changed while streaming; pause before continuing")
            found = nil
            for _,object in ipairs(folder:GetChildren()) do
                if matches(object) then assert(not found, "Multiple matching objects; run diagnose");found=object end
            end
            if found then break end
            task.wait(.25)
        until os.clock()>=deadline
        assert(found,"Accepted barrier is still not replicated nearby. Keep this session open; no duplicate was sent")
    end
    -- The existing builder owns the pending request and count. Let it reconcile
    -- that exact object, then place only the remaining barriers and autosave.
    api.Build()
    run.state,run.nextIndex,run.serverCount=api.State,api.NextIndex,api.ServerCount
end)
local restored, restoreReason = pcall(function() if player.Character == character then character:PivotTo(start) end end)
local released, releaseReason = pcall(function() root.Anchored = anchored end)
run.busy=false
if not restored or not released then warn("[Red Bull Ring continue] Character restore: "..tostring(restoreReason or releaseReason)) end
if not ok then run.error=tostring(reason);error(reason,0) end
print("[Red Bull Ring continue] "..api.State..": "..(api.NextIndex-1).." / "..api.Count.." barriers. Existing road and confirmed barriers preserved.")
return api
