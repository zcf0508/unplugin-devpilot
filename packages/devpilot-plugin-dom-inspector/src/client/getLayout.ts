import type { GetLayoutResult } from '../shared-types';
import { buildCompactSnapshot, isImportantElement } from './utils';

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
function buildLayoutTree(
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
      depth,
      timestamp: Date.now(),
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
