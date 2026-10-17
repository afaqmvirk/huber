import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
const addresses=Object.values(networkInterfaces()).flat().filter(n=>n&&n.family==='IPv4'&&!n.internal&&/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address));
console.log('Huber LAN mode: synthetic, intentionally vulnerable lab. Use a trusted private network.');
for(const address of addresses) console.log(`Phone browser: http://${address.address}:8787`);
const child=spawn(process.execPath,['backend/server.ts'],{cwd:new URL('../',import.meta.url),env:{...process.env,HUBER_ALLOW_LAN:'1'},stdio:'inherit'});
process.on('SIGINT',()=>child.kill('SIGINT'));child.on('exit',code=>process.exit(code??0));
