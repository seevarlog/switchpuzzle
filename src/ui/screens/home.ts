import { allImages, loadCatalog } from "../../assets/catalog";
import { MODES, type ModeDefinition } from "../../modes";
import { loadProgress } from "../../storage/progress";
import { el, type Dispose } from "../dom";
import { navigate } from "../router";

export function modeChips(mode: ModeDefinition): string[] {
  const chips = [`${mode.size.rows}×${mode.size.cols}`];
  if (mode.adjacency === "octagonal") chips.push("8방향");
  if (mode.moveLimit !== undefined) chips.push(`${mode.moveLimit}회 제한`);
  if (mode.timeLimitSec !== undefined) chips.push(`${Math.round(mode.timeLimitSec / 60)}분`);
  return chips;
}

export function renderHome(root: HTMLElement): Dispose {
  const progress = loadProgress();
  const clearCounts = new Map<string, HTMLElement>();
  const footer = el("p", { class: "home-footer" });

  const list = el(
    "ul",
    { class: "mode-list" },
    ...MODES.map((mode) => {
      const count = el("span", { class: "mode-progress" });
      clearCounts.set(mode.id, count);
      return el(
        "li",
        {},
        el(
          "button",
          { class: "mode-card", on: { click: () => navigate({ name: "select", modeId: mode.id }) } },
          el("span", { class: "mode-name" }, mode.name),
          el("span", { class: "mode-tagline" }, mode.tagline),
          el("span", { class: "chips" }, ...modeChips(mode).map((c) => el("span", { class: "chip" }, c)), count),
        ),
      );
    }),
  );

  root.append(
    el(
      "main",
      { class: "screen home" },
      el(
        "header",
        { class: "home-hero" },
        el("h1", {}, "스위치 퍼즐"),
        el("p", {}, "이웃한 두 조각을 차례로 눌러 자리를 바꾸고 그림을 완성하세요"),
      ),
      list,
      footer,
    ),
  );

  let alive = true;
  loadCatalog()
    .then((manifest) => {
      if (!alive) return;
      const images = allImages(manifest);
      for (const mode of MODES) {
        const cleared = images.filter((img) => progress[mode.id]?.[img.id]).length;
        clearCounts.get(mode.id)!.textContent = `${cleared}/${images.length}`;
      }
      footer.textContent = `그림 ${images.length}장 · 팩 ${manifest.packs.length}개`;
    })
    .catch((err: unknown) => {
      if (alive) footer.textContent = err instanceof Error ? err.message : String(err);
    });

  return () => {
    alive = false;
  };
}
