# Sepang track builder

For Jawa Timur's normal build tools. This opens the builder panel:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Sepang/main/loader.lua"))()
```

Stand on your existing grass platform outside your vehicle, inspect the catalog, preview the placement, then click **Build / Resume**. The 2x layout has wider lanes, slopes and smoother rectangular joins: **10,871 parts**, about **3,229 x 2,668 studs**, **46-56-stud roads** and a **22.6-stud pit lane**. Keep the additional Config.Scale at 1. Character follow is enabled; it restores your position on pause/completion/error. Placement takes at least about 18 minutes plus latency and streaming waits.

The generator and runtime use an **11,000-part budget**. Edge lines follow their own paths and merge into longer pieces, with a tight height tolerance. All asphalt slabs, curbs, runoff, pit lane, pit wall and the start/finish marker are preserved from the 14,815-part version; the road size, width and slopes are unchanged.

The loader fetches builder and data from one immutable release directory. Starting a build needs no local builder/plan files. The repository's raw files must be accessible without signing in.

## Save and resume this version

Checkpoints must match the exact part plan. This smaller plan starts a fresh build and cannot resume a 14,815-part checkpoint. For that previous version, use `https://raw.githubusercontent.com/Clarissv/Sepang/main/releases/dd0c8269d107e615dbca/loader.lua` instead of the root loader URL below, with `"checkpoint"` or `"resume"` as needed. The old release remains available.

Keep the current builder/server open and execute:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Sepang/main/loader.lua"))("checkpoint")
```

This saves position/progress to the executor workspace's sepang-checkpoint.json, requests a pause and places/deletes no objects. **Save the partial map using the game's build-slot UI before rejoining.** Load that game save, then execute:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Sepang/main/loader.lua"))("resume")
```

Inspect and click Build / Resume. The loader also accepts an existing SepangRibbon/sepang-checkpoint.json. It validates the plan checksum, preserves the origin/index and requires the saved partial map. Checkpoints need writefile; resume needs readfile. Unconfirmed sent placements cannot be exported for a fresh retry.

For a diagnostic snapshot:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Sepang/main/loader.lua"))("diagnose")
```

## Source and checks

Run npm test for geometry/release checks. npm run test:lua exercises placement and HTTP loading with mocks using an existing VLC Lua DLL on Windows (or supply -LuaLibrary to test-builder.ps1). Live driving/full placement still need verification.

To regenerate geometry, supply your original elevation-reference file as source/sepang.glb (SHA-256 2977de6489c96b52a9e808417609a4203883a374b025637d2e9aefc461ecc6bb), then run npm run generate and npm run release. The GLB/textures are not included. Curbs and pit routing are approximate. CSV source and LGPL license are included under source; see THIRD-PARTY.txt.
