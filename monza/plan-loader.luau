-- The launcher passes a workspace-relative path; paste mode passes JSON directly.
local dataPath, inlineJson, launchMode, checkpointPath = ...
local raw = inlineJson
if raw == nil then
    dataPath = dataPath or "MonzaTrack/monza-plan.json"
    assert(type(dataPath) == "string", "Monza: expected a workspace-relative plan path")
    assert(type(readfile) == "function", "Monza: readfile is required to load the local JSON plan.")
    local ok, result = pcall(readfile, dataPath)
    assert(ok, "Monza: cannot read " .. dataPath .. ". Copy the package's MonzaTrack folder into the executor workspace. " .. tostring(result))
    raw = result
end
assert(type(raw) == "string", "Monza: plan contents must be JSON text")
local decoded, document = pcall(function() return game:GetService("HttpService"):JSONDecode(raw) end)
assert(decoded and type(document) == "table", "Monza: invalid plan JSON: " .. tostring(document))
local meta = document.meta
local PLAN = document.parts
assert(type(meta) == "table" and meta.format == "monza-elevated-v1", "Monza: incompatible plan. Copy the matching ribbon builder and plan together.")
assert(type(meta.gameTarget) == "table" and meta.gameTarget.placeId == TARGET_PLACE_ID and meta.gameTarget.name == "Jakarta", "Monza: use the matching Jakarta plan and builder")
assert(type(PLAN) == "table" and #PLAN > 0 and #PLAN <= CONFIG.MaxObjects and meta.partCount == #PLAN, "Monza: invalid plan count or exceeded " .. CONFIG.MaxObjects .. "-object budget")
local function finite(n) return type(n) == "number" and n == n and math.abs(n) < math.huge end
local anchor = meta.placementAnchor
local HAS_PLACEMENT_ANCHOR = anchor ~= nil
local PLAN_ANCHOR = Vector3.new(0,0,0)
if anchor then
    assert(type(anchor) == "table" and type(anchor.position) == "table" and #anchor.position == 3, "Monza: invalid placement anchor")
    for _, n in ipairs(anchor.position) do assert(finite(n), "Monza: invalid placement anchor coordinates") end
    assert(anchor.position[2] == 0, "Monza: horizontal standing anchor must use the plan datum")
    PLAN_ANCHOR = Vector3.new(anchor.position[1],0,anchor.position[3])
end
local PALETTE = {}
assert(type(meta.palette) == "table" and #meta.palette > 0, "Monza: missing palette")
for i, entry in ipairs(meta.palette) do
    assert(type(entry) == "table" and type(entry.rgb) == "table" and #entry.rgb == 3, "Monza: invalid palette entry")
    for _, n in ipairs(entry.rgb) do assert(finite(n) and n >= 0 and n <= 255, "Monza: invalid palette color") end
    local material = type(entry.material) == "string" and Enum.Material[entry.material]
    assert(material, "Monza: unknown plan material")
    PALETTE[i] = {Color3.fromRGB(entry.rgb[1], entry.rgb[2], entry.rgb[3]), material}
end
for i, part in ipairs(PLAN) do
    assert(type(part) == "table" and #part == 13, "Monza: invalid ribbon part " .. i)
    for _, n in ipairs(part) do assert(finite(n), "Monza: invalid number in part " .. i) end
    for k = 4, 6 do assert(part[k] >= 0.001 and part[k] <= 2048, "Monza: invalid dimensions in part " .. i) end
    assert(part[7] % 1 == 0 and PALETTE[part[7]], "Monza: invalid palette index in part " .. i)
    local right, up = Vector3.new(part[8],part[9],part[10]), Vector3.new(part[11],part[12],part[13])
    assert(math.abs(right.Magnitude-1) < 0.002 and math.abs(up.Magnitude-1) < 0.002 and math.abs(right:Dot(up)) < 0.002 and up.Y > 0, "Monza: invalid orientation in part " .. i)
end
local CATALOG_ROLES, PART_ROLE = meta.catalogRoles or {}, {}
assert(type(CATALOG_ROLES) == "table", "Monza: invalid catalog roles")
for roleIndex, role in ipairs(CATALOG_ROLES) do
    assert(type(role) == "table" and type(role.name) == "string" and #role.name > 0 and role.appearance == "color" and type(role.partIndices) == "table", "Monza: invalid catalog role")
    for _, index in ipairs(role.partIndices) do
        assert(finite(index) and index % 1 == 0 and index >= 0 and index < #PLAN and not PART_ROLE[index + 1], "Monza: invalid or duplicate catalog role index")
        PART_ROLE[index + 1] = roleIndex
    end
end
local bounds = meta.planBounds
assert(type(bounds) == "table" and type(bounds.min) == "table" and type(bounds.max) == "table" and #bounds.min == 3 and #bounds.max == 3, "Monza: missing plan bounds")
for k = 1, 3 do assert(finite(bounds.min[k]) and finite(bounds.max[k]) and bounds.min[k] <= bounds.max[k], "Monza: invalid plan bounds") end
local PLAN_BOUNDS = {Vector3.new(bounds.min[1], bounds.min[2], bounds.min[3]), Vector3.new(bounds.max[1], bounds.max[2], bounds.max[3])}
local restoredCheckpoint
if launchMode == "resume" then
    local ok, contents = pcall(readfile, checkpointPath or "MonzaTrack/monza-jakarta-checkpoint.json")
    if not ok and checkpointPath then ok, contents = pcall(readfile, "MonzaTrack/monza-jakarta-checkpoint.json") end
    assert(ok, "Monza: checkpoint is missing. Export it from the previous session first.")
    local decoded, saved = pcall(function() return game:GetService("HttpService"):JSONDecode(contents) end)
    assert(decoded and type(saved) == "table" and saved.format == "monza-checkpoint-v2", "Monza: use a Jakarta checkpoint; Jawa Timur checkpoints require their original loader")
    assert(saved.placeId == TARGET_PLACE_ID, "Monza: checkpoint belongs to a different map; start a fresh Jakarta build")
    if saved.saveObjectLimit ~= nil then assert(finite(saved.saveObjectLimit) and saved.saveObjectLimit >= 1 and saved.saveObjectLimit % 1 == 0, "Monza: invalid checkpoint save limit") end
    local checksum = 0
    for _, p in ipairs(PLAN) do for _, n in ipairs(p) do checksum = (checksum * 65599 + math.floor(n * 10000 + 0.5)) % 2147483647 end end
    assert(saved.count == #PLAN and saved.checksum == string.format("%.0f", checksum), "Monza: checkpoint belongs to different track geometry")
    assert(finite(saved.nextIndex) and saved.nextIndex % 1 == 0 and saved.nextIndex >= 1 and saved.nextIndex <= #PLAN + 1, "Monza: invalid checkpoint index")
    assert(type(saved.origin) == "table" and #saved.origin == 12 and finite(saved.scale) and saved.scale > 0, "Monza: invalid checkpoint transform")
    for _, n in ipairs(saved.origin) do assert(finite(n), "Monza: invalid checkpoint transform") end
    assert(type(saved.catalogName) == "string" and type(saved.applyAppearance) == "boolean", "Monza: invalid checkpoint catalog")
    local savedRoles = saved.catalogRoles or {}
    assert(type(savedRoles) == "table" and #savedRoles == #CATALOG_ROLES, "Monza: checkpoint uses different catalog roles")
    for i, role in ipairs(CATALOG_ROLES) do
        assert(type(savedRoles[i]) == "table" and savedRoles[i].name == role.name and savedRoles[i].appearance == role.appearance, "Monza: checkpoint uses a different road tile")
        local indices = savedRoles[i].partIndices
        assert(type(indices) == "table" and #indices == #role.partIndices, "Monza: checkpoint uses different road tile assignments")
        for k, index in ipairs(role.partIndices) do assert(indices[k] == index, "Monza: checkpoint uses different road tile assignments") end
    end
    CONFIG.Origin, CONFIG.Scale = CFrame.new(table.unpack(saved.origin)), saved.scale
    CONFIG.CatalogName, CONFIG.ApplyAppearance = saved.catalogName, saved.applyAppearance
    if saved.saveObjectLimit ~= nil then CONFIG.SaveObjectLimit = saved.saveObjectLimit end
    restoredCheckpoint = saved
end
raw, inlineJson, document = nil, nil, nil
