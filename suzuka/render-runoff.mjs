import fs from 'node:fs';
import {render} from './lib/render.mjs';
const here=new URL('./',import.meta.url),after=JSON.parse(fs.readFileSync(new URL('suzuka-plan.json',here))),oldFile=new URL('.package/Suzuka/suzuka-plan.json',here),before=fs.existsSync(oldFile)?JSON.parse(fs.readFileSync(oldFile)):undefined;
for(const [label,row,side] of [['sand',695,1],['crossover',982,1]])for(const [stage,plan] of [['after',after],['before',before]]){
  if(!plan)continue;const i=row*8,p=plan.centerline[i],a=plan.centerline[i-1],b=plan.centerline[i+1],h=Math.hypot(b[0]-a[0],b[2]-a[2]),along=[(b[0]-a[0])/h,0,(b[2]-a[2])/h],out=[along[2]*side,0,-along[0]*side],target=[p[0]+out[0]*30,p[1]-.5,p[2]+out[2]*30];
  fs.writeFileSync(new URL(`build-runoff-${label}-${stage}.png`,here),render(plan,1300,850,{target,span:120,right:along,up:[-out[0]*.32,.9474,-out[2]*.32],forward:[out[0]*.9474,.32,out[2]*.9474]}));
}
