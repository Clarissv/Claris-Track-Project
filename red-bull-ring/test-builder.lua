local monzaSentinel = {State="paused"}
local monzaTerrainSentinel = {State="paused"}
_G.MonzaBuilder, _G.MonzaTerrainBuilder = monzaSentinel, monzaTerrainSentinel
-- Offline mocks: validate the builder's contract without executing Roblox/network calls.
local clock = 0
table.unpack = table.unpack or unpack
os.clock = function() return clock end
task = { wait = function(dt) clock = clock + (dt or 0.01) end, spawn = function(fn) fn() end }
local vmeta = {}
local function vector(x, y, z) return setmetatable({ X = x or 0, Y = y or 0, Z = z or 0, _type = "Vector3" }, vmeta) end
vmeta.__index = function(v, k)
    if k == "Magnitude" then return math.sqrt(v.X * v.X + v.Y * v.Y + v.Z * v.Z) end
    if k == "Unit" then local n = math.sqrt(v.X * v.X + v.Y * v.Y + v.Z * v.Z); return vector(v.X / n, v.Y / n, v.Z / n) end
    if k == "Dot" then return function(a, b) return a.X * b.X + a.Y * b.Y + a.Z * b.Z end end
end
vmeta.__add = function(a, b) return vector(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end
vmeta.__sub = function(a, b) return vector(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end
vmeta.__mul = function(a, n) return vector(a.X * n, a.Y * n, a.Z * n) end
Vector3 = { new = vector }
Color3 = { new = function(r, g, b) return { R = r, G = g, B = b } end }
Color3.fromRGB = function(r, g, b) return Color3.new(r / 255, g / 255, b / 255) end
local cfmeta = {}
cfmeta.__index = cfmeta
local function cf(x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22)
    if type(x) == "table" then x, y, z = x.X, x.Y, x.Z end
    return setmetatable({ Position = vector(x, y, z), X = x or 0, Y = y or 0, Z = z or 0, RightVector = r00 and vector(r00,r10,r20) or vector(1, 0, 0), UpVector = r00 and vector(r01,r11,r21) or vector(0, 1, 0), BackVector = r00 and vector(r02,r12,r22) or vector(0,0,1), _type = "CFrame" }, cfmeta)
end
local function transform(a,v) return a.RightVector*v.X+a.UpVector*v.Y+a.BackVector*v.Z end
cfmeta.__mul = function(a, b) local result = cf(a.Position + transform(a,b.Position)); result.RightVector, result.UpVector, result.BackVector = transform(a,b.RightVector), transform(a,b.UpVector), transform(a,b.BackVector); return result end
function cfmeta:Inverse()
    local r,u,b=self.RightVector,self.UpVector,self.BackVector
    return cf(-self.Position:Dot(r),-self.Position:Dot(u),-self.Position:Dot(b),r.X,r.Y,r.Z,u.X,u.Y,u.Z,b.X,b.Y,b.Z)
end
function cfmeta:GetComponents() local r,u,b=self.RightVector,self.UpVector,self.BackVector;return self.X,self.Y,self.Z,r.X,u.X,b.X,r.Y,u.Y,b.Y,r.Z,u.Z,b.Z end
CFrame = { new = cf, Angles = function(_,yaw) return cf(0,0,0,math.cos(yaw),0,math.sin(yaw),0,1,0,-math.sin(yaw),0,math.cos(yaw)) end, lookAt = function(position) return cf(position) end,
    fromMatrix = function(position, right, up) local result = cf(position); result.RightVector, result.UpVector = right, up; result.BackVector=vector(right.Y*up.Z-right.Z*up.Y,right.Z*up.X-right.X*up.Z,right.X*up.Y-right.Y*up.X); return result end }
typeof = function(v) return type(v) == "table" and v._type or type(v) end
Enum = { CameraType = { Scriptable = "Scriptable", Custom = "Custom" }, PartType = { Block = "Block" }, Material = { Asphalt = "Asphalt", SmoothPlastic = "SmoothPlastic", Concrete = "Concrete", Grass = "Grass", Sand = "Sand" }, SurfaceType = { Smooth = "Smooth" }, Font = { GothamBold = "GothamBold", Gotham = "Gotham", GothamMedium = "GothamMedium" } }
UDim2 = { new = function(...) return {...} end, fromOffset = function(...) return {...} end }
local function signal()
    local s = { listeners = {} }
    function s:Connect(fn)
        local connection = { Connected = true, fn = fn }
        function connection:Disconnect() self.Connected = false end
        table.insert(self.listeners, connection)
        return connection
    end
    function s:Fire(arg) for _, c in ipairs(self.listeners) do if c.Connected then c.fn(arg) end end end
    return s
end
local methods, instanceMeta = {}, {}
instanceMeta.__index = function(o, k)
    if k == "Position" then return o._props.CFrame.Position end
    return methods[k] or o._props[k]
end
instanceMeta.__newindex = function(o, k, value)
    if k == "Parent" then
        local previous = o._props.Parent
        if previous then for i, child in ipairs(previous._children) do if child == o then table.remove(previous._children, i); break end end end
        o._props.Parent = value
        if value then table.insert(value._children, o); value.ChildAdded:Fire(o) end
    else o._props[k] = value end
end
local function instance(class)
    return setmetatable({ _props = { ClassName = class, Name = class, Shape = "Block", CFrame = cf(), Size = vector(1, 1, 1), Color = Color3.new(1, 1, 1), Material = "SmoothPlastic", MaterialVariant = "", ChildAdded = signal(), Activated = signal() }, _children = {}, _attributes = {} }, instanceMeta)
end
Instance = { new = instance }
function methods:IsA(class) return self.ClassName == class or class == "BasePart" and self.ClassName == "Part" end
function methods:GetChildren() local out = {}; for _, v in ipairs(self._children) do out[#out + 1] = v end; return out end
function methods:GetDescendants() local out = {}; for _, v in ipairs(self._children) do out[#out + 1] = v; for _, c in ipairs(v:GetDescendants()) do out[#out + 1] = c end end; return out end
function methods:FindFirstChild(name, recursive) for _, v in ipairs(recursive and self:GetDescendants() or self:GetChildren()) do if v.Name == name then return v end end end
function methods:WaitForChild(name) return assert(self:FindFirstChild(name), name) end
function methods:FindFirstChildOfClass(class) for _, o in ipairs(self:GetChildren()) do if o.ClassName == class then return o end end end
local pivotCalls = 0
function methods:GetPivot() return assert(self:FindFirstChild("HumanoidRootPart")).CFrame end
function methods:PivotTo(frame)
    local pivotRoot = assert(self:FindFirstChild("HumanoidRootPart"))
    pivotRoot.CFrame = frame
    pivotCalls = pivotCalls + 1
end
function methods:GetAttribute(name) return self._attributes[name] end
function methods:Destroy() self.Parent = nil end
local function child(parent, class, name) local o = instance(class); o.Name = name; o.Parent = parent; return o end
local storage = instance("ReplicatedStorage")
workspace = instance("Workspace")
workspace.CurrentCamera = instance("Camera")
workspace.CurrentCamera.CameraType = "Custom"
local builds = child(workspace, "Folder", "EditableBuilds")
local player = instance("Player")
player.Name = "Tester"
local gui = child(player, "PlayerGui", "PlayerGui")
child(gui, "ScreenGui", "AdvanceBuildTools")
player.Character = instance("Model")
local root = child(player.Character, "Part", "HumanoidRootPart")
root.CFrame = cf(0, 5, 0)
root.Anchored = false
local humanoid = child(player.Character, "Humanoid", "Humanoid")
humanoid.Health = 100
local catalog = child(child(storage, "Folder", "PlacementObject"), "Folder", "Object")
child(catalog, "Part", "guid-block")
local roadTemplate = child(catalog, "Part", "guid-road")
roadTemplate.Color, roadTemplate.Material, roadTemplate.MaterialVariant = Color3.fromRGB(17,17,17), "Concrete", "TestPaving"
local network = child(storage, "Folder", "NetworkContainer")
local placement = child(child(network, "Folder", "RemoteEvents"), "RemoteEvent", "PlacementSystem")
local manifest = child(child(network, "Folder", "RemoteFunctions"), "RemoteFunction", "GetCatalogManifest")
local saver = child(network:FindFirstChild("RemoteFunctions"), "RemoteFunction", "BuildSaver")
local placedCountOverride
function saver:InvokeServer(action) assert(action == "GetPlacedAmount", "Wrong Jakarta count action"); if placedCountOverride then return placedCountOverride() end; return #builds:GetChildren() end
local catalogNames = { "Block" }
function manifest:InvokeServer()
    local result = {}
    for _, name in ipairs(catalogNames) do result[#result + 1] = { name = name, guid = name == "Others75" and "guid-road" or "guid-block", category = "Basic", plus = false } end
    return result
end
local calls, reject, pauseAfterFirst, placementOverride, rejectAt = {}, false, false, nil, nil
local streamCalls = 0
local onStream
local onPlacement
function methods:RequestStreamAroundAsync(position, timeout)
    assert(self == player and position._type == "Vector3" and timeout == 5, "Stream request arguments differ")
    streamCalls = streamCalls + 1
    if onStream then onStream(position) end
end
function placement:FireServer(...)
    local args = {...}
    if onPlacement then onPlacement(args) end
    table.insert(calls, args)
    if reject or #calls == rejectAt then return end
    local o = instance("Part")
    o.Name, o.CFrame, o.Size = args[1], args[2], args[3]
    local template = args[1] == "Others75" and roadTemplate or catalog:FindFirstChild("guid-block")
    o.Color, o.Material, o.MaterialVariant = args[5] or template.Color, args[6] or template.Material, args[7] or template.MaterialVariant
    o.Anchored, o.CanCollide = true, args[8] == nil or args[8]
    if placementOverride then placementOverride(o) end
    o.Parent = builds
    if pauseAfterFirst and #calls == 1 then _G.RedBullRingBuilder.Pause() end
end
local fixtureDocument = {
    meta = { format = "red-bull-ring-elevated-v1", gameTarget = {placeId=14005966837,name="Jakarta"}, partCount = 2,
        palette = {{rgb = {65,66,66}, material = "Asphalt"}},
        planBounds = {min = {-3,-1,-3}, max = {9,0,3}} },
    parts = {{0,-0.5,0,6,1,6,1,0.1,0},{6,-0.5,0,6,1,6,1}}
}
for i, p in ipairs(fixtureDocument.parts) do
    local right = i == 1 and vector(1,0.2,1).Unit or vector(1,0,0)
    local up = i == 1 and vector(-0.1,1,-0.1).Unit or vector(0,1,0)
    p[8],p[9],p[10],p[11],p[12],p[13] = right.X,right.Y,right.Z,up.X,up.Y,up.Z
end
RaycastParams = {new=function() return {} end}
Enum.RaycastFilterType = {Exclude="Exclude"}
function methods:Raycast(position, direction, params)
    assert(self == workspace and params.FilterType == "Exclude" and params.FilterDescendantsInstances[1] == player.Character)
    return {Position=vector(position.X,3,position.Z)}
end
local missingFile, badJson = false, false
local checkpointDocument
readfile = function(path)
    if path == "RedBullRing/red-bull-ring-jakarta-checkpoint.json" or path == "red-bull-ring-jakarta-checkpoint.json" then assert(checkpointDocument, "No checkpoint"); return "checkpoint-json" end
    assert(path == "RedBullRing/red-bull-ring-plan.json" or path == "custom/plan.json", "Wrong workspace plan path")
    assert(not missingFile, "File does not exist")
    return "fixture-json"
end
writefile = function(path, raw) assert((path == "RedBullRing/red-bull-ring-jakarta-checkpoint.json" or path == "red-bull-ring-jakarta-checkpoint.json") and raw == "checkpoint-json") end
game = { PlaceId = 14005966837, GetService = function(_, name)
    if name == "Players" then return { LocalPlayer = player } end
    if name == "ReplicatedStorage" then return storage end
    if name == "RunService" then return { IsClient = function() return true end } end
    if name == "HttpService" then return { JSONEncode = function(_, value) checkpointDocument = value;return "checkpoint-json" end, JSONDecode = function(_, text)
        if text == "checkpoint-json" then return checkpointDocument end
        assert(text == "fixture-json" and not badJson, "Malformed JSON")
        return fixtureDocument
    end } end
    error("Unexpected service " .. name)
end }
local function loadBuilder(...)
    -- RED_BULL_RING_SCRIPT
end
local function diagnoseBuilder()
    -- RED_BULL_RING_DIAGNOSTIC
end
local function checkpointBuilder(...)
    -- RED_BULL_RING_CHECKPOINT
end
local function fresh()
    if _G.RedBullRingBuilder and _G.RedBullRingBuilder.Unload then _G.RedBullRingBuilder.Unload() end
    _G.RedBullRingBuilder = nil
    calls, reject, pauseAfterFirst = {}, false, false
    placedCountOverride = nil
    placementOverride, streamCalls, workspace.StreamingEnabled, rejectAt, onStream, onPlacement = nil, 0, false, nil, nil, nil
    _G.RedBullRingPreflight = nil
    for _, o in ipairs(builds:GetChildren()) do o:Destroy() end
    player._attributes.BT_SubPermanent = true
    root.CFrame = cf(0, 5, 0)
    root.Anchored, humanoid.SeatPart, humanoid.Health, pivotCalls = false, nil, 100, 0
    clock = 0
    catalogNames = { "Block" }
    fixtureDocument.meta.catalogRoles = nil
    fixtureDocument.meta.nonCollidingPartIndices = nil
    return loadBuilder()
end
local elevatedSentinel = { State = "paused", preserved = true }
_G.SepangBuilder = elevatedSentinel
local api = fresh()
assert(_G.SepangBuilder == elevatedSentinel, "Loading elevated Red Bull Ring must preserve the elevated builder")
elevatedSentinel.State = "building"
local blocked = pcall(api.Build)
assert(not blocked and #calls == 0 and _G.SepangBuilder == elevatedSentinel, "Concurrent elevated build must block Red Bull Ring publication without replacing it")
elevatedSentinel.State = "paused"
assert(#calls == 0, "Loading must not publish parts")
assert(pivotCalls == 0 and not root.Anchored, "Loading must not move or freeze the character")
game.PlaceId = 110369730911937
local wrongMap = pcall(loadBuilder)
game.PlaceId = 14005966837
assert(not wrongMap and _G.RedBullRingBuilder == api and #calls == 0, "Jakarta loader must reject Jawa Timur before replacing a session or placing objects")
fixtureDocument.meta.gameTarget.placeId = 110369730911937
wrongMap = pcall(loadBuilder)
fixtureDocument.meta.gameTarget.placeId = 14005966837
assert(not wrongMap and _G.RedBullRingBuilder == api, "A different-map plan must preserve the existing session")
-- A failed data load must leave the current panel/session usable.
missingFile = true
local ok, message = pcall(loadBuilder)
assert(not ok and message:find("executor workspace", 1, true) and _G.RedBullRingBuilder == api, "Missing data must preserve existing builder")
missingFile, badJson = false, true
ok = pcall(loadBuilder)
assert(not ok and _G.RedBullRingBuilder == api, "Malformed JSON must preserve existing builder")
badJson = false
fixtureDocument.parts[1][4] = 0
ok = pcall(loadBuilder)
assert(not ok and _G.RedBullRingBuilder == api, "Invalid dimensions must fail before replacing builder")
fixtureDocument.parts[1][4] = 6
fixtureDocument.meta.partCount = 15001
ok = pcall(loadBuilder)
assert(not ok and _G.RedBullRingBuilder == api, "Count mismatch must be rejected")
fixtureDocument.meta.partCount = 2
-- Inline paste mode must work with no file API.
local savedReadfile = readfile
readfile = nil
api = loadBuilder(nil, "fixture-json")
assert(api.Count == 2 and #calls == 0, "Inline data must load without file support or publication")
readfile = savedReadfile
api = loadBuilder("custom/plan.json")
assert(api.Count == 2, "Custom workspace plan path must be supported")
api.Inspect()
local preview = api.Preview()
assert(#calls == 0 and #builds:GetChildren() == 0, "Preview must stay local")
assert(pivotCalls == 0 and not root.Anchored, "Preview must not move or freeze the character")
assert(#preview:GetChildren() == 2 and not preview:GetChildren()[1].CanCollide, "Preview geometry missing")
assert(workspace.CurrentCamera.CameraType == "Scriptable" and workspace.CurrentCamera.CFrame.Y > root.Position.Y, "Preview camera must move above the map")
root.CFrame = cf(500, 5, 500)
api.Build()
assert(#calls == 2 and api.State == "complete" and api.NextIndex == 3, "Build did not confirm both parts")
assert(calls[1][1] == "Block" and calls[1][4] == 0 and calls[1][7] == "" and calls[1][8] == true, "Placement payload order differs from PlaceTool")
assert(calls[1][2].X == 0 and math.abs(calls[1][2].Y - 2.75) < 0.000001, "Build must retain the captured grass height plus slight clearance")
assert(calls[1][2].RightVector.Y > 0.09, "Road slope was lost in the placement frame")
assert(root.CFrame.X == 500 and root.CFrame.Z == 500 and not root.Anchored, "Completion must restore the character without shifting the map")
api.Build()
assert(#calls == 2, "Completed build must not duplicate parts")
api.RestoreCamera()
assert(workspace.CurrentCamera.CameraType == "Custom", "Back camera must restore camera mode")

api = fresh()
api.Config.GroundY = 25
local floorTarget = api.GetTarget(1)
assert(math.abs(floorTarget.origin.Y-25.25)<0.000001, "GroundY must override the platform raycast and retain the clearance")
api = fresh()
api.Config.Origin = cf(100,50,200)
floorTarget = api.GetTarget(1)
assert(floorTarget.origin.X == 100 and floorTarget.origin.Y == 50 and floorTarget.origin.Z == 200, "Explicit Origin must retain the supplied map center")
fixtureDocument.meta.placementAnchor = { position = {100,0,-40} }
api = fresh()
root.CFrame = cf(500,5,700)
api.Config.Scale, api.Config.YawDegrees = 2,90
local anchoredTarget = api.GetTarget(1)
local standingPoint = anchoredTarget.origin * CFrame.new(200,0,-80)
assert(math.abs(standingPoint.X-500)<.000001 and math.abs(standingPoint.Z-700)<.000001 and math.abs(standingPoint.Y-3.25)<.000001, "Pit-entry anchor must land above the standing point with yaw and scale applied")
root.CFrame = cf(800,5,900)
assert((api.GetTarget(2).origin.Position-anchoredTarget.origin.Position).Magnitude<.000001, "Moving after capturing the origin must not move the anchor")
api = fresh()
api.Config.StartAt = "center"
assert(api.GetTarget(1).origin.X == 0 and api.GetTarget(1).origin.Z == 0, "Legacy centre placement must remain available")
api = fresh()
api.Config.Origin = cf(100,50,200)
assert(api.GetTarget(1).origin.X == 100 and api.GetTarget(1).origin.Z == 200, "Explicit origin must bypass the standing-point offset")
api = fresh()
local anchoredPreview = api.Preview()
local marker = anchoredPreview:FindFirstChild("StandingPoint_PREVIEW_ONLY")
assert(marker and not marker.CanCollide and #calls == 0, "The standing marker must stay local and noncolliding")
assert(marker.CFrame.X == 0 and marker.CFrame.Z == 0, "The preview marker must show the captured standing point")
api.ClearPreview()
fixtureDocument.meta.placementAnchor = { position = {100,1,-40} }
local malformedAnchor = pcall(loadBuilder)
assert(not malformedAnchor and _G.RedBullRingBuilder == api, "Invalid anchor heights must fail before replacing the current builder")
fixtureDocument.meta.placementAnchor = nil
api = fresh()
api.Config.Origin = cf(1500,20,-1500)
onPlacement = function(args)
    assert(root.Anchored and (root.Position-args[2].Position).Magnitude <= api.Config.FollowDistance, "Character must follow distant placements before they are sent")
end
api.Build()
assert(#calls == 2 and pivotCalls >= 2 and root.CFrame.X == 0 and root.CFrame.Y == 5 and not root.Anchored, "FollowBuild must move then restore the character")

api = fresh()
api.Config.FollowBuild = false
api.Config.Origin = cf(1500,20,-1500)
api.Build()
assert(pivotCalls == 0 and not root.Anchored, "Disabling FollowBuild must preserve the character")

api = fresh()
humanoid.SeatPart = instance("Part")
ok = pcall(api.Build)
assert(not ok and #calls == 0 and not root.Anchored, "Seated characters must stop before movement or placement")

api = fresh()
api.Config.Origin = cf(1500,20,-1500)
pauseAfterFirst = true
api.Build()
assert(api.State == "paused" and root.CFrame.X == 0 and not root.Anchored, "Pause must restore character position and anchoring")
api.Build()
assert(#calls == 2 and api.State == "complete" and not root.Anchored, "FollowBuild resume must preserve placement progress")

api = fresh()
api.Config.Origin = cf(1500,20,-1500)
reject = true
ok = pcall(api.Build)
assert(not ok and #calls == 1 and root.CFrame.X == 0 and not root.Anchored, "Placement failure must restore the character")
ok = pcall(api.Build)
assert(not ok and #calls == 1 and root.CFrame.X == 0 and not root.Anchored, "Unconfirmed resume must restore the character without resending")

api = fresh()
player._attributes.BT_SubPermanent = false
ok = pcall(api.Build)
assert(not ok and #calls == 0, "Appearance access check must happen before publication")
api.Config.ApplyAppearance = false
api.Build()
assert(#calls == 2 and calls[1][5] == nil and calls[1][6] == nil and calls[1][8] == true, "Basic build must omit appearance but preserve collision argument")

api = fresh()
pauseAfterFirst = true
api.Build()
assert(#calls == 1 and api.State == "paused" and api.NextIndex == 2, "Pause must preserve confirmed progress")
api.Build()
assert(#calls == 2 and api.State == "complete", "Resume duplicated or skipped a placement")

api = fresh()
reject = true
ok = pcall(api.Build)
assert(not ok and #calls == 1 and api.NextIndex == 1 and api.State == "unconfirmed", "Rejected placement must stop after one request")
assert(#api.RequestDiagnostics().observed == 0, "Rejected placement must record zero new children")
local report = diagnoseBuilder()
assert(report:find("No replicated build Parts", 1, true) and #calls == 1, "Diagnostics must report missing replication without extra requests")
ok = pcall(api.Build)
assert(not ok and #calls == 1, "Unconfirmed request must not be blindly retried")
reject = false
-- Simulate a late server result without issuing another request.
local args, late = calls[1], instance("Part")
late.Name, late.CFrame, late.Size, late.Color, late.Material = "{e7938bef-58c4-4e6d-af52-b01a0bb379c4}", args[2], args[3], args[5], args[6]
late.Anchored, late.CanCollide, late.Parent = true, true, builds
api.Build()
assert(#calls == 2 and api.NextIndex == 3, "Resume must reconcile the late result then place only the next part")

api = fresh()
workspace.StreamingEnabled = true
api.Config.FollowBuild = false
api.Build()
assert(streamCalls == 1 and #calls == 2 and api.State == "complete", "Streaming preparation must be bounded and preserve confirmed placements")

api = fresh()
workspace.StreamingEnabled = true
api.Config.FollowBuild = false
local streamedTarget = api.GetTarget(1)
-- This server object exists before it streams into the local folder.
placedCountOverride = function() return #builds:GetChildren() + (streamCalls == 0 and 1 or 0) end
onStream = function()
    if streamCalls == 1 then
        local object = instance("Part")
        object.Name, object.CFrame, object.Size = "{e7938bef-58c4-4e6d-af52-b01a0bb379c4}", streamedTarget.cf, streamedTarget.size
        object.Color, object.Material, object.Anchored, object.CanCollide = streamedTarget.color, streamedTarget.material, true, true
        object.Parent = builds
    end
end
api.Build()
assert(#calls == 1 and api.State == "complete", "Objects streamed in before placement must be reused without duplication")

api = fresh()
workspace.StreamingEnabled = true
api.Config.FollowBuild = false
fixtureDocument.parts[2][1] = 90
api.Build()
assert(streamCalls == 2 and #calls == 2, "Targets 90 studs apart must refresh streaming")
fixtureDocument.parts[2][1] = 6

api = fresh()
workspace.StreamingEnabled, reject = true, true
api.Config.FollowBuild = false
onStream = function()
    if #calls == 1 then
        local args, late = calls[1], instance("Part")
        late.Name, late.CFrame, late.Size, late.Color, late.Material = "{e7938bef-58c4-4e6d-af52-b01a0bb379c4}", args[2], args[3], args[5], args[6]
        late.Anchored, late.CanCollide, late.Parent = true, true, builds
        reject = false
    end
end
api.Build()
assert(streamCalls == 2 and #calls == 2 and api.State == "complete", "Forced refresh must reconcile the late result without resending placement")

api = fresh()
workspace.StreamingEnabled, reject = true, true
api.Config.FollowBuild = false
ok = pcall(api.Build)
assert(not ok and #calls == 1 and streamCalls == 2 and api.State == "unconfirmed", "Missing streamed results must stop after one refresh and one placement request")

api = fresh()
workspace.StreamingEnabled = true
onStream = function() error("Follow mode must not call manual streaming") end
api.Build()
assert(streamCalls == 0 and #calls == 2 and api.State == "complete", "Follow mode must continue without manual streaming calls")

api = fresh()
api.Config.FollowBuild = false
workspace.StreamingEnabled = true
api.Inspect()
local originalSpawn, heldTasks = task.spawn, {}
local spawned = 0
-- Count queries complete; only the streaming request remains pending.
task.spawn = function(fn)
    spawned = spawned + 1
    if spawned == 2 then heldTasks[#heldTasks+1] = fn else fn() end
end
api.Build()
task.spawn = originalSpawn
assert(api.State == "complete" and #calls == 2 and #heldTasks == 1 and clock < 7, "A streaming call that never returns must not hang or accumulate requests")
api = fresh()
api.Inspect()
heldTasks = {}
task.spawn = function(fn) heldTasks[#heldTasks+1] = fn end
ok = pcall(api.Build)
task.spawn = originalSpawn
assert(not ok and #calls == 0 and #heldTasks == 1 and clock < 12.2, "A stalled save-count query must time out before any placement")

-- Adjacent tiny slabs fit inside the old .25/.05 matcher tolerances.
-- They must remain two distinct server objects across pause and reload.
local originalParts = fixtureDocument.parts
local closeA, closeB = {}, {}
for k,v in ipairs(originalParts[2]) do closeA[k], closeB[k] = v,v end
closeA[1], closeB[1], closeB[6] = 0, .10, closeB[6]+.005
fixtureDocument.parts = {closeA,closeB}
api = fresh()
pauseAfterFirst = true
api.Build()
api.Build()
assert(#calls == 2 and #builds:GetChildren() == 2 and api.SentCount == 2, "One nearby object must never confirm two plan indices")
local originalOrigin = api.GetTarget(1).origin
-- Simulate the old builder's missing second slab; reload loses ownership data.
builds:GetChildren()[2]:Destroy()
api = loadBuilder()
api.Config.Origin = originalOrigin
pauseAfterFirst = false
api.Repair()
assert(#calls == 3 and #builds:GetChildren() == 2 and api.ReusedCount == 1 and api.SentCount == 1, "Repair must recover a skipped neighbour after reloading, without duplicating the first slab")
api.Repair()
assert(#calls == 3 and api.ReusedCount == 2 and api.SentCount == 0, "Repairing a complete map must only inspect existing geometry")
local countReport = api.VerifyServerCount()
assert(countReport.matches and countReport.serverCount == 2, "The final server count must agree with newly placed and reused objects")
placedCountOverride = function() return 1 end
ok = pcall(api.Build)
assert(not ok and #calls == 3, "A deleted server object must prevent a false completion report")
report = diagnoseBuilder()
assert(report:find("COUNT MISMATCH",1,true), "Save diagnostics must include authoritative count discrepancies")
fixtureDocument.parts = originalParts

api = fresh()
api.Config.Origin = CFrame.fromMatrix(vector(100,25,200),vector(0,0,-1),vector(0,1,0))
api.Config.Scale = 2
local savedAxes = {}
for k=8,13 do savedAxes[k]=fixtureDocument.parts[1][k];fixtureDocument.parts[1][k]=math.floor(fixtureDocument.parts[1][k]*10000+.5)/10000 end
pauseAfterFirst = true
api.Build()
local checkpoint = checkpointBuilder()
assert(checkpoint.nextIndex == 2 and #calls == 1 and checkpoint.scale == 2, "Checkpoint export must preserve confirmed progress without placement")
assert(math.abs(checkpoint.origin[1]-100)<.000001 and math.abs(checkpoint.origin[2]-25)<.000001 and math.abs(checkpoint.origin[3]-200)<.000001, "Checkpoint must recover the frozen origin from the captured part")
local expectedSecond = api.GetTarget(2)
api = loadBuilder("RedBullRing/red-bull-ring-plan.json",nil,"resume")
assert(api.NextIndex == 2 and api.Config.Scale == 2 and #calls == 1, "Loading a checkpoint must not reset progress or publish")
pauseAfterFirst = false
api.Build()
assert(#calls == 2 and (calls[2][2].Position-expectedSecond.cf.Position).Magnitude<.000001 and calls[2][2].RightVector:Dot(expectedSecond.cf.RightVector)>.999999, "Resume must place only the remaining part at the original transform")
local originalChecksum = checkpointDocument.checksum
checkpointDocument.checksum = "mismatch"
ok = pcall(loadBuilder,"RedBullRing/red-bull-ring-plan.json",nil,"resume")
assert(not ok and _G.RedBullRingBuilder == api, "Mismatched checkpoint must not replace the current builder")
checkpointDocument.checksum = originalChecksum
local checkpointPlace = checkpointDocument.placeId
checkpointDocument.placeId = 110369730911937
ok = pcall(loadBuilder,"RedBullRing/red-bull-ring-plan.json",nil,"resume")
assert(not ok and _G.RedBullRingBuilder == api, "A checkpoint from another map must not resume in Jakarta")
checkpointDocument.placeId = checkpointPlace
local checkpointFormat = checkpointDocument.format
checkpointDocument.format = "red-bull-ring-checkpoint-v1"
ok = pcall(loadBuilder,"RedBullRing/red-bull-ring-plan.json",nil,"resume")
assert(not ok and _G.RedBullRingBuilder == api, "Legacy checkpoints without a map binding must use their original loader")
checkpointDocument.format = checkpointFormat
api = fresh()
api = loadBuilder("RedBullRing/red-bull-ring-plan.json",nil,"resume")
ok = pcall(api.Build)
assert(not ok and #calls == 0, "Resume must require the saved partial map to be loaded")
for k=8,13 do fixtureDocument.parts[1][k]=savedAxes[k] end

api = fresh()
reject = true
ok = pcall(api.Build)
ok = pcall(checkpointBuilder)
assert(not ok and #calls == 1, "An unconfirmed sent placement must not be exported as a fresh retry")

api = fresh()
placementOverride = function(o) o.Name = "ServerRenamedPart" end
ok, message = pcall(api.Build)
assert(not ok and message:find("ServerRenamedPart", 1, true) and #calls == 1, "Mismatch must identify the observed name and stop")
report = diagnoseBuilder()
assert(report:find("ServerRenamedPart", 1, true) and #calls == 1, "Diagnostic must show observed part without placing another")
ok = pcall(api.Build)
assert(not ok and #calls == 1, "Mismatched parts must not trigger duplicate requests")

api = fresh()
placementOverride = function(o) o.Name = string.format("E7938BEF-58C4-4E6D-AF52-B01A0BB379C%d", 3+#calls) end
api.Build()
assert(#calls == 2 and api.State == "complete", "UUID names must confirm valid placements")
api.Build()
assert(#calls == 2, "Completed UUID placements must not be resent")

api = fresh()
local duplicateTarget = api.GetTarget(1)
for _, name in ipairs({"{e7938bef-58c4-4e6d-af52-b01a0bb379c4}", "{e7938bef-58c4-4e6d-af52-b01a0bb379c5}"}) do
    local o = instance("Part")
    o.Name, o.CFrame, o.Size, o.Color, o.Material = name, duplicateTarget.cf, duplicateTarget.size, duplicateTarget.color, duplicateTarget.material
    o.Anchored, o.CanCollide, o.Parent = true, true, builds
end
ok, message = pcall(api.Build)
assert(not ok and message:find("Multiple matching",1,true) and #calls == 0, "UUID support must preserve ambiguity checks before sending")

api = fresh()
api.Config.Scale = 5000
ok = pcall(api.Build)
assert(not ok and #calls == 0, "Oversized parts must fail before publication")

api = fresh()
api.Config.ServerObjectLimit = 1
ok = pcall(api.Build)
assert(not ok and #calls == 0, "Known server object cap must be checked before publication")
api = fresh()
api.Config.SaveObjectLimit = 1
ok = pcall(api.Build)
assert(not ok and #calls == 0, "A confirmed save cap must stop placement before an unsavable build")
api = fresh()
placedCountOverride = function() return 10999 end
ok = pcall(api.Build)
assert(not ok and #calls == 0, "Server count must include streamed-out objects rather than just loaded children")
api = fresh()
local saverParent = saver.Parent
saver.Parent = nil
ok = pcall(api.Build)
saver.Parent = saverParent
assert(not ok and #calls == 0, "Missing Jakarta save-count endpoint must not fall back to a streamed local count")
for _, value in ipairs({-1, 1.5, math.huge, "Failed"}) do
    api = fresh()
    placedCountOverride = function() return value end
    ok = pcall(api.Build)
    assert(not ok and #calls == 0, "Invalid server counts must not allow placement")
end

api = fresh()
catalogNames = { "Rectangle A", "Rectangle B" }
local name = api.Inspect()
assert(name == "Rectangle A", "Multiple valid blocks must select a deterministic default")
api.CycleCatalog()
assert(api.Config.CatalogName == "Rectangle B", "Panel selection must cycle without console input")
api.Unload()
assert(_G.RedBullRingBuilder == nil, "Unload must make the upgraded builder reloadable")
api = fresh()
local savedRaycast = methods.Raycast
methods.Raycast = function() return nil end
local missingGround = pcall(api.GetTarget, 1)
methods.Raycast = savedRaycast
assert(not missingGround and #calls == 0, "A missing grass raycast must not place a road at character pivot height")
api.Unload()
local function withRoadRole()
    fresh()
    fixtureDocument.meta.catalogRoles = {{name="Others75",appearance="color",partIndices={0}}}
    catalogNames = {"Block","Others75"}
    return loadBuilder()
end
api = withRoadRole()
api.Inspect()
local roadTarget, plainTarget = api.GetTarget(1), api.GetTarget(2)
assert(roadTarget.name == "Others75" and roadTarget.material == "Concrete" and roadTarget.materialVariant == "TestPaving", "Road role must select Others75 and retain its material/variant")
assert(math.abs(roadTarget.color.R-65/255)<.000001 and plainTarget.name == "Block" and plainTarget.material == "Asphalt", "Only road-role parts get Others75; colour must use the grey palette")
preview = api.Preview()
assert(preview:GetChildren()[1].Material == "Concrete" and preview:GetChildren()[1].MaterialVariant == "TestPaving", "Preview must retain the road tile material")
pauseAfterFirst = true
api.Build()
assert(calls[1][1] == "Others75" and calls[1][6] == "Concrete" and calls[1][7] == "TestPaving", "Placement must send the road tile with its retained material and variant")
checkpoint = checkpointBuilder()
assert(checkpoint.catalogName == "Block" and checkpoint.applyAppearance and checkpoint.catalogRoles[1].name == "Others75", "A checkpoint on the road must preserve the base catalog, appearance and road role separately")
api = loadBuilder("RedBullRing/red-bull-ring-plan.json",nil,"resume")
pauseAfterFirst = false
api.Build()
assert(#calls == 2 and calls[2][1] == "Block" and api.State == "complete", "Resume must continue into the plain-block group without changing its catalog")
checkpointDocument.catalogRoles[1].name = "wrong-tile"
ok = pcall(loadBuilder,"RedBullRing/red-bull-ring-plan.json",nil,"resume")
assert(not ok and _G.RedBullRingBuilder == api, "Wrong road tile checkpoint must preserve the current session")
checkpointDocument.catalogRoles[1].name = "Others75"
checkpointDocument.catalogRoles[1].partIndices[1] = 1
ok = pcall(loadBuilder,"RedBullRing/red-bull-ring-plan.json",nil,"resume")
assert(not ok and _G.RedBullRingBuilder == api, "Changed road tile assignments must fail before replacing the session")
api = withRoadRole()
placementOverride = function(o) o.MaterialVariant = "WrongVariant" end
ok = pcall(api.Build)
assert(not ok and #calls == 1 and api.NextIndex == 1, "A changed tile material variant must not be falsely confirmed")
api = withRoadRole()
catalogNames = {"Block"}
ok = pcall(api.Build)
assert(not ok and #calls == 0, "Missing Others75 must fail before publishing any part")
api = withRoadRole()
local unwantedTexture = child(roadTemplate,"Texture","UnexpectedTexture")
ok = pcall(api.Build)
assert(not ok and #calls == 0, "A textured tile must require fresh inspection rather than using the old plain-block assumption")
unwantedTexture:Destroy()
api = withRoadRole()
fixtureDocument.meta.nonCollidingPartIndices = {1}
api = loadBuilder()
local drivingTarget, paintTarget = api.GetTarget(1), api.GetTarget(2)
assert(drivingTarget.canCollide == true and paintTarget.canCollide == false, "Road must collide and visual paint must not collide")
api.Build()
assert(api.State == "complete" and #calls == 2 and calls[1][8] == true and calls[2][8] == false, "The placement payload must preserve false collision flags and confirm them")
checkpoint = checkpointBuilder()
assert(checkpoint.nonCollidingPartIndices[1] == 1, "Checkpoint must preserve noncolliding surface assignments")
checkpointDocument.nonCollidingPartIndices = {}
ok = pcall(loadBuilder,"RedBullRing/red-bull-ring-plan.json",nil,"resume")
assert(not ok and _G.RedBullRingBuilder == api, "A checkpoint with different surface collisions must not replace the session")
checkpointDocument.nonCollidingPartIndices = {1}
api = loadBuilder("RedBullRing/red-bull-ring-plan.json",nil,"resume")
assert(api.NextIndex == 3, "Matching surface collisions must resume a completed checkpoint")
api = withRoadRole()
fixtureDocument.meta.nonCollidingPartIndices = {1}
api = loadBuilder()
placementOverride = function(o) o.CanCollide = true end
ok = pcall(api.Build)
assert(not ok and #calls == 2 and api.NextIndex == 2, "Server paint with collision enabled must fail confirmation")
api = withRoadRole()
placementOverride = function(o) o.CanCollide = false end
ok = pcall(api.Build)
assert(not ok and #calls == 1 and api.NextIndex == 1, "A noncolliding road must fail confirmation")
api = fresh()
for _, bad in ipairs({{2},{-1},{.5},{1,1}}) do
    fixtureDocument.meta.nonCollidingPartIndices = bad
    ok = pcall(loadBuilder)
    assert(not ok and _G.RedBullRingBuilder == api and #calls == 0, "Invalid collision assignments must fail before replacing the session")
end
api = fresh()
api.Unload()
assert(_G.MonzaBuilder == monzaSentinel and _G.MonzaTerrainBuilder == monzaTerrainSentinel, "Red Bull Ring must preserve both Monza sessions")
api = fresh()
monzaSentinel.State = "building"
assert(not pcall(api.Build) and #calls == 0, "Block concurrent Monza publication")
monzaSentinel.State = "paused"
monzaTerrainSentinel.State = "building"
assert(not pcall(api.Build) and #calls == 0, "Block concurrent Monza terrain publication")
monzaTerrainSentinel.State = "paused"
-- HTTP_LOADER_TESTS
assert(_G.SepangBuilder == elevatedSentinel, "All Red Bull Ring operations must preserve the elevated builder")
return "PASS: ribbon placement, UUIDs, preview, floor alignment, access, pause/resume and late results"
