local function recoveryHelper(...)
    -- RECOVERY_HELPER_SOURCE
end
api=fresh()
saveCalls={}
api.Config.Origin=cf(100,25,200)
api.Config.Scale=2
reject=true
assert(not pcall(api.Build) and api.State=="unconfirmed","Recovery fixture needs an unresolved old placement")
local beforeCalls,beforeIndex,beforeState=#calls,api.NextIndex,api.State
placedCountOverride=function() return 4 end
local recovered=recoveryHelper(1,"fixture-json")
assert(recovered.nextIndex==2 and recovered.expectedServerCount==2 and recovered.origin[1]==100 and recovered.origin[2]==25 and recovered.origin[3]==200 and recovered.scale==2,"Recovery must capture the original frozen transform and explicit saved prefix")
assert(#calls==beforeCalls and api.NextIndex==beforeIndex and api.State==beforeState,"Export must neither reconcile uncertain placements nor change game parts")
local exported=checkpointDocument
for _,bad in ipairs({0,2,1.5,"invalid"}) do assert(not pcall(recoveryHelper,bad,"fixture-json") and checkpointDocument==exported,"Bad recovery counts must not overwrite the checkpoint") end

api=loadBuilder("RedBullRingClearStartCompact/red-bull-ring-plan.json",nil,"resume")
reject=false
local wrongCountCalls=#calls
assert(not pcall(api.Build) and #calls==wrongCountCalls,"A recovery checkpoint must reject an incorrect loaded count before placement")
placedCountOverride=nil
local grass=child(builds,"Part","ExistingGrass")
local first=child(builds,"Part","Block")
local firstTarget=api.GetTarget(1)
first.CFrame,first.Size,first.Color,first.Material,first.MaterialVariant=firstTarget.cf,firstTarget.size,firstTarget.color,firstTarget.material,firstTarget.materialVariant
first.Anchored,first.CanCollide=true,true
api.EnableAutoSave(2,{every=1,fineFrom=2,fineEvery=1})
reply="Your buildings were successfully saved"
local expectedNext=api.GetTarget(2)
api.Build()
assert(api.State=="complete" and #calls==wrongCountCalls+1 and #builds:GetChildren()==3,"Direct recovery must place only the suffix, without scanning or rebuilding the saved prefix")
assert((calls[#calls][2].Position-expectedNext.cf.Position).Magnitude<.000001 and api.ReusedCount==0 and api.SentCount==1,"The next part must retain the captured position without Repair")
assert(api.AutoSave.lastSuccess.objectCount==3,"Autosave must continue above the verified loaded total count")
assert(api.AutoSave.lastSuccess.firstAddedIndex==2,"Recovery save diagnostics must exclude the already loaded prefix")

api=fresh()
pauseAfterFirst=true;api.Build()
recoveryHelper(1,"fixture-json")
local savedCount=checkpointDocument.expectedServerCount
checkpointDocument.expectedServerCount=3
assert(not pcall(loadBuilder,"RedBullRingClearStartCompact/red-bull-ring-plan.json",nil,"resume") and _G.RedBullRingClearStartCompactBuilder==api,"Invalid recovery metadata must not replace the current builder")
checkpointDocument.expectedServerCount=savedCount
api=fresh();_G.RedBullRingSlotSave=nil;_G.RedBullRingSaveClock=nil
print("PASS: recovery export from an unconfirmed/glitched build, original transform, exact loaded-count guard, direct suffix placement and autosave")
