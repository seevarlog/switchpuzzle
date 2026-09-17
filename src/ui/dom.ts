type Child = Node | string | number | null | undefined | false;

type EventHandlers = {
  [E in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[E]) => void;
};

export interface ElProps {
  class?: string;
  attrs?: Record<string, string>;
  on?: EventHandlers;
}

/** 작은 DOM 생성 헬퍼. 문자열은 textContent 로 들어가 이스케이프가 필요 없다 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v);
  for (const [type, handler] of Object.entries(props.on ?? {})) {
    node.addEventListener(type, handler as EventListener);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 화면 컴포넌트 규약: 루트에 그리고, 정리 함수를 돌려준다 */
export type Dispose = () => void;
