// A small per-person limit so one account can't run up the AI bill.
// In memory: good enough for one server; resets when it restarts.
const hits = new Map<string, number[]>();
const LIMITS = [{ ms: 60_000, max: 20 }, { ms: 86_400_000, max: 400 }];

export function allow(userId: string, limits = LIMITS): boolean {
  const now = Date.now();
  const list = (hits.get(userId) || []).filter(t => now - t < limits[limits.length - 1].ms);
  if (limits.some(l => list.filter(t => now - t < l.ms).length >= l.max)) { hits.set(userId, list); return false; }
  list.push(now); hits.set(userId, list);
  return true;
}

/** Sign-in attempts: 10 a minute, 50 an hour per email or address. */
export const SIGN_IN_LIMITS = [{ ms: 60_000, max: 10 }, { ms: 3_600_000, max: 50 }];
