// @vscode/test-cli 설정(v0.2.6 R4) — `npm run test:integration`이 실제 VS Code 확장 호스트에서
// mocha로 활성화 스모크를 돌린다. 테스트는 TS라 먼저 esbuild로 CJS 번들을 만든다(package.json
// pretest:integration). WSL/CI는 화면이 없어 xvfb-run 아래에서 실행한다(test:e2e와 동일).
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'dist-test/integration/extension.test.cjs',
  mocha: { ui: 'tdd', timeout: 60000 },
  launchArgs: ['--disable-extensions', '--disable-gpu', '--no-sandbox'],
});
