# CLAUDE.md

이 파일은 이 저장소(switchpuzzle)에서 일하는 Claude Code 세션과 역할 에이전트가 따르는 규칙이다.

## 프로젝트 개요
- 격자 위 그림 조각을 **인접한 두 조각끼리만 교환**해 정답 배치로 맞추는 퍼즐 게임
- 대상: Android 앱(Capacitor) + 웹(테스트). 목표: 앱에 그림을 최대한 많이 담기, 모드 확장
- GitHub: https://github.com/seevarlog/switchpuzzle — `main` 브랜치에서 작업
- 커밋 메시지: `feat|fix|refactor|chore|docs(scope): 한국어 설명`

## 명령어
```bash
npm run dev               # 그림 변환 + Vite 개발 서버(--host)
npm test                  # vitest (코어 로직)
npm run typecheck         # tsc --noEmit
npm run build             # 그림 변환 + 타입 체크 + 웹 빌드(dist/)
npm run images            # images-src/ → public/puzzles/ (WebP·썸네일·manifest, 증분)
npm run images:sample     # 임시 샘플 그림(SVG) 재생성 — images-src/ 변경이므로 사용자 승인 필요
npm run build:standalone  # 서버 없이 열리는 한 파일 데모(dist-standalone/)
npm run android:sync      # 웹 빌드 → android/ 복사 (APK 빌드는 Android Studio + JDK 21 필요)
```

## 팀 운영 — 역할 에이전트

### 원칙
- **사용자**가 최종 오너다. PD가 결정할 수 없는 것(예산·출시 일정·외부 계약·스토어 정책·저작권 판단·수익 모델·그림 추가/교체)은 사용자에게 묻는다.
- **메인 세션은 진행자**다. 아래 작업 흐름대로 역할 에이전트를 호출하고 산출물·질문을 전달한다.
  역할 산출물(브리프·GDD·스키마·데이터·아트·UI 명세·코드)을 메인 세션이 직접 만들지 않는다.
  예외: 사용자가 "직접 하라"고 지시한 경우.
- **커밋·푸시·브랜치 조작은 사용자가 지시했을 때만** 한다 (역할 에이전트·워크플로우 포함).
- 역할 에이전트가 낸 **질문은 PD에게**, **이슈는 `docs/issues.md`에** 올린다. PD의 결정은 `docs/pd/decisions.md`에 남는다.

### 역할 (`.claude/agents/`)
| 역할 | 에이전트 이름 | 주요 산출물 |
|---|---|---|
| PD | `pd` | 브리프, 백로그, 지시서, 검수 코멘트, 결정 로그 |
| 게임설계 아키텍터 | `game-architect` | GDD |
| 코더 구현자 | `coder` | 코드, 테스트, 빌드/실행 방법 |
| 기획데이터 아키텍터 | `data-architect` | 스키마 문서, 템플릿, 검증 규칙 |
| 게임데이터입력자 | `data-entry` | 완성 데이터, 검증 결과 |
| 컨텐츠기획자 | `content-planner` | 컨텐츠 기획서, 스테이지 리스트, 튜토리얼 |
| 원화디자이너 | `concept-artist` | 아트 디렉션, 콘셉트 시트, 리소스 규격 |
| UI디자이너 | `ui-designer` | 와이어프레임, 화면 상태, 인터랙션 명세 |

모든 에이전트 프롬프트 맨 앞에는 아래 공통 규칙이 붙어 있다.
```
- 이 게임의 핵심 규칙: 격자 위 조각을 정답 배치로 맞춘다. 교환은 인접한 두 조각끼리만 가능하다.
- 네 역할 범위 밖의 결정은 하지 말고 PD에게 질문으로 넘겨라.
- 가정한 것은 "가정:"으로 명시하고, 산출물은 정해진 형식으로만 내라.
- 다른 역할의 산출물을 입력으로 받으면 임의로 수정하지 말고 이슈로 보고하라.
```

### 작업 흐름
```
PD 브리프 → 게임설계(GDD) → 컨텐츠기획 ↔ 기획데이터 아키텍터(스키마)
  → 병렬 [코더: 코어 로직+로더 / 원화: 콘셉트 / UI: 와이어]
  → 게임데이터입력 → 코더 통합 → PD 검수
```
저장 워크플로우 `/team-flow <요청 내용>`이 이 흐름을 실행한다 (`.claude/workflows/team-flow.js`). 흐름 사이에 끼워 넣은 동작:
- PD가 지시서에서 뺀 역할은 건너뛴다. 코더 지시는 "코어 로직+로더" / "통합" 단계로 나눠 받고, 지시가 없는 단계는 실행하지 않는다.
- **질문·이슈**: 역할의 질문과 새 이슈(`새로 올림`/`열림`)는 PD가 처리한다. 이미 `결정됨`인 이슈는 PD에게 다시 보내지 않는다. 막히는 질문([차단])에 답이 오면 그 단계를 한 번 다시 돌린다.
- **룰 변경 제안**: 컨텐츠기획이 올린 미결정 제안은 PD가 채택 여부를 정하고(이미 결정된 제목은 기존 결정 재사용), 채택된 것은 스키마 설계 전에 게임설계가 GDD에 규격화한다. 이슈 후속·재작업 중에 나온 제안도 같은 방식으로 처리한다.
- **컨텐츠↔스키마**: 스키마가 컨텐츠 기획에 이슈를 올리거나, 룰 제안이 채택·규격화되거나, GDD가 이슈 후속으로 바뀌면 한 번 더 왕복한다 (최대 2회). 2차에서 채택·규격화된 제안은 컨텐츠기획이 한 번 더 반영한다.
- **병렬 단계 직전 (항상)**: 남은 게임설계·컨텐츠·기획데이터 후속을 실행하고, 그 과정에서 GDD나 컨텐츠 기획이 바뀌었으면 기획데이터가 스키마를 한 번 더 확인한다.
- **원화↔UI 교차 반영**: 병렬 단계 뒤에 원화가 UI의 "규격 요청"을 리소스 규격에 반영하고, UI가 아트 디렉션과 대조한다.
- **이슈 후속**: PD가 이슈 처리를 역할에 배정하면, 차례가 이미 지났거나 이번 요청에 없는 역할은 다음 단계 경계(병렬 직전·병렬 직후·코더 통합 직전·통합 직후·재검수 직전)에서 돌고, 아직 차례가 오지 않은 역할은 자기 차례에 지시로 받는다. 역할이 반영했다고 보고(`반영한 이슈`)해야 완료로 치고, 아니면 한 번 더 전달한 뒤 검수로 넘긴다. 후속 실행은 전체 최대 6회다.
- **거꾸로 가는 의존**: 원화가 후속·재작업으로 `docs/art/`를 바꾸면 UI가 아트 디렉션을 다시 대조하고, 코더가 코어 로직·로더·스크립트를 바꾸면 데이터입력이 시드·par를 다시 계산한다. 병렬 단계 뒤에 룰 제안이 규격화되면 결과의 `forUser`에 남긴다.
- **검수**: PD 검수에서 재작업이 나오면 해당 역할과 그 산출물을 쓰는 하류 역할을 한 번 다시 돌리고 재검수한다 (추가 반복 없음). 재작업 역할이 다른 재작업 역할의 하류이면 바뀐 입력을 먼저 확인하라는 안내를 받는다.
- **사용자 확인**: PD가 "진행을 막는" 사용자 확인 항목(`blockingForUser`)을 올리면 흐름이 멈춘다. 참고 항목(`forUser`)은 결과에만 담긴다.
  멈추면 진행자가 사용자에게 묻고, 답을 붙여 다시 실행한다: `/team-flow <요청>` 다음 줄에 `사용자 결정: <항목> → <답>`. 이어하기로 처리되어 PD가 기존 지시서를 갱신하고, 완료된 역할은 지시에서 빼되 "이번 요청 범위"(`carriedRoles`)로 남긴다 — 그 역할의 산출물은 통합·하류 확인에서 계속 반영된다. 사용자 결정은 결정 로그(출처=사용자)와 모든 역할 프롬프트의 "PD 결정 사항"에 실린다.
- **처음 실행**: `docs/pd/brief.md`가 없으면 PD가 요청과 관계없이 제품 목표·MVP·마일스톤, GDD 전체, 스키마 전체 초안부터 지시한다. 진행자는 첫 요청을 `/team-flow 킥오프: 프로토타입 기준 브리프·GDD 전체·스키마 초안`으로 하는 것을 권한다.
- 한 번 실행에 에이전트가 10~40회 호출되고 파일을 많이 고친다. 사용자에게는 결과의 `status`, `blockingForUser`, `forUser`, `review`와 함께 `failedSteps`, `unansweredQuestions`, `blockedAfterRetry`, 상태가 `미실행`인 `followUps`를 보고한다.
- 역할 에이전트와 워크플로우는 **이 저장소를 프로젝트로 연 세션**에서만 등록된다.

### 산출물 위치
| 산출물 | 경로 | 작성 |
|---|---|---|
| 프로젝트 브리프 | `docs/pd/brief.md` | pd |
| 우선순위 백로그 | `docs/pd/backlog.md` | pd |
| 역할별 지시서 (무엇을/왜/완료 기준/마감) | `docs/pd/orders/<YYYY-MM-DD>-<주제>.md` (같은 이름이 있으면 `-2`, `-3`…) | pd |
| 검수 코멘트 | `docs/pd/reviews/<지시서 파일 이름>-r<차수>.md` (예: `2026-09-17-par-2-r1.md`) | pd |
| 결정 로그 | `docs/pd/decisions.md` | pd |
| GDD | `docs/design/gdd.md` | game-architect |
| 컨텐츠 기획서 | `docs/content/content-plan.md` | content-planner |
| 스테이지 리스트 | `docs/content/stage-list.md` | content-planner |
| 튜토리얼 시나리오 | `docs/content/tutorial.md` | content-planner |
| 스키마 문서·검증 규칙·작성 가이드 | `docs/data/schema.md` | data-architect |
| 빈 템플릿 / 예시 행 | `data/templates/<테이블>.<확장자>` / `data/templates/<테이블>.example.<확장자>` | data-architect |
| 완성 데이터 | `data/<테이블>.<확장자>` (템플릿과 같은 이름, 예시 행은 옮기지 않음) | data-entry |
| 입력 검증 결과·미입력 항목·난이도 요약 | `docs/data/entry-report.md` | data-entry |
| 아트 디렉션 / 리소스 규격 표 | `docs/art/art-direction.md`, `docs/art/resource-spec.md` | concept-artist |
| 콘셉트 시트 | `docs/art/concepts/` | concept-artist |
| 와이어프레임·화면 상태·인터랙션·튜토리얼 안내·컴포넌트 규격 | `docs/ui/ui-spec.md` (그림은 `docs/ui/wireframes/`) | ui-designer |
| 코드 / 테스트 | `src/`, `tests/` | coder |
| 빌드·실행 방법 (시드·par 계산, 데이터 검사 스크립트 사용법 포함) | `README.md` | coder |
| 이슈 목록 (명세 불일치·산출물 문제) | `docs/issues.md` | 모든 역할 (추가만), 상태는 pd |

`docs/issues.md` 항목 형식: `- [ ] ISSUE-<에이전트 이름>-<번호> | 보고: <역할> | 대상: <산출물 경로> | 내용 | 상태: 열림`
- 번호에 에이전트 이름을 넣어 병렬 단계에서 여러 역할이 동시에 추가해도 겹치지 않게 한다.
- 올리기 전에 같은 대상·같은 내용의 `열림`/`결정됨` 항목이 있는지 확인하고, 있으면 그 ID를 현재 상태와 함께 보고한다.
- 새 항목은 Edit 도구로 맨 아래에 한 줄 추가한다. 파일 전체 덮어쓰기·`sed -i`는 쓰지 않는다.
- 상태는 PD만 바꾼다: `열림` → `결정됨 (D-<번호>)` → `해결됨`. 후속 작업이 필요 없는 결정(기각·현행 유지)은 결정과 동시에 `해결됨 (D-<번호>)`. 다음 지시서로 넘기는 것은 `결정됨`으로 두고 결정 로그에 "다음 지시서"라고 적는다. 해결되면 체크박스를 `[x]`로.

### 역할 에이전트의 보고 형식 (진행자에게 돌려주는 마지막 메시지)
```
산출물: <작성·수정한 파일 경로 목록 (저장소 루트 기준)>
요약: <3줄 이내>
가정: <목록 또는 "없음">
PD 질문: <목록 — 막히는 질문이면 [차단] 표시, 없으면 "없음">
이슈: <이번에 올렸거나 이미 있어서 재사용한 ISSUE ID와 상태 또는 "없음">
반영한 이슈: <PD가 배정한 이슈 후속 중 이번에 반영한 ISSUE ID 또는 "없음">
검증: <실행한 명령과 결과(통과/실패 요약) 또는 "없음">
```

## 현재 코드 상태 (프로토타입 — 기준선)
프로토타입이 이미 있다. GDD·스키마가 나오면 **문서가 우선**이고, 코드와 다른 점은 coder가 이슈로 올린 뒤 맞춘다.
- `src/core/` 격자·판·섞기(`random` / `walk`)·시드 RNG — DOM 없는 순수 로직, `tests/`에서 검증
- `src/game/session.ts` 교환 규칙·승패·이동/시간 제한·일시정지 (되돌리기는 없음)
- `src/modes/index.ts` 모드 정의 4종(`classic` 클래식·`moves` 제한 이동·`time` 타임어택·`big` 빅 보드 8×8 대각선) — 대각선 허용 여부는 GDD가 정한다
- `src/assets/catalog.ts` 그림 manifest 로드 (한 파일 배포본은 `window.__PUZZLE_MANIFEST__` 사용)
- `src/storage/progress.ts` 진행 기록 (localStorage `switchpuzzle.progress.v1`, `progress[모드id][그림id]`)
- `src/platform/` Android 뒤로가기·교환 진동 (Capacitor)
- `src/ui/` hash 라우터, 보드 뷰, 화면 3개(home / select / game)
- 그림 파이프라인: `images-src/<팩>/` → `scripts/build-images.mjs` → `public/puzzles/` (git 제외). 그림 id는 `<팩 폴더 slug>/<파일명 slug>`
- `images-src/landscape`·`images-src/shapes`는 `npm run images:sample`이 만든 **임시 샘플**이다. 테마·스테이지 데이터·리소스 규격의 근거로 쓰지 않는다.

### 코드에서 지켜야 할 것 (한 번씩 문제가 됐던 것)
- 조각 위치는 `transform: translate3d()`로 옮긴다. CSS 개별 `translate`/`scale` 속성은 구형 Android WebView에서 무시된다.
- 그림 사전 로드는 `load` 이벤트로 기다린다. `img.decode()`는 화면을 그리지 않는 탭에서 끝나지 않는다.
- 조각 그림 URL은 판 요소의 CSS 변수(`--piece-image`)에 한 번만 둔다. `assetUrl()`은 절대 URL을 돌려준다.
- 빌드 타깃은 `es2020`/`chrome87` (업데이트 안 된 WebView 고려).
- 기획 데이터(`data/`)는 `src/data/`에서 번들 import로 읽는다(JSON은 `import` 또는 `import.meta.glob(..., { eager: true })`, CSV는 `?raw`). `public/`에 복사해 fetch하지 않는다 — `build:standalone`은 `public/`을 복사하지 않는다. `data/templates/`는 번들에 넣지 않는다.
- 모드 id(`classic`/`moves`/`time`/`big`)와 그림 id는 진행 기록의 키다. id나 진행 기록 저장 구조를 바꾸려면 먼저 PD 결정(D-번호)을 받고(결정 로그는 PD가 쓴다), 마이그레이션과 함께 바꾼다.
- `images-src/`에 그림을 추가·교체·삭제하는 것은 역할과 관계없이 **사용자 승인 후에만** 한다. 사용 권리(저작권) 판단은 사용자가 한다.
