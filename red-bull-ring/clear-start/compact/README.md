# Red Bull Ring with compact terrain

**8,617 placed parts; 8,618 total with one existing grass plate.** The smooth
shoulder update uses **319 fewer parts** than the preceding compact version,
and 1,006 fewer than the original clear-start build. The main road, pit lane,
kerbs, markings, elevation, scale and standing anchor are preserved exactly.
The 669 runoff and 207 gravel pieces are refitted to the road's height plane.

Grass follows the road's height and crossfall for at least 48 studs on both
sides, even through tight bends. This flat recovery area widens across the
complete runoff/gravel aprons and extends at least 16 studs past their outer
edges. Pieces split where their height fit needs it. Farther slopes blend
toward the source ground; broad outer terrain uses longer fitted pieces. The
400 x 400-stud starting area remains clear through the terrain and foundation.
Outer terrain is less detailed and retains visible planar joins and terraces.

Across more than two million samples, the largest checked surface change
over one stud is **0.320 studs**, including kerbs, compared with **28.493** in
the preceding compact shoulders. The maximum shoulder drop from the road's
plane is **0.253 studs**, compared with **29.398** before. Runoff checks extend
eight studs beyond every retained apron and have a maximum drop of **0.316**.
These are geometry checks; live suspension, tyre grip and save/reload still
need a driving session. Nearby grass shares buried volume with the road
while its complete upper surface stays below the driving top.

[Preview](build-3d.png) · [Starting area](build-domain.png) ·
[Interactive viewer](red-bull-ring-3d-viewer.html)

## Build and autosave to slot 3

Push the prepared files before using the new GitHub loader. Start a **fresh
Jakarta build with only the original grass plate**, enable build tools, and
stand where you want the clear area's centre. Then run:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/compact/loader.lua"))("autosave", 3)
```

Use **Inspect**, **Preview**, then **Build / Resume**. This arms saves to your
chosen slot 3 without starting placement automatically. Each checkpoint
overwrites slot 3. Autosave pauses placement, waits 31 seconds after the prior
save finishes, saves every 500 objects and every 100 from 8,500, then saves the
complete **8,618-object** build. A failure or missing reply stops placement.

The paused 9,530-object build and its old checkpoints use different terrain.
Build this version in a fresh server; loading its panel alone does not delete
the old build. It rejects placement if existing objects plus the compact
remainder would reach 9,000 total objects. Additional placed objects consume
the 381-object margin beneath that target, so start with just the grass plate.

This update also needs a fresh build if you already built the preceding
compact geometry. Its pinned [8,937-object loader](releases/d2840d8a3fc35727fc0c/loader.lua)
remains available for its existing checkpoints.

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

The generator reads the original clear-start road prefix and source ground
reference. It preserves road parts exactly, refits runoff/gravel, regenerates
recovery shoulders and outer terrain, and carves the same starting area. It
rejects geometry protruding above the driving surfaces, an obstruction in the
starting area, shoulder/runoff steps or drops above 0.35 studs, and a complete
build reaching 9,000 objects.

Geometry checks cover road and kerb coverage, pit connections, full terrain
volumes, surface clearance and complete shoulder/runoff cross-sections.
Offline Lua checks cover placement, pause,
checkpoint recovery, independent builder state, total-object guards, slot
selection, shared cooldown and autosave outcomes. Root project checks include
this variant and its pinned release hashes.

Source attribution remains in the parent [THIRD-PARTY.txt](../../THIRD-PARTY.txt).
