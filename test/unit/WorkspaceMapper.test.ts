import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WorkspaceMapper } from '../../src/services/WorkspaceMapper';

describe('WorkspaceMapper [characterization]', () => {
  let claudeDir: string;
  let projectsDir: string;

  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspacemapper-'));
    projectsDir = path.join(claudeDir, 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(claudeDir, { recursive: true, force: true });
  });

  describe('getProjectDir', () => {
    it('워크스페이스 경로를 인코딩한 디렉토리가 있으면 그 경로를 반환한다', () => {
      const encoded = '-tmp-my-project'; // '/','\\','_' → '-'
      fs.mkdirSync(path.join(projectsDir, encoded));
      const mapper = new WorkspaceMapper(claudeDir);
      expect(mapper.getProjectDir('/tmp/my-project')).toBe(path.join(projectsDir, encoded));
    });

    it('정확히 일치하는 디렉토리가 없으면 prefix 매칭 폴백을 시도한다', () => {
      const encoded = '-tmp-my-project';
      const suffixed = encoded + '-abc123';
      fs.mkdirSync(path.join(projectsDir, suffixed));
      const mapper = new WorkspaceMapper(claudeDir);
      expect(mapper.getProjectDir('/tmp/my-project')).toBe(path.join(projectsDir, suffixed));
    });

    it('일치하는 디렉토리가 전혀 없으면 null을 반환한다', () => {
      const mapper = new WorkspaceMapper(claudeDir);
      expect(mapper.getProjectDir('/tmp/nowhere')).toBeNull();
    });

    it('projects 디렉토리 자체가 없으면 throw하지 않고 null을 반환한다', () => {
      fs.rmSync(projectsDir, { recursive: true, force: true });
      const mapper = new WorkspaceMapper(claudeDir);
      expect(mapper.getProjectDir('/tmp/anything')).toBeNull();
    });
  });

  describe('getAllJsonlFiles', () => {
    it('반환값은 Promise다 — 활성화 경로 동기 readdir 차단 방지(v0.1.54 ST3 async 전환)', () => {
      const mapper = new WorkspaceMapper(claudeDir);
      expect(mapper.getAllJsonlFiles()).toBeInstanceOf(Promise);
    });

    it('모든 프로젝트 하위의 .jsonl 파일 경로를 반환한다', async () => {
      const p1 = path.join(projectsDir, 'proj-a');
      const p2 = path.join(projectsDir, 'proj-b');
      fs.mkdirSync(p1);
      fs.mkdirSync(p2);
      fs.writeFileSync(path.join(p1, 'session1.jsonl'), '');
      fs.writeFileSync(path.join(p1, 'notes.txt'), '');
      fs.writeFileSync(path.join(p2, 'session2.jsonl'), '');

      const mapper = new WorkspaceMapper(claudeDir);
      const files = (await mapper.getAllJsonlFiles()).sort();

      expect(files).toEqual([
        path.join(p1, 'session1.jsonl'),
        path.join(p2, 'session2.jsonl'),
      ].sort());
    });

    it('projects 디렉토리가 없으면 빈 배열을 반환한다', async () => {
      fs.rmSync(projectsDir, { recursive: true, force: true });
      const mapper = new WorkspaceMapper(claudeDir);
      expect(await mapper.getAllJsonlFiles()).toEqual([]);
    });

    it('개별 프로젝트 디렉토리 접근 실패는 무시하고 나머지는 반환한다', async () => {
      const p1 = path.join(projectsDir, 'proj-a');
      fs.mkdirSync(p1);
      fs.writeFileSync(path.join(p1, 'session1.jsonl'), '');
      // 파일인데 디렉토리처럼 취급되는 엔트리(readdirSync 실패 유도)
      fs.writeFileSync(path.join(projectsDir, 'not-a-dir'), '');

      const mapper = new WorkspaceMapper(claudeDir);
      const files = await mapper.getAllJsonlFiles();
      expect(files).toEqual([path.join(p1, 'session1.jsonl')]);
    });
  });

  describe('cwdMatchesWorkspace', () => {
    it('utils/workspaceMatch의 cwdMatchesWorkspace로 위임한다', () => {
      const mapper = new WorkspaceMapper(claudeDir);
      expect(mapper.cwdMatchesWorkspace('/tmp/my-project/sub', '/tmp/my-project')).toBe(true);
      expect(mapper.cwdMatchesWorkspace('/tmp/other', '/tmp/my-project')).toBe(false);
    });
  });

  describe('constructor', () => {
    it('claudeDir 미지정 시 os.homedir()/.claude/projects를 사용한다', () => {
      const mapper = new WorkspaceMapper();
      // private 필드라 직접 접근 불가 — 존재하지 않는 홈 하위 경로 조회로 간접 확인(throw 없이 null)
      expect(mapper.getProjectDir('/definitely/not/a/real/path/xyz')).toBeNull();
    });
  });
});
