local roadMeasurements = {confirmed=0,maxPositionErrorStuds=0,maxTopErrorStuds=0}
local function roadSurfaceError(object, request)
    local role = PART_ROLE[request.index]
    if not role or CATALOG_ROLES[role].name ~= "Others75" then return nil end
    local right, up = request.cf.RightVector, request.cf.UpVector
    local back = Vector3.new(right.Y*up.Z-right.Z*up.Y, right.Z*up.X-right.X*up.Z, right.X*up.Y-right.Y*up.X)
    local actualUp = object.CFrame.UpVector
    local actualTop = object.Position + actualUp * (object.Size.Y / 2)
    local maximum = 0
    -- Compare the two top planes at all four requested corners. This catches
    -- pitch and banking errors that a position-only replication check misses.
    for _, side in ipairs({-1,1}) do for _, along in ipairs({-1,1}) do
        local corner = request.cf.Position + up * (request.size.Y/2) + right * (side*request.size.X/2) + back * (along*request.size.Z/2)
        maximum = math.max(maximum, math.abs((corner-actualTop):Dot(actualUp)/actualUp.Y))
    end end
    return maximum
end
function api.SurfaceReport()
    return {confirmed=roadMeasurements.confirmed,maxPositionErrorStuds=roadMeasurements.maxPositionErrorStuds,
        maxTopErrorStuds=roadMeasurements.maxTopErrorStuds,worstIndex=roadMeasurements.worstIndex}
end
