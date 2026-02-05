import { beforeEach, describe, expect, it } from 'vitest';
import { generateSelectorNotFoundError, resolveElementBySelector, resolveElementsBySelector } from '../../../src/client/utils/resolveSelector';

describe('resolveSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('resolveElementBySelector', () => {
    it('should find element by devpilot-id (priority 1)', () => {
      document.body.innerHTML = `
        <div data-devpilot-id="e123">Element with devpilot-id</div>
        <div id="e123">Element with HTML id</div>
      `;

      const element = resolveElementBySelector('e123');

      expect(element).toBeTruthy();
      expect(element?.textContent).toBe('Element with devpilot-id');
    });

    it('should find element by CSS selector when devpilot-id not found', () => {
      document.body.innerHTML = `
        <div id="myElement">Element with HTML id</div>
        <div class="myClass">Element with class</div>
      `;

      const element = resolveElementBySelector('#myElement');

      expect(element).toBeTruthy();
      expect(element?.textContent).toBe('Element with HTML id');
    });

    it('should find element by class selector', () => {
      document.body.innerHTML = `
        <div class="btn primary">Primary Button</div>
        <div class="btn secondary">Secondary Button</div>
      `;

      const element = resolveElementBySelector('.btn.primary');

      expect(element).toBeTruthy();
      expect(element?.textContent).toBe('Primary Button');
    });

    it('should return null when element not found by devpilot-id or CSS selector', () => {
      document.body.innerHTML = `
        <div id="existing">Existing element</div>
      `;

      const element = resolveElementBySelector('nonexistent');

      expect(element).toBeNull();
    });

    it('should return null for empty selector', () => {
      document.body.innerHTML = `
        <div id="test">Test</div>
      `;

      const element = resolveElementBySelector('');

      expect(element).toBeNull();
    });

    it('should return null for null selector', () => {
      const element = resolveElementBySelector(null as any);

      expect(element).toBeNull();
    });

    it('should handle attribute selectors', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" name="username" class="input-field">
          <input type="password" name="password" class="input-field">
        </form>
      `;

      // Attribute selector with brackets is recognized as CSS selector
      const element = resolveElementBySelector('input[name="username"]');

      expect(element).toBeTruthy();
      expect((element as HTMLInputElement)?.name).toBe('username');
    });

    it('should handle pseudo-class selectors', () => {
      document.body.innerHTML = `
        <div>
          <button disabled>Disabled</button>
          <button>Enabled</button>
        </div>
      `;

      // :disabled is a CSS pseudo-class
      const element = resolveElementBySelector('button:disabled');

      expect(element).toBeTruthy();
      expect(element?.textContent).toBe('Disabled');
    });

    it('should prioritize devpilot-id over CSS selector with same value', () => {
      document.body.innerHTML = `
        <div data-devpilot-id="test123">Devpilot element</div>
        <div id="test123">HTML id element</div>
      `;

      const element = resolveElementBySelector('test123');

      expect(element).toBeTruthy();
      expect(element?.textContent).toBe('Devpilot element');
    });

    it('should handle devpilot-id with special characters', () => {
      document.body.innerHTML = `
        <div data-devpilot-id="e-123_test">Element with special chars</div>
      `;

      const element = resolveElementBySelector('e-123_test');

      expect(element).toBeTruthy();
      expect(element?.textContent).toBe('Element with special chars');
    });

    it('should find element by devpilot-id (e-prefixed format)', () => {
      document.body.innerHTML = `
        <div data-devpilot-id="e1">Element with devpilot-id</div>
      `;

      const element = resolveElementBySelector('e1');

      expect(element).toBeTruthy();
      expect(element?.textContent).toBe('Element with devpilot-id');
    });
  });

  describe('resolveElementsBySelector', () => {
    it('should find multiple elements by devpilot-id', () => {
      document.body.innerHTML = `
        <div data-devpilot-id="group">Group container</div>
        <div data-devpilot-id="group">Another element with same devpilot-id</div>
      `;

      const elements = resolveElementsBySelector('group');

      expect(elements).toHaveLength(2);
    });

    it('should find multiple elements by CSS selector', () => {
      document.body.innerHTML = `
        <button class="btn">Button 1</button>
        <button class="btn">Button 2</button>
        <button class="btn">Button 3</button>
      `;

      const elements = resolveElementsBySelector('.btn');

      expect(elements).toHaveLength(3);
    });

    it('should return empty array when no elements found', () => {
      document.body.innerHTML = `
        <div id="test">Test</div>
      `;

      const elements = resolveElementsBySelector('.nonexistent');

      expect(elements).toHaveLength(0);
    });

    it('should return empty array for invalid selector', () => {
      const elements = resolveElementsBySelector('[[[invalid');

      expect(elements).toHaveLength(0);
    });

    it('should return empty array for empty selector', () => {
      const elements = resolveElementsBySelector('');

      expect(elements).toHaveLength(0);
    });

    it('should find element by devpilot-id (e-prefixed format)', () => {
      document.body.innerHTML = `
        <div data-devpilot-id="e1">Element with devpilot-id</div>
      `;

      const elements = resolveElementsBySelector('e1');

      expect(elements).toHaveLength(1);
      expect(elements[0]?.textContent).toBe('Element with devpilot-id');
    });
  });

  describe('generateSelectorNotFoundError', () => {
    it('should generate helpful error message', () => {
      const error = generateSelectorNotFoundError('e123');

      expect(error).toContain('Element not found for selector: "e123"');
      expect(error).toContain('Available options:');
      expect(error).toContain('devpilot-id');
      expect(error).toContain('CSS selector');
      expect(error).toContain('get_compact_snapshot()');
    });

    it('should include the selector in the error message', () => {
      const error = generateSelectorNotFoundError('#myButton');

      expect(error).toContain('#myButton');
    });

    it('should mention priority of devpilot-id over CSS selector', () => {
      const error = generateSelectorNotFoundError('test');

      expect(error).toContain('devpilot-id');
      expect(error).toContain('takes priority');
    });
  });
});
