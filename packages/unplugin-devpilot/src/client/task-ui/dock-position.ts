export type DockEdge = 'left' | 'right' | 'top' | 'bottom';

export interface DockSize {
  width: number
  height: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface DockPosition {
  x: number
  y: number
  edge: DockEdge
}

export interface TaskPanelPosition {
  x: number
  y: number
  width: number
  maxHeight: number
}

const DOCK_MARGIN = 2;
const PANEL_MARGIN = 16;
const PANEL_GAP = 12;
const PANEL_MAX_WIDTH = 380;
const PANEL_MAX_HEIGHT = 440;
const EDGE_BAND = 70;

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

export function clampDockPoint(
  point: Pick<DockPosition, 'x' | 'y'>,
  dock: DockSize,
  viewport: ViewportSize,
): Pick<DockPosition, 'x' | 'y'> {
  const halfWidth = dock.width / 2;
  const halfHeight = dock.height / 2;
  return {
    x: clamp(point.x, DOCK_MARGIN + halfWidth, viewport.width - halfWidth - DOCK_MARGIN),
    y: clamp(point.y, DOCK_MARGIN + halfHeight, viewport.height - halfHeight - DOCK_MARGIN),
  };
}

export function getDefaultDockPosition(
  viewport: ViewportSize,
  dock: DockSize,
): DockPosition {
  return {
    x: clamp(viewport.width / 2, DOCK_MARGIN + dock.width / 2, viewport.width - dock.width / 2 - DOCK_MARGIN),
    y: clamp(viewport.height - dock.height / 2 - DOCK_MARGIN, DOCK_MARGIN, viewport.height),
    edge: 'bottom',
  };
}

export function getNearestDockEdge(
  point: Pick<DockPosition, 'x' | 'y'>,
  dock: DockSize,
  viewport: ViewportSize,
): DockEdge {
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  const deg = Math.atan2(point.y - centerY, point.x - centerX);
  const topLeft = Math.atan2(EDGE_BAND - centerY, 0 - centerX);
  const topRight = Math.atan2(EDGE_BAND - centerY, viewport.width - centerX);
  const bottomLeft = Math.atan2(viewport.height - EDGE_BAND - centerY, 0 - centerX);
  const bottomRight = Math.atan2(viewport.height - EDGE_BAND - centerY, viewport.width - centerX);

  if (deg >= topLeft && deg <= topRight) {
    return 'top';
  }
  if (deg >= topRight && deg <= bottomRight) {
    return 'right';
  }
  if (deg >= bottomRight && deg <= bottomLeft) {
    return 'bottom';
  }
  return 'left';
}

export function snapDockPosition(
  point: Pick<DockPosition, 'x' | 'y'>,
  dock: DockSize,
  viewport: ViewportSize,
  edge: DockEdge = getNearestDockEdge(point, dock, viewport),
): DockPosition {
  const free = clampDockPoint(point, dock, viewport);
  const halfWidth = dock.width / 2;
  const halfHeight = dock.height / 2;
  if (edge === 'left') {
    return {
      x: DOCK_MARGIN + halfHeight,
      y: clamp(point.y, DOCK_MARGIN + halfWidth, viewport.height - halfWidth - DOCK_MARGIN),
      edge,
    };
  }
  if (edge === 'right') {
    return {
      x: clamp(viewport.width - halfHeight - DOCK_MARGIN, DOCK_MARGIN, viewport.width),
      y: clamp(point.y, DOCK_MARGIN + halfWidth, viewport.height - halfWidth - DOCK_MARGIN),
      edge,
    };
  }
  if (edge === 'top') {
    return { x: free.x, y: DOCK_MARGIN + halfHeight, edge };
  }
  return {
    x: free.x,
    y: clamp(viewport.height - halfHeight - DOCK_MARGIN, DOCK_MARGIN, viewport.height),
    edge,
  };
}

export function clampDockPosition(
  position: DockPosition,
  dock: DockSize,
  viewport: ViewportSize,
): DockPosition {
  return snapDockPosition(position, dock, viewport, position.edge);
}

export function getTaskPanelPosition(
  dockPosition: DockPosition,
  dock: DockSize,
  viewport: ViewportSize,
): TaskPanelPosition {
  const width = Math.min(PANEL_MAX_WIDTH, Math.max(0, viewport.width - PANEL_MARGIN * 2));
  const maxHeight = Math.min(PANEL_MAX_HEIGHT, Math.max(0, viewport.height * 0.5));
  const maxX = viewport.width - width - PANEL_MARGIN;
  const maxY = viewport.height - maxHeight - PANEL_MARGIN;

  if (dockPosition.edge === 'left') {
    return {
      x: clamp(dockPosition.x + dock.height / 2 + PANEL_GAP, PANEL_MARGIN, maxX),
      y: clamp(dockPosition.y - maxHeight / 2, PANEL_MARGIN, maxY),
      width,
      maxHeight,
    };
  }
  if (dockPosition.edge === 'right') {
    return {
      x: clamp(dockPosition.x - dock.height / 2 - PANEL_GAP - width, PANEL_MARGIN, maxX),
      y: clamp(dockPosition.y - maxHeight / 2, PANEL_MARGIN, maxY),
      width,
      maxHeight,
    };
  }
  if (dockPosition.edge === 'top') {
    return {
      x: clamp(dockPosition.x - width / 2, PANEL_MARGIN, maxX),
      y: clamp(dockPosition.y + dock.height / 2 + PANEL_GAP, PANEL_MARGIN, maxY),
      width,
      maxHeight,
    };
  }
  return {
    x: clamp(dockPosition.x - width / 2, PANEL_MARGIN, maxX),
    y: clamp(dockPosition.y - dock.height / 2 - PANEL_GAP - maxHeight, PANEL_MARGIN, maxY),
    width,
    maxHeight,
  };
}
