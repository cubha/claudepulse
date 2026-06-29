import { describe, it, expect } from 'vitest';
import * as contracts from '../../src/messaging/contracts';
import {
  WEBVIEW_BROADCAST_METHODS,
  PushRateLimit,
  PushPollerError,
  PushLang,
  PushUsageSummary,
  PushRetroSummary,
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

  it('vscode-messenger 전달 필터(indexOf>=0)에서 PushUsageSummary·PushRetroSummary가 통과한다', () => {
    // 라이브러리 delivery 조건을 그대로 재현: 등재 method만 webview로 postMessage.
    const delivered = (method: string) => WEBVIEW_BROADCAST_METHODS.indexOf(method) >= 0;
    expect(delivered(PushUsageSummary.method)).toBe(true);
    expect(delivered(PushRetroSummary.method)).toBe(true);
  });

  /**
   * 설계 변경(2026-06-29): retro pull-전용 잠금 해제 → push 백업 추가.
   *
   * 구 잠금("PushRetroSummary 존재 금지")은 "usage push가 updateRetroSection을 거쳐
   * GetRetroSummary pull을 전이 트리거하므로 별도 broadcast 불필요"라는 가정에 의존했다.
   * 락다운 환경(보안SW가 webview→extension 요청 라운드트립 간섭)에서 그 pull이 불발 →
   * 회고만 "수집 중" 영구 고착(타 섹션은 push 백업 있어 정상). 가정이 깨졌으므로
   * 회고도 형제 섹션과 동일하게 push로 전달하고, GetRetroSummary는 first-paint fallback으로 유지한다.
   */
  it('retro는 push(주) + pull(fallback) 양방향 — PushRetroSummary가 broadcast에 등재된다', () => {
    expect('PushRetroSummary' in contracts).toBe(true);
    expect(PushRetroSummary.method).toBe('pushRetroSummary');
    // ⚠️ 핵심: 누락 시 회고가 push 갱신을 못 받아 pull 실패 환경에서 영구 고착(이 변경의 회귀 잠금).
    expect(WEBVIEW_BROADCAST_METHODS).toContain(PushRetroSummary.method);
    // pull 계약은 fallback으로 유지(이중 보장 — 제거 금지).
    expect(GetRetroSummary.method).toBe('getRetroSummary');
  });
});
