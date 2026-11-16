import type {
  PseudoElementSelector,
  SimulatedStyleState,
  StyleDeclarationSource,
  StyleElementReference,
  StylePropertySource,
  StyleVariableSource,
} from '../../shared-types';
import type { CssDeclaration, MatchedRule, RuleRecord } from './rules';
import { isPseudoElementGenerated, normalizePropName } from '../utils/computedStyles';
import { collectStyleRules, declarationSource, matchingRules, parseDeclarationBlock } from './rules';

const INHERITED_PROPERTIES = new Set([
  'border-collapse',
  'border-spacing',
  'caption-side',
  'color',
  'cursor',
  'direction',
  'empty-cells',
  'font',
  'font-family',
  'font-size',
  'font-size-adjust',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-weight',
  'font-feature-settings',
  'font-kerning',
  'font-language-override',
  'font-optical-sizing',
  'font-palette',
  'font-synthesis',
  'font-variation-settings',
  'letter-spacing',
  'line-height',
  'list-style',
  'list-style-image',
  'list-style-position',
  'list-style-type',
  'orphans',
  'overflow-wrap',
  'quotes',
  'ruby-align',
  'ruby-position',
  'tab-size',
  'text-align',
  'text-align-last',
  'text-emphasis',
  'text-emphasis-color',
  'text-emphasis-position',
  'text-emphasis-style',
  'text-indent',
  'text-justify',
  'text-shadow',
  'text-transform',
  'text-wrap',
  'visibility',
  'white-space',
  'widows',
  'word-break',
  'word-spacing',
  'writing-mode',
  'hyphens',
  'line-break',
  'paint-order',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'color-interpolation',
  'color-rendering',
  'shape-rendering',
  'text-rendering',
  'marker',
  'marker-end',
  'marker-mid',
  'marker-start',
]);

interface VariableSourceContext {
  element: Element
  pseudo?: PseudoElementSelector
}

interface VariableParticipant extends VariableSourceContext {
  name: string
}

interface AnalysisContext {
  states: SimulatedStyleState[]
  stateTarget: Element
  warnings: Set<string>
  incompleteCascade: boolean
  variableLookup: boolean
  variableStack: string[]
  resolutionStack: Array<{ name: string, element: Element, pseudo?: PseudoElementSelector }>
  variableSources: WeakMap<StylePropertySource, VariableSourceContext>
  rules: Map<Element, RuleRecord[]>
  matchedRules: Map<Element, Map<string, MatchedRule[]>>
  probe?: {
    iframe: HTMLIFrameElement
    document: Document
    view: Window
  }
}

interface DeclarationCandidate extends StyleDeclarationSource {
  rule: MatchedRule
  longhands: string[]
  conditionState: 'active' | 'inactive' | 'unknown'
}

export interface ElementStyleAnalysis {
  properties: StylePropertySource[]
  cleanup: () => void
}

export function styleElementReference(element: Element): StyleElementReference {
  return {
    devpilotId: element.getAttribute('data-devpilot-id') || undefined,
    tag: element.tagName.toLowerCase(),
    id: element.id || undefined,
    class: element.getAttribute('class') || undefined,
  };
}

function declarationsForRule(rule: MatchedRule): Array<{ declaration: CssDeclaration, mapped: boolean }> {
  if (rule.declarations) {
    return rule.declarations.map(declaration => ({ declaration, mapped: true }));
  }
  if (!rule.style.cssText) {
    return [];
  }
  try {
    return parseDeclarationBlock(rule.style.cssText).map(declaration => ({ declaration, mapped: false }));
  }
  catch {
    return [];
  }
}

function expandedProperties(document: Document, property: string, value = 'initial'): string[] {
  const normalized = normalizePropName(property.trim());
  if (normalized.startsWith('--')) {
    return [normalized];
  }
  const style = document.createElement('div').style;
  try {
    style.setProperty(normalized, value);
  }
  catch {
    return [normalized];
  }
  const properties = Array.from(style);
  return properties.length
    ? properties
    : [normalized];
}

function isInherited(property: string): boolean {
  return property.startsWith('--') || INHERITED_PROPERTIES.has(property);
}

function conditionState(rule: MatchedRule): 'active' | 'inactive' | 'unknown' {
  if (rule.conditions.some(condition => condition.state === 'inactive')) {
    return 'inactive';
  }
  if (rule.conditions.some(condition => condition.state === 'unknown')) {
    return 'unknown';
  }
  return 'active';
}

function compareSpecificity(a: MatchedRule, b: MatchedRule): number {
  const left = a.specificity ?? [0, 0, 0];
  const right = b.specificity ?? [0, 0, 0];
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function comparePrecedence(a: DeclarationCandidate, b: DeclarationCandidate): number {
  if (a.important !== b.important) {
    return a.important
      ? 1
      : -1;
  }
  if (a.origin !== b.origin) {
    return a.origin === 'inline'
      ? 1
      : -1;
  }

  const aLayer = a.rule.layerRank;
  const bLayer = b.rule.layerRank;
  if (aLayer !== bLayer) {
    if (aLayer === null) {
      return a.important
        ? -1
        : 1;
    }
    if (bLayer === null) {
      return b.important
        ? 1
        : -1;
    }
    return a.important
      ? bLayer - aLayer
      : aLayer - bLayer;
  }

  const specificity = compareSpecificity(a.rule, b.rule);
  if (specificity) {
    return specificity;
  }
  return a.rule.order - b.rule.order;
}

function formatSpecificity(specificity?: [number, number, number]): string {
  return specificity?.join(',') ?? '0,0,0';
}

function winningReason(winner: DeclarationCandidate, loser: DeclarationCandidate, property: string): string {
  let reason: string;
  if (winner.important !== loser.important) {
    reason = 'with !important';
  }
  else if (winner.origin !== loser.origin) {
    reason = winner.origin === 'inline'
      ? 'as an inline declaration'
      : 'as an author !important declaration';
  }
  else if (winner.rule.layerRank !== loser.rule.layerRank) {
    reason = winner.important
      ? `in earlier cascade layer "${winner.rule.layer ?? 'unlayered'}" for !important declarations`
      : `in later cascade layer "${winner.rule.layer ?? 'unlayered'}"`;
  }
  else if (compareSpecificity(winner.rule, loser.rule)) {
    reason = `with higher specificity (${formatSpecificity(winner.rule.specificity)} > ${formatSpecificity(loser.rule.specificity)})`;
  }
  else {
    reason = 'later in source order';
  }
  return `${property}: ${winner.selector} wins ${reason}`;
}

function selectWinner(candidates: DeclarationCandidate[]): DeclarationCandidate | undefined {
  const sorted = candidates.filter(candidate => candidate.conditionState === 'active').sort((a, b) => comparePrecedence(b, a));
  const revertedLayers = new Set<number>();
  const revertedUnlayeredOrigins = new Set<'inline' | 'author'>();

  for (const candidate of sorted) {
    const layer = candidate.rule.layerRank;
    const layerReverted = layer !== null && revertedLayers.has(layer);
    const unlayeredOriginReverted = layer === null && revertedUnlayeredOrigins.has(candidate.origin);
    if (layerReverted || unlayeredOriginReverted) {
      continue;
    }
    const value = candidate.value.trim().toLowerCase();
    if (value === 'revert') {
      return undefined;
    }
    if (value === 'revert-layer') {
      if (layer === null) {
        revertedUnlayeredOrigins.add(candidate.origin);
      }
      else {
        revertedLayers.add(layer);
      }
      continue;
    }
    return candidate;
  }
  return undefined;
}

interface VarReference {
  name: string
  fallback?: string
  start: number
  end: number
}

function varReferences(value: string): VarReference[] {
  const references: VarReference[] = [];
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '"' || value[index] === '\'') {
      const quote = value[index++];
      while (index < value.length && value[index] !== quote) {
        index += value[index] === '\\'
          ? 2
          : 1;
      }
      continue;
    }
    if (value.startsWith('/*', index)) {
      const commentEnd = value.indexOf('*/', index + 2);
      index = commentEnd < 0
        ? value.length
        : commentEnd + 1;
      continue;
    }
    if (!value.startsWith('var(', index)) {
      continue;
    }

    let depth = 1;
    let comma = -1;
    let end = index + 4;
    for (; end < value.length && depth; end++) {
      const character = value[end];
      if (character === '"' || character === '\'') {
        const quote = character;
        end++;
        while (end < value.length && value[end] !== quote) {
          end += value[end] === '\\'
            ? 2
            : 1;
        }
        continue;
      }
      if (value.startsWith('/*', end)) {
        const commentEnd = value.indexOf('*/', end + 2);
        end = commentEnd < 0
          ? value.length
          : commentEnd + 1;
        continue;
      }
      if (character === '(') {
        depth++;
      }
      else if (character === ')') {
        depth--;
      }
      else if (character === ',' && depth === 1 && comma < 0) {
        comma = end;
      }
    }
    if (depth) {
      break;
    }
    const name = value.slice(index + 4, comma < 0
      ? end - 1
      : comma).trim();
    if (name.startsWith('--')) {
      references.push({
        name,
        fallback: comma < 0
          ? undefined
          : value.slice(comma + 1, end - 1).trim(),
        start: index,
        end,
      });
    }
    index = end - 1;
  }
  return references;
}

function variableNames(value: string): string[] {
  return varReferences(value).map(reference => reference.name);
}

function dependencyNames(value: string): string[] {
  return varReferences(value).flatMap(reference => [
    reference.name,
    ...(reference.fallback === undefined
      ? []
      : dependencyNames(reference.fallback)),
  ]);
}

function analyzeVariables(
  value: string,
  element: Element,
  context: AnalysisContext,
  pseudo?: PseudoElementSelector,
): StyleVariableSource[] | undefined {
  const names = variableNames(value);
  if (!names.length) {
    return undefined;
  }
  return names.map((name) => {
    if (context.variableStack.includes(name) || context.variableStack.length >= 6) {
      return {
        name,
        declarations: [],
        note: context.variableStack.includes(name)
          ? 'Circular var() reference; tracing stopped.'
          : 'Maximum variable tracing depth reached.',
      };
    }
    context.variableStack.push(name);
    try {
      const result = analyzeProperty(element, name, context, pseudo);
      const ownWinner = result.declarations.find(declaration => declaration.status === 'applied' || declaration.status === 'partially-applied');
      const inheritedWinner = result.inheritedFrom?.declarations.find(declaration => declaration.status === 'applied' || declaration.status === 'partially-applied');
      const winner = ownWinner ?? inheritedWinner;
      return {
        name,
        value: winner?.value ?? result.computedValue ?? result.fallback?.value,
        element: ownWinner
          ? styleElementReference(element)
          : result.inheritedFrom?.element,
        declarations: ownWinner
          ? result.declarations
          : result.inheritedFrom?.declarations ?? [],
        variables: winner?.variables,
        note: winner
          ? undefined
          : result.notes?.join(' ') ?? 'No declaration found; a var() fallback or the guaranteed-invalid value may be used.',
      };
    }
    finally {
      context.variableStack.pop();
    }
  });
}

function createCandidates(
  matchedRules: MatchedRule[],
  document: Document,
  longhands: string[],
): DeclarationCandidate[] {
  const candidates: DeclarationCandidate[] = [];
  const requested = new Set(longhands);

  for (const rule of matchedRules) {
    const state = conditionState(rule);
    for (const { declaration, mapped } of declarationsForRule(rule)) {
      const property = normalizePropName(declaration.property);
      const affected = property === 'all'
        ? longhands.filter(longhand => !longhand.startsWith('--'))
        : expandedProperties(document, property, declaration.value).filter(longhand => requested.has(longhand));
      if (!affected.length) {
        continue;
      }
      candidates.push({
        selector: rule.selector,
        resolvedSelector: rule.resolvedSelector,
        property,
        value: declaration.value,
        important: declaration.important,
        origin: rule.origin,
        specificity: rule.specificity,
        layer: rule.layer,
        conditions: rule.conditions.length
          ? rule.conditions.map(condition => condition.text)
          : undefined,
        status: state === 'inactive'
          ? 'inactive'
          : state === 'unknown'
            ? 'unknown'
            : 'overridden',
        reason: state === 'inactive'
          ? `Inactive condition: ${rule.conditions.find(condition => condition.state === 'inactive')?.text}`
          : state === 'unknown'
            ? `Cannot evaluate condition without browser devtools protocol: ${rule.conditions.find(condition => condition.state === 'unknown')?.text}`
            : undefined,
        source: declarationSource(rule, mapped
          ? declaration
          : undefined),
        rule,
        longhands: affected,
        conditionState: state,
      });
    }
  }
  return candidates;
}

function parentElement(element: Element): Element | null {
  if (element.parentElement) {
    return element.parentElement;
  }
  const root = element.getRootNode();
  return root instanceof ShadowRoot
    ? root.host
    : null;
}

function probe(element: Element, context: AnalysisContext): Element {
  if (!context.probe) {
    const iframe = element.ownerDocument.createElement('iframe');
    iframe.dataset.devpilotStyleProbe = '';
    iframe.hidden = true;
    iframe.setAttribute('aria-hidden', 'true');
    element.ownerDocument.body.append(iframe);
    const probeDocument = iframe.contentDocument;
    const probeView = iframe.contentWindow;
    if (!probeDocument || !probeView) {
      iframe.remove();
      throw new Error('Could not create an empty document for browser-default style comparison');
    }
    context.probe = { iframe, document: probeDocument, view: probeView };
  }
  const clean = context.probe.document.createElement(element.localName);
  for (const attribute of ['type', 'disabled', 'hidden', 'open', 'multiple', 'size', 'dir', 'lang']) {
    const value = element.getAttribute(attribute);
    if (value !== null) {
      clean.setAttribute(attribute, value);
    }
  }
  return clean;
}

function fallbackFor(
  element: Element,
  property: string,
  computedValue: string | undefined,
  context: AnalysisContext,
  pseudo?: PseudoElementSelector,
): StylePropertySource['fallback'] {
  try {
    const clean = probe(element, context);
    context.probe!.document.body.append(clean);
    const cleanValue = context.probe!.view.getComputedStyle(clean, pseudo).getPropertyValue(property).trim();
    clean.remove();
    if (!context.states.length && computedValue !== cleanValue) {
      return {
        origin: 'unknown',
        value: computedValue,
        note: 'The computed value differs from a clean element, but no readable author declaration explains it. Animations, transitions, presentational hints, or unreadable stylesheets may be involved.',
      };
    }
    return {
      origin: 'user-agent',
      value: context.states.length
        ? cleanValue
        : computedValue,
      note: 'No readable author declaration applies. This matches the browser default and/or initial value; user-agent rules are not exposed through CSSOM.',
    };
  }
  catch (error) {
    return {
      origin: 'unknown',
      value: computedValue,
      note: error instanceof Error
        ? error.message
        : String(error),
    };
  }
}

interface VariableDeclaration {
  declaration: StyleDeclarationSource
  source: VariableSourceContext
}

interface ValueResolution {
  valid: boolean
  value?: string
  reason?: string
}

function lookupVariable(
  element: Element,
  name: string,
  context: AnalysisContext,
  pseudo?: PseudoElementSelector,
): VariableDeclaration | undefined {
  const previousLookup = context.variableLookup;
  context.variableLookup = true;
  let result: StylePropertySource;
  try {
    result = analyzeProperty(element, name, context, pseudo);
  }
  finally {
    context.variableLookup = previousLookup;
  }
  const own = result.declarations.find(declaration => declaration.status === 'applied' || declaration.status === 'partially-applied');
  const inherited = result.inheritedFrom?.declarations.find(declaration => declaration.status === 'applied' || declaration.status === 'partially-applied');
  const declaration = own && !['inherit', 'unset'].includes(own.value.trim().toLowerCase())
    ? own
    : inherited;
  if (!declaration) {
    return undefined;
  }
  return {
    declaration,
    source: context.variableSources.get(result) ?? { element, pseudo },
  };
}

function findVariableCycle(
  name: string,
  element: Element,
  context: AnalysisContext,
  pseudo?: PseudoElementSelector,
): Set<VariableParticipant> | undefined {
  const visited = new Map<string, Set<Element>>();
  const cycles = new Set<VariableParticipant>();
  const visit = (
    currentName: string,
    currentElement: Element,
    currentPseudo: PseudoElementSelector | undefined,
    path: Array<{ name: string, source: VariableSourceContext }>,
  ): void => {
    const cycleStart = path.findIndex(item =>
      item.name === currentName && item.source.element === currentElement && item.source.pseudo === currentPseudo,
    );
    if (cycleStart >= 0) {
      for (const item of path.slice(cycleStart)) {
        cycles.add({
          name: item.name,
          element: item.source.element,
          pseudo: item.source.pseudo,
        });
      }
      return;
    }
    const key = `${currentPseudo ?? ''}:${currentName}`;
    const visitedElements = visited.get(key) ?? new Set<Element>();
    if (visitedElements.has(currentElement)) {
      return;
    }
    visitedElements.add(currentElement);
    visited.set(key, visitedElements);

    const variable = lookupVariable(currentElement, currentName, context, currentPseudo);
    if (!variable) {
      return;
    }
    const nextPath = [...path, { name: currentName, source: variable.source }];
    for (const dependency of dependencyNames(variable.declaration.value)) {
      visit(dependency, variable.source.element, variable.source.pseudo, nextPath);
    }
  };
  visit(name, element, pseudo, []);
  return cycles.size
    ? cycles
    : undefined;
}

function resolveVariable(
  element: Element,
  name: string,
  context: AnalysisContext,
  pseudo?: PseudoElementSelector,
): ValueResolution {
  if (context.resolutionStack.some(item => item.name === name && item.element === element && item.pseudo === pseudo)) {
    return { valid: false, reason: `circular var() reference involving ${name}` };
  }
  context.resolutionStack.push({ name, element, pseudo });
  try {
    const variable = lookupVariable(element, name, context, pseudo);
    if (!variable || variable.declaration.value.trim().toLowerCase() === 'initial') {
      return { valid: false, reason: `var(${name}) has no usable value or fallback` };
    }
    const cycle = findVariableCycle(name, element, context, pseudo);
    const participatesInCycle = [...(cycle ?? [])].some(item =>
      item.name === name && item.element === variable.source.element && item.pseudo === variable.source.pseudo,
    );
    if (participatesInCycle) {
      const participants = [...(cycle ?? [])].map(item => item.name).join(', ');
      return { valid: false, reason: `circular var() reference involving ${participants}` };
    }
    return resolveValue(variable.declaration.value, variable.source.element, context, variable.source.pseudo);
  }
  finally {
    context.resolutionStack.pop();
  }
}

function resolveValue(
  value: string,
  element: Element,
  context: AnalysisContext,
  pseudo?: PseudoElementSelector,
): ValueResolution {
  let resolved = '';
  let cursor = 0;
  for (const reference of varReferences(value)) {
    resolved += value.slice(cursor, reference.start);
    let replacement = resolveVariable(element, reference.name, context, pseudo);
    if (!replacement.valid && reference.fallback !== undefined) {
      replacement = resolveValue(reference.fallback, element, context, pseudo);
    }
    if (!replacement.valid) {
      return {
        valid: false,
        reason: replacement.reason ?? `var(${reference.name}) has no usable value or fallback`,
      };
    }
    resolved += replacement.value;
    cursor = reference.end;
  }
  return { valid: true, value: resolved + value.slice(cursor) };
}

function analyzeProperty(
  element: Element,
  requestedProperty: string,
  context: AnalysisContext,
  pseudo?: PseudoElementSelector,
): StylePropertySource {
  const property = normalizePropName(requestedProperty.trim());
  const view = element.ownerDocument.defaultView ?? window;
  if (!property.startsWith('--') && !CSS.supports(property, 'initial')) {
    return {
      property: requestedProperty,
      computedValue: context.states.length
        ? undefined
        : '',
      declarations: [],
      fallback: {
        origin: 'unknown',
        value: '',
        note: `"${requestedProperty}" is not a recognized CSS property.`,
      },
      notes: [`"${requestedProperty}" is not a recognized CSS property.`],
    };
  }
  if (pseudo && !context.states.length && !isPseudoElementGenerated(element, pseudo)) {
    return {
      property: requestedProperty,
      computedValue: '',
      declarations: [],
      notes: [`${pseudo} not found on this element`],
    };
  }
  const computedValue = context.states.length
    ? undefined
    : view.getComputedStyle(element, pseudo).getPropertyValue(property).trim();
  const longhands = expandedProperties(element.ownerDocument, property);
  let records = context.rules.get(element);
  if (!records) {
    records = collectStyleRules(element, context.warnings, () => {
      context.incompleteCascade = true;
    });
    context.rules.set(element, records);
  }
  const pseudoKey = pseudo ?? '';
  let matchedByPseudo = context.matchedRules.get(element);
  if (!matchedByPseudo) {
    matchedByPseudo = new Map();
    context.matchedRules.set(element, matchedByPseudo);
  }
  let matchedRules = matchedByPseudo.get(pseudoKey);
  if (!matchedRules) {
    matchedRules = matchingRules(records, element, context.states, pseudo, context.stateTarget);
    matchedByPseudo.set(pseudoKey, matchedRules);
  }
  const candidates = createCandidates(matchedRules, element.ownerDocument, longhands);
  const winners = new Map<string, DeclarationCandidate>();

  for (const longhand of longhands) {
    const winner = selectWinner(candidates.filter(candidate => candidate.longhands.includes(longhand)));
    if (winner) {
      winners.set(longhand, winner);
    }
  }

  for (const candidate of candidates) {
    if (candidate.conditionState !== 'active') {
      continue;
    }
    const invalidProperties: string[] = [];
    candidate.invalidProperties = invalidProperties;
    const shouldValidate = !context.variableLookup && candidate.longhands.some(longhand =>
      winners.get(longhand) === candidate,
    );
    const resolution = shouldValidate
      ? resolveValue(candidate.value, element, context, pseudo)
      : undefined;
    let grammarValid = true;
    if (resolution?.valid && !candidate.property.startsWith('--')) {
      try {
        grammarValid = CSS.supports(candidate.property, resolution.value ?? '');
      }
      catch {
        grammarValid = false;
      }
    }
    if (resolution?.valid && candidate.property.startsWith('--') && resolution.value?.trim().toLowerCase() === 'initial') {
      grammarValid = false;
    }
    const valid = !shouldValidate || (resolution?.valid && grammarValid);
    const invalidReason = valid
      ? undefined
      : resolution?.reason ?? `"${resolution?.value ?? candidate.value}" is not valid for ${candidate.property}`;
    for (const longhand of candidate.longhands) {
      if (winners.get(longhand) === candidate && !valid) {
        winners.delete(longhand);
        invalidProperties.push(longhand);
      }
    }
    candidate.appliedProperties = candidate.longhands.filter(longhand => winners.get(longhand) === candidate);
    candidate.overriddenProperties = candidate.longhands.filter(longhand =>
      winners.get(longhand) !== candidate && !invalidProperties.includes(longhand),
    );
    candidate.status = candidate.appliedProperties.length === longhands.length
      ? 'applied'
      : candidate.appliedProperties.length
        ? 'partially-applied'
        : invalidProperties.length
          ? 'invalid'
          : 'overridden';
    if (invalidReason) {
      candidate.reason = `Invalid at computed-value time: ${invalidReason}`;
      continue;
    }
    const overridden = candidate.overriddenProperties[0];
    const winner = overridden
      ? winners.get(overridden)
      : undefined;
    if (overridden && winner && winner !== candidate) {
      candidate.reason = winningReason(winner, candidate, overridden);
    }
  }

  candidates.sort((a, b) => {
    const rank = (candidate: DeclarationCandidate) => candidate.conditionState === 'active'
      ? 0
      : candidate.conditionState === 'unknown'
        ? 1
        : 2;
    return rank(a) - rank(b) || comparePrecedence(b, a) || a.rule.order - b.rule.order;
  });

  const ownWinner = candidates.find(candidate => candidate.status === 'applied' || candidate.status === 'partially-applied');
  if (ownWinner && !context.variableLookup) {
    for (const candidate of candidates) {
      if (candidate.appliedProperties?.length) {
        candidate.variables = analyzeVariables(candidate.value, element, context, pseudo);
      }
    }
  }

  // Re-map after adding variable traces; the public objects intentionally omit internal fields.
  const publicDeclarations = candidates.map(({
    rule: _rule,
    longhands: _longhands,
    conditionState: _conditionState,
    ...declaration
  }) => declaration);
  const invalidCustomProperty = property.startsWith('--') && candidates.some(candidate => candidate.invalidProperties?.length);
  const needsParent = longhands.some((longhand) => {
    const winner = winners.get(longhand);
    if (!winner) {
      return isInherited(longhand);
    }
    const value = winner.value.trim().toLowerCase();
    return value === 'inherit' || (value === 'unset' && isInherited(longhand));
  });
  const unknownCandidate = candidates.some(candidate => candidate.conditionState === 'unknown');
  const result: StylePropertySource = {
    property: requestedProperty,
    computedValue,
    declarations: publicDeclarations,
  };
  if (ownWinner) {
    context.variableSources.set(result, { element, pseudo });
  }

  if (!invalidCustomProperty && (needsParent || (!ownWinner && isInherited(property)))) {
    const inheritanceElement = pseudo
      ? element
      : parentElement(element);
    if (inheritanceElement) {
      const inherited = analyzeProperty(inheritanceElement, requestedProperty, { ...context, variableStack: [] });
      const inheritedWinner = inherited.declarations.some(declaration =>
        declaration.status === 'applied' || declaration.status === 'partially-applied',
      );
      if (inheritedWinner) {
        result.inheritedFrom = {
          element: styleElementReference(inheritanceElement),
          declarations: inherited.declarations,
        };
      }
      else if (inherited.inheritedFrom) {
        result.inheritedFrom = inherited.inheritedFrom;
      }
      else if (!inherited.fallback && inherited.declarations.length) {
        result.inheritedFrom = {
          element: styleElementReference(inheritanceElement),
          declarations: inherited.declarations,
        };
      }
      const inheritedSource = context.variableSources.get(inherited);
      if (inheritedSource) {
        context.variableSources.set(result, inheritedSource);
      }
    }
  }

  if (invalidCustomProperty) {
    result.fallback = {
      origin: 'unknown',
      value: '',
      note: 'The custom property is guaranteed-invalid and does not inherit a replacement value.',
    };
  }
  else if (!context.variableLookup && !ownWinner && !result.inheritedFrom) {
    result.fallback = fallbackFor(element, property, computedValue, context, pseudo);
  }

  const notes: string[] = [];
  if (invalidCustomProperty) {
    notes.push('The winning custom property declaration is invalid at computed-value time; its value is guaranteed-invalid.');
  }
  if (context.incompleteCascade) {
    notes.push('Some stylesheets could not be read; applied and overridden statuses are provisional.');
  }
  if (unknownCandidate) {
    notes.push('Conditional rules with unknown activity were not used to choose a winner; other applied/overridden statuses are provisional.');
    if (result.inheritedFrom) {
      notes.push('The inherited source is provisional because a local conditional rule may apply.');
    }
  }
  if (notes.length) {
    result.notes = notes;
  }
  return result;
}

export function analyzeElementStyles(
  element: Element,
  properties: string[],
  states: SimulatedStyleState[],
  warnings: Set<string>,
  pseudo?: PseudoElementSelector,
): ElementStyleAnalysis {
  const context: AnalysisContext = {
    states,
    stateTarget: element,
    warnings,
    incompleteCascade: false,
    variableLookup: false,
    variableStack: [],
    resolutionStack: [],
    variableSources: new WeakMap(),
    rules: new Map(),
    matchedRules: new Map(),
  };
  try {
    return {
      properties: properties.map(property => analyzeProperty(element, property, context, pseudo)),
      cleanup: () => context.probe?.iframe.remove(),
    };
  }
  catch (error) {
    context.probe?.iframe.remove();
    throw error;
  }
}
