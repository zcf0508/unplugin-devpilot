import { clientManager } from 'unplugin-devpilot/core/client-manager';
import { createStorage } from 'unstorage';
import plugin from '../src/index';

vi.mock('unplugin-devpilot/core/client-manager');

describe('mCP Tools - Node Side', () => {
  beforeEach(() => vi.clearAllMocks());

  it('all tools should handle successful response correctly', async () => {
    const mockClient = {
      rpc: {
        querySelector: vi.fn().mockResolvedValue({ success: true, matchedCount: 1, elements: [] }),
        getLayout: vi.fn().mockResolvedValue({
          success: true,
          targetId: 'body',
          targetRect: { x: 0, y: 0, width: 100, height: 100 },
          layout: { level1: '@e1 [div]' },
          formattedLayout: '# DOM Layout Analysis\n\n**Target ID:** body\n**Target Rect:** x=0.0, y=0.0, w=100.0, h=100.0\n**Depth:** 1\n**Timestamp:** 2024-01-01T00:00:00.000Z\n\n## Layout Levels\n\n### level1\n```\n@e1 [div]\n```\n',
          depth: 1,
          timestamp: Date.now(),
        }),
        getCompactSnapshot: vi.fn().mockResolvedValue({
          success: true,
          clientId: 'test_client',
          timestamp: Date.now(),
          url: 'http://test.com',
          title: 'Test Page',
          snapshot: '@e1 [button] "Submit"',
          formattedSnapshot: '# DOM Structure Snapshot\n\n## Page Context\n- **URL:** http://test.com\n- **Title:** Test Page\n\n## Format Guide\nEach line represents a DOM element...\n\n## DOM Tree\n```\n@e1 [button] "Submit"\n```\n',
        }),
        getElementDetails: vi.fn().mockResolvedValue({
          success: true,
          elements: [{ devpilotId: 'e1', tag: 'button', text: 'Submit', attributes: {}, role: 'button', name: 'Submit', rect: { x: 0, y: 0, width: 100, height: 50 } }],
        }),
      },
    };
    vi.mocked(clientManager.getClient).mockReturnValue(mockClient as any);

    const tools = plugin.mcpSetup?.({ wsPort: 3100, storage: createStorage() }) || [];
    const toolCalls = [
      { tool: 'query_selector', args: { selector: '.test', clientId: 'c_1' }, mock: mockClient.rpc.querySelector, isJson: true },
      { tool: 'get_visual_hierarchy', args: { clientId: 'c_1', maxDepth: 15 }, mock: mockClient.rpc.getLayout, isJson: false },
      { tool: 'get_page_snapshot', args: { clientId: 'c_1', maxDepth: 5 }, mock: mockClient.rpc.getCompactSnapshot, isJson: false },
      { tool: 'get_element_details', args: { selector: 'e1', clientId: 'c_1' }, mock: mockClient.rpc.getElementDetails, isJson: true },
    ];

    for (const { tool, args, mock, isJson } of toolCalls) {
      const toolDef = tools.find(t => t().name === tool);
      const result = await toolDef!().cb(args as any);
      expect(mock).toHaveBeenCalled();

      if (isJson) {
        expect(JSON.parse((result.content[0] as { text: string }).text).success).toBe(true);
      }
      else {
        // get_visual_hierarchy and get_page_snapshot return markdown, check for success indicator
        const text = (result.content[0] as { text: string }).text;
        if (tool === 'get_visual_hierarchy') {
          expect(text).toMatchInlineSnapshot(`
            "# DOM Layout Analysis

            **Target ID:** body
            **Target Rect:** x=0.0, y=0.0, w=100.0, h=100.0
            **Depth:** 1
            **Timestamp:** 2024-01-01T00:00:00.000Z

            ## Layout Levels

            ### level1
            \`\`\`
            @e1 [div]
            \`\`\`
            "
          `);
        }
        else if (tool === 'get_page_snapshot') {
          expect(text).toMatchInlineSnapshot(`
            "# DOM Structure Snapshot

            ## Page Context
            - **URL:** http://test.com
            - **Title:** Test Page

            ## Format Guide
            Each line represents a DOM element...

            ## DOM Tree
            \`\`\`
            @e1 [button] "Submit"
            \`\`\`
            "
          `);
        }
      }
    }
  });

  it('all tools should handle errors correctly', async () => {
    const mockClient = {
      rpc: {
        querySelector: vi.fn().mockRejectedValue(new Error('RPC failed')),
        getLayout: vi.fn().mockRejectedValue(new Error('RPC failed')),
        getCompactSnapshot: vi.fn().mockRejectedValue(new Error('RPC failed')),
        getElementDetails: vi.fn().mockRejectedValue(new Error('RPC failed')),
      },
    };
    vi.mocked(clientManager.getClient).mockReturnValue(mockClient as any);

    const tools = plugin.mcpSetup?.({ wsPort: 3100, storage: createStorage() }) || [];
    for (const name of ['query_selector', 'get_visual_hierarchy', 'get_page_snapshot', 'get_element_details']) {
      const toolDef = tools.find(t => t().name === name);
      const result = await toolDef!().cb({ clientId: 'c_1' } as any);
      expect(JSON.parse((result.content[0] as { text: string }).text).error).toContain('RPC call failed');
    }
  });

  it('all tools should handle client not found', async () => {
    vi.mocked(clientManager.getClient).mockReturnValue(undefined);
    vi.mocked(clientManager.getAllClients).mockReturnValue([]);

    const tools = plugin.mcpSetup?.({ wsPort: 3100, storage: createStorage() }) || [];
    for (const name of ['query_selector', 'get_visual_hierarchy', 'get_page_snapshot', 'get_element_details']) {
      const toolDef = tools.find(t => t().name === name);
      const result = await toolDef!().cb({ clientId: 'c_nonexistent' } as any);
      expect(JSON.parse((result.content[0] as { text: string }).text).error).toContain('not found');
    }
  });

  it('all tools should handle missing clientId', async () => {
    const tools = plugin.mcpSetup?.({ wsPort: 3100, storage: createStorage() }) || [];
    for (const name of ['query_selector', 'get_visual_hierarchy', 'get_page_snapshot', 'get_element_details']) {
      const toolDef = tools.find(t => t().name === name);
      const result = await toolDef!().cb({ selector: '.test' } as any);
      expect(JSON.parse((result.content[0] as { text: string }).text).error).toContain('No client specified');
    }
  });

  it('get_console_logs should read from storage and apply filters', async () => {
    const storage = createStorage();
    await storage.setItem('logs', [
      { clientId: 'c_1', level: 'error', message: 'Something failed', timestamp: 1000 },
      { clientId: 'c_1', level: 'warn', message: 'Deprecation warning', timestamp: 2000 },
      { clientId: 'c_1', level: 'info', message: 'App started', timestamp: 3000 },
      { clientId: 'c_1', level: 'debug', message: 'Debug info test', timestamp: 4000 },
      { clientId: 'c_1', level: 'error', message: 'Another error test', timestamp: 5000 },
      { clientId: 'c_2', level: 'error', message: 'Other client error', timestamp: 6000 },
    ]);

    const tools = plugin.mcpSetup?.({ wsPort: 3100, storage }) || [];
    const toolDef = tools.find(t => t().name === 'get_console_logs');

    const allResult = await toolDef!().cb({ clientId: 'c_1', level: 'all', limit: 100 } as any);
    const allParsed = JSON.parse((allResult.content[0] as { text: string }).text);
    expect(allParsed.success).toBe(true);
    expect(allParsed.total).toBe(5); // Only c_1 logs
    expect(allParsed.filtered).toBe(5); // Only c_1 logs

    const errorResult = await toolDef!().cb({ clientId: 'c_1', level: 'error', limit: 100 } as any);
    const errorParsed = JSON.parse((errorResult.content[0] as { text: string }).text);
    expect(errorParsed.filtered).toBe(2);

    const keywordResult = await toolDef!().cb({ clientId: 'c_1', level: 'all', limit: 100, keyword: 'test' } as any);
    const keywordParsed = JSON.parse((keywordResult.content[0] as { text: string }).text);
    expect(keywordParsed.filtered).toBe(2);

    const regexResult = await toolDef!().cb({ clientId: 'c_1', level: 'all', limit: 100, regex: '^App' } as any);
    const regexParsed = JSON.parse((regexResult.content[0] as { text: string }).text);
    expect(regexParsed.filtered).toBe(1);

    const limitResult = await toolDef!().cb({ clientId: 'c_1', level: 'all', limit: 2 } as any);
    const limitParsed = JSON.parse((limitResult.content[0] as { text: string }).text);
    expect(limitParsed.filtered).toBe(2);
    expect(limitParsed.total).toBe(5); // Only c_1 logs

    const invalidRegexResult = await toolDef!().cb({ clientId: 'c_1', level: 'all', limit: 100, regex: '[invalid' } as any);
    const invalidRegexParsed = JSON.parse((invalidRegexResult.content[0] as { text: string }).text);
    expect(invalidRegexParsed.success).toBe(false);
  });

  it('get_console_logs should return empty array when no logs in storage', async () => {
    const storage = createStorage();
    const tools = plugin.mcpSetup?.({ wsPort: 3100, storage }) || [];
    const toolDef = tools.find(t => t().name === 'get_console_logs');

    const result = await toolDef!().cb({ clientId: 'c_1', level: 'all', limit: 100 } as any);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(true);
    expect(parsed.logs).toEqual([]);
    expect(parsed.total).toBe(0);
  });
});
