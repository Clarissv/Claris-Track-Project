param([string]$LuaLibrary = 'C:\Program Files\VideoLAN\VLC\plugins\lua\liblua_plugin.dll')
$ErrorActionPreference = 'Stop'
$libraryPath = (Resolve-Path -LiteralPath $LuaLibrary).Path
$dependencyPath = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $libraryPath))
if (-not ('JakartaTransferLuaNative' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class JakartaTransferLuaNative {
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
$cookie = [JakartaTransferLuaNative]::AddDllDirectory($dependencyPath)
$loaded = [JakartaTransferLuaNative]::LoadLibraryEx($libraryPath, [IntPtr]::Zero, 0x1100)
if ($loaded -eq [IntPtr]::Zero) { throw 'Cannot load existing Lua library' }
try {
    foreach ($name in @('transfer.lua', 'copy.lua', 'paste.lua', 'copy-local.lua', 'paste-local.lua', 'test-transfer.lua')) {
        $state = [JakartaTransferLuaNative]::luaL_newstate()
        try {
            $source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot $name))
            $bytes = [Text.Encoding]::UTF8.GetBytes($source)
            $result = [JakartaTransferLuaNative]::luaL_loadbuffer($state, $bytes, [UIntPtr]::new([uint64]$bytes.Length), $name)
            if ($result -ne 0) { throw [Runtime.InteropServices.Marshal]::PtrToStringAnsi([JakartaTransferLuaNative]::lua_tolstring($state, -1, [IntPtr]::Zero)) }
        } finally { [JakartaTransferLuaNative]::lua_close($state) }
    }
    $state = [JakartaTransferLuaNative]::luaL_newstate()
    try {
        [JakartaTransferLuaNative]::luaL_openlibs($state)
        $fixture = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-transfer.lua'))
        $fixture = $fixture.Replace('-- TRANSFER_SOURCE', [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'transfer.lua')))
        $fixture = $fixture.Replace('-- COPY_LOADER_SOURCE', [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'copy.lua')))
        $fixture = $fixture.Replace('-- PASTE_LOADER_SOURCE', [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'paste.lua')))
        $fixture = $fixture.Replace('-- COPY_LOCAL_LOADER_SOURCE', [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'copy-local.lua')))
        $fixture = $fixture.Replace('-- PASTE_LOCAL_LOADER_SOURCE', [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'paste-local.lua')))
        $bytes = [Text.Encoding]::UTF8.GetBytes($fixture)
        $result = [JakartaTransferLuaNative]::luaL_loadbuffer($state, $bytes, [UIntPtr]::new([uint64]$bytes.Length), 'jakarta-transfer-tests')
        if ($result -eq 0) { $result = [JakartaTransferLuaNative]::lua_pcall($state, 0, 1, 0) }
        $message = [Runtime.InteropServices.Marshal]::PtrToStringAnsi([JakartaTransferLuaNative]::lua_tolstring($state, -1, [IntPtr]::Zero))
        if ($result -ne 0) { throw $message }
        Write-Output $message
    } finally { [JakartaTransferLuaNative]::lua_close($state) }
} finally {
    if ($cookie -ne [IntPtr]::Zero) { [void][JakartaTransferLuaNative]::RemoveDllDirectory($cookie) }
}
