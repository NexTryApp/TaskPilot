// ============================================================
// TaskPilot Web UI — Multi-page SPA
// Page 1: Setup (Provider + Channels)
// Page 2: Agent Config (Prompt, Permissions, Goal)
// Page 3: Live Dashboard (SSE streaming)
// ============================================================

// ===== Model catalogs per provider =====
const MODEL_CATALOG = {
  openai:     ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini', 'o4-mini'],
  anthropic:  ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3.5-haiku-20241022'],
  gemini:     ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
  deepseek:   ['deepseek-chat', 'deepseek-reasoner'],
  groq:       ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  mistral:    ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
  together:   ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
  xai:        ['grok-3', 'grok-3-mini', 'grok-2'],
  moonshot:   ['kimi-k2', 'moonshot-v1-128k', 'moonshot-v1-32k'],
  minimax:    ['MiniMax-M2.1', 'MiniMax-Text-01'],
  venice:     ['venice/llama-3.3-70b', 'venice/claude-opus-45', 'venice/deepseek-r1-671b'],
  qwen:       ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen2.5-72b-instruct'],
  glm:        ['glm-4-plus', 'glm-4-flash', 'glm-4'],
  bedrock:    ['anthropic.claude-sonnet-4-20250514-v1:0', 'anthropic.claude-3-haiku-20240307-v1:0', 'meta.llama3-70b-instruct-v1:0'],
  openrouter: ['openai/gpt-4o', 'openai/gpt-4o-mini', 'anthropic/claude-sonnet-4', 'anthropic/claude-3.5-haiku', 'google/gemini-2.0-flash', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct'],
  ollama:     ['llama3', 'llama3.1', 'mistral', 'qwen2.5', 'gemma2', 'phi3', 'codellama', 'deepseek-r1'],
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
  moonshot:  { url: 'https://platform.moonshot.cn/console/api-keys', label: 'platform.moonshot.cn' },
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

  // Update key hint
  const info = PROVIDER_KEY_LINKS[provider] || {};
  if (info.url) {
    keyHint.innerHTML = `Get key at <a href="${info.url}" target="_blank">${info.label}</a>`;
  } else {
    keyHint.textContent = info.label || '';
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

// ===== Channel Toggle =====
function applyChannelState(card, ch, checkbox, body) {
  if (checkbox.checked) {
    card.classList.add('enabled');
    body.classList.add('open');
    renderConnectionInfo(ch);
    renderInlinePermissions(ch);
  } else {
    card.classList.remove('enabled');
    body.classList.remove('open');
  }
}

document.querySelectorAll('.channel-card').forEach(card => {
  const ch = card.dataset.channel;
  const checkbox = card.querySelector(':scope > .channel-header > input[type="checkbox"]');
  const body = card.querySelector(':scope > .channel-body');
  const header = card.querySelector(':scope > .channel-header');
  if (!checkbox || !body || !header) return;

  // Prevent checkbox click from bubbling to header (avoids double-toggle)
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Header click toggles the checkbox (except when clicking inside body area)
  header.addEventListener('click', () => {
    checkbox.checked = !checkbox.checked;
    applyChannelState(card, ch, checkbox, body);
  });

  // Also handle programmatic / direct checkbox changes
  checkbox.addEventListener('change', () => {
    applyChannelState(card, ch, checkbox, body);
  });

  // Initialize — apply state for pre-checked channels (browser, terminal)
  applyChannelState(card, ch, checkbox, body);
});

// ===== Page 1 -> Page 2 =====
document.getElementById('btnNext1').addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();
  const model = getSelectedModel();

  if (!apiKey && selectedProvider !== 'ollama') return alert('Enter API Key');
  if (!model) return alert('Select a model');

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
    const cb = card.querySelector('input[type="checkbox"]');
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
      headers: { 'Content-Type': 'application/json' },
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
    case 'done':
      setStatus('done', data.done ? 'Completed' : 'Stopped (limit)');
      markAllWorkspaceDone();
      if (data.finalAnswer) showAnswer(data.finalAnswer);
      showSummary(data);
      break;
    case 'error':
      setStatus('error', 'Error');
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
