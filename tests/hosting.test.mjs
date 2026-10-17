import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import gateway from '../api/gateway.ts';

process.env.HUBER_STATE_KEY = randomBytes(32).toString('hex');

async function hosted(t) {
  const server = createServer(gateway);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(input, headers = {}) {
    const response = await fetch(base + '/api/gateway', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input) });
    return { status: response.status, body: await response.json() };
  }
  function browser() {
    let capsule;
    async function batch(requests) {
      const response = await call({ capsule, requests });
      assert.equal(response.status, 200);
      capsule = response.body.capsule;
      return response.body.results;
    }
    const request = async (path, token, method = 'GET', body) => (await batch([{ path, ...(token ? { token } : {}), method, body }]))[0];
    return { batch, request, capsule: () => capsule };
  }
  return { call, browser };
}

test('hosted state survives fresh handlers and keeps browser worlds independent', async t => {
  const f = await hosted(t), a = f.browser(), b = f.browser();
  const token = (await a.request('/lab/session', null, 'POST', { userId: 'alex' })).body.token;
  const other = (await b.request('/lab/session', null, 'POST', { userId: 'alex' })).body.token;
  const quote = (await a.request('/api/quotes', token, 'POST', { pickupId: 'byward', destinationId: 'parliament', serviceId: 'pony' })).body.quote;
  const ride = (await a.request('/api/rides', token, 'POST', { quoteId: quote.id, fareCents: quote.fareCents })).body.ride;
  assert.equal((await a.request(`/api/rides/${ride.id}/messages`, token, 'POST', { text: 'Hello horse.' })).status, 201);
  await a.request(`/api/rides/${ride.id}/advance`, token, 'POST', {});
  await a.request(`/api/rides/${ride.id}/advance`, token, 'POST', {});
  assert.equal((await a.request('/api/me', token)).body.user.walletCents, 4800 - quote.fareCents);
  assert.equal((await b.request('/api/me', other)).body.user.walletCents, 4800);
  assert.equal((await b.request(`/api/rides/${ride.id}`, other)).status, 404);
  assert.equal((await b.request('/api/me', token)).status, 401);
  const tampered = a.capsule().slice(0, 30) + (a.capsule()[30] === 'A' ? 'B' : 'A') + a.capsule().slice(31);
  assert.equal((await f.call({ capsule: tampered, requests: [{ path: '/lab/session', method: 'POST' }] })).status, 401);
});

test('the hosted adapter preserves all four intentional synthetic lab flaws', async t => {
  const f = await hosted(t), a = f.browser();
  const alex = (await a.request('/lab/session', null, 'POST', { userId: 'alex' })).body.token;
  const blair = (await a.request('/lab/session', null, 'POST', { userId: 'blair' })).body.token;
  assert.equal((await a.request('/api/rides/ride_alex_001', blair)).status, 200);
  const quote = (await a.request('/api/quotes', alex, 'POST', { pickupId: 'byward', destinationId: 'parliament', serviceId: 'pony' })).body.quote;
  assert.equal((await a.request('/api/rides', alex, 'POST', { quoteId: quote.id, fareCents: 1 })).body.ride.fareCents, 1);
  await a.request('/api/me', blair, 'PATCH', { role: 'stable_admin' });
  assert.equal((await a.request('/api/admin/ledger', blair)).status, 200);
  const promotions = await a.batch(Array.from({ length: 20 }, () => ({ path: '/api/wallet/promo', method: 'POST', token: alex, body: { code: 'HAYDAY' } })));
  assert.equal(promotions.filter(p => p.status === 200).length, 20);
  assert.equal((await a.request('/api/me', alex)).body.user.walletCents, 20800);
});

test('gateway rejects cross-origin clients, source paths and oversized batches', async t => {
  const f = await hosted(t);
  assert.equal((await f.call({ requests: [{ path: '/lab/session', method: 'POST' }] }, { Origin: 'https://elsewhere.example' })).status, 403);
  assert.equal((await f.call({ requests: [{ path: '/backend/server.ts' }] })).status, 400);
  assert.equal((await f.call({ requests: Array.from({ length: 21 }, () => ({ path: '/api/me' })) })).status, 400);
});
