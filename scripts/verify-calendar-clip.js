// Usage Calendar 폭 회귀 검증 — 좁은폭 클리핑(v0.1.44) + 고정폭/스트레치(미출시).
//
// 계약(대시보드·사이드탭 공통): 캘린더는 **고정 width**다. 셀 12px·열 피치 14px는 컨테이너 폭과
// 무관하게 불변이고, 표시 영역이 고정 그리드 폭보다 좁아지면 **가로 스크롤**로 처리한다(클리핑 금지).
//
// [Phase 1 · 대시보드 700px] 우측(최신) 클리핑 재발 방지 — ① 스크롤 발동 ② 기본 스크롤 우측 끝(오늘)
//   ③ 오늘 셀 가시 ④ 색상 셀 렌더 ⑤ 과거 탐색 위치 보존.
// [Phase 2 · 대시보드 1600px ko/en] stretch 재발 방지 — 좁은폭만 검증하던 탓에 v0.1.43~51 전 릴리즈가
//   이 구간을 통과시켰다. grid-auto-columns 미지정 시 트랙이 auto라 justify-content 기본값(stretch)이
//   남는 폭을 분배 → 셀 열만 벌어지고 14px 고정인 월 라벨과 최대 700px 어긋났다. 추가로 flex 아이템
//   기본 min-width:auto가 min-content 바닥으로 작용해 ko "10월"은 세로 줄바꿈(첫 셀 행 침범),
//   en "Aug"는 라벨 피치를 14px 초과시켜(누적 +26px) 좁은폭에서도 어긋났다.
// [Phase 3 · 사이드탭 300/420/180px] 같은 계약을 사이드바 미니뷰(90일=14주×14px=196px)에도 잠근다.
//
// Usage: npm run build 후 node scripts/verify-calendar-clip.js
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const PANEL_HTML = path.resolve(__dirname, '../docs/demo/panel.html');
const SIDEBAR_HTML = path.resolve(__dirname, '../docs/demo/sidebar.html');
const OUT_DIR = path.resolve(__dirname, '../.playwright-mcp');

const CELL_PITCH = 14; // .heat-cell 12px + .calendar-cells gap 2px
const PANEL_GRID_W = 54 * CELL_PITCH; // 371일 고정뷰 = 54주
const SIDEBAR_GRID_W = 14 * CELL_PITCH; // 90일 미니뷰 = 14주

/** historicalDays 목 데이터(비용>0, 오늘 포함) — 실사용 데이터 형상 재현 */
function daysPayload(n) {
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push({
      date: d.toISOString().slice(0, 10), inputTokens: 1000, outputTokens: 2000,
      cacheCreationTokens: 3000, cacheReadTokens: 40000, totalTokens: 46000,
      costUsd: 0.5 + (i % 5) * 0.7, cacheHitRate: 0.9,
    });
  }
  return days;
}

async function openPage(browser, html, viewport, lang) {
  const page = await browser.newPage({ bypassCSP: true, viewport });
  if (lang) await page.addInitScript((l) => { try { localStorage.setItem('ccg-lang', l); } catch { /* noop */ } }, lang);
  await page.goto('file://' + html, { waitUntil: 'networkidle' });
  // 데모 html은 실 IDE 폭을 고정값으로 흉내낸다 — 뷰포트 폭이 그대로 먹도록 해제
  await page.addStyleTag({ content: 'html,body{width:100% !important;}' });
  await page.waitForTimeout(600);
  return page;
}

async function pushDays(page, days) {
  await page.evaluate((d) => {
    window.__lastDays = d;
    const usage = { ...window.MOCK_USAGE, historicalDays: d };
    window.dispatchEvent(new MessageEvent('message', {
      data: { method: 'pushUsageSummary', receiver: { type: 'broadcast' }, params: usage },
    }));
  }, days);
  await page.waitForTimeout(600);
}

/** 캘린더 기하 계측 — 열 피치·라벨 피치·라벨 드리프트·줄바꿈 여부를 한 번에 뽑는다. */
function measure(page, rootSel) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const area = root?.querySelector('.calendar-grid-area');
    const cellsWrap = root?.querySelector('.calendar-cells');
    const months = root?.querySelector('.calendar-months');
    if (!area || !cellsWrap || !months) return { fail: `${sel} 캘린더 없음 (렌더 실패 or 수집중 고착)` };

    const cells = [...cellsWrap.querySelectorAll('.heat-cell')];
    const spans = [...months.querySelectorAll('span')];
    if (cells.length < 8 || spans.length < 2) return { fail: `${sel} 셀/라벨 부족` };

    const px = (el) => el.getBoundingClientRect();
    // 열 피치 = 같은 요일의 다음 주 셀(index+7)까지의 x 거리
    const colPitch = px(cells[7]).left - px(cells[0]).left;
    const labelPitch = px(spans[1]).left - px(spans[0]).left;
    // 라벨이 붙은 주(週)마다 라벨 x와 해당 열 x의 어긋남
    const drifts = spans
      .map((s, i) => ({ i, text: s.textContent.trim() }))
      .filter((x) => x.text && cells[x.i * 7])
      .map((x) => Math.round(px(spans[x.i]).left - px(cells[x.i * 7]).left));

    const today = cellsWrap.querySelector('.heat-cell.is-today');
    const areaRect = px(area);
    const todayRect = today ? px(today) : null;
    return {
      colPitch: Math.round(colPitch * 100) / 100,
      labelPitch: Math.round(labelPitch * 100) / 100,
      maxDrift: drifts.length ? Math.max(...drifts.map(Math.abs)) : 0,
      gridW: Math.round(px(cellsWrap).width),
      scrollWidth: area.scrollWidth,
      clientWidth: area.clientWidth,
      scrollLeft: area.scrollLeft,
      // 라벨이 14px 행을 넘어 아래(첫 셀 행)로 흘러넘치는지 = 세로 줄바꿈 발생 신호
      monthsScrollH: months.scrollHeight,
      colored: cellsWrap.querySelectorAll('.heat-cell.h1,.heat-cell.h2,.heat-cell.h3,.heat-cell.h4').length,
      todayVisible: !!todayRect && todayRect.right <= areaRect.right + 1 && todayRect.left >= areaRect.left - 1,
    };
  }, rootSel);
}

const checks = [];
const add = (ok, desc) => checks.push([!!ok, desc]);

async function phase1Narrow(browser) {
  const page = await openPage(browser, PANEL_HTML, { width: 700, height: 900 }, null);
  await pushDays(page, daysPayload(30));
  const r = await measure(page, '#panel-calendar-body');
  if (r.fail) { add(false, `[좁은폭] ${r.fail}`); await page.close(); return; }

  add(r.scrollWidth > r.clientWidth, `[대시보드 700px] 그리드 오버플로우 존재 (scrollWidth ${r.scrollWidth} > clientWidth ${r.clientWidth})`);
  add(r.scrollLeft >= r.scrollWidth - r.clientWidth - 2, `[대시보드 700px] 기본 스크롤 우측 끝 정렬 (scrollLeft ${r.scrollLeft})`);
  add(r.todayVisible, '[대시보드 700px] 오늘 셀이 뷰포트 안에 보임');
  add(r.colored > 0, `[대시보드 700px] 색상 셀 렌더됨 (${r.colored}개)`);

  // 과거 탐색 보존: 좌측으로 스크롤해둔 뒤 재푸시 → 위치 유지(scope-critic 회귀 잠금)
  const preserved = await page.evaluate(async () => {
    const area = document.querySelector('#panel-calendar-body .calendar-grid-area');
    if (!area) return null;
    area.scrollLeft = 0;
    const usage = { ...window.MOCK_USAGE, historicalDays: window.__lastDays };
    window.dispatchEvent(new MessageEvent('message', {
      data: { method: 'pushUsageSummary', receiver: { type: 'broadcast' }, params: usage },
    }));
    await new Promise((res) => setTimeout(res, 300));
    return document.querySelector('#panel-calendar-body .calendar-grid-area')?.scrollLeft ?? null;
  });
  add(preserved !== null && preserved <= 2, `[대시보드 700px] 과거 탐색 위치가 재푸시에도 보존됨 (scrollLeft ${preserved})`);

  await page.evaluate(() => document.getElementById('panel-calendar-card')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT_DIR, 'calendar-clip-700px.png'), fullPage: false });
  await page.close();
}

async function phase2Wide(browser) {
  for (const lang of ['ko', 'en']) {
    const page = await openPage(browser, PANEL_HTML, { width: 1600, height: 900 }, lang);
    await pushDays(page, daysPayload(40));
    const r = await measure(page, '#panel-calendar-body');
    if (r.fail) { add(false, `[대시보드 1600px ${lang}] ${r.fail}`); await page.close(); continue; }

    add(r.colPitch === CELL_PITCH, `[대시보드 1600px ${lang}] 셀 열 피치 고정 ${CELL_PITCH}px (실측 ${r.colPitch})`);
    add(r.labelPitch === CELL_PITCH, `[대시보드 1600px ${lang}] 월 라벨 피치 고정 ${CELL_PITCH}px (실측 ${r.labelPitch})`);
    add(r.maxDrift === 0, `[대시보드 1600px ${lang}] 라벨↔열 어긋남 0px (실측 ${r.maxDrift})`);
    add(r.gridW === PANEL_GRID_W, `[대시보드 1600px ${lang}] 그리드 폭이 카드 폭을 따라 늘어나지 않음 (${r.gridW}px = 54주×${CELL_PITCH}px)`);
    add(r.monthsScrollH <= CELL_PITCH, `[대시보드 1600px ${lang}] 월 라벨 세로 줄바꿈 없음 (scrollHeight ${r.monthsScrollH} ≤ ${CELL_PITCH})`);

    if (lang === 'ko') {
      await page.evaluate(() => document.getElementById('panel-calendar-card')?.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(200);
      const card = await page.$('#panel-calendar-card');
      if (card) await card.screenshot({ path: path.join(OUT_DIR, 'calendar-fixed-1600px-ko.png') });
    }
    await page.close();
  }
}

async function phase3Sidebar(browser) {
  // 넓은 사이드바 2종 — 폭이 달라도 그리드는 동일 고정폭이어야 한다
  for (const width of [300, 420]) {
    const page = await openPage(browser, SIDEBAR_HTML, { width, height: 900 }, 'ko');
    await pushDays(page, daysPayload(90));
    const r = await measure(page, '.sb-calendar-wrap');
    if (r.fail) { add(false, `[사이드탭 ${width}px] ${r.fail}`); await page.close(); continue; }

    add(r.colPitch === CELL_PITCH, `[사이드탭 ${width}px] 셀 열 피치 고정 ${CELL_PITCH}px (실측 ${r.colPitch})`);
    add(r.maxDrift === 0, `[사이드탭 ${width}px] 라벨↔열 어긋남 0px (실측 ${r.maxDrift})`);
    add(r.gridW === SIDEBAR_GRID_W, `[사이드탭 ${width}px] 그리드 폭이 사이드바 폭을 따라 늘어나지 않음 (${r.gridW}px = 14주×${CELL_PITCH}px)`);
    add(r.monthsScrollH <= CELL_PITCH, `[사이드탭 ${width}px] 월 라벨 세로 줄바꿈 없음 (scrollHeight ${r.monthsScrollH})`);

    if (width === 300) {
      const el = await page.$('.sb-calendar-wrap');
      if (el) await el.screenshot({ path: path.join(OUT_DIR, 'calendar-sidebar-300px-ko.png') });
    }
    await page.close();
  }

  // 좁은 사이드바 — 고정 그리드 폭보다 좁아지면 클리핑이 아니라 스크롤로 처리되어야 한다
  const narrow = await openPage(browser, SIDEBAR_HTML, { width: 180, height: 900 }, 'ko');
  await pushDays(narrow, daysPayload(90));
  const n = await measure(narrow, '.sb-calendar-wrap');
  if (n.fail) {
    add(false, `[사이드탭 180px] ${n.fail}`);
  } else {
    add(n.colPitch === CELL_PITCH, `[사이드탭 180px] 좁아져도 셀이 줄지 않음 (피치 ${n.colPitch}px)`);
    add(n.scrollWidth > n.clientWidth, `[사이드탭 180px] 고정폭 초과분은 가로 스크롤 (scrollWidth ${n.scrollWidth} > clientWidth ${n.clientWidth})`);
  }
  await narrow.close();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  try {
    await phase1Narrow(browser);
    await phase2Wide(browser);
    await phase3Sidebar(browser);
  } finally {
    await browser.close();
  }

  console.log('───────── Usage Calendar 고정폭·스크롤 회귀 검증 ─────────');
  let pass = true;
  for (const [ok, desc] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${desc}`);
    if (!ok) pass = false;
  }
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
