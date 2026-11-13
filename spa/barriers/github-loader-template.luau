-- Elevated Spa-Francorchamps circuit loader for Jakarta. Opens the builder panel; preview before building.
local mode,slot = ...
if mode == "autosave" then
    slot=tonumber(slot)
    assert(slot and slot>=1 and slot<=4 and slot%1==0,"Choose an autosave slot from 1 to 4")
end
local isSlot = type(mode) == "number" or type(mode) == "string" and mode:match("^[1-4]$")
if isSlot then mode = tonumber(mode); assert(mode and mode >= 1 and mode <= 4 and mode % 1 == 0, "Choose a save slot from 1 to 4") end
assert(isSlot or mode == nil or mode == "build" or mode == "resume" or mode == "checkpoint" or mode == "diagnose" or mode == "autosave" or mode == "continue", "Spa-Francorchamps: expected build, resume, checkpoint, continue, diagnose, autosave or a save slot from 1 to 4")
local BASE = "__RELEASE_BASE__"
local CHECKPOINT = "spa-barriers-jakarta-checkpoint.json"
local function download(name)
    local url = BASE .. name
    local done, ok, body = false, false, nil
    task.spawn(function()
        ok, body = pcall(function() return game:HttpGet(url) end)
        done = true
    end)
    local deadline = os.clock() + 60
    while not done and os.clock() < deadline do task.wait(0.05) end
    assert(done, "Spa-Francorchamps: download timed out: " .. name)
    assert(ok and type(body) == "string" and #body > 0, "Spa-Francorchamps: cannot download " .. name .. ": " .. tostring(body))
    return body
end
local function compile(name)
    local fn, err = loadstring(download(name), "@" .. BASE .. name)
    assert(type(fn) == "function", "Spa-Francorchamps: cannot compile " .. name .. ": " .. tostring(err))
    return fn
end
if isSlot then return compile("spa-save.lua")(mode) end
if mode == "continue" then return compile("spa-continue.lua")() end
if mode == "diagnose" then return compile("spa-diagnose.lua")() end
if mode == "checkpoint" then
    assert(_G.SpaBarriersBuilder, "Spa-Francorchamps: keep the current builder loaded to save a checkpoint")
    return compile("spa-checkpoint.lua")(nil, download("runtime-plan.json"), CHECKPOINT)
end
if _G.SpaBarriersBuilder and mode ~= "resume" then
    local api = _G.SpaBarriersBuilder
    api.Show()
    if mode == "autosave" then api.EnableAutoSave(slot) end
    return api
end
print("[Spa-Francorchamps] Loading full-circuit barriers for the completed compact road...")
local run = compile("spa-builder.lua")
local plan = download("runtime-plan.json")
local api=run(nil, plan, mode == "resume" and "resume" or nil, CHECKPOINT)
if mode == "autosave" then api.EnableAutoSave(slot) end
return api
