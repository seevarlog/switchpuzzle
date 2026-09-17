export type Route =
  | { name: "home" }
  | { name: "select"; modeId: string }
  | { name: "play"; modeId: string; imageId: string };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "mode" && parts[1]) {
    return { name: "select", modeId: parts[1] };
  }
  if (parts[0] === "play" && parts[1] && parts[2]) {
    // imageId 자체에 "/" 가 들어있어 인코딩해서 한 세그먼트로 싣는다
    return { name: "play", modeId: parts[1], imageId: parts[2] };
  }
  return { name: "home" };
}

export function toHash(route: Route): string {
  switch (route.name) {
    case "home":
      return "#/";
    case "select":
      return `#/mode/${encodeURIComponent(route.modeId)}`;
    case "play":
      return `#/play/${encodeURIComponent(route.modeId)}/${encodeURIComponent(route.imageId)}`;
  }
}

/** 뒤로가기(앱 헤더 버튼·Android 하드웨어 키)가 향할 화면 */
export function parentOf(route: Route): Route | null {
  switch (route.name) {
    case "home":
      return null;
    case "select":
      return { name: "home" };
    case "play":
      return { name: "select", modeId: route.modeId };
  }
}

interface HistoryState {
  /** 앱 안에서 부모 화면으로부터 push 된 항목 — 뒤로가기를 history.back() 으로 처리해도 된다 */
  inApp?: boolean;
}

/**
 * 앞으로 이동은 부모→자식(home→select→play)만 push 한다.
 * 같은 깊이 이동(다음 그림)은 replace 로 해서 history 가 항상 부모 체인을 유지하게 한다.
 */
export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = toHash(route);
  if (options.replace) history.replaceState(history.state, "", hash);
  else history.pushState({ inApp: true } satisfies HistoryState, "", hash);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/** 부모 화면으로. 최상위(홈)라 갈 곳이 없으면 false */
export function goBack(): boolean {
  const parent = parentOf(currentRoute());
  if (!parent) return false;
  if ((history.state as HistoryState | null)?.inApp) history.back();
  else navigate(parent, { replace: true }); // 딥링크로 바로 들어온 경우
  return true;
}

export function currentRoute(): Route {
  return parseHash(location.hash);
}
