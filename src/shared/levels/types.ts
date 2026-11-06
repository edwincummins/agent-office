import type { Bounds } from '../nav.js';

export interface Level extends Bounds {
  id: string;
  y: number;
  thickness: number;
}
export interface Landing {
  x: number;
  z: number;
  level: string;
}
export interface Stair {
  id: string;
  from: Landing;
  to: Landing;
  width: number;
  steps: number;
}
export interface Rail extends Bounds {
  level: string;
  height: number;
}
export interface Lift {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  stops: Landing[];
}
export interface LevelsConfig {
  floors: Level[];
  stairs: Stair[];
  rails?: Rail[];
  lifts?: Lift[];
  seats?: Record<string, string>;
  spawn?: string;
}
export interface LevelSolid extends Bounds {
  stairSurface?: boolean;
  seatId?: string;
  bottom: number;
  top: number;
  fence?: boolean;
}
export interface LevelsPlan extends LevelsConfig {
  rails: Rail[];
  lifts: Lift[];
  seats: Record<string, string>;
  solids: LevelSolid[];
}
