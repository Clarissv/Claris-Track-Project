-- Upgrade a stopped road session with identical geometry. Verify its accepted
-- pending object, retain ownership/counts/autosave and the full-build handoff.
local loadBuilder,planJson=...
assert(type(loadBuilder)=="function" and type(planJson)=="string","Use the compact loader's continue mode")
assert(game.PlaceId==14005966837,"Continue in the same Jakarta session")
local old=assert(_G.RedBullRingClearStartCompactBuilder,"Keep the stopped road builder loaded")
assert(old.State~="building","Pause and wait for the road before continuing")
if old.NextIndex>old.Count and old.State=="complete" then old.Show();return old end
assert(not (_G.RedBullRingRoadContinue and _G.RedBullRingRoadContinue.busy),"Road continuation is already running")
assert(not (_G.RedBullRingSlotSave and _G.RedBullRingSlotSave.busy),"Wait for the current slot save")
local coordinator=_G.RedBullRingFullBuild
if coordinator then assert(not coordinator.Running and coordinator.Stage=="road" and coordinator.Active==old,"Keep the stopped road stage active") end
local player=game:GetService("Players").LocalPlayer
local character=assert(player.Character,"Spawn your character first")
local root=assert(character:FindFirstChild("HumanoidRootPart"),"Spawn your character first")
local humanoid=character:FindFirstChildOfClass("Humanoid")
assert(not humanoid or (humanoid.Health>0 and not humanoid.SeatPart),"Step out of the car before continuing")
local folder=assert(workspace:FindFirstChild("EditableBuilds"),"Enable Build Tools")
local plan=game:GetService("HttpService"):JSONDecode(planJson)
assert(plan.meta and plan.meta.format=="red-bull-ring-elevated-v1" and plan.meta.partCount==old.Count and #plan.parts==old.Count,"Continuation requires the same road geometry")
local request=old.RequestDiagnostics() or old.GetTarget(old.NextIndex)
local hasPending=request.index==old.NextIndex and request.observed~=nil
local snapshot={nextIndex=old.NextIndex,expected=old.ExpectedServerCount}
assert(typeof(request.origin)=="CFrame" and type(request.scale)=="number" and request.scale>0,"Missing original road transform")
print("[Red Bull Ring road continue] Checking the matching plan and pending placement. No placement resend.")
-- Check all targets, including parts not yet built; a few matching reference
-- tiles cannot prove that the rest of an older road plan is identical.
local checksum=0
for index,p in ipairs(plan.parts) do
    local target=old.GetTarget(index)
    local expected=request.origin*CFrame.fromMatrix(Vector3.new(p[1],p[2],p[3])*request.scale,Vector3.new(p[8],p[9],p[10]),Vector3.new(p[11],p[12],p[13]))
    local a,b={expected:GetComponents()},{target.cf:GetComponents()}
    for k=1,12 do assert(math.abs(a[k]-b[k])<(k<=3 and .003 or .00003),"Road geometry differs; the existing session was preserved") end
    assert((target.size-Vector3.new(p[4],p[5],p[6])*request.scale).Magnitude<.003,"Road dimensions differ; the existing session was preserved")
    for _,value in ipairs(p) do checksum=(checksum*65599+math.floor(value*10000+.5))%2147483647 end
    if index%64==0 then task.wait() end
end
assert(old.NextIndex==snapshot.nextIndex and old.ExpectedServerCount==snapshot.expected and _G.RedBullRingClearStartCompactBuilder==old,"The active road changed; pause before continuing")
local report=old.VerifyServerCount()
assert(type(snapshot.expected)=="number","No original server count")
if hasPending then assert(report.serverCount==snapshot.expected+1,"The pending Part is not the only extra server object; no duplicate was sent")
else assert(report.matches,"Builder/server count mismatch; no placement was sent") end
local function cross(a,b) return Vector3.new(a.Y*b.Z-a.Z*b.Y,a.Z*b.X-a.X*b.Z,a.X*b.Y-a.Y*b.X) end
local function measurements(object)
    local actualUp,actualRight=object.CFrame.UpVector,object.CFrame.RightVector
    local right,up=request.cf.RightVector,request.cf.UpVector
    local actualTop=object.Position+actualUp*(object.Size.Y/2)
    local expectedTop=request.cf.Position+up*(request.size.Y/2)
    local back,actualBack=cross(right,up),cross(actualRight,actualUp)
    local topError,cornerError=0,0
    for _,side in ipairs({-1,1}) do for _,along in ipairs({-1,1}) do
        local q=expectedTop+right*(side*request.size.X/2)+back*(along*request.size.Z/2)
        local actual=actualTop+actualRight*(side*object.Size.X/2)+actualBack*(along*object.Size.Z/2)
        topError=math.max(topError,math.abs((q-actualTop):Dot(actualUp)/actualUp.Y))
        cornerError=math.max(cornerError,(actual-q).Magnitude)
    end end
    return {positionError=(object.Position-request.cf.Position).Magnitude,sizeError=(object.Size-request.size).Magnitude,topError=topError,cornerError=cornerError,
        rightDegrees=math.acos(math.max(-1,math.min(1,actualRight:Dot(right))))*180/math.pi,upDegrees=math.acos(math.max(-1,math.min(1,actualUp:Dot(up))))*180/math.pi}
end
local function matches(object)
    if object.ClassName~="Part" or object.Shape~=Enum.PartType.Block then return false end
    local uuid=object.Name:match("^%{(.-)%}$") or object.Name
    local uuidPattern="^"..string.rep("%x",8).."%-"..string.rep("%x",4).."%-"..string.rep("%x",4).."%-"..string.rep("%x",4).."%-"..string.rep("%x",12).."$"
    if object.Name~=request.name and not (#uuid==36 and uuid:match(uuidPattern)) then return false end
    for index,owned in pairs(old.Placed) do if owned==object and index~=request.index then return false end end
    if (object.Position-request.cf.Position).Magnitude>.01 or (object.Size-request.size).Magnitude>.01 then return false end
    if object.CFrame.RightVector:Dot(request.cf.RightVector)<.999 or object.CFrame.UpVector:Dot(request.cf.UpVector)<.999 then return false end
    if not object.Anchored or object.CanCollide~=request.canCollide then return false end
    if request.verifyAppearance then
        if object.Material~=request.material or (object.MaterialVariant or "")~=request.materialVariant then return false end
        local a,b=object.Color,request.color
        if Vector3.new(a.R-b.R,a.G-b.G,a.B-b.B).Magnitude>.03 then return false end
    end
    local role
    for _,r in ipairs(plan.meta.catalogRoles or {}) do for _,index in ipairs(r.partIndices) do if index+1==request.index then role=r.name end end end
    if role=="Others75" then local m=measurements(object);local scale=math.max(1,request.scale);if m.topError>.008*scale or m.cornerError>.03*scale then return false end end
    return true
end
local run={busy=true,previous=old,nextIndex=old.NextIndex}
_G.RedBullRingRoadContinue=run
local start,anchored=character:GetPivot(),root.Anchored
local oldState,oldError=coordinator and coordinator.State,coordinator and coordinator.Error
if coordinator then coordinator.Running=true end -- Reserve its heartbeat until character restoration.
local replacement
local ok,reason=pcall(function()
    local accepted
    if hasPending then
        root.Anchored=true
        character:PivotTo(CFrame.new(request.cf.Position+Vector3.new(0,request.size.Y/2+old.Config.FollowHeight,0)))
        if workspace.StreamingEnabled then task.spawn(function() pcall(function() player:RequestStreamAroundAsync(request.cf.Position,10) end) end) end
        local deadline,printed=os.clock()+30,false
        repeat
            assert(old.NextIndex==snapshot.nextIndex and old.ExpectedServerCount==snapshot.expected and old.State~="building","The active road changed while checking replication")
            accepted=nil
            for _,object in ipairs(folder:GetChildren()) do
                if object:IsA("BasePart") and (object.Position-request.cf.Position).Magnitude<.25 and not printed then
                    local m=measurements(object);run.measurements=m;printed=true
                    print(string.format("[Red Bull Ring road continue] Part %d: position %.6f, size %.6f, top %.6f, corners %.6f studs; right %.6f, up %.6f degrees",request.index,m.positionError,m.sizeError,m.topError,m.cornerError,m.rightDegrees,m.upDegrees))
                end
                if matches(object) then assert(not accepted,"Multiple matching Parts; the existing session was preserved");accepted=object end
            end
            if accepted then break end
            task.wait(.1)
        until os.clock()>=deadline
        assert(accepted,"The accepted Part still fails the corner/surface check or has not replicated; no duplicate was sent. Copy the measurement line from the console")
    end
    assert(old.VerifyServerCount().serverCount==report.serverCount,"Server objects changed while checking the road; no placement was sent")
    local saved={previous=old,format="red-bull-ring-checkpoint-v2",placeId=game.PlaceId,count=old.Count,nextIndex=old.NextIndex+(hasPending and 1 or 0),
        expectedServerCount=report.serverCount,checksum=string.format("%.0f",checksum),origin={request.origin:GetComponents()},scale=request.scale,
        saveObjectLimit=old.Config.SaveObjectLimit,catalogName=request.baseCatalogName or request.name,applyAppearance=request.applyAppearance==true,
        catalogRoles=plan.meta.catalogRoles or {},nonCollidingPartIndices=plan.meta.nonCollidingPartIndices or {},placed={},
        sentCount=old.SentCount+(hasPending and 1 or 0),reusedCount=old.ReusedCount}
    for index,object in pairs(old.Placed) do saved.placed[index]=object end
    if accepted then saved.placed[request.index]=accepted end
    replacement=loadBuilder(nil,planJson,"handoff",nil,saved)
    run.api=replacement
    if coordinator then coordinator.Active=replacement;coordinator.State=replacement.State;coordinator.Error=nil end
    for key,value in pairs(old.Config) do if key~="Origin" and key~="Scale" and key~="CatalogName" and key~="ApplyAppearance" then replacement.Config[key]=value end end
    replacement.Config.FollowBuild=true
    replacement.AutoSave=old.AutoSave
    print("[Red Bull Ring road continue] Confirmed the existing prefix; continuing at Part "..replacement.NextIndex..". Original transform and autosave retained.")
    replacement.Build()
    run.state,run.nextIndex=replacement.State,replacement.NextIndex
end)
local restored,restoreReason=pcall(function() if player.Character==character then character:PivotTo(start) end end)
local released,releaseReason=pcall(function() root.Anchored=anchored end)
run.busy=false
if coordinator then coordinator.Running=false;if not replacement then coordinator.State,coordinator.Error=oldState,oldError else coordinator.State=replacement.State end end
if not restored or not released then warn("[Red Bull Ring road continue] Character restore: "..tostring(restoreReason or releaseReason)) end
if not ok then run.error=tostring(reason);error(reason,0) end
if coordinator and replacement.State=="complete" then coordinator.Resume() end
return replacement
