# Kerb and runoff reference

The flat variant uses the supplied [Sepang 2025 model](https://sketchfab.com/3d-models/sepang-international-circuit-2025-layout-590bf243480e43f18e588a3908daa4df) as a placement reference. This improves on kerbs inferred solely from CSV curvature. It has not been independently checked against a survey or recent aerial/onboard imagery.

The derived [surface trace](source/sepang-kerbs.json) records the model SHA-256, frozen centreline hash, coordinate frame, extraction settings, source sample positions and colours, kerb zones and runoff profiles. The original GLB and textures are excluded from publication.

| Model material | Interpretation after geometry and texture inspection |
| --- | --- |
| `Sepang101Mtl` | Narrow red/white concrete kerb strips, grooves and blue edge details. Horizontal red/white faces supply the kerb trace. |
| `Sepang1401Mtl` | Grey driving strip and pit lane. Used to determine which side a kerb occupies and where runoff widths begin. |
| `Sepang1641Mtl` | Broad pale textured runoff areas. Represented with the existing gravel/sand palette. |
| `Sepang1631Mtl` | Broad red, white, yellow and blue runoff bands. These remain level rather than becoming raised kerbs. |
| `Sepang271Mtl` | Broad circuit base, retained only as part of the original alignment bounds. It is too wide to infer kerb sides reliably. |

The names have no semantic meaning; these descriptions are interpretations of the supplied asset. The grey full-circuit strip and multicolour runoff patches are not treated as raised red/white kerbs.

Kerb faces are sampled at approximately 0.9-stud spacing. The model driving strip resolves their side, including places where the CSV fit drifts across the model road. Small gaps up to 5 studs are closed to account for sampling/grooves, and zones shorter than 12 studs are discarded. Source stripe colours are sampled along those zones instead of imposing a new evenly spaced stripe pattern. Baked shading opacity is ignored during footprint extraction so it does not create missing road/runoff cells.

Runoff cross-sections are sampled every four centreline points, at 2-stud lateral intervals, out to 220 studs from the model driving strip. Areas associated with a different nearby straight or hairpin are excluded. Adjacent sections with similar widths/colours are combined into level rectangular slabs; small isolated atlas details are discarded. The original pit-entry apron is retained as the standing/build anchor.

Both traces are projected onto the existing CSV-derived layout. The layout stays at 2x scale, with the main road widened by 25% and the pit lane independently widened. Runoff widths are measured from the model driving edge and then moved to the wider flat road edge. Kerbs retain a custom 3.2-stud-wide low ramp rising to 0.12 studs, with 12-stud end tapers. These changes deliberately adapt the model for the game's vehicles: original kerb widths, ridges, banking and elevations are not copied.

The asphalt, pit lane and apron sit 0.25 studs above the existing grass. Runoff remains horizontal, 0.004-0.008 studs below the asphalt. The tiny offsets keep overlapping colour slabs from flickering with the road or kerbs. Rectangular outer boundaries remain approximate. Driving with the actual vehicles and server saving still require in-game verification.

The cleanup in `tidy-runoff.mjs` works on the derived cross-sections without editing the frozen trace. It removes isolated thin fragments, selects the main gravel/red-white area and its associated colour bands, bridges small missing sections, closes road-to-runoff and inter-band grass slivers, and smooths sampled boundaries by up to 4 studs. Nearby separate blue edge details are excluded so they do not become large infill arms. The tidied shapes therefore include deliberate footprint adjustments for this game, beyond a direct copy of the model.

Compatible runoff sections combine into slabs up to 128 studs long. Changing widths and tight turns split those slabs; dense road and kerb geometry retain their previous precision. White edge markings use fewer pieces with a maximum 0.12-stud path approximation. Geometry checks cover each white-line path and the full width of every retained runoff section.

Regenerate the plan from the included trace with `npm.cmd run generate`. To re-extract the trace, supply the same original GLB:

```powershell
node extract-kerbs.mjs "..\Sepang Old\source\sepang.glb"
node compile-flat.mjs
```

The extractor rejects a GLB that differs from the frozen reference hash.
