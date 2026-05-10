import * as fs from 'node:fs/promises';
import type { ClaudeCredentials } from '../types';

export class CredentialsReader {
  async read(credentialsPath: string): Promise<ClaudeCredentials> {
    let raw: string;
    try {
      raw = await fs.readFile(credentialsPath, 'utf-8');
    } catch {
      throw new Error(`Credentials file not found: ${credentialsPath}\nRun Claude Code CLI once to generate it.`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Credentials file is not valid JSON: ${credentialsPath}`);
    }

    const oauth = (parsed as Record<string, unknown>)?.claudeAiOauth as Record<string, unknown> | undefined;
    if (!oauth?.accessToken || typeof oauth.accessToken !== 'string') {
      throw new Error('Credentials file missing claudeAiOauth.accessToken — re-login via Claude Code CLI.');
    }

    return {
      accessToken: oauth.accessToken as string,
      refreshToken: (oauth.refreshToken as string | undefined) ?? '',
      expiresAt: (oauth.expiresAt as number | undefined) ?? 0,
    };
  }
}
