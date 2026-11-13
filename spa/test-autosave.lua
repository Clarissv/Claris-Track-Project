-- Exercise real placement/save integration with the mocked Jakarta endpoints.
local savedParts,savedPartCount=fixtureDocument.parts,fixtureDocument.meta.partCount
fixtureDocument.parts={}
for i=1,6 do
    local p={}
    for k,v in ipairs(savedParts[2]) do p[k]=v end
    p[1]=(i-1)*20
    fixtureDocument.parts[i]=p
end
fixtureDocument.meta.partCount=6
local originalFire,originalWait=saveRemote.FireServer,task.wait
local attempts,delayedReply,failAt,pauseCooldown,pauseReply,diagnosticFire={}
local function diagnosticBuilder(options)
    local builder=fresh()
    _G.SpaSlotSave=nil
    _G.SpaSaveClock=nil
    attempts,delayedReply,failAt,pauseCooldown,pauseReply={},nil,nil,false,false
    saveRemote.FireServer=diagnosticFire
    builder.EnableAutoSave(2,options or {every=2,fineFrom=4,fineEvery=1})
    return builder
end
diagnosticFire=function(self,action,slot)
    local builder=_G.SpaBuilder
    assert(action=="Save" and slot==2 and builder.State=="building" and builder.Phase=="saving","Autosave must retain the build lock")
    attempts[#attempts+1]={sentAt=clock,count=builder.ExpectedServerCount,placements=#calls}
    if #attempts>1 then assert(clock-attempts[#attempts-1].sentAt>=31,"Save cooldown was skipped") end
    if failAt==#attempts then messages.OnClientEvent:Fire("Failed to save")
    else delayedReply={at=clock+2,placements=#calls} end
end
task.wait=function(dt)
    local builder=_G.SpaBuilder
    if builder and builder.Phase=="saving" then
        assert(not pcall(builder.Build) and not pcall(builder.Save,1),"Concurrent building or manual saving must be blocked")
        if pauseCooldown and _G.SpaSlotSave.status=="cooldown" then builder.Pause();pauseCooldown=false end
    end
    originalWait(dt)
    if delayedReply then
        assert(#calls==delayedReply.placements,"Placement ran while awaiting a save reply")
        if clock>=delayedReply.at then
            delayedReply=nil
            if pauseReply then builder.Pause();pauseReply=false end
            messages.OnClientEvent:Fire("Your buildings were successfully saved")
        end
    end
end
api=diagnosticBuilder();failAt=2
api.Build()
local auto=api.AutoSave
assert(#attempts==2 and #calls==4 and api.NextIndex==5 and api.State=="save_failed","First failure must stop without placing the next part")
assert(auto.lastSuccess.objectCount==2 and auto.firstFailure.objectCount==4 and auto.firstFailure.firstAddedIndex==3 and auto.firstFailure.lastAddedIndex==4,"Save failure boundary must refer to the last confirmed success")
assert(auto.firstFailure.groups=="asphalt" and api.AutoSaveReport()==auto,"Save report must retain group and history")
assert(not pcall(api.Build) and #attempts==2 and #calls==4,"Build/Resume must not retry a failed save")
api.DisableAutoSave();api.Build()
assert(api.State=="complete" and #calls==6 and #attempts==2,"Explicit disable must continue from confirmed placement progress")

api=diagnosticBuilder();api.Build()
assert(api.State=="complete" and #attempts==4,"Normal/fine checkpoints plus final save must run")
for i,count in ipairs({2,4,5,6}) do assert(attempts[i].count==count,"Fine interval transition differs") end
local previous=#attempts;api.Build()
assert(#attempts==previous and #calls==6,"Complete builds must not duplicate the final save")

api=diagnosticBuilder()
child(builds,"Part","ExistingGrass")
api.Build()
assert(attempts[1].count==2 and attempts[1].placements==1 and attempts[#attempts].count==7,"Checkpoint counts must include existing grass, not just plan parts")

api=diagnosticBuilder();pauseCooldown=true;api.Build()
assert(#attempts==0 and api.State=="paused" and #calls==2 and api.AutoSave.status=="cancelled","Pause must cancel before sending during cooldown")
api.Build()
assert(api.State=="complete" and attempts[1].count==2 and #calls==6,"Resume must save the unsaved boundary before adding parts")

api=diagnosticBuilder();pauseReply=true;api.Build()
assert(api.State=="paused" and #calls==2 and #attempts==1 and api.AutoSave.lastSuccess.objectCount==2,"Pause while saving must wait for the reply and retain success")
api.Build();assert(api.State=="complete" and #calls==6,"Pause after a save must preserve placement progress")

-- Reload the last saved prefix while keeping the original builder transform.
api=diagnosticBuilder();child(builds,"Part","ExistingGrass");failAt=2;api.Build()
assert(api.State=="save_failed" and api.AutoSave.lastSuccess.objectCount==2 and #calls==3,"Reload fixture must first stop above its last good save")
local originalFrame=api.GetTarget(2).cf
local loadedChildren=builds:GetChildren()
for i=3,#loadedChildren do loadedChildren[i]:Destroy() end
assert(api.VerifyServerCount().serverCount==2,"Loaded prefix must contain grass and its first saved track part")
attempts,failAt={},nil
api.EnableAutoSave(2,{every=2,fineFrom=2,fineEvery=1})
api.Repair()
assert(api.State=="complete" and api.ReusedCount==1 and api.SentCount==5 and #builds:GetChildren()==7,"Repair must reuse the loaded prefix and place only its missing suffix")
assert(#attempts==5 and attempts[1].count==3 and attempts[#attempts].count==7,"Fine autosave must resume immediately above the loaded total count")
assert((calls[4][2].Position-originalFrame.Position).Magnitude<.000001,"Repair must retain the original placement transform after slot reload")

api=diagnosticBuilder()
function saveRemote:FireServer() messages.OnClientEvent:Fire("Please, do not leave until buildings are fully saved") end
api.Build()
assert(api.State=="save_unknown" and #calls==2 and api.AutoSave.firstFailure.status=="unknown","A start notice without a terminal reply must stop the build")

api=diagnosticBuilder()
function saveRemote:FireServer() error("save send error") end
api.Build()
assert(api.State=="save_error" and #calls==2 and not _G.SpaSlotSave.busy,"Save exceptions must stop independently of placement confirmation")

api=diagnosticBuilder()
placedCountOverride=function() return #builds:GetChildren()>=2 and #builds:GetChildren()+1 or #builds:GetChildren() end
assert(not pcall(api.Build) and #attempts==0 and #calls==2,"A changed authoritative count must block autosave without sending")

fixtureDocument.parts={}
for i=1,202 do
    local p={}
    for k,v in ipairs(savedParts[2]) do p[k]=v end
    p[1]=(i-1)*20
    fixtureDocument.parts[i]=p
end
fixtureDocument.meta.partCount=202
api=diagnosticBuilder({every=500,fineFrom=8500,fineEvery=100})
placedCountOverride=function() return 8498+#builds:GetChildren() end
api.Build()
assert(api.State=="complete" and #attempts==3,"Default fine sampling must save at 8500, 8600 and 8700")
for i,count in ipairs({8500,8600,8700}) do assert(attempts[i].count==count and attempts[i].placements==count-8498,"High-count checkpoints must use the authoritative count") end

task.wait,saveRemote.FireServer=originalWait,originalFire
fixtureDocument.parts,fixtureDocument.meta.partCount=savedParts,savedPartCount
api=fresh();_G.SpaSlotSave=nil;_G.SpaSaveClock=nil
print("PASS: autosave cooldown, placement lock, exact failure boundary, fine intervals, final save, pause/resume, unknown replies and send/count errors")
