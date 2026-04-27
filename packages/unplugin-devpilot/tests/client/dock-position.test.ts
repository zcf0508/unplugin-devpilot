import { describe, expect, it } from 'vitest';
import {
  clampDockPosition,
  getDefaultDockPosition,
  getNearestDockEdge,
  getTaskPanelPosition,
  snapDockPosition,
} from '../../src/client/task-ui/dock-position';

const dock = { width: 160, height: 42 };
const viewport = { width: 800, height: 600 };

describe('dock positioning', () => {
  it('defaults to the bottom edge', () => {
    expect(getDefaultDockPosition(viewport, dock)).toMatchInlineSnapshot(`
      {
        "edge": "bottom",
        "x": 400,
        "y": 577,
      }
    `);
  });

  it('chooses the nearest edge from the dock center', () => {
    expect(getNearestDockEdge({ x: 20, y: 240 }, dock, viewport)).toMatchInlineSnapshot('"left"');
    expect(getNearestDockEdge({ x: 340, y: 12 }, dock, viewport)).toMatchInlineSnapshot('"top"');
  });

  it('snaps to the selected edge and clamps along the other axis', () => {
    expect(snapDockPosition({ x: 500, y: 900 }, dock, viewport, 'right')).toMatchInlineSnapshot(`
      {
        "edge": "right",
        "x": 777,
        "y": 518,
      }
    `);
    expect(clampDockPosition({ x: -100, y: -100, edge: 'top' }, dock, viewport)).toMatchInlineSnapshot(`
      {
        "edge": "top",
        "x": 82,
        "y": 23,
      }
    `);
  });

  it('places the task panel away from the dock edge', () => {
    expect(getTaskPanelPosition({ x: 632, y: 420, edge: 'right' }, dock, viewport)).toMatchInlineSnapshot(`
      {
        "maxHeight": 300,
        "width": 380,
        "x": 219,
        "y": 270,
      }
    `);
  });
});
