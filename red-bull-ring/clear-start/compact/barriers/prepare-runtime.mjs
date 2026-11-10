import fs from 'node:fs';
const here=new URL('./',import.meta.url),base=new URL('../',here);
const read=n=>fs.readFileSync(new URL(n,base),'utf8');
const write=(n,s)=>fs.writeFileSync(new URL(n,here),s);
const adapt=s=>s.replaceAll('RedBullRingClearStartCompact','RedBullRingBarriers').replaceAll('RedBullRingCompactAutoSave','RedBullRingBarriersAutoSave').replaceAll('red-bull-ring-clear-start-compact-jakarta-checkpoint','red-bull-ring-barriers-jakarta-checkpoint');
function replace(s,a,b){if(!s.includes(a))throw Error(`Missing adaptation: ${a}`);return s.replace(a,b);}
const plan=JSON.parse(fs.readFileSync(new URL('barrier-plan.json',here)));
let builder=adapt(read('builder-template.luau'));
builder=replace(builder,'MaxObjects = 8998',`MaxObjects = ${plan.parts.length}`);
builder=replace(builder,'FollowBuild = true','FollowBuild = false');
builder=replace(builder,'local variant = roleIndex and (template.MaterialVariant or "") or ""','local variant = roleIndex and (template.MaterialVariant or "") or (style[3] or "")');
builder=replace(builder,'local color = roleIndex and not apply and template.Color or style[1]','local color = roleIndex and (not apply or CATALOG_ROLES[roleIndex].appearance == "template") and template.Color or style[1]');
builder=replace(builder,'function api.Preview()','function api.Preview()\n    if not selected then api.Inspect() end');
builder=replace(builder,'for i = 1, #PLAN do\n        local part = Instance.new("Part")','for i = 1, #PLAN do\n        local candidate = PART_ROLE[i] and roleSelected[PART_ROLE[i]]\n        local part = candidate and candidate.template:Clone() or Instance.new("Part")');
builder=replace(builder,'part.Material = style[2]','part.Material, part.MaterialVariant = style[2], style[3] or ""');
builder=replace(builder,'        local candidate = PART_ROLE[i] and roleSelected[PART_ROLE[i]]\n        if candidate then part.Material, part.MaterialVariant = candidate.template.Material, candidate.template.MaterialVariant or "" end','        if candidate then\n            if CATALOG_ROLES[PART_ROLE[i]].appearance == "template" then part.Color = candidate.template.Color end\n            part.Material, part.MaterialVariant = candidate.template.Material, candidate.template.MaterialVariant or ""\n        end');
builder=replace(builder,'local function plainBlock(template)',`-- A concrete Part may carry the native striped decals/textures. They do
-- not change its rectangular collision geometry; composite steel is excluded.
local function concreteBlock(template)
    if not template or template.ClassName ~= "Part" or template.Shape ~= Enum.PartType.Block then return false end
    for _, child in ipairs(template:GetDescendants()) do
        if child:IsA("BasePart") or child:IsA("DataModelMesh") or child:IsA("LuaSourceContainer") then return false end
    end
    return true
end
local function plainBlock(template)`);
builder=replace(builder,'if plainBlock(template) then','if plainBlock(template) or (entry.name == "Others68" and concreteBlock(template)) then');
builder=builder.replaceAll('Required road tile','Required barrier tile').replaceAll('Inspect the required road tile first','Inspect the required barrier tile first');
builder=replace(builder,'ExpectedServerCount = restoredCheckpoint and restoredCheckpoint.expectedServerCount or nil','ExpectedServerCount = restoredCheckpoint and restoredCheckpoint.expectedServerCount or INITIAL_SERVER_COUNT');
builder=replace(builder,'_G.RedBullRingBarriersBuilder = api','_G.RedBullRingBarriersBuilder = api\napi.RequiredBase = REQUIRED_BASE');
const begin=builder.indexOf('local function resolveOrigin()'),end=builder.indexOf('local function geometry(',begin);
builder=builder.slice(0,begin)+`local function resolveOrigin()
    assert(typeof(CONFIG.Origin) == "CFrame", "Load the completed matching road builder or its checkpoint first")
    return CONFIG.Origin
end
`+builder.slice(end);
builder=builder.replace(/local AUTO_GROUPS = [^\r\n]+/,`local AUTO_GROUPS = {{"barriers",1,${plan.parts.length}}}`);
builder=replace(builder,'function api.Build()','function api.Build()\n    assert(not (_G.RedBullRingClearStartCompactBuilder and _G.RedBullRingClearStartCompactBuilder.State == "building"), "Pause the road builder before building barriers")');
builder=replace(builder,'local builders = {_G.RedBullRingBarriersBuilder,','local builders = {_G.RedBullRingBarriersBuilder, _G.RedBullRingClearStartCompactBuilder,');
builder=replace(builder,'assert(currentCount >= api.NextIndex - 1,','assert(currentCount >= REQUIRED_BASE.count + api.NextIndex,');
builder=replace(builder,'Start with the grass plate or load a matching compact prefix.','Load the completed matching road and barrier checkpoint.');
builder=replace(builder,'currentCount + remainingCount < 9000','currentCount + remainingCount < 9500');
builder=replace(builder,'Compact build exceeds its 8999 total-object target.','Full build exceeds its 9499 total-object target.');
builder=builder.replace('Compact terrain: under 9000 total objects; clear 400 x 400 stud grass starting area.','Full-circuit barriers: add to the completed compact road.');
builder=builder.replace('title.Text = "RED BULL RING BUILDER"','title.Text = "RED BULL RING BARRIERS"');
builder=replace(builder,'button("Repair missing parts", 12, 350, api.Repair)',`button("Follow placement", 12, 350, function()
    assert(not busy and not previewing, "Pause before changing follow placement")
    CONFIG.FollowBuild = not CONFIG.FollowBuild
    status(CONFIG.FollowBuild and "Follow placement on: stand outside the car before building" or "Follow placement off: use bounded streaming while you drive")
end)`);
const repairStart=builder.indexOf('function api.Repair()'),repairEnd=builder.indexOf('\nend',repairStart)+4;
builder=builder.slice(0,repairStart)+`function api.Repair()
    error("Use the matching barriers checkpoint to resume. Diagnose unconfirmed requests before continuing.")
end`+builder.slice(repairEnd);
write('builder-template.luau',builder);

let loader=adapt(read('plan-loader.luau'));
loader=replace(loader,'role.appearance == "color"','(role.appearance == "color" or role.appearance == "template")');
loader=replace(loader,'local restoredCheckpoint','local REQUIRED_BASE = meta.requiredBase\nassert(type(REQUIRED_BASE) == "table" and finite(REQUIRED_BASE.count) and REQUIRED_BASE.count > 0 and REQUIRED_BASE.count % 1 == 0 and type(REQUIRED_BASE.checksum) == "string" and type(REQUIRED_BASE.version) == "string" and type(REQUIRED_BASE.references) == "table" and #REQUIRED_BASE.references > 0, "Missing matching road requirements")\nassert(meta.variant == "clear-start-compact-barriers", "Use the matching barrier plan")\nlocal INITIAL_SERVER_COUNT\nlocal restoredCheckpoint');
loader=replace(loader,'PALETTE[i] = {Color3.fromRGB(entry.rgb[1], entry.rgb[2], entry.rgb[3]), material}','assert(entry.materialVariant == nil or type(entry.materialVariant) == "string", "Invalid barrier material variant")\n    PALETTE[i] = {Color3.fromRGB(entry.rgb[1], entry.rgb[2], entry.rgb[3]), material, entry.materialVariant or ""}');
loader=replace(loader,'saved.expectedServerCount == saved.nextIndex','saved.expectedServerCount >= REQUIRED_BASE.count + saved.nextIndex');
loader=replace(loader,'    restoredCheckpoint = saved',`    assert(saved.expectedServerCount ~= nil, "Barrier checkpoint needs the combined server count")
    assert(saved.requiredBase and saved.requiredBase.version == REQUIRED_BASE.version and saved.requiredBase.checksum == REQUIRED_BASE.checksum and saved.requiredBase.count == REQUIRED_BASE.count, "Checkpoint belongs to a different base road")
    restoredCheckpoint = saved`);
loader=replace(loader,'raw, inlineJson, document = nil, nil, nil',`-- Inherit the original road transform, never the player's current position.
local road = _G.RedBullRingClearStartCompactBuilder
assert(not road or road.State ~= "building", "Pause the road builder before loading barriers")
if not restoredCheckpoint then
    if road then
        assert(road.PlaceId == TARGET_PLACE_ID and road.Count == REQUIRED_BASE.count and road.NextIndex == road.Count + 1 and road.State ~= "unconfirmed", "Finish the matching compact road before adding barriers")
        local first = assert(road.GetTarget(REQUIRED_BASE.references[1].index), "No road transform")
        assert(typeof(first.origin) == "CFrame" and finite(first.scale) and first.scale > 0, "Missing road transform")
        CONFIG.Origin, CONFIG.Scale = first.origin, first.scale
        for _, reference in ipairs(REQUIRED_BASE.references) do
            local request, p = road.GetTarget(reference.index), reference.part
            local expected = CONFIG.Origin * CFrame.fromMatrix(Vector3.new(p[1],p[2],p[3]) * CONFIG.Scale, Vector3.new(p[8],p[9],p[10]), Vector3.new(p[11],p[12],p[13]))
            local a,b = {expected:GetComponents()}, {request.cf:GetComponents()}
            for k=1,12 do assert(math.abs(a[k]-b[k]) < (k<=3 and .003 or .00003), "Different road geometry; use the matching compact release") end
            assert((request.size-Vector3.new(p[4],p[5],p[6])*CONFIG.Scale).Magnitude < .003, "Different road dimensions")
        end
        local report = assert(road.VerifyServerCount(), "Could not verify completed road")
        assert(report.matches and report.serverCount >= REQUIRED_BASE.count + 1, "Road/server count mismatch; load the matching saved road")
        INITIAL_SERVER_COUNT = report.serverCount
    else
        assert(type(readfile) == "function", "Keep the completed compact road builder loaded, or export its checkpoint first")
        local ok, contents = pcall(readfile, "red-bull-ring-clear-start-compact-jakarta-checkpoint.json")
        if not ok then ok,contents=pcall(readfile,"RedBullRingClearStartCompact/red-bull-ring-clear-start-compact-jakarta-checkpoint.json") end
        assert(ok, "Load the completed compact road builder or export its matching checkpoint first")
        local saved = game:GetService("HttpService"):JSONDecode(contents)
        assert(type(saved)=="table" and saved.format=="red-bull-ring-checkpoint-v2" and saved.placeId==TARGET_PLACE_ID and saved.count==REQUIRED_BASE.count and saved.checksum==REQUIRED_BASE.checksum and saved.nextIndex==REQUIRED_BASE.count+1, "Base checkpoint must contain the completed matching road")
        assert(type(saved.origin)=="table" and #saved.origin==12 and finite(saved.scale) and saved.scale>0, "Invalid base checkpoint transform")
        for _, n in ipairs(saved.origin) do assert(finite(n),"Invalid base checkpoint transform") end
        CONFIG.Origin, CONFIG.Scale = CFrame.new(table.unpack(saved.origin)), saved.scale
        INITIAL_SERVER_COUNT = REQUIRED_BASE.count + 1
    end
end
raw, inlineJson, document = nil, nil, nil`);
write('plan-loader.luau',loader);
let checkpoint=adapt(read('red-bull-ring-checkpoint.lua'));
checkpoint=replace(checkpoint,'local saved = { format =','local saved = { requiredBase = {version=plan.meta.requiredBase.version, count=plan.meta.requiredBase.count, checksum=plan.meta.requiredBase.checksum}, expectedServerCount = api.ExpectedServerCount, format =');
// Requests expose the exact inherited transform; do not reconstruct it from axes.
const solveStart=checkpoint.indexOf('local relative ='),solveEnd=checkpoint.indexOf('local checksum =',solveStart);
checkpoint=checkpoint.slice(0,solveStart)+'local transform = {request.origin:GetComponents()}\n'+checkpoint.slice(solveEnd);
write('red-bull-ring-checkpoint.lua',checkpoint);
for(const name of ['red-bull-ring-save.lua','red-bull-ring-diagnose.lua']){
  let s=adapt(read(name));
  if(name.includes('save'))s=replace(s,'local builders = {_G.RedBullRingBarriersBuilder,','local builders = {_G.RedBullRingBarriersBuilder, _G.RedBullRingClearStartCompactBuilder,');
  write(name,s);
}
let github=adapt(read('github-loader-template.luau'));
github=github.replace(' or mode == "recovery"','').replace('checkpoint, recovery, diagnose','checkpoint, diagnose');
github=github.replace(/^if mode == "recovery"[^\n]*\n/gm,'');
github=replace(github,'print("[Red Bull Ring] Loading the Jakarta circuit builder and track data from GitHub...")',`if _G.RedBullRingBarriersBuilder and mode ~= "resume" then
    local api = _G.RedBullRingBarriersBuilder
    api.Show()
    if mode == "autosave" then api.EnableAutoSave(slot) end
    return api
end
print("[Red Bull Ring] Loading full-circuit barriers for the completed compact road...")`);
write('github-loader-template.luau',github);
console.log('Prepared separate barrier builder, inherited road alignment, combined count guards and checkpoints.');
