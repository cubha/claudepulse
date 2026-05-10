import { describe, it, expect } from 'vitest';
import { decodeProjectPathSync, decodeProjectPathWithCwd } from '../../src/utils/pathDecoder';

describe('pathDecoder', () => {
  it('decodeProjectPathSync reverses encoded absolute path (leading hyphen → /)', () => {
    // Claude Code encodes "/" as "-", e.g. "/mnt/d/workspace" → "-mnt-d-workspace"
    expect(decodeProjectPathSync('-mnt-d-workspace')).toBe('/mnt/d/workspace');
    expect(decodeProjectPathSync('-home-user-proj')).toBe('/home/user/proj');
  });

  it('decodeProjectPathWithCwd falls back to sync decode when no jsonl path given', () => {
    expect(decodeProjectPathWithCwd('-mnt-d-workspace')).toBe('/mnt/d/workspace');
  });
});
