import "./style.css";
import { setupNative } from "./platform/native";
import type { Dispose } from "./ui/dom";
import { currentRoute } from "./ui/router";
import { renderGame } from "./ui/screens/game";
import { renderHome } from "./ui/screens/home";
import { renderSelect } from "./ui/screens/select";

const root = document.getElementById("app")!;
let dispose: Dispose | null = null;

function renderRoute(): void {
  dispose?.();
  root.replaceChildren();
  const route = currentRoute();
  switch (route.name) {
    case "home":
      dispose = renderHome(root);
      break;
    case "select":
      dispose = renderSelect(root, route.modeId);
      break;
    case "play":
      dispose = renderGame(root, route.modeId, route.imageId);
      break;
  }
}

window.addEventListener("hashchange", renderRoute);
setupNative();
renderRoute();
