param([string]$LuaLibrary = 'C:\Program Files\VideoLAN\VLC\plugins\lua\liblua_plugin.dll', [string]$HttpLoader = '')
$ErrorActionPreference = 'Stop'
$libraryPath = (Resolve-Path -LiteralPath $LuaLibrary).Path
$dependencyPath = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $libraryPath))
if (-not ('RedBullRingLuaNative' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RedBullRingLuaNative {
    [DllImport("kernel32", CharSet = CharSet.Unicode)] public static extern IntPtr AddDllDirectory(string path);
    [DllImport("kernel32")] public static extern bool RemoveDllDirectory(IntPtr cookie);
    [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)] public static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
    [DllImport("liblua_plugin.dll", CallingConvention = CallingConvention.Cdecl)] public static extern IntPtr luaL_newstate();
    [DllImport("liblua_plugin.dll", CallingConvention = CallingConvention.Cdecl)] public static extern void luaL_openlibs(IntPtr state);
    [DllImport("liblua_plugin.dll", CallingConvention = CallingConvention.Cdecl)] public static extern int luaL_loadbuffer(IntPtr state, byte[] code, UIntPtr size, string name);
    [DllImport("liblua_plugin.dll", CallingConvention = CallingConvention.Cdecl)] public static extern int lua_pcall(IntPtr state, int args, int results, int errorHandler);
    [DllImport("liblua_plugin.dll", CallingConvention = CallingConvention.Cdecl)] public static extern IntPtr lua_tolstring(IntPtr state, int index, IntPtr size);
    [DllImport("liblua_plugin.dll", CallingConvention = CallingConvention.Cdecl)] public static extern void lua_close(IntPtr state);
}
'@
}
$cookie = [RedBullRingLuaNative]::AddDllDirectory($dependencyPath)
$loaded = [RedBullRingLuaNative]::LoadLibraryEx($libraryPath, [IntPtr]::Zero, 0x1100)
if ($loaded -eq [IntPtr]::Zero) { throw 'Cannot load existing Lua library' }
$state = [RedBullRingLuaNative]::luaL_newstate()
try {
    [RedBullRingLuaNative]::luaL_openlibs($state)
    # Compile the entire generated artifact without executing it.
    $source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'red-bull-ring-builder.lua'))
    $bytes = [Text.Encoding]::UTF8.GetBytes($source)
    $result = [RedBullRingLuaNative]::luaL_loadbuffer($state, $bytes, [UIntPtr]::new([uint64]$bytes.Length), 'red-bull-ring-builder.lua')
    if ($result -ne 0) { throw [Runtime.InteropServices.Marshal]::PtrToStringAnsi([RedBullRingLuaNative]::lua_tolstring($state, -1, [IntPtr]::Zero)) }
    # Exercise the generated runtime with mocked JSON decoding and endpoints.
    $fixture = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-builder.lua')).Replace('-- RED_BULL_RING_SCRIPT', $source)
    $fixture = $fixture.Replace('-- RED_BULL_RING_DIAGNOSTIC', [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'red-bull-ring-diagnose.lua')))
    $fixture = $fixture.Replace('-- RED_BULL_RING_CHECKPOINT', [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'red-bull-ring-checkpoint.lua')))
    if ($HttpLoader) {
        $httpTests = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-http-loader.lua'))
        $httpTests = $httpTests.Replace('-- HTTP_LOADER_SOURCE', [IO.File]::ReadAllText((Resolve-Path -LiteralPath $HttpLoader).Path))
        $fixture = $fixture.Replace('-- HTTP_LOADER_TESTS', $httpTests)
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes($fixture)
    $result = [RedBullRingLuaNative]::luaL_loadbuffer($state, $bytes, [UIntPtr]::new([uint64]$bytes.Length), 'red-bull-ring-offline-tests')
    if ($result -eq 0) { $result = [RedBullRingLuaNative]::lua_pcall($state, 0, 1, 0) }
    $message = [Runtime.InteropServices.Marshal]::PtrToStringAnsi([RedBullRingLuaNative]::lua_tolstring($state, -1, [IntPtr]::Zero))
    if ($result -ne 0) { throw $message }
    Write-Output $message
} finally {
    [RedBullRingLuaNative]::lua_close($state)
    if ($cookie -ne [IntPtr]::Zero) { [void][RedBullRingLuaNative]::RemoveDllDirectory($cookie) }
}
