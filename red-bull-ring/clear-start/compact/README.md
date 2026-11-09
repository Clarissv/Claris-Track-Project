# Red Bull Ring with compact terrain

**8,936 placed parts; 8,937 total with one existing grass plate.** This separate
version saves 687 parts compared with the original clear-start build. All
6,455 road and detail parts are identical: the main road, pit lane, kerbs,
markings, runoff, elevation, scale and standing anchor are preserved.

The narrow grass strips beside the road retain their original segmentation.
Wider terrain strips farther from the road use longer fitted pieces. The
400 x 400-stud starting area remains clear through the terrain and foundation.
Outer terrain is less detailed and retains visible planar joins and terraces.

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
complete **8,937-object** build. A failure or missing reply stops placement.

The paused 9,530-object build and its old checkpoints use different terrain.
Build this version in a fresh server; loading its panel alone does not delete
the old build. It rejects placement if existing objects plus the compact
remainder would reach 9,000 total objects. Additional placed objects consume
the 62-object margin beneath that target, so start with just the grass plate.

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
reference. It preserves road parts exactly, regenerates coarser outer terrain,
carves the same starting area, and rejects invalid geometry, terrain entering
the road or starting area, or a complete build reaching 9,000 objects.

Geometry checks cover road and kerb coverage, pit connections, full terrain
volumes and surface clearance. Offline Lua checks cover placement, pause,
checkpoint recovery, independent builder state, total-object guards, slot
selection, shared cooldown and autosave outcomes. Root project checks include
this variant and its pinned release hashes.

Source attribution remains in the parent [THIRD-PARTY.txt](../../THIRD-PARTY.txt).
