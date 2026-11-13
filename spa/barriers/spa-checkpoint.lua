-- Export progress before leaving a suspended build. Does not place/delete/save game objects.
local dataPath, inlineJson, checkpointPath = ...
local api = assert(_G.SpaBarriersBuilder, "Keep the existing Spa-Francorchamps builder loaded")
assert(api.State ~= "building", "Pause and wait for the build to stop before exporting a checkpoint")
assert(game.PlaceId == 14005966837 and api.PlaceId == game.PlaceId, "Spa-Francorchamps: export this checkpoint from the Jakarta builder")
local request = assert(api.RequestDiagnostics(), "No captured placement transform")
assert(type(writefile) == "function", "The executor needs writefile to export the checkpoint")
assert(not (request.index == api.NextIndex and request.observed ~= nil), "A placement was sent but is unconfirmed; reconcile it before exporting a checkpoint")
if api.VerifyServerCount then
    assert(api.VerifyServerCount().matches, "Server count mismatch; run diagnose before exporting a checkpoint")
end
local http = game:GetService("HttpService")
local plan = http:JSONDecode(inlineJson or readfile(dataPath or "SpaBarriers/spa-plan.json"))
assert(plan.meta and plan.meta.partCount == api.Count and #plan.parts == api.Count, "Keep the matching plan in the executor workspace")
local p = assert(plan.parts[request.index], "Invalid captured part index")
local scale = request.size.X / p[4]
assert(scale > 0 and scale < math.huge, "Invalid captured scale")
local transform = {request.origin:GetComponents()}
local checksum = 0
for _, part in ipairs(plan.parts) do for _, n in ipairs(part) do checksum = (checksum * 65599 + math.floor(n * 10000 + 0.5)) % 2147483647 end end
local saved = { requiredBase = {version=plan.meta.requiredBase.version, count=plan.meta.requiredBase.count, checksum=plan.meta.requiredBase.checksum}, expectedServerCount = api.ExpectedServerCount, format = "spa-checkpoint-v2", placeId = game.PlaceId, saveObjectLimit = api.Config.SaveObjectLimit, count = api.Count, nextIndex = api.NextIndex,
    checksum = string.format("%.0f", checksum), origin = transform, scale = scale,
    catalogName = request.baseCatalogName or request.name,
    applyAppearance = request.applyAppearance == true, catalogRoles = {}, nonCollidingPartIndices = {} }
for _, index in ipairs(plan.meta.nonCollidingPartIndices or {}) do saved.nonCollidingPartIndices[#saved.nonCollidingPartIndices + 1] = index end
for _, role in ipairs(plan.meta.catalogRoles or {}) do
    local indices = {}
    for _, index in ipairs(role.partIndices) do indices[#indices + 1] = index end
    saved.catalogRoles[#saved.catalogRoles + 1] = {name=role.name, appearance=role.appearance, partIndices=indices}
end
writefile(checkpointPath or "SpaBarriers/spa-barriers-jakarta-checkpoint.json", http:JSONEncode(saved))
api.Pause()
print(string.format("[Spa-Francorchamps checkpoint] Saved %d confirmed parts; resume at part %d. Save the partial build through the game's build-slot UI before rejoining.", saved.nextIndex - 1, saved.nextIndex))
return saved
