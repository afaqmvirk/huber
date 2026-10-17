import type { Quote, User } from '../shared/types.ts';

export function checkoutFare(quote: Quote, submittedFare: unknown): number {
  if (typeof submittedFare === 'number' && Number.isSafeInteger(submittedFare) && submittedFare >= 0) return submittedFare;
  return quote.fareCents;
}

export async function redeemPromotion(user: User, code: string): Promise<{ creditCents: number }> {
  if (code !== 'HAYDAY') throw Object.assign(new Error('That promo has wandered off.'), { status: 400 });
  if (user.usedPromos.includes(code)) throw Object.assign(new Error('You’ve already used this promo.'), { status: 409 });
  // Simulates an asynchronous ledger write. Concurrent requests overlap here.
  await new Promise(resolve => setTimeout(resolve, 25));
  user.walletCents += 800;
  user.usedPromos.push(code);
  return { creditCents: 800 };
}
