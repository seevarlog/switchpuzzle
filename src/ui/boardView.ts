import { piecePositions, type Board } from "../core/board";
import { areAdjacent, neighborInDirection, toCell, type Adjacency, type GridSize } from "../core/grid";
import { el } from "./dom";

export interface BoardViewOptions {
  size: GridSize;
  adjacency: Adjacency;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  /** 교환 요청. 받아들여졌으면 true (호출자가 이어서 update 를 부른다) */
  onSwap: (a: number, b: number) => boolean;
}

export interface BoardRenderState {
  board: Board;
  markCorrect: boolean;
  showNumbers: boolean;
  solved: boolean;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  position: number;
  handled: boolean;
}

/** 8방향 스와이프: atan2 각도를 45° 단위로 나눈 순서 (화면 y축은 아래가 +) */
const OCTANT_STEPS: ReadonlyArray<readonly [dRow: number, dCol: number]> = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];

/**
 * 퍼즐 판 렌더링 + 입력.
 * - 조각 하나 = 절대 위치 div. 위치는 CSS transform 으로 옮겨 교환 애니메이션이 공짜로 된다
 * - 입력: A를 탭 → 이웃 B를 탭하면 교환. 조각을 이웃 방향으로 끌어도 교환
 */
export class BoardView {
  readonly el: HTMLElement;
  private readonly opts: BoardViewOptions;
  private readonly boardEl: HTMLElement;
  private readonly tiles: HTMLElement[];
  private readonly faces: HTMLElement[];
  private readonly resizeObserver: ResizeObserver;
  private positions: number[] = [];
  private state: BoardRenderState | null = null;
  private selected: number | null = null;
  private drag: DragState | null = null;
  private tileW = 0;
  private tileH = 0;

  constructor(opts: BoardViewOptions) {
    this.opts = opts;
    const { rows, cols } = opts.size;
    const peek = el("div", { class: "peek" });
    peek.style.backgroundImage = `url("${opts.imageUrl}")`;

    // tile = 위치(transform), face = 그림 조각·강조·흔들림. 둘을 나눠 transform 충돌을 피한다
    this.faces = [];
    this.tiles = Array.from({ length: rows * cols }, (_, piece) => {
      const face = el("div", { class: "face" });
      face.style.backgroundImage = `url("${opts.imageUrl}")`;
      this.faces.push(face);
      const tile = el("div", { class: "tile", attrs: { "data-piece": String(piece) } }, face, el("span", { class: "num" }, piece + 1));
      tile.addEventListener("animationend", () => tile.classList.remove("shake"));
      return tile;
    });

    this.boardEl = el(
      "div",
      {
        class: "board",
        attrs: { role: "grid", "aria-label": `${rows}×${cols} 퍼즐 판` },
        on: {
          pointerdown: (e) => this.onPointerDown(e),
          pointermove: (e) => this.onPointerMove(e),
          pointerup: (e) => this.onPointerUp(e),
          pointercancel: () => (this.drag = null),
          contextmenu: (e) => e.preventDefault(),
        },
      },
      ...this.tiles,
      peek,
    );
    this.el = el("div", { class: "board-wrap" }, this.boardEl);

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.el);
  }

  update(state: BoardRenderState): void {
    this.state = state;
    this.positions = piecePositions(state.board);
    if (state.solved) this.selected = null;
    this.boardEl.classList.toggle("show-numbers", state.showNumbers);
    this.boardEl.classList.toggle("solved", state.solved);
    this.paint();
  }

  setPeek(on: boolean): void {
    this.boardEl.classList.toggle("peeking", on);
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.el.remove();
  }

  // ── 배치 ──────────────────────────────────────────────

  private layout(): void {
    const { rows, cols } = this.opts.size;
    const availW = this.el.clientWidth;
    const availH = this.el.clientHeight;
    if (availW === 0 || availH === 0) return;

    // 조각 크기를 정수 px 로 맞춰 경계에 틈이 보이지 않게 한다
    const tilePx = Math.floor(Math.min(availW / cols, availH / rows));
    this.tileW = tilePx;
    this.tileH = tilePx;
    const boardW = tilePx * cols;
    const boardH = tilePx * rows;
    this.boardEl.style.width = `${boardW}px`;
    this.boardEl.style.height = `${boardH}px`;

    // 그림을 판에 cover 로 맞췄을 때 각 조각이 보여줄 영역
    const { imageWidth: iw, imageHeight: ih } = this.opts;
    const scale = Math.max(boardW / iw, boardH / ih);
    const dispW = iw * scale;
    const dispH = ih * scale;
    const offX = (dispW - boardW) / 2;
    const offY = (dispH - boardH) / 2;

    this.tiles.forEach((tile, piece) => {
      const home = toCell(this.opts.size, piece);
      const face = this.faces[piece];
      tile.style.width = `${tilePx}px`;
      tile.style.height = `${tilePx}px`;
      face.style.backgroundSize = `${dispW}px ${dispH}px`;
      face.style.backgroundPosition = `${-(offX + home.col * tilePx)}px ${-(offY + home.row * tilePx)}px`;
    });

    // 크기 변경으로 인한 이동은 애니메이션 없이
    this.boardEl.classList.add("no-anim");
    this.paint();
    requestAnimationFrame(() => this.boardEl.classList.remove("no-anim"));
  }

  private paint(): void {
    const state = this.state;
    if (!state || this.tileW === 0) return;
    const { size, adjacency } = this.opts;
    const sel = this.selected;
    this.tiles.forEach((tile, piece) => {
      const pos = this.positions[piece];
      const { row, col } = toCell(size, pos);
      // 개별 translate 속성은 구형 Android WebView(Chrome 104 미만)에서 무시되므로 transform 사용
      tile.style.transform = `translate3d(${col * this.tileW}px, ${row * this.tileH}px, 0)`;
      tile.classList.toggle("correct", state.markCorrect && !state.solved && pos === piece);
      tile.classList.toggle("selected", sel === pos);
      tile.classList.toggle("can-swap", sel !== null && areAdjacent(size, sel, pos, adjacency));
    });
  }

  // ── 입력 ──────────────────────────────────────────────

  private positionOf(target: EventTarget | null): number | null {
    const tile = (target as Element | null)?.closest<HTMLElement>(".tile");
    if (!tile || !this.boardEl.contains(tile)) return null;
    return this.positions[Number(tile.dataset.piece)] ?? null;
  }

  private isLocked(): boolean {
    return !this.state || this.state.solved;
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.isLocked() || !e.isPrimary) return;
    const position = this.positionOf(e.target);
    if (position === null) return;
    e.preventDefault();
    try {
      this.boardEl.setPointerCapture(e.pointerId);
    } catch {
      // 이미 끝난 포인터 — 캡처 없이도 탭은 처리된다
    }
    this.drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, position, handled: false };
  }

  private onPointerMove(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.handled || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.hypot(dx, dy) < this.tileW * 0.35) return;

    drag.handled = true;
    const [dRow, dCol] = this.swipeDirection(dx, dy);
    const target = neighborInDirection(this.opts.size, drag.position, dRow, dCol);
    if (target === null) this.shake(drag.position);
    else this.requestSwap(drag.position, target);
  }

  private onPointerUp(e: PointerEvent): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.handled || e.pointerId !== drag.pointerId) return;
    this.handleTap(drag.position);
  }

  private swipeDirection(dx: number, dy: number): readonly [number, number] {
    if (this.opts.adjacency === "orthogonal") {
      return Math.abs(dx) >= Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
    }
    const octant = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
    return OCTANT_STEPS[octant];
  }

  private handleTap(position: number): void {
    const sel = this.selected;
    if (sel === null) {
      this.select(position);
    } else if (sel === position) {
      this.select(null);
    } else if (areAdjacent(this.opts.size, sel, position, this.opts.adjacency)) {
      this.requestSwap(sel, position);
    } else {
      this.select(position); // 멀리 있는 조각을 누르면 선택만 옮긴다
    }
  }

  private select(position: number | null): void {
    this.selected = position;
    this.paint();
  }

  private requestSwap(a: number, b: number): void {
    this.selected = null;
    if (!this.opts.onSwap(a, b)) {
      this.paint();
      this.shake(b);
    }
  }

  private shake(position: number): void {
    const piece = this.state?.board.tiles[position];
    if (piece === undefined) return;
    const tile = this.tiles[piece];
    tile.classList.remove("shake");
    void tile.offsetWidth; // 애니메이션 재시작
    tile.classList.add("shake");
  }
}
