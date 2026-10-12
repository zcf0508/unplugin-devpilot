// Computed style helpers for getElementDetails.

// Curated set returned when `includeStyles: true` without explicit `styleProps`.
// Longhand-first to avoid cross-engine shorthand serialization differences.
export const DEFAULT_STYLE_PROPS: readonly string[] = [
  'display',
  'position',
  'z-index',
  'width',
  'height',
  'margin',
  'padding',
  'gap',
  'color',
  'background-color',
  'border-radius',
  'box-shadow',
  'opacity',
  'visibility',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
];

// camelCase → kebab-case; custom properties (--) and vendor-prefixed names pass through untouched.
function normalizePropName(prop: string): string {
  if (prop.startsWith('-')) {
    return prop;
  }
  return prop.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

// Read computed styles for the given property names. Keys are the caller-provided names,
// values are the browser-resolved values returned by getComputedStyle.
export function readComputedStyles(
  element: Element,
  props: readonly string[],
  options?: { pseudo?: string },
): Record<string, string> {
  const computed = window.getComputedStyle(element, options?.pseudo);
  const styles: Record<string, string> = {};

  for (const prop of props) {
    const key = prop.trim();
    if (!key || Object.hasOwn(styles, key)) {
      continue;
    }
    styles[key] = computed.getPropertyValue(normalizePropName(key));
  }

  return styles;
}

// Whether the pseudo-element is generated for this element.
// Chromium reports 'normal'/'none'/'' content when the pseudo-element has no rules.
export function isPseudoElementGenerated(element: Element, pseudo: string): boolean {
  const content = window.getComputedStyle(element, pseudo).getPropertyValue('content');
  return content !== '' && content !== 'normal' && content !== 'none';
}
