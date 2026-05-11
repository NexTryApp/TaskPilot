/**
 * Quick verification of regressions reported by audit-round-2 agents.
 * Run: npx tsx scripts/verify-regressions.ts
 */

import { isSafeBinCommand } from '../src/security/safe-bins.js';
import { checkCommand } from '../src/security/dangerous-commands.js';

console.log('— safe-bins regressions —');
// Audit-round-2 claim: `python3 -mthis` (no space between -m and module) might pass.
// Expected: rejected (running a module is not "safe").
console.log(`python3 -mthis           : ${isSafeBinCommand('python3 -mthis')} (expect false)`);
console.log(`python3 -m this          : ${isSafeBinCommand('python3 -m this')} (expect false)`);
console.log(`python3 -msocketserver   : ${isSafeBinCommand('python3 -msocketserver')} (expect false)`);
console.log(`python3 -c'print(1)'     : ${isSafeBinCommand("python3 -c'print(1)'")} (expect false)`);

console.log('\n— dangerous-commands regressions —');
// Audit-round-2 claim: `eval(rm -rf /)` is not stripped because `eval\s+` requires whitespace.
const r1 = checkCommand('eval(rm -rf /)', 'linux');
console.log(`eval(rm -rf /)          : ${r1.length === 0 ? 'NOT BLOCKED — BUG' : r1.map(c => c.severity).join(',')}`);

const r2 = checkCommand('eval (rm -rf /)', 'linux');
console.log(`eval (rm -rf /)         : ${r2.length === 0 ? 'NOT BLOCKED' : r2.map(c => c.severity).join(',')}`);

// Audit-round-2 claim: 4 iterations may not be enough for 5+ wrappers.
const r3 = checkCommand('command exec command exec eval rm -rf /', 'linux');
console.log(`5-deep wrapper          : ${r3.length === 0 ? 'NOT BLOCKED — BUG' : r3.map(c => c.severity).join(',')}`);

const r4 = checkCommand('command exec command exec command exec rm -rf /', 'linux');
console.log(`6-deep wrapper          : ${r4.length === 0 ? 'NOT BLOCKED — BUG' : r4.map(c => c.severity).join(',')}`);

// Audit-round-2 claim: backtick-substitution.
const r5 = checkCommand('`rm -rf /`', 'linux');
console.log('`rm -rf /` (backticks)  :', r5.length === 0 ? 'NOT BLOCKED' : r5.map(c => c.severity).join(','));

// $() command substitution
const r6 = checkCommand('echo $(rm -rf /)', 'linux');
console.log(`echo $(rm -rf /)        : ${r6.length === 0 ? 'NOT BLOCKED' : r6.map(c => c.severity).join(',')}`);
