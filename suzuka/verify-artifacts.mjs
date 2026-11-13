import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const here=new URL(process.env.SUZUKA_LOW_SPAWN==='1'?'./low-spawn/':'./',import.meta.url),read=name=>fs.readFileSync(new URL(name,here)),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),plan=JSON.parse(read('suzuka-plan.json')),manifest=JSON.parse(read('release-manifest.json'));
for(const entry of manifest.files){const body=read(entry.path);assert.equal(body.length,entry.bytes);assert.equal(sha(body),entry.sha256);}
const runtime=JSON.parse(read(`releases/${manifest.version}/runtime-plan.json`));assert.equal(sha(Buffer.from(JSON.stringify(runtime.parts))),sha(Buffer.from(JSON.stringify(plan.parts))),'Release geometry differs from the generated plan');assert.equal(sha(Buffer.from(JSON.stringify(runtime.meta))),sha(Buffer.from(JSON.stringify(plan.meta))),'Release metadata differs from the generated plan');
const html=read('suzuka-3d-viewer.html').toString();assert.ok(!html.includes('/* GENERATED_DATA */'));assert.ok(!html.includes('/* SOURCE_ELEVATION */'));
const events=new Map(),elements=new Map(),draws=[],buffers=[];
const gl=new Proxy({createShader:()=>({}),getShaderParameter:()=>true,createProgram:()=>({}),getProgramParameter:()=>true,createBuffer:()=>({}),getUniformLocation:()=>({}),bufferData:(_,data)=>buffers.push(data.length),drawArraysInstanced:(_,a,b,count)=>draws.push(count)}, {get:(t,k)=>k in t?t[k]:()=>{}});
const element=id=>{if(!elements.has(id))elements.set(id,{checked:false,addEventListener:(name,callback)=>events.set(`${id}:${name}`,callback),getContext:()=>gl});return elements.get(id);};
const context={document:{getElementById:element},innerWidth:1600,innerHeight:1100,devicePixelRatio:1,window:{}};vm.createContext(context);vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1],context);
assert.equal(draws.at(-1),plan.parts.length+1);element('reference').checked=true;element('reference').onchange();assert.equal(draws.at(-1),plan.parts.length+1+Math.ceil((plan.centerline.length-1)/8));element('reference').checked=false;element('pitentry').onclick();assert.equal(draws.at(-1),plan.parts.length+1);
if(process.argv.includes('--reference-page'))fs.writeFileSync(new URL('browser-reference-check.html',here),html.replace('window.onresize=draw;draw();',"window.onresize=draw;draw();document.getElementById('reference').checked=true;document.getElementById('snake').onclick();"));
element('pitbase').onclick();assert.equal(draws.at(-1),plan.parts.length+1);
if(process.argv.includes('--reference-page'))fs.writeFileSync(new URL('browser-pit-base-check.html',here),html.replace('window.onresize=draw;draw();',"window.onresize=draw;draw();document.getElementById('pitbase').onclick();"));
console.log(JSON.stringify({release:manifest.version,parts:plan.parts.length,releaseHashes:'passed',runtimeMatchesPlan:true,previewAndReferenceToggle:'passed'}));
