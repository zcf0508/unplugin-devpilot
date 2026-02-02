import type { BirpcReturn } from 'birpc';
import type { WebSocket } from 'ws';
import type { ClientFunctions, ClientInfo, PendingTask, ServerFunctions } from './types';
import { uniqueId } from 'es-toolkit/compat';

export interface ClientConnection {
  ws: WebSocket
  info: ClientInfo
  rpc: BirpcReturn<ClientFunctions, ServerFunctions>
}

export class ClientManager {
  private clients = new Map<string, ClientConnection>();
  private taskQueue: PendingTask[] = [];

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

  getClient(clientId: string): ClientConnection | undefined {
    return this.clients.get(clientId);
  }

  getAllClients(activeOnly = true): ClientInfo[] {
    const clients = Array.from(this.clients.values()).map(c => c.info);
    if (activeOnly) {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      return clients.filter(c => c.lastActiveAt > fiveMinutesAgo);
    }
    return clients;
  }

  addTask(task: PendingTask): void {
    this.taskQueue.push(task);
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
