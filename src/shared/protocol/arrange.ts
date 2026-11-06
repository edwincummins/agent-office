// Arrange mode (see shared/arrange.ts): the owner saving where things go on the map everyone's on.
import type { ArrangeChange, ArrangeTarget } from '../arrange.js';

export type ArrangeClientMsg =
  /** Owner only. One save: these moved, these go back to where the map has them. Everyone's map is put up again once. */
  { t: 'arrange.set'; map: string; changes: ArrangeChange[]; reset?: ArrangeTarget[] };
