import * as THREE from 'three';

export function roomSign(text:string){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#20272b';ctx.fillRect(0,0,768,128);
  ctx.fillStyle='#d67d43';ctx.fillRect(0,0,8,128);
  ctx.fillStyle='#f2f0eb';ctx.font='500 42px Segoe UI';ctx.textBaseline='middle';ctx.fillText(text,32,64,704);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.3),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
  mesh.userData.ownedTexture=texture;
  return mesh;
}
