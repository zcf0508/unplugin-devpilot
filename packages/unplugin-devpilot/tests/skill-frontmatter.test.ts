import { describe, expect, it } from 'vitest';
import { parseSkillFrontmatter } from '../src/core/skill-frontmatter';

describe('parseSkillFrontmatter', () => {
  it('should read a plain description', () => {
    const content = `---
name: dom-inspector
description: Advanced DOM inspection and interaction capabilities.
allowed-tools: ["get_page_snapshot"]
---

# DOM Inspector Skill
`;

    expect(parseSkillFrontmatter(content)).toMatchInlineSnapshot(`
      {
        "description": "Advanced DOM inspection and interaction capabilities.",
      }
    `);
  });

  it('should collapse a block scalar description into one line', () => {
    const content = `---
name: multi-line
description: >
  Inspect page layout
  and debug browser logs.
---
`;

    expect(parseSkillFrontmatter(content)).toMatchInlineSnapshot(`
      {
        "description": "Inspect page layout and debug browser logs.",
      }
    `);
  });

  it('should strip surrounding quotes from the description', () => {
    const content = `---
description: "Quoted: with colon"
---
`;

    expect(parseSkillFrontmatter(content)).toMatchInlineSnapshot(`
      {
        "description": "Quoted: with colon",
      }
    `);
  });

  it('should return empty when frontmatter is absent', () => {
    expect(parseSkillFrontmatter('# Just a heading\n\ndescription: not frontmatter')).toMatchInlineSnapshot('{}');
  });

  it('should return empty when the frontmatter block is unterminated', () => {
    expect(parseSkillFrontmatter('---\ndescription: broken\n')).toMatchInlineSnapshot('{}');
  });

  it('should return empty when yaml is invalid', () => {
    expect(parseSkillFrontmatter('---\ndescription: [unclosed\n---\n')).toMatchInlineSnapshot('{}');
  });

  it('should return empty when description is missing or not a string', () => {
    expect(parseSkillFrontmatter('---\nname: only-name\n---\n')).toMatchInlineSnapshot('{}');
    expect(parseSkillFrontmatter('---\ndescription: 42\n---\n')).toMatchInlineSnapshot('{}');
    expect(parseSkillFrontmatter('---\ndescription: "   "\n---\n')).toMatchInlineSnapshot('{}');
  });

  it('should tolerate a BOM and windows line endings', () => {
    const content = '\uFEFF---\r\ndescription: Windows style\r\n---\r\n';

    expect(parseSkillFrontmatter(content)).toMatchInlineSnapshot(`
      {
        "description": "Windows style",
      }
    `);
  });
});
