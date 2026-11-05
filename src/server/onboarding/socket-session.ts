import type {Duplex} from 'node:stream';
/** Relayed sockets have no office Client record, so expire their original session separately. */
export function watchSession(socket:Duplex,valid:()=>boolean){
 const timer=setInterval(()=>{if(!valid())socket.destroy();},1000);timer.unref();
 socket.once('close',()=>clearInterval(timer));
}
