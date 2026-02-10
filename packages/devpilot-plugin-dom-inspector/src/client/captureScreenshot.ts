import type { ScreenshotResult } from '../shared-types';
import { snapdom } from '@zumer/snapdom';
import { generateSelectorNotFoundError, resolveElementBySelector } from './utils/resolveSelector';

export async function captureScreenshot(options?: {
  selector?: string
  fullPage?: boolean
  format?: 'png' | 'jpeg' | 'webp'
  quality?: number
}): Promise<ScreenshotResult> {
  const selector = options?.selector;
  const fullPage = options?.fullPage ?? false;
  const format = options?.format ?? 'png';
  const quality = options?.quality ?? 0.9;

  try {
    console.log('[devpilot-dom-inspector] captureScreenshot called with options:', options);

    // Determine target element
    let targetElement: Element | null = null;
    if (selector) {
      targetElement = resolveElementBySelector(selector);
      if (!targetElement) {
        return {
          success: false,
          timestamp: Date.now(),
          url: location.href,
          title: document.title || '',
          error: generateSelectorNotFoundError(selector),
        };
      }
    }
    else {
      targetElement = fullPage
        ? document.documentElement
        : document.body;
    }

    // Get element dimensions for metadata
    const rect = targetElement.getBoundingClientRect();
    const scrollWidth = targetElement.scrollWidth;
    const scrollHeight = targetElement.scrollHeight;

    // Capture screenshot using snapdom
    const snapdomOptions: Parameters<typeof snapdom>[1] = {
      scale: fullPage
        ? 1
        : undefined,
      useProxy: 'data:', // Handle CORS images by converting to data URL
      cache: 'soft', // Clear session caches between captures
      outerTransforms: false, // Flatten transforms for cleaner screenshot
      outerShadows: false, // Remove shadow bleed
    };

    const result = await snapdom(targetElement, snapdomOptions);

    // Export to the requested format and get data URL from image src
    let imageElement: HTMLImageElement;
    let mimeType: string;

    switch (format) {
      case 'jpeg':
        imageElement = await result.toJpg({ quality });
        mimeType = 'image/jpeg';
        break;
      case 'webp':
        imageElement = await result.toWebp({ quality });
        mimeType = 'image/webp';
        break;
      case 'png':
      default:
        imageElement = await result.toPng();
        mimeType = 'image/png';
        break;
    }

    // Get data URL from image src
    const dataUrl = imageElement.src;
    const base64Data = dataUrl.split(',')[1];

    console.log('[devpilot-dom-inspector] Screenshot captured successfully');

    return {
      success: true,
      timestamp: Date.now(),
      url: location.href,
      title: document.title || '',
      data: base64Data,
      mimeType,
      format,
      dimensions: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        scrollWidth: Math.round(scrollWidth),
        scrollHeight: Math.round(scrollHeight),
      },
      selector: selector || (fullPage
        ? 'documentElement'
        : 'body'),
    };
  }
  catch (error) {
    console.error('[devpilot-dom-inspector] captureScreenshot error:', error);
    return {
      success: false,
      timestamp: Date.now(),
      url: location.href,
      title: document.title || '',
      error: error instanceof Error
        ? error.message
        : String(error),
    };
  }
}
