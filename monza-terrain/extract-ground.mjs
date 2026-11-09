import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readGlb,accessor,multiply,nodeMatrix,transform} from '../monza/mesh-geometry.mjs';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export function extractGround(filename,reference,plan,cell=16) {
  const glb=readGlb(filename),g=glb.json;
  if(glb.sha256!==reference.sourceSha256)throw Error('Ground GLB does not match the track source');
  // Use the actual grass surfaces. The coarse grass_collider is excluded.
  const names=['grass_2_grass_2_monza_0','terrain_no_collision_grass_monza_0'];
  const outer=nodeMatrix(g.nodes.find(n=>n.name==='Sketchfab_model'));
  const n=[outer[8],outer[9],outer[10]],length=Math.hypot(...n);
  const normal=n.map(v=>v/length),axis=[-normal[2],0,normal[0]],sin=Math.hypot(...axis),cos=normal[1],k=axis.map(v=>v/sin);
  const level=q=>{const cross=[k[1]*q[2]-k[2]*q[1],k[2]*q[0]-k[0]*q[2],k[0]*q[1]-k[1]*q[0]],dot=k.reduce((s,v,i)=>s+v*q[i],0);return q.map((v,i)=>v*cos+cross[i]*sin+k[i]*dot*(1-cos));};
  const x0=Math.floor((plan.meta.planBounds.min[0]-320)/cell)*cell,z0=Math.floor((plan.meta.planBounds.min[2]-320)/cell)*cell;
  const nx=Math.ceil((plan.meta.planBounds.max[0]+320-x0)/cell),nz=Math.ceil((plan.meta.planBounds.max[2]+320-z0)/cell);
  const heights=new Float64Array(nx*nz).fill(-Infinity),meshes=[];let triangles=0;
  const frame=reference.modelFrame,rasterScale=frame.normalizedWidth/(frame.bounds.max[0]-frame.bounds.min[0]);
  const rasterDepth=Math.ceil((frame.bounds.max[2]-frame.bounds.min[2])*rasterScale);
  function visit(index,parent) {
    const node=g.nodes[index],matrix=multiply(parent,nodeMatrix(node));
    const mesh=node.mesh!==undefined&&g.meshes[node.mesh];
    if(mesh&&names.includes(mesh.name))for(const primitive of mesh.primitives) {
      const positions=accessor(glb,primitive.attributes.POSITION),indices=accessor(glb,primitive.indices);
      for(let i=0;i<positions.length;i+=3) {
        const q=level(transform(matrix,...positions.subarray(i,i+3)));
        // The track reference is centred in its normalized source raster.
        // Reproduce that complete transform, including height normalization.
        const p=[((q[0]-frame.bounds.min[0])*rasterScale-frame.normalizedWidth/2)*frame.factor,
          q[1]*rasterScale*frame.factor+plan.meta.groundLift,
          ((q[2]-frame.bounds.min[2])*rasterScale-rasterDepth/2)*frame.factor];
        positions.set(p,i);
      }
      meshes.push({name:mesh.name,vertices:positions.length/3,triangles:indices.length/3});
      for(let i=0;i<indices.length;i+=3) {
        const [a,b,c]=[...indices.subarray(i,i+3)].map(j=>[...positions.subarray(j*3,j*3+3)]);
        const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
        if(Math.abs(den)<1e-9)continue;
        triangles++;
        const ix0=Math.max(0,Math.ceil((Math.min(a[0],b[0],c[0])-x0)/cell-.5)),ix1=Math.min(nx-1,Math.floor((Math.max(a[0],b[0],c[0])-x0)/cell-.5));
        const iz0=Math.max(0,Math.ceil((Math.min(a[2],b[2],c[2])-z0)/cell-.5)),iz1=Math.min(nz-1,Math.floor((Math.max(a[2],b[2],c[2])-z0)/cell-.5));
        for(let z=iz0;z<=iz1;z++)for(let x=ix0;x<=ix1;x++) {
          const px=x0+(x+.5)*cell,pz=z0+(z+.5)*cell;
          const wa=((b[2]-c[2])*(px-c[0])+(c[0]-b[0])*(pz-c[2]))/den;
          const wb=((c[2]-a[2])*(px-c[0])+(a[0]-c[0])*(pz-c[2]))/den,wc=1-wa-wb;
          if(Math.min(wa,wb,wc)<-1e-7)continue;
          heights[z*nx+x]=Math.max(heights[z*nx+x],wa*a[1]+wb*b[1]+wc*c[1]);
        }
      }
    }
    for(const child of node.children??[])visit(child,matrix);
  }
  for(const node of g.scenes[g.scene??0].nodes)visit(node,identity);
  if(!meshes.length)throw Error('Named grass meshes are missing');
  const valid=[...heights].filter(Number.isFinite);
  if(!valid.length)throw Error('No source grass heights were extracted');
  return {format:'monza-ground-reference-v1',sourceSha256:glb.sha256,trackPlanDatum:plan.meta.groundLift,cell,x0,z0,nx,nz,meshes,triangles,presentationTiltRemovedDegrees:Math.acos(cos)*180/Math.PI,modelToStuds:rasterScale*frame.factor,rasterScale,rasterDepth,sampledCells:valid.length,heightRange:[Math.min(...valid),Math.max(...valid)],heights:[...heights].map(h=>Number.isFinite(h)?Math.round(h*1000)/1000:null)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const here=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(here,'../monza');
  const reference=JSON.parse(fs.readFileSync(path.join(base,'source/monza-reference.json'))),plan=JSON.parse(fs.readFileSync(path.join(base,'monza-plan.json')));
  const ground=extractGround(path.join(base,'Autodromo Nazionale Monza.glb'),reference,plan);
  fs.mkdirSync(path.join(here,'source'),{recursive:true});
  fs.writeFileSync(path.join(here,'source/ground-reference.json'),JSON.stringify(ground));
  const {heights,...report}=ground;console.log(JSON.stringify(report,null,2));
}
