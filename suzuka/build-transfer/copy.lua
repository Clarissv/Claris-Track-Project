-- Run in the SOURCE Jakarta private server. Creates a verified local backup.
local source = game:HttpGet("https://raw.githubusercontent.com/Clarissv/Claris-Track-Project/main/suzuka/build-transfer/transfer.lua")
local chunk, reason = loadstring(source)
assert(chunk, "Jakarta transfer download could not compile: " .. tostring(reason))
return chunk("copy")
