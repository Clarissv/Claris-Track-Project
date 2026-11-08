# Monza with elevation

Separate Monza build for **Jakarta (place 14005966837)**. Includes the F1 circuit, pit lane, markings,
low ramped kerbs, astroturf and gravel. Buildings and stands are left for manual
construction. Existing Sepang variants are preserved.

**10,278 parts**, about **3,516 × 6,694 studs**, with **40–42-stud roads** and a
**32-stud pit lane**. Track elevation varies by about 68.7 studs.

The Jakarta migration preserves every track part and its elevation. It updates
the runtime's target map, server-count checks and checkpoints. The exported
Jakarta client uses the same catalog and placement payload as Jawa Timur.
You confirmed that Jakarta saves builds above 10,000 objects. Its server-side
save handler was not exported, so the exact maximum is still unknown.
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
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Sepang/main/monza/loader.lua"))()
```

Join Jakarta and enable the game's build tools. Stand on the grass where you want the pit
straight to be, inspect the catalog, preview, then Build. This script opens the
panel without placing parts. The standing point fixes horizontal pit position;
the elevated pit road is about 16 studs above that grass at the default anchor.
The lowest represented surface clears your grass by 0.25 studs. Set
`_G.MonzaBuilder.Config.YawDegrees` before the first preview/build to rotate it.

Asphalt uses Others75, recoloured RGB 65,66,66 while retaining the tile's live
material/variant. Other surfaces use a plain rectangular block from the catalog.
Build Tools Plus is required for appearance controls. Your character follows
placement to keep distant pieces streamed, then returns when paused or finished.
Placement is confirmed against the server's objects; uncertain placements stop
without resending duplicates.

Use Pause to suspend and Build/Resume to continue in the same server. Save the
completed map through the game's build-slot UI.

For diagnostics:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Sepang/main/monza/loader.lua"))("diagnose")
```

Before leaving a paused build, export a checkpoint (requires `writefile`) and
save the partial build using the game's UI:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Sepang/main/monza/loader.lua"))("checkpoint")
```

Restore the saved Jakarta game build before loading with `"resume"`. Checkpoints
are specific to the geometry, map and release. Monza uses `_G.MonzaBuilder` and
`monza-jakarta-checkpoint.json`, separately from both Sepang variants and the old
Jawa Timur Monza checkpoint. Start a fresh build in Jakarta; a Jawa Timur
checkpoint cannot restore the objects stored in Jakarta's separate save slots.
The original Jawa Timur release remains available at
`https://raw.githubusercontent.com/Clarissv/Sepang/main/monza/releases/7a70765183a5d1624b7e/loader.lua`.

## Local executor package

Extract `monza-track-executor.zip` into the executor workspace, including its
`MonzaTrack` folder, then paste `monza-run.lua`. It loads the separate plan file.

## Sources and practical limits

The database CSV supplies the horizontal route and road widths. Named GLB
surfaces supply elevation, banking, pit route, kerb colours, gravel and astroturf.
The model's outer two-degree display tilt is removed, with its native terrain
retained. Small centreline adjustments align the CSV with the model surface.
Banking is smoothed and capped at six degrees. Kerbs use a custom 0–0.12 stud
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
powershell -NoProfile -ExecutionPolicy Bypass -File test-builder.ps1 -HttpLoader loader.lua
node prepare-publish.mjs
```

To regenerate source traces from the original GLB, first run
`powershell -NoProfile -File prepare-textures.ps1`, then `node reference.mjs` and
`node extract-surfaces.mjs`. The texture conversion uses Windows System.Drawing.
The Lua mock tests use the existing VLC Lua DLL; set `-LuaLibrary` if needed.

`prepare-publish.mjs` copies only the Monza package into `../Sepang Publish/monza`.
It does not commit or push. Large source assets and AC extension files are not
included in that publishing package. See `THIRD-PARTY.txt` for source attribution.
