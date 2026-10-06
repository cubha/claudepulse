/**
 * Integration smoke test — runs inside VS Code Extension Host via @vscode/test-cli (mocha, tdd ui).
 * Verifies that the extension activates and registers its contributed commands.
 *
 * Run: npm run test:integration  (pretest bundles this file to dist-test/integration/extension.test.cjs)
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as pkg from '../../package.json';

// 리터럴로 둔다 — branding.invariants.test.ts가 이 문자열을 마켓 ID로 잠근다(v0.1.57 오ID 회귀잠금).
const EXTENSION_ID = 'cubha.claude-code-gauge';

suite('Extension activation smoke', () => {
  test('extension activates', async () => {
    const extension = vscode.extensions.getExtension('cubha.claude-code-gauge');
    assert.ok(extension, `Extension ${EXTENSION_ID} not found in Extension Host`);

    if (!extension.isActive) {
      await extension.activate();
    }
    assert.ok(extension.isActive, 'Extension did not activate');
  });

  test('every contributed command is registered after activation', async () => {
    const registered = new Set(await vscode.commands.getCommands(true));
    const contributed = pkg.contributes.commands.map(c => c.command);
    assert.ok(contributed.length > 0, 'package.json contributes no commands');
    const missing = contributed.filter(c => !registered.has(c));
    assert.deepStrictEqual(missing, [], `contributed but not registered: ${missing.join(', ')}`);
  });
});
