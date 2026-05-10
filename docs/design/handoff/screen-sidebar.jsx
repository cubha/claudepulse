// Sidebar Webview View — used in both dark and light themes via wrapper class.
function Sidebar({ theme = 'dark' }) {
  const ringPct = TODAY.windowPctLeft;
  return (
    <div className={`theme-${theme}`} style={{
      width: '100%', height: '100%',
      background: 'var(--vscode-sideBar-background)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Sidebar header (matches VS Code view container header) */}
      <div style={{
        height: 35,
        padding: '0 14px',
        display: 'flex', alignItems: 'center',
        textTransform: 'uppercase',
        fontSize: 11, letterSpacing: '0.06em',
        color: 'var(--vscode-foreground)',
        fontWeight: 600,
        borderBottom: '1px solid var(--vscode-panel-border)',
      }}>
        <span>Clausight</span>
        <div style={{ flex: 1 }} />
        <Ico name="refresh" size={13} style={{ color: 'var(--vscode-descriptionForeground)', marginRight: 8 }} />
        <Ico name="ellipsis" size={13} style={{ color: 'var(--vscode-descriptionForeground)' }} />
      </div>

      {/* Section: Today */}
      <div style={{ padding: '12px 12px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Ico name="chevron-down" size={11} style={{ color: 'var(--vscode-descriptionForeground)' }} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--vscode-foreground)' }}>Today</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--vscode-descriptionForeground)', fontFamily: 'var(--ff-mono)' }}>May 10</span>
      </div>

      {/* KPI 2x2 */}
      <div style={{ padding: '0 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { label: 'Tokens', value: '124.3K', delta: TODAY.deltas.tokens, accent: 'var(--c-sonnet)', ico: 'pulse' },
          { label: 'Session $', value: '$0.87', delta: TODAY.deltas.cost, accent: 'var(--c-warn)', ico: 'credit-card' },
          { label: 'Month $', value: '$42.31', delta: TODAY.deltas.month, accent: 'var(--c-opus)', ico: 'calendar' },
          { label: 'Sessions', value: '3', delta: TODAY.deltas.sessions, accent: 'var(--c-haiku)', ico: 'comment-discussion' },
        ].map((k, i) => {
          const d = k.delta;
          const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
          const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '·';
          return (
            <div key={i} className="card" style={{ padding: 10, position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Ico name={k.ico} size={11} style={{ color: k.accent }} />
                <span className="kpi-label">{k.label}</span>
              </div>
              <div className="kpi-value mono" style={{ fontSize: 20, marginTop: 6, color: 'var(--vscode-foreground)' }}>{k.value}</div>
              <div className={`kpi-delta ${cls}`} style={{ marginTop: 2 }}>
                <span style={{ fontSize: 8 }}>{arrow}</span>
                <span>{d === 0 ? '—' : Math.abs(d).toFixed(1) + '%'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5h billing window */}
      <div style={{ padding: '14px 12px 8px' }}>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ico name="clock" size={11} style={{ color: 'var(--c-sonnet)' }} />
            <span className="kpi-label">5h Window</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--vscode-descriptionForeground)', fontFamily: 'var(--ff-mono)' }}>resets in</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="mono" style={{ fontSize: 20, fontWeight: 600, color: 'var(--vscode-foreground)' }}>{ringPct}%</span>
            <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>remaining</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--vscode-foreground)' }}>{TODAY.windowReset}</span>
          </div>
          <div className="progress" style={{ marginTop: 8 }}>
            <div style={{ width: ringPct + '%' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--vscode-descriptionForeground)' }}>
            <span>11:48 AM</span>
            <span>4:48 PM</span>
          </div>
        </div>
      </div>

      {/* Section: Top projects */}
      <div style={{ padding: '6px 12px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Ico name="chevron-down" size={11} style={{ color: 'var(--vscode-descriptionForeground)' }} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--vscode-foreground)' }}>Top Projects</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--vscode-descriptionForeground)' }}>30d</span>
      </div>

      <div style={{ padding: '2px 8px', flex: 1, overflow: 'hidden' }}>
        {TOP_PROJECTS.slice(0, 3).map((p, i) => {
          const colors = ['var(--c-sonnet)', 'var(--c-opus)', 'var(--c-haiku)'];
          const here = p.name === 'clausight';
          return (
            <div key={p.name} className="row-strip" style={{ background: here ? 'var(--vscode-list-hoverBackground)' : undefined }}>
              <Dot color={colors[i]} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--vscode-foreground)' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  {here && <Ico name="folder-active" size={10} style={{ color: 'var(--c-sonnet)' }} />}
                </div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)', marginTop: 1 }}>
                  {fmtTokens(p.tokens)} · {fmtUsd(p.cost)}
                </div>
              </div>
              <Sparkline data={p.spark} w={48} h={16} color={colors[i]} fill />
            </div>
          );
        })}
      </div>

      {/* Footer CTA */}
      <div style={{
        padding: '8px 10px 10px',
        borderTop: '1px solid var(--vscode-panel-border)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <button className="btn-ghost" style={{ flex: 1, justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Ico name="dashboard" size={12} />
            Open full dashboard
          </span>
          <Ico name="arrow-up-right" size={11} style={{ opacity: 0.7 }} />
        </button>
        <button className="btn-ghost" style={{ padding: '6px 8px' }} aria-label="Settings">
          <Ico name="gear" size={12} />
        </button>
      </div>
    </div>
  );
}

window.Sidebar = Sidebar;
