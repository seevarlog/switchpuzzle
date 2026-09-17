# 스위치 퍼즐 (switchpuzzle)

그림을 격자 조각으로 나눠 섞은 뒤, **이웃한 두 조각을 차례로 눌러(A → B) 한 칸씩 자리를 바꿔** 원래 그림을 완성하는 퍼즐 게임.

- 대상: **Android 앱** (Capacitor) + **웹** (테스트용)
- 목표: 앱 안에 그림을 최대한 많이 담기 → 그림은 코드와 분리된 파이프라인으로 관리
- 모드는 데이터 한 덩어리로 추가 (판 크기 6×6 → 8×8 등 확장 가능)

## 빠른 시작

```bash
npm install
npm run dev
```

- `npm run dev`는 그림 변환(`npm run images`)을 먼저 실행한 뒤 Vite 서버를 `--host`로 띄운다.
  같은 Wi‑Fi의 휴대폰에서 `http://<Mac IP>:5173` 으로 바로 테스트할 수 있다.
- 조작: 조각 A를 탭 → 이웃 조각 B를 탭하면 교환. 조각을 이웃 방향으로 **끌어도** 교환된다.
  멀리 있는 조각을 누르면 선택만 옮겨간다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 그림 변환 + 개발 서버 |
| `npm run build` | 그림 변환 + 타입 체크 + 프로덕션 빌드(`dist/`) |
| `npm test` | 코어 로직 테스트 (vitest) |
| `npm run typecheck` | 타입 체크 |
| `npm run images` | `images-src/` → `public/puzzles/` 변환 (바뀐 파일만) |
| `npm run images:sample` | 프로토타입용 샘플 그림(SVG) 재생성 |
| `npm run android:sync` | 웹 빌드 후 Android 프로젝트에 복사 |
| `npm run android:open` | Android Studio로 열기 |

## 그림 추가

```
images-src/
  landscape/          ← 폴더 하나 = 팩 하나
    pack.json         ← 선택: {"name": "풍경", "order": 1, "titles": {"01": "노을 진 산"}}
    01.svg
    02.jpg
  shapes/
    ...
```

1. `images-src/<팩>/`에 그림(png, jpg, webp, avif, svg)을 넣는다.
2. `npm run images` → 정사각형으로 가운데를 잘라 WebP로 변환하고, 썸네일과 `manifest.json`을 만든다.
   - 산출물 `public/puzzles/`는 git에 올리지 않는다 (빌드 때마다 생성).
   - 원본을 지우면 산출물도 정리된다.
3. 앱이 `manifest.json`을 읽어 목록을 만들기 때문에 **코드 수정 없이** 그림이 늘어난다.
   그림을 JS에 import하지 않으므로 수천 장을 넣어도 JS 번들 크기는 그대로다.

용량 조절 (환경변수):

```bash
PUZZLE_SIZE=1024 PUZZLE_THUMB=256 PUZZLE_QUALITY=80 npm run images
```

실행 결과에 `합계 ○MB (장당 ○KB)`가 찍히므로 실제 그림으로 장당 용량을 재서 수록 가능 장수를 계산한다.
샘플(단순 벡터)은 장당 약 34KB이고, 사진·일러스트는 이보다 훨씬 크다(대략 100~200KB로 예상, 실측 필요).
Google Play는 AAB 기본 모듈의 압축 다운로드 크기를 200MB로 제한하므로, 그 이상 담으려면
Play Asset Delivery(에셋 팩)를 도입해야 한다.

## 모드 추가

`src/modes/index.ts`에 정의를 추가하고 `MODES` 배열에 넣으면 홈 화면에 나온다.

```ts
const tinyRush: ModeDefinition = {
  id: "rush",                          // 진행 기록 키 — 바꾸지 말 것
  name: "러시 4×4",
  tagline: "작은 판, 빠른 승부",
  size: { rows: 4, cols: 4 },
  adjacency: "orthogonal",             // "octagonal" = 대각선 포함 8방향
  shuffle: { kind: "walk", steps: 12 }, // "random" = 완전 무작위
  moveLimit: 16,                       // 선택: 교환 횟수 제한
  timeLimitSec: 60,                    // 선택: 제한 시간(첫 교환부터)
  markCorrect: true,                   // 제자리 조각에 초록 점 표시
};
```

`walk` 섞기는 완성 상태에서 이웃 교환을 `steps`번 한 것이라 **`steps`회 이내로 반드시 풀 수 있다**.
이동 제한 모드는 `moveLimit >= steps`로 둔다 (테스트가 확인한다).

현재 모드: 클래식(6×6) · 제한 이동(24회) · 타임어택(3분) · 빅 보드 8×8(대각선 허용)

## Android 빌드

필요: Android Studio(최신, JDK 21 포함) + Android SDK 36

```bash
npm run android:sync   # 웹 빌드 → android/ 에 복사
npm run android:open   # Android Studio에서 Run ▶
```

- 앱 ID: `com.seevarlog.switchpuzzle` (`capacitor.config.ts`)
- 하드웨어 뒤로가기: 게임 → 목록 → 홈 → 앱 종료
- 교환 성공 시 짧은 진동 (`@capacitor/haptics`)
- `android/app/src/main/assets/public`은 sync 산출물이라 git에 올리지 않는다.

## 구조

```
src/
  core/        순수 로직 — 격자·판·섞기·난수 (DOM 없음, 테스트 대상)
  game/        GameSession: 교환 규칙·승패·타이머(일시정지 포함)
  modes/       모드 정의와 목록
  assets/      manifest 로드, 그림 URL
  storage/     진행 기록(localStorage) — 모드별·그림별 최소 교환/시간
  platform/    Capacitor 연동 (뒤로가기, 진동)
  ui/          라우터(hash), 보드 뷰, 화면(home / select / game)
scripts/       그림 변환·샘플 생성
images-src/    원본 그림 (팩 = 폴더)
tests/         vitest
android/       Capacitor Android 프로젝트
```

- 화면 흐름: `#/` 모드 선택 → `#/mode/<모드>` 그림 선택 → `#/play/<모드>/<그림>` 게임
- 판 렌더링: 조각마다 `div` 하나, 위치는 `transform`으로 옮겨 교환 애니메이션을 CSS가 처리한다.
  (개별 `translate` 속성은 구형 Android WebView에서 동작하지 않아 쓰지 않는다)
