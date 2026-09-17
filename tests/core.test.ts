import { describe, expect, it } from "vitest";
import { countCorrect, createSolvedBoard, isSolved, piecePositions, swapTiles } from "../src/core/board";
import { areAdjacent, neighborInDirection, neighbors } from "../src/core/grid";
import { createRng } from "../src/core/rng";
import { shuffleBoard } from "../src/core/shuffle";

const SIX = { rows: 6, cols: 6 };

describe("grid", () => {
  it("상하좌우만 이웃이다 (orthogonal)", () => {
    expect(areAdjacent(SIX, 7, 8, "orthogonal")).toBe(true);
    expect(areAdjacent(SIX, 7, 13, "orthogonal")).toBe(true);
    expect(areAdjacent(SIX, 7, 14, "orthogonal")).toBe(false);
    expect(areAdjacent(SIX, 7, 7, "orthogonal")).toBe(false);
  });

  it("행 끝과 다음 행 처음은 이웃이 아니다", () => {
    expect(areAdjacent(SIX, 5, 6, "orthogonal")).toBe(false);
  });

  it("octagonal 은 대각선도 이웃이다", () => {
    expect(areAdjacent(SIX, 7, 14, "octagonal")).toBe(true);
    expect(areAdjacent(SIX, 7, 21, "octagonal")).toBe(false);
  });

  it("모서리 칸의 이웃 수", () => {
    expect(neighbors(SIX, 0, "orthogonal").sort()).toEqual([1, 6]);
    expect(neighbors(SIX, 0, "octagonal").sort((a, b) => a - b)).toEqual([1, 6, 7]);
    expect(neighbors(SIX, 14, "octagonal")).toHaveLength(8);
  });

  it("방향 이웃은 격자 밖이면 null", () => {
    expect(neighborInDirection(SIX, 0, -1, 0)).toBeNull();
    expect(neighborInDirection(SIX, 0, 0, 1)).toBe(1);
    expect(neighborInDirection(SIX, 35, 1, 1)).toBeNull();
  });
});

describe("board", () => {
  it("교환은 원본을 바꾸지 않고 두 칸만 바꾼다", () => {
    const solved = createSolvedBoard(SIX);
    const swapped = swapTiles(solved, 0, 1);
    expect(isSolved(solved)).toBe(true);
    expect(swapped.tiles.slice(0, 3)).toEqual([1, 0, 2]);
    expect(countCorrect(swapped)).toBe(34);
    expect(isSolved(swapTiles(swapped, 0, 1))).toBe(true);
  });

  it("piecePositions 는 tiles 의 역순열이다", () => {
    const board = swapTiles(swapTiles(createSolvedBoard(SIX), 0, 1), 1, 7);
    const pos = piecePositions(board);
    board.tiles.forEach((piece, p) => expect(pos[piece]).toBe(p));
  });
});

describe("shuffle", () => {
  it("random 은 같은 조각 집합의 미완성 순열이다", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const board = shuffleBoard(SIX, { kind: "random" }, "orthogonal", createRng(seed));
      expect(isSolved(board)).toBe(false);
      expect([...board.tiles].sort((a, b) => a - b)).toEqual(createSolvedBoard(SIX).tiles);
    }
  });

  it("같은 시드는 같은 판을 만든다", () => {
    const a = shuffleBoard(SIX, { kind: "walk", steps: 20 }, "orthogonal", createRng(42));
    const b = shuffleBoard(SIX, { kind: "walk", steps: 20 }, "orthogonal", createRng(42));
    expect(a.tiles).toEqual(b.tiles);
  });

  it("walk 는 이웃 교환만으로 만들어져 steps 이하로 풀 수 있다", () => {
    // 맞지 않은 조각 수 ≤ 2 × steps
    for (let seed = 1; seed <= 50; seed++) {
      const board = shuffleBoard(SIX, { kind: "walk", steps: 5 }, "orthogonal", createRng(seed));
      expect(isSolved(board)).toBe(false);
      expect(36 - countCorrect(board)).toBeLessThanOrEqual(10);
      // 각 조각은 정답 위치에서 맨해튼 거리 5 이내
      board.tiles.forEach((piece, pos) => {
        const dr = Math.abs(Math.floor(piece / 6) - Math.floor(pos / 6));
        const dc = Math.abs((piece % 6) - (pos % 6));
        expect(dr + dc).toBeLessThanOrEqual(5);
      });
    }
  });

  it("교환 가능한 쌍이 하나뿐인 판에서도 멈추지 않는다", () => {
    const board = shuffleBoard({ rows: 1, cols: 2 }, { kind: "walk", steps: 3 }, "orthogonal", createRng(1));
    expect(board.tiles).toEqual([1, 0]);
  });
});
