import type { SimulatedStyleState, StylePropertySource, StyleSourcesResult } from '../../src/shared-types';
import { beforeEach, describe, expect, it } from 'vitest';
import { getStyleSources } from '../../src/client/getStyleSources';

function propertyAt(result: StyleSourcesResult, property: string, stateIndex = 0): StylePropertySource {
  const propertyResult = result.elements![0].states[stateIndex].properties.find(item => item.property === property);
  expect(propertyResult).toBeDefined();
  return propertyResult!;
}

async function inspect(
  css: string,
  properties: string[],
  options?: { states?: SimulatedStyleState[], pseudo?: '::before' | '::after', html?: string },
): Promise<StyleSourcesResult> {
  const style = document.createElement('style');
  style.dataset.testStyle = '';
  style.textContent = css;
  document.head.append(style);
  document.body.innerHTML = options?.html ?? '<button id="target" class="btn" data-devpilot-id="e1">Submit</button>';
  return getStyleSources('e1', { properties, states: options?.states, pseudo: options?.pseudo });
}

describe('getStyleSources', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-test-style]').forEach(style => style.remove());
    document.adoptedStyleSheets = [];
  });

  it('traces shorthand winners and partially overridden declarations', async () => {
    const result = await inspect(`
      button { border: 2px dashed red; }
      .btn { border: 1px solid blue; }
      #target { border-color: green; }
    `, ['border']);

    expect(result.success).toBe(true);
    const property = propertyAt(result, 'border');
    expect(property.computedValue).toBe('1px solid rgb(0, 128, 0)');
    expect(property.declarations.map(declaration => ({
      selector: declaration.selector,
      property: declaration.property,
      status: declaration.status,
      applied: declaration.appliedProperties?.length ?? 0,
      overridden: declaration.overriddenProperties?.length ?? 0,
    }))).toMatchInlineSnapshot(`
      [
        {
          "applied": 4,
          "overridden": 0,
          "property": "border-color",
          "selector": "#target",
          "status": "partially-applied",
        },
        {
          "applied": 13,
          "overridden": 4,
          "property": "border",
          "selector": ".btn",
          "status": "partially-applied",
        },
        {
          "applied": 0,
          "overridden": 17,
          "property": "border",
          "selector": "button",
          "status": "overridden",
        },
      ]
    `);
  });

  it('uses source order when specificity and importance tie', async () => {
    const result = await inspect('.btn { color: red; } .btn { color: blue; }', ['color']);

    expect(propertyAt(result, 'color').declarations.map(item => [item.value, item.status])).toMatchInlineSnapshot(`
      [
        [
          "blue",
          "applied",
        ],
        [
          "red",
          "overridden",
        ],
      ]
    `);
    expect(propertyAt(result, 'color').declarations[1].reason).toMatchInlineSnapshot('"color: .btn wins later in source order"');
  });

  it('reverses layer priority for important declarations', async () => {
    const result = await inspect(`
      @layer base, components;
      @layer base { .base { color: red !important; background-color: red; } }
      @layer components { .component { color: blue !important; background-color: blue; } }
    `, ['color', 'background-color'], {
      html: '<button class="base component" data-devpilot-id="e1">Layers</button>',
    });

    expect(propertyAt(result, 'color').declarations[0]).toMatchObject({ selector: '.base', status: 'applied', layer: 'base' });
    expect(propertyAt(result, 'background-color').declarations[0]).toMatchObject({ selector: '.component', status: 'applied', layer: 'components' });
  });

  it('gives inline declarations their correct cascade priority', async () => {
    const result = await inspect('#target { color: red !important; border-color: red !important; }', ['color', 'border-color'], {
      html: '<button id="target" data-devpilot-id="e1" style="color: blue; border-color: blue !important">Inline</button>',
    });

    expect(propertyAt(result, 'color').declarations.map(item => [item.origin, item.status])).toMatchInlineSnapshot(`
      [
        [
          "author",
          "applied",
        ],
        [
          "inline",
          "overridden",
        ],
      ]
    `);
    expect(propertyAt(result, 'border-color').declarations.map(item => [item.origin, item.status])).toMatchInlineSnapshot(`
      [
        [
          "inline",
          "applied",
        ],
        [
          "author",
          "overridden",
        ],
      ]
    `);
  });

  it('keeps author-important declarations after inline revert-layer', async () => {
    const result = await inspect('#target { color: red !important; }', ['color'], {
      html: '<button id="target" data-devpilot-id="e1" style="color: revert-layer !important">Inline revert</button>',
    });

    expect(propertyAt(result, 'color').declarations.find(item => item.origin === 'author')).toMatchObject({ status: 'applied' });
  });

  it('traces inherited values and CSS variable declarations', async () => {
    const result = await inspect(`
      :root { --accent: rgb(5, 6, 7); }
      .parent { color: red; }
      .parent { color: var(--accent); }
    `, ['color'], {
      html: '<div class="parent"><span data-devpilot-id="e1">Inherited</span></div>',
    });

    const property = propertyAt(result, 'color');
    expect(property.computedValue).toBe('rgb(5, 6, 7)');
    expect(property.declarations).toEqual([]);
    expect(property.inheritedFrom?.element.tag).toBe('div');
    expect(property.inheritedFrom?.element.devpilotId).toBeUndefined();
    expect(document.querySelector('.parent')!.getAttribute('data-devpilot-id')).toBeNull();
    expect(property.inheritedFrom?.declarations[0]).toMatchObject({ property: 'color', value: 'var(--accent)', status: 'applied' });
    expect(property.inheritedFrom?.declarations[0].variables?.[0]).toMatchObject({
      name: '--accent',
      value: 'rgb(5, 6, 7)',
      declarations: [{ property: '--accent', value: 'rgb(5, 6, 7)', status: 'applied' }],
    });
  });

  it('simulates hover on the target and its ancestors without changing the page', async () => {
    const result = await inspect(`
      .btn { border-color: red; }
      .btn:hover { border-color: blue; }
      .ancestor:hover .btn { border-color: green; }
    `, ['border-color'], {
      states: ['hover'],
      html: '<div class="ancestor"><button class="btn" data-devpilot-id="e1">Hover</button></div>',
    });

    expect(propertyAt(result, 'border-color').computedValue).toBe('rgb(255, 0, 0)');
    const hover = propertyAt(result, 'border-color', 1);
    expect(hover.computedValue).toBeUndefined();
    expect(hover.declarations[0]).toMatchObject({ selector: '.ancestor:hover .btn', status: 'applied' });
    expect(hover.declarations.map(item => item.status)).toEqual(['applied', 'overridden', 'overridden']);
    expect(document.querySelector('[data-devpilot-simulated-state]')).toBeNull();
  });

  it('sets and restores simulation attributes once per matching round', async () => {
    document.body.innerHTML = '<button class="btn" data-devpilot-id="e1" data-devpilot-simulated-state="keep">Mutations</button>';
    const style = document.createElement('style');
    style.dataset.testStyle = '';
    style.textContent = '.btn { color: red; } .btn:hover { color: blue; } .btn:not(:focus) { border-color: green; }';
    document.head.append(style);
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((mutations) => {
      records.push(...mutations);
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-devpilot-simulated-state'],
      subtree: true,
    });

    await getStyleSources('e1', { properties: ['color'], states: ['hover'] });
    observer.disconnect();

    expect(records).toHaveLength(4);
    expect(document.querySelector('.btn')!.getAttribute('data-devpilot-simulated-state')).toBe('keep');
  });

  it('keeps focus scoped to the target while focus-within includes ancestors', async () => {
    const result = await inspect(`
      .btn { color: black; }
      .ancestor:focus .btn { color: red; }
      .ancestor:focus-within .btn { background-color: green; }
      .btn:focus { color: blue; }
    `, ['color', 'background-color'], {
      states: ['focus', 'focus-within'],
      html: '<div class="ancestor"><button class="btn" data-devpilot-id="e1">Focus</button></div>',
    });

    const simulated = result.elements![0].states[1];
    expect(simulated.states).toEqual(['focus', 'focus-within']);
    expect(propertyAt(result, 'color', 1).declarations.map(item => [item.selector, item.status])).toMatchInlineSnapshot(`
      [
        [
          ".btn:focus",
          "applied",
        ],
        [
          ".btn",
          "overridden",
        ],
      ]
    `);
    expect(propertyAt(result, 'background-color', 1).declarations[0]).toMatchObject({ selector: '.ancestor:focus-within .btn', status: 'applied' });
  });

  it('supports active and focus-visible simulation', async () => {
    const result = await inspect('.btn:active { color: red; } .btn:focus-visible { outline-color: blue; }', ['color', 'outline-color'], {
      states: ['active', 'focus-visible'],
    });

    expect(propertyAt(result, 'color', 1).declarations[0]).toMatchObject({ selector: '.btn:active', status: 'applied' });
    expect(propertyAt(result, 'outline-color', 1).declarations[0]).toMatchObject({ selector: '.btn:focus-visible', status: 'applied' });
  });

  it('matches nested selectors and reports the resolved selector', async () => {
    const result = await inspect('.parent { & > .btn { border-color: purple; } }', ['border-color'], {
      html: '<div class="parent"><button class="btn" data-devpilot-id="e1">Nested</button></div>',
    });

    expect(propertyAt(result, 'border-color').declarations[0]).toMatchObject({
      selector: '& > .btn',
      resolvedSelector: ':is(.parent) > .btn',
      status: 'applied',
    });
  });

  it('traces pseudo-element rules separately from the originating element', async () => {
    const result = await inspect('.btn::before { content: ""; border-color: rgb(1, 2, 3); } .btn { border-color: red; }', ['border-color'], {
      pseudo: '::before',
    });

    const property = propertyAt(result, 'border-color');
    expect(property.computedValue).toBe('rgb(1, 2, 3)');
    expect(property.declarations.map(item => item.selector)).toEqual(['.btn::before']);
  });

  it('marks inactive media rules and unknown container conditions honestly', async () => {
    const result = await inspect(`
      .btn { color: black; }
      @media (max-width: 1px) { .btn { color: red; } }
      @container (min-width: 1px) { .btn { color: blue; } }
    `, ['color'], {
      html: '<div style="container-type: inline-size"><button class="btn" data-devpilot-id="e1">Conditions</button></div>',
    });

    const declarations = propertyAt(result, 'color').declarations;
    expect(declarations.find(item => item.value === 'red')).toMatchObject({ status: 'inactive' });
    expect(declarations.find(item => item.value === 'blue')).toMatchObject({ status: 'unknown' });
    expect(declarations.find(item => item.value === 'black')).toMatchObject({ status: 'applied' });
  });

  it('reports a browser default when no author or inherited source exists', async () => {
    const result = await inspect('', ['border-top-width']);

    const property = propertyAt(result, 'border-top-width');
    expect(property.declarations).toEqual([]);
    expect(property.fallback).toMatchObject({ origin: 'user-agent', value: property.computedValue });
    expect(document.querySelector('iframe[data-devpilot-style-probe]')).toBeNull();
  });

  it('reads Vite module ids and generated declaration positions', async () => {
    const result = await getStyleSources('e1', { properties: ['color'] });
    expect(result.success).toBe(false);

    document.body.innerHTML = '<button class="btn" data-devpilot-id="e1">Source</button>';
    const style = document.createElement('style');
    style.dataset.testStyle = '';
    style.setAttribute('data-vite-dev-id', '/src/generated.css?direct');
    style.textContent = '\n.btn { color: red; }';
    document.head.append(style);

    const sourced = await getStyleSources('e1', { properties: ['color'] });
    expect(propertyAt(sourced, 'color').declarations[0].source).toMatchInlineSnapshot(`
      {
        "column": 8,
        "file": "/src/generated.css",
        "line": 2,
        "position": "generated",
      }
    `);
  });

  it('maps declaration positions through inline source maps', async () => {
    document.body.innerHTML = '<button class="btn" data-devpilot-id="e1">Mapped</button>';
    const map = {
      version: 3,
      sources: ['src/original.scss'],
      sourcesContent: ['.btn { color: red; }'],
      names: [],
      mappings: 'AAAA',
    };
    const style = document.createElement('style');
    style.dataset.testStyle = '';
    style.setAttribute('data-vite-dev-id', '/src/generated.css');
    style.textContent = `.btn { color: red; }\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,${btoa(JSON.stringify(map))} */`;
    document.head.append(style);

    const result = await getStyleSources('e1', { properties: ['color'] });
    expect(propertyAt(result, 'color').declarations[0].source).toMatchInlineSnapshot(`
      {
        "column": 1,
        "file": "src/original.scss",
        "line": 1,
        "position": "source",
      }
    `);
  });

  it('supports constructed stylesheets and reports unreadable sheets', async () => {
    document.body.innerHTML = '<button class="btn" data-devpilot-id="e1">Constructed</button>';
    const readable = new CSSStyleSheet();
    readable.replaceSync('.btn { color: rgb(9, 8, 7); }');
    const unreadable = new CSSStyleSheet();
    Object.defineProperty(unreadable, 'cssRules', {
      get() { throw new DOMException('Blocked for test', 'SecurityError'); },
    });
    document.adoptedStyleSheets = [readable, unreadable];

    const result = await getStyleSources('e1', { properties: ['color'] });
    expect(propertyAt(result, 'color').declarations[0]).toMatchObject({ value: 'rgb(9, 8, 7)', status: 'applied' });
    expect(result.warnings).toMatchInlineSnapshot(`
      [
        "Could not read a constructed stylesheet: SecurityError: Blocked for test",
      ]
    `);
    expect(propertyAt(result, 'color').notes).toMatchInlineSnapshot(`
      [
        "Some stylesheets could not be read; applied and overridden statuses are provisional.",
      ]
    `);
  });

  it('keeps declarations after nested rules in their real source-order slot', async () => {
    const result = await inspect(`
      .parent {
        color: red;
        & .child { color: blue; }
        color: green;
      }
    `, ['color'], {
      html: '<div class="parent" data-devpilot-id="e1"><span class="child">Nested declarations</span></div>',
    });

    expect(propertyAt(result, 'color').declarations.map(item => [item.value, item.status])).toMatchInlineSnapshot(`
      [
        [
          "green",
          "applied",
        ],
        [
          "red",
          "overridden",
        ],
      ]
    `);
  });

  it('uses the most specific matching branch of a selector list', async () => {
    const result = await inspect('.btn { color: red; } .btn, #target { color: blue; }', ['color']);

    const winner = propertyAt(result, 'color').declarations[0];
    expect(winner).toMatchObject({ selector: '#target', specificity: [1, 0, 0], status: 'applied' });
  });

  it('evaluates supports conditions and honors revert-layer', async () => {
    const result = await inspect(`
      @layer base, themed;
      @layer base { .btn { color: red; } }
      @layer themed { .btn { color: blue; } }
      @supports (display: grid) { @layer themed { .btn { color: revert-layer; } } }
      @supports (display: definitely-not-a-real-value) { .btn { color: green; } }
    `, ['color']);

    const declarations = propertyAt(result, 'color').declarations;
    expect(declarations.find(item => item.value === 'red')).toMatchObject({ status: 'applied', layer: 'base' });
    expect(declarations.find(item => item.value === 'revert-layer')).toMatchObject({ status: 'overridden', layer: 'themed' });
    expect(declarations.find(item => item.value === 'green')).toMatchObject({ status: 'inactive' });
  });

  it('rolls back from unlayered revert-layer to a lower author layer', async () => {
    const result = await inspect('@layer base { .btn { background-color: red; } } .btn { background-color: revert-layer; }', ['background-color']);

    const property = propertyAt(result, 'background-color');
    expect(property.computedValue).toBe('rgb(255, 0, 0)');
    expect(property.declarations.find(item => item.value === 'red')).toMatchObject({ status: 'applied' });
  });

  it('rolls back to a non-author fallback when no lower author declaration exists', async () => {
    const result = await inspect('.btn { background-color: revert-layer; }', ['background-color']);

    const property = propertyAt(result, 'background-color');
    expect(property.declarations.every(item => item.status !== 'applied' && item.status !== 'partially-applied')).toBe(true);
    expect(property.fallback).toBeDefined();
  });

  it('reverts through consecutive layers instead of selecting an intermediate layer', async () => {
    const result = await inspect(`
      @layer one, two, three;
      @layer one { .btn { color: red; } }
      @layer two { .btn { color: blue; color: revert-layer; } }
      @layer three { .btn { color: revert-layer; } }
    `, ['color']);

    expect(propertyAt(result, 'color').declarations.find(item => item.value === 'red')).toMatchObject({ status: 'applied' });
  });

  it('treats focus as focus-within without requiring both states explicitly', async () => {
    const result = await inspect('.ancestor:focus-within .btn { color: green; } .btn:focus { color: blue; }', ['color'], {
      states: ['focus'],
      html: '<div class="ancestor"><button class="btn" data-devpilot-id="e1">Focus closure</button></div>',
    });

    expect(propertyAt(result, 'color', 1).declarations[0]).toMatchObject({ selector: '.ancestor:focus-within .btn', status: 'applied' });
  });

  it('treats focus-visible as focus and focus-within', async () => {
    const result = await inspect('.ancestor:focus-within .btn { background-color: green; } .btn:focus { color: blue; }', ['color', 'background-color'], {
      states: ['focus-visible'],
      html: '<div class="ancestor"><button class="btn" data-devpilot-id="e1">Focus visible closure</button></div>',
    });

    expect(propertyAt(result, 'color', 1).declarations[0]).toMatchObject({ status: 'applied' });
    expect(propertyAt(result, 'background-color', 1).declarations[0]).toMatchObject({ status: 'applied' });
  });

  it('inherits pseudo-element values from the originating element before its ancestors', async () => {
    const result = await inspect(`
      .parent { color: green; --accent: rgb(1, 1, 1); }
      .btn { color: red; --accent: rgb(2, 3, 4); }
      .btn::before { content: ""; color: inherit; border-color: var(--accent); }
    `, ['color', 'border-color'], {
      pseudo: '::before',
      html: '<div class="parent"><button class="btn" data-devpilot-id="e1">Pseudo inheritance</button></div>',
    });

    expect(propertyAt(result, 'color').inheritedFrom?.element.class).toBe('btn');
    expect(propertyAt(result, 'color').inheritedFrom?.declarations[0]).toMatchObject({ value: 'red' });
    expect(propertyAt(result, 'border-color').declarations[0].variables?.[0].value).toBe('rgb(2, 3, 4)');
  });

  it('matches bare and legacy pseudo selectors and reports missing generated pseudo-elements', async () => {
    const result = await inspect('::before { content: ""; border-color: red; } .btn:before { border-color: blue; }', ['border-color'], {
      pseudo: '::before',
    });

    expect(propertyAt(result, 'border-color').declarations.map(item => [item.selector, item.status])).toMatchInlineSnapshot(`
      [
        [
          ".btn::before",
          "applied",
        ],
        [
          "::before",
          "overridden",
        ],
      ]
    `);

    document.head.querySelectorAll('style[data-test-style]').forEach(style => style.remove());
    const missing = await inspect('.btn::before { border-color: red; }', ['border-color'], { pseudo: '::before' });
    expect(propertyAt(missing, 'border-color').declarations).toEqual([]);
    expect(propertyAt(missing, 'border-color').notes).toMatchInlineSnapshot(`
      [
        "::before not found on this element",
      ]
    `);
  });

  it('uses inherited values when a winning var() declaration is invalid at computed-value time', async () => {
    const result = await inspect('.parent { color: green; } .btn { color: var(--missing); }', ['color'], {
      html: '<div class="parent"><span class="btn" data-devpilot-id="e1">Missing variable</span></div>',
    });

    const property = propertyAt(result, 'color');
    expect(property.declarations[0].status).toBe('invalid');
    expect(property.inheritedFrom?.element.class).toBe('parent');
    expect(property.inheritedFrom?.declarations[0]).toMatchObject({ value: 'green', status: 'applied' });
  });

  it('keeps explicit var() fallbacks valid', async () => {
    const result = await inspect('.btn { color: var(--missing, rgb(1, 2, 3)); }', ['color']);

    const property = propertyAt(result, 'color');
    expect(property.computedValue).toBe('rgb(1, 2, 3)');
    expect(property.declarations[0]).toMatchObject({ status: 'applied' });
  });

  it('rejects a var() fallback that does not match the target property grammar', async () => {
    const result = await inspect('.parent { color: green; } .btn { color: var(--missing, 20px); }', ['color'], {
      html: '<div class="parent"><span class="btn" data-devpilot-id="e1">Invalid fallback</span></div>',
    });

    const property = propertyAt(result, 'color');
    expect(property.computedValue).toBe('rgb(0, 128, 0)');
    expect(property.declarations[0].status).toBe('invalid');
    expect(property.inheritedFrom?.element.class).toBe('parent');
  });

  it('rejects the substituted value instead of using a fallback when the variable itself exists', async () => {
    const result = await inspect('.btn { --x: 20px; color: var(--x, red); }', ['color']);

    expect(propertyAt(result, 'color').declarations[0].status).toBe('invalid');
  });

  it('does not let fallbacks inside a variable cycle rescue its participants', async () => {
    const result = await inspect(`
      .btn {
        --one: var(--two);
        --two: var(--three, red);
        --three: var(--one);
        background-color: var(--one);
      }
    `, ['background-color']);

    expect(propertyAt(result, 'background-color').computedValue).toBe('rgba(0, 0, 0, 0)');
    expect(propertyAt(result, 'background-color').declarations[0].status).toBe('invalid');
  });

  it('allows a usage-site fallback when a referenced variable is cyclic', async () => {
    const result = await inspect('.btn { --loop: var(--loop); background-color: var(--loop, red); }', ['background-color']);

    expect(propertyAt(result, 'background-color').computedValue).toBe('rgb(255, 0, 0)');
    expect(propertyAt(result, 'background-color').declarations[0]).toMatchObject({ status: 'applied' });
  });

  it('evaluates inherited variable values in their source element context', async () => {
    const result = await inspect(`
      .parent { color: orange; --b: green; --a: var(--b); }
      .btn { --b: initial; color: var(--a); }
    `, ['color'], {
      html: '<div class="parent"><span class="btn" data-devpilot-id="e1">Inherited computed variable</span></div>',
    });

    const property = propertyAt(result, 'color');
    expect(property.computedValue).toBe('rgb(0, 128, 0)');
    expect(property.declarations[0].status).toBe('applied');
  });

  it('keeps an invalid custom property guaranteed-invalid instead of inheriting', async () => {
    const result = await inspect('.parent { --a: green; } .btn { --a: var(--missing); }', ['--a'], {
      html: '<div class="parent"><span class="btn" data-devpilot-id="e1">Invalid custom property</span></div>',
    });

    const property = propertyAt(result, '--a');
    expect(property.computedValue).toBe('');
    expect(property.declarations[0].status).toBe('invalid');
    expect(property.inheritedFrom).toBeUndefined();
  });

  it('keeps an initial custom property guaranteed-invalid instead of inheriting', async () => {
    const result = await inspect('.parent { --a: green; } .btn { --a: initial; }', ['--a'], {
      html: '<div class="parent"><span class="btn" data-devpilot-id="e1">Initial custom property</span></div>',
    });

    const property = propertyAt(result, '--a');
    expect(property.computedValue).toBe('');
    expect(property.declarations[0].status).toBe('invalid');
    expect(property.inheritedFrom).toBeUndefined();
  });

  it('detects the starting variable in a graph with multiple cycles', async () => {
    const result = await inspect(`
      .btn {
        --a: var(--b, red) var(--c);
        --b: var(--b);
        --c: var(--a);
        background-color: var(--a);
      }
    `, ['background-color']);

    expect(propertyAt(result, 'background-color').declarations[0].status).toBe('invalid');
  });

  it('distinguishes an ancestor variable cycle from a child variable with the same name', async () => {
    const result = await inspect(`
      .parent { --a: var(--a); --b: var(--a); }
      .btn { --a: var(--b, red); background-color: var(--a); }
    `, ['background-color'], {
      html: '<div class="parent"><span class="btn" data-devpilot-id="e1">Ancestor cycle</span></div>',
    });

    const property = propertyAt(result, 'background-color');
    expect(property.computedValue).toBe('rgb(255, 0, 0)');
    expect(property.declarations[0].status).toBe('applied');
  });

  it('uses the full parent selector list for nesting specificity', async () => {
    const result = await inspect('.a, #unused { & .btn { color: blue; } } .b .c .btn { color: red; }', ['color'], {
      html: '<div class="a b"><div class="c"><button class="btn" data-devpilot-id="e1">Nested specificity</button></div></div>',
    });

    expect(propertyAt(result, 'color').declarations[0]).toMatchObject({ value: 'blue', specificity: [1, 1, 0], status: 'applied' });
  });

  it('uses data-insp-path for inline style source locations', async () => {
    const result = await inspect('', ['color'], {
      html: '<button data-devpilot-id="e1" data-insp-path="src/App.tsx:12:7:button" style="color: red">Inline source</button>',
    });

    expect(propertyAt(result, 'color').declarations[0].source).toMatchInlineSnapshot(`
      {
        "column": 7,
        "file": "src/App.tsx",
        "line": 12,
        "position": "source",
      }
    `);
  });

  it('stops circular CSS variable traces without losing the declaration', async () => {
    const result = await inspect('.btn { --loop: var(--loop); color: var(--loop); }', ['color']);

    const winner = propertyAt(result, 'color').declarations[0];
    expect(winner.status).toBe('invalid');
    expect(winner.reason).toMatchInlineSnapshot('"Invalid at computed-value time: circular var() reference involving --loop"');
  });

  it('rejects an empty property list with an actionable error', async () => {
    document.body.innerHTML = '<button data-devpilot-id="e1">Empty</button>';

    const result = await getStyleSources('e1', { properties: [] });
    expect(result).toMatchInlineSnapshot(`
      {
        "error": "At least one CSS property is required. For example: [\"border\"] or [\"color\", \"background-color\"].",
        "selector": "e1",
        "success": false,
      }
    `);
  });

  it('reports unknown CSS properties instead of inventing a source', async () => {
    const result = await inspect('', ['not-a-real-property']);

    expect(propertyAt(result, 'not-a-real-property').fallback).toMatchObject({
      origin: 'unknown',
      note: '"not-a-real-property" is not a recognized CSS property.',
    });
  });

  it('returns the existing helpful error when no element matches', async () => {
    const result = await getStyleSources('missing', { properties: ['border'] });

    expect(result.success).toBe(false);
    expect(result.error).toMatchInlineSnapshot(`
      "Element not found for selector: "missing".

      Available options:
      1. Use devpilot-id (e.g., "e123") - recommended, more reliable
      2. Use CSS selector (e.g., "#myId", ".myClass", "button[type=submit]")
      3. Use get_compact_snapshot() to see available element IDs

      Note: devpilot-id takes priority over CSS selectors. If you're using a CSS selector that looks like an ID (e.g., "e123"), it will first try to find an element with data-devpilot-id="e123"."
    `);
  });
});
