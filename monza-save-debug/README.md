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
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Sepang/main/monza-save-debug/observe.lua"))()
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
