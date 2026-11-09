
-- Numeric save mode fetches only the helper and leaves the loaded builder alone.
api=fresh();api.Build()
saveCalls={}
reply="Failed to save";notifyUI=false;fireError=false
local existingApi=_G.RedBullRingClearStartBuilder
for slot=1,4 do
    local beforeHttp,beforePlacement,beforeSaves=#httpCalls,#calls,#saveCalls
    local result=loadHttpLoader(slot)
    assert(result.slot==slot and result.status=="failed" and #saveCalls==beforeSaves+1,"Numeric save mode must choose the requested slot and keep the failure reply")
    assert(#httpCalls==beforeHttp+1 and #calls==beforePlacement and _G.RedBullRingClearStartBuilder==existingApi,"Save mode must fetch only its helper and preserve the existing builder")
end
local beforeHttp=#httpCalls
assert(not pcall(loadHttpLoader,0) and not pcall(loadHttpLoader,5) and not pcall(loadHttpLoader,1.5) and #httpCalls==beforeHttp,"Invalid slot numbers must fail before download")
local beforePlacement=#calls
local direct=api.Save(4)
assert(direct.slot==4 and direct.status=="failed" and #calls==beforePlacement,"The builder Save method must use the same slot helper")
_G.RedBullRingClearStartBuilder=nil
local afterRejoin=loadHttpLoader(1)
assert(afterRejoin.status=="failed" and _G.RedBullRingClearStartBuilder==nil,"Saving a loaded circuit must work without recreating the builder")
_G.RedBullRingClearStartBuilder=existingApi
print("PASS: numeric loadstring slots 1-4, helper-only download, invalid slots, direct Save method and post-rejoin save")
