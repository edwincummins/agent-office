// Test-only dependency injection. No production config can change Google's issuer/endpoints.
import {createRemoteJWKSet} from 'jose';
import {verifyIdToken,type IdentityProvider} from '../../src/server/onboarding/oidc.js';
export async function testProvider(issuer:string):Promise<IdentityProvider>{
  const r=await fetch(`${issuer}/.well-known/openid-configuration`,{signal:AbortSignal.timeout(3000)}),d=await r.json() as any;
  if(d.issuer!==issuer)throw Error('Discovery issuer mismatch');
  for(const name of ['authorization_endpoint','token_endpoint','jwks_uri'])if(new URL(d[name]).origin!==new URL(issuer).origin)throw Error('Test endpoint must stay on the fake issuer');
  const jwks=createRemoteJWKSet(new URL(d.jwks_uri),{timeoutDuration:3000,cooldownDuration:1000,cacheMaxAge:60000});
  return {authorize:d.authorization_endpoint,async exchange(code,verifier,nonce,c){
    const r=await fetch(d.token_endpoint,{method:'POST',signal:AbortSignal.timeout(3000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,code_verifier:verifier,client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:c.redirectUri,grant_type:'authorization_code'})});
    if(!r.ok)throw Error('Exchange failed');const b=await r.json() as any;
    return verifyIdToken(b.id_token,{issuer,jwks,clientId:c.clientId,nonce});
  }};
}
