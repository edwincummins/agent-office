export type FleetStatus = 'working' | 'idle' | 'needs-you' | 'stuck' | 'stopped';
export interface FleetSeat { session:string; rig:string; name:string; state:FleetStatus; activity:string }
export interface FleetNeed { id:string; rig:string; seat:string; summary:string }
export interface FleetSnapshot {
  status:'ready'|'stale';
  teams:string[];
  seats:FleetSeat[];
  needs:FleetNeed[];
}
export type FleetClientMsg = {t:'fleet.subscribe'};
export type FleetServerMsg = {t:'fleet'; state:FleetSnapshot|null};
