// ===== Provider selection =====
const providerBtns = document.querySelectorAll('.provider-btn');
const modelInput = document.getElementById('model');
const apiKeyInput = document.getElementById('apiKey');

const defaultModels = {
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-sonnet-4-20250514',
  mistral: 'mistral-large-latest',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  openrouter: 'openai/gpt-4o-mini',
  ollama: 'llama3',
};

let selectedProvider = 'openai';
let selectedBaseUrl = 'https://api.openai.com/v1';

providerBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    providerBtns.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedProvider = btn.dataset.provider;
    selectedBaseUrl = btn.dataset.url;
    modelInput.value = defaultModels[selectedProvider] || '';
    if (selectedProvider === 'ollama') {
      apiKeyInput.value = 'ollama';
    } else if (apiKeyInput.value === 'ollama') {
      apiKeyInput.value = '';
    }
  });
});

// ===== Dashboard elements =====
const statusDot = document.querySelector('#statusIndicator .status-dot');
const statusLabel = document.getElementById('statusLabel');
const stepCounter = document.getElementById('stepCounter');
const workspaceChannels = document.getElementById('workspaceChannels');
const permGrid = document.getElementById('permGrid');
const permToggle = document.getElementById('permToggle');
const activityFeed = document.getElementById('activityFeed');
const thoughtsFeed = document.getElementById('thoughtsFeed');
const answerCard = document.getElementById('answerCard');
const answerText = document.getElementById('answerText');
const summaryCard = document.getElementById('summaryCard');
const summaryContent = document.getElementById('summaryContent');
const btnStart = document.getElementById('btnStart');

let currentMaxSteps = 10;

// Workspace state: platform → channel data
const workspaceState = new Map();

// Platform icons (emoji)
const platformIcons = {
  telegram: '\u{1F4AC}',
  chrome: '\u{1F310}',
  terminal: '\u{1F4BB}',
  'task-manager': '\u{1F4CB}',
  tasks: '\u{1F4CB}',
  'weather-api': '\u{26C5}',
  api: '\u{26C5}',
  email: '\u{2709}\uFE0F',
  default: '\u{1F50C}',
};

// ===== Permissions toggle =====
permToggle.addEventListener('click', () => {
  const grid = permGrid;
  const arrow = permToggle.querySelector('.collapse-arrow');
  if (grid.style.display === 'none') {
    grid.style.display = 'flex';
    arrow.classList.add('open');
  } else {
    grid.style.display = 'none';
    arrow.classList.remove('open');
  }
});

// ===== Helpers =====
function formatTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
  workspaceChannels.innerHTML = '<div class="feed-placeholder">Active connections will appear here when the agent starts</div>';
  permGrid.innerHTML = '';
  permGrid.style.display = 'none';
  permToggle.querySelector('.collapse-arrow').classList.remove('open');
  activityFeed.innerHTML = '<div class="feed-placeholder">Events will appear here in real time</div>';
  thoughtsFeed.innerHTML = '<div class="feed-placeholder">Agent thoughts will appear here</div>';
  answerCard.style.display = 'none';
  summaryCard.style.display = 'none';
}

// ===== Workspace rendering =====
function updateWorkspace(ws) {
  if (!ws || !ws.platform) return;

  // Remove placeholder
  const ph = workspaceChannels.querySelector('.feed-placeholder');
  if (ph) ph.remove();

  const key = ws.platform;
  const existing = workspaceState.get(key);

  workspaceState.set(key, {
    ...existing,
    platform: ws.platform,
    platformLabel: ws.platformLabel || ws.platform,
    icon: ws.icon || 'default',
    location: ws.location || (existing?.location) || '',
    status: ws.status || 'Active',
    isActive: ws.status !== 'Done',
    lastUpdate: new Date().toISOString(),
  });

  renderWorkspace();
}

function markWorkspaceDone(platform) {
  const ch = workspaceState.get(platform);
  if (ch) {
    ch.isActive = false;
    ch.status = 'Done';
    renderWorkspace();
  }
}

function markAllWorkspaceDone() {
  workspaceState.forEach(ch => {
    ch.isActive = false;
    ch.status = 'Done';
  });
  renderWorkspace();
}

function renderWorkspace() {
  workspaceChannels.innerHTML = '';

  workspaceState.forEach((ch) => {
    const div = document.createElement('div');
    const stateClass = ch.isActive ? 'active' : 'done';
    div.className = `ws-channel ${stateClass}`;

    const iconClass = ch.icon || 'default';
    const icon = platformIcons[iconClass] || platformIcons.default;
    const dotClass = ch.isActive ? 'pulsing' : 'done-dot';
    const statusClass = ch.isActive ? 'active-status' : 'done-status';

    div.innerHTML = `
      <div class="ws-icon ${iconClass}">${icon}</div>
      <div class="ws-body">
        <div class="ws-platform">${ch.platformLabel}</div>
        <div class="ws-location" title="${ch.location || ''}">${ch.location || '\u2014'}</div>
        <div class="ws-status ${statusClass}">${ch.status}</div>
      </div>
      <div class="ws-activity-dot ${dotClass}"></div>
    `;

    workspaceChannels.appendChild(div);
  });
}

// ===== Permissions =====
function renderPermissions(data) {
  permGrid.innerHTML = '';
  data.tools.forEach((t) => {
    const div = document.createElement('div');
    div.className = `perm-item ${t.enabled ? 'allowed' : 'denied'}`;
    div.innerHTML = `
      <span class="perm-icon">${t.enabled ? '\u2713' : '\u2717'}</span>
      <strong>${t.name}</strong>
      <span class="perm-ctx">${t.platformLabel}</span>
    `;
    permGrid.appendChild(div);
  });

  const info = document.createElement('div');
  info.className = 'perm-principal';
  info.innerHTML = `Principal: <strong>${data.principal.id}</strong> | Roles: ${data.principal.roles.join(', ')} | Model: ${data.provider.model} | Max steps: ${data.limits.maxSteps}`;
  permGrid.appendChild(info);
}

// ===== Activity feed =====
function addActivity(event) {
  const ph = activityFeed.querySelector('.feed-placeholder');
  if (ph) ph.remove();

  const div = document.createElement('div');
  div.className = `feed-entry ${event.type}`;

  const time = `<span class="fe-time">${formatTime(event.timestamp)}</span>`;
  let icon = '';
  let body = '';

  switch (event.type) {
    case 'thinking':
      icon = '\u{1F4AD}';
      body = `<span class="fe-body">${truncate(event.content, 200)}</span>`;
      break;
    case 'tool_call': {
      const wsIcon = event.workspace ? (platformIcons[event.workspace.icon] || '') + ' ' : '';
      icon = '\u{1F527}';
      body = `<span class="fe-body">
        ${wsIcon}Calling <span class="fe-tool">${event.tool}</span>
        ${event.workspace?.location ? `<span class="fe-args">${event.workspace.location}</span>` : ''}
        <span class="fe-args">${truncate(JSON.stringify(event.args), 120)}</span>
      </span>`;
      break;
    }
    case 'tool_result': {
      const wsIcon2 = event.workspace ? (platformIcons[event.workspace.icon] || '') + ' ' : '';
      icon = '\u2705';
      body = `<span class="fe-body">
        ${wsIcon2}<span class="fe-tool">${event.tool}</span> returned
        <span class="fe-result">${truncate(event.content || event.result, 200)}</span>
      </span>`;
      break;
    }
    case 'tool_denied':
      icon = '\u{1F6AB}';
      body = `<span class="fe-body"><span class="fe-tool">${event.tool}</span> DENIED: ${event.error}</span>`;
      break;
    case 'answer':
      icon = '\u2714\uFE0F';
      body = `<span class="fe-body">Final answer ready</span>`;
      break;
    case 'status':
      icon = '\u2139\uFE0F';
      body = `<span class="fe-body">${event.content}</span>`;
      break;
    case 'error':
      icon = '\u274C';
      body = `<span class="fe-body">${event.error || event.content}</span>`;
      break;
    default:
      icon = '\u2022';
      body = `<span class="fe-body">${JSON.stringify(event)}</span>`;
  }

  div.innerHTML = `${time}<span class="fe-icon">${icon}</span>${body}`;
  activityFeed.appendChild(div);
  activityFeed.scrollTop = activityFeed.scrollHeight;
}

// ===== Thoughts =====
function addThought(step, content) {
  const ph = thoughtsFeed.querySelector('.feed-placeholder');
  if (ph) ph.remove();

  const div = document.createElement('div');
  div.className = 'thought-bubble';
  div.innerHTML = `<div class="tb-step">Step ${step}</div>${content}`;
  thoughtsFeed.appendChild(div);
  thoughtsFeed.scrollTop = thoughtsFeed.scrollHeight;
}

// ===== Final answer =====
function showAnswer(text) {
  answerCard.style.display = 'block';
  answerText.textContent = text;
}

// ===== Summary =====
function showSummary(data) {
  summaryCard.style.display = 'block';
  const platforms = [...workspaceState.values()].map(ch => ch.platformLabel).join(', ') || '\u2014';
  summaryContent.innerHTML = `
    <div class="summary-item">
      <span class="si-label">Status</span>
      <span class="si-value ${data.done ? 'success' : 'fail'}">${data.done ? 'Completed' : 'Stopped'}</span>
    </div>
    <div class="summary-item">
      <span class="si-label">Steps</span>
      <span class="si-value">${data.steps} / ${data.maxSteps}</span>
    </div>
    <div class="summary-item">
      <span class="si-label">Platforms used</span>
      <span class="si-value">${platforms}</span>
    </div>
    <div class="summary-item">
      <span class="si-label">Run ID</span>
      <span class="si-value">${data.runId || '\u2014'}</span>
    </div>
    <div class="summary-item">
      <span class="si-label">Principal</span>
      <span class="si-value">${data.principalId || '\u2014'}</span>
    </div>
  `;
}

// ===== Start agent (SSE) =====
btnStart.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim();
  const goal = document.getElementById('goal').value.trim();
  const maxSteps = parseInt(document.getElementById('maxSteps').value) || 10;
  const maxTokens = parseInt(document.getElementById('maxTokens').value) || 0;
  currentMaxSteps = maxSteps;

  if (!apiKey && selectedProvider !== 'ollama') return alert('Enter API Key');
  if (!model) return alert('Specify model');
  if (!goal) return alert('Specify agent goal');

  const tools = [];
  document.querySelectorAll('#toolsList input[type="checkbox"]:checked').forEach((cb) => {
    tools.push(cb.dataset.tool);
  });

  resetDashboard();
  setStatus('running', 'Starting...');
  btnStart.disabled = true;
  btnStart.textContent = 'Running...';

  try {
    const response = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: selectedBaseUrl, apiKey, model, goal, tools, maxSteps, maxTokens }),
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

      let currentEvent = '';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7);
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          handleSSE(currentEvent, currentData);
          currentEvent = '';
          currentData = '';
        } else if (line !== '') {
          buffer += line + '\n';
        }
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
    btnStart.textContent = 'Start agent';
  }
});

function handleSSE(event, dataStr) {
  let data;
  try { data = JSON.parse(dataStr); } catch { return; }

  switch (event) {
    case 'permissions':
      renderPermissions(data);
      setStep(0, data.limits.maxSteps);
      break;

    case 'step':
      handleStepEvent(data);
      break;

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

  // Update workspace if event has workspace data
  if (ev.workspace) {
    updateWorkspace(ev.workspace);
  }

  switch (ev.type) {
    case 'thinking':
      setStatus('running', `Step ${ev.step}: Thinking...`);
      if (ev.content && ev.content !== 'LLM is processing...') {
        addThought(ev.step, ev.content);
      }
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
      setStatus('running', `Step ${ev.step}: Access denied for ${ev.tool}`);
      addActivity(ev);
      break;

    case 'answer':
      setStatus('running', 'Producing final answer...');
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
