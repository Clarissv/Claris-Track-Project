# Jakarta save investigation

The screenshot confirms **9,520 objects saved successfully** (9,519 track
parts plus one grass plate). The completed non-terrain builder verifies
**10,048 objects**, and saving fails repeatedly, including on retry and from
Roblox on PC. That makes a mobile-specific cause less likely.

The remaining 528 track pieces are 333 pit roads, 194 pit markings and the
finish line. Their numeric data, dimensions and rotations pass validation.
The first 13 pit-road pieces are already included in the successful partial
save. The remaining pit roads use Others75, as does the main circuit; pit
paint uses the same white block style as the main edge markings.

This rules out the old skipped-parts discrepancy and finds no malformed tail
geometry. It does not prove a server object cap or serialized-size limit.
The client export contains no server save handler. Its UI displays the server's
`ChatMessage` notification verbatim, so "Failed to save" is a server result
without a specific error code exposed in the exported UI.

`observe.lua` captures raw save-related arguments from the server's notification
remotes, result timing, the authoritative `GetPlacedAmount` count, visible-part
numeric issues, relevant client logs and visible slot date/count labels.
It does not trigger saves, load slots, place/delete objects, change properties,
move the character, wrap remotes or modify either builder. Streamed-out objects
cannot be inspected locally; the server count still includes them.

## Run the observer

Publish only the independent helper folder, then execute in the same completed
Jakarta build:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/monza/save-debug/observe.lua"))()
```

Retry a save manually in a spare slot, keeping the successful partial save.
After the server reports the result, run:

```lua
_G.MonzaSaveDebug.Export()
```

That prints the report, copies it if the executor supports `setclipboard`, and
writes `monza-save-debug.json` if `writefile` is available. Stop observation with
`_G.MonzaSaveDebug.Stop()`.

If the raw reply is still only "Failed to save", it cannot establish the
server's exact reason. A controlled follow-up would save progressively larger
prefixes of the original plan from the known good partial slot, recording the
actual count at each attempt. Whether failure consistently starts at the same
part/count, and whether a different placement order changes that boundary,
would distinguish a count/size boundary from a particular serialized object.
No build or terrain has been simplified for this investigation.

## November 9 screenshot findings

The observer screenshots show 10,749 authoritative server objects before and
after the failure. The raw server response is one `ChatMessage` string,
"Failed to save", approximately 1.527 seconds after the save-start notice.
No additional error code was sent through that notification. There are 2,611
locally visible parts with no numeric problems found; streaming is enabled,
so this local count does not establish missing server objects.

After the failure, Slot3 displays 10,749 objects and a new timestamp matching
the result time. This does not confirm persistence: the exported save UI reads
`DataReplication:GetBuildSlotData()`, which returns the cached player replica's
`Data.BuildSlot`. `UpdateBuildSaverUI` refreshes those labels without verifying
stored build contents. Initial identical "20,000" labels with an old July 2025
date are unrefreshed UI values, not evidence that 20,000 objects can be saved.

This latest observed build is larger than the original 10,048-object target.
Its count alone does not establish which builder ran or whether it completed.
The failure remains consistent with a server serialization/storage problem,
but neither the exact cause nor a count/byte limit has been established.

## Inspect the cached slot schema without saving again

`inspect-slots.lua` reads only the existing DataReplication module's Jakarta
slot data. It reports known count/date fields, field types, string lengths,
table entry counts and each slot's replicated JSON size. Other field values
are summarized rather than copied. It makes no save/load/count/placement
requests and does not modify objects or replicated data.

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/monza/save-debug/inspect-slots.lua"))()
```

It prints and, when supported, copies the report and writes
`monza-slot-inspection.json`. If the observer is still loaded, its next export
also includes the inspection. No additional failed-save attempt is needed.

If the replica contains only count/date/key metadata, its byte count cannot
measure the build payload. Even if build data is exposed, replicated JSON bytes
need not match the server's saved format or total datastore value. This check
identifies what evidence is accessible; it cannot recover a hidden server error.
