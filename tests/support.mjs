import { createHuberServer } from '../backend/server.ts';
export async function fixture(t) {
  const { server, store } = createHuberServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  if (t) t.after(close);
  async function call(path, token, method = 'GET', body, headers = {}) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
    const contentType = response.headers.get('Content-Type');
    return { status: response.status, body: contentType?.includes('json') ? await response.json() : await response.text(), headers: response.headers };
  }
  const login = async userId => (await call('/lab/session', null, 'POST', { userId })).body.token;
  const quote = async token => (await call('/api/quotes', token, 'POST', { pickupId: 'byward', destinationId: 'parliament', serviceId: 'pony' })).body.quote;
  return { base, store, call, login, quote, close };
}
