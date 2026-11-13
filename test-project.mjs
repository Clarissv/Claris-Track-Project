import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const maps=['sepang','sepang/flat','monza','monza/terrain','red-bull-ring','red-bull-ring/clear-start','red-bull-ring/clear-start/compact','red-bull-ring/clear-start/compact/barriers','spa','spa/barriers','suzuka'];

test('the project has one top-level directory for each circuit',()=>{
  const dirs=fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory()&&!x.name.startsWith('.')&&x.name!=='node_modules').map(x=>x.name).sort();
  assert.deepEqual(dirs,['monza','red-bull-ring','sepang','spa','suzuka']);
  assert(fs.existsSync(path.join(root,'monza/save-debug/observe.lua')));
});

test('each relocated release keeps its bytes and points to assets in this repository',()=>{
  for(const map of maps){
    const directory=path.join(root,map),manifest=JSON.parse(fs.readFileSync(path.join(directory,'release-manifest.json')));
    for(const file of manifest.files){
      const body=fs.readFileSync(path.join(directory,file.path));
      assert.equal(body.length,file.bytes,`${map}/${file.path}`);
      assert.equal(crypto.createHash('sha256').update(body).digest('hex'),file.sha256,`${map}/${file.path}`);
    }
    const loader=fs.readFileSync(path.join(directory,'loader.lua'),'utf8');
    assert(loader.includes(`https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/${map}/releases/${manifest.version}/`),map);
    assert.equal(loader,fs.readFileSync(path.join(directory,'releases',manifest.version,'loader.lua'),'utf8'));
    for(const release of fs.readdirSync(path.join(directory,'releases'))){
      const pinned=path.join(directory,'releases',release,'loader.lua');
      if(!fs.existsSync(pinned))continue;
      const text=fs.readFileSync(pinned,'utf8'),match=text.match(/local BASE = "https:\/\/raw\.githubusercontent\.com\/Clarissv\/Claris-Track-Project\/main\/([^"]+)"/);
      assert(match,`${map}/${release}`);
      assert.equal(match[1],`${map}/releases/${release}/`);
      for(const name of new Set([...text.matchAll(/(?:compile|download)\("([^"]+)"\)/g)].map(x=>x[1])))assert(fs.existsSync(path.join(root,match[1],name)),`${map}/${release}/${name}`);
    }
  }
});
