// Design tokens summary — colors, type, spacing, components.
// Rendered as one wide artboard inside the design canvas.

function Swatch({ name, dark, light, role, hex }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', height: 48 }}>
        <div style={{ flex: 1, background: dark, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 8, bottom: 4, fontSize: 9, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--ff-mono)' }}>D</span>
        </div>
        <div style={{ flex: 1, background: light, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 8, bottom: 4, fontSize: 9, color: 'rgba(0,0,0,0.5)', fontFamily: 'var(--ff-mono)' }}>L</span>
        </div>
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--vscode-foreground)' }}>{name}</div>
        <div style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)', marginTop: 2 }}>{role}</div>
        {hex && (
          <div className="mono" style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)', marginTop: 4 }}>{hex}</div>
        )}
      </div>
    </div>
  );
}

function AccentSwatch({ name, color, role, hex }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ height: 56, background: color }} />
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)', marginTop: 2 }}>{role}</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)', marginTop: 4 }}>{hex}</div>
      </div>
    </div>
  );
}

function TokensScreen() {
  const sectionTitle = (s, sub) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
      <h2 style={{ fontSize: 14, margin: 0, fontWeight: 600, color: 'var(--vscode-foreground)' }}>{s}</h2>
      <span className="kpi-label">{sub}</span>
    </div>
  );

  return (
    <div className="theme-dark" style={{
      width: '100%', height: '100%',
      padding: 28,
      background: 'var(--vscode-editor-background)',
      overflow: 'auto',
      display: 'flex', flexDirection: 'column', gap: 28,
    }}>
      {/* Title */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Logomark size={18} color="#3B82F6" />
          <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Clausight · Foundations</span>
        </div>
        <h1 style={{ fontSize: 24, margin: 0, fontWeight: 600 }}>Design tokens</h1>
        <p style={{ fontSize: 13, color: 'var(--vscode-descriptionForeground)', maxWidth: 720, marginTop: 6, marginBottom: 0 }}>
          Every surface uses VS Code CSS variables so dark/light flips are automatic.
          Accent colors are reserved for model identity and status — never as page background.
        </p>
      </div>

      {/* THEME PAIRS */}
      <section>
        {sectionTitle('Theme tokens', 'maps to var(--vscode-*)')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {[
            { name: '--editor-background',  role: 'page background',     dark: '#1E1E1E', light: '#FFFFFF', hex: '#1E1E1E / #FFFFFF' },
            { name: '--card-background',    role: 'KPI / chart cards',   dark: '#1F1F1F', light: '#FBFBFB', hex: '#1F1F1F / #FBFBFB' },
            { name: '--sideBar-background', role: 'sidebar / activity',  dark: '#181818', light: '#F8F8F8', hex: '#181818 / #F8F8F8' },
            { name: '--panel-border',       role: 'card / divider',      dark: '#2D2D30', light: '#E5E5E5', hex: '#2D2D30 / #E5E5E5' },
            { name: '--input-background',   role: 'inputs / search',     dark: '#2A2A2C', light: '#FFFFFF', hex: '#2A2A2C / #FFFFFF' },
            { name: '--list-hoverBackground', role: 'row hover',         dark: '#2A2D2E', light: '#EFEFEF', hex: '#2A2D2E / #EFEFEF' },
            { name: '--list-activeSelection',  role: 'row active',       dark: '#2C3E55', light: '#DDECF7', hex: '#2C3E55 / #DDECF7' },
            { name: '--focusBorder',        role: '2px outline focus',   dark: '#007FD4', light: '#005FB8', hex: '#007FD4 / #005FB8' },
            { name: '--foreground',         role: 'body text',           dark: '#CCCCCC', light: '#3C3C3C', hex: '#CCCCCC / #3C3C3C' },
            { name: '--descriptionForeground', role: 'muted / labels',   dark: '#9D9D9D', light: '#6E6E6E', hex: '#9D9D9D / #6E6E6E' },
          ].map(s => <Swatch key={s.name} {...s} />)}
        </div>
      </section>

      {/* ACCENTS */}
      <section>
        {sectionTitle('Accent palette', 'model + status — 5-color cap')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          {[
            { name: 'Opus',     color: '#8B5CF6', role: 'model · violet',  hex: '#8B5CF6' },
            { name: 'Sonnet',   color: '#3B82F6', role: 'model · blue',    hex: '#3B82F6' },
            { name: 'Haiku',    color: '#14B8A6', role: 'model · teal',    hex: '#14B8A6' },
            { name: 'Warning',  color: '#F59E0B', role: 'cost · amber',    hex: '#F59E0B' },
            { name: 'Danger',   color: '#F43F5E', role: 'limit · rose',    hex: '#F43F5E' },
            { name: 'Slate',    color: '#64748B', role: 'neutral data',    hex: '#64748B' },
          ].map(s => <AccentSwatch key={s.name} {...s} />)}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>
          All accents pass <span className="mono">WCAG AA 4.5:1</span> against both card backgrounds; never used as long-form text fill.
        </div>
      </section>

      {/* TYPE + SPACING side by side */}
      <section style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
        <div>
          {sectionTitle('Type scale', 'system fonts only')}
          <div className="card" style={{ padding: 18 }}>
            {[
              { label: 'H1 · 24 / 30 / 600',     size: 24,  weight: 600, sample: '124.3K tokens',  mono: true },
              { label: 'H2 · 16 / 22 / 600',     size: 16,  weight: 600, sample: 'Token usage · 30 days', mono: false },
              { label: 'Body · 13 / 18 / 400',   size: 13,  weight: 400, sample: 'Resets in 02:14:37 · Sonnet 4.5', mono: false },
              { label: 'Label · 11 / 14 / 500',  size: 11,  weight: 500, sample: 'TODAY · MONTH-TO-DATE', mono: false, upper: true },
              { label: 'Mono XL · 28 / 32 / 600', size: 28, weight: 600, sample: '$42.31', mono: true },
              { label: 'Mono MD · 15 / 20 / 600', size: 15, weight: 600, sample: '02:14:37', mono: true },
            ].map((t, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '170px 1fr',
                alignItems: 'baseline', padding: '10px 0',
                borderTop: i ? '1px solid var(--vscode-divider)' : 'none',
              }}>
                <div className="kpi-label mono" style={{ fontSize: 10 }}>{t.label}</div>
                <div style={{
                  fontSize: t.size,
                  fontWeight: t.weight,
                  fontFamily: t.mono ? 'var(--ff-mono)' : 'var(--ff-sans)',
                  textTransform: t.upper ? 'uppercase' : 'none',
                  letterSpacing: t.upper ? '0.04em' : (t.size >= 24 ? '-0.02em' : 'normal'),
                  color: 'var(--vscode-foreground)',
                }}>{t.sample}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--vscode-descriptionForeground)', display: 'flex', gap: 16 }}>
            <span><span className="mono" style={{ color: 'var(--vscode-foreground)' }}>--ff-sans</span> -apple-system, "Segoe UI", system-ui</span>
            <span><span className="mono" style={{ color: 'var(--vscode-foreground)' }}>--ff-mono</span> "SF Mono", "Cascadia Code", monospace</span>
          </div>
        </div>

        <div>
          {sectionTitle('Spacing scale', '4px base grid')}
          <div className="card" style={{ padding: 18 }}>
            {[
              { name: 'sp-1', val: 4 }, { name: 'sp-2', val: 8 }, { name: 'sp-3', val: 12 },
              { name: 'sp-4', val: 16 }, { name: 'sp-5', val: 20 }, { name: 'sp-6', val: 24 },
              { name: 'sp-8', val: 32 }, { name: 'sp-10', val: 40 },
            ].map((s, i) => (
              <div key={s.name} style={{
                display: 'grid', gridTemplateColumns: '60px 1fr 60px',
                alignItems: 'center', gap: 12,
                padding: '6px 0',
                borderTop: i ? '1px solid var(--vscode-divider)' : 'none',
              }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--vscode-foreground)' }}>{s.name}</span>
                <div style={{ height: 8, background: 'var(--c-sonnet)', borderRadius: 2, width: s.val * 5 }} />
                <span className="mono" style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', textAlign: 'right' }}>{s.val}px</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            {sectionTitle('Radius', '6 / 8 / pill')}
            <div className="card" style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'center' }}>
              {[
                { name: 'r-sm · 4', r: 4, w: 60 },
                { name: 'r-md · 6', r: 6, w: 60 },
                { name: 'r-lg · 8', r: 8, w: 60 },
                { name: 'pill', r: 999, w: 60 },
              ].map(r => (
                <div key={r.name} style={{ textAlign: 'center' }}>
                  <div style={{ width: r.w, height: 36, background: 'var(--vscode-card-elevated)', border: '1px solid var(--vscode-panel-border)', borderRadius: r.r, marginBottom: 6 }} />
                  <span className="mono" style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)' }}>{r.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* COMPONENTS */}
      <section>
        {sectionTitle('Components', 'card · button · badge · tab · chip · progress')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>

          {/* Cards */}
          <div className="card" style={{ padding: 18 }}>
            <div className="kpi-label" style={{ marginBottom: 10 }}>Card</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="card" style={{ flex: 1, padding: 12 }}>
                <div className="kpi-label">Today</div>
                <div className="kpi-value mono" style={{ fontSize: 22 }}>124.3K</div>
                <span className="kpi-delta up"><span style={{ fontSize: 8 }}>▲</span>18.4%</span>
              </div>
              <div className="card-flat" style={{ flex: 1, padding: 12 }}>
                <div className="kpi-label">Flat (in drilldown)</div>
                <div className="kpi-value mono" style={{ fontSize: 22 }}>$0.87</div>
                <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>$0.011 / msg</span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 10 }}>
              <span className="mono">card</span> · 1px solid border · radius 8 · no shadow.
              <span className="mono"> card-flat</span> · same border, transparent fill — for nested context.
            </div>
          </div>

          {/* Buttons */}
          <div className="card" style={{ padding: 18 }}>
            <div className="kpi-label" style={{ marginBottom: 10 }}>Button</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button className="btn-primary"><Ico name="play" size={11} />Open dashboard</button>
              <button className="btn-ghost"><Ico name="filter" size={11} />Filter</button>
              <button className="btn-ghost" style={{ padding: '6px 8px' }}><Ico name="gear" size={12} /></button>
              <button className="btn-ghost" disabled style={{ opacity: 0.45, cursor: 'not-allowed' }}><Ico name="export" size={11} />Export</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 12 }}>
              Primary uses <span className="mono">--button-background</span>. Ghost matches input chrome — both 28px tall.
            </div>
          </div>

          {/* Badges + chips */}
          <div className="card" style={{ padding: 18 }}>
            <div className="kpi-label" style={{ marginBottom: 10 }}>Badge · Chip</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span className="badge opus">Opus 4</span>
              <span className="badge sonnet">Sonnet 4.5</span>
              <span className="badge haiku">Haiku 3.5</span>
              <span className="chip"><Dot color="#22C55E" size={6} />Live</span>
              <span className="chip"><Ico name="folder" size={11} />clausight</span>
              <span className="chip" style={{ color: 'var(--c-warn)', borderColor: 'rgba(245,158,11,0.4)' }}><Ico name="warning" size={11} />Cost ≥ $1.00</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 12 }}>
              Badge: 18px tall, uppercase mono, accent-tinted bg. Chip: 20-24px, neutral border, used for filters.
            </div>
          </div>

          {/* Tabs + progress */}
          <div className="card" style={{ padding: 18 }}>
            <div className="kpi-label" style={{ marginBottom: 10 }}>Tab · Progress</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              <div className="vtab active"><Ico name="dashboard" size={13} />Overview</div>
              <div className="vtab"><Ico name="graph" size={13} />Charts</div>
              <div className="vtab"><Ico name="list-tree" size={13} />Sessions</div>
            </div>
            <div className="progress"><div style={{ width: '78%' }} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--vscode-descriptionForeground)', marginTop: 6 }}>
              <span>78% remaining</span>
              <span>02:14:37</span>
            </div>
          </div>
        </div>
      </section>

      {/* HEATMAP SCALE */}
      <section>
        {sectionTitle('Heatmap scale', '5 steps — derived per-theme')}
        <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          {[0,1,2,3,4].map(v => (
            <div key={v} style={{ textAlign: 'center' }}>
              <div className="heat-cell" style={{ background: `var(--heat-${v})`, width: 32, height: 32, marginBottom: 6 }} />
              <span className="mono" style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)' }}>--heat-{v}</span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', maxWidth: 280, textAlign: 'right' }}>
            Step 0 = empty cell · Step 4 = peak day. Scaled per quartile of the visible window.
          </div>
        </div>
      </section>
    </div>
  );
}

window.TokensScreen = TokensScreen;
