-- Elevated Monza builder for Jawa Timur (place 110369730911937).
-- TUM centreline/widths with model elevation, low kerbs, pit lane and tidied runoff.
-- Template: use monza-run.lua to load the builder and its separate JSON plan.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
assert(RunService:IsClient(), "MonzaBuilder must run on the client")
local player = Players.LocalPlayer

-- Adjust before the first build, or through _G.MonzaBuilder.Config.
local CONFIG = {
    CatalogName = nil, -- Auto-select a plain rectangular Part from the live manifest.
    Origin = nil, -- Map center at the asphalt surface. nil: grass beneath you.
    StartAt = "pit-entry", -- Your standing point maps to the pit-straight start. "center": legacy centre placement.
    Altitude = 0,
    GroundY = nil, -- Optional top height of your existing grass platform.
    GroundClearance = 0.25, -- Slight lift above the existing grass plate.
    YawDegrees = 0,
    Scale = 1, -- Additional multiplier; the elevated plan already has a 2x layout and wider lanes.
    PlacementInterval = 0.10,
    PlacementTimeout = 10,
    StreamingTimeout = 5, -- Ask Roblox to stream distant placement areas when enabled.
    FollowBuild = true, -- Move your character near the active section while building.
    FollowDistance = 48,
    FollowHeight = 12,
    FollowSettleTime = 0.10,
    MaxObjects = 11000,
    ServerObjectLimit = 20000,
    ApplyAppearance = true, -- Color/material controls require the game's Build Tools Plus access.
}
-- GENERATED_DATA

if _G.MonzaBuilder then
    local previous = _G.MonzaBuilder
    assert(previous.State ~= "building", "Pause the previous build before loading this version")
    if previous.Unload then previous.Unload() else
        if previous.ClearPreview then previous.ClearPreview() end
        local gui = player:FindFirstChild("PlayerGui")
        local oldPanel = gui and gui:FindFirstChild("MonzaBuilderPanel")
        if oldPanel then oldPanel:Destroy() end
        _G.MonzaBuilder = nil
    end
end

local api = { Config = CONFIG, Count = #PLAN, NextIndex = restoredCheckpoint and restoredCheckpoint.nextIndex or 1, Placed = {}, State = "ready", Phase = "ready" }
_G.MonzaBuilder = api
local preview, manifest, selected, origin, buildScale, appearance, pending, savedCamera
local catalogCandidates, candidateIndex = {}, 0
local roleSelected = {}
local busy, paused, previewing = false, false, false
local streamCenter, streamTask
local follower
local statusLabel, catalogButton
local function status(message, quiet)
    if not quiet then print("[MonzaBuilder] " .. message) end
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
                print(string.format("[MonzaBuilder] Block: %s | category=%s | plus=%s", entry.name, tostring(entry.category), tostring(entry.plus == true)))
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
    if CONFIG.Origin then
        assert(typeof(CONFIG.Origin) == "CFrame", "Origin must be a CFrame")
        return CONFIG.Origin
    end
    local character = player.Character
    local root = character and character:FindFirstChild("HumanoidRootPart")
    assert(root, "Spawn your character or set Config.Origin")
    local groundY = CONFIG.GroundY
    if groundY == nil then
        local params = RaycastParams.new()
        params.FilterType = Enum.RaycastFilterType.Exclude
        local excluded = { character }
        if preview then table.insert(excluded, preview) end
        params.FilterDescendantsInstances = excluded
        local hit = workspace:Raycast(root.Position, Vector3.new(0,-128,0), params)
        assert(hit, "Stand on the grass plate or set Config.GroundY; the elevated road needs a ground surface")
        groundY = hit.Position.Y
    end
    assert(type(groundY) == "number" and groundY == groundY and math.abs(groundY) < math.huge, "GroundY must be finite")
    assert(CONFIG.StartAt == "pit-entry" or CONFIG.StartAt == "center", "StartAt must be pit-entry or center")
    local frame = CFrame.new(root.Position.X, groundY + CONFIG.Altitude + CONFIG.GroundClearance, root.Position.Z) * CFrame.Angles(0, math.rad(CONFIG.YawDegrees), 0)
    if CONFIG.StartAt == "pit-entry" then return frame * CFrame.new(PLAN_ANCHOR * -CONFIG.Scale) end
    return frame
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
        origin=cf, scale=scale}
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
    preview.Name = "MonzaTrackPreview_LOCAL"
    preview.Parent = workspace
    previewing = true
    local ok, reason = pcall(function()
    for i = 1, #PLAN do
        local part = Instance.new("Part")
        local target, size, style = geometry(i, cf, scale)
        part.Name = "MonzaPreview"
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
local function matches(object, request)
    if object.ClassName ~= "Part" or object.Shape ~= Enum.PartType.Block then return false, "class/shape differs from the catalog block" end
    -- Live server placements use UUID names, rather than their catalog labels.
    if not placedName(object.Name, request.name) then return false, "unrecognized name=" .. object.Name end
    local positionError = (object.Position - request.cf.Position).Magnitude
    if positionError > 0.25 then return false, string.format("position differs by %.2f studs", positionError) end
    local sizeError = (object.Size - request.size).Magnitude
    if sizeError > 0.05 then return false, string.format("size differs by %.3f studs", sizeError) end
    if object.CFrame.RightVector:Dot(request.cf.RightVector) < 0.999 or object.CFrame.UpVector:Dot(request.cf.UpVector) < 0.999 then return false, "rotation/slope differs" end
    if request.verifyAppearance then
        local actual, expected = object.Color, request.color
        local difference = Vector3.new(actual.R - expected.R, actual.G - expected.G, actual.B - expected.B).Magnitude
        if difference > 0.03 then return false, string.format("color differs by %.3f", difference) end
        if object.Material ~= request.material then return false, "material=" .. tostring(object.Material) .. " (expected " .. tostring(request.material) .. ")" end
        if (object.MaterialVariant or "") ~= request.materialVariant then return false, "material variant differs" end
    end
    if not object.CanCollide then return false, "CanCollide=false" end
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
        if matches(object, request) then
            if found then return nil, "Multiple matching objects; placement ownership is ambiguous" end
            found = object
        end
    end
    return found
end
local function record(object, index)
    api.Placed[index] = object
    api.NextIndex = index + 1
    pending = nil
end
function api.Pause()
    paused = true
    status("Pausing after the current placement resolves")
end
function api.Build()
    assert(not ((_G.SepangBuilder and _G.SepangBuilder.State == "building") or (_G.SepangFlatBuilder and _G.SepangFlatBuilder.State == "building")), "Pause the Sepang builder before building Monza")
    assert(not busy and not previewing, "Wait for the preview to finish; only one build can run")
    if api.NextIndex > #PLAN then status("Build already complete"); return end
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
        record(object, pending.index)
    end
    -- The game exposes a placed-count query in its normal save UI.
    local container = ReplicatedStorage:FindFirstChild("NetworkContainer")
    local functions = container and container:FindFirstChild("RemoteFunctions")
    local saver = functions and functions:FindFirstChild("BuildSaver")
    local currentCount = #folder:GetChildren()
    if saver and saver:IsA("RemoteFunction") then
        local done, result, queryOk = false, nil, false
        task.spawn(function() queryOk, result = pcall(function() return saver:InvokeServer("GetPlacedAmount") end); done = true end)
        local deadline = os.clock() + 12
        repeat task.wait(0.05) until done or os.clock() >= deadline
        assert(done and queryOk and type(result) == "number", "Could not verify the game's placed-object count")
        currentCount = result
    end
    local remainingCount = #PLAN - api.NextIndex + 1
    if restoredCheckpoint then
        assert(currentCount >= api.NextIndex - 1, "Load your saved partial build before resuming this checkpoint")
    end
    assert(currentCount + remainingCount <= CONFIG.ServerObjectLimit, string.format("%d existing + %d remaining exceeds the %d object limit", currentCount, remainingCount, CONFIG.ServerObjectLimit))
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
                if object.Parent == folder and matches(object, request) then
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
                pending = request
                local started = os.clock()
                local candidates = {}
                request.observed = candidates
                request.beforeCount = #folder:GetChildren()
                connection = folder.ChildAdded:Connect(function(object) table.insert(candidates, object) end)
                api.Phase = "confirming"
                status(string.format("Confirmed %d / %d; confirming part %d", index - 1, #PLAN, index), true)
                endpoint:FireServer(request.name, request.cf, request.size, 0, request.appearance and request.color or nil, request.appearance and request.material or nil, request.appearance and request.materialVariant or nil, true)
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
                record(object, index)
                local remaining = CONFIG.PlacementInterval - (os.clock() - started)
                if remaining > 0 then task.wait(remaining) end
            end
            if index == 1 or index % 25 == 0 then status(string.format("Confirmed %d / %d parts", index, #PLAN)) end
        end
    end)
    if connection then connection:Disconnect() end
    if streamConnection then streamConnection:Disconnect() end
    releaseFollower()
    busy = false
    api.State = not ok and "unconfirmed" or (api.NextIndex > #PLAN and "complete" or "paused")
    api.Phase = api.State
    if not ok then error(reason, 0) end
    status(api.State == "complete" and string.format("Complete: %d server parts confirmed. Save through the game's build-slot UI.", #PLAN) or string.format("Paused at %d / %d; Build / Resume continues", api.NextIndex - 1, #PLAN))
end

local screen = Instance.new("ScreenGui")
screen.Name = "MonzaBuilderPanel"
screen.ResetOnSpawn = false
screen.Parent = player:WaitForChild("PlayerGui")
local panel = Instance.new("Frame")
panel.Size = UDim2.fromOffset(330, 355)
panel.Position = UDim2.new(0, 18, 0.5, -177)
panel.BackgroundColor3 = Color3.fromRGB(24, 28, 35)
panel.Parent = screen
local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -24, 0, 40)
title.Position = UDim2.fromOffset(12, 4)
title.BackgroundTransparency = 1
title.Text = "FLAT MONZA BUILDER"
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
function api.Show() screen.Enabled = true end
function api.Unload()
    assert(not busy and not previewing, "Pause the build or wait for preview generation before unloading")
    api.ClearPreview()
    api.RestoreCamera()
    releaseFollower()
    screen:Destroy()
    _G.MonzaBuilder = nil
end
if restoredCheckpoint then
    status(string.format("Checkpoint loaded: %d confirmed; next part %d. Load the saved build, inspect, then Resume.", api.NextIndex - 1, api.NextIndex))
else
    status(string.format("Monza: %d / %d objects. Inspect, preview, then Build. Lowest surfaces clear the grass; elevation and low kerbs are retained.", #PLAN, CONFIG.MaxObjects))
end
return api
