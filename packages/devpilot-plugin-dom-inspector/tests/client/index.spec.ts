import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAccessibilityTree, getAccessibilityInfo, getAccessibleName, getElementOwnText, getInteractiveState, getVisualState, isImportantElement, rpcHandlers } from '../../src/client/index';

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

  describe('getAccessibleName', () => {
    it('should extract name from aria-label', () => {
      document.body.innerHTML = '<button aria-label="Close">X</button>';
      const button = document.querySelector('button')!;

      expect(getAccessibleName(button)).toBe('Close');
    });

    it('should extract name from single aria-labelledby', () => {
      document.body.innerHTML = `
        <span id="label-id">Label Text</span>
        <div aria-labelledby="label-id">Content</div>
      `;
      const div = document.querySelector('div')!;

      expect(getAccessibleName(div)).toBe('Label Text');
    });

    it('should extract name from multiple aria-labelledby IDs', () => {
      document.body.innerHTML = `
        <span id="label1">First</span>
        <span id="label2">Second</span>
        <span id="label3">Third</span>
        <div aria-labelledby="label1 label2 label3">Content</div>
      `;
      const div = document.querySelector('div')!;

      expect(getAccessibleName(div)).toBe('First Second Third');
    });

    it('should handle aria-labelledby with extra whitespace', () => {
      document.body.innerHTML = `
        <span id="label1">First</span>
        <span id="label2">Second</span>
        <div aria-labelledby="  label1   label2  ">Content</div>
      `;
      const div = document.querySelector('div')!;

      expect(getAccessibleName(div)).toBe('First Second');
    });

    it('should prioritize aria-label over aria-labelledby', () => {
      document.body.innerHTML = `
        <span id="label-id">Label Text</span>
        <button aria-label="Preferred Label" aria-labelledby="label-id">X</button>
      `;
      const button = document.querySelector('button')!;

      expect(getAccessibleName(button)).toBe('Preferred Label');
    });

    it('should return empty string when no aria attributes', () => {
      document.body.innerHTML = '<button>Submit</button>';
      const button = document.querySelector('button')!;

      expect(getAccessibleName(button)).toBe('');
    });

    it('should handle non-existent aria-labelledby IDs', () => {
      document.body.innerHTML = '<div aria-labelledby="nonexistent">Content</div>';
      const div = document.querySelector('div')!;

      expect(getAccessibleName(div)).toBe('');
    });

    it('should handle mixed existing and non-existing aria-labelledby IDs', () => {
      document.body.innerHTML = `
        <span id="label1">First</span>
        <div aria-labelledby="label1 nonexistent label2">Content</div>
      `;
      const div = document.querySelector('div')!;

      expect(getAccessibleName(div)).toBe('First');
    });
  });

  describe('getElementOwnText', () => {
    it('should return text content for element without children', () => {
      document.body.innerHTML = '<button>Submit</button>';
      const button = document.querySelector('button')!;

      expect(getElementOwnText(button)).toBe('Submit');
    });

    it('should return empty string for element with only child elements', () => {
      document.body.innerHTML = '<div><span>Child text</span></div>';
      const div = document.querySelector('div')!;

      expect(getElementOwnText(div)).toBe('');
    });

    it('should extract own text nodes between child elements', () => {
      document.body.innerHTML = '<div>Prefix <span>Child</span> Suffix</div>';
      const div = document.querySelector('div')!;

      expect(getElementOwnText(div)).toBe('Prefix  Suffix');
    });

    it('should preserve internal whitespace in text nodes', () => {
      document.body.innerHTML = '<div>a   b</div>';
      const div = document.querySelector('div')!;

      expect(getElementOwnText(div)).toBe('a   b');
    });

    it('should trim leading and trailing whitespace', () => {
      document.body.innerHTML = '<div>  Text  </div>';
      const div = document.querySelector('div')!;

      expect(getElementOwnText(div)).toBe('Text');
    });

    it('should handle empty element', () => {
      document.body.innerHTML = '<div></div>';
      const div = document.querySelector('div')!;

      expect(getElementOwnText(div)).toBe('');
    });

    it('should handle element with only whitespace text nodes', () => {
      document.body.innerHTML = '<div>   </div>';
      const div = document.querySelector('div')!;

      expect(getElementOwnText(div)).toBe('');
    });
  });

  describe('getInteractiveState', () => {
    it('should return disabled for disabled button', () => {
      document.body.innerHTML = '<button disabled>Submit</button>';
      const button = document.querySelector('button')!;

      expect(getInteractiveState(button)).toEqual(['disabled']);
    });

    it('should return empty array for enabled button', () => {
      document.body.innerHTML = '<button>Submit</button>';
      const button = document.querySelector('button')!;

      expect(getInteractiveState(button)).toEqual([]);
    });

    it('should return readonly for readonly input', () => {
      document.body.innerHTML = '<input type="text" readonly>';
      const input = document.querySelector('input')!;

      expect(getInteractiveState(input)).toEqual(['readonly']);
    });

    it('should return checked for checked checkbox', () => {
      document.body.innerHTML = '<input type="checkbox" checked>';
      const checkbox = document.querySelector('input')!;

      expect(getInteractiveState(checkbox)).toEqual(['checked']);
    });

    it('should return empty array for unchecked checkbox', () => {
      document.body.innerHTML = '<input type="checkbox">';
      const checkbox = document.querySelector('input')!;

      expect(getInteractiveState(checkbox)).toEqual([]);
    });

    it('should return checked for checked radio', () => {
      document.body.innerHTML = '<input type="radio" checked>';
      const radio = document.querySelector('input')!;

      expect(getInteractiveState(radio)).toEqual(['checked']);
    });

    it('should return selected for selected option', () => {
      document.body.innerHTML = '<select><option>One</option><option selected>Two</option></select>';
      const select = document.querySelector('select')!;
      const option = select.options[1];

      expect(getInteractiveState(option)).toEqual(['selected']);
    });

    it('should return multiple states for element with multiple states', () => {
      document.body.innerHTML = '<input type="text" disabled readonly>';
      const input = document.querySelector('input')!;

      expect(getInteractiveState(input)).toEqual(['disabled', 'readonly']);
    });

    it('should return empty array for non-interactive element', () => {
      document.body.innerHTML = '<div>Content</div>';
      const div = document.querySelector('div')!;

      expect(getInteractiveState(div)).toEqual([]);
    });
  });

  describe('getVisualState', () => {
    it('should return hidden for display:none element', () => {
      document.body.innerHTML = '<div style="display: none;">Hidden</div>';
      const div = document.querySelector('div')!;

      const states = getVisualState(div);
      expect(states).toContain('hidden');
    });

    it('should return hidden for visibility:hidden element', () => {
      document.body.innerHTML = '<div style="visibility: hidden;">Hidden</div>';
      const div = document.querySelector('div')!;

      const states = getVisualState(div);
      expect(states).toContain('hidden');
    });

    it('should return hidden for opacity:0 element', () => {
      document.body.innerHTML = '<div style="opacity: 0;">Hidden</div>';
      const div = document.querySelector('div')!;

      const states = getVisualState(div);
      expect(states).toContain('hidden');
    });

    it('should return empty array for visible element', () => {
      document.body.innerHTML = '<div>Visible</div>';
      const div = document.querySelector('div')!;

      expect(getVisualState(div)).toEqual([]);
    });

    it('should return zero-size for element with zero width', () => {
      document.body.innerHTML = '<div style="width: 0; height: 10px;">Zero</div>';
      const div = document.querySelector('div')!;

      expect(getVisualState(div)).toContain('zero-size');
    });

    it('should return zero-size for element with zero height', () => {
      document.body.innerHTML = '<div style="width: 10px; height: 0;">Zero</div>';
      const div = document.querySelector('div')!;

      expect(getVisualState(div)).toContain('zero-size');
    });

    it('should return empty array for element with positive dimensions', () => {
      document.body.innerHTML = '<div style="width: 10px; height: 10px;">Sized</div>';
      const div = document.querySelector('div')!;

      expect(getVisualState(div)).toEqual([]);
    });

    it('should return both hidden and zero-size when applicable', () => {
      document.body.innerHTML = '<div style="display: none; width: 0;">Hidden and Zero</div>';
      const div = document.querySelector('div')!;

      const states = getVisualState(div);
      expect(states).toContain('hidden');
      expect(states).toContain('zero-size');
    });
  });

  describe('isImportantElement', () => {
    it('should always include body element', () => {
      document.body.innerHTML = '<div>Content</div>';
      const body = document.body;

      expect(isImportantElement(body)).toBe(true);
    });

    it('should include interactive elements (button)', () => {
      document.body.innerHTML = '<button>Submit</button>';
      const button = document.querySelector('button')!;

      expect(isImportantElement(button)).toBe(true);
    });

    it('should include interactive elements (input)', () => {
      document.body.innerHTML = '<input type="text">';
      const input = document.querySelector('input')!;

      expect(isImportantElement(input)).toBe(true);
    });

    it('should include elements with visible text', () => {
      document.body.innerHTML = '<div>Text content</div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(true);
    });

    it('should include elements with id', () => {
      document.body.innerHTML = '<div id="my-id"></div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(true);
    });

    it('should include elements with interactive role', () => {
      document.body.innerHTML = '<div role="button">Click</div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(true);
    });

    it('should include elements with content role and text', () => {
      document.body.innerHTML = '<div role="alert">Alert message</div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(true);
    });

    it('should include elements with data-devpilot-id', () => {
      document.body.innerHTML = '<div data-devpilot-id="e123">Content</div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(true);
    });

    it('should include elements that have important child elements', () => {
      document.body.innerHTML = '<div><button>Click</button></div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(true);
    });

    it('should include semantic elements with class', () => {
      document.body.innerHTML = '<section class="container">Content</section>';
      const section = document.querySelector('section')!;

      expect(isImportantElement(section)).toBe(true);
    });

    it('should include container elements with class and children', () => {
      document.body.innerHTML = '<div class="container"><button>Child</button></div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(true);
    });

    it('should include elements with semantic class patterns (menu, item, card, etc.)', () => {
      document.body.innerHTML = '<div class="menu-item">Menu</div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(true);
    });

    it('should include elements with class containing "btn" or "button"', () => {
      document.body.innerHTML = '<div class="btn-primary">Click</div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(true);
    });

    it('should include elements with class containing "title" or "label"', () => {
      document.body.innerHTML = '<div class="title-text">Title</div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(true);
    });

    it('should include elements with class containing "container" or "wrapper"', () => {
      document.body.innerHTML = '<div class="container"></div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(true);
    });

    it('should include elements that have children (potential containers)', () => {
      document.body.innerHTML = '<div><span></span></div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(true);
    });

    it('should include elements with any class (fallback for Vue components)', () => {
      document.body.innerHTML = '<div class="some-vue-component"></div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(true);
    });

    it('should NOT include element without important characteristics', () => {
      document.body.innerHTML = '<span></span>';
      const span = document.querySelector('span')!;

      expect(isImportantElement(span)).toBe(false);
    });

    it('should NOT include hidden elements using HTML5 hidden attribute', () => {
      document.body.innerHTML = '<div hidden>Hidden</div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(false);
    });

    it('should NOT include hidden elements using style.display=none', () => {
      document.body.innerHTML = '<div style="display: none;">Hidden</div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(false);
    });

    it('should NOT include hidden elements using style.visibility=hidden', () => {
      document.body.innerHTML = '<div style="visibility: hidden;">Hidden</div>';
      const div = document.querySelector('div')!;

      expect(isImportantElement(div)).toBe(false);
    });

    it('should include interactive elements even if they have display:none parent', () => {
      document.body.innerHTML = '<div style="display: none;"><button>Click</button></div>';
      const button = document.querySelector('button')!;

      // The button itself is not hidden, only its parent is
      expect(isImportantElement(button)).toBe(true);
    });
  });
});
