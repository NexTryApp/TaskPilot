/**
 * Database module — centralized exports.
 */

export { initDatabase, DEFAULT_DB_PATH } from './schema.js';
export { Repository } from './repository.js';
export type { RunRecord, RunStepRecord, SecurityEventRecord } from './repository.js';
export { encrypt, decrypt } from './crypto.js';
