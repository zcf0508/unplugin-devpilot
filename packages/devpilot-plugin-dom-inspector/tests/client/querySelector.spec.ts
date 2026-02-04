import { beforeEach, describe, expect, it } from 'vitest';
import { querySelector } from '../../src/client/querySelector';

describe('querySelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should return matched elements', async () => {
    document.body.innerHTML = `
          <button class="btn">Button 1</button>
          <button class="btn">Button 2</button>
        `;
    const result = await querySelector('.btn', 5);

    expect(result.success).toBe(true);
    expect(result.matchedCount).toBe(2);
    expect(result.elements).toHaveLength(2);
    expect(result.elements[0].matchedSelector).toBe('.btn');
  });

  it('should return empty array when no match', async () => {
    document.body.innerHTML = '<div>Content</div>';
    const result = await querySelector('.nonexistent', 5);

    expect(result.success).toBe(true);
    expect(result.matchedCount).toBe(0);
    expect(result.elements).toHaveLength(0);
  });

  it('should return error for invalid selector', async () => {
    const result = await querySelector('[[[invalid', 5);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
