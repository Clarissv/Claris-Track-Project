-- Capture the original transform for a user-selected saved prefix.
-- This writes a local resume checkpoint; it does not save or change game parts.
local confirmed,inlineJson,checkpointPath = ...
confirmed=tonumber(confirmed)
local api=assert(_G.RedBullRingClearStartCompactBuilder,"Keep the original builder loaded until its recovery checkpoint is exported")
assert(game.PlaceId==14005966837 and api.PlaceId==game.PlaceId,"Export this recovery checkpoint from the original Jakarta builder")
assert(api.State~="building" and not (_G.RedBullRingSlotSave and _G.RedBullRingSlotSave.busy),"Pause the builder and wait for the current save before exporting recovery")
assert(confirmed and confirmed>=1 and confirmed<api.Count and confirmed%1==0,"Choose the number of track parts in the saved prefix, excluding grass")
assert(type(writefile)=="function","The executor needs writefile to preserve the build position across rejoining")
local request=assert(api.RequestDiagnostics(),"The original placement transform is missing")
assert(typeof(request.origin)=="CFrame" and type(request.scale)=="number" and request.scale>0 and request.scale<math.huge,"The original build transform could not be verified")
assert(type(request.baseCatalogName)=="string" and type(request.applyAppearance)=="boolean","The original catalog and appearance settings are missing")
local http=game:GetService("HttpService")
local plan=http:JSONDecode(inlineJson or readfile("RedBullRingClearStartCompact/red-bull-ring-plan.json"))
assert(plan.meta and plan.meta.partCount==api.Count and #plan.parts==api.Count,"Keep the matching clear-start plan for recovery")
local transform={request.origin:GetComponents()}
for _,n in ipairs(transform) do assert(type(n)=="number" and n==n and math.abs(n)<math.huge,"Invalid original transform") end
local checksum=0
for _,part in ipairs(plan.parts) do for _,n in ipairs(part) do checksum=(checksum*65599+math.floor(n*10000+.5))%2147483647 end end
local saved={format="red-bull-ring-checkpoint-v2",placeId=game.PlaceId,count=api.Count,nextIndex=confirmed+1,
    expectedServerCount=confirmed+1,checksum=string.format("%.0f",checksum),origin=transform,scale=request.scale,
    catalogName=request.baseCatalogName,applyAppearance=request.applyAppearance,saveObjectLimit=api.Config.SaveObjectLimit,
    catalogRoles={},nonCollidingPartIndices={}}
for _,index in ipairs(plan.meta.nonCollidingPartIndices or {}) do saved.nonCollidingPartIndices[#saved.nonCollidingPartIndices+1]=index end
for _,role in ipairs(plan.meta.catalogRoles or {}) do
    local indices={}
    for _,index in ipairs(role.partIndices) do indices[#indices+1]=index end
    saved.catalogRoles[#saved.catalogRoles+1]={name=role.name,appearance=role.appearance,partIndices=indices}
end
-- The supplied prefix refers to an earlier slot, not the current glitched build.
-- Never infer it from the current NextIndex or mark a pending placement confirmed.
writefile(checkpointPath or "red-bull-ring-clear-start-compact-jakarta-checkpoint.json",http:JSONEncode(saved))
print(string.format("[Red Bull Ring recovery] Original position saved locally. After rejoining, load the slot with %d track parts + one grass plate (%d objects), then use resume. Next track part: %d. No game parts were changed.",confirmed,confirmed+1,confirmed+1))
return saved
