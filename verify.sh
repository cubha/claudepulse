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

# 7. CRITICAL 코드 패턴 — chokidar import 확인 (vscode.FileSystemWatcher 사용 시 경고)
if grep -rEn "createFileSystemWatcher\s*\(" src/ 2>/dev/null; then
  echo ""
  echo "⚠️  vscode.workspace.createFileSystemWatcher() 호출 감지 — chokidar로 교체 필요 (CLAUDE.md §3)"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "═══════════════════════════════════════"
echo "  Verify 결과: PASS=$PASS · FAIL=$FAIL"
echo "═══════════════════════════════════════"

[[ $FAIL -eq 0 ]] || exit 1
