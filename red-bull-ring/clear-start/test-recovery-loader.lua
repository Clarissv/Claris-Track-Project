
api=fresh();pauseAfterFirst=true;api.Build()
local oldApi=api
local beforeHttp,beforePlacement=#httpCalls,#calls
local recovered=loadHttpLoader("recovery",1)
assert(recovered.nextIndex==2 and recovered.expectedServerCount==2 and _G.RedBullRingClearStartBuilder==oldApi and #calls==beforePlacement and #httpCalls==beforeHttp+2,"Recovery mode must fetch only its helper and plan, preserving the original builder")
beforeHttp=#httpCalls
assert(not pcall(loadHttpLoader,"recovery") and not pcall(loadHttpLoader,"recovery",0) and not pcall(loadHttpLoader,"recovery",1.5) and #httpCalls==beforeHttp,"Bad recovery arguments must fail before download")
api=fresh();_G.RedBullRingSlotSave=nil;_G.RedBullRingSaveClock=nil
print("PASS: recovery loadstring preserves the original builder and validates its saved-prefix argument")
