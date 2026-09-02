// verify-gate: full — 헤드리스 chromium + docs/demo 고정 입력, 외부 상태 의존 없음(hermetic)
// 사이드바 미니 Usage Calendar 검증 (v0.1.45 ST3, 90일/3개월 윈도우로 확정 — 60일 이하는
// 12px 셀 기준 사이드바 기본폭을 못 채우고 120일은 넘쳐 스크롤 유발, 실측 비교로 90일 확정).
// ① 초과사용량 섹션과 대시보드 버튼 사이에 정확히 위치하는지 (DOM 순서)
// ② 사이드바 폭(300px) 안에 가로 스크롤 없이 들어가는지
// ③ 레전드가 생략됐는지(공간절약 설계)
// ④ historicalDays 데이터가 없으면 섹션 자체가 렌더되지 않는지
// Usage: npm run build 후 node scripts/verify-sidebar-calendar.js
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const HTML_PATH = path.resolve(__dirname, '../docs/demo/sidebar.html');
const OUT_DIR = path.resolve(__dirname, '../.playwright-mcp');
const VIEWPORT = { width: 300, height: 900 };
const WINDOW_DAYS = 90; // webviewShared.ts SIDEBAR_CALENDAR_WINDOW_DAYS와 동일하게 유지
// [v0.1.55] 브라우저 시계를 고정해 셀 수를 결정론으로 만든다. 그전에는 `90~96 범위`라는 느슨한
// 단언이었는데, 그 폭이 곧 요일 패딩(0~6)이라 "요일 때문에 흔들린다"를 회피만 하고 감시는 포기했다.
// seed를 고정하면 패딩이 확정되므로 정확값으로 조일 수 있다.
const SEED = '2026-08-30'; // pad=0 — 최소 열 수 경계
const isoDow = (d) => (d.getUTCDay() + 6) % 7;
const PAD = (() => {
  const st = new Date(`${SEED}T00:00:00Z`);
  st.setUTCDate(st.getUTCDate() - (WINDOW_DAYS - 1));
  return isoDow(st);
})();

function daysPayload() {
  const days = [];
  const now = new Date(`${SEED}T00:00:00Z`);
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    days.push({
      date, inputTokens: 1000, outputTokens: 2000, cacheCreationTokens: 3000,
      cacheReadTokens: 40000, totalTokens: 46000, costUsd: i % 4 === 0 ? 0 : 0.3 + (i % 5) * 0.6, cacheHitRate: 0.9,
    });
  }
  return days;
}

async function pushDays(page, days) {
  await page.evaluate((d) => {
    const usage = { ...window.MOCK_USAGE, historicalDays: d };
    window.dispatchEvent(new MessageEvent('message', {
      data: { method: 'pushUsageSummary', receiver: { type: 'broadcast' }, params: usage },
    }));
  }, days);
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ bypassCSP: true, viewport: VIEWPORT });
  await page.clock.setFixedTime(new Date(`${SEED}T12:00:00Z`));
  await page.goto('file://' + HTML_PATH, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  await pushDays(page, daysPayload());

  const withData = await page.evaluate(() => {
    const wrap = document.querySelector('.sb-calendar-wrap');
    const overage = document.querySelector('.sb-overage-wrap');
    const dashBtn = document.querySelector('.sb-dashboard-wrap');
    if (!wrap) return { fail: '.sb-calendar-wrap 렌더 안 됨' };
    const layout = document.querySelector('.sb-layout');
    const layoutRect = layout.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    // DOM 순서: overage → calendar → dashboard 버튼
    const orderOk = !!(overage && dashBtn
      && overage.compareDocumentPosition(wrap) & Node.DOCUMENT_POSITION_FOLLOWING
      && wrap.compareDocumentPosition(dashBtn) & Node.DOCUMENT_POSITION_FOLLOWING);
    const gridArea = wrap.querySelector('.calendar-grid-area');
    const gridRect = gridArea.getBoundingClientRect();
    return {
      orderOk,
      noHorizontalOverflow: gridRect.right <= layoutRect.right + 1,
      noLegend: !wrap.querySelector('.calendar-legend'),
      cellCount: wrap.querySelectorAll('.heat-cell').length,
      coloredCount: wrap.querySelectorAll('.heat-cell.h1,.heat-cell.h2,.heat-cell.h3,.heat-cell.h4').length,
      todayMarker: !!wrap.querySelector('.heat-cell.is-today'),
      // "마커가 DOM에 있는가"는 오늘이 화면 밖으로 잘려도 참이다(v0.1.55 결함 A-2가 그렇게
      // 통과했다). 실제로 보이는지를 재야 한다.
      todayVisible: (() => {
        const td = wrap.querySelector('.heat-cell.is-today');
        if (!td) return false;
        const a = gridArea.getBoundingClientRect(), t = td.getBoundingClientRect();
        return t.right <= a.right + 1 && t.left >= a.left - 1;
      })(),
    };
  });

  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, 'sidebar-calendar-dark.png'), fullPage: false });

  // 라이트 테마
  await page.evaluate(() => {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT_DIR, 'sidebar-calendar-light.png'), fullPage: false });

  // hasData=false → 섹션 생략
  await pushDays(page, []);
  const noData = await page.evaluate(() => ({
    wrapAbsent: !document.querySelector('.sb-calendar-wrap'),
  }));
  await page.screenshot({ path: path.join(OUT_DIR, 'sidebar-calendar-empty.png'), fullPage: false });

  await browser.close();

  console.log('───────── 사이드바 미니 캘린더 검증 (300×900) ─────────');
  if (withData.fail) { console.log(`❌ ${withData.fail}`); process.exit(1); }
  const checks = [
    [withData.orderOk, 'DOM 순서: 초과사용량 → 캘린더 → 대시보드 버튼'],
    [withData.noHorizontalOverflow, `가로 오버플로 없음 (grid.right ${withData.noHorizontalOverflow})`],
    [withData.noLegend, '레전드(Less/More) 생략됨'],
    [withData.cellCount === WINDOW_DAYS + PAD, `셀 개수 ${WINDOW_DAYS}+${PAD}=${WINDOW_DAYS + PAD} 정확 일치 (실제 ${withData.cellCount})`],
    [withData.coloredCount > 0, `색상 셀 렌더됨 (${withData.coloredCount}개)`],
    [withData.todayMarker, '오늘 마커 존재'],
    [withData.todayVisible, '오늘 셀이 실제로 보임(잘리지 않음)'],
    [noData.wrapAbsent, '데이터 없을 때 섹션 자체 생략(수집중 placeholder 아님)'],
  ];
  let pass = true;
  for (const [ok, desc] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${desc}`);
    if (!ok) pass = false;
  }
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
