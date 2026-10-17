import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { createHuberHandler } from '../backend/server.ts';
import { openCapsule, sealCapsule } from '../backend/capsule.ts';

type DemoRequest = { path: string; method?: string; token?: string; body?: Record<string, unknown> };
const allowedPath = /^\/(lab\/session|api\/(bootstrap|me|quotes|rides(?:\/[^/?]{1,80}(?:\/(?:advance|cancel|messages))?)?|wallet\/promo|admin\/ledger))$/;

export default async function gateway(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const reply = (status: number, body: unknown) => { res.writeHead(status); res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') return reply(405, { error: 'Send a demo request with POST.' });
  const origin = req.headers.origin;
  if (origin && origin !== `https://${req.headers.host}` && origin !== `http://${req.headers.host}`) return reply(403, { error: 'Use this demo from its own website.' });
  try {
    let input = req.body;
    if (input === undefined) {
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk); length += bytes.length;
        if (length > 524288) throw Object.assign(new Error('Request is too large.'), { status: 413 });
        chunks.push(bytes);
      }
      input = Buffer.concat(chunks).toString();
    }
    if (typeof input === 'string') {
      try { input = JSON.parse(input); }
      catch { throw Object.assign(new Error('Send valid JSON.'), { status: 400 }); }
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Send a JSON object.'), { status: 400 });
    const { capsule, requests } = input as { capsule?: string; requests?: DemoRequest[] };
    if ((capsule !== undefined && typeof capsule !== 'string') || !Array.isArray(requests) || requests.length < 1 || requests.length > 20) throw Object.assign(new Error('Send between one and twenty demo requests.'), { status: 400 });
    for (const request of requests) {
      if (!request || typeof request.path !== 'string' || !allowedPath.test(request.path) || !['GET', 'POST', 'PATCH'].includes(request.method || 'GET') || (request.token !== undefined && typeof request.token !== 'string') || JSON.stringify(request.body || {}).length > 16384) throw Object.assign(new Error('Invalid demo request.'), { status: 400 });
    }
    // A fresh, request-local world runs the same Node routes as the local lab.
    // A batch intentionally overlaps requests so the promo race remains demonstrable.
    const { handler, store } = createHuberHandler({ store: openCapsule(capsule) });
    const results = await Promise.all(requests.map(async request => {
      const incoming = Readable.from(request.body === undefined ? [] : [Buffer.from(JSON.stringify(request.body))]) as IncomingMessage;
      incoming.url = request.path; incoming.method = request.method || 'GET';
      incoming.headers = request.token ? { authorization: `Bearer ${request.token}` } : {};
      let status = 200, output = '', sent = false;
      const response = {
        get headersSent() { return sent; },
        setHeader() {},
        writeHead(code: number) { status = code; sent = true; },
        end(value: string | Buffer = '') { output = value.toString(); },
      } as unknown as ServerResponse;
      await handler(incoming, response);
      return { status, body: JSON.parse(output) as unknown };
    }));
    return reply(200, { capsule: sealCapsule(store), results });
  } catch (error) {
    const failure = error as Error & { status?: number };
    return reply(failure.status || 500, { error: failure.status ? failure.message : 'The stable hit a snag. Try again.' });
  }
}
