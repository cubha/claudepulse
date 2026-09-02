// verify-gate: full — 헤드리스 chromium + docs/demo 고정 입력, 외부 상태 의존 없음(hermetic)
//
// v0.1.55 ST9·ST10 회귀 검증.
//
// ST10(행 상한): 최근 편집 파일·최근 세션·브랜치 목록이 상한 없이 카드를 세로로 밀어내던 문제.
//   상한을 두되 **잘랐다는 사실과 남은 개수를 노출**해야 한다 — 조용한 절단은 "그게 전부"로 읽힌다.
//   그래서 개수만이 아니라 버튼 라벨의 +N, 펼침/접힘 왕복까지 단언한다.
//
// ST9(가격 신호 정직성): 가격표에 없는 모델의 costUsd=0이 측정된 0처럼 share 분모·분자에 들어가
//   레거시 모델이 100%를 독식하던 문제. 경고·기준표시·"가격 미상" 표기가 실제로 렌더되는지 본다.
//   ⚠️ "$0.00이 안 보인다"까지 단언한다 — 경고만 띄우고 옆에 $0.00을 나란히 찍으면 고친 게 아니다.
//
// 폭·로캘 단일 조합 검증 금지(feedback_webview_ui_verification): 고정폭 미만/초과 2점 × ko/en 스윕.
// Usage: npm run build 후 node scripts/verify-list-cap.js
const { chromium } = require('playwright-core');
const path = require('path');

const HTML_PATH = path.resolve(__dirname, '../docs/demo/panel.html');
const CAP = 6;              // panelView.ts LIST_COLLAPSED_ROWS와 동일하게 유지
const FILE_COUNT = 20;      // UsageAggregator top-20
const SESSION_COUNT = 20;
const BRANCH_COUNT = 12;
const WIDTHS = [700, 1600]; // 대시보드 좁은/넓은 2점
const LANGS = ['ko', 'en'];
const MIN_CHECKS = 40;      // D-0류 바닥 — 검사가 조용히 사라지면 실패시킨다

const results = [];
const check = (ok, label) => results.push([!!ok, label]);

function payload() {
  const now = Date.now();
  return {
    recentEditedFiles: Array.from({ length: FILE_COUNT }, (_, i) => `src/services/File${i}.ts`),
    recentSessions: Array.from({ length: SESSION_COUNT }, (_, i) => ({
      sessionId: `s${i}`,
      startTime: new Date(now - i * 3600e3).toISOString(),
      lastActivity: new Date(now - i * 3600e3).toISOString(),
      cwd: '/mnt/d/workspace/claudepulse',
      totalTokens: 10000 + i, costUsd: 0.5, messageCount: 10 + i,
      model: 'claude-sonnet-5', contextTokens: 1000, branch: 'main',
    })),
    branchBreakdown: Array.from({ length: BRANCH_COUNT }, (_, i) => ({
      branch: `feat/b${i}`, costUsd: 1 + i, totalTokens: 1000 * (i + 1),
      sessionCount: 1, lastActive: new Date(now - i * 86400e3).toISOString(),
    })),
    // 실제 사고 형태: 토큰 대부분이 미가격 모델인데 가격 있는 모델이 소수
    modelBreakdown: [
      { model: 'claude-nextgen-9', tokens: 970000, costUsd: 0, share: 0.97, pricingSource: 'none' },
      { model: 'claude-opus-5', tokens: 30000, costUsd: 0.75, share: 0.03, pricingSource: 'exact' },
    ],
    unpricedModels: ['claude-nextgen-9'],
    modelShareBasis: 'tokens',
  };
}

async function push(page, extra) {
  await page.evaluate((e) => {
    const usage = { ...window.MOCK_USAGE, ...e };
    window.dispatchEvent(new MessageEvent('message', {
      data: { method: 'pushUsageSummary', receiver: { type: 'broadcast' }, params: usage },
    }));
  }, extra);
  await page.waitForTimeout(350);
}

/** 목록 컨테이너의 데이터행 수(더보기 행 제외)와 버튼 상태. */
function readList({ sel, rowSel }) {
  const el = document.querySelector(sel);
  if (!el) return { missing: true };
  const btn = el.querySelector('.js-list-more');
  return {
    rows: el.querySelectorAll(rowSel).length,
    hasBtn: !!btn,
    btnText: btn ? btn.textContent.trim() : '',
  };
}

async function run(page, width, lang) {
  const tag = `${width}px@${lang}`;
  await page.setViewportSize({ width, height: 1000 });
  await push(page, payload());

  const lists = [
    ['#panel-files-list', '.file-row', FILE_COUNT, '파일'],
    ['#panel-session-list', '.session-row', SESSION_COUNT, '세션'],
    ['#panel-branch-list', '.branch-row:not(.branch-header)', BRANCH_COUNT, '브랜치'],
  ];

  for (const [sel, rowSel, total, name] of lists) {
    const collapsed = await page.evaluate(readList, { sel, rowSel }).catch(() => ({ missing: true }));
    check(!collapsed.missing, `[${tag}] ${name} 목록 컨테이너 존재`);
    if (collapsed.missing) continue;
    check(collapsed.rows === CAP, `[${tag}] ${name} 접힘 상태 ${CAP}행 (실제 ${collapsed.rows})`);
    check(collapsed.hasBtn, `[${tag}] ${name} 더보기 버튼 존재`);
    check(collapsed.btnText.includes(`+${total - CAP}`),
      `[${tag}] ${name} 숨긴 개수 +${total - CAP} 노출 (실제 "${collapsed.btnText}")`);

    await page.click(`${sel} .js-list-more`);
    await page.waitForTimeout(120);
    const expanded = await page.evaluate(readList, { sel, rowSel });
    check(expanded.rows === total, `[${tag}] ${name} 펼침 후 전체 ${total}행 (실제 ${expanded.rows})`);
    check(expanded.hasBtn && !expanded.btnText.includes('+'),
      `[${tag}] ${name} 펼침 후 라벨이 접기로 바뀜 (실제 "${expanded.btnText}")`);

    await page.click(`${sel} .js-list-more`);
    await page.waitForTimeout(120);
    const recollapsed = await page.evaluate(readList, { sel, rowSel });
    check(recollapsed.rows === CAP, `[${tag}] ${name} 다시 접힘 ${CAP}행 (실제 ${recollapsed.rows})`);
  }

  // 상한 이하면 버튼이 생기면 안 된다 — 없는 절단을 광고하는 것도 거짓 신호다.
  await push(page, { ...payload(), recentEditedFiles: ['a.ts', 'b.ts', 'c.ts'] });
  const few = await page.evaluate(readList, { sel: '#panel-files-list', rowSel: '.file-row' });
  check(few.rows === 3, `[${tag}] 3개면 3행 그대로 (실제 ${few.rows})`);
  check(!few.hasBtn, `[${tag}] 3개면 더보기 버튼 없음`);

  // ST9 — 가격 신호
  await push(page, payload());
  const model = await page.evaluate(() => {
    const body = document.getElementById('panel-model-body');
    if (!body) return { missing: true };
    return {
      warn: !!body.querySelector('.panel-warn-note'),
      basis: !!body.querySelector('.panel-basis-note'),
      unknownCells: body.querySelectorAll('.model-bar-cost--unknown').length,
      hasZeroCost: /\$0\.00/.test(body.textContent),
      firstLabel: body.querySelector('.model-bar-label')?.textContent?.trim() ?? '',
      firstPct: body.querySelector('.model-bar-pct')?.textContent?.trim() ?? '',
    };
  });
  check(!model.missing, `[${tag}] 모델 카드 존재`);
  check(model.warn, `[${tag}] 미가격 모델 경고 노출`);
  check(model.basis, `[${tag}] share 기준(토큰) 표시`);
  check(model.unknownCells === 1, `[${tag}] 미가격 행이 '가격 미상' 표기 (실제 ${model.unknownCells}개)`);
  check(!model.hasZeroCost, `[${tag}] $0.00을 계측값처럼 찍지 않음`);
  check(model.firstLabel.toLowerCase().includes('nextgen'),
    `[${tag}] 토큰 지배 모델이 1위 (실제 "${model.firstLabel}")`);
  check(model.firstPct === '97%', `[${tag}] 1위 share 97% (실제 "${model.firstPct}")`);
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  try {
    for (const lang of LANGS) {
      for (const width of WIDTHS) {
        const page = await browser.newPage({ bypassCSP: true, viewport: { width, height: 1000 } });
        await page.addInitScript((l) => { try { localStorage.setItem('ccg-lang', l); } catch { /* noop */ } }, lang);
        await page.goto('file://' + HTML_PATH, { waitUntil: 'networkidle' });
        await page.waitForTimeout(900);
        await run(page, width, lang);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log('───────── 목록 행 상한 · 가격 신호 검증 ─────────');
  let fail = 0;
  for (const [ok, label] of results) {
    console.log(`${ok ? '✅' : '❌'} ${label}`);
    if (!ok) fail++;
  }
  if (results.length < MIN_CHECKS) {
    console.log(`❌ 검사 수 ${results.length} < 최소 ${MIN_CHECKS} — 검사가 조용히 사라졌다`);
    fail++;
  }
  console.log(`검사 ${results.length}건 · 실패 ${fail}건`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
