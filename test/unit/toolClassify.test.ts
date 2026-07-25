import { describe, it, expect } from 'vitest';
import { classifyToolName, emptyToolCounts, mcpServerName } from '../../src/services/JsonlParser';

describe('classifyToolName — 도구 카운트 세분화', () => {
  it('편집 계열', () => {
    expect(classifyToolName('Edit')).toBe('edit');
    expect(classifyToolName('MultiEdit')).toBe('edit');
    expect(classifyToolName('Write')).toBe('write');
  });

  it('Bash', () => {
    expect(classifyToolName('Bash')).toBe('bash');
  });

  it('Read는 read로 분리 (기존엔 other로 묻혔던 최대 버킷)', () => {
    expect(classifyToolName('Read')).toBe('read');
  });

  it('Grep/Glob은 grep으로 분리', () => {
    expect(classifyToolName('Grep')).toBe('grep');
    expect(classifyToolName('Glob')).toBe('grep');
  });

  it('WebSearch / WebFetch 분리', () => {
    expect(classifyToolName('WebSearch')).toBe('webSearch');
    expect(classifyToolName('web_search')).toBe('webSearch');
    expect(classifyToolName('WebFetch')).toBe('webFetch');
    expect(classifyToolName('web_fetch')).toBe('webFetch');
  });

  it('mcp__* 도구는 mcp 그룹', () => {
    expect(classifyToolName('mcp__playwright__browser_navigate')).toBe('mcp');
    expect(classifyToolName('mcp__claude_ai_Context7__query-docs')).toBe('mcp');
  });

  it('미분류 도구는 other (Task/Skill/Agent 등)', () => {
    expect(classifyToolName('TaskUpdate')).toBe('other');
    expect(classifyToolName('Skill')).toBe('other');
    expect(classifyToolName('SomeUnknownTool')).toBe('other');
  });

  it('emptyToolCounts는 모든 카테고리를 0으로 초기화', () => {
    const c = emptyToolCounts();
    expect(c).toEqual({
      edit: 0, write: 0, bash: 0, read: 0, grep: 0,
      webSearch: 0, webFetch: 0, mcp: 0, other: 0,
    });
  });
});

describe('mcpServerName — mcp__<server>__<tool>에서 서버명 추출', () => {
  it('mcp__ 접두사 도구에서 서버명 추출', () => {
    expect(mcpServerName('mcp__playwright__browser_navigate')).toBe('playwright');
    expect(mcpServerName('mcp__chrome-devtools__click')).toBe('chrome-devtools');
  });

  it('서버명 자체에 언더스코어가 있어도 두 번째 세그먼트만 서버명(관측된 실제 패턴)', () => {
    expect(mcpServerName('mcp__claude_ai_Context7__query-docs')).toBe('claude_ai_Context7');
    expect(mcpServerName('mcp__claude_ai_Supabase__get_advisors')).toBe('claude_ai_Supabase');
  });

  it('도구명 자체에 언더스코어가 더 있어도 서버명엔 영향 없음', () => {
    expect(mcpServerName('mcp__chrome-devtools__list_network_requests')).toBe('chrome-devtools');
  });

  it('mcp__ 접두사가 아니면 undefined', () => {
    expect(mcpServerName('Edit')).toBeUndefined();
    expect(mcpServerName('WebSearch')).toBeUndefined();
  });
});
