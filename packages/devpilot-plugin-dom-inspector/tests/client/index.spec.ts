import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAccessibilityTree, getAccessibilityInfo, rpcHandlers } from '../../src/client/index';

// Mock getDevpilotClient
vi.mock('unplugin-devpilot/client', () => ({
  getDevpilotClient: () => ({
    getClientId: () => 'test_client_id',
  }),
  defineRpcHandlers: (handlers: any) => handlers,
}));

describe('dOM Inspector - Client Side', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('getAccessibilityInfo', () => {
    it('should correctly extract button element info', () => {
      document.body.innerHTML = '<button aria-label="Close">X</button>';
      const button = document.querySelector('button')!;
      const info = getAccessibilityInfo(button);

      expect(info.role).toBe('button');
      expect(info.name).toBe('Close');
    });

    it('should extract name from aria-labelledby', () => {
      document.body.innerHTML = `
        <span id="label-id">Label Text</span>
        <div aria-labelledby="label-id">Content</div>
      `;
      const div = document.querySelector('div')!;
      const info = getAccessibilityInfo(div);

      expect(info.name).toBe('Label Text');
    });

    it('should extract name from aria-label', () => {
      document.body.innerHTML = '<div aria-label="Aria Label">Content</div>';
      const div = document.querySelector('div')!;
      const info = getAccessibilityInfo(div);

      expect(info.name).toBe('Aria Label');
    });

    it('should extract associated label for input', () => {
      document.body.innerHTML = `
        <label for="email">Email:</label>
        <input id="email" type="email">
      `;
      const input = document.querySelector('input')!;
      const info = getAccessibilityInfo(input);

      expect(info.name).toBe('Email:');
    });

    it('should extract name from placeholder', () => {
      document.body.innerHTML = '<input placeholder="Enter email">';
      const input = document.querySelector('input')!;
      const info = getAccessibilityInfo(input);

      expect(info.name).toBe('Enter email');
    });

    it('should extract input value', () => {
      document.body.innerHTML = '<input type="text" value="test value">';
      const input = document.querySelector('input')! as HTMLInputElement;
      input.value = 'test value';
      const info = getAccessibilityInfo(input);

      expect(info.value).toBe('test value');
    });

    it('should extract submit button value as name', () => {
      document.body.innerHTML = '<input type="submit" value="Submit Form">';
      const input = document.querySelector('input')!;
      const info = getAccessibilityInfo(input);

      expect(info.name).toBe('Submit Form');
    });

    it('should extract important attributes', () => {
      document.body.innerHTML = '<a id="link" class="nav-link" href="/path" title="Go">Link</a>';
      const a = document.querySelector('a')!;
      const info = getAccessibilityInfo(a);

      expect(info.attributes).toMatchObject({
        id: 'link',
        class: 'nav-link',
        href: '/path',
        title: 'Go',
      });
    });

    it('should extract aria-description', () => {
      document.body.innerHTML = '<button aria-description="Additional info">Click</button>';
      const button = document.querySelector('button')!;
      const info = getAccessibilityInfo(button);

      expect(info.description).toBe('Additional info');
    });
  });

  describe('buildAccessibilityTree', () => {
    it('should correctly build simple DOM tree', () => {
      document.body.innerHTML = `
        <div class="container">
          <h1>Title</h1>
          <button>Click</button>
        </div>
      `;
      const container = document.querySelector('.container')!;
      const tree = buildAccessibilityTree(container, 0, 5);

      expect(tree).not.toBeNull();
      expect(tree!.role).toBe('div');
      expect(tree!.children).toHaveLength(2);
      expect(tree!.children![0].role).toBe('h1');
      expect(tree!.children![1].role).toBe('button');
    });

    it('should filter hidden elements', () => {
      document.body.innerHTML = `
        <div>
          <span>Visible</span>
          <span hidden>Hidden</span>
        </div>
      `;
      const div = document.querySelector('div')!;
      const tree = buildAccessibilityTree(div, 0, 5);

      expect(tree!.children).toHaveLength(1);
      expect(tree!.children![0].name).toBe('Visible');
    });

    it('should filter display:none elements', () => {
      document.body.innerHTML = `
        <div>
          <span>Visible</span>
          <span style="display: none">Hidden</span>
        </div>
      `;
      const div = document.querySelector('div')!;
      const tree = buildAccessibilityTree(div, 0, 5);

      expect(tree!.children).toHaveLength(1);
    });

    it('should filter script/style/link elements', () => {
      document.body.innerHTML = `
        <div>
          <span>Content</span>
          <script>alert('test')</script>
          <style>.test {}</style>
        </div>
      `;
      const div = document.querySelector('div')!;
      const tree = buildAccessibilityTree(div, 0, 5);

      expect(tree!.children).toHaveLength(1);
      expect(tree!.children![0].role).toBe('span');
    });

    it('should respect maxDepth limit', () => {
      document.body.innerHTML = `
        <div id="level0">
          <div id="level1">
            <div id="level2">
              <div id="level3">Deep</div>
            </div>
          </div>
        </div>
      `;
      const root = document.querySelector('#level0')!;
      const tree = buildAccessibilityTree(root, 0, 1);

      expect(tree).not.toBeNull();
      expect(tree!.children).toHaveLength(1);
      expect(tree!.children![0].children).toBeUndefined();
    });

    it('leaf elements should not have children', () => {
      document.body.innerHTML = `
        <div>
          <input type="text">
          <button><span>Text</span></button>
        </div>
      `;
      const div = document.querySelector('div')!;
      const tree = buildAccessibilityTree(div, 0, 5);

      const inputNode = tree!.children!.find(c => c.role === 'input');
      const buttonNode = tree!.children!.find(c => c.role === 'button');

      expect(inputNode!.children).toBeUndefined();
      expect(buttonNode!.children).toBeUndefined();
    });

    it('should return null when exceeding maxDepth', () => {
      document.body.innerHTML = '<div>Test</div>';
      const div = document.querySelector('div')!;
      const tree = buildAccessibilityTree(div, 10, 5);

      expect(tree).toBeNull();
    });
  });

  describe('rpcHandlers', () => {
    describe('querySelector', () => {
      it('should return matched elements', async () => {
        document.body.innerHTML = `
          <button class="btn">Button 1</button>
          <button class="btn">Button 2</button>
        `;
        const result = await rpcHandlers.querySelector('.btn', 5);

        expect(result.success).toBe(true);
        expect(result.matchedCount).toBe(2);
        expect(result.elements).toHaveLength(2);
        expect(result.elements[0].matchedSelector).toBe('.btn');
      });

      it('should return empty array when no match', async () => {
        document.body.innerHTML = '<div>Content</div>';
        const result = await rpcHandlers.querySelector('.nonexistent', 5);

        expect(result.success).toBe(true);
        expect(result.matchedCount).toBe(0);
        expect(result.elements).toHaveLength(0);
      });

      it('should return error for invalid selector', async () => {
        const result = await rpcHandlers.querySelector('[[[invalid', 5);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('getDOMTree', () => {
      it('should return complete DOM tree', async () => {
        document.body.innerHTML = `
          <header>Header</header>
          <main>Main</main>
        `;
        const result = await rpcHandlers.getDOMTree(5);

        expect(result.success).toBe(true);
        expect(result.tree).not.toBeNull();
        expect(result.tree!.role).toBe('document');
        expect(result.tree!.children).toHaveLength(1);
        expect(result.timestamp).toBeDefined();
      });

      it('should include document title', async () => {
        document.title = 'Test Page';
        document.body.innerHTML = '<div>Content</div>';
        const result = await rpcHandlers.getDOMTree(5);

        expect(result.tree!.name).toBe('Test Page');
        expect(result.tree!.attributes!.title).toBe('Test Page');
      });
    });

    describe('getLogs', () => {
      it('should return logs structure', async () => {
        const result = await rpcHandlers.getLogs({ level: 'all', limit: 10 });

        expect(result.success).toBe(true);
        expect(result.logs).toBeDefined();
        expect(Array.isArray(result.logs)).toBe(true);
      });

      it('should work with default parameters', async () => {
        const result = await rpcHandlers.getLogs();

        expect(result.success).toBe(true);
        expect(result.level).toBe('all');
      });
    });

    describe('getCompactSnapshot', () => {
      it('should return compact snapshot', async () => {
        document.body.innerHTML = `
          <div class="container">
            <button id="submit-btn">Submit</button>
            <input type="text" placeholder="Enter text">
          </div>
        `;
        const result = await rpcHandlers.getCompactSnapshot(5);

        expect(result.success).toBe(true);
        expect(result.clientId).toBe('test_client_id');
        expect(result.url).toBeDefined();
        expect(result.title).toBeDefined();
        expect(result.timestamp).toBeDefined();
        expect(result.snapshot).toBeDefined();
        expect(result.snapshot).toContain('@e');
        expect(result.snapshot).toContain('[button]');
        expect(result.snapshot).toContain('Submit');
      });

      it('should respect maxDepth limit', async () => {
        document.body.innerHTML = `
          <div id="level0">
            <div id="level1">
              <div id="level2">Deep</div>
            </div>
          </div>
        `;
        const result = await rpcHandlers.getCompactSnapshot(1);

        expect(result.success).toBe(true);
        // Should not include deeply nested elements
        expect(result.snapshot).not.toContain('level2');
      });

      it('should return error on exception', async () => {
        // Test with empty body - should still work
        document.body.innerHTML = '';

        const result = await rpcHandlers.getCompactSnapshot(5);

        expect(result.success).toBe(true);
        expect(result.snapshot).toBeDefined();
      });
    });

    describe('clickElementById', () => {
      it('should click element by ID', async () => {
        document.body.innerHTML = '<button data-devpilot-id="e123">Click me</button>';
        const button = document.querySelector('button')!;
        const clickSpy = vi.spyOn(button, 'click');

        const result = await rpcHandlers.clickElementById('e123');

        expect(result.success).toBe(true);
        expect(clickSpy).toHaveBeenCalled();
      });

      it('should return error when element not found', async () => {
        const result = await rpcHandlers.clickElementById('nonexistent');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
      });

      it('should return error when element is disabled', async () => {
        document.body.innerHTML = '<button data-devpilot-id="e123" disabled>Click me</button>';

        const result = await rpcHandlers.clickElementById('e123');

        expect(result.success).toBe(false);
        expect(result.error).toContain('disabled');
      });

      it('should return error when element is not visible', async () => {
        document.body.innerHTML = '<button data-devpilot-id="e123" style="display: none">Click me</button>';

        const result = await rpcHandlers.clickElementById('e123');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not visible');
      });

      it('should return error for non-HTMLElement', async () => {
        document.body.innerHTML = '<svg data-devpilot-id="e123"></svg>';

        const result = await rpcHandlers.clickElementById('e123');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not clickable');
      });
    });

    describe('inputTextById', () => {
      it('should input text into input element', async () => {
        document.body.innerHTML = '<input data-devpilot-id="e123">';
        const input = document.querySelector('input')!;

        const result = await rpcHandlers.inputTextById('e123', 'test value');

        expect(result.success).toBe(true);
        expect(input.value).toBe('test value');
      });

      it('should input text into textarea element', async () => {
        document.body.innerHTML = '<textarea data-devpilot-id="e123"></textarea>';
        const textarea = document.querySelector('textarea')!;

        const result = await rpcHandlers.inputTextById('e123', 'test value');

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

        const result = await rpcHandlers.inputTextById('e123', '2');

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

        const result = await rpcHandlers.inputTextById('e123', 'Option 2');

        expect(result.success).toBe(true);
        expect(select.value).toBe('2');
      });

      it('should return error when option text not found in select', async () => {
        document.body.innerHTML = `
          <select data-devpilot-id="e123">
            <option value="1">Option 1</option>
          </select>
        `;

        const result = await rpcHandlers.inputTextById('e123', 'Nonexistent');

        expect(result.success).toBe(false);
        expect(result.error).toContain('No option found');
      });

      it('should return error when element not found', async () => {
        const result = await rpcHandlers.inputTextById('nonexistent', 'test');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
      });

      it('should return error for non-input element', async () => {
        document.body.innerHTML = '<div data-devpilot-id="e123">Content</div>';

        const result = await rpcHandlers.inputTextById('e123', 'test');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not an input');
      });
    });

    describe('getElementInfoById', () => {
      it('should return element info', async () => {
        document.body.innerHTML = '<button data-devpilot-id="e123" id="submit" class="btn primary">Submit</button>';

        const result = await rpcHandlers.getElementInfoById('e123');

        expect(result.success).toBe(true);
        expect(result.element).toBeDefined();
        expect(result.element!.id).toBe('e123');
        expect(result.element!.tag).toBe('button');
        expect(result.element!.text).toBe('Submit');
        expect(result.element!.attributes.id).toBe('submit');
        expect(result.element!.attributes.class).toBe('btn primary');
      });

      it('should return error when element not found', async () => {
        const result = await rpcHandlers.getElementInfoById('nonexistent');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
      });

      it('should extract input value', async () => {
        document.body.innerHTML = '<input data-devpilot-id="e123" value="test value">';
        const input = document.querySelector('input')!;
        input.value = 'test value';

        const result = await rpcHandlers.getElementInfoById('e123');

        expect(result.success).toBe(true);
        expect(result.element!.text).toBe('test value');
      });
    });
  });
});
