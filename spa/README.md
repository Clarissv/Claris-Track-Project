# Spa-Francorchamps

Spa uses the supplied GLB for elevation, ground, paved/gravel run-off and
barrier references, aligned to the unmodified TUM Spa centreline CSV. The lap
is about 7,008 metres. The vehicle conversion is 2.68845 studs per metre, with
an additional layout multiplier of **1**. The racing road is at least 40 studs
wide and the pit lane is 18 studs wide.

The pit follows the user's yellow route: entry at the final chicane, around
La Source, then a tangent merge just afterward. Its final arc has a 70-stud
radius. Both coordinates use the same smoothing parameter to avoid small
steering kinks before the arc.

Grey paved run-off at Eau Rouge and pale uphill aprons come from the GLB.
Pavement and gravel are integrated into fitted recovery surfaces, extending
across the apron and beyond its perimeter. This avoids separate overlapping
slabs that could create collision lips. Broad outer terrain remains approximate;
buildings, trees, spectator furniture and service roads are excluded.

Barriers follow tidied GLB paths and openings. The former steel runs use long
grey resizable Others68 concrete parts, and concrete runs retain the native
Others68 appearance. Unsafe source fragments are moved or omitted. Barrier
fitting keeps the pit route and recovery areas clear.

The final counts, hashes and sampled surface audits are in
[generation-report.json](generation-report.json) and
[barrier-plan.json](barriers/barrier-plan.json). The complete build must stay
below **9,500 objects, including the original grass plate**.

## Build from zero

Join Jakarta, enable Build Tools, and stand outside the car on the original
grass in a fresh server build. Run as the server owner with Others75 and
Others68 available in the catalog and appearance controls accessible.

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/spa/build-all.lua"))(3)
```

This builds the road and terrain, confirms a stage save, adds the barriers,
then confirms the completed save in slot **3**. Slot 3 is overwritten.
Placement and saves are checked; uncertain placements stop for review.
Use the build panel to pause or resume in the same session.

The loader pins the matching road and barrier releases. Load the updated
GitHub files before running it. Do not use a road-only loader for the full
build. Geometry and mocked runtime tests cannot establish live vehicle
handling, server save limits or network reliability; drive the exit and
Eau Rouge in game after the build.

## Reproduce and check

From the repository root:

```powershell
node spa/extract-source.mjs
node spa/compile.mjs
node spa/prepare-runtime.mjs
node spa/make-package.mjs
node spa/barriers/generate.mjs
node spa/prepare-runtime.mjs
node spa/barriers/make-package.mjs
npm.cmd test
npm.cmd run test:lua
```

The GLB stays outside the repository at the path described in
[source/README.md](source/README.md). After a full compile,
`node spa/compile.mjs --reuse-driving` reuses the validated graded racing
surface while rebuilding the pit, features and terrain. Packages are hashed
and must be regenerated together when geometry or runtime code changes.

Previews: [whole circuit](build-topdown.png), [3D](build-3d.png),
[pit exit](build-pit-exit.png), [Eau Rouge](build-eau-rouge.png).
