import { beforeEach, describe, expect, it } from 'vitest';
import { inputTextById } from '../../src/client/inputTextById';

describe('inputTextById', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should input text into input element', async () => {
    document.body.innerHTML = '<input data-devpilot-id="e123">';
    const input = document.querySelector('input')!;

    const result = await inputTextById('e123', 'test value');

    expect(result.success).toBe(true);
    expect(input.value).toBe('test value');
  });

  it('should input text into textarea element', async () => {
    document.body.innerHTML = '<textarea data-devpilot-id="e123"></textarea>';
    const textarea = document.querySelector('textarea')!;

    const result = await inputTextById('e123', 'test value');

    expect(result.success).toBe(true);
    expect(textarea.value).toBe('test value');
  });

  it('should select option by value in select element', async () => {
    document.body.innerHTML = `
          <select data-devpilot-id="e123">
            <option value="1">Option 1</option>
            <option value="2">Option 2</option>
          </select>
        `;
    const select = document.querySelector('select')!;

    const result = await inputTextById('e123', '2');

    expect(result.success).toBe(true);
    expect(select.value).toBe('2');
  });

  it('should select option by display text in select element', async () => {
    document.body.innerHTML = `
          <select data-devpilot-id="e123">
            <option value="1">Option 1</option>
            <option value="2">Option 2</option>
          </select>
        `;
    const select = document.querySelector('select')!;

    const result = await inputTextById('e123', 'Option 2');

    expect(result.success).toBe(true);
    expect(select.value).toBe('2');
  });

  it('should return error when option text not found in select', async () => {
    document.body.innerHTML = `
          <select data-devpilot-id="e123">
            <option value="1">Option 1</option>
          </select>
        `;

    const result = await inputTextById('e123', 'Nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toContain('No option found');
  });

  it('should return error when element not found', async () => {
    const result = await inputTextById('nonexistent', 'test');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should return error for non-input element', async () => {
    document.body.innerHTML = '<div data-devpilot-id="e123">Content</div>';

    const result = await inputTextById('e123', 'test');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not an input');
  });
});
