import * as THREE from 'three';

const retained=new WeakMap<THREE.Object3D,Set<THREE.Texture>>();
export function retainModelTextures(root:THREE.Object3D){
 const textures=new Set<THREE.Texture>();root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);});retained.set(root,textures);
}
/** Only for the imported GLB, whose textures are owned here (never shared TV/board textures). */
export function releaseModel(root:THREE.Object3D){
  const textures=retained.get(root)??new Set<THREE.Texture>();retained.delete(root);
  const materials=new Set<THREE.Material>();
  const geometries=new Set<THREE.BufferGeometry>();
  root.traverse(o=>{if(o instanceof THREE.Mesh){
    geometries.add(o.geometry);
    for(const mat of Array.isArray(o.material)?o.material:[o.material]){
      materials.add(mat);
      for(const value of Object.values(mat)) if(value instanceof THREE.Texture)textures.add(value);
    }
  }});
  for(const texture of textures){texture.dispose();const image=texture.source.data;if(typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap)image.close();}
  for(const material of materials)material.dispose();
  for(const geometry of geometries)geometry.dispose();
}
