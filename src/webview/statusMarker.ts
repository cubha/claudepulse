// 상태 마커(v0.2.4) — 대시보드의 서술형 문구를 대체한다. 신호(라벨)는 항상 보이고, 왜 그런지(문장)는
// 호버 툴팁으로만 간다. 본문에 판정 문장을 늘어놓던 방식은 카드마다 읽을거리를 더해 화면을 무겁게 했다.
// title만으로는 키보드 사용자가 상세에 닿지 못하므로 tabindex·aria-label을 함께 단다.
// tip은 `\n`으로 여러 줄을 쓸 수 있다(네이티브 title 툴팁이 줄바꿈을 그대로 보인다).
import { escapeHtml } from './format';

export type MarkerTone = 'ok' | 'warn' | 'danger' | 'muted';

export function statusMarkerHtml(o: { label: string; tip: string; tone: MarkerTone }): string {
  const label = escapeHtml(o.label);
  const tip = escapeHtml(o.tip);
  return `<span class="status-marker ${o.tone}" tabindex="0" title="${tip}" aria-label="${label}: ${tip}">${label}</span>`;
}
