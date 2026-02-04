import type { AccessibilityNode } from '../../shared-types';
import { uniqueId } from 'es-toolkit/compat';

// Helper function to generate stable UIDs using es-toolkit
function generateUid(): string {
  return `node_${uniqueId()}`;
}

// Helper function to get accessibility information from an element
export function getAccessibilityInfo(element: Element): Omit<AccessibilityNode, 'uid' | 'children'> {
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
export function buildAccessibilityTree(
  element: Element,
  depth: number,
  maxDepth: number,
): AccessibilityNode | null {
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

export * from './buildCompactSnapshot';
