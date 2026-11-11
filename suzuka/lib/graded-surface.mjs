import {unit} from './track-geometry.mjs';

// Consecutive world planes hinge about a route cross-section. Projecting each
// gradient change onto its tangent keeps both ends of that cross-section flush.
// The cyclic projection also avoids a banking discontinuity at the finish line.
export function gradeSurface(points,{length=32,maxGradientChange=.0006}={}) {
  if(!Number.isFinite(length)||length<=0||!Number.isFinite(maxGradientChange)||maxGradientChange<=0)throw Error('Ramp lengths and gradient limits must be positive and finite');
  if(points.length<5||points[0].pos.some((v,k)=>Math.abs(v-points.at(-1).pos[k])>1e-6))throw Error('Graded ramps require a closed driving profile');
  const n=points.length-1,knots=[0];
  const s=[0];for(let i=1;i<=n;i++)s.push(s.at(-1)+Math.hypot(points[i].pos[0]-points[i-1].pos[0],points[i].pos[2]-points[i-1].pos[2]));
  const tangent=i=>{const a=points[(i+n-1)%n].pos,b=points[(i+1)%n].pos,d=Math.hypot(b[0]-a[0],b[2]-a[2]);return [(b[0]-a[0])/d,(b[2]-a[2])/d];};
  const hingeSafe=i=>{
    const t=tangent(i);
    for(const direction of [-1,1])for(let j=i+direction;Math.abs(j-i)<n;j+=direction){const k=(j%n+n)%n,ds=Math.abs(s[k]-s[i]),distance=Math.min(ds,s[n]-ds);if(distance>64)break;const u=tangent(k);if(t[0]*u[0]+t[1]*u[1]<Math.cos(1.5*Math.PI/180))return false;}
    return true;
  };
  let distance=0;
  for(let i=1;i<n;i++) {
    distance+=Math.hypot(points[i].pos[0]-points[i-1].pos[0],points[i].pos[2]-points[i-1].pos[2]);
    if(distance>=length && hingeSafe(i)){knots.push(i);distance=0;}
  }
  const tangents=knots.map(i=>{const a=points[(i+n-1)%n].pos,b=points[(i+1)%n].pos,d=Math.hypot(b[0]-a[0],b[2]-a[2]);return [(b[0]-a[0])/d,(b[2]-a[2])/d];});
  if(knots.length<3)throw Error('Too few safe hinges for the requested ramp length');
  const targets=knots.map((a,j)=>{const b=knots[j+1]??n,p=points[Math.floor((a+b)/2)];return [-p.normal[0]/p.normal[1],-p.normal[2]/p.normal[1]];});
  const integrate=gradients=>{
    const heights=[0];
    for(let j=0;j<knots.length;j++){const a=points[knots[j]].pos,b=points[knots[(j+1)%knots.length]].pos,g=gradients[j];heights.push(heights.at(-1)+g[0]*(b[0]-a[0])+g[1]*(b[2]-a[2]));}
    return heights;
  };
  const gradients=targets.map(g=>[...g]),corrections=knots.map(()=>[0,0,0,0]),closure=knots.map(()=>[0,0]);
  const chords=knots.map((a,j)=>{const p=points[a].pos,q=points[knots[(j+1)%knots.length]].pos;return [q[0]-p[0],q[2]-p[2]];}),norm=chords.reduce((sum,d)=>sum+d[0]**2+d[1]**2,0);
  // Dykstra projections give the closest feasible gradient field, including
  // the finish-line hinge, a bound on each crease, and zero integrated drift.
  let residual=Infinity,iterations=0;
  for(;iterations<60000;iterations++) {
    for(let j=0;j<knots.length;j++) {
      const k=(j+knots.length-1)%knots.length,t=tangents[j],c=corrections[j],a=gradients[k].map((v,i)=>v+c[i]),b=gradients[j].map((v,i)=>v+c[i+2]);
      const delta=Math.max(-maxGradientChange,Math.min(maxGradientChange,(b[0]-a[0])*t[0]+(b[1]-a[1])*t[1]));
      for(let axis=0;axis<2;axis++){const mid=(a[axis]+b[axis])/2,left=mid-delta*t[axis]/2,right=mid+delta*t[axis]/2;c[axis]=a[axis]-left;c[axis+2]=b[axis]-right;gradients[k][axis]=left;gradients[j][axis]=right;}
    }
    let drift=0;for(let j=0;j<knots.length;j++)for(let k=0;k<2;k++)drift+=(gradients[j][k]+closure[j][k])*chords[j][k];
    for(let j=0;j<knots.length;j++)for(let k=0;k<2;k++){const value=gradients[j][k]+closure[j][k],projected=value-drift/norm*chords[j][k];closure[j][k]=value-projected;gradients[j][k]=projected;}
    if(iterations%100!==0)continue;
    residual=0;
    for(let j=0;j<knots.length;j++){const a=gradients[(j+knots.length-1)%knots.length],b=gradients[j],t=tangents[j],dx=b[0]-a[0],dz=b[1]-a[1];residual=Math.max(residual,Math.abs(dx*t[1]-dz*t[0]),Math.abs(dx*t[0]+dz*t[1])-maxGradientChange);}
    if(residual<1e-9)break;
  }
  if(residual>.00002)throw Error(`Ramp constraints did not converge: ${residual}`);
  const heights=integrate(gradients);
  const raw=[];
  for(let j=0;j<knots.length;j++)for(let i=knots[j];i<(knots[j+1]??n);i++){const a=points[knots[j]].pos,p=points[i].pos,g=gradients[j];raw[i]=heights[j]+g[0]*(p[0]-a[0])+g[1]*(p[2]-a[2]);}
  const lo=Math.min(...raw),hi=Math.max(...raw),sourceLo=Math.min(...points.map(p=>p.pos[1])),sourceHi=Math.max(...points.map(p=>p.pos[1])),scale=hi-lo>1e-10?(sourceHi-sourceLo)/(hi-lo):1;
  if(hi-lo<1e-10 && sourceHi-sourceLo>1e-8)throw Error('Ramp fitting lost the elevation range');
  if(residual*scale>.00002)throw Error('Full-width hinge residual exceeds the graded surface tolerance');
  let maximumAdjustment=0;
  for(let j=0;j<knots.length;j++) {
    const [gx,gz]=gradients[j].map(v=>v*scale),a=points[knots[j]].pos,plane={id:j,x:a[0],z:a[2],height:sourceLo+(heights[j]-lo)*scale,gx,gz};
    for(let i=knots[j];i<(knots[j+1]??n);i++) {
      const p=points[i],value=sourceLo+(raw[i]-lo)*scale;maximumAdjustment=Math.max(maximumAdjustment,Math.abs(p.pos[1]-value));p.pos[1]=value;
      const r=p.right,h=Math.hypot(r[0],r[2]);p.bank=(gx*r[0]+gz*r[2])/h;p.right=unit([r[0]/h,p.bank,r[2]/h]);p.normal=unit([-gx,1,-gz]);p.surfacePlane=plane;
    }
  }
  const lap=points[n].s;Object.assign(points[n],structuredClone(points[0]));points[n].s=lap;
  return {method:'Cyclic hinged world planes with matching full-width cross-sections',lengthStuds:length,facets:knots.length,maximumAdjustmentStuds:maximumAdjustment,closureResidualStuds:heights.at(-1)*scale,gradientConstraintResidual:residual*scale,maximumGradientChange:maxGradientChange*scale,iterations,knots};
}
