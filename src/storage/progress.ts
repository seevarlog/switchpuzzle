export interface ClearRecord {
  bestMoves: number;
  bestTimeMs: number;
  clears: number;
  lastClearedAt: string;
}

/** progress[모드id][그림id] */
export type Progress = Record<string, Record<string, ClearRecord>>;

export interface ClearResult {
  record: ClearRecord;
  isBestMoves: boolean;
  isBestTime: boolean;
  isFirstClear: boolean;
}

const STORAGE_KEY = "switchpuzzle.progress.v1";

/** 저장소와 무관한 기록 병합 규칙 */
export function mergeClear(
  prev: ClearRecord | undefined,
  moves: number,
  timeMs: number,
  at: Date,
): ClearResult {
  const record: ClearRecord = {
    bestMoves: prev ? Math.min(prev.bestMoves, moves) : moves,
    bestTimeMs: prev ? Math.min(prev.bestTimeMs, timeMs) : timeMs,
    clears: (prev?.clears ?? 0) + 1,
    lastClearedAt: at.toISOString(),
  };
  return {
    record,
    isFirstClear: !prev,
    isBestMoves: !!prev && moves < prev.bestMoves,
    isBestTime: !!prev && timeMs < prev.bestTimeMs,
  };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Progress) : {};
  } catch {
    return {};
  }
}

export function getRecord(modeId: string, imageId: string): ClearRecord | undefined {
  return loadProgress()[modeId]?.[imageId];
}

export function recordClear(modeId: string, imageId: string, moves: number, timeMs: number): ClearResult {
  const progress = loadProgress();
  const byMode = (progress[modeId] ??= {});
  const result = mergeClear(byMode[imageId], moves, timeMs, new Date());
  byMode[imageId] = result.record;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // 저장 불가(시크릿 모드 등) — 이번 판 결과 표시는 그대로 진행
  }
  return result;
}
