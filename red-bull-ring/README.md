# Red Bull Ring with elevation and terrain

A separate Jakarta builder using the supplied Red Bull Ring GLB and the
racetrack-database Spielberg route. It includes the GP circuit, pit lane,
low kerbs, edge markings, simplified runoff/gravel and grass slopes.
For an empty starting area beside the pit, use the separate
[clear-start version](clear-start/README.md).

**9,629 placed parts; 9,630 with one existing grass plate.** Other objects in
the server add to that total. Terrain accounts for 3,174 parts. The layout is
1.5 times larger than the original build, with 254.62 studs of elevation
change. Main-road widths retain the original 40-stud minimum; the pit is
12 studs wide for a single car.

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/loader.lua"))()
```

Join Jakarta, enable build tools, and stand outside your vehicle on the grass
plate. **Inspect**, then **Preview**, then **Build / Resume**. Your standing
position maps horizontally to the pit-straight anchor; the foundation rests
near the grass datum. Preview the full footprint before starting. Appearance
controls use the game's Build Tools Plus access. Asphalt uses Others75 with
the requested dark gray color and its live material/variant.

The runtime global is `_G.RedBullRingBuilder`. Its panel, preview folder,
executor directory (`RedBullRing`) and checkpoints are independent of the
Monza and Sepang versions. Existing builds and scripts are preserved. Pause
another circuit builder before publishing this circuit into the same server.

Pause and wait for any in-flight placement to finish before exporting progress:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/loader.lua"))("checkpoint")
```

Save the partial build through Jakarta's slot UI before leaving. After loading
that slot, restore the matching checkpoint with:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/loader.lua"))("resume")
```

This revised surface layout needs a **fresh build**. Earlier checkpoints cannot
resume into this geometry. The original 4,886-part loader remains available
at `releases/56bae26afe425fba3fff/loader.lua`, and the previous 9,128-part
loader remains at `releases/a26d5cdb3c798f02bae5/loader.lua` for existing builds.
The corrected 9,120-part pit version remains at
`releases/28512ec3da8a3bb5d8d0/loader.lua`.
The preceding 9,629-part surface version remains at
`releases/5621c5d15b709af33602/loader.lua` for its existing builds.

Checkpoints use `red-bull-ring-jakarta-checkpoint.json`. The loader pins its
assets under a content-derived release directory. Keep the pinned loader for
an existing build if regenerating changes the geometry. The `"diagnose"` mode
reports placement/count observations without sending placements.

## Road and terrain choices

The road fitter uses small rectangles that cover the sampled lane boundaries,
with a 0.006-stud guard instead of extra angle-based padding. Necessary
overlaps remain at bends. All checked asphalt/pit overlap heights stay below
0.01 studs; neighbouring road and pit joints stay below 0.008 studs.
Main-road pitch changes stay below 0.084 degrees, and pit pitch changes stay
below 0.131 degrees. Paint is noncolliding.

The pit uses the longer inner entry from the GLB. Its entry now begins inside
the racing asphalt. One fitted line follows the native pit straight and
continues through the former sideways jog, retaining steady separation from
the racing straight. The exit uses one rounded L turn with a 90-stud radius
and merges into the racing lane. Both connections are checked across the
full car width for asphalt coverage and a surface step below 0.01 studs.
The frozen model reference remains available separately from this adjusted
drivable layout.

The final surface pass recovers 15 continuous kerb runs from dedicated model
geometry, including the previously sparse stretch between Turns 9 and 10.
Red/white stripes follow physical distance, with ramps at the ends of each
run. Kerbs pass 31,248 coverage samples across their width. Height fitting
protects the actual left/right lane edges while keeping the raised red/white
body above the asphalt. Rectangular road pieces can extend beyond these lane
edges on bends; their spare corners no longer lower the entire kerb strip.
A separate height audit checks 19,954 body samples against the road, excluding
the inner transition and tapered run ends, and rejects buried strips. The
lowest checked body clearance is 0.036 studs. The full
driving-corridor collision check still rejects raised layers inside the lane.

Broad runoff aprons now cover Turns 1, 3, 9 and 10. They use the model's
pavement and overlay footprints with simplified white/grey surfaces. Small
detached apron fragments are omitted. The marked straight-edge and scattered
sand patches are removed, freeing 250 parts; substantial middle-sector gravel
traps remain. This pass has 583 kerb parts, 669 runoff parts and 207 gravel
parts, while preserving the preceding racing-road and pit geometry.

World surface gradients are smoothed and tight bends receive shared planar
gradients. This changes local source heights by up to 38.42 studs while
preserving the overall elevation range and horizontal layout. It is an
approximation intended for the block builder. Live suspension/tyre behavior
has not been measured.

Grass uses narrow fitted strips beside the road, wider smoothed slopes out
to 250 studs and an outer taper out to 500 studs. Inside bends limit their
offsets to avoid folded slopes. World-space fitting prevents vertical fins.
Open areas use broad 256–1024-stud planar blocks over a level tiled
foundation. Every grass solid extends down to that foundation; its footprint
covers the complete terrain. Rectangular borders and some terrace seams
remain visible. Buried solid corners can extend below the foundation datum.
Every grass top and full solid is checked beneath the track geometry. Model tyre-mark
overlays and isolated surface fragments are omitted; buildings, grandstands,
trees, fences and other scenery are excluded.

The full build passes 381,822 lane coverage/collision samples and exact
rotated-box terrain intersection checks. Offline runtime tests cover placement
confirmation, count repair, preview, pause/resume, checkpoint validation and
HTTP failures. **Live driving and Jakarta slot saving still require testing.**
The local 10,000-object guard is a project budget; the server save cap remains
unknown, and a verified part count does not establish successful saving.
The renewed save investigation and read-only observer are in
[save-debug](save-debug/README.md), including a comparison with Monza's pit.

Open [the interactive viewer](red-bull-ring-3d-viewer.html) to inspect the
terrain, or see [the complete preview](build-3d.png),
[the corrected pit exit](build-pit-exit.png),
[the straight pit lane](build-pit-lane.png),
[Turn 1](build-turn-1.png), [Turn 3](build-turn-3.png),
[Turn 9](build-turn-9.png), [Turn 10](build-turn-10.png),
[a low-angle terrain view](build-terrain-middle.png),
[the road joint closeup](build-road-joint.png) and
[the elevation profile](elevation-profile.svg).
See [the corrected kerb closeup](build-kerb-height-fix.png) for the inside
Turn 9 shoulder that was previously buried under an extended road rectangle.

## Regenerate and check

From this directory:

```powershell
npm run publish:prepare
npm test
npm run test:lua
```

Generation consumes the frozen numeric references in `source/`; it does not
need the original GLB. To re-extract those references, place the original
model at `source/redbullring.glb`, then run `node reference.mjs` and
`node extract-features.mjs` before regenerating. Source attribution and its
license are in [THIRD-PARTY.txt](THIRD-PARTY.txt) and `source/LICENSE`.

For local executor loading, copy the builder, plan, checkpoint and diagnostic
helpers into its `RedBullRing/` directory, and run `red-bull-ring-run.lua`.
