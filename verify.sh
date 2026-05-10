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
step "package.json name=claudepulse" bash -c "grep -q '\"name\": \"claudepulse\"' package.json"

# 7. CRITICAL — vscode.FileSystemWatcher 사용 금지 확인 (chokidar 불필요, API 기반으로 전환)
if grep -rEn "createFileSystemWatcher\s*\(" src/ 2>/dev/null; then
  echo ""
  echo "⚠️  vscode.workspace.createFileSystemWatcher() 호출 감지 — 제거 필요 (CLAUDE.md §3)"
  FAIL=$((FAIL + 1))
fi

# 8. CRITICAL — 구 jsonl 서비스 파일 미존재 확인
for f in src/services/JsonlParser.ts src/services/FileWatcher.ts src/services/UsageAggregator.ts src/services/CacheStore.ts; do
  if [ -f "$f" ]; then
    echo "⚠️  폐기된 파일 존재: $f"
    FAIL=$((FAIL + 1))
  fi
done
echo ""
echo "▶ 폐기 파일 미존재 확인"
echo "  ✅ PASS"
PASS=$((PASS + 1))

# 9. 신규 서비스 파일 존재 확인
step "CredentialsReader.ts 존재" test -f src/services/CredentialsReader.ts
step "RateLimitPoller.ts 존재" test -f src/services/RateLimitPoller.ts

# 10. vitest 단위 테스트
step "vitest unit tests" npx vitest run --reporter=verbose

echo ""
echo "═══════════════════════════════════════"
echo "  Verify 결과: PASS=$PASS · FAIL=$FAIL"
echo "═══════════════════════════════════════"

[[ $FAIL -eq 0 ]] || exit 1
