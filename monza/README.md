# Monza with elevation

Separate Monza build for **Jakarta (place 14005966837)**. Includes the F1 circuit, pit lane, markings,
low ramped kerbs, astroturf and gravel. Buildings and stands are left for manual
construction. Existing Sepang variants are preserved.

**10,047 parts**, about **3,514 × 6,694 studs**, with **40–42-stud roads** and a
**32-stud pit lane**. Track elevation varies by about 67.8 studs.

The driving profile now smooths height over an 80-stud Gaussian distance and
banking over 100 studs. Horizontal layout and vehicle widths are unchanged.
Broad hills remain: the main circuit's elevation adjustment is at most 1.06 studs before the
common grass offset. Paint and the start line have collision disabled; asphalt,
pit pavement and low kerbs remain solid.

The largest source height curvature is reduced by about 97.8%. Main-road
pitch changes stay below 0.08 degrees and top-plane differences across actual
overlapping plate corners stay below 0.009 studs. These are offline geometry
measurements; the same car and speed still need a live driving check.

Pit entry/exit pavement follows the main road's height and banking throughout
their shared footprint, then blends back outside the overlap. A previous
0.75-stud pit-entry obstruction is removed. The highest colliding surface across
five sampled tyre paths stays within 0.016 studs of the intended smooth profile,
including the pit merge and accessories. Paint and the finish line do not
contribute any collision surface.

The exported Jakarta client uses the same catalog and placement payload as Jawa Timur.
Your latest tests saved Monza around 7,300 parts and Sepang around 9,000, but
Monza failed around 9,900 and at completion with only "Failed to save".
Its server-side save handler was not exported, so the exact maximum and cause
of the failure are still unknown. Object count alone does not establish whether
a slot can store this build.
The 11,000-object guard is a local builder setting. If the exact save limit is known, set
`_G.MonzaBuilder.Config.SaveObjectLimit` before building; the guard includes
other placed objects reported by the server.

Uses the accepted Sepang scale (2.68845 studs/metre), road-width multiplier 1.25
and pit-width multiplier 1.4, with a 40-stud road-width minimum. The pit lane is
32 studs wide. The part budget is
11,000; generation uses fewer parts when the geometry permits.

Open `monza-3d-viewer.html` locally to inspect the whole build. Use the Main
straight and Standing point buttons for closer views. The green platform is a
preview of your existing grass, not additional placed parts.

## Execute after publishing

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/monza/loader.lua"))()
```

Join Jakarta and enable the game's build tools. Stand on the grass where you want the pit
straight to be, inspect the catalog, preview, then Build. This script opens the
panel without placing parts. The standing point fixes horizontal pit position;
the elevated pit road is about 15.3 studs above that grass at the default anchor.
The lowest represented surface clears your grass by 0.25 studs. Set
`_G.MonzaBuilder.Config.YawDegrees` before the first preview/build to rotate it.

Asphalt uses Others75, recoloured RGB 65,66,66 while retaining the tile's live
material/variant. Other surfaces use a plain rectangular block from the catalog.
Build Tools Plus is required for appearance controls. Your character follows
placement to keep distant pieces streamed, then returns when paused or finished.
Placement is confirmed against the server's objects; uncertain placements stop
without resending duplicates.

The previous matcher reused 10 distinct neighbouring pieces, reproducing the
reported 10,038 save objects exactly (10,037 track pieces plus one grass plate).
This release assigns each server object to one plan index and uses tighter
geometry checks when reusing existing parts. A fresh completed build with one
grass plate should report **10,048 server objects**. Pause and completion now
verify the authoritative count used by the game's save UI. This fixes the
placement discrepancy; a successful save still needs a live check.

For a matching old build, export its checkpoint using the old loader before
loading the new release in `"resume"` mode. Keep the matching partial game build
loaded, then use **Repair missing parts** or `_G.MonzaBuilder.Repair()`.
Repair inspects all indices at the checkpoint's original transform and places
only missing pieces, including pieces skipped before the checkpoint index.
Repair can be paused and continued with Build / Resume. It can also use an
explicit `Config.Origin` containing the exact original transform.
See `ISSUES.md` and `placement-and-grass-report.json` for the findings and grass estimates.

Use Pause to suspend and Build/Resume to continue in the same server. Save the
completed map through the game's build-slot UI.

For diagnostics:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/monza/loader.lua"))("diagnose")
```

Before leaving a paused build, export a checkpoint (requires `writefile`) and
save the partial build using the game's UI:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/monza/loader.lua"))("checkpoint")
```

Restore the saved Jakarta game build before loading with `"resume"`. Checkpoints
are specific to the geometry, map and release. Monza uses `_G.MonzaBuilder` and
`monza-jakarta-checkpoint.json`, separately from both Sepang variants and the old
Jawa Timur Monza checkpoint. Start a fresh build in Jakarta; a Jawa Timur
checkpoint cannot restore the objects stored in Jakarta's separate save slots.
For the smoothed release, start in an empty Jakarta build slot. Keep the old
save in another slot: its geometry/checkpoint belongs to the prior release and
overlaying both versions creates conflicting collision surfaces. The previous
Jakarta loader is preserved at
`https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/monza/releases/4447cb8412ac63b3a4d0/loader.lua`.

The original Jawa Timur release remains available at
`https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/monza/releases/7a70765183a5d1624b7e/loader.lua`.

## Local executor package

Extract `monza-track-executor.zip` into the executor workspace, including its
`MonzaTrack` folder, then paste `monza-run.lua`. It loads the separate plan file.

## Sources and practical limits

The database CSV supplies the horizontal route and road widths. Named GLB
surfaces supply elevation, banking, pit route, kerb colours, gravel and astroturf.
The model's outer two-degree display tilt is removed, with its native terrain
retained. Small centreline adjustments align the CSV with the model surface.
Banking is smoothed and capped at six degrees. Height and banking filters use
physical distance with five-sigma support, preventing uneven sample density
from creating new ripples. Plates share endpoint heights, use accurate rotation
axes, and subdivide when pitch variation or top-plane error is too large.
Kerbs use a custom 0–0.12 stud
ramp over 3.2 studs, with 12-stud end tapers. Tall sausage kerbs are omitted.
Runoff fills narrow grass slivers and merges compatible patches.
The core pit route follows the model; short sideways end connectors are replaced
by gradual curves tangent to the circuit and pit straight.

The supplied Assetto Corsa extension lacks `monza.kn5` and other base files.
It is not used as a complete 2026 track reconstruction. This is a GLB-based
adaptation, not survey geometry. Rectangular pieces retain small overlaps and
angular perimeter edges. Offline geometry and mocked runtime checks cannot
establish actual vehicle handling or the live server's acceptance of the build.
The Jakarta client-contract evidence and its source hashes are recorded in
`source/jakarta-target.json`. Live Others75 availability, Plus access and saving
the full build still need verification in Jakarta.

## Generate and validate

No npm dependencies are needed. The frozen references permit generation without
the large model or extension:

```powershell
node compile-monza.mjs
node --test test-monza.mjs
node analyze-build.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File test-builder.ps1 -HttpLoader loader.lua
node prepare-publish.mjs
```

To regenerate source traces from the original GLB, first run
`powershell -NoProfile -File prepare-textures.ps1`, then `node reference.mjs` and
`node extract-surfaces.mjs`. The texture conversion uses Windows System.Drawing.
The Lua mock tests use the existing VLC Lua DLL; set `-LuaLibrary` if needed.

`prepare-publish.mjs` packages this Monza directory and refreshes its release.
Commit and push from the repository root. Large source assets and AC extension files are not
included in that publishing package. See `THIRD-PARTY.txt` for source attribution.
