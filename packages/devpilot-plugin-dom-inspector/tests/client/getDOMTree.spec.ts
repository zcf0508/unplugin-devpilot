import { beforeEach, describe, expect, it } from 'vitest';
import { getDOMTree } from '../../src/client/getDOMTree';

describe('getDOMTree', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should return complete DOM tree', async () => {
    document.body.innerHTML = `
          <header>Header</header>
          <main>Main</main>
        `;
    const result = await getDOMTree(5);

    expect(result.success).toBe(true);
    expect(result.tree).not.toBeNull();
    expect(result.tree!.role).toBe('document');
    expect(result.tree!.children).toHaveLength(1);
    expect(result.timestamp).toBeDefined();
  });

  it('should include document title', async () => {
    document.title = 'Test Page';
    document.body.innerHTML = '<div>Content</div>';
    const result = await getDOMTree(5);

    expect(result.tree!.name).toBe('Test Page');
    expect(result.tree!.attributes!.title).toBe('Test Page');
  });
});
