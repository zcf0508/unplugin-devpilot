import type { DevpilotPlugin } from '../src';
import { createStorage } from 'unstorage';

// Test plugin interface and types
describe('plugin Server Methods Extension', () => {
  it('should allow defining plugins with serverSetup', () => {
    const plugin: DevpilotPlugin = {
      namespace: 'test-plugin',
      serverSetup: ctx => ({
        testMethod() {
          return 'result';
        },
      }),
    };

    expect(plugin.namespace).toBe('test-plugin');
    expect(typeof plugin.serverSetup).toBe('function');
  });

  it('should support async server methods', () => {
    const plugin: DevpilotPlugin = {
      namespace: 'async-plugin',
      serverSetup: () => ({
        async fetchData(id: string) {
          return { id, data: 'mock' };
        },
      }),
    };

    const methods = plugin.serverSetup?.({ wsPort: 3000, storage: createStorage() });
    expect(methods).toBeDefined();
    expect(typeof methods?.fetchData).toBe('function');
  });

  it('should support multiple methods per plugin', () => {
    const plugin: DevpilotPlugin = {
      namespace: 'multi-method-plugin',
      serverSetup: () => ({
        method1: () => 'result1',
        method2: (x: number) => x * 2,
        method3: async (msg: string) => `Echo: ${msg}`,
      }),
    };

    const methods = plugin.serverSetup?.({ wsPort: 3000, storage: createStorage() });
    expect(Object.keys(methods || {}).length).toBe(3);
  });
});

describe('plugin Type System', () => {
  it('should validate plugin structure', () => {
    // Valid plugin with all properties
    const plugin1: DevpilotPlugin = {
      namespace: 'test',
      clientModule: './client.ts',
      serverSetup: () => ({}),
    };

    // Valid plugin with only namespace
    const plugin2: DevpilotPlugin = {
      namespace: 'test2',
    };

    // Valid plugin with namespace and clientModule
    const plugin3: DevpilotPlugin = {
      namespace: 'test3',
      clientModule: ctx => `./${ctx.wsPort}/client.ts`,
    };

    expect(plugin1.namespace).toBe('test');
    expect(plugin2.namespace).toBe('test2');
    expect(typeof plugin3.clientModule).toBe('function');
  });
});
