import { beforeEach, describe, expect, it } from 'vitest';
import { getElementInfoById } from '../../src/client/getElementInfoById';

describe('getElementInfoById', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  it('should return element info', async () => {
    document.body.innerHTML = '<button data-devpilot-id="e123" id="submit" class="btn primary">Submit</button>';

    const result = await getElementInfoById('e123');

    expect(result.success).toBe(true);
    expect(result.element).toBeDefined();
    expect(result.element!.id).toBe('e123');
    expect(result.element!.tag).toBe('button');
    expect(result.element!.text).toBe('Submit');
    expect(result.element!.attributes.id).toBe('submit');
    expect(result.element!.attributes.class).toBe('btn primary');
  });

  it('should return error when element not found', async () => {
    const result = await getElementInfoById('nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should extract input value', async () => {
    document.body.innerHTML = '<input data-devpilot-id="e123" value="test value">';
    const input = document.querySelector('input')!;
    input.value = 'test value';

    const result = await getElementInfoById('e123');

    expect(result.success).toBe(true);
    expect(result.element!.text).toBe('test value');
  });

  it('should include data-insp-path attribute in element info', async () => {
    document.body.innerHTML = '<button data-devpilot-id="e123" data-insp-path="src/App.tsx:10:5:button" id="submit" class="btn">Submit</button>';

    const result = await getElementInfoById('e123');

    expect(result.success).toBe(true);
    expect(result.element).toBeDefined();
    expect(result.element!.attributes['data-insp-path']).toBe('src/App.tsx:10:5:button');
  });

  it('should work with elements without data-insp-path', async () => {
    document.body.innerHTML = '<button data-devpilot-id="e123" id="submit">Submit</button>';

    const result = await getElementInfoById('e123');

    expect(result.success).toBe(true);
    expect(result.element).toBeDefined();
    expect(result.element!.attributes['data-insp-path']).toBeUndefined();
  });

  it('should include multiple source location attributes', async () => {
    document.body.innerHTML = `
      <div
        data-devpilot-id="e123"
        data-insp-path="src/components/Button.tsx:15:3:div"
        id="container"
        class="wrapper"
      >
        Content
      </div>
    `;

    const result = await getElementInfoById('e123');

    expect(result.success).toBe(true);
    expect(result.element).toBeDefined();
    expect(result.element!.tag).toBe('div');
    expect(result.element!.text).toBe('Content');
    expect(result.element!.attributes.id).toBe('container');
    expect(result.element!.attributes.class).toBe('wrapper');
    expect(result.element!.attributes['data-insp-path']).toBe('src/components/Button.tsx:15:3:div');
  });
});
