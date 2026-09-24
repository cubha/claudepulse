// VS Code 테마 종류 → 웹뷰 body 클래스 매핑 (v0.2.3 R5).
//
// styles.css는 v0.1.53부터 `.theme-light` 51개 토큰을 선언해 두고 있었지만, 그 클래스를
// body에 **붙이는 경로가 한 곳도 없었다**. DashboardPanel.ts / SidebarViewProvider.ts가
// HTML shell에 `class="theme-dark"`를 하드코딩했고, 소스 전체에 `activeColorTheme` 참조는
// 0건이었다. 게이트(verify.sh D-3 다크/라이트 페어)는 **선언만** 보므로 내내 초록이었다 —
// 규칙은 있는데 배선이 없으면 게이트가 그 사실을 못 본다(feedback_gate_wiring_signal).
//
// 이 모듈이 vscode를 import하지 않는 이유: 웹뷰 번들과 확장 번들이 둘 다 이 매핑을 쓴다.
// 확장 쪽에서 `vscode.ColorThemeKind`를 그대로 넘기면 되고(수치 enum), 테스트는 vscode 런타임
// 없이 돈다(이 repo에는 vscode 모듈 목이 없다).

/** `vscode.ColorThemeKind`와 같은 수치. 확장 쪽에서 enum을 그대로 넘긴다. */
export const COLOR_THEME_KIND = { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 } as const;

export type ThemeClass = 'theme-dark' | 'theme-light';

/** 부착/제거 대상 전부. 한쪽만 지우면 두 클래스가 공존해 나중 선언이 이긴다. */
export const THEME_CLASSES: readonly ThemeClass[] = ['theme-dark', 'theme-light'];

/**
 * 4종을 전부 분기한다.
 *
 * `HighContrast`는 **어두운** 고대비, `HighContrastLight`는 밝은 고대비다 — 이름만 보고
 * "HighContrast니까 밝은 거겠지"로 뒤집기 쉬운 지점이라 명시해 둔다. 둘 중 하나라도
 * 빠뜨리면 고대비 테마 사용자가 조용히 반대 팔레트를 받는다(배경만 검고 글자도 검은 식).
 *
 * 미지의 kind는 다크로 폴백한다 — VS Code가 5번째 종류를 추가해도 빈 클래스(토큰 전멸)가
 * 되지 않게. 다크가 기본값인 것은 v0.2.2까지의 하드코딩 값과 같다(무행위변경 기본선).
 */
export function themeClassFor(kind: number): ThemeClass {
  if (kind === COLOR_THEME_KIND.Light || kind === COLOR_THEME_KIND.HighContrastLight) return 'theme-light';
  return 'theme-dark';
}
