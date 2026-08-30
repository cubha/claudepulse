// 웹뷰 전면 DOM digest 골든 하네스 (v0.1.54 ST4).
//
// 목적: main.ts(1882줄, ST5에서 sidebarView.ts/panelView.ts/panelCharts.ts/webviewApi.ts로 분리 예정)의
// update* 렌더 함수 ~20개 중 하나가 분리 과정에서 조용히 안 불리게 돼도(호출 누락, import 누락, 모듈
// 경계에서 상태 공유 실패 등) 잡아낸다. 기존 verify-calendar-clip.js는 `.calendar-*` 셀렉터만 보므로
// 캘린더 아닌 섹션이 죽어도 통과한다 — 캘린더 stretch 회귀(9릴리스 통과, memory: feedback_webview_ui_verification)와
// 동일한 실패 클래스라 전면으로 확장했다. 캘린더 자체의 기하 계약(피치·드리프트)은 verify-calendar-clip.js가
// 계속 전담 — 이 스크립트는 "섹션이 살아있는가"만 본다(대체 아니라 병행).
//
// docs/demo/{panel,sidebar}.html — 실 빌드(dist/webview/main.js) + fake postMessage(acquireVsCodeApi mock).
// 목업 HTML이 아니라 실 빌드 산출물을 로드한다(feedback_webview_ui_verification 교훈).
//
// Usage:
//   npm run build && node scripts/verify-webview-surface.mjs --capture   # 골든 캡처(분리 전, 1회)
//   npm run build && node scripts/verify-webview-surface.mjs            # 골든과 비교(분리 후 회귀 게이트)
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PANEL_HTML = path.resolve(__dirname, '../docs/demo/panel.html');
const SIDEBAR_HTML = path.resolve(__dirname, '../docs/demo/sidebar.html');
const GOLDEN_PATH = path.resolve(__dirname, '../test/golden/webview-surface.json');

const WIDTHS = [700, 1600];
const LANGS = ['ko', 'en'];

// main.ts가 실제로 만드는 id 전수(2026-08-30 grep 확정) — panel 모드 카드/차트/빈상태 + sidebar 모드
// 레이트리밋 바/컨텍스트 게이지. 새 id가 생기면 이 목록에 추가해야 그 섹션도 감시 대상이 된다.
const PANEL_IDS = [
  'panel-plan-badge', 'panel-status', 'panel-fallback-banner',
  'panel-fh-card', 'fh-remaining', 'fh-bar-fill', 'fh-reset',
  'panel-sd-card', 'sd-remaining', 'sd-bar-fill', 'sd-reset', 'burn-rate-val', 'burn-rate-hr', 'safe-until-val', 'safe-until-proj',
  'panel-daily-card', 'chart-daily', 'daily-empty',
  'panel-calendar-card', 'panel-calendar-body',
  'panel-model-card', 'panel-model-body',
  'panel-cache-card', 'panel-cache-body', 'chart-cache-spark',
  'panel-tool-card', 'chart-tools', 'tools-empty',
  'panel-files-card', 'panel-files-list',
  'panel-session-card', 'panel-session-list',
  'panel-branch-card', 'panel-branch-list',
  'panel-retro-card', 'panel-retro-list',
  'panel-skill-card', 'panel-skill-list', 'panel-mcp-list',
  'panel-longterm-card', 'chart-longterm', 'longterm-empty',
  'panel-monthly-card', 'chart-monthly', 'monthly-empty',
  'chart-trend', 'trend-empty',
];
// sidebar 모드(buildSidebarHtml, main.ts:390-631)가 실제로 만드는 id는 4개뿐 — 나머지 텍스트 값은
// id 없이 렌더된다(2026-08-30 grep 재확인, 최초 초안의 fh-*/sd-*/burn-rate-*는 panel 전용 오분류였음).
const SIDEBAR_IDS = ['sb-ov-bar', 'sb-fh-bar', 'sb-sd-bar', 'sb-ctx-bar'];

const SURFACES = [
  { mode: 'panel', html: PANEL_HTML, ids: PANEL_IDS },
  { mode: 'sidebar', html: SIDEBAR_HTML, ids: SIDEBAR_IDS },
];

async function openPage(browser, html, viewport, lang) {
  const page = await browser.newPage({ viewport, bypassCSP: true });
  await page.addInitScript((l) => { try { localStorage.setItem('ccg-lang', l); } catch { /* noop */ } }, lang);
  await page.goto('file://' + html, { waitUntil: 'networkidle' });
  // 데모 html은 실 IDE 폭을 인라인 고정값(752px/300px)으로 흉내낸다 — 뷰포트 폭이 그대로 먹도록 해제
  await page.addStyleTag({ content: 'html,body{width:100% !important;}' });
  // mock-data.js의 pushMockData가 300ms·800ms에 발화 + chart.js 렌더 — 여유있게 대기
  await page.waitForTimeout(1500);
  return page;
}

/** 커버리지 자체가 무너지는 것(golden capture 시 id 전부 null) 방지 — id 배열이 잘못되면 즉시 드러나야 함. */
function digest(ids) {
  const bySelector = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    bySelector[id] = el
      ? { tag: el.tagName.toLowerCase(), childElementCount: el.childElementCount, hasText: el.textContent.trim().length > 0 }
      : null;
  }
  const root = document.getElementById('root');
  return {
    bySelector,
    counts: {
      totalElements: root ? root.querySelectorAll('*').length : 0,
      canvases: root ? root.querySelectorAll('canvas').length : 0,
      heatCells: root ? root.querySelectorAll('.heat-cell').length : 0,
    },
  };
}

async function captureAll(browser) {
  const result = {};
  for (const surface of SURFACES) {
    for (const width of WIDTHS) {
      for (const lang of LANGS) {
        const key = `${surface.mode}@${width}px@${lang}`;
        const page = await openPage(browser, surface.html, { width, height: 900 }, lang);
        const d = await page.evaluate(digest, surface.ids);
        result[key] = d;
        await page.close();
      }
    }
  }
  return result;
}

function diffDigests(golden, current) {
  const diffs = [];
  const keys = new Set([...Object.keys(golden), ...Object.keys(current)]);
  for (const key of keys) {
    const g = golden[key];
    const c = current[key];
    if (!g || !c) { diffs.push(`${key}: 캡처 자체가 없음(golden=${!!g}, current=${!!c})`); continue; }
    for (const id of Object.keys(g.bySelector)) {
      const gv = g.bySelector[id];
      const cv = c.bySelector[id];
      const gExists = gv !== null;
      const cExists = cv !== null;
      if (gExists !== cExists) {
        diffs.push(`${key} #${id}: 존재 여부 변경 (golden=${gExists} → current=${cExists})`);
        continue;
      }
      if (gExists && gv.childElementCount !== cv.childElementCount) {
        diffs.push(`${key} #${id}: childElementCount ${gv.childElementCount} → ${cv.childElementCount}`);
      }
      if (gExists && gv.hasText !== cv.hasText) {
        diffs.push(`${key} #${id}: hasText ${gv.hasText} → ${cv.hasText}`);
      }
    }
    // totalElements/heatCells는 날짜의존이다 — buildCalendarCells가 그리드 시작 요일까지 패딩해
    // windowDays(371/90)에 today가 속한 주의 요일(0~6)만큼을 더 얹으므로, 캡처 시점과 비교 시점의
    // 요일이 다르면 코드 변경 없이도 최대 ±6개(1주 미만)가 흔들린다(advisor 확인, 2026-08-30).
    // canvases는 Chart.js 인스턴스 수라 날짜와 무관 — 계속 비교한다.
    if (g.counts.canvases !== c.counts.canvases) {
      diffs.push(`${key} counts.canvases: ${g.counts.canvases} → ${c.counts.canvases}`);
    }
  }
  return diffs;
}

async function main() {
  const mode = process.argv.includes('--capture') ? 'capture' : 'check';
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  let current;
  try {
    current = await captureAll(browser);
  } finally {
    await browser.close();
  }

  if (mode === 'capture') {
    fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
    fs.writeFileSync(GOLDEN_PATH, JSON.stringify(current, null, 2) + '\n', 'utf8');
    console.log(`✅ 골든 캡처 완료: ${GOLDEN_PATH} (${Object.keys(current).length}개 조합)`);
    process.exit(0);
  }

  if (!fs.existsSync(GOLDEN_PATH)) {
    console.error(`❌ 골든 파일 없음: ${GOLDEN_PATH} — 먼저 --capture로 생성하세요`);
    process.exit(1);
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  const diffs = diffDigests(golden, current);
  if (diffs.length === 0) {
    console.log(`✅ 웹뷰 전면 DOM digest — golden과 diff 0건 (${Object.keys(current).length}개 조합)`);
    process.exit(0);
  }
  console.error(`❌ 웹뷰 전면 DOM digest — diff ${diffs.length}건`);
  for (const d of diffs) console.error(`  - ${d}`);
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
