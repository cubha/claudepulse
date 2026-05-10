import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { CredentialsReader } from '../../src/services/CredentialsReader';

describe('CredentialsReader', () => {
  let tmpDir: string;
  let reader: CredentialsReader;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claudepulse-test-'));
    reader = new CredentialsReader();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('정상적인 credentials.json을 파싱한다', async () => {
    const credPath = path.join(tmpDir, '.credentials.json');
    await fs.writeFile(credPath, JSON.stringify({
      claudeAiOauth: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: 9999999999000,
      }
    }));

    const creds = await reader.read(credPath);
    expect(creds.accessToken).toBe('test-access-token');
    expect(creds.refreshToken).toBe('test-refresh-token');
    expect(creds.expiresAt).toBe(9999999999000);
  });

  it('파일이 없으면 에러를 throw한다', async () => {
    const credPath = path.join(tmpDir, 'nonexistent.json');
    await expect(reader.read(credPath)).rejects.toThrow('not found');
  });

  it('잘못된 JSON이면 에러를 throw한다', async () => {
    const credPath = path.join(tmpDir, '.credentials.json');
    await fs.writeFile(credPath, '{ invalid json }');
    await expect(reader.read(credPath)).rejects.toThrow('not valid JSON');
  });

  it('accessToken 없으면 에러를 throw한다', async () => {
    const credPath = path.join(tmpDir, '.credentials.json');
    await fs.writeFile(credPath, JSON.stringify({ claudeAiOauth: { refreshToken: 'r' } }));
    await expect(reader.read(credPath)).rejects.toThrow('accessToken');
  });

  it('refreshToken/expiresAt 없어도 기본값으로 파싱한다', async () => {
    const credPath = path.join(tmpDir, '.credentials.json');
    await fs.writeFile(credPath, JSON.stringify({
      claudeAiOauth: { accessToken: 'tok' }
    }));
    const creds = await reader.read(credPath);
    expect(creds.accessToken).toBe('tok');
    expect(creds.refreshToken).toBe('');
    expect(creds.expiresAt).toBe(0);
  });
});
