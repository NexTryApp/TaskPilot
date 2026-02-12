# Архитектура TaskPilot

**TaskPilot** — самостоятельный фреймворк автономного AI-агента (TypeScript/Node). Свой код и свой стек.

---

## 1. Общая схема

```
┌─────────────────────────────────────────────────────────────────┐
│                     runAgentLoop(goal, ...)                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────┐           │
│  │ ShortTerm   │   │ Agent Loop   │   │ Tool        │           │
│  │ Memory      │◄──│ (prompt →   │──►│ Registry    │           │
│  │ (buffer)    │   │  LLM → tool) │   │ + execute   │           │
│  └─────────────┘   └──────┬───────┘   └─────────────┘           │
│         ▲                 │                      │              │
│         │                 ▼                      │              │
│  ┌──────┴──────┐   ┌──────────────┐   ┌─────────▼─────────┐     │
│  │ LongTerm    │   │ LLM Adapter  │   │ Tools (HTTP,      │     │
│  │ Memory      │   │ (OpenAI /    │   │ create_task, …)  │     │
│  │ (optional)  │   │  Mock)       │   └──────────────────┘     │
│  └─────────────┘   └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

- **Вход:** цель (goal), опции (maxSteps, systemPrompt), опционально **accessContext** (principal + runId) для контроля доступа и изоляции данных.
- **Выход:** состояние ранна (AgentRunState): сообщения, finalAnswer, done, currentStep, principalId.

---

## 2. Agent Loop (ядро)

Файл: `src/agent-loop.ts`

Цикл:

1. Собрать промпт: system + цель (+ релевантная долгосрочная память).
2. Вызвать LLM с текущей историей и списком инструментов (schemas).
3. Разобрать ответ:
   - **finalAnswer** → завершить, вернуть state.
   - **action** (tool + arguments) → выполнить инструмент, добавить результат в память, повторить шаг 2.
4. Ограничение по шагам: `maxSteps` (по умолчанию 15).

Состояние ранна не хранится внутри фреймворка — только возвращается из `runAgentLoop`. Хранение раннов (Postgres, Redis и т.д.) — зона ответственности вызывающего кода.

---

## 3. Компоненты

### 3.1 LLM Adapter (`src/llm/`)

- **Интерфейс:** `LLMAdapter.chat(messages, tools) → LLMActionResponse`.
- **Ответ:** либо `{ thought?, finalAnswer? }`, либо `{ thought?, action: { tool, arguments } }`.
- **Реализации:**
  - `OpenAIAdapter` — OpenAI API с function calling (tool_choice: auto).
  - `MockLLMAdapter` — для тестов и демо без API key.

Подключение Claude/других провайдеров — через новую реализацию `LLMAdapter`.

### 3.2 Tools (`src/tools/`)

- **ToolRegistry** — регистрация инструментов, получение определений для LLM, выполнение с опциональной проверкой доступа.
- **AccessPolicy** (setAccessPolicy): allowedTools, deniedTools, guard — полный контроль, кто какой инструмент может вызывать.
- **ToolExecutor:** `name`, `definition`, `execute(args, context?)` — в context передаётся AccessContext (principal, runId) для проверок и подстановки в API.

Перед каждым вызовом: проверка denied/allowed, затем guard; при отказе — AccessDeniedError.

### 3.3 Memory (`src/memory/`)

- **ShortTerm (BufferMemory):** список сообщений текущего ранна. Один буфер на ран — изоляция по умолчанию.
- **LongTerm:**  
  - `SimpleLongTermMemory` — in-memory поиск по подстроке, без изоляции по пользователям.  
  - **ScopedLongTermMemoryImpl** — изоляция по scope; в цикле scope = principal.id, так что данные одного пользователя не видны другому.

В цикл долгосрочная память подаётся при формировании цели; для ScopedLongTermMemory перед search вызывается setScope(principal.id).

---

## 4. Поток данных

1. **Вход:** `AgentGoal` (goal, runId?, accessContext?, metadata?), экземпляры memory, tools, llm, опции.
2. **Инициализация:** очистка short-term memory; при наличии accessContext и ScopedLongTermMemory — setScope(principal.id). Запись system prompt и user message (цель + контекст из long-term при наличии).
3. **Итерация:**
   - messages = memory.getMessages()
   - response = llm.chat(messages, tools.getDefinitions())
   - если finalAnswer → записать ответ в memory, выйти.
   - если action → append assistant message с tool_calls; **проверка доступа** (policy + guard); tools.execute(tool, args, accessContext); appendToolResult(...); следующая итерация.
4. **Выход:** `AgentRunState` (runId, goal, messages, currentStep, maxSteps, done, finalAnswer?, principalId?, metadata?).

---

## 5. Безопасность данных и контроль доступа

- **Principal** — кто выполняет ран (id, tenantId, roles, scopes). Передаётся в `goal.accessContext.principal`.
- **AccessContext** — контекст ранна (principal + runId), передаётся в проверки доступа и в каждый вызов инструмента.
- **AccessPolicy** на ToolRegistry — allowedTools, deniedTools, guard; полный контроль над тем, какие инструменты кому доступны.
- **Изоляция памяти** — ScopedLongTermMemory по scope = principal.id; один пользователь не видит данные другого.
- **Инструменты** получают `context?: AccessContext` в execute; могут подставлять principal.id в запросы к твоему API и проверять права.

Подробно: [SECURITY.md](./SECURITY.md). Типичные проблемы агентных систем и решения: [docs/PROBLEMS_AND_SOLUTIONS.md](./docs/PROBLEMS_AND_SOLUTIONS.md).

## 6. Расширение

- **Новые провайдеры LLM:** реализовать `LLMAdapter`, подставить в `runAgentLoop`.
- **Новые инструменты:** зарегистрировать в `ToolRegistry`, при необходимости использовать `context.principal` в execute.
- **Долгосрочная память с эмбеддингами:** реализовать `LongTermMemory` или `ScopedLongTermMemory` с векторным поиском.
- **Каналы и gateway:** поверх `runAgentLoop` — HTTP API, Telegram bot, очередь; каждый запрос с своим accessContext и своей памятью.

---

## 7. Файловая структура

```
src/
  index.ts          # Публичный API
  types.ts          # Интерфейсы и типы (Principal, AccessContext, AccessPolicy)
  agent-loop.ts     # Цикл агента + access control + audit + cache + budget
  tools/
    tool-registry.ts   # setAccessPolicy, проверка доступа, AccessDeniedError
    tool-cache.ts      # Кеш результатов инструментов
    index.ts
  memory/
    buffer-memory.ts
    simple-long-term.ts
    scoped-long-term.ts   # Изоляция по scope (principal.id)
    index.ts
  llm/
    openai-adapter.ts
    mock-adapter.ts
    index.ts
  audit/
    audit-logger.ts    # Логирование вызовов
    index.ts
  validation/
    output-validator.ts  # Валидация ответа по schema
    index.ts
  context/
    context-manager.ts   # Скользящее окно + summary
    index.ts
  budget/
    token-tracker.ts     # Бюджет токенов
    index.ts
example/
  run-agent.ts     # Пример запуска
SECURITY.md        # Безопасность данных и полный контроль доступа
```

Аутентификация (кто такой principal), оплаты, фрод, аудит — на стороне платформы; фреймворк даёт контроль доступа к инструментам и изоляцию данных по principal.
