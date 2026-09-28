import { describe, it, expect } from 'vitest';
import { statusMarkerHtml } from '../../src/webview/statusMarker';

/**
 * v0.2.4 — 대시보드 서술형 문구를 "상태 마커(항상 보임) + 호버 툴팁(상세)"으로 바꾸는 공용 헬퍼.
 * 서술 문장은 화면에서 빠지지만 신호는 마커로 남아야 하고, 상세는 툴팁으로만 간다.
 */
describe('statusMarkerHtml (v0.2.4)', () => {
  it('라벨을 본문에, 상세 문장은 title 툴팁에 둔다', () => {
    const html = statusMarkerHtml({ label: '정상', tip: '프롬프트 재사용이 잘 되고 있다', tone: 'ok' });
    expect(html).toContain('>정상</span>');
    expect(html).toContain('title="프롬프트 재사용이 잘 되고 있다"');
    expect(html).not.toMatch(/>[^<]*프롬프트 재사용[^<]*</);
  });

  it('tone은 클래스로 표현한다 (색은 CSS 토큰이 담당)', () => {
    expect(statusMarkerHtml({ label: 'a', tip: 'b', tone: 'warn' })).toContain('class="status-marker warn"');
    expect(statusMarkerHtml({ label: 'a', tip: 'b', tone: 'danger' })).toContain('class="status-marker danger"');
  });

  it('키보드·스크린리더로도 상세에 닿는다 (tabindex·aria-label)', () => {
    const html = statusMarkerHtml({ label: '과속', tip: '리셋 전에 막힌다', tone: 'warn' });
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="과속: 리셋 전에 막힌다"');
  });

  it('라벨·툴팁 모두 이스케이프한다 (모델명 등 외부 문자열이 툴팁에 들어간다)', () => {
    const html = statusMarkerHtml({ label: '<b>', tip: '"x" & <y>', tone: 'muted' });
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&quot;x&quot; &amp; &lt;y&gt;');
  });
});
