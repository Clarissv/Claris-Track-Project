-- Read cached Jakarta slot data; no save/load requests or build changes.
assert(game.PlaceId == 14005966837, "Join Jakarta before inspecting its build slots")
local storage = game:GetService("ReplicatedStorage")
local services = assert(storage:FindFirstChild("Services"), "Services is missing")
local module = assert(services:FindFirstChild("DataReplication"), "DataReplication is missing")
local data = require(module)
assert(type(data.GetBuildSlotData) == "function", "Wait until player data has loaded")
local slots = data:GetBuildSlotData()
assert(type(slots) == "table" and type(slots.Jakarta) == "table", "Jakarta slot data is not available")
local http = game:GetService("HttpService")
local report = {
    format = "monza-slot-inspection-v1",
    note = "Cached replicated data only. JSON byte counts are not the server's stored payload size or proof of persistence.",
    slots = {}
}
local function fieldShape(value)
    local result = {type = typeof(value)}
    if type(value) == "string" then result.stringBytes = #value end
    if type(value) == "table" then
        local count, sample = 0, {}
        for key, item in pairs(value) do
            count = count + 1
            if #sample < 6 then
                sample[#sample + 1] = {key = tostring(key):sub(1,80), type = typeof(item), stringBytes = type(item) == "string" and #item or nil}
            end
            if count >= 100000 then result.countTruncated = true; break end
        end
        result.entries, result.sample = count, sample
    end
    return result
end
for index = 1, 4 do
    local name = "Slot" .. index
    local slot = slots.Jakarta[name]
    local result = {slot = name, type = typeof(slot), fields = {}}
    if type(slot) == "table" then
        -- Only these known UI fields are copied. Other values are summarized.
        if type(slot.BuildAmount) == "number" then result.buildAmount = slot.BuildAmount end
        if type(slot.Date) == "string" then result.date = slot.Date end
        local count = 0
        for key, value in pairs(slot) do
            count = count + 1
            if count > 24 then result.fieldsTruncated = true; break end
            local shape = fieldShape(value)
            shape.field = tostring(key):sub(1,80)
            result.fields[#result.fields + 1] = shape
        end
        local ok, encoded = pcall(function() return http:JSONEncode(slot) end)
        if ok then result.replicatedJsonBytes = #encoded else result.replicatedJsonEncodingFailed = true end
    end
    report.slots[#report.slots + 1] = result
end
local observer = _G.MonzaSaveDebug
if observer and observer.Report then observer.Report.slotInspection = report end
local json = http:JSONEncode(report)
if type(writefile) == "function" then pcall(writefile, "monza-slot-inspection.json", json) end
if type(setclipboard) == "function" then pcall(setclipboard, json) end
print("[Monza Save Debug] SLOT INSPECTION " .. json)
return report
