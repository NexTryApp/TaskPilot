// ============================================================
// TaskPilot Web UI — Multi-page SPA
// Page 1: Setup (Provider + Channels)
// Page 2: Agent Config (Prompt, Permissions, Goal)
// Page 3: Live Dashboard (SSE streaming)
// ============================================================

// ===== Model catalogs per provider =====
const MODEL_CATALOG = {
  openai:     ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o3-mini', 'o4-mini'],
  anthropic:  ['claude-opus-4-0', 'claude-sonnet-4-0', 'claude-3-5-haiku-latest'],
  gemini:     ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  deepseek:   ['deepseek-chat', 'deepseek-reasoner'],
  groq:       ['llama-3.3-70b-versatile', 'mistral-saba-24b', 'gemma2-9b-it'],
  mistral:    ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
  together:   ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V3.1', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
  xai:        ['grok-3', 'grok-3-fast', 'grok-2'],
  moonshot:   ['kimi-k2-thinking', 'kimi-k2-thinking-turbo', 'kimi-latest', 'moonshot-v1-32k'],
  minimax:    ['MiniMax-M2.1', 'MiniMax-M2.1-lightning', 'MiniMax-M2'],
  venice:     [],  // Dynamic — use GET /api/v1/models
  qwen:       ['qwen3-max', 'qwen-plus', 'qwen-flash', 'qwen-turbo'],
  glm:        ['GLM-4-Plus', 'GLM-4-Air-250414', 'GLM-4-AirX', 'GLM-4-Flash-250414', 'GLM-4-FlashX-250414'],
  bedrock:    ['anthropic.claude-sonnet-4-20250514-v1:0', 'anthropic.claude-opus-4-20250514-v1:0', 'anthropic.claude-3-haiku-20240307-v1:0', 'meta.llama3-70b-instruct-v1:0'],
  openrouter: [],  // Dynamic — use GET /api/v1/models
  ollama:     ['llama3.3', 'llama3.1', 'mistral', 'qwen2.5', 'gemma2', 'phi3', 'codellama', 'deepseek-r1'],
};

const PROVIDER_KEY_LINKS = {
  openai:    { url: 'https://platform.openai.com/api-keys', label: 'platform.openai.com' },
  anthropic: { url: 'https://console.anthropic.com/settings/keys', label: 'console.anthropic.com' },
  gemini:    { url: 'https://aistudio.google.com/apikey', label: 'aistudio.google.com' },
  deepseek:  { url: 'https://platform.deepseek.com/api_keys', label: 'platform.deepseek.com' },
  groq:      { url: 'https://console.groq.com/keys', label: 'console.groq.com' },
  mistral:   { url: 'https://console.mistral.ai/api-keys', label: 'console.mistral.ai' },
  together:  { url: 'https://api.together.xyz/settings/api-keys', label: 'api.together.xyz' },
  xai:       { url: 'https://console.x.ai/', label: 'console.x.ai' },
  moonshot:  { url: 'https://platform.moonshot.ai/console/api-keys', label: 'platform.moonshot.ai' },
  minimax:   { url: 'https://www.minimaxi.com/platform', label: 'minimaxi.com' },
  venice:    { url: 'https://venice.ai/settings/api', label: 'venice.ai' },
  qwen:      { url: 'https://dashscope.console.aliyun.com/apiKey', label: 'dashscope.aliyun.com' },
  glm:       { url: 'https://open.bigmodel.cn/usercenter/apikeys', label: 'open.bigmodel.cn' },
  bedrock:   { url: 'https://console.aws.amazon.com/bedrock', label: 'AWS Console (Bedrock)' },
  openrouter:{ url: 'https://openrouter.ai/keys', label: 'openrouter.ai' },
  ollama:    { url: '', label: 'runs locally, no key needed' },
};

// Channel access actions — enriched with descriptions and risk levels
const CHANNEL_ACTIONS = {
  telegram: [
    { id: 'send',   label: 'Send messages',      icon: '\u{1F4E4}', description: 'Agent can send messages to chats on your behalf', destructive: false },
    { id: 'read',   label: 'Read messages',       icon: '\u{1F4E5}', description: 'Agent can read incoming messages in your chats', destructive: false },
    { id: 'react',  label: 'React to messages',   icon: '\u{1F44D}', description: 'Agent can add emoji reactions to messages', destructive: false },
    { id: 'delete', label: 'Delete messages',      icon: '\u{1F5D1}', description: 'Agent can permanently delete messages — cannot be undone', destructive: true },
  ],
  discord: [
    { id: 'send',   label: 'Send messages',       icon: '\u{1F4E4}', description: 'Agent can post messages in channels and DMs', destructive: false },
    { id: 'read',   label: 'Read messages',        icon: '\u{1F4E5}', description: 'Agent can read message history', destructive: false },
    { id: 'react',  label: 'React',                icon: '\u{1F44D}', description: 'Agent can add reactions to messages', destructive: false },
    { id: 'manage', label: 'Manage channels',      icon: '\u{2699}',  description: 'Agent can create, rename, or delete channels on the server', destructive: true },
  ],
  whatsapp: [
    { id: 'send',   label: 'Send messages',        icon: '\u{1F4E4}', description: 'Agent can send messages via WhatsApp Business API', destructive: false },
    { id: 'read',   label: 'Read messages',         icon: '\u{1F4E5}', description: 'Agent can read incoming webhook messages', destructive: false },
  ],
  slack: [
    { id: 'send',   label: 'Send messages',        icon: '\u{1F4E4}', description: 'Agent can post messages in channels and DMs', destructive: false },
    { id: 'read',   label: 'Read messages',         icon: '\u{1F4E5}', description: 'Agent can read channel and DM history', destructive: false },
    { id: 'post',   label: 'Post to channels',      icon: '\u{1F4E2}', description: 'Agent can post to any public channel in the workspace', destructive: false },
  ],
  browser: [
    { id: 'open',       label: 'Open URLs',         icon: '\u{1F310}', description: 'Agent can navigate to any URL in the browser', destructive: false },
    { id: 'search',     label: 'Search the web',    icon: '\u{1F50D}', description: 'Agent can perform web searches', destructive: false },
    { id: 'screenshot', label: 'Take screenshots',  icon: '\u{1F4F7}', description: 'Agent can capture page screenshots', destructive: false },
    { id: 'fill',       label: 'Fill forms',         icon: '\u{1F4DD}', description: 'Agent can type into form fields and submit data on websites', destructive: true },
  ],
  terminal: [
    { id: 'run',   label: 'Run commands',          icon: '\u{26A1}',  description: 'Agent can execute shell commands on this machine — full system access', destructive: true },
    { id: 'read',  label: 'Read output',            icon: '\u{1F4C4}', description: 'Agent can read command output and file contents', destructive: false },
    { id: 'write', label: 'Write files',             icon: '\u{1F4BE}', description: 'Agent can create, modify, or delete files on disk', destructive: true },
  ],
  email: [
    { id: 'send',  label: 'Send emails',           icon: '\u{1F4E7}', description: 'Agent can send emails from your account to any recipient', destructive: true },
    { id: 'read',  label: 'Read inbox',             icon: '\u{1F4E5}', description: 'Agent can read emails in your inbox', destructive: false },
  ],
};

// How each channel connects
const CHANNEL_CONNECTION_INFO = {
  telegram:  { method: 'Bot API (long polling)', endpoint: 'api.telegram.org', note: 'Connects via Telegram Bot API. Messages are received through long polling.' },
  discord:   { method: 'Discord Gateway (WebSocket)', endpoint: 'discord.com/api', note: 'Connects via Discord Bot Gateway. Requires bot to be added to a server.' },
  whatsapp:  { method: 'Meta Graph API (webhook)', endpoint: 'graph.facebook.com', note: 'Connects via Meta Business API. Requires webhook configuration.' },
  slack:     { method: 'Bolt SDK (WebSocket)', endpoint: 'slack.com/api', note: 'Connects via Slack Bolt SDK using WebSocket mode.' },
  browser:   { method: 'Built-in automation', endpoint: 'localhost', note: 'Uses headless browser automation. No external connection needed.' },
  terminal:  { method: 'Local shell', endpoint: 'localhost', note: 'Executes commands directly on this machine. No network connection.' },
  email:     { method: 'SMTP + IMAP', endpoint: 'Configured host', note: 'Connects to your mail server via SMTP (send) and IMAP (read).' },
};

// Platform icons for workspace
const PLATFORM_ICONS = {
  telegram: '\u{1F4AC}', chrome: '\u{1F310}', terminal: '\u{1F4BB}',
  'task-manager': '\u{1F4CB}', tasks: '\u{1F4CB}', 'weather-api': '\u{26C5}',
  api: '\u{26C5}', email: '\u{2709}\uFE0F', discord: '\u{1F3AE}',
  slack: '\u{1F4BC}', whatsapp: '\u{1F4F1}', browser: '\u{1F310}',
  default: '\u{1F50C}',
};

// ===== State =====
let selectedProvider = 'openai';
let selectedBaseUrl = 'https://api.openai.com/v1';
let currentPage = 1;
let currentMaxSteps = 15;
const workspaceState = new Map();
let selectedSkill = 'web-researcher';
let skillsCatalog = [];
let currentApprovalId = null;
let approvalTimerInterval = null;
let sessionToken = '';

// ===== Session Token: fetch on load + auto-refresh every 25 min (server rotates at 30 min) =====
async function fetchSessionToken() {
  try {
    const resp = await fetch('/api/session');
    if (resp.ok) {
      const data = await resp.json();
      sessionToken = data.token || '';
    }
  } catch {
    console.warn('Failed to fetch session token');
  }
}
// Auto-refresh token before server rotation (30 min TTL, refresh at 25 min)
setInterval(fetchSessionToken, 25 * 60 * 1000);

/** Helper: build headers with session token for authenticated requests */
function authHeaders(extra = {}) {
  return { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken, ...extra };
}

// ===== Skills: Load + Render + Select =====

const SECURITY_LEVEL_LABELS = {
  safe:     { text: 'Safe', cls: 'safe' },
  moderate: { text: 'Moderate', cls: 'moderate' },
  full:     { text: 'Full Access', cls: 'full' },
};

async function loadSkills() {
  try {
    const resp = await fetch('/api/skills');
    if (!resp.ok) return;
    skillsCatalog = await resp.json();
    renderSkillGrid();
  } catch {
    // Skills endpoint not available — show default
    skillsCatalog = [];
  }
}

function renderSkillGrid() {
  const grid = document.getElementById('skillGrid');
  if (!grid) return;
  grid.innerHTML = '';

  skillsCatalog.forEach(skill => {
    const card = document.createElement('div');
    card.className = `skill-card ${skill.securityLevel}${skill.key === selectedSkill ? ' selected' : ''}`;
    card.dataset.skill = skill.key;
    card.innerHTML = `
      <div class="skill-card-top">
        <span class="skill-card-icon">${skill.icon || '\u{1F916}'}</span>
        <span class="skill-card-name">${skill.name}</span>
      </div>
      <div class="skill-card-desc">${skill.description}</div>
      <div class="skill-card-level ${skill.securityLevel}">${SECURITY_LEVEL_LABELS[skill.securityLevel]?.text || skill.securityLevel}</div>
    `;
    card.addEventListener('click', () => selectSkill(skill.key));
    grid.appendChild(card);
  });
}

function selectSkill(skillKey) {
  selectedSkill = skillKey;
  // Update card selection
  document.querySelectorAll('.skill-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.skill === skillKey);
  });
  // Update security level bar
  const skill = skillsCatalog.find(s => s.key === skillKey);
  if (skill) {
    const info = SECURITY_LEVEL_LABELS[skill.securityLevel] || SECURITY_LEVEL_LABELS.safe;
    const dot = document.getElementById('securityDot');
    const text = document.getElementById('securityLevelText');
    if (dot) { dot.className = `security-dot ${info.cls}`; }
    if (text) { text.textContent = info.text; }
  }
  updateChannelSkillWarnings();
}

// ===== Settings: Auto-load + Save =====

async function loadSavedSettings() {
  try {
    const resp = await fetch('/api/settings', { headers: authHeaders() });
    if (!resp.ok) return;
    const settings = await resp.json();
    // Restore API key
    if (settings.apiKey) {
      apiKeyInput.value = settings.apiKey;
    }
    // Restore provider
    if (settings.provider) {
      const btn = document.querySelector(`.provider-btn[data-provider="${settings.provider}"]`);
      if (btn) {
        providerBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedProvider = settings.provider;
        selectedBaseUrl = btn.dataset.url;
        populateModels(settings.provider);
      }
    }
    // Restore model
    if (settings.model) {
      const opt = modelSelect.querySelector(`option[value="${settings.model}"]`);
      if (opt) opt.selected = true;
    }
    // Restore skill
    if (settings.skill) {
      selectedSkill = settings.skill;
    }
    // Restore user profile
    if (settings.userName) {
      const el = document.getElementById('userName');
      if (el) el.value = settings.userName;
    }
    if (settings.userNotes) {
      const el = document.getElementById('userNotes');
      if (el) el.value = settings.userNotes;
    }
    // Restore context memory settings
    if (settings.contextMaxMessages) {
      const el = document.getElementById('contextMaxMessages');
      if (el) el.value = settings.contextMaxMessages;
    }
    if (settings.contextKeepRecent) {
      const el = document.getElementById('contextKeepRecent');
      if (el) el.value = settings.contextKeepRecent;
    }
    if (settings.contextUseLLM === 'true') {
      const el = document.getElementById('contextUseLLM');
      if (el) el.checked = true;
    }
    // Restore local-only notes
    if (settings.localOnlyNotes) {
      const el = document.getElementById('localOnlyNotes');
      if (el) el.value = settings.localOnlyNotes;
    }
    // Restore PII scrubber settings
    if (settings.scrubEmails === 'true') {
      const el = document.getElementById('scrubEmails');
      if (el) el.checked = true;
    }
    if (settings.scrubPhones === 'true') {
      const el = document.getElementById('scrubPhones');
      if (el) el.checked = true;
    }
    // Restore explanation language
    if (settings.explanationLanguage) {
      const el = document.getElementById('explanationLanguage');
      if (el) el.value = settings.explanationLanguage;
    }
  } catch {
    // No saved settings — that's fine
  }
}

async function saveSettings() {
  const settings = {
    apiKey: apiKeyInput.value.trim(),
    provider: selectedProvider,
    model: getSelectedModel(),
    skill: selectedSkill,
    userName: (document.getElementById('userName')?.value || '').trim(),
    userNotes: (document.getElementById('userNotes')?.value || '').trim(),
    contextMaxMessages: document.getElementById('contextMaxMessages')?.value || '30',
    contextKeepRecent: document.getElementById('contextKeepRecent')?.value || '8',
    contextUseLLM: document.getElementById('contextUseLLM')?.checked ? 'true' : 'false',
    localOnlyNotes: (document.getElementById('localOnlyNotes')?.value || '').trim(),
    scrubEmails: document.getElementById('scrubEmails')?.checked ? 'true' : 'false',
    scrubPhones: document.getElementById('scrubPhones')?.checked ? 'true' : 'false',
    explanationLanguage: document.getElementById('explanationLanguage')?.value || 'English',
  };
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(settings),
    });
  } catch {
    // Ignore save errors
  }
}

// ===== Approval Modal =====

function showApprovalModal(data) {
  currentApprovalId = data.id;
  const overlay = document.getElementById('approvalOverlay');
  const cmdEl = document.getElementById('approvalCommand');
  const expEl = document.getElementById('approvalExplanation');
  const timerEl = document.getElementById('approvalTimer');

  if (cmdEl) {
    const cmd = data.args?.command || data.toolName || 'unknown';
    cmdEl.textContent = cmd;
  }
  if (expEl) {
    const reasons = [];
    if (data.reason) reasons.push(data.reason);
    if (data.checks && data.checks.length > 0) {
      data.checks.forEach(c => {
        const desc = c.description || c.category;
        if (desc) reasons.push(`\u2022 ${desc}`);
      });
    }
    expEl.innerHTML = reasons.join('<br>') || 'Potentially dangerous operation';
  }

  // Start countdown timer
  let secondsLeft = 60;
  if (data.expiresAt) {
    secondsLeft = Math.max(1, Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000));
  }
  if (timerEl) timerEl.textContent = `${secondsLeft}s`;
  clearInterval(approvalTimerInterval);
  approvalTimerInterval = setInterval(() => {
    secondsLeft--;
    if (timerEl) timerEl.textContent = `${secondsLeft}s`;
    if (secondsLeft <= 0) {
      clearInterval(approvalTimerInterval);
      hideApprovalModal();
      addSecurityEntry('denied', '\u23f0 Timeout', data.args?.command || data.toolName || '', 'Timeout — auto-denied');
    }
  }, 1000);

  if (overlay) overlay.style.display = 'flex';
}

function hideApprovalModal() {
  clearInterval(approvalTimerInterval);
  currentApprovalId = null;
  const overlay = document.getElementById('approvalOverlay');
  if (overlay) overlay.style.display = 'none';
}

async function respondApproval(approved) {
  if (!currentApprovalId) return;
  const id = currentApprovalId;
  const cmdEl = document.getElementById('approvalCommand');
  const cmd = cmdEl ? cmdEl.textContent : '';
  hideApprovalModal();

  try {
    await fetch(`/api/approval/${id}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ approved }),
    });
  } catch {
    // Ignore network errors
  }

  addSecurityEntry(
    approved ? 'approved' : 'denied',
    approved ? '\u2705 Approved' : '\u274c Denied',
    cmd,
    approved ? 'Approved by user' : 'Denied by user'
  );
}

// Wire up approval buttons
document.getElementById('btnApprove')?.addEventListener('click', () => respondApproval(true));
document.getElementById('btnDeny')?.addEventListener('click', () => respondApproval(false));

// ===== Security Feed =====

function addSecurityEntry(type, label, command, reason) {
  const feed = document.getElementById('securityFeed');
  if (!feed) return;
  const ph = feed.querySelector('.feed-placeholder');
  if (ph) ph.remove();

  const entry = document.createElement('div');
  entry.className = `sec-entry ${type}`;
  entry.innerHTML = `
    <span class="se-icon">${label.split(' ')[0]}</span>
    <div class="se-body">
      <span class="se-cmd">${escapeHtml(command)}</span>
      ${reason ? `<span class="se-reason">${escapeHtml(reason)}</span>` : ''}
    </div>
  `;
  feed.appendChild(entry);
  feed.scrollTop = feed.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== Command Explanation Display (Security Advisor) =====

const RISK_ICONS = { safe: '\u2705', low: '\u{1F7E2}', medium: '\u{1F7E1}', high: '\u{1F7E0}', critical: '\u{1F534}' };
const RISK_LABELS = { safe: 'Safe', low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

function showCommandExplanation(data) {
  const { command, explanation } = data;
  if (!explanation) return;

  const riskIcon = RISK_ICONS[explanation.risk] || '\u2753';
  const riskLabel = RISK_LABELS[explanation.risk] || explanation.risk;
  const reversibleIcon = explanation.reversible ? '\u21A9\uFE0F' : '\u26A0\uFE0F';
  const reversibleText = explanation.reversible ? 'Reversible' : 'Irreversible';

  // Add to security feed with explanation
  const feed = document.getElementById('securityFeed');
  if (!feed) return;
  const ph = feed.querySelector('.feed-placeholder');
  if (ph) ph.remove();

  const entry = document.createElement('div');
  entry.className = `sec-entry explained risk-${explanation.risk}`;
  entry.innerHTML = `
    <span class="se-icon">${riskIcon}</span>
    <div class="se-body">
      <span class="se-cmd">${escapeHtml(command)}</span>
      <span class="se-explanation">${escapeHtml(explanation.whatItDoes)}</span>
      <div class="se-meta">
        <span class="se-risk">${riskIcon} ${riskLabel}</span>
        <span class="se-reversible">${reversibleIcon} ${reversibleText}</span>
        ${explanation.consequences && explanation.risk !== 'safe' ? `<span class="se-consequences">${escapeHtml(explanation.consequences)}</span>` : ''}
        ${explanation.saferAlternative ? `<span class="se-alternative">\u{1F4A1} ${escapeHtml(explanation.saferAlternative)}</span>` : ''}
      </div>
    </div>
  `;
  feed.appendChild(entry);
  feed.scrollTop = feed.scrollHeight;
}

function updateApprovalWithAnalysis(data) {
  // Update approval modal with deep LLM analysis
  if (!currentApprovalId || currentApprovalId !== data.id) return;
  const explanation = data.explanation;
  if (!explanation) return;

  const expEl = document.getElementById('approvalExplanation');
  if (!expEl) return;

  const riskIcon = RISK_ICONS[explanation.risk] || '\u2753';
  const riskLabel = RISK_LABELS[explanation.risk] || explanation.risk;
  const reversibleIcon = explanation.reversible ? '\u21A9\uFE0F' : '\u26A0\uFE0F';
  const reversibleText = explanation.reversible ? 'Reversible' : 'IRREVERSIBLE';

  expEl.innerHTML = `
    <div class="advisor-analysis">
      <div class="advisor-what">${escapeHtml(explanation.whatItDoes)}</div>
      <div class="advisor-risk">${riskIcon} Risk: <strong>${riskLabel}</strong> | ${reversibleIcon} ${reversibleText}</div>
      ${explanation.consequences ? `<div class="advisor-consequences">\u26A0\uFE0F ${escapeHtml(explanation.consequences)}</div>` : ''}
      ${explanation.saferAlternative ? `<div class="advisor-alternative">\u{1F4A1} Alternative: <code>${escapeHtml(explanation.saferAlternative)}</code></div>` : ''}
      <div class="advisor-recommendation">${escapeHtml(explanation.recommendation)}</div>
    </div>
  `;
}

// ===== Context Compression Display =====

function showContextCompression(data) {
  const feed = document.getElementById('securityFeed');
  if (!feed) return;
  const ph = feed.querySelector('.feed-placeholder');
  if (ph) ph.remove();

  const tierLabel = data.tier === 3 ? 'Deep compression' : 'Moderate compression';
  const tierIcon = data.tier === 3 ? '\u{1F9E0}' : '\u{1F4BE}';

  const entry = document.createElement('div');
  entry.className = 'sec-entry context-compressed';
  entry.innerHTML = `
    <span class="se-icon">${tierIcon}</span>
    <div class="se-body">
      <span class="se-cmd">${tierLabel}: ${data.messagesCompressed} messages</span>
      <span class="se-explanation">${escapeHtml(data.reasoning)}</span>
      <div class="se-meta">
        <span class="se-consequences">\u26A0\uFE0F ${escapeHtml(data.consequences)}</span>
      </div>
    </div>
  `;
  feed.appendChild(entry);
  feed.scrollTop = feed.scrollHeight;
}

// ===== PII Redaction Display =====

const PII_TYPE_LABELS = {
  SSH_PRIVATE_KEY: 'SSH Private Key',
  PGP_PRIVATE_KEY: 'PGP Private Key',
  JWT_TOKEN: 'JWT Token',
  AWS_ACCESS_KEY: 'AWS Key',
  AWS_SECRET_KEY: 'AWS Secret',
  OPENAI_API_KEY: 'OpenAI Key',
  ANTHROPIC_API_KEY: 'Anthropic Key',
  GITHUB_TOKEN: 'GitHub Token',
  STRIPE_KEY: 'Stripe Key',
  SLACK_TOKEN: 'Slack Token',
  DISCORD_TOKEN: 'Discord Token',
  TELEGRAM_BOT_TOKEN: 'Telegram Token',
  BEARER_TOKEN: 'Bearer Token',
  HEX_SECRET: 'Hex Secret',
  CREDIT_CARD: 'Credit Card',
  BTC_ADDRESS: 'BTC Address',
  ETH_ADDRESS: 'ETH Address',
  ENV_SECRET: 'ENV Variable',
  PASSWORD: 'Password',
  EMAIL: 'Email',
  PHONE: 'Phone',
  PRIVATE_IP: 'Private IP',
};

function showPIIRedaction(data) {
  const feed = document.getElementById('securityFeed');
  if (!feed) return;
  const ph = feed.querySelector('.feed-placeholder');
  if (ph) ph.remove();

  const typeLabel = PII_TYPE_LABELS[data.type] || data.type;

  const entry = document.createElement('div');
  entry.className = 'sec-entry pii-redacted';
  entry.innerHTML = `
    <span class="se-icon">\u{1F6E1}\uFE0F</span>
    <div class="se-body">
      <span class="se-cmd">PII Scrubber: ${escapeHtml(typeLabel)} redacted</span>
      <span class="se-explanation">${data.count} instance(s) removed before sending to AI provider</span>
      ${data.preview !== '[hidden]' ? `<div class="se-meta"><span class="se-alternative">Preview: ${escapeHtml(data.preview)}</span></div>` : ''}
    </div>
  `;
  feed.appendChild(entry);
  feed.scrollTop = feed.scrollHeight;

  // Also update PII stats panel on settings page
  const statsEl = document.getElementById('piiStats');
  if (statsEl) {
    statsEl.style.display = 'block';
    const existing = statsEl.querySelector(`[data-pii="${data.type}"]`);
    if (existing) {
      const countEl = existing.querySelector('.pii-count');
      if (countEl) countEl.textContent = String(Number(countEl.textContent) + data.count);
    } else {
      const badge = document.createElement('span');
      badge.className = 'pii-badge';
      badge.dataset.pii = data.type;
      badge.innerHTML = `\u{1F6E1}\uFE0F ${escapeHtml(typeLabel)}: <strong class="pii-count">${data.count}</strong>`;
      statsEl.appendChild(badge);
    }
  }
}

// ===== Injection Detection Display =====

function showInjectionDetected(data) {
  const feed = document.getElementById('securityFeed');
  if (!feed) return;
  const ph = feed.querySelector('.feed-placeholder');
  if (ph) ph.remove();

  const detections = data.detections || [];
  const categories = detections.map(d => d.category).join(', ');
  const severity = detections.some(d => d.severity === 'block') ? 'block' : 'warn';

  const entry = document.createElement('div');
  entry.className = `sec-entry injection-detected severity-${severity}`;
  entry.innerHTML = `
    <span class="se-icon">${severity === 'block' ? '\u{1F6A8}' : '\u{26A0}\uFE0F'}</span>
    <div class="se-body">
      <span class="se-cmd">Prompt Injection ${severity === 'block' ? 'BLOCKED' : 'WARNING'}: ${escapeHtml(data.tool || 'unknown')}</span>
      <span class="se-explanation">${escapeHtml(categories)}</span>
      ${detections.map(d => `<div class="se-meta"><span class="se-alternative">${escapeHtml(d.reason)} — "${escapeHtml((d.fragment || '').slice(0, 60))}"</span></div>`).join('')}
    </div>
  `;
  feed.appendChild(entry);
  feed.scrollTop = feed.scrollHeight;
}

// ===== Output Leak Detection Display =====

function showOutputLeak(data) {
  const feed = document.getElementById('securityFeed');
  if (!feed) return;
  const ph = feed.querySelector('.feed-placeholder');
  if (ph) ph.remove();

  const leak = data.leak || {};
  const severityIcon = leak.severity === 'critical' ? '\u{1F6A8}' : leak.severity === 'high' ? '\u{26A0}\uFE0F' : '\u{1F50D}';

  const entry = document.createElement('div');
  entry.className = `sec-entry output-leak severity-${leak.severity || 'medium'}`;
  entry.innerHTML = `
    <span class="se-icon">${severityIcon}</span>
    <div class="se-body">
      <span class="se-cmd">OUTPUT LEAK: ${escapeHtml(leak.type || 'unknown')}</span>
      <span class="se-explanation">${escapeHtml(leak.reason || data.content || '')}</span>
      <div class="se-meta"><span class="se-alternative">Severity: ${escapeHtml(leak.severity || 'unknown').toUpperCase()}</span></div>
    </div>
  `;
  feed.appendChild(entry);
  feed.scrollTop = feed.scrollHeight;
}

// ===== Theme Toggle =====

function initTheme() {
  const saved = localStorage.getItem('taskpilot-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    updateThemeIcon('light');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  if (next === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('taskpilot-theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggle');
  if (btn) btn.innerHTML = theme === 'light' ? '\u2600' : '\u263e';
}

document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
initTheme();

// ===== Init: Fetch session token, then load skills + settings =====
fetchSessionToken().then(() => {
  loadSkills().then(() => {
    loadSavedSettings().then(() => {
      // Re-render skill grid with restored selection
      renderSkillGrid();
    });
  });
});

// ===== Page Navigation =====
function goToPage(n) {
  currentPage = n;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page${n}`).classList.add('active');

  document.querySelectorAll('.step').forEach(s => {
    const sn = parseInt(s.dataset.step);
    s.classList.remove('active', 'done');
    if (sn === n) s.classList.add('active');
    else if (sn < n) s.classList.add('done');
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== Provider + Model Selection =====
const providerBtns = document.querySelectorAll('.provider-btn');
const modelSelect = document.getElementById('model');
const apiKeyInput = document.getElementById('apiKey');
const keyHint = document.getElementById('keyHint');
const keyLink = document.getElementById('keyLink');
const keyLinkLabel = document.getElementById('keyLinkLabel');

function populateModels(provider) {
  const models = MODEL_CATALOG[provider] || [];
  modelSelect.innerHTML = '';
  modelSelect.style.display = '';

  // Remove any leftover text input
  const textInput = modelSelect.parentElement.querySelector('#model-text');
  if (textInput) textInput.remove();

  models.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (i === 0) opt.selected = true;
    modelSelect.appendChild(opt);
  });

  // If no models, show a text input as fallback
  if (models.length === 0) {
    modelSelect.style.display = 'none';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.id = 'model-text';
    inp.placeholder = 'Enter model name...';
    modelSelect.parentElement.appendChild(inp);
  }

  // Update key button + hint
  const info = PROVIDER_KEY_LINKS[provider] || {};
  if (info.url) {
    keyLink.href = info.url;
    keyLink.style.display = '';
    keyLinkLabel.textContent = info.label;
    keyHint.style.display = '';
  } else {
    keyLink.style.display = 'none';
    keyHint.innerHTML = `<em>${info.label || ''}</em>`;
  }
}

providerBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    providerBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedProvider = btn.dataset.provider;
    selectedBaseUrl = btn.dataset.url;
    populateModels(selectedProvider);

    if (selectedProvider === 'ollama') {
      apiKeyInput.value = 'ollama';
    } else if (apiKeyInput.value === 'ollama') {
      apiKeyInput.value = '';
    }
  });
});

populateModels('openai');

// ===== Test API Key =====
const testKeyBtn = document.getElementById('testKeyBtn');
const testKeyResult = document.getElementById('testKeyResult');

testKeyBtn?.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) return alert('Enter an API key first');

  testKeyBtn.className = 'btn-test-key testing';
  testKeyBtn.textContent = '...';
  testKeyResult.style.display = 'none';

  try {
    const resp = await fetch('/api/test-key', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key, baseUrl: selectedBaseUrl, model: getSelectedModel() }),
    });
    const data = await resp.json();

    testKeyResult.style.display = '';
    if (data.ok) {
      testKeyBtn.className = 'btn-test-key ok';
      testKeyBtn.textContent = 'OK';
      testKeyResult.className = 'hint ok';
      testKeyResult.textContent = `Key valid (${data.rawKey}). Model: ${data.model}, reply: "${data.reply}"`;

    } else {
      testKeyBtn.className = 'btn-test-key fail';
      testKeyBtn.textContent = 'Fail';
      testKeyResult.className = 'hint fail';
      testKeyResult.textContent = `${data.error} | key=${data.rawKey} len=${data.keyLength} url=${data.url}`;
    }
  } catch (err) {
    testKeyBtn.className = 'btn-test-key fail';
    testKeyBtn.textContent = 'Fail';
    testKeyResult.style.display = '';
    testKeyResult.className = 'hint fail';
    testKeyResult.textContent = 'Connection error: ' + err.message;
  }

  setTimeout(() => {
    testKeyBtn.className = 'btn-test-key';
    testKeyBtn.textContent = 'Test';
  }, 5000);
});

// ===== Render Connection Info =====
function renderConnectionInfo(channel) {
  const el = document.getElementById(`ch-${channel}-conn`);
  if (!el) return;
  const info = CHANNEL_CONNECTION_INFO[channel];
  if (!info) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <span class="ch-conn-icon">\u{1F50C}</span>
    <div class="ch-conn-body">
      <div class="ch-conn-method">${info.method}</div>
      <div class="ch-conn-endpoint">${info.endpoint}</div>
      <div class="ch-conn-note">${info.note}</div>
    </div>
  `;
}

// ===== Render Inline Permissions =====
function renderInlinePermissions(channel) {
  const el = document.getElementById(`ch-${channel}-perms`);
  if (!el) return;
  const actions = CHANNEL_ACTIONS[channel];
  if (!actions || actions.length === 0) { el.innerHTML = ''; return; }

  const hasDestructive = actions.some(a => a.destructive);

  let html = `<div class="ch-perms-label">\u{1F6E1} Permissions</div><div class="ch-perms-grid">`;
  actions.forEach(a => {
    const cls = a.destructive ? 'perm-action destructive' : 'perm-action';
    const tag = a.destructive ? '<span class="perm-action-destructive-tag">Destructive</span>' : '';
    html += `
      <label class="${ cls }">
        <input type="checkbox" ${ a.destructive ? '' : 'checked' } data-channel="${channel}" data-action="${a.id}">
        <span class="perm-action-icon">${a.icon}</span>
        <div class="perm-action-body">
          <div class="perm-action-label">${a.label}${tag}</div>
          <div class="perm-action-desc">${a.description}</div>
        </div>
      </label>
    `;
  });
  html += '</div>';

  if (hasDestructive) {
    html += `
      <div class="security-warning">
        <span class="security-warning-icon">\u{26A0}\uFE0F</span>
        <div>
          <strong>Warning:</strong> Do not grant permissions you do not understand.
          Some actions (e.g., deleting messages, running commands, sending emails) may cause
          <strong>irreversible data loss</strong>. Destructive permissions are unchecked by default.
        </div>
      </div>
    `;
  }

  el.innerHTML = html;
}

// ===== Channel Toggle (only one channel at a time) =====
const allChannelCards = document.querySelectorAll('.channel-card');

function selectChannel(activeCard) {
  // Deselect all other channels
  allChannelCards.forEach(card => {
    const cb = card.querySelector(':scope > .channel-header > input[type="checkbox"]');
    const body = card.querySelector(':scope > .channel-body');
    if (!cb || !body) return;

    if (card === activeCard) {
      cb.checked = true;
      card.classList.add('enabled');
      body.classList.add('open');
      renderConnectionInfo(card.dataset.channel);
      renderInlinePermissions(card.dataset.channel);
    } else {
      cb.checked = false;
      card.classList.remove('enabled');
      body.classList.remove('open');
    }
  });
  updateChannelSkillWarnings();
}

// Show warning if selected channel requires a skill that isn't currently selected
function updateChannelSkillWarnings() {
  const tgWarning = document.getElementById('tg-skill-warning');
  if (!tgWarning) return;
  const tgChecked = document.getElementById('ch-telegram')?.checked;
  // Telegram only works with sys-admin skill
  if (tgChecked && selectedSkill !== 'sys-admin') {
    tgWarning.style.display = 'block';
  } else {
    tgWarning.style.display = 'none';
  }
}

function deselectAllChannels() {
  allChannelCards.forEach(card => {
    const cb = card.querySelector(':scope > .channel-header > input[type="checkbox"]');
    const body = card.querySelector(':scope > .channel-body');
    if (!cb || !body) return;
    cb.checked = false;
    card.classList.remove('enabled');
    body.classList.remove('open');
  });
}

allChannelCards.forEach(card => {
  const checkbox = card.querySelector(':scope > .channel-header > input[type="checkbox"]');
  const header = card.querySelector(':scope > .channel-header');
  if (!checkbox || !header) return;

  // Prevent checkbox click from bubbling to header
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Header click — select this channel (or deselect if already selected)
  header.addEventListener('click', () => {
    if (checkbox.checked) {
      deselectAllChannels();
    } else {
      selectChannel(card);
    }
  });

  // Direct checkbox change (click on checkbox itself)
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      selectChannel(card);
    } else {
      deselectAllChannels();
    }
  });
});

// ===== Page 1 -> Page 2 =====
document.getElementById('btnNext1').addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();
  const model = getSelectedModel();

  if (!apiKey && selectedProvider !== 'ollama') return alert('Enter API Key');
  if (!model) return alert('Select a model');

  // Save settings to DB (non-blocking)
  saveSettings();

  // Build access policies for enabled channels
  buildAccessPolicies();
  goToPage(2);
});

function getSelectedModel() {
  const textInput = modelSelect.parentElement.querySelector('#model-text');
  if (textInput) return textInput.value.trim();
  return modelSelect.value;
}

// ===== Build Access Policy Summary (read-only, Page 2) =====
function buildAccessPolicies() {
  const container = document.getElementById('accessPolicies');
  container.innerHTML = '';

  const enabledChannels = getEnabledChannels();
  enabledChannels.forEach(ch => {
    const actions = CHANNEL_ACTIONS[ch] || [];
    if (actions.length === 0) return;

    const icon = PLATFORM_ICONS[ch] || PLATFORM_ICONS.default;

    // Read current permission state from Page 1 inline checkboxes
    const permsEl = document.getElementById(`ch-${ch}-perms`);
    const allowed = [];
    const denied = [];
    if (permsEl) {
      permsEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const action = actions.find(a => a.id === cb.dataset.action);
        if (!action) return;
        if (cb.checked) allowed.push(action);
        else denied.push(action);
      });
    }

    const allowedHtml = allowed.map(a => `<span class="access-summary-allowed">${a.icon} ${a.label}</span>`).join(', ');
    const deniedHtml = denied.length > 0
      ? `<span class="access-summary-denied">\u2717 Denied: ${denied.map(a => a.label).join(', ')}</span>`
      : '';

    const item = document.createElement('div');
    item.className = 'access-summary-item';
    item.innerHTML = `
      <span class="ch-icon">${icon}</span>
      <strong>${ch.charAt(0).toUpperCase() + ch.slice(1)}</strong>
      <span style="flex:1">${allowedHtml}</span>
      ${deniedHtml}
    `;
    container.appendChild(item);
  });

  if (enabledChannels.length === 0) {
    container.innerHTML = '<div class="feed-placeholder">No channels enabled. Go back and enable at least one.</div>';
  }
}

function getEnabledChannels() {
  const channels = [];
  document.querySelectorAll('.channel-card').forEach(card => {
    const cb = card.querySelector(':scope > .channel-header > input[type="checkbox"]');
    if (cb && cb.checked) channels.push(card.dataset.channel);
  });
  return channels;
}

// ===== Page 2 -> Back =====
document.getElementById('btnBack2').addEventListener('click', () => goToPage(1));

// ===== Page 3 -> Back =====
document.getElementById('btnBack3').addEventListener('click', () => goToPage(2));

// ===== Permissions toggle =====
document.getElementById('permToggle').addEventListener('click', () => {
  const grid = document.getElementById('permGrid');
  const arrow = document.querySelector('#permToggle .collapse-arrow');
  if (grid.style.display === 'none') { grid.style.display = 'flex'; arrow.classList.add('open'); }
  else { grid.style.display = 'none'; arrow.classList.remove('open'); }
});

// ===== Collect all config and start =====
document.getElementById('btnStart').addEventListener('click', async () => {
  const goal = document.getElementById('goal').value.trim();
  if (!goal) return alert('Enter a goal for the agent');

  const config = collectConfig();
  goToPage(3);
  await runAgent(config);
});

function collectConfig() {
  return {
    baseUrl: selectedBaseUrl,
    apiKey: apiKeyInput.value.trim(),
    model: getSelectedModel(),
    maxSteps: parseInt(document.getElementById('maxSteps').value) || 15,
    maxTokens: parseInt(document.getElementById('maxTokens').value) || 0,
    goal: document.getElementById('goal').value.trim(),
    systemPrompt: document.getElementById('systemPrompt').value.trim(),
    agentName: document.getElementById('agentName').value.trim() || 'TaskPilot',
    channels: collectChannelCredentials(),
    accessPolicy: collectAccessPolicy(),
    skill: selectedSkill,
    explanationLanguage: document.getElementById('explanationLanguage')?.value || 'English',
  };
}

function collectChannelCredentials() {
  const channels = {};

  if (document.getElementById('ch-telegram')?.checked) {
    channels.telegram = {
      botToken: document.getElementById('tg-token')?.value.trim(),
      botUsername: document.getElementById('tg-username')?.value.trim(),
      allowFrom: document.getElementById('tg-allow')?.value.trim(),
    };
  }
  if (document.getElementById('ch-discord')?.checked) {
    channels.discord = {
      botToken: document.getElementById('dc-token')?.value.trim(),
      serverId: document.getElementById('dc-server')?.value.trim(),
    };
  }
  if (document.getElementById('ch-whatsapp')?.checked) {
    channels.whatsapp = {
      phoneNumberId: document.getElementById('wa-phone')?.value.trim(),
      accessToken: document.getElementById('wa-token')?.value.trim(),
    };
  }
  if (document.getElementById('ch-slack')?.checked) {
    channels.slack = {
      botToken: document.getElementById('sl-token')?.value.trim(),
      signingSecret: document.getElementById('sl-secret')?.value.trim(),
    };
  }
  if (document.getElementById('ch-browser')?.checked) {
    channels.browser = {
      mode: document.getElementById('br-mode')?.value || 'headless',
    };
  }
  if (document.getElementById('ch-terminal')?.checked) {
    channels.terminal = {
      cwd: document.getElementById('tm-cwd')?.value.trim(),
      shell: document.getElementById('tm-shell')?.value || 'powershell',
    };
  }
  if (document.getElementById('ch-email')?.checked) {
    channels.email = {
      host: document.getElementById('em-host')?.value.trim(),
      port: parseInt(document.getElementById('em-port')?.value) || 587,
      user: document.getElementById('em-user')?.value.trim(),
      pass: document.getElementById('em-pass')?.value.trim(),
    };
  }

  return channels;
}

function collectAccessPolicy() {
  const policy = {};
  // Read from Page 1 inline permission checkboxes
  const enabledChannels = getEnabledChannels();
  enabledChannels.forEach(ch => {
    const permsEl = document.getElementById(`ch-${ch}-perms`);
    if (!permsEl) return;
    permsEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const action = cb.dataset.action;
      if (!action) return;
      if (!policy[ch]) policy[ch] = { allowed: [], denied: [] };
      if (cb.checked) policy[ch].allowed.push(action);
      else policy[ch].denied.push(action);
    });
  });
  return policy;
}

// ===== Dashboard helpers =====
const statusDot = document.querySelector('#statusIndicator .status-dot');
const statusLabel = document.getElementById('statusLabel');
const stepCounter = document.getElementById('stepCounter');
const workspaceEl = document.getElementById('workspaceChannels');
const permGrid = document.getElementById('permGrid');
const activityFeed = document.getElementById('activityFeed');
const thoughtsFeed = document.getElementById('thoughtsFeed');
const answerCard = document.getElementById('answerCard');
const answerText = document.getElementById('answerText');
const summaryCard = document.getElementById('summaryCard');
const summaryContent = document.getElementById('summaryContent');

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function truncate(str, max) {
  if (!str) return '';
  const s = typeof str === 'string' ? str : JSON.stringify(str);
  return s.length > max ? s.slice(0, max) + '\u2026' : s;
}

function setStatus(state, label) {
  statusDot.className = `status-dot ${state}`;
  statusLabel.textContent = label;
}

function setStep(step, max) {
  stepCounter.textContent = `Step ${step} / ${max}`;
}

function resetDashboard() {
  setStatus('idle', 'Idle');
  setStep(0, currentMaxSteps);
  workspaceState.clear();
  workspaceEl.innerHTML = '<div class="feed-placeholder">Active connections will appear here when the agent starts</div>';
  permGrid.innerHTML = '';
  permGrid.style.display = 'none';
  activityFeed.innerHTML = '<div class="feed-placeholder">Events will appear here in real time</div>';
  thoughtsFeed.innerHTML = '<div class="feed-placeholder">Agent thoughts will appear here</div>';
  answerCard.style.display = 'none';
  summaryCard.style.display = 'none';
  // Clear security feed
  const secFeed = document.getElementById('securityFeed');
  if (secFeed) secFeed.innerHTML = '<div class="feed-placeholder">Security decisions will appear here</div>';
  // Close approval modal if open
  hideApprovalModal();
}

// ===== Workspace rendering =====
function updateWorkspace(ws) {
  if (!ws || !ws.platform) return;
  const ph = workspaceEl.querySelector('.feed-placeholder');
  if (ph) ph.remove();

  const existing = workspaceState.get(ws.platform);
  workspaceState.set(ws.platform, {
    ...existing,
    platform: ws.platform,
    platformLabel: ws.platformLabel || ws.platform,
    icon: ws.icon || 'default',
    location: ws.location || (existing?.location) || '',
    status: ws.status || 'Active',
    isActive: ws.status !== 'Done',
  });
  renderWorkspace();
}

function markWorkspaceDone(platform) {
  const ch = workspaceState.get(platform);
  if (ch) { ch.isActive = false; ch.status = 'Done'; renderWorkspace(); }
}

function markAllWorkspaceDone() {
  workspaceState.forEach(ch => { ch.isActive = false; ch.status = 'Done'; });
  renderWorkspace();
}

function renderWorkspace() {
  workspaceEl.innerHTML = '';
  workspaceState.forEach(ch => {
    const div = document.createElement('div');
    div.className = `ws-channel ${ch.isActive ? 'active' : 'done'}`;
    const icon = PLATFORM_ICONS[ch.icon] || PLATFORM_ICONS[ch.platform] || PLATFORM_ICONS.default;
    const dotClass = ch.isActive ? 'pulsing' : 'done-dot';
    const statusClass = ch.isActive ? 'active-status' : 'done-status';
    div.innerHTML = `
      <div class="ws-icon ${ch.icon || ch.platform || 'default'}">${icon}</div>
      <div class="ws-body">
        <div class="ws-platform">${ch.platformLabel}</div>
        <div class="ws-location" title="${ch.location || ''}">${ch.location || '\u2014'}</div>
        <div class="ws-status ${statusClass}">${ch.status}</div>
      </div>
      <div class="ws-activity-dot ${dotClass}"></div>
    `;
    workspaceEl.appendChild(div);
  });
}

// ===== Permissions rendering =====
function renderPermissions(data) {
  permGrid.innerHTML = '';
  data.tools.forEach(t => {
    const div = document.createElement('div');
    div.className = `perm-item ${t.enabled ? 'allowed' : 'denied'}`;
    div.innerHTML = `<span>${t.enabled ? '\u2713' : '\u2717'}</span><strong>${t.name}</strong><span style="font-size:0.65rem;color:var(--text-dim);margin-left:4px">${t.platformLabel}</span>`;
    permGrid.appendChild(div);
  });
  const info = document.createElement('div');
  info.className = 'perm-principal';
  info.innerHTML = `Principal: <strong>${data.principal.id}</strong> | Model: ${data.provider.model} | Max steps: ${data.limits.maxSteps}`;
  permGrid.appendChild(info);
}

// ===== Activity + Thoughts =====
function addActivity(event) {
  const ph = activityFeed.querySelector('.feed-placeholder');
  if (ph) ph.remove();

  const div = document.createElement('div');
  div.className = `feed-entry ${event.type}`;
  const time = `<span class="fe-time">${formatTime(event.timestamp)}</span>`;
  let icon = '', body = '';
  const wsIcon = event.workspace ? (PLATFORM_ICONS[event.workspace.icon] || '') + ' ' : '';

  switch (event.type) {
    case 'thinking':
      icon = '\u{1F4AD}'; body = `<span class="fe-body">${truncate(event.content, 200)}</span>`; break;
    case 'tool_call':
      icon = '\u{1F527}'; body = `<span class="fe-body">${wsIcon}Calling <span class="fe-tool">${event.tool}</span><span class="fe-args">${event.workspace?.location || truncate(JSON.stringify(event.args), 120)}</span></span>`; break;
    case 'tool_result':
      icon = '\u2705'; body = `<span class="fe-body">${wsIcon}<span class="fe-tool">${event.tool}</span> returned<span class="fe-result">${truncate(event.content || event.result, 200)}</span></span>`; break;
    case 'tool_denied':
      icon = '\u{1F6AB}'; body = `<span class="fe-body"><span class="fe-tool">${event.tool}</span> DENIED: ${event.error}</span>`; break;
    case 'answer':
      icon = '\u2714\uFE0F'; body = `<span class="fe-body">Final answer ready</span>`; break;
    case 'status':
      icon = '\u2139\uFE0F'; body = `<span class="fe-body">${event.content}</span>`; break;
    case 'error':
      icon = '\u274C'; body = `<span class="fe-body">${event.error || event.content}</span>`; break;
    default:
      icon = '\u2022'; body = `<span class="fe-body">${JSON.stringify(event)}</span>`;
  }
  div.innerHTML = `${time}<span class="fe-icon">${icon}</span>${body}`;
  activityFeed.appendChild(div);
  activityFeed.scrollTop = activityFeed.scrollHeight;
}

function addThought(step, content) {
  const ph = thoughtsFeed.querySelector('.feed-placeholder');
  if (ph) ph.remove();
  const div = document.createElement('div');
  div.className = 'thought-bubble';
  div.innerHTML = `<div class="tb-step">Step ${step}</div>${content}`;
  thoughtsFeed.appendChild(div);
  thoughtsFeed.scrollTop = thoughtsFeed.scrollHeight;
}

function showAnswer(text) { answerCard.style.display = 'block'; answerText.textContent = text; }

function showSummary(data) {
  summaryCard.style.display = 'block';
  const platforms = [...workspaceState.values()].map(ch => ch.platformLabel).join(', ') || '\u2014';
  summaryContent.innerHTML = `
    <div class="summary-item"><span class="si-label">Status</span><span class="si-value ${data.done ? 'success' : 'fail'}">${data.done ? 'Completed' : 'Stopped'}</span></div>
    <div class="summary-item"><span class="si-label">Steps</span><span class="si-value">${data.steps} / ${data.maxSteps}</span></div>
    <div class="summary-item"><span class="si-label">Platforms</span><span class="si-value">${platforms}</span></div>
    <div class="summary-item"><span class="si-label">Run ID</span><span class="si-value">${data.runId || '\u2014'}</span></div>
  `;
}

// ===== Run Agent via SSE =====
async function runAgent(config) {
  currentMaxSteps = config.maxSteps;
  resetDashboard();
  setStatus('running', 'Starting...');

  const btnStart = document.getElementById('btnStart');
  btnStart.disabled = true;
  btnStart.textContent = 'Running...';

  try {
    const response = await fetch('/api/run', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Server error');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = '';
      let currentEvent = '', currentData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) currentEvent = line.slice(7);
        else if (line.startsWith('data: ')) currentData = line.slice(6);
        else if (line === '' && currentEvent && currentData) {
          handleSSE(currentEvent, currentData);
          currentEvent = ''; currentData = '';
        } else if (line !== '') buffer += line + '\n';
      }
      if (currentEvent || currentData) {
        if (currentEvent) buffer += `event: ${currentEvent}\n`;
        if (currentData) buffer += `data: ${currentData}\n`;
      }
    }
  } catch (err) {
    setStatus('error', 'Error: ' + err.message);
    addActivity({ type: 'error', timestamp: new Date().toISOString(), error: err.message, step: 0 });
  } finally {
    btnStart.disabled = false;
    btnStart.textContent = 'Start Agent \u2192';
  }
}

function handleSSE(event, dataStr) {
  let data;
  try { data = JSON.parse(dataStr); } catch { return; }

  switch (event) {
    case 'permissions': renderPermissions(data); setStep(0, data.limits.maxSteps); break;
    case 'step': handleStepEvent(data); break;
    case 'approval_needed':
      showApprovalModal(data);
      setStatus('running', 'Waiting for approval...');
      addActivity({ type: 'status', timestamp: new Date().toISOString(), content: `\u26a0\ufe0f Approval needed for: ${data.args?.command || data.toolName}`, step: 0 });
      break;
    case 'command_explained':
      showCommandExplanation(data);
      break;
    case 'approval_analysis':
      updateApprovalWithAnalysis(data);
      break;
    case 'context_compressed':
      showContextCompression(data);
      break;
    case 'pii_redacted':
      showPIIRedaction(data);
      break;
    case 'injection_detected':
      showInjectionDetected(data);
      break;
    case 'output_leak':
      showOutputLeak(data);
      break;
    case 'done':
      setStatus('done', data.done ? 'Completed' : 'Stopped (limit)');
      markAllWorkspaceDone();
      hideApprovalModal();
      if (data.finalAnswer) showAnswer(data.finalAnswer);
      showSummary(data);
      break;
    case 'error':
      setStatus('error', 'Error');
      hideApprovalModal();
      addActivity({ type: 'error', timestamp: new Date().toISOString(), error: data.error, step: 0 });
      break;
  }
}

function handleStepEvent(ev) {
  setStep(ev.step, currentMaxSteps);
  if (ev.workspace) updateWorkspace(ev.workspace);

  switch (ev.type) {
    case 'thinking':
      setStatus('running', `Step ${ev.step}: Thinking...`);
      if (ev.content && ev.content !== 'LLM is processing...') addThought(ev.step, ev.content);
      addActivity(ev);
      break;
    case 'tool_call':
      setStatus('running', `Step ${ev.step}: ${ev.workspace?.platformLabel || ev.tool} \u2014 ${ev.workspace?.status || 'Calling...'}`);
      addActivity(ev);
      break;
    case 'tool_result':
      setStatus('running', `Step ${ev.step}: Got result from ${ev.workspace?.platformLabel || ev.tool}`);
      if (ev.workspace) markWorkspaceDone(ev.workspace.platform);
      addActivity(ev);
      break;
    case 'tool_denied':
      setStatus('running', `Step ${ev.step}: Access denied`);
      addActivity(ev);
      // Add to security feed
      addSecurityEntry(
        ev.error?.includes('[SECURITY') ? 'blocked' : 'warned',
        ev.error?.includes('[SECURITY') ? '\u{1F6D1} Blocked' : '\u26a0\ufe0f Denied',
        ev.args?.command || ev.tool || '',
        ev.error || ''
      );
      break;
    case 'answer':
      setStatus('running', 'Final answer...');
      addActivity(ev);
      break;
    case 'status':
      setStatus('running', ev.content);
      addActivity(ev);
      break;
    case 'error':
      addActivity(ev);
      break;
  }
}
