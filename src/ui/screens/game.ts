import { assetUrl, findImage, loadCatalog, nextImage, preloadImage, type Manifest, type PuzzleImage } from "../../assets/catalog";
import { countCorrect } from "../../core/board";
import { cellCount } from "../../core/grid";
import { createRng, randomSeed } from "../../core/rng";
import { GameSession } from "../../game/session";
import { getMode, type ModeDefinition } from "../../modes";
import { tapFeedback } from "../../platform/haptics";
import { recordClear, type ClearResult } from "../../storage/progress";
import { BoardView } from "../boardView";
import { el, formatTime, type Dispose } from "../dom";
import { goBack, navigate } from "../router";

const TICK_MS = 250;
const WIN_OVERLAY_DELAY_MS = 700;

export function renderGame(root: HTMLElement, modeId: string, imageId: string): Dispose {
  const mode = getMode(modeId);
  if (!mode) {
    navigate({ name: "home" }, { replace: true });
    return () => {};
  }
  return mountGame(root, mode, imageId);
}

function mountGame(root: HTMLElement, mode: ModeDefinition, imageId: string): Dispose {

  const imageTitle = el("span", { class: "subtitle" });
  const movesStat = el("span", { class: "stat-value" }, "0");
  const timeStat = el("span", { class: "stat-value" }, "0:00");
  const correctStat = el("span", { class: "stat-value" }, "-");
  const stage = el("div", { class: "stage" }, el("p", { class: "status" }, "그림 불러오는 중…"));
  const overlay = el("div", { class: "overlay", attrs: { hidden: "" } });

  const numbersBtn = el("button", { class: "tool", attrs: { "aria-pressed": "false" } }, "번호");
  const peekBtn = el("button", { class: "tool" }, "원본 보기");
  const shuffleBtn = el("button", { class: "tool" }, "새로 섞기");

  root.append(
    el(
      "main",
      { class: "screen game" },
      el(
        "header",
        { class: "bar" },
        el("button", { class: "icon-btn", attrs: { "aria-label": "뒤로" }, on: { click: () => goBack() } }, "‹"),
        el("div", { class: "bar-title" }, el("strong", {}, mode.name), imageTitle),
      ),
      el(
        "div",
        { class: "stats" },
        el("div", { class: "stat" }, el("span", { class: "stat-label" }, mode.moveLimit ? "남은 교환" : "교환"), movesStat),
        el("div", { class: "stat" }, el("span", { class: "stat-label" }, mode.timeLimitSec ? "남은 시간" : "시간"), timeStat),
        mode.markCorrect
          ? el("div", { class: "stat" }, el("span", { class: "stat-label" }, "맞춘 조각"), correctStat)
          : null,
      ),
      stage,
      el("footer", { class: "toolbar" }, peekBtn, numbersBtn, shuffleBtn),
      overlay,
    ),
  );

  let manifest: Manifest | null = null;
  let image: PuzzleImage | null = null;
  let session: GameSession | null = null;
  let view: BoardView | null = null;
  let showNumbers = false;
  let alive = true;
  let winTimer = 0;

  function start(): void {
    if (!image) return;
    clearTimeout(winTimer);
    hideOverlay();
    session = new GameSession(mode, createRng(randomSeed()));
    view?.destroy();
    view = new BoardView({
      size: mode.size,
      adjacency: mode.adjacency,
      imageUrl: assetUrl(image.src),
      imageWidth: image.width,
      imageHeight: image.height,
      onSwap,
    });
    stage.replaceChildren(view.el);
    render();
  }

  function onSwap(a: number, b: number): boolean {
    if (!session?.trySwap(a, b)) return false;
    tapFeedback();
    render();
    if (session.status !== "playing") finish();
    return true;
  }

  function render(): void {
    if (!session || !view) return;
    view.update({
      board: session.board,
      markCorrect: mode.markCorrect,
      showNumbers,
      solved: session.status === "won",
    });
    renderStats();
  }

  function renderStats(): void {
    if (!session) return;
    movesStat.textContent = String(session.remainingMoves() ?? session.moves);
    const remaining = session.remainingMs();
    timeStat.textContent = remaining === null ? formatTime(session.elapsedMs()) : formatTime(Math.ceil(remaining / 1000) * 1000);
    timeStat.classList.toggle("warn", remaining !== null && remaining < 30_000);
    movesStat.classList.toggle("warn", (session.remainingMoves() ?? Infinity) <= 3);
    correctStat.textContent = `${countCorrect(session.board)}/${cellCount(mode.size)}`;
  }

  function finish(): void {
    if (!session || !image) return;
    if (session.status === "won") {
      const result = recordClear(mode.id, image.id, session.moves, session.elapsedMs());
      winTimer = window.setTimeout(() => showResult(result), WIN_OVERLAY_DELAY_MS);
    } else {
      render();
      showResult(null);
    }
  }

  function showResult(clear: ClearResult | null): void {
    if (!session || !image || !manifest) return;
    const won = clear !== null;
    const next = nextImage(manifest, image.id);
    const reason = session.loseReason === "time" ? "시간이 다 됐어요" : "교환 횟수를 모두 썼어요";

    const best = (on: boolean | undefined) => (on ? el("em", {}, "최고") : null);
    const stats = el(
      "p",
      { class: "result-stats" },
      el("span", {}, "교환 ", el("b", {}, `${session.moves}회`), best(clear?.isBestMoves)),
      el("span", {}, "시간 ", el("b", {}, formatTime(session.elapsedMs())), best(clear?.isBestTime)),
    );
    const sub = won ? (clear.isFirstClear ? "새 그림을 완성했어요" : `${clear.record.clears}번째 완성`) : reason;
    const nextBtn =
      won && next
        ? el(
            "button",
            {
              class: "btn primary",
              on: { click: () => navigate({ name: "play", modeId: mode.id, imageId: next.id }, { replace: true }) },
            },
            "다음 그림",
          )
        : null;

    overlay.replaceChildren(
      el(
        "div",
        { class: `sheet ${won ? "won" : "lost"}`, attrs: { role: "dialog", "aria-modal": "true" } },
        el("div", { class: "sheet-head" }, el("h2", {}, won ? "완성!" : "아쉬워요"), el("p", { class: "sheet-sub" }, sub)),
        stats,
        el(
          "div",
          { class: "sheet-actions" },
          el("button", { class: `btn${nextBtn ? "" : " primary wide"}`, on: { click: start } }, "다시 하기"),
          nextBtn,
          el("button", { class: "btn ghost wide", on: { click: () => goBack() } }, "목록으로"),
        ),
      ),
    );
    overlay.hidden = false;
  }

  function hideOverlay(): void {
    overlay.hidden = true;
    overlay.replaceChildren();
  }

  // ── 도구 ──
  numbersBtn.addEventListener("click", () => {
    showNumbers = !showNumbers;
    numbersBtn.setAttribute("aria-pressed", String(showNumbers));
    render();
  });
  const peekOn = (e: PointerEvent) => {
    e.preventDefault();
    view?.setPeek(true);
  };
  const peekOff = () => view?.setPeek(false);
  peekBtn.addEventListener("pointerdown", peekOn);
  peekBtn.addEventListener("pointerup", peekOff);
  peekBtn.addEventListener("pointerleave", peekOff);
  peekBtn.addEventListener("pointercancel", peekOff);
  peekBtn.addEventListener("contextmenu", (e) => e.preventDefault());
  shuffleBtn.addEventListener("click", start);

  // ── 타이머 / 백그라운드 ──
  const interval = window.setInterval(() => {
    if (!session || session.status !== "playing") return;
    if (session.tick() === "lost") finish();
    else renderStats();
  }, TICK_MS);

  const onVisibility = () => {
    if (!session) return;
    if (document.hidden) session.pause();
    else session.resume();
  };
  document.addEventListener("visibilitychange", onVisibility);

  // ── 로드 ──
  loadCatalog()
    .then(async (m) => {
      if (!alive) return;
      const found = findImage(m, imageId);
      if (!found) {
        navigate({ name: "select", modeId: mode.id }, { replace: true });
        return;
      }
      await preloadImage(assetUrl(found.src));
      if (!alive) return;
      manifest = m;
      image = found;
      imageTitle.textContent = found.title;
      start();
    })
    .catch((err: unknown) => {
      if (alive) stage.replaceChildren(el("p", { class: "status" }, err instanceof Error ? err.message : String(err)));
    });

  return () => {
    alive = false;
    clearInterval(interval);
    clearTimeout(winTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    view?.destroy();
  };
}
