import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ONE_MILLION_SUFFIX = '[1m]';

/**
 * `~/.claude.json`의 `projects.*.lastModelUsage` 키에서 `[1m]` 접미사가 붙은
 * 모델의 base id 집합을 읽는다(S1②, 2026-08-03).
 *
 * jsonl에는 이 접미사가 기록되지 않아(2026-08 로그 78K건 전수 확인, 0건) 1M 베타 활성 여부를
 * 레코드 단위로 판별할 수 없지만, 이 파일은 CLI가 프로젝트별 최근 사용 모델 변종을 그대로
 * 보존한다. 로컬 표준 설정 파일 읽기라 CRITICAL #3(비공개 HTTP API 금지)와 무관하다.
 *
 * 읽기 실패(파일없음·손상·스키마 상이)는 전부 빈 Set으로 안전 폴백 — 이 값이 없으면
 * UsageAggregator는 관측증명(①)·200K 테이블(③)로 계속 판단할 수 있어 예외를 던질 이유가 없다.
 */
export async function readOneMillionModelsFromClaudeJson(claudeJsonPath?: string): Promise<Set<string>> {
  const filePath = claudeJsonPath ?? path.join(os.homedir(), '.claude.json');
  const models = new Set<string>();
  let raw: string;
  try {
    raw = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return models;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return models;
  }

  const projects = (data as { projects?: unknown })?.projects;
  if (!projects || typeof projects !== 'object') return models;

  for (const project of Object.values(projects as Record<string, unknown>)) {
    const lastModelUsage = (project as { lastModelUsage?: unknown })?.lastModelUsage;
    if (!lastModelUsage || typeof lastModelUsage !== 'object') continue;
    for (const key of Object.keys(lastModelUsage)) {
      if (key.endsWith(ONE_MILLION_SUFFIX)) {
        models.add(key.slice(0, -ONE_MILLION_SUFFIX.length));
      }
    }
  }

  return models;
}
