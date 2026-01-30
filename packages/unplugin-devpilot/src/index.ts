import type { UnpluginInstance } from 'unplugin';
import type { Options } from './core/options';
import { createUnplugin } from 'unplugin';
import { resolveOptions } from './core/options';

export const Starter: UnpluginInstance<Options | undefined, false>
  = createUnplugin((rawOptions = {}) => {
    const options = resolveOptions(rawOptions);

    const name = 'unplugin-devpilot';
    return {
      name,
      enforce: options.enforce,

      transform: {
        filter: {
          id: { include: options.include, exclude: options.exclude },
        },
        // eslint-disable-next-line unused-imports/no-unused-vars
        handler(code, id) {
          return `// unplugin-devpilot injected\n${code}`;
        },
      },
    };
  });
