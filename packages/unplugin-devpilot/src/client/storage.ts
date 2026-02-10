import type { DevpilotClient } from './types';

export interface ClientStorage {
  getItem: <T = any>(key: string) => Promise<T | null>
  setItem: <T = any>(key: string, value: T) => Promise<void>
  removeItem: (key: string) => Promise<void>
  getKeys: (base?: string) => Promise<string[]>
  hasItem: (key: string) => Promise<boolean>
  clear: (base?: string) => Promise<void>
}

export function createClientStorage(client: DevpilotClient<any>, namespace: string): ClientStorage {
  return {
    getItem: <T = any>(key: string) => client.rpcCall('storageGetItem', namespace, key) as unknown as Promise<T | null>,
    setItem: <T = any>(key: string, value: T) => client.rpcCall('storageSetItem', namespace, key, value) as unknown as Promise<void>,
    removeItem: (key: string) => client.rpcCall('storageRemoveItem', namespace, key) as unknown as Promise<void>,
    getKeys: (base?: string) => client.rpcCall('storageGetKeys', namespace, base) as unknown as Promise<string[]>,
    hasItem: (key: string) => client.rpcCall('storageHasItem', namespace, key) as unknown as Promise<boolean>,
    clear: (base?: string) => client.rpcCall('storageClear', namespace, base) as unknown as Promise<void>,
  };
}
