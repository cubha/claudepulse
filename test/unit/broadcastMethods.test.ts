import { describe, it, expect } from 'vitest';
import * as contracts from '../../src/messaging/contracts';
import {
  WEBVIEW_BROADCAST_METHODS,
  PushRateLimit,
  PushPollerError,
  PushLang,
  PushUsageSummary,
  GetRetroSummary,
} from '../../src/messaging/contracts';

/**
 * 회귀 잠금 — v0.1.40: BROADCAST 누락으로 usage 카드가 영구 "수집 중" 고착.
 *
 * 근본원인: DashboardPanel·SidebarViewProvider가 registerWebviewPanel/View의
 * broadcastMethods에 PushUsageSummary.method를 누락 → vscode-messenger 계약상
 * (messenger.js: `broadcastMethods.indexOf(type.method) >= 0`) 미등재 method는
 * BROADCAST가 webview에 전달되지 않아 onNotification 핸들러가 死. usage는 뷰 오픈
 * 1회 pull(GetUsageSummary)로만 채워졌고, 그 pull이 refreshUsage보다 빠르면 placeholder 영구 고착.
 *
 * 두 등록 지점이 이 단일 상수를 공유하므로, 여기서 상수 내용만 잠그면 재발 불가.
 */
describe('WEBVIEW_BROADCAST_METHODS', () => {
  it('webview가 onNotification 핸들러를 가진 모든 Push* method를 포함한다', () => {
    // webview(main.ts)가 핸들하는 4개 broadcast — 하나라도 빠지면 그 push는 死 핸들러가 된다.
    expect(WEBVIEW_BROADCAST_METHODS).toContain(PushRateLimit.method);
    expect(WEBVIEW_BROADCAST_METHODS).toContain(PushPollerError.method);
    expect(WEBVIEW_BROADCAST_METHODS).toContain(PushLang.method);
    // ⚠️ 이 줄이 회귀의 핵심: 누락 시 usage/회고 카드가 push 갱신을 못 받는다.
    expect(WEBVIEW_BROADCAST_METHODS).toContain(PushUsageSummary.method);
  });

  it('vscode-messenger 전달 필터(indexOf>=0)에서 PushUsageSummary가 통과한다', () => {
    // 라이브러리 delivery 조건을 그대로 재현: 등재 method만 webview로 postMessage.
    const delivered = (method: string) => WEBVIEW_BROADCAST_METHODS.indexOf(method) >= 0;
    expect(delivered(PushUsageSummary.method)).toBe(true);
  });

  it('retro는 pull 전용 — PushRetroSummary broadcast는 존재하지 않아야 한다(설계 잠금)', () => {
    // 회고는 GetRetroSummary 요청(pull)으로만 전달된다. usage push가 updateUsageSection→
    // updateRetroSection을 거쳐 이 pull을 전이적으로 트리거하므로 별도 retro broadcast는 불필요.
    // 누군가 PushRetroSummary를 추가해 broadcast로 바꾸려 하면 이 테스트가 막는다.
    expect('PushRetroSummary' in contracts).toBe(false);
    expect(GetRetroSummary.method).toBe('getRetroSummary'); // request(pull) 계약 유지 확인
  });
});
