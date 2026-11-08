import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readGlb,accessor,multiply,nodeMatrix,transform,decodePng} from './mesh-geometry.mjs';
export {readGlb};
export const surfaceNames={
  road:['TARMAC_MAIN_road_monza_0','TARMAC_MAIN_OLDER_road_monza_0','TARMAC_T1_road_monza_0'],
  pit:['pitlane_road_monza_0'],kerb:['curbs_road_monza_0'],
  runoff:['astroturf_road_monza_0','tarmac_nocol_road_monza_0'],
  sand:['gravel_trap_runoff_monza_0'],
};
export function loadSurfaces(filename) {
  const glb=readGlb(filename),g=glb.json,wanted=new Map(Object.entries(surfaceNames).flatMap(([role,names])=>names.map(n=>[n,role]))),primitives=[],images=new Map();
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  const imageAt=i=>{if(images.has(i))return images.get(i);const im=g.images[i],bv=g.bufferViews[im.bufferView];const bytes=im.mimeType==='image/png'?glb.bin.subarray(bv.byteOffset??0,(bv.byteOffset??0)+bv.byteLength):fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'reference-review',`texture-${i}.png`));const decoded=decodePng(bytes);images.set(i,decoded);return decoded;};
  function visit(index,parent) {
    const n=g.nodes[index],matrix=multiply(parent,nodeMatrix(n));
    if(n.mesh!==undefined) {
      const mesh=g.meshes[n.mesh],role=wanted.get(mesh.name);
      if(role)for(const p of mesh.primitives) {
        const positions=accessor(glb,p.attributes.POSITION);
        for(let i=0;i<positions.length;i+=3){const q=transform(matrix,...positions.subarray(i,i+3));positions.set(q,i);for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],q[k]);bounds.max[k]=Math.max(bounds.max[k],q[k]);}}
        const material=g.materials[p.material],pbr=material.pbrMetallicRoughness??{},tex=pbr.baseColorTexture,texture=tex&&g.textures[tex.index];
        primitives.push({name:mesh.name,role,positions,indices:accessor(glb,p.indices),uv:p.attributes.TEXCOORD_0!==undefined?accessor(glb,p.attributes.TEXCOORD_0):undefined,image:texture&&imageAt(texture.source),sampler:texture&&g.samplers?.[texture.sampler],material:{...material,alphaMode:'OPAQUE'},color:pbr.baseColorFactor??[1,1,1,1]});
      }
    }
    for(const child of n.children??[])visit(child,matrix);
  }
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for(const index of g.scenes[g.scene??0].nodes)visit(index,identity);
  // Sketchfab's outer display transform tips the native vertical axis. Undo
  // only that presentation tilt, retaining horizontal orientation and hills.
  const outer=g.nodes.find(n=>n.name==='Sketchfab_model');
  const m=nodeMatrix(outer),normal=[m[8],m[9],m[10]],length=Math.hypot(...normal);
  const n=normal.map(v=>v/length),axis=[-n[2],0,n[0]],sin=Math.hypot(...axis),cos=n[1];
  const k=axis.map(v=>v/sin);
  const level=q=>{const cross=[k[1]*q[2]-k[2]*q[1],k[2]*q[0]-k[0]*q[2],k[0]*q[1]-k[1]*q[0]],dot=k.reduce((s,v,i)=>s+v*q[i],0);return q.map((v,i)=>v*cos+cross[i]*sin+k[i]*dot*(1-cos));};
  bounds.min.fill(Infinity);bounds.max.fill(-Infinity);
  for(const p of primitives)for(let i=0;i<p.positions.length;i+=3){const q=level([...p.positions.subarray(i,i+3)]);p.positions.set(q,i);for(let a=0;a<3;a++){bounds.min[a]=Math.min(bounds.min[a],q[a]);bounds.max[a]=Math.max(bounds.max[a],q[a]);}}
  return {sha256:glb.sha256,primitives,bounds,presentationTiltDegrees:Math.acos(cos)*180/Math.PI};
}
