import type { DevpilotPlugin, OptionsResolved } from './options';
import { promises as fs } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModule } from './utils';

/**
 * Resolve the skill module path relative to the plugin to an absolute path
 * Handles cross-platform paths (Windows, macOS, Linux) and proper escaping for imports
 * @param importMetaUrl - Pass in import.meta.url
 * @param relativePath - Path relative to the plugin
 * @example
 * ```ts
 * import { resolveSkillModule } from 'unplugin-devpilot'
 *
 * export function myPlugin(): DevpilotPlugin {
 *   return {
 *     namespace: 'my-plugin',
 *     skillModule: resolveSkillModule(import.meta.url, './skill.md'),
 *   }
 * }
 * ```
 */
export function resolveSkillModule(importMetaUrl: string, relativePath: string): string {
  return resolveModule(importMetaUrl, relativePath);
}

/**
 * Determine if a path is a directory (no file extension) or a file
 * @param path - The path to check
 * @returns true if the path is a directory, false if it's a file
 */
function isDirectoryPath(path: string): boolean {
  // Check if the path has a file extension
  const ext = extname(path);
  return ext === '';
}

/**
 * Get the core skill file path, handling both directory and file paths
 * @param skillCorePath - The configured skill core path (directory or file)
 * @returns The actual file path to use for the core skill file
 */
function getCoreSkillFilePath(skillCorePath: string): string {
  if (isDirectoryPath(skillCorePath)) {
    // If it's a directory, use SKILL.md as the filename
    return join(skillCorePath, 'SKILL.md');
  }
  // If it's a file path, use it as-is
  return skillCorePath;
}

/**
 * Get all plugin skill modules
 */
function getPluginSkillModules(plugins: DevpilotPlugin[], options: OptionsResolved): Array<{
  namespace: string
  path: string
  originalSkillModule: string
}> {
  const ctx = { wsPort: options.wsPort };
  return plugins
    .filter(p => p.skillModule)
    .map((p) => {
      const mod = typeof p.skillModule === 'function'
        ? p.skillModule(ctx)
        : p.skillModule!;

      // Convert file URL back to path or handle npm package paths
      let skillPath: string;
      if (mod.startsWith('file://')) {
        // File URL - convert to path
        skillPath = fileURLToPath(mod);
      }
      else if (mod.startsWith('npm:') || (!mod.startsWith('.') && !mod.startsWith('/') && (mod.includes('/') || mod.match(/^[@a-z0-9]\S+$/i)))) {
        // npm package path - keep as-is
        // Supports: 'npm:my-plugin/skill', 'my-plugin/skill', '@scope/package/skill'
        skillPath = mod;
      }
      else {
        // Relative path - convert to absolute path
        // This handles cases where skillModule returns a relative path directly
        skillPath = mod;
      }

      return {
        namespace: p.namespace,
        path: skillPath,
        originalSkillModule: mod,
      };
    });
}

/**
 * Generate the core skill markdown content
 */
function generateCoreSkillContent(options: OptionsResolved, isDev: boolean): string {
  // In non-dev mode, return empty content
  if (!isDev) {
    return '';
  }

  const pluginSkills = getPluginSkillModules(options.plugins, options);

  // Generate skill list with relative paths to copied plugin skill files
  const skillList = pluginSkills.map((skill) => {
    // For file:// paths, we'll copy the file to the core skill directory
    // For npm package paths, we keep the original path
    // For relative paths, we keep the original path

    if (skill.originalSkillModule.startsWith('file://')) {
      // File URL - will be copied to core skill directory
      // Use the namespace as the filename
      const linkPath = `./${skill.namespace}.md`;
      return `- [${skill.namespace}](${linkPath}) - ${skill.namespace} capabilities`;
    }
    else if (skill.originalSkillModule.startsWith('npm:') || (!skill.originalSkillModule.startsWith('.') && !skill.originalSkillModule.startsWith('/') && (skill.originalSkillModule.includes('/') || skill.originalSkillModule.match(/^[@a-z0-9]\S+$/i)))) {
      // npm package path - use as-is without path conversion
      return `- [${skill.namespace}](${skill.originalSkillModule}) - ${skill.namespace} capabilities`;
    }
    else {
      // Relative path - will be copied to core skill directory
      // Use the namespace as the filename
      const linkPath = `./${skill.namespace}.md`;
      return `- [${skill.namespace}](${linkPath}) - ${skill.namespace} capabilities`;
    }
  }).join('\n');

  return `# Devpilot Core Skills

This is the core skill file that aggregates all plugin skills.

## Available Skills

${skillList || 'No plugin skills configured'}

## Usage

These skills can be used with Claude Agent to interact with web applications.

## Configuration

- **Plugins**: ${options.plugins.length}
- **WebSocket Port**: ${options.wsPort}
- **MCP Port**: ${options.mcpPort}
`;
}

/**
 * Generate and write the core skill files to all configured paths
 */
export async function generateCoreSkill(options: OptionsResolved, isDev: boolean): Promise<void> {
  // Only generate if skillPaths is configured
  if (!options.skillPaths || options.skillPaths.length === 0) {
    return;
  }

  const content = generateCoreSkillContent(options, isDev);

  // Process each configured path
  for (const skillCorePath of options.skillPaths) {
    // Get the actual file path (handle directory paths)
    const skillFilePath = getCoreSkillFilePath(skillCorePath);

    // If in non-dev mode or no content, ensure file doesn't exist or is empty
    if (!isDev || !content) {
      try {
        await fs.unlink(skillFilePath);
      }
      catch {
        // File doesn't exist, which is fine
      }
      continue;
    }

    // Check if file exists and content has changed
    let existingContent: string | undefined;
    try {
      existingContent = await fs.readFile(skillFilePath, 'utf-8');
    }
    catch {
      // File doesn't exist
    }

    // Only write if content has changed
    if (existingContent === content) {
      continue;
    }

    // Ensure the directory exists
    const dir = dirname(skillFilePath);
    await fs.mkdir(dir, { recursive: true });

    // Copy plugin skill files to the core skill directory
    const pluginSkills = getPluginSkillModules(options.plugins, options);
    for (const skill of pluginSkills) {
      // Only copy file:// paths
      if (skill.originalSkillModule.startsWith('file://')) {
        const sourcePath = skill.path;
        const destPath = join(dir, `${skill.namespace}.md`);

        try {
          const skillContent = await fs.readFile(sourcePath, 'utf-8');
          await fs.writeFile(destPath, skillContent, 'utf-8');
        }
        catch {
          // If we can't read the source file, skip copying
          // The core skill file will still be generated with a link to the original path
        }
      }
    }

    // Write the core skill file
    await fs.writeFile(skillFilePath, content, 'utf-8');
  }
}

/**
 * Represents a skill path with type information
 */
export interface SkillPathInfo {
  /** The type of the skill path */
  type: 'file' | 'npm' | 'relative'
  /** The actual path or identifier */
  path: string
  /** The namespace of the plugin (if applicable) */
  namespace?: string
}
