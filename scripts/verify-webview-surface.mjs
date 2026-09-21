// 웹뷰 전면 DOM digest 골든 하네스 (v0.1.54 ST4).
// verify-gate: full — 헤드리스 chromium + docs/demo 고정 입력, 외부 상태 의존 없음(hermetic)
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
const PANEL_CODEX_HTML = path.resolve(__dirname, '../docs/demo/panel-codex.html');
const SIDEBAR_CODEX_HTML = path.resolve(__dirname, '../docs/demo/sidebar-codex.html');
const GOLDEN_PATH = path.resolve(__dirname, '../test/golden/webview-surface.json');

const WIDTHS = [700, 1600];
const LANGS = ['ko', 'en'];

// main.ts가 실제로 만드는 id 전수(2026-08-30 grep 확정) — panel 모드 카드/차트/빈상태 + sidebar 모드
// 레이트리밋 바/컨텍스트 게이지. 새 id가 생기면 이 목록에 추가해야 그 섹션도 감시 대상이 된다.
const PANEL_IDS = [
  'panel-plan-badge', 'panel-status', 'panel-fallback-banner',
  'panel-fh-card', 'fh-remaining', 'fh-bar-fill', 'fh-reset',
  'panel-sd-card', 'sd-remaining', 'sd-bar-fill', 'sd-reset', 'burn-rate-val', 'burn-rate-hr', 'safe-until-val', 'safe-until-proj',
  'panel-cost-period-card', 'chart-daily', 'daily-empty',
  'cost-pane-daily', 'cost-pane-longterm', 'cost-pane-monthly',
  'panel-calendar-card', 'panel-calendar-body',
  'panel-model-card', 'panel-model-body',
  'panel-cache-card', 'panel-cache-body', 'chart-cache-spark',
  'panel-tool-card', 'chart-tools', 'tools-empty',
  'panel-files-card', 'panel-files-list',
  'panel-session-card', 'panel-session-list',
  'panel-branch-card', 'panel-branch-list',
  'panel-retro-card', 'panel-retro-list',
  'panel-skill-card', 'panel-skill-list', 'panel-mcp-list',
  'chart-longterm', 'longterm-empty',
  'chart-monthly', 'monthly-empty',
  'chart-trend', 'trend-empty',
];
// sidebar 모드(buildSidebarHtml, main.ts:390-631)가 실제로 만드는 id는 4개뿐 — 나머지 텍스트 값은
// id 없이 렌더된다(2026-08-30 grep 재확인, 최초 초안의 fh-*/sd-*/burn-rate-*는 panel 전용 오분류였음).
const SIDEBAR_IDS = ['sb-ov-bar', 'sb-fh-bar', 'sb-sd-bar', 'sb-ctx-bar'];

// codex axis에서 **정당하게** 미렌더되는 id(PLAN §8 불변식3 "빈 값과 0 값을 같게 그리지 않는다" —
// 없는 개념을 채워 넣지 않고, 대신 여기서 "이 provider엔 원래 없다"고 명시한다).
// sidebar: ST7 구현 완료(2026-09-19) — buildCodexSidebarHtml이 fiveHour/sevenDay/overage/컨텍스트
// 게이지를 전혀 쓰지 않고 버킷 배열 기반 동적 id(sb-codex-bucket-N)로 그린다. 감시 목록(SIDEBAR_IDS)의
// 고정 4개는 애초에 Codex 개념이 아니라서 전부 null이 정상이다 — 새 동적 id는 이 감시망 밖이라
// (고정 목록 계약, assertCoverage 주석 참조) 별도 스냅샷 차원의 확인은 Extension Dev Host 캡처가 맡는다.
// panel: panelView.ts는 아직 provider 미분기(ST6 미착수) — 그대로 0.
const CODEX_EXPECTED_NULL_IDS = { sidebar: ['sb-ov-bar', 'sb-fh-bar', 'sb-sd-bar', 'sb-ctx-bar'], panel: [] };

// provider 축(P2, v0.2.0) — main.ts는 아직 provider를 몰라(ST6 이전) 렌더 함수는 Claude용 그대로다.
// codex 변형은 같은 HTML 골격에 mock-data-codex.js(Codex 실 fixture 파생값, skill/subagent/mcp
// 실제로 빈 배열)를 꽂아넣는다 — id 구조는 같아도 skillBreakdown 등 빈 배열을 만나는 기존
// empty-state 경로를 실제로 통과시켜 캡처하므로 byte-identical 중복이 아니다(PLAN §4 P-2).
// ST6이 "빈 섹션 자체를 안 그림(null)"으로 바꾸면 이 축에서 diff가 나는 게 정상 — 그때
// --accept-regression 사유로 ST6 SubTask를 적는다(순서 역전 금지 계약).
const SURFACES = [
  { mode: 'panel', provider: 'claude', html: PANEL_HTML, ids: PANEL_IDS },
  { mode: 'sidebar', provider: 'claude', html: SIDEBAR_HTML, ids: SIDEBAR_IDS },
  { mode: 'panel', provider: 'codex', html: PANEL_CODEX_HTML, ids: PANEL_IDS },
  { mode: 'sidebar', provider: 'codex', html: SIDEBAR_CODEX_HTML, ids: SIDEBAR_IDS },
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

/** 페이지 안에서 실행돼 감시 id별 구조 지문을 만든다. 무결성 검사는 assertCoverage()가 한다. */
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

/**
 * D-0류 감시망 무결성 (v0.1.55). 이 하네스의 diff 루프는 **골든**의 id를 순회하므로,
 * 골든의 bySelector가 비어 있거나 null투성이면 내부 루프가 0회 돌아 **diff 0건 = 초록**이 된다.
 * 즉 감시망이 붕괴한 상태가 "이상 없음"으로 읽힌다 — verify.sh D-0이 막으려는 것과 같은 부류다.
 * (v0.1.54에서 실제로 id 2건이 감시망에서 빠져 있었고, 게이트가 아니라 사람이 잡았다.)
 */
function assertCoverage(digests, label) {
  const problems = [];
  for (const surface of SURFACES) {
    for (const width of WIDTHS) {
      for (const lang of LANGS) {
        const key = `${surface.mode}@${width}px@${lang}@${surface.provider}`;
        const d = digests[key];
        if (!d || !d.bySelector) { problems.push(`${key}: 캡처 없음`); continue; }
        const watched = Object.keys(d.bySelector);
        if (watched.length !== surface.ids.length) {
          problems.push(`${key}: 감시 id 수 ${watched.length} ≠ 선언 ${surface.ids.length}`);
        }
        const expectedNull = surface.provider === 'codex' ? (CODEX_EXPECTED_NULL_IDS[surface.mode] ?? []) : [];
        const nulls = watched.filter((id) => d.bySelector[id] === null && !expectedNull.includes(id));
        if (nulls.length) problems.push(`${key}: 렌더 안 된 감시 id ${nulls.length}건 — ${nulls.join(', ')}`);
      }
    }
  }
  if (problems.length) {
    console.error(`❌ 감시망 무결성 위반(${label}) ${problems.length}건 — 이 상태의 diff 0건은 무의미하다`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

async function captureAll(browser) {
  const result = {};
  for (const surface of SURFACES) {
    for (const width of WIDTHS) {
      for (const lang of LANGS) {
        const key = `${surface.mode}@${width}px@${lang}@${surface.provider}`;
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
      // 감시 목록에서 id를 **뺀** 경우 current엔 키 자체가 없다(=undefined). null(=요소 미렌더)과
      // 구분하지 않으면 아래 childElementCount 접근이 TypeError로 죽어 재캡처 자체가 불가능해진다
      // — id는 그동안 추가만 돼서 드러나지 않았던 경로다(2026-09-18 카드 제거 시 실측).
      if (!(id in c.bySelector)) {
        diffs.push(`${key} #${id}: 감시 목록에서 제거됨(golden에만 존재)`);
        continue;
      }
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
    // 오염된 골든이 애초에 저장되지 않게 한다 — 저장된 뒤에는 그것이 새 '정답'이 된다.
    assertCoverage(current, 'capture');

    // 실패 시 가장 싼 해결책이 '재캡처'가 되면 이 하네스는 회귀를 못 잡는다. 기존 골든이
    // 있으면 사유를 강제한다(verify.sh D-1의 기준선이 소스 안 상수라 완화하려면 코드를
    // 고쳐야 하고 그 diff가 리뷰에 남는 것과 같은 구조).
    const reasonIdx = process.argv.indexOf('--accept-regression');
    const reason = reasonIdx >= 0 ? process.argv[reasonIdx + 1] : null;
    if (fs.existsSync(GOLDEN_PATH) && !reason) {
      console.error('❌ 기존 골든이 있습니다. 회귀가 아님을 확인한 경우에만 사유와 함께 덮어쓰세요:');
      console.error('   node scripts/verify-webview-surface.mjs --capture --accept-regression "<사유>"');
      process.exit(1);
    }
    if (fs.existsSync(GOLDEN_PATH)) {
      const prev = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
      const changed = diffDigests(prev.digests ?? prev, current);
      console.log(`ℹ️  이전 골든 대비 변경 ${changed.length}건 — 사유: ${reason}`);
      for (const d of changed) console.log(`  - ${d}`);
    }

    // 언제·왜 갱신했는지를 골든 안에 남긴다 — 재캡처는 큰 기계생성 diff라 리뷰에서 스킵되기
    // 쉬운데, 파일 첫 줄에 사유가 있으면 diff만 보고도 "이건 회귀를 덮은 것"인지 알 수 있다.
    const payload = {
      capturedAt: new Date().toISOString(),
      reason: reason ?? '최초 캡처',
      digests: current,
    };
    fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
    fs.writeFileSync(GOLDEN_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log(`✅ 골든 캡처 완료: ${GOLDEN_PATH} (${Object.keys(current).length}개 조합)`);
    process.exit(0);
  }

  if (!fs.existsSync(GOLDEN_PATH)) {
    console.error(`❌ 골든 파일 없음: ${GOLDEN_PATH}`);
    console.error('   최초 생성만 --capture로 합니다. 실패 해결책으로 재캡처하지 마세요.');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  const golden = raw.digests ?? raw;  // v0.1.55에서 메타 래핑 도입, 구 평문 포맷도 읽는다
  assertCoverage(golden, 'golden');   // 골든이 붕괴해 있으면 diff 0건은 거짓 초록이다
  assertCoverage(current, 'current');
  const diffs = diffDigests(golden, current);
  if (diffs.length === 0) {
    const meta = raw.capturedAt ? ` · golden ${raw.capturedAt.slice(0, 10)} "${raw.reason}"` : '';
    console.log(`✅ 웹뷰 전면 DOM digest — golden과 diff 0건 (${Object.keys(current).length}개 조합)${meta}`);
    process.exit(0);
  }
  console.error(`❌ 웹뷰 전면 DOM digest — diff ${diffs.length}건`);
  for (const d of diffs) console.error(`  - ${d}`);
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
