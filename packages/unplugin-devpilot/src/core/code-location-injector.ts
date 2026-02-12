import { transformCode } from '@code-inspector/core';

/**
 * Check if code-inspector is already injecting location info
 * by looking for data-insp-path attributes in the code
 */
export function hasCodeInspector(code: string): boolean {
  return code.includes('data-insp-path');
}

/**
 * Determine file type from file path and query params
 */
function getFileType(filePath: string, query?: string): 'vue' | 'jsx' | 'svelte' | null {
  const params = query
    ? new URLSearchParams(query)
    : null;
  const jsxParamList = ['isJsx', 'isTsx', 'lang.jsx', 'lang.tsx'];

  // JSX/TSX files
  if (/\.(?:jsx|tsx|js|ts)$/.test(filePath)) {
    return 'jsx';
  }

  // Vue files with JSX
  if (
    filePath.endsWith('.vue')
    && params
    && (jsxParamList.some(param => params.get(param) !== null)
      || params.get('lang') === 'tsx'
      || params.get('lang') === 'jsx')
  ) {
    return 'jsx';
  }

  // Vue template from external HTML file
  if (
    filePath.endsWith('.html')
    && params?.get('type') === 'template'
    && params.has('vue')
  ) {
    return 'vue';
  }

  // Vue SFC
  if (
    filePath.endsWith('.vue')
    && params?.get('type') !== 'style'
    && params?.get('raw') === null
  ) {
    return 'vue';
  }

  // Svelte files
  if (filePath.endsWith('.svelte')) {
    return 'svelte';
  }

  return null;
}

/**
 * Check if file should be excluded from injection
 */
function shouldExcludeFile(filePath: string): boolean {
  // Exclude node_modules
  if (filePath.includes('node_modules')) {
    return true;
  }

  // Exclude virtual modules
  if (filePath.includes('\0')) {
    return true;
  }

  return false;
}

/**
 * Transform code to inject source location
 * Automatically detects file type and skips if code-inspector is already present
 */
export function injectSourceLocation(
  code: string,
  id: string,
): string | null {
  // Skip if file should be excluded
  if (shouldExcludeFile(id)) {
    return null;
  }

  // Skip if code-inspector is already injecting
  if (hasCodeInspector(code)) {
    return null;
  }

  // Parse file path and query
  const [filePath, query] = id.split('?', 2);

  // Determine file type
  const fileType = getFileType(filePath, query);
  if (!fileType) {
    return null;
  }

  try {
    const result = transformCode({
      content: code,
      filePath,
      fileType,
      escapeTags: [],
      pathType: 'relative',
    });

    // transformCode might return the same code if no transformation is needed
    // Only return if the code was actually modified
    if (result && result !== code) {
      return result;
    }

    return null;
  }
  catch (error) {
    // transformCode might throw for invalid code, which is expected
    // Just return null to skip transformation
    return null;
  }
}
