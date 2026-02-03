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

  describe('getLayout', () => {
    it('should return layout for single visual layer (all covering children)', async () => {
      // Structure: body > e1 > e2 > e3 (all cover parent)
      // This forms ONE visual layer: e1+e2+e3 together
      // Use viewport units to ensure elements cover the body
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">Content</div>
          </div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 5 });

      expect(result.success).toBe(true);
      expect(result.targetId).toBe('body');
      // Only 1 visual layer (e1+e2+e3 form one layer)
      expect(result.depth).toBe(1);
      expect(result.layout).toBeDefined();
      expect(result.layout!.level1).toBeDefined();
      // Should not have level2
      expect(result.layout!.level2).toBeUndefined();
    });

    it('should return layout for multiple visual layers (modal scenario)', async () => {
      // Structure: body > e1 > e2 (covers) + e5 (positioned absolute)
      // e2 > e3 + e4 (together cover e2)
      // This forms TWO visual layers:
      // - level1: e1+e2+e3+e4 (main content, e3 and e4 are boundary elements)
      // - level2: e5 (modal, independent layer)
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 50%;">Content 1</div>
            <div data-devpilot-id="e4" style="width: 100%; height: 50%;">Content 2</div>
          </div>
          <div data-devpilot-id="e5" style="width: 100vw; height: 100vh; position: absolute; top: 0; left: 0;">Modal</div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 5 });

      expect(result.success).toBe(true);
      expect(result.targetId).toBe('body');
      // Two visual layers: main content + modal
      expect(result.depth).toBe(2);
      expect(result.layout).toBeDefined();
      expect(result.layout!.level1).toBeDefined();
      expect(result.layout!.level2).toBeDefined();
      // level1 should contain e3 and e4 (deepest boundary elements of main content)
      expect(result.layout!.level1).toContain('@e3');
      expect(result.layout!.level1).toContain('@e4');
      // level2 should contain e5 (modal)
      expect(result.layout!.level2).toContain('@e5');
    });

    it('should return null layout when body has no covering children', async () => {
      document.body.innerHTML = '<div data-devpilot-id="e1" style="width: 50px; height: 50px;">Small element</div>';

      const result = await rpcHandlers.getLayout({});

      expect(result.success).toBe(true);
      expect(result.layout).toBeNull();
      expect(result.depth).toBe(0);
    });

    it('should use body as default target when no id provided', async () => {
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2">Content</div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 5 });

      expect(result.success).toBe(true);
      expect(result.targetId).toBe('body');
    });

    it('should return error when element not found', async () => {
      const result = await rpcHandlers.getLayout({ id: 'nonexistent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should respect maxDepth limit', async () => {
      // Create structure with multiple visual layers
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100px; height: 100px;">
          <div data-devpilot-id="e2" style="width: 100px; height: 100px; position: absolute;">
            <div data-devpilot-id="e3" style="width: 100px; height: 100px; position: absolute;">
              <div data-devpilot-id="e4" style="width: 100px; height: 100px; position: absolute;">
                <div data-devpilot-id="e5" style="width: 100px; height: 100px; position: absolute;">Deep</div>
              </div>
            </div>
          </div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 3 });

      expect(result.success).toBe(true);
      // Should be limited by maxDepth
      expect(result.depth).toBeLessThanOrEqual(3);
    });

    it('should include targetRect in result', async () => {
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100px; height: 100px;">
          <div data-devpilot-id="e2" style="width: 100px; height: 100px;">Child</div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({});

      expect(result.success).toBe(true);
      expect(result.targetRect).toBeDefined();
      expect(result.targetRect.width).toBeGreaterThan(0);
      expect(result.targetRect.height).toBeGreaterThan(0);
    });

    it('should handle empty body gracefully', async () => {
      document.body.innerHTML = '';

      const result = await rpcHandlers.getLayout({ maxDepth: 5 });

      expect(result.success).toBe(true);
      expect(result.layout).toBeNull();
      expect(result.depth).toBe(0);
    });

    it('should skip script elements', async () => {
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100px; height: 100px;">
          <script>alert('test')</script>
          <div data-devpilot-id="e2" style="width: 100px; height: 100px;">Content</div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 5 });

      expect(result.success).toBe(true);
      expect(result.layout).toBeDefined();
      // Should not include script in the layout
      if (result.layout) {
        const layoutText = Object.values(result.layout).join('\n');
        expect(layoutText).not.toContain('script');
      }
    });

    it('should handle positioned elements as independent layers', async () => {
      // Multiple absolutely positioned elements = multiple visual layers
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100px; height: 100px; position: absolute; top: 0; left: 0;">
          Layer 1
        </div>
        <div data-devpilot-id="e2" style="width: 100px; height: 100px; position: absolute; top: 0; left: 0;">
          Layer 2
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 5 });

      expect(result.success).toBe(true);
      // Two positioned elements = two visual layers
      expect(result.depth).toBe(2);
      expect(result.layout!.level1).toBeDefined();
      expect(result.layout!.level2).toBeDefined();
    });

    it('should find deepest boundary elements for snapshot depth', async () => {
      // Structure: body > e1 > e2 > e3 (all cover)
      // e3 is the deepest boundary element
      // Snapshot should include up to e3's depth
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">Deep Content</div>
          </div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 5 });

      expect(result.success).toBe(true);
      expect(result.depth).toBe(1);
      // level1 should include e3 (deepest boundary)
      expect(result.layout!.level1).toContain('@e3');
    });

    it('should handle deep nesting with positioned element', async () => {
      // Simulate real-world scenario with deep nesting
      // body > app > provider > ant-app > app-content > layout > ... > help-center(fixed)
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">
              <div data-devpilot-id="e4" style="width: 100%; height: 100%;">
                <div data-devpilot-id="e5" style="width: 100%; height: 100%;">
                  <div data-devpilot-id="e6" style="width: 100%; height: 100%;">
                    <div data-devpilot-id="e7" style="width: 100%; height: 100%;">
                      <div data-devpilot-id="e8" style="width: 100%; height: 100%;">Deep Content</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div data-devpilot-id="e9" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;">Help Center</div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 15 });

      expect(result.success).toBe(true);
      // Should have exactly 2 levels: main content + help center
      expect(result.depth).toBe(2);
      expect(result.layout!.level1).toBeDefined();
      expect(result.layout!.level2).toBeDefined();
      // level1 should contain the deepest element e8
      expect(result.layout!.level1).toContain('@e8');
      // level2 should contain help center e9
      expect(result.layout!.level2).toContain('@e9');
      // Should NOT have level3
      expect(result.layout!.level3).toBeUndefined();
    });

    it('should handle sidebar + main content layout (real-world ant-design)', async () => {
      // Simulate ant-design layout: sidebar + main content side by side
      // Both together cover the parent, forming ONE visual layer
      // Plus a positioned help-center as SECOND visual layer
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">
              <div data-devpilot-id="e4" style="width: 100%; height: 100%;">
                <div data-devpilot-id="e5" style="width: 100%; height: 100%;">
                  <div data-devpilot-id="e6" style="width: 100%; height: 100%;">
                    <div data-devpilot-id="e7" style="width: 100%; height: 100%;">
                      <div data-devpilot-id="e8" style="width: 100%; height: 100%;">
                        <div data-devpilot-id="e9" style="width: 100%; height: 100%; display: flex;">
                          <div data-devpilot-id="e10" style="width: 200px; height: 100%;">Sidebar</div>
                          <div data-devpilot-id="e50" style="flex: 1; height: 100%;">Main Content</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div data-devpilot-id="e66" style="position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px;">Help</div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 15 });

      expect(result.success).toBe(true);
      // Should have exactly 2 levels: main content (e10+e50) + help center (e66)
      expect(result.depth).toBe(2);
      expect(result.layout!.level1).toBeDefined();
      expect(result.layout!.level2).toBeDefined();

      // level1 should contain e10 and e50 (boundary elements), but NOT deeper elements
      expect(result.layout!.level1).toContain('@e10');
      expect(result.layout!.level1).toContain('@e50');

      // level2 should contain help center e66
      expect(result.layout!.level2).toContain('@e66');

      // Should NOT have level3
      expect(result.layout!.level3).toBeUndefined();

      // level1 and level2 should have different content (not duplicates)
      // level1 should have deep content (e10, e50 and their children)
      expect(result.layout!.level1).toContain('Sidebar');
      expect(result.layout!.level1).toContain('Main Content');

      // level2 should only have help center, not the full tree again
      expect(result.layout!.level2).toContain('@e66');
      expect(result.layout!.level2).toContain('Help');

      // Verify no duplicate levels are created
      const levelKeys = Object.keys(result.layout!).filter(k => k.startsWith('level'));
      expect(levelKeys).toHaveLength(2);
      expect(levelKeys).toEqual(['level1', 'level2']);
    });

    it('should NOT create duplicate levels for same positioned element', async () => {
      // This test ensures buildLayoutTree is not called recursively creating duplicate levels
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3">Content</div>
          </div>
          <div data-devpilot-id="e4" style="position: fixed; top: 0; left: 0; width: 100px; height: 100px;">Fixed</div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 10 });

      expect(result.success).toBe(true);
      // Should have exactly 2 levels, not more
      expect(result.depth).toBe(2);

      // Verify no level3-level10 are created
      for (let i = 3; i <= 10; i++) {
        expect(result.layout![`level${i}` as keyof typeof result.layout]).toBeUndefined();
      }
    });

    it('should NOT create multiple levels for nested positioned elements', async () => {
      // Nested positioned elements should only create ONE level for the outermost one
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3">Content</div>
          </div>
          <div data-devpilot-id="e4" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;">
            Outer Modal
            <div data-devpilot-id="e5" style="position: absolute; top: 10px; left: 10px; width: 50px; height: 50px;">
              Inner Button
            </div>
          </div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 10 });

      expect(result.success).toBe(true);
      // Should have exactly 2 levels: main content + outer modal (not 3 levels)
      expect(result.depth).toBe(2);
      expect(result.layout!.level1).toBeDefined();
      expect(result.layout!.level2).toBeDefined();
      expect(result.layout!.level3).toBeUndefined();

      // level2 should contain e4 (outer modal) but NOT e5 (inner button)
      expect(result.layout!.level2).toContain('@e4');
      expect(result.layout!.level2).toContain('Outer Modal');
      // e5 is inside e4, so it should not create its own level
      expect(result.layout!.level2).not.toContain('@e5');
    });

    it('should handle multiple sibling positioned elements', async () => {
      // Multiple sibling positioned elements should each create their own level
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3">Content</div>
          </div>
          <div data-devpilot-id="e4" style="position: fixed; top: 0; left: 0; width: 100px; height: 100px;">Modal 1</div>
          <div data-devpilot-id="e5" style="position: fixed; top: 0; left: 0; width: 100px; height: 100px;">Modal 2</div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 10 });

      expect(result.success).toBe(true);
      // Should have 3 levels: main content + 2 modals
      expect(result.depth).toBe(3);
      expect(result.layout!.level1).toBeDefined();
      expect(result.layout!.level2).toBeDefined();
      expect(result.layout!.level3).toBeDefined();
      expect(result.layout!.level4).toBeUndefined();

      // level2 and level3 should contain the modals
      expect(result.layout!.level2).toContain('@e4');
      expect(result.layout!.level3).toContain('@e5');
    });

    it('should create exactly 2 levels when only one positioned element exists', async () => {
      // Only one positioned element should create exactly 2 levels
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3">Content</div>
          </div>
          <div data-devpilot-id="e4" style="position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px;">Help</div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 10 });

      expect(result.success).toBe(true);
      // Should have exactly 2 levels: main content + help button
      expect(result.depth).toBe(2);
      expect(result.layout!.level1).toBeDefined();
      expect(result.layout!.level2).toBeDefined();
      expect(result.layout!.level3).toBeUndefined();

      // level2 should contain the positioned element
      expect(result.layout!.level2).toContain('@e4');
      expect(result.layout!.level2).toContain('Help');
    });

    it('should prune snapshot to only include elements on path to target (sibling branches should be excluded)', async () => {
      // Structure: body > e1 > e2 > e3 > (e4 + e5 together cover) + e6 (sibling branch)
      // level1 should only include e1, e2, e3, e4, e5 (path to covering elements)
      // e6 should be pruned because it's not on the path to e4+e5
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">
              <div data-devpilot-id="e4" style="width: 100%; height: 50%;">Top Content</div>
              <div data-devpilot-id="e5" style="width: 100%; height: 50%;">Bottom Content</div>
            </div>
            <div data-devpilot-id="e6" style="width: 100%; height: 100%;">Sibling Branch</div>
          </div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 10 });

      expect(result.success).toBe(true);
      expect(result.depth).toBe(1);
      expect(result.layout!.level1).toBeDefined();

      // level1 should contain e4 and e5 (boundary elements)
      expect(result.layout!.level1).toContain('@e4');
      expect(result.layout!.level1).toContain('@e5');
      expect(result.layout!.level1).toContain('Top Content');
      expect(result.layout!.level1).toContain('Bottom Content');

      // e6 should be pruned - it's not on the path to e4+e5
      expect(result.layout!.level1).not.toContain('@e6');
      expect(result.layout!.level1).not.toContain('Sibling Branch');
    });

    it('should prune positioned element snapshot to only include path from body to target', async () => {
      // Structure: body > e1 > e2 > e3 + e6(fixed)
      // level1: path to e3 (main content)
      // level2: path to e6 (fixed element), should NOT include e3
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">Main Content</div>
          </div>
          <div data-devpilot-id="e6" style="position: fixed; top: 0; left: 0; width: 100px; height: 100px;">Fixed</div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 10 });

      expect(result.success).toBe(true);
      expect(result.depth).toBe(2);
      expect(result.layout!.level1).toBeDefined();
      expect(result.layout!.level2).toBeDefined();

      // level1 should contain e3
      expect(result.layout!.level1).toContain('@e3');
      expect(result.layout!.level1).toContain('Main Content');

      // level2 should contain e6 (fixed element)
      expect(result.layout!.level2).toContain('@e6');
      expect(result.layout!.level2).toContain('Fixed');

      // level2 should NOT contain e3 (not on path to e6)
      expect(result.layout!.level2).not.toContain('@e3');
      expect(result.layout!.level2).not.toContain('Main Content');
    });

    it('should respect id parameter and analyze sub-tree layout', async () => {
      // Structure: body > container > (e1 + e2)
      // When calling getLayout({id: 'container'}), should analyze container's children
      // Use flex layout to ensure e1 and e2 together cover the container
      document.body.innerHTML = `
        <div data-devpilot-id="container" style="width: 100vw; height: 100vh; display: flex;">
          <div data-devpilot-id="e1" style="width: 50%; height: 100%;">Left</div>
          <div data-devpilot-id="e2" style="width: 50%; height: 100%;">Right</div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ id: 'container', maxDepth: 10 });

      expect(result.success).toBe(true);
      expect(result.targetId).toBe('container');
      // Should analyze from container, finding e1 and e2 as covering children
      expect(result.depth).toBe(1);
      expect(result.layout!.level1).toBeDefined();

      // Should contain e1 and e2
      expect(result.layout!.level1).toContain('@e1');
      expect(result.layout!.level1).toContain('@e2');
      expect(result.layout!.level1).toContain('Left');
      expect(result.layout!.level1).toContain('Right');
    });

    it('should stop expanding at boundary elements (no deep subtree)', async () => {
      // Structure: body > e1 > e2 > (e3 with deep subtree)
      // e3 is the boundary element, its children should NOT be expanded
      document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">
              <div data-devpilot-id="e4">
                <div data-devpilot-id="e5">Deep Content</div>
              </div>
            </div>
          </div>
        </div>
      `;

      const result = await rpcHandlers.getLayout({ maxDepth: 10 });

      expect(result.success).toBe(true);
      expect(result.depth).toBe(1);
      expect(result.layout!.level1).toBeDefined();

      // Should contain e3 (boundary element)
      expect(result.layout!.level1).toContain('@e3');

      // Should NOT contain e4 and e5 (children of boundary element)
      expect(result.layout!.level1).not.toContain('@e4');
      expect(result.layout!.level1).not.toContain('@e5');
      expect(result.layout!.level1).not.toContain('Deep Content');
    });
  });
});
