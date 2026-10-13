export function allocateSeats(order: string[], currentGoing: string[], capacity: number | null): { going: string[]; waitlist: string[] } {
  const signedUp = [...new Set(order)];
  if (!capacity || capacity < 1) return { going: signedUp, waitlist: [] };
  const still = new Set(signedUp);
  const kept = [...new Set(currentGoing)].filter((u) => still.has(u));
  const keptSet = new Set(kept);
  const rest = signedUp.filter((u) => !keptSet.has(u));
  const free = Math.max(0, capacity - kept.length);
  return { going: [...kept, ...rest.slice(0, free)], waitlist: rest.slice(free) };
}

export const sameList = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);
