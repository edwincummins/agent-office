import type http from 'node:http';
import type {Ctx} from '../office/context.js';
import {isOwner} from './access.js';
export function hookRequest(req:http.IncomingMessage){
 const port=req.socket.localPort;
 return !req.headers.origin&&!!port&&['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host??'')&&['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'');
}
export function ownerHook(ctx:Ctx,worker:string,token:string){
 const floor=ctx.workerFloor(worker);
 return !!floor&&isOwner(ctx,floor.workers.ownerOf(worker))&&!!floor.workers.authenticate(worker,token);
}
