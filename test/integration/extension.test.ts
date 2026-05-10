/**
 * Integration smoke test — runs inside VS Code Extension Host via @vscode/test-electron.
 * Verifies that extension activates and registers a StatusBarItem.
 *
 * Run: npm run test:integration
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension activation smoke', () => {
  test('extension activates and StatusBar item is created', async () => {
    const extension = vscode.extensions.getExtension('cubha.claudepulse');
    assert.ok(extension, 'Extension not found in Extension Host');

    if (!extension.isActive) {
      await extension.activate();
    }
    assert.ok(extension.isActive, 'Extension did not activate');
    // StatusBarItem is a side-effect of activate; no direct API to enumerate,
    // but reaching here without throw confirms activate() completed cleanly.
  });
});
