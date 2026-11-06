import * as THREE from 'three';

/** Tint the existing CubeUV PMREM once; retain its packed mip layout and original ownership. */
export function tintEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, hex: string): () => void {
  const original = scene.environment;
  const image = original?.image as { width?: number; height?: number } | undefined;
  if (!original || original.mapping !== THREE.CubeUVReflectionMapping || !image?.width || !image.height) return () => {};
  const target = new THREE.WebGLRenderTarget(image.width, image.height, {
    type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, generateMipmaps: false,
  });
  target.texture.mapping = THREE.CubeUVReflectionMapping;
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const material = new THREE.ShaderMaterial({
    uniforms: { source: { value: original }, tint: { value: new THREE.Color(hex) } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D source; uniform vec3 tint; varying vec2 vUv; void main(){vec4 c=texture2D(source,vUv);gl_FragColor=vec4(c.rgb*tint,c.a);}',
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const geometry = new THREE.PlaneGeometry(2, 2), quad = new THREE.Scene();
  quad.add(new THREE.Mesh(geometry, material));
  const previous = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target); renderer.render(quad, new THREE.Camera());
    scene.environment = target.texture;
  } catch (error) { target.dispose(); throw error; }
  finally { renderer.setRenderTarget(previous); geometry.dispose(); material.dispose(); }
  return () => { if (scene.environment === target.texture) scene.environment = original; target.dispose(); };
}
