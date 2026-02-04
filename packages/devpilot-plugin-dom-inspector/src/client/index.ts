import type { DomInspectorRpc, GetLayoutResult } from '../shared-types';
import { omit } from 'es-toolkit/compat';
import { defineRpcHandlers } from 'unplugin-devpilot/client';
import { clickElementById } from './clickElementById';
import { getCompactSnapshot } from './getCompactSnapshot';
import { getDOMTree } from './getDOMTree';
import { getElementInfoById } from './getElementInfoById';
import { getLayout } from './getLayout';
import { getLogs } from './getLogs';
import { inputTextById } from './inputTextById';
import { querySelector } from './querySelector';

export const rpcHandlers: DomInspectorRpc = defineRpcHandlers<DomInspectorRpc>({
  // Compact snapshot - agent-browser style format
  getCompactSnapshot: async (maxDepth?: number) => {
    return omit(await getCompactSnapshot(maxDepth), 'snapshot');
  },

  // Click element by ID
  clickElementById,

  // Input text by ID
  inputTextById,

  // Get element info by ID
  getElementInfoById,

  querySelector,

  getDOMTree,

  getLogs,

  // Get layout hierarchy based on visual coverage
  getLayout: async (
    options?: { id?: string, maxDepth?: number },
  ): Promise<Omit<GetLayoutResult, 'layout'>> => {
    return omit(await getLayout(options), 'layout');
  },
});
