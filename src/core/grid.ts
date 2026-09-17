export interface GridSize {
  rows: number;
  cols: number;
}

/**
 * 어떤 칸끼리 자리를 바꿀 수 있는지.
 * - orthogonal: 상하좌우 4방향
 * - octagonal: 대각선 포함 8방향
 */
export type Adjacency = "orthogonal" | "octagonal";

export interface Cell {
  row: number;
  col: number;
}

export function cellCount(size: GridSize): number {
  return size.rows * size.cols;
}

export function toCell(size: GridSize, index: number): Cell {
  return { row: Math.floor(index / size.cols), col: index % size.cols };
}

export function toIndex(size: GridSize, row: number, col: number): number {
  return row * size.cols + col;
}

export function inBounds(size: GridSize, row: number, col: number): boolean {
  return row >= 0 && row < size.rows && col >= 0 && col < size.cols;
}

export function areAdjacent(size: GridSize, a: number, b: number, adjacency: Adjacency): boolean {
  if (a === b) return false;
  const ca = toCell(size, a);
  const cb = toCell(size, b);
  const dr = Math.abs(ca.row - cb.row);
  const dc = Math.abs(ca.col - cb.col);
  if (adjacency === "orthogonal") return dr + dc === 1;
  return Math.max(dr, dc) === 1;
}

const ORTHOGONAL_STEPS: readonly Cell[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

const DIAGONAL_STEPS: readonly Cell[] = [
  { row: -1, col: -1 },
  { row: -1, col: 1 },
  { row: 1, col: -1 },
  { row: 1, col: 1 },
];

export function neighbors(size: GridSize, index: number, adjacency: Adjacency): number[] {
  const steps = adjacency === "orthogonal" ? ORTHOGONAL_STEPS : [...ORTHOGONAL_STEPS, ...DIAGONAL_STEPS];
  const { row, col } = toCell(size, index);
  const result: number[] = [];
  for (const s of steps) {
    const r = row + s.row;
    const c = col + s.col;
    if (inBounds(size, r, c)) result.push(toIndex(size, r, c));
  }
  return result;
}

/** 스와이프 방향(dRow, dCol ∈ {-1,0,1})으로 한 칸 옆. 격자 밖이면 null */
export function neighborInDirection(size: GridSize, index: number, dRow: number, dCol: number): number | null {
  const { row, col } = toCell(size, index);
  const r = row + dRow;
  const c = col + dCol;
  return inBounds(size, r, c) ? toIndex(size, r, c) : null;
}
