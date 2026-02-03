import type { DevpilotPlugin } from 'unplugin-devpilot';
import type { DomInspectorRpc } from './shared-types';
import { clientManager, defineMcpToolRegister, resolveClientModule } from 'unplugin-devpilot';
import { z } from 'zod';

// Helper function to generate intelligent error suggestions when client is not found
function generateClientNotFoundErrorSuggestions(
  targetClientId: string,
  availableClients: Array<{ clientId: string, url: string, title: string }>,
): string[] {
  const suggestions: string[] = [];

  suggestions.push(`Client "${targetClientId}" not found or disconnected.`);

  // Check if client was recently active
  const allClients = clientManager.getAllClients(false); // Include inactive clients
  const historicalClient = allClients.find(c => c.clientId === targetClientId);

  if (historicalClient) {
    suggestions.push(`This client was previously connected to: ${historicalClient.url || 'unknown URL'}`);
    suggestions.push('The browser page may have been refreshed or closed.');
    suggestions.push('Please refresh the browser page to reconnect.');
  }
  else {
    suggestions.push('This client ID has never been seen before or is invalid.');
  }

  // Suggest similar clients by URL
  if (availableClients.length > 0) {
    const urls = [...new Set(availableClients.map(c => c.url).filter(Boolean))];
    if (urls.length > 0) {
      suggestions.push('');
      suggestions.push('Available clients by URL:');
      urls.slice(0, 3).forEach((url) => {
        const matchingClients = availableClients.filter(c => c.url === url);
        suggestions.push(`  - ${url} (${matchingClients.length} client${matchingClients.length > 1
          ? 's'
          : ''})`);
      });
    }

    // Suggest using find_clients_by_url tool
    suggestions.push('');
    suggestions.push('To find the correct client:');
    suggestions.push('  1. Use list_clients() to see all connected clients');
    suggestions.push('  2. Or use find_clients_by_url({ urlPattern: "your-url" }) to search by URL');
    suggestions.push('  3. Or use find_clients_by_title({ titlePattern: "page title" }) to search by title');
  }
  else {
    suggestions.push('');
    suggestions.push('No other clients are currently connected.');
    suggestions.push('Please refresh the browser page to reconnect.');
  }

  return suggestions;
}

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
            const availableClients = clientManager.getAllClients();
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Client ${targetClientId} not found or disconnected`,
                  suggestions: generateClientNotFoundErrorSuggestions(targetClientId, availableClients),
                  availableClients,
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
            const availableClients = clientManager.getAllClients();
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Client ${targetClientId} not found or disconnected`,
                  suggestions: generateClientNotFoundErrorSuggestions(targetClientId, availableClients),
                  availableClients,
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
            const availableClients = clientManager.getAllClients();
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Client ${targetClientId} not found or disconnected`,
                  suggestions: generateClientNotFoundErrorSuggestions(targetClientId, availableClients),
                  availableClients,
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
