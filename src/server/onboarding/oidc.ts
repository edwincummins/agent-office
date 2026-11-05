import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
import type {GoogleConfig} from './config.js';
export interface GoogleIdentity {issuer:string;subject:string;email:string;name:string}
export interface IdentityProvider {authorize:string; exchange(code:string,verifier:string,nonce:string,config:GoogleConfig):Promise<GoogleIdentity>}
const issuer='https://accounts.google.com';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{timeoutDuration:3000,cooldownDuration:30000,cacheMaxAge:600000});
export async function verifyIdToken(token:string,options:{issuer:string; jwks:JWTVerifyGetKey; clientId:string; nonce:string; now?:Date}):Promise<GoogleIdentity>{
  const {issuer,nonce,clientId,jwks:key,now}=options;
  if(token.length>16384)throw Error('Invalid identity');
  const {payload:p}=await jwtVerify(token,key,{issuer:issuer==='https://accounts.google.com'?[issuer,'accounts.google.com']:issuer,audience:clientId,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email','nonce'],clockTolerance:30,maxTokenAge:'10 minutes',currentDate:now});
  if(p.nonce!==nonce || p.email_verified!==true || typeof p.email!=='string' || !p.email.includes('@') || p.email.length>320 ||
    typeof p.sub!=='string'||!p.sub||p.sub.length>255 || (p.azp!==undefined && p.azp!==clientId) || (Array.isArray(p.aud)&&p.aud.length>1&&p.azp!==clientId))throw Error('Invalid identity');
  return {issuer,subject:p.sub,email:p.email,name:typeof p.name==='string'?p.name.slice(0,24):p.email.split('@')[0].slice(0,24)};
}
export const googleProvider:IdentityProvider={authorize:'https://accounts.google.com/o/oauth2/v2/auth',async exchange(code,verifier,nonce,c){
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:c.redirectUri,grant_type:'authorization_code',code_verifier:verifier})});
  if(!r.ok)throw Error('Google exchange failed');
  const text=await r.text(); if(text.length>32768)throw Error('Invalid response');
  const body=JSON.parse(text); if(typeof body.id_token!=='string')throw Error('Missing identity');
  return verifyIdToken(body.id_token,{issuer,jwks:keys,nonce,clientId:c.clientId});
}};
