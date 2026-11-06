export type FleetStatus = 'working' | 'idle' | 'needs-you' | 'stuck' | 'waiting' | 'stopped' | 'unknown';
export interface FleetSeat { session:string; rig:string; name:string; state:FleetStatus; activity:string; tail?:string[]; reason?:string; since?:number }
export interface FleetNeed { id:string; rig:string; seat:string; summary:string }
export interface FleetSnapshot {
  status:'ready'|'stale';
  teams:string[];
  seats:FleetSeat[];
  needs:FleetNeed[];
}
/** The owner's privacy eye: which teams guests may watch, and whether they see live terminals and his gold cards. */
export interface FleetGuestSettings { terminals:boolean; cards:boolean; teams:Record<string,boolean> }
/** One coloured run of a terminal line: text, fg, bg (-1 default, 0-255 palette, '#rrggbb'; -2/-3 inverse defaults), bold. */
export type FleetRun = [string, number|string, number|string, number];
export interface FleetScreen { cols:number; rows?:number; lines:FleetRun[][] }
export type FleetClientMsg = {t:'fleet.subscribe'} | {t:'fleet.guests'; settings:FleetGuestSettings} | {t:'fleet.screens'; on:boolean};
/** `guest` marks a filtered, read-only copy; `guests` reaches only the owner. */
export type FleetServerMsg = {t:'fleet'; state:FleetSnapshot|null; guest?:boolean} | {t:'fleet.guests'; settings:FleetGuestSettings} | {t:'fleet.screens'; screens:Record<string,FleetScreen>; reset?:boolean};
