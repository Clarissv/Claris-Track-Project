-- Behavioral tests with offline Roblox, filesystem, JSON and network doubles.
local transferSource = [=[-- TRANSFER_SOURCE]=]
local copyLoaderSource = [=[-- COPY_LOADER_SOURCE]=]
local pasteLoaderSource = [=[-- PASTE_LOADER_SOURCE]=]
local copyLocalLoaderSource = [=[-- COPY_LOCAL_LOADER_SOURCE]=]
local pasteLocalLoaderSource = [=[-- PASTE_LOCAL_LOADER_SOURCE]=]
print=function()end
local now, onWait = 0, nil
os.clock = function() return now end
task = {spawn = function(fn) fn() end, wait = function(dt) now = now + (dt or 0.01); if onWait then onWait() end end}
table.unpack = table.unpack or unpack
local vm = {}
local function v(x,y,z) return setmetatable({X=x or 0,Y=y or 0,Z=z or 0,_type="Vector3"},vm) end
vm.__index = function(a,k)
    if k == "Magnitude" then return math.sqrt(a.X*a.X+a.Y*a.Y+a.Z*a.Z) end
    if k == "Dot" then return function(a,b) return a.X*b.X+a.Y*b.Y+a.Z*b.Z end end
    if k == "Cross" then return function(a,b) return v(a.Y*b.Z-a.Z*b.Y,a.Z*b.X-a.X*b.Z,a.X*b.Y-a.Y*b.X) end end
end
vm.__add=function(a,b)return v(a.X+b.X,a.Y+b.Y,a.Z+b.Z)end
vm.__sub=function(a,b)return v(a.X-b.X,a.Y-b.Y,a.Z-b.Z)end
vm.__mul=function(a,b)return v(a.X*b,a.Y*b,a.Z*b)end
vm.__div=function(a,b)return v(a.X/b,a.Y/b,a.Z/b)end
Vector3={new=v}
local cm={}; cm.__index=cm
local function cf(x,y,z,r00,r01,r02,r10,r11,r12,r20,r21,r22)
    if type(x)=="table" then x,y,z=x.X,x.Y,x.Z end
    local a={X=x or 0,Y=y or 0,Z=z or 0,Position=v(x,y,z),RightVector=v(r00 or 1,r10 or 0,r20 or 0),UpVector=v(r01 or 0,r11 or 1,r21 or 0),LookVector=v(-(r02 or 0),-(r12 or 0),-(r22 or 1)),_type="CFrame"}
    return setmetatable(a,cm)
end
local function transform(a,b)return a.RightVector*b.X+a.UpVector*b.Y+a.LookVector*(-b.Z)end
cm.__mul=function(a,b)
    local p=a.Position+transform(a,b.Position);local r,u,l=transform(a,b.RightVector),transform(a,b.UpVector),transform(a,b.LookVector)
    return cf(p.X,p.Y,p.Z,r.X,u.X,-l.X,r.Y,u.Y,-l.Y,r.Z,u.Z,-l.Z)
end
function cm:GetComponents()local r,u,l=self.RightVector,self.UpVector,self.LookVector;return self.X,self.Y,self.Z,r.X,u.X,-l.X,r.Y,u.Y,-l.Y,r.Z,u.Z,-l.Z end
function cm:Inverse()
    local r,u,b=self.RightVector,self.UpVector,self.LookVector*(-1)
    return cf(-self.Position:Dot(r),-self.Position:Dot(u),-self.Position:Dot(b),r.X,r.Y,r.Z,u.X,u.Y,u.Z,b.X,b.Y,b.Z)
end
CFrame={new=cf}
local function rgb(r,g,b)return {R=r,G=g,B=b,_type="Color3"}end
Color3={new=rgb,fromRGB=function(r,g,b)return rgb(r/255,g/255,b/255)end}
typeof=function(a)return type(a)=="table" and a._type or type(a)end
local function e(name)return {Name=name,_type="EnumItem"}end
Enum={Material={Plastic=e("Plastic"),Asphalt=e("Asphalt"),Grass=e("Grass"),Concrete=e("Concrete")},PartType={Block=e("Block"),Ball=e("Ball")},Font={Gotham=e("Gotham"),GothamBold=e("GothamBold")},KeyCode={F8=e("F8")}}
UDim2={new=function(xs,xo,ys,yo)return {xScale=xs,xOffset=xo,yScale=ys,yOffset=yo}end,fromOffset=function(x,y)return {xScale=0,xOffset=x,yScale=0,yOffset=y}end}
local function signal()
    local s={listeners={}}
    function s:Connect(fn)local c={Connected=true,fn=fn};function c:Disconnect()self.Connected=false end;self.listeners[#self.listeners+1]=c;return c end
    function s:Fire(o)for _,c in ipairs(self.listeners)do if c.Connected then c.fn(o)end end end
    return s
end
local methods,im={},{}
im.__index=function(o,k)if k=="Position" then return o.props.CFrame.Position end;return methods[k] or o.props[k]end
im.__newindex=function(o,k,value)
    if k=="Parent" then
        local previous=o.props.Parent
        if previous then for i,c in ipairs(previous.children)do if c==o then table.remove(previous.children,i);break end end end
        o.props.Parent=value
        if value then value.children[#value.children+1]=o;value.ChildAdded:Fire(o)end
    else o.props[k]=value end
end
local function instance(class)
    return setmetatable({props={ClassName=class,Name=class,CFrame=cf(),Size=v(1,1,1),Shape=Enum.PartType.Block,Color=rgb(1,1,1),Material=Enum.Material.Plastic,MaterialVariant="",Transparency=0,Reflectance=0,CanCollide=true,Anchored=true,Scale=1,ChildAdded=signal(),Activated=signal()},children={},attributes={}},im)
end
function methods:IsA(class)return self.ClassName==class or class=="BasePart" and (self.ClassName=="Part" or self.ClassName=="MeshPart" or self.ClassName=="WedgePart" or self.ClassName=="CornerWedgePart")end
function methods:GetChildren()local out={};for _,c in ipairs(self.children)do out[#out+1]=c end;return out end
function methods:GetDescendants()local out={};for _,c in ipairs(self.children)do out[#out+1]=c;for _,d in ipairs(c:GetDescendants())do out[#out+1]=d end end;return out end
function methods:FindFirstChild(name,recursive)for _,c in ipairs(recursive and self:GetDescendants() or self.children)do if c.Name==name then return c end end end
function methods:FindFirstChildOfClass(class)for _,c in ipairs(self.children)do if c.ClassName==class then return c end end end
function methods:WaitForChild(name)return assert(self:FindFirstChild(name),name)end
function methods:GetAttribute(name)return self.attributes[name]end
function methods:GetPivot()local root=self:FindFirstChild("HumanoidRootPart");return root and root.CFrame or self.CFrame end
function methods:GetScale()return self.Scale end
function methods:GetBoundingBox()return self:GetPivot(),self.Size end
function methods:PivotTo(frame)local root=self:FindFirstChild("HumanoidRootPart");if root then root.CFrame=frame else self.CFrame=frame end end
function methods:Destroy()self.Parent=nil end
local function child(parent,class,name)local o=instance(class);o.Name=name;o.Parent=parent;return o end
Instance={new=instance}
local storage=instance("ReplicatedStorage")
workspace=instance("Workspace")
local builds=child(workspace,"Folder","EditableBuilds")
local player=instance("Player");player.UserId=1;player.attributes.BT_SubPermanent=true
local gui=child(player,"PlayerGui","PlayerGui");child(gui,"ScreenGui","AdvanceBuildTools")
player.Character=instance("Model")
local root=child(player.Character,"Part","HumanoidRootPart");root.CFrame=cf(0,5,0);root.Anchored=false
local humanoid=child(player.Character,"Humanoid","Humanoid");humanoid.Health=100
local templates=child(child(storage,"Folder","PlacementObject"),"Folder","Object")
local block=child(templates,"Part","guid-block")
local grass=child(templates,"Part","guid-grass");grass.Material=Enum.Material.Grass;grass.Color=rgb(0.2,0.6,0.1)
local building=child(templates,"Model","guid-building")
building.Size=v(8,8,8)
local wall=child(building,"Part","Wall");wall.CFrame=cf(0,1,0);wall.Size=v(8,2,8);wall.Color=rgb(0.8,0.2,0.2)
local roof=child(building,"Part","Roof");roof.CFrame=cf(0,3,0);roof.Size=v(8,2,8);roof.Color=rgb(0.2,0.2,0.8)
local entries={{name="Block",guid="guid-block"},{name="Grass",guid="guid-grass"},{name="Building",guid="guid-building"}}
local net=child(storage,"Folder","NetworkContainer")
local events=child(net,"Folder","RemoteEvents");local funcs=child(net,"Folder","RemoteFunctions")
local manifest=child(funcs,"RemoteFunction","GetCatalogManifest")
function manifest:InvokeServer()return entries end
local countOverride
local saver=child(funcs,"RemoteFunction","BuildSaver")
function saver:InvokeServer(action)assert(action=="GetPlacedAmount","Only read-only count queries allowed");return countOverride and countOverride() or #builds:GetChildren()end
local placement=child(events,"RemoteEvent","PlacementSystem")
local files,jsonStore,jsonSerial={}, {},0
local function clone(a)
    if type(a)~="table" then return a end
    local out={};for k,x in pairs(a)do out[k]=clone(x)end;return setmetatable(out,getmetatable(a))
end
local http={}
local jsonPadding=""
function http:JSONEncode(value)jsonSerial=jsonSerial+1;local token="JSON-"..jsonSerial..jsonPadding;jsonStore[token]=clone(value);return token end
function http:JSONDecode(raw)return clone(assert(jsonStore[raw],"Malformed JSON"))end
function http:GenerateGUID()jsonSerial=jsonSerial+1;return "backup-"..jsonSerial end
local failWrite
writefile=function(path,raw)assert(path~=failWrite,"Simulated disk failure");files[path]=raw end
readfile=function(path)return assert(files[path],"Missing file "..path)end
isfile=function(path)return files[path]~=nil end
local runService={enabled=true,calls={},Stepped=signal()}
function runService:Set3dRenderingEnabled(enabled)
    if self.failDisable and not enabled then error("3D control unavailable")end
    self.enabled=enabled;self.calls[#self.calls+1]=enabled
end
local lighting={GlobalShadows=true}
local inputs={InputBegan=signal()}
game={PlaceId=14005966837,JobId="source",GetService=function(_,name)if name=="Players"then return {LocalPlayer=player}elseif name=="ReplicatedStorage"then return storage elseif name=="HttpService"then return http elseif name=="RunService"then return runService elseif name=="Lighting"then return lighting elseif name=="UserInputService"then return inputs end;error(name)end}
local function duplicateTemplate(template,name,frame,size)
    local object=instance(template.ClassName)
    for k,value in pairs(template.props)do if k~="Parent" and k~="ChildAdded" and k~="Activated"then object[k]=clone(value)end end
    object.Name=name;object.CFrame=frame
    if object:IsA("Model")then object.Scale=size;object.Size=template.Size*size else object.Size=size end
    for _,p in ipairs(template:GetChildren())do
        local copy=instance(p.ClassName);for k,value in pairs(p.props)do if k~="Parent" and k~="ChildAdded" and k~="Activated"then copy[k]=clone(value)end end
        copy.CFrame=frame*cf(p.CFrame.X*size,p.CFrame.Y*size,p.CFrame.Z*size)
        copy.Size=p.Size*size;copy.Parent=object
    end
    return object
end
local sends,onSend,reject,appearanceDelay=0,nil,false,false
local lateObject
function placement:FireServer(name,frame,size,transparency,tint,material,variant,collide)
    sends=sends+1
    local template
    for _,entry in ipairs(entries)do if entry.name==name then template=templates:FindFirstChild(entry.guid)end end
    assert(template,"Unknown catalog")
    local object=duplicateTemplate(template,"instance-"..sends,frame,size)
    local all={object};for _,p in ipairs(object:GetDescendants())do all[#all+1]=p end
    for _,p in ipairs(all)do if p:IsA("BasePart")then
        p.Color=tint or p.Color;p.Material=material or p.Material;p.MaterialVariant=variant or p.MaterialVariant
        if transparency~=nil and p.Transparency<1 then p.Transparency=transparency end
        if collide~=nil then p.CanCollide=collide end
        p.Anchored=true
    end end
    lateObject=object
    if not reject then
        if appearanceDelay then
            local requested=object.Color;object.Color=rgb(1,0,1);object.Parent=builds
            local deadline=now+0.5
            onWait=function()if now>=deadline then object.Color=requested;onWait=nil end end
        else object.Parent=builds end
    end
    if onSend then onSend(object)end
end
local onStream
function methods:RequestStreamAroundAsync(position,timeout)assert(self==player and timeout==5);if onStream then onStream(position)end end
local function load()return assert(loadstring(transferSource,"transfer.lua"))("panel",{Headless=true,Config={PlacementTimeout=2,SettleTime=0.1}})end
local function clear()for _,o in ipairs(builds:GetChildren())do o.Parent=nil end end
local function backupDocument()
    return http:JSONDecode(http:JSONDecode(files["jakarta-build-backup.json"]).payload)
end
local function draftDocument()
    return http:JSONDecode(http:JSONDecode(files["jakarta-build-draft.json"]).payload)
end
local function rewriteBackup(document,path)
    -- Use the production sealing path by substituting an existing payload token.
    local payload=http:JSONEncode(document);local a,b=1,0
    for i=1,#payload do a=(a+payload:byte(i))%65521;b=(b+a)%65521 end
    files[path or "jakarta-build-backup.json"]=http:JSONEncode({format="jakarta-transfer-file-v1",payload=payload,bytes=#payload,checksum=string.format("%08x",b*65536+a)})
end
local checks=0
local function check(condition,message)assert(condition,message);checks=checks+1 end
local function fails(fn,match)local ok,reason=pcall(fn);check(not ok and tostring(reason):find(match,1,true),"Expected failure "..match..", got "..tostring(reason))end
-- Full source includes a resized grass plate, recolored track blocks, a mixed
-- color scaled catalog Model, and two truly coincident copies of a block.
local base=duplicateTemplate(grass,"guid-grass",cf(100,0,100),v(400,2,400));base.Parent=builds
local track=duplicateTemplate(block,"unknown-guid",cf(0,4,0),v(44,1,80));track.Color=rgb(0.25,0.26,0.27);track.Material=Enum.Material.Asphalt;track.MaterialVariant="Road";track.Parent=builds
local manual=duplicateTemplate(building,"guid-building",cf(40,6,10),2);manual.Parent=builds
for i=1,2 do duplicateTemplate(block,"guid-block",cf(10,10,10),v(4,4,4)).Parent=builds end
local sourceObjects=builds:GetChildren()
local api=load();api.Copy()
local document=backupDocument()
check(document.complete and #document.records==5,"Complete source backup")
check(sends==0,"Copy never places/deletes/saves")
local modelRecord
for _,record in ipairs(document.records)do if record.image.kind=="Model"then modelRecord=record end end
check(modelRecord and not modelRecord.overrides.color,"Mixed model colors preserve catalog defaults")
check(modelRecord.image.size==2,"Model scale preserved")
local verifiedBackup=files["jakarta-build-backup.json"]
-- A fresh destination already contains the exact original grass platform.
clear();game.JobId="friend";duplicateTemplate(grass,"different-guid",base.CFrame,base.Size).Parent=builds
workspace.StreamingEnabled=true
api.Paste()
check(#builds:GetChildren()==5 and sends==4,"Paste recreates four roots and reuses grass")
check(api.State=="pasted" and root.Anchored==false and root.CFrame.Y==5,"Paste completes and restores character")
local firstSends=sends;api.Paste()
check(sends==firstSends and #builds:GetChildren()==5,"Repeated paste preserves coincident multiplicity without duplicates")
-- Streaming can replace client Instance references, including identical roots.
local targetObjects=builds:GetChildren()
onStream=function()for _,o in ipairs(targetObjects)do if o.Parent==builds then o.Parent=nil;o.Parent=builds end end end
api=load();api.Paste();check(sends==firstSends,"Re-streamed instances do not cause duplicates")
onStream=nil
-- Complete prefix survives a pause and a script reload in the same server.
clear();game.JobId="friend-pause";files["jakarta-build-import-progress.json"]=nil
onSend=function()api.Pause()end;api=load();api.Paste();onSend=nil
check(#builds:GetChildren()==1 and api.State=="paused","Pause finishes current placement")
local pausedSends=sends;api=load();api.Paste()
check(#builds:GetChildren()==5 and sends-pausedSends==4,"Reload resumes without re-sending confirmed prefix")
-- Preflight checks the entire backup, before placing even its first object.
clear();game.JobId="friend-invalid";files["jakarta-build-import-progress.json"]=nil
local before=sends;player.attributes.BT_SubPermanent=false;fails(api.Paste,"Build Tools Plus")
check(sends==before,"Missing Plus causes zero placements");player.attributes.BT_SubPermanent=true
local savedName=entries[3].name;entries[3].name="Missing";fails(api.Paste,"Destination catalog item missing");entries[3].name=savedName
check(sends==before,"Missing model causes zero placements")
local invalid=clone(document);invalid.records[1].image.cf[1]=0/0;rewriteBackup(invalid);fails(api.Paste,"Invalid numeric value")
check(sends==before,"Malformed geometry causes zero placements");files["jakarta-build-backup.json"]=verifiedBackup
game.JobId="source";fails(api.Paste,"This is the source server");game.JobId="friend-invalid"
check(sends==before,"Source-server paste blocked")
-- Uncertain requests survive executor reload. They are reconciled, never
-- automatically retried, including a late successful response.
reject=true;api=load();fails(api.Paste,"unconfirmed")
check(root.Anchored==false and files["jakarta-build-import-progress.json"],"Unconfirmed request recorded and character restored")
local rejectedSends=sends;api=load();fails(api.Paste,"Previous placement is still unconfirmed")
check(sends==rejectedSends,"Unconfirmed request is never blindly resent")
lateObject.Parent=builds;reject=false;api=load();api.Paste()
check(#builds:GetChildren()==5 and sends-rejectedSends==4,"Late placement reconciled after reload")
-- Disk failure before send leaves the game untouched.
clear();game.JobId="friend-disk";files["jakarta-build-import-progress.json"]=nil
failWrite="jakarta-build-import-progress.json.tmp";before=sends;fails(api.Paste,"Simulated disk failure")
check(sends==before,"Cannot place without durable pending record");failWrite=nil
-- Delayed appearance replication is waited for rather than accepted early.
appearanceDelay=true;api=load();api.Paste();appearanceDelay=false
check(#builds:GetChildren()==5,"Delayed appearance confirmation succeeds")
-- Partial source model must be fully streamed before a completed backup.
clear();game.JobId="source-model-stream";workspace.StreamingEnabled=true
local partial=duplicateTemplate(building,"guid-building",cf(40,6,10),2)
local missing=partial:GetChildren()[2];missing.Parent=nil;partial.Parent=builds
onStream=function()missing.Parent=partial;onStream=nil end
api=load();api.Copy()
check(backupDocument().complete and #backupDocument().records[1].image.parts==2,"Partial Model completes only after all catalog parts stream")
check(files["jakarta-build-backup.json.previous"]==verifiedBackup,"Previous complete backup preserved")
-- Source count changes cannot overwrite the last completed backup.
local latest=files["jakarta-build-backup.json"];countOverride=function()return 2 end
api=load();onStream=function()countOverride=function()return 3 end;api.Pause()end
api.Copy();onStream=nil;fails(api.FinishCopy,"Source object count changed")
check(files["jakarta-build-backup.json"]==latest,"Count changes preserve complete backup")
check(not http:JSONDecode(http:JSONDecode(files["jakarta-build-draft.json"]).payload).complete,"Draft clearly marked incomplete")
countOverride=nil
-- Backup checksum failure is detected before placement.
game.JobId="friend-corrupt";local envelope=http:JSONDecode(latest);envelope.checksum="bad";files["jakarta-build-backup.json"]=http:JSONEncode(envelope)
before=sends;fails(api.Paste,"Backup is damaged/incomplete");check(sends==before,"Corrupted backup blocked")
files["jakarta-build-backup.json"]=latest
-- Resume a source scan after reloading the helper, including objects no longer
-- streamed. Coincident objects with distinct appearances remain separate.
clear();game.JobId="source-draft-resume";workspace.StreamingEnabled=true
local red=duplicateTemplate(block,"guid-block",cf(12,7,12),v(4,4,4));red.Color=rgb(1,0,0);red.Parent=builds
local blue=duplicateTemplate(block,"guid-block",cf(12,7,12),v(4,4,4));blue.Color=rgb(0,0,1)
countOverride=function()return 2 end
api=load();onStream=function()api.Pause();onStream=nil end;api.Copy()
check(api.State=="paused" and api.Report().captured==1,"Incomplete source draft persisted")
red.Parent=nil;blue.Parent=builds
api=load();api.Copy();local resumed=backupDocument()
check(resumed.complete and #resumed.records==2,"Reload resumes draft and accumulates separate streamed appearances")
check(not (resumed.records[1].image.parts[1].color[1]==resumed.records[2].image.parts[1].color[1]),"Coincident colors remain distinct")
countOverride=nil;clear();game.JobId="friend-coincident-colors";api=load();before=sends;api.Paste()
check(sends==before+2 and #builds:GetChildren()==2,"Different coincident appearances both recreated")
-- Unchanged catalog defaults need no Plus subscription or redundant overrides.
clear();game.JobId="source-defaults";workspace.StreamingEnabled=false
duplicateTemplate(block,"guid-block",cf(2,5,2),v(4,4,4)).Parent=builds
player.attributes.BT_SubPermanent=false;api=load();api.Copy()
local defaults=backupDocument();check(next(defaults.records[1].overrides)==nil,"Default Part has no appearance overrides")
clear();game.JobId="friend-defaults";api=load();before=sends;api.Paste()
check(sends==before+1 and api.State=="pasted","Default catalog Part transfers without Plus")
-- Reproduce the live slowdown: GUID-named Parts against hundreds of catalog
-- entries. Nested containers keep the Part cache disabled, so
-- this checks the catalog lookup itself rather than relying on cache hits.
local extraTemplates={}
for i=1,400 do
    local template=child(templates,"Part","extra-guid-"..i);extraTemplates[#extraTemplates+1]=template
    entries[#entries+1]={name="Extra catalog item "..i,guid=template.Name,plus=i%2==0}
end
local premium=child(templates,"Part","premium-guid");entries[#entries+1]={name="AAA Premium block",guid=premium.Name,plus=true}
clear();game.JobId="source-catalog-speed";workspace.StreamingEnabled=false
for i=1,128 do
    local p=duplicateTemplate(block,"unknown-guid-"..i,cf(i*3,5,5),v(2,2,2));child(p,"Folder","RuntimeContainer");p.Parent=builds
end
api=load();api.Scan()
check(api.Metrics.samples==256 and api.Metrics.cacheHits==0,"Catalog regression resamples roots with runtime children")
check(api.Metrics.catalogChecks<=api.Metrics.samples+4,"Unknown blocks use constant verified catalog lookup across 400 entries")
check(api.Metrics.yields<200,"Catalog lookup avoids hundreds of frame waits per object")
api.FinishCopy();local fast=backupDocument()
check(fast.complete and #fast.records==128 and fast.records[1].catalogName=="Block","Fast lookup chooses equivalent standard catalog template")
for i=1,401 do table.remove(entries)end;premium.Parent=nil
for _,template in ipairs(extraTemplates)do template.Parent=nil end
-- A missing explicit mapping cannot fall back silently to the object's name.
game.JobId="source-missing-map";clear();duplicateTemplate(block,"guid-block",cf(),v(4,4,4)).Parent=builds
api=load();api.Config.CatalogMap["guid-block"]="Missing";before=files["jakarta-build-backup.json"]
local streamedAreas=0;workspace.StreamingEnabled=true;onStream=function()streamedAreas=streamedAreas+1 end
fails(api.Copy,"unresolved")
onStream=nil;workspace.StreamingEnabled=false
check(streamedAreas==1,"Fully captured unresolved build stops after targeted recheck")
check(files["jakarta-build-backup.json"]==before and api.Report().unresolved==1,"Bad catalog mapping preserves last complete backup")
-- Model transparency inference ignores fully invisible helper parts.
local hidden=child(building,"Part","Invisible");hidden.Size=v(1,1,1);hidden.Transparency=1
clear();game.JobId="source-model-opacity";player.attributes.BT_SubPermanent=true
local tinted=duplicateTemplate(building,"guid-building",cf(10,5,10),1)
for _,p in ipairs(tinted:GetChildren())do if p.Transparency<1 then p.Transparency=0.4 end end;tinted.Parent=builds
api=load();api.Copy();local opacity=backupDocument()
check(opacity.records[1].overrides.transparency==0.4,"Model opacity recovered with invisible first Part")
clear();game.JobId="friend-model-opacity";api=load();api.Paste()
check(api.State=="pasted" and #builds:GetChildren()==1,"Model opacity and invisible helper preserved")
-- Large source scans sample unchanged plain Parts once, yield between batches,
-- and still detect later edits. Models continue to be sampled without caching.
clear();game.JobId="source-responsiveness";workspace.StreamingEnabled=false
local population={}
for i=1,96 do local p=duplicateTemplate(block,"guid-block",cf(i*5,5,5),v(4,4,4));p.Parent=builds;population[i]=p end
api=load();api.Scan()
check(api.Metrics.samples==96 and api.Metrics.cacheHits>=96,"Plain Parts reused across nearby scans")
check(api.Metrics.yields>0,"Large source scan yields to Roblox input")
population[1].Color=rgb(0.5,0.25,0.75);local sampled=api.Metrics.samples;api.Scan()
check(api.Metrics.samples==sampled+1,"Edited Part invalidates cached snapshot")
before=files["jakarta-build-backup.json"];api=load()
onWait=function()if api.Metrics.samples>=16 then api.Pause();onWait=nil end end
api.NewCopy()
check(api.State=="paused" and not api.Busy and api.Report().captured<96,"Pause interrupts a large scan between batches")
check(files["jakarta-build-backup.json"]==before,"Interrupted copy preserves last completed backup")
check(runService.enabled and lighting.GlobalShadows and not api.FpsActive,"Pause restores rendering and shadows")
api=load();api.Copy()
check(backupDocument().complete and #backupDocument().records==96,"Interrupted scan resumes without omissions")
check(backupDocument().records[1] and runService.enabled and not api.FpsActive,"Completed copy restores 3D drawing")
-- Checksum work also yields; long payloads keep the original envelope checksum
-- and read-back validation even though redundant verification passes are removed.
clear();game.JobId="source-long-payload";duplicateTemplate(block,"guid-block",cf(),v(4,4,4)).Parent=builds
api=load();jsonPadding=string.rep("x",200000);local checksumYields=0
onWait=function()if api.Busy and files["jakarta-build-draft.json.tmp"] then checksumYields=checksumYields+1 end end
api.Copy();jsonPadding="";onWait=nil
check(checksumYields>0 and backupDocument().complete,"Large file checksums yield and verify correctly")
-- FPS mode controls only the local renderer/shadows; source appearance survives.
clear();game.JobId="source-fps-toggle";local unchanged=duplicateTemplate(block,"guid-block",cf(),v(4,4,4));unchanged.Color=rgb(0.2,0.3,0.4);unchanged.Parent=builds
api=load();local toggled=false
onWait=function()if api.Busy and not toggled then
    toggled=true
    check(not runService.enabled and not lighting.GlobalShadows,"FPS mode hides 3D drawing during capture")
    api.SetFPS(false);check(runService.enabled and lighting.GlobalShadows,"FPS toggle restores drawing while running")
    api.SetFPS(true);check(not runService.enabled,"FPS toggle can enable drawing reduction again")
end end
api.Copy();onWait=nil
check(toggled and backupDocument().records[1].image.parts[1].color[2]==0.3,"FPS mode leaves backup appearance intact")
check(runService.enabled and lighting.GlobalShadows,"Normal completion restores local settings")
-- A runtime that rejects 3D control can still complete a transfer.
game.JobId="source-fps-fallback";runService.failDisable=true;api=load();api.Copy();runService.failDisable=false
check(api.State=="copied" and runService.enabled and lighting.GlobalShadows,"Unavailable 3D control does not stop copy")
game.JobId="friend-fps-error";clear();files["jakarta-build-import-progress.json"]=nil;reject=true;api=load()
fails(api.Paste,"unconfirmed");reject=false
check(runService.enabled and lighting.GlobalShadows and not api.FpsActive,"Placement failure restores FPS settings")
-- Exercise the actual panel button and F8 pause connection, including cleanup.
game.JobId="source-panel";api=assert(loadstring(transferSource))("panel",{Config={PlacementTimeout=2,SettleTime=0.1}})
local panelScreen=gui:FindFirstChild("JakartaTransferPanel")
local panel=panelScreen:FindFirstChildOfClass("Frame");local fpsControl
for _,item in ipairs(panel:GetChildren())do if item.Text=="FPS mode: ON"then fpsControl=item end end
local keyboardPaused=false
onWait=function()if api.Busy and not keyboardPaused then keyboardPaused=true;inputs.InputBegan:Fire({KeyCode=Enum.KeyCode.F8})end end
api.NewCopy();onWait=nil
check(keyboardPaused and api.State=="paused" and runService.enabled,"F8 can pause capture and restore drawing")
fpsControl.Activated:Fire();check(api.Config.FpsMode==false,"Panel FPS button remains callable after pause")
api.Dispose();api.Paused=false;inputs.InputBegan:Fire({KeyCode=Enum.KeyCode.F8})
check(not api.Paused and not gui:FindFirstChild("JakartaTransferPanel"),"Dispose removes panel and pause hotkey")
-- Focused scans preserve accumulated objects and revisit nearby regions at a
-- finer spacing, ahead of a remote terrain footprint. Focus survives reload.
clear();game.JobId="source-focus";workspace.StreamingEnabled=true;root.CFrame=cf(0,5,0)
local known=duplicateTemplate(block,"guid-block",cf(3000,5,3000),v(400,2,400));known.Parent=builds
local missingNearby=duplicateTemplate(block,"guid-block",cf(192,5,192),v(4,4,4))
countOverride=function()return 2 end;api=load();api.Scan();local capturedBefore=api.Report().captured
root.CFrame=cf(192,5,192);local focusPoints=api.FocusHere(128)
check(focusPoints>0 and api.Report().captured==capturedBefore,"Focus keeps the existing draft records")
local focusDraft=http:JSONDecode(http:JSONDecode(files["jakarta-build-draft.json"]).payload)
check(focusDraft.scan.focus[1]==192 and focusDraft.scan.queue[#focusDraft.scan.queue].fine,"Fine scan points persisted alongside old queue")
local passiveLimb=child(player.Character,"Part","PassiveLimb");passiveLimb.CanCollide=false
local newLimb,firstFocusedPosition
api=load();onStream=function(position)
    firstFocusedPosition=position
    check((position-missingNearby.Position).Magnitude<=64,"Fine scan reaches nearby objects missed by coarse grid")
    check(api.NoClipActive and root.CanCollide==false and root.Anchored,"Transfer disables character collision while moving")
    newLimb=child(player.Character,"Part","NewLimb")
    root.CanCollide=true;runService.Stepped:Fire()
    check(root.CanCollide==false and newLimb.CanCollide==false,"Noclip handles collision resets and new character parts")
    check(known.CanCollide==true,"Noclip leaves build collision intact")
    missingNearby.Parent=builds;api.Pause();onStream=nil
end
api.Copy()
check(firstFocusedPosition and api.State=="paused" and api.Report().focus[1]==192,"Focused priority survives helper reload")
check(root.CanCollide==true and passiveLimb.CanCollide==false and newLimb.CanCollide==true and not api.NoClipActive,"Pause restores every original character collision value")
root.CanCollide=true;runService.Stepped:Fire();check(root.CanCollide==true,"Pause disconnects noclip enforcement")
api=load();api.Copy();countOverride=nil
check(api.State=="copied" and #backupDocument().records==2,"Focused resume captures missing objects without losing distant ones")
check(root.CanCollide and newLimb.CanCollide and not api.NoClipActive,"Completion restores character collision")
passiveLimb.Parent=nil;newLimb.Parent=nil
-- Automatically fill gaps around small track parts at both crossover heights.
-- A tiny object near a 192-stud cell corner can be outside a 64-stud stream
-- radius from every coarse centre, but is reached by the fine stencil.
clear();game.JobId="source-fine-track";workspace.StreamingEnabled=true;root.CFrame=cf(0,5,0)
duplicateTemplate(block,"guid-block",cf(128,0,128),v(44,1,40)).Parent=builds
duplicateTemplate(block,"guid-block",cf(128,128,128),v(44,1,40)).Parent=builds
local gapObject=duplicateTemplate(block,"guid-block",cf(192,128,192),v(2,2,2))
countOverride=function()return 3 end;local foundFineGap=false;local fineVisits=0
onStream=function(position)
    fineVisits=fineVisits+1
    if (position-gapObject.Position).Magnitude<=64 then gapObject.Parent=builds;foundFineGap=true;onStream=nil end
end
api=load();api.Copy();countOverride=nil;onStream=nil
check(foundFineGap and fineVisits<=18 and api.State=="copied","Automatic fine points capture gaps at the correct height")
check(#backupDocument().records==3,"Fine track scan preserves authoritative object count")
-- Noclip can be disabled and error cleanup restores collision too.
clear();game.JobId="source-no-noclip";duplicateTemplate(block,"guid-block",cf(),v(4,4,4)).Parent=builds
countOverride=function()return 2 end;api=load();api.Config.NoClip=false;local sawNoClipOff=false
onStream=function()sawNoClipOff=root.CanCollide and not api.NoClipActive;api.Pause();onStream=nil end
api.Copy();countOverride=nil
check(sawNoClipOff and root.CanCollide,"NoClip=false leaves character collision enabled")
game.JobId="friend-noclip-error";clear();files["jakarta-build-import-progress.json"]=nil;reject=true;api=load()
fails(api.Paste,"unconfirmed");reject=false
check(root.CanCollide and not api.NoClipActive,"Failed placement restores character collision")
-- Harmless leaf metadata can be cached; mesh identity changes invalidate it.
clear();game.JobId="source-extended-cache";workspace.StreamingEnabled=false
local wedgeTemplate=child(templates,"WedgePart","guid-wedge")
local meshTemplate=child(templates,"MeshPart","guid-mesh");meshTemplate.MeshId="rbxassetid://123";meshTemplate.TextureID="rbxassetid://456"
local meshTemplateNew=child(templates,"MeshPart","guid-mesh-new");meshTemplateNew.MeshId=meshTemplate.MeshId;meshTemplateNew.TextureID="rbxassetid://789"
entries[#entries+1]={name="Catalog wedge",guid=wedgeTemplate.Name}
entries[#entries+1]={name="Catalog mesh",guid=meshTemplate.Name}
entries[#entries+1]={name="Catalog mesh new",guid=meshTemplateNew.Name}
local w=duplicateTemplate(wedgeTemplate,"unknown-wedge",cf(10,5,0),v(4,4,4));child(w,"BoolValue","Placed");w.Parent=builds
local m=duplicateTemplate(meshTemplate,"unknown-mesh",cf(20,5,0),v(4,4,4));child(m,"StringValue","Owner");m.Parent=builds
api=load();api.Scan()
check(api.Metrics.samples==2 and api.Metrics.cacheHits==2,"Mesh/wedge roots with leaf metadata reuse verified snapshots")
local meshSamples=api.Metrics.samples;m.TextureID=meshTemplateNew.TextureID;api.Scan()
check(api.Metrics.samples==meshSamples+1,"Mesh texture change invalidates cached geometry")
api.NewCopy();local nativeBackup=backupDocument()
check(nativeBackup.complete and #nativeBackup.records==2,"Unknown wedges and meshes resolve to exact catalog geometry")
local capturedMesh
for _,record in ipairs(nativeBackup.records)do if record.image.class=="MeshPart"then capturedMesh=record.image.parts[1].mesh end end
check(capturedMesh and capturedMesh:find("789",1,true),"Changed mesh texture preserved in fresh capture")
local ownerMarker=m:FindFirstChild("Owner");child(ownerMarker,"Part","NestedGeometry")
local beforeNested=api.Metrics.samples;api.Scan()
check(api.Metrics.samples==beforeNested+1,"New geometry beneath a metadata leaf invalidates the cache")
fails(api.NewCopy,"unresolved")
local detailed=api.Report().examples[1]
check(detailed.class=="MeshPart" and detailed.position[1]==20 and detailed.reason~="Unrecognized catalog item","Unresolved report preserves class, position and specific failure")
for i=1,3 do table.remove(entries)end;wedgeTemplate.Parent=nil;meshTemplate.Parent=nil;meshTemplateNew.Parent=nil
-- Grass/foundation slabs belong in the backup without turning the default
-- route into a sweep of their entire area. Bounds mode remains opt-in.
clear();game.JobId="source-track-grass";workspace.StreamingEnabled=true;root.CFrame=cf(0,5,0)
local wideGrass=duplicateTemplate(grass,"guid-grass",cf(),v(2048,2,2048));wideGrass.Parent=builds
countOverride=function()return 2 end;api=load();api.Scan()
check(api.Config.ScanMode=="track" and api.Report().captured==1,"Default track mode captures wide grass")
local grassDraft=draftDocument()
check(#grassDraft.scan.queue==1 and grassDraft.scan.queue[1].route,"Wide grass adds no automatic terrain sweep")
local grassVisits=0
onStream=function(position)grassVisits=grassVisits+1;assert(position.X==0 and position.Z==0,"Grass scan left the route anchor")end
fails(api.Copy,"Backup is incomplete");onStream=nil
check(grassVisits==1 and api.State=="stopped","Exhausted track route reports missing objects instead of claiming completion")
game.JobId="source-bounds-grass";api=load();api.Config.ScanMode="bounds";api.Scan()
local broadDraft=draftDocument();local reachesWideBounds=false
for _,tile in ipairs(broadDraft.scan.queue)do
    if not tile.fine and math.abs((tile.x+0.5)*broadDraft.scan.step)>900 then reachesWideBounds=true end
end
check(reachesWideBounds and #broadDraft.scan.queue>100,"Explicit bounds mode retains wide terrain scanning")
countOverride=nil
-- A long diagonal road needs points near both ends, without filling the empty
-- corners of its axis-aligned bounding rectangle.
clear();game.JobId="source-diagonal-track";local diagonal=math.sqrt(0.5)
local diagonalFrame=cf(0,0,0,diagonal,0,diagonal,0,1,0,-diagonal,0,diagonal)
duplicateTemplate(block,"guid-block",diagonalFrame,v(32,2,1024)).Parent=builds
countOverride=function()return 2 end;api=load();api.Scan()
local diagonalDraft=draftDocument();local diagonalPoints,nearEnds,withinRoad=0,false,true
for _,tile in ipairs(diagonalDraft.scan.queue)do if tile.fine then
    diagonalPoints=diagonalPoints+1
    local localPoint=(diagonalFrame:Inverse()*cf(tile.px,tile.y,tile.pz)).Position
    withinRoad=withinRoad and math.abs(localPoint.X)<=80 and math.abs(localPoint.Z)<=576
    nearEnds=nearEnds or math.abs(localPoint.Z)>=448
end end
check(withinRoad and diagonalPoints>20 and diagonalPoints<100,"Diagonal route stays close to the road footprint")
check(nearEnds,"Long track parts seed scan points near their ends")
countOverride=nil
-- Model footprints use the actual scaled child geometry and rotated pivot.
clear();game.JobId="source-scaled-track-model"
local hallTemplate=child(templates,"Model","guid-long-hall");hallTemplate.Size=v(200,10,16)
local hallPart=child(hallTemplate,"Part","Hall");hallPart.CFrame=cf(96,0,0);hallPart.Size=v(200,10,16)
entries[#entries+1]={name="Long hall",guid=hallTemplate.Name}
local hall=duplicateTemplate(hallTemplate,"guid-long-hall",cf(1000,0,1000)*diagonalFrame,3);hall.Parent=builds
countOverride=function()return 2 end;api=load();api.Scan()
local hallDraft=draftDocument();local reachesScaledEnd,withinHall=false,true
for _,tile in ipairs(hallDraft.scan.queue)do if tile.fine then
    local localPoint=(hall:GetPivot():Inverse()*cf(tile.px,tile.y,tile.pz)).Position
    reachesScaledEnd=reachesScaledEnd or localPoint.X>500
    withinHall=withinHall and math.abs(localPoint.Z)<=88
end end
check(reachesScaledEnd and withinHall,"Rotated Model route reaches scaled child footprints")
table.remove(entries);hallTemplate.Parent=nil;countOverride=nil
-- Connected road pieces stream one section at a time around a bend. Captured
-- records survive when earlier sections stream out; a pit building is reached.
clear();game.JobId="source-connected-track";root.CFrame=cf(0,5,0)
wideGrass.Parent=builds
local routeObjects={
    duplicateTemplate(block,"road-straight",cf(0,0,0),v(200,1,32)),
    duplicateTemplate(block,"road-snake-1",cf(192,0,0),v(200,1,32)),
    duplicateTemplate(block,"road-snake-2",cf(384,0,0),v(200,1,32)),
    duplicateTemplate(block,"road-degner-1",cf(384,0,96),v(32,1,200)),
    duplicateTemplate(block,"road-degner-2",cf(384,0,288),v(32,1,200)),
    duplicateTemplate(building,"guid-building",cf(384,0,384),2),
}
routeObjects[1].Parent=builds
local discovered={[1]=true};local discoveryOrder={1};local connectedVisits=0
countOverride=function()return #routeObjects+1 end
onStream=function(position)
    connectedVisits=connectedVisits+1
    for i,object in ipairs(routeObjects)do
        if (position-object:GetPivot().Position).Magnitude<=100 then
            object.Parent=builds
            if not discovered[i]then discovered[i]=true;discoveryOrder[#discoveryOrder+1]=i end
        else object.Parent=nil end
    end
end
api=load();api.Copy();onStream=nil;countOverride=nil
check(api.State=="copied" and #backupDocument().records==7,"Track route discovers successive streamed sections and a nearby building")
check(#discoveryOrder==6 and discoveryOrder[2]==2 and discoveryOrder[3]==3 and discoveryOrder[4]==4,"Connected scan advances around the bend")
check(connectedVisits<100 and api.Report().tilesQueued<200,"Connected track scan finishes without a grass sweep")
-- Use the last visited area to choose the next point, including after reload.
-- A fixed starting-point distance would instead jump back toward the origin.
clear();game.JobId="source-track-last-visit";wideGrass.Parent=builds
countOverride=function()return 2 end;api=load();api.Scan()
local lastVisitDraft=draftDocument()
lastVisitDraft.scan.focus={0,0,0};lastVisitDraft.scan.lastVisit={1000,0,0}
lastVisitDraft.scan.queue={
    {x=0,z=0,y=0,px=100,pz=0,fine=true,key="fine:test:origin"},
    {x=5,z=0,y=0,px=1000,pz=0,fine=true,key="fine:test:near"},
    {x=5,z=0,y=0,px=1100,pz=0,fine=true,key="fine:test:next"},
}
lastVisitDraft.scan.nextTile=1;rewriteBackup(lastVisitDraft,"jakarta-build-draft.json")
local lastPositions={};api=load()
onStream=function(position)lastPositions[#lastPositions+1]=position.X;if #lastPositions==2 then api.Pause()end end
api.Copy();onStream=nil;countOverride=nil
check(lastPositions[1]==1000 and lastPositions[2]==1100,"Traversal continues from the last visited point after reload")
check(draftDocument().scan.lastVisit[1]==1100,"Pause persists the most recent scan position")
-- Migrate a legacy draft: retain its visited prefix, fine/focus/route points,
-- and captured objects even when none of those objects are currently streamed.
clear();game.JobId="source-track-migrate";wideGrass.Parent=builds
local distantRoad=duplicateTemplate(block,"guid-block",cf(3000,5,3000),v(32,1,200));distantRoad.Parent=builds
countOverride=function()return 3 end;api=load();api.Config.ScanMode="bounds";api.Scan()
local legacyDraft=draftDocument();local preservedKey=legacyDraft.records[1].sourceKey
legacyDraft.scan.mode=nil;legacyDraft.scan.lastVisit=nil;legacyDraft.scan.focus={128,5,128};legacyDraft.scan.nextTile=3
legacyDraft.scan.queue={
    {x=-10,z=-10,y=5}, {x=-9,z=-10,y=5},
    {x=100,z=100,y=0},
    {x=26,z=26,y=5,px=5000,pz=5000,fine=true,key="fine:legacy:auto"},
    {x=0,z=0,y=5,px=128,pz=128,fine=true,focused=true,key="fine:legacy:focus"},
    {x=10,z=10,y=5,px=2000,pz=2000,route=true},
}
rewriteBackup(legacyDraft,"jakarta-build-draft.json");clear();api=load();api.Scan()
local migrated=draftDocument();local keptOldFine,keptFocus,keptRoute,newTrack=false,false,false,false
for _,tile in ipairs(migrated.scan.queue)do
    keptOldFine=keptOldFine or tile.key=="fine:legacy:auto"
    keptFocus=keptFocus or tile.key=="fine:legacy:focus" and tile.focused
    keptRoute=keptRoute or tile.route and tile.px==2000
    newTrack=newTrack or tile.track==true
end
check(api.Report().removedBounds==1 and migrated.scan.mode=="track","Migration removes only pending broad scan points")
check(migrated.scan.nextTile==3 and migrated.scan.queue[1].x==-10 and migrated.scan.queue[2].x==-9,"Migration preserves the visited prefix and resume index")
check(keptOldFine and keptFocus and keptRoute and newTrack,"Migration keeps focus/fine/route points and reseeds saved track geometry")
check(#migrated.records==2 and migrated.records[1].sourceKey==preservedKey,"Migration preserves captured objects after streaming out")
local migrationVisit
onStream=function(position)
    migrationVisit=position
    duplicateTemplate(block,"guid-block",cf(128,5,128),v(4,4,4)).Parent=builds;onStream=nil
end
api.Copy();countOverride=nil
check(migrationVisit.X==128 and migrationVisit.Z==128 and api.State=="copied","Migrated manual focus retains priority")
check(#backupDocument().records==3,"Migrated capture completes with all old and newly discovered objects")
-- Loader URLs and execution modes actually select the correct entry point.
local requestedModes={}
function game:HttpGet(url)check(url=="https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/suzuka/build-transfer/transfer.lua","Loader URL");return "return function() end" end
local originalLoad=loadstring
loadstring=function(source)if source=="return function() end"then return function(mode)requestedModes[#requestedModes+1]=mode end else return originalLoad(source)end end
originalLoad(copyLoaderSource)();originalLoad(pasteLoaderSource)()
check(requestedModes[1]=="copy" and requestedModes[2]=="paste","Separate loader modes")
readfile=function(path)check(path=="JakartaTransfer/transfer.lua","Local loader path");return "return function() end"end
originalLoad(copyLocalLoaderSource)();originalLoad(pasteLocalLoaderSource)()
check(requestedModes[3]=="copy" and requestedModes[4]=="paste","Local loaders select correct modes")
loadstring=originalLoad
return "Jakarta Transfer: "..checks.." behavioral checks passed (offline mocks; live Roblox save/reload not exercised)."
