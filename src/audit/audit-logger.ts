/**
 * Audit logger: logs each tool invocation and key run events.
 * By default writes to console; can provide custom handler (DB, file, external service).
 */

import type { AccessContext } from '../types.js';

export interface AuditEntry {
  timestamp: string;
  event: 'tool_call' | 'tool_result' | 'tool_denied' | 'run_start' | 'run_end';
  runId: string;
  principalId?: string;
  tenantId?: string;
  toolName?: string;
  /** Call arguments (no secrets — caller's responsibility). */
  args?: Record<string, unknown>;
  /** Error, if any. */
  error?: string;
  /** Additional data. */
  meta?: Record<string, unknown>;
}

export type AuditHandler = (entry: AuditEntry) => void | Promise<void>;

function defaultHandler(entry: AuditEntry): void {
  const line = JSON.stringify(entry);
  console.log(`[audit] ${line}`);
}

export class AuditLogger {
  private handler: AuditHandler;

  constructor(handler?: AuditHandler) {
    this.handler = handler ?? defaultHandler;
  }

  log(entry: AuditEntry): void {
    try {
      this.handler(entry);
    } catch {
      // audit must not break the main flow
    }
  }

  toolCall(
    context: AccessContext | undefined,
    toolName: string,
    args: Record<string, unknown>
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      event: 'tool_call',
      runId: context?.runId ?? 'unknown',
      principalId: context?.principal.id,
      tenantId: context?.principal.tenantId,
      toolName,
      args,
    });
  }

  toolResult(
    context: AccessContext | undefined,
    toolName: string,
    meta?: Record<string, unknown>
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      event: 'tool_result',
      runId: context?.runId ?? 'unknown',
      principalId: context?.principal.id,
      tenantId: context?.principal.tenantId,
      toolName,
      meta,
    });
  }

  toolDenied(
    context: AccessContext | undefined,
    toolName: string,
    error: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      event: 'tool_denied',
      runId: context?.runId ?? 'unknown',
      principalId: context?.principal.id,
      tenantId: context?.principal.tenantId,
      toolName,
      error,
    });
  }

  runStart(context: AccessContext | undefined, goal: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      event: 'run_start',
      runId: context?.runId ?? 'unknown',
      principalId: context?.principal.id,
      tenantId: context?.principal.tenantId,
      meta: { goal },
    });
  }

  runEnd(context: AccessContext | undefined, steps: number, done: boolean): void {
    this.log({
      timestamp: new Date().toISOString(),
      event: 'run_end',
      runId: context?.runId ?? 'unknown',
      principalId: context?.principal.id,
      tenantId: context?.principal.tenantId,
      meta: { steps, done },
    });
  }
}
