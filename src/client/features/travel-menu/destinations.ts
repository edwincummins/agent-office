import type { MapPlan, Spot } from '../../../shared/maps';

export interface NamedPlace { id: string; name: string; icon: string; at: Spot; owner?: boolean }
// Standing arrival behind the owner chair from the HQ layout. Sitting remains a separate interaction.
export const HQ_HOME = { x: 0, y: 5.7, z: -22.6, rotY: 0 };
export function namedPlaces(plan: MapPlan): NamedPlace[] {
  if (plan.id !== 'hustle-hq' || !plan.levels) return [];
  const home = plan.levels.floors.find(f => f.id === 'owner-dais');
  const places: NamedPlace[] = home ? [{ id: 'home', name: plan.name.replace(/ HQ$/, ''), icon: '🏠', at: { ...HQ_HOME, y: home.y }, owner: true }] : [];
  const lift = plan.levels.lifts.find(l => l.id === 'hq-lift');
  for (const stop of lift?.stops ?? []) {
    const level = plan.levels.floors.find(f => f.id === stop.level);
    if (level) places.push({ id: level.id, name: level.y === 0 ? 'HQ · Ground floor' : 'HQ · Mezzanine', icon: level.y === 0 ? '1' : '2', at: { x: stop.x, z: stop.z, y: level.y, rotY: 0 } });
  }
  return places;
}
export function atPlace(position: {x:number;y:number;z:number}, at: Spot): boolean {
  return Math.abs(position.y - at.y) < 0.3 && Math.hypot(position.x-at.x, position.z-at.z) < 0.65;
}
