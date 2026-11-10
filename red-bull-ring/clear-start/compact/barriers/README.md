# Red Bull Ring tidy concrete barriers

**213 additional Parts: 184 grey runs and 29 retained concrete terminals.
8,387 total Parts with the matching road, terrain and original grass plate.**

All barriers use the resizable **Others68 concrete Part**. Main runs are grey;
retained GLB concrete terminals keep the template's native appearance and
decorations. Others88 and steel materials are no longer placed.

Paths follow the Red Bull Ring GLB, adapted to the revised recovery areas.
Long straight sections replace the previous detour clutter. Short bracket
spurs, 14 fitted hooks and 18 isolated concrete pieces are omitted. Connections
that would cross a road or abrupt outer-terrain step remain open instead of
forming loops. Retained main sections have no backtracking or pieces shorter
than 25 studs. They extend up to about 320 studs where the ground permits.

The entire pit straight stays open; entry and exit retain reference sections.
Complete footprints are checked against the pit corridor and empty starting
square. Barriers intersect no driving solids, have buried bottoms, and expose
at least 3.35 studs above the ground. Outer-terrain gaps remain where continuous
fencing would require unsafe detours.

The base remains road release `f78205c653c1bc354f82`: **8,173 placed Parts**,
18-stud pit width, at least 25 studs of building space, one entry curve and one
rounded exit. The 400 x 400 starting square keeps its centre and pit alignment.

## One loadstring for the complete build

Push the files, start a fresh Jakarta build containing only the original grass
plate, enable Build Tools, and stand where the empty starting area's centre
should be. Run as the server owner with Build Tools Plus access:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/compact/build-all.lua"))(3)
```

This starts automatically, builds road and terrain first, confirms that stage's
slot save, then builds the concrete barriers and confirms the final combined
save. **Autosaves replace slot 3.** Both stages use pinned releases and the
shared 31-second save cooldown. The console prints `DONE` only after the final
8,387-object save is confirmed.

The current stage panel provides Pause and Build / Resume. Resuming the road
through its panel still hands off to barriers automatically. Repeating the
loadstring shows the existing stage without resetting progress. Unconfirmed
placements or failed saves stop the build; they are not automatically resent.
Your character follows the placements by default so distant barriers remain
streamed in during confirmation. Step out of the car before building.

## Existing builds and checkpoints

The separate `barriers/loader.lua` remains available for adding barriers to the
completed matching road, and for its checkpoint, resume, diagnose and slot-save
modes. Its builder inherits the road's exact origin, rotation and scale.
Checkpoints from the previous steel layout do not match this barrier geometry.

If a previous concrete barrier run stopped on an accepted object that streamed
out, keep its current session open, step out of the car and run:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/compact/barriers/loader.lua"))("continue")
```

This works with the older live builder as well. It verifies that the pending
request is the only extra server object, moves nearby, waits for its exact
geometry to replicate, then uses the existing API to confirm it and finish.
It retains the road, confirmed barriers, transform, count and autosave state.
The accepted placement is never resent. Your character returns afterward.

For a later manual save, use the barrier panel, which includes the full count;
the original road builder still describes the base alone. Export the active
stage's checkpoint and save the matching game slot before leaving mid-build.
The one-load entry point is for a fresh build, not restoring an old game slot.

[Highlighted reference layout](barrier-overview.svg) ·
[Top-down preview](build-topdown.png) · [Pit straight](build-pit-lane.png) ·
[Grey barrier detail](build-grey-detail.png) · [Concrete detail](build-concrete-detail.png)

Geometry, catalog appearance, stage handoff, placement confirmation, pause,
checkpoint and autosave contracts are checked offline. Driving and live
save/reload still need in-game verification.

From the repository root, run `npm.cmd test` and `npm.cmd run test:lua`.
To regenerate, run `node generate.mjs`, `node prepare-runtime.mjs`, then
`node make-package.mjs` in this directory. Source extraction and historical
catalog captures are documented in [reference-review](reference-review/README.md).
