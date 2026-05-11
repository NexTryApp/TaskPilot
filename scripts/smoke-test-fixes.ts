/**
 * Smoke test for the May-2026 security audit fixes.
 * Validates each high-impact regression the audit caught.
 * Run: npx tsx scripts/smoke-test-fixes.ts
 */

import { checkCommand } from '../src/security/dangerous-commands.js';
import { isSafeBinCommand } from '../src/security/safe-bins.js';
import { containsBlockedPath } from '../src/security/blocked-paths.js';
import { ApprovalManager } from '../src/security/approval-manager.js';
import { ToolCache } from '../src/tools/tool-cache.js';

type Case = { name: string; pass: boolean; detail?: string };
const results: Case[] = [];

function check(name: string, pass: boolean, detail?: string): void {
  results.push({ name, pass, detail });
}

// ─── H1: dangerous-commands normalization ───────────────────────────────

const upperRm = checkCommand('RM -RF /', 'linux');
check('H1.a uppercase RM -RF blocked', upperRm.some(r => r.severity === 'BLOCK'));

const homoglyph = checkCommand('рм -rf /', 'linux'); // 'рм' Cyrillic
check(
  'H1.b cyrillic homoglyph (рм) blocked',
  homoglyph.some(r => r.severity === 'BLOCK' && r.category === 'HOMOGLYPH_BYPASS')
);

const backslashRm = checkCommand('\\rm -rf /', 'linux');
check('H1.c \\rm -rf blocked', backslashRm.some(r => r.severity === 'BLOCK'));

const quotedRm = checkCommand("'rm' -rf /", 'linux');
check("H1.d 'rm' quoted blocked", quotedRm.some(r => r.severity === 'BLOCK'));

const commandRm = checkCommand('command rm -rf /', 'linux');
check('H1.e `command rm` blocked', commandRm.some(r => r.severity === 'BLOCK'));

const benignLs = checkCommand('ls -la /home', 'linux');
check('H1.f benign `ls -la` not blocked', !benignLs.some(r => r.severity === 'BLOCK'));

// ─── H2: safe-bins python -c ────────────────────────────────────────────

check('H2.a python3 -c"..." (no space) rejected',
  !isSafeBinCommand('python3 -c"import os;os.system(\'rm\')"'));

check('H2.b python3 -c "..." (with space) rejected',
  !isSafeBinCommand('python3 -c "print(1)"'));

check('H2.c node --eval rejected', !isSafeBinCommand('node --eval "1+1"'));

check('H2.d node --version allowed', isSafeBinCommand('node --version'));

check('H2.e python3 --version allowed', isSafeBinCommand('python3 --version'));

check('H2.f bare python3 (REPL) rejected', !isSafeBinCommand('python3'));

// ─── H3: blocked-paths home expansion ───────────────────────────────────

const tildeSsh = containsBlockedPath('cat ~/.ssh/id_rsa', 'linux');
check('H3.a ~/.ssh blocked', !!tildeSsh);

const userSsh = containsBlockedPath('cat /Users/alice/.ssh/id_rsa', 'macos');
check('H3.b /Users/alice/.ssh blocked', !!userSsh);

const homeSsh = containsBlockedPath('cat $HOME/.ssh/id_rsa', 'linux');
check('H3.c $HOME/.ssh blocked', !!homeSsh);

const winSsh = containsBlockedPath('type C:\\Users\\Alice\\.ssh\\id_rsa', 'windows');
check('H3.d C:\\Users\\Alice\\.ssh blocked', !!winSsh);

const envSsh = containsBlockedPath('type %USERPROFILE%\\.ssh\\id_rsa', 'windows');
check('H3.e %USERPROFILE%\\.ssh blocked', !!envSsh);

const benignCat = containsBlockedPath('cat README.md', 'linux');
check('H3.f benign README.md not blocked', !benignCat);

// ─── C9: approval ID is UUID ────────────────────────────────────────────

const mgr = new ApprovalManager(1000);
const { approval, promise } = mgr.requestApproval(
  { action: 'WARN', reason: 'test', checks: [], requiresApproval: true },
  'terminal_run',
  { command: 'ls' }
);
check('C9.a approval id starts with approval_', approval.id.startsWith('approval_'));
check('C9.b approval id is UUID-shaped (36 char body)',
  /^approval_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(approval.id));
mgr.respond(approval.id, false); // cleanup
await promise;

// ─── R2-H3: approval owner-tag binding ──────────────────────────────────

const mgr2 = new ApprovalManager(1000);
const r2_1 = mgr2.requestApproval(
  { action: 'WARN', reason: 'test', checks: [], requiresApproval: true },
  'terminal_run', { command: 'ls' }, undefined, 'session-alice'
);
const wrongOwner = mgr2.respond(r2_1.approval.id, true, 'session-eve');
check('R2-H3.a respond with wrong owner tag rejected', wrongOwner === false);
const rightOwner = mgr2.respond(r2_1.approval.id, true, 'session-alice');
check('R2-H3.b respond with correct owner tag accepted', rightOwner === true);
await r2_1.promise;

// Back-compat: approval created without ownerTag accepts any caller.
const r2_2 = mgr2.requestApproval(
  { action: 'WARN', reason: 'test', checks: [], requiresApproval: true },
  'terminal_run', { command: 'ls' }
);
const anyOwner = mgr2.respond(r2_2.approval.id, false, 'anything');
check('R2-H3.c approval without ownerTag accepts any responder', anyOwner === true);
await r2_2.promise;

// ─── C2/C3: tool cache scope + whitelist ────────────────────────────────

const cache = new ToolCache({ ttlMs: 0 });
cache.set('browser_search', { q: 'x' }, 'A_RESULT', 'alice');
cache.set('browser_search', { q: 'x' }, 'B_RESULT', 'bob');

const aGot = cache.get('browser_search', { q: 'x' }, 'alice');
const bGot = cache.get('browser_search', { q: 'x' }, 'bob');
check('C2.a alice and bob see their own cached value',
  aGot?.result === 'A_RESULT' && bGot?.result === 'B_RESULT');

const xGot = cache.get('browser_search', { q: 'x' }, 'eve');
check('C2.b eve (different principal) sees no cache', xGot === undefined);

// C3: mutating tool must not be cached
cache.set('send_email', { to: 'x' }, 'SENT', 'alice');
const emailCached = cache.get('send_email', { to: 'x' }, 'alice');
check('C3.a send_email (mutating) is NOT cached', emailCached === undefined);

const weatherCached = (() => {
  cache.set('get_weather', { city: 'Helsinki' }, 'rain', 'alice');
  return cache.get('get_weather', { city: 'Helsinki' }, 'alice')?.result;
})();
check('C3.b get_weather (read-only) IS cached', weatherCached === 'rain');

// ─── Print results ──────────────────────────────────────────────────────

let pass = 0, fail = 0;
for (const r of results) {
  const mark = r.pass ? '✅' : '❌';
  console.log(`${mark} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  if (r.pass) pass++; else fail++;
}
console.log(`\n  ${pass} passed, ${fail} failed (${results.length} total)`);
if (fail > 0) process.exit(1);
