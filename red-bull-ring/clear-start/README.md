# Red Bull Ring with a clear grass starting area

Separate version of the corrected Red Bull Ring build. Your standing position
maps to the centre of a **400 × 400-stud area on the grass beside the pit lane**.
No placed part enters that square at any height: the opening passes through
the terrain, its buried tilted corners and the foundation. The original grass
plate remains your floor. The nearest pit road is about 294 studs from the
centre. Terrain cuts follow the original broad planes; some opening edges
extend beyond the guaranteed square to keep large sloping solids clear.

**9,623 placed parts; 9,624 including one existing grass plate.** This is six
fewer parts than the standard terrain build. The road, pit, kerbs and runoff
geometry, the 1.5× layout and elevation are identical to that version.

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/loader.lua"))()
```

After spawning in Jakarta, stand on the original grass where you want the
empty area's centre. Enable build tools and load this version. **Inspect**,
then **Preview**, then **Build / Resume**. Keep the default scale and starting
mode for the 200-stud clearance. The preview's red marker shows your starting
point. The pit and circuit are positioned beside that point automatically;
the marker is a preview object and is cleared before placement.

This needs a **fresh build**. Pause the standard Red Bull Ring builder first.
The standard loader and all its releases remain available separately. This
version uses `_G.RedBullRingClearStartBuilder`, its own panel and executor
folder `RedBullRingClearStart`, and the checkpoint
`red-bull-ring-clear-start-jakarta-checkpoint.json`.

## Diagnostic autosave while building

Choose a slot specifically for this test. After pushing the updated repository,
open the builder with automatic saves armed for slot 1:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/loader.lua"))("autosave", 1)
```

Replace `1` with your chosen slot `1`–`4`, then **Inspect**, **Preview**, and
**Build / Resume**. This mode saves automatically during placement. The numeric
`(1)` command below still performs just one manual save.

Autosave checks every **500 total server objects**, then every **100 from
8,500 onward**, and saves at the end. The count includes your grass plate and
any other placed objects. Placement stops at each checkpoint, waits for the
cooldown, verifies the authoritative count, sends one save, and waits for a
terminal reply before continuing. The script leaves **31 seconds after each
save finishes** before another request, with an initial 31-second window after
arming it. Building can use that interval; when it reaches a checkpoint sooner,
it waits without placing additional parts. Manual script saves share this timer.
Avoid the game's manual save buttons while this diagnostic run is active, since
their requests are not tracked by this timer.

Every checkpoint **overwrites the selected slot**. A failed attempt may leave
that slot unusable; the last successful count in the report is an observation,
not a guarantee that the previous slot contents survived the next attempt.

On `failed`, `unknown` (no terminal reply in 45 seconds), or a save error, the
builder stops without placing another part or retrying. The panel and console
show the attempted count, last successful count, and newly added part indices
and groups. Print the recorded history before leaving:

```lua
_G.RedBullRingClearStartBuilder.AutoSaveReport()
```

The returned table is also `_G.RedBullRingAutoSave`; its `history`,
`lastSuccess`, and `firstFailure` hold the results. Copy the report before
rejoining, since this diagnostic history lives in the current client session.
The interval narrows where saving starts failing; it cannot establish whether
one part, the total size, or a server storage problem caused the failure.

The first reported diagnostic run successfully saved **9,500 total objects**
and failed at the **9,600-object checkpoint**. With one existing grass plate,
the 100 additions are plan parts **9,500–9,599**, all terrain-edge grass parts.
Their sizes and rotation bases pass the static geometry checks; the pit road
and markings were already included in earlier successful saves. See the
[boundary report](save-boundary-report.json) for the assumptions and comparison.
The next fresh run can narrow that interval with
`EnableAutoSave(1, {every=500, fineFrom=9500, fineEvery=10})`.
Re-arming the stopped 9,600-object build cannot test earlier counts.

The subsequent ten-object checkpoint run saved **9,510** and **9,520** total
objects, then received the server's **Failed to save** reply at **9,530**.
The autosave screenshot identifies the failing additions as plan parts
**9,520–9,529**, all terrain. Those ten parts have finite numeric data,
valid dimensions, and orthonormal rotation bases; their style is grass.
This narrows the candidate interval but does not identify one faulty part or
establish a count/byte limit. The complete clear-start target remains 9,624
total objects, so completing placement alone will not resolve this save failure.

While that build remains paused, inspect the existing cached slot schema:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/monza/save-debug/inspect-slots.lua"))()
```

This shared Jakarta helper works with Red Bull Ring too. It reads cached slot
fields and reports their types and byte lengths without requesting a save or
load. Send its `SLOT INSPECTION` output. Slot counts and dates are cached
metadata and do not prove persistence; replicated JSON bytes also need not
match the server's stored build format. The failed overwrite does not guarantee
that the previous 9,520-object slot contents survived.

The user's slot inspection confirms Slot3 contains only `BuildAmount` and
`Date`, totaling 54 replicated JSON bytes; it displays 9,530 despite the failed
save. No build payload is exposed by this replica, so its size cannot reveal
the server's actual saved-data size. A separate [compact terrain version](compact/README.md)
now preserves all road geometry and the starting area while reducing the build
to **8,937 total objects with grass**. It needs a fresh build and live save/load
verification; the exact server failure cause remains unproven.

The attempted Repair of that loaded prefix subsequently stopped on multiple
matching replicated objects and the user's server count became **9,502**.
Repair can issue a placement before an existing saved object streams into
view, so it is unsuitable for this saved-prefix diagnostic. The recovery
workflow below bypasses the old prefix and requires the exact loaded count
before any new placement.

## Resume the known 9,500-object save directly

Before rejoining, **keep the original stopped builder loaded** and export its
original position for the saved prefix. After pushing this release, run:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/loader.lua"))("recovery", 9499)
```

`9499` is the saved **track-part count, excluding the grass plate**. This writes
`red-bull-ring-clear-start-jakarta-checkpoint.json` in the executor's files. It
requires `writefile` and the original captured transform, works from the
unconfirmed stopped builder, and does not change or save game objects. Its
prefix refers to the earlier slot you choose, not the glitched current build.
Wait for the **Original position saved locally** message before leaving.
It replaces the local resume checkpoint with one for this earlier prefix.

Rejoin, enable build tools, and use Jakarta's UI to load the known saved slot.
Wait for loading to finish. Then run:

```lua
local builder = loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/loader.lua"))("resume")
assert(builder.VerifyServerCount().serverCount == 9500, "Wait for the saved slot to load exactly 9,500 objects")
builder.EnableAutoSave(1, {every=500, fineFrom=9500, fineEvery=10})
builder.Build()
```

Choose the autosave slot in `EnableAutoSave`; each request overwrites it. The
loader restores the original origin, scale, catalog, and appearance, sets the
next plan index to **9,500**, and retains an exact **9,500-object** count guard.
Build continues with the missing suffix; it does not inspect or rebuild the
9,499 saved track parts. Autosaves begin at **9,510 total objects** and retain
the shared 31-second cooldown. An incorrect loaded count stops before placement.

This trusts your identification of the saved slot as the original sequential
prefix. A count alone cannot prove which track parts it contains. If the old
builder is already gone, a previously exported matching checkpoint is needed
to recover the original transform; a new standing position does not establish it.

**Pause** can cancel a checkpoint during cooldown. If the request has already
been sent, Pause waits for its outcome and stops before further placement.
Build / Resume preserves a successful checkpoint. After a failure it refuses
to continue until you explicitly disable or re-arm autosave after reviewing
the result. To disable it on the paused builder:

```lua
_G.RedBullRingClearStartBuilder.DisableAutoSave()
```

To arm an already loaded, paused builder while retaining its progress:

```lua
_G.RedBullRingClearStartBuilder.EnableAutoSave(1)
```

An optional second argument adjusts sampling, for example
`EnableAutoSave(1, {every=100, fineFrom=8500, fineEvery=25})`.
This changes save checkpoints only; the shared cooldown remains in place.

## Save to slots 1–4

With the track present and the builder paused or complete, pass the slot number
to the loader. For example, save the current Jakarta build to slot 2:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/loader.lua"))(2)
```

Replace `2` with `1`, `3` or `4`. This **replaces that slot's previous save**.
Without an argument, the loader opens the builder as before. Numeric save mode
downloads only the save helper and preserves the current builder, checkpoint
and placed parts. It also works after rejoining without loading the builder
panel, when the circuit is actually present. With a current panel, the same
function is `_G.RedBullRingClearStartBuilder.Save(2)`.

The helper uses Jakarta's own `BuildSaver` request. It checks the server owner,
the authoritative object count and active builder state, and blocks an empty
or grass-only build. A server failure is reported as `failed`; a missing reply
after 45 seconds is `unknown`, rather than success. It sends no automatic
retries. The result is returned and available as `_G.RedBullRingSlotSave`.
`UpdateBuildSaverUI` and slot timestamps are not treated as proof of saving.

This is a shortcut to the game's save operation, not a different storage
system. It cannot recover a circuit that failed to persist or bypass a server
serialization/storage failure. The save feature does not change geometry, so
an existing matching checkpoint can continue using this release.

Export a paused checkpoint before saving a partial build and leaving:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/loader.lua"))("checkpoint")
```

Load the saved Jakarta slot before resuming with the same loader's `"resume"`
mode. The checkpoint is independent of the game's build-slot storage.

[Start-area preview](build-domain.png) · [Top view](build-start-point.png) ·
[Interactive viewer](red-bull-ring-3d-viewer.html)

The domain audit uses the full horizontal projection of every rotated solid,
including bottom corners, rather than checking top faces alone. The carved
terrain pieces remain inside their original solids, and the driving, kerb and
terrain collision audits pass. Offline Lua tests check the matching loader,
placement, preview and checkpoint behavior.

The user's live test of the complete 9,624-object clear-start build still failed
to save. Rejoining and loading produced an error and only the previously saved
grass plate. The open starting area did not resolve that failure. The diagnostic
autosave mode now tests smaller confirmed prefixes to locate its first failure
boundary. Successful slot persistence still requires checking the live game.

Regenerate from this directory after generating the standard parent plan:

```powershell
npm run generate
npm run package
npm test
npm run test:lua
```

The save protocol was checked in the existing Potassium client export:
`StarterGui.BUILDSLOT.LocalScript (1_88646).lua`, its confirmation callback
(decompiler source line 253), sends
`Network:FireServer("BuildSaver", "Save", slot)` after selecting slots 1–4.
`ReplicatedStorage.Modules.Network (1_199629).lua`, its `FireServer` method
(decompiler source line 64), resolves that
call to `NetworkContainer.RemoteEvents.BuildSaver:FireServer("Save", slot)`.
This is static client evidence, not observation of the private server handler.

The source attribution and license remain in the parent [THIRD-PARTY.txt](../THIRD-PARTY.txt).
