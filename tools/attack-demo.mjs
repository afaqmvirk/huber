import { fixture } from '../tests/support.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const results=[];
async function scenario(id, name, action) {
  const f=await fixture();
  try {results.push({id,name,...await action(f)});} finally {await f.close();}
}
await scenario('SEC-01','Another rider’s private receipt',async f=>{
  const token=await f.login('blair'), result=await f.call('/api/rides/ride_alex_001',token);
  return {vulnerable:result.status===200,observed:`Blair requested Alex’s receipt: HTTP ${result.status}`,expected:'403 or 404'};
});
await scenario('SEC-02','A one-cent horse ride',async f=>{
  const token=await f.login('alex'),q=await f.quote(token),r=await f.call('/api/rides',token,'POST',{quoteId:q.id,fareCents:1});
  return {vulnerable:r.status===201&&r.body.ride.fareCents!==q.fareCents,observed:`Quote ${q.fareCents} cents; booked ${r.body.ride?.fareCents??'rejected'}`,expected:`Charge ${q.fareCents} cents or reject tampering`};
});
await scenario('SEC-03','Rider becomes stable administrator',async f=>{
  const token=await f.login('alex');await f.call('/api/me',token,'PATCH',{role:'stable_admin'});
  const r=await f.call('/api/admin/ledger',token);
  return {vulnerable:r.status===200,observed:`Rider changed profile.role; admin ledger returned HTTP ${r.status}`,expected:'Role unchanged; ledger returns 403'};
});
await scenario('SEC-04','The infinite hay-money glitch',async f=>{
  const token=await f.login('alex'),r=await Promise.all(Array.from({length:20},()=>f.call('/api/wallet/promo',token,'POST',{code:'HAYDAY'})));
  const u=(await f.call('/api/me',token)).body.user,credit=u.walletCents-4800;
  return {vulnerable:credit!==800,observed:`${r.filter(x=>x.status===200).length} accepted; ${credit} cents credited`,expected:'One accepted; 800 cents credited'};
});
mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});
writeFileSync(new URL('../artifacts/attack-report.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),scope:'Disposable, in-process Huber fixtures only',results},null,2));
console.log('\nHUBER / SYNTHETIC SECURITY DEMO\n');
for(const r of results) console.log(`${r.id} ${r.vulnerable?'VULNERABLE':'PROTECTED'} — ${r.name}\n  ${r.observed}\n  Expected: ${r.expected}\n`);
console.log('No requests were sent to the running preview or to any external service.');
