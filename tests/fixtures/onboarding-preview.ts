// node --import tsx tests/fixtures/onboarding-preview.ts <empty-data-parent> <port> [fake-issuer-url]
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {loadConfig} from '../../src/server/config.js';
import {startServer} from '../../src/server/server.js';
import {routes} from '../../src/server/http/routes/index.js';
import {onboardingRoutes} from '../../src/server/onboarding/routes.js';
import {testProvider} from './onboarding-provider.js';
const [root,port='4638',issuer]=process.argv.slice(2);
if(!root || !path.isAbsolute(root) || ['4600','4610','4620','4632','4690'].includes(port))throw Error('Supply an absolute throwaway home and a test port');
mkdirSync(root,{recursive:true});
const cfg=loadConfig(['--home',root,'--port',port,'--no-open','--password','synthetic-shared-only']);
if(issuer){
  const f=path.join(cfg.dataDir,'config.json'),stored=existsSync(f)?JSON.parse(readFileSync(f,'utf8')):{};
  stored.google={clientId:'synthetic-client',clientSecret:'synthetic-secret',redirectUri:`http://127.0.0.1:${port}/auth/google/callback`};
  writeFileSync(f,JSON.stringify(stored,null,2));
}
const provider=issuer?await testProvider(issuer):undefined;
await startServer(cfg,{routes:[...onboardingRoutes(provider),...routes]});
console.log(`Synthetic sign-in preview http://127.0.0.1:${port}/login; first created account owns this throwaway office.`);
