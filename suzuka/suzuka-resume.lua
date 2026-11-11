local folder="Suzuka/"
return assert(loadstring(readfile(folder.."suzuka-builder.lua")))(folder.."suzuka-plan.json",nil,"resume",folder.."suzuka-jakarta-checkpoint.json")
