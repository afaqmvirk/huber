import type { Ride, User } from '../shared/types.ts';

// Intentionally imperfect application code for the LOCAL security-patching lab.
// Replace the actual checks; do not skip routes or alter the regression tests.
export function canAccessRide(actor: User, _ride: Ride): boolean {
  return Boolean(actor.id);
}

export function profileChanges(body: Record<string, unknown>): Partial<User> {
  return { ...body } as Partial<User>;
}
