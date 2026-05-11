/**
 * Approval Manager: handles pending user approval requests.
 * When an agent wants to execute a WARN-level command,
 * it creates an approval request and waits for user decision.
 */

import { randomUUID } from 'crypto';
import type { ExecDecision } from './exec-guard.js';

export interface PendingApproval {
  id: string;
  decision: ExecDecision;
  toolName: string;
  args: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
  /**
   * Optional owner tag — when set, only requests carrying the same tag are
   * allowed to respond. Used to bind an approval to a specific session so
   * a different session (with a valid session token) can't approve a command
   * that wasn't theirs.
   */
  ownerTag?: string;
}

export class ApprovalManager {
  private pending = new Map<string, {
    resolve: (approved: boolean) => void;
    timeout: ReturnType<typeof setTimeout>;
    approval: PendingApproval;
  }>();

  private defaultTimeoutMs: number;

  constructor(defaultTimeoutMs = 60_000) {
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Create an approval request and wait for user response.
   * Returns a promise that resolves to true (approved) or false (denied/timeout).
   *
   * Pass `ownerTag` to bind the approval to a specific principal/session.
   * Subsequent `respond()` calls must pass the same tag to succeed.
   */
  requestApproval(
    decision: ExecDecision,
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
    ownerTag?: string
  ): { promise: Promise<boolean>; approval: PendingApproval } {
    // SECURITY: previously used Date.now() + Math.random().slice(2,7) — only ~5
    // chars of base36 randomness, brute-forceable. randomUUID() gives 122 bits of
    // CSPRNG entropy via Node's crypto module — unguessable by external callers.
    const id = `approval_${randomUUID()}`;
    const now = Date.now();
    const ttl = timeoutMs ?? this.defaultTimeoutMs;

    const approval: PendingApproval = {
      id,
      decision,
      toolName,
      args,
      createdAt: now,
      expiresAt: now + ttl,
      ownerTag,
    };

    const promise = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        // Auto-deny on timeout
        this.pending.delete(id);
        resolve(false);
      }, ttl);

      this.pending.set(id, { resolve, timeout, approval });
    });

    return { promise, approval };
  }

  /**
   * Respond to a pending approval request.
   * Returns false if the approval was not found (expired or already answered)
   * or if the ownerTag doesn't match.
   */
  respond(approvalId: string, approved: boolean, ownerTag?: string): boolean {
    const entry = this.pending.get(approvalId);
    if (!entry) return false;

    // SECURITY: enforce session ownership when the approval was created with
    // an ownerTag. Approvals without an ownerTag accept any caller (back-compat
    // for direct library use without the web server in front of it).
    if (entry.approval.ownerTag !== undefined && entry.approval.ownerTag !== ownerTag) {
      return false;
    }

    clearTimeout(entry.timeout);
    this.pending.delete(approvalId);
    entry.resolve(approved);
    return true;
  }

  /**
   * Get all pending approval requests.
   */
  getPending(): PendingApproval[] {
    return Array.from(this.pending.values()).map(e => e.approval);
  }

  /**
   * Cancel all pending approvals (deny all).
   */
  cancelAll(): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timeout);
      entry.resolve(false);
    }
    this.pending.clear();
  }
}
