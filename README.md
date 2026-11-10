# Claris Track Project

Roblox circuit builders, organized by map. Each map keeps its variants,
source data, previews, generators and pinned releases together.

```text
sepang/
  loader.lua          Elevated Sepang
  flat/               Flat Sepang
monza/
  loader.lua          Elevated Monza
  terrain/            Monza with terrain
  save-debug/         Read-only Jakarta save diagnostics
red-bull-ring/
  loader.lua          Elevated Red Bull Ring with terrain
  clear-start/        Empty grass starting area beside the pit
    compact/          Smooth shoulders and runoff, under 9,000 total objects
```

| Circuit version | Planned parts | Instructions |
|---|---:|---|
| Elevated Sepang | 10,871 | [Sepang](sepang/README.md) |
| Flat Sepang | 9,044 | [Flat Sepang](sepang/flat/README.md) |
| Elevated Monza | 10,047 | [Monza](monza/README.md) |
| Monza with terrain | 10,750 | [Terrain](monza/terrain/README.md) |
| Red Bull Ring with terrain (1.5× layout) | 9,629 | [Red Bull Ring](red-bull-ring/README.md) |
| Red Bull Ring with a clear starting area | 9,623 | [Clear start](red-bull-ring/clear-start/README.md) |
| Red Bull Ring with smooth roads, an 18-stud pit lane, compact terrain and a clear starting area | 8,173 | [Compact terrain](red-bull-ring/clear-start/compact/README.md) |

Counts exclude your existing grass plate and other server objects. The
directory migration preserves track geometry, runtime globals and checkpoint
names. Existing release IDs remain available inside their map directories.
Jakarta's save failure is still under investigation; see
[save diagnostics](monza/save-debug/README.md).

## Load a circuit

Elevated Sepang:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/sepang/loader.lua"))()
```

Flat Sepang:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/sepang/flat/loader.lua"))()
```

Elevated Monza:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/monza/loader.lua"))()
```

Monza with terrain:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/monza/terrain/loader.lua"))()
```

Red Bull Ring with terrain:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/loader.lua"))()
```

Use the circuit's normal build tools, stand outside your vehicle on the grass,
inspect the catalog and preview before building. See the variant's README for
its supported checkpoint, resume and diagnostic modes. Old loadstrings with
the previous directory paths must be replaced with the URLs above.

Complete Red Bull Ring with compact terrain and concrete barriers, autosaving to slot 3:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/compact/build-all.lua"))(3)
```

This version starts automatically in a fresh build and contains **8,387 objects including grass**.
It retains the horizontal racing layout, smooths the road and grass/runoff
transitions, and widens the pit to 18 studs with a minimum 25-stud building gap.
It removes the extra pit bends and uses 120 fewer parts than the previous compact road. See its
instructions before replacing a saved slot.

## Checks and maintenance

The [full-circuit barriers](red-bull-ring/clear-start/compact/barriers/README.md)
add **213 concrete Parts** along tidied GLB paths. The pit straight stays open.
The single entry point builds the 8,174-object base first, then adds barriers
and confirms the final slot save. Its separate add-on loader remains available
for a matching completed base and existing barrier checkpoints.

From the repository root, run `npm test` for geometry, release hashes and
repository layout checks. Run `npm run test:lua` for all eight builders and their
HTTP loaders using the existing VLC Lua library, or pass `-LuaLibrary` to
`test-loaders.ps1`.

Work inside the appropriate map directory when regenerating. For example,
`npm --prefix monza run publish:prepare` packages Monza in place, while
`node monza/terrain/make-package.mjs` packages the separate terrain version.
Generating terrain consumes the non-terrain Monza files and leaves its build
data unchanged. Original GLB assets are excluded from Git; the frozen source
data and attribution remain inside each map.

## Publish prepared changes

The local checkout is `Claris Track Project`, with origin pointing to
[Claris-Track-Project](https://github.com/Clarissv/Claris-Track-Project).
After preparing changes, run from that checkout:

```powershell
git add -A
git commit -m "Tidy Red Bull Ring kerbs, remove sand fragments and add corner runoff"
git push origin main
```

The new Red Bull Ring raw URL becomes available after its files are pushed.
