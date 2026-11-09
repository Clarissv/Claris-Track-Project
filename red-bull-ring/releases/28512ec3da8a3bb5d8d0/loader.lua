-- Elevated Red Bull Ring circuit loader for Jakarta. Opens the builder panel; preview before building.
local mode = ...
assert(mode == nil or mode == "build" or mode == "resume" or mode == "checkpoint" or mode == "diagnose", "Red Bull Ring: expected build, resume, checkpoint or diagnose")
local BASE = "https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/releases/28512ec3da8a3bb5d8d0/"
local CHECKPOINT = "red-bull-ring-jakarta-checkpoint.json"
local function download(name)
    local url = BASE .. name
    local done, ok, body = false, false, nil
    task.spawn(function()
        ok, body = pcall(function() return game:HttpGet(url) end)
        done = true
    end)
    local deadline = os.clock() + 60
    while not done and os.clock() < deadline do task.wait(0.05) end
    assert(done, "Red Bull Ring: download timed out: " .. name)
    assert(ok and type(body) == "string" and #body > 0, "Red Bull Ring: cannot download " .. name .. ": " .. tostring(body))
    return body
end
local function compile(name)
    local fn, err = loadstring(download(name), "@" .. BASE .. name)
    assert(type(fn) == "function", "Red Bull Ring: cannot compile " .. name .. ": " .. tostring(err))
    return fn
end
if mode == "diagnose" then return compile("red-bull-ring-diagnose.lua")() end
if mode == "checkpoint" then
    assert(_G.RedBullRingBuilder, "Red Bull Ring: keep the current builder loaded to save a checkpoint")
    return compile("red-bull-ring-checkpoint.lua")(nil, download("runtime-plan.json"), CHECKPOINT)
end
print("[Red Bull Ring] Loading the Jakarta circuit builder and track data from GitHub...")
local run = compile("red-bull-ring-builder.lua")
local plan = download("runtime-plan.json")
return run(nil, plan, mode == "resume" and "resume" or nil, CHECKPOINT)
