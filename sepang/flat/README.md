# Flat Sepang

This is a separate racing variant of Sepang. The original banked and elevated project and its root GitHub loader remain unchanged.

The current build has **9,044 parts**: 3,000 asphalt slabs, 2,487 low kerb pieces, 807 runoff pieces, 1,545 white edge-marking pieces, 832 pit-lane/wall/marking and start/finish pieces, and a 373-part ground banner. The footprint including runoff and the banner is about **3,461 x 2,828 studs**, with the same **46-56-stud roads** and **22.6-stud pit lane**. Open [the interactive preview](sepang-3d-viewer.html) before placing it.

The main asphalt and pit lane use the game's **Others75** catalog tile, recoloured to the previous asphalt grey **RGB 65, 66, 66**. The tile's live Concrete material and material variant are preserved. Catalog inspection requires Others75 to be an accessible plain rectangular Part; there is no automatic substitute if it is missing or changes shape. Markings, kerbs, runoff and the banner retain the standard plain-block catalog.

The **pit-entry connection** now continues from the middle of the final hairpin at the user-confirmed entrance point. It follows the model's outer curve, then takes a shorter approach into the pit straight at the confirmed point beside the former spawn rectangle. The approach is about **677 studs long**. The grey rectangle is removed and the pit straight now begins at the standing anchor; its first slab is trimmed at that exact point. The remainder of the straight and pit exit retain their footprints. Entry wall/marking segments are replaced or clipped so they do not obstruct the route. [See the new entry](build-pit-entry.png).

One **128 x 72-stud Bluenight banner** lies flat on the grass inside the corner in the supplied reference, readable from the main-grandstand side. Its full footprint clears the road, kerbs and runoff by at least 24 studs. Its navy background, white lettering and grey/white logo are reconstructed from the supplied image using merged blocks at a 320 x 180 sampling resolution. The backing is 0.015 studs above the grass and the lettering reaches 0.04 studs above the grass. The horizontal banner uses 373 parts. [See the artwork](build-banner-front.png) and [its position](build-banner-location.png).

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/sepang/flat/loader.lua"))()
```

Stand outside your vehicle on the grass where you want the **pit straight to start**, for example at your existing spawn. Inspect the catalog, then preview before clicking Build / Resume. **Your standing position anchors the junction between the shortened approach and the pit straight.** The red marker in the preview shows this point; it is not a saved or placed part. [See the marked starting area](build-start-point.png). Choose an area clear of existing builds; placing the revised layout does not remove already placed objects. The game spawn itself is not moved.

The anchor freezes at first preview/build, so stand in the chosen spot before previewing. Yaw and additional scale rotate/scale the circuit around that point. Set `Config.StartAt="center"` before the first preview if you want the previous centre-based placement. Explicit `Config.Origin` still sets the plan origin directly. Checkpoint resume restores the captured original transform, including builds made before this anchor update.

The main asphalt, pit lane and runoff have no banking or elevation. The asphalt and pit-lane top surfaces remain **0.25 studs above the grass**. Runoff sits only 0.004-0.008 studs below the asphalt, preventing surface flicker where it overlaps the road or kerbs. Slab thickness extends below the platform top. The circuit retains the original 2x layout and widened main road and pit lane; keep additional Config.Scale at 1. GroundY can override the detected grass height before first preview/build. Config.GroundClearance adjusts the slight lift. Explicit Origin refers to the asphalt surface.

Red-and-white kerb locations and stripe colours now come from the supplied model, adjusted to the wider flat road. They remain actual low ramps rising to **0.12 studs** across their 3.2-stud width, with 12-stud end tapers along their own path. Folded offsets on tight inside bends are split and tapered. The measured maximum kerb seam height difference is **under 0.011 studs**, and asphalt joins have zero height difference. [See the kerb detail](build-kerb-detail.png).

Gravel traps and the broad red/white/yellow/blue runoff bands follow the model with tidied boundaries. The inner bands reach the road or kerb edge, inter-band grass slivers are filled, and isolated fragments are removed. Compatible sections use larger slabs, while tight bends keep smaller pieces. There are 807 runoff pieces and 1,545 white edge-marking pieces. The former grey standing apron is omitted. These are model-derived adaptations; [see the source and cleanup notes](surface-reference.md). Paint sits 0.004 studs above the road. Rectangular outer edges remain, and driving with the actual vehicles needs in-game verification.

The project uses an 11,000-part budget and the game runtime checks the 20,000-object server cap including existing objects. Character follow, placement confirmation and bounded waits are retained. Loading this version uses a separate builder panel and does not unload the elevated Sepang builder. Pause that builder before starting the flat build.

Use `"checkpoint"`, `"resume"`, or `"diagnose"` as a launcher argument when needed. The checkpoint is `sepang-flat-checkpoint.json`; local packages use `SepangFlat/sepang-flat-checkpoint.json`. It is separate from elevated Sepang checkpoints and requires the exact matching plan. A checkpoint saves position/progress, not the game objects. Save through the game's build-slot UI and verify success before rejoining or loading another save. The flat geometry does not fix a server save failure.

For local execution, extract `sepang-ribbons-executor.zip` into the executor workspace and run `loadfile("SepangFlat/sepang-builder.lua")()`.

Run `npm.cmd run generate` to regenerate from the included frozen layout, surface/pit traces, banner placement and Bluenight image; no GLB or network download is needed. Run `npm.cmd run trace -- "path/to/sepang.glb"` or `node extract-features.mjs "path/to/sepang.glb"` only when re-extracting from the original model. The TUM CSV and LGPL licence are in `source/`. Run `npm.cmd test` and `npm.cmd run test:lua` for geometry and runtime checks. The native Lua test runner uses an existing VLC Lua DLL on Windows.

