import type { Horse, Place, Service } from './types.ts';

export const PLACES: Place[] = [
  { id: 'byward', name: 'ByWard Market', address: '55 ByWard Market Square, Ottawa', x: 325, y: 181, kind: 'landmark' },
  { id: 'parliament', name: 'Parliament Hill', address: '111 Wellington Street, Ottawa', x: 170, y: 255, kind: 'work' },
  { id: 'glebe', name: 'The Glebe', address: 'Lansdowne Park, Ottawa', x: 306, y: 497, kind: 'home' },
  { id: 'canal', name: 'Rideau Canal', address: '1 Rideau Street, Ottawa', x: 294, y: 297, kind: 'landmark' },
  { id: 'hub', name: 'Impact Hub', address: '123 Slater Street, Ottawa', x: 181, y: 353, kind: 'work' },
  { id: 'park', name: 'Major’s Hill Park', address: 'Mackenzie Avenue, Ottawa', x: 275, y: 190, kind: 'landmark' },
];

export const SERVICES: Service[] = [
  { id: 'pony', name: 'HuberX', subtitle: 'Affordable, everyday trots', eta: 3, seats: 1, baseCents: 399, perKmCents: 195, accent: '#e5ead7' },
  { id: 'comfort', name: 'Comfort', subtitle: 'Premium steeds with extra legroom', eta: 5, seats: 1, baseCents: 699, perKmCents: 245, accent: '#f0d5bd' },
  { id: 'carriage', name: 'HuberXL', subtitle: 'Carriage rides for up to 4', eta: 7, seats: 4, baseCents: 1199, perKmCents: 315, accent: '#e2dcf0' },
];

export const HORSES: Horse[] = [
  { id: 'sir-neigh', name: 'Sir Neighs-a-Lot', breed: 'Welsh pony', driver: 'Jamie Chen', rating: '4.98', rides: 628, coat: '#a8673e', mane: '#3b2a22', background: '#e5ead7', service: 'pony', plate: 'HAY 001', x: 349, y: 282 },
  { id: 'hayonce', name: 'Hayoncé', breed: 'American quarter horse', driver: 'Farah Khan', rating: '4.99', rides: 1240, coat: '#d2a575', mane: '#674c32', background: '#f0d5bd', service: 'comfort', plate: 'NEI 007', x: 196, y: 208 },
  { id: 'pony-soprano', name: 'Pony Soprano', breed: 'Clydesdale & carriage', driver: 'Marco Rossi', rating: '4.96', rides: 412, coat: '#665249', mane: '#262a29', background: '#e2dcf0', service: 'carriage', plate: 'OAT 420', x: 430, y: 359 },
];

export function placeById(id: string) { return PLACES.find(place => place.id === id); }
export function serviceById(id: string) { return SERVICES.find(service => service.id === id); }
export function routeEstimate(pickupId: string, destinationId: string) {
  const pickup = placeById(pickupId), destination = placeById(destinationId);
  if (!pickup || !destination || pickupId === destinationId) throw new Error('Choose two different stops.');
  const distanceKm = Math.round((Math.hypot(pickup.x - destination.x, pickup.y - destination.y) / 100 + 0.2) * 10) / 10;
  return { distanceKm, durationMinutes: Math.max(4, Math.round(distanceKm * 4.2)) };
}
export function calculateFare(serviceId: string, distanceKm: number) {
  const service = serviceById(serviceId);
  if (!service) throw new Error('Choose an available ride.');
  return service.baseCents + Math.round(service.perKmCents * distanceKm) + 99;
}
export function money(cents: number) { return '$' + (cents / 100).toFixed(2); }
