export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  (): number;
  int: (n: number) => number;
  chance: (p: number) => boolean;
  pick: <T>(arr: readonly T[]) => T;
}

export function makeRng(seed: number): Rng {
  const base = mulberry32(seed);
  const rng = base as Rng;
  rng.int = (n: number) => (n <= 1 ? 0 : Math.floor(base() * n));
  rng.chance = (p: number) => base() < p;
  rng.pick = <T>(arr: readonly T[]) => arr[Math.floor(base() * arr.length)];
  return rng;
}

export function hash2(x: number, y: number, salt = 0) {
  let n = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
