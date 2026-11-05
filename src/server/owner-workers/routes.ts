import type {Route} from '../http/router.js';
import {send} from '../http/util.js';
import {isOwner,OWNER_ONLY} from './access.js';
/** Gate before body reads or file creation. A session is still required by the router. */
export function ownerRoute(route:Route):Route{
 if(route.auth!=='session')throw Error('Owner routes must require a session');
 const handle:typeof route.handle=(ctx,r)=>{if(!isOwner(ctx,r.session.account?.id))return send(r.res,403,{error:OWNER_ONLY});return route.handle(ctx,r);}; return {...route,handle};
}

