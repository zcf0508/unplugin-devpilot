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

// Helper function to handle client RPC calls with common error handling
async function handleClientRpc<T>(
  clientId: string | undefined,
  rpcMethod: (client: NonNullable<ReturnType<typeof clientManager.getClient<DomInspectorRpc>>>) => Promise<T>,
): Promise<{ content: Array<{ type: 'text', text: string }> }> {
  if (!clientId) {
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

  const client = clientManager.getClient<DomInspectorRpc>(clientId);
  if (!client) {
    const availableClients = clientManager.getAllClients();
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: `Client ${clientId} not found or disconnected`,
          suggestions: generateClientNotFoundErrorSuggestions(clientId, availableClients),
          availableClients,
        }, null, 2),
      }],
    };
  }

  try {
    const result = await rpcMethod(client);
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
          error: 'RPC call failed',
          details: error instanceof Error
            ? error.message
            : String(error),
        }, null, 2),
      }],
    };
  }
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
          return handleClientRpc(clientId, async (client) => {
            return await client.rpc.querySelector(selector, maxDepth);
          });
        },
      ),

      // get_compact_snapshot - 获取紧凑DOM快照（agent-browser风格）
      defineMcpToolRegister(
        'get_compact_snapshot',
        {
          title: 'Get Compact Snapshot',
          description: 'Get a compact DOM snapshot in agent-browser format, optimized for token efficiency. Returns elements with unique IDs like @e123 [button] "Submit" [type=submit]',
          inputSchema: z.object({
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
            maxDepth: z.number().optional().default(5).describe('Maximum depth to traverse'),
          }),
        },
        async (params) => {
          const { clientId, maxDepth } = params;
          const result = await handleClientRpc(clientId, async (client) => {
            return await client.rpc.getCompactSnapshot(maxDepth);
          });

          // Check if the RPC call failed
          const rpcResult = result.content[0].text;
          if (rpcResult.includes('"error"')) {
            return result;
          }

          // Parse the result to add markdown formatting
          let parsedResult;
          try {
            parsedResult = JSON.parse(rpcResult);
          }
          catch (e) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Failed to parse RPC result',
                  details: e instanceof Error
                    ? e.message
                    : String(e),
                  rawResult: rpcResult,
                }, null, 2),
              }],
            };
          }

          if (!parsedResult.success) {
            return result;
          }

          const snapshotText = `# Compact DOM Snapshot

**Client ID:** ${parsedResult.clientId}
**URL:** ${parsedResult.url}
**Title:** ${parsedResult.title}
**Timestamp:** ${new Date(parsedResult.timestamp).toISOString()}

## Snapshot

\`\`\`
${parsedResult.snapshot}
\`\`\`

## Usage
- Use the @id format (e.g., @e123) to reference elements
- Call click_element_by_id({ id: "e123" }) to click
- Call input_text_by_id({ id: "e123", text: "value" }) to input text
- Call get_element_info_by_id({ id: "e123" }) to get details
`;

          return {
            content: [{
              type: 'text' as const,
              text: snapshotText,
            }],
          };
        },
      ),

      // click_element_by_id - 通过ID点击元素
      defineMcpToolRegister(
        'click_element_by_id',
        {
          title: 'Click Element by ID',
          description: 'Click an element by its snapshot ID (e.g., e123 from @e123 [button] "Submit")',
          inputSchema: z.object({
            id: z.string().describe('Element ID from snapshot (e.g., e123)'),
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
          }),
        },
        async (params) => {
          const { id, clientId } = params;
          return handleClientRpc(clientId, async (client) => {
            return await client.rpc.clickElementById(id);
          });
        },
      ),

      // input_text_by_id - 通过ID输入文本
      defineMcpToolRegister(
        'input_text_by_id',
        {
          title: 'Input Text by ID',
          description: 'Input text into an element by its snapshot ID (e.g., e123 from @e123 [input] "placeholder")',
          inputSchema: z.object({
            id: z.string().describe('Element ID from snapshot (e.g., e123)'),
            text: z.string().describe('Text to input'),
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
          }),
        },
        async (params) => {
          const { id, text, clientId } = params;
          return handleClientRpc(clientId, async (client) => {
            return await client.rpc.inputTextById(id, text);
          });
        },
      ),

      // get_element_info_by_id - 通过ID获取元素信息
      defineMcpToolRegister(
        'get_element_info_by_id',
        {
          title: 'Get Element Info by ID',
          description: 'Get detailed information about an element by its snapshot ID (e.g., e123)',
          inputSchema: z.object({
            id: z.string().describe('Element ID from snapshot (e.g., e123)'),
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
          }),
        },
        async (params) => {
          const { id, clientId } = params;
          return handleClientRpc(clientId, async (client) => {
            return await client.rpc.getElementInfoById(id);
          });
        },
      ),

      // get_dom_tree - 获取DOM树（可访问性树）- 保留旧方法
      defineMcpToolRegister(
        'get_dom_tree',
        {
          title: 'Get DOM Tree',
          description: 'Get accessibility tree snapshot of the DOM (legacy method, prefer get_compact_snapshot for token efficiency)',
          inputSchema: z.object({
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
            maxDepth: z.number().optional().default(5).describe('Maximum depth to traverse'),
          }),
        },
        async (params) => {
          const { clientId, maxDepth } = params;
          return handleClientRpc(clientId, async (client) => {
            return await client.rpc.getDOMTree(maxDepth);
          });
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
          return handleClientRpc(clientId, async (client) => {
            return await client.rpc.getLogs({ level, limit });
          });
        },
      ),

      // get_layout - 获取布局结构（自动判断视觉覆盖层级）
      defineMcpToolRegister(
        'get_layout',
        {
          title: 'Get Layout',
          description: 'Get visual layout hierarchy of DOM elements. Automatically detects which child elements fully cover the target element. Returns multiple levels of snapshots showing visual coverage relationships. Use this to quickly understand page structure before calling get_compact_snapshot.',
          inputSchema: z.object({
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
            id: z.string().optional().describe('Element ID to analyze (defaults to body)'),
            maxDepth: z.number().optional().default(15).describe('Maximum depth to traverse'),
          }),
        },
        async (params) => {
          const { clientId, id, maxDepth } = params;
          const result = await handleClientRpc(clientId, async (client) => {
            return await client.rpc.getLayout({ id, maxDepth });
          });

          // Parse and format the result
          const rpcResult = result.content[0].text;
          if (rpcResult.includes('"error"')) {
            return result;
          }

          let parsedResult;
          try {
            parsedResult = JSON.parse(rpcResult);
          }
          catch (e) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Failed to parse RPC result',
                  details: e instanceof Error
                    ? e.message
                    : String(e),
                  rawResult: rpcResult,
                }, null, 2),
              }],
            };
          }

          if (!parsedResult.success) {
            return result;
          }

          // Build formatted output
          let layoutText = '# DOM Layout Analysis\n\n';
          layoutText += `**Target ID:** ${parsedResult.targetId}\n`;
          layoutText += `**Target Rect:** x=${parsedResult.targetRect.x.toFixed(1)}, y=${parsedResult.targetRect.y.toFixed(1)}, w=${parsedResult.targetRect.width.toFixed(1)}, h=${parsedResult.targetRect.height.toFixed(1)}\n`;
          layoutText += `**Depth:** ${parsedResult.depth}\n`;
          layoutText += `**Timestamp:** ${new Date(parsedResult.timestamp).toISOString()}\n\n`;

          if (parsedResult.layout) {
            const levels = Object.keys(parsedResult.layout).sort();
            layoutText += '## Layout Levels\n\n';
            for (const level of levels) {
              layoutText += `### ${level}\n`;
              layoutText += `\`\`\`\n${parsedResult.layout[level]}\n\`\`\`\n\n`;
            }

            layoutText += '## Usage Guide\n\n';
            layoutText += '1. **Analyze the layout structure** - Each level shows elements that visually cover the target\n';
            layoutText += '2. **Identify the layer you need** - e.g., level1 for main content, level2 for modal\n';
            layoutText += '3. **Get detailed snapshot** - Call get_compact_snapshot(maxDepth) for that layer\n';
            layoutText += '4. **Execute actions** - Use click_element_by_id() or input_text_by_id()\n\n';
            layoutText += '## Example Workflow\n\n';
            layoutText += '```typescript\n';
            layoutText += '// 1. Get layout overview\n';
            layoutText += 'const layout = await get_layout({ maxDepth: 15 });\n';
            layoutText += '// LLM sees: page has 3 visual layers\n\n';
            layoutText += '// 2. Get detailed snapshot for specific layer\n';
            layoutText += 'const snapshot = await get_compact_snapshot({ maxDepth: 5 });\n\n';
            layoutText += '// 3. Execute action\n';
            layoutText += 'await click_element_by_id({ id: "e14" });\n';
            layoutText += '```\n';
          }
          else {
            layoutText += '## Result\n\nNo layout hierarchy found. The target element has no child elements.\n';
          }

          return {
            content: [{
              type: 'text' as const,
              text: layoutText,
            }],
          };
        },
      ),
    ];

    return tools;
  },
};
