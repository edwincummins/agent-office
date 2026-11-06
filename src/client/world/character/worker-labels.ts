import * as THREE from 'three';
import { disposeSprite, textSprite } from '../toon';

/** Owns the shared vertical offset for a worker's name and task card. */
export class WorkerLabels {
  lift = 0;

  name(name: string, previous: THREE.Sprite | null, root: THREE.Group): THREE.Sprite {
    if (previous) {
      root.remove(previous);
      disposeSprite(previous);
    }
    const tag = textSprite(name, { bg: '#2b2d42', color: '#fffaf3', size: 36, border: '#fffaf3' });
    tag.position.y = 1.55 + this.lift;
    root.add(tag);
    return tag;
  }

  setLift(metres: number, nameTag: THREE.Sprite | null, bubble: THREE.Sprite | null): void {
    const next = Math.max(0, Math.min(2, metres));
    const delta = next - this.lift;
    this.lift = next;
    if (nameTag) nameTag.position.y += delta;
    if (bubble) bubble.position.y += delta;
  }
}
