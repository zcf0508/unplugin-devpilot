import { exec } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * npx free-port :port
 */
export async function killPort(port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    exec(`npx -y @maxbo/free-port ${port} -s`, (err, stdout, _stderr) => {
      if (err) {
        reject(err);
      }
      else {
        console.log(stdout);
        resolve();
      }
    });
  });
}

/**
 * Resolve the module path relative to the plugin to an absolute path
 * Handles cross-platform paths (Windows, macOS, Linux) and proper escaping for imports
 * @param importMetaUrl - Pass in import.meta.url
 * @param relativePath - Path relative to the plugin
 * @example
 * ```ts
 * import { resolveModule } from 'unplugin-devpilot/core/utils'
 *
 * const skillPath = resolveModule(import.meta.url, './skill.md')
 * ```
 */
export function resolveModule(importMetaUrl: string, relativePath: string): string {
  const __dirname = dirname(fileURLToPath(importMetaUrl));
  const absolutePath = join(__dirname, relativePath);
  // Convert to file URL and then to string for proper escaping and import compatibility
  return pathToFileURL(absolutePath).href;
}
