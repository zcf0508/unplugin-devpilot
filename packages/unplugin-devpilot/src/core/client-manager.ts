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

  getAllClients(activeOnly = true): ClientInfo[] {
    const clients = Array.from(this.clients.values()).map(c => c.info);
    if (activeOnly) {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      return clients.filter(c => c.lastActiveAt > fiveMinutesAgo);
    }
    return clients;
  }

  /**
   * Find clients by URL pattern or other filters
   */
  findClients(filter: ClientDiscoveryFilter): ClientInfo[] {
    const clients = this.getAllClients(filter.activeOnly ?? true);

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
    const clients = this.getAllClients(true);

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

  getTaskCount(): number {
    return this.taskQueue.length;
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
