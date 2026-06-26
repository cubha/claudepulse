/**
 * test-electron 왕복 검증 런처 — 실제 VS Code 호스트를 띄워
 * dist-test/integration/index.cjs(broadcastRoundtrip.run)를 실행한다.
 * 선행: esbuild로 index.cjs 번들 필요(npm run test:e2e가 함께 수행).
 * WSL/CI는 xvfb 필요: `xvfb-run -a node test/integration/runner.mjs`
 */
import { runTests } from '@vscode/test-electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..', '..');
try {
  await runTests({
    extensionDevelopmentPath: repo,
    extensionTestsPath: path.resolve(repo, 'dist-test/integration/index.cjs'),
    launchArgs: ['--disable-extensions', '--disable-gpu', '--no-sandbox'],
  });
  console.log('runTests: SUCCESS');
} catch (e) {
  console.error('runTests: FAILED', e?.message || e);
  process.exit(1);
}
