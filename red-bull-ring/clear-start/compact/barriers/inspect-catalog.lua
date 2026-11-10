-- Read-only Jakarta barrier inspector. Hold a catalog item without placing it; press I.
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
local function previewRoot(part,root)
    local found,object=nil,part
    while object and object~=root do
        local name=string.lower(object.Name)
        -- Exclude our complete local circuit previews from held-item capture.
        if name:find("redbullring",1,true) and name:find("preview",1,true) then return nil,true end
        if name:find("preview",1,true) or name:find("ghost",1,true) or name:find("holding",1,true) then found=object end
        object=object.Parent
    end
    return found,false
end
function api.Preview(index)
    local catalog=api.Scan()
    local folder=workspace:FindFirstChild("EditableBuilds")
    local roots={workspace}
    local gui=player:FindFirstChild("PlayerGui")
    if gui then roots[#roots+1]=gui end
    local candidates,byRoot={},{}
    for _,root in ipairs(roots) do for _,part in ipairs(root:GetDescendants()) do
        if part:IsA("BasePart") and not (folder and part:IsDescendantOf(folder)) and not (player.Character and part:IsDescendantOf(player.Character)) then
            local holder,excluded=previewRoot(part,root)
            if not excluded and property(part,"Transparency")~=1 and (holder or (root==workspace and part.CanCollide==false and part.Anchored==true)) then
                local p,matchesCatalog=record(part),false
                for _,entry in ipairs(catalog) do for _,template in ipairs(entry.parts) do
                    if p.class==template.class and p.shape==template.shape and
                        ((p.materialVariant~="" and p.material==template.material and p.materialVariant==template.materialVariant) or
                        (#p.assets>0 and assetKey(p)==assetKey(template))) then matchesCatalog=true end
                end end
                -- Named preview roots are explicit evidence. Unnamed workspace
                -- ghosts need a catalog appearance match and non-colliding,
                -- anchored geometry. GUI catalog icons are never a fallback.
                if holder or (root==workspace and matchesCatalog and part.CanCollide==false and part.Anchored==true) then
                    local score=(holder and 4 or 0)+(matchesCatalog and 4 or 0)
                    local group=holder or part
                    local existing=byRoot[group]
                    if not existing then existing={part=part,root=group,score=score};byRoot[group]=existing;candidates[#candidates+1]=existing
                    elseif score>existing.score then existing.part,existing.score,existing.ambiguous=part,score,nil
                    elseif score==existing.score then
                        local a,b=record(existing.part),p
                        if a.material~=b.material or a.materialVariant~=b.materialVariant or assetKey(a)~=assetKey(b) then existing.ambiguous=true end
                    end
                end
            end
        end
    end end
    table.sort(candidates,function(a,b) if a.score~=b.score then return a.score>b.score end;return a.part:GetFullName()<b.part:GetFullName() end)
    api.PreviewCandidates=candidates
    if index~=nil then
        assert(type(index)=="number" and index%1==0 and candidates[index],"Choose a listed preview number")
        assert(not candidates[index].ambiguous,"Preview contains different part appearances; use Inspect with the exact part")
        return api.Inspect(candidates[index].part,"held preview")
    end
    if #candidates==1 and not candidates[1].ambiguous then return api.Inspect(candidates[1].part,"held preview") end
    for i,candidate in ipairs(candidates) do
        local p=record(candidate.part)
        line("PREVIEW "..i..": "..candidate.part:GetFullName().." | Material="..p.material.." | MaterialVariant="..p.materialVariant..(candidate.ambiguous and " | multiple appearances in this preview" or ""))
    end
    if #candidates==0 then line("No held preview found. Select the barrier and move its preview into the world, then try again.");return nil,"none" end
    line("Several possible previews found. Run _G.RedBullRingBarrierInspector.Preview(number) for the intended one.")
    return nil,"ambiguous"
end
function api.Capture()
    local report,reason=api.Preview()
    if reason=="none" then return api.Inspect(player:GetMouse().Target) end
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
    local ok,err=pcall(api.Capture)
    if not ok then line(tostring(err)) end
end)
line("Ready. Hold the steel barrier in Build Tools without placing it, then press I or run _G.RedBullRingBarrierInspector.Preview(). Repeat for striped concrete; paste the Material / Catalog lines.")
line("If a sample cannot be identified, run _G.RedBullRingBarrierInspector.List() to list the Others catalog.")
return api
