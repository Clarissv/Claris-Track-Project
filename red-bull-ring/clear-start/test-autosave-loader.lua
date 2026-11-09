
api=fresh()
local beforeHttp=#httpCalls
assert(not pcall(loadHttpLoader,"autosave") and not pcall(loadHttpLoader,"autosave",5) and #httpCalls==beforeHttp,"Autosave requires a valid explicit slot before download")
api=loadHttpLoader("autosave",3)
assert(api==_G.RedBullRingClearStartBuilder and api.AutoSave.slot==3 and api.AutoSave.every==500 and api.AutoSave.fineFrom==8500 and api.AutoSave.fineEvery==100 and #calls==0,"Autosave mode must arm the requested slot without building")
local beforeSaves=#saveCalls
reply="Your buildings were successfully saved"
api.Build()
assert(api.State=="complete" and #saveCalls==beforeSaves+1 and saveCalls[#saveCalls][2]==3,"Autosave mode must save the completed small build to the selected slot")
print("PASS: explicit autosave loadstring, slot validation, defaults and final automatic save")
