# Flat Sepang

This is a separate racing variant of Sepang. The original banked and elevated project and its root GitHub loader remain unchanged.

The current build has **10,336 parts**: 3,000 asphalt slabs and 3,003 low kerb pieces, plus edge paint, runoff and the approximate pit lane. The footprint remains about **3,229 x 2,668 studs**, with **46–56-stud roads** and a **22.6-stud pit lane**. Open [the interactive preview](sepang-3d-viewer.html) before placing it.

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Sepang/main/flat/loader.lua"))()
```

Stand outside your vehicle on a clear part of the grass plate, inspect the catalog, then preview before clicking Build / Resume. The preview places the circuit centre beneath your starting position. Choose an area clear of the original track; placing new objects does not remove existing ones.

The main asphalt, pit lane and runoff have no banking or elevation. Their top surfaces share one horizontal plane, 0.02 studs above the grass to prevent surface flicker. Slab thickness extends below the platform top. The circuit retains the original 2x layout and widened main road and pit lane; keep additional Config.Scale at 1. GroundY can override the detected grass height before first preview/build. Explicit Origin refers to the asphalt surface.

Red-and-white kerbs are actual low ramps. They rise gradually to **0.12 studs** across their 3.2-stud width and taper to road level over 12 studs of their own path at each end. Folded offsets on tight inside bends are split and tapered. The measured maximum kerb seam height difference is **under 0.011 studs**, and asphalt joins have zero height difference. Paint sits only 0.004 studs above the road to remain visible. Rectangular outside edges and small overlaps remain; live driving needs verification with the actual vehicles.

The project uses an 11,000-part budget and the game runtime checks the 20,000-object server cap including existing objects. Character follow, placement confirmation and bounded waits are retained. Loading this version uses a separate builder panel and does not unload the elevated Sepang builder. Pause that builder before starting the flat build.

Use `"checkpoint"`, `"resume"`, or `"diagnose"` as a launcher argument when needed. The checkpoint is `sepang-flat-checkpoint.json`; local packages use `SepangFlat/sepang-flat-checkpoint.json`. It is separate from elevated Sepang checkpoints and requires the exact matching plan. A checkpoint saves position/progress, not the game objects. Save through the game's build-slot UI and verify success before rejoining or loading another save. The flat geometry does not fix a server save failure.

For local execution, extract `sepang-ribbons-executor.zip` into the executor workspace and run `loadfile("SepangFlat/sepang-builder.lua")()`.

Run `npm.cmd run generate` to regenerate from `source/sepang-reference.json`. The frozen reference preserves the horizontal layout, widths and auxiliary geometry of the original Sepang plan; no GLB or network download is needed. The TUM CSV and LGPL licence are in `source/`. Run `npm.cmd test` and `npm.cmd run test:lua` for geometry and runtime checks. The native Lua test runner uses an existing VLC Lua DLL on Windows.
