import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * v0.2.4 — 대시보드 본문의 서술형 문구를 "상태 마커 + 호버 툴팁"으로 옮긴 결과를 잠근다.
 * 문장 키는 남아도 되지만 **툴팁(tip:/title=) 자리에서만** 쓰여야 한다 — 본문에 다시 나오면
 * 화면이 이전처럼 읽을거리로 무거워진다(사용자 지적: "실제선이 … 여유가 있다", "프롬프트 재사용이 …").
 */
const src = fs.readFileSync(path.join(process.cwd(), 'src/webview/panelView.ts'), 'utf-8');
const lines = src.split('\n');
const i18nSrc = fs.readFileSync(path.join(process.cwd(), 'src/webview/i18n.ts'), 'utf-8');

/** i18n.ts의 `key: { ko: '…', en: '…', ja: '…', zh: '…' }` 한 항목을 읽는다(dict는 export되지 않는다). */
function entry(key: string): Record<string, string> | undefined {
  const m = i18nSrc.match(new RegExp(`^\\s+${key}:\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  if (!m) return undefined;
  const out: Record<string, string> = {};
  for (const lm of m[1].matchAll(/(ko|en|ja|zh):\s*'([^']*)'/g)) out[lm[1]] = lm[2];
  return out;
}

const TOOLTIP_ONLY_KEYS = [
  'cache_band_msg_normal', 'cache_band_msg_drop', 'cache_band_note',
  'pace_above_baseline', 'pace_below_baseline',
  'pricing_unknown_note', 'cost_unknown_days',
];

describe('대시보드 서술형 문구 → 마커+툴팁 (v0.2.4)', () => {
  it.each(TOOLTIP_ONLY_KEYS)("'%s'는 panelView에서 툴팁 자리(tip:/title=)에서만 쓰인다", (key) => {
    const hits = lines.filter(l => l.includes(`'${key}'`) && !l.trim().startsWith('//'));
    for (const l of hits) expect(l, l.trim()).toMatch(/tip:|title=/);
  });

  it('본문 서술 컨테이너(.cache-band-msg · .pace-verdict · .panel-warn-note)를 더 이상 렌더하지 않는다', () => {
    expect(src).not.toContain('cache-band-msg');
    expect(src).not.toContain('pace-verdict');
    expect(src).not.toContain('panel-warn-note');
  });

  it('Codex 가변 버킷 안내 배너는 삭제됐다 (버킷 라벨이 이미 가변성을 보인다)', () => {
    expect(src).not.toContain('panel-codex-band-note');
    expect(src).not.toContain('codex_variable_bucket_note');
    expect(entry('codex_variable_bucket_note')).toBeUndefined();
  });

  it('페이스 판정은 짧은 마커 라벨을 4개 언어로 가진다', () => {
    for (const k of ['pace_marker_over', 'pace_marker_under']) {
      const e = entry(k)!;
      expect(e, k).toBeDefined();
      for (const lang of ['ko', 'en', 'ja', 'zh']) expect(e[lang]?.length, `${k}.${lang}`).toBeGreaterThan(0);
      expect(e.ko.length, `${k}.ko는 마커다 — 문장이 아니어야 한다`).toBeLessThanOrEqual(8);
    }
  });

  it('Codex 추가 패널 제목에 시안 서술("대신 새로 생기는 것")이 남아 있지 않다', () => {
    const e = entry('codex_extra_panel_title')!;
    expect(e.ko).not.toContain('대신');
    expect(e.en).not.toMatch(/in its place/i);
  });
});

/**
 * 인수검증 V2 보완 — 대시보드 Git ROI 카드는 retroView.ts가 그린다. 첫 조사가 panelView.ts만
 * 훑어 여기 본문 문장 2개(근사 귀속 안내 · user.email 강등 경고)를 놓쳤다.
 */
describe('Git ROI 카드(retroView) 서술형 문구 → 마커+툴팁 (v0.2.4)', () => {
  const retroSrc = fs.readFileSync(path.join(process.cwd(), 'src/webview/retroView.ts'), 'utf-8');
  const retroLines = retroSrc.split('\n');

  it.each(['retro_disclaimer', 'retro_scope_degraded'])("'%s'는 retroView 본문에 렌더되지 않는다(툴팁 자리만)", (key) => {
    const hits = retroLines.filter(l => l.includes(`'${key}'`) && !l.trim().startsWith('//'));
    for (const l of hits) expect(l, l.trim()).toMatch(/tip:|title=/);
  });

  it('근사 귀속 안내는 카드 헤더 ≈배지 툴팁에 남아 있다 (정보 소실 없음)', () => {
    expect(src).toMatch(/retro-approx-badge" title="\$\{t\('retro_disclaimer'\)\}"/);
  });

  it('user.email 강등은 경고 마커로 보인다', () => {
    expect(retroSrc).toContain('statusMarkerHtml');
    expect(retroSrc).toMatch(/tone:\s*'warn'/);
    expect(retroSrc).not.toContain('retro-scope-warn');
  });
});
