# Separate Monza terrain version

This version includes the complete unchanged Monza track plus broad grass
slopes and a flat foundation. Its loader, runtime global, preview panel,
executor folder and checkpoints are separate from the non-terrain version.
The source and publishing files for the non-terrain version are preserved.

**10,047 track parts + 703 terrain parts = 10,750 placed parts**, or
**10,751 including your existing grass plate**. This leaves 249 parts below
the 11,000 guard when there are no other placed objects.

The two named grass meshes in the supplied GLB guide terrain heights. The
original model display tilt and normalized track coordinate transform are
accounted for. Missing grass samples blend from the road height. The terrain
uses broad 128–512-stud sloping boxes and transitions toward the foundation
outside the circuit corridor. It does not reproduce every crest, buildings,
trees or the old oval banking.

Every terrain/track overlap is checked at polygon vertices. Grass stays at
least 0.05 studs below the underside of existing asphalt, paint, kerbs, pit,
gravel and runoff parts. The driving geometry and collision assignments are
preserved exactly. Full rotated-box intersection checks also cover the sides
of thick grass blocks. Broad terrain still has visible box edges and seams.

## Publish and load

Run `node prepare-publish.mjs` here, then in `../Sepang Publish`:

```powershell
git add -- monza-terrain
git commit -m "Add separate Monza terrain version"
git push origin main
```

For a complete new build, join Jakarta and use an empty build slot:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Sepang/main/monza-terrain/loader.lua"))()
```

This opens the terrain panel without placing anything. Inspect, preview, then
Build. Stand on the original grass where you want the pit anchor. Keep the
non-terrain build in its own saved slot.

To add only grass to an existing completed track, keep the matching current
`_G.MonzaBuilder` loaded and use:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Sepang/main/monza-terrain/loader.lua"))("terrain-only")
```

This mode starts placement of the terrain immediately. It checks the completed
base builder's count and captures its original origin, rotation and scale;
it places no additional road pieces. Use the fixed 10,047-part Monza builder.
If its count does not verify, repair that track first. Do not start a full
terrain build over an existing track with a newly guessed origin.

Terrain checkpoint, resume and diagnostic modes are `"checkpoint"`, `"resume"`
and `"diagnose"` on this separate loader. Checkpoints use
`monza-terrain-jakarta-checkpoint.json`. Pause before exporting; save through
the game's slot UI before rejoining. A checkpoint does not save game objects.

## Local package and regeneration

Extract `monza-terrain-executor.zip` into the executor workspace, including
`MonzaTerrain`, and paste `monza-terrain-run.lua`.
Open `monza-terrain-3d-viewer.html` to inspect the generated build.

```powershell
node extract-ground.mjs
node compile-terrain.mjs
node make-package.mjs
node --test test-terrain.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File test-builder.ps1 -HttpLoader loader.lua
node prepare-publish.mjs
```

Frozen `source/ground-reference.json` supports generation without reading the
large model again. The generator reads the existing sibling Monza plan and
geometry modules. It writes only this terrain directory. `generation-report.json`
records the actual part count and clearance audit. Offline checks do not
establish successful live driving or saving in Jakarta.
