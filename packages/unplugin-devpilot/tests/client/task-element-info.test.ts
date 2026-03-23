import { describe, expect, it, beforeEach } from 'vitest';
import {
  nextTaskElementUid,
  parseDataInspPath,
  resetTaskElementUidCounter,
  shouldIgnorePickTarget,
} from '../../src/client/task-ui/task-element-info';

describe('parseDataInspPath', () => {
  it('parses relative path with line and column', () => {
    expect(parseDataInspPath('src/App.tsx:10:5:div')).toMatchInlineSnapshot(`
      {
        "column": 5,
        "file": "src/App.tsx",
        "line": 10,
      }
    `)
  })

  it('parses path with colons before numeric tail', () => {
    expect(parseDataInspPath('C:/src/App.tsx:12:3:button')).toMatchInlineSnapshot(`
      {
        "column": 3,
        "file": "C:/src/App.tsx",
        "line": 12,
      }
    `)
  })

  it('returns undefined for invalid strings', () => {
    expect(parseDataInspPath(null)).toBeUndefined()
    expect(parseDataInspPath('')).toBeUndefined()
    expect(parseDataInspPath('no-numbers-here')).toBeUndefined()
  })
})

describe('nextTaskElementUid', () => {
  beforeEach(() => {
    resetTaskElementUidCounter()
  })

  it('increments per session prefix', () => {
    expect(nextTaskElementUid('abc')).toMatchInlineSnapshot(`"dp_abc_1"`)
    expect(nextTaskElementUid('abc')).toMatchInlineSnapshot(`"dp_abc_2"`)
  })
})

describe('shouldIgnorePickTarget', () => {
  it('ignores non-elements', () => {
    expect(shouldIgnorePickTarget(null)).toBe(true)
  })
})
