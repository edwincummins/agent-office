import { stripVTControlCharacters } from 'node:util';
import type { FleetNeed, FleetSeat, FleetSnapshot, FleetStatus } from '../../shared/protocol/fleet.js';

export const STUCK_AFTER_MS = 20 * 60_000;
const obj = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const text = (v:unknown,limit=240) => typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,limit):'';
interface Seen { signature:string; since:number; working:boolean; stateKey?:string; stateSince?:number; tail?:string[] }

/** Screen content is owner-only, bounded to the latest 24 lines of 160 code points. */
export function screenTail(value:unknown):string[]{
  if(!Array.isArray(value))return [];
  return value.slice(-24).filter((line):line is string=>typeof line==='string').map(line=>Array.from(stripVTControlCharacters(line.slice(0,8192)).replace(/[\u0080-\u009f\u00ad\u034f\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,'').replace(/[\u0000-\u001f\u007f]/g,' ')).slice(0,160).join(''));
}

/** Only a small display projection leaves the server; raw tasks, paths and inbox fields do not. */
export class FleetNormalizer {
  private seen = new Map<string,Seen>();
  constructor(private stuckAfter=STUCK_AFTER_MS) {}
  parse(raw:unknown,now:number):FleetSnapshot {
    if(!obj(raw)||!Array.isArray(raw.teams)||!Array.isArray(raw.seats)||!Array.isArray(raw.needs)||!obj(raw.tasks))throw Error('Invalid fleet');
    if(raw.teams.length>64||raw.seats.length>256||raw.needs.length>256)throw Error('Fleet too large');
    const teams=raw.teams.map(t=>{if(!obj(t)||!text(t.rig,80))throw Error('Invalid team');return text(t.rig,80);});
    const needs:FleetNeed[]=raw.needs.map(n=>{
      if(!obj(n)||!text(n.id,100)||!text(n.rig,80))throw Error('Invalid need');
      return {id:text(n.id,100),rig:text(n.rig,80),seat:text(n.seat,120),summary:text(n.summary)};
    }).sort((a,b)=>a.id.localeCompare(b.id));
    const tasks=raw.tasks;
    const next=new Map<string,Seen>();
    const seats:FleetSeat[]=raw.seats.map((s):FleetSeat=>{
      if(!obj(s)||!text(s.session,120)||!text(s.rig,80)||typeof s.status!=='string')throw Error('Invalid seat');
      const session=text(s.session,120),rig=text(s.rig,80);
      if(next.has(session))throw Error('Duplicate seat');
      const activity=obj(s.activity)?s.activity:{};
      const line=text(activity.msg),signature=JSON.stringify([line,text(activity.state,40)]);
      const working=s.status==='running'&&((typeof s.work==='number'&&s.work>0)||!!tasks[session]||activity.state==='working');
      const previous=this.seen.get(session);
      const since=previous?.signature===signature&&previous.working&&working?previous.since:now;
      let state:FleetStatus=s.status!=='running'?'stopped':needs.some(n=>n.seat?n.seat===session:n.rig===rig)?'needs-you':working&&now-since>=this.stuckAfter?'stuck':working?'working':'idle';
      const explicit=obj(s.state)?s.state:undefined;
      let reason='';
      if(s.state!==undefined){
        const key=explicit?.key??s.state;
        const states:Record<string,FleetStatus>={working:'working',idle:'idle',you:'needs-you','needs-you':'needs-you',stuck:'stuck',waiting:'waiting',stopped:'stopped'};
        if(s.status==='running')state=typeof key==='string'&&Object.hasOwn(states,key)?states[key]:needs.some(n=>n.seat?n.seat===session:n.rig===rig)?'needs-you':'unknown';
        reason=text(explicit?.why,1000);
      }
      const stateKey=JSON.stringify([state,reason]);
      const stateSince=previous?.stateKey===stateKey?previous.stateSince??now:now;
      const currentTail=screenTail(s.tail),tail=state==='stopped'&&!currentTail.length?previous?.tail??[]:currentTail;
      next.set(session,{signature,since,working,stateKey,stateSince,tail});
      if(!teams.includes(rig))teams.push(rig);
      return {session,rig,name:text(s.member,60)||session,state,activity:line,tail,...(reason?{reason}:{}),...(['stuck','waiting'].includes(state)?{since:stateSince}:{})};
    });
    this.seen=next;
    return {status:'ready',teams:[...new Set(teams)],seats,needs};
  }
}
