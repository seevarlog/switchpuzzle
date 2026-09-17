import { cellCount, type GridSize } from "./grid";

/**
 * 퍼즐 판 상태.
 * tiles[위치] = 그 위치에 놓인 조각 번호. 조각 번호는 "정답 위치"와 같다.
 * 모든 i에 대해 tiles[i] === i 이면 완성.
 */
export interface Board {
  readonly size: GridSize;
  readonly tiles: readonly number[];
}

export function createSolvedBoard(size: GridSize): Board {
  return { size, tiles: Array.from({ length: cellCount(size) }, (_, i) => i) };
}

export function swapTiles(board: Board, a: number, b: number): Board {
  const tiles = board.tiles.slice();
  const t = tiles[a];
  tiles[a] = tiles[b];
  tiles[b] = t;
  return { size: board.size, tiles };
}

export function isCorrectAt(board: Board, position: number): boolean {
  return board.tiles[position] === position;
}

export function countCorrect(board: Board): number {
  let n = 0;
  for (let i = 0; i < board.tiles.length; i++) if (board.tiles[i] === i) n++;
  return n;
}

export function isSolved(board: Board): boolean {
  return countCorrect(board) === board.tiles.length;
}

/** positions[조각 번호] = 현재 위치 */
export function piecePositions(board: Board): number[] {
  const positions = new Array<number>(board.tiles.length);
  board.tiles.forEach((piece, pos) => {
    positions[piece] = pos;
  });
  return positions;
}
