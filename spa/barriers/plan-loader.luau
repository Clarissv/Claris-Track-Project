-- The launcher passes a workspace-relative path; paste mode passes JSON directly.
local dataPath, inlineJson, launchMode, checkpointPath, liveCheckpoint = ...
local raw = inlineJson
if raw == nil then
    dataPath = dataPath or "SpaBarriers/spa-plan.json"
    assert(type(dataPath) == "string", "Spa-Francorchamps: expected a workspace-relative plan path")
    assert(type(readfile) == "function", "Spa-Francorchamps: readfile is required to load the local JSON plan.")
    local ok, result = pcall(readfile, dataPath)
    assert(ok, "Spa-Francorchamps: cannot read " .. dataPath .. ". Copy the package's SpaBarriers folder into the executor workspace. " .. tostring(result))
    raw = result
end
assert(type(raw) == "string", "Spa-Francorchamps: plan contents must be JSON text")
local decoded, document = pcall(function() return game:GetService("HttpService"):JSONDecode(raw) end)
assert(decoded and type(document) == "table", "Spa-Francorchamps: invalid plan JSON: " .. tostring(document))
local meta = document.meta
local PLAN = document.parts
assert(type(meta) == "table" and meta.format == "spa-elevated-v1", "Spa-Francorchamps: incompatible plan. Copy the matching ribbon builder and plan together.")
assert(type(meta.gameTarget) == "table" and meta.gameTarget.placeId == TARGET_PLACE_ID and meta.gameTarget.name == "Jakarta", "Spa-Francorchamps: use the matching Jakarta plan and builder")
assert(type(PLAN) == "table" and #PLAN > 0 and #PLAN <= CONFIG.MaxObjects and meta.partCount == #PLAN, "Spa-Francorchamps: invalid plan count or exceeded " .. CONFIG.MaxObjects .. "-object budget")
local function finite(n) return type(n) == "number" and n == n and math.abs(n) < math.huge end
local anchor = meta.placementAnchor
local HAS_PLACEMENT_ANCHOR = anchor ~= nil
local PLAN_ANCHOR = Vector3.new(0,0,0)
if anchor then
    assert(type(anchor) == "table" and type(anchor.position) == "table" and #anchor.position == 3, "Spa-Francorchamps: invalid placement anchor")
    for _, n in ipairs(anchor.position) do assert(finite(n), "Spa-Francorchamps: invalid placement anchor coordinates") end
    assert(anchor.position[2] == 0, "Spa-Francorchamps: horizontal standing anchor must use the plan datum")
    PLAN_ANCHOR = Vector3.new(anchor.position[1],0,anchor.position[3])
end
if meta.variant == "clear-start-compact" then
    local domain = meta.startDomain
    assert(type(domain) == "table" and domain.halfSize == 200 and type(domain.center) == "table" and #domain.center == 2, "Spa-Francorchamps: missing clear starting area")
    assert(anchor and anchor.name == "clear-area" and anchor.position[1] == domain.center[1] and anchor.position[3] == domain.center[2], "Spa-Francorchamps: clear area and standing anchor differ")
end
local PALETTE = {}
assert(type(meta.palette) == "table" and #meta.palette > 0, "Spa-Francorchamps: missing palette")
for i, entry in ipairs(meta.palette) do
    assert(type(entry) == "table" and type(entry.rgb) == "table" and #entry.rgb == 3, "Spa-Francorchamps: invalid palette entry")
    for _, n in ipairs(entry.rgb) do assert(finite(n) and n >= 0 and n <= 255, "Spa-Francorchamps: invalid palette color") end
    local material = type(entry.material) == "string" and Enum.Material[entry.material]
    assert(material, "Spa-Francorchamps: unknown plan material")
    assert(entry.materialVariant == nil or type(entry.materialVariant) == "string", "Invalid barrier material variant")
    PALETTE[i] = {Color3.fromRGB(entry.rgb[1], entry.rgb[2], entry.rgb[3]), material, entry.materialVariant or ""}
end
for i, part in ipairs(PLAN) do
    assert(type(part) == "table" and #part == 13, "Spa-Francorchamps: invalid ribbon part " .. i)
    for _, n in ipairs(part) do assert(finite(n), "Spa-Francorchamps: invalid number in part " .. i) end
    for k = 4, 6 do assert(part[k] >= 0.001 and part[k] <= 2048, "Spa-Francorchamps: invalid dimensions in part " .. i) end
    assert(part[7] % 1 == 0 and PALETTE[part[7]], "Spa-Francorchamps: invalid palette index in part " .. i)
    local right, up = Vector3.new(part[8],part[9],part[10]), Vector3.new(part[11],part[12],part[13])
    assert(math.abs(right.Magnitude-1) < 0.002 and math.abs(up.Magnitude-1) < 0.002 and math.abs(right:Dot(up)) < 0.002 and up.Y > 0, "Spa-Francorchamps: invalid orientation in part " .. i)
end
local NON_COLLIDING_INDICES, NON_COLLIDING = meta.nonCollidingPartIndices or {}, {}
assert(type(NON_COLLIDING_INDICES) == "table", "Spa-Francorchamps: invalid collision assignments")
for _, index in ipairs(NON_COLLIDING_INDICES) do
    assert(finite(index) and index % 1 == 0 and index >= 0 and index < #PLAN and not NON_COLLIDING[index + 1], "Spa-Francorchamps: invalid or duplicate collision index")
    NON_COLLIDING[index + 1] = true
end
local CATALOG_ROLES, PART_ROLE = meta.catalogRoles or {}, {}
assert(type(CATALOG_ROLES) == "table", "Spa-Francorchamps: invalid catalog roles")
for roleIndex, role in ipairs(CATALOG_ROLES) do
    assert(type(role) == "table" and type(role.name) == "string" and #role.name > 0 and (role.appearance == "color" or role.appearance == "template") and type(role.partIndices) == "table", "Spa-Francorchamps: invalid catalog role")
    for _, index in ipairs(role.partIndices) do
        assert(finite(index) and index % 1 == 0 and index >= 0 and index < #PLAN and not PART_ROLE[index + 1], "Spa-Francorchamps: invalid or duplicate catalog role index")
        PART_ROLE[index + 1] = roleIndex
    end
end
local bounds = meta.planBounds
assert(type(bounds) == "table" and type(bounds.min) == "table" and type(bounds.max) == "table" and #bounds.min == 3 and #bounds.max == 3, "Spa-Francorchamps: missing plan bounds")
for k = 1, 3 do assert(finite(bounds.min[k]) and finite(bounds.max[k]) and bounds.min[k] <= bounds.max[k], "Spa-Francorchamps: invalid plan bounds") end
local PLAN_BOUNDS = {Vector3.new(bounds.min[1], bounds.min[2], bounds.min[3]), Vector3.new(bounds.max[1], bounds.max[2], bounds.max[3])}
local REQUIRED_BASE = meta.requiredBase
assert(type(REQUIRED_BASE) == "table" and finite(REQUIRED_BASE.count) and REQUIRED_BASE.count > 0 and REQUIRED_BASE.count % 1 == 0 and type(REQUIRED_BASE.checksum) == "string" and type(REQUIRED_BASE.version) == "string" and type(REQUIRED_BASE.references) == "table" and #REQUIRED_BASE.references > 0, "Missing matching road requirements")
assert(meta.variant == "clear-start-compact-barriers", "Use the matching barrier plan")
local INITIAL_SERVER_COUNT
local restoredCheckpoint
if launchMode == "resume" or launchMode == "handoff" then
    local saved
    if launchMode=="handoff" then
        assert(type(liveCheckpoint)=="table" and liveCheckpoint.previous==_G.SpaBarriersBuilder and liveCheckpoint.previous.State~="building", "Keep the stopped road session loaded for handoff")
        saved=liveCheckpoint
        assert(type(saved.placed)=="table" and finite(saved.sentCount) and saved.sentCount>=0 and saved.sentCount%1==0 and finite(saved.reusedCount) and saved.reusedCount>=0 and saved.reusedCount%1==0,"Invalid live road ownership/counts")
        for index,object in pairs(saved.placed) do assert(finite(index) and index%1==0 and index>=1 and index<saved.nextIndex and object:IsA("BasePart"),"Invalid live road ownership") end
    else
    local ok, contents = pcall(readfile, checkpointPath or "SpaBarriers/spa-barriers-jakarta-checkpoint.json")
    if not ok and checkpointPath then ok, contents = pcall(readfile, "SpaBarriers/spa-barriers-jakarta-checkpoint.json") end
    assert(ok, "Spa-Francorchamps: checkpoint is missing. Export it from the previous session first.")
    local decoded;decoded,saved = pcall(function() return game:GetService("HttpService"):JSONDecode(contents) end)
    assert(decoded and type(saved) == "table" and saved.format == "spa-checkpoint-v2", "Spa-Francorchamps: use a Jakarta checkpoint; Jawa Timur checkpoints require their original loader")
    end
    assert(type(saved)=="table" and saved.format=="spa-checkpoint-v2","Invalid road handoff/checkpoint")
    assert(saved.placeId == TARGET_PLACE_ID, "Spa-Francorchamps: checkpoint belongs to a different map; start a fresh Jakarta build")
    if saved.saveObjectLimit ~= nil then assert(finite(saved.saveObjectLimit) and saved.saveObjectLimit >= 1 and saved.saveObjectLimit % 1 == 0, "Spa-Francorchamps: invalid checkpoint save limit") end
    local checksum = 0
    for _, p in ipairs(PLAN) do for _, n in ipairs(p) do checksum = (checksum * 65599 + math.floor(n * 10000 + 0.5)) % 2147483647 end end
    assert(saved.count == #PLAN and saved.checksum == string.format("%.0f", checksum), "Spa-Francorchamps: checkpoint belongs to different track geometry")
    local savedCollision = saved.nonCollidingPartIndices or {}
    assert(type(savedCollision) == "table" and #savedCollision == #NON_COLLIDING_INDICES, "Spa-Francorchamps: checkpoint uses different surface collisions")
    for i, index in ipairs(NON_COLLIDING_INDICES) do assert(savedCollision[i] == index, "Spa-Francorchamps: checkpoint uses different surface collisions") end
    assert(finite(saved.nextIndex) and saved.nextIndex % 1 == 0 and saved.nextIndex >= 1 and saved.nextIndex <= #PLAN + 1, "Spa-Francorchamps: invalid checkpoint index")
    assert(type(saved.origin) == "table" and #saved.origin == 12 and finite(saved.scale) and saved.scale > 0, "Spa-Francorchamps: invalid checkpoint transform")
    for _, n in ipairs(saved.origin) do assert(finite(n), "Spa-Francorchamps: invalid checkpoint transform") end
    assert(type(saved.catalogName) == "string" and type(saved.applyAppearance) == "boolean", "Spa-Francorchamps: invalid checkpoint catalog")
    local savedRoles = saved.catalogRoles or {}
    assert(type(savedRoles) == "table" and #savedRoles == #CATALOG_ROLES, "Spa-Francorchamps: checkpoint uses different catalog roles")
    for i, role in ipairs(CATALOG_ROLES) do
        assert(type(savedRoles[i]) == "table" and savedRoles[i].name == role.name and savedRoles[i].appearance == role.appearance, "Spa-Francorchamps: checkpoint uses a different road tile")
        local indices = savedRoles[i].partIndices
        assert(type(indices) == "table" and #indices == #role.partIndices, "Spa-Francorchamps: checkpoint uses different road tile assignments")
        for k, index in ipairs(role.partIndices) do assert(indices[k] == index, "Spa-Francorchamps: checkpoint uses different road tile assignments") end
    end
    CONFIG.Origin, CONFIG.Scale = CFrame.new(table.unpack(saved.origin)), saved.scale
    CONFIG.CatalogName, CONFIG.ApplyAppearance = saved.catalogName, saved.applyAppearance
    if saved.saveObjectLimit ~= nil then CONFIG.SaveObjectLimit = saved.saveObjectLimit end
    if saved.expectedServerCount ~= nil then assert(finite(saved.expectedServerCount) and saved.expectedServerCount % 1 == 0 and (launchMode=="handoff" and saved.expectedServerCount>=saved.nextIndex-1 or launchMode~="handoff" and saved.expectedServerCount >= REQUIRED_BASE.count + saved.nextIndex), "Spa-Francorchamps: invalid recovery prefix count") end
    assert(saved.expectedServerCount ~= nil, "Barrier checkpoint needs the combined server count")
    assert(saved.requiredBase and saved.requiredBase.version == REQUIRED_BASE.version and saved.requiredBase.checksum == REQUIRED_BASE.checksum and saved.requiredBase.count == REQUIRED_BASE.count, "Checkpoint belongs to a different base road")
    restoredCheckpoint = saved
end
-- Inherit the original road transform, never the player's current position.
local road = _G.SpaBuilder
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
        local ok, contents = pcall(readfile, "spa-clear-start-compact-jakarta-checkpoint.json")
        if not ok then ok,contents=pcall(readfile,"Spa/spa-clear-start-compact-jakarta-checkpoint.json") end
        assert(ok, "Load the completed compact road builder or export its matching checkpoint first")
        local saved = game:GetService("HttpService"):JSONDecode(contents)
        assert(type(saved)=="table" and saved.format=="spa-checkpoint-v2" and saved.placeId==TARGET_PLACE_ID and saved.count==REQUIRED_BASE.count and saved.checksum==REQUIRED_BASE.checksum and saved.nextIndex==REQUIRED_BASE.count+1, "Base checkpoint must contain the completed matching road")
        assert(type(saved.origin)=="table" and #saved.origin==12 and finite(saved.scale) and saved.scale>0, "Invalid base checkpoint transform")
        for _, n in ipairs(saved.origin) do assert(finite(n),"Invalid base checkpoint transform") end
        CONFIG.Origin, CONFIG.Scale = CFrame.new(table.unpack(saved.origin)), saved.scale
        INITIAL_SERVER_COUNT = REQUIRED_BASE.count + 1
    end
end
raw, inlineJson, document = nil, nil, nil
