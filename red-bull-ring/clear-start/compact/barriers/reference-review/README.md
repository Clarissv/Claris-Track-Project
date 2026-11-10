# Barrier reference review

The fitted barrier layout now uses the same GLB as the Red Bull Ring road
(source SHA-256 `4eefb175d9d3644549c781c96f0ecdb4bdd7983b601acc9bf06442bad81a1bde`).
The complete source triangles remain in `barrier-reference.json`.

GLB material 56 (`Acuredbullring661Mtl.003`) supplies steel rails. Material 88
(`Acuredbullring1001Mtl.003`) supplies short low solid sections and terminals,
mapped to concrete. These are mostly small pieces, rather than long concrete
runs. Source positions are fitted to the revised terrain and driving clearance;
barriers beside the pit straight are removed while entry and exit sections stay.

The user's catalog captures confirm **Others88** as composite steel, containing
a UnionOperation and Parts, including **DiamondPlate / Diamond Plate 1**.
**Others68** is the concrete Part with an empty MaterialVariant. The builder
uses fitted rectangular steel rails with that appearance; it approximates the
composite profile and posts. Concrete uses the native Others68 template and
retains its material, colour, variant and striped decorations where present.

[Source reference map](reference-overview.png) shows steel in blue and concrete
in gold. [Final fitted map](../barrier-overview.svg) highlights both roles.

For the native Others88 rotation, run [inspect-steel-orientation.lua](../inspect-steel-orientation.lua)
in Jakarta after enabling Build Tools. It reads the catalog template directly,
identifies the DiamondPlate / Diamond Plate 1 panel, and prints one
`STEEL_ORIENTATION` JSON report with its root class, dimensions, component
transforms and the rotation that makes the broad textured panel upright.
No placement or held-preview edits are made. The current barrier loader still
uses plain steel rails; the native report is needed to fit and rotate Others88.

To identify the actual game assets, open Jakarta Build Tools and load the
standalone inspector:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/red-bull-ring/clear-start/compact/barriers/inspect-catalog.lua"))()
```

Choose the steel item in the Build Tools catalog, then choose the striped concrete.
Each choice prints its `SAMPLE`, `Material`, `MaterialVariant` and `Catalog` info
automatically. No placement or hotkey is required. It reads the exact GUID-named
clone in `workspace.Hover` and observes the real catalog card's `TextButton`
activation. The card name `<catalog name>Button` lets it read the selected
template even before a held clone appears. Press **I**, or run
`_G.RedBullRingBarrierInspector.Selected()` to repeat the current capture.
The inspector queries the ordinary
catalog and reads sample properties. It does not place, modify, delete or save
game objects. It exports the latest report to
`red-bull-ring-barrier-inspection.json` when executor file access is available.
If no catalog match appears, run `_G.RedBullRingBarrierInspector.List()` and
copy the listed Others catalog. Multiple appearance matches remain ambiguous;
a matching catalog name or GUID takes precedence.

This selection contract was checked in the local Jakarta exports of
`Refactored.Tools.PlaceTool (1_199602).lua` and
`Refactored.UI.CatalogBuilder (1_199617).lua` inside
`Monza/[14005966837] Jakarta`. Those are game UI source references; the circuit
barrier geometry still comes from the Red Bull Ring GLB.

Run `node inspect-glb.mjs` and `node extract-reference.mjs` from this directory
to reproduce the review with the original local GLB. An explicit GLB path can
also be passed as the first argument. `materials-0-94.png` and
`materials-95-133.png` are contact sheets labelled by zero-based material ID;
`material-index.json` records names, triangle counts and world bounds.

Run the inspector tests from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File red-bull-ring/clear-start/compact/barriers/test-inspector.ps1
```
