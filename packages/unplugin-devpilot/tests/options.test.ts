import { checkPort, getRandomPort } from 'get-port-please';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetLastResolvedPorts, resolveOptions } from '../src/core/options';

vi.mock('get-port-please', () => ({
  checkPort: vi.fn(),
  getRandomPort: vi.fn(),
}));

const mockCheckPort = vi.mocked(checkPort);
const mockGetRandomPort = vi.mocked(getRandomPort);

beforeEach(() => {
  vi.clearAllMocks();
  resetLastResolvedPorts();
});

describe('resolveOptions', () => {
  it('should use specified wsPort when available', async () => {
    mockCheckPort.mockResolvedValueOnce(3000);
    mockCheckPort.mockResolvedValueOnce(3101);

    const result = await resolveOptions({ wsPort: 3000 });
    expect(result.wsPort).toBe(3000);
  });

  it('should fallback to random wsPort when specified port is occupied', async () => {
    mockCheckPort.mockResolvedValueOnce(false);
    mockGetRandomPort.mockResolvedValueOnce(4567);
    mockCheckPort.mockResolvedValueOnce(3101);

    const result = await resolveOptions({ wsPort: 3000 });
    expect(result.wsPort).toBe(4567);
  });

  it('should use random wsPort when not specified', async () => {
    mockGetRandomPort.mockResolvedValueOnce(5678);
    mockCheckPort.mockResolvedValueOnce(3101);

    const result = await resolveOptions({});
    expect(result.wsPort).toBe(5678);
  });

  it('should throw when mcpPort is occupied', async () => {
    mockGetRandomPort.mockResolvedValueOnce(3000);
    mockCheckPort.mockResolvedValueOnce(false);

    await expect(resolveOptions({})).rejects.toThrow(
      'MCP port 3101 is already in use',
    );
  });

  it('should use default mcpPort 3101', async () => {
    mockGetRandomPort.mockResolvedValueOnce(3000);
    mockCheckPort.mockResolvedValueOnce(3101);

    const result = await resolveOptions({});
    expect(result.mcpPort).toBe(3101);
  });

  it('should use custom mcpPort when specified and available', async () => {
    mockGetRandomPort.mockResolvedValueOnce(3000);
    mockCheckPort.mockResolvedValueOnce(4000);

    const result = await resolveOptions({ mcpPort: 4000 });
    expect(result.mcpPort).toBe(4000);
  });
});

describe('resolveOptions port reuse across restarts', () => {
  it('should reuse wsPort from previous resolve when port is occupied by self', async () => {
    mockCheckPort.mockResolvedValueOnce(3000);
    mockCheckPort.mockResolvedValueOnce(3101);
    await resolveOptions({ wsPort: 3000 });

    mockCheckPort.mockResolvedValueOnce(false);
    mockCheckPort.mockResolvedValueOnce(3101);
    const result = await resolveOptions({ wsPort: 3000 });
    expect(result.wsPort).toBe(3000);
    expect(mockGetRandomPort).not.toHaveBeenCalled();
  });

  it('should reuse wsPort when no preferred port and lastResolved port is occupied by self', async () => {
    mockGetRandomPort.mockResolvedValueOnce(5000);
    mockCheckPort.mockResolvedValueOnce(5000);
    mockCheckPort.mockResolvedValueOnce(3101);
    await resolveOptions({});

    mockCheckPort.mockResolvedValueOnce(false);
    mockCheckPort.mockResolvedValueOnce(3101);
    const result = await resolveOptions({});
    expect(result.wsPort).toBe(5000);
  });

  it('should reuse mcpPort from previous resolve without re-checking', async () => {
    mockGetRandomPort.mockResolvedValueOnce(3000);
    mockCheckPort.mockResolvedValueOnce(3101);
    await resolveOptions({});

    mockCheckPort.mockResolvedValueOnce(3000);
    const result = await resolveOptions({});
    expect(result.mcpPort).toBe(3101);
    expect(mockCheckPort).toHaveBeenCalledTimes(2);
  });
});
