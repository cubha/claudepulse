#!/usr/bin/env bash
# verify.sh — Claudepulse 통합 검증 스크립트
# 호출: bash verify.sh

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PASS=0
FAIL=0

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

# 1. node_modules 존재
step "node_modules 존재 확인" test -d node_modules

# 2. TypeScript 타입 체크
step "TypeScript typecheck" npx tsc --noEmit

# 3. ESLint
step "ESLint" npx eslint src --ext ts

# 4. esbuild 빌드
step "esbuild build" node esbuild.config.mjs

# 5. dist 산출물 확인
step "dist/extension.js 생성 확인" test -f dist/extension.js
step "dist/webview/main.js 생성 확인" test -f dist/webview/main.js
step "dist/webview/styles.css 복사 확인" test -f dist/webview/styles.css

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

echo ""
echo "═══════════════════════════════════════"
echo "  Verify 결과: PASS=$PASS · FAIL=$FAIL"
echo "═══════════════════════════════════════"

[[ $FAIL -eq 0 ]] || exit 1
