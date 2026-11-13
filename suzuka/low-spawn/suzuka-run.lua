-- Extract the package's Suzuka folder into your executor workspace first.
local folder = "SuzukaLow/"
local path = folder .. "suzuka-builder.lua"
local fn, err
if type(loadfile) == "function" then
    local ok, result, message = pcall(loadfile, path)
    if ok then fn, err = result, message else err = result end
elseif type(readfile) == "function" and type(loadstring) == "function" then
    local ok, source = pcall(readfile, path)
    if ok then fn, err = loadstring(source, "@" .. path) else err = source end
else
    error("Suzuka: this loader needs loadfile or readfile plus loadstring.")
end
assert(type(fn) == "function", "Suzuka: cannot load " .. path .. ". Copy the Suzuka folder into the executor workspace. " .. tostring(err))
return fn(folder .. "suzuka-plan.json")
