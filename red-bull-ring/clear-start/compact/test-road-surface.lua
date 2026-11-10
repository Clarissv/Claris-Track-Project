api = withRoadRole()
api.Build()
local measured = api.SurfaceReport()
assert(measured.confirmed == 1 and measured.maxTopErrorStuds < .000001, "Confirm and measure the live sloped road top")
measured.confirmed = 999
assert(api.SurfaceReport().confirmed == 1, "SurfaceReport must not expose mutable builder counters")

api = withRoadRole()
placementOverride = function(o) o.CFrame = cf(o.Position + vector(0,.003,0)) * CFrame.fromMatrix(vector(), o.CFrame.RightVector, o.CFrame.UpVector) end
api.Build()
assert(api.State == "complete" and math.abs(api.SurfaceReport().maxTopErrorStuds-.003) < .000001, "Accept and report small replication rounding")

api = withRoadRole()
placementOverride = function(o) o.CFrame = cf(o.Position + vector(0,.02,0)) * CFrame.fromMatrix(vector(), o.CFrame.RightVector, o.CFrame.UpVector) end
assert(not pcall(api.Build) and #calls == 1 and api.NextIndex == 1, "A road lip inside the old .25-stud tolerance must stop confirmation")
assert(not pcall(api.Build) and #calls == 1, "Do not resend a road with uncertain geometry")

api = withRoadRole()
placementOverride = function(o)
    local up = o.CFrame.UpVector
    o.CFrame = CFrame.fromMatrix(o.Position,o.CFrame.RightVector,vector(up.X,up.Y,up.Z+.0001).Unit)
end
api.Build()
assert(api.State=="complete" and #calls==2 and api.SurfaceReport().maxTopErrorStuds<.008,"Small replicated rotation errors must pass when the actual surface/corners remain close")

api = withRoadRole()
fixtureDocument.parts[1][6]=512
placementOverride = function(o)
    local up=o.CFrame.UpVector
    o.CFrame=CFrame.fromMatrix(o.Position,o.CFrame.RightVector,vector(up.X,up.Y,up.Z+.0001).Unit)
end
assert(not pcall(api.Build) and #calls==1 and api.NextIndex==1,"The same angle on a long slab must fail when it produces a material top-plane error")
fixtureDocument.parts[1][6]=6

api = withRoadRole()
fixtureDocument.parts[1][6]=100
placementOverride=function(o) o.CFrame=o.CFrame*CFrame.Angles(0,.001,0) end
assert(not pcall(api.Build) and #calls==1 and api.NextIndex==1,"A yaw change with acceptable height must still fail if the footprint moves too far")
fixtureDocument.parts[1][6]=6
api = fresh()
