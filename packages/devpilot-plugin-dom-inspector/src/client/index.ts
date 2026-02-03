import type { RpcHandlers } from 'unplugin-devpilot/client';
import type {
  AccessibilityNode,
  CompactSnapshotResult,
  ConsoleLogEntry,
  DomInspectorRpc,
  ElementInfo,
} from '../shared-types';
import { uniqueId } from 'es-toolkit/compat';
import { defineRpcHandlers, getDevpilotClient } from 'unplugin-devpilot/client';

// Store captured logs
const capturedLogs: ConsoleLogEntry[] = [];
const maxLogBufferSize = 1000;

// Helper function to generate stable UIDs using es-toolkit
function generateUid(): string {
  return `node_${uniqueId()}`;
}

// Helper function to get current client ID from the devpilot client
function getClientId(): string {
  const client = getDevpilotClient();
  const clientId = client?.getClientId();
  return clientId || 'unknown';
}

// Helper function to bind unique ID to DOM element
function bindElementId(element: Element): string {
  // Check if element already has a devpilot ID
  let id = element.getAttribute('data-devpilot-id');
  if (id) {
    return id;
  }

  // Generate new unique ID using es-toolkit uniqueId
  id = `e${uniqueId()}`;
  element.setAttribute('data-devpilot-id', id);

  return id;
}

// Helper function to get accessible name from aria attributes
function getAccessibleName(element: Element): string {
  // Try aria-label first
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel.trim();
  }

  // Try aria-labelledby (can contain multiple IDs separated by whitespace)
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/).filter(Boolean);
    const labels: string[] = [];

    for (const id of ids) {
      const labelElement = document.getElementById(id);
      if (labelElement) {
        const label = labelElement.textContent?.trim();
        if (label) {
          labels.push(label);
        }
      }
    }

    if (labels.length > 0) {
      return labels.join(' ');
    }
  }

  return '';
}

// Helper function to get element's own text (excluding children's text)
function getElementOwnText(element: Element): string {
  // For elements with child elements, we need to extract only the text nodes
  // that belong to this element (not to children)
  const textNodes: string[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent;
      if (text) {
        textNodes.push(text);
      }
    }
  }

  // Join all text nodes and trim the final result to preserve original spacing
  // while removing leading/trailing whitespace
  return textNodes.join('').trim();
}

// Helper function to get visible text from element
function getVisibleText(element: Element): string {
  // First try accessible name from aria attributes
  const accessibleName = getAccessibleName(element);
  if (accessibleName) {
    return accessibleName;
  }

  // For form elements, also consider placeholder and value
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.value) {
      return element.value;
    }
    if (element.placeholder) {
      return element.placeholder;
    }
  }
  else if (element instanceof HTMLSelectElement) {
    if (element.value) {
      return element.value;
    }
  }
  else if (element instanceof HTMLOptionElement) {
    // For option elements, use text content
    const text = element.textContent?.trim();
    if (text) {
      return text;
    }
  }

  // For other elements, get only the element's own text (not children's text)
  return getElementOwnText(element);
}

// Important attributes for interaction (shared across functions)
const IMPORTANT_ATTRS = ['id', 'type', 'href', 'placeholder', 'role', 'name', 'value', 'for'];

// Interactive roles - elements that users can directly interact with
// Based on agent-browser's INTERACTIVE_ROLES
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem',
  'menu',
]);

// Structural roles - elements that are purely for organizing content
// Based on agent-browser's STRUCTURAL_ROLES
const STRUCTURAL_ROLES = new Set([
  'generic',
  'group',
  'list',
  'table',
  'row',
  'rowgroup',
  'grid',
  'treegrid',
  'menubar',
  'toolbar',
  'tablist',
  'tree',
  'directory',
  'document',
  'application',
  'presentation',
  'none',
]);

// Content roles - elements that provide content/structure with names
const CONTENT_ROLES = new Set([
  'heading',
  'paragraph',
  'article',
  'section',
  'note',
  'status',
  'alert',
  'log',
  'marquee',
]);

// Helper function to get interactive state (disabled, readonly, checked, selected)
function getInteractiveState(element: Element): string[] {
  const states: string[] = [];

  if (element instanceof HTMLElement) {
    // Check disabled state
    if (element.disabled) {
      states.push('disabled');
    }

    // Check readonly state
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.readOnly) {
        states.push('readonly');
      }

      // Check checked state for checkbox/radio
      if (element.type === 'checkbox' || element.type === 'radio') {
        if (element.checked) {
          states.push('checked');
        }
      }
    }

    // Check selected state for option
    if (element instanceof HTMLOptionElement) {
      if (element.selected) {
        states.push('selected');
      }
    }
  }

  return states;
}

// Helper function to get visual state (hidden, zero-size)
function getVisualState(element: Element): string[] {
  const states: string[] = [];

  if (element instanceof HTMLElement) {
    // Check if element is hidden via CSS
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      states.push('hidden');
    }

    // Check if element has zero size
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      states.push('zero-size');
    }
  }

  return states;
}

// Helper function to get compact attributes
function getCompactAttributes(element: Element): string[] {
  const attrs: string[] = [];

  for (const key of IMPORTANT_ATTRS) {
    const value = element.getAttribute(key);
    if (value) {
      attrs.push(`${key}=${value}`);
    }
  }

  // Class - only first 2 classes
  const className = element.getAttribute('class');
  if (className) {
    const classes = className.split(/\s+/).filter(Boolean).slice(0, 2);
    if (classes.length > 0) {
      attrs.push(`class=${classes.join('.')}`);
    }
  }

  // Add interactive state
  const interactiveStates = getInteractiveState(element);
  if (interactiveStates.length > 0) {
    attrs.push(...interactiveStates);
  }

  // Add visual state
  const visualStates = getVisualState(element);
  if (visualStates.length > 0) {
    attrs.push(...visualStates);
  }

  return attrs;
}

// Check if element is important (should be included in snapshot)
function isImportantElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase();

  // Always include body element
  if (tag === 'body') {
    return true;
  }

  // Get the element's ARIA role (or infer from tag)
  const role = element.getAttribute('role') || inferRoleFromTag(tag);

  // Always include interactive elements (even if hidden, they might become visible)
  if (INTERACTIVE_ROLES.has(role)) {
    return true;
  }

  // Fast path: Skip hidden elements using lightweight checks
  // Note: We avoid getComputedStyle() for performance reasons
  if (element instanceof HTMLElement) {
    // Check HTML5 hidden attribute (fastest)
    if (element.hidden) {
      return false;
    }

    // Check inline styles (fast)
    const style = element.style;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    // Note: We intentionally DO NOT check offsetParent here because:
    // 1. It can be null for many valid cases (position:fixed, detached elements, etc.)
    // 2. It causes false positives where visible elements are filtered out
    // 3. The inline style checks above are sufficient for most cases
  }

  // Include elements with visible text and content roles
  const text = getVisibleText(element);
  if (text && CONTENT_ROLES.has(role)) {
    return true;
  }

  // Include elements with important attributes
  if (element.id || element.getAttribute('data-devpilot-id')) {
    return true;
  }

  // Include elements with visible text (for elements without explicit role)
  if (text) {
    return true;
  }

  // Include elements that have important child elements
  // This ensures we don't skip container elements that wrap important content
  for (const child of Array.from(element.children)) {
    const childRole = child.getAttribute('role') || inferRoleFromTag(child.tagName.toLowerCase());
    if (INTERACTIVE_ROLES.has(childRole)) {
      return true;
    }
  }

  // Include semantic HTML elements (they often have implicit ARIA roles)
  const semanticTags = ['section', 'header', 'footer', 'nav', 'main', 'aside', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  if (semanticTags.includes(tag)) {
    return true;
  }

  // Include elements with class that suggest interactive/semantic importance
  const className = element.getAttribute('class');
  if (className) {
    // Check for common UI patterns
    const uiPatterns = [
      /btn/,
      /button/,
      /link/,
      /menu/,
      /item/,
      /card/,
      /input/,
      /select/,
      /checkbox/,
      /radio/,
      /header/,
      /footer/,
      /nav/,
      /sidebar/,
      /content/,
      /main/,
      /title/,
      /label/,
      /text/,
      /config/,
      /provider/,
      /app/,
      /container/,
      /wrapper/,
      /box/,
      /panel/,
      /section/,
    ];

    if (uiPatterns.some(pattern => pattern.test(className))) {
      return true;
    }
  }

  // Include elements that have children (potential containers)
  // This ensures we don't skip wrapper elements
  if (element.children.length > 0) {
    return true;
  }

  // Include elements with any class (as a fallback to not miss important elements)
  // This is more permissive but ensures we don't miss Vue-generated components
  if (className) {
    return true;
  }

  return false;
}

// Infer ARIA role from HTML tag
function inferRoleFromTag(tag: string): string {
  const roleMap: Record<string, string> = {
    a: 'link',
    button: 'button',
    input: 'textbox',
    select: 'combobox',
    textarea: 'textbox',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    footer: 'contentinfo',
    section: 'region',
    article: 'article',
    aside: 'complementary',
    p: 'paragraph',
    table: 'table',
    tr: 'row',
    td: 'cell',
  };

  return roleMap[tag] || 'generic';
}

// Build compact snapshot in agent-browser style
function buildCompactSnapshot(element: Element, depth: number, maxDepth: number): string {
  // Depth limit check - prevent infinite recursion
  if (depth > maxDepth) {
    return '';
  }

  const lines: string[] = [];
  const indent = ' '.repeat(depth * 2);

  if (!isImportantElement(element)) {
    return '';
  }

  const id = bindElementId(element);
  const tag = element.tagName.toLowerCase();
  const text = getVisibleText(element);
  const attrs = getCompactAttributes(element);

  let line = `${indent}@${id} [${tag}]`;
  if (text) {
    // Escape double quotes in text to preserve snapshot format
    const escapedText = text.replace(/"/g, '\\"');
    line += ` "${escapedText}"`;
  }
  if (attrs.length > 0) {
    line += ` [${attrs.join(' ')}]`;
  }

  lines.push(line);

  // Recursively process children (limit depth and count)
  const children = Array.from(element.children)
    .filter(isImportantElement)
    .slice(0, 20); // Limit children per node

  for (const child of children) {
    const childSnapshot = buildCompactSnapshot(child, depth + 1, maxDepth);
    if (childSnapshot) {
      lines.push(childSnapshot);
    }
  }

  return lines.join('\n');
}

// Get element info by ID
function getElementInfoById(id: string): ElementInfo {
  const element = document.querySelector(`[data-devpilot-id="${id}"]`);

  if (!element) {
    return {
      success: false,
      error: `Element with ID ${id} not found`,
    };
  }

  const tag = element.tagName.toLowerCase();
  const text = getVisibleText(element);
  const attributes: Record<string, string> = {};

  // Collect relevant attributes (using shared IMPORTANT_ATTRS + class)
  for (const attr of IMPORTANT_ATTRS) {
    const value = element.getAttribute(attr);
    if (value) {
      attributes[attr] = value;
    }
  }

  // Also include class
  const classValue = element.getAttribute('class');
  if (classValue) {
    attributes.class = classValue;
  }

  return {
    success: true,
    element: {
      id,
      tag,
      text,
      attributes,
    },
  };
}

// Helper function to get accessibility information from an element
function getAccessibilityInfo(element: Element): Omit<AccessibilityNode, 'uid' | 'children'> {
  // Get role
  let role = 'unknown';
  if (element instanceof HTMLElement) {
    role = element.getAttribute('role') || element.tagName.toLowerCase();
  }
  else {
    role = element.tagName.toLowerCase();
  }

  // Get accessible name
  let name: string | null = null;

  // Try aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelElement = document.getElementById(labelledBy);
    if (labelElement) {
      name = labelElement.textContent?.trim() || null;
    }
  }

  // Try aria-label
  if (!name) {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      name = ariaLabel.trim();
    }
  }

  // Try specific attributes for form elements
  if (!name && element instanceof HTMLElement) {
    if (
      element instanceof HTMLInputElement
      || element instanceof HTMLTextAreaElement
      || element instanceof HTMLSelectElement
    ) {
      // Try associated label
      if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) {
          name = label.textContent?.trim() || null;
        }
      }

      // Try placeholder
      if (!name && 'placeholder' in element && (element as any).placeholder) {
        name = (element as any).placeholder;
      }

      // Try title
      if (!name && element.title) {
        name = element.title;
      }

      // Try value for buttons
      if (
        !name
        && element instanceof HTMLInputElement
        && (element.type === 'button' || element.type === 'submit')
      ) {
        name = element.value;
      }
    }
    else if (element instanceof HTMLButtonElement) {
      name = element.textContent?.trim() || element.value || null;
    }
    else {
      // For other elements, use text content as name
      name = element.textContent?.trim() || null;
    }
  }

  // Get value if applicable
  let value: string | undefined;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    value = element.value;
  }
  else if (element instanceof HTMLSelectElement) {
    value = element.value;
  }

  // Get description
  const description = element.getAttribute('aria-description') || undefined;

  // Collect relevant attributes
  const attributes: Record<string, any> = {};
  const importantAttrs = ['id', 'class', 'type', 'href', 'src', 'alt', 'title', 'disabled', 'checked'];
  for (const attr of importantAttrs) {
    const value = element.getAttribute(attr);
    if (value !== null) {
      attributes[attr] = value;
    }
  }

  return {
    role,
    name: name && name.length > 0
      ? name
      : null,
    ...(value !== undefined && { value }),
    ...(description && { description }),
    attributes,
  };
}

// Build accessibility tree recursively
function buildAccessibilityTree(element: Element, depth: number, maxDepth: number): AccessibilityNode | null {
  if (depth > maxDepth) {
    return null;
  }

  // Skip non-accessible elements
  const tagName = element.tagName.toLowerCase();
  const hidden = element instanceof HTMLElement && (element.hidden || element.style.display === 'none' || element.style.visibility === 'hidden');

  if (hidden || ['script', 'style', 'link', 'meta'].includes(tagName)) {
    return null;
  }

  const node: AccessibilityNode = {
    uid: generateUid(),
    ...getAccessibilityInfo(element),
  };

  // Process children if not a leaf element
  const isLeafElement = ['input', 'textarea', 'select', 'button', 'img'].includes(tagName);
  if (!isLeafElement && element.children.length > 0) {
    const children: AccessibilityNode[] = [];
    for (let i = 0; i < element.children.length; i++) {
      const childNode = buildAccessibilityTree(element.children[i], depth + 1, maxDepth);
      if (childNode) {
        children.push(childNode);
      }
    }
    if (children.length > 0) {
      node.children = children;
    }
  }

  return node;
}

// Capture console logs
function captureConsoleLogs() {
  const levels: Array<'error' | 'warn' | 'info' | 'debug'> = ['error', 'warn', 'info', 'debug'];

  levels.forEach((level) => {
    const originalMethod = console[level];

    console[level] = function (...args: any[]) {
      // Call original method
      originalMethod.apply(console, args);

      // Capture the log
      const timestamp = Date.now();
      let message = '';

      try {
        message = args.map((arg) => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg);
            }
            catch {
              return String(arg);
            }
          }
          return String(arg);
        }).join(' ');
      }
      catch {
        message = 'Unable to serialize log message';
      }

      const logEntry: ConsoleLogEntry = {
        level,
        message,
        timestamp,
        args: level === 'error'
          ? args
          : undefined,
      };

      // Capture stack trace for errors
      if (level === 'error' && args[0] instanceof Error) {
        logEntry.stack = args[0].stack;
      }

      capturedLogs.push(logEntry);

      // Keep buffer size manageable
      if (capturedLogs.length > maxLogBufferSize) {
        capturedLogs.shift();
      }
    };
  });

  // Capture window errors
  window.addEventListener('error', (event: ErrorEvent) => {
    const logEntry: ConsoleLogEntry = {
      level: 'error',
      message: `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
      timestamp: Date.now(),
      stack: event.error?.stack,
    };

    capturedLogs.push(logEntry);

    if (capturedLogs.length > maxLogBufferSize) {
      capturedLogs.shift();
    }
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const logEntry: ConsoleLogEntry = {
      level: 'error',
      message: `Unhandled Promise Rejection: ${String(event.reason)}`,
      timestamp: Date.now(),
      stack: event.reason instanceof Error
        ? event.reason.stack
        : undefined,
    };

    capturedLogs.push(logEntry);

    if (capturedLogs.length > maxLogBufferSize) {
      capturedLogs.shift();
    }
  });
}

// Create extended RPC handlers for the DOM inspector - Note: captureConsoleLogs() will be called when this module is imported
captureConsoleLogs();

export const rpcHandlers: DomInspectorRpc = defineRpcHandlers<DomInspectorRpc>({
  // Compact snapshot - agent-browser style format
  getCompactSnapshot: async (maxDepth = 5) => {
    try {
      console.log('[devpilot-dom-inspector] getCompactSnapshot called');

      const snapshot = buildCompactSnapshot(document.body, 0, maxDepth);

      const result: CompactSnapshotResult = {
        success: true,
        clientId: getClientId(),
        timestamp: Date.now(),
        url: location.href,
        title: document.title || '',
        snapshot,
      };

      console.log('[devpilot-dom-inspector] getCompactSnapshot returning snapshot with length:', snapshot.length);
      return result;
    }
    catch (error) {
      console.error('[devpilot-dom-inspector] getCompactSnapshot error:', error);
      return {
        success: false,
        clientId: getClientId(),
        timestamp: Date.now(),
        url: location.href,
        title: document.title || '',
        snapshot: '',
        error: error instanceof Error
          ? error.message
          : String(error),
      };
    }
  },

  // Click element by ID
  clickElementById: async (id: string) => {
    try {
      console.log('[devpilot-dom-inspector] clickElementById called with id:', id);

      const element = document.querySelector(`[data-devpilot-id="${id}"]`);
      if (!element) {
        return {
          success: false,
          error: `Element with ID ${id} not found`,
        };
      }

      if (element instanceof HTMLElement) {
        // Check if element is disabled
        if (element.disabled) {
          return {
            success: false,
            error: `Element with ID ${id} is disabled`,
          };
        }

        // Check if element is visible (has offsetParent)
        if (element.offsetParent === null) {
          return {
            success: false,
            error: `Element with ID ${id} is not visible`,
          };
        }

        element.click();
        console.log('[devpilot-dom-inspector] clickElementById success');
        return { success: true };
      }

      return {
        success: false,
        error: `Element with ID ${id} is not clickable (not an HTMLElement)`,
      };
    }
    catch (error) {
      console.error('[devpilot-dom-inspector] clickElementById error:', error);
      return {
        success: false,
        error: error instanceof Error
          ? error.message
          : String(error),
      };
    }
  },

  // Input text by ID
  inputTextById: async (id: string, text: string) => {
    try {
      console.log('[devpilot-dom-inspector] inputTextById called with id:', id, 'text:', text);

      const element = document.querySelector(`[data-devpilot-id="${id}"]`);
      if (!element) {
        return {
          success: false,
          error: `Element with ID ${id} not found`,
        };
      }

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[devpilot-dom-inspector] inputTextById success');
        return { success: true };
      }

      if (element instanceof HTMLSelectElement) {
        // First try to match by value
        element.value = text;

        // If value doesn't match, try to find option by display text
        if (element.value !== text) {
          const matchingOption = Array.from(element.options).find(
            option => option.textContent?.trim() === text,
          );

          if (matchingOption) {
            element.value = matchingOption.value;
          }
          else {
            return {
              success: false,
              error: `No option found with text "${text}" in select element`,
            };
          }
        }

        element.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[devpilot-dom-inspector] inputTextById success (select)');
        return { success: true };
      }

      return {
        success: false,
        error: `Element with ID ${id} is not an input, textarea, or select element`,
      };
    }
    catch (error) {
      console.error('[devpilot-dom-inspector] inputTextById error:', error);
      return {
        success: false,
        error: error instanceof Error
          ? error.message
          : String(error),
      };
    }
  },

  // Get element info by ID
  getElementInfoById: async (id: string) => {
    try {
      console.log('[devpilot-dom-inspector] getElementInfoById called with id:', id);

      const result = getElementInfoById(id);
      console.log('[devpilot-dom-inspector] getElementInfoById returning:', result);
      return result;
    }
    catch (error) {
      console.error('[devpilot-dom-inspector] getElementInfoById error:', error);
      return {
        success: false,
        error: error instanceof Error
          ? error.message
          : String(error),
      };
    }
  },

  querySelector: async (selector, maxDepth = 5) => {
    try {
      console.log('[devpilot-dom-inspector] querySelector called with:', selector);
      const elements = document.querySelectorAll(selector);
      console.log('[devpilot-dom-inspector] Found elements:', elements.length);
      const results: Array<AccessibilityNode & { matchedSelector: string }> = [];

      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const node = buildAccessibilityTree(element, 0, maxDepth); // 至少一层深度

        if (node) {
          results.push({
            ...node,
            matchedSelector: selector,
          });
        }
      }

      const result = {
        success: true,
        selector,
        matchedCount: results.length,
        elements: results,
      };
      console.log('[devpilot-dom-inspector] querySelector returning:', result);
      return result;
    }
    catch (error) {
      console.error('[devpilot-dom-inspector] querySelector error:', error);
      return {
        success: false,
        selector,
        error: error instanceof Error
          ? error.message
          : String(error),
        matchedCount: 0,
        elements: [],
      };
    }
  },

  getDOMTree: async (maxDepth = 5) => {
    try {
      const tree: AccessibilityNode = {
        uid: 'root',
        role: 'document',
        name: document.title || null,
        attributes: {
          url: location.href,
          title: document.title,
        },
        children: [],
      };

      // Process body and its children
      if (document.body) {
        const bodyNode = buildAccessibilityTree(document.body, 0, maxDepth);
        if (bodyNode) {
          tree.children = [bodyNode];
        }
      }

      return {
        success: true,
        tree,
        timestamp: Date.now(),
      };
    }
    catch (error) {
      return {
        success: false,
        error: error instanceof Error
          ? error.message
          : String(error),
        tree: null,
      };
    }
  },

  getLogs: async (options) => {
    try {
      const { level = 'all', limit = 100 } = options || {};

      // Filter logs by level
      let filteredLogs = capturedLogs;
      if (level !== 'all') {
        filteredLogs = capturedLogs.filter(log => log.level === level);
      }

      // Apply limit
      const limitedLogs = filteredLogs.slice(-limit);

      return {
        success: true,
        logs: limitedLogs,
        total: capturedLogs.length,
        filtered: limitedLogs.length,
        level,
      };
    }
    catch (error) {
      return {
        success: false,
        error: error instanceof Error
          ? error.message
          : String(error),
        logs: [],
        total: 0,
        filtered: 0,
        level: options?.level || 'all',
      };
    }
  },
});

// Export types for module augmentation
export type { RpcHandlers };

// Export helper functions for testing
export { buildAccessibilityTree, getAccessibilityInfo, getAccessibleName, getElementOwnText, getInteractiveState, getVisualState, isImportantElement };
