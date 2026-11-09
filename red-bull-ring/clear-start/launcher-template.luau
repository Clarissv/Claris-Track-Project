-- Extract the package's RedBullRingClearStart folder into your executor workspace first.
local folder = "RedBullRingClearStart/"
local path = folder .. "red-bull-ring-builder.lua"
local fn, err
if type(loadfile) == "function" then
    local ok, result, message = pcall(loadfile, path)
    if ok then fn, err = result, message else err = result end
elseif type(readfile) == "function" and type(loadstring) == "function" then
    local ok, source = pcall(readfile, path)
    if ok then fn, err = loadstring(source, "@" .. path) else err = source end
else
    error("Red Bull Ring: this loader needs loadfile or readfile plus loadstring.")
end
assert(type(fn) == "function", "Red Bull Ring: cannot load " .. path .. ". Copy the RedBullRingClearStart folder into the executor workspace. " .. tostring(err))
return fn(folder .. "red-bull-ring-plan.json")
