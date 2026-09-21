import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// 디자인 발전(evolve, v0.2.0 동반) — 카드 17→6 판정을 산문이 아니라 기계로 잠근다.
// 근거: memory reference_design_shian_artifact.md의 M2(차트 3·목록 4·지표 4 = 11 제거,
// 17-11=6 잔존) + Artifact 캔버스 S1~S5 보드 전수 조사(대체 정정).
// 게이지 밖 4곳 라운드에서 ②신호 품질 카드로 7이 됐다가, 사용자 판단으로 그 카드를 제거해 6으로 환원
// (2026-09-18) — "신뢰도를 카드로 설명하는 것 자체가 신뢰를 깎는다" + 지표 5종이 각 카드에 인라인 배지로
// 이미 존재해 순수 중복이었다. 근사치 표기는 인라인 마커가 계속 담당한다.
const ROOT = process.cwd();
const panelSrc = fs.readFileSync(path.join(ROOT, 'src/webview/panelView.ts'), 'utf-8');
const stylesSrc = fs.readFileSync(path.join(ROOT, 'src/webview/styles.css'), 'utf-8');

describe('panelView.ts 카드 축소(M2) 회귀 잠금', () => {
  it('class="card 사용처가 정확히 6곳이다', () => {
    const matches = panelSrc.match(/class="card /g) ?? [];
    expect(matches.length).toBe(6);
  });

  it('묶음이 필요한 6곳(기간별비용·캘린더·모델·캐시·도구·귀속)만 카드를 유지한다', () => {
    // v0.2.2: 'panel-daily-card' → 'panel-cost-period-card'. 일별/장기/월별 3섹션을 탭 1개로
    // 통합하면서 통합 카드가 **일별 카드의 슬롯을 그대로 승계**했다 — 그래서 위 개수 6은 불변이다
    // (카드를 늘리거나 줄인 변경이 아니라 셋을 하나로 접은 변경이라는 뜻).
    const survivorIds = [
      'panel-cost-period-card', 'panel-calendar-card', 'panel-model-card',
      'panel-cache-card', 'panel-tool-card', 'panel-skill-card',
    ];
    for (const id of survivorIds) {
      expect(panelSrc).toMatch(new RegExp(`class="card [^"]*"\\s+id="${id}"`));
    }
  });

  it('지표 밴드·차트 3·목록 4는 카드 클래스가 없다(구분선으로 대체)', () => {
    // v0.2.2: 'panel-longterm-card'/'panel-monthly-card'는 통합으로 **id 자체가 사라졌다**.
    // 아래 루프가 `idx > -1`을 단언하므로 남겨 두면 "카드 클래스가 붙었다"가 아니라 "id가 없다"로
    // 실패한다 — 약화가 아니라 사라진 대상을 목록에서 뺀 것이다. 두 섹션이 사라지지 않고 탭 안으로
    // 들어갔다는 사실은 바로 아래 '통합' describe가 canvas 3개 존치로 대신 잠근다.
    const strippedIds = [
      'panel-fh-card', 'panel-sd-card', 'panel-files-card',
      'panel-session-card', 'panel-branch-card', 'panel-retro-card',
    ];
    for (const id of strippedIds) {
      const re = new RegExp(`id="${id}"`);
      const idx = panelSrc.search(re);
      expect(idx).toBeGreaterThan(-1);
      const lineStart = panelSrc.lastIndexOf('\n', idx);
      const line = panelSrc.slice(lineStart, idx);
      expect(line).not.toMatch(/class="card /);
    }
  });
});

// v0.2.2 기간별 비용 통합 — "셋을 하나로 접었다"를 잠근다. 위 카드 수 6과 짝이 되는 단언으로,
// 카드가 줄지 않았다는 사실만으로는 차트가 조용히 사라진 경우를 구분할 수 없기 때문이다.
describe('panelView.ts 기간별 비용 탭 통합(v0.2.2) 회귀 잠금', () => {
  it('탭 버튼과 pane이 각각 정확히 3개다(일별·장기·월별)', () => {
    const tabs = panelSrc.match(/class="cost-tab-btn[^"]*"/g) ?? [];
    expect(tabs.length).toBe(3);
    const panes = panelSrc.match(/class="cost-period-pane"/g) ?? [];
    expect(panes.length).toBe(3);
    for (const period of ['daily', 'longterm', 'monthly']) {
      expect(panelSrc).toMatch(new RegExp(`data-period="${period}"`));
      expect(panelSrc).toMatch(new RegExp(`id="cost-pane-${period}"`));
    }
  });

  it('세 차트 canvas와 빈상태·readout이 전부 살아 있다(통합≠삭제)', () => {
    for (const id of ['chart-daily', 'chart-longterm', 'chart-monthly',
                      'daily-empty', 'longterm-empty', 'monthly-empty',
                      'daily-readout', 'longterm-readout', 'monthly-readout']) {
      expect(panelSrc).toMatch(new RegExp(`id="${id}"`));
    }
  });

  it('세 pane이 통합 카드 안에만 있다(옛 독립 카드 id는 소멸)', () => {
    expect(panelSrc).not.toMatch(/id="panel-longterm-card"/);
    expect(panelSrc).not.toMatch(/id="panel-monthly-card"/);
    expect(panelSrc).not.toMatch(/id="panel-daily-card"/);
    const cardIdx = panelSrc.indexOf('id="panel-cost-period-card"');
    expect(cardIdx).toBeGreaterThan(-1);
    for (const period of ['daily', 'longterm', 'monthly']) {
      expect(panelSrc.indexOf(`id="cost-pane-${period}"`)).toBeGreaterThan(cardIdx);
    }
  });
});

describe('styles.css 토큰 선언 줄 불변(M1~M4 = 재배치, 새 토큰 0)', () => {
  it('--x: 선언 줄 수가 착수 전 기준(≥127)을 유지한다', () => {
    const declLines = stylesSrc.split('\n').filter(l => /^\s*--[a-z0-9-]+:/i.test(l));
    expect(declLines.length).toBeGreaterThanOrEqual(127);
  });

  it('.panel-metric-value·.cache-kpi-value가 --fs-mono-lg를 쓴다(M1)', () => {
    expect(stylesSrc).toMatch(/\.panel-metric-value\s*{[^}]*font-size:\s*var\(--fs-mono-lg\)/);
    expect(stylesSrc).toMatch(/\.cache-kpi-value\s*{[^}]*font-size:\s*var\(--fs-mono-lg\)/);
  });

  it('.panel-chart-header가 --fs-h2를 쓴다(M1, 13개 섹션 헤더 단일 선택자)', () => {
    expect(stylesSrc).toMatch(/\.panel-chart-header\s*{[^}]*font-size:\s*var\(--fs-h2\)/);
  });
});
