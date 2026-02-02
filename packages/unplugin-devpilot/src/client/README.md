# unplugin-devpilot/client

Client-side runtime for unplugin-devpilot with full TypeScript support.

## Usage

### Via Virtual Module (Recommended)

```typescript
import { client, wsPort } from 'virtual:devpilot-client';

client?.onConnected(() => {
  console.log('Connected to devpilot server');
});

client?.rpcCall('someMethod', arg1, arg2);
```

Add type support in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["unplugin-devpilot/virtual"]
  }
}
```

### Direct Import

```typescript
import { createDevpilotClient, getDevpilotClient } from 'unplugin-devpilot/client';

// Create a new client
const client = createDevpilotClient({ wsPort: 3100 });

// Or get the global client (after virtual module is loaded)
const client = getDevpilotClient();
```

## API

### `DevpilotClient`

```typescript
interface DevpilotClient {
  getClientId: () => string | null
  rpcCall: <T>(method: string, ...args: unknown[]) => Promise<T>
  isConnected: () => boolean
  onConnected: (callback: () => void) => () => void
  onDisconnected: (callback: () => void) => () => void
}
```

### Events

The client dispatches custom events on `window`:

- `devpilot:taskUpdate` - When task count changes
- `devpilot:taskCompleted` - When a task is completed

```typescript
window.addEventListener('devpilot:taskUpdate', (e) => {
  console.log('Task count:', e.detail.count);
});
```

## For Plugin Authors

Plugins can inject their own client modules:

```typescript
import type { DevpilotPlugin } from 'unplugin-devpilot';
import { resolveClientModule } from 'unplugin-devpilot';

export function myPlugin(): DevpilotPlugin {
  return {
    name: 'my-plugin',
    clientModule: resolveClientModule(import.meta.url, './client.ts'),
  };
}
```

In your plugin's client module, access the devpilot client:

```typescript
// my-plugin/client.ts
import { getDevpilotClient } from 'unplugin-devpilot/client';

const client = getDevpilotClient();
client?.onConnected(() => {
  // Your plugin logic here
});
```

## Extending RPC Methods (TypeScript)

### Option 1: Generic Type Parameters (Recommended)

Plugin authors can pass custom type parameters to get full type safety:

```typescript
// Define your plugin's server methods
interface MyPluginServerMethods {
  myCustomMethod: (param: string) => { result: string }
  anotherMethod: (id: number) => Promise<boolean>
}

// When creating or getting the client, pass your type
const client = getDevpilotClient<MyPluginServerMethods>();

// Now TypeScript provides autocomplete and type checking
client?.rpcCall('myCustomMethod', 'hello'); // ✅ Typed params and return value
client?.rpcCall('anotherMethod', 123); // ✅ Type-safe
client?.rpcCall('nonExistentMethod', 123); // ❌ Type error
```

### Option 2: Module Augmentation

Alternatively, use TypeScript's module augmentation:

```typescript
// In your plugin's types file
declare module 'unplugin-devpilot/core/types' {
  interface PluginServerFunctions {
    myCustomMethod: (param: string) => { result: string }
  }
}

// No need to pass generic parameters, types are automatically extended
client?.rpcCall('myCustomMethod', 'hello'); // ✅ Type-safe
```

### For Plugin Authors

Create a typed wrapper for your plugin:

```typescript
// my-plugin/client.ts
import { getDevpilotClient } from 'unplugin-devpilot/client';

export interface MyPluginServerMethods {
  myPluginMethod: (data: string) => Promise<number>
  anotherMethod: (count: number) => boolean
}

export function getTypedClient() {
  return getDevpilotClient<MyPluginServerMethods>();
}

// Usage in plugin
const client = getTypedClient();
const result = await client?.rpcCall('myPluginMethod', 'test'); // result is typed as number
```

This approach provides full type safety while maintaining plugin pluggability.

## Injecting Server-Side Methods from Plugins

Plugins can now inject server-side RPC methods that can be called from the client:

### Plugin Definition

**`my-plugin/index.ts`:**
```typescript
import type { DevpilotPlugin, DevpilotPluginContext } from 'unplugin-devpilot';
import { resolveClientModule } from 'unplugin-devpilot';

export interface MyPluginServerMethods {
  getServerTime: () => string
  calculateMetrics: (start: number, end: number) => Promise<{ avg: number, sum: number }>
}

export function myPlugin(): DevpilotPlugin {
  return {
    namespace: 'my-plugin',

    // Inject client module
    clientModule: resolveClientModule(import.meta.url, './client.ts'),

    // Inject server-side RPC methods
    serverSetup: (ctx: DevpilotPluginContext) => ({
      getServerTime() {
        return new Date().toISOString();
      },

      async calculateMetrics(start: number, end: number) {
        const sum = start + end;
        return { avg: sum / 2, sum };
      },
    }),
  };
}

// Optional: Augment types for automatic extension
declare module 'unplugin-devpilot/core/types' {
  interface PluginServerFunctions extends MyPluginServerMethods {}
}
```

### Plugin Client Module

**`my-plugin/client.ts`:**
```typescript
import type { MyPluginServerMethods } from '../';
import { getDevpilotClient } from 'unplugin-devpilot/client';

const client = getDevpilotClient<MyPluginServerMethods>();

client?.onConnected(async () => {
  // Server methods are now available with full type safety
  const serverTime = await client.rpcCall('getServerTime');
  console.log('Server time:', serverTime);

  const metrics = await client.rpcCall('calculateMetrics', 0, 100);
  console.log('Average:', metrics.avg, 'Sum:', metrics.sum);
});
```

### Application Usage

**`vite.config.ts`:**
```typescript
import { unpluginDevpilot } from 'unplugin-devpilot';
import { defineConfig } from 'vite';
import { myPlugin } from './my-plugin';

export default defineConfig({
  plugins: [
    unpluginDevpilot({
      plugins: [
        myPlugin(),
      ],
    }),
  ],
});
```

### Type Safety Benefits

```typescript
// ✅ Full IntelliSense and type checking
const time = await client.rpcCall('getServerTime');
//    ^ Inferred as Promise<string>

const metrics = await client.rpcCall('calculateMetrics', 0, 100);
//    ^ Inferred as Promise<{ avg: number; sum: number }>

// ❌ Type errors at compile time
client.rpcCall('getServerTime', 'unexpected-arg'); // Error: Expected 0 arguments
client.rpcCall('nonExistentMethod'); // Error: Argument of type 'nonExistentMethod' is not assignable
```

This enables complete plugin extensibility with full type safety across the client-server boundary.
