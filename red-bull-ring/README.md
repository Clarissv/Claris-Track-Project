# Red Bull Ring with elevation and terrain

A separate Jakarta builder using the supplied Red Bull Ring GLB and the
racetrack-database Spielberg route. It includes the GP circuit, pit lane,
low kerbs, edge markings, simplified runoff/gravel and grass slopes.

**4,886 placed parts; 4,887 with one existing grass plate.** Other objects in
the server add to that total. Terrain accounts for 981 parts. The circuit
retains 169.74 studs of elevation change at the accepted vehicle scale.

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

Checkpoints use `red-bull-ring-jakarta-checkpoint.json`. The loader pins its
assets under a content-derived release directory. Keep the pinned loader for
an existing build if regenerating changes the geometry. The `"diagnose"` mode
reports placement/count observations without sending placements.

## Road and terrain choices

The road fitter uses small rectangles that cover the sampled lane boundaries,
with a 0.006-stud guard instead of extra angle-based padding. Necessary
overlaps remain at bends. All checked asphalt/pit overlap heights stay below
0.015 studs; neighbouring main-road pitch changes stay below 0.14 degrees.
The pit connection reaches about 0.42 degrees. Paint is noncolliding.

World surface gradients are smoothed and tight bends receive shared planar
gradients. This changes local source heights by up to 25.61 studs while
preserving the overall elevation range and horizontal layout. It is an
approximation intended for the block builder. Live suspension/tyre behavior
has not been measured.

Grass uses narrow fitted strips beside the road and wider smoothed slopes
out to 250 studs. Open areas use broad 256–1024-stud planar blocks over a
tiled foundation. Rectangular borders and some outer terrace seams remain.
Buried solid corners may extend below the foundation datum. Every grass
top and full solid is checked beneath the track geometry. Model tyre-mark
overlays and isolated surface fragments are omitted; buildings, grandstands,
trees, fences and other scenery are excluded.

The full build passes 209,482 lane coverage/collision samples and exact
rotated-box terrain intersection checks. Offline runtime tests cover placement
confirmation, count repair, preview, pause/resume, checkpoint validation and
HTTP failures. **Live driving and Jakarta slot saving still require testing.**
The local 10,000-object guard is a project budget; the server save cap remains
unknown, and a verified part count does not establish successful saving.

Open [the interactive viewer](red-bull-ring-3d-viewer.html) to inspect the
terrain, or see [the complete preview](build-3d.png),
[the road joint closeup](build-road-joint.png) and
[the elevation profile](elevation-profile.svg).

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
