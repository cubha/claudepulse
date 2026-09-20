import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentAvailability, AgentSource } from '../AgentSource';
import { CLAUDE_CAPABILITIES } from '../AgentSource';
import { classifyAvailability } from '../availability';
import { CredentialsReader } from '../../services/CredentialsReader';
import { DEFAULT_CREDENTIALS_PATH } from '../../constants';

/**
 * `AgentSource` 어댑터 — 기존 Claude 파싱·집계 파이프라인(`JsonlParser`·`UsageAggregator`·
 * `FileWatcher`·`CredentialsReader`)은 **한 줄도 바꾸지 않는다**(ST2, §3 CRITICAL 무행위변경).
 * `extension.ts`는 계속 그 클래스들을 직접 쓴다 — 이 클래스는 아직 어디서도 호출되지 않으며,
 * `detectAvailability()`만 새로 노출해 ST8(3단 빈 상태) 배선 시 Codex와 같은 인터페이스로
 * 교체 가능하게 한다. 완료 조건은 advisor 지적대로 "기존 스위트 전량 그린 + 테스트 무수정".
 */
export class ClaudeSource implements AgentSource {
  readonly provider = 'claude' as const;
  readonly capabilities = CLAUDE_CAPABILITIES;

  constructor(
    private readonly claudeDir: string = path.join(os.homedir(), '.claude'),
    private readonly credentialsPath: string = DEFAULT_CREDENTIALS_PATH,
    private readonly credReader: CredentialsReader = new CredentialsReader(),
  ) {}

  async detectAvailability(): Promise<AgentAvailability> {
    const homeDirExists = fs.existsSync(this.claudeDir);
    const authValid = homeDirExists && await this.readAuthValid();
    const hasRecords = authValid && await this.hasAnyProjectFile();
    return classifyAvailability({ homeDirExists, authValid, hasRecords });
  }

  private async readAuthValid(): Promise<boolean> {
    try {
      await this.credReader.read(this.credentialsPath);
      return true;
    } catch {
      return false;
    }
  }

  private async hasAnyProjectFile(): Promise<boolean> {
    const projectsDir = path.join(this.claudeDir, 'projects');
    let projects: fs.Dirent[];
    try {
      projects = await fs.promises.readdir(projectsDir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const p of projects) {
      if (!p.isDirectory()) continue;
      try {
        const files = await fs.promises.readdir(path.join(projectsDir, p.name));
        if (files.some(f => f.endsWith('.jsonl'))) return true;
      } catch {
        continue;
      }
    }
    return false;
  }
}
