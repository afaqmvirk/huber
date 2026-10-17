import assert from 'node:assert/strict';

const base = process.argv[2] || 'https://huber.afaq.mov';
if (!['huber.afaq.mov', 'huber-gamma.vercel.app', '127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Use the Huber demo or localhost.');
function browser() {
  let capsule;
  return async (path, token, method = 'GET', body) => {
    const response = await fetch(base + '/api/gateway', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capsule, requests: [{ path, ...(token ? { token } : {}), method, body }] }), signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, 'gateway must be public and healthy');
    const result = await response.json(); capsule = result.capsule;
    return result.results[0];
  };
}
const a = browser(), b = browser();
const token = (await a('/lab/session', null, 'POST', { userId: 'alex' })).body.token;
const other = (await b('/lab/session', null, 'POST', { userId: 'alex' })).body.token;
const quote = (await a('/api/quotes', token, 'POST', { pickupId: 'byward', destinationId: 'parliament', serviceId: 'pony' })).body.quote;
const booking = await a('/api/rides', token, 'POST', { quoteId: quote.id, fareCents: quote.fareCents });
assert.equal(booking.status, 201);
const ride = booking.body.ride;
assert.equal((await a(`/api/rides/${ride.id}/messages`, token, 'POST', { text: 'A very good day for a trot.' })).status, 201);
assert.equal((await a(`/api/rides/${ride.id}/advance`, token, 'POST', {})).body.ride.status, 'in_progress');
assert.equal((await a(`/api/rides/${ride.id}/advance`, token, 'POST', {})).body.ride.status, 'completed');
assert.equal((await a(`/api/rides/${ride.id}`, token)).body.ride.fareCents, quote.fareCents);
assert.equal((await a('/api/me', token)).body.user.walletCents, 4800 - quote.fareCents);
assert.equal((await a('/api/wallet/promo', token, 'POST', { code: 'HAYDAY' })).status, 200);
assert.equal((await a('/api/wallet/promo', token, 'POST', { code: 'HAYDAY' })).status, 409);
assert.equal((await b('/api/me', other)).body.user.walletCents, 4800);
assert.equal((await b(`/api/rides/${ride.id}`, other)).status, 404);
console.log(`PASS ${base}: booking, chat, pickup, completion, receipt, wallet, promo and visitor isolation.`);
