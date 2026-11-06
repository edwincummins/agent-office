export interface LiftMotion {
  id: string;
  from: number;
  to: number;
  started: number;
  duration: number;
  riders: string[];
}
export type LevelsClientMsg = { t: 'levels.sync' } | { t: 'levels.lift'; id: string; stop: number };
export type LevelsServerMsg = { t: 'levels.lifts'; map: string; motions: LiftMotion[] };
