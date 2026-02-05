import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollToElement } from '../../src/client/scrollToElement';

describe('scrollToElement', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('should scroll element into view by devpilot-id', async () => {
    document.body.innerHTML = '<div data-devpilot-id="e123" style="height: 2000px">Content</div>';

    const result = await scrollToElement('e123');

    expect(result.success).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    });
  });

  it('should scroll element into view by CSS selector', async () => {
    document.body.innerHTML = '<div id="myElement" style="height: 2000px">Content</div>';

    const result = await scrollToElement('#myElement');

    expect(result.success).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('should support auto behavior', async () => {
    document.body.innerHTML = '<div data-devpilot-id="e123">Content</div>';

    const result = await scrollToElement('e123', 'auto');

    expect(result.success).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'center',
      inline: 'center',
    });
  });

  it('should return error when element not found', async () => {
    const result = await scrollToElement('nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toMatchInlineSnapshot(`"Element not found for selector: \"nonexistent\".

Available options:
1. Use devpilot-id (e.g., "e123") - recommended, more reliable
2. Use CSS selector (e.g., "#myId", ".myClass", "button[type=submit]")
3. Use get_compact_snapshot() to see available element IDs

Note: devpilot-id takes priority over CSS selectors. If you're using a CSS selector that looks like an ID (e.g., "e123"), it will first try to find an element with data-devpilot-id=\"e123\"."`);
  });

  it('should support e-prefixed devpilot-id format', async () => {
    document.body.innerHTML = '<div data-devpilot-id="e1">Content</div>';

    const result = await scrollToElement('e1');

    expect(result.success).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
