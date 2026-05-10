// Webview Panel "Sessions" tab — full table + right-side drilldown.

function SessionsToolbar({ q, sortBy }) {
  return (
    <div style={{
      height: 48, padding: '0 20px',
      display: 'flex', alignItems: 'center', gap: 10,
      borderBottom: '1px solid var(--vscode-panel-border)',
      flex: '0 0 auto',
    }}>
      <h1 style={{ fontSize: 16, margin: 0, fontWeight: 600 }}>Sessions</h1>
      <span className="chip"><Ico name="list-tree" size={11} /> 247 in 30d</span>
      <div style={{ flex: 1 }} />
      <div className="search" style={{ width: 220 }}>
        <Ico name="search" size={12} style={{ color: 'var(--vscode-descriptionForeground)' }} />
        <input placeholder="Search sessions, projects, ids…" value={q} readOnly />
      </div>
      <button className="btn-ghost"><Ico name="filter" size={12} />3 filters</button>
      <button className="btn-ghost"><Ico name="export" size={12} />Export CSV</button>
    </div>
  );
}

function FilterBar() {
  const filters = [
    { label: 'Range: 30 days', ico: 'calendar' },
    { label: 'Model: All', ico: 'symbol-class' },
    { label: 'Project: clausight, api-server', ico: 'folder' },
    { label: 'Cost ≥ $1.00', ico: 'credit-card' },
  ];
  return (
    <div style={{
      padding: '10px 20px',
      display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      borderBottom: '1px solid var(--vscode-panel-border)',
    }}>
      {filters.map((f, i) => (
        <span key={i} className="chip" style={{ height: 24, paddingRight: 6 }}>
          <Ico name={f.ico} size={11} style={{ color: 'var(--vscode-descriptionForeground)' }} />
          {f.label}
          <Ico name="close" size={10} style={{ marginLeft: 4, opacity: 0.6 }} />
        </span>
      ))}
      <button className="btn-ghost" style={{ height: 24, padding: '0 8px', fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>
        <Ico name="add" size={11} />Add filter
      </button>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>Showing 10 · sorted by start ↓</span>
    </div>
  );
}

function SessionsTable({ selectedId }) {
  return (
    <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
      <table className="tbl">
        <thead>
          <tr style={{ background: 'var(--vscode-editor-background)' }}>
            <th style={{ width: 32 }}></th>
            <th>Started <Ico name="arrow-down" size={10} style={{ marginLeft: 2, opacity: 0.6 }} /></th>
            <th>Duration</th>
            <th>Project</th>
            <th>Model</th>
            <th style={{ textAlign: 'right' }}>Msgs</th>
            <th style={{ textAlign: 'right' }}>Input</th>
            <th style={{ textAlign: 'right' }}>Output</th>
            <th style={{ textAlign: 'right' }}>Cache</th>
            <th style={{ textAlign: 'right' }}>Cost</th>
            <th style={{ width: 32 }}></th>
          </tr>
        </thead>
        <tbody>
          {SESSIONS.map((s) => (
            <tr key={s.id} className={s.id === selectedId ? 'selected' : ''}>
              <td>
                {s.status === 'live'
                  ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 0 2px rgba(34,197,94,0.18)', display: 'inline-block' }} />
                  : <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--vscode-divider)', display: 'inline-block' }} />}
              </td>
              <td className="mono" style={{ color: 'var(--vscode-descriptionForeground)' }}>{s.start}</td>
              <td className="mono">{s.dur}</td>
              <td>{s.project}</td>
              <td><span className={`badge ${s.model.startsWith('Opus') ? 'opus' : s.model.startsWith('Sonnet') ? 'sonnet' : 'haiku'}`}>{s.model}</span></td>
              <td className="mono" style={{ textAlign: 'right' }}>{s.msgs}</td>
              <td className="mono" style={{ textAlign: 'right', color: 'var(--vscode-descriptionForeground)' }}>{fmtTokens(s.input)}</td>
              <td className="mono" style={{ textAlign: 'right', color: 'var(--vscode-descriptionForeground)' }}>{fmtTokens(s.output)}</td>
              <td className="mono" style={{ textAlign: 'right', color: 'var(--vscode-descriptionForeground)' }}>{fmtTokens(s.cache)}</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtUsd(s.cost)}</td>
              <td><Ico name="chevron-right" size={11} style={{ color: 'var(--vscode-descriptionForeground)' }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Drilldown({ session }) {
  const s = session;
  const breakdown = [
    { label: 'Input',         tokens: s.input,  pct: s.input  / (s.input + s.output + s.cache), color: 'var(--c-sonnet)' },
    { label: 'Output',        tokens: s.output, pct: s.output / (s.input + s.output + s.cache), color: 'var(--c-opus)' },
    { label: 'Cache read',    tokens: s.cache,  pct: s.cache  / (s.input + s.output + s.cache), color: 'var(--c-haiku)' },
  ];

  return (
    <div style={{
      width: 380, flex: '0 0 380px',
      background: 'var(--vscode-card-background)',
      borderLeft: '1px solid var(--vscode-panel-border)',
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge ${s.model.startsWith('Opus') ? 'opus' : s.model.startsWith('Sonnet') ? 'sonnet' : 'haiku'}`}>{s.model}</span>
          <span style={{ marginLeft: 'auto' }}><Ico name="chrome-minimize" size={12} style={{ color: 'var(--vscode-descriptionForeground)' }} /></span>
          <Ico name="link-external" size={12} style={{ color: 'var(--vscode-descriptionForeground)' }} />
          <Ico name="close" size={13} style={{ color: 'var(--vscode-descriptionForeground)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Ico name="folder-active" size={13} style={{ color: 'var(--c-sonnet)' }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{s.project}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--vscode-descriptionForeground)', fontFamily: 'var(--ff-mono)' }}>{s.id}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', marginTop: 4, fontFamily: 'var(--ff-mono)' }}>
          {s.start} · {s.dur}
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Cost / tokens summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="card-flat" style={{ padding: 12 }}>
            <div className="kpi-label">Total cost</div>
            <div className="kpi-value mono" style={{ fontSize: 22, marginTop: 4 }}>{fmtUsd(s.cost)}</div>
            <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 2 }}>
              ${(s.cost / s.msgs).toFixed(3)} / msg
            </div>
          </div>
          <div className="card-flat" style={{ padding: 12 }}>
            <div className="kpi-label">Total tokens</div>
            <div className="kpi-value mono" style={{ fontSize: 22, marginTop: 4 }}>{fmtTokens(s.input + s.output + s.cache)}</div>
            <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 2 }}>
              {s.msgs} messages
            </div>
          </div>
        </div>

        {/* Breakdown bar */}
        <div>
          <div className="kpi-label" style={{ marginBottom: 8 }}>Token breakdown</div>
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--vscode-panel-border)' }}>
            {breakdown.map(b => (
              <div key={b.label} style={{ width: (b.pct * 100) + '%', background: b.color }} />
            ))}
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {breakdown.map(b => (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <Dot color={b.color} size={8} />
                <span style={{ flex: 1 }}>{b.label}</span>
                <span className="mono">{fmtTokens(b.tokens)}</span>
                <span className="mono" style={{ width: 44, textAlign: 'right', color: 'var(--vscode-descriptionForeground)' }}>{(b.pct * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="kpi-label">Activity</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--vscode-descriptionForeground)', fontFamily: 'var(--ff-mono)' }}>tokens / minute</span>
          </div>
          <div style={{ marginTop: 8, height: 60, position: 'relative' }} className="dot-grid">
            <Sparkline
              data={[2,4,3,7,12,8,9,15,14,11,18,22,19,17,20,16,13,12,9,7]}
              w={340} h={60}
              color="var(--c-sonnet)"
              fill
            />
          </div>
        </div>

        {/* Files touched */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="kpi-label">Files touched</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>14</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { name: 'src/extension.ts', edits: 23 },
              { name: 'src/views/sidebar.tsx', edits: 18 },
              { name: 'src/charts/area.tsx', edits: 11 },
              { name: 'package.json', edits: 4 },
            ].map(f => (
              <div key={f.name} className="row-strip" style={{ padding: '5px 8px' }}>
                <Ico name="file-code" size={12} style={{ color: 'var(--vscode-descriptionForeground)' }} />
                <span className="mono" style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)' }}>{f.edits} edits</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 8 }}>
          <button className="btn-primary" style={{ flex: 1 }}>
            <Ico name="link-external" size={12} />
            Open transcript
          </button>
          <button className="btn-ghost"><Ico name="copy" size={12} />Copy ID</button>
          <button className="btn-ghost"><Ico name="kebab-vertical" size={12} /></button>
        </div>
      </div>
    </div>
  );
}

function PanelSessions() {
  const selected = SESSIONS[0]; // live one
  return (
    <PanelChrome activeTab="sessions">
      <SessionsToolbar q="" />
      <FilterBar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <SessionsTable selectedId={selected.id} />
          {/* Footer: pagination */}
          <div style={{
            height: 32,
            padding: '0 20px',
            display: 'flex', alignItems: 'center', gap: 8,
            borderTop: '1px solid var(--vscode-panel-border)',
            fontSize: 11, color: 'var(--vscode-descriptionForeground)',
          }}>
            <span className="mono">10 of 247</span>
            <div style={{ flex: 1 }} />
            <button className="btn-ghost" style={{ height: 22, padding: '0 8px', fontSize: 11 }}><Ico name="chevron-left" size={11} />Prev</button>
            <span className="mono">1 / 25</span>
            <button className="btn-ghost" style={{ height: 22, padding: '0 8px', fontSize: 11 }}>Next<Ico name="chevron-right" size={11} /></button>
          </div>
        </div>
        <Drilldown session={selected} />
      </div>
    </PanelChrome>
  );
}

window.PanelSessions = PanelSessions;
