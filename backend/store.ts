import { randomBytes } from 'node:crypto';
import type { ChatMessage, Quote, Ride, User } from '../shared/types.ts';

export type Store = {
  users: Map<string, User>; sessions: Map<string, string>; quotes: Map<string, Quote>;
  rides: Map<string, Ride>; messages: Map<string, ChatMessage[]>; events: { at: string; type: string; detail: string }[];
};
export const id = (prefix: string) => prefix + '_' + randomBytes(6).toString('hex');
export function createStore(): Store {
  const users: User[] = [
    { id: 'alex', name: 'Afaq Virk', email: 'afaq@huber.test', role: 'rider', walletCents: 4800, quietRide: false, usedPromos: [] },
    { id: 'blair', name: 'Blair Reed', email: 'blair@huber.test', role: 'rider', walletCents: 2500, quietRide: true, usedPromos: [] },
    { id: 'stable', name: 'Pat from the stable', email: 'pat@huber.test', role: 'stable_admin', walletCents: 0, quietRide: false, usedPromos: [] },
  ];
  const rides: Ride[] = [
    { id: 'ride_alex_001', userId: 'alex', quoteId: 'seed_001', pickupId: 'byward', destinationId: 'parliament', serviceId: 'pony', horseId: 'sir-neigh', fareCents: 869, bookingFeeCents: 99, distanceKm: 1.9, durationMinutes: 8, status: 'completed', createdAt: '2026-10-15T16:30:00-04:00', payment: 'OatPay' },
    { id: 'ride_alex_002', userId: 'alex', quoteId: 'seed_002', pickupId: 'canal', destinationId: 'glebe', serviceId: 'comfort', horseId: 'hayonce', fareCents: 1288, bookingFeeCents: 99, distanceKm: 2.0, durationMinutes: 9, status: 'completed', createdAt: '2026-10-14T10:15:00-04:00', payment: 'OatPay' },
    { id: 'ride_blair_001', userId: 'blair', quoteId: 'seed_003', pickupId: 'hub', destinationId: 'glebe', serviceId: 'carriage', horseId: 'pony-soprano', fareCents: 1960, bookingFeeCents: 99, distanceKm: 2.1, durationMinutes: 10, status: 'completed', createdAt: '2026-10-15T18:00:00-04:00', payment: 'OatPay' },
  ];
  return { users: new Map(users.map(u => [u.id, u])), sessions: new Map(), quotes: new Map(),
    rides: new Map(rides.map(r => [r.id, r])), messages: new Map(), events: [] };
}
export function event(store: Store, type: string, detail: string) {
  store.events.push({ at: new Date().toISOString(), type, detail });
  if (store.events.length > 100) store.events.shift();
}
