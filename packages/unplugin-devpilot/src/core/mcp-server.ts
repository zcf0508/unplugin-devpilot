import type { Server } from 'node:http';
import type { DevpilotPlugin } from './options';
import type { McpServerRegister } from './plugin';
import type { ClientDiscoveryFilter } from './types';
import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { version } from '../../package.json';
import { clientManager } from './client-manager';
import { getPluginStorage } from './storage';

let httpServer: Server | null = null;

// Store plugin server methods
let mcpRegeisterMethods: Record<string, McpServerRegister[]> = {};

/**
 * Register plugin server methods
 */
export function registerPluginMcpRegisterMethods(plugins: DevpilotPlugin[]): void {
  mcpRegeisterMethods = {};

  for (const plugin of plugins) {
    if (plugin.mcpSetup) {
      try {
        const ctx = { wsPort: 0, storage: getPluginStorage(plugin.namespace) };
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
      try {
        const mcpServer = new McpServer({
          name: 'unplugin-devpilot',
          version,
        });

        mcpServer.registerTool(
          'list_clients',
          {
            title: 'List Clients',
            description: 'List all connected browser instances with optional filtering by URL, title, or clientId',
            inputSchema: {
              activeOnly: z.boolean().optional().default(true).describe('Only list active clients'),
              urlPattern: z.string().optional().describe('Filter clients by URL pattern (substring match, case-insensitive)'),
              titlePattern: z.string().optional().describe('Filter clients by page title pattern (substring match, case-insensitive)'),
              clientId: z.string().optional().describe('Filter by specific client ID'),
              groupByUrl: z.boolean().optional().default(false).describe('Group results by URL for easier identification'),
            },
          },
          async (params) => {
            const filter: ClientDiscoveryFilter = {
              activeOnly: params.activeOnly,
              urlPattern: params.urlPattern,
              titlePattern: params.titlePattern,
              clientId: params.clientId,
            };

            let clients;
            let grouped: Record<string, any[]> | undefined;

            if (params.groupByUrl) {
              grouped = clientManager.getClientsByUrl();
              // Flatten grouped clients for backward compatibility
              clients = Object.values(grouped).flat();
            }
            else {
              clients = clientManager.findClients(filter);
            }

            const result: Record<string, any> = {
              clients,
              total: clients.length,
            };

            if (params.groupByUrl) {
              result.grouped = grouped;
            }

            // Add helpful suggestions if no clients found
            if (clients.length === 0) {
              result.suggestions = [
                'No clients found. Make sure the browser has the devpilot extension loaded.',
                'Try refreshing the browser page to reconnect.',
                'Use activeOnly=false to see recently disconnected clients.',
              ];

              if (params.urlPattern) {
                result.suggestions.push(`No clients match URL pattern: "${params.urlPattern}"`);
              }
            }

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
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

        mcpServer.registerTool(
          'find_clients_by_url',
          {
            title: 'Find Clients by URL',
            description: 'Find browser clients matching a URL pattern. Useful for reconnecting to specific pages after refresh.',
            inputSchema: {
              urlPattern: z.string().describe('URL pattern to search for (substring match, case-insensitive)'),
              exactMatch: z.boolean().optional().default(false).describe('Require exact URL match instead of substring'),
            },
          },
          async (params) => {
            const { urlPattern, exactMatch } = params;

            const allClients = clientManager.getAllClients(true);
            let matchedClients: typeof allClients;

            if (exactMatch) {
              matchedClients = allClients.filter(c => c.url === urlPattern);
            }
            else {
              const patternLower = urlPattern.toLowerCase();
              matchedClients = allClients.filter(c => c.url.toLowerCase().includes(patternLower));
            }

            const result: Record<string, any> = {
              matchedClients,
              total: matchedClients.length,
              query: { urlPattern, exactMatch },
            };

            if (matchedClients.length === 0) {
              // Suggest similar URLs
              const allUrls = allClients.map(c => c.url).filter(Boolean);
              result.suggestions = [
                'No clients found matching this URL.',
                'Try refreshing the browser page to reconnect.',
                'Available URLs:',
                ...allUrls.slice(0, 5).map(u => `  - ${u}`),
              ];
            }
            else if (matchedClients.length === 1) {
              const client = matchedClients[0];
              result.suggestion = `Use clientId "${client.clientId}" to target this client in other tools.`;
            }
            else {
              result.suggestion = 'Multiple clients found. Use clientId parameter to specify which one to target.';
            }

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              }],
            };
          },
        );

        mcpServer.registerTool(
          'get_task_history',
          {
            title: 'Get Task History',
            description: 'Get history of tasks (including completed and failed tasks). Useful for task recovery after page refresh.',
            inputSchema: {
              clientId: z.string().optional().describe('Filter tasks by client ID'),
              status: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional().describe('Filter by task status'),
              limit: z.number().optional().default(50).describe('Maximum number of tasks to return'),
            },
          },
          async (params) => {
            const history = clientManager.getTaskHistory({
              clientId: params.clientId,
              status: params.status,
              limit: params.limit,
            });

            const result: Record<string, any> = {
              history,
              total: history.length,
              query: params,
            };

            if (history.length === 0) {
              result.message = 'No task history found.';
              if (params.clientId) {
                result.suggestions = [
                  `No tasks found for client "${params.clientId}".`,
                  'Try without clientId filter to see all tasks.',
                ];
              }
            }

            // Group by status for easier analysis
            const groupedByStatus = history.reduce((acc, task) => {
              acc[task.status] = (acc[task.status] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            result.groupedByStatus = groupedByStatus;

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              }],
            };
          },
        );

        mcpServer.registerTool(
          'find_clients_by_title',
          {
            title: 'Find Clients by Title',
            description: 'Find browser clients by page title. Useful when URL is not unique or helpful.',
            inputSchema: {
              titlePattern: z.string().describe('Title pattern to search for (substring match, case-insensitive)'),
            },
          },
          async (params) => {
            const { titlePattern } = params;
            const patternLower = titlePattern.toLowerCase();
            const matchedClients = clientManager.getAllClients(true).filter(c =>
              c.title.toLowerCase().includes(patternLower),
            );

            const result: Record<string, any> = {
              matchedClients,
              total: matchedClients.length,
              query: { titlePattern },
            };

            if (matchedClients.length === 0) {
              const allTitles = clientManager.getAllClients(true).map(c => c.title).filter(Boolean);
              result.suggestions = [
                'No clients found matching this title.',
                'Available titles:',
                ...allTitles.slice(0, 5).map(t => `  - ${t}`),
              ];
            }

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              }],
            };
          },
        );

        Object.entries(mcpRegeisterMethods).forEach(([namespace, mcpRegeisters]) => {
          mcpRegeisters.forEach((mcpRegeister) => {
            const { name: _name, config, cb } = mcpRegeister();
            const name = _name.startsWith(`${namespace}/`)
              ? _name
              : `${namespace}_${_name}`;
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
      catch (error) {
        console.error('[unplugin-devpilot] Failed to handle MCP request:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
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

export function stopMcpServer(): Promise<void> {
  return new Promise((resolve) => {
    if (httpServer) {
      const server = httpServer;
      httpServer = null;
      server.close(() => resolve());
    }
    else {
      resolve();
    }
  });
}
