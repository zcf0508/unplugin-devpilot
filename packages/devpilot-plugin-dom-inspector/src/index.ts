import type { DevpilotPlugin } from 'unplugin-devpilot';
import type { DomInspectorRpc } from './shared-types';
import { clientManager, defineMcpToolRegister, resolveClientModule } from 'unplugin-devpilot';
import { z } from 'zod';

// Define plugin-specific RPC interface

export default <DevpilotPlugin>{
  namespace: 'builtin-dom-inspector',
  clientModule: resolveClientModule(import.meta.url, './client/index.mjs'),
  serverSetup(ctx) {
    // Server-side setup if needed
    return {};
  },
  mcpSetup(ctx) {
    const tools = [
      // query_selector - 精确查询DOM元素
      defineMcpToolRegister(
        'query_selector',
        {
          title: 'Query Selector',
          description: 'Query DOM elements using CSS selector with accessibility tree information',
          inputSchema: z.object({
            selector: z.string().describe('CSS selector to query elements'),
            maxDepth: z.number().optional().default(5).describe('Maximum depth to traverse'),
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
          }),
        },
        async (params) => {
          const { selector, clientId, maxDepth } = params;
          const targetClientId = clientId;

          if (!targetClientId) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'No client specified. Either provide clientId parameter or call within a task context.',
                  suggestion: 'Use list_clients tool to see available clients, or specify clientId explicitly.',
                }, null, 2),
              }],
            };
          }

          const client = clientManager.getClient<DomInspectorRpc>(targetClientId);
          if (!client) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Client ${targetClientId} not found or disconnected`,
                  availableClients: clientManager.getAllClients(),
                }, null, 2),
              }],
            };
          }

          try {
            // Call the client's querySelector method via RPC
            const result = await client.rpc.querySelector(selector, maxDepth);
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              }],
            };
          }
          catch (error) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Failed to query selector',
                  details: error instanceof Error
                    ? error.message
                    : String(error),
                }, null, 2),
              }],
            };
          }
        },
      ),

      // get_dom_tree - 获取DOM树（可访问性树）
      defineMcpToolRegister(
        'get_dom_tree',
        {
          title: 'Get DOM Tree',
          description: 'Get accessibility tree snapshot of the DOM',
          inputSchema: z.object({
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
            maxDepth: z.number().optional().default(5).describe('Maximum depth to traverse'),
          }),
        },
        async (params) => {
          const { clientId, maxDepth } = params;
          const targetClientId = clientId;

          if (!targetClientId) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'No client specified. Either provide clientId parameter or call within a task context.',
                  suggestion: 'Use list_clients tool to see available clients, or specify clientId explicitly.',
                }, null, 2),
              }],
            };
          }

          const client = clientManager.getClient<DomInspectorRpc>(targetClientId);
          if (!client) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Client ${targetClientId} not found or disconnected`,
                  availableClients: clientManager.getAllClients(),
                }, null, 2),
              }],
            };
          }

          try {
            // Call the client's getDOMTree method via RPC
            const result = await client.rpc.getDOMTree(maxDepth);
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              }],
            };
          }
          catch (error) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Failed to get DOM tree',
                  details: error instanceof Error
                    ? error.message
                    : String(error),
                }, null, 2),
              }],
            };
          }
        },
      ),

      // get_logs - 获取浏览器控制台日志
      defineMcpToolRegister(
        'get_logs',
        {
          title: 'Get Logs',
          description: 'Get browser console logs including errors, warnings, and user logs',
          inputSchema: z.object({
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
            level: z.enum(['all', 'error', 'warn', 'info', 'debug']).optional().default('all').describe('Log level filter'),
            limit: z.number().optional().default(100).describe('Maximum number of logs to return'),
          }),
        },
        async (params) => {
          const { clientId, level, limit } = params;
          const targetClientId = clientId;

          if (!targetClientId) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'No client specified. Either provide clientId parameter or call within a task context.',
                  suggestion: 'Use list_clients tool to see available clients, or specify clientId explicitly.',
                }, null, 2),
              }],
            };
          }

          const client = clientManager.getClient<DomInspectorRpc>(targetClientId);
          if (!client) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Client ${targetClientId} not found or disconnected`,
                  availableClients: clientManager.getAllClients(),
                  suggestion: 'The client may have disconnected. Try refreshing the browser.',
                }, null, 2),
              }],
            };
          }

          try {
            // Call the client's getLogs method via RPC
            const result = await client.rpc.getLogs({ level, limit });
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              }],
            };
          }
          catch (error) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Failed to get logs',
                  details: error instanceof Error
                    ? error.message
                    : String(error),
                  suggestion: 'Make sure the browser client is properly connected and logs are being captured.',
                }, null, 2),
              }],
            };
          }
        },
      ),
    ];

    return tools;
  },
};
