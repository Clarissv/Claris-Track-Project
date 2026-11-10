import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readGlb,accessor,nodeMatrix,multiply,transform,decodePng,encodePng} from '../../../../mesh-geometry.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const source=process.argv[2]??path.resolve(here,'../../../../../../Red Bull Ring/source/redbullring.glb');
const glb=readGlb(source),g=glb.json,identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const records=g.materials.map((m,i)=>({index:i,name:m.name,imageIndex:g.textures[m.pbrMetallicRoughness?.baseColorTexture?.index]?.source,vertices:0,triangles:0,bounds:{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}}));
function visit(i,parent){const n=g.nodes[i],matrix=multiply(parent,nodeMatrix(n));if(n.mesh!==undefined&&n.name!=='Plane')for(const primitive of g.meshes[n.mesh].primitives){const r=records[primitive.material],positions=accessor(glb,primitive.attributes.POSITION);r.vertices+=positions.length/3;r.triangles+=(primitive.indices===undefined?positions.length/3:g.accessors[primitive.indices].count)/3;for(let k=0;k<positions.length;k+=3){const p=transform(matrix,...positions.subarray(k,k+3));for(let a=0;a<3;a++){r.bounds.min[a]=Math.min(r.bounds.min[a],p[a]);r.bounds.max[a]=Math.max(r.bounds.max[a],p[a]);}}}for(const c of n.children??[])visit(c,matrix);}
for(const i of g.scenes[g.scene??0].nodes)visit(i,identity);
fs.writeFileSync(path.join(here,'material-index.json'),JSON.stringify({sourceSha256:glb.sha256,materials:records},null,2)+'\n');
const digits=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
for(const [from,to] of [[0,94],[95,133]]){
  const columns=7,tw=200,th=150,width=columns*tw,height=Math.ceil((to-from+1)/columns)*th,pixels=Buffer.alloc(width*height*4);
  for(let i=0;i<pixels.length;i+=4)pixels.set([28,34,38,255],i);
  for(let i=from;i<=to;i++){const r=records[i],x0=(i-from)%columns*tw,y0=Math.floor((i-from)/columns)*th;if(r.imageIndex===undefined)continue;const im=g.images[r.imageIndex],bv=g.bufferViews[im.bufferView],image=decodePng(glb.bin.subarray(bv.byteOffset??0,(bv.byteOffset??0)+bv.byteLength));
    r.imageSize=[image.width,image.height];
    for(let y=0;y<th-24;y++)for(let x=0;x<tw-4;x++){const sx=Math.min(image.width-1,Math.floor(x/(tw-4)*image.width)),sy=Math.min(image.height-1,Math.floor(y/(th-24)*image.height));pixels.set(image.pixels.subarray((sy*image.width+sx)*4,(sy*image.width+sx)*4+4),((y0+y)*width+x0+x)*4);}
    for(const [j,d] of [...String(i)].entries())for(let y=0;y<5;y++)for(let x=0;x<3;x++)if(digits[Number(d)][y*3+x]==='1')for(let yy=0;yy<3;yy++)for(let xx=0;xx<3;xx++)pixels.set([255,213,109,255],((y0+130+y*3+yy)*width+x0+8+j*13+x*3+xx)*4);
  }
  fs.writeFileSync(path.join(here,`materials-${from}-${to}.png`),encodePng(width,height,pixels));
}
console.log(JSON.stringify({sha256:glb.sha256,materials:records.length,review:here}));
