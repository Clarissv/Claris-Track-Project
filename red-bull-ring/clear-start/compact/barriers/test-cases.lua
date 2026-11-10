-- The compact builder's Roblox mocks are prepended by test-builder.ps1.
local baseOrigin = CFrame.new(900,12,-400) * CFrame.Angles(0,.37,0)
local baseScale = 2.5
local reference = {}
for k,v in ipairs(fixtureDocument.parts[1]) do reference[k]=v end
fixtureDocument.meta.variant="clear-start-compact-barriers"
Enum.Material.DiamondPlate="DiamondPlate"
function methods:Clone()
    local copy=instance(self.ClassName)
    for k,v in pairs(self._props) do if k~="Parent" and k~="ChildAdded" and k~="Activated" then copy[k]=v end end
    for _,child in ipairs(self:GetChildren()) do child:Clone().Parent=copy end
    return copy
end
fixtureDocument.meta.palette[1].material="Concrete"
fixtureDocument.meta.palette[1].materialVariant=nil
fixtureDocument.meta.palette[2]={rgb={180,181,176},material="Concrete"}
fixtureDocument.parts[2][7]=2
defaultBarrierRoles={{name="Others68",appearance="color",partIndices={0}},{name="Others68",appearance="template",partIndices={1}}}
roadTemplate.Material,roadTemplate.MaterialVariant="Concrete",""
manifest.InvokeServer=function() return {{name="Block",guid="guid-block",plus=false},{name="Others68",guid="guid-road",plus=false}} end
local originalPlace=placement.FireServer
function placement:FireServer(...)
    local args={...}
    if args[1]~="Others68" then return originalPlace(self,...) end
    local previousOverride=placementOverride
    placementOverride=function(o)
        o.Color,o.Material,o.MaterialVariant=args[5] or roadTemplate.Color,args[6] or roadTemplate.Material,args[7] or roadTemplate.MaterialVariant
        if previousOverride then previousOverride(o) end
    end
    originalPlace(self,...)
    placementOverride=previousOverride
end
fixtureDocument.meta.requiredBase={count=8293,version="matching-road",checksum="base-checksum",references={{index=1,part=reference}}}
local wrongReference=false
local road = {PlaceId=14005966837,Count=8293,NextIndex=8294,State="complete",ExpectedServerCount=8294}
function road.GetTarget(index)
    assert(index==1)
    local p=reference
    local frame=baseOrigin*CFrame.fromMatrix(vector(p[1],p[2],p[3])*baseScale,vector(p[8],p[9],p[10]),vector(p[11],p[12],p[13]))
    if wrongReference then frame=frame*CFrame.new(1,0,0) end
    return {origin=baseOrigin,scale=baseScale,cf=frame,size=vector(p[4],p[5],p[6])*baseScale}
end
function road.VerifyServerCount() local count=8294+#builds:GetChildren();return {serverCount=count,matches=count==road.ExpectedServerCount} end
local function newSession()
    _G.RedBullRingClearStartCompactBuilder=road
    road.State,road.Count,road.NextIndex,wrongReference="complete",8293,8294,false
    _G.RedBullRingSlotSave,_G.RedBullRingSaveClock=nil,nil
    return fresh()
end
local api=newSession()
assert(#calls==0 and pivotCalls==0 and not root.Anchored and api.ExpectedServerCount==8294,"Loading must inherit the base count without placing or moving")
assert(_G.RedBullRingClearStartCompactBuilder==road,"Loading must preserve the road builder")
root.CFrame=cf(99999,99999,99999)
local target=api.GetTarget(1)
assert(target.name=="Others68" and target.material=="Concrete" and target.materialVariant=="" and target.color.R==65/255,"Main barriers must use colourable native concrete, without steel")
assert((target.origin.Position-baseOrigin.Position).Magnitude<.000001 and target.scale==baseScale,"Barrier transform must ignore current driving position")
assert((target.cf.Position-road.GetTarget(1).cf.Position).Magnitude<.000001,"Rotated/scaled road alignment differs")
assert(api.Config.FollowBuild==true,"Default add-on must stay near placements for streaming")
local savedRead=readfile
readfile=nil;_G.RedBullRingClearStartCompactBuilder=nil
assert(not pcall(loadBuilder,nil,"fixture-json") and _G.RedBullRingBarriersBuilder==api,"Missing base must preserve the current add-on")
readfile=savedRead;_G.RedBullRingClearStartCompactBuilder=road
for _,field in ipairs({"Count","NextIndex"}) do local old=road[field];road[field]=2;assert(not pcall(loadBuilder) and _G.RedBullRingBarriersBuilder==api,"Unfinished/wrong base must be rejected");road[field]=old end
wrongReference=true;assert(not pcall(loadBuilder) and _G.RedBullRingBarriersBuilder==api,"Different base geometry must be rejected");wrongReference=false
road.State="building";assert(not pcall(loadBuilder) and not pcall(api.Build) and #calls==0,"Concurrent road placement must block barriers");road.State="complete"
local preview=api.Preview()
assert(preview:GetChildren()[1].Material=="Concrete" and preview:GetChildren()[1].Color.R==65/255 and preview:GetChildren()[2].Color==roadTemplate.Color,"Preview must distinguish grey runs and native concrete terminals")
assert(#preview:GetChildren()==2 and #calls==0 and _G.RedBullRingClearStartCompactBuilder==road,"Preview must remain local")
api.ClearPreview()
placedCountOverride=function() return 8293 end
assert(not pcall(api.Build) and #calls==0,"Missing base objects must block placement")
placedCountOverride=nil
pauseAfterFirst=true;api.Build()
assert(api.State=="paused" and api.NextIndex==2 and api.ExpectedServerCount==8295 and #calls==1,"Pause must include base and confirmed barrier in the count")
local saved=checkpointBuilder()
assert(saved.requiredBase.checksum=="base-checksum" and saved.expectedServerCount==8295 and saved.nextIndex==2,"Checkpoint must include matching road and combined count")
local components={baseOrigin:GetComponents()};for k,v in ipairs(components) do assert(math.abs(saved.origin[k]-v)<.000001,"Checkpoint must retain exact inherited transform") end
api.Unload();_G.RedBullRingClearStartCompactBuilder=nil
api=loadBuilder(nil,"fixture-json","resume")
assert(api.NextIndex==2 and api.ExpectedServerCount==8295,"Resume must work without the original road API")
local prior=checkpointDocument.requiredBase.version;checkpointDocument.requiredBase.version="wrong"
assert(not pcall(loadBuilder,nil,"fixture-json","resume") and _G.RedBullRingBarriersBuilder==api,"Different base checkpoint must preserve current session")
checkpointDocument.requiredBase.version=prior
placedCountOverride=function() return 8294 end
assert(not pcall(api.Build) and #calls==1,"Missing saved barrier prefix must prevent duplicate placement")
placedCountOverride=nil;pauseAfterFirst=false;api.Build()
assert(api.State=="complete" and #calls==2 and api.ExpectedServerCount==8296,"Resume must only place the remaining barrier")
api.Build();assert(#calls==2,"Completed barriers must not place twice")
assert(not pcall(api.Repair),"Repair must not discard a barrier prefix")

-- A complete base checkpoint can supply alignment after rejoining.
api.Unload()
local originalRead=readfile
readfile=function(path) if path=="red-bull-ring-clear-start-compact-jakarta-checkpoint.json" then return "base-checkpoint" end;return originalRead(path) end
local originalService=game.GetService
local baseCheckpoint={format="red-bull-ring-checkpoint-v2",placeId=game.PlaceId,count=8293,nextIndex=8294,checksum="base-checksum",origin=components,scale=baseScale}
game.GetService=function(self,name) if name=="HttpService" then local http=originalService(self,name);local decode=http.JSONDecode;http.JSONDecode=function(self,raw) if raw=="base-checkpoint" then return baseCheckpoint end;return decode(self,raw) end;return http end;return originalService(self,name) end
for _,o in ipairs(builds:GetChildren()) do o:Destroy() end
api=loadBuilder(nil,"fixture-json")
assert(api.ExpectedServerCount==8294 and (api.GetTarget(1).cf.Position-target.cf.Position).Magnitude<.000001,"Completed base checkpoint must retain alignment")
baseCheckpoint.nextIndex=100
assert(not pcall(loadBuilder,nil,"fixture-json") and _G.RedBullRingBarriersBuilder==api,"Partial base checkpoint must be rejected")
readfile,game.GetService=originalRead,originalService
api=newSession();reject=true
assert(not pcall(api.Build) and #calls==1 and api.State=="unconfirmed","Unconfirmed barrier must stop")
assert(not pcall(api.Build) and #calls==1,"An unconfirmed barrier must never be resent")

-- Autosave and manual save must use the add-on count, even with stale base count.
api=newSession()
local shared=child(storage,"Folder","Shared"),serverOwner
serverOwner=child(shared,"IntValue","ServerOwner");player.UserId,serverOwner.Value=1234,1234
local messages=child(network:FindFirstChild("RemoteEvents"),"RemoteEvent","ChatMessage");messages.OnClientEvent=signal()
local saveRemote=child(network:FindFirstChild("RemoteEvents"),"RemoteEvent","BuildSaver")
local saves={}
function saveRemote:FireServer(action,slot)
    assert(action=="Save" and slot==3,"Save must use the chosen slot")
    saves[#saves+1]={count=_G.RedBullRingBarriersBuilder.ExpectedServerCount,at=clock,placements=#calls}
    if #saves>1 then assert(clock-saves[#saves-1].at>=31,"Autosave must respect shared cooldown") end
    messages.OnClientEvent:Fire("Your buildings were successfully saved")
end
api.EnableAutoSave(3,{every=1,fineFrom=8294,fineEvery=1});api.Build()
assert(api.State=="complete" and #calls==2 and saves[#saves].count==8296 and api.AutoSave.lastSuccess.objectCount==8296,"Autosave must save combined road/barrier count")
assert(road.ExpectedServerCount==8294 and _G.RedBullRingClearStartCompactBuilder==road,"Autosave must preserve original road progress")
local saveSlotHelper=function(...)
    -- SAVE_HELPER_SOURCE
end
assert(saveSlotHelper(3).status=="success","Manual save must use add-on count")
road.State="building";local before=#saves;assert(not pcall(saveSlotHelper,3) and #saves==before,"Active base builder must block saves");road.State="complete"

-- HTTP_LOADER_TESTS
-- Native concrete may carry striped textures, while remaining a rectangular Part.
api=newSession()
api.Unload()
local originalManifest=manifest.InvokeServer
manifest.InvokeServer=function() return {{name="Block",guid="guid-block",plus=false},{name="Others68",guid="guid-road",plus=false}} end
fixtureDocument.meta.catalogRoles=defaultBarrierRoles
roadTemplate.Material,roadTemplate.MaterialVariant="Concrete",""
local stripes=child(roadTemplate,"Texture","NativeStripes")
api=loadBuilder(nil,"fixture-json")
local concrete=api.GetTarget(2)
assert(concrete.name=="Others68" and concrete.material=="Concrete" and concrete.materialVariant=="" and concrete.color==roadTemplate.Color,"Concrete must retain native appearance")
preview=api.Preview()
assert(preview:GetChildren()[2]:FindFirstChild("NativeStripes"),"Concrete preview must retain native stripes")
api.ClearPreview();api.Build()
assert(api.State=="complete" and calls[1][1]=="Others68" and calls[1][6]=="Concrete" and calls[1][5].R==65/255 and calls[2][1]=="Others68" and calls[2][6]=="Concrete" and calls[2][5]==roadTemplate.Color,"All barriers must use concrete with the requested colours")
stripes:Destroy();roadTemplate.Shape="Ball"
api=newSession();api.Unload();fixtureDocument.meta.catalogRoles={{name="Others68",appearance="template",partIndices={1}}};api=loadBuilder(nil,"fixture-json")
assert(not pcall(api.Build) and api.NextIndex==1,"Concrete must still have plain rectangular collision geometry")
roadTemplate.Shape="Block";manifest.InvokeServer=originalManifest
-- STREAMING_TESTS
-- FULL_BUILD_TESTS
return "PASS: barriers inherit rotated/scaled base, preserve road, reject mismatches, pause/checkpoint/resume, prevent duplicates, and save combined counts"
