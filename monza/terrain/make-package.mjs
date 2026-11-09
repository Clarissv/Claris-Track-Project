import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(here,'..');
const rewrite=text=>text
  .replaceAll('_G.MonzaBuilder','_G.MonzaTerrainBuilder')
  .replaceAll('MonzaBuilderPanel','MonzaTerrainBuilderPanel').replaceAll('[MonzaBuilder]','[MonzaTerrainBuilder]')
  .replaceAll('MonzaTrack','MonzaTerrain').replaceAll('MonzaLuaNative','MonzaTerrainLuaNative')
  .replaceAll('monza-jakarta-checkpoint.json','monza-terrain-jakarta-checkpoint.json')
  .replaceAll('monza-checkpoint-v2','monza-terrain-checkpoint-v2')
  .replaceAll('monza-builder.lua','monza-terrain-builder.lua').replaceAll('monza-plan.json','monza-terrain-plan.json')
  .replaceAll('monza-checkpoint.lua','monza-terrain-checkpoint.lua').replaceAll('monza-diagnose.lua','monza-terrain-diagnose.lua')
  .replaceAll('monza-resume.lua','monza-terrain-resume.lua').replaceAll('monza-run.lua','monza-terrain-run.lua')
  .replaceAll('monza-track-executor.zip','monza-terrain-executor.zip').replaceAll('monza-3d-viewer.html','monza-terrain-3d-viewer.html')
  .replaceAll('/monza/releases/','/monza/terrain/releases/');
const read=name=>fs.readFileSync(path.join(base,name),'utf8').replace(/\r\n?/g,'\n');
let template=rewrite(read('builder-template.luau')).replace('FLAT MONZA BUILDER','MONZA TERRAIN BUILDER');
template=template.replace('local folder = workspace:FindFirstChild("EditableBuilds")',
  'assert(not (_G.MonzaBuilder and _G.MonzaBuilder.State == "building"), "Pause the non-terrain Monza builder first")\n    local folder = workspace:FindFirstChild("EditableBuilds")');
const addon=`
function api.AddTerrain()
    assert(not busy and not previewing and api.NextIndex == 1 and not pending, "Start terrain-only mode from a newly loaded terrain panel")
    local track = assert(_G.MonzaBuilder, "Keep the completed non-terrain Monza builder loaded")
    assert(track.Count == TERRAIN_BASE_COUNT and track.State == "complete", "Complete the matching non-terrain track first")
    assert(track.VerifyServerCount and track.VerifyServerCount().matches, "Verify or repair the original track's server count first")
    local captured = assert(track.RequestDiagnostics(), "The original track transform is missing")
    assert(captured.origin and captured.scale and captured.index >= 1 and captured.index <= TERRAIN_BASE_COUNT, "Original track transform is invalid")
    local frame, size = geometry(captured.index, captured.origin, captured.scale)
    assert((frame.Position-captured.cf.Position).Magnitude < .01 and (size-captured.size).Magnitude < .01, "The loaded track does not match this terrain plan")
    CONFIG.Origin, CONFIG.Scale = captured.origin, captured.scale
    CONFIG.CatalogName, CONFIG.ApplyAppearance = captured.baseCatalogName, captured.applyAppearance == true
    origin, buildScale, appearance = captured.origin, captured.scale, CONFIG.ApplyAppearance
    api.NextIndex = TERRAIN_BASE_COUNT+1
    status("Adding only terrain at the completed track's original transform")
    return api.Build()
end
`;
template=template.replace('local screen = Instance.new("ScreenGui")',addon+'\nlocal screen = Instance.new("ScreenGui")');
template=template.replace('panel.Size = UDim2.fromOffset(330, 401)','panel.Size = UDim2.fromOffset(330, 447)');
template=template.replace('function api.Show()', 'button("Add terrain only", 12, 396, api.AddTerrain)\nfunction api.Show()');
template=template.replace(/\nreturn api\s*$/, '\nif launchMode == "terrain-only" then return api.AddTerrain() end\nreturn api\n');
let planLoader=rewrite(read('plan-loader.luau'));
planLoader=planLoader.replace('local PLAN = document.parts','local PLAN = document.parts\nassert(meta.variant == "terrain", "Monza Terrain: use the separate terrain plan")\nlocal TERRAIN_BASE_COUNT = meta.terrainBasePartCount or (meta.terrain and meta.terrain.basePartCount)');
fs.writeFileSync(path.join(here,'builder-template.luau'),template);
fs.writeFileSync(path.join(here,'plan-loader.luau'),planLoader);
fs.writeFileSync(path.join(here,'monza-terrain-builder.lua'),template.replace('-- GENERATED_DATA',()=>planLoader));
for(const [from,to] of [['monza-checkpoint.lua','monza-terrain-checkpoint.lua'],['monza-diagnose.lua','monza-terrain-diagnose.lua'],['monza-resume.lua','monza-terrain-resume.lua'],['launcher-template.luau','monza-terrain-run.lua']])fs.writeFileSync(path.join(here,to),rewrite(read(from)));
let fixture=rewrite(read('test-builder.lua'));
fixture='local nonTerrainSentinel = {State="paused",preserved=true}\n_G.MonzaBuilder = nonTerrainSentinel\n'+fixture;
fixture=fixture.replace('meta = { format = "monza-elevated-v1",','meta = { variant="terrain", terrainBasePartCount=1, format = "monza-elevated-v1",');
// Check isolation before returning from the base suite.
fixture=fixture.replace('-- HTTP_LOADER_TESTS',`assert(_G.MonzaBuilder == nonTerrainSentinel, "Terrain operations must preserve the non-terrain builder")
api = fresh()
nonTerrainSentinel.State = "building"
local concurrentTerrain = pcall(api.Build)
assert(not concurrentTerrain and #calls == 0, "Terrain build must block while the non-terrain builder is active")
nonTerrainSentinel.State = "paused"
local missingBase = pcall(api.AddTerrain)
assert(not missingBase and #calls == 0, "Terrain-only mode must require a verified completed base build")
api = fresh()
api.Config.Origin, api.Config.Scale = cf(1500,25,-2000), 2
local capturedBase = api.GetTarget(1)
local baseObject = instance("Part")
baseObject.Name, baseObject.CFrame, baseObject.Size = "Block", capturedBase.cf, capturedBase.size
baseObject.Color, baseObject.Material, baseObject.MaterialVariant = capturedBase.color, capturedBase.material, capturedBase.materialVariant
baseObject.Anchored, baseObject.CanCollide, baseObject.Parent = true, true, builds
local completedBase = {Count=1,State="complete",VerifyServerCount=function() return {matches=true} end,RequestDiagnostics=function() return capturedBase end}
_G.MonzaBuilder = completedBase
api.AddTerrain()
assert(#calls == 1 and #builds:GetChildren() == 2 and api.State == "complete", "Terrain-only mode must place just the suffix")
assert(calls[1][2].X == 1512 and calls[1][2].Y == 24 and calls[1][2].Z == -2000, "Terrain-only mode must retain the base origin, yaw and scale")
assert(_G.MonzaBuilder == completedBase and baseObject.Parent == builds, "Adding terrain must preserve the loaded road and original builder")
_G.MonzaBuilder = nonTerrainSentinel
api.Unload()
-- HTTP_LOADER_TESTS`);
fs.writeFileSync(path.join(here,'test-builder.lua'),fixture);
fs.writeFileSync(path.join(here,'test-builder.ps1'),rewrite(read('test-builder.ps1')));
let httpTests=rewrite(read('test-http-loader.lua'));
httpTests=httpTests.replace('/monza/terrain/releases/','/monza/terrain/releases/');
// Lua filename patterns escape hyphens; update those separately.
for(const name of ['builder','checkpoint','diagnose'])httpTests=httpTests.replaceAll(`monza%-${name}`,`monza%-terrain%-${name}`);
httpTests+=`
api = fresh()
local originalRoad = api.GetTarget(1)
local savedRoad = instance("Part")
savedRoad.Name, savedRoad.CFrame, savedRoad.Size = "Block", originalRoad.cf, originalRoad.size
savedRoad.Color, savedRoad.Material, savedRoad.MaterialVariant = originalRoad.color, originalRoad.material, originalRoad.materialVariant
savedRoad.Anchored, savedRoad.CanCollide, savedRoad.Parent = true, true, builds
local httpBase = {Count=1,State="complete",VerifyServerCount=function() return {matches=true} end,RequestDiagnostics=function() return originalRoad end}
_G.MonzaBuilder = httpBase
loadHttpLoader("terrain-only")
assert(#calls == 1 and _G.MonzaTerrainBuilder.State == "complete", "HTTP terrain-only mode must start only the suffix placement")
assert(_G.MonzaBuilder == httpBase and savedRoad.Parent == builds, "HTTP terrain-only mode must preserve the original track")
_G.MonzaBuilder = nonTerrainSentinel
print("PASS: separate terrain loader, original builder isolation and terrain-only HTTP placement")
`;
fs.writeFileSync(path.join(here,'test-http-loader.lua'),httpTests);
fs.writeFileSync(path.join(here,'package-terrain.ps1'),rewrite(read('package-ribbons.ps1')));
fs.mkdirSync(path.join(here,'source'),{recursive:true});
for(const name of ['LICENSE','Monza.csv'])fs.copyFileSync(path.join(base,'source',name),path.join(here,'source',name));
fs.copyFileSync(path.join(base,'THIRD-PARTY.txt'),path.join(here,'THIRD-PARTY.txt'));

const plan=JSON.parse(fs.readFileSync(path.join(here,'monza-terrain-plan.json')));
const {format,variant,partCount,palette,planBounds,sourceSha256,centerlineSha256,placementAnchor,catalogRoles,gameTarget,nonCollidingPartIndices}=plan.meta;
const assets={
  'monza-terrain-builder.lua':fs.readFileSync(path.join(here,'monza-terrain-builder.lua')),
  'runtime-plan.json':Buffer.from(JSON.stringify({meta:{format,variant,partCount,palette,planBounds,sourceSha256,centerlineSha256,placementAnchor,catalogRoles,gameTarget,nonCollidingPartIndices,terrainBasePartCount:plan.meta.terrain.basePartCount},parts:plan.parts})),
  'monza-terrain-checkpoint.lua':fs.readFileSync(path.join(here,'monza-terrain-checkpoint.lua')),
  'monza-terrain-diagnose.lua':fs.readFileSync(path.join(here,'monza-terrain-diagnose.lua')),
};
const hash=crypto.createHash('sha256');for(const [name,body] of Object.entries(assets))hash.update(name).update('\0').update(body);
const version=hash.digest('hex').slice(0,20),release=path.join(here,'releases',version);
fs.mkdirSync(release,{recursive:true});const files=[];
for(const [name,body] of Object.entries(assets)){fs.writeFileSync(path.join(release,name),body);files.push({path:`releases/${version}/${name}`,bytes:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex')});}
let loader=rewrite(read('github-loader-template.luau')).replace('__RELEASE_BASE__',`https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/monza/terrain/releases/${version}/`);
loader=loader.replace('mode == "diagnose",','mode == "diagnose" or mode == "terrain-only",').replace('mode == "resume" and "resume" or nil','mode == "resume" and "resume" or (mode == "terrain-only" and "terrain-only" or nil)');
loader=loader.replace('expected build, resume, checkpoint or diagnose','expected build, resume, checkpoint, diagnose or terrain-only');
for(const output of [path.join(here,'loader.lua'),path.join(release,'loader.lua')])fs.writeFileSync(output,loader);
files.push({path:`releases/${version}/loader.lua`,bytes:Buffer.byteLength(loader),sha256:crypto.createHash('sha256').update(loader).digest('hex')});
fs.writeFileSync(path.join(here,'release-manifest.json'),JSON.stringify({format:'monza-terrain-github-release-v1',version,partCount,terrainPartCount:plan.meta.terrain.addedParts,totalWithExistingGrass:partCount+1,files},null,2)+'\n');
if(process.platform==='win32')execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(here,'package-terrain.ps1')],{windowsHide:true,stdio:'pipe'});
console.log(JSON.stringify({version,trackParts:plan.meta.terrain.basePartCount,terrainParts:plan.meta.terrain.addedParts,totalWithExistingGrass:partCount+1},null,2));
