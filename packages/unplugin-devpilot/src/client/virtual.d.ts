declare module 'virtual:devpilot-client' {
  import type { DevpilotClient } from 'unplugin-devpilot/client';

  export const client: DevpilotClient;
  export const wsPort: number;
}
