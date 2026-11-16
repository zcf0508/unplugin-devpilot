import type { Selector } from 'postcss-selector-parser';
import type { PseudoElementSelector, SimulatedStyleState } from '../../shared-types';
import { compare, selectorSpecificity } from '@csstools/selector-specificity';
import parser from 'postcss-selector-parser';

const STATE_ATTRIBUTE = 'data-devpilot-simulated-state';
const HOST_ATTRIBUTE = 'data-devpilot-style-host';
const ANCESTOR_STATES = new Set<SimulatedStyleState>(['hover', 'focus-within', 'active']);
const STATE_SELECTORS = new Set<SimulatedStyleState>(['hover', 'focus', 'focus-visible', 'focus-within', 'active']);

function effectiveStates(states: SimulatedStyleState[]): SimulatedStyleState[] {
  const expanded = new Set(states);
  if (expanded.has('focus-visible')) {
    expanded.add('focus');
  }
  if (expanded.has('focus')) {
    expanded.add('focus-within');
  }
  return [...expanded];
}

export interface SelectorVariant {
  display: string
  resolved: string
  nestSelector: string
  specificity: [number, number, number]
}

export interface SelectorMatch {
  variant: SelectorVariant
}

function toVariant(
  ast: Selector,
  display: string,
  specificityAst = ast,
  nestSelector = ast.toString(),
): SelectorVariant {
  const specificity = selectorSpecificity(specificityAst);
  return {
    display,
    resolved: ast.toString().trim(),
    nestSelector: nestSelector.trim(),
    specificity: [specificity.a, specificity.b, specificity.c],
  };
}

function resolveNestedSelector(selector: Selector, parent: string): Selector {
  let hasNesting = false;
  const resolved = selector.clone();
  resolved.walkNesting((node) => {
    hasNesting = true;
    node.replaceWith(firstSelectorNode(`:is(${parent})`));
  });
  return hasNesting
    ? resolved
    : parser().astSync(`:is(${parent}) ${selector.toString()}`).first as Selector;
}

export function parseSelectorVariants(selectorText: string, parents?: SelectorVariant[]): SelectorVariant[] {
  const root = parser().astSync(selectorText);
  const selectors = root.nodes.filter((node): node is Selector => node.type === 'selector');

  if (!parents?.length) {
    return selectors.map(selector => toVariant(selector, selector.toString().trim(), selector, root.toString()));
  }

  const parentNestSelector = parents[0].nestSelector;
  const nestSelector = selectors.map(selector => resolveNestedSelector(selector, parentNestSelector).toString()).join(',');
  const variants: SelectorVariant[] = [];
  for (const parent of parents) {
    for (const selector of selectors) {
      variants.push(toVariant(
        resolveNestedSelector(selector, parent.resolved),
        selector.toString().trim(),
        resolveNestedSelector(selector, parentNestSelector),
        nestSelector,
      ));
    }
  }
  return variants;
}

function firstSelectorNode(value: string) {
  const selector = parser().astSync(value).first as Selector;
  const node = selector.first;
  if (!node) {
    throw new Error(`Expected a selector node in ${value}`);
  }
  return node;
}

function stateAttribute(state: SimulatedStyleState) {
  return firstSelectorNode(`[${STATE_ATTRIBUTE}~="${state}"]`);
}

function prepareMatchTargets(element: Element, states: SimulatedStyleState[]): () => void {
  const previous: Array<{ target: Element, name: string, value: string | null }> = [];
  const setAttribute = (target: Element, name: string, value: string) => {
    if (!previous.some(item => item.target === target && item.name === name)) {
      previous.push({ target, name, value: target.getAttribute(name) });
    }
    target.setAttribute(name, value);
  };

  if (states.length) {
    setAttribute(element, STATE_ATTRIBUTE, states.join(' '));
    const ancestorStates = states.filter(state => ANCESTOR_STATES.has(state));
    if (ancestorStates.length) {
      let current = element.parentElement;
      while (current) {
        setAttribute(current, STATE_ATTRIBUTE, ancestorStates.join(' '));
        current = current.parentElement;
      }
      const root = element.getRootNode();
      if (root instanceof ShadowRoot) {
        setAttribute(root.host, STATE_ATTRIBUTE, ancestorStates.join(' '));
      }
    }
  }

  const root = element.getRootNode();
  if (root instanceof ShadowRoot) {
    setAttribute(root.host, HOST_ATTRIBUTE, '');
  }

  return () => {
    for (const { target, name, value } of previous) {
      if (value === null) {
        target.removeAttribute(name);
      }
      else {
        target.setAttribute(name, value);
      }
    }
  };
}

function selectorForMatch(
  variant: SelectorVariant,
  states: SimulatedStyleState[],
  pseudo?: PseudoElementSelector,
): string | null {
  const root = parser().astSync(variant.resolved);
  let supported = true;
  let hasRequestedPseudo = false;

  root.walkPseudos((node) => {
    if (!supported) {
      return;
    }
    const value = node.value.toLowerCase();
    const isPseudoElement: boolean = parser.isPseudoElement(node);
    if (isPseudoElement) {
      const canonicalPseudo = value === ':before' || value === ':after'
        ? `:${value}`
        : value;
      if (pseudo && canonicalPseudo === pseudo) {
        hasRequestedPseudo = true;
        node.remove();
      }
      else {
        supported = false;
      }
      return;
    }
    const state = value.slice(1) as SimulatedStyleState;
    if (states.length && STATE_SELECTORS.has(state)) {
      node.replaceWith(stateAttribute(state));
      return;
    }
    if (value === ':host') {
      if (node.nodes?.length) {
        node.replaceWith(firstSelectorNode(`:is([${HOST_ATTRIBUTE}]${node.nodes.toString()})`));
      }
      else {
        node.replaceWith(firstSelectorNode(`[${HOST_ATTRIBUTE}]`));
      }
      return;
    }
    if (value === ':host-context') {
      supported = false;
    }
  });

  if (!supported || (pseudo && !hasRequestedPseudo)) {
    return null;
  }
  return root.toString().trim() || '*';
}

export function withMatchTargets<T>(element: Element, states: SimulatedStyleState[], callback: () => T): T {
  const restore = prepareMatchTargets(element, effectiveStates(states));
  try {
    return callback();
  }
  finally {
    restore();
  }
}

export function matchSelector(
  element: Element,
  variants: SelectorVariant[],
  states: SimulatedStyleState[],
  pseudo?: PseudoElementSelector,
  stateTarget = element,
  targetsPrepared = false,
): SelectorMatch | null {
  const matchedStates = effectiveStates(states);
  const restore = targetsPrepared
    ? () => {}
    : prepareMatchTargets(stateTarget, matchedStates);
  try {
    const matches: SelectorMatch[] = [];
    for (const variant of variants) {
      const matchedSelector = selectorForMatch(variant, matchedStates, pseudo);
      if (!matchedSelector) {
        continue;
      }
      try {
        if (element.matches(matchedSelector)) {
          matches.push({ variant });
        }
      }
      catch {
        // Browser-specific selectors can be present in CSSOM but rejected by matches().
      }
    }
    matches.sort((a, b) => compare(
      { a: b.variant.specificity[0], b: b.variant.specificity[1], c: b.variant.specificity[2] },
      { a: a.variant.specificity[0], b: a.variant.specificity[1], c: a.variant.specificity[2] },
    ));
    return matches[0] ?? null;
  }
  finally {
    restore();
  }
}
