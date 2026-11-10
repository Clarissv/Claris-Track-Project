-- Jakarta's own BuildSaver request. A numeric argument explicitly chooses the
-- slot to overwrite. This does not serialize the build locally or bypass saves.
local function saveSlot(slot)
    if type(slot) == "string" and slot:match("^[1-4]$") then slot = tonumber(slot) end
    assert(type(slot) == "number" and slot >= 1 and slot <= 4 and slot % 1 == 0, "Choose a save slot from 1 to 4")
    assert(game.PlaceId == 14005966837, "Join Jakarta before saving the circuit")
    local prior = _G.RedBullRingSlotSave
    assert(not (prior and prior.busy), "A script save request is already running")
    local storage = game:GetService("ReplicatedStorage")
    local player = game:GetService("Players").LocalPlayer
    local shared = assert(storage:FindFirstChild("Shared"), "Jakarta's Shared folder is missing")
    local owner = assert(shared:FindFirstChild("ServerOwner"), "Jakarta's ServerOwner is missing")
    assert(owner.Value == player.UserId, "Only Jakarta's server owner can save this build")
    assert(workspace:FindFirstChild("EditableBuilds"), "Enable build tools and load or build the circuit first")
    local builders = {_G.RedBullRingBarriersBuilder, _G.RedBullRingClearStartCompactBuilder, _G.RedBullRingClearStartBuilder, _G.RedBullRingBuilder, _G.MonzaBuilder, _G.MonzaTerrainBuilder, _G.SepangBuilder, _G.SepangFlatBuilder}
    local current = _G.RedBullRingBarriersBuilder or _G.RedBullRingBuilder
    for _,api in pairs(builders) do
        assert(api.State ~= "building", "Pause the active builder and wait for its current placement before saving")
    end
    assert(not current or current.State ~= "unconfirmed", "Reconcile the unconfirmed placement before saving")
    local container = assert(storage:FindFirstChild("NetworkContainer"), "NetworkContainer is missing")
    local functions = assert(container:FindFirstChild("RemoteFunctions"), "RemoteFunctions is missing")
    local events = assert(container:FindFirstChild("RemoteEvents"), "RemoteEvents is missing")
    local counter = assert(functions:FindFirstChild("BuildSaver"), "BuildSaver count endpoint is missing")
    local endpoint = assert(events:FindFirstChild("BuildSaver"), "BuildSaver save endpoint is missing")
    local message = assert(events:FindFirstChild("ChatMessage"), "Jakarta's save notification endpoint is missing")
    assert(endpoint:IsA("RemoteEvent") and counter:IsA("RemoteFunction"), "Jakarta's save endpoint types changed")
    local report = {slot=slot,status="checking",busy=true,requestedAt=os.clock(),messages={}}
    _G.RedBullRingSlotSave = report
    local cooldown = _G.RedBullRingSaveClock
    if not cooldown then
        cooldown = {notBefore=os.clock()+31}
        _G.RedBullRingSaveClock = cooldown
    end
    local connected
    local ok,reason = pcall(function()
        if os.clock()<cooldown.notBefore then
            report.status="cooldown"
            print(string.format("[Red Bull Ring save] Waiting %.1f seconds for the save cooldown; placement stays paused.",cooldown.notBefore-os.clock()))
        end
        while os.clock()<cooldown.notBefore do
            -- SAVE_CANCEL_CHECK
            task.wait(math.min(.1,cooldown.notBefore-os.clock()))
        end
        -- SAVE_CANCEL_CHECK
        report.status="checking"
        assert(owner.Value==player.UserId,"The server owner changed during the save cooldown; no save was sent")
        local done,countOk,count = false,false,nil
        task.spawn(function() countOk,count=pcall(function() return counter:InvokeServer("GetPlacedAmount") end);done=true end)
        local deadline=os.clock()+12
        repeat task.wait(.05) until done or os.clock()>=deadline
        assert(done and countOk and type(count)=="number" and count==count and count<math.huge and count%1==0, "The server object count could not be verified; no save was sent")
        assert(count>=2, "Only grass or an empty build is loaded. Load or rebuild the circuit before saving; no save was sent")
        report.objectCount=count
        for _,api in pairs(builders) do
            assert(api.State ~= "building", "The builder became active while checking the save count")
        end
        assert(not current or (current.State ~= "unconfirmed" and (current.ExpectedServerCount==nil or current.ExpectedServerCount==count)), "Builder/server count mismatch; run diagnose before saving")
        local sent=false
        connected=message.OnClientEvent:Connect(function(text)
            if not sent or type(text)~="string" then return end
            local lower=string.lower(text)
            if not lower:find("sav",1,true) then return end
            if #report.messages<20 then report.messages[#report.messages+1]=text end
            if report.status~="requested" then return end
            if lower:find("failed to save",1,true) then report.status="failed";report.serverMessage=text
            elseif lower:find("successfully saved",1,true) or lower:find("saved successfully",1,true) then report.status="success";report.serverMessage=text end
        end)
        print(string.format("[Red Bull Ring save] Saving %d objects to slot %d. This replaces that slot's old save.",count,slot))
        report.status="requested";report.sentAt=os.clock();sent=true
        cooldown.notBefore=report.sentAt+31
        -- Verified in Jakarta's exported BUILDSLOT Yes.Activated callback.
        endpoint:FireServer("Save",slot)
        local deadline=os.clock()+45
        while report.status=="requested" and os.clock()<deadline do task.wait(.05) end
        if report.status=="requested" then report.status="unknown";report.serverMessage="No terminal save reply arrived within 45 seconds. Check Jakarta's UI; the request may still be running." end
        report.elapsedSeconds=os.clock()-report.sentAt
    end)
    if connected then connected:Disconnect() end
    if report.sentAt then cooldown.notBefore=math.max(cooldown.notBefore,os.clock()+31) end
    report.busy=false
    if not ok then report.status="error";report.error=tostring(reason);error(reason,0) end
    print(string.format("[Red Bull Ring save] Slot %d: %s. %s",slot,report.status,tostring(report.serverMessage)))
    return report
end
return saveSlot(...)
