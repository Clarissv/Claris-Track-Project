import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(here,'release-manifest.json')));
console.log(JSON.stringify({directory:here,trackParts:manifest.partCount-manifest.terrainPartCount,terrainParts:manifest.terrainPartCount,totalWithExistingGrass:manifest.totalWithExistingGrass,release:manifest.version},null,2));
