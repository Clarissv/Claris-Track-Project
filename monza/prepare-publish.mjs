import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packageRuntime} from './package-ribbons.mjs';
import {makeRelease} from './make-github-release.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
packageRuntime(here);
const manifest=makeRelease(here);
console.log(JSON.stringify({directory:here,parts:manifest.partCount,release:manifest.version,entry:'https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/monza/loader.lua'},null,2));
