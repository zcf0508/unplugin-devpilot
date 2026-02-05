import type { ElementActionResult } from '../shared-types';
import { generateSelectorNotFoundError, resolveElementBySelector } from './utils/resolveSelector';

/**
 * Scroll an element into view
 *
 * @param id - Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector
 * @param behavior - Scroll behavior: 'smooth' (default) or 'auto'
 * @returns Promise<ElementActionResult>
 */
export async function scrollToElement(
  id: string,
  behavior: 'smooth' | 'auto' = 'smooth',
): Promise<ElementActionResult> {
  try {
    console.log('[devpilot-dom-inspector] scrollToElement called with id:', id, 'behavior:', behavior);

    const element = resolveElementBySelector(id);

    if (!element) {
      return {
        success: false,
        error: generateSelectorNotFoundError(id),
      };
    }

    // Scroll element into view
    element.scrollIntoView({
      behavior,
      block: 'center', // Center the element vertically
      inline: 'center', // Center the element horizontally
    });

    console.log('[devpilot-dom-inspector] scrollToElement succeeded for id:', id);
    return { success: true };
  }
  catch (error) {
    console.error('[devpilot-dom-inspector] scrollToElement error:', error);
    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : String(error),
    };
  }
}
