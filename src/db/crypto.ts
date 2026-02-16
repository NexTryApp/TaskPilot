/**
 * Simple encryption for sensitive settings (API keys) stored in SQLite.
 * Uses AES-256-GCM with a random key persisted to disk on first run.
 * NOT a substitute for proper secrets management — but prevents plaintext storage.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/** Path to the encryption key file (generated once, persisted). */
const KEY_FILE = path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))), 'data', '.encryption-key');

/** Cache the key in memory after first load. */
let cachedKey: Buffer | null = null;

/**
 * Get or create the encryption key.
 * On first run: generates 32 random bytes and writes to data/.encryption-key.
 * On subsequent runs: reads from disk.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const dir = path.dirname(KEY_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (existsSync(KEY_FILE)) {
    const hex = readFileSync(KEY_FILE, 'utf8').trim();
    cachedKey = Buffer.from(hex, 'hex');
    if (cachedKey.length !== 32) {
      // Corrupted key file — regenerate
      cachedKey = null;
    }
  }

  if (!cachedKey) {
    cachedKey = randomBytes(32);
    writeFileSync(KEY_FILE, cachedKey.toString('hex'), { mode: 0o600 });
  }

  return cachedKey;
}

/**
 * Encrypt a string value.
 * Returns base64-encoded string: iv + authTag + ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: iv(16) + authTag(16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt a base64-encoded encrypted string.
 */
export function decrypt(encryptedBase64: string): string {
  const key = getKey();
  const packed = Buffer.from(encryptedBase64, 'base64');

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Check if a string looks like an encrypted value (base64 with minimum length).
 */
export function isEncrypted(value: string): boolean {
  if (value.length < 48) return false; // minimum: 16 + 16 + at least 1 byte = 33 bytes = ~44 base64 chars
  try {
    Buffer.from(value, 'base64');
    return true;
  } catch {
    return false;
  }
}
