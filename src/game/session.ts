import { isSolved, swapTiles, type Board } from "../core/board";
import { areAdjacent } from "../core/grid";
import type { Rng } from "../core/rng";
import { shuffleBoard } from "../core/shuffle";
import type { ModeDefinition } from "../modes";

export type SessionStatus = "playing" | "won" | "lost";
export type LoseReason = "moves" | "time";

type Clock = () => number;

/**
 * 한 판의 진행 상태. DOM과 무관한 순수 상태 머신이라 테스트로 규칙을 검증한다.
 * 시계는 첫 교환 시점부터 흐르고, pause/resume 으로 백그라운드 시간을 제외한다.
 */
export class GameSession {
  readonly mode: ModeDefinition;
  private _board: Board;
  private _moves = 0;
  private _status: SessionStatus = "playing";
  private _loseReason: LoseReason | null = null;
  private readonly now: Clock;
  private elapsedBeforeRun = 0;
  private runningSince: number | null = null;
  private started = false;
  private paused = false;

  constructor(mode: ModeDefinition, rng: Rng, now: Clock = () => performance.now()) {
    this.mode = mode;
    this.now = now;
    this._board = shuffleBoard(mode.size, mode.shuffle, mode.adjacency, rng);
  }

  get board(): Board {
    return this._board;
  }
  get moves(): number {
    return this._moves;
  }
  get status(): SessionStatus {
    return this._status;
  }
  get loseReason(): LoseReason | null {
    return this._loseReason;
  }

  canSwap(a: number, b: number): boolean {
    return this._status === "playing" && areAdjacent(this.mode.size, a, b, this.mode.adjacency);
  }

  /** 교환에 성공하면 true. 규칙 위반·종료 상태면 false */
  trySwap(a: number, b: number): boolean {
    if (!this.canSwap(a, b)) return false;
    // 시간 초과 상태에서 들어온 입력은 교환 전에 패배 처리
    if (this.tick() !== "playing") return false;
    if (!this.started) {
      this.started = true;
      if (!this.paused) this.runningSince = this.now();
    }
    this._board = swapTiles(this._board, a, b);
    this._moves++;
    if (isSolved(this._board)) {
      this.finish("won");
    } else if (this.mode.moveLimit !== undefined && this._moves >= this.mode.moveLimit) {
      this.finish("lost", "moves");
    }
    return true;
  }

  /** 시간 제한 확인. UI 타이머가 주기적으로 호출한다 */
  tick(): SessionStatus {
    const limit = this.timeLimitMs();
    if (this._status === "playing" && limit !== null && this.elapsedMs() >= limit) {
      this.finish("lost", "time");
    }
    return this._status;
  }

  elapsedMs(): number {
    const running = this.runningSince === null ? 0 : this.now() - this.runningSince;
    return this.elapsedBeforeRun + running;
  }

  remainingMs(): number | null {
    const limit = this.timeLimitMs();
    return limit === null ? null : Math.max(0, limit - this.elapsedMs());
  }

  remainingMoves(): number | null {
    return this.mode.moveLimit === undefined ? null : Math.max(0, this.mode.moveLimit - this._moves);
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    if (this.runningSince !== null) {
      this.elapsedBeforeRun += this.now() - this.runningSince;
      this.runningSince = null;
    }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.started && this._status === "playing") this.runningSince = this.now();
  }

  private timeLimitMs(): number | null {
    return this.mode.timeLimitSec === undefined ? null : this.mode.timeLimitSec * 1000;
  }

  private finish(status: Exclude<SessionStatus, "playing">, reason: LoseReason | null = null): void {
    if (this.runningSince !== null) {
      this.elapsedBeforeRun += this.now() - this.runningSince;
      this.runningSince = null;
    }
    if (reason === "time") {
      // 표시용 경과 시간을 제한값에 맞춘다
      this.elapsedBeforeRun = Math.min(this.elapsedBeforeRun, this.timeLimitMs() ?? Infinity);
    }
    this._status = status;
    this._loseReason = reason;
  }
}
