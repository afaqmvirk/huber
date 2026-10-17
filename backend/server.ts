import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { PLACES, SERVICES, HORSES, calculateFare, placeById, routeEstimate, serviceById } from '../shared/catalog.ts';
import type { Quote, Ride, RideStatus, User } from '../shared/types.ts';
import { createStore, event, id, type Store } from './store.ts';
import { canAccessRide, profileChanges } from './access.ts';
import { checkoutFare, redeemPromotion } from './billing.ts';

export class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
const PUBLIC = new URL('../public/', import.meta.url);
const staticFiles: Record<string, string> = { '/': 'index.html', '/index.html': 'index.html', '/styles.css': 'styles.css', '/uber.css': 'uber.css', '/app.js': 'app.js', '/transport.js': 'transport.js', '/illustrations.js': 'illustrations.js', '/map.js': 'map.js', '/favicon.svg': 'favicon.svg', '/demo': 'demo.html', '/demo.js': 'demo.js', '/vendor/leaflet.js': 'vendor/leaflet.js', '/vendor/leaflet.css': 'vendor/leaflet.css' };
Object.assign(staticFiles, { '/map.css': 'map.css', '/vendor/maplibre-gl.mjs': 'vendor/maplibre-gl.mjs', '/vendor/maplibre-gl-shared.mjs': 'vendor/maplibre-gl-shared.mjs', '/vendor/maplibre-gl-worker.mjs': 'vendor/maplibre-gl-worker.mjs', '/vendor/maplibre-gl.css': 'vendor/maplibre-gl.css', '/vendor/horse-layer.js': 'vendor/horse-layer.js', '/models/huber-horse.glb': 'models/huber-horse.glb' });
async function staticResponse(path: string, res: ServerResponse) {
  const name = staticFiles[path] || (/^\/fonts\/DMSans_(400Regular|500Medium|600SemiBold|700Bold|800ExtraBold)\.ttf$/.test(path) ? path.slice(1) : null);
  if (!name) return false;
  const bytes = await readFile(new URL(name, PUBLIC));
  const mime = name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : /\.m?js$/.test(name) ? 'text/javascript' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.glb') ? 'model/gltf-binary' : 'font/ttf';
  res.writeHead(200, { 'Content-Type': mime + (mime.startsWith('text/') ? '; charset=utf-8' : ''), 'Content-Length': bytes.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org https://tiles.openfreemap.org; font-src 'self'; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
  res.end(bytes);
  return true;
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = '';
  for await (const part of req) {
    text += part.toString();
    if (Buffer.byteLength(text) > 16384) throw new ApiError(413, 'Request is too large.');
  }
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw new ApiError(400, 'Send a JSON object.'); }
}
function text(value: unknown, name: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ApiError(400, `Enter a valid ${name}.`);
  return value.trim();
}
function auth(req: IncomingMessage, store: Store): User {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  const uid = token ? store.sessions.get(token) : undefined;
  const user = uid ? store.users.get(uid) : undefined;
  if (!user) throw new ApiError(401, 'Start a demo session first.');
  return user;
}
function rideFor(id: string, user: User, store: Store): Ride {
  const ride = store.rides.get(id);
  if (!ride) throw new ApiError(404, 'Ride not found.');
  if (!canAccessRide(user, ride)) throw new ApiError(403, 'This ride belongs to another rider.');
  return ride;
}

export function createHuberHandler(options: { store?: Store; allowLan?: boolean; hostedAssets?: boolean } = {}) {
  const store = options.store || createStore();
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    const local = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const lan = options.allowLan && origin && /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin);
    if (origin && !local && !lan) return send(res, 403, { error: 'This synthetic lab accepts local clients only.' });
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    const method = req.method;
    try {
      if (path === '/hosted-config.json' && method === 'GET') return send(res, 200, { gateway: Boolean(options.hostedAssets) });
      if (method === 'GET' && await staticResponse(path, res)) return;
      if (path === '/health' && method === 'GET') return send(res, 200, { ok: true, app: 'huber', syntheticData: true, securityLab: 'intentionally-vulnerable' });
      if (path === '/lab/session' && method === 'POST') {
        const data = await body(req);
        const userId = data.userId === undefined ? 'alex' : text(data.userId, 'demo rider');
        if (!['alex', 'blair', 'stable'].includes(userId)) throw new ApiError(400, 'Choose a seeded demo identity.');
        const token = randomBytes(24).toString('hex');
        store.sessions.set(token, userId);
        return send(res, 201, { token, user: store.users.get(userId), notice: 'Synthetic identity selector for local testing. Not production authentication.' });
      }
      const user = auth(req, store);
      if (path === '/api/bootstrap' && method === 'GET') {
        const rides = [...store.rides.values()].filter(r => r.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return send(res, 200, { user, places: PLACES, services: SERVICES, horses: HORSES, rides,
          activeRide: rides.find(r => r.status === 'arriving' || r.status === 'in_progress') || null });
      }
      if (path === '/api/me' && method === 'GET') return send(res, 200, { user });
      if (path === '/api/me' && method === 'PATCH') {
        const data = await body(req);
        if ('name' in data) data.name = text(data.name, 'name', 60);
        if ('quietRide' in data && typeof data.quietRide !== 'boolean') throw new ApiError(400, 'quietRide must be true or false.');
        Object.assign(user, profileChanges(data));
        event(store, 'profile.updated', `Profile updated for ${user.id}`);
        return send(res, 200, { user });
      }
      if (path === '/api/quotes' && method === 'POST') {
        const data = await body(req);
        const pickupId = text(data.pickupId, 'pickup'), destinationId = text(data.destinationId, 'destination');
        const serviceId = text(data.serviceId, 'service');
        if (!serviceById(serviceId)) throw new ApiError(400, 'Choose an available ride.');
        let route;
        try { route = routeEstimate(pickupId, destinationId); } catch (e) { throw new ApiError(400, (e as Error).message); }
        const quote: Quote = { id: id('quote'), userId: user.id, pickupId, destinationId,
          serviceId: serviceById(serviceId)!.id, ...route, fareCents: calculateFare(serviceId, route.distanceKm),
          bookingFeeCents: 99, expiresAt: Date.now() + 5 * 60_000 };
        store.quotes.set(quote.id, quote);
        return send(res, 201, { quote });
      }
      if (path === '/api/rides' && method === 'GET') return send(res, 200, { rides: [...store.rides.values()].filter(r => r.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
      if (path === '/api/rides' && method === 'POST') {
        const data = await body(req);
        const quote = store.quotes.get(text(data.quoteId, 'quote'));
        if (!quote || quote.userId !== user.id) throw new ApiError(404, 'Quote not found.');
        if (quote.expiresAt < Date.now()) throw new ApiError(409, 'This quote has expired. Request a fresh one.');
        const active = [...store.rides.values()].find(r => r.userId === user.id && ['arriving', 'in_progress'].includes(r.status));
        if (active) throw new ApiError(409, 'Your horse is already on the way.');
        const horse = HORSES.find(h => h.service === quote.serviceId)!;
        const ride: Ride = { id: id('ride'), userId: user.id, quoteId: quote.id, pickupId: quote.pickupId, destinationId: quote.destinationId,
          serviceId: quote.serviceId, horseId: horse.id, fareCents: checkoutFare(quote, data.fareCents), bookingFeeCents: quote.bookingFeeCents,
          distanceKm: quote.distanceKm, durationMinutes: quote.durationMinutes, status: 'arriving', createdAt: new Date().toISOString(), payment: 'OatPay' };
        store.rides.set(ride.id, ride);
        store.quotes.delete(quote.id);
        store.messages.set(ride.id, [{ id: id('msg'), from: 'driver', text: `We’re on our way! ${horse.name} has requested a window seat. Somehow.`, at: new Date().toISOString() }]);
        event(store, 'ride.created', `${ride.id} · ${user.id} · ${ride.fareCents} cents`);
        return send(res, 201, { ride });
      }
      const rideMatch = path.match(/^\/api\/rides\/([^/]+)(?:\/(advance|cancel|messages))?$/);
      if (rideMatch) {
        const ride = rideFor(rideMatch[1], user, store), action = rideMatch[2];
        if (!action && method === 'GET') return send(res, 200, { ride, rider: { name: store.users.get(ride.userId)?.name, email: store.users.get(ride.userId)?.email }, pickup: placeById(ride.pickupId), destination: placeById(ride.destinationId), horse: HORSES.find(h => h.id === ride.horseId) });
        if (action === 'advance' && method === 'POST') {
          await body(req);
          const next: Partial<Record<RideStatus, RideStatus>> = { arriving: 'in_progress', in_progress: 'completed' };
          const status = next[ride.status];
          if (!status) throw new ApiError(409, 'This ride has already ended.');
          ride.status = status;
          if (status === 'completed') {
            const owner = store.users.get(ride.userId);
            if (owner) owner.walletCents -= ride.fareCents;
          }
          event(store, 'ride.status', `${ride.id} → ${status}`);
          return send(res, 200, { ride });
        }
        if (action === 'cancel' && method === 'POST') {
          await body(req);
          if (ride.status !== 'arriving') throw new ApiError(409, 'Only a ride awaiting pickup can be cancelled.');
          ride.status = 'cancelled';
          return send(res, 200, { ride });
        }
        if (action === 'messages' && method === 'GET') return send(res, 200, { messages: store.messages.get(ride.id) || [] });
        if (action === 'messages' && method === 'POST') {
          const data = await body(req), message = text(data.text, 'message', 400);
          const messages = store.messages.get(ride.id) || [];
          messages.push({ id: id('msg'), from: 'rider', text: message, at: new Date().toISOString() });
          messages.push({ id: id('msg'), from: 'driver', text: 'Got it. We’ll meet you at the pickup. Please bring your best neigh.', at: new Date().toISOString() });
          store.messages.set(ride.id, messages);
          return send(res, 201, { messages });
        }
      }
      if (path === '/api/wallet/promo' && method === 'POST') {
        const data = await body(req), code = text(data.code, 'promo code', 30).toUpperCase();
        const result = await redeemPromotion(user, code);
        event(store, 'wallet.promo', `${user.id} redeemed ${code}`);
        return send(res, 200, { ...result, user });
      }
      if (path === '/api/admin/ledger' && method === 'GET') {
        if (user.role !== 'stable_admin') throw new ApiError(403, 'Stable administrator access required.');
        return send(res, 200, { riders: [...store.users.values()].map(u => ({ id: u.id, name: u.name, email: u.email, walletCents: u.walletCents })), events: store.events });
      }
      throw new ApiError(404, 'That trail goes nowhere.');
    } catch (e) {
      const error = e as Error & { status?: number };
      if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : 'The stable hit a snag. Try again.' });
    }
  };
  return { handler, store };
}

export function createHuberServer(options: { store?: Store; allowLan?: boolean } = {}) {
  const { handler, store } = createHuberHandler(options);
  return { server: createServer(handler), store };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const allowLan = process.env.HUBER_ALLOW_LAN === '1';
  const { server } = createHuberServer({ allowLan });
  const host = allowLan ? '0.0.0.0' : '127.0.0.1', port = Number(process.env.PORT || 8787);
  server.listen(port, host, () => {
    console.log(`HUBER http://${host}:${port}`);
    console.log('SYNTHETIC DATA · INTENTIONALLY VULNERABLE SECURITY LAB · NO REAL PAYMENTS');
  });
}
