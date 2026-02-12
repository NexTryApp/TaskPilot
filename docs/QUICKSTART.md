# TaskPilot — Быстрый старт

Полная инструкция: как установить, собрать, запустить и проверить фреймворк.

---

## 1. Требования

- **Windows 10/11** (или Linux/macOS)
- **Python 3.10+** (для venv)
- **Git** (опционально)

Всё остальное (Node.js, npm, TypeScript) устанавливается внутри venv.

---

## 2. Установка (с нуля)

Открой терминал (PowerShell) в папке проекта `G:\TaskPilot`:

```powershell
# 1. Создать Python venv
py -m venv venv

# 2. Активировать venv
.\venv\Scripts\Activate.ps1

# 3. Установить nodeenv (Node.js внутри venv)
pip install nodeenv

# 4. Установить Node.js 22 внутри venv
nodeenv --python-virtualenv --node=22.13.1

# 5. Переактивировать venv (чтобы подхватить node/npm)
.\venv\Scripts\Activate.ps1

# 6. Проверить, что node и npm доступны
node --version      # → v22.13.1
npm --version       # → 10.x

# 7. Установить npm-зависимости (TypeScript, tsx и т.д.)
npm install

# 8. Собрать проект (TypeScript → JavaScript)
npx tsc
```

Если всё прошло без ошибок — установка завершена.

---

## 3. Запуск примера

```powershell
# Убедись, что venv активирован
.\venv\Scripts\Activate.ps1

# Запуск (без OPENAI_API_KEY — работает mock-агент)
npx tsx example/run-agent.ts
```

Или через npm-скрипт:

```powershell
npm run example
```

### Ожидаемый вывод

```
[audit] run_start     | - | principal=user_42
[audit] tool_call     | get_weather | principal=user_42
[audit] tool_result   | get_weather | principal=user_42
[audit] tool_call     | create_task | principal=user_42
[audit] tool_result   | create_task | principal=user_42
[audit] tool_call     | delete_task | principal=user_42
[audit] tool_denied   | delete_task | principal=user_42
[audit] run_end       | - | principal=user_42

=== Agent Result ===
Done: true
Steps: 4
Principal: user_42
Final: Готово: погода в Москве — 18°C, солнечно. Задача "Проверить погоду" создана.
Messages: 6

Output valid: true

=== Audit Log ===
  run_start   | tool=- | error=-
  tool_call   | tool=get_weather | error=-
  tool_result | tool=get_weather | error=-
  tool_call   | tool=create_task | error=-
  tool_result | tool=create_task | error=-
  tool_call   | tool=delete_task | error=-
  tool_denied | tool=delete_task | error=Tool denied by policy: delete_task
  run_end     | tool=- | error=-
```

**Что здесь произошло:**
1. Агент вызвал `get_weather` → получил результат (18°C, sunny).
2. Агент вызвал `create_task` → задача создана от имени `user_42`.
3. Агент попытался вызвать `delete_task` → **заблокировано политикой** (AccessPolicy → deniedTools).
4. Агент дал финальный ответ.
5. Аудит-лог записал каждое действие с principalId.

---

## 4. Запуск с реальной LLM (OpenAI)

```powershell
# Задать ключ перед запуском
$env:OPENAI_API_KEY = "sk-ваш-ключ-здесь"

# Запуск
npx tsx example/run-agent.ts
```

Агент будет использовать `gpt-4o-mini` через OpenAI API. Всё остальное (tools, memory, audit, access control) работает так же.

---

## 5. Пересборка после изменений

```powershell
# Активировать venv
.\venv\Scripts\Activate.ps1

# Пересобрать
npx tsc

# Запустить
npx tsx example/run-agent.ts
```

---

## 6. Команды одной строкой (шпаргалка)

| Команда | Что делает |
|---------|------------|
| `.\venv\Scripts\Activate.ps1` | Активировать venv (Node + Python) |
| `npm install` | Установить/обновить npm-зависимости |
| `npx tsc` | Собрать TypeScript → dist/ |
| `npx tsx example/run-agent.ts` | Запустить пример агента |
| `npm run example` | То же самое (через npm-скрипт) |
| `npm run build` | То же что `npx tsc` (через npm-скрипт) |
| `deactivate` | Выйти из venv |

---

## 7. Структура проекта

```
G:\TaskPilot\
├── venv\                    ← Python venv + Node.js (nodeenv)
├── node_modules\            ← npm-зависимости (TypeScript, tsx)
├── dist\                    ← скомпилированный JS (после npx tsc)
├── src\                     ← исходный код фреймворка
│   ├── index.ts             ← публичный API (все экспорты)
│   ├── types.ts             ← типы: Principal, AccessContext, Tool, Memory…
│   ├── agent-loop.ts        ← цикл агента (ядро)
│   ├── tools\
│   │   ├── tool-registry.ts ← регистр инструментов + access control
│   │   └── tool-cache.ts    ← кеш результатов инструментов
│   ├── memory\
│   │   ├── buffer-memory.ts      ← краткосрочная (буфер)
│   │   ├── simple-long-term.ts   ← долгосрочная (без изоляции)
│   │   └── scoped-long-term.ts   ← долгосрочная с изоляцией по principal
│   ├── llm\
│   │   ├── openai-adapter.ts     ← OpenAI API (tool calling)
│   │   └── mock-adapter.ts       ← Mock для тестов без API key
│   ├── audit\
│   │   └── audit-logger.ts       ← лог вызовов tools и раннов
│   ├── validation\
│   │   └── output-validator.ts   ← валидация ответа агента по schema
│   ├── context\
│   │   └── context-manager.ts    ← скользящее окно + summary
│   └── budget\
│       └── token-tracker.ts      ← бюджет токенов на ран
├── example\
│   └── run-agent.ts         ← полный рабочий пример
├── docs\
│   ├── QUICKSTART.md        ← ЭТА СТРАНИЦА
│   └── PROBLEMS_AND_SOLUTIONS.md ← проблемы агентных систем и решения
├── ARCHITECTURE.md          ← архитектура и схема
├── SECURITY.md              ← безопасность и контроль доступа
├── README.md                ← описание проекта
├── package.json
├── tsconfig.json
└── requirements.txt         ← Python-зависимости (nodeenv)
```

---

## 8. Проверка: что всё работает

Быстрый чеклист после установки:

```powershell
.\venv\Scripts\Activate.ps1

# 1. Node доступен?
node --version
# Ожидание: v22.13.1

# 2. TypeScript собирается?
npx tsc
# Ожидание: без ошибок (пустой вывод)

# 3. Пример запускается?
npx tsx example/run-agent.ts
# Ожидание: вывод с [audit] и "Done: true"

# 4. dist/ создался?
dir dist
# Ожидание: .js и .d.ts файлы
```

Если все 4 пункта прошли — фреймворк полностью рабочий.

---

## 9. Что дальше

- **Подключить свои инструменты** — зарегистрировать в `ToolRegistry` (см. пример в `example/run-agent.ts`).
- **Подключить реальную LLM** — задать `OPENAI_API_KEY` или написать свой `LLMAdapter` для Claude/другого.
- **Встроить в backend** — вызывать `runAgentLoop()` из своего API-хендлера, передавая `accessContext` с данными аутентифицированного пользователя.
- **Документация:**
  - [ARCHITECTURE.md](../ARCHITECTURE.md) — схема, компоненты, поток данных
  - [SECURITY.md](../SECURITY.md) — безопасность и контроль доступа
  - [PROBLEMS_AND_SOLUTIONS.md](./PROBLEMS_AND_SOLUTIONS.md) — проблемы агентных систем и решения
