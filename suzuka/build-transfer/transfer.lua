-- Jakarta Build Tools backup/rebuild. No save/load/delete remotes are used.
-- Files are local to the executor workspace; only this helper belongs on GitHub.
local mode, options = ...
options = options or {}
assert(game.PlaceId == 14005966837, "Join Jakarta (14005966837) first")
local old = _G.JakartaTransfer
if old then
    assert(not old.Busy, "Pause Jakarta Transfer before loading it again")
    if old.Dispose then old.Dispose() end
end
local Players = game:GetService("Players")
local storage = game:GetService("ReplicatedStorage")
local http = game:GetService("HttpService")
local player = Players.LocalPlayer
local unpackValues = table.unpack or unpack
local config = {
    BackupFile = "jakarta-build-backup.json", DraftFile = "jakarta-build-draft.json",
    ProgressFile = "jakarta-build-import-progress.json", GridStep = 192,
    StreamTimeout = 5, SettleTime = 0.5, MaxTiles = 4096,
    PlacementTimeout = 12, PlacementInterval = 0.15, CatalogMap = {},
    FpsMode = true, BatchSize = 32, WorkBudget = 0.004, DraftInterval = 30,
    NoClip = true, FocusRadius = 384, FocusStep = 32, FineTrackScan = true,
    ScanMode = "track",
    StallAreas = 24, StallSeconds = 60, RecoveryRadius = 256, RecoverySettleTime = 1,
}
if old and old.Config and type(old.Config.FpsMode) == "boolean" then config.FpsMode = old.Config.FpsMode end
for k, v in pairs(options.Config or {}) do assert(config[k] ~= nil, "Unknown setting: " .. k); config[k] = v end
local api = {Config = config, Version = "2026-11-12-discovery", State = "ready", Busy = false, Paused = false}
_G.JakartaTransfer = api
local statusLabel, screen, follower, capture, catalog, pending, freshCapture, fpsButton, fpsSession, pauseKey
api.Metrics = {yields = 0, samples = 0, cacheHits = 0, discoveryHits = 0, catalogChecks = 0}
local observed = setmetatable({}, {__mode = "k"})
local workUnits, lastYield = 0, os.clock()
local function breathe(units)
    workUnits = workUnits + (units or 1)
    if workUnits >= config.BatchSize or os.clock() - lastYield >= config.WorkBudget then
        workUnits = 0; api.Metrics.yields = api.Metrics.yields + 1
        task.wait(); lastYield = os.clock()
    end
end
local queryRunning = {}
local function status(message)
    api.Message = message
    print("[Jakarta Transfer] " .. message)
    if statusLabel then statusLabel.Text = message end
end
local function applyFPS()
    if not config.FpsMode or fpsSession then return end
    local held = {}; fpsSession = held
    local ok, service = pcall(function() return game:GetService("RunService") end)
    if ok then
        held.runService = service
        held.renderDisabled = pcall(function() service:Set3dRenderingEnabled(false) end)
    end
    local lightingOK, lighting = pcall(function() return game:GetService("Lighting") end)
    if lightingOK then
        pcall(function() held.lighting = lighting; held.shadows = lighting.GlobalShadows; lighting.GlobalShadows = false end)
    end
    -- Use reversible quality reduction if the executor cannot control 3D drawing.
    if not held.renderDisabled then
        pcall(function()
            local quality = UserSettings():GetService("UserGameSettings")
            held.quality, held.savedQuality = quality, quality.SavedQualityLevel
            quality.SavedQualityLevel = Enum.SavedQualitySetting.QualityLevel1
        end)
    end
    api.FpsActive = true
end
local function restoreFPS()
    local held = fpsSession; fpsSession = nil
    if not held then return end
    if held.renderDisabled then pcall(function() held.runService:Set3dRenderingEnabled(true) end) end
    if held.lighting then pcall(function() held.lighting.GlobalShadows = held.shadows end) end
    if held.quality then pcall(function() held.quality.SavedQualityLevel = held.savedQuality end) end
    api.FpsActive = false
end
function api.SetFPS(enabled)
    assert(type(enabled) == "boolean", "Use SetFPS(true) or SetFPS(false)")
    config.FpsMode = enabled
    if enabled and api.Busy then applyFPS() else restoreFPS() end
    if fpsButton then fpsButton.Text = "FPS mode: " .. (enabled and "ON" or "OFF") end
    status(enabled and "FPS mode ON for transfer. Pause restores normal rendering." or "FPS mode OFF: normal rendering restored.")
end
local function finite(n) return type(n) == "number" and n == n and math.abs(n) < math.huge end
local function near(a, b, tolerance) return finite(a) and finite(b) and math.abs(a - b) <= (tolerance or 0.02) end
local function vec(v) return {v.X, v.Y, v.Z} end
local function color(v) return {v.R, v.G, v.B} end
local function frame(v) return {v:GetComponents()} end
local function vector(v) return Vector3.new(v[1], v[2], v[3]) end
local function cframe(v) return CFrame.new(unpackValues(v)) end
local function enumName(v) return v and v.Name or nil end
local function arrayNear(a, b, tolerance)
    if type(a) ~= "table" or type(b) ~= "table" or #a ~= #b then return false end
    for i = 1, #a do if not near(a[i], b[i], tolerance) then return false end end
    return true
end
local function numberKey(n) return string.format("%.5f", n) end
local function arrayKey(a)
    local out = {}; for i, n in ipairs(a) do out[i] = numberKey(n) end
    return table.concat(out, ",")
end
local function endpoint(group, name)
    local folder = storage:FindFirstChild("NetworkContainer")
    folder = folder and folder:FindFirstChild(group)
    return assert(folder and folder:FindFirstChild(name), "Missing Build Tools endpoint: " .. name)
end
local function query(name, ...)
    assert(not queryRunning[name], name .. " is still waiting for the server; retry after it returns")
    local args, count = {...}, select("#", ...)
    local result = {done = false}; queryRunning[name] = result
    task.spawn(function()
        result.ok, result.value = pcall(function() return endpoint("RemoteFunctions", name):InvokeServer(unpackValues(args, 1, count)) end)
        result.done = true; queryRunning[name] = nil
    end)
    local deadline = os.clock() + 15
    repeat task.wait(0.05) until result.done or os.clock() >= deadline
    assert(result.done and result.ok, name .. " failed/timed out: " .. tostring(result.value))
    return result.value
end
local function serverCount()
    local count = query("BuildSaver", "GetPlacedAmount")
    assert(finite(count) and count >= 0 and count % 1 == 0, "Server object count is unavailable; ask the server owner to run the helper")
    return count
end
local function buildFolder() return assert(workspace:FindFirstChild("EditableBuilds"), "Enable /buildtools first") end
local function access()
    local gui = player:FindFirstChild("PlayerGui")
    assert(gui and gui:FindFirstChild("AdvanceBuildTools"), "Enable /buildtools first")
    for _, name in ipairs({"SuzukaBuilder", "MonzaBuilder", "MonzaTerrainBuilder", "SepangBuilder", "SepangFlatBuilder", "RedBullRingBuilder", "SpaBuilder"}) do
        local builder = _G[name]
        assert(not builder or builder.State ~= "building", "Pause the circuit builder first")
    end
end
local function hasPlus()
    local expiry = player:GetAttribute("BT_SubExpiry")
    return player:GetAttribute("BT_SubPermanent") == true or (finite(expiry) and expiry > os.time())
end
local function settings()
    for _, key in ipairs({"BackupFile", "DraftFile", "ProgressFile"}) do
        assert(type(config[key]) == "string" and config[key]:match("^[%w_%-]+%.json$"), "Use a simple .json filename for " .. key)
    end
    assert(config.BackupFile ~= config.DraftFile and config.DraftFile ~= config.ProgressFile and config.BackupFile ~= config.ProgressFile, "Backup, draft and progress filenames must differ")
    assert(finite(config.GridStep) and config.GridStep >= 64 and config.GridStep <= 256, "GridStep must be 64..256")
    assert(finite(config.StreamTimeout) and config.StreamTimeout >= 1 and config.StreamTimeout <= 20, "StreamTimeout must be 1..20")
    assert(finite(config.SettleTime) and config.SettleTime >= 0.1 and config.SettleTime <= 3, "SettleTime must be 0.1..3")
    assert(finite(config.MaxTiles) and config.MaxTiles >= 1 and config.MaxTiles <= 20000 and config.MaxTiles % 1 == 0, "Invalid MaxTiles")
    assert(finite(config.PlacementTimeout) and config.PlacementTimeout >= 2 and config.PlacementTimeout <= 60, "PlacementTimeout must be 2..60")
    assert(finite(config.PlacementInterval) and config.PlacementInterval >= 0.1, "PlacementInterval must be at least 0.1")
    assert(type(config.CatalogMap) == "table", "CatalogMap must be a table")
    assert(type(config.FpsMode) == "boolean", "FpsMode must be true or false")
    assert(finite(config.BatchSize) and config.BatchSize >= 1 and config.BatchSize <= 128 and config.BatchSize % 1 == 0, "BatchSize must be 1..128")
    assert(finite(config.WorkBudget) and config.WorkBudget >= 0.001 and config.WorkBudget <= 0.02, "WorkBudget must be 0.001..0.02")
    assert(finite(config.DraftInterval) and config.DraftInterval >= 5 and config.DraftInterval <= 120, "DraftInterval must be 5..120")
    assert(type(config.NoClip) == "boolean", "NoClip must be true or false")
    assert(type(config.FineTrackScan) == "boolean", "FineTrackScan must be true or false")
    assert(config.ScanMode == "track" or config.ScanMode == "bounds", "ScanMode must be track or bounds")
    assert(config.ScanMode ~= "track" or config.FineTrackScan, "Track mode requires FineTrackScan")
    assert(finite(config.StallAreas) and config.StallAreas >= 4 and config.StallAreas <= 128 and config.StallAreas % 1 == 0, "StallAreas must be 4..128")
    assert(finite(config.StallSeconds) and config.StallSeconds >= 10 and config.StallSeconds <= 300, "StallSeconds must be 10..300")
    assert(finite(config.RecoveryRadius) and config.RecoveryRadius >= 64 and config.RecoveryRadius <= 256, "RecoveryRadius must be 64..256")
    assert(finite(config.RecoverySettleTime) and config.RecoverySettleTime >= 0.5 and config.RecoverySettleTime <= 3, "RecoverySettleTime must be 0.5..3")
    assert(finite(config.FocusRadius) and config.FocusRadius >= 64 and config.FocusRadius <= 1024, "FocusRadius must be 64..1024")
    assert(finite(config.FocusStep) and config.FocusStep >= 32 and config.FocusStep <= 64, "FocusStep must be 32..64")
    assert(type(readfile) == "function" and type(writefile) == "function", "Your executor needs readfile and writefile")
end
local function checksum(raw)
    -- Accidental-corruption check. This is not a cryptographic signature.
    local a, b = 1, 0
    for first = 1, #raw, 4096 do
        for i = first, math.min(first + 4095, #raw) do a = (a + raw:byte(i)) % 65521; b = (b + a) % 65521 end
        breathe()
    end
    return string.format("%08x", b * 65536 + a)
end
local function sealed(document)
    local payload = http:JSONEncode(document)
    return http:JSONEncode({format = "jakarta-transfer-file-v1", bytes = #payload, checksum = checksum(payload), payload = payload})
end
local function unseal(raw)
    local envelope = http:JSONDecode(raw)
    assert(type(envelope) == "table" and envelope.format == "jakarta-transfer-file-v1" and type(envelope.payload) == "string", "Not a Jakarta Transfer file")
    assert(#envelope.payload == envelope.bytes and checksum(envelope.payload) == envelope.checksum, "Backup is damaged/incomplete")
    local document = http:JSONDecode(envelope.payload)
    assert(type(document) == "table", "Invalid backup contents")
    return document, envelope.checksum
end
local function exists(path)
    if type(isfile) == "function" then return isfile(path) end
    return pcall(readfile, path)
end
local function disk(path, document, preserve)
    local raw = sealed(document)
    writefile(path .. ".tmp", raw)
    assert(readfile(path .. ".tmp") == raw, "Temporary file read-back failed; keep this server open")
    -- Exact read-back equality verifies the already sealed bytes without decoding
    -- and checksumming the whole build again at each filesystem step.
    if preserve and exists(path) then
        local previous = readfile(path)
        writefile(path .. ".previous", previous)
        assert(readfile(path .. ".previous") == previous, "Previous backup preservation failed")
    end
    writefile(path, raw)
    assert(readfile(path) == raw, "Backup read-back failed; keep this server open")
    return raw
end
local function restoreCharacter()
    local held = follower; follower = nil
    if not held then return end
    if held.stepConnection then held.stepConnection:Disconnect() end
    for part, collision in pairs(held.collisions or {}) do pcall(function() part.CanCollide = collision end) end
    api.NoClipActive = false
    if player.Character == held.character then pcall(function() held.character:PivotTo(held.start) end) end
    pcall(function() held.root.Anchored = held.anchored end)
end
local function noclipCharacter(held)
    for _, part in ipairs(held.character:GetDescendants()) do
        if part:IsA("BasePart") then
            if held.collisions[part] == nil then held.collisions[part] = part.CanCollide end
            part.CanCollide = false
        end
    end
end
local function visit(position, settleTime)
    local character = player.Character
    local root = character and character:FindFirstChild("HumanoidRootPart")
    local humanoid = character and character:FindFirstChildOfClass("Humanoid")
    assert(root and (not humanoid or humanoid.Health > 0 and not humanoid.SeatPart), "Stand outside your vehicle with a living character")
    assert(not follower or follower.character == character, "Character changed; pause and resume")
    if not follower then
        follower = {character = character, root = root, start = character:GetPivot(), anchored = root.Anchored, collisions = {}}
        root.Anchored = true
        if config.NoClip then
            noclipCharacter(follower); api.NoClipActive = true
            local held = follower
            pcall(function()
                held.stepConnection = game:GetService("RunService").Stepped:Connect(function() noclipCharacter(held) end)
            end)
        end
    end
    character:PivotTo(CFrame.new(position + Vector3.new(0, 18, 0)))
    if capture and capture.jobId == game.JobId and api.State == "copying" then capture.lastVisit = vec(position) end
    if workspace.StreamingEnabled then
        assert(not api.StreamRunning, "A streaming request is still pending; wait before resuming")
        local attempt = {done = false}; api.StreamRunning = attempt
        task.spawn(function()
            attempt.ok, attempt.error = pcall(function() player:RequestStreamAroundAsync(position, config.StreamTimeout) end)
            attempt.done = true; api.StreamRunning = nil
        end)
        local deadline = os.clock() + config.StreamTimeout + 1
        repeat task.wait(0.05) until attempt.done or os.clock() >= deadline
        assert(attempt.done and attempt.ok, "Streaming failed/timed out: " .. tostring(attempt.error))
    end
    task.wait(settleTime or config.SettleTime)
end
local function meshInfo(part)
    if part:IsA("MeshPart") then return "MeshPart:" .. part.MeshId .. ":" .. part.TextureID end
    local mesh = part:FindFirstChildOfClass("SpecialMesh")
    if mesh then return table.concat({"SpecialMesh", enumName(mesh.MeshType) or "", mesh.MeshId, mesh.TextureId, arrayKey(vec(mesh.Scale)), arrayKey(vec(mesh.Offset))}, ":") end
    if part:FindFirstChildOfClass("BlockMesh") or part:FindFirstChildOfClass("CylinderMesh") then return "unsupported-mesh" end
    return ""
end
local function sample(object)
    assert(object:IsA("Model") or object:IsA("BasePart"), "Unsupported build root: " .. object.ClassName)
    local model = object:IsA("Model")
    local pivot = model and object:GetPivot() or object.CFrame
    local scale = model and object:GetScale() or 1
    assert(finite(scale) and scale > 0, "Invalid Model scale")
    local inverse, parts, visuals = pivot:Inverse(), {}, {}
    local descendants = object:GetDescendants()
    local all = {object}; for _, item in ipairs(descendants) do all[#all + 1] = item end
    for _, part in ipairs(all) do
        breathe()
        if part:IsA("BasePart") then
            local relative = inverse * part.CFrame
            local coordinates = frame(relative)
            for i = 1, 3 do coordinates[i] = coordinates[i] / scale end
            local state = {
                class = part.ClassName, shape = part:IsA("Part") and enumName(part.Shape) or "",
                mesh = meshInfo(part), cf = coordinates, size = vec(part.Size / scale),
                color = color(part.Color), material = enumName(part.Material), variant = part.MaterialVariant or "",
                transparency = part.Transparency, reflectance = part.Reflectance,
                collide = part.CanCollide, anchored = part.Anchored,
                customPhysics = part.CustomPhysicalProperties ~= nil,
                physics = part.CustomPhysicalProperties and {part.CustomPhysicalProperties.Density, part.CustomPhysicalProperties.Friction, part.CustomPhysicalProperties.Elasticity, part.CustomPhysicalProperties.FrictionWeight, part.CustomPhysicalProperties.ElasticityWeight} or {},
            }
            state.key = state.class .. ":" .. state.shape .. ":" .. state.mesh .. ":" .. arrayKey(state.cf) .. ":" .. arrayKey(state.size)
            parts[#parts + 1] = state
        elseif part:IsA("Decal") or part:IsA("Texture") then
            -- Catalog identity restores texture/mesh assets; record appearance too.
            visuals[#visuals + 1] = {class = part.ClassName, texture = part.Texture, face = enumName(part.Face), color = color(part.Color3), transparency = part.Transparency}
        end
    end
    table.sort(parts, function(a, b) return a.key < b.key end)
    table.sort(visuals, function(a, b) return (a.class .. a.texture .. a.face) < (b.class .. b.texture .. b.face) end)
    assert(#parts > 0, "Model has no streamed Parts")
    return {kind = model and "Model" or "Part", class = object.ClassName, cf = frame(pivot), size = model and scale or vec(object.Size), parts = parts, visuals = visuals}
end
local function geometrySame(a, b, tolerance)
    if a.kind ~= b.kind or a.class ~= b.class or #a.parts ~= #b.parts or #a.visuals ~= #b.visuals then return false end
    for i, p in ipairs(a.parts) do
        local q = b.parts[i]
        if p.class ~= q.class or p.shape ~= q.shape or p.mesh ~= q.mesh or not arrayNear(p.cf, q.cf, tolerance) then return false end
        if a.kind == "Model" and not arrayNear(p.size, q.size, tolerance) then return false end
    end
    for i, p in ipairs(a.visuals) do local q = b.visuals[i]; if p.class ~= q.class or p.texture ~= q.texture or p.face ~= q.face then return false end end
    return true
end
local function appearanceSame(a, b, tolerance)
    if not geometrySame(a, b, tolerance) then return false end
    for i, p in ipairs(a.parts) do
        local q = b.parts[i]
        if not arrayNear(p.color, q.color, 0.012) or p.material ~= q.material or p.variant ~= q.variant or not near(p.transparency, q.transparency, 0.012) or not near(p.reflectance, q.reflectance, 0.012) or p.collide ~= q.collide or p.anchored ~= q.anchored or p.customPhysics ~= q.customPhysics or not arrayNear(p.physics, q.physics, 0.001) then return false end
    end
    for i, p in ipairs(a.visuals) do local q = b.visuals[i]; if not arrayNear(p.color, q.color, 0.012) or not near(p.transparency, q.transparency, 0.012) then return false end end
    return true
end
local function imageKey(image)
    local result = {image.class, arrayKey(image.cf), type(image.size) == "table" and arrayKey(image.size) or numberKey(image.size)}
    for _, p in ipairs(image.parts) do
        result[#result + 1] = table.concat({p.key or (p.class .. p.mesh .. arrayKey(p.cf) .. arrayKey(p.size)), arrayKey(p.color), p.material, p.variant, numberKey(p.transparency), numberKey(p.reflectance), tostring(p.collide), tostring(p.anchored), tostring(p.customPhysics), arrayKey(p.physics)}, ":")
    end
    for _, v in ipairs(image.visuals) do result[#result + 1] = v.class .. v.texture .. v.face .. arrayKey(v.color) .. numberKey(v.transparency) end
    return table.concat(result, "|")
end
local partCache = setmetatable({}, {__mode = "k"})
local recordKeys = setmetatable({}, {__mode = "k"})
local function plainBlock(image)
    return image.kind == "Part" and image.class == "Part" and #image.parts == 1 and #image.visuals == 0 and image.parts[1].shape == "Block" and image.parts[1].mesh == ""
end
local function geometryBucket(image)
    return image.kind .. ":" .. image.class .. ":" .. #image.parts .. ":" .. #image.visuals
end
local function loadCatalog()
    status("Loading build catalog...")
    local entries = query("GetCatalogManifest")
    local folder = storage:FindFirstChild("PlacementObject")
    folder = folder and folder:FindFirstChild("Object")
    assert(type(entries) == "table" and folder, "Build catalog is unavailable")
    local result = {entries = {}, names = {}, guids = {}, blocks = {}, blockHints = {}, geometry = {}}
    for _, entry in ipairs(entries) do
        breathe()
        if type(entry) == "table" and type(entry.name) == "string" and type(entry.guid) == "string" then
            local template = folder:FindFirstChild(entry.guid, true)
            if template and (template:IsA("Model") or template:IsA("BasePart")) then
                local ok, image = pcall(sample, template)
                if ok then
                    local item = {name = entry.name, guid = entry.guid, plus = entry.plus == true, template = template, image = image}
                    assert(not result.names[item.name] and not result.guids[item.guid], "Ambiguous catalog identity: " .. item.name)
                    result.entries[#result.entries + 1] = item; result.names[item.name] = item; result.guids[item.guid] = item
                    if plainBlock(image) then result.blocks[#result.blocks + 1] = item end
                    local key = geometryBucket(image)
                    result.geometry[key] = result.geometry[key] or {}
                    result.geometry[key][#result.geometry[key] + 1] = item
                end
            end
        end
    end
    assert(#result.entries > 0, "No usable catalog items")
    table.sort(result.entries, function(a, b) return a.name < b.name end)
    table.sort(result.blocks, function(a, b)
        if a.plus ~= b.plus then return not a.plus end
        return a.name < b.name
    end)
    for _, entriesInBucket in pairs(result.geometry) do table.sort(entriesInBucket, function(a, b) return a.name < b.name end) end
    catalog = result
    partCache = setmetatable({}, {__mode = "k"})
    return result
end
local function predict(template, overrides)
    local result = {kind = template.kind, class = template.class, parts = {}, visuals = {}}
    for i, part in ipairs(template.parts) do
        local p = {}; for k, v in pairs(part) do p[k] = v end
        p.color = overrides.color or p.color; p.material = overrides.material or p.material; p.variant = overrides.variant or p.variant
        if overrides.transparency ~= nil and p.transparency < 1 then p.transparency = overrides.transparency end
        if overrides.collide ~= nil then p.collide = overrides.collide end
        p.anchored = true
        result.parts[i] = p
    end
    for i, part in ipairs(template.visuals) do
        local p = {}; for k, v in pairs(part) do p[k] = v end
        p.color = overrides.color or p.color
        if overrides.transparency ~= nil and p.transparency < 1 then p.transparency = overrides.transparency end
        result.visuals[i] = p
    end
    return result
end
local function inferOverrides(object, image, item)
    api.Metrics.catalogChecks = api.Metrics.catalogChecks + 1
    if not geometrySame(image, item.image, 0.002) then return nil, "Model/mesh contents do not match the complete catalog template" end
    local overrides = {}
    if image.kind == "Part" then
        local p = image.parts[1]
        if #image.parts ~= 1 or #image.visuals > 0 then return nil, "Part has extra contents; use a matching catalog Model" end
        local original = item.image.parts[1]
        if not arrayNear(p.color, original.color, 0.001) then overrides.color = p.color end
        if p.material ~= original.material or p.variant ~= original.variant then overrides.material, overrides.variant = p.material, p.variant end
        if not near(p.transparency, original.transparency, 0.001) then overrides.transparency = p.transparency end
        if p.collide ~= original.collide then overrides.collide = p.collide end
    else
        local attrColor = object:GetAttribute("BT_Color")
        if typeof(attrColor) == "Color3" then overrides.color = color(attrColor) end
        local attrMaterial = object:GetAttribute("BT_Material")
        if type(attrMaterial) == "string" and Enum.Material[attrMaterial] then overrides.material = attrMaterial; overrides.variant = object:GetAttribute("BT_Variant") or "" end
        local transparency, collide = object:GetAttribute("BT_Transparency"), object:GetAttribute("BT_CanCollide")
        if finite(transparency) then overrides.transparency = transparency end
        if type(collide) == "boolean" then overrides.collide = collide end
        -- Recover uniform overrides when the server did not replicate BT_* attributes.
        local first = image.parts[1]
        local visible = first
        for _, p in ipairs(image.parts) do if p.transparency < 1 then visible = p; break end end
        local sameColor, sameMaterial, sameTransparency, sameCollision = true, true, true, true
        for _, p in ipairs(image.parts) do
            sameColor = sameColor and arrayNear(p.color, first.color, 0.001)
            sameMaterial = sameMaterial and p.material == first.material and p.variant == first.variant
            sameTransparency = sameTransparency and (p.transparency >= 1 or near(p.transparency, visible.transparency, 0.001))
            sameCollision = sameCollision and p.collide == first.collide
        end
        if sameColor then
            local changed = false; for i, p in ipairs(image.parts) do changed = changed or not arrayNear(p.color, item.image.parts[i].color, 0.001) end
            if changed then overrides.color = first.color end
        end
        if sameMaterial then
            local changed = false; for i, p in ipairs(image.parts) do local q = item.image.parts[i]; changed = changed or p.material ~= q.material or p.variant ~= q.variant end
            if changed then overrides.material, overrides.variant = first.material, first.variant end
        end
        if sameTransparency then
            local changed = false; for i, p in ipairs(image.parts) do changed = changed or not near(p.transparency, item.image.parts[i].transparency, 0.001) end
            if changed then overrides.transparency = visible.transparency end
        end
        if sameCollision then
            local changed = false; for i, p in ipairs(image.parts) do changed = changed or p.collide ~= item.image.parts[i].collide end
            if changed then overrides.collide = first.collide end
        end
    end
    if not appearanceSame(image, predict(item.image, overrides), 0.002) then return nil, "Per-part appearance/physics cannot be reproduced by catalog placement" end
    return overrides
end
local function resolve(object, image)
    local mapped = config.CatalogMap[object.Name]
    if mapped and not catalog.names[mapped] then return nil, "Mapped catalog name is unavailable: " .. tostring(mapped) end
    local direct = mapped and catalog.names[mapped] or catalog.names[object.Name] or catalog.guids[object.Name] or catalog.guids[object.Name:gsub("^%{(.-)%}$", "%1")]
    for _, attr in ipairs({"CatalogName", "BT_CatalogName", "CatalogGuid"}) do
        local value = object:GetAttribute(attr)
        if not direct and type(value) == "string" then direct = catalog.names[value] or catalog.guids[value] end
    end
    if direct then local overrides, reason = inferOverrides(object, image, direct); return direct, overrides, reason end
    if plainBlock(image) then
        -- Equivalent plain blocks can use the first valid standard template.
        -- Colors/materials/sizes are overrides, so do not walk the entire catalog
        -- for every GUID-named track slab. The hint is verified for every object.
        local p = image.parts[1]
        local key = numberKey(p.reflectance) .. ":" .. tostring(p.customPhysics) .. ":" .. arrayKey(p.physics)
        local hint = catalog.blockHints[key]
        if hint then
            local overrides = inferOverrides(object, image, hint)
            if overrides then return hint, overrides end
        end
        for _, item in ipairs(catalog.blocks) do
            breathe()
            if api.Busy and api.Paused then return nil, "Scan paused during catalog lookup" end
            local overrides = inferOverrides(object, image, item)
            if overrides then catalog.blockHints[key] = item; return item, overrides end
        end
        return nil, "No catalog block can reproduce this object's appearance/physics"
    end
    -- Unknown instance GUIDs require compatible catalog geometry, including
    -- shape/mesh identity. Verify appearance against the chosen template too.
    local found, foundOverrides
    for _, item in ipairs(catalog.geometry[geometryBucket(image)] or {}) do
        breathe()
        if api.Busy and api.Paused then return nil, "Scan paused during catalog lookup" end
        local eligible = image.kind == "Model" or image.kind == "Part" and #image.parts == 1 and #image.visuals == 0 and image.parts[1].mesh ~= "unsupported-mesh"
        if eligible then
            local overrides = inferOverrides(object, image, item)
            if overrides then
                if image.kind == "Model" and found then return nil, "Multiple matching catalog Models; set Config.CatalogMap[sourceName]" end
                if not found or (found.plus and not item.plus) then found, foundOverrides = item, overrides end
            end
        end
    end
    if found then return found, foundOverrides end
    return nil, "Unrecognized catalog object or incomplete streamed Model"
end

local function rawKey(object)
    local model = object:IsA("Model")
    if not model and not object:IsA("BasePart") then return object.ClassName .. ":" .. object.Name end
    local cf = model and object:GetPivot() or object.CFrame
    local size = model and numberKey(object:GetScale()) or arrayKey(vec(object.Size))
    return object.ClassName .. ":" .. object.Name .. ":" .. arrayKey(frame(cf)) .. ":" .. size
end
local function enqueue(position, route)
    local step = capture.step
    local x, z = math.floor(position.X / step), math.floor(position.Z / step)
    local key = x .. ":" .. z
    if capture.queued[key] then return end
    assert(#capture.queue < config.MaxTiles, "Scan reached MaxTiles; finish by walking to the missing area and using Scan nearby")
    capture.queued[key] = true
    capture.queue[#capture.queue + 1] = {x = x, z = z, y = position.Y, route = route, px = route and position.X or nil, pz = route and position.Z or nil}
end
local function seedFootprint(cf, size)
    if size[1] > 128 and size[3] > 128 then return end
    -- Exact centres reach small streamed roots that can be missed by the
    -- diagonal offset from a grid centre. Reserve room for close pit recovery.
    local reserve = math.min(512, math.floor(config.MaxTiles / 4))
    if #capture.queue >= config.MaxTiles - reserve then return end
    local anchorKey = "fine:anchor:" .. math.floor(cf.X / 32) .. ":" .. math.floor(cf.Y / 32) .. ":" .. math.floor(cf.Z / 32)
    if not capture.queued[anchorKey] then
        capture.queue[#capture.queue + 1] = {x = math.floor(cf.X / capture.step), z = math.floor(cf.Z / capture.step), y = cf.Y, px = cf.X, pz = cf.Z, key = anchorKey, fine = true, anchor = true, track = true}
        capture.queued[anchorKey] = true
    end
    local half = vector(size) / 2
    local radiusX = math.abs(cf.RightVector.X) * half.X + math.abs(cf.UpVector.X) * half.Y + math.abs(cf.LookVector.X) * half.Z
    local radiusZ = math.abs(cf.RightVector.Z) * half.X + math.abs(cf.UpVector.Z) * half.Y + math.abs(cf.LookVector.Z) * half.Z
    local radiusY = math.abs(cf.RightVector.Y) * half.X + math.abs(cf.UpVector.Y) * half.Y + math.abs(cf.LookVector.Y) * half.Z
    local inverse, levels = cf:Inverse(), {cf.Y}
    if radiusY > 32 then
        levels = {}
        for py = cf.Y - radiusY, cf.Y + radiusY, 64 do levels[#levels + 1] = py end
        levels[#levels + 1] = cf.Y + radiusY
    end
    for x = math.floor((cf.X - radiusX - 64) / 64), math.floor((cf.X + radiusX + 64) / 64) do
        for z = math.floor((cf.Z - radiusZ - 64) / 64), math.floor((cf.Z + radiusZ + 64) / 64) do
            for _, py in ipairs(levels) do
                breathe(0)
                if #capture.queue >= config.MaxTiles - reserve then return end
                local px, pz = (x + 0.5) * 64, (z + 0.5) * 64
                local localPoint = (inverse * CFrame.new(px, py, pz)).Position
                if math.abs(localPoint.X) <= half.X + 64 and math.abs(localPoint.Y) <= half.Y + 64 and math.abs(localPoint.Z) <= half.Z + 64 then
                    local key = "fine:auto:" .. x .. ":" .. math.floor(py / 32) .. ":" .. z
                    if not capture.queued[key] then
                        capture.queue[#capture.queue + 1] = {x = math.floor(px / capture.step), z = math.floor(pz / capture.step), y = py, px = px, pz = pz, key = key, fine = true, track = true}
                        capture.queued[key] = true
                    end
                end
            end
        end
    end
end
local function seedFineTrack(image)
    if not config.FineTrackScan or not image then return end
    if config.ScanMode == "track" then
        if image.kind == "Part" and type(image.size) == "table" then seedFootprint(cframe(image.cf), image.size)
        elseif image.kind == "Model" then
            local pivot = cframe(image.cf)
            seedFootprint(pivot, {1, 1, 1})
            for _, part in ipairs(image.parts) do
                breathe()
                local components = {unpackValues(part.cf)}
                for i = 1, 3 do components[i] = components[i] * image.size end
                seedFootprint(pivot * cframe(components), {part.size[1] * image.size, part.size[2] * image.size, part.size[3] * image.size})
            end
        end
        return
    end
    if image.kind ~= "Part" or type(image.size) ~= "table" then return end
    if image.size[1] > 128 or image.size[3] > 128 or image.size[2] > 64 then return end
    local x, z, y = math.floor(image.cf[1] / 64), math.floor(image.cf[3] / 64), math.floor(image.cf[2] / 32)
    for dx = -1, 1 do for dz = -1, 1 do
        breathe(0)
        local key = "fine:auto:" .. (x + dx) .. ":" .. y .. ":" .. (z + dz)
        -- Leave room for ordinary object bounds and a manual focus area.
        if not capture.queued[key] and #capture.queue < config.MaxTiles - 256 then
            local px, pz = (x + dx + 0.5) * 64, (z + dz + 0.5) * 64
            capture.queue[#capture.queue + 1] = {x = math.floor(px / capture.step), z = math.floor(pz / capture.step), y = image.cf[2], px = px, pz = pz, key = key, fine = true}
            capture.queued[key] = true
        end
    end end
end
local function restrictTrackQueue()
    if config.ScanMode ~= "track" then return end
    local kept, removed = {}, 0
    for index, tile in ipairs(capture.queue) do
        breathe()
        if index < capture.nextTile or tile.fine or tile.route then kept[#kept + 1] = tile
        else removed = removed + 1 end
    end
    capture.queue, capture.queued = kept, {}
    for _, tile in ipairs(kept) do capture.queued[tile.key or (tile.x .. ":" .. tile.z)] = true end
    capture.removedBounds = (capture.removedBounds or 0) + removed
end
local function expand(object)
    if config.ScanMode == "track" then return end
    if not object:IsA("BasePart") and not object:IsA("Model") then return end
    local cf, size
    if object:IsA("Model") then cf, size = object:GetBoundingBox() else cf, size = object.CFrame, object.Size end
    local radiusX = math.abs(cf.RightVector.X) * size.X / 2 + math.abs(cf.UpVector.X) * size.Y / 2 + math.abs(cf.LookVector.X) * size.Z / 2
    local radiusZ = math.abs(cf.RightVector.Z) * size.X / 2 + math.abs(cf.UpVector.Z) * size.Y / 2 + math.abs(cf.LookVector.Z) * size.Z / 2
    local step = capture.step
    for x = math.floor((cf.X - radiusX) / step) - 1, math.floor((cf.X + radiusX) / step) + 1 do
        for z = math.floor((cf.Z - radiusZ) / step) - 1, math.floor((cf.Z + radiusZ) / step) + 1 do
            breathe(0)
            enqueue(Vector3.new((x + 0.5) * step, cf.Y, (z + 0.5) * step))
        end
    end
end
local cacheProperties = {"Name", "CFrame", "Size", "Color", "Material", "MaterialVariant", "Transparency", "Reflectance", "CanCollide", "Anchored", "CustomPhysicalProperties"}
local metadataLeaves = {BoolValue = true, StringValue = true, NumberValue = true, IntValue = true, ObjectValue = true, ClickDetector = true, SelectionBox = true, Highlight = true}
local function cacheablePart(object)
    if object.ClassName ~= "Part" and object.ClassName ~= "WedgePart" and object.ClassName ~= "CornerWedgePart" and object.ClassName ~= "MeshPart" then return false end
    for _, child in ipairs(object:GetChildren()) do
        if not metadataLeaves[child.ClassName] or #child:GetChildren() > 0 then return false end
    end
    return true
end
local function captureObject(object)
    -- Compare immutable-value geometry/appearance properties, including mesh
    -- identity. Leaf runtime metadata does not alter sampled geometry. Models,
    -- meshes/decals stored as children and nested containers are resampled.
    local plain = cacheablePart(object)
    local shape = object:IsA("Part") and object.Shape or nil
    local meshId = object:IsA("MeshPart") and object.MeshId or nil
    local textureId = object:IsA("MeshPart") and object.TextureID or nil
    local cached = plain and partCache[object]
    if cached and cached.mapping == config.CatalogMap[object.Name] and cached.shape == shape and cached.meshId == meshId and cached.textureId == textureId then
        local unchanged = true
        for _, property in ipairs(cacheProperties) do if object[property] ~= cached.values[property] then unchanged = false; break end end
        if unchanged then api.Metrics.cacheHits = api.Metrics.cacheHits + 1; return cached.record end
    end
    api.Metrics.samples = api.Metrics.samples + 1
    local record = {sourceName = object.Name, sourceKey = rawKey(object), class = object.ClassName}
    local ok, image = pcall(sample, object)
    if ok then
        record.image = image
        local item, overrides, reason = resolve(object, image)
        if item and overrides then record.catalogName, record.sourceGuid, record.overrides = item.name, item.guid, overrides
        else record.error = reason or (type(overrides) == "string" and overrides) or "Unrecognized catalog item" end
    else record.error = tostring(image) end
    expand(object)
    seedFineTrack(record.image)
    if plain and not record.error then
        local values = {}; for _, property in ipairs(cacheProperties) do values[property] = object[property] end
        partCache[object] = {record = record, values = values, shape = shape, meshId = meshId, textureId = textureId, mapping = config.CatalogMap[object.Name]}
    end
    return record
end
local function recordKey(record)
    if not recordKeys[record] then recordKeys[record] = imageKey(record.image) end
    return recordKeys[record]
end
local function updateGroup(group)
    local complete = 0
    for _, records in pairs(group.complete) do complete = complete + #records end
    local unresolved = math.max(0, group.maxCount - complete)
    capture.total = (capture.total or 0) + complete + unresolved - (group.count or 0)
    capture.unresolved = (capture.unresolved or 0) + unresolved - (group.unresolved or 0)
    group.count, group.unresolved = complete + unresolved, unresolved
end
local function captureNearby(full, verifySource)
    assert(capture and capture.jobId == game.JobId, "Start Copy in this source server first")
    full = full ~= false
    local localGroups, changed = {}, {}
    local finished = true
    local objects = buildFolder():GetChildren()
    local lastScanStatus = os.clock()
    status(string.format("Scanning 0 / %d streamed objects; %d / %d already captured", #objects, capture.total or 0, capture.expected))
    api.ScanProgress = {checked = 0, total = #objects, full = full, sampled = 0, reused = 0}
    for index, object in ipairs(objects) do
        -- A discovery pass walks existing references cheaply. Full validation
        -- still runs for manual Scan and before completing the backup.
        breathe(full and 1 or 0)
        if api.Busy and api.Paused then finished = false; break end
        local previous = observed[object]
        local record
        if not full and previous and not previous.error then
            record = previous
            api.Metrics.discoveryHits = api.Metrics.discoveryHits + 1
            api.ScanProgress.reused = api.ScanProgress.reused + 1
        else
            record = captureObject(object)
            if verifySource and previous and not previous.error then
                local complete = record.image and #record.image.parts >= #previous.image.parts
                assert(not complete or not record.error and recordKey(record) == recordKey(previous), "Source object changed during copying; stop editing and use NewCopy. Draft preserved.")
                assert(record.image, "Source object no longer validates; draft preserved")
            end
            observed[object] = record
            api.ScanProgress.sampled = api.ScanProgress.sampled + 1
        end
        local key = record.sourceKey
        if full or record ~= previous or record.error then changed[key] = true end
        localGroups[key] = localGroups[key] or {}
        localGroups[key][#localGroups[key] + 1] = record
        api.ScanProgress.checked = index
        if os.clock() - lastScanStatus >= 1 then
            lastScanStatus = os.clock()
            status(string.format("Scanning %d / %d; %d new/rechecked, %d reused; %d / %d captured", index, #objects, api.ScanProgress.sampled, api.ScanProgress.reused, capture.total or 0, capture.expected))
        end
    end
    for key, records in pairs(localGroups) do
        breathe(0)
        if changed[key] then
            breathe()
            local group = capture.groups[key] or {complete = {}, maxCount = 0, errors = {}}
            local complete, errors = {}, {}
            group.maxCount = math.max(group.maxCount, #records)
            for _, record in ipairs(records) do
                if record.error then errors[#errors + 1] = record else
                    local fingerprint = recordKey(record)
                    complete[fingerprint] = complete[fingerprint] or {}
                    complete[fingerprint][#complete[fingerprint] + 1] = record
                end
            end
            -- Keep the greatest observed multiplicity of each appearance, including
            -- coincident objects that stream in separate snapshots. A later partial
            -- Model cannot replace its previously captured complete contents.
            for fingerprint, matches in pairs(complete) do
                if #matches >= #(group.complete[fingerprint] or {}) then group.complete[fingerprint] = matches end
            end
            if #errors > 0 then group.errors = errors end
            updateGroup(group)
            capture.groups[key] = group
        end
    end
    return finished
end
local function capturedRecords()
    local keys, records = {}, {}
    for key in pairs(capture.groups) do breathe(); keys[#keys + 1] = key end
    table.sort(keys)
    for _, key in ipairs(keys) do
        breathe()
        local group, fingerprints, total = capture.groups[key], {}, 0
        for fingerprint in pairs(group.complete) do fingerprints[#fingerprints + 1] = fingerprint end
        table.sort(fingerprints)
        for _, fingerprint in ipairs(fingerprints) do
            for ordinal, record in ipairs(group.complete[fingerprint]) do
                breathe()
                record.id = key .. ":" .. (total + 1)
                records[#records + 1] = record; total = total + 1
            end
        end
        for i = 1, group.maxCount - total do
            local record = assert(group.errors[i], "Missing unresolved capture metadata")
            record.id = key .. ":unresolved:" .. i
            records[#records + 1] = record
        end
    end
    return records
end
local function captureReport(includeExamples)
    local errors = {}
    if includeExamples then
        for _, group in pairs(capture.groups) do
            breathe()
            for i = 1, group.unresolved or 0 do
                local record = group.errors[i]
                if #errors < 20 then errors[#errors + 1] = {name = record.sourceName, class = record.class or record.image and record.image.class, reason = record.error, position = record.image and {record.image.cf[1], record.image.cf[2], record.image.cf[3]}} end
            end
        end
    end
    return {version = api.Version, scanMode = config.ScanMode, removedBounds = capture.removedBounds or 0, captured = capture.total or 0, expected = capture.expected, unresolved = capture.unresolved or 0, examples = errors, tilesVisited = capture.nextTile - 1, tilesQueued = #capture.queue, focus = capture.focus, recovery = capture.recovery, idleAreas = capture.idleAreas or 0, scan = api.ScanProgress, noClip = api.NoClipActive == true, metrics = api.Metrics}
end
local function copyDocument(complete)
    return {
        format = "jakarta-build-v1", backupId = capture.id, complete = complete,
        source = {placeId = game.PlaceId, jobId = capture.jobId, userId = player.UserId, createdAt = capture.createdAt, expectedCount = capture.expected},
        records = capturedRecords(), report = captureReport(),
        scan = not complete and {step = capture.step, queue = capture.queue, nextTile = capture.nextTile, focus = capture.focus, lastVisit = capture.lastVisit, mode = config.ScanMode, recovery = capture.recovery} or nil,
    }
end
local function saveDraft()
    status("Writing local draft; keep this server open...")
    disk(config.DraftFile, copyDocument(false))
    capture.lastDraft = os.clock()
end
local function restoreDraft()
    if freshCapture or not exists(config.DraftFile) then return false end
    local document = unseal(readfile(config.DraftFile))
    if document.format ~= "jakarta-build-v1" or document.complete ~= false or type(document.source) ~= "table" or document.source.jobId ~= game.JobId then return false end
    if exists(config.BackupFile) then
        local ok, completed = pcall(function() return unseal(readfile(config.BackupFile)) end)
        if ok and completed.complete and completed.backupId == document.backupId then return false end
    end
    local scan = document.scan
    assert(type(scan) == "table", "Older draft cannot resume a scan; use NewCopy while the source server is still open")
    assert(scan.step == config.GridStep, "Keep the draft's GridStep unchanged, or use NewCopy")
    assert(type(scan.queue) == "table" and #scan.queue <= config.MaxTiles and finite(scan.nextTile) and scan.nextTile % 1 == 0 and scan.nextTile >= 1 and scan.nextTile <= #scan.queue + 1, "Invalid draft scan")
    assert(type(document.backupId) == "string" and finite(document.source.expectedCount) and document.source.expectedCount >= 0 and type(document.records) == "table", "Invalid draft metadata")
    local recovered = {id = document.backupId, jobId = game.JobId, createdAt = document.source.createdAt, expected = document.source.expectedCount, step = scan.step, queue = scan.queue, nextTile = scan.nextTile, focus = scan.focus, lastVisit = scan.lastVisit, groups = {}, queued = {}}
    if recovered.focus then
        assert(type(recovered.focus) == "table" and #recovered.focus == 3, "Invalid draft focus")
        for _, n in ipairs(recovered.focus) do assert(finite(n), "Invalid draft focus coordinate") end
    else
        local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
        if root then recovered.focus = vec(root.Position) end
    end
    if recovered.lastVisit then
        assert(type(recovered.lastVisit) == "table" and #recovered.lastVisit == 3, "Invalid draft last visit")
        for _, n in ipairs(recovered.lastVisit) do assert(finite(n), "Invalid draft last visit coordinate") end
    end
    if scan.recovery then
        assert(type(scan.recovery) == "table" and type(scan.recovery.id) == "string" and finite(scan.recovery.points) and scan.recovery.points % 1 == 0 and scan.recovery.points >= 1 and scan.recovery.points <= config.MaxTiles and finite(scan.recovery.checked) and scan.recovery.checked % 1 == 0 and scan.recovery.checked >= 0 and scan.recovery.checked <= scan.recovery.points, "Invalid draft recovery pass")
        recovered.recovery = scan.recovery
    end
    for _, tile in ipairs(scan.queue) do
        breathe()
        assert(finite(tile.x) and tile.x % 1 == 0 and finite(tile.z) and tile.z % 1 == 0 and finite(tile.y), "Invalid draft scan position")
        if tile.fine or tile.route then
            assert(finite(tile.px) and finite(tile.pz), "Invalid precise scan point")
            if tile.fine then assert(type(tile.key) == "string", "Invalid fine scan point key") end
        end
        recovered.queued[tile.key or (tile.x .. ":" .. tile.z)] = true
    end
    for _, record in ipairs(document.records) do
        breathe()
        assert(type(record.sourceKey) == "string", "Invalid draft object identity")
        local group = recovered.groups[record.sourceKey] or {complete = {}, maxCount = 0, errors = {}}
        group.maxCount = group.maxCount + 1
        if record.error then group.errors[#group.errors + 1] = record else
            local fingerprint = recordKey(record)
            group.complete[fingerprint] = group.complete[fingerprint] or {}
            group.complete[fingerprint][#group.complete[fingerprint] + 1] = record
        end
        recovered.groups[record.sourceKey] = group
    end
    assert(serverCount() == recovered.expected, "Source object count changed since the draft; use NewCopy after editing stops")
    capture = recovered
    restrictTrackQueue()
    for _, group in pairs(capture.groups) do breathe(); updateGroup(group) end
    for _, record in ipairs(document.records) do breathe(); seedFineTrack(record.image) end
    status("Resumed local draft from this source server")
    return true
end
local function startCapture()
    access(); settings(); loadCatalog()
    if restoreDraft() then return end
    freshCapture = nil
    observed = setmetatable({}, {__mode = "k"})
    capture = {id = http:GenerateGUID(false), jobId = game.JobId, createdAt = os.time(), expected = serverCount(), groups = {}, queue = {}, queued = {}, nextTile = 1, step = config.GridStep}
    -- Prioritize the whole known circuit if its builder is still in memory.
    local builder = _G.SuzukaBuilder
    if builder and builder.GetTarget and finite(builder.Count) then
        for i = 1, builder.Count, 20 do
            breathe()
            local ok, target = pcall(builder.GetTarget, i)
            if ok and target and target.cf then
                if config.ScanMode == "bounds" then enqueue(target.cf.Position)
                elseif typeof(target.size) == "Vector3" then seedFineTrack({kind = "Part", cf = frame(target.cf), size = vec(target.size)}) end
            end
        end
    end
    local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
    assert(root, "Spawn your character first")
    capture.focus = vec(root.Position)
    enqueue(root.Position, true)
    captureNearby(); saveDraft()
end
local function run(label, operation)
    assert(not api.Busy, "Another transfer operation is running")
    access(); settings()
    api.Busy, api.Paused, api.State = true, false, label
    applyFPS()
    task.wait() -- Draw the panel and accept input before starting heavy work.
    local ok, result = pcall(operation)
    if not ok and label == "copying" and capture then pcall(saveDraft) end
    restoreCharacter(); restoreFPS()
    api.Busy = false
    if not ok then api.State = "stopped"; status(tostring(result)); error(result, 0) end
    if api.Paused then api.State = "paused"; status("Paused. Local progress preserved; use Copy or Paste / Resume to continue.") end
    return result
end
function api.Scan()
    return run("copying", function()
        if not capture then startCapture() end
        captureNearby(); saveDraft()
        local report = captureReport(true)
        status(string.format("Captured %d / %d; unresolved=%d. Draft saved.", report.captured, report.expected, report.unresolved))
        return report
    end)
end
local function addFocus(position, radius, step, heights, recovery)
    local points, pass = {}, http:GenerateGUID(false)
    for _, offset in ipairs(heights) do
        local py = position.Y + offset
        points[#points + 1] = {x = math.floor(position.X / capture.step), z = math.floor(position.Z / capture.step), y = py, px = position.X, pz = position.Z, fine = true, focused = true, anchor = true, recovery = recovery and pass or nil, key = "fine:" .. pass .. ":centre:" .. offset}
        for x = math.floor((position.X - radius) / step), math.floor((position.X + radius) / step) do
            for z = math.floor((position.Z - radius) / step), math.floor((position.Z + radius) / step) do
                breathe(0)
                local px, pz = (x + 0.5) * step, (z + 0.5) * step
                if (px - position.X) ^ 2 + (pz - position.Z) ^ 2 <= radius ^ 2 then
                    points[#points + 1] = {x = math.floor(px / capture.step), z = math.floor(pz / capture.step), y = py, px = px, pz = pz, fine = true, focused = true, recovery = recovery and pass or nil, key = "fine:" .. pass .. ":" .. x .. ":" .. offset .. ":" .. z}
                end
            end
        end
    end
    assert(#capture.queue + #points <= config.MaxTiles, "Focus area exceeds MaxTiles; use a smaller focus radius")
    for _, point in ipairs(points) do capture.queue[#capture.queue + 1] = point; capture.queued[point.key] = true end
    capture.lastVisit = vec(position)
    return #points, pass
end
local function recoverPit()
    local position = vector(capture.focus)
    local count, pass = addFocus(position, config.RecoveryRadius, 32, {0, 64}, true)
    capture.recovery = {id = pass, points = count, checked = 0}
    saveDraft()
    status(string.format("Count stalled: %d / %d. Checking pit/start area at 32-stud spacing (%d points, two heights).", capture.total or 0, capture.expected, count))
end
function api.FocusHere(radius)
    return run("copying", function()
        if not capture then startCapture() end
        local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
        assert(root, "Spawn your character first")
        radius = radius or config.FocusRadius
        assert(finite(radius) and radius >= 64 and radius <= 1024, "Focus radius must be 64..1024")
        local position = root.Position
        local points = addFocus(position, radius, config.FocusStep, {0}, false)
        capture.focus = vec(position)
        capture.recovery = nil
        saveDraft()
        api.State = "ready"
        status(string.format("Focus here: %d close scan points queued; %d / %d captured. Press Copy / Resume.", points, capture.total or 0, capture.expected))
        return points
    end)
end
local function nextScanTile()
    local best, rank, distance
    for index = capture.nextTile, #capture.queue do
        breathe(0)
        if api.Paused then return end
        local tile = capture.queue[index]
        local priority = tile.focused and 0 or tile.anchor and 1 or tile.fine and 2 or 3
        local px, pz = tile.px or (tile.x + 0.5) * capture.step, tile.pz or (tile.z + 0.5) * capture.step
        local origin = capture.lastVisit or capture.focus
        local squared = origin and ((px - origin[1]) ^ 2 + (pz - origin[3]) ^ 2 + (tile.y - origin[2]) ^ 2) or index
        if not best or priority < rank or priority == rank and squared < distance then best, rank, distance = index, priority, squared end
    end
    if not best then return end
    capture.queue[capture.nextTile], capture.queue[best] = capture.queue[best], capture.queue[capture.nextTile]
    return capture.queue[capture.nextTile]
end
local function finishCopy()
    assert(capture, "Run Copy first")
    status("Validating all currently streamed objects before completion...")
    captureNearby(true, true)
    if api.Paused then saveDraft(); return end
    local report = captureReport()
    local current = serverCount()
    saveDraft()
    if api.Paused then return end
    assert(current == capture.expected, "Source object count changed while copying; stop editing and start a new Copy")
    assert(report.captured == current, string.format("Backup is incomplete: captured %d / %d. Keep this server open; walk to missing areas and Scan nearby.", report.captured, current))
    assert(report.unresolved == 0, "Some catalog objects/Models are unresolved; inspect _G.JakartaTransfer.Report().examples. Draft preserved.")
    local document = copyDocument(true)
    if api.Paused then return end
    status("Verifying complete backup on disk...")
    disk(config.BackupFile, document, true)
    local verified = unseal(readfile(config.BackupFile))
    assert(verified.complete and verified.backupId == capture.id and #verified.records == current, "Backup verification failed")
    api.State = "copied"
    status(string.format("COPY COMPLETE: %d objects. %s verified. You can join your friend's server on this device/executor.", current, config.BackupFile))
    return document
end
local function revisitUnresolved()
    -- Once every root is captured, stream the unresolved Models at their own
    -- positions once. Do not traverse the entire circuit indefinitely for an
    -- object that normal catalog placement cannot reproduce.
    local positions, visited = {}, {}
    for _, group in pairs(capture.groups) do
        breathe()
        for i = 1, group.unresolved or 0 do
            local record = group.errors[i]
            local image = record and record.image
            if image and image.cf and #positions < 20 then
                local key = arrayKey(image.cf)
                if not visited[key] then positions[#positions + 1] = cframe(image.cf).Position; visited[key] = true end
            end
        end
    end
    for index, position in ipairs(positions) do
        if api.Paused then break end
        status(string.format("Rechecking unresolved objects: area %d / %d", index, #positions))
        visit(position)
        if api.Paused then break end
        captureNearby()
        if capture.unresolved == 0 then break end
    end
end
function api.FinishCopy()
    return run("copying", finishCopy)
end
function api.Copy()
    return run("copying", function()
        if not capture then startCapture() else loadCatalog() end
        assert(capture.jobId == game.JobId, "Join the original source server to continue this capture")
        assert(config.GridStep == capture.step, "Keep GridStep unchanged during a capture")
        restrictTrackQueue()
        captureNearby(false)
        local lastStatus, lastGrowth, idleAreas, recoveryIdle = os.clock(), os.clock(), 0, 0
        capture.idleAreas = 0
        while not api.Paused do
            local report = captureReport()
            assert(report.captured <= capture.expected, "Captured extra source identities; stop editing and use NewCopy in this source server")
            if report.captured == capture.expected then
                if report.unresolved > 0 then revisitUnresolved() end
                if api.Paused then break end
                return finishCopy()
            end
            if config.ScanMode == "track" and capture.focus and not capture.recovery and (idleAreas >= config.StallAreas or os.clock() - lastGrowth >= config.StallSeconds) then
                recoverPit()
                idleAreas, lastGrowth = 0, os.clock()
            end
            assert(recoveryIdle < config.StallAreas * 2, string.format("No new objects after %d close recovery checks: %d / %d captured. Draft preserved. Keep this server open; move to the pit, press Focus here, then Copy / Resume.", recoveryIdle, report.captured, capture.expected))
            local tile = nextScanTile()
            if not tile and not api.Paused and config.ScanMode == "track" and capture.focus and not capture.recovery then
                recoverPit()
                tile = nextScanTile()
            end
            if not tile then break end
            visit(Vector3.new(tile.px or (tile.x + 0.5) * capture.step, tile.y, tile.pz or (tile.z + 0.5) * capture.step), tile.recovery and math.max(config.SettleTime, config.RecoverySettleTime) or nil)
            if api.Paused then break end
            local beforeCount = capture.total or 0
            if captureNearby(false) then
                capture.nextTile = capture.nextTile + 1
                if tile.recovery and capture.recovery and tile.recovery == capture.recovery.id then capture.recovery.checked = capture.recovery.checked + 1 end
                if (capture.total or 0) > beforeCount then
                    idleAreas, recoveryIdle, lastGrowth = 0, 0, os.clock()
                else
                    idleAreas = idleAreas + 1
                    if tile.recovery then recoveryIdle = recoveryIdle + 1 end
                end
                capture.idleAreas = idleAreas
            end
            if os.clock() - (capture.lastDraft or 0) >= config.DraftInterval then saveDraft() end
            if os.clock() - lastStatus >= 1 then
                report = captureReport(); lastStatus = os.clock()
                status(string.format("Copy: %d / %d; %d unresolved; %d areas; %d scans without new objects%s", report.captured, report.expected, report.unresolved, report.tilesVisited, idleAreas, capture.recovery and string.format("; pit %d / %d", capture.recovery.checked, capture.recovery.points) or ""))
            end
        end
        saveDraft()
        if not api.Paused then return finishCopy() end
    end)
end
function api.NewCopy()
    assert(not api.Busy, "Pause before starting a new capture")
    capture, freshCapture = nil, true
    return api.Copy()
end

local function validateArray(value, count, minimum, maximum)
    assert(type(value) == "table" and #value == count, "Malformed numeric array")
    for _, n in ipairs(value) do assert(finite(n) and (not minimum or n >= minimum) and (not maximum or n <= maximum), "Invalid numeric value") end
end
local function validateFrame(value)
    validateArray(value, 12)
    local cf = cframe(value)
    assert(near(cf.RightVector.Magnitude, 1, 0.002) and near(cf.UpVector.Magnitude, 1, 0.002) and near(cf.LookVector.Magnitude, 1, 0.002) and math.abs(cf.RightVector:Dot(cf.UpVector)) < 0.002 and math.abs(cf.RightVector:Dot(cf.LookVector)) < 0.002 and math.abs(cf.UpVector:Dot(cf.LookVector)) < 0.002, "Invalid object rotation")
    assert(cf.RightVector:Cross(cf.UpVector):Dot(cf.LookVector) < -0.998, "Reflected object rotation")
end
local function validateDocument(document)
    assert(document.format == "jakarta-build-v1" and document.complete == true, "Use the verified complete backup, not the draft")
    assert(type(document.backupId) == "string" and type(document.source) == "table" and document.source.placeId == game.PlaceId and type(document.source.jobId) == "string", "Backup targets a different game")
    assert(document.source.jobId ~= game.JobId, "This is the source server. Join your friend's Jakarta server before pasting.")
    assert(type(document.records) == "table" and #document.records == document.source.expectedCount and #document.records <= 200000, "Backup count is invalid")
    local ids = {}
    for _, record in ipairs(document.records) do
        breathe()
        assert(type(record) == "table" and type(record.id) == "string" and not ids[record.id] and not record.error and type(record.catalogName) == "string", "Invalid/unresolved backup object")
        ids[record.id] = true
        local image = record.image
        assert(type(image) == "table" and (image.kind == "Model" or image.kind == "Part") and type(image.parts) == "table" and #image.parts > 0 and type(image.visuals) == "table", "Missing object geometry")
        validateFrame(image.cf)
        if image.kind == "Model" then assert(finite(image.size) and image.size > 0 and image.size <= 1000, "Invalid Model scale") else validateArray(image.size, 3, 0.001, 2048) end
        for _, p in ipairs(image.parts) do
            breathe()
            validateFrame(p.cf); validateArray(p.size, 3, 0.000001); validateArray(p.color, 3, 0, 1)
            assert(type(p.class) == "string" and type(p.mesh) == "string" and type(p.shape) == "string" and type(p.variant) == "string" and Enum.Material[p.material], "Invalid Part metadata")
            assert(finite(p.transparency) and p.transparency >= 0 and p.transparency <= 1 and finite(p.reflectance) and p.reflectance >= 0 and p.reflectance <= 1 and type(p.collide) == "boolean" and p.anchored == true and type(p.customPhysics) == "boolean", "Invalid Part appearance/physics")
            validateArray(p.physics, p.customPhysics and 5 or 0)
        end
        for _, v in ipairs(image.visuals) do
            assert(type(v.class) == "string" and type(v.texture) == "string" and type(v.face) == "string" and finite(v.transparency) and v.transparency >= 0 and v.transparency <= 1, "Invalid texture metadata")
            validateArray(v.color, 3, 0, 1)
        end
        local o = record.overrides
        assert(type(o) == "table", "Missing placement parameters")
        if o.color ~= nil then validateArray(o.color, 3, 0, 1) end
        if o.material ~= nil then assert(type(o.material) == "string" and Enum.Material[o.material], "Unknown material") end
        if o.variant ~= nil then assert(type(o.variant) == "string", "Invalid material variant") end
        if o.transparency ~= nil then assert(finite(o.transparency) and o.transparency >= 0 and o.transparency <= 1, "Invalid transparency") end
        if o.collide ~= nil then assert(type(o.collide) == "boolean", "Invalid collision override") end
        local item = catalog.names[config.CatalogMap[record.catalogName] or record.catalogName]
        assert(item, "Destination catalog item missing: " .. record.catalogName)
        assert(not item.plus or hasPlus(), "Build Tools Plus is required for " .. item.name)
        assert(not (o.color or o.material) or hasPlus(), "Build Tools Plus is required to preserve this backup's colors/materials")
        assert(appearanceSame(image, predict(item.image, o), 0.002), "Destination template differs or Model is incomplete: " .. record.catalogName)
    end
end
local function targetMatches(actual, expected)
    if not arrayNear(actual.cf, expected.cf, 0.025) then return false end
    if actual.kind == "Model" then
        if not near(actual.size, expected.size, 0.002) then return false end
    elseif not arrayNear(actual.size, expected.size, 0.02) then return false end
    return appearanceSame(actual, expected, 0.005)
end
local function makeIndex(folder)
    local buckets = {}
    local function key(pos) return math.floor(pos.X / 4) .. ":" .. math.floor(pos.Y / 4) .. ":" .. math.floor(pos.Z / 4) end
    local function add(object)
        if object:IsA("BasePart") or object:IsA("Model") then
            local pos = object:IsA("Model") and object:GetPivot().Position or object.Position
            local k = key(pos); buckets[k] = buckets[k] or {}; buckets[k][#buckets[k] + 1] = object
        end
    end
    for _, object in ipairs(folder:GetChildren()) do breathe(); add(object) end
    local connection = folder.ChildAdded:Connect(add)
    local function find(expected, used)
        local pos, groups, seen = cframe(expected.cf).Position, {}, {}
        for x = -1, 1 do for y = -1, 1 do for z = -1, 1 do
            for _, object in ipairs(buckets[key(pos + Vector3.new(x * 4, y * 4, z * 4))] or {}) do
                breathe()
                if object.Parent == folder and not seen[object] then
                    seen[object] = true
                    local ok, image = pcall(sample, object)
                    if ok and targetMatches(image, expected) then
                        local fingerprint = imageKey(image)
                        local group = groups[fingerprint] or {count = 0, object = object}
                        group.count = group.count + 1; groups[fingerprint] = group
                    end
                end
            end
        end end end
        for fingerprint, group in pairs(groups) do
            if group.count > (used[fingerprint] or 0) then return group.object, fingerprint end
        end
    end
    return find, connection
end
local function progressWrite(progress)
    disk(config.ProgressFile, progress)
end
function api.Paste()
    return run("pasting", function()
        loadCatalog()
        local document, backupChecksum = unseal(readfile(config.BackupFile))
        validateDocument(document)
        local count = serverCount()
        local progress
        if exists(config.ProgressFile) then
            local saved = unseal(readfile(config.ProgressFile))
            if saved.format == "jakarta-import-v1" and saved.backupId == document.backupId and saved.backupChecksum == backupChecksum and saved.targetJob == game.JobId then progress = saved end
        end
        if progress then
            assert(count == progress.expectedCount or progress.pending and count == progress.pending.beforeCount + 1, "Destination count changed since the last pause; keep other players from editing during transfer")
        else progress = {format = "jakarta-import-v1", backupId = document.backupId, backupChecksum = backupChecksum, targetJob = game.JobId, expectedCount = count, nextIndex = 1} end
        progress.expectedCount = count
        pending = progress.pending
        local previousNext, used, newCount, reusedCount = progress.nextIndex, {}, 0, 0
        local find, connection = makeIndex(buildFolder())
        local ok, reason = pcall(function()
            for index, record in ipairs(document.records) do
                if api.Paused then break end
                api.Index = index
                local image = record.image
                visit(cframe(image.cf).Position)
                local object, fingerprint = find(image, used)
                if object then
                    if pending and pending.index == index then
                        assert(serverCount() == pending.beforeCount + 1, "Pending placement count cannot be reconciled; no retry was sent")
                        pending, progress.pending = nil, nil
                    end
                    used[fingerprint] = (used[fingerprint] or 0) + 1
                    reusedCount = reusedCount + 1
                else
                    assert(not pending or pending.index ~= index, "Previous placement is still unconfirmed. No duplicate sent. Inspect the server, then use RetryRejected only if that placement was rejected.")
                    assert(index >= previousNext, "A previously confirmed object is not fully streamed/matching; stopped instead of duplicating it")
                    local item = catalog.names[config.CatalogMap[record.catalogName] or record.catalogName]
                    local o = record.overrides
                    pending = {index = index, beforeCount = progress.expectedCount}
                    progress.pending = pending; progress.nextIndex = index
                    -- Persist uncertainty BEFORE sending, including executor/session loss.
                    progressWrite(progress)
                    local started = os.clock()
                    endpoint("RemoteEvents", "PlacementSystem"):FireServer(item.name, cframe(image.cf), image.kind == "Model" and image.size or vector(image.size), o.transparency, o.color and Color3.new(unpackValues(o.color)) or nil, o.material and Enum.Material[o.material] or nil, o.variant, o.collide)
                    local deadline = started + config.PlacementTimeout
                    repeat
                        task.wait(0.05); object, fingerprint = find(image, used)
                    until object or os.clock() >= deadline
                    if not object then
                        visit(cframe(image.cf).Position)
                        object, fingerprint = find(image, used)
                    end
                    assert(object, "Object " .. index .. " unconfirmed; progress saved. No automatic retry. Paste / Resume will reconcile it.")
                    used[fingerprint] = (used[fingerprint] or 0) + 1
                    progress.expectedCount = progress.expectedCount + 1
                    pending, progress.pending = nil, nil
                    newCount = newCount + 1
                    local remaining = config.PlacementInterval - (os.clock() - started)
                    if remaining > 0 then task.wait(remaining) end
                end
                progress.nextIndex = math.max(previousNext, index + 1)
                progressWrite(progress)
                if newCount == 1 or index % 25 == 0 then
                    assert(serverCount() == progress.expectedCount, "Server count does not match confirmed placements; stopped before continuing")
                end
                if index == 1 or index % 25 == 0 then status(string.format("Paste: %d / %d confirmed; %d new, %d reused", index, #document.records, newCount, reusedCount)) end
            end
            assert(serverCount() == progress.expectedCount, "Final server count mismatch; inspect before saving")
            if not api.Paused then
                assert(not pending and progress.nextIndex > #document.records, "Import is not complete")
                progress.complete = true; progressWrite(progress)
                api.State = "pasted"
                status(string.format("PASTE COMPLETE: %d backup objects verified (%d new, %d reused). Have your friend SAVE in a spare slot, then verify by reloading.", #document.records, newCount, reusedCount))
            end
        end)
        connection:Disconnect()
        api.Progress = progress
        if not ok then error(reason, 0) end
        return progress
    end)
end
function api.RetryRejected()
    assert(not api.Busy, "Pause before clearing a rejected request")
    settings()
    local progress = unseal(readfile(config.ProgressFile))
    assert(progress.targetJob == game.JobId and progress.pending, "No pending request in this server")
    assert(serverCount() == progress.pending.beforeCount, "Server count changed; the request may have succeeded. Use Paste / Resume.")
    -- Explicit recovery only: caller must have observed an actual rejection.
    progress.pending = nil; progressWrite(progress); pending = nil
    status("Rejected request cleared. Paste / Resume checks existing objects again before sending.")
end
function api.Pause() api.Paused = true; status("Pausing after the current request finishes...") end
function api.Report()
    local report = capture and captureReport(true) or {state = api.State, index = api.Index, pending = pending, progress = api.Progress, metrics = api.Metrics}
    print("[Jakarta Transfer] " .. http:JSONEncode(report))
    return report
end
function api.Dispose()
    assert(not api.Busy, "Pause before closing the helper")
    restoreCharacter()
    restoreFPS()
    if pauseKey then pauseKey:Disconnect(); pauseKey = nil end
    if screen then screen:Destroy(); screen = nil end
end
local function launch(fn)
    task.spawn(function() local ok, reason = pcall(fn); if not ok then status(tostring(reason)) end end)
end
if not options.Headless then
    screen = Instance.new("ScreenGui")
    screen.Name = "JakartaTransferPanel"; screen.ResetOnSpawn = false
    screen.DisplayOrder = 10000
    screen.Parent = player:WaitForChild("PlayerGui")
    local panel = Instance.new("Frame")
    panel.Size = UDim2.fromOffset(370, 396); panel.Position = UDim2.new(1, -386, 0.5, -198)
    panel.Active = true
    panel.BackgroundColor3 = Color3.fromRGB(25, 29, 38); panel.Parent = screen
    local title = Instance.new("TextLabel")
    title.Size = UDim2.new(1, -20, 0, 30); title.Position = UDim2.fromOffset(10, 8)
    title.BackgroundTransparency = 1; title.Text = "Jakarta · Copy / Paste Build"
    title.TextColor3 = Color3.new(1, 1, 1); title.TextSize = 18; title.Font = Enum.Font.GothamBold; title.Parent = panel
    statusLabel = Instance.new("TextLabel")
    statusLabel.Size = UDim2.new(1, -20, 0, 85); statusLabel.Position = UDim2.fromOffset(10, 40)
    statusLabel.BackgroundTransparency = 1; statusLabel.TextWrapped = true
    statusLabel.TextColor3 = Color3.fromRGB(215, 224, 240); statusLabel.TextSize = 14; statusLabel.Font = Enum.Font.Gotham; statusLabel.Parent = panel
    local function button(text, x, y, fn)
        local b = Instance.new("TextButton")
        b.Size = UDim2.fromOffset(170, 38); b.Position = UDim2.fromOffset(x, y)
        b.BackgroundColor3 = Color3.fromRGB(49, 76, 111); b.TextColor3 = Color3.new(1, 1, 1)
        b.Text = text; b.TextSize = 14; b.Font = Enum.Font.Gotham; b.Parent = panel
        b.Activated:Connect(function() launch(fn) end)
        return b
    end
    button("Copy / Resume scan", 10, 134, api.Copy)
    button("Paste / Resume", 190, 134, api.Paste)
    button("Scan nearby", 10, 180, api.Scan)
    button("Finish copy", 190, 180, api.FinishCopy)
    button("Pause", 10, 226, api.Pause)
    button("Report", 190, 226, api.Report)
    local focusButton = button("Focus here (nearby buildings)", 10, 272, api.FocusHere)
    focusButton.Size = UDim2.fromOffset(350, 38)
    fpsButton = button("FPS mode: " .. (config.FpsMode and "ON" or "OFF"), 10, 318, function() api.SetFPS(not config.FpsMode) end)
    fpsButton.Size = UDim2.fromOffset(350, 38)
    local hint = Instance.new("TextLabel")
    hint.Size = UDim2.new(1, -20, 0, 24); hint.Position = UDim2.fromOffset(10, 364)
    hint.BackgroundTransparency = 1; hint.Text = "F8: Pause  |  3D view returns when stopped"
    hint.TextColor3 = Color3.fromRGB(215, 224, 240); hint.TextSize = 12; hint.Parent = panel
    pcall(function()
        pauseKey = game:GetService("UserInputService").InputBegan:Connect(function(input)
            if input.KeyCode == Enum.KeyCode.F8 then api.Pause() end
        end)
    end)
end
status("Ready. Source: Copy. Friend's server: Paste. Keep the same executor workspace.")
if mode == "copy" then launch(api.Copy) elseif mode == "paste" then launch(api.Paste) else assert(mode == nil or mode == "panel", "Use copy, paste, or panel mode") end
return api
