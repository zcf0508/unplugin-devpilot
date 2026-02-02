import type { Server } from 'node:http';
import type { DevpilotPlugin } from './options';
import type { McpServerRegister } from './plugin';
import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { version } from '../../package.json';
import { clientManager } from './client-manager';

let httpServer: Server | null = null;

// Store plugin server methods
let mcpRegeisterMethods: Record<string, McpServerRegister[]> = {};

/**
 * Register plugin server methods
 */
export function registerPluginServerMethods(plugins: DevpilotPlugin[]): void {
  const ctx = { wsPort: 0 }; // Will be updated when starting server
  mcpRegeisterMethods = {};

  for (const plugin of plugins) {
    if (plugin.mcpSetup) {
      try {
        const mcps = plugin.mcpSetup(ctx);
        mcpRegeisterMethods[plugin.namespace] = mcps;
      }
      catch (error) {
        console.error(`[unplugin-devpilot] Failed to setup mcp servers for plugin ${plugin.namespace}:`, error);
      }
    }
  }
}

export async function startMcpServer(port: number): Promise<Server> {
  if (httpServer) {
    return httpServer;
  }

  httpServer = createServer();

  httpServer.on('request', (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/mcp') {
      const mcpServer = new McpServer({
        name: 'unplugin-devpilot',
        version,
      });

      mcpServer.registerTool(
        'list_clients',
        {
          title: 'List Clients',
          description: 'List all connected browser instances',
          inputSchema: {
            activeOnly: z.boolean().optional().default(true).describe('Only list active clients'),
          },
        },
        async (params) => {
          const clients = clientManager.getAllClients(params.activeOnly);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ clients, total: clients.length }, null, 2),
            }],
          };
        },
      );

      mcpServer.registerTool(
        'get_pending_tasks',
        {
          title: 'Get Pending Tasks',
          description: 'Get pending tasks submitted from browser',
          inputSchema: {
            clearAfterFetch: z.boolean().optional().default(true).describe('Clear tasks after fetching'),
          },
        },
        async (params) => {
          const tasks = clientManager.getPendingTasks(params.clearAfterFetch);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                hasTasks: tasks.length > 0,
                tasks,
                message: tasks.length > 0
                  ? `Found ${tasks.length} pending task(s)`
                  : 'No pending tasks',
              }, null, 2),
            }],
          };
        },
      );

      Object.entries(mcpRegeisterMethods).forEach(([namespace, mcpRegeisters]) => {
        mcpRegeisters.forEach((mcpRegeister) => {
          const { name: _name, config, cb } = mcpRegeister();
          const name = _name.startsWith(`${namespace}/`)
            ? _name
            : `${namespace}/${_name}`;
          mcpServer.registerTool(name, config, cb);
        });
      });

      const transport = new StreamableHTTPServerTransport();
      mcpServer.connect(transport);

      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const parsedBody = JSON.parse(body);
            transport.handleRequest(req, res, parsedBody);
          }
          catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
      }
      else if (req.method === 'GET') {
        transport.handleRequest(req, res);
      }
      else {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      }
    }
    else if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    }
    else if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        message: 'unplugin-devpilot MCP Server',
        endpoint: '/mcp',
      }));
    }
    else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  return new Promise((resolve) => {
    httpServer!.listen(port, () => {
      console.warn(`[unplugin-devpilot] MCP server listening on http://localhost:${port}/mcp`);
      resolve(httpServer!);
    });
  });
}

export function stopMcpServer(): void {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}
