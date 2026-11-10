param([string]$LuaLibrary = 'C:\Program Files\VideoLAN\VLC\plugins\lua\liblua_plugin.dll')
$ErrorActionPreference = 'Stop'
$libraryPath = (Resolve-Path -LiteralPath $LuaLibrary).Path
$dependencyPath = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $libraryPath))
if (-not ('BarrierInspectorLuaNative' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BarrierInspectorLuaNative {
    [DllImport("kernel32", CharSet = CharSet.Unicode)] public static extern IntPtr AddDllDirectory(string path);
    [DllImport("kernel32")] public static extern bool RemoveDllDirectory(IntPtr cookie);
    [DllImport("kernel32", CharSet = CharSet.Unicode)] public static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
    [DllImport("liblua_plugin.dll", CallingConvention = CallingConvention.Cdecl)] public static extern IntPtr luaL_newstate();
    [DllImport("liblua_plugin.dll", CallingConvention = CallingConvention.Cdecl)] public static extern void luaL_openlibs(IntPtr state);
    [DllImport("liblua_plugin.dll", CallingConvention = CallingConvention.Cdecl)] public static extern int luaL_loadbuffer(IntPtr state, byte[] code, UIntPtr size, string name);
    [DllImport("liblua_plugin.dll", CallingConvention = CallingConvention.Cdecl)] public static extern int lua_pcall(IntPtr state, int args, int results, int errorHandler);
    [DllImport("liblua_plugin.dll", CallingConvention = CallingConvention.Cdecl)] public static extern IntPtr lua_tolstring(IntPtr state, int index, IntPtr size);
    [DllImport("liblua_plugin.dll", CallingConvention = CallingConvention.Cdecl)] public static extern void lua_close(IntPtr state);
}
'@
}
$cookie = [BarrierInspectorLuaNative]::AddDllDirectory($dependencyPath)
$loaded = [BarrierInspectorLuaNative]::LoadLibraryEx($libraryPath, [IntPtr]::Zero, 0x1100)
if ($loaded -eq [IntPtr]::Zero) { throw 'Cannot load existing Lua library' }
$state = [BarrierInspectorLuaNative]::luaL_newstate()
try {
    [BarrierInspectorLuaNative]::luaL_openlibs($state)
    $mocks = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\test-builder.lua'))
    $mocks = $mocks.Substring(0, $mocks.IndexOf('local function loadBuilder'))
    $fixture = $mocks + [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-inspector.lua'))
    $fixture = $fixture.Replace('-- INSPECTOR_SOURCE', [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'inspect-catalog.lua')))
    $fixture = $fixture.Replace('-- HELD_INFO_SOURCE', [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'inspect-held.lua')))
    $bytes = [Text.Encoding]::UTF8.GetBytes($fixture)
    $result = [BarrierInspectorLuaNative]::luaL_loadbuffer($state, $bytes, [UIntPtr]::new([uint64]$bytes.Length), 'barrier-inspector-tests')
    if ($result -eq 0) { $result = [BarrierInspectorLuaNative]::lua_pcall($state, 0, 1, 0) }
    $message = [Runtime.InteropServices.Marshal]::PtrToStringAnsi([BarrierInspectorLuaNative]::lua_tolstring($state, -1, [IntPtr]::Zero))
    if ($result -ne 0) { throw $message }
    Write-Output $message
} finally {
    [BarrierInspectorLuaNative]::lua_close($state)
    [void][BarrierInspectorLuaNative]::RemoveDllDirectory($cookie)
}
