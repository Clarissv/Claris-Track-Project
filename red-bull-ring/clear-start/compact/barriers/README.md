# Red Bull Ring GLB barriers

**747 extra parts: 650 steel and 97 concrete. 8,921 total objects with the matching road and original grass plate.**

The paths come from the Red Bull Ring GLB, replacing the generated perimeter
walls. Steel uses the identified **DiamondPlate / Diamond Plate 1** appearance.
The native Others88 object is composite, so fitted rectangular rails approximate
its profile and posts. Concrete uses the **Others68** Part, retaining its native
material, colour, variant and striped decorations when present. GLB concrete
material 88 mainly contains short low sections and terminals.

The pit straight is free of barriers. Entry and exit keep their GLB reference
sections, with open joins where the pit meets the racing road. Source paths are
locally moved by up to 179.9 studs to
fit the revised runoffs, road clearance and outer terrain. 54
crossings at roads or abrupt outer-terrain steps are split into openings.
Steel bracket spurs under 20 studs are omitted. Walls have overlapping ends
within each retained chain and buried bottoms; checked visible height is at
least 3.36 studs. The full pit-straight corridor is
checked against complete fitted footprints, including detours.

**This revision requires a fresh matching base build:** road release
`f78205c653c1bc354f82`, **8,173 road/terrain parts**.
The pit has one entry curve, one continuous straight and one rounded exit,
an 18-stud lane and at least 25 studs of building space. Its empty 400?400
starting square follows the pit direction and keeps the same centre. Older
compact roads and their barrier checkpoints cannot resume this geometry.

After pushing the prepared files, build the base in a fresh Jakarta session
with only the original grass plate. Enable Build Tools and run:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/compact/loader.lua"))("autosave", 3)
```

Use Inspect, then Build / Resume. After the base finishes, keep its builder
loaded and run:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/compact/barriers/loader.lua"))("autosave", 3)
```

Use Inspect catalog, then Build / Resume. The add-on inherits the road's exact
origin, rotation and scale. Character following starts off so you can drive;
pause and use Follow placement if distant placements need it. Appearance
controls use the game's existing Build Tools Plus access.

Autosave pauses placement and shares the 31-second save cooldown. It replaces
slot 3 and saves the combined count. Use the barrier loader or panel for later
saves, because the original road builder's count describes the base alone.
There is room for 78 other objects beneath the
9,000-object target.

For a checkpoint, pause and use the barrier loadstring with `("checkpoint")`.
Save the matching prefix to a game slot before leaving. After rejoining, load
that slot and use `("resume")`, arm
`_G.RedBullRingBarriersBuilder.EnableAutoSave(3)`, then Build / Resume.
Its checkpoint retains the road transform and combined count. First-time
barriers after rejoining can inherit a completed matching base checkpoint if
the original road API is absent. Normal repeated loadstrings reuse live
progress; `("diagnose")` checks placement, and `(3)` saves manually.

[Highlighted GLB layout](barrier-overview.svg) ? [Pit straight](build-pit-lane.png) ?
[Steel detail](build-steel-detail.png) ? [Concrete detail](build-concrete-detail.png)

Offline previews show geometry and highlight concrete positions. The live
Others68 template supplies its native stripes. Driving impacts, grip and
live save/reload still need in-game verification.

From the repository root, run `npm.cmd test` and `npm.cmd run test:lua`.
To regenerate, run `node generate.mjs`, `node prepare-runtime.mjs`, then
`node make-package.mjs` in this directory. Source extraction and catalog
identification are documented in [reference-review](reference-review/README.md).
