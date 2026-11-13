param([switch]$LowSpawn)

$ErrorActionPreference = 'Stop'
$artifactRoot = if ($LowSpawn) { Join-Path $PSScriptRoot 'low-spawn' } else { $PSScriptRoot }
$folderName = if ($LowSpawn) { 'SuzukaLow' } else { 'Suzuka' }
$archiveName = if ($LowSpawn) { 'suzuka-low-spawn-executor.zip' } else { 'suzuka-executor.zip' }
$packageRoot = Join-Path $artifactRoot '.package'
$executorRoot = Join-Path $packageRoot $folderName
New-Item -ItemType Directory -Path $executorRoot -Force | Out-Null
foreach ($name in @('suzuka-builder.lua','suzuka-plan.json','suzuka-checkpoint.lua','suzuka-diagnose.lua','README.md','THIRD-PARTY.txt')) {
    $sourcePath = Join-Path $artifactRoot $name
    if (-not (Test-Path -LiteralPath $sourcePath)) { $sourcePath = Join-Path $PSScriptRoot $name }
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $executorRoot $name) -Force
}
New-Item -ItemType Directory -Path (Join-Path $executorRoot 'source') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'source/LICENSE') -Destination (Join-Path $executorRoot 'source/LICENSE') -Force
foreach ($name in @('suzuka-run.lua','suzuka-moderator-run.lua','suzuka-resume.lua')) {
    Copy-Item -LiteralPath (Join-Path $artifactRoot $name) -Destination (Join-Path $packageRoot $name) -Force
}
Compress-Archive -LiteralPath @($executorRoot,(Join-Path $packageRoot 'suzuka-run.lua'),(Join-Path $packageRoot 'suzuka-moderator-run.lua'),(Join-Path $packageRoot 'suzuka-resume.lua')) -DestinationPath (Join-Path $artifactRoot $archiveName) -Force
Get-Item -LiteralPath (Join-Path $artifactRoot $archiveName) | Select-Object Name,Length
