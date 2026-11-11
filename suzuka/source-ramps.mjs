import {unit} from './lib/track-geometry.mjs';
import {finishPoints} from './lib/reference.mjs';
import {adaptiveSegments} from './lib/geometry.mjs';
import {fittedSlab} from './lib/road-geometry.mjs';
import {overlapVertices} from './lib/surface-audit.mjs';

const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
function inverse3(a){const [x,b,c,d,e,f,g,h,i]=a,A=e*i-f*h,B=c*h-b*i,C=b*f-c*e,D=f*g-d*i,E=x*i-c*g,F=c*d-x*f,G=d*h-e*g,H=b*g-x*h,I=x*e-b*d,det=x*A+b*D+c*G;if(Math.abs(det)<1e-16)throw Error('Singular ramp fit');return [A,B,C,D,E,F,G,H,I].map(v=>v/det);}
const mul3=(m,v)=>[0,1,2].map(i=>m[i*3]*v[0]+m[i*3+1]*v[1]+m[i*3+2]*v[2]);

// Fit actual heights, subject to full-width hinge and lap-closure constraints.
// The block-diagonal least-squares fit is projected with a sparse Schur solve.
export function fitSourceRamps(points,{length=40,gradientWeight=4,bankWeight=.15,maxGradientChange=.01,maxJoinStep=.006,hingeRadius=0,hingeTurn=1.5*Math.PI/180,sharedBranchRanges=[]}={}){
  const n=points.length-1,source=points.map(p=>({pos:[...p.pos],normal:[...p.normal]})),s=[0];for(let i=1;i<=n;i++)s.push(s.at(-1)+Math.hypot(points[i].pos[0]-points[i-1].pos[0],points[i].pos[2]-points[i-1].pos[2]));
  const knots=[0],tangent=i=>{const a=source[(i+n-1)%n].pos,b=source[(i+1)%n].pos,h=Math.hypot(b[0]-a[0],b[2]-a[2]);return [(b[0]-a[0])/h,(b[2]-a[2])/h];};
  const safe=i=>{if(!hingeRadius)return true;const t=tangent(i);for(const direction of [-1,1])for(let j=i+direction;Math.abs(j-i)<n;j+=direction){const k=(j%n+n)%n,d=Math.abs(s[k]-s[i]);if(Math.min(d,s[n]-d)>hingeRadius)break;const u=tangent(k);if(dot(t,u)<Math.cos(hingeTurn))return false;}return true;};
  for(let i=1;i<n;i++)if(s[i]-s[knots.at(-1)]>=length&&safe(i)&&!sharedBranchRanges.some(([a,b])=>i>=a&&i<=b))knots.push(i);
  const m=knots.length,L=length,inverses=[],free=[],A=[],B=[];
  // Rectangles extend slightly beyond a curved hinge. Limit its pitch change
  // using those actual overlap corners, rather than flattening whole bends.
  const flat=points.map(p=>({...p,pos:[p.pos[0],0,p.pos[2]],normal:[0,1,0],right:unit([p.right[0],0,p.right[2]])}));
  for(let j=0;j<m;j++)for(let i=knots[j];i<(knots[j+1]??n);i++)flat[i].surfacePlane={id:j,height:0,gx:0,gz:0,x:0,z:0};
  flat[n]={...flat[0],pos:[...flat[0].pos]};
  const spans=adaptiveSegments(flat,110,.08,1.8*Math.PI/180,.008,.07*Math.PI/180,1.5),slabs=spans.map(([a,b])=>fittedSlab(flat,a,b,{thickness:.5})),boundsAtHinge=[];
  for(let j=0;j<m;j++){const end=knots[j+1]??n,k=spans.findIndex(s=>s[1]===end),vertices=overlapVertices(slabs[k],slabs[(k+1)%slabs.length]),p=flat[end].pos,t=tangent(end%n),extent=Math.max(.01,...vertices.map(([x,z])=>Math.abs((x-p[0])*t[0]+(z-p[2])*t[1])));boundsAtHinge.push(Math.min(maxGradientChange,maxJoinStep/extent));}
  for(let j=0;j<m;j++){
    const start=knots[j],end=knots[j+1]??n,origin=source[start].pos,H=new Array(9).fill(0),rhs=[0,0,0];
    for(let i=start;i<=end;i++){
      const p=source[i],before=s[Math.max(start,i-1)],after=s[Math.min(end,i+1)],weight=Math.max(.001,(after-before)/2),dx=p.pos[0]-origin[0],dz=p.pos[2]-origin[2],q=points[i].right,r=Math.hypot(q[0],q[2]);
      for(const d of [0,-22,22]){const x=dx+q[0]/r*d,z=dz+q[2]/r*d,row=[1,x/L,z/L],height=p.pos[1]-(p.normal[0]*q[0]+p.normal[2]*q[2])/p.normal[1]/r*d,w=weight*(d===0?1:bankWeight);for(let a=0;a<3;a++){rhs[a]+=w*row[a]*height;for(let b=0;b<3;b++)H[a*3+b]+=w*row[a]*row[b];}}
    }
    const normal=source[(start+end)>>1].normal;for(const k of [1,2]){const target=-normal[k===1?0:2]/normal[1]*L;H[k*3+k]+=gradientWeight;rhs[k]+=gradientWeight*target;}
    for(let k=0;k<3;k++)H[k*3+k]+=1e-8;
    const inv=inverse3(H);inverses.push(inv);free.push(mul3(inv,rhs));
    const next=points[end],right=next.right,r=Math.hypot(right[0],right[2]);A.push([1,(next.pos[0]-origin[0])/L,(next.pos[2]-origin[2])/L,0,right[0]/r,right[2]/r]);B.push([-1,0,0,0,-right[0]/r,-right[2]/r]);
  }
  const active=new Map();let iterations=0,activeIterations=0,fitted,constraintResidual;
  function solve(){
    const rows=A.map((_,j)=>active.has(j)?3:2),offsets=[0];for(const size of rows)offsets.push(offsets.at(-1)+size);const av=A.map(a=>[...a]),bv=B.map(b=>[...b]),bounds=new Float64Array(offsets.at(-1));
    for(const [j,sign] of active){const rx=A[j][4],rz=A[j][5],tx=-rz,tz=rx;av[j].push(0,-tx,-tz);bv[j].push(0,tx,tz);bounds[offsets[j]+2]=sign*boundsAtHinge[j]*L;}
    function constraint(values){const result=new Float64Array(offsets.at(-1));for(let j=0;j<m;j++){const a=av[j],b=bv[j],u=values[j],v=values[(j+1)%m];for(let k=0;k<rows[j];k++)for(let r=0;r<3;r++)result[offsets[j]+k]+=a[k*3+r]*u[r]+b[k*3+r]*v[r];}return result;}
    function transpose(values){const result=Array.from({length:m},()=>[0,0,0]);for(let j=0;j<m;j++)for(let k=0;k<rows[j];k++)for(let r=0;r<3;r++){result[j][r]+=av[j][k*3+r]*values[offsets[j]+k];result[(j+1)%m][r]+=bv[j][k*3+r]*values[offsets[j]+k];}return result;}
    const schur=v=>constraint(transpose(v).map((p,i)=>mul3(inverses[i],p))),diagonal=[];
    for(let j=0;j<m;j++){const size=rows[j],block=new Array(size*size).fill(0);for(let a=0;a<size;a++)for(let b=0;b<size;b++)block[a*size+b]=dot(av[j].slice(a*3,a*3+3),mul3(inverses[j],av[j].slice(b*3,b*3+3)))+dot(bv[j].slice(a*3,a*3+3),mul3(inverses[(j+1)%m],bv[j].slice(b*3,b*3+3)));if(size===3)diagonal.push(inverse3(block));else{const [a,b,c,d]=block,det=a*d-b*c;diagonal.push([d,-b,-c,a].map(v=>v/det));}}
    function precondition(r){const z=new Float64Array(r.length);for(let j=0;j<m;j++)for(let a=0;a<rows[j];a++)for(let b=0;b<rows[j];b++)z[offsets[j]+a]+=diagonal[j][a*rows[j]+b]*r[offsets[j]+b];return z;}
    const rhs=constraint(free).map((v,i)=>v-bounds[i]),lambda=new Float64Array(rhs.length),residual=Float64Array.from(rhs);let z=precondition(residual),direction=Float64Array.from(z),rz=dot(residual,z);
    for(let step=0;step<12000;step++,iterations++){
      const product=schur(direction),den=dot(direction,product);if(Math.abs(den)<1e-25)break;const alpha=rz/den;for(let i=0;i<lambda.length;i++){lambda[i]+=alpha*direction[i];residual[i]-=alpha*product[i];}
      if(Math.max(...residual.map(Math.abs))<1e-9)break;z=precondition(residual);const next=dot(residual,z),beta=next/rz;for(let i=0;i<direction.length;i++)direction[i]=z[i]+beta*direction[i];rz=next;
    }
    const correction=transpose(lambda).map((p,i)=>mul3(inverses[i],p)),values=free.map((p,i)=>p.map((v,k)=>v-correction[i][k])),error=constraint(values).map((v,i)=>v-bounds[i]),res=Math.max(...error.map(Math.abs));
    if(res>1e-6)throw Error(`Source ramp constraints did not converge: ${res}`);return {values,lambda,offsets,res};
  }
  for(;activeIterations<1600;activeIterations++){
    const result=solve();fitted=result.values;constraintResidual=result.res;let remove=-1,wrong=-1e-7;
    for(const [j,sign] of active){const multiplier=result.lambda[result.offsets[j]+2]*sign;if(multiplier<wrong){wrong=multiplier;remove=j;}}
    if(remove>=0){active.delete(remove);continue;}
    let add=-1,sign=0,violation=1e-7;for(let j=0;j<m;j++){if(active.has(j))continue;const a=fitted[j],b=fitted[(j+1)%m],tx=-A[j][5],tz=A[j][4],jump=((b[1]-a[1])*tx+(b[2]-a[2])*tz)/L,excess=Math.abs(jump)-boundsAtHinge[j];if(excess>violation){violation=excess;add=j;sign=Math.sign(jump);}}
    if(add<0)break;active.set(add,sign);
  }
  if(activeIterations===1600)throw Error('Source ramp slope bounds did not converge');
  let maximumAdjustment=0,sumSquares=0,maximumGradientChange=0;
  for(let j=0;j<m;j++){
    const start=knots[j],end=knots[j+1]??n,origin=source[start].pos,[height,x,z]=fitted[j],gx=x/L,gz=z/L,plane={id:j,x:origin[0],z:origin[2],height,gx,gz};
    const previous=fitted[(j+m-1)%m];maximumGradientChange=Math.max(maximumGradientChange,Math.hypot(x-previous[1],z-previous[2])/L);
    for(let i=start;i<end;i++){const p=points[i],value=height+gx*(p.pos[0]-origin[0])+gz*(p.pos[2]-origin[2]),delta=value-source[i].pos[1];maximumAdjustment=Math.max(maximumAdjustment,Math.abs(delta));sumSquares+=delta*delta;p.pos[1]=value;const r=p.right,h=Math.hypot(r[0],r[2]);p.bank=(gx*r[0]+gz*r[2])/h;p.right=unit([r[0]/h,p.bank,r[2]/h]);p.normal=unit([-gx,1,-gz]);p.surfacePlane=plane;}
  }
  const lap=points[n].s;Object.assign(points[n],structuredClone(points[0]));points[n].s=lap;
  return {method:'GLB height least-squares fit with exact full-width hinges, bounded pitch changes and closed lap',lengthStuds:length,facets:m,maximumAdjustmentStuds:maximumAdjustment,rmsAdjustmentStuds:Math.sqrt(sumSquares/n),constraintResidualStuds:constraintResidual,maximumGradientChange,iterations,activeIterations,boundedHinges:active.size,knots};
}
