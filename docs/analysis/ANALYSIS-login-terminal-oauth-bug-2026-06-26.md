# "Claude로 로그인" 버튼 / 세션 만료 오탐 버그 분석 보고서

> 분석일: 2026-06-26
> 프로젝트: Claudepulse (Claude Code Gauge) v0.1.40
> 분석 관점: "Claude로 로그인" 버튼 클릭 시 터미널이 Claude Code CLI(REPL)로 진입하면서 로그인이 안 되는 버그 — alias 사용자 케이스 + 로그인 여부 판단 방식(간헐적 오탐) 근본 원인 탐색

---

## 0. 한 줄 요약

**서로 다른 두 버그가 맞물려 증상을 만든다.**
1. **원인 A (버튼 자체 결함)** — 버튼이 실행하는 `claude login`은 **현행 CLI에 존재하지 않는 서브커맨드**다. CLI가 `login`을 프롬프트 텍스트로 해석해 그냥 REPL을 띄운다 → "터미널에 Claude Code가 열리고 로그인이 안 됨".
2. **원인 B (로그인 판단 오탐)** — 익스텐션은 `.credentials.json`의 `accessToken`을 그대로 쓰고 **만료 검사·토큰 갱신 로직이 전혀 없다**. accessToken은 6~8h 단명이고 **CLI가 실행 중일 때만** 자동 갱신되므로, CLI를 한동안 안 쓰면 stale → API 401 → "세션 만료" 오탐. 사용자는 **이미 로그인 상태인데** "로그인하라"는 화면을 보고, 버튼을 눌러도(원인 A 때문에) REPL만 열려 로그인할 게 없는 막다른 길에 빠진다.

---

## 1. 증상 ↔ 코드 매핑

| 보고된 증상 | 코드 위치 | 직접 원인 |
|---|---|---|
| 버튼 클릭 → 터미널에 Claude Code CLI(REPL)가 열림, 로그인 진행 안 됨 | `src/extension.ts:170-174` | `terminal.sendText('claude login')` — `claude login`은 무효 서브커맨드 |
| 본인 환경에서도 claude 사용 중인데 간헐적으로 "로그인하라" 표출 | `src/services/RateLimitPoller.ts:41-60`, `src/services/CredentialsReader.ts` | stale accessToken으로 폴링 → 401 → `token_expired`. 만료 선검사·refresh 부재 |
| alias 등록 사용자에서 동작 불확실 | `src/extension.ts:171-173` | `createTerminal`이 사용자 기본 셸을 사용 → alias/함수 래퍼·rc 로드 레이스에 노출 |

---

## 2. 원인 A — "Claude로 로그인" 버튼이 무효 명령 실행

### 2-1. 코드

```ts
// src/extension.ts:170-174
vscode.commands.registerCommand(COMMANDS.login, () => {
  const terminal = vscode.window.createTerminal({ name: 'Claude Login' });
  terminal.show();
  terminal.sendText('claude login');   // ← 핵심 결함
});
```

### 2-2. 권위 있는 사실 (claude-code-guide 검증)

- ✅ **`claude login`은 유효한 서브커맨드가 아니다.** 정식 인증 커맨드는 **`claude auth login`** 이다 (공식 CLI reference).
  - `claude auth login` / `claude auth logout` / `claude auth status` — CLI 인증 트리오
  - 세션 내부 재인증: `/login`, `/logout`
- `claude login` 입력 시 CLI는 `login`을 **첫 프롬프트 텍스트**로 해석하고 대화형 세션(REPL)을 시작한다. → 보고된 "터미널이 Claude Code CLI로 진입" 증상의 정확한 원인.
- 즉 버튼은 에러조차 내지 않고 "로그인처럼 보이지만 로그인이 아닌" REPL을 띄운다.

### 2-3. alias 사용자 케이스

`vscode.window.createTerminal({ name })`는 `shellPath`를 지정하지 않으므로 **사용자 기본 프로파일 셸**(대화형)을 띄운다. 대화형 셸은 `.bashrc`/`.zshrc`를 소싱하므로 alias가 로드되긴 한다. 그러나:

| 시나리오 | 결과 |
|---|---|
| `alias claude='claude --resume'` 등 인자 추가형 | `claude --resume login` 으로 확장 → 동작 더 망가짐 |
| `claude`가 함수 래퍼(인자 무시형) | `login` 인자가 삼켜져 무반응 |
| rc 로드 지연(nvm/oh-my-zsh 등) + 즉시 `sendText` | 레이스로 alias 미적용 가능 (VS Code가 sendText를 버퍼링하므로 빈도는 낮으나 0은 아님) |
| `claude`가 비대화형 PATH에만 있고 alias로만 노출 | 환경에 따라 미해결 |

→ alias는 **2차 증폭 요인**이다. 1차 결함(무효 서브커맨드)을 고쳐도 alias 견고성은 별도로 다뤄야 한다.

---

## 3. 원인 B — 로그인 여부 판단 오탐 (핵심)

### 3-1. 현재 판단 흐름

로그인 여부는 **로컬 토큰 검사가 아니라 실시간 API 폴링 결과**로 역추론한다:

```
RateLimitPoller.poll()                       (RateLimitPoller.ts:41)
  └ credReader.read(path)                     ← accessToken 그대로 읽음 (CredentialsReader.ts)
  └ POST /v1/messages  Bearer accessToken     (RateLimitPoller.ts:62)
       ├ 401 → throw 'TOKEN_EXPIRED'          (RateLimitPoller.ts:92)
       │        → onError('token_expired')    (RateLimitPoller.ts:52)
       │        → webview: "세션 만료, 다시 로그인"  (main.ts:408,414 / i18n session_expired)
       ├ 파일없음/JSON깨짐/accessToken없음 → 'credentials_missing'  (RateLimitPoller.ts:49)
       └ 그 외 → 'network_error'              (RateLimitPoller.ts:55)
```

### 3-2. 결함: 토큰 수명 관리가 전무

코드 전수 확인 결과:
- `expiresAt`은 `CredentialsReader.ts:29`에서 읽혀 타입(`types/index.ts:60`)에 담기지만 **어떤 로직에서도 사용되지 않는다** (dead field).
- `refreshToken`은 읽히기만 하고 **갱신에 전혀 쓰이지 않는다**. `grant_type`/`client_id`/`oauth/token` 호출 코드 0줄.
- 401에 대한 **재시도·재읽기·완화 분기 없음** → 즉시 "세션 만료" 단정.

### 3-3. 왜 오탐인가 (권위 있는 사실)

- accessToken TTL은 **약 6~8시간**(정확치 불확실, GitHub #50743 등).
- accessToken은 **Claude Code CLI가 실행 중일 때만** refreshToken으로 자동 갱신된다 (공식 Authentication 문서 + #50743).
- 따라서 사용자가 몇 시간 `claude`를 안 쓰면 파일 속 accessToken이 만료(stale)된다. 익스텐션은 이 stale 토큰으로 폴링 → **401 → "세션 만료"**.
- 그러나 사용자는 **로그아웃된 적이 없다.** 유효한 refreshToken을 보유하고 있고, `claude`를 한 번 실행하면 즉시 갱신된다. → **전형적 false positive.** (사용자가 "사용 중인데도 간헐적으로 뜬다"고 한 현상과 정확히 일치.)

### 3-4. 두 버그의 결합 = 막다른 길

stale 토큰(원인 B) → "세션 만료" 표출 → 사용자가 "Claude로 로그인" 클릭(원인 A) → `claude login`이 REPL만 띄움 → REPL은 (refreshToken 유효하므로) **이미 로그인 상태** → 로그인할 게 없음 → 사용자 혼란. **두 결함이 서로를 가린다.**

---

## 4. 수정 방향 (권장 로드맵)

> ⚠️ **제약(CLAUDE.md §3#3 + ToS):** `console.anthropic.com/v1/oauth/token` 비공식 엔드포인트로 익스텐션이 **직접 refreshToken 갱신을 수행하는 것은 금지**한다. 2026-02 Anthropic ToS 위반 위험 + 프로젝트 절대원칙(비공개 API 금지) 위배. 아래 해법은 모두 이 선을 지킨다.

### 4-1. 즉시 개선 (Quick Win)

- [ ] **원인 A 정정** — `extension.ts:173` `claude login` → **`claude auth login`** (정식 서브커맨드). 1줄 수정으로 버튼이 실제 OAuth 플로우를 띄운다.
- [ ] **만료 문구 분리** — `expiresAt < now && refreshToken 존재` 케이스는 "세션 만료/재로그인"이 아니라 **"토큰 갱신 필요 — Claude Code를 한 번 실행하면 자동 갱신됩니다"** 류 메시지로 분기 (i18n 신규 키). 진짜 로그아웃(`credentials_missing`)과 구분.

### 4-2. 단기 개선 (1~2주) — 오탐 제거 (구조적)

- [ ] **401 시 credentials 재읽기 + 1회 재시도** — CLI가 백그라운드에서 막 갱신했을 수 있으므로, 401을 받으면 파일을 다시 읽어 accessToken이 바뀌었으면 즉시 재폴링. (CLI 실행 중 오탐 대부분 제거)
- [ ] **`.credentials.json` chokidar 감시** — 프로젝트는 이미 jsonl을 chokidar로 감시한다(§2 채택 스택). 같은 패턴으로 `.credentials.json` mtime을 감시해 **CLI가 토큰을 갱신하는 즉시 재읽기+재폴링** → CLI 활성 구간의 stale 윈도우를 근본 제거. (가장 프로젝트 정합적인 해법)
- [ ] **`expiresAt` 선검사** — 폴링 전에 `expiresAt`이 지났으면 불필요한 401 왕복 없이 곧장 "갱신 필요" 상태로 전이(폴링 비용·노이즈 절감).

### 4-3. alias 견고성 (단기)

- [ ] 버튼 명령을 alias·rc 의존에서 분리. 예: `claude`의 절대 경로 탐색 후 직접 호출, 또는 `claude auth login` 실패 시 안내 문구(설치/로그인 가이드) 폴백. 최소한 README/login_hint에 "alias 사용 시 `claude auth login` 직접 실행" 안내.

### 4-4. 검토만 (중장기, 비채택 권고)

- 익스텐션 자체 OAuth refresh 구현 → **비채택** (ToS + §3#3). 기록만 남김.

---

## 5. 리스크·영향 범위

| 항목 | 평가 | 근거 |
|---|---|---|
| 사용자 체감 심각도 | 🔴 높음 | 정상 로그인 사용자에게 "세션 만료"가 반복 노출 + 버튼이 무효 → 핵심 신뢰 훼손 |
| 수정 난이도 (원인 A) | 🟢 낮음 | 1줄 (`claude auth login`) |
| 수정 난이도 (원인 B) | 🟡 보통 | RateLimitPoller 재시도/재읽기 + extension.ts chokidar 감시 + webview 문구 분기 (3~4파일) |
| 영향 모듈 | RateLimitPoller, CredentialsReader, extension.ts, webview(main.ts/i18n) | cross-module — 구현 시 advisor/계획 권장 |
| ToS·정책 리스크 | 🟢 (권장안 한정) | 직접 refresh 배제로 §3#3·ToS 모두 준수 |

---

## 6. 검증 시나리오 (수정 후)

1. **원인 A** — 버튼 클릭 → 터미널에서 `claude auth login`이 실제 OAuth 플로우를 시작하는지(브라우저/디바이스 코드) 확인.
2. **원인 B-1** — accessToken을 인위적으로 만료시킨 뒤 `claude` 1회 실행 → 익스텐션이 stale 화면을 거치지 않고(또는 즉시 복구) 정상 표시되는지.
3. **원인 B-2** — CLI 미실행 + 토큰 만료 상태 → "세션 만료"가 아니라 "갱신 필요" 문구가 뜨는지.
4. **alias** — `alias claude='claude --resume'` 환경에서 버튼이 망가지지 않는지(또는 안내 폴백).

---

## 7. 리서치 출처

- Claude Code CLI reference — `claude auth login` 정식 확인 (https://code.claude.com/docs/en/cli-reference.md)
- Claude Code Authentication — accessToken 자동 갱신은 CLI 런타임 바운드 (https://code.claude.com/docs/en/authentication)
- GitHub issue #50743 — 헤드리스/미실행 시 OAuth 토큰 미갱신, TTL ~6h (https://github.com/anthropics/claude-code/issues/50743)
- 프로젝트 메모리 `reference_api_discovery.md` — `.credentials.json` 구조, 폴링 엔드포인트
- 코드 증거: `extension.ts:170-174`, `RateLimitPoller.ts:41-107`, `CredentialsReader.ts:29`, `webview/main.ts:404-438`

---

> 이 보고서는 Claude Code `/analyze` 스킬로 자동 생성되었습니다.
