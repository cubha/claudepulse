# PLAN v0.2.0 — 범용화 + Codex 계측 (재작성 2026-09-19)

> ⚠️ **이 문서가 기준선이다.** `docs/PLAN-v0.2.0-codex-provider-2026-06-16.md`는 2026-06 작성본이며
> 2026-09-19 사전점검·리서치로 **전제 다수가 반증됐다**. 그 문서를 기준으로 판정하면 이번 구현이
> 통째로 "미요청 추가"로, 폐기된 항목이 "누락"으로 찍힌다. 아래 §2에 기각 내역을 사유와 함께 남긴다.

---

## 1. 사용자 요구사항 (원문)

> "020까지 bump가 많으니 디자인개선 + codex --> 마켓명변경 전부일괄반영할거야. codex 전건 진행하기위해 우선 사전점검 및 추가리서치 진행해"

> "그럼 Claude 사용자(Codex미설치)인 사람이 Codex탭으로 전환하는 Case랑 Codex Free <-> 유료Plan 사용자 차이가 어떻게되는지 보여줘. (미설치인 사람은 로그인세션이 없을테니 로그인이 출력되는게 맞을거같긴함. Free 플랜사용자와 유료Plan사용자는 레이아웃이나 구성의 차이없이 Plan 뱃지와 Free플랜 사용자는 확인안되는 부분들 비활성화되면 될듯)"

> "미설치 전환 케이스 --> 니가말한게 맞는데 Claude도 그렇게되어있어? Claude도 그렇게안되있으면 동일하게 맞출 수 있도록 최종결정에 반영"

> "아티팩트는 승인. 현재 디자인 토큰은 Claude기준이니 CODEX기준 디자인토큰 미리 잡아두고 테마 전환시 색상도 변환되도록 설계까지하고 0.2.0v구현 진행"

**확정 범위**: v0.2.0 = 디자인개편(완료·미커밋) + 리브랜딩 L0(완료·미커밋) + **Codex 본작업(이번 구현)** 단일 번들.
**시각 기준선**: 승인된 시안 캔버스 `https://claude.ai/artifact/QWEJLYwwivT9KSFRgMMxdh` (9보드).

---

## 2. 🔴 2026-06 PLAN에서 기각·변경된 전제 (삭제 아님 — 판정용 기록)

| 구 전제 | 처분 | 사유(실측·1차 소스) |
|---|---|---|
| "Codex는 rate limit 소스 없음 → 게이지 불가" | **기각** | rollout `token_count.rate_limits{used_percent, window_minutes, resets_at}` 실물 확인(D1) |
| **ST6.5 "burn-rate로 게이지 대체"** | **존재 이유 소멸 → 축소** | 위 반전. burn-rate는 `rate_limits` 부재 세션의 폴백으로만 남는다 |
| "토큰은 누적차분 역산 필요" | **기각** | `TokenUsageRecord.usage`가 응답 단위 증분(D7, 공식 테스트 + 실물 2건 검산) |
| "토큰은 `event_msg[token_count]`만 읽으면 됨" | **기각** | 경로 2개 공존, 합산 시 2배 중복(D6). `token_usage_record` 우선 |
| "`token_count.total_token_usage`가 누적 진실원" | **기각** | 새 턴에서 `fill_to_context_window`가 덮어써 리셋됨(D8, 실물 194,653 vs 36,254) |
| "dedup은 (timestamp,input,output) 3중키" | **대체** | 누적쌍 비교 규칙(D4). 단조증가 검사는 compaction에서 틀림 |
| "`codex exec`는 미기록" | **기각** | 실측 정상 기록(D10-1) |
| ST6 작업지점 = `main.ts` | **변경** | R2가 27줄 dispatch로 분할. 실 지점 `panelView.ts`·`sidebarView.ts`·`webviewShared.ts` |
| "ST6.5 burn-rate 신규 구현" | **변경** | `burnRate.ts` 이미 존재. 입력을 utilization%→토큰량으로 바꾸는 **재작성** |

---

## 3. 확정 사실 (구현이 의존하는 계약)

- **토큰**: `"type":"token_usage_record"` → `usage`(증분) / `turn_token_usage`(턴 누적, turn_id 바뀌면 0) / `thread_token_usage`(스레드 누적). 누적 필드 합산 금지(3.7× 과대). 구버전(<0.154)은 `token_count` 폴백.
- **산술**: `total = input + output` · `cached_input ⊂ input` · `reasoning_output ⊂ output` · 비캐시 input = input − cached.
- **한도**: `rate_limits.primary/secondary` — **버킷 개수·기간 가변**(free=43200분 1칸·secondary null / 유료=300+10080). `plan_type`은 enum 16변종 + `serde(other)` 폴백 → **문자열 하드코딩 분기 금지**.
- **git**: `session_meta.git{commit_hash, branch, repository_url}` 전부 Option. non-git=키 부재 / **detached HEAD=branch만 null** / git 미설치·5s 타임아웃=전체 null / origin 없음=repository_url만 null.
- **경로**: `~/.codex/sessions/YYYY/MM/DD/` (**depth 3+**) + `.zst` 압축본 + `archived_sessions/`. `.jsonl` 글롭만 쓰면 7일 이전 소실.
- **`session_meta.source`는 문자열 또는 객체**(`{subagent:{thread_spawn:{...}}}`) — 문자열 전용 역직렬화는 서브에이전트 파일에서 깨진다.
- **컨텍스트**: `token_count.info.model_context_window`(실측 258,400). ⚠️ `session_meta.context_window`는 `{window_id}`로 **토큰 창이 아니다**.

---

## 4. 🔴 선행조건 (SubTask보다 먼저 — 순서 역전 금지)

**P-1. fixture repo 반입.** 유일한 실물이 `~/.codex/sessions/`에 있다(repo 밖·정리 대상). `test/fixtures/codex/`로 복사하고 **"free·exec·1턴·cli 0.155.1"** 성격을 파일 옆에 명시. 유료 2버킷·다턴 `turn_token_usage` 리셋은 **소스 확정 기반 합성**으로 만들고 합성임을 표기.

> ✅ 완료 + **범위 결정(2026-09-19)**: `.zst` 압축본·`archived_sessions/`는 **이번 v0.2.0 범위에서 제외**한다.
> 이유는 미확인이 아니라 검증 불가 — 이 개발 머신의 실 `~/.codex/sessions/`에 `.zst`/`archived_sessions`
> 샘플이 하나도 없어(단일 미압축 rollout뿐) 왕복검산할 실물이 없다. 압축해제 라이브러리(zstd, 신규
> 의존성 — CLAUDE.md §2 스택 변경 승인 필요)를 추측 구현하는 것보다, `CodexSource.listRolloutFiles`가
> `.jsonl`만 수집하고 `.zst`/`archived_sessions/`는 건너뛴다는 **정직한 gap**으로 남긴다(§"미완성 구현
> 금지"). 재개 조건: 실 `.zst` 샘플 확보(장기 보관 사용자 머신) 또는 사용자 승인 하 zstd 의존성 추가.

**P-2. 골든 하네스 provider 축.** `verify-webview-surface.mjs`가 PANEL_IDS 47개 전부 렌더를 단언하고 미렌더(null)를 fail로 올린다. ST6의 "빈 섹션 숨김"이 정확히 그 null을 만든다. 8조합이 전부 Claude 전제 → **provider 축 추가가 ST6의 선행조건**. 순서를 뒤집으면 게이트가 빨개지고 "재캡처 사유"로 넘기고 싶어진다 = 허위성공 차단 규약이 무너지는 지점.

**P-3. `JsonlParser.ts:117 if (!messageId) return;`.** message.id 없는 레코드를 전량 드랍 → **Codex 레코드 0건**. `SessionRecord.messageId`를 provider별 합성키로 바꾸는 타입 계약 변경이 D4 dedup의 전제.

> ✅ **완료(2026-09-19), 단 `JsonlParser.ts`는 의도적으로 무변경**. 이 줄의 위험은 "Codex 레코드가
> 이 파일을 지나가면서 드랍된다"는 전제였는데, `JsonlParser.readFrom`은 106행에서
> `entry['type'] !== 'assistant'`가 아니면 즉시 return한다 — Codex rollout 라인은애초에 이 타입이
> 아니므로 117행에 도달하지 않는다(Codex는 `JsonlParser`를 전혀 거치지 않고 `CodexSource`가
> 별도 경로로 변환한다). 실제 구현 지점은 `src/sources/recordKey.ts`(`makeRecordKey`/
> `synthesizeRecordKey`)와 `src/sources/codex/CodexSource.ts`(`rolloutLinesToSessionRecords`)다.
> `JsonlParser.ts`를 건드리지 않은 게 §3 CRITICAL(Claude 경로 무행위변경) 준수이지 미이행이 아니다
> — acceptance-critic이 이 표만 보고 "JsonlParser 미수정=MISSING"으로 오판하지 않도록 여기 기록.

---

## 5. 디자인 토큰 설계 (게이트 파싱 실측 기반)

### 게이트가 실제로 하는 일
| 게이트 | 파싱 | `.provider-*` 블록 영향 |
|---|---|---|
| D-0 | `^\s*--x:` 줄 수 ≥50 | 선언이 늘어 **항상 안전** |
| D-1 | `--x:` 선언 줄 **밖**의 색 리터럴 0 | 블록 안이 전부 선언 줄이라 **면제** |
| D-2 | 미선언 `var()` 참조 0 | 선언한 것만 쓰면 무관 |
| D-3 | `^\.theme-dark{` / `^\.theme-light{` **두 블록만** 비교 | 🔴 **`.provider-*`를 안 본다 = 페어 강제 사각지대** |
| D-4 | TS의 `var()`/`getCssVar()` + `MODEL_KINDS` 전개 | `modelKind()`는 `model.includes(k)` — `gpt-5.6-terra`는 매치 실패 → `'other'` → **slate 폴백**(현재도 그린) |

### 🔑 프로바이더 = 팔레트, 상태 = 그 안의 슬롯 (2026-09-19 사용자 확정)

**두 축은 직교한다.** 프로바이더가 팔레트를 고르고, 상태(일반/경고/위험)가 그 팔레트 안의 슬롯을 고른다.
`.theme-dark`/`.theme-light`가 `--c-danger`에 다른 값을 넣어도 여전히 "위험"인 것과 같은 구조다.

> **폐기된 내 초기 판단**: "프로바이더 색이 상태색을 덮으면 위험 신호가 죽는다"며 액센트 도입 자체를 기각했으나,
> 이는 프로바이더 색이 상태색을 **대체한다**고 잘못 전제한 것. 두 축은 충돌하지 않는다.

### 결정
1. **새 토큰 이름을 만들지 않는다.** `.provider-codex` 스코프가 **기존 토큰 이름을 재정의**한다. `--c-codex-*` 병렬 이름은 7+1 cap 정면충돌 + 페어가 4중으로 불어난다. 한 화면에 동시 활성인 액센트는 여전히 7+1.
2. **갈아끼워지는 것은 "일반/정체성" 슬롯**(현재 `--c-sonnet` 파랑이 맡은 자리)과 크롬(토글·배지·footer·차트 계열).
3. 🔴 **경고·위험은 hue 계열을 바꾸지 않는다** — 호박색·빨강은 학습된 안전 관습이다. 브랜드에 맞춘다고 위험을 청록 계열로 옮기면 테마가 아니라 **안전 신호 회귀**다. 프로바이더별로 달라지는 건 **명도·채도·온도**까지.
4. **팔레트가 4벌이 된다**(provider 2 × theme 2). D-3은 `.theme-*` 두 블록만 보므로 **4벌 중 2벌이 검증 사각지대** → **D-5 게이트는 선택이 아니라 필수**. 대비비도 4벌 전부에서 성립해야 한다.
5. **`MODEL_KINDS`에 Codex kind를 추가하지 않는다** — `modelKind()`가 `'other'`→slate 폴백이라 D-4가 이미 그린. 단 **Codex 모델이 여러 개일 때 모델 구성 차트가 slate 단색이 되는 문제는 별건**으로 남는다(프로바이더 색이 아니라 모델 색 문제).
6. ✅ **팔레트 확정(2026-09-19, 사용자 승인 — B안)**. 근거: 전수조사(fork, 1차 출처 `anthropics/skills` brand-guidelines + `openai/codex` `color.rs`).
   - **Claude 브랜드**: Clay `#D97757`(15°, Primary) · Blue `#6A9BCC`(210°, 보조) · Green `#788C5D`(86°, 3차). 상태색은 브랜드가이드 **미정의**.
   - **OpenAI/Codex 브랜드**: 유일 유채색 ChatGPT Green `#10A37F`(165°). 나머지 모노크롬(`#0F0F0F`/`#FAFAFA`). Codex CLI(`color.rs`)에 고정 팔레트 없음(터미널 적응형) — 즉 전용색 제약 없음.
   - **haiku(173°) vs Codex green(165°) 8° 충돌은 무효** — 두 색은 서로 다른 provider 모드에서만 등장해 동일 화면에 공존하지 않는다.
   - **Claude 상태 램프 = B안(브랜드 순환)** — A안(정상=Clay 정면)은 3상태 이웃 hue거리 27~28°로 색각 이상에서 정상/경고 혼동. B안은 브랜드가이드의 orange→blue→green 순환을 그대로 써 167°/55°로 벌어진다:
     | 슬롯 | B안 값 | hue |
     |---|---|---|
     | 정상(현 `--c-sonnet` 슬롯) | `#6A9BCC` | 210° |
     | 경고(현 `--c-warn` 슬롯) | `#E0B341` | 43° |
     | 위험(현 `--c-danger` 슬롯) | `#B3304A` | 348° |
     | 크롬(토글·배지·footer·헤더) | `#D97757`(Clay, 원색 그대로) | 15° |
   - **Codex 상태 램프**(정상=브랜드 그린 정면 — Codex는 브랜드가 곧 단일 유채색이라 A/B 분기 자체가 없음):
     | 슬롯 | 값 | hue |
     |---|---|---|
     | 정상 | `#10A37F` | 165° |
     | 경고 | `#D9982F` | 40° |
     | 위험 | `#D6455B` | 351° |
     | 크롬 | `#0F0F0F`/`#FAFAFA`(모노크롬) |  — |
   - 라이트 테마 파생(다크값 기준 명도만 조정, 현재 `--fg-*`/`--tint-*` 패턴 재사용)은 ST9 구현 시 확정.

### footer (신규 영역)
`.sb-footer`는 **CSS에만 선언돼 있고 실제로는 렌더되지 않는다**(현재 `.sb-spacer` + `.sb-dashboard-btn`만). 따라서 "활성 CLI에 맞는 footer"는 기존 요소 변경이 아니라 **없던 영역 신설**이다 — 활성 프로바이더·플랜·마지막 갱신을 담는다.

---

## 6. 빈 상태 3단 분기 (양 프로바이더 **공통** — 사용자 지시)

Claude 현행은 `credentials_missing` 하나로 뭉쳐 있고 문구가 그걸 드러낸다(`login_sub_missing` = "설치되어 있지 않**거나** 로그인되지 않았습니다"). **양쪽 다 3단으로 맞춘다.**

| 상태 | 판정 | 처방 UI |
|---|---|---|
| 미설치 | 홈 디렉토리(`~/.claude` / `~/.codex`) 부재 | 설치 명령 + 안내. **로그인 버튼 없음**(눌러도 못 고친다) |
| 미로그인 | 인증 파일 부재/만료 | 로그인 버튼 + CLI 명령 |
| 기록 없음 | 인증 OK · rollout/jsonl 0건 | "아직 사용 기록 없음". **0%·$0 금지**(한도 소진으로 오독) |

🔴 **"기록 없음"은 `PollerError`가 아니다** — 인증은 성공했고 데이터가 빈 상태다. 같은 enum에 넣으면 "로그인 실패"와 "아직 안 씀"이 섞인다. **에러 축과 데이터-부재 축을 분리**한다.
i18n: `login_sub_missing`을 **2키로 분할 × 4개국어**.

---

## 7. SubTask

```
[Task] v0.2.0 Codex 통합   라우팅: 병렬 0 + 직렬 12 (전량 [S])
  P1  [S] fixture repo 반입(실물+합성, 성격 표기)                → test/fixtures/codex/
  P2  [S] [TDD] 골든 하네스 provider 축                          → scripts/verify-webview-surface.mjs, test/golden/
  P3  [S] [TDD] SessionRecord.messageId → provider별 합성키       → src/types/index.ts, src/services/JsonlParser.ts
  ST1 [S] AgentSource 인터페이스 + SessionRecord.provider 확장    → src/sources/
  ST2 [S] ClaudeSource 무행위변경 이관(회귀 그린 필수)            → src/sources/claude/
  ST3 [S] [TDD] CodexParser — 2경로·누적쌍 dedup·zst·depth3      → src/sources/codex/
  ST4 [S] [TDD] Codex 가격표 + rate_limits 파싱(버킷 가변)       → src/utils/pricing.ts, src/sources/codex/
  ST5 [S] 소스 레지스트리 + 자동감지 + FileWatcher 중첩감시       → src/extension.ts, src/services/FileWatcher.ts
  ST6 [S] 적응형 UI — 버킷 런타임 생성·섹션 숨김                  → src/webview/panelView.ts, sidebarView.ts
  ST7 [S] 프로바이더 스위처 + globalState 영속 + i18n            → src/webview/sidebarView.ts, src/messaging/
  ST8 [S] [TDD] 빈 상태 3단 분기(양 프로바이더) + i18n 2키 분할  → src/types/index.ts, src/webview/, src/services/
  ST9 [S] provider 팔레트(4벌) + footer 신설 + D-5 게이트          → src/webview/styles.css, sidebarView.ts, panelView.ts, verify.sh
        · `.provider-codex` 스코프가 일반/정체성 슬롯·크롬 재정의 (경고·위험 hue 유지)
        · `.sb-footer` 신규 렌더 — 활성 프로바이더·플랜·갱신시각
        · D-5: provider 블록의 다크/라이트 페어 강제 (4벌 전수)
  ST10[S] 검증·문서 — verify 전그린·골든 재캡처(사유)·실기 캡처   → docs/, test/golden/
```

**TDD 적격**(`--auto --tdd`, 3-AND 기준): P2·P3·ST3·ST4·ST8 = 순수/결정론/단위러너 존재. ST1·ST2·ST5·ST7은 배관·이관, ST6·ST9·ST10은 UI/CSS/스냅샷이라 절대제외.

### 진행 상태 (2026-09-19 갱신)

| 항목 | 상태 | 비고 |
|---|---|---|
| P1 fixture | ✅ | `test/fixtures/codex/` — `.zst`/`archived_sessions` 제외(위 P-1 결정 참조) |
| P3 dedup 키 | ✅ | `recordKey.ts` — `JsonlParser.ts` 무변경(위 P-3 결정 참조) |
| ST1 AgentSource | ✅ | `src/sources/AgentSource.ts`, `SessionRecord.provider` |
| ST2 ClaudeSource | ✅ | `src/sources/claude/ClaudeSource.ts` — 기존 스위트 무수정 그린(436/436) |
| ST3 CodexParser | ✅ | `src/sources/codex/codexRollout.ts` — 19 tests, 비인접 replay dedup 버그 수정 완료 |
| ST4 Codex 가격표 | ✅ | `src/sources/codex/codexPricing.ts` — 8 tests |
| 부가: CodexSource | ✅ | `src/sources/codex/CodexSource.ts` — rollout→SessionRecord[] 변환, 15 tests |
| 부가: UsageAggregator provider 가격분기 | ✅ | `resolvePriceFor` — Codex 모델이 Claude 표 기준 오탐 unpriced 되던 버그 수정(3 tests) |
| P2 골든 하네스 provider 축 | ✅ | `SURFACES`에 provider 축 추가(8→16 조합), `docs/demo/{panel,sidebar}-codex.html`+`mock-data-codex.js`(실 fixture 파생값) 신설, `CODEX_EXPECTED_NULL_IDS`로 Claude 전용 개념(overage·컨텍스트게이지)의 정당한 null 구분 |
| ST5 소스 레지스트리+FileWatcher | ✅ | `extension.ts`가 `ClaudeSource`/`CodexSource` 등록·자동감지(`refreshProviderAvailability`)·Codex 전용 `FileWatcher`(subdir='sessions', depth=3)를 배선. `PushUsageSummary`가 '활성 프로바이더 단일 채널'로 전환(Claude push는 `activeProvider==='claude'`일 때만) |
| ST7 프로바이더 스위처 | ✅ | `sidebarView.ts` `buildProviderSwitcherHtml` — Codex `not_installed`면 숨김. `RequestSetProvider`/`PushActiveProvider`(globalState `ccg-active-provider` 영속) 배선 |
| ST8 빈 상태 3단 | ✅(사이드바) | Claude에 `not_installed` 신규 분기 추가(기존 not_authenticated류 무변경) + Codex 4단(not_installed/not_authenticated/no_records/ready) 신규 구현. i18n 8개 언어×4키 추가 |
| ST6 적응형 UI | ✅(축소범위) | 사이드바: Codex 버킷 배열 동적 렌더(`sb-codex-bucket-N`, 5H/7D 하드코딩 없음). panelView.ts: Claude 전용 카드(fh/sd/burn/safe/trend/skill/retro) 7개를 Codex 활성 시 `display:none`으로 숨김(`applyProviderVisibility`) — burn-rate/trend 차트를 버킷 N개 제네릭으로 재작업하는 건 **범위 밖으로 명시 보류**(burn 수학·`FH_WINDOW_MS`·`trend-readout`의 "5H·7D" 하드코딩 문자열이 깊이 결합돼 있어 별도 패스 필요, 아래 참조). daily/calendar/model/cache/tools/files/sessions/branch는 UsageSummary 기반이라 무수정으로 이미 동작(헤드리스 스크린샷으로 실제 렌더 확인) |
| **보류: panelView.ts Codex 네이티브 게이지** | 🔜 | burn rate·util trend 차트가 5h/7d 고정 의미론(`FH_WINDOW_MS`/`SD_WINDOW_MS`, `trend-readout` 하드코딩 라벨)에 결합돼 있어 N-버킷 제네릭화는 별도 SubTask. 재개 조건: 사용자 요청 또는 v0.3 범위(범위 밖 유지, 2026-09-19 재확인) |
| ST9 팔레트(4벌)+footer+D-5 | ✅ | `:root`에 있던 `--c-sonnet`/`--c-warn`/`--c-danger`를 `.theme-dark`/`.theme-light`로 이관(Claude B안: 정상 #6A9BCC·경고 #E0B341·위험 #B3304A, 라이트는 명도 -13 파생) + `.provider-codex.theme-dark`/`.theme-light` 신설(Codex B안: 정상 #10A37F·경고 #D9982F·위험 #D6455B, tint/border/outline/fg 패밀리 전체 동반 재정의 — base만 바꾸면 "틴트-글씨 색 불일치"가 난다, advisor 지적). 크롬 전용 신규 토큰 `--identity-accent`(7+1 cap 밖, 모델/상태 아님) 추가 — Claude Clay #D97757, Codex 모노크롬(다크=#FAFAFA·라이트=#0F0F0F, 배경 대비 원칙으로 배정). `.provider-codex` 클래스는 `sidebarView.ts`(renderSidebar)·`panelView.ts`(applyProviderVisibility)가 `document.body`에 토글. `.sb-footer`(CSS만 있고 렌더 소비자가 없던 영역) 신규 렌더 — 활성 프로바이더·plan·마지막 갱신, Codex는 이 footer가 plan_type/generatedAt의 첫 소비자. `verify.sh` D-5 신설(측정 무결성 floor 포함, D-3의 compound-selector 사각지대 커버) |
| **부가 회귀 발견·수정(ST9 중)** | ✅ | `panelView.ts`의 `getCssVar()`가 `document.documentElement`(`<html>`)에서 읽고 있었는데, `--c-sonnet`/`--c-warn`/`--c-danger`가 `:root`를 떠나 `.theme-dark`(`<body>`)로 이관되며 **Claude/Codex 양쪽 전부** Daily Cost·Utilization Trend·Cache Hit Rate·Tool Usage·Long-term Trend 차트가 검정으로 렌더되는 무성 실패가 났다(헤드리스 스크린샷 실측으로 발견, git 미커밋 상태라 실사용자 영향 없음). `getCssVar`를 `document.body` 기준으로 수정해 해결 — 커스텀 프로퍼티는 조상 방향으로만 상속되므로 `<html>`은 `<body>`의 자식 선언을 못 본다는 점을 놓쳤던 것이 원인 |
| ST10 검증·문서 | ✅(부분) | `npm run test:e2e`(`@vscode/test-electron`, 실 VS Code 1.138.0 바이너리 + xvfb) 그린 확인 — 이번 세션 최초의 실제 Extension Host 검증(이전까지는 전부 headless Playwright 목업). `test:integration`(`vscode-test` CLI)은 `@vscode/test-cli` 미설치로 실행 불가하나 이는 verify.sh에 **기등재된 예외**(별건, 이번 세션 기인 아님). Windows GUI 브리지(F5 실기 캡처)는 2회 측정 시도 모두 타임아웃 — "배선이 지금 끊겨있다"이지 원리적 불가 아님(재시도 가능). 프로바이더 2종×빈상태 3종의 실 VS Code 창 스크린샷은 **미완료로 남김** — headless 목업 스크린샷(진짜 빌드 산출물 `dist/webview/main.js` 로드)으로는 팔레트·footer 렌더 확인 완료 |
| **defer #9 구조적 해법** | ✅ | `SessionSummary`/`BranchUsage`/`SkillUsage`/`SkillUnattributed`/`SubagentStats`에 `hasUnpricedRecords`(서브에이전트는 main/subagent 독립 플래그) 필드 추가 — `UsageAggregator`가 레코드 단위로 OR 누적(today 스코프인 `unpricedModels`로는 대체 불가, advisor 지적: `recentSessions`=최근 20개·`branchBreakdown`/`skillBreakdown`=전체기간이라 스코프가 다름). `panelView.ts`의 session-cost·branch-cost·skill-cost·서브에이전트 요약 라인에 공용 `costCellHtml()` 헬퍼로 배선 — 비용 미상인데 `subagentCount`/`totalTokens`>0이면 그 행 자체를 숨기지 않도록 게이팅 조건도 같이 수정(PLAN §8 불변식5). 신규 유닛테스트 8건(`UsageAggregator.hasUnpricedRecords.test.ts`) |
| **verify-impl 1라운드(2026-09-20)** | ✅ | 최종 승인 시안 캔버스(`claude.ai/artifact/QWEJLYwwivT9KSFRgMMxdh`, 12보드 — 9보드 표기는 초안 당시 개수)와 본 PLAN을 기준선으로 `acceptance-critic`(축A)+`screen-critic`(축B) 병렬 인수검증 실행. 축A는 P1~ST10 대부분 ✅ 확인(도구가 Bash 미지원이라 남은 ❓ 8건은 세션이 직접 `git diff`(JsonlParser.ts 0줄 diff·UsageAggregator.ts는 Claude 경로에 findPricing≡resolvePricing(...).price 동치 확인된 순수 추가)·`verify.sh --full`(29/0)·`vitest`(448/448)로 사후 확인 완료 — P2 하네스가 panel의 `display:none` 은닉을 구조적으로 못 잡는다는 지적은 골든 파일 자체의 재캡처 사유에 이미 기록돼 있던 기지 한계로 확인). 축B는 시안 대비 **Dash-Codex 지표밴드·"대신 새로 생기는 것" 패널·Side-Codex 개별 게이지가 통째로 렌더 안 됨**(높음 3건, B-V1/B-V2/B-V6)을 발견 — 원인은 `panelView.ts`가 `GetCodexRateLimit`/`PushCodexRateLimit`을 애초에 구독하지 않던 배선 누락(위 ST6 "축소범위" 결정과는 별개 — burn-rate/trend 차트가 아니라 단순 값+bar 카드라 그 보류 범위 밖). |
| **B-V1/B-V2/B-V6 보완(2026-09-20)** | ✅ | `panelView.ts`에 `GetCodexRateLimit`/`PushCodexRateLimit` 구독 신설 → `panel-codex-band-grid`(window_minutes 기반 가변 N-버킷 카드, sidebar의 bucketCards와 동일 라벨링 재사용)·`panel-codex-band-note`(가변 버킷 안내 배너)·`panel-codex-extra-card`(추론토큰/컨텍스트창실측/플랜배지 3행) 신설, 헤더 plan 배지도 Codex planType으로 채움(기존엔 blank). `sidebarView.ts`에도 컨텍스트창(`codex_context_window`)·추론토큰 행 + 헤더 plan 배지 추가. 데이터 계층: `SessionRecord.reasoningTokens?`(Codex만, `CodexSource.rolloutLinesToSessionRecords`가 채움) → `UsageAggregator`가 today 스코프로 합산해 `UsageSummary.todayReasoningTokens`(Claude는 항상 0, 무행위변경) / `CodexRateLimitSnapshot.modelContextWindow`(`CodexSource.loadLatestRateLimit`가 `token_count`의 latest-wins 독립 스캔으로 채움, 실 fixture 실측값 258,400 확인). `.card` 클래스 재사용을 피해 `panel-codex-extra-card`에 속성을 직접 복제(M2 "class=card 17→6" 회귀잠금 위반 방지, 1회 vitest FAIL로 발견·수정). 신규 유닛테스트 6건(CodexSource reasoningTokens/modelContextWindow 3건 + UsageAggregator todayReasoningTokens 2건 + latest-wins 독립스캔 1건). 골든 재캡처(사유: plan-badge 배선 변경, 8건 diff 전부 설명됨). free/plus 2×2(panel/sidebar) 헤드리스 스크린샷으로 다중 버킷(5H 34%/WEEKLY 61%) 동적 라벨링까지 실측 확인. |
| **잔여 축B/축A 항목 최종 판정(2026-09-20)** | ✅종결 | B-V3(모델색 slate 폴백)·B-V4(도구카드 Claude식 빈상태)=WAI(코드 주석에 의도 명시, 재작업 안 함). B-V5=위 라운드에서 이미 해결(헤더 plan 배지). B-V7(window_minutes 메타 라벨)=`sb-section-meta`/`.sb-provider-btn.is-unavailable` 신설로 사이드바에 반영, 헤드리스 캡처로 "window 43200" 렌더 확인. B-V8(활성 탭 강도)=디자인 의도상 톤다운으로 판단, 변경 안 함. B-V9~11(Empty-States 3단·Free/Plus·버킷 0~2개)=코드 경로 존재 확인(`buildNotInstalledCard`/`avail==='no_records'`/`loadLatestRateLimit` 0버킷→null) + free/plus 헤드리스 캡처로 부분 실측, 전체 3상태 실 VS Code 캡처는 ST10과 동일 사유(Windows GUI 브리지 미가동)로 보류. B-V12(Main Case B/C)=Case B(토글 숨김)는 코드가 이미 시안 캡션("토글을 숨긴다")과 정확히 일치함을 확인, Case C(흐리게)는 `is-unavailable` 클래스 신설로 반영. A-V4(ST5 레지스트리)=`extension.ts`의 `ClaudeSource`/`CodexSource` 등록 확인. A-V5(ST7 영속)=`context.globalState`의 `ccg-active-provider` 키 확인. A-V6(ST8 panel 4단)=panel은 Claude·Codex 공통으로 빈 상태 카드가 없는 기존 아키텍처(사이드바가 게이트, panel은 진입 자체가 사이드바 경유)라 갭이 아님으로 판정. `verify.sh --full` PASS=29/FAIL=0·vitest 453/453 유지 확인 후 종결. |

---

## 8. 절대 불변식

1. **§3 CRITICAL 유지** — message.id dedup(Claude 경로 무행위변경) · chokidar · 비공개 HTTP API 금지 · unsafe-eval 금지.
2. **마켓 ID `cubha.claude-code-gauge` · `claudeCodeGauge.*` 네임스페이스 불변**(변경=신규 익스텐션=Open VSX 16,572 소실).
3. **`plan_type`·모델명 문자열 하드코딩 분기 금지**(소스 enum에 `serde(other)` 폴백 존재 = 미지의 값이 온다).
4. **버킷 5H/7D 고정 렌더 금지** — `window_minutes`에서 라벨·개수 생성.
5. **빈 값과 0 값을 같게 그리지 않는다** — 미지원(비활성)과 한도소진(정상 0%)은 다른 화면이다.
6. **추정으로 빈 섹션을 채우지 않는다** — 스킬귀속·서브에이전트·MCP는 Codex에서 제거(데이터 부재).
7. **배포·커밋 금지**(feedback_ship_gate) — 패키징·테스트까지. v0.2.0 번들로 출하 대기.
8. **골든 재캡처 시 사유 명시**(허위성공 차단 규약).

## 9. 검증 요구

- `bash verify.sh --full` **PASS 29→30(D-5 신설)/FAIL 0**
- vitest 전량 그린 + 신규 TDD 단언
- 골든 digest provider 축 확장 후 diff 0
- 실 fixture로 CodexParser 왕복 검산(`usage` 합 == 마지막 `thread_token_usage`)
- 실 Extension Dev Host 스크린샷 — 프로바이더 2종 × 빈상태 3종
