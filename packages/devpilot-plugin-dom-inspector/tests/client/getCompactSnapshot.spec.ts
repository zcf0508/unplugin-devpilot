import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCompactSnapshot } from '../../src/client/getCompactSnapshot';

// Mock getDevpilotClient
vi.mock('unplugin-devpilot/client', () => ({
  getDevpilotClient: () => ({
    getClientId: () => 'test_client_id',
  }),
}));

describe('getCompactSnapshot', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should return compact snapshot', async () => {
    document.body.innerHTML = `
          <div class="container">
            <button id="submit-btn">Submit</button>
            <input type="text" placeholder="Enter text">
          </div>
        `;
    const result = await getCompactSnapshot({ maxDepth: 5 });

    expect(result.success).toBe(true);
    expect(result.clientId).toBe('test_client_id');
    expect(result.url).toBeDefined();
    expect(result.title).toBeDefined();
    expect(result.timestamp).toBeDefined();
    expect(result.snapshot).toBeDefined();
    expect(result.snapshot).toContain('@e');
    expect(result.snapshot).toContain('[button]');
    expect(result.snapshot).toContain('Submit');
  });

  it('should respect maxDepth limit', async () => {
    document.body.innerHTML = `
          <div id="level0">
            <div id="level1">
              <div id="level2">Deep</div>
            </div>
          </div>
        `;
    const result = await getCompactSnapshot({ maxDepth: 1 });

    expect(result.success).toBe(true);
    // Should not include deeply nested elements
    expect(result.snapshot).not.toContain('level2');
  });

  it('should return error on exception', async () => {
    // Test with empty body - should still work
    document.body.innerHTML = '';

    const result = await getCompactSnapshot({ maxDepth: 5 });

    expect(result.success).toBe(true);
    expect(result.snapshot).toBeDefined();
  });

  it('should return snapshot starting from specified startNodeId', async () => {
    document.body.innerHTML = `
      <div class="page">
        <div class="header" data-devpilot-id="header">
          <h1>Title</h1>
        </div>
        <div class="sidebar" data-devpilot-id="sidebar">
          <button id="sidebar-btn">Sidebar Button</button>
          <a href="#">Link</a>
        </div>
        <div class="main">
          <button id="main-btn">Main Button</button>
        </div>
      </div>
    `;

    // Get snapshot starting from sidebar
    const result = await getCompactSnapshot({
      maxDepth: 5,
      startNodeId: 'sidebar',
    });

    expect(result.success).toBe(true);
    expect(result.snapshot).toBeDefined();
    // Should contain sidebar elements
    expect(result.snapshot).toContain('Sidebar Button');
    expect(result.snapshot).toContain('Link');
    // Should NOT contain main button (outside sidebar)
    expect(result.snapshot).not.toContain('Main Button');
    // Should NOT contain header elements (outside sidebar)
    expect(result.snapshot).not.toContain('Title');
  });

  it('should return error when startNodeId does not exist', async () => {
    document.body.innerHTML = `
      <div class="container">
        <button id="submit-btn">Submit</button>
      </div>
    `;

    const result = await getCompactSnapshot({
      maxDepth: 5,
      startNodeId: 'nonexistent',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Element with ID nonexistent not found');
    expect(result.snapshot).toBe('');
  });

  it('should handle nested elements within startNodeId', async () => {
    document.body.innerHTML = `
      <div class="page">
        <div class="modal" data-devpilot-id="modal">
          <div class="modal-header">
            <h2>Modal Title</h2>
          </div>
          <div class="modal-body">
            <input type="text" placeholder="Enter value">
            <button id="modal-btn">Confirm</button>
          </div>
          <div class="modal-footer">
            <button id="cancel-btn">Cancel</button>
          </div>
        </div>
        <div class="outside">Outside content</div>
      </div>
    `;

    const result = await getCompactSnapshot({
      maxDepth: 10,
      startNodeId: 'modal',
    });

    expect(result.success).toBe(true);
    expect(result.snapshot).toBeDefined();
    // Should contain all modal content
    expect(result.snapshot).toContain('Modal Title');
    expect(result.snapshot).toContain('Enter value');
    expect(result.snapshot).toContain('Confirm');
    expect(result.snapshot).toContain('Cancel');
    // Should NOT contain outside content
    expect(result.snapshot).not.toContain('Outside content');
  });

  it('should include startNodeId info in formatted snapshot', async () => {
    document.body.innerHTML = `
      <div class="container" data-devpilot-id="container">
        <button>Click me</button>
      </div>
    `;

    const result = await getCompactSnapshot({
      startNodeId: 'container',
    });

    expect(result.success).toBe(true);
    expect(result.formattedSnapshot).toBeDefined();
    expect(result.formattedSnapshot).toContain('**Start Node:** @container');
    expect(result.formattedSnapshot).toContain('Starting Node Context');
  });
});
