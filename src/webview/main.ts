// Webview 진입점.
// data-mode={sidebar|panel} 속성으로 두 컨텍스트 분기.
// 현재는 placeholder 컴포넌트만 렌더 — 실제 데이터 바인딩은 /sh-dev-loop에서 vscode-messenger로 연결.
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const mode = (document.body.dataset.mode ?? 'panel') as 'sidebar' | 'panel';
const root = document.getElementById('root');

if (root) {
  root.innerHTML = mode === 'sidebar' ? renderSidebarPlaceholder() : renderPanelPlaceholder();
}

function renderSidebarPlaceholder(): string {
  return `
    <div style="padding: 12px;">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--vscode-descriptionForeground);margin-bottom:8px;">
        Today
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${kpiCard('Tokens', '—', 'var(--c-sonnet)')}
        ${kpiCard('Session $', '—', 'var(--c-warn)')}
        ${kpiCard('Month $', '—', 'var(--c-opus)')}
        ${kpiCard('Sessions', '—', 'var(--c-haiku)')}
      </div>
      <div style="margin-top:14px;" class="card" data-section="window">
        <div style="padding:12px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
            <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--vscode-descriptionForeground);">5h Window</span>
            <span style="margin-left:auto;font-size:10px;color:var(--vscode-descriptionForeground);font-family:var(--ff-mono);">resets in</span>
          </div>
          <div style="display:flex;align-items:baseline;gap:6px;">
            <span class="mono" style="font-size:20px;font-weight:600;color:var(--vscode-foreground);">—%</span>
            <span style="font-size:11px;color:var(--vscode-descriptionForeground);">remaining</span>
            <span style="margin-left:auto;font-size:11px;font-family:var(--ff-mono);">--:--:--</span>
          </div>
          <div class="progress" style="margin-top:8px;"><div style="width:0%;"></div></div>
        </div>
      </div>
      <div style="margin-top:18px;font-size:10px;color:var(--vscode-descriptionForeground);text-align:center;font-family:var(--ff-mono);">
        ⚠️ placeholder — data layer pending (sh-dev-loop)
      </div>
    </div>
  `;
}

function renderPanelPlaceholder(): string {
  return `
    <div style="padding: 24px;">
      <h1 style="font-size:16px;margin:0 0 6px;font-weight:600;color:var(--vscode-foreground);">Claudepulse — Overview</h1>
      <p style="font-size:13px;color:var(--vscode-descriptionForeground);margin:0 0 20px;">
        UI scaffold ready. Data wiring is the next phase (<code class="mono">/sh-dev-loop</code>).
      </p>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        ${kpiBigCard('Tokens · Today', '—', 'in / out / cache · — / — / —', 'var(--c-sonnet)')}
        ${kpiBigCard('Month-to-date', '—', 'projected · —', 'var(--c-opus)')}
        ${kpiBigCard('Sessions · 30d', '—', 'avg duration · —', 'var(--c-haiku)')}
        ${kpiBigCard('5h Window', '—%', 'resets in --:--:--', 'var(--c-warn)')}
      </div>
      <div style="margin-top:20px;display:grid;grid-template-columns:1.6fr 1fr;gap:12px;">
        <div class="card" style="padding:16px;min-height:280px;">
          <h2 style="font-size:13px;margin:0 0 10px;font-weight:600;">Token usage · 30 days</h2>
          <div style="height:240px;display:flex;align-items:center;justify-content:center;color:var(--vscode-descriptionForeground);font-family:var(--ff-mono);font-size:12px;">
            (Chart.js stacked area — pending)
          </div>
        </div>
        <div class="card" style="padding:16px;min-height:280px;">
          <h2 style="font-size:13px;margin:0 0 10px;font-weight:600;">Projects · 30d</h2>
          <div style="height:240px;display:flex;align-items:center;justify-content:center;color:var(--vscode-descriptionForeground);font-family:var(--ff-mono);font-size:12px;">
            (Donut — pending)
          </div>
        </div>
      </div>
      <div style="margin-top:24px;font-size:11px;color:var(--vscode-descriptionForeground);font-family:var(--ff-mono);">
        Mode: ${mode} · Chart.js loaded (${Chart.version}) · CSS tokens active
      </div>
    </div>
  `;
}

function kpiCard(label: string, value: string, accent: string): string {
  return `
    <div class="card" style="padding:10px;">
      <div style="display:flex;align-items:center;gap:5px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${accent};display:inline-block;"></span>
        <span style="font-size:11px;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:.04em;">${label}</span>
      </div>
      <div class="mono" style="font-size:20px;margin-top:6px;font-weight:600;color:var(--vscode-foreground);">${value}</div>
    </div>
  `;
}

function kpiBigCard(label: string, value: string, sub: string, accent: string): string {
  return `
    <div class="card" style="padding:16px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${accent};display:inline-block;"></span>
        <span style="font-size:11px;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:.04em;">${label}</span>
      </div>
      <div class="mono" style="font-size:28px;margin-top:10px;font-weight:600;color:var(--vscode-foreground);letter-spacing:-.02em;">${value}</div>
      <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:4px;font-family:var(--ff-mono);">${sub}</div>
    </div>
  `;
}
