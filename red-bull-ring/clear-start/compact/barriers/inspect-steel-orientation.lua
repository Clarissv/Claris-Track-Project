-- Read-only native Others88 orientation capture. No placement or preview edits.
assert(game:GetService("RunService"):IsClient() and game.PlaceId == 14005966837, "Run in Jakarta")
local storage = game:GetService("ReplicatedStorage")
local network = assert(storage:FindFirstChild("NetworkContainer"), "Enable Build Tools first")
local remote = assert(network.RemoteFunctions:FindFirstChild("GetCatalogManifest"), "Enable Build Tools first")
local entry
for _, item in ipairs(remote:InvokeServer()) do if item.name == "Others88" then entry = item; break end end
assert(entry, "Others88 is missing from the live catalog")
local folder = assert(storage:FindFirstChild("PlacementObject"), "Catalog templates are missing"):FindFirstChild("Object")
local template = assert(folder and folder:FindFirstChild(entry.guid, true), "Others88 template is missing")
local isModel = template:IsA("Model")
assert(isModel or template:IsA("BasePart"), "Unsupported catalog root: " .. template.ClassName)
-- PlaceTool sends Model:GetPivot()/GetScale(), or BasePart.CFrame/Size.
local pivot = isModel and template:GetPivot() or template.CFrame
local parts, panel = {}, nil
if template:IsA("BasePart") then parts[1] = template end
for _, part in ipairs(template:GetDescendants()) do if part:IsA("BasePart") then parts[#parts + 1] = part end end
for _, part in ipairs(parts) do
    if part.Material == Enum.Material.DiamondPlate and part.MaterialVariant == "Diamond Plate 1" then
        if not panel or part.Size.X * part.Size.Y * part.Size.Z > panel.Size.X * panel.Size.Y * panel.Size.Z then panel = part end
    end
end
assert(panel, "The DiamondPlate / Diamond Plate 1 panel is missing")
local size, relative = {panel.Size.X, panel.Size.Y, panel.Size.Z}, pivot:ToObjectSpace(panel.CFrame)
local axes, order = {relative.RightVector, relative.UpVector, -relative.LookVector}, {1,2,3}
table.sort(order, function(a,b) return size[a] < size[b] end)
-- Thin axis becomes the barrier's side normal; the panel's shorter broad
-- dimension stands up, and its longer broad dimension runs along the fence.
local right, up = axes[order[1]], axes[order[2]]
local correction = CFrame.fromMatrix(Vector3.new(), right, up, right:Cross(up)):Inverse()
local lo, hi, records = {math.huge,math.huge,math.huge}, {-math.huge,-math.huge,-math.huge}, {}
for _, part in ipairs(parts) do
    local localFrame = pivot:ToObjectSpace(part.CFrame)
    records[#records + 1] = {name=part.Name,class=part.ClassName,size={part.Size.X,part.Size.Y,part.Size.Z},pivotRelative={localFrame:GetComponents()},material=part.Material.Name,materialVariant=part.MaterialVariant}
    for _, x in ipairs({-.5,.5}) do for _, y in ipairs({-.5,.5}) do for _, z in ipairs({-.5,.5}) do
        local q = correction:PointToWorldSpace(localFrame:PointToWorldSpace(Vector3.new(part.Size.X*x,part.Size.Y*y,part.Size.Z*z)))
        for i, n in ipairs({q.X,q.Y,q.Z}) do lo[i],hi[i]=math.min(lo[i],n),math.max(hi[i],n) end
    end end end
end
local rx,ry,rz = correction:ToOrientation()
local report = {catalog="Others88",guid=entry.guid,rootClass=template.ClassName,basePartCount=#parts,modelScale=isModel and template:GetScale() or nil,panel=panel.Name,correctionDegrees={math.deg(rx),math.deg(ry),math.deg(rz)},uprightCorrection={correction:GetComponents()},uprightSize={hi[1]-lo[1],hi[2]-lo[2],hi[3]-lo[3]},uprightCenter={(lo[1]+hi[1])/2,(lo[2]+hi[2])/2,(lo[3]+hi[3])/2},parts=records}
print("STEEL_ORIENTATION " .. game:GetService("HttpService"):JSONEncode(report))
return report
