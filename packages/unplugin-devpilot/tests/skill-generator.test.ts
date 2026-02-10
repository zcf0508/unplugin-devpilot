import type { OptionsResolved } from '../src/core/options';
import { promises as fs } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCoreSkill, resolveSkillModule } from '../src/core/skill-generator';

// Mock fs module
vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    readFile: vi.fn(),
    chmod: vi.fn(),
    readdir: vi.fn().mockResolvedValue([]),
  },
}));

describe('skill-generator', () => {
  describe('resolveSkillModule', () => {
    it('should resolve skill module path correctly', () => {
      const importMetaUrl = 'file:///path/to/plugin/index.ts';
      const relativePath = './skill.md';

      const result = resolveSkillModule(importMetaUrl, relativePath);

      expect(result).toMatchInlineSnapshot(
        '"file:///path/to/plugin/skill.md"',
      );
    });

    it('should handle nested paths', () => {
      const importMetaUrl = 'file:///path/to/plugin/index.ts';
      const relativePath = './skills/custom.md';

      const result = resolveSkillModule(importMetaUrl, relativePath);

      expect(result).toMatchInlineSnapshot(
        '"file:///path/to/plugin/skills/custom.md"',
      );
    });

    it('should handle parent directory paths', () => {
      const importMetaUrl = 'file:///path/to/plugin/index.ts';
      const relativePath = '../skill.md';

      const result = resolveSkillModule(importMetaUrl, relativePath);

      expect(result).toMatchInlineSnapshot(
        '"file:///path/to/skill.md"',
      );
    });
  });

  describe('generateCoreSkill', () => {
    let mockOptions: OptionsResolved;

    beforeEach(() => {
      vi.clearAllMocks();
      (fs.readdir as any).mockResolvedValue([]);
      mockOptions = {
        wsPort: 3100,
        mcpPort: 3101,
        plugins: [],
        skillPaths: ['/test/skills/core.md'],
      };
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should not generate skill file when skillPaths is not configured', async () => {
      const optionsWithoutSkillPath: OptionsResolved = {
        wsPort: 3100,
        mcpPort: 3101,
        plugins: [],
        skillPaths: undefined,
      };

      await generateCoreSkill(optionsWithoutSkillPath, true);

      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('should generate SKILL.md when skillPaths is a directory', async () => {
      const optionsWithDirectory: OptionsResolved = {
        wsPort: 3100,
        mcpPort: 3101,
        plugins: [],
        skillPaths: ['/test/skills/devpilot'],
      };

      await generateCoreSkill(optionsWithDirectory, true);

      expect(fs.mkdir).toHaveBeenCalledWith('/test/skills/devpilot', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalled();

      const writeFileCall = (fs.writeFile as any).mock.calls[0];
      expect(writeFileCall[0]).toBe('/test/skills/devpilot/SKILL.md');
    });

    it('should copy plugin skill files to directory when skillPaths is a directory', async () => {
      const mockPlugin = {
        namespace: 'builtin-dom-inspector',
        skillModule: 'file:///test/plugin/skill.md',
      };

      const optionsWithDirectory: OptionsResolved = {
        wsPort: 3100,
        mcpPort: 3101,
        plugins: [mockPlugin as any],
        skillPaths: ['/test/skills/devpilot'],
      };

      const skillContent = '# DOM Inspector Skill\n\nThis is a DOM inspector skill.';
      (fs.readFile as any).mockImplementation((path: string) => {
        if (path === '/test/plugin/skill.md') {
          return Promise.resolve(skillContent);
        }
        return Promise.reject(new Error('ENOENT'));
      });

      await generateCoreSkill(optionsWithDirectory, true);

      expect(fs.mkdir).toHaveBeenCalledWith('/test/skills/devpilot', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalled();

      const writeFileCalls = (fs.writeFile as any).mock.calls;
      expect(writeFileCalls.length).toBe(2);

      // First call should be the plugin skill file (copied to directory)
      expect(writeFileCalls[0][0]).toBe('/test/skills/devpilot/builtin-dom-inspector.md');
      expect(writeFileCalls[0][1]).toBe(skillContent);

      // Second call should be the core skill file (SKILL.md)
      expect(writeFileCalls[1][0]).toBe('/test/skills/devpilot/SKILL.md');
      expect(writeFileCalls[1][1]).toMatchInlineSnapshot(`
        "# Devpilot Core Skills

        This is the core skill file that aggregates all plugin skills.

        ## Available Skills

        - [builtin-dom-inspector](./builtin-dom-inspector.md) - builtin-dom-inspector capabilities

        ## Usage

        These skills can be used with Claude Agent to interact with web applications.

        ## Configuration

        - **Plugins**: 1
        - **WebSocket Port**: 3100
        - **MCP Port**: 3101
        "
      `);
    });

    it('should not generate skill file in production mode', async () => {
      await generateCoreSkill(mockOptions, false);

      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should generate skill file in development mode', async () => {
      const mockPlugin = {
        namespace: 'test-plugin',
        skillModule: 'file:///test/plugin/skill.md',
      };

      mockOptions.plugins = [mockPlugin as any];

      const skillContent = '# Test Plugin Skill\n\nThis is a test plugin skill.';
      (fs.readFile as any).mockImplementation((path: string) => {
        if (path === '/test/plugin/skill.md') {
          return Promise.resolve(skillContent);
        }
        return Promise.reject(new Error('ENOENT'));
      });

      await generateCoreSkill(mockOptions, true);

      expect(fs.mkdir).toHaveBeenCalledWith('/test/skills', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalled();

      // Check that the plugin skill file was copied and core skill file was written
      const writeFileCalls = (fs.writeFile as any).mock.calls;
      expect(writeFileCalls.length).toBe(2);

      // First call should be the plugin skill file
      expect(writeFileCalls[0][0]).toBe('/test/skills/test-plugin.md');
      expect(writeFileCalls[0][1]).toBe('# Test Plugin Skill\n\nThis is a test plugin skill.');

      // Second call should be the core skill file
      expect(writeFileCalls[1][0]).toBe('/test/skills/core.md');
      expect(writeFileCalls[1][1]).toMatchInlineSnapshot(`
        "# Devpilot Core Skills

        This is the core skill file that aggregates all plugin skills.

        ## Available Skills

        - [test-plugin](./test-plugin.md) - test-plugin capabilities

        ## Usage

        These skills can be used with Claude Agent to interact with web applications.

        ## Configuration

        - **Plugins**: 1
        - **WebSocket Port**: 3100
        - **MCP Port**: 3101
        "
      `);
    });

    it('should handle plugin with npm package skill path', async () => {
      const mockPlugin = {
        namespace: 'npm-plugin',
        skillModule: 'npm:my-plugin/skill.md',
      };

      mockOptions.plugins = [mockPlugin as any];

      await generateCoreSkill(mockOptions, true);

      expect(fs.writeFile).toHaveBeenCalled();

      const writeFileCall = (fs.writeFile as any).mock.calls[0];
      expect(writeFileCall[1]).toMatchInlineSnapshot(`
        "# Devpilot Core Skills

        This is the core skill file that aggregates all plugin skills.

        ## Available Skills

        - [npm-plugin](npm:my-plugin/skill.md) - npm-plugin capabilities

        ## Usage

        These skills can be used with Claude Agent to interact with web applications.

        ## Configuration

        - **Plugins**: 1
        - **WebSocket Port**: 3100
        - **MCP Port**: 3101
        "
      `);
    });

    it('should handle plugin with relative skill path', async () => {
      const mockPlugin = {
        namespace: 'relative-plugin',
        skillModule: './skill.md',
      };

      mockOptions.plugins = [mockPlugin as any];

      await generateCoreSkill(mockOptions, true);

      expect(fs.writeFile).toHaveBeenCalled();

      const writeFileCall = (fs.writeFile as any).mock.calls[0];
      expect(writeFileCall[1]).toMatchInlineSnapshot(`
        "# Devpilot Core Skills

        This is the core skill file that aggregates all plugin skills.

        ## Available Skills

        - [relative-plugin](./relative-plugin.md) - relative-plugin capabilities

        ## Usage

        These skills can be used with Claude Agent to interact with web applications.

        ## Configuration

        - **Plugins**: 1
        - **WebSocket Port**: 3100
        - **MCP Port**: 3101
        "
      `);
    });

    it('should handle multiple plugins', async () => {
      const mockPlugins = [
        { namespace: 'plugin-a', skillModule: 'file:///test/plugin-a/skill.md' },
        { namespace: 'plugin-b', skillModule: 'file:///test/plugin-b/skill.md' },
      ];

      mockOptions.plugins = mockPlugins as any;

      const skillContent = '# Plugin Skill\n\nThis is a plugin skill.';
      (fs.readFile as any).mockImplementation((path: string) => {
        if (path === '/test/plugin-a/skill.md' || path === '/test/plugin-b/skill.md') {
          return Promise.resolve(skillContent);
        }
        return Promise.reject(new Error('ENOENT'));
      });

      await generateCoreSkill(mockOptions, true);

      expect(fs.writeFile).toHaveBeenCalled();

      const writeFileCalls = (fs.writeFile as any).mock.calls;
      expect(writeFileCalls.length).toBe(3); // 2 plugin files + 1 core file

      // Check that the plugin skill files were copied
      expect(writeFileCalls[0][0]).toBe('/test/skills/plugin-a.md');
      expect(writeFileCalls[1][0]).toBe('/test/skills/plugin-b.md');

      // Check that the core skill file was written
      const content = writeFileCalls[2][1];
      expect(content).toMatchInlineSnapshot(`
        "# Devpilot Core Skills

        This is the core skill file that aggregates all plugin skills.

        ## Available Skills

        - [plugin-a](./plugin-a.md) - plugin-a capabilities
        - [plugin-b](./plugin-b.md) - plugin-b capabilities

        ## Usage

        These skills can be used with Claude Agent to interact with web applications.

        ## Configuration

        - **Plugins**: 2
        - **WebSocket Port**: 3100
        - **MCP Port**: 3101
        "
      `);
    });

    it('should handle no plugins configured', async () => {
      mockOptions.plugins = [];

      await generateCoreSkill(mockOptions, true);

      expect(fs.writeFile).toHaveBeenCalled();

      const writeFileCall = (fs.writeFile as any).mock.calls[0];
      expect(writeFileCall[1]).toMatchInlineSnapshot(`
        "# Devpilot Core Skills

        This is the core skill file that aggregates all plugin skills.

        ## Available Skills

        No plugin skills configured

        ## Usage

        These skills can be used with Claude Agent to interact with web applications.

        ## Configuration

        - **Plugins**: 0
        - **WebSocket Port**: 3100
        - **MCP Port**: 3101
        "
      `);
    });
  });
});
