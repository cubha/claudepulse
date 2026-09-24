// 기간별 비용 탭 계약 검증 (v0.2.2) — 실 빌드 + docs/demo 고정 입력, 외부 상태 의존 없음(hermetic).
// verify-gate: full
//
// 잡으려는 것은 셋이다. 셋 다 tsc·eslint·단위테스트가 전부 통과하는 **무성 실패**다:
//   ① 탭을 눌러도 pane이 안 바뀌거나 둘 이상이 함께 보인다(전환 배선 누락).
//   ② 숨은 pane에서 Chart가 생성돼 캔버스가 0×0으로 잡힌다 — 탭을 열면 빈 칸이 보인다.
//   ③ 탭 라벨이 로캘·폭에 따라 줄바꿈된다. 한국어 2자/영어 9자라 폭 한 점만 보면 놓친다
//      (feedback_webview_ui_verification: 캘린더 stretch가 9릴리스를 통과한 원인이 단일 폭 검증이었다).
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PANEL_HTML = path.resolve(__dirname, '../docs/demo/panel.html');
const WIDTHS = [700, 1600];
const LANGS = ['ko', 'en'];
const PERIODS = ['daily', 'monthly', 'longterm'];   // 화면 탭 순서와 동일하게 유지
const CANVAS_BY_PERIOD = { daily: 'chart-daily', longterm: 'chart-longterm', monthly: 'chart-monthly' };

const problems = [];
const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    for (const lang of LANGS) {
      const tag = `${width}px@${lang}`;
      const page = await browser.newPage({ viewport: { width, height: 1000 }, bypassCSP: true });
      await page.addInitScript((l) => { try { localStorage.setItem('ccg-lang', l); } catch { /* noop */ } }, lang);
      await page.goto('file://' + PANEL_HTML, { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: 'html,body{width:100% !important;}' });
      await page.waitForTimeout(1500);

      if (await page.locator('#panel-cost-period-card').count() !== 1) {
        problems.push(`${tag}: 통합 카드(#panel-cost-period-card)가 1개가 아니다`);
        await page.close();
        continue;
      }

      // ③ 탭줄 wrap — 버튼 3개의 top이 전부 같아야 한 줄이다
      const tops = await page.$$eval('.cost-tab-btn', els => els.map(e => Math.round(e.getBoundingClientRect().top)));
      if (tops.length !== PERIODS.length) problems.push(`${tag}: 탭 버튼 ${tops.length}개(기대 ${PERIODS.length})`);
      else if (new Set(tops).size !== 1) problems.push(`${tag}: 탭줄 줄바꿈 발생(top=${tops.join(',')})`);

      for (const period of PERIODS) {
        await page.click(`.cost-tab-btn[data-period="${period}"]`);
        await page.waitForTimeout(500);

        // ① 활성 pane 1개만
        const shown = await page.$$eval('.cost-period-pane',
          els => els.filter(e => getComputedStyle(e).display !== 'none').map(e => e.id));
        if (shown.length !== 1 || shown[0] !== `cost-pane-${period}`) {
          problems.push(`${tag}/${period}: 보이는 pane=[${shown.join(',')}]`);
        }
        // 헤더 readout도 활성 탭 것 하나만
        const readouts = await page.$$eval('.cost-period-readout',
          els => els.filter(e => getComputedStyle(e).display !== 'none').map(e => e.id));
        if (readouts.length !== 1) problems.push(`${tag}/${period}: readout ${readouts.length}개 표시`);

        // ② 캔버스가 실제 크기를 가졌는가(그려진 경우에 한해 — 데이터가 없으면 빈상태가 정상)
        const box = await page.$eval(`#${CANVAS_BY_PERIOD[period]}`, e => {
          const r = e.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), shown: getComputedStyle(e).display !== 'none' };
        });
        if (box.shown && (box.w < 50 || box.h < 20)) {
          problems.push(`${tag}/${period}: ${CANVAS_BY_PERIOD[period]} 크기 ${box.w}×${box.h} — 숨은 컨테이너에서 생성된 징후`);
        }
      }

      // ④ 언어 전환(PushLang)이 셸을 다시 그릴 때 탭 상태가 함께 리셋되는가.
      //    buildPanelShell()은 항상 daily 탭을 active로 그리므로, costPeriodTab만 monthly로
      //    남아 있으면 **보이는 daily pane은 영영 "수집 중"이고 monthly 차트는 숨은 0×0 컨테이너에
      //    그려진다** — 위 ①②가 막으려던 두 실패가 동시에 나는데 초기 로드만 보면 안 잡힌다.
      await page.click('.cost-tab-btn[data-period="monthly"]');
      await page.waitForTimeout(300);
      await page.evaluate((l) => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { method: 'pushLang', receiver: { type: 'broadcast' }, params: l },
        }));
      }, lang === 'ko' ? 'en' : 'ko');
      await page.waitForTimeout(800);
      const afterRebuild = await page.$$eval('.cost-period-pane',
        els => els.filter(e => getComputedStyle(e).display !== 'none').map(e => e.id));
      const activeBtn = await page.$$eval('.cost-tab-btn.active', els => els.map(e => e.dataset.period));
      if (afterRebuild.length !== 1 || afterRebuild[0] !== 'cost-pane-daily' || activeBtn.join() !== 'daily') {
        problems.push(`${tag}: 언어 전환 후 탭 리셋 실패(pane=[${afterRebuild.join(',')}] active=[${activeBtn.join(',')}])`);
      }
      // ⚠️ 여기서 pane·버튼만 보면 이 검사는 **물지 않는다**(실측으로 확인함): buildPanelShell()이
      //    셸을 항상 daily active로 다시 그리므로, costPeriodTab 변수만 monthly로 남아 있어도 DOM은
      //    정상으로 보인다. 어긋남이 드러나는 곳은 **차트**다 — 보이는 daily pane에 캔버스가 없고
      //    "수집 중"만 남으며, monthly 차트는 숨은 pane에 그려진다. 그래서 캔버스 표시 자체를 단언한다
      //    (목업 데이터엔 7일치 비용이 있으므로 정상 리셋이면 반드시 렌더된다).
      const dailyBox = await page.$eval('#chart-daily', e => {
        const r = e.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), shown: getComputedStyle(e).display !== 'none' };
      });
      if (!dailyBox.shown) {
        problems.push(`${tag}: 언어 전환 후 chart-daily 미렌더 — costPeriodTab이 stale해 다른 탭 차트를 그렸다는 징후`);
      } else if (dailyBox.w < 50 || dailyBox.h < 20) {
        problems.push(`${tag}: 언어 전환 후 chart-daily 크기 ${dailyBox.w}×${dailyBox.h}`);
      }

      await page.close();
    }
  }

  // ⑤ 장기 탭 **안쪽**의 범위 토글(30/90/180일)이 통합 이후에도 살아 있는가.
  //    ①~④는 탭 전환만 본다 — 탭 안으로 들어간 기존 조작이 조용히 죽어도 전부 초록이다.
  //    Chart 인스턴스는 번들 밖에서 못 잡으므로 캔버스 픽셀 지문(toDataURL)으로 판정한다.
  //    ⚠️ 90일 vs 180일은 단언하지 않는다 — docs/demo 픽스처가 40일치라 둘은 **정상적으로 같다**
  //       (전체 40일). 픽스처 길이에 묶인 단언을 넣으면 데이터가 늘어날 때 거짓 실패가 난다.
  {
    const page = await browser.newPage({ viewport: { width: 752, height: 700 }, bypassCSP: true });
    await page.goto('file://' + PANEL_HTML, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: 'html,body{width:100% !important;}' });
    await page.waitForTimeout(1500);
    await page.click('.cost-tab-btn[data-period="longterm"]');
    await page.waitForTimeout(600);

    const fingerprint = () => page.evaluate(() => {
      const d = document.getElementById('chart-longterm').toDataURL('image/png');
      let h = 0;
      for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) | 0;
      return h;
    });
    const pick = async (scope) => {
      await page.click(`.lt-scope-btn[data-scope="${scope}"]`);
      await page.waitForTimeout(800);
      const active = await page.$$eval('.lt-scope-btn.active', els => els.map(e => e.dataset.scope));
      if (active.join() !== scope) problems.push(`장기탭 범위토글: ${scope}일 클릭 후 active=[${active.join(',')}]`);
      return fingerprint();
    };

    const at30 = await pick('30');
    const at180 = await pick('180');
    if (at30 === at180) {
      problems.push('장기탭 범위토글: 30일과 180일의 차트가 동일 — 범위 필터가 안 먹는다(통합 과정에서 배선 유실 징후)');
    }
    const at30Again = await pick('30');
    if (at30Again !== at30) {
      problems.push('장기탭 범위토글: 30일로 되돌렸는데 차트가 처음과 다르다(상태 누수)');
    }
    await page.close();
  }
} finally {
  await browser.close();
}

if (problems.length) {
  console.error(`❌ 기간별 비용 탭 계약 위반 ${problems.length}건`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`✅ 기간별 비용 탭 — ${WIDTHS.length}폭 × ${LANGS.length}로캘 × ${PERIODS.length}탭 + 언어전환 리셋 + 장기탭 범위토글 전부 정상`);
