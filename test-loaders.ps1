param([string]$LuaLibrary = 'C:\Program Files\VideoLAN\VLC\plugins\lua\liblua_plugin.dll')
$ErrorActionPreference = 'Stop'
foreach ($mapDirectory in @('sepang','sepang\flat','monza','monza\terrain','red-bull-ring')) {
    $directory = Join-Path $PSScriptRoot $mapDirectory
    Push-Location -LiteralPath $directory
    try {
        Write-Output "Checking $mapDirectory builder and HTTP loader"
        & (Join-Path $directory 'test-builder.ps1') -LuaLibrary $LuaLibrary -HttpLoader (Join-Path $directory 'loader.lua')
    } finally {
        Pop-Location
    }
}
