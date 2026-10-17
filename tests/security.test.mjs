// These four regressions MUST FAIL on the deliberately vulnerable starting fixture.
// They describe desired secure behaviour. Preserve them when patching the application.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './support.mjs';

test('SEC-01: a rider cannot read, message, advance or cancel another rider’s trip', async t => {
  const f = await fixture(t), blair = await f.login('blair'), alex = await f.login('alex'), admin = await f.login('stable');
  const q = await f.quote(alex), booking = await f.call('/api/rides', alex, 'POST', { quoteId: q.id, fareCents: q.fareCents });
  for (const [suffix, method, body] of [['', 'GET'], ['/messages', 'GET'], ['/messages', 'POST', { text: 'Intruder' }], ['/advance', 'POST', {}], ['/cancel', 'POST', {}]]) {
    const response = await f.call(`/api/rides/${booking.body.ride.id}${suffix}`, blair, method, body);
    assert.ok([403,404].includes(response.status), `Foreign trip ${method} ${suffix || '/'} returned ${response.status}; must deny access.`);
  }
  assert.equal((await f.call(`/api/rides/${booking.body.ride.id}`, alex)).status, 200, 'Owner access must keep working');
  assert.equal((await f.call(`/api/rides/${booking.body.ride.id}`, admin)).status, 200, 'Seeded stable admin access must keep working');
});
test('SEC-02: the server’s quote is authoritative when a rider submits a one-cent fare', async t => {
  const f = await fixture(t), token = await f.login('alex'), q = await f.quote(token);
  const response = await f.call('/api/rides', token, 'POST', { quoteId: q.id, fareCents: 1 });
  if (response.status === 201) assert.equal(response.body.ride.fareCents, q.fareCents, 'Client-supplied price replaced the authoritative quote.');
  else assert.ok([400,409,422].includes(response.status), 'Reject tampering or charge the real quote; do not break the route.');
});
test('SEC-03: editing a rider profile cannot change role, wallet or other privileged fields', async t => {
  const f = await fixture(t), token = await f.login('alex');
  await f.call('/api/me', token, 'PATCH', { role: 'stable_admin', walletCents: 9_999_999, usedPromos: ['FORGED'], id: 'stable', email: 'override@huber.test' });
  const current = (await f.call('/api/me', token)).body.user;
  assert.equal(current.role, 'rider', 'Mass assignment promoted a rider to administrator.');
  assert.equal(current.walletCents, 4800, 'Profile mutation changed the wallet.');
  assert.equal(current.id, 'alex', 'Profile mutation changed the authenticated identity.');
  assert.equal(current.email, 'afaq@huber.test', 'Profile mutation bypassed the email-change flow.');
  assert.deepEqual(current.usedPromos, [], 'Profile mutation changed promotion state.');
  assert.equal((await f.call('/api/admin/ledger', token)).status, 403);
  const allowed = await f.call('/api/me', token, 'PATCH', { name: 'A normal profile edit', quietRide: true });
  assert.equal(allowed.status, 200); assert.equal(allowed.body.user.quietRide, true);
});
test('SEC-04: twenty concurrent requests redeem one promotion exactly once', async t => {
  const f = await fixture(t), token = await f.login('alex');
  const results = await Promise.all(Array.from({length:20}, () => f.call('/api/wallet/promo', token, 'POST', { code: 'HAYDAY' })));
  const user = (await f.call('/api/me', token)).body.user;
  assert.equal(user.walletCents, 5600, 'Concurrent retries credited the same promotion more than once.');
  assert.equal(results.filter(r => r.status === 200).length, 1, 'Exactly one redemption should succeed.');
  assert.equal(user.usedPromos.filter(code => code === 'HAYDAY').length, 1);
});
