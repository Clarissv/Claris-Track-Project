import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function multiply(a, b) {
  return Array.from({ length: 16 }, (_, i) => {
    const row = i % 4, col = Math.floor(i / 4);
    return [0, 1, 2, 3].reduce((s, k) => s + a[k * 4 + row] * b[col * 4 + k], 0);
  });
}
export function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  let [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const norm = Math.hypot(x, y, z, w);
  [x, y, z, w] = [x, y, z, w].map(v => v / norm);
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
export function transform(m, x, y, z) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}
export function readGlb(filename) {
  const data = fs.readFileSync(filename);
  if (data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) throw Error('Invalid GLB 2 container');
  let json, bin;
  for (let offset = 12; offset < data.length;) {
    const size = data.readUInt32LE(offset), type = data.readUInt32LE(offset + 4);
    if (offset + 8 + size > data.length) throw Error('Truncated GLB chunk');
    const chunk = data.subarray(offset + 8, offset + 8 + size);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString());
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + size;
  }
  if (!json || !bin) throw Error('GLB requires JSON and BIN chunks');
  return { json, bin, sha256: crypto.createHash('sha256').update(data).digest('hex') };
}
export function accessor(glb, index) {
  const a = glb.json.accessors[index];
  if (a.sparse) throw Error('Sparse accessor unsupported');
  const bv = glb.json.bufferViews[a.bufferView];
  if ((bv.buffer ?? 0) !== 0) throw Error('External buffers unsupported');
  const types = { 5120: ['readInt8', 1], 5121: ['readUInt8', 1], 5122: ['readInt16LE', 2], 5123: ['readUInt16LE', 2], 5125: ['readUInt32LE', 4], 5126: ['readFloatLE', 4] };
  const [read, bytes] = types[a.componentType] ?? [];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  if (!read || !n) throw Error('Unsupported accessor type');
  const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = bv.byteStride ?? bytes * n;
  const out = new Float64Array(a.count * n);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) {
    let v = glb.bin[read](start + i * stride + c * bytes);
    if (a.normalized && a.componentType !== 5126) {
      const max = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535, 5125: 4294967295 }[a.componentType];
      v = Math.max(-1, v / max);
    }
    out[i * n + c] = v;
  }
  return out;
}
const paeth = (a, b, c) => {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
};
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('Texture is not PNG');
  let width, height, depth, type, interlace, palette, alpha;
  const chunks = [];
  for (let o = 8; o < buffer.length;) {
    const size = buffer.readUInt32BE(o), name = buffer.toString('ascii', o + 4, o + 8), chunk = buffer.subarray(o + 8, o + 8 + size);
    if (name === 'IHDR') { width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4); depth = chunk[8]; type = chunk[9]; interlace = chunk[12]; }
    if (name === 'IDAT') chunks.push(chunk);
    if (name === 'PLTE') palette = chunk;
    if (name === 'tRNS') alpha = chunk;
    o += size + 12;
    if (name === 'IEND') break;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (depth !== 8 || interlace !== 0 || !channels) throw Error(`Unsupported PNG format depth=${depth} type=${type} interlace=${interlace}`);
  const stride = width * channels, raw = zlib.inflateSync(Buffer.concat(chunks));
  if (raw.length !== (stride + 1) * height) throw Error('Invalid PNG scanline size');
  const scan = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw Error('Unknown PNG filter');
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, left = x >= channels ? scan[at - channels] : 0, up = y ? scan[at - stride] : 0, ul = y && x >= channels ? scan[at - stride - channels] : 0;
      scan[at] = (raw[y * (stride + 1) + 1 + x] + [0, left, up, Math.floor((left + up) / 2), paeth(left, up, ul)][filter]) & 255;
    }
  }
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = i * channels, q = i * 4;
    if (type === 3) {
      const idx = scan[p];
      pixels[q] = palette[idx * 3]; pixels[q + 1] = palette[idx * 3 + 1]; pixels[q + 2] = palette[idx * 3 + 2]; pixels[q + 3] = alpha?.[idx] ?? 255;
    } else {
      pixels[q] = scan[p]; pixels[q + 1] = type === 0 || type === 4 ? scan[p] : scan[p + 1]; pixels[q + 2] = type === 0 || type === 4 ? scan[p] : scan[p + 2];
      pixels[q + 3] = type === 4 ? scan[p + 1] : type === 6 ? scan[p + 3] : 255;
    }
  }
  return { width, height, pixels };
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function pngChunk(name, data) {
  const kind = Buffer.from(name), payload = Buffer.concat([kind, data]);
  let crc = 0xffffffff;
  for (const b of payload) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  const head = Buffer.alloc(4), tail = Buffer.alloc(4);
  head.writeUInt32BE(data.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([head, payload, tail]);
}
export function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}
export function loadScene(glb) {
  const primitives = [], bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const images = glb.json.images.map(image => {
    if (image.mimeType !== 'image/png' || image.bufferView === undefined) throw Error('Only embedded PNG textures supported');
    const bv = glb.json.bufferViews[image.bufferView];
    return decodePng(glb.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
  });
  function visit(index, parent) {
    const node = glb.json.nodes[index], matrix = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) for (const p of glb.json.meshes[node.mesh].primitives) {
      if ((p.mode ?? 4) !== 4) throw Error('Only triangle meshes supported');
      const positions = accessor(glb, p.attributes.POSITION);
      for (let i = 0; i < positions.length; i += 3) {
        const pos = transform(matrix, ...positions.subarray(i, i + 3));
        positions.set(pos, i);
        for (let c = 0; c < 3; c++) { bounds.min[c] = Math.min(bounds.min[c], pos[c]); bounds.max[c] = Math.max(bounds.max[c], pos[c]); }
      }
      const material = glb.json.materials?.[p.material] ?? {}, pbr = material.pbrMetallicRoughness ?? {};
      const tex = pbr.baseColorTexture, texture = tex === undefined ? undefined : glb.json.textures[tex.index];
      if (tex && (tex.texCoord ?? 0) !== 0) throw Error('Only TEXCOORD_0 supported');
      primitives.push({ positions, indices: p.indices === undefined ? Float64Array.from({ length: positions.length / 3 }, (_, i) => i) : accessor(glb, p.indices), uv: p.attributes.TEXCOORD_0 === undefined ? undefined : accessor(glb, p.attributes.TEXCOORD_0), image: texture && images[texture.source], sampler: texture && glb.json.samplers?.[texture.sampler], color: pbr.baseColorFactor ?? [1, 1, 1, 1], material });
    }
    for (const child of node.children ?? []) visit(child, matrix);
  }
  for (const root of glb.json.scenes[glb.json.scene ?? 0].nodes) visit(root, identity);
  return { primitives, bounds };
}
export function wrapUv(v, mode = 10497) {
  if (mode === 33071) return Math.max(0, Math.min(1, v));
  if (mode === 33648) { const t = ((v % 2) + 2) % 2; return t > 1 ? 2 - t : t; }
  return v - Math.floor(v);
}
export function sample(p, a, b, c, wa, wb, wc) {
  let color = p.color.slice();
  if (p.image && p.uv) {
    const u = wrapUv(p.uv[a * 2] * wa + p.uv[b * 2] * wb + p.uv[c * 2] * wc, p.sampler?.wrapS);
    const v = wrapUv(p.uv[a * 2 + 1] * wa + p.uv[b * 2 + 1] * wb + p.uv[c * 2 + 1] * wc, p.sampler?.wrapT);
    const x = Math.min(p.image.width - 1, Math.floor(u * p.image.width)), y = Math.min(p.image.height - 1, Math.floor(v * p.image.height));
    const at = (y * p.image.width + x) * 4;
    // glTF texture RGB is sRGB; factors are linear.
    color = [0, 1, 2].map(i => {
      const srgb = p.image.pixels[at + i] / 255;
      const linear = (srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4) * p.color[i];
      return linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
    });
    color[3] = p.image.pixels[at + 3] / 255 * p.color[3];
  }
  return color;
}
export function rasterize(scene, width, cell) {
  const scale = width / (scene.bounds.max[0] - scene.bounds.min[0]);
  const nx = Math.ceil(width / cell), nz = Math.ceil((scene.bounds.max[2] - scene.bounds.min[2]) * scale / cell);
  const heights = new Float64Array(nx * nz).fill(-Infinity), pixels = Buffer.alloc(nx * nz * 4);
  const slopesX = new Float64Array(nx * nz), slopesZ = new Float64Array(nx * nz), roles = new Array(nx * nz);
  let triangles = 0;
  for (const p of scene.primitives) {
    for (let i = 0; i < p.indices.length; i += 3) {
      triangles++;
      const [a, b, c] = p.indices.subarray(i, i + 3);
      const pos = [a, b, c].map(j => [((p.positions[j * 3] - scene.bounds.min[0]) * scale / cell), p.positions[j * 3 + 1] * scale, ((p.positions[j * 3 + 2] - scene.bounds.min[2]) * scale / cell)]);
      const [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] = pos;
      const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(den) < 1e-9) continue; // Vertical/degenerate faces have no top-down area.
      const gradientX = ((by - ay) * (cz - az) - (cy - ay) * (bz - az)) / den / cell;
      const gradientZ = ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / den / cell;
      // Near-vertical faces cannot be represented as road slabs. Barrier faces take the voxel route.
      if (p.role && Math.hypot(gradientX, gradientZ) > 0.5) continue;
      const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5)), x1 = Math.min(nx - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
      const z0 = Math.max(0, Math.ceil(Math.min(az, bz, cz) - 0.5)), z1 = Math.min(nz - 1, Math.floor(Math.max(az, bz, cz) - 0.5));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const wa = ((bz - cz) * (x + 0.5 - cx) + (cx - bx) * (z + 0.5 - cz)) / den;
        const wb = ((cz - az) * (x + 0.5 - cx) + (ax - cx) * (z + 0.5 - cz)) / den, wc = 1 - wa - wb;
        if (Math.min(wa, wb, wc) < -1e-7) continue;
        const height = wa * ay + wb * by + wc * cy, at = z * nx + x;
        if (height < heights[at] - 1e-5) continue;
        const rgba = sample(p, a, b, c, wa, wb, wc);
        if (p.material.alphaMode === 'MASK' && rgba[3] < (p.material.alphaCutoff ?? 0.5)) continue;
        if (p.material.alphaMode === 'BLEND' && rgba[3] < 0.5) continue;
        heights[at] = height;
        slopesX[at] = gradientX; slopesZ[at] = gradientZ; roles[at] = p.role;
        for (let k = 0; k < 3; k++) pixels[at * 4 + k] = Math.round(Math.max(0, Math.min(1, rgba[k])) * 255);
        pixels[at * 4 + 3] = 255;
      }
    }
  }
  return { nx, nz, cell, scale, heights, pixels, slopesX, slopesZ, roles, triangles };
}
export const palette = [
  { name: 'asphalt', rgb: [65, 66, 66], material: 'Asphalt' },
  { name: 'dark', rgb: [31, 33, 34], material: 'SmoothPlastic' },
  { name: 'concrete', rgb: [130, 132, 133], material: 'Concrete' },
  { name: 'white', rgb: [220, 220, 216], material: 'SmoothPlastic' },
  { name: 'grass', rgb: [76, 102, 48], material: 'Grass' },
  { name: 'grass-light', rgb: [115, 134, 68], material: 'Grass' },
  { name: 'trees', rgb: [40, 64, 30], material: 'Grass' },
  { name: 'sand', rgb: [172, 152, 116], material: 'Sand' },
  { name: 'red', rgb: [177, 43, 41], material: 'SmoothPlastic' },
  { name: 'blue', rgb: [48, 90, 142], material: 'SmoothPlastic' },
  { name: 'yellow', rgb: [208, 172, 55], material: 'SmoothPlastic' },
  { name: 'asphalt-light', rgb: [125, 125, 125], material: 'Asphalt' },
  { name: 'asphalt-dark', rgb: [31, 33, 34], material: 'Asphalt' },
];
export function classify(r, g, b) {
  let candidates;
  if (g > r * 1.09 && g > b * 1.2) candidates = [4, 5, 6];
  else if (r > g * 1.4 && r > b * 1.35) candidates = [8];
  else if (b > r * 1.2 && b > g * 1.1) candidates = [9];
  else if (r > b * 1.4 && g > b * 1.2) candidates = [7, 10];
  else candidates = [0, 1, 2, 3, 7];
  return candidates.reduce((best, i) => {
    const distance = j => palette[j].rgb.reduce((sum, v, k) => sum + (v - [r, g, b][k]) ** 2, 0);
    return distance(i) < distance(best) ? i : best;
  });
}
// Exact rectangle cover of equal color/height cells, capped to the observed client size limit.
export function mergeGrid(keys, nx, nz, maxCells = Infinity) {
  const used = new Uint8Array(nx * nz), rectangles = [];
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const at = z * nx + x, key = keys[at];
    if (used[at] || key === null) continue;
    let w = 1;
    while (x + w < nx && w < maxCells && !used[at + w] && keys[at + w] === key) w++;
    let h = 1;
    outer: while (z + h < nz && h < maxCells) {
      for (let k = 0; k < w; k++) if (used[(z + h) * nx + x + k] || keys[(z + h) * nx + x + k] !== key) break outer;
      h++;
    }
    for (let dz = 0; dz < h; dz++) used.fill(1, (z + dz) * nx + x, (z + dz) * nx + x + w);
    rectangles.push({ x, z, w, h, key });
  }
  return rectangles;
}
// Clip a triangle against a projected cell, retaining its depth and barycentric weights.
function clipPolygon(vertices, axis, boundary, sign) {
  const out = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const insideA = sign * (a[axis] - boundary) >= -1e-10;
    const insideB = sign * (b[axis] - boundary) >= -1e-10;
    if (insideA) out.push(a);
    if (insideA !== insideB) {
      const t = (boundary - a[axis]) / (b[axis] - a[axis]);
      out.push(a.map((v, k) => v + t * (b[k] - v)));
    }
  }
  return out;
}
export function triangleCells(points) {
  const ab = points[1].map((v, k) => v - points[0][k]), ac = points[2].map((v, k) => v - points[0][k]);
  const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const drop = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  if (Math.abs(normal[drop]) < 1e-10) return { cells: [], drop };
  const [u, v] = [0, 1, 2].filter(k => k !== drop);
  const vertices = points.map((p, i) => [p[u], p[v], p[drop], Number(i === 0), Number(i === 1), Number(i === 2)]);
  const u0 = Math.floor(Math.min(...points.map(p => p[u])) + 1e-9), u1 = Math.ceil(Math.max(...points.map(p => p[u])) - 1e-9) - 1;
  const v0 = Math.floor(Math.min(...points.map(p => p[v])) + 1e-9), v1 = Math.ceil(Math.max(...points.map(p => p[v])) - 1e-9) - 1;
  const cells = [];
  for (let j = v0; j <= v1; j++) for (let i = u0; i <= u1; i++) {
    let polygon = clipPolygon(vertices, 0, i, 1);
    polygon = clipPolygon(polygon, 0, i + 1, -1);
    polygon = clipPolygon(polygon, 1, j, 1);
    polygon = clipPolygon(polygon, 1, j + 1, -1);
    if (polygon.length < 3) continue;
    let area = 0;
    polygon.forEach((p, k) => { const q = polygon[(k + 1) % polygon.length]; area += p[0] * q[1] - p[1] * q[0]; });
    if (Math.abs(area) < 1e-10) continue;
    const mean = [3, 4, 5].map(k => polygon.reduce((s, p) => s + p[k], 0) / polygon.length);
    const d0 = Math.floor(Math.min(...polygon.map(p => p[2])) + 1e-9);
    const d1 = Math.max(d0, Math.ceil(Math.max(...polygon.map(p => p[2])) - 1e-9) - 1);
    for (let d = d0; d <= d1; d++) {
      const xyz = []; xyz[u] = i; xyz[v] = j; xyz[drop] = d;
      cells.push({ xyz, weights: mean, priority: Math.min(1, Math.abs(area) / 2) + (drop === 1 ? 2 : 0) });
    }
  }
  return { cells, drop };
}
// These groups were selected by inspecting their source geometry and texture previews.
// The names are opaque; role descriptions are our interpretation of the supplied model.
export const TRACK_GROUPS = {
  road: ['Monza271Mtl'],
  runoff: ['Monza1641Mtl'],
  curb: ['Monza1631Mtl', 'Monza1401Mtl'],
  barrier: ['Monza1451Mtl', 'Monza1121Mtl', 'Monza631Mtl'],
  marking: ['Monza191Mtl', 'Monza1441Mtl', 'Monza1431Mtl', 'Monza1421Mtl', 'Monza661Mtl', 'Monza361Mtl', 'Monza351Mtl', 'Monza261Mtl', 'Monza251Mtl', 'Monza231Mtl', 'Monza221Mtl', 'Monza211Mtl', 'Monza31Mtl', 'Monza51Mtl', 'Monza61Mtl', 'Monza71Mtl', 'Monza81Mtl', 'Monza91Mtl', 'Monza101Mtl', 'Monza121Mtl', 'Monza131Mtl', 'Monza141Mtl', 'Monza151Mtl', 'Monza161Mtl', 'Monza171Mtl'],
  verge: ['Monza1651Mtl', 'Monza401Mtl', 'Monza371Mtl'],
};
export function selectTrackScene(source, margin = 22) {
  const roles = new Map(Object.entries(TRACK_GROUPS).flatMap(([role, names]) => names.map(name => [name, role])));
  const primitives = source.primitives.filter(p => roles.has(p.material.name)).map(p => ({ ...p, role: roles.get(p.material.name) }));
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const p of primitives.filter(p => p.role === 'road' || p.role === 'runoff')) for (let i = 0; i < p.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) { bounds.min[k] = Math.min(bounds.min[k], p.positions[i + k]); bounds.max[k] = Math.max(bounds.max[k], p.positions[i + k]); }
  }
  if (!bounds.min.every(Number.isFinite)) throw Error('Selected road/runoff groups are missing from this GLB');
  for (const k of [0, 2]) { bounds.min[k] -= margin; bounds.max[k] += margin; }
  bounds.min[1] -= 8; bounds.max[1] += 12;
  return { primitives, bounds, margin, sourceTriangleCount: source.primitives.reduce((sum, p) => sum + p.indices.length / 3, 0), excludedGroups: source.primitives.filter(p => !roles.has(p.material.name)).map(p => p.material.name) };
}
export function trackCorridor(scene, width, cell) {
  const grid = rasterize({ ...scene, primitives: scene.primitives.filter(p => p.role === 'road' || p.role === 'runoff') }, width, cell);
  const mask = new Uint8Array(grid.nx * grid.nz), radius = Math.ceil(scene.margin * grid.scale / cell);
  const offsets = [];
  for (let z = -radius; z <= radius; z++) for (let x = -radius; x <= radius; x++) if (x * x + z * z <= radius * radius) offsets.push([x, z]);
  for (let z = 0; z < grid.nz; z++) for (let x = 0; x < grid.nx; x++) if (Number.isFinite(grid.heights[z * grid.nx + x])) {
    for (const [dx, dz] of offsets) if (x + dx >= 0 && x + dx < grid.nx && z + dz >= 0 && z + dz < grid.nz) mask[(z + dz) * grid.nx + x + dx] = 1;
  }
  return { mask, nx: grid.nx };
}
export function surfaceBasis(gx, gz) {
  const rightLength = Math.hypot(1, gx), normalLength = Math.hypot(gx, 1, gz);
  const right = [1 / rightLength, gx / rightLength, 0], up = [-gx / normalLength, 1 / normalLength, -gz / normalLength];
  const back = [right[1] * up[2], -right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
  return { right, up, back };
}
export function surfacePlates(scene, width, cell, ground, thickness = 0.5) {
  const surface = rasterize({ ...scene, primitives: scene.primitives.filter(p => p.role !== 'barrier') }, width, cell);
  const corridor = trackCorridor(scene, width, cell);
  const specs = new Map();
  const keys = Array.from(surface.heights, (height, i) => {
    if (!Number.isFinite(height) || !corridor.mask[i]) return null;
    // Quantize the plane coefficients, not the elevation. This preserves continuous slopes.
    const gx = Math.round(surface.slopesX[i] * 500) / 500, gz = Math.round(surface.slopesZ[i] * 500) / 500;
    const x = (i % surface.nx + 0.5) * cell, z = (Math.floor(i / surface.nx) + 0.5) * cell;
    const intercept = Math.round((height - gx * x - gz * z) * 10) / 10;
    let color = classify(...surface.pixels.subarray(i * 4, i * 4 + 3));
    if (surface.roles[i] === 'road') { if (color === 2) color = 11; if (color === 1) color = 12; }
    const key = `${color}:${gx}:${gz}:${intercept}`;
    specs.set(key, { color, gx, gz, intercept });
    return key;
  });
  const rects = mergeGrid(keys, surface.nx, surface.nz, Math.floor(64 / cell));
  const parts = rects.map(r => {
    const { color, gx, gz, intercept } = specs.get(r.key), { up } = surfaceBasis(gx, gz);
    const x = (r.x + r.w / 2) * cell, z = (r.z + r.h / 2) * cell;
    const y = intercept + gx * x + gz * z - ground;
    // Move the slab under the source surface and overlap neighbors slightly at seams.
    return [round(x - surface.nx * cell / 2 - up[0] * thickness / 2), round(y - up[1] * thickness / 2), round(z - surface.nz * cell / 2 - up[2] * thickness / 2), round(r.w * cell * Math.hypot(1, gx) + 0.08), thickness, round(r.h * cell * Math.hypot(1, gz) + 0.08), color + 1, gx, gz];
  });
  return { parts, surface, keys };
}
export function voxelize(scene, width, cell, vertical) {
  const scale = width / (scene.bounds.max[0] - scene.bounds.min[0]);
  const sizes = [cell, vertical, cell], minimum = scene.bounds.min.map(v => v * scale);
  const dimensions = scene.bounds.max.map((v, k) => Math.ceil((v - scene.bounds.min[k]) * scale / sizes[k]));
  const [nx, ny, nz] = dimensions, length = nx * ny * nz;
  if (length > 50000000) throw Error('Voxel grid too large; increase cell size');
  const colors = new Uint8Array(length), scores = new Float32Array(length).fill(-1);
  const corridor = scene.margin !== undefined ? trackCorridor(scene.corridorScene ?? scene, width, cell) : null;
  const projections = [0, 0, 0];
  let triangles = 0;
  for (const p of scene.primitives) for (let i = 0; i < p.indices.length; i += 3) {
    triangles++;
    const [a, b, c] = p.indices.subarray(i, i + 3);
    const points = [a, b, c].map(index => [0, 1, 2].map(k => (p.positions[index * 3 + k] * scale - minimum[k]) / sizes[k]));
    const { cells, drop } = triangleCells(points);
    projections[drop] += cells.length;
    for (const { xyz: [x, y, z], weights, priority } of cells) {
      if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
      if (corridor && !corridor.mask[z * corridor.nx + x]) continue;
      const at = (y * nz + z) * nx + x;
      const rolePriority = p.role === 'curb' || p.role === 'marking' ? 8 : p.role === 'road' || p.role === 'runoff' ? 4 : 0;
      const score = priority + rolePriority;
      if (score < scores[at]) continue;
      const rgba = sample(p, a, b, c, ...weights);
      if (rgba[3] < (p.material.alphaMode === 'MASK' ? p.material.alphaCutoff ?? 0.5 : 0.5)) continue;
      const rgb = rgba.slice(0, 3).map(v => Math.round(Math.max(0, Math.min(1, v)) * 255));
      colors[at] = classify(...rgb) + 1;
      scores[at] = score;
    }
  }
  return { colors, dimensions, sizes, minimum, scale, triangles, projections };
}
// Pack occupied 3D surface cells into disjoint boxes, keeping empty space empty.
export function mergeVoxels(colors, dimensions, limits, order = [0, 2, 1]) {
  const remaining = colors.slice(), [nx, , nz] = dimensions, boxes = [];
  const strides = [1, nx * nz, nx];
  for (let at = 0; at < remaining.length; at++) {
    const color = remaining[at];
    if (!color) continue;
    const start = [at % nx, Math.floor(at / (nx * nz)), Math.floor(at / nx) % nz], extent = [1, 1, 1];
    for (const axis of order) {
      extend: while (start[axis] + extent[axis] < dimensions[axis] && extent[axis] < limits[axis]) {
        const faceExtent = extent.slice(); faceExtent[axis] = 1;
        const base = at + extent[axis] * strides[axis];
        for (let y = 0; y < faceExtent[1]; y++) for (let z = 0; z < faceExtent[2]; z++) for (let x = 0; x < faceExtent[0]; x++) {
          if (remaining[base + y * strides[1] + z * strides[2] + x] !== color) break extend;
        }
        extent[axis]++;
      }
    }
    for (let y = 0; y < extent[1]; y++) for (let z = 0; z < extent[2]; z++) {
      const base = at + y * strides[1] + z * strides[2];
      remaining.fill(0, base, base + extent[0]);
    }
    boxes.push({ start, extent, color });
  }
  return boxes;
}
const round = n => Math.round(n * 1000) / 1000;
