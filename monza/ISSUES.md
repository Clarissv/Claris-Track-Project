# Placement, saving and grass coverage

The previous "Identify installed rea" chat produced the current smoothed Jakarta
plan: 10,047 parts, an 11,000 local guard, and separate immutable releases.
This update keeps that geometry and its checkpoint compatibility.

## Why the game reported 10,038 objects

The old matcher accepted pre-existing objects within 0.25 studs of a target and
0.05 studs of its size. Ten distinct tiny pieces satisfied those tolerances for
an earlier neighbour: one edge marking, eight kerbs, and one sand piece.
`node analyze-build.mjs` reproduces **10,037 actual track placements + 1 grass
plate = 10,038 objects**. The report lists each skipped index and its neighbour.
This is a builder bug, rather than ten objects disappearing during saving.

The corrected builder reserves each object/UUID for one plan index and uses
0.01-stud position/size tolerances for pre-existing geometry. The original ten
pairs all fall outside the tighter reuse tolerance. New replication results
retain their original tolerances. Pause, completion, checkpoint export and the
diagnostic query `BuildSaver("GetPlacedAmount")`, the game's own save count.
With exactly one existing grass plate, the corrected full build expects 10,048.

## Recovering a matching old build

1. While the old builder is still loaded, pause and export a checkpoint through
   its checkpoint loader. Keep the game build currently loaded. A checkpoint
   does not save game objects and cannot restore an unsuccessful slot save.
2. Publish this prepared release, then load the new loader in `"resume"` mode.
   Its unchanged geometry accepts the old smoothed Jakarta checkpoint.
3. Click **Repair missing parts**, or run `_G.MonzaBuilder.Repair()`.
   This checks the entire plan at the recorded origin, reuses matching objects
   once, and adds only missing parts. It respects the local object guard and any
   confirmed save limit. A pending uncertain placement must be reconciled first.
4. After completion, use **Check server count**, then try the game's save UI.

If rejoining, first load the partial slot that actually saved. Repair scans that
partial build and completes what is missing; it does not trust a later progress
index as proof that those objects survived. The repair can take a full scan of
the circuit because parts must be streamed before they can be inspected.

## Why the save failure remains unresolved

The reported observations are a successful Monza save around 7,300, a successful
Sepang save around 9,000, and failed Monza saves around 9,900 and at completion.
The only notification is "Failed to save", with no console error. The existing
client export shows the count query and slot requests, but contains no server
save handler or serialization format. It cannot establish an object cap,
payload limit, invalid serialized field, or storage failure.

Fixing the ten missing parts does **not** establish that saving is fixed. The
new checks distinguish a placement/count discrepancy from a subsequent slot
save failure. A successful 9k Sepang save also does not prove an identically
sized Monza save has the same serialized size. No exact server limit is assumed.
The full visual detail is retained. Pausing and saving partial builds does not
reduce the final saved build's size.

## Estimated additional grass blocks

Counts use the current plan at Scale=1, the game's 2,048-stud per-axis size
limit, and a 150-stud margin beyond the road on each side. These are coverage
estimates; grass has not been added to the plan.

| Coverage | Additional blocks | Total with track and existing grass |
|---|---:|---:|
| Flat rectangular base, 3,814 × 6,994 studs, 2 × 4 tiles | 8 | 10,056 |
| Coarse side regions on a 1,024-stud grid | 25 | 10,073 |
| Coarse side regions on a 512-stud grid | 60 | 10,108 |
| Smaller side regions on a 256-stud grid | 179 | 10,227 |

The base can cover the whole footprint with just eight blocks. A flat base
leaves elevated stretches up to about 68 studs above the ground. To reduce that
floating appearance without following every crest, use approximately 25–60
coarse raised grass regions. Their tops must be checked against **all** road,
kerb and runoff footprints they overlap; taller flat blocks can otherwise
protrude through lower track sections. Their coverage count does not promise
continuous contact with every elevated road edge.

Both suggested coarse options remain below the local 11,000-object guard.
That guard is not evidence that the resulting build will save successfully.
