$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = Join-Path $PSScriptRoot 'monza-terrain-executor.zip'
$stream = [IO.File]::Open($zipPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
try {
    foreach ($name in @('monza-terrain-builder.lua','monza-terrain-plan.json','monza-terrain-diagnose.lua','monza-terrain-checkpoint.lua','monza-terrain-resume.lua')) {
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot $name), ('MonzaTerrain/' + $name), [IO.Compression.CompressionLevel]::Optimal)
    }
    foreach ($name in @('monza-terrain-run.lua','README.md','THIRD-PARTY.txt','monza-terrain-3d-viewer.html','build-3d.png','build-start-point.png','elevation-profile.svg')) {
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot $name), $name, [IO.Compression.CompressionLevel]::Optimal)
    }
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot 'source/LICENSE'), 'source/LICENSE', [IO.Compression.CompressionLevel]::Optimal)
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot 'source/Monza.csv'), 'source/Monza.csv', [IO.Compression.CompressionLevel]::Optimal)
} finally { $archive.Dispose(); $stream.Dispose() }
