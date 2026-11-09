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
