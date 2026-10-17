import type { Ride, User } from '../shared/types.ts';

// Intentionally imperfect application code for the LOCAL security-patching lab.
// Replace the actual checks; do not skip routes or alter the regression tests.
export function canAccessRide(actor: User, ride: Ride): boolean {
  return actor.id === ride.userId || actor.role === 'stable_admin';
}

export function profileChanges(body: Record<string, unknown>): Partial<User> {
  const allowed: Partial<User> = {};
  if ('name' in body) allowed.name = body.name as string;
  if ('quietRide' in body) allowed.quietRide = body.quietRide as boolean;
  return allowed;
}
