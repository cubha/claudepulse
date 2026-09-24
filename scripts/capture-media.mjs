// 마켓플레이스 이미지 재촬영 하네스 (v0.2.2 신설).
//
// 왜 스크립트로 만드나: v0.2.0까지 마켓 이미지는 손으로 찍혔고, 그 결과 **v0.1.40 캡처가
// v0.2.0까지 stale한 채 출하**됐다(feedback_ship_gate v0.2.0 사고 경위). 재촬영이 1회 명령이면
// 릴리즈마다 갱신을 빠뜨릴 이유가 없어진다.
//
// 산출물(둘 다 README와 마켓 페이지가 직접 참조한다):
//   media/screenshot-dashboard.png  1100×680 — docs/demo/demo.html(VS Code 크롬 + 사이드바·대시보드 iframe)
//   media/demo-dashboard.gif         752×632 — docs/demo/panel.html 단독 스크롤 + 기간별 비용 탭 시연
//
// 전제: `npm run build` 선행(실 빌드 산출물 dist/webview/main.js를 로드한다 — 목업 HTML이 아니다).
// GIF 인코딩 의존성(gifenc·pngjs)은 v0.2.3부터 devDependencies다. 이전에는 --no-save로만 깔았는데,
// 그러면 lockfile에 없는 패키지가 되고 publish 워크플로의 `npm ci`는 그 불일치에서 hard-fail한다.
//
// 사용: npm run build && node scripts/capture-media.mjs
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEMO_HTML = path.join(ROOT, 'docs/demo/demo.html');
const PANEL_HTML = path.join(ROOT, 'docs/demo/panel.html');
const OUT_PNG = path.join(ROOT, 'media/screenshot-dashboard.png');
const OUT_GIF = path.join(ROOT, 'media/demo-dashboard.gif');

if (!fs.existsSync(path.join(ROOT, 'dist/webview/main.js'))) {
  console.error('❌ dist/webview/main.js 없음 — `npm run build` 먼저 실행할 것(실 빌드 산출물을 찍는 하네스다).');
  process.exit(1);
}

const browser = await chromium.launch();

// ── 1. 히어로 스크린샷 (VS Code 크롬 합성) ────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 680 }, bypassCSP: true });
  await page.goto('file://' + DEMO_HTML, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);   // mock-data.js가 300ms·800ms에 push + Chart.js 렌더
  await page.screenshot({ path: OUT_PNG });
  await page.close();
  console.log(`✅ ${path.relative(ROOT, OUT_PNG)} — 1100×680`);
}

// ── 2. 스크롤 데모 GIF ────────────────────────────────────────────────────
const W = 752, H = 632;
const frames = [];   // { buf, delayMs }
{
  const page = await browser.newPage({ viewport: { width: W, height: H }, bypassCSP: true });
  await page.goto('file://' + PANEL_HTML, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const shoot = async (delayMs) => { frames.push({ buf: await page.screenshot(), delayMs }); };
  const scrollTo = async (y) => {
    await page.evaluate((v) => { document.getElementById('root').scrollTop = v; }, y);
    await page.waitForTimeout(120);
  };

  const maxScroll = await page.evaluate(() => {
    const r = document.getElementById('root');
    return r.scrollHeight - r.clientHeight;
  });
  // 기간별 비용 카드를 화면 위쪽에 두는 스크롤 위치(탭 시연 구간)
  const cardTop = await page.evaluate(() => {
    const r = document.getElementById('root'), c = document.getElementById('panel-cost-period-card');
    return Math.round(c.getBoundingClientRect().top - r.getBoundingClientRect().top + r.scrollTop);
  });
  const tabStop = Math.min(Math.max(cardTop - 16, 0), maxScroll);

  await shoot(1400);                                   // 최상단에서 한 박자
  const SCROLL_STEPS = 22;
  for (let i = 1; i <= SCROLL_STEPS; i++) {
    await scrollTo(Math.round((maxScroll * i) / SCROLL_STEPS));
    await shoot(150);
  }
  await shoot(900);                                    // 바닥에서 한 박자

  // 기간별 비용 카드로 되돌아와 탭 3개를 차례로 보여준다(v0.2.2 신규 섹션)
  await scrollTo(tabStop);
  await page.waitForTimeout(400);
  for (const period of ['daily', 'monthly', 'longterm', 'daily']) {
    await page.click(`.cost-tab-btn[data-period="${period}"]`);
    await page.waitForTimeout(700);                    // 첫 렌더 애니메이션이 끝나게
    await shoot(1100);
  }
  await page.close();
}
await browser.close();

// ── 3. GIF 인코딩 ─────────────────────────────────────────────────────────
// gifenc는 CJS를 default로 래핑해 내보낸다 — 네임드 구조분해는 undefined가 된다
const { GIFEncoder, quantize, applyPalette } = (await import('gifenc')).default;
const { PNG } = await import('pngjs');
const gif = GIFEncoder();
for (const { buf, delayMs } of frames) {
  const { data } = PNG.sync.read(buf);               // RGBA
  const palette = quantize(data, 256);
  const index = applyPalette(data, palette);
  gif.writeFrame(index, W, H, { palette, delay: delayMs });
}
gif.finish();
fs.writeFileSync(OUT_GIF, Buffer.from(gif.bytes()));
const kb = (fs.statSync(OUT_GIF).size / 1024).toFixed(0);
console.log(`✅ ${path.relative(ROOT, OUT_GIF)} — ${W}×${H} · ${frames.length}프레임 · ${kb}KB`);
