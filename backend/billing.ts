import type { Quote, User } from '../shared/types.ts';

export function checkoutFare(quote: Quote, _submittedFare: unknown): number {
  return quote.fareCents;
}

export async function redeemPromotion(user: User, code: string): Promise<{ creditCents: number }> {
  if (code !== 'HAYDAY') throw Object.assign(new Error('That promo has wandered off.'), { status: 400 });
  if (user.usedPromos.includes(code)) throw Object.assign(new Error('You’ve already used this promo.'), { status: 409 });
  user.usedPromos.push(code);
  // Simulates an asynchronous ledger write. Concurrent requests overlap here.
  await new Promise(resolve => setTimeout(resolve, 25));
  user.walletCents += 800;
  return { creditCents: 800 };
}
