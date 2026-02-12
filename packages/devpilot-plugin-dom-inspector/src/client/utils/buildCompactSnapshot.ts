import { uniqueId } from 'es-toolkit/compat';

// Important attributes for interaction (shared across functions)
export const IMPORTANT_ATTRS = ['id', 'type', 'href', 'placeholder', 'role', 'name', 'value', 'for'] as const;

// Infer ARIA role from HTML tag
function inferRoleFromTag(tag: string, element?: Element): string {
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

  // Special handling for input elements based on type attribute
  if (tag === 'input' && element instanceof HTMLInputElement) {
    const type = element.type;
    if (type === 'checkbox') {
      return 'checkbox';
    }
    if (type === 'radio') {
      return 'radio';
    }
    if (type === 'search') {
      return 'searchbox';
    }
    if (type === 'button' || type === 'submit' || type === 'reset') {
      return 'button';
    }
    if (type === 'range') {
      return 'slider';
    }
    if (type === 'number') {
      return 'spinbutton';
    }
    // Default to textbox for text, email, url, tel, password, etc.
    return 'textbox';
  }

  return roleMap[tag] || 'generic';
}

// Interactive roles - elements that users can directly interact with
// Based on agent-browser's INTERACTIVE_ROLES
export const INTERACTIVE_ROLES: Set<string> = new Set([
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

// Content roles - elements that provide content/structure with names
const CONTENT_ROLES = new Set<string>([
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

// Helper function to get element's own text (excluding children's text)
export function getElementOwnText(element: Element): string {
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

// Helper function to get accessible name from aria attributes
export function getAccessibleName(element: Element): string {
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

// Helper function to get visible text from element
export function getVisibleText(element: Element): string {
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

// Check if element is important (should be included in snapshot)
export function isImportantElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase();

  // Always include body element
  if (tag === 'body') {
    return true;
  }

  // Skip non-visual elements (script, style, link, meta)
  const nonVisualTags = ['script', 'style', 'link', 'meta'];
  if (nonVisualTags.includes(tag)) {
    return false;
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

// Helper function to get visual state (hidden, zero-size)
export function getVisualState(element: Element): string[] {
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

// Helper function to get interactive state (disabled, readonly, checked, selected)
export function getInteractiveState(element: Element): string[] {
  const states: string[] = [];

  if (element instanceof HTMLElement) {
    // Check disabled state - only for form elements
    if (
      element instanceof HTMLInputElement
      || element instanceof HTMLTextAreaElement
      || element instanceof HTMLSelectElement
      || element instanceof HTMLButtonElement
    ) {
      if (element.disabled) {
        states.push('disabled');
      }
    }

    // Check readonly state (only for input and textarea)
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.readOnly) {
        states.push('readonly');
      }
    }

    // Check checked state for checkbox/radio (only for input)
    if (element instanceof HTMLInputElement) {
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

// Helper function to get ARIA role
function getAriaRole(element: Element): string {
  const role = element.getAttribute('role');
  if (role) {
    return role;
  }
  return inferRoleFromTag(element.tagName.toLowerCase(), element);
}

// Helper function to get visual context (position, size, visibility)
function getVisualContext(element: Element): string[] {
  const context: string[] = [];

  if (element instanceof HTMLElement) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    // Size information (only if visible)
    if (rect.width > 0 && rect.height > 0) {
      context.push(`size:${Math.round(rect.width)}x${Math.round(rect.height)}`);
    }

    // Position (relative to viewport)
    if (rect.width > 0 && rect.height > 0) {
      context.push(`pos:${Math.round(rect.left)},${Math.round(rect.top)}`);
    }

    // Visibility state
    if (style.visibility === 'hidden') {
      context.push('invisible');
    }
    if (style.opacity === '0') {
      context.push('transparent');
    }
    if (style.display === 'none') {
      context.push('display:none');
    }

    // Z-index
    const zIndex = style.zIndex;
    if (zIndex && zIndex !== 'auto') {
      context.push(`z:${zIndex}`);
    }

    // Positioning type
    if (style.position === 'fixed') {
      context.push('fixed');
    }
    else if (style.position === 'absolute') {
      context.push('absolute');
    }
    else if (style.position === 'sticky') {
      context.push('sticky');
    }
  }

  return context;
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

  // Class - include all classes
  const className = element.getAttribute('class');
  if (className) {
    const classes = className.split(/\s+/).filter(Boolean);
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

// Build compact snapshot in agent-browser style
// If targetElements is provided, only elements on the path to targetElements will be included (pruning)
export function buildCompactSnapshot(
  element: Element,
  depth: number,
  maxDepth: number,
  targetElements?: Element[],
): string {
  // Depth limit check - prevent infinite recursion
  if (depth > maxDepth) {
    return '';
  }

  if (!isImportantElement(element)) {
    return '';
  }

  const lines: string[] = [];
  const indent = ' '.repeat(depth * 2);

  const id = bindElementId(element);
  const tag = element.tagName.toLowerCase();
  const text = getVisibleText(element);
  const attrs = getCompactAttributes(element);
  const role = getAriaRole(element);
  const visualContext = getVisualContext(element);

  // Build line: @id [tag] <role> "text" [attrs] {visual}
  let line = `${indent}@${id} [${tag}]`;

  // Add ARIA role (only if not generic to reduce noise)
  if (role && role !== 'generic') {
    line += ` <${role}>`;
  }

  // Add visible text or accessible name
  if (text) {
    // Escape double quotes in text to preserve snapshot format
    const escapedText = text.replace(/"/g, '\\"');
    line += ` "${escapedText}"`;
  }

  // Add attributes and states
  if (attrs.length > 0) {
    line += ` [${attrs.join(' ')}]`;
  }

  // Add visual context (position, size, visibility)
  if (visualContext.length > 0) {
    line += ` {${visualContext.join(' ')}}`;
  }

  lines.push(line);

  // If this element is one of the target elements, stop here (don't expand its children)
  // This prevents expanding the full subtree of boundary elements
  if (targetElements && targetElements.length > 0 && targetElements.includes(element)) {
    return lines.join('\n');
  }

  // Recursively process children (limit depth and count)
  let children = Array.from(element.children)
    .filter(isImportantElement)
    .slice(0, 20); // Limit children per node

  // If targetElements is provided, prune children that are not on the path to targets
  if (targetElements && targetElements.length > 0) {
    children = children.filter((child) => {
      // Keep this child if:
      // 1. It is one of the target elements
      // 2. It contains one of the target elements (ancestor of target)
      return targetElements.some(target =>
        child === target
        || child.contains(target),
      );
    });
  }

  for (const child of children) {
    const childSnapshot = buildCompactSnapshot(child, depth + 1, maxDepth, targetElements);
    if (childSnapshot) {
      lines.push(childSnapshot);
    }
  }

  return lines.join('\n');
}
