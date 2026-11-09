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

Successful saving still needs a live check. This tests the hypothesis that
covering the build starting area causes the failure. The changed terrain and
six-part count difference mean a successful save would support that hypothesis
without proving that position was the only cause.

Regenerate from this directory after generating the standard parent plan:

```powershell
npm run generate
npm run package
npm test
npm run test:lua
```

The source attribution and license remain in the parent [THIRD-PARTY.txt](../THIRD-PARTY.txt).
