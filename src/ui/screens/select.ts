import { allImages, assetUrl, loadCatalog, type Manifest, type PuzzlePack } from "../../assets/catalog";
import { getMode, type ModeDefinition } from "../../modes";
import { loadProgress } from "../../storage/progress";
import { el, type Dispose } from "../dom";
import { goBack, navigate } from "../router";

const PACK_KEY = "switchpuzzle.lastPack";

function readLastPack(): string | null {
  try {
    return localStorage.getItem(PACK_KEY);
  } catch {
    return null;
  }
}

function writeLastPack(id: string): void {
  try {
    localStorage.setItem(PACK_KEY, id);
  } catch {
    // 기억 못 해도 동작에는 지장 없음
  }
}

export function renderSelect(root: HTMLElement, modeId: string): Dispose {
  const mode = getMode(modeId);
  if (!mode) {
    navigate({ name: "home" }, { replace: true });
    return () => {};
  }
  return mountSelect(root, mode);
}

function mountSelect(root: HTMLElement, mode: ModeDefinition): Dispose {

  const progress = loadProgress()[mode.id] ?? {};
  const subtitle = el("span", { class: "subtitle" }, "그림을 고르세요");
  const tabs = el("nav", { class: "pack-tabs", attrs: { role: "tablist" } });
  const grid = el("ul", { class: "thumb-grid" });
  const status = el("p", { class: "status" }, "불러오는 중…");

  root.append(
    el(
      "main",
      { class: "screen select" },
      el(
        "header",
        { class: "bar" },
        el("button", { class: "icon-btn", attrs: { "aria-label": "뒤로" }, on: { click: () => goBack() } }, "‹"),
        el("div", { class: "bar-title" }, el("strong", {}, mode.name), subtitle),
      ),
      tabs,
      el("div", { class: "scroll" }, status, grid),
    ),
  );

  function showPack(manifest: Manifest, pack: PuzzlePack): void {
    writeLastPack(pack.id);
    for (const tab of tabs.children) {
      tab.setAttribute("aria-selected", String((tab as HTMLElement).dataset.pack === pack.id));
    }
    grid.replaceChildren(
      ...pack.images.map((img) => {
        const record = progress[img.id];
        return el(
          "li",
          {},
          el(
            "button",
            {
              class: `thumb${record ? " cleared" : ""}`,
              attrs: { "aria-label": `${img.title}${record ? " (클리어)" : ""}` },
              on: { click: () => navigate({ name: "play", modeId: mode.id, imageId: img.id }) },
            },
            el("img", {
              attrs: { src: assetUrl(img.thumb), alt: "", loading: "lazy", decoding: "async" },
            }),
            record ? el("span", { class: "badge" }, `✓ ${record.bestMoves}회`) : null,
          ),
        );
      }),
    );
    const images = allImages(manifest);
    const cleared = images.filter((img) => progress[img.id]).length;
    subtitle.textContent = `클리어 ${cleared}/${images.length}`;
  }

  let alive = true;
  loadCatalog()
    .then((manifest) => {
      if (!alive) return;
      if (manifest.packs.length === 0) {
        status.textContent = "그림이 없습니다. images-src/ 에 그림을 넣고 npm run images 를 실행하세요.";
        return;
      }
      status.remove();
      tabs.replaceChildren(
        ...manifest.packs.map((pack) =>
          el(
            "button",
            {
              class: "pack-tab",
              attrs: { role: "tab", "data-pack": pack.id },
              on: { click: () => showPack(manifest, pack) },
            },
            pack.name,
            el("span", { class: "count" }, pack.images.length),
          ),
        ),
      );
      const last = readLastPack();
      showPack(manifest, manifest.packs.find((p) => p.id === last) ?? manifest.packs[0]);
    })
    .catch((err: unknown) => {
      if (alive) status.textContent = err instanceof Error ? err.message : String(err);
    });

  return () => {
    alive = false;
  };
}
