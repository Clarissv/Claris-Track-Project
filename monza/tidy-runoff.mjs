// Simplify the derived cross-sections without modifying the frozen model trace.
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const area=(points,chain)=>chain.reduce((sum,p)=>sum+p.width*(points[p.end].s-points[p.start].s),0);

export function tidyRunoffProfiles(points,input,settings={}) {
  const config={minimumPatchLength:32,minimumPatchArea:320,maximumGapSamples:12,smoothingRadius:2,maximumBoundaryAdjustment:4,roadOverlap:.2,...settings};
  const chains=[],pending=new Map();
  for(const p of [...input].sort((a,b)=>a.start-b.start||a.side-b.side||a.offset-b.offset)) {
    if(![-1,1].includes(p.side)||!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end>=points.length||p.start>=p.end||!Number.isFinite(p.offset)||!Number.isFinite(p.width)||p.offset<0||p.width<4||![4,8,9,10,11,14].includes(p.color))throw Error('Invalid source runoff cross-section');
    const key=p.side+':'+p.color,tails=pending.get(key)??[];
    const eligible=tails.filter(c=>p.start>=c.at(-1).end&&p.start-c.at(-1).end<=config.maximumGapSamples);
    const distance=c=>Math.abs(c.at(-1).offset-p.offset)+Math.abs(c.at(-1).width-p.width);
    const chain=eligible.sort((a,b)=>distance(a)-distance(b)).find(c=>distance(c)<=16);
    if(chain)chain.push({...p});else {const next=[{...p}];chains.push(next);tails.push(next);}
    pending.set(key,tails.filter(c=>p.start-c.at(-1).end<=config.maximumGapSamples));
  }
  const rows=new Map();let removedProfiles=0,bridgedProfiles=0;
  const add=p=>{const key=p.side+':'+p.start;if(!rows.has(key))rows.set(key,[]);rows.get(key).push(p);};
  for(const chain of chains) {
    const length=points[chain.at(-1).end].s-points[chain[0].start].s;
    if((length<config.minimumPatchLength&&area(points,chain)<config.minimumPatchArea)||Math.max(...chain.map(p=>p.width))<6){removedProfiles+=chain.length;continue;}
    for(let i=0;i<chain.length;i++) {
      const p=chain[i];add(p);
      const next=chain[i+1];if(!next)continue;
      const step=p.end-p.start;
      for(let start=p.end;start<next.start;start+=step) {
        const factor=(points[start].s-points[p.start].s)/(points[next.start].s-points[p.start].s);
        add({...p,start,end:Math.min(start+step,next.start),offset:p.offset+(next.offset-p.offset)*factor,width:p.width+(next.width-p.width)*factor});bridgedProfiles++;
      }
    }
  }
  const sections=[];let discardedDetachedBands=0;
  for(const profiles of rows.values()) {
    const sorted=profiles.sort((a,b)=>a.offset-b.offset),clusters=[];
    for(const p of sorted) {
      const cluster=clusters.at(-1);
      if(cluster&&p.offset<=Math.max(...cluster.map(p=>p.offset+p.width))+16)cluster.push(p);else clusters.push([p]);
    }
    // A radial cross-section may catch a separate blue edge/detail from a
    // nearby corner. Keep the main gravel or red/white painted area and its
    // associated colour bands, rather than stretching that detail to the road.
    const proper=clusters.filter(c=>c.some(p=>[4,8,9,14].includes(p.color)));
    const selected=proper.sort((a,b)=>b.reduce((n,p)=>n+p.width,0)-a.reduce((n,p)=>n+p.width,0))[0];
    if(!selected){discardedDetachedBands+=sorted.length;continue;}
    discardedDetachedBands+=sorted.length-selected.length;
    const bands=[];
    for(const p of selected) {
      const outer=p.offset+p.width,previous=bands.at(-1);
      if(previous?.color===p.color){previous.outer=Math.max(previous.outer,outer);continue;}
      bands.push({offset:p.offset,outer,color:p.color});
    }
    if(!bands.length)continue;
    // Fill road-to-runoff and inter-band slivers as part of existing surfaces.
    // No extra grass tiles, decorative objects or separate filler strips.
    const boundaries=[-config.roadOverlap];
    for(let i=1;i<bands.length;i++)boundaries.push(Math.max(boundaries.at(-1)+2,(bands[i-1].outer+bands[i].offset)/2));
    boundaries.push(Math.max(boundaries.at(-1)+2,bands.at(-1).outer));
    sections.push({side:sorted[0].side,start:sorted[0].start,end:sorted[0].end,colors:bands.map(p=>p.color),boundaries});
  }
  sections.sort((a,b)=>a.side-b.side||a.start-b.start);
  let bridgedSections=0;
  for(let i=0;i+1<sections.length;i++) {
    const a=sections[i],b=sections[i+1],step=a.end-a.start,gap=b.start-a.end;
    if(a.side!==b.side||a.colors.join(':')!==b.colors.join(':')||gap<=0||gap>24||a.boundaries.some((v,k)=>Math.abs(v-b.boundaries[k])>32))continue;
    const inserted=[];
    for(let start=a.end;start<b.start;start+=step) {
      const f=(points[start].s-points[a.start].s)/(points[b.start].s-points[a.start].s);
      inserted.push({side:a.side,start,end:Math.min(start+step,b.start),colors:[...a.colors],boundaries:a.boundaries.map((v,k)=>v+(b.boundaries[k]-v)*f)});
    }
    sections.splice(i+1,0,...inserted);i+=inserted.length;bridgedSections+=inserted.length;
  }
  const profiles=[];
  for(let i=0;i<sections.length;i++) {
    const section=sections[i],boundaries=[...section.boundaries];
    for(let band=1;band<boundaries.length;band++) {
      const values=[];
      for(let j=Math.max(0,i-config.smoothingRadius);j<=Math.min(sections.length-1,i+config.smoothingRadius);j++) {
        const other=sections[j];
        if(other.side===section.side&&Math.abs(other.start-section.start)<=config.smoothingRadius*4&&other.colors.join(':')===section.colors.join(':'))values.push(other.boundaries[band]);
      }
      const target=median(values),change=Math.max(-config.maximumBoundaryAdjustment,Math.min(config.maximumBoundaryAdjustment,target-boundaries[band]));
      boundaries[band]=Math.round((boundaries[band]+change)*2)/2;
      boundaries[band]=Math.max(boundaries[band-1]+2,boundaries[band]);
    }
    section.boundaries=boundaries;
    for(let band=0;band<section.colors.length;band++)profiles.push({side:section.side,start:section.start,end:section.end,offset:boundaries[band],width:boundaries[band+1]-boundaries[band],color:section.colors[band],band});
  }
  return {profiles,sections,report:{settings:config,sourceProfiles:input.length,removedProfiles,bridgedProfiles,discardedDetachedBands,bridgedSections,tidiedProfiles:profiles.length,sectionCount:sections.length}};
}

export function runoffHeight(color) {
  // Tiny ordered overlaps avoid coplanar flicker where rectangular colour
  // bands meet. All remain below the asphalt and raised kerb surfaces.
  return ({8:-.008,9:-.007,4:-.006,11:-.005,10:-.004,14:-.006})[color];
}
