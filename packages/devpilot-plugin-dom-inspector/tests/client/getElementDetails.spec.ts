import { beforeEach, describe, expect, it } from 'vitest';
import { getElementDetails } from '../../src/client/getElementDetails';
import { DEFAULT_STYLE_PROPS } from '../../src/client/utils/computedStyles';

describe('getElementDetails', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does not include style fields unless requested', async () => {
    document.body.innerHTML = '<div data-devpilot-id="e1">Content</div>';

    const result = await getElementDetails('e1');

    expect(result.success).toBe(true);
    expect(result.elements![0].styles).toBeUndefined();
    expect(result.elements![0].pseudoStyles).toBeUndefined();
    expect(result.elements![0].pseudoNote).toBeUndefined();
  });

  it('returns requested computed styles', async () => {
    document.body.innerHTML = '<div data-devpilot-id="e1" style="font-weight: 500; color: rgb(1, 2, 3);"></div>';

    const result = await getElementDetails('e1', {
      includeStyles: true,
      styleProps: ['font-weight', 'fontWeight', 'color'],
    });

    expect(result.elements![0].styles).toMatchInlineSnapshot(`
      {
        "color": "rgb(1, 2, 3)",
        "font-weight": "500",
        "fontWeight": "500",
      }
    `);
  });

  it('defaults to the curated property set when styleProps is omitted', async () => {
    document.body.innerHTML = '<div data-devpilot-id="e1" style="font-weight: 500;"></div>';

    const result = await getElementDetails('e1', { includeStyles: true });

    const styles = result.elements![0].styles!;
    expect(Object.keys(styles)).toEqual([...DEFAULT_STYLE_PROPS]);
    expect(styles['font-weight']).toBe('500');
  });

  it('returns pseudo-element styles separately when generated', async () => {
    document.body.innerHTML = '<style>#p::before { content: "x"; }</style><div id="p" data-devpilot-id="e1"></div>';

    const result = await getElementDetails('e1', {
      includeStyles: true,
      styleProps: ['content'],
      pseudo: '::before',
    });

    expect(result.elements![0].pseudoStyles).toMatchInlineSnapshot(`
      {
        "::before": {
          "content": ""x"",
        },
      }
    `);
  });

  it('notes when the requested pseudo-element is not generated', async () => {
    document.body.innerHTML = '<div data-devpilot-id="e1"></div>';

    const result = await getElementDetails('e1', {
      includeStyles: true,
      styleProps: ['content'],
      pseudo: '::before',
    });

    expect(result.elements![0].pseudoNote).toBe('::before not found on this element');
    expect(result.elements![0].pseudoStyles).toBeUndefined();
  });

  it('returns an error when no element matches', async () => {
    const result = await getElementDetails('nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
