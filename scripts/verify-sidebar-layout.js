// 사이드바 레이아웃 회귀 검증 (v0.1.45) — "대시보드 열기" 버튼이 초과사용량 섹션에 바로
// 붙어 렌더되던 버그(#root height 부재 → .sb-spacer flex:1이 밀어낼 여유공간 없음) 수정 확인.
// ① 콘텐츠가 뷰포트보다 짧을 때 버튼이 최하단에 고정되는지
// ② 콘텐츠가 뷰포트를 초과할 때(캘린더 포함) 잘리지 않고 스크롤되는지
// Usage: npm run build 후 node scripts/verify-sidebar-layout.js
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const HTML_PATH = path.resolve(__dirname, '../docs/demo/sidebar.html');
const OUT_DIR = path.resolve(__dirname, '../.playwright-mcp');
const VIEWPORT = { width: 300, height: 600 };

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ bypassCSP: true, viewport: VIEWPORT });
  await page.goto('file://' + HTML_PATH, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200); // mock-data.js의 지연 재푸시(800ms) 대기

  // ① 짧은 콘텐츠(캘린더 없음, MOCK_USAGE.historicalDays=[]) — 버튼 최하단 고정 확인
  const shortCase = await page.evaluate(() => {
    const layout = document.querySelector('.sb-layout');
    const btn = document.querySelector('.sb-dashboard-wrap');
    if (!layout || !btn) return { fail: '.sb-layout 또는 .sb-dashboard-wrap 없음' };
    const layoutRect = layout.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    return {
      layoutBottom: layoutRect.bottom,
      btnBottom: btnRect.bottom,
      gap: layoutRect.bottom - btnRect.bottom,
    };
  });

  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, 'sidebar-layout-short.png'), fullPage: false });

  // ② 긴 콘텐츠 — historicalDays를 대량 주입해 콘텐츠 총 높이가 뷰포트를 초과하는 상황을 강제 재현
  //    (v0.1.45 ST3 캘린더 삽입 전이라도, sb-usage-row의 칩 행들만으로는 오버플로가 안 나므로
  //     여기서는 스크롤 메커니즘 자체—overflow-y:auto가 실제로 스크롤 가능해지는지—를 검증한다)
  const overflowCase = await page.evaluate(() => {
    const layout = document.querySelector('.sb-layout');
    if (!layout) return { fail: '.sb-layout 없음' };
    // flex-shrink:0 명시 — 실제 sb-* 섹션들(sb-header/sb-ws-card/sb-dashboard-wrap 등)은
    // 전부 flex-shrink:0이라 컨테이너보다 커도 줄어들지 않고 오버플로를 유발한다. 이 합성
    // spacer도 동일하게 맞춰야 실제 신규 섹션(ST3 캘린더) 추가 시나리오를 충실히 재현한다.
    const spacer = document.createElement('div');
    spacer.style.height = '2000px';
    spacer.style.flexShrink = '0';
    spacer.setAttribute('data-test-spacer', '1');
    layout.insertBefore(spacer, document.querySelector('.sb-dashboard-wrap'));
    return {
      scrollHeight: layout.scrollHeight,
      clientHeight: layout.clientHeight,
      canScroll: layout.scrollHeight > layout.clientHeight,
    };
  });
  await page.evaluate(() => { document.querySelector('.sb-layout').scrollTop = 999999; });
  const scrolledToBottom = await page.evaluate(() => {
    const layout = document.querySelector('.sb-layout');
    const btn = document.querySelector('.sb-dashboard-wrap');
    const layoutRect = layout.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    return Math.abs(layoutRect.bottom - btnRect.bottom) <= 2;
  });
  await page.screenshot({ path: path.join(OUT_DIR, 'sidebar-layout-overflow.png'), fullPage: false });

  await browser.close();

  console.log('───────── 사이드바 레이아웃 회귀 검증 (300×600) ─────────');
  if (shortCase.fail) { console.log(`❌ ${shortCase.fail}`); process.exit(1); }
  if (overflowCase.fail) { console.log(`❌ ${overflowCase.fail}`); process.exit(1); }

  const pinnedBottom = shortCase.gap <= 2; // 콘텐츠 < 뷰포트 시 버튼이 레이아웃 최하단에 붙어야 함
  const checks = [
    [pinnedBottom, `짧은 콘텐츠 — 대시보드 버튼이 sb-layout 최하단에 고정됨 (gap ${shortCase.gap.toFixed(1)}px)`],
    [overflowCase.canScroll, `긴 콘텐츠 — sb-layout이 스크롤 가능해짐 (scrollHeight ${overflowCase.scrollHeight} > clientHeight ${overflowCase.clientHeight})`],
    [scrolledToBottom, '긴 콘텐츠 — 스크롤 시 버튼까지 도달(잘림 없음)'],
  ];
  let pass = true;
  for (const [ok, desc] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${desc}`);
    if (!ok) pass = false;
  }
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
