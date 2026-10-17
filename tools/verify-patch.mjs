import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const original=fileURLToPath(new URL('../',import.meta.url));
const candidate=realpathSync(process.argv[2]||original);
let hashes;
try{hashes=JSON.parse(readFileSync(join(original,'.runtime/original-test-hashes.json'),'utf8'));}catch{console.error('Run npm run lab:pack in the original checkout first to freeze the independent tests.');process.exit(1);}
for(const [file,hash]of Object.entries(hashes)){
  let actual;try{actual=createHash('sha256').update(readFileSync(join(candidate,file))).digest('hex');}catch{console.error(`Missing independent test: ${file}`);process.exit(1);}
  if(actual!==hash){console.error(`Independent test changed: ${file}. Restore the original test before reviewing this patch.`);process.exit(1);}
}
console.log('Original test integrity: PASS');
let ok=true;
for(const file of ['tests/functional.test.mjs','tests/security.test.mjs']){const r=spawnSync(process.execPath,['--test',file],{cwd:candidate,stdio:'inherit'});if(r.status!==0)ok=false;}
process.exit(ok?0:1);
