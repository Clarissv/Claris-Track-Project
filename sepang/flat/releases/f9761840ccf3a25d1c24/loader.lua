-- Flat Sepang circuit loader. This opens the builder panel; preview before building.
local mode = ...
assert(mode == nil or mode == "build" or mode == "resume" or mode == "checkpoint" or mode == "diagnose", "Sepang: expected build, resume, checkpoint or diagnose")
local BASE = "https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/sepang/flat/releases/f9761840ccf3a25d1c24/"
local CHECKPOINT = "sepang-flat-checkpoint.json"
local function download(name)
    local url = BASE .. name
    local done, ok, body = false, false, nil
    task.spawn(function()
        ok, body = pcall(function() return game:HttpGet(url) end)
        done = true
    end)
    local deadline = os.clock() + 60
    while not done and os.clock() < deadline do task.wait(0.05) end
    assert(done, "Sepang: download timed out: " .. name)
    assert(ok and type(body) == "string" and #body > 0, "Sepang: cannot download " .. name .. ": " .. tostring(body))
    return body
end
local function compile(name)
    local fn, err = loadstring(download(name), "@" .. BASE .. name)
    assert(type(fn) == "function", "Sepang: cannot compile " .. name .. ": " .. tostring(err))
    return fn
end
if mode == "diagnose" then return compile("sepang-diagnose.lua")() end
if mode == "checkpoint" then
    assert(_G.SepangFlatBuilder, "Sepang: keep the current builder loaded to save a checkpoint")
    return compile("sepang-checkpoint.lua")(nil, download("runtime-plan.json"), CHECKPOINT)
end
print("[Sepang] Loading the flat circuit builder and track data from GitHub...")
local run = compile("sepang-builder.lua")
local plan = download("runtime-plan.json")
return run(nil, plan, mode == "resume" and "resume" or nil, CHECKPOINT)
