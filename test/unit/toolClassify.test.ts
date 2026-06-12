import { describe, it, expect } from 'vitest';
import { classifyToolName, emptyToolCounts } from '../../src/services/JsonlParser';

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
