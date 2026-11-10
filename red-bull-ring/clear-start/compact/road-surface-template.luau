local roadMeasurements = {confirmed=0,maxPositionErrorStuds=0,maxTopErrorStuds=0,maxCornerErrorStuds=0}
local function roadSurfaceError(object, request)
    local role = PART_ROLE[request.index]
    if not role or CATALOG_ROLES[role].name ~= "Others75" then return nil end
    local right, up = request.cf.RightVector, request.cf.UpVector
    local back = Vector3.new(right.Y*up.Z-right.Z*up.Y, right.Z*up.X-right.X*up.Z, right.X*up.Y-right.Y*up.X)
    local actualUp = object.CFrame.UpVector
    local actualTop = object.Position + actualUp * (object.Size.Y / 2)
    local maximum, cornerMaximum = 0, 0
    local actualRight = object.CFrame.RightVector
    local actualBack = Vector3.new(actualRight.Y*actualUp.Z-actualRight.Z*actualUp.Y, actualRight.Z*actualUp.X-actualRight.X*actualUp.Z, actualRight.X*actualUp.Y-actualRight.Y*actualUp.X)
    -- Compare the two top planes at all four requested corners. This catches
    -- pitch and banking errors that a position-only replication check misses.
    for _, side in ipairs({-1,1}) do for _, along in ipairs({-1,1}) do
        local corner = request.cf.Position + up * (request.size.Y/2) + right * (side*request.size.X/2) + back * (along*request.size.Z/2)
        maximum = math.max(maximum, math.abs((corner-actualTop):Dot(actualUp)/actualUp.Y))
        local actualCorner = actualTop + actualRight * (side*object.Size.X/2) + actualBack * (along*object.Size.Z/2)
        cornerMaximum = math.max(cornerMaximum, (actualCorner-corner).Magnitude)
    end end
    return maximum, cornerMaximum
end
local function roadSurfaceMatches(object,request,positionError,sizeError)
    local topError,cornerError=roadSurfaceError(object,request)
    if not topError then return true end
    local scale=math.max(1,request.scale)
    if positionError>.01*scale or sizeError>.01*scale then return false,"road position/size exceeds the surface tolerance" end
    if topError>.008*scale then return false,string.format("road top differs by %.5f studs",topError) end
    if cornerError>.03*scale then return false,string.format("road corners differ by %.5f studs",cornerError) end
    return true
end
function api.SurfaceReport()
    return {confirmed=roadMeasurements.confirmed,maxPositionErrorStuds=roadMeasurements.maxPositionErrorStuds,
        maxTopErrorStuds=roadMeasurements.maxTopErrorStuds,maxCornerErrorStuds=roadMeasurements.maxCornerErrorStuds,worstIndex=roadMeasurements.worstIndex}
end
