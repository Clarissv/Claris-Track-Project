import {finishPoints} from './reference.mjs';

// Integrate over physical distance, so dense model samples do not receive
// more weight than sparsely sampled stretches. Never move the horizontal route.
export function smoothDrivingPoints(source,{heightSigma=80,bankSigma=100,closed=true}={}) {
  if(!(Number.isFinite(heightSigma)&&Number.isFinite(bankSigma)&&heightSigma>0&&bankSigma>0))throw Error('Surface smoothing distances must be positive and finite');
  const points=structuredClone(closed?source.slice(0,-1):source),n=points.length;
  const distance=[0];
  for(let i=1;i<n;i++)distance.push(distance[i-1]+Math.hypot(points[i].pos[0]-points[i-1].pos[0],points[i].pos[2]-points[i-1].pos[2]));
  const lap=distance.at(-1)+(closed?Math.hypot(points[0].pos[0]-points.at(-1).pos[0],points[0].pos[2]-points.at(-1).pos[2]):0);
  const coordinate=i=>closed?distance[(i%n+n)%n]+Math.floor(i/n)*lap:distance[i];
  const weights=points.map((_,i)=>((i===n-1?(closed?lap:distance[i]):distance[i+1])-(i===0?(closed?distance.at(-1)-lap:0):distance[i-1]))/2);
  const filter=(values,sigma)=>{
    const result=[],radius=5*sigma;let lo=closed?-n:0,hi=0;
    for(let i=0;i<n;i++) {
      while(coordinate(lo)<distance[i]-radius)lo++;
      while(hi+1<(closed?2*n:n)&&coordinate(hi+1)<=distance[i]+radius)hi++;
      let sum=0,total=0;
      for(let j=lo;j<=hi;j++){const k=(j%n+n)%n,d=coordinate(j)-distance[i],w=Math.exp(-.5*(d/sigma)**2)*weights[k];sum+=values[k]*w;total+=w;}
      // Extend open ends at their original grade instead of flattening them.
      if(!closed)for(const [end,sign] of [[0,-1],[n-1,1]]) {
        const neighbor=end===0?1:n-2,slope=(values[end]-values[neighbor])/(distance[end]-distance[neighbor]);
        const step=Math.min(1,sigma/30);
        for(let d=step/2;d<=radius;d+=step){const x=distance[end]+sign*d,delta=x-distance[i];if(Math.abs(delta)>radius)continue;const w=Math.exp(-.5*(delta/sigma)**2)*step;sum+=(values[end]+slope*sign*d)*w;total+=w;}
      }
      result.push(sum/total);
    }
    if(!closed)for(const [end,sign] of [[0,1],[n-1,-1]]) {
      const neighbor=end===0?1:n-2,ds=Math.abs(distance[end]-distance[neighbor]),error=values[end]-result[end],slopeError=((values[neighbor]-values[end])-(result[neighbor]-result[end]))/ds,L=Math.min(radius,lap/2);
      for(let i=0;i<n;i++){const d=(distance[i]-distance[end])*sign;if(d>L)continue;const t=d/L;result[i]+=error*(2*t**3-3*t*t+1)+slopeError*L*(t**3-2*t*t+t);}
      result[end]=values[end];
    }
    return result;
  };
  const heights=filter(points.map(p=>p.pos[1]),heightSigma),banks=filter(points.map(p=>p.bank??0),bankSigma);
  points.forEach((p,i)=>{p.pos[1]=heights[i];p.bank=banks[i];});
  return finishPoints(points,closed);
}

export function profileMetrics(points) {
  const n=points.length-1;let maxGrade=0,maxCurvature=0,maxBankGradient=0;
  for(let i=0;i<n;i++) {
    const a=points[(i-1+n)%n],b=points[i],c=points[(i+1)%n],ds1=Math.hypot(b.pos[0]-a.pos[0],b.pos[2]-a.pos[2]),ds2=Math.hypot(c.pos[0]-b.pos[0],c.pos[2]-b.pos[2]);
    const g1=(b.pos[1]-a.pos[1])/ds1,g2=(c.pos[1]-b.pos[1])/ds2;
    maxGrade=Math.max(maxGrade,Math.abs(g2));maxCurvature=Math.max(maxCurvature,Math.abs(g2-g1)/((ds1+ds2)/2));maxBankGradient=Math.max(maxBankGradient,Math.abs((c.bank??0)-(b.bank??0))/ds2);
  }
  return {maxGrade,maxCurvature,maxBankGradient};
}
