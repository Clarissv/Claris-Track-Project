# Flat Sepang

This is a separate racing variant of Sepang. The original banked and elevated project and its root GitHub loader remain unchanged.

The current build has **8,354 parts**, down from 9,414: 3,000 asphalt slabs, 2,487 low kerb pieces, 811 runoff/apron pieces and 1,545 white edge-marking pieces, plus the pit lane and its accessories. The footprint including broader runoff is about **3,461 x 2,828 studs**, with the same **46-56-stud roads** and **22.6-stud pit lane**. Open [the interactive preview](sepang-3d-viewer.html) before placing it.

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Sepang/main/flat/loader.lua"))()
```

Stand outside your vehicle on the grass where you want the grey apron beside pit entry to be, for example around your existing spawn. Inspect the catalog, then preview before clicking Build / Resume. **Your standing position now anchors the pit-entry apron**, rather than the circuit centre. The red marker in the preview shows this point; it is not a saved or placed part. [See the marked starting area](build-start-point.png). Choose an area clear of the original track; placing new objects does not remove existing ones. The game spawn itself is not moved.

The anchor freezes at first preview/build, so stand in the chosen spot before previewing. Yaw and additional scale rotate/scale the circuit around that point. Set `Config.StartAt="center"` before the first preview if you want the previous centre-based placement. Explicit `Config.Origin` still sets the plan origin directly. Checkpoint resume restores the captured original transform, including builds made before this anchor update.

The main asphalt, pit lane and runoff have no banking or elevation. The asphalt and pit-lane top surfaces remain **0.25 studs above the grass**. Runoff sits only 0.004-0.008 studs below the asphalt, preventing surface flicker where it overlaps the road or kerbs. Slab thickness extends below the platform top. The circuit retains the original 2x layout and widened main road and pit lane; keep additional Config.Scale at 1. GroundY can override the detected grass height before first preview/build. Config.GroundClearance adjusts the slight lift. Explicit Origin refers to the asphalt surface.

Red-and-white kerb locations and stripe colours now come from the supplied model, adjusted to the wider flat road. They remain actual low ramps rising to **0.12 studs** across their 3.2-stud width, with 12-stud end tapers along their own path. Folded offsets on tight inside bends are split and tapered. The measured maximum kerb seam height difference is **under 0.011 studs**, and asphalt joins have zero height difference. [See the kerb detail](build-kerb-detail.png).

Gravel traps and the broad red/white/yellow/blue runoff bands follow the model with tidied boundaries. The inner bands now reach the road or kerb edge, inter-band grass slivers are filled, and isolated fragments are removed. Compatible sections use larger slabs, while tight bends keep smaller pieces. Runoff/apron pieces fell from 1,149 to 811 and white edge markings from 2,267 to 1,545. The original pit-entry apron remains the standing anchor. These are model-derived adaptations; [see the source and cleanup notes](surface-reference.md). Paint sits 0.004 studs above the road. Rectangular outer edges remain, and driving with the actual vehicles needs in-game verification.

The project uses an 11,000-part budget and the game runtime checks the 20,000-object server cap including existing objects. Character follow, placement confirmation and bounded waits are retained. Loading this version uses a separate builder panel and does not unload the elevated Sepang builder. Pause that builder before starting the flat build.

Use `"checkpoint"`, `"resume"`, or `"diagnose"` as a launcher argument when needed. The checkpoint is `sepang-flat-checkpoint.json`; local packages use `SepangFlat/sepang-flat-checkpoint.json`. It is separate from elevated Sepang checkpoints and requires the exact matching plan. A checkpoint saves position/progress, not the game objects. Save through the game's build-slot UI and verify success before rejoining or loading another save. The flat geometry does not fix a server save failure.

For local execution, extract `sepang-ribbons-executor.zip` into the executor workspace and run `loadfile("SepangFlat/sepang-builder.lua")()`.

Run `npm.cmd run generate` to regenerate from the included frozen layout and surface trace; no GLB or network download is needed. Run `npm.cmd run trace -- "path/to/sepang.glb"` only when re-extracting from the original model. The TUM CSV and LGPL licence are in `source/`. Run `npm.cmd test` and `npm.cmd run test:lua` for geometry and runtime checks. The native Lua test runner uses an existing VLC Lua DLL on Windows.

