import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { codexPlanLabel } from '../../src/webview/codexPlan';

// v0.2.6 ST10 — Codex 플랜 표시명. §8 불변식5("값별 분기 금지, 원문 대문자화만")를 개정한다:
// 표시명은 이 한 함수에서만 정하고, 모르는 값은 원문 대문자로 폴백한다. 맵은 openai/codex
// ade17c6 `protocol/src/account.rs` PlanType(serde lowercase) 전수.

describe('codexPlanLabel', () => {
  it.each([
    ['free', 'Free'], ['go', 'Go'], ['plus', 'Plus'], ['pro', 'Pro'],
    ['prolite', 'Pro Lite'], ['promax', 'Pro Max'], ['team', 'Team'],
    ['self_serve_business_prolite', 'Business Pro Lite'],
    ['self_serve_business_usage_based', 'Business (Usage-based)'],
    ['business', 'Business'], ['ent26', 'Enterprise'],
    ['enterprise_cbp_automation', 'Enterprise (Automation)'],
    ['enterprise_cbp_usage_based', 'Enterprise (Usage-based)'],
    ['enterprise', 'Enterprise'], ['edu', 'Edu'], ['edu_plus', 'Edu Plus'], ['edu_pro', 'Edu Pro'],
  ])('%s → %s', (raw, want) => {
    expect(codexPlanLabel(raw)).toBe(want);
  });

  it('모르는 값은 원문 대문자 폴백(미래 플랜·unknown)', () => {
    expect(codexPlanLabel('team_enterprise')).toBe('TEAM_ENTERPRISE');
    expect(codexPlanLabel('unknown')).toBe('UNKNOWN');
  });

  it('대소문자 무관 매칭, 빈 값은 빈 문자열', () => {
    expect(codexPlanLabel('PLUS')).toBe('Plus');
    expect(codexPlanLabel(null)).toBe('');
    expect(codexPlanLabel('')).toBe('');
  });

  it("'constructor' 같은 상속 프로퍼티명은 맵에서 잡히지 않는다(외부 문자열)", () => {
    expect(codexPlanLabel('constructor')).toBe('CONSTRUCTOR');
  });
});

describe('Codex planType 렌더 지점 단일화 (v0.2.3 교훈 — 순수함수를 만들어도 우회 지점이 남으면 같은 결함)', () => {
  const files = ['planBadge.ts', 'sidebarView.ts', 'panelView.ts'].map(f => path.join(process.cwd(), 'src/webview', f));

  it('webview 어디에서도 planType을 직접 대문자화하지 않는다 — codexPlanLabel만 쓴다', () => {
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf-8');
      expect(src, path.basename(f)).not.toMatch(/planType\??\.toUpperCase\(\)/);
      expect(src, path.basename(f)).not.toMatch(/planLabel\.toUpperCase\(\)/);
    }
  });

  it('세 렌더 파일이 모두 codexPlanLabel을 import한다', () => {
    for (const f of files) {
      expect(fs.readFileSync(f, 'utf-8'), path.basename(f)).toMatch(/import \{[^}]*codexPlanLabel[^}]*\} from '\.\/codexPlan'/);
    }
  });
});
