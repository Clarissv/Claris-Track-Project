import fs from 'node:fs';
import path from 'node:path';
import {readGlb,accessor,nodeMatrix,multiply,transform,decodePng} from './mesh-geometry.mjs';

// Material IDs were checked against triangle geometry and embedded texture previews.
// 10/11 are tyre-mark overlays, not separate paved ground.
export const surfaceMaterials={road:[111],runoff:[107],kerb:[14,22,109],gravel:[108,123],grass:[121],edge:[119]};
export function loadSurfaces(filename){
  const glb=readGlb(filename),g=glb.json,roles=new Map(Object.entries(surfaceMaterials).flatMap(([role,ids])=>ids.map(id=>[id,role])));
  const primitives=[],images=new Map(),identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  function imageAt(index){
    if(images.has(index))return images.get(index);
    const im=g.images[index],bv=g.bufferViews[im.bufferView];
    if(im.mimeType!=='image/png'||!bv)throw Error('The elevation source must have embedded PNG textures');
    const image=decodePng(glb.bin.subarray(bv.byteOffset??0,(bv.byteOffset??0)+bv.byteLength));images.set(index,image);return image;
  }
  function visit(index,parent){
    const node=g.nodes[index],matrix=multiply(parent,nodeMatrix(node));
    if(node.mesh!==undefined&&node.name!=='Plane')for(const p of g.meshes[node.mesh].primitives){
      const role=roles.get(p.material);if(!role)continue;
      const positions=accessor(glb,p.attributes.POSITION);
      for(let i=0;i<positions.length;i+=3)positions.set(transform(matrix,...positions.subarray(i,i+3)),i);
      const indices=accessor(glb,p.indices),material=g.materials[p.material],pbr=material.pbrMetallicRoughness??{},texture=g.textures[pbr.baseColorTexture?.index];
      primitives.push({name:material.name,materialIndex:p.material,role,positions,indices,uv:p.attributes.TEXCOORD_0===undefined?undefined:accessor(glb,p.attributes.TEXCOORD_0),image:texture&&imageAt(texture.source),sampler:texture&&g.samplers?.[texture.sampler],material:{...material,alphaMode:'OPAQUE'},color:pbr.baseColorFactor??[1,1,1,1]});
    }
    for(const child of node.children??[])visit(child,matrix);
  }
  for(const index of g.scenes[g.scene??0].nodes)visit(index,identity);
  if(!primitives.some(p=>p.role==='road'))throw Error('The checked road material is missing');
  const road=primitives.filter(p=>p.role==='road'),bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const p of road)for(let i=0;i<p.positions.length;i+=3)for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],p.positions[i+k]);bounds.max[k]=Math.max(bounds.max[k],p.positions[i+k]);}
  return {sha256:glb.sha256,primitives,bounds,surfaceMaterials};
}
