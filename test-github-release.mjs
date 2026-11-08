import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
test('GitHub release preserves every part and keeps all remote assets in the pinned release',()=> {
  const manifest=JSON.parse(fs.readFileSync(path.join(here,'release-manifest.json'),'utf8'));
  const complete=JSON.parse(fs.readFileSync(path.join(here,'sepang-plan.json'),'utf8'));
  const runtime=JSON.parse(fs.readFileSync(path.join(here,'releases',manifest.version,'runtime-plan.json'),'utf8'));
  assert.deepEqual(runtime.parts,complete.parts);
  for(const key of ['format','partCount','palette','planBounds'])assert.deepEqual(runtime.meta[key],complete.meta[key]);
  assert.equal(manifest.partCount,14815);
  for(const entry of manifest.files) {
    assert.ok(entry.path.startsWith('releases/'+manifest.version+'/'));
    const body=fs.readFileSync(path.join(here,entry.path));
    assert.equal(body.length,entry.bytes);
    assert.equal(crypto.createHash('sha256').update(body).digest('hex'),entry.sha256);
  }
  const loader=fs.readFileSync(path.join(here,'loader.lua'),'utf8');
  assert.ok(loader.includes('https://raw.githubusercontent.com/Clarissv/Sepang/main/releases/'+manifest.version+'/'));
  assert.ok(!loader.includes('__RELEASE_BASE__'));
  assert.ok(Buffer.byteLength(JSON.stringify(runtime))<Buffer.byteLength(JSON.stringify(complete)));
});
