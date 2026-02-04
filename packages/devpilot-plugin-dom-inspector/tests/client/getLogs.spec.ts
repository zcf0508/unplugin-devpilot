import { beforeEach, describe, expect, it } from 'vitest';
import { getLogs } from '../../src/client/getLogs';

describe('getLogs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should return logs structure', async () => {
    const result = await getLogs({ level: 'all', limit: 10 });

    expect(result.success).toBe(true);
    expect(result.logs).toBeDefined();
    expect(Array.isArray(result.logs)).toBe(true);
  });

  it('should work with default parameters', async () => {
    const result = await getLogs();

    expect(result.success).toBe(true);
    expect(result.level).toBe('all');
  });
});
