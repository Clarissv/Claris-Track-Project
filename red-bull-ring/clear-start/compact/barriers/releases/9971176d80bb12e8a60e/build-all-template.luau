-- One fresh-build entry point: road, terrain, grey concrete barriers, final save.
local slot = tonumber((...)) or 3
assert(slot >= 1 and slot <= 4 and slot % 1 == 0, "Choose save slot 1 to 4")
assert(game.PlaceId == 14005966837 and game:GetService("RunService"):IsClient(), "Run in Jakarta with Build Tools enabled")
if _G.RedBullRingFullBuild then
    _G.RedBullRingFullBuild.Show()
    return _G.RedBullRingFullBuild
end
assert(not _G.RedBullRingClearStartCompactBuilder and not _G.RedBullRingBarriersBuilder, "This entry point starts a fresh build. Keep an existing builder and use its Build / Resume panel.")
local ROAD_BASE = "__ROAD_BASE__"
local BARRIER_BASE = "__BARRIER_BASE__"
local TOTAL_OBJECTS = __TOTAL_OBJECTS__
local function download(base, name)
    local done, ok, body = false, false, nil
    task.spawn(function() ok,body=pcall(function() return game:HttpGet(base..name) end);done=true end)
    local deadline=os.clock()+60
    while not done and os.clock()<deadline do task.wait(.05) end
    assert(done and ok and type(body)=="string" and #body>0,"Could not download "..name..": "..tostring(body))
    return body
end
local function compile(base, name)
    local fn,err=loadstring(download(base,name),"@"..base..name)
    assert(type(fn)=="function","Could not compile "..name..": "..tostring(err))
    return fn
end
-- Resolve both immutable packages and required catalog assets before placing.
local roadRun,barrierRun=compile(ROAD_BASE,"red-bull-ring-builder.lua"),compile(BARRIER_BASE,"red-bull-ring-builder.lua")
local roadPlan,barrierPlan=download(ROAD_BASE,"runtime-plan.json"),download(BARRIER_BASE,"runtime-plan.json")
local storage=game:GetService("ReplicatedStorage")
local player=game:GetService("Players").LocalPlayer
local network=assert(storage:FindFirstChild("NetworkContainer"),"Enable Build Tools first")
local functions=assert(network:FindFirstChild("RemoteFunctions"),"Enable Build Tools first")
local counter=assert(functions:FindFirstChild("BuildSaver"),"Build count endpoint is missing")
assert(workspace:FindFirstChild("EditableBuilds") and counter:InvokeServer("GetPlacedAmount")==1,"Start in a fresh build with only the original grass plate")
local shared=storage:FindFirstChild("Shared")
local owner=shared and shared:FindFirstChild("ServerOwner")
assert(owner and owner.Value==player.UserId,"Only the server owner can run the build and slot autosaves")
local objects=storage:FindFirstChild("PlacementObject")
objects=objects and objects:FindFirstChild("Object")
assert(objects,"Catalog templates are missing")
local catalog=assert(functions:FindFirstChild("GetCatalogManifest"),"Catalog query is missing"):InvokeServer()
local required={Others75=false,Others68=false}
for _,entry in ipairs(catalog) do
    if required[entry.name]~=nil then
        local template=objects:FindFirstChild(entry.guid,true)
        assert(template,"Missing native template: "..entry.name)
        assert(template.ClassName=="Part" and template.Shape==Enum.PartType.Block,"Expected rectangular catalog Part: "..entry.name)
        required[entry.name]=true
    end
end
for name,present in pairs(required) do assert(present,"Required catalog is unavailable: "..name) end
local api={Stage="road",State="ready",Slot=slot,TotalObjects=TOTAL_OBJECTS,Running=false}
_G.RedBullRingFullBuild=api
local heartbeat
function api.Show() if api.Active then api.Active.Show() end end
function api.Pause() if api.Active then api.Active.Pause() end end
local function finalSaveConfirmed(builder)
    return builder.State=="complete" and builder.NextIndex==builder.Count+1 and builder.AutoSave and
        builder.AutoSave.lastSuccess and builder.AutoSave.lastSuccess.confirmedPlanParts==builder.Count and
        builder.AutoSave.lastSuccess.objectCount==builder.ExpectedServerCount
end
function api.Resume()
    if api.Running or api.State=="complete" then api.Show();return api end
    api.Running=true
    task.spawn(function()
        local ok,reason=pcall(function()
            while true do
                if not api.Active then
                    print("[Red Bull Ring full build] Starting road and terrain. Slot "..slot.." autosaves enabled.")
                    api.Active=roadRun(nil,roadPlan)
                    api.Active.EnableAutoSave(slot)
                end
                local active=api.Active
                if active.State~="complete" then
                    api.State="building"
                    active.Build()
                end
                api.State=active.State
                if active.State~="complete" then return end -- Pause or failure: no automatic resend.
                assert(finalSaveConfirmed(active),"The current stage needs a confirmed final autosave before continuing")
                assert(active.VerifyServerCount().matches,"Stage/server object count mismatch")
                if api.Stage=="barriers" then
                    assert(active.ExpectedServerCount==TOTAL_OBJECTS,"Final full-build object count differs")
                    api.State="complete"
                    if heartbeat then heartbeat:Disconnect() end
                    print("[Red Bull Ring full build] DONE: "..TOTAL_OBJECTS.." objects. Road, terrain and concrete barriers saved to slot "..slot..".")
                    return
                end
                print("[Red Bull Ring full build] Road saved. Starting concrete barriers automatically.")
                local gui=player:FindFirstChild("PlayerGui")
                local oldPanel=gui and gui:FindFirstChild("RedBullRingClearStartCompactBuilderPanel")
                if oldPanel then oldPanel.Enabled=false end
                api.Active=barrierRun(nil,barrierPlan)
                api.Stage="barriers"
                api.Active.EnableAutoSave(slot,{every=500,fineFrom=math.max(8500,TOTAL_OBJECTS-500),fineEvery=100})
            end
        end)
        api.Running=false
        if not ok then api.State="stopped";api.Error=tostring(reason);warn("[Red Bull Ring full build] Stopped: "..api.Error..". Use the current panel to inspect and resume; no request was retried.") end
    end)
    return api
end
-- A user can pause/resume through the existing stage panel. Once its resumed
-- build completes, perform the same checked handoff without another loadstring.
heartbeat=game:GetService("RunService").Heartbeat:Connect(function()
    if not api.Running and api.Active and api.State~="complete" and finalSaveConfirmed(api.Active) then api.Resume() end
end)
print("[Red Bull Ring full build] "..TOTAL_OBJECTS.." placed objects including grass; saves replace slot "..slot..".")
return api.Resume()
