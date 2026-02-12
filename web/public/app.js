// --- Provider selection ---
const providerBtns = document.querySelectorAll('.provider-btn');
const modelInput = document.getElementById('model');
const apiKeyInput = document.getElementById('apiKey');
const keyHint = document.getElementById('keyHint');

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
      keyHint.textContent = 'Ollama runs locally — no key needed';
    } else {
      if (apiKeyInput.value === 'ollama') apiKeyInput.value = '';
      keyHint.textContent = 'Key is not sent to third-party servers — only directly to the provider';
    }
  });
});

// --- Start agent ---
const btnStart = document.getElementById('btnStart');
const outputCard = document.getElementById('outputCard');
const logOutput = document.getElementById('logOutput');
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const finalAnswerEl = document.getElementById('finalAnswer');
const answerText = document.getElementById('answerText');
const runMeta = document.getElementById('runMeta');

btnStart.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim();
  const goal = document.getElementById('goal').value.trim();
  const maxSteps = parseInt(document.getElementById('maxSteps').value) || 10;
  const maxTokens = parseInt(document.getElementById('maxTokens').value) || 0;

  if (!apiKey && selectedProvider !== 'ollama') {
    alert('Enter API Key');
    return;
  }
  if (!model) {
    alert('Specify model');
    return;
  }
  if (!goal) {
    alert('Specify agent goal');
    return;
  }

  const tools = [];
  document.querySelectorAll('#toolsList input[type="checkbox"]:checked').forEach((cb) => {
    tools.push(cb.dataset.tool);
  });

  // Reset UI
  outputCard.style.display = 'block';
  logOutput.innerHTML = '';
  finalAnswerEl.style.display = 'none';
  runMeta.style.display = 'none';
  statusBar.querySelector('.status-dot').className = 'status-dot running';
  statusText.textContent = 'Agent is running...';
  btnStart.disabled = true;
  btnStart.textContent = 'Agent is running...';

  outputCard.scrollIntoView({ behavior: 'smooth' });

  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: selectedBaseUrl,
        apiKey,
        model,
        goal,
        tools,
        maxSteps,
        maxTokens,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Server error');
    }

    // Render audit log
    if (data.audit) {
      data.audit.forEach((entry) => {
        addLogEntry(entry);
      });
    }

    // Final answer
    if (data.state?.finalAnswer) {
      finalAnswerEl.style.display = 'block';
      answerText.textContent = data.state.finalAnswer;
    }

    // Meta
    runMeta.style.display = 'block';
    runMeta.textContent = `Steps: ${data.state?.currentStep || '?'} / ${data.state?.maxSteps || '?'} | Run ID: ${data.state?.runId || '?'} | Principal: ${data.state?.principalId || '-'}`;

    // Status
    statusBar.querySelector('.status-dot').className = 'status-dot done';
    statusText.textContent = data.state?.done ? 'Completed' : 'Stopped (step limit)';
  } catch (err) {
    statusBar.querySelector('.status-dot').className = 'status-dot error';
    statusText.textContent = 'Error: ' + err.message;
    addLogEntry({ event: 'error', error: err.message });
  } finally {
    btnStart.disabled = false;
    btnStart.textContent = 'Start agent';
  }
});

function addLogEntry(entry) {
  const div = document.createElement('div');
  div.className = `log-entry ${entry.event || ''}`;

  let icon = '';
  let text = '';
  switch (entry.event) {
    case 'run_start':
      icon = '>';
      text = `run_start | principal=${entry.principalId || '-'}`;
      break;
    case 'run_end':
      icon = '>';
      text = `run_end | steps=${entry.meta?.steps || '?'} done=${entry.meta?.done}`;
      break;
    case 'tool_call':
      icon = '\u2192';
      text = `tool_call | ${entry.toolName}(${JSON.stringify(entry.args || {})})`;
      break;
    case 'tool_result':
      icon = '\u2190';
      text = `tool_result | ${entry.toolName} | ${entry.meta?.resultPreview || ''}`;
      break;
    case 'tool_denied':
      icon = '\u2718';
      text = `DENIED | ${entry.toolName} | ${entry.error}`;
      break;
    case 'thought':
      icon = '\u2731';
      text = entry.content || '';
      break;
    case 'error':
      icon = '!';
      text = entry.error;
      break;
    default:
      text = JSON.stringify(entry);
  }

  div.textContent = `${icon} ${text}`;
  logOutput.appendChild(div);
  logOutput.scrollTop = logOutput.scrollHeight;
}
