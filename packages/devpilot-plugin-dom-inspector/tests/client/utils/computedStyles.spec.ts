import { beforeEach, describe, expect, it } from 'vitest';
import { isPseudoElementGenerated, readComputedStyles } from '../../../src/client/utils/computedStyles';

describe('readComputedStyles', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reads requested properties keyed by the caller-provided names', () => {
    document.body.innerHTML = '<div data-devpilot-id="e1" style="font-weight: 500; color: rgb(1, 2, 3);"></div>';
    const element = document.querySelector('[data-devpilot-id="e1"]')!;

    const styles = readComputedStyles(element, ['fontWeight', 'font-weight', 'color']);

    expect(styles).toMatchInlineSnapshot(`
      {
        "color": "rgb(1, 2, 3)",
        "font-weight": "500",
        "fontWeight": "500",
      }
    `);
  });

  it('keeps custom property names as-is', () => {
    document.body.innerHTML = '<div data-devpilot-id="e1" style="--MyVar: 42;"></div>';
    const element = document.querySelector('[data-devpilot-id="e1"]')!;

    const styles = readComputedStyles(element, ['--MyVar', '--myvar']);

    expect(styles).toMatchInlineSnapshot(`
      {
        "--MyVar": "42",
        "--myvar": "",
      }
    `);
  });

  it('returns an empty entry for unreadable properties and deduplicates repeated names', () => {
    document.body.innerHTML = '<div data-devpilot-id="e1"></div>';
    const element = document.querySelector('[data-devpilot-id="e1"]')!;

    const styles = readComputedStyles(element, ['not-a-real-prop', 'not-a-real-prop']);

    expect(styles).toMatchInlineSnapshot(`
      {
        "not-a-real-prop": "",
      }
    `);
  });

  it('returns data URIs in full', () => {
    const payload = 'A'.repeat(128);
    document.body.innerHTML = `<div data-devpilot-id="e1" style="background-image: url('data:image/svg+xml;base64,${payload}');"></div>`;
    const element = document.querySelector('[data-devpilot-id="e1"]')!;

    const styles = readComputedStyles(element, ['background-image']);

    expect(styles).toMatchInlineSnapshot(`
      {
        "background-image": "url("data:image/svg+xml;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")",
      }
    `);
  });

  it('reads pseudo-element styles when the pseudo-element is generated', () => {
    document.body.innerHTML = '<style>#p::before { content: "x"; color: rgb(9, 9, 9); }</style><div id="p" data-devpilot-id="e1"></div>';
    const element = document.querySelector('[data-devpilot-id="e1"]')!;

    const styles = readComputedStyles(element, ['content', 'color'], { pseudo: '::before' });

    expect(styles).toMatchInlineSnapshot(`
      {
        "color": "rgb(9, 9, 9)",
        "content": ""x"",
      }
    `);
  });
});

describe('isPseudoElementGenerated', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects generated and missing pseudo-elements', () => {
    document.body.innerHTML = '<style>#p::before { content: "x"; }</style><div id="p"></div>';
    const element = document.querySelector('#p')!;

    expect(isPseudoElementGenerated(element, '::before')).toBe(true);
    expect(isPseudoElementGenerated(element, '::after')).toBe(false);
  });

  it('treats an explicit empty-string content as generated', () => {
    document.body.innerHTML = '<style>#q::before { content: ""; }</style><div id="q"></div>';
    const element = document.querySelector('#q')!;

    expect(isPseudoElementGenerated(element, '::before')).toBe(true);
  });
});
