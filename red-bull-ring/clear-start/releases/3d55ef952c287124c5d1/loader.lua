-- Elevated Red Bull Ring circuit loader for Jakarta. Opens the builder panel; preview before building.
local mode,slot = ...
if mode == "autosave" then
    slot=tonumber(slot)
    assert(slot and slot>=1 and slot<=4 and slot%1==0,"Choose an autosave slot from 1 to 4")
end
local isSlot = type(mode) == "number" or type(mode) == "string" and mode:match("^[1-4]$")
if isSlot then mode = tonumber(mode); assert(mode and mode >= 1 and mode <= 4 and mode % 1 == 0, "Choose a save slot from 1 to 4") end
assert(isSlot or mode == nil or mode == "build" or mode == "resume" or mode == "checkpoint" or mode == "diagnose" or mode == "autosave" or mode == "recovery", "Red Bull Ring: expected build, resume, checkpoint, recovery, diagnose, autosave or a save slot from 1 to 4")
if mode == "recovery" then slot=tonumber(slot);assert(slot and slot>=1 and slot%1==0,"Choose the saved track-part count, excluding grass") end
local BASE = "https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/releases/3d55ef952c287124c5d1/"
local CHECKPOINT = "red-bull-ring-clear-start-jakarta-checkpoint.json"
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
if isSlot then return compile("red-bull-ring-save.lua")(mode) end
if mode == "recovery" then return compile("red-bull-ring-recovery.lua")(slot,download("runtime-plan.json"),CHECKPOINT) end
if mode == "diagnose" then return compile("red-bull-ring-diagnose.lua")() end
if mode == "checkpoint" then
    assert(_G.RedBullRingClearStartBuilder, "Red Bull Ring: keep the current builder loaded to save a checkpoint")
    return compile("red-bull-ring-checkpoint.lua")(nil, download("runtime-plan.json"), CHECKPOINT)
end
print("[Red Bull Ring] Loading the Jakarta circuit builder and track data from GitHub...")
local run = compile("red-bull-ring-builder.lua")
local plan = download("runtime-plan.json")
local api=run(nil, plan, mode == "resume" and "resume" or nil, CHECKPOINT)
if mode == "autosave" then api.EnableAutoSave(slot) end
return api
