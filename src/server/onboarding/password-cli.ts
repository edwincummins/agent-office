import type {Accounts} from '../accounts.js';
/** Local process input only; never expose this recovery operation as an HTTP action. */
export async function recoverPassword(accounts:Accounts,args:string[],input:NodeJS.ReadableStream=process.stdin):Promise<number>{
  if(args.length!==1||!args[0]){console.error('Usage: agent-office accounts password <name>; supply the new password through stdin, never arguments.');return 2;}
  const a=accounts.byName(args[0]);if(!a){console.error('No such account.');return 1;}
  if((input as NodeJS.ReadStream).isTTY){console.error('Supply one password line through stdin from a secure prompt or password manager; do not put it in command arguments.');return 2;}
  try{
    const chunks:Buffer[]=[];let size=0;
    for await(const chunk of input){const b=Buffer.from(chunk);size+=b.length;if(size>4096)throw Error();chunks.push(b);}
    const password=Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/,'');
    if(/[\r\n]/.test(password)||!await accounts.setPassword(a.id,password))throw Error();
    console.log('Account password updated. Google sign-in remains linked.');return 0;
  }catch{console.error('Password was not changed. Supply one line of 8 to 512 characters.');return 1;}
}
