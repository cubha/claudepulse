import { describe, it, expect } from 'vitest';
import { themeClassFor, COLOR_THEME_KIND, THEME_CLASSES } from '../../src/webview/themeClass';

/**
 * v0.2.3 R5 — 라이트 테마 연동.
 *
 * styles.css에는 `.theme-light` 51개 토큰이 v0.1.53부터 선언돼 있었는데, 그 클래스를 body에
 * **붙이는 경로가 한 곳도 없었다** — DashboardPanel.ts와 SidebarViewProvider.ts가 HTML shell에
 * `class="theme-dark"`를 하드코딩했고 소스 전체에 `activeColorTheme` 참조가 0건이었다.
 * 게이트(D-3 다크/라이트 페어)는 선언만 보므로 내내 초록이었다 — 배선 없는 규칙의 전형.
 *
 * 이 파일은 매핑만 잠근다. vscode를 import하지 않으려고 kind를 수치로 받는다.
 */
describe('themeClassFor (v0.2.3 R5)', () => {
  it('Light → theme-light', () => {
    expect(themeClassFor(COLOR_THEME_KIND.Light)).toBe('theme-light');
  });

  it('Dark → theme-dark', () => {
    expect(themeClassFor(COLOR_THEME_KIND.Dark)).toBe('theme-dark');
  });

  // ColorThemeKind는 4종이다. 2종만 분기하면 고대비 테마 사용자가 조용히 잘못된 팔레트를 받는다
  // (HighContrast는 어두운 고대비, HighContrastLight는 밝은 고대비 — 이름만 보고 뒤집기 쉽다).
  it('HighContrast(어두운 고대비) → theme-dark', () => {
    expect(themeClassFor(COLOR_THEME_KIND.HighContrast)).toBe('theme-dark');
  });

  it('HighContrastLight(밝은 고대비) → theme-light', () => {
    expect(themeClassFor(COLOR_THEME_KIND.HighContrastLight)).toBe('theme-light');
  });

  it('알 수 없는 kind는 theme-dark로 폴백한다 (VS Code가 5번째 종류를 추가해도 빈 클래스가 되지 않는다)', () => {
    expect(themeClassFor(99)).toBe('theme-dark');
  });

  it('THEME_CLASSES는 부착/제거 대상 전부를 담는다 (한쪽만 지우면 두 클래스가 공존한다)', () => {
    expect([...THEME_CLASSES].sort()).toEqual(['theme-dark', 'theme-light']);
  });
});
