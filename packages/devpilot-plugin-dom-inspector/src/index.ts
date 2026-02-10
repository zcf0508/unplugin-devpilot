import type { DevpilotPlugin } from 'unplugin-devpilot';
import type { ConsoleLogEntry, DomInspectorRpc, DomInspectorServerMethods } from './shared-types';
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

// Result type for handleClientRpc - allows callers to work with structured data
type RpcResult<T>
  = | { success: true, data: T }
    | { success: false, error: string, details?: string, suggestions?: string[], availableClients?: any[] };

// Helper function to handle client RPC calls with common error handling
// Returns structured data instead of serialized string, making it easier for callers to process
async function handleClientRpc<T>(
  clientId: string | undefined,
  rpcMethod: (client: NonNullable<ReturnType<typeof clientManager.getClient<DomInspectorRpc>>>) => Promise<T>,
): Promise<RpcResult<T>> {
  if (!clientId) {
    return {
      success: false,
      error: 'No client specified. Either provide clientId parameter or call within a task context.',
      details: 'Use list_clients tool to see available clients, or specify clientId explicitly.',
    };
  }

  const client = clientManager.getClient<DomInspectorRpc>(clientId);
  if (!client) {
    const availableClients = clientManager.getAllClients();
    return {
      success: false,
      error: `Client ${clientId} not found or disconnected`,
      suggestions: generateClientNotFoundErrorSuggestions(clientId, availableClients),
      availableClients,
    };
  }

  try {
    const result = await rpcMethod(client);
    return {
      success: true,
      data: result,
    };
  }
  catch (error) {
    return {
      success: false,
      error: 'RPC call failed',
      details: error instanceof Error
        ? error.message
        : String(error),
    };
  }
}

// Convert RpcResult to MCP tool response format
function toMcpResponse<T>(result: RpcResult<T>): { content: Array<{ type: 'text', text: string }> } {
  if (result.success) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result.data, null, 2),
      }],
    };
  }
  else {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: result.error,
          details: result.details,
          suggestions: result.suggestions,
          availableClients: result.availableClients,
        }, null, 2),
      }],
    };
  }
}

// Define plugin-specific RPC interface

export default <DevpilotPlugin>{
  namespace: 'builtin-dom-inspector',
  clientModule: resolveClientModule(import.meta.url, './client/index.mjs'),
  serverSetup(ctx): DomInspectorServerMethods {
    const MAX_STORAGE_SIZE = 1000;
    return {
      async appendLogs(items) {
        const existing = await ctx.storage.getItem<ConsoleLogEntry[]>('logs') || [];
        const merged = [...existing, ...items];
        const trimmed = merged.length > MAX_STORAGE_SIZE
          ? merged.slice(-MAX_STORAGE_SIZE)
          : merged;
        await ctx.storage.setItem('logs', trimmed);
      },
    };
  },
  mcpSetup(ctx) {
    const tools = [
      // query_selector - 精确查询DOM元素
      defineMcpToolRegister(
        'query_selector',
        {
          title: 'Query Selector',
          description: 'Query DOM elements using devpilot-id or CSS selector with accessibility tree information. Priority: devpilot-id > CSS selector. Returns elements with devpilotId field that can be used in other APIs.',
          inputSchema: z.object({
            selector: z.string().describe('Element identifier - can be devpilot-id (e.g., "e123") or CSS selector (e.g., "#myId", ".myClass"). Priority: devpilot-id > CSS selector'),
            maxDepth: z.number().optional().default(5).describe('Maximum depth to traverse'),
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
          }),
        },
        async (params) => {
          const { selector, clientId, maxDepth } = params;
          const result = await handleClientRpc(clientId, async (client) => {
            return await client.rpc.querySelector(selector, maxDepth);
          });
          return toMcpResponse(result);
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
            startNodeId: z.string().optional().describe('Element identifier (devpilot-id or CSS selector) to start snapshot from. Priority: devpilot-id > CSS selector. If provided, snapshot will be limited to this element and its children'),
          }),
        },
        async (params) => {
          const { clientId, maxDepth, startNodeId } = params;
          const result = await handleClientRpc(clientId, async (client) => {
            return await client.rpc.getCompactSnapshot({ maxDepth, startNodeId });
          });

          // Handle error case
          if (!result.success) {
            return toMcpResponse(result);
          }

          const parsedResult = result.data;

          // Return the formatted snapshot from client (already contains LLM-friendly format)
          // Similar to get_layout's approach - client handles all formatting
          const snapshotText = parsedResult.formattedSnapshot || 'No snapshot data available';

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
          description: 'Click an element by its identifier. Supports devpilot-id (e.g., e123 from @e123 [button] "Submit") or CSS selector. Priority: devpilot-id > CSS selector',
          inputSchema: z.object({
            id: z.string().describe('Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector. Example: "e123" or "#submitBtn"'),
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
          }),
        },
        async (params) => {
          const { id, clientId } = params;
          const result = await handleClientRpc(clientId, async (client) => {
            return await client.rpc.clickElementById(id);
          });
          return toMcpResponse(result);
        },
      ),

      // input_text_by_id - 通过ID输入文本
      defineMcpToolRegister(
        'input_text_by_id',
        {
          title: 'Input Text by ID',
          description: 'Input text into an element by its identifier. Supports devpilot-id (e.g., e123 from @e123 [input] "placeholder") or CSS selector. Priority: devpilot-id > CSS selector',
          inputSchema: z.object({
            id: z.string().describe('Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector. Example: "e123" or "#myInput"'),
            text: z.string().describe('Text to input'),
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
          }),
        },
        async (params) => {
          const { id, text, clientId } = params;
          const result = await handleClientRpc(clientId, async (client) => {
            return await client.rpc.inputTextById(id, text);
          });
          return toMcpResponse(result);
        },
      ),

      // get_element_info_by_id - 通过ID获取元素信息
      defineMcpToolRegister(
        'get_element_info_by_id',
        {
          title: 'Get Element Info by ID',
          description: 'Get detailed information about an element by its identifier. Supports devpilot-id or CSS selector. Priority: devpilot-id > CSS selector',
          inputSchema: z.object({
            id: z.string().describe('Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector. Example: "e123" or "#myElement"'),
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
          }),
        },
        async (params) => {
          const { id, clientId } = params;
          const result = await handleClientRpc(clientId, async (client) => {
            return await client.rpc.getElementInfoById(id);
          });
          return toMcpResponse(result);
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
          const result = await handleClientRpc(clientId, async (client) => {
            return await client.rpc.getDOMTree(maxDepth);
          });
          return toMcpResponse(result);
        },
      ),

      // get_logs - 获取浏览器控制台日志
      defineMcpToolRegister(
        'get_logs',
        {
          title: 'Get Logs',
          description: 'Get browser console logs including errors, warnings, and user logs. Reads from unified storage.',
          inputSchema: z.object({
            clientId: z.string().optional().describe('Target client ID (optional, logs are stored centrally)'),
            level: z.enum(['all', 'error', 'warn', 'info', 'debug']).optional().default('all').describe('Log level filter'),
            limit: z.number().optional().default(100).describe('Maximum number of logs to return'),
            keyword: z.string().optional().describe('Keyword to filter logs (case-insensitive substring match)'),
            regex: z.string().optional().describe('Regex pattern to filter logs (applied after keyword filter)'),
          }),
        },
        async (params) => {
          const { level, limit, keyword, regex } = params;

          const allLogs = await ctx.storage.getItem<ConsoleLogEntry[]>('logs') || [];

          let filteredLogs = allLogs;
          if (level !== 'all') {
            filteredLogs = filteredLogs.filter(log => log.level === level);
          }
          if (keyword) {
            const lowerKeyword = keyword.toLowerCase();
            filteredLogs = filteredLogs.filter(log =>
              log.message.toLowerCase().includes(lowerKeyword),
            );
          }
          if (regex) {
            try {
              const regexPattern = new RegExp(regex);
              filteredLogs = filteredLogs.filter(log => regexPattern.test(log.message));
            }
            catch (e) {
              return {
                content: [{
                  type: 'text' as const,
                  text: JSON.stringify({
                    success: false,
                    error: `Invalid regex pattern: ${e instanceof Error
                      ? e.message
                      : String(e)}`,
                    logs: [],
                    total: allLogs.length,
                    filtered: 0,
                    level,
                    keyword,
                    regex,
                  }, null, 2),
                }],
              };
            }
          }

          const limitedLogs = filteredLogs.slice(-limit);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                logs: limitedLogs,
                total: allLogs.length,
                filtered: limitedLogs.length,
                level,
                keyword,
                regex,
              }, null, 2),
            }],
          };
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
            id: z.string().optional().describe('Element identifier (devpilot-id or CSS selector) to analyze. Priority: devpilot-id > CSS selector. Defaults to body'),
            maxDepth: z.number().optional().default(15).describe('Maximum depth to traverse'),
          }),
        },
        async (params) => {
          const { clientId, id, maxDepth } = params;
          const result = await handleClientRpc(clientId, async (client) => {
            return await client.rpc.getLayout({ id, maxDepth });
          });

          // Handle error case
          if (!result.success) {
            return toMcpResponse(result);
          }

          const parsedResult = result.data;

          // Return the formatted layout from client (already contains LLM-friendly format)
          return {
            content: [{ type: 'text' as const, text: parsedResult.formattedLayout || 'No layout data available' }],
          };
        },
      ),

      // scroll_to_element - 滚动元素到视口
      defineMcpToolRegister(
        'scroll_to_element',
        {
          title: 'Scroll to Element',
          description: 'Scroll an element into view. Useful when element is in a scrollable container or outside the current viewport. After scrolling, you can call get_compact_snapshot to see the updated view.',
          inputSchema: z.object({
            id: z.string().describe('Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector. Example: "e123" or "#myElement"'),
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
            behavior: z.enum(['smooth', 'auto']).optional().default('smooth').describe('Scroll behavior: smooth (animated) or auto (instant)'),
          }),
        },
        async (params) => {
          const { id, clientId, behavior } = params;
          const result = await handleClientRpc(clientId, async (client) => {
            return await client.rpc.scrollToElement(id, behavior);
          });
          return toMcpResponse(result);
        },
      ),

      // capture_screenshot - 捕获页面或元素截图
      defineMcpToolRegister(
        'capture_screenshot',
        {
          title: 'Capture Screenshot',
          description: 'Capture a screenshot of the page or a specific element using SnapDOM. Works with any browser (Chrome, Safari, DingTalk, etc). For best results, keep the browser window visible. Supports devpilot-id (e.g., "e123") or CSS selector to target specific elements.',
          inputSchema: z.object({
            clientId: z.string().optional().describe('Target client ID (defaults to task source client)'),
            selector: z.string().optional().describe('Element identifier (devpilot-id or CSS selector) to capture. Priority: devpilot-id > CSS selector. If not provided, captures body or full page based on fullPage option'),
            fullPage: z.boolean().optional().default(false).describe('Capture full page (documentElement) instead of just body. Default: false'),
            format: z.enum(['png', 'jpeg', 'webp']).optional().default('png').describe('Image format: png (default), jpeg, or webp'),
            quality: z.number().optional().default(0.9).describe('Image quality for jpeg/webp (0-1). Default: 0.9'),
          }),
        },
        async (params) => {
          const { clientId, selector, fullPage, format, quality } = params;
          const result = await handleClientRpc(clientId, async (client) => {
            return await client.rpc.captureScreenshot({ selector, fullPage, format, quality });
          });

          // Handle RPC error (client not found, disconnected, etc.)
          if (!result.success) {
            return toMcpResponse(result);
          }

          const screenshotData = result.data;

          // Handle screenshot business logic error (element not found, capture failed, etc.)
          if (!screenshotData.success) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: screenshotData.error || 'Screenshot failed',
                  url: screenshotData.url,
                  title: screenshotData.title,
                }, null, 2),
              }],
            };
          }

          // Return as MCP image content (image + metadata text)
          // Note: Not using toMcpResponse because we need to return image type
          return {
            content: [
              {
                type: 'image' as const,
                mimeType: screenshotData.mimeType || 'image/png',
                data: screenshotData.data || '',
              },
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: screenshotData.success,
                  url: screenshotData.url,
                  title: screenshotData.title,
                  dimensions: screenshotData.dimensions,
                  selector: screenshotData.selector,
                  format: screenshotData.format,
                  note: 'This is a client-side DOM capture (not a browser-level screenshot). Cross-origin images without CORS headers (Access-Control-Allow-Origin) may appear blank due to browser security restrictions.',
                }, null, 2),
              },
            ],
          };
        },
      ),
    ];

    return tools;
  },
  skillModule: resolveClientModule(import.meta.url, './skill.md'),
};
