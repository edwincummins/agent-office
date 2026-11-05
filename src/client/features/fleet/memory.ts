export const BOARD_MODE_KEY='agent-office.boardModes';
export function boardKey(floor:string|null,environment:string){return JSON.stringify([floor??'',environment]);}
export function readMode(storage:Pick<Storage,'getItem'>,key:string):boolean {
  try {const saved=JSON.parse(storage.getItem(BOARD_MODE_KEY)??'{}');return saved?.[key]==='cadre';}catch{return false;}
}
export function writeMode(storage:Pick<Storage,'getItem'|'setItem'>,key:string,cadre:boolean) {
  try {
    let raw:unknown;try{raw=JSON.parse(storage.getItem(BOARD_MODE_KEY)||'{}');}catch{raw={};}
    const saved=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
    saved[key]=cadre?'cadre':'services';storage.setItem(BOARD_MODE_KEY,JSON.stringify(saved));
  }catch{/* Private browsing still permits a choice for this visit. */}
}
