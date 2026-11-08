-- Read-only diagnostic for the current or older Sepang builder. No placements.
local api = assert(_G.SepangBuilder, "Load the Sepang builder first; keep the failed session open.")
local player = game:GetService("Players").LocalPlayer
local folder = assert(workspace:FindFirstChild("EditableBuilds"), "EditableBuilds is missing")
local lines = {}
local function line(text) lines[#lines + 1] = text; print("[Sepang diagnostic] " .. text) end
local function vector(v) return string.format("(%.3f, %.3f, %.3f)", v.X, v.Y, v.Z) end
local request = api.RequestDiagnostics and api.RequestDiagnostics()
line("State=" .. tostring(api.State) .. "; next part=" .. tostring(api.NextIndex) .. "; streaming=" .. tostring(workspace.StreamingEnabled))
if api.Phase then line("Stage=" .. tostring(api.Phase)) end
line("Loaded EditableBuilds children=" .. #folder:GetChildren())
if not request then
    if api.NextIndex > api.Count then line("No remaining track part"); return table.concat(lines, "\n") end
    request = api.GetTarget(api.NextIndex)
end
line("Expected name=" .. tostring(request.name) .. "; position=" .. vector(request.cf.Position) .. "; size=" .. vector(request.size))
if request.observed then line("New children during request=" .. #request.observed) end
if request.streamError then line("Stream request error=" .. request.streamError) end
if request.streamSkipped then line("Manual streaming skipped: " .. request.streamSkipped) end
if request.streamWaiting then line("Manual streaming call is pending") end
if request.characterDistance then line(string.format("Character distance during placement=%.1f studs", request.characterDistance)) end
local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
if root then line(string.format("Character distance from target=%.1f studs", (root.Position - request.cf.Position).Magnitude)) end
local nearest, added = {}, {}
local function consider(object, source)
    if added[object] or not object:IsA("BasePart") then return end
    added[object] = true
    local item = {object = object, distance = (object.Position - request.cf.Position).Magnitude, source = source}
    local at = #nearest + 1
    for i, other in ipairs(nearest) do if item.distance < other.distance then at = i; break end end
    table.insert(nearest, at, item)
    if #nearest > 3 then table.remove(nearest) end
end
for _, object in ipairs(folder:GetChildren()) do
    consider(object, "direct child")
    if not object:IsA("BasePart") then for _, nested in ipairs(object:GetDescendants()) do consider(nested, "inside " .. object.ClassName .. " " .. object.Name) end end
end
if #nearest == 0 then line("No replicated build Parts visible on this client.") end
for i, item in ipairs(nearest) do
    local object = item.object
    line(string.format("Nearby %d: %s %s; %s; distance=%.2f; size=%s", i, object.ClassName, object.Name, item.source, item.distance, vector(object.Size)))
    line("  Anchored=" .. tostring(object.Anchored) .. "; CanCollide=" .. tostring(object.CanCollide) .. "; material=" .. tostring(object.Material))
    local actual, expected = object.Color, request.color
    if expected then line(string.format("  color difference=%.3f; size difference=%.3f; right dot=%.5f; up dot=%.5f",
        Vector3.new(actual.R-expected.R, actual.G-expected.G, actual.B-expected.B).Magnitude,
        (object.Size-request.size).Magnitude, object.CFrame.RightVector:Dot(request.cf.RightVector), object.CFrame.UpVector:Dot(request.cf.UpVector))) end
end
line("Nearby Parts are observations, not proof of placement ownership. This report sent no placement requests.")
api.LastDiagnostic = table.concat(lines, "\n")
return api.LastDiagnostic
