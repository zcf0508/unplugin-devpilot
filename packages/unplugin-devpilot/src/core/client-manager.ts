import type { BirpcReturn } from 'birpc';
import type { WebSocket } from 'ws';
import type { ClientDiscoveryFilter, ClientFunctions, ClientInfo, PendingTask, ServerFunctions, TaskHistory } from './types';
import { uniqueId } from 'es-toolkit/compat';

export interface ClientConnection<T extends Record<string, any> = object> {
  ws: WebSocket
  info: ClientInfo
  rpc: BirpcReturn<ClientFunctions & T, ServerFunctions>
}

export class ClientManager {
  private clients = new Map<string, ClientConnection>();
  private taskQueue: PendingTask[] = [];
  private taskHistory: TaskHistory[] = [];
  private readonly maxTaskHistory = 1000;
  /** One-time approval tokens for MCP complete_task (key = token). */
  private completionApprovals = new Map<string, { taskId: string, expiresAt: number }>();

  generateClientId(): string {
    return uniqueId('c_');
  }

  addClient(clientId: string, ws: WebSocket, rpc: BirpcReturn<ClientFunctions, ServerFunctions>): ClientInfo {
    const now = Date.now();
    const info: ClientInfo = {
      clientId,
      url: '',
      title: '',
      userAgent: '',
      connectedAt: now,
      lastActiveAt: now,
      active: true,
    };
    this.clients.set(clientId, { ws, info, rpc });
    return info;
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  updateClientInfo(clientId: string, update: Partial<Omit<ClientInfo, 'clientId' | 'connectedAt'>>): void {
    const client = this.clients.get(clientId);
    if (client) {
      Object.assign(client.info, update, { lastActiveAt: Date.now() });
    }
  }

  getClient<T extends Record<string, any> = object>(clientId: string): ClientConnection<T> | undefined {
    return this.clients.get(clientId) as ClientConnection<T> | undefined;
  }

  getAllClients(): ClientInfo[] {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return Array.from(this.clients.values()).map((c) => {
      return {
        ...c.info,
        active: c.info.lastActiveAt > fiveMinutesAgo,
      };
    });
  }

  /**
   * Find clients by URL pattern or other filters
   */
  findClients(filter: ClientDiscoveryFilter): ClientInfo[] {
    const clients = this.getAllClients();

    return clients.filter((client) => {
      // Filter by clientId if specified
      if (filter.clientId && client.clientId !== filter.clientId) {
        return false;
      }

      // Filter by URL pattern (case-insensitive substring match)
      if (filter.urlPattern && client.url) {
        const urlLower = client.url.toLowerCase();
        const patternLower = filter.urlPattern.toLowerCase();
        if (!urlLower.includes(patternLower)) {
          return false;
        }
      }

      // Filter by title pattern (case-insensitive substring match)
      if (filter.titlePattern && client.title) {
        const titleLower = client.title.toLowerCase();
        const patternLower = filter.titlePattern.toLowerCase();
        if (!titleLower.includes(patternLower)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get clients grouped by URL for easier identification
   */
  getClientsByUrl(): Record<string, ClientInfo[]> {
    const result: Record<string, ClientInfo[]> = {};
    const clients = this.getAllClients();

    for (const client of clients) {
      const url = client.url || 'unknown';
      if (!result[url]) {
        result[url] = [];
      }
      result[url].push(client);
    }

    return result;
  }

  addTask(task: PendingTask): void {
    this.taskQueue.push(task);

    // Add to history with pending status
    const taskHistory: TaskHistory = {
      ...task,
      status: 'pending',
    };
    this.taskHistory.push(taskHistory);

    // Keep history size manageable
    if (this.taskHistory.length > this.maxTaskHistory) {
      this.taskHistory = this.taskHistory.slice(-this.maxTaskHistory);
    }

    this.notifyAllClients();
  }

  getPendingTasks(clear = true): PendingTask[] {
    const tasks = [...this.taskQueue];
    if (clear) {
      this.taskQueue = [];
      this.notifyAllClients();
    }
    return tasks;
  }

  /** Snapshot of the queue without removing tasks (for browser UI). */
  peekPendingTasks(): PendingTask[] {
    return [...this.taskQueue];
  }

  getTaskCount(): number {
    return this.taskQueue.length;
  }

  getTaskDashboard(): { pending: PendingTask[], inProgress: TaskHistory[] } {
    return {
      pending: this.peekPendingTasks(),
      inProgress: this.getTaskHistory({ status: 'in_progress', limit: 50 }),
    };
  }

  /**
   * Remove a task from the queue and mark it in progress in history.
   */
  claimTask(taskId: string): { ok: true, task: PendingTask } | { ok: false, error: string } {
    const idx = this.taskQueue.findIndex(t => t.id === taskId);
    if (idx === -1) {
      return { ok: false, error: 'Task not in queue (already claimed or invalid id)' };
    }
    const [task] = this.taskQueue.splice(idx, 1);
    const hist = this.taskHistory.find(t => t.id === taskId);
    if (hist && hist.status === 'pending') {
      hist.status = 'in_progress';
    }
    this.notifyAllClients();
    return { ok: true, task };
  }

  /**
   * Browser-only: create a one-time token so the developer can paste it to the agent for complete_task.
   */
  createCompletionApproval(taskId: string): { token: string } | { error: string } {
    const hist = this.taskHistory.find(t => t.id === taskId && t.status === 'in_progress');
    if (!hist) {
      return { error: 'No in-progress task with this id' };
    }
    const token = uniqueId('appr_');
    this.completionApprovals.set(token, { taskId, expiresAt: Date.now() + 10 * 60 * 1000 });
    return { token };
  }

  /**
   * MCP: complete a task only with a valid approval token from the browser.
   */
  completeTaskWithApproval(
    taskId: string,
    token: string,
    result?: Record<string, any>,
  ): { ok: true } | { ok: false, error: string } {
    const entry = this.completionApprovals.get(token);
    if (!entry) {
      return { ok: false, error: 'Invalid or unknown approval token' };
    }
    if (entry.expiresAt < Date.now()) {
      this.completionApprovals.delete(token);
      return { ok: false, error: 'Approval token expired; ask the developer to issue a new one in the Tasks panel' };
    }
    if (entry.taskId !== taskId) {
      return { ok: false, error: 'Token does not match taskId' };
    }
    const task = this.taskHistory.find(t => t.id === taskId);
    if (!task || task.status !== 'in_progress') {
      return { ok: false, error: 'Task is not in progress' };
    }
    this.completionApprovals.delete(token);
    task.status = 'completed';
    task.completedAt = Date.now();
    task.completedBy = 'mcp';
    task.result = result;
    this.notifyTaskCompleted(taskId);
    return { ok: true };
  }

  /**
   * Get task history with optional filters
   */
  getTaskHistory(filter?: {
    clientId?: string
    status?: TaskHistory['status']
    limit?: number
  }): TaskHistory[] {
    let history = [...this.taskHistory];

    if (filter?.clientId) {
      history = history.filter(t => t.sourceClient === filter.clientId);
    }

    if (filter?.status) {
      history = history.filter(t => t.status === filter.status);
    }

    if (filter?.limit) {
      history = history.slice(-filter.limit);
    }

    return history;
  }

  /**
   * Mark a task as in progress
   */
  markTaskInProgress(taskId: string, clientId: string): void {
    const task = this.taskHistory.find(t => t.id === taskId);
    if (task && task.status === 'pending') {
      task.status = 'in_progress';
    }
  }

  /**
   * Mark a task as completed
   */
  markTaskCompleted(taskId: string, clientId: string, result?: Record<string, any>): void {
    const task = this.taskHistory.find(t => t.id === taskId);
    if (task) {
      task.status = 'completed';
      task.completedAt = Date.now();
      task.completedBy = clientId;
      task.result = result;
    }
  }

  /**
   * Mark a task as failed
   */
  markTaskFailed(taskId: string, clientId: string, error?: string): void {
    const task = this.taskHistory.find(t => t.id === taskId);
    if (task) {
      task.status = 'failed';
      task.completedAt = Date.now();
      task.completedBy = clientId;
      task.result = { error };
    }
  }

  private notifyAllClients(): void {
    const count = this.taskQueue.length;
    for (const client of this.clients.values()) {
      client.rpc.notifyTaskUpdate(count).catch(() => {});
    }
  }

  notifyTaskCompleted(taskId: string, clientId?: string): void {
    if (clientId) {
      const client = this.clients.get(clientId);
      if (client) {
        client.rpc.notifyTaskCompleted(taskId).catch(() => {});
      }
    }
    else {
      for (const client of this.clients.values()) {
        client.rpc.notifyTaskCompleted(taskId).catch(() => {});
      }
    }
  }
}

export const clientManager: ClientManager = new ClientManager();
