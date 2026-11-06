/** Arrange mode's bar along the bottom: what's picked, Move / Turn / Size, Reset, Undo, Save and Done. */
export type GizmoMode = 'translate' | 'rotate' | 'scale';

export interface ArrangeView {
  mode: GizmoMode;
  selected: string | null;
  canSize: boolean;
  canReset: boolean;
  unsaved: number;
  canUndo: boolean;
}
export interface ArrangeActions {
  mode(m: GizmoMode): void;
  reset(): void;
  undo(): void;
  save(): void;
  done(): void;
  discard(): void;
  keep(): void;
}
export interface ArrangeBar {
  paint(v: ArrangeView): void;
  /** Done with unsaved changes: Save, Discard, or keep arranging. */
  ask(): void;
  remove(): void;
}

const button = (label: string, title: string, run: () => void) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  // The bar's own clicks never reach the room under it.
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    run();
  });
  return b;
};

export function arrangeBar(act: ArrangeActions): ArrangeBar {
  const root = document.createElement('div');
  root.id = 'arrange-bar';
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  const what = document.createElement('span');
  what.className = 'arrange-what';
  const modes = {
    translate: button('✥ Move', 'Drag the arrows (1)', () => act.mode('translate')),
    rotate: button('⟳ Turn', 'Drag the ring (2)', () => act.mode('rotate')),
    scale: button('⤢ Size', 'Drag a handle to make it bigger or smaller (3)', () => act.mode('scale')),
  };
  const reset = button('↺ Reset', 'Put it back where the map has it', act.reset);
  const undo = button('↶ Undo', 'Undo the last change (Ctrl+Z)', act.undo);
  const save = button('Save', 'Save every change: they stay where you put them', act.save);
  save.className = 'primary';
  const done = button('Done', 'Stop arranging (Esc)', act.done);
  const main = document.createElement('div');
  main.className = 'arrange-row';
  main.append(what, modes.translate, modes.rotate, modes.scale, reset, undo, save, done);
  const askRow = document.createElement('div');
  askRow.className = 'arrange-row arrange-ask';
  askRow.hidden = true;
  const askText = document.createElement('span');
  const back = () => {
    askRow.hidden = true;
    main.hidden = false;
    act.keep();
  };
  const saveAndGo = button('Save', 'Save and stop arranging', () => {
    act.save();
    back();
    act.done();
  });
  saveAndGo.className = 'primary';
  askRow.append(
    askText,
    saveAndGo,
    button('Discard', 'Put everything back and stop arranging', () => {
      back();
      act.discard();
    }),
    button('Keep arranging', 'Go back to arranging', back),
  );
  root.append(main, askRow);
  document.body.append(root);
  return {
    paint(v) {
      what.textContent = v.selected ? `📐 ${v.selected}` : '📐 Click something to move it';
      for (const [m, b] of Object.entries(modes)) b.classList.toggle('on', m === v.mode);
      modes.scale.disabled = !v.canSize;
      modes.scale.title = v.canSize ? 'Drag a handle to make it bigger or smaller (3)' : 'Only decor (plants, signs, lamps) can be resized';
      reset.disabled = !v.canReset;
      undo.disabled = !v.canUndo;
      save.disabled = !v.unsaved;
      save.textContent = v.unsaved ? `Save (${v.unsaved})` : 'Save';
    },
    ask() {
      askText.textContent = 'You have changes that aren’t saved.';
      main.hidden = true;
      askRow.hidden = false;
    },
    remove() {
      root.remove();
    },
  };
}
