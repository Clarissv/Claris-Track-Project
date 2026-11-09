-- Explicit diagnostic saves; all requests use the game's existing slot endpoint.
-- AUTO_SAVE_HELPER
local AUTO_GROUPS = -- AUTO_GROUP_RANGES
local function saveGroups(first,last)
    local names={}
    for _,group in ipairs(AUTO_GROUPS) do
        if first<=group[3] and last>=group[2] then names[#names+1]=group[1] end
    end
    return #names>0 and table.concat(names,", ") or "plan"
end
local function nextSaveCount(auto,count)
    local interval=count>=auto.fineFrom and auto.fineEvery or auto.every
    local nextCount=(math.floor(count/interval)+1)*interval
    if count<auto.fineFrom then nextCount=math.min(nextCount,auto.fineFrom) end
    return nextCount
end
function api.EnableAutoSave(slot,options)
    assert(not busy and not previewing and not pending,"Pause and reconcile the build before enabling autosave")
    slot=tonumber(slot)
    assert(slot and slot>=1 and slot<=4 and slot%1==0,"Choose an autosave slot from 1 to 4")
    options=options or {}
    local auto={slot=slot,every=options.every or 500,fineFrom=options.fineFrom or 8500,fineEvery=options.fineEvery or 100,
        status="armed",history={},startedAt=os.clock()}
    for _,key in ipairs({"every","fineFrom","fineEvery"}) do
        local value=auto[key]
        assert(type(value)=="number" and value>=1 and value<math.huge and value%1==0,"Autosave intervals must be positive integers")
    end
    local shared=ReplicatedStorage:FindFirstChild("Shared")
    local owner=shared and shared:FindFirstChild("ServerOwner")
    assert(owner and owner.Value==player.UserId,"Only Jakarta's server owner can enable autosave")
    remote("RemoteEvents","BuildSaver","RemoteEvent")
    remote("RemoteEvents","ChatMessage","RemoteEvent")
    _G.RedBullRingSaveClock=_G.RedBullRingSaveClock or {notBefore=os.clock()+31}
    api.AutoSave=auto
    _G.RedBullRingAutoSave=auto
    status(string.format("Autosave armed: slot %d; every %d objects, every %d from %d. Inspect / Preview, then Build.",slot,auto.every,auto.fineEvery,auto.fineFrom))
    return auto
end
function api.DisableAutoSave()
    assert(not busy,"Pause the build and wait for its save request before disabling autosave")
    if api.AutoSave then api.AutoSave.status="disabled" end
    api.AutoSave=nil
end
function api.AutoSaveReport()
    local auto=api.AutoSave or _G.RedBullRingAutoSave
    assert(auto,"No diagnostic autosave run is recorded")
    for _,entry in ipairs(auto.history) do
        print(string.format("[Red Bull Ring autosave] %s: %s objects; parts %d-%d (%s). %s",entry.status,
            tostring(entry.objectCount or entry.expectedObjectCount),entry.firstAddedIndex,entry.lastAddedIndex,entry.groups,tostring(entry.serverMessage or entry.error or "")))
    end
    if auto.lastSuccess then print("[Red Bull Ring autosave] Last successful count: "..auto.lastSuccess.objectCount) end
    return auto
end
local function autosaveCheckpoint()
    local auto=api.AutoSave
    if not auto or paused then return end
    local confirmed=api.NextIndex-1
    if confirmed<1 then return end
    auto.nextObjectCount=auto.nextObjectCount or nextSaveCount(auto,api.ExpectedServerCount)
    if api.ExpectedServerCount<auto.nextObjectCount and api.NextIndex<=#PLAN then return end
    if auto.lastSuccess and auto.lastSuccess.confirmedPlanParts==confirmed then return end
    local first=auto.lastSuccess and auto.lastSuccess.confirmedPlanParts+1 or 1
    api.Phase="saving"
    auto.status="saving"
    status(string.format("Autosave: %d objects to slot %d; placement paused for cooldown and reply",api.ExpectedServerCount,auto.slot))
    local ok,result=pcall(requestSlotSave,auto.slot,true)
    if not ok then
        result={slot=auto.slot,status="error",error=tostring(result)}
    end
    result.confirmedPlanParts=confirmed
    result.expectedObjectCount=api.ExpectedServerCount
    result.firstAddedIndex,result.lastAddedIndex=first,confirmed
    result.groups=saveGroups(first,confirmed)
    auto.history[#auto.history+1]=result
    auto.status=result.status
    if result.status=="success" then
        auto.lastSuccess=result
        auto.nextObjectCount=nextSaveCount(auto,api.ExpectedServerCount)
        status(string.format("Saved %d objects; parts %d-%d (%s). Continuing.",result.objectCount,first,confirmed,result.groups))
    elseif result.status~="cancelled" then
        auto.firstFailure=auto.firstFailure or result
        paused=true
        auto.stopMessage=string.format("SAVE %s at %d objects. Last success: %s. Added parts %d-%d (%s). Placement stopped; inspect the save report.",
            result.status,api.ExpectedServerCount,auto.lastSuccess and tostring(auto.lastSuccess.objectCount) or "none",first,confirmed,result.groups)
        status(auto.stopMessage)
    end
    api.Phase="building"
end
