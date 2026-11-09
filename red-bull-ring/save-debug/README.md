# Red Bull Ring save investigation

This compares the current 9,629-part Red Bull Ring plan with the 10,047-part
non-terrain Monza plan. It does not change either build or trigger game saves.

Red Bull Ring places its 314 pit-road parts at indices 5,902–6,215, followed
by 239 pit markings at 6,216–6,454. Terrain occupies 6,456–9,629. A failure
that first appears near 9,000 parts therefore occurs during terrain placement,
after the pit has been present for thousands of parts. That timing alone
does not establish whether terrain, a cumulative size boundary or storage
caused the failure.

Monza's 346 pit-road parts occupy 9,507–9,852, followed by 194 pit markings.
The successful 9,519-part partial save already included 13 pit-road pieces.
Both builders use Others75 for the road and pit, the same appearance request
code, and the same placement call. Pit paint uses the ordinary white block,
0.04 studs thick and noncolliding, like the main road markings.

All numeric parts, dimensions, palette references and rotation bases in both
plans pass validation. Red Bull Ring's pit is about 12 studs wide and 0.5
studs thick; Monza's is about 32 studs wide and 1 stud thick. The different
dimensions alone are not evidence of a save error. Red Bull Ring also has
3,174 terrain solids, which the compared Monza version does not have.

Regenerate [the comparison](plan-comparison.json) from the workspace with:

```powershell
node "Red Bull Ring/save-debug/audit-plans.mjs"
```

The audit reads the sibling authoring folders `Red Bull Ring/` and `Monza/`.
For the published repository, use `--project-root` with the checkout path.
For example, from the checkout:

```powershell
node red-bull-ring/save-debug/audit-plans.mjs --project-root .
node --test red-bull-ring/save-debug/test-audit.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File red-bull-ring/save-debug/test-observer.ps1
```

Its compact geometry JSON byte counts are **not the server's saved payload**.
The server save schema and storage key arrangement are unavailable, so these
counts cannot establish a datastore size cap or predict successful saving.

## Observe the existing Red Bull Ring session

After pushing this helper, run:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/save-debug/observe.lua"))()
```

Save manually through Jakarta, then export:

```lua
_G.RedBullRingSaveDebug.Export()
```

The observer records the authoritative object count, current builder progress,
raw save notifications and timing, visible numeric issues, and visible pit /
terrain group counts when the builder's object references are still available.
It prints and copies the report when supported and writes
`red-bull-ring-save-debug.json`. Stop it with `_G.RedBullRingSaveDebug.Stop()`.
It makes only the existing `GetPlacedAmount` read request. It does not place,
delete, move, change build properties or request a save/load. Streaming limits
what can be inspected locally; missing local references are not proof of
missing server objects.

Record the last successful partial count and the first failed count. If a
partial save **after part 6,454** succeeds, it establishes that the pit and
all its paint can be saved as part of that partial build. The next useful
comparison is the same part count with a different placement order, or adding
a suspected part to a small test build. Do not discard the current build to
perform that test. A generic "Failed to save" response cannot reveal a private
server exception on its own.
