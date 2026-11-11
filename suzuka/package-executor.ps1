$ErrorActionPreference = 'Stop'
$packageRoot = Join-Path $PSScriptRoot '.package'
$executorRoot = Join-Path $packageRoot 'Suzuka'
New-Item -ItemType Directory -Path $executorRoot -Force | Out-Null
foreach ($name in @('suzuka-builder.lua','suzuka-plan.json','suzuka-checkpoint.lua','suzuka-diagnose.lua','README.md','THIRD-PARTY.txt')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $executorRoot $name) -Force
}
New-Item -ItemType Directory -Path (Join-Path $executorRoot 'source') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'source/LICENSE') -Destination (Join-Path $executorRoot 'source/LICENSE') -Force
foreach ($name in @('suzuka-run.lua','suzuka-resume.lua')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $packageRoot $name) -Force
}
Compress-Archive -LiteralPath @($executorRoot,(Join-Path $packageRoot 'suzuka-run.lua'),(Join-Path $packageRoot 'suzuka-resume.lua')) -DestinationPath (Join-Path $PSScriptRoot 'suzuka-executor.zip') -Force
Get-Item -LiteralPath (Join-Path $PSScriptRoot 'suzuka-executor.zip') | Select-Object Name,Length
