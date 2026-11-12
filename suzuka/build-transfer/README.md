# Jakarta build transfer

Copy the current Jakarta Build Tools build, including manually assembled
catalog buildings, into a local backup and reconstruct it in another Jakarta
private server. Objects keep their world positions, rotations, sizes or Model
scales, supported appearance and collision settings. Existing matching objects
are reused, including the starting grass plate. Overlapping copies retain their
multiplicity.

The backup is the actual build snapshot. A Suzuka builder checkpoint alone
cannot recover manually added buildings.

## Use the local package now

1. Extract `jakarta-transfer.zip` into your executor workspace. It must contain
   `JakartaTransfer/transfer.lua`, `copy-local.lua` and `paste-local.lua`.
2. Stay in your **source Jakarta server** with the unsaved build still present.
   Enable `/buildtools`, pause the circuit builder, stand outside your vehicle,
   and have everyone stop placing, moving, recoloring or deleting objects.
3. Run:

   ```lua
   assert(loadstring(readfile("JakartaTransfer/copy-local.lua")))()
   ```

   The helper follows the placed track and nearby building parts to stream
   further sections. Start near the circuit or pit. Wait for
   **COPY COMPLETE** before leaving. It writes and reads back
   `jakarta-build-backup.json` in the executor workspace and reconciles the
   captured root count with the server count. A draft is incomplete and cannot
   be pasted. Keep a separate copy of the completed backup.
4. Join **your friend's Jakarta private server**, keeping the same device and
   executor workspace. Enable `/buildtools` with your moderator access. Use a
   fresh destination with its normal grass plate, stand outside your vehicle,
   and stop other editing. Run:

   ```lua
   assert(loadstring(readfile("JakartaTransfer/paste-local.lua")))()
   ```

5. Wait for **PASTE COMPLETE**, inspect the track and manual buildings, then
   have your friend save through the normal owner interface into a spare slot.
   Verify that slot by loading it in a fresh session.

The destination account needs Build Tools Plus for Plus catalog items and
modified colors/materials. Unchanged standard catalog objects do not require
Plus. Moderator access alone does not grant Plus or owner saving rights. If
the read-only server count query is unavailable to your moderator account,
the server owner must run the helper with the same backup files.

## GitHub entry points

After these files are published to the existing repository, source copy:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/suzuka/build-transfer/copy.lua"))()
```

Destination paste:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/suzuka/build-transfer/paste.lua"))()
```

Both use the same local backup/progress filenames as the local package.
Your build backup stays on your device; upload only the helper code.

## Pause and recovery

FPS mode is enabled by default during Copy, Paste and manual scans. It temporarily
disables local 3D drawing when supported, keeping the transfer panel visible.
If that control is unavailable, it reduces local shadows and graphics quality
where supported. Normal drawing/settings return when paused, completed, stopped
on an error or disposed. Use **FPS mode: ON/OFF** to toggle it, including while
the operation is running. Your build's materials, colors, textures, transparency
and geometry are preserved.

During movement, **NoClip is enabled by default** for your character's Parts.
It temporarily disables their collision, anchors the root and teleports between
scan points. Collision and anchoring are restored on pause, completion or error.
Terrain, track and building collision settings are unchanged. Set
`_G.JakartaTransfer.Config.NoClip = false` before resuming to disable it.

The panel opens on the right, above the game's HUD. Press **F8** to pause when
using the mouse is difficult. The scan yields between small batches and reuses
unchanged Part, wedge and MeshPart snapshots during full scans. Leaf
owner/placement metadata can be cached; mesh identity, geometry and appearance
changes invalidate that cache. Full scans resample Models and nested geometry.
During automatic discovery, successful snapshots of already observed roots are
reused, including Models and Parts with runtime containers. Only new instances
and unresolved roots need geometry/catalog work on each visit. Re-streamed
instances are sampled again, with overlapping multiplicity retained. Manual
**Scan nearby** and final backup verification perform full checks, including
checking successful observations for source changes before completion.
Unknown plain blocks use a verified
equivalent standard catalog template rather than comparing every catalog item
again for each slab. Models are compared only against templates with matching
root type and descendant counts; complete geometry/appearance checks still apply.
File checksums also yield between
chunks. Large native JSON encoding/decoding operations can still cause a brief
stutter; actual in-game FPS improvement has not been measured.

To replace an older running helper, run `_G.JakartaTransfer.Pause()` in the
executor, wait for **Paused**, then run the updated Copy loader in the same
source server. Keep the existing backup, draft and progress files; the updated
helper reads the same formats and resumes the draft.

## Follow the circuit and focus nearby buildings

`Config.ScanMode` defaults to `"track"`. Captured narrow Parts seed exact centre
visits ahead of their grid points. This reaches roots that can be missed by the
offset from a grid cell centre when streaming distance shrinks. Parts seed points
along their rotated footprints, including long road sections and separate height
levels. Models seed their pivot and scaled child part footprints. Newly streamed
sections add more points, so the route can advance around the circuit. The next
automatic point is chosen from the last visited location, including after a
reload; it does not enforce a named corner order.

Large slabs wider than 128 studs in both horizontal dimensions are captured but
do not seed a sweep of the grass or foundation. Loading an older draft in track
mode removes pending broad scan areas while preserving captured objects, the
visited prefix and fine/focus points. Captured geometry reseeds the track route.
The original source server and unchanged object count are still required.

Track mode needs streamed track/building parts to discover further sections.
Stand near the circuit before starting. An isolated area separated by a large
gap may need **Focus here** or **Scan nearby**. Exhausting the route with missing
objects tries nearby recovery and then stops with an incomplete report; it never
marks that backup complete.
For an intentional wider sweep, set `Config.ScanMode = "bounds"` before starting
a fresh Copy.

If the captured count stops increasing while the area counter advances, pause
with **F8**, walk to the pit or starting straight, press **Focus here (nearby
buildings)**, then **Copy / Resume scan**. The focus queues 32-stud scan points
within a 384-stud radius at your current height, ahead of the automatic route. It
keeps the accumulated objects and persists the focus in the same draft. Repeat
at another part of the pit, or another height for tall buildings, if needed.

From the executor after pausing and moving there:

```lua
_G.JakartaTransfer.FocusHere()
_G.JakartaTransfer.Copy()
```

An optional argument selects the radius, for example `FocusHere(512)`. Focus
points are checked before other automatic points. Remaining track points are
retained, so focusing does not limit which objects belong in the backup.
Automatic points reserve queue space for a manual focus area.

After 24 automatic areas without a new object, or 60 seconds without growth,
the helper queues a close pass around the initial/focused position. This uses
32-stud spacing within 256 studs at the original height and 64 studs above it,
with at least one second to settle after each streaming request. An exhausted
track route also tries this pass. Start/focus from the pit so this position is
useful; it is not inferred from a named Suzuka corner.

If 48 recovery visits in a row add nothing, Copy stops, restores rendering and
saves the unfinished draft. Keep the source server open, move to the missing
pit/straight section, press **Focus here**, then **Copy / Resume scan**. Captured
objects and pending locations remain in the draft. This prevents an unproductive
close pass from keeping the helper busy indefinitely. Recovery also survives
pause/reload. Report includes recovery progress, idle areas and discovery reuse.

`Scanning X / Y streamed objects` shows progress inside the current area. The
captured count updates after that scan is merged into the backup snapshot.
`Writing local draft` identifies the filesystem step. A message such as
`Resumed local draft` alone is not a completion message.

Use **Pause**, then the corresponding **Copy / Resume scan** or **Paste / Resume**
button. Reloading the helper resumes an unfinished draft in the same source
server. Import progress survives helper reloads in the same destination server.
Keep the server's objects and all local files intact during recovery.

If Copy stops before completion, keep the source server open. Walk to missing
areas, press **Scan nearby**, then **Finish copy**. **Report** shows unresolved
objects, classes, positions and specific reasons. Native wedge/mesh roots with
unknown instance GUIDs can resolve to complete matching catalog geometry. Once
the full root count has been captured, the helper
rechecks up to 20 unresolved positions and stops with a report if they still
cannot be reproduced. It does not continue scanning the entire map for those
objects or silently skip them. A source count change requires a fresh capture after editing
stops:

```lua
_G.JakartaTransfer.NewCopy()
```

Catalog mappings can resolve ambiguous names; they cannot make a modified
Model match a catalog template:

```lua
_G.JakartaTransfer.Config.CatalogMap["source object name"] = "Exact Catalog Name"
```

For destination catalog renames, map the old catalog name to the new one before
pressing Paste. All records are validated against destination templates before
any placement is sent.

An unconfirmed placement stops the import and is recorded on disk before the
request is sent. Press Paste / Resume to reconcile a late response. If you have
actually observed the game reject that placement, clear that request with
`_G.JakartaTransfer.RetryRejected()` and then resume. A timeout alone does not
prove rejection. Do not erase progress files to work around uncertainty.

The three configurable filenames default to `jakarta-build-backup.json`,
`jakarta-build-draft.json` and `jakarta-build-import-progress.json`. Use different
simple `.json` filenames before starting if transferring a separate build. File
read-back checks detect accidental corruption; the previous completed backup is
preserved as `.previous` before replacement.

`Config.BatchSize` defaults to 32 work units, `Config.WorkBudget` to 0.004
seconds and `Config.DraftInterval` to 30 seconds. Automatic drafts are written
between scan areas after that interval; pause, stop and finish also write one.
Smaller batches yield more often. Pausing during a scan preserves the partial
snapshot and revisits that area on resume.
`Config.FocusRadius` defaults to 384, `Config.FocusStep` to 32 and
`Config.FineTrackScan` to true, which track mode requires. Keep `Config.GridStep`
unchanged when resuming an existing draft; precise track/focus points use their
own saved positions alongside that grid.
`Config.StallAreas`, `Config.StallSeconds`, `Config.RecoveryRadius` and
`Config.RecoverySettleTime` control the automatic recovery thresholds and close
pass. Their defaults are 24, 60, 256 and 1 respectively.

## Supported build and verification limits

The helper reconstructs catalog Parts and complete catalog Models using the
normal placement endpoint. Roots without a reproducible catalog equivalent,
incomplete Models and per-child
appearance/physics edits that catalog placement cannot reproduce stop completion
and remain in the draft. Nothing is silently skipped. Models preserve mixed
catalog colors by leaving unchanged appearance parameters unset.

Capture requires a quiet source: a matching count cannot detect every concurrent
move or appearance edit. Destination confirmation compares streamed geometry,
appearance and authoritative counts; keep other players from editing during
transfer. This script does not load, save or delete builds, bypass permissions,
or establish why the original account's save failed. A successful transfer does
not establish that the larger build can be saved on the friend's account.

The supplied Jakarta client dump establishes the placement argument order and
metadata fields. Those are static observations from local Lua files; no live
Roblox server or server implementation was available. REA tools were unavailable
in this session, so the dump checks used ordinary local file inspection.

## Local checks and packaging

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File suzuka/build-transfer/test-transfer.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File suzuka/build-transfer/make-package.ps1
```

The tests exercise copy, partial Model streaming, distinct coincident appearances,
draft recovery after reload, mixed Model colors, default parts without Plus,
pause/resume, late/rejected placement, durable pending requests, corrupted backups,
catalog validation and loader modes with offline doubles. Actual Roblox placement,
driving and the friend's save/reload still require an in-game session.
All 126 behavioral checks passed locally on 2026-11-12, including large-scan
pause/resume, cache invalidation, chunked checksums, FPS toggle/restoration and
the panel's F8 binding. A regression with 400 additional catalog entries checks
that unknown blocks use about one verified catalog comparison per sample even
when nested containers prevent Part caching. Additional checks exercise focus
preservation after reload, missing objects at coarse-grid corners and different
heights, noclip resets/new body parts/restoration, leaf metadata caching,
native wedge/mesh catalog resolution, and detailed unresolved reports. Track mode
checks cover broad-slab capture without a terrain sweep, explicit bounds mode,
long diagonal roads, scaled Model footprints, connected sections that stream in
and out around a bend, selection from the last visited position, and migration
of legacy drafts without losing captured objects or manual focus.
Discovery checks use 2,048 Parts with runtime folders and one complete Model:
eight automatic scans avoid all repeated geometry sampling, followed by full
final validation. Additional cases check exact centre visits with a tiny stream
radius, overlapping copies and replacement references, rejection of source edits
before replacing the completed backup, delayed buildings at another height,
recovery reload and bounded stopping when nothing new is discovered. The local package was
also opened and its four archived files compared with the current sources.

The package script defaults to `Suzuka/jakarta-transfer.zip` in the parent source
workspace and verifies each archived file against its source.

## Publish the prepared helper

From the `Claris Track Project` checkout, these commands include only the tracked
helper files, excluding diagnostic screenshots and actual build backups:

```powershell
git add -u -- suzuka/build-transfer
git commit --only -m "Speed up transfer discovery and recover pit scans" -- suzuka/build-transfer
git push origin main
```

The local package works before publishing. The GitHub entry points require a
successful push; this session could not reach `github.com` to publish them.
