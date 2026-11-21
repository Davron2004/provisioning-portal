/** A random source in [0, 1). Injected wherever behaviour is random so tests can make it deterministic. */
export type Random = () => number;

/** mulberry32: a small, fast seeded PRNG. Good enough for demo data and simulations; not for secrets. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomInt = (random: Random, min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));

export function pick<T>(random: Random, items: readonly T[]): T {
  if (items.length === 0) throw new Error('Cannot pick from an empty list');
  return items[Math.floor(random() * items.length)]!;
}

export function shuffle<T>(random: Random, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
