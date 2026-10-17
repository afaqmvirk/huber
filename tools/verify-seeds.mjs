import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
const root = fileURLToPath(new URL('../', import.meta.url));
const run = file => spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { cwd: root, encoding: 'utf8' });
const functional = run('tests/functional.test.mjs');
if (functional.status !== 0) { process.stdout.write(functional.stdout + functional.stderr); process.exit(1); }
const security = run('tests/security.test.mjs');
const failing = Number(security.stdout.match(/# fail (\d+)/)?.[1] ?? -1);
const passing = Number(security.stdout.match(/# pass (\d+)/)?.[1] ?? -1);
mkdirSync(new URL('../artifacts/',import.meta.url), { recursive:true });
writeFileSync(new URL('../artifacts/verification.json',import.meta.url), JSON.stringify({ at:new Date().toISOString(), functionalPassed:true, securityChecks:4, securityPassing:passing, securityFailing:failing, state:failing===4?'vulnerable-baseline':failing===0?'patched':'partial' },null,2));
console.log('Functional checks: PASS (7/7)');
console.log(`Security regressions: ${passing}/4 pass, ${failing}/4 fail.`);
if(failing===4 && passing===0) console.log('Fixture verified: all four intended vulnerabilities are reproducible. No security patch has been applied.');
else if(failing===0 && passing===4) console.log('Patched behaviour verified: all four security regressions pass.');
else {process.stdout.write(security.stdout + security.stderr);process.exit(1);}
