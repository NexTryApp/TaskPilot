/**
 * Dangerous command detection system.
 * Comprehensive blocklist of dangerous shell commands for Windows, Linux, and macOS.
 * Three severity levels: BLOCK (never), WARN (ask user), ALLOW (ok).
 */

export type CommandSeverity = 'BLOCK' | 'WARN' | 'ALLOW';
export type Platform = 'windows' | 'linux' | 'macos';

export interface CommandCheckResult {
  severity: CommandSeverity;
  category: string;
  pattern: string;
  explanation: string;
  explanationRu: string;
  command: string;
}

interface DangerousPattern {
  pattern: RegExp;
  severity: CommandSeverity;
  category: string;
  explanation: string;
  explanationRu: string;
  platforms: Platform[];
}

// ============================================================================
// DANGEROUS PATTERNS DATABASE
// ============================================================================

const DANGEROUS_PATTERNS: DangerousPattern[] = [

  // --- FILESYSTEM DESTRUCTION (BLOCK) ---

  // rm -rf (any flag combo with -r and -f)
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+(-[a-zA-Z]*f)?|(-[a-zA-Z]*f[a-zA-Z]*\s+)?-[a-zA-Z]*r)/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Recursive force delete — can wipe entire directories permanently',
    explanationRu: 'Рекурсивное принудительное удаление — может безвозвратно стереть все файлы',
    platforms: ['linux', 'macos'],
  },
  // rm without -r but on critical paths
  {
    pattern: /\brm\s+.*[\/~*]/,
    severity: 'WARN',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'File deletion command — verify the target path',
    explanationRu: 'Команда удаления файлов — проверьте путь',
    platforms: ['linux', 'macos'],
  },
  // Windows del /s /q
  {
    pattern: /\bdel\s+.*\/[sS]\b/i,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Recursive file deletion on Windows — can wipe entire directories',
    explanationRu: 'Рекурсивное удаление файлов Windows — может стереть целые директории',
    platforms: ['windows'],
  },
  // Windows rd /s /q (rmdir)
  {
    pattern: /\b(rd|rmdir)\s+.*\/[sS]\b/i,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Recursive directory removal on Windows',
    explanationRu: 'Рекурсивное удаление директорий Windows',
    platforms: ['windows'],
  },
  // Windows Remove-Item -Recurse -Force
  {
    pattern: /\bRemove-Item\b.*-Recurse/i,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'PowerShell recursive deletion — can wipe directories permanently',
    explanationRu: 'PowerShell рекурсивное удаление — может стереть директории безвозвратно',
    platforms: ['windows'],
  },
  // format drive
  {
    pattern: /\bformat\s+[a-zA-Z]:/i,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Disk format command — will destroy ALL data on the drive',
    explanationRu: 'Команда форматирования диска — уничтожит ВСЕ данные на диске',
    platforms: ['windows'],
  },
  // dd if=/dev/zero or if=/dev/urandom (disk wipe)
  {
    pattern: /\bdd\s+.*if=\/dev\/(zero|urandom|random)/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Low-level disk write — can overwrite entire disk or partition',
    explanationRu: 'Низкоуровневая запись на диск — может перезаписать весь диск',
    platforms: ['linux', 'macos'],
  },
  // mkfs (create filesystem = format)
  {
    pattern: /\bmkfs\b/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Create filesystem command — equivalent to formatting a drive',
    explanationRu: 'Создание файловой системы — эквивалент форматирования диска',
    platforms: ['linux', 'macos'],
  },
  // shred (secure erase)
  {
    pattern: /\bshred\b/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Secure file erasure — permanently destroys file data',
    explanationRu: 'Безвозвратное уничтожение данных файла',
    platforms: ['linux', 'macos'],
  },
  // wipefs
  {
    pattern: /\bwipefs\b/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Wipe filesystem signatures — can make partitions unrecoverable',
    explanationRu: 'Стирание сигнатур ФС — разделы станут невосстановимыми',
    platforms: ['linux', 'macos'],
  },
  // diskpart
  {
    pattern: /\bdiskpart\b/i,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Windows disk partition manager — can destroy partitions',
    explanationRu: 'Менеджер разделов Windows — может уничтожить разделы',
    platforms: ['windows'],
  },
  // Windows cipher /w (wipe free space)
  {
    pattern: /\bcipher\s+.*\/[wW]/i,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Wipe free disk space — slow and irreversible',
    explanationRu: 'Затирание свободного места на диске',
    platforms: ['windows'],
  },

  // --- SYSTEM MODIFICATION (BLOCK) ---

  {
    pattern: /\b(shutdown|poweroff|halt)\b/,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'System shutdown/halt command — will turn off the computer',
    explanationRu: 'Команда выключения — компьютер будет выключен',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\breboot\b/,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'System reboot — will restart the computer, interrupting all work',
    explanationRu: 'Перезагрузка системы — компьютер перезагрузится, вся работа прервётся',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\binit\s+[06]\b/,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'System runlevel change — shutdown (0) or reboot (6)',
    explanationRu: 'Изменение уровня запуска — выключение (0) или перезагрузка (6)',
    platforms: ['linux'],
  },
  // Windows registry modification
  {
    pattern: /\breg\s+(delete|add)\b/i,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'Windows registry modification — can break system configuration',
    explanationRu: 'Изменение реестра Windows — может сломать конфигурацию системы',
    platforms: ['windows'],
  },
  // bcdedit (boot configuration)
  {
    pattern: /\bbcdedit\b/i,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'Boot configuration editor — can make system unbootable',
    explanationRu: 'Редактор загрузки — система может перестать загружаться',
    platforms: ['windows'],
  },
  // systemctl stop/disable critical services
  {
    pattern: /\bsystemctl\s+(stop|disable)\s+(ssh|sshd|networking|firewall|ufw|iptables)\b/,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'Stopping critical system service — may lose network/SSH access',
    explanationRu: 'Остановка критического сервиса — можно потерять сетевой доступ',
    platforms: ['linux'],
  },
  // kill -9 1 (kill init/systemd)
  {
    pattern: /\bkill\s+(-9\s+)?1\b/,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'Killing PID 1 (init/systemd) — will crash the system',
    explanationRu: 'Убийство PID 1 (init/systemd) — система рухнет',
    platforms: ['linux', 'macos'],
  },
  // taskkill system processes on Windows
  {
    pattern: /\btaskkill\s+.*\/(im|pid)\s+(csrss|winlogon|lsass|svchost|smss|services)/i,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'Killing critical Windows process — will crash or blue-screen the system',
    explanationRu: 'Убийство критического процесса Windows — синий экран смерти',
    platforms: ['windows'],
  },

  // --- PRIVILEGE ESCALATION (BLOCK) ---

  {
    pattern: /\bsudo\s+(su|bash|sh|-i|-s|--login)\b/,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Escalation to root shell — full system access, extremely dangerous',
    explanationRu: 'Получение root-доступа — полный контроль над системой, крайне опасно',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bchmod\s+[247]77\b/,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Setting world-writable permissions — security vulnerability',
    explanationRu: 'Установка публичных прав записи — уязвимость безопасности',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bchmod\s+[u+]*s\b/,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Setting SUID bit — allows running as owner (privilege escalation)',
    explanationRu: 'Установка SUID бита — позволяет запуск от имени владельца',
    platforms: ['linux', 'macos'],
  },
  // Windows runas
  {
    pattern: /\brunas\s+.*\/user:\s*(administrator|admin|system)/i,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Running as Administrator — full system access',
    explanationRu: 'Запуск от имени Администратора — полный доступ к системе',
    platforms: ['windows'],
  },
  // PowerShell execution policy
  {
    pattern: /\bSet-ExecutionPolicy\s+(Unrestricted|Bypass)\b/i,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Removing PowerShell script execution restrictions',
    explanationRu: 'Снятие ограничений на выполнение PowerShell скриптов',
    platforms: ['windows'],
  },
  // passwd root
  {
    pattern: /\bpasswd\s+root\b/,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Changing root password — system administration action',
    explanationRu: 'Смена пароля root — действие системного администратора',
    platforms: ['linux', 'macos'],
  },
  // net user administrator
  {
    pattern: /\bnet\s+user\s+administrator\b/i,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Modifying administrator account on Windows',
    explanationRu: 'Изменение учётной записи администратора Windows',
    platforms: ['windows'],
  },

  // --- NETWORK ATTACKS (BLOCK) ---

  {
    pattern: /\bnmap\b/,
    severity: 'BLOCK',
    category: 'NETWORK_ATTACKS',
    explanation: 'Network port scanner — used for reconnaissance attacks',
    explanationRu: 'Сканер портов — используется для сетевых атак',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\b(netcat|nc)\s+(-[a-zA-Z]*l)/,
    severity: 'BLOCK',
    category: 'NETWORK_ATTACKS',
    explanation: 'Network listener — can be used as backdoor',
    explanationRu: 'Сетевой слушатель — может использоваться как бэкдор',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\biptables\s+-F\b/,
    severity: 'BLOCK',
    category: 'NETWORK_ATTACKS',
    explanation: 'Flushing firewall rules — removes all network protection',
    explanationRu: 'Сброс правил фаервола — убирает всю сетевую защиту',
    platforms: ['linux'],
  },
  {
    pattern: /\bufw\s+disable\b/,
    severity: 'BLOCK',
    category: 'NETWORK_ATTACKS',
    explanation: 'Disabling firewall — removes network protection',
    explanationRu: 'Отключение фаервола — убирает сетевую защиту',
    platforms: ['linux'],
  },
  // Windows firewall disable
  {
    pattern: /\bnetsh\s+advfirewall\s+set\s+.*state\s+off/i,
    severity: 'BLOCK',
    category: 'NETWORK_ATTACKS',
    explanation: 'Disabling Windows Firewall — removes network protection',
    explanationRu: 'Отключение Windows Firewall — убирает сетевую защиту',
    platforms: ['windows'],
  },

  // --- CRYPTO / MALWARE (BLOCK) ---

  {
    pattern: /\b(xmrig|coinhive|cryptonight|stratum\+tcp|minergate)\b/i,
    severity: 'BLOCK',
    category: 'CRYPTO_MALWARE',
    explanation: 'Cryptocurrency mining software detected — uses system resources',
    explanationRu: 'Обнаружено ПО для майнинга — использует ресурсы компьютера',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\b(ransomware|encrypt.*all|lock.*files)\b/i,
    severity: 'BLOCK',
    category: 'CRYPTO_MALWARE',
    explanation: 'Ransomware-like pattern detected',
    explanationRu: 'Обнаружен паттерн, похожий на вирус-шифровальщик',
    platforms: ['linux', 'macos', 'windows'],
  },

  // --- DATA EXFILTRATION (BLOCK) ---

  // curl/wget sending sensitive files to external
  {
    pattern: /\b(curl|wget)\b.*(\.(ssh|aws|env|gnupg)|\/etc\/(passwd|shadow)|credentials|\.pem|\.key)\b/i,
    severity: 'BLOCK',
    category: 'DATA_EXFILTRATION',
    explanation: 'Sending sensitive files over network — potential data leak',
    explanationRu: 'Отправка конфиденциальных файлов по сети — возможная утечка данных',
    platforms: ['linux', 'macos', 'windows'],
  },
  // Reading SSH keys combined with network
  {
    pattern: /\bcat\s+.*\.ssh\/(id_rsa|id_ed25519|authorized_keys)\b/,
    severity: 'BLOCK',
    category: 'DATA_EXFILTRATION',
    explanation: 'Reading SSH private keys — potential security breach',
    explanationRu: 'Чтение SSH-ключей — потенциальная утечка безопасности',
    platforms: ['linux', 'macos'],
  },
  // Reading .env files (may contain secrets)
  {
    pattern: /\bcat\s+.*\.env\b/,
    severity: 'WARN',
    category: 'DATA_EXFILTRATION',
    explanation: 'Reading .env file — may contain API keys and secrets',
    explanationRu: 'Чтение .env файла — может содержать API ключи и секреты',
    platforms: ['linux', 'macos', 'windows'],
  },

  // --- OBFUSCATION (BLOCK) ---

  {
    pattern: /\bbase64\b.*\|\s*(bash|sh|python|perl|ruby|node)\b/,
    severity: 'BLOCK',
    category: 'OBFUSCATION',
    explanation: 'Base64 encoded command piped to interpreter — obfuscated execution',
    explanationRu: 'Base64-закодированная команда передана в интерпретатор — скрытое выполнение',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\beval\s*\$\(/,
    severity: 'BLOCK',
    category: 'OBFUSCATION',
    explanation: 'Evaluating command substitution output — obfuscated execution',
    explanationRu: 'Выполнение результата подстановки — скрытое выполнение',
    platforms: ['linux', 'macos'],
  },
  // PowerShell encoded command
  {
    pattern: /powershell.*-[eE](nc|ncodedCommand)\b/i,
    severity: 'BLOCK',
    category: 'OBFUSCATION',
    explanation: 'PowerShell encoded command — hidden/obfuscated script execution',
    explanationRu: 'Закодированная команда PowerShell — скрытое выполнение скрипта',
    platforms: ['windows'],
  },
  // python/node -c with exec
  {
    pattern: /\b(python|python3|node)\s+-[ce]\s+["'].*exec\b/,
    severity: 'BLOCK',
    category: 'OBFUSCATION',
    explanation: 'Inline code execution with exec — potentially obfuscated',
    explanationRu: 'Инлайн-выполнение кода с exec — потенциально скрытое',
    platforms: ['linux', 'macos', 'windows'],
  },
  // curl piped to bash
  {
    pattern: /\b(curl|wget)\b.*\|\s*(bash|sh|sudo)\b/,
    severity: 'BLOCK',
    category: 'OBFUSCATION',
    explanation: 'Downloading and executing remote script — extremely dangerous',
    explanationRu: 'Скачивание и выполнение удалённого скрипта — крайне опасно',
    platforms: ['linux', 'macos'],
  },

  // --- ADDITIONAL DANGEROUS TOOLS (BLOCK) ---

  // truncate (can zero out files)
  {
    pattern: /\btruncate\s+/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Truncate command — can zero out file contents irreversibly',
    explanationRu: 'Команда truncate — может обнулить содержимое файла безвозвратно',
    platforms: ['linux', 'macos'],
  },
  // certutil (Windows — can download files, decode payloads)
  {
    pattern: /\bcertutil\s+.*-urlcache/i,
    severity: 'BLOCK',
    category: 'DATA_EXFILTRATION',
    explanation: 'certutil URL download — often used to download malicious payloads',
    explanationRu: 'certutil скачивание по URL — часто используется для загрузки вредоносного кода',
    platforms: ['windows'],
  },
  // wmic process call create (arbitrary process execution)
  {
    pattern: /\bwmic\s+.*process\s+call\s+create/i,
    severity: 'BLOCK',
    category: 'OBFUSCATION',
    explanation: 'WMIC process creation — can execute arbitrary programs covertly',
    explanationRu: 'WMIC создание процесса — может скрыто запускать произвольные программы',
    platforms: ['windows'],
  },
  // docker --privileged (escapes container isolation)
  {
    pattern: /\bdocker\s+run\b.*--privileged/,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Docker privileged mode — disables container isolation, full host access',
    explanationRu: 'Docker privileged — отключает изоляцию контейнера, полный доступ к хосту',
    platforms: ['linux', 'macos', 'windows'],
  },
  // scp/rsync with --delete (can wipe remote files)
  {
    pattern: /\brsync\b.*--delete/,
    severity: 'WARN',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'rsync with --delete — may remove files on destination that do not exist on source',
    explanationRu: 'rsync с --delete — может удалить файлы на приёмнике, которых нет на источнике',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bscp\b/,
    severity: 'WARN',
    category: 'DATA_EXFILTRATION',
    explanation: 'Secure copy — transferring files to/from remote server',
    explanationRu: 'Безопасное копирование — передача файлов на/с удалённого сервера',
    platforms: ['linux', 'macos'],
  },

  // --- PACKAGE INSTALL (WARN) ---

  {
    pattern: /\bnpm\s+install\s+(-g|--global)\b/,
    severity: 'WARN',
    category: 'PACKAGE_INSTALL',
    explanation: 'Installing global npm package — modifies system Node.js installation',
    explanationRu: 'Установка глобального npm пакета — изменяет системную установку Node.js',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\bnpm\s+install\b/,
    severity: 'WARN',
    category: 'PACKAGE_INSTALL',
    explanation: 'Installing npm packages — downloads code from the internet',
    explanationRu: 'Установка npm пакетов — скачивает код из интернета',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\bpip3?\s+install\b/,
    severity: 'WARN',
    category: 'PACKAGE_INSTALL',
    explanation: 'Installing Python package — downloads code from the internet',
    explanationRu: 'Установка Python пакета — скачивает код из интернета',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\b(apt|apt-get|yum|dnf|pacman)\s+(install|update|upgrade)\b/,
    severity: 'WARN',
    category: 'PACKAGE_INSTALL',
    explanation: 'System package management — modifies installed software',
    explanationRu: 'Управление системными пакетами — изменяет установленное ПО',
    platforms: ['linux'],
  },
  {
    pattern: /\b(choco|winget)\s+install\b/i,
    severity: 'WARN',
    category: 'PACKAGE_INSTALL',
    explanation: 'Installing Windows package — downloads and installs software',
    explanationRu: 'Установка Windows пакета — скачивает и устанавливает ПО',
    platforms: ['windows'],
  },
  {
    pattern: /\bbrew\s+install\b/,
    severity: 'WARN',
    category: 'PACKAGE_INSTALL',
    explanation: 'Installing Homebrew package — downloads and installs software',
    explanationRu: 'Установка Homebrew пакета — скачивает и устанавливает ПО',
    platforms: ['macos'],
  },

  // --- FILE MODIFICATION (WARN) ---

  {
    pattern: /\bmv\s+/,
    severity: 'WARN',
    category: 'FILE_MODIFICATION',
    explanation: 'Moving/renaming files — verify source and destination',
    explanationRu: 'Перемещение/переименование файлов — проверьте источник и назначение',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bchmod\b/,
    severity: 'WARN',
    category: 'FILE_MODIFICATION',
    explanation: 'Changing file permissions',
    explanationRu: 'Изменение прав доступа к файлам',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bchown\b/,
    severity: 'WARN',
    category: 'FILE_MODIFICATION',
    explanation: 'Changing file ownership',
    explanationRu: 'Изменение владельца файлов',
    platforms: ['linux', 'macos'],
  },
  // Writing to files with redirection (overwrite)
  {
    pattern: />\s*\//,
    severity: 'WARN',
    category: 'FILE_MODIFICATION',
    explanation: 'Redirecting output to an absolute path — may overwrite important file',
    explanationRu: 'Перенаправление вывода в абсолютный путь — может перезаписать важный файл',
    platforms: ['linux', 'macos'],
  },
];

// ============================================================================
// MAIN CHECK FUNCTION
// ============================================================================

/**
 * Check a single command segment against all dangerous patterns.
 * Returns all matching results (a command can match multiple categories).
 */
export function checkCommand(command: string, platform: Platform): CommandCheckResult[] {
  const results: CommandCheckResult[] = [];
  const normalizedCmd = command.trim();

  if (!normalizedCmd) return results;

  for (const dp of DANGEROUS_PATTERNS) {
    // Filter by platform
    if (!dp.platforms.includes(platform) && !dp.platforms.includes('linux' as Platform)) {
      // Check if pattern is "all" platforms by having all three
      const isAll = dp.platforms.length === 3;
      if (!isAll) continue;
    }

    if (dp.pattern.test(normalizedCmd)) {
      results.push({
        severity: dp.severity,
        category: dp.category,
        pattern: dp.pattern.source,
        explanation: dp.explanation,
        explanationRu: dp.explanationRu,
        command: normalizedCmd,
      });
    }
  }

  return results;
}

/**
 * Get the worst severity from a list of check results.
 */
export function worstSeverity(results: CommandCheckResult[]): CommandSeverity {
  if (results.some(r => r.severity === 'BLOCK')) return 'BLOCK';
  if (results.some(r => r.severity === 'WARN')) return 'WARN';
  return 'ALLOW';
}

/**
 * Detect current platform.
 */
export function detectPlatform(): Platform {
  const p = process.platform;
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'macos';
  return 'linux';
}
