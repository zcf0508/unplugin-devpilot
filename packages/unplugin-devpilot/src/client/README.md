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
