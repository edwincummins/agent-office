import {accountsCommand} from '../../src/server/accounts.js';
process.exit(await accountsCommand(process.argv.slice(2)));
