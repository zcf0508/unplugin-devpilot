import type { GetStyleSourcesOptions, StyleSourcesResult, StyleStateSources } from '../shared-types';
import { analyzeElementStyles, styleElementReference } from './styleSources/cascade';
import { generateSelectorNotFoundError, resolveElementsBySelector } from './utils/resolveSelector';

export async function getStyleSources(
  selector: string,
  options: GetStyleSourcesOptions,
): Promise<StyleSourcesResult> {
  try {
    const elements = resolveElementsBySelector(selector);
    if (!elements.length) {
      return {
        success: false,
        selector,
        error: generateSelectorNotFoundError(selector),
      };
    }

    const properties = [...new Set(options.properties.map(property => property.trim()).filter(Boolean))];
    if (!properties.length) {
      return {
        success: false,
        selector,
        error: 'At least one CSS property is required. For example: ["border"] or ["color", "background-color"].',
      };
    }

    const states = [...new Set(options.states ?? [])];
    const warnings = new Set<string>();
    const results = elements.map((element) => {
      const defaultAnalysis = analyzeElementStyles(element, properties, [], warnings, options.pseudo);
      const stateResults: StyleStateSources[] = [{
        states: [],
        simulated: false,
        properties: defaultAnalysis.properties,
      }];
      defaultAnalysis.cleanup();

      if (states.length) {
        const simulatedAnalysis = analyzeElementStyles(element, properties, states, warnings, options.pseudo);
        stateResults.push({
          states,
          simulated: true,
          properties: simulatedAnalysis.properties,
        });
        simulatedAnalysis.cleanup();
      }

      return {
        element: styleElementReference(element),
        states: stateResults,
      };
    });

    return {
      success: true,
      selector,
      elements: results,
      warnings: warnings.size
        ? [...warnings]
        : undefined,
    };
  }
  catch (error) {
    return {
      success: false,
      selector,
      error: error instanceof Error
        ? error.message
        : String(error),
    };
  }
}
