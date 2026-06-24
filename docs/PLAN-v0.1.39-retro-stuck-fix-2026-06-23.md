# v0.1.39 구현 페이즈 가이드 — 회고 섹션 "데이터 수집 중" 고착 수정

> 작성일: 2026-06-23
> 근거: 버그 진단 end-to-end 재현(아래 실측) + advisor 교차검증 1회
> 상태: 🔜 계획 확정. 구현 미착수. **배포는 ship 게이트(명시 명령 대기)**

---

## 0. 증상

대시보드 "커밋별 비용 회고"(Cost by Commit, v0.1.37) 섹션이 `데이터 수집 중…`에서 멈춤.

---

## 1. 진단 (실측 재현 — 외삽 아님)

webview 정상(`updateRetroSection`→`GetRetroSummary`→`renderRetro`/`no_retro_data` 분기 OK, renderRetro throw 없음). 문제는 **extension `buildRetroSummary`가 settle 못 함**.

`buildRetroSummary`(`extension.ts:70`)가 회고 요청마다 `~/.claude/projects` 전체 이력을 순회하며 **동기 `spawnSync` git**을 셸아웃:

| 측정 (실제 워크로드 node 재현, 2026-06-23) | 값 |
|---|---|
| **git 워크로드 총 wall-time** | **33,172ms (~33초 동기 호스트 블로킹)** |
| rev-parse 49 cwd | 513ms (저렴, 최대 stall 35ms — **진성 hang 아님**) |
| repo별 git log 7개 | 32,658ms |
| **단일 최악 `git log --name-only --since=180days`** | **codebase-viz 18,355ms** |
| `--name-only` 제거 시 동일 git log | **4.957s → 0.093s (53×↓)** |
| `commit.files` 소비처 | **0건** (CommitAttributor는 timestamp+repo 조인, renderRetro 미표시) |
| `RetroStore.getAll()` 호출처 | **0건 — write-only** |

**근본 원인**: 미사용 `commit.files`를 위한 `--name-only`가 대형 repo에서 거대 출력 생성 → 동기 git이 호스트를 ~33초 블로킹. `updateUsageSection`(`main.ts:657`)이 **PushUsageSummary마다 재요청** + 활성세션 커밋으로 HEAD캐시 무효화 → 33초 빌드 반복 → "계속 멈춤".

**교정(advisor)**: "timeout 없음→영구 hang"은 진단 아님(read-only git, credential 프롬프트 없음, stall 미검출). timeout은 방어보험. **async가 비차단 fix, `--name-only` 드롭이 근본(97% 비용).**

---

## 2. SubTask (순차 의존)

| ST | 내용 | TDD | 파일 |
|---|---|---|---|
| **ST1** | `git log --name-only` 드롭(files 죽은비용). parseGitLog 헤더-only 처리(files=[]). 33초→<1초. CommitMeta.files 정리 | **[TDD]** | `GitLogReader.ts`, `types/index.ts`, `test/unit/GitLogReader.parse.test.ts` |
| **ST2** | GitLogReader 비동기 전환(`spawnSync`→`execFile`+await) + `timeout:5000`. 메서드 4개 Promise화. ⚠️ `RetroPipeline.integration.test.ts` await 파급(green 자동 아님) | ✗ | `GitLogReader.ts`, `test/unit/RetroPipeline.integration.test.ts` |
| **ST3** | `buildRetroSummary` await + 동시빌드 가드 + dirty/디바운스(매-푸시 재빌드 제거) + RetroStore write-only 해소(전체 summary 영속→first-paint 즉시반환 후 백그라운드 재빌드) | ✗ | `extension.ts`, `RetroStore.ts` |
| **ST4** | verify.sh + vitest 회귀 + Playwright(수집중→데이터) | ✗ | 검증 |

**실행 순서**: ST1→ST2→ST3→ST4. 추천 스킬 `/sh-dev-loop --tdd`(강한 순차 의존·verify 루프 빈번).

---

## 3. 설계 결정

- **`--name-only` 드롭 = 근본 fix**(97% 비용). files 미소비 확인됨. parseGitLog는 파일줄 없는 출력에 files=[] 반환(이미 `.slice(1).filter(length>0)` 구조라 호환).
- **async = 비차단**. 잔여 <1초도 호스트 블로킹 회피.
- **timeout 5초 = 보험**(진단 아님).
- **RetroStore first-paint = 크로스세션 헤지**. 단 현재 commits만 영속 → unattributed·totals 없음 → **전체 RetroSummary 영속 필요**.
- 원 "rev-parse 선접기" SubTask **폐기**(513ms뿐, repo 수 안 줄임).

---

> v0.1.37 회고 모듈([[reference_usage_git_retro]]) 후속 P0 수정.
