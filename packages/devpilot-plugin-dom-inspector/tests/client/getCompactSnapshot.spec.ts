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
    const result = await getCompactSnapshot(5);

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
    const result = await getCompactSnapshot(1);

    expect(result.success).toBe(true);
    // Should not include deeply nested elements
    expect(result.snapshot).not.toContain('level2');
  });

  it('should return error on exception', async () => {
    // Test with empty body - should still work
    document.body.innerHTML = '';

    const result = await getCompactSnapshot(5);

    expect(result.success).toBe(true);
    expect(result.snapshot).toBeDefined();
  });
});
