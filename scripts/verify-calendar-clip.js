// Usage Calendar 좁은폭 회귀 검증 (v0.1.44) — 우측(최신) 클리핑 버그 재발 방지.
// 카드 폭 < 그리드 고정폭(54주×14px)일 때: ① 가로 스크롤이 실제로 발동하고
// ② 기본 스크롤이 오른쪽 끝(오늘)이며 ③ 오늘 셀이 뷰포트 안에 보여야 PASS.
// Usage: npm run build 후 node scripts/verify-calendar-clip.js
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const HTML_PATH = path.resolve(__dirname, '../docs/demo/panel.html');
const OUT_DIR = path.resolve(__dirname, '../.playwright-mcp');

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ bypassCSP: true, viewport: { width: 700, height: 900 } });
  await page.goto('file://' + HTML_PATH, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 최근 30일 historicalDays(비용>0, 오늘 포함) 주입 — 클리핑 버그의 실사용 데이터 형상 재현
  await page.evaluate(() => {
    const days = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const date = d.toISOString().slice(0, 10);
      days.push({
        date, inputTokens: 1000, outputTokens: 2000, cacheCreationTokens: 3000,
        cacheReadTokens: 40000, totalTokens: 46000, costUsd: 0.5 + (i % 5) * 0.7, cacheHitRate: 0.9,
      });
    }
    window.__lastDays = days; // 보존 검증 재푸시용
    const usage = { ...window.MOCK_USAGE, historicalDays: days };
    window.dispatchEvent(new MessageEvent('message', {
      data: { method: 'pushUsageSummary', receiver: { type: 'broadcast' }, params: usage },
    }));
  });
  await page.waitForTimeout(600);

  const r = await page.evaluate(() => {
    const area = document.querySelector('#panel-calendar-body .calendar-grid-area');
    if (!area) return { fail: 'calendar-grid-area 없음 (렌더 실패 or 수집중 고착)' };
    const today = area.querySelector('.heat-cell.is-today');
    const areaRect = area.getBoundingClientRect();
    const todayRect = today ? today.getBoundingClientRect() : null;
    return {
      scrollWidth: area.scrollWidth,
      clientWidth: area.clientWidth,
      scrollLeft: area.scrollLeft,
      colored: area.querySelectorAll('.heat-cell.h1,.heat-cell.h2,.heat-cell.h3,.heat-cell.h4').length,
      todayVisible: !!todayRect && todayRect.right <= areaRect.right + 1 && todayRect.left >= areaRect.left - 1,
    };
  });

  // 과거 탐색 보존 검증: 좌측으로 스크롤해둔 뒤 재푸시 → 위치가 유지되어야 함(scope-critic 회귀 잠금)
  const preserved = await page.evaluate(async () => {
    const area = document.querySelector('#panel-calendar-body .calendar-grid-area');
    if (!area) return null;
    area.scrollLeft = 0;
    const usage = { ...window.MOCK_USAGE, historicalDays: window.__lastDays };
    window.dispatchEvent(new MessageEvent('message', {
      data: { method: 'pushUsageSummary', receiver: { type: 'broadcast' }, params: usage },
    }));
    await new Promise((res) => setTimeout(res, 300));
    const after = document.querySelector('#panel-calendar-body .calendar-grid-area');
    return after ? after.scrollLeft : null;
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await page.evaluate(() => document.getElementById('panel-calendar-card')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT_DIR, 'calendar-clip-700px.png'), fullPage: false });
  await browser.close();

  console.log('───────── Usage Calendar 좁은폭(700px) 회귀 검증 ─────────');
  if (r.fail) { console.log(`❌ ${r.fail}`); process.exit(1); }
  const overflows = r.scrollWidth > r.clientWidth;
  const rightAligned = r.scrollLeft >= r.scrollWidth - r.clientWidth - 2;
  const checks = [
    [overflows, `그리드 오버플로우 존재 (scrollWidth ${r.scrollWidth} > clientWidth ${r.clientWidth})`],
    [rightAligned, `기본 스크롤 우측 끝 정렬 (scrollLeft ${r.scrollLeft})`],
    [r.todayVisible, '오늘 셀이 뷰포트 안에 보임'],
    [r.colored > 0, `색상 셀 렌더됨 (${r.colored}개)`],
    [preserved !== null && preserved <= 2, `과거 탐색 위치가 재푸시에도 보존됨 (scrollLeft ${preserved})`],
  ];
  let pass = true;
  for (const [ok, desc] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${desc}`);
    if (!ok) pass = false;
  }
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
