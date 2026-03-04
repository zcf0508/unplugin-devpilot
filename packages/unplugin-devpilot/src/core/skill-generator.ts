import type { DevpilotPlugin, OptionsResolved } from './options';
import { promises as fs } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getBuiltinToolNames } from './builtin-tools';
import { getPluginStorage } from './storage';
import { resolveModule } from './utils';

/**
 * Check if a path is a directory
 * @param path - The path to check
 * @returns true if the path is a directory
 */
async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
  }
  catch {
    return false;
  }
}

/**
 * Check if index.md exists in a directory
 * @param dirPath - The directory path to check
 * @returns true if index.md exists
 */
async function hasIndexMd(dirPath: string): Promise<boolean> {
  try {
    await fs.access(join(dirPath, 'index.md'));
    return true;
  }
  catch {
    return false;
  }
}

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
 * @param skillPath - The configured skill core path (directory or file)
 * @returns The actual file path to use for the core skill file
 */
function getCoreSkillFilePath(skillPath: string): string {
  if (isDirectoryPath(skillPath)) {
    // If it's a directory, use SKILL.md as the filename
    return join(skillPath, 'SKILL.md');
  }
  // If it's a file path, use it as-is
  return skillPath;
}

/**
 * Get all plugin skill modules
 * Supports file:// URLs (from resolveModule) and direct paths (relative/absolute)
 */
async function getPluginSkillModules(plugins: DevpilotPlugin[], options: OptionsResolved): Promise<Array<{
  namespace: string
  path: string
  isDirectory: boolean
  hasIndexMd: boolean
}>> {
  const results = [];
  for (const p of plugins) {
    if (!p.skillModule) { continue; }

    const ctx = { wsPort: options.wsPort, storage: getPluginStorage(p.namespace) };
    const mod = typeof p.skillModule === 'function'
      ? p.skillModule(ctx)
      : p.skillModule!;

    // Handle file:// URLs or direct paths
    const skillPath = mod.startsWith('file://')
      ? fileURLToPath(mod)
      : mod;

    // Check if it's a directory
    const isDir = await isDirectory(skillPath);
    // Check if index.md exists (only for directories)
    const hasIndex = isDir && await hasIndexMd(skillPath);

    results.push({
      namespace: p.namespace,
      path: skillPath,
      isDirectory: isDir,
      hasIndexMd: hasIndex,
    });
  }
  return results;
}

function collectAllowedTools(plugins: DevpilotPlugin[], options: OptionsResolved): string[] {
  const tools: string[] = [...getBuiltinToolNames()];
  for (const plugin of plugins) {
    if (plugin.mcpSetup) {
      try {
        const ctx = { wsPort: options.wsPort, storage: getPluginStorage(plugin.namespace) };
        const mcps = plugin.mcpSetup(ctx);
        for (const register of mcps) {
          const result = register();
          if (result.name) {
            tools.push(result.name);
          }
        }
      }
      catch {
        // skip
      }
    }
  }
  return tools;
}

function generateFrontmatter(options: OptionsResolved): string {
  const allowedTools = collectAllowedTools(options.plugins, options);
  const toolsYaml = allowedTools.length > 0
    ? `allowed-tools: [\n${allowedTools.map(t => `  "${t}"`).join(',\n')}\n]`
    : 'allowed-tools: []';

  return `---
name: devpilot
description: Devpilot core skill that aggregates all plugin skills for web application interaction and debugging.
${toolsYaml}
---`;
}

/**
 * Generate the core skill markdown content
 */
async function generateCoreSkillContent(options: OptionsResolved, isDev: boolean): Promise<string> {
  if (!isDev) {
    return '';
  }

  const pluginSkills = await getPluginSkillModules(options.plugins, options);

  const skillList = pluginSkills.map((skill) => {
    // For directories with index.md, link to index.md
    // For directories without index.md, link to the folder itself (let LLM find the entry)
    // For files, link to the namespace.md file
    let linkPath: string;
    if (skill.isDirectory) {
      linkPath = skill.hasIndexMd
        ? `./${skill.namespace}/index.md`
        : `./${skill.namespace}/`;
    }
    else {
      linkPath = `./${skill.namespace}.md`;
    }
    return `- [${skill.namespace}](${linkPath}) - ${skill.namespace} capabilities`;
  }).join('\n');

  const frontmatter = generateFrontmatter(options);

  return `${frontmatter}

# Devpilot Core Skills

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
  if (!options.skillPaths || options.skillPaths.length === 0) {
    return;
  }

  const content = await generateCoreSkillContent(options, isDev);
  const pluginSkills = await getPluginSkillModules(options.plugins, options);

  for (const skillPath of options.skillPaths) {
    const skillFilePath = getCoreSkillFilePath(skillPath);
    const dir = dirname(skillFilePath);

    if (!isDev || !content) {
      for (const skill of pluginSkills) {
        try {
          if (skill.isDirectory) {
            // Remove the entire directory for folder-based skills
            await fs.rm(join(dir, skill.namespace), { recursive: true, force: true });
          }
          else {
            // Remove single file
            await fs.unlink(join(dir, `${skill.namespace}.md`));
          }
        }
        catch {
          // File/directory doesn't exist
        }
      }
      try {
        await fs.unlink(skillFilePath);
      }
      catch {
        // File doesn't exist
      }
      continue;
    }

    await fs.mkdir(dir, { recursive: true });

    for (const skill of pluginSkills) {
      if (skill.isDirectory) {
        // Copy entire directory
        await copyDirectory(skill.path, join(dir, skill.namespace));
      }
      else {
        // Copy single file
        await copyPluginSkillFile(skill.path, join(dir, `${skill.namespace}.md`));
      }
    }

    let existingContent: string | undefined;
    try {
      existingContent = await fs.readFile(skillFilePath, 'utf-8');
    }
    catch {
      // File doesn't exist
    }

    if (existingContent !== content) {
      await fs.writeFile(skillFilePath, content, 'utf-8');
    }

    await setPermissionsRecursive(dir).catch(() => {
      // Ignore permission errors
    });
  }
}

async function setPermissionsRecursive(dirPath: string): Promise<void> {
  const isRoot = process.getuid?.() === 0;
  const sudoUid = Number(process.env.SUDO_UID);
  const sudoGid = Number(process.env.SUDO_GID);
  const shouldChown = isRoot && !Number.isNaN(sudoUid) && !Number.isNaN(sudoGid);

  async function applyPermissions(targetPath: string, mode: number): Promise<void> {
    try {
      await fs.chmod(targetPath, mode);
      if (shouldChown) {
        await fs.chown(targetPath, sudoUid, sudoGid);
      }
    }
    catch {
      // Ignore permission errors on individual entries
    }
  }

  async function walk(currentPath: string): Promise<void> {
    await applyPermissions(currentPath, 0o777);
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        }
        else {
          await applyPermissions(fullPath, 0o666);
        }
      }
    }
    catch {
      // Ignore readdir errors
    }
  }

  await walk(dirPath);
}

async function copyPluginSkillFile(sourcePath: string, destPath: string): Promise<boolean> {
  try {
    const skillContent = await fs.readFile(sourcePath, 'utf-8');
    let existingDest: string | undefined;
    try {
      existingDest = await fs.readFile(destPath, 'utf-8');
    }
    catch {
      // File doesn't exist
    }
    if (existingDest !== skillContent) {
      await fs.writeFile(destPath, skillContent, 'utf-8');
      return true;
    }
    return false;
  }
  catch {
    return false;
  }
}

/**
 * Copy a directory recursively from source to destination
 * @param sourceDir - Source directory path
 * @param destDir - Destination directory path
 * @returns true if any files were copied or updated
 */
async function copyDirectory(sourceDir: string, destDir: string): Promise<boolean> {
  let changed = false;

  try {
    // Ensure destination directory exists
    await fs.mkdir(destDir, { recursive: true });

    // Read source directory
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = join(sourceDir, entry.name);
      const destPath = join(destDir, entry.name);

      if (entry.isDirectory()) {
        // Recursively copy subdirectories
        const subDirChanged = await copyDirectory(sourcePath, destPath);
        if (subDirChanged) { changed = true; }
      }
      else if (entry.isFile()) {
        // Copy file
        const fileChanged = await copyPluginSkillFile(sourcePath, destPath);
        if (fileChanged) { changed = true; }
      }
    }

    return changed;
  }
  catch {
    return false;
  }
}
