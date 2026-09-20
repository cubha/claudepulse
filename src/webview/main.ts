// Webview 진입점.
// data-mode={sidebar|panel} 속성으로 두 컨텍스트 분기.
// v0.1.54 ST5 — sidebarView.ts/panelView.ts/webviewShared.ts/webviewApi.ts로 분리.
// 이 파일은 mode 분기 dispatch만 소유한다.
import { formatErrorHtml } from './format';
import { initSidebar } from './sidebarView';
import { initPanel } from './panelView';

const mode = (document.body.dataset.mode ?? 'panel') as 'sidebar' | 'panel';
const root = document.getElementById('root');

try {
  if (mode === 'sidebar') {
    initSidebar();
  } else {
    initPanel();
  }
} catch (err) {
  const msg = formatErrorHtml(err);
  console.error('[AgentVitals] webview init failed:', err);
  if (root) {
    root.innerHTML = `<div style="padding:12px;color:var(--vscode-errorForeground);font-size:12px;font-family:monospace;">
      AgentVitals webview error:<br>${msg}<br><br>
      Open DevTools (Help → Toggle Developer Tools) for details.
    </div>`;
  }
}
