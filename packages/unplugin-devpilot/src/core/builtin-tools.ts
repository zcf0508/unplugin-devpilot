import type { McpToolResolved } from './plugin';
import type { ClientDiscoveryFilter } from './types';
import { z } from 'zod';
import { clientManager } from './client-manager';
import { defineMcpToolRegister } from './plugin/mcp';

const listClients = defineMcpToolRegister(
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

const getPendingTasks = defineMcpToolRegister(
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

const findClientsByUrl = defineMcpToolRegister(
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

const getTaskHistory = defineMcpToolRegister(
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

const findClientsByTitle = defineMcpToolRegister(
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

const builtinToolRegisters = [
  listClients,
  getPendingTasks,
  findClientsByUrl,
  getTaskHistory,
  findClientsByTitle,
];

export function getBuiltinTools(): McpToolResolved[] {
  return builtinToolRegisters.map(r => r() as McpToolResolved);
}

export function getBuiltinToolNames(): string[] {
  return builtinToolRegisters.map(r => r().name);
}
