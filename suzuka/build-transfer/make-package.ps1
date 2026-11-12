param([string]$OutputDirectory = (Join-Path $PSScriptRoot '..\..\..\Suzuka'))
$ErrorActionPreference = 'Stop'
$outputPath = [IO.Path]::GetFullPath($OutputDirectory)
$folder = Join-Path $outputPath 'JakartaTransfer'
[void][IO.Directory]::CreateDirectory($folder)
foreach ($name in @('transfer.lua', 'copy-local.lua', 'paste-local.lua', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $folder $name) -Force
}
$archivePath = Join-Path $outputPath 'jakarta-transfer.zip'
Compress-Archive -LiteralPath $folder -DestinationPath $archivePath -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    foreach ($name in @('transfer.lua', 'copy-local.lua', 'paste-local.lua', 'README.md')) {
        $entry = $archive.GetEntry("JakartaTransfer/$name")
        if (-not $entry) { $entry = $archive.GetEntry("JakartaTransfer\$name") }
        if (-not $entry) { throw "Package is missing $name" }
        $reader = [IO.StreamReader]::new($entry.Open())
        try {
            if ($reader.ReadToEnd() -cne [IO.File]::ReadAllText((Join-Path $PSScriptRoot $name))) { throw "Package contents differ: $name" }
        } finally { $reader.Dispose() }
    }
} finally { $archive.Dispose() }
Write-Output "Verified local package: $archivePath"
