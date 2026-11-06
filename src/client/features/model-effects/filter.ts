import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { ModelEffects } from './profile';

/** Captures the existing scene/hands draw through the view registry, without a second scene render. */
export class ModelBloom {
  private target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
  private bloom: UnrealBloomPass;
  private output = new OutputPass();
  private size = new THREE.Vector2();
  private previous: THREE.WebGLRenderTarget | null = null;
  constructor(private renderer: THREE.WebGLRenderer, profile: ModelEffects) {
    const b = profile.bloom;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), b.strength, b.radius, b.threshold);
  }
  prepare(scene: THREE.Scene, camera: THREE.Camera) {
    const previous = this.renderer.getRenderTarget();
    const scratch = new THREE.WebGLRenderTarget(1, 1);
    try {
      this.renderer.compile(scene, camera);
      this.renderer.setRenderTarget(scratch);
      this.begin();
      this.renderer.render(scene, camera);
      this.end();
    } finally { this.renderer.setRenderTarget(previous); scratch.dispose(); }
  }
  begin() {
    this.renderer.getDrawingBufferSize(this.size);
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) {
      this.target.setSize(this.size.x, this.size.y);
      this.bloom.setSize(Math.max(1, Math.floor(this.size.x / 2)), Math.max(1, Math.floor(this.size.y / 2)));
    }
    this.previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
  }
  end() {
    try {
      this.bloom.render(this.renderer, this.target, this.target, 0, false);
      this.output.renderToScreen = this.previous === null;
      this.output.render(this.renderer, this.previous ?? this.target, this.target, 0, false);
    } finally { this.renderer.setRenderTarget(this.previous); }
  }
  dispose() { this.target.dispose(); this.bloom.dispose(); this.output.dispose(); }
}
