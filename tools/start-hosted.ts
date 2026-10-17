import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import gateway from '../api/gateway.ts';
import { createHuberHandler } from '../backend/server.ts';

process.env.HUBER_STATE_KEY ||= randomBytes(32).toString('hex');
const { handler } = createHuberHandler({ hostedAssets: true });
createServer((req, res) => req.url === '/api/gateway' ? gateway(req, res) : handler(req, res))
  .listen(Number(process.env.PORT || 8788), '127.0.0.1', () => console.log('Hosted-mode preview: http://127.0.0.1:8788'));
