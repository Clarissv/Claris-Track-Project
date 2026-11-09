$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = Join-Path $PSScriptRoot 'sepang-ribbons-executor.zip'
$stream = [IO.File]::Open($zipPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
try {
    foreach ($name in @('sepang-builder.lua','sepang-plan.json','sepang-diagnose.lua','sepang-checkpoint.lua','sepang-resume.lua')) {
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot $name), ('SepangFlat/' + $name), [IO.Compression.CompressionLevel]::Optimal)
    }
    foreach ($name in @('sepang-run.lua','README.md','THIRD-PARTY.txt','sepang-3d-viewer.html','build-3d.png','build-start-point.png','elevation-profile.svg')) {
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot $name), $name, [IO.Compression.CompressionLevel]::Optimal)
    }
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot 'source/LICENSE'), 'source/LICENSE', [IO.Compression.CompressionLevel]::Optimal)
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot 'source/Sepang.csv'), 'source/Sepang.csv', [IO.Compression.CompressionLevel]::Optimal)
} finally { $archive.Dispose(); $stream.Dispose() }
