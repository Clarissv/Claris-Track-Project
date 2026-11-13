# Spa source references

The elevation and surface classifications come from the user's 2022 Spa GLB,
kept outside this repository at `Spa-Francorchamps/source/spa.glb`. The GLB's
node transform is applied before sampling: its local Z axis is vertical.
The large original model and textures are not included in the GitHub package.

`Spa.csv` is the unmodified centreline/width file from
[TUMFTM/racetrack-database](https://github.com/TUMFTM/racetrack-database),
snapshot commit `e59595d1f3573b30d1ded6a08984935b957688e0`, licensed under
LGPLv3; see `LICENSE.racetrack-database`. It contains horizontal coordinates
and left/right widths, with no elevation data. The CSV aligns to the GLB
using a fitted similarity transform; model heights are then sampled along it.

The vehicle units conversion is 2.6884487796 studs per metre. The additional
layout multiplier is **1**, versus **1.5** for Red Bull Ring. The racing
asphalt has a minimum width of 40 studs for the existing cars.

Reviewed GLB material IDs:

| Surface | Material IDs |
|---|---|
| Racing asphalt | 84, 60, 75 |
| Pit pavement | 46, 61, 59 |
| Kerbs | 26, 69 |
| Gravel | 13, 64 |
| Ground | 65, 62 |
| Paved extensions | 3, 41, 63, 66, 68, plus asphalt 84/60/75 outside the CSV road edges |
| Former steel barrier runs | 21 |
| Concrete/other barrier runs | 6, 7, 24 |

The barrier reference follows projected GLB faces, including their openings.
Fitting moves or omits unsafe fragments rather than inventing a circuit-wide
barrier perimeter. Former steel runs use resizable grey Others68 concrete,
following the accepted Red Bull Ring approach.

`user-pit-route.json` records the yellow line traced from the user's pit
reference. The entry branches at the final chicane; the exit bypasses La
Source and merges at CSV sample 100. Both horizontal coordinates are smoothed
with the same distance parameter. The final approach ends in a 70-stud-radius
arc tangent to the main road. The old downhill pit lane is excluded.

Run-off extraction samples the GLB surface on both sides of the CSV road,
rejecting projections from nearby track sections at a different elevation.
The grey Eau Rouge pavement and pale uphill aprons are retained as reference
footprints. Their appearance is transferred to fitted recovery skins; separate
overlapping pavement blocks are omitted to prevent exposed collision ledges.
Footprint edges are approximated with rectangular parts.
