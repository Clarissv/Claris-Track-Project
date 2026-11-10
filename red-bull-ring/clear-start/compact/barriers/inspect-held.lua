-- Standalone console snippet: choose an item in Jakarta Build Tools; never place it.
if _G.RedBullRingBarrierInspector then _G.RedBullRingBarrierInspector.Unload() end
if _G.RBRHeldInfo then _G.RBRHeldInfo:Disconnect() end
local storage=game:GetService("ReplicatedStorage")
local hover=assert(workspace:FindFirstChild("Hover"),"Open Build Tools first")
local manifest=storage.NetworkContainer.RemoteFunctions.GetCatalogManifest:InvokeServer()
local catalog={}
for _,entry in ipairs(manifest) do catalog[entry.guid]=entry;catalog[entry.name]=entry end
local function show(object)
    if not (object:IsA("BasePart") or object:IsA("Model")) then return end
    local entry=catalog[object.Name]
    print("[Barrier info] Catalog="..(entry and entry.name or "unmatched").." | GUID="..object.Name)
    local list=object:GetDescendants()
    if object:IsA("BasePart") then table.insert(list,1,object) end
    for _,part in ipairs(list) do
        if part:IsA("BasePart") then
            print("[Barrier info] Material="..part.Material.Name.." | MaterialVariant="..part.MaterialVariant.." | Class="..part.ClassName)
        elseif part:IsA("Texture") or part:IsA("Decal") then
            print("[Barrier info] Texture="..part.Texture)
        end
    end
end
_G.RBRHeldInfo=hover.ChildAdded:Connect(show)
for _,object in ipairs(hover:GetChildren()) do show(object) end
print("[Barrier info] Ready. Choose steel, then striped concrete in Build Tools; info prints automatically.")
