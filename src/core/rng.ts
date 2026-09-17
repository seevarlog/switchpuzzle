/** 0 이상 1 미만의 난수를 돌려주는 함수. 시드 고정 시 셔플을 재현할 수 있다. */
export type Rng = () => number;

/** 32비트 해시(murmur3 finalizer). 1, 2, 3 같은 연속 시드의 첫 출력이 서로 닮는 문제를 없앤다 */
function mixSeed(seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32 — 가볍고 분포가 충분한 32비트 PRNG */
export function createRng(seed: number): Rng {
  let a = mixSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}

/** [0, n) 정수 */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}
