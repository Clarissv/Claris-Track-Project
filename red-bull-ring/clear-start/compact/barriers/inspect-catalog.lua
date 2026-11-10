-- Read-only Jakarta barrier inspector. Open Build Tools, aim at a sample and press I.
-- Reports catalog/template/material assets; never places, edits or saves game objects.
local Players=game:GetService("Players")
local Storage=game:GetService("ReplicatedStorage")
local Http=game:GetService("HttpService")
local Input=game:GetService("UserInputService")
local player=Players.LocalPlayer
assert(game:GetService("RunService"):IsClient(),"Run this inspector on the client")
assert(game.PlaceId==14005966837,"Join Jakarta first")
if _G.RedBullRingBarrierInspector then _G.RedBullRingBarrierInspector.Unload() end
local api={}
_G.RedBullRingBarrierInspector=api
local entries,connection,scanning
local function property(object,key)
    local ok,value=pcall(function() return object[key] end)
    if ok then return value end
end
local function parts(root)
    local out={}
    if root:IsA("BasePart") then out[1]=root end
    for _,object in ipairs(root:GetDescendants()) do if object:IsA("BasePart") then out[#out+1]=object end end
    return out
end
local function record(part)
    local assets={}
    if part:IsA("MeshPart") then assets[#assets+1]={class="MeshPart",meshId=part.MeshId,textureId=part.TextureID} end
    for _,object in ipairs(part:GetDescendants()) do
        if object:IsA("DataModelMesh") then assets[#assets+1]={class=object.ClassName,meshId=property(object,"MeshId"),textureId=property(object,"TextureId"),meshType=tostring(property(object,"MeshType"))}
        elseif object:IsA("Texture") or object:IsA("Decal") then assets[#assets+1]={class=object.ClassName,texture=object.Texture,face=tostring(object.Face),studsPerTileU=property(object,"StudsPerTileU"),studsPerTileV=property(object,"StudsPerTileV")}
        elseif object:IsA("SurfaceAppearance") then assets[#assets+1]={class=object.ClassName,colorMap=object.ColorMap,normalMap=object.NormalMap,roughnessMap=object.RoughnessMap,metalnessMap=object.MetalnessMap} end
    end
    return {name=part.Name,class=part.ClassName,shape=part:IsA("Part") and tostring(part.Shape) or nil,
        size={part.Size.X,part.Size.Y,part.Size.Z},material=part.Material.Name,materialVariant=part.MaterialVariant or "",
        color={math.floor(part.Color.R*255+.5),math.floor(part.Color.G*255+.5),math.floor(part.Color.B*255+.5)},canCollide=part.CanCollide,assets=assets}
end
local function assetKey(p)
    local list={}
    for _,a in ipairs(p.assets) do list[#list+1]=table.concat({a.class,a.meshId or "",a.textureId or "",a.texture or "",a.face or "",a.colorMap or "",a.normalMap or "",a.roughnessMap or "",a.metalnessMap or ""},"|") end
    table.sort(list)
    return table.concat(list,"\n")
end
local function line(message) print("[Barrier inspector] "..message) end
function api.Scan()
    if entries then return entries end
    assert(not scanning,"Catalog query is already running")
    local network=Storage:FindFirstChild("NetworkContainer")
    local functions=network and network:FindFirstChild("RemoteFunctions")
    local endpoint=functions and functions:FindFirstChild("GetCatalogManifest")
    assert(endpoint and endpoint:IsA("RemoteFunction"),"Open Build Tools first; GetCatalogManifest is missing")
    local folder=Storage:FindFirstChild("PlacementObject")
    folder=folder and folder:FindFirstChild("Object")
    assert(folder,"Open Build Tools first; catalog templates are missing")
    local done,ok,result=false,false,nil
    scanning=true
    task.spawn(function() ok,result=pcall(function() return endpoint:InvokeServer() end);done=true end)
    local deadline=os.clock()+12
    while not done and os.clock()<deadline do task.wait(.05) end
    assert(done and ok and type(result)=="table","Catalog query failed or timed out; reload inspector before trying again")
    local out={}
    for _,entry in ipairs(result) do if type(entry)=="table" and type(entry.name)=="string" and type(entry.guid)=="string" then
        local template=folder:FindFirstChild(entry.guid,true)
        local item={name=entry.name,guid=entry.guid,category=entry.category,plus=entry.plus==true,parts={}}
        if template then item.templateClass=template.ClassName;for _,part in ipairs(parts(template)) do item.parts[#item.parts+1]=record(part) end end
        out[#out+1]=item
    end end
    table.sort(out,function(a,b) return a.name<b.name end)
    entries,scanning=out,false
    api.Catalog=out
    return out
end
function api.Inspect(target)
    assert(typeof(target)=="Instance" and target:IsA("BasePart"),"Aim at the steel or striped-concrete sample and press I")
    local catalog,targetRecord=api.Scan(),record(target)
    local buildRoot=target
    local folder=workspace:FindFirstChild("EditableBuilds")
    if folder and target:IsDescendantOf(folder) then while buildRoot.Parent~=folder do buildRoot=buildRoot.Parent end end
    local named={}
    for _,object in ipairs({target,buildRoot}) do
        named[object.Name]=true
        for _,value in pairs(object:GetAttributes()) do if type(value)=="string" then named[value]=true end end
    end
    local candidates={}
    for _,entry in ipairs(catalog) do
        local reason
        if named[entry.name] or named[entry.guid] then reason="catalog name/GUID on sample"
        else for _,p in ipairs(entry.parts) do
            if p.class==targetRecord.class and p.shape==targetRecord.shape then
                if #targetRecord.assets>0 and assetKey(p)==assetKey(targetRecord) then reason="matching mesh/texture assets"
                elseif targetRecord.materialVariant~="" and p.material==targetRecord.material and p.materialVariant==targetRecord.materialVariant then reason="matching material variant"
                end
            end
        end end
        if reason then candidates[#candidates+1]={name=entry.name,guid=entry.guid,category=entry.category,plus=entry.plus,reason=reason,templateClass=entry.templateClass,parts=entry.parts} end
    end
    local report={format="red-bull-ring-barrier-inspection-v1",placeId=game.PlaceId,targetPath=target:GetFullName(),target=targetRecord,candidates=candidates}
    api.LastReport=report
    line("SAMPLE: "..report.targetPath)
    line("Material="..targetRecord.material.." | MaterialVariant="..(targetRecord.materialVariant~="" and targetRecord.materialVariant or "(empty)").." | Class="..targetRecord.class)
    line("Catalog matches: "..#candidates..(#candidates==1 and " (one candidate; verify its template appearance)" or " (ambiguous; no catalog name guessed)"))
    for _,entry in ipairs(candidates) do line("Catalog="..entry.name.." | Category="..tostring(entry.category).." | GUID="..entry.guid.." | "..entry.reason) end
    local json=Http:JSONEncode(report)
    line("REPORT JSON: "..json)
    if type(writefile)=="function" then local ok,err=pcall(writefile,"red-bull-ring-barrier-inspection.json",json);line(ok and "Exported red-bull-ring-barrier-inspection.json" or "Export unavailable: "..tostring(err)) end
    return report
end
function api.List(filter)
    filter=string.lower(filter or "others")
    for _,entry in ipairs(api.Scan()) do if string.find(string.lower(entry.name),filter,1,true) or string.find(string.lower(tostring(entry.category)),filter,1,true) then
        for _,p in ipairs(entry.parts) do line("CATALOG: "..entry.name.." | Material="..p.material.." | Variant="..p.materialVariant.." | Class="..p.class.." | Assets="..#p.assets) end
    end end
end
function api.Unload() if connection then connection:Disconnect() end;_G.RedBullRingBarrierInspector=nil end
connection=Input.InputBegan:Connect(function(input,processed)
    if processed or Input:GetFocusedTextBox() or input.KeyCode~=Enum.KeyCode.I then return end
    local ok,err=pcall(api.Inspect,player:GetMouse().Target)
    if not ok then line(tostring(err)) end
end)
line("Ready. Aim at the steel sample and press I, then repeat for striped concrete. Paste the SAMPLE / Material / Catalog lines back into the chat.")
line("If a sample cannot be identified, run _G.RedBullRingBarrierInspector.List() to list the Others catalog.")
return api
