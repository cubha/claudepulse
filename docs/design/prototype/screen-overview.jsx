// Webview Panel "Overview" tab — full 1280x800 dark dashboard inside an
// editor tab strip so it reads as native VS Code chrome.

function PanelChrome({ activeTab = 'overview', children }) {
  return (
    <div className="theme-dark" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--vscode-editor-background)' }}>
      {/* Tab strip */}
      <div style={{
        height: 35,
        display: 'flex',
        background: '#181818',
        borderBottom: '1px solid var(--vscode-panel-border)',
        flex: '0 0 auto',
      }}>
        {[
          { id: 't1', label: 'extension.ts', ico: 'symbol-method', color: '#519ABA' },
          { id: 't2', label: 'package.json', ico: 'json', color: '#CBCB41' },
          { id: 'cl', label: 'Clausight', ico: 'pulse', color: '#3B82F6', active: true, dirty: true },
        ].map((t) => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 14px', height: 35,
            background: t.active ? 'var(--vscode-editor-background)' : 'transparent',
            borderRight: '1px solid var(--vscode-panel-border)',
            borderTop: t.active ? '1px solid var(--vscode-focusBorder)' : '1px solid transparent',
            color: t.active ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)',
            fontSize: 13,
            position: 'relative',
            cursor: 'pointer',
          }}>
            {t.id === 'cl'
              ? <Logomark size={13} color={t.color} />
              : <Ico name={t.ico} size={13} style={{ color: t.color }} />}
            <span>{t.label}</span>
            <Ico name="close" size={11} style={{ marginLeft: 6, opacity: t.active ? 0.8 : 0.4 }} />
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8, color: 'var(--vscode-descriptionForeground)' }}>
          <Ico name="split-horizontal" size={14} />
          <Ico name="ellipsis" size={14} />
        </div>
      </div>

      {/* Body: left tabs + content */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left tab nav */}
        <div style={{
          width: 168, padding: 10,
          borderRight: '1px solid var(--vscode-panel-border)',
          background: 'var(--vscode-sideBar-background)',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <div style={{ padding: '6px 10px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Logomark size={14} color="#3B82F6" />
            <span style={{ fontWeight: 600, fontSize: 13 }}>Clausight</span>
          </div>
          {[
            { id: 'overview', label: 'Overview', ico: 'dashboard' },
            { id: 'charts',   label: 'Charts',   ico: 'graph' },
            { id: 'heatmap',  label: 'Heatmap',  ico: 'flame' },
            { id: 'sessions', label: 'Sessions', ico: 'list-tree' },
            { id: 'settings', label: 'Settings', ico: 'settings-gear' },
          ].map(t => (
            <div key={t.id} className={`vtab ${activeTab === t.id ? 'active' : ''}`}>
              <Ico name={t.ico} size={14} />
              <span>{t.label}</span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          {/* Live status footer */}
          <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 0 2px rgba(34,197,94,0.18)' }} />
              <span>Tracking · Sonnet 4.5</span>
            </div>
            <div className="mono" style={{ fontSize: 10, opacity: 0.7 }}>~/.claude · 2.1k events</div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function OverviewToolbar() {
  return (
    <div style={{
      height: 48, padding: '0 20px',
      display: 'flex', alignItems: 'center', gap: 10,
      borderBottom: '1px solid var(--vscode-panel-border)',
      flex: '0 0 auto',
    }}>
      <h1 style={{ fontSize: 16, margin: 0, fontWeight: 600 }}>Overview</h1>
      <span className="chip" style={{ marginLeft: 6 }}>
        <Ico name="folder-active" size={11} style={{ color: 'var(--c-sonnet)' }} />
        clausight
      </span>
      <div style={{ flex: 1 }} />
      {/* Range picker */}
      <div style={{ display: 'flex', border: '1px solid var(--vscode-panel-border)', borderRadius: 6, overflow: 'hidden' }}>
        {['Today', '7d', '30d', '90d', 'MTD'].map((r, i) => (
          <button key={r} className="btn-ghost" style={{
            border: 'none', borderRadius: 0,
            background: r === '30d' ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
            color: r === '30d' ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)',
            padding: '6px 10px',
            borderLeft: i > 0 ? '1px solid var(--vscode-panel-border)' : 'none',
          }}>{r}</button>
        ))}
      </div>
      <button className="btn-ghost"><Ico name="filter" size={12} />All models</button>
      <button className="btn-ghost"><Ico name="export" size={12} />Export</button>
    </div>
  );
}

function KPI4() {
  const items = [
    { label: 'Tokens · Today', value: '124.3K', sub: 'in / out / cache · 39 / 8 / 77K', delta: TODAY.deltas.tokens, color: 'var(--c-sonnet)', ico: 'pulse', spark: [4,5,3,7,6,9,11,8,10,12,9,14,13,15] },
    { label: 'Month-to-date', value: '$42.31', sub: 'projected · $128.40', delta: TODAY.deltas.month, color: 'var(--c-opus)', ico: 'credit-card', spark: [5,8,7,9,12,11,14,16,15,18,21,19,24,26] },
    { label: 'Sessions · 30d', value: '47', sub: 'avg duration · 1h 12m', delta: 8.4, color: 'var(--c-haiku)', ico: 'comment-discussion', spark: [2,3,2,4,5,3,4,6,5,7,6,8,7,9] },
    { label: '5h Window', value: '78%', sub: 'resets in 02:14:37', delta: -22.0, color: 'var(--c-warn)', ico: 'clock', isProgress: true, pct: 78 },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '16px 20px 0' }}>
      {items.map((k, i) => {
        const cls = k.delta > 0 ? 'up' : k.delta < 0 ? 'down' : 'flat';
        const arrow = k.delta > 0 ? '▲' : k.delta < 0 ? '▼' : '·';
        return (
          <div key={i} className="card" style={{ padding: 16, position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ico name={k.ico} size={12} style={{ color: k.color }} />
              <span className="kpi-label">{k.label}</span>
              <span className={`kpi-delta ${cls}`} style={{ marginLeft: 'auto' }}>
                <span style={{ fontSize: 8 }}>{arrow}</span>
                {Math.abs(k.delta).toFixed(1)}%
              </span>
            </div>
            <div className="kpi-value mono" style={{ fontSize: 28, marginTop: 10, color: 'var(--vscode-foreground)' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 4, fontFamily: 'var(--ff-mono)' }}>{k.sub}</div>
            {k.isProgress
              ? <div className="progress" style={{ marginTop: 10 }}><div style={{ width: k.pct + '%' }} /></div>
              : <div style={{ marginTop: 10 }}><Sparkline data={k.spark} w={220} h={28} color={k.color} fill /></div>}
          </div>
        );
      })}
    </div>
  );
}

function TrendCard() {
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 13, margin: 0, fontWeight: 600 }}>Token usage · 30 days</h2>
        <span className="kpi-label">stacked by model</span>
        <div style={{ flex: 1 }} />
        {[
          { label: 'Opus', color: 'var(--c-opus)' },
          { label: 'Sonnet', color: 'var(--c-sonnet)' },
          { label: 'Haiku', color: 'var(--c-haiku)' },
        ].map(s => (
          <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>
            <Dot color={s.color} size={7} />{s.label}
          </span>
        ))}
      </div>
      <div style={{ flex: 1, marginTop: 10, position: 'relative' }}>
        <AreaTrend w={720} h={220} hover={22} />
        {/* Hover tooltip card */}
        <div className="tooltip" style={{ position: 'absolute', left: '70%', top: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)', marginBottom: 6, fontFamily: 'var(--ff-mono)' }}>May 2 · Tue</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '3px 14px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Dot color="var(--c-opus)" size={7}/>Opus</span>
            <span className="mono">42.1K</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Dot color="var(--c-sonnet)" size={7}/>Sonnet</span>
            <span className="mono">98.4K</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Dot color="var(--c-haiku)" size={7}/>Haiku</span>
            <span className="mono">21.7K</span>
            <span style={{ borderTop: '1px solid var(--vscode-divider)', gridColumn: 'span 2', paddingTop: 4, marginTop: 2 }}></span>
            <span style={{ fontWeight: 600 }}>Total</span>
            <span className="mono" style={{ fontWeight: 600 }}>162.2K · $4.87</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DonutCard() {
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 13, margin: 0, fontWeight: 600 }}>Projects · 30d</h2>
        <span className="kpi-label">share of tokens</span>
        <div style={{ flex: 1 }} />
        <Ico name="ellipsis" size={12} style={{ color: 'var(--vscode-descriptionForeground)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 10, position: 'relative' }}>
        <Donut size={170} thickness={20} />
        <div style={{ position: 'absolute', textAlign: 'center', pointerEvents: 'none' }}>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>2.4M</div>
          <div style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>tokens · 30d</div>
        </div>
      </div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {PROJECT_DIST.map((p, i) => (
          <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <Dot color={p.color} size={8} />
            <span style={{ flex: 1, color: 'var(--vscode-foreground)' }}>{p.name}</span>
            <span className="mono" style={{ color: 'var(--vscode-descriptionForeground)' }}>{p.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatmapCard() {
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 13, margin: 0, fontWeight: 600 }}>Activity · 12 weeks</h2>
        <span className="kpi-label">cell = day</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>67 active days</span>
      </div>
      <div style={{ marginTop: 14, paddingLeft: 4 }}>
        <Heatmap />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>
        <span>Less</span>
        {[0,1,2,3,4].map(v => (
          <div key={v} className="heat-cell" style={{ background: `var(--heat-${v})` }} />
        ))}
        <span>More</span>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10 }}>peak · May 7 · 312K</span>
      </div>
    </div>
  );
}

function MiniSessionsCard() {
  const rows = SESSIONS.slice(0, 6);
  return (
    <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 10px' }}>
        <h2 style={{ fontSize: 13, margin: 0, fontWeight: 600 }}>Recent sessions</h2>
        <div style={{ flex: 1 }} />
        <a style={{ fontSize: 11, color: 'var(--vscode-textLink-foreground)', textDecoration: 'none', cursor: 'pointer' }}>View all →</a>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Project</th>
              <th>Model</th>
              <th style={{ textAlign: 'right' }}>Tokens</th>
              <th style={{ textAlign: 'right' }}>Cost</th>
              <th style={{ textAlign: 'right' }}>Started</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {s.status === 'live' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 0 2px rgba(34,197,94,0.18)' }} />}
                    <span>{s.project}</span>
                  </div>
                </td>
                <td>
                  <span className={`badge ${s.model.startsWith('Opus') ? 'opus' : s.model.startsWith('Sonnet') ? 'sonnet' : 'haiku'}`}>
                    {s.model.split(' ')[0]}
                  </span>
                </td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmtTokens(s.input + s.output)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmtUsd(s.cost)}</td>
                <td className="mono" style={{ textAlign: 'right', color: 'var(--vscode-descriptionForeground)' }}>{s.start.replace('Today, ', '').replace('Yesterday, ', 'y · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PanelOverview() {
  return (
    <PanelChrome activeTab="overview">
      <OverviewToolbar />
      <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
        <KPI4 />
        {/* Two-up: trend (left) + donut (right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, padding: '12px 20px 0' }}>
          <TrendCard />
          <DonutCard />
        </div>
        {/* Heatmap + mini sessions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 12, padding: '12px 20px 20px' }}>
          <HeatmapCard />
          <MiniSessionsCard />
        </div>
      </div>
    </PanelChrome>
  );
}

window.PanelOverview = PanelOverview;
window.PanelChrome = PanelChrome;
