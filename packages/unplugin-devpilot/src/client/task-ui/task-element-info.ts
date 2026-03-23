import type { TaskElementInfo } from '../../core/types';

const IMPLICIT_ROLE: Record<string, string> = {
  a: 'link',
  button: 'button',
  input: 'textbox',
  textarea: 'textbox',
  select: 'combobox',
  img: 'img',
  nav: 'navigation',
  main: 'main',
  header: 'banner',
  footer: 'contentinfo',
  aside: 'complementary',
  form: 'form',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
}

/**
 * Parse `data-insp-path` / code-inspector style: `relative/path.tsx:line:col:tag`
 * File segment may contain colons (e.g. Windows); we take numeric line/col and tag from the tail.
 */
export function parseDataInspPath(raw: string | null | undefined): TaskElementInfo['codeLocation'] | undefined {
  if (!raw || typeof raw !== 'string') {
    return undefined;
  }
  const m = raw.match(/^(.*):(\d+):(\d+):([^:]+)$/)
  if (!m) {
    return undefined
  }
  const file = m[1]
  const line = Number(m[2])
  const column = Number(m[3])
  if (!file || !Number.isFinite(line) || !Number.isFinite(column)) {
    return undefined
  }
  return { file, line, column }
}

export function inferRole(el: Element): string {
  const explicit = el.getAttribute('role')
  if (explicit) {
    return explicit.trim()
  }
  const tag = el.tagName.toLowerCase()
  return IMPLICIT_ROLE[tag] ?? tag
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) {
    return t
  }
  return `${t.slice(0, max - 1)}…`
}

export function inferAccessibleName(el: Element): string {
  if (!(el instanceof HTMLElement)) {
    return ''
  }
  const aria = el.getAttribute('aria-label')
  if (aria) {
    return truncate(aria, 200)
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const fromInput = el.placeholder || el.value || el.name || ''
    if (fromInput) {
      return truncate(fromInput, 200)
    }
  }
  if (el instanceof HTMLImageElement) {
    const alt = el.alt
    if (alt) {
      return truncate(alt, 200)
    }
  }
  const title = el.getAttribute('title')
  if (title) {
    return truncate(title, 200)
  }
  const text = el.textContent ?? ''
  return truncate(text, 200)
}

export function buildCssSelector(el: Element): string {
  if (!(el instanceof HTMLElement)) {
    return el.tagName.toLowerCase()
  }
  if (el.id && !el.id.startsWith('devpilot')) {
    try {
      return `#${CSS.escape(el.id)}`
    }
    catch {
      return `#${el.id.replace(/"/g, '\\"')}`
    }
  }
  if (typeof el.className === 'string' && el.className.trim()) {
    const classes = el.className.trim().split(/\s+/).filter((c: string) =>
      c && !c.startsWith('devpilot'),
    ).slice(0, 2)
    if (classes.length > 0) {
      const tag = el.tagName.toLowerCase()
      const part = classes.map((c: string) => CSS.escape(c)).join('.')
      return `${tag}.${part}`
    }
  }
  return el.tagName.toLowerCase()
}

let uidCounter = 0

export function nextTaskElementUid(sessionId: string): string {
  uidCounter += 1
  return `dp_${sessionId}_${uidCounter}`
}

export function resetTaskElementUidCounter(): void {
  uidCounter = 0
}

export function collectElementContext(
  el: Element,
  sessionId: string,
): TaskElementInfo {
  const insp = el.getAttribute('data-insp-path') ?? el.getAttribute('data-devpilot-insp-path')
  const codeLocation = parseDataInspPath(insp)
  return {
    uid: nextTaskElementUid(sessionId),
    selector: buildCssSelector(el),
    role: inferRole(el),
    name: inferAccessibleName(el),
    ...(codeLocation ? { codeLocation } : {}),
  }
}

/** Walk composed tree so picks inside Lit shadow root skip the task UI host. */
export function isUnderDevpilotTaskUi(el: Element | null): boolean {
  let n: Element | null = el
  while (n) {
    if (n.tagName.toLowerCase() === 'devpilot-task-app') {
      return true
    }
    const root = n.getRootNode()
    if (root instanceof ShadowRoot) {
      n = root.host as Element
    }
    else {
      n = n.parentElement
    }
  }
  return false
}

export function shouldIgnorePickTarget(node: EventTarget | null): boolean {
  if (node == null) {
    return true
  }
  const El = (globalThis as typeof globalThis & { Element?: abstract new () => Element }).Element
  if (!El || !(node instanceof El)) {
    return true
  }
  const el = node as Element
  if (isUnderDevpilotTaskUi(el)) {
    return true
  }
  const tag = el.tagName
  if (tag === 'HTML' || tag === 'BODY' || tag === 'HEAD') {
    return true
  }
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
    return true
  }
  return false
}
