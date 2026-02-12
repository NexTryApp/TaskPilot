# TaskPilot

**Самостоятельный фреймворк автономного AI-агента.** Свой код, свой стек (TypeScript/Node), ноль внешних runtime-зависимостей.

Не чат-бот и не просто LLM — **каркас** автономного агента: цикл принятия решений, инструменты, память. Каналы (Telegram, WhatsApp и т.д.) и gateway можно нарастить поверх этого ядра.

## Как устроен

- **Мозг (LLM)** — OpenAI / Claude / другая модель через адаптер.
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
