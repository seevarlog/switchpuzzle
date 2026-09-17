import { createSolvedBoard, isSolved, swapTiles, type Board } from "./board";
import { cellCount, neighbors, type Adjacency, type GridSize } from "./grid";
import { randInt, type Rng } from "./rng";

/**
 * 섞는 방식.
 * - random: 완전 무작위 순열 (난이도 최대)
 * - walk: 완성 상태에서 이웃 교환을 steps번 수행. steps번 이내로 반드시 풀 수 있어 이동 제한 모드에 쓴다
 */
export type ShuffleSpec = { kind: "random" } | { kind: "walk"; steps: number };

const MAX_ATTEMPTS = 20;

export function shuffleBoard(size: GridSize, spec: ShuffleSpec, adjacency: Adjacency, rng: Rng): Board {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const board = spec.kind === "random" ? randomPermutation(size, rng) : randomWalk(size, spec.steps, adjacency, rng);
    if (!isSolved(board)) return board;
  }
  // 1×2 같은 극단적인 판에서만 도달 — 첫 두 칸을 강제로 바꾼다
  return swapTiles(createSolvedBoard(size), 0, 1);
}

function randomPermutation(size: GridSize, rng: Rng): Board {
  const tiles = Array.from({ length: cellCount(size) }, (_, i) => i);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return { size, tiles };
}

function randomWalk(size: GridSize, steps: number, adjacency: Adjacency, rng: Rng): Board {
  let board = createSolvedBoard(size);
  let lastPair = "";
  for (let s = 0; s < steps; s++) {
    let [a, b] = pickPair(size, adjacency, rng);
    // 직전 교환을 바로 되돌리는 낭비 방지 (교환 가능한 쌍이 하나뿐인 판은 몇 번 시도 후 허용)
    for (let retry = 0; retry < 8 && pairKey(a, b) === lastPair; retry++) {
      [a, b] = pickPair(size, adjacency, rng);
    }
    board = swapTiles(board, a, b);
    lastPair = pairKey(a, b);
  }
  return board;
}

function pickPair(size: GridSize, adjacency: Adjacency, rng: Rng): [number, number] {
  const a = randInt(rng, cellCount(size));
  const around = neighbors(size, a, adjacency);
  return [a, around[randInt(rng, around.length)]];
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
