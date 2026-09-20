import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { ClaudeSource } from '../../../src/sources/claude/ClaudeSource';

describe('ClaudeSource.detectAvailability — 3단 판정(무행위변경 어댑터)', () => {
  let tmpHome: string;

  afterEach(() => {
    if (tmpHome) fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('~/.claude 디렉토리 자체가 없으면 not_installed', async () => {
    const src = new ClaudeSource(path.join(os.tmpdir(), 'claude-home-missing-xyz'), path.join(os.tmpdir(), 'nope.json'));
    expect(await src.detectAvailability()).toBe('not_installed');
  });

  it('디렉토리는 있지만 credentials 파일이 없으면 not_authenticated', async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-home-'));
    const src = new ClaudeSource(tmpHome, path.join(tmpHome, '.credentials.json'));
    expect(await src.detectAvailability()).toBe('not_authenticated');
  });

  it('accessToken 없는 credentials면 not_authenticated', async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-home-'));
    const credPath = path.join(tmpHome, '.credentials.json');
    fs.writeFileSync(credPath, JSON.stringify({ claudeAiOauth: {} }));
    const src = new ClaudeSource(tmpHome, credPath);
    expect(await src.detectAvailability()).toBe('not_authenticated');
  });

  it('인증 OK인데 projects 폴더에 jsonl이 없으면 no_records', async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-home-'));
    const credPath = path.join(tmpHome, '.credentials.json');
    fs.writeFileSync(credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }));
    const src = new ClaudeSource(tmpHome, credPath);
    expect(await src.detectAvailability()).toBe('no_records');
  });

  it('인증 + jsonl 존재 시 ready', async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-home-'));
    const credPath = path.join(tmpHome, '.credentials.json');
    fs.writeFileSync(credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }));
    const projDir = path.join(tmpHome, 'projects', 'some-project');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'session.jsonl'), '');
    const src = new ClaudeSource(tmpHome, credPath);
    expect(await src.detectAvailability()).toBe('ready');
  });
});
