-- Export progress before leaving a suspended build. Does not place/delete/save game objects.
local dataPath, inlineJson, checkpointPath = ...
local api = assert(_G.SpaBuilder, "Keep the existing Spa-Francorchamps builder loaded")
assert(api.State ~= "building", "Pause and wait for the build to stop before exporting a checkpoint")
assert(game.PlaceId == 14005966837 and api.PlaceId == game.PlaceId, "Spa-Francorchamps: export this checkpoint from the Jakarta builder")
local request = assert(api.RequestDiagnostics(), "No captured placement transform")
assert(type(writefile) == "function", "The executor needs writefile to export the checkpoint")
assert(not (request.index == api.NextIndex and request.observed ~= nil), "A placement was sent but is unconfirmed; reconcile it before exporting a checkpoint")
if api.VerifyServerCount then
    assert(api.VerifyServerCount().matches, "Server count mismatch; run diagnose before exporting a checkpoint")
end
local http = game:GetService("HttpService")
local plan = http:JSONDecode(inlineJson or readfile(dataPath or "Spa/spa-plan.json"))
assert(plan.meta and plan.meta.partCount == api.Count and #plan.parts == api.Count, "Keep the matching plan in the executor workspace")
local p = assert(plan.parts[request.index], "Invalid captured part index")
local scale = request.size.X / p[4]
assert(scale > 0 and scale < math.huge, "Invalid captured scale")
local relative = CFrame.fromMatrix(Vector3.new(p[1],p[2],p[3]) * scale, Vector3.new(p[8],p[9],p[10]), Vector3.new(p[11],p[12],p[13]))
-- Solve the complete matrix rather than assuming the rounded plan axes are
-- exactly orthonormal; otherwise the recovered origin can drift in a large map.
local a, b = {relative:GetComponents()}, {request.cf:GetComponents()}
local m = {a[4],a[5],a[6],a[7],a[8],a[9],a[10],a[11],a[12]}
local det = m[1]*(m[5]*m[9]-m[6]*m[8])-m[2]*(m[4]*m[9]-m[6]*m[7])+m[3]*(m[4]*m[8]-m[5]*m[7])
assert(math.abs(det)>0.5, "Invalid captured rotation")
local inv = {m[5]*m[9]-m[6]*m[8],m[3]*m[8]-m[2]*m[9],m[2]*m[6]-m[3]*m[5],
    m[6]*m[7]-m[4]*m[9],m[1]*m[9]-m[3]*m[7],m[3]*m[4]-m[1]*m[6],
    m[4]*m[8]-m[5]*m[7],m[2]*m[7]-m[1]*m[8],m[1]*m[5]-m[2]*m[4]}
local transform = {b[1],b[2],b[3]}
for row=1,3 do for col=1,3 do
    local value=0
    for k=1,3 do value=value+b[3+(row-1)*3+k]*inv[(k-1)*3+col]/det end
    transform[3+(row-1)*3+col]=value
end end
for row=1,3 do for k=1,3 do transform[row]=transform[row]-transform[3+(row-1)*3+k]*a[k] end end
local checksum = 0
for _, part in ipairs(plan.parts) do for _, n in ipairs(part) do checksum = (checksum * 65599 + math.floor(n * 10000 + 0.5)) % 2147483647 end end
local saved = { format = "spa-checkpoint-v2", placeId = game.PlaceId, saveObjectLimit = api.Config.SaveObjectLimit, count = api.Count, nextIndex = api.NextIndex,
    checksum = string.format("%.0f", checksum), origin = transform, scale = scale,
    catalogName = request.baseCatalogName or request.name,
    applyAppearance = request.applyAppearance == true, catalogRoles = {}, nonCollidingPartIndices = {} }
for _, index in ipairs(plan.meta.nonCollidingPartIndices or {}) do saved.nonCollidingPartIndices[#saved.nonCollidingPartIndices + 1] = index end
for _, role in ipairs(plan.meta.catalogRoles or {}) do
    local indices = {}
    for _, index in ipairs(role.partIndices) do indices[#indices + 1] = index end
    saved.catalogRoles[#saved.catalogRoles + 1] = {name=role.name, appearance=role.appearance, partIndices=indices}
end
writefile(checkpointPath or "Spa/spa-clear-start-compact-jakarta-checkpoint.json", http:JSONEncode(saved))
api.Pause()
print(string.format("[Spa-Francorchamps checkpoint] Saved %d confirmed parts; resume at part %d. Save the partial build through the game's build-slot UI before rejoining.", saved.nextIndex - 1, saved.nextIndex))
return saved
