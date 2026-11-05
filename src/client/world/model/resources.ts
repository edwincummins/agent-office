import * as THREE from 'three';

/** Only for the imported GLB, whose textures are owned here (never shared TV/board textures). */
export function releaseModel(root:THREE.Object3D){
  const textures=new Set<THREE.Texture>();
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
