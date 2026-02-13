import type { Server } from 'node:http';
import type { DevpilotPlugin } from './options';
import type { McpToolRegister } from './plugin';
import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { version } from '../../package.json';
import { getBuiltinTools } from './builtin-tools';
import { getPluginStorage } from './storage';

let httpServer: Server | null = null;

// Store plugin server methods
let mcpRegeisterMethods: Record<string, McpToolRegister[]> = {};

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

        for (const { name, config, cb } of getBuiltinTools()) {
          mcpServer.registerTool(name, config, cb);
        }

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
