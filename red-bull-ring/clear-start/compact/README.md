# Red Bull Ring with connected ramps and compact terrain

**5,138 placed Parts; 5,139 including the original grass plate.** The
[complete automatic build](barriers/README.md) adds 207 concrete barriers for
**5,346 total Parts**, autosaving to slot 3. This is 3,041 fewer total Parts than
the preceding complete build.

Road slabs now follow connected sloped planes, based on the long flush ramp in
the user's reference. Gradient changes meet along a road cross-section, with
tight corners sharing one plane. Changes are limited and the elevation profile
closes at the finish line. Straight ramp sections target 40 studs; curved
sections still split to preserve the original horizontal racing layout.
Asphalt uses **1,040 Parts instead of 2,687**, with median slab length **9.30
studs instead of 5.06**. Compatible runoff and recovery terrain also need fewer
pieces.

The full 250.72-stud elevation range, vehicle scale, minimum 40-stud road width,
18-stud pit lane and at least 25 studs of pit building space are retained.
Individual road heights change by up to about 72.28 studs from the preceding
compact road as slopes become more gradual. The pit keeps its single entry
curve and 110-stud-radius exit. Its checked building gap is 25.50 to 32.00
studs. The empty 400 x 400 starting square retains its centre and pit alignment.

## Surface checks

Racing-road overlap seams have a maximum height difference of **0.000451
studs** across their full overlap, with at most **0.055 degrees** of pitch
change. Pit seams remain below 0.00477 studs. A geometric chassis check with a
16-stud wheelbase and four studs of overhang finds maximum rises of **0.00385
studs under the wheelbase** and **0.00540 under the nose/tail**, down from
0.01193 and 0.01701 in the preceding complete base.

Grass follows the road plane for at least 48 studs on both sides and the pit
for 24 studs. Recovery areas widen across the complete retained runoff/gravel
aprons and extend at least 16 studs beyond their outer edges. The 169 runoff
and 192 gravel pieces are refitted to the new elevations. Farther slopes blend
toward the source ground and retain broad planar joins and terraces.

More than 2.6 million main-road, runoff and pit recovery samples have no missing
coverage. The largest checked change over one stud is 0.228 studs, including
kerbs. Maximum drops below the road plane are 0.084 studs beside the main road,
0.084 across runoff, and 0.085 beside the pit. Buried terrain overlaps road
solids while its top remains beneath the driving surface.

The builder also checks actual replicated road Parts more closely: position
and size errors must stay within 0.005 studs at default scale, axis-vector
errors within 0.00005, and the road top within 0.008 studs at all four requested
corners. Larger errors stop confirmation without resending an uncertain
placement. `_G.RedBullRingClearStartCompactBuilder.SurfaceReport()` returns
measurement maxima for road confirmations in the current session.

These are geometry and mocked runtime checks. Live suspension, tyre grip and
save/reload still need a driving session.

[Preview](build-3d.png) · [Road joint](build-road-joint.png) ·
[Starting area](build-domain.png) · [Interactive viewer](red-bull-ring-3d-viewer.html)

## Push and build everything

```powershell
cd "F:\VSCode\Luau\Claris Track Project"
git add -- README.md red-bull-ring/compile-track.mjs red-bull-ring/geometry.mjs red-bull-ring/road-geometry.mjs red-bull-ring/graded-surface.mjs red-bull-ring/clear-start/compact
git commit -m "Smooth Red Bull Ring with connected ramps and refitted recovery terrain"
git push origin main
```

Start a **fresh Jakarta build containing only the original grass plate**,
enable Build Tools, step out of the car and stand where the clear area's centre
should be. Run as server owner with Build Tools Plus access:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/compact/build-all.lua"))(3)
```

This automatically builds road and terrain, confirms the base slot save, adds
the barriers and confirms the final **5,346-object save**. Autosaves overwrite
slot 3, using the shared 31-second cooldown. Each stage provides Pause and
Build / Resume. The road stage hands off to barriers only after its save
succeeds. Both stages use immutable pinned releases.

## Existing builds

This changes geometry and requires a fresh build. Loading the panel does not
delete an old build. Existing checkpoints must use their matching releases:
the preceding [8,174-object base](releases/f78205c653c1bc354f82/loader.lua),
[8,618-object smooth-shoulder base](releases/f275f4b14568e3c8fa70/loader.lua),
and [8,937-object original compact base](releases/d2840d8a3fc35727fc0c/loader.lua)
remain unchanged.

The separate `loader.lua` supports the base alone and its autosave, resume,
checkpoint and diagnostic modes. Compact retains
`_G.RedBullRingClearStartCompactBuilder`, the `RedBullRingClearStartCompact`
executor folder and `red-bull-ring-clear-start-compact-jakarta-checkpoint.json`.
The base guard rejects builds reaching 9,000 total objects; the full build
guard rejects 9,500. Use the barrier panel for saves after adding barriers so
the full object count is verified.

## Regenerate and check

In this directory run `npm.cmd run generate`, then `npm.cmd run package`.
In `barriers`, run `node generate.mjs`, `node prepare-runtime.mjs`, then
`node make-package.mjs` to refit and pin the barrier stage to the new base.

From the repository root run `npm.cmd test` and `npm.cmd run test:lua`.
Checks cover the preserved horizontal layout, full-width seams, chassis
clearance, pit openings/gap, recovery coverage, terrain clearance, starting
square, barrier grounding, placement accuracy, streaming reconciliation,
checkpoints, autosaves and release hashes.

Source attribution remains in [THIRD-PARTY.txt](../../THIRD-PARTY.txt).
