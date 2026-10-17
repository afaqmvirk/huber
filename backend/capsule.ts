import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { createStore, type Store } from './store.ts';

const lifetime = 6 * 60 * 60_000;
type Snapshot = { version: 1; expiresAt: number; entries: Record<string, unknown> };
function key(): Buffer {
  const value = process.env.HUBER_STATE_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new Error('HUBER_STATE_KEY must contain 32 random bytes encoded as hex.');
  return Buffer.from(value, 'hex');
}
export function openCapsule(capsule?: string): Store {
  if (!capsule) return createStore();
  try {
    if (capsule.length > 350_000) throw new Error();
    const bytes = Buffer.from(capsule, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from('huber-demo-v1'));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const compressed = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    const snapshot: Snapshot = JSON.parse(inflateSync(compressed, { maxOutputLength: 262144 }).toString());
    if (snapshot.version !== 1 || snapshot.expiresAt < Date.now()) throw new Error();
    const store = createStore();
    for (const name of ['users', 'sessions', 'quotes', 'rides', 'messages'] as const) {
      if (!Array.isArray(snapshot.entries[name])) throw new Error();
      (store[name] as Map<string, unknown>) = new Map(snapshot.entries[name] as [string, unknown][]);
    }
    if (!Array.isArray(snapshot.entries.events)) throw new Error();
    store.events = snapshot.entries.events as Store['events'];
    const rider = store.users.get('alex');
    if (rider?.name === 'Alex Morgan') rider.name = 'Afaq Virk';
    if (rider?.email === 'alex@huber.test') rider.email = 'afaq@huber.test';
    return store;
  } catch { throw Object.assign(new Error('Your session expired. Refresh to start again.'), { status: 401 }); }
}
export function sealCapsule(store: Store): string {
  // Bound synthetic history so the browser-carried fixture stays small.
  store.sessions = new Map([...store.sessions].slice(-6));
  store.quotes = new Map([...store.quotes].filter(([, q]) => q.expiresAt > Date.now()).slice(-24));
  store.rides = new Map([...store.rides].slice(-32));
  store.messages = new Map([...store.messages].filter(([ride]) => store.rides.has(ride)).slice(-12).map(([ride, messages]) => [ride, messages.slice(-32)]));
  const entries = Object.fromEntries(Object.entries(store).map(([name, value]) => [name, value instanceof Map ? [...value] : value]));
  const plaintext = Buffer.from(JSON.stringify({ version: 1, expiresAt: Date.now() + lifetime, entries } satisfies Snapshot));
  if (plaintext.length > 262144) throw Object.assign(new Error('Your session is full. Close this tab and start again.'), { status: 413 });
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from('huber-demo-v1'));
  const encrypted = Buffer.concat([cipher.update(deflateSync(plaintext)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
