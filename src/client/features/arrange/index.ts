/**
 * Arrange mode (owner only): click a plant, a sign, the TV or the arcade on a map of your own and a
 * gizmo comes up on it: arrows to move it, a ring to turn it, a handle to resize it (decor only).
 * Nothing's sent while you drag; Save sends every change at once (arrange.set), and those placements
 * win over the map's (see shared/arrange.ts). The gizmo and its listeners only exist while it's on.
 */
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { DECOR_SCALE } from '../../../shared/maps/decor';
import type { ArrangeChange, ArrangeTarget } from '../../../shared/arrange';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import type { ArrangeTag } from '../../world/model/decor';
import { arrangeBar, type ArrangeBar, type GizmoMode } from './ui';
import './arrange.css';

interface Pose {
  position: THREE.Vector3;
  rotY: number;
  scale: number;
}
interface Undo {
  key: string;
  before: Pose;
  edit: ArrangeChange | undefined;
  reset: boolean;
}

const keyOf = (t: ArrangeTag) => `${t.kind}:${t.id}`;
const poseOf = (o: THREE.Object3D): Pose => ({ position: o.position.clone(), rotY: o.rotation.y, scale: o.scale.x });
const setPose = (o: THREE.Object3D, p: Pose) => {
  o.position.copy(p.position);
  o.rotation.set(0, p.rotY, 0);
  o.scale.setScalar(p.scale);
};
const FIXTURE_NAMES: Record<string, string> = { tv: 'The TV', arcade: 'The arcade cabinet', jukebox: 'The jukebox', gong: 'The gong' };

export function installArrange(ctx: Ctx) {
  let on = false;
  let controls: TransformControls | null = null;
  let helper: THREE.Object3D | null = null;
  let box: THREE.BoxHelper | null = null;
  let bar: ArrangeBar | null = null;
  let selected: { object: THREE.Object3D; tag: ArrangeTag } | null = null;
  let mode: GizmoMode = 'translate';
  let dragStart: Pose | null = null;
  let lockWas = false;
  /** Changes not saved yet, by kind:id, and the items going back to where the map has them. */
  const edits = new Map<string, ArrangeChange>();
  const resets = new Map<string, ArrangeTarget>();
  /** Where each thing moved was before this session's first change to it, for Discard. */
  const originals = new Map<string, Pose>();
  const undo: Undo[] = [];
  const ray = new THREE.Raycaster();

  const available = () => store.me.owner === true && ctx.world().plan.style === 'model' && store.map.custom.some((m) => m.config?.id === store.map.pick);
  const dirty = () => edits.size + resets.size;

  /** The things on the map up now that can be arranged. */
  function tagged(): { object: THREE.Object3D; tag: ArrangeTag }[] {
    const out: { object: THREE.Object3D; tag: ArrangeTag }[] = [];
    ctx.world().group.traverse((o) => {
      const tag = o.userData.arrange as ArrangeTag | undefined;
      if (tag) out.push({ object: o, tag });
    });
    return out;
  }

  /** The floor under a point: the highest level at or below it (0 off any level). */
  function floorUnder(p: THREE.Vector3): number {
    const floors = store.plan().levels?.floors ?? [];
    return Math.max(0, ...floors.filter((f) => f.y <= p.y + 0.05 && p.x >= f.minX && p.x <= f.maxX && p.z >= f.minZ && p.z <= f.maxZ).map((f) => f.y));
  }

  function nameOf(tag: ArrangeTag): string {
    if (tag.kind === 'fixture') return FIXTURE_NAMES[tag.id] ?? tag.id;
    const item = store.plan().config?.decor?.find((d) => d.id === tag.id);
    return item?.label ?? tag.id;
  }

  function record(object: THREE.Object3D, tag: ArrangeTag) {
    const p = poseOf(object);
    const change: ArrangeChange = { kind: tag.kind, id: tag.id, position: { x: p.position.x, y: p.position.y, z: p.position.z }, rotY: p.rotY };
    if (tag.kind === 'decor') change.scale = p.scale;
    edits.set(keyOf(tag), change);
    resets.delete(keyOf(tag));
  }

  function select(next: { object: THREE.Object3D; tag: ArrangeTag } | null) {
    selected = next;
    if (!controls) return;
    if (!next) controls.detach();
    else {
      controls.attach(next.object);
      if (mode === 'scale' && next.tag.kind !== 'decor') setMode('translate');
    }
    box?.removeFromParent();
    box?.dispose();
    box = next ? new THREE.BoxHelper(next.object, 0xf2c14e) : null;
    if (box) ctx.scene.add(box);
    paint();
  }

  function setMode(m: GizmoMode) {
    if (m === 'scale' && selected?.tag.kind !== 'decor') return;
    mode = m;
    if (!controls) return;
    controls.setMode(m);
    // Turning is only ever round the vertical: things stand up straight.
    controls.showX = m !== 'rotate';
    controls.showZ = m !== 'rotate';
    controls.showY = true;
    controls.setSpace(m === 'rotate' ? 'local' : 'world');
    paint();
  }

  function paint() {
    const arranged = store.map.arranged;
    const placed = !!selected && (selected.tag.kind === 'fixture' ? !!arranged?.fixtures[selected.tag.id as keyof typeof arranged.fixtures] : !!arranged?.decor[selected.tag.id]);
    bar?.paint({
      mode,
      selected: selected ? nameOf(selected.tag) : null,
      canSize: selected?.tag.kind === 'decor',
      canReset: !!selected && (placed || edits.has(keyOf(selected.tag))),
      unsaved: dirty(),
      canUndo: undo.length > 0,
    });
  }

  function onPointerDown(e: PointerEvent) {
    if (!controls || e.button !== 0) return;
    // On the gizmo itself: the gizmo has it.
    if (controls.axis !== null) return;
    const r = ctx.canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), ctx.camera);
    const things = tagged();
    const hit = ray.intersectObjects(things.map((t) => t.object), true)[0];
    if (!hit) return;
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.arrange) o = o.parent;
    const found = things.find((t) => t.object === o);
    if (!found) return;
    // Picking something isn't also a drag to look round.
    e.stopImmediatePropagation();
    select(found);
  }

  function onKey(e: KeyboardEvent) {
    if (!on || (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) return;
    let took = true;
    if (e.key === 'Escape') leave();
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') undoLast();
    else if (e.code === 'Digit1') setMode('translate');
    else if (e.code === 'Digit2') setMode('rotate');
    else if (e.code === 'Digit3') setMode('scale');
    else took = false;
    if (took) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  function undoLast() {
    const u = undo.pop();
    if (!u) return;
    const thing = tagged().find((t) => keyOf(t.tag) === u.key);
    if (thing) setPose(thing.object, u.before);
    if (u.edit) edits.set(u.key, u.edit);
    else edits.delete(u.key);
    if (!u.reset) resets.delete(u.key);
    box?.update();
    paint();
  }

  /** Puts one thing back where the map has it (its placement is dropped on Save). */
  function resetSelected() {
    if (!selected) return;
    const key = keyOf(selected.tag);
    undo.push({ key, before: poseOf(selected.object), edit: edits.get(key), reset: resets.has(key) });
    edits.delete(key);
    const item = selected.tag.kind === 'decor' ? store.plan().config?.decor?.find((d) => d.id === selected!.tag.id) : undefined;
    if (store.map.arranged && (selected.tag.kind === 'fixture' ? store.map.arranged.fixtures[selected.tag.id as keyof typeof store.map.arranged.fixtures] : store.map.arranged.decor[selected.tag.id]))
      resets.set(key, selected.tag);
    // Decor goes back at once when the map file says where; the rest moves on Save.
    const before = originals.get(key);
    if (before) setPose(selected.object, before);
    else if (item && !resets.has(key)) setPose(selected.object, { position: new THREE.Vector3(item.position.x, item.position.y, item.position.z), rotY: item.rotY, scale: item.scale });
    box?.update();
    paint();
  }

  function save() {
    if (!dirty()) return;
    ctx.net.send({ t: 'arrange.set', map: store.map.pick, changes: [...edits.values()], reset: [...resets.values()] });
    edits.clear();
    resets.clear();
    originals.clear();
    undo.length = 0;
    paint();
  }

  function discard() {
    for (const t of tagged()) {
      const before = originals.get(keyOf(t.tag));
      if (before) setPose(t.object, before);
    }
    edits.clear();
    resets.clear();
    originals.clear();
    undo.length = 0;
  }

  function enter() {
    if (on || !available()) return;
    on = true;
    const player = ctx.player as unknown as { lockFailed: boolean; unlock(): void; mouseLook: boolean };
    // The mouse stays free while arranging: clicking the room picks things instead of taking it.
    player.unlock();
    lockWas = player.lockFailed;
    player.lockFailed = true;
    controls = new TransformControls(ctx.camera, ctx.canvas);
    controls.setSize(1.1);
    helper = controls.getHelper();
    ctx.scene.add(helper);
    controls.addEventListener('dragging-changed', (ev) => {
      const dragging = (ev as unknown as { value: boolean }).value;
      player.mouseLook = !dragging;
      if (!selected) return;
      const key = keyOf(selected.tag);
      if (dragging) {
        dragStart = poseOf(selected.object);
        if (!originals.has(key)) originals.set(key, dragStart);
        return;
      }
      const o = selected.object;
      // Never through the floor of the level it's on.
      o.position.y = Math.max(o.position.y, floorUnder(o.position));
      if (dragStart) undo.push({ key, before: dragStart, edit: edits.get(key), reset: resets.has(key) });
      dragStart = null;
      record(o, selected.tag);
      box?.update();
      paint();
    });
    controls.addEventListener('objectChange', () => {
      const o = selected?.object;
      if (!o) return;
      if (mode === 'scale') {
        // One size for all three axes, whichever handle was pulled.
        const before = dragStart?.scale ?? 1;
        const pulled = [o.scale.x, o.scale.y, o.scale.z].reduce((a, b) => (Math.abs(b - before) > Math.abs(a - before) ? b : a));
        o.scale.setScalar(THREE.MathUtils.clamp(pulled, DECOR_SCALE[0], DECOR_SCALE[1]));
      }
      if (mode === 'rotate') o.rotation.set(0, o.rotation.y, 0);
      box?.update();
    });
    ctx.canvas.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    bar = arrangeBar({ mode: setMode, reset: resetSelected, undo: undoLast, save, done: leave, discard: () => (discard(), close()), keep: () => paint() });
    setMode('translate');
    paint();
    ctx.hud.refresh();
  }

  /** Done: unsaved changes ask first (Save or Discard), in the bar itself. */
  function leave() {
    if (!on) return;
    if (dirty()) return bar?.ask();
    close();
  }

  function close() {
    if (!on) return;
    on = false;
    const player = ctx.player as unknown as { lockFailed: boolean; mouseLook: boolean };
    player.lockFailed = lockWas;
    player.mouseLook = true;
    ctx.canvas.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKey, true);
    select(null);
    controls?.detach();
    controls?.dispose();
    helper?.removeFromParent();
    controls = null;
    helper = null;
    bar?.remove();
    bar = null;
    ctx.hud.refresh();
  }

  // A save (or anyone's map change) puts the map up again: pick the same thing in the new one.
  store.on('map', () => {
    if (!on) return;
    if (!available()) return void (discard(), close());
    const key = selected ? keyOf(selected.tag) : null;
    queueMicrotask(() => {
      if (!on) return;
      select(key ? (tagged().find((t) => keyOf(t.tag) === key) ?? null) : null);
    });
  });

  ctx.keys.bind({ code: 'KeyI', when: available, run: () => (on ? leave() : enter()) });

  return {
    /** Whether the owner can arrange things on the map up now. */
    available,
    get active() {
      return on;
    },
    toggle: () => (on ? leave() : enter()),
  };
}
