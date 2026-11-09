-- Read-only Jakarta save observer. Save manually through the game's own UI.
assert(game.PlaceId == 14005966837, "Join Jakarta before observing its build saves")
local storage = game:GetService("ReplicatedStorage")
local player = game:GetService("Players").LocalPlayer
local http = game:GetService("HttpService")
local folder = assert(workspace:FindFirstChild("EditableBuilds"), "Enable build tools first")
local network = assert(storage:FindFirstChild("NetworkContainer"), "NetworkContainer is missing")
local events = assert(network:FindFirstChild("RemoteEvents"), "RemoteEvents is missing")
local functions = assert(network:FindFirstChild("RemoteFunctions"), "RemoteFunctions is missing")
local saver = assert(functions:FindFirstChild("BuildSaver"), "BuildSaver count endpoint is missing")
local previous = _G.MonzaSaveDebug
if previous and previous.Stop then previous.Stop() end
local started, connections, hooked = os.clock(), {}, {}
local debug = {Report={format="monza-save-observation-v1",placeId=game.PlaceId,events={},snapshots={}}}
_G.MonzaSaveDebug = debug
local prefix = "[Monza Save Debug] "
local stopped, querying, saveStarted = false, false, nil
local function relevant(text)
    if type(text) ~= "string" then return false end
    local lower = string.lower(text)
    return lower:find("sav",1,true) or lower:find("datastore",1,true) or lower:find("serializ",1,true)
end
local function clean(value,depth)
    local kind = typeof(value)
    if kind == "string" then return value:sub(1,1200) end
    if kind == "number" then return value == value and math.abs(value)<math.huge and value or "non-finite number" end
    if kind == "boolean" or kind == "nil" then return value end
    if kind == "table" and depth < 2 then
        local result,count = {},0
        for key,item in pairs(value) do
            count=count+1;if count>20 then result._truncated=true;break end
            result[tostring(key)] = clean(item,depth+1)
        end
        return result
    end
    return "<" .. tostring(kind) .. ">"
end
local function record(kind,data)
    if stopped then return end
    local item = {seconds=math.floor((os.clock()-started)*1000)/1000,kind=kind,data=data}
    local list = debug.Report.events
    if #list >= 100 then table.remove(list,1) end
    list[#list+1] = item
    print(prefix .. kind .. " @" .. item.seconds .. "s " .. http:JSONEncode(data))
end
local function slots()
    local result = {}
    local gui = player:FindFirstChild("PlayerGui")
    local buildGui = gui and gui:FindFirstChild("BUILDSLOT")
    if buildGui then for _,object in ipairs(buildGui:GetDescendants()) do
        if object.Name == "BuildAmount" or object.Name == "LastSave" then
            local ok,text = pcall(function() return object.Text end)
            if ok then result[#result+1] = {slot=object.Parent and object.Parent.Name,field=object.Name,text=tostring(text)} end
        end
    end end
    return result
end
function debug.Snapshot(label)
    if stopped or querying then return end
    querying = true
    local done,ok,count = false,false,nil
    task.spawn(function() ok,count=pcall(function() return saver:InvokeServer("GetPlacedAmount") end);done=true end)
    local deadline = os.clock()+12
    repeat task.wait(.05) until done or os.clock()>=deadline
    local invalid,visible = {},0
    for _,object in ipairs(folder:GetDescendants()) do if object:IsA("BasePart") then
        visible=visible+1
        local checked,issue=pcall(function()
            local size=object.Size
            for _,n in ipairs({size.X,size.Y,size.Z}) do if n~=n or math.abs(n)==math.huge or n<.001 or n>2048 then return "size outside client contract" end end
            for _,n in ipairs({object.CFrame:GetComponents()}) do if n~=n or math.abs(n)==math.huge then return "non-finite CFrame" end end
            return nil
        end)
        if not checked or issue then invalid[#invalid+1]={name=object.Name,issue=tostring(issue)} end
    end end
    local api = _G.MonzaBuilder or _G.MonzaTerrainBuilder
    local snapshot={label=label or "manual",seconds=os.clock()-started,serverCount=done and ok and clean(count,0) or "query failed or timed out",visibleParts=visible,invalidVisibleParts=invalid,slots=slots(),streaming=workspace.StreamingEnabled==true}
    if api then snapshot.builder={state=api.State,planParts=api.Count,nextIndex=api.NextIndex,expectedServerCount=api.ExpectedServerCount} end
    debug.Report.snapshots[#debug.Report.snapshots+1]=snapshot
    querying=false
    record("snapshot",snapshot)
    return snapshot
end
local function hook(event)
    if hooked[event] or not event:IsA("RemoteEvent") then return end
    local name=event.Name
    if name~="ChatMessage" and name~="ServerMessage" and name~="MessageNotification" and name~="Notification" and name~="UpdateBuildSaverUI" and name~="BuildSaver" then return end
    hooked[event]=true
    connections[#connections+1]=event.OnClientEvent:Connect(function(...)
        local args={...}
        if name=="UpdateBuildSaverUI" then
            record(name,clean(args,0));task.spawn(function() task.wait(.1);debug.Snapshot("slot update") end);return
        end
        local matches=name=="BuildSaver"
        for _,value in ipairs(args) do if relevant(value) then matches=true end end
        if not matches then return end
        local text=type(args[1])=="string" and string.lower(args[1]) or ""
        if text:find("fully saved",1,true) or text:find("please",1,true) and text:find("sav",1,true) then saveStarted=os.clock() end
        local data=clean(args,0)
        if type(data)=="table" and saveStarted then data.elapsedSinceSaveNotice=os.clock()-saveStarted end
        record(name,data)
        if text:find("failed to save",1,true) or text:find("successfully saved",1,true) then
            saveStarted=nil;task.spawn(function() debug.Snapshot("save result") end)
        end
    end)
end
for _,event in ipairs(events:GetChildren()) do hook(event) end
connections[#connections+1]=events.ChildAdded:Connect(hook)
local logOk,logs=pcall(function() return game:GetService("LogService") end)
if logOk and logs and logs.MessageOut then connections[#connections+1]=logs.MessageOut:Connect(function(message,kind)
    if not tostring(message):find(prefix,1,true) and relevant(message) then record("client log",{message=message,messageType=tostring(kind)}) end
end) end
function debug.Export()
    local json=http:JSONEncode(debug.Report)
    if type(writefile)=="function" then pcall(writefile,"monza-save-debug.json",json) end
    if type(setclipboard)=="function" then pcall(setclipboard,json) end
    print(prefix .. "REPORT " .. json)
    return json
end
function debug.Stop()
    stopped=true
    for _,connection in ipairs(connections) do connection:Disconnect() end
end
print(prefix .. "Observer ready. Save through the game's UI, then run _G.MonzaSaveDebug.Export().")
task.spawn(function() debug.Snapshot("observer start") end)
return debug
