/**
 * Model Context Protocol (MCP) Client for TaskPilot
 *
 * Connects to MCP servers via stdio (child process) or HTTP (fetch).
 * Implements the JSON-RPC 2.0 handshake, tool discovery, and tool execution
 * as defined by the MCP specification (protocol version 2024-11-05).
 */

import { spawn, ChildProcess } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpServerConfig {
  name: string;
  transport: 'stdio' | 'http';
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // http
  url?: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROTOCOL_VERSION = '2024-11-05';
const CLIENT_NAME = 'TaskPilot';
const CLIENT_VERSION = '1.0.0';
const REQUEST_TIMEOUT_MS = 10_000;
const LOG_PREFIX = '[MCP]';

// ---------------------------------------------------------------------------
// Transport interface
// ---------------------------------------------------------------------------

interface Transport {
  send(message: JsonRpcRequest): void;
  onMessage(handler: (msg: JsonRpcResponse) => void): void;
  close(): void;
  get alive(): boolean;
}

// ---------------------------------------------------------------------------
// Stdio Transport
// ---------------------------------------------------------------------------

class StdioTransport implements Transport {
  private process: ChildProcess | null = null;
  private messageHandler: ((msg: JsonRpcResponse) => void) | null = null;
  private buffer = '';
  private _alive = false;
  private contentLength: number | null = null;

  constructor(
    private command: string,
    private args: string[],
    private env: Record<string, string>,
  ) {}

  start(): void {
    const merged = { ...process.env, ...this.env };
    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: merged,
    });
    this._alive = true;

    this.process.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8');
      this.processBuffer();
    });

    this.process.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8').trim();
      if (text) {
        console.error(`${LOG_PREFIX} [${this.command}] stderr: ${text}`);
      }
    });

    this.process.on('error', (err) => {
      console.error(`${LOG_PREFIX} Process error for "${this.command}":`, err.message);
      this._alive = false;
    });

    this.process.on('close', (code) => {
      console.log(`${LOG_PREFIX} Process "${this.command}" exited with code ${code}`);
      this._alive = false;
    });
  }

  /**
   * Parse the incoming stdout stream.  MCP stdio uses the same framing as
   * LSP: `Content-Length: N\r\n\r\n{json-body}`.
   */
  private processBuffer(): void {
    while (true) {
      if (this.contentLength === null) {
        // Look for the header boundary
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return; // need more data

        const headerSection = this.buffer.slice(0, headerEnd);
        const match = headerSection.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          // Malformed header; skip past it and try again
          console.error(`${LOG_PREFIX} Malformed header, discarding: ${headerSection}`);
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }
        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }

      // Now we know how many bytes to expect for the JSON body
      if (Buffer.byteLength(this.buffer, 'utf-8') < this.contentLength) {
        return; // need more data
      }

      // Extract exactly contentLength bytes
      const bodyBytes = Buffer.from(this.buffer, 'utf-8').slice(0, this.contentLength);
      const body = bodyBytes.toString('utf-8');
      // Advance the string buffer past the consumed bytes
      this.buffer = Buffer.from(this.buffer, 'utf-8').slice(this.contentLength).toString('utf-8');
      this.contentLength = null;

      try {
        const parsed = JSON.parse(body) as JsonRpcResponse;
        if (this.messageHandler) {
          this.messageHandler(parsed);
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} Failed to parse JSON body:`, body);
      }
    }
  }

  send(message: JsonRpcRequest): void {
    if (!this.process || !this._alive) {
      throw new Error(`${LOG_PREFIX} Cannot send — stdio process is not running`);
    }
    const json = JSON.stringify(message);
    const encoded = Buffer.from(json, 'utf-8');
    const frame = `Content-Length: ${encoded.byteLength}\r\n\r\n`;
    this.process.stdin!.write(frame);
    this.process.stdin!.write(encoded);
  }

  onMessage(handler: (msg: JsonRpcResponse) => void): void {
    this.messageHandler = handler;
  }

  close(): void {
    this._alive = false;
    if (this.process) {
      this.process.stdin!.end();
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  get alive(): boolean {
    return this._alive;
  }
}

// ---------------------------------------------------------------------------
// HTTP Transport
// ---------------------------------------------------------------------------

class HttpTransport implements Transport {
  private messageHandler: ((msg: JsonRpcResponse) => void) | null = null;
  private _alive = false;

  constructor(private baseUrl: string) {}

  start(): void {
    this._alive = true;
  }

  send(message: JsonRpcRequest): void {
    if (!this._alive) {
      throw new Error(`${LOG_PREFIX} Cannot send — HTTP transport is closed`);
    }

    // For notifications (no id) we fire-and-forget.
    // For requests (with id) we POST and route the response via messageHandler.
    const url = this.baseUrl.replace(/\/+$/, '') + '/';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeout);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        const body = (await res.json()) as JsonRpcResponse;
        if (this.messageHandler && message.id !== undefined) {
          this.messageHandler(body);
        }
      })
      .catch((err) => {
        clearTimeout(timeout);
        if (message.id !== undefined && this.messageHandler) {
          // Synthesize an error response so the pending promise can reject properly
          this.messageHandler({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32000,
              message: err instanceof Error ? err.message : String(err),
            },
          });
        } else {
          console.error(`${LOG_PREFIX} HTTP send error:`, err instanceof Error ? err.message : err);
        }
      });
  }

  onMessage(handler: (msg: JsonRpcResponse) => void): void {
    this.messageHandler = handler;
  }

  close(): void {
    this._alive = false;
  }

  get alive(): boolean {
    return this._alive;
  }
}

// ---------------------------------------------------------------------------
// McpClient
// ---------------------------------------------------------------------------

export class McpClient {
  private transport: Transport | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private _connected = false;
  private cachedTools: McpTool[] | null = null;

  constructor(private config: McpServerConfig) {}

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Establish the connection to the MCP server, perform the `initialize`
   * handshake and send the `notifications/initialized` notification.
   */
  async connect(): Promise<void> {
    if (this._connected) {
      console.log(`${LOG_PREFIX} Already connected to "${this.config.name}"`);
      return;
    }

    console.log(`${LOG_PREFIX} Connecting to "${this.config.name}" via ${this.config.transport}...`);

    this.transport = this.createTransport();
    this.transport.onMessage((msg) => this.handleMessage(msg));

    // Start the transport (spawns process or marks HTTP ready)
    if (this.transport instanceof StdioTransport) {
      (this.transport as StdioTransport).start();
    } else {
      (this.transport as HttpTransport).start();
    }

    // JSON-RPC initialize handshake
    const initResult = await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
    });
    console.log(`${LOG_PREFIX} Server "${this.config.name}" initialized:`, JSON.stringify(initResult));

    // Send initialized notification (no id — fire-and-forget)
    this.notify('notifications/initialized');

    this._connected = true;
    console.log(`${LOG_PREFIX} Connected to "${this.config.name}"`);
  }

  /**
   * Discover available tools from the MCP server.
   * Results are cached after the first successful call; call `connect()`
   * again (after `disconnect()`) to clear the cache.
   */
  async listTools(): Promise<McpTool[]> {
    this.ensureConnected();

    if (this.cachedTools) {
      return this.cachedTools;
    }

    const result = (await this.request('tools/list', {})) as { tools: McpTool[] };
    const tools: McpTool[] = (result.tools ?? []).map((t) => ({
      name: t.name as string,
      description: (t.description as string) ?? '',
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
    }));

    this.cachedTools = tools;
    console.log(`${LOG_PREFIX} Discovered ${tools.length} tool(s) from "${this.config.name}"`);
    return tools;
  }

  /**
   * Execute a tool on the MCP server and return its result.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    this.ensureConnected();
    console.log(`${LOG_PREFIX} Calling tool "${name}" on "${this.config.name}"...`);

    const result = await this.request('tools/call', { name, arguments: args });
    return result;
  }

  /**
   * Gracefully disconnect from the MCP server.
   */
  disconnect(): void {
    if (!this.transport) return;

    console.log(`${LOG_PREFIX} Disconnecting from "${this.config.name}"...`);

    // Reject all pending requests
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`${LOG_PREFIX} Disconnected while waiting for response (id=${id})`));
    }
    this.pending.clear();

    this.transport.close();
    this.transport = null;
    this._connected = false;
    this.cachedTools = null;

    console.log(`${LOG_PREFIX} Disconnected from "${this.config.name}"`);
  }

  /**
   * Whether the client currently believes it is connected.
   * This checks both our own flag and the underlying transport liveness.
   */
  get isConnected(): boolean {
    return this._connected && (this.transport?.alive ?? false);
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private createTransport(): Transport {
    if (this.config.transport === 'stdio') {
      if (!this.config.command) {
        throw new Error(`${LOG_PREFIX} stdio transport requires "command" in config`);
      }
      return new StdioTransport(
        this.config.command,
        this.config.args ?? [],
        this.config.env ?? {},
      );
    }

    if (this.config.transport === 'http') {
      if (!this.config.url) {
        throw new Error(`${LOG_PREFIX} http transport requires "url" in config`);
      }
      return new HttpTransport(this.config.url);
    }

    throw new Error(`${LOG_PREFIX} Unsupported transport: ${this.config.transport}`);
  }

  /**
   * Send a JSON-RPC request and return a promise that resolves with the
   * result or rejects with an error.  Automatically times out.
   */
  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.transport || !this.transport.alive) {
        return reject(new Error(`${LOG_PREFIX} Transport not available`));
      }

      const id = this.nextId++;

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${LOG_PREFIX} Request timed out after ${REQUEST_TIMEOUT_MS}ms (method="${method}", id=${id})`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.transport.send({ jsonrpc: '2.0', id, method, params });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  private notify(method: string, params?: Record<string, unknown>): void {
    if (!this.transport || !this.transport.alive) {
      console.error(`${LOG_PREFIX} Cannot send notification — transport not available`);
      return;
    }
    try {
      const message: JsonRpcRequest = { jsonrpc: '2.0', method };
      if (params) {
        message.params = params;
      }
      this.transport.send(message);
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to send notification "${method}":`, err);
    }
  }

  /**
   * Route incoming JSON-RPC responses to their pending promise.
   */
  private handleMessage(msg: JsonRpcResponse): void {
    if (msg.id === undefined || msg.id === null) {
      // Server-initiated notification — log and ignore
      console.log(`${LOG_PREFIX} Server notification:`, JSON.stringify(msg));
      return;
    }

    const entry = this.pending.get(msg.id);
    if (!entry) {
      console.warn(`${LOG_PREFIX} Received response for unknown id ${msg.id}`);
      return;
    }

    clearTimeout(entry.timer);
    this.pending.delete(msg.id);

    if (msg.error) {
      entry.reject(
        new Error(`${LOG_PREFIX} Server error (code ${msg.error.code}): ${msg.error.message}`),
      );
    } else {
      entry.resolve(msg.result);
    }
  }

  private ensureConnected(): void {
    if (!this._connected || !this.transport?.alive) {
      throw new Error(`${LOG_PREFIX} Not connected to "${this.config.name}". Call connect() first.`);
    }
  }
}
