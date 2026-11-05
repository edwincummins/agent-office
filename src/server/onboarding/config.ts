import {readFileSync} from 'node:fs';
import path from 'node:path';
export interface GoogleConfig {clientId:string; clientSecret:string; redirectUri:string}
export function googleConfig(dataDir:string, env=process.env): GoogleConfig | undefined {
  let stored: any = {};
  try { stored=JSON.parse(readFileSync(path.join(dataDir,'config.json'),'utf8')).google ?? {}; } catch {}
  const clientId=env.AGENT_OFFICE_GOOGLE_CLIENT_ID ?? stored.clientId;
  const clientSecret=env.AGENT_OFFICE_GOOGLE_CLIENT_SECRET ?? stored.clientSecret;
  const redirectUri=env.AGENT_OFFICE_GOOGLE_REDIRECT_URI ?? stored.redirectUri;
  if(!clientId || !clientSecret || !redirectUri) return;
  if([clientId,clientSecret,redirectUri].some(v=>typeof v!=='string'||v.length>4096)) return;
  try {
    const u=new URL(redirectUri);
    if(u.pathname!=='/auth/google/callback'||u.search||u.hash||u.username||u.password) return;
    if(u.protocol!=='https:' && !(u.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(u.hostname))) return;
    return {clientId,clientSecret,redirectUri};
  } catch { return; }
}
