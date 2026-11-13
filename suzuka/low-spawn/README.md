# Suzuka close to spawn

This version lowers the spectator side of the main straight opposite the pit.
The pit beside the starting square is about 12.15 studs above the grass, down
from 92.62 studs. The circuit has gentler hills, with a separate raised crossover
that retains 22.31 studs of vehicle clearance. A 222-stud grass exit ramp lets
you leave the clear starting square and reach the surrounding track terrain.

There are 8,301 placed Parts, or 8,302 including your original grass plate.
The racing layout, widths and pit path are retained. Manually added buildings
from the old server are not included.

In your friend's fresh Jakarta server, enable Build Tools, stand at the spawn
where you want the clear starting square, and stay outside the car. Run:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/suzuka/low-spawn/loader.lua"))()
```

This opens the panel. Inspect the catalog, Preview, then Build. Save through the
normal owner build-slot UI when complete. Keep the default scale and altitude
for the reported heights. Build Tools Plus is needed for colors/materials.

For the local package, extract the `SuzukaLow` folder into the executor workspace
and run `suzuka-run.lua`. Checkpoints use
`SuzukaLow/suzuka-low-spawn-jakarta-checkpoint.json`. Resume uses the matching
low version and the saved game build.

If moderator access cannot query the save-interface count, use the updated
`suzuka-moderator-run.lua` from the local package in a fresh server with only
the original grass plate. It opens the panel with a known starting count of 1.
The total is tracked from confirmed placements and requires owner verification
and saving. See the [moderator instructions](../README.md#building-as-a-moderator-in-your-friends-server)
for existing builds and checkpoint resume.

The lane coverage, joins, gravel, barrier continuity, runoff and crossover are
checked offline. The access audit also checks the clear spawn area, ramp
coverage, slope and terrain join. Actual driving and saving need an in-game
check. The GitHub loader becomes available after these files are pushed.

To publish this version, run in PowerShell:

```powershell
Set-Location 'F:\VSCode\Luau\Claris Track Project'
$lowerFiles = @(
  'suzuka/README.md', 'suzuka/audit.mjs', 'suzuka/compact-runoff.mjs',
  'suzuka/compile-tidy.mjs', 'suzuka/compile.mjs', 'suzuka/make-package.mjs',
  'suzuka/package-executor.ps1', 'suzuka/source-elevation.mjs',
  'suzuka/test-builder.ps1', 'suzuka/verify-artifacts.mjs',
  'suzuka/low-height-profile.mjs', 'suzuka/lower-datum.mjs',
  'suzuka/spawn-access.mjs', 'suzuka/test-low-spawn.mjs', 'suzuka/low-spawn'
)
git add -- $lowerFiles
git diff --cached --stat
git commit -m 'Add lower Suzuka with a gentle spawn access ramp'
git push origin main
```

From the parent Suzuka directory:

```powershell
$env:SUZUKA_LOW_SPAWN = '1'
node compile.mjs
node audit.mjs
node test-low-spawn.mjs
node make-package.mjs
node verify-artifacts.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File test-builder.ps1 -LowSpawn -HttpLoader low-spawn/loader.lua
powershell -NoProfile -ExecutionPolicy Bypass -File package-executor.ps1 -LowSpawn
```
