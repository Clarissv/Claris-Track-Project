-- Read-only Jakarta barrier inspector. Choose an item in Build Tools; info prints automatically.
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
    if scanning then
        local deadline=os.clock()+12
        while scanning and not entries and os.clock()<deadline do task.wait(.05) end
        assert(entries,"Catalog query did not complete; select the item again")
        return entries
    end
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
    if not (done and ok and type(result)=="table") then scanning=false;error("Catalog query failed or timed out; select the item again") end
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
function api.Inspect(target,source)
    assert(typeof(target)=="Instance" and target:IsA("BasePart"),"Hold a barrier preview or aim at a sample and press I")
    local catalog,targetRecord=api.Scan(),record(target)
    local buildRoot=target
    local folder=workspace:FindFirstChild("EditableBuilds")
    if folder and target:IsDescendantOf(folder) then while buildRoot.Parent~=folder do buildRoot=buildRoot.Parent end end
    local named={}
    local identityObjects={buildRoot}
    local ancestor=target
    for _=1,8 do
        if not ancestor or ancestor==workspace or ancestor==player then break end
        identityObjects[#identityObjects+1]=ancestor
        ancestor=ancestor.Parent
    end
    for _,object in ipairs(identityObjects) do
        named[object.Name]=true
        for _,value in pairs(object:GetAttributes()) do if type(value)=="string" then named[value]=true;named[value:gsub("^%{",""):gsub("%}$","")]=true end end
    end
    local candidates,bestEvidence={},0
    for _,entry in ipairs(catalog) do
        local reason,evidence=nil,0
        if named[entry.name] or named[entry.guid] then reason,evidence="catalog name/GUID on sample",3
        else for _,p in ipairs(entry.parts) do
            if p.class==targetRecord.class and p.shape==targetRecord.shape then
                if #targetRecord.assets>0 and assetKey(p)==assetKey(targetRecord) then reason,evidence="matching mesh/texture assets",2
                elseif evidence<2 and targetRecord.materialVariant~="" and p.material==targetRecord.material and p.materialVariant==targetRecord.materialVariant then reason,evidence="matching material variant",1
                end
            end
        end end
        if reason and evidence>=bestEvidence then
            if evidence>bestEvidence then candidates,bestEvidence={},evidence end
            candidates[#candidates+1]={name=entry.name,guid=entry.guid,category=entry.category,plus=entry.plus,reason=reason,templateClass=entry.templateClass,parts=entry.parts}
        end
    end
    local report={format="red-bull-ring-barrier-inspection-v1",placeId=game.PlaceId,source=source or "sample",targetPath=target:GetFullName(),target=targetRecord,candidates=candidates}
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
-- Jakarta PlaceTool parents the GUID-named clone directly to workspace.Hover.
-- CatalogBuilder names cards <catalog name>Button, with a TextButton child.
local watchConnections,watchedCards,watchedHovers={}, {}, {}
local watching=false
local function firstPart(root)
    if root:IsA("BasePart") then return root end
    if root:IsA("Model") and root.PrimaryPart then return root.PrimaryPart end
    return parts(root)[1]
end
function api.Selected()
    local hover=workspace:FindFirstChild("Hover")
    if not hover then line("Open Build Tools first; workspace.Hover is missing");return nil,"none" end
    local objects={}
    for _,object in ipairs(hover:GetChildren()) do if object:IsA("BasePart") or object:IsA("Model") then objects[#objects+1]=object end end
    if #objects==0 then line("Choose the steel or concrete item in the Build Tools catalog; no placement is needed");return nil,"none" end
    if #objects~=1 then
        for i,object in ipairs(objects) do line("HOVER "..i..": "..object:GetFullName()) end
        line("Multiple held objects found; inspect the intended Hover child explicitly")
        return nil,"ambiguous"
    end
    local target=assert(firstPart(objects[1]),"Held catalog item has no BasePart")
    return api.Inspect(target,"Build Tools Hover selection")
end
api.Preview=api.Selected
api.Capture=api.Selected
function api.CatalogItem(name)
    local found
    for _,entry in ipairs(api.Scan()) do if entry.name==name then found=entry;break end end
    assert(found,"Catalog item was not found: "..tostring(name))
    local folder=Storage:FindFirstChild("PlacementObject")
    folder=folder and folder:FindFirstChild("Object")
    local template=folder and folder:FindFirstChild(found.guid,true)
    assert(template,"Catalog template is unavailable: "..name)
    return api.Inspect(assert(firstPart(template),"Catalog template has no BasePart"),"Build Tools catalog UI click")
end
local function safely(fn,...)
    local ok,result=pcall(fn,...)
    if not ok then line(tostring(result)) end
    return ok,result
end
local function watchHover(hover)
    if watchedHovers[hover] then return end
    watchedHovers[hover]=true
    watchConnections[#watchConnections+1]=hover.ChildAdded:Connect(function(object)
        if object:IsA("BasePart") or object:IsA("Model") then
            local target=firstPart(object)
            if target then safely(api.Inspect,target,"Build Tools Hover selection") end
        end
    end)
end
local function watchCard(object)
    if watchedCards[object] or not object:IsA("TextButton") or object.Name~="TextButton" then return end
    local card=object.Parent
    local name=card and card.Name:match("^(.*)Button$")
    if not name or name=="" then return end
    local ancestor=card
    while ancestor and ancestor.Name~="AdvanceBuildTools" do ancestor=ancestor.Parent end
    if not ancestor then return end
    watchedCards[object]=true
    watchConnections[#watchConnections+1]=object.Activated:Connect(function()
        -- Read the selected card's template even if its held clone has not
        -- appeared yet. Do not invoke the game's createPreview/placeItem.
        safely(api.CatalogItem,name)
    end)
end
function api.Watch()
    if watching then return api end
    watching=true
    local hover=workspace:FindFirstChild("Hover")
    if hover then watchHover(hover) end
    watchConnections[#watchConnections+1]=workspace.ChildAdded:Connect(function(object) if object.Name=="Hover" then watchHover(object) end end)
    local gui=player:FindFirstChild("PlayerGui")
    if gui then
        for _,object in ipairs(gui:GetDescendants()) do watchCard(object) end
        watchConnections[#watchConnections+1]=gui.DescendantAdded:Connect(watchCard)
    end
    line("Watching Build Tools catalog clicks and workspace.Hover; selecting an item prints its info automatically")
    if hover then for _,object in ipairs(hover:GetChildren()) do if firstPart(object) then safely(api.Inspect,firstPart(object),"Build Tools Hover selection") end end end
    return api
end
function api.List(filter)
    filter=string.lower(filter or "others")
    for _,entry in ipairs(api.Scan()) do if string.find(string.lower(entry.name),filter,1,true) or string.find(string.lower(tostring(entry.category)),filter,1,true) then
        for _,p in ipairs(entry.parts) do line("CATALOG: "..entry.name.." | Material="..p.material.." | Variant="..p.materialVariant.." | Class="..p.class.." | Assets="..#p.assets) end
    end end
end
function api.Unload()
    if connection then connection:Disconnect() end
    for _,value in ipairs(watchConnections) do value:Disconnect() end
    watching=false
    _G.RedBullRingBarrierInspector=nil
end
connection=Input.InputBegan:Connect(function(input,processed)
    if processed or Input:GetFocusedTextBox() or input.KeyCode~=Enum.KeyCode.I then return end
    safely(api.Selected)
end)
api.Watch()
line("Choose the steel item in the Build Tools UI, then the striped concrete. Copy their Material / MaterialVariant / Catalog output from the console")
return api
