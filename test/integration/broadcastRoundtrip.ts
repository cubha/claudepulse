/**
 * test-electron 왕복 검증 — 실제 VS Code 확장 호스트(WSL/xvfb)에서
 * 실제 vscode-messenger Messenger로 PushUsageSummary BROADCAST가
 * webview 패널에 도달하는지 대조한다.
 *
 * 핵심: 같은 broadcast를 두 패널에 보낸다.
 *  - FIX 패널  = WEBVIEW_BROADCAST_METHODS(PushUsageSummary 포함) → 받아야 함
 *  - 회귀 패널 = 옛 리스트(PushUsageSummary 누락)        → 받으면 안 됨
 * 이로써 라이브러리 소스 증명을 실제 런타임 왕복으로 확정한다.
 *
 * extensionTestsPath가 require하는 모듈 — mocha 불요, run()이 throw하면 실패.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { Messenger } from 'vscode-messenger';
import { BROADCAST } from 'vscode-messenger-common';
import {
  WEBVIEW_BROADCAST_METHODS,
  PushUsageSummary,
  PushRateLimit,
  PushPollerError,
  PushLang,
} from '../../src/messaging/contracts';

/** webview.postMessage를 가로채 전달된 method를 기록한다. */
function spyMethods(panel: vscode.WebviewPanel): string[] {
  const recorded: string[] = [];
  const wv = panel.webview as unknown as { postMessage: (m: unknown) => Thenable<boolean> };
  const orig = wv.postMessage.bind(wv);
  wv.postMessage = (m: unknown) => {
    const method = (m as { method?: string })?.method;
    if (typeof method === 'string') recorded.push(method);
    return orig(m);
  };
  return recorded;
}

export async function run(): Promise<void> {
  const messenger = new Messenger();

  const fixPanel = vscode.window.createWebviewPanel(
    'ccg.test.fix', 'fix', vscode.ViewColumn.One, { enableScripts: true }
  );
  const regressionPanel = vscode.window.createWebviewPanel(
    'ccg.test.regression', 'regression', vscode.ViewColumn.Two, { enableScripts: true }
  );

  // 패널은 보일 때만 broadcast 수신(visible 게이트). reveal로 가시화.
  fixPanel.reveal(vscode.ViewColumn.One, false);
  regressionPanel.reveal(vscode.ViewColumn.Two, false);

  const fixSeen = spyMethods(fixPanel);
  const regSeen = spyMethods(regressionPanel);

  // FIX: 공유 상수(PushUsageSummary 포함). 회귀: 수정 전 옛 리스트(누락 재현).
  messenger.registerWebviewPanel(fixPanel, { broadcastMethods: WEBVIEW_BROADCAST_METHODS });
  messenger.registerWebviewPanel(regressionPanel, {
    broadcastMethods: [PushRateLimit.method, PushPollerError.method, PushLang.method],
  });

  // 실제 BROADCAST 발신 (extension.ts refreshUsage와 동일 경로)
  const fakeUsage = { today: { totalTokens: 1, costUsd: 0.01 } } as never;
  messenger.sendNotification(PushUsageSummary, BROADCAST, fakeUsage);

  // postMessage는 async — 전달 마이크로/매크로태스크 정착 대기
  await new Promise((r) => setTimeout(r, 300));

  try {
    assert.ok(
      fixSeen.includes(PushUsageSummary.method),
      `FIX 패널이 PushUsageSummary를 받지 못함. 수신=${JSON.stringify(fixSeen)}`
    );
    assert.ok(
      !regSeen.includes(PushUsageSummary.method),
      `회귀 패널이 PushUsageSummary를 받음(누락이어야 정상). 수신=${JSON.stringify(regSeen)}`
    );
    // 대조군 sanity: 두 패널 모두 PushRateLimit은 받아야(둘 다 등재)
    messenger.sendNotification(PushRateLimit, BROADCAST, { } as never);
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(fixSeen.includes(PushRateLimit.method), 'FIX 패널이 PushRateLimit 미수신(sanity 실패)');
    assert.ok(regSeen.includes(PushRateLimit.method), '회귀 패널이 PushRateLimit 미수신(sanity 실패)');
  } finally {
    fixPanel.dispose();
    regressionPanel.dispose();
  }

  console.log('[roundtrip] PASS — FIX panel received pushUsageSummary; regression panel did not.');
}
