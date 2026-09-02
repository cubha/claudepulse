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
// [Phase 3 · 사이드탭 300/420/180px] 같은 계약을 사이드바 미니뷰(90일)에도 잠근다. 오늘 셀 가시성 포함.
//
// [v0.1.55] 두 가지를 고쳤다:
//   (B) 기대 열 수를 `54` 고정 상수로 쓰던 것 → **seed 날짜에서 유도**. 캘린더는 월요일 시작 정렬을
//       위해 windowStart 요일만큼 앞을 패딩하므로 총 열 수 = ceil((windowDays + pad)/7)이고,
//       371 = 53×7이라 pad=0인 날(7일 중 1일)만 53주다. 그래서 이 하네스는 v0.1.52~54 동안
//       "7일 중 1일만 빨개지는" 상태였고, 그 변동이 결함 A의 상시 실패를 설명 속에 흡수했다.
//       → `page.clock.setFixedTime()`으로 **pad 0~6 seed 7개를 전수 스윕**해 결정론으로 바꾼다.
//       기대값은 seed에서 독립 유도한다 — DOM 측정 pitch에서 유도하면 그리드가 stretch돼도
//       pitch가 같이 커져 항상 참이 되고(동어반복), v0.1.52의 704px 드리프트를 다시 놓친다.
//   (A) "렌더 후 컨테이너가 좁아져도 우측 끝 유지"를 명시 조건으로 만들어 단언한다. 자연 발생에
//       기대면 브라우저 버전에 따라 조용히 사라진다.
//
// Usage: npm run build 후 node scripts/verify-calendar-clip.js
// verify-gate: full — 헤드리스 chromium + docs/demo 고정 입력, 외부 상태 의존 없음(hermetic)
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const PANEL_HTML = path.resolve(__dirname, '../docs/demo/panel.html');
const SIDEBAR_HTML = path.resolve(__dirname, '../docs/demo/sidebar.html');
const OUT_DIR = path.resolve(__dirname, '../.playwright-mcp');

const CELL_PITCH = 14; // .heat-cell 12px + .calendar-cells gap 2px
const PANEL_WINDOW_DAYS = 371;   // webviewShared.ts CALENDAR_WINDOW_DAYS
const SIDEBAR_WINDOW_DAYS = 90;  // webviewShared.ts SIDEBAR_CALENDAR_WINDOW_DAYS
const MIN_CHECKS = 42;           // D-0류 바닥 — 검사 0건이 초록으로 통과하는 것을 막는다

/** pad 0~6을 전수 커버하는 연속 7일. 연속 날짜는 windowStart 요일도 연속이므로 이 7개면 충분하다. */
const SEEDS = ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02',
               '2026-09-03', '2026-09-04', '2026-09-05'];

const isoDow = (d) => (d.getUTCDay() + 6) % 7; // 0=Mon..6=Sun — calendarView.ts와 동일 식

/** windowStart 요일 = 월요일 시작 정렬을 위한 앞쪽 패딩 셀 수(0~6). */
function padOf(seed, windowDays) {
  const start = new Date(`${seed}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  return isoDow(start);
}

/** seed 날짜와 windowDays에서 기대 열 수를 **독립 유도**한다(DOM 측정값을 쓰지 않는다). */
function expectedWeeks(seed, windowDays) {
  return Math.ceil((windowDays + padOf(seed, windowDays)) / 7);
}
const expectedGridW = (seed, windowDays) => expectedWeeks(seed, windowDays) * CELL_PITCH;

/**
 * historicalDays 목 데이터(비용>0, 오늘 포함) — 실사용 데이터 형상 재현.
 * seed를 주면 그 날짜를 '오늘'로 삼는다(page.clock으로 고정한 브라우저 시계와 맞춰야 하기 때문).
 */
function daysPayload(n, seed) {
  const days = [];
  const now = seed ? new Date(`${seed}T00:00:00Z`) : new Date();
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

async function openPage(browser, html, viewport, lang, seed) {
  const page = await browser.newPage({ bypassCSP: true, viewport });
  if (lang) await page.addInitScript((l) => { try { localStorage.setItem('ccg-lang', l); } catch { /* noop */ } }, lang);
  // 브라우저 시계 고정 — 프로덕션 코드에 테스트 훅을 심지 않고 요일 의존을 결정론으로 바꾼다.
  // (panelView.ts / sidebarView.ts의 `new Date()`를 그대로 두고 우회한다)
  if (seed) await page.clock.setFixedTime(new Date(`${seed}T12:00:00Z`));
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
      cellCount: cells.length,
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

  // [v0.1.55 결함 A 회귀 잠금] 렌더 **이후** 컨테이너가 좁아져도 우측 끝(오늘)을 유지해야 한다.
  // 원 결함은 innerHTML 직후 대입한 scrollLeft가 그 시점 폭으로 클램프된 뒤 재스크롤이 없어
  // 생겼다. 자연 발생(세로 스크롤바 출현)에 기대면 브라우저 버전에 따라 조용히 사라지므로
  // 조건을 명시적으로 만든다.
  const shrunk = await page.evaluate(async () => {
    const card = document.getElementById('panel-calendar-card');
    const area = document.querySelector('#panel-calendar-body .calendar-grid-area');
    if (!card || !area) return null;
    card.style.width = '420px';
    await new Promise((res) => setTimeout(res, 300));
    const today = area.querySelector('.heat-cell.is-today');
    const ar = area.getBoundingClientRect(), tr = today?.getBoundingClientRect();
    return {
      atEnd: area.scrollLeft >= area.scrollWidth - area.clientWidth - 2,
      todayVisible: !!tr && tr.right <= ar.right + 1 && tr.left >= ar.left - 1,
    };
  });
  add(shrunk?.atEnd, '[대시보드 700px→축소] 렌더 후 폭이 줄어도 우측 끝 유지');
  add(shrunk?.todayVisible, '[대시보드 700px→축소] 폭이 줄어도 오늘 셀이 보임');
  // 폭 원복 — 뒤따르는 '과거 탐색 보존' 검사가 원래 조건에서 돌아야 한다.
  await page.evaluate(async () => {
    const card = document.getElementById('panel-calendar-card');
    if (card) card.style.width = '';
    await new Promise((res) => setTimeout(res, 200));
  });

  // [v0.1.55] 숨겨진 상태에서 재렌더된 뒤 다시 보일 때도 계약이 적용되는가.
  // 대시보드 패널은 retainContextWhenHidden:true라 숨겨진 동안 렌더가 멈춰 rAF가 발화하지
  // 않는다 — 그 사이 push가 오면 스크롤이 설정되지 않은 채 남고, 탭을 다시 열면 사용자는
  // 왼쪽 끝(과거)을 보게 된다. 헤드리스에서 VS Code의 숨김을 그대로 재현할 수는 없으므로
  // **같은 메커니즘**(렌더 시점 폭 0 → 이후 레이아웃 발생)을 display:none으로 만든다.
  const hidden = await page.evaluate(async () => {
    const card = document.getElementById('panel-calendar-card');
    if (!card) return null;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    card.style.display = 'none';
    await sleep(100);
    window.dispatchEvent(new MessageEvent('message', {
      data: { method: 'pushUsageSummary', receiver: { type: 'broadcast' }, params: { ...window.MOCK_USAGE, historicalDays: window.__lastDays } },
    }));
    await sleep(300);
    card.style.display = '';
    await sleep(500);
    const area = document.querySelector('#panel-calendar-body .calendar-grid-area');
    if (!area) return null;
    const today = area.querySelector('.heat-cell.is-today');
    const ar = area.getBoundingClientRect(), tr = today?.getBoundingClientRect();
    return {
      atEnd: area.scrollLeft >= area.scrollWidth - area.clientWidth - 2,
      todayVisible: !!tr && tr.right <= ar.right + 1 && tr.left >= ar.left - 1,
    };
  });
  add(hidden?.atEnd, '[대시보드 700px·숨김중 재렌더] 다시 보일 때 우측 끝으로 복귀');
  add(hidden?.todayVisible, '[대시보드 700px·숨김중 재렌더] 다시 보일 때 오늘 셀이 보임');

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
  // [v0.1.55 결함 B] pad 0~6 전수 스윕. 기대값은 seed에서 유도하고 DOM에서 읽지 않는다 —
  // 측정 pitch로 기대 폭을 만들면 그리드가 stretch돼도 pitch가 같이 커져 항상 참이 된다.
  for (const seed of SEEDS) {
    const pad = padOf(seed, PANEL_WINDOW_DAYS);
    const weeks = expectedWeeks(seed, PANEL_WINDOW_DAYS);
    const wantW = expectedGridW(seed, PANEL_WINDOW_DAYS);
    const page = await openPage(browser, PANEL_HTML, { width: 1600, height: 900 }, 'ko', seed);
    await pushDays(page, daysPayload(40, seed));
    const r = await measure(page, '#panel-calendar-body');
    if (r.fail) { add(false, `[seed ${seed}] ${r.fail}`); await page.close(); continue; }

    add(r.cellCount === PANEL_WINDOW_DAYS + pad,
      `[seed ${seed} pad=${pad}] 셀 수 ${PANEL_WINDOW_DAYS}+${pad}=${PANEL_WINDOW_DAYS + pad} (실측 ${r.cellCount})`);
    add(r.gridW === wantW,
      `[seed ${seed} pad=${pad}] 그리드 폭 ${weeks}주×${CELL_PITCH}px=${wantW} (실측 ${r.gridW})`);
    add(r.colPitch === CELL_PITCH, `[seed ${seed}] 셀 열 피치 고정 ${CELL_PITCH}px (실측 ${r.colPitch})`);
    add(r.maxDrift === 0, `[seed ${seed}] 라벨↔열 어긋남 0px (실측 ${r.maxDrift})`);
    await page.close();
  }

  // 로캘별 라벨 줄바꿈·피치는 요일과 무관한 축이라 seed 1개로 충분하다.
  for (const lang of ['ko', 'en']) {
    const seed = SEEDS[0];
    const page = await openPage(browser, PANEL_HTML, { width: 1600, height: 900 }, lang, seed);
    await pushDays(page, daysPayload(40, seed));
    const r = await measure(page, '#panel-calendar-body');
    if (r.fail) { add(false, `[대시보드 1600px ${lang}] ${r.fail}`); await page.close(); continue; }

    add(r.labelPitch === CELL_PITCH, `[대시보드 1600px ${lang}] 월 라벨 피치 고정 ${CELL_PITCH}px (실측 ${r.labelPitch})`);
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
  const SEED = SEEDS[0]; // pad=0 — 사이드바에서도 최소 열 수 경계를 밟는다
  // 넓은 사이드바 2종 — 폭이 달라도 그리드는 동일 고정폭이어야 한다
  for (const width of [300, 420]) {
    const page = await openPage(browser, SIDEBAR_HTML, { width, height: 900 }, 'ko', SEED);
    await pushDays(page, daysPayload(90, SEED));
    const r = await measure(page, '.sb-calendar-wrap');
    if (r.fail) { add(false, `[사이드탭 ${width}px] ${r.fail}`); await page.close(); continue; }

    add(r.colPitch === CELL_PITCH, `[사이드탭 ${width}px] 셀 열 피치 고정 ${CELL_PITCH}px (실측 ${r.colPitch})`);
    add(r.maxDrift === 0, `[사이드탭 ${width}px] 라벨↔열 어긋남 0px (실측 ${r.maxDrift})`);
    add(r.gridW === expectedGridW(SEED, SIDEBAR_WINDOW_DAYS),
      `[사이드탭 ${width}px] 그리드 폭이 사이드바 폭을 따라 늘어나지 않음 (${r.gridW}px = ${expectedWeeks(SEED, SIDEBAR_WINDOW_DAYS)}주×${CELL_PITCH}px)`);
    add(r.todayVisible, `[사이드탭 ${width}px] 오늘 셀이 보임`);
    add(r.monthsScrollH <= CELL_PITCH, `[사이드탭 ${width}px] 월 라벨 세로 줄바꿈 없음 (scrollHeight ${r.monthsScrollH})`);

    if (width === 300) {
      const el = await page.$('.sb-calendar-wrap');
      if (el) await el.screenshot({ path: path.join(OUT_DIR, 'calendar-sidebar-300px-ko.png') });
    }
    await page.close();
  }

  // 좁은 사이드바 — 고정 그리드 폭보다 좁아지면 클리핑이 아니라 스크롤로 처리되어야 한다.
  // [v0.1.55 결함 A-2] 여기서 "오늘이 보이는가"를 단언한다. v0.1.54까지 사이드바에는 스크롤
  // 정렬 코드가 아예 없어 왼쪽 끝(과거)만 보였는데, 기존 단언이 "오버플로가 존재하는가"만
  // 봤기 때문에 통과했다 — 오버플로는 결함이 있어도 존재한다.
  for (const width of [180, 220]) {
    const narrow = await openPage(browser, SIDEBAR_HTML, { width, height: 900 }, 'ko', SEED);
    await pushDays(narrow, daysPayload(90, SEED));
    const n = await measure(narrow, '.sb-calendar-wrap');
    if (n.fail) {
      add(false, `[사이드탭 ${width}px] ${n.fail}`);
    } else {
      add(n.colPitch === CELL_PITCH, `[사이드탭 ${width}px] 좁아져도 셀이 줄지 않음 (피치 ${n.colPitch}px)`);
      add(n.scrollWidth > n.clientWidth, `[사이드탭 ${width}px] 고정폭 초과분은 가로 스크롤 (scrollWidth ${n.scrollWidth} > clientWidth ${n.clientWidth})`);
      add(n.scrollLeft >= n.scrollWidth - n.clientWidth - 2, `[사이드탭 ${width}px] 기본 스크롤 우측 끝 정렬 (scrollLeft ${n.scrollLeft})`);
      add(n.todayVisible, `[사이드탭 ${width}px] 오늘 셀이 보임`);
    }
    await narrow.close();
  }
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
  // D-0류 바닥 — 필터·조기 return으로 검사 수가 붕괴하면 "0건 실패 = 초록"이 된다.
  if (checks.length < MIN_CHECKS) {
    console.error(`❌ 검사 수 ${checks.length} < ${MIN_CHECKS} — 하네스 붕괴(측정 무결성 위반)`);
    process.exit(1);
  }
  let pass = true;
  for (const [ok, desc] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${desc}`);
    if (!ok) pass = false;
  }
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
