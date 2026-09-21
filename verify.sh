#!/usr/bin/env bash
# verify.sh — AgentVitals 통합 검증 스크립트
# 호출: bash verify.sh [--ts-only|--no-build|--full]

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PASS=0
FAIL=0

# ── 실행 모드 (게이트 계층화 — ~/.claude/skills/_shared/impl-handoff.md §3-1) ──
#   --ts-only  : 가장 싼 컴파일 확인만 (worktree 스모크용)
#   --no-build : 빌드 스킵 (SubTask/그룹 경계 게이트용)
#   --full     : 전체 (기본 — COMPLETE 게이트용)
VERIFY_MODE="full"
case "${1:-}" in
  --ts-only)  VERIFY_MODE="ts-only" ;;
  --no-build) VERIFY_MODE="no-build" ;;
  --full|"")  VERIFY_MODE="full" ;;
  *) echo "⚠️  알 수 없는 플래그 '$1' — full 로 실행합니다" ;;
esac

step() {
  local label="$1"
  shift
  echo ""
  echo "▶ $label"
  if "$@"; then
    echo "  ✅ PASS"
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL"
    FAIL=$((FAIL + 1))
  fi
}

finish() {
  echo ""
  echo "═══════════════════════════════════════"
  echo "  Verify 결과: PASS=$PASS · FAIL=$FAIL  (mode=$VERIFY_MODE)"
  echo "═══════════════════════════════════════"
  [[ $FAIL -eq 0 ]] || exit 1
  exit 0
}

# 1. node_modules 존재
step "node_modules 존재 확인" test -d node_modules

# 2. TypeScript 타입 체크
step "TypeScript typecheck" npx tsc --noEmit

# 2b. test/ 디렉토리 typecheck — tsconfig.json이 test를 exclude하고 vitest는 typecheck 안 함이라
#     생겼던 사각지대(v0.1.54 ST2a). src/webview import를 포함한 테스트가 있어 src 전체를 함께 본다.
step "TypeScript typecheck (test)" npx tsc --noEmit -p tsconfig.test.json

# 2c. 측정 무결성 바닥 — include 패턴이 깨져 파일 0개를 조용히 통과시키는 걸 차단(D-0류, 디자인토큰
#     게이트와 동일 원칙). 기준선 71(2026-08) 대비 넉넉히 잡음.
TEST_TS_FILE_COUNT=$(npx tsc -p tsconfig.test.json --listFilesOnly 2>/dev/null | grep -vc node_modules || true)
step "tsconfig.test.json 측정 무결성 (≥50 files)" bash -c "[ '$TEST_TS_FILE_COUNT' -ge 50 ]"

# 2d. webview typecheck — 루트 tsconfig.json이 src/webview를 exclude하고 tsconfig.webview.json은
#     여태 어디에도 배선 안 돼(package.json·verify.sh 미참조) main.ts(1882줄)가 tsc 사각지대에
#     있었다(v0.1.54 ST2b, ST5 분리의 하드 선행조건).
step "TypeScript typecheck (webview)" npx tsc --noEmit -p tsconfig.webview.json

# 2e. 게이트 커버리지 무결성 (v0.1.55) — D-0과 같은 계열: "자를 먼저 검사한다".
#     이 repo의 실패는 "검증기가 없다"가 아니었다. verify-calendar-clip.js는 v0.1.52부터 실제
#     제품 결함을 매일 잡고 있었는데 verify.sh에 배선되지 않아 3릴리즈 내내 아무도 보지 않았다
#     (실측: verify-* 6개 중 배선 1개). CLAUDE.md에 "강제는 산문이 아니라 기계가 한다"가 적힌
#     채로 그렇게 됐다 — 조항은 **사건 기반**이라 새 스크립트를 만들 때 읽혀야 하고 한 번 놓치면
#     영구히 놓친다. 게이트는 **상태 기반**이라 놓친 것이 다음 실행에서 다시 잡힌다.
#
#     계약: scripts/verify-* 는 헤더에 `verify-gate: <full|no-build|skip(<사유코드>)> — <사유>`를
#     선언한다. 예외를 금지하지 않고 **비싸고 보이게** 만든다(design-lint-ignore와 같은 구조 —
#     마커가 파일 안에 있어 파일과 함께 이동·삭제되므로 별도 allowlist처럼 드리프트할 수 없다).
UNWIRED=""
for f in scripts/verify-*; do
  base=$(basename "$f")
  marker=$(grep -m1 -oE 'verify-gate:[[:space:]]*(full|no-build|skip\([a-z-]+\))' "$f" || true)
  if [[ -z "$marker" ]]; then
    UNWIRED="${UNWIRED}
    - ${base} (verify-gate 마커 없음)"
  elif [[ "$marker" == *skip* ]]; then
    grep -qE 'verify-gate:[[:space:]]*skip\([a-z-]+\)[[:space:]]*—[[:space:]]*[^[:space:]]' "$f" \
      || UNWIRED="${UNWIRED}
    - ${base} (skip인데 사유 문자열 없음)"
  else
    # 자기매칭 함정: `grep -q "$base" verify.sh`로 쓰면 이 루프 자신·에러 메시지가 매칭돼
    # 항상 통과한다. 실제 호출문 형태로만 찾는다.
    grep -qE "node +scripts/${base}" verify.sh \
      || UNWIRED="${UNWIRED}
    - ${base} (${marker##*: } 선언인데 verify.sh에 호출 없음)"
  fi
done
[[ -n "$UNWIRED" ]] && echo "  미배선 검증 자산:${UNWIRED}"
step "검증 자산 게이트 커버리지 (미배선 0건)" test -z "$UNWIRED"

# 2f. 실행가능 스모크 (v0.1.55) — 2e로는 안 잡히는 **다른 부류**. package.json에 등록돼 있어
#     "배선된 것처럼" 보이지만 호출하면 즉시 죽는 자산을 잡는다. 실측 근거: test:integration이
#     2026-05-10 도입 이래 3.5개월·약 50릴리즈 동안 `vscode-test: not found`(exit 127)였고,
#     아무도 호출하지 않아 아무도 몰랐다. 미배선(2e)과 실행불가(2f)는 다른 결함이다.
#
#     실제로 돌리지 않고 판별한다 — 건강한 스크립트는 수십 초가 걸리므로 스모크가 될 수 없다.
#     대신 각 스크립트의 **첫 명령어가 해석 가능한지**(node_modules/.bin 또는 PATH)만 본다.
#     알려진 실행불가는 사유와 함께 등재하되 **매번 화면에 뜨게** 한다 — 조용히 늘어나는 것이
#     이 게이트가 막으려는 것이므로, 예외를 금지하는 대신 비싸고 보이게 만든다.
DEAD_ALLOW="test:integration"  # @vscode/test-cli 미설치+.vscode-test 설정 부재+extension ID 오류 3겹, v0.1.55 범위 밖(별건)
DEAD=""
DEAD_KNOWN=""
while IFS=$'\t' read -r name cmd; do
  [[ -z "$name" ]] && continue
  first="${cmd%% *}"
  if [[ -x "node_modules/.bin/$first" ]] || command -v "$first" >/dev/null 2>&1; then
    continue
  fi
  if [[ " $DEAD_ALLOW " == *" $name "* ]]; then
    DEAD_KNOWN="${DEAD_KNOWN}
    - npm '${name}': '${first}' 실행 불가 (등재된 예외 — 별건 처리 대기)"
  else
    DEAD="${DEAD}
    - npm '${name}': '${first}' 실행 불가 — 호출 즉시 exit 127"
  fi
done < <(node -e "
  const s=require('./package.json').scripts||{};
  for (const [k,v] of Object.entries(s)) if (k.startsWith('test')) console.log(k+'\t'+v);
")
# 구문 오류로 호출 즉시 죽는 하네스도 같은 부류다(비용 0으로 판별 가능).
for f in scripts/verify-*.js scripts/verify-*.mjs; do
  [[ -e "$f" ]] || continue
  node --check "$f" >/dev/null 2>&1 || DEAD="${DEAD}
    - $(basename "$f") 구문 오류 — 호출 즉시 실패"
done
[[ -n "$DEAD_KNOWN" ]] && echo "  ⚠️  알려진 실행불가(등재 예외):${DEAD_KNOWN}"
[[ -n "$DEAD" ]] && echo "  실행 불가 자산:${DEAD}"
step "검증 자산 실행가능 스모크" test -z "$DEAD"

[[ "$VERIFY_MODE" == "ts-only" ]] && finish

# 3. ESLint — .eslintrc.cjs의 src/webview/** ignore를 해제(v0.1.54 ST2b)해 이 한 스텝이 webview도 포함한다
step "ESLint" npx eslint src --ext ts

# 4~5. esbuild 빌드 + dist 산출물 확인 (--no-build 시 스킵)
if [[ "$VERIFY_MODE" == "no-build" ]]; then
  echo ""
  echo "⏭  esbuild 빌드·dist 산출물 확인 스킵 (--no-build)"
else
  step "esbuild build" node esbuild.config.mjs
  step "dist/extension.js 생성 확인" test -f dist/extension.js
  step "dist/webview/main.js 생성 확인" test -f dist/webview/main.js
  step "dist/webview/styles.css 복사 확인" test -f dist/webview/styles.css

  # 5b. 웹뷰 전면 DOM digest 골든 (v0.1.54 ST4/ST5) — main.ts 분리 이후 update* 렌더 함수가
  #     조용히 안 불리는 회귀를 잡는다. --full에서만(실 빌드 산출물 필요 + ~17s).
  if [[ "$VERIFY_MODE" == "full" ]]; then
    step "웹뷰 전면 DOM digest (golden)" node scripts/verify-webview-surface.mjs
    # test:e2e(vscode-messenger 0.6.1 라운드트립, v0.1.54 ST6) — VS Code 테스트 바이너리가
    # 캐시돼 있으면 ~5s. 미설치 환경(최초 실행)은 다운로드로 오래 걸릴 수 있어 120s 타임아웃.
    step "test:e2e (vscode-messenger 라운드트립)" bash -c "timeout 120 npm run test:e2e >/tmp/verify-e2e-cpulse.log 2>&1 || { tail -20 /tmp/verify-e2e-cpulse.log; exit 1; }"
    # v0.1.55에서 배선 — 미배선이던 hermetic 하네스 3종. calendar-clip은 요일의존 결함(B)과
    # 제품 결함(A)이 모두 해소돼 상시 그린이 됐고, sidebar 2종은 애초에 그린이었는데 잊혀 있었다.
    step "Usage Calendar 고정폭·스크롤 (7-seed)" node scripts/verify-calendar-clip.js
    step "사이드바 미니 캘린더" node scripts/verify-sidebar-calendar.js
    step "사이드바 레이아웃" node scripts/verify-sidebar-layout.js
    step "목록 행 상한·가격 신호 (2폭×2로캘)" node scripts/verify-list-cap.js
    step "기간별 비용 탭 전환 (2폭×2로캘×3탭)" node scripts/verify-cost-period-tabs.mjs
  fi

fi

# 6. package.json 메타 검증
step "package.json publisher=cubha" bash -c "grep -q '\"publisher\": \"cubha\"' package.json"
step "package.json name=claude-code-gauge" bash -c "grep -q '\"name\": \"claude-code-gauge\"' package.json"

# 7. CRITICAL — vscode.FileSystemWatcher 사용 금지 확인 (chokidar 불필요, API 기반으로 전환)
if grep -rEn "createFileSystemWatcher\s*\(" src/ 2>/dev/null; then
  echo ""
  echo "⚠️  vscode.workspace.createFileSystemWatcher() 호출 감지 — 제거 필요 (CLAUDE.md §3)"
  FAIL=$((FAIL + 1))
fi

# 9. 신규 서비스 파일 존재 확인
step "CredentialsReader.ts 존재" test -f src/services/CredentialsReader.ts
step "RateLimitPoller.ts 존재" test -f src/services/RateLimitPoller.ts
step "FileWatcher.ts 존재 (v0.0.5)" test -f src/services/FileWatcher.ts
step "JsonlParser.ts 존재 (v0.0.5)" test -f src/services/JsonlParser.ts
step "UsageAggregator.ts 존재 (v0.0.5)" test -f src/services/UsageAggregator.ts
step "WorkspaceMapper.ts 존재 (v0.0.5)" test -f src/services/WorkspaceMapper.ts
step "pricing.ts 존재 (v0.0.5)" test -f src/utils/pricing.ts

# 10. 단위 테스트 (러너인식 + fail-loud)
echo ""
echo "▶ 단위 테스트"
UNIT_TEST_FILES=$(find . -type d -name node_modules -prune -o \
    -type f \( -name '*.test.ts' -o -name '*.test.tsx' \
               -o -name '*.test.js' -o -name '*.test.jsx' \
               -o -name '*.spec.ts' -o -name '*.spec.tsx' \) -print 2>/dev/null \
  | grep -vE '(^|/)(e2e|tests/e2e)/|\.e2e\.' | head -1 || true)
UNIT_RUNNER=""
grep -qE '"vitest"' package.json 2>/dev/null && UNIT_RUNNER="vitest" || true
grep -qE '"jest"'   package.json 2>/dev/null && UNIT_RUNNER="jest"   || true
if [ -z "$UNIT_TEST_FILES" ]; then
  echo "  ℹ️  단위 테스트 없음 — 건너뜀 (통합 테스트는 별도 레이어에서 검증)"
elif [ -z "$UNIT_RUNNER" ]; then
  echo "  ❌ FAIL — 단위 테스트 파일이 존재하나 러너(vitest/jest) 미설치"
  FAIL=$((FAIL + 1))
elif ! grep -qE '"test"[[:space:]]*:' package.json 2>/dev/null; then
  echo "  ❌ FAIL — 단위 테스트 파일이 존재하나 package.json에 \"test\" 스크립트 없음"
  FAIL=$((FAIL + 1))
else
  TEST_EXIT=0
  npm run test > /tmp/verify-unittest-cpulse.log 2>&1 || TEST_EXIT=$?
  if [ "$TEST_EXIT" -ne 0 ]; then
    echo "  ❌ FAIL — 단위 테스트 실패 ($UNIT_RUNNER)"; tail -30 /tmp/verify-unittest-cpulse.log
    FAIL=$((FAIL + 1))
  else
    echo "  ✅ PASS — 단위 테스트 통과 ($UNIT_RUNNER)"
    PASS=$((PASS + 1))
  fi
fi

# 11. 디자인 토큰 게이트 (docs/design/DESIGN-TOKENS.md §13)
#   Ground Truth = src/webview/styles.css. 이 파일은 토큰 선언과 스타일시트를 겸하므로
#   판정은 파일 단위가 아니라 **줄 단위**다 — '^\s*--x:' 선언 줄의 hex/rgba는 정상이다.
#   (파일을 통째로 제외하면 드리프트가 2건으로 보이는 착시가 실제로 났다)
DESIGN_CSS="src/webview/styles.css"
if [ -f "$DESIGN_CSS" ] && [ -f docs/design/DESIGN-TOKENS.md ]; then
  echo ""
  echo "▶ 디자인 토큰 게이트"
  DT=$(mktemp -d)

  # ── D-0 측정 온전성 (fail) ──
  #   D-1/D-3은 '건수가 기준선 이하면 통과'다. 따라서 **측정이 붕괴하면 0건 = 개선**으로 읽힌다
  #   (파일 이동·형식 변경·grep 실패 시 파이프 끝 tr이 항상 성공해 0을 돌려준다).
  #   초록으로 보이는 고장이 가장 위험하므로, 재기 전에 자를 먼저 검사한다.
  DECL_MIN=50
  DECL_N=$(grep -cE '^[[:space:]]*--[a-zA-Z0-9-]+[[:space:]]*:' "$DESIGN_CSS") || DECL_N=0
  if [ "$DECL_N" -lt "$DECL_MIN" ]; then
    echo "  ❌ [D-0] 측정 실패 — 토큰 선언 ${DECL_N}개 (최소 $DECL_MIN 기대, 현재 GT는 108줄/66개)"
    echo "       $DESIGN_CSS 경로·선언 형식을 확인하라. 이 상태의 D-1/D-3 '통과'는 신뢰할 수 없다."
    FAIL=$((FAIL + 1))
    rm -rf "$DT"
  else

    # ── D-1 선언 밖 색 리터럴 (fail) ──
  #   백로그가 0이라 warn→fail로 승격했다(2026-08-28). 정당한 예외는 같은 줄 `design-lint-ignore`로 면제되므로
  #   승격해도 파이프라인이 오탐에 막히지 않는다. 기준선을 0이 아닌 값으로 되돌리려면 CLAUDE.md §9도 함께 고친다.
  #   ⚠️ hex만 세면 과소평가된다 — 착수 시 이 repo는 hex 41 < rgba 81이었다.
  DRIFT_BASELINE=0
  DRIFT=$(grep -nE '.*' "$DESIGN_CSS" | grep -vE '^[0-9]+:[[:space:]]*--' \
    | grep -v 'design-lint-ignore' \
    | grep -oE '#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)' | wc -l | tr -d ' ') || DRIFT=0
  if [ "$DRIFT" -gt "$DRIFT_BASELINE" ]; then
    echo "  ❌ [D-1] 선언 밖 색 리터럴 $DRIFT건 (기준선 $DRIFT_BASELINE)"
    grep -nE '.*' "$DESIGN_CSS" | grep -vE '^[0-9]+:[[:space:]]*--' | grep -v 'design-lint-ignore' \
      | grep -E '#[0-9a-fA-F]{3,8}\b|rgba?\(' | head -5 | sed 's/^/       /'
    echo "       --tint-*/--fg-*/--shadow-*/var(--vscode-*) 토큰으로 교체하거나, 정당하면 design-lint-ignore 주석"
    FAIL=$((FAIL + 1))
  else
    echo "  ✅ [D-1] 선언 밖 색 리터럴 0건"
  fi

  # ── D-2 미정의 토큰 참조 (fail) ──
    #   선언되지 않은 var(--x)는 브라우저가 **선언째 폐기**한다 — tsc·eslint·빌드 전부 통과하고
    #   스타일만 사라지는 무성 실패다. 실제로 .panel-title의 --ff-display가 이 상태였다(v0.1.52).
    #   폴백 var(--x, y)·동적 조립 var(--a-${k})은 같은 줄에서 ')'로 닫히는 참조만 매칭해 구조적으로 배제.
    grep -oE '^[[:space:]]*--[a-zA-Z0-9-]+[[:space:]]*:' "$DESIGN_CSS" \
      | sed -E 's/[[:space:]]//g; s/:$//' | sort -u > "$DT/decl"
    grep -oE 'var\(--[a-zA-Z0-9-]+\)' "$DESIGN_CSS" \
      | sed -E 's/var\((--[a-zA-Z0-9-]+)\)/\1/' | sort -u > "$DT/used"
    UNDEF=$(comm -23 "$DT/used" "$DT/decl") || UNDEF=""
    if [ -n "$UNDEF" ]; then
      echo "  ❌ [D-2] 미정의 토큰 참조 — 선언이 통째로 폐기된다(무성 실패):"
      echo "$UNDEF" | sed 's/^/       /'
      FAIL=$((FAIL + 1))
    else
      echo "  ✅ [D-2] 미정의 토큰 참조 0건"
    fi

    # ── D-3 다크/라이트 페어 (warn) ──
    #   DESIGN-TOKENS.md §0.5 신규 토큰 페어 의무. dead 토큰 21개 제거로 예외가 사라져 기준선은 0이다.
    PAIR_BASELINE=0
    awk '/^\.theme-dark[[:space:]]*\{/{f=1;next} f&&/^\}/{f=0} f' "$DESIGN_CSS" \
      | grep -oE '^[[:space:]]*--[a-zA-Z0-9-]+' | tr -d ' \t' | sort -u > "$DT/dark"
    awk '/^\.theme-light[[:space:]]*\{/{f=1;next} f&&/^\}/{f=0} f' "$DESIGN_CSS" \
      | grep -oE '^[[:space:]]*--[a-zA-Z0-9-]+' | tr -d ' \t' | sort -u > "$DT/light"
    UNPAIRED=$(comm -3 "$DT/dark" "$DT/light" | tr -d '\t' | sort -u) || UNPAIRED=""
    UNPAIRED_N=$(printf '%s' "$UNPAIRED" | grep -c . || true)
    if [ "$UNPAIRED_N" -gt "$PAIR_BASELINE" ]; then
      echo "  ⚠️  [D-3] 다크/라이트 페어 미충족 ${UNPAIRED_N}개 — 기준선 $PAIR_BASELINE 초과:"
      echo "$UNPAIRED" | sed 's/^/       /'
    else
      echo "  ✅ [D-3] 다크/라이트 페어 미충족 ${UNPAIRED_N}개 (기준선 $PAIR_BASELINE)"
    fi

    # ── D-4 TS에서만 소비되는 토큰 (fail) ──
    #   D-1~3은 styles.css 안에서만 재고, 그래서 **CSS에 var() 참조가 없는 토큰은 전부 dead로 보인다.**
    #   v0.1.54의 dead 토큰 21개 정리가 --c-fable을 그렇게 지웠고(실사용처는 panelView의
    #   getCssVar('--c-'+kind) 한 곳), Fable 도넛이 검정·바가 투명으로 v0.1.54~55 두 릴리스를
    #   나갔다. tsc·eslint·D-1~3이 전부 초록인 무성 실패였다.
    #   그래서 소비처를 CSS 밖까지 넓혀 재고한다: TS의 var(--x) 문자열 + getCssVar('--x') 리터럴
    #   + 모델 액센트 3종 패밀리(--c-/--tint-/--fg- × MODEL_KINDS + slate) 동적 조립분.
    TS_SRC=$(find src -name '*.ts' -not -path '*/node_modules/*' 2>/dev/null)
    if [ -z "$TS_SRC" ]; then
      echo "  ❌ [D-4] 측정 실패 — src/**/*.ts 를 찾지 못했다(이 상태의 '0건'은 신뢰할 수 없다)"
      FAIL=$((FAIL + 1))
    else
      # shellcheck disable=SC2086
      { grep -hoE 'var\(--[a-zA-Z0-9-]+\)' $TS_SRC | sed -E 's/var\((--[a-zA-Z0-9-]+)\)/\1/'
        # shellcheck disable=SC2086
        grep -hoE "getCssVar\('--[a-zA-Z0-9-]+'" $TS_SRC | sed -E "s/getCssVar\('(--[a-zA-Z0-9-]+)'/\1/"
      } | sort -u > "$DT/ts_used"

      #   패밀리는 MODEL_KINDS를 **소스에서 읽어** 전개한다 — 여기에 목록을 복사해두면 6번째 모델을
      #   토큰 없이 추가했을 때 게이트가 그 사실을 모른다(막으려는 사고를 그대로 재현).
      #   'slate'는 modelKind()='other'의 중립 폴백(§3#6 7+1 cap의 +1).
      #   '=' 앞은 잘라낸다 — 타입 주석 Exclude<ModelKind,'other'>의 'other'까지 종류로 읽혀
      #   --c-other/--tint-other/--fg-other 오탐이 난다('other'는 slate로 폴백되는 이름 없는 종류다).
      KINDS=$(grep -oE "MODEL_KINDS[^=]*=[[:space:]]*\[[^]]*\]" src/webview/webviewShared.ts \
        | sed -E 's/.*=[[:space:]]*\[//' | grep -oE "'[a-z]+'" | tr -d "'")
      KINDS_N=$(printf '%s' "$KINDS" | grep -c . || true)
      if [ "$KINDS_N" -lt 1 ]; then
        echo "  ❌ [D-4] 측정 실패 — MODEL_KINDS 추출 0건(webviewShared.ts 형식 변경?)"
        FAIL=$((FAIL + 1))
      else
        for k in $KINDS slate; do
          printf -- '--c-%s\n--tint-%s\n--fg-%s\n' "$k" "$k" "$k"
        done >> "$DT/ts_used"
        sort -u -o "$DT/ts_used" "$DT/ts_used"

        #   --vscode-* 는 VS Code가 주입한다 — styles.css에 선언이 없는 게 정상이라 대상 밖.
        grep -v '^--vscode-' "$DT/ts_used" > "$DT/ts_used_f" || true
        TS_UNDEF=$(comm -23 "$DT/ts_used_f" "$DT/decl") || TS_UNDEF=""
        if [ -n "$TS_UNDEF" ]; then
          echo "  ❌ [D-4] TS가 쓰는데 styles.css에 선언이 없는 토큰 — 무성 실패(검정·투명 렌더):"
          echo "$TS_UNDEF" | sed 's/^/       /'
          FAIL=$((FAIL + 1))
        else
          TS_N=$(grep -c . "$DT/ts_used_f" || true)
          echo "  ✅ [D-4] TS 소비 토큰 ${TS_N}개 전부 선언됨 (모델 액센트 ${KINDS_N}+1종 패밀리 포함)"
        fi
      fi
    fi

    # ── D-5 provider 팔레트 다크/라이트 페어 (warn, 측정 무결성 floor 포함) ──
    #   D-3은 `.theme-dark`/`.theme-light` 두 블록만 본다(awk `/^\.theme-dark[[:space:]]*\{/`) —
    #   `.provider-codex.theme-dark` 같은 compound 셀렉터는 그 패턴에 안 걸려 사각지대다(PLAN §5
    #   결정4: 팔레트가 4벌인데 D-3은 2벌만 본다). 이 게이트 없이는 Codex 쪽 다크/라이트 페어가
    #   깨져도 아무도 모른다.
    #   D-0과 같은 이유로 먼저 '측정이 살아있는가'부터 본다 — awk 셀렉터 문자열이 CSS 실제 표기와
    #   바이트 단위로 안 맞으면 매칭 0건 → unpaired 0건 → 거짓 ✅가 된다(advisor 지적, 붕괴가
    #   '개선'으로 읽히는 D-0과 동일 함정).
    PROVIDER_DECL_MIN=5
    awk '/^\.provider-codex\.theme-dark[[:space:]]*\{/{f=1;next} f&&/^\}/{f=0} f' "$DESIGN_CSS" \
      | grep -oE '^[[:space:]]*--[a-zA-Z0-9-]+' | tr -d ' \t' | sort -u > "$DT/pv-dark"
    awk '/^\.provider-codex\.theme-light[[:space:]]*\{/{f=1;next} f&&/^\}/{f=0} f' "$DESIGN_CSS" \
      | grep -oE '^[[:space:]]*--[a-zA-Z0-9-]+' | tr -d ' \t' | sort -u > "$DT/pv-light"
    PV_DARK_N=$(grep -c . "$DT/pv-dark" || true)
    PV_LIGHT_N=$(grep -c . "$DT/pv-light" || true)
    if [ "$PV_DARK_N" -lt "$PROVIDER_DECL_MIN" ] || [ "$PV_LIGHT_N" -lt "$PROVIDER_DECL_MIN" ]; then
      echo "  ❌ [D-5] 측정 실패 — .provider-codex.theme-dark ${PV_DARK_N}개 / .theme-light ${PV_LIGHT_N}개 선언(최소 $PROVIDER_DECL_MIN 기대)"
      echo "       셀렉터 표기가 바뀌었거나 블록이 삭제됐다. 이 상태의 페어 '통과'는 신뢰할 수 없다."
      FAIL=$((FAIL + 1))
    else
      PV_UNPAIRED=$(comm -3 "$DT/pv-dark" "$DT/pv-light" | tr -d '\t' | sort -u) || PV_UNPAIRED=""
      PV_UNPAIRED_N=$(printf '%s' "$PV_UNPAIRED" | grep -c . || true)
      if [ "$PV_UNPAIRED_N" -gt 0 ]; then
        echo "  ⚠️  [D-5] provider 팔레트 다크/라이트 페어 미충족 ${PV_UNPAIRED_N}개:"
        echo "$PV_UNPAIRED" | sed 's/^/       /'
      else
        echo "  ✅ [D-5] provider 팔레트 다크/라이트 페어 미충족 0개 (.provider-codex 다크 ${PV_DARK_N}개/라이트 ${PV_LIGHT_N}개)"
      fi
    fi

    rm -rf "$DT"
    PASS=$((PASS + 1))
  fi
fi

# 12. design-lint — 프로토타입 HTML (보고 전용, --gate 미적용)
#   D-TYPE-07(11px=--fs-label 등)·D-TOKEN-01은 의도/한계로 남는 값이라 게이트를 걸면 영구 red가 된다.
#   사유는 DESIGN-TOKENS.md §13.1. 담당 표면이 달라 위 D-1~3을 대체하지 않는다.
#   --token-source(실 선언 harvest, structured:true)로 전환(v0.1.53) — 이전 --tokens는 문서 전체를
#   정규식으로 긁는 unstructured 경로라 위반값을 문서에 적으면 허용집합에 흡수되는 결함이 있었다.
DESIGN_LINT="$HOME/.claude/skills/design-lint/scripts/design-lint.mjs"
DESIGN_TARGETS=$(ls docs/design/prototype/*.html 2>/dev/null || true)
if [ -n "$DESIGN_TARGETS" ] && [ -f "$DESIGN_LINT" ] && command -v node >/dev/null 2>&1; then
  echo ""
  echo "▶ design-lint (프로토타입 HTML · 보고 전용)"
  DL_OUT=$(timeout 60 node "$DESIGN_LINT" $DESIGN_TARGETS --token-source "$DESIGN_CSS" 2>&1) || true
  DL_E=$(printf '%s' "$DL_OUT" | grep -c '"severity": "error"' || true)
  DL_W=$(printf '%s' "$DL_OUT" | grep -c '"severity": "warn"' || true)
  echo "  ℹ️  error ${DL_E}건 · warn ${DL_W}건 (게이트 미적용 — DESIGN-TOKENS.md §13.1, --token-source $DESIGN_CSS)"
else
  [ -n "$DESIGN_TARGETS" ] && echo "  ℹ️  design-lint 스킵 — node 또는 스킬 스크립트 없음" || true
fi

finish
