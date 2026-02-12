# Безопасность данных и контроль доступа (TaskPilot)

Фреймворк даёт **полный контроль доступа** на уровне ранна и инструментов: кто что может вызывать и какие данные видит.

---

## 1. Модель доступа

### Principal (субъект)

Кто выполняет запуск агента. Задаётся при вызове `runAgentLoop` через `goal.accessContext.principal`.

```ts
interface Principal {
  id: string;           // идентификатор (userId, apiKeyId и т.д.)
  tenantId?: string;   // тенант для мультитенантности
  roles?: string[];    // роли (admin, user, …)
  scopes?: string[];   // скоупы (tasks:read, tasks:write, …)
  metadata?: Record<string, unknown>;
}
```

- **id** — обязателен; по нему изолируется долгосрочная память (ScopedLongTermMemory).
- **tenantId, roles, scopes** — для политик и guard’ов (разрешённые инструменты, проверка аргументов).

### AccessContext (контекст ранна)

На время одного ранна фиксируется: `{ principal, runId }`. Контекст передаётся в проверки доступа и в каждый вызов инструмента, чтобы инструмент мог учитывать, кто вызвал.

---

## 2. Контроль доступа к инструментам

### AccessPolicy на ToolRegistry

Политика задаётся через `tools.setAccessPolicy(policy)`.

| Поле | Назначение |
|------|------------|
| **allowedTools** | Список разрешённых имён инструментов. `['*']` — все. Пустой массив без `*` — ничего не разрешено. |
| **deniedTools** | Явный запрет по имени (имеет приоритет над allowedTools). |
| **guard** | Функция `(context, toolName, args) => boolean | Promise<boolean>`. Вызывается перед каждым выполнением; `false` — доступ запрещён (AccessDeniedError). |

Порядок проверок: `deniedTools` → `allowedTools` → `guard`. Если политика не задана, ограничений по инструментам нет (как раньше).

### Пример

```ts
const tools = new ToolRegistry();
tools.register(createTaskTool);
tools.register(deleteTaskTool);

tools.setAccessPolicy({
  allowedTools: ['get_weather', 'create_task'],
  deniedTools: ['delete_task'],
  guard: async (ctx, name, args) => {
    if (name === 'create_task' && ctx.principal.tenantId !== 'acme') return false;
    return true;
  },
});

const state = await runAgentLoop(
  { goal: '...', accessContext: { principal: user, runId: 'run_1' } },
  memory, tools, llm, longTerm, {}
);
```

---

## 3. Изоляция данных (память)

### Краткосрочная память (BufferMemory)

Один экземпляр — один ран. Данные не пересекаются между раннами, если для каждого ранна создаётся свой буфер (рекомендуется).

### Долгосрочная память с изоляцией (ScopedLongTermMemory)

`ScopedLongTermMemoryImpl` хранит записи по **scope**. Перед поиском/добавлением вызывается `setScope(scope)`. В агенте scope выставляется в `principal.id` (или, при необходимости, в `tenantId`), так что один пользователь не видит данные другого.

```ts
const longTerm = new ScopedLongTermMemoryImpl();
// В agent-loop при наличии accessContext вызывается setScope(principal.id)
await runAgentLoop(
  { goal: '...', accessContext: { principal: { id: 'user_123' }, runId: 'r1' } },
  memory, tools, llm, longTerm, {}
);
```

Если долгосрочная память без scope (например, `SimpleLongTermMemory`) — изоляция по пользователям не выполняется; используй её только для общих/неперсональных данных или задавай scope сам в своей обёртке.

---

## 4. Передача контекста в инструменты

Сигнатура инструмента: `execute(args, context?: AccessContext)`. Внутри инструмента можно:

- проверять `context.principal.id` / `tenantId` перед обращением к API или БД;
- подставлять `principal.id` в запросы (например, «создать задачу от имени user_123»);
- не возвращать чужие данные, если API/БД отдают их по principal.

Фреймворк не подставляет principal в внешние API — это делает реализация инструмента.

---

## 5. Что остаётся на стороне платформы

- **Аутентификация** — кто такой principal (JWT, API key, сессия), и откуда берётся `Principal` перед вызовом `runAgentLoop`.
- **Секреты** — не логировать ключи и токены; не передавать их в цель или в сообщения без необходимости.
- **Оплаты, лимиты, фрод** — вне фреймворка; можно использовать `principal` и `runId` в своей логике биллинга и лимитов.
- **Аудит** — при необходимости логировать `principalId`, `runId`, имена вызванных инструментов (без чувствительных args) у себя.

---

## 6. Рекомендации

1. Всегда задавать **accessContext** для пользовательских раннов и использовать **ScopedLongTermMemory** для персональной памяти.
2. Для каждого ранна создавать **новый BufferMemory** (не переиспользовать между пользователями).
3. Задавать **AccessPolicy** на общий ToolRegistry (или на регистри по ролям) и при необходимости использовать **guard** для проверки args (например, что пользователь не передаёт чужие id).
4. В инструментах, которые ходят в твой backend, передавать **principal.id** (и при необходимости tenantId) в заголовках или теле запроса и проверять права на бэкенде.
5. Не включать секреты и PII в **goal** и **systemPrompt**, если они логируются; при необходимости маскировать в своей обёртке.
6. **Непроверенный контент** (страницы, письма, чужие сообщения) передавать **только в user message**, никогда — в system или как инструкцию; использовать Tools firewall (AccessPolicy) и по возможности отдельный блок в промпте («Внешний контент: …»).

После этого фреймворк даёт **безопасность данных и полный контроль доступа** на уровне агента; граница доверия — твоя аутентификация и твой backend.

---

## 7. Типичные проблемы агентных систем

Prompt injection, supply-chain плагинов, экспоз gateway, приватность, нестабильность сессий, непредсказуемость вывода, производительность — и как TaskPilot их закрывает или учитывает: **[docs/PROBLEMS_AND_SOLUTIONS.md](./docs/PROBLEMS_AND_SOLUTIONS.md)**.
