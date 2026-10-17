import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './support.mjs';

test('web UI and local assets serve; backend source and private paths do not', async t => {
  const f = await fixture(t);
  for (const path of ['/', '/styles.css', '/uber.css', '/app.js', '/map.js', '/illustrations.js', '/vendor/leaflet.js', '/fonts/DMSans_400Regular.ttf', '/demo']) {
    const response = await f.call(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  }
  for (const path of ['/backend/billing.ts', '/.git/config', '/.env', '/api/me']) assert.equal((await f.call(path)).status, 401);
  assert.equal((await f.call('/health', null, 'GET', undefined, { Origin: 'https://evil.example' })).status, 403);
});
test('each bootstrap lists only the current fake rider’s own trips', async t => {
  const f = await fixture(t), alex = await f.login('alex'), blair = await f.login('blair');
  const a = await f.call('/api/bootstrap', alex), b = await f.call('/api/bootstrap', blair);
  assert.equal(a.body.services.length, 3); assert.equal(a.body.horses.length, 3);
  assert.equal(a.body.user.id, 'alex'); assert.equal(b.body.user.id, 'blair');
  assert.ok(a.body.rides.every(r => r.userId === 'alex')); assert.ok(b.body.rides.every(r => r.userId === 'blair'));
  assert.equal((await f.call('/api/me', 'wrong-token')).status, 401);
});
test('quotes validate locations and services and cannot be reused or taken from another rider', async t => {
  const f = await fixture(t), alex = await f.login('alex'), blair = await f.login('blair');
  assert.equal((await f.call('/api/quotes', alex, 'POST', { pickupId: 'byward', destinationId: 'byward', serviceId: 'pony' })).status, 400);
  assert.equal((await f.call('/api/quotes', alex, 'POST', { pickupId: 'byward', destinationId: 'parliament', serviceId: 'spaceship' })).status, 400);
  const q = await f.quote(alex); assert.equal(q.fareCents, 869);
  assert.equal((await f.call('/api/rides', blair, 'POST', { quoteId: q.id, fareCents: q.fareCents })).status, 404);
  assert.equal((await f.call('/api/rides', alex, 'POST', { quoteId: q.id, fareCents: q.fareCents })).status, 201);
  assert.equal((await f.call('/api/rides', alex, 'POST', { quoteId: q.id, fareCents: q.fareCents })).status, 404);
});
test('a normal ride can be booked, messaged, completed and charged once in fake credits', async t => {
  const f = await fixture(t), token = await f.login('alex'), q = await f.quote(token);
  const booking = await f.call('/api/rides', token, 'POST', { quoteId: q.id, fareCents: q.fareCents });
  assert.equal(booking.status, 201); const ride = booking.body.ride;
  assert.equal(ride.status, 'arriving'); assert.equal(ride.fareCents, q.fareCents);
  const q2 = await f.quote(token);
  assert.equal((await f.call('/api/rides', token, 'POST', { quoteId: q2.id, fareCents: q2.fareCents })).status, 409);
  const chat = await f.call(`/api/rides/${ride.id}/messages`, token, 'POST', { text: 'I am by the entrance.' });
  assert.equal(chat.status, 201); assert.ok(chat.body.messages.some(m => m.text === 'I am by the entrance.'));
  assert.equal((await f.call(`/api/rides/${ride.id}/advance`, token, 'POST', {})).body.ride.status, 'in_progress');
  assert.equal((await f.call(`/api/rides/${ride.id}/advance`, token, 'POST', {})).body.ride.status, 'completed');
  assert.equal((await f.call('/api/me', token)).body.user.walletCents, 4800 - q.fareCents);
  assert.equal((await f.call(`/api/rides/${ride.id}/advance`, token, 'POST', {})).status, 409);
  assert.equal((await f.call('/api/me', token)).body.user.walletCents, 4800 - q.fareCents);
});
test('cancelling a ride releases the active slot and never charges the wallet', async t => {
  const f = await fixture(t), token = await f.login('alex'), q = await f.quote(token);
  const { body: { ride } } = await f.call('/api/rides', token, 'POST', { quoteId: q.id, fareCents: q.fareCents });
  assert.equal((await f.call(`/api/rides/${ride.id}/cancel`, token, 'POST', {})).body.ride.status, 'cancelled');
  assert.equal((await f.call('/api/bootstrap', token)).body.activeRide, null);
  assert.equal((await f.call('/api/me', token)).body.user.walletCents, 4800);
});
test('normal profile edits work; a seeded administrator can still inspect the ledger', async t => {
  const f = await fixture(t), rider = await f.login('alex'), admin = await f.login('stable');
  const response = await f.call('/api/me', rider, 'PATCH', { name: 'Alex the Rider', quietRide: true });
  assert.equal(response.status, 200); assert.equal(response.body.user.name, 'Alex the Rider'); assert.equal(response.body.user.quietRide, true);
  assert.equal((await f.call('/api/admin/ledger', rider)).status, 403);
  assert.equal((await f.call('/api/admin/ledger', admin)).status, 200);
});
test('a promotion succeeds once and a sequential retry is rejected', async t => {
  const f = await fixture(t), token = await f.login('alex');
  assert.equal((await f.call('/api/wallet/promo', token, 'POST', { code: 'HAYDAY' })).status, 200);
  assert.equal((await f.call('/api/wallet/promo', token, 'POST', { code: 'HAYDAY' })).status, 409);
  assert.equal((await f.call('/api/me', token)).body.user.walletCents, 5600);
});
