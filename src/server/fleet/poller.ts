import type { FleetSnapshot } from '../../shared/protocol/fleet.js';
import { FleetNormalizer } from './normalize.js';

export class FleetPoller {
  state:FleetSnapshot={status:'stale',teams:[],seats:[],needs:[]};
  private key=JSON.stringify(this.state);
  private busy=false;
  private stopped=false;
  private abort=new AbortController();
  private timer:ReturnType<typeof setInterval>|undefined;
  constructor(private run:(signal:AbortSignal)=>Promise<unknown>,private changed:(state:FleetSnapshot)=>void,private normalize=new FleetNormalizer()) {}
  start(){this.timer=setInterval(()=>void this.poll(),5000);this.timer.unref();void this.poll();}
  async poll(now=Date.now()) {
    if(this.busy||this.stopped)return;
    this.busy=true;
    let state:FleetSnapshot;
    try{state=this.normalize.parse(await this.run(this.abort.signal),now);}catch{state={...this.state,status:'stale'};}
    this.busy=false;
    if(this.stopped)return;
    const key=JSON.stringify(state);
    if(key!==this.key){this.key=key;this.state=state;this.changed(state);}
  }
  stop(){this.stopped=true;if(this.timer)clearInterval(this.timer);this.abort.abort();}
}
