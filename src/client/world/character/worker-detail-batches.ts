import { batchRigidSiblings } from '../rigid-batch';
import type { Beard } from '../costumes';

/** Batch only rigid leaf meshes that share one animated group, preserving that group's visibility and transforms. */
export function batchBeardParts(beard: Beard): () => void {
  const releases = [beard.mustache, beard.hang, beard.brows, beard.bags].map(parent => batchRigidSiblings(parent));
  return () => { for (const release of releases) release(); };
}
