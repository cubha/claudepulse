// Webview 진입점.
// TODO:
//  - Chart.js import + 트리쉐이킹된 컴포넌트만
//  - vscode-messenger-webview 연결
//  - PushSnapshot 수신 → 렌더링
//  - Sidebar / Panel 모드 분기 (?mode 쿼리 또는 별도 entry)
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const root = document.getElementById('root');
if (root) {
  root.innerHTML = `
    <div style="padding: 16px; color: var(--vscode-foreground);">
      <h2 style="margin:0 0 8px;font-size:14px;">Claudepulse</h2>
      <p style="margin:0;font-size:12px;color: var(--vscode-descriptionForeground);">
        Webview 진입점 — 다음 단계 (sh-dev-loop)에서 Sidebar / Panel 컴포넌트를 연결합니다.
      </p>
    </div>
  `;
}
