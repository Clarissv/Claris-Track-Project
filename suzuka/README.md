# Suzuka with connected asphalt ramps

**8,158 placed Parts; 8,159 including your original grass plate.** This is a
Jakarta builder using the supplied Suzuka 2001 GLB, with the database CSV
aligned to its road surface. It includes a straight main straight, a clean
44-stud racing surface, a 26-stud pit lane, low red/white kerbs, gravel,
continuous barriers, grass abutments beneath the upper deck and a tiled foundation.

[Interactive preview](suzuka-3d-viewer.html) · [Overview](build-3d.png) ·
[Crossover](build-crossover.png) · [Pit entry](build-pit-entry.png) ·
[Pit approach curve](build-pit-approach.png) ·
[Snake](build-snake.png) · [Degner](build-degner.png) ·
[200R](build-200r.png) · [130R](build-130r.png) · [Chicane](build-chicane.png) ·
[First corner](build-first-corner.png) · [Hairpin](build-hairpin.png) · [Spoon](build-spoon.png)

The asphalt fits the GLB's actual road heights to connected world planes, with
straight ramp sections targeting 40 studs and curved pieces fitted to the same
plane. Full-width joins and bounded pitch changes keep the slabs connected.
The clean CSV route avoids
snapping onto pit and service branches. The main chicane follows the GLB's two
bends, rounded for the 44-stud road. This remains a block adaptation of the
supplied 2001 model.

The pit entry starts after the chicane at the last curve. Its visible split opens
near the middle of that curve, bends inward along its own approach, then sweeps
out into the pit straight. The two curves follow the references in `fix/` and
join with matching tangents and curvature. The road's inner edge marking stops
where the pit crosses it. The pit merges after the garages.

Kerb extents follow the screenshots in `curbs/` and the full GLB kerb ribbons,
including the longer Spoon and S-curve strips. Source pavement identifies which
side each ribbon belongs to; the old pit approach kerbs are omitted. Only small
sampling holes are joined. There are 827 kerb pieces.
Gravel boundaries use the GLB's GRVL01 material, including the two restored Snake
patches, the outside of the hairpin, Degner and 130R, and the long 200R area.
The hairpin's short outer patch is retained with a shorter end taper; it was
previously discarded by the minimum patch length. Green runoff and terrain
stay below the sand. The 1,327 barrier pieces have connected joins.

The supported crossover retains **14.43 studs of conservative clearance**,
including the underside of its one-stud concrete deck. The GLB height fit restores
the elevated section after Snake and the downhill run to Degner. At the checked
landmarks, after Snake differs from the GLB by 0.09 stud and the chicane by 1.12
studs. Across all 9,288 samples, RMS height error is 1.13 studs and maximum error
is 6.17 studs; this remains a block approximation through sharp source changes.
Enable **GLB road heights (yellow)** in the HTML viewer to compare the source
centreline against the build, or open `elevation-profile.svg` for both profiles.

Road overlap seams differ by at most 0.007870 studs; pit seams remain below
0.005872 studs. All 27,864 racing-lane and 3,459 pit samples have road coverage.
The checks also verify kerb and barrier continuity, pit obstructions, gravel
coverage and terrain clearance. Outer grass retains broad planar terraces.

## Run the local package

Extract `suzuka-executor.zip` into the executor workspace, preserving the
`Suzuka` folder. Join **Jakarta, place 14005966837**, start a fresh build with
only your existing grass plate, enable Build Tools, and stand outside your car.
Build Tools Plus is required for colours/material controls. Paste the contents
of `suzuka-run.lua`. It opens the panel without placing anything.

Your position anchors the clear 400 × 400 grass starting square shown by the
red preview marker. Inspect the catalog, Preview, then Build. Asphalt uses
Others75 recoloured RGB 65,66,66 while retaining its catalog material/variant.
The builder moves your character near placement to keep distant parts streamed.
Pause and Build / Resume work in the same session. Save the finished map through
the game's build-slot UI; a checkpoint stores progress, not Roblox objects.

For a local checkpoint, pause and run:

```lua
assert(loadstring(readfile("Suzuka/suzuka-checkpoint.lua")))()
```

Save the partial game build before leaving. After rejoining, load that matching
saved slot, then paste `suzuka-resume.lua`. Use `_G.SuzukaBuilder` for configuration
and `_G.SuzukaBuilder.SurfaceReport()` for measured road confirmation errors.
Other circuits keep their own globals and checkpoint files.

## GitHub loader after publishing

The publishing directory is `Claris Track Project/suzuka`. Once those files
have been pushed, this entry point loads its pinned release:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/suzuka/loader.lua"))()
```

Its optional modes are `"resume"`, `"checkpoint"` and `"diagnose"`. The prepared
local files do not make the remote URL available until publishing.

## Regenerate and check

The frozen route, kerb and gravel references allow rebuilding without the GLB:

```powershell
node compile.mjs
node audit.mjs
node render.mjs
node make-package.mjs
node verify-artifacts.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File test-builder.ps1 -HttpLoader loader.lua
```

`driving-audit.json` contains the geometry results. The Lua tests exercise
placement, surface confirmation, pause/resume, checkpoints, failed downloads
and uncertain server responses using mocked game endpoints. These checks have
passed locally; actual driving and save/reload still need an in-game session.

The original GLB, textures and archive remain in the source workspace and are
excluded from the executor/publishing packages. See `THIRD-PARTY.txt`.
