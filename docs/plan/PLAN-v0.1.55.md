# PLAN — v0.1.55 "신호가 도달하게 만든다" (2026-08-31, braintrust 4렌즈 적대검토로 전면 개정)

## 사용자 요구사항 원문

> .github/workflows/publish.yml는 어떤내용인지?
> 미해결2건은 어떤내용인지? 0.1.55 로드맵으로 배포할 수 있도록하여 wrong extention id까지 같이 수정할 수 있도록해줘

> 근본해결방안이 뭔지 /braintrust 진행하여 최종권고 --> 직접진행

## 확정 제약

- CLAUDE.md §3 CRITICAL 7항 준수
- v0.1.54가 main에 머지·배포 완료. 워킹트리에 v0.2.0 Codex WIP 문서 7개 상존 — **`git add -A` 금지**
- ST1이 사용자 가시 수정이므로 **README 갱신 대상**([[feedback_ship_prerequisite]])
- ship/배포는 사용자 명시 승인 필요([[feedback_ship_gate]])

---

## 1. 근본 원인 (braintrust 4렌즈 종합)

**이 repo의 실패는 "검증기가 없다"가 아니다. 검증기는 있었고 결함도 잡고 있었다** —
`verify-calendar-clip.js`는 v0.1.52부터 결함 A를 매일 잡고 있었다. **실패한 것은 그 신호가
사람에게 도달하는 경로다.**

그리고 신호가 끊기는 방식이 **두 부류**로 갈린다. 이 구분이 처방을 가른다.

| | 거짓 음성 (A·B·C) | 거짓 양성 (D) |
|---|---|---|
| 상태 | 탐지기가 **안 돌았다** | 탐지기가 돌고 **초록을 냈다** |
| 처방 | 배선 | **초록 자체를 막기** |
| 위험 | 결함이 통과 | "검증됐다"는 근거 없는 확신 |

D는 배선으로 안 고쳐진다 — publish.yml을 verify.sh에 넣어도 초록 체크는 그대로다.

### 실측 규모 (4렌즈 교차 확인 — 최초 추정 3개는 과소였다)

`scripts/verify-*` **6개 중 verify.sh 배선은 1개뿐**(배선률 17%).

| 자산 | 배선 | 오늘 실행 결과 | 성격 |
|---|---|---|---|
| `verify-webview-surface.mjs` | ✅ verify.sh:86 | PASS | hermetic |
| `verify-calendar-clip.js` | ❌ | **❌ 2건 FAIL(결함 A 실적발)** | hermetic |
| `verify-sidebar-calendar.js` | ❌ | ✅ 6/6 PASS (3.2s) | hermetic |
| `verify-sidebar-layout.js` | ❌ | ✅ 3/3 PASS (2.2s) | hermetic |
| `verify-real-extension-visual.mjs` | ❌ | 미측정 | **non-hermetic**(실 `~/.claude` + VS Code 1.126.0 **경로 하드코딩**) |
| `verify-retro-e2e.ts` | ❌ | 실행 불가(TS 러너 없음) | **non-hermetic**, 참조 0 = 고아 |
| `npm run test:integration` | ❌ | **❌ `vscode-test: not found` (exit 127)** | 3.5개월 무실행 |

> **반증된 전제**: "미배선 = 반드시 썩는다"는 **거짓**이다 — 미배선 4개 중 2개는 지금도 그린이다.
> 따라서 근본해결안의 논거를 "부패 방지"로 쓰면 안 된다. 정확한 논거는 **"신호 가시성"**이다
> (calendar-clip은 3릴리즈 내내 red였고 아무도 몰랐다).

---

## 2. 최종권고 — "신호가 반드시 도달한다" 3층

| 층 | 무엇을 막나 | 구현 |
|---|---|---|
| **① 자산 층** (메타 게이트) | 새 검증 자산이 **잊히는 것** | `scripts/verify-*` 전부가 헤더에 `// verify-gate: <티어> — <사유>` 선언. 미선언·사유없는 skip·선언했는데 verify.sh에 호출 없음 → **fail** |
| **② 실행 층** (실행가능 스모크) | 이미 **죽어 있는 것** | 선언된 자산이 실제 호출 가능한지(exit 127·모듈 부재) 확인. ①로는 안 잡히는 `test:integration`류를 잡음 |
| **③ 신호 층** (허위 성공 차단) | **초록인데 아무것도 안 함** | 하네스별 D-0 이식(검사 0건·골든 null이면 fail) · 골든 자유 재캡처 차단 · publish.yml **job-level `if`** |

**왜 이게 근본인가**: 조항은 **사건 기반**이라 한 번 놓치면 영구히 놓친다(실측: 5개가 그렇게 남았다).
게이트는 **상태 기반**이라 놓친 것이 다음 실행에서 다시 잡힌다. 같은 repo의 실증 —
D-1이 조항이던 시절 드리프트 122건, 게이트가 된 뒤 0건.

### 렌즈 간 충돌 판정 (근거로 가름, 기록 보존)

- **B 처방: 계산식 교체 ❌ → 7-seed 시계 고정 ✅.** 계산식(`ceil((371+isoDow)/7)`)은 하네스가
  프로덕션과 **같은 식**을 쓰므로 프로덕션이 틀려도 같이 틀려 통과한다(동어반복). 정합성 렌즈의
  "freeze는 신규 메커니즘·중복" 반론은 실측으로 무너졌다 — `test/unit/calendarView.test.ts:46-68`이
  **이미 고정 날짜 7개를 순회**한다. "특정 날짜에서만 통과" 우려는 7-seed 전수 스윕이 해소한다.
- **예외 등록 위치: verify.sh 본문 주석 ❌ → 스크립트 헤더 마커 ✅.** 셋 다 "별도 allowlist 파일 금지"
  만장일치. 정합성 렌즈 자신의 기준("예외는 위반 지점에 물리적으로 붙어야 한다")으로 판정하면
  헤더 마커가 이긴다 — verify.sh 본문 주석은 스크립트가 지워져도 남아 드리프트한다.
- **메타 게이트 탐지 대상: 미배선 vs 실행불가 → 둘 다(상보적).** `test:integration`은 미배선 탐지로
  **안 잡히고**(package.json에 있다) 실행 스모크로만 잡힌다. 반대로 새 스크립트는 실행은 되지만 잊힌다.
- **D 처방: (c)"skip을 로그로 알림" → 부족. job-level `if`로 강화.** skip된 step은 **여전히 job을
  초록으로 만든다.** 로그 한 줄은 아무도 안 읽는다(3.5개월간 `test:integration`을 아무도 안 읽은 것과
  같은 이유). 시크릿이 없으면 job이 **아예 생성되지 않게** 한다 — 존재하지 않는 job은 초록을 주장하지 않는다.

### 만장일치 경보 점검

4렌즈가 "미배선이 근본"으로 수렴하지 **않았다** — 실측 렌즈가 정면 반박했고 그 반박이 처방을 바꿨다
(②층이 거기서 나왔다). diversity가 작동했다고 판정한다.

---

## 3. SubTask

### ST1 `[TDD]` — 결함 A 수정 (제품, 사용자 가시) · **양 표면**

**A-1 대시보드** (`panelView.ts:465-466, :482`) — 자기영속 루프다. 단순 rAF로는 안 끝난다.

```
1차 렌더: prevArea 없음 → scrollLeft = scrollWidth → 130으로 클램프(그 시점 clientWidth 626)
2차 렌더: 130 < 182-2=180 → "사용자가 과거로 스크롤했다"고 오판 → prevScrollLeft=130 보존
        → 이후 영원히 130 고정
```

- **비협상**: "우측 끝에 있었나"를 **측정 좌표로 역추론하지 마라**. 직전 렌더의 **의도를 기억하는
  모듈 스코프 플래그**로 판정한다. 좌표 역추론이 클램프된 잘못된 값을 "의도적 과거 탐색"으로
  재해석하는 것이 이 결함의 영속 메커니즘이다.
- **비협상**: "과거 탐색 위치가 재푸시에도 보존됨"(v0.1.52 scope-critic 회귀 잠금)을 깨면 안 된다.
- `retainContextWhenHidden: true`(`DashboardPanel.ts:30`)에서 **숨겨진 패널은 rAF가 지연·미발화**할 수
  있다 → rAF 단독 금지. 폭 확정 시점을 직접 관측하는 수단(`ResizeObserver`)을 병행하고, 우측 끝 고정을
  **1회 이벤트가 아니라 조건 만족 시까지 유지되는 계약**으로 구현한다.
- 영향 경계 실측: **뷰포트 ~750px 미만**에서만 발현(그 이상은 max ≤ 130이라 클램프값이 우연히 최대치와
  일치해 자연 은폐). v0.1.52부터 안 띈 이유가 이것이다.

**A-2 사이드바** (`sidebarView.ts:513-525`) — **스크롤 정렬 코드가 아예 없다**(grep 히트 0).

| 사이드바 폭 | clientW | scrollW | scrollLeft | today 보임 |
|---|---|---|---|---|
| 180px | 120 | 196 | 0 | **❌** |
| 220px | 160 | 196 | 0 | **❌** |
| 300px / 420px | 196 | 196 | 0 | ✅ |

좁은 사이드바에서 **과거(왼쪽 끝)만 보이고 오늘이 잘린다.** 기존 검증기 2개 모두 "오버플로가 존재하는가"만
단언하고 **"오늘이 보이는가"는 단언하지 않아** 통과했다.

### ST2 — 결함 B 수정 + 하네스 강화 (`verify-calendar-clip.js`)

- **`page.clock.setFixedTime()` 7-seed 스윕**(pad 0~6 전수). playwright-core 1.61.1 동작 실측 확인.
  **프로덕션 훅 비용 0** — `panelView.ts:476`/`sidebarView.ts:518`의 `new Date()`를 건드리지 않는다.
- 기대 열 수는 **seed 날짜에서 독립 유도**한다. **DOM 측정값(`colPitch`)에서 유도 금지** — 그리드가
  stretch돼도 pitch가 같이 커져 항상 참이 되고, v0.1.52의 704px 드리프트를 다시 놓친다.
- **"오늘 셀 가시성" 단언 추가**(대시보드·사이드바 양쪽) — ST1 회귀 잠금. 자연 발생에 기대지 말고
  **렌더 도중 컨테이너 폭이 줄어드는 조건을 명시적으로 만들어** 단언한다.
- **검사 건수 바닥**(D-0 이식): `checks.length` 하한 미달 시 fail. 현재 `pass=true` 초기값이라
  검사 0건이면 초록이다.

### ST3 — ① 자산 층: 메타 게이트

- 모든 `scripts/verify-*` 헤더에 `// verify-gate: <full|no-build|skip(<사유코드>)> — <사유 문자열>`
- 사유코드 3종: `non-hermetic` / `permanent-red` / `manual-only`
- verify.sh 판정: 미선언 → fail · 사유 문자열 없는 skip → fail · 선언했는데 `node scripts/<name>` 호출
  없음 → fail
- **위치**: D-0 옆(`--ts-only` **이전**). 파일명 grep이라 비용 ≈0이고, 새 스크립트를 만든 직후 가장 싼
  티어에서 즉시 걸려야 한다
- **자기매칭 함정**: 배선 확인을 `grep -q "$base" verify.sh`로 쓰면 루프 자신·에러 메시지가 매칭돼
  **항상 통과**한다. `node +scripts/$base` 패턴이어야 실제 호출문만 잡는다
- **별도 allowlist 파일 금지** — 파일과 등록부가 떨어지면 드리프트한다(v0.1.53에서 DESIGN-TOKENS.md가
  22 vs 69로 벌어졌던 그 실패)

### ST4 — ② 실행 층: 실행가능 스모크

- `package.json`의 `test:*` 및 선언된 `scripts/verify-*`가 **호출 가능한지** 확인(exit 127·모듈 부재).
- `test:integration`이 여기서 **red로 뜨는 것이 정상이자 이 층의 존재 증명**이다.
  → **`test:integration` 부활은 v0.1.55 범위 밖**(아래 §4). 이 게이트는 그것이 잊히지 않게 붙잡는 역할.
- 죽은 자산을 red로 두고 릴리즈할 수 없으므로, **선언 단계에서 처분**한다:
  `verify-retro-e2e.ts`(참조 0 고아) → **삭제** · `verify-real-extension-visual.mjs` → `skip(manual-only)`
  + VS Code 버전 **하드코딩(1.126.0)을 글롭으로 교체**(`.vscode-test/`에 1.135.0도 있어 1.126.0 정리 시
  조용히 죽는다) · `test:integration` → 스모크 예외로 명시 등재 + 별건 이관

### ST5 — ③ 신호 층: 허위 성공 차단

- **골든 D-0 이식**(`verify-webview-surface.mjs`): `diffDigests` 진입 전에 골든의 감시 id 수가 현재
  `PANEL_IDS`/`SIDEBAR_IDS` 길이와 같은지 + null id 0건인지 검사. **현재 `:69` 주석이 "커버리지 붕괴
  방지"를 주장하는데 그 코드는 존재하지 않는다**(없는 보호를 주장하는 주석). 순회 대상이 골든이라
  골든이 `{}`여도 diff 0건 = 초록이다.
- **골든 자유 재캡처 차단**: 기존 골든이 있으면 `--capture` 단독 실행을 거부하고
  `--accept-regression "<사유>"`를 요구. 실패 메시지의 *"--capture로 생성하세요"* 문구 제거(재캡처를
  직접 지시하고 있다). 골든에 `capturedAt`/`reason` 기록.
- **`publish.yml`**: publish를 **별도 job**으로 분리하고 `if: ${{ secrets.VSCE_PAT != '' }}`를
  **job 레벨**에 건다. 시크릿이 없으면 job이 생성되지 않는다. (기존 step-level `env` 참조는 애초에
  동작하지 않는 결함 — step의 `if`는 그 step의 `env`가 적용되기 전에 평가된다.)

### ST6 — 배선

- `verify-calendar-clip.js` · `verify-sidebar-calendar.js` · `verify-sidebar-layout.js`를
  `verify.sh --full`에 배선. 실측 비용 **+17.4초(56→73.4초, +31%)** — 이미 배선된
  `verify-webview-surface.mjs` 하나가 16.8초이므로 이 repo는 같은 크기를 이미 지불하고 있다.
- **새 `--gate` 티어를 만들지 않는다** — 티어를 늘리면 "어느 티어에 넣을까"라는 새 판단 지점이 생기고,
  그 판단이 곧 이번 미배선 사태의 재발 경로다. 선택지를 줄이는 게 처방이다.

### ST7 — 릴리즈 메타

`package.json`/`package-lock.json` 0.1.54→0.1.55 · `CHANGELOG.md` · **README "What's New"**(ST1이
사용자 가시) · v0.1.54 CHANGELOG Known Issues의 잘못된 원인 기술을 v0.1.55 항목에서 정정.

---

## 4. 범위 밖 — 의도적 분리

- **`test:integration` 부활** — 3겹 결함(`@vscode/test-cli` 미설치 + `.vscode-test.*` 설정 부재 +
  extension ID 오류). **도입(2026-05-10 v0.0.1) 이래 3.5개월·약 50릴리즈 동안 단 한 번도 통과한 적이
  없다**(`git log -S'"test:integration"'`가 스캐폴드 커밋 하나만 반환). ID만 고치면 여전히
  `not found`로 끝난다 — "죽은 스크립트를 죽은 채로 두는 수정"이다.
  **분리 근거**: 작업 성격이 다르고(러너 도입 + 설정 작성 + 최초 통과 기준선 수립), 3.5개월 죽어 있었으니
  하루 더 죽어도 된다. **ST1(사용자 가시 버그)을 이것 때문에 늦추지 않는다.**
  **잊히지 않는 보증**: ST4(②층)가 이것을 명시 예외로 등재하고, 등재 자체가 verify.sh 출력에 매번 뜬다.
- **`panelCharts.ts` 2차 분리** — v0.1.54에서 연기된 항목, 그대로 유지.

## 5. 완료 게이트

- `bash verify.sh --full` FAIL=0 (ST6 배선 반영 후 = calendar-clip 전 케이스 그린)
- ST2의 7-seed 스윕이 **pad=0 케이스(53주)를 실제로 통과**하는지 확인 — 1/7 확률 결함을 결정론으로 전환
- 실 Xvfb EDH에서 **좁은 대시보드(≤700px)와 좁은 사이드바(≤220px)** 둘 다 오늘 셀이 보이는지 육안
- 메타 게이트를 **일부러 깨서**(마커 제거) fail하는지 negative test 1회
- 커밋·배포는 사용자 명시 승인 필요

## 6. 부수 발견 (범위 밖, footnote)

- `verify-sidebar-calendar.js:15`의 `// SIDEBAR_CALENDAR_WINDOW_DAYS(main.ts)와 동일하게 유지` 주석이
  **이미 stale** — 상수는 v0.1.54에서 `webviewShared.ts:103`으로 이동했다. 산문 동기화의 실패 사례.
- VSIX에 소스맵 2개 포함(`.vscodeignore` last-match-wins). 시크릿·절대경로 0건이라 무해.
- `docs/demo/panel.html`이 실 IDE 폭을 고정값으로 흉내내 harness가 `html,body{width:100%}`를 주입해 푼다.

---

## 7. 실행 결과 (2026-08-31 — advisor 검토 반영분 포함)

전 SubTask 구현·검증 완료(커밋 전). `verify.sh --full` **PASS=28 / FAIL=0**(v0.1.54의 23에서 +5).

| 게이트 | 결과 |
|---|---|
| `verify.sh --full` | PASS=28 / FAIL=0 |
| `verify-calendar-clip.js` | **59/0** (7-seed 스윕 + 결함 A 회귀 잠금 4건 포함) |
| `verify-sidebar-calendar.js` | 8/0 (조임 후) |
| 골든 DOM digest | diff 0 / 8조합 |
| negative test | **7종 전부 fail 확인** (마커제거 · 사유없는skip · 미호출 · 골든붕괴 · 예외등재제거 · RO비활성×2) |
| 실 Xvfb EDH | 사이드바 실데이터 정상, Usage Calendar 오늘 셀 가시 |

### 계획 대비 정정 (실행 중 발견)

- **`publish.yml`: job-level `if`에서 `secrets` 컨텍스트를 쓸 수 없다.** 렌즈 권고
  (`if: ${{ secrets.VSCE_PAT != '' }}`를 job에 건다)를 그대로 쓰면 조건이 **항상 거짓**이 되어
  같은 부류의 새 결함이 된다(github·needs·vars·inputs만 가능). → probe step이 output으로
  내보내고 publish job이 `needs.package.outputs.can_publish`로 받는다. step-level `if`는
  secrets를 볼 수 있으므로 마켓별 분기는 거기서 한다.
- **실행 스모크 1차 구현이 정작 `test:integration`을 못 잡았다.** `test:unit`/`test:e2e` 존재
  여부만 봤기 때문. → 모든 `test:*`의 **첫 명령어가 해석 가능한지**(`node_modules/.bin` 또는
  PATH) 검사로 재작성. 실제로 돌리지 않는다 — 건강한 스크립트는 수십 초라 스모크가 될 수 없다.
- **`verify-sidebar-calendar.js`를 그대로 배선하면 정작 결함 A-2를 못 잡는다**(advisor 지적).
  `todayMarker`가 **DOM 존재** 단언이라 오늘이 잘려도 참이고, 셀 수도 `90~96` 느슨한 범위였다.
  → 시계 고정 + 셀 수 정확값 + **`todayVisible`** 추가.
- **`calendarScroll.ts` 주석이 검증 안 된 보호를 주장하고 있었다**(advisor 지적) — 숨김 패널
  경로를 ResizeObserver가 덮는다고 적었으나 회귀 잠금은 *보이는* 페이지의 축소만 봤다.
  → `display:none` 상태 재렌더 → 복원 케이스를 하네스에 추가하고, RO를 끄면 실패하는 것까지
  확인해 주석에 근거를 명시. *검증 안 된 보호를 주석으로 주장하는 것이 이 릴리즈가 고친
  실패 부류(`verify-webview-surface.mjs:69`)와 정확히 같다.*

### 완료 게이트 대비 — 미충족 1건 (정직 고지)

- **"실 Xvfb EDH에서 좁은 대시보드(≤700px)·좁은 사이드바(≤220px) 육안"** — **미충족.**
  실 EDH는 **기본 폭에서만** 확인했다(사이드바 실데이터 정상, Usage Calendar 오늘 셀 가시).
  좁은 폭 재현을 2회 시도했으나 ①1차: 웹뷰가 중첩 iframe·별도 origin이라 DOM 순회로 도달 실패
  ②2차: `page.frames()`로 고쳤으나 EDH 기동+뷰 오픈+측정이 280s 예산을 초과.
  **대체 근거**: 헤드리스 하네스가 사이드바 180/220/300/420px에서 `scrollLeft === max` +
  `todayVisible`을 **결정론적으로 단언**하며, 이는 육안보다 강한 판정이다. 다만 "실 익스텐션
  호스트에서도 같은가"는 **좁은 폭에 한해 미검증 상태로 남는다.**

---

# 추가 요구 (2026-09-02) — ST8~ST11

사용자 요구 원문:

> 1. 최근편집파일, 최근세션 등 섹션 행수 상한이없음. 최대 행수상한을 두고 넘어갈경우 더보기 등 expand로 펼칠 수 있도록 개선
> 2. 모델별분석 내용이 아얘오탐임. (회사환경 sonnet만 사용중이고 opus는 거의사용안햇는데 opus 100%로 되어잇고 사용량도 실제사용량대비 100분의1정도로 계측됨)
> 3. 커밋회고기록이 내가 작업한게 아닌 대상들까지 모두계측됨. ide에 git이 연동되어잇으면 브랜치정보도 받아와지는데 해당 브랜치 기준 작업된 파일을 바라볼 수 있도록

## 요구2의 확정된 근본 원인 (실측)

`src/utils/pricing.ts`의 `PRICING`에 **현행 세대 모델이 하나도 없다** — 최신 키가 `claude-opus-4-8`·`claude-sonnet-4-6`이고,
실제 jsonl이 기록하는 `claude-opus-5`·`claude-sonnet-5`·`claude-opus-5[1m]`은 전부 미등재다.

`findPricing`의 3단 폴백이 **전부 빗나간다**:
1. 정확매칭 ✗
2. 최장접두사 — `'claude-opus-5'.startsWith('claude-opus-4-8')` = false ✗
3. 패밀리 폴백 — family를 **첫 3세그먼트**로 잘라 `'claude-opus-5'` 자신이 되고, 이걸 접두사로 갖는 키가 없다 ✗
   → 폴백이 설계 의도(미지의 신모델을 근사 과금)와 달리 **구조적으로 절대 발화하지 않는다.**

결과 `calcCost` → `return 0`. 실측(사용자 실데이터 44,279 레코드, dedup 후):

- 2026-09-01 UTC: sonnet-5가 토큰의 97%인데 `today.costUsd = $0.00`, `modelBreakdown` 전원 `share = 0.0%`
- `share`는 **비용 기준**(`v.costUsd / totalCost`)이고 정렬도 비용 내림차순 → 가격표에 남아있는 레거시 모델
  (haiku-4-5 / opus-4-8 / fable-5) 한 건이라도 섞이면 **그 모델이 100%를 독식**하고, 총비용은 실제의 1~2%가 된다.
  → 사용자가 본 "opus 100% + 사용량 1/100"의 기전. **단, "100%"는 가격표에 남은 레거시 모델이
  1건이라도 섞였을 때** 나온다 — 전 모델이 미가격이면 share는 전부 0%로 찍힌다. 어느 쪽이든
  총액이 실제의 1~2%가 되는 부분은 동일하며, 이 repo 실데이터로 재현했다($0.00 / 전원 0.0%).

### 가격은 추측하지 않는다 — 벤더 오라클에서 역산

Claude Code CLI가 jsonl에 `{"type":"cost-state", ..., "modelUsage":{"<model>":{...,"costUSD":N}}}`를 쓴다.
이게 **벤더 자신의 과금 정답지**다. 후보 가격벡터를 넣고 캐시생성 5m/1h 배분 불확실성을 밴드로 처리해
실측 샘플이 밴드 안에 드는지 검사했다(대조군 = 정답을 아는 haiku-4-5):

| 모델 | 채택 | 검증 | 반증된 후보 |
|---|---|---|---|
| `claude-opus-5` | **$5 / $25**, cache_read 0.5 | 10/10 샘플 이탈 0.0% | $15/$75 → −66% |
| `claude-opus-5[1m]` | 동일 ($5/$25) — 1m 프리미엄 **없음** | 11/11 이탈 0.0% | $7.5/$37.5 → −33% |
| `claude-sonnet-5` | **$2 / $10**, cache_read 0.2 | 7/7 이탈 0.0% | $3/$15 → −25~33% |

Sonnet 5는 Sonnet 4.x($3/$15)보다 **싸다**. 4.x 값을 관성으로 복사하면 50% 과대계상이 된다.

## SubTask

- **ST8 [TDD] 가격 정확성 + 무성 0 제거** → `src/utils/pricing.ts` · `pricing/litellm-snapshot.json` · `test/unit/pricing.test.ts`
  - opus-5·sonnet-5 등재(위 실측값). `[1m]` 접미사는 최장접두사 매칭으로 자동 흡수됨을 테스트로 박제.
  - 패밀리 폴백을 첫 **2세그먼트**로 고쳐 실제 발화하게 한다. 단 폴백은 근사이므로 출처를 반환한다:
    `resolvePricing(model) → { price, source: 'exact' | 'family' | 'none' }`.
  - **이중 소스 드리프트 차단**: `PRICING`과 `litellm-snapshot.json`이 어긋나면 실패하는 테스트.
    (현재 snapshot은 코드가 읽지도 않는 장식이라 조용히 낡을 수 있다.)
  - **벤더 오라클 회귀 테스트**: 실측 cost-state 샘플을 픽스처로 박제하고 계산비용이 밴드 안인지 단언.
    가격이 바뀌거나 신모델이 나오면 이 테스트가 빨개진다.
- **ST9 [TDD] 모델별 분석 신호 정직성** → `src/services/UsageAggregator.ts` · `src/types/index.ts` · `panelView.ts` · `sidebarView.ts`
  - `ModelBreakdown`에 `pricingSource` 추가. `UsageSummary.unpricedModels: string[]`.
  - 총비용 0이면 `share`를 **토큰 기준**으로 폴백하고 `shareBasis`를 함께 노출 — 0%짜리 막대를 진실인 양 그리지 않는다.
  - 사이드바 topModel도 비용 0일 때 토큰 최다 모델을 고른다.
  - 미가격 모델이 있으면 카드에 경고를 띄운다(무성 0 금지 — v0.1.55의 거짓초록 부류와 동일 처방).
- **ST10 최근 편집 파일·최근 세션 행 상한 + 더보기** → `panelView.ts` · `i18n.ts` · `styles.css`
  - 기본 6행, 초과분은 접고 `더보기 (+N)` / `접기` 토글. 상태는 모듈 변수로 재렌더에 보존.
- **ST11 [TDD] 회고 커밋 스코핑** → `src/services/GitLogReader.ts` · `package.json`(설정) · `extension.ts`
  - `git log`가 무필터라 **동료 커밋까지 후보가 되고**, 근사조인이 사용자 사용량을 남의 커밋에 귀속시킨다.
  - `git config user.email` 기준 `--author` 필터 + 현재 브랜치(HEAD) 도달 커밋으로 스코핑.
  - 설정 `claudeCodeGauge.retroCommitScope: "mine" | "all"` (기본 `mine`).
  - disclaimer에 적용 스코프를 명시. 설정 변경은 `onDidChangeConfiguration`으로 즉시 재빌드한다
    (안 하면 retroDirty가 안 서서 설정이 다음 jsonl 변경까지 무동작 — 무성 실패).
  - ⚠️ **부작용을 "미귀속 버킷 증가"로 적었던 것은 틀렸다**(advisor 지적, 2026-09-02).
    `CommitAttributor`의 미귀속 `post` 사유는 *마지막 커밋 이후* 레코드만 잡는다. 동료 커밋이
    후보에서 빠지면 그 구간 레코드는 미귀속이 아니라 **"내 다음 커밋"으로 흘러가** 커밋당
    recordCount가 늘어난다. 그런데 `confidenceOf`는 recordCount≥5를 'high'로 본다 — 즉 시간
    윈도가 넓어져 **정밀도가 떨어질수록 신뢰도 표시가 올라간다.** 이 릴리스가 잡는 부류와 같은
    형태의 역전이나, 신뢰도 산식 교체는 이번 범위 밖으로 두고 Known Issues에 적는다.

## 착수 후 확정된 사항 (advisor 검토 반영, 2026-09-02)

- **CacheStore.merge()는 덮어쓰기다** — 가격 수정 후 재집계해도 이중계상은 없다. 다만 jsonl
  회전(~30일) 이전 날짜는 `costUsd=0`인 채 globalStorage에 남고 **재계산이 불가능**하다
  (DailyUsage에 모델 분해가 없다). 지우면 정상인 토큰 수까지 잃는다. → 지우지 않고, 장기 트렌드
  카드에 "비용 미상 일자 N일" note를 띄운다. 같은 이유로 `hasData` 판정을 비용에서 **토큰**으로
  바꿨다 — 비용 기준이면 그 구간이 통째로 "데이터 없음"이 되어 관측된 사용량이 화면에서 사라진다.
- **ST9의 폴백 트리거를 `totalCost === 0`에서 `pricingSource==='none' && tokens>0`로 교정.**
  실제 사고 상황은 미가격+가격 모델 혼재라 totalCost > 0이고, 원래 조건은 **발화하지 않는다.**
  opus-5·sonnet-5를 등재하면 이번 인스턴스는 사라지지만 다음 신모델에서 그대로 재발한다.
  (negative test로 확인: 옛 조건으로 되돌리면 해당 테스트만 실패)
- **웹검색 과금 $0.01/요청을 범위에 포함.** 원래 제외였으나, 오라클 밴드를 벗어나던 haiku 4건의
  초과분이 요청수 × $0.01과 **센트까지 일치**해 추정이 아니라 실측이 됐다. 이걸 빼면 웹검색 샘플을
  픽스처에서 골라내야 하는데, 그건 다음 사람이 밴드를 넓혀 통과시키는 경로를 만든다.
- **ST11의 브랜치 스코핑은 신규가 아니다.** 인자 없는 `git log`가 이미 HEAD 도달 커밋만 본다.
  새로 붙인 것은 **작성자 스코핑**이다. 사용자 원문의 "브랜치 기준 작업된 **파일**"을 파일 목록
  요구로 읽을 여지가 있으나, `--name-only`는 v0.1.39에 33초 블로킹의 97% 원인으로 의도적으로
  제거된 경로라 **커밋 스코핑으로 해석**했다.
- **`user.email` 미설정 시 `--author`를 걸지 않는다.** 빈 패턴은 전부 매칭이라 "거는 시늉"이
  곧 무성 실패다. 대신 `CommitScopeInfo.degraded`로 강등을 UI에 표시한다.
- **`--author`는 정규식이므로 이메일 메타문자를 이스케이프한다** (`user+tag@` 케이스).

## 벤더 오라클의 유효 범위 (정직 고지)

세션 총액(`cost-state.totalCostUSD`) 대비 우리 합계는 −20.6% 편차가 났고 세션별로는 −49%~+1980%로
흩어졌다. **이건 가격 오차가 아니라 대조 방법의 한계다** — `cost-state`는 세션 도중 스냅샷이라
레코드보다 뒤처진다(실측: 벤더 outputTokens 4,203 vs 실제 141,885인 세션). 토큰 수 자체가 30건 중
26건 불일치했다.

유효한 것은 **같은 스냅샷 행 안의 토큰↔비용 자기정합성**이며(픽스처 테스트가 쓰는 것), 거기서는
38샘플 전부 밴드 안이다. 즉 **요율표가 벤더와 같다는 것은 증명됐고, 우리 레코드 집합이 CLI의
세션 회계와 같다는 것은 증명되지 않았다**(dedup 의미론·재개 세션·사이드체인 귀속 — 별건).

## 제외 (이번 범위 아님)

- `today`의 UTC 일 경계 → 로컬 일 경계 전환. 별개 결함이며 캘린더·7일 차트·CacheStore 키까지 전부 흔든다.
- 레코드 집합 vs CLI 세션 회계 불일치(위 §벤더 오라클의 유효 범위). 별건이며 dedup 의미론까지 건드린다.
