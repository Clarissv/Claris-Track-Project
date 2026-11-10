-- Elevated Red Bull Ring builder for Jakarta (place 14005966837).
-- TUM centreline/widths with model elevation, low kerbs, pit lane and tidied runoff.
-- Template: use red-bull-ring-run.lua to load the builder and its separate JSON plan.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
assert(RunService:IsClient(), "RedBullRingBarriersBuilder must run on the client")
local TARGET_PLACE_ID = 14005966837
assert(game.PlaceId == TARGET_PLACE_ID, "Red Bull Ring: join Jakarta (place 14005966837) before loading this builder")
local player = Players.LocalPlayer

-- Adjust before the first build, or through _G.RedBullRingBarriersBuilder.Config.
local CONFIG = {
    CatalogName = nil, -- Auto-select a plain rectangular Part from the live manifest.
    Origin = nil, -- Map center at the asphalt surface. nil: grass beneath you.
    StartAt = "clear-area", -- Your standing point maps to the empty grass area beside the pit.
    Altitude = 0,
    GroundY = nil, -- Optional top height of your existing grass platform.
    GroundClearance = 0.25, -- Slight lift above the existing grass plate.
    YawDegrees = 0,
    Scale = 1, -- Additional multiplier; the plan already uses the accepted vehicle scale.
    PlacementInterval = 0.10,
    PlacementTimeout = 10,
    StreamingTimeout = 5, -- Ask Roblox to stream distant placement areas when enabled.
    FollowBuild = false, -- Move your character near the active section while building.
    FollowDistance = 48,
    FollowHeight = 12,
    FollowSettleTime = 0.10,
    MaxObjects = 705,
    ServerObjectLimit = 10000, -- Local count guard; Jakarta's server save cap is not established by the export.
    SaveObjectLimit = nil, -- Set only to a confirmed Jakarta save limit; includes other placed objects.
    ApplyAppearance = true, -- Color/material controls require the game's Build Tools Plus access.
}
-- The launcher passes a workspace-relative path; paste mode passes JSON directly.
local dataPath, inlineJson, launchMode, checkpointPath = ...
local raw = inlineJson
if raw == nil then
    dataPath = dataPath or "RedBullRingBarriers/red-bull-ring-plan.json"
    assert(type(dataPath) == "string", "Red Bull Ring: expected a workspace-relative plan path")
    assert(type(readfile) == "function", "Red Bull Ring: readfile is required to load the local JSON plan.")
    local ok, result = pcall(readfile, dataPath)
    assert(ok, "Red Bull Ring: cannot read " .. dataPath .. ". Copy the package's RedBullRingBarriers folder into the executor workspace. " .. tostring(result))
    raw = result
end
assert(type(raw) == "string", "Red Bull Ring: plan contents must be JSON text")
local decoded, document = pcall(function() return game:GetService("HttpService"):JSONDecode(raw) end)
assert(decoded and type(document) == "table", "Red Bull Ring: invalid plan JSON: " .. tostring(document))
local meta = document.meta
local PLAN = document.parts
assert(type(meta) == "table" and meta.format == "red-bull-ring-elevated-v1", "Red Bull Ring: incompatible plan. Copy the matching ribbon builder and plan together.")
assert(type(meta.gameTarget) == "table" and meta.gameTarget.placeId == TARGET_PLACE_ID and meta.gameTarget.name == "Jakarta", "Red Bull Ring: use the matching Jakarta plan and builder")
assert(type(PLAN) == "table" and #PLAN > 0 and #PLAN <= CONFIG.MaxObjects and meta.partCount == #PLAN, "Red Bull Ring: invalid plan count or exceeded " .. CONFIG.MaxObjects .. "-object budget")
local function finite(n) return type(n) == "number" and n == n and math.abs(n) < math.huge end
local anchor = meta.placementAnchor
local HAS_PLACEMENT_ANCHOR = anchor ~= nil
local PLAN_ANCHOR = Vector3.new(0,0,0)
if anchor then
    assert(type(anchor) == "table" and type(anchor.position) == "table" and #anchor.position == 3, "Red Bull Ring: invalid placement anchor")
    for _, n in ipairs(anchor.position) do assert(finite(n), "Red Bull Ring: invalid placement anchor coordinates") end
    assert(anchor.position[2] == 0, "Red Bull Ring: horizontal standing anchor must use the plan datum")
    PLAN_ANCHOR = Vector3.new(anchor.position[1],0,anchor.position[3])
end
if meta.variant == "clear-start-compact" then
    local domain = meta.startDomain
    assert(type(domain) == "table" and domain.halfSize == 200 and type(domain.center) == "table" and #domain.center == 2, "Red Bull Ring: missing clear starting area")
    assert(anchor and anchor.name == "clear-area" and anchor.position[1] == domain.center[1] and anchor.position[3] == domain.center[2], "Red Bull Ring: clear area and standing anchor differ")
end
local PALETTE = {}
assert(type(meta.palette) == "table" and #meta.palette > 0, "Red Bull Ring: missing palette")
for i, entry in ipairs(meta.palette) do
    assert(type(entry) == "table" and type(entry.rgb) == "table" and #entry.rgb == 3, "Red Bull Ring: invalid palette entry")
    for _, n in ipairs(entry.rgb) do assert(finite(n) and n >= 0 and n <= 255, "Red Bull Ring: invalid palette color") end
    local material = type(entry.material) == "string" and Enum.Material[entry.material]
    assert(material, "Red Bull Ring: unknown plan material")
    PALETTE[i] = {Color3.fromRGB(entry.rgb[1], entry.rgb[2], entry.rgb[3]), material}
end
for i, part in ipairs(PLAN) do
    assert(type(part) == "table" and #part == 13, "Red Bull Ring: invalid ribbon part " .. i)
    for _, n in ipairs(part) do assert(finite(n), "Red Bull Ring: invalid number in part " .. i) end
    for k = 4, 6 do assert(part[k] >= 0.001 and part[k] <= 2048, "Red Bull Ring: invalid dimensions in part " .. i) end
    assert(part[7] % 1 == 0 and PALETTE[part[7]], "Red Bull Ring: invalid palette index in part " .. i)
    local right, up = Vector3.new(part[8],part[9],part[10]), Vector3.new(part[11],part[12],part[13])
    assert(math.abs(right.Magnitude-1) < 0.002 and math.abs(up.Magnitude-1) < 0.002 and math.abs(right:Dot(up)) < 0.002 and up.Y > 0, "Red Bull Ring: invalid orientation in part " .. i)
end
local NON_COLLIDING_INDICES, NON_COLLIDING = meta.nonCollidingPartIndices or {}, {}
assert(type(NON_COLLIDING_INDICES) == "table", "Red Bull Ring: invalid collision assignments")
for _, index in ipairs(NON_COLLIDING_INDICES) do
    assert(finite(index) and index % 1 == 0 and index >= 0 and index < #PLAN and not NON_COLLIDING[index + 1], "Red Bull Ring: invalid or duplicate collision index")
    NON_COLLIDING[index + 1] = true
end
local CATALOG_ROLES, PART_ROLE = meta.catalogRoles or {}, {}
assert(type(CATALOG_ROLES) == "table", "Red Bull Ring: invalid catalog roles")
for roleIndex, role in ipairs(CATALOG_ROLES) do
    assert(type(role) == "table" and type(role.name) == "string" and #role.name > 0 and role.appearance == "color" and type(role.partIndices) == "table", "Red Bull Ring: invalid catalog role")
    for _, index in ipairs(role.partIndices) do
        assert(finite(index) and index % 1 == 0 and index >= 0 and index < #PLAN and not PART_ROLE[index + 1], "Red Bull Ring: invalid or duplicate catalog role index")
        PART_ROLE[index + 1] = roleIndex
    end
end
local bounds = meta.planBounds
assert(type(bounds) == "table" and type(bounds.min) == "table" and type(bounds.max) == "table" and #bounds.min == 3 and #bounds.max == 3, "Red Bull Ring: missing plan bounds")
for k = 1, 3 do assert(finite(bounds.min[k]) and finite(bounds.max[k]) and bounds.min[k] <= bounds.max[k], "Red Bull Ring: invalid plan bounds") end
local PLAN_BOUNDS = {Vector3.new(bounds.min[1], bounds.min[2], bounds.min[3]), Vector3.new(bounds.max[1], bounds.max[2], bounds.max[3])}
local REQUIRED_BASE = meta.requiredBase
assert(type(REQUIRED_BASE) == "table" and REQUIRED_BASE.count == 8293 and type(REQUIRED_BASE.checksum) == "string" and type(REQUIRED_BASE.version) == "string" and type(REQUIRED_BASE.references) == "table", "Missing matching road requirements")
assert(meta.variant == "clear-start-compact-barriers", "Use the matching barrier plan")
local INITIAL_SERVER_COUNT
local restoredCheckpoint
if launchMode == "resume" then
    local ok, contents = pcall(readfile, checkpointPath or "RedBullRingBarriers/red-bull-ring-barriers-jakarta-checkpoint.json")
    if not ok and checkpointPath then ok, contents = pcall(readfile, "RedBullRingBarriers/red-bull-ring-barriers-jakarta-checkpoint.json") end
    assert(ok, "Red Bull Ring: checkpoint is missing. Export it from the previous session first.")
    local decoded, saved = pcall(function() return game:GetService("HttpService"):JSONDecode(contents) end)
    assert(decoded and type(saved) == "table" and saved.format == "red-bull-ring-checkpoint-v2", "Red Bull Ring: use a Jakarta checkpoint; Jawa Timur checkpoints require their original loader")
    assert(saved.placeId == TARGET_PLACE_ID, "Red Bull Ring: checkpoint belongs to a different map; start a fresh Jakarta build")
    if saved.saveObjectLimit ~= nil then assert(finite(saved.saveObjectLimit) and saved.saveObjectLimit >= 1 and saved.saveObjectLimit % 1 == 0, "Red Bull Ring: invalid checkpoint save limit") end
    local checksum = 0
    for _, p in ipairs(PLAN) do for _, n in ipairs(p) do checksum = (checksum * 65599 + math.floor(n * 10000 + 0.5)) % 2147483647 end end
    assert(saved.count == #PLAN and saved.checksum == string.format("%.0f", checksum), "Red Bull Ring: checkpoint belongs to different track geometry")
    local savedCollision = saved.nonCollidingPartIndices or {}
    assert(type(savedCollision) == "table" and #savedCollision == #NON_COLLIDING_INDICES, "Red Bull Ring: checkpoint uses different surface collisions")
    for i, index in ipairs(NON_COLLIDING_INDICES) do assert(savedCollision[i] == index, "Red Bull Ring: checkpoint uses different surface collisions") end
    assert(finite(saved.nextIndex) and saved.nextIndex % 1 == 0 and saved.nextIndex >= 1 and saved.nextIndex <= #PLAN + 1, "Red Bull Ring: invalid checkpoint index")
    assert(type(saved.origin) == "table" and #saved.origin == 12 and finite(saved.scale) and saved.scale > 0, "Red Bull Ring: invalid checkpoint transform")
    for _, n in ipairs(saved.origin) do assert(finite(n), "Red Bull Ring: invalid checkpoint transform") end
    assert(type(saved.catalogName) == "string" and type(saved.applyAppearance) == "boolean", "Red Bull Ring: invalid checkpoint catalog")
    local savedRoles = saved.catalogRoles or {}
    assert(type(savedRoles) == "table" and #savedRoles == #CATALOG_ROLES, "Red Bull Ring: checkpoint uses different catalog roles")
    for i, role in ipairs(CATALOG_ROLES) do
        assert(type(savedRoles[i]) == "table" and savedRoles[i].name == role.name and savedRoles[i].appearance == role.appearance, "Red Bull Ring: checkpoint uses a different road tile")
        local indices = savedRoles[i].partIndices
        assert(type(indices) == "table" and #indices == #role.partIndices, "Red Bull Ring: checkpoint uses different road tile assignments")
        for k, index in ipairs(role.partIndices) do assert(indices[k] == index, "Red Bull Ring: checkpoint uses different road tile assignments") end
    end
    CONFIG.Origin, CONFIG.Scale = CFrame.new(table.unpack(saved.origin)), saved.scale
    CONFIG.CatalogName, CONFIG.ApplyAppearance = saved.catalogName, saved.applyAppearance
    if saved.saveObjectLimit ~= nil then CONFIG.SaveObjectLimit = saved.saveObjectLimit end
    if saved.expectedServerCount ~= nil then assert(finite(saved.expectedServerCount) and saved.expectedServerCount % 1 == 0 and saved.expectedServerCount >= REQUIRED_BASE.count + saved.nextIndex, "Red Bull Ring: invalid recovery prefix count") end
    assert(saved.expectedServerCount ~= nil, "Barrier checkpoint needs the combined server count")
    assert(saved.requiredBase and saved.requiredBase.version == REQUIRED_BASE.version and saved.requiredBase.checksum == REQUIRED_BASE.checksum and saved.requiredBase.count == REQUIRED_BASE.count, "Checkpoint belongs to a different base road")
    restoredCheckpoint = saved
end
-- Inherit the original road transform, never the player's current position.
local road = _G.RedBullRingClearStartCompactBuilder
assert(not road or road.State ~= "building", "Pause the road builder before loading barriers")
if not restoredCheckpoint then
    if road then
        assert(road.PlaceId == TARGET_PLACE_ID and road.Count == REQUIRED_BASE.count and road.NextIndex == road.Count + 1 and road.State ~= "unconfirmed", "Finish the matching compact road before adding barriers")
        local first = assert(road.GetTarget(REQUIRED_BASE.references[1].index), "No road transform")
        assert(typeof(first.origin) == "CFrame" and finite(first.scale) and first.scale > 0, "Missing road transform")
        CONFIG.Origin, CONFIG.Scale = first.origin, first.scale
        for _, reference in ipairs(REQUIRED_BASE.references) do
            local request, p = road.GetTarget(reference.index), reference.part
            local expected = CONFIG.Origin * CFrame.fromMatrix(Vector3.new(p[1],p[2],p[3]) * CONFIG.Scale, Vector3.new(p[8],p[9],p[10]), Vector3.new(p[11],p[12],p[13]))
            local a,b = {expected:GetComponents()}, {request.cf:GetComponents()}
            for k=1,12 do assert(math.abs(a[k]-b[k]) < (k<=3 and .003 or .00003), "Different road geometry; use the matching compact release") end
            assert((request.size-Vector3.new(p[4],p[5],p[6])*CONFIG.Scale).Magnitude < .003, "Different road dimensions")
        end
        local report = assert(road.VerifyServerCount(), "Could not verify completed road")
        assert(report.matches and report.serverCount >= REQUIRED_BASE.count + 1, "Road/server count mismatch; load the matching saved road")
        INITIAL_SERVER_COUNT = report.serverCount
    else
        assert(type(readfile) == "function", "Keep the completed compact road builder loaded, or export its checkpoint first")
        local ok, contents = pcall(readfile, "red-bull-ring-clear-start-compact-jakarta-checkpoint.json")
        if not ok then ok,contents=pcall(readfile,"RedBullRingClearStartCompact/red-bull-ring-clear-start-compact-jakarta-checkpoint.json") end
        assert(ok, "Load the completed compact road builder or export its matching checkpoint first")
        local saved = game:GetService("HttpService"):JSONDecode(contents)
        assert(type(saved)=="table" and saved.format=="red-bull-ring-checkpoint-v2" and saved.placeId==TARGET_PLACE_ID and saved.count==REQUIRED_BASE.count and saved.checksum==REQUIRED_BASE.checksum and saved.nextIndex==REQUIRED_BASE.count+1, "Base checkpoint must contain the completed matching road")
        assert(type(saved.origin)=="table" and #saved.origin==12 and finite(saved.scale) and saved.scale>0, "Invalid base checkpoint transform")
        for _, n in ipairs(saved.origin) do assert(finite(n),"Invalid base checkpoint transform") end
        CONFIG.Origin, CONFIG.Scale = CFrame.new(table.unpack(saved.origin)), saved.scale
        INITIAL_SERVER_COUNT = REQUIRED_BASE.count + 1
    end
end
raw, inlineJson, document = nil, nil, nil


if _G.RedBullRingBarriersBuilder then
    local previous = _G.RedBullRingBarriersBuilder
    assert(previous.State ~= "building", "Pause the previous build before loading this version")
    if previous.Unload then previous.Unload() else
        if previous.ClearPreview then previous.ClearPreview() end
        local gui = player:FindFirstChild("PlayerGui")
        local oldPanel = gui and gui:FindFirstChild("RedBullRingBarriersBuilderPanel")
        if oldPanel then oldPanel:Destroy() end
        _G.RedBullRingBarriersBuilder = nil
    end
end

local api = { Config = CONFIG, PlaceId = TARGET_PLACE_ID, Count = #PLAN, NextIndex = restoredCheckpoint and restoredCheckpoint.nextIndex or 1, ExpectedServerCount = restoredCheckpoint and restoredCheckpoint.expectedServerCount or INITIAL_SERVER_COUNT, Placed = {}, SentCount = 0, ReusedCount = 0, State = "ready", Phase = "ready" }
_G.RedBullRingBarriersBuilder = api
api.RequiredBase = REQUIRED_BASE
local preview, manifest, selected, origin, buildScale, appearance, pending, savedCamera
local catalogCandidates, candidateIndex = {}, 0
local roleSelected = {}
local busy, paused, previewing = false, false, false
local streamCenter, streamTask
local follower
local statusLabel, catalogButton
local owners, uuidOwners = {}, {}
local repairing = false
local function status(message, quiet)
    if not quiet then print("[RedBullRingBarriersBuilder] " .. message) end
    if statusLabel then statusLabel.Text = message end
end
local function remote(folder, name, class)
    local container = ReplicatedStorage:FindFirstChild("NetworkContainer")
    local collection = container and container:FindFirstChild(folder)
    local value = collection and collection:FindFirstChild(name)
    assert(value and value:IsA(class), "Missing game endpoint: " .. name .. ". Enable build tools first.")
    return value
end
local function hasPlus()
    local permanent, expiry = "BT_SubPermanent", "BT_SubExpiry"
    local modules = ReplicatedStorage:FindFirstChild("Modules")
    local source = modules and modules:FindFirstChild("BuildToolsSubConfig")
    if source then
        local ok, config = pcall(require, source)
        if ok and type(config) == "table" then
            permanent = config.PERMANENT_ATTRIBUTE or permanent
            expiry = config.ATTRIBUTE or expiry
        end
    end
    local untilTime = player:GetAttribute(expiry)
    return player:GetAttribute(permanent) == true or (type(untilTime) == "number" and os.time() < untilTime)
end
local function plainBlock(template)
    if not template or template.ClassName ~= "Part" or template.Shape ~= Enum.PartType.Block then return false end
    for _, child in ipairs(template:GetDescendants()) do
        if child:IsA("DataModelMesh") or child:IsA("Decal") or child:IsA("Texture") or child:IsA("SurfaceAppearance") or child:IsA("LuaSourceContainer") then return false end
    end
    return true
end
function api.Inspect()
    assert(not busy and not previewing, "Wait for the preview or pause the build before inspecting")
    local endpoint = remote("RemoteFunctions", "GetCatalogManifest", "RemoteFunction")
    local done, ok, result = false, false, nil
    task.spawn(function()
        ok, result = pcall(function() return endpoint:InvokeServer() end)
        done = true
    end)
    local deadline = os.clock() + 12
    repeat task.wait(0.05) until done or os.clock() >= deadline
    assert(done and ok and type(result) == "table", "Catalog query failed or timed out; inspect game build tools")
    manifest = result
    local folder = ReplicatedStorage:FindFirstChild("PlacementObject")
    folder = folder and folder:FindFirstChild("Object")
    assert(folder, "ReplicatedStorage.PlacementObject.Object is missing")
    local candidates, plus = {}, hasPlus()
    for _, entry in ipairs(manifest) do
        if type(entry) == "table" and type(entry.name) == "string" and type(entry.guid) == "string" then
            local template = folder:FindFirstChild(entry.guid, true)
            if plainBlock(template) then
                print(string.format("[RedBullRingBarriersBuilder] Block: %s | category=%s | plus=%s", entry.name, tostring(entry.category), tostring(entry.plus == true)))
                if not entry.plus or plus then table.insert(candidates, { entry = entry, template = template }) end
            end
        end
    end
    selected = nil
    table.sort(candidates, function(a, b) return a.entry.name < b.entry.name end)
    catalogCandidates = candidates
    api.CatalogCandidates = candidates
    if CONFIG.CatalogName then
        for _, candidate in ipairs(candidates) do if candidate.entry.name == CONFIG.CatalogName then selected = candidate end end
        assert(selected, "CatalogName must be an accessible plain rectangular Part; see printed candidates")
    else
        for _, preferred in ipairs({ "part", "block", "cube", "basic part", "basic block" }) do
            for _, candidate in ipairs(candidates) do
                if string.lower(candidate.entry.name) == preferred then selected = candidate; break end
            end
            if selected then break end
        end
        if not selected and #candidates > 0 then selected = candidates[1] end
    end
    assert(selected, "No accessible plain rectangular Part found; choose a different catalog name or inspect game access")
    roleSelected = {}
    for i, role in ipairs(CATALOG_ROLES) do
        for _, candidate in ipairs(candidates) do
            if candidate.entry.name == role.name then roleSelected[i] = candidate; break end
        end
        assert(roleSelected[i], "Required road tile " .. role.name .. " is missing, inaccessible, or is not a plain rectangular Part")
    end
    for i, candidate in ipairs(candidates) do if candidate == selected then candidateIndex = i end end
    if catalogButton then catalogButton.Text = "Block: " .. selected.entry.name .. "  >" end
    local roadInfo = #CATALOG_ROLES > 0 and (" Road: " .. CATALOG_ROLES[1].name .. ".") or ""
    status(string.format("%d parts. Catalog: %s.%s Appearance access: %s", #PLAN, selected.entry.name, roadInfo, plus and "yes" or "no"))
    return selected.entry.name, manifest
end
function api.CycleCatalog()
    assert(not busy and not previewing and api.NextIndex == 1 and not pending, "Choose a catalog block before starting the build")
    if #catalogCandidates == 0 then api.Inspect(); return end
    candidateIndex = candidateIndex % #catalogCandidates + 1
    selected = catalogCandidates[candidateIndex]
    CONFIG.CatalogName = selected.entry.name
    if catalogButton then catalogButton.Text = "Block: " .. selected.entry.name .. "  >" end
    status(string.format("Catalog %d / %d: %s", candidateIndex, #catalogCandidates, selected.entry.name))
end
local function resolveOrigin()
    assert(typeof(CONFIG.Origin) == "CFrame", "Load the completed matching road builder or its checkpoint first")
    return CONFIG.Origin
end
local function geometry(index, cf, scale)
    local p = PLAN[index]
    local position = Vector3.new(p[1], p[2], p[3]) * scale
    local frame = CFrame.fromMatrix(position, Vector3.new(p[8],p[9],p[10]), Vector3.new(p[11],p[12],p[13]))
    return cf * frame, Vector3.new(p[4], p[5], p[6]) * scale, PALETTE[p[7]]
end
local function makeRequest(index, cf, scale, apply)
    local frame, size, style = geometry(index, cf, scale)
    local roleIndex = PART_ROLE[index]
    local candidate = roleIndex and assert(roleSelected[roleIndex], "Inspect the required road tile first") or selected
    local template = candidate.template
    -- Others75 receives the requested road colour while preserving its live
    -- material/variant. Other groups use the normal plain-block palette.
    local color = roleIndex and not apply and template.Color or style[1]
    local material = roleIndex and template.Material or style[2]
    local variant = roleIndex and (template.MaterialVariant or "") or ""
    return {index=index, name=candidate.entry.name, cf=frame, size=size,
        appearance=apply, verifyAppearance=apply or roleIndex ~= nil,
        color=color, material=material, materialVariant=variant,
        baseCatalogName=selected.entry.name, applyAppearance=apply,
        origin=cf, scale=scale, canCollide=not NON_COLLIDING[index]}
end
local function validate(scale)
    assert(type(scale) == "number" and scale > 0 and scale < math.huge, "Scale must be positive and finite")
    assert(#PLAN <= CONFIG.MaxObjects, "Plan exceeds Config.MaxObjects; regenerate with a smaller part budget")
    assert(CONFIG.PlacementInterval >= 0.05 and CONFIG.PlacementTimeout >= 1 and CONFIG.PlacementTimeout <= 60, "Use interval >= 0.05 and timeout between 1 and 60 seconds")
    assert(type(CONFIG.StreamingTimeout) == "number" and CONFIG.StreamingTimeout >= 1 and CONFIG.StreamingTimeout <= 20, "StreamingTimeout must be between 1 and 20 seconds")
    assert(type(CONFIG.FollowBuild) == "boolean", "FollowBuild must be true or false")
    if CONFIG.FollowBuild then
        assert(type(CONFIG.FollowDistance) == "number" and CONFIG.FollowDistance >= 20 and CONFIG.FollowDistance <= 128, "FollowDistance must be between 20 and 128 studs")
        assert(type(CONFIG.FollowHeight) == "number" and CONFIG.FollowHeight >= 8 and CONFIG.FollowHeight <= 32, "FollowHeight must be between 8 and 32 studs")
        assert(type(CONFIG.FollowSettleTime) == "number" and CONFIG.FollowSettleTime >= 0 and CONFIG.FollowSettleTime <= 2, "FollowSettleTime must be between 0 and 2 seconds")
    end
    for _, p in ipairs(PLAN) do for i = 4, 6 do assert(p[i] * scale >= 0.001 and p[i] * scale <= 2048, "Scaled part exceeds game client size limits") end end
end
local function releaseFollower()
    local held = follower
    follower = nil
    if not held then return end
    local ok, reason = pcall(function()
        if player.Character == held.character then held.character:PivotTo(held.start) end
    end)
    -- Restore anchoring even if the character was replaced or PivotTo failed.
    local released, detail = pcall(function() held.root.Anchored = held.anchored end)
    if not ok or not released then status("Character restore: " .. tostring(reason or detail)) end
end
local function followTarget(request)
    if not CONFIG.FollowBuild then return end
    local character = player.Character
    local root = character and character:FindFirstChild("HumanoidRootPart")
    assert(root, "Spawn your character before using FollowBuild")
    local humanoid = character:FindFirstChildOfClass("Humanoid")
    assert(not humanoid or (humanoid.Health > 0 and not humanoid.SeatPart), "Stand outside your vehicle before using FollowBuild")
    assert(not follower or follower.character == character, "Character changed; pause and resume the build")
    if not follower then
        follower = { character = character, root = root, start = character:GetPivot(), anchored = root.Anchored }
        root.Anchored = true
    end
    if (root.Position - request.cf.Position).Magnitude > CONFIG.FollowDistance then
        character:PivotTo(CFrame.new(request.cf.Position + Vector3.new(0, request.size.Y / 2 + CONFIG.FollowHeight, 0)))
        streamCenter = nil
        task.wait(CONFIG.FollowSettleTime)
    end
    request.characterDistance = (root.Position - request.cf.Position).Magnitude
end
function api.GetTarget(index)
    assert(not busy and not previewing, "Pause the build or wait for preview generation")
    index = index or api.NextIndex
    assert(type(index) == "number" and index % 1 == 0 and PLAN[index], "Invalid track part index")
    if not selected then api.Inspect() end
    validate(buildScale or CONFIG.Scale)
    origin = origin or resolveOrigin()
    buildScale = buildScale or CONFIG.Scale
    local apply = appearance
    if apply == nil then apply = CONFIG.ApplyAppearance end
    return makeRequest(index, origin, buildScale, apply)
end
function api.ClearPreview()
    assert(not previewing, "Wait for preview generation to finish")
    if preview then preview:Destroy(); preview = nil end
end
function api.RestoreCamera()
    local camera = workspace.CurrentCamera
    if camera and savedCamera then
        camera.CameraType, camera.CameraSubject, camera.CFrame = savedCamera.kind, savedCamera.subject, savedCamera.cf
    end
    savedCamera = nil
end
function api.ViewMap()
    local camera = workspace.CurrentCamera
    if not camera then return end
    origin = origin or resolveOrigin()
    buildScale = buildScale or CONFIG.Scale
    if not savedCamera then savedCamera = { kind = camera.CameraType, subject = camera.CameraSubject, cf = camera.CFrame } end
    local center = origin * CFrame.new((PLAN_BOUNDS[1] + PLAN_BOUNDS[2]) * (buildScale / 2))
    local size = (PLAN_BOUNDS[2] - PLAN_BOUNDS[1]) * buildScale
    local distance = math.max(size.X, size.Z) * 0.8
    camera.CameraType = Enum.CameraType.Scriptable
    camera.CFrame = CFrame.lookAt(center.Position + Vector3.new(distance, distance * 0.65, distance), center.Position)
    camera.Focus = center
end
function api.Preview()
    assert(not busy and not previewing, "Wait for the preview or pause the build before previewing")
    validate(CONFIG.Scale)
    api.ClearPreview()
    origin = origin or resolveOrigin()
    buildScale = buildScale or CONFIG.Scale
    local cf, scale = origin, buildScale
    preview = Instance.new("Folder")
    preview.Name = "RedBullRingBarriersPreview_LOCAL"
    preview.Parent = workspace
    previewing = true
    local ok, reason = pcall(function()
    for i = 1, #PLAN do
        local part = Instance.new("Part")
        local target, size, style = geometry(i, cf, scale)
        part.Name = "Red Bull RingPreview"
        part.Anchored = true
        part.CanCollide = false
        part.CanTouch = false
        part.CanQuery = false
        part.Size = size
        part.CFrame = target
        part.Color = style[1]
        part.Material = style[2]
        local candidate = PART_ROLE[i] and roleSelected[PART_ROLE[i]]
        if candidate then part.Material, part.MaterialVariant = candidate.template.Material, candidate.template.MaterialVariant or "" end
        part.TopSurface = Enum.SurfaceType.Smooth
        part.BottomSurface = Enum.SurfaceType.Smooth
        part.Parent = preview
        if i % 100 == 0 then task.wait() end
    end
    if HAS_PLACEMENT_ANCHOR then
        local marker = Instance.new("Part")
        marker.Name = "StandingPoint_PREVIEW_ONLY"
        marker.Anchored, marker.CanCollide, marker.CanTouch, marker.CanQuery = true, false, false, false
        marker.Size = Vector3.new(8,4,8) * scale
        marker.CFrame = cf * CFrame.new((PLAN_ANCHOR + Vector3.new(0,2,0)) * scale)
        marker.Color, marker.Material = Color3.fromRGB(230,60,55), Enum.Material.SmoothPlastic
        marker.Parent = preview
    end
    end)
    previewing = false
    if not ok then api.ClearPreview(); error(reason, 0) end
    api.ViewMap()
    status(string.format("3D track preview: %d parts. Center: %.0f, %.0f, %.0f", #PLAN, cf.X, cf.Y, cf.Z))
    return preview
end
local UUID_PATTERN = "^" .. string.rep("%x",8) .. "%-" .. string.rep("%x",4) .. "%-" .. string.rep("%x",4) .. "%-" .. string.rep("%x",4) .. "%-" .. string.rep("%x",12) .. "$"
local function placedName(name, catalogName)
    if name == catalogName then return true end
    local id = name:match("^%{(.-)%}$") or name
    return #id == 36 and id:match(UUID_PATTERN) ~= nil
end
local function objectUuid(object)
    local id = object.Name:match("^%{(.-)%}$") or object.Name
    if #id == 36 and id:match(UUID_PATTERN) then return string.lower(id) end
end
local function matches(object, request, reuse)
    local owner = owners[object] or uuidOwners[objectUuid(object)]
    if owner and owner ~= request.index then return false, "object is already assigned to part " .. owner end
    if object.ClassName ~= "Part" or object.Shape ~= Enum.PartType.Block then return false, "class/shape differs from the catalog block" end
    -- Live server placements use UUID names, rather than their catalog labels.
    if not placedName(object.Name, request.name) then return false, "unrecognized name=" .. object.Name end
    local positionError = (object.Position - request.cf.Position).Magnitude
    -- Existing objects need a close geometric match: nearby short kerbs/paint
    -- are separate plan parts, even inside the replication tolerance.
    if positionError > (reuse and 0.01 or 0.25) then return false, string.format("position differs by %.3f studs", positionError) end
    local sizeError = (object.Size - request.size).Magnitude
    if sizeError > (reuse and 0.01 or 0.05) then return false, string.format("size differs by %.3f studs", sizeError) end
    if object.CFrame.RightVector:Dot(request.cf.RightVector) < 0.999 or object.CFrame.UpVector:Dot(request.cf.UpVector) < 0.999 then return false, "rotation/slope differs" end
    if request.verifyAppearance then
        local actual, expected = object.Color, request.color
        local difference = Vector3.new(actual.R - expected.R, actual.G - expected.G, actual.B - expected.B).Magnitude
        if difference > 0.03 then return false, string.format("color differs by %.3f", difference) end
        if object.Material ~= request.material then return false, "material=" .. tostring(object.Material) .. " (expected " .. tostring(request.material) .. ")" end
        if (object.MaterialVariant or "") ~= request.materialVariant then return false, "material variant differs" end
    end
    if object.CanCollide ~= request.canCollide then return false, "CanCollide differs (expected " .. tostring(request.canCollide) .. ")" end
    if not object.Anchored then return false, "Anchored=false" end
    return true
end
local function requestStream(request, force)
    request.streaming = workspace.StreamingEnabled == true
    if not request.streaming then return end
    if CONFIG.FollowBuild then
        request.streamSkipped = "character follow"
        return
    end
    if not force and streamCenter and (streamCenter - request.cf.Position).Magnitude < 48 then return end
    if streamTask and not streamTask.done then
        request.streamError = "Previous streaming call is still running; continued without another call"
        return
    end
    local attempt = { done = false }
    streamTask = attempt
    request.streamWaiting = true
    task.spawn(function()
        attempt.ok, attempt.reason = pcall(function() player:RequestStreamAroundAsync(request.cf.Position, CONFIG.StreamingTimeout) end)
        attempt.done = true
    end)
    local deadline = os.clock() + CONFIG.StreamingTimeout
    while not attempt.done and not paused and os.clock() < deadline do task.wait(0.05) end
    request.streamWaiting = false
    request.streamRequested = attempt.done and attempt.ok == true
    if request.streamRequested then
        streamCenter = request.cf.Position
    else
        request.streamError = attempt.done and tostring(attempt.reason) or "Streaming wait expired; continued to placement confirmation"
    end
end
local function failureDetail(request)
    local nearest, distance
    for _, object in ipairs(request.observed or {}) do
        if object:IsA("BasePart") then
            local delta = (object.Position - request.cf.Position).Magnitude
            if not distance or delta < distance then nearest, distance = object, delta end
        end
    end
    if nearest then
        local _, reason = matches(nearest, request)
        return "Observed new Part: " .. (reason or "matches now; use Resume to reconcile")
    end
    return string.format("%d new children observed; streaming=%s. Run the diagnostic script.", #(request.observed or {}), tostring(request.streaming))
end
function api.RequestDiagnostics()
    -- Read-only snapshot of the request; this never places or retries an object.
    return pending or api.LastRequest
end
local function findPlacement(folder, request)
    local found
    for _, object in ipairs(folder:GetChildren()) do
        if matches(object, request, true) then
            if found then return nil, "Multiple matching objects; placement ownership is ambiguous" end
            found = object
        end
    end
    return found
end
local function record(object, index, sent)
    local owner = owners[object] or uuidOwners[objectUuid(object)]
    assert(not owner or owner == index, "One server object cannot confirm two plan parts")
    owners[object] = index
    local uuid = objectUuid(object)
    if uuid then uuidOwners[uuid] = index end
    api.Placed[index] = object
    if sent then
        api.SentCount = api.SentCount + 1
        if api.ExpectedServerCount then api.ExpectedServerCount = api.ExpectedServerCount + 1 end
    else api.ReusedCount = api.ReusedCount + 1 end
    api.NextIndex = index + 1
    pending = nil
end
local function queryServerCount()
    local saver = remote("RemoteFunctions", "BuildSaver", "RemoteFunction")
    local done, result, queryOk = false, nil, false
    task.spawn(function() queryOk, result = pcall(function() return saver:InvokeServer("GetPlacedAmount") end); done = true end)
    local deadline = os.clock() + 12
    repeat task.wait(0.05) until done or os.clock() >= deadline
    assert(done and queryOk and type(result) == "number" and result >= 0 and result < math.huge and result % 1 == 0, "Could not verify Jakarta's placed-object count")
    api.ServerCount = result
    return result
end
function api.VerifyServerCount()
    assert(not busy and not previewing, "Pause the build before checking its server count")
    local count = queryServerCount()
    local report = {serverCount=count, expectedServerCount=api.ExpectedServerCount,
        confirmedPlanParts=api.NextIndex-1, planParts=#PLAN, sentCount=api.SentCount, reusedCount=api.ReusedCount}
    report.matches = report.expectedServerCount ~= nil and count == report.expectedServerCount
    api.LastCountReport = report
    return report
end
function api.Pause()
    paused = true
    status("Pausing after the current placement resolves")
end
-- Explicit diagnostic saves; all requests use the game's existing slot endpoint.
local function requestSlotSave(slot,internal)
local _savingBuilder=internal and api or nil
-- Jakarta's own BuildSaver request. A numeric argument explicitly chooses the
-- slot to overwrite. This does not serialize the build locally or bypass saves.
local function saveSlot(slot)
    if type(slot) == "string" and slot:match("^[1-4]$") then slot = tonumber(slot) end
    assert(type(slot) == "number" and slot >= 1 and slot <= 4 and slot % 1 == 0, "Choose a save slot from 1 to 4")
    assert(game.PlaceId == 14005966837, "Join Jakarta before saving the circuit")
    local prior = _G.RedBullRingSlotSave
    assert(not (prior and prior.busy), "A script save request is already running")
    local storage = game:GetService("ReplicatedStorage")
    local player = game:GetService("Players").LocalPlayer
    local shared = assert(storage:FindFirstChild("Shared"), "Jakarta's Shared folder is missing")
    local owner = assert(shared:FindFirstChild("ServerOwner"), "Jakarta's ServerOwner is missing")
    assert(owner.Value == player.UserId, "Only Jakarta's server owner can save this build")
    assert(workspace:FindFirstChild("EditableBuilds"), "Enable build tools and load or build the circuit first")
    local builders = {_G.RedBullRingBarriersBuilder, _G.RedBullRingClearStartCompactBuilder, _G.RedBullRingClearStartBuilder, _G.RedBullRingBuilder, _G.MonzaBuilder, _G.MonzaTerrainBuilder, _G.SepangBuilder, _G.SepangFlatBuilder}
    local current = _G.RedBullRingBarriersBuilder or _G.RedBullRingBuilder
    for _,api in pairs(builders) do
        assert((api.State ~= "building" or api == _savingBuilder), "Pause the active builder and wait for its current placement before saving")
    end
    assert(not current or current.State ~= "unconfirmed", "Reconcile the unconfirmed placement before saving")
    local container = assert(storage:FindFirstChild("NetworkContainer"), "NetworkContainer is missing")
    local functions = assert(container:FindFirstChild("RemoteFunctions"), "RemoteFunctions is missing")
    local events = assert(container:FindFirstChild("RemoteEvents"), "RemoteEvents is missing")
    local counter = assert(functions:FindFirstChild("BuildSaver"), "BuildSaver count endpoint is missing")
    local endpoint = assert(events:FindFirstChild("BuildSaver"), "BuildSaver save endpoint is missing")
    local message = assert(events:FindFirstChild("ChatMessage"), "Jakarta's save notification endpoint is missing")
    assert(endpoint:IsA("RemoteEvent") and counter:IsA("RemoteFunction"), "Jakarta's save endpoint types changed")
    local report = {slot=slot,status="checking",busy=true,requestedAt=os.clock(),messages={}}
    _G.RedBullRingSlotSave = report
    local cooldown = _G.RedBullRingSaveClock
    if not cooldown then
        cooldown = {notBefore=os.clock()+31}
        _G.RedBullRingSaveClock = cooldown
    end
    local connected
    local ok,reason = pcall(function()
        if os.clock()<cooldown.notBefore then
            report.status="cooldown"
            print(string.format("[Red Bull Ring save] Waiting %.1f seconds for the save cooldown; placement stays paused.",cooldown.notBefore-os.clock()))
        end
        while os.clock()<cooldown.notBefore do
            if _savingBuilder and paused then report.status="cancelled";return end
            task.wait(math.min(.1,cooldown.notBefore-os.clock()))
        end
        if _savingBuilder and paused then report.status="cancelled";return end
        report.status="checking"
        assert(owner.Value==player.UserId,"The server owner changed during the save cooldown; no save was sent")
        local done,countOk,count = false,false,nil
        task.spawn(function() countOk,count=pcall(function() return counter:InvokeServer("GetPlacedAmount") end);done=true end)
        local deadline=os.clock()+12
        repeat task.wait(.05) until done or os.clock()>=deadline
        assert(done and countOk and type(count)=="number" and count==count and count<math.huge and count%1==0, "The server object count could not be verified; no save was sent")
        assert(count>=2, "Only grass or an empty build is loaded. Load or rebuild the circuit before saving; no save was sent")
        report.objectCount=count
        for _,api in pairs(builders) do
            assert((api.State ~= "building" or api == _savingBuilder), "The builder became active while checking the save count")
        end
        assert(not current or (current.State ~= "unconfirmed" and (current.ExpectedServerCount==nil or current.ExpectedServerCount==count)), "Builder/server count mismatch; run diagnose before saving")
        local sent=false
        connected=message.OnClientEvent:Connect(function(text)
            if not sent or type(text)~="string" then return end
            local lower=string.lower(text)
            if not lower:find("sav",1,true) then return end
            if #report.messages<20 then report.messages[#report.messages+1]=text end
            if report.status~="requested" then return end
            if lower:find("failed to save",1,true) then report.status="failed";report.serverMessage=text
            elseif lower:find("successfully saved",1,true) or lower:find("saved successfully",1,true) then report.status="success";report.serverMessage=text end
        end)
        print(string.format("[Red Bull Ring save] Saving %d objects to slot %d. This replaces that slot's old save.",count,slot))
        report.status="requested";report.sentAt=os.clock();sent=true
        cooldown.notBefore=report.sentAt+31
        -- Verified in Jakarta's exported BUILDSLOT Yes.Activated callback.
        endpoint:FireServer("Save",slot)
        local deadline=os.clock()+45
        while report.status=="requested" and os.clock()<deadline do task.wait(.05) end
        if report.status=="requested" then report.status="unknown";report.serverMessage="No terminal save reply arrived within 45 seconds. Check Jakarta's UI; the request may still be running." end
        report.elapsedSeconds=os.clock()-report.sentAt
    end)
    if connected then connected:Disconnect() end
    if report.sentAt then cooldown.notBefore=math.max(cooldown.notBefore,os.clock()+31) end
    report.busy=false
    if not ok then report.status="error";report.error=tostring(reason);error(reason,0) end
    print(string.format("[Red Bull Ring save] Slot %d: %s. %s",slot,report.status,tostring(report.serverMessage)))
    return report
end
return saveSlot(slot)

end
function api.Save(slot)
assert(not busy,"Pause the builder and wait for its current placement or save")
return requestSlotSave(slot,false)
end
local AUTO_GROUPS = {{"barriers",1,425}}
local function saveGroups(first,last)
    local names={}
    for _,group in ipairs(AUTO_GROUPS) do
        if first<=group[3] and last>=group[2] then names[#names+1]=group[1] end
    end
    return #names>0 and table.concat(names,", ") or "plan"
end
local function nextSaveCount(auto,count)
    local interval=count>=auto.fineFrom and auto.fineEvery or auto.every
    local nextCount=(math.floor(count/interval)+1)*interval
    if count<auto.fineFrom then nextCount=math.min(nextCount,auto.fineFrom) end
    return nextCount
end
function api.EnableAutoSave(slot,options)
    assert(not busy and not previewing and not pending,"Pause and reconcile the build before enabling autosave")
    slot=tonumber(slot)
    assert(slot and slot>=1 and slot<=4 and slot%1==0,"Choose an autosave slot from 1 to 4")
    options=options or {}
    local auto={slot=slot,every=options.every or 500,fineFrom=options.fineFrom or 8500,fineEvery=options.fineEvery or 100,
        status="armed",history={},startedAt=os.clock(),loadedPrefixConfirmed=restoredCheckpoint and restoredCheckpoint.nextIndex-1 or 0}
    for _,key in ipairs({"every","fineFrom","fineEvery"}) do
        local value=auto[key]
        assert(type(value)=="number" and value>=1 and value<math.huge and value%1==0,"Autosave intervals must be positive integers")
    end
    local shared=ReplicatedStorage:FindFirstChild("Shared")
    local owner=shared and shared:FindFirstChild("ServerOwner")
    assert(owner and owner.Value==player.UserId,"Only Jakarta's server owner can enable autosave")
    remote("RemoteEvents","BuildSaver","RemoteEvent")
    remote("RemoteEvents","ChatMessage","RemoteEvent")
    _G.RedBullRingSaveClock=_G.RedBullRingSaveClock or {notBefore=os.clock()+31}
    api.AutoSave=auto
    _G.RedBullRingBarriersAutoSave=auto
    status(string.format("Autosave armed: slot %d; every %d objects, every %d from %d. Inspect / Preview, then Build.",slot,auto.every,auto.fineEvery,auto.fineFrom))
    return auto
end
function api.DisableAutoSave()
    assert(not busy,"Pause the build and wait for its save request before disabling autosave")
    if api.AutoSave then api.AutoSave.status="disabled" end
    api.AutoSave=nil
end
function api.AutoSaveReport()
    local auto=api.AutoSave or _G.RedBullRingBarriersAutoSave
    assert(auto,"No diagnostic autosave run is recorded")
    for _,entry in ipairs(auto.history) do
        print(string.format("[Red Bull Ring autosave] %s: %s objects; parts %d-%d (%s). %s",entry.status,
            tostring(entry.objectCount or entry.expectedObjectCount),entry.firstAddedIndex,entry.lastAddedIndex,entry.groups,tostring(entry.serverMessage or entry.error or "")))
    end
    if auto.lastSuccess then print("[Red Bull Ring autosave] Last successful count: "..auto.lastSuccess.objectCount) end
    return auto
end
local function autosaveCheckpoint()
    local auto=api.AutoSave
    if not auto or paused then return end
    local confirmed=api.NextIndex-1
    if confirmed<1 then return end
    auto.nextObjectCount=auto.nextObjectCount or nextSaveCount(auto,api.ExpectedServerCount)
    if api.ExpectedServerCount<auto.nextObjectCount and api.NextIndex<=#PLAN then return end
    if auto.lastSuccess and auto.lastSuccess.confirmedPlanParts==confirmed then return end
    local first=auto.lastSuccess and auto.lastSuccess.confirmedPlanParts+1 or auto.loadedPrefixConfirmed+1
    api.Phase="saving"
    auto.status="saving"
    status(string.format("Autosave: %d objects to slot %d; placement paused for cooldown and reply",api.ExpectedServerCount,auto.slot))
    local ok,result=pcall(requestSlotSave,auto.slot,true)
    if not ok then
        result={slot=auto.slot,status="error",error=tostring(result)}
    end
    result.confirmedPlanParts=confirmed
    result.expectedObjectCount=api.ExpectedServerCount
    result.firstAddedIndex,result.lastAddedIndex=first,confirmed
    result.groups=saveGroups(first,confirmed)
    auto.history[#auto.history+1]=result
    auto.status=result.status
    if result.status=="success" then
        auto.lastSuccess=result
        auto.nextObjectCount=nextSaveCount(auto,api.ExpectedServerCount)
        status(string.format("Saved %d objects; parts %d-%d (%s). Continuing.",result.objectCount,first,confirmed,result.groups))
    elseif result.status~="cancelled" then
        auto.firstFailure=auto.firstFailure or result
        paused=true
        auto.stopMessage=string.format("SAVE %s at %d objects. Last success: %s. Added parts %d-%d (%s). Placement stopped; inspect the save report.",
            result.status,api.ExpectedServerCount,auto.lastSuccess and tostring(auto.lastSuccess.objectCount) or "none",first,confirmed,result.groups)
        status(auto.stopMessage)
    end
    api.Phase="building"
end

function api.Build()
    assert(not (_G.RedBullRingClearStartCompactBuilder and _G.RedBullRingClearStartCompactBuilder.State == "building"), "Pause the road builder before building barriers")
    assert(not (_G.RedBullRingSlotSave and _G.RedBullRingSlotSave.busy), "Wait for the current slot save before building")
    assert(not (api.AutoSave and api.AutoSave.firstFailure), "Autosave stopped at a failed or unknown save. Inspect AutoSaveReport before explicitly disabling or re-arming it")
    assert(not ((_G.SepangBuilder and _G.SepangBuilder.State == "building") or (_G.SepangFlatBuilder and _G.SepangFlatBuilder.State == "building")), "Pause the Sepang builder before building Red Bull Ring")
    assert(not busy and not previewing, "Wait for the preview to finish; only one build can run")
    if api.NextIndex > #PLAN and not (api.AutoSave and (not api.AutoSave.lastSuccess or api.AutoSave.lastSuccess.confirmedPlanParts < #PLAN)) then
        local report = api.VerifyServerCount()
        assert(report.matches, "Server object count changed after completion; run diagnose before saving")
        status("Build already complete; server count verified: " .. report.serverCount)
        return
    end
    assert(not ((_G.MonzaBuilder and _G.MonzaBuilder.State == "building") or (_G.MonzaTerrainBuilder and _G.MonzaTerrainBuilder.State == "building")), "Pause the Monza builder before building Red Bull Ring")
    assert(not (_G.RedBullRingBuilder and _G.RedBullRingBuilder.State == "building"), "Pause the standard Red Bull Ring builder before building this version")
    assert(not (_G.RedBullRingClearStartBuilder and _G.RedBullRingClearStartBuilder.State == "building"), "Pause the original clear-start builder before building compact terrain")
    local folder = workspace:FindFirstChild("EditableBuilds")
    assert(folder, "EditableBuilds is missing; enable build tools")
    local gui = player:FindFirstChild("PlayerGui")
    assert(gui and gui:FindFirstChild("AdvanceBuildTools"), "Enable the game's build tools before building")
    if not selected then api.Inspect() end
    if appearance == true or (appearance == nil and CONFIG.ApplyAppearance) then assert(hasPlus(), "The game's color/material controls require Build Tools Plus. Use that access, or set ApplyAppearance=false for template appearance.") end
    validate(buildScale or CONFIG.Scale)
    local endpoint = remote("RemoteEvents", "PlacementSystem", "RemoteEvent")
    origin = origin or resolveOrigin()
    buildScale = buildScale or CONFIG.Scale
    if appearance == nil then appearance = CONFIG.ApplyAppearance end
    paused = false
    if pending then
        local moved, object, reason = pcall(function()
            followTarget(pending)
            requestStream(pending, true)
            return findPlacement(folder, pending)
        end)
        releaseFollower()
        assert(moved, object)
        assert(object, reason or ("Previous request is unconfirmed. " .. failureDetail(pending) .. " No duplicate sent."))
        record(object, pending.index, true)
    end
    -- Jakarta's save UI queries the server count, including objects streamed out locally.
    local currentCount = queryServerCount()
    assert(not api.ExpectedServerCount or currentCount == api.ExpectedServerCount, "Server object count changed since the previous pause; run diagnose before resuming")
    api.ExpectedServerCount = currentCount
    if api.AutoSave then api.AutoSave.nextObjectCount = api.AutoSave.nextObjectCount or nextSaveCount(api.AutoSave,currentCount) end
    local remainingCount = #PLAN - api.NextIndex + 1
    if restoredCheckpoint then
        assert(currentCount >= REQUIRED_BASE.count + api.NextIndex, "Load your saved partial build before resuming this checkpoint")
    end
    if not repairing then assert(currentCount + remainingCount <= CONFIG.ServerObjectLimit, string.format("%d existing + %d remaining exceeds the %d object limit; use Repair to inspect an existing matching build", currentCount, remainingCount, CONFIG.ServerObjectLimit)) end
    if not repairing then assert(currentCount + remainingCount < 9000, "Compact build exceeds its 8999 total-object target. Load the completed matching road and barrier checkpoint.") end
    if CONFIG.SaveObjectLimit ~= nil then
        assert(type(CONFIG.SaveObjectLimit) == "number" and CONFIG.SaveObjectLimit >= 1 and CONFIG.SaveObjectLimit < math.huge and CONFIG.SaveObjectLimit % 1 == 0, "SaveObjectLimit must be a confirmed positive integer")
        if not repairing then assert(currentCount + remainingCount <= CONFIG.SaveObjectLimit, string.format("%d existing + %d remaining exceeds the confirmed Jakarta save limit of %d", currentCount, remainingCount, CONFIG.SaveObjectLimit)) end
    end
    api.ClearPreview()
    paused, busy, api.State = false, true, "building"
    -- Index confirmed/pre-existing objects once. New requests wait only on newly added
    -- children instead of repeatedly scanning thousands of unrelated objects.
    local buckets = {}
    local function bucketKey(position)
        return string.format("%d:%d:%d", math.floor(position.X), math.floor(position.Y), math.floor(position.Z))
    end
    local function indexObject(object)
        if not object:IsA("BasePart") then return end
        local key = bucketKey(object.Position)
        buckets[key] = buckets[key] or {}
        table.insert(buckets[key], object)
    end
    for _, object in ipairs(folder:GetChildren()) do indexObject(object) end
    local function indexedMatch(request)
        local pos, found = request.cf.Position, nil
        for x = -1, 1 do for y = -1, 1 do for z = -1, 1 do
            local key = bucketKey(pos + Vector3.new(x, y, z))
            for _, object in ipairs(buckets[key] or {}) do
                if object.Parent == folder and matches(object, request, true) then
                    if found and found ~= object then return nil, "Multiple matching objects; placement ownership is ambiguous" end
                    found = object
                end
            end
        end end end
        return found
    end
    local connection, streamConnection
    local ok, reason = pcall(function()
        streamConnection = folder.ChildAdded:Connect(indexObject)
        autosaveCheckpoint()
        while api.NextIndex <= #PLAN and not paused do
            local index = api.NextIndex
            local request = makeRequest(index, origin, buildScale, appearance)
            api.LastRequest = request
            api.Phase = "moving"
            if CONFIG.FollowBuild then status(string.format("Confirmed %d / %d; moving near part %d", index - 1, #PLAN, index), true) end
            followTarget(request)
            api.Phase = "streaming"
            if not CONFIG.FollowBuild and workspace.StreamingEnabled then status(string.format("Confirmed %d / %d; streaming part %d (bounded wait)", index - 1, #PLAN, index), true) end
            requestStream(request)
            if paused then break end
            api.Phase = "checking"
            local already, duplicateReason = indexedMatch(request)
            assert(not duplicateReason, duplicateReason)
            if already then
                -- A confirmed matching part can be reused after reloading the script.
                record(already, index)
            else
                assert(api.ExpectedServerCount + 1 <= CONFIG.ServerObjectLimit, "The next missing part would exceed the local server object guard")
                assert(not CONFIG.SaveObjectLimit or api.ExpectedServerCount + 1 <= CONFIG.SaveObjectLimit, "The next missing part would exceed the confirmed save object limit")
                pending = request
                local started = os.clock()
                local candidates = {}
                request.observed = candidates
                request.beforeCount = #folder:GetChildren()
                connection = folder.ChildAdded:Connect(function(object) table.insert(candidates, object) end)
                api.Phase = "confirming"
                status(string.format("Confirmed %d / %d; confirming part %d", index - 1, #PLAN, index), true)
                endpoint:FireServer(request.name, request.cf, request.size, 0, request.appearance and request.color or nil, request.appearance and request.material or nil, request.appearance and request.materialVariant or nil, request.canCollide)
                local object, refreshed
                local deadline = started + CONFIG.PlacementTimeout
                repeat
                    task.wait(0.05)
                    for _, candidate in ipairs(candidates) do
                        if candidate.Parent == folder and matches(candidate, request) then
                            assert(not object or object == candidate, "Multiple matching objects; placement ownership is ambiguous")
                            object = candidate
                        end
                    end
                    if not object and os.clock() >= deadline and request.streaming and not refreshed then
                        -- Refresh the exact target before concluding that its result is
                        -- missing. This only streams/reconciles; it sends no new placement.
                        refreshed = true
                        requestStream(request, true)
                        deadline = os.clock() + CONFIG.StreamingTimeout
                    end
                until object or os.clock() >= deadline
                connection:Disconnect()
                connection = nil
                -- A final scan catches replication that raced ChildAdded/property updates.
                if not object then object, duplicateReason = findPlacement(folder, request) end
                assert(not duplicateReason, duplicateReason)
                assert(object, string.format("Unconfirmed part %d. %s No automatic retry.", index, failureDetail(request)))
                indexObject(object)
                record(object, index, true)
                local remaining = CONFIG.PlacementInterval - (os.clock() - started)
                if remaining > 0 then task.wait(remaining) end
            end
            autosaveCheckpoint()
            if not paused and (index == 1 or index % 25 == 0) then status(string.format("Confirmed %d / %d parts", index, #PLAN)) end
        end
        -- Compare with the same authoritative count used by the game's save UI.
        -- Streaming changes the local folder count, so it cannot establish this.
        api.Phase = "verifying server count"
        local serverCount = queryServerCount()
        if serverCount ~= api.ExpectedServerCount then
            task.wait(0.5)
            serverCount = queryServerCount()
        end
        assert(serverCount == api.ExpectedServerCount, string.format("Server count mismatch: expected %d, got %d. Run diagnose before saving.", api.ExpectedServerCount, serverCount))
    end)
    if connection then connection:Disconnect() end
    if streamConnection then streamConnection:Disconnect() end
    releaseFollower()
    busy = false
    api.State = not ok and "unconfirmed" or (api.NextIndex > #PLAN and "complete" or "paused")
    if ok and api.AutoSave and api.AutoSave.firstFailure then api.State = "save_" .. api.AutoSave.firstFailure.status end
    if ok and api.AutoSave and api.AutoSave.status == "cancelled" then api.State = "paused" end
    api.Phase = api.State
    if not ok then error(reason, 0) end
    if api.AutoSave and api.AutoSave.firstFailure then status(api.AutoSave.stopMessage); return api.AutoSave end
    status(api.State == "complete" and string.format("Complete: %d track parts; %d server objects verified. %s", #PLAN, api.ServerCount, api.AutoSave and "Autosave confirmed." or "Save through the game's build-slot UI.") or string.format("Paused at %d / %d; server objects=%d; Build / Resume continues", api.NextIndex - 1, #PLAN, api.ServerCount))
end
function api.Repair()
    error("Use the matching barriers checkpoint to resume. Diagnose unconfirmed requests before continuing.")
end

local screen = Instance.new("ScreenGui")
screen.Name = "RedBullRingBarriersBuilderPanel"
screen.ResetOnSpawn = false
screen.Parent = player:WaitForChild("PlayerGui")
local panel = Instance.new("Frame")
panel.Size = UDim2.fromOffset(330, 401)
panel.Position = UDim2.new(0, 18, 0.5, -177)
panel.BackgroundColor3 = Color3.fromRGB(24, 28, 35)
panel.Parent = screen
local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -24, 0, 40)
title.Position = UDim2.fromOffset(12, 4)
title.BackgroundTransparency = 1
title.Text = "RED BULL RING BARRIERS"
title.TextColor3 = Color3.fromRGB(240, 240, 240)
title.Font = Enum.Font.GothamBold
title.TextSize = 18
title.Parent = panel
statusLabel = Instance.new("TextLabel")
statusLabel.Size = UDim2.new(1, -24, 0, 74)
statusLabel.Position = UDim2.fromOffset(12, 44)
statusLabel.BackgroundTransparency = 1
statusLabel.TextColor3 = Color3.fromRGB(195, 205, 215)
statusLabel.Font = Enum.Font.Gotham
statusLabel.TextSize = 13
statusLabel.TextWrapped = true
statusLabel.Parent = panel
local function button(text, x, y, callback)
    local control = Instance.new("TextButton")
    control.Size = UDim2.fromOffset(146, 38)
    control.Position = UDim2.fromOffset(x, y)
    control.BackgroundColor3 = Color3.fromRGB(50, 67, 86)
    control.TextColor3 = Color3.new(1, 1, 1)
    control.Font = Enum.Font.GothamMedium
    control.TextSize = 13
    control.Text = text
    control.Parent = panel
    local running = false
    control.Activated:Connect(function()
        if running then return end
        running = true
        local ok, reason = pcall(callback)
        running = false
        if not ok then status(tostring(reason)) end
    end)
    return control
end
catalogButton = button("Choose block  >", 12, 122, api.CycleCatalog)
catalogButton.Size = UDim2.fromOffset(306, 32)
button("Inspect catalog", 12, 166, api.Inspect)
button("3D preview", 172, 166, api.Preview)
button("Build / Resume", 12, 212, api.Build)
button("Pause", 172, 212, api.Pause)
button("View map", 12, 258, api.ViewMap)
button("Back camera", 172, 258, api.RestoreCamera)
button("Clear preview", 12, 304, api.ClearPreview)
button("Hide panel", 172, 304, function() screen.Enabled = false end)
button("Follow placement", 12, 350, function()
    assert(not busy and not previewing, "Pause before changing follow placement")
    CONFIG.FollowBuild = not CONFIG.FollowBuild
    status(CONFIG.FollowBuild and "Follow placement on: stand outside the car before building" or "Follow placement off: use bounded streaming while you drive")
end)
button("Check server count", 172, 350, function()
    local report = api.VerifyServerCount()
    status(string.format("Save UI objects: %d; expected: %s; %s", report.serverCount, tostring(report.expectedServerCount or "unknown"), report.matches and "count verified" or "run diagnose"))
end)
function api.Show() screen.Enabled = true end
function api.Unload()
    assert(not busy and not previewing, "Pause the build or wait for preview generation before unloading")
    api.ClearPreview()
    api.RestoreCamera()
    releaseFollower()
    screen:Destroy()
    _G.RedBullRingBarriersBuilder = nil
end
if restoredCheckpoint then
    status(string.format("Checkpoint loaded: %d confirmed; next part %d. Load the saved build, inspect, then Resume.", api.NextIndex - 1, api.NextIndex))
else
    status(string.format("Jakarta Red Bull Ring: %d / %d objects. Inspect, preview, then Build. Full-circuit barriers: add to the completed compact road.", #PLAN, CONFIG.MaxObjects))
end
return api
