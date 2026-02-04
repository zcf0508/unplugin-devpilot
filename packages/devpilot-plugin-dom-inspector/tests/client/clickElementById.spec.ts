import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clickElementById } from '../../src/client/clickElementById';

describe('clickElementById', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should click element by ID', async () => {
    document.body.innerHTML = '<button data-devpilot-id="e123">Click me</button>';
    const button = document.querySelector('button')!;
    const dispatchSpy = vi.spyOn(button, 'dispatchEvent');

    const result = await clickElementById('e123');

    expect(result.success).toBe(true);
    expect(dispatchSpy).toHaveBeenCalled();
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

  it('should return error when element is not visible (display: none)', async () => {
    document.body.innerHTML = '<button data-devpilot-id="e123" style="display: none">Click me</button>';

    const result = await clickElementById('e123');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not visible');
  });

  it('should return error when element is not visible (visibility: hidden)', async () => {
    document.body.innerHTML = '<button data-devpilot-id="e123" style="visibility: hidden">Click me</button>';

    const result = await clickElementById('e123');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not visible');
  });

  it('should return error when element has zero size', async () => {
    document.body.innerHTML = '<button data-devpilot-id="e123" style="width: 0; height: 0">Click me</button>';
    const button = document.querySelector('button')!;
    // Mock getBoundingClientRect to return zero size
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    });

    const result = await clickElementById('e123');

    expect(result.success).toBe(false);
    expect(result.error).toContain('zero size');
  });

  it('should return error for non-HTMLElement', async () => {
    document.body.innerHTML = '<svg data-devpilot-id="e123"></svg>';

    const result = await clickElementById('e123');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not clickable');
  });

  it('should click element with position: fixed (offsetParent is null but element is visible)', async () => {
    document.body.innerHTML = '<button data-devpilot-id="e123" style="position: fixed">Click me</button>';
    const button = document.querySelector('button')!;
    const dispatchSpy = vi.spyOn(button, 'dispatchEvent');

    const result = await clickElementById('e123');

    expect(result.success).toBe(true);
    expect(dispatchSpy).toHaveBeenCalled();
  });
});
