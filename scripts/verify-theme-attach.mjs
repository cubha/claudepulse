// 테마 클래스 부착 검증 (v0.2.3 R5) — 실 빌드 + docs/demo 고정 입력.
// verify-gate: full
//
// 왜 필요한가: styles.css는 v0.1.53부터 `.theme-light` 51토큰을 선언해 뒀는데 **붙이는 경로가
// 0건**이었고, 선언만 보는 게이트(verify.sh D-3 다크/라이트 페어)는 그 2년을 내내 초록으로
// 통과했다. 선언을 세는 검사로는 절대 잡히지 않는 부류라, 실제로 클래스가 바뀌고 **그 결과
// 색이 바뀌는지**를 본다.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGETS = [
  ['panel', 'file://' + path.resolve(__dirname, '../docs/demo/panel.html')],
  ['sidebar', 'file://' + path.resolve(__dirname, '../docs/demo/sidebar.html')],
];

const problems = [];
const browser = await chromium.launch();
try {
  for (const [name, url] of TARGETS) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, bypassCSP: true });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const darkCls = await page.evaluate(() => document.body.className);
    if (!/\btheme-dark\b/.test(darkCls)) problems.push(`${name}: 초기 클래스에 theme-dark 없음 — "${darkCls}"`);

    // 테마 변경 브로드캐스트를 그대로 모사한다(extension이 보내는 것과 같은 메시지).
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { method: 'pushTheme', receiver: { type: 'broadcast' }, params: 'theme-light' },
      }));
    });
    await page.waitForTimeout(700);

    const lightCls = await page.evaluate(() => document.body.className);
    if (!/\btheme-light\b/.test(lightCls)) problems.push(`${name}: theme-light가 붙지 않음 — "${lightCls}"`);
    // 두 클래스가 공존하면 styles.css에서 나중 선언이 이겨 팔레트가 뒤섞인다.
    if (/\btheme-dark\b/.test(lightCls)) problems.push(`${name}: theme-dark가 함께 남아 있음 — "${lightCls}"`);
    // provider 클래스 같은 무관한 상태는 유지돼야 한다(통째 교체가 아니라 토글이어야 함).

    // 클래스만 바뀌고 색이 그대로면 토큰이 안 걸린 것이다 — 부착의 목적은 색이지 클래스가 아니다.
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (lightBg === darkBg) problems.push(`${name}: 클래스는 바뀌었는데 배경색이 동일(${darkBg}) — 토큰 미적용`);

    // 되돌릴 수 있어야 한다(라이트→다크 단방향이면 테마를 되돌린 사용자가 갇힌다).
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { method: 'pushTheme', receiver: { type: 'broadcast' }, params: 'theme-dark' },
      }));
    });
    await page.waitForTimeout(700);
    const backBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (backBg !== darkBg) problems.push(`${name}: 다크로 복귀 실패 — ${darkBg} → ${backBg}`);

    await page.close();
  }
} finally {
  await browser.close();
}

if (problems.length > 0) {
  console.error('  ❌ 테마 부착 계약 위반:');
  for (const p of problems) console.error('     - ' + p);
  process.exit(1);
}
console.log('  ✅ theme-dark ⇄ theme-light 부착 + 토큰 실적용 + 복귀 정상');
