-- Extract the package's SepangFlat folder into your executor workspace first.
local folder = "SepangFlat/"
local path = folder .. "sepang-builder.lua"
local fn, err
if type(loadfile) == "function" then
    local ok, result, message = pcall(loadfile, path)
    if ok then fn, err = result, message else err = result end
elseif type(readfile) == "function" and type(loadstring) == "function" then
    local ok, source = pcall(readfile, path)
    if ok then fn, err = loadstring(source, "@" .. path) else err = source end
else
    error("Sepang: this loader needs loadfile or readfile plus loadstring.")
end
assert(type(fn) == "function", "Sepang: cannot load " .. path .. ". Copy the SepangFlat folder into the executor workspace. " .. tostring(err))
return fn(folder .. "sepang-plan.json")
