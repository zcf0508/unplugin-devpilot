import { clientManager } from 'unplugin-devpilot/core/client-manager';
import plugin from '../src/index';

vi.mock('unplugin-devpilot/core/client-manager');

describe('mCP Tools - Node Side', () => {
  beforeEach(() => vi.clearAllMocks());

  it('all tools should handle successful response correctly', async () => {
    const mockClient = {
      rpc: {
        querySelector: vi.fn().mockResolvedValue({ success: true, matchedCount: 1, elements: [] }),
        getDOMTree: vi.fn().mockResolvedValue({ success: true, tree: { uid: 'root', role: 'document', name: null } }),
        getLogs: vi.fn().mockResolvedValue({ success: true, logs: [], total: 0, filtered: 0, level: 'all' }),
      },
    };
    vi.mocked(clientManager.getClient).mockReturnValue(mockClient as any);

    const tools = plugin.mcpSetup?.({ wsPort: 3100 }) || [];
    const toolCalls = [
      { tool: 'query_selector', args: { selector: '.test', clientId: 'c_1' }, mock: mockClient.rpc.querySelector },
      { tool: 'get_dom_tree', args: { clientId: 'c_1', maxDepth: 5 }, mock: mockClient.rpc.getDOMTree },
      { tool: 'get_logs', args: { clientId: 'c_1', level: 'all' }, mock: mockClient.rpc.getLogs },
    ];

    for (const { tool, args, mock } of toolCalls) {
      const toolDef = tools.find(t => t().name === tool);
      const result = await toolDef!().cb(args as any);
      expect(mock).toHaveBeenCalled();
      expect(JSON.parse((result.content[0] as { text: string }).text).success).toBe(true);
    }
  });

  it('all tools should handle errors correctly', async () => {
    const mockClient = {
      rpc: {
        querySelector: vi.fn().mockRejectedValue(new Error('RPC failed')),
        getDOMTree: vi.fn().mockRejectedValue(new Error('RPC failed')),
        getLogs: vi.fn().mockRejectedValue(new Error('RPC failed')),
      },
    };
    vi.mocked(clientManager.getClient).mockReturnValue(mockClient as any);

    const tools = plugin.mcpSetup?.({ wsPort: 3100 }) || [];
    for (const name of ['query_selector', 'get_dom_tree', 'get_logs']) {
      const toolDef = tools.find(t => t().name === name);
      const result = await toolDef!().cb({ clientId: 'c_1' } as any);
      expect(JSON.parse((result.content[0] as { text: string }).text).error).toContain('Failed');
    }
  });

  it('all tools should handle client not found', async () => {
    vi.mocked(clientManager.getClient).mockReturnValue(undefined);

    const tools = plugin.mcpSetup?.({ wsPort: 3100 }) || [];
    for (const name of ['query_selector', 'get_dom_tree', 'get_logs']) {
      const toolDef = tools.find(t => t().name === name);
      const result = await toolDef!().cb({ clientId: 'c_nonexistent' } as any);
      expect(JSON.parse((result.content[0] as { text: string }).text).error).toContain('not found');
    }
  });

  it('all tools should handle missing clientId', async () => {
    const tools = plugin.mcpSetup?.({ wsPort: 3100 }) || [];
    for (const name of ['query_selector', 'get_dom_tree', 'get_logs']) {
      const toolDef = tools.find(t => t().name === name);
      const result = await toolDef!().cb({ selector: '.test' } as any);
      expect(JSON.parse((result.content[0] as { text: string }).text).error).toContain('No client specified');
    }
  });
});
