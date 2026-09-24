// Codex 대시보드 계약 검증 (v0.2.3 R3·R4) — 실 빌드 + docs/demo 고정 입력, 외부 상태 의존 없음.
// verify-gate: full
//
// 잡으려는 것은 넷이며 전부 tsc·eslint·단위테스트가 통과하는 **무성 실패**다:
//   ① 버킷 카드에 소모율 줄이 아예 없거나, 있어도 영영 "수집 중"이다(패널측 이력 저장소 누락).
//   ② 소모율이 "0.00%/min"으로 눌어붙는다 — 30일 버킷을 분당으로 적으면 나오는 값이고,
//      화면에서 유휴와 구분되지 않는다(v0.2.3 이전 사이드바의 실제 동작).
//   ③ Utilization Trend가 Codex에서 안 그려진다(N시리즈 일반화 실패 또는 카드 숨김 잔존).
//   ④ Codex인데 페이스 라인이 그려진다 — 5시간 창 전제라 Codex에는 근거가 없다. 반대로
//      Claude에서 사라져도 안 되므로 **양쪽을 다 본다**(한쪽만 보면 "항상 끔"이 통과한다).
//   ⑤ 버킷이 3개 이상일 때 계열 색이 겹친다 — 데모 목업은 Claude 2계열·Codex 1계열뿐이라
//      N>2 순환 경로가 화면에 한 번도 나타나지 않는다(v0.2.3 축B 판정 V1: "확인 불가").
//      단위테스트가 인덱스 순환을 잠그지만, 그 배열이 실제 캔버스 픽셀이 되는지는 별개다.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODEX_HTML = 'file://' + path.resolve(__dirname, '../docs/demo/panel-codex.html');
const CLAUDE_HTML = 'file://' + path.resolve(__dirname, '../docs/demo/panel.html');
const WIDTHS = [752, 1400];

const problems = [];
const browser = await chromium.launch();

try {
  for (const width of WIDTHS) {
    const tag = `${width}px`;
    const page = await browser.newPage({ viewport: { width, height: 1000 }, bypassCSP: true });
    await page.goto(CODEX_HTML, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: 'html,body{width:100% !important;}' });
    await page.waitForTimeout(1500);

    // ① 버킷 카드 수 = 소모율 줄 수
    const bandCards = await page.locator('#panel-codex-band-grid .panel-metric-card').count();
    const burnSubs = await page.locator('#panel-codex-band-grid .codex-burn-sub').count();
    if (bandCards === 0) problems.push(`${tag}: Codex 지표밴드 카드가 0개 — 목업 주입 실패`);
    if (burnSubs !== bandCards) problems.push(`${tag}: 버킷 ${bandCards}개 중 소모율 줄 ${burnSubs}개`);

    // ①② 실제 렌더된 텍스트를 본다 — 요소 존재가 아니라 값
    const burnTexts = await page.$$eval('#panel-codex-band-grid .codex-burn-sub', els => els.map(e => e.textContent.trim()));
    for (const txt of burnTexts) {
      const m = /([\d.]+)%\/(min|hr|day)/.exec(txt);
      if (!m) { problems.push(`${tag}: 소모율 수치 없음 — "${txt}"`); continue; }
      if (parseFloat(m[1]) === 0) {
        problems.push(`${tag}: 소모율이 0으로 표기됨(유휴와 구분 불가) — "${txt}"`);
      }
    }

    // ③ Trend 카드가 Codex에서 보이고 차트가 실제 크기를 가진다
    const trendVisible = await page.$eval('#panel-util-trend-card',
      e => getComputedStyle(e).display !== 'none').catch(() => false);
    if (!trendVisible) problems.push(`${tag}: Codex에서 Utilization Trend 카드가 숨겨져 있다`);

    // 2회차 폴링을 모사한다 — 목업은 동일 스냅샷을 두 번 밀어 t가 같으므로(실측 delta 산출 불가)
    // 여기서 시각·사용률이 다른 스냅샷을 한 번 더 넣어 "실측 경로"까지 태운다.
    const before = await page.$eval('#chart-trend', c => c.toDataURL()).catch(() => null);
    await page.evaluate(() => {
      const base = window.MOCK_CODEX_RATE_LIMIT;
      const next = {
        ...base,
        generatedAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        buckets: base.buckets.map(b => ({ ...b, usedPercent: b.usedPercent + 3 })),
      };
      window.dispatchEvent(new MessageEvent('message', {
        data: { method: 'pushCodexRateLimit', receiver: { type: 'broadcast' }, params: next },
      }));
    });
    await page.waitForTimeout(700);

    const trendBox = await page.$eval('#chart-trend', e => {
      const r = e.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), shown: getComputedStyle(e).display !== 'none' };
    }).catch(() => null);
    if (!trendBox) problems.push(`${tag}: #chart-trend 캔버스 없음`);
    else if (!trendBox.shown) problems.push(`${tag}: 2회 폴링 후에도 Trend가 빈 상태다`);
    else if (trendBox.w < 50 || trendBox.h < 50) problems.push(`${tag}: Trend 캔버스 ${trendBox.w}x${trendBox.h}`);

    const after = await page.$eval('#chart-trend', c => c.toDataURL()).catch(() => null);
    if (before && after && before === after) {
      problems.push(`${tag}: 새 스냅샷 수신 후에도 Trend 픽셀이 동일 — 갱신 배선 누락`);
    }

    // ④ Codex에서는 페이스 캡션이 비어 있어야 한다.
    //
    // ⚠️ 그냥 확인하면 **엉뚱한 이유로 통과한다** — panel-codex.html 목업에는 pushRateLimit이
    // 없어서 lastPanelSnapshot이 애초에 null이고, 그러면 provider 분기를 지워도 캡션이 빈다
    // (실측: omit 분기를 제거했는데 게이트가 초록이었다). 실사용에서 이 코드가 도는 경로는
    // "Claude를 보다가 Codex로 전환" 즉 **스냅샷이 남아 있는 상태**다. 그 상태를 만든 뒤 본다.
    await page.evaluate(() => {
      const now = Date.now();
      const snap = {
        fiveHour:  { utilization: 0.62, resetAt: new Date(now + 90 * 60_000).toISOString(), msUntilReset: 90 * 60_000, status: 'allowed_warning' },
        sevenDay:  { utilization: 0.30, resetAt: new Date(now + 39 * 3600_000).toISOString(), msUntilReset: 39 * 3600_000, status: 'allowed' },
        overallStatus: 'allowed_warning',
        generatedAt: new Date(now).toISOString(),
      };
      window.dispatchEvent(new MessageEvent('message', {
        data: { method: 'pushRateLimit', receiver: { type: 'broadcast' }, params: snap },
      }));
    });
    await page.waitForTimeout(700);

    const paceCodex = await page.$eval('#pace-caption', e => e.textContent.trim()).catch(() => '');
    if (paceCodex !== '') problems.push(`${tag}: Codex인데 페이스 캡션이 채워짐 — "${paceCodex.slice(0, 60)}"`);

    await page.close();
  }

  // ④ 반대편 — Claude에서는 페이스 캡션이 있어야 한다(omit 분기가 "항상 끔"이 아님을 증명)
  const cpage = await browser.newPage({ viewport: { width: 1400, height: 1000 }, bypassCSP: true });
  await cpage.goto(CLAUDE_HTML, { waitUntil: 'networkidle' });
  await cpage.waitForTimeout(1800);
  const paceClaude = await cpage.$eval('#pace-caption', e => e.textContent.trim()).catch(() => '');
  if (paceClaude === '') problems.push('claude축: 페이스 캡션이 비었다 — omit 분기가 Claude까지 껐다');
  const trendClaude = await cpage.$$eval('#chart-trend', els => els.length);
  if (trendClaude !== 1) problems.push(`claude축: #chart-trend ${trendClaude}개`);
  await cpage.close();

  // ⑤ N>2 버킷 — 계열 색이 실제로 서로 다른 픽셀이 되는가 (축B V1 종결)
  //
  // 왜 픽셀을 보나: Chart 인스턴스는 번들 밖에서 잡을 수 없고 범례도 캔버스에 그려진다.
  // `trendSeries.test.ts`가 잠그는 것은 **accentVar 배열의 인덱스 순환**이지, 그 변수가
  // 해석돼 캔버스에 칠해지는지가 아니다 — 토큰명이 오타여도 배열은 옳고 화면만 회색이 된다
  // (D-2 "선언되지 않은 var()는 선언째 폐기"와 같은 무성 실패). 그래서 색을 CSS에서 읽어
  // 그 RGB가 캔버스에 존재하는지 본다.
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, bypassCSP: true });
    await page.goto(CODEX_HTML, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: 'html,body{width:100% !important;}' });
    await page.waitForTimeout(1500);

    // 3버킷(유료 Codex 상당)을 시각이 다른 두 스냅샷으로 밀어 실측 경로까지 태운다.
    await page.evaluate(() => {
      const base = window.MOCK_CODEX_RATE_LIMIT;
      const mk = (offsetMin, bump) => ({
        ...base,
        generatedAt: new Date(Date.now() + offsetMin * 60_000).toISOString(),
        buckets: [
          { ...base.buckets[0], windowMinutes: 300,   usedPercent: 20 + bump },
          { ...base.buckets[0], windowMinutes: 10080, usedPercent: 45 + bump },
          { ...base.buckets[0], windowMinutes: 43200, usedPercent: 70 + bump },
        ],
      });
      for (const snap of [mk(0, 0), mk(5, 6)]) {
        window.dispatchEvent(new MessageEvent('message', {
          data: { method: 'pushCodexRateLimit', receiver: { type: 'broadcast' }, params: snap },
        }));
      }
    });
    await page.waitForTimeout(900);

    const hit = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      const parse = (name) => {
        const raw = cs.getPropertyValue(name).trim();
        const m = /^#?([0-9a-f]{6})$/i.exec(raw);
        if (!m) return null;
        const n = parseInt(m[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      };
      const wanted = ['--c-sonnet', '--c-opus', '--c-haiku'].map(v => ({ v, rgb: parse(v) }));
      const cv = document.getElementById('chart-trend');
      if (!cv) return { error: 'no canvas' };
      const ctx = cv.getContext('2d');
      const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
      const counts = {};
      for (const w of wanted) {
        if (!w.rgb) { counts[w.v] = -1; continue; }   // 토큰 자체가 안 읽힘
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue;
          if (Math.abs(data[i] - w.rgb[0]) + Math.abs(data[i + 1] - w.rgb[1]) + Math.abs(data[i + 2] - w.rgb[2]) <= 12) n++;
        }
        counts[w.v] = n;
      }
      return { counts, width, height };
    });

    if (hit.error) {
      problems.push(`N>2: ${hit.error}`);
    } else {
      for (const [name, n] of Object.entries(hit.counts)) {
        if (n === -1) problems.push(`N>2: ${name} 토큰을 읽을 수 없다 — 선언 누락 또는 오타`);
        else if (n < 20) problems.push(`N>2: 3버킷인데 ${name} 색 픽셀이 ${n}개 — 계열 색 순환이 캔버스에 도달하지 않았다`);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}

if (problems.length > 0) {
  console.error('  ❌ Codex 대시보드 계약 위반:');
  for (const p of problems) console.error('     - ' + p);
  process.exit(1);
}
console.log('  ✅ Codex 버킷 소모율 + Trend N시리즈 + 페이스 omit 분기 정상');
