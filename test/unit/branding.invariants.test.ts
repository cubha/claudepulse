import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * v0.1.57 리브랜딩 회귀 잠금.
 *
 * 이 파일이 지키는 것은 두 종류다.
 *  (1) 바꾸면 안 되는 것 — 마켓 ID·설정키·커맨드 ID. 바꾸는 순간 신규 익스텐션이 되거나
 *      기존 사용자의 settings.json / keybindings.json 이 조용히 무시된다.
 *  (2) 바꿔야 하는 것 — 사용자에게 보이는 제품명. 단 "Claude Code"(Anthropic CLI)는
 *      우리 제품명이 아니므로 전역 치환에 휩쓸리면 안 된다.
 */

const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');
const pkg = JSON.parse(read('package.json'));

const BRAND = 'AgentVitals';
const DISPLAY_NAME = 'AgentVitals — Claude Code & Codex Usage';
const LEGACY_NAME = 'Claude Code Gauge';

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...tsFiles(rel));
    else if (e.name.endsWith('.ts')) out.push(rel);
  }
  return out;
}

// ─── (1) 바꾸면 안 되는 것 ────────────────────────────────────────────────

describe('불변식: 마켓 identity', () => {
  it('name·publisher는 절대 불변 — 바꾸면 신규 익스텐션이 되어 설치수·평점·리뷰가 전부 0이 된다', () => {
    expect(pkg.name).toBe('claude-code-gauge');
    expect(pkg.publisher).toBe('cubha');
  });

  it('EXTENSION_ID 상수가 실제 마켓 ID와 일치한다', () => {
    expect(read('src/constants.ts')).toContain(`'${pkg.publisher}.${pkg.name}'`);
  });
});

describe('불변식: 사용자 설정·키바인딩 계약', () => {
  it('설정키 5개가 claudeCodeGauge.* 네임스페이스를 유지한다 — 바꾸면 기존 settings.json이 무성 무시된다', () => {
    const keys = Object.keys(pkg.contributes.configuration.properties);
    expect(keys.sort()).toEqual([
      'claudeCodeGauge.credentialsPath',
      'claudeCodeGauge.pollIntervalMs',
      'claudeCodeGauge.retroCommitScope',
      'claudeCodeGauge.usageRefreshIntervalMs',
      'claudeCodeGauge.utilizationWarnThreshold',
    ]);
  });

  it('커맨드 ID가 불변이다 — 바꾸면 사용자 keybindings/tasks가 깨진다(v0.2.0: loginCodex 신규 추가는 증분이라 무방, 기존 3개는 그대로)', () => {
    const ids = pkg.contributes.commands.map((c: { command: string }) => c.command).sort();
    expect(ids).toEqual([
      'claudeCodeGauge.login',
      'claudeCodeGauge.loginCodex',
      'claudeCodeGauge.openDashboard',
      'claudeCodeGauge.refresh',
    ]);
  });

  it('view·viewsContainer ID가 불변이다 — 바꾸면 사이드바 레이아웃 위치가 초기화된다', () => {
    expect(pkg.contributes.viewsContainers.activitybar[0].id).toBe('claudeCodeGauge');
    expect(pkg.contributes.views.claudeCodeGauge[0].id).toBe('claudeCodeGauge.sidebar');
  });
});

// ─── (2) 바꿔야 하는 것 ───────────────────────────────────────────────────

describe('리브랜딩: 마켓 메타', () => {
  it('displayName은 브랜드+서술 형태다 — 슬러그가 검색 랭킹에 안 잡히므로 검색어를 여기 남긴다', () => {
    expect(pkg.displayName).toBe(DISPLAY_NAME);
  });

  it('IDE 안에 뜨는 title은 짧은 브랜드 단독이다', () => {
    expect(pkg.contributes.viewsContainers.activitybar[0].title).toBe(BRAND);
    expect(pkg.contributes.views.claudeCodeGauge[0].name).toBe(BRAND);
    expect(pkg.contributes.configuration.title).toBe(BRAND);
    for (const c of pkg.contributes.commands) {
      expect(c.title.startsWith(`${BRAND}: `)).toBe(true);
    }
  });

  it('keywords가 옛 이름 회수 토큰과 신규 유입 토큰을 함께 갖는다', () => {
    for (const k of ['gauge', 'claude-code-gauge', 'claudepulse']) {
      expect(pkg.keywords).toContain(k);
    }
    for (const k of ['claude', 'claude-code', 'anthropic', 'codex', 'openai']) {
      expect(pkg.keywords).toContain(k);
    }
  });

  it('description이 Claude 전용 문구를 벗어나 Codex를 포함한다', () => {
    expect(pkg.description).toMatch(/Codex/);
    expect(pkg.description.length).toBeLessThanOrEqual(200);
  });
});

describe('리브랜딩: 옛 제품명 잔존 0', () => {
  it('src/ 전체에 "Claude Code Gauge"가 남아있지 않다', () => {
    const offenders = tsFiles('src').filter((f) => read(f).includes(LEGACY_NAME));
    expect(offenders).toEqual([]);
  });

  it('package.json 어디에도 "Claude Code Gauge"가 남아있지 않다', () => {
    expect(read('package.json')).not.toContain(LEGACY_NAME);
  });

  it('EXTENSION_NAME이 새 브랜드다', () => {
    expect(read('src/constants.ts')).toContain(`export const EXTENSION_NAME = '${BRAND}'`);
  });
});

// ─── (3) 전역 치환에 휩쓸리면 안 되는 것 ──────────────────────────────────

describe('보존: "Claude Code"는 Anthropic CLI이지 우리 제품명이 아니다', () => {
  it('i18n 4개국어 로그인 안내의 CLI 문구가 보존된다(v0.2.0 ST8: login_sub_missing 2키 분할 — 문구는 login_sub_not_installed로 이동, "Claude Code CLI" 자체는 유지)', () => {
    const i18n = read('src/webview/i18n.ts');
    expect(i18n).toContain('Claude Code CLI가 설치되어 있지 않습니다');
    expect(i18n).toContain('Claude Code CLI is not installed');
    expect(i18n).toContain('Claude Code CLIがインストールされていません');
    expect(i18n).toContain('未安装 Claude Code CLI');
  });

  it('src/ 내 CLI 참조가 16건 이상 보존된다 — 전역 sed가 돌면 이 수가 무너진다', () => {
    const n = tsFiles('src').reduce(
      (acc, f) => acc + (read(f).match(/Claude Code(?! Gauge)/g) ?? []).length,
      0,
    );
    expect(n).toBeGreaterThanOrEqual(16);
  });
});

describe('보존: 통합 테스트가 참조하는 확장 ID', () => {
  it('통합 테스트의 getExtension 인자가 실제 마켓 ID와 일치한다', () => {
    // test:integration 자체는 아직 verify.sh에 배선돼 있지 않다(별건). 배선 전까지는
    // 이 단위 테스트가 유일한 실효 게이트라 여기서 잠근다 — ID만 고치고 두면 같은 이유로 재발한다.
    const src = read('test/integration/extension.test.ts');
    expect(src).toContain(`getExtension('${pkg.publisher}.${pkg.name}')`);
    expect(src).not.toContain('cubha.claudepulse');
  });
});

describe('보존: README 배지는 마켓 ID로 조회한다', () => {
  it('배지 URL의 ID 슬러그가 보존된다 — 바꾸면 배지가 죽는다', () => {
    const readme = read('README.md');
    expect(readme).toContain('cubha.claude-code-gauge');
    expect(readme).toContain('cubha/claude-code-gauge');
  });

  it('README 제목(H1)은 새 브랜드다', () => {
    expect(read('README.md').split('\n')[0]).toContain(BRAND);
  });
});
