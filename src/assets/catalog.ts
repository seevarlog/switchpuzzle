/**
 * 그림 카탈로그. public/puzzles/manifest.json 은 scripts/build-images.mjs 가 images-src/ 를 읽어 생성한다.
 * 그림을 코드에 import 하지 않으므로 수천 장을 넣어도 JS 번들 크기는 그대로다.
 */
export interface PuzzleImage {
  /** "팩id/그림id" — 전역 고유, 진행 기록의 키 */
  id: string;
  packId: string;
  title: string;
  /** BASE_URL 기준 상대 경로 */
  src: string;
  thumb: string;
  width: number;
  height: number;
  bytes: number;
}

export interface PuzzlePack {
  id: string;
  name: string;
  images: PuzzleImage[];
}

export interface Manifest {
  version: 1;
  generatedAt: string;
  packs: PuzzlePack[];
}

let manifestPromise: Promise<Manifest> | null = null;

export function loadCatalog(): Promise<Manifest> {
  manifestPromise ??= fetch(assetUrl("puzzles/manifest.json")).then((res) => {
    if (!res.ok) throw new Error(`manifest.json 로드 실패 (${res.status}) — npm run images 를 실행했는지 확인하세요`);
    return res.json() as Promise<Manifest>;
  });
  manifestPromise.catch(() => {
    manifestPromise = null; // 실패는 캐시하지 않고 다음 호출에서 재시도
  });
  return manifestPromise;
}

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

export function allImages(manifest: Manifest): PuzzleImage[] {
  return manifest.packs.flatMap((p) => p.images);
}

export function findImage(manifest: Manifest, imageId: string): PuzzleImage | undefined {
  return allImages(manifest).find((img) => img.id === imageId);
}

/** 같은 팩의 다음 그림. 팩 끝이면 다음 팩 첫 그림, 전체 끝이면 처음으로 */
export function nextImage(manifest: Manifest, imageId: string): PuzzleImage | undefined {
  const list = allImages(manifest);
  const i = list.findIndex((img) => img.id === imageId);
  if (i < 0 || list.length === 0) return undefined;
  return list[(i + 1) % list.length];
}

/**
 * load 이벤트로 기다린다. img.decode() 는 화면을 그리지 않는 탭(백그라운드 전환 중 등)에서
 * 끝나지 않아 게임 화면이 로딩에 멈출 수 있다.
 */
export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`그림을 불러오지 못했습니다: ${url}`));
    img.src = url;
  });
}
