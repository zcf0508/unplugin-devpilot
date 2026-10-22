import { parse as parseYaml } from 'yaml';

export interface SkillFrontmatter {
  description?: string
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?\r?\n)---(?:\r?\n|$)/;

/**
 * Read the `description` from a skill markdown frontmatter block
 * @param content - The skill markdown content
 * @returns Parsed frontmatter, empty when the block is absent or invalid
 */
export function parseSkillFrontmatter(content: string): SkillFrontmatter {
  const match = FRONTMATTER_RE.exec(content.replace(/^\uFEFF/, ''));
  if (!match) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]!);
  }
  catch {
    return {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  const description = (parsed as Record<string, unknown>).description;
  if (typeof description !== 'string') {
    return {};
  }

  const inline = description.replace(/\s+/g, ' ').trim();
  return inline
    ? { description: inline }
    : {};
}
