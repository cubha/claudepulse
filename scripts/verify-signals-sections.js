// verify-gate: full — 헤드리스 chromium + docs/demo 고정 입력, 외부 상태 의존 없음(hermetic)
//
// v0.2.6 신호 섹션 실렌더 검증(ST13·ST14). 단위 테스트(signalsView.test.ts)는 HTML 문자열만 본다 —
// 실제로 화면에 붙는지(updateUsageSection 배선), 없을 때 섹션째 숨는지(빈 값 ≠ 0), 좁은 폭에서
// 가로로 넘치지 않는지, 로캘이 바뀌는지는 여기서만 보인다(feedback_webview_ui_verification: 2폭×2로캘).
//
// Usage: npm run build 후 node scripts/verify-signals-sections.js [--shots]
//   --shots: .playwright-mcp/signals-*.png 스크린샷 저장(육안 확인용)
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const PANEL = path.resolve(__dirname, '../docs/demo/panel.html');
const PANEL_CODEX = path.resolve(__dirname, '../docs/demo/panel-codex.html');
const SIDEBAR = path.resolve(__dirname, '../docs/demo/sidebar.html');
const SIDEBAR_CODEX = path.resolve(__dirname, '../docs/demo/sidebar-codex.html');
const OUT_DIR = path.resolve(__dirname, '../.playwright-mcp');
const WIDTHS = [700, 1600];
const SIDEBAR_WIDTHS = [260, 400];
const LANGS = ['ko', 'en'];
const MIN_CHECKS = 70;
const SHOTS = process.argv.includes('--shots');

const results = [];
const check = (ok, label) => results.push([!!ok, label]);

async function open(browser, file, width, lang, height = 1000) {
  const page = await browser.newPage({ bypassCSP: true, viewport: { width, height } });
  await page.addInitScript((l) => { try { localStorage.setItem('ccg-lang', l); } catch { /* noop */ } }, lang);
  await page.goto('file://' + file, { waitUntil: 'networkidle' });
  // docs/demo/*.html은 캡처용으로 body 폭을 752px/300px로 고정해 둔다 — 그대로 두면 더 좁은 뷰포트에서
  // 제품과 무관하게 항상 넘친다(첫 실행에서 8건이 이것). 실제 웹뷰처럼 뷰포트 폭을 따르게 푼다.
  await page.addStyleTag({ content: 'html, body { width: auto !important; height: auto !important; overflow: visible !important; }' });
  await page.waitForTimeout(900);
  return page;
}

async function pushUsage(page, mutate, base = 'MOCK_USAGE') {
  await page.evaluate(({ src, body }) => {
    const usage = JSON.parse(JSON.stringify(window[src]));
    // eslint-disable-next-line no-new-func
    new Function('u', body)(usage);
    window.dispatchEvent(new MessageEvent('message', {
      data: { method: 'pushUsageSummary', receiver: { type: 'broadcast' }, params: usage },
    }));
  }, { src: base, body: mutate });
  await page.waitForTimeout(350);
}

const visible = (id) => {
  const el = document.getElementById(id);
  return !!el && el.style.display !== 'none' && el.getBoundingClientRect().height > 0;
};
const noHScroll = () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;

async function panelClaude(browser, width, lang) {
  const tag = `panel ${width}px@${lang}`;
  const page = await open(browser, PANEL, width, lang);

  // ① mock(신호 있음) — 세 섹션 표시 + 내용
  const s = await page.evaluate(() => {
    const txt = (id) => document.getElementById(id)?.textContent ?? '';
    return {
      block: (window.__v = null, null),
      blockRows: document.querySelectorAll('#panel-block-list .panel-mcp-row').length,
      blockDanger: document.querySelectorAll('#panel-block-list .status-marker.danger').length,
      blockMuted: document.querySelectorAll('#panel-block-list .status-marker.muted').length,
      prRows: document.querySelectorAll('#panel-pr-list .branch-row:not(.branch-header)').length,
      prShared: document.querySelectorAll('#panel-pr-list .status-marker.warn').length,
      turnKpis: document.querySelectorAll('#panel-turn-body .cache-kpi-item').length,
      turnDays: document.querySelectorAll('#turn-daily-list .skill-row').length,
      hooks: [...document.querySelectorAll('#hook-list .skill-name')].map(e => e.textContent.trim()),
      hookShareMarker: !!document.querySelector('#panel-turn-body .status-marker'),
      missRows: document.querySelectorAll('#cache-miss-list .skill-row').length,
      missMuted: document.querySelectorAll('#cache-miss-list .skill-row-other').length,
      missReadout: document.querySelector('#cache-miss-header .panel-chart-readout')?.textContent ?? '',
      effortRows: document.querySelectorAll('#panel-effort-list .skill-row').length,
      effortOther: document.querySelectorAll('#panel-effort-list .skill-row-other').length,
      turnHeader: document.querySelector('#panel-turn-card .panel-chart-header')?.textContent ?? '',
      allText: txt('panel-turn-card') + txt('panel-pr-card') + txt('panel-block-card'),
    };
  });
  for (const id of ['panel-block-card', 'panel-pr-card', 'panel-turn-card']) {
    check(await page.evaluate(visible, id), `[${tag}] ${id} 표시(신호 있음)`);
  }
  check(s.blockRows === 3 && s.blockDanger === 2 && s.blockMuted === 1, `[${tag}] 차단 2에피소드(danger) + 서버오류 1행(muted) (실제 ${s.blockRows}/${s.blockDanger}/${s.blockMuted})`);
  check(s.prRows === 3 && s.prShared === 1, `[${tag}] PR 3행, 공유 마커 1개 (실제 ${s.prRows}/${s.prShared})`);
  check(s.turnKpis === 3 && s.turnDays === 7, `[${tag}] 턴 KPI 3 + 일별 7행 (실제 ${s.turnKpis}/${s.turnDays})`);
  check(s.hooks.length === 4 && s.hooks[0] === 'session-metrics.js', `[${tag}] 훅 4행, 경로 없는 표시명 (실제 ${JSON.stringify(s.hooks)})`);
  check(!/\/(home|mnt|Users)\//.test(s.allText), `[${tag}] 신호 섹션 본문에 로컬 경로 없음`);
  check(s.hookShareMarker, `[${tag}] 훅 비율 마커 존재`);
  check(s.missRows === 4 && s.missMuted === 2, `[${tag}] 캐시 미스 4원인, 토큰 미상 2행 muted (실제 ${s.missRows}/${s.missMuted})`);
  check(s.missReadout.includes('≥') && s.missReadout.includes('86/7962'), `[${tag}] 미스 readout 하한 표기 (실제 "${s.missReadout}")`);
  check(s.effortRows === 4 && s.effortOther === 1, `[${tag}] effort 3행 + 미상 1행 (실제 ${s.effortRows}/${s.effortOther})`);
  check(lang === 'ko' ? s.turnHeader.includes('턴') : s.turnHeader.includes('Turn'), `[${tag}] 턴 섹션 헤더 로캘 (실제 "${s.turnHeader}")`);
  check(await page.evaluate(noHScroll), `[${tag}] 가로 스크롤 없음`);

  if (SHOTS) {
    for (const id of ['panel-block-card', 'panel-turn-card', 'panel-pr-card', 'panel-cache-card', 'panel-skill-card']) {
      const el = await page.$('#' + id);
      if (el) await el.screenshot({ path: path.join(OUT_DIR, `signals-${id}-${width}-${lang}.png`) });
    }
  }

  // ② 귀속 스코프 토글 — effort도 따라 바뀐다(24h 목업 = high·medium 2행, 미상 0)
  await page.click('.attr-scope-btn[data-scope="24h"]');
  await page.waitForTimeout(150);
  const eff24 = await page.evaluate(() => [...document.querySelectorAll('#panel-effort-list .skill-row')].length);
  check(eff24 === 2, `[${tag}] 24h 스코프 effort 2행 (실제 ${eff24})`);
  await page.click('.attr-scope-btn[data-scope="all"]');
  await page.waitForTimeout(150);

  // ③ 신호 없음(구버전 extension 요약·Codex) — 섹션째 숨김, 캐시 미스 블록 없음
  await pushUsage(page, 'delete u.signals;');
  for (const id of ['panel-block-card', 'panel-pr-card', 'panel-turn-card']) {
    check(!(await page.evaluate(visible, id)), `[${tag}] ${id} 숨김(신호 없음)`);
  }
  check(await page.evaluate(() => !document.getElementById('cache-miss-header')), `[${tag}] 신호 없으면 캐시 미스 블록 없음`);

  // ④ 빈 신호(차단·PR·턴 0) — 숨김. 0을 0으로 그리지 않는다.
  await pushUsage(page, `u.signals.rateLimitBlocks = { episodes: [], unclassified429: 0, serverErrors: { count: 0, lastAt: null, byStatus: {} } };
    u.signals.prCosts = []; u.signals.turnHooks.turnCount = 0; u.signals.cacheMiss.missCount = 0;`);
  for (const id of ['panel-block-card', 'panel-pr-card', 'panel-turn-card']) {
    check(!(await page.evaluate(visible, id)), `[${tag}] ${id} 숨김(빈 신호)`);
  }

  // ⑤ PR 상한 — 8개면 접힘 6 + "+2"
  await pushUsage(page, `u.signals.prCosts = Array.from({ length: 8 }, (_, i) => ({ prRepository: 'o/r', prNumber: i + 1, prUrl: 'u', costUsd: 9 - i, totalTokens: 1000, sessionCount: 1, sharedSessionCount: 0, firstLinkedAt: '2026-10-01T00:00:00Z', hasUnpricedRecords: false }));`);
  const prCap = await page.evaluate(() => ({
    rows: document.querySelectorAll('#panel-pr-list .branch-row:not(.branch-header)').length,
    btn: document.querySelector('#panel-pr-list .js-list-more')?.textContent?.trim() ?? '',
  }));
  check(prCap.rows === 6 && prCap.btn.includes('+2'), `[${tag}] PR 8개 → 6행 + "+2" (실제 ${prCap.rows} "${prCap.btn}")`);
  await page.close();
}

async function panelCodex(browser, width, lang) {
  const tag = `panel-codex ${width}px@${lang}`;
  const page = await open(browser, PANEL_CODEX, width, lang);
  for (const id of ['panel-block-card', 'panel-pr-card', 'panel-turn-card']) {
    check(!(await page.evaluate(visible, id)), `[${tag}] ${id} 숨김(Codex엔 신호 없음)`);
  }
  const extra = await page.evaluate(() => document.getElementById('panel-codex-extra-list')?.textContent ?? '');
  check(/1 /.test(extra) && !extra.includes('$0.00'), `[${tag}] Codex 서브에이전트 행(1개, 미가격 $0 표기 금지) (실제 "${extra.replace(/\s+/g, ' ').slice(0, 120)}")`);
  check(extra.includes('Free'), `[${tag}] Codex 플랜 표시명 'Free'`);
  check(await page.evaluate(noHScroll), `[${tag}] 가로 스크롤 없음`);
  await page.close();
}

async function sidebarClaude(browser, width, lang) {
  const tag = `sidebar ${width}px@${lang}`;
  const page = await open(browser, SIDEBAR, width, lang, 900);
  const s = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.sb-chip')].map(c => c.textContent.trim());
    return {
      thinking: chips.find(c => /생각|Thinking/.test(c)) ?? '',
      block: chips.find(c => c.startsWith('⛔')) ?? '',
      compact: chips.find(c => c.startsWith('🗜')) ?? '',
    };
  });
  check(/30%/.test(s.thinking), `[${tag}] thinking 칩 30% (실제 "${s.thinking}")`);
  check(s.block.includes('5h'), `[${tag}] 최근 차단 칩 (실제 "${s.block}")`);
  check(s.compact.includes('2'), `[${tag}] 압축 칩 2회 (실제 "${s.compact}")`);
  check(await page.evaluate(noHScroll), `[${tag}] 가로 스크롤 없음`);
  if (SHOTS) await page.screenshot({ path: path.join(OUT_DIR, `signals-sidebar-${width}-${lang}.png`), fullPage: true });

  await pushUsage(page, 'delete u.signals; u.todayThinking = null;');
  const none = await page.evaluate(() => [...document.querySelectorAll('.sb-chip')].map(c => c.textContent.trim()));
  check(!none.some(c => c.startsWith('⛔') || c.startsWith('🗜') || /생각|Thinking/.test(c)), `[${tag}] 신호 없으면 세 칩 모두 없음`);
  await page.close();
}

async function sidebarCodex(browser, width, lang) {
  const tag = `sidebar-codex ${width}px@${lang}`;
  const page = await open(browser, SIDEBAR_CODEX, width, lang, 900);
  const badge = await page.evaluate(() => document.querySelector('.plan-badge')?.textContent?.trim() ?? '');
  check(badge === 'Free', `[${tag}] 플랜 배지 'Free' (실제 "${badge}")`);
  const before = await page.evaluate(() => document.body.textContent);
  check(!/크레딧|Credits/.test(before), `[${tag}] free의 빈 credits는 행 없음`);

  // 유료 모사 extras 주입 — 크레딧·지출 한도·차단 사유 행이 뜬다.
  await page.evaluate(() => {
    const rl = JSON.parse(JSON.stringify(window.MOCK_CODEX_RATE_LIMIT));
    rl.planType = 'prolite';
    rl.extras = {
      credits: { hasCredits: true, unlimited: false, balance: '12.50' },
      individualLimit: { limit: '100', used: '87.5', remainingPercent: 12, resetsAt: 1793000000 },
      spendControlReached: false,
      rateLimitReachedType: 'workspace_member_usage_limit_reached',
    };
    window.dispatchEvent(new MessageEvent('message', { data: { method: 'pushCodexRateLimit', receiver: { type: 'broadcast' }, params: rl } }));
  });
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => ({
    text: document.body.textContent,
    badge: document.querySelector('.plan-badge')?.textContent?.trim() ?? '',
    danger: document.querySelectorAll('.status-marker.danger').length,
  }));
  check(after.badge === 'Pro Lite', `[${tag}] prolite → 'Pro Lite' (실제 "${after.badge}")`);
  check(after.text.includes('12.50') && after.text.includes('87.5 / 100'), `[${tag}] 크레딧·지출 한도 행`);
  check(after.danger >= 1, `[${tag}] 차단 사유 danger 마커`);
  check(await page.evaluate(noHScroll), `[${tag}] 가로 스크롤 없음`);
  if (SHOTS) await page.screenshot({ path: path.join(OUT_DIR, `signals-sidebar-codex-${width}-${lang}.png`), fullPage: true });
  await page.close();
}

async function main() {
  if (SHOTS) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  try {
    for (const lang of LANGS) {
      for (const w of WIDTHS) { await panelClaude(browser, w, lang); await panelCodex(browser, w, lang); }
      for (const w of SIDEBAR_WIDTHS) { await sidebarClaude(browser, w, lang); await sidebarCodex(browser, w, lang); }
    }
  } finally {
    await browser.close();
  }
  console.log('───────── v0.2.6 신호 섹션 실렌더 검증 ─────────');
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
