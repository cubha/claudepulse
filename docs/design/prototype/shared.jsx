// Shared utilities for the Clausight design canvas.
// Mock data + tiny inline-SVG charts (no external chart deps; CSP-safe).

// ---------- Icon (Codicons via CDN) ----------
const Ico = ({ name, size = 14, style }) => (
  <span
    className={`codicon codicon-${name}`}
    style={{ fontSize: size, lineHeight: 1, display: 'inline-block', ...style }}
    aria-hidden="true"
  />
);

// Tiny logomark — abstract pulse "C" so the dashboard has its own glyph
// distinct from the Anthropic mark, which we shouldn't lift.
const Logomark = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path
      d="M11.5 4.2A4.7 4.7 0 0 0 8 2.7a5.3 5.3 0 0 0 0 10.6 4.7 4.7 0 0 0 3.5-1.5"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
    />
    <circle cx="8" cy="8" r="1.4" fill={color} />
  </svg>
);

// ---------- Mock data ----------
const TODAY = {
  tokens: 124300,
  cost: 0.87,
  monthCost: 42.31,
  sessions: 3,
  windowPctLeft: 78,
  windowReset: '02:14:37',
  deltas: { tokens: +18.4, cost: +12.6, month: -3.1, sessions: 0 },
};

const TOP_PROJECTS = [
  { name: 'clausight',     tokens: 45200, cost: 0.42, share: 0.38, spark: [3,5,4,7,9,12,8,11,14,10,13,16] },
  { name: 'api-server',    tokens: 32100, cost: 0.21, share: 0.27, spark: [8,7,9,6,10,8,9,12,7,9,11,8] },
  { name: 'notes-app',     tokens: 18700, cost: 0.13, share: 0.16, spark: [2,3,2,4,3,5,4,6,5,7,6,5] },
  { name: 'design-system', tokens: 15400, cost: 0.07, share: 0.13, spark: [1,2,1,3,2,2,3,4,3,5,4,3] },
  { name: 'infra-config',  tokens:  6400, cost: 0.04, share: 0.06, spark: [1,1,2,1,2,1,1,2,1,2,1,2] },
];

// 30 days, three model series (Opus / Sonnet / Haiku) — k tokens
const TREND_30D = (() => {
  const seed = 42;
  let s = seed;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const days = [];
  for (let i = 0; i < 30; i++) {
    const base = 60 + Math.sin(i * 0.55) * 30 + i * 1.4;
    days.push({
      i,
      opus:   Math.max(0, base * 0.18 + r() * 25),
      sonnet: Math.max(0, base * 0.55 + r() * 30),
      haiku:  Math.max(0, base * 0.20 + r() * 18),
    });
  }
  return days;
})();

// 12 weeks x 7 days heatmap intensity 0..4
const HEATMAP = (() => {
  let s = 7;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const cells = [];
  for (let w = 0; w < 12; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const weekend = d === 0 || d === 6;
      const t = r();
      let v = weekend ? Math.floor(t * 3) : Math.floor(t * 5);
      if (w === 11 && d > 4) v = 0;
      week.push(v);
    }
    cells.push(week);
  }
  return cells;
})();

const SESSIONS = [
  { id: 'sess_2c91', start: 'Today, 14:32', dur: '47m', project: 'clausight',     model: 'Opus 4',    msgs: 84, input: 312000, output: 41200, cache: 902000, cost: 4.21, status: 'live' },
  { id: 'sess_2c8f', start: 'Today, 13:08', dur: '1h 12m', project: 'api-server', model: 'Sonnet 4.5', msgs: 121, input: 487000, output: 62100, cache: 1240000, cost: 2.84, status: 'done' },
  { id: 'sess_2c8a', start: 'Today, 11:45', dur: '24m', project: 'notes-app',    model: 'Haiku 3.5', msgs: 32, input: 96000, output: 12400, cache: 210000, cost: 0.18, status: 'done' },
  { id: 'sess_2c87', start: 'Today, 09:20', dur: '2h 03m', project: 'clausight', model: 'Sonnet 4.5', msgs: 198, input: 712000, output: 88400, cache: 1820000, cost: 3.92, status: 'done' },
  { id: 'sess_2c81', start: 'Yesterday, 22:14', dur: '38m', project: 'design-system', model: 'Sonnet 4.5', msgs: 56, input: 184000, output: 22100, cache: 410000, cost: 1.04, status: 'done' },
  { id: 'sess_2c7e', start: 'Yesterday, 17:51', dur: '1h 28m', project: 'api-server', model: 'Opus 4',    msgs: 142, input: 556000, output: 71200, cache: 1620000, cost: 6.15, status: 'done' },
  { id: 'sess_2c7a', start: 'Yesterday, 15:02', dur: '52m', project: 'clausight',  model: 'Sonnet 4.5', msgs: 88, input: 298000, output: 36400, cache: 740000, cost: 1.62, status: 'done' },
  { id: 'sess_2c76', start: 'Yesterday, 11:18', dur: '19m', project: 'infra-config', model: 'Haiku 3.5', msgs: 24, input: 62000, output: 8200, cache: 130000, cost: 0.11, status: 'done' },
  { id: 'sess_2c70', start: 'May 8, 16:44', dur: '1h 06m', project: 'notes-app',  model: 'Sonnet 4.5', msgs: 91, input: 312000, output: 38800, cache: 690000, cost: 1.74, status: 'done' },
  { id: 'sess_2c6c', start: 'May 8, 10:22', dur: '2h 44m', project: 'clausight',  model: 'Opus 4',    msgs: 218, input: 904000, output: 112000, cache: 2410000, cost: 9.18, status: 'done' },
];

const PROJECT_DIST = [
  { name: 'clausight',     value: 38, color: 'var(--c-sonnet)' },
  { name: 'api-server',    value: 27, color: 'var(--c-opus)' },
  { name: 'notes-app',     value: 16, color: 'var(--c-haiku)' },
  { name: 'design-system', value: 13, color: 'var(--c-warn)' },
  { name: 'infra-config',  value:  6, color: 'var(--c-slate)' },
];

// ---------- Number formatting ----------
const fmtTokens = (n) => {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
};
const fmtUsd = (n) => '$' + n.toFixed(2);
const fmtPct = (n) => (n > 0 ? '+' : '') + n.toFixed(1) + '%';

// ---------- Sparkline ----------
const Sparkline = ({ data, w = 64, h = 18, color = 'currentColor', fill = false }) => {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = Math.max(max - min, 1);
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, h - ((v - min) / span) * (h - 2) - 1]);
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const fillD = d + ` L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {fill && <path d={fillD} fill={color} opacity="0.18" />}
      <path d={d} stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ---------- Stacked area chart (Opus / Sonnet / Haiku) ----------
const AreaTrend = ({ data = TREND_30D, w = 720, h = 240, padL = 36, padR = 12, padT = 12, padB = 28, hover = 18 }) => {
  const series = ['haiku', 'sonnet', 'opus']; // bottom to top
  const colors = { opus: 'var(--c-opus)', sonnet: 'var(--c-sonnet)', haiku: 'var(--c-haiku)' };
  // Build stacked totals
  const stacked = data.map(d => {
    let acc = 0;
    const segs = {};
    for (const s of series) {
      segs[s + '0'] = acc;
      acc += d[s];
      segs[s + '1'] = acc;
    }
    segs.total = acc;
    return segs;
  });
  const max = Math.max(...stacked.map(s => s.total)) * 1.1;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const x = (i) => padL + (i / (data.length - 1)) * innerW;
  const y = (v) => padT + innerH - (v / max) * innerH;

  const buildPath = (key) => {
    const top = data.map((_, i) => `${x(i).toFixed(1)},${y(stacked[i][key + '1']).toFixed(1)}`);
    const bot = data.map((_, i) => `${x(i).toFixed(1)},${y(stacked[i][key + '0']).toFixed(1)}`).reverse();
    return 'M' + top.join(' L ') + ' L ' + bot.join(' L ') + ' Z';
  };
  const buildLine = (key) =>
    'M' + data.map((_, i) => `${x(i).toFixed(1)},${y(stacked[i][key + '1']).toFixed(1)}`).join(' L ');

  // Y-axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => ({ v: t * max, y: y(t * max) }));

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {/* Grid */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={t.y} y2={t.y} stroke="var(--vscode-grid)" strokeWidth="1" strokeDasharray="2 4" />
          <text x={padL - 6} y={t.y + 3} textAnchor="end" fontSize="10" fill="var(--vscode-descriptionForeground)" fontFamily="var(--ff-mono)">
            {fmtTokens(t.v * 1000)}
          </text>
        </g>
      ))}
      {/* X ticks (every 5 days) */}
      {data.map((d, i) => i % 5 === 0 && (
        <text key={i} x={x(i)} y={h - 8} textAnchor="middle" fontSize="10" fill="var(--vscode-descriptionForeground)" fontFamily="var(--ff-mono)">
          {30 - i}d
        </text>
      ))}
      {/* Areas (bottom to top) */}
      {series.map(key => (
        <path key={'a' + key} d={buildPath(key)} fill={colors[key]} opacity="0.22" />
      ))}
      {series.map(key => (
        <path key={'l' + key} d={buildLine(key)} stroke={colors[key]} strokeWidth="1.6" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {/* Hover crosshair + dots at index `hover` */}
      <line x1={x(hover)} x2={x(hover)} y1={padT} y2={h - padB} stroke="var(--vscode-foreground)" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="3 3" />
      {series.map(key => (
        <circle key={'d' + key} cx={x(hover)} cy={y(stacked[hover][key + '1'])} r="3" fill="var(--vscode-card-background)" stroke={colors[key]} strokeWidth="1.5" />
      ))}
    </svg>
  );
};

// ---------- Donut chart with center label ----------
const Donut = ({ data = PROJECT_DIST, size = 220, thickness = 24 }) => {
  const r = size / 2 - thickness / 2 - 2;
  const c = size / 2;
  const total = data.reduce((s, d) => s + d.value, 0);
  let angle = -Math.PI / 2;
  const arcs = data.map((d) => {
    const a0 = angle;
    const a1 = angle + (d.value / total) * Math.PI * 2;
    angle = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0);
    const x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1);
    return { d, path: `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}` };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} stroke="var(--vscode-divider)" strokeWidth={thickness} fill="none" />
      {arcs.map((a, i) => (
        <path key={i} d={a.path} stroke={a.d.color} strokeWidth={thickness} fill="none" strokeLinecap="butt" />
      ))}
    </svg>
  );
};

// ---------- Heatmap (12 weeks x 7 days) ----------
const Heatmap = ({ cells = HEATMAP, cellSize = 12, gap = 2 }) => {
  const days = ['M','','W','','F','',''];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateRows: `repeat(7, ${cellSize}px)`, gap, paddingTop: 16 }}>
        {days.map((d, i) => (
          <div key={i} style={{ fontSize: 9, color: 'var(--vscode-descriptionForeground)', fontFamily: 'var(--ff-mono)', height: cellSize, lineHeight: `${cellSize}px` }}>{d}</div>
        ))}
      </div>
      <div>
        <div style={{ display: 'flex', gap, marginBottom: 4, paddingLeft: 2 }}>
          {['Feb','Mar','Apr','May'].map((m, i) => (
            <div key={i} style={{ width: (cellSize + gap) * 3, fontSize: 10, color: 'var(--vscode-descriptionForeground)', fontFamily: 'var(--ff-mono)' }}>{m}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridTemplateRows: `repeat(7, ${cellSize}px)`, gap }}>
          {cells.map((week, w) => week.map((v, d) => (
            <div
              key={`${w}-${d}`}
              className="heat-cell"
              style={{
                background: `var(--heat-${v})`,
                width: cellSize,
                height: cellSize,
              }}
              title={`Week ${w + 1}, Day ${d + 1}: ${v} of 4`}
            />
          )))}
        </div>
      </div>
    </div>
  );
};

// Legend dot
const Dot = ({ color, size = 8 }) => (
  <span style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'inline-block', flex: '0 0 auto' }} />
);

Object.assign(window, {
  Ico, Logomark,
  TODAY, TOP_PROJECTS, TREND_30D, HEATMAP, SESSIONS, PROJECT_DIST,
  fmtTokens, fmtUsd, fmtPct,
  Sparkline, AreaTrend, Donut, Heatmap, Dot,
});
