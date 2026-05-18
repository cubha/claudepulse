const STORAGE_KEY = 'ccg-lang';

type Lang = 'ko' | 'en' | 'ja' | 'zh';

const dict: Record<string, Record<Lang, string>> = {
  // 에러 / 연결 상태
  login_required:   { ko: '로그인 필요',       en: 'Login Required',        ja: 'ログイン必要',             zh: '需要登录' },
  session_expired:  { ko: '세션 만료',          en: 'Session Expired',       ja: 'セッション期限切れ',       zh: '会话过期' },
  network_error:    { ko: '네트워크 오류',      en: 'Network Error',         ja: 'ネットワークエラー',       zh: '网络错误' },
  connecting:       { ko: '연결 중…',           en: 'Connecting…',           ja: '接続中…',                 zh: '连接中…' },
  login_sub_missing:{ ko: 'Claude Code CLI가 설치되어 있지 않거나<br>로그인되지 않았습니다.',
                      en: 'Claude Code CLI is not installed or<br>you are not logged in.',
                      ja: 'Claude Code CLIがインストールされていないか<br>ログインされていません。',
                      zh: 'Claude Code CLI 未安装或<br>您尚未登录。' },
  login_sub_expired:{ ko: 'OAuth 토큰이 만료됐습니다.<br>다시 로그인해 주세요.',
                      en: 'OAuth token has expired.<br>Please log in again.',
                      ja: 'OAuthトークンが期限切れです。<br>再ログインしてください。',
                      zh: 'OAuth 令牌已过期。<br>请重新登录。' },
  login_sub_network:{ ko: 'Anthropic API에 연결할 수 없습니다.<br>네트워크를 확인하세요.',
                      en: 'Cannot connect to Anthropic API.<br>Please check your network.',
                      ja: 'Anthropic APIに接続できません。<br>ネットワークを確認してください。',
                      zh: '无法连接到 Anthropic API。<br>请检查您的网络。' },
  connecting_sub:   { ko: 'Anthropic API에서 Rate Limit 정보를<br>가져오는 중…',
                      en: 'Fetching Rate Limit info from<br>Anthropic API…',
                      ja: 'Anthropic APIからRate Limit情報を<br>取得中…',
                      zh: '正在从 Anthropic API 获取<br>Rate Limit 信息…' },
  // 버튼 / 힌트
  login_with_claude:{ ko: 'Claude로 로그인',    en: 'Login with Claude',     ja: 'Claudeでログイン',         zh: '使用 Claude 登录' },
  login_hint:       { ko: '로그인 후 ↻ 버튼을 눌러 새로고침하세요',
                      en: 'After login, press ↻ to refresh',
                      ja: 'ログイン後、↻を押して更新してください',
                      zh: '登录后，按 ↻ 刷新' },
  retry:            { ko: '↻ 다시 시도',        en: '↻ Retry',               ja: '↻ 再試行',                zh: '↻ 重试' },
  // 사용량
  no_usage_today:   { ko: '오늘 사용량 없음',   en: 'No usage today',        ja: '本日の使用量なし',         zh: '今日无使用记录' },
  tokens:           { ko: '토큰',               en: 'tokens',                ja: 'トークン',                 zh: '令牌' },
  // 섹션
  session_5h:       { ko: '세션 (5h)',           en: 'Session (5h)',           ja: 'セッション (5h)',           zh: '会话 (5h)' },
  weekly_7d:        { ko: '주간 (7d)',           en: 'Weekly (7d)',            ja: '週間 (7d)',                zh: '每周 (7d)' },
  resets_in:        { ko: '재설정까지',          en: 'resets in',             ja: 'リセットまで',             zh: '重置于' },
  left:             { ko: '남음',                en: 'left',                  ja: '残り',                    zh: '剩余' },
  burn:             { ko: '소모율',              en: 'Burn',                  ja: '消費率',                   zh: '消耗率' },
  safe_until:       { ko: '안전 시간',           en: 'Safe until',            ja: '安全期限',                 zh: '安全至' },
  proj:             { ko: '예측',               en: 'proj',                  ja: '予測',                    zh: '预测' },
  // Overage
  overage:          { ko: '초과',               en: 'Overage',               ja: '超過',                    zh: '超额' },
  overage_active:   { ko: '활성',               en: 'Active',                ja: 'アクティブ',               zh: '活跃' },
  overage_blocked:  { ko: '차단됨',             en: 'Blocked',               ja: 'ブロック',                 zh: '已屏蔽' },
  // 상태 배지
  status_ok:        { ko: 'OK',                 en: 'OK',                    ja: 'OK',                      zh: '正常' },
  status_warning:   { ko: '경고',               en: 'Warning',               ja: '警告',                    zh: '警告' },
  status_blocked:   { ko: '차단',               en: 'Blocked',               ja: 'ブロック',                 zh: '已屏蔽' },
};

function detectLang(): Lang {
  const nav = (typeof navigator !== 'undefined' ? navigator.language : '') ?? '';
  if (nav.startsWith('ko')) return 'ko';
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('zh')) return 'zh';
  return 'en';
}

export function getLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored && ['ko', 'en', 'ja', 'zh'].includes(stored)) return stored;
  } catch { /* storage unavailable */ }
  return detectLang();
}

export function setLang(lang: Lang): void {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
}

export function t(key: string): string {
  const lang = getLang();
  return dict[key]?.[lang] ?? dict[key]?.['en'] ?? key;
}
