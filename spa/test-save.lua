-- SAVE_HELPER_TESTS is inserted into the existing runtime mock environment.
local function saveSlotHelper(...)
    -- SAVE_HELPER_SOURCE
end
local shared=storage:FindFirstChild("Shared") or child(storage,"Folder","Shared")
local serverOwner=shared:FindFirstChild("ServerOwner") or child(shared,"IntValue","ServerOwner")
player.UserId,serverOwner.Value=1234,1234
local messages=network:FindFirstChild("RemoteEvents"):FindFirstChild("ChatMessage") or child(network:FindFirstChild("RemoteEvents"),"RemoteEvent","ChatMessage")
messages.OnClientEvent=signal()
local saveRemote=child(network:FindFirstChild("RemoteEvents"),"RemoteEvent","BuildSaver")
local saveCalls,reply,notifyUI,fireError={},"Failed to save",false,false
function saveRemote:FireServer(action,slot)
    assert(action=="Save" and type(slot)=="number" and slot>=1 and slot<=4,"Save request contract differs from Jakarta's UI")
    saveCalls[#saveCalls+1]={action,slot,sentAt=clock}
    if #saveCalls>1 then assert(clock-saveCalls[#saveCalls-1].sentAt>=31,"Manual save requests must share the cooldown") end
    if fireError then error("send failed") end
    if notifyUI then messages.OnClientEvent:Fire("Slot metadata updated") end
    if reply then messages.OnClientEvent:Fire(reply) end
end
local current=_G.SpaBuilder
local savedExpected=current.ExpectedServerCount
current.State,current.ExpectedServerCount="complete",9624
placedCountOverride=function() return 9624 end
local originalBuilder,currentCalls=current,#calls
for _,slot in ipairs({0,5,1.5,"unknown"}) do assert(not pcall(saveSlotHelper,slot) and #saveCalls==0,"Invalid slots must send no save") end
game.PlaceId=1;assert(not pcall(saveSlotHelper,1) and #saveCalls==0);game.PlaceId=14005966837
serverOwner.Value=4321;assert(not pcall(saveSlotHelper,1) and #saveCalls==0,"An unrelated account must not save the server owner's build");serverOwner.Value=1234
current.State="building";assert(not pcall(saveSlotHelper,1) and #saveCalls==0,"An active build must not be saved mid-placement");current.State="complete"
placedCountOverride=function() return 1 end
assert(not pcall(saveSlotHelper,1) and #saveCalls==0 and not _G.SpaSlotSave.busy,"The grass-only reload must not replace a slot")
placedCountOverride=function() return 9000 end
assert(not pcall(saveSlotHelper,1) and #saveCalls==0,"A count mismatch must send no save")
placedCountOverride=function() return 9624 end
for slot=1,4 do
    local result=saveSlotHelper(slot)
    assert(result.slot==slot and result.objectCount==9624 and result.status=="failed" and result.serverMessage=="Failed to save" and not result.busy,"A server failure must remain a failure")
end
reply="Your buildings were successfully saved"
assert(saveSlotHelper("3").status=="success" and saveCalls[#saveCalls][2]==3,"String slots and the actual success reply must work")
reply="Please, do not leave until buildings are fully saved"
notifyUI=true
local unknown=saveSlotHelper(2)
assert(unknown.status=="unknown" and not unknown.busy,"A start notice or slot metadata refresh is not success")
fireError=true;assert(not pcall(saveSlotHelper,1) and not _G.SpaSlotSave.busy,"Send failures must release the local request lock");fireError=false
_G.SpaSlotSave.busy=true;local before=#saveCalls
assert(not pcall(saveSlotHelper,1) and #saveCalls==before,"Duplicate in-flight saves must be rejected");_G.SpaSlotSave.busy=false
assert(_G.SpaBuilder==originalBuilder and #calls==currentCalls,"Saving must preserve the builder and send no placement requests")
for _,connection in ipairs(messages.OnClientEvent.listeners) do assert(not connection.Connected,"Save observation connections must be released") end
current.ExpectedServerCount=savedExpected
placedCountOverride=nil
print("PASS: slots 1-4, save contract, owner/count/idle checks, grass-only guard, failure/success/unknown replies and cleanup")
