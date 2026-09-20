import type { AgentProvider } from './recordKey';

/**
 * 프로바이더가 실제로 지원하는 기능 축 (v0.2.0).
 *
 * `rateLimit`/`usdCost`는 **정적 가능성**이지, "지금 이 화면에 게이지를 그려라"가 아니다.
 * 실제 렌더 여부는 세션 데이터에 해당 필드가 존재하는지로 런타임 판별한다(D9 — Codex는
 * free 플랜·API key 모드 등에서 `rate_limits`가 세션별로 없을 수 있다). 정적 플래그로
 * on/off를 걸면 "지원하지만 이 세션엔 값이 없는" 케이스를 표현할 수 없다.
 */
export interface AgentSourceCapabilities {
  /** 이 프로바이더가 원리적으로 한도 게이지 데이터를 가질 수 있는가. */
  rateLimit: boolean;
  /** 이 프로바이더가 원리적으로 USD 비용을 가질 수 있는가(구독 전용 인증도 true — 추정치로 표시). */
  usdCost: boolean;
  skillAttribution: boolean;
  subagentAttribution: boolean;
  mcpAttribution: boolean;
}

export const CLAUDE_CAPABILITIES: AgentSourceCapabilities = {
  rateLimit: true,
  usdCost: true,
  skillAttribution: true,
  subagentAttribution: true,
  mcpAttribution: true,
};

export const CODEX_CAPABILITIES: AgentSourceCapabilities = {
  rateLimit: true,
  usdCost: true,
  // attributionSkill/isSidechain/agentId는 Claude jsonl 고유 필드다 — Codex는 데이터 자체가 없다.
  skillAttribution: false,
  subagentAttribution: false,
  mcpAttribution: false,
};

/** 3단 빈 상태 판정(v0.2.0, 사용자 지시 — 양 프로바이더 공통). PollerError와 분리된 축(§6). */
export type AgentAvailability =
  | 'not_installed'  // 홈 디렉토리 자체가 없다 — 로그인 버튼을 주지 않는다(눌러도 못 고친다)
  | 'not_authenticated'
  | 'no_records'      // 인증 OK, 세션 0건 — 에러가 아니라 데이터 부재
  | 'ready';

export interface AgentSource {
  readonly provider: AgentProvider;
  readonly capabilities: AgentSourceCapabilities;
  detectAvailability(): Promise<AgentAvailability>;
}
