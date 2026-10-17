import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
const entries=[];
function collect(relative){for(const item of readdirSync(join(root,relative),{withFileTypes:true})){const path=relative+'/'+item.name;if(item.isDirectory())collect(path);else if(item.isFile())entries.push([path.replaceAll('\\','/'),readFileSync(join(root,path))]);}}
for(const directory of ['api','backend','shared','public','tests','tools','frontend'])collect(directory);
for(const name of ['package.json','package-lock.json','tsconfig.json','README.md','LICENSE','.gitignore','vercel.json','.vercelignore'])entries.push([name,readFileSync(join(root,name))]);
const task=readFileSync(join(root,'public/demo.html'),'utf8').match(/<textarea id="grok-task"[^>]*>([\s\S]*?)<\/textarea>/)[1];
entries.push(['GROK-TASK.txt',Buffer.from(task)]);
const local=[],central=[];let offset=0;
for(const [path,data] of entries){
  const name=Buffer.from(path),checksum=crc(data),h=Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(0x21,12);h.writeUInt32LE(checksum,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);
  local.push(h,name,data);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(0x21,14);c.writeUInt32LE(checksum,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=h.length+name.length+data.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
mkdirSync(join(root,'artifacts'),{recursive:true});mkdirSync(join(root,'.runtime'),{recursive:true});
const zip=Buffer.concat([...local,directory,end]);writeFileSync(join(root,'artifacts/huber-agent-packet.zip'),zip);writeFileSync(join(root,'artifacts/GROK-TASK.txt'),task);
const frozen={};for(const name of ['tests/functional.test.mjs','tests/security.test.mjs','tests/support.mjs'])frozen[name]=createHash('sha256').update(readFileSync(join(root,name))).digest('hex');
writeFileSync(join(root,'.runtime/original-test-hashes.json'),JSON.stringify(frozen,null,2));
console.log(`Created artifacts/huber-agent-packet.zip (${entries.length} files, ${zip.length} bytes).`);
console.log('Prepared artifacts/GROK-TASK.txt. Original test hashes are frozen in .runtime, outside the packet.');
