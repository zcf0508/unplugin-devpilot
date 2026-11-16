import type { PseudoElementSelector, SimulatedStyleState, StyleSourceLocation } from '../../shared-types';
import type { SelectorMatch, SelectorVariant } from './selectors';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import { parse, walk } from 'css-tree';
import { matchSelector, parseSelectorVariants, withMatchTargets } from './selectors';

export type ConditionState = 'active' | 'inactive' | 'unknown';

export interface StyleCondition {
  text: string
  state: ConditionState
}

export interface CssDeclaration {
  property: string
  value: string
  important: boolean
  line?: number
  column?: number
}

interface ParsedRule {
  selector: string
  declarations: CssDeclaration[]
}

interface SheetInfo {
  file?: string
  href?: string
  astRules: ParsedRule[]
  traceMap?: TraceMap
  styleRuleIndex: number
}

export interface RuleRecord {
  style: CSSStyleDeclaration
  origin: 'inline' | 'author'
  variants: SelectorVariant[]
  layer?: string
  layerRank: number | null
  conditions: StyleCondition[]
  order: number
  declarations?: CssDeclaration[]
  sheet?: SheetInfo
  inlineSource?: StyleSourceLocation
}

export interface MatchedRule extends RuleRecord {
  selector: string
  resolvedSelector?: string
  specificity?: [number, number, number]
}

function parseRules(cssText: string): ParsedRule[] {
  const rules: ParsedRule[] = [];
  const ast = parse(cssText, {
    positions: true,
    parseValue: false,
    parseRulePrelude: false,
    parseCustomProperty: false,
    onParseError: () => {},
  });
  walk(ast, {
    visit: 'Rule',
    enter: (rule) => {
      if (rule.prelude.type !== 'Raw') {
        return;
      }
      const declarations: CssDeclaration[] = [];
      for (const node of rule.block.children) {
        if (node.type !== 'Declaration') {
          continue;
        }
        declarations.push({
          property: node.property,
          value: node.value.type === 'Raw'
            ? node.value.value.trim()
            : '',
          important: Boolean(node.important),
          line: node.loc?.start.line,
          column: node.loc?.start.column,
        });
      }
      rules.push({ selector: rule.prelude.value.trim(), declarations });
    },
  });
  return rules;
}

export function parseDeclarationBlock(cssText: string): CssDeclaration[] {
  return parseRules(`x{${cssText}}`)[0]?.declarations ?? [];
}

function declarationsForCssRule(rule: CSSStyleRule, parsedRule?: ParsedRule): CssDeclaration[] {
  const declarations = parseDeclarationBlock(rule.style.cssText);
  if (!parsedRule) {
    return declarations.map(({ line: _line, column: _column, ...declaration }) => declaration);
  }
  const available = [...parsedRule.declarations];
  return declarations.map((declaration) => {
    const index = available.findIndex(candidate =>
      candidate.property === declaration.property
      && candidate.value.replace(/\s+/g, ' ') === declaration.value.replace(/\s+/g, ' ')
      && candidate.important === declaration.important,
    );
    if (index >= 0) {
      return available.splice(index, 1)[0];
    }
    const { line: _line, column: _column, ...withoutPosition } = declaration;
    return withoutPosition;
  });
}

function decodeSourceMap(cssText: string): TraceMap | undefined {
  const match = cssText.match(/\/\*[#@]\s*sourceMappingURL=data:application\/json(?:;charset=[^;,]+)?(;base64)?,([^*]+)\*\//);
  if (!match) {
    return undefined;
  }
  try {
    const payload = match[2].trim();
    const json = match[1]
      ? new TextDecoder().decode(Uint8Array.from(atob(payload), character => character.charCodeAt(0)))
      : decodeURIComponent(payload);
    return new TraceMap(JSON.parse(json));
  }
  catch {
    return undefined;
  }
}

function sheetInfo(sheet: CSSStyleSheet): SheetInfo {
  const owner = sheet.ownerNode;
  const moduleId = owner instanceof Element
    ? owner.getAttribute('data-vite-dev-id')
    : null;
  const cssText = owner instanceof HTMLStyleElement
    ? owner.textContent ?? ''
    : '';
  const info: SheetInfo = {
    file: moduleId?.split('?')[0],
    href: sheet.href ?? undefined,
    astRules: [],
    traceMap: cssText
      ? decodeSourceMap(cssText)
      : undefined,
    styleRuleIndex: 0,
  };
  if (cssText) {
    try {
      info.astRules.push(...parseRules(cssText));
    }
    catch {
      // CSSOM remains authoritative when the original text cannot be parsed.
    }
  }
  return info;
}

function inlineSource(element: Element): StyleSourceLocation | undefined {
  const location = element.getAttribute('data-insp-path');
  const match = location?.match(/^(.*):(\d+):(\d+):[^:]*$/);
  if (!match) {
    return undefined;
  }
  return {
    file: match[1],
    line: Number(match[2]),
    column: Number(match[3]),
    position: 'source',
  };
}

export function declarationSource(record: RuleRecord, declaration?: CssDeclaration): StyleSourceLocation | undefined {
  if (record.origin === 'inline') {
    return record.inlineSource;
  }
  if (!declaration?.line || !declaration.column || !record.sheet) {
    return record.sheet?.file || record.sheet?.href
      ? {
        ...(record.sheet.file
          ? { file: record.sheet.file }
          : {}),
        ...(record.sheet.href
          ? { href: record.sheet.href }
          : {}),
      }
      : undefined;
  }

  const generated: StyleSourceLocation = {
    ...(record.sheet.file
      ? { file: record.sheet.file }
      : {}),
    ...(record.sheet.href
      ? { href: record.sheet.href }
      : {}),
    line: declaration.line,
    column: declaration.column,
    position: 'generated',
  };
  if (!record.sheet.traceMap) {
    return generated;
  }
  try {
    const original = originalPositionFor(record.sheet.traceMap, {
      line: declaration.line,
      column: declaration.column - 1,
    });
    if (original.source && original.line !== null && original.column !== null) {
      return {
        file: original.source,
        line: original.line,
        column: original.column + 1,
        position: 'source',
      };
    }
  }
  catch {
    // Fall back to the generated location when a malformed map cannot be traced.
  }
  return generated;
}

function conditionForRule(rule: CSSRule, view: Window): StyleCondition | undefined {
  if (rule instanceof CSSMediaRule) {
    return {
      text: `@media ${rule.media.mediaText}`,
      state: view.matchMedia(rule.media.mediaText).matches
        ? 'active'
        : 'inactive',
    };
  }
  if (rule instanceof CSSSupportsRule) {
    let matches = false;
    try {
      matches = CSS.supports(rule.conditionText);
    }
    catch {
      return { text: `@supports ${rule.conditionText}`, state: 'unknown' };
    }
    return {
      text: `@supports ${rule.conditionText}`,
      state: matches
        ? 'active'
        : 'inactive',
    };
  }
  if (typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule) {
    return { text: `@container ${rule.conditionText}`, state: 'unknown' };
  }
  if (typeof CSSScopeRule !== 'undefined' && rule instanceof CSSScopeRule) {
    return { text: rule.cssText.slice(0, rule.cssText.indexOf('{')).trim(), state: 'unknown' };
  }
  return undefined;
}

export function collectStyleRules(
  element: Element,
  warnings: Set<string>,
  onUnreadable: () => void = () => {},
): RuleRecord[] {
  const records: RuleRecord[] = [];
  const visited = new Set<CSSStyleSheet>();
  const layerOrder = new Map<string, number>();
  const root = element.getRootNode() as Document | ShadowRoot;
  const view = element.ownerDocument.defaultView ?? window;
  let order = 0;
  let anonymousLayer = 0;

  const registerLayer = (path: string): number => {
    const existing = layerOrder.get(path);
    if (existing !== undefined) {
      return existing;
    }
    const index = layerOrder.size;
    layerOrder.set(path, index);
    return index;
  };

  const visitRules = (
    rules: CSSRuleList,
    sheet: SheetInfo,
    parentVariants: SelectorVariant[] | undefined,
    layerPath: string[],
    layerRank: number | null,
    conditions: StyleCondition[],
  ): void => {
    for (const rule of Array.from(rules)) {
      if (typeof CSSLayerStatementRule !== 'undefined' && rule instanceof CSSLayerStatementRule) {
        for (const name of rule.nameList) {
          registerLayer([...layerPath, name].join('.'));
        }
        continue;
      }
      if (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule) {
        const name = rule.name || `anonymous-${++anonymousLayer}`;
        const path = [...layerPath, name];
        const fullName = path.join('.');
        const rank = registerLayer(fullName);
        visitRules(rule.cssRules, sheet, parentVariants, path, rank, conditions);
        continue;
      }
      if (rule instanceof CSSImportRule) {
        const importConditions = [...conditions];
        if (rule.media.mediaText) {
          importConditions.push({
            text: `@import ${rule.href} ${rule.media.mediaText}`,
            state: view.matchMedia(rule.media.mediaText).matches
              ? 'active'
              : 'inactive',
          });
        }
        const layerName = rule.layerName;
        const path = layerName
          ? [...layerPath, layerName]
          : layerPath;
        const rank = layerName
          ? registerLayer(path.join('.'))
          : layerRank;
        if (rule.styleSheet) {
          visitSheet(rule.styleSheet, parentVariants, path, rank, importConditions);
        }
        continue;
      }
      if (rule instanceof CSSStyleRule) {
        try {
          const variants = parseSelectorVariants(rule.selectorText, parentVariants);
          const astRule = sheet.astRules[sheet.styleRuleIndex++];
          const declarations = declarationsForCssRule(
            rule,
            astRule?.selector.replace(/\s+/g, ' ').trim() === rule.selectorText.replace(/\s+/g, ' ').trim()
              ? astRule
              : undefined,
          );
          records.push({
            style: rule.style,
            origin: 'author',
            variants,
            layer: layerPath.length
              ? layerPath.join('.')
              : undefined,
            layerRank,
            conditions,
            order: order++,
            declarations,
            sheet,
          });
          if (rule.cssRules.length) {
            visitRules(rule.cssRules, sheet, variants, layerPath, layerRank, conditions);
          }
        }
        catch (error) {
          warnings.add(`Could not parse selector "${rule.selectorText}": ${error instanceof Error
            ? error.message
            : String(error)}`);
        }
        continue;
      }
      if (typeof CSSNestedDeclarations !== 'undefined' && rule instanceof CSSNestedDeclarations && parentVariants) {
        records.push({
          style: rule.style,
          origin: 'author',
          variants: parentVariants,
          layer: layerPath.length
            ? layerPath.join('.')
            : undefined,
          layerRank,
          conditions,
          order: order++,
          sheet,
        });
        continue;
      }

      const condition = conditionForRule(rule, view);
      if (condition && 'cssRules' in rule) {
        visitRules(
          (rule as CSSGroupingRule).cssRules,
          sheet,
          parentVariants,
          layerPath,
          layerRank,
          [...conditions, condition],
        );
      }
    }
  };

  function visitSheet(
    sheet: CSSStyleSheet,
    parentVariants: SelectorVariant[] | undefined,
    layerPath: string[],
    layerRank: number | null,
    conditions: StyleCondition[],
  ): void {
    if (visited.has(sheet)) {
      return;
    }
    visited.add(sheet);
    const info = sheetInfo(sheet);
    try {
      visitRules(sheet.cssRules, info, parentVariants, layerPath, layerRank, conditions);
    }
    catch (error) {
      onUnreadable();
      const label = sheet.href
        ? `stylesheet ${sheet.href}`
        : sheet.ownerNode
          ? 'an inline stylesheet'
          : 'a constructed stylesheet';
      warnings.add(`Could not read ${label}: ${error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error)}`);
    }
  }

  const sheets = 'styleSheets' in root
    ? Array.from((root as Document).styleSheets)
    : [];
  for (const sheet of [...sheets, ...(root.adoptedStyleSheets ?? [])]) {
    visitSheet(sheet, undefined, [], null, []);
  }

  const style = (element as HTMLElement).style;
  if (style) {
    records.push({
      style,
      origin: 'inline',
      variants: [],
      layerRank: null,
      conditions: [],
      order: order++,
      inlineSource: inlineSource(element),
    });
  }
  return records;
}

export function matchingRules(
  records: RuleRecord[],
  element: Element,
  states: SimulatedStyleState[],
  pseudo?: PseudoElementSelector,
  stateTarget = element,
): MatchedRule[] {
  return withMatchTargets(stateTarget, states, () => {
    const matched: MatchedRule[] = [];
    for (const record of records) {
      if (record.origin === 'inline') {
        if (!pseudo) {
          matched.push({ ...record, selector: 'inline style' });
        }
        continue;
      }
      const match: SelectorMatch | null = matchSelector(element, record.variants, states, pseudo, stateTarget, true);
      if (!match) {
        continue;
      }
      matched.push({
        ...record,
        selector: match.variant.display,
        resolvedSelector: match.variant.resolved === match.variant.display
          ? undefined
          : match.variant.resolved,
        specificity: match.variant.specificity,
      });
    }
    return matched;
  });
}
