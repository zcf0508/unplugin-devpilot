export interface Options {
  wsPort?: number
  mcpPort?: number
}

export type OptionsResolved = Required<Options>;

export function resolveOptions(options: Options): OptionsResolved {
  return {
    wsPort: options.wsPort || 3100,
    mcpPort: options.mcpPort || 3101,
  };
}
