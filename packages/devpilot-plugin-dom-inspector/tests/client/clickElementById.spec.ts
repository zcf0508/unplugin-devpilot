import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clickElementById } from '../../src/client/clickElementById';

describe('clickElementById', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should click element by ID', async () => {
    document.body.innerHTML = '<button data-devpilot-id="e123">Click me</button>';
    const button = document.querySelector('button')!;
    const clickSpy = vi.spyOn(button, 'click');

    const result = await clickElementById('e123');

    expect(result.success).toBe(true);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('should return error when element not found', async () => {
    const result = await clickElementById('nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should return error when element is disabled', async () => {
    document.body.innerHTML = '<button data-devpilot-id="e123" disabled>Click me</button>';

    const result = await clickElementById('e123');

    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  });

  it('should return error when element is not visible', async () => {
    document.body.innerHTML = '<button data-devpilot-id="e123" style="display: none">Click me</button>';

    const result = await clickElementById('e123');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not visible');
  });

  it('should return error for non-HTMLElement', async () => {
    document.body.innerHTML = '<svg data-devpilot-id="e123"></svg>';

    const result = await clickElementById('e123');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not clickable');
  });
});
