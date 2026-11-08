import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
export function packageRuntime(directory) {
  const template=fs.readFileSync(path.join(directory,'builder-template.luau'),'utf8').replace(/\r\n?/g,'\n');
  const loader=fs.readFileSync(path.join(directory,'plan-loader.luau'),'utf8').replace(/\r\n?/g,'\n');
  if(template.split('-- GENERATED_DATA').length!==2)throw Error('Missing data marker');
  fs.writeFileSync(path.join(directory,'monza-builder.lua'),template.replace('-- GENERATED_DATA',()=>loader));
  fs.copyFileSync(path.join(directory,'launcher-template.luau'),path.join(directory,'monza-run.lua'));
  if(process.platform==='win32')execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(directory,'package-ribbons.ps1')],{windowsHide:true,stdio:'pipe'});
}
