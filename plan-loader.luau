-- The launcher passes a workspace-relative path; paste mode passes JSON directly.
local dataPath, inlineJson, launchMode, checkpointPath = ...
local raw = inlineJson
if raw == nil then
    dataPath = dataPath or "SepangRibbon/sepang-plan.json"
    assert(type(dataPath) == "string", "Sepang: expected a workspace-relative plan path")
    assert(type(readfile) == "function", "Sepang: readfile is required to load the local JSON plan.")
    local ok, result = pcall(readfile, dataPath)
    assert(ok, "Sepang: cannot read " .. dataPath .. ". Copy the package's SepangRibbon folder into the executor workspace. " .. tostring(result))
    raw = result
end
assert(type(raw) == "string", "Sepang: plan contents must be JSON text")
local decoded, document = pcall(function() return game:GetService("HttpService"):JSONDecode(raw) end)
assert(decoded and type(document) == "table", "Sepang: invalid plan JSON: " .. tostring(document))
local meta = document.meta
local PLAN = document.parts
assert(type(meta) == "table" and meta.format == "sepang-ribbons-v1", "Sepang: incompatible plan. Copy the matching ribbon builder and plan together.")
assert(type(PLAN) == "table" and #PLAN > 0 and #PLAN <= CONFIG.MaxObjects and meta.partCount == #PLAN, "Sepang: invalid plan count or exceeded 15000-object budget")
local function finite(n) return type(n) == "number" and n == n and math.abs(n) < math.huge end
local PALETTE = {}
assert(type(meta.palette) == "table" and #meta.palette > 0, "Sepang: missing palette")
for i, entry in ipairs(meta.palette) do
    assert(type(entry) == "table" and type(entry.rgb) == "table" and #entry.rgb == 3, "Sepang: invalid palette entry")
    for _, n in ipairs(entry.rgb) do assert(finite(n) and n >= 0 and n <= 255, "Sepang: invalid palette color") end
    local material = type(entry.material) == "string" and Enum.Material[entry.material]
    assert(material, "Sepang: unknown plan material")
    PALETTE[i] = {Color3.fromRGB(entry.rgb[1], entry.rgb[2], entry.rgb[3]), material}
end
for i, part in ipairs(PLAN) do
    assert(type(part) == "table" and #part == 13, "Sepang: invalid ribbon part " .. i)
    for _, n in ipairs(part) do assert(finite(n), "Sepang: invalid number in part " .. i) end
    for k = 4, 6 do assert(part[k] >= 0.001 and part[k] <= 2048, "Sepang: invalid dimensions in part " .. i) end
    assert(part[7] % 1 == 0 and PALETTE[part[7]], "Sepang: invalid palette index in part " .. i)
    local right, up = Vector3.new(part[8],part[9],part[10]), Vector3.new(part[11],part[12],part[13])
    assert(math.abs(right.Magnitude-1) < 0.002 and math.abs(up.Magnitude-1) < 0.002 and math.abs(right:Dot(up)) < 0.002 and up.Y > 0, "Sepang: invalid orientation in part " .. i)
end
local bounds = meta.planBounds
assert(type(bounds) == "table" and type(bounds.min) == "table" and type(bounds.max) == "table" and #bounds.min == 3 and #bounds.max == 3, "Sepang: missing plan bounds")
for k = 1, 3 do assert(finite(bounds.min[k]) and finite(bounds.max[k]) and bounds.min[k] <= bounds.max[k], "Sepang: invalid plan bounds") end
local PLAN_BOUNDS = {Vector3.new(bounds.min[1], bounds.min[2], bounds.min[3]), Vector3.new(bounds.max[1], bounds.max[2], bounds.max[3])}
local restoredCheckpoint
if launchMode == "resume" then
    local ok, contents = pcall(readfile, checkpointPath or "SepangRibbon/sepang-checkpoint.json")
    if not ok and checkpointPath then ok, contents = pcall(readfile, "SepangRibbon/sepang-checkpoint.json") end
    assert(ok, "Sepang: checkpoint is missing. Export it from the previous session first.")
    local decoded, saved = pcall(function() return game:GetService("HttpService"):JSONDecode(contents) end)
    assert(decoded and type(saved) == "table" and saved.format == "sepang-checkpoint-v1", "Sepang: invalid checkpoint")
    local checksum = 0
    for _, p in ipairs(PLAN) do for _, n in ipairs(p) do checksum = (checksum * 65599 + math.floor(n * 10000 + 0.5)) % 2147483647 end end
    assert(saved.count == #PLAN and saved.checksum == string.format("%.0f", checksum), "Sepang: checkpoint belongs to different track geometry")
    assert(finite(saved.nextIndex) and saved.nextIndex % 1 == 0 and saved.nextIndex >= 1 and saved.nextIndex <= #PLAN + 1, "Sepang: invalid checkpoint index")
    assert(type(saved.origin) == "table" and #saved.origin == 12 and finite(saved.scale) and saved.scale > 0, "Sepang: invalid checkpoint transform")
    for _, n in ipairs(saved.origin) do assert(finite(n), "Sepang: invalid checkpoint transform") end
    assert(type(saved.catalogName) == "string" and type(saved.applyAppearance) == "boolean", "Sepang: invalid checkpoint catalog")
    CONFIG.Origin, CONFIG.Scale = CFrame.new(table.unpack(saved.origin)), saved.scale
    CONFIG.CatalogName, CONFIG.ApplyAppearance = saved.catalogName, saved.applyAppearance
    restoredCheckpoint = saved
end
raw, inlineJson, document = nil, nil, nil
