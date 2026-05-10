// ---------- StatusBar artboard (zoomed slice of VS Code bottom bar) ----------
function StatusBarScreen() {
  return (
    <div className="theme-dark" style={{
      width: '100%', height: '100%',
      background: 'var(--vscode-editor-background)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Faux editor area to give the bar context */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          padding: '14px 18px',
          fontFamily: 'var(--ff-mono)',
          fontSize: 12, lineHeight: '18px',
          color: '#6E7681', opacity: 0.6, userSelect: 'none',
        }}>
          <div><span style={{ color: '#C586C0' }}>import</span> <span style={{ color: '#9CDCFE' }}>{'{ window }'}</span> <span style={{ color: '#C586C0' }}>from</span> <span style={{ color: '#CE9178' }}>'vscode'</span>;</div>
          <div><span style={{ color: '#C586C0' }}>const</span> <span style={{ color: '#4FC1FF' }}>item</span> = window.<span style={{ color: '#DCDCAA' }}>createStatusBarItem</span>();</div>
          <div>item.<span style={{ color: '#9CDCFE' }}>text</span> = <span style={{ color: '#CE9178' }}>'$(pulse) 124.3K · $0.87'</span>;</div>
          <div>item.<span style={{ color: '#DCDCAA' }}>show</span>();</div>
        </div>
        {/* Hover tooltip floating above the status bar item */}
        <div style={{
          position: 'absolute',
          right: 168, bottom: 36,
          width: 248,
          background: '#1F1F1F',
          border: '1px solid #3A3A3D',
          borderRadius: 6,
          padding: '10px 12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          fontSize: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--vscode-foreground)' }}>
            <Logomark size={14} color="#3B82F6" />
            <span style={{ fontWeight: 600 }}>Clausight</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--vscode-descriptionForeground)' }}>clausight</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', color: 'var(--vscode-descriptionForeground)' }}>
            <div>Today</div>
            <div className="mono" style={{ color: 'var(--vscode-foreground)' }}>124.3K · $0.87</div>
            <div>Active session</div>
            <div className="mono" style={{ color: 'var(--vscode-foreground)' }}>Sonnet 4.5 · 47m</div>
            <div>5h window</div>
            <div className="mono" style={{ color: 'var(--vscode-foreground)' }}>78% left · 02:14</div>
            <div>Month-to-date</div>
            <div className="mono" style={{ color: 'var(--vscode-foreground)' }}>$42.31</div>
          </div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #2D2D30', fontSize: 11, color: 'var(--vscode-descriptionForeground)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Click to open dashboard</span>
            <span style={{ fontFamily: 'var(--ff-mono)' }}>⌘⇧U</span>
          </div>
          {/* Tail pointing to status bar item */}
          <div style={{
            position: 'absolute', bottom: -5, left: 36,
            width: 8, height: 8,
            background: '#1F1F1F',
            borderRight: '1px solid #3A3A3D',
            borderBottom: '1px solid #3A3A3D',
            transform: 'rotate(45deg)',
          }} />
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        height: 28,
        background: '#181818',
        borderTop: '1px solid #2D2D30',
        display: 'flex',
        alignItems: 'center',
        fontSize: 12,
        color: '#CCCCCC',
        fontFamily: 'var(--ff-sans)',
      }}>
        {/* Left cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, paddingLeft: 4 }}>
          {[
            { ico: 'remote', label: '', bg: '#0E639C' },
            { ico: 'source-control', label: 'main*' },
            { ico: 'sync', label: '↓ 2 ↑ 1' },
            { ico: 'error', label: '0', accent: '#F43F5E' },
            { ico: 'warning', label: '3', accent: '#F59E0B' },
          ].map((it, i) => (
            <div key={i} style={{
              height: 28, padding: '0 8px',
              display: 'flex', alignItems: 'center', gap: 4,
              background: it.bg || 'transparent',
              color: it.bg ? '#fff' : '#CCCCCC',
            }}>
              <Ico name={it.ico} size={13} style={it.accent ? { color: it.accent } : {}} />
              {it.label && <span>{it.label}</span>}
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Right cluster — our extension item is highlighted */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {[
            { ico: 'bell', label: '' },
            { ico: 'feedback', label: '' },
          ].map((it, i) => (
            <div key={i} style={{ height: 28, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Ico name={it.ico} size={13} />
            </div>
          ))}
          {/* Clausight item — hovered */}
          <div
            data-comment-anchor="statusbar-item"
            style={{
              height: 28, padding: '0 10px',
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#2A2A2D',
              outline: '1px solid #3A3A3D',
              outlineOffset: -1,
              cursor: 'pointer',
            }}
          >
            <Logomark size={13} color="#3B82F6" />
            <span className="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>124.3K</span>
            <span style={{ color: '#6E6E6E' }}>·</span>
            <span className="mono">$0.87</span>
            {/* Live dot */}
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#22C55E',
              boxShadow: '0 0 0 2px rgba(34,197,94,0.18)',
              marginLeft: 2,
            }} />
          </div>
          {[
            { ico: 'circle-filled', label: 'TS 5.4' },
            { ico: 'check', label: 'Prettier' },
            { ico: 'smiley', label: '' },
          ].map((it, i) => (
            <div key={i} style={{ height: 28, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, color: '#9D9D9D' }}>
              <Ico name={it.ico} size={11} />
              {it.label && <span style={{ fontSize: 11 }}>{it.label}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Annotation labels (outside the chrome, above the bar) */}
      <div style={{
        position: 'absolute', bottom: 56, right: 16,
        fontSize: 10, color: '#6E6E6E', fontFamily: 'var(--ff-mono)',
        letterSpacing: '0.04em', textTransform: 'uppercase',
      }}>
        Hover tooltip · click → opens panel
      </div>
    </div>
  );
}

window.StatusBarScreen = StatusBarScreen;
