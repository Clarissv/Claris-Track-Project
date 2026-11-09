local fn, err = loadfile("RedBullRing/red-bull-ring-builder.lua")
assert(fn, err)
return fn("RedBullRing/red-bull-ring-plan.json", nil, "resume")
