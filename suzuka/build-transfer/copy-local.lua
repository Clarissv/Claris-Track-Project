-- Extract jakarta-transfer.zip into the executor workspace first.
local chunk, reason = loadstring(readfile("JakartaTransfer/transfer.lua"))
assert(chunk, "Jakarta Transfer could not compile: " .. tostring(reason))
return chunk("copy")
