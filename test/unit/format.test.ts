import { describe, it, expect } from 'vitest';
import { escapeHtml, fmtCost, formatErrorHtml } from '../../src/webview/format';

describe('escapeHtml', () => {
  it('escapes all five HTML special characters', () => {
    expect(escapeHtml(`<script>alert('x')&"y"</script>`)).toBe(
      '&lt;script&gt;alert(&#39;x&#39;)&amp;&quot;y&quot;&lt;/script&gt;'
    );
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123');
  });
});

describe('fmtCost', () => {
  it('shows <$0.01 for sub-cent amounts', () => {
    expect(fmtCost(0.004)).toBe('<$0.01');
  });

  it('formats to two decimal places otherwise', () => {
    expect(fmtCost(1.5)).toBe('$1.50');
  });
});

describe('formatErrorHtml', () => {
  it('escapes an Error instance message', () => {
    expect(formatErrorHtml(new Error(`<img src=x onerror=alert(1)>`))).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    );
  });

  it('stringifies and escapes a non-Error value', () => {
    expect(formatErrorHtml('<b>boom</b>')).toBe('&lt;b&gt;boom&lt;/b&gt;');
  });

  it('stringifies a non-Error object without a message property', () => {
    expect(formatErrorHtml({ code: 42 })).toBe(escapeHtml(String({ code: 42 })));
  });
});
