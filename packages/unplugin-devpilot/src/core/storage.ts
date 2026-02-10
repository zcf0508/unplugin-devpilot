import type { Storage, StorageValue } from 'unstorage';
import { createStorage, prefixStorage } from 'unstorage';

export const storage: Storage<StorageValue> = createStorage();

export function getPluginStorage(namespace: string): Storage<StorageValue> {
  return prefixStorage(storage, namespace);
}

export async function disposeStorage(): Promise<void> {
  await storage.dispose();
}
