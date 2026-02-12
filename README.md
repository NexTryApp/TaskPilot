# TaskPilot

**Самостоятельный фреймворк автономного AI-агента.** Свой код, свой стек (TypeScript/Node), ноль внешних runtime-зависимостей.

Не чат-бот и не просто LLM — **каркас** автономного агента: цикл принятия решений, инструменты, память. Каналы (Telegram, WhatsApp и т.д.) и gateway можно нарастить поверх этого ядра.

## Как устроен

- **Мозг (LLM)** — любая модель через единый адаптер (`OpenAIAdapter` с настраиваемым `baseUrl`):

  | Провайдер | Модели | baseUrl |
  |-----------|--------|---------|
  | **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `o3-mini` | `https://api.openai.com/v1` (по умолчанию) |
  | **Anthropic** | `claude-sonnet-4-20250514`, `claude-3.5-haiku` | `https://api.anthropic.com/v1` |
  | **Google Gemini** | `gemini-2.0-flash`, `gemini-2.5-pro` | `https://generativelanguage.googleapis.com/v1beta/openai` |
  | **DeepSeek** | `deepseek-chat`, `deepseek-reasoner` | `https://api.deepseek.com/v1` |
  | **Groq** | `llama-3.3-70b`, `mixtral-8x7b` | `https://api.groq.com/openai/v1` |
  | **Together** | `meta-llama/Llama-3.3-70B`, `Qwen/Qwen2.5-72B` | `https://api.together.xyz/v1` |
  | **Mistral** | `mistral-large`, `mistral-small` | `https://api.mistral.ai/v1` |
  | **OpenRouter** | 200+ моделей (любой провайдер) | `https://openrouter.ai/api/v1` |
  | **Ollama (локально)** | `llama3`, `mistral`, `qwen2.5` и др. | `http://localhost:11434/v1` |

  ```ts
  // OpenAI (по умолчанию)
  new OpenAIAdapter({ model: 'gpt-4o' })

  // DeepSeek
  new OpenAIAdapter({ baseUrl: 'https://api.deepseek.com/v1', apiKey: '...', model: 'deepseek-chat' })

  // Ollama (локально, без ключа — задать любую строку)
  new OpenAIAdapter({ baseUrl: 'http://localhost:11434/v1', apiKey: 'ollama', model: 'llama3' })
  ```

  Любой провайдер с OpenAI-совместимым API подключается одной строкой. Для провайдеров с другим форматом — реализовать интерфейс `LLMAdapter`.

- **Цикл агента** — цель → думает → выбирает действие → вызывает инструмент → получает результат → повторяет.
- **Инструменты (Tools)** — вызов API, создание задачи, HTTP-запросы и т.д. Агент сам решает, какой инструмент вызвать.
- **Память** — краткосрочная (буфер сообщений) и опциональная долгосрочная (поиск по контексту).

## Быстрый старт

Полная пошаговая инструкция (установка, сборка, запуск, проверка, шпаргалка команд): **[docs/QUICKSTART.md](./docs/QUICKSTART.md)**

Коротко:

```powershell
# Установка (один раз)
py -m venv venv
.\venv\Scripts\Activate.ps1
pip install nodeenv
nodeenv --python-virtualenv --node=22.13.1
.\venv\Scripts\Activate.ps1
npm install
npx tsc

# Запуск примера
npx tsx example/run-agent.ts

# С реальной LLM (OpenAI)
$env:OPENAI_API_KEY = "sk-..."
npx tsx example/run-agent.ts
```

## API

```ts
import {
  runAgentLoop,
  ToolRegistry,
  BufferMemory,
  SimpleLongTermMemory,
  OpenAIAdapter,
} from './src/index.js';

const memory = new BufferMemory();
const longTerm = new SimpleLongTermMemory();
const tools = new ToolRegistry();

tools.register({
  name: 'create_task',
  definition: {
    name: 'create_task',
    description: 'Create a task',
    parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
  },
  async execute(args) {
    return { id: '1', title: args.title };
  },
});

const llm = new OpenAIAdapter({ model: 'gpt-4o-mini' });
const state = await runAgentLoop(
  { goal: 'Создай задачу "Проверить погоду"' },
  memory,
  tools,
  llm,
  longTerm,
  { maxSteps: 10 }
);

console.log(state.finalAnswer);
```

## Ключевые возможности

| Возможность | Описание |
|-------------|----------|
| **Agent Loop** | Цикл: цель → LLM → tool → результат → повтор |
| **Access Control** | Principal, AccessPolicy (allowed/denied tools, guard), AccessDeniedError |
| **Изоляция данных** | ScopedLongTermMemory — память по principal.id |
| **Аудит** | AuditLogger — каждый tool_call, tool_denied, run_start/end |
| **Кеш инструментов** | ToolCache — дедупликация повторных вызовов, TTL |
| **Контекстное окно** | ContextManager — скользящее окно + auto-summary |
| **Бюджет токенов** | TokenTracker — лимит на ран |
| **Валидация вывода** | validateFinalAnswer — проверка по JSON schema |

**Безопасность данных и полный контроль доступа:** [SECURITY.md](./SECURITY.md).

**Типичные проблемы агентных систем и решения:** [docs/PROBLEMS_AND_SOLUTIONS.md](./docs/PROBLEMS_AND_SOLUTIONS.md).

## Архитектура

Подробно: [ARCHITECTURE.md](./ARCHITECTURE.md) — схема, компоненты, поток данных, расширение.

## Структура

- `src/agent-loop.ts` — цикл: промпт → LLM → разбор ответа → выполнение tool → повтор.
- `src/tools/` — регистр инструментов и схема для function calling.
- `src/memory/` — буфер (краткосрочная) и простая долгосрочная память.
- `src/llm/` — адаптер OpenAI и mock для тестов.
- `src/audit/` — логирование вызовов.
- `src/validation/` — валидация вывода.
- `src/context/` — управление контекстным окном.
- `src/budget/` — бюджет токенов.

Безопасность, оплаты, фрод, юр. ответственность — не входят во фреймворк; это уровень твоей платформы и API.

## Лицензия

**TaskPilot Source Available License v1.0** — свободное использование (включая коммерческое) при обязательном видимом упоминании:

> Powered by TaskPilot (github.com/NexTryApp/TaskPilot)

Подробно: [LICENSE](./LICENSE).
