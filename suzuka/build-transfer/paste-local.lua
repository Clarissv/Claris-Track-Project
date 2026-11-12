-- Use the same executor workspace in your friend's Jakarta private server.
local chunk, reason = loadstring(readfile("JakartaTransfer/transfer.lua"))
assert(chunk, "Jakarta Transfer could not compile: " .. tostring(reason))
return chunk("paste")
