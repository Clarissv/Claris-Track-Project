param(
    [string]$LuaLibrary = 'C:\Program Files\VideoLAN\VLC\plugins\lua\liblua_plugin.dll',
    [string]$SourceFile = 'observe.lua',
    [string]$TestFile = 'test-observer.lua'
)
$ErrorActionPreference = 'Stop'
$libraryPath = (Resolve-Path -LiteralPath $LuaLibrary).Path
$dependencyPath = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $libraryPath))
if (-not ('RedBullRingSaveLuaNative' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RedBullRingSaveLuaNative {
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
$cookie = [RedBullRingSaveLuaNative]::AddDllDirectory($dependencyPath)
$loaded = [RedBullRingSaveLuaNative]::LoadLibraryEx($libraryPath, [IntPtr]::Zero, 0x1100)
if ($loaded -eq [IntPtr]::Zero) { throw 'Cannot load existing Lua library' }
$state = [RedBullRingSaveLuaNative]::luaL_newstate()
try {
    [RedBullRingSaveLuaNative]::luaL_openlibs($state)
    $source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot $SourceFile))
    $bytes = [Text.Encoding]::UTF8.GetBytes($source)
    $result = [RedBullRingSaveLuaNative]::luaL_loadbuffer($state, $bytes, [UIntPtr]::new([uint64]$bytes.Length), 'save-observer.lua')
    if ($result -ne 0) { throw [Runtime.InteropServices.Marshal]::PtrToStringAnsi([RedBullRingSaveLuaNative]::lua_tolstring($state, -1, [IntPtr]::Zero)) }
    $mocks = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '../test-builder.lua'))
    $fixture = $mocks.Substring(0, $mocks.IndexOf('local function loadBuilder')) + [IO.File]::ReadAllText((Join-Path $PSScriptRoot $TestFile)).Replace('-- OBSERVER_SOURCE', $source)
    $bytes = [Text.Encoding]::UTF8.GetBytes($fixture)
    $result = [RedBullRingSaveLuaNative]::luaL_loadbuffer($state, $bytes, [UIntPtr]::new([uint64]$bytes.Length), 'save-observer-tests')
    if ($result -eq 0) { $result = [RedBullRingSaveLuaNative]::lua_pcall($state, 0, 1, 0) }
    $message = [Runtime.InteropServices.Marshal]::PtrToStringAnsi([RedBullRingSaveLuaNative]::lua_tolstring($state, -1, [IntPtr]::Zero))
    if ($result -ne 0) { throw $message }
    Write-Output $message
} finally {
    [RedBullRingSaveLuaNative]::lua_close($state)
    if ($cookie -ne [IntPtr]::Zero) { [void][RedBullRingSaveLuaNative]::RemoveDllDirectory($cookie) }
}
