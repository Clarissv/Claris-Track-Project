import fs from 'node:fs';

export function lowHeightProfile(plan) {
  const upper = new Set(plan.meta.bridge.pairs.map(p => p.upper));
  const spans = plan.meta.roadSegments.filter(s => upper.has(s.index));
  const start = Math.min(...spans.map(s => plan.centerline[s.start][5])) - 80;
  const end = Math.max(...spans.map(s => plan.centerline[s.end][5])) + 80;
  return {name: 'low-spawn', heightScale: 0.1, bridgeRiseStuds: 22, bridgeStartStuds: start, bridgeEndStuds: end, rampLengthStuds: 1400};
}

export function bridgeRise(s, profile) {
  const {bridgeStartStuds: start, bridgeEndStuds: end, rampLengthStuds: run, bridgeRiseStuds: rise} = profile;
  const t = s < start ? (s - start + run) / run : s > end ? (end + run - s) / run : 1;
  if (t <= 0) return {height: 0, slope: 0};
  if (t >= 1) return {height: rise, slope: 0};
  return {height: rise * t * t * (3 - 2 * t), slope: rise * 6 * t * (1 - t) / run * (s < start ? 1 : -1)};
}

export function lowerReference(reference, points, profile) {
  const records = reference.records.map(r => {
    const before = points[Math.max(0, r.index - 1)].pos;
    const after = points[Math.min(points.length - 1, r.index + 1)].pos;
    const length = Math.hypot(after[0] - before[0], after[2] - before[2]);
    const tx = (after[0] - before[0]) / length, tz = (after[2] - before[2]) / length;
    const bump = bridgeRise(points[r.index].s, profile);
    const gx = r.gx * profile.heightScale + bump.slope * tx;
    const gz = r.gz * profile.heightScale + bump.slope * tz;
    const right = points[r.index].right, h = Math.hypot(right[0], right[2]);
    return {...r, height: r.height * profile.heightScale + bump.height, gx, gz, bank: (gx * right[0] + gz * right[2]) / h};
  });
  return {...reference, method: 'Low spawn profile with gentler hills and a separate crossover ramp', heightProfile: profile, records};
}

export function readLowHeightProfile() {
  return lowHeightProfile(JSON.parse(fs.readFileSync(new URL('suzuka-plan.json', import.meta.url))));
}
