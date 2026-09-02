// 실제 VS Code Extension Development Host를 띄워(진짜 익스텐션 로드, mock 아님) 사이드바
// 렌더링을 스크린샷으로 확인한다. docs/demo/*.html(가짜 postMessage) 검증과 달리 실제
// activate() → SidebarViewProvider → chokidar/jsonl 파싱 → 실 ~/.claude 데이터 경로를 탄다.
// Usage: xvfb-run -a node scripts/verify-real-extension-visual.mjs
// verify-gate: skip(non-hermetic) — 실 ~/.claude 데이터와 로컬 VS Code 바이너리에 의존해
//   머신마다 결과가 다르다. 게이트에 넣으면 재현 불가능한 red를 만든다. 육안 검증 전용.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
// VS Code 바이너리는 버전을 하드코딩하지 않는다 — .vscode-test/에 여러 버전이 공존하고
// (실측 2026-08-31: 1.126.0 · 1.135.0), 하드코딩한 버전이 정리되면 이 스크립트가 조용히 죽는다.
const codeBin = (() => {
  const root = path.resolve(repo, '.vscode-test');
  const dirs = fs.existsSync(root)
    ? fs.readdirSync(root).filter((d) => d.startsWith('vscode-linux-x64-')).sort()
    : [];
  if (!dirs.length) throw new Error('.vscode-test에 VS Code 바이너리가 없습니다 — npm run test:e2e를 먼저 1회 실행하세요');
  return path.resolve(root, dirs[dirs.length - 1], 'code');
})();
const OUT_DIR = path.resolve(repo, '.playwright-mcp');
const DEBUG_PORT = 9333;

function tmpDir(name) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `ccg-${name}-`));
  return d;
}

/**
 * VS Code 웹뷰는 중첩 sandboxed iframe(outer webview iframe → inner active-frame)에 렌더된다.
 * page.locator()는 기본적으로 최상위 문서만 보므로, page.frames()로 전체 프레임(중첩 포함)을
 * 순회해 텍스트가 있는 프레임을 찾아 그 프레임 자신의 locator로 클릭한다 — 좌표 하드코딩 없이
 * 뷰포트/해상도/레이아웃 변경에 견고하다.
 */
async function clickInAnyFrame(page, text, { timeout = 3000 } = {}) {
  for (const frame of page.frames()) {
    if (frame.isDetached()) continue;
    try {
      const loc = frame.getByText(text, { exact: false });
      if (await loc.count() > 0) {
        await loc.first().click({ timeout });
        return true;
      }
    } catch { /* 이 프레임엔 없음 — 다음 프레임 시도 */ }
  }
  return false;
}

async function waitForCdp(port, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('CDP 포트가 열리지 않음(타임아웃)');
}

async function main() {
  if (!fs.existsSync(codeBin)) throw new Error(`VS Code 바이너리 없음: ${codeBin}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const userData = tmpDir('userdata');
  const extDir = tmpDir('extensions');

  const args = [
    `--extensionDevelopmentPath=${repo}`,
    `--user-data-dir=${userData}`,
    `--extensions-dir=${extDir}`,
    '--disable-extensions',
    '--disable-workspace-trust',
    '--disable-gpu',
    '--no-sandbox',
    '--skip-release-notes',
    '--skip-welcome',
    `--remote-debugging-port=${DEBUG_PORT}`,
    repo, // 워크스페이스로 이 repo 자체를 연다 — 실 ~/.claude jsonl과 워크스페이스 매핑 재현
  ];

  console.log('▶ VS Code Extension Development Host 기동...');
  const child = spawn(codeBin, args, { stdio: 'inherit', env: { ...process.env } });

  let browser;
  try {
    await waitForCdp(DEBUG_PORT);
    console.log('▶ CDP 연결...');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);

    // 워크벤치 메인 렌더러 페이지를 찾을 때까지 폴링(창 로딩 타이밍)
    let page = null;
    for (let i = 0; i < 20; i++) {
      const contexts = browser.contexts();
      for (const ctx of contexts) {
        for (const p of ctx.pages()) {
          if (p.url().includes('workbench') || await p.title().catch(() => '').then(t => t.includes('Visual Studio Code') || t.includes(''))) {
            page = p;
          }
        }
      }
      if (page) break;
      await new Promise(r => setTimeout(r, 500));
    }
    if (!page) {
      const ctx = browser.contexts()[0];
      page = ctx.pages()[0];
    }
    if (!page) throw new Error('워크벤치 페이지를 찾지 못함');

    console.log(`▶ 페이지 확보: ${await page.title().catch(() => '(제목 없음)')}`);
    await page.waitForTimeout(3000); // 익스텐션 activate + onStartupFinished 대기

    // Command Palette로 사이드바 뷰 열기
    await page.keyboard.press('Control+Shift+P');
    await page.waitForTimeout(400);
    await page.keyboard.type('View: Show Claude Code Gauge');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4000); // chokidar 초기 스캔 + jsonl 파싱 + 렌더 대기

    await page.screenshot({ path: path.join(OUT_DIR, 'real-extension-sidebar-t1.png') });

    // 첫 폴링(레이트리밋 API 왕복)이 늦을 수 있음 — 안 끝났으면 Retry 클릭 후 더 기다림
    const retried = await clickInAnyFrame(page, 'Retry');
    if (retried) {
      console.log('▶ "Connecting..." 상태 — Retry 클릭 후 대기...');
      await page.waitForTimeout(6000);
    } else {
      await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: path.join(OUT_DIR, 'real-extension-sidebar.png') });
    console.log('✅ 사이드바 스크린샷 저장: .playwright-mcp/real-extension-sidebar.png');

    // "Open Dashboard" 버튼 — 프레임 순회로 실제 버튼을 찾아 클릭(좌표 하드코딩 없음)
    const opened = await clickInAnyFrame(page, 'Open Dashboard');
    if (opened) {
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(OUT_DIR, 'real-extension-dashboard.png') });
      console.log('✅ 대시보드 스크린샷 저장: .playwright-mcp/real-extension-dashboard.png');
    } else {
      console.log('⚠ "Open Dashboard" 버튼을 어느 프레임에서도 찾지 못함 — 대시보드 캡처 생략');
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 500));
    if (!child.killed) child.kill('SIGKILL');
  }
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
