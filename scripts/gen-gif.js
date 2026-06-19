// GIF generator: real webview iframe → dashboard scroll
// Usage: node scripts/gen-gif.js

const { chromium } = require('playwright');
const GIFEncoder = require('gif-encoder-2');
const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');

const OUT_PATH = path.resolve(__dirname, '../docs/demo/preview.gif');
const HTML_PATH = path.resolve(__dirname, '../docs/demo/demo.html');

const W = 1100;
const H = 680;

const SCROLL_FRAMES = [
  { scroll: 0,    hold: 1600, desc: 'Top: header + metric cards' },
  { scroll: 340,  hold: 1400, desc: 'Trend + Daily cost charts' },
  { scroll: 660,  hold: 1400, desc: 'Model breakdown + Cache efficiency' },
  { scroll: 1000, hold: 1400, desc: 'Tool usage histogram' },
  { scroll: 1340, hold: 1400, desc: 'Recently edited files + Sessions' },
  { scroll: 0,    hold: 1600, desc: 'Back to top' },
];

async function main() {
  console.log('Launching browser…');
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  const context = await browser.newContext({ bypassCSP: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: W, height: H });

  const url = 'file://' + HTML_PATH;
  console.log('Loading:', url);
  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait for both iframes to initialize
  await page.waitForTimeout(1500);

  const sbFrame = page.frames().find(f => f.url().includes('sidebar.html'));
  const panelFrame = page.frames().find(f => f.url().includes('panel.html'));

  // Push mock data as notifications to both iframes
  const pushData = async (frame) => {
    if (!frame) return;
    await frame.evaluate(() => {
      const dispatch = (method, params) =>
        window.dispatchEvent(new MessageEvent('message', {
          data: { method, receiver: { type: 'broadcast' }, params }
        }));
      dispatch('pushRateLimit',    window.MOCK_RATE_LIMIT);
      dispatch('pushUsageSummary', window.MOCK_USAGE);
    });
  };

  await pushData(sbFrame);
  await pushData(panelFrame);
  await page.waitForTimeout(1200); // wait for charts to render

  // Verify
  if (sbFrame) {
    const txt = await sbFrame.evaluate(() => document.getElementById('root')?.textContent?.substring(0, 60));
    console.log('Sidebar:', txt?.replace(/\s+/g, ' ').trim());
  }
  if (panelFrame) {
    const txt = await panelFrame.evaluate(() => document.getElementById('root')?.textContent?.substring(0, 60));
    console.log('Panel:', txt?.replace(/\s+/g, ' ').trim());
  }

  // ── Capture frames ────────────────────────────────────────────────
  const frameBuffers = [];

  for (let i = 0; i < SCROLL_FRAMES.length; i++) {
    const frame = SCROLL_FRAMES[i];

    // Scroll inside the panel iframe
    if (panelFrame) {
      await panelFrame.evaluate((top) => {
        const root = document.getElementById('root');
        if (root) root.scrollTop = top;
        // Also try panel-root parent
        const pr = document.querySelector('.panel-root');
        if (pr && pr.parentElement) pr.parentElement.scrollTop = top;
      }, frame.scroll);
      await page.waitForTimeout(100);
    }

    const buf = await page.screenshot({ type: 'png' });
    frameBuffers.push({ buf, delay: frame.hold });
    console.log(`  [${i+1}/${SCROLL_FRAMES.length}] ${frame.desc}`);
  }

  await browser.close();
  console.log('Encoding GIF…');

  // ── Encode GIF ─────────────────────────────────────────────────────
  const encoder = new GIFEncoder(W, H, 'neuquant', false);
  encoder.setQuality(15);
  encoder.setRepeat(0);

  const writeStream = fs.createWriteStream(OUT_PATH);
  encoder.createReadStream().pipe(writeStream);
  encoder.start();

  for (let i = 0; i < frameBuffers.length; i++) {
    const { buf, delay } = frameBuffers[i];
    const img = await Jimp.fromBuffer(buf);
    const raw = img.bitmap.data;
    const pixels = new Uint8Array(W * H * 3);
    for (let j = 0; j < W * H; j++) {
      pixels[j * 3]     = raw[j * 4];
      pixels[j * 3 + 1] = raw[j * 4 + 1];
      pixels[j * 3 + 2] = raw[j * 4 + 2];
    }
    encoder.setDelay(delay);
    encoder.addFrame(pixels);
    console.log(`  encoded ${i+1}/${frameBuffers.length} (${delay}ms)`);
  }

  encoder.finish();
  await new Promise((res, rej) => { writeStream.on('finish', res); writeStream.on('error', rej); });

  const stats = fs.statSync(OUT_PATH);
  console.log(`\nDone! → ${OUT_PATH}  (${(stats.size/1024).toFixed(0)} KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
