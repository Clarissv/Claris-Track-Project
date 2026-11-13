-- Use only in a fresh Jakarta server containing just the original grass plate.
-- Extract the updated executor package first. This opens the panel without building.
assert(type(readfile) == "function", "Extract the Suzuka package into the executor workspace first")
local chunk, reason = loadstring(readfile("Suzuka/suzuka-builder.lua"))
assert(chunk, "Suzuka builder could not compile: " .. tostring(reason))
local api = chunk("Suzuka/suzuka-plan.json")
api.UseModeratorCount(1)
return api
