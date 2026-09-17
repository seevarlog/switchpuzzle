import type { ModeDefinition } from "./types";

export type { ModeDefinition } from "./types";

const classic: ModeDefinition = {
  id: "classic",
  name: "클래식",
  tagline: "제한 없이 천천히 그림을 완성해요",
  size: { rows: 6, cols: 6 },
  adjacency: "orthogonal",
  shuffle: { kind: "random" },
  markCorrect: true,
};

const limitedMoves: ModeDefinition = {
  id: "moves",
  name: "제한 이동",
  tagline: "정해진 교환 횟수 안에 완성하세요",
  size: { rows: 6, cols: 6 },
  adjacency: "orthogonal",
  shuffle: { kind: "walk", steps: 18 },
  moveLimit: 24,
  markCorrect: false,
};

const timeAttack: ModeDefinition = {
  id: "time",
  name: "타임어택",
  tagline: "제한 시간 안에 최대한 빨리",
  size: { rows: 6, cols: 6 },
  adjacency: "orthogonal",
  shuffle: { kind: "walk", steps: 40 },
  timeLimitSec: 180,
  markCorrect: true,
};

const bigBoard: ModeDefinition = {
  id: "big",
  name: "빅 보드 8×8",
  tagline: "조각이 더 잘게, 대각선 교환도 가능",
  size: { rows: 8, cols: 8 },
  adjacency: "octagonal",
  shuffle: { kind: "random" },
  markCorrect: true,
};

/** 목록 표시 순서 = 배열 순서 */
export const MODES: readonly ModeDefinition[] = [classic, limitedMoves, timeAttack, bigBoard];

export function getMode(id: string): ModeDefinition | undefined {
  return MODES.find((m) => m.id === id);
}
