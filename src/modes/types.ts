import type { Adjacency, GridSize } from "../core/grid";
import type { ShuffleSpec } from "../core/shuffle";

/**
 * 게임 모드 정의. 새 모드는 이 객체 하나를 만들어 modes/index.ts 에 등록하면 된다.
 * 규칙(판 크기·교환 범위·섞기·제한)은 데이터로 표현하고, GameSession 이 공통으로 해석한다.
 */
export interface ModeDefinition {
  id: string;
  name: string;
  /** 모드 목록 카드에 표시할 한 줄 설명 */
  tagline: string;
  size: GridSize;
  adjacency: Adjacency;
  shuffle: ShuffleSpec;
  /** 최대 교환 횟수. 없으면 무제한 */
  moveLimit?: number;
  /** 제한 시간(초). 첫 교환부터 흐른다. 없으면 무제한 */
  timeLimitSec?: number;
  /** 제자리에 맞춘 조각에 표시를 해줄지 */
  markCorrect: boolean;
}
