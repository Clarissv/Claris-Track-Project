export * from './generate-reference.mjs';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {generate} from './generate-reference.mjs';
if(process.argv[1]===fileURLToPath(import.meta.url)){const p=generate();fs.writeFileSync(new URL('barrier-plan.json',import.meta.url),JSON.stringify(p));console.log(JSON.stringify({parts:p.parts.length,groups:Object.fromEntries(Object.entries(p.meta.groups).map(([k,v])=>[k,v.length])),chains:p.meta.chains.length,audit:p.meta.audit,reference:p.meta.reference},null,2));}
