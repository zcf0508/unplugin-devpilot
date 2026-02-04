import type { GetLayoutResult } from '../shared-types';
import { buildCompactSnapshot, isImportantElement } from './utils';

// Format layout with LLM-friendly explanation
// Combines server-side structure with client-side format details
function formatLayoutForLLM(
  snapshots: Record<string, string>,
  targetId: string,
  targetRect: { x: number, y: number, width: number, height: number },
  depth: number,
  timestamp: number,
): string {
  let layoutText = '# DOM Layout Analysis\n\n';
  layoutText += `**Target ID:** ${targetId}\n`;
  layoutText += `**Target Rect:** x=${targetRect.x.toFixed(1)}, y=${targetRect.y.toFixed(1)}, w=${targetRect.width.toFixed(1)}, h=${targetRect.height.toFixed(1)}\n`;
  layoutText += `**Depth:** ${depth}\n`;
  layoutText += `**Timestamp:** ${new Date(timestamp).toISOString()}\n\n`;

  if (Object.keys(snapshots).length > 0) {
    const levels = Object.keys(snapshots).sort();
    layoutText += '## Layout Levels\n\n';
    for (const level of levels) {
      layoutText += `### ${level}\n`;
      layoutText += `\`\`\`\n${snapshots[level]}\n\`\`\`\n\n`;
    }

    layoutText += '## Format Guide\n\n';
    layoutText += 'Each line represents a DOM element with the following structure:\n';
    layoutText += '`@id [tag] <role> "text" [attributes] {visual}`\n\n';
    layoutText += 'Where:\n';
    layoutText += '- `@id`: Unique element identifier (e.g., @e1, @e2) - use this for targeted operations\n';
    layoutText += '- `[tag]`: HTML tag name (e.g., [div], [button], [input])\n';
    layoutText += '- `<role>`: ARIA role or semantic role (e.g., <button>, <link>, <heading>) - shown only if meaningful\n';
    layoutText += '- `"text"`: Visible text content or accessible name - what users see or screen readers announce\n';
    layoutText += '- `[attributes]`: Key attributes and states:\n';
    layoutText += '  - Element properties: id, type, href, placeholder, name, value, for\n';
    layoutText += '  - Interactive states: disabled, readonly, checked, selected\n';
    layoutText += '  - Visual states: hidden, zero-size\n';
    layoutText += '  - Class names (first 2 classes shown)\n';
    layoutText += '- `{visual}``: Visual context (position, size, visibility):\n';
    layoutText += '  - size:WxH - element dimensions in pixels\n';
    layoutText += '  - pos:X,Y - position relative to viewport top-left\n';
    layoutText += '  - z:N - z-index value\n';
    layoutText += '  - Positioning: fixed, absolute, sticky\n';
    layoutText += '  - Visibility: invisible, transparent, display:none\n\n';

    layoutText += '## Usage Guide\n\n';
    layoutText += '1. **Analyze the layout structure** - Each level shows elements that visually cover the target\n';
    layoutText += '2. **Identify the layer you need** - e.g., level1 for main content, level2 for modal\n';
    layoutText += '3. **Get detailed snapshot** - Call get_compact_snapshot(maxDepth) for that layer\n';
    layoutText += '4. **Execute actions** - Use click_element_by_id() or input_text_by_id()\n\n';
    layoutText += '## Example Workflow\n\n';
    layoutText += '```typescript\n';
    layoutText += '// 1. Get layout overview\n';
    layoutText += 'const layout = await get_layout({ maxDepth: 15 });\n';
    layoutText += '// LLM sees: page has 3 visual layers\n\n';
    layoutText += '// 2. Get detailed snapshot for specific layer\n';
    layoutText += 'const snapshot = await get_compact_snapshot({ maxDepth: 5 });\n\n';
    layoutText += '// 3. Execute action\n';
    layoutText += 'await click_element_by_id({ id: "e14" });\n';
    layoutText += '```\n';
  }
  else {
    layoutText += '## Result\n\nNo layout hierarchy found. The target element has no child elements.\n';
  }

  return layoutText;
}

// Calculate DOM depth of an element from body
function getDomDepth(element: Element): number {
  let depth = 0;
  let current: Element | null = element;
  while (current && current !== document.body) {
    depth++;
    current = current.parentElement;
  }
  return depth;
}

// Check if element is absolutely or fixed positioned
function isAbsoluteOrFixed(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return style.position === 'absolute' || style.position === 'fixed';
}

// Check if one rectangle fully covers another rectangle
// Used by getLayout to determine visual coverage hierarchy
function isRectCovering(coverRect: DOMRect, targetRect: DOMRect, tolerance = 10): boolean {
  return (
    coverRect.left - tolerance <= targetRect.left
    && coverRect.right + tolerance >= targetRect.right
    && coverRect.top - tolerance <= targetRect.top
    && coverRect.bottom + tolerance >= targetRect.bottom
  );
}

// Check if multiple elements together cover the parent rectangle
function elementsTogetherCoverParent(elements: Element[], parentRect: DOMRect): boolean {
  if (elements.length === 0) { return false; }
  if (elements.length === 1) { return isRectCovering(elements[0].getBoundingClientRect(), parentRect); }

  // Calculate the union of all element rectangles
  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;

  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    minLeft = Math.min(minLeft, rect.left);
    minTop = Math.min(minTop, rect.top);
    maxRight = Math.max(maxRight, rect.right);
    maxBottom = Math.max(maxBottom, rect.bottom);
  }

  // Check if the union covers the parent
  const tolerance = 10;
  return (
    minLeft - tolerance <= parentRect.left
    && maxRight + tolerance >= parentRect.right
    && minTop - tolerance <= parentRect.top
    && maxBottom + tolerance >= parentRect.bottom
  );
}

// Find boundary elements that together cover the parent
// Returns the array of boundary elements (not just depth)
function findBoundaryElements(element: Element, parentRect: DOMRect): Element[] {
  // Find all non-positioned children that intersect with parent
  const candidateChildren: Element[] = [];
  for (const child of Array.from(element.children)) {
    if (isAbsoluteOrFixed(child)) { continue; }

    const childRect = child.getBoundingClientRect();
    // Check if child intersects with parent
    const intersects = !(
      childRect.right < parentRect.left
      || childRect.left > parentRect.right
      || childRect.bottom < parentRect.top
      || childRect.top > parentRect.bottom
    );

    if (intersects) {
      candidateChildren.push(child);
    }
  }

  // Check if any single child covers the parent
  const coveringChildren: Element[] = [];
  const nonCoveringChildren: Element[] = [];

  for (const child of candidateChildren) {
    const childRect = child.getBoundingClientRect();
    if (isRectCovering(childRect, parentRect)) {
      coveringChildren.push(child);
    }
    else {
      nonCoveringChildren.push(child);
    }
  }

  // If no single child covers parent, check if multiple together cover it
  if (coveringChildren.length === 0 && nonCoveringChildren.length > 0) {
    if (elementsTogetherCoverParent(nonCoveringChildren, parentRect)) {
      // These non-covering children together form the visual boundary
      return nonCoveringChildren;
    }
  }

  // If we have covering children, recurse into them
  if (coveringChildren.length > 0) {
    const allBoundaryElements: Element[] = [];
    for (const child of coveringChildren) {
      const childRect = child.getBoundingClientRect();
      const childBoundaries = findBoundaryElements(child, childRect);
      if (childBoundaries.length > 0) {
        allBoundaryElements.push(...childBoundaries);
      }
      else {
        // This child covers parent but has no covering children, it's a boundary
        allBoundaryElements.push(child);
      }
    }
    return allBoundaryElements;
  }

  // No children cover the parent, return empty array (current element is the boundary)
  return [];
}

// Collect top-level positioned elements under a root element (recursively)
// Only collects visible positioned elements that are not nested inside other positioned elements
// Filters out hidden elements like scrollbars
function collectPositionedElements(element: Element, results: Element[] = [], insidePositioned = false): Element[] {
  for (const child of Array.from(element.children)) {
    const isPositioned = isAbsoluteOrFixed(child);

    if (isPositioned && !insidePositioned) {
      // Only collect visible positioned elements that are not inside another positioned element
      // Skip hidden elements (like scrollbars with 'hidden' class)
      const isHidden = child.classList.contains('hidden')
        || child.getAttribute('aria-hidden') === 'true';
      if (isImportantElement(child) && !isHidden) {
        results.push(child);
        // Don't recurse into positioned elements - they form their own layer
        continue;
      }
    }

    // Continue recursively, passing the insidePositioned flag
    collectPositionedElements(child, results, insidePositioned || isPositioned);
  }
  return results;
}

// Build layout hierarchy based on visual coverage
// Returns an object where each level contains a complete tree snapshot from body to that visual layer
// Algorithm:
// 1. Find the main covering element (the one that covers the viewport)
// 2. Find boundary elements within the main covering element
// 3. Build ONE snapshot for the main covering layer (from body to boundary elements)
// 4. Find all positioned elements and build ONE snapshot for each
export function buildLayoutTree(
  element: Element,
  maxDepth: number,
): { snapshots: Record<string, string>, depth: number } {
  const levelSnapshots: Record<string, string> = {};
  let currentLevel = 0;

  const elementRect = element.getBoundingClientRect();

  // Find all non-positioned children that intersect with the element
  const candidateChildren: Element[] = [];
  for (const child of Array.from(element.children)) {
    if (isAbsoluteOrFixed(child)) { continue; }
    const childRect = child.getBoundingClientRect();
    // Check if child intersects with element
    const intersects = !(
      childRect.right < elementRect.left
      || childRect.left > elementRect.right
      || childRect.bottom < elementRect.top
      || childRect.top > elementRect.bottom
    );
    if (intersects) {
      candidateChildren.push(child);
    }
  }

  // Separate covering children from non-covering children
  const coveringChildren: Element[] = [];
  const nonCoveringChildren: Element[] = [];

  for (const child of candidateChildren) {
    const childRect = child.getBoundingClientRect();
    if (isRectCovering(childRect, elementRect)) {
      coveringChildren.push(child);
    }
    else {
      nonCoveringChildren.push(child);
    }
  }

  // Determine the main covering element(s)
  let mainCoveringElement: Element | null = null;
  let boundaryElements: Element[] = [];

  if (coveringChildren.length > 0) {
    // Use the first covering child as main element
    mainCoveringElement = coveringChildren[0];
    const mainRect = mainCoveringElement.getBoundingClientRect();
    boundaryElements = findBoundaryElements(mainCoveringElement, mainRect);
    if (boundaryElements.length === 0) {
      boundaryElements = [mainCoveringElement];
    }
  }
  else if (nonCoveringChildren.length > 0 && elementsTogetherCoverParent(nonCoveringChildren, elementRect)) {
    // Multiple children together cover the parent - they are the boundary elements
    boundaryElements = nonCoveringChildren;
  }

  // Build level1: main content layer (body to boundary elements)
  if (boundaryElements.length > 0 && currentLevel < maxDepth) {
    const boundaryDepth = Math.max(...boundaryElements.map(el => getDomDepth(el)));
    // Build snapshot with pruning - only include elements on path to boundary elements
    const snapshot = buildCompactSnapshot(document.body, 0, boundaryDepth, boundaryElements);
    if (snapshot) {
      levelSnapshots.level1 = snapshot;
      currentLevel++;
    }
  }

  // Collect all positioned elements from the entire tree
  const allPositioned: Element[] = [];
  collectPositionedElements(document.body, allPositioned);

  // Remove duplicates and sort by DOM depth
  const uniquePositioned = [...new Set(allPositioned)];
  uniquePositioned.sort((a, b) => getDomDepth(a) - getDomDepth(b));

  // Build level2+: each positioned element is an independent visual layer
  for (const positionedEl of uniquePositioned) {
    if (currentLevel >= maxDepth) {
      break;
    }

    const depth = getDomDepth(positionedEl);
    // Build snapshot with pruning - only include elements on path to the positioned element
    const snapshot = buildCompactSnapshot(document.body, 0, depth, [positionedEl]);
    if (snapshot) {
      const levelKey = `level${currentLevel + 1}`;
      levelSnapshots[levelKey] = snapshot;
      currentLevel++;
    }
  }

  return { snapshots: levelSnapshots, depth: currentLevel };
}

export async function getLayout(
  options?: { id?: string, maxDepth?: number },
): Promise<GetLayoutResult> {
  const { id, maxDepth = 15 } = options || {};

  try {
    console.log('[devpilot-dom-inspector] getLayout called with id:', id, 'maxDepth:', maxDepth);

    // Find target element (or use body)
    const target = id
      ? document.querySelector(`[data-devpilot-id="${id}"]`)
      : document.body;

    if (!target) {
      return {
        success: false,
        error: `Element with ID ${id} not found`,
      } as GetLayoutResult;
    }

    // Get target element's bounding rectangle
    const targetRect = target.getBoundingClientRect();

    // Build layout tree starting from target element to capture its visual layers
    const { snapshots, depth } = buildLayoutTree(target, maxDepth);

    const timestamp = Date.now();

    // Format snapshots with LLM-friendly explanation
    const formattedLayout = Object.keys(snapshots).length > 0
      ? formatLayoutForLLM(
        snapshots,
        id || 'body',
        { x: targetRect.x, y: targetRect.y, width: targetRect.width, height: targetRect.height },
        depth,
        timestamp,
      )
      : null;

    const result: GetLayoutResult = {
      success: true,
      targetId: id || 'body',
      targetRect: {
        x: targetRect.x,
        y: targetRect.y,
        width: targetRect.width,
        height: targetRect.height,
      },
      layout: Object.keys(snapshots).length > 0
        ? snapshots
        : null,
      formattedLayout,
      depth,
      timestamp,
    };

    console.log('[devpilot-dom-inspector] getLayout returning with depth:', depth, 'levels:', Object.keys(snapshots).length);
    return result;
  }
  catch (error) {
    console.error('[devpilot-dom-inspector] getLayout error:', error);
    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : String(error),
      targetId: id || 'body',
      targetRect: { x: 0, y: 0, width: 0, height: 0 },
      layout: null,
      depth: 0,
      timestamp: Date.now(),
    } as GetLayoutResult;
  }
}
