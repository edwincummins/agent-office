import type {IncomingMessage} from 'node:http';
import type {Ctx} from '../office/context.js';
/** Direct loopback only. A reverse proxy or LAN visitor cannot claim a new office. */
export function localBootstrap(ctx:Ctx,req:IncomingMessage):boolean {
  let host='';try{const u=new URL(`http://${req.headers.host}`);host=u.hostname;if(Number(u.port||80)!==ctx.cfg.port)return false;}catch{return false;}
  return ['127.0.0.1','localhost','[::1]'].includes(host) && !ctx.cfg.trustProxy && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') &&
    ['127.0.0.1','localhost','::1'].includes(ctx.cfg.host) && !ctx.accounts.any && !ctx.accounts.ownerAccountId && !ctx.accounts.unreadableFile;
}
