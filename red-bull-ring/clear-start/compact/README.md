# Red Bull Ring with compact terrain

**8,173 placed parts; 8,174 total with one existing grass plate.** This pit and
road revision uses **444 fewer parts** than the preceding smooth compact
version, and 1,330 fewer than the original clear-start build. The horizontal
racing layout, vehicle scale and clear starting position are preserved.

The pit lane is **18 studs wide**, with a checked building gap of
**25.50?32.00 studs**. One tangent-matched entry curve joins a continuous
straight; one 110-stud-radius turn leaves it. The small sideways bends at both
ends are removed. The pit shares the racing corner's plane through its exit,
and grass follows its whole route for 24 studs on both sides. The empty
400?400 starting square is aligned with the pit straight, keeping its original
centre. Kerbs are clipped at the pit openings and adjacent clipping cells are
merged to avoid unnecessary pieces.

The road's height and banking are smoothed over longer distances while
retaining 250.72 studs of elevation change. Asphalt uses 2,687 pieces instead
of 3,181. Neighbouring racing-road joints stay below 0.006 studs and 0.061
degrees of pitch change. Pit joints stay below 0.006 studs. A geometric chassis
check uses a 16-stud wheelbase with four studs of overhang at each end: the
largest rise under the wheelbase is below 0.012 studs, and under the nose/tail
below 0.018 studs. These checks cannot establish live suspension behaviour.
The 635 runoff and 197 gravel pieces follow the revised road height.

Grass follows the road's height and crossfall for at least 48 studs on both
sides, even through tight bends. This flat recovery area widens across the
complete runoff/gravel aprons and extends at least 16 studs past their outer
edges. Pieces split where their height fit needs it. Farther slopes blend
toward the source ground; broad outer terrain uses longer fitted pieces. The
400 x 400-stud starting area remains clear through the terrain and foundation.
Outer terrain is less detailed and retains visible planar joins and terraces.

Across more than two million samples, the largest checked surface change
over one stud is **0.290 studs**, including kerbs, compared with **28.493** in
the preceding compact shoulders. The maximum shoulder drop from the road's
plane is **0.243 studs**, compared with **29.398** before. Runoff checks extend
eight studs beyond every retained apron and have a maximum drop of **0.296**.
The full pit shoulder check has no uncovered samples and a maximum drop of
0.097 studs.
These are geometry checks; live suspension, tyre grip and save/reload still
need a driving session. Nearby grass shares buried volume with the road
while its complete upper surface stays below the driving top.

[Preview](build-3d.png) · [Starting area](build-domain.png) ·
[Interactive viewer](red-bull-ring-3d-viewer.html)

## Build and autosave to slot 3

Push the prepared files before using the new GitHub loader:

```powershell
cd "F:\VSCode\Luau\Claris Track Project"
git add -- README.md package.json test-project.mjs test-loaders.ps1 red-bull-ring/compile-track.mjs red-bull-ring/pit-layout.mjs red-bull-ring/track-tidy.mjs red-bull-ring/clear-start/domain.mjs red-bull-ring/clear-start/test-domain.mjs red-bull-ring/clear-start/compact
git commit -m "Simplify Red Bull Ring pit and fit GLB barriers"
git push origin main
```

Start a **fresh Jakarta build with only the original grass plate**, enable build tools, and
stand where you want the clear area's centre. Then run:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/compact/loader.lua"))("autosave", 3)
```

Use **Inspect**, **Preview**, then **Build / Resume**. This arms saves to your
chosen slot 3 without starting placement automatically. Each checkpoint
overwrites slot 3. Autosave pauses placement, waits 31 seconds after the prior
save finishes, saves every 500 objects and every 100 from 8,500, then saves the
complete **8,174-object** build. A failure or missing reply stops placement.

The paused 9,530-object build and its old checkpoints use different terrain.
Build this version in a fresh server; loading its panel alone does not delete
the old build. It rejects placement if existing objects plus the compact
remainder would reach 9,000 total objects. Additional placed objects consume
the 825-object margin beneath that target, so start with just the grass plate.

This update also needs a fresh build if you already built the preceding
compact geometry. The pinned [8,618-object smooth-shoulder loader](releases/f275f4b14568e3c8fa70/loader.lua)
and [8,937-object original compact loader](releases/d2840d8a3fc35727fc0c/loader.lua)
remain available for their existing checkpoints.

The original clear-start loader and releases remain available. Compact uses
`_G.RedBullRingClearStartCompactBuilder`, its own panel and executor folder
`RedBullRingClearStartCompact`, and the checkpoint
`red-bull-ring-clear-start-compact-jakarta-checkpoint.json`. Checkpoints must
match this geometry. It shares the save cooldown with other Red Bull Ring
scripts and blocks building while an existing circuit builder is active.

To print autosave results:

```lua
_G.RedBullRingClearStartCompactBuilder.AutoSaveReport()
```

This is a smaller-build workaround for the observed failure at 9,530. The
private server's actual storage limit remains unknown. A successful full save
and reload still need a live check; cached slot counts and dates alone cannot
confirm persistence.

## Regenerate and check

From this directory, after generating the original clear-start plan:

```powershell
npm.cmd run generate
npm.cmd run package
npm.cmd test
npm.cmd run test:lua
```

The generator reads the frozen track/feature/ground references and the original
clear-start opening. It retains the horizontal racing layout, regenerates the
smoother road and wider separated pit, refits runoff/gravel, adds recovery
shoulders along both roads, and carves the same starting area. It
rejects geometry protruding above the driving surfaces, an obstruction in the
starting area, shoulder/runoff steps or drops above 0.35 studs, and a complete
build reaching 9,000 objects.

Geometry checks cover road and kerb coverage, pit connections, full terrain
volumes, surface clearance, the building gap, chassis clearance, and complete
main-road, pit and runoff cross-sections.
Offline Lua checks cover placement, pause,
checkpoint recovery, independent builder state, total-object guards, slot
selection, shared cooldown and autosave outcomes. Root project checks include
this variant and its pinned release hashes.

Source attribution remains in the parent [THIRD-PARTY.txt](../../THIRD-PARTY.txt).
