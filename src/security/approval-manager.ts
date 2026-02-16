/**
 * Approval Manager: handles pending user approval requests.
 * When an agent wants to execute a WARN-level command,
 * it creates an approval request and waits for user decision.
 */

import type { ExecDecision } from './exec-guard.js';

export interface PendingApproval {
  id: string;
  decision: ExecDecision;
  toolName: string;
  args: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
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
   */
  requestApproval(
    decision: ExecDecision,
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs?: number
  ): { promise: Promise<boolean>; approval: PendingApproval } {
    const id = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    const ttl = timeoutMs ?? this.defaultTimeoutMs;

    const approval: PendingApproval = {
      id,
      decision,
      toolName,
      args,
      createdAt: now,
      expiresAt: now + ttl,
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
   * Returns false if the approval was not found (expired or already answered).
   */
  respond(approvalId: string, approved: boolean): boolean {
    const entry = this.pending.get(approvalId);
    if (!entry) return false;

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
