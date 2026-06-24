/**
 * webview 순수 포맷 유틸 — DOM 비의존(node 단위테스트 가능).
 * main.ts와 retroView.ts가 공유한다(v0.1.39 추출).
 */

/** HTML 특수문자 이스케이프(XSS 방지 — innerHTML 삽입 전 필수). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** USD 비용 표시. <$0.01은 절삭 표기. */
export function fmtCost(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}
