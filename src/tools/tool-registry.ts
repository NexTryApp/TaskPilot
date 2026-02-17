/**
 * Tool registry: register tools and build OpenAI-compatible schemas for LLM.
 * Supports access control via AccessPolicy and AccessContext.
 */

import type {
  ToolDefinition,
  ToolExecutor,
  AccessContext,
  AccessPolicy,
  ToolGuard,
} from '../types.js';

export class ToolRegistry {
  private tools = new Map<string, ToolExecutor>();
  private policy: AccessPolicy | null = null;

  register(executor: ToolExecutor): void {
    this.tools.set(executor.name, executor);
  }

  /** Set access policy: which tools are available to whom, optionally with guard. */
  setAccessPolicy(policy: AccessPolicy | null): void {
    this.policy = policy;
  }

  get(name: string): ToolExecutor | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolExecutor[] {
    return Array.from(this.tools.values());
  }

  getDefinitions(): ToolDefinition[] {
    // Filter out tools that are denied or not in allowedTools — don't show LLM tools it can't use
    const all = this.getAll();
    if (!this.policy) return all.map((t) => t.definition);

    return all
      .filter((t) => {
        if (this.policy!.deniedTools?.includes(t.name)) return false;
        const allowed = this.policy!.allowedTools;
        if (allowed?.length) {
          return allowed.includes('*') || allowed.includes(t.name);
        }
        return true;
      })
      .map((t) => t.definition);
  }

  private checkAccess(context: AccessContext | undefined, toolName: string): void {
    // REMOVED: if (!context) return; — policy ALWAYS applies regardless of context
    const policy = this.policy;
    if (!policy) return;

    if (policy.deniedTools?.includes(toolName)) {
      throw new AccessDeniedError(`Tool denied by policy: ${toolName}`);
    }
    const allowed = policy.allowedTools;
    if (allowed?.length) {
      const ok = allowed.includes('*') || allowed.includes(toolName);
      if (!ok) throw new AccessDeniedError(`Tool not allowed by policy: ${toolName}`);
    }
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    context?: AccessContext
  ): Promise<string | unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);

    this.checkAccess(context, name);

    const guard = this.policy?.guard;
    if (guard && context) {
      const result = await Promise.resolve(guard(context, name, args));
      if (result === false) throw new AccessDeniedError(`Guard denied: ${name}`);
    }

    return tool.execute(args, context);
  }
}

export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessDeniedError';
  }
}
