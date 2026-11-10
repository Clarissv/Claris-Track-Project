-- Reuses only the compact builder's offline Roblox mocks.
local inputSignal=signal()
gui.DescendantAdded=signal()
local originalTypeof=typeof
typeof=function(value) if getmetatable(value)==instanceMeta then return "Instance" end;return originalTypeof(value) end
local input={InputBegan=inputSignal,GetFocusedTextBox=function() return nil end}
Enum.KeyCode={I="I"}
local originalService=game.GetService
game.GetService=function(self,name) if name=="UserInputService" then return input end;return originalService(self,name) end
function methods:GetAttributes() return self._attributes end
function methods:GetFullName() return self.Name end
function methods:IsDescendantOf(parent) local p=self.Parent;while p do if p==parent then return true end;p=p.Parent end;return false end
local hovered
function methods:GetMouse() return {Target=hovered} end
local steel=child(catalog,"Part","guid-steel")
steel.Material={Name="Metal"};steel.MaterialVariant="CorrugatedSteel"
local striped=child(catalog,"Part","guid-striped")
striped.Material={Name="Concrete"};striped.MaterialVariant="StripedConcrete"
local assetSteel=child(catalog,"Part","guid-textured")
assetSteel.Material={Name="SmoothPlastic"};assetSteel.MaterialVariant=""
local texture=child(assetSteel,"Texture","SteelFace");texture.Texture="rbxassetid://steel";texture.Face="Front"
local queryCount=0
function manifest:InvokeServer()
    queryCount=queryCount+1
    return {{name="SteelSheet",guid="guid-steel",category="Others"},{name="ConcreteStripes",guid="guid-striped",category="Others"},{name="SteelTextured",guid="guid-textured",category="Others"}}
end
local encoded
game.GetService=function(self,name)
    if name=="HttpService" then return {JSONEncode=function(self,report) encoded=report;return "report-json" end} end
    if name=="UserInputService" then return input end
    return originalService(self,name)
end
local exports=0
writefile=function(name,json) assert(name=="red-bull-ring-barrier-inspection.json" and json=="report-json");exports=exports+1 end
local loadInspector=function()
    -- INSPECTOR_SOURCE
end
local roadSentinel={State="complete",Count=8293}
_G.RedBullRingClearStartCompactBuilder=roadSentinel
local api=loadInspector()
assert(queryCount==0 and #calls==0,"Loading must only install the read-only inspector")
local sample=child(builds,"Part","placed-uuid");sample.Material={Name="Metal"};sample.MaterialVariant="CorrugatedSteel"
local report=api.Inspect(sample)
assert(queryCount==1 and report.target.material=="Metal" and report.target.materialVariant=="CorrugatedSteel" and #report.candidates==1 and report.candidates[1].name=="SteelSheet","Unique steel variant must resolve live catalog name")
sample.Material={Name="Concrete"};sample.MaterialVariant="StripedConcrete"
report=api.Inspect(sample)
assert(queryCount==1 and #report.candidates==1 and report.candidates[1].name=="ConcreteStripes","Concrete must resolve separately without another remote query")
sample.Material={Name="SmoothPlastic"};sample.MaterialVariant=""
local sampleTexture=child(sample,"Texture","SampleTexture");sampleTexture.Texture=texture.Texture;sampleTexture.Face=texture.Face
report=api.Inspect(sample)
assert(#report.candidates==1 and report.candidates[1].name=="SteelTextured","Texture assets must identify barriers without a variant")
sampleTexture.Texture="rbxassetid://different"
report=api.Inspect(sample)
assert(#report.candidates==0,"Unmatched textures must not guess a catalog")
sampleTexture:Destroy();sample.Material={Name="Metal"};sample.MaterialVariant="CorrugatedSteel"
local duplicate=child(catalog,"Part","guid-duplicate");duplicate.Material=steel.Material;duplicate.MaterialVariant=steel.MaterialVariant
api.Catalog[#api.Catalog+1]={name="OtherSteel",guid="guid-duplicate",parts={api.Catalog[2].parts[1]}}
-- Find the actual steel record; catalog order is alphabetical.
for _,entry in ipairs(api.Catalog) do if entry.name=="SteelSheet" then api.Catalog[#api.Catalog].parts=entry.parts end end
report=api.Inspect(sample);assert(#report.candidates==2,"Shared appearances must stay ambiguous")
-- The real PlaceTool clones the template GUID into workspace.Hover.
local hoverFolder=child(workspace,"Folder","Hover")
local held=instance("Part")
held.Name="guid-steel";held.Material=steel.Material;held.MaterialVariant=""
held.CanQuery,held.CanCollide,held.Anchored,held.Transparency=false,false,true,0
held.Parent=hoverFolder
assert(api.LastReport.source=="Build Tools Hover selection" and api.LastReport.candidates[1].name=="SteelSheet","Selecting a GUID-named Hover clone must print automatically, even without variant/texture clues")
hovered=root
inputSignal:Fire({KeyCode="I"})
assert(api.LastReport.source=="Build Tools Hover selection","Manual capture must use Hover instead of the mouse ray")
assert(api.Preview().candidates[1].name=="SteelSheet","Legacy Preview call must resolve the exact Hover selection")
held:Destroy()
local concreteHeld=instance("Part")
concreteHeld.Name="guid-striped";concreteHeld.Material=striped.Material;concreteHeld.MaterialVariant=striped.MaterialVariant
concreteHeld.Parent=hoverFolder
assert(api.LastReport.candidates[1].name=="ConcreteStripes","Replacing the Hover clone must report the new selection")
concreteHeld:Destroy()
-- Exact CatalogBuilder card naming: <name>Button with TextButton child.
local tools=gui:FindFirstChild("AdvanceBuildTools")
local scrolling=child(tools,"Frame","ScrollingFrame")
local card=child(scrolling,"Frame","SteelSheetButton")
local uiButton=child(card,"TextButton","TextButton")
gui.DescendantAdded:Fire(uiButton)
local beforeExports=exports
uiButton.Activated:Fire()
assert(exports==beforeExports+1 and api.LastReport.source=="Build Tools catalog UI click" and api.LastReport.candidates[1].name=="SteelSheet","Catalog UI selection must print from the actual template without a placed part or held clone")
local ignored=child(gui,"TextButton","Unrelated")
gui.DescendantAdded:Fire(ignored);ignored.Activated:Fire()
assert(exports==beforeExports+1,"Unrelated UI must not trigger catalog reads")
hoverFolder:Destroy()
local newHover=child(workspace,"Folder","Hover")
local heldModel=instance("Model");heldModel.Name="guid-striped"
local modelPart=child(heldModel,"Part","PrimaryPart");modelPart.Material=striped.Material;modelPart.MaterialVariant=striped.MaterialVariant
heldModel.PrimaryPart=modelPart;heldModel.Parent=newHover
assert(api.LastReport.candidates[1].name=="ConcreteStripes","Replacing Hover and holding a Model must retain parent catalog identity")
local previousReport=api.LastReport
local unrelated=child(workspace,"Part","FakeGhost");unrelated.Material=steel.Material;unrelated.MaterialVariant=steel.MaterialVariant
assert(api.Selected().targetPath==modelPart.Name,"Unrelated workspace ghosts must not affect exact Hover selection")
api.Unload();beforeExports=exports
uiButton.Activated:Fire()
local later=instance("Part");later.Name="guid-steel";later.Material=steel.Material;later.MaterialVariant="";later.Parent=newHover
assert(exports==beforeExports,"Unload must disconnect all catalog and Hover watchers")
later:Destroy();heldModel:Destroy()
assert(_G.RedBullRingClearStartCompactBuilder==roadSentinel and #calls==0,"Inspection must preserve road and send no placements")
local replaced=loadInspector();assert(not inputSignal.listeners[1].Connected and _G.RedBullRingBarrierInspector==replaced,"Reload must replace the prior observer")
replaced.Unload();assert(_G.RedBullRingBarrierInspector==nil and not inputSignal.listeners[2].Connected,"Unload must release inspector input")
local quickInfo=function()
    -- HELD_INFO_SOURCE
end
storage.NetworkContainer=network;network.RemoteFunctions=network:FindFirstChild("RemoteFunctions");network.RemoteFunctions.GetCatalogManifest=manifest
local previousPrint,lines=print,{}
print=function(text) lines[#lines+1]=text end
quickInfo()
local quickHeld=instance("Part");quickHeld.Name="guid-steel";quickHeld.Material=steel.Material;quickHeld.MaterialVariant="CorrugatedSteel";quickHeld.Parent=newHover
assert(lines[#lines-1]:find("Catalog=SteelSheet",1,true) and lines[#lines]:find("MaterialVariant=CorrugatedSteel",1,true),"Direct console snippet must report catalog and material on UI-created Hover clones")
local oldConnection=_G.RBRHeldInfo
quickInfo();assert(not oldConnection.Connected,"Repeating the direct snippet must replace its observer")
_G.RBRHeldInfo:Disconnect();print=previousPrint
assert(#calls==0,"Neither inspector may place any object")
return "PASS: exact Jakarta Hover GUID and catalog UI selection print automatically without placement; variants, assets, ambiguity and cleanup verified"
