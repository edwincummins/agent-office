import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Batch rigid parts sharing a material while retaining their original animation and picking handles. */
export function batchRigidParts(root: THREE.Object3D, materials: THREE.Material[]): () => void {
  const restores: (() => void)[] = [];
  for (const material of materials) {
    const parts: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
    root.traverse(o => { if (o instanceof THREE.Mesh && !o.children.length && o.material === material && !(o instanceof THREE.SkinnedMesh) && !(o instanceof THREE.InstancedMesh) && !Object.keys(o.geometry.morphAttributes).length) parts.push(o); });
    const groups = new Map<string, typeof parts>();
    for (const p of parts) { const key = `${p.castShadow}/${p.receiveShadow}/${p.renderOrder}/${p.layers.mask}`; const a = groups.get(key) ?? []; a.push(p); groups.set(key, a); }
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      const copies = members.map(p => p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone());
      const geometry = mergeGeometries(copies, false);
      if (!geometry) { copies.forEach(g => g.dispose()); continue; }
      const first = members[0], batch = new THREE.Mesh(geometry, material);
      batch.name = 'rigid-part-batch'; batch.raycast = () => {}; batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
      batch.renderOrder = first.renderOrder; batch.layers.mask = first.layers.mask; batch.frustumCulled = false;
      const originals = members.map(p => ({ geometry: p.geometry, raycast: p.raycast }));
      const empty = new THREE.BufferGeometry();
      members.forEach((p, i) => {
        p.geometry = empty;
        p.raycast = function(raycaster, hits) { this.geometry = originals[i].geometry; try { originals[i].raycast.call(this, raycaster, hits); } finally { this.geometry = empty; } };
      });
      const inverse = new THREE.Matrix4(), matrix = new THREE.Matrix4(), normal = new THREE.Matrix3(), v = new THREE.Vector3();
      const update = () => {
        inverse.copy(root.matrixWorld).invert(); let offset = 0;
        const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
        members.forEach((p, i) => {
          let visible = true; for (let o: THREE.Object3D | null = p; o; o = o.parent) if (!o.visible) visible = false;
          matrix.multiplyMatrices(inverse, p.matrixWorld); normal.getNormalMatrix(matrix);
          const source = copies[i].getAttribute('position'), sourceNormal = copies[i].getAttribute('normal');
          for (let j = 0; j < source.count; j++) {
            if (visible) v.fromBufferAttribute(source, j).applyMatrix4(matrix); else v.set(0, 0, 0);
            positions.setXYZ(offset+j, v.x, v.y, v.z);
            if (normals && sourceNormal) { v.fromBufferAttribute(sourceNormal, j).applyMatrix3(normal).normalize(); normals.setXYZ(offset+j, v.x, v.y, v.z); }
          }
          offset += source.count;
        });
        positions.needsUpdate = true; if (normals) normals.needsUpdate = true;
      };
      const updateWorld = batch.updateMatrixWorld;
      batch.updateMatrixWorld = function(force) { updateWorld.call(this, force); update(); };
      root.add(batch);
      restores.push(() => { members.forEach((p,i) => {p.geometry=originals[i].geometry;p.raycast=originals[i].raycast;}); batch.removeFromParent(); geometry.dispose(); empty.dispose(); copies.forEach(g=>g.dispose()); });
    }
  }
  return () => { for (const restore of restores.splice(0)) restore(); };
}
