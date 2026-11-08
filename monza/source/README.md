# Monza racetrack data

Copied from the already downloaded [TUMFTM/racetrack-database](https://github.com/TUMFTM/racetrack-database) repository, commit `e59595d1f3573b30d1ded6a08984935b957688e0`. Files are extracted directly from that Git commit. File hashes are recorded in `source-info.json`.

- `Monza.csv`: 1,159 centreline points with columns `x_m,y_m,w_tr_right_m,w_tr_left_m`. Coordinates and widths are in metres; the closed centreline is approximately 5.790 km long.
- `Monza-raceline.csv`: 1,152 points on the repository's optimized racing line, with columns `x_m,y_m`.
- `Monza-raceline.png` and `Monza-curvature.png`: the repository's racing-line and curvature previews.
- `LICENSE`: the upstream GNU LGPL v3 licence.
- `racetrack-database-README.md`: upstream data format and source/accuracy notes.

These CSVs contain horizontal layout and widths, without elevation, kerb geometry, buildings or a pit-lane route. The existing Monza GLB and other assets remain in the parent folder.
