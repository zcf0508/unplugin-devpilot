import { beforeEach, describe, expect, it } from 'vitest';
import { clearLogs, getLogs } from '../../src/client/getLogs';

describe('getLogs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearLogs(); // Clear logs before each test to ensure clean state
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

  it('should filter logs by keyword', async () => {
    console.log('test error message');
    console.log('test warning message');
    console.log('info message');

    const result = await getLogs({ keyword: 'error' });

    expect(result.success).toBe(true);
    expect(result.keyword).toBe('error');
    // Should only contain logs with 'error' in the message
    result.logs.forEach((log) => {
      expect(log.message.toLowerCase()).toContain('error');
    });
  });

  it('should filter logs by regex pattern', async () => {
    console.log('test error message');
    console.log('test warning message');
    console.log('info message');

    const result = await getLogs({ regex: '^test.*' });

    expect(result.success).toBe(true);
    expect(result.regex).toBe('^test.*');
    // Should only contain logs starting with 'test'
    result.logs.forEach((log) => {
      expect(log.message).toMatch(/^test.*/);
    });
  });

  it('should filter logs by both keyword and regex', async () => {
    console.log('error: something went wrong');
    console.log('warning: check this');
    console.log('error: another error');

    const result = await getLogs({ keyword: 'error', regex: 'went' });

    expect(result.success).toBe(true);
    expect(result.keyword).toBe('error');
    expect(result.regex).toBe('went');
    // Should contain logs with both 'error' keyword and matching regex
    result.logs.forEach((log) => {
      expect(log.message.toLowerCase()).toContain('error');
      expect(log.message).toMatch(/went/);
    });
  });

  it('should return error for invalid regex pattern', async () => {
    const result = await getLogs({ regex: '[invalid' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid regex pattern');
    expect(result.logs).toHaveLength(0);
  });

  it('should include keyword and regex in result even when no matches', async () => {
    const result = await getLogs({ keyword: 'nonexistent', regex: 'nomatch' });

    expect(result.success).toBe(true);
    expect(result.keyword).toBe('nonexistent');
    expect(result.regex).toBe('nomatch');
    expect(result.filtered).toBe(0);
  });
});
