import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * v0.2.3 R2 — StatusBar가 프로바이더 전환을 무시하던 결함의 회귀 잠금.
 *
 * 결함: `statusBar.update(snapshot, ...)`가 RateLimitPoller 콜백 안에서 **provider 게이트 밖**에
 * 있었다. 바로 다음 줄의 `if (activeProvider === 'claude')`는 `PushRateLimit`(웹뷰 push)에만
 * 걸려 있어서, Codex가 활성인데도 StatusBar는 Claude의 5H/7D를 계속 폴링·표시했다.
 *
 * 이 파일이 소스 텍스트를 보는 이유: extension.ts의 activate()는 vscode 런타임 없이는
 * 호출할 수 없고(이 repo는 vscode 모듈 목이 없다), 그렇다고 통합테스트로만 두면 이 한 줄이
 * 다시 게이트 밖으로 새어나가도 아무도 모른다. 잠글 대상이 "호출이 어느 분기 안에 있는가"라는
 * 구문적 사실이므로 구문으로 잠근다 — branding.invariants.test.ts와 같은 부류다.
 */

const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('StatusBar provider 게이트 (v0.2.3 R2)', () => {
  const src = read('src/extension.ts');

  it('statusBar.update() 호출이 전부 activeProvider 분기 안에 있다', () => {
    const lines = src.split('\n');
    const callLines = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /\bstatusBar\.update\s*\(/.test(l));

    expect(callLines.length).toBeGreaterThan(0);

    for (const { l, i } of callLines) {
      // 호출 지점에서 위로 거슬러 올라가며 같은 콜백 스코프 안에 provider 판별이 있는지 본다.
      // 20줄이면 폴러 콜백 한 덩이를 덮는다(그보다 멀면 다른 스코프다).
      const above = lines.slice(Math.max(0, i - 20), i).join('\n');
      const gated = /activeProvider\s*===\s*'claude'/.test(above) || /isClaudeActive\s*\(/.test(above);
      expect(gated, `statusBar.update()가 provider 게이트 밖에 있다 — extension.ts:${i + 1}\n  ${l.trim()}`).toBe(true);
    }
  });

  it('StatusBarController가 숨김 경로를 제공한다', () => {
    const ctrl = read('src/providers/StatusBarController.ts');
    // Codex 활성 시 "낡은 Claude 수치를 그대로 두는" 것이 아니라 아이템 자체를 내린다.
    // 값을 안 갱신하기만 하면 화면에는 마지막 Claude 값이 그대로 남아 오히려 더 틀린다.
    expect(ctrl).toMatch(/\bhide\s*\(\s*\)\s*:\s*void/);
  });
});
