$ErrorActionPreference = 'Stop'
$extractScript = @'
import fs from 'node:fs';
import path from 'node:path';
import {readGlb} from './mesh-geometry.mjs';
const glb=readGlb('Autodromo Nazionale Monza.glb');
fs.mkdirSync('reference-review',{recursive:true});
for(const index of new Set([1,8].map(i=>glb.json.textures[i].source))) {
  const image=glb.json.images[index],view=glb.json.bufferViews[image.bufferView];
  const extension=image.mimeType==='image/png'?'.png':'.jpg';
  fs.writeFileSync(path.join('reference-review','texture-'+index+extension),glb.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength));
}
'@
Push-Location -LiteralPath $PSScriptRoot
try {
    $extractScript | node --input-type=module
    if ($LASTEXITCODE -ne 0) { throw 'GLB texture extraction failed' }
    Add-Type -AssemblyName System.Drawing
    Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'reference-review') -Filter 'texture-*.jpg' | ForEach-Object {
        $monzaTexture = [Drawing.Image]::FromFile($_.FullName)
        try { $monzaTexture.Save([IO.Path]::ChangeExtension($_.FullName, '.png'), [Drawing.Imaging.ImageFormat]::Png) }
        finally { $monzaTexture.Dispose() }
    }
} finally { Pop-Location }
