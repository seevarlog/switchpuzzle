import { describe, expect, it } from "vitest";
import { piecePositions } from "../src/core/board";
import { createRng } from "../src/core/rng";
import { GameSession } from "../src/game/session";
import { MODES, getMode, type ModeDefinition } from "../src/modes";
import { mergeClear } from "../src/storage/progress";

function fakeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const tiny: ModeDefinition = {
  id: "tiny",
  name: "테스트",
  tagline: "",
  size: { rows: 1, cols: 3 },
  adjacency: "orthogonal",
  shuffle: { kind: "walk", steps: 1 },
  markCorrect: true,
};

/** 1×3 판에서 walk 1회 → 반드시 한 쌍만 바뀐 상태. 그 쌍을 찾아준다 */
function wrongPair(session: GameSession): [number, number] {
  const wrong = session.board.tiles.flatMap((piece, pos) => (piece === pos ? [] : [pos]));
  expect(wrong).toHaveLength(2);
  return [wrong[0], wrong[1]];
}

describe("GameSession", () => {
  it("이웃이 아닌 칸은 교환하지 않는다", () => {
    const s = new GameSession(tiny, createRng(1));
    expect(s.trySwap(0, 2)).toBe(false);
    expect(s.moves).toBe(0);
  });

  it("정답 교환으로 승리하고, 이후 입력은 무시한다", () => {
    const clock = fakeClock();
    const s = new GameSession(tiny, createRng(3), clock.now);
    clock.advance(5000); // 첫 교환 전 시간은 세지 않는다
    const [a, b] = wrongPair(s);
    expect(s.trySwap(a, b)).toBe(true);
    expect(s.status).toBe("won");
    expect(s.moves).toBe(1);
    expect(s.elapsedMs()).toBe(0);
    expect(s.trySwap(0, 1)).toBe(false);
  });

  it("교환 횟수를 다 쓰면 패배", () => {
    const s = new GameSession({ ...tiny, moveLimit: 1 }, createRng(3));
    const [a, b] = wrongPair(s);
    const other = [0, 1, 2].find((p) => p !== a && p !== b)!;
    // 틀린 쌍이 아닌 이웃과 교환 → 여전히 미완성
    const neighbor = Math.abs(other - a) === 1 ? a : b;
    expect(s.trySwap(other, neighbor)).toBe(true);
    expect(s.status).toBe("lost");
    expect(s.loseReason).toBe("moves");
  });

  it("마지막 허용 교환으로 완성하면 승리가 우선", () => {
    const s = new GameSession({ ...tiny, moveLimit: 1 }, createRng(3));
    const [a, b] = wrongPair(s);
    s.trySwap(a, b);
    expect(s.status).toBe("won");
  });

  it("시간 제한은 첫 교환부터 흐르고, 초과하면 패배", () => {
    const clock = fakeClock();
    const mode: ModeDefinition = { ...tiny, size: { rows: 3, cols: 3 }, shuffle: { kind: "random" }, timeLimitSec: 10 };
    const s = new GameSession(mode, createRng(7), clock.now);
    clock.advance(60_000);
    expect(s.tick()).toBe("playing");

    s.trySwap(0, 1); // 첫 교환부터 시계 시작
    clock.advance(4_000);
    expect(s.remainingMs()).toBe(6_000);
    clock.advance(6_000);
    expect(s.tick()).toBe("lost");
    expect(s.loseReason).toBe("time");
    expect(s.elapsedMs()).toBe(10_000);
  });

  it("pause 동안의 시간은 제외된다", () => {
    const clock = fakeClock();
    const s = new GameSession({ ...tiny, size: { rows: 3, cols: 3 }, shuffle: { kind: "random" } }, createRng(9), clock.now);
    s.trySwap(0, 1);
    clock.advance(1_000);
    s.pause();
    clock.advance(30_000);
    s.resume();
    clock.advance(500);
    expect(s.elapsedMs()).toBe(1_500);
  });

  it("시간 초과 뒤 들어온 교환은 반영하지 않는다", () => {
    const clock = fakeClock();
    const mode: ModeDefinition = { ...tiny, size: { rows: 3, cols: 3 }, shuffle: { kind: "random" }, timeLimitSec: 1 };
    const s = new GameSession(mode, createRng(11), clock.now);
    s.trySwap(0, 1);
    const before = [...s.board.tiles];
    clock.advance(2_000);
    expect(s.trySwap(0, 1)).toBe(false);
    expect(s.board.tiles).toEqual(before);
    expect(s.status).toBe("lost");
  });
});

describe("modes", () => {
  it("id 가 고유하고 조회된다", () => {
    const ids = MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(getMode(id)?.id).toBe(id);
    expect(getMode("nope")).toBeUndefined();
  });

  it("walk 섞기 + 이동 제한 모드는 제한 안에 풀 수 있다", () => {
    for (const mode of MODES) {
      if (mode.moveLimit !== undefined && mode.shuffle.kind === "walk") {
        expect(mode.shuffle.steps).toBeLessThanOrEqual(mode.moveLimit);
      }
    }
  });

  it("모든 모드로 판을 만들 수 있다", () => {
    for (const mode of MODES) {
      const s = new GameSession(mode, createRng(1));
      expect(piecePositions(s.board)).toHaveLength(mode.size.rows * mode.size.cols);
      expect(s.status).toBe("playing");
    }
  });
});

describe("progress", () => {
  const at = new Date("2026-09-17T00:00:00Z");

  it("첫 클리어", () => {
    const r = mergeClear(undefined, 30, 5000, at);
    expect(r.isFirstClear).toBe(true);
    expect(r.isBestMoves).toBe(false);
    expect(r.record).toEqual({ bestMoves: 30, bestTimeMs: 5000, clears: 1, lastClearedAt: at.toISOString() });
  });

  it("기록은 항목별로 최솟값을 유지한다", () => {
    const first = mergeClear(undefined, 30, 5000, at).record;
    const r = mergeClear(first, 25, 9000, at);
    expect(r.isBestMoves).toBe(true);
    expect(r.isBestTime).toBe(false);
    expect(r.record.bestMoves).toBe(25);
    expect(r.record.bestTimeMs).toBe(5000);
    expect(r.record.clears).toBe(2);
  });
});
